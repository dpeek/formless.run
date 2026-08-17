import {
  generatedFieldDraftInput,
  resolveGeneratedFieldDraftValues,
  validateAuthorityFieldValue,
  type GeneratedFieldDraft,
  type GeneratedFieldDraftError,
  type GeneratedFieldDraftInput,
} from "@dpeek/formless-schema";
import type { RecordValues } from "@dpeek/formless-storage";
import type {
  GeneratedCommandInputFieldConfig,
  GeneratedCommandInputForm,
} from "./operation-control-model.ts";

export type GeneratedCommandDraftSessionState = {
  draft: GeneratedFieldDraft;
  submitAttempted: boolean;
};

export type GeneratedCommandDraftSessionFacts = {
  canSubmit: boolean;
  fieldErrors: Record<string, GeneratedFieldDraftError>;
  input: RecordValues;
  valid: boolean;
  visibleFields: readonly GeneratedCommandInputFieldConfig[];
};

export function initialGeneratedCommandDraftSessionState(
  form: GeneratedCommandInputForm,
  options: {
    currentInstant?: Date;
  } = {},
): GeneratedCommandDraftSessionState {
  return {
    draft: {
      values: Object.fromEntries(
        form.fields.map((field) => [
          field.inputName,
          initialGeneratedCommandDraftFieldInput(field, options.currentInstant),
        ]),
      ),
    },
    submitAttempted: false,
  };
}

function initialGeneratedCommandDraftFieldInput(
  field: GeneratedCommandInputFieldConfig,
  currentInstant: Date | undefined,
): GeneratedFieldDraftInput {
  if (field.default !== undefined && currentInstant !== undefined) {
    return generatedFieldDraftInput(
      calendarDateForGeneratedOperationInputDefault(field.default.timeZone, currentInstant),
    );
  }

  return field.field.type === "boolean"
    ? generatedFieldDraftInput(false)
    : generatedFieldDraftInput("");
}

function calendarDateForGeneratedOperationInputDefault(
  timeZone: string,
  currentInstant: Date,
): string {
  if (Number.isNaN(currentInstant.valueOf())) {
    throw new Error("Generated operation input default requires a valid current instant.");
  }

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US-u-ca-iso8601-nu-latn", {
      day: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric",
    }).formatToParts(currentInstant);
  } catch {
    throw new Error(`Generated operation input default time zone "${timeZone}" is not resolvable.`);
  }

  const calendarParts = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = calendarParts.year;
  const month = calendarParts.month;
  const day = calendarParts.day;
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error("Generated operation input default could not resolve calendar date parts.");
  }

  return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function markGeneratedCommandDraftSessionSubmitted(
  state: GeneratedCommandDraftSessionState,
): GeneratedCommandDraftSessionState {
  return {
    ...state,
    submitAttempted: true,
  };
}

export function nextGeneratedCommandDraftSessionState(input: {
  inputName: string;
  inputValue: GeneratedFieldDraftInput | undefined;
  state: GeneratedCommandDraftSessionState;
}): GeneratedCommandDraftSessionState {
  const values = { ...input.state.draft.values };
  if (input.inputValue === undefined) {
    delete values[input.inputName];
  } else {
    values[input.inputName] = input.inputValue;
  }

  return { ...input.state, draft: { values } };
}

export function selectGeneratedCommandDraftSession(input: {
  enabled?: boolean;
  form: GeneratedCommandInputForm;
  state: GeneratedCommandDraftSessionState;
}): GeneratedCommandDraftSessionFacts {
  const resolution = resolveGeneratedFieldDraftValues({
    draft: input.state.draft,
    fields: input.form.fields,
    missingDraft: "omit",
  });
  const fieldErrors = { ...resolution.fieldErrors };
  const values: RecordValues = {};

  for (const fieldConfig of input.form.fields) {
    if (fieldErrors[fieldConfig.inputName] !== undefined) {
      continue;
    }

    const provided = Object.hasOwn(input.state.draft.values, fieldConfig.inputName);
    const value = resolution.values[fieldConfig.inputName];

    try {
      const validated = validateAuthorityFieldValue(
        fieldConfig.inputName,
        fieldConfig.field,
        value,
        provided,
      );
      if (validated.kind === "omit") {
        continue;
      }
      if (fieldConfig.mustBeTrue && validated.value !== true) {
        throw new Error(`Field "${fieldConfig.inputName}" must be accepted.`);
      }
      values[fieldConfig.inputName] = validated.value;
    } catch (error) {
      fieldErrors[fieldConfig.inputName] = {
        fieldName: fieldConfig.inputName,
        message:
          error instanceof Error ? error.message : `Field "${fieldConfig.inputName}" is invalid.`,
        ...(input.state.draft.values[fieldConfig.inputName] === undefined
          ? {}
          : { draftValue: input.state.draft.values[fieldConfig.inputName] }),
      };
    }
  }

  const visibleFieldErrors = input.state.submitAttempted
    ? fieldErrors
    : Object.fromEntries(
        Object.entries(fieldErrors).filter(([inputName]) => {
          const fieldConfig = input.form.fields.find((field) => field.inputName === inputName);
          return (
            fieldConfig === undefined ||
            !commandFieldIsMissingRequiredValue(fieldConfig, input.state)
          );
        }),
      );

  return {
    canSubmit: (input.enabled ?? true) && Object.keys(visibleFieldErrors).length === 0,
    fieldErrors: visibleFieldErrors,
    input: values,
    valid: Object.keys(fieldErrors).length === 0,
    visibleFields: input.form.fields,
  };
}

function commandFieldIsMissingRequiredValue(
  fieldConfig: GeneratedCommandInputFieldConfig,
  state: GeneratedCommandDraftSessionState,
): boolean {
  if (!fieldConfig.field.required || fieldConfig.field.type === "boolean") {
    return false;
  }

  const value = state.draft.values[fieldConfig.inputName]?.value;
  return value === undefined || (typeof value === "string" && value.trim() === "");
}
