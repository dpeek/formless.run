import { isDateString } from "./date.ts";
import {
  isValidStoredTextValue,
  textFieldValidatesStoredValue,
  validateTextValueForStorage,
} from "./text-values.ts";
import type { FieldValue, RecordValues } from "./types.ts";
import type { QueryOperator } from "./types.ts";
import type { FieldCommitPolicy, FieldEditor, FieldSchema, TableColumnFormat } from "./types.ts";
export type AuthorityFieldValueResult =
  | {
      kind: "set";
      value: FieldValue;
    }
  | {
      kind: "omit";
    };
export type FieldDisplayOptions = {
  format?: TableColumnFormat;
};
export type FieldEditorControl =
  | {
      kind: "checkbox";
    }
  | {
      kind: "formattedNumber";
    }
  | {
      kind: "icon";
    }
  | {
      kind: "input";
      inputType: "date" | "number" | "text";
    }
  | {
      kind: "mediaUpload";
    }
  | {
      kind: "reference";
    }
  | {
      kind: "select";
    }
  | {
      kind: "textarea";
    };
export type FieldInputAttributes = {
  max?: number;
  min?: number;
  step?: "1" | "any";
};
export type NumberInputValueParseResult =
  | {
      kind: "empty";
    }
  | {
      kind: "valid";
      value: number;
    }
  | {
      kind: "invalid";
    };
export type FieldTypeBehavior<TField extends FieldSchema = FieldSchema> = {
  type: TField["type"];
  filterOps: readonly QueryOperator[];
  editors: readonly FieldEditor[];
  defaultEditor: FieldEditor;
  defaultCommit: FieldCommitPolicy;
  validatesExistingStoredValues: boolean;
  createDefaultValue: (field: TField) => FieldValue | undefined;
  hasCreateDefault: (field: TField) => boolean;
  createInputValueToFieldValue: (
    field: TField,
    value: string | undefined,
    provided: boolean,
  ) => FieldValue;
  editorControl: (field: TField, editor: FieldEditor) => FieldEditorControl;
  fieldValueToInputValue: (field: TField, value: FieldValue | undefined) => string;
  formatDisplayValue: (field: TField, value: FieldValue, options?: FieldDisplayOptions) => string;
  inputAttributes: (field: TField) => FieldInputAttributes;
  inputValueToFieldValue: (field: TField, value: string) => FieldValue;
  validateAuthorityValue: (
    fieldName: string,
    field: TField,
    value: unknown,
    provided: boolean,
  ) => AuthorityFieldValueResult;
  isValidStoredValue: (value: RecordValues[string], field: TField) => boolean;
};

export const fieldTypeBehaviors = {
  text: {
    type: "text",
    filterOps: ["eq"],
    editors: ["text", "textarea", "markdown", "href", "slug", "color", "icon", "media"],
    defaultEditor: "text",
    defaultCommit: "field-commit",
    validatesExistingStoredValues: false,
    createDefaultValue: () => undefined,
    hasCreateDefault: () => false,
    createInputValueToFieldValue: stringCreateInputValueToFieldValue,
    editorControl: textEditorControl,
    fieldValueToInputValue: stringFieldValueToInputValue,
    formatDisplayValue: formatStringDisplayValue,
    inputAttributes: emptyInputAttributes,
    inputValueToFieldValue: stringInputValueToFieldValue,
    validateAuthorityValue: validateStringAuthorityValue,
    isValidStoredValue: (value, field) =>
      typeof value === "string" && isValidStoredTextValue(value, field),
  },
  boolean: {
    type: "boolean",
    filterOps: ["eq"],
    editors: ["boolean"],
    defaultEditor: "boolean",
    defaultCommit: "immediate",
    validatesExistingStoredValues: false,
    createDefaultValue: (field) => field.default,
    hasCreateDefault: (field) => typeof field.default === "boolean",
    createInputValueToFieldValue: (_field, _value, provided) => provided,
    editorControl: () => ({ kind: "checkbox" }),
    fieldValueToInputValue: () => "",
    formatDisplayValue: (_field, value) =>
      value === true ? "Yes" : value === false ? "No" : String(value),
    inputAttributes: emptyInputAttributes,
    inputValueToFieldValue: stringInputValueToFieldValue,
    validateAuthorityValue: validateBooleanAuthorityValue,
    isValidStoredValue: (value) => typeof value === "boolean",
  },
  date: {
    type: "date",
    filterOps: ["eq", "before"],
    editors: ["date"],
    defaultEditor: "date",
    defaultCommit: "field-commit",
    validatesExistingStoredValues: false,
    createDefaultValue: () => undefined,
    hasCreateDefault: () => false,
    createInputValueToFieldValue: stringCreateInputValueToFieldValue,
    editorControl: () => ({ kind: "input", inputType: "date" }),
    fieldValueToInputValue: stringFieldValueToInputValue,
    formatDisplayValue: formatStringDisplayValue,
    inputAttributes: emptyInputAttributes,
    inputValueToFieldValue: stringInputValueToFieldValue,
    validateAuthorityValue: validateDateAuthorityValue,
    isValidStoredValue: (value, field) =>
      typeof value === "string" && (!field.required || value.trim() !== "") && isDateString(value),
  },
  number: {
    type: "number",
    filterOps: ["eq"],
    editors: ["number"],
    defaultEditor: "number",
    defaultCommit: "field-commit",
    validatesExistingStoredValues: true,
    createDefaultValue: (field) => field.default,
    hasCreateDefault: (field) => typeof field.default === "number",
    createInputValueToFieldValue: (_field, value) => numberInputValueToFieldValue(value ?? ""),
    editorControl: () => ({ kind: "formattedNumber" }),
    fieldValueToInputValue: (_field, value) => (typeof value === "number" ? String(value) : ""),
    formatDisplayValue: (_field, value, options) => formatNumberDisplayValue(value, options),
    inputAttributes: numberInputAttributes,
    inputValueToFieldValue: (_field, value) => numberInputValueToFieldValue(value),
    validateAuthorityValue: validateNumberAuthorityValue,
    isValidStoredValue: isValidNumberFieldValue,
  },
  enum: {
    type: "enum",
    filterOps: ["eq"],
    editors: ["enum"],
    defaultEditor: "enum",
    defaultCommit: "immediate",
    validatesExistingStoredValues: false,
    createDefaultValue: (field) => field.default,
    hasCreateDefault: (field) => typeof field.default === "string",
    createInputValueToFieldValue: stringCreateInputValueToFieldValue,
    editorControl: () => ({ kind: "select" }),
    fieldValueToInputValue: stringFieldValueToInputValue,
    formatDisplayValue: (field, value) =>
      typeof value === "string"
        ? (field.values.find((definition) => definition.key === value)?.label ?? value)
        : String(value),
    inputAttributes: emptyInputAttributes,
    inputValueToFieldValue: stringInputValueToFieldValue,
    validateAuthorityValue: validateEnumAuthorityValue,
    isValidStoredValue: (value) => typeof value === "string" && value !== "",
  },
  reference: {
    type: "reference",
    filterOps: ["eq"],
    editors: ["reference"],
    defaultEditor: "reference",
    defaultCommit: "immediate",
    validatesExistingStoredValues: true,
    createDefaultValue: () => undefined,
    hasCreateDefault: () => false,
    createInputValueToFieldValue: stringCreateInputValueToFieldValue,
    editorControl: () => ({ kind: "reference" }),
    fieldValueToInputValue: stringFieldValueToInputValue,
    formatDisplayValue: formatStringDisplayValue,
    inputAttributes: emptyInputAttributes,
    inputValueToFieldValue: stringInputValueToFieldValue,
    validateAuthorityValue: validateReferenceAuthorityValue,
    isValidStoredValue: (value) => typeof value === "string" && value.trim() !== "",
  },
} satisfies {
  [Type in FieldSchema["type"]]: FieldTypeBehavior<
    Extract<
      FieldSchema,
      {
        type: Type;
      }
    >
  >;
};
export const fieldEditors = [
  "text",
  "textarea",
  "markdown",
  "href",
  "slug",
  "color",
  "icon",
  "media",
  "boolean",
  "date",
  "number",
  "enum",
  "reference",
] satisfies FieldEditor[];

export const fieldCommitPolicies = ["immediate", "field-commit"] satisfies FieldCommitPolicy[];

export function getFieldTypeBehavior<TField extends FieldSchema>(
  field: TField,
): FieldTypeBehavior<TField> {
  return fieldTypeBehaviors[field.type] as FieldTypeBehavior<TField>;
}

export function isFieldEditor(value: unknown): value is FieldEditor {
  return fieldEditors.includes(value as FieldEditor);
}

export function isFieldCommitPolicy(value: unknown): value is FieldCommitPolicy {
  return fieldCommitPolicies.includes(value as FieldCommitPolicy);
}

export function fieldSupportsEditor(field: FieldSchema, editor: FieldEditor) {
  return getFieldTypeBehavior(field).editors.includes(editor);
}

export function fieldHasCreateDefault(field: FieldSchema) {
  return getFieldTypeBehavior(field).hasCreateDefault(field);
}

export function fieldCreateDefaultValue(field: FieldSchema) {
  return getFieldTypeBehavior(field).createDefaultValue(field);
}

export function createInputValueToFieldValue(
  field: FieldSchema,
  value: string | undefined,
  provided: boolean,
) {
  return getFieldTypeBehavior(field).createInputValueToFieldValue(field, value, provided);
}

export function fieldEditorControl(field: FieldSchema, editor: FieldEditor) {
  const behavior = getFieldTypeBehavior(field);

  if (!fieldSupportsEditor(field, editor)) {
    throw new Error(`Editor "${editor}" is not valid for field type "${field.type}".`);
  }

  return behavior.editorControl(field, editor);
}

export function fieldValueToInputValue(field: FieldSchema, value: FieldValue | undefined) {
  return getFieldTypeBehavior(field).fieldValueToInputValue(field, value);
}

export function formatFieldDisplayPrimitive(
  field: FieldSchema,
  value: FieldValue,
  options?: FieldDisplayOptions,
) {
  return getFieldTypeBehavior(field).formatDisplayValue(field, value, options);
}

export function inputValueToFieldValue(field: FieldSchema, value: string) {
  return getFieldTypeBehavior(field).inputValueToFieldValue(field, value);
}

export function fieldInputAttributes(field: FieldSchema) {
  return getFieldTypeBehavior(field).inputAttributes(field);
}

export function shouldValidateExistingFieldValue(field: FieldSchema) {
  return (
    field.required ||
    getFieldTypeBehavior(field).validatesExistingStoredValues ||
    (field.type === "text" && textFieldValidatesStoredValue(field))
  );
}

export function validateAuthorityFieldValue(
  fieldName: string,
  field: FieldSchema,
  value: unknown,
  provided: boolean,
) {
  return getFieldTypeBehavior(field).validateAuthorityValue(fieldName, field, value, provided);
}

export function isValidStoredFieldValue(
  value: RecordValues[string] | undefined,
  field: FieldSchema,
) {
  if (value === undefined) {
    return !field.required || fieldHasCreateDefault(field);
  }
  return getFieldTypeBehavior(field).isValidStoredValue(value, field);
}
function validateStringAuthorityValue(
  fieldName: string,
  field: Extract<
    FieldSchema,
    {
      type: "text";
    }
  >,
  value: unknown,
): AuthorityFieldValueResult {
  if (typeof value !== "string") {
    if (field.required) {
      throw new Error(`Field "${fieldName}" is required.`);
    }

    return { kind: "omit" };
  }

  if (field.required && value.trim() === "") {
    throw new Error(`Field "${fieldName}" cannot be empty.`);
  }

  return validateTextValueForStorage(field, value);
}

function stringCreateInputValueToFieldValue(
  _field: FieldSchema,
  value: string | undefined,
): FieldValue {
  return value ?? "";
}

function stringFieldValueToInputValue(_field: FieldSchema, value: FieldValue | undefined) {
  return typeof value === "string" ? value : "";
}

function stringInputValueToFieldValue(_field: FieldSchema, value: string): FieldValue {
  return value;
}
function textEditorControl(
  _field: Extract<
    FieldSchema,
    {
      type: "text";
    }
  >,
  editor: FieldEditor,
): FieldEditorControl {
  if (editor === "icon") {
    return { kind: "icon" };
  }

  if (editor === "media") {
    return { kind: "mediaUpload" };
  }

  if (editor === "textarea" || editor === "markdown") {
    return { kind: "textarea" };
  }

  return { kind: "input", inputType: "text" };
}

function formatStringDisplayValue(_field: FieldSchema, value: FieldValue) {
  return String(value);
}

function formatNumberDisplayValue(value: FieldValue, options?: FieldDisplayOptions) {
  if (typeof value !== "number") {
    return String(value);
  }

  if (options?.format === "currency") {
    return `$${value.toFixed(2)}`;
  }

  if (options?.format === "percent") {
    return `${formatPlainNumber(value * 100)}%`;
  }

  if (options?.format === "number") {
    return formatPlainNumber(value);
  }

  return String(value);
}

export function formatPlainNumber(value: number) {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(2).replace(/\.?0+$/, "");
}

function emptyInputAttributes() {
  return {};
}
function numberInputAttributes(
  field: Extract<
    FieldSchema,
    {
      type: "number";
    }
  >,
) {
  return {
    max: field.max,
    min: field.min,
    step: field.integer ? "1" : "any",
  } satisfies FieldInputAttributes;
}

export function numberInputValueToFieldValue(value: string): FieldValue {
  const result = parseNumberInputValue(value);

  if (result.kind === "empty") {
    return "";
  }

  if (result.kind === "valid") {
    return result.value;
  }

  return Number.NaN;
}

export function parseNumberInputValue(value: string): NumberInputValueParseResult {
  const input = value.trim();

  if (input === "") {
    return { kind: "empty" };
  }

  const normalizedInput = input.replace(/,/g, "");
  const match = /^([+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:e[+-]?\d+)?)([kmb])?$/i.exec(normalizedInput);

  if (!match) {
    return { kind: "invalid" };
  }

  const number = Number(match[1]);
  const suffix = match[2]?.toLowerCase();
  const multiplier =
    suffix === "k" ? 1000 : suffix === "m" ? 1000000 : suffix === "b" ? 1000000000 : 1;
  const parsed = number * multiplier;
  return Number.isFinite(parsed) ? { kind: "valid", value: parsed } : { kind: "invalid" };
}
function validateDateAuthorityValue(
  fieldName: string,
  field: Extract<
    FieldSchema,
    {
      type: "date";
    }
  >,
  value: unknown,
) {
  return validateTextLikeAuthorityValue(fieldName, field, value, (fieldValue) => {
    if (fieldValue !== "" && !isDateString(fieldValue)) {
      throw new Error(`Field "${fieldName}" must be a YYYY-MM-DD date.`);
    }
  });
}
function validateTextLikeAuthorityValue(
  fieldName: string,
  field: Extract<
    FieldSchema,
    {
      type: "text" | "date";
    }
  >,
  value: unknown,
  validate?: (value: string) => void,
): AuthorityFieldValueResult {
  if (typeof value !== "string") {
    if (field.required) {
      throw new Error(`Field "${fieldName}" is required.`);
    }

    return { kind: "omit" };
  }

  if (field.required && value.trim() === "") {
    throw new Error(`Field "${fieldName}" cannot be empty.`);
  }

  validate?.(value);

  if (value !== "" || field.required) {
    return { kind: "set", value };
  }
  return { kind: "omit" };
}
function validateBooleanAuthorityValue(
  fieldName: string,
  field: Extract<
    FieldSchema,
    {
      type: "boolean";
    }
  >,
  value: unknown,
  provided: boolean,
): AuthorityFieldValueResult {
  if (typeof value === "boolean") {
    return { kind: "set", value };
  }

  if (provided) {
    throw new Error(`Field "${fieldName}" must be a boolean.`);
  }

  if (typeof field.default === "boolean") {
    return { kind: "set", value: field.default };
  }

  if (field.required) {
    throw new Error(`Field "${fieldName}" is required.`);
  }
  return { kind: "omit" };
}
function validateEnumAuthorityValue(
  fieldName: string,
  field: Extract<
    FieldSchema,
    {
      type: "enum";
    }
  >,
  value: unknown,
  provided: boolean,
): AuthorityFieldValueResult {
  if (provided) {
    if (typeof value !== "string") {
      throw new Error(`Field "${fieldName}" must be a known enum value.`);
    }

    if (value === "") {
      if (field.required) {
        throw new Error(`Field "${fieldName}" cannot be empty.`);
      }
      return { kind: "omit" };
    }
    if (!field.values.some((definition) => definition.key === value)) {
      throw new Error(`Field "${fieldName}" must be a known enum value.`);
    }
    return { kind: "set", value };
  }
  if (field.default !== undefined) {
    return { kind: "set", value: field.default };
  }

  if (field.required) {
    throw new Error(`Field "${fieldName}" is required.`);
  }
  return { kind: "omit" };
}
function validateNumberAuthorityValue(
  fieldName: string,
  field: Extract<
    FieldSchema,
    {
      type: "number";
    }
  >,
  value: unknown,
  provided: boolean,
): AuthorityFieldValueResult {
  if (provided) {
    if (value === "") {
      if (field.required) {
        throw new Error(`Field "${fieldName}" cannot be empty.`);
      }

      return { kind: "omit" };
    }

    validateNumberFieldValue(fieldName, value, field);

    return { kind: "set", value };
  }

  if (field.default !== undefined) {
    return { kind: "set", value: field.default };
  }

  if (field.required) {
    throw new Error(`Field "${fieldName}" is required.`);
  }
  return { kind: "omit" };
}
function validateReferenceAuthorityValue(
  fieldName: string,
  field: Extract<
    FieldSchema,
    {
      type: "reference";
    }
  >,
  value: unknown,
  provided: boolean,
): AuthorityFieldValueResult {
  if (!provided) {
    if (field.required) {
      throw new Error(`Field "${fieldName}" is required.`);
    }

    return { kind: "omit" };
  }

  if (typeof value !== "string") {
    throw new Error(`Field "${fieldName}" must be a reference ID.`);
  }

  if (value.trim() === "") {
    if (field.required) {
      throw new Error(`Field "${fieldName}" cannot be empty.`);
    }

    return { kind: "omit" };
  }

  return { kind: "set", value };
}

function validateNumberFieldValue(
  fieldName: string,
  value: unknown,
  field: Extract<
    FieldSchema,
    {
      type: "number";
    }
  >,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Field "${fieldName}" must be a finite number.`);
  }

  if (field.min !== undefined && value < field.min) {
    throw new Error(`Field "${fieldName}" must be greater than or equal to ${field.min}.`);
  }

  if (field.max !== undefined && value > field.max) {
    throw new Error(`Field "${fieldName}" must be less than or equal to ${field.max}.`);
  }

  if (field.integer && !Number.isInteger(value)) {
    throw new Error(`Field "${fieldName}" must be an integer.`);
  }
}
function isValidNumberFieldValue(
  value: RecordValues[string],
  field: Extract<
    FieldSchema,
    {
      type: "number";
    }
  >,
) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    (field.min === undefined || value >= field.min) &&
    (field.max === undefined || value <= field.max) &&
    (!field.integer || Number.isInteger(value))
  );
}
