import { describe, expect, it } from "vite-plus/test";

import {
  projectOperationCommandInputValues,
  projectOperationInputValues,
  projectOperationRecordPlanInputValues,
  projectOperationRecordWritePatchValues,
  projectOperationRecordWriteValues,
  TEXT_EMAIL_FORMAT_INVALID_MESSAGE,
  TEXT_PHONE_FORMAT_INVALID_MESSAGE,
  type EntityOperationSchema,
  type EntitySchema,
} from "./index.ts";

describe("schema operation input projection", () => {
  it("parses operation input objects and rejects undeclared, system, and missing required fields", () => {
    const operation = createTaskOperation({
      fields: [{ key: "taskTitle", field: "title", required: true }],
    });
    expect(() =>
      projectOperationInputValues({
        canonicalOperationKey: "task.create",
        entity: taskEntity,
        operation,
        rawInput: undefined,
      }),
    ).toThrow("Operation input must be an object.");

    expect(() =>
      projectOperationInputValues({
        canonicalOperationKey: "task.create",
        entity: taskEntity,
        operation,
        rawInput: {
          taskTitle: "Declared title",
          admin: true,
        },
      }),
    ).toThrow('Operation input includes undeclared field "admin".');

    expect(() =>
      projectOperationInputValues({
        canonicalOperationKey: "task.create",
        entity: taskEntity,
        operation,
        rawInput: {
          taskTitle: "Declared title",
          updatedAt: "2026-06-25T00:00:00.000Z",
        },
      }),
    ).toThrow('Operation input must not include system field "updatedAt".');

    expect(() =>
      projectOperationInputValues({
        canonicalOperationKey: "task.create",
        entity: taskEntity,
        operation,
        rawInput: {},
      }),
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
      projectOperationRecordPlanInputValues({
        canonicalOperationKey: "task.plan",
        entity: taskEntity,
        operation,
        rawInput: {
          note: "Needs review",
          approved: false,
          dueDate: "2026-06-25",
          score: 3,
          priority: "normal",
        },
      }),
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
        projectOperationRecordPlanInputValues({
          canonicalOperationKey: "task.plan",
          entity: taskEntity,
          operation,
          rawInput: testCase.rawInput,
        }),
      ).toThrow(testCase.error);
    }
  });
  it("requires affirmative inline booleans without changing required boolean semantics", () => {
    const ordinaryRequiredBoolean = recordPlanTaskOperation({
      fields: [{ key: "approved", type: "boolean", required: true }],
    });
    const affirmativeBoolean = recordPlanTaskOperation({
      fields: [{ key: "consent", type: "boolean", required: true, mustBeTrue: true }],
    });
    expect(
      projectOperationInputValues({
        canonicalOperationKey: "task.plan",
        entity: taskEntity,
        operation: ordinaryRequiredBoolean,
        rawInput: { approved: false },
      }),
    ).toEqual({
      operationInputValues: { approved: false },
      recordWriteValues: {},
      recordWritePatchValues: {},
    });
    expect(() =>
      projectOperationInputValues({
        canonicalOperationKey: "task.plan",
        entity: taskEntity,
        operation: affirmativeBoolean,
        rawInput: { consent: false },
      }),
    ).toThrow('Operation input field "consent" must be accepted.');
    expect(
      projectOperationInputValues({
        canonicalOperationKey: "task.plan",
        entity: taskEntity,
        operation: affirmativeBoolean,
        rawInput: { consent: true },
      }),
    ).toEqual({
      operationInputValues: { consent: true },
      recordWriteValues: {},
      recordWritePatchValues: {},
    });
  });
  it("validates inline text formats and keeps suggested text unrestricted", () => {
    const operation = recordPlanTaskOperation({
      fields: [
        { key: "email", type: "text", required: true, format: "email", label: "Email" },
        { key: "phone", type: "text", required: false, format: "phone", label: "Phone" },
        {
          key: "inquiryType",
          type: "text",
          required: false,
          suggestions: ["Support", "Sales"],
          label: "Inquiry type",
        },
      ],
    });
    expect(
      projectOperationRecordPlanInputValues({
        canonicalOperationKey: "task.plan",
        entity: taskEntity,
        operation,
        rawInput: {
          email: "  name@example.com  ",
          phone: " +1 (555) 123-4567 ",
          inquiryType: "Custom",
        },
      }),
    ).toEqual({
      email: "name@example.com",
      phone: "+1 (555) 123-4567",
      inquiryType: "Custom",
    });

    expect(
      projectOperationRecordPlanInputValues({
        canonicalOperationKey: "task.plan",
        entity: taskEntity,
        operation,
        rawInput: {
          email: "name@example.com",
          phone: "",
          inquiryType: "Another custom value",
        },
      }),
    ).toEqual({
      email: "name@example.com",
      inquiryType: "Another custom value",
    });

    expect(() =>
      projectOperationRecordPlanInputValues({
        canonicalOperationKey: "task.plan",
        entity: taskEntity,
        operation,
        rawInput: {
          email: "not an email",
          phone: "+1 (555) 123-4567",
        },
      }),
    ).toThrow(TEXT_EMAIL_FORMAT_INVALID_MESSAGE);

    expect(() =>
      projectOperationRecordPlanInputValues({
        canonicalOperationKey: "task.plan",
        entity: taskEntity,
        operation,
        rawInput: {
          email: "name@example.com",
          phone: "555-abc",
        },
      }),
    ).toThrow(TEXT_PHONE_FORMAT_INVALID_MESSAGE);
  });

  it("preserves no-input-contract behavior for record projections and command handlers", () => {
    const operation = noInputCommandTaskOperation();

    expect(
      projectOperationInputValues({
        canonicalOperationKey: "task.noInput",
        entity: taskEntity,
        operation,
        rawInput: undefined,
      }),
    ).toEqual({
      operationInputValues: {},
      recordWriteValues: {},
      recordWritePatchValues: {},
    });

    expect(
      projectOperationInputValues({
        canonicalOperationKey: "task.noInput",
        entity: taskEntity,
        operation,
        rawInput: {},
      }),
    ).toEqual({
      operationInputValues: {},
      recordWriteValues: {},
      recordWritePatchValues: {},
    });

    expect(() =>
      projectOperationRecordPlanInputValues({
        canonicalOperationKey: "task.noInput",
        entity: taskEntity,
        operation,
        rawInput: { title: "Unexpected" },
      }),
    ).toThrow('Operation "task.noInput" does not declare input fields.');

    const rawInput = { title: "Command handler owns this shape" };
    expect(
      projectOperationCommandInputValues({
        canonicalOperationKey: "task.noInput",
        entity: taskEntity,
        operation,
        rawInput,
      }),
    ).toBe(rawInput);
  });
  it("keeps command and record-plan values keyed by operation input name", () => {
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
      projectOperationRecordPlanInputValues({
        canonicalOperationKey: "task.plan",
        entity: taskEntity,
        operation,
        rawInput,
      }),
    ).toEqual(rawInput);
    expect(
      projectOperationCommandInputValues({
        canonicalOperationKey: "task.plan",
        entity: taskEntity,
        operation,
        rawInput,
      }),
    ).toEqual(rawInput);
  });
  it("maps entity-backed record-write projections to stored entity field names", () => {
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
      projectOperationRecordWriteValues({
        canonicalOperationKey: "task.create",
        entity: taskEntity,
        operation: createOperation,
        rawInput: {
          taskTitle: "Created task",
          taskDone: false,
        },
      }),
    ).toEqual({
      title: "Created task",
      done: false,
    });
    expect(
      projectOperationRecordWritePatchValues({
        canonicalOperationKey: "task.update",
        entity: taskEntity,
        operation: updateOperation,
        rawInput: {
          taskTitle: "",
          taskDone: true,
        },
      }),
    ).toEqual({
      title: "",
      done: true,
    });

    expect(() =>
      projectOperationRecordWriteValues({
        canonicalOperationKey: "task.create",
        entity: taskEntity,
        operation: createOperation,
        rawInput: {
          taskTitle: "Created task",
          taskDone: "false",
        },
      }),
    ).toThrow('Field "done" must be a boolean.');
  });
  it("requires affirmative entity-backed booleans without changing required boolean semantics", () => {
    const ordinaryRequiredBoolean = createTaskOperation({
      fields: [{ key: "taskDone", field: "done", required: true }],
    });
    const affirmativeBoolean = createTaskOperation({
      fields: [{ key: "consent", field: "done", required: true, mustBeTrue: true }],
    });
    expect(
      projectOperationInputValues({
        canonicalOperationKey: "task.create",
        entity: taskEntity,
        operation: ordinaryRequiredBoolean,
        rawInput: { taskDone: false },
      }),
    ).toMatchObject({
      operationInputValues: { taskDone: false },
      recordWriteValues: { done: false },
    });
    expect(() =>
      projectOperationInputValues({
        canonicalOperationKey: "task.create",
        entity: taskEntity,
        operation: affirmativeBoolean,
        rawInput: { consent: false },
      }),
    ).toThrow('Operation input field "consent" must be accepted.');
    expect(
      projectOperationInputValues({
        canonicalOperationKey: "task.create",
        entity: taskEntity,
        operation: affirmativeBoolean,
        rawInput: { consent: true },
      }),
    ).toMatchObject({
      operationInputValues: { consent: true },
      recordWriteValues: { done: true },
    });
  });
});
const taskEntity = {
  id: "entity_466e2402-9386-43a1-b13f-2aecd3995418",
  label: "Task",
  fields: [
    { key: "title", type: "text", required: true },
    { key: "done", type: "boolean", required: false },
    {
      key: "priority",
      type: "enum",
      required: false,
      values: [
        { key: "low", label: "Low" },
        { key: "normal", label: "Normal" },
      ],
    },
  ],
} satisfies EntitySchema;
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
