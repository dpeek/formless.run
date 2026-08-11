import {
  composeScenarioAxis,
  projectScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type {
  FieldScenarioGroup,
  FieldScenarioProjectionContext,
} from "../field-scenario-model.ts";
import type { FieldSurface } from "@dpeek/formless-presentation/contract";
import {
  booleanControl,
  createField,
  displayField,
  draftInput,
  operationField,
  recordDrafts,
  recordField,
} from "./fixture-helpers.ts";

const completedField = {
  type: "boolean",
  required: true,
  label: "Completed",
  default: false,
} as const;
const optionalCompletedField = { ...completedField, required: false } as const;

const requirednessAxis = composeScenarioAxis("requiredness", "Requiredness", [
  scenarioOption("required", "Required"),
  scenarioOption("optional", "Optional"),
]);
const editorValueAxis = composeScenarioAxis("value", "Value", [
  scenarioOption("true", "True"),
  scenarioOption("false", "False"),
]);
const existingValueAxis = composeScenarioAxis("value", "Value", [
  ...editorValueAxis.options,
  scenarioOption("unset", "Unset"),
]);
const modeAxis = composeScenarioAxis("mode", "Mode", [
  scenarioOption("editor", "Editor"),
  scenarioOption("display", "Display"),
]);
export const booleanScenarioGroups = [
  projectScenarioGroup({
    id: "boolean-create",
    kind: "boolean",
    axes: [requirednessAxis, editorValueAxis],
    projectField: projectCreateBooleanField,
  }),
  existingBooleanGroup("record"),
  existingBooleanGroup("detail"),
  projectScenarioGroup({
    id: "boolean-operation",
    kind: "boolean",
    axes: [requirednessAxis, editorValueAxis],
    projectField: projectOperationBooleanField,
  }),
] satisfies readonly FieldScenarioGroup[];

function existingBooleanGroup(surface: Extract<FieldSurface, "detail" | "record">) {
  return projectScenarioGroup({
    id: `boolean-${surface}`,
    kind: "boolean",
    axes: [modeAxis, requirednessAxis, existingValueAxis],
    include: ({ facets }) => facets.mode === "display" || facets.value !== "unset",
    projectField: (context) => projectExistingBooleanField(surface, context),
  });
}

function projectCreateBooleanField({ facets }: FieldScenarioProjectionContext) {
  const required = facets.requiredness === "required";
  const field = required ? completedField : optionalCompletedField;
  const value = facets.value === "true";

  return createField({
    fieldName: "completed",
    field,
    editor: "boolean",
    control: booleanControl(field),
    draftInput: draftInput(value),
    labelVisibility: "visible",
    occurrence: {
      ownerId: `boolean-create-${facets.requiredness}-${facets.value}`,
      placementId: "completed",
    },
    recordId: `boolean-create-${facets.requiredness}-${facets.value}`,
    value,
  });
}

function projectOperationBooleanField({ facets }: FieldScenarioProjectionContext) {
  const required = facets.requiredness === "required";
  const field = required ? completedField : optionalCompletedField;
  const value = facets.value === "true";

  return operationField({
    fieldName: "completed",
    inputName: "completed",
    field,
    editor: "boolean",
    control: booleanControl(field),
    draftInput: draftInput(value),
    labelVisibility: "visible",
    occurrence: {
      ownerId: `boolean-operation-${facets.requiredness}-${facets.value}`,
      placementId: "completed",
    },
    recordId: `boolean-operation-${facets.requiredness}-${facets.value}`,
    value,
  });
}

function projectExistingBooleanField(
  surface: Extract<FieldSurface, "detail" | "record">,
  { facets }: FieldScenarioProjectionContext,
) {
  const required = facets.requiredness === "required";
  const field = required ? completedField : optionalCompletedField;
  const value = facets.value === "unset" ? undefined : facets.value === "true";
  const common = {
    fieldName: "completed",
    field,
    editor: "boolean" as const,
    control: booleanControl(field),
    labelVisibility: surface === "detail" ? ("visible" as const) : ("hidden" as const),
    occurrence: {
      ownerId: `boolean-${surface}-${facets.mode}-${facets.requiredness}-${facets.value}`,
      placementId: "completed",
    },
    recordId: `boolean-${surface}-${facets.mode}-${facets.requiredness}-${facets.value}`,
    surface,
  };

  return facets.mode === "display"
    ? displayField({
        ...common,
        density: "default",
        formatting: { displayValue: value === undefined ? "" : value ? "Yes" : "No" },
        value,
      })
    : recordField({
        ...common,
        commit: "immediate",
        density: "default",
        drafts: recordDrafts({ recordValue: value }),
        formatting: { displayValue: value ? "Yes" : "No" },
        rendererKind: "checkbox",
      });
}
