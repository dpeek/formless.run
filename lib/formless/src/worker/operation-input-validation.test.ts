import { setKeyedDefinition } from "../test/schema-definition-test-helpers.ts";
import {
  formatEntityOperationKey,
  type AppSchema,
  type EntityOperationSchema,
  type EntitySchema,
} from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import { describe, expect, it } from "vite-plus/test";
import { programStorageIdentity } from "../shared/program-storage-identity.ts";
import type { OperationInvocationEnvelope } from "../shared/operation-invocation.ts";
import { sourceLikeTaskSchema } from "../test/schema-builders.ts";
import { BadRequestError } from "./errors.ts";
import {
  validateOperationInvocationCommandHandlerInputValues,
  validateOperationInvocationRecordPlanInputValues,
  validateOperationInvocationRecordWriteValues,
  validatePublicOperationInputValues,
  type OperationEnvelopeInputValidationRequest,
  type PublicOperationInputValidationRequest,
} from "./operation-input-validation.ts";

const storage = {} as DurableObjectStorage;

describe("operation input validation", () => {
  it("rejects unknown and system fields outside the declared operation input contract", () => {
    expect(() =>
      validateOperationInvocationRecordWriteValues(
        operationInputRequest({
          operation: createTaskOperation({
            fields: [{ key: "title", field: "title", required: true }],
          }),
          rawInput: {
            title: "Declared title",
            admin: true,
          },
        }),
      ),
    ).toThrow('Operation input includes undeclared field "admin".');

    expect(() =>
      validateOperationInvocationRecordWriteValues(
        operationInputRequest({
          operation: createTaskOperation({
            fields: [{ key: "title", field: "title", required: true }],
          }),
          rawInput: {
            title: "Declared title",
            updatedAt: "2026-06-25T00:00:00.000Z",
          },
        }),
      ),
    ).toThrow('Operation input must not include system field "updatedAt".');
  });

  it("requires declared operation input fields before materialization", () => {
    expect(() =>
      validateOperationInvocationRecordPlanInputValues(
        operationInputRequest({
          operation: recordPlanTaskOperation({
            fields: [{ key: "title", type: "text", required: true, label: "Title" }],
          }),
          rawInput: {},
        }),
      ),
    ).toThrow('Operation input field "title" is required.');

    expect(() =>
      validateOperationInvocationRecordWriteValues(
        operationInputRequest({
          operation: createTaskOperation({
            fields: [{ key: "taskTitle", field: "title", required: true }],
          }),
          rawInput: {},
        }),
      ),
    ).toThrow('Operation input field "taskTitle" is required.');
  });
  it("validates inline scalar operation input fields", () => {
    const operation = recordPlanTaskOperation({
      fields: [
        { key: "note", type: "text", required: true, label: "Note" },
        { key: "approved", type: "boolean", required: true, label: "Approved" },
        { key: "dueDate", type: "date", required: true, label: "Due date" },
        { key: "score", type: "number", required: true, label: "Score" },
        {
          key: "priority",
          type: "enum",
          required: true,
          label: "Priority",
          values: [
            { key: "low", label: "Low" },
            { key: "normal", label: "Normal" },
          ],
        },
      ],
    });
    expect(
      validateOperationInvocationRecordPlanInputValues(
        operationInputRequest({
          operation,
          rawInput: {
            note: "Needs review",
            approved: false,
            dueDate: "2026-06-25",
            score: 3,
            priority: "normal",
          },
        }),
      ),
    ).toEqual({
      note: "Needs review",
      approved: false,
      dueDate: "2026-06-25",
      score: 3,
      priority: "normal",
    });

    const invalidCases = [
      {
        rawInput: {
          note: "",
          approved: false,
          dueDate: "2026-06-25",
          score: 3,
          priority: "normal",
        },
        error: 'Operation input field "note" cannot be empty.',
      },
      {
        rawInput: {
          note: "Needs review",
          approved: "false",
          dueDate: "2026-06-25",
          score: 3,
          priority: "normal",
        },
        error: 'Operation input field "approved" must be a boolean.',
      },
      {
        rawInput: {
          note: "Needs review",
          approved: false,
          dueDate: "06/25/2026",
          score: 3,
          priority: "normal",
        },
        error: 'Operation input field "dueDate" must be a YYYY-MM-DD date.',
      },
      {
        rawInput: {
          note: "Needs review",
          approved: false,
          dueDate: "2026-06-25",
          score: "3",
          priority: "normal",
        },
        error: 'Operation input field "score" must be a finite number.',
      },
      {
        rawInput: {
          note: "Needs review",
          approved: false,
          dueDate: "2026-06-25",
          score: 3,
          priority: "urgent",
        },
        error: 'Operation input field "priority" must be a known enum value.',
      },
    ];

    for (const testCase of invalidCases) {
      expect(() =>
        validateOperationInvocationRecordPlanInputValues(
          operationInputRequest({
            operation,
            rawInput: testCase.rawInput,
          }),
        ),
      ).toThrow(testCase.error);
    }
  });
  it("validates entity-backed operation input fields through the entity field contract", () => {
    const operation = createTaskOperation({
      fields: [
        { key: "taskTitle", field: "title", required: true },
        { key: "taskDone", field: "done", required: true },
        { key: "taskPriority", field: "priority", required: true },
      ],
    });
    expect(
      validateOperationInvocationRecordWriteValues(
        operationInputRequest({
          operation,
          rawInput: {
            taskTitle: "Entity-backed title",
            taskDone: false,
            taskPriority: "normal",
          },
        }),
      ),
    ).toEqual({
      title: "Entity-backed title",
      done: false,
      priority: "normal",
    });

    expect(() =>
      validateOperationInvocationRecordWriteValues(
        operationInputRequest({
          operation,
          rawInput: {
            taskTitle: "Entity-backed title",
            taskDone: "false",
            taskPriority: "normal",
          },
        }),
      ),
    ).toThrow('Field "done" must be a boolean.');

    expect(() =>
      validateOperationInvocationRecordWriteValues(
        operationInputRequest({
          operation,
          rawInput: {
            taskTitle: "Entity-backed title",
            taskDone: false,
            taskPriority: "urgent",
          },
        }),
      ),
    ).toThrow('Field "priority" must be a known enum value.');
  });
  it("keeps storage-backed reference checks in the Worker adapter", () => {
    const operation = createTaskOperation({
      fields: [
        { key: "taskTitle", field: "title", required: true },
        { key: "taskProject", field: "project", required: true },
      ],
    });
    const schema = schemaWithTaskProjectReference();
    expect(
      validateOperationInvocationRecordWriteValues(
        operationInputRequest({
          operation,
          rawInput: {
            taskTitle: "Referenced task",
            taskProject: "project-1",
          },
          schema,
          storage: storageWithRecords([projectRecord("project-1")]),
        }),
      ),
    ).toEqual({
      title: "Referenced task",
      project: "project-1",
    });

    expect(() =>
      validateOperationInvocationRecordWriteValues(
        operationInputRequest({
          operation,
          rawInput: {
            taskTitle: "Missing project task",
            taskProject: "missing-project",
          },
          schema,
          storage: storageWithRecords([]),
        }),
      ),
    ).toThrow('Field "project" references unknown project record "missing-project".');

    expect(() =>
      validateOperationInvocationRecordWriteValues(
        operationInputRequest({
          operation,
          rawInput: {
            taskTitle: "Wrong entity task",
            taskProject: "task-1",
          },
          schema,
          storage: storageWithRecords([taskRecord("task-1")]),
        }),
      ),
    ).toThrow('Field "project" must reference a project record.');

    expect(() =>
      validateOperationInvocationRecordWriteValues(
        operationInputRequest({
          operation,
          rawInput: {
            taskTitle: "Tombstoned project task",
            taskProject: "project-2",
          },
          schema,
          storage: storageWithRecords([projectRecord("project-2", { deleted: true })]),
        }),
      ),
    ).toThrow('Field "project" cannot reference tombstoned record "project-2".');
  });

  it("wraps schema projection errors in runtime BadRequestError", () => {
    let thrown: unknown;

    try {
      validateOperationInvocationRecordWriteValues(
        operationInputRequest({
          operation: createTaskOperation({
            fields: [{ key: "invalidMapping", field: "missingEntityField", required: true }],
          }),
          rawInput: {
            invalidMapping: "value",
          },
        }),
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BadRequestError);
    expect(thrown).toMatchObject({
      message: 'Operation input field "invalidMapping" is invalid.',
    });
  });

  it("rejects record write and record-plan input values when no input contract exists", () => {
    const operation = noInputCommandTaskOperation();

    expect(() =>
      validateOperationInvocationRecordWriteValues(
        operationInputRequest({
          operation,
          operationName: "noInputWrite",
          rawInput: { title: "Unexpected" },
        }),
      ),
    ).toThrow('Operation "task.noInputWrite" does not declare input fields.');

    expect(() =>
      validateOperationInvocationRecordPlanInputValues(
        operationInputRequest({
          operation,
          operationName: "noInputPlan",
          rawInput: { title: "Unexpected" },
        }),
      ),
    ).toThrow('Operation "task.noInputPlan" does not declare input fields.');
  });
  it("keeps record-plan and handler values keyed by operation input name", () => {
    const operation = recordPlanTaskOperation({
      fields: [
        { key: "taskTitle", field: "title", required: true },
        { key: "taskDone", field: "done", required: true },
      ],
    });
    const rawInput = {
      taskTitle: "Planned task",
      taskDone: false,
    };

    expect(
      validateOperationInvocationRecordPlanInputValues(
        operationInputRequest({
          operation,
          rawInput,
        }),
      ),
    ).toEqual(rawInput);
    expect(
      validateOperationInvocationCommandHandlerInputValues(
        operationInputRequest({
          operation,
          rawInput,
        }),
      ),
    ).toEqual(rawInput);
  });
  it("validates public operation input values through the public route entrypoint", () => {
    const input = {
      fields: [
        { key: "taskTitle", field: "title", required: true },
        { key: "taskDone", field: "done", required: true },
      ],
    } satisfies NonNullable<EntityOperationSchema["input"]>;
    const rawInput = {
      taskTitle: "Public operation task",
      taskDone: false,
    };

    expect(
      validatePublicOperationInputValues(
        publicOperationInputRequest({
          operation: createTaskOperation(input),
          rawInput,
        }),
      ),
    ).toEqual(rawInput);
    expect(
      validatePublicOperationInputValues(
        publicOperationInputRequest({
          operation: recordPlanTaskOperation(input),
          rawInput,
        }),
      ),
    ).toEqual(rawInput);
    expect(
      validatePublicOperationInputValues(
        publicOperationInputRequest({
          operation: operationHandlerTaskOperation(input),
          rawInput,
        }),
      ),
    ).toEqual(rawInput);
    expect(() =>
      validatePublicOperationInputValues({
        ...publicOperationInputRequest({
          operation: createTaskOperation(input),
          rawInput: {
            ...rawInput,
            admin: true,
          },
        }),
        context: "Public operation input",
      }),
    ).toThrow('Public operation input includes undeclared field "admin".');
    expect(() =>
      validatePublicOperationInputValues({
        ...publicOperationInputRequest({
          operation: createTaskOperation(input),
          rawInput: {
            taskTitle: "",
            taskDone: false,
          },
        }),
        context: "Public operation input",
      }),
    ).toThrow('Field "title" cannot be empty.');
  });
  it("rejects false affirmative public operation input before materialization", () => {
    const operation = createTaskOperation({
      fields: [
        { key: "ordinaryBoolean", field: "done", required: true },
        { key: "consent", field: "done", required: true, mustBeTrue: true },
      ],
    });
    expect(() =>
      validatePublicOperationInputValues(
        publicOperationInputRequest({
          operation,
          rawInput: {
            ordinaryBoolean: false,
            consent: false,
          },
        }),
      ),
    ).toThrow('Operation input field "consent" must be accepted.');
    expect(
      validatePublicOperationInputValues(
        publicOperationInputRequest({
          operation,
          rawInput: {
            ordinaryBoolean: false,
            consent: true,
          },
        }),
      ),
    ).toEqual({
      ordinaryBoolean: false,
      consent: true,
    });
  });
  it("maps entity-backed create and update input to stored entity field names", () => {
    const createOperation = createTaskOperation({
      fields: [
        { key: "taskTitle", field: "title", required: true },
        { key: "taskDone", field: "done", required: true },
      ],
    });
    const updateOperation = updateTaskOperation({
      fields: [
        { key: "taskTitle", field: "title" },
        { key: "taskDone", field: "done" },
      ],
    });
    expect(
      validateOperationInvocationRecordWriteValues(
        operationInputRequest({
          operation: createOperation,
          rawInput: {
            taskTitle: "Created task",
            taskDone: false,
          },
        }),
      ),
    ).toEqual({
      title: "Created task",
      done: false,
    });
    expect(
      validateOperationInvocationRecordWriteValues(
        operationInputRequest({
          operation: updateOperation,
          operationName: "update",
          rawInput: {
            taskTitle: "",
            taskDone: true,
          },
        }),
      ),
    ).toEqual({
      title: "",
      done: true,
    });
  });
});

function operationInputRequest(input: {
  operation: EntityOperationSchema;
  operationName?: string;
  rawInput: unknown;
  schema?: AppSchema;
  storage?: DurableObjectStorage;
}): OperationEnvelopeInputValidationRequest {
  const entityName = "task";
  const operationName = input.operationName ?? "submit";

  return {
    envelope: operationInputEnvelope({
      entityName,
      operation: input.operation,
      operationName,
    }),
    rawInput: input.rawInput,
    schema: input.schema ?? sourceLikeTaskSchema(),
    storage: input.storage ?? storage,
  };
}

function publicOperationInputRequest(input: {
  operation: EntityOperationSchema;
  operationName?: string;
  rawInput: unknown;
  schema?: AppSchema;
  storage?: DurableObjectStorage;
}): PublicOperationInputValidationRequest {
  return {
    entityName: "task",
    operationName: input.operationName ?? "submit",
    operation: input.operation,
    rawInput: input.rawInput,
    schema: input.schema ?? sourceLikeTaskSchema(),
    storage: input.storage ?? storage,
  };
}

function operationInputEnvelope(input: {
  entityName: string;
  operation: EntityOperationSchema;
  operationName: string;
}): OperationInvocationEnvelope {
  const canonicalKey = operationCanonicalKey(input);

  return {
    invocationId: `operation:${canonicalKey}:test`,
    programStorageIdentity: programStorageIdentity(),
    actor: { kind: "owner" },
    source: { protocol: "protocol" },
    input: operationInvocationInput(input.operation),
    idempotency: { required: false },
    operation: {
      entityName: input.entityName,
      operationName: input.operationName,
      canonicalKey,
      kind: input.operation.kind,
      scope: input.operation.scope,
      ...(input.operation.effect === undefined ? {} : { effect: input.operation.effect }),
      output: input.operation.output,
      ...(input.operation.policy === undefined ? {} : { policy: input.operation.policy }),
    },
    receivedAt: "2026-06-25T00:00:00.000Z",
    schemaOperation: input.operation,
  };
}

function operationInvocationInput(
  operation: EntityOperationSchema,
): OperationInvocationEnvelope["input"] {
  if (operation.kind === "list") {
    return { type: "list" };
  }

  if (operation.kind === "get") {
    return { type: "get", recordId: "record-1" };
  }

  if (operation.kind === "create") {
    return { type: "create", values: {} };
  }

  if (operation.kind === "update") {
    return { type: "update", recordId: "record-1", values: {} };
  }

  if (operation.kind === "delete") {
    return { type: "delete", recordId: "record-1" };
  }

  return { type: "command", input: {} };
}

function operationCanonicalKey(input: { entityName: string; operationName: string }) {
  return formatEntityOperationKey({
    entityKey: input.entityName,
    operationKey: input.operationName,
  });
}
function schemaWithTaskProjectReference(): AppSchema {
  const schema = sourceLikeTaskSchema();
  const taskEntity = schema.entities.find((definition) => definition.key === "task")!;
  if (!taskEntity) {
    throw new Error("Expected task entity.");
  }
  setKeyedDefinition(schema.entities, "task", {
    ...taskEntity,
    fields: [
      ...taskEntity.fields,
      {
        key: "project",
        type: "reference",
        required: false,
        label: "Project",
        to: "project",
        displayField: "name",
      },
    ],
  });
  setKeyedDefinition(schema.entities, "project", {
    id: "entity_85cd9c13-ba76-45e1-a034-72e4b8eed73a",
    label: "Project",
    fields: [{ key: "name", type: "text", required: true, label: "Name" }],
  } satisfies EntitySchema);
  return schema;
}
function storageWithRecords(records: StoredRecord[]): DurableObjectStorage {
  return {
    sql: {
      exec<T = unknown>(_query: string, recordId: unknown) {
        const record = records.find((candidate) => candidate.id === recordId);

        return {
          next(): IteratorResult<T> {
            if (!record) {
              return { done: true, value: undefined as T };
            }

            return {
              done: false,
              value: {
                id: record.id,
                entity: record.entity,
                values_json: JSON.stringify(record.values),
                created_at: record.createdAt,
                updated_at: record.updatedAt,
                deleted_at: record.deletedAt ?? null,
              } as T,
            };
          },
        };
      },
    },
  } as unknown as DurableObjectStorage;
}
function projectRecord(
  id: string,
  options: {
    deleted?: boolean;
  } = {},
): StoredRecord {
  return {
    id,
    entity: "project",
    values: { name: "Reference project" },
    createdAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
    deletedAt: options.deleted ? "2026-06-25T00:01:00.000Z" : undefined,
  };
}

function taskRecord(id: string): StoredRecord {
  return {
    id,
    entity: "task",
    values: { title: "Wrong target", done: false },
    createdAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
  };
}

function createTaskOperation(input: NonNullable<EntityOperationSchema["input"]>) {
  return {
    kind: "create",
    scope: "collection",
    input,
    effect: { type: "createRecord" },
    output: { type: "create" },
    idempotency: { required: true },
    audit: { input: "summary" },
  } satisfies EntityOperationSchema;
}

function updateTaskOperation(input: NonNullable<EntityOperationSchema["input"]>) {
  return {
    kind: "update",
    scope: "record",
    input,
    effect: { type: "patchRecord" },
    output: { type: "update" },
    idempotency: { required: true },
    audit: { input: "summary" },
  } satisfies EntityOperationSchema;
}

function recordPlanTaskOperation(input: NonNullable<EntityOperationSchema["input"]>) {
  return {
    kind: "command",
    scope: "collection",
    input,
    effect: { type: "recordPlan", steps: [] },
    output: { type: "command" },
    idempotency: { required: true },
    audit: { input: "summary" },
  } satisfies EntityOperationSchema;
}

function operationHandlerTaskOperation(input: NonNullable<EntityOperationSchema["input"]>) {
  return {
    kind: "command",
    scope: "collection",
    input,
    effect: { type: "operationHandler", handler: "subscribe", config: {} },
    output: { type: "command" },
    idempotency: { required: true },
    audit: { input: "summary" },
  } satisfies EntityOperationSchema;
}

function noInputCommandTaskOperation() {
  return {
    kind: "command",
    scope: "collection",
    effect: { type: "recordPlan", steps: [] },
    output: { type: "command" },
    idempotency: { required: true },
    audit: { input: "summary" },
  } satisfies EntityOperationSchema;
}
