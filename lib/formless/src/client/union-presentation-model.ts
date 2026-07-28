import type {
  AppSchema,
  CreateViewSchema,
  CreateViewVariantPresentationSchema,
  EditViewSchema,
  EditViewVariantPresentationSchema,
  EntitySchema,
  EntityUnionSchema,
  FieldSchema,
  ItemViewSchema,
  ItemViewVariantPresentationSchema,
} from "@dpeek/formless-schema";
import { selectAddressableRecordFieldConfig } from "./field-configs.ts";
import type {
  CreateFallbackPresentationConfig,
  CreateUnionPresentationConfig,
  CreateVariantPresentationConfig,
  RecordFallbackPresentationConfig,
  RecordUnionPresentationConfig,
  RecordVariantPresentationConfig,
} from "./views.ts";

type RecordUnionViewSchema = ItemViewSchema | EditViewSchema;

export function selectRecordUnionPresentation(
  schema: AppSchema,
  view: RecordUnionViewSchema,
  entity: EntitySchema,
): RecordUnionPresentationConfig | undefined {
  if (view.union === undefined) {
    return undefined;
  }
  const union = schema.unions?.find((definition) => definition.key === view.union);
  if (!union) {
    throw new Error(`Missing union "${view.union}".`);
  }
  return {
    ...selectUnionBaseConfig(view.union, union, entity),
    variants: view.variants.map((presentation) =>
      selectRecordVariantPresentationConfig(entity, union, presentation.variant, presentation),
    ),
    ...(view.fallback === undefined
      ? {}
      : {
          fallback: selectRecordFallbackPresentationConfig(entity, union, view.fallback),
        }),
  };
}

export function selectCreateUnionPresentation(
  schema: AppSchema,
  view: CreateViewSchema,
  entity: EntitySchema,
): CreateUnionPresentationConfig | undefined {
  if (view.union === undefined) {
    return undefined;
  }
  const union = schema.unions?.find((definition) => definition.key === view.union);
  if (!union) {
    throw new Error(`Missing union "${view.union}".`);
  }
  return {
    ...selectUnionBaseConfig(view.union, union, entity),
    variants: view.variants.map((presentation) =>
      selectCreateVariantPresentationConfig(entity, union, presentation.variant, presentation),
    ),
    ...(view.fallback === undefined
      ? {}
      : {
          fallback: selectCreateFallbackPresentationConfig(entity, union, view.fallback),
        }),
  };
}
function selectUnionBaseConfig(unionName: string, union: EntityUnionSchema, entity: EntitySchema) {
  const discriminatorField = entity.fields.find(
    (definition) => definition.key === union.discriminator,
  )!;
  if (discriminatorField?.type !== "enum") {
    throw new Error(`Missing union discriminator field "${union.discriminator}".`);
  }

  return {
    unionName,
    union,
    discriminatorFieldName: union.discriminator,
    discriminatorField,
  };
}

function selectRecordVariantPresentationConfig(
  entity: EntitySchema,
  union: EntityUnionSchema,
  variantValue: string,
  presentation: ItemViewVariantPresentationSchema | EditViewVariantPresentationSchema,
): RecordVariantPresentationConfig {
  const unionVariant = union.variants.find((definition) => definition.key === variantValue)!;
  if (!unionVariant) {
    throw new Error(`Missing union variant "${variantValue}".`);
  }

  return {
    variantValue,
    label: unionVariant.label,
    unionVariant,
    presentation: selectRecordVariantPresentation(entity, presentation),
  };
}

function selectRecordFallbackPresentationConfig(
  entity: EntitySchema,
  union: EntityUnionSchema,
  presentation: ItemViewVariantPresentationSchema | EditViewVariantPresentationSchema,
): RecordFallbackPresentationConfig {
  return {
    label: union.fallback?.label ?? "Fallback",
    ...(union.fallback === undefined ? {} : { unionVariant: union.fallback }),
    presentation: selectRecordVariantPresentation(entity, presentation),
  };
}

function selectRecordVariantPresentation(
  entity: EntitySchema,
  presentation: ItemViewVariantPresentationSchema | EditViewVariantPresentationSchema,
): RecordVariantPresentationConfig["presentation"] {
  if (presentation.presentation === "contextLink") {
    return {
      type: "contextLink",
      labelFieldName: presentation.labelField,
      labelField: entity.fields.find(
        (definition) => definition.key === presentation.labelField,
      )! as FieldSchema,
      target: {
        kind: presentation.target.kind,
        contextName: presentation.target.context,
        record: presentation.target.record,
      },
    };
  }
  return {
    type: "fields",
    fields: presentation.fields.map((viewField) => {
      const fieldName = viewField.field;
      const selectedField = selectAddressableRecordFieldConfig(entity, fieldName);
      return {
        fieldName,
        fieldRef: selectedField.fieldRef,
        field: selectedField.field,
        editor: selectedField.writable ? viewField.editor : "text",
        commit: selectedField.writable ? viewField.commit : "field-commit",
        writable: selectedField.writable,
        label: selectedField.label,
        ...(viewField.visibleWhen === undefined ? {} : { visibleWhen: viewField.visibleWhen }),
        ...(selectedField.writable && viewField.presentation !== undefined
          ? { presentation: viewField.presentation }
          : {}),
      };
    }),
  };
}

function selectCreateVariantPresentationConfig(
  entity: EntitySchema,
  union: EntityUnionSchema,
  variantValue: string,
  presentation: CreateViewVariantPresentationSchema,
): CreateVariantPresentationConfig {
  const unionVariant = union.variants.find((definition) => definition.key === variantValue)!;
  if (!unionVariant) {
    throw new Error(`Missing union variant "${variantValue}".`);
  }

  return {
    variantValue,
    label: unionVariant.label,
    unionVariant,
    presentation: selectCreateVariantPresentation(entity, presentation),
  };
}

function selectCreateFallbackPresentationConfig(
  entity: EntitySchema,
  union: EntityUnionSchema,
  presentation: CreateViewVariantPresentationSchema,
): CreateFallbackPresentationConfig {
  return {
    label: union.fallback?.label ?? "Fallback",
    ...(union.fallback === undefined ? {} : { unionVariant: union.fallback }),
    presentation: selectCreateVariantPresentation(entity, presentation),
  };
}

function selectCreateVariantPresentation(
  entity: EntitySchema,
  presentation: CreateViewVariantPresentationSchema,
): CreateVariantPresentationConfig["presentation"] {
  return {
    type: "fields",
    fields: presentation.fields.flatMap((viewField) => {
      const fieldName = viewField.field;
      const selectedField = selectAddressableRecordFieldConfig(entity, fieldName);
      if (!selectedField.writable) {
        return [];
      }

      return [
        {
          fieldName,
          field: selectedField.field,
          editor: viewField.editor,
          ...(viewField.visibleWhen === undefined ? {} : { visibleWhen: viewField.visibleWhen }),
          ...(viewField.presentation === undefined ? {} : { presentation: viewField.presentation }),
        },
      ];
    }),
  };
}
