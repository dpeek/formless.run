import {
  coreImageMediaAssetOptionForId,
  type DocumentMediaUploadResponse,
  type ImageMediaAssetOption,
  type MediaAssetOption,
  type UploadedImageMedia,
} from "@dpeek/formless-media/client";
import {
  recordFieldIsWritable,
  type RecordFieldConfig,
  type RecordUnionPresentationConfig,
} from "../../client/views.ts";
import type { FieldValue, RecordValues } from "@dpeek/formless-storage";
import {
  generatedFieldDraftInput,
  generatedFieldDraftVisibilityValue,
  resolveGeneratedFieldDraftValues,
  type AppSchema,
  type FieldSchema,
  type FieldVisibilityValue,
  type GeneratedFieldDraft,
  type GeneratedFieldDraftError,
  type GeneratedFieldDraftInput,
  type TableColumnFormat,
} from "@dpeek/formless-schema";
import {
  decodeNumberEditorInputValue,
  encodeNumberEditorInputValue,
  fieldValueToInputValue,
} from "./format.ts";

export type GeneratedRecordFieldEditability = {
  canEdit: boolean;
  controlDisabled: boolean;
  uploadDisabled: boolean;
};

export type GeneratedRecordFieldDraftValues = {
  draft: string;
  unitDraft: string;
};

export type GeneratedUpdateDraftFieldInput = GeneratedFieldDraftInput;

export type GeneratedUpdateDraftInput = GeneratedFieldDraft;

export type GeneratedUpdateDraftFieldError = GeneratedFieldDraftError;

export type GeneratedUpdateDraftSessionState = {
  baselineValues: RecordValues;
  draft: GeneratedUpdateDraftInput;
};

export type GeneratedUpdateDraftSessionFacts = {
  fieldErrors: Record<string, GeneratedUpdateDraftFieldError>;
  patchValues: Partial<RecordValues>;
  visibleFields: RecordFieldConfig[];
};

export type GeneratedUpdateDraftResolution = {
  fieldErrors: Record<string, GeneratedUpdateDraftFieldError>;
  patchValues: Partial<RecordValues>;
  visibleFields: string[];
};

export type GeneratedRecordFieldMediaAuthoring = {
  mediaPreviewHref?: string;
  selectedAsset?: MediaAssetOption;
  uploadEnabled: boolean;
  uploadPatchFields: GeneratedRecordFieldMediaUploadPatchFields;
};

export type GeneratedRecordFieldMediaUploadPatchFields = {
  heightFieldName?: string;
  mediaAssetFieldName?: string;
  widthFieldName?: string;
};

export type GeneratedRecordValueUnitDraftCommit = {
  fieldDraftInput: GeneratedUpdateDraftFieldInput;
  unitDraftInput: GeneratedUpdateDraftFieldInput;
};

export function selectGeneratedRecordFieldDraftValues({
  fieldConfig,
  numberFormat,
  recordValue,
  unitRecordValue,
}: {
  fieldConfig: RecordFieldConfig;
  numberFormat: TableColumnFormat;
  recordValue: FieldValue | undefined;
  unitRecordValue: FieldValue | undefined;
}): GeneratedRecordFieldDraftValues {
  return {
    draft: fieldValueToRecordFieldEditorInputValue(fieldConfig.field, recordValue, numberFormat),
    unitDraft:
      fieldConfig.valueUnit === undefined
        ? ""
        : fieldValueToInputValue(fieldConfig.valueUnit.unitField, unitRecordValue),
  };
}

export function initialGeneratedUpdateDraftSessionState({
  baselineValues,
  fields,
  union,
}: {
  baselineValues: RecordValues;
  fields: RecordFieldConfig[];
  union?: RecordUnionPresentationConfig;
}): GeneratedUpdateDraftSessionState {
  return {
    baselineValues,
    draft: {
      values: Object.fromEntries(
        collectGeneratedUpdateDraftFields(fields, union).flatMap((fieldConfig) => {
          const value = baselineValues[fieldConfig.fieldName];

          return value === undefined
            ? []
            : [[fieldConfig.fieldName, generatedFieldDraftInput(value)]];
        }),
      ),
    },
  };
}

export function nextGeneratedUpdateDraftSessionState({
  fieldName,
  fieldValue,
  state,
}: {
  fieldName: string;
  fieldValue: GeneratedUpdateDraftFieldInput | undefined;
  state: GeneratedUpdateDraftSessionState;
}): GeneratedUpdateDraftSessionState {
  const values = { ...state.draft.values };

  if (fieldValue === undefined) {
    delete values[fieldName];
  } else {
    values[fieldName] = fieldValue;
  }

  return {
    ...state,
    draft: { values },
  };
}

export function selectGeneratedUpdateDraftSession({
  fields,
  state,
  union,
}: {
  fields: RecordFieldConfig[];
  state: GeneratedUpdateDraftSessionState;
  union?: RecordUnionPresentationConfig;
}): GeneratedUpdateDraftSessionFacts {
  const resolution = resolveGeneratedUpdateDraftPatchValues({
    baselineValues: state.baselineValues,
    draft: state.draft,
    fields,
    union,
  });

  return {
    fieldErrors: resolution.fieldErrors,
    patchValues: resolution.patchValues,
    visibleFields: selectGeneratedUpdateFieldsForDraftInput({
      baselineValues: state.baselineValues,
      draft: state.draft,
      fields,
      union,
    }),
  };
}

export function resolveGeneratedUpdateDraftPatchValues({
  baselineValues,
  draft,
  fieldNames,
  fields,
  union,
}: {
  baselineValues: RecordValues;
  draft: GeneratedUpdateDraftInput;
  fieldNames?: readonly string[];
  fields: RecordFieldConfig[];
  union?: RecordUnionPresentationConfig;
}): GeneratedUpdateDraftResolution {
  const visibleFields = selectGeneratedUpdateFieldsForDraftInput({
    baselineValues,
    draft,
    fields,
    union,
  });
  const fieldNameSet = fieldNames === undefined ? undefined : new Set(fieldNames);
  const patchableFields = visibleFields
    .filter(generatedUpdateFieldIsPatchable)
    .filter((field) => fieldNameSet === undefined || fieldNameSet.has(field.fieldName));
  const { fieldErrors, values } = resolveGeneratedFieldDraftValues({
    draft,
    fields: patchableFields,
    missingDraft: "omit",
  });

  return {
    fieldErrors,
    patchValues: selectChangedGeneratedRecordPatchValues({
      currentValues: baselineValues,
      values,
    }),
    visibleFields: visibleFields.map((field) => field.fieldName),
  };
}

export function selectGeneratedUpdateFieldsForDraftInput({
  baselineValues,
  draft,
  fields,
  union,
}: {
  baselineValues: RecordValues;
  draft: GeneratedUpdateDraftInput;
  fields: RecordFieldConfig[];
  union?: RecordUnionPresentationConfig;
}): RecordFieldConfig[] {
  const unionFields = selectGeneratedUpdateFieldsForDiscriminator({
    baselineValues,
    draft,
    fields,
    union,
  });

  return selectGeneratedUpdateFieldsForVisibility(unionFields, (fieldName) =>
    generatedUpdateVisibilityValue(fieldName, draft, baselineValues),
  );
}

export function generatedRecordFieldUsesUpdateDraftResolver(fieldConfig: RecordFieldConfig) {
  return fieldConfig.stateMachine === undefined;
}

export function generatedUpdateDraftInputFromFieldValue(
  value: FieldValue,
): GeneratedUpdateDraftFieldInput {
  return generatedFieldDraftInput(value);
}

export function generatedUpdateDraftInputFromEditorDraft({
  fieldConfig,
  numberFormat,
  value,
}: {
  fieldConfig: RecordFieldConfig;
  numberFormat: TableColumnFormat;
  value: string;
}): GeneratedUpdateDraftFieldInput {
  if (fieldConfig.field.type === "number") {
    const decoded = decodeNumberEditorInputValue(value, numberFormat);

    return decoded.kind === "valid"
      ? { kind: "value", value: decoded.value }
      : { kind: "input", value };
  }

  return { kind: "input", value };
}

export function resolveGeneratedValueUnitUpdateDraftPatchValues({
  baselineValues,
  draft,
  fieldConfig,
  fieldDraftInput,
  fields,
  union,
  unitDraftInput,
}: {
  baselineValues: RecordValues;
  draft: GeneratedUpdateDraftInput;
  fieldConfig: RecordFieldConfig & {
    valueUnit: NonNullable<RecordFieldConfig["valueUnit"]>;
  };
  fieldDraftInput: GeneratedUpdateDraftFieldInput;
  fields: RecordFieldConfig[];
  union?: RecordUnionPresentationConfig;
  unitDraftInput: GeneratedUpdateDraftFieldInput;
}): GeneratedUpdateDraftResolution {
  const unitFieldName = fieldConfig.valueUnit.unitFieldName;

  return resolveGeneratedUpdateDraftPatchValues({
    baselineValues,
    draft: {
      values: {
        ...draft.values,
        [fieldConfig.fieldName]: fieldDraftInput,
        [unitFieldName]: unitDraftInput,
      },
    },
    fieldNames: [fieldConfig.fieldName, unitFieldName],
    fields: appendGeneratedValueUnitPatchField(fields, fieldConfig),
    union,
  });
}

export function resolveGeneratedMediaUploadUpdateDraftPatchValues({
  baselineValues,
  draft,
  entityName,
  fieldConfig,
  fields,
  schema,
  union,
  upload,
  uploadPatchFields,
}: {
  baselineValues: RecordValues;
  draft: GeneratedUpdateDraftInput;
  entityName: string;
  fieldConfig: RecordFieldConfig;
  fields: RecordFieldConfig[];
  schema: AppSchema | null;
  union?: RecordUnionPresentationConfig;
  upload: DocumentMediaUploadResponse | UploadedImageMedia;
  uploadPatchFields: GeneratedRecordFieldMediaUploadPatchFields;
}): GeneratedUpdateDraftResolution {
  const uploadDraftValues = generatedMediaUploadDraftValues(uploadPatchFields, upload);

  return resolveGeneratedUpdateDraftPatchValues({
    baselineValues,
    draft: {
      values: {
        ...draft.values,
        ...uploadDraftValues,
      },
    },
    fieldNames: Object.keys(uploadDraftValues),
    fields: appendGeneratedMediaUploadPatchFields({
      entityName,
      fieldConfig,
      fields,
      schema,
      uploadPatchFields,
    }),
    union,
  });
}

export function generatedRecordFieldEditorDraftFromUpdateDraftInput({
  draftInput,
  fieldConfig,
  numberFormat,
  recordValue,
}: {
  draftInput: GeneratedUpdateDraftFieldInput | undefined;
  fieldConfig: RecordFieldConfig;
  numberFormat: TableColumnFormat;
  recordValue: FieldValue | undefined;
}): string {
  if (draftInput === undefined) {
    return fieldValueToRecordFieldEditorInputValue(fieldConfig.field, recordValue, numberFormat);
  }

  if (draftInput.kind === "input") {
    return draftInput.value;
  }

  return fieldValueToRecordFieldEditorInputValue(fieldConfig.field, draftInput.value, numberFormat);
}

export function fieldValueToRecordFieldEditorInputValue(
  field: FieldSchema,
  value: FieldValue | undefined,
  format: TableColumnFormat,
) {
  if (field.type === "number" && typeof value === "number") {
    return encodeNumberEditorInputValue(value, format);
  }

  return fieldValueToInputValue(field, value);
}

export function selectGeneratedRecordFieldPatchValues({
  currentValues,
  values,
}: {
  currentValues: RecordValues | undefined;
  values: Partial<RecordValues>;
}): Partial<RecordValues> {
  return selectChangedGeneratedRecordPatchValues({ currentValues, values });
}

function selectChangedGeneratedRecordPatchValues({
  currentValues,
  values,
}: {
  currentValues: RecordValues | undefined;
  values: Partial<RecordValues>;
}): Partial<RecordValues> {
  const patchValues: Partial<RecordValues> = {};

  for (const [fieldName, value] of Object.entries(values)) {
    const currentValue = currentValues?.[fieldName];

    if (currentValue === value || (currentValue === undefined && value === "")) {
      continue;
    }

    patchValues[fieldName] = value;
  }

  return patchValues;
}

function selectGeneratedUpdateFieldsForDiscriminator({
  baselineValues,
  draft,
  fields,
  union,
}: {
  baselineValues: RecordValues;
  draft: GeneratedUpdateDraftInput;
  fields: RecordFieldConfig[];
  union?: RecordUnionPresentationConfig;
}) {
  if (union === undefined) {
    return fields;
  }

  const discriminatorValue = generatedUpdateVisibilityValue(
    union.discriminatorFieldName,
    draft,
    baselineValues,
  );
  const presentation =
    typeof discriminatorValue === "string"
      ? (union.variants.find((variant) => variant.variantValue === discriminatorValue) ??
        union.fallback)
      : union.fallback;

  if (presentation?.presentation.type !== "fields") {
    return fields;
  }

  return appendNewGeneratedUpdateFields(fields, presentation.presentation.fields);
}

function selectGeneratedUpdateFieldsForVisibility(
  fields: RecordFieldConfig[],
  valueForField: (fieldName: string) => FieldVisibilityValue | undefined,
) {
  return fields.filter((fieldConfig) => {
    const condition = fieldConfig.visibleWhen;

    if (condition === undefined) {
      return true;
    }

    return condition.values.includes(valueForField(condition.field) ?? "");
  });
}

function generatedUpdateFieldIsPatchable(fieldConfig: RecordFieldConfig) {
  if (fieldConfig.fieldRef?.kind === "system") {
    return false;
  }

  if (!recordFieldIsWritable(fieldConfig)) {
    return false;
  }

  return fieldConfig.stateMachine === undefined;
}

function generatedUpdateVisibilityValue(
  fieldName: string,
  draft: GeneratedUpdateDraftInput,
  baselineValues: RecordValues,
): FieldVisibilityValue | undefined {
  const draftValue = generatedFieldDraftVisibilityValue(draft.values[fieldName]);

  if (draftValue !== undefined) {
    return draftValue;
  }

  const baselineValue = baselineValues[fieldName];

  if (
    typeof baselineValue === "string" ||
    typeof baselineValue === "boolean" ||
    typeof baselineValue === "number"
  ) {
    return baselineValue;
  }

  return undefined;
}

function collectGeneratedUpdateDraftFields(
  fields: RecordFieldConfig[],
  union: RecordUnionPresentationConfig | undefined,
): RecordFieldConfig[] {
  const fieldsByName = new Map<string, RecordFieldConfig>();
  const addFields = (nextFields: RecordFieldConfig[]) => {
    for (const field of nextFields) {
      if (!fieldsByName.has(field.fieldName)) {
        fieldsByName.set(field.fieldName, field);
      }
    }
  };

  addFields(fields);

  for (const variant of union?.variants ?? []) {
    if (variant.presentation.type === "fields") {
      addFields(variant.presentation.fields);
    }
  }

  if (union?.fallback?.presentation.type === "fields") {
    addFields(union.fallback.presentation.fields);
  }

  return Array.from(fieldsByName.values());
}

function appendNewGeneratedUpdateFields(
  baseFields: RecordFieldConfig[],
  variantFields: RecordFieldConfig[],
): RecordFieldConfig[] {
  const fieldNames = new Set(baseFields.map((field) => field.fieldName));
  const newFields = variantFields.filter((field) => !fieldNames.has(field.fieldName));

  return newFields.length === 0 ? baseFields : [...baseFields, ...newFields];
}

export function selectGeneratedIconDialogDraft({
  draft,
  open,
  recordDraft,
}: {
  draft: string;
  open: boolean;
  recordDraft: string;
}) {
  return open ? draft : recordDraft;
}

export function selectGeneratedRecordFieldEditability({
  canPatch,
  isPending,
  uploadEnabled = true,
}: {
  canPatch: boolean;
  isPending: boolean;
  uploadEnabled?: boolean;
}): GeneratedRecordFieldEditability {
  const controlDisabled = !canPatch || isPending;

  return {
    canEdit: !controlDisabled,
    controlDisabled,
    uploadDisabled: controlDisabled || !uploadEnabled,
  };
}

export function selectGeneratedRecordFieldMediaAuthoring({
  draft,
  entityName,
  fieldConfig,
  mediaAssetOptions,
  schema,
}: {
  draft: string;
  entityName: string;
  fieldConfig: RecordFieldConfig;
  mediaAssetOptions: MediaAssetOption[];
  schema: AppSchema | null;
}): GeneratedRecordFieldMediaAuthoring {
  const documentPolicy = fieldConfig.field.type === "text" ? fieldConfig.field.asset : undefined;
  const mediaPreview =
    draft !== ""
      ? (mediaAssetOptions.find((asset) => asset.id === draft) ??
        (documentPolicy?.kind === "document" ? undefined : coreImageMediaAssetOptionForId(draft)))
      : undefined;

  return {
    ...(mediaPreview === undefined ? {} : { selectedAsset: mediaPreview }),
    ...(mediaPreview !== undefined && !("downloadHref" in mediaPreview)
      ? { mediaPreviewHref: mediaPreview.href }
      : {}),
    uploadEnabled: true,
    uploadPatchFields: selectMediaAssetUploadPatchFields(schema, entityName, fieldConfig.fieldName),
  };
}

export function selectMediaAssetUploadPatchFields(
  schema: AppSchema | null,
  entityName: string,
  fieldName: string,
): GeneratedRecordFieldMediaUploadPatchFields {
  const fields = schema?.entities.find((definition) => definition.key === entityName)?.fields;
  const field = fields?.find((definition) => definition.key === fieldName);
  if (field?.type === "text" && field.asset?.kind === "document") {
    return { mediaAssetFieldName: fieldName };
  }
  if (
    fields?.find((definition) => definition.key === "width")?.type === "number" &&
    fields.find((definition) => definition.key === "height")?.type === "number"
  ) {
    return {
      heightFieldName: "height",
      mediaAssetFieldName: fieldName,
      widthFieldName: "width",
    };
  }

  return { mediaAssetFieldName: fieldName };
}

export function imageMediaAssetOptionFromUpload(
  upload: UploadedImageMedia,
): ImageMediaAssetOption | undefined {
  const mediaAssetId = upload.assetId ?? upload.asset?.id;

  if (!mediaAssetId) {
    return undefined;
  }

  const uploadedHeight = upload.asset?.height ?? upload.dimensions?.height;
  const uploadedWidth = upload.asset?.width ?? upload.dimensions?.width;

  return {
    ...(uploadedHeight === undefined ? {} : { height: uploadedHeight }),
    href: upload.asset?.deliveryHref ?? upload.href,
    id: mediaAssetId,
    label: upload.asset?.label ?? mediaAssetId,
    ...(uploadedWidth === undefined ? {} : { width: uploadedWidth }),
  };
}

export function upsertMediaAssetOption(
  options: MediaAssetOption[],
  option: MediaAssetOption,
): MediaAssetOption[] {
  return [option, ...options.filter((candidate) => candidate.id !== option.id)].sort(
    (left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id),
  );
}

function appendGeneratedValueUnitPatchField(
  fields: RecordFieldConfig[],
  fieldConfig: RecordFieldConfig & {
    valueUnit: NonNullable<RecordFieldConfig["valueUnit"]>;
  },
): RecordFieldConfig[] {
  const unitFieldName = fieldConfig.valueUnit.unitFieldName;

  if (fields.some((field) => field.fieldName === unitFieldName)) {
    return fields;
  }

  return [
    ...fields,
    {
      commit: fieldConfig.commit,
      editor: "enum",
      field: fieldConfig.valueUnit.unitField,
      fieldName: unitFieldName,
      label: `${fieldConfig.label ?? fieldConfig.fieldName} unit`,
      visibleWhen: fieldConfig.visibleWhen,
      writable: fieldConfig.writable,
    },
  ];
}

function generatedMediaUploadDraftValues(
  uploadPatchFields: GeneratedRecordFieldMediaUploadPatchFields,
  upload: DocumentMediaUploadResponse | UploadedImageMedia,
): Record<string, GeneratedUpdateDraftFieldInput> {
  const values: Record<string, GeneratedUpdateDraftFieldInput> = {};
  const { heightFieldName, mediaAssetFieldName, widthFieldName } = uploadPatchFields;

  if ("dimensions" in upload && upload.dimensions && widthFieldName && heightFieldName) {
    values[widthFieldName] = { kind: "value", value: upload.dimensions.width };
    values[heightFieldName] = { kind: "value", value: upload.dimensions.height };
  }

  const mediaAssetId = upload.assetId ?? upload.asset?.id;

  if (mediaAssetFieldName && mediaAssetId) {
    values[mediaAssetFieldName] = { kind: "input", value: mediaAssetId };
  }

  return values;
}

function appendGeneratedMediaUploadPatchFields({
  entityName,
  fieldConfig,
  fields,
  schema,
  uploadPatchFields,
}: {
  entityName: string;
  fieldConfig: RecordFieldConfig;
  fields: RecordFieldConfig[];
  schema: AppSchema | null;
  uploadPatchFields: GeneratedRecordFieldMediaUploadPatchFields;
}): RecordFieldConfig[] {
  const nextFields = [...fields];
  const fieldNames = new Set(nextFields.map((field) => field.fieldName));
  const schemaFields = schema?.entities.find((definition) => definition.key === entityName)?.fields;
  function addField(fieldName: string | undefined) {
    if (fieldName === undefined || fieldNames.has(fieldName)) {
      return;
    }

    if (fieldName === fieldConfig.fieldName) {
      nextFields.push(fieldConfig);
      fieldNames.add(fieldName);
      return;
    }
    const field = schemaFields?.find((definition) => definition.key === fieldName);
    if (field === undefined) {
      return;
    }

    nextFields.push({
      commit: "field-commit",
      editor: defaultGeneratedUpdateEditorForField(field),
      field,
      fieldName,
      label: fieldName,
      visibleWhen: fieldConfig.visibleWhen,
      writable: fieldConfig.writable,
    });
    fieldNames.add(fieldName);
  }

  addField(uploadPatchFields.mediaAssetFieldName);
  addField(uploadPatchFields.widthFieldName);
  addField(uploadPatchFields.heightFieldName);

  return nextFields;
}

function defaultGeneratedUpdateEditorForField(field: FieldSchema): RecordFieldConfig["editor"] {
  if (field.type === "boolean") {
    return "boolean";
  }

  if (field.type === "date") {
    return "date";
  }

  if (field.type === "enum") {
    return "enum";
  }

  if (field.type === "number") {
    return "number";
  }

  if (field.type === "reference") {
    return "reference";
  }

  return "text";
}
