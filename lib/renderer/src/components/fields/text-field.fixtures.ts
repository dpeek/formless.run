import {
  composeScenarioAxis,
  projectScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type {
  FieldKindKey,
  FieldScenarioGroup,
  FieldScenarioProjectionContext,
} from "../field-scenario-model.ts";
import type { FieldSurface, RecordFieldRendererKind } from "@dpeek/formless-presentation/contract";
import type { FieldSchema } from "@dpeek/formless-schema";
import {
  createField,
  displayField,
  draftInput,
  fieldError,
  operationField,
  recordDrafts,
  recordField,
  textControl,
} from "./fixture-helpers.ts";

const requiredTextField = { type: "text", required: true, label: "Task" } as const;
const optionalTextField = { ...requiredTextField, required: false } as const;
const requiredLongTextField = {
  type: "text",
  required: true,
  label: "Summary",
  format: "longText",
} as const;
const optionalLongTextField = { ...requiredLongTextField, required: false } as const;
const requiredMarkdownField = {
  type: "text",
  required: true,
  label: "Brief",
  format: "markdown",
} as const;
const optionalMarkdownField = { ...requiredMarkdownField, required: false } as const;

const requirednessAxis = composeScenarioAxis("requiredness", "Requiredness", [
  scenarioOption("required", "Required"),
  scenarioOption("optional", "Optional"),
]);
const valueAxis = composeScenarioAxis("value", "Value", [
  scenarioOption("known", "Known"),
  scenarioOption("unset", "Unset"),
]);
const modeAxis = composeScenarioAxis("mode", "Mode", [
  scenarioOption("editor", "Editor"),
  scenarioOption("display", "Display"),
]);

const textRecordPresentationAxis = composeScenarioAxis("presentation", "Presentation", [
  scenarioOption("default", "Default"),
  scenarioOption("heading", "Heading"),
  scenarioOption("suffix", "Suffix"),
]);
const textRuntimeAxis = composeScenarioAxis("runtime", "Runtime", [
  scenarioOption("ready", "Ready"),
  scenarioOption("pending", "Pending"),
]);
const textOperationFormatAxis = composeScenarioAxis("format", "Format", [
  scenarioOption("plain", "Plain"),
  scenarioOption("email", "Email"),
  scenarioOption("phone", "Phone"),
]);
const textOperationValueAxis = composeScenarioAxis("value", "Value", [
  scenarioOption("known", "Known"),
  scenarioOption("unset", "Unset"),
  scenarioOption("invalid", "Invalid"),
]);

export const textScenarioGroups = [
  scalarTextCreateGroup("text"),
  projectScenarioGroup({
    id: "text-record",
    kind: "text",
    axes: [modeAxis, requirednessAxis, valueAxis, textRecordPresentationAxis, textRuntimeAxis],
    include: textRecordCombinationIsValid,
    projectField: projectTextRecordField,
  }),
  scalarTextExistingGroup("text", "table-cell"),
  scalarTextExistingGroup("text", "detail"),
  scalarTextOperationGroup("text"),
  scalarTextCreateGroup("long-text"),
  scalarTextExistingGroup("long-text", "record"),
  scalarTextExistingGroup("long-text", "table-cell"),
  scalarTextExistingGroup("long-text", "detail"),
  scalarTextOperationGroup("long-text"),
  scalarTextCreateGroup("markdown"),
  scalarTextExistingGroup("markdown", "record"),
  scalarTextExistingGroup("markdown", "table-cell"),
  scalarTextExistingGroup("markdown", "detail"),
] satisfies readonly FieldScenarioGroup[];

function scalarTextCreateGroup(kind: Extract<FieldKindKey, "long-text" | "markdown" | "text">) {
  return projectScenarioGroup({
    id: `${kind}-create`,
    kind,
    axes: [requirednessAxis, valueAxis],
    projectField: (context) => projectCreateTextField(kind, context),
  });
}

function scalarTextExistingGroup(
  kind: Extract<FieldKindKey, "long-text" | "markdown" | "text">,
  surface: Extract<FieldSurface, "detail" | "record" | "table-cell">,
) {
  return projectScenarioGroup({
    id: `${kind}-${surface}`,
    kind,
    axes: [modeAxis, requirednessAxis, valueAxis],
    projectField: (context) => projectExistingTextField(kind, surface, context),
  });
}

function scalarTextOperationGroup(kind: Extract<FieldKindKey, "long-text" | "text">) {
  return projectScenarioGroup({
    id: `${kind}-operation`,
    kind,
    axes:
      kind === "text"
        ? [requirednessAxis, textOperationFormatAxis, textOperationValueAxis]
        : [requirednessAxis, valueAxis],
    include: ({ facets }) =>
      kind !== "text" || facets.format !== "plain" || facets.value !== "invalid",
    projectField: (context) => projectOperationTextField(kind, context),
  });
}

function textRecordCombinationIsValid({ facets }: FieldScenarioProjectionContext) {
  if (facets.mode === "display") {
    return (
      facets.runtime === "ready" &&
      (facets.presentation === "default" ||
        (facets.presentation === "suffix" && facets.value === "known"))
    );
  }

  if (facets.presentation === "suffix") {
    return false;
  }

  return (
    facets.runtime === "ready" ||
    (facets.presentation === "default" &&
      facets.requiredness === "optional" &&
      facets.value === "known")
  );
}

function projectTextRecordField(context: FieldScenarioProjectionContext) {
  if (context.facets.presentation === "suffix") {
    return projectExistingTextField("text", "record", context, "suffix");
  }

  const field = projectExistingTextField(
    "text",
    "record",
    context,
    context.facets.presentation === "heading" ? "heading" : "default",
  );

  return context.facets.runtime === "pending"
    ? { ...field, pending: { isPending: true, label: "Saving" } }
    : field;
}

function projectCreateTextField(
  kind: Extract<FieldKindKey, "long-text" | "markdown" | "text">,
  { facets }: FieldScenarioProjectionContext,
) {
  const required = facets.requiredness === "required";
  const field = textField(kind, required);
  const value = facets.value === "known" ? textValue(kind) : "";
  const control = textFieldControl(kind, field, "create");

  return createField({
    fieldName: textFieldName(kind),
    field,
    editor: control.editor,
    control,
    draftInput: draftInput(value),
    labelVisibility: "visible",
    occurrence: {
      ownerId: `${kind}-create-${facets.requiredness}-${facets.value}`,
      placementId: textFieldName(kind),
    },
    recordId: `${kind}-create-${facets.requiredness}-${facets.value}`,
    value,
  });
}

function projectOperationTextField(
  kind: Extract<FieldKindKey, "long-text" | "text">,
  { facets }: FieldScenarioProjectionContext,
) {
  const required = facets.requiredness === "required";
  const format = kind === "text" ? textOperationFormat(facets.format) : "plain";
  const field = kind === "text" ? operationTextField(required, format) : textField(kind, required);
  const value = operationTextValue(kind, format, facets.value);
  const control = textFieldControl(kind, field, "operation");
  const fieldName = kind === "text" ? operationTextFieldName(format) : textFieldName(kind);
  const errors =
    kind === "long-text" && required && facets.value === "unset"
      ? [fieldError(fieldName, `Field "${fieldName}" cannot be empty.`)]
      : undefined;

  return operationField({
    fieldName,
    inputName: fieldName,
    field,
    editor: control.editor,
    control,
    draftInput: draftInput(value),
    errors,
    input: {
      control: kind === "long-text" ? "longText" : "text",
      label: control.label,
      name: fieldName,
      required,
      ...(format === "plain" ? {} : { format }),
    },
    labelVisibility: "visible",
    occurrence: {
      ownerId: `${kind}-operation-${facets.requiredness}-${format}-${facets.value}`,
      placementId: fieldName,
    },
    recordId: `${kind}-operation-${facets.requiredness}-${format}-${facets.value}`,
    value: value || undefined,
  });
}

function textOperationFormat(value: string | undefined): "email" | "phone" | "plain" {
  return value === "email" || value === "phone" ? value : "plain";
}

function operationTextField(
  required: boolean,
  format: "email" | "phone" | "plain",
): Extract<
  FieldSchema,
  {
    type: "text";
  }
> {
  return {
    type: "text",
    required,
    label: format === "email" ? "Email" : format === "phone" ? "Phone" : "Task",
    ...(format === "plain" ? {} : { format }),
  };
}

function operationTextFieldName(format: "email" | "phone" | "plain") {
  return format === "email" ? "email" : format === "phone" ? "phone" : "title";
}

function operationTextValue(
  kind: Extract<FieldKindKey, "long-text" | "text">,
  format: "email" | "phone" | "plain",
  valueFacet: string | undefined,
) {
  if (valueFacet === "unset") {
    return "";
  }

  if (valueFacet === "invalid") {
    return format === "email" ? "not-an-email" : "not-a-phone";
  }

  if (format === "email") {
    return "dana@example.com";
  }

  if (format === "phone") {
    return "+61 2 5550 1234";
  }

  return textValue(kind);
}

function projectExistingTextField(
  kind: Extract<FieldKindKey, "long-text" | "markdown" | "text">,
  surface: Extract<FieldSurface, "detail" | "record" | "table-cell">,
  { facets }: FieldScenarioProjectionContext,
  presentation: "default" | "heading" | "suffix" = "default",
) {
  const required = facets.requiredness === "required";
  const field = textField(kind, required);
  const value = facets.value === "known" ? textValue(kind) : "";
  const displayValue = value;
  const labelVisibility = surface === "detail" ? ("visible" as const) : ("hidden" as const);
  const density = surface === "table-cell" ? ("compact" as const) : ("default" as const);
  const control = textFieldControl(kind, field, facets.mode === "display" ? "display" : surface);
  const common = {
    fieldName: textFieldName(kind),
    field,
    editor: control.editor,
    control,
    labelVisibility,
    occurrence: {
      ownerId: `${kind}-${surface}-${facets.mode}-${facets.requiredness}-${facets.value}-${presentation}`,
      placementId: textFieldName(kind),
    },
    recordId: `${kind}-${surface}-${facets.mode}-${facets.requiredness}-${facets.value}-${presentation}`,
    surface,
  };

  if (facets.mode === "display") {
    return displayField({
      ...common,
      density,
      formatting: { displayValue, ...(presentation === "suffix" ? { suffix: "tasks" } : {}) },
      suffix: presentation === "suffix" ? "tasks" : undefined,
      value: value || undefined,
    });
  }

  return recordField({
    ...common,
    commit: "field-commit",
    density,
    drafts: recordDrafts({ recordValue: value || undefined }),
    formatting: { displayValue },
    presentationMode: presentation === "heading" ? "heading" : "default",
    rendererKind: textRendererKind(kind, surface, presentation),
  });
}

function textField(
  kind: Extract<FieldKindKey, "long-text" | "markdown" | "text">,
  required: boolean,
) {
  if (kind === "long-text") {
    return required ? requiredLongTextField : optionalLongTextField;
  }

  if (kind === "markdown") {
    return required ? requiredMarkdownField : optionalMarkdownField;
  }
  return required ? requiredTextField : optionalTextField;
}
function textFieldControl(
  kind: Extract<FieldKindKey, "long-text" | "markdown" | "text">,
  field: Extract<
    FieldSchema,
    {
      type: "text";
    }
  >,
  surface: FieldSurface | "display",
) {
  if (kind === "long-text") {
    return textControl(field, { editor: "textarea", controlKind: "textarea" });
  }

  if (kind === "markdown") {
    return textControl(field, {
      editor: "markdown",
      controlKind: surface === "table-cell" ? "textarea" : "markdown",
    });
  }

  return textControl(field, { editor: "text", controlKind: "text" });
}

function textRendererKind(
  kind: Extract<FieldKindKey, "long-text" | "markdown" | "text">,
  surface: Extract<FieldSurface, "detail" | "record" | "table-cell">,
  presentation: "default" | "heading" | "suffix",
): RecordFieldRendererKind {
  if (kind === "long-text" || (kind === "markdown" && surface === "table-cell")) {
    return "textarea";
  }

  if (kind === "markdown") {
    return "markdown";
  }

  return presentation === "heading" ? "autosize-text" : "text";
}

function textFieldName(kind: Extract<FieldKindKey, "long-text" | "markdown" | "text">) {
  return kind === "long-text" ? "summary" : kind === "markdown" ? "brief" : "title";
}

function textValue(kind: Extract<FieldKindKey, "long-text" | "markdown" | "text">) {
  if (kind === "long-text") {
    return "Block placement review before publish.";
  }

  if (kind === "markdown") {
    return "## Launch scope\n\n- Confirm owner\n- Publish public page";
  }

  return "Prepare launch checklist";
}
