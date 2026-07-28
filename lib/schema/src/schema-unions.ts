import {
  assertExactKeys,
  definitionsToRecord,
  isRecord,
  parseKeyedDefinitionArray,
  parseRequiredNonEmptyString,
} from "./schema-parse-helpers.ts";
import type {
  EntitySchema,
  EntityUnionSchema,
  EntityUnionVariantSchema,
  KeyedDefinition,
} from "./types.ts";
export function parseUnions(
  value: unknown,
  entities: Record<string, EntitySchema>,
): KeyedDefinition<EntityUnionSchema>[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return parseKeyedDefinitionArray("Schema unions", value, (unionName, union) =>
    parseUnion(unionName, union, entities),
  );
}
function parseUnion(
  unionName: string,
  value: unknown,
  entities: Record<string, EntitySchema>,
): EntityUnionSchema {
  const context = `Union "${unionName}"`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }
  assertExactKeys(context, value, ["key", "entity", "discriminator", "variants"], ["fallback"]);
  const entityName = parseRequiredNonEmptyString(`${context} entity`, value.entity);
  const discriminator = parseRequiredNonEmptyString(
    `${context} discriminator`,
    value.discriminator,
  );
  const entity = entities[entityName];

  if (!entity) {
    throw new Error(`${context} references unknown entity "${entityName}".`);
  }
  const fieldsByKey = definitionsToRecord(entity.fields);
  const discriminatorField = fieldsByKey[discriminator];
  if (!discriminatorField) {
    throw new Error(
      `${context} discriminator references unknown field "${entityName}.${discriminator}".`,
    );
  }

  if (discriminatorField.type !== "enum") {
    throw new Error(
      `${context} discriminator field "${entityName}.${discriminator}" must be an enum field.`,
    );
  }

  if (!discriminatorField.required) {
    throw new Error(
      `${context} discriminator field "${entityName}.${discriminator}" must be required.`,
    );
  }
  const discriminatorValues = discriminatorField.values.map((definition) => definition.key);
  const variants = parseUnionVariants(
    context,
    value.variants,
    entityName,
    entity,
    discriminatorValues,
  );
  const fallback =
    value.fallback === undefined
      ? undefined
      : parseUnionVariant(`${context} fallback`, value.fallback, entityName, entity);

  if (fallback === undefined) {
    assertAllDiscriminatorValuesCovered(context, variants, discriminatorValues);
  }

  return {
    entity: entityName,
    discriminator,
    variants,
    ...(fallback === undefined ? {} : { fallback }),
  };
}

function parseUnionVariants(
  context: string,
  value: unknown,
  entityName: string,
  entity: EntitySchema,
  discriminatorValues: string[],
): KeyedDefinition<EntityUnionVariantSchema>[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context} variants must not be empty.`);
  }
  const discriminatorValueSet = new Set(discriminatorValues);
  return parseKeyedDefinitionArray(`${context} variants`, value, (variantName, variant) => {
    if (!discriminatorValueSet.has(variantName)) {
      throw new Error(`${context} variant "${variantName}" must match a discriminator enum value.`);
    }
    return parseUnionVariant(
      `${context} variant "${variantName}"`,
      variant,
      entityName,
      entity,
      true,
    );
  });
}
function parseUnionVariant(
  context: string,
  value: unknown,
  entityName: string,
  entity: EntitySchema,
  keyed = false,
): EntityUnionVariantSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }
  assertExactKeys(context, value, keyed ? ["key", "label", "fields"] : ["label", "fields"], [
    "requiredFields",
  ]);
  return {
    label: parseRequiredNonEmptyString(`${context} label`, value.label),
    fields: parseFieldNames(`${context} fields`, value.fields, entityName, entity),
    ...(value.requiredFields === undefined
      ? {}
      : {
          requiredFields: parseFieldNames(
            `${context} requiredFields`,
            value.requiredFields,
            entityName,
            entity,
          ),
        }),
  };
}

function parseFieldNames(
  context: string,
  value: unknown,
  entityName: string,
  entity: EntitySchema,
): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context} must be a non-empty array.`);
  }

  const names = value.map((fieldName, index) => {
    if (typeof fieldName !== "string" || fieldName.trim() === "") {
      throw new Error(`${context} must contain non-empty field names.`);
    }
    if (!definitionsToRecord(entity.fields)[fieldName]) {
      throw new Error(
        `${context} field ${index} references unknown field "${entityName}.${fieldName}".`,
      );
    }

    return fieldName;
  });

  const duplicate = names.find((fieldName, index) => names.indexOf(fieldName) !== index);
  if (duplicate) {
    throw new Error(`${context} references duplicate field "${duplicate}".`);
  }
  return names;
}
function assertAllDiscriminatorValuesCovered(
  context: string,
  variants: KeyedDefinition<EntityUnionVariantSchema>[],
  discriminatorValues: string[],
) {
  const variantsByKey = definitionsToRecord(variants);
  const missingValues = discriminatorValues.filter((value) => variantsByKey[value] === undefined);
  if (missingValues.length > 0) {
    throw new Error(
      `${context} must define variants for discriminator values "${missingValues.join('", "')}" or a fallback.`,
    );
  }
}
