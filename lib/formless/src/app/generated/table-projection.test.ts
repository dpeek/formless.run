import { describe, expect, it } from "vite-plus/test";
import type { EntitySchema, FieldSchema } from "@dpeek/formless-schema";
import type {
  OperationControlContract,
  TableActionGroupContract,
  TableContract,
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
  projectGeneratedTableContract,
  projectGeneratedTableDisplayValue,
  projectGeneratedTableEditAction,
  projectGeneratedTableInvalidValue,
  projectGeneratedTableOperationAction,
  projectGeneratedTableOrdering,
} from "./table-projection.ts";
import {
  indexGeneratedTableEditFields,
  resolveGeneratedTableEditFieldIntent,
} from "./generated-table-foundation.tsx";
import { selectGeneratedTablePresentation } from "./table-presentation.ts";

describe("generated Formless UI table projection", () => {
  it("indexes only explicit edit-dialog fields and rejects mismatched intents", () => {
    const tableId = "table-test";
    const fieldSetId = "task-1:edit-dialog:fields";
    const record = taskRecord();
    const fieldConfig = recordFieldConfig();
    const dialogField = projectGeneratedRecordField({
      canPatch: true,
      fieldConfig,
      occurrence: {
        owner: { fieldSetId, kind: "tableEditFieldSet", tableId },
        placementId: fieldConfig.fieldName,
      },
      recordId: record.id,
      recordValue: record.values.title,
      surface: "record",
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
    const table = singleRowTable(tableId, [
      projectGeneratedTableDisplayValue({
        accessibilityLabel: "Title: Prepare launch",
        displayValue: "Prepare launch",
      }),
      actionGroup("task-1:actions", [editAction]),
    ]);
    const contexts = new Map([
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
    const index = indexGeneratedTableEditFields(table, contexts);
    const intent = { fieldName: "title", type: "recordDraftRevert" } as const;

    expect(index.size).toBe(1);
    expect(index.get(dialogField.fieldId)).toMatchObject({ contextId: fieldSetId });
    expect(
      resolveGeneratedTableEditFieldIntent(index, {
        contextId: fieldSetId,
        fieldId: dialogField.fieldId,
        intent,
        recordId: record.id,
        tableId,
      }),
    ).toMatchObject({ fieldId: dialogField.fieldId });
    expect(
      resolveGeneratedTableEditFieldIntent(index, {
        contextId: "task-1:title",
        fieldId: dialogField.fieldId,
        intent,
        recordId: record.id,
        tableId,
      }),
    ).toBeUndefined();
  });

  it("projects semantic columns and ordered read-only cell values", () => {
    const contract = projectGeneratedTableContract({
      accessibilityLabel: "Tasks records",
      footerValuesByColumnId: {
        "computed:estimate": { displayValue: "8 hours", suffix: "hours" },
      },
      id: "tasks:active",
      presentation: tablePresentation(),
      rowsByRecordId: {
        "task-1": {
          accessibilityLabel: "Prepare launch",
          contentsByColumnId: {
            orderingHandle: [tableOrdering("task-1", false)],
            "field:title": [cellValue("Title: Prepare launch", "Prepare launch")],
            "field:icon": [
              {
                accessibilityLabel: "Icon: task",
                displayValue: "task",
                kind: "cellValue",
                presentation: { kind: "icon", source: iconSource },
              },
            ],
            "referenceField:owner": [
              projectGeneratedTableInvalidValue("Owner value is invalid or unavailable."),
            ],
            "computed:estimate": [
              projectGeneratedTableDisplayValue({
                accessibilityLabel: "Estimate: 8 hours",
                displayValue: "8",
                suffix: "hours",
              }),
            ],
          },
        },
        "task-2": {
          accessibilityLabel: "Review launch",
          contentsByColumnId: {
            orderingHandle: [tableOrdering("task-2", false)],
            "field:title": [cellValue("Title: Review launch", "Review launch")],
            "field:icon": [
              {
                accessibilityLabel: "Icon: task",
                displayValue: "task",
                kind: "cellValue",
                presentation: { kind: "icon", source: iconSource },
              },
            ],
            "referenceField:owner": [
              {
                accessibilityLabel: "Owner: Dana",
                displayValue: "Dana",
                kind: "cellValue",
                presentation: { kind: "reference" },
              },
            ],
            "computed:estimate": [
              projectGeneratedTableInvalidValue("Estimate value is invalid or unavailable."),
            ],
          },
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
      id: "tasks:active",
      kind: "table",
      rows: [{ id: "task-2" }, { id: "task-1" }],
    });
    expect(contract.rows[0]?.cells[1]?.contents[0]).toEqual(
      cellValue("Title: Review launch", "Review launch"),
    );
    expect(contract.rows[0]?.cells[2]?.contents[0]).toMatchObject({
      kind: "cellValue",
      presentation: { kind: "icon", source: iconSource },
    });
    expect(contract.rows[0]?.cells[3]?.contents[0]).toMatchObject({
      displayValue: "Dana",
      presentation: { kind: "reference" },
    });
    expect(contract.rows[1]?.cells[3]?.contents[0]).toEqual({
      accessibilityLabel: "Owner value is invalid or unavailable.",
      kind: "invalidValue",
    });
    expect(JSON.stringify(contract)).not.toContain('"fieldId"');
    expect(JSON.stringify(contract)).not.toContain('"warnings"');
  });

  it("projects one ordered action group with dialogs, destructive controls, and ordering", () => {
    const presentation = tablePresentation({ includeOperations: true });
    const command = operationControl(commandBinding(), false);
    const deletion = operationControl(deleteBinding(), true);
    const edit = projectGeneratedTableEditAction({
      actionId: "task-2:edit",
      dialogId: "task-2:edit-dialog",
      fields: [dialogRecordField()],
      label: "Edit task",
      open: true,
      rowId: "task-2",
      tableId: "tasks:active",
      target: { editingEnabled: true, kind: "available" },
      targetKind: "reference",
      title: "Edit task",
      warning: "Updating this shared record may affect other records.",
    });
    const orderingActions = tableOrdering("task-2", true).actions;
    const rowActions = actionGroup("task-2:actions", [
      projectGeneratedTableOperationAction(command, "command"),
      edit,
      projectGeneratedTableOperationAction(deletion, "delete"),
      ...orderingActions,
    ]);
    const contract = projectGeneratedTableContract({
      accessibilityLabel: "Tasks records",
      id: "tasks:active",
      presentation,
      rowsByRecordId: {
        "task-1": {
          contentsByColumnId: {
            orderingHandle: [tableOrdering("task-1", false)],
            "field:title": [cellValue("Title: Prepare launch", "Prepare launch")],
            "operationControl:actions": [rowActions],
          },
        },
        "task-2": {
          contentsByColumnId: {
            orderingHandle: [tableOrdering("task-2", true)],
            "field:title": [cellValue("Title: Review launch", "Review launch")],
            "operationControl:actions": [rowActions],
          },
        },
      },
    });
    const projectedActions = contract.rows[0]?.cells.find(
      (cell) => cell.columnId === "operationControl:actions",
    )?.contents[0] as TableActionGroupContract;
    const projectedOrdering = contract.rows[0]?.cells[0]?.contents[0];
    expect(projectedActions).toMatchObject({
      accessibilityLabel: "More options for task",
    });
    expect(projectedActions.actions[0]).toMatchObject({
      control: {
        kind: "operationControl",
        trigger: {
          intent: { invocationSource: "menuItem" },
          prominence: "primary",
        },
      },
      kind: "operationAction",
      role: "command",
    });
    expect(projectedActions.actions[1]).toMatchObject({
      dialog: {
        open: true,
        warning: "Updating this shared record may affect other records.",
        target: {
          fieldSet: { fields: [{ labelVisibility: "visible", surface: "record" }] },
          kind: "available",
        },
      },
      openIntent: { open: true, type: "tableEditDialogOpenChange" },
    });
    expect(projectedOrdering).toMatchObject({
      actions: [{ direction: "top" }, { direction: "down" }],
      affordance: "reorder",
      pending: true,
    });
    expect(projectedActions.actions[2]).toMatchObject({
      control: { confirmation: { open: true } },
      role: "delete",
    });
    expect(projectedActions.actions.slice(3)).toMatchObject([
      { direction: "top", kind: "orderingAction" },
      { direction: "down", kind: "orderingAction" },
    ]);
    expect(JSON.stringify(contract)).not.toContain("executionKey");
    expect(JSON.stringify(contract)).not.toContain("canonicalOperationKey");
  });

  it("projects empty, footer, invalid, and visible fallback states", () => {
    const populated = projectGeneratedTableContract({
      accessibilityLabel: "Tasks records",
      footerValuesByColumnId: {
        "computed:estimate": {
          displayValue: "Invalid",
          status: { kind: "invalid", message: "Estimate could not be evaluated." },
        },
      },
      id: "tasks:active",
      presentation: tablePresentation(),
      rowsByRecordId: {
        "task-1": { contentsByColumnId: {} },
        "task-2": { contentsByColumnId: {} },
      },
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
      presentation: selectGeneratedTablePresentation({
        columns: [fieldColumn("title", textField(), { width: "lg" })],
        orderedRecordIds: [],
        query: { kind: "all" },
      }),
      rowsByRecordId: {},
    });

    expect(populated.rows[0]?.cells[1]?.contents[0]).toEqual({
      accessibilityLabel: "Title value is invalid or unavailable.",
      kind: "invalidValue",
    });
    expect(populated.footer?.cells.at(-1)).toMatchObject({
      displayValue: "Invalid",
      kind: "aggregateFooterCell",
      status: { kind: "invalid", message: "Estimate could not be evaluated." },
    });
    expect(empty).toMatchObject({
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

function singleRowTable(
  tableId: string,
  contents: TableContract["rows"][number]["cells"][number]["contents"],
): TableContract {
  return {
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
    id: tableId,
    kind: "table",
    rows: [
      {
        accessibilityLabel: "Prepare launch",
        cells: [
          { columnId: "title", contents: [contents[0]!], id: "task-1:title", kind: "tableCell" },
          {
            columnId: "actions",
            contents: [contents[1]!],
            id: "task-1:actions",
            kind: "tableCell",
          },
        ],
        id: "task-1",
        kind: "tableRow",
      },
    ],
  };
}

function tablePresentation({
  includeOperations = false,
}: {
  includeOperations?: boolean;
} = {}) {
  return selectGeneratedTablePresentation({
    columns: [
      orderingColumn(),
      fieldColumn("title", textField(), { width: "lg" }),
      fieldColumn("icon", iconField()),
      referenceFieldColumn(),
      computedColumn(),
      ...(includeOperations ? [operationColumn()] : []),
    ],
    footer: [aggregateFooter()],
    orderedRecordIds: ["task-2", "task-1"],
    query: { kind: "all" },
  });
}

function fieldColumn(
  fieldName: string,
  field: FieldSchema,
  options: Partial<Extract<TableColumnConfig, { type: "field" }>> = {},
): Extract<TableColumnConfig, { type: "field" }> {
  return {
    commit: "field-commit",
    display: "readOnly",
    editor: fieldName === "icon" ? "icon" : "text",
    field,
    fieldName,
    fieldRef: { kind: "value", name: fieldName },
    format: "plain",
    key: `field:${fieldName}`,
    label: fieldName === "icon" ? "Icon" : "Title",
    type: "field",
    writable: true,
    ...options,
  };
}

function referenceFieldColumn(): Extract<TableColumnConfig, { type: "referenceField" }> {
  return {
    commit: "field-commit",
    display: "readOnly",
    editor: "text",
    field: textField(),
    fieldName: "name",
    fieldRef: { kind: "value", name: "name" },
    format: "plain",
    key: "referenceField:owner",
    label: "Owner",
    referencedEntity: {} as EntitySchema,
    referencedEntityName: "principal",
    sourceReferenceFieldName: "owner",
    type: "referenceField",
    writable: true,
  };
}

function computedColumn(): Extract<TableColumnConfig, { type: "computed" }> {
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

function operationColumn(): Extract<TableColumnConfig, { type: "operationControl" }> {
  return {
    align: "end",
    controls: [],
    display: "readOnly",
    format: "plain",
    headerLabel: "Task actions",
    includeOrdering: true,
    key: "operationControl:actions",
    label: "",
    type: "operationControl",
    width: "xs",
  };
}

function orderingColumn(): Extract<TableColumnConfig, { type: "orderingHandle" }> {
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
    aggregate: { function: "sum", query: "active", value: { field: "estimate", kind: "field" } },
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

function dialogRecordField() {
  return projectGeneratedRecordField({
    canPatch: true,
    fieldConfig: recordFieldConfig(),
    occurrence: {
      owner: {
        fieldSetId: "task-2:edit-dialog:fields",
        kind: "tableEditFieldSet",
        tableId: "tasks:active",
      },
      placementId: "title",
    },
    recordId: "task-2",
    recordValue: "Review launch",
    surface: "record",
  });
}

function recordFieldConfig(): RecordFieldConfig {
  return {
    commit: "field-commit",
    editor: "text",
    field: textField(),
    fieldName: "title",
    fieldRef: { kind: "value", name: "title" },
    label: "Title",
    writable: true,
  };
}

function taskRecord(): StoredRecord {
  return {
    createdAt: "2026-07-16T00:00:00.000Z",
    entity: "task",
    id: "task-1",
    updatedAt: "2026-07-16T00:00:00.000Z",
    values: { title: "Prepare launch" },
  };
}

function cellValue(accessibilityLabel: string, displayValue: string) {
  return {
    accessibilityLabel,
    displayValue,
    kind: "cellValue" as const,
    presentation: { kind: "text" as const },
  };
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
    accessibilityLabel: "More options for task",
    actions,
    id,
  });
}

function textField(): FieldSchema {
  return { required: false, type: "text" };
}

function iconField(): FieldSchema {
  return { format: "icon", required: false, type: "text" };
}

const iconSource = '<svg viewBox="0 0 24 24"><path d="M12 2v20" /></svg>';
