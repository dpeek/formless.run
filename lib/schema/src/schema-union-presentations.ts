import {
  assertExactKeys,
  definitionsToRecord,
  isRecord,
  parseRequiredNonEmptyString,
} from "./schema-parse-helpers.ts";
import {
  assertViewHasFields,
  parseCreateViewFields,
  parseListViewFields,
} from "./schema-view-fields.ts";
import type {
  ContextSelectionTargetSchema,
  CreateViewVariantFieldsPresentationSchema,
  CreateViewVariantBindingSchema,
  CreateViewVariantPresentationSchema,
  EditViewVariantPresentationSchema,
  EditViewVariantBindingSchema,
  EntitySchema,
  EntityUnionSchema,
  ItemViewVariantPresentationSchema,
  ItemViewVariantBindingSchema,
  ViewVariantFieldsPresentationSchema,
} from "./types.ts";
export function parseItemViewUnionPresentation(
  context: string,
  viewName: string,
  value: Record<string, unknown>,
  entityName: string,
  entity: EntitySchema,
  unions: Record<string, EntityUnionSchema> | undefined,
):
  | {
      union: string;
      variants: ItemViewVariantBindingSchema[];
      fallback?: ItemViewVariantPresentationSchema;
    }
  | Record<string, never> {
  return parseViewUnionPresentation(
    context,
    viewName,
    value,
    entityName,
    unions,
    (variantContext, variantViewName, variant) =>
      parseItemViewVariantPresentation(
        variantContext,
        variantViewName,
        variant,
        entityName,
        entity,
      ),
  );
}

export function parseEditViewUnionPresentation(
  context: string,
  viewName: string,
  value: Record<string, unknown>,
  entityName: string,
  entity: EntitySchema,
  unions: Record<string, EntityUnionSchema> | undefined,
):
  | {
      union: string;
      variants: EditViewVariantBindingSchema[];
      fallback?: EditViewVariantPresentationSchema;
    }
  | Record<string, never> {
  return parseViewUnionPresentation(
    context,
    viewName,
    value,
    entityName,
    unions,
    (variantContext, variantViewName, variant) =>
      parseRecordFieldsVariantPresentation(
        variantContext,
        variantViewName,
        variant,
        entityName,
        entity,
      ),
  );
}

export function parseCreateViewUnionPresentation(
  context: string,
  viewName: string,
  value: Record<string, unknown>,
  entityName: string,
  entity: EntitySchema,
  unions: Record<string, EntityUnionSchema> | undefined,
):
  | {
      union: string;
      variants: CreateViewVariantBindingSchema[];
      fallback?: CreateViewVariantPresentationSchema;
    }
  | Record<string, never> {
  return parseViewUnionPresentation(
    context,
    viewName,
    value,
    entityName,
    unions,
    (variantContext, variantViewName, variant) =>
      parseCreateFieldsVariantPresentation(
        variantContext,
        variantViewName,
        variant,
        entityName,
        entity,
      ),
  );
}
function parseViewUnionPresentation<TPresentation extends object>(
  context: string,
  viewName: string,
  value: Record<string, unknown>,
  entityName: string,
  unions: Record<string, EntityUnionSchema> | undefined,
  parseVariant: (context: string, viewName: string, value: unknown) => TPresentation,
):
  | {
      union: string;
      variants: (TPresentation & {
        variant: string;
      })[];
      fallback?: TPresentation;
    }
  | Record<string, never> {
  if (value.union === undefined) {
    if (value.variants !== undefined || value.fallback !== undefined) {
      throw new Error(`${context} variants require a union.`);
    }

    return {};
  }

  const unionName = parseRequiredNonEmptyString(`${context} union`, value.union);
  const union = unions?.[unionName];

  if (!union) {
    throw new Error(`${context} references unknown union "${unionName}".`);
  }

  if (union.entity !== entityName) {
    throw new Error(`${context} union "${unionName}" must use entity "${entityName}".`);
  }

  const variants = parseViewUnionVariants(context, viewName, value.variants, union, parseVariant);
  const fallback =
    value.fallback === undefined
      ? undefined
      : parseVariant(`${context} fallback`, `${viewName}.fallback`, value.fallback);

  assertViewUnionCoverage(context, unionName, union, variants, fallback);

  return {
    union: unionName,
    variants,
    ...(fallback === undefined ? {} : { fallback }),
  };
}
function parseViewUnionVariants<TPresentation extends object>(
  context: string,
  viewName: string,
  value: unknown,
  union: EntityUnionSchema,
  parseVariant: (context: string, viewName: string, value: unknown) => TPresentation,
): (TPresentation & {
  variant: string;
})[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} variants must be an array.`);
  }
  if (value.length === 0) {
    throw new Error(`${context} variants must not be empty.`);
  }
  const variantsByKey = definitionsToRecord(union.variants);
  const seen = new Set<string>();
  return value.map((variant, index) => {
    if (!isRecord(variant)) {
      throw new Error(`${context} variant ${index} must be an object.`);
    }
    const variantName = parseRequiredNonEmptyString(
      `${context} variant ${index} variant`,
      variant.variant,
    );
    if (seen.has(variantName)) {
      throw new Error(`${context} variants reference duplicate "${variantName}".`);
    }
    seen.add(variantName);
    if (variantsByKey[variantName] === undefined) {
      throw new Error(
        `${context} variant "${variantName}" must match a variant in union "${union.entity}.${union.discriminator}".`,
      );
    }
    const { variant: _variant, ...presentationSource } = variant;
    return {
      variant: variantName,
      ...parseVariant(
        `${context} variant "${variantName}"`,
        `${viewName}.${variantName}`,
        presentationSource,
      ),
    };
  });
}
function assertViewUnionCoverage<TPresentation extends object>(
  context: string,
  unionName: string,
  union: EntityUnionSchema,
  variants: (TPresentation & {
    variant: string;
  })[],
  fallback: TPresentation | undefined,
) {
  if (fallback !== undefined) {
    return;
  }

  if (union.fallback !== undefined) {
    throw new Error(
      `${context} union "${unionName}" must define a fallback presentation because the union has a fallback.`,
    );
  }
  const presentedVariants = new Set(variants.map((variant) => variant.variant));
  const missingVariants = union.variants
    .map((variant) => variant.key)
    .filter((variantName) => !presentedVariants.has(variantName));
  if (missingVariants.length > 0) {
    throw new Error(
      `${context} union "${unionName}" must define variant presentations for "${missingVariants.join('", "')}" or a fallback.`,
    );
  }
}

function parseItemViewVariantPresentation(
  context: string,
  viewName: string,
  value: unknown,
  entityName: string,
  entity: EntitySchema,
): ItemViewVariantPresentationSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.presentation === "fields") {
    return parseRecordFieldsVariantPresentation(context, viewName, value, entityName, entity);
  }

  if (value.presentation !== "contextLink") {
    throw new Error(`${context} presentation must be "fields" or "contextLink".`);
  }
  assertExactKeys(context, value, ["presentation", "labelField", "target"]);
  const labelField = parseRequiredNonEmptyString(`${context} labelField`, value.labelField);
  const field = definitionsToRecord(entity.fields)[labelField];
  if (!field) {
    throw new Error(
      `${context} labelField references unknown field "${entityName}.${labelField}".`,
    );
  }

  if (field.type !== "text") {
    throw new Error(`${context} labelField must reference a text field.`);
  }

  return {
    presentation: "contextLink",
    labelField,
    target: parseContextSelectionTarget(`${context} target`, value.target),
  };
}

function parseRecordFieldsVariantPresentation(
  context: string,
  viewName: string,
  value: unknown,
  entityName: string,
  entity: EntitySchema,
): ViewVariantFieldsPresentationSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.presentation !== "fields") {
    throw new Error(`${context} presentation must be "fields".`);
  }

  assertExactKeys(context, value, ["presentation", "fields"]);

  const fields = parseListViewFields(viewName, entityName, value.fields, entity);
  assertViewHasFields(viewName, fields);

  return {
    presentation: "fields",
    fields,
  };
}

function parseCreateFieldsVariantPresentation(
  context: string,
  viewName: string,
  value: unknown,
  entityName: string,
  entity: EntitySchema,
): CreateViewVariantFieldsPresentationSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.presentation !== "fields") {
    throw new Error(`${context} presentation must be "fields".`);
  }

  assertExactKeys(context, value, ["presentation", "fields"]);

  const fields = parseCreateViewFields(viewName, entityName, value.fields, entity);
  assertViewHasFields(viewName, fields);

  return {
    presentation: "fields",
    fields,
  };
}

function parseContextSelectionTarget(
  context: string,
  value: unknown,
): ContextSelectionTargetSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["kind", "context", "record"]);

  if (value.kind !== "selectContext") {
    throw new Error(`${context} kind must be "selectContext".`);
  }

  const contextName = parseRequiredNonEmptyString(`${context} context`, value.context);

  if (value.record !== "self") {
    throw new Error(`${context} record must be "self".`);
  }

  return {
    kind: "selectContext",
    context: contextName,
    record: "self",
  };
}
