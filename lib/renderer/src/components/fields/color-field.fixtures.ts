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
  createField,
  displayField,
  draftInput,
  recordDrafts,
  recordField,
  textControl,
} from "./fixture-helpers.ts";

const accentField = {
  type: "text",
  required: true,
  label: "Accent",
  format: "color",
} as const;
const optionalAccentField = { ...accentField, required: false } as const;

const requirednessAxis = composeScenarioAxis("requiredness", "Requiredness", [
  scenarioOption("required", "Required"),
  scenarioOption("optional", "Optional"),
]);
const createValueAxis = composeScenarioAxis("value", "Value", [
  scenarioOption("valid", "Valid Hex"),
  scenarioOption("unset", "Unset"),
  scenarioOption("invalid", "Invalid Text"),
]);
const valueAxis = composeScenarioAxis("value", "Value", [
  scenarioOption("valid", "Valid Hex"),
  scenarioOption("unset", "Unset"),
  scenarioOption("invalid", "Invalid Text"),
]);
const modeAxis = composeScenarioAxis("mode", "Mode", [
  scenarioOption("editor", "Editor"),
  scenarioOption("display", "Display"),
]);

export const colorScenarioGroups = [
  projectScenarioGroup({
    id: "color-create",
    kind: "color",
    axes: [requirednessAxis, createValueAxis],
    projectField: projectCreateColorField,
  }),
  existingColorGroup("record"),
  existingColorGroup("detail"),
] satisfies readonly FieldScenarioGroup[];

function existingColorGroup(surface: Extract<FieldSurface, "detail" | "record">) {
  return projectScenarioGroup({
    id: `color-${surface}`,
    kind: "color",
    axes: [modeAxis, requirednessAxis, valueAxis],
    projectField: (context) => projectExistingColorField(surface, context),
  });
}

function projectCreateColorField({ facets }: FieldScenarioProjectionContext) {
  const required = facets.requiredness === "required";
  const field = required ? accentField : optionalAccentField;
  const value = colorValue(facets.value);

  return createField({
    fieldName: "accent",
    field,
    editor: "color",
    control: textControl(field, { editor: "color", controlKind: "color" }),
    draftInput: draftInput(value),
    labelVisibility: "visible",
    occurrence: {
      ownerId: `color-create-${facets.requiredness}-${facets.value}`,
      placementId: "accent",
    },
    recordId: `color-create-${facets.requiredness}-${facets.value}`,
    value,
  });
}

function projectExistingColorField(
  surface: Extract<FieldSurface, "detail" | "record">,
  { facets }: FieldScenarioProjectionContext,
) {
  const required = facets.requiredness === "required";
  const field = required ? accentField : optionalAccentField;
  const value = colorValue(facets.value);
  const common = {
    fieldName: "accent",
    field,
    editor: "color" as const,
    control: textControl(field, { editor: "color", controlKind: "color" }),
    labelVisibility: surface === "detail" ? ("visible" as const) : ("hidden" as const),
    occurrence: {
      ownerId: `color-${surface}-${facets.mode}-${facets.requiredness}-${facets.value}`,
      placementId: "accent",
    },
    recordId: `color-${surface}-${facets.mode}-${facets.requiredness}-${facets.value}`,
    surface,
  };

  return facets.mode === "display"
    ? displayField({
        ...common,
        density: "default",
        formatting: { displayValue: value },
        value: value || undefined,
      })
    : recordField({
        ...common,
        commit: "field-commit",
        density: "default",
        drafts: recordDrafts({ recordValue: value || undefined }),
        formatting: { displayValue: value },
        rendererKind: "color",
      });
}

function colorValue(value: string | undefined) {
  return value === "valid" ? "#2563eb" : value === "invalid" ? "not-a-color" : "";
}
