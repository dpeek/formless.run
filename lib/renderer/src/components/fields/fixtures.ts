import {
  mergeScenarioGroupsByKind,
  type FieldKindOption,
  type FieldScenarioGroup,
} from "../field-scenario-model.ts";
import type { FieldSurface } from "@dpeek/formless-presentation/contract";
import { booleanScenarioGroups } from "./boolean-field.fixtures.ts";
import { colorScenarioGroups } from "./color-field.fixtures.ts";
import { dateScenarioGroups } from "./date-field.fixtures.ts";
import { enumScenarioGroups } from "./enum-field.fixtures.ts";
import { iconScenarioGroups } from "./icon-field.fixtures.ts";
import { mediaScenarioGroups } from "./media-field.fixtures.ts";
import { numberScenarioGroups } from "./number-field.fixtures.ts";
import { referenceScenarioGroups } from "./reference-field.fixtures.ts";
import { stateMachineScenarioGroups } from "./state-machine-field.fixtures.ts";
import { textScenarioGroups } from "./text-field.fixtures.ts";

export const fieldSurfaceOptions = [
  { id: "create", label: "Create" },
  { id: "record", label: "Record" },
  { id: "table-cell", label: "Table Cell" },
  { id: "detail", label: "Item Detail" },
  { id: "operation", label: "Operation" },
] satisfies readonly {
  id: FieldSurface;
  label: string;
}[];
export const fieldKindOptions = [
  { id: "state-machine-enum", label: "State" },
  { id: "enum", label: "Enum" },
  { id: "reference", label: "Reference" },
  { id: "text", label: "Text" },
  { id: "long-text", label: "Long Text" },
  { id: "markdown", label: "Markdown" },
  { id: "number", label: "Number" },
  { id: "date", label: "Date" },
  { id: "boolean", label: "Boolean" },
  { id: "color", label: "Color" },
  { id: "source-icon", label: "Icon" },
  { id: "media", label: "Media" },
] satisfies readonly FieldKindOption[];

const rawFieldScenarioGroups = [
  ...stateMachineScenarioGroups,
  ...enumScenarioGroups,
  ...referenceScenarioGroups,
  ...textScenarioGroups,
  ...numberScenarioGroups,
  ...dateScenarioGroups,
  ...booleanScenarioGroups,
  ...colorScenarioGroups,
  ...iconScenarioGroups,
  ...mediaScenarioGroups,
] satisfies readonly FieldScenarioGroup[];

export const fieldScenarioGroups = mergeScenarioGroupsByKind(
  rawFieldScenarioGroups,
  fieldSurfaceOptions,
);
