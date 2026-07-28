import {
  composeScenarioAxis,
  projectScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type {
  FieldScenarioGroup,
  FieldScenarioProjectionContext,
} from "../field-scenario-model.ts";
import type { FieldContract, FieldSurface } from "@dpeek/formless-presentation/contract";
import {
  createField,
  displayField,
  enumControl,
  enumOptions,
  enumValuePresentation,
  fieldError,
  operationField,
  recordDrafts,
  recordField,
} from "./fixture-helpers.ts";

const priorityMarkerIconSource = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="M12 4.75v14.5" />',
  '<path d="m6.75 10 5.25-5.25L17.25 10" />',
  "</svg>",
].join("");

const closeIconSource = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="m6.75 6.75 10.5 10.5" />',
  '<path d="m17.25 6.75-10.5 10.5" />',
  "</svg>",
].join("");

const confirmIconSource = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="m5 12 5 5L20 7" />',
  "</svg>",
].join("");

const statusField = {
  type: "enum",
  required: true,
  label: "Status",
  values: [
    {
      key: "open",
      label: "Open",
      presentation: { icon: "priority-marker", color: "priority.normal" },
    },
    { key: "waiting", label: "Waiting", presentation: { color: "warning" } },
    { key: "blocked", label: "Blocked", presentation: { icon: "close", color: "danger" } },
    { key: "done", label: "Done", presentation: { icon: "confirm", color: "success" } },
    {
      key: "legacyFallback",
      label: "Legacy fallback",
      presentation: { icon: "missing-icon", color: "priority.unknown" },
    },
  ],
  default: "open",
} as const;
const optionalStatusField = {
  type: "enum",
  required: false,
  label: "Status",
  values: statusField.values,
} as const;

const topicField = {
  type: "enum",
  required: true,
  label: "Topic",
  values: [
    { key: "sales", label: "Sales" },
    { key: "support", label: "Support" },
  ],
} as const;
const optionalTopicField = { ...topicField, required: false } as const;
const statusOptions = enumOptions(statusField, {
  blocked: { iconSource: closeIconSource },
  done: { iconSource: confirmIconSource },
  open: { iconSource: priorityMarkerIconSource },
});
const optionalStatusOptions = enumOptions(optionalStatusField, {
  blocked: { iconSource: closeIconSource },
  done: { iconSource: confirmIconSource },
  open: { iconSource: priorityMarkerIconSource },
});

const enumRequirednessAxis = composeScenarioAxis("requiredness", "Requiredness", [
  scenarioOption("required", "Required"),
  scenarioOption("optional", "Optional"),
]);

const enumValueAxis = composeScenarioAxis("value", "Value", [
  scenarioOption("known", "Known"),
  scenarioOption("unset", "Unset"),
  scenarioOption("undeclared", "Undeclared"),
]);

const enumCreateValueAxis = composeScenarioAxis("value", "Value", [
  scenarioOption("known", "Known"),
  scenarioOption("unset", "Unset"),
]);

const enumPresentationAxis = composeScenarioAxis("presentation", "Presentation", [
  scenarioOption("plain", "Plain"),
  scenarioOption("rich", "Rich"),
  scenarioOption("icon-only", "Icon Only"),
]);

const enumTriggerAxis = composeScenarioAxis("trigger", "Trigger", [
  scenarioOption("icon", "Icon"),
  scenarioOption("label", "Label"),
  scenarioOption("both", "Both"),
]);

const enumListAxis = composeScenarioAxis("list", "List", [
  scenarioOption("icon", "Icon"),
  scenarioOption("label", "Label"),
  scenarioOption("both", "Both"),
]);

const enumModeAxis = composeScenarioAxis("mode", "Mode", [
  scenarioOption("editor", "Editor"),
  scenarioOption("display", "Display"),
]);

export const enumScenarioGroups = [
  projectScenarioGroup({
    id: "enum-create",
    kind: "enum",
    axes: [enumRequirednessAxis, enumCreateValueAxis],
    projectField: projectCreateEnumField,
  }),
  projectScenarioGroup({
    id: "enum-record",
    kind: "enum",
    axes: [
      enumModeAxis,
      enumRequirednessAxis,
      enumValueAxis,
      enumPresentationAxis,
      enumTriggerAxis,
      enumListAxis,
    ],
    include: enumPresentationCombinationIsValid,
    projectField: projectRecordEnumField,
  }),
  projectScenarioGroup({
    id: "enum-table-cell",
    kind: "enum",
    axes: [
      enumModeAxis,
      enumRequirednessAxis,
      enumValueAxis,
      enumPresentationAxis,
      enumTriggerAxis,
      enumListAxis,
    ],
    include: enumPresentationCombinationIsValid,
    projectField: projectTableCellEnumField,
  }),
  projectScenarioGroup({
    id: "enum-detail",
    kind: "enum",
    axes: [enumModeAxis, enumRequirednessAxis, enumValueAxis, enumPresentationAxis],
    projectField: projectDetailEnumField,
  }),
  projectScenarioGroup({
    id: "enum-operation",
    kind: "enum",
    axes: [enumRequirednessAxis, enumValueAxis],
    projectField: projectOperationEnumField,
  }),
] satisfies readonly FieldScenarioGroup[];

function projectCreateEnumField({ facets }: FieldScenarioProjectionContext) {
  return createEnumField({
    required: facets.requiredness === "required",
    value: facets.value === "known" ? "open" : "",
  });
}

function enumPresentationCombinationIsValid({ facets }: FieldScenarioProjectionContext) {
  return facets.presentation !== "plain" || (facets.trigger === "label" && facets.list === "label");
}

function projectRecordEnumField({ facets }: FieldScenarioProjectionContext) {
  const presentation = enumPresentation(facets.presentation, facets.trigger, facets.list);
  const required = facets.requiredness === "required";
  const value = enumRecordValue(facets.value, facets.trigger, facets.list);
  const displayValue =
    facets.mode === "display" && facets.presentation === "icon-only" && facets.value === "known"
      ? "legacyFallback"
      : value;

  return facets.mode === "display"
    ? displayEnumField({ presentation, required, surface: "record", value: displayValue })
    : recordEnumField({ presentation, required, value });
}

function projectTableCellEnumField({ facets }: FieldScenarioProjectionContext) {
  const presentation = enumPresentation(facets.presentation, facets.trigger, facets.list);
  const required = facets.requiredness === "required";
  const value = enumRecordValue(facets.value, facets.trigger, facets.list);

  return facets.mode === "display"
    ? displayEnumField({ presentation, required, surface: "table-cell", value })
    : recordEnumField({
        presentation,
        required,
        surface: "table-cell",
        value,
      });
}

function projectDetailEnumField({ facets }: FieldScenarioProjectionContext) {
  const presentation = enumPresentation(facets.presentation);
  const required = facets.requiredness === "required";
  const value =
    facets.value === "unset" ? "" : facets.value === "undeclared" ? "paused" : "blocked";

  return facets.mode === "editor"
    ? recordEnumField({ presentation, required, surface: "detail", value })
    : displayEnumField({ presentation, required, surface: "detail", value });
}

function projectOperationEnumField({ facets }: FieldScenarioProjectionContext) {
  const value =
    facets.value === "known" ? "sales" : facets.value === "undeclared" ? "enterprise" : "";
  const required = facets.requiredness === "required";
  const errors =
    required && facets.value === "unset"
      ? [fieldError("topic", 'Field "topic" cannot be empty.')]
      : facets.value === "undeclared"
        ? [fieldError("topic", 'Field "topic" must be a known enum value.', "enterprise")]
        : undefined;

  return operationEnumField({ errors, required, value });
}

function enumPresentation(
  presentation: string | undefined,
  trigger?: string,
  list?: string,
): FieldContract["presentation"] {
  if (presentation === "icon-only") {
    return {
      mode: "iconOnly",
      trigger: (trigger ?? "icon") as "icon" | "label" | "both",
      list: (list ?? "both") as "icon" | "label" | "both",
    };
  }

  if (presentation === "rich") {
    return {
      trigger: trigger as "icon" | "label" | "both",
      list: list as "icon" | "label" | "both",
    };
  }

  return undefined;
}

function enumRecordValue(
  value: string | undefined,
  trigger: string | undefined,
  list: string | undefined,
) {
  if (value === "unset") {
    return "";
  }

  if (value === "undeclared") {
    return "paused";
  }

  if (trigger === "label" && list === "icon") {
    return "legacyFallback";
  }

  if (trigger === "both" && list === "label") {
    return "done";
  }

  return trigger === "label" && list === "label" ? "open" : "blocked";
}

function createEnumField({ required, value }: { required: boolean; value: string }) {
  const field = required ? statusField : optionalStatusField;

  return createField({
    fieldName: "status",
    field,
    editor: "enum",
    control: enumControl(field),
    draftInput: { kind: "value", value },
    labelVisibility: "visible",
    occurrence: {
      ownerId: `create-status-${required ? "required" : "optional"}-${value || "unset"}`,
      placementId: "status",
    },
    options: { enumOptions: required ? statusOptions : optionalStatusOptions },
    recordId: `create-status-${required ? "required" : "optional"}-${value || "unset"}`,
    value,
  });
}

function recordEnumField({
  presentation,
  required = true,
  surface = "record",
  value,
}: {
  presentation?: FieldContract["presentation"];
  required?: boolean;
  surface?: Extract<FieldSurface, "detail" | "record" | "table-cell">;
  value: string;
}) {
  const field = required ? statusField : optionalStatusField;
  const options = required ? statusOptions : optionalStatusOptions;

  return recordField({
    fieldName: "status",
    field,
    editor: "enum",
    control: enumControl(field),
    commit: "immediate",
    density: surface === "table-cell" ? "compact" : "default",
    drafts: recordDrafts({
      draft: value,
      draftInput: { kind: "input", value },
      recordValue: value,
    }),
    formatting: {
      displayValue: displayOption(field, value),
      enumValuePresentation: value === "" ? undefined : enumValuePresentation(field, value),
    },
    labelVisibility: surface === "detail" ? "visible" : "hidden",
    options: { enumOptions: options },
    occurrence: {
      ownerId: `${surface}-status-${value || "unset"}-${presentation?.trigger ?? "plain"}-${presentation?.list ?? "label"}`,
      placementId: "status",
    },
    presentation,
    recordId: `${surface}-status-${value || "unset"}-${presentation?.trigger ?? "plain"}-${presentation?.list ?? "label"}`,
    rendererKind: presentation === undefined ? "enum" : "enum-icon",
    surface,
  });
}

function displayEnumField({
  presentation,
  required = true,
  surface,
  value,
}: {
  presentation?: FieldContract["presentation"];
  required?: boolean;
  surface: Extract<FieldSurface, "detail" | "record" | "table-cell">;
  value: string;
}) {
  const field = required ? statusField : optionalStatusField;
  const options = required ? statusOptions : optionalStatusOptions;

  return displayField({
    fieldName: "status",
    field,
    editor: "enum",
    control: enumControl(field),
    formatting: {
      displayValue: displayOption(field, value),
      enumValuePresentation: value === "" ? undefined : enumValuePresentation(field, value),
    },
    density: surface === "table-cell" ? "compact" : "default",
    labelVisibility: surface === "detail" ? "visible" : "hidden",
    options: { enumOptions: options },
    occurrence: {
      ownerId: `${surface}-status-${value || "unset"}-${presentation?.mode ?? "label"}`,
      placementId: "status",
    },
    presentation,
    recordId: `${surface}-status-${value || "unset"}-${presentation?.mode ?? "label"}`,
    surface,
    value,
  });
}

function operationEnumField({
  errors,
  required,
  value,
}: {
  errors?: FieldContract["errors"];
  required: boolean;
  value: string;
}) {
  const field = required ? topicField : optionalTopicField;
  const options = enumOptions(field);

  return operationField({
    fieldName: "topic",
    inputName: "topic",
    field,
    editor: "enum",
    control: enumControl(field),
    draftInput: { kind: "input", value },
    errors,
    labelVisibility: "visible",
    occurrence: {
      ownerId: `operation-topic-${required ? "required" : "optional"}-${value || "unset"}`,
      placementId: "topic",
    },
    options: { enumOptions: options },
    recordId: `operation-topic-${required ? "required" : "optional"}-${value || "unset"}`,
    value: value === "" ? undefined : value,
  });
}
function displayOption(field: typeof statusField | typeof optionalStatusField, value: string) {
  return field.values.find((definition) => definition.key === value)?.label ?? value;
}
