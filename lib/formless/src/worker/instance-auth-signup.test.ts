import { createHash, generateKeyPairSync, type KeyObject } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { EmailDeliveryRecord, EmailDeliveryRenderedMessage } from "../shared/email-runtime.ts";
import type { AccountCompletionGateResolutionResult } from "../shared/instance-auth.ts";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { StoredRecord } from "@dpeek/formless-storage";
import { CENTRAL_AUTH_SESSION_COOKIE_NAME } from "./central-auth-session.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import type {
  StoredEmailVerificationChallenge,
  StoredPasskeyCredential,
} from "./instance-auth-state.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;
type HarnessDispatchFetchInit = Parameters<Harness["mf"]["dispatchFetch"]>[1];

const authOrigin = "https://auth.example.com";
const authEmail = "email-sender:auth@mail.example.com";
const createdAt = "2026-07-07T00:00:00.000Z";
const packageRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const signupTarget = {
  appInstallId: "crm",
  returnTo: "/apps/crm",
  routeId: "route:crm",
  storageIdentity: "app:crm",
  targetOrigin: authOrigin,
  targetProfile: "app",
} as const;

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

async function expectSignupStartRejected(input: {
  bindings: Record<string, string>;
  expected: string;
  target: Record<string, unknown>;
}) {
  harness = await createSignupHarness(input.bindings);

  const rejected = await postAuthJsonFailure("/formless/auth/signup/start", {
    email: "ada@example.com",
    target: input.target,
  });
  const challenges = await getHarnessJson<{
    challenges: StoredEmailVerificationChallenge[];
  }>("/harness/challenges");
  const deliveries = await getHarnessJson<{
    deliveries: EmailDeliveryRecord[];
  }>("/harness/deliveries");
  const records = await identityRecords();
  expect(rejected.status).toBe(400);
  expect(rejected.body).toEqual({ error: input.expected });
  expect(challenges.challenges).toEqual([]);
  expect(deliveries.deliveries).toEqual([]);
  expect(records.records.some((record) => record.entity === "principal")).toBe(false);
}

describe("self-service app signup API", () => {
  it("rejects disabled installs before writing auth or identity state", async () => {
    await expectSignupStartRejected({
      bindings: { INSTALL_STATUS: "disabled" },
      expected: "Signup target app install is disabled.",
      target: signupTarget,
    });
  });

  it("rejects unsupported registration policies before writing auth or identity state", async () => {
    await expectSignupStartRejected({
      bindings: { REGISTRATION_POLICY: "closed" },
      expected: "Signup target app install does not allow self-service signup.",
      target: signupTarget,
    });
  });

  it("rejects unsafe return targets before writing auth or identity state", async () => {
    await expectSignupStartRejected({
      bindings: {},
      expected: "Signup return target does not match the app route.",
      target: { ...signupTarget, returnTo: "/not-crm" },
    });
  });

  it("verifies email, registers a passkey, commits app registration, and issues a central session", async () => {
    const {
      completedBody,
      completedStatus,
      cookie,
      credentials,
      options,
      records,
      token,
      unverified,
      verifiedEmail,
    } = await completeSignupFlow();

    expect({ body: completedBody, status: completedStatus }).toMatchObject({
      body: { verified: true },
      status: 200,
    });

    expect(verifiedEmail).toMatchObject({
      verified: true,
      signup: {
        displayEmail: "Ada.Signup@example.com",
      },
    });
    expect(unverified).toEqual({
      body: { error: "Passkey registration verification failed." },
      status: 401,
    });
    expect(options.options.authenticatorSelection).toMatchObject({
      requireResidentKey: true,
      residentKey: "required",
      userVerification: "required",
    });
    expect(Buffer.from(options.options.user.id, "base64url").toString()).toBe(
      completedBody.principal.principalId,
    );
    expect(cookie).toContain(`${CENTRAL_AUTH_SESSION_COOKIE_NAME}=`);
    expect(completedBody).toMatchObject({
      accountCompletion: {
        continueTo: "/apps/crm",
        status: "complete",
      },
      continueTo: "/apps/crm",
      principal: {
        displayName: "Ada Signup",
        principalId: expect.stringMatching(/^principal:signup:/),
      },
      verified: true,
    });
    expect(credentials).toHaveLength(1);
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: "principal",
          id: completedBody.principal.principalId,
          values: expect.objectContaining({
            displayName: "Ada Signup",
            kind: "human",
            status: "active",
          }),
        }),
        expect.objectContaining({
          entity: "principal-email",
          values: expect.objectContaining({
            displayEmail: "Ada.Signup@example.com",
            normalizedEmail: "ada.signup@example.com",
            principal: completedBody.principal.principalId,
            primary: true,
            recovery: false,
            verificationStatus: "verified",
          }),
        }),
        expect.objectContaining({
          entity: "app-registration",
          values: expect.objectContaining({
            appInstallId: "crm",
            status: "active",
            targetKind: "principal",
            targetPrincipal: completedBody.principal.principalId,
          }),
        }),
      ]),
    );
    expect(JSON.stringify(records)).not.toContain(token);
    expect(JSON.stringify(records)).not.toContain(sha256Base64Url(token));
  });

  it("verifies custom-operation signup and returns the app-owned profile gate", async () => {
    const { completedBody, completedStatus, records } = await completeSignupFlow({
      bindings: {
        REGISTRATION_OPERATION: "profile.completeRegistration",
        REGISTRATION_POLICY: "custom-operation",
      },
      credentialId: "Y3JlZGVudGlhbC1zaWdudXAtY3VzdG9t",
      displayName: "Ada Profile Signup",
    });

    expect({ body: completedBody, status: completedStatus }).toMatchObject({
      body: {
        accountCompletion: {
          gate: {
            appInstallId: "crm",
            inputContract: {
              fields: expect.arrayContaining([expect.objectContaining({ name: "displayName" })]),
              unsupportedRequiredFields: ["principal"],
            },
            kind: "profile-completion",
            operation: {
              appInstallId: "crm",
              entityName: "profile",
              label: "Complete profile",
              operationKey: "profile.completeRegistration",
              operationName: "completeRegistration",
            },
          },
          status: "blocked",
        },
        principal: {
          displayName: "Ada Profile Signup",
          principalId: expect.stringMatching(/^principal:signup:/),
        },
        verified: true,
      },
      status: 200,
    });
    expect(completedBody).not.toHaveProperty("continueTo");
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: "app-registration",
          values: expect.objectContaining({
            appInstallId: "crm",
            status: "active",
            targetKind: "principal",
            targetPrincipal: completedBody.principal.principalId,
          }),
        }),
      ]),
    );
  });
});

async function completeSignupFlow({
  bindings = {},
  credentialId = "Y3JlZGVudGlhbC1zaWdudXAtMQ",
  displayName = "Ada Signup",
  email = "Ada.Signup@Example.com",
}: {
  bindings?: Record<string, string>;
  credentialId?: string;
  displayName?: string;
  email?: string;
} = {}) {
  harness = await createSignupHarness(bindings);

  const normalizedEmail = email.toLowerCase();
  const started = await postAuthJson<SignupStartResponse>("/formless/auth/signup/start", {
    email,
    target: signupTarget,
  });
  const message = await getHarnessJson<{
    message?: EmailDeliveryRenderedMessage;
  }>(`/harness/internal-message/${started.delivery.deliveryId}`);
  const token = verificationTokenFromMessage(message.message);
  const verifiedEmail = await postAuthJson<SignupEmailVerifyResponse>(
    "/formless/auth/signup/email/verify",
    {
      challengeId: started.signup.challengeId,
      email: normalizedEmail,
      target: started.signup.target,
      token,
    },
  );
  const unverifiedOptions = await postAuthJson<SignupPasskeyOptionsResponse>(
    "/formless/auth/signup/passkeys/register/options",
    {
      challengeId: started.signup.challengeId,
      displayName,
      email: normalizedEmail,
      target: started.signup.target,
    },
  );
  const passkey = new VirtualPasskey(credentialId);
  const unverifiedResponse = await fetchAuth("/formless/auth/signup/passkeys/register/verify", {
    body: JSON.stringify({
      challengeId: started.signup.challengeId,
      displayName,
      email: normalizedEmail,
      response: passkey.registrationResponse(unverifiedOptions.options, {
        origin: authOrigin,
        rpId: "auth.example.com",
        userVerified: false,
      }),
      target: started.signup.target,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const unverified = {
    body: (await unverifiedResponse.json()) as {
      error: string;
    },
    status: unverifiedResponse.status,
  };
  const options = await postAuthJson<SignupPasskeyOptionsResponse>(
    "/formless/auth/signup/passkeys/register/options",
    {
      challengeId: started.signup.challengeId,
      displayName,
      email: normalizedEmail,
      target: started.signup.target,
    },
  );
  const completed = await fetchAuth("/formless/auth/signup/passkeys/register/verify", {
    body: JSON.stringify({
      challengeId: started.signup.challengeId,
      displayName,
      email: normalizedEmail,
      response: passkey.registrationResponse(options.options, {
        origin: authOrigin,
        rpId: "auth.example.com",
      }),
      target: started.signup.target,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const completedBody = (await completed.json()) as SignupPasskeyVerifyResponse;
  const records = await identityRecords();
  const credentials = await getHarnessJson<{
    credentials: StoredPasskeyCredential[];
  }>(`/harness/credentials/${encodeURIComponent(completedBody.principal.principalId)}`);
  return {
    completedBody,
    completedStatus: completed.status,
    cookie: completed.headers.get("Set-Cookie") ?? "",
    credentials: credentials.credentials,
    options,
    records: records.records,
    token,
    unverified,
    verifiedEmail,
  };
}

async function createSignupHarness(bindings: Record<string, string> = {}): Promise<Harness> {
  return createWorkerHarness(
    await writeSignupHarness(),
    {
      FORMLESS_AUTHORITY: { className: "SignupHarnessAuthority", useSQLite: true },
    },
    {
      bindings: {
        FORMLESS_OWNER_SESSION_SECRET: "test-owner-session-secret",
        INSTALL_STATUS: "installed",
        REGISTRATION_POLICY: "email-verified",
        ...bindings,
      },
    },
  );
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
async function postAuthJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetchAuth(path, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

async function postAuthJsonFailure(path: string, body: unknown) {
  const response = await fetchAuth(path, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
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

function sha256Base64Url(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

async function writeSignupHarness() {
  harnessDir = await mkdtemp(join(tmpdir(), "formless-signup-harness-"));
  const harnessPath = join(harnessDir, "signup-harness.ts");

  await writeFile(
    harnessPath,
    `
      import { DurableObject } from "cloudflare:workers";
      import {
        FORMLESS_PROGRAM_API_ROUTE_PREFIX,
        FORMLESS_PROGRAM_STORAGE_IDENTITY,
      } from "${packageRoot}/src/program/target.ts";
      import {
        ensureEmailDeliveryTables,
        listEmailDeliveries,
        readEmailDeliveryRenderedMessageById,
      } from "${packageRoot}/src/worker/email-runtime-state.ts";
      import {
        handleInstanceEmailRuntimeDurableObjectRequest,
      } from "${packageRoot}/src/worker/email-runtime.ts";
      import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "${packageRoot}/src/worker/formless-instance.ts";
      import {
        handleIdentityControlPlaneDurableObjectRequest,
      } from "${packageRoot}/src/worker/identity-control-plane.ts";
      import { INTERNAL_READ_RECORDS_PATH } from "${packageRoot}/src/worker/instance-control-plane.ts";
      import {
        handleInstanceAuthSignupApiRequest,
        handleInstanceAuthSignupDurableObjectRequest,
      } from "${packageRoot}/src/worker/instance-auth-signup.ts";
      import {
        INTERNAL_AUTH_PROFILE_COMPLETION_SCHEMA_PATH,
      } from "${packageRoot}/src/worker/instance-auth-account-completion.ts";
      import {
        ensureInstanceAuthTables,
        listEmailVerificationChallenges,
        readPasskeyCredentialsForPrincipal,
        writeInstanceAuthConfig,
      } from "${packageRoot}/src/worker/instance-auth-state.ts";
      import {
        ensureStorageTables,
        getBootstrapRecords,
      } from "${packageRoot}/src/worker/storage.ts";

      export default {
        async fetch(request, env) {
          const url = new URL(request.url);
          const signupResponse = await handleInstanceAuthSignupApiRequest(request, env);

          if (signupResponse) {
            return signupResponse;
          }

          if (
            url.pathname === "/harness/deliveries" ||
            url.pathname.startsWith("/harness/internal-message/") ||
            url.pathname === "/harness/challenges" ||
            url.pathname.startsWith("/harness/credentials/")
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

      export class SignupHarnessAuthority extends DurableObject {
        constructor(ctx, env) {
          super(ctx, env);
          this.env = env;

          if (ctx.id.name === FORMLESS_INSTANCE_AUTHORITY_NAME) {
            ensureInstanceAuthTables(ctx.storage);
            ensureEmailDeliveryTables(ctx.storage);
            writeInstanceAuthConfig(ctx.storage, {
              canonicalOrigin: "${authOrigin}",
              relyingPartyId: "auth.example.com",
              relyingPartyName: "Formless",
              now: "${createdAt}",
            });
          }

          if (ctx.id.name === FORMLESS_PROGRAM_STORAGE_IDENTITY) {
            ensureStorageTables(ctx.storage);
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
                  ...controlPlaneRecords(this.env),
                  ...getBootstrapRecords(this.ctx.storage),
                ],
              });
            }
            if (url.pathname === "/harness/identity-records") {
              return Response.json({ records: getBootstrapRecords(this.ctx.storage) });
            }

            const response = await handleIdentityControlPlaneDurableObjectRequest(
              request,
              this.ctx.storage,
              this.env,
            );

            return response ?? Response.json({ error: "Not found." }, { status: 404 });
          }

          if (this.ctx.id.name === "app:crm") {
            if (
              request.method === "GET" &&
              url.pathname === \`/api/app-installs/crm/crm\${INTERNAL_AUTH_PROFILE_COMPLETION_SCHEMA_PATH}\`
            ) {
              return Response.json({
                schema: profileCompletionSourceSchema(),
                updatedAt: "${createdAt}",
              });
            }

            return Response.json({ error: "Not found." }, { status: 404 });
          }

          const signupResponse = await handleInstanceAuthSignupDurableObjectRequest(
            request,
            this.ctx.storage,
            signupEnv(this.env, this.ctx.storage),
          );

          if (signupResponse) {
            return signupResponse;
          }

          const emailRuntimeResponse = await handleInstanceEmailRuntimeDurableObjectRequest(
            request,
            this.ctx.storage,
            signupEnv(this.env, this.ctx.storage),
          );

          if (emailRuntimeResponse) {
            return emailRuntimeResponse;
          }

          if (url.pathname === "/harness/deliveries") {
            return Response.json({ deliveries: listEmailDeliveries(this.ctx.storage) });
          }

          if (url.pathname.startsWith("/harness/internal-message/")) {
            const deliveryId = decodeURIComponent(url.pathname.slice("/harness/internal-message/".length));

            return Response.json({
              message: readEmailDeliveryRenderedMessageById(this.ctx.storage, deliveryId),
            });
          }

          if (url.pathname === "/harness/challenges") {
            return Response.json({
              challenges: listEmailVerificationChallenges(this.ctx.storage),
            });
          }

          if (url.pathname.startsWith("/harness/credentials/")) {
            const principalId = decodeURIComponent(url.pathname.slice("/harness/credentials/".length));

            return Response.json({
              credentials: readPasskeyCredentialsForPrincipal(this.ctx.storage, principalId),
            });
          }

          return Response.json({ error: "Not found." }, { status: 404 });
        }
      }

      function signupEnv(env, storage) {
        return {
          ...env,
          FORMLESS_EMAIL_DELIVERY_QUEUE: emailDeliveryQueueBinding(storage),
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

      function controlPlaneRecords(env) {
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
          record("crm", "app-install", {
            installId: "crm",
            packageAppKey: "crm",
            label: "CRM",
            registrationPolicy: env.REGISTRATION_POLICY,
            ...(env.REGISTRATION_OPERATION === undefined
              ? {}
              : { registrationOperation: env.REGISTRATION_OPERATION }),
            status: env.INSTALL_STATUS,
            storageIdentity: "app:crm",
          }),
          record("route:crm", "route", {
            kind: "mount",
            enabled: true,
            matchPath: "/apps/crm",
            targetProfile: "app",
            appInstall: "crm",
            access: "authenticated",
          }),
        ];
      }

      function record(id, entity, values) {
        return { id, entity, values, createdAt: "${createdAt}", updatedAt: "${createdAt}" };
      }

      function profileCompletionSourceSchema() {
        return {
          version: 1,
          entities: [
            {
              id: "entity_7ce27c06-27cd-4fb9-a44c-f42ad0d03327",
              key: "profile",
              label: "Profile",
              fields: [
                {
                  key: "displayName",
                  type: "text",
                  required: true,
                  label: "Display name",
                },
                {
                  key: "principal",
                  type: "reference",
                  required: true,
                  label: "Principal",
                  to: "auth:principal",
                },
              ],
              operations: [
                {
                  key: "completeRegistration",
                  label: "Complete profile",
                  kind: "command",
                  scope: "collection",
                  policy: {
                    actors: ["authenticated"],
                  },
                  input: {
                    fields: [
                      {
                        key: "displayName",
                        field: "displayName",
                      },
                      {
                        key: "principal",
                        field: "principal",
                        required: true,
                      },
                    ],
                  },
                  effect: {
                    type: "recordPlan",
                    steps: [
                      {
                        name: "createProfile",
                        kind: "create",
                        entity: "profile",
                        recordId: { kind: "generatedId", prefix: "profile" },
                        values: {
                          displayName: { kind: "input", field: "displayName" },
                          principal: {
                            kind: "reference",
                            entity: "auth:principal",
                            id: { kind: "input", field: "principal" },
                          },
                        },
                      },
                    ],
                  },
                  output: {
                    type: "command",
                  },
                  idempotency: {
                    required: true,
                  },
                },
              ],
            },
          ],
          queries: [
            {
              key: "profileAll",
              label: "Profiles",
              entity: "profile",
              expression: { kind: "all" },
            },
          ],
          itemViews: [
            {
              key: "profileItem",
              entity: "profile",
              fields: [
                { field: "displayName", editor: "text", commit: "field-commit" },
              ],
            },
          ],
          tableViews: [],
          views: [
            {
              key: "profileHome",
              type: "collection",
              label: "Profiles",
              entity: "profile",
              queries: [{ query: "profileAll" }],
              defaultQuery: "profileAll",
              result: { type: "list", itemView: "profileItem" },
            },
          ],
          screens: [
            {
              key: "profileHome",
              type: "workspace",
              label: "Profiles",
              layout: {
                type: "stack",
                sections: [
                  { id: "profiles", type: "collection", view: "profileHome" },
                ],
              },
            },
          ],
        };
      }
    `,
  );

  return harnessPath;
}

type SignupStartResponse = {
  delivery: {
    deliveryId: string;
    queued: boolean;
    replayed: boolean;
    status: "scheduled";
  };
  signup: {
    challengeId: string;
    displayEmail: string;
    expiresAt: string;
    target: typeof signupTarget;
  };
};

type SignupEmailVerifyResponse = {
  signup: SignupStartResponse["signup"];
  verified: true;
};

type SignupPasskeyOptionsResponse = {
  options: PublicKeyCredentialCreationOptionsJSON;
};

type SignupPasskeyVerifyResponse = {
  accountCompletion: AccountCompletionGateResolutionResult;
  continueTo?: string;
  principal: {
    displayName: string;
    principalId: string;
  };
  session: {
    expiresAt: string;
  };
  verified: true;
};

class VirtualPasskey {
  private readonly credentialId: string;
  private readonly publicKey: KeyObject;

  constructor(credentialIdValue: string) {
    const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });

    this.credentialId = credentialIdValue;
    this.publicKey = pair.publicKey;
  }
  registrationResponse(
    options: PublicKeyCredentialCreationOptionsJSON,
    input: {
      origin: string;
      rpId: string;
      userVerified?: boolean;
    },
  ): RegistrationResponseJSON {
    const clientDataJSON = clientDataJson("webauthn.create", options.challenge, input.origin);
    const authData = registrationAuthenticatorData({
      credentialId: base64UrlDecode(this.credentialId),
      credentialPublicKey: this.credentialPublicKey(),
      counter: 0,
      rpId: input.rpId,
      userVerified: input.userVerified ?? true,
    });
    const attestationObject = cborMap([
      ["fmt", "none"],
      ["attStmt", []],
      ["authData", authData],
    ]);

    return {
      id: this.credentialId,
      rawId: this.credentialId,
      response: {
        clientDataJSON: base64UrlEncode(clientDataJSON),
        attestationObject: base64UrlEncode(attestationObject),
        transports: ["internal"],
      },
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      type: "public-key",
    };
  }

  private credentialPublicKey(): Uint8Array {
    const jwk = this.publicKey.export({ format: "jwk" }) as JsonWebKey;

    if (!jwk.x || !jwk.y) {
      throw new Error("Virtual passkey public key export is missing coordinates.");
    }

    return cborMap([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, base64UrlDecode(jwk.x)],
      [-3, base64UrlDecode(jwk.y)],
    ]);
  }
}

function registrationAuthenticatorData(input: {
  counter: number;
  credentialId: Uint8Array;
  credentialPublicKey: Uint8Array;
  rpId: string;
  userVerified: boolean;
}) {
  const credentialIdLength = new Uint8Array(2);
  const credentialIdLengthView = new DataView(credentialIdLength.buffer);

  credentialIdLengthView.setUint16(0, input.credentialId.byteLength, false);

  return concatBytes([
    sha256(new TextEncoder().encode(input.rpId)),
    new Uint8Array([input.userVerified ? 0x45 : 0x41]),
    uint32(input.counter),
    new Uint8Array(16),
    credentialIdLength,
    input.credentialId,
    input.credentialPublicKey,
  ]);
}

function clientDataJson(type: "webauthn.create", challenge: string, origin: string) {
  return new TextEncoder().encode(
    JSON.stringify({
      type,
      challenge,
      origin,
      crossOrigin: false,
    }),
  );
}

type CborMapKey = number | string;
type CborMapEntry = readonly [CborMapKey, CborValue];
type CborValue = number | string | Uint8Array | readonly CborMapEntry[];

function cborMap(entries: readonly CborMapEntry[]): Uint8Array {
  return concatBytes([
    cborHeader(5, entries.length),
    ...entries.flatMap(([key, value]) => [cborEncode(key), cborEncode(value)]),
  ]);
}

function cborEncode(value: CborValue): Uint8Array {
  if (typeof value === "number") {
    return value >= 0 ? cborHeader(0, value) : cborHeader(1, -1 - value);
  }

  if (typeof value === "string") {
    const bytes = new TextEncoder().encode(value);

    return concatBytes([cborHeader(3, bytes.byteLength), bytes]);
  }

  if (value instanceof Uint8Array) {
    return concatBytes([cborHeader(2, value.byteLength), value]);
  }

  return cborMap(value);
}

function cborHeader(major: number, value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("CBOR value must be a non-negative integer.");
  }

  if (value < 24) {
    return new Uint8Array([(major << 5) | value]);
  }

  if (value <= 0xff) {
    return new Uint8Array([(major << 5) | 24, value]);
  }

  if (value <= 0xffff) {
    const bytes = new Uint8Array(3);
    const view = new DataView(bytes.buffer);

    bytes[0] = (major << 5) | 25;
    view.setUint16(1, value, false);

    return bytes;
  }

  const bytes = new Uint8Array(5);
  const view = new DataView(bytes.buffer);

  bytes[0] = (major << 5) | 26;
  view.setUint32(1, value, false);

  return bytes;
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, value, false);

  return bytes;
}

function sha256(bytes: Uint8Array): Uint8Array {
  return createHash("sha256").update(Buffer.from(bytes)).digest();
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function base64UrlDecode(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}
