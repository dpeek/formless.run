import { describe, expect, it } from "vite-plus/test";

import type { TableColumnConfig, TableFooterSlotConfig } from "../../client/views.ts";
import type { FieldSchema } from "@dpeek/formless-schema";
import { selectGeneratedTablePresentation } from "./table-presentation.ts";

describe("selectGeneratedTablePresentation", () => {
  it("maps visible table facts to React Aria columns, rows, and cells", () => {
    const columns: TableColumnConfig[] = [
      orderingHandleColumn(),
      fieldColumn("title", textField()),
      hiddenFieldColumn("internalNote", textField()),
      operationControlColumn("archiveTask", ""),
    ];

    const presentation = selectGeneratedTablePresentation({
      columns,
      orderedRecordIds: ["task-2", "task-1"],
      query: { kind: "all" },
    });

    expect(presentation.columns.map((column) => column.id)).toEqual([
      "orderingHandle",
      "field:title",
      "operationControl:archiveTask",
    ]);
    expect(presentation.dataColumns.map((column) => column.column.key)).toEqual([
      "orderingHandle",
      "field:title",
      "operationControl:archiveTask",
    ]);
    expect(
      presentation.dataColumns.find((column) => column.id === "field:title")?.isRowHeader,
    ).toBe(true);
    expect(
      presentation.dataColumns.find((column) => column.id === "orderingHandle")?.isRowHeader,
    ).toBe(false);
    expect(
      presentation.dataColumns.find((column) => column.id === "operationControl:archiveTask")
        ?.header,
    ).toEqual({
      label: "",
      accessibleLabel: "Archive task",
      isVisuallyHidden: true,
    });
    expect(presentation.rows.map((row) => row.id)).toEqual(["task-2", "task-1"]);
    expect(presentation.rows[0]?.cells.map((cell) => cell.columnId)).toEqual([
      "orderingHandle",
      "field:title",
      "operationControl:archiveTask",
    ]);
    expect(presentation.emptyState.visible).toBe(false);
  });

  it("keeps aggregate footer slots aligned with visible columns and active queries", () => {
    const cost = fieldColumn("cost", numberField());
    const margin = computedColumn("rateMargin");
    const footer: TableFooterSlotConfig[] = [
      aggregateFooterSlot("selectedCardAverageCost", "field:cost", "ratesForSelectedCard"),
      aggregateFooterSlot("archivedCardAverageMargin", "computed:rateMargin", "archivedRates"),
    ];

    const activePresentation = selectGeneratedTablePresentation({
      columns: [cost, margin],
      footer,
      orderedRecordIds: ["rate-1"],
      query: { kind: "all" },
      queryName: "ratesForSelectedCard",
    });
    const allQueriesPresentation = selectGeneratedTablePresentation({
      columns: [cost, margin],
      footer,
      orderedRecordIds: ["rate-1"],
      query: { kind: "all" },
    });

    expect(activePresentation.visibleFooterSlots.map((slot) => slot.aggregateName)).toEqual([
      "selectedCardAverageCost",
    ]);
    expect(activePresentation.footer?.cells.map((cell) => cell.type)).toEqual([
      "aggregate",
      "empty",
    ]);
    expect(
      activePresentation.footer?.cells.find((cell) => cell.type === "aggregate")?.columnId,
    ).toBe("field:cost");
    expect(allQueriesPresentation.footer?.cells.map((cell) => cell.type)).toEqual([
      "aggregate",
      "aggregate",
    ]);
  });

  it("keeps React Aria column ids unique when generated columns share schema keys", () => {
    const firstMargin = computedColumn("rateMargin");
    const secondMargin = computedColumn("rateMargin");
    const presentation = selectGeneratedTablePresentation({
      columns: [firstMargin, secondMargin],
      footer: [aggregateFooterSlot("selectedCardAverageMargin", "computed:rateMargin", "rates")],
      orderedRecordIds: ["rate-1"],
      query: { kind: "all" },
    });

    expect(presentation.columns.map((column) => column.id)).toEqual([
      "computed:rateMargin",
      "computed:rateMargin:2",
    ]);
    expect(presentation.rows[0]?.cells.map((cell) => cell.columnId)).toEqual([
      "computed:rateMargin",
      "computed:rateMargin:2",
    ]);
    expect(presentation.footer?.cells.map((cell) => cell.type)).toEqual(["aggregate", "aggregate"]);
  });

  it("surfaces empty presentation state independently of patch availability", () => {
    const presentation = selectGeneratedTablePresentation({
      columns: [fieldColumn("title", textField())],
      orderedRecordIds: ["task-1"],
      query: { kind: "all" },
    });
    const emptyPresentation = selectGeneratedTablePresentation({
      columns: [fieldColumn("title", textField())],
      orderedRecordIds: [],
      query: { kind: "all" },
    });

    expect(presentation.emptyState.visible).toBe(false);
    expect(emptyPresentation.emptyState).toEqual({
      visible: true,
      message: "No records yet.",
    });
  });
});

function fieldColumn(
  fieldName: string,
  field: FieldSchema,
): Extract<
  TableColumnConfig,
  {
    type: "field";
  }
> {
  return {
    type: "field",
    key: `field:${fieldName}`,
    fieldName,
    field,
    editor: field.type === "number" ? "number" : "text",
    commit: "field-commit",
    label: labelForField(fieldName),
    display: "readOnly",
    format: "plain",
  };
}

function hiddenFieldColumn(
  fieldName: string,
  field: FieldSchema,
): Extract<
  TableColumnConfig,
  {
    type: "field";
  }
> {
  return {
    ...fieldColumn(fieldName, field),
    display: "hidden",
  };
}
function computedColumn(computedValueName: string): Extract<
  TableColumnConfig,
  {
    type: "computed";
  }
> {
  return {
    type: "computed",
    key: `computed:${computedValueName}`,
    computedValueName,
    computedValue: {
      entity: "rate",
      type: "number",
      expression: {
        kind: "binary",
        op: "subtract",
        left: { kind: "field", field: "price" },
        right: { kind: "field", field: "cost" },
      },
    },
    label: "Margin",
    display: "readOnly",
    format: "percent",
  };
}

function operationControlColumn(
  bindingName: string,
  label: string,
): Extract<
  TableColumnConfig,
  {
    type: "operationControl";
  }
> {
  return {
    type: "operationControl",
    key: `operationControl:${bindingName}`,
    label,
    headerLabel: "Archive task",
    controls: [
      {
        type: "static",
        bindingName,
        label: "Archive task",
        variant: "default",
        disabled: false,
      },
    ],
    includeOrdering: false,
    align: "end",
    width: "xs",
    display: "readOnly",
    format: "plain",
  };
}
function orderingHandleColumn(): Extract<
  TableColumnConfig,
  {
    type: "orderingHandle";
  }
> {
  return {
    type: "orderingHandle",
    key: "orderingHandle",
    label: "",
    headerLabel: "Reorder",
    align: "center",
    width: "xs",
    display: "readOnly",
    format: "plain",
  };
}

function aggregateFooterSlot(
  aggregateName: string,
  columnKey: string,
  queryName: string,
): TableFooterSlotConfig {
  return {
    type: "aggregate",
    key: `aggregate:${aggregateName}`,
    aggregateName,
    aggregate: {
      query: queryName,
      function: "average",
      value: {
        kind: "field",
        field: "cost",
      },
    },
    computedValues: {},
    label: aggregateName,
    format: "currency",
    columnKey,
  };
}

function textField(): FieldSchema {
  return { type: "text", required: false };
}

function numberField(): FieldSchema {
  return { type: "number", required: false };
}

function labelForField(fieldName: string) {
  return fieldName.slice(0, 1).toUpperCase() + fieldName.slice(1);
}
