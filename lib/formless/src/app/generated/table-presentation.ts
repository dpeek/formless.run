import type { Key } from "react";

import type {
  HomeQueryTabConfig,
  TableColumnConfig,
  TableFooterSlotConfig,
} from "../../client/views.ts";

export type GeneratedTableDataColumnPresentation = {
  type: "data";
  id: string;
  key: Key;
  column: TableColumnConfig;
  header: GeneratedTableHeaderPresentation;
  isRowHeader: boolean;
  isUtility: boolean;
};

export type GeneratedTableColumnPresentation = GeneratedTableDataColumnPresentation;

export type GeneratedTableHeaderPresentation = {
  label: string;
  accessibleLabel: string;
  isVisuallyHidden: boolean;
};

export type GeneratedTableCellPresentation = {
  id: string;
  key: Key;
  columnId: string;
  recordId: string;
  column: GeneratedTableColumnPresentation;
};

export type GeneratedTableRowPresentation = {
  id: string;
  key: Key;
  recordId: string;
  cells: GeneratedTableCellPresentation[];
};

export type GeneratedTableFooterCellPresentation =
  | {
      type: "aggregate";
      id: string;
      key: Key;
      columnId: string;
      column: GeneratedTableDataColumnPresentation;
      slot: TableFooterSlotConfig;
    }
  | {
      type: "empty";
      id: string;
      key: Key;
      columnId: string;
      column: GeneratedTableColumnPresentation;
    };

export type GeneratedTableFooterPresentation = {
  id: "footer";
  key: Key;
  cells: GeneratedTableFooterCellPresentation[];
};

export type GeneratedTablePresentation = {
  columns: GeneratedTableColumnPresentation[];
  dataColumns: GeneratedTableDataColumnPresentation[];
  rows: GeneratedTableRowPresentation[];
  emptyState: GeneratedTableEmptyStatePresentation;
  footer?: GeneratedTableFooterPresentation;
  visibleFooterSlots: TableFooterSlotConfig[];
};

export type GeneratedTableEmptyStatePresentation = {
  visible: boolean;
  message: string;
};

export function selectGeneratedTablePresentation({
  columns,
  footer = [],
  orderedRecordIds,
  queryName,
}: {
  columns: TableColumnConfig[];
  footer?: TableFooterSlotConfig[];
  orderedRecordIds: string[];
  query: HomeQueryTabConfig["query"];
  queryName?: string;
}): GeneratedTablePresentation {
  const visibleColumns = columns.filter((column) => column.display !== "hidden");
  const rowHeaderColumnIndex = selectRowHeaderColumnIndex(visibleColumns);
  const columnIdCounts = new Map<string, number>();
  const dataColumns = visibleColumns.map((column, index): GeneratedTableDataColumnPresentation => {
    const id = uniqueTableColumnId(column.key, columnIdCounts);

    return {
      type: "data",
      id,
      key: id,
      column,
      header: tableHeaderPresentation(column),
      isRowHeader: index === rowHeaderColumnIndex,
      isUtility: isUtilityColumn(column),
    };
  });
  const rows = orderedRecordIds.map((recordId) => tableRowPresentation(dataColumns, recordId));
  const visibleFooterSlots = footer.filter(
    (slot) => queryName === undefined || slot.aggregate.query === queryName,
  );

  return {
    columns: dataColumns,
    dataColumns,
    rows,
    emptyState: {
      visible: orderedRecordIds.length === 0,
      message: "No records yet.",
    },
    ...(visibleFooterSlots.length > 0
      ? { footer: tableFooterPresentation(dataColumns, visibleFooterSlots) }
      : {}),
    visibleFooterSlots,
  };
}

function tableRowPresentation(
  columns: GeneratedTableColumnPresentation[],
  recordId: string,
): GeneratedTableRowPresentation {
  return {
    id: recordId,
    key: recordId,
    recordId,
    cells: columns.map((column) => ({
      id: `${recordId}:${column.id}`,
      key: `${recordId}:${column.id}`,
      columnId: column.id,
      recordId,
      column,
    })),
  };
}

function tableFooterPresentation(
  columns: GeneratedTableColumnPresentation[],
  footer: TableFooterSlotConfig[],
): GeneratedTableFooterPresentation {
  return {
    id: "footer",
    key: "footer",
    cells: columns.map((column) => {
      if (column.type !== "data") {
        return emptyFooterCell(column);
      }

      const slot = footer.find((candidate) => candidate.columnKey === column.column.key);

      if (!slot) {
        return emptyFooterCell(column);
      }

      return {
        type: "aggregate",
        id: `footer:${column.id}`,
        key: `footer:${column.id}`,
        columnId: column.id,
        column,
        slot,
      };
    }),
  };
}

function emptyFooterCell(
  column: GeneratedTableColumnPresentation,
): Extract<GeneratedTableFooterCellPresentation, { type: "empty" }> {
  return {
    type: "empty",
    id: `footer:${column.id}`,
    key: `footer:${column.id}`,
    columnId: column.id,
    column,
  };
}

function tableHeaderPresentation(column: TableColumnConfig): GeneratedTableHeaderPresentation {
  const accessibleLabel =
    column.type === "linkControl" ||
    column.type === "operationControl" ||
    column.type === "orderingHandle"
      ? column.headerLabel
      : column.label;

  return {
    label: column.label,
    accessibleLabel,
    isVisuallyHidden: column.label === "" && accessibleLabel !== "",
  };
}

function uniqueTableColumnId(columnKey: string, seen: Map<string, number>) {
  const count = seen.get(columnKey) ?? 0;
  seen.set(columnKey, count + 1);

  return count === 0 ? columnKey : `${columnKey}:${count + 1}`;
}

function selectRowHeaderColumnIndex(columns: TableColumnConfig[]) {
  const firstDataColumnIndex = columns.findIndex((column) => !isUtilityColumn(column));

  return firstDataColumnIndex === -1 ? 0 : firstDataColumnIndex;
}

function isUtilityColumn(column: TableColumnConfig) {
  return (
    column.type === "linkControl" ||
    column.type === "operationControl" ||
    column.type === "orderingHandle"
  );
}
