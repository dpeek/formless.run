import {
  composeScenarioAxis,
  projectScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type {
  FieldScenarioGroup,
  FieldScenarioProjectionContext,
} from "../field-scenario-model.ts";
import type { FieldSurface, IconPickerFacts } from "@dpeek/formless-presentation/contract";
import {
  createField,
  displayField,
  draftInput,
  recordDrafts,
  recordField,
  textControl,
} from "./fixture-helpers.ts";
import { iconOptions, pageIconSource } from "./icon-field.fixture-options.ts";

const customIconSource = [
  '<svg viewBox="0 0 24 24" fill="currentColor">',
  '<path d="M12 3 21 12 12 21 3 12Z" />',
  "</svg>",
].join("");

const pageIconField = {
  type: "text",
  required: true,
  label: "Page Icon",
  format: "icon",
} as const;
const optionalPageIconField = { ...pageIconField, required: false } as const;

const requirednessAxis = composeScenarioAxis("requiredness", "Requiredness", [
  scenarioOption("required", "Required"),
  scenarioOption("optional", "Optional"),
]);
const valueAxis = composeScenarioAxis("value", "Value", [
  scenarioOption("catalog", "Catalog Source"),
  scenarioOption("custom", "Custom Source"),
  scenarioOption("unset", "Unset"),
]);
const modeAxis = composeScenarioAxis("mode", "Mode", [
  scenarioOption("editor", "Editor"),
  scenarioOption("display", "Display"),
]);
export const iconScenarioGroups = [
  projectScenarioGroup({
    id: "source-icon-create",
    kind: "source-icon",
    axes: [requirednessAxis, valueAxis],
    projectField: projectCreateIconField,
  }),
  existingIconGroup("record"),
  existingIconGroup("detail"),
] satisfies readonly FieldScenarioGroup[];

function existingIconGroup(surface: Extract<FieldSurface, "detail" | "record">) {
  return projectScenarioGroup({
    id: `source-icon-${surface}`,
    kind: "source-icon",
    axes: [modeAxis, requirednessAxis, valueAxis],
    projectField: (context) => projectExistingIconField(surface, context),
  });
}

function projectCreateIconField({ facets }: FieldScenarioProjectionContext) {
  const required = facets.requiredness === "required";
  const field = required ? pageIconField : optionalPageIconField;
  const value = iconValue(facets.value);

  return createField({
    fieldName: "pageIcon",
    field,
    editor: "icon",
    control: textControl(field, { editor: "icon", controlKind: "icon" }),
    draftInput: draftInput(value),
    icon: iconPickerFacts(value),
    labelVisibility: "visible",
    occurrence: {
      ownerId: `source-icon-create-${facets.requiredness}-${facets.value}`,
      placementId: "pageIcon",
    },
    options: { iconOptions },
    recordId: `source-icon-create-${facets.requiredness}-${facets.value}`,
    value,
  });
}

function projectExistingIconField(
  surface: Extract<FieldSurface, "detail" | "record">,
  { facets }: FieldScenarioProjectionContext,
) {
  const required = facets.requiredness === "required";
  const field = required ? pageIconField : optionalPageIconField;
  const value = iconValue(facets.value);
  const common = {
    fieldName: "pageIcon",
    field,
    editor: "icon" as const,
    control: textControl(field, { editor: "icon", controlKind: "icon" }),
    labelVisibility: surface === "detail" ? ("visible" as const) : ("hidden" as const),
    occurrence: {
      ownerId: `source-icon-${surface}-${facets.mode}-${facets.requiredness}-${facets.value}`,
      placementId: "pageIcon",
    },
    options: { iconOptions },
    recordId: `source-icon-${surface}-${facets.mode}-${facets.requiredness}-${facets.value}`,
    surface,
  };

  return facets.mode === "display"
    ? displayField({
        ...common,
        density: "default",
        formatting: { displayValue: value ? "Page icon" : "" },
        value: value || undefined,
      })
    : recordField({
        ...common,
        commit: "field-commit",
        density: "default",
        drafts: recordDrafts({ recordValue: value || undefined }),
        formatting: { displayValue: value ? "Page icon" : "" },
        icon: iconPickerFacts(value),
        rendererKind: "icon",
      });
}

function iconValue(value: string | undefined) {
  return value === "catalog" ? pageIconSource : value === "custom" ? customIconSource : "";
}

function iconPickerFacts(value: string): IconPickerFacts {
  const dialogDraft = value;
  const option = iconOptions.find((candidate) => candidate.source === dialogDraft);

  return {
    canCancel: false,
    canSave: false,
    dialogDraft,
    dialogOpen: false,
    emptyValue: dialogDraft.trim() === "",
    previewSource: dialogDraft,
    selection:
      dialogDraft.trim() === ""
        ? { kind: "empty" }
        : option
          ? { kind: "option", optionId: option.id, source: dialogDraft }
          : { kind: "customSource", source: dialogDraft },
    valueMode: "svgSource",
  };
}
