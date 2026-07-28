import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;
type HarnessResponse = Awaited<ReturnType<Harness["fetch"]>>;

const authOrigin = "https://auth.example.com";
const otherOrigin = "https://other.example.com";
const relyingPartyName = "Formless";
const sessionSecret = "central-session-secret";
const principalId = "principal-1";
const inactivePrincipalId = "principal-inactive";
const issuedAt = "2026-05-21T00:00:00.000Z";
const expiresAt = "2026-05-21T00:01:00.000Z";
const revokedAt = "2026-05-21T00:00:30.000Z";

let harness: Harness;
let centralAuthHarnessDir: string | undefined;
let centralAuthHarnessName: string;

beforeAll(async () => {
  harness = await createWorkerHarness(
    await writeCentralAuthHarness(),
    { CENTRAL_AUTH_HARNESS: { className: "CentralAuthHarness", useSQLite: true } },
    { bindings: { FORMLESS_OWNER_SESSION_SECRET: sessionSecret } },
  );
});

beforeEach(() => {
  centralAuthHarnessName = randomUUID();
});

afterAll(async () => {
  await harness.dispose();

  if (centralAuthHarnessDir) {
    await rm(centralAuthHarnessDir, { recursive: true, force: true });
    centralAuthHarnessDir = undefined;
  }
});

describe("central auth session cookies", () => {
  it("creates, validates, clears, and revokes auth-origin cookies backed by central rows", async () => {
    await writeConfig(authOrigin);
    const created = await createSession();
    const setCookie = requiredHeader(created, "Set-Cookie");
    const createBody = (await created.json()) as {
      session: CentralAuthSessionBody;
    };
    const stored = await readCentralSession(createBody.session.sessionIdHash);
    const validated = await validateSession(cookiePair(setCookie));
    const clear = await fetchCentralAuth("/session/clear", {
      headers: originHeaders(authOrigin),
    });
    const revoked = await revokeSession(cookiePair(setCookie));
    const revokedBody = (await revoked.json()) as {
      ok: true;
      session: CentralAuthSessionBody;
    };
    const rejectedAfterRevoke = await validateSession(cookiePair(setCookie));
    expect(createBody.session).toEqual({
      expiresAt,
      instanceId: "auth.example.com",
      issuedAt,
      principalId,
      sessionIdHash: expect.any(String),
    });
    expect(stored.session).toEqual(createBody.session);
    expect(setCookie).toContain("formless_auth_session=");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=60");
    expect(setCookie).toContain("Expires=Thu, 21 May 2026 00:01:00 GMT");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Secure");
    expect(setCookie).not.toContain("Domain=");
    expect(validated).toEqual({ ok: true, session: createBody.session });
    expect(requiredHeader(clear, "Set-Cookie")).toContain("formless_auth_session=; Path=/");
    expect(requiredHeader(clear, "Set-Cookie")).toContain("Max-Age=0");
    expect(revokedBody).toEqual({
      ok: true,
      session: {
        ...createBody.session,
        revokedAt,
      },
    });
    expect(rejectedAfterRevoke).toEqual({ ok: false, reason: "revoked-session" });
  });

  it("rejects missing, expired, revoked, tampered, wrong-host, and wrong-instance cookies", async () => {
    await writeConfig(authOrigin);

    const created = await createSession();
    const cookie = cookiePair(requiredHeader(created, "Set-Cookie"));
    const tamperedCookie = `${cookie.slice(0, -1)}${cookie.endsWith("x") ? "y" : "x"}`;

    expect(await validateSession(undefined)).toEqual({ ok: false, reason: "missing-cookie" });
    expect(await validateSession(cookie, { now: expiresAt })).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(
      await validateSession(cookie, {
        origin: otherOrigin,
      }),
    ).toEqual({ ok: false, reason: "wrong-host" });
    expect(await validateSession(tamperedCookie)).toEqual({
      ok: false,
      reason: "tampered-cookie",
    });

    await revokeSession(cookie);
    expect(await validateSession(cookie)).toEqual({ ok: false, reason: "revoked-session" });

    await writeConfig(otherOrigin);
    const otherCreated = await createSession({ origin: otherOrigin });
    const otherCookie = cookiePair(requiredHeader(otherCreated, "Set-Cookie"));

    await writeConfig(authOrigin);
    expect(await validateSession(otherCookie)).toEqual({ ok: false, reason: "wrong-instance" });
  });

  it("rejects central sessions for principals that are no longer active", async () => {
    await writeConfig(authOrigin);

    const created = await createSession({ principalId: inactivePrincipalId });
    const cookie = cookiePair(requiredHeader(created, "Set-Cookie"));

    expect(
      await validateSession(cookie, {
        activePrincipalIds: [principalId],
      }),
    ).toEqual({ ok: false, reason: "missing-principal" });
  });
});

type CentralAuthSessionBody = {
  expiresAt: string;
  instanceId: string;
  issuedAt: string;
  principalId: string;
  revokedAt?: string;
  sessionIdHash: string;
};

async function writeConfig(origin: string) {
  const response = await fetchCentralAuth("/config", {
    body: JSON.stringify({
      canonicalOrigin: origin,
      relyingPartyId: new URL(origin).hostname,
      relyingPartyName,
      now: issuedAt,
    }),
    headers: originHeaders(origin),
    method: "POST",
  });
  expect(response.status).toBe(200);
}
async function createSession(
  input: {
    origin?: string;
    principalId?: string;
  } = {},
) {
  const response = await fetchCentralAuth("/session/create", {
    body: JSON.stringify({
      maxAgeSeconds: 60,
      now: issuedAt,
      principalId: input.principalId ?? principalId,
    }),
    headers: originHeaders(input.origin ?? authOrigin),
    method: "POST",
  });

  expect(response.status).toBe(200);

  return response;
}

async function validateSession(
  cookie: string | undefined,
  input: {
    activePrincipalIds?: string[];
    now?: string;
    origin?: string;
  } = {},
) {
  const headers = {
    ...originHeaders(input.origin ?? authOrigin),
    ...(cookie === undefined ? {} : { Cookie: cookie }),
  };
  const response = await fetchCentralAuth("/session/validate", {
    body: JSON.stringify({
      activePrincipalIds: input.activePrincipalIds ?? [principalId, inactivePrincipalId],
      now: input.now ?? issuedAt,
    }),
    headers,
    method: "POST",
  });

  expect(response.status).toBe(200);

  return response.json();
}

async function revokeSession(cookie: string) {
  const response = await fetchCentralAuth("/session/revoke", {
    body: JSON.stringify({ now: revokedAt }),
    headers: {
      ...originHeaders(authOrigin),
      Cookie: cookie,
    },
    method: "POST",
  });

  expect(response.status).toBe(200);

  return response;
}

async function readCentralSession(sessionIdHash: string) {
  const response = await fetchCentralAuth(
    `/central-session?idHash=${encodeURIComponent(sessionIdHash)}`,
    {
      headers: originHeaders(authOrigin),
    },
  );
  expect(response.status).toBe(200);
  return (await response.json()) as {
    session: CentralAuthSessionBody | null;
  };
}
function fetchCentralAuth(path: string, init: Parameters<Harness["fetch"]>[1] = {}) {
  return harness.fetch(path, {
    ...init,
    headers: {
      "x-central-auth-harness-name": centralAuthHarnessName,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

function originHeaders(origin: string): Record<string, string> {
  const url = new URL(origin);

  return {
    "x-forwarded-host": url.host,
    "x-forwarded-proto": url.protocol.replace(/:$/, ""),
  };
}

function requiredHeader(response: Pick<HarnessResponse, "headers">, name: string): string {
  const value = response.headers.get(name);

  if (!value) {
    throw new Error(`Missing ${name} header.`);
  }

  return value;
}

function cookiePair(cookie: string): string {
  return cookie.split(";")[0] ?? cookie;
}

async function writeCentralAuthHarness() {
  centralAuthHarnessDir = await mkdtemp(join(tmpdir(), "formless-central-auth-harness-"));
  const tempDir = centralAuthHarnessDir;
  const harnessPath = join(tempDir, "central-auth-harness.ts");

  await writeFile(
    harnessPath,
    `
      import { DurableObject } from "cloudflare:workers";
      import {
        clearCentralAuthSessionCookie,
        createCentralAuthSessionCookie,
        revokeCentralAuthSessionCookie,
        validateCentralAuthSessionCookie,
      } from "${process.cwd()}/src/worker/central-auth-session.ts";
      import {
        ensureInstanceAuthTables,
        readCentralAuthSession,
        writeInstanceAuthConfig,
      } from "${process.cwd()}/src/worker/instance-auth-state.ts";

      export class CentralAuthHarness extends DurableObject {
        constructor(ctx, env) {
          super(ctx, env);
          this.env = env;
          ensureInstanceAuthTables(ctx.storage);
        }

        async fetch(request) {
          const url = new URL(request.url);
          const authEnv = {
            FORMLESS_OWNER_SESSION_SECRET: this.env.FORMLESS_OWNER_SESSION_SECRET,
          };

          try {
            if (request.method === "POST" && url.pathname === "/config") {
              return Response.json(writeInstanceAuthConfig(this.ctx.storage, await request.json()));
            }

            if (request.method === "POST" && url.pathname === "/session/create") {
              const body = await request.json();
              const created = await createCentralAuthSessionCookie(this.ctx.storage, {
                env: authEnv,
                maxAgeSeconds: body.maxAgeSeconds,
                now: body.now,
                principalId: body.principalId,
                request,
              });

              return Response.json(
                { session: created.session },
                { headers: { "Set-Cookie": created.cookie } },
              );
            }

            if (request.method === "POST" && url.pathname === "/session/validate") {
              const body = await request.json();
              const activePrincipalIds = new Set(
                Array.isArray(body.activePrincipalIds) ? body.activePrincipalIds : [],
              );

              return Response.json(
                await validateCentralAuthSessionCookie(request, this.ctx.storage, authEnv, {
                  now: body.now,
                  resolveActivePrincipal: async (principalId) =>
                    activePrincipalIds.has(principalId) ? { id: principalId } : null,
                }),
              );
            }

            if (request.method === "POST" && url.pathname === "/session/revoke") {
              const body = await request.json();

              return Response.json(
                await revokeCentralAuthSessionCookie(request, this.ctx.storage, authEnv, {
                  now: body.now,
                }),
              );
            }

            if (request.method === "GET" && url.pathname === "/session/clear") {
              return Response.json(
                { cleared: true },
                { headers: { "Set-Cookie": clearCentralAuthSessionCookie(request) } },
              );
            }

            if (request.method === "GET" && url.pathname === "/central-session") {
              return Response.json({
                session: readCentralAuthSession(this.ctx.storage, url.searchParams.get("idHash")) ?? null,
              });
            }

            return Response.json({ error: "Not found." }, { status: 404 });
          } catch (error) {
            return Response.json(
              { error: error instanceof Error ? error.message : "Unknown error." },
              { status: 400 },
            );
          }
        }
      }

      export default {
        fetch(request, env) {
          const id = env.CENTRAL_AUTH_HARNESS.idFromName(
            request.headers.get("x-central-auth-harness-name") ?? "default",
          );

          return env.CENTRAL_AUTH_HARNESS.get(id).fetch(request);
        },
      };
    `,
  );

  return harnessPath;
}
