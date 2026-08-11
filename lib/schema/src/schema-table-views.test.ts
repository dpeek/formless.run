import { describe, expect, it } from "vite-plus/test";

import { parseAppSchema, parseTableViews, type AppSchema, type EntitySchema } from "./index.ts";

describe("schema table views", () => {
  it("parses table columns, operation bindings, and ordering through the table parser", () => {
    const schema = tableParserSchema();
    const tableViews = parseTableViews(schema.tableViews, schema.entities, schema.readModels);
    expect(tableViews.find((definition) => definition.key === "rateTable")).toMatchObject({
      entity: "rate",
    });
    expect(
      tableViews
        .find((definition) => definition.key === "rateTable")
        ?.columns.map((column) => column.type),
    ).toEqual(["referenceField", "field", "field", "field", "computed"]);
    expect(tableViews.find((definition) => definition.key === "blockPlacementTable")).toMatchObject(
      {
        entity: "block-placement",
        operations: [
          {
            operation: "block.update",
            target: { kind: "reference", field: "block" },
            editView: "blockEdit",
          },
        ],
        ordering: {
          field: "order",
          scope: [
            { kind: "field", field: "parent" },
            { kind: "field", field: "slot" },
          ],
        },
        columns: [
          { type: "orderingHandle" },
          { type: "field", field: "slot" },
          { type: "referenceField", referenceField: "block", field: "label" },
          { type: "operationControl", includeOrdering: true },
        ],
      },
    );
  });
  it("rejects invalid table parser cases without mutating fixed fixtures", () => {
    const invalidSchema = tableParserSourceSchema();
    invalidSchema.tableViews.find((definition) => definition.key === "rateTable")!.columns = [
      { type: "field", field: "missing" },
    ];
    expect(() => parseAppSchema(invalidSchema)).toThrow('references unknown field "rate.missing"');
    expect(
      tableParserSchema()
        .tableViews.find((definition) => definition.key === "rateTable")!
        .columns.map((column) => column.type),
    ).toEqual(["referenceField", "field", "field", "field", "computed"]);
  });
  it("rejects table-local control declarations and unknown command columns", () => {
    expect(() =>
      parseAppSchema({
        ...tableParserSourceSchema(),
        tableViews: tableParserSourceSchema().tableViews.map((definition) =>
          definition.key === "rateTable"
            ? {
                ...definition,
                controls: {
                  inspect: { label: "Inspect" },
                },
              }
            : definition,
        ),
      }),
    ).toThrow('Table view "rateTable" has unsupported key "controls"');
    expect(() =>
      parseAppSchema({
        ...tableParserSourceSchema(),
        tableViews: tableParserSourceSchema().tableViews.map((definition) =>
          definition.key === "rateTable"
            ? {
                ...definition,
                columns: [{ type: "invokeCommand", command: "inspect" }],
              }
            : definition,
        ),
      }),
    ).toThrow(
      'Table view "rateTable" column 0 type must be "field", "referenceField", "computed", "linkControl", "operationControl", or "orderingHandle".',
    );
  });
  it("parses system field display columns without requiring value fields", () => {
    const schema = tableParserSchema();
    schema.tableViews.find((definition) => definition.key === "rateTable")!.columns = [
      ...schema.tableViews.find((definition) => definition.key === "rateTable")!.columns,
      { type: "field", field: "updatedAt" },
      { type: "referenceField", referenceField: "resource", field: "createdAt" },
    ];

    const tableViews = parseTableViews(schema.tableViews, schema.entities, schema.readModels);
    expect(
      tableViews.find((definition) => definition.key === "rateTable")?.columns.slice(-2),
    ).toEqual([
      { type: "field", field: "updatedAt" },
      { type: "referenceField", referenceField: "resource", field: "createdAt" },
    ]);
  });
});

function tableParserSchema(): AppSchema {
  return parseAppSchema(tableParserSourceSchema());
}
function tableParserSourceSchema() {
  const entities = [
    {
      key: "resource",
      ...entity("entity_68051a1e-d2fa-4a61-9df5-1cd22bf5b847", "Resource", {
        name: { type: "text", required: true, label: "Name" },
      }),
    },
    {
      key: "card",
      ...entity("entity_7ca1437e-d3c8-46b8-a28e-a4cef4d9895f", "Card", {
        label: { type: "text", required: true, label: "Label" },
      }),
    },
    {
      key: "rate",
      ...entity("entity_99a7b8fc-b272-45b5-ba27-7c520563a255", "Rate", {
        resource: { type: "reference", required: true, to: "resource", displayField: "name" },
        card: { type: "reference", required: true, to: "card", displayField: "label" },
        cost: { type: "number", required: true, label: "Cost" },
        price: { type: "number", required: true, label: "Price" },
        active: { type: "boolean", required: true, label: "Active", default: true },
      }),
    },
    {
      key: "block",
      ...entity(
        "entity_1a862c75-4020-4809-8c71-039a5c0a9942",
        "Block",
        {
          label: { type: "text", required: true, label: "Label" },
        },
        {
          operations: [{ key: "update", ...updateOperation("Update Block") }],
        },
      ),
    },
    {
      key: "block-placement",
      ...entity("entity_0a15b659-4321-42c7-97a8-2830e1a767af", "Block placement", {
        parent: { type: "reference", required: true, to: "block", displayField: "label" },
        block: { type: "reference", required: true, to: "block", displayField: "label" },
        slot: {
          type: "enum",
          required: true,
          values: [
            { key: "main", label: "Main" },
            { key: "sidebar", label: "Sidebar" },
          ],
        },
        order: { type: "number", required: true },
      }),
    },
  ];
  return {
    version: 1,
    entities,
    queries: [
      { key: "rates", label: "Rates", entity: "rate", expression: { kind: "all" } },
      {
        key: "placements",
        label: "Placements",
        entity: "block-placement",
        expression: { kind: "all" },
      },
    ],
    readModels: {
      computedValues: [
        {
          key: "margin",
          entity: "rate",
          type: "number",
          expression: {
            kind: "binary",
            op: "subtract",
            left: { kind: "field", field: "price" },
            right: { kind: "field", field: "cost" },
          },
        },
      ],
    },
    itemViews: [
      {
        key: "blockItem",
        entity: "block",
        fields: [{ field: "label", editor: "text" }],
      },
      {
        key: "rateItem",
        entity: "rate",
        fields: [
          { field: "resource", editor: "reference" },
          { field: "cost", editor: "number" },
        ],
      },
    ],
    tableViews: [
      {
        key: "rateTable",
        entity: "rate",
        columns: [
          { type: "referenceField", referenceField: "resource", field: "name" },
          { type: "field", field: "cost" },
          { type: "field", field: "price" },
          { type: "field", field: "active" },
          { type: "computed", computedValue: "margin" },
        ],
      },
      {
        key: "blockPlacementTable",
        entity: "block-placement",
        operations: [
          {
            operation: "block.update",
            label: "Edit child",
            target: { kind: "reference", field: "block" },
            editView: "blockEdit",
          },
        ],
        ordering: {
          field: "order",
          scope: [
            { kind: "field", field: "parent" },
            { kind: "field", field: "slot" },
          ],
        },
        columns: [
          { type: "orderingHandle" },
          { type: "field", field: "slot" },
          { type: "referenceField", referenceField: "block", field: "label" },
          { type: "operationControl", includeOrdering: true },
        ],
      },
    ],
    views: [
      {
        key: "rates",
        type: "collection",
        label: "Rates",
        entity: "rate",
        queries: [{ query: "rates" }],
        defaultQuery: "rates",
        result: { type: "table", tableView: "rateTable" },
      },
      {
        key: "placements",
        type: "collection",
        label: "Placements",
        entity: "block-placement",
        queries: [{ query: "placements" }],
        defaultQuery: "placements",
        result: { type: "table", tableView: "blockPlacementTable" },
      },
      {
        key: "blockEdit",
        type: "edit",
        entity: "block",
        fields: [{ field: "label", editor: "text" }],
      },
    ],
    screens: [
      {
        key: "home",
        type: "workspace",
        label: "Home",
        layout: {
          type: "stack",
          sections: [
            { id: "rates", type: "collection", view: "rates" },
            { id: "placements", type: "collection", view: "placements" },
          ],
        },
      },
    ],
  };
}
function entity(
  id: `entity_${string}`,
  label: string,
  fields: Record<string, Record<string, unknown>>,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    label,
    fields: Object.entries(fields).map(([key, definition]) => ({ key, ...definition })),
    ...overrides,
  };
}
function updateOperation(
  label: string,
): Omit<NonNullable<EntitySchema["operations"]>[number], "key"> {
  return {
    label,
    kind: "update",
    scope: "record",
    effect: { type: "patchRecord" },
    output: { type: "update" },
    idempotency: { required: true },
    audit: { input: "summary" },
  };
}
