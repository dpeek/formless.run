import { setKeyedDefinition } from "../test/schema-definition-test-helpers.ts";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { AppSchema } from "@dpeek/formless-schema";
import { INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID } from "@dpeek/formless-instance-control-plane";
import type {
  BootstrapResponse,
  PublicOperationResponse,
  SchemaResponse,
  SchemaUpdateResponse,
} from "../shared/protocol.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import type { SitePageTreeResponse } from "@dpeek/formless-site-app";
import {
  recordOperationRequest,
  operationWriteRequest,
  restoreTestStorageSnapshot,
  schemaAppTestStorageSnapshot,
} from "../test/authority-write.ts";
import {
  emailStylePublicIntakeFormBlockId,
  emailStylePublicIntakeFormBlockValues,
  emailStylePublicIntakeInput,
  emailStylePublicIntakeOperationKey,
  schemaWithEmailStylePublicIntake,
} from "../test/public-intake-schema.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;
type DispatchFetchInit = Parameters<Harness["mf"]["dispatchFetch"]>[1];
type TurnstileVerifyRequest = {
  idempotency_key?: unknown;
  response?: unknown;
  secret?: unknown;
};

const adminToken = "test-admin-token";
const turnstileSiteKey = "test-turnstile-site-key";
const turnstileSecret = "test-turnstile-secret";
const mappedHost = "subscribe.example.com";
const installId = "personal";
const defaultSiteInstallId = "site";
const recordPlanInstallId = "public-intake";

let harness: Harness;
let mappedHarness: Harness;
let turnstileRequests: TurnstileVerifyRequest[];

beforeAll(async () => {
  harness = await createPublicOperationWorkerHarness({
    bindings: {
      FORMLESS_ADMIN_TOKEN: adminToken,
      FORMLESS_TURNSTILE_SITE_KEY: turnstileSiteKey,
      FORMLESS_TURNSTILE_SECRET_KEY: turnstileSecret,
    },
    turnstileVerify: turnstileVerifyResponse,
  });
  mappedHarness = await createPublicOperationWorkerHarness({
    bindings: {
      FORMLESS_ADMIN_TOKEN: adminToken,
      FORMLESS_RUNTIME_PROFILE: "instance",
      FORMLESS_TURNSTILE_SECRET_KEY: turnstileSecret,
    },
    turnstileVerify: turnstileVerifyResponse,
  });
});

beforeEach(async () => {
  turnstileRequests = [];

  await resetSchemaApp("tasks");
  await resetSchemaApp("site");
  await resetInstalledApp("site", installId);
});

afterAll(async () => {
  await harness.dispose();
  await mappedHarness.dispose();
});

describe("public operation runtime", () => {
  it("executes schema-key public subscribe operations without opening generic writes", async () => {
    const before = await getJson<BootstrapResponse>("/api/site/bootstrap");
    const retiredRecordWriteRoute = await harness.fetch("/api/site/mutations", {
      body: "{}",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const retiredCommandRoute = await harness.fetch("/api/site/actions", {
      body: "{}",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const unavailable = await postPublicOperation(
      "/api/tasks/public/operations/task/clearCompletedTasks",
      publicSubscribeBody({ idempotencyKey: "not-public" }),
    );
    const accepted = await postPublicOperation(
      "/api/site/public/operations/subscription/subscribe",
      publicSubscribeBody({ idempotencyKey: "schema-key-exec" }),
    );
    const after = await getJson<BootstrapResponse>("/api/site/bootstrap");
    const records = contactSubscriptionRecords(after.records);

    expect(retiredRecordWriteRoute.status).toBe(401);
    expect(retiredCommandRoute.status).toBe(401);
    expect(unavailable.status).toBe(404);
    expect(accepted.status).toBe(200);
    expect(after.records.length).toBe(before.records.length + 4);
    expect(records.contacts).toHaveLength(1);
    expect(records.emailAddresses).toHaveLength(1);
    expect(records.audiences).toHaveLength(1);
    expect(records.subscriptions).toHaveLength(1);
    expect(records.contacts[0]?.values).toEqual({
      label: "ada@example.com",
    });
    expect(records.emailAddresses[0]?.values).toEqual({
      contact: records.contacts[0]?.id,
      address: "ada@example.com",
      normalizedAddress: "ada@example.com",
    });
    expect(records.audiences[0]?.values).toEqual({
      key: "default",
      label: "Default audience",
    });
    expect(records.subscriptions[0]?.values).toMatchObject({
      emailAddress: records.emailAddresses[0]?.id,
      audience: records.audiences[0]?.id,
      status: "subscribed",
      sourceKind: "publicOperation",
      sourceTargetKind: "schemaKey",
      sourcePackageAppKey: "site",
      sourceSchemaKey: "site",
      sourceApiRoutePrefix: "/api/site",
      sourceOperationKey: "subscription.subscribe",
      sourceHost: "example.com",
      sourcePath: "/api/site/public/operations/subscription/subscribe",
      sourceSiteBlockId: "rec_site_subscribe_form",
    });
    expect(records.subscriptions[0]?.values.consentedAt).toEqual(expect.any(String));
    expect(records.subscriptions[0]?.values).not.toHaveProperty("sourceIp");
    expect(records.subscriptions[0]?.values).not.toHaveProperty("sourceUserAgent");
    expectTurnstileRequests(turnstileRequests, [
      {
        secret: turnstileSecret,
        response: "token-ok",
      },
    ]);
  });

  it("supports installed app public operation routes with accepted replay idempotency", async () => {
    const first = await postPublicOperation(
      `/api/app-installs/site/${installId}/public/operations/subscription/subscribe`,
      publicSubscribeBody({ idempotencyKey: "installed-replay" }),
    );
    const replay = await postPublicOperation(
      `/api/app-installs/site/${installId}/public/operations/subscription/subscribe`,
      publicSubscribeBody({ idempotencyKey: "installed-replay", token: "token-replay" }),
    );
    const after = await getJson<BootstrapResponse>(`/api/app-installs/site/${installId}/bootstrap`);
    const records = contactSubscriptionRecords(after.records);

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(records.emailAddresses).toHaveLength(1);
    expect(records.subscriptions).toHaveLength(1);
    expect(records.subscriptions[0]?.values).toMatchObject({
      sourceTargetKind: "appInstall",
      sourceInstallId: installId,
      sourceApiRoutePrefix: `/api/app-installs/site/${installId}`,
    });
    expectTurnstileRequests(turnstileRequests, [
      {
        secret: turnstileSecret,
        response: "token-ok",
      },
    ]);
  });

  it("wires schema-key public create operations to committed records", async () => {
    const before = await getJson<BootstrapResponse>("/api/site/bootstrap");
    const accepted = await postPublicOperation(
      "/api/site/public/operations/contact-message/submit",
      publicContactMessageBody({ idempotencyKey: "contact-create-exec" }),
    );
    const after = await getJson<BootstrapResponse>("/api/site/bootstrap");
    const messages = contactMessageRecords(after.records);

    expect(accepted.status).toBe(200);
    expect(messages[0]?.values).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
      message: "Please send details.",
    });
    expect(after.records.length).toBe(before.records.length + 1);
    expect(messages).toHaveLength(1);
    expectTurnstileRequests(turnstileRequests, [
      {
        secret: turnstileSecret,
        response: "token-ok",
      },
    ]);
  });

  it("rejects false affirmative consent before public operation effects", async () => {
    await installAffirmativePublicIntakeSchema();
    const block = await postAdminRecordOperation({
      idempotencyKey: "write-create-affirmative-public-intake-form",
      entity: "block",
      operationName: "create",
      input: emailStylePublicIntakeFormBlockValues,
    });
    const before = await getJson<BootstrapResponse>("/api/site/bootstrap");
    const rejected = await postPublicOperation(
      "/api/site/public/operations/intake-request/submit",
      publicEmailStyleIntakeBody({
        idempotencyKey: "affirmative-consent-false",
        input: {
          ...emailStylePublicIntakeInput,
          contactConsent: false,
        },
        sourceBlockId: block.record.id,
      }),
    );
    const afterRejected = await getJson<BootstrapResponse>("/api/site/bootstrap");

    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({
      error: 'Public operation input field "contactConsent" must be accepted.',
    });
    expect(afterRejected.records).toEqual(before.records);
    expect(emailStyleIntakeRecords(afterRejected.records)).toEqual([]);
    expect(turnstileRequests).toEqual([]);

    const accepted = await postPublicOperation(
      "/api/site/public/operations/intake-request/submit",
      publicEmailStyleIntakeBody({
        idempotencyKey: "affirmative-consent-true",
        input: {
          ...emailStylePublicIntakeInput,
          contactConsent: true,
        },
        sourceBlockId: block.record.id,
      }),
    );
    const afterAccepted = await getJson<BootstrapResponse>("/api/site/bootstrap");

    expect(accepted.status).toBe(200);
    expect(emailStyleIntakeRecords(afterAccepted.records)).toEqual([
      expect.objectContaining({
        values: expect.objectContaining({ contactConsent: true }),
      }),
    ]);
  });

  it("executes bounded challenge-free public reads with filtered rows and rate limits", async () => {
    await installTaskPublicLookupSchema();
    await postAdminRecordOperation(
      {
        idempotencyKey: "create-public-lookup-task-alpha",
        entity: "task",
        operationName: "create",
        input: {
          title: "Alpha certificate",
          done: false,
          verificationCode: "CODE-ALPHA",
          reportNumber: "REPORT-1",
          publicDeliveryReference: "delivery-alpha",
          customerName: "Private customer",
          providerStorageKey: "private/alpha.pdf",
        },
      },
      harness,
      "/api/tasks",
    );
    await postAdminRecordOperation(
      {
        idempotencyKey: "create-public-lookup-task-second",
        entity: "task",
        operationName: "create",
        input: {
          title: "Second certificate",
          done: false,
          verificationCode: "CODE-ALPHA",
          reportNumber: "REPORT-2",
          publicDeliveryReference: "delivery-second",
          customerName: "Second private customer",
          providerStorageKey: "private/second.pdf",
        },
      },
      harness,
      "/api/tasks",
    );
    const before = await getJson<BootstrapResponse>("/api/tasks/bootstrap");
    const matched = await postPublicOperation(
      "/api/tasks/public/operations/task/lookup",
      {
        input: { lookup: "CODE-ALPHA" },
      },
      harness,
      { "CF-Connecting-IP": "203.0.113.77" },
    );
    const empty = await postPublicOperation(
      "/api/tasks/public/operations/task/lookup",
      {
        input: { lookup: "NO-MATCH" },
      },
      harness,
      { "CF-Connecting-IP": "203.0.113.77" },
    );
    const limited = await postPublicOperation(
      "/api/tasks/public/operations/task/lookup",
      {
        input: { lookup: "CODE-ALPHA" },
      },
      harness,
      { "CF-Connecting-IP": "203.0.113.77" },
    );
    const after = await getJson<BootstrapResponse>("/api/tasks/bootstrap");
    const matchedBody = (await matched.json()) as Record<string, unknown>;
    const emptyBody = (await empty.json()) as Record<string, unknown>;

    expect(matched.status).toBe(200);
    expect(matchedBody).toMatchObject({
      operation: {
        entityName: "task",
        operationName: "lookup",
        canonicalKey: "task.lookup",
        kind: "list",
      },
      output: {
        type: "list",
        records: [
          {
            verificationCode: "CODE-ALPHA",
            reportNumber: "REPORT-1",
            publicDeliveryReference: "delivery-alpha",
          },
        ],
      },
      status: "accepted",
    });
    expect(empty.status).toBe(200);
    expect(emptyBody).toMatchObject({
      output: {
        type: "list",
        records: [],
      },
      status: "accepted",
    });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await limited.json()).toEqual({
      error: "Public operation rate limit exceeded.",
    });
    expect(after.records).toEqual(before.records);
    expect(turnstileRequests).toEqual([]);

    const serialized = JSON.stringify(matchedBody);
    expect(serialized).not.toContain("Private customer");
    expect(serialized).not.toContain("private/alpha.pdf");
    expect(serialized).not.toContain(
      before.records.find((record) => record.values.verificationCode === "CODE-ALPHA")?.id ??
        "missing-private-record-id",
    );
  });

  it("schedules generic operation input notifications from installed Site forms targeting another app install", async () => {
    const publicIdempotencyKey = "cross-app-operation-input-notify";
    const targetApiPrefix = `/api/app-installs/tasks/${recordPlanInstallId}`;

    await resetInstalledApp("site", defaultSiteInstallId);
    await resetInstalledApp("tasks", recordPlanInstallId);
    await installEmailStylePublicIntakeSchema(harness, targetApiPrefix);
    const emailConfig = await configureContactNotificationEmail(harness);

    const block = await postAdminRecordOperation(
      {
        idempotencyKey: "write-create-cross-app-operation-input-form",
        entity: "block",
        operationName: "create",
        input: crossAppEmailStylePublicIntakeFormBlockValues(),
      },
      harness,
      `/api/app-installs/site/${defaultSiteInstallId}`,
    );
    const first = await postPublicOperation(
      `${targetApiPrefix}/public/operations/intake-request/submit`,
      publicEmailStyleIntakeBody({
        idempotencyKey: publicIdempotencyKey,
        sourceBlockId: block.record.id,
      }),
    );
    const firstBody = (await first.json()) as PublicOperationResponse;
    const after = await getJson<BootstrapResponse>(`${targetApiPrefix}/bootstrap`);
    const requests = emailStyleIntakeRecords(after.records);

    expect(first.status).toBe(200);
    expect(firstBody).toMatchObject({
      invocationId: `operation:${emailStylePublicIntakeOperationKey}:${publicIdempotencyKey}`,
      operation: {
        entityName: "intake-request",
        operationName: "submit",
        canonicalKey: emailStylePublicIntakeOperationKey,
        kind: "create",
      },
      status: "committed",
    });
    expect(requests).toHaveLength(1);

    if (firstBody.output.type !== "create") {
      throw new Error("Expected create output.");
    }

    const deliveryReplay = await postAdminJson<{
      delivery: {
        latestError?: string;
        messageKind: string;
        sourceOperationId?: string;
        sourceRecordId?: string;
        sourceStorageIdentity: string;
        status: string;
      };
      replayed: boolean;
    }>("/api/formless/email/deliveries/schedule", {
      canonicalOrigin: "https://www.example.com",
      idempotencyKey: operationInputNotificationIdempotencyKey(
        emailStylePublicIntakeOperationKey,
        publicIdempotencyKey,
      ),
      message: {
        subject: "Replay probe",
        text: "Replay probe",
      },
      messageKind: "site-operation-input-notification",
      recipients: [{ address: "owner@example.com", displayName: "Public operation" }],
      replyTo: { address: "ada@example.com" },
      sender: { id: emailConfig.sender.id },
      source: {
        operationId: firstBody.invocationId,
        recordId: firstBody.output.record.id,
        storageIdentity: `app:${recordPlanInstallId}`,
      },
    });

    expect(deliveryReplay).toMatchObject({
      replayed: true,
      delivery: {
        messageKind: "site-operation-input-notification",
        sourceOperationId: firstBody.invocationId,
        sourceRecordId: firstBody.output.record.id,
        sourceStorageIdentity: `app:${recordPlanInstallId}`,
        status: "pending",
      },
    });
    expect(deliveryReplay.delivery).not.toHaveProperty("latestError");
    expect(JSON.stringify(firstBody)).not.toContain("owner@example.com");
    expect(JSON.stringify(firstBody)).not.toContain("contact@mail.example.com");
    expect(JSON.stringify(firstBody)).not.toContain("operation-input-notification");
  });

  it("uses deployed Turnstile bindings for subscribe form rendering and verification", async () => {
    const block = await postAdminRecordOperation({
      idempotencyKey: "write-create-deployed-subscribe-form",
      entity: "block",
      operationName: "create",
      input: {
        type: "subscribeForm",
        label: "Join the deployed list",
        operationName: "subscribe",
        buttonLabel: "Join",
      },
    });
    await postAdminRecordOperation({
      idempotencyKey: "write-place-deployed-subscribe-form",
      entity: "block-placement",
      operationName: "create",
      input: {
        parent: "rec_site_content_home",
        block: block.record.id,
        order: 4500,
        label: "Join the deployed list",
      },
    });

    const tree = await getJson<SitePageTreeResponse>("/api/site/tree/home");
    const subscribePlacement = tree.page.placements.find(
      (placement) => placement.block.id === block.record.id,
    );
    const accepted = await postPublicOperation(
      "/api/site/public/operations/subscription/subscribe",
      publicSubscribeBody({ idempotencyKey: "deployed-bindings" }),
    );

    expect(subscribePlacement?.block.publicOperation?.challenge).toEqual({
      kind: "turnstile",
      siteKey: turnstileSiteKey,
    });
    expect(accepted.status).toBe(200);
    expectTurnstileRequests(turnstileRequests, [
      {
        secret: turnstileSecret,
        response: "token-ok",
      },
    ]);
    expect(JSON.stringify(tree)).not.toContain(turnstileSecret);
  });

  it("routes mapped public Site host public operations without exposing admin shell or schema-key APIs", async () => {
    await postAdminJson(
      "/api/formless/app-installs",
      {
        packageAppKey: "site",
        installId,
        label: "Personal",
      },
      mappedHarness,
    );
    await createMappedPublicSiteRoute(mappedHarness, mappedHost, installId);

    const accepted = await fetchHost(
      mappedHarness,
      mappedHost,
      `/api/app-installs/site/${installId}/public/operations/subscription/subscribe`,
      {
        body: JSON.stringify(publicSubscribeBody({ idempotencyKey: "mapped-host" })),
        headers: {
          "Content-Type": "application/json",
          Origin: `http://${mappedHost}`,
        },
        method: "POST",
      },
    );
    const adminShell = await fetchHost(mappedHarness, mappedHost, `/apps/${installId}`, {
      headers: { Accept: "text/html" },
    });
    const schemaKeyApi = await fetchHost(
      mappedHarness,
      mappedHost,
      "/api/site/public/operations/subscription/subscribe",
      {
        body: JSON.stringify(publicSubscribeBody({ idempotencyKey: "mapped-schema-key" })),
        headers: {
          "Content-Type": "application/json",
          Origin: `http://${mappedHost}`,
        },
        method: "POST",
      },
    );

    expect(accepted.status).toBe(200);
    expect(adminShell.status).toBe(404);
    expect(schemaKeyApi.status).toBe(404);
  });
});

async function createPublicOperationWorkerHarness(input: {
  bindings: Record<string, string>;
  turnstileVerify: (request: Request) => Promise<Response> | Response;
}) {
  return createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: input.bindings,
      compatibilityDate: "2026-04-28",
      queueProducers: {
        FORMLESS_EMAIL_DELIVERY_QUEUE: "formless-email-delivery",
      },
      r2Buckets: ["FORMLESS_MEDIA"],
      serviceBindings: {
        FORMLESS_TURNSTILE_SITEVERIFY: input.turnstileVerify,
      },
    },
  );
}

async function turnstileVerifyResponse(request: Request) {
  turnstileRequests.push((await request.json()) as TurnstileVerifyRequest);

  return Response.json({
    success: true,
    challenge_ts: "2026-05-28T00:00:00.000Z",
    hostname: "example.com",
  });
}
function expectTurnstileRequests(
  actual: TurnstileVerifyRequest[],
  expected: Array<{
    response: string;
    secret: string;
  }>,
) {
  expect(actual).toHaveLength(expected.length);
  for (const [index, request] of actual.entries()) {
    expect(request).toMatchObject(expected[index] ?? {});
    expect(request.idempotency_key).toEqual(expect.any(String));
    expect(isUuid(String(request.idempotency_key))).toBe(true);
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function resetSchemaApp(schemaKey: "tasks" | "site", target: Harness = harness) {
  await restoreTestStorageSnapshot(
    target,
    `/api/${schemaKey}/snapshot/restore`,
    schemaAppTestStorageSnapshot(schemaKey),
    adminHeaders(),
  );
}

async function resetInstalledApp(
  packageAppKey: "crm" | "site" | "tasks",
  appInstallId: string,
  target: Harness = harness,
) {
  await restoreTestStorageSnapshot(
    target,
    `/api/app-installs/${packageAppKey}/${appInstallId}/snapshot/restore`,
    schemaAppTestStorageSnapshot(packageAppKey, `app:${appInstallId}`),
    adminHeaders(),
  );
}

async function installEmailStylePublicIntakeSchema(
  target: Harness = harness,
  apiPrefix = "/api/site",
) {
  const current = await getJson<SchemaResponse>(`${apiPrefix}/schema`, target);
  const schema = schemaWithEmailStylePublicIntake(current.schema);

  await postAdminJson<SchemaUpdateResponse>(`${apiPrefix}/schema`, { schema }, target);
}

async function installAffirmativePublicIntakeSchema(
  target: Harness = harness,
  apiPrefix = "/api/site",
) {
  const current = await getJson<SchemaResponse>(`${apiPrefix}/schema`, target);
  const schema = schemaWithEmailStylePublicIntake(current.schema);
  const entity = schema.entities.find((definition) => definition.key === "intake-request")!;
  const operation = entity?.operations!.find((definition) => definition.key === "submit")!;
  if (!entity || !operation?.input) {
    throw new Error("Expected public intake operation input.");
  }
  setKeyedDefinition(entity.fields, "contactConsent", {
    type: "boolean",
    required: true,
    label: "I agree to be contacted",
  });
  setKeyedDefinition(operation.input.fields, "contactConsent", {
    field: "contactConsent",
    required: true,
    mustBeTrue: true,
  });
  await postAdminJson<SchemaUpdateResponse>(`${apiPrefix}/schema`, { schema }, target);
}
async function installTaskPublicLookupSchema() {
  const current = await getJson<SchemaResponse>("/api/tasks/schema");
  await postAdminJson<SchemaUpdateResponse>("/api/tasks/schema", {
    schema: schemaWithPublicTaskLookup(current.schema),
  });
}
function schemaWithPublicTaskLookup(sourceSchema: AppSchema): AppSchema {
  const schema = structuredClone(sourceSchema);
  const task = schema.entities.find((definition) => definition.key === "task")!;
  const create = task?.operations!.find((definition) => definition.key === "create")!;
  if (!task || !create?.input) {
    throw new Error("Expected Task create operation.");
  }
  const fields = [
    ...task.fields,
    {
      key: "verificationCode",
      type: "text" as const,
      required: false,
      label: "Verification code",
    },
    {
      key: "reportNumber",
      type: "text" as const,
      required: false,
      label: "Report number",
    },
    {
      key: "publicDeliveryReference",
      type: "text" as const,
      required: false,
      label: "Public delivery reference",
    },
    {
      key: "customerName",
      type: "text" as const,
      required: false,
      label: "Customer name",
    },
    {
      key: "providerStorageKey",
      type: "text" as const,
      required: false,
      label: "Provider storage key",
    },
  ];
  setKeyedDefinition(schema.queries, "publicTaskLookup", {
    label: "Public task lookup",
    entity: "task",
    expression: {
      kind: "and",
      expressions: [
        {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: false,
        },
        {
          kind: "or",
          expressions: [
            {
              kind: "where",
              ref: { kind: "value", name: "verificationCode" },
              op: "eq",
              value: { kind: "context", name: "lookup" },
            },
            {
              kind: "where",
              ref: { kind: "value", name: "reportNumber" },
              op: "eq",
              value: { kind: "context", name: "lookup" },
            },
          ],
        },
      ],
    },
  });
  setKeyedDefinition(schema.entities, "task", {
    ...task,
    fields,
    operations: [
      ...(task.operations ?? []).map((operation) =>
        operation.key === "create"
          ? {
              ...create,
              input: {
                fields: [
                  ...create.input!.fields,
                  { key: "verificationCode", field: "verificationCode" },
                  { key: "reportNumber", field: "reportNumber" },
                  {
                    key: "publicDeliveryReference",
                    field: "publicDeliveryReference",
                  },
                  { key: "customerName", field: "customerName" },
                  { key: "providerStorageKey", field: "providerStorageKey" },
                ],
              },
              key: "create",
            }
          : operation,
      ),
      {
        key: "lookup",
        label: "Lookup certificate",
        kind: "list",
        scope: "collection",
        target: { query: "publicTaskLookup" },
        input: {
          fields: [
            {
              key: "lookup",
              type: "text",
              required: true,
              label: "Verification code or report number",
            },
          ],
        },
        output: {
          type: "list",
          query: "publicTaskLookup",
          maxResults: 1,
        },
        idempotency: { required: false },
        audit: { input: "summary" },
        policy: {
          actors: ["anonymous"],
          access: {
            actor: "anonymous",
            origin: { kind: "same-origin" },
            rateLimit: { maxRequests: 2, windowSeconds: 60 },
          },
          responseFields: {
            anonymous: ["verificationCode", "reportNumber", "publicDeliveryReference"],
          },
        },
      },
    ],
  });
  return schema;
}
function publicSubscribeBody(input: {
  idempotencyKey: string;
  input?: Record<string, unknown>;
  sourceBlockId?: string;
  token?: string;
}) {
  return {
    input: input.input ?? { email: "ada@example.com" },
    proof: { turnstileToken: input.token ?? "token-ok" },
    source: { siteBlockId: input.sourceBlockId ?? "rec_site_subscribe_form" },
    idempotencyKey: input.idempotencyKey,
  };
}

function publicContactMessageBody(input: {
  idempotencyKey: string;
  input?: Record<string, unknown>;
  token?: string;
}) {
  return {
    input: input.input ?? {
      name: "Ada Lovelace",
      email: "ada@example.com",
      message: "Please send details.",
    },
    proof: { turnstileToken: input.token ?? "token-ok" },
    source: { siteBlockId: "rec_site_contact_form" },
    idempotencyKey: input.idempotencyKey,
  };
}

function publicEmailStyleIntakeBody(input: {
  idempotencyKey: string;
  input?: Record<string, unknown>;
  sourceBlockId?: string;
  token?: string;
}) {
  return {
    input: input.input ?? emailStylePublicIntakeInput,
    proof: { turnstileToken: input.token ?? "token-ok" },
    source: { siteBlockId: input.sourceBlockId ?? emailStylePublicIntakeFormBlockId },
    idempotencyKey: input.idempotencyKey,
  };
}

function contactSubscriptionRecords(records: StoredRecord[]) {
  return {
    contacts: records.filter((record) => record.entity === "contact"),
    emailAddresses: records.filter((record) => record.entity === "email-address"),
    audiences: records.filter((record) => record.entity === "audience"),
    subscriptions: records.filter((record) => record.entity === "subscription"),
  };
}

function contactMessageRecords(records: StoredRecord[]) {
  return records.filter((record) => record.entity === "contact-message");
}

function emailStyleIntakeRecords(records: StoredRecord[]) {
  return records.filter((record) => record.entity === "intake-request");
}

async function getJson<T>(path: string, target: Harness = harness) {
  const response = await target.fetch(path, {
    headers: adminHeaders(),
  });

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

async function postAdminJson<T = unknown>(path: string, body: unknown, target: Harness = harness) {
  const request = operationWriteRequest(path, body);
  const response = await target.fetch(request.path, {
    body: JSON.stringify(request.body),
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });
  const text = await response.text();

  expect([200, 201], text).toContain(response.status);

  return request.response(JSON.parse(text)) as T;
}

async function postAdminRecordOperation(
  body: Parameters<typeof recordOperationRequest>[0],
  target: Harness = harness,
  apiPrefix = "/api/site",
) {
  const request = recordOperationRequest(body);
  const response = await target.fetch(`${apiPrefix}${request.path.slice("/api".length)}`, {
    body: JSON.stringify(request.body),
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });
  const text = await response.text();

  expect([200, 201], text).toContain(response.status);

  return request.response(JSON.parse(text));
}

function crossAppEmailStylePublicIntakeFormBlockValues(): Record<string, unknown> {
  const values = {
    ...emailStylePublicIntakeFormBlockValues,
    operationTargetKind: "appInstall",
    operationTargetPackageAppKey: "tasks",
    operationTargetInstallId: recordPlanInstallId,
  };

  delete (values as Record<string, unknown>).operationTargetSchemaKey;

  return values;
}

function operationInputNotificationIdempotencyKey(operationKey: string, key: string): string {
  const digest = createHash("sha256")
    .update(`operation-input-notification\n${operationKey}\n${key}`)
    .digest("hex");

  return `operation-input-notification:${digest}`;
}

async function configureContactNotificationEmail(target: Harness) {
  const route = await createControlPlaneRecord(
    "route",
    "contact-notification-primary-route",
    {
      enabled: true,
      matchHost: "www.example.com",
      matchPath: "/",
      matchPrefix: "/",
      kind: "mount",
      targetProfile: "instance",
      surface: "admin",
      access: "owner",
    },
    target,
  );
  const domain = await createControlPlaneRecord(
    "email-domain",
    "contact-notification-email-domain",
    {
      enabled: true,
      providerFamily: "cloudflare",
      domain: "mail.example.com",
      primaryRoute: route.id,
      dnsStatus: "verified",
    },
    target,
  );
  const sender = await createControlPlaneRecord(
    "email-sender",
    "contact-notification-email-sender",
    {
      enabled: true,
      address: "contact@mail.example.com",
      displayName: "Contact",
      purpose: "contact-notification",
      emailDomain: domain.id,
    },
    target,
  );

  await createControlPlaneRecord(
    "instance-settings",
    "contact-notification-instance-settings",
    {
      settingsId: INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
      primaryRoute: route.id,
      authRelyingPartyId: "www.example.com",
      defaultEmailDomain: domain.id,
      defaultContactSender: sender.id,
      contactNotificationRecipient: "owner@example.com",
      productionIdentityStatus: "configured",
    },
    target,
  );

  return { domain, route, sender };
}

async function createControlPlaneRecord(
  entity: string,
  idempotencyKey: string,
  input: Record<string, unknown>,
  target: Harness,
): Promise<StoredRecord> {
  const response = await postAdminJson<OperationInvocationResponse>(
    `/api/formless/program/operations/${entity}/create`,
    {
      idempotencyKey,
      input,
    },
    target,
  );

  if (response.output.type !== "create") {
    throw new Error(`Expected ${entity}.create to return create output.`);
  }

  return response.output.record;
}

async function createMappedPublicSiteRoute(target: Harness, host: string, appInstallId: string) {
  await postAdminJson(
    "/api/formless/program/operations/route/create",
    {
      idempotencyKey: `route-host-publicSite-${host}`,
      input: {
        enabled: true,
        matchHost: host,
        matchPath: "/",
        matchPrefix: "/",
        kind: "mount",
        targetProfile: "public-site",
        appInstall: appInstallId,
        surface: "public-site",
      },
    },
    target,
  );
}

function postPublicOperation(
  path: string,
  body: unknown,
  target: Harness = harness,
  headers: Record<string, string> = {},
) {
  return target.fetch(path, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      Origin: "http://example.com",
      ...headers,
    },
    method: "POST",
  });
}

function fetchHost(target: Harness, host: string, path: string, init?: DispatchFetchInit) {
  return target.mf.dispatchFetch(`http://${host}${path}`, init);
}

function adminHeaders(headers: Record<string, string> = {}) {
  return {
    ...headers,
    Authorization: `Bearer ${adminToken}`,
  };
}
