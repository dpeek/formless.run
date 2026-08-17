import { describe, expect, it } from "vite-plus/test";

import {
  getOperationHandlerCapabilities,
  parseAppSchema,
  requiredOperationHandlerObjectInput,
  requiredOperationHandlerStringRecordIdInput,
  stringifySchema,
} from "./index.ts";

describe("schema state machines", () => {
  it("parses enum-backed state machines, transition operations, events, and stringify output", () => {
    const schema = parseAppSchema(stateMachineSchema());
    expect(
      schema.entities
        .find((definition) => definition.key === "task")!
        .stateMachines?.find((definition) => definition.key === "statusFlow"),
    ).toEqual({
      key: "statusFlow",
      field: "status",
      initial: "todo",
      states: ["todo", "doing", "done"],
      terminal: ["done"],
      transitions: [
        { key: "start", label: "Start", from: ["todo"], to: "doing" },
        { key: "finish", label: "Finish", from: ["doing"], to: "done" },
        {
          key: "reopen",
          label: "Reopen",
          from: ["doing"],
          to: "todo",
        },
      ],
      event: {
        entity: "task-event",
        fields: {
          sourceEntity: "sourceEntity",
          sourceRecordId: "sourceRecordId",
          transitionKey: "transitionKey",
          previousState: "previousState",
          nextState: "nextState",
          actorMode: "actorMode",
          occurredAt: "occurredAt",
        },
      },
    });
    expect(
      schema.entities
        .find((definition) => definition.key === "task")!
        .operations?.find((definition) => definition.key === "startWork")?.effect,
    ).toEqual({
      type: "operationHandler",
      handler: "transition-state",
      config: {
        machine: "statusFlow",
        transition: "start",
      },
    });
    expect(
      schema.entities
        .find((definition) => definition.key === "task")!
        .operations?.find((definition) => definition.key === "startWork"),
    ).toMatchObject({
      label: "Start work",
      kind: "command",
      policy: { actors: ["owner"] },
    });
    expect(getOperationHandlerCapabilities("transition-state")).toEqual({
      createAfterCreateHook: false,
      publicExecution: false,
      input: requiredOperationHandlerObjectInput({
        recordId: requiredOperationHandlerStringRecordIdInput(),
      }),
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("parses and stringifies generated date transition target values", () => {
    const schema = parseAppSchema(
      stateMachineSchemaWithTransitionTargetValues({
        startedOn: { kind: "generatedDate", timeZone: "Australia/Sydney" },
        reportingDate: { kind: "generatedDate", timeZone: "America/Los_Angeles" },
      }),
    );
    const effect = schema.entities
      .find((definition) => definition.key === "task")!
      .operations?.find((definition) => definition.key === "startWork")?.effect;

    expect(effect).toEqual({
      type: "operationHandler",
      handler: "transition-state",
      config: {
        machine: "statusFlow",
        transition: "start",
        targetValues: {
          startedOn: { kind: "generatedDate", timeZone: "Australia/Sydney" },
          reportingDate: { kind: "generatedDate", timeZone: "America/Los_Angeles" },
        },
      },
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("parses required date operation input transition target values", () => {
    const schema = parseAppSchema(
      stateMachineSchemaWithTransitionTargetValues(
        {
          startedOn: { kind: "input", field: "receivedAt" },
          reportingDate: { kind: "input", field: "reportingDate" },
        },
        {
          input: {
            fields: [
              {
                key: "receivedAt",
                field: "startedOn",
                required: true,
                default: { kind: "generatedDate", timeZone: "Australia/Sydney" },
              },
              {
                key: "reportingDate",
                type: "date",
                required: true,
                default: { kind: "generatedDate", timeZone: "America/Los_Angeles" },
              },
            ],
          },
        },
      ),
    );
    const operation = schema.entities
      .find((definition) => definition.key === "task")!
      .operations?.find((definition) => definition.key === "startWork");

    expect(operation?.input).toEqual({
      fields: [
        {
          key: "receivedAt",
          field: "startedOn",
          required: true,
          default: { kind: "generatedDate", timeZone: "Australia/Sydney" },
        },
        {
          key: "reportingDate",
          type: "date",
          required: true,
          default: { kind: "generatedDate", timeZone: "America/Los_Angeles" },
        },
      ],
    });
    expect(operation?.effect).toEqual({
      type: "operationHandler",
      handler: "transition-state",
      config: {
        machine: "statusFlow",
        transition: "start",
        targetValues: {
          startedOn: { kind: "input", field: "receivedAt" },
          reportingDate: { kind: "input", field: "reportingDate" },
        },
      },
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("keeps date operation input defaults explicit and date-compatible", () => {
    const withoutDefault = parseAppSchema(
      stateMachineSchemaWithTransitionTargetValues(
        { startedOn: { kind: "input", field: "receivedAt" } },
        { input: { fields: [{ key: "receivedAt", type: "date", required: true }] } },
      ),
    );
    expect(
      withoutDefault.entities
        .find((definition) => definition.key === "task")!
        .operations?.find((definition) => definition.key === "startWork")?.input?.fields[0],
    ).toEqual({ key: "receivedAt", type: "date", required: true });

    const invalidDefaults = [
      {
        field: {
          key: "receivedAt",
          type: "date",
          required: true,
          default: { kind: "generatedDate" },
        },
        message: 'must include "timeZone"',
      },
      {
        field: {
          key: "receivedAt",
          type: "date",
          required: true,
          default: { kind: "generatedDate", timeZone: "+10:00" },
        },
        message: "timeZone must be a resolvable IANA time-zone identifier",
      },
      {
        field: {
          key: "receivedAt",
          type: "date",
          required: true,
          default: { kind: "generatedDate", timeZone: "Mars/Olympus_Mons" },
        },
        message: "timeZone must be a resolvable IANA time-zone identifier",
      },
      {
        field: {
          key: "receivedAt",
          type: "date",
          required: true,
          default: { kind: "literal", value: "2026-08-17" },
        },
        message: "default must use a generatedDate expression",
      },
      {
        field: {
          key: "receivedAt",
          field: "title",
          required: true,
          default: { kind: "generatedDate", timeZone: "Australia/Sydney" },
        },
        message: "default requires a date-compatible operation input field",
      },
    ];

    for (const invalidDefault of invalidDefaults) {
      expect(() =>
        parseAppSchema(
          stateMachineSchemaWithTransitionTargetValues(
            { startedOn: { kind: "input", field: "receivedAt" } },
            { input: { fields: [invalidDefault.field] } },
          ),
        ),
      ).toThrow(invalidDefault.message);
    }
  });

  it("rejects invalid state-machine declarations", () => {
    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          machine: { field: "missing" },
        }),
      ),
    ).toThrow('field references unknown field "task.missing"');

    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          machine: { field: "done" },
        }),
      ),
    ).toThrow('field "done" must be an enum field');

    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          fields: {
            status: { ...taskFields().status, required: false },
          },
        }),
      ),
    ).toThrow('field "status" must be required');

    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          machine: { initial: "missing" },
        }),
      ),
    ).toThrow('initial references unknown state "missing"');

    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          fields: {
            status: { ...taskFields().status, default: "doing" },
          },
        }),
      ),
    ).toThrow('field "status" default must match initial state');

    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          machine: {
            transitions: [{ key: "reopen", label: "Reopen", from: ["done"], to: "doing" }],
          },
        }),
      ),
    ).toThrow('from state "done" is terminal');

    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          machine: {
            transitions: [
              {
                key: "reopen",
                label: "Reopen",
                from: ["doing"],
                to: "todo",
                allowTerminalRecovery: true,
              },
            ],
          },
        }),
      ),
    ).toThrow('transitions.reopen has unsupported key "allowTerminalRecovery"');

    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          extraStateMachines: {
            duplicateStatusFlow: {
              ...statusFlowMachine(),
            },
          },
        }),
      ),
    ).toThrow('field "status" is already owned by another state machine');
  });

  it("rejects invalid transition event mappings", () => {
    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          machine: {
            event: {
              entity: "missing",
              fields: transitionEventFields(),
            },
          },
        }),
      ),
    ).toThrow('event references unknown entity "missing"');

    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          eventFields: {
            occurredAt: { type: "text", required: true },
          },
        }),
      ),
    ).toThrow("fields.occurredAt must reference a date field");

    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          machine: {
            event: {
              entity: "task-event",
              fields: {
                ...transitionEventFields(),
                nextState: "missing",
              },
            },
          },
        }),
      ),
    ).toThrow('fields.nextState references unknown field "missing"');

    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          eventFields: {
            label: { type: "text", required: true },
          },
        }),
      ),
    ).toThrow('target entity requires field "label" to have a default or event mapping');
  });

  it("rejects invalid transition-state operations and anonymous public access", () => {
    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          operation: {
            effect: {
              ...transitionEffect(),
              config: { ...transitionEffect().config, machine: "missing" },
            },
          },
        }),
      ),
    ).toThrow('references unknown state machine "missing"');

    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          operation: {
            effect: {
              ...transitionEffect(),
              config: { ...transitionEffect().config, transition: "missing" },
            },
          },
        }),
      ),
    ).toThrow('references unknown transition "statusFlow.missing"');

    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          operation: {
            policy: {
              actors: ["anonymous"],
              access: {
                actor: "anonymous",
                challenge: { kind: "turnstile" },
                origin: { kind: "same-origin" },
              },
            },
            input: {
              fields: [{ key: "reason", type: "text", required: true }],
            },
          },
        }),
      ),
    ).toThrow("command effect is not eligible for public execution");
  });

  it("rejects unsupported transition target fields and expressions", () => {
    const invalidCases: {
      message: string;
      targetValues: unknown;
    }[] = [
      {
        targetValues: {},
        message: "targetValues must not be empty",
      },
      {
        targetValues: [],
        message: "targetValues must be an object",
      },
      {
        targetValues: {
          createdAt: { kind: "generatedDate", timeZone: "Australia/Sydney" },
        },
        message: 'must not target system field "createdAt"',
      },
      {
        targetValues: {
          missing: { kind: "generatedDate", timeZone: "Australia/Sydney" },
        },
        message: 'references unknown field "missing"',
      },
      {
        targetValues: {
          status: { kind: "generatedDate", timeZone: "Australia/Sydney" },
        },
        message: 'must not target state machine field "status"',
      },
      {
        targetValues: {
          title: { kind: "generatedDate", timeZone: "Australia/Sydney" },
        },
        message: "requires a date destination field",
      },
      {
        targetValues: {
          startedOn: { kind: "literal", value: "2026-07-29" },
        },
        message: "must use a generatedDate or input expression",
      },
      {
        targetValues: {
          startedOn: { kind: "input", field: "missing" },
        },
        message: 'references unknown operation input field "missing"',
      },
      {
        targetValues: {
          startedOn: { kind: "targetField", field: "startedOn" },
        },
        message: "must use a generatedDate or input expression",
      },
      {
        targetValues: {
          startedOn: { kind: "generatedTimestamp" },
        },
        message: "must use a generatedDate or input expression",
      },
      {
        targetValues: {
          startedOn: { kind: "workflow", action: "patch" },
        },
        message: "must use a generatedDate or input expression",
      },
      {
        targetValues: {
          startedOn: { kind: "generatedDate" },
        },
        message: 'must include "timeZone"',
      },
      {
        targetValues: {
          startedOn: { kind: "generatedDate", timeZone: "Mars/Olympus_Mons" },
        },
        message: "timeZone must be a resolvable IANA time-zone identifier",
      },
      {
        targetValues: {
          startedOn: { kind: "generatedDate", timeZone: "+10:00" },
        },
        message: "timeZone must be a resolvable IANA time-zone identifier",
      },
      {
        targetValues: {
          startedOn: {
            kind: "generatedDate",
            timeZone: "Australia/Sydney",
            patch: { status: "doing" },
          },
        },
        message: 'has unsupported key "patch"',
      },
    ];

    for (const invalidCase of invalidCases) {
      expect(() =>
        parseAppSchema(stateMachineSchemaWithTransitionTargetValues(invalidCase.targetValues)),
      ).toThrow(invalidCase.message);
    }

    expect(() =>
      parseAppSchema(
        stateMachineSchemaWithTransitionTargetValues(
          {
            startedOn: { kind: "generatedDate", timeZone: "Australia/Sydney" },
          },
          { scope: "collection" },
        ),
      ),
    ).toThrow("targetValues requires a record-scoped transition operation");

    expect(() =>
      parseAppSchema(
        stateMachineSchemaWithTransitionTargetValues(
          { startedOn: { kind: "input", field: "title" } },
          { input: { fields: [{ key: "title", field: "title", required: true }] } },
        ),
      ),
    ).toThrow('operation input field "title" must be date-compatible');

    expect(() =>
      parseAppSchema(
        stateMachineSchemaWithTransitionTargetValues(
          { startedOn: { kind: "input", field: "receivedAt" } },
          { input: { fields: [{ key: "receivedAt", type: "text", required: true }] } },
        ),
      ),
    ).toThrow('operation input field "receivedAt" must be date-compatible');

    expect(() =>
      parseAppSchema(
        stateMachineSchemaWithTransitionTargetValues(
          { title: { kind: "input", field: "receivedAt" } },
          { input: { fields: [{ key: "receivedAt", type: "date", required: true }] } },
        ),
      ),
    ).toThrow("requires a date destination field");

    expect(() =>
      parseAppSchema(
        stateMachineSchemaWithTransitionTargetValues(
          { startedOn: { kind: "input", field: "receivedAt" } },
          {
            input: {
              fields: [{ key: "receivedAt", field: "startedOn", required: false }],
            },
          },
        ),
      ),
    ).toThrow('operation input field "receivedAt" must be required');

    expect(() =>
      parseAppSchema(
        stateMachineSchemaWithTransitionTargetValues(
          { startedOn: { kind: "input", field: "receivedAt", fallback: "2026-08-17" } },
          {
            input: {
              fields: [{ key: "receivedAt", field: "startedOn", required: true }],
            },
          },
        ),
      ),
    ).toThrow('has unsupported key "fallback"');
  });

  it("parses and stringifies create-only transition side effects with target snapshots", () => {
    const schema = parseAppSchema(stateMachineSchemaWithTransitionSideEffects());
    const effect = schema.entities
      .find((definition) => definition.key === "task")!
      .operations?.find((definition) => definition.key === "startWork")?.effect;
    expect(effect).toEqual({
      type: "operationHandler",
      handler: "transition-state",
      config: {
        machine: "statusFlow",
        transition: "start",
        sideEffects: transitionSideEffects(),
      },
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("rejects invalid transition side-effect plans and target expressions", () => {
    const invalidCases: {
      entities?: Record<string, unknown>;
      message: string;
      sideEffects: unknown;
    }[] = [
      {
        sideEffects: { type: "recordPlan", steps: [] },
        message: "sideEffects steps must be a non-empty array",
      },
      {
        sideEffects: { type: "providerCall", steps: transitionSideEffects().steps },
        message: "sideEffects type must be recordPlan",
      },
      {
        sideEffects: transitionSideEffects({
          steps: [{ ...createOrderStep(), name: "" }],
        }),
        message: "steps[0] name must be a non-empty string",
      },
      {
        sideEffects: transitionSideEffects({
          steps: [createOrderStep(), { ...createOrderStep(), name: "createOrder" }],
        }),
        message: "steps[1] name must be unique",
      },
      ...(["patch", "delete", "tombstone"] as const).map((kind) => ({
        sideEffects: transitionSideEffects({
          steps: [
            {
              ...createOrderStep(),
              kind,
              recordId: { kind: "targetRecordId" },
            },
          ],
        }),
        message: "kind must be create in transition side-effect plans",
      })),
      {
        sideEffects: transitionSideEffects({
          steps: [{ ...createOrderStep(), kind: "transition" }],
        }),
        message: "kind must be create, patch, delete, or tombstone",
      },
      {
        sideEffects: transitionSideEffects({
          steps: [{ ...createOrderStep(), entity: "external:external-order" }],
        }),
        message: "must target an entity from the same schema",
      },
      {
        sideEffects: transitionSideEffects({
          steps: [
            {
              ...createOrderStep(),
              values: { title: { kind: "targetField", field: "missing" } },
            },
          ],
        }),
        message: 'references unknown target field "missing"',
      },
      {
        sideEffects: transitionSideEffects({
          steps: [
            {
              ...createOrderStep(),
              values: { done: { kind: "targetField", field: "title" } },
            },
          ],
        }),
        message: 'target field type "text" is incompatible with destination type "boolean"',
      },
      {
        sideEffects: transitionSideEffects({
          steps: [
            {
              ...createOrderStep(),
              values: { title: { kind: "targetField", field: "contactEmail" } },
            },
          ],
        }),
        message: "optional target field requires an optional or defaulted destination",
      },
      {
        sideEffects: transitionSideEffects({
          steps: [
            {
              ...createOrderStep(),
              values: { contactEmail: { kind: "targetField", field: "title" } },
            },
          ],
        }),
        message: 'target text format "plain" is incompatible with destination format "email"',
      },
      {
        sideEffects: transitionSideEffects({
          steps: [
            {
              ...createOrderStep(),
              values: { status: { kind: "targetField", field: "status" } },
            },
          ],
        }),
        entities: {
          order: {
            ...orderEntity(),
            fields: orderEntity().fields.map((field) =>
              field.key === "status"
                ? {
                    key: "status",
                    type: "enum",
                    required: true,
                    values: [{ key: "todo", label: "Todo" }],
                  }
                : field,
            ),
          },
        },
        message: 'destination enum does not accept target value "doing"',
      },
      {
        sideEffects: transitionSideEffects({
          steps: [
            {
              ...createOrderStep(),
              values: { reviewer: { kind: "targetField", field: "parentTask" } },
            },
          ],
        }),
        message: 'target reference entity "task" is incompatible with destination entity "person"',
      },
      {
        sideEffects: transitionSideEffects({
          steps: [
            {
              ...createOrderStep(),
              values: {
                reviewer: {
                  kind: "reference",
                  entity: "person",
                  id: { kind: "targetRecordId" },
                },
              },
            },
          ],
        }),
        message: 'targetRecordId must reference operation target entity "task"',
      },
    ];

    for (const invalidCase of invalidCases) {
      expect(() =>
        parseAppSchema(
          stateMachineSchemaWithTransitionSideEffects({
            entities: invalidCase.entities,
            sideEffects: invalidCase.sideEffects,
          }),
        ),
      ).toThrow(invalidCase.message);
    }

    expect(() =>
      parseAppSchema(
        stateMachineSchemaWithTransitionSideEffects({
          operation: { scope: "collection" },
        }),
      ),
    ).toThrow("sideEffects requires a record-scoped transition operation");

    for (const expression of [
      { kind: "targetRecordId" },
      { kind: "targetField", field: "title" },
    ]) {
      expect(() =>
        parseAppSchema(
          stateMachineSchemaWithTransitionSideEffects({
            operation: {
              scope: "collection",
              effect: {
                type: "recordPlan",
                steps: [
                  {
                    name: "createOrder",
                    kind: "create",
                    entity: "order",
                    values: { title: expression },
                  },
                ],
              },
            },
          }),
        ),
      ).toThrow("is only valid for record-scoped operations");
    }

    expect(() =>
      parseAppSchema(
        stateMachineSchemaWithTransitionSideEffects({
          operation: {
            input: {
              fields: [{ key: "reason", type: "text", required: true }],
            },
            policy: {
              actors: ["anonymous"],
              access: {
                actor: "anonymous",
                challenge: { kind: "turnstile" },
                origin: { kind: "same-origin" },
              },
            },
          },
        }),
      ),
    ).toThrow("command effect is not eligible for public execution");
  });
});

function stateMachineSchema(
  overrides: {
    eventFields?: Record<string, unknown>;
    extraEntities?: Record<string, unknown>;
    extraStateMachines?: Record<string, unknown>;
    fields?: Record<string, unknown>;
    machine?: Record<string, unknown>;
    operation?: Record<string, unknown>;
  } = {},
) {
  return {
    version: 1,
    entities: [
      {
        id: "entity_ba68ed70-bfd3-43fa-bfd2-5239400ccef2",
        key: "task",
        label: "Task",
        fields: keyed({ ...taskFields(), ...overrides.fields }),
        stateMachines: [
          {
            key: "statusFlow",
            ...statusFlowMachine(),
            ...overrides.machine,
          },
          ...keyed(overrides.extraStateMachines),
        ],
        operations: [
          {
            key: "startWork",
            label: "Start work",
            kind: "command",
            scope: "record",
            effect: transitionEffect(),
            policy: { actors: ["owner"] },
            ...overrides.operation,
          },
        ],
      },
      {
        id: "entity_91706a81-beb0-4106-8c7a-87152550a435",
        key: "task-event",
        label: "Task event",
        fields: keyed({
          sourceEntity: { type: "text", required: true },
          sourceRecordId: { type: "text", required: true },
          transitionKey: { type: "text", required: true },
          previousState: { type: "text", required: true },
          nextState: { type: "text", required: true },
          actorMode: { type: "text", required: true },
          occurredAt: { type: "date", required: true },
          ...overrides.eventFields,
        }),
      },
      ...keyed(overrides.extraEntities),
    ],
    queries: [{ key: "taskAll", label: "All", entity: "task", expression: { kind: "all" } }],
    itemViews: [
      {
        key: "taskItem",
        entity: "task",
        fields: [
          { field: "title", editor: "text" },
          { field: "status", editor: "enum" },
        ],
      },
    ],
    tableViews: [],
    views: [
      {
        key: "taskHome",
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
          sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
        },
      },
    ],
  };
}
function stateMachineSchemaWithTransitionSideEffects(
  overrides: {
    entities?: Record<string, unknown>;
    operation?: Record<string, unknown>;
    sideEffects?: unknown;
  } = {},
) {
  return stateMachineSchema({
    extraEntities: {
      person: personEntity(),
      order: orderEntity(),
      "order-note": orderNoteEntity(),
      ...overrides.entities,
    },
    fields: {
      contactEmail: { type: "text", required: false, format: "email" },
      reviewer: { type: "reference", required: false, to: "person" },
      parentTask: { type: "reference", required: false, to: "task" },
    },
    operation: {
      effect: {
        ...transitionEffect(),
        config: {
          ...transitionEffect().config,
          sideEffects: overrides.sideEffects ?? transitionSideEffects(),
        },
      },
      ...overrides.operation,
    },
  });
}

function stateMachineSchemaWithTransitionTargetValues(
  targetValues: unknown,
  operation: Record<string, unknown> = {},
) {
  return stateMachineSchema({
    fields: {
      startedOn: { type: "date", required: false },
      reportingDate: { type: "date", required: false },
    },
    operation: {
      effect: {
        ...transitionEffect(),
        config: {
          ...transitionEffect().config,
          targetValues,
        },
      },
      ...operation,
    },
  });
}

function transitionEffect() {
  return {
    type: "operationHandler",
    handler: "transition-state",
    config: {
      machine: "statusFlow",
      transition: "start",
    },
  };
}

function transitionSideEffects(overrides: Record<string, unknown> = {}) {
  return {
    type: "recordPlan",
    steps: [createOrderStep(), createOrderNoteStep()],
    ...overrides,
  };
}

function createOrderStep() {
  return {
    name: "createOrder",
    kind: "create",
    entity: "order",
    recordId: { kind: "generatedId", prefix: "order" },
    values: {
      task: {
        kind: "reference",
        entity: "task",
        id: { kind: "targetRecordId" },
      },
      title: { kind: "targetField", field: "title" },
      done: { kind: "targetField", field: "done" },
      status: { kind: "targetField", field: "status" },
      contactEmail: { kind: "targetField", field: "contactEmail" },
      reviewer: { kind: "targetField", field: "reviewer" },
    },
  };
}

function createOrderNoteStep() {
  return {
    name: "createOrderNote",
    kind: "create",
    entity: "order-note",
    values: {
      order: {
        kind: "reference",
        entity: "order",
        id: { kind: "stepOutput", step: "createOrder", output: "id" },
      },
      title: {
        kind: "stepOutput",
        step: "createOrder",
        output: "field",
        field: "title",
      },
      task: {
        kind: "reference",
        entity: "task",
        id: { kind: "targetRecordId" },
      },
    },
  };
}

function taskFields() {
  return {
    title: { type: "text", required: true },
    done: { type: "boolean", required: true, default: false },
    status: {
      type: "enum",
      required: true,
      default: "todo",
      values: [
        { key: "todo", label: "Todo" },
        { key: "doing", label: "Doing" },
        { key: "done", label: "Done" },
      ],
    },
  } as const;
}

function personEntity() {
  return {
    id: "entity_ee672347-080c-43bb-a901-5dc0816af4b1",
    label: "Person",
    fields: [{ key: "name", type: "text", required: true }],
  };
}
function orderEntity() {
  return {
    id: "entity_aa95668f-440e-4af1-a6e7-eb1a35f3a8fd",
    label: "Order",
    fields: [
      { key: "task", type: "reference", required: true, to: "task" },
      { key: "title", type: "text", required: true },
      { key: "done", type: "boolean", required: true, default: false },
      {
        key: "status",
        type: "enum",
        required: true,
        values: [
          { key: "todo", label: "Todo" },
          { key: "doing", label: "Doing" },
          { key: "done", label: "Done" },
          { key: "cancelled", label: "Cancelled" },
        ],
      },
      { key: "contactEmail", type: "text", required: false, format: "email" },
      { key: "reviewer", type: "reference", required: false, to: "person" },
    ],
  };
}
function orderNoteEntity() {
  return {
    id: "entity_fabe7518-88ce-40dc-84b9-d2d4818da0af",
    label: "Order note",
    fields: [
      { key: "order", type: "reference", required: true, to: "order" },
      { key: "title", type: "text", required: true },
      { key: "task", type: "reference", required: true, to: "task" },
    ],
  };
}
function statusFlowMachine() {
  return {
    field: "status",
    initial: "todo",
    states: ["todo", "doing", "done"],
    terminal: ["done"],
    transitions: [
      { key: "start", label: "Start", from: ["todo"], to: "doing" },
      { key: "finish", label: "Finish", from: ["doing"], to: "done" },
      {
        key: "reopen",
        label: "Reopen",
        from: ["doing"],
        to: "todo",
      },
    ],
    event: {
      entity: "task-event",
      fields: transitionEventFields(),
    },
  } as const;
}
function keyed(value: Record<string, unknown> | undefined) {
  return Object.entries(value ?? {}).map(([key, definition]) => ({
    key,
    ...(definition as Record<string, unknown>),
  }));
}
function transitionEventFields() {
  return {
    sourceEntity: "sourceEntity",
    sourceRecordId: "sourceRecordId",
    transitionKey: "transitionKey",
    previousState: "previousState",
    nextState: "nextState",
    actorMode: "actorMode",
    occurredAt: "occurredAt",
  } as const;
}
