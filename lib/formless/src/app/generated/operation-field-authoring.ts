import {
  generatedFieldDraftInput,
  resolveGeneratedFieldDraftValues,
  validateTextValueForStorage,
  type FieldEditor,
  type FieldSchema,
  type FieldValue,
  type GeneratedFieldDraft,
  type GeneratedFieldDraftError,
  type GeneratedFieldDraftInput,
  type PublicSafeOperationInputField,
} from "@dpeek/formless-schema";
import type { RecordValues } from "@dpeek/formless-storage";

export type GeneratedOperationDraftFieldInput = GeneratedFieldDraftInput;

export type GeneratedOperationDraftInput = GeneratedFieldDraft;

export type GeneratedOperationDraftFieldError = GeneratedFieldDraftError;

export type GeneratedOperationInputConfigurationError = {
  inputName: string;
  message: string;
};

export type GeneratedOperationInputFieldConfig = PublicSafeOperationInputField & {
  editor: FieldEditor;
  field: FieldSchema;
  fieldName: string;
  inputName: string;
};

export type GeneratedOperationDraftSessionState = {
  draft: GeneratedOperationDraftInput;
};

export type GeneratedOperationDraftSessionFacts = {
  canSubmit: boolean;
  configurationErrors: GeneratedOperationInputConfigurationError[];
  fieldErrors: Record<string, GeneratedOperationDraftFieldError>;
  input: RecordValues;
  visibleFields: GeneratedOperationInputFieldConfig[];
};

export type GeneratedOperationDraftResolution = {
  configurationErrors: GeneratedOperationInputConfigurationError[];
  fieldErrors: Record<string, GeneratedOperationDraftFieldError>;
  input: RecordValues;
  visibleFields: string[];
};
type GeneratedOperationInputFieldValueResolution =
  | {
      kind: "set";
      value: FieldValue;
    }
  | {
      kind: "omit";
    }
  | {
      kind: "error";
      error: GeneratedOperationDraftFieldError;
    };
export function initialGeneratedOperationDraftSessionState({
  fields,
}: {
  fields: readonly PublicSafeOperationInputField[];
}): GeneratedOperationDraftSessionState {
  return {
    draft: {
      values: Object.fromEntries(
        selectGeneratedOperationInputFieldConfigs(fields).map((fieldConfig) => [
          fieldConfig.inputName,
          initialGeneratedOperationDraftFieldInput(fieldConfig),
        ]),
      ),
    },
  };
}

export function nextGeneratedOperationDraftSessionState({
  inputName,
  inputValue,
  state,
}: {
  inputName: string;
  inputValue: GeneratedOperationDraftFieldInput | undefined;
  state: GeneratedOperationDraftSessionState;
}): GeneratedOperationDraftSessionState {
  const values = { ...state.draft.values };

  if (inputValue === undefined) {
    delete values[inputName];
  } else {
    values[inputName] = inputValue;
  }

  return {
    ...state,
    draft: { values },
  };
}

export function selectGeneratedOperationDraftSession({
  enabled = true,
  fields,
  state,
  unsupportedRequiredInputNames = [],
}: {
  enabled?: boolean;
  fields: readonly PublicSafeOperationInputField[];
  state: GeneratedOperationDraftSessionState;
  unsupportedRequiredInputNames?: readonly string[];
}): GeneratedOperationDraftSessionFacts {
  const visibleFields = selectGeneratedOperationInputFieldConfigs(fields);
  const resolution = resolveGeneratedOperationDraftInput({
    draft: state.draft,
    fields,
    unsupportedRequiredInputNames,
  });

  return {
    canSubmit:
      enabled &&
      resolution.configurationErrors.length === 0 &&
      Object.keys(resolution.fieldErrors).length === 0,
    configurationErrors: resolution.configurationErrors,
    fieldErrors: resolution.fieldErrors,
    input: resolution.input,
    visibleFields,
  };
}

export function resolveGeneratedOperationDraftInput({
  draft,
  fields,
  unsupportedRequiredInputNames = [],
}: {
  draft: GeneratedOperationDraftInput;
  fields: readonly PublicSafeOperationInputField[];
  unsupportedRequiredInputNames?: readonly string[];
}): GeneratedOperationDraftResolution {
  const visibleFields = selectGeneratedOperationInputFieldConfigs(fields);
  const resolution = resolveGeneratedFieldDraftValues({
    draft,
    fields: visibleFields,
    missingDraft: "omit",
  });
  const fieldErrors = { ...resolution.fieldErrors };
  const input: RecordValues = {};

  for (const fieldConfig of visibleFields) {
    if (fieldErrors[fieldConfig.inputName] !== undefined) {
      continue;
    }

    const valueResolution = resolveGeneratedOperationInputFieldValue(
      fieldConfig,
      resolution.values[fieldConfig.inputName],
    );

    if (valueResolution.kind === "error") {
      fieldErrors[fieldConfig.inputName] = valueResolution.error;
      continue;
    }

    if (valueResolution.kind === "set") {
      input[fieldConfig.inputName] = valueResolution.value;
    }
  }

  return {
    configurationErrors: unsupportedRequiredOperationInputConfigurationErrors(
      unsupportedRequiredInputNames,
    ),
    fieldErrors,
    input,
    visibleFields: visibleFields.map((field) => field.inputName),
  };
}

export function selectGeneratedOperationInputFieldConfigs(
  fields: readonly PublicSafeOperationInputField[],
): GeneratedOperationInputFieldConfig[] {
  return fields.map((field) => ({
    ...field,
    editor: generatedOperationInputFieldEditor(field),
    field: generatedOperationInputFieldSchema(field),
    fieldName: field.name,
    inputName: field.name,
  }));
}

export function generatedOperationDraftInput(value: FieldValue): GeneratedOperationDraftFieldInput {
  return generatedFieldDraftInput(value);
}

function initialGeneratedOperationDraftFieldInput(
  fieldConfig: GeneratedOperationInputFieldConfig,
): GeneratedOperationDraftFieldInput {
  if (fieldConfig.field.type === "boolean") {
    return { kind: "value", value: false };
  }

  return { kind: "input", value: "" };
}

function resolveGeneratedOperationInputFieldValue(
  fieldConfig: GeneratedOperationInputFieldConfig,
  value: FieldValue | undefined,
): GeneratedOperationInputFieldValueResolution {
  if (value === undefined) {
    if (fieldConfig.field.type === "boolean") {
      return { kind: "set", value: false };
    }

    return fieldConfig.required
      ? {
          kind: "error",
          error: generatedOperationInputFieldError(
            fieldConfig.inputName,
            `Field "${fieldConfig.inputName}" is required.`,
          ),
        }
      : { kind: "omit" };
  }

  if (fieldConfig.field.type === "text") {
    return resolveGeneratedOperationTextInputFieldValue(fieldConfig, value);
  }

  if (fieldConfig.field.type === "boolean") {
    return typeof value === "boolean"
      ? { kind: "set", value }
      : {
          kind: "error",
          error: generatedOperationInputFieldError(
            fieldConfig.inputName,
            `Field "${fieldConfig.inputName}" must be a boolean.`,
          ),
        };
  }

  if (fieldConfig.field.type === "date") {
    return resolveGeneratedOperationDateInputFieldValue(fieldConfig, value);
  }

  if (fieldConfig.field.type === "number") {
    return resolveGeneratedOperationNumberInputFieldValue(fieldConfig, value);
  }

  if (fieldConfig.field.type === "enum") {
    return resolveGeneratedOperationEnumInputFieldValue(fieldConfig, value);
  }

  return {
    kind: "error",
    error: generatedOperationInputFieldError(
      fieldConfig.inputName,
      `Field "${fieldConfig.inputName}" is not supported by this form.`,
    ),
  };
}

function resolveGeneratedOperationTextInputFieldValue(
  fieldConfig: GeneratedOperationInputFieldConfig,
  value: FieldValue,
): GeneratedOperationInputFieldValueResolution {
  const field = fieldConfig.field;

  if (field.type !== "text") {
    return unsupportedGeneratedOperationInputFieldError(fieldConfig);
  }

  if (typeof value !== "string") {
    return {
      kind: "error",
      error: generatedOperationInputFieldError(
        fieldConfig.inputName,
        `Field "${fieldConfig.inputName}" must be text.`,
      ),
    };
  }

  if (value.trim() === "") {
    return fieldConfig.required
      ? {
          kind: "error",
          error: generatedOperationInputFieldError(
            fieldConfig.inputName,
            `Field "${fieldConfig.inputName}" cannot be empty.`,
          ),
        }
      : { kind: "omit" };
  }

  try {
    const result = validateTextValueForStorage(field, value);

    if (result.kind === "omit") {
      return fieldConfig.required
        ? {
            kind: "error",
            error: generatedOperationInputFieldError(
              fieldConfig.inputName,
              `Field "${fieldConfig.inputName}" cannot be empty.`,
            ),
          }
        : { kind: "omit" };
    }

    return { kind: "set", value: result.value };
  } catch (error) {
    return {
      kind: "error",
      error: generatedOperationInputFieldError(
        fieldConfig.inputName,
        error instanceof Error ? error.message : `Field "${fieldConfig.inputName}" is invalid.`,
      ),
    };
  }
}

function resolveGeneratedOperationDateInputFieldValue(
  fieldConfig: GeneratedOperationInputFieldConfig,
  value: FieldValue,
): GeneratedOperationInputFieldValueResolution {
  if (typeof value !== "string") {
    return {
      kind: "error",
      error: generatedOperationInputFieldError(
        fieldConfig.inputName,
        `Field "${fieldConfig.inputName}" must be a date.`,
      ),
    };
  }

  if (value.trim() === "") {
    return fieldConfig.required
      ? {
          kind: "error",
          error: generatedOperationInputFieldError(
            fieldConfig.inputName,
            `Field "${fieldConfig.inputName}" cannot be empty.`,
          ),
        }
      : { kind: "omit" };
  }

  if (!isValidGeneratedOperationDateInputValue(value)) {
    return {
      kind: "error",
      error: generatedOperationInputFieldError(
        fieldConfig.inputName,
        `Field "${fieldConfig.inputName}" must be a YYYY-MM-DD date.`,
      ),
    };
  }

  return { kind: "set", value };
}

function resolveGeneratedOperationNumberInputFieldValue(
  fieldConfig: GeneratedOperationInputFieldConfig,
  value: FieldValue,
): GeneratedOperationInputFieldValueResolution {
  if (value === "") {
    return fieldConfig.required
      ? {
          kind: "error",
          error: generatedOperationInputFieldError(
            fieldConfig.inputName,
            `Field "${fieldConfig.inputName}" cannot be empty.`,
          ),
        }
      : { kind: "omit" };
  }

  return typeof value === "number" && Number.isFinite(value)
    ? { kind: "set", value }
    : {
        kind: "error",
        error: generatedOperationInputFieldError(fieldConfig.inputName, "Enter a finite number."),
      };
}

function resolveGeneratedOperationEnumInputFieldValue(
  fieldConfig: GeneratedOperationInputFieldConfig,
  value: FieldValue,
): GeneratedOperationInputFieldValueResolution {
  const field = fieldConfig.field;

  if (field.type !== "enum") {
    return unsupportedGeneratedOperationInputFieldError(fieldConfig);
  }

  if (typeof value !== "string") {
    return {
      kind: "error",
      error: generatedOperationInputFieldError(
        fieldConfig.inputName,
        `Field "${fieldConfig.inputName}" must be a known enum value.`,
      ),
    };
  }

  if (value === "") {
    return fieldConfig.required
      ? {
          kind: "error",
          error: generatedOperationInputFieldError(
            fieldConfig.inputName,
            `Field "${fieldConfig.inputName}" cannot be empty.`,
          ),
        }
      : { kind: "omit" };
  }
  return field.values.some((definition) => definition.key === value)
    ? { kind: "set", value }
    : {
        kind: "error",
        error: generatedOperationInputFieldError(
          fieldConfig.inputName,
          `Field "${fieldConfig.inputName}" must be a known enum value.`,
        ),
      };
}

function unsupportedGeneratedOperationInputFieldError(
  fieldConfig: GeneratedOperationInputFieldConfig,
): GeneratedOperationInputFieldValueResolution {
  return {
    kind: "error",
    error: generatedOperationInputFieldError(
      fieldConfig.inputName,
      `Field "${fieldConfig.inputName}" is not supported by this form.`,
    ),
  };
}

function generatedOperationInputFieldSchema(field: PublicSafeOperationInputField): FieldSchema {
  if (field.control === "text" || field.control === "longText") {
    return {
      type: "text",
      required: field.required,
      label: field.label,
      ...(field.control === "longText" && field.format === undefined
        ? { format: "longText" as const }
        : {}),
      ...(field.format === undefined ? {} : { format: field.format }),
      ...(field.suggestions === undefined ? {} : { suggestions: field.suggestions }),
    };
  }

  if (field.control === "boolean") {
    return { type: "boolean", required: field.required, label: field.label };
  }

  if (field.control === "date") {
    return { type: "date", required: field.required, label: field.label };
  }

  if (field.control === "number") {
    return { type: "number", required: field.required, label: field.label };
  }

  return {
    type: "enum",
    required: field.required,
    label: field.label,
    values: (field.options ?? []).map((option) => ({
      key: option.value,
      label: option.label,
    })),
  };
}
function generatedOperationInputFieldEditor(field: PublicSafeOperationInputField): FieldEditor {
  if (field.control === "longText") {
    return "textarea";
  }

  if (field.control === "boolean") {
    return "boolean";
  }

  if (field.control === "date") {
    return "date";
  }

  if (field.control === "number") {
    return "number";
  }

  if (field.control === "enum") {
    return "enum";
  }

  return "text";
}

function unsupportedRequiredOperationInputConfigurationErrors(
  unsupportedRequiredInputNames: readonly string[],
): GeneratedOperationInputConfigurationError[] {
  return unsupportedRequiredInputNames.map((inputName) => ({
    inputName,
    message: `Public operation input field "${inputName}" is required but is not supported by generated public forms.`,
  }));
}

function generatedOperationInputFieldError(
  inputName: string,
  message: string,
): GeneratedOperationDraftFieldError {
  return {
    fieldName: inputName,
    message,
  };
}

function isValidGeneratedOperationDateInputValue(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}
