import { createInputValueToFieldValue } from "./field-types.ts";
import type { FieldSchema, FieldValue, FieldVisibilityValue, RecordValues } from "./types.ts";

export type GeneratedFieldDraftInput =
  | {
      kind: "input";
      value: string;
    }
  | {
      kind: "value";
      value: FieldValue;
    };

export type GeneratedFieldDraft = {
  values: Record<string, GeneratedFieldDraftInput>;
};

export type GeneratedFieldDraftFieldConfig = {
  fieldName: string;
  field: FieldSchema;
};

export type GeneratedFieldDraftError = {
  fieldName: string;
  message: string;
  draftValue?: GeneratedFieldDraftInput;
};

export type GeneratedFieldDraftResolution = {
  values: RecordValues;
  fieldErrors: Record<string, GeneratedFieldDraftError>;
};
export type GeneratedFieldDraftValueResolution =
  | {
      kind: "value";
      value: FieldValue;
    }
  | {
      kind: "omit";
    }
  | {
      kind: "error";
      error: GeneratedFieldDraftError;
    };
export function generatedFieldDraftInput(value: FieldVisibilityValue): GeneratedFieldDraftInput {
  if (typeof value === "boolean" || typeof value === "number") {
    return { kind: "value", value };
  }

  return { kind: "input", value };
}

export function generatedFieldDraftInputFromNativeFormData(
  formData: FormData,
  fields: readonly GeneratedFieldDraftFieldConfig[] = [],
): GeneratedFieldDraft {
  const values: Record<string, GeneratedFieldDraftInput> = {};
  const fieldsByName = new Map(fields.map((field) => [field.fieldName, field]));

  formData.forEach((formValue, fieldName) => {
    const field = fieldsByName.get(fieldName);

    if (field?.field.type === "boolean") {
      const value = typeof formValue === "string" ? formValue : "";
      const draftValue = value === "false" ? false : true;

      if (!Object.hasOwn(values, fieldName) || draftValue) {
        values[fieldName] = { kind: "value", value: draftValue };
      }

      return;
    }

    if (Object.hasOwn(values, fieldName)) {
      return;
    }

    values[fieldName] = {
      kind: "input",
      value: typeof formValue === "string" ? formValue : "",
    };
  });

  return { values };
}

export function resolveGeneratedFieldDraftValues<TField extends GeneratedFieldDraftFieldConfig>({
  draft,
  fields,
  missingDraft = "field-default",
}: {
  draft: GeneratedFieldDraft;
  fields: readonly TField[];
  missingDraft?: "field-default" | "omit";
}): GeneratedFieldDraftResolution {
  const values: RecordValues = {};
  const fieldErrors: Record<string, GeneratedFieldDraftError> = {};

  for (const { field, fieldName } of fields) {
    const fieldResult = resolveGeneratedFieldDraftValue({
      draftValue: draft.values[fieldName],
      field,
      fieldName,
      missingDraft,
    });

    if (fieldResult.kind === "error") {
      fieldErrors[fieldName] = fieldResult.error;
      continue;
    }

    if (fieldResult.kind === "value") {
      values[fieldName] = fieldResult.value;
    }
  }

  return { values, fieldErrors };
}

export function resolveGeneratedFieldDraftValue({
  draftValue,
  field,
  fieldName,
  missingDraft = "field-default",
}: {
  draftValue: GeneratedFieldDraftInput | undefined;
  field: FieldSchema;
  fieldName: string;
  missingDraft?: "field-default" | "omit";
}): GeneratedFieldDraftValueResolution {
  if (draftValue === undefined && missingDraft === "omit") {
    return { kind: "omit" };
  }

  const fieldValue =
    draftValue === undefined
      ? createInputValueToFieldValue(field, undefined, false)
      : generatedFieldDraftInputToFieldValue(field, draftValue);

  if (field.type === "number" && typeof fieldValue === "number" && !Number.isFinite(fieldValue)) {
    return {
      kind: "error",
      error: {
        fieldName,
        message: "Enter a finite number.",
        ...(draftValue === undefined ? {} : { draftValue }),
      },
    };
  }

  return { kind: "value", value: fieldValue };
}

export function generatedFieldDraftVisibilityValue(
  draftValue: GeneratedFieldDraftInput | undefined,
): FieldVisibilityValue | undefined {
  if (draftValue === undefined) {
    return undefined;
  }

  return draftValue.value;
}

export function throwIfGeneratedFieldDraftHasErrors(result: {
  fieldErrors: Record<string, GeneratedFieldDraftError>;
}) {
  const firstError = Object.values(result.fieldErrors)[0];

  if (firstError !== undefined) {
    throw new Error(firstError.message);
  }
}

function generatedFieldDraftInputToFieldValue(
  field: FieldSchema,
  draftValue: GeneratedFieldDraftInput,
): FieldValue {
  if (draftValue.kind === "input") {
    return createInputValueToFieldValue(field, draftValue.value, true);
  }

  if (field.type === "boolean" && typeof draftValue.value === "boolean") {
    return draftValue.value;
  }

  if (field.type === "number") {
    if (typeof draftValue.value === "number" || draftValue.value === "") {
      return draftValue.value;
    }

    if (typeof draftValue.value === "string") {
      return createInputValueToFieldValue(field, draftValue.value, true);
    }

    return createInputValueToFieldValue(field, String(draftValue.value), true);
  }

  if (typeof draftValue.value === "string") {
    return createInputValueToFieldValue(field, draftValue.value, true);
  }

  return createInputValueToFieldValue(field, String(draftValue.value), true);
}
