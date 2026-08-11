import type {
  ButtonContract,
  CollectionEmptyStatePrimaryActionContract,
  DisplayFieldContract,
  FieldContract,
  NativeLinkActionContract,
  OperationControlContract,
  SemanticIconId,
  TableActionContract,
  TableActionGroupContract,
  TableCellValueContract,
  TableCellContentContract,
  TableColumnContentRole,
  TableColumnContract,
  TableContract,
  TableEditActionContract,
  TableInvalidCellValueContract,
  TableOperationActionContract,
  TableOrderingContract,
  TableRowContract,
  TableValueStatus,
} from "@dpeek/formless-presentation/contract";
import type { OrderingMoveMenuItem } from "./ordering-ui.ts";
import type {
  GeneratedTableColumnPresentation,
  GeneratedTableFooterCellPresentation,
  GeneratedTablePresentation,
} from "./table-presentation.ts";

export type GeneratedTableRowProjectionFacts = {
  accessibilityLabel?: string;
  contentsByColumnId: Readonly<Record<string, readonly TableCellContentContract[] | undefined>>;
};

export type GeneratedTableFooterValueProjection = {
  displayValue: string;
  status?: TableValueStatus;
  suffix?: string;
};

export type ProjectGeneratedTableContractOptions = {
  accessibilityLabel: string;
  density?: TableContract["density"];
  emptyStateAction?: CollectionEmptyStatePrimaryActionContract;
  emptyStateDescription?: string;
  footerValuesByColumnId?: Readonly<
    Record<string, GeneratedTableFooterValueProjection | undefined>
  >;
  id: string;
  presentation: GeneratedTablePresentation;
  rowsByRecordId: Readonly<Record<string, GeneratedTableRowProjectionFacts | undefined>>;
};

export type ProjectGeneratedNativeLinkActionOptions = {
  accessibilityLabel: string;
  id: string;
  label: string;
  prominence?: NativeLinkActionContract["prominence"];
  resolution:
    | {
        href: string;
        kind: "available";
      }
    | {
        kind: "unavailable";
        reason: string;
      };
  target: NativeLinkActionContract["target"];
};

export type ProjectGeneratedTableEditActionOptions = {
  actionId: string;
  description?: string;
  dialogId: string;
  disabled?: boolean;
  disabledReason?: string;
  fields?: readonly FieldContract[];
  fieldErrors?: readonly string[];
  label: string;
  open: boolean;
  rowId: string;
  tableId: string;
  target:
    | {
        disabledReason?: string;
        editingEnabled: boolean;
        kind: "available";
      }
    | {
        kind: "unavailable";
        message: string;
      };
  targetKind: "reference" | "row";
  title: string;
  warning?: string;
};

export type ProjectGeneratedTableOrderingOptions = {
  accessibilityLabel: string;
  items: readonly OrderingMoveMenuItem[];
  pending: boolean;
  rowId: string;
  tableId: string;
};

export function projectGeneratedTableContract({
  accessibilityLabel,
  density = "compact",
  emptyStateAction,
  emptyStateDescription,
  footerValuesByColumnId = {},
  id,
  presentation,
  rowsByRecordId,
}: ProjectGeneratedTableContractOptions): TableContract {
  const rows = presentation.rows.map((row): TableRowContract => {
    const facts = rowsByRecordId[row.recordId];

    return {
      accessibilityLabel: facts?.accessibilityLabel ?? row.recordId,
      cells: row.cells.map((cell) => ({
        columnId: cell.columnId,
        contents: facts?.contentsByColumnId[cell.columnId] ?? [missingCellContent(cell.column)],
        id: cell.id,
        kind: "tableCell",
      })),
      id: row.id,
      kind: "tableRow",
    };
  });

  return {
    accessibilityLabel,
    columns: presentation.columns.map(projectTableColumn),
    density,
    ...(presentation.emptyState.visible
      ? {
          emptyState: {
            ...(emptyStateAction === undefined ? {} : { action: emptyStateAction }),
            ...(emptyStateDescription === undefined ? {} : { description: emptyStateDescription }),
            id: `${id}:empty`,
            kind: "tableEmptyState" as const,
            title: presentation.emptyState.message,
          },
        }
      : {}),
    ...(presentation.footer === undefined
      ? {}
      : {
          footer: {
            accessibilityLabel: "Aggregate footer",
            cells: presentation.footer.cells.map((cell) =>
              projectFooterCell(cell, footerValuesByColumnId[cell.columnId]),
            ),
            id: `${id}:${presentation.footer.id}`,
            kind: "tableFooter" as const,
          },
        }),
    id,
    kind: "table",
    rows,
  };
}

export function projectGeneratedTableCellValue(
  field: DisplayFieldContract,
  suffix = field.formatting.suffix ?? field.suffix,
): TableCellValueContract {
  const displayValue = field.formatting.displayValue || "—";

  return {
    accessibilityLabel: `${field.label}: ${displayValue}`,
    displayValue,
    kind: "cellValue",
    presentation: tableCellValuePresentation(field),
    ...(suffix === undefined || suffix === "" ? {} : { suffix }),
  };
}

export function projectGeneratedTableDisplayValue({
  accessibilityLabel,
  displayValue,
  suffix,
}: {
  accessibilityLabel: string;
  displayValue: string;
  suffix?: string;
}): TableCellValueContract {
  return {
    accessibilityLabel,
    displayValue,
    kind: "cellValue",
    presentation: { kind: "computed" },
    ...(suffix === undefined ? {} : { suffix }),
  };
}

export function projectGeneratedTableInvalidValue(
  accessibilityLabel: string,
): TableInvalidCellValueContract {
  return {
    accessibilityLabel,
    kind: "invalidValue",
  };
}

function tableCellValuePresentation(
  field: DisplayFieldContract,
): TableCellValueContract["presentation"] {
  if (field.stateMachineFacts !== undefined && field.formatting.enumValuePresentation) {
    return {
      content: field.enum?.kind === "display" ? field.enum.content : "label",
      kind: "state",
      value: field.formatting.enumValuePresentation,
    };
  }

  if (field.control.kind === "date" || field.formatting.temporal !== undefined) {
    return field.formatting.temporal === undefined
      ? { kind: "text" }
      : { kind: "temporal", temporal: field.formatting.temporal };
  }

  if (field.control.kind === "number") {
    return { kind: "number" };
  }

  if (field.control.kind === "boolean") {
    return { kind: "boolean" };
  }

  if (field.control.kind === "enum" && field.formatting.enumValuePresentation) {
    return {
      content: field.enum?.kind === "display" ? field.enum.content : "label",
      kind: "enum",
      value: field.formatting.enumValuePresentation,
    };
  }

  if (field.control.kind === "reference") {
    return { kind: "reference" };
  }

  if (field.control.controlKind === "color" && field.color?.swatch.kind === "hex") {
    return { kind: "color", swatch: field.color.swatch.value };
  }

  if (field.control.controlKind === "media" && field.media?.previewHref) {
    return { kind: "media", previewHref: field.media.previewHref };
  }

  if (field.control.controlKind === "markdown") {
    return { kind: "markdown" };
  }

  if (field.control.controlKind === "icon" && field.icon?.previewSource) {
    return { kind: "icon", source: field.icon.previewSource };
  }

  return { kind: "text" };
}

export function projectGeneratedTableActionGroup({
  accessibilityLabel,
  actions,
  id,
}: {
  accessibilityLabel: string;
  actions: readonly TableActionContract[];
  id: string;
}): TableActionGroupContract {
  return {
    accessibilityLabel,
    actions,
    id,
    kind: "actionGroup",
  };
}

export function projectGeneratedTableOperationAction(
  control: OperationControlContract,
  role: TableOperationActionContract["role"],
): TableOperationActionContract {
  const trigger =
    control.trigger.intent.type === "operationInvoke"
      ? {
          ...control.trigger,
          intent: { ...control.trigger.intent, invocationSource: "menuItem" as const },
        }
      : control.trigger;

  return {
    control: { ...control, trigger },
    kind: "operationAction",
    role,
  };
}

export function projectGeneratedNativeLinkAction({
  accessibilityLabel,
  id,
  label,
  prominence = "primary",
  resolution,
  target,
}: ProjectGeneratedNativeLinkActionOptions): NativeLinkActionContract {
  const base = {
    accessibilityLabel,
    id,
    kind: "nativeLinkAction" as const,
    label,
    prominence,
    target,
  };

  return resolution.kind === "available"
    ? { ...base, availability: "available", href: resolution.href }
    : {
        ...base,
        availability: "unavailable",
        unavailableReason: resolution.reason,
      };
}

export function projectGeneratedTableEditAction({
  actionId,
  description,
  dialogId,
  disabled = false,
  disabledReason,
  fields = [],
  fieldErrors = [],
  label,
  open,
  rowId,
  tableId,
  target,
  targetKind,
  title,
  warning,
}: ProjectGeneratedTableEditActionOptions): TableEditActionContract {
  const openIntent = {
    dialogId,
    open: true,
    rowId,
    tableId,
    type: "tableEditDialogOpenChange" as const,
  };

  return {
    dialog: {
      close: tableButton({
        accessibilityLabel: "Done",
        content: { kind: "label", label: "Done" },
        id: `${dialogId}:close`,
        prominence: "secondary",
      }),
      ...(description === undefined ? {} : { description }),
      id: dialogId,
      kind: "tableEditDialog",
      open,
      openChangeIntent: {
        ...openIntent,
        open: false,
      },
      target:
        target.kind === "unavailable"
          ? target
          : {
              fieldSet: {
                disabled: !target.editingEnabled,
                ...(!target.editingEnabled && target.disabledReason !== undefined
                  ? { disabledReason: target.disabledReason }
                  : {}),
                errors: fieldErrors,
                fields: fields.map(projectGeneratedTableEditDialogField),
                id: `${dialogId}:fields`,
                kind: "fieldSet",
              },
              kind: "available",
            },
      targetKind,
      title,
      ...(warning === undefined ? {} : { warning }),
    },
    kind: "editAction",
    openIntent,
    trigger: tableActionButton({
      actionId,
      disabled,
      disabledReason,
      icon: "edit",
      label,
      prominence: "secondary",
    }),
  };
}

function projectGeneratedTableEditDialogField(field: FieldContract): FieldContract {
  if (field.mode === "editor" && (field.surface === "create" || field.surface === "operation")) {
    return field;
  }

  return {
    ...field,
    labelVisibility: "visible",
    surface: "record",
  };
}

export function projectGeneratedTableOrdering({
  accessibilityLabel,
  items,
  pending,
  rowId,
  tableId,
}: ProjectGeneratedTableOrderingOptions): TableOrderingContract {
  return {
    accessibilityLabel,
    actions: items.map((item) => {
      const id = `${tableId}:${rowId}:order:${item.direction}`;
      const disabledReason = pending ? "Ordering in progress" : item.disabledReason;

      return {
        direction: item.direction,
        disabled: item.disabled || pending,
        ...(disabledReason === undefined ? {} : { disabledReason }),
        id,
        intent: {
          actionId: id,
          direction: item.direction,
          rowId,
          tableId,
          type: "tableReorder",
        },
        kind: "orderingAction" as const,
        label: item.label,
        ...(pending ? { pending: { isPending: true, label: "Ordering in progress" } } : {}),
      };
    }),
    affordance: "reorder",
    kind: "ordering",
    pending,
  };
}

function projectTableColumn(column: GeneratedTableColumnPresentation): TableColumnContract {
  const columnConfig = column.column;
  return {
    accessibilityLabel: column.header.accessibleLabel,
    alignment: columnConfig.align ?? "start",
    contentRole: tableColumnContentRole(column),
    id: column.id,
    isRowHeader: column.isRowHeader,
    kind: "tableColumn",
    label: column.header.label,
    labelVisibility: column.header.isVisuallyHidden ? "hidden" : "visible",
    width: columnConfig.width ?? "auto",
  };
}

function tableColumnContentRole(column: GeneratedTableColumnPresentation): TableColumnContentRole {
  if (column.column.type === "computed") {
    return "computed";
  }

  if (column.column.type === "operationControl") {
    return "actions";
  }

  if (column.column.type === "linkControl") {
    return "actions";
  }

  if (column.column.type === "orderingHandle") {
    return "ordering";
  }

  if (
    column.column.type === "referenceField" ||
    (column.column.type === "field" && column.column.field.type === "reference")
  ) {
    return "reference";
  }

  return "field";
}

function missingCellContent(column: GeneratedTableColumnPresentation) {
  if (
    column.column.type === "field" ||
    column.column.type === "referenceField" ||
    column.column.type === "computed"
  ) {
    return projectGeneratedTableInvalidValue(
      `${column.header.accessibleLabel} value is invalid or unavailable.`,
    );
  }

  return {
    accessibilityLabel: `${column.header.accessibleLabel} unavailable`,
    kind: "unavailable" as const,
    message: "Cell unavailable.",
  };
}

function projectFooterCell(
  cell: GeneratedTableFooterCellPresentation,
  value: GeneratedTableFooterValueProjection | undefined,
) {
  if (cell.type === "empty") {
    return {
      columnId: cell.columnId,
      id: cell.id,
      kind: "emptyFooterCell" as const,
    };
  }

  const displayValue = value?.displayValue ?? "Unavailable";
  const status =
    value?.status ??
    (value === undefined
      ? { kind: "unavailable" as const, message: "Aggregate unavailable." }
      : { kind: "ready" as const });
  const suffix = value?.suffix ?? cell.slot.suffix;

  return {
    accessibilityLabel: `${cell.slot.label}: ${displayValue}`,
    columnId: cell.columnId,
    displayValue,
    id: cell.id,
    kind: "aggregateFooterCell" as const,
    status,
    ...(suffix === undefined ? {} : { suffix }),
  };
}

function tableActionButton({
  actionId,
  disabled,
  disabledReason,
  icon,
  label,
  prominence,
}: {
  actionId: string;
  disabled: boolean;
  disabledReason?: string;
  icon?: SemanticIconId;
  label: string;
  prominence: ButtonContract["prominence"];
}): ButtonContract {
  return tableButton({
    accessibilityLabel:
      disabled && disabledReason !== undefined ? `${label}: ${disabledReason}` : label,
    content: icon === undefined ? { kind: "label", label } : { icon, kind: "iconAndLabel", label },
    ...(disabled ? { disabled: true } : {}),
    ...(disabledReason === undefined ? {} : { disabledReason }),
    id: actionId,
    prominence,
  });
}

function tableButton(
  button: Pick<ButtonContract, "accessibilityLabel" | "content" | "id" | "prominence"> &
    Partial<Pick<ButtonContract, "disabled" | "disabledReason" | "pending">>,
): ButtonContract {
  return {
    ...button,
    density: "compact",
    kind: "button",
    type: "button",
  };
}
