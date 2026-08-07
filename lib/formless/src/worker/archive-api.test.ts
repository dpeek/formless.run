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
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import type { AppSchema } from "@dpeek/formless-schema";
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
    "src/worker/archive-api-legacy-storage-test.ts",
    {
      FORMLESS_AUTHORITY: {
        className: "ArchiveApiLegacyStorageTestAuthority",
        useSQLite: true,
      },
    },
    {
      bindings: { FORMLESS_ADMIN_TOKEN: adminToken },
      r2Buckets: ["FORMLESS_MEDIA"],
    },
  );
});

beforeEach(async () => {
  const bucket = await harness.mf.getR2Bucket("FORMLESS_MEDIA");
  const listed = await bucket.list();

  if (listed.objects.length > 0) {
    await bucket.delete(listed.objects.map((object) => object.key));
  }

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
  it("recovers Program storage blocked by an incompatible active schema refresh", async () => {
    const legacyRestore = await harness.durableObjectFetch(
      "FORMLESS_AUTHORITY",
      FORMLESS_PROGRAM_STORAGE_IDENTITY,
      "/_test/restore-program-storage",
      {
        body: JSON.stringify(legacyBlockStorageSnapshot()),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );

    expect(legacyRestore.status, await legacyRestore.clone().text()).toBe(200);

    const unauthorizedSnapshot = await harness.durableObjectFetch(
      "FORMLESS_AUTHORITY",
      FORMLESS_PROGRAM_STORAGE_IDENTITY,
      "/api/formless/program/snapshot?actorKind=cliDeployer",
    );
    expect(unauthorizedSnapshot.status, await unauthorizedSnapshot.clone().text()).toBe(401);

    const metadata = await harness.fetch("/api/formless/deploy");
    const restored = await harness.fetch("/api/formless/archive/restore", {
      body: JSON.stringify({ archive: programInstanceArchive(), mediaFiles: [] }),
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      method: "POST",
    });
    const bootstrap = await harness.fetch("/api/formless/program/bootstrap?actorKind=owner", {
      headers: adminHeaders(),
    });
    expect(metadata.status).toBe(200);
    expect(restored.status, await restored.clone().text()).toBe(200);
    expect(bootstrap.status, await bootstrap.clone().text()).toBe(200);
    const body = (await bootstrap.json()) as BootstrapResponse;
    expect(body.records.map((record) => record.id)).toContain("task-program-restored");
    expect(body.records.find((record) => record.id === "block-legacy")?.deletedAt).toEqual(
      expect.any(String),
    );
  });

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

  it("does not let selected runtime adapters bypass write authorization", async () => {
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

  it("rejects a stale guarded restore before Program or media replacement", async () => {
    const compared = await readProgramSnapshot();
    const concurrentRecord = storedRecord("task", "task-concurrent", {
      title: "Concurrent task",
      done: false,
      priority: "normal",
    });
    const secondConcurrentRecord = storedRecord("task", "task-concurrent-second", {
      title: "Second concurrent task",
      done: false,
      priority: "normal",
    });
    await restoreTestStorageSnapshot(
      harness,
      "/api/formless/program/snapshot/restore",
      {
        ...compared,
        records: [...compared.records, concurrentRecord, secondConcurrentRecord],
      },
      adminHeaders(),
    );
    const concurrentState = await readProgramSnapshot();
    expect(concurrentState.sourceCursor).toBeGreaterThan(compared.sourceCursor);
    const bucket = await harness.mf.getR2Bucket("FORMLESS_MEDIA");
    const concurrentMediaKey = "media/images/concurrent.png";
    const concurrentMediaBytes = new Uint8Array([7, 8, 9]);
    await bucket.put(concurrentMediaKey, concurrentMediaBytes);

    const response = await harness.fetch("/api/formless/archive/restore", {
      body: JSON.stringify({
        archive: programInstanceArchive(),
        expectedSourceCursor: compared.sourceCursor,
        mediaFiles: [],
      }),
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await response.json()) as {
      errors: Array<{
        code: string;
        currentSourceCursor: number;
        expectedSourceCursor: number;
      }>;
      ok: false;
    };
    const preserved = await readProgramSnapshot();
    const preservedMedia = await bucket.get(concurrentMediaKey);

    expect(response.status, JSON.stringify(body)).toBe(409);
    expect(body).toMatchObject({
      errors: [
        {
          code: "target-source-conflict",
          currentSourceCursor: expect.any(Number),
          expectedSourceCursor: compared.sourceCursor,
        },
      ],
      ok: false,
    });
    expect(body.errors[0]!.currentSourceCursor).toBeGreaterThan(compared.sourceCursor);
    expect(preserved.records.map((record) => record.id)).toContain(concurrentRecord.id);
    expect(preserved.records.map((record) => record.id)).not.toContain("task-program-restored");
    expect(new Uint8Array(await preservedMedia!.arrayBuffer())).toEqual(concurrentMediaBytes);
  });

  it("excludes ordinary Program writes while an archive restore guard is held", async () => {
    const before = await readProgramSnapshot();
    const guardToken = "guard-authority-write-exclusion";
    const guarded = await harness.fetch("/api/formless/program/snapshot/restore/guard", {
      body: JSON.stringify({ expectedSourceCursor: before.sourceCursor, guardToken }),
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      method: "POST",
    });

    expect(guarded.status, await guarded.clone().text()).toBe(200);

    try {
      const blocked = await harness.fetch("/api/formless/program/snapshot/restore", {
        body: JSON.stringify({
          ...before,
          records: [
            ...before.records,
            storedRecord("task", "task-blocked-by-guard", {
              title: "Blocked by guard",
              done: false,
              priority: "normal",
            }),
          ],
        }),
        headers: { ...adminHeaders(), "Content-Type": "application/json" },
        method: "POST",
      });
      const blockedBody = await blocked.json();

      expect(blocked.status, JSON.stringify(blockedBody)).toBe(409);
      expect(blockedBody).toMatchObject({
        code: "archive-restore-conflict",
        reason: "guard-held",
      });
      expect((await readProgramSnapshot()).records.map((record) => record.id)).not.toContain(
        "task-blocked-by-guard",
      );
    } finally {
      const released = await harness.fetch("/api/formless/program/snapshot/restore/guard/release", {
        body: JSON.stringify({ guardToken }),
        headers: { ...adminHeaders(), "Content-Type": "application/json" },
        method: "POST",
      });

      expect(released.status, await released.clone().text()).toBe(200);
    }
  });
});

async function readProgramSnapshot(): Promise<StorageSnapshot> {
  const response = await harness.fetch("/api/formless/program/snapshot?actorKind=cliDeployer", {
    headers: adminHeaders(),
  });

  expect(response.status).toBe(200);
  return (await response.json()) as StorageSnapshot;
}

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

function legacyBlockStorageSnapshot(): StorageSnapshot {
  const schema = structuredClone(formlessProgramSchema) as AppSchema;
  const block = schema.entities.find((entity) => entity.key === "block");

  if (!block) {
    throw new Error("Expected Program block entity.");
  }

  block.fields = block.fields.map((field) => {
    if (field.key !== "site") {
      return field;
    }

    return { ...field, required: false };
  });

  return {
    ...instanceControlPlaneTestStorageSnapshot([
      storedRecord("block", "block-legacy", { label: "Legacy", type: "markdown" }),
    ]),
    schema,
  };
}

function storedRecord(entity: string, id: string, values: StoredRecord["values"]): StoredRecord {
  return { id, entity, values, createdAt: now, updatedAt: now };
}

function adminHeaders() {
  return { Authorization: `Bearer ${adminToken}` };
}
