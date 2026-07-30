import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { StoredRecord } from "@dpeek/formless-storage";
import type { EmailDeliveryRecord, EmailDeliveryRenderedMessage } from "../shared/email-runtime.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import type { StoredEmailVerificationChallenge } from "./instance-auth-state.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;
type HarnessDispatchFetchInit = Parameters<Harness["mf"]["dispatchFetch"]>[1];

const authOrigin = "https://auth.example.com";
const authEmail = "email-sender:auth@mail.example.com";
const ownerEmail = "ada@example.com";
const ownerId = "principal:ada";
const createdAt = "2026-07-07T00:00:00.000Z";
const packageRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));

let harness: Harness | undefined;
let harnessDir: string | undefined;

afterEach(async () => {
  await harness?.dispose();
  harness = undefined;

  if (harnessDir) {
    await rm(harnessDir, { recursive: true, force: true });
    harnessDir = undefined;
  }
});

describe("instance auth email verification API", () => {
  it("requests and verifies email challenges without exposing raw tokens outside private delivery content", async () => {
    harness = await createEmailVerificationHarness();
    const setup = await setupOwnerSession();
    const requested = await postAuthJson<EmailVerificationRequestResponse>(
      "/formless/auth/email-verification/request",
      verificationRequestBody({ email: "Ada.Verified@Example.com" }),
      setup.cookie,
    );
    const deliveries = await getHarnessJson<{
      deliveries: EmailDeliveryRecord[];
    }>("/harness/deliveries");
    const queueJobs = await getHarnessJson<{
      jobs: unknown[];
    }>("/harness/queue-jobs");
    const message = await getHarnessJson<{
      message?: EmailDeliveryRenderedMessage;
    }>(`/harness/internal-message/${requested.delivery.deliveryId}`);
    const token = verificationTokenFromMessage(message.message);
    const tokenHash = sha256Base64Url(token);
    const publicState = JSON.stringify([requested, deliveries, queueJobs, await identityRecords()]);

    expect(requested).toMatchObject({
      challenge: {
        displayEmail: "Ada.Verified@example.com",
        purpose: "account-completion",
      },
      delivery: {
        queued: true,
        replayed: false,
        status: "scheduled",
      },
    });
    expect(deliveries.deliveries).toHaveLength(1);
    expect(queueJobs.jobs).toHaveLength(1);
    expect(message.message?.text).toContain("/formless/auth/email-verification?");
    expect(publicState).not.toContain(token);
    expect(publicState).not.toContain(tokenHash);

    const verified = await postAuthJson<EmailVerificationVerifyResponse>(
      "/formless/auth/email-verification/verify",
      {
        ...verificationRequestBody({ email: "ada.verified@example.com" }),
        challengeId: requested.challenge.challengeId,
        token,
      },
      setup.cookie,
    );
    const challenge = await getHarnessJson<{
      challenge: StoredEmailVerificationChallenge | null;
    }>(`/harness/challenge/${encodeURIComponent(requested.challenge.challengeId)}`);
    const records = await identityRecords();
    const verifiedEmail = records.records.find(
      (record) =>
        record.entity === "principal-email" &&
        record.values.normalizedEmail === "ada.verified@example.com",
    );
    const replay = await postAuthJsonFailure(
      "/formless/auth/email-verification/verify",
      {
        ...verificationRequestBody({ email: "ada.verified@example.com" }),
        challengeId: requested.challenge.challengeId,
        token,
      },
      setup.cookie,
    );

    expect(verified).toEqual({
      verified: true,
      principalEmail: {
        displayEmail: "Ada.Verified@example.com",
        normalizedEmail: "ada.verified@example.com",
        primary: true,
        principalEmailId: expect.any(String),
        recovery: false,
        verificationStatus: "verified",
        verifiedAt: expect.any(String),
      },
    });
    expect(challenge.challenge).toMatchObject({
      challengeId: requested.challenge.challengeId,
      consumedAt: expect.any(String),
      normalizedEmail: "ada.verified@example.com",
      tokenHash,
    });
    expect(verifiedEmail?.values).toMatchObject({
      principal: ownerId,
      normalizedEmail: "ada.verified@example.com",
      verificationStatus: "verified",
      primary: true,
      recovery: false,
    });
    expect(JSON.stringify(records.records)).not.toContain(token);
    expect(JSON.stringify(records.records)).not.toContain(tokenHash);
    expect(replay.status).toBe(409);
    expect(replay.body).toEqual({ error: "Email verification link is no longer available." });
  });

  it("rejects wrong token, wrong email, and wrong target without consuming or writing identity email", async () => {
    harness = await createEmailVerificationHarness();
    const setup = await setupOwnerSession();
    const requested = await requestChallenge(setup.cookie, "Pending.Verify@example.com");
    const message = await getHarnessJson<{
      message?: EmailDeliveryRenderedMessage;
    }>(`/harness/internal-message/${requested.delivery.deliveryId}`);
    const token = verificationTokenFromMessage(message.message);
    const wrongToken = await postAuthJsonFailure(
      "/formless/auth/email-verification/verify",
      {
        ...verificationRequestBody({ email: "pending.verify@example.com" }),
        challengeId: requested.challenge.challengeId,
        token: "d3JvbmctZW1haWwtdmVyaWZpY2F0aW9uLXRva2Vu",
      },
      setup.cookie,
    );
    const wrongEmail = await postAuthJsonFailure(
      "/formless/auth/email-verification/verify",
      {
        ...verificationRequestBody({ email: "other@example.com" }),
        challengeId: requested.challenge.challengeId,
        token,
      },
      setup.cookie,
    );
    const wrongTarget = await postAuthJsonFailure(
      "/formless/auth/email-verification/verify",
      {
        ...verificationRequestBody({
          email: "pending.verify@example.com",
          target: { ...accountTarget(), appInstallId: "crm" },
        }),
        challengeId: requested.challenge.challengeId,
        token,
      },
      setup.cookie,
    );
    const challenge = await getHarnessJson<{
      challenge: StoredEmailVerificationChallenge | null;
    }>(`/harness/challenge/${encodeURIComponent(requested.challenge.challengeId)}`);
    const records = await identityRecords();

    expect(wrongToken.status).toBe(401);
    expect(wrongEmail.status).toBe(401);
    expect(wrongTarget.status).toBe(401);
    expect(challenge.challenge).not.toHaveProperty("consumedAt");
    expect(
      records.records.some(
        (record) =>
          record.entity === "principal-email" &&
          record.values.normalizedEmail === "pending.verify@example.com",
      ),
    ).toBe(false);
  });

  it("rejects missing email configuration before challenge or delivery state is written", async () => {
    harness = await createEmailVerificationHarness({ emailConfig: "missing-auth-sender" });
    const setup = await setupOwnerSession();
    const rejected = await postAuthJsonFailure(
      "/formless/auth/email-verification/request",
      verificationRequestBody({ email: "missing.config@example.com" }),
      setup.cookie,
    );
    const deliveries = await getHarnessJson<{
      deliveries: EmailDeliveryRecord[];
    }>("/harness/deliveries");
    const challenges = await getHarnessJson<{
      challenges: StoredEmailVerificationChallenge[];
    }>("/harness/challenges");
    expect(rejected.status).toBe(503);
    expect(rejected.body).toEqual({
      error: "Email verification delivery is not configured.",
    });
    expect(deliveries.deliveries).toEqual([]);
    expect(challenges.challenges).toEqual([]);
  });

  it("does not consume a token when the matching identity write is rejected", async () => {
    harness = await createEmailVerificationHarness();
    const setup = await setupOwnerSession();

    await postHarnessJson("/harness/conflicting-email", {
      email: "taken@example.com",
      principalId: "principal:taken",
    });
    const requested = await requestChallenge(setup.cookie, "taken@example.com");
    const message = await getHarnessJson<{
      message?: EmailDeliveryRenderedMessage;
    }>(`/harness/internal-message/${requested.delivery.deliveryId}`);
    const token = verificationTokenFromMessage(message.message);
    const rejected = await postAuthJsonFailure(
      "/formless/auth/email-verification/verify",
      {
        ...verificationRequestBody({ email: "taken@example.com" }),
        challengeId: requested.challenge.challengeId,
        token,
      },
      setup.cookie,
    );
    const challenge = await getHarnessJson<{
      challenge: StoredEmailVerificationChallenge | null;
    }>(`/harness/challenge/${encodeURIComponent(requested.challenge.challengeId)}`);
    const records = await identityRecords();

    expect(rejected.status).toBe(409);
    expect(rejected.body).toEqual({ error: "Email verification could not be committed." });
    expect(challenge.challenge).not.toHaveProperty("consumedAt");
    expect(
      records.records.find(
        (record) =>
          record.entity === "principal-email" &&
          record.values.normalizedEmail === "taken@example.com",
      )?.values.principal,
    ).toBe("principal:taken");
  });
});
async function createEmailVerificationHarness(
  options: {
    emailConfig?: "configured" | "missing-auth-sender";
  } = {},
): Promise<Harness> {
  return createWorkerHarness(
    await writeEmailVerificationHarness(),
    {
      FORMLESS_AUTHORITY: { className: "HarnessAuthority", useSQLite: true },
    },
    {
      bindings: {
        EMAIL_CONFIG_MODE: options.emailConfig ?? "configured",
        FORMLESS_OWNER_SESSION_SECRET: "test-owner-session-secret",
      },
    },
  );
}
async function setupOwnerSession() {
  return postHarnessJson<{
    cookie: string;
    principalId: string;
  }>("/harness/setup", {
    email: ownerEmail,
    name: "Ada Owner",
    principalId: ownerId,
  });
}

async function requestChallenge(cookie: string, email: string) {
  return postAuthJson<EmailVerificationRequestResponse>(
    "/formless/auth/email-verification/request",
    verificationRequestBody({ email }),
    cookie,
  );
}

function verificationRequestBody(input: {
  email: string;
  target?: ReturnType<typeof accountTarget>;
}) {
  return {
    email: input.email,
    purpose: "account-completion",
    target: input.target ?? accountTarget(),
  };
}

function accountTarget() {
  return {
    appInstallId: "site",
    returnTo: "/formless/auth",
    routeId: "route:site",
    storageIdentity: "app:site",
    targetOrigin: "https://app.example.com",
    targetProfile: "app",
  };
}
async function identityRecords() {
  return getHarnessJson<{
    records: StoredRecord[];
  }>("/harness/identity-records");
}
async function getHarnessJson<T>(path: string): Promise<T> {
  const response = await fetchHarness(path);
  expect(response.status).toBe(200);
  return (await response.json()) as T;
}
async function postHarnessJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetchHarness(path, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

async function postAuthJson<T>(path: string, body: unknown, cookie: string): Promise<T> {
  const response = await fetchAuth(path, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    method: "POST",
  });

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

async function postAuthJsonFailure(path: string, body: unknown, cookie: string) {
  const response = await fetchAuth(path, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    method: "POST",
  });
  return {
    body: (await response.json()) as {
      error: string;
    },
    status: response.status,
  };
}

function fetchHarness(path: string, init?: HarnessDispatchFetchInit) {
  if (!harness) {
    throw new Error("Harness is not initialized.");
  }

  return harness.mf.dispatchFetch(`${authOrigin}${path}`, init);
}

function fetchAuth(path: string, init?: HarnessDispatchFetchInit) {
  return fetchHarness(path, init);
}

function verificationTokenFromMessage(message: EmailDeliveryRenderedMessage | undefined): string {
  const match = message?.text.match(/[?&]token=([A-Za-z0-9_-]+)/);

  if (!match?.[1]) {
    throw new Error("Verification token was not rendered.");
  }

  return match[1];
}

function sha256Base64Url(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

async function writeEmailVerificationHarness() {
  harnessDir = await mkdtemp(join(tmpdir(), "formless-email-verification-harness-"));
  const harnessPath = join(harnessDir, "email-verification-harness.ts");

  await writeFile(
    harnessPath,
    `
      import { DurableObject } from "cloudflare:workers";
      import {
        FORMLESS_PROGRAM_API_ROUTE_PREFIX,
        FORMLESS_PROGRAM_STORAGE_IDENTITY,
      } from "${packageRoot}/src/program/target.ts";
      import {
        createCentralAuthSessionCookie,
      } from "${packageRoot}/src/worker/central-auth-session.ts";
      import {
        handleInstanceEmailRuntimeDurableObjectRequest,
      } from "${packageRoot}/src/worker/email-runtime.ts";
      import {
        ensureEmailDeliveryTables,
        listEmailDeliveries,
        readEmailDeliveryRenderedMessageById,
      } from "${packageRoot}/src/worker/email-runtime-state.ts";
      import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "${packageRoot}/src/worker/formless-instance.ts";
      import {
        ensureIdentityOwner,
        handleIdentityControlPlaneDurableObjectRequest,
      } from "${packageRoot}/src/worker/identity-control-plane.ts";
      import { INTERNAL_READ_RECORDS_PATH } from "${packageRoot}/src/worker/instance-control-plane.ts";
      import {
        handleInstanceAuthEmailVerificationApiRequest,
        handleInstanceAuthEmailVerificationDurableObjectRequest,
      } from "${packageRoot}/src/worker/instance-auth-email-verification.ts";
      import {
        ensureInstanceAuthTables,
        listEmailVerificationChallenges,
        readEmailVerificationChallenge,
        writeInstanceAuthConfig,
      } from "${packageRoot}/src/worker/instance-auth-state.ts";
      import {
        ensureStorageTables,
        getBootstrapRecords,
        writeRecordSetForCommandOperationOutcome,
      } from "${packageRoot}/src/worker/storage.ts";

      export default {
        async fetch(request, env) {
          const url = new URL(request.url);

          if (url.pathname === "/harness/setup") {
            const body = await request.json();
            const instanceId = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);
            const instance = env.FORMLESS_AUTHORITY.get(instanceId);

            await instance.fetch(new Request(new URL("/harness/config", request.url), {
              method: "POST",
            }));

            const owner = await ensureIdentityOwner(
              { FORMLESS_AUTHORITY: env.FORMLESS_AUTHORITY },
              {
                now: "${createdAt}",
                owner: { name: body.name, email: body.email },
                ownerId: body.principalId,
              },
            );
            const sessionResponse = await instance.fetch(
              new Request(new URL("/harness/session", request.url), {
                body: JSON.stringify({ principalId: owner.id }),
                headers: { "Content-Type": "application/json" },
                method: "POST",
              }),
            );

            return sessionResponse;
          }

          if (url.pathname === "/harness/conflicting-email") {
            const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_PROGRAM_STORAGE_IDENTITY);

            return env.FORMLESS_AUTHORITY.get(id).fetch(request);
          }

          const emailVerificationResponse =
            await handleInstanceAuthEmailVerificationApiRequest(request, env);

          if (emailVerificationResponse) {
            return emailVerificationResponse;
          }

          const instanceHarnessPaths = [
            "/harness/deliveries",
            "/harness/queue-jobs",
            "/harness/internal-message/",
            "/harness/challenge/",
            "/harness/challenges",
          ];

          if (
            instanceHarnessPaths.some((path) =>
              path.endsWith("/") ? url.pathname.startsWith(path) : url.pathname === path,
            )
          ) {
            const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

            return env.FORMLESS_AUTHORITY.get(id).fetch(request);
          }

          if (url.pathname === "/harness/identity-records") {
            const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_PROGRAM_STORAGE_IDENTITY);

            return env.FORMLESS_AUTHORITY.get(id).fetch(request);
          }

          return Response.json({ error: "Not found." }, { status: 404 });
        },
      };

      export class HarnessAuthority extends DurableObject {
        constructor(ctx, env) {
          super(ctx, env);
          this.env = env;
          if (ctx.id.name === FORMLESS_INSTANCE_AUTHORITY_NAME) {
            ensureInstanceAuthTables(ctx.storage);
            ensureEmailDeliveryTables(ctx.storage);
          }
        }

        async fetch(request) {
          const url = new URL(request.url);

          if (this.ctx.id.name === FORMLESS_PROGRAM_STORAGE_IDENTITY) {
            if (
              request.method === "GET" &&
              url.pathname === \`\${FORMLESS_PROGRAM_API_ROUTE_PREFIX}\${INTERNAL_READ_RECORDS_PATH}\`
            ) {
              return Response.json({
                records: [
                  ...controlPlaneRecords(this.env.EMAIL_CONFIG_MODE),
                  ...getBootstrapRecords(this.ctx.storage),
                ],
              });
            }
            if (url.pathname === "/harness/identity-records") {
              return Response.json({ records: getBootstrapRecords(this.ctx.storage) });
            }

            if (url.pathname === "/harness/conflicting-email") {
              const body = await request.json();
              ensureStorageTables(this.ctx.storage);
              writeRecordSetForCommandOperationOutcome(
                this.ctx.storage,
                \`harness-conflicting-email:\${body.email}\`,
                [
                  {
                    kind: "create",
                    entity: "principal",
                    id: body.principalId,
                    values: {
                      displayName: body.email,
                      kind: "human",
                      status: "active",
                    },
                  },
                  {
                    kind: "create",
                    entity: "principal-email",
                    id: \`principal-email:\${body.principalId}:primary\`,
                    values: {
                      principal: body.principalId,
                      displayEmail: body.email,
                      normalizedEmail: String(body.email).toLowerCase(),
                      verificationStatus: "verified",
                      primary: true,
                      recovery: false,
                      verifiedAt: "${createdAt}",
                    },
                  },
                ],
                undefined,
                { now: "${createdAt}" },
              );

              return Response.json({ created: true });
            }

            const response = await handleIdentityControlPlaneDurableObjectRequest(
              request,
              this.ctx.storage,
              this.env,
            );

            return response ?? Response.json({ error: "Not found." }, { status: 404 });
          }

          if (url.pathname === "/harness/config") {
            writeInstanceAuthConfig(this.ctx.storage, {
              canonicalOrigin: "${authOrigin}",
              relyingPartyId: "auth.example.com",
              relyingPartyName: "Formless",
              now: "${createdAt}",
            });

            return Response.json({ configured: true });
          }

          if (url.pathname === "/harness/session") {
            const body = await request.json();
            const session = await createCentralAuthSessionCookie(this.ctx.storage, {
              env: this.env,
              now: "${createdAt}",
              principalId: body.principalId,
              request,
            });

            return Response.json({
              cookie: session.cookie.split(";")[0],
              principalId: body.principalId,
            });
          }

          const emailVerificationResponse =
            await handleInstanceAuthEmailVerificationDurableObjectRequest(
              request,
              this.ctx.storage,
              emailVerificationEnv(this.env, this.ctx.storage),
            );

          if (emailVerificationResponse) {
            return emailVerificationResponse;
          }

          const emailRuntimeResponse = await handleInstanceEmailRuntimeDurableObjectRequest(
            request,
            this.ctx.storage,
            emailVerificationEnv(this.env, this.ctx.storage),
          );

          if (emailRuntimeResponse) {
            return emailRuntimeResponse;
          }

          if (url.pathname === "/harness/deliveries") {
            return Response.json({ deliveries: listEmailDeliveries(this.ctx.storage) });
          }

          if (url.pathname === "/harness/queue-jobs") {
            ensureQueueTable(this.ctx.storage);
            return Response.json({
              jobs: this.ctx.storage.sql
                .exec("SELECT message_json FROM fake_email_delivery_queue_jobs ORDER BY send_id ASC")
                .toArray()
                .map((row) => JSON.parse(row.message_json)),
            });
          }

          if (url.pathname.startsWith("/harness/internal-message/")) {
            const deliveryId = decodeURIComponent(url.pathname.slice("/harness/internal-message/".length));

            return Response.json({
              message: readEmailDeliveryRenderedMessageById(this.ctx.storage, deliveryId),
            });
          }

          if (url.pathname.startsWith("/harness/challenge/")) {
            const challengeId = decodeURIComponent(url.pathname.slice("/harness/challenge/".length));

            return Response.json({
              challenge: readEmailVerificationChallenge(this.ctx.storage, challengeId) ?? null,
            });
          }

          if (url.pathname === "/harness/challenges") {
            return Response.json({
              challenges: listEmailVerificationChallenges(this.ctx.storage),
            });
          }

          return Response.json({ error: "Not found." }, { status: 404 });
        }
      }

      function emailVerificationEnv(env, storage) {
        return {
          ...env,
          ...(env.EMAIL_CONFIG_MODE === "missing-queue"
            ? {}
            : { FORMLESS_EMAIL_DELIVERY_QUEUE: emailDeliveryQueueBinding(storage) }),
        };
      }

      function emailDeliveryQueueBinding(storage) {
        return {
          async send(job) {
            ensureEmailDeliveryTables(storage);
            ensureQueueTable(storage);
            storage.sql.exec(
              "INSERT INTO fake_email_delivery_queue_jobs (message_json) VALUES (?)",
              JSON.stringify(job),
            );

            return {};
          },
        };
      }

      function ensureQueueTable(storage) {
        storage.sql.exec(\`
          CREATE TABLE IF NOT EXISTS fake_email_delivery_queue_jobs (
            send_id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_json TEXT NOT NULL
          )
        \`);
      }

      function controlPlaneRecords(mode) {
        if (mode === "missing-auth-sender") {
          return baseControlPlaneRecords().filter((record) => record.entity !== "email-sender");
        }

        return baseControlPlaneRecords();
      }

      function baseControlPlaneRecords() {
        return [
          record("settings:instance", "instance-settings", {
            settingsId: "instance",
            defaultEmailDomain: "email-domain:mail.example.com",
            defaultAuthSender: "${authEmail}",
          }),
          record("email-domain:mail.example.com", "email-domain", {
            enabled: true,
            providerFamily: "cloudflare",
            domain: "mail.example.com",
          }),
          record("${authEmail}", "email-sender", {
            enabled: true,
            address: "auth@mail.example.com",
            displayName: "Example Auth",
            purpose: "auth",
            emailDomain: "email-domain:mail.example.com",
          }),
        ];
      }

      function record(id, entity, values) {
        return { id, entity, values, createdAt: "${createdAt}", updatedAt: "${createdAt}" };
      }
    `,
  );

  return harnessPath;
}

type EmailVerificationRequestResponse = {
  challenge: {
    challengeId: string;
    displayEmail: string;
    expiresAt: string;
    purpose: "account-completion";
  };
  delivery: {
    deliveryId: string;
    queued: boolean;
    replayed: boolean;
    status: "scheduled";
  };
};

type EmailVerificationVerifyResponse = {
  principalEmail: {
    displayEmail: string;
    normalizedEmail: string;
    primary: boolean;
    principalEmailId: string;
    recovery: boolean;
    verificationStatus: "verified";
    verifiedAt: string;
  };
  verified: true;
};
