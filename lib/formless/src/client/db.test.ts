import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import {
  clientDbName,
  deleteClientDb,
  deleteFormlessReplicaDatabases,
  FormlessReplicaDatabaseDeleteBlockedError,
  isFormlessReplicaDatabaseName,
  saveBootstrapResponse,
  saveSchema,
  mergeChanges,
  mergeRecords,
  readCursor,
  readLocalSnapshot,
} from "./db.ts";
import {
  identityControlPlaneClientTarget,
  instanceControlPlaneClientTarget,
} from "./app-target.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { BootstrapResponse, ChangeRow } from "../shared/protocol.ts";
import { parseAppSchema, type AppSchema } from "@dpeek/formless-schema";
import { installedAppStorageIdentity } from "../shared/app-storage-identity.ts";
import { taskSourceSchema as appSchema } from "../test/schema-apps.ts";

beforeEach(async () => {
  await deleteClientDb("tasks");
  await deleteClientDb("site");
  await deleteClientDb(instanceControlPlaneClientTarget());
  await deleteClientDb(identityControlPlaneClientTarget());
  await deleteClientDb(installedSiteIdentity("personal"));
  await deleteClientDb(installedSiteIdentity("docs"));
  await deleteRawDatabase("notes");
});

describe("client db", () => {
  it("stores bootstrap schema, records, cursor, and last-sync metadata", async () => {
    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 7,
    } satisfies BootstrapResponse);

    const snapshot = await readLocalSnapshot("tasks");

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

    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaProvenance: {
        kind: "package-app",
        packageAppKey: "tasks",
        packageRevision: 4,
        sourceSchemaHash,
      },
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [],
      cursor: 0,
    } satisfies BootstrapResponse);

    expect((await readLocalSnapshot("tasks")).schemaProvenance).toEqual({
      kind: "package-app",
      packageAppKey: "tasks",
      packageRevision: 4,
      sourceSchemaHash,
    });

    await saveSchema("tasks", appSchema, "2026-04-28T00:01:00.000Z");

    expect((await readLocalSnapshot("tasks")).schemaProvenance).toBeNull();
  });

  it("stores each schema key in its own IndexedDB database", async () => {
    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "Task")],
      cursor: 1,
    });
    await saveBootstrapResponse("site", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-2", "Site")],
      cursor: 2,
    });

    await deleteRawDatabase("formless:site");

    expect((await readLocalSnapshot("tasks")).records).toEqual([record("record-1", "Task")]);
    expect(await readLocalSnapshot("site")).toMatchObject({
      schema: null,
      records: [],
      cursor: 0,
    });
  });

  it("stores installed app replicas by install id", async () => {
    const personal = installedSiteIdentity("personal");
    const docs = installedSiteIdentity("docs");

    await saveBootstrapResponse(personal, {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "Personal")],
      cursor: 1,
    });
    await saveBootstrapResponse(docs, {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-2", "Docs")],
      cursor: 2,
    });

    await deleteRawDatabase("formless:app:docs");

    expect(clientDbName(personal)).toBe("formless:app:personal");
    expect((await readLocalSnapshot(personal)).records).toEqual([record("record-1", "Personal")]);
    expect(await readLocalSnapshot(docs)).toMatchObject({
      schema: null,
      records: [],
      cursor: 0,
    });
  });

  it("stores the instance control-plane replica separately from bundled apps", async () => {
    const controlPlaneTarget = instanceControlPlaneClientTarget();
    const identityTarget = identityControlPlaneClientTarget();

    await saveBootstrapResponse(controlPlaneTarget, {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("install-1", "Personal Site")],
      cursor: 3,
    });
    await saveBootstrapResponse(identityTarget, {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:01.000Z",
      records: [record("role-1", "Instance owner")],
      cursor: 1,
    });

    expect(clientDbName(controlPlaneTarget)).toBe("formless:instance:control-plane");
    expect(clientDbName(identityTarget)).toBe("formless:instance:identity");
    expect((await readLocalSnapshot(controlPlaneTarget)).records).toEqual([
      record("install-1", "Personal Site"),
    ]);
    expect((await readLocalSnapshot(identityTarget)).records).toEqual([
      record("role-1", "Instance owner"),
    ]);
    expect((await readLocalSnapshot("tasks")).records).toEqual([]);
  });

  it("deletes only same-origin Formless replica databases", async () => {
    const personal = installedSiteIdentity("personal");
    const controlPlaneTarget = instanceControlPlaneClientTarget();
    const identityTarget = identityControlPlaneClientTarget();

    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "Task")],
      cursor: 1,
    });
    await saveBootstrapResponse(personal, {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-2", "Personal")],
      cursor: 2,
    });
    await saveBootstrapResponse(controlPlaneTarget, {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-3", "Control plane")],
      cursor: 3,
    });
    await saveBootstrapResponse(identityTarget, {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:01.000Z",
      records: [record("record-4", "Identity")],
      cursor: 4,
    });
    await createRawDatabase("notes");

    const result = await deleteFormlessReplicaDatabases();
    const databaseNames = await rawDatabaseNames();

    expect(result.deletedDatabaseNames).toEqual([
      "formless:app:personal",
      "formless:instance:control-plane",
      "formless:instance:identity",
      "formless:tasks",
    ]);
    expect(result.skippedDatabaseNames).toContain("notes");
    expect(databaseNames).not.toContain("formless:tasks");
    expect(databaseNames).not.toContain("formless:app:personal");
    expect(databaseNames).not.toContain("formless:instance:identity");
    expect(databaseNames).not.toContain("formless:instance:control-plane");
    expect(databaseNames).toContain("notes");
    expect(isFormlessReplicaDatabaseName("notes")).toBe(false);
    expect(isFormlessReplicaDatabaseName("formless:unknown")).toBe(false);
    expect(isFormlessReplicaDatabaseName("formless:app:")).toBe(false);
  });

  it("reports blocked Formless replica database deletion", async () => {
    const db = await openRawDatabase("formless:tasks");

    try {
      await expect(deleteFormlessReplicaDatabases()).rejects.toMatchObject({
        blockedDatabaseNames: ["formless:tasks"],
        name: "FormlessReplicaDatabaseDeleteBlockedError",
      } satisfies Partial<FormlessReplicaDatabaseDeleteBlockedError>);
    } finally {
      db.close();
    }
  });

  it("migrates older local replica metadata without replacing records", async () => {
    await createLegacyReplica("formless:tasks", { recordsKeyPath: "id" });

    const snapshot = await readLocalSnapshot("tasks");
    const replicaVersion = await readRawMetaValue<number>("formless:tasks", "replicaVersion");

    expect(snapshot.records).toEqual([record("record-1", "Legacy")]);
    expect(snapshot.cursor).toBe(3);
    expect(replicaVersion).toBe(2);
  });
  it("deletes a schema cache missing required entity ids without touching other databases", async () => {
    await createLegacyReplica("formless:tasks", {
      recordsKeyPath: "id",
      storedSchema: {
        ...appSchema,
        entities: appSchema.entities.map(({ id: _id, ...entity }) => entity),
      },
    });
    await createRawDatabase("notes");
    expect(await readLocalSnapshot("tasks")).toEqual({
      schema: null,
      schemaProvenance: null,
      schemaUpdatedAt: null,
      records: [],
      cursor: 0,
      lastSyncedAt: null,
    });
    expect(await rawDatabaseNames()).not.toContain("formless:tasks");
    expect(await rawDatabaseNames()).toContain("notes");
  });
  it("deletes unsafe local replica cache when IndexedDB migration fails", async () => {
    await createLegacyReplica("formless:tasks", { recordsKeyPath: null });
    const snapshot = await readLocalSnapshot("tasks");
    expect(snapshot).toMatchObject({
      schema: null,
      records: [],
      cursor: 0,
    });
  });

  it("merges records and advances the cursor", async () => {
    await mergeRecords("tasks", [record("record-1", "First")], 1);
    await mergeChanges("tasks", [change(2, "record-2", "Second", true)], 2);

    const snapshot = await readLocalSnapshot("tasks");

    expect(snapshot.records.map((storedRecord) => storedRecord.id)).toEqual([
      "record-1",
      "record-2",
    ]);
    expect(snapshot.cursor).toBe(2);
    expect(await readCursor("tasks")).toBe(2);
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

    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 1,
    });
    await saveSchema("tasks", nextSchema, "2026-04-28T00:01:00.000Z");

    const snapshot = await readLocalSnapshot("tasks");

    expect(snapshot.schema).toEqual(nextSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:01:00.000Z");
    expect(snapshot.records).toEqual([record("record-1", "First")]);
    expect(snapshot.cursor).toBe(1);
  });

  it("stores and merges boolean record values", async () => {
    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First", false)],
      cursor: 1,
    });
    await mergeChanges("tasks", [change(2, "record-1", "First", true)], 2);

    const snapshot = await readLocalSnapshot("tasks");

    expect(snapshot.records).toEqual([record("record-1", "First", true)]);
    expect(typeof snapshot.records[0]?.values.done).toBe("boolean");
  });

  it("stores and merges number record values", async () => {
    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [recordWithEstimate("record-1", "First", 2)],
      cursor: 1,
    });
    await mergeChanges("tasks", [changeWithEstimate(2, "record-1", "First", 3)], 2);

    const snapshot = await readLocalSnapshot("tasks");

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
function createLegacyReplica(
  name: string,
  options: {
    recordsKeyPath: "id" | null;
    storedSchema?: unknown;
  },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("meta");
      if (options.recordsKeyPath === "id") {
        db.createObjectStore("records", { keyPath: "id" });
      } else {
        db.createObjectStore("records");
      }
    };

    request.onerror = () => reject(request.error ?? new Error(`Could not create ${name}.`));
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(["meta", "records"], "readwrite");
      const meta = transaction.objectStore("meta");
      const records = transaction.objectStore("records");
      const legacyRecord = record("record-1", "Legacy");
      meta.put(options.storedSchema ?? appSchema, "schema");
      meta.put("2026-04-28T00:00:00.000Z", "schemaUpdatedAt");
      meta.put(3, "cursor");
      if (options.recordsKeyPath === "id") {
        records.put(legacyRecord);
      } else {
        records.put(legacyRecord, legacyRecord.id);
      }
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onabort = () =>
        reject(transaction.error ?? new Error(`Could not write ${name}.`));
      transaction.onerror = () =>
        reject(transaction.error ?? new Error(`Could not write ${name}.`));
    };
  });
}

function readRawMetaValue<T>(name: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);

    request.onerror = () => reject(request.error ?? new Error(`Could not open ${name}.`));
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("meta", "readonly");
      const valueRequest = transaction.objectStore("meta").get(key);

      valueRequest.onsuccess = () => {
        db.close();
        resolve(valueRequest.result as T | undefined);
      };
      valueRequest.onerror = () =>
        reject(valueRequest.error ?? new Error(`Could not read ${name}.`));
    };
  });
}

function installedSiteIdentity(installId: string) {
  const identity = installedAppStorageIdentity({ installId, packageAppKey: "site" });

  if (!identity) {
    throw new Error(`Expected installed Site identity for ${installId}.`);
  }

  return identity;
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
