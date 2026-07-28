import type { FieldSchema } from "@dpeek/formless-schema";
import type {
  FieldContract,
  OperationControlContract,
  RecordFieldContract,
  RecordResultActionContract,
  RecordResultContract,
} from "@dpeek/formless-presentation/contract";
import {
  displayField,
  enumControl,
  enumOptions,
  fieldError,
  recordDrafts,
  recordField,
  textControl,
  withFixtureFieldOccurrence,
} from "./fields/fixture-helpers.ts";
import { fieldScenarioGroups } from "./fields/fixtures.ts";
import { operationControlFixtures } from "./operation-controls.fixtures.ts";

export type RecordResultFixtureId =
  | "editable"
  | "editing-disabled"
  | "empty"
  | "read-only"
  | "unavailable";

export type RecordResultFixture = {
  id: RecordResultFixtureId;
  label: string;
  recordResult: RecordResultContract;
};

const taskId = "task-1";
const resultId = "tasks:detail";

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
const slugSchema = {
  label: "Slug",
  required: true,
  type: "text",
} satisfies Extract<
  FieldSchema,
  {
    type: "text";
  }
>;
const kindSchema = {
  default: "article",
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
const ownerEmailSchema = {
  format: "email",
  label: "Owner email",
  required: true,
  type: "text",
} satisfies Extract<
  FieldSchema,
  {
    type: "text";
  }
>;
export function createRecordResultFixtures(): RecordResultFixture[] {
  return [
    {
      id: "editable",
      label: "Editable",
      recordResult: editableRecordResultFixture(),
    },
    {
      id: "read-only",
      label: "Read-only",
      recordResult: readOnlyRecordResultFixture(),
    },
    {
      id: "editing-disabled",
      label: "Disabled",
      recordResult: editingDisabledRecordResultFixture(),
    },
    {
      id: "empty",
      label: "Empty",
      recordResult: stateRecordResultFixture("empty"),
    },
    {
      id: "unavailable",
      label: "Unavailable",
      recordResult: stateRecordResultFixture("unavailable"),
    },
  ];
}

export function recordResultUnionField(kind: "article" | "link") {
  return kind === "article" ? summaryField() : urlField();
}

export function completedTaskControl(): OperationControlContract {
  return {
    feedback: {
      detail: "Status changed from Open to Done.",
      id: "task-complete-committed",
      intent: "success",
      kind: "operationFeedbackEvent",
      status: "committed",
      title: "Task completed",
    },
    id: "task-complete",
    kind: "operationControl",
    status: {
      accessibilityLabel: "Task completed. Status changed from Open to Done.",
      detail: "Status changed from Open to Done.",
      id: "task-complete-status",
      intent: "success",
      kind: "compactStatus",
      label: "Task completed",
      status: "committed",
    },
    trigger: completeTaskTrigger(),
  };
}

export function taskStatusField(value: "done" | "open") {
  const group = fieldScenarioGroups.find((candidate) => candidate.kind === "state-machine-enum");
  const variant = group?.variants.find(
    ({ field }) =>
      field.surface === "record" &&
      field.stateMachineFacts?.currentValue === value &&
      field.stateMachineFacts.interaction.kind === "display",
  );

  if (!variant) {
    throw new Error(`Missing display-only ${value} state-machine record field scenario.`);
  }

  return withRecordIdentity(variant.field);
}

function editableRecordResultFixture(): RecordResultContract {
  return readyRecordResult({
    accessibilityLabel: "Task record",
    actions: {
      id: `${resultId}:actions`,
      kind: "actionGroup",
      primary: [operationAction(initialCompleteTaskControl(), "transition")],
      secondary: [operationAction(operationControlFixtures.deleteTask.initial, "delete")],
      secondaryAccessibilityLabel: "More actions for Prepare launch checklist",
    },
    editing: { enabled: true },
    fields: readyRecordFields("editable"),
    selectedRecordLabel: "Prepare launch checklist",
    warnings: [
      {
        id: `${resultId}:${taskId}:readiness`,
        items: [{ code: "owner-email", message: "Owner email is missing." }],
        kind: "recordResultWarning",
        title: "Readiness warnings",
      },
    ],
  });
}

function readOnlyRecordResultFixture(): RecordResultContract {
  return readyRecordResult({
    accessibilityLabel: "Read-only task record",
    actions: emptyActions("read-only"),
    editing: { enabled: true },
    fields: readyRecordFields("read-only"),
    selectedRecordLabel: "Prepare launch checklist",
    warnings: [],
  });
}

function editingDisabledRecordResultFixture(): RecordResultContract {
  return readyRecordResult({
    accessibilityLabel: "Owner-only task record",
    actions: emptyActions("editing-disabled"),
    editing: {
      disabledReason: "Editing requires an owner session.",
      enabled: false,
    },
    fields: readyRecordFields("editing-disabled"),
    selectedRecordLabel: "Prepare launch checklist",
    warnings: [],
  });
}

type ReadyRecordFieldState = "editable" | "editing-disabled" | "read-only";

function readyRecordFields(state: ReadyRecordFieldState): FieldContract[] {
  const fields = [
    editableTitleField(),
    readOnlySlugField(),
    kindField("article"),
    recordResultUnionField("article"),
    invalidOwnerEmailField(),
    ...specializedRecordFields(),
    taskStatusField("open"),
  ];

  if (state === "read-only") {
    return fields.map(readOnlyRecordField);
  }

  if (state === "editing-disabled") {
    return fields.map(editingDisabledRecordField);
  }

  return fields;
}

function readOnlyRecordField(field: FieldContract): FieldContract {
  if (field.mode === "display") {
    return field;
  }

  if (field.surface === "create" || field.surface === "operation") {
    throw new Error(`Expected an existing-record field, received ${field.surface}.`);
  }

  const suffix = field.formatting.suffix ?? field.suffix ?? recordFieldUnitSuffix(field);

  return displayField({
    access: { kind: "readOnly", writable: false },
    color: field.color,
    commit: field.commit,
    control: field.control,
    density: field.density,
    editor: field.editor,
    errors: field.errors,
    field: field.field,
    fieldName: field.fieldName,
    fieldRef: field.fieldRef,
    formatting: {
      ...field.formatting,
      displayValue: field.formatting.displayValue ?? String(field.value ?? ""),
      ...(suffix === undefined ? {} : { suffix }),
    },
    icon: field.icon,
    label: field.label,
    labelVisibility: field.labelVisibility,
    media: field.media
      ? {
          missingSelectedAsset: field.media.missingSelectedAsset,
          previewHref: field.media.previewHref,
          selectedAssetId: field.media.selectedAssetId,
        }
      : undefined,
    options: field.options,
    occurrence: recordResultFieldOccurrence(field.fieldName),
    presentation: field.presentation,
    recordId: field.recordId,
    reference:
      field.reference?.kind === "editor"
        ? { kind: "display", valueStatus: field.reference.valueStatus }
        : field.reference,
    stateMachine: field.stateMachine,
    stateMachineFacts: field.stateMachineFacts,
    suffix,
    surface: field.surface,
    value: field.value,
    visibleWhen: field.visibleWhen,
    writable: false,
  });
}

function recordFieldUnitSuffix(field: RecordFieldContract) {
  const unitValue = String(field.drafts.unitRecordValue ?? "");

  if (!field.valueUnit || unitValue === "") {
    return undefined;
  }

  return field.valueUnit.options.find((option) => option.value === unitValue)?.label ?? unitValue;
}

function editingDisabledRecordField(field: FieldContract): FieldContract {
  if (field.mode === "display" || field.access.kind !== "editable") {
    return field;
  }

  return {
    ...field,
    access: {
      canPatch: false,
      disabledReason: "Editing requires an owner session.",
      kind: "disabled",
      writable: true,
    },
    pending: undefined,
  };
}

function stateRecordResultFixture(state: "empty" | "unavailable"): RecordResultContract {
  return {
    accessibilityLabel: state === "empty" ? "Empty task record" : "Unavailable task record",
    actions: emptyActions(state),
    availability:
      state === "empty"
        ? { state: "empty" }
        : { message: "Task record is unavailable.", state: "unavailable" },
    density: "default",
    editing: { enabled: true },
    ...(state === "empty"
      ? {
          emptyState: {
            description: "Change the current query to select a task.",
            id: `${resultId}:empty`,
            kind: "recordResultEmptyState" as const,
            title: "No task record found.",
          },
        }
      : {}),
    fields: [],
    id: `${resultId}:${state}`,
    kind: "recordResult",
    warnings: [],
  };
}

function readyRecordResult({
  accessibilityLabel,
  actions,
  editing,
  fields,
  selectedRecordLabel,
  warnings,
}: Pick<RecordResultContract, "accessibilityLabel" | "actions" | "editing" | "warnings"> & {
  fields: readonly FieldContract[];
  selectedRecordLabel: string;
}): RecordResultContract {
  return {
    accessibilityLabel,
    actions,
    availability: { state: "ready" },
    density: "default",
    editing,
    fields,
    id: resultId,
    kind: "recordResult",
    selectedRecord: {
      accessibilityLabel: selectedRecordLabel,
      id: taskId,
      kind: "recordResultRecord",
    },
    warnings,
  };
}

function editableTitleField() {
  return recordField({
    commit: "field-commit",
    control: titleControl,
    drafts: recordDrafts({ recordValue: "Prepare launch checklist" }),
    editor: titleControl.editor,
    field: titleSchema,
    fieldName: "title",
    labelVisibility: "visible",
    occurrence: recordResultFieldOccurrence("title"),
    pending: { isPending: true, label: "Saving task" },
    recordId: taskId,
    rendererKind: "text",
  });
}

function readOnlySlugField() {
  const control = textControl(slugSchema, { editor: "slug" });

  return displayField({
    control,
    editor: control.editor,
    field: slugSchema,
    fieldName: "slug",
    formatting: { displayValue: "prepare-launch-checklist" },
    labelVisibility: "visible",
    occurrence: recordResultFieldOccurrence("slug"),
    recordId: taskId,
    surface: "record",
    value: "prepare-launch-checklist",
  });
}

function kindField(kind: "article" | "link") {
  const control = enumControl(kindSchema);

  return recordField({
    commit: "field-commit",
    control,
    drafts: recordDrafts({ recordValue: kind }),
    editor: control.editor,
    field: kindSchema,
    fieldName: "kind",
    labelVisibility: "visible",
    options: { enumOptions: enumOptions(kindSchema) },
    occurrence: recordResultFieldOccurrence("kind"),
    recordId: taskId,
    rendererKind: "enum",
  });
}

function summaryField() {
  const control = textControl(summarySchema, { editor: "textarea" });

  return recordField({
    commit: "field-commit",
    control,
    drafts: recordDrafts({ recordValue: "Coordinate launch owners and final checks." }),
    editor: control.editor,
    field: summarySchema,
    fieldName: "summary",
    labelVisibility: "visible",
    occurrence: recordResultFieldOccurrence("summary"),
    recordId: taskId,
    rendererKind: "textarea",
    visibleWhen: { field: "kind", values: ["article"] },
  });
}

function urlField() {
  const control = textControl(urlSchema, { editor: "href" });

  return recordField({
    commit: "field-commit",
    control,
    drafts: recordDrafts({ recordValue: "https://example.com/releases/draft" }),
    editor: control.editor,
    field: urlSchema,
    fieldName: "url",
    labelVisibility: "visible",
    occurrence: recordResultFieldOccurrence("url"),
    recordId: taskId,
    rendererKind: "text",
    visibleWhen: { field: "kind", values: ["link"] },
  });
}

function invalidOwnerEmailField() {
  const control = textControl(ownerEmailSchema);

  return recordField({
    commit: "field-commit",
    control,
    drafts: recordDrafts({ recordValue: "" }),
    editor: control.editor,
    errors: [fieldError("ownerEmail", "Owner email is required.")],
    field: ownerEmailSchema,
    fieldName: "ownerEmail",
    labelVisibility: "visible",
    occurrence: recordResultFieldOccurrence("ownerEmail"),
    recordId: taskId,
    rendererKind: "text",
  });
}

function specializedRecordFields(): FieldContract[] {
  return [
    scenarioRecordField("source-icon", "icon"),
    scenarioRecordField("media", "media"),
    scenarioRecordField("color", "color"),
    scenarioRecordField("number", "value-unit"),
    scenarioRecordField("date", "quiet-date"),
    scenarioRecordField("markdown", "markdown"),
  ];
}

function scenarioRecordField(
  kind: (typeof fieldScenarioGroups)[number]["kind"],
  rendererKind: "color" | "icon" | "markdown" | "media" | "quiet-date" | "value-unit",
) {
  const group = fieldScenarioGroups.find((candidate) => candidate.kind === kind);
  const variant = group?.variants.find(
    ({ field }) =>
      field.surface === "record" &&
      field.mode === "editor" &&
      "rendererKind" in field &&
      field.rendererKind === rendererKind,
  );

  if (!variant) {
    throw new Error(`Missing ${kind} ${rendererKind} record field scenario.`);
  }

  return withRecordIdentity(variant.field);
}

function withRecordIdentity(field: FieldContract): FieldContract {
  return withFixtureFieldOccurrence(
    {
      ...field,
      labelVisibility: "visible",
      recordId: taskId,
    },
    recordResultFieldOccurrence(field.fieldName),
  );
}

function recordResultFieldOccurrence(fieldName: string) {
  return { ownerId: `${resultId}:${taskId}`, placementId: fieldName };
}

function initialCompleteTaskControl(): OperationControlContract {
  return {
    id: "task-complete",
    kind: "operationControl",
    status: {
      accessibilityLabel: "Complete task available. Status is Open.",
      detail: "Status is Open.",
      id: "task-complete-status",
      intent: "neutral",
      kind: "compactStatus",
      label: "Complete task available",
      status: "idle",
    },
    trigger: completeTaskTrigger(),
  };
}

function completeTaskTrigger(): OperationControlContract["trigger"] {
  return {
    accessibilityLabel: "Complete task",
    content: { icon: "confirm", kind: "iconAndLabel", label: "Complete" },
    density: "default",
    id: "task-complete-trigger",
    intent: {
      controlId: "task-complete",
      invocationSource: "button",
      type: "operationInvoke",
    },
    kind: "button",
    prominence: "primary",
    type: "button",
  };
}

function operationAction(
  control: OperationControlContract,
  role: RecordResultActionContract["role"],
): RecordResultActionContract {
  return { control, kind: "operationAction", role };
}

function emptyActions(id: string): RecordResultContract["actions"] {
  return {
    id: `${resultId}:${id}:actions`,
    kind: "actionGroup",
    primary: [],
    secondary: [],
    secondaryAccessibilityLabel: "More actions for task record",
  };
}
