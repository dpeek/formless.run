import type { Key } from "react";

import type {
  HomeQueryTabConfig,
  TableColumnConfig,
  TableFooterSlotConfig,
  TransitionStateOperationConfig,
} from "../../client/views.ts";
import type { RecordLabelFieldConfig } from "./record-delete-runtime.ts";
import {
  ORDERING_DND_TYPE,
  type ResultOrderingDragData,
  type ResultOrderingDragFact,
} from "./ordering-ui.ts";

const deleteColumnId = "__formless_delete";
const transitionColumnId = "__formless_transitions";

export type GeneratedTableDataColumnPresentation = {
  type: "data";
  id: string;
  key: Key;
  column: TableColumnConfig;
  header: GeneratedTableHeaderPresentation;
  isRowHeader: boolean;
  isUtility: boolean;
};

export type GeneratedTableDeleteColumnPresentation = {
  type: "delete";
  id: typeof deleteColumnId;
  key: Key;
  header: GeneratedTableHeaderPresentation;
  isRowHeader: false;
  isUtility: true;
};

export type GeneratedTableTransitionColumnPresentation = {
  type: "transition";
  id: typeof transitionColumnId;
  key: Key;
  operations: TransitionStateOperationConfig[];
  header: GeneratedTableHeaderPresentation;
  isRowHeader: false;
  isUtility: true;
};

export type GeneratedTableColumnPresentation =
  | GeneratedTableDataColumnPresentation
  | GeneratedTableTransitionColumnPresentation
  | GeneratedTableDeleteColumnPresentation;

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

export type GeneratedTableRowOrderingPresentation =
  | {
      type: "none";
    }
  | {
      type: "drag";
      disabled: boolean;
      dragData?: ResultOrderingDragData;
      dragFact?: ResultOrderingDragFact;
      isPending: boolean;
    };

export type GeneratedTableReadinessWarningPresentation = {
  id: string;
  recordId: string;
  columnSpan: number;
};

export type GeneratedTableRowPresentation = {
  id: string;
  key: Key;
  recordId: string;
  cells: GeneratedTableCellPresentation[];
  ordering: GeneratedTableRowOrderingPresentation;
  readinessWarning: GeneratedTableReadinessWarningPresentation;
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

export type GeneratedTableDeletePresentation = {
  columnId: typeof deleteColumnId;
  labelFields: RecordLabelFieldConfig[];
};

export type GeneratedTablePresentation = {
  columns: GeneratedTableColumnPresentation[];
  dataColumns: GeneratedTableDataColumnPresentation[];
  rows: GeneratedTableRowPresentation[];
  canDelete: boolean;
  delete?: GeneratedTableDeletePresentation;
  editingDisabled: boolean;
  emptyState: GeneratedTableEmptyStatePresentation;
  footer?: GeneratedTableFooterPresentation;
  visibleFooterSlots: TableFooterSlotConfig[];
};

export type GeneratedTableEmptyStatePresentation = {
  visible: boolean;
  message: string;
};

export function selectGeneratedTablePresentation({
  canDelete,
  canPatch,
  columns,
  footer = [],
  orderedRecordIds,
  orderingDragFacts,
  orderingDragPatchEnabled,
  pendingDragRecordId = null,
  queryName,
  transitionOperations = [],
}: {
  canDelete: boolean;
  canPatch: boolean;
  columns: TableColumnConfig[];
  footer?: TableFooterSlotConfig[];
  orderedRecordIds: string[];
  orderingDragFacts?: ReadonlyMap<string, ResultOrderingDragFact>;
  orderingDragPatchEnabled?: boolean;
  pendingDragRecordId?: string | null;
  query: HomeQueryTabConfig["query"];
  queryName?: string;
  transitionOperations?: TransitionStateOperationConfig[];
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
  const columnsWithTransitions =
    transitionOperations.length === 0
      ? dataColumns
      : [...dataColumns, transitionColumnPresentation(transitionOperations)];
  const tableColumns: GeneratedTableColumnPresentation[] = canDelete
    ? [...columnsWithTransitions, deleteColumnPresentation()]
    : columnsWithTransitions;
  const dragPatchEnabled = orderingDragPatchEnabled ?? canPatch;
  const rows = orderedRecordIds.map((recordId) =>
    tableRowPresentation({
      columns: tableColumns,
      orderingDragFacts,
      orderingDragPatchEnabled: dragPatchEnabled,
      pendingDragRecordId,
      recordId,
    }),
  );
  const visibleFooterSlots = footer.filter(
    (slot) => queryName === undefined || slot.aggregate.query === queryName,
  );

  return {
    columns: tableColumns,
    dataColumns,
    rows,
    canDelete,
    ...(canDelete
      ? {
          delete: {
            columnId: deleteColumnId,
            labelFields: labelFieldsForTableColumns(visibleColumns),
          },
        }
      : {}),
    editingDisabled: !canPatch && orderedRecordIds.length > 0,
    emptyState: {
      visible: orderedRecordIds.length === 0,
      message: "No records yet.",
    },
    ...(visibleFooterSlots.length > 0
      ? { footer: tableFooterPresentation(tableColumns, visibleFooterSlots) }
      : {}),
    visibleFooterSlots,
  };
}

function tableRowPresentation({
  columns,
  orderingDragFacts,
  orderingDragPatchEnabled,
  pendingDragRecordId,
  recordId,
}: {
  columns: GeneratedTableColumnPresentation[];
  orderingDragFacts?: ReadonlyMap<string, ResultOrderingDragFact>;
  orderingDragPatchEnabled: boolean;
  pendingDragRecordId: string | null;
  recordId: string;
}): GeneratedTableRowPresentation {
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
    ordering: tableRowOrderingPresentation({
      orderingDragFacts,
      orderingDragPatchEnabled,
      pendingDragRecordId,
      recordId,
    }),
    readinessWarning: {
      id: `${recordId}:readiness-warning`,
      recordId,
      columnSpan: columns.length,
    },
  };
}

function tableRowOrderingPresentation({
  orderingDragFacts,
  orderingDragPatchEnabled,
  pendingDragRecordId,
  recordId,
}: {
  orderingDragFacts?: ReadonlyMap<string, ResultOrderingDragFact>;
  orderingDragPatchEnabled: boolean;
  pendingDragRecordId: string | null;
  recordId: string;
}): GeneratedTableRowOrderingPresentation {
  if (!orderingDragFacts) {
    return { type: "none" };
  }

  const dragFact = orderingDragFacts.get(recordId);
  const disabled = !dragFact || !orderingDragPatchEnabled || pendingDragRecordId !== null;

  return {
    type: "drag",
    disabled,
    ...(dragFact
      ? {
          dragFact,
          dragData: {
            type: ORDERING_DND_TYPE,
            recordId,
            scopeKey: dragFact.scopeKey,
          },
        }
      : {}),
    isPending: pendingDragRecordId === recordId,
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

function deleteColumnPresentation(): GeneratedTableDeleteColumnPresentation {
  return {
    type: "delete",
    id: deleteColumnId,
    key: deleteColumnId,
    header: {
      label: "",
      accessibleLabel: "Delete",
      isVisuallyHidden: true,
    },
    isRowHeader: false,
    isUtility: true,
  };
}

function transitionColumnPresentation(
  operations: TransitionStateOperationConfig[],
): GeneratedTableTransitionColumnPresentation {
  return {
    type: "transition",
    id: transitionColumnId,
    key: transitionColumnId,
    operations,
    header: {
      label: "",
      accessibleLabel: "Lifecycle transitions",
      isVisuallyHidden: true,
    },
    isRowHeader: false,
    isUtility: true,
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

function labelFieldsForTableColumns(columns: TableColumnConfig[]): RecordLabelFieldConfig[] {
  return columns.flatMap((column) =>
    column.type === "field" ? [{ fieldName: column.fieldName, field: column.field }] : [],
  );
}
