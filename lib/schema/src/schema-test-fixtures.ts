export function taskSchema(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    entities: [{ key: "task", ...taskEntity() }],
    queries: [
      {
        key: "taskAll",
        label: "All tasks",
        entity: "task",
        expression: { kind: "all" },
      },
    ],
    itemViews: [
      {
        key: "taskItem",
        entity: "task",
        fields: [
          { field: "title", editor: "text" },
          { field: "done", editor: "boolean" },
        ],
      },
    ],
    tableViews: [],
    views: [
      { key: "taskHome", ...taskCollectionView() },
      {
        key: "taskCreate",
        type: "create",
        entity: "task",
        fields: [{ field: "title", editor: "text" }],
      },
    ],
    screens: [{ key: "home", ...taskScreen() }],
    ...overrides,
  };
}

export function taskEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: "entity_65f1689f-ce51-457f-b4da-b46775132ff6",
    label: "Task",
    fields: [
      { key: "title", type: "text", required: true, label: "Title" },
      {
        key: "details",
        type: "text",
        required: false,
        label: "Details",
        format: "markdown",
      },
      { key: "done", type: "boolean", required: true, label: "Done", default: false },
      { key: "dueDate", type: "date", required: false, label: "Due date" },
      { key: "estimate", type: "number", required: false, label: "Estimate", min: 0 },
      {
        key: "priority",
        type: "enum",
        required: true,
        label: "Priority",
        default: "normal",
        values: [
          { key: "normal", label: "Normal" },
          { key: "high", label: "High" },
        ],
      },
    ],
    operations: [
      {
        key: "create",
        label: "Create task",
        kind: "create",
        scope: "collection",
        input: {
          fields: [
            { key: "title", field: "title" },
            { key: "details", field: "details" },
            { key: "done", field: "done" },
            { key: "dueDate", field: "dueDate" },
            { key: "estimate", field: "estimate" },
            { key: "priority", field: "priority" },
          ],
        },
        effect: { type: "createRecord" },
        output: { type: "create" },
        idempotency: { required: true },
        audit: { input: "summary" },
      },
      {
        key: "update",
        label: "Update task",
        kind: "update",
        scope: "record",
        effect: { type: "patchRecord" },
        output: { type: "update" },
        idempotency: { required: true },
        audit: { input: "summary" },
      },
    ],
    ...overrides,
  };
}

export function taskCollectionView(overrides: Record<string, unknown> = {}) {
  return {
    type: "collection",
    label: "Tasks",
    entity: "task",
    queries: [{ query: "taskAll", count: { type: "count" } }],
    defaultQuery: "taskAll",
    result: { type: "list", itemView: "taskItem" },
    operations: [{ operation: "task.create", createView: "taskCreate" }],
    ...overrides,
  };
}

export function taskScreen(overrides: Record<string, unknown> = {}) {
  return {
    type: "workspace",
    label: "Tasks",
    layout: {
      type: "stack",
      sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
    },
    ...overrides,
  };
}

export function rateSchema(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    entities: rateEntities(),
    relationships: rateRelationships(),
    queries: [
      {
        key: "resourceAll",
        label: "All resources",
        entity: "resource",
        expression: { kind: "all" },
      },
      {
        key: "cardAll",
        label: "All cards",
        entity: "card",
        expression: { kind: "all" },
      },
      {
        key: "rateAll",
        label: "All rates",
        entity: "rate",
        expression: { kind: "all" },
      },
    ],
    itemViews: [
      {
        key: "rateItem",
        entity: "rate",
        fields: [
          { field: "resource", editor: "reference" },
          { field: "card", editor: "reference" },
          { field: "cost", editor: "number" },
        ],
      },
    ],
    tableViews: [],
    views: [
      {
        key: "rateHome",
        type: "collection",
        label: "Rates",
        entity: "rate",
        queries: [{ query: "rateAll" }],
        defaultQuery: "rateAll",
        result: { type: "list", itemView: "rateItem" },
      },
    ],
    screens: [
      {
        key: "home",
        type: "workspace",
        label: "Rates",
        layout: {
          type: "stack",
          sections: [{ id: "rates", type: "collection", view: "rateHome" }],
        },
      },
    ],
    ...overrides,
  };
}
export function rateEntities(rateOverrides: Record<string, unknown> = {}) {
  return [
    {
      key: "resource",
      id: "entity_4460d90d-c80a-4e59-ba40-6dff39fcbefa",
      label: "Resource",
      fields: [{ key: "name", type: "text", required: true, label: "Name" }],
    },
    {
      key: "card",
      id: "entity_3ecbb906-a6bb-41b3-bf03-56fce486c8b0",
      label: "Rate card",
      fields: [{ key: "name", type: "text", required: true, label: "Name" }],
    },
    {
      key: "rate",
      id: "entity_5765bc5e-bb86-4488-99be-802262e780e2",
      label: "Rate",
      fields: [
        {
          key: "resource",
          type: "reference",
          required: true,
          label: "Resource",
          to: "resource",
          displayField: "name",
        },
        {
          key: "card",
          type: "reference",
          required: true,
          label: "Rate card",
          to: "card",
          displayField: "name",
        },
        { key: "cost", type: "number", required: true, label: "Cost", default: 0, min: 0 },
      ],
      constraints: [
        {
          key: "uniqueRatePair",
          kind: "unique",
          fields: ["resource", "card"],
        },
      ],
      ...rateOverrides,
    },
  ];
}
export function rateRelationships() {
  return [
    {
      key: "rateCard",
      kind: "toOne",
      label: "Rate card",
      from: { entity: "rate", field: "card" },
      to: { entity: "card" },
      inverse: "cardRates",
    },
    {
      key: "cardRates",
      kind: "toMany",
      label: "Rates",
      from: { entity: "card" },
      to: { entity: "rate", field: "card" },
      inverse: "rateCard",
    },
    {
      key: "cardResources",
      kind: "manyToMany",
      label: "Resources",
      from: { entity: "card" },
      to: { entity: "resource" },
      through: {
        entity: "rate",
        fromField: "card",
        toField: "resource",
        uniqueConstraint: "uniqueRatePair",
      },
      inverse: "resourceCards",
    },
    {
      key: "resourceCards",
      kind: "manyToMany",
      label: "Rate cards",
      from: { entity: "resource" },
      to: { entity: "card" },
      through: {
        entity: "rate",
        fromField: "resource",
        toField: "card",
        uniqueConstraint: "uniqueRatePair",
      },
      inverse: "cardResources",
    },
  ];
}
