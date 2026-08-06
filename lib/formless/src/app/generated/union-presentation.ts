import type {
  RecordVariantContextLinkPresentationConfig,
  RecordFieldConfig,
  RecordUnionPresentationConfig,
} from "../../client/views.ts";
import type { FieldValue, StoredRecord } from "@dpeek/formless-storage";
import type { FieldVisibilityValue } from "@dpeek/formless-schema";

type ActiveRecordUnionPresentation =
  | RecordUnionPresentationConfig["variants"][number]
  | NonNullable<RecordUnionPresentationConfig["fallback"]>;

export function selectRecordFieldsForActiveUnion(
  baseFields: RecordFieldConfig[],
  union: RecordUnionPresentationConfig | undefined,
  record: StoredRecord | undefined,
): RecordFieldConfig[] {
  return selectRecordFieldsForActiveUnionValues(baseFields, union, record?.values);
}

export function selectRecordFieldsForActiveUnionValues(
  baseFields: RecordFieldConfig[],
  union: RecordUnionPresentationConfig | undefined,
  values: StoredRecord["values"] | undefined,
): RecordFieldConfig[] {
  const presentation = selectActiveRecordUnionPresentation(union, values);

  if (presentation?.presentation.type !== "fields") {
    return selectRecordFieldsForVisibility(baseFields, values);
  }

  return selectRecordFieldsForVisibility(
    appendNewFields(baseFields, presentation.presentation.fields),
    values,
  );
}

export function selectRecordContextLinkForActiveUnion(
  union: RecordUnionPresentationConfig | undefined,
  record: StoredRecord | undefined,
): RecordVariantContextLinkPresentationConfig | undefined {
  const presentation = selectActiveRecordUnionPresentation(union, record?.values);

  return presentation?.presentation.type === "contextLink" ? presentation.presentation : undefined;
}

function selectActiveRecordUnionPresentation(
  union: RecordUnionPresentationConfig | undefined,
  values: StoredRecord["values"] | undefined,
): ActiveRecordUnionPresentation | undefined {
  if (union === undefined || values === undefined) {
    return undefined;
  }

  const discriminatorValue = stringValue(values[union.discriminatorFieldName]);

  return (
    union.variants.find((variant) => variant.variantValue === discriminatorValue) ?? union.fallback
  );
}

function appendNewFields<TField extends { fieldName: string }>(
  baseFields: TField[],
  variantFields: TField[],
): TField[] {
  const fieldNames = new Set(baseFields.map((field) => field.fieldName));
  const newFields = variantFields.filter((field) => !fieldNames.has(field.fieldName));

  return newFields.length === 0 ? baseFields : [...baseFields, ...newFields];
}

function selectRecordFieldsForVisibility(
  fields: RecordFieldConfig[],
  values: StoredRecord["values"] | undefined,
): RecordFieldConfig[] {
  return fields.filter((fieldConfig) => {
    const condition = fieldConfig.visibleWhen;

    if (condition === undefined) {
      return true;
    }

    return condition.values.includes(recordVisibilityValue(values?.[condition.field]) ?? "");
  });
}

function recordVisibilityValue(value: FieldValue | undefined): FieldVisibilityValue | undefined {
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  return undefined;
}

function stringValue(value: FieldValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
