import { isDateString } from "./date.ts";
import { fieldCreateDefaultValue, fieldHasCreateDefault } from "./field-types.ts";
import {
  generatedFieldDraftInputFromNativeFormData,
  generatedFieldDraftVisibilityValue,
  resolveGeneratedFieldDraftValues,
  throwIfGeneratedFieldDraftHasErrors,
  type GeneratedFieldDraft,
  type GeneratedFieldDraftError,
  type GeneratedFieldDraftFieldConfig,
  type GeneratedFieldDraftInput,
} from "./field-drafts.ts";
import type { RecordValues } from "./types.ts";
import type { QueryEvaluationContext } from "./types.ts";
import { assertExactKeys, definitionsToRecord, isRecord } from "./schema-parse-helpers.ts";
import type {
  CreateDefaultValueSchema,
  CreateViewFieldBindingSchema,
  CreateViewSchema,
  EntitySchema,
  FieldVisibilityConditionSchema,
  FieldVisibilityValue,
  FieldSchema,
} from "./types.ts";

export type CreateDefaultFieldConfig = {
  fieldName: string;
  field: FieldSchema;
  visibleWhen?: FieldVisibilityConditionSchema;
};

export type CreateDefaultConfig = CreateDefaultFieldConfig & {
  value: CreateDefaultValueSchema;
};

export type CreateDraftFieldInput = GeneratedFieldDraftInput;

export type CreateDraftInput = GeneratedFieldDraft;

export type CreateDraftFieldError = GeneratedFieldDraftError;

export type CreateDraftResolution = {
  values: RecordValues;
  fieldErrors: Record<string, CreateDraftFieldError>;
  visibleFields: string[];
};
export type CreateDefaultUnionConfig<TField extends CreateDefaultFieldConfig> = {
  discriminatorFieldName: string;
  discriminatorField: Extract<
    FieldSchema,
    {
      type: "enum";
    }
  >;
  variants: Array<{
    variantValue: string;
    presentation: {
      fields: TField[];
    };
  }>;
  fallback?: {
    presentation: {
      fields: TField[];
    };
  };
};

export function parseCreateViewDefaults(
  viewName: string,
  entityName: string,
  value: unknown,
  entity: EntitySchema,
  fields: CreateViewFieldBindingSchema[],
): Record<string, CreateDefaultValueSchema> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`Create view "${viewName}" defaults must be an object.`);
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    throw new Error(`Create view "${viewName}" defaults must not be empty.`);
  }

  return Object.fromEntries(
    entries.map(([fieldName, defaultValue]) => [
      fieldName,
      parseCreateViewDefault(viewName, entityName, fieldName, defaultValue, entity, fields),
    ]),
  );
}

export function createViewRequiresContextDefaults(createView: CreateViewSchema) {
  return createViewContextDefaultEntries(createView).length > 0;
}
export function createViewContextDefaultEntries(createView: CreateViewSchema) {
  return Object.entries(createView.defaults ?? {}).filter(
    (
      entry,
    ): entry is [
      string,
      Extract<
        CreateDefaultValueSchema,
        {
          kind: "context";
        }
      >,
    ] => entry[1].kind === "context",
  );
}
export function assertCreateViewIncludesRequiredFields(
  viewName: string,
  fields: CreateViewFieldBindingSchema[],
  defaults: Record<string, CreateDefaultValueSchema>,
  entity: EntitySchema,
) {
  const fieldsByName = new Set(fields.map((field) => field.field));
  for (const field of entity.fields) {
    const fieldName = field.key;
    if (
      field.required &&
      !fieldsByName.has(fieldName) &&
      !(fieldName in defaults) &&
      !fieldHasCreateDefault(field)
    ) {
      throw new Error(`Create view "${viewName}" must include required field "${fieldName}".`);
    }
  }
}

export function resolveCreateValues<TField extends CreateDefaultFieldConfig>({
  defaults = [],
  fields,
  formData,
  queryContext,
  union,
}: {
  formData: FormData;
  fields: TField[];
  union?: CreateDefaultUnionConfig<TField>;
  defaults?: CreateDefaultConfig[];
  queryContext?: QueryEvaluationContext;
}): RecordValues {
  const result = resolveCreateDraftValues({
    defaults,
    draft: generatedFieldDraftInputFromNativeFormData(
      formData,
      collectCreateDefaultFields(fields, union),
    ),
    fields,
    queryContext,
    union,
  });

  throwIfCreateDraftHasFieldErrors(result);

  return result.values;
}

export function resolveCreateDraftValues<TField extends CreateDefaultFieldConfig>({
  defaults = [],
  draft,
  fields,
  queryContext,
  union,
}: {
  draft: CreateDraftInput;
  fields: TField[];
  union?: CreateDefaultUnionConfig<TField>;
  defaults?: CreateDefaultConfig[];
  queryContext?: QueryEvaluationContext;
}): CreateDraftResolution {
  const visibleFields = selectCreateFieldsForDraftInput(
    fields,
    union,
    draft,
    defaults,
    queryContext,
  );
  const { fieldErrors, values } = getVisibleCreateDraftValues(draft, visibleFields);
  const defaultResult = applyCreateDraftDefaultValues(values, defaults, queryContext);

  return {
    values: defaultResult.values,
    fieldErrors: {
      ...fieldErrors,
      ...defaultResult.fieldErrors,
    },
    visibleFields: visibleFields.map((field) => field.fieldName),
  };
}

export function applyCreateDefaultValues(
  values: RecordValues,
  defaults: CreateDefaultConfig[],
  queryContext?: QueryEvaluationContext,
): RecordValues {
  const resolvedValues = { ...values };

  for (const defaultConfig of defaults) {
    if (Object.hasOwn(resolvedValues, defaultConfig.fieldName)) {
      continue;
    }

    if (defaultConfig.value.kind === "context") {
      resolvedValues[defaultConfig.fieldName] = resolveContextDefaultValue(
        defaultConfig.fieldName,
        defaultConfig.value.name,
        queryContext,
      );
    } else {
      resolvedValues[defaultConfig.fieldName] = defaultConfig.value.value;
    }
  }

  return resolvedValues;
}

export function createDefaultsAreResolved(
  defaults: CreateDefaultConfig[],
  queryContext?: QueryEvaluationContext,
) {
  try {
    for (const defaultConfig of defaults) {
      if (defaultConfig.value.kind === "context") {
        resolveContextDefaultValue(defaultConfig.fieldName, defaultConfig.value.name, queryContext);
      }
    }

    return true;
  } catch {
    return false;
  }
}

export function selectCreateFieldsForDiscriminator<TField extends CreateDefaultFieldConfig>(
  baseFields: TField[],
  union: CreateDefaultUnionConfig<TField> | undefined,
  discriminatorValue: string | undefined,
): TField[] {
  const presentation = selectActiveCreateUnionPresentation(union, discriminatorValue);

  if (presentation === undefined) {
    return baseFields;
  }

  return appendNewFields(baseFields, presentation.presentation.fields);
}

export function selectCreateFieldsForDraftInput<TField extends CreateDefaultFieldConfig>(
  baseFields: TField[],
  union: CreateDefaultUnionConfig<TField> | undefined,
  draft: CreateDraftInput,
  defaults: CreateDefaultConfig[] = [],
  queryContext?: QueryEvaluationContext,
): TField[] {
  if (union === undefined) {
    return selectCreateFieldsForVisibility(baseFields, (fieldName) =>
      fieldDraftValueForCreateVisibility(fieldName, baseFields, draft, defaults, queryContext),
    );
  }

  const discriminatorDraft = draft.values[union.discriminatorFieldName];
  const draftDiscriminatorValue = generatedFieldDraftVisibilityValue(discriminatorDraft);
  const discriminatorValue =
    typeof draftDiscriminatorValue === "string"
      ? draftDiscriminatorValue
      : initialCreateDiscriminatorValue(union, defaults);

  const fields = selectCreateFieldsForDiscriminator(baseFields, union, discriminatorValue);

  return selectCreateFieldsForVisibility(fields, (fieldName) =>
    fieldDraftValueForCreateVisibility(fieldName, fields, draft, defaults, queryContext),
  );
}

export function selectCreateFieldsForInputValues<TField extends CreateDefaultFieldConfig>(
  fields: TField[],
  inputValues: Record<string, FieldVisibilityValue | undefined>,
): TField[] {
  return selectCreateFieldsForVisibility(fields, (fieldName) => {
    const inputValue = inputValues[fieldName];

    if (inputValue !== undefined) {
      return inputValue;
    }

    const fieldConfig = fields.find((candidate) => candidate.fieldName === fieldName);

    if (fieldConfig && fieldHasCreateDefault(fieldConfig.field)) {
      return fieldCreateDefaultVisibilityValue(fieldConfig.field);
    }

    return "";
  });
}

export function initialCreateDiscriminatorValue(
  union: CreateDefaultUnionConfig<CreateDefaultFieldConfig> | undefined,
  defaults: CreateDefaultConfig[] = [],
): string | undefined {
  if (union === undefined) {
    return undefined;
  }

  const defaultConfig = defaults.find(
    (candidate) => candidate.fieldName === union.discriminatorFieldName,
  );

  if (defaultConfig?.value.kind === "literal" && typeof defaultConfig.value.value === "string") {
    return defaultConfig.value.value;
  }
  return (
    union.discriminatorField.default ??
    (union.discriminatorField.required ? (union.discriminatorField.values[0]?.key ?? "") : "")
  );
}
export function resolveContextDefaultValue(
  fieldName: string,
  contextName: string,
  queryContext?: QueryEvaluationContext,
): string {
  const value = queryContext?.values?.[contextName];

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `Create default for "${fieldName}" requires selected context "${contextName}".`,
    );
  }

  return value;
}

function parseCreateViewDefault(
  viewName: string,
  entityName: string,
  fieldName: string,
  value: unknown,
  entity: EntitySchema,
  fields: CreateViewFieldBindingSchema[],
): CreateDefaultValueSchema {
  const context = `Create view "${viewName}" default "${fieldName}"`;
  if (fieldName.trim() === "") {
    throw new Error(`Create view "${viewName}" default field names must be non-empty.`);
  }
  const field = definitionsToRecord(entity.fields)[fieldName];
  if (!field) {
    throw new Error(`${context} references unknown field "${entityName}.${fieldName}".`);
  }
  if (fields.some((viewField) => viewField.field === fieldName)) {
    throw new Error(`${context} must not also appear in fields.`);
  }
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.kind === "context") {
    assertExactKeys(context, value, ["kind", "name"]);

    if (typeof value.name !== "string" || value.name.trim() === "") {
      throw new Error(`${context} name must be a non-empty string.`);
    }

    if (field.type !== "reference") {
      throw new Error(`${context} requires a reference field.`);
    }

    return { kind: "context", name: value.name };
  }

  if (value.kind === "literal") {
    assertExactKeys(context, value, ["kind", "value"]);

    if (field.type === "reference") {
      throw new Error(`${context} requires a scalar field.`);
    }

    const literalValue = parseCreateLiteralDefaultValue(context, field, value.value);

    return { kind: "literal", value: literalValue };
  }

  if (!("kind" in value)) {
    throw new Error(`${context} must include "kind".`);
  }

  if (typeof value.kind === "string") {
    throw new Error(`${context} has unsupported kind "${String(value.kind)}".`);
  }

  throw new Error(`${context} kind must be a string.`);
}

function collectCreateDefaultFields<TField extends CreateDefaultFieldConfig>(
  fields: readonly TField[],
  union: CreateDefaultUnionConfig<TField> | undefined,
): GeneratedFieldDraftFieldConfig[] {
  const fieldsByName = new Map<string, GeneratedFieldDraftFieldConfig>();
  const addFields = (nextFields: readonly GeneratedFieldDraftFieldConfig[]) => {
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
function parseCreateLiteralDefaultValue(
  context: string,
  field: Exclude<
    FieldSchema,
    {
      type: "reference";
    }
  >,
  value: unknown,
) {
  if (field.type === "text") {
    if (typeof value !== "string") {
      throw new Error(`${context} literal value must be a string.`);
    }

    if (field.required && value.trim() === "") {
      throw new Error(`${context} literal value cannot be empty.`);
    }

    return value;
  }

  if (field.type === "date") {
    if (typeof value !== "string") {
      throw new Error(`${context} literal value must be a YYYY-MM-DD date.`);
    }

    if (value === "") {
      if (field.required) {
        throw new Error(`${context} literal value cannot be empty.`);
      }

      return value;
    }

    if (!isDateString(value)) {
      throw new Error(`${context} literal value must be a YYYY-MM-DD date.`);
    }

    return value;
  }

  if (field.type === "boolean") {
    if (typeof value !== "boolean") {
      throw new Error(`${context} literal value must be a boolean.`);
    }

    return value;
  }

  if (field.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${context} literal value must be a finite number.`);
    }

    if (field.min !== undefined && value < field.min) {
      throw new Error(`${context} literal value must be greater than or equal to ${field.min}.`);
    }

    if (field.max !== undefined && value > field.max) {
      throw new Error(`${context} literal value must be less than or equal to ${field.max}.`);
    }

    if (field.integer && !Number.isInteger(value)) {
      throw new Error(`${context} literal value must be an integer.`);
    }

    return value;
  }

  if (typeof value !== "string") {
    throw new Error(`${context} literal value must be a known enum value.`);
  }

  if (value === "") {
    if (field.required) {
      throw new Error(`${context} literal value cannot be empty.`);
    }
    return value;
  }
  if (!field.values.some((definition) => definition.key === value)) {
    throw new Error(`${context} literal value must be a known enum value.`);
  }
  return value;
}
function getVisibleCreateDraftValues<TField extends CreateDefaultFieldConfig>(
  draft: CreateDraftInput,
  fields: TField[],
): {
  values: RecordValues;
  fieldErrors: Record<string, CreateDraftFieldError>;
} {
  return resolveGeneratedFieldDraftValues({ draft, fields });
}
function applyCreateDraftDefaultValues(
  values: RecordValues,
  defaults: CreateDefaultConfig[],
  queryContext?: QueryEvaluationContext,
): {
  values: RecordValues;
  fieldErrors: Record<string, CreateDraftFieldError>;
} {
  const resolvedValues = { ...values };
  const fieldErrors: Record<string, CreateDraftFieldError> = {};
  for (const defaultConfig of defaults) {
    if (Object.hasOwn(resolvedValues, defaultConfig.fieldName)) {
      continue;
    }

    if (defaultConfig.value.kind === "context") {
      try {
        resolvedValues[defaultConfig.fieldName] = resolveContextDefaultValue(
          defaultConfig.fieldName,
          defaultConfig.value.name,
          queryContext,
        );
      } catch (error) {
        fieldErrors[defaultConfig.fieldName] = {
          fieldName: defaultConfig.fieldName,
          message: error instanceof Error ? error.message : "Create default is unresolved.",
        };
      }
    } else {
      resolvedValues[defaultConfig.fieldName] = defaultConfig.value.value;
    }
  }

  return { values: resolvedValues, fieldErrors };
}

function selectCreateFieldsForVisibility<TField extends CreateDefaultFieldConfig>(
  fields: TField[],
  valueForField: (fieldName: string) => FieldVisibilityValue | undefined,
): TField[] {
  return fields.filter((field) => {
    const condition = field.visibleWhen;

    if (condition === undefined) {
      return true;
    }

    return condition.values.includes(valueForField(condition.field) ?? "");
  });
}

function fieldDraftValueForCreateVisibility<TField extends CreateDefaultFieldConfig>(
  fieldName: string,
  fields: TField[],
  draft: CreateDraftInput,
  defaults: CreateDefaultConfig[],
  queryContext?: QueryEvaluationContext,
): FieldVisibilityValue {
  const draftValue = generatedFieldDraftVisibilityValue(draft.values[fieldName]);

  if (draftValue !== undefined) {
    return draftValue;
  }

  const defaultConfig = defaults.find((candidate) => candidate.fieldName === fieldName);

  if (defaultConfig?.value.kind === "literal") {
    return defaultConfig.value.value;
  }

  if (defaultConfig?.value.kind === "context") {
    return queryContext?.values?.[defaultConfig.value.name] ?? "";
  }

  const fieldConfig = fields.find((candidate) => candidate.fieldName === fieldName);

  if (fieldConfig && fieldHasCreateDefault(fieldConfig.field)) {
    return fieldCreateDefaultVisibilityValue(fieldConfig.field);
  }

  return "";
}

function throwIfCreateDraftHasFieldErrors(result: CreateDraftResolution) {
  throwIfGeneratedFieldDraftHasErrors(result);
}

function fieldCreateDefaultVisibilityValue(field: FieldSchema): FieldVisibilityValue {
  return fieldCreateDefaultValue(field) ?? "";
}

function selectActiveCreateUnionPresentation<TField extends CreateDefaultFieldConfig>(
  union: CreateDefaultUnionConfig<TField> | undefined,
  discriminatorValue: string | undefined,
) {
  if (union === undefined) {
    return undefined;
  }

  return (
    union.variants.find((variant) => variant.variantValue === discriminatorValue) ?? union.fallback
  );
}
function appendNewFields<
  TField extends {
    fieldName: string;
  },
>(baseFields: TField[], variantFields: TField[]): TField[] {
  const fieldNames = new Set(baseFields.map((field) => field.fieldName));
  const newFields = variantFields.filter((field) => !fieldNames.has(field.fieldName));
  return newFields.length === 0 ? baseFields : [...baseFields, ...newFields];
}
