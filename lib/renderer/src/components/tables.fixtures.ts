import type { FieldSchema, StateMachineSchema } from "@dpeek/formless-schema";
import type {
  ButtonContract,
  FieldContract,
  NativeLinkActionContract,
  TableActionContract,
  TableActionGroupContract,
  TableCellValueContract,
  TableColumnContract,
  TableContract,
  TableEditActionContract,
  TableOperationActionContract,
  TableOrderingContract,
  TableRowContract,
} from "@dpeek/formless-presentation/contract";
import {
  displayField,
  enumControl,
  enumOptions,
  enumValuePresentation,
  recordDrafts,
  recordField,
  stateMachineFacts,
  stateMachineField,
  textControl,
  withFixtureFieldOccurrence,
} from "./fields/fixture-helpers.ts";
import { operationControlFixtures } from "./operation-controls.fixtures.ts";

export type TableFixtureId = "active" | "empty";

export type TableFixture = {
  id: TableFixtureId;
  label: string;
  table: TableContract;
};

const titleSchema = {
  label: "Task",
  required: true,
  type: "text",
} satisfies Extract<
  FieldSchema,
  {
    type: "text";
  }
>;
const titleControl = textControl(titleSchema);
const statusSchema = {
  default: "open",
  label: "Status",
  required: true,
  type: "enum",
  values: [
    { key: "done", label: "Done", presentation: { color: "success" } },
    { key: "open", label: "Open", presentation: { color: "warning" } },
  ],
} as const satisfies Extract<
  FieldSchema,
  {
    type: "enum";
  }
>;
const statusMachine = {
  field: "status",
  initial: "open",
  terminal: ["done"],
  transitions: [{ key: "complete", from: ["open"], label: "Complete", to: "done" }],
} satisfies StateMachineSchema;
const tableColumns = [
  {
    accessibilityLabel: "Ordering",
    alignment: "center",
    contentRole: "ordering",
    id: "order",
    isRowHeader: false,
    kind: "tableColumn",
    label: "Order",
    labelVisibility: "hidden",
    width: "xs",
  },
  {
    accessibilityLabel: "Task",
    alignment: "start",
    contentRole: "field",
    id: "title",
    isRowHeader: true,
    kind: "tableColumn",
    label: "Task",
    labelVisibility: "visible",
    width: "auto",
  },
  {
    accessibilityLabel: "Status",
    alignment: "start",
    contentRole: "field",
    id: "status",
    isRowHeader: false,
    kind: "tableColumn",
    label: "Status",
    labelVisibility: "visible",
    width: "sm",
  },
  {
    accessibilityLabel: "Owner",
    alignment: "start",
    contentRole: "reference",
    id: "owner",
    isRowHeader: false,
    kind: "tableColumn",
    label: "Owner",
    labelVisibility: "visible",
    width: "sm",
  },
  {
    accessibilityLabel: "Score",
    alignment: "end",
    contentRole: "computed",
    id: "score",
    isRowHeader: false,
    kind: "tableColumn",
    label: "Score",
    labelVisibility: "visible",
    width: "sm",
  },
  {
    accessibilityLabel: "Actions",
    alignment: "end",
    contentRole: "actions",
    id: "actions",
    isRowHeader: false,
    kind: "tableColumn",
    label: "Actions",
    labelVisibility: "hidden",
    width: "md",
  },
] satisfies readonly TableColumnContract[];

const recordLinkColumn = {
  accessibilityLabel: "External destination",
  alignment: "end",
  contentRole: "actions",
  id: "record-link",
  isRowHeader: false,
  kind: "tableColumn",
  label: "External",
  labelVisibility: "visible",
  width: "sm",
} satisfies TableColumnContract;

const tableColumnsWithRecordLink = [
  ...tableColumns.slice(0, -1),
  recordLinkColumn,
  tableColumns.at(-1)!,
] satisfies readonly TableColumnContract[];

export function createTableFixtures(): TableFixture[] {
  return [
    {
      id: "active",
      label: "Active",
      table: activeTableFixture(),
    },
    {
      id: "empty",
      label: "Empty",
      table: emptyTableFixture(),
    },
  ];
}

function activeTableFixture(): TableContract {
  const rows = [
    taskRow({
      canEdit: true,
      canOrder: true,
      canDelete: true,
      index: 0,
      owner: "Sam Rivera",
      rowCount: 3,
      rowId: "task-1",
      score: { kind: "ready", value: "18" },
      status: "open",
      title: "Prepare launch checklist",
    }),
    taskRow({
      canEdit: false,
      canOrder: true,
      canDelete: false,
      index: 1,
      owner: "Mina Patel",
      rowCount: 3,
      rowId: "task-2",
      score: { kind: "ready", value: "12" },
      status: "open",
      title: "Review release copy",
    }),
    taskRow({
      canEdit: true,
      canOrder: true,
      canDelete: false,
      index: 2,
      owner: "No owner",
      rowCount: 3,
      rowId: "task-3",
      score: { kind: "invalid" },
      status: "done",
      title: "Publish release notes",
    }),
  ];

  return {
    accessibilityLabel: "Tasks",
    columns: tableColumnsWithRecordLink,
    density: "default",
    footer: taskFooter("18"),
    id: "tasks",
    kind: "table",
    rows,
  };
}

function emptyTableFixture(): TableContract {
  return {
    accessibilityLabel: "Empty tasks",
    columns: tableColumnsWithRecordLink,
    density: "default",
    emptyState: {
      description: "Adjust the current filters to see more tasks.",
      id: "tasks:empty",
      kind: "tableEmptyState",
      title: "No matching tasks",
    },
    id: "tasks",
    kind: "table",
    rows: [],
  };
}

type TaskRowInput = {
  canDelete: boolean;
  canEdit: boolean;
  canOrder: boolean;
  index: number;
  owner: string;
  rowCount: number;
  rowId: string;
  score:
    | {
        kind: "invalid";
      }
    | {
        kind: "ready";
        value: string;
      };
  status: "done" | "open";
  title: string;
};

function taskRow(input: TaskRowInput): TableRowContract {
  const actions = taskActions(input, taskDialogFields(input));

  return {
    accessibilityLabel: input.title,
    cells: [
      {
        columnId: "order",
        contents: input.canOrder
          ? [taskOrdering(input)]
          : [
              {
                accessibilityLabel: `Ordering unavailable for ${input.title}`,
                kind: "unavailable",
                message: "—",
              },
            ],
        id: `${input.rowId}:order`,
        kind: "tableCell",
      },
      {
        columnId: "title",
        contents: [taskTitleValue(input)],
        id: `${input.rowId}:title`,
        kind: "tableCell",
      },
      {
        columnId: "status",
        contents: [taskStatusValue(input)],
        id: `${input.rowId}:status`,
        kind: "tableCell",
      },
      {
        columnId: "owner",
        contents: [
          {
            accessibilityLabel: `Owner: ${input.owner}`,
            displayValue: input.owner,
            kind: "cellValue",
            presentation: { kind: "reference" },
          },
        ],
        id: `${input.rowId}:owner`,
        kind: "tableCell",
      },
      {
        columnId: "score",
        contents: [taskScore(input)],
        id: `${input.rowId}:score`,
        kind: "tableCell",
      },
      {
        columnId: recordLinkColumn.id,
        contents: [taskRecordLink(input)],
        id: `${input.rowId}:record-link`,
        kind: "tableCell",
      },
      {
        columnId: "actions",
        contents:
          actions.actions.length > 0
            ? [actions]
            : [
                {
                  accessibilityLabel: `Actions unavailable for ${input.title}`,
                  kind: "unavailable",
                  message: "Editing is unavailable",
                },
              ],
        id: `${input.rowId}:actions`,
        kind: "tableCell",
      },
    ],
    id: input.rowId,
    kind: "tableRow",
  };
}

function taskTitleValue(input: Pick<TaskRowInput, "title">): TableCellValueContract {
  return {
    accessibilityLabel: `Task: ${input.title}`,
    displayValue: input.title,
    kind: "cellValue",
    presentation: { kind: "text" },
  };
}

function taskStatusValue(input: Pick<TaskRowInput, "status">): TableCellValueContract {
  const value = enumValuePresentation(statusSchema, input.status);

  return {
    accessibilityLabel: `Status: ${value.label}`,
    displayValue: value.label,
    kind: "cellValue",
    presentation: { content: "label", kind: "state", value },
  };
}

function taskScore(input: Pick<TaskRowInput, "score" | "title">) {
  if (input.score.kind === "invalid") {
    return {
      accessibilityLabel: "Score value is invalid or unavailable.",
      kind: "invalidValue",
    } as const;
  }

  return {
    accessibilityLabel: `${input.title} score: ${input.score.value} points`,
    displayValue: input.score.value,
    kind: "cellValue",
    presentation: { kind: "computed" },
    suffix: "points",
  } as const;
}

function taskRecordLink(
  input: Pick<TaskRowInput, "index" | "rowId" | "title">,
): NativeLinkActionContract {
  const base = {
    accessibilityLabel: `Open external details for ${input.title}`,
    id: `${input.rowId}:record-link`,
    kind: "nativeLinkAction" as const,
    label: "Open details",
    prominence: "primary" as const,
    target: input.index === 2 ? ("sameTab" as const) : ("newTab" as const),
  };

  return input.index === 1
    ? {
        ...base,
        availability: "unavailable",
        unavailableReason: "Link destination is unavailable.",
      }
    : {
        ...base,
        availability: "available",
        href: `https://example.test/tasks/${input.rowId}`,
      };
}

function taskOrdering(input: TaskRowInput): TableOrderingContract {
  return {
    accessibilityLabel: `Reorder ${input.title}`,
    actions: (["top", "up", "down", "bottom"] as const).map((direction) => {
      const atStart = input.index === 0 && (direction === "top" || direction === "up");
      const atEnd =
        input.index === input.rowCount - 1 && (direction === "bottom" || direction === "down");
      const disabledReason = atStart ? "Already first" : atEnd ? "Already last" : undefined;
      const label =
        direction === "top"
          ? "Move to top"
          : direction === "up"
            ? "Move up"
            : direction === "down"
              ? "Move down"
              : "Move to bottom";
      const actionId = `${input.rowId}:${direction}`;

      return {
        direction,
        ...(disabledReason ? { disabled: true, disabledReason } : {}),
        id: actionId,
        intent: {
          actionId,
          direction,
          rowId: input.rowId,
          tableId: "tasks",
          type: "tableReorder",
        },
        kind: "orderingAction" as const,
        label,
      };
    }),
    affordance: "reorder",
    kind: "ordering",
    pending: false,
  };
}

function taskDialogFields(input: TaskRowInput): readonly FieldContract[] {
  const machine = stateMachineField({
    fieldName: "status",
    machine: statusMachine,
    machineName: "taskWorkflow",
  });

  return [
    recordField({
      commit: "field-commit",
      control: titleControl,
      drafts: recordDrafts({ recordValue: input.title }),
      editor: titleControl.editor,
      field: titleSchema,
      fieldName: "title",
      labelVisibility: "visible",
      occurrence: { ownerId: `dialog:${input.rowId}`, placementId: "title" },
      recordId: input.rowId,
      rendererKind: "text",
      surface: "record",
    }),
    displayField({
      access: { kind: "stateMachine", writable: false },
      control: enumControl(statusSchema),
      editor: "enum",
      field: statusSchema,
      fieldName: "status",
      formatting: {
        displayValue: statusSchema.values.find((definition) => definition.key === input.status)!
          .label,
        enumValuePresentation: enumValuePresentation(statusSchema, input.status),
      },
      labelVisibility: "visible",
      options: { enumOptions: enumOptions(statusSchema) },
      occurrence: { ownerId: `dialog:${input.rowId}`, placementId: "status" },
      recordId: input.rowId,
      stateMachine: machine,
      stateMachineFacts: stateMachineFacts({
        currentValue: input.status,
        field: statusSchema,
        interaction: "display",
        operationNames: {},
        stateMachine: machine,
      }),
      surface: "record",
      value: input.status,
    }),
  ];
}

function taskActions(input: TaskRowInput, fields: readonly FieldContract[]) {
  const actions: TableActionContract[] = [];

  if (input.canEdit) {
    actions.push(editTaskAction(input, fields));
  }

  if (input.canDelete) {
    actions.push({
      control: operationControlFixtures.deleteTask.initial,
      kind: "operationAction",
      role: "delete",
    } satisfies TableOperationActionContract);
  }

  actions.push(...taskOrdering(input).actions);

  return {
    accessibilityLabel: `More options for ${input.title}`,
    actions,
    id: `${input.rowId}:actions`,
    kind: "actionGroup",
  } satisfies TableActionGroupContract;
}

function editTaskAction(
  input: Pick<TaskRowInput, "rowId" | "title">,
  fields: readonly FieldContract[],
): TableEditActionContract {
  const dialogId = `${input.rowId}:edit`;
  const fieldSetId = `${dialogId}:fields`;

  return {
    dialog: {
      close: tableButton({ id: `${dialogId}:close`, label: "Done" }),
      description: "Update the selected task.",
      id: dialogId,
      kind: "tableEditDialog",
      open: false,
      openChangeIntent: {
        dialogId,
        open: false,
        rowId: input.rowId,
        tableId: "tasks",
        type: "tableEditDialogOpenChange",
      },
      target: {
        fieldSet: {
          disabled: false,
          fields: fields.map((field) => tableDialogField(field, fieldSetId)),
          id: fieldSetId,
          kind: "fieldSet",
          label: "Task fields",
        },
        kind: "available",
      },
      targetKind: "row",
      title: `Edit ${input.title}`,
    },
    kind: "editAction",
    openIntent: {
      dialogId,
      open: true,
      rowId: input.rowId,
      tableId: "tasks",
      type: "tableEditDialogOpenChange",
    },
    trigger: tableButton({ id: `${dialogId}:open`, label: "Edit task" }),
  };
}

function tableDialogField(field: FieldContract, fieldSetId: string): FieldContract {
  if (field.mode === "editor" && (field.surface === "create" || field.surface === "operation")) {
    return field;
  }

  return withFixtureFieldOccurrence(
    {
      ...field,
      labelVisibility: "visible",
      surface: "record",
    },
    { ownerId: fieldSetId, placementId: field.fieldName },
  );
}

function tableButton({
  id,
  label,
  prominence = "secondary",
}: {
  id: string;
  label: string;
  prominence?: ButtonContract["prominence"];
}): ButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "compact",
    id,
    kind: "button",
    prominence,
    type: "button",
  };
}

function taskFooter(total: string): NonNullable<TableContract["footer"]> {
  return {
    accessibilityLabel: "Task aggregates",
    cells: tableColumnsWithRecordLink.map((column) =>
      column.id === "score"
        ? {
            accessibilityLabel: `Total available score: ${total} points`,
            columnId: column.id,
            displayValue: total,
            id: `tasks:footer:${column.id}`,
            kind: "aggregateFooterCell",
            status: { kind: "ready" },
            suffix: "points",
          }
        : {
            columnId: column.id,
            id: `tasks:footer:${column.id}`,
            kind: "emptyFooterCell",
          },
    ),
    id: "tasks:footer",
    kind: "tableFooter",
  };
}
