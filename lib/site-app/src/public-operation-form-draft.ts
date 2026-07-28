import type { SitePublicOperationInputFieldNode } from "./types.ts";
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
} from "@dpeek/formless-schema";
import {
  type PublicOperationInputValue,
  type PublicOperationInputValues,
} from "@dpeek/formless-public-operations";

export type PublicOperationFormInputValue = PublicOperationInputValue;
export type PublicOperationFormInputValues = PublicOperationInputValues;
export type PublicOperationFormDraftFieldInput = GeneratedFieldDraftInput;
export type PublicOperationFormDraftInput = GeneratedFieldDraft;
export type PublicOperationFormDraftFieldError = GeneratedFieldDraftError;

export type PublicOperationFormInputFieldConfig = SitePublicOperationInputFieldNode & {
  editor: FieldEditor;
  field: FieldSchema;
  fieldName: string;
  inputName: string;
};

export type PublicOperationFormDraftSessionState = {
  draft: PublicOperationFormDraftInput;
};

export type PublicOperationFormDraftSessionFacts = {
  canSubmit: boolean;
  fieldErrors: Record<string, PublicOperationFormDraftFieldError>;
  input: PublicOperationFormInputValues;
  visibleFields: PublicOperationFormInputFieldConfig[];
};

type PublicOperationFormInputFieldValueResolution =
  | {
      kind: "set";
      value: PublicOperationFormInputValue;
    }
  | {
      kind: "omit";
    }
  | {
      kind: "error";
      error: PublicOperationFormDraftFieldError;
    };

export function initialPublicOperationFormDraftSessionState({
  fields,
}: {
  fields: readonly SitePublicOperationInputFieldNode[];
}): PublicOperationFormDraftSessionState {
  return {
    draft: {
      values: Object.fromEntries(
        publicOperationFormInputFieldConfigs(fields).map((fieldConfig) => [
          fieldConfig.inputName,
          initialPublicOperationFormDraftFieldInput(fieldConfig),
        ]),
      ),
    },
  };
}

export function nextPublicOperationFormDraftSessionState({
  inputName,
  inputValue,
  state,
}: {
  inputName: string;
  inputValue: PublicOperationFormDraftFieldInput | undefined;
  state: PublicOperationFormDraftSessionState;
}): PublicOperationFormDraftSessionState {
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

export function selectPublicOperationFormDraftSession({
  enabled = true,
  fields,
  state,
}: {
  enabled?: boolean;
  fields: readonly SitePublicOperationInputFieldNode[];
  state: PublicOperationFormDraftSessionState;
}): PublicOperationFormDraftSessionFacts {
  const visibleFields = publicOperationFormInputFieldConfigs(fields);
  const resolution = resolvePublicOperationFormDraftInput({
    draft: state.draft,
    fields,
  });

  return {
    canSubmit: enabled && Object.keys(resolution.fieldErrors).length === 0,
    fieldErrors: resolution.fieldErrors,
    input: resolution.input,
    visibleFields,
  };
}

export function resolvePublicOperationFormDraftInput({
  draft,
  fields,
}: {
  draft: PublicOperationFormDraftInput;
  fields: readonly SitePublicOperationInputFieldNode[];
}): {
  fieldErrors: Record<string, PublicOperationFormDraftFieldError>;
  input: PublicOperationFormInputValues;
  visibleFields: string[];
} {
  const visibleFields = publicOperationFormInputFieldConfigs(fields);
  const resolution = resolveGeneratedFieldDraftValues({
    draft,
    fields: visibleFields,
    missingDraft: "omit",
  });
  const fieldErrors = { ...resolution.fieldErrors };
  const input: PublicOperationFormInputValues = {};

  for (const fieldConfig of visibleFields) {
    if (fieldErrors[fieldConfig.inputName] !== undefined) {
      continue;
    }

    const valueResolution = resolvePublicOperationFormInputFieldValue(
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
    fieldErrors,
    input,
    visibleFields: visibleFields.map((field) => field.inputName),
  };
}

export function publicOperationFormDraftInput(
  value: FieldValue,
): PublicOperationFormDraftFieldInput {
  return generatedFieldDraftInput(value);
}

export function publicOperationFormInputFieldConfigs(
  fields: readonly SitePublicOperationInputFieldNode[],
): PublicOperationFormInputFieldConfig[] {
  return fields.map((field) => ({
    ...field,
    editor: publicOperationFormInputFieldEditor(field),
    field: publicOperationFormInputFieldSchema(field),
    fieldName: field.name,
    inputName: field.name,
  }));
}

function initialPublicOperationFormDraftFieldInput(
  fieldConfig: PublicOperationFormInputFieldConfig,
): PublicOperationFormDraftFieldInput {
  if (fieldConfig.field.type === "boolean") {
    return { kind: "value", value: false };
  }

  return { kind: "input", value: "" };
}

function resolvePublicOperationFormInputFieldValue(
  fieldConfig: PublicOperationFormInputFieldConfig,
  value: FieldValue | undefined,
): PublicOperationFormInputFieldValueResolution {
  if (value === undefined) {
    if (fieldConfig.field.type === "boolean") {
      return resolvePublicOperationFormBooleanInputFieldValue(fieldConfig, false);
    }

    return fieldConfig.required
      ? {
          kind: "error",
          error: publicOperationFormInputFieldError(
            fieldConfig.inputName,
            `Field "${fieldConfig.inputName}" is required.`,
          ),
        }
      : { kind: "omit" };
  }

  switch (fieldConfig.control) {
    case "text":
    case "longText":
      return resolvePublicOperationFormTextInputFieldValue(fieldConfig, value);
    case "boolean":
      return resolvePublicOperationFormBooleanInputFieldValue(fieldConfig, value);
    case "date":
      return resolvePublicOperationFormDateInputFieldValue(fieldConfig, value);
    case "number":
      return resolvePublicOperationFormNumberInputFieldValue(fieldConfig, value);
    case "enum":
      return resolvePublicOperationFormEnumInputFieldValue(fieldConfig, value);
  }
}

function resolvePublicOperationFormBooleanInputFieldValue(
  fieldConfig: PublicOperationFormInputFieldConfig,
  value: FieldValue,
): PublicOperationFormInputFieldValueResolution {
  if (typeof value !== "boolean") {
    return {
      kind: "error",
      error: publicOperationFormInputFieldError(
        fieldConfig.inputName,
        `Field "${fieldConfig.inputName}" must be a boolean.`,
      ),
    };
  }

  if (fieldConfig.mustBeTrue && !value) {
    return {
      kind: "error",
      error: publicOperationFormInputFieldError(
        fieldConfig.inputName,
        `Field "${fieldConfig.inputName}" must be accepted.`,
      ),
    };
  }

  return { kind: "set", value };
}

function resolvePublicOperationFormTextInputFieldValue(
  fieldConfig: PublicOperationFormInputFieldConfig,
  value: FieldValue,
): PublicOperationFormInputFieldValueResolution {
  if (typeof value !== "string") {
    return {
      kind: "error",
      error: publicOperationFormInputFieldError(
        fieldConfig.inputName,
        `Field "${fieldConfig.inputName}" must be text.`,
      ),
    };
  }

  if (value.trim() === "") {
    return fieldConfig.required
      ? {
          kind: "error",
          error: publicOperationFormInputFieldError(
            fieldConfig.inputName,
            `Field "${fieldConfig.inputName}" cannot be empty.`,
          ),
        }
      : { kind: "omit" };
  }

  try {
    const result = validateTextValueForStorage({ format: fieldConfig.format }, value);

    return result.kind === "set"
      ? {
          kind: "set",
          value: result.value,
        }
      : { kind: "omit" };
  } catch (error) {
    return {
      kind: "error",
      error: publicOperationFormInputFieldError(
        fieldConfig.inputName,
        error instanceof Error ? error.message : `Field "${fieldConfig.inputName}" is invalid.`,
      ),
    };
  }
}

function resolvePublicOperationFormDateInputFieldValue(
  fieldConfig: PublicOperationFormInputFieldConfig,
  value: FieldValue,
): PublicOperationFormInputFieldValueResolution {
  if (typeof value !== "string") {
    return {
      kind: "error",
      error: publicOperationFormInputFieldError(
        fieldConfig.inputName,
        `Field "${fieldConfig.inputName}" must be a date.`,
      ),
    };
  }

  if (value.trim() === "") {
    return fieldConfig.required
      ? {
          kind: "error",
          error: publicOperationFormInputFieldError(
            fieldConfig.inputName,
            `Field "${fieldConfig.inputName}" cannot be empty.`,
          ),
        }
      : { kind: "omit" };
  }

  return isValidPublicOperationFormDateInputValue(value)
    ? {
        kind: "set",
        value,
      }
    : {
        kind: "error",
        error: publicOperationFormInputFieldError(
          fieldConfig.inputName,
          `Field "${fieldConfig.inputName}" must be a YYYY-MM-DD date.`,
        ),
      };
}

function resolvePublicOperationFormNumberInputFieldValue(
  fieldConfig: PublicOperationFormInputFieldConfig,
  value: FieldValue,
): PublicOperationFormInputFieldValueResolution {
  if (value === "") {
    return fieldConfig.required
      ? {
          kind: "error",
          error: publicOperationFormInputFieldError(
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
        error: publicOperationFormInputFieldError(fieldConfig.inputName, "Enter a finite number."),
      };
}

function resolvePublicOperationFormEnumInputFieldValue(
  fieldConfig: PublicOperationFormInputFieldConfig,
  value: FieldValue,
): PublicOperationFormInputFieldValueResolution {
  if (typeof value !== "string") {
    return {
      kind: "error",
      error: publicOperationFormInputFieldError(
        fieldConfig.inputName,
        `Field "${fieldConfig.inputName}" must be a known enum value.`,
      ),
    };
  }

  if (value === "") {
    return fieldConfig.required
      ? {
          kind: "error",
          error: publicOperationFormInputFieldError(
            fieldConfig.inputName,
            `Field "${fieldConfig.inputName}" cannot be empty.`,
          ),
        }
      : { kind: "omit" };
  }

  return fieldConfig.options?.some((option) => option.value === value) === true
    ? { kind: "set", value }
    : {
        kind: "error",
        error: publicOperationFormInputFieldError(
          fieldConfig.inputName,
          `Field "${fieldConfig.inputName}" must be a known enum value.`,
        ),
      };
}

function publicOperationFormInputFieldSchema(
  field: SitePublicOperationInputFieldNode,
): FieldSchema {
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

function publicOperationFormInputFieldEditor(
  field: SitePublicOperationInputFieldNode,
): FieldEditor {
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

function publicOperationFormInputFieldError(
  inputName: string,
  message: string,
): PublicOperationFormDraftFieldError {
  return {
    fieldName: inputName,
    message,
  };
}

function isValidPublicOperationFormDateInputValue(value: string): boolean {
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
