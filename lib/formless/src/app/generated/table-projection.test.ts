import { describe, expect, it } from "vite-plus/test";
import type { EntitySchema, FieldSchema } from "@dpeek/formless-schema";
import type {
  TableContract,
  OperationControlContract,
  TableActionGroupContract,
} from "@dpeek/formless-presentation/contract";
import type { StoredRecord } from "@dpeek/formless-storage";
import type {
  GeneratedOperationControlBinding,
  RecordFieldConfig,
  TableColumnConfig,
  TableFooterSlotConfig,
} from "../../client/views.ts";
import { projectGeneratedOperationControl } from "./operation-projection.ts";
import { projectGeneratedRecordField } from "./field-projection.ts";
import {
  projectGeneratedTableActionGroup,
  projectGeneratedTableDisplayValue,
  projectGeneratedTableEditAction,
  projectGeneratedTableFieldContent,
  projectGeneratedTableContract,
  projectGeneratedTableInvokeAction,
  projectGeneratedTableOperationAction,
  projectGeneratedTableOrdering,
} from "./table-projection.ts";
import {
  indexGeneratedTableFieldOccurrences,
  resolveGeneratedTableFieldIntent,
} from "./generated-table-foundation.tsx";
import { selectGeneratedTablePresentation } from "./table-presentation.ts";

describe("generated Formless UI table projection", () => {
  it("indexes cell and dialog occurrences separately and rejects mismatches and collisions", () => {
    const tableId = "table-test";
    const cellId = "task-1:title";
    const fieldSetId = "task-1:edit-dialog:fields";
    const record = {
      createdAt: "2026-07-16T00:00:00.000Z",
      entity: "task",
      id: "task-1",
      updatedAt: "2026-07-16T00:00:00.000Z",
      values: { title: "Prepare launch" },
    } satisfies StoredRecord;
    const fieldConfig = {
      commit: "field-commit",
      editor: "text",
      field: textField(),
      fieldName: "title",
    } satisfies RecordFieldConfig;
    const inlineField = recordField("title", textField(), "text", "Prepare launch", record.id);
    const dialogField = projectGeneratedRecordField({
      canPatch: true,
      fieldConfig,
      occurrence: {
        owner: { fieldSetId, kind: "tableEditFieldSet", tableId },
        placementId: fieldConfig.fieldName,
      },
      recordId: record.id,
      recordValue: record.values.title,
      surface: "table-cell",
    });
    const editAction = projectGeneratedTableEditAction({
      actionId: "task-1:edit",
      dialogId: "task-1:edit-dialog",
      fields: [dialogField],
      label: "Edit task",
      open: true,
      rowId: record.id,
      tableId,
      target: { editingEnabled: true, kind: "available" },
      targetKind: "row",
      title: "Edit task",
    });
    const table: TableContract = {
      accessibilityLabel: "Tasks",
      columns: [
        {
          accessibilityLabel: "Title",
          alignment: "start",
          contentRole: "field",
          id: "title",
          isRowHeader: true,
          kind: "tableColumn",
          label: "Title",
          labelVisibility: "visible",
          width: "lg",
        },
        {
          accessibilityLabel: "Actions",
          alignment: "end",
          contentRole: "actions",
          id: "actions",
          isRowHeader: false,
          kind: "tableColumn",
          label: "Actions",
          labelVisibility: "visible",
          width: "sm",
        },
      ],
      density: "compact",
      editing: { enabled: true },
      id: tableId,
      kind: "table",
      rows: [
        {
          accessibilityLabel: "Prepare launch",
          cells: [
            {
              columnId: "title",
              contents: [projectGeneratedTableFieldContent(inlineField)],
              id: cellId,
              kind: "tableCell",
            },
            {
              columnId: "actions",
              contents: [
                actionGroup("task-1:actions", [{ action: editAction, placement: "primary" }]),
              ],
              id: "task-1:actions-cell",
              kind: "tableCell",
            },
          ],
          id: record.id,
          kind: "tableRow",
          warnings: [],
        },
      ],
    };
    const contexts = new Map([
      [
        cellId,
        {
          entityName: record.entity,
          fields: [fieldConfig],
          id: cellId,
          record,
          recordId: record.id,
        },
      ],
      [
        fieldSetId,
        {
          entityName: record.entity,
          fields: [fieldConfig],
          id: fieldSetId,
          record,
          recordId: record.id,
        },
      ],
    ]);
    const index = indexGeneratedTableFieldOccurrences(table, contexts);
    const intent = { fieldName: "title", type: "recordDraftRevert" } as const;

    expect(index.get(inlineField.fieldId)).toMatchObject({ contextId: cellId, placement: "cell" });
    expect(index.get(dialogField.fieldId)).toMatchObject({
      contextId: fieldSetId,
      placement: "dialog",
    });
    expect(
      resolveGeneratedTableFieldIntent(index, {
        contextId: cellId,
        fieldId: inlineField.fieldId,
        intent,
        recordId: record.id,
        tableId,
      }),
    ).toMatchObject({ fieldId: inlineField.fieldId });
    expect(
      resolveGeneratedTableFieldIntent(index, {
        contextId: fieldSetId,
        fieldId: inlineField.fieldId,
        intent,
        recordId: record.id,
        tableId,
      }),
    ).toBeUndefined();
    expect(
      resolveGeneratedTableFieldIntent(index, {
        contextId: cellId,
        fieldId: inlineField.fieldId,
        intent: { fieldName: "other", type: "recordDraftRevert" },
        recordId: record.id,
        tableId,
      }),
    ).toBeUndefined();
    expect(() =>
      indexGeneratedTableFieldOccurrences(
        {
          ...table,
          rows: table.rows.map((row) => ({
            ...row,
            cells: row.cells.map((cell) =>
              cell.id === cellId
                ? {
                    ...cell,
                    contents: [...cell.contents, projectGeneratedTableFieldContent(inlineField)],
                  }
                : cell,
            ),
          })),
        },
        contexts,
      ),
    ).toThrow(`duplicate field occurrence "${inlineField.fieldId}"`);
  });

  it("projects semantic columns and ordered ordinary, specialized, reference, and computed cells", () => {
    const presentation = tablePresentation({ canDelete: false, canPatch: true });
    const title = recordField("title", textField(), "text", "Prepare launch");
    const icon = recordField("icon", iconField(), "icon", iconSource);
    const reference = recordField("name", textField(), "text", "Dana", "principal-1");
    const ordering = tableOrdering("task-2", false);
    const contract = projectGeneratedTableContract({
      accessibilityLabel: "Tasks records",
      footerValuesByColumnId: {
        "computed:estimate": { displayValue: "8 hours", suffix: "hours" },
      },
      id: "tasks:active",
      presentation,
      rowsByRecordId: {
        "task-1": {
          accessibilityLabel: "Prepare launch",
          contentsByColumnId: {
            orderingHandle: [tableOrdering("task-1", false)],
            "field:title": [projectGeneratedTableFieldContent(title)],
            "field:icon": [projectGeneratedTableFieldContent(icon)],
            "referenceField:owner": [
              projectGeneratedTableDisplayValue({
                accessibilityLabel: "Owner unavailable",
                displayValue: "",
                status: { kind: "unavailable", message: "Referenced owner unavailable." },
                valueKind: "reference",
              }),
            ],
            "computed:estimate": [
              projectGeneratedTableDisplayValue({
                accessibilityLabel: "Estimate: 8 hours",
                displayValue: "8",
                suffix: "hours",
                valueKind: "computed",
              }),
            ],
          },
        },
        "task-2": {
          accessibilityLabel: "Review launch",
          contentsByColumnId: {
            orderingHandle: [ordering],
            "field:title": [projectGeneratedTableFieldContent(title)],
            "field:icon": [projectGeneratedTableFieldContent(icon)],
            "referenceField:owner": [
              projectGeneratedTableFieldContent(reference, "referencedRecord"),
            ],
            "computed:estimate": [
              projectGeneratedTableDisplayValue({
                accessibilityLabel: "Estimate: calculating",
                displayValue: "",
                status: { kind: "pending", label: "Calculating estimate" },
                valueKind: "computed",
              }),
            ],
          },
          readinessWarnings: [{ code: "owner", message: "Assign an owner." }],
        },
      },
    });

    expect(contract).toMatchObject({
      accessibilityLabel: "Tasks records",
      columns: [
        { alignment: "center", contentRole: "ordering", width: "xs" },
        { contentRole: "field", isRowHeader: true, label: "Title", width: "lg" },
        { contentRole: "field", label: "Icon" },
        { contentRole: "reference", label: "Owner" },
        { alignment: "end", contentRole: "computed", label: "Estimate" },
      ],
      density: "compact",
      editing: { enabled: true },
      id: "tasks:active",
      kind: "table",
      rows: [{ id: "task-2" }, { id: "task-1" }],
    });
    expect(contract.rows[0]?.cells[1]?.contents[0]).toMatchObject({
      field: { mode: "editor", rendererKind: "text", surface: "table-cell" },
      kind: "field",
      source: "record",
    });
    expect(contract.rows[0]?.cells[2]?.contents[0]).toMatchObject({
      field: { icon: { valueMode: "svgSource" }, rendererKind: "icon" },
      kind: "field",
    });
    expect(contract.rows[0]?.cells[3]?.contents[0]).toMatchObject({
      field: { formatting: { displayValue: "Dana" }, surface: "table-cell" },
      kind: "field",
      source: "referencedRecord",
    });
    expect(contract.rows[1]?.cells[3]?.contents[0]).toMatchObject({
      status: { kind: "unavailable", message: "Referenced owner unavailable." },
      valueKind: "reference",
    });
    expect(contract.rows[0]?.warnings).toEqual([
      {
        id: "task-2:readiness-warning",
        items: [{ code: "owner", message: "Assign an owner." }],
        kind: "tableWarning",
        title: "Readiness warnings",
      },
    ]);
    expect(JSON.stringify(contract)).not.toContain('"plan"');
    expect(JSON.stringify(contract)).not.toContain('"rank"');
  });

  it("projects action hierarchy, controlled dialogs, deletion, transitions, and ordering intents", () => {
    const presentation = tablePresentation({
      canDelete: true,
      canPatch: true,
      includeOperations: true,
    });
    const command = operationControl(commandBinding(), false);
    const deletion = operationControl(deleteBinding(), true);
    const dialogTransition = projectGeneratedTableInvokeAction({
      actionId: "task-2:complete",
      invocationSource: "button",
      label: "Complete",
      operationName: "completeTask",
      role: "transition",
      rowId: "task-2",
      tableId: "tasks:active",
    });
    const edit = projectGeneratedTableEditAction({
      actionGroup: actionGroup("task-2:dialog-actions", [
        { action: dialogTransition, placement: "primary" },
      ]),
      actionId: "task-2:edit",
      description: "Task",
      dialogId: "task-2:edit-dialog",
      fields: [recordField("title", textField(), "text", "Review launch")],
      label: "Edit task",
      open: true,
      rowId: "task-2",
      tableId: "tasks:active",
      target: { editingEnabled: true, kind: "available" },
      targetKind: "row",
      title: "Edit task",
    });
    const unavailableReferenceEdit = projectGeneratedTableEditAction({
      actionId: "task-1:edit-owner",
      dialogId: "task-1:edit-owner-dialog",
      label: "Edit shared owner",
      open: true,
      rowId: "task-1",
      tableId: "tasks:active",
      target: { kind: "unavailable", message: "Record unavailable." },
      targetKind: "reference",
      title: "Shared owner",
    });
    const rowActions = actionGroup("task-2:actions", [
      {
        action: projectGeneratedTableOperationAction(command, "command"),
        placement: "primary",
      },
      { action: edit, placement: "secondary" },
      {
        action: projectGeneratedTableInvokeAction({
          actionId: "task-2:archive",
          disabled: true,
          disabledReason: "Task must be complete",
          invocationSource: "menuItem",
          label: "Archive",
          operationName: "archiveTask",
          role: "transition",
          rowId: "task-2",
          tableId: "tasks:active",
        }),
        placement: "secondary",
      },
    ]);
    const deleteActions = actionGroup("task-2:delete-actions", [
      {
        action: projectGeneratedTableOperationAction(deletion, "delete"),
        placement: "secondary",
      },
    ]);
    const contract = projectGeneratedTableContract({
      accessibilityLabel: "Tasks records",
      id: "tasks:active",
      presentation,
      rowsByRecordId: {
        "task-1": {
          contentsByColumnId: {
            orderingHandle: [tableOrdering("task-1", false)],
            "field:title": [
              projectGeneratedTableFieldContent(
                recordField("title", textField(), "text", "Prepare launch"),
              ),
            ],
            "operationControl:actions": [
              actionGroup("task-1:actions", [
                { action: unavailableReferenceEdit, placement: "secondary" },
              ]),
            ],
            __formless_delete: [deleteActions],
          },
        },
        "task-2": {
          contentsByColumnId: {
            orderingHandle: [tableOrdering("task-2", true)],
            "field:title": [
              projectGeneratedTableFieldContent(
                recordField("title", textField(), "text", "Review launch"),
              ),
            ],
            "operationControl:actions": [rowActions],
            __formless_delete: [deleteActions],
          },
        },
      },
    });
    const projectedActions = contract.rows[0]?.cells.find(
      (cell) => cell.columnId === "operationControl:actions",
    )?.contents[0] as TableActionGroupContract;
    const projectedOrdering = contract.rows[0]?.cells[0]?.contents[0];
    const projectedDelete = contract.rows[0]?.cells.find(
      (cell) => cell.columnId === "__formless_delete",
    )?.contents[0] as TableActionGroupContract;

    expect(projectedActions.primary[0]).toMatchObject({
      control: { kind: "operationControl", trigger: { prominence: "primary" } },
      kind: "operationAction",
      role: "command",
    });
    expect(projectedActions.secondary).toMatchObject([
      {
        dialog: {
          open: true,
          openChangeIntent: { open: false, type: "tableEditDialogOpenChange" },
          target: {
            actionGroup: { primary: [{ role: "transition" }] },
            fieldSet: {
              disabled: false,
              fields: [{ labelVisibility: "visible", surface: "record" }],
            },
            kind: "available",
          },
        },
        openIntent: { open: true, type: "tableEditDialogOpenChange" },
      },
      {
        intent: {
          invocationSource: "menuItem",
          operationName: "archiveTask",
          type: "tableActionInvoke",
        },
        trigger: { disabled: true, disabledReason: "Task must be complete" },
      },
    ]);
    expect(projectedOrdering).toMatchObject({
      actions: [
        {
          direction: "top",
          intent: { direction: "top", type: "tableReorder" },
        },
        {
          direction: "down",
          intent: { direction: "down", type: "tableReorder" },
        },
      ],
      affordance: "reorder",
      pending: true,
    });
    expect(projectedDelete.secondary[0]).toMatchObject({
      control: {
        confirmation: {
          closeIntent: { open: false, type: "operationConfirmationOpenChange" },
          open: true,
        },
      },
      role: "delete",
    });
    const unavailableEdit = contract.rows[1]?.cells.find(
      (cell) => cell.columnId === "operationControl:actions",
    )?.contents[0] as TableActionGroupContract;
    expect(unavailableEdit.secondary[0]).toMatchObject({
      dialog: {
        target: { kind: "unavailable", message: "Record unavailable." },
        targetKind: "reference",
      },
    });
    expect(JSON.stringify(contract)).not.toContain("executionKey");
    expect(JSON.stringify(contract)).not.toContain("canonicalOperationKey");
  });

  it("projects editing-disabled, empty, footer, invalid, and visible fallback states", () => {
    const disabledPresentation = tablePresentation({ canDelete: false, canPatch: false });
    const disabled = projectGeneratedTableContract({
      accessibilityLabel: "Tasks records",
      editingDisabledReason: "Task updates are unavailable.",
      footerValuesByColumnId: {
        "computed:estimate": {
          displayValue: "Invalid",
          status: { kind: "invalid", message: "Estimate could not be evaluated." },
        },
      },
      id: "tasks:active",
      presentation: disabledPresentation,
      rowsByRecordId: {
        "task-1": { contentsByColumnId: {} },
        "task-2": { contentsByColumnId: {} },
      },
    });
    const emptyPresentation = selectGeneratedTablePresentation({
      canDelete: false,
      canPatch: false,
      columns: [fieldColumn("title", textField(), { width: "lg" })],
      orderedRecordIds: [],
      query: { kind: "all" },
    });
    const empty = projectGeneratedTableContract({
      accessibilityLabel: "Tasks records",
      emptyStateAction: {
        control: operationControl(commandBinding(), false),
        kind: "operationAction",
        role: "command",
      },
      emptyStateDescription: "Create a task to get started.",
      id: "tasks:empty",
      presentation: emptyPresentation,
      rowsByRecordId: {},
    });

    expect(disabled.editing).toEqual({
      disabledReason: "Task updates are unavailable.",
      enabled: false,
    });
    expect(disabled.rows[0]?.cells[0]?.contents[0]).toEqual({
      accessibilityLabel: "Reorder unavailable",
      kind: "unavailable",
      message: "Cell unavailable.",
    });
    expect(disabled.footer?.cells.at(-1)).toMatchObject({
      displayValue: "Invalid",
      kind: "aggregateFooterCell",
      status: { kind: "invalid", message: "Estimate could not be evaluated." },
    });
    expect(empty).toMatchObject({
      editing: { enabled: true },
      emptyState: {
        action: { control: { id: commandBinding().id }, role: "command" },
        description: "Create a task to get started.",
        kind: "tableEmptyState",
        title: "No records yet.",
      },
      rows: [],
    });
  });
});

function tablePresentation({
  canDelete,
  canPatch,
  includeOperations = false,
}: {
  canDelete: boolean;
  canPatch: boolean;
  includeOperations?: boolean;
}) {
  const columns: TableColumnConfig[] = [
    orderingColumn(),
    fieldColumn("title", textField(), { width: "lg" }),
    fieldColumn("icon", iconField()),
    referenceFieldColumn(),
    computedColumn(),
    ...(includeOperations ? [operationColumn()] : []),
  ];

  return selectGeneratedTablePresentation({
    canDelete,
    canPatch,
    columns,
    footer: [aggregateFooter()],
    orderedRecordIds: ["task-2", "task-1"],
    query: { kind: "all" },
  });
}

function fieldColumn(
  fieldName: string,
  field: FieldSchema,
  options: Partial<
    Extract<
      TableColumnConfig,
      {
        type: "field";
      }
    >
  > = {},
): Extract<
  TableColumnConfig,
  {
    type: "field";
  }
> {
  return {
    commit: "field-commit",
    display: "editor",
    editor: fieldName === "icon" ? "icon" : "text",
    field,
    fieldName,
    format: "plain",
    key: `field:${fieldName}`,
    label: fieldName === "icon" ? "Icon" : "Title",
    type: "field",
    ...options,
  };
}
function referenceFieldColumn(): Extract<
  TableColumnConfig,
  {
    type: "referenceField";
  }
> {
  return {
    commit: "field-commit",
    display: "readOnly",
    editor: "text",
    field: textField(),
    fieldName: "name",
    format: "plain",
    key: "referenceField:owner",
    label: "Owner",
    referencedEntity: {} as EntitySchema,
    referencedEntityName: "principal",
    sourceReferenceFieldName: "owner",
    type: "referenceField",
  };
}
function computedColumn(): Extract<
  TableColumnConfig,
  {
    type: "computed";
  }
> {
  return {
    align: "end",
    computedValue: {
      entity: "task",
      expression: { field: "estimate", kind: "field" },
      type: "number",
    },
    computedValueName: "estimate",
    display: "readOnly",
    format: "plain",
    key: "computed:estimate",
    label: "Estimate",
    suffix: "hours",
    type: "computed",
  };
}
function operationColumn(): Extract<
  TableColumnConfig,
  {
    type: "operationControl";
  }
> {
  return {
    align: "end",
    controls: [],
    display: "readOnly",
    format: "plain",
    headerLabel: "Task actions",
    includeOrdering: true,
    key: "operationControl:actions",
    label: "",
    presentation: "dropdown",
    type: "operationControl",
    width: "xs",
  };
}
function orderingColumn(): Extract<
  TableColumnConfig,
  {
    type: "orderingHandle";
  }
> {
  return {
    align: "center",
    display: "readOnly",
    format: "plain",
    headerLabel: "Reorder",
    key: "orderingHandle",
    label: "",
    type: "orderingHandle",
    width: "xs",
  };
}

function aggregateFooter(): TableFooterSlotConfig {
  return {
    aggregate: {
      function: "sum",
      query: "active",
      value: { field: "estimate", kind: "field" },
    },
    aggregateName: "totalEstimate",
    columnKey: "computed:estimate",
    computedValues: {},
    format: "plain",
    key: "aggregate:totalEstimate",
    label: "Total estimate",
    suffix: "hours",
    type: "aggregate",
  };
}

function recordField(
  fieldName: string,
  field: FieldSchema,
  editor: "icon" | "text",
  value: string,
  recordId = "task-2",
) {
  return projectGeneratedRecordField({
    canPatch: true,
    density: "compact",
    fieldConfig: {
      commit: "field-commit",
      editor,
      field,
      fieldName,
      label: fieldName === "name" ? "Owner" : undefined,
    },
    occurrence: {
      owner: { cellId: `${recordId}:${fieldName}`, kind: "tableCell", tableId: "table-test" },
      placementId: fieldName,
    },
    recordId,
    recordValue: value,
    surface: "table-cell",
  });
}

function operationControl(
  binding: GeneratedOperationControlBinding,
  confirmationOpen: boolean,
): OperationControlContract {
  return projectGeneratedOperationControl({
    binding,
    confirmationOpen,
    presentation: {
      accessibilityLabel: binding.label,
      content: { kind: "label", label: binding.label },
      density: "compact",
      prominence: binding.destructive ? "destructive" : "primary",
    },
    state: { executionKey: binding.executionKey, status: "idle" },
  });
}

function commandBinding(): GeneratedOperationControlBinding {
  return {
    availability: { state: "enabled" },
    canonicalOperationKey: "task.sendReminder",
    entityName: "task",
    executionKey: "task.sendReminder:task-2",
    id: "table:task-2:sendReminder",
    input: { kind: "tableStatic" },
    kind: "command",
    label: "Send reminder",
    operationKind: "command",
    operationName: "sendReminder",
    scope: "record",
    visualIntent: "primary",
  };
}

function deleteBinding(): GeneratedOperationControlBinding {
  return {
    availability: { state: "enabled" },
    canonicalOperationKey: "task.delete",
    confirmation: {
      actionLabel: "Delete",
      description: "The task will be hidden from active views.",
      title: "Delete Review launch?",
    },
    destructive: true,
    entityName: "task",
    executionKey: "task.delete:task-2",
    id: "record-delete:task-2",
    input: { entityLabel: "Task", kind: "recordDelete", recordLabel: "Review launch" },
    kind: "delete",
    label: "Delete",
    operationKind: "delete",
    operationName: "delete",
    scope: "record",
    visualIntent: "destructive",
  };
}

function tableOrdering(rowId: string, pending: boolean) {
  return projectGeneratedTableOrdering({
    accessibilityLabel: `Reorder ${rowId}`,
    items: [
      {
        direction: "top",
        disabled: true,
        disabledReason: "Already first",
        label: "Move to top",
        plan: { kind: "unavailable", reason: "already-at-boundary" },
      },
      {
        direction: "down",
        disabled: false,
        label: "Move down",
        plan: { kind: "patch", rank: 3000, recordId: rowId },
      },
    ],
    pending,
    rowId,
    tableId: "tasks:active",
  });
}

function actionGroup(
  id: string,
  actions: Parameters<typeof projectGeneratedTableActionGroup>[0]["actions"],
) {
  return projectGeneratedTableActionGroup({
    actions,
    id,
    secondaryAccessibilityLabel: "More task actions",
  });
}

function textField(): FieldSchema {
  return { required: false, type: "text" };
}

function iconField(): FieldSchema {
  return { format: "icon", required: false, type: "text" };
}

const iconSource = '<svg viewBox="0 0 24 24"><path d="M12 2v20" /></svg>';
