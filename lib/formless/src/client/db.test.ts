import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import {
  clientDbName,
  deleteClientDb,
  deleteProgramReplicaDatabase,
  saveBootstrapResponse,
  saveSchema,
  mergeChanges,
  mergeRecords,
  readCursor,
  readLocalSnapshot,
} from "./db.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { BootstrapResponse, ChangeRow } from "../shared/protocol.ts";
import { parseAppSchema, type AppSchema } from "@dpeek/formless-schema";
import { taskSourceSchema as appSchema } from "../test/schema-apps.ts";
import { testSiteRecords } from "../test/site-records.ts";

beforeEach(async () => {
  await deleteClientDb();
  await deleteRawDatabase("notes");
});

describe("client db", () => {
  it("stores bootstrap schema, records, cursor, and last-sync metadata", async () => {
    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 7,
    } satisfies BootstrapResponse);

    const snapshot = await readLocalSnapshot();

    expect(snapshot.schema).toEqual(appSchema);
    expect(snapshot.schemaProvenance).toBeNull();
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:00:00.000Z");
    expect(snapshot.records).toEqual([record("record-1", "First")]);
    expect(snapshot.cursor).toBe(7);
    expect(snapshot.lastSyncedAt).toEqual(expect.any(String));
  });

  it("stores and clears active schema provenance metadata", async () => {
    const sourceSchemaHash =
      "sha256:7777777777777777777777777777777777777777777777777777777777777777" as const;

    await saveBootstrapResponse({
      schema: appSchema,
      schemaProvenance: {
        kind: "program",
        sourceSchemaHash,
      },
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [],
      cursor: 0,
    } satisfies BootstrapResponse);

    expect((await readLocalSnapshot()).schemaProvenance).toEqual({
      kind: "program",
      sourceSchemaHash,
    });

    await saveSchema(appSchema, "2026-04-28T00:01:00.000Z");

    expect((await readLocalSnapshot()).schemaProvenance).toBeNull();
  });

  it("stores Program records in one replica", async () => {
    const site = testSiteRecords.find((record) => record.entity === "site");

    if (!site) {
      throw new Error("Expected a Site record fixture.");
    }

    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("task-1", "Program task"), site],
      cursor: 2,
    });

    expect(clientDbName()).toBe("formless:instance:control-plane");
    expect((await readLocalSnapshot()).records).toEqual([record("task-1", "Program task"), site]);
  });

  it("deletes only the active Program replica", async () => {
    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-3", "Control plane")],
      cursor: 3,
    });
    await createRawDatabase("notes");

    await deleteProgramReplicaDatabase();
    const databaseNames = await rawDatabaseNames();

    expect(databaseNames).not.toContain("formless:instance:control-plane");
    expect(databaseNames).toContain("notes");
  });

  it("merges records and advances the cursor", async () => {
    await mergeRecords([record("record-1", "First")], 1);
    await mergeChanges([change(2, "record-2", "Second", true)], 2);

    const snapshot = await readLocalSnapshot();

    expect(snapshot.records.map((storedRecord) => storedRecord.id)).toEqual([
      "record-1",
      "record-2",
    ]);
    expect(snapshot.cursor).toBe(2);
    expect(await readCursor()).toBe(2);
  });
  it("updates the cached schema without replacing records", async () => {
    const fields = [
      ...appSchema.entities.find((definition) => definition.key === "task")!.fields,
      { type: "text", required: false, key: "notes" },
    ] satisfies AppSchema["entities"][number]["fields"];
    const nextSchema = parseAppSchema({
      version: 1,
      entities: [
        {
          id: "entity_6ab0b803-8495-4c54-99b0-dc189605f425",
          key: "task",
          label: "Planner task",
          fields,
          operations: taskOperations("Planner task", fields),
        },
      ],
      queries: appSchema.queries,
      itemViews: appSchema.itemViews,
      tableViews: appSchema.tableViews,
      views: appSchema.views,
      screens: appSchema.screens,
    });

    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 1,
    });
    await saveSchema(nextSchema, "2026-04-28T00:01:00.000Z");

    const snapshot = await readLocalSnapshot();

    expect(snapshot.schema).toEqual(nextSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:01:00.000Z");
    expect(snapshot.records).toEqual([record("record-1", "First")]);
    expect(snapshot.cursor).toBe(1);
  });

  it("stores and merges boolean record values", async () => {
    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First", false)],
      cursor: 1,
    });
    await mergeChanges([change(2, "record-1", "First", true)], 2);

    const snapshot = await readLocalSnapshot();

    expect(snapshot.records).toEqual([record("record-1", "First", true)]);
    expect(typeof snapshot.records[0]?.values.done).toBe("boolean");
  });

  it("stores and merges number record values", async () => {
    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [recordWithEstimate("record-1", "First", 2)],
      cursor: 1,
    });
    await mergeChanges([changeWithEstimate(2, "record-1", "First", 3)], 2);

    const snapshot = await readLocalSnapshot();

    expect(snapshot.records).toEqual([recordWithEstimate("record-1", "First", 3)]);
    expect(typeof snapshot.records[0]?.values.estimate).toBe("number");
  });
});

function record(id: string, title: string, done = false): StoredRecord {
  const timestamp = `2026-04-28T00:00:0${id.at(-1)}.000Z`;

  return {
    id,
    entity: "task",
    values: { title, done },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function deleteRawDatabase(name: string) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Could not delete ${name}.`));
    request.onblocked = () => reject(new Error(`${name} delete was blocked.`));
  });
}

function createRawDatabase(name: string) {
  return openRawDatabase(name).then((db) => db.close());
}

function openRawDatabase(name: string) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(`Could not open ${name}.`));
  });
}

async function rawDatabaseNames() {
  const databases = await indexedDB.databases();

  return databases
    .map((database) => database.name)
    .filter((name): name is string => typeof name === "string")
    .toSorted();
}
function recordWithEstimate(id: string, title: string, estimate: number): StoredRecord {
  return {
    ...record(id, title),
    values: { title, done: false, estimate },
  };
}
function taskOperations(
  label: string,
  fields: AppSchema["entities"][number]["fields"],
): NonNullable<AppSchema["entities"][number]["operations"]> {
  const input = {
    fields: fields.map(({ key }) => ({ key, field: key })),
  };
  const clearCompletedTasks = appSchema.entities
    .find((definition) => definition.key === "task")!
    .operations!.find((definition) => definition.key === "clearCompletedTasks")!;
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
    ...(clearCompletedTasks === undefined ? [] : [clearCompletedTasks]),
  ];
}
function change(seq: number, recordId: string, title: string, done = false): ChangeRow {
  return {
    seq,
    writeId: `write-${seq}`,
    operationKind: seq === 2 && recordId === "record-1" ? "update" : "create",
    entity: "task",
    recordId,
    payload: record(recordId, title, done),
    createdAt: `2026-04-28T00:00:0${seq}.000Z`,
  };
}

function changeWithEstimate(
  seq: number,
  recordId: string,
  title: string,
  estimate: number,
): ChangeRow {
  return {
    ...change(seq, recordId, title, false),
    payload: recordWithEstimate(recordId, title, estimate),
  };
}
