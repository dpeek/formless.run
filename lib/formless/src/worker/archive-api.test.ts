import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  type InstanceArchive,
} from "../program/archive.ts";
import { formlessProgramSchema, formlessProgramSchemaProvenance } from "../program/runtime.ts";
import {
  FORMLESS_PROGRAM_SCHEMA_KEY,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
} from "../program/target.ts";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { BootstrapResponse } from "../shared/protocol.ts";
import {
  instanceControlPlaneTestStorageSnapshot,
  restoreTestStorageSnapshot,
} from "../test/authority-write.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";
const now = "2026-05-12T00:00:00.000Z";
let harness: Harness;

beforeAll(async () => {
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    { FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true } },
    {
      bindings: { FORMLESS_ADMIN_TOKEN: adminToken },
      r2Buckets: ["FORMLESS_MEDIA"],
    },
  );
});

beforeEach(async () => {
  await restoreTestStorageSnapshot(
    harness,
    "/api/formless/program/snapshot/restore",
    instanceControlPlaneTestStorageSnapshot(),
    adminHeaders(),
  );
});

afterAll(async () => {
  await harness.dispose();
});

describe("instance archive restore API", () => {
  it("restores one complete Program snapshot", async () => {
    const archive = programInstanceArchive();
    const restored = await harness.fetch("/api/formless/archive/restore", {
      body: JSON.stringify({ archive, mediaFiles: [] }),
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      method: "POST",
    });
    const bootstrap = await harness.fetch("/api/formless/program/bootstrap?actorKind=owner", {
      headers: adminHeaders(),
    });
    const restoredBody = await restored.clone().json();
    const body = (await bootstrap.json()) as BootstrapResponse;

    expect(restored.status, JSON.stringify(restoredBody)).toBe(200);
    expect(bootstrap.status).toBe(200);
    expect(body.records.map((record) => `${record.entity}:${record.id}`)).toEqual(
      expect.arrayContaining([
        "task:task-program-restored",
        "route:route:host:publicSite:archive.example.com",
      ]),
    );
  });

  it("requires write authorization", async () => {
    const response = await harness.fetch("/api/formless/archive/restore", {
      body: JSON.stringify({ archive: programInstanceArchive(), mediaFiles: [] }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Owner session or admin authorization is required for this write endpoint.",
    });
  });
});

function programInstanceArchive(): InstanceArchive {
  const records = archiveRecords();

  return {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: now,
    capabilities: ["core-media-assets"],
    restorePolicy: { dryRun: false },
    media: { objects: [] },
    program: {
      schemaProvenance: formlessProgramSchemaProvenance,
      snapshot: {
        kind: STORAGE_SNAPSHOT_KIND,
        version: STORAGE_SNAPSHOT_VERSION,
        storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
        schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
        exportedAt: now,
        schemaUpdatedAt: now,
        sourceCursor: records.length,
        schema: formlessProgramSchema,
        records,
      },
    },
  };
}

function archiveRecords(): StoredRecord[] {
  return [
    storedRecord("task", "task-program-restored", {
      title: "Program archive task",
      done: false,
      priority: "normal",
    }),
    storedRecord("route", "route:host:publicSite:archive.example.com", {
      enabled: true,
      matchHost: "archive.example.com",
      matchPath: "/",
      matchPrefix: "/",
      kind: "mount",
      targetProfile: "public-site",
      surface: "public-site",
    }),
  ];
}

function storedRecord(entity: string, id: string, values: StoredRecord["values"]): StoredRecord {
  return { id, entity, values, createdAt: now, updatedAt: now };
}

function adminHeaders() {
  return { Authorization: `Bearer ${adminToken}` };
}
