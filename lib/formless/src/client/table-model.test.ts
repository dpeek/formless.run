import { describe, expect, it } from "vite-plus/test";

import { sourceLikeRateSchema, sourceLikeSiteSchema } from "../test/schema-builders.ts";
import { selectTableResultModel } from "./table-model.ts";

describe("table model", () => {
  it("selects render-ready rate table columns", () => {
    const rateSourceSchema = sourceLikeRateSchema();
    const result = selectTableResultModel(
      rateSourceSchema,
      rateSourceSchema.tableViews.find((definition) => definition.key === "rateTable")!,
      "rate",
      rateSourceSchema.entities.find((definition) => definition.key === "rate")!,
    );
    expect(result.columns.map((column) => column.key)).toEqual([
      "referenceField:resource.name",
      "field:cost",
      "field:costUnit",
      "field:price",
      "computed:rateMargin",
    ]);
  });
  it("propagates field presentation metadata into table columns", () => {
    const rateSourceSchema = sourceLikeRateSchema();
    const rateTable = rateSourceSchema.tableViews.find(
      (definition) => definition.key === "rateTable",
    )!;
    rateTable.columns = rateTable.columns.map((column) =>
      column.type === "field" && column.field === "costUnit"
        ? { ...column, presentation: { mode: "iconOnly" as const } }
        : column,
    );

    const result = selectTableResultModel(
      rateSourceSchema,
      rateTable,
      "rate",
      rateSourceSchema.entities.find((definition) => definition.key === "rate")!,
    );
    const costUnitColumn = result.columns.find(
      (column) => column.type === "field" && column.fieldName === "costUnit",
    );

    expect(costUnitColumn).toMatchObject({
      type: "field",
      fieldName: "costUnit",
      presentation: { mode: "iconOnly" },
    });
  });

  it("selects table ordering, row operation controls, and edit-dialog facts", () => {
    const siteSourceSchema = sourceLikeSiteSchema();
    const result = selectTableResultModel(
      siteSourceSchema,
      siteSourceSchema.tableViews.find((definition) => definition.key === "blockPlacementTable")!,
      "block-placement",
      siteSourceSchema.entities.find((definition) => definition.key === "block-placement")!,
    );
    const operationColumn = result.columns.find((column) => column.type === "operationControl");
    expect(result.ordering).toMatchObject({
      fieldName: "order",
      scope: [
        { kind: "field", fieldName: "parent" },
        { kind: "field", fieldName: "slot" },
      ],
      presentations: ["dragHandle", "moveMenu"],
    });
    expect(operationColumn).toMatchObject({
      type: "operationControl",
      key: "operationControl:block.update,ordering",
      controls: [
        {
          type: "editRecord",
          bindingName: "block.update",
          operation: { canonicalKey: "block.update" },
          target: { kind: "reference", fieldName: "block", entityName: "block" },
          editView: { viewName: "blockEdit", entityName: "block" },
        },
      ],
      includeOrdering: true,
    });
  });

  it("selects record links in declared column order independently from source fields", () => {
    const siteSourceSchema = sourceLikeSiteSchema();
    const tableView = siteSourceSchema.tableViews.find(
      (definition) => definition.key === "blockPlacementTable",
    )!;
    const operationColumnIndex = tableView.columns.findIndex(
      (column) => column.type === "operationControl",
    );
    tableView.links = [
      {
        key: "openBlock",
        label: "Open block",
        target: "newTab",
        destination: {
          type: "url",
          base: "https://example.test/open",
          query: [
            {
              name: "order",
              source: { kind: "field", field: "order" },
              missing: "disable",
            },
            {
              name: "href",
              source: {
                kind: "referenceField",
                referenceField: "block",
                targetEntity: "block",
                field: "href",
              },
              missing: "omit",
            },
          ],
        },
      },
    ];
    tableView.columns.splice(operationColumnIndex, 0, {
      type: "linkControl",
      link: "openBlock",
      label: "Destination",
    });

    const result = selectTableResultModel(
      siteSourceSchema,
      tableView,
      "block-placement",
      siteSourceSchema.entities.find((definition) => definition.key === "block-placement")!,
    );
    const linkColumn = result.columns.find((column) => column.type === "linkControl");

    expect(result.columns.map((column) => column.key)).toEqual([
      "orderingHandle",
      "field:block",
      "field:label",
      "field:slot",
      "linkControl:openBlock",
      "operationControl:block.update,ordering",
    ]);
    expect(linkColumn).toMatchObject({
      type: "linkControl",
      key: "linkControl:openBlock",
      linkName: "openBlock",
      label: "Destination",
      headerLabel: "Destination",
      align: "end",
      width: "xs",
      display: "readOnly",
      format: "plain",
      link: {
        key: "openBlock",
        label: "Open block",
        target: "newTab",
      },
    });
    expect(linkColumn?.link).toBe(tableView.links[0]);
    expect(
      result.columns.some((column) => column.type === "field" && column.fieldName === "order"),
    ).toBe(false);
    expect(
      result.columns.some(
        (column) =>
          column.type === "referenceField" &&
          column.sourceReferenceFieldName === "block" &&
          column.fieldName === "href",
      ),
    ).toBe(false);
    expect(result.columns.at(-1)).toMatchObject({
      type: "operationControl",
      key: "operationControl:block.update,ordering",
      controls: [{ bindingName: "block.update" }],
    });
  });
});
