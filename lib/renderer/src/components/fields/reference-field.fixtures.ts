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
  referenceControl,
  referenceDisplayFacts,
  referenceEditorFacts,
  referenceOptions,
} from "./fixture-helpers.ts";

const ownerOptions = [
  { id: "principal-dana", label: "Dana Peek" },
  { id: "principal-jordan", label: "Jordan Lee" },
] as const;

const ownerField = {
  type: "reference",
  required: true,
  label: "Owner",
  to: "principal",
} as const;

const optionalOwnerField = { ...ownerField, required: false } as const;

const requirednessAxis = composeScenarioAxis("requiredness", "Requiredness", [
  scenarioOption("required", "Required"),
  scenarioOption("optional", "Optional"),
]);

const createValueAxis = composeScenarioAxis("value", "Value", [
  scenarioOption("known", "Known"),
  scenarioOption("unset", "Unset"),
]);

const existingValueAxis = composeScenarioAxis("value", "Value", [
  scenarioOption("known", "Known"),
  scenarioOption("unset", "Unset"),
  scenarioOption("missing", "Missing Reference"),
]);

const modeAxis = composeScenarioAxis("mode", "Mode", [
  scenarioOption("editor", "Editor"),
  scenarioOption("display", "Display"),
]);

export const referenceScenarioGroups = [
  projectScenarioGroup({
    id: "reference-create",
    kind: "reference",
    axes: [requirednessAxis, createValueAxis],
    include: ({ facets }) => facets.requiredness === "optional" || facets.value === "known",
    projectField: projectCreateReferenceField,
  }),
  projectExistingReferenceGroup("record"),
  projectExistingReferenceGroup("detail"),
] satisfies readonly FieldScenarioGroup[];

function projectExistingReferenceGroup(surface: Extract<FieldSurface, "detail" | "record">) {
  return projectScenarioGroup({
    id: `reference-${surface}`,
    kind: "reference",
    axes: [modeAxis, requirednessAxis, existingValueAxis],
    projectField: (context) => projectExistingReferenceField(surface, context),
  });
}

function projectCreateReferenceField({ facets }: FieldScenarioProjectionContext) {
  const required = facets.requiredness === "required";
  const field = required ? ownerField : optionalOwnerField;
  const value = facets.value === "known" ? "principal-dana" : "";

  return createField({
    fieldName: "ownerId",
    field,
    editor: "reference",
    control: referenceControl(field),
    draftInput: required ? undefined : draftInput(value),
    labelVisibility: "visible",
    occurrence: {
      ownerId: `create-owner-${required ? "required" : "optional"}-${value || "unset"}`,
      placementId: "ownerId",
    },
    options: { referenceOptions: referenceOptions(ownerOptions) },
    reference: referenceEditorFacts(field, value, ownerOptions),
    recordId: `create-owner-${required ? "required" : "optional"}-${value || "unset"}`,
    value,
  });
}

function projectExistingReferenceField(
  surface: Extract<FieldSurface, "detail" | "record">,
  { facets }: FieldScenarioProjectionContext,
) {
  const required = facets.requiredness === "required";
  const field = required ? ownerField : optionalOwnerField;
  const value =
    facets.value === "known"
      ? "principal-dana"
      : facets.value === "missing"
        ? "principal-missing"
        : "";
  const displayValue = value === "principal-dana" ? "Dana Peek" : value;
  const options = {
    referenceOptions: referenceOptions(ownerOptions),
  };
  const common = {
    fieldName: "ownerId",
    field,
    editor: "reference" as const,
    control: referenceControl(field),
    labelVisibility: surface === "detail" ? ("visible" as const) : ("hidden" as const),
    options,
    occurrence: {
      ownerId: `${surface}-owner-${facets.mode}-${required ? "required" : "optional"}-${facets.value}`,
      placementId: "ownerId",
    },
    recordId: `${surface}-owner-${facets.mode}-${required ? "required" : "optional"}-${facets.value}`,
    surface,
  };

  return facets.mode === "display"
    ? displayField({
        ...common,
        density: "default",
        formatting: { displayValue },
        reference: referenceDisplayFacts(value || undefined, ownerOptions),
        value: value || undefined,
      })
    : recordField({
        ...common,
        commit: "immediate",
        density: "default",
        drafts: recordDrafts({ recordValue: value || undefined }),
        formatting: { displayValue },
        reference: referenceEditorFacts(field, value || undefined, ownerOptions),
        rendererKind: "reference",
      });
}
