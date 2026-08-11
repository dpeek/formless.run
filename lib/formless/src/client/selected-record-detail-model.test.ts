import { describe, expect, it } from "vite-plus/test";
import {
  parseAppSchema,
  type AppSchema,
  type SelectedRecordDetailSchema,
} from "@dpeek/formless-schema";
import { rateSourceSchema } from "../test/schema-apps.ts";
import { selectHomeSelectedRecordDetail } from "./selected-record-detail-model.ts";

describe("selected-record relationship-hierarchy model", () => {
  it("resolves heterogeneous root and child nodes, operations, item views, and create contexts", () => {
    const schema = relationshipHierarchySchema();
    const card = schema.entities.find((entity) => entity.key === "card")!;
    const model = selectHomeSelectedRecordDetail(
      schema,
      relationshipHierarchyDetail(),
      "card",
      card,
    );

    expect(model.sections[0]).toMatchObject({
      id: "hierarchy",
      type: "relationshipHierarchy",
      entityName: "card",
      itemViewName: "cardListItem",
      result: { type: "record", itemViewName: "cardListItem" },
      operations: [{ bindingName: "card.update", label: "Edit card" }],
      relationships: [
        {
          id: "rates",
          relationshipName: "cardRates",
          entityName: "rate",
          itemViewName: "rateListItem",
          result: { type: "record", itemViewName: "rateListItem" },
          operations: [{ bindingName: "rate.update", label: "Edit rate" }],
          createAction: {
            type: "create",
            entityName: "rate",
            operationName: "create",
            contextName: "card",
          },
          relationships: [
            {
              id: "adjustments",
              relationshipName: "rateAdjustments",
              entityName: "adjustment",
              itemViewName: "adjustmentItem",
              result: { type: "record", itemViewName: "adjustmentItem" },
              operations: [{ bindingName: "adjustment.update", label: "Update adjustment" }],
              createAction: {
                type: "create",
                entityName: "adjustment",
                operationName: "create",
                contextName: "parentRate",
              },
              relationships: [],
            },
          ],
        },
      ],
    });
  });

  it("rejects incompatible hierarchy entities, relationships, item views, operations, and create views", () => {
    const schema = relationshipHierarchySchema();
    const card = schema.entities.find((entity) => entity.key === "card")!;
    const invalidCases: Array<{
      schema?: AppSchema;
      detail: SelectedRecordDetailSchema;
      message: string;
    }> = [
      {
        detail: relationshipHierarchyDetail({ itemView: "rateListItem" }),
        message: 'Selected-record hierarchy item view "rateListItem" must use entity "card".',
      },
      {
        detail: relationshipHierarchyDetail({
          relationships: [relationshipHierarchyRelationship({ relationship: "resourceRates" })],
        }),
        message:
          'Selected-record hierarchy relationship "resourceRates" must start from entity "card".',
      },
      {
        schema: { ...schema, entities: schema.entities.filter((entity) => entity.key !== "rate") },
        detail: relationshipHierarchyDetail(),
        message: 'Missing selected-record hierarchy entity "rate".',
      },
      {
        detail: relationshipHierarchyDetail({
          relationships: [relationshipHierarchyRelationship({ itemView: "cardListItem" })],
        }),
        message: 'Selected-record hierarchy item view "cardListItem" must use entity "rate".',
      },
      {
        detail: relationshipHierarchyDetail({
          relationships: [
            relationshipHierarchyRelationship({ operations: [{ operation: "card.update" }] }),
          ],
        }),
        message: 'Missing selected-record relationship-hierarchy operation binding "card.update".',
      },
      {
        detail: relationshipHierarchyDetail({
          relationships: [
            relationshipHierarchyRelationship({
              createAction: { operation: "resource.create", createView: "resourceCreate" },
            }),
          ],
        }),
        message: 'Selected-record relationship-hierarchy create action must use entity "rate".',
      },
      {
        detail: relationshipHierarchyDetail({
          relationships: [
            relationshipHierarchyRelationship({
              createAction: { operation: "rate.create", createView: "rateCreate" },
            }),
          ],
        }),
        message:
          'Selected-record relationship-hierarchy create view "rateCreate" must default relationship field "rate.card" from one context.',
      },
    ];

    for (const invalid of invalidCases) {
      expect(() =>
        selectHomeSelectedRecordDetail(invalid.schema ?? schema, invalid.detail, "card", card),
      ).toThrow(invalid.message);
    }
  });
});

function relationshipHierarchyDetail(
  overrides: Record<string, unknown> = {},
): SelectedRecordDetailSchema {
  return {
    type: "selectedRecord",
    context: "selectedCard",
    sections: [
      {
        id: "hierarchy",
        type: "relationshipHierarchy",
        label: "Rate card hierarchy",
        itemView: "cardListItem",
        operations: [{ operation: "card.update", label: "Edit card" }],
        relationships: [relationshipHierarchyRelationship()],
        ...overrides,
      },
    ],
  } as SelectedRecordDetailSchema;
}

function relationshipHierarchyRelationship(overrides: Record<string, unknown> = {}) {
  return {
    id: "rates",
    label: "Rates",
    relationship: "cardRates",
    itemView: "rateListItem",
    operations: [{ operation: "rate.update", label: "Edit rate" }],
    createAction: {
      operation: "rate.create",
      createView: "rateCreateForCard",
      label: "Add rate",
    },
    relationships: [
      {
        id: "adjustments",
        label: "Adjustments",
        relationship: "rateAdjustments",
        itemView: "adjustmentItem",
        operations: [{ operation: "adjustment.update" }],
        createAction: {
          operation: "adjustment.create",
          createView: "adjustmentCreateForRate",
        },
      },
    ],
    ...overrides,
  };
}

function relationshipHierarchySchema(): AppSchema {
  return parseAppSchema({
    ...rateSourceSchema,
    entities: [
      ...rateSourceSchema.entities,
      {
        key: "adjustment",
        id: "entity_2cf12865-498a-4e42-92fc-d0f63a796622",
        label: "Adjustment",
        fields: [
          { key: "label", type: "text", required: true, label: "Label" },
          {
            key: "rate",
            type: "reference",
            required: true,
            label: "Rate",
            to: "rate",
          },
        ],
        operations: [
          {
            key: "create",
            label: "Create adjustment",
            kind: "create",
            scope: "collection",
            effect: { type: "createRecord" },
          },
          {
            key: "update",
            label: "Update adjustment",
            kind: "update",
            scope: "record",
            effect: { type: "patchRecord" },
          },
        ],
      },
    ],
    relationships: [
      ...(rateSourceSchema.relationships ?? []),
      {
        key: "rateAdjustments",
        kind: "toMany",
        from: { entity: "rate" },
        to: { entity: "adjustment", field: "rate" },
      },
    ],
    itemViews: [
      ...rateSourceSchema.itemViews,
      {
        key: "adjustmentItem",
        entity: "adjustment",
        fields: [{ field: "label", editor: "text", commit: "field-commit" }],
      },
    ],
    views: [
      ...rateSourceSchema.views,
      {
        key: "adjustmentCreateForRate",
        type: "create",
        entity: "adjustment",
        fields: [{ field: "label", editor: "text" }],
        defaults: { rate: { kind: "context", name: "parentRate" } },
      },
    ],
  });
}
