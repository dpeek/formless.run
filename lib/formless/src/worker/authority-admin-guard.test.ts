import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { BootstrapResponse, OwnerIdentity } from "../shared/protocol.ts";
import type { SitePageTreeResponse } from "@dpeek/formless-site-app";
import {
  instanceControlPlaneTestStorageSnapshot,
  restoreTestStorageSnapshot,
} from "../test/authority-write.ts";
import { ensureTestIdentityOwner, resetTestIdentityStorage } from "../test/identity-owner.ts";
import { testSiteRecords } from "../test/site-records.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { createOwnerSessionCookie } from "./owner-session.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";
const sessionSecret = "test-session-secret";
const owner: OwnerIdentity = {
  id: "owner-1",
  name: "Ada Owner",
  email: "ada@example.com",
  createdAt: "2026-05-21T00:00:00.000Z",
};

let harness: Harness;

beforeAll(async () => {
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        FORMLESS_OWNER_SESSION_SECRET: sessionSecret,
      },
    },
  );
});

beforeEach(async () => {
  await resetTestIdentityStorage(harness, adminToken);
  await restoreTestStorageSnapshot(
    harness,
    "/api/formless/program/snapshot/restore",
    instanceControlPlaneTestStorageSnapshot(testSiteRecords),
    adminHeaders(),
  );
});

afterAll(async () => {
  await harness.dispose();
});

describe("authority admin guard", () => {
  it("rejects protected write endpoints before parsing request JSON", async () => {
    const protectedRoutes = [
      "/api/formless/program/schema",
      "/api/formless/program/snapshot/restore",
      "/api/formless/program/reset/schema",
    ];

    for (const route of protectedRoutes) {
      const response = await harness.fetch(route, {
        body: "not-json",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
      expect(
        (await response.json()) as {
          error: string;
        },
      ).toEqual({
        error: "Owner session or admin authorization is required for this write endpoint.",
      });
    }
  });

  it("accepts the configured admin bearer token for management writes", async () => {
    const before = await getJson<BootstrapResponse>(
      "/api/formless/program/bootstrap",
      adminHeaders(),
    );
    const response = await harness.fetch("/api/formless/program/schema", {
      body: JSON.stringify({ schema: before.schema }),
      headers: adminHeaders(),
      method: "POST",
    });

    expect(response.status).toBe(200);
  });

  it("accepts signed owner session cookies for management writes", async () => {
    const headers = {
      ...(await ownerSessionHeaders()),
      "Content-Type": "application/json",
    };
    const before = await getJson<BootstrapResponse>("/api/formless/program/bootstrap", headers);
    const response = await harness.fetch("/api/formless/program/schema", {
      body: JSON.stringify({ schema: before.schema }),
      headers,
      method: "POST",
    });

    expect(response.status).toBe(200);
  });

  it("rejects signed owner session cookies for writes when current owner authority is missing", async () => {
    const before = await getJson<BootstrapResponse>(
      "/api/formless/program/bootstrap",
      adminHeaders(),
    );
    const created = await createOwnerSessionCookie({
      env: { FORMLESS_OWNER_SESSION_SECRET: sessionSecret },
      maxAgeSeconds: 60,
      now: "2999-01-01T00:00:00.000Z",
      owner,
      request: new Request("http://example.com/admin"),
    });
    const response = await harness.fetch("/api/formless/program/schema", {
      body: JSON.stringify({ schema: before.schema }),
      headers: {
        Cookie: cookiePair(created.cookie),
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const after = await getJson<BootstrapResponse>(
      "/api/formless/program/bootstrap",
      adminHeaders(),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Owner session or admin authorization is required for this write endpoint.",
    });
    expect(after.schema).toEqual(before.schema);
  });

  it("keeps public Site tree reads open while guarding Program bootstrap", async () => {
    const tree = await getJson<SitePageTreeResponse>("/api/formless/program/tree/home");
    const unauthorized = await harness.fetch("/api/formless/program/bootstrap");
    const bootstrap = await getJson<BootstrapResponse>(
      "/api/formless/program/bootstrap",
      adminHeaders(),
    );

    expect(tree.page.id).toBe("rec_site_content_home");
    expect(unauthorized.status).toBe(401);
    expect(bootstrap.records).toEqual(expect.any(Array));
  });
});

async function getJson<T>(path: string, headers: Record<string, string> = {}) {
  const response = await harness.fetch(path, { headers });

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

function adminHeaders() {
  return {
    Authorization: `Bearer ${adminToken}`,
    "Content-Type": "application/json",
  };
}

async function ownerSessionHeaders() {
  const identityOwner = await ensureTestIdentityOwner(harness, adminToken, owner);
  const created = await createOwnerSessionCookie({
    env: { FORMLESS_OWNER_SESSION_SECRET: sessionSecret },
    maxAgeSeconds: 60,
    now: "2999-01-01T00:00:00.000Z",
    owner: identityOwner,
    request: new Request("http://example.com/admin"),
  });

  return {
    Cookie: cookiePair(created.cookie),
  };
}

function cookiePair(cookie: string) {
  return cookie.split(";")[0] ?? cookie;
}
