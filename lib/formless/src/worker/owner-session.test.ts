import { describe, expect, it } from "vite-plus/test";
import {
  LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
} from "@dpeek/formless-gateway";

import type { OwnerIdentity } from "../shared/protocol.ts";
import { authorizeInstanceWrite, authorizeOperationalManagement } from "./authority-admin-guard.ts";
import type { ActiveIdentityAuthority } from "./identity-owner-internal.ts";
import {
  OWNER_SESSION_COOKIE_NAME,
  createOwnerSessionCookie,
  validateOwnerSessionAuthority,
  validateOwnerSessionCookie,
} from "./owner-session.ts";

const owner: OwnerIdentity = {
  id: "owner-1",
  name: "Ada Owner",
  email: "ada@example.com",
  createdAt: "2026-05-21T00:00:00.000Z",
};
const issuedAt = "2026-05-21T00:00:00.000Z";
const futureIssuedAt = "2999-01-01T00:00:00.000Z";
const sessionSecret = "session-secret";
const adminToken = "admin-token";
const localOwnerSessionEnv = {
  FORMLESS_OWNER_SESSION_SECRET: sessionSecret,
  FORMLESS_RUNTIME_PROFILE: "instance",
  [LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV]: "local-bootstrap-token",
  [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: "local-proxy-token",
  [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]: "http://127.0.0.1:4111",
};

describe("owner session cookies", () => {
  it("creates host-scoped HTTP-only owner session cookies", async () => {
    const created = await createOwnerSessionCookie({
      env: { FORMLESS_OWNER_SESSION_SECRET: sessionSecret },
      maxAgeSeconds: 60,
      now: issuedAt,
      owner,
      request: request("https://example.com/admin"),
    });
    const validated = await validateOwnerSessionCookie(
      requestWithCookie(created.cookie, "https://example.com/admin"),
      { FORMLESS_OWNER_SESSION_SECRET: sessionSecret },
      { now: issuedAt },
    );

    expect(created.session).toEqual({
      expiresAt: "2026-05-21T00:01:00.000Z",
      instanceId: "example.com",
      issuedAt,
      principalId: "owner-1",
    });
    expect(created.cookie).toContain(`${OWNER_SESSION_COOKIE_NAME}=`);
    expect(created.cookie).toContain("Path=/");
    expect(created.cookie).toContain("Max-Age=60");
    expect(created.cookie).toContain("Expires=Thu, 21 May 2026 00:01:00 GMT");
    expect(created.cookie).toContain("HttpOnly");
    expect(created.cookie).toContain("SameSite=Lax");
    expect(created.cookie).toContain("Secure");
    expect(created.cookie).not.toContain("Domain=");
    expect(validated).toEqual({ ok: true, session: created.session });
  });

  it("omits the Secure cookie attribute for HTTP requests", async () => {
    const created = await createOwnerSessionCookie({
      env: { FORMLESS_OWNER_SESSION_SECRET: sessionSecret },
      maxAgeSeconds: 60,
      now: issuedAt,
      owner,
      request: request("http://example.com/admin"),
    });

    expect(created.cookie).not.toContain("Secure");
  });

  it("can derive the signing secret from the admin token", async () => {
    const created = await createOwnerSessionCookie({
      env: { FORMLESS_ADMIN_TOKEN: adminToken },
      maxAgeSeconds: 60,
      now: issuedAt,
      owner,
      request: request("https://example.com/admin"),
    });
    const validated = await validateOwnerSessionCookie(
      requestWithCookie(created.cookie, "https://example.com/admin"),
      { FORMLESS_ADMIN_TOKEN: adminToken },
      { now: issuedAt },
    );

    expect(validated).toEqual({ ok: true, session: created.session });
  });

  it("rejects missing secrets, missing cookies, malformed cookies, and tampered cookies", async () => {
    const created = await createOwnerSessionCookie({
      env: { FORMLESS_OWNER_SESSION_SECRET: sessionSecret },
      maxAgeSeconds: 60,
      now: issuedAt,
      owner,
      request: request("https://example.com/admin"),
    });
    const pair = cookiePair(created.cookie);
    const tamperedCookie = `${pair.slice(0, -1)}${pair.endsWith("x") ? "y" : "x"}`;

    await expectSessionResult(
      validateOwnerSessionCookie(request("https://example.com/admin"), {
        FORMLESS_OWNER_SESSION_SECRET: sessionSecret,
      }),
      { ok: false, reason: "missing-cookie" },
    );
    await expectSessionResult(
      validateOwnerSessionCookie(
        requestWithCookie(created.cookie, "https://example.com/admin"),
        {},
      ),
      { ok: false, reason: "missing-secret" },
    );
    await expectSessionResult(
      validateOwnerSessionCookie(
        requestWithCookie(`${OWNER_SESSION_COOKIE_NAME}=not-signed`, "https://example.com/admin"),
        { FORMLESS_OWNER_SESSION_SECRET: sessionSecret },
      ),
      { ok: false, reason: "malformed-cookie" },
    );
    await expectSessionResult(
      validateOwnerSessionCookie(requestWithCookie(tamperedCookie, "https://example.com/admin"), {
        FORMLESS_OWNER_SESSION_SECRET: sessionSecret,
      }),
      { ok: false, reason: "tampered-cookie" },
    );
  });

  it("rejects malformed, wrong-purpose, wrong-instance, and expired payloads", async () => {
    const malformedPayload = await signedCookie(
      {
        expiresAt: "2026-05-21T00:01:00.000Z",
        instanceId: "example.com",
        issuedAt,
        purpose: "owner-session",
        version: 1,
      },
      sessionSecret,
    );
    const wrongPurpose = await signedCookie(
      {
        expiresAt: "2026-05-21T00:01:00.000Z",
        instanceId: "example.com",
        issuedAt,
        principalId: "owner-1",
        purpose: "setup-token",
        version: 1,
      },
      sessionSecret,
    );
    const valid = await createOwnerSessionCookie({
      env: { FORMLESS_OWNER_SESSION_SECRET: sessionSecret },
      maxAgeSeconds: 60,
      now: issuedAt,
      owner,
      request: request("https://example.com/admin"),
    });

    await expectSessionResult(
      validateOwnerSessionCookie(requestWithCookie(malformedPayload, "https://example.com/admin"), {
        FORMLESS_OWNER_SESSION_SECRET: sessionSecret,
      }),
      { ok: false, reason: "malformed-payload" },
    );
    await expectSessionResult(
      validateOwnerSessionCookie(requestWithCookie(wrongPurpose, "https://example.com/admin"), {
        FORMLESS_OWNER_SESSION_SECRET: sessionSecret,
      }),
      { ok: false, reason: "wrong-purpose" },
    );
    await expectSessionResult(
      validateOwnerSessionCookie(
        requestWithCookie(valid.cookie, "https://other.example.com/admin"),
        {
          FORMLESS_OWNER_SESSION_SECRET: sessionSecret,
        },
      ),
      { ok: false, reason: "wrong-instance" },
    );
    await expectSessionResult(
      validateOwnerSessionCookie(
        requestWithCookie(valid.cookie, "https://example.com/admin"),
        { FORMLESS_OWNER_SESSION_SECRET: sessionSecret },
        { now: "2026-05-21T00:01:00.000Z" },
      ),
      { ok: false, reason: "expired" },
    );
  });
});

describe("shared write authorization", () => {
  it("keeps writes open when no write protection is configured", async () => {
    await expectAuthorizationResult(
      authorizeInstanceWrite(request("https://example.com/api"), {}),
      {
        authorized: true,
        via: "open",
      },
    );
  });

  it("accepts the configured admin bearer token", async () => {
    await expectAuthorizationResult(
      authorizeInstanceWrite(
        request("https://example.com/api", { Authorization: `Bearer ${adminToken}` }),
        { FORMLESS_ADMIN_TOKEN: adminToken },
      ),
      { authorized: true, via: "admin-bearer" },
    );
  });

  it("accepts valid owner session cookies without exposing the admin token to JavaScript", async () => {
    const created = await createOwnerSessionCookie({
      env: { FORMLESS_OWNER_SESSION_SECRET: sessionSecret },
      maxAgeSeconds: 60,
      now: futureIssuedAt,
      owner,
      request: request("https://example.com/admin"),
    });

    await expectAuthorizationResult(
      authorizeInstanceWrite(
        requestWithCookie(created.cookie, "https://example.com/api"),
        {
          FORMLESS_ADMIN_TOKEN: adminToken,
          ...localOwnerSessionEnv,
        },
        {
          resolveOwnerSession: async (session) => (session.principalId === owner.id ? owner : null),
        },
      ),
      {
        authorized: true,
        session: created.session,
        via: "owner-session",
      },
    );
  });

  it("rejects valid owner session cookies outside local owner-session fallback", async () => {
    const created = await createOwnerSessionCookie({
      env: { FORMLESS_OWNER_SESSION_SECRET: sessionSecret },
      maxAgeSeconds: 60,
      now: futureIssuedAt,
      owner,
      request: request("https://example.com/admin"),
    });

    await expectAuthorizationResult(
      authorizeInstanceWrite(
        requestWithCookie(created.cookie, "https://example.com/api"),
        {
          FORMLESS_ADMIN_TOKEN: adminToken,
          FORMLESS_OWNER_SESSION_SECRET: sessionSecret,
        },
        {
          resolveOwnerSession: async (session) => (session.principalId === owner.id ? owner : null),
        },
      ),
      {
        authorized: false,
        error: "Owner session or admin authorization is required for this write endpoint.",
        headers: {
          "WWW-Authenticate": 'Bearer realm="formless-admin"',
        },
        status: 401,
      },
    );
  });

  it("rejects stale signed owner session cookies without current owner authority", async () => {
    const created = await createOwnerSessionCookie({
      env: { FORMLESS_OWNER_SESSION_SECRET: sessionSecret },
      maxAgeSeconds: 60,
      now: futureIssuedAt,
      owner,
      request: request("https://example.com/admin"),
    });
    const authority = await validateOwnerSessionAuthority(
      requestWithCookie(created.cookie, "https://example.com/api"),
      { FORMLESS_OWNER_SESSION_SECRET: sessionSecret },
      { resolveOwnerSession: async () => null },
    );

    await expectAuthorizationResult(
      authorizeInstanceWrite(
        requestWithCookie(created.cookie, "https://example.com/api"),
        {
          FORMLESS_ADMIN_TOKEN: adminToken,
          ...localOwnerSessionEnv,
        },
        { resolveOwnerSession: async () => null },
      ),
      {
        authorized: false,
        error: "Owner session or admin authorization is required for this write endpoint.",
        headers: {
          "WWW-Authenticate": 'Bearer realm="formless-admin"',
        },
        status: 401,
      },
    );
    expect(authority).toEqual({ ok: false, reason: "missing-owner-authority" });
  });

  it("rejects unauthenticated writes when bearer or owner-session protection is configured", async () => {
    const bearerProtected = await authorizeInstanceWrite(request("https://example.com/api"), {
      FORMLESS_ADMIN_TOKEN: adminToken,
    });
    const sessionProtected = await authorizeInstanceWrite(request("https://example.com/api"), {
      FORMLESS_OWNER_SESSION_SECRET: sessionSecret,
    });

    expect(bearerProtected).toEqual({
      authorized: false,
      error: "Owner session or admin authorization is required for this write endpoint.",
      headers: {
        "WWW-Authenticate": 'Bearer realm="formless-admin"',
      },
      status: 401,
    });
    expect(sessionProtected).toEqual(bearerProtected);
  });
});

describe("operational management authorization", () => {
  it("accepts current owner or Program administrator authority from a signed principal session", async () => {
    for (const callerFacts of [
      { active: true, kind: "principal" as const, owner: true },
      {
        active: true,
        kind: "principal" as const,
        owner: false,
        roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357" as const,
      },
      {
        active: true,
        kind: "principal" as const,
        owner: true,
        roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357" as const,
      },
    ]) {
      const created = await createOwnerSessionCookie({
        env: { FORMLESS_OWNER_SESSION_SECRET: sessionSecret },
        maxAgeSeconds: 60,
        now: futureIssuedAt,
        owner,
        request: request("https://example.com/admin"),
      });

      await expectAuthorizationResult(
        authorizeOperationalManagement(
          requestWithCookie(created.cookie, "https://example.com/api"),
          localOwnerSessionEnv,
          {
            resolveManagementAuthority: async (session) => ({
              callerFacts,
              id: session.principalId,
            }),
          },
        ),
        {
          authorized: true,
          session: created.session,
          via: "owner-session",
        },
      );
    }
  });

  it("rejects active principals without management authority and stale principal state", async () => {
    await expectRejectedOperationalManagement({
      callerFacts: { active: true, kind: "principal", owner: false },
      id: owner.id,
    });
    await expectRejectedOperationalManagement(null);
    await expectRejectedOperationalManagement({
      callerFacts: { active: false, kind: "principal", owner: false },
      id: owner.id,
    });
  });

  it("accepts admin bearer and fails closed when no protection is configured", async () => {
    await expectAuthorizationResult(
      authorizeOperationalManagement(request("https://example.com/api"), {}),
      {
        authorized: false,
        error:
          "Owner session, Program administrator session, or admin authorization is required for this endpoint.",
        headers: { "WWW-Authenticate": 'Bearer realm="formless-admin"' },
        status: 401,
      },
    );
    await expectAuthorizationResult(
      authorizeOperationalManagement(
        request("https://example.com/api", { Authorization: `Bearer ${adminToken}` }),
        { FORMLESS_ADMIN_TOKEN: adminToken },
      ),
      {
        authorized: true,
        via: "admin-bearer",
      },
    );
  });
});

function request(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers });
}

function requestWithCookie(cookie: string, url: string) {
  return request(url, { Cookie: cookiePair(cookie) });
}

function cookiePair(cookie: string) {
  return cookie.split(";")[0] ?? cookie;
}

async function expectSessionResult(
  actual: Promise<Awaited<ReturnType<typeof validateOwnerSessionCookie>>>,
  expected: Awaited<ReturnType<typeof validateOwnerSessionCookie>>,
) {
  expect(await actual).toEqual(expected);
}

async function expectAuthorizationResult(
  actual: Promise<Awaited<ReturnType<typeof authorizeInstanceWrite>>>,
  expected: Awaited<ReturnType<typeof authorizeInstanceWrite>>,
) {
  expect(await actual).toEqual(expected);
}
async function expectRejectedOperationalManagement(authority: ActiveIdentityAuthority | null) {
  const created = await createOwnerSessionCookie({
    env: { FORMLESS_OWNER_SESSION_SECRET: sessionSecret },
    maxAgeSeconds: 60,
    now: futureIssuedAt,
    owner,
    request: request("https://example.com/admin"),
  });

  await expectAuthorizationResult(
    authorizeOperationalManagement(
      requestWithCookie(created.cookie, "https://example.com/api"),
      localOwnerSessionEnv,
      { resolveManagementAuthority: async () => authority },
    ),
    {
      authorized: false,
      error:
        "Owner session, Program administrator session, or admin authorization is required for this endpoint.",
      headers: {
        "WWW-Authenticate": 'Bearer realm="formless-admin"',
      },
      status: 401,
    },
  );
}

async function signedCookie(payload: unknown, secret: string) {
  const payloadPart = base64UrlEncodeUtf8(JSON.stringify(payload));
  const signature = await signString(payloadPart, secret);

  return `${OWNER_SESSION_COOKIE_NAME}=${payloadPart}.${signature}`;
}

async function signString(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));

  return base64UrlEncode(new Uint8Array(signature));
}

function base64UrlEncodeUtf8(value: string) {
  return base64UrlEncode(new TextEncoder().encode(value));
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
