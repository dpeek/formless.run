import { setFieldDefinition } from "../test/schema-definition-test-helpers.ts";
import { describe, expect, it } from "vite-plus/test";
import {
  rateCardTestRecords,
  rateSourceSchema as rateCardSchema,
  siteSourceSchema,
  taskSourceSchema as appSchema,
} from "../test/schema-apps.ts";
import { instanceControlPlaneSchema } from "@dpeek/formless-instance-control-plane";
import { selectHomeCollectionShell } from "./collection-shell-model.ts";
import {
  selectCollectionModels,
  selectPrimaryCollectionModels,
  selectPrimaryScreenModels,
  selectRelatedCollectionModels,
  selectScreenModelByPath,
  selectScreenModels,
  type FieldTableColumnConfig,
  type HomeOperationConfig,
  type HomeScreenModel,
  type HomeViewModel,
  type TableColumnConfig,
} from "./views.ts";
import {
  isOperationHandlerEffectForSelectionCapability,
  parseAppSchema,
  type AppSchema,
  type EntityOperationEffectSchema,
  type NumericExpression,
} from "@dpeek/formless-schema";
describe("home view model collections", () => {
  it("selects the task collection and resolves query tabs in schema order", () => {
    const model = selectPrimaryCollectionModels(appSchema)[0];

    expect(model?.viewName).toBe("taskHome");
    expect(model?.label).toBe("Tasks");
    expect(model?.entityName).toBe("task");
    expect(model?.defaultQueryName).toBe("taskAll");
    expect(model?.queryTabs.map((tab) => tab.queryName)).toEqual([
      "taskAll",
      "taskActive",
      "taskCompleted",
      "taskOverdue",
    ]);
    expect(model?.queryTabs.map((tab) => tab.label)).toEqual([
      "All",
      "Active",
      "Completed",
      "Overdue",
    ]);
  });

  it("resolves result fields from the shared task item view", () => {
    const model = selectPrimaryCollectionModels(appSchema)[0];

    expect(model?.result).toMatchObject({
      type: "list",
      itemViewName: "taskListItem",
    });
    expect(
      model?.result.type === "list"
        ? model.result.recordFields.map((field) => field.fieldName)
        : [],
    ).toEqual(["title", "dueDate", "priority", "done"]);
  });

  it("propagates generated field presentation metadata into collection models", () => {
    const schema = taskSchemaWithFieldPresentations();
    const model = selectPrimaryCollectionModels(schema)[0];
    const fields = model?.result.type === "list" ? model.result.recordFields : [];
    const createOperation = model?.operations!.find((operation) => operation.type === "create");
    const createFields = createOperation?.type === "create" ? createOperation.fields : [];
    const priority = fields.find((field) => field.fieldName === "priority");
    expect(
      priority?.field.type === "enum"
        ? priority.field.values.find((definition) => definition.key === "high")!.presentation
        : undefined,
    ).toEqual({
      icon: "priority-marker",
      color: "priority.high",
    });
    expect(
      fields.map((field) => ({ fieldName: field.fieldName, presentation: field.presentation })),
    ).toEqual([
      { fieldName: "title", presentation: undefined },
      { fieldName: "dueDate", presentation: { visibility: "valueOrInteraction" } },
      { fieldName: "priority", presentation: { list: "both", mode: "iconOnly", trigger: "icon" } },
      { fieldName: "done", presentation: { mode: "completion" } },
    ]);
    expect(
      createFields.map((field) => ({
        fieldName: field.fieldName,
        presentation: field.presentation,
      })),
    ).toEqual([
      { fieldName: "title", presentation: undefined },
      { fieldName: "dueDate", presentation: { visibility: "valueOrInteraction" } },
      { fieldName: "priority", presentation: { list: "label", mode: "iconOnly", trigger: "both" } },
    ]);
  });

  it("selects system metadata displays as read-only and omits them from authoring configs", () => {
    const schema = systemMetadataUiSchema();
    const listModel = requiredCollectionModel(schema, "taskHome");
    const tableModel = requiredCollectionModel(schema, "taskTableHome");
    const createOperation = listModel.operations!.find((operation) => operation.type === "create");
    const listFields = listModel.result.type === "list" ? listModel.result.recordFields : [];
    const tableColumns = tableModel.result.type === "table" ? tableModel.result.columns : [];
    const editControl = tableColumns
      .find((column) => column.type === "operationControl")
      ?.controls.find((control) => control.type === "editRecord");

    expect(
      listFields.map((field) => ({
        fieldName: field.fieldName,
        fieldRef: field.fieldRef,
        label: field.label,
        writable: field.writable,
      })),
    ).toEqual([
      {
        fieldName: "title",
        fieldRef: { kind: "value", name: "title" },
        label: "Title",
        writable: true,
      },
      {
        fieldName: "updatedAt",
        fieldRef: { kind: "system", name: "updatedAt" },
        label: "Updated at",
        writable: false,
      },
    ]);
    expect(
      tableColumns
        .filter((column): column is FieldTableColumnConfig => column.type === "field")
        .map((column) => ({
          fieldName: column.fieldName,
          fieldRef: column.fieldRef,
          display: column.display,
          writable: column.writable,
        })),
    ).toEqual([
      {
        fieldName: "updatedAt",
        fieldRef: { kind: "system", name: "updatedAt" },
        display: "readOnly",
        writable: false,
      },
    ]);
    expect(
      createOperation?.type === "create"
        ? createOperation.fields.map((field) => field.fieldName)
        : [],
    ).toEqual(["title"]);
    expect(
      editControl?.type === "editRecord"
        ? editControl.editView.fields.map((field) => field.fieldName)
        : [],
    ).toEqual(["title"]);
  });

  it("selects generated state-machine field and transition facts", () => {
    const schema = lifecycleTaskSchema();
    const listModel = requiredCollectionModel(schema, "taskHome");
    const recordModel = requiredCollectionModel(schema, "taskRecordHome");
    const tableModel = requiredCollectionModel(schema, "taskTableHome");
    const createOperation = listModel.operations!.find((operation) => operation.type === "create");
    const listStatus =
      listModel.result.type === "list"
        ? listModel.result.recordFields.find((field) => field.fieldName === "status")
        : undefined;
    const recordStatus =
      recordModel.result.type === "record"
        ? recordModel.result.recordFields.find((field) => field.fieldName === "status")
        : undefined;
    const tableStatus =
      tableModel.result.type === "table"
        ? tableModel.result.columns.find(
            (column) => column.type === "field" && column.fieldName === "status",
          )
        : undefined;
    const tableOperationColumn =
      tableModel.result.type === "table"
        ? tableModel.result.columns.find((column) => column.type === "operationControl")
        : undefined;
    const editControl =
      tableOperationColumn?.type === "operationControl"
        ? tableOperationColumn.controls.find((control) => control.type === "editRecord")
        : undefined;

    expect(listStatus?.stateMachine).toMatchObject({
      fieldName: "status",
      machineName: "statusFlow",
      initialState: "todo",
      terminalStates: ["done"],
    });
    expect(recordStatus?.stateMachine?.machineName).toBe("statusFlow");
    expect(tableStatus?.type === "field" ? tableStatus.stateMachine?.machineName : undefined).toBe(
      "statusFlow",
    );
    expect(
      tableStatus?.type === "field"
        ? tableStatus.stateTransitionOperations?.map((operation) => operation.operationName)
        : [],
    ).toEqual(["startTask", "completeTask"]);
    expect(listModel.result.type === "list" ? listModel.result.transitionOperations : []).toEqual([
      expect.objectContaining({
        operationName: "startTask",
        operation: expect.objectContaining({ canonicalKey: "task.startTask" }),
        fieldName: "status",
        machineName: "statusFlow",
        transitionName: "start",
      }),
      expect.objectContaining({
        operationName: "completeTask",
        operation: expect.objectContaining({ canonicalKey: "task.completeTask" }),
        fieldName: "status",
        machineName: "statusFlow",
        transitionName: "complete",
      }),
    ]);
    expect(
      recordModel.result.type === "record" ? recordModel.result.transitionOperations : [],
    ).toHaveLength(2);
    expect(
      tableModel.result.type === "table" ? tableModel.result.transitionOperations : [],
    ).toHaveLength(0);
    expect(
      createOperation?.type === "create"
        ? createOperation.fields.find((field) => field.fieldName === "status")?.stateMachine
            ?.initialState
        : undefined,
    ).toBe("todo");
    expect(
      editControl?.type === "editRecord" ? editControl.editView.transitionOperations : [],
    ).toHaveLength(2);
  });

  it("keeps table transition operations unpaired when matching state field columns are hidden or absent", () => {
    const schema = lifecycleTaskSchema();
    const hiddenTableModel = requiredCollectionModel(schema, "taskHiddenStatusTableHome");
    const absentTableModel = requiredCollectionModel(schema, "taskAbsentStatusTableHome");
    const hiddenStatus =
      hiddenTableModel.result.type === "table"
        ? hiddenTableModel.result.columns.find(
            (column) => column.type === "field" && column.fieldName === "status",
          )
        : undefined;

    expect(hiddenStatus?.type === "field" ? hiddenStatus.stateTransitionOperations : []).toBe(
      undefined,
    );
    expect(
      hiddenTableModel.result.type === "table"
        ? hiddenTableModel.result.transitionOperations.map((operation) => operation.operationName)
        : [],
    ).toEqual(["startTask", "completeTask"]);
    expect(
      absentTableModel.result.type === "table"
        ? absentTableModel.result.transitionOperations.map((operation) => operation.operationName)
        : [],
    ).toEqual(["startTask", "completeTask"]);
  });

  it("exposes render-ready union variant facts for item, create, and edit views", () => {
    const schema = discriminatedTaskSchema();
    const listModel = requiredCollectionModel(schema, "taskHome");
    const editModel = requiredCollectionModel(schema, "taskEditHome");
    const createOperation = listModel.operations!.find((operation) => operation.type === "create");
    const editColumn =
      editModel.result.type === "table"
        ? editModel.result.columns.find((column) => column.type === "operationControl")
        : undefined;
    const editControl =
      editColumn?.type === "operationControl"
        ? editColumn.controls.find((control) => control.type === "editRecord")
        : undefined;

    expect(
      listModel.result.type === "list" ? listModel.result.recordUnion : undefined,
    ).toMatchObject({
      unionName: "taskByKind",
      discriminatorFieldName: "kind",
      variants: [
        {
          variantValue: "role",
          label: "Role",
          presentation: {
            type: "fields",
            fields: [{ fieldName: "title", editor: "text", commit: "field-commit" }],
          },
        },
        {
          variantValue: "stream",
          label: "Stream",
          presentation: {
            type: "contextLink",
            labelFieldName: "title",
            target: { kind: "selectContext", contextName: "task", record: "self" },
          },
        },
      ],
      fallback: {
        label: "Task",
        presentation: {
          type: "fields",
          fields: [{ fieldName: "kind", editor: "enum", commit: "immediate" }],
        },
      },
    });
    expect(createOperation?.type === "create" ? createOperation.union : undefined).toMatchObject({
      unionName: "taskByKind",
      discriminatorFieldName: "kind",
      variants: [
        {
          variantValue: "role",
          presentation: {
            type: "fields",
            fields: [{ fieldName: "title", editor: "text" }],
          },
        },
        {
          variantValue: "stream",
          presentation: {
            type: "fields",
            fields: [{ fieldName: "done", editor: "boolean" }],
          },
        },
      ],
    });
    expect(
      editControl?.type === "editRecord" ? editControl.editView.union : undefined,
    ).toMatchObject({
      unionName: "taskByKind",
      variants: [
        {
          variantValue: "role",
          presentation: {
            type: "fields",
            fields: [{ fieldName: "title", editor: "text", commit: "field-commit" }],
          },
        },
        {
          variantValue: "stream",
          presentation: {
            type: "fields",
            fields: [{ fieldName: "done", editor: "boolean", commit: "immediate" }],
          },
        },
      ],
    });
  });

  it("exposes literal create defaults for fixed discriminator create operations", () => {
    const model = requiredCollectionModel(
      discriminatedTaskSchema({ fixedCreateKind: "stream" }),
      "taskHome",
    );
    const createOperation = model.operations!.find((operation) => operation.type === "create");
    expect(createOperation?.type === "create" ? createOperation.fields : []).toMatchObject([
      {
        fieldName: "title",
        editor: "text",
      },
    ]);
    expect(createOperation?.type === "create" ? createOperation.defaults : []).toMatchObject([
      {
        fieldName: "kind",
        value: { kind: "literal", value: "stream" },
      },
    ]);
    expect(createOperation?.type === "create" ? createOperation.union : undefined).toMatchObject({
      discriminatorFieldName: "kind",
      variants: [
        {
          variantValue: "role",
          presentation: {
            type: "fields",
            fields: [{ fieldName: "title" }],
          },
        },
        {
          variantValue: "stream",
          presentation: {
            type: "fields",
            fields: [{ fieldName: "done" }],
          },
        },
      ],
    });
  });

  it("resolves collection operation bindings and clear-completed command target query", () => {
    const model = selectPrimaryCollectionModels(appSchema)[0];

    expect(model?.operations.map((operation) => operation.label)).toEqual([
      "Create Task",
      "Clear completed",
    ]);

    const create = model?.operations[0];
    const clearCompleted = model?.operations[1];

    expect(create).toMatchObject({
      type: "create",
      operationName: "create",
      operation: {
        canonicalKey: "task.create",
        operation: { kind: "create" },
      },
      enabled: true,
    });
    expect(create?.type === "create" ? create.fields.map((field) => field.fieldName) : []).toEqual([
      "title",
      "dueDate",
      "priority",
    ]);
    expect(create?.type === "create" ? create.defaults : []).toEqual([]);
    expect(clearCompleted).toMatchObject({
      type: "command",
      operationName: "clearCompletedTasks",
      operation: {
        canonicalKey: "task.clearCompletedTasks",
        operation: {
          kind: "command",
          effect: {
            type: "operationHandler",
            handler: "tombstone-query-results",
            config: { query: "taskCompleted" },
          },
          target: { query: "taskCompleted" },
        },
      },
      ui: {
        showAffectedCountOnSuccess: true,
        targetCount: {
          display: { type: "count" },
          query: appSchema.queries.find((definition) => definition.key === "taskCompleted")
            ?.expression,
          ariaLabel: "Clear completed target count",
        },
      },
    });
  });
  it("uses default generated UI facts for non-target-count command operations", () => {
    const rateHome = rateCardSchema.views.find((definition) => definition.key === "rateHome")!;
    if (rateHome?.type !== "collection") {
      throw new Error("Missing rate home collection view.");
    }
    const schema: AppSchema = {
      ...rateCardSchema,
      views: rateCardSchema.views.map((view) =>
        view.key === "rateHome"
          ? {
              ...rateHome,
              operations: [
                {
                  operation: "rate.regenerateMissingRates",
                  count: { type: "count" },
                },
              ],
              key: "rateHome",
            }
          : view,
      ),
    };
    const model = requiredCollectionModel(schema, "rateHome");
    const operation = model.operations[0];

    expect(operation).toMatchObject({
      type: "command",
      label: "Regenerate missing rates",
      entityName: "rate",
      operationName: "regenerateMissingRates",
      operation: {
        canonicalKey: "rate.regenerateMissingRates",
        operation: {
          kind: "command",
          effect: {
            type: "operationHandler",
            handler: "create-missing-join-records",
          },
        },
      },
      ui: {
        showAffectedCountOnSuccess: true,
      },
    });
    expect(operation?.type === "command" ? operation.ui.targetCount : undefined).toBeUndefined();
  });
  it("does not synthesize collection toolbar controls from handler capabilities", () => {
    const taskHome = appSchema.views.find((definition) => definition.key === "taskHome")!;
    if (taskHome?.type !== "collection") {
      throw new Error("Missing task home collection view.");
    }
    const schema: AppSchema = {
      ...appSchema,
      views: appSchema.views.map((view) =>
        view.key === "taskHome" ? { ...taskHome, operations: undefined } : view,
      ),
      entities: appSchema.entities.map((entity) =>
        entity.key === "task"
          ? ({
              ...entity,
              operations: undefined,
              key: entity.key,
            } as AppSchema["entities"][number])
          : entity,
      ),
    };
    const model = requiredCollectionModel(schema, "taskHome");
    expect(model.operations).toEqual([]);
  });
  it("selects command toolbar controls from operation bindings", () => {
    const model = requiredCollectionModel(appSchema, "taskHome");
    const clearCompleted = model.operations!.find(
      (operation) =>
        operation.type === "command" && operation.operationName === "clearCompletedTasks",
    );

    expect(clearCompleted).toMatchObject({
      type: "command",
      label: "Clear completed",
      operation: {
        canonicalKey: "task.clearCompletedTasks",
        operation: {
          kind: "command",
          effect: {
            type: "operationHandler",
            handler: "tombstone-query-results",
            config: { query: "taskCompleted" },
          },
        },
      },
      ui: {
        targetCount: {
          query: appSchema.queries.find((definition) => definition.key === "taskCompleted")
            ?.expression,
        },
      },
    });
  });
  it("filters bound collection operations through browser visibility", () => {
    const taskHome = appSchema.views.find((definition) => definition.key === "taskHome")!;
    const task = appSchema.entities.find((definition) => definition.key === "task")!;
    if (taskHome?.type !== "collection" || !task) {
      throw new Error("Missing task home collection view.");
    }
    const schema = parseAppSchema({
      ...appSchema,
      entities: appSchema.entities.map((entity) =>
        entity.key === "task"
          ? {
              ...task,
              operations: [
                ...(task.operations ?? []),
                {
                  key: "runnerApply",
                  label: "Runner apply",
                  kind: "command",
                  scope: "collection",
                  effect: {
                    type: "operationHandler",
                    handler: "tombstone-query-results",
                    config: { query: "taskCompleted" },
                  },
                  output: { type: "command" },
                  idempotency: { required: true },
                  audit: { input: "summary" },
                  policy: { actors: ["runner"] },
                },
                {
                  key: "cliDeploy",
                  label: "CLI deploy",
                  kind: "command",
                  scope: "collection",
                  effect: {
                    type: "operationHandler",
                    handler: "tombstone-query-results",
                    config: { query: "taskCompleted" },
                  },
                  output: { type: "command" },
                  idempotency: { required: true },
                  audit: { input: "summary" },
                  policy: { actors: ["cliDeployer"] },
                },
                {
                  key: "hiddenReview",
                  label: "Hidden review",
                  kind: "command",
                  scope: "collection",
                  effect: {
                    type: "operationHandler",
                    handler: "tombstone-query-results",
                    config: { query: "taskCompleted" },
                  },
                  output: { type: "command" },
                  idempotency: { required: true },
                  audit: { input: "summary" },
                  policy: { actors: ["owner"], visible: false },
                },
                {
                  key: "ownerReview",
                  label: "Owner review",
                  kind: "command",
                  scope: "collection",
                  effect: {
                    type: "operationHandler",
                    handler: "tombstone-query-results",
                    config: { query: "taskCompleted" },
                  },
                  output: { type: "command" },
                  idempotency: { required: true },
                  audit: { input: "summary" },
                  policy: { actors: ["owner"] },
                },
                {
                  key: "adminReview",
                  label: "Admin review",
                  kind: "command",
                  scope: "collection",
                  effect: {
                    type: "operationHandler",
                    handler: "tombstone-query-results",
                    config: { query: "taskCompleted" },
                  },
                  output: { type: "command" },
                  idempotency: { required: true },
                  audit: { input: "summary" },
                  policy: { actors: ["admin"] },
                },
              ],
              key: "task",
            }
          : entity,
      ),
      views: appSchema.views.map((view) =>
        view.key === "taskHome"
          ? {
              ...taskHome,
              operations: [
                ...(taskHome.operations ?? []),
                { operation: "task.runnerApply" },
                { operation: "task.cliDeploy" },
                { operation: "task.hiddenReview" },
                { operation: "task.ownerReview" },
                { operation: "task.adminReview" },
              ],
              key: "taskHome",
            }
          : view,
      ),
    });
    const model = requiredCollectionModel(schema, "taskHome");
    expect(model.operations.map((operation) => operation.label)).toEqual([
      "Create Task",
      "Clear completed",
      "Owner review",
      "Admin review",
    ]);
  });

  it("characterizes the task primary home model contract", () => {
    const model = selectPrimaryCollectionModels(appSchema)[0];

    if (!model) {
      throw new Error("Missing task home model.");
    }

    expect(summarizeHomeModel(model)).toEqual({
      viewName: "taskHome",
      label: "Tasks",
      entityName: "task",
      navigationPrimary: true,
      context: null,
      queries: [
        { queryName: "taskAll", label: "All", count: "count", expressionKind: "all" },
        { queryName: "taskActive", label: "Active", count: "count", expressionKind: "where" },
        {
          queryName: "taskCompleted",
          label: "Completed",
          count: "count",
          expressionKind: "where",
        },
        { queryName: "taskOverdue", label: "Overdue", count: "count", expressionKind: "and" },
      ],
      defaultQueryName: "taskAll",
      result: {
        type: "list",
        itemViewName: "taskListItem",
        fields: ["title", "dueDate", "priority", "done"],
      },
      operations: [
        {
          type: "create",
          label: "Create Task",
          entityName: "task",
          fields: ["title", "dueDate", "priority"],
          defaults: [],
          enabled: true,
        },
        {
          type: "command",
          label: "Clear completed",
          entityName: "task",
          operationName: "clearCompletedTasks",
          operationKey: "task.clearCompletedTasks",
          commandHandlerCapability: "tombstoneQueryResultsTargetCount",
          showAffectedCountOnSuccess: true,
          targetCountQueryKind: "where",
          targetCountDisplay: "count",
        },
      ],
    });
  });

  it("uses query slot labels when provided", () => {
    const schema: AppSchema = {
      ...appSchema,
      views: appSchema.views.map((view) =>
        view.key === "taskHome"
          ? {
              ...(view as Extract<
                AppSchema["views"][number],
                {
                  type: "collection";
                }
              >),
              queries: [{ query: "taskAll", label: "Everything" }],
            }
          : view,
      ),
    };
    const model = selectPrimaryCollectionModels(schema)[0];
    expect(model?.queryTabs.map((tab) => tab.label)).toEqual(["Everything"]);
  });
  it("exposes render-ready collection facts behind the home collection model", () => {
    const model = requiredCollectionModel(rateCardSchema, "rateHome");
    expect(model?.collection).toMatchObject({
      entityName: "rate",
      queries: {
        defaultQueryName: "ratesForSelectedCard",
        defaultTab: {
          queryName: "ratesForSelectedCard",
          query: rateCardSchema.queries.find(
            (definition) => definition.key === "ratesForSelectedCard",
          )?.expression,
          count: { type: "count" },
        },
      },
      context: {
        name: "card",
        entityName: "card",
        presentation: "tabs",
      },
      result: {
        type: "table",
        tableViewName: "rateTable",
        footer: [
          {
            columnKey: "field:cost",
            aggregateName: "selectedCardAverageCost",
          },
          {
            columnKey: "field:price",
            aggregateName: "selectedCardAveragePrice",
          },
          {
            columnKey: "computed:rateMargin",
            aggregateName: "selectedCardAverageMargin",
          },
        ],
      },
      operations: [{ type: "create", entityName: "resource" }],
    });
    expect(model?.collection.context).toBe(model?.context);
    expect(model?.collection.queries.tabs).toBe(model?.queryTabs);
    expect(model?.collection.result).toBe(model?.result);
    expect(model?.collection.operations).toBe(model?.operations);
  });
  it("selects collection shell facts separately from result-kind facts", () => {
    const schema = rateCardSchemaWithAggregateSummarySlots();
    const collectionView = schema.views.find((definition) => definition.key === "rateHome")!;
    if (collectionView?.type !== "collection") {
      throw new Error("Missing rate home collection view.");
    }
    const entity = schema.entities.find((definition) => definition.key === collectionView.entity)!;
    if (!entity) {
      throw new Error(`Missing entity "${collectionView.entity}".`);
    }
    const shell = selectHomeCollectionShell(
      schema,
      schema.views.map((view) => [view.key, view]),
      collectionView,
      entity,
    );

    expect("result" in shell).toBe(false);
    expect(shell).toMatchObject({
      entityName: "rate",
      context: {
        name: "card",
        entityName: "card",
        queryName: "cardAll",
        presentation: "tabs",
      },
      queries: {
        defaultQueryName: "ratesForSelectedCard",
        defaultTab: {
          queryName: "ratesForSelectedCard",
          count: { type: "count" },
        },
      },
      operations: [{ type: "create", entityName: "resource" }],
      summary: [
        { aggregateName: "selectedCardCostTotal", label: "Cost total" },
        { aggregateName: "selectedCardAverageMargin", label: "Average margin" },
      ],
    });
  });
  it("exposes selected collection context presentation", () => {
    const rateHome = rateCardSchema.views.find((definition) => definition.key === "rateHome")!;
    if (rateHome?.type !== "collection" || !rateHome.context) {
      throw new Error("Missing rate home context.");
    }
    const schema: AppSchema = {
      ...rateCardSchema,
      views: rateCardSchema.views.map((view) =>
        view.key === "rateHome"
          ? {
              ...rateHome,
              context: {
                ...rateHome.context!,
                presentation: "listDetail",
              } as NonNullable<typeof rateHome.context>,
              key: "rateHome",
            }
          : view,
      ),
    };
    const model = requiredCollectionModel(schema, "rateHome");
    expect(requiredCollectionModel(rateCardSchema, "rateHome").context?.presentation).toBe("tabs");
    expect(model.context?.presentation).toBe("listDetail");
    expect(model.collection.context).toBe(model.context);
  });

  it("selects every collection model in schema order", () => {
    const models = selectCollectionModels(rateCardSchema);

    expect(models.map((model) => model.viewName)).toEqual(["resourceHome", "cardHome", "rateHome"]);
    expect(models.map((model) => model.label)).toEqual(["Resources", "Rate cards", "Rates"]);
    expect(models.map((model) => model.navigation.primary)).toEqual([true, true, true]);
    expect(models.map((model) => model.operations[0]?.label)).toEqual([
      "Create Resource",
      "Create Rate card",
      "Create Resource",
    ]);
    expect(
      models[0]?.result.type === "list"
        ? models[0].result.recordFields.map((field) => field.fieldName)
        : [],
    ).toEqual(["name", "kind", "unit"]);
    expect(
      models[1]?.result.type === "list"
        ? models[1].result.recordFields.map((field) => field.fieldName)
        : [],
    ).toEqual(["name", "isDefault", "marginMin", "marginMed", "marginMax"]);
    expect(models[2]?.result).toMatchObject({
      type: "table",
      tableViewName: "rateTable",
    });
    expect(
      models[2]?.result.type === "table"
        ? models[2].result.columns.map((column) => column.key)
        : [],
    ).toEqual([
      "referenceField:resource.name",
      "field:cost",
      "field:costUnit",
      "field:price",
      "computed:rateMargin",
    ]);
    expect(
      models[2]?.result.type === "table"
        ? findFieldTableColumn(models[2].result.columns, "cost")?.valueUnit
        : undefined,
    ).toMatchObject({
      unitFieldName: "costUnit",
      unitField: rateCardSchema.entities
        .find((definition) => definition.key === "rate")
        ?.fields.find((definition) => definition.key === "costUnit")!,
    });
    expect(
      models[2]?.result.type === "table"
        ? findFieldTableColumn(models[2].result.columns, "price")?.valueUnit
        : undefined,
    ).toBeUndefined();
  });
  it("selects primary rate screens without collection navigation hints", () => {
    const collectionNavigation = ["resourceHome", "cardHome", "rateHome"].map((viewName) => {
      const view = rateCardSchema.views.find((definition) => definition.key === viewName)!;
      return view?.type === "collection" ? view.navigation : "missing";
    });
    expect(collectionNavigation).toEqual([undefined, undefined, undefined]);
    expect(selectPrimaryCollectionModels(rateCardSchema).map((model) => model.viewName)).toEqual([
      "resourceHome",
      "cardHome",
      "rateHome",
    ]);
    expect(selectPrimaryScreenModels(rateCardSchema).map((model) => model.screenName)).toEqual([
      "rateHome",
      "rateSetup",
    ]);
  });

  it("characterizes the rate-card setup collection model contracts", () => {
    const models = [
      requiredCollectionModel(rateCardSchema, "resourceHome"),
      requiredCollectionModel(rateCardSchema, "cardHome"),
    ];

    expect(models.map(summarizeHomeModel)).toEqual([
      {
        viewName: "resourceHome",
        label: "Resources",
        entityName: "resource",
        navigationPrimary: true,
        context: null,
        queries: [
          { queryName: "resourceAll", label: "All", count: "count", expressionKind: "all" },
        ],
        defaultQueryName: "resourceAll",
        result: {
          type: "list",
          itemViewName: "resourceListItem",
          fields: ["name", "kind", "unit"],
        },
        operations: [
          {
            type: "create",
            label: "Create Resource",
            entityName: "resource",
            fields: ["name"],
            defaults: [],
            enabled: true,
          },
        ],
      },
      {
        viewName: "cardHome",
        label: "Rate cards",
        entityName: "card",
        navigationPrimary: true,
        context: null,
        queries: [{ queryName: "cardAll", label: "All", count: "count", expressionKind: "all" }],
        defaultQueryName: "cardAll",
        result: {
          type: "list",
          itemViewName: "cardListItem",
          fields: ["name", "isDefault", "marginMin", "marginMed", "marginMax"],
        },
        operations: [
          {
            type: "create",
            label: "Create Rate card",
            entityName: "card",
            fields: ["name"],
            defaults: [],
            enabled: true,
          },
        ],
      },
    ]);
  });

  it("resolves rate-card table columns with labels, editors, and alignment", () => {
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "rateHome",
    );
    const columns = rateModel?.result.type === "table" ? rateModel.result.columns : [];

    expect(columns.map((column) => column.label)).toEqual([
      "Role",
      "Cost",
      "Cost unit",
      "Price",
      "Margin",
    ]);
    expect(tableColumnEditors(columns)).toEqual(["text", "number", "enum", "number", null]);
    expect(tableColumnCommits(columns)).toEqual([
      "field-commit",
      "field-commit",
      "immediate",
      "field-commit",
      null,
    ]);
    expect(columns.map((column) => column.align ?? "start")).toEqual([
      "start",
      "end",
      "start",
      "end",
      "end",
    ]);
    expect(columns.map((column) => column.width ?? "none")).toEqual(["lg", "sm", "xs", "sm", "sm"]);
    expect(columns.map((column) => column.display)).toEqual([
      "editor",
      "editor",
      "hidden",
      "editor",
      "readOnly",
    ]);
    expect(columns.map((column) => column.suffix ?? "")).toEqual(["", "", "", "/ day", ""]);
    expect(columns.map((column) => column.format)).toEqual([
      "plain",
      "number",
      "plain",
      "currency",
      "percent",
    ]);
    expect(columns[0]).toMatchObject({
      type: "referenceField",
      key: "referenceField:resource.name",
      sourceReferenceFieldName: "resource",
      referencedEntityName: "resource",
      fieldName: "name",
      field: rateCardSchema.entities
        .find((definition) => definition.key === "resource")
        ?.fields.find((definition) => definition.key === "name")!,
    });
  });
  it("resolves table operation bindings to render-ready operation control facts", () => {
    const schema = parseAppSchema({
      ...rateCardSchema,
      entities: rateCardSchema.entities.map((entity) =>
        entity.key === "rate"
          ? {
              ...entity,
              operations: [
                ...(rateCardSchema.entities.find((definition) => definition.key === "rate")!
                  .operations ?? []),
                {
                  ...tableStaticUpdateOperation("Inspect rate"),
                  key: "inspectRate",
                },
                {
                  ...tableStaticUpdateOperation("Blocked rate"),
                  key: "blockedRate",
                },
                {
                  ...tableStaticUpdateOperation("Hidden rate"),
                  key: "hiddenRate",
                },
              ],
              key: "rate",
            }
          : entity,
      ),
      tableViews: rateCardSchema.tableViews.map((tableView) =>
        tableView.key === "rateTable"
          ? {
              ...tableView,
              operations: [
                { operation: "rate.inspectRate", label: "Inspect rate" },
                {
                  operation: "rate.blockedRate",
                  label: "Blocked rate",
                  availability: { state: "disabled", reason: "No selected card" },
                },
                {
                  operation: "rate.hiddenRate",
                  label: "Hidden rate",
                  availability: { state: "hidden" },
                },
              ],
              columns: [
                ...rateCardSchema.tableViews.find((definition) => definition.key === "rateTable")!
                  .columns,
                { type: "operationControl", operation: "rate.inspectRate" },
                {
                  type: "operationControl",
                  operations: ["rate.inspectRate", "rate.blockedRate", "rate.hiddenRate"],
                  label: "Rate operations",
                },
              ],
              key: "rateTable",
            }
          : tableView,
      ),
    });
    const rateModel = selectCollectionModels(schema).find((model) => model.viewName === "rateHome");
    const columns = rateModel?.result.type === "table" ? rateModel.result.columns : [];
    const singleOperationColumn = columns.at(-2);
    const multipleOperationColumn = columns.at(-1);

    expect(singleOperationColumn).toMatchObject({
      type: "operationControl",
      key: "operationControl:rate.inspectRate",
      label: "",
      headerLabel: "Inspect rate",
      align: "end",
      width: "xs",
      display: "readOnly",
      presentation: "button",
      controls: [
        {
          bindingName: "rate.inspectRate",
          operation: { canonicalKey: "rate.inspectRate" },
          label: "Inspect rate",
          variant: "default",
          disabled: false,
        },
      ],
    });
    expect(multipleOperationColumn).toMatchObject({
      type: "operationControl",
      key: "operationControl:rate.inspectRate,rate.blockedRate,rate.hiddenRate",
      label: "Rate operations",
      headerLabel: "Rate operations",
      presentation: "dropdown",
      controls: [
        {
          bindingName: "rate.inspectRate",
          operation: { canonicalKey: "rate.inspectRate" },
          label: "Inspect rate",
          variant: "default",
          disabled: false,
        },
        {
          bindingName: "rate.blockedRate",
          operation: { canonicalKey: "rate.blockedRate" },
          label: "Blocked rate",
          variant: "default",
          disabled: true,
          disabledReason: "No selected card",
        },
      ],
    });
  });

  it("resolves editRecord table controls to edit operation dialog facts", () => {
    const schema = parseAppSchema({
      ...rateCardSchema,
      tableViews: rateCardSchema.tableViews.map((tableView) =>
        tableView.key === "rateTable"
          ? {
              ...tableView,
              operations: [
                {
                  operation: "resource.update",
                  label: "Edit resource",
                  target: { kind: "reference", field: "resource" },
                  editView: "resourceEdit",
                },
              ],
              columns: [
                ...rateCardSchema.tableViews.find((definition) => definition.key === "rateTable")!
                  .columns,
                { type: "operationControl", operation: "resource.update" },
              ],
              key: "rateTable",
            }
          : tableView,
      ),
      views: [
        ...rateCardSchema.views,
        {
          key: "resourceEdit",
          type: "edit",
          entity: "resource",
          fields: [
            { field: "name", editor: "text", commit: "field-commit" },
            { field: "unit", editor: "enum", commit: "immediate" },
          ],
        },
      ],
    });
    const rateModel = selectCollectionModels(schema).find((model) => model.viewName === "rateHome");
    const columns = rateModel?.result.type === "table" ? rateModel.result.columns : [];
    const operationColumn = columns.at(-1);

    expect(operationColumn).toMatchObject({
      type: "operationControl",
      controls: [
        {
          type: "editRecord",
          bindingName: "resource.update",
          label: "Edit resource",
          operation: { canonicalKey: "resource.update" },
          target: {
            kind: "reference",
            fieldName: "resource",
            entityName: "resource",
          },
          editView: {
            viewName: "resourceEdit",
            entityName: "resource",
            fields: [
              { fieldName: "name", editor: "text", commit: "field-commit" },
              { fieldName: "unit", editor: "enum", commit: "immediate" },
            ],
          },
        },
      ],
    });
  });

  it("resolves table ordering facts and auto-inserted move menus", () => {
    const schema = rateCardSchemaWithOrdering();
    const rateModel = requiredCollectionModel(schema, "rateHome");
    const result = rateModel.result;

    if (result.type !== "table") {
      throw new Error("Missing rate table model.");
    }
    expect(result.ordering).toMatchObject({
      fieldName: "sortOrder",
      field: schema.entities
        .find((definition) => definition.key === "rate")
        ?.fields.find((definition) => definition.key === "sortOrder")!,
      scope: [{ kind: "field", fieldName: "card" }],
      presentations: ["moveMenu"],
    });
    expect(result.columns.at(-1)).toMatchObject({
      type: "operationControl",
      key: "operationControl:ordering",
      label: "",
      headerLabel: "Actions",
      controls: [],
      presentation: "dropdown",
      includeOrdering: true,
      ordering: {
        fieldName: "sortOrder",
        scope: [{ fieldName: "card" }],
      },
      align: "end",
      width: "xs",
      display: "readOnly",
    });
  });

  it("auto-inserts ordering handles when drag handles are requested", () => {
    const schema = rateCardSchemaWithDragOrdering();
    const rateModel = requiredCollectionModel(schema, "rateHome");
    const result = rateModel.result;

    if (result.type !== "table") {
      throw new Error("Missing rate table model.");
    }

    expect(result.ordering?.presentations).toEqual(["dragHandle"]);
    expect(result.columns[0]).toMatchObject({
      type: "orderingHandle",
      key: "orderingHandle",
      label: "",
      headerLabel: "Reorder",
      align: "center",
      width: "xs",
      display: "readOnly",
    });
    expect(result.columns.some((column) => column.key === "operationControl:ordering")).toBe(false);
  });

  it("resolves result-level ordering models for list, table, and tree results", () => {
    const ordering = {
      field: "sortOrder",
      scope: [{ kind: "field" as const, field: "card" }],
      presentations: ["moveMenu" as const],
    };
    const listSchema = rateCardSchemaWithRateHomeResult({
      type: "list",
      itemView: "rateListItem",
      ordering,
    });
    const tableSchema = rateCardSchemaWithRateHomeResult({
      type: "table",
      tableView: "rateTable",
      ordering,
    });
    const siteHome = siteSourceSchema.views.find(
      (definition) => definition.key === "siteCompositionHome",
    )!;
    if (siteHome?.type !== "collection" || siteHome.result.type !== "tree") {
      throw new Error("Missing site tree fixture.");
    }
    const treeSchema = parseAppSchema({
      ...siteSourceSchema,
      views: siteSourceSchema.views.map((view) =>
        view.key === "siteCompositionHome"
          ? {
              ...siteHome,
              result: {
                ...siteHome.result,
                ordering: {
                  field: "order",
                  scope: [{ kind: "field", field: "parent" }],
                  presentations: ["dragHandle"],
                },
              },
              key: "siteCompositionHome",
            }
          : view,
      ),
    });
    const listResult = requiredCollectionModel(listSchema, "rateHome").result;
    const tableResult = requiredCollectionModel(tableSchema, "rateHome").result;
    const treeResult = requiredCollectionModel(treeSchema, "siteCompositionHome").result;

    expect(listResult.type === "list" ? listResult.ordering : undefined).toMatchObject({
      fieldName: "sortOrder",
      scope: [{ fieldName: "card" }],
      presentations: ["moveMenu"],
    });
    expect(tableResult.type === "table" ? tableResult.ordering : undefined).toMatchObject({
      fieldName: "sortOrder",
      scope: [{ fieldName: "card" }],
      presentations: ["moveMenu"],
    });
    expect(tableResult.type === "table" ? tableResult.columns.at(-1) : undefined).toMatchObject({
      type: "operationControl",
      key: "operationControl:ordering",
    });
    expect(listResult.type === "list" ? listResult.updateOperation?.canonicalKey : undefined).toBe(
      "rate.update",
    );
    expect(
      tableResult.type === "table" ? tableResult.updateOperation?.canonicalKey : undefined,
    ).toBe("rate.update");
    expect(treeResult.type === "tree" ? treeResult.ordering : undefined).toMatchObject({
      fieldName: "order",
      scope: [{ fieldName: "parent" }],
      presentations: ["dragHandle"],
    });
    expect(
      treeResult.type === "tree" ? treeResult.placementUpdateOperation?.canonicalKey : undefined,
    ).toBe("block-placement.update");
  });
  it("resolves tree branch policy model facts from the child item view union", () => {
    const siteHome = siteSourceSchema.views.find(
      (definition) => definition.key === "siteCompositionHome",
    )!;
    if (siteHome?.type !== "collection" || siteHome.result.type !== "tree") {
      throw new Error("Missing site tree fixture.");
    }
    const treeSchema = parseAppSchema({
      ...siteSourceSchema,
      views: siteSourceSchema.views.map((view) =>
        view.key === "siteCompositionHome"
          ? {
              ...siteHome,
              result: {
                ...siteHome.result,
                branches: {
                  variants: {
                    page: {
                      children: ["group", "markdown"],
                    },
                    header: {
                      action: "leaf",
                      children: ["link"],
                    },
                    footer: "leaf",
                  },
                },
              },
              key: "siteCompositionHome",
            }
          : view,
      ),
    });
    const treeResult = requiredCollectionModel(treeSchema, "siteCompositionHome").result;
    expect(treeResult.type === "tree" ? treeResult.childRecordUnion?.unionName : undefined).toBe(
      "blockByType",
    );
    expect(treeResult.type === "tree" ? treeResult.branches : undefined).toMatchObject({
      variants: {
        discriminatorFieldName: "type",
        leafVariantValues: ["header", "footer"],
        allowedChildVariantsByParentVariant: {
          page: [
            {
              variantValue: "group",
              label: "Group",
            },
            {
              variantValue: "markdown",
              label: "Markdown",
            },
          ],
          header: [
            {
              variantValue: "link",
              label: "Link",
            },
          ],
        },
      },
    });
    expect(
      treeResult.type === "tree" ? treeResult.branches?.variants.discriminatorField.values : [],
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "header", label: "Header" }),
        expect.objectContaining({ key: "footer", label: "Footer" }),
      ]),
    );
  });
  it("resolves Site tree add policy for post and project authoring", () => {
    const treeResult = requiredCollectionModel(siteSourceSchema, "siteCompositionHome").result;
    if (treeResult.type !== "tree") {
      throw new Error("Missing Site tree model.");
    }

    const allowedChildVariants = Object.fromEntries(
      Object.entries(treeResult.branches?.variants.allowedChildVariantsByParentVariant ?? {}).map(
        ([parentVariant, children]) => [parentVariant, children.map((child) => child.variantValue)],
      ),
    );

    expect(allowedChildVariants).toEqual({
      page: [
        "group",
        "section",
        "hero",
        "feature",
        "cardGrid",
        "metricGrid",
        "markdown",
        "image",
        "link",
        "project",
        "postList",
        "projectList",
        "subscribeForm",
        "contactForm",
        "publicOperationForm",
      ],
      group: [
        "group",
        "section",
        "hero",
        "feature",
        "cardGrid",
        "metricGrid",
        "markdown",
        "image",
        "link",
        "project",
        "postList",
        "projectList",
        "subscribeForm",
        "contactForm",
        "publicOperationForm",
      ],
      section: [
        "group",
        "section",
        "hero",
        "feature",
        "cardGrid",
        "metricGrid",
        "markdown",
        "image",
        "link",
        "project",
        "postList",
        "projectList",
        "subscribeForm",
        "contactForm",
        "publicOperationForm",
      ],
      cardGrid: ["card"],
      metricGrid: ["metric"],
      post: ["markdown", "image"],
      project: ["image"],
      feature: ["image", "link"],
      header: ["headerPrimary", "headerSecondary"],
      headerPrimary: ["link"],
      headerSecondary: ["link"],
      footer: ["footerSection", "footerSocial", "link"],
      footerSection: ["link"],
      footerSocial: ["link"],
    });
    expect(
      treeResult.branches?.variants.allowedChildVariantsByParentVariant.post?.find(
        (child) => child.label === "Primary image",
      ),
    ).toMatchObject({
      variantValue: "image",
      placementValues: { slot: "primaryImage" },
    });
    expect(
      treeResult.branches?.variants.allowedChildVariantsByParentVariant.feature?.map((child) => ({
        label: child.label,
        variantValue: child.variantValue,
        placementValues: child.placementValues,
      })),
    ).toEqual([
      {
        label: "Feature image",
        variantValue: "image",
        placementValues: { slot: "media" },
      },
      {
        label: "Action link",
        variantValue: "link",
        placementValues: { slot: "actions" },
      },
    ]);
    expect(treeResult.branches?.variants.leafVariantValues).not.toContain("project");
    expect(treeResult.branches?.variants.leafVariantValues).not.toContain("feature");
    expect(treeResult.branches?.variants.leafVariantValues).toContain("postList");
    expect(treeResult.branches?.variants.leafVariantValues).toContain("projectList");
    expect(treeResult.branches?.variants.leafVariantValues).toContain("subscribeForm");
    expect(treeResult.branches?.variants.leafVariantValues).toContain("contactForm");
    expect(treeResult.branches?.variants.leafVariantValues).toContain("publicOperationForm");
    expect(treeResult.childRecordUnion?.variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          variantValue: "project",
          presentation: {
            type: "fields",
            fields: expect.arrayContaining([
              expect.objectContaining({ fieldName: "date", editor: "date" }),
              expect.objectContaining({ fieldName: "body", editor: "markdown" }),
              expect.objectContaining({ fieldName: "href", editor: "href" }),
            ]),
          },
        }),
      ]),
    );
  });

  it("resolves Site tree composition operation bindings", () => {
    const treeResult = requiredCollectionModel(siteSourceSchema, "siteCompositionHome").result;

    expect(treeResult.type === "tree" ? treeResult.composition : undefined).toMatchObject({
      create: {
        operationName: "addTreeChild",
        operation: {
          canonicalKey: "block-placement.addTreeChild",
          operation: {
            kind: "command",
            scope: "record",
            effect: {
              type: "operationHandler",
              handler: "create-tree-child",
              config: {
                relationship: "blockPlacements",
                childField: "block",
                orderField: "order",
              },
            },
          },
        },
        effect: {
          type: "operationHandler",
          handler: "create-tree-child",
          config: {
            relationship: "blockPlacements",
            childField: "block",
            orderField: "order",
          },
        },
      },
      remove: {
        operationName: "removeTreePlacement",
        operation: {
          canonicalKey: "block-placement.removeTreePlacement",
          operation: {
            kind: "command",
            scope: "record",
            effect: {
              type: "operationHandler",
              handler: "remove-tree-placement",
              config: { relationship: "blockPlacements" },
            },
          },
        },
        effect: {
          type: "operationHandler",
          handler: "remove-tree-placement",
          config: { relationship: "blockPlacements" },
        },
      },
    });
  });
  it("declares Site source operations and authoring operation bindings", () => {
    const siteEntityOperations = Object.fromEntries(
      siteSourceSchema.entities.map((entity) => [
        entity.key,
        (entity.operations ?? []).map(({ key }) => key),
      ]),
    );
    const collectionOperationBindings = Object.fromEntries(
      siteSourceSchema.views.flatMap((view) =>
        view.type === "collection" && view.operations
          ? [[view.key, view.operations.map((operation) => operation.operation)]]
          : [],
      ),
    );
    const compositionView = siteSourceSchema.views.find(
      (definition) => definition.key === "siteCompositionHome",
    );
    const treeComposition =
      compositionView?.type === "collection" && compositionView.result.type === "tree"
        ? compositionView.result.composition
        : undefined;
    expect(siteEntityOperations).toMatchObject({
      site: ["update"],
      block: ["create", "update", "delete"],
      "block-placement": ["create", "update", "addTreeChild", "removeTreePlacement"],
      "contact-message": ["submit"],
      subscription: ["update", "subscribe"],
    });
    expect(collectionOperationBindings).toMatchObject({
      blockHome: ["block.create"],
      pageCompositionHome: ["block-placement.create"],
      navigationCompositionHome: ["block-placement.create"],
      blockCompositionHome: ["block-placement.create"],
    });
    expect(treeComposition).toEqual({
      createOperation: "block-placement.addTreeChild",
      removeOperation: "block-placement.removeTreePlacement",
    });
    expect(
      siteSourceSchema.entities
        .find((definition) => definition.key === "block")!
        .fields.find((definition) => definition.key === "operationName")!,
    ).toMatchObject({
      label: "Operation",
    });
  });

  it("resolves the source rate-card read-model slots", () => {
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "rateHome",
    );

    if (!rateModel || rateModel.result.type !== "table") {
      throw new Error("Missing rate table model.");
    }

    expect(rateModel.queryTabs).toMatchObject([
      {
        queryName: "ratesForSelectedCard",
        label: "Selected card",
        count: { type: "count" },
        query: {
          kind: "where",
          ref: { kind: "value", name: "card" },
          op: "eq",
          value: { kind: "context", name: "card" },
        },
      },
    ]);
    expect(
      rateModel.result.columns.map((column) => ({
        type: column.type,
        key: column.key,
        label: column.label,
        display: column.display,
        suffix: column.suffix ?? null,
        format: column.format,
      })),
    ).toEqual([
      {
        type: "referenceField",
        key: "referenceField:resource.name",
        label: "Role",
        display: "editor",
        suffix: null,
        format: "plain",
      },
      {
        type: "field",
        key: "field:cost",
        label: "Cost",
        display: "editor",
        suffix: null,
        format: "number",
      },
      {
        type: "field",
        key: "field:costUnit",
        label: "Cost unit",
        display: "hidden",
        suffix: null,
        format: "plain",
      },
      {
        type: "field",
        key: "field:price",
        label: "Price",
        display: "editor",
        suffix: "/ day",
        format: "currency",
      },
      {
        type: "computed",
        key: "computed:rateMargin",
        label: "Margin",
        display: "readOnly",
        suffix: null,
        format: "percent",
      },
    ]);
    expect(rateModel.result.type === "table" ? rateModel.result.footer : []).toMatchObject([
      {
        type: "aggregate",
        key: "aggregate:selectedCardAverageCost",
        columnKey: "field:cost",
        aggregateName: "selectedCardAverageCost",
        label: "Average cost",
        suffix: "/ day",
        format: "currency",
      },
      {
        type: "aggregate",
        key: "aggregate:selectedCardAveragePrice",
        columnKey: "field:price",
        aggregateName: "selectedCardAveragePrice",
        label: "Average price",
        suffix: "/ day",
        format: "currency",
      },
      {
        type: "aggregate",
        key: "aggregate:selectedCardAverageMargin",
        columnKey: "computed:rateMargin",
        aggregateName: "selectedCardAverageMargin",
        label: "Average margin",
        format: "percent",
      },
    ]);
  });

  it("resolves read-only computed table columns", () => {
    const schema = rateCardSchemaWithComputedMarginColumn();
    const rateModel = selectCollectionModels(schema).find((model) => model.viewName === "rateHome");

    if (!rateModel || rateModel.result.type !== "table") {
      throw new Error("Missing rate table model.");
    }

    const computedColumn = rateModel.result.columns.at(-1);

    expect(computedColumn).toMatchObject({
      type: "computed",
      key: "computed:rateMargin",
      computedValueName: "rateMargin",
      computedValue: schema.readModels?.computedValues!.find(
        (definition) => definition.key === "rateMargin",
      )!,
      label: "Margin",
      align: "end",
      width: "sm",
      display: "readOnly",
      suffix: "margin",
      format: "percent",
    });
    expect(computedColumn && "editor" in computedColumn).toBe(false);
    expect(computedColumn && "commit" in computedColumn).toBe(false);
  });

  it("resolves aggregate summary slots for collections", () => {
    const schema = rateCardSchemaWithAggregateSummarySlots();
    const rateModel = selectCollectionModels(schema).find((model) => model.viewName === "rateHome");

    expect(rateModel?.collection.summary).toMatchObject([
      {
        type: "aggregate",
        key: "aggregate:selectedCardCostTotal",
        aggregateName: "selectedCardCostTotal",
        aggregate: {
          query: "ratesForSelectedCard",
          function: "sum",
          value: { kind: "field", field: "cost" },
        },
        label: "Cost total",
        suffix: "/ day",
        format: "currency",
      },
      {
        type: "aggregate",
        key: "aggregate:selectedCardAverageMargin",
        aggregateName: "selectedCardAverageMargin",
        aggregate: {
          query: "ratesForSelectedCard",
          function: "average",
          value: { kind: "computed", computedValue: "rateMargin" },
        },
        label: "Average margin",
        format: "percent",
      },
    ]);
    const computedValues = schema.readModels?.computedValues ?? [];
    const { key: _key, ...rateMargin } = computedValues.find(
      (definition) => definition.key === "rateMargin",
    )!;
    expect(rateModel?.collection.summary?.[1]?.computedValues.rateMargin).toEqual(rateMargin);
  });
  it("keeps summary absent when a collection has no summary slots", () => {
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "resourceHome",
    );
    expect("summary" in (rateModel?.collection ?? {})).toBe(false);
  });
  it("characterizes rate value/unit editing over flat scalar fields", () => {
    const rate = rateCardSchema.entities.find((definition) => definition.key === "rate")!;
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "rateHome",
    );
    const columns = rateModel?.result.type === "table" ? rateModel.result.columns : [];
    const testRate = rateCardTestRecords.find((record) => record.entity === "rate");

    if (!testRate) {
      throw new Error("Missing test rate.");
    }
    expect(rate.fields.find((definition) => definition.key === "cost")!).toMatchObject({
      type: "number",
      required: true,
    });
    expect(rate.fields.find((definition) => definition.key === "costUnit")!).toMatchObject({
      type: "enum",
      required: true,
    });
    expect(rate.fields.find((definition) => definition.key === "price")!).toMatchObject({
      type: "number",
      required: true,
    });
    expect(rate.fields.find((definition) => definition.key === "currency")!).toMatchObject({
      type: "enum",
      required: true,
    });
    expect(
      columns.find((column) => column.type === "field" && column.fieldName === "cost"),
    ).toMatchObject({
      editor: "number",
      format: "number",
      display: "editor",
      valueUnit: {
        unitFieldName: "costUnit",
        unitField: rate.fields.find((definition) => definition.key === "costUnit")!,
      },
    });
    expect(
      columns.find((column) => column.type === "field" && column.fieldName === "cost")?.suffix,
    ).toBeUndefined();
    expect(
      columns.find((column) => column.type === "field" && column.fieldName === "costUnit"),
    ).toMatchObject({
      editor: "enum",
      display: "hidden",
    });
    expect(
      columns.find((column) => column.type === "field" && column.fieldName === "price"),
    ).toMatchObject({
      editor: "number",
      suffix: "/ day",
      format: "currency",
      display: "editor",
    });
    expect(findFieldTableColumn(columns, "price")?.valueUnit).toBeUndefined();
    expect(
      columns.find((column) => column.type === "field" && column.fieldName === "currency"),
    ).toBeUndefined();
    expect(typeof testRate.values.cost).toBe("number");
    expect(typeof testRate.values.costUnit).toBe("string");
    expect(typeof testRate.values.price).toBe("number");
    expect(typeof testRate.values.currency).toBe("string");
  });
  it("applies field type default commit policies to table columns", () => {
    const taskHome = appSchema.views.find(
      (definition) => definition.key === "taskHome",
    )! as Extract<
      AppSchema["views"][number],
      {
        type: "collection";
      }
    >;
    const schema: AppSchema = {
      ...appSchema,
      entities: appSchema.entities.map((entity) =>
        entity.key === "task"
          ? {
              ...entity,
              fields: [
                ...entity.fields,
                { key: "estimate", type: "number" as const, required: false, label: "Estimate" },
              ],
            }
          : entity,
      ),
      tableViews: [
        {
          key: "taskTable",
          entity: "task",
          columns: [
            { type: "field", field: "title" },
            { type: "field", field: "done" },
            { type: "field", field: "dueDate" },
            { type: "field", field: "estimate" },
            { type: "field", field: "priority" },
          ],
        },
      ],
      views: appSchema.views.map((view) =>
        view.key === "taskHome"
          ? {
              ...taskHome,
              result: { type: "table", tableView: "taskTable" },
              key: "taskHome",
            }
          : view,
      ),
    };
    const model = selectPrimaryCollectionModels(schema)[0];
    const columns = model?.result.type === "table" ? model.result.columns : [];

    expect(tableColumnEditors(columns)).toEqual(["text", "boolean", "date", "number", "enum"]);
    expect(tableColumnCommits(columns)).toEqual([
      "field-commit",
      "immediate",
      "field-commit",
      "field-commit",
      "immediate",
    ]);
  });

  it("resolves scoped rate-card collection context", () => {
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "rateHome",
    );

    expect(rateModel?.context).toMatchObject({
      name: "card",
      entityName: "card",
      queryName: "cardAll",
      query: rateCardSchema.queries.find((definition) => definition.key === "cardAll")?.expression,
      labelField: "name",
      presentation: "tabs",
      itemViewName: "rateCardContextItem",
      recordFields: [
        { fieldName: "marginMin" },
        { fieldName: "marginMed" },
        { fieldName: "marginMax" },
      ],
      createOperation: {
        type: "create",
        label: "Create Rate card",
        entityName: "card",
        fields: [{ fieldName: "name" }],
        defaults: [],
        enabled: true,
      },
    });
    expect(rateModel?.queryTabs[0]).toMatchObject({
      queryName: "ratesForSelectedCard",
      query: rateCardSchema.queries.find((definition) => definition.key === "ratesForSelectedCard")
        ?.expression,
    });
    expect(rateModel?.context?.relatedCollection).toBeUndefined();
  });

  it("resolves the rate-home resource create operation from the create view entity", () => {
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "rateHome",
    );
    const create = rateModel?.operations!.find((operation) => operation.type === "create");
    expect(create).toMatchObject({
      type: "create",
      label: "Create Resource",
      entityName: "resource",
      fields: [{ fieldName: "name" }],
      defaults: [],
    });
  });

  it("omits the source rate-card regenerate operation from the primary view", () => {
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "rateHome",
    );

    expect(rateModel?.operations.map((candidate) => candidate.label)).toEqual(["Create Resource"]);
    expect(rateModel?.operations.some((candidate) => candidate.type === "command")).toBe(false);
  });

  it("characterizes the rate-card primary home model contract", () => {
    const model = requiredCollectionModel(rateCardSchema, "rateHome");

    if (!model) {
      throw new Error("Missing rate-card home model.");
    }

    expect(summarizeHomeModel(model)).toEqual({
      viewName: "rateHome",
      label: "Rates",
      entityName: "rate",
      navigationPrimary: true,
      context: {
        name: "card",
        entityName: "card",
        queryName: "cardAll",
        labelField: "name",
        presentation: "tabs",
        relatedCollection: null,
        createOperation: {
          type: "create",
          label: "Create Rate card",
          entityName: "card",
          fields: ["name"],
          defaults: [],
          enabled: true,
        },
        itemViewName: "rateCardContextItem",
        recordFields: ["marginMin", "marginMed", "marginMax"],
      },
      queries: [
        {
          queryName: "ratesForSelectedCard",
          label: "Selected card",
          count: "count",
          expressionKind: "where",
        },
      ],
      defaultQueryName: "ratesForSelectedCard",
      result: {
        type: "table",
        tableViewName: "rateTable",
        columns: [
          "referenceField:resource.name",
          "field:cost",
          "field:costUnit",
          "field:price",
          "computed:rateMargin",
        ],
        footer: [
          {
            columnKey: "field:cost",
            aggregateName: "selectedCardAverageCost",
            label: "Average cost",
          },
          {
            columnKey: "field:price",
            aggregateName: "selectedCardAveragePrice",
            label: "Average price",
          },
          {
            columnKey: "computed:rateMargin",
            aggregateName: "selectedCardAverageMargin",
            label: "Average margin",
          },
        ],
      },
      operations: [
        {
          type: "create",
          label: "Create Resource",
          entityName: "resource",
          fields: ["name"],
          defaults: [],
          enabled: true,
        },
      ],
    });
  });

  it("selects the site root authoring collections as primary collection models", () => {
    const models = selectPrimaryCollectionModels(siteSourceSchema);

    expect(models.map((model) => model.viewName)).toEqual(["siteCompositionHome"]);
    expect(models.map((model) => model.label)).toEqual(["Site"]);
    expect(models.map((model) => model.navigation.primary)).toEqual([true]);
    expect(models.map((model) => model.context?.queryName)).toEqual(["blockSiteRoots"]);
    expect(models.map((model) => model.context?.label)).toEqual(["Site roots"]);
    expect(models.map((model) => model.context?.presentation)).toEqual(["listDetail"]);
    expect(
      models.map((model) => model.context?.navigation?.groups.map((group) => group.label)),
    ).toEqual([["Pages", "Posts", "Projects", "Navigation"]]);
    expect(
      models.map((model) =>
        model.context?.navigation?.groups.map((group) => ({
          label: group.label,
          queryName: group.queryName,
          createOperation:
            group.createOperation === undefined
              ? null
              : summarizeHomeOperation(group.createOperation),
        })),
      ),
    ).toEqual([
      [
        {
          label: "Pages",
          queryName: "blockPages",
          createOperation: {
            type: "create",
            label: "Create Page",
            entityName: "block",
            fields: ["label", "href", "icon"],
            defaults: ["type"],
            enabled: true,
          },
        },
        {
          label: "Posts",
          queryName: "blockPosts",
          createOperation: {
            type: "create",
            label: "Create Post",
            entityName: "block",
            fields: ["label", "href", "date", "body"],
            defaults: ["type"],
            enabled: true,
          },
        },
        {
          label: "Projects",
          queryName: "blockProjects",
          createOperation: {
            type: "create",
            label: "Create Project",
            entityName: "block",
            fields: ["label", "href", "date", "body"],
            defaults: ["type"],
            enabled: true,
          },
        },
        { label: "Navigation", queryName: "blockNavigationRoots", createOperation: null },
      ],
    ]);
    expect(models.map((model) => model.result.type)).toEqual(["tree"]);
    expect(requiredCollectionModel(siteSourceSchema, "blockHome").navigation.primary).toBe(false);
    expect(
      requiredCollectionModel(siteSourceSchema, "pageCompositionHome").navigation.primary,
    ).toBe(false);
    expect(
      requiredCollectionModel(siteSourceSchema, "navigationCompositionHome").navigation.primary,
    ).toBe(false);
    expect(
      requiredCollectionModel(siteSourceSchema, "blockCompositionHome").navigation.primary,
    ).toBe(false);
  });

  it("exposes Site settings as a generated non-primary editor section", () => {
    const settingsModel = requiredCollectionModel(siteSourceSchema, "siteSettingsHome");
    const fields = settingsModel.result.type === "record" ? settingsModel.result.recordFields : [];

    expect(settingsModel.label).toBe("Settings");
    expect(settingsModel.entityName).toBe("site");
    expect(settingsModel.navigation.primary).toBe(false);
    expect(settingsModel.context).toBeUndefined();
    expect(settingsModel.defaultQueryName).toBe("sitePrimary");
    expect(settingsModel.operations).toEqual([]);
    expect(settingsModel.result.type).toBe("record");
    expect(settingsModel.result.type === "record" ? settingsModel.result.itemViewName : null).toBe(
      "siteSettingsForm",
    );
    expect(fields.map((field) => field.fieldName)).toEqual([
      "label",
      "description",
      "icon",
      "initialThemeMode",
      "themeSwitchable",
    ]);
    expect(
      fields.map((field) => ({
        fieldName: field.fieldName,
        editor: field.editor,
        commit: field.commit,
      })),
    ).toEqual([
      { fieldName: "label", editor: "text", commit: "field-commit" },
      {
        fieldName: "description",
        editor: "textarea",
        commit: "field-commit",
      },
      { fieldName: "icon", editor: "icon", commit: "field-commit" },
      {
        fieldName: "initialThemeMode",
        editor: "enum",
        commit: "immediate",
      },
      {
        fieldName: "themeSwitchable",
        editor: "boolean",
        commit: "immediate",
      },
    ]);
  });

  it("characterizes the site root authoring model contracts", () => {
    const models = selectPrimaryCollectionModels(siteSourceSchema);

    expect(models.map(summarizeHomeModel)).toEqual([
      {
        viewName: "siteCompositionHome",
        label: "Site",
        entityName: "block-placement",
        navigationPrimary: true,
        context: {
          name: "block",
          entityName: "block",
          queryName: "blockSiteRoots",
          labelField: "label",
          presentation: "listDetail",
          relatedCollection: {
            relationshipName: "blockPlacements",
            label: "Placements",
            entityName: "block-placement",
            referenceFieldName: "parent",
          },
          createOperation: null,
          itemViewName: "blockRootDetail",
          recordFields: ["label"],
        },
        queries: [
          {
            queryName: "placementsForSelectedBlock",
            label: "Selected block",
            count: "count",
            expressionKind: "where",
          },
        ],
        defaultQueryName: "placementsForSelectedBlock",
        result: {
          type: "tree",
          relationshipName: "blockPlacements",
          childFieldName: "block",
          childItemViewName: "blockTreeNode",
          childFields: ["label"],
          placementItemViewName: undefined,
          placementFields: [],
          orderingField: "order",
          orderingPresentations: ["dragHandle"],
          maxDepth: 8,
        },
        operations: [],
      },
    ]);
  });

  it("resolves Site placement ordering controls", () => {
    const placementModel = requiredCollectionModel(siteSourceSchema, "pageCompositionHome");
    const columns = placementModel.result.type === "table" ? placementModel.result.columns : [];
    expect(
      siteSourceSchema.entities
        .find((definition) => definition.key === "block-placement")!
        .fields.find((definition) => definition.key === "order")!,
    ).toMatchObject({
      type: "number",
      required: true,
      default: 1000,
      min: 0,
    });
    expect(
      placementModel.result.type === "table" ? placementModel.result.ordering : undefined,
    ).toMatchObject({
      fieldName: "order",
      scope: [{ fieldName: "parent" }, { fieldName: "slot" }],
      presentations: ["dragHandle", "moveMenu"],
    });
    expect(
      placementModel.result.type === "table"
        ? placementModel.result.updateOperation?.canonicalKey
        : undefined,
    ).toBe("block-placement.update");
    expect(
      columns.map((column) => ({
        type: column.type,
        key: column.key,
        label: column.label,
        editor: tableColumnEditor(column),
        commit: tableColumnCommit(column),
        display: column.display,
        align: column.align ?? null,
        width: column.width ?? null,
        format: column.format,
      })),
    ).toEqual([
      {
        type: "orderingHandle",
        key: "orderingHandle",
        label: "",
        editor: null,
        commit: null,
        display: "readOnly",
        align: "center",
        width: "xs",
        format: "plain",
      },
      {
        type: "field",
        key: "field:block",
        label: "Child block",
        editor: "reference",
        commit: "immediate",
        display: "editor",
        align: null,
        width: "lg",
        format: "plain",
      },
      {
        type: "field",
        key: "field:label",
        label: "Label",
        editor: "text",
        commit: "field-commit",
        display: "editor",
        align: null,
        width: "md",
        format: "plain",
      },
      {
        type: "field",
        key: "field:slot",
        label: "Slot",
        editor: "text",
        commit: "field-commit",
        display: "editor",
        align: null,
        width: "sm",
        format: "plain",
      },
      {
        type: "operationControl",
        key: "operationControl:block.update,ordering",
        label: "",
        editor: null,
        commit: null,
        display: "readOnly",
        align: "end",
        width: "xs",
        format: "plain",
      },
    ]);
  });

  it("resolves site content table columns and variant-aware create fields", () => {
    const contentModel = selectCollectionModels(siteSourceSchema).find(
      (model) => model.viewName === "blockHome",
    );
    const placementModel = selectCollectionModels(siteSourceSchema).find(
      (model) => model.viewName === "pageCompositionHome",
    );
    const create = contentModel?.operations!.find((operation) => operation.type === "create");
    const createVariantFields = Object.fromEntries(
      create?.type === "create"
        ? (create.union?.variants.map((variant) => [
            variant.variantValue,
            variant.presentation.fields.map((field) => field.fieldName),
          ]) ?? [])
        : [],
    );
    const editControl =
      placementModel?.result.type === "table"
        ? placementModel.result.columns
            .flatMap((column) => (column.type === "operationControl" ? column.controls : []))
            .find((control) => control.type === "editRecord")
        : undefined;
    const editVariantFields = Object.fromEntries(
      editControl?.type === "editRecord"
        ? (editControl.editView.union?.variants.map((variant) => [
            variant.variantValue,
            variant.presentation.type === "fields"
              ? variant.presentation.fields.map((field) => [field.fieldName, field.editor])
              : [],
          ]) ?? [])
        : [],
    );

    expect(contentModel?.queryTabs.map((tab) => tab.queryName)).toEqual([
      "blockAll",
      "blockPages",
      "blockPosts",
      "blockProjects",
      "blockLinks",
      "blockGroups",
      "blockImages",
    ]);
    expect(
      contentModel?.result.type === "table"
        ? contentModel.result.columns.map((column) => column.key)
        : [],
    ).toEqual([
      "field:type",
      "field:label",
      "field:body",
      "field:href",
      "field:mediaAssetId",
      "field:date",
      "field:icon",
      "field:color",
      "field:alignment",
      "field:width",
      "field:height",
    ]);
    expect(
      contentModel?.result.type === "table" ? tableColumnEditors(contentModel.result.columns) : [],
    ).toEqual([
      "enum",
      "text",
      "markdown",
      "href",
      "media",
      "date",
      "icon",
      "color",
      "enum",
      "number",
      "number",
    ]);
    expect(create?.type === "create" ? create.fields.map((field) => field.fieldName) : []).toEqual([
      "type",
      "label",
    ]);
    expect(create?.type === "create" ? create.union?.unionName : undefined).toBe("blockByType");
    expect(createVariantFields).toMatchObject({
      post: ["date", "body", "href"],
      project: ["date", "body", "href"],
      subscribeForm: ["body", "operationName", "buttonLabel"],
      link: ["linkTargetMode", "linkTargetBlock", "href", "icon"],
      markdown: ["body"],
      feature: ["body", "alignment"],
      image: ["mediaAssetId"],
    });
    expect(editVariantFields.image).toEqual([["mediaAssetId", "media"]]);
    expect(createVariantFields.subscribeForm).not.toContain("operationKey");
    expect(createVariantFields.subscribeForm).not.toContain("operationNotificationMode");
  });
  it("characterizes site authoring rich text fields as string-backed editor hints", () => {
    const block = siteSourceSchema.entities.find((definition) => definition.key === "block")!;
    const contentModel = selectCollectionModels(siteSourceSchema).find(
      (model) => model.viewName === "blockHome",
    );
    const create = contentModel?.operations!.find((operation) => operation.type === "create");
    const createEditors =
      create?.type === "create"
        ? Object.fromEntries(create.fields.map((field) => [field.fieldName, field.editor]))
        : {};
    const createVariantEditors = Object.fromEntries(
      create?.type === "create"
        ? (create.union?.variants.map((variant) => [
            variant.variantValue,
            Object.fromEntries(
              variant.presentation.fields.map((field) => [field.fieldName, field.editor]),
            ),
          ]) ?? [])
        : [],
    );
    const tableEditors =
      contentModel?.result.type === "table"
        ? Object.fromEntries(
            contentModel.result.columns
              .filter((column) => column.type === "field" || column.type === "referenceField")
              .map((column) => [column.fieldName, column.editor]),
          )
        : {};
    expect(block.fields.find((definition) => definition.key === "body")!).toMatchObject({
      type: "text",
      format: "markdown",
    });
    expect(block.fields.find((definition) => definition.key === "color")!).toMatchObject({
      type: "text",
      format: "color",
    });
    expect(block.fields.find((definition) => definition.key === "href")!).toMatchObject({
      type: "text",
      format: "href",
    });
    expect(block.fields.find((definition) => definition.key === "icon")!).toMatchObject({
      type: "text",
      format: "icon",
    });
    expect(block.fields.find((definition) => definition.key === "mediaAssetId")!).toMatchObject({
      type: "text",
    });
    expect(block.fields.find((definition) => definition.key === "date")!).toMatchObject({
      type: "date",
    });
    expect(createEditors).toMatchObject({
      label: "text",
      type: "enum",
    });
    expect(createVariantEditors).toMatchObject({
      post: {
        date: "date",
      },
      project: {
        date: "date",
      },
      link: {
        href: "href",
        icon: "icon",
      },
      markdown: {
        body: "markdown",
      },
      image: {
        mediaAssetId: "media",
      },
    });
    expect(tableEditors).toMatchObject({
      label: "text",
      body: "markdown",
      href: "href",
      mediaAssetId: "media",
      date: "date",
      icon: "icon",
      color: "color",
    });
  });

  it("resolves the site scoped block composition context", () => {
    const compositionModel = selectCollectionModels(siteSourceSchema).find(
      (model) => model.viewName === "blockCompositionHome",
    );

    expect(compositionModel?.context).toMatchObject({
      name: "block",
      entityName: "block",
      queryName: "blockAll",
      query: siteSourceSchema.queries.find((definition) => definition.key === "blockAll")
        ?.expression,
      labelField: "label",
      presentation: "tabs",
      relatedCollection: {
        relationshipName: "blockPlacements",
        relationship: {
          kind: "toMany",
          from: { entity: "block" },
          to: { entity: "block-placement", field: "parent" },
        },
      },
      itemViewName: "blockContextItem",
      recordFields: [{ fieldName: "label" }],
    });
    expect(compositionModel?.operations[0]).toMatchObject({
      type: "create",
      label: "Add placement",
      entityName: "block-placement",
      defaults: [{ fieldName: "parent", value: { kind: "context", name: "block" } }],
    });
  });

  it("selects screen models in schema order and filters primary screens", () => {
    const models = selectScreenModels(rateCardSchema);

    expect(models.map(summarizeScreenModel)).toEqual([
      {
        screenName: "rateHome",
        label: "Rates",
        primary: true,
        layoutType: "stack",
        sections: [{ id: "rates", label: "Rates", viewName: "rateHome", entityName: "rate" }],
      },
      {
        screenName: "rateSetup",
        label: "Setup",
        primary: true,
        layoutType: "stack",
        sections: [
          { id: "cards", label: "Rate cards", viewName: "cardHome", entityName: "card" },
          {
            id: "resources",
            label: "Resources",
            viewName: "resourceHome",
            entityName: "resource",
          },
        ],
      },
    ]);
    expect(selectPrimaryScreenModels(rateCardSchema).map((model) => model.screenName)).toEqual([
      "rateHome",
      "rateSetup",
    ]);
  });

  it("keeps runtime-owned screens out of generated workspace models", () => {
    const runtimeSchema: AppSchema = {
      ...rateCardSchema,
      navigation: { primaryScreens: ["rateHome", "access"] },
      screens: [
        rateCardSchema.screens.find((screen) => screen.key === "rateHome")!,
        {
          key: "access",
          type: "runtime",
          label: "Access",
          path: "/settings/access",
          access: { actor: "owner" },
        },
      ],
    };

    expect(selectScreenModels(runtimeSchema).map((screen) => screen.screenName)).toEqual([
      "rateHome",
    ]);
    expect(selectPrimaryScreenModels(runtimeSchema).map((screen) => screen.screenName)).toEqual([
      "rateHome",
    ]);
    expect(selectScreenModelByPath(runtimeSchema, "/settings/access")).toBeUndefined();
  });

  it("does not transfer a runtime-owned implicit root to a generated workspace", () => {
    const { path: _path, ...pathlessSetup } = rateCardSchema.screens.find(
      (screen) => screen.key === "rateSetup",
    )!;
    const runtimeRootSchema: AppSchema = {
      ...rateCardSchema,
      navigation: { primaryScreens: ["access", "rateSetup"] },
      screens: [
        { key: "access", type: "runtime", label: "Access", access: { actor: "owner" } },
        pathlessSetup,
      ],
    };

    expect(
      selectScreenModels(runtimeRootSchema).map(({ path, screenName }) => ({ path, screenName })),
    ).toEqual([{ path: undefined, screenName: "rateSetup" }]);
  });

  it("exposes route-ready screen paths and selects models by path", () => {
    const accessSchema: AppSchema = {
      ...rateCardSchema,
      screens: [
        {
          ...rateCardSchema.screens!.find((definition) => definition.key === "rateHome")!,
          access: { actor: "owner" },
          key: "rateHome",
        },
        {
          ...rateCardSchema.screens!.find((definition) => definition.key === "rateSetup")!,
          access: { actor: "anonymous" },
          key: "rateSetup",
        },
      ],
    };
    expect(
      selectPrimaryScreenModels(accessSchema).map((model) => ({
        screenName: model.screenName,
        path: model.path,
        access: model.access,
      })),
    ).toEqual([
      { screenName: "rateHome", path: "/", access: { actor: "owner" } },
      { screenName: "rateSetup", path: "/setup", access: { actor: "anonymous" } },
    ]);
    expect(selectScreenModelByPath(rateCardSchema, "/setup")?.screenName).toBe("rateSetup");
    expect(selectScreenModelByPath(rateCardSchema, "/missing")).toBeUndefined();
  });
  it("uses the app root path for the first primary screen when paths are omitted", () => {
    const { path: _homePath, ...rateHomeWithoutPath } = rateCardSchema.screens!.find(
      (definition) => definition.key === "rateHome",
    )!;
    const { path: _setupPath, ...rateSetupWithoutPath } = rateCardSchema.screens!.find(
      (definition) => definition.key === "rateSetup",
    )!;
    const pathlessRateSchema: AppSchema = {
      ...rateCardSchema,
      screens: [
        {
          ...rateHomeWithoutPath,
          key: "rateHome",
        },
        {
          ...rateSetupWithoutPath,
          key: "rateSetup",
        },
      ],
    };
    expect(
      selectScreenModels(pathlessRateSchema).map((model) => ({
        screenName: model.screenName,
        path: model.path,
      })),
    ).toEqual([
      { screenName: "rateHome", path: "/" },
      { screenName: "rateSetup", path: undefined },
    ]);
    expect(selectScreenModelByPath(pathlessRateSchema, "/")?.screenName).toBe("rateHome");
  });

  it("uses flat or grouped navigation order for primary screens and root fallback", () => {
    const { path: _homePath, ...rateHomeWithoutPath } = rateCardSchema.screens.find(
      (definition) => definition.key === "rateHome",
    )!;
    const { path: _setupPath, ...rateSetupWithoutPath } = rateCardSchema.screens.find(
      (definition) => definition.key === "rateSetup",
    )!;
    const screens: AppSchema["screens"] = [
      { ...rateHomeWithoutPath, key: "rateHome" },
      { ...rateSetupWithoutPath, key: "rateSetup" },
      { ...rateHomeWithoutPath, key: "direct", label: "Direct", path: "/direct" },
    ];
    const groupedSchema: AppSchema = {
      ...rateCardSchema,
      navigation: {
        groups: [
          { key: "setup", label: "Setup", screens: ["rateSetup"] },
          { key: "rates", label: "Rates", screens: ["rateHome"] },
        ],
      },
      screens,
    };

    expect(
      selectPrimaryScreenModels(groupedSchema).map(({ screenName, path }) => ({
        screenName,
        path,
      })),
    ).toEqual([
      { screenName: "rateSetup", path: "/" },
      { screenName: "rateHome", path: undefined },
    ]);
    expect(
      selectScreenModels(groupedSchema).map(({ screenName, navigation, path }) => ({
        screenName,
        primary: navigation.primary,
        path,
      })),
    ).toEqual([
      { screenName: "rateHome", primary: true, path: undefined },
      { screenName: "rateSetup", primary: true, path: "/" },
      { screenName: "direct", primary: false, path: "/direct" },
    ]);
    expect(selectScreenModelByPath(groupedSchema, "/direct")?.screenName).toBe("direct");

    const flatSchema: AppSchema = {
      ...groupedSchema,
      navigation: { primaryScreens: ["rateSetup", "rateHome"] },
    };
    expect(selectPrimaryScreenModels(flatSchema).map(({ screenName }) => screenName)).toEqual([
      "rateSetup",
      "rateHome",
    ]);
    expect(selectScreenModelByPath(flatSchema, "/")?.screenName).toBe("rateSetup");
  });

  it("exposes render-ready collection facts on screen sections", () => {
    const setupScreen = selectScreenModels(rateCardSchema).find(
      (model) => model.screenName === "rateSetup",
    );
    const cardsSection = setupScreen?.layout.sections[0];
    const resourcesSection = setupScreen?.layout.sections[1];

    expect(cardsSection).toMatchObject({
      id: "cards",
      type: "collection",
      label: "Rate cards",
      viewName: "cardHome",
      collection: {
        entityName: "card",
        queries: {
          defaultQueryName: "cardAll",
        },
        result: { type: "list", itemViewName: "cardListItem" },
      },
    });
    expect(resourcesSection).toMatchObject({
      id: "resources",
      type: "collection",
      label: "Resources",
      viewName: "resourceHome",
      collection: {
        entityName: "resource",
        queries: {
          defaultQueryName: "resourceAll",
        },
        operations: [{ type: "create", entityName: "resource" }],
      },
    });
  });

  it("selects the unified route control-plane surface without route filter tabs", () => {
    const schema = parseAppSchema(instanceControlPlaneSchema);
    const routes = selectScreenModelByPath(schema, "/routes");

    if (!routes) {
      throw new Error("Missing routes control-plane screen.");
    }

    expect(summarizeScreenModel(routes)).toEqual({
      screenName: "routes",
      label: "Routes",
      primary: true,
      layoutType: "stack",
      sections: [
        {
          id: "routes",
          label: "Routes",
          viewName: "routeList",
          entityName: "route",
        },
      ],
    });
    const routeSection = routes.layout.sections[0];
    const routeColumns =
      routeSection?.collection.result.type === "table"
        ? routeSection.collection.result.columns
        : [];
    const routeOperationColumn = routeColumns.find((column) => column.type === "operationControl");
    const routeEditControl =
      routeOperationColumn?.type === "operationControl"
        ? routeOperationColumn.controls.find((control) => control.type === "editRecord")
        : undefined;

    expect(routeSection?.collection.queries.tabs.map((tab) => tab.label)).toEqual(["Routes"]);
    expect(
      routeSection?.collection.operations.map((operation) => ({
        type: operation.type,
        operationKey: operation.operation.canonicalKey,
      })),
    ).toEqual([{ type: "create", operationKey: "route.create" }]);
    expect(routeSection?.collection.updateOperation?.canonicalKey).toBe("route.update");
    expect(routeSection?.collection.result.type).toBe("table");
    expect(routeOperationColumn?.type).toBe("operationControl");
    expect(routeEditControl?.type).toBe("editRecord");
    expect(
      routeEditControl?.type === "editRecord" ? routeEditControl.editView.viewName : undefined,
    ).toBe("routeEdit");
    expect(
      routeEditControl?.type === "editRecord"
        ? routeEditControl.operation?.canonicalKey
        : undefined,
    ).toBe("route.update");
    expect(
      routeEditControl?.type === "editRecord"
        ? routeEditControl.editView.updateOperation?.canonicalKey
        : undefined,
    ).toBe("route.update");
    expect(
      routeEditControl?.type === "editRecord"
        ? routeEditControl.editView.fields.map((field) => field.fieldName)
        : [],
    ).not.toContain("deploymentConfig");
    expect(
      routeColumns
        .filter((column): column is FieldTableColumnConfig => column.type === "field")
        .map((column) => column.fieldName),
    ).not.toContain("deploymentConfig");
  });

  it("selects site editor and settings as primary screen models", () => {
    const models = selectPrimaryScreenModels(siteSourceSchema);

    expect(models.map((model) => ({ screenName: model.screenName, path: model.path }))).toEqual([
      { screenName: "siteSettings", path: "/settings" },
      { screenName: "siteEditor", path: "/" },
      { screenName: "siteSubscribers", path: "/subscribers" },
      { screenName: "siteContacts", path: "/contacts" },
    ]);
    expect(models.map(summarizeScreenModel)).toEqual([
      {
        screenName: "siteSettings",
        label: "Settings",
        primary: true,
        layoutType: "stack",
        sections: [
          {
            id: "settings",
            label: "Settings",
            viewName: "siteSettingsHome",
            entityName: "site",
          },
        ],
      },
      {
        screenName: "siteEditor",
        label: "Blocks",
        primary: true,
        layoutType: "stack",
        sections: [
          {
            id: "site",
            label: "Site",
            viewName: "siteCompositionHome",
            entityName: "block-placement",
          },
        ],
      },
      {
        screenName: "siteSubscribers",
        label: "Subscribers",
        primary: true,
        layoutType: "stack",
        sections: [
          {
            id: "subscriptions",
            label: "Subscriptions",
            viewName: "subscriptionHome",
            entityName: "subscription",
          },
          {
            id: "emailAddresses",
            label: "Email addresses",
            viewName: "emailAddressHome",
            entityName: "email-address",
          },
          {
            id: "audiences",
            label: "Audiences",
            viewName: "audienceHome",
            entityName: "audience",
          },
        ],
      },
      {
        screenName: "siteContacts",
        label: "Contacts",
        primary: true,
        layoutType: "stack",
        sections: [
          {
            id: "messages",
            label: "Contact messages",
            viewName: "contactMessageHome",
            entityName: "contact-message",
          },
        ],
      },
    ]);
  });
  it("selects all required screen definitions", () => {
    expect(selectScreenModels(siteSourceSchema).map(({ screenName }) => screenName)).toEqual(
      siteSourceSchema.screens.map(({ key }) => key),
    );
  });
  it("selects relationship-backed related collections for an entity", () => {
    expect(selectRelatedCollectionModels(rateCardSchema, "card")).toMatchObject([
      {
        relationshipName: "cardRates",
        label: "Rates",
        entityName: "rate",
        referenceFieldName: "card",
      },
    ]);
    expect(selectRelatedCollectionModels(siteSourceSchema, "block")).toMatchObject([
      {
        relationshipName: "blockPlacements",
        label: "Placements",
        entityName: "block-placement",
        referenceFieldName: "parent",
      },
      {
        relationshipName: "blockUsedInPlacements",
        label: "Used in placements",
        entityName: "block-placement",
        referenceFieldName: "block",
      },
    ]);
  });
});
function rateCardSchemaWithComputedMarginColumn(): AppSchema {
  const rateTable = rateCardSchema.tableViews.find((definition) => definition.key === "rateTable")!;
  return {
    ...rateCardSchema,
    readModels: {
      computedValues: [
        {
          key: "rateMargin",
          entity: "rate",
          type: "number",
          expression: rateMarginExpression(),
        },
      ],
      aggregates: rateCardSchema.readModels?.aggregates ?? [],
    },
    tableViews: rateCardSchema.tableViews.map((tableView) =>
      tableView.key === "rateTable"
        ? {
            ...rateTable,
            columns: [
              ...rateTable.columns,
              {
                type: "computed",
                computedValue: "rateMargin",
                label: "Margin",
                align: "end",
                width: "sm",
                suffix: "margin",
                format: "percent",
              },
            ],
            key: "rateTable",
          }
        : tableView,
    ),
  };
}
function rateCardSchemaWithOrdering(): AppSchema {
  const rateTable = rateCardSchema.tableViews.find((definition) => definition.key === "rateTable")!;
  const rateEntity = rateCardSchema.entities.find((definition) => definition.key === "rate")!;
  return parseAppSchema({
    ...rateCardSchema,
    entities: rateCardSchema.entities.map((entity) =>
      entity.key === "rate"
        ? {
            ...rateEntity,
            fields: [
              ...rateEntity.fields,
              {
                key: "sortOrder",
                type: "number",
                required: true,
                label: "Sort order",
                default: 1000,
                min: 0,
              },
            ],
            key: "rate",
          }
        : entity,
    ),
    tableViews: rateCardSchema.tableViews.map((tableView) =>
      tableView.key === "rateTable"
        ? {
            ...rateTable,
            ordering: {
              field: "sortOrder",
              scope: [{ kind: "field", field: "card" }],
              presentations: ["moveMenu"],
            },
            key: "rateTable",
          }
        : tableView,
    ),
  });
}
function rateCardSchemaWithDragOrdering(): AppSchema {
  const schema = rateCardSchemaWithOrdering();
  return parseAppSchema({
    ...schema,
    tableViews: schema.tableViews.map((tableView) =>
      tableView.key === "rateTable"
        ? {
            ...tableView,
            ordering: {
              field: "sortOrder",
              scope: [{ kind: "field", field: "card" }],
              presentations: ["dragHandle"],
            },
            key: "rateTable",
          }
        : tableView,
    ),
  });
}
function rateCardSchemaWithRateHomeResult(
  result: Extract<
    AppSchema["views"][number],
    {
      type: "collection";
    }
  >["result"],
): AppSchema {
  const rateHome = rateCardSchema.views.find((definition) => definition.key === "rateHome")!;
  const rateEntity = rateCardSchema.entities.find((definition) => definition.key === "rate")!;
  if (rateHome?.type !== "collection") {
    throw new Error("Missing rate home fixture.");
  }
  return parseAppSchema({
    ...rateCardSchema,
    entities: rateCardSchema.entities.map((entity) =>
      entity.key === "rate"
        ? {
            ...rateEntity,
            fields: [
              ...rateEntity.fields,
              {
                key: "sortOrder",
                type: "number",
                required: true,
                label: "Sort order",
                default: 1000,
                min: 0,
              },
            ],
            key: "rate",
          }
        : entity,
    ),
    views: rateCardSchema.views.map((view) =>
      view.key === "rateHome" ? { ...rateHome, result, key: "rateHome" } : view,
    ),
  });
}
function rateCardSchemaWithAggregateSummarySlots(): AppSchema {
  const rateHome = rateCardSchema.views.find(
    (definition) => definition.key === "rateHome",
  )! as Extract<
    AppSchema["views"][number],
    {
      type: "collection";
    }
  >;
  return {
    ...rateCardSchema,
    readModels: {
      computedValues: [
        {
          key: "rateMargin",
          entity: "rate",
          type: "number",
          expression: rateMarginExpression(),
        },
      ],
      aggregates: [
        {
          key: "selectedCardCostTotal",
          query: "ratesForSelectedCard",
          function: "sum",
          value: { kind: "field", field: "cost" },
        },
        {
          key: "selectedCardAverageMargin",
          query: "ratesForSelectedCard",
          function: "average",
          value: { kind: "computed", computedValue: "rateMargin" },
        },
      ],
    },
    views: rateCardSchema.views.map((view) =>
      view.key === "rateHome"
        ? {
            ...rateHome,
            result:
              rateHome.result.type === "table"
                ? { type: "table", tableView: rateHome.result.tableView }
                : rateHome.result,
            summary: [
              {
                type: "aggregate",
                aggregate: "selectedCardCostTotal",
                label: "Cost total",
                suffix: "/ day",
                format: "currency",
              },
              {
                type: "aggregate",
                aggregate: "selectedCardAverageMargin",
                label: "Average margin",
                format: "percent",
              },
            ],
            key: "rateHome",
          }
        : view,
    ),
  };
}
function rateMarginExpression(): NumericExpression {
  return {
    kind: "binary",
    op: "divide",
    left: {
      kind: "binary",
      op: "subtract",
      left: { kind: "field", field: "price" },
      right: { kind: "field", field: "cost" },
    },
    right: { kind: "field", field: "price" },
  };
}

function tableColumnEditors(columns: TableColumnConfig[]) {
  return columns.map(tableColumnEditor);
}

function tableColumnCommits(columns: TableColumnConfig[]) {
  return columns.map(tableColumnCommit);
}

function tableColumnEditor(column: TableColumnConfig) {
  if (column.type !== "field" && column.type !== "referenceField") {
    return null;
  }

  return column.editor;
}

function tableColumnCommit(column: TableColumnConfig) {
  if (column.type !== "field" && column.type !== "referenceField") {
    return null;
  }

  return column.commit;
}

function findFieldTableColumn(columns: TableColumnConfig[], fieldName: string) {
  return columns.find(
    (column): column is FieldTableColumnConfig =>
      column.type === "field" && column.fieldName === fieldName,
  );
}
function discriminatedTaskSchema(
  options: {
    fixedCreateKind?: "role" | "stream" | "custom";
  } = {},
): AppSchema {
  const createFields =
    options.fixedCreateKind === undefined
      ? [
          { field: "title", editor: "text" },
          { field: "kind", editor: "enum" },
        ]
      : [{ field: "title", editor: "text" }];
  return parseAppSchema({
    version: 1,
    entities: [
      {
        id: "entity_fa8a7fd7-f3cf-466b-bb8d-354d6d512011",
        key: "task",
        label: "Task",
        fields: [
          { key: "title", type: "text", required: true },
          { key: "done", type: "boolean", required: true, default: false },
          {
            key: "kind",
            type: "enum",
            required: true,
            default: "role",
            values: [
              { key: "role", label: "Role" },
              { key: "stream", label: "Stream" },
              { key: "custom", label: "Custom" },
            ],
          },
        ],
        operations: testWriteOperations("Task", ["title", "done", "kind"]),
      },
    ],
    unions: [
      {
        key: "taskByKind",
        entity: "task",
        discriminator: "kind",
        variants: [
          {
            key: "role",
            label: "Role",
            fields: ["title"],
          },
          {
            key: "stream",
            label: "Stream",
            fields: ["title", "done"],
          },
        ],
        fallback: {
          label: "Task",
          fields: ["title", "kind"],
        },
      },
    ],
    queries: [
      {
        key: "taskAll",
        label: "All",
        entity: "task",
        expression: { kind: "all" },
      },
    ],
    itemViews: [
      {
        key: "taskVariantItem",
        entity: "task",
        fields: [{ field: "kind", editor: "enum", commit: "immediate" }],
        union: "taskByKind",
        variants: [
          {
            variant: "role",
            presentation: "fields",
            fields: [{ field: "title", editor: "text", commit: "field-commit" }],
          },
          {
            variant: "stream",
            presentation: "contextLink",
            labelField: "title",
            target: { kind: "selectContext", context: "task", record: "self" },
          },
        ],
        fallback: {
          presentation: "fields",
          fields: [{ field: "kind", editor: "enum", commit: "immediate" }],
        },
      },
    ],
    tableViews: [
      {
        key: "taskEditTable",
        entity: "task",
        operations: [
          {
            operation: "task.update",
            label: "Edit task",
            target: { kind: "row" },
            editView: "taskEdit",
          },
        ],
        columns: [
          { type: "field", field: "title" },
          { type: "operationControl", operation: "task.update" },
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
        result: { type: "list", itemView: "taskVariantItem" },
        operations: [{ operation: "task.create", createView: "taskCreate" }],
      },
      {
        key: "taskEditHome",
        type: "collection",
        label: "Task edits",
        entity: "task",
        navigation: { primary: false },
        queries: [{ query: "taskAll" }],
        defaultQuery: "taskAll",
        result: { type: "table", tableView: "taskEditTable" },
      },
      {
        type: "create",
        entity: "task",
        fields: createFields,
        ...(options.fixedCreateKind === undefined
          ? {}
          : {
              defaults: {
                kind: { kind: "literal", value: options.fixedCreateKind },
              },
            }),
        union: "taskByKind",
        variants: [
          {
            variant: "role",
            presentation: "fields",
            fields: [{ field: "title", editor: "text" }],
          },
          {
            variant: "stream",
            presentation: "fields",
            fields: [{ field: "done", editor: "boolean" }],
          },
        ],
        fallback: {
          presentation: "fields",
          fields: [{ field: "kind", editor: "enum" }],
        },
        key: "taskCreate",
      },
      {
        key: "taskEdit",
        type: "edit",
        entity: "task",
        fields: [{ field: "kind", editor: "enum", commit: "immediate" }],
        union: "taskByKind",
        variants: [
          {
            variant: "role",
            presentation: "fields",
            fields: [{ field: "title", editor: "text", commit: "field-commit" }],
          },
          {
            variant: "stream",
            presentation: "fields",
            fields: [{ field: "done", editor: "boolean", commit: "immediate" }],
          },
        ],
        fallback: {
          presentation: "fields",
          fields: [{ field: "kind", editor: "enum", commit: "immediate" }],
        },
      },
    ],
    screens: [
      {
        key: "taskHome",
        type: "workspace",
        label: "Tasks",
        layout: {
          type: "stack",
          sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
        },
      },
    ],
  });
}
function taskSchemaWithFieldPresentations(): AppSchema {
  const rawSchema = structuredClone(appSchema);
  const taskEntity = rawSchema.entities.find((definition) => definition.key === "task")!;
  const priority = taskEntity?.fields.find((definition) => definition.key === "priority")!;
  const itemView = rawSchema.itemViews.find((definition) => definition.key === "taskListItem")!;
  const createView = rawSchema.views.find((definition) => definition.key === "taskCreate")!;
  if (!taskEntity || priority?.type !== "enum" || !itemView || createView?.type !== "create") {
    throw new Error("Missing task presentation fixture shape.");
  }
  priority.values.find((definition) => definition.key === "low")!.presentation = {
    icon: "priority-marker",
    color: "priority.low",
  };
  priority.values.find((definition) => definition.key === "normal")!.presentation = {
    icon: "priority-marker",
    color: "priority.normal",
  };
  priority.values.find((definition) => definition.key === "high")!.presentation = {
    icon: "priority-marker",
    color: "priority.high",
  };
  setFieldDefinition(itemView.fields, "dueDate", {
    ...itemView.fields.find((definition) => definition.field === "dueDate")!,
    presentation: { visibility: "valueOrInteraction" as const },
  });
  setFieldDefinition(itemView.fields, "priority", {
    ...itemView.fields.find((definition) => definition.field === "priority")!,
    presentation: { list: "both" as const, mode: "iconOnly" as const, trigger: "icon" as const },
  });
  setFieldDefinition(itemView.fields, "done", {
    ...itemView.fields.find((definition) => definition.field === "done")!,
    presentation: { mode: "completion" as const },
  });
  setFieldDefinition(createView.fields, "dueDate", {
    ...createView.fields.find((definition) => definition.field === "dueDate")!,
    presentation: { visibility: "valueOrInteraction" as const },
  });
  setFieldDefinition(createView.fields, "priority", {
    ...createView.fields.find((definition) => definition.field === "priority")!,
    presentation: { list: "label" as const, mode: "iconOnly" as const, trigger: "both" as const },
  });
  return parseAppSchema(rawSchema);
}
function systemMetadataUiSchema(): AppSchema {
  return parseAppSchema({
    version: 1,
    entities: [
      {
        id: "entity_e1fe8678-c984-4dc9-9052-8135a85f1e77",
        key: "task",
        label: "Task",
        fields: [{ key: "title", type: "text", required: true, label: "Title" }],
        operations: testWriteOperations("Task", ["title"]),
      },
    ],
    queries: [{ key: "taskAll", label: "All", entity: "task", expression: { kind: "all" } }],
    itemViews: [
      {
        key: "taskItem",
        entity: "task",
        fields: [
          { field: "title", editor: "text", commit: "field-commit" },
          { field: "updatedAt", editor: "text", commit: "field-commit" },
        ],
      },
    ],
    tableViews: [
      {
        key: "taskTable",
        entity: "task",
        operations: [
          {
            operation: "task.update",
            label: "Edit task",
            target: { kind: "row" },
            editView: "taskEdit",
          },
        ],
        columns: [
          { type: "field", field: "updatedAt", display: "editor" },
          { type: "operationControl", operation: "task.update", label: "Actions" },
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
        operations: [{ operation: "task.create", createView: "taskCreate" }],
      },
      {
        key: "taskTableHome",
        type: "collection",
        label: "Task table",
        entity: "task",
        queries: [{ query: "taskAll" }],
        defaultQuery: "taskAll",
        result: { type: "table", tableView: "taskTable" },
      },
      {
        key: "taskCreate",
        type: "create",
        entity: "task",
        fields: [
          { field: "title", editor: "text" },
          { field: "updatedAt", editor: "text" },
        ],
      },
      {
        key: "taskEdit",
        type: "edit",
        entity: "task",
        fields: [
          { field: "title", editor: "text", commit: "field-commit" },
          { field: "updatedAt", editor: "text", commit: "field-commit" },
        ],
      },
    ],
    screens: [
      {
        key: "taskHome",
        type: "workspace",
        label: "Tasks",
        layout: {
          type: "stack",
          sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
        },
      },
    ],
  });
}
function summarizeHomeModel(model: HomeViewModel) {
  const collection = model.collection;
  return {
    viewName: model.viewName,
    label: model.label,
    entityName: collection.entityName,
    navigationPrimary: model.navigation.primary,
    context: collection.context
      ? {
          name: collection.context.name,
          entityName: collection.context.entityName,
          queryName: collection.context.queryName,
          labelField: collection.context.labelField,
          presentation: collection.context.presentation,
          relatedCollection: collection.context.relatedCollection
            ? {
                relationshipName: collection.context.relatedCollection.relationshipName,
                label: collection.context.relatedCollection.label,
                entityName: collection.context.relatedCollection.entityName,
                referenceFieldName: collection.context.relatedCollection.referenceFieldName,
              }
            : null,
          createOperation: collection.context.createOperation
            ? summarizeHomeOperation(collection.context.createOperation)
            : null,
          itemViewName: collection.context.itemViewName ?? null,
          recordFields: collection.context.recordFields?.map((field) => field.fieldName) ?? [],
        }
      : null,
    queries: collection.queries.tabs.map((tab) => ({
      queryName: tab.queryName,
      label: tab.label,
      count: tab.count?.type ?? null,
      expressionKind: tab.query.kind,
    })),
    defaultQueryName: collection.queries.defaultQueryName,
    result:
      collection.result.type === "list"
        ? {
            type: "list",
            itemViewName: collection.result.itemViewName,
            fields: collection.result.recordFields.map((field) => field.fieldName),
          }
        : collection.result.type === "record"
          ? {
              type: "record",
              itemViewName: collection.result.itemViewName,
              fields: collection.result.recordFields.map((field) => field.fieldName),
            }
          : collection.result.type === "tree"
            ? {
                type: "tree",
                relationshipName: collection.result.relationshipName,
                childFieldName: collection.result.childFieldName,
                childItemViewName: collection.result.childItemViewName,
                childFields: collection.result.childRecordFields.map((field) => field.fieldName),
                placementItemViewName: collection.result.placementItemViewName,
                placementFields:
                  collection.result.placementRecordFields?.map((field) => field.fieldName) ?? [],
                orderingField: collection.result.ordering?.fieldName ?? null,
                orderingPresentations: collection.result.ordering?.presentations ?? [],
                maxDepth: collection.result.maxDepth,
              }
            : {
                type: "table",
                tableViewName: collection.result.tableViewName,
                columns: collection.result.columns.map((column) => column.key),
                footer: collection.result.footer?.map((slot) => ({
                  columnKey: slot.columnKey,
                  aggregateName: slot.aggregateName,
                  label: slot.label,
                })),
              },
    operations: collection.operations.map(summarizeHomeOperation),
  };
}

function requiredCollectionModel(schema: AppSchema, viewName: string) {
  const model = selectCollectionModels(schema).find((candidate) => candidate.viewName === viewName);

  if (!model) {
    throw new Error(`Missing collection model ${viewName}.`);
  }

  return model;
}

function lifecycleTaskSchema() {
  return parseAppSchema({
    version: 1,
    entities: [
      {
        id: "entity_43dd7d3d-ef44-4fef-ac32-e8846c46ceef",
        key: "task",
        label: "Task",
        fields: [
          { key: "title", type: "text", required: true },
          {
            key: "status",
            type: "enum",
            required: true,
            default: "todo",
            values: [
              {
                key: "todo",
                label: "Todo",
                presentation: { color: "warning", icon: "priority-marker" },
              },
              {
                key: "doing",
                label: "Doing",
                presentation: { color: "success", icon: "priority-marker" },
              },
              { key: "done", label: "Done", presentation: { color: "success", icon: "confirm" } },
            ],
          },
        ],
        stateMachines: [
          {
            key: "statusFlow",
            field: "status",
            initial: "todo",
            terminal: ["done"],
            transitions: [
              { key: "start", label: "Start", from: ["todo"], to: "doing" },
              { key: "complete", label: "Complete", from: ["doing"], to: "done" },
            ],
          },
        ],
        operations: [
          ...testWriteOperations("Task", ["title", "status"]),
          {
            key: "startTask",
            label: "Start",
            kind: "command",
            scope: "record",
            effect: {
              type: "operationHandler",
              handler: "transition-state",
              config: {
                machine: "statusFlow",
                transition: "start",
              },
            },
            output: { type: "command" },
            idempotency: { required: true },
            audit: { input: "summary" },
          },
          {
            key: "completeTask",
            label: "Complete",
            kind: "command",
            scope: "record",
            effect: {
              type: "operationHandler",
              handler: "transition-state",
              config: {
                machine: "statusFlow",
                transition: "complete",
              },
            },
            output: { type: "command" },
            idempotency: { required: true },
            audit: { input: "summary" },
          },
        ],
      },
    ],
    queries: [{ key: "taskAll", label: "All", entity: "task", expression: { kind: "all" } }],
    itemViews: [
      {
        key: "taskItem",
        entity: "task",
        fields: [
          { field: "title", editor: "text", commit: "field-commit" },
          { field: "status", editor: "enum", commit: "immediate" },
        ],
      },
    ],
    tableViews: [
      {
        key: "taskTable",
        entity: "task",
        columns: [
          { type: "field", field: "title" },
          { type: "field", field: "status" },
          { type: "operationControl", operation: "task.update" },
        ],
        operations: [
          {
            operation: "task.update",
            label: "Edit task",
            target: { kind: "row" },
            editView: "taskEdit",
          },
        ],
      },
      {
        key: "taskHiddenStatusTable",
        entity: "task",
        columns: [
          { type: "field", field: "title" },
          { type: "field", field: "status", display: "hidden" },
        ],
      },
      {
        key: "taskAbsentStatusTable",
        entity: "task",
        columns: [{ type: "field", field: "title" }],
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
        operations: [{ operation: "task.create", createView: "taskCreate" }],
      },
      {
        key: "taskRecordHome",
        type: "collection",
        label: "Task",
        entity: "task",
        queries: [{ query: "taskAll" }],
        defaultQuery: "taskAll",
        result: { type: "record", itemView: "taskItem" },
      },
      {
        key: "taskTableHome",
        type: "collection",
        label: "Task table",
        entity: "task",
        queries: [{ query: "taskAll" }],
        defaultQuery: "taskAll",
        result: { type: "table", tableView: "taskTable" },
      },
      {
        key: "taskHiddenStatusTableHome",
        type: "collection",
        label: "Task hidden status table",
        entity: "task",
        queries: [{ query: "taskAll" }],
        defaultQuery: "taskAll",
        result: { type: "table", tableView: "taskHiddenStatusTable" },
      },
      {
        key: "taskAbsentStatusTableHome",
        type: "collection",
        label: "Task absent status table",
        entity: "task",
        queries: [{ query: "taskAll" }],
        defaultQuery: "taskAll",
        result: { type: "table", tableView: "taskAbsentStatusTable" },
      },
      {
        key: "taskCreate",
        type: "create",
        entity: "task",
        fields: [
          { field: "title", editor: "text" },
          { field: "status", editor: "enum" },
        ],
      },
      {
        key: "taskEdit",
        type: "edit",
        entity: "task",
        fields: [
          { field: "title", editor: "text", commit: "field-commit" },
          { field: "status", editor: "enum", commit: "immediate" },
        ],
      },
    ],
    screens: [
      {
        key: "taskHome",
        type: "workspace",
        label: "Tasks",
        layout: {
          type: "stack",
          sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
        },
      },
    ],
  });
}
function summarizeScreenModel(model: HomeScreenModel) {
  return {
    screenName: model.screenName,
    label: model.label,
    primary: model.navigation.primary,
    layoutType: model.layout.type,
    sections: model.layout.sections.map((section) => ({
      id: section.id,
      label: section.label,
      viewName: section.viewName,
      entityName: section.collection.entityName,
    })),
  };
}

function summarizeHomeOperation(operation: HomeOperationConfig) {
  if (operation.type === "create") {
    return {
      type: operation.type,
      label: operation.label,
      entityName: operation.entityName,
      fields: operation.fields.map((field) => field.fieldName),
      defaults: operation.defaults.map((defaultValue) => defaultValue.fieldName),
      enabled: operation.enabled,
    };
  }

  return {
    type: operation.type,
    label: operation.label,
    entityName: operation.entityName,
    operationName: operation.operationName,
    operationKey: operation.operation.canonicalKey,
    commandHandlerCapability: summarizeCommandHandlerCapability(
      operation.operation.operation.effect,
    ),
    showAffectedCountOnSuccess: operation.ui.showAffectedCountOnSuccess,
    targetCountQueryKind: operation.ui.targetCount?.query.kind ?? null,
    targetCountDisplay: operation.ui.targetCount?.display.type ?? null,
  };
}

function summarizeCommandHandlerCapability(effect: EntityOperationEffectSchema | undefined) {
  if (isOperationHandlerEffectForSelectionCapability(effect, "tombstoneQueryResultsTargetCount")) {
    return "tombstoneQueryResultsTargetCount";
  }
  return effect?.type ?? null;
}
function testWriteOperations(label: string, fields: string[]) {
  const input = {
    fields: fields.map((field) => ({ key: field, field })),
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
  ] satisfies NonNullable<AppSchema["entities"][number]["operations"]>;
}
function tableStaticUpdateOperation(
  label: string,
): NonNullable<AppSchema["entities"][number]["operations"]>[number] {
  return {
    key: "update",
    label,
    kind: "update",
    scope: "record",
    effect: { type: "patchRecord" },
    output: { type: "update" },
    idempotency: { required: true },
    audit: { input: "summary" },
  };
}
