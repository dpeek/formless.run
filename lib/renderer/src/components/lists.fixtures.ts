import type { FieldSchema, StateMachineSchema } from "@dpeek/formless-schema";
import type {
  FieldContract,
  ListActionGroupContract,
  ListContract,
  ListItemContract,
  ListOperationActionContract,
  ListOrderingContract,
} from "@dpeek/formless-presentation/contract";
import {
  displayField,
  enumControl,
  enumOptions,
  enumValuePresentation,
  fieldError,
  recordDrafts,
  recordField,
  stateMachineFacts,
  stateMachineField,
  textControl,
} from "./fields/fixture-helpers.ts";
import { operationControlFixtures } from "./operation-controls.fixtures.ts";

export type ListFixtureId = "active" | "editing-disabled" | "empty";

export type ListFixture = {
  id: ListFixtureId;
  label: string;
  list: ListContract;
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
const kindSchema = {
  label: "Kind",
  required: true,
  type: "enum",
  values: [
    { key: "article", label: "Article" },
    { key: "link", label: "Link" },
  ],
} as const satisfies Extract<
  FieldSchema,
  {
    type: "enum";
  }
>;
const summarySchema = {
  label: "Summary",
  required: false,
  type: "text",
} satisfies Extract<
  FieldSchema,
  {
    type: "text";
  }
>;
const urlSchema = {
  label: "URL",
  required: true,
  type: "text",
} satisfies Extract<
  FieldSchema,
  {
    type: "text";
  }
>;
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
const taskWorkflow = {
  field: "status",
  initial: "open",
  terminal: ["done"],
  transitions: [{ key: "complete", from: ["open"], label: "Complete", to: "done" }],
} satisfies StateMachineSchema;
const taskStatusMachine = stateMachineField({
  fieldName: "status",
  machine: taskWorkflow,
  machineName: "taskWorkflow",
});

export function createListFixtures(): ListFixture[] {
  return [
    {
      id: "active",
      label: "Active",
      list: activeListFixture(),
    },
    {
      id: "empty",
      label: "Empty",
      list: emptyListFixture(),
    },
    {
      id: "editing-disabled",
      label: "Read-only",
      list: editingDisabledListFixture(),
    },
  ];
}

function activeListFixture(): ListContract {
  const items = [
    taskItem({
      canDelete: true,
      index: 0,
      kind: "article",
      rowCount: 3,
      status: "open",
      summary: "Coordinate launch owners and final checks.",
      taskId: "task-1",
      title: "Prepare launch checklist",
      titleMode: "editable",
      warning: "Owner email is missing.",
    }),
    taskItem({
      index: 1,
      kind: "link",
      pending: true,
      rowCount: 3,
      status: "open",
      taskId: "task-2",
      title: "Review release copy",
      titleMode: "readOnly",
      url: "https://example.com/releases/draft",
    }),
    taskItem({
      index: 2,
      invalid: true,
      kind: "article",
      rowCount: 3,
      status: "done",
      summary: "Publish the approved announcement.",
      taskId: "task-3",
      title: "",
      titleMode: "editable",
    }),
  ];

  return {
    accessibilityLabel: "Tasks",
    density: "compact",
    editing: { enabled: true },
    id: "tasks",
    items,
    kind: "list",
  };
}

function emptyListFixture(): ListContract {
  return {
    accessibilityLabel: "Empty tasks",
    density: "default",
    editing: { enabled: true },
    emptyState: {
      action: {
        ...operationAction(operationControlFixtures.refreshTasks.initial, "command"),
        role: "command",
      },
      description: "Adjust the current filters to see more tasks.",
      id: "tasks:empty",
      kind: "listEmptyState",
      title: "No matching tasks",
    },
    id: "tasks",
    items: [],
    kind: "list",
  };
}

function editingDisabledListFixture(): ListContract {
  return {
    accessibilityLabel: "Read-only tasks",
    density: "default",
    editing: {
      disabledReason: "Editing requires an owner session.",
      enabled: false,
    },
    id: "tasks",
    items: [
      taskItem({
        canOrder: false,
        index: 0,
        kind: "article",
        rowCount: 1,
        status: "done",
        summary: "Coordinate launch owners and final checks.",
        taskId: "task-read-only",
        title: "Prepare launch checklist",
        titleMode: "readOnly",
      }),
    ],
    kind: "list",
  };
}

type TaskItemInput = {
  canDelete?: boolean;
  canOrder?: boolean;
  index: number;
  invalid?: boolean;
  kind: "article" | "link";
  pending?: boolean;
  rowCount: number;
  status: "done" | "open";
  summary?: string;
  taskId: string;
  title: string;
  titleMode: "editable" | "readOnly";
  url?: string;
  warning?: string;
};

function taskItem(input: TaskItemInput): ListItemContract {
  const displayTitle = input.title || "Untitled task";

  return {
    accessibilityLabel: displayTitle,
    actions: taskActions(input, displayTitle),
    availability: { available: true },
    fields: taskFields(input),
    id: input.taskId,
    kind: "listItem",
    ...(input.canOrder === false ? {} : { ordering: taskOrdering(input, displayTitle) }),
    presentation: "fields",
    warnings: input.warning
      ? [
          {
            id: `${input.taskId}:readiness`,
            items: [{ code: "owner-email", message: input.warning }],
            kind: "listWarning",
            title: "Readiness warnings",
          },
        ]
      : [],
  };
}

function taskFields(input: TaskItemInput): FieldContract[] {
  const fields = [taskTitleField(input), taskKindField(input), taskStatusField(input)];

  if (input.kind === "link") {
    fields.splice(2, 0, taskUrlField(input));
  } else {
    fields.splice(2, 0, taskSummaryField(input));
  }

  return fields;
}

function taskTitleField(input: TaskItemInput) {
  const common = {
    control: titleControl,
    editor: titleControl.editor,
    field: titleSchema,
    fieldName: "title",
    labelVisibility: "hidden" as const,
    occurrence: { ownerId: `list:${input.taskId}`, placementId: "title" },
    ...(input.pending ? { pending: { isPending: true, label: "Saving task" } } : {}),
    recordId: input.taskId,
    surface: "record" as const,
  };

  if (input.titleMode === "readOnly") {
    return displayField({
      ...common,
      density: "compact",
      formatting: { displayValue: input.title },
      value: input.title,
    });
  }

  return recordField({
    ...common,
    commit: "field-commit",
    density: "compact",
    drafts: recordDrafts({ recordValue: input.title }),
    ...(input.invalid
      ? { errors: [fieldError("title", "Task title is required.", input.title)] }
      : {}),
    rendererKind: "text",
  });
}

function taskKindField(input: TaskItemInput) {
  const control = enumControl(kindSchema);

  return displayField({
    control,
    density: "compact",
    editor: control.editor,
    field: kindSchema,
    fieldName: "kind",
    formatting: {
      displayValue: kindSchema.values.find((definition) => definition.key === input.kind)!.label,
      enumValuePresentation: enumValuePresentation(kindSchema, input.kind),
    },
    labelVisibility: "hidden",
    options: { enumOptions: enumOptions(kindSchema) },
    occurrence: { ownerId: `list:${input.taskId}`, placementId: "kind" },
    recordId: input.taskId,
    surface: "record",
    value: input.kind,
  });
}

function taskSummaryField(input: TaskItemInput) {
  const control = textControl(summarySchema);
  const summary = input.summary ?? "";

  return displayField({
    control,
    density: "compact",
    editor: control.editor,
    field: summarySchema,
    fieldName: "summary",
    formatting: { displayValue: summary },
    labelVisibility: "hidden",
    occurrence: { ownerId: `list:${input.taskId}`, placementId: "summary" },
    recordId: input.taskId,
    surface: "record",
    value: summary,
    visibleWhen: { field: "kind", values: ["article"] },
  });
}

function taskUrlField(input: TaskItemInput) {
  const control = textControl(urlSchema, { editor: "href" });
  const url = input.url ?? "";

  return displayField({
    control,
    density: "compact",
    editor: control.editor,
    field: urlSchema,
    fieldName: "url",
    formatting: { displayValue: url },
    labelVisibility: "hidden",
    occurrence: { ownerId: `list:${input.taskId}`, placementId: "url" },
    recordId: input.taskId,
    surface: "record",
    value: url,
    visibleWhen: { field: "kind", values: ["link"] },
  });
}

function taskStatusField(input: TaskItemInput) {
  const control = enumControl(statusSchema);

  return displayField({
    access: { kind: "stateMachine", writable: false },
    control,
    density: "compact",
    editor: control.editor,
    field: statusSchema,
    fieldName: "status",
    formatting: {
      displayValue: statusSchema.values.find((definition) => definition.key === input.status)!
        .label,
      enumValuePresentation: enumValuePresentation(statusSchema, input.status),
    },
    labelVisibility: "hidden",
    options: { enumOptions: enumOptions(statusSchema) },
    occurrence: { ownerId: `list:${input.taskId}`, placementId: "status" },
    recordId: input.taskId,
    stateMachine: taskStatusMachine,
    stateMachineFacts: stateMachineFacts({
      currentValue: input.status,
      field: statusSchema,
      interaction: input.titleMode === "editable" ? "transitions" : "display",
      operationNames: { complete: "tasks.complete" },
      stateMachine: taskStatusMachine,
    }),
    surface: "record",
    value: input.status,
  });
}

function taskActions(
  input: Pick<TaskItemInput, "canDelete" | "taskId">,
  displayTitle: string,
): ListActionGroupContract {
  return {
    id: `${input.taskId}:actions`,
    kind: "actionGroup",
    primary: [],
    secondary: input.canDelete
      ? [operationAction(operationControlFixtures.deleteTask.initial, "delete")]
      : [],
    secondaryAccessibilityLabel: `More actions for ${displayTitle}`,
  };
}

function taskOrdering(input: TaskItemInput, displayTitle: string): ListOrderingContract {
  return {
    accessibilityLabel: `Reorder ${displayTitle}`,
    actions: (["top", "up", "down", "bottom"] as const).map((direction) => {
      const atStart = input.index === 0 && (direction === "top" || direction === "up");
      const atEnd =
        input.index === input.rowCount - 1 && (direction === "bottom" || direction === "down");
      const structurallyAvailable = !atStart && !atEnd;
      const disabledReason = input.pending
        ? "Ordering in progress"
        : atStart
          ? "Already first"
          : atEnd
            ? "Already last"
            : undefined;
      const label =
        direction === "top"
          ? "Move to top"
          : direction === "up"
            ? "Move up"
            : direction === "down"
              ? "Move down"
              : "Move to bottom";
      const actionId = `${input.taskId}:order:${direction}`;

      return {
        direction,
        ...(disabledReason ? { disabled: true, disabledReason } : {}),
        id: actionId,
        intent: {
          actionId,
          direction,
          itemId: input.taskId,
          listId: "tasks",
          type: "listReorder",
        },
        label,
        ...(input.pending ? { pending: { isPending: true, label: "Ordering in progress" } } : {}),
        structurallyAvailable,
      };
    }),
    affordance: "reorder",
    kind: "ordering",
    pending: Boolean(input.pending),
  };
}

function operationAction(
  control: ListOperationActionContract["control"],
  role: ListOperationActionContract["role"],
): ListOperationActionContract {
  return { control, kind: "operationAction", role };
}
