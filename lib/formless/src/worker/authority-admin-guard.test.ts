import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import type { BootstrapResponse, OwnerIdentity } from "../shared/protocol.ts";
import type { SitePageTreeResponse } from "@dpeek/formless-site-app";
import type { SchemaKey } from "../shared/schema-apps.ts";
import {
  operationWriteRequest,
  recordOperationRequest,
  restoreTestStorageSnapshot,
  schemaAppTestStorageSnapshot,
} from "../test/authority-write.ts";
import { ensureTestIdentityOwner, resetTestIdentityStorage } from "../test/identity-owner.ts";
import { siteSourceSchema, taskTestRecords } from "../test/schema-apps.ts";
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
  await resetSchemaApp("tasks");
  await resetSchemaApp("site");
});

afterAll(async () => {
  await harness.dispose();
});

describe("authority admin guard", () => {
  it("rejects protected write endpoints before parsing request JSON", async () => {
    const protectedRoutes = [
      "/api/tasks/schema",
      "/api/tasks/snapshot/restore",
      "/api/tasks/operations/task/create",
      "/api/tasks/mutations",
      "/api/tasks/actions",
      "/api/tasks/reset/schema",
      "/api/tasks/package-migrations/apply",
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

  it("accepts the configured admin bearer token for write endpoints", async () => {
    const created = await postAdminTaskRecordOperation({
      idempotencyKey: "write-admin-guard-allowed",
      entity: "task",
      operationName: "create",
      input: { title: "Authorized write", done: false },
    });
    const bootstrap = await getJson<BootstrapResponse>("/api/tasks/bootstrap");

    expect(created.record.values.title).toBe("Authorized write");
    expect(bootstrap.records).toEqual([...taskTestRecords, created.record]);
  });

  it("accepts signed owner session cookies for write endpoints", async () => {
    const created = await postOwnerTaskRecordOperation({
      idempotencyKey: "write-owner-session-allowed",
      entity: "task",
      operationName: "create",
      input: { title: "Owner session write", done: false },
    });
    const bootstrap = await getJson<BootstrapResponse>("/api/tasks/bootstrap");

    expect(created.record.values.title).toBe("Owner session write");
    expect(bootstrap.records).toEqual([...taskTestRecords, created.record]);
  });

  it("rejects signed owner session cookies for writes when current owner authority is missing", async () => {
    const created = await createOwnerSessionCookie({
      env: { FORMLESS_OWNER_SESSION_SECRET: sessionSecret },
      maxAgeSeconds: 60,
      now: "2999-01-01T00:00:00.000Z",
      owner,
      request: new Request("http://example.com/admin"),
    });
    const request = recordOperationRequest({
      idempotencyKey: "write-owner-session-stale",
      entity: "task",
      operationName: "create",
      input: { title: "Rejected stale owner session write", done: false },
    });
    const response = await harness.fetch(`/api/tasks${request.path.slice("/api".length)}`, {
      body: JSON.stringify(request.body),
      headers: {
        Cookie: cookiePair(created.cookie),
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const bootstrap = await getJson<BootstrapResponse>("/api/tasks/bootstrap");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Owner session or admin authorization is required for this write endpoint.",
    });
    expect(bootstrap.records).toEqual(taskTestRecords);
  });

  it("keeps public Site tree reads open while guarding Site writes", async () => {
    await postAdminJson<BootstrapResponse>("/api/site/snapshot/restore", siteStorageSnapshot());

    const tree = await getJson<SitePageTreeResponse>("/api/site/tree/home");
    const before = await getJson<BootstrapResponse>("/api/site/bootstrap");
    const write = await harness.fetch("/api/site/mutations", {
      body: "{}",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const bootstrap = await getJson<BootstrapResponse>("/api/site/bootstrap");

    expect(tree.page.id).toBe("rec_site_content_home");
    expect(write.status).toBe(401);
    expectRecordsIgnoringOrder(bootstrap.records, before.records);
  });
});

function siteStorageSnapshot(): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: "site",
    schemaKey: "site",
    exportedAt: "2026-05-07T00:00:00.000Z",
    schemaUpdatedAt: "2026-05-07T00:00:00.000Z",
    sourceCursor: testSiteRecords.length,
    schema: siteSourceSchema,
    records: testSiteRecords,
  };
}

async function resetSchemaApp(schemaKey: SchemaKey) {
  await restoreTestStorageSnapshot(
    harness,
    `/api/${schemaKey}/snapshot/restore`,
    schemaAppTestStorageSnapshot(schemaKey),
    adminHeaders(),
  );
}

async function getJson<T>(path: string) {
  const response = await harness.fetch(path);

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

async function postAdminJson<T>(path: string, body: unknown) {
  const request = operationWriteRequest(path, body);
  const response = await harness.fetch(request.path, {
    body: JSON.stringify(request.body),
    headers: adminHeaders(),
    method: "POST",
  });

  expect(response.status).toBe(200);

  return request.response(await response.json()) as T;
}

async function postAdminTaskRecordOperation(body: Parameters<typeof recordOperationRequest>[0]) {
  const request = recordOperationRequest(body);
  const response = await harness.fetch(`/api/tasks${request.path.slice("/api".length)}`, {
    body: JSON.stringify(request.body),
    headers: adminHeaders(),
    method: "POST",
  });

  expect(response.status).toBe(200);

  return request.response(await response.json());
}

async function postOwnerTaskRecordOperation(body: Parameters<typeof recordOperationRequest>[0]) {
  const request = recordOperationRequest(body);
  const response = await harness.fetch(`/api/tasks${request.path.slice("/api".length)}`, {
    body: JSON.stringify(request.body),
    headers: {
      ...(await ownerSessionHeaders()),
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  expect(response.status).toBe(200);

  return request.response(await response.json());
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

function expectRecordsIgnoringOrder(actual: StoredRecord[], expected: StoredRecord[]) {
  expect(Object.fromEntries(actual.map((record) => [record.id, record]))).toEqual(
    Object.fromEntries(expected.map((record) => [record.id, record])),
  );
}
