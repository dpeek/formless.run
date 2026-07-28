import type {
  CreateDefaultConfig,
  CreateFieldConfig,
  CreateUnionPresentationConfig,
} from "../../client/views.ts";
import {
  createDefaultsAreResolved,
  fieldCreateDefaultValue,
  fieldHasCreateDefault,
  generatedFieldDraftInput,
  initialCreateDiscriminatorValue,
  resolveCreateDraftValues as resolveCreateDefaultDraftValues,
  resolveCreateValues as resolveCreateDefaultValues,
  selectCreateFieldsForDraftInput,
  validateTextValueForStorage,
  type CreateDraftFieldError,
  type CreateDraftFieldInput,
  type CreateDraftInput,
} from "@dpeek/formless-schema";
import type { FieldValue, RecordValues } from "@dpeek/formless-storage";
import type { QueryEvaluationContext } from "@dpeek/formless-schema";

export type GeneratedCreateDraftSessionState = {
  draft: CreateDraftInput;
  submitAttempted: boolean;
};

export type GeneratedCreateDraftSessionFacts = {
  canSubmit: boolean;
  defaultsResolved: boolean;
  fieldErrors: Record<string, CreateDraftFieldError>;
  values: RecordValues;
  visibleFields: CreateFieldConfig[];
};

export function initialGeneratedCreateDraftSessionState({
  defaults = [],
  fields = [],
  union,
}: {
  defaults?: CreateDefaultConfig[];
  fields?: CreateFieldConfig[];
  union?: CreateUnionPresentationConfig;
}): GeneratedCreateDraftSessionState {
  return {
    draft: {
      values: Object.fromEntries(
        collectCreateDraftFields(fields, union).flatMap((fieldConfig) => {
          const draftValue = initialCreateDraftFieldInput(fieldConfig, union, defaults);

          return draftValue === undefined ? [] : [[fieldConfig.fieldName, draftValue]];
        }),
      ),
    },
    submitAttempted: false,
  };
}

export function markGeneratedCreateDraftSessionSubmitted(
  state: GeneratedCreateDraftSessionState,
): GeneratedCreateDraftSessionState {
  return {
    ...state,
    submitAttempted: true,
  };
}

export function selectGeneratedCreateDraftSession({
  defaults = [],
  enabled,
  fields,
  queryContext,
  state,
  union,
}: {
  defaults?: CreateDefaultConfig[];
  enabled: boolean;
  fields: CreateFieldConfig[];
  queryContext?: QueryEvaluationContext;
  state: GeneratedCreateDraftSessionState;
  union?: CreateUnionPresentationConfig;
}): GeneratedCreateDraftSessionFacts {
  const visibleFields = selectCreateFieldsForDraftInput(
    fields,
    union,
    state.draft,
    defaults,
    queryContext,
  );
  const resolution = resolveCreateDefaultDraftValues({
    defaults,
    draft: state.draft,
    fields,
    queryContext,
    union,
  });
  const formatErrors = withTextFormatCreateDraftFieldErrors(
    resolution.fieldErrors,
    visibleFields,
    resolution.values,
  );
  const fieldErrors = state.submitAttempted
    ? withRequiredCreateDraftFieldErrors(formatErrors, visibleFields, resolution.values)
    : formatErrors;
  const defaultsResolved = createDefaultsAreResolved(defaults, queryContext);

  return {
    canSubmit: enabled && defaultsResolved && Object.keys(fieldErrors).length === 0,
    defaultsResolved,
    fieldErrors,
    values: resolution.values,
    visibleFields,
  };
}

export function nextGeneratedCreateDraftSessionState({
  fieldName,
  fieldValue,
  state,
}: {
  fieldName: string;
  fieldValue: CreateDraftFieldInput;
  state: GeneratedCreateDraftSessionState;
}): GeneratedCreateDraftSessionState {
  return {
    ...state,
    draft: {
      values: {
        ...state.draft.values,
        [fieldName]: fieldValue,
      },
    },
  };
}

export { generatedFieldDraftInput };

export function resolveGeneratedCreateValues({
  defaults = [],
  fields,
  formData,
  queryContext,
  union,
}: {
  defaults?: CreateDefaultConfig[];
  fields: CreateFieldConfig[];
  formData: FormData;
  queryContext?: QueryEvaluationContext;
  union?: CreateUnionPresentationConfig;
}): RecordValues {
  return resolveCreateDefaultValues({
    defaults,
    fields,
    formData,
    queryContext,
    union,
  });
}

function collectCreateDraftFields(
  fields: CreateFieldConfig[],
  union: CreateUnionPresentationConfig | undefined,
): CreateFieldConfig[] {
  const fieldsByName = new Map<string, CreateFieldConfig>();
  const addFields = (nextFields: CreateFieldConfig[]) => {
    for (const field of nextFields) {
      if (!fieldsByName.has(field.fieldName)) {
        fieldsByName.set(field.fieldName, field);
      }
    }
  };

  addFields(fields);

  for (const variant of union?.variants ?? []) {
    addFields(variant.presentation.fields);
  }

  if (union?.fallback !== undefined) {
    addFields(union.fallback.presentation.fields);
  }

  return Array.from(fieldsByName.values());
}

function initialCreateDraftFieldInput(
  fieldConfig: CreateFieldConfig,
  union: CreateUnionPresentationConfig | undefined,
  defaults: CreateDefaultConfig[],
): CreateDraftFieldInput | undefined {
  if (fieldConfig.stateMachine !== undefined) {
    return { kind: "value", value: fieldConfig.stateMachine.initialState };
  }

  if (fieldConfig.fieldName === union?.discriminatorFieldName) {
    const discriminatorValue = initialCreateDiscriminatorValue(union, defaults);

    return discriminatorValue === undefined
      ? undefined
      : { kind: "value", value: discriminatorValue };
  }

  if (fieldHasCreateDefault(fieldConfig.field)) {
    const value = fieldCreateDefaultValue(fieldConfig.field);

    return value === undefined ? undefined : { kind: "value", value };
  }

  if (fieldConfig.field.type === "boolean") {
    return { kind: "value", value: false };
  }
  if (fieldConfig.field.type === "enum") {
    const value = fieldConfig.field.required ? fieldConfig.field.values[0]?.key : "";
    return value === undefined ? undefined : { kind: "value", value };
  }
  if (fieldConfig.field.type === "reference" && !fieldConfig.field.required) {
    return { kind: "value", value: "" };
  }

  return undefined;
}

function withRequiredCreateDraftFieldErrors(
  fieldErrors: Record<string, CreateDraftFieldError>,
  visibleFields: CreateFieldConfig[],
  values: RecordValues,
): Record<string, CreateDraftFieldError> {
  const nextErrors = { ...fieldErrors };

  for (const fieldConfig of visibleFields) {
    if (!fieldConfig.field.required || nextErrors[fieldConfig.fieldName] !== undefined) {
      continue;
    }

    const value = values[fieldConfig.fieldName];

    if (!createDraftFieldValueIsEmpty(fieldConfig.field.type, value)) {
      continue;
    }

    nextErrors[fieldConfig.fieldName] = {
      fieldName: fieldConfig.fieldName,
      message:
        value === undefined
          ? `Field "${fieldConfig.fieldName}" is required.`
          : `Field "${fieldConfig.fieldName}" cannot be empty.`,
    };
  }

  return nextErrors;
}

function withTextFormatCreateDraftFieldErrors(
  fieldErrors: Record<string, CreateDraftFieldError>,
  visibleFields: CreateFieldConfig[],
  values: RecordValues,
): Record<string, CreateDraftFieldError> {
  const nextErrors = { ...fieldErrors };

  for (const fieldConfig of visibleFields) {
    const value = values[fieldConfig.fieldName];
    if (
      fieldConfig.field.type !== "text" ||
      typeof value !== "string" ||
      nextErrors[fieldConfig.fieldName] !== undefined
    ) {
      continue;
    }

    try {
      validateTextValueForStorage(fieldConfig.field, value);
    } catch (error) {
      nextErrors[fieldConfig.fieldName] = {
        fieldName: fieldConfig.fieldName,
        message:
          error instanceof Error ? error.message : `Field "${fieldConfig.fieldName}" is invalid.`,
      };
    }
  }

  return nextErrors;
}

function createDraftFieldValueIsEmpty(
  fieldType: CreateFieldConfig["field"]["type"],
  value: FieldValue | undefined,
) {
  if (fieldType === "boolean") {
    return false;
  }

  return value === undefined || (typeof value === "string" && value.trim() === "");
}
