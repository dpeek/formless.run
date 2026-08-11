import { describe, expect, it } from "vite-plus/test";

import { sourceLikeRateSchema } from "../test/schema-builders.ts";
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
      "field:price",
      "computed:rateMargin",
    ]);
    expect(result.columns.every((column) => column.display === "readOnly")).toBe(true);
    expect(result.columns.find((column) => column.key === "field:cost")).toMatchObject({
      valueUnit: { unitFieldName: "costUnit" },
    });
  });

  it("selects explicit ordering placements and all row operations in binding order", () => {
    const rateSourceSchema = sourceLikeRateSchema();
    const tableView = rateSourceSchema.tableViews.find(
      (definition) => definition.key === "rateTable",
    )!;
    tableView.operations = [
      { operation: "rate.update", label: "Edit rate" },
      {
        operation: "resource.update",
        label: "Edit resource",
        target: { kind: "reference", field: "resource" },
      },
    ];
    tableView.ordering = {
      field: "price",
      scope: [{ kind: "field", field: "card" }],
    };
    tableView.columns = [
      { type: "orderingHandle" },
      ...tableView.columns,
      { type: "operationControl", includeOrdering: true },
    ];

    const result = selectTableResultModel(
      rateSourceSchema,
      tableView,
      "rate",
      rateSourceSchema.entities.find((definition) => definition.key === "rate")!,
    );
    const operationColumn = result.columns.find((column) => column.type === "operationControl");
    expect(result.ordering).toMatchObject({
      fieldName: "price",
      scope: [{ kind: "field", fieldName: "card" }],
      presentations: ["dragHandle", "moveMenu"],
    });
    expect(operationColumn).toMatchObject({
      type: "operationControl",
      key: "operationControl:rate.update,resource.update,ordering",
      controls: [
        {
          type: "static",
          bindingName: "rate.update",
          operation: { canonicalKey: "rate.update" },
        },
        { type: "static", bindingName: "resource.update" },
      ],
      includeOrdering: true,
      align: "end",
      width: "xs",
    });
  });

  it("selects record links in declared column order independently from source fields", () => {
    const rateSourceSchema = sourceLikeRateSchema();
    const tableView = rateSourceSchema.tableViews.find(
      (definition) => definition.key === "rateTable",
    )!;
    tableView.links = [
      {
        key: "openResource",
        label: "Open resource",
        target: "newTab",
        destination: {
          type: "url",
          base: "https://example.test/open",
          query: [
            {
              name: "resource",
              source: {
                kind: "referenceField",
                referenceField: "resource",
                targetEntity: "resource",
                field: "name",
              },
              missing: "disable",
            },
          ],
        },
      },
    ];
    tableView.columns.splice(1, 0, {
      type: "linkControl",
      link: "openResource",
      label: "Destination",
    });

    const result = selectTableResultModel(
      rateSourceSchema,
      tableView,
      "rate",
      rateSourceSchema.entities.find((definition) => definition.key === "rate")!,
    );
    const linkColumn = result.columns.find((column) => column.type === "linkControl");

    expect(result.columns.map((column) => column.key)).toEqual([
      "referenceField:resource.name",
      "linkControl:openResource",
      "field:cost",
      "field:price",
      "computed:rateMargin",
    ]);
    expect(linkColumn).toMatchObject({
      type: "linkControl",
      key: "linkControl:openResource",
      linkName: "openResource",
      label: "Destination",
      headerLabel: "Destination",
      align: "end",
      width: "xs",
      display: "readOnly",
      format: "plain",
      link: {
        key: "openResource",
        label: "Open resource",
        target: "newTab",
      },
    });
    expect(linkColumn?.link).toBe(tableView.links[0]);
    expect(
      result.columns.some(
        (column) =>
          column.type === "referenceField" &&
          column.sourceReferenceFieldName === "resource" &&
          column.fieldName === "name",
      ),
    ).toBe(true);
  });
});
