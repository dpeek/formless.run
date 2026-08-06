import { describe, expect, it } from "vite-plus/test";

import {
  classifyCollectionOperationBinding,
  classifyTableOperationBinding,
  entityOperationBindingKinds,
  entityOperationCommandEffectTypes,
  formatEntityOperationKey,
  getOperationHandlerCapabilities,
  getOperationHandlerInputExpectation,
  isEntityOperationBindingKind,
  isEntityOperationCommandEffect,
  isEntityOperationReadKind,
  isEntityOperationWriteKind,
  isOperationHandlerPubliclyExecutable,
  operationHandlerKinds,
  optionalOperationHandlerScalarRecordValueMapInput,
  parseAppSchema,
  parseEntityOperationKey,
  requiredOperationHandlerObjectInput,
  requiredOperationHandlerScalarRecordValueMapInput,
  requiredOperationHandlerStringRecordIdArrayInput,
  requiredOperationHandlerStringRecordIdInput,
  requiredOperationHandlerTextInput,
  stringifySchema,
} from "./index.ts";

describe("schema entity operations", () => {
  it("parses explicit entity-local operations and preserves operation output contracts", () => {
    const schema = parseAppSchema(
      schemaWithTaskOperations({
        activeList: {
          kind: "list",
          scope: "collection",
          target: { query: "taskActive" },
        },
        get: {
          kind: "get",
          scope: "record",
        },
        create: {
          kind: "create",
          scope: "collection",
          input: {
            fields: [
              { key: "title", field: "title", required: true },
              { key: "dueDate", field: "dueDate" },
            ],
          },
          effect: { type: "createRecord" },
          policy: { actors: ["owner"], visible: true },
          audit: { input: "hash" },
          idempotency: { required: true, source: "caller" },
        },
        update: {
          kind: "update",
          scope: "record",
          input: {
            fields: [
              { key: "title", field: "title" },
              { key: "done", field: "done" },
              { key: "dueDate", field: "dueDate" },
            ],
          },
          effect: { type: "patchRecord" },
        },
        delete: {
          kind: "delete",
          scope: "record",
          effect: { type: "tombstoneRecord", entity: "task" },
          idempotency: { required: true, source: "runtime" },
        },
        clearCompletedTasks: {
          label: "Clear completed",
          kind: "command",
          scope: "collection",
          target: { query: "taskCompleted" },
          effect: {
            type: "operationHandler",
            handler: "tombstone-query-results",
            config: { query: "taskCompleted" },
          },
        },
        annotate: {
          kind: "command",
          scope: "collection",
          target: { query: "taskCompleted" },
          input: {
            fields: [
              { key: "note", type: "text", required: true, label: "Note" },
              {
                key: "severity",
                type: "enum",
                required: false,
                values: [
                  { key: "low", label: "Low" },
                  { key: "high", label: "High" },
                ],
              },
            ],
          },
          effect: {
            type: "operationHandler",
            handler: "tombstone-query-results",
            config: { query: "taskCompleted" },
          },
          policy: {
            actors: ["owner"],
          },
          audit: { input: "summary" },
        },
      }),
    );
    const operations = schema.entities.find((definition) => definition.key === "task")?.operations;
    expect(formatEntityOperationKey({ entityKey: "task", operationKey: "create" })).toBe(
      "task.create",
    );
    expect(parseEntityOperationKey("Operation", "task.clearCompletedTasks")).toEqual({
      entityKey: "task",
      operationKey: "clearCompletedTasks",
    });
    expect(operation(operations, "activeList")).toMatchObject({
      kind: "list",
      scope: "collection",
      target: { query: "taskActive" },
      output: { type: "list", query: "taskActive" },
      idempotency: { required: false },
    });
    expect(operation(operations, "create")).toMatchObject({
      kind: "create",
      scope: "collection",
      output: { type: "create" },
      effect: { type: "createRecord" },
      idempotency: { required: true, source: "caller" },
      audit: { input: "hash" },
    });
    expect(operation(operations, "delete")).toMatchObject({
      kind: "delete",
      scope: "record",
      output: { type: "delete" },
      effect: { type: "tombstoneRecord", entity: "task" },
      idempotency: { required: true, source: "runtime" },
    });
    expect(operation(operations, "clearCompletedTasks")).toMatchObject({
      kind: "command",
      scope: "collection",
      target: { query: "taskCompleted" },
      effect: {
        type: "operationHandler",
        handler: "tombstone-query-results",
        config: { query: "taskCompleted" },
      },
      output: { type: "command" },
    });
    expect(operation(operations, "annotate").input).toEqual({
      fields: [
        { key: "note", type: "text", required: true, label: "Note" },
        {
          key: "severity",
          type: "enum",
          required: false,
          values: [
            { key: "low", label: "Low" },
            { key: "high", label: "High" },
          ],
        },
      ],
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("classifies operations, operation bindings, and command effects", () => {
    const schema = parseAppSchema(
      schemaWithTaskLogOperations({
        activeList: {
          kind: "list",
          scope: "collection",
          target: { query: "taskActive" },
        },
        clearCompletedTasks: {
          label: "Clear completed",
          kind: "command",
          scope: "collection",
          target: { query: "taskCompleted" },
          effect: {
            type: "operationHandler",
            handler: "tombstone-query-results",
            config: { query: "taskCompleted" },
          },
        },
        submitIntake: recordPlanOperation(),
      }),
    );
    const operations = schema.entities.find((definition) => definition.key === "task")?.operations;
    const clearCompletedEffect = operation(operations, "clearCompletedTasks").effect;
    const submitIntakeEffect = operation(operations, "submitIntake").effect;
    const binding = classifyCollectionOperationBinding({
      operation: "task.clearCompletedTasks",
      placement: "toolbar",
      count: { type: "count" },
    });
    const tableBinding = classifyTableOperationBinding({
      operation: "task.update",
      editView: "taskEdit",
    });

    expect(isEntityOperationReadKind("list")).toBe(true);
    expect(isEntityOperationReadKind("command")).toBe(false);
    expect(isEntityOperationWriteKind("command")).toBe(true);
    expect(entityOperationBindingKinds).toEqual(["collection", "table"]);
    expect(isEntityOperationBindingKind(binding.kind)).toBe(true);
    expect(isEntityOperationBindingKind(tableBinding.kind)).toBe(true);
    expect(binding).toEqual({
      kind: "collection",
      operationKey: { entityKey: "task", operationKey: "clearCompletedTasks" },
      canonicalOperationKey: "task.clearCompletedTasks",
    });
    expect(tableBinding).toEqual({
      kind: "table",
      operationKey: { entityKey: "task", operationKey: "update" },
      canonicalOperationKey: "task.update",
    });
    expect(operationHandlerKinds).toContain("create-tree-child");
    expect(entityOperationCommandEffectTypes).toEqual(["operationHandler", "recordPlan"]);
    expect(isEntityOperationCommandEffect(clearCompletedEffect)).toBe(true);
    expect(isEntityOperationCommandEffect(submitIntakeEffect)).toBe(true);
  });

  it("accepts any declared same-entity query for generic tombstoning", () => {
    const schema = parseAppSchema(
      schemaWithTaskOperations({
        clearActiveTasks: {
          label: "Clear active",
          kind: "command",
          scope: "collection",
          target: { query: "taskActive" },
          effect: {
            type: "operationHandler",
            handler: "tombstone-query-results",
            config: { query: "taskActive" },
          },
        },
      }),
    );

    expect(
      operation(
        schema.entities.find((definition) => definition.key === "task")?.operations,
        "clearActiveTasks",
      ).effect,
    ).toEqual({
      type: "operationHandler",
      handler: "tombstone-query-results",
      config: { query: "taskActive" },
    });
  });

  it("exposes handler input expectations without changing capability eligibility", () => {
    expect(getOperationHandlerInputExpectation("tombstone-query-results")).toBeUndefined();
    expect(getOperationHandlerInputExpectation("create-missing-join-records")).toBeUndefined();
    expect(getOperationHandlerInputExpectation("create-selected-join-record")).toEqual(
      requiredOperationHandlerObjectInput({
        fromRecordId: requiredOperationHandlerStringRecordIdInput(),
        toRecordId: requiredOperationHandlerStringRecordIdInput(),
      }),
    );
    expect(getOperationHandlerInputExpectation("remove-selected-join-records")).toEqual(
      requiredOperationHandlerObjectInput({
        recordIds: requiredOperationHandlerStringRecordIdArrayInput(),
      }),
    );
    expect(getOperationHandlerInputExpectation("create-tree-child")).toEqual(
      requiredOperationHandlerObjectInput({
        parentRecordId: requiredOperationHandlerStringRecordIdInput(),
        childValues: requiredOperationHandlerScalarRecordValueMapInput(),
        placementValues: optionalOperationHandlerScalarRecordValueMapInput(),
      }),
    );
    expect(getOperationHandlerInputExpectation("remove-tree-placement")).toEqual(
      requiredOperationHandlerObjectInput({
        placementId: requiredOperationHandlerStringRecordIdInput(),
      }),
    );
    expect(getOperationHandlerInputExpectation("contact-subscription.subscribe")).toEqual(
      requiredOperationHandlerObjectInput({
        email: requiredOperationHandlerTextInput(),
      }),
    );
    expect(getOperationHandlerInputExpectation("transition-state")).toEqual(
      requiredOperationHandlerObjectInput({
        recordId: requiredOperationHandlerStringRecordIdInput(),
      }),
    );

    expect(getOperationHandlerCapabilities("contact-subscription.subscribe").publicExecution).toBe(
      true,
    );
    expect(isOperationHandlerPubliclyExecutable("contact-subscription.subscribe")).toBe(true);
    expect(isOperationHandlerPubliclyExecutable("create-selected-join-record")).toBe(false);
    expect(
      getOperationHandlerCapabilities("create-missing-join-records").createAfterCreateHook,
    ).toBe(true);
  });

  it("parses inline operation text formats and suggestions", () => {
    const schema = parseAppSchema(
      schemaWithTaskOperations({
        submitContact: {
          kind: "command",
          scope: "collection",
          input: {
            fields: [
              {
                key: "email",
                type: "text",
                required: true,
                label: "Email",
                format: "email",
                suggestions: ["hello@example.com"],
              },
              {
                key: "phone",
                type: "text",
                required: false,
                label: "Phone",
                format: "phone",
              },
              {
                key: "topic",
                type: "text",
                required: false,
                suggestions: ["Support", "Sales"],
              },
            ],
          },
          effect: {
            type: "operationHandler",
            handler: "tombstone-query-results",
            config: { query: "taskCompleted" },
          },
        },
      }),
    );
    expect(
      operation(
        schema.entities.find((definition) => definition.key === "task")!.operations,
        "submitContact",
      ).input,
    ).toEqual({
      fields: [
        {
          key: "email",
          type: "text",
          required: true,
          label: "Email",
          format: "email",
          suggestions: ["hello@example.com"],
        },
        {
          key: "phone",
          type: "text",
          required: false,
          label: "Phone",
          format: "phone",
        },
        {
          key: "topic",
          type: "text",
          required: false,
          suggestions: ["Support", "Sales"],
        },
      ],
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("parses affirmative boolean entity operation input constraints", () => {
    const schema = parseAppSchema(
      schemaWithTaskOperations({
        create: {
          kind: "create",
          scope: "collection",
          input: {
            fields: [
              {
                key: "consent",
                field: "done",
                required: true,
                mustBeTrue: true,
              },
            ],
          },
        },
      }),
    );
    expect(
      operation(
        schema.entities.find((definition) => definition.key === "task")!.operations,
        "create",
      ).input?.fields?.find((definition) => definition.key === "consent"),
    ).toEqual({
      key: "consent",
      field: "done",
      required: true,
      mustBeTrue: true,
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("rejects affirmative operation input constraints outside required boolean entity fields", () => {
    const invalidCases = [
      {
        field: { field: "title", required: true, mustBeTrue: true },
        message: "mustBeTrue requires a boolean entity field",
      },
      {
        field: { field: "done", required: false, mustBeTrue: true },
        message: "mustBeTrue requires required to be true",
      },
      {
        field: { field: "done", required: true, mustBeTrue: false },
        message: "mustBeTrue must be true when declared",
      },
      {
        field: { type: "boolean", required: true, mustBeTrue: true },
        message: 'has unsupported key "mustBeTrue"',
      },
    ];

    for (const invalidCase of invalidCases) {
      expect(() =>
        parseAppSchema(
          schemaWithTaskOperations({
            create:
              "field" in invalidCase.field
                ? {
                    kind: "create",
                    scope: "collection",
                    input: { fields: [{ key: "consent", ...invalidCase.field }] },
                  }
                : {
                    kind: "command",
                    scope: "collection",
                    input: { fields: [{ key: "consent", ...invalidCase.field }] },
                    effect: {
                      type: "operationHandler",
                      handler: "tombstone-query-results",
                      config: { query: "taskCompleted" },
                    },
                  },
          }),
        ),
      ).toThrow(invalidCase.message);
    }
  });

  it("rejects invalid inline operation text format and suggestion declarations", () => {
    expect(() =>
      parseAppSchema(
        schemaWithTaskOperations({
          submitContact: {
            kind: "command",
            scope: "collection",
            input: {
              fields: [{ key: "email", type: "text", required: true, format: "href" }],
            },
          },
        }),
      ),
    ).toThrow(
      'Entity operation "task.submitContact" input fields.email format must be "email" or "phone".',
    );

    expect(() =>
      parseAppSchema(
        schemaWithTaskOperations({
          submitContact: {
            kind: "command",
            scope: "collection",
            input: {
              fields: [
                { key: "topic", type: "text", required: false, suggestions: ["Support", ""] },
              ],
            },
          },
        }),
      ),
    ).toThrow(
      'Entity operation "task.submitContact" input fields.topic suggestions[1] must be a non-empty string.',
    );
  });

  it("rejects unsupported command effect types", () => {
    expect(() =>
      parseAppSchema(
        schemaWithTaskOperations({
          clearCompletedTasks: {
            label: "Clear completed",
            kind: "command",
            scope: "collection",
            target: { query: "taskCompleted" },
            effect: {
              type: "unsupportedCommandEffect",
              handler: "tombstone-query-results",
              query: "taskCompleted",
            },
            policy: {
              actors: ["anonymous"],
              access: anonymousPublicAccess(),
            },
            audit: { input: "summary" },
          },
        }),
      ),
    ).toThrow('has unsupported type "unsupportedCommandEffect"');
  });

  it("rejects unsupported source entity interaction keys", () => {
    expect(() =>
      parseAppSchema(
        baseTaskSchema({
          entities: [
            {
              key: "task",
              ...taskEntity({
                operationPolicies: {
                  create: {
                    access: anonymousPublicAccess(),
                  },
                },
              }),
            },
          ],
        }),
      ),
    ).toThrow('Entity "task" has unsupported key "operationPolicies"');
  });
  it("does not synthesize operation bindings without source-declared operations", () => {
    const schema = parseAppSchema(baseTaskSchema());
    const view = schema.views.find((definition) => definition.key === "taskHome")!;
    if (view?.type !== "collection") {
      throw new Error("Missing taskHome collection view.");
    }
    expect(
      schema.entities.find((definition) => definition.key === "task")?.operations,
    ).toBeUndefined();
    expect(view.operations).toBeUndefined();
    expect(() =>
      parseAppSchema(
        baseTaskSchema({
          views: [
            {
              key: "taskHome",
              ...taskHomeCollectionView({
                operations: [{ operation: "task.clearCompletedTasks" }],
              }),
            },
          ],
        }),
      ),
    ).toThrow('references unknown operation "task.clearCompletedTasks"');
  });

  it("does not project extra runtime state from source-declared operations", () => {
    const schema = parseAppSchema(
      schemaWithTaskOperations({
        create: {
          kind: "create",
          scope: "collection",
          effect: { type: "createRecord" },
        },
        update: {
          kind: "update",
          scope: "record",
          effect: { type: "patchRecord" },
        },
        clearCompletedTasks: {
          label: "Clear completed",
          kind: "command",
          scope: "collection",
          target: { query: "taskCompleted" },
          effect: {
            type: "operationHandler",
            handler: "tombstone-query-results",
            config: { query: "taskCompleted" },
          },
        },
      }),
    );
    expect(
      operation(
        schema.entities.find((definition) => definition.key === "task")!.operations,
        "clearCompletedTasks",
      ).effect,
    ).toEqual({
      type: "operationHandler",
      handler: "tombstone-query-results",
      config: { query: "taskCompleted" },
    });
  });

  it("parses authenticated operation actor policy and response field filters", () => {
    const schema = parseAppSchema(
      schemaWithTaskOperations({
        clearCompletedTasks: {
          label: "Clear completed",
          kind: "command",
          scope: "collection",
          target: { query: "taskCompleted" },
          effect: {
            type: "operationHandler",
            handler: "tombstone-query-results",
            config: { query: "taskCompleted" },
          },
          policy: {
            actors: ["authenticated"],
            responseFields: {
              authenticated: ["title"],
            },
          },
        },
      }),
    );
    expect(
      operation(
        schema.entities.find((definition) => definition.key === "task")!.operations,
        "clearCompletedTasks",
      ).policy,
    ).toEqual({
      actors: ["authenticated"],
      responseFields: {
        authenticated: ["title"],
      },
    });
  });

  it("keeps browser-hidden collection operation bindings parseable for client selection", () => {
    const schema = parseAppSchema(
      baseTaskSchema({
        entities: [
          {
            key: "task",
            ...taskEntity(),
            operations: [
              {
                key: "hiddenOwner",
                label: "Hidden owner",
                kind: "command",
                scope: "collection",
                effect: {
                  type: "operationHandler",
                  handler: "tombstone-query-results",
                  config: { query: "taskCompleted" },
                },
                policy: { actors: ["owner"], visible: false },
              },
              {
                key: "runnerOnly",
                label: "Runner only",
                kind: "command",
                scope: "collection",
                effect: {
                  type: "operationHandler",
                  handler: "tombstone-query-results",
                  config: { query: "taskCompleted" },
                },
                policy: { actors: ["runner"] },
              },
            ],
          },
        ],
        views: [
          {
            key: "taskHome",
            type: "collection",
            label: "Tasks",
            entity: "task",
            queries: [{ query: "taskAll" }],
            defaultQuery: "taskAll",
            result: { type: "list", itemView: "taskItem" },
            operations: [{ operation: "task.hiddenOwner" }, { operation: "task.runnerOnly" }],
          },
        ],
      }),
    );
    const view = schema.views.find((definition) => definition.key === "taskHome")!;
    if (view?.type !== "collection") {
      throw new Error("Missing taskHome collection view.");
    }

    expect(view.operations).toEqual([
      { operation: "task.hiddenOwner", placement: "toolbar" },
      { operation: "task.runnerOnly", placement: "toolbar" },
    ]);
  });

  it("parses command record-plan effects with ordered named steps", () => {
    const schema = parseAppSchema(
      schemaWithTaskLogOperations({
        submitIntake: recordPlanOperation(),
      }),
    );
    const effect = operation(
      schema.entities.find((definition) => definition.key === "task")!.operations,
      "submitIntake",
    ).effect;
    expect(effect).toEqual({
      type: "recordPlan",
      steps: [
        {
          name: "createTask",
          kind: "create",
          entity: "task",
          recordId: { kind: "generatedId", prefix: "task" },
          values: {
            title: { kind: "input", field: "title" },
            done: { kind: "literal", value: false },
            marker: {
              kind: "generatedCode",
              alphabet: "upperAlphaNumericNoConfusables",
              groups: [4, 4],
              separator: "-",
              prefix: "ORD-",
            },
            dueDate: { kind: "generatedDate", timeZone: "Australia/Sydney" },
          },
        },
        {
          name: "createLog",
          kind: "create",
          entity: "task-log",
          values: {
            task: {
              kind: "reference",
              entity: "task",
              id: { kind: "stepOutput", step: "createTask", output: "id" },
            },
            label: { kind: "input", field: "note" },
            actorMode: { kind: "actor", field: "mode" },
            actorPrincipalId: { kind: "actor", field: "principalId" },
            sourcePath: { kind: "source", field: "path" },
            occurredAt: { kind: "generatedTimestamp" },
          },
        },
        {
          name: "touchTask",
          kind: "patch",
          entity: "task",
          recordId: { kind: "stepOutput", step: "createTask", output: "id" },
          values: {
            title: { kind: "stepOutput", step: "createTask", output: "field", field: "title" },
          },
        },
      ],
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("parses and stringifies record-scoped record plans with target expressions", () => {
    const targetAwareEffect = recordPlanEffect({
      steps: [
        {
          name: "createLog",
          kind: "create",
          entity: "task-log",
          values: {
            task: {
              kind: "reference",
              entity: "task",
              id: { kind: "targetRecordId" },
            },
            label: { kind: "targetField", field: "title" },
            actorMode: { kind: "literal", value: "owner" },
            actorPrincipalId: { kind: "targetRecordId" },
            sourcePath: { kind: "targetField", field: "marker" },
            occurredAt: { kind: "generatedTimestamp" },
          },
        },
        {
          name: "touchTarget",
          kind: "patch",
          entity: "task",
          recordId: { kind: "targetRecordId" },
          values: {
            marker: { kind: "literal", value: "touched" },
          },
        },
      ],
    });
    const schema = parseAppSchema(
      schemaWithTaskLogOperations({
        submitIntake: recordPlanOperation({
          scope: "record",
          effect: targetAwareEffect,
        }),
      }),
    );
    const effect = operation(
      schema.entities.find((definition) => definition.key === "task")!.operations,
      "submitIntake",
    ).effect;

    expect(effect).toEqual(targetAwareEffect);
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("rejects invalid command record-plan declarations", () => {
    const invalidCases = [
      {
        operations: {
          submitIntake: {
            kind: "create",
            scope: "collection",
            input: { fields: [{ key: "title", field: "title" }] },
            effect: recordPlanEffect(),
          },
        },
        message: "type is only valid for command operations",
      },
      {
        operations: {
          submitIntake: recordPlanOperation({ effect: recordPlanEffect({ provider: "mail" }) }),
        },
        message: 'has unsupported key "provider"',
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [{ ...createTaskStep(), entity: "external:task" }],
            }),
          }),
        },
        message:
          'entity "external:task" references local entity "task" with a qualified name. Use local entity key "task".',
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [{ ...createTaskStep(), entity: "missing" }],
            }),
          }),
        },
        message: 'references unknown entity "missing"',
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                {
                  ...createTaskStep(),
                  values: { missing: { kind: "literal", value: "x" } },
                },
              ],
            }),
          }),
        },
        message: 'references unknown field "missing"',
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                {
                  ...createTaskStep(),
                  values: { updatedAt: { kind: "generatedTimestamp" } },
                },
              ],
            }),
          }),
        },
        message: 'must not target system field "updatedAt"',
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                {
                  ...createTaskStep(),
                  values: {
                    dueDate: {
                      kind: "generatedDate",
                      timeZone: "Mars/Olympus_Mons",
                    },
                  },
                },
              ],
            }),
          }),
        },
        message: "timeZone must be a resolvable IANA time-zone identifier",
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                {
                  ...createTaskStep(),
                  values: {
                    dueDate: {
                      kind: "generatedDate",
                      timeZone: "+11:00",
                    },
                  },
                },
              ],
            }),
          }),
        },
        message: "timeZone must be a resolvable IANA time-zone identifier",
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                {
                  ...createTaskStep(),
                  values: {
                    dueDate: { kind: "generatedDate" },
                  },
                },
              ],
            }),
          }),
        },
        message: 'must include "timeZone"',
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                {
                  ...createTaskStep(),
                  values: {
                    title: {
                      kind: "generatedDate",
                      timeZone: "Australia/Sydney",
                    },
                  },
                },
              ],
            }),
          }),
        },
        message: "generatedDate requires a date destination field",
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                {
                  ...createTaskStep(),
                  values: {
                    dueDate: { kind: "generatedTimestamp" },
                  },
                },
              ],
            }),
          }),
        },
        message: "generatedTimestamp is incompatible with date destination fields",
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                {
                  ...createTaskStep(),
                  values: { title: { kind: "input", field: "missing" } },
                },
              ],
            }),
          }),
        },
        message: 'references unknown operation input field "missing"',
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                {
                  ...createTaskStep(),
                  values: { title: { kind: "targetField", field: "title" } },
                },
              ],
            }),
          }),
        },
        message: "is only valid for record-scoped operations",
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            scope: "record",
            effect: recordPlanEffect({
              steps: [
                {
                  ...createTaskStep(),
                  values: { title: { kind: "targetField", field: "missing" } },
                },
              ],
            }),
          }),
        },
        message: 'references unknown target field "missing"',
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            scope: "record",
            effect: recordPlanEffect({
              steps: [
                {
                  ...createTaskStep(),
                  values: { dueDate: { kind: "targetRecordId" } },
                },
              ],
            }),
          }),
        },
        message: "targetRecordId requires a plain text destination field",
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            scope: "record",
            effect: recordPlanEffect({
              steps: [
                {
                  ...createLogStep(),
                  values: {
                    ...createLogStep().values,
                    task: {
                      kind: "reference",
                      entity: "task-log",
                      id: { kind: "targetRecordId" },
                    },
                  },
                },
              ],
            }),
          }),
        },
        message: 'targetRecordId must reference operation target entity "task"',
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            scope: "record",
            effect: recordPlanEffect({
              steps: [
                {
                  ...createLogStep(),
                  values: {
                    ...createLogStep().values,
                    task: {
                      kind: "reference",
                      entity: "task",
                      id: { kind: "targetRecordId" },
                    },
                    label: { kind: "targetField", field: "marker" },
                  },
                },
              ],
            }),
          }),
        },
        message: "optional target field requires an optional or defaulted destination",
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                createTaskStep(),
                {
                  ...createLogStep(),
                  values: {
                    ...createLogStep().values,
                    task: { kind: "stepOutput", step: "createTask", output: "id" },
                  },
                },
              ],
            }),
          }),
        },
        message: "must use a reference expression",
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                createTaskStep(),
                {
                  ...createLogStep(),
                  values: {
                    ...createLogStep().values,
                    task: {
                      kind: "reference",
                      entity: "task-log",
                      id: { kind: "stepOutput", step: "createTask", output: "id" },
                    },
                  },
                },
              ],
            }),
          }),
        },
        message: 'reference entity must target "task"',
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                {
                  ...createTaskStep(),
                  values: { title: { kind: "literal", value: { nested: true } } },
                },
              ],
            }),
          }),
        },
        message: "value must be a string, boolean, or finite number",
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                {
                  ...createTaskStep(),
                  values: {
                    title: {
                      kind: "generatedCode",
                      alphabet: "lowercase",
                      length: 8,
                    },
                  },
                },
              ],
            }),
          }),
        },
        message:
          "alphabet must be digits, upperAlpha, upperAlphaNumeric, or upperAlphaNumericNoConfusables",
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                {
                  ...createTaskStep(),
                  values: {
                    title: {
                      kind: "generatedCode",
                      alphabet: "upperAlphaNumeric",
                      length: 8,
                      groups: [4, 4],
                    },
                  },
                },
              ],
            }),
          }),
        },
        message: "must include exactly one of length or groups",
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                {
                  ...createTaskStep(),
                  values: {
                    title: {
                      kind: "generatedCode",
                      alphabet: "upperAlphaNumeric",
                      length: 8,
                      separator: "-",
                    },
                  },
                },
              ],
            }),
          }),
        },
        message: "separator requires groups",
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                {
                  ...createTaskStep(),
                  values: {
                    title: {
                      kind: "generatedCode",
                      alphabet: "upperAlphaNumeric",
                      groups: [4, 0],
                    },
                  },
                },
              ],
            }),
          }),
        },
        message: "groups[1] must be a positive integer",
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                {
                  ...createTaskStep(),
                  values: { title: { kind: "actor", field: "id" } },
                },
              ],
            }),
          }),
        },
        message: "field must be mode or principalId",
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                {
                  ...createTaskStep(),
                  values: { title: { kind: "source", field: "query" } },
                },
              ],
            }),
          }),
        },
        message: "field must be protocol, route, host, or path",
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                {
                  ...createLogStep(),
                  values: {
                    ...createLogStep().values,
                    task: {
                      kind: "reference",
                      entity: "task",
                      id: { kind: "stepOutput", step: "createTask", output: "id" },
                    },
                  },
                },
                createTaskStep(),
              ],
            }),
          }),
        },
        message: 'references unknown earlier step "createTask"',
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [{ ...createTaskStep(), loop: { over: "items" } }],
            }),
          }),
        },
        message: 'has unsupported key "loop"',
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                {
                  ...createTaskStep(),
                  values: { title: { kind: "code", body: "return input.title" } },
                },
              ],
            }),
          }),
        },
        message: 'has unsupported expression kind "code"',
      },
    ];

    for (const invalidCase of invalidCases) {
      expect(() => parseAppSchema(schemaWithTaskLogOperations(invalidCase.operations))).toThrow(
        invalidCase.message,
      );
    }
  });

  it("rejects invalid operation declarations", () => {
    const invalidCases = [
      {
        operations: { "bad.key": { kind: "get", scope: "record" } },
        message: "must not contain whitespace, dots, slashes, or colons",
      },
      {
        operations: { list: { kind: "list", scope: "public", target: { query: "taskAll" } } },
        message: "scope must be collection or record",
      },
      {
        operations: {
          create: {
            kind: "create",
            scope: "collection",
            input: { fields: [{ key: "missing", field: "missing" }] },
          },
        },
        message: 'references unknown field "missing"',
      },
      {
        operations: {
          create: {
            kind: "create",
            scope: "collection",
            input: { fields: [{ key: "note", type: "text", required: true }] },
          },
        },
        message: "inline scalar fields are only supported for command or list operations",
      },
      {
        operations: {
          create: {
            kind: "create",
            scope: "collection",
            output: { type: "delete" },
          },
        },
        message: 'type "delete" must match operation kind "create"',
      },
      {
        operations: {
          create: {
            kind: "create",
            scope: "collection",
            effect: { type: "patchRecord" },
          },
        },
        message: "type is only valid for update operations",
      },
      {
        operations: {
          create: {
            kind: "create",
            scope: "collection",
            policy: {
              actors: ["owner"],
              access: anonymousPublicAccess(),
            },
          },
        },
        message: "access requires anonymous actor policy",
      },
      {
        operations: {
          create: {
            kind: "create",
            scope: "collection",
            audit: { input: "full" },
          },
        },
        message: "audit input must be none, hash, summary, or snapshot",
      },
      {
        operations: {
          create: {
            kind: "create",
            scope: "collection",
            idempotency: { required: false },
          },
        },
        message: "idempotency is required for write and command operations",
      },
      {
        operations: { list: { kind: "list", scope: "collection" } },
        message: "output for list operations requires a target query or explicit output query",
      },
    ];

    for (const invalidCase of invalidCases) {
      expect(() => parseAppSchema(schemaWithTaskOperations(invalidCase.operations))).toThrow(
        invalidCase.message,
      );
    }
  });
});
function operation<T extends { key: string }>(
  definitions: readonly T[] | undefined,
  key: string,
): T {
  const definition = definitions?.find((candidate) => candidate.key === key);
  if (!definition) {
    throw new Error(`Missing operation "${key}".`);
  }
  return definition;
}
function schemaWithTaskOperations(operations: Record<string, unknown>) {
  return baseTaskSchema({
    entities: [
      {
        key: "task",
        ...taskEntity(),
        operations: keyed(operations),
      },
    ],
  });
}
function schemaWithTaskLogOperations(operations: Record<string, unknown>) {
  return baseTaskSchema({
    entities: [
      {
        key: "task",
        ...taskEntity(),
        operations: keyed(operations),
      },
      {
        key: "task-log",
        ...taskLogEntity(),
      },
    ],
  });
}
function recordPlanOperation(overrides: Record<string, unknown> = {}) {
  return {
    kind: "command",
    scope: "collection",
    input: {
      fields: [
        { key: "title", type: "text", required: true, label: "Title" },
        { key: "note", type: "text", required: false, label: "Note" },
      ],
    },
    effect: recordPlanEffect(),
    ...overrides,
  };
}

function recordPlanEffect(overrides: Record<string, unknown> = {}) {
  return {
    type: "recordPlan",
    steps: [createTaskStep(), createLogStep(), touchTaskStep()],
    ...overrides,
  };
}

function createTaskStep() {
  return {
    name: "createTask",
    kind: "create",
    entity: "task",
    recordId: { kind: "generatedId", prefix: "task" },
    values: {
      title: { kind: "input", field: "title" },
      done: { kind: "literal", value: false },
      marker: {
        kind: "generatedCode",
        alphabet: "upperAlphaNumericNoConfusables",
        groups: [4, 4],
        separator: "-",
        prefix: "ORD-",
      },
      dueDate: { kind: "generatedDate", timeZone: "Australia/Sydney" },
    },
  };
}

function createLogStep() {
  return {
    name: "createLog",
    kind: "create",
    entity: "task-log",
    values: {
      task: {
        kind: "reference",
        entity: "task",
        id: { kind: "stepOutput", step: "createTask", output: "id" },
      },
      label: { kind: "input", field: "note" },
      actorMode: { kind: "actor", field: "mode" },
      actorPrincipalId: { kind: "actor", field: "principalId" },
      sourcePath: { kind: "source", field: "path" },
      occurredAt: { kind: "generatedTimestamp" },
    },
  };
}

function touchTaskStep() {
  return {
    name: "touchTask",
    kind: "patch",
    entity: "task",
    recordId: { kind: "stepOutput", step: "createTask", output: "id" },
    values: {
      title: { kind: "stepOutput", step: "createTask", output: "field", field: "title" },
    },
  };
}

function taskLogEntity() {
  return {
    id: "entity_4ea4d9f7-3f74-4fa2-b206-845cf02bca54",
    label: "Task log",
    fields: [
      {
        key: "task",
        type: "reference",
        required: true,
        label: "Task",
        to: "task",
        displayField: "title",
      },
      { key: "label", type: "text", required: true, label: "Label" },
      { key: "actorMode", type: "text", required: true, label: "Actor mode" },
      { key: "actorPrincipalId", type: "text", required: false, label: "Actor principal" },
      { key: "sourcePath", type: "text", required: false, label: "Source path" },
      { key: "occurredAt", type: "text", required: true, label: "Occurred at" },
    ],
  };
}
function baseTaskSchema(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    entities: [
      {
        key: "task",
        ...taskEntity(),
      },
    ],
    queries: [
      { key: "taskAll", label: "All", entity: "task", expression: { kind: "all" } },
      {
        key: "taskActive",
        label: "Active",
        entity: "task",
        expression: {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: false,
        },
      },
      {
        key: "taskCompleted",
        label: "Completed",
        entity: "task",
        expression: {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: true,
        },
      },
    ],
    itemViews: [
      {
        key: "taskItem",
        entity: "task",
        fields: [
          { field: "title", editor: "text", commit: "field-commit" },
          { field: "done", editor: "boolean", commit: "immediate" },
          { field: "dueDate", editor: "date", commit: "field-commit" },
        ],
      },
    ],
    tableViews: [],
    views: [
      {
        key: "taskHome",
        ...taskHomeCollectionView(),
      },
    ],
    screens: [
      {
        key: "home",
        type: "workspace",
        label: "Tasks",
        layout: {
          type: "stack",
          sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
        },
      },
    ],
    ...overrides,
  };
}

function taskHomeCollectionView(overrides: Record<string, unknown> = {}) {
  return {
    type: "collection",
    label: "Tasks",
    entity: "task",
    queries: [{ query: "taskAll" }, { query: "taskActive" }, { query: "taskCompleted" }],
    defaultQuery: "taskAll",
    result: { type: "list", itemView: "taskItem" },
    ...overrides,
  };
}

function taskEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: "entity_7d8fac81-c764-4dd8-8466-879918744b59",
    label: "Task",
    fields: [
      { key: "title", type: "text", required: true, label: "Title" },
      { key: "done", type: "boolean", required: true, label: "Done", default: false },
      { key: "marker", type: "text", required: false, label: "Marker" },
      { key: "dueDate", type: "date", required: false, label: "Due date" },
    ],
    ...overrides,
  };
}

function anonymousPublicAccess() {
  return {
    actor: "anonymous",
    challenge: { kind: "turnstile" },
    origin: { kind: "same-origin" },
  };
}
function keyed(value: Record<string, unknown>) {
  return Object.entries(value).map(([key, definition]) => ({
    key,
    ...(definition as Record<string, unknown>),
  }));
}
