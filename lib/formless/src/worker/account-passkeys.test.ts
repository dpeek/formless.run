import { createHash, createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
import { FORMLESS_PROGRAM_API_ROUTE_PREFIX } from "../program/target.ts";

import type {
  AccountPasskeyLoginOptionsResponse,
  AccountPasskeyLoginVerifyResponse,
} from "../shared/instance-auth.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import { CENTRAL_AUTH_SESSION_COOKIE_NAME } from "./central-auth-session.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { HOST_AUTH_SESSION_COOKIE_NAME } from "./instance-auth-handoff.ts";
import { OWNER_SESSION_COOKIE_NAME } from "./owner-session.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;
type HarnessFetchInit = NonNullable<Parameters<Harness["fetch"]>[1]>;

const adminToken = "test-admin-token";
const canonicalOrigin = "https://example.com";
const relyingPartyId = "example.com";
const relyingPartyName = "Formless";
const credentialId = "Y3JlZGVudGlhbC0x";

let harness: Harness;
let harnessDir: string | undefined;
let harnessPath: string;

beforeAll(async () => {
  harnessPath = await writeAccountPasskeyHarness();
});

beforeEach(async () => {
  harness = await createWorkerHarness(
    harnessPath,
    {
      FORMLESS_AUTHORITY: { className: "AccountPasskeyApiHarness", useSQLite: true },
    },
    {
      bindings: { FORMLESS_ADMIN_TOKEN: adminToken },
    },
  );
});

afterEach(async () => {
  await harness.dispose();
});

afterAll(async () => {
  if (harnessDir) {
    await rm(harnessDir, { recursive: true, force: true });
    harnessDir = undefined;
  }
});

describe("account passkey login API routes", () => {
  it("creates discoverable login options and verifies owner assertions", async () => {
    const authenticator = new VirtualPasskey(credentialId);
    const owner = await seedOwnerPasskey(authenticator);
    const principal = accountPrincipalIdentity(owner);
    const options = await loginOptions();

    expect(options.response.status).toBe(200);
    expect(options.body.options.rpId).toBe(relyingPartyId);
    expect(options.body.options.allowCredentials).toBeUndefined();
    expect(options.body.options.userVerification).toBe("required");

    const accepted = await verifyLogin(
      authenticator.authenticationResponse(options.body.options, {
        counter: 1,
        origin: canonicalOrigin,
        rpId: relyingPartyId,
      }),
    );
    const replay = await verifyLogin(
      authenticator.authenticationResponse(options.body.options, {
        counter: 2,
        origin: canonicalOrigin,
        rpId: relyingPartyId,
      }),
    );

    expect(accepted.response.status).toBe(200);
    expect(accepted.response.headers.get("Set-Cookie")).toContain(
      `${CENTRAL_AUTH_SESSION_COOKIE_NAME}=`,
    );
    expect(accepted.response.headers.get("Set-Cookie")).not.toContain(
      `${OWNER_SESSION_COOKIE_NAME}=`,
    );
    expect(accepted.response.headers.get("Set-Cookie")).not.toContain(
      `${HOST_AUTH_SESSION_COOKIE_NAME}=`,
    );
    expect(accepted.body).toEqual({
      authenticated: true,
      continueTo: "/formless/auth",
      principal,
      session: { expiresAt: expect.any(String) },
    });
    expect(replay.response.status).toBe(401);
    expect(replay.response.headers.get("Set-Cookie")).toBeNull();
    expect(replay.body).toEqual({ error: "Passkey challenge is invalid." });

    const wrongUserHandleOptions = await loginOptions();
    const wrongUserHandle = await verifyLogin(
      authenticator.authenticationResponse(wrongUserHandleOptions.body.options, {
        counter: 2,
        origin: canonicalOrigin,
        rpId: relyingPartyId,
        userHandle: "principal:other",
      }),
    );

    expect(wrongUserHandle.response.status).toBe(401);
    expect(wrongUserHandle.body).toEqual({
      authenticated: false,
      error: "Passkey credential is invalid.",
    });

    const wrongOriginOptions = await loginOptions();
    const wrongOrigin = await verifyLogin(
      authenticator.authenticationResponse(wrongOriginOptions.body.options, {
        counter: 2,
        origin: "https://other.example.com",
        rpId: relyingPartyId,
      }),
    );

    expect(wrongOrigin.response.status).toBe(401);
    expect(wrongOrigin.body).toEqual({
      authenticated: false,
      error: "Passkey login verification failed.",
    });

    const wrongRpOptions = await loginOptions();
    const wrongRp = await verifyLogin(
      authenticator.authenticationResponse(wrongRpOptions.body.options, {
        counter: 2,
        origin: canonicalOrigin,
        rpId: "login.example.com",
      }),
    );

    expect(wrongRp.response.status).toBe(401);
    expect(wrongRp.body).toEqual({
      authenticated: false,
      error: "Passkey login verification failed.",
    });

    const counterRegressionOptions = await loginOptions();
    const counterRegression = await verifyLogin(
      authenticator.authenticationResponse(counterRegressionOptions.body.options, {
        counter: 1,
        origin: canonicalOrigin,
        rpId: relyingPartyId,
      }),
    );

    expect(counterRegression.response.status).toBe(401);
    expect(counterRegression.body).toEqual({
      authenticated: false,
      error: "Passkey login verification failed.",
    });
  });

  it("authenticates an active Program administrator without preselecting a role", async () => {
    await seedOwnerPasskey(new VirtualPasskey(credentialId));

    const displayName = "Program Administrator";
    const principal = await createIdentityPrincipal(displayName);
    await assignIdentityRole(principal.principalId);
    const accountCredentialId = base64UrlEncode(
      new TextEncoder().encode(`credential:${displayName}`),
    );
    const authenticator = new VirtualPasskey(accountCredentialId, principal.principalId);

    await createStoredCredential(accountCredentialId, principal.principalId, authenticator);

    const options = await loginOptions();
    const accepted = await verifyLogin(
      authenticator.authenticationResponse(options.body.options, {
        counter: 1,
        origin: canonicalOrigin,
        rpId: relyingPartyId,
      }),
    );
    const sessionCookie = cookiePair(accepted.response.headers.get("Set-Cookie"));
    const status = await harness.fetch("/api/formless/session", {
      headers: { Cookie: sessionCookie },
    });

    expect(accepted.response.status).toBe(200);
    expect(accepted.body).toEqual({
      authenticated: true,
      continueTo: "/formless/auth",
      principal,
      session: { expiresAt: expect.any(String) },
    });
    expect(status.status).toBe(200);
    await expect(status.json()).resolves.toEqual({
      authenticated: true,
      principal,
      session: { expiresAt: expect.any(String) },
      setupComplete: true,
    });
  });

  it("rejects an inactive credential principal without advancing verification state", async () => {
    await seedOwnerPasskey(new VirtualPasskey(credentialId));

    const principal = await createIdentityPrincipal("Inactive Account");
    const inactiveCredentialId = base64UrlEncode(new TextEncoder().encode("credential:inactive"));
    const authenticator = new VirtualPasskey(inactiveCredentialId, principal.principalId);

    await createStoredCredential(inactiveCredentialId, principal.principalId, authenticator);

    const options = await loginOptions();
    await updateIdentityPrincipalStatus(principal.principalId, "disabled");

    const rejected = await verifyLogin(
      authenticator.authenticationResponse(options.body.options, {
        counter: 1,
        origin: canonicalOrigin,
        rpId: relyingPartyId,
      }),
    );

    expect(rejected.response.status).toBe(401);
    expect(rejected.response.headers.get("Set-Cookie")).toBeNull();
    expect(rejected.body).toEqual({
      authenticated: false,
      error: "Passkey credential is invalid.",
    });

    await updateIdentityPrincipalStatus(principal.principalId, "active");

    const retryOptions = await loginOptions();
    const accepted = await verifyLogin(
      authenticator.authenticationResponse(retryOptions.body.options, {
        counter: 1,
        origin: canonicalOrigin,
        rpId: relyingPartyId,
      }),
    );

    expect(accepted.response.status).toBe(200);
  });

  it("rejects app-controlled redirect input without consuming the login challenge", async () => {
    const authenticator = new VirtualPasskey(credentialId);
    const owner = await seedOwnerPasskey(authenticator);
    const principal = accountPrincipalIdentity(owner);
    const options = await loginOptions();
    const response = authenticator.authenticationResponse(options.body.options, {
      counter: 1,
      origin: canonicalOrigin,
      rpId: relyingPartyId,
    });
    const rejected = await verifyLogin(response, { redirectTo: "/apps/site?screen=owner" });
    const accepted = await verifyLogin(response);

    expect(rejected.response.status).toBe(400);
    expect(rejected.response.headers.get("Set-Cookie")).toBeNull();
    expect(rejected.body).toEqual({
      error: 'Passkey login verify request has unsupported key "redirectTo".',
    });
    expect(accepted.response.status).toBe(200);
    expect(accepted.body).toEqual({
      authenticated: true,
      continueTo: "/formless/auth",
      principal,
      session: { expiresAt: expect.any(String) },
    });
  });

  it("rejects login options before setup is complete", async () => {
    await configureAuth();

    const rejected = await postJson("/api/formless/passkeys/login/options", {});

    expect(rejected.response.status).toBe(409);
    expect(rejected.body).toEqual({
      error: "Owner setup must be complete before passkey login.",
    });
  });

  it("returns a display-safe error when challenge storage rejects login insertion", async () => {
    await seedOwnerPasskey(new VirtualPasskey(credentialId));
    await postJson("/harness/reject-login-challenge-storage", {});

    const rejected = await postJson("/api/formless/passkeys/login/options", {});

    expect(rejected.response.status).toBe(400);
    expect(rejected.body).toEqual({ error: "Account sign in failed." });
  });
});

async function configureAuth() {
  const response = await postJson("/harness/config", {
    canonicalOrigin,
    relyingPartyId,
    relyingPartyName,
  });
  expect(response.response.status).toBe(200);
}
async function seedOwnerPasskey(authenticator: VirtualPasskey) {
  await configureAuth();
  const response = await postJson<{
    owner: {
      createdAt: string;
      email?: string;
      id: string;
      name: string;
    };
  }>("/harness/owner-passkey", {
    credentialId,
    credentialPublicKey: [...authenticator.credentialPublicKey()],
  });

  expect(response.response.status).toBe(200);

  return response.body.owner;
}

function accountPrincipalIdentity(owner: { email?: string; id: string; name: string }) {
  return {
    displayName: owner.name,
    ...(owner.email === undefined ? {} : { email: owner.email }),
    principalId: owner.id,
  };
}

async function createIdentityPrincipal(displayName: string) {
  const response = await postJson<OperationInvocationResponse>(
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/operations/principal/create`,
    {
      idempotencyKey: `account-passkey-principal-${displayName.replace(/\W+/g, "-").toLowerCase()}`,
      input: {
        displayName,
        kind: "human",
        status: "active",
      },
    },
    {
      headers: await programOwnerHeaders(),
    },
  );

  expect(response.response.status).toBe(200);

  if (response.body.output.type !== "create") {
    throw new Error("Expected principal create output.");
  }

  return {
    displayName,
    principalId: response.body.output.record.id,
  };
}

async function assignIdentityRole(principalId: string) {
  const response = await postJson(
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/operations/program-role-assignment/create`,
    {
      idempotencyKey: `account-passkey-role-${principalId.replace(/\W+/g, "-")}`,
      input: {
        principal: principalId,
        roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357",
        status: "active",
      },
    },
    {
      headers: await programOwnerHeaders(),
    },
  );

  expect(response.response.status).toBe(200);
}

async function updateIdentityPrincipalStatus(principalId: string, status: "active" | "disabled") {
  const response = await postJson(
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/operations/principal/update`,
    {
      idempotencyKey: `account-passkey-principal-${status}-${principalId.replace(/\W+/g, "-")}`,
      input: { status },
      recordId: principalId,
    },
    {
      headers: await programOwnerHeaders(),
    },
  );

  expect(response.response.status).toBe(200);
}

async function createStoredCredential(
  credentialIdValue: string,
  principalIdValue: string,
  authenticator: VirtualPasskey,
) {
  const response = await postJson("/harness/credential", {
    credentialId: credentialIdValue,
    credentialPublicKey: [...authenticator.credentialPublicKey()],
    principalId: principalIdValue,
  });

  expect(response.response.status).toBe(200);
}

async function programOwnerHeaders() {
  const response = await harness.durableObjectFetch(
    "FORMLESS_AUTHORITY",
    FORMLESS_INSTANCE_AUTHORITY_NAME,
    "/harness/central-session",
    {
      body: JSON.stringify({ principalId: "owner" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  const cookie = response.headers.get("Set-Cookie");

  expect(response.status).toBe(200);
  expect(cookie).toContain(`${CENTRAL_AUTH_SESSION_COOKIE_NAME}=`);

  return {
    Cookie: cookiePair(cookie),
  };
}

function cookiePair(setCookie: string | null): string {
  if (!setCookie) {
    throw new Error("Expected session cookie.");
  }

  return setCookie.split(";", 1)[0] ?? "";
}

async function loginOptions() {
  const response = await postJson<AccountPasskeyLoginOptionsResponse>(
    "/api/formless/passkeys/login/options",
    {},
  );
  expect(response.response.status).toBe(200);
  return response;
}
async function verifyLogin(
  response: AuthenticationResponseJSON,
  input: {
    redirectTo?: unknown;
  } = {},
) {
  return postJson<
    | AccountPasskeyLoginVerifyResponse
    | {
        authenticated?: false;
        error: string;
      }
  >("/api/formless/passkeys/login/verify", { ...input, response });
}
async function postJson<T = unknown>(path: string, body: unknown, init: HarnessFetchInit = {}) {
  const response = await harness.fetch(path, {
    ...init,
    body: JSON.stringify(body),
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  return {
    body: (await response.json()) as T,
    response,
  };
}

class VirtualPasskey {
  private readonly credentialId: string;
  private readonly privateKey: KeyObject;
  private readonly principalId: string;
  private readonly publicKey: KeyObject;

  constructor(credentialIdValue: string, principalId = "owner") {
    const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });

    this.credentialId = credentialIdValue;
    this.privateKey = pair.privateKey;
    this.principalId = principalId;
    this.publicKey = pair.publicKey;
  }

  authenticationResponse(
    options: PublicKeyCredentialRequestOptionsJSON,
    input: {
      counter: number;
      origin: string;
      rpId: string;
      userHandle?: string;
    },
  ): AuthenticationResponseJSON {
    const clientDataJSON = clientDataJson(options.challenge, input.origin);
    const authenticatorData = authenticationAuthenticatorData({
      counter: input.counter,
      rpId: input.rpId,
    });
    const clientDataHash = sha256(clientDataJSON);
    const signatureBase = concatBytes([authenticatorData, clientDataHash]);
    const signature = createSign("SHA256").update(Buffer.from(signatureBase)).sign(this.privateKey);

    return {
      id: this.credentialId,
      rawId: this.credentialId,
      response: {
        clientDataJSON: base64UrlEncode(clientDataJSON),
        authenticatorData: base64UrlEncode(authenticatorData),
        signature: base64UrlEncode(signature),
        userHandle: base64UrlEncode(new TextEncoder().encode(input.userHandle ?? this.principalId)),
      },
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      type: "public-key",
    };
  }

  credentialPublicKey(): Uint8Array {
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

function authenticationAuthenticatorData(input: { counter: number; rpId: string }) {
  return concatBytes([
    sha256(new TextEncoder().encode(input.rpId)),
    new Uint8Array([0x05]),
    uint32(input.counter),
  ]);
}

function clientDataJson(challenge: string, origin: string) {
  return new TextEncoder().encode(
    JSON.stringify({
      type: "webauthn.get",
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
  if (value < 24) {
    return new Uint8Array([(major << 5) | value]);
  }

  if (value <= 0xff) {
    return new Uint8Array([(major << 5) | 24, value]);
  }

  if (value <= 0xffff) {
    const bytes = new Uint8Array(3);
    new DataView(bytes.buffer).setUint16(1, value, false);
    bytes[0] = (major << 5) | 25;

    return bytes;
  }

  const bytes = new Uint8Array(5);
  new DataView(bytes.buffer).setUint32(1, value, false);
  bytes[0] = (major << 5) | 26;

  return bytes;
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, false);

  return bytes;
}

function sha256(bytes: Uint8Array): Uint8Array {
  return createHash("sha256").update(Buffer.from(bytes)).digest();
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
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

async function writeAccountPasskeyHarness() {
  harnessDir = await mkdtemp(join(tmpdir(), "formless-account-passkey-api-harness-"));
  const path = join(harnessDir, "account-passkey-api-harness.ts");

  await writeFile(
    path,
    `
      import { nowIsoString } from "${process.cwd()}/src/shared/clock.ts";
      import { FormlessAuthority } from "${process.cwd()}/src/worker/authority.ts";
      import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "${process.cwd()}/src/worker/formless-instance.ts";
      import { IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX } from "@dpeek/formless-identity-control-plane";
      import { FORMLESS_PROGRAM_API_ROUTE_PREFIX, FORMLESS_PROGRAM_STORAGE_IDENTITY } from "${process.cwd()}/src/program/target.ts";
      import { ensureIdentityOwner } from "${process.cwd()}/src/worker/identity-control-plane.ts";
      import { createPasskeyCredential, writeInstanceAuthConfig } from "${process.cwd()}/src/worker/instance-auth-state.ts";
      import { createCentralAuthSessionCookie } from "${process.cwd()}/src/worker/central-auth-session.ts";

      export class AccountPasskeyApiHarness extends FormlessAuthority {
        async fetch(request) {
          const url = new URL(request.url);

          if (request.method === "POST" && url.pathname === "/harness/config") {
            const config = writeInstanceAuthConfig(this.ctx.storage, await request.json());

            return Response.json({ config });
          }

          if (request.method === "POST" && url.pathname === "/harness/central-session") {
            const body = await request.json();
            const created = await createCentralAuthSessionCookie(this.ctx.storage, {
              env: this.env,
              now: nowIsoString(),
              principalId: body.principalId,
              request,
            });

            return Response.json(
              { session: created.session },
              { headers: { "Set-Cookie": created.cookie } },
            );
          }

          if (request.method === "POST" && url.pathname === "/harness/owner-passkey") {
            const body = await request.json();
            const owner = await ensureIdentityOwner(this.env, {
              now: nowIsoString(),
              owner: { name: "Ada Owner", email: "ada@example.com" },
              ownerId: "owner",
            });
            const credential = createPasskeyCredential(this.ctx.storage, {
              credentialId: body.credentialId,
              principalId: owner.id,
              publicKey: new Uint8Array(body.credentialPublicKey),
              counter: 0,
              transports: ["internal"],
              credentialDeviceType: "singleDevice",
              credentialBackedUp: false,
              createdAt: nowIsoString(),
              updatedAt: nowIsoString(),
            });

            return Response.json({ credential, owner });
          }

          if (request.method === "POST" && url.pathname === "/harness/credential") {
            const body = await request.json();
            const credential = createPasskeyCredential(this.ctx.storage, {
              credentialId: body.credentialId,
              principalId: body.principalId ?? "existing-principal",
              publicKey: new Uint8Array(body.credentialPublicKey),
              counter: 0,
              transports: ["internal"],
              credentialDeviceType: "singleDevice",
              credentialBackedUp: false,
              createdAt: nowIsoString(),
              updatedAt: nowIsoString(),
            });

            return Response.json(credential);
          }

          if (
            request.method === "POST" &&
            url.pathname === "/harness/reject-login-challenge-storage"
          ) {
            this.ctx.storage.transactionSync(() => {
              this.ctx.storage.sql.exec(
                "DROP INDEX IF EXISTS idx_instance_auth_challenges_expires_at",
              );
              this.ctx.storage.sql.exec("DROP TABLE instance_auth_challenges");
              this.ctx.storage.sql.exec(\`
                CREATE TABLE instance_auth_challenges (
                  id TEXT PRIMARY KEY,
                  kind TEXT NOT NULL CHECK (kind IN ('login', 'registration')),
                  challenge TEXT NOT NULL UNIQUE,
                  invitation_id TEXT,
                  invitation_token_hash TEXT,
                  principal_id TEXT,
                  registration_origin TEXT,
                  registration_relying_party_id TEXT,
                  created_at TEXT NOT NULL,
                  expires_at TEXT NOT NULL,
                  consumed_at TEXT,
                  CHECK (kind != 'login')
                )
              \`);
            });

            return Response.json({ rejected: true });
          }

          return super.fetch(request);
        }
      }

      export default {
        fetch(request, env) {
          const pathname = new URL(request.url).pathname;
          const authorityName =
            pathname.startsWith(IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX) ||
            pathname.startsWith(FORMLESS_PROGRAM_API_ROUTE_PREFIX)
            ? FORMLESS_PROGRAM_STORAGE_IDENTITY
            : FORMLESS_INSTANCE_AUTHORITY_NAME;
          const id = env.FORMLESS_AUTHORITY.idFromName(authorityName);

          return env.FORMLESS_AUTHORITY.get(id).fetch(request);
        },
      };
    `,
  );

  return path;
}
