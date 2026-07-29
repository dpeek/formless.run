import { parseAppSchema } from "@dpeek/formless-schema";
import { describe, expect, it } from "vite-plus/test";

import {
  STORAGE_SNAPSHOT_KIND,
  STORAGE_SNAPSHOT_VERSION,
  formatStoredRecordForArtifact,
  formatStoredRecordsForArtifact,
  isFieldValue,
  isRecordValues,
  isStoredRecord,
  parseStorageSnapshot,
  type StorageSnapshot,
  type StoredRecord,
} from "./index.ts";
const appSchema = parseAppSchema({
  version: 1,
  entities: [
    {
      id: "entity_a6217a34-ef01-4513-968e-6cd9a6806376",
      key: "project",
      label: "Project",
      fields: [
        {
          key: "label",
          type: "text",
          required: true,
          label: "Label",
        },
      ],
      operations: writeOperations("Project", ["label"]),
    },
    {
      id: "entity_426fb25a-3d8e-49f2-8d14-22517c9b435c",
      key: "task",
      label: "Task",
      fields: [
        {
          key: "title",
          type: "text",
          required: true,
          label: "Title",
        },
        {
          key: "done",
          type: "boolean",
          required: true,
          label: "Done",
          default: false,
        },
      ],
      operations: writeOperations("Task", ["title", "done"]),
    },
  ],
  queries: [{ key: "taskAll", label: "Tasks", entity: "task", expression: { kind: "all" } }],
  itemViews: [
    {
      key: "taskItem",
      entity: "task",
      fields: [{ field: "title", editor: "text", commit: "field-commit" }],
    },
  ],
  tableViews: [],
  views: [
    {
      key: "taskList",
      type: "collection",
      label: "Tasks",
      entity: "task",
      queries: [{ query: "taskAll" }],
      defaultQuery: "taskAll",
      result: { type: "list", itemView: "taskItem" },
    },
  ],
  screens: [
    {
      key: "home",
      type: "workspace",
      label: "Home",
      layout: {
        type: "stack",
        sections: [{ id: "tasks", type: "collection", view: "taskList" }],
      },
    },
  ],
});
function writeOperations(label: string, fields: string[]) {
  const input = {
    fields: fields.map((field) => ({ key: field, field })),
  };
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
  ];
}
describe("storage snapshot package", () => {
  it("formats records by schema declaration and id with schema-ordered values", () => {
    const records = formatStoredRecordsForArtifact(appSchema, [
      {
        ...record("task-z"),
        values: { zeta: "forward", done: false, alpha: "forward", title: "Last" },
      },
      {
        ...record("task-a"),
        values: { done: true, title: "First" },
        deletedAt: "2026-04-29T00:00:00.000Z",
      },
      {
        ...record("project-z"),
        entity: "project",
        values: { label: "Project" },
      },
      {
        ...record("unknown-z"),
        entity: "unknown-z",
        values: { zeta: "last", alpha: "first" },
      },
      {
        ...record("unknown-a"),
        entity: "unknown-a",
        values: {},
      },
    ]);

    expect(records.map(({ entity, id }) => `${entity}:${id}`)).toEqual([
      "project:project-z",
      "task:task-a",
      "task:task-z",
      "unknown-a:unknown-a",
      "unknown-z:unknown-z",
    ]);
    expect(Object.keys(records[2]!.values)).toEqual(["title", "done", "alpha", "zeta"]);
    expect(Object.keys(records[3]!.values)).toEqual([]);
    expect(Object.keys(records[4]!.values)).toEqual(["alpha", "zeta"]);
    expect(records[1]!.deletedAt).toBe("2026-04-29T00:00:00.000Z");
  });

  it("omits absent fields and ignores input value property order", () => {
    const left = formatStoredRecordForArtifact(appSchema, {
      ...record("record-1"),
      values: { done: false, title: "First" },
    });
    const right = formatStoredRecordForArtifact(appSchema, {
      ...record("record-1"),
      values: { title: "First", done: false },
    });
    const missing = formatStoredRecordForArtifact(appSchema, {
      ...record("record-1"),
      values: { title: "First" },
    });

    expect(left).toEqual(right);
    expect(Object.keys(left.values)).toEqual(["title", "done"]);
    expect(Object.keys(missing.values)).toEqual(["title"]);
  });

  it("parses the supported version 1 envelope", () => {
    const snapshot = storageSnapshot({
      records: [
        record("record-1"),
        {
          ...record("record-2"),
          deletedAt: "2026-04-29T00:00:00.000Z",
        },
      ],
    });

    expect(
      parseStorageSnapshot(snapshot, {
        schemaKey: "tasks",
        storageIdentity: "app:work",
      }),
    ).toEqual(snapshot);
  });

  it("rejects bad kind, version, storage identity, and schema key shape", () => {
    expect(() =>
      parseStorageSnapshot({
        ...storageSnapshot(),
        kind: "formless.other",
      }),
    ).toThrow('Storage snapshot kind must be "formless.storageSnapshot".');

    expect(() =>
      parseStorageSnapshot({
        ...storageSnapshot(),
        version: 2,
      }),
    ).toThrow("Storage snapshot version must be 1.");

    expect(() =>
      parseStorageSnapshot({
        ...storageSnapshot(),
        storageIdentity: "",
      }),
    ).toThrow("Storage snapshot storageIdentity must be a non-empty string.");

    expect(() => parseStorageSnapshot(storageSnapshot(), { storageIdentity: "app:other" })).toThrow(
      'Storage snapshot storageIdentity must be "app:other".',
    );

    expect(() =>
      parseStorageSnapshot({
        ...storageSnapshot(),
        schemaKey: "",
      }),
    ).toThrow("Storage snapshot schemaKey must be a non-empty string.");

    expect(() => parseStorageSnapshot(storageSnapshot(), { schemaKey: "rates" })).toThrow(
      'Storage snapshot schemaKey must be "rates".',
    );
  });

  it("rejects unsupported envelope shapes", () => {
    expect(() =>
      parseStorageSnapshot({
        ...storageSnapshot(),
        sourceCursor: 1.5,
      }),
    ).toThrow("Storage snapshot sourceCursor must be a non-negative integer.");

    expect(() =>
      parseStorageSnapshot({
        ...storageSnapshot(),
        records: [{ ...record("record-1"), createdAt: 123 }],
      }),
    ).toThrow("Storage snapshot records[0] must be a stored record.");
    expect(() =>
      parseStorageSnapshot({
        ...storageSnapshot(),
        records: [{ ...record("record-1"), updatedAt: 123 }],
      }),
    ).toThrow("Storage snapshot records[0] must be a stored record.");

    expect(() =>
      parseStorageSnapshot({
        ...storageSnapshot(),
        extra: true,
      }),
    ).toThrow('Storage snapshot has unsupported key "extra".');
  });

  it("validates flat stored records and record values", () => {
    expect(isFieldValue("title")).toBe(true);
    expect(isFieldValue(true)).toBe(true);
    expect(isFieldValue(7)).toBe(true);
    expect(isFieldValue(Number.NaN)).toBe(false);
    expect(isRecordValues({ title: "First", done: false, estimate: 3 })).toBe(true);
    expect(isRecordValues({ nested: { bad: true } })).toBe(false);
    expect(isStoredRecord(record("record-1"))).toBe(true);
    expect(isStoredRecord({ ...record("record-1"), values: { nested: {} } })).toBe(false);
  });
});

function storageSnapshot(overrides: Partial<StorageSnapshot> = {}): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: "app:work",
    schemaKey: "tasks",
    exportedAt: "2026-04-28T00:00:00.000Z",
    schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
    sourceCursor: 7,
    schema: appSchema,
    records: [record("record-1")],
    ...overrides,
  };
}

function record(id: string): StoredRecord {
  return {
    id,
    entity: "task",
    values: { title: "First", done: false },
    createdAt: "2026-04-28T00:00:01.000Z",
    updatedAt: "2026-04-28T00:00:01.000Z",
  };
}
