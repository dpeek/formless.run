import { beforeEach, describe, expect, it } from "vite-plus/test";
import {
  applyBootstrapResponse,
  applyChanges,
  applyRecordMerge,
  applySchemaSave,
  getClientStoreSnapshot,
  resetClientStore,
  selectClientStoreTarget,
  subscribeToClientStoreSelector,
} from "./store.ts";
import { programClientTarget } from "./app-target.ts";
import { installedAppStorageIdentity } from "../shared/app-storage-identity.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { BootstrapResponse } from "../shared/protocol.ts";
import { parseAppSchema, type AppSchema } from "@dpeek/formless-schema";
import { taskSourceSchema as appSchema } from "../test/schema-apps.ts";

beforeEach(() => {
  resetClientStore();
});

describe("client store", () => {
  it("normalizes bootstrap records by ID and entity", () => {
    applyBootstrapResponse(bootstrap([record("record-1", "First"), record("record-2", "Second")]));

    const snapshot = getClientStoreSnapshot();

    expect(snapshot.hydrated).toBe(true);
    expect(snapshot.recordsById["record-1"]).toEqual(record("record-1", "First"));
    expect(snapshot.recordIdsByEntity.task).toEqual(["record-1", "record-2"]);
    expect(snapshot.cursor).toBe(1);
  });

  it("preserves unrelated record and entity ID array identity on patch", () => {
    applyBootstrapResponse(
      bootstrap([
        record("record-1", "First"),
        record("record-2", "Second"),
        record("note-1", "Note", false, "note"),
      ]),
    );
    const before = getClientStoreSnapshot();

    applyRecordMerge([record("record-1", "Updated")], 2);
    const after = getClientStoreSnapshot();

    expect(after.recordsById["record-1"]).not.toBe(before.recordsById["record-1"]);
    expect(after.recordsById["record-2"]).toBe(before.recordsById["record-2"]);
    expect(after.recordsById["note-1"]).toBe(before.recordsById["note-1"]);
    expect(after.recordIdsByEntity.task).toBe(before.recordIdsByEntity.task);
    expect(after.recordIdsByEntity.note).toBe(before.recordIdsByEntity.note);
  });

  it("appends only the created entity ID array", () => {
    applyBootstrapResponse(
      bootstrap([record("record-1", "First"), record("note-1", "Note", false, "note")]),
    );
    const before = getClientStoreSnapshot();

    applyRecordMerge([record("record-2", "Second")], 2);
    const after = getClientStoreSnapshot();

    expect(after.recordIdsByEntity.task).toEqual(["record-1", "record-2"]);
    expect(after.recordIdsByEntity.task).not.toBe(before.recordIdsByEntity.task);
    expect(after.recordIdsByEntity.note).toBe(before.recordIdsByEntity.note);
  });

  it("preserves record identity on schema updates", () => {
    const nextSchema = schemaWithSummary();

    applyBootstrapResponse(bootstrap([record("record-1", "First")]));
    const before = getClientStoreSnapshot();

    applySchemaSave(nextSchema, "2026-04-28T00:01:00.000Z");
    const after = getClientStoreSnapshot();

    expect(after.schema).toEqual(nextSchema);
    expect(after.recordsById["record-1"]).toBe(before.recordsById["record-1"]);
    expect(after.recordIdsByEntity.task).toBe(before.recordIdsByEntity.task);
  });

  it("cursor-only updates do not change schema or record identities", () => {
    applyBootstrapResponse(bootstrap([record("record-1", "First")]));
    const before = getClientStoreSnapshot();

    applyChanges([], 2);
    const after = getClientStoreSnapshot();

    expect(after.cursor).toBe(2);
    expect(after.schema).toBe(before.schema);
    expect(after.recordsById).toBe(before.recordsById);
    expect(after.recordIdsByEntity).toBe(before.recordIdsByEntity);
  });

  it("ignores stale responses for an inactive installed app", () => {
    const installed = installedAppStorageIdentity({ installId: "private", packageAppKey: "crm" });

    if (!installed) {
      throw new Error("Expected installed app identity.");
    }

    selectClientStoreTarget(installed);
    applyBootstrapResponse(bootstrap([record("record-1", "First")]), programClientTarget());

    expect(getClientStoreSnapshot().activeSchemaKey).toBe("crm");
    expect(getClientStoreSnapshot().recordsById).toEqual({});

    applyBootstrapResponse(bootstrap([record("record-2", "Private")]), installed);

    expect(getClientStoreSnapshot().recordsById["record-2"]).toEqual(record("record-2", "Private"));
  });

  it("tracks the runtime-owned control-plane schema key for its client target", () => {
    const controlPlaneTarget = programClientTarget();

    applyBootstrapResponse(bootstrap([record("install-1", "Personal Site")]), controlPlaneTarget);

    expect(getClientStoreSnapshot()).toMatchObject({
      activeClientStorageName: "formless:instance:control-plane",
      activeSchemaKey: "formless-program",
    });
    expect(getClientStoreSnapshot().recordsById["install-1"]).toEqual(
      record("install-1", "Personal Site"),
    );
  });
});

describe("client store selectors", () => {
  it("notifies a changed field subscriber only for that field", () => {
    const titleValues: unknown[] = [];
    const doneValues: unknown[] = [];

    applyBootstrapResponse(bootstrap([record("record-1", "First", false)]));
    const unsubscribeTitle = subscribeToClientStoreSelector(
      (snapshot) => snapshot.recordsById["record-1"]?.values.title,
      (value) => titleValues.push(value),
    );
    const unsubscribeDone = subscribeToClientStoreSelector(
      (snapshot) => snapshot.recordsById["record-1"]?.values.done,
      (value) => doneValues.push(value),
    );

    try {
      applyRecordMerge([record("record-1", "Updated", false)], 2);

      expect(titleValues).toEqual(["Updated"]);
      expect(doneValues).toEqual([]);
    } finally {
      unsubscribeTitle();
      unsubscribeDone();
    }
  });

  it("does not notify another record subscriber when one record changes", () => {
    const values: unknown[] = [];

    applyBootstrapResponse(bootstrap([record("record-1", "First"), record("record-2", "Second")]));
    const unsubscribe = subscribeToClientStoreSelector(
      (snapshot) => snapshot.recordsById["record-2"],
      (value) => values.push(value),
    );

    try {
      applyRecordMerge([record("record-1", "Updated")], 2);

      expect(values).toEqual([]);
    } finally {
      unsubscribe();
    }
  });

  it("does not notify a record created-at subscriber when only field values change", () => {
    const values: unknown[] = [];

    applyBootstrapResponse(bootstrap([record("record-1", "First")]));
    const unsubscribe = subscribeToClientStoreSelector(
      (snapshot) => snapshot.recordsById["record-1"]?.createdAt,
      (value) => values.push(value),
    );

    try {
      applyRecordMerge([record("record-1", "Updated")], 2);

      expect(values).toEqual([]);
    } finally {
      unsubscribe();
    }
  });

  it("changes entity record IDs on create but not patch", () => {
    const idLists: string[][] = [];

    applyBootstrapResponse(bootstrap([record("record-1", "First")]));
    const unsubscribe = subscribeToClientStoreSelector(
      (snapshot) => snapshot.recordIdsByEntity.task,
      (value) => idLists.push(value),
    );

    try {
      applyRecordMerge([record("record-1", "Updated")], 2);
      applyRecordMerge([record("record-2", "Second")], 3);

      expect(idLists).toEqual([["record-1", "record-2"]]);
    } finally {
      unsubscribe();
    }
  });
});

function bootstrap(records: StoredRecord[], schema: AppSchema = appSchema): BootstrapResponse {
  return {
    schema,
    schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
    records,
    cursor: 1,
  };
}

function record(id: string, title: string, done = false, entity = "task"): StoredRecord {
  const timestamp = `2026-04-28T00:00:0${id.at(-1)}.000Z`;

  return {
    id,
    entity,
    values: { title, done },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
function schemaWithSummary() {
  const fields = [
    ...appSchema.entities.find((definition) => definition.key === "task")!.fields,
    { type: "text", required: false, key: "notes" },
  ] satisfies AppSchema["entities"][number]["fields"];
  return parseAppSchema({
    version: 1,
    entities: [
      {
        id: "entity_611a0a0a-ac3d-4157-909d-495c0d54c0ad",
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
}
function taskOperations(label: string, fields: AppSchema["entities"][number]["fields"]) {
  const input = {
    fields: fields.map(({ key }) => ({ key, field: key })),
  };
  const clearCompletedTasks = appSchema.entities
    .find((definition) => definition.key === "task")!
    .operations!.find((definition) => definition.key === "clearCompletedTasks")!;
  return [
    {
      key: "create",
      label: `Create ${label}`,
      kind: "create",
      scope: "collection",
      input,
      effect: { type: "createRecord" },
      output: { type: "create" },
      idempotency: { required: true },
      audit: { input: "summary" },
    },
    {
      key: "update",
      label: `Update ${label}`,
      kind: "update",
      scope: "record",
      input,
      effect: { type: "patchRecord" },
      output: { type: "update" },
      idempotency: { required: true },
      audit: { input: "summary" },
    },
    ...(clearCompletedTasks === undefined ? [] : [clearCompletedTasks]),
  ];
}
