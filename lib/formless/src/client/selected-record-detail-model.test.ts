import { describe, expect, it } from "vite-plus/test";
import {
  parseAppSchema,
  type AppSchema,
  type KeyedDefinition,
  type RecordLinkSchema,
  type SelectedRecordDetailSchema,
} from "@dpeek/formless-schema";
import { rateSourceSchema } from "../test/schema-apps.ts";
import { selectHomeSelectedRecordDetail } from "./selected-record-detail-model.ts";

describe("selected-record relationship-hierarchy model", () => {
  it("resolves heterogeneous root and child nodes, operations, item views, and create contexts", () => {
    const schema = relationshipHierarchySchema();
    const card = schema.entities.find((entity) => entity.key === "card")!;
    const detail = relationshipHierarchyDetail();
    const model = selectHomeSelectedRecordDetail(schema, detail, "card", card);

    expect(model.sections[0]).toMatchObject({
      id: "hierarchy",
      type: "relationshipHierarchy",
      entityName: "card",
      itemViewName: "cardListItem",
      result: { type: "record", itemViewName: "cardListItem" },
      links: [
        { key: "openCard", destination: { query: [{ source: { field: "name" } }] } },
        { key: "inspectCard", target: "newTab" },
      ],
      operations: [],
      relationships: [
        {
          id: "rates",
          relationshipName: "cardRates",
          entityName: "rate",
          itemViewName: "rateListItem",
          result: { type: "record", itemViewName: "rateListItem" },
          links: [
            { key: "openRate", destination: { query: [{ source: { field: "cost" } }] } },
            {
              key: "openResource",
              destination: {
                query: [
                  {
                    source: {
                      referenceField: "resource",
                      targetEntity: "resource",
                      field: "name",
                    },
                  },
                ],
              },
            },
          ],
          operations: [{ bindingName: "rate.update", label: "Edit rate" }],
          headerActions: [
            {
              kind: "recordOperation",
              bindingName: "card.update",
              label: "Edit card",
              content: { kind: "iconOnly", icon: "edit" },
            },
            {
              kind: "create",
              type: "create",
              entityName: "rate",
              operationName: "create",
              contextName: "card",
              content: { kind: "iconAndLabel", icon: "add", label: "Add rate" },
            },
          ],
          relationships: [
            {
              id: "adjustments",
              relationshipName: "rateAdjustments",
              entityName: "adjustment",
              itemViewName: "adjustmentItem",
              result: { type: "record", itemViewName: "adjustmentItem" },
              links: [
                { key: "openAdjustment", destination: { query: [{ source: { field: "label" } }] } },
              ],
              operations: [{ bindingName: "adjustment.update", label: "Update adjustment" }],
              headerActions: [
                {
                  kind: "create",
                  type: "create",
                  entityName: "adjustment",
                  operationName: "create",
                  contextName: "parentRate",
                  content: { kind: "label", label: "Create adjustment" },
                },
              ],
              relationships: [],
            },
          ],
        },
      ],
    });

    const hierarchyDetail = detail.sections[0];
    const hierarchyModel = model.sections[0];
    if (
      hierarchyDetail?.type !== "relationshipHierarchy" ||
      hierarchyModel?.type !== "relationshipHierarchy"
    ) {
      throw new Error("Expected relationship hierarchy.");
    }
    expect(hierarchyModel.links).toBe(hierarchyDetail.links);
    expect(hierarchyModel.relationships[0]?.links).toBe(hierarchyDetail.relationships[0]?.links);
    expect(hierarchyModel.relationships[0]?.relationships[0]?.links).toBe(
      hierarchyDetail.relationships[0]?.relationships?.[0]?.links,
    );

    const metadataLabelDetail = relationshipHierarchyDetail({
      relationships: [relationshipHierarchyRelationship({ label: undefined })],
    });
    const metadataLabelModel = selectHomeSelectedRecordDetail(
      schema,
      metadataLabelDetail,
      "card",
      card,
    );
    const metadataLabelHierarchy = metadataLabelModel.sections[0];
    if (metadataLabelHierarchy?.type !== "relationshipHierarchy") {
      throw new Error("Expected relationship hierarchy.");
    }
    expect(metadataLabelHierarchy.relationships[0]?.label).toBe("Rates");
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
              headerActions: [
                { kind: "create", operation: "resource.create", createView: "resourceCreate" },
              ],
            }),
          ],
        }),
        message: 'Selected-record relationship-hierarchy create action must use entity "rate".',
      },
      {
        detail: relationshipHierarchyDetail({
          relationships: [
            relationshipHierarchyRelationship({
              headerActions: [
                { kind: "create", operation: "rate.create", createView: "rateCreate" },
              ],
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
        links: [
          relationshipHierarchyLink("openCard", "Open card", { kind: "field", field: "name" }),
          relationshipHierarchyLink(
            "inspectCard",
            "Inspect card",
            { kind: "field", field: "name" },
            "newTab",
          ),
        ],
        operations: [],
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
    links: [
      relationshipHierarchyLink("openRate", "Open rate", { kind: "field", field: "cost" }),
      relationshipHierarchyLink("openResource", "Open resource", {
        kind: "referenceField",
        referenceField: "resource",
        targetEntity: "resource",
        field: "name",
      }),
    ],
    operations: [{ operation: "rate.update", label: "Edit rate" }],
    headerActions: [
      {
        kind: "recordOperation",
        operation: "card.update",
        label: "Edit card",
        content: { kind: "iconOnly", icon: "edit" },
      },
      {
        kind: "create",
        operation: "rate.create",
        createView: "rateCreateForCard",
        label: "Add rate",
        content: { kind: "iconAndLabel", icon: "add" },
      },
    ],
    relationships: [
      {
        id: "adjustments",
        label: "Adjustments",
        relationship: "rateAdjustments",
        itemView: "adjustmentItem",
        links: [
          relationshipHierarchyLink("openAdjustment", "Open adjustment", {
            kind: "field",
            field: "label",
          }),
        ],
        operations: [{ operation: "adjustment.update" }],
        headerActions: [
          {
            kind: "create",
            operation: "adjustment.create",
            createView: "adjustmentCreateForRate",
          },
        ],
      },
    ],
    ...overrides,
  };
}

function relationshipHierarchyLink(
  key: string,
  label: string,
  source: RecordLinkSchema["destination"]["query"][number]["source"],
  target: RecordLinkSchema["target"] = "sameTab",
): KeyedDefinition<RecordLinkSchema> {
  return {
    key,
    label,
    target,
    destination: {
      type: "url",
      base: "https://example.test/open",
      query: [{ name: "value", source, missing: "disable" }],
    },
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
        fields: [{ field: "label", editor: "text" }],
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
