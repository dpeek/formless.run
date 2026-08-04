import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { StoredRecord } from "@dpeek/formless-storage";
import { INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID } from "@dpeek/formless-instance-control-plane";
import type {
  BootstrapResponse,
  PublicOperationResponse,
  SyncResponse,
} from "../shared/protocol.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import {
  instanceControlPlaneTestStorageSnapshot,
  operationWriteRequest,
  restoreTestStorageSnapshot,
} from "../test/authority-write.ts";
import { FORMLESS_PROGRAM_API_ROUTE_PREFIX } from "../program/target.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;
type TurnstileVerifyRequest = {
  idempotency_key?: unknown;
  response?: unknown;
  secret?: unknown;
};

const adminToken = "test-admin-token";
const turnstileSiteKey = "test-turnstile-site-key";
const turnstileSecret = "test-turnstile-secret";

let harness: Harness;
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
});

beforeEach(async () => {
  turnstileRequests = [];

  await restoreTestStorageSnapshot(
    harness,
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/snapshot/restore`,
    instanceControlPlaneTestStorageSnapshot(),
    adminHeaders(),
  );
});

afterAll(async () => {
  await harness.dispose();
});

describe("public operation runtime", () => {
  it("executes built-in Site operations through the narrow Program public route", async () => {
    const before = await getJson<BootstrapResponse>(
      `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/bootstrap`,
    );
    const rejectedOrigin = await postPublicOperation(
      `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/public/operations/subscription/subscribe`,
      publicSubscribeBody({ idempotencyKey: "program-site-wrong-origin" }),
      harness,
      { Origin: "https://other.example.com" },
    );
    const accepted = await postPublicOperation(
      `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/public/operations/subscription/subscribe`,
      publicSubscribeBody({ idempotencyKey: "program-site-subscribe" }),
    );
    const after = await getJson<BootstrapResponse>(
      `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/bootstrap`,
    );
    const sync = await getJson<SyncResponse>(
      `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/sync?cursor=${before.cursor}`,
    );
    const records = contactSubscriptionRecords(after.records);
    const protectedResponses = await Promise.all([
      harness.fetch(`${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/bootstrap`),
      harness.fetch(`${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/schema`),
      harness.fetch(`${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/snapshot`),
      harness.fetch(`${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/sync?cursor=0`),
      harness.fetch(`${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/operations/subscription/subscribe`, {
        body: JSON.stringify(publicSubscribeBody({ idempotencyKey: "program-generic-denied" })),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      harness.fetch(`${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/sync/ws`, {
        headers: { Connection: "Upgrade", Upgrade: "websocket" },
      }),
    ]);

    expect(rejectedOrigin.status).toBe(403);
    expect(accepted.status).toBe(200);
    expect(after.records.length).toBe(before.records.length + 4);
    expect(after.cursor).toBeGreaterThan(before.cursor);
    expect(sync.cursor).toBe(after.cursor);
    expect(
      sync.changes
        .map((change) => change.entity)
        .filter((entity) =>
          ["audience", "contact", "email-address", "subscription"].includes(entity),
        )
        .sort(),
    ).toEqual(["audience", "contact", "email-address", "subscription"]);
    expect(records.subscriptions).toHaveLength(1);
    expect(records.subscriptions[0]?.values).toMatchObject({
      sourceTargetKind: "program",
      sourceSchemaKey: "formless-program",
      sourceApiRoutePrefix: FORMLESS_PROGRAM_API_ROUTE_PREFIX,
      sourceOperationKey: "subscription.subscribe",
      sourcePath: `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/public/operations/subscription/subscribe`,
    });
    expect(protectedResponses.map((response) => response.status)).toEqual([
      401, 401, 401, 401, 401, 401,
    ]);
    expectTurnstileRequests(turnstileRequests, [
      {
        secret: turnstileSecret,
        response: "token-ok",
      },
    ]);
  });

  it("executes Program public subscribe operations on the canonical Program route", async () => {
    const before = await getJson<BootstrapResponse>("/api/formless/program/bootstrap");
    const accepted = await postPublicOperation(
      "/api/formless/program/public/operations/subscription/subscribe",
      publicSubscribeBody({ idempotencyKey: "schema-key-exec" }),
    );
    const after = await getJson<BootstrapResponse>("/api/formless/program/bootstrap");
    const records = contactSubscriptionRecords(after.records);

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
      sourceTargetKind: "program",
      sourceSchemaKey: "formless-program",
      sourceApiRoutePrefix: "/api/formless/program",
      sourceOperationKey: "subscription.subscribe",
      sourceHost: "example.com",
      sourcePath: "/api/formless/program/public/operations/subscription/subscribe",
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

  it("replays Program public operations without repeating challenge or effects", async () => {
    const first = await postPublicOperation(
      `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/public/operations/subscription/subscribe`,
      publicSubscribeBody({ idempotencyKey: "program-replay" }),
    );
    const replay = await postPublicOperation(
      `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/public/operations/subscription/subscribe`,
      publicSubscribeBody({ idempotencyKey: "program-replay", token: "token-replay" }),
    );
    const after = await getJson<BootstrapResponse>(
      `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/bootstrap`,
    );
    const records = contactSubscriptionRecords(after.records);

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(records.emailAddresses).toHaveLength(1);
    expect(records.subscriptions).toHaveLength(1);
    expect(records.subscriptions[0]?.values).toMatchObject({
      sourceTargetKind: "program",
      sourceSchemaKey: "formless-program",
      sourceApiRoutePrefix: FORMLESS_PROGRAM_API_ROUTE_PREFIX,
      sourceOperationKey: "subscription.subscribe",
      sourceSiteBlockId: "rec_site_subscribe_form",
    });
    expectTurnstileRequests(turnstileRequests, [
      {
        secret: turnstileSecret,
        response: "token-ok",
      },
    ]);
  });

  it("wires Program public create operations to committed records", async () => {
    const before = await getJson<BootstrapResponse>("/api/formless/program/bootstrap");
    const accepted = await postPublicOperation(
      "/api/formless/program/public/operations/contact-message/submit",
      publicContactMessageBody({ idempotencyKey: "contact-create-exec" }),
    );
    const after = await getJson<BootstrapResponse>("/api/formless/program/bootstrap");
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

  it("uses Program Site form source context when scheduling operation notifications", async () => {
    const publicIdempotencyKey = "program-operation-input-notify";
    const sourceBlockId = "rec_site_program_operation_input_form";

    await restoreTestStorageSnapshot(
      harness,
      `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/snapshot/restore`,
      instanceControlPlaneTestStorageSnapshot([
        {
          id: sourceBlockId,
          entity: "block",
          values: {
            type: "publicOperationForm",
            label: "Contact us",
            operationKey: "contact-message.submit",
            operationNotificationMode: "email",
            operationNotificationReplyToField: "email",
          },
          createdAt: "2026-07-31T00:00:00.000Z",
          updatedAt: "2026-07-31T00:00:00.000Z",
        },
      ]),
      adminHeaders(),
    );
    const emailConfig = await configureContactNotificationEmail(harness);
    const first = await postPublicOperation(
      `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/public/operations/contact-message/submit`,
      publicContactMessageBody({
        idempotencyKey: publicIdempotencyKey,
        sourceBlockId,
      }),
    );
    const firstBody = (await first.json()) as PublicOperationResponse;
    const after = await getJson<BootstrapResponse>(
      `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/bootstrap`,
    );
    const messages = contactMessageRecords(after.records);

    expect(first.status).toBe(200);
    expect(firstBody).toMatchObject({
      invocationId: `operation:contact-message.submit:${publicIdempotencyKey}`,
      operation: {
        entityName: "contact-message",
        operationName: "submit",
        canonicalKey: "contact-message.submit",
        kind: "create",
      },
      status: "committed",
    });
    expect(messages).toHaveLength(1);

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
        "contact-message.submit",
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
        storageIdentity: "instance:control-plane",
      },
    });

    expect(deliveryReplay).toMatchObject({
      replayed: true,
      delivery: {
        messageKind: "site-operation-input-notification",
        sourceOperationId: firstBody.invocationId,
        sourceRecordId: firstBody.output.record.id,
        sourceStorageIdentity: "instance:control-plane",
        status: "pending",
      },
    });
    expect(deliveryReplay.delivery).not.toHaveProperty("latestError");
    expect(JSON.stringify(firstBody)).not.toContain("owner@example.com");
    expect(JSON.stringify(firstBody)).not.toContain("contact@mail.example.com");
    expect(JSON.stringify(firstBody)).not.toContain("operation-input-notification");
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
      bindings: {
        ...input.bindings,
      },
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
  sourceBlockId?: string;
  token?: string;
}) {
  return {
    input: input.input ?? {
      name: "Ada Lovelace",
      email: "ada@example.com",
      message: "Please send details.",
    },
    proof: { turnstileToken: input.token ?? "token-ok" },
    source: { siteBlockId: input.sourceBlockId ?? "rec_site_contact_form" },
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

function adminHeaders(headers: Record<string, string> = {}) {
  return {
    ...headers,
    Authorization: `Bearer ${adminToken}`,
  };
}
