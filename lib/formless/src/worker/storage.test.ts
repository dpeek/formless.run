import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { createWorkerHarness } from "./miniflare-test.ts";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import type { BootstrapResponse, ChangeRow, SyncResponse } from "../shared/protocol.ts";
import { parseAppSchema, type AppSchema } from "@dpeek/formless-schema";
import type {
  AppliedPackageAppMigration,
  ApplyPackageAppMigrationsResponse,
  CommandWriteResponse,
  RecordWriteResponse,
  PackageAppMigrationState,
  StoredSchema,
  WriteOutcome,
} from "./storage.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const sourceTaskEntityId = "entity_dc20cc24-23e4-4a16-98fe-bd6e09427c68";
const replacementTaskEntityId = "entity_0be22eea-6edb-48ed-9230-4e98954c9f8a";
const noteEntityId = "entity_703758ba-0ef5-4f92-80ae-58da4a7b7938";

let harness: Harness;
let storageHarnessDir: string | undefined;
let storageHarnessName: string;

beforeAll(async () => {
  harness = await createWorkerHarness(await writeStorageHarness(), {
    STORAGE_HARNESS: { className: "StorageHarness", useSQLite: true },
  });
});

beforeEach(() => {
  storageHarnessName = randomUUID();
});

afterAll(async () => {
  await harness.dispose();

  if (storageHarnessDir) {
    await rm(storageHarnessDir, { recursive: true, force: true });
    storageHarnessDir = undefined;
  }
});
describe("storage", () => {
  it("seeds the active schema when storage is empty", async () => {
    const stored = await getJson<{
      schema: AppSchema;
      updatedAt: string;
    }>("/schema");
    expect(stored.schema.entities.find((definition) => definition.key === "task")!.label).toBe(
      "Task",
    );
    expect(stored.updatedAt).toEqual(expect.any(String));
  });
  it("persists schema updates", async () => {
    const fields = [
      { type: "text", required: true, key: "title" },
      { type: "boolean", required: true, default: false, key: "done" },
      { type: "date", required: false, key: "dueDate" },
      { type: "text", required: false, key: "notes" },
    ] satisfies AppSchema["entities"][number]["fields"];
    const nextSchema = parseAppSchema({
      version: 1,
      entities: [
        {
          id: sourceTaskEntityId,
          key: "task",
          label: "Planner task",
          fields,
          operations: taskOperations("Planner task", fields),
        },
      ],
      queries: defaultQueries(),
      itemViews: defaultItemViews(),
      tableViews: [],
      views: defaultViews(),
      screens: defaultScreens(),
    });
    await postJson("/schema", nextSchema);
    const stored = await getJson<{
      schema: AppSchema;
    }>("/schema");
    expect(stored.schema).toEqual(nextSchema);
  });
  it("rejects entity id changes and rebinding during active schema updates", async () => {
    const current = await getJson<StoredSchema>("/schema");
    const changedIdentity = parseAppSchema({
      ...current.schema,
      entities: current.schema.entities.map((entity) =>
        entity.key === "task" ? { ...entity, id: replacementTaskEntityId } : entity,
      ),
    });
    const changedResponse = await fetchStorage("/schema", {
      body: JSON.stringify(changedIdentity),
      method: "POST",
    });

    expect(changedResponse.status).toBe(500);
    expect(await changedResponse.json()).toEqual({
      error: `Cannot change entity id for continuing entity "task" from "${sourceTaskEntityId}" to "${replacementTaskEntityId}".`,
    });
    expect(await getJson<StoredSchema>("/schema")).toEqual(current);

    const withNote = parseAppSchema({
      ...current.schema,
      entities: [
        ...current.schema.entities,
        {
          id: noteEntityId,
          key: "note",
          label: "Note",
          fields: [{ key: "body", type: "text", required: true, label: "Body" }],
        },
      ],
    });
    await postJson("/schema", withNote);
    const rebound = parseAppSchema({
      ...withNote,
      entities: withNote.entities.map((entity) =>
        entity.key === "task"
          ? { ...entity, id: noteEntityId }
          : entity.key === "note"
            ? { ...entity, id: sourceTaskEntityId }
            : entity,
      ),
    });
    const reboundResponse = await fetchStorage("/schema", {
      body: JSON.stringify(rebound),
      method: "POST",
    });

    expect(reboundResponse.status).toBe(500);
    expect(await reboundResponse.json()).toEqual({
      error: `Cannot rebind entity id "${sourceTaskEntityId}" from entity "task" to "note" while entity key "task" continues with id "${noteEntityId}".`,
    });
    expect((await getJson<StoredSchema>("/schema")).schema).toEqual(withNote);
  });
  it("resets schema, records, and changes", async () => {
    const fields = [
      { type: "text", required: true, key: "title" },
      { type: "boolean", required: true, default: false, key: "done" },
      { type: "date", required: false, key: "dueDate" },
      { type: "text", required: false, key: "notes" },
    ] satisfies AppSchema["entities"][number]["fields"];
    const nextSchema = parseAppSchema({
      version: 1,
      entities: [
        {
          id: sourceTaskEntityId,
          key: "task",
          label: "Planner task",
          fields,
          operations: taskOperations("Planner task", fields),
        },
      ],
      queries: defaultQueries(),
      itemViews: defaultItemViews(),
      tableViews: [],
      views: defaultViews(),
      screens: defaultScreens(),
    });
    await postJson("/schema", nextSchema);
    await createRecord("write-1", "First");
    const reset = await postJson<{
      schema: AppSchema;
      updatedAt: string;
    }>("/reset", {});
    expect(reset.schema.entities.find((definition) => definition.key === "task")!.label).toBe(
      "Task",
    );
    expect(reset.updatedAt).toEqual(expect.any(String));
    expect(await getJson<unknown[]>("/records")).toEqual([]);
    expect(await getJson<unknown[]>("/changes?after=0")).toEqual([]);
    expect(await getJson<number>("/cursor")).toBe(0);
  });
  it("destructively resets persisted schema state that predates required entity ids", async () => {
    await getJson<StoredSchema>("/schema");
    await postJson("/corrupt-schema-without-entity-ids", {});

    const reset = await postJson<StoredSchema>("/reset", {});

    expect(reset.schema.entities).toContainEqual(
      expect.objectContaining({ id: sourceTaskEntityId, key: "task" }),
    );
    expect(await getJson<StoredRecord[]>("/records")).toEqual([]);
  });

  it("clears records, changes, and command replay rows before writing source seed rows", async () => {
    const completed = await createRecord("write-before-reset", "Done", true);
    const command = await postJson<CommandWriteResponse>("/tombstone-records", {
      writeId: "command-before-reset",
      recordIds: [completed.record.id],
    });
    const sourceRecord = record("seed-reset-task", "Seed reset", {
      createdAt: "2026-05-28T00:00:03.000Z",
      values: { title: "Seed reset", done: false, priority: "normal" },
    });

    await postJson("/source-seed", {
      changeWritePrefix: "reset-seed",
      records: [sourceRecord],
    });
    const changes = await getJson<ChangeRow[]>("/changes?after=0");

    expect(command.cursor).toBe(2);
    expect(
      await getJson<CommandWriteResponse | null>(
        "/command-write-response?writeId=command-before-reset",
      ),
    ).toBeNull();
    expect(await getJson<StoredRecord[]>("/records")).toEqual([sourceRecord]);
    expect(changes).toEqual([
      expect.objectContaining({
        seq: 1,
        writeId: "reset-seed:seed-reset-task",
        operationKind: "create",
        recordId: sourceRecord.id,
        payload: sourceRecord,
        createdAt: sourceRecord.createdAt,
      }),
    ]);
    expect(await getJson<number>("/cursor")).toBe(1);
  });

  it("creates records, records changes, and advances the cursor", async () => {
    expect(await getJson<number>("/cursor")).toBe(0);

    const response = await createRecord("write-1", "First");

    expect(response.cursor).toBe(1);
    expect(response.record).toMatchObject({
      entity: "task",
      values: { title: "First", done: false },
    });
    expect(await getJson<number>("/cursor")).toBe(1);

    const records = await getJson<unknown[]>("/records");
    const changes = await getJson<unknown[]>("/changes?after=0");

    expect(records).toHaveLength(1);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      writeId: "write-1",
      operationKind: "create",
      recordId: response.record.id,
    });
  });

  it("commits source seed records as ordered write-log changes read by sync", async () => {
    const sourceSnapshotRecords = [
      record("seed-task-1", "Seed one", { createdAt: "2026-05-28T00:00:01.000Z" }),
      record("seed-task-2", "Seed two", { createdAt: "2026-05-28T00:00:02.000Z" }),
    ];

    await postJson("/source-seed", {
      changeWritePrefix: "seed-task",
      records: sourceSnapshotRecords,
    });
    const initialSync = await getJson<SyncResponse>("/sync?after=0");

    if (!initialSync.schemaUpdatedAt) {
      throw new Error("Expected initial sync to include schema metadata.");
    }

    const catchUp = await getJson<SyncResponse>(
      `/sync?after=1&schemaUpdatedAt=${encodeURIComponent(initialSync.schemaUpdatedAt)}`,
    );

    expect(initialSync.cursor).toBe(2);
    expect(initialSync.schema).toBeTruthy();
    expect(initialSync.changes.map((change) => change.seq)).toEqual([1, 2]);
    expect(initialSync.changes.map((change) => change.writeId)).toEqual([
      "seed-task:seed-task-1",
      "seed-task:seed-task-2",
    ]);
    expect(initialSync.changes.map((change) => change.operationKind)).toEqual(["create", "create"]);
    expect(initialSync.changes.map((change) => change.payload)).toEqual(sourceSnapshotRecords);
    expect(catchUp).toEqual({
      changes: [initialSync.changes[1]],
      cursor: 2,
    });
  });

  it("refreshes compatible source schema provenance without reseeding records", async () => {
    const initialHash = sourceHash("1");
    const refreshedHash = sourceHash("2");
    const initial = await postJson<StoredSchema>("/source-bootstrap", {
      sourceSchemaHash: initialHash,
    });
    const created = await createRecord("write-before-refresh", "Keep me");
    const beforeChanges = await getJson<ChangeRow[]>("/changes?after=0");
    const beforeCursor = await getJson<number>("/cursor");

    const refreshed = await postJson<StoredSchema>("/source-bootstrap", {
      schemaKind: "view-label",
      sourceSchemaHash: refreshedHash,
    });
    const state = await getJson<PackageAppMigrationState>("/package-migration-state");

    expect(initial.schemaProvenance).toEqual({
      kind: "package-app",
      packageAppKey: "tasks",
      packageRevision: 1,
      sourceSchemaHash: initialHash,
    });
    expect(refreshed.updatedAt).not.toBe(initial.updatedAt);
    expect(
      refreshed.schema.views.find((definition) => definition.key === "taskHome")!,
    ).toMatchObject({ label: "Refreshed" });
    expect(refreshed.schemaProvenance).toEqual({
      kind: "package-app",
      packageAppKey: "tasks",
      packageRevision: 1,
      sourceSchemaHash: refreshedHash,
    });
    expect(await getJson<StoredRecord[]>("/records")).toEqual([created.record]);
    expect(await getJson<ChangeRow[]>("/changes?after=0")).toEqual(beforeChanges);
    expect(await getJson<number>("/cursor")).toBe(beforeCursor);
    expect(state).toMatchObject({
      packageAppKey: "tasks",
      packageRevision: 1,
      sourceSchemaHash: refreshedHash,
    });
  });

  it("refreshes compatible control-plane source schema provenance without reseeding records", async () => {
    const initialHash = sourceHash("1");
    const viewHash = sourceHash("2");
    const runtimeHash = sourceHash("3");
    const records = controlPlaneRefreshRecords();
    const initial = await postJson<StoredSchema>("/control-plane-source-bootstrap", {
      records,
      sourceSchemaHash: initialHash,
    });
    const beforeChanges = await getJson<ChangeRow[]>("/changes?after=0");
    const beforeCursor = await getJson<number>("/cursor");

    const viewRefreshed = await postJson<StoredSchema>("/control-plane-source-bootstrap", {
      schemaKind: "view-label",
      sourceSchemaHash: viewHash,
    });
    const runtimeRefreshed = await postJson<StoredSchema>("/control-plane-source-bootstrap", {
      schemaKind: "runtime-metadata",
      sourceSchemaHash: runtimeHash,
    });

    expect(initial.schemaProvenance).toEqual({
      kind: "instance-control-plane",
      sourceSchemaHash: initialHash,
    });
    expect(viewRefreshed.updatedAt).not.toBe(initial.updatedAt);
    expect(
      viewRefreshed.schema.views.find((definition) => definition.key === "routeList")!,
    ).toMatchObject({
      label: "Refreshed control-plane routes",
    });
    expect(viewRefreshed.schemaProvenance).toEqual({
      kind: "instance-control-plane",
      sourceSchemaHash: viewHash,
    });
    expect(runtimeRefreshed.schema.runtime?.controlPlane?.entities.route?.immutableFields).toEqual([
      "kind",
      "matchPath",
    ]);
    expect(runtimeRefreshed.schemaProvenance).toEqual({
      kind: "instance-control-plane",
      sourceSchemaHash: runtimeHash,
    });
    expect(await getJson<StoredRecord[]>("/records")).toEqual(records);
    expect(await getJson<ChangeRow[]>("/changes?after=0")).toEqual(beforeChanges);
    expect(await getJson<number>("/cursor")).toBe(beforeCursor);
  });

  it("blocks incompatible source schema refresh without mutating active state", async () => {
    const initialHash = sourceHash("1");
    const refreshedHash = sourceHash("2");

    await postJson<StoredSchema>("/source-bootstrap", {
      sourceSchemaHash: initialHash,
    });
    await createRecord("write-before-blocked-refresh", "Missing new required field");

    const beforeSchema = await getJson<StoredSchema>("/current-schema");
    const beforeChanges = await getJson<ChangeRow[]>("/changes?after=0");
    const beforeState = await getJson<PackageAppMigrationState>("/package-migration-state");
    const response = await fetchStorage("/source-bootstrap", {
      body: JSON.stringify({
        schemaKind: "required-field",
        sourceSchemaHash: refreshedHash,
      }),
      method: "POST",
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("Active schema refresh blocked"),
      blocker: {
        currentSchemaProvenance: {
          kind: "package-app",
          packageAppKey: "tasks",
          packageRevision: 1,
          sourceSchemaHash: initialHash,
        },
        storageIdentity: "app:tasks",
        targetSchemaProvenance: {
          kind: "package-app",
          packageAppKey: "tasks",
          packageRevision: 1,
          sourceSchemaHash: refreshedHash,
        },
      },
    });
    expect(await getJson<StoredSchema>("/current-schema")).toEqual(beforeSchema);
    expect(await getJson<ChangeRow[]>("/changes?after=0")).toEqual(beforeChanges);
    expect(await getJson<PackageAppMigrationState>("/package-migration-state")).toEqual(
      beforeState,
    );
  });
  it("blocks source refresh that changes a continuing entity id", async () => {
    const initialHash = sourceHash("1");
    const refreshedHash = sourceHash("2");

    await postJson<StoredSchema>("/source-bootstrap", {
      sourceSchemaHash: initialHash,
    });
    const beforeSchema = await getJson<StoredSchema>("/current-schema");
    const response = await fetchStorage("/source-bootstrap", {
      body: JSON.stringify({
        schemaKind: "entity-id",
        sourceSchemaHash: refreshedHash,
      }),
      method: "POST",
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining(
        `Cannot change entity id for continuing entity "task" from "${sourceTaskEntityId}" to "${replacementTaskEntityId}".`,
      ),
      blocker: {
        currentSchemaProvenance: {
          kind: "package-app",
          sourceSchemaHash: initialHash,
        },
        targetSchemaProvenance: {
          kind: "package-app",
          sourceSchemaHash: refreshedHash,
        },
      },
    });
    expect(await getJson<StoredSchema>("/current-schema")).toEqual(beforeSchema);
  });

  it("blocks schema-only refresh when the package revision changed", async () => {
    await postJson<StoredSchema>("/source-bootstrap", {
      sourceSchemaHash: sourceHash("1"),
    });

    const response = await fetchStorage("/source-bootstrap", {
      body: JSON.stringify({
        packageRevision: 2,
        schemaKind: "view-label",
        sourceSchemaHash: sourceHash("2"),
      }),
      method: "POST",
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("package app revision 1 targets 2"),
      blocker: {
        currentSchemaProvenance: {
          kind: "package-app",
          packageRevision: 1,
        },
        targetSchemaProvenance: {
          kind: "package-app",
          packageRevision: 2,
        },
      },
    });
  });

  it("classifies committed and replayed record write outcomes without duplicate changes", async () => {
    const body = {
      writeId: "write-outcome",
      entity: "task",
      kind: "create",
      values: { title: "Outcome", done: false },
    };

    const first = await postJson<WriteOutcome<RecordWriteResponse>>("/create-outcome", body);
    const replay = await postJson<WriteOutcome<RecordWriteResponse>>("/create-outcome", body);

    expect(first.kind).toBe("committed");
    expect(replay.kind).toBe("replay");
    expect(replay.response).toEqual(first.response);
    expect(first.response.cursor).toBe(1);
    expect(await getJson<ChangeRow[]>("/changes?after=0")).toEqual(first.response.changes);
  });

  it("preserves number values through records and change rows", async () => {
    const response = await postJson<RecordWriteResponse>("/create", {
      writeId: "write-1",
      entity: "task",
      kind: "create",
      values: { title: "Estimated", done: false, estimate: 5 },
    });
    const records = await getJson<RecordWriteResponse["record"][]>("/records");
    const changes = await getJson<unknown[]>("/changes?after=0");

    expect(response.record.values.estimate).toBe(5);
    expect(records[0]?.values.estimate).toBe(5);
    expect(changes[0]).toMatchObject({
      payload: {
        values: {
          estimate: 5,
        },
      },
    });
  });

  it("replays the same writeId without inserting a duplicate record", async () => {
    const first = await createRecord("write-1", "First");
    const replay = await createRecord("write-1", "First");

    expect(replay.record.id).toBe(first.record.id);
    expect(replay.cursor).toBe(1);
    expect(await getJson<unknown[]>("/records")).toHaveLength(1);
    expect(await getJson<unknown[]>("/changes?after=0")).toHaveLength(1);
  });

  it("commits create side effects in the same record write response", async () => {
    const body = {
      recordWrite: {
        writeId: "write-1",
        entity: "task",
        kind: "create",
        values: { title: "First", done: false },
      },
      caused: [
        {
          entity: "task",
          values: [{ title: "Lifecycle", done: false }],
        },
      ],
    };

    const first = await postJson<RecordWriteResponse>("/create-with-side-effects", body);
    const replay = await postJson<RecordWriteResponse>("/create-with-side-effects", {
      ...body,
      fail: true,
    });

    expect(first.cursor).toBe(2);
    expect(first.changes.map((change) => change.operationKind)).toEqual(["create", "command"]);
    expect(first.changes.map((change) => change.seq)).toEqual([1, 2]);
    expect(first.changes[0]?.payload).toEqual(first.record);
    expect(first.changes[1]?.payload.values).toEqual({ title: "Lifecycle", done: false });
    expect(await getJson<unknown[]>("/records")).toHaveLength(2);
    expect(await getJson<unknown[]>("/changes?after=0")).toHaveLength(2);
    expect(replay).toEqual(first);
  });

  it("rolls back the primary create when a side effect fails", async () => {
    const response = await fetchStorage("/create-with-side-effects", {
      body: JSON.stringify({
        recordWrite: {
          writeId: "write-1",
          entity: "task",
          kind: "create",
          values: { title: "First", done: false },
        },
        fail: true,
      }),
      method: "POST",
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "side effect failed" });
    expect(await getJson<unknown[]>("/records")).toEqual([]);
    expect(await getJson<unknown[]>("/changes?after=0")).toEqual([]);
    expect(await getJson<number>("/cursor")).toBe(0);
  });

  it("returns only changes after the requested cursor", async () => {
    await createRecord("write-1", "First");
    const second = await createRecord("write-2", "Second");

    const changes = await getJson<unknown[]>("/changes?after=1");

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      writeId: "write-2",
      recordId: second.record.id,
    });
  });

  it("patches records, writes a patch change, and preserves typed values", async () => {
    const created = await postJson<RecordWriteResponse>("/create", {
      writeId: "write-1",
      entity: "task",
      kind: "create",
      values: { title: "First", done: false, estimate: 5, priority: "high" },
    });
    const patched = await postJson<RecordWriteResponse>("/patch", {
      writeId: "write-2",
      entity: "task",
      kind: "patch",
      recordId: created.record.id,
      values: { title: "Second", done: true },
    });
    const records = await getJson<unknown[]>("/records");
    const changes = await getJson<unknown[]>("/changes?after=1");

    expect(patched.cursor).toBe(2);
    expect(patched.record).toMatchObject({
      id: created.record.id,
      values: { title: "Second", done: true, estimate: 5, priority: "high" },
    });
    expect(records).toEqual([patched.record]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      writeId: "write-2",
      operationKind: "update",
      payload: patched.record,
    });
  });
  it("prunes retired values during source schema reset and records patch changes", async () => {
    const sourceSchema = await getJson<{
      schema: AppSchema;
      updatedAt: string;
    }>("/schema");
    const task = taskSchema();
    await postJson("/schema", {
      ...task,
      entities: task.entities.map((entity) =>
        entity.key === "task"
          ? {
              ...entity,
              fields: [...entity.fields, { key: "notes", type: "text" as const, required: false }],
            }
          : entity,
      ),
    } satisfies AppSchema);
    const created = await postJson<RecordWriteResponse>("/create", {
      writeId: "write-retired-values",
      entity: "task",
      kind: "create",
      values: {
        title: "Retired values",
        done: false,
        priority: "high",
        estimate: 8,
        notes: "Prune on source schema reset",
      },
    });
    const reset = await postJson<{
      schema: AppSchema;
      updatedAt: string;
    }>("/reset-schema-to-source", {});
    const resetRecord = (await getJson<StoredRecord[]>("/records")).find(
      (record) => record.id === created.record.id,
    );
    const changes = await getJson<ChangeRow[]>(`/changes?after=${created.cursor}`);
    expect(reset.schema).toEqual(sourceSchema.schema);
    expect(
      reset.schema.entities.find((definition) => definition.key === "task")!.fields,
    ).not.toHaveProperty("notes");
    expect(
      reset.schema.entities.find((definition) => definition.key === "task")!.fields,
    ).not.toHaveProperty("estimate");
    expect(resetRecord?.values).toEqual({
      title: "Retired values",
      done: false,
      priority: "high",
    });
    expect(changes).toEqual([
      expect.objectContaining({
        seq: created.cursor + 1,
        writeId: `schema-reset:${reset.updatedAt}:${created.record.id}`,
        operationKind: "update",
        entity: "task",
        recordId: created.record.id,
        payload: resetRecord,
        createdAt: reset.updatedAt,
      }),
    ]);
    expect(await getJson<number>("/cursor")).toBe(created.cursor + 1);
  });

  it("replays patch writeIds without inserting duplicate changes", async () => {
    const created = await createRecord("write-1", "First");
    const body = {
      writeId: "write-2",
      entity: "task",
      kind: "patch",
      recordId: created.record.id,
      values: { done: true },
    };

    const first = await postJson<RecordWriteResponse>("/patch", body);
    const replay = await postJson<RecordWriteResponse>("/patch", body);

    expect(replay).toEqual(first);
    expect(await getJson<unknown[]>("/changes?after=0")).toHaveLength(2);
  });

  it("soft-deletes records through record writes without removing record rows", async () => {
    const created = await createRecord("write-1", "First");

    const deleted = await postJson<RecordWriteResponse>("/delete", {
      writeId: "write-2",
      entity: "task",
      kind: "delete",
      recordId: created.record.id,
    });
    const records = await getJson<StoredRecord[]>("/records");
    const changes = await getJson<unknown[]>("/changes?after=1");

    expect(deleted.cursor).toBe(2);
    expect(deleted.record).toEqual({
      ...created.record,
      deletedAt: expect.any(String),
      updatedAt: deleted.record.deletedAt,
    });
    expect(records).toEqual([deleted.record]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      writeId: "write-2",
      operationKind: "delete",
      entity: "task",
      recordId: created.record.id,
      payload: deleted.record,
      createdAt: deleted.record.deletedAt,
    });
  });

  it("replays delete writeIds without inserting duplicate changes", async () => {
    const created = await createRecord("write-1", "First");
    const body = {
      writeId: "write-2",
      entity: "task",
      kind: "delete",
      recordId: created.record.id,
    };

    const first = await postJson<RecordWriteResponse>("/delete", body);
    const replay = await postJson<RecordWriteResponse>("/delete", body);

    expect(replay).toEqual(first);
    expect(await getJson<StoredRecord[]>("/records")).toEqual([first.record]);
    expect(await getJson<unknown[]>("/changes?after=0")).toHaveLength(2);
  });

  it("classifies committed and replayed command outcomes without duplicate command rows", async () => {
    const completed = await createRecord("write-1", "Done", true);

    const first = await postJson<WriteOutcome<CommandWriteResponse>>("/tombstone-records-outcome", {
      writeId: "command-outcome",
      recordIds: [completed.record.id],
    });
    const replay = await postJson<WriteOutcome<CommandWriteResponse>>(
      "/tombstone-records-outcome",
      {
        writeId: "command-outcome",
        recordIds: [],
      },
    );

    expect(first.kind).toBe("committed");
    expect(replay.kind).toBe("replay");
    expect(replay.response).toEqual(first.response);
    expect(first.response.cursor).toBe(2);
    expect(first.response.changes.map((change) => change.seq)).toEqual([2]);
    expect(
      await getJson<CommandWriteResponse | null>("/command-write-response?writeId=command-outcome"),
    ).toEqual(first.response);
    expect(await getJson<ChangeRow[]>("/changes?after=0")).toHaveLength(2);
  });

  it("tombstones requested records for command replay", async () => {
    const completed = await createRecord("write-1", "Done", true);
    const active = await createRecord("write-2", "Open");

    const command = await postJson<CommandWriteResponse>("/tombstone-records", {
      writeId: "command-1",
      recordIds: [completed.record.id],
    });
    const records = await getJson<unknown[]>("/records");

    expect(command.changes).toHaveLength(1);
    expect(command.changes[0]).toMatchObject({
      writeId: "command-1",
      operationKind: "command",
      recordId: completed.record.id,
      payload: {
        id: completed.record.id,
        entity: "task",
        values: completed.record.values,
        createdAt: completed.record.createdAt,
        deletedAt: expect.any(String),
      },
    });
    expect(records).toEqual([
      expect.objectContaining({ id: completed.record.id, deletedAt: expect.any(String) }),
      active.record,
    ]);
  });

  it("replays tombstone commands by writeId", async () => {
    const completed = await createRecord("write-1", "Done", true);

    const first = await postJson<CommandWriteResponse>("/tombstone-records", {
      writeId: "command-1",
      recordIds: [completed.record.id],
    });
    const replay = await postJson<CommandWriteResponse>("/tombstone-records", {
      writeId: "command-1",
      recordIds: [],
    });

    expect(replay).toEqual(first);
    expect(await getJson<unknown[]>("/changes?after=0")).toHaveLength(2);
  });

  it("materializes command-created records before persisting command replay state", async () => {
    const first = await postJson<CommandWriteResponse>("/create-records-for-operation", {
      writeId: "command-create-followup",
      entity: "task",
      operationName: "createFollowupTask",
      values: [{ title: "Follow up", done: false, priority: "normal" }],
    });
    const replay = await postJson<CommandWriteResponse>("/create-records-for-operation", {
      writeId: "command-create-followup",
      entity: "task",
      operationName: "createFollowupTask",
      values: [{ title: "Ignored replay", done: true, priority: "high" }],
    });
    const records = await getJson<StoredRecord[]>("/records");

    expect(first).toMatchObject({
      writeId: "command-create-followup",
      cursor: 1,
      changes: [
        {
          seq: 1,
          writeId: "command-create-followup",
          operationKind: "command",
          entity: "task",
          recordId: first.changes[0]?.payload.id,
          payload: first.changes[0]?.payload,
          createdAt: first.changes[0]?.createdAt,
        },
      ],
    });
    expect(first.changes[0]?.payload.values).toEqual({
      title: "Follow up",
      done: false,
      priority: "normal",
    });
    expect(records).toEqual([first.changes[0]?.payload]);
    expect(
      await getJson<CommandWriteResponse | null>(
        "/command-write-response?writeId=command-create-followup",
      ),
    ).toEqual(first);
    expect(replay).toEqual(first);
    expect(await getJson<ChangeRow[]>("/changes?after=0")).toHaveLength(1);
  });
  it("exports the active store as a storage snapshot", async () => {
    const schema = await getJson<{
      schema: AppSchema;
      updatedAt: string;
    }>("/schema");
    const completed = await createRecord("write-1", "Done", true);
    await postJson<CommandWriteResponse>("/tombstone-records", {
      writeId: "command-1",
      recordIds: [completed.record.id],
    });

    const snapshot = await getJson<StorageSnapshot>("/snapshot");

    expect(snapshot).toMatchObject({
      kind: STORAGE_SNAPSHOT_KIND,
      version: 1,
      storageIdentity: "tasks",
      schemaKey: "tasks",
      exportedAt: expect.any(String),
      schemaUpdatedAt: schema.updatedAt,
      sourceCursor: 2,
      schema: schema.schema,
    });
    expect(snapshot.records).toEqual(await getJson<StoredRecord[]>("/records"));
    expect(snapshot.records).toContainEqual(
      expect.objectContaining({ id: completed.record.id, deletedAt: expect.any(String) }),
    );
  });
  it("restores snapshot records and tombstones active records absent from the snapshot", async () => {
    await getJson<{
      schema: AppSchema;
      updatedAt: string;
    }>("/schema");
    const existing = await createRecord("write-1", "Existing");
    const beforeCursor = await getJson<number>("/cursor");
    const restoredRecord = record("snapshot-record-1", "Restored", {
      createdAt: "2026-04-28T00:00:00.000Z",
    });

    const response = await postJson<BootstrapResponse>(
      "/snapshot/restore",
      snapshot({
        sourceCursor: 0,
        records: [restoredRecord],
      }),
    );
    const syncChanges = await getJson<unknown[]>(`/changes?after=${beforeCursor}`);

    expect(response.schemaUpdatedAt).toEqual(expect.any(String));
    expect(response.schemaUpdatedAt).not.toBe("2026-04-28T00:00:00.000Z");
    expect(response.cursor).toBeGreaterThan(beforeCursor);
    expect(response.cursor).toBe(beforeCursor + 2);
    expect(response.records).toEqual([
      restoredRecord,
      expect.objectContaining({
        id: existing.record.id,
        deletedAt: response.schemaUpdatedAt,
      }),
    ]);
    expect(await getJson<number>("/cursor")).toBe(response.cursor);
    expect(syncChanges).toEqual([
      expect.objectContaining({
        seq: beforeCursor + 1,
        writeId: `snapshot-restore:${response.schemaUpdatedAt}`,
        operationKind: "command",
        recordId: restoredRecord.id,
        payload: restoredRecord,
        createdAt: response.schemaUpdatedAt,
      }),
      expect.objectContaining({
        seq: beforeCursor + 2,
        writeId: `snapshot-restore:${response.schemaUpdatedAt}`,
        operationKind: "command",
        recordId: existing.record.id,
        payload: expect.objectContaining({
          id: existing.record.id,
          deletedAt: response.schemaUpdatedAt,
        }),
        createdAt: response.schemaUpdatedAt,
      }),
    ]);
  });
  it("restores snapshots atomically on invalid storage input", async () => {
    const beforeSchema = await getJson<{
      schema: AppSchema;
      updatedAt: string;
    }>("/schema");
    const existing = await createRecord("write-1", "Existing");
    const beforeRecords = await getJson<StoredRecord[]>("/records");
    const beforeCursor = await getJson<number>("/cursor");

    const response = await fetchStorage("/snapshot/restore", {
      body: JSON.stringify(
        snapshot({
          schema: {
            ...beforeSchema.schema,
            entities: [
              ...beforeSchema.schema.entities,
              {
                ...beforeSchema.schema.entities.find((definition) => definition.key === "task")!,
                label: "Restored task",
                key: "task",
              },
            ],
          },
          records: [record(existing.record.id, "First"), record(existing.record.id, "Second")],
        }),
      ),
      method: "POST",
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: `Storage snapshot includes duplicate record id "${existing.record.id}".`,
    });
    expect(
      await getJson<{
        schema: AppSchema;
        updatedAt: string;
      }>("/schema"),
    ).toEqual(beforeSchema);
    expect(await getJson<StoredRecord[]>("/records")).toEqual(beforeRecords);
    expect(await getJson<number>("/cursor")).toBe(beforeCursor);
  });
  it("clears command replay history during restore", async () => {
    await getJson<{
      schema: AppSchema;
      updatedAt: string;
    }>("/schema");
    const completed = await createRecord("write-1", "Done", true);
    const command = await postJson<CommandWriteResponse>("/tombstone-records", {
      writeId: "command-1",
      recordIds: [completed.record.id],
    });

    expect(
      await getJson<CommandWriteResponse | null>("/command-write-response?writeId=command-1"),
    ).toEqual(command);

    await postJson<BootstrapResponse>("/snapshot/restore", snapshot({ records: [] }));

    expect(
      await getJson<CommandWriteResponse | null>("/command-write-response?writeId=command-1"),
    ).toBeNull();
  });

  it("applies package app record migrations as sync-visible Authority changes", async () => {
    await seedPackageMigrationRecords();
    const beforeCursor = await getJson<number>("/cursor");

    const first = await postJson<WriteOutcome<ApplyPackageAppMigrationsResponse>>(
      "/package-migrations/apply",
      { kind: "success" },
    );
    const records = await getJson<StoredRecord[]>("/records");
    const sync = await getJson<SyncResponse>(`/sync?after=${beforeCursor}`);
    const applied = await getJson<AppliedPackageAppMigration[]>("/applied-package-migrations");
    const state = await getJson<PackageAppMigrationState>("/package-migration-state");

    expect(first.kind).toBe("committed");
    expect(first.response.applied).toEqual([
      expect.objectContaining({
        migrationId: "2026-05-28-test-package-app-success",
        packageAppKey: "tasks",
        fromPackageRevision: 1,
        toPackageRevision: 2,
        sourceSchemaHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
      }),
    ]);
    expect(first.response.changes.map((change) => change.operationKind)).toEqual([
      "create",
      "update",
      "delete",
    ]);
    expect(first.response.cursor).toBe(beforeCursor + 3);
    expect(records).toContainEqual(
      expect.objectContaining({
        id: "migration-created",
        values: expect.objectContaining({ migrationTag: "created" }),
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        id: "migration-open",
        values: expect.objectContaining({ title: "Migrated open", migrationTag: "patched" }),
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({ id: "migration-done", deletedAt: expect.any(String) }),
    );
    expect(sync.changes).toEqual(first.response.changes);
    expect(sync.cursor).toBe(first.response.cursor);
    expect(
      sync.schema?.entities.find((definition) => definition.key === "task")!.fields,
    ).toContainEqual(expect.objectContaining({ key: "migrationTag" }));
    expect(applied).toEqual(first.response.applied);
    expect(state).toMatchObject({
      packageAppKey: "tasks",
      packageRevision: 2,
      sourceSchemaHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    });
  });
  it("keeps migrated references flat while rejecting record id reuse across entities", async () => {
    await seedPackageMigrationRecords();

    const flatReference = await postJson<WriteOutcome<ApplyPackageAppMigrationsResponse>>(
      "/package-migrations/apply",
      { kind: "flat-reference" },
    );
    const records = await getJson<StoredRecord[]>("/records");

    expect(flatReference.kind).toBe("committed");
    expect(records).toContainEqual(
      expect.objectContaining({
        id: "migration-note",
        entity: "note",
        values: {
          body: "Flat task reference",
          task: "migration-open",
        },
      }),
    );

    storageHarnessName = randomUUID();
    await seedPackageMigrationRecords();
    const beforeRecords = await getJson<StoredRecord[]>("/records");
    const response = await fetchStorage("/package-migrations/apply", {
      body: JSON.stringify({ kind: "duplicate-cross-entity" }),
      method: "POST",
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error:
        'Package app migration "2026-05-28-test-package-app-duplicate-cross-entity" creates duplicate record "migration-open".',
    });
    expect(await getJson<StoredRecord[]>("/records")).toEqual(beforeRecords);
    expect(await getJson<AppliedPackageAppMigration[]>("/applied-package-migrations")).toEqual([]);
  });
  it("rejects entity id changes from package app migrations", async () => {
    await seedPackageMigrationRecords();
    const beforeSchema = await getJson<StoredSchema>("/schema");
    const beforeRecords = await getJson<StoredRecord[]>("/records");
    const response = await fetchStorage("/package-migrations/apply", {
      body: JSON.stringify({ kind: "invalid-entity-id" }),
      method: "POST",
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: `Cannot change entity id for continuing entity "task" from "${sourceTaskEntityId}" to "${replacementTaskEntityId}".`,
    });
    expect(await getJson<StoredSchema>("/schema")).toEqual(beforeSchema);
    expect(await getJson<StoredRecord[]>("/records")).toEqual(beforeRecords);
    expect(await getJson<AppliedPackageAppMigration[]>("/applied-package-migrations")).toEqual([]);
  });

  it("replays applied package app migrations without duplicate changes", async () => {
    await seedPackageMigrationRecords();

    const first = await postJson<WriteOutcome<ApplyPackageAppMigrationsResponse>>(
      "/package-migrations/apply",
      { kind: "success" },
    );
    const replay = await postJson<WriteOutcome<ApplyPackageAppMigrationsResponse>>(
      "/package-migrations/apply",
      { kind: "success" },
    );

    expect(replay.kind).toBe("committed");
    expect(replay.response.applied).toEqual([]);
    expect(replay.response.skipped).toEqual(first.response.applied);
    expect(replay.response.changes).toEqual([]);
    expect(await getJson<ChangeRow[]>("/changes?after=0")).toHaveLength(
      packageMigrationRecords().length + first.response.changes.length,
    );
  });

  it("rolls back invalid package app migration field, reference, unique, and delete plans", async () => {
    for (const [kind, message] of [
      ["invalid-field", "unknownMigrationField"],
      ["invalid-reference", 'references unknown task record "missing-task"'],
      ["invalid-unique", 'Unique constraint "task.uniqueTitle" would be violated.'],
      ["invalid-delete", 'Cannot delete record "migration-open"'],
    ]) {
      storageHarnessName = randomUUID();
      await seedPackageMigrationRecords();
      const beforeSchema = await getJson<{
        schema: AppSchema;
        updatedAt: string;
      }>("/schema");
      const beforeRecords = await getJson<StoredRecord[]>("/records");
      const beforeChanges = await getJson<ChangeRow[]>("/changes?after=0");
      const beforeState = await getJson<PackageAppMigrationState | null>(
        "/package-migration-state",
      );
      const response = await fetchStorage("/package-migrations/apply", {
        body: JSON.stringify({ kind }),
        method: "POST",
      });

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: expect.stringContaining(message),
      });
      expect(
        await getJson<{
          schema: AppSchema;
          updatedAt: string;
        }>("/schema"),
      ).toEqual(beforeSchema);
      expect(await getJson<StoredRecord[]>("/records")).toEqual(beforeRecords);
      expect(await getJson<ChangeRow[]>("/changes?after=0")).toEqual(beforeChanges);
      expect(await getJson<PackageAppMigrationState | null>("/package-migration-state")).toEqual(
        beforeState,
      );
      expect(await getJson<AppliedPackageAppMigration[]>("/applied-package-migrations")).toEqual(
        [],
      );
    }
  });
});

async function createRecord(writeId: string, text: string, done = false) {
  return postJson<RecordWriteResponse>("/create", {
    writeId,
    entity: "task",
    kind: "create",
    values: { title: text, done },
  });
}

async function seedPackageMigrationRecords() {
  await postJson("/source-seed", {
    changeWritePrefix: "migration-seed",
    records: packageMigrationRecords(),
  });
}

function packageMigrationRecords(): StoredRecord[] {
  return [
    record("migration-open", "Open", {
      createdAt: "2026-05-28T00:00:01.000Z",
      values: { title: "Open", done: false, priority: "normal" },
    }),
    record("migration-done", "Done", {
      createdAt: "2026-05-28T00:00:02.000Z",
      values: { title: "Done", done: true, priority: "normal" },
    }),
    record("migration-child", "Child", {
      createdAt: "2026-05-28T00:00:03.000Z",
      values: { title: "Child", done: false, priority: "normal" },
    }),
  ];
}

function controlPlaneRefreshRecords(): StoredRecord[] {
  return [
    {
      createdAt: "2026-06-18T00:00:00.000Z",
      entity: "app-install",
      id: "site",
      updatedAt: "2026-06-18T00:00:00.000Z",
      values: {
        installId: "site",
        packageAppKey: "site",
        packageRevision: 1,
        sourceSchemaHash: sourceHash("a"),
        label: "Site",
        registrationPolicy: "closed",
        status: "installed",
        storageIdentity: "app:site",
      },
    },
    {
      createdAt: "2026-06-18T00:00:01.000Z",
      entity: "deployment-config",
      id: "production",
      updatedAt: "2026-06-18T00:00:01.000Z",
      values: {
        targetId: "instance.primary",
        targetKind: "instance",
        label: "Production",
        enabled: true,
        targetUrl: "https://example.com",
        providerFamily: "cloudflare",
      },
    },
    {
      createdAt: "2026-06-18T00:00:02.000Z",
      entity: "route",
      id: "route:site:admin",
      updatedAt: "2026-06-18T00:00:02.000Z",
      values: {
        enabled: true,
        matchPath: "/apps/site",
        kind: "mount",
        targetProfile: "app",
        appInstall: "site",
        surface: "admin",
        access: "owner",
        deploymentConfig: "production",
      },
    },
  ];
}

function sourceHash(digit: string) {
  return `sha256:${digit.repeat(64)}`;
}

function snapshot(overrides: Partial<StorageSnapshot> = {}): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: "tasks",
    schemaKey: "tasks",
    exportedAt: "2026-04-28T00:00:00.000Z",
    schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
    sourceCursor: 1,
    schema: taskSchema(),
    records: [],
    ...overrides,
  };
}
function taskSchema(): AppSchema {
  const fields = [
    { type: "text", required: true, key: "title" },
    { type: "boolean", required: true, default: false, key: "done" },
    { type: "date", required: false, key: "dueDate" },
    { type: "number", required: false, integer: true, min: 0, key: "estimate" },
    {
      type: "enum",
      required: false,
      values: [
        { key: "low", label: "Low" },
        { key: "normal", label: "Normal" },
        { key: "high", label: "High" },
      ],
      default: "normal",
      key: "priority",
    },
  ] satisfies AppSchema["entities"][number]["fields"];
  return parseAppSchema({
    version: 1,
    entities: [
      {
        id: sourceTaskEntityId,
        key: "task",
        label: "Task",
        fields,
        operations: taskOperations("Task", fields),
      },
    ],
    queries: defaultQueries(),
    itemViews: defaultItemViews(),
    tableViews: [],
    views: defaultViews(),
    screens: defaultScreens(),
  });
}
function taskOperations(
  label: string,
  fields: AppSchema["entities"][number]["fields"],
): NonNullable<AppSchema["entities"][number]["operations"]> {
  const input = {
    fields: fields.map(({ key }) => ({ key, field: key })),
  };
  return [
    {
      label: `Create ${label}`,
      kind: "create",
      scope: "collection",
      input,
      effect: { type: "createRecord" },
      output: { type: "create" },
      idempotency: { required: true },
      audit: { input: "summary" },
      key: "create",
    },
    {
      label: `Update ${label}`,
      kind: "update",
      scope: "record",
      input,
      effect: { type: "patchRecord" },
      output: { type: "update" },
      idempotency: { required: true },
      audit: { input: "summary" },
      key: "update",
    },
  ];
}
function record(id: string, title: string, overrides: Partial<StoredRecord> = {}): StoredRecord {
  return {
    id,
    entity: "task",
    values: { title, done: false },
    createdAt: "2026-04-28T00:00:00.000Z",
    updatedAt: "2026-04-28T00:00:00.000Z",
    ...overrides,
  };
}
function defaultQueries(): AppSchema["queries"] {
  return [
    {
      label: "All",
      entity: "task",
      expression: { kind: "all" },
      key: "taskAll",
    },
    {
      label: "Completed",
      entity: "task",
      expression: {
        kind: "where",
        ref: { kind: "value", name: "done" },
        op: "eq",
        value: true,
      },
      key: "taskCompleted",
    },
  ];
}
function defaultItemViews(): AppSchema["itemViews"] {
  return [
    {
      entity: "task",
      fields: [
        { field: "title", editor: "text", commit: "field-commit" },
        { field: "done", editor: "boolean", commit: "immediate" },
        { field: "dueDate", editor: "date", commit: "field-commit" },
      ],
      key: "taskListItem",
    },
  ];
}
function defaultViews(): AppSchema["views"] {
  return [
    {
      type: "collection",
      label: "All",
      entity: "task",
      queries: [{ query: "taskAll" }],
      defaultQuery: "taskAll",
      result: { type: "list", itemView: "taskListItem" },
      key: "taskHome",
    },
    {
      type: "create",
      entity: "task",
      fields: [
        { field: "title", editor: "text" },
        { field: "dueDate", editor: "date" },
      ],
      key: "taskCreate",
    },
  ];
}
function defaultScreens(): NonNullable<AppSchema["screens"]> {
  return [
    {
      type: "workspace",
      label: "Tasks",
      path: "/",
      layout: {
        type: "stack",
        sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
      },
      key: "taskHome",
    },
  ];
}
async function getJson<T>(path: string) {
  const response = await fetchStorage(path);
  expect(response.status).toBe(200);
  return (await response.json()) as T;
}
async function postJson<T>(path: string, body: unknown) {
  const response = await fetchStorage(path, {
    body: JSON.stringify(body),
    method: "POST",
  });

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

function fetchStorage(path: string, init: Parameters<Harness["fetch"]>[1] = {}) {
  return harness.fetch(path, {
    ...init,
    headers: { "x-storage-harness-name": storageHarnessName },
  });
}

async function writeStorageHarness() {
  storageHarnessDir = await mkdtemp(join(tmpdir(), "formless-storage-harness-"));
  const tempDir = storageHarnessDir;
  const harnessPath = join(tempDir, "storage-harness.ts");

  await writeFile(
    harnessPath,
    `
      import { DurableObject } from "cloudflare:workers";
      import rawSeedSchema from "@dpeek/formless-tasks-app/schema.json";
      import { parseAppSchema } from "@dpeek/formless-schema";
      import {
        instanceControlPlaneSchema,
        instanceControlPlaneSchemaProvenance,
      } from "@dpeek/formless-instance-control-plane";
      import {
        ActiveSchemaRefreshBlockedError,
        createStoredRecord,
        createStoredRecordOutcome,
        deleteStoredRecord,
        ensureStorageTables,
        exportStorageSnapshot,
        getActiveSchema,
        getCommandWriteResponseById,
        getBootstrapRecords,
        getChangesAfter,
        getCurrentCursor,
        getStoredRecord,
        initializeStorageFromSource,
        patchStoredRecord,
        applyPackageAppMigrationsOutcome,
        readAppliedPackageAppMigrations,
        readCurrentStoredSchema,
        readPackageAppMigrationState,
        resetStorage,
        resetStorageSchemaToSource,
        restoreStorageSnapshot,
        createRecordsForOperation,
        tombstoneRecordsForOperation,
        tombstoneRecordsForOperationOutcome,
        writeActiveSchema,
      } from "${process.cwd()}/src/worker/storage.ts";
      import { packageAppMigrationFamily } from "${process.cwd()}/src/worker/package-app-migrations.ts";

      const seedSchema = parseAppSchema(rawSeedSchema);
      const controlPlaneSchema = parseAppSchema(instanceControlPlaneSchema);
      const sourceSchemaHash = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
      const targetSchemaHash = "sha256:2222222222222222222222222222222222222222222222222222222222222222";
      const packageFamily = packageAppMigrationFamily("tasks");

      function packageMigration(kind) {
        return {
          id: \`2026-05-28-test-package-app-\${kind}\`,
          owner: "formless-test",
          family: packageFamily,
          checksum: checksumForPackageMigration(kind),
          safety: "auto-with-backup",
          summary: \`Test package app migration \${kind}.\`,
          fromPackageRevision: 1,
          toPackageRevision: 2,
          migrate: () => packageMigrationPlan(kind),
        };
      }

      function checksumForPackageMigration(kind) {
        if (kind === "invalid-field") {
          return "sha256:4444444444444444444444444444444444444444444444444444444444444444";
        }

        if (kind === "invalid-reference") {
          return "sha256:5555555555555555555555555555555555555555555555555555555555555555";
        }

        if (kind === "invalid-unique") {
          return "sha256:6666666666666666666666666666666666666666666666666666666666666666";
        }

        if (kind === "invalid-delete") {
          return "sha256:7777777777777777777777777777777777777777777777777777777777777777";
        }

        if (kind === "invalid-entity-id") {
          return "sha256:8888888888888888888888888888888888888888888888888888888888888888";
        }

        if (kind === "flat-reference") {
          return "sha256:9999999999999999999999999999999999999999999999999999999999999999";
        }

        if (kind === "duplicate-cross-entity") {
          return "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        }

        return "sha256:3333333333333333333333333333333333333333333333333333333333333333";
      }

      function packageMigrationPlan(kind) {
        if (kind === "invalid-entity-id") {
          const schema = structuredClone(seedSchema);
          schema.entities.find((definition) => definition.key === "task").id = "${replacementTaskEntityId}";
          return { schema };
        }

        if (kind === "flat-reference") {
          return {
            schema: schemaWithNoteReference(),
            creates: [
              {
                entity: "note",
                recordId: "migration-note",
                values: {
                  body: "Flat task reference",
                  task: "migration-open",
                },
              },
            ],
          };
        }

        if (kind === "duplicate-cross-entity") {
          return {
            schema: schemaWithNoteReference(),
            creates: [
              {
                entity: "note",
                recordId: "migration-open",
                values: {
                  body: "Duplicate across entities",
                  task: "migration-child",
                },
              },
            ],
          };
        }

        if (kind === "invalid-field") {
          return {
            schema: schemaWithMigrationTag(),
            patches: [
              {
                entity: "task",
                recordId: "migration-open",
                values: { unknownMigrationField: "bad" },
              },
            ],
          };
        }

        if (kind === "invalid-reference") {
          return {
            schema: schemaWithParentReference(),
            patches: [
              {
                entity: "task",
                recordId: "migration-open",
                values: { parent: "missing-task" },
              },
            ],
          };
        }

        if (kind === "invalid-unique") {
          return {
            schema: schemaWithUniqueTitle(),
            creates: [
              {
                entity: "task",
                recordId: "migration-duplicate-title",
                values: { title: "Open", done: false, priority: "normal" },
              },
            ],
          };
        }

        if (kind === "invalid-delete") {
          return {
            schema: schemaWithParentReference(),
            patches: [
              {
                entity: "task",
                recordId: "migration-child",
                values: { parent: "migration-open" },
              },
            ],
            tombstones: [{ entity: "task", recordId: "migration-open" }],
          };
        }

        return {
          schema: schemaWithMigrationTag(),
          creates: [
            {
              entity: "task",
              recordId: "migration-created",
              values: {
                title: "Created by migration",
                done: false,
                priority: "normal",
                migrationTag: "created",
              },
            },
          ],
          patches: [
            {
              entity: "task",
              recordId: "migration-open",
              values: { title: "Migrated open", migrationTag: "patched" },
            },
          ],
          tombstones: [{ entity: "task", recordId: "migration-done" }],
        };
      }

      function schemaWithMigrationTag() {
        const schema = structuredClone(seedSchema);
        schema.entities.find((definition) => definition.key === "task").fields.push({
          key: "migrationTag",
          type: "text",
          required: false,
          label: "Migration tag",
        });
        return schema;
      }

      function schemaWithParentReference() {
        const schema = schemaWithMigrationTag();
        schema.entities.find((definition) => definition.key === "task").fields.push({
          key: "parent",
          type: "reference",
          required: false,
          label: "Parent",
          to: "task",
        });
        return schema;
      }

      function schemaWithUniqueTitle() {
        const schema = schemaWithMigrationTag();
        schema.entities.find((definition) => definition.key === "task").constraints = [
          {
            key: "uniqueTitle",
            kind: "unique",
            fields: ["title"],
          },
        ];
        return schema;
      }

      function schemaWithNoteReference() {
        const schema = structuredClone(seedSchema);
        schema.entities.push({
          id: "${noteEntityId}",
          key: "note",
          label: "Note",
          fields: [
            {
              key: "body",
              type: "text",
              required: true,
              label: "Body",
            },
            {
              key: "task",
              type: "reference",
              required: true,
              label: "Task",
              to: "task",
            },
          ],
        });
        return schema;
      }

      function schemaForSourceRefresh(kind) {
        const schema = structuredClone(seedSchema);

        if (kind === "entity-id") {
          schema.entities.find((definition) => definition.key === "task").id = "${replacementTaskEntityId}";
          return schema;
        }

        if (kind === "view-label") {
          schema.views.find((definition) => definition.key === "taskHome").label = "Refreshed";
          return schema;
        }

        if (kind === "required-field") {
          schema.entities.find((definition) => definition.key === "task").fields.push({
            key: "reviewedBy",
            type: "text",
            required: true,
            label: "Reviewed by",
          });
          return schema;
        }

        return schema;
      }

      function schemaForControlPlaneSourceRefresh(kind) {
        const schema = structuredClone(controlPlaneSchema);

        if (kind === "view-label") {
          schema.views.find((definition) => definition.key === "routeList").label = "Refreshed control-plane routes";
          return schema;
        }

        if (kind === "runtime-metadata") {
          schema.runtime.controlPlane.entities.route.immutableFields = ["kind", "matchPath"];
          return schema;
        }

        if (kind === "required-field") {
          schema.entities.find((definition) => definition.key === "route").fields.push({
            key: "auditNote",
            type: "text",
            required: true,
            label: "Audit note",
          });
          return schema;
        }

        return schema;
      }

      function sourceForBootstrap(body) {
        const nextSourceSchemaHash = body.sourceSchemaHash ?? sourceSchemaHash;

        return {
          changeWritePrefix: "seed-task",
          records: body.records ?? [],
          schema: schemaForSourceRefresh(body.schemaKind),
          schemaKey: "tasks",
          schemaProvenance: {
            kind: "package-app",
            packageAppKey: "tasks",
            packageRevision: body.packageRevision ?? 1,
            sourceSchemaHash: nextSourceSchemaHash,
          },
          storageIdentity: "app:tasks",
        };
      }

      function controlPlaneSourceForBootstrap(body) {
        return {
          changeWritePrefix: "seed-instance-control-plane",
          records: body.records ?? [],
          schema: schemaForControlPlaneSourceRefresh(body.schemaKind),
          schemaKey: "instance-control-plane",
          schemaProvenance: {
            ...instanceControlPlaneSchemaProvenance,
            sourceSchemaHash: body.sourceSchemaHash ?? instanceControlPlaneSchemaProvenance.sourceSchemaHash,
          },
          storageIdentity: "instance:control-plane",
        };
      }

      export class StorageHarness extends DurableObject {
        constructor(ctx, env) {
          super(ctx, env);
          ensureStorageTables(ctx.storage);
        }

        async fetch(request) {
          const url = new URL(request.url);

          if (request.method === "GET" && url.pathname === "/cursor") {
            return Response.json(getCurrentCursor(this.ctx.storage));
          }

          if (request.method === "GET" && url.pathname === "/records") {
            return Response.json(getBootstrapRecords(this.ctx.storage));
          }

          if (request.method === "GET" && url.pathname === "/schema") {
            return Response.json(getActiveSchema(this.ctx.storage, seedSchema));
          }

          if (request.method === "GET" && url.pathname === "/current-schema") {
            return Response.json(readCurrentStoredSchema(this.ctx.storage) ?? null);
          }

          if (request.method === "GET" && url.pathname === "/changes") {
            return Response.json(getChangesAfter(this.ctx.storage, Number(url.searchParams.get("after") ?? 0)));
          }

          if (request.method === "GET" && url.pathname === "/sync") {
            const { schema, updatedAt } = getActiveSchema(this.ctx.storage, seedSchema);
            const schemaFields = url.searchParams.get("schemaUpdatedAt") === updatedAt ? {} : { schema, schemaUpdatedAt: updatedAt };

            return Response.json({
              changes: getChangesAfter(this.ctx.storage, Number(url.searchParams.get("after") ?? 0)),
              cursor: getCurrentCursor(this.ctx.storage),
              ...schemaFields,
            });
          }

          if (request.method === "GET" && url.pathname === "/snapshot") {
            return Response.json(exportStorageSnapshot(this.ctx.storage, "tasks", "tasks"));
          }

          if (request.method === "GET" && url.pathname === "/command-write-response") {
            return Response.json(getCommandWriteResponseById(this.ctx.storage, url.searchParams.get("writeId") ?? "") ?? null);
          }

          if (request.method === "GET" && url.pathname === "/applied-package-migrations") {
            return Response.json(readAppliedPackageAppMigrations(this.ctx.storage, "tasks"));
          }

          if (request.method === "GET" && url.pathname === "/package-migration-state") {
            return Response.json(readPackageAppMigrationState(this.ctx.storage, "tasks") ?? null);
          }

          if (request.method === "POST" && url.pathname === "/create") {
            return Response.json(createStoredRecord(this.ctx.storage, await request.json()));
          }

          if (request.method === "POST" && url.pathname === "/source-bootstrap") {
            try {
              return Response.json(
                initializeStorageFromSource(this.ctx.storage, sourceForBootstrap(await request.json())),
              );
            } catch (error) {
              if (error instanceof ActiveSchemaRefreshBlockedError) {
                return Response.json(
                  { error: error.message, blocker: error.blocker },
                  { status: 409 },
                );
              }

              return Response.json(
                { error: error instanceof Error ? error.message : "Unknown error." },
                { status: 500 },
              );
            }
          }

          if (request.method === "POST" && url.pathname === "/control-plane-source-bootstrap") {
            try {
              return Response.json(
                initializeStorageFromSource(
                  this.ctx.storage,
                  controlPlaneSourceForBootstrap(await request.json()),
                ),
              );
            } catch (error) {
              if (error instanceof ActiveSchemaRefreshBlockedError) {
                return Response.json(
                  { error: error.message, blocker: error.blocker },
                  { status: 409 },
                );
              }

              return Response.json(
                { error: error instanceof Error ? error.message : "Unknown error." },
                { status: 500 },
              );
            }
          }

          if (request.method === "POST" && url.pathname === "/create-outcome") {
            return Response.json(createStoredRecordOutcome(this.ctx.storage, await request.json()));
          }

          if (request.method === "POST" && url.pathname === "/create-with-side-effects") {
            const body = await request.json();

            try {
              return Response.json(
                createStoredRecord(this.ctx.storage, body.recordWrite, ({ createRecords }) => {
                  if (body.fail) {
                    throw new Error("side effect failed");
                  }

                  for (const caused of body.caused ?? []) {
                    createRecords(caused.entity, caused.values);
                  }
                }),
              );
            } catch (error) {
              return Response.json(
                { error: error instanceof Error ? error.message : "Unknown error." },
                { status: 500 },
              );
            }
          }

          if (request.method === "POST" && url.pathname === "/patch") {
            return Response.json(patchStoredRecord(this.ctx.storage, await request.json()));
          }

          if (request.method === "POST" && url.pathname === "/delete") {
            return Response.json(deleteStoredRecord(this.ctx.storage, await request.json()));
          }

          if (request.method === "POST" && url.pathname === "/tombstone-records") {
            const body = await request.json();
            const records = body.recordIds.map((recordId) => getStoredRecord(this.ctx.storage, recordId)).filter(Boolean);
            return Response.json(tombstoneRecordsForOperation(this.ctx.storage, body.writeId, "task", "clearCompletedTasks", records));
          }

          if (request.method === "POST" && url.pathname === "/tombstone-records-outcome") {
            const body = await request.json();
            const records = body.recordIds.map((recordId) => getStoredRecord(this.ctx.storage, recordId)).filter(Boolean);
            return Response.json(tombstoneRecordsForOperationOutcome(this.ctx.storage, body.writeId, "task", "clearCompletedTasks", records));
          }

          if (request.method === "POST" && url.pathname === "/create-records-for-operation") {
            const body = await request.json();
            return Response.json(createRecordsForOperation(this.ctx.storage, body.writeId, body.entity, body.operationName, body.values));
          }

          if (request.method === "POST" && url.pathname === "/snapshot/restore") {
            try {
              return Response.json(restoreStorageSnapshot(this.ctx.storage, await request.json()));
            } catch (error) {
              return Response.json(
                { error: error instanceof Error ? error.message : "Unknown error." },
                { status: 500 },
              );
            }
          }

          if (request.method === "POST" && url.pathname === "/package-migrations/apply") {
            const body = await request.json();

            try {
              const result = applyPackageAppMigrationsOutcome(this.ctx.storage, {
                currentPackageRevision: 1,
                currentSourceSchemaHash: sourceSchemaHash,
                migrations: [packageMigration(body.kind ?? "success")],
                now: "2026-05-28T00:00:00.000Z",
                packageAppKey: "tasks",
                targetPackageRevision: 2,
                targetSourceSchemaHash: targetSchemaHash,
              });

              return Response.json(result);
            } catch (error) {
              return Response.json(
                { error: error instanceof Error ? error.message : "Unknown error." },
                { status: 500 },
              );
            }
          }

          if (request.method === "POST" && url.pathname === "/schema") {
            try {
              return Response.json(writeActiveSchema(this.ctx.storage, await request.json()));
            } catch (error) {
              return Response.json(
                { error: error instanceof Error ? error.message : "Unknown error." },
                { status: 500 },
              );
            }
          }

          if (request.method === "POST" && url.pathname === "/reset") {
            return Response.json(resetStorage(this.ctx.storage, { schema: seedSchema }));
          }

          if (request.method === "POST" && url.pathname === "/corrupt-schema-without-entity-ids") {
            const schema = JSON.parse(JSON.stringify(seedSchema));

            for (const entity of schema.entities) {
              delete entity.id;
            }

            this.ctx.storage.sql.exec(
              "UPDATE app_schema SET schema_json = ? WHERE id = 1",
              JSON.stringify(schema),
            );
            return Response.json({ corrupted: true });
          }

          if (request.method === "POST" && url.pathname === "/reset-schema-to-source") {
            return Response.json(resetStorageSchemaToSource(
              this.ctx.storage,
              { schema: seedSchema, records: [], changeWritePrefix: "seed-task" },
              () => undefined,
            ));
          }

          if (request.method === "POST" && url.pathname === "/source-seed") {
            const body = await request.json();

            return Response.json(resetStorage(this.ctx.storage, {
              schema: seedSchema,
              records: body.records,
              changeWritePrefix: body.changeWritePrefix,
            }));
          }

          return Response.json({ error: "Not found." }, { status: 404 });
        }
      }

      export default {
        fetch(request, env) {
          const id = env.STORAGE_HARNESS.idFromName(
            request.headers.get("x-storage-harness-name") ?? "default",
          );

          return env.STORAGE_HARNESS.get(id).fetch(request);
        },
      };
    `,
  );

  return harnessPath;
}
