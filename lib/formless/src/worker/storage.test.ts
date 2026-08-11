import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { createWorkerHarness } from "./miniflare-test.ts";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import type { BootstrapResponse, ChangeRow } from "../shared/protocol.ts";
import { parseAppSchema, type AppSchema } from "@dpeek/formless-schema";
import type {
  CommandWriteResponse,
  RecordWriteResponse,
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

  it("bootstraps and refreshes Program provenance without replacing its write log", async () => {
    const initialHash = sourceHash("1");
    const refreshedHash = sourceHash("2");
    const initial = await postJson<StoredSchema>("/source-bootstrap", {
      sourceSchemaHash: initialHash,
    });
    expect(await getJson<ChangeRow[]>("/changes?after=0")).toEqual([]);
    expect(await getJson<number>("/cursor")).toBe(0);

    const created = await createRecord("write-before-refresh", "Keep me");
    const beforeChanges = await getJson<ChangeRow[]>("/changes?after=0");
    const beforeCursor = await getJson<number>("/cursor");

    const refreshed = await postJson<StoredSchema>("/source-bootstrap", {
      schemaKind: "view-label",
      sourceSchemaHash: refreshedHash,
    });
    expect(initial.schemaProvenance).toEqual({
      kind: "program",
      sourceSchemaHash: initialHash,
    });
    expect(refreshed.updatedAt).not.toBe(initial.updatedAt);
    expect(
      refreshed.schema.views.find((definition) => definition.key === "taskHome")!,
    ).toMatchObject({ label: "Refreshed" });
    expect(refreshed.schemaProvenance).toEqual({
      kind: "program",
      sourceSchemaHash: refreshedHash,
    });
    expect(await getJson<StoredRecord[]>("/records")).toEqual([created.record]);
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
          kind: "program",
          sourceSchemaHash: initialHash,
        },
        storageIdentity: "instance:control-plane",
        targetSchemaProvenance: {
          kind: "program",
          sourceSchemaHash: refreshedHash,
        },
      },
    });
    expect(await getJson<StoredSchema>("/current-schema")).toEqual(beforeSchema);
    expect(await getJson<ChangeRow[]>("/changes?after=0")).toEqual(beforeChanges);
  });

  it("refreshes selected current records without mutating dormant stored records", async () => {
    const refreshedHash = sourceHash("2");

    await postJson<StoredSchema>("/source-bootstrap", {
      sourceSchemaHash: sourceHash("1"),
    });
    await createRecord("write-dormant-before-refresh", "Dormant record");
    const beforeRecords = await getJson<StoredRecord[]>("/records");
    const beforeChanges = await getJson<ChangeRow[]>("/changes?after=0");
    const beforeCursor = await getJson<number>("/cursor");

    const refreshed = await postJson<StoredSchema>("/source-bootstrap?selectRecords=none", {
      schemaKind: "required-field",
      sourceSchemaHash: refreshedHash,
    });

    expect(refreshed.schemaProvenance).toMatchObject({ sourceSchemaHash: refreshedHash });
    expect(await getJson<StoredRecord[]>("/records")).toEqual(beforeRecords);
    expect(await getJson<ChangeRow[]>("/changes?after=0")).toEqual(beforeChanges);
    expect(await getJson<number>("/cursor")).toBe(beforeCursor);
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
          kind: "program",
          sourceSchemaHash: initialHash,
        },
        targetSchemaProvenance: {
          kind: "program",
          sourceSchemaHash: refreshedHash,
        },
      },
    });
    expect(await getJson<StoredSchema>("/current-schema")).toEqual(beforeSchema);
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
});

async function createRecord(writeId: string, text: string, done = false) {
  return postJson<RecordWriteResponse>("/create", {
    writeId,
    entity: "task",
    kind: "create",
    values: { title: text, done },
  });
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
        { field: "title", editor: "text" },
        { field: "done", editor: "boolean" },
        { field: "dueDate", editor: "date" },
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
        surface: "constrained",
        width: "standard",
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
      import { tasksSchemaSource } from "@dpeek/formless-tasks-app/schema";
      import { parseAppSchema } from "@dpeek/formless-schema";
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
        readCurrentStoredSchema,
        resetStorageSchemaToSource,
        resetStorageToEmpty,
        restoreStorageSnapshot,
        createRecordsForOperation,
        tombstoneRecordsForOperation,
        tombstoneRecordsForOperationOutcome,
        writeActiveSchema,
      } from "${process.cwd()}/src/worker/storage.ts";

      const seedSchema = parseAppSchema(tasksSchemaSource);
      const sourceSchemaHash = "sha256:1111111111111111111111111111111111111111111111111111111111111111";

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

      function sourceForBootstrap(body) {
        const nextSourceSchemaHash = body.sourceSchemaHash ?? sourceSchemaHash;

        return {
          schema: schemaForSourceRefresh(body.schemaKind),
          schemaProvenance: {
            kind: "program",
            sourceSchemaHash: nextSourceSchemaHash,
          },
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

          if (request.method === "POST" && url.pathname === "/create") {
            return Response.json(createStoredRecord(this.ctx.storage, await request.json()));
          }

          if (request.method === "POST" && url.pathname === "/source-bootstrap") {
            try {
              return Response.json(
                initializeStorageFromSource(
                  this.ctx.storage,
                  sourceForBootstrap(await request.json()),
                  url.searchParams.get("selectRecords") === "none"
                    ? { selectRecordsForSchemaRefresh: () => [] }
                    : {},
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
            resetStorageToEmpty(this.ctx.storage);
            return Response.json(initializeStorageFromSource(this.ctx.storage, {
              schema: seedSchema,
            }));
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
              { schema: seedSchema },
              () => undefined,
            ));
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
