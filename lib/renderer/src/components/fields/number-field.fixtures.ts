import {
  composeScenarioAxis,
  projectScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type {
  FieldScenarioGroup,
  FieldScenarioProjectionContext,
} from "../field-scenario-model.ts";
import type { FieldSurface, ValueUnitField } from "@dpeek/formless-presentation/contract";
import {
  createField,
  displayField,
  draftInput,
  fieldError,
  numberControl,
  operationField,
  recordDrafts,
  recordField,
} from "./fixture-helpers.ts";

const estimateField = {
  type: "number",
  required: true,
  label: "Estimate",
  min: 0,
  integer: false,
} as const;
const optionalEstimateField = { ...estimateField, required: false } as const;
const operationNumberField = {
  type: "number",
  required: true,
  label: "Estimate",
} as const;
const optionalOperationNumberField = { ...operationNumberField, required: false } as const;
const requiredUnitField = {
  type: "enum",
  required: true,
  label: "Unit",
  values: [
    { key: "h", label: "h" },
    { key: "d", label: "d" },
  ],
  default: "h",
} as const;
const optionalUnitField = { ...requiredUnitField, required: false } as const;

const requirednessAxis = composeScenarioAxis("requiredness", "Requiredness", [
  scenarioOption("required", "Required"),
  scenarioOption("optional", "Optional"),
]);
const valueAxis = composeScenarioAxis("value", "Value", [
  scenarioOption("known", "Known"),
  scenarioOption("unset", "Unset"),
  scenarioOption("invalid", "Invalid Draft"),
]);
const modeAxis = composeScenarioAxis("mode", "Mode", [
  scenarioOption("editor", "Editor"),
  scenarioOption("display", "Display"),
]);
const formatAxis = composeScenarioAxis("format", "Format", [
  scenarioOption("plain", "Plain"),
  scenarioOption("number", "Number"),
  scenarioOption("currency", "Currency"),
  scenarioOption("percent", "Percent"),
]);
const suffixAxis = composeScenarioAxis("suffix", "Suffix", [
  scenarioOption("none", "None"),
  scenarioOption("suffix", "Hours"),
]);
const compositionAxis = composeScenarioAxis("composition", "Composition", [
  scenarioOption("scalar", "Scalar"),
  scenarioOption("value-unit", "Value Unit"),
]);
const unitStateAxis = composeScenarioAxis("unit-state", "Unit State", [
  scenarioOption("declared", "Declared"),
  scenarioOption("unset", "Unset"),
  scenarioOption("undeclared", "Undeclared"),
]);
const unitRequirednessAxis = composeScenarioAxis("unit-requiredness", "Unit Requiredness", [
  scenarioOption("required", "Required"),
  scenarioOption("optional", "Optional"),
]);

export const numberScenarioGroups = [
  projectScenarioGroup({
    id: "number-create",
    kind: "number",
    axes: [requirednessAxis, valueAxis],
    projectField: projectCreateNumberField,
  }),
  existingNumberGroup("record"),
  existingNumberGroup("detail"),
  projectScenarioGroup({
    id: "number-operation",
    kind: "number",
    axes: [requirednessAxis, valueAxis],
    projectField: projectOperationNumberField,
  }),
] satisfies readonly FieldScenarioGroup[];

function existingNumberGroup(surface: Extract<FieldSurface, "detail" | "record">) {
  return projectScenarioGroup({
    id: `number-${surface}`,
    kind: "number",
    axes: [
      modeAxis,
      requirednessAxis,
      valueAxis,
      formatAxis,
      suffixAxis,
      compositionAxis,
      unitStateAxis,
      unitRequirednessAxis,
    ],
    include: existingNumberCombinationIsValid,
    projectField: (context) => projectExistingNumberField(surface, context),
  });
}

function existingNumberCombinationIsValid({ facets }: FieldScenarioProjectionContext) {
  const valueUnit = facets.composition === "value-unit";

  if (
    !valueUnit &&
    (facets["unit-state"] !== "declared" || facets["unit-requiredness"] !== "required")
  ) {
    return false;
  }

  if (facets.mode === "display" && valueUnit) {
    return false;
  }

  if (facets.value === "invalid" && (facets.format !== "plain" || facets.suffix !== "none")) {
    return false;
  }

  if (facets.suffix === "suffix" && facets.mode === "editor") {
    return false;
  }

  if (valueUnit && facets.suffix !== "none") {
    return false;
  }

  if (valueUnit && facets["unit-state"] !== "declared" && facets.format !== "plain") {
    return false;
  }

  if (valueUnit && facets["unit-requiredness"] === "optional" && facets.format !== "plain") {
    return false;
  }

  if (valueUnit && facets["unit-requiredness"] === "required" && facets["unit-state"] === "unset") {
    return false;
  }

  if (
    valueUnit &&
    facets["unit-requiredness"] === "optional" &&
    facets["unit-state"] === "undeclared"
  ) {
    return false;
  }

  return true;
}

function projectCreateNumberField({ facets }: FieldScenarioProjectionContext) {
  const required = facets.requiredness === "required";
  const field = required ? estimateField : optionalEstimateField;
  const draft = submitNumberDraft(facets.value);

  return createField({
    fieldName: "estimateHours",
    field,
    editor: "number",
    control: numberControl(field),
    draftInput: draftInput(draft),
    errors: numberErrors(facets.value),
    labelVisibility: "visible",
    occurrence: {
      ownerId: `number-create-${facets.requiredness}-${facets.value}`,
      placementId: "estimateHours",
    },
    recordId: `number-create-${facets.requiredness}-${facets.value}`,
    value: typeof draft === "number" ? draft : undefined,
  });
}

function projectOperationNumberField({ facets }: FieldScenarioProjectionContext) {
  const required = facets.requiredness === "required";
  const field = required ? operationNumberField : optionalOperationNumberField;
  const draft = submitNumberDraft(facets.value);
  const errors =
    facets.value === "unset" && required
      ? [fieldError("estimateHours", 'Field "estimateHours" cannot be empty.')]
      : numberErrors(facets.value);

  return operationField({
    fieldName: "estimateHours",
    inputName: "estimateHours",
    field,
    editor: "number",
    control: numberControl(field),
    draftInput: draftInput(draft),
    errors,
    labelVisibility: "visible",
    occurrence: {
      ownerId: `number-operation-${facets.requiredness}-${facets.value}`,
      placementId: "estimateHours",
    },
    recordId: `number-operation-${facets.requiredness}-${facets.value}`,
    value: typeof draft === "number" ? draft : undefined,
  });
}

function projectExistingNumberField(
  surface: Extract<FieldSurface, "detail" | "record">,
  { facets }: FieldScenarioProjectionContext,
) {
  const required = facets.requiredness === "required";
  const field = required ? estimateField : optionalEstimateField;
  const format = numberFormat(facets.format);
  const value = storedNumberValue(facets.value, format);
  const draft = editorNumberText(facets.value, format);
  const displayValue = displayNumberText(value, format);
  const suffix = facets.suffix === "suffix" ? "hours" : undefined;
  const valueUnit = facets.composition === "value-unit";
  const unitRequired = facets["unit-requiredness"] === "required";
  const unitField = unitRequired ? requiredUnitField : optionalUnitField;
  const unitDraft = unitValue(facets["unit-state"]);
  const common = {
    fieldName: "estimateHours",
    field,
    editor: "number" as const,
    control: numberControl(field),
    labelVisibility: surface === "detail" ? ("visible" as const) : ("hidden" as const),
    occurrence: {
      ownerId: [
        "number",
        surface,
        facets.mode,
        facets.requiredness,
        facets.value,
        facets.format,
        facets.suffix,
        facets.composition,
        facets["unit-state"],
        facets["unit-requiredness"],
      ].join("-"),
      placementId: "estimateHours",
    },
    recordId: [
      "number",
      surface,
      facets.mode,
      facets.requiredness,
      facets.value,
      facets.format,
      facets.suffix,
      facets.composition,
      facets["unit-state"],
      facets["unit-requiredness"],
    ].join("-"),
    surface,
  };

  if (facets.mode === "display") {
    return displayField({
      ...common,
      density: "default",
      formatting: { displayValue, format, ...(suffix ? { suffix } : {}) },
      suffix,
      value,
    });
  }

  return recordField({
    ...common,
    commit: "field-commit",
    density: "default",
    drafts: recordDrafts({
      draft,
      draftInput: numberDraftInput(facets.value, value, draft),
      recordValue: value,
      ...(valueUnit
        ? {
            unitDraft,
            unitDraftInput: draftInput(unitDraft),
            unitRecordValue: unitDraft,
          }
        : {}),
    }),
    errors: numberErrors(facets.value),
    formatting: { displayValue, format, ...(suffix ? { suffix } : {}) },
    rendererKind: valueUnit ? "value-unit" : "number",
    suffix,
    valueUnit: valueUnit ? valueUnitFacts(unitField, unitDraft) : undefined,
  });
}

function submitNumberDraft(value: string | undefined) {
  return value === "known" ? 6 : value === "invalid" ? "6.." : "";
}

function storedNumberValue(value: string | undefined, format: ReturnType<typeof numberFormat>) {
  if (value === "invalid") {
    return format === "percent" ? 0.125 : format === "currency" ? 6 : 1.234;
  }

  if (value !== "known") {
    return undefined;
  }

  return format === "percent" ? 0.125 : format === "currency" ? 6 : 1.234;
}

function editorNumberText(value: string | undefined, format: ReturnType<typeof numberFormat>) {
  if (value === "invalid") {
    return "6..";
  }

  return displayNumberText(storedNumberValue(value, format), format);
}

function displayNumberText(value: number | undefined, format: ReturnType<typeof numberFormat>) {
  if (value === undefined) {
    return "";
  }

  if (format === "currency") {
    return `$${value.toFixed(2)}`;
  }

  if (format === "percent") {
    return `${plainNumber(value * 100)}%`;
  }

  return format === "number" ? plainNumber(value) : String(value);
}

function plainNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function numberFormat(value: string | undefined) {
  return value === "currency" || value === "percent" || value === "number" ? value : "plain";
}

function numberDraftInput(
  value: string | undefined,
  storedValue: number | undefined,
  draft: string,
) {
  return value === "invalid" ? draftInput(draft) : draftInput(storedValue);
}

function unitValue(value: string | undefined) {
  return value === "unset" ? "" : value === "undeclared" ? "fortnight" : "h";
}

function valueUnitFacts(
  unitField: typeof requiredUnitField | typeof optionalUnitField,
  currentValue: string,
): ValueUnitField {
  const declaredOptions = unitField.values.map((option) => ({
    label: option.label,
    status: "declared" as const,
    value: option.key,
  }));
  return {
    clearable: !unitField.required,
    options:
      currentValue !== "" &&
      unitField.values.find((definition) => definition.key === currentValue) === undefined
        ? [
            { label: currentValue, status: "undeclaredCurrent" as const, value: currentValue },
            ...declaredOptions,
          ]
        : declaredOptions,
    required: unitField.required,
    unitField,
    unitFieldName: "estimateUnit",
  };
}

function numberErrors(value: string | undefined) {
  return value === "invalid"
    ? [fieldError("estimateHours", "Enter a finite number.", "6..")]
    : undefined;
}
