import { describe, expect, it } from "vite-plus/test";

import type { AppSchema, EntitySchema } from "@dpeek/formless-schema";
import { instanceControlPlaneSchema } from "@dpeek/formless-instance-control-plane";
import {
  STORAGE_SNAPSHOT_KIND,
  STORAGE_SNAPSHOT_VERSION,
  type RecordValues,
  type StorageSnapshot,
  type StoredRecord,
} from "@dpeek/formless-storage";
import { rateSourceSchema, siteSourceSchema, taskSourceSchema } from "../test/schema-apps.ts";
import type { AuthorityRecordValidationReader } from "./authority-record-validation-reader.ts";
import {
  validateCompatibleSchemaChange,
  validateRecordWriteRequest,
  validateRecordWriteRequestAsync,
  validateSchemaUpdateRequest,
  validateStorageSnapshotRestore,
} from "./authority-validation.ts";
import { BadRequestError } from "./errors.ts";
import type {
  IdentityReferenceTargetResolution,
  IdentityReferenceTargetResolver,
} from "./identity-reference-targets.ts";
import type { RecordWriteResponse } from "./storage-write-log.ts";

const timestamp = "2026-07-15T00:00:00.000Z";
const expectedSnapshotIdentity = { schemaKey: "tasks", storageIdentity: "tasks" };

describe("Authority schema validation", () => {
  it("parses schema update requests and wraps schema parser failures", () => {
    expect(validateSchemaUpdateRequest({ schema: taskSourceSchema }, taskSourceSchema, [])).toEqual(
      taskSourceSchema,
    );

    expect(() => validateSchemaUpdateRequest(undefined, taskSourceSchema, [])).toThrow(
      new BadRequestError("Schema update must be an object."),
    );
    expect(() =>
      validateSchemaUpdateRequest(
        {
          schema: {
            ...taskSourceSchema,
            entities: taskSourceSchema.entities.map((entity) =>
              entity.key === "task"
                ? {
                    ...entity,
                    fields: entity.fields.map((field) =>
                      field.key === "title"
                        ? { key: "title", type: "money", required: true }
                        : field,
                    ),
                  }
                : entity,
            ),
          },
        },
        taskSourceSchema,
        [],
      ),
    ).toThrow(new BadRequestError('Field "task.title" has unsupported type "money".'));
  });
  it("wraps query and view parser errors at the Authority boundary", () => {
    const taskAll = taskSourceSchema.queries.find((definition) => definition.key === "taskAll")!;
    const taskHome = taskSourceSchema.views.find((definition) => definition.key === "taskHome")!;
    expect(() =>
      validateSchemaUpdateRequest(
        {
          schema: {
            ...taskSourceSchema,
            queries: taskSourceSchema.queries.map((query) =>
              query.key === "taskAll"
                ? {
                    ...taskAll,
                    expression: {
                      kind: "where",
                      ref: { kind: "value", name: "missing" },
                      op: "eq",
                      value: "missing",
                    },
                  }
                : query,
            ),
          },
        },
        taskSourceSchema,
        [],
      ),
    ).toThrow(
      new BadRequestError('Query "query taskAll" references unknown field "value.missing".'),
    );

    expect(() =>
      validateSchemaUpdateRequest(
        {
          schema: {
            ...taskSourceSchema,
            views: taskSourceSchema.views.map((view) =>
              view.key === "taskHome"
                ? {
                    ...taskHome,
                    operations: [{ operation: "task.missing" }],
                  }
                : view,
            ),
          },
        },
        taskSourceSchema,
        [],
      ),
    ).toThrow(
      new BadRequestError(
        'Collection view "taskHome" operation binding 0 references unknown operation "task.missing".',
      ),
    );
  });
  it("accepts compatible field additions and rejects destructive field changes", () => {
    const taskFields = taskSourceSchema.entities.find(
      (definition) => definition.key === "task",
    )!.fields;
    const withNotes = withTaskFields([
      ...taskFields,
      { type: "text", required: false, label: "Notes", key: "notes" },
    ]);
    expect(() => validateCompatibleSchemaChange(taskSourceSchema, withNotes, [])).not.toThrow();
    const withoutTitle = taskFields.filter(({ key }) => key !== "title");
    expect(() =>
      validateCompatibleSchemaChange(taskSourceSchema, withTaskFields(withoutTitle), []),
    ).toThrow(new BadRequestError('Cannot remove or rename field "task.title".'));

    expect(() =>
      validateCompatibleSchemaChange(
        taskSourceSchema,
        withTaskFields(
          taskFields.map((field) =>
            field.key === "title"
              ? { type: "boolean", required: true, label: "Title", key: "title" }
              : field,
          ),
        ),
        [],
      ),
    ).toThrow(new BadRequestError('Cannot change field type for "task.title".'));

    expect(() =>
      validateCompatibleSchemaChange(rateSourceSchema, withRateResourceField({ to: "card" }), []),
    ).toThrow(new BadRequestError('Cannot change reference target for "rate.resource".'));
  });
  it("rejects changing the entity id assigned to a continuing key", () => {
    const nextSchema = structuredClone(taskSourceSchema);
    nextSchema.entities.find((definition) => definition.key === "task")!.id =
      "entity_0be22eea-6edb-48ed-9230-4e98954c9f8a";

    expect(() => validateSchemaUpdateRequest({ schema: nextSchema }, taskSourceSchema, [])).toThrow(
      new BadRequestError(
        'Cannot change entity id for continuing entity "task" from "entity_dc20cc24-23e4-4a16-98fe-bd6e09427c68" to "entity_0be22eea-6edb-48ed-9230-4e98954c9f8a".',
      ),
    );
  });

  it("checks required, number, and reference constraints against stored values", () => {
    const task = taskRecord("task-1");
    expect(() =>
      validateCompatibleSchemaChange(
        taskSourceSchema,
        withTaskFields([
          ...taskSourceSchema.entities.find((definition) => definition.key === "task")!.fields,
          { type: "number", required: true, label: "Score", key: "score" },
        ]),
        [task],
      ),
    ).toThrow(
      new BadRequestError(
        'Cannot require field "task.score" because existing records are missing it.',
      ),
    );

    const card = cardRecord("card-1", { marginMin: 0.4 });
    expect(() =>
      validateCompatibleSchemaChange(rateSourceSchema, withCardMarginMin(0.5), [card]),
    ).toThrow(
      new BadRequestError(
        'Cannot change number constraints for "card.marginMin" because existing records contain invalid values.',
      ),
    );

    const rateWithoutResource = rateRecord("rate-1", "resource-1", "card-1");
    delete rateWithoutResource.values.resource;
    expect(() =>
      validateCompatibleSchemaChange(
        withRateResourceField({ required: false }),
        withRateResourceField({ required: true }),
        [rateWithoutResource],
      ),
    ).toThrow(
      new BadRequestError(
        'Cannot change reference constraints for "rate.resource" because existing records contain invalid values.',
      ),
    );
  });

  it("rejects unique constraints violated by existing active records", () => {
    const resource = resourceRecord("resource-1");
    const card = cardRecord("card-1");
    const records = [
      resource,
      card,
      rateRecord("rate-1", resource.id, card.id),
      rateRecord("rate-2", resource.id, card.id),
    ];

    expect(() =>
      validateSchemaUpdateRequest({ schema: rateSourceSchema }, rateSourceSchema, records),
    ).toThrow(
      new BadRequestError(
        'Cannot add unique constraint "rate.uniqueRatePair" because existing records violate it.',
      ),
    );
  });
});

describe("Authority storage snapshot validation", () => {
  it("validates expected storage and schema identities", async () => {
    await expect(
      validateStorageSnapshotRestore(
        taskSnapshot({ storageIdentity: "app:work" }),
        expectedSnapshotIdentity,
      ),
    ).rejects.toThrow(new BadRequestError('Storage snapshot storageIdentity must be "tasks".'));
    await expect(
      validateStorageSnapshotRestore(taskSnapshot({ schemaKey: "crm" }), expectedSnapshotIdentity),
    ).rejects.toThrow(new BadRequestError('Storage snapshot schemaKey must be "tasks".'));
  });

  it("validates envelope and record timestamps", async () => {
    const cases: Array<[StorageSnapshot, string]> = [
      [
        taskSnapshot({ exportedAt: "2026-07-15" }),
        "Storage snapshot exportedAt must be an ISO timestamp.",
      ],
      [
        taskSnapshot({ schemaUpdatedAt: "invalid" }),
        "Storage snapshot schemaUpdatedAt must be an ISO timestamp.",
      ],
      [
        taskSnapshot({ records: [{ ...taskRecord("task-1"), createdAt: "invalid" }] }),
        'Storage snapshot record "task-1" createdAt must be an ISO timestamp.',
      ],
      [
        taskSnapshot({ records: [{ ...taskRecord("task-1"), updatedAt: "invalid" }] }),
        'Storage snapshot record "task-1" updatedAt must be an ISO timestamp.',
      ],
      [
        taskSnapshot({
          records: [{ ...taskRecord("task-1"), deletedAt: "invalid" }],
        }),
        'Storage snapshot record "task-1" deletedAt must be an ISO timestamp.',
      ],
    ];

    for (const [snapshot, message] of cases) {
      await expect(
        validateStorageSnapshotRestore(snapshot, expectedSnapshotIdentity),
      ).rejects.toThrow(new BadRequestError(message));
    }
  });

  it("rejects empty and duplicate record ids", async () => {
    await expect(
      validateStorageSnapshotRestore(
        taskSnapshot({ records: [taskRecord(" ")] }),
        expectedSnapshotIdentity,
      ),
    ).rejects.toThrow(new BadRequestError("Storage snapshot record id must be non-empty."));

    await expect(
      validateStorageSnapshotRestore(
        taskSnapshot({ records: [taskRecord("task-1"), taskRecord("task-1")] }),
        expectedSnapshotIdentity,
      ),
    ).rejects.toThrow(
      new BadRequestError('Storage snapshot includes duplicate record id "task-1".'),
    );
  });

  it("validates local reference targets from the snapshot record set", async () => {
    const resource = resourceRecord("resource-1");
    const card = cardRecord("card-1");
    const rate = rateRecord("rate-1", resource.id, card.id);
    const expected = { schemaKey: "rates", storageIdentity: "rates" };

    await expect(
      validateStorageSnapshotRestore(rateSnapshot({ records: [resource, card, rate] }), expected),
    ).resolves.toMatchObject({ records: [resource, card, rate] });

    const cases: Array<[StoredRecord[], string]> = [
      [[card, rate], 'Storage snapshot record "rate-1" has invalid field "rate.resource".'],
      [
        [card, rateRecord("rate-1", card.id, card.id)],
        'Storage snapshot record "rate-1" has invalid field "rate.resource".',
      ],
      [
        [{ ...resource, deletedAt: timestamp }, card, rate],
        'Storage snapshot record "rate-1" has invalid field "rate.resource".',
      ],
    ];

    for (const [records, message] of cases) {
      await expect(
        validateStorageSnapshotRestore(rateSnapshot({ records }), expected),
      ).rejects.toThrow(new BadRequestError(message));
    }
  });

  it("maps every identity-reference resolver outcome to Authority-safe errors", async () => {
    const snapshot = taskSnapshot({
      schema: taskSchemaWithIdentityReference(),
      records: [taskRecord("task-1", { ownerPrincipal: "principal-1" })],
    });
    const lookups: Array<{
      id: string;
      target: string;
    }> = [];
    const activeResolver: IdentityReferenceTargetResolver = async (lookup) => {
      lookups.push(lookup);
      return { kind: "active" };
    };

    await expect(
      validateStorageSnapshotRestore(snapshot, expectedSnapshotIdentity, {
        identityReferenceResolver: activeResolver,
      }),
    ).resolves.toMatchObject({ records: snapshot.records });
    expect(lookups).toEqual([{ id: "principal-1", target: "auth:principal" }]);

    await expect(
      validateStorageSnapshotRestore(snapshot, expectedSnapshotIdentity),
    ).rejects.toThrow(
      new BadRequestError(
        'Identity reference validation is unavailable for field "ownerPrincipal".',
      ),
    );

    const cases: Array<[IdentityReferenceTargetResolution, string]> = [
      [
        { kind: "missing" },
        'Field "ownerPrincipal" references unknown auth:principal record "principal-1".',
      ],
      [{ kind: "wrong-entity" }, 'Field "ownerPrincipal" must reference a auth:principal record.'],
      [
        { kind: "tombstoned" },
        'Field "ownerPrincipal" cannot reference tombstoned record "principal-1".',
      ],
      [
        { kind: "unsupported" },
        'Field "ownerPrincipal" references unsupported identity target "auth:principal".',
      ],
      [
        { kind: "unavailable" },
        'Identity reference validation is unavailable for field "ownerPrincipal".',
      ],
    ];

    for (const [resolution, message] of cases) {
      await expect(
        validateStorageSnapshotRestore(snapshot, expectedSnapshotIdentity, {
          identityReferenceResolver: async () => resolution,
        }),
      ).rejects.toThrow(new BadRequestError(message));
    }
  });

  it("validates record entities, fields, and stored values", async () => {
    const cases: Array<[StoredRecord, string]> = [
      [
        { ...taskRecord("task-1"), entity: "missing" },
        'Storage snapshot record "task-1" references unknown entity "missing".',
      ],
      [
        taskRecord("task-1", { missing: "value" }),
        'Storage snapshot record "task-1" includes unknown field "task.missing".',
      ],
      [
        taskRecord("task-1", { title: "" }),
        'Storage snapshot record "task-1" has invalid field "task.title".',
      ],
      [
        taskRecord("task-1", { done: "false" }),
        'Storage snapshot record "task-1" has invalid field "task.done".',
      ],
    ];

    for (const [record, message] of cases) {
      await expect(
        validateStorageSnapshotRestore(
          taskSnapshot({ records: [record] }),
          expectedSnapshotIdentity,
        ),
      ).rejects.toThrow(new BadRequestError(message));
    }
  });

  it("enforces unique constraints for active snapshot records only", async () => {
    const resource = resourceRecord("resource-1");
    const card = cardRecord("card-1");
    const first = rateRecord("rate-1", resource.id, card.id);
    const duplicate = rateRecord("rate-2", resource.id, card.id);
    const expected = { schemaKey: "rates", storageIdentity: "rates" };

    await expect(
      validateStorageSnapshotRestore(
        rateSnapshot({ records: [resource, card, first, duplicate] }),
        expected,
      ),
    ).rejects.toThrow(
      new BadRequestError(
        'Cannot add unique constraint "rate.uniqueRatePair" because existing records violate it.',
      ),
    );

    await expect(
      validateStorageSnapshotRestore(
        rateSnapshot({
          records: [resource, card, first, { ...duplicate, deletedAt: timestamp }],
        }),
        expected,
      ),
    ).resolves.toMatchObject({ records: expect.arrayContaining([first]) });
  });
});

describe("Authority record validation readers", () => {
  it("normalizes scalar defaults and optional field clearing", () => {
    const schema = taskSchemaWithOptionalFields();
    const existing = taskRecord("task-1", {
      dueDate: "2026-07-15",
      estimate: 4,
      priority: "high",
    });
    const reader = recordValidationReader({ storedRecords: [existing] });

    expect(
      validateRecordWriteRequest(
        {
          writeId: "create-task",
          entity: "task",
          kind: "create",
          values: { title: "Plan week", dueDate: "2026-07-16", estimate: 0 },
        },
        schema,
        reader,
      ),
    ).toEqual({
      recordWrite: {
        writeId: "create-task",
        entity: "task",
        kind: "create",
        values: {
          title: "Plan week",
          done: false,
          dueDate: "2026-07-16",
          estimate: 0,
          priority: "normal",
        },
      },
    });

    expect(
      validateRecordWriteRequest(
        {
          writeId: "clear-task-fields",
          entity: "task",
          kind: "patch",
          recordId: existing.id,
          values: { dueDate: "", estimate: "", priority: "" },
        },
        schema,
        reader,
      ),
    ).toEqual({
      recordWrite: {
        writeId: "clear-task-fields",
        entity: "task",
        kind: "patch",
        recordId: existing.id,
        values: { dueDate: "", estimate: "", priority: "" },
        recordValues: { title: "Task", done: false },
      },
    });
  });

  it("rejects unknown entities, fields, system fields, and invalid scalar values", () => {
    const schema = taskSchemaWithOptionalFields();
    const reader = recordValidationReader();
    const create = (values: Record<string, unknown>, entity = "task") => ({
      writeId: "create-task",
      entity,
      kind: "create",
      values,
    });
    const cases: Array<[ReturnType<typeof create>, string]> = [
      [create({ title: "Task" }, "missing"), 'Unknown entity "missing".'],
      [create({ title: "   " }), 'Field "title" cannot be empty.'],
      [create({ title: "Task", done: "false" }), 'Field "done" must be a boolean.'],
      [
        create({ title: "Task", dueDate: "07/15/2026" }),
        'Field "dueDate" must be a YYYY-MM-DD date.',
      ],
      [
        create({ title: "Task", priority: "missing" }),
        'Field "priority" must be a known enum value.',
      ],
      [create({ title: "Task", estimate: "3" }), 'Field "estimate" must be a finite number.'],
      [create({ title: "Task", estimate: 1.5 }), 'Field "estimate" must be an integer.'],
      [
        create({ title: "Task", estimate: -1 }),
        'Field "estimate" must be greater than or equal to 0.',
      ],
      [create({ title: "Task", missing: true }), 'Unknown field "missing".'],
      [
        create({ title: "Task", updatedAt: timestamp }),
        'Record values must not include system field "updatedAt".',
      ],
    ];

    for (const [request, message] of cases) {
      expect(() => validateRecordWriteRequest(request, schema, reader)).toThrow(
        new BadRequestError(message),
      );
    }
  });

  it("enforces generic write policy and invalid patch or delete requests", () => {
    const active = taskRecord("task-1");
    const tombstoned = { ...taskRecord("task-2"), deletedAt: timestamp };
    const wrongEntity = storedRecord("project-1", "project", { name: "Project" });
    const reader = recordValidationReader({ storedRecords: [active, tombstoned, wrongEntity] });
    const deleteRequest = (overrides: Record<string, unknown> = {}) => ({
      writeId: "delete-task",
      entity: "task",
      kind: "delete",
      recordId: active.id,
      ...overrides,
    });

    expect(() => validateRecordWriteRequest(deleteRequest(), taskSourceSchema, reader)).toThrow(
      new BadRequestError('Delete record writes are disabled for entity "task".'),
    );

    const deleteSchema = taskSchemaWithDeleteOperation();
    expect(validateRecordWriteRequest(deleteRequest(), deleteSchema, reader)).toEqual({
      recordWrite: deleteRequest(),
    });

    const deleteCases: Array<[Record<string, unknown>, string]> = [
      [deleteRequest({ values: {} }), "Delete record write must not include values."],
      [deleteRequest({ recordId: "" }), "Delete record write must include a recordId."],
      [deleteRequest({ recordId: "missing" }), 'Unknown record "missing".'],
      [
        deleteRequest({ recordId: wrongEntity.id }),
        "Delete entity must match the stored record entity.",
      ],
      [deleteRequest({ recordId: tombstoned.id }), 'Cannot delete tombstoned record "task-2".'],
    ];

    for (const [request, message] of deleteCases) {
      expect(() => validateRecordWriteRequest(request, deleteSchema, reader)).toThrow(
        new BadRequestError(message),
      );
    }

    const patchRequest = (overrides: Record<string, unknown> = {}) => ({
      writeId: "patch-task",
      entity: "task",
      kind: "patch",
      recordId: active.id,
      values: { title: "Patched" },
      ...overrides,
    });
    const patchCases: Array<[Record<string, unknown>, string]> = [
      [patchRequest({ recordId: "" }), "Patch record write must include a recordId."],
      [patchRequest({ recordId: "missing" }), 'Unknown record "missing".'],
      [
        patchRequest({ recordId: wrongEntity.id }),
        "Patch entity must match the stored record entity.",
      ],
      [patchRequest({ recordId: tombstoned.id }), 'Cannot patch tombstoned record "task-2".'],
      [patchRequest({ values: { missing: true } }), 'Unknown field "missing".'],
    ];

    for (const [request, message] of patchCases) {
      expect(() => validateRecordWriteRequest(request, taskSourceSchema, reader)).toThrow(
        new BadRequestError(message),
      );
    }
  });

  it("normalizes and guards machine-owned state fields", () => {
    const schema = taskSchemaWithPriorityStateMachine();
    const active = taskRecord("task-1");
    const reader = recordValidationReader({ storedRecords: [active] });

    expect(
      validateRecordWriteRequest(
        {
          writeId: "create-task",
          entity: "task",
          kind: "create",
          values: { title: "Initial" },
        },
        schema,
        reader,
      ),
    ).toEqual({
      recordWrite: {
        writeId: "create-task",
        entity: "task",
        kind: "create",
        values: { title: "Initial", done: false, priority: "normal" },
      },
    });
    expect(() =>
      validateRecordWriteRequest(
        {
          writeId: "create-progressed-task",
          entity: "task",
          kind: "create",
          values: { title: "Progressed", priority: "high" },
        },
        schema,
        reader,
      ),
    ).toThrow(
      new BadRequestError(
        'Field "task.priority" is owned by state machine "priorityFlow" and new records must start at initial state "normal".',
      ),
    );
    expect(() =>
      validateRecordWriteRequest(
        {
          writeId: "patch-task",
          entity: "task",
          kind: "patch",
          recordId: active.id,
          values: { priority: "high" },
        },
        schema,
        reader,
      ),
    ).toThrow(
      new BadRequestError(
        'Field "task.priority" is owned by state machine "priorityFlow" and must change through transition operations.',
      ),
    );
  });

  it("validates local reference values and optional clearing", async () => {
    const resource = resourceRecord("resource-1");
    const card = cardRecord("card-1");
    const otherCard = cardRecord("card-2");
    const tombstonedResource = { ...resourceRecord("resource-2"), deletedAt: timestamp };
    const schema = rateSchemaWithOptionalBackupResource();
    const rate = rateRecord("rate-1", resource.id, card.id, {
      backupResource: resource.id,
    });
    const reader = recordValidationReader({
      storedRecords: [resource, card, otherCard, tombstonedResource, rate],
    });
    const createRate = (resourceId: unknown, cardId = otherCard.id) => ({
      writeId: "create-rate",
      entity: "rate",
      kind: "create",
      values: { resource: resourceId, card: cardId },
    });

    await expect(
      validateRecordWriteRequestAsync(createRate(resource.id), schema, reader),
    ).resolves.toEqual({
      recordWrite: {
        writeId: "create-rate",
        entity: "rate",
        kind: "create",
        values: {
          resource: resource.id,
          card: otherCard.id,
          cost: 0,
          costUnit: "day",
          price: 0,
          priceSet: true,
          currency: "usd",
        },
      },
    });
    expect(
      validateRecordWriteRequest(
        {
          writeId: "clear-backup",
          entity: "rate",
          kind: "patch",
          recordId: rate.id,
          values: { backupResource: "" },
        },
        schema,
        reader,
      ),
    ).toEqual({
      recordWrite: {
        writeId: "clear-backup",
        entity: "rate",
        kind: "patch",
        recordId: rate.id,
        values: { backupResource: "" },
        recordValues: {
          resource: resource.id,
          card: card.id,
          cost: 100,
          costUnit: "day",
          price: 150,
          priceSet: true,
          currency: "aud",
        },
      },
    });

    const cases: Array<[Record<string, unknown>, string]> = [
      [
        {
          writeId: "create-rate-without-resource",
          entity: "rate",
          kind: "create",
          values: { card: otherCard.id },
        },
        'Field "resource" is required.',
      ],
      [createRate("missing"), 'Field "resource" references unknown resource record "missing".'],
      [createRate(card.id), 'Field "resource" must reference a resource record.'],
      [
        createRate(tombstonedResource.id),
        'Field "resource" cannot reference tombstoned record "resource-2".',
      ],
      [createRate(""), 'Field "resource" cannot be empty.'],
      [createRate(1), 'Field "resource" must be a reference ID.'],
    ];

    for (const [request, message] of cases) {
      expect(() => validateRecordWriteRequest(request, schema, reader)).toThrow(
        new BadRequestError(message),
      );
    }
  });

  it("checks create and patch uniqueness against merged active records", () => {
    const resource = resourceRecord("resource-1");
    const firstCard = cardRecord("card-1");
    const secondCard = cardRecord("card-2");
    const firstRate = rateRecord("rate-1", resource.id, firstCard.id);
    const secondRate = rateRecord("rate-2", resource.id, secondCard.id);
    const reader = recordValidationReader({
      storedRecords: [resource, firstCard, secondCard, firstRate, secondRate],
    });

    expect(() =>
      validateRecordWriteRequest(
        {
          writeId: "create-duplicate-rate",
          entity: "rate",
          kind: "create",
          values: { resource: resource.id, card: firstCard.id },
        },
        rateSourceSchema,
        reader,
      ),
    ).toThrow(new BadRequestError('Unique constraint "rate.uniqueRatePair" would be violated.'));
    expect(() =>
      validateRecordWriteRequest(
        {
          writeId: "patch-duplicate-rate",
          entity: "rate",
          kind: "patch",
          recordId: secondRate.id,
          values: { card: firstCard.id },
        },
        rateSourceSchema,
        reader,
      ),
    ).toThrow(new BadRequestError('Unique constraint "rate.uniqueRatePair" would be violated.'));

    expect(
      validateRecordWriteRequest(
        {
          writeId: "reuse-tombstoned-rate",
          entity: "rate",
          kind: "create",
          values: { resource: resource.id, card: firstCard.id },
        },
        rateSourceSchema,
        reader,
        { additionalRecords: [{ ...firstRate, deletedAt: timestamp }] },
      ),
    ).toMatchObject({ recordWrite: { kind: "create" } });
  });

  it("prefers additional records over stored records for patches and tombstones", () => {
    const stored = taskRecord("task-1", { title: "Stored", done: false, priority: "low" });
    const additional = taskRecord("task-1", {
      title: "Additional",
      done: true,
      priority: "high",
    });
    const reader = recordValidationReader({ storedRecords: [stored] });
    const request = {
      writeId: "patch-task",
      entity: "task",
      kind: "patch",
      recordId: "task-1",
      values: { title: "Patched" },
    };

    const result = validateRecordWriteRequest(request, taskSourceSchema, reader, {
      additionalRecords: [additional],
    });

    expect(result).toMatchObject({
      recordWrite: {
        values: { title: "Patched" },
        recordValues: { title: "Patched", done: true, priority: "high" },
      },
    });
    expect(() =>
      validateRecordWriteRequest(request, taskSourceSchema, reader, {
        additionalRecords: [{ ...additional, deletedAt: timestamp }],
      }),
    ).toThrow(new BadRequestError('Cannot patch tombstoned record "task-1".'));
  });

  it("shares local-reference create validation between synchronous and asynchronous callers", async () => {
    const resource = resourceRecord("resource-1");
    const card = cardRecord("card-1");
    const reader = recordValidationReader({ storedRecords: [resource, card] });
    const request = {
      writeId: "create-rate",
      entity: "rate",
      kind: "create",
      values: {
        resource: resource.id,
        card: card.id,
        cost: 100,
        costUnit: "day",
        price: 150,
        priceSet: true,
        currency: "aud",
      },
    };

    const synchronous = validateRecordWriteRequest(request, rateSourceSchema, reader);
    const asynchronous = await validateRecordWriteRequestAsync(request, rateSourceSchema, reader);

    expect(asynchronous).toEqual(synchronous);
  });

  it("uses merged active records for inbound references", () => {
    const block = storedRecord("block-1", "block", { type: "page", label: "Page" });
    const placement = storedRecord("placement-1", "block-placement", {
      parent: "block-1",
      block: "block-1",
      order: 1000,
    });
    const reader = recordValidationReader({ storedRecords: [block, placement] });
    const request = {
      writeId: "delete-block",
      entity: "block",
      kind: "delete",
      recordId: block.id,
    };

    expect(() => validateRecordWriteRequest(request, siteSourceSchema, reader)).toThrow(
      new BadRequestError(
        'Cannot delete record "block-1" because active block-placement record "placement-1" references it through field "block-placement.parent".',
      ),
    );
    expect(
      validateRecordWriteRequest(request, siteSourceSchema, reader, {
        additionalRecords: [{ ...placement, deletedAt: timestamp }],
      }),
    ).toEqual({ recordWrite: request });
  });

  it("selects stored replay before write policy and value validation", () => {
    const replay: RecordWriteResponse = {
      changes: [],
      cursor: 7,
      record: taskRecord("task-replayed"),
      writeId: "replayed-write",
    };
    const reader = recordValidationReader({ replays: [replay] });
    const request = {
      writeId: replay.writeId,
      entity: "task",
      kind: "create",
      values: {},
    };

    expect(validateRecordWriteRequest(request, taskSourceSchema, reader)).toEqual({
      outcome: { kind: "replay", response: replay },
    });
    expect(() =>
      validateRecordWriteRequest(request, taskSourceSchema, reader, {
        allowStoredReplay: false,
      }),
    ).toThrow(new BadRequestError('Field "title" is required.'));
  });

  it("accepts Program-native public Site routes", () => {
    const reader = recordValidationReader();

    expect(
      validateRecordWriteRequest(
        {
          writeId: "create-route-program-site",
          entity: "route",
          kind: "create",
          values: {
            enabled: true,
            matchPath: "/pages",
            kind: "mount",
            targetProfile: "public-site",
            surface: "public-site",
            access: "anonymous",
          },
        },
        instanceControlPlaneSchema,
        reader,
        {
          additionalRecords: [],
        },
      ),
    ).toMatchObject({ recordWrite: { entity: "route", kind: "create" } });
  });

  it("maps every identity-reference resolver outcome for record writes", async () => {
    const schema = taskSchemaWithIdentityReference();
    const reader = recordValidationReader();
    const request = {
      writeId: "identity-reference",
      entity: "task",
      kind: "create",
      values: { title: "Owned task", ownerPrincipal: "principal-1" },
    };
    const lookups: Array<{
      id: string;
      target: string;
    }> = [];
    await expect(
      validateRecordWriteRequestAsync(request, schema, reader, {
        identityReferenceResolver: async (lookup) => {
          lookups.push(lookup);
          return { kind: "active" };
        },
      }),
    ).resolves.toMatchObject({
      recordWrite: { values: { title: "Owned task", ownerPrincipal: "principal-1" } },
    });
    expect(lookups).toEqual([{ id: "principal-1", target: "auth:principal" }]);

    const cases: Array<[IdentityReferenceTargetResolution, string]> = [
      [
        { kind: "missing" },
        'Field "ownerPrincipal" references unknown auth:principal record "principal-1".',
      ],
      [{ kind: "wrong-entity" }, 'Field "ownerPrincipal" must reference a auth:principal record.'],
      [
        { kind: "tombstoned" },
        'Field "ownerPrincipal" cannot reference tombstoned record "principal-1".',
      ],
      [
        { kind: "unsupported" },
        'Field "ownerPrincipal" references unsupported identity target "auth:principal".',
      ],
      [
        { kind: "unavailable" },
        'Identity reference validation is unavailable for field "ownerPrincipal".',
      ],
    ];

    for (const [resolution, message] of cases) {
      await expect(
        validateRecordWriteRequestAsync(request, schema, reader, {
          identityReferenceResolver: async () => resolution,
        }),
      ).rejects.toThrow(new BadRequestError(message));
    }
  });
});

function withTaskFields(fields: EntitySchema["fields"]): AppSchema {
  return {
    ...taskSourceSchema,
    entities: taskSourceSchema.entities.map((entity) =>
      entity.key === "task" ? { ...entity, fields } : entity,
    ),
  };
}
function withCardMarginMin(min: number): AppSchema {
  const card = rateSourceSchema.entities.find((definition) => definition.key === "card")!;
  const marginMin = card.fields.find((definition) => definition.key === "marginMin")!;
  if (marginMin.type !== "number") {
    throw new Error("Expected card.marginMin to be a number field.");
  }
  return {
    ...rateSourceSchema,
    entities: rateSourceSchema.entities.map((entity) =>
      entity.key === "card"
        ? {
            ...card,
            fields: card.fields.map((field) =>
              field.key === "marginMin" ? { ...marginMin, min } : field,
            ),
          }
        : entity,
    ),
  };
}
function withRateResourceField(
  overrides: Partial<{
    required: boolean;
    to: string;
  }>,
): AppSchema {
  const rate = rateSourceSchema.entities.find((definition) => definition.key === "rate")!;
  const resource = rate.fields.find((definition) => definition.key === "resource")!;
  if (resource.type !== "reference") {
    throw new Error("Expected rate.resource to be a reference field.");
  }
  return {
    ...rateSourceSchema,
    entities: rateSourceSchema.entities.map((entity) =>
      entity.key === "rate"
        ? {
            ...rate,
            fields: rate.fields.map((field) =>
              field.key === "resource" ? { ...resource, ...overrides } : field,
            ),
          }
        : entity,
    ),
  };
}
function taskSchemaWithOptionalFields(): AppSchema {
  const priority = taskSourceSchema.entities
    .find((definition) => definition.key === "task")!
    .fields.find((definition) => definition.key === "priority")!;
  if (priority.type !== "enum") {
    throw new Error("Expected task.priority to be an enum field.");
  }
  return withTaskFields([
    ...taskSourceSchema.entities
      .find((definition) => definition.key === "task")!
      .fields.map((field) => (field.key === "priority" ? { ...priority, required: false } : field)),
    {
      type: "number",
      required: false,
      label: "Estimate",
      min: 0,
      integer: true,
      key: "estimate",
    },
  ]);
}
function taskSchemaWithDeleteOperation(): AppSchema {
  return {
    ...taskSourceSchema,
    entities: taskSourceSchema.entities.map((entity) =>
      entity.key === "task"
        ? {
            ...entity,
            operations: [
              ...(taskSourceSchema.entities.find((definition) => definition.key === "task")!
                .operations ?? []),
              {
                key: "delete",
                label: "Delete task",
                kind: "delete",
                scope: "record",
                effect: { type: "deleteRecord" },
                output: { type: "delete" },
                idempotency: { required: true },
                audit: { input: "summary" },
              },
            ],
          }
        : entity,
    ),
  };
}
function taskSchemaWithPriorityStateMachine(): AppSchema {
  return {
    ...taskSourceSchema,
    entities: taskSourceSchema.entities.map((entity) =>
      entity.key === "task"
        ? {
            ...entity,
            stateMachines: [
              {
                key: "priorityFlow",
                field: "priority",
                initial: "normal",
                terminal: ["high"],
                transitions: [{ key: "raise", label: "Raise", from: ["normal"], to: "high" }],
              },
            ],
          }
        : entity,
    ),
  };
}
function rateSchemaWithOptionalBackupResource(): AppSchema {
  const rate = rateSourceSchema.entities.find((definition) => definition.key === "rate")!;
  return {
    ...rateSourceSchema,
    entities: rateSourceSchema.entities.map((entity) =>
      entity.key === "rate"
        ? {
            ...rate,
            fields: [
              ...rate.fields,
              {
                key: "backupResource",
                type: "reference",
                required: false,
                label: "Backup resource",
                to: "resource",
                displayField: "name",
              },
            ],
          }
        : entity,
    ),
  };
}
function taskSchemaWithIdentityReference(): AppSchema {
  return withTaskFields([
    ...taskSourceSchema.entities.find((definition) => definition.key === "task")!.fields,
    {
      type: "reference",
      required: false,
      label: "Owner principal",
      to: "auth:principal",
      key: "ownerPrincipal",
    },
  ]);
}
function taskSnapshot(overrides: Partial<StorageSnapshot> = {}): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: "tasks",
    schemaKey: "tasks",
    exportedAt: timestamp,
    schemaUpdatedAt: timestamp,
    sourceCursor: 1,
    schema: taskSourceSchema,
    records: [taskRecord("task-1")],
    ...overrides,
  };
}

function rateSnapshot(overrides: Partial<StorageSnapshot> = {}): StorageSnapshot {
  return {
    ...taskSnapshot(),
    storageIdentity: "rates",
    schemaKey: "rates",
    schema: rateSourceSchema,
    records: [],
    ...overrides,
  };
}

function taskRecord(id: string, overrides: Record<string, unknown> = {}): StoredRecord {
  return storedRecord(id, "task", {
    title: "Task",
    done: false,
    priority: "normal",
    ...overrides,
  } as RecordValues);
}

function resourceRecord(id: string): StoredRecord {
  return storedRecord(id, "resource", {
    name: "Designer",
    kind: "role",
    unit: "day",
  });
}

function cardRecord(id: string, overrides: Partial<RecordValues> = {}): StoredRecord {
  return storedRecord(id, "card", {
    name: "Standard",
    isDefault: true,
    marginMin: 0.4,
    marginMed: 0.5,
    marginMax: 0.6,
    ...overrides,
  });
}

function rateRecord(
  id: string,
  resource: string,
  card: string,
  overrides: Partial<RecordValues> = {},
): StoredRecord {
  return storedRecord(id, "rate", {
    resource,
    card,
    cost: 100,
    costUnit: "day",
    price: 150,
    priceSet: true,
    currency: "aud",
    ...overrides,
  });
}

function storedRecord(id: string, entity: string, values: RecordValues): StoredRecord {
  return { id, entity, values, createdAt: timestamp, updatedAt: timestamp };
}

function recordValidationReader(
  input: {
    replays?: RecordWriteResponse[];
    storedRecords?: StoredRecord[];
  } = {},
): AuthorityRecordValidationReader {
  const storedRecords = new Map(input.storedRecords?.map((record) => [record.id, record]));
  const replays = new Map(input.replays?.map((replay) => [replay.writeId, replay]));

  return {
    readActiveRecords: () =>
      [...storedRecords.values()].filter((record) => record.deletedAt === undefined),
    readStoredRecord: (recordId) => storedRecords.get(recordId),
    readStoredReplay: (writeId) => replays.get(writeId),
  };
}
