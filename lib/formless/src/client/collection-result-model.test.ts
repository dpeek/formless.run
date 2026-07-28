import { describe, expect, it } from "vite-plus/test";

import type { AppSchema, CollectionViewSchema } from "@dpeek/formless-schema";
import { rateSourceSchema, siteSourceSchema, taskSourceSchema } from "../test/schema-apps.ts";
import { selectHomeResultModel } from "./collection-result-model.ts";
import { selectListResultModel } from "./list-result-model.ts";
import { selectTreeResultModel } from "./tree-result-model.ts";

describe("collection result model", () => {
  it("selects list result facts through the list result module", () => {
    const view = requiredCollectionView(taskSourceSchema, "taskHome");

    if (view.result.type !== "list") {
      throw new Error("Expected task home to use a list result.");
    }

    const result = selectListResultModel(
      taskSourceSchema,
      view.result,
      "task",
      taskSourceSchema.entities.find((definition) => definition.key === "task")!,
    );
    expect(result).toMatchObject({
      type: "list",
      itemViewName: "taskListItem",
    });
    expect(result.recordFields.map((field) => field.fieldName)).toEqual([
      "title",
      "dueDate",
      "priority",
      "done",
    ]);
  });
  it("selects table result columns and footer slots through the result dispatcher", () => {
    const view = requiredCollectionView(rateSourceSchema, "rateHome");
    const result = selectHomeResultModel(
      rateSourceSchema,
      view,
      rateSourceSchema.entities.find((definition) => definition.key === "rate")!,
    );
    if (result.type !== "table") {
      throw new Error("Expected rate home to use a table result.");
    }

    expect(result.columns.map((column) => column.key)).toEqual([
      "referenceField:resource.name",
      "field:cost",
      "field:costUnit",
      "field:price",
      "computed:rateMargin",
    ]);
    expect(
      result.footer?.map((slot) => ({
        columnKey: slot.columnKey,
        aggregateName: slot.aggregateName,
        label: slot.label,
        suffix: slot.suffix,
        format: slot.format,
      })),
    ).toEqual([
      {
        columnKey: "field:cost",
        aggregateName: "selectedCardAverageCost",
        label: "Average cost",
        suffix: "/ day",
        format: "currency",
      },
      {
        columnKey: "field:price",
        aggregateName: "selectedCardAveragePrice",
        label: "Average price",
        suffix: "/ day",
        format: "currency",
      },
      {
        columnKey: "computed:rateMargin",
        aggregateName: "selectedCardAverageMargin",
        label: "Average margin",
        suffix: undefined,
        format: "percent",
      },
    ]);
  });

  it("selects tree ordering, branch policy, and composition facts through the tree module", () => {
    const view = requiredCollectionView(siteSourceSchema, "siteCompositionHome");

    if (view.result.type !== "tree") {
      throw new Error("Expected Site composition to use a tree result.");
    }

    const result = selectTreeResultModel(
      siteSourceSchema,
      view.result,
      "block-placement",
      siteSourceSchema.entities.find((definition) => definition.key === "block-placement")!,
    );
    expect(result).toMatchObject({
      type: "tree",
      relationshipName: "blockPlacements",
      childFieldName: "block",
      childEntityName: "block",
      childItemViewName: "blockTreeNode",
      ordering: {
        fieldName: "order",
        scope: [
          { kind: "field", fieldName: "parent" },
          { kind: "field", fieldName: "slot" },
        ],
        presentations: ["dragHandle"],
      },
      composition: {
        create: {
          operationName: "addTreeChild",
          operation: { canonicalKey: "block-placement.addTreeChild" },
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
          operation: { canonicalKey: "block-placement.removeTreePlacement" },
          effect: {
            type: "operationHandler",
            handler: "remove-tree-placement",
            config: { relationship: "blockPlacements" },
          },
        },
      },
    });
    expect(result.placementUpdateOperation?.canonicalKey).toBe("block-placement.update");
    expect(result.childRecordUnion?.unionName).toBe("blockByType");
    expect(result.branches?.variants.leafVariantValues).toEqual(
      expect.arrayContaining(["postList", "projectList", "subscribeForm", "header", "footer"]),
    );
    expect(
      result.branches?.variants.allowedChildVariantsByParentVariant.feature?.map((child) => ({
        variantValue: child.variantValue,
        placementValues: child.placementValues,
      })),
    ).toEqual([
      { variantValue: "image", placementValues: { slot: "media" } },
      { variantValue: "link", placementValues: { slot: "actions" } },
    ]);
  });
});
function requiredCollectionView(schema: AppSchema, viewName: string): CollectionViewSchema {
  const view = schema.views.find((definition) => definition.key === viewName)!;
  if (!view || view.type !== "collection") {
    throw new Error(`Missing collection view "${viewName}".`);
  }

  return view;
}
