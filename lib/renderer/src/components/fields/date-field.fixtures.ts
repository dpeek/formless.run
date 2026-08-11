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
  dateControl,
  displayField,
  draftInput,
  operationField,
  recordDrafts,
  recordField,
} from "./fixture-helpers.ts";

const dueDate = "2026-07-08";
const dueDateField = { type: "date", required: true, label: "Due" } as const;
const optionalDueDateField = { ...dueDateField, required: false } as const;
const updatedAtField = { type: "date", required: false, label: "Updated" } as const;

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
const presentationAxis = composeScenarioAxis("presentation", "Presentation", [
  scenarioOption("default", "Default"),
  scenarioOption("value-or-interaction", "Value Or Interaction"),
]);
const detailInteractionAxis = composeScenarioAxis("interaction", "Access", [
  scenarioOption("editable", "Editable"),
  scenarioOption("read-only", "Read Only"),
  scenarioOption("system", "System"),
]);

export const dateScenarioGroups = [
  projectScenarioGroup({
    id: "date-create",
    kind: "date",
    axes: [requirednessAxis, valueAxis],
    projectField: projectCreateDateField,
  }),
  projectScenarioGroup({
    id: "date-record",
    kind: "date",
    axes: [modeAxis, requirednessAxis, valueAxis, presentationAxis],
    include: datePresentationCombinationIsValid,
    projectField: (context) => projectExistingDateField("record", context),
  }),
  projectScenarioGroup({
    id: "date-detail",
    kind: "date",
    axes: [modeAxis, requirednessAxis, valueAxis, detailInteractionAxis],
    include: detailDateCombinationIsValid,
    projectField: projectDetailDateField,
  }),
  projectScenarioGroup({
    id: "date-operation",
    kind: "date",
    axes: [requirednessAxis, valueAxis],
    projectField: projectOperationDateField,
  }),
] satisfies readonly FieldScenarioGroup[];

function datePresentationCombinationIsValid({ facets }: FieldScenarioProjectionContext) {
  return (
    facets.presentation === "default" ||
    (facets.mode === "editor" && facets.requiredness === "optional" && facets.value === "unset")
  );
}

function detailDateCombinationIsValid({ facets }: FieldScenarioProjectionContext) {
  if (facets.interaction === "editable") {
    return facets.mode === "editor";
  }

  if (facets.interaction === "system") {
    return (
      facets.mode === "display" && facets.requiredness === "optional" && facets.value === "known"
    );
  }

  return facets.mode === "display";
}

function projectCreateDateField({ facets }: FieldScenarioProjectionContext) {
  const required = facets.requiredness === "required";
  const field = required ? dueDateField : optionalDueDateField;
  const value = facets.value === "known" ? dueDate : "";

  return createField({
    fieldName: "dueDate",
    field,
    editor: "date",
    control: dateControl(field),
    draftInput: draftInput(value),
    labelVisibility: "visible",
    occurrence: {
      ownerId: `date-create-${facets.requiredness}-${facets.value}`,
      placementId: "dueDate",
    },
    recordId: `date-create-${facets.requiredness}-${facets.value}`,
    value,
  });
}

function projectOperationDateField({ facets }: FieldScenarioProjectionContext) {
  const required = facets.requiredness === "required";
  const field = required ? dueDateField : optionalDueDateField;
  const value = facets.value === "known" ? dueDate : "";

  return operationField({
    fieldName: "dueDate",
    inputName: "dueDate",
    field,
    editor: "date",
    control: dateControl(field),
    draftInput: draftInput(value),
    labelVisibility: "visible",
    occurrence: {
      ownerId: `date-operation-${facets.requiredness}-${facets.value}`,
      placementId: "dueDate",
    },
    recordId: `date-operation-${facets.requiredness}-${facets.value}`,
    value: value || undefined,
  });
}

function projectDetailDateField(context: FieldScenarioProjectionContext) {
  if (context.facets.interaction !== "system") {
    return projectExistingDateField("detail", context);
  }

  return displayField({
    fieldName: "updatedAt",
    field: updatedAtField,
    editor: "date",
    control: dateControl(updatedAtField),
    access: { kind: "system", fieldRef: { kind: "system", name: "updatedAt" } },
    density: "default",
    fieldRef: { kind: "system", name: "updatedAt" },
    formatting: {
      displayValue: "Jul 6, 2026 9:30 AM",
      temporal: { kind: "dateTime", value: "2026-07-06T09:30:00.000Z" },
    },
    labelVisibility: "visible",
    occurrence: { ownerId: "date-detail-system", placementId: "updatedAt" },
    recordId: "date-detail-system",
    surface: "detail",
    value: "2026-07-06T09:30:00.000Z",
  });
}

function projectExistingDateField(
  surface: Extract<FieldSurface, "detail" | "record">,
  { facets }: FieldScenarioProjectionContext,
) {
  const required = facets.requiredness === "required";
  const field = required ? dueDateField : optionalDueDateField;
  const value = facets.value === "known" ? dueDate : "";
  const common = {
    fieldName: "dueDate",
    field,
    editor: "date" as const,
    control: dateControl(field),
    labelVisibility: surface === "detail" ? ("visible" as const) : ("hidden" as const),
    occurrence: {
      ownerId: `date-${surface}-${facets.mode}-${facets.requiredness}-${facets.value}-${facets.presentation ?? "default"}`,
      placementId: "dueDate",
    },
    recordId: `date-${surface}-${facets.mode}-${facets.requiredness}-${facets.value}-${facets.presentation ?? "default"}`,
    surface,
  };

  return facets.mode === "display"
    ? displayField({
        ...common,
        density: "default",
        formatting: {
          displayValue: value ? "Jul 8, 2026" : "",
          ...(value ? { temporal: { kind: "date" as const, value } } : {}),
        },
        value: value || undefined,
      })
    : recordField({
        ...common,
        commit: "field-commit",
        density: "default",
        drafts: recordDrafts({ recordValue: value || undefined }),
        formatting: { displayValue: value ? "Jul 8, 2026" : "" },
        presentation:
          facets.presentation === "value-or-interaction"
            ? { visibility: "valueOrInteraction" }
            : undefined,
        rendererKind: facets.presentation === "value-or-interaction" ? "quiet-date" : "date",
      });
}
