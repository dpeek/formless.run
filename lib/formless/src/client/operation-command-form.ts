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
};

export type GeneratedCommandDraftSessionFacts = {
  canSubmit: boolean;
  fieldErrors: Record<string, GeneratedFieldDraftError>;
  input: RecordValues;
  visibleFields: readonly GeneratedCommandInputFieldConfig[];
};

export function initialGeneratedCommandDraftSessionState(
  form: GeneratedCommandInputForm,
): GeneratedCommandDraftSessionState {
  return {
    draft: {
      values: Object.fromEntries(
        form.fields.map((field) => [
          field.inputName,
          field.field.type === "boolean"
            ? generatedFieldDraftInput(false)
            : generatedFieldDraftInput(""),
        ]),
      ),
    },
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

  return { draft: { values } };
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

  return {
    canSubmit: (input.enabled ?? true) && Object.keys(fieldErrors).length === 0,
    fieldErrors,
    input: values,
    visibleFields: input.form.fields,
  };
}
