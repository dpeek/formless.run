import { assertSchemaLocalEntityKey, parseQualifiedEntityName } from "./entity-names.ts";
import { parseEntityId } from "./entity-ids.ts";
import { parseStateMachinesForEntities } from "./schema-state-machines.ts";
import {
  assertExactKeys,
  assertSupportedKeys,
  definitionsToRecord,
  isFiniteNumber,
  isRecord,
  parseKeyedDefinitionArray,
  parseOptionalNonEmptyString,
} from "./schema-parse-helpers.ts";
import type {
  BooleanFieldSchema,
  ContactTextFieldFormat,
  DateFieldSchema,
  DocumentAssetMimeType,
  EntityConstraintSchema,
  EntitySchema,
  EnumFieldSchema,
  EnumValuePresentationSchema,
  EnumValueSchema,
  FieldSchema,
  KeyedDefinition,
  NumberFieldSchema,
  ReferenceFieldSchema,
  TextFieldFormat,
  TextFieldDocumentAssetPolicySchema,
  TextFieldSchema,
} from "./types.ts";
import { DOCUMENT_ASSET_POLICY_MAX_BYTES, documentAssetMimeTypes } from "./types.ts";

const textFieldFormats = [
  "plain",
  "longText",
  "markdown",
  "href",
  "slug",
  "color",
  "icon",
  "email",
  "phone",
] satisfies TextFieldFormat[];

const operationTextFieldFormats = ["email", "phone"] satisfies ContactTextFieldFormat[];

export const supportedIdentityReferenceTargets = [
  "auth:principal",
  "auth:organization",
  "auth:group",
] as const;

export type SupportedIdentityReferenceTarget = (typeof supportedIdentityReferenceTargets)[number];

export function isSupportedIdentityReferenceTarget(
  value: string,
): value is SupportedIdentityReferenceTarget {
  return (supportedIdentityReferenceTargets as readonly string[]).includes(value);
}
export type ParsedEntityCatalog = {
  entities: KeyedDefinition<EntitySchema>[];
  operationInputsByEntity: Record<string, unknown>;
};
export function parseEntities(value: unknown): ParsedEntityCatalog {
  const operationInputsByEntity: Record<string, unknown> = {};
  const stateMachineInputsByEntity: Record<string, unknown> = {};
  const entities = parseKeyedDefinitionArray(
    "Schema entities",
    value,
    (entityName, entityValue) => {
      assertSchemaLocalEntityKey(`Schema entity key "${entityName}"`, entityName);
      const { entity, operationsInput, stateMachinesInput } = parseEntityBase(
        entityName,
        entityValue,
      );
      if (operationsInput !== undefined) {
        operationInputsByEntity[entityName] = operationsInput;
      }
      if (stateMachinesInput !== undefined) {
        stateMachineInputsByEntity[entityName] = stateMachinesInput;
      }
      return entity;
    },
  );
  const entityKeysById = new Map<string, string>();
  for (const entity of entities) {
    const existingEntityKey = entityKeysById.get(entity.id);
    if (existingEntityKey !== undefined) {
      throw new Error(
        `Schema entities contain duplicate entity id "${entity.id}" for keys "${existingEntityKey}" and "${entity.key}".`,
      );
    }
    entityKeysById.set(entity.id, entity.key);
  }
  const entitiesByKey = definitionsToRecord(entities);
  validateReferenceFields(entities, entitiesByKey);
  const entitiesWithStateMachines = parseStateMachinesForEntities(
    entities,
    stateMachineInputsByEntity,
  );
  return { entities: entitiesWithStateMachines, operationInputsByEntity };
}
function validateReferenceFields(
  entities: KeyedDefinition<EntitySchema>[],
  entitiesByKey: Record<string, EntitySchema>,
) {
  for (const entity of entities) {
    for (const field of entity.fields) {
      if (field.type !== "reference") {
        continue;
      }
      const targetEntity = resolveReferenceTarget(
        `Field "${entity.key}.${field.key}" reference target`,
        field.to,
        entitiesByKey,
      );
      if (targetEntity === undefined) {
        continue;
      }

      if (field.displayField === undefined) {
        continue;
      }
      const displayField = definitionsToRecord(targetEntity.fields)[field.displayField];
      if (!displayField) {
        throw new Error(
          `Field "${entity.key}.${field.key}" displayField references unknown field "${field.to}.${field.displayField}".`,
        );
      }
      if (displayField.type !== "text") {
        throw new Error(
          `Field "${entity.key}.${field.key}" displayField must reference a text field.`,
        );
      }
    }
  }
}

function resolveReferenceTarget(
  context: string,
  entityName: string,
  entities: Record<string, EntitySchema>,
): EntitySchema | undefined {
  if (entityName.includes(":")) {
    const qualifiedName = parseQualifiedEntityName(`${context} "${entityName}"`, entityName);

    if (entities[qualifiedName.entityKey] !== undefined) {
      throw new Error(
        `${context} "${entityName}" references local entity "${qualifiedName.entityKey}" with a qualified name. Use local entity key "${qualifiedName.entityKey}".`,
      );
    }

    if (isSupportedIdentityReferenceTarget(entityName)) {
      return undefined;
    }
  } else {
    assertSchemaLocalEntityKey(`${context} "${entityName}"`, entityName);
  }

  const entity = entities[entityName];
  if (!entity) {
    throw new Error(`${context} references unknown entity "${entityName}".`);
  }

  return entity;
}

function parseEntityBase(
  entityName: string,
  value: unknown,
): {
  entity: EntitySchema;
  operationsInput: unknown;
  stateMachinesInput: unknown;
} {
  if (!isRecord(value)) {
    throw new Error(`Entity "${entityName}" must be an object.`);
  }
  assertSupportedKeys(`Entity "${entityName}"`, value, [
    "key",
    "id",
    "label",
    "fields",
    "constraints",
    "stateMachines",
    "operations",
  ]);

  const id = parseEntityId(`Entity "${entityName}" id`, value.id);
  const label = value.label;
  if (typeof label !== "string" || label.trim() === "") {
    throw new Error(`Entity "${entityName}" must have a label.`);
  }
  const fields = parseFields(entityName, value.fields);
  if (fields.length === 0) {
    throw new Error(`Entity "${entityName}" must define at least one field.`);
  }
  const constraints = parseEntityConstraints(
    entityName,
    value.constraints,
    definitionsToRecord(fields),
  );
  return {
    entity: {
      id,
      label,
      fields,
      ...(constraints === undefined ? {} : { constraints }),
    },
    operationsInput: value.operations,
    stateMachinesInput: value.stateMachines,
  };
}

function parseEntityConstraints(
  entityName: string,
  value: unknown,
  fields: Record<string, FieldSchema>,
): KeyedDefinition<EntityConstraintSchema>[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const constraints = parseKeyedDefinitionArray(
    `Entity "${entityName}" constraints`,
    value,
    (constraintName, constraint) => {
      return parseEntityConstraint(entityName, constraintName, constraint, fields);
    },
  );
  if (constraints.length === 0) {
    throw new Error(`Entity "${entityName}" constraints must not be empty.`);
  }
  return constraints;
}
function parseEntityConstraint(
  entityName: string,
  constraintName: string,
  value: unknown,
  fields: Record<string, FieldSchema>,
): EntityConstraintSchema {
  const context = `Entity "${entityName}" constraint "${constraintName}"`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }
  if (value.kind === "unique") {
    assertExactKeys(context, value, ["key", "kind", "fields"]);
    return {
      kind: "unique",
      fields: parseUniqueConstraintFields(context, value.fields, fields),
    };
  }

  throw new Error(`${context} has unsupported kind "${String(value.kind)}".`);
}

function parseUniqueConstraintFields(
  context: string,
  value: unknown,
  fields: Record<string, FieldSchema>,
): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context} fields must be a non-empty array.`);
  }

  const names = value.map((fieldName) => {
    if (typeof fieldName !== "string" || fieldName.trim() === "") {
      throw new Error(`${context} fields must contain non-empty field names.`);
    }

    if (!fields[fieldName]) {
      throw new Error(`${context} references unknown field "${fieldName}".`);
    }

    return fieldName;
  });

  if (new Set(names).size !== names.length) {
    throw new Error(`${context} fields must be unique.`);
  }
  return names;
}
function parseFields(entityName: string, value: unknown): KeyedDefinition<FieldSchema>[] {
  return parseKeyedDefinitionArray(`Entity "${entityName}" fields`, value, (fieldName, field) =>
    parseField(entityName, fieldName, field),
  );
}
function parseField(entityName: string, fieldName: string, value: unknown): FieldSchema {
  if (!isRecord(value)) {
    throw new Error(`Field "${entityName}.${fieldName}" must be an object.`);
  }

  if (typeof value.required !== "boolean") {
    throw new Error(`Field "${entityName}.${fieldName}" must declare whether it is required.`);
  }

  const label = parseFieldLabel(entityName, fieldName, value.label);
  const context = `Field "${entityName}.${fieldName}"`;

  if ("asset" in value && value.type !== "text") {
    throw new Error(`${context} asset policy is only supported on text fields.`);
  }

  if (value.type === "text") {
    assertExactKeys(
      context,
      value,
      ["key", "type", "required"],
      ["label", "format", "suggestions", "asset"],
    );
    const field: TextFieldSchema = {
      type: "text",
      required: value.required,
    };

    if (label !== undefined) {
      field.label = label;
    }

    const format = parseOptionalTextFieldFormat(
      `Field "${entityName}.${fieldName}" text format`,
      value.format,
    );
    if (format !== undefined) {
      field.format = format;
    }

    const suggestions = parseOptionalTextSuggestions(
      `Field "${entityName}.${fieldName}" text suggestions`,
      value.suggestions,
    );
    if (suggestions !== undefined) {
      field.suggestions = suggestions;
    }

    const asset = parseOptionalTextFieldAssetPolicy(`${context} asset policy`, value.asset);
    if (asset !== undefined) {
      field.asset = asset;
    }

    return field;
  }

  if (value.type === "boolean") {
    if ("default" in value && typeof value.default !== "boolean") {
      throw new Error(`Field "${entityName}.${fieldName}" boolean default must be a boolean.`);
    }
    assertExactKeys(context, value, ["key", "type", "required"], ["label", "default"]);
    const field: BooleanFieldSchema = {
      type: "boolean",
      required: value.required,
    };

    if (label !== undefined) {
      field.label = label;
    }

    if ("default" in value) {
      field.default = value.default as boolean;
    }
    return field;
  }
  if (value.type === "date") {
    assertExactKeys(context, value, ["key", "type", "required"], ["label"]);
    const field: DateFieldSchema = {
      type: "date",
      required: value.required,
    };

    if (label !== undefined) {
      field.label = label;
    }

    return field;
  }

  if (value.type === "number") {
    assertExactKeys(
      `Field "${entityName}.${fieldName}"`,
      value,
      ["key", "type", "required"],
      ["label", "default", "min", "max", "integer"],
    );
    const field: NumberFieldSchema = {
      type: "number",
      required: value.required,
    };

    if (label !== undefined) {
      field.label = label;
    }

    if ("min" in value) {
      if (!isFiniteNumber(value.min)) {
        throw new Error(`Field "${entityName}.${fieldName}" number min must be finite.`);
      }

      field.min = value.min;
    }

    if ("max" in value) {
      if (!isFiniteNumber(value.max)) {
        throw new Error(`Field "${entityName}.${fieldName}" number max must be finite.`);
      }

      field.max = value.max;
    }

    if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
      throw new Error(
        `Field "${entityName}.${fieldName}" number min must be less than or equal to max.`,
      );
    }

    if ("integer" in value) {
      if (typeof value.integer !== "boolean") {
        throw new Error(`Field "${entityName}.${fieldName}" number integer must be a boolean.`);
      }

      field.integer = value.integer;
    }

    if ("default" in value) {
      if (!isFiniteNumber(value.default)) {
        throw new Error(`Field "${entityName}.${fieldName}" number default must be finite.`);
      }

      assertNumberFieldValue(entityName, fieldName, value.default, field, "default");
      field.default = value.default;
    }

    return field;
  }

  if (value.type === "enum") {
    assertExactKeys(
      `Field "${entityName}.${fieldName}"`,
      value,
      ["key", "type", "required", "values"],
      ["label", "default"],
    );
    const values = parseEnumValues(entityName, fieldName, value.values);
    const field: EnumFieldSchema = {
      type: "enum",
      required: value.required,
      values,
    };

    if (label !== undefined) {
      field.label = label;
    }
    if ("default" in value) {
      if (typeof value.default !== "string" || !definitionsToRecord(values)[value.default]) {
        throw new Error(
          `Field "${entityName}.${fieldName}" enum default must match one of its values.`,
        );
      }

      field.default = value.default;
    }

    return field;
  }

  if (value.type === "reference") {
    assertExactKeys(
      `Field "${entityName}.${fieldName}"`,
      value,
      ["key", "type", "required", "to"],
      ["label", "displayField"],
    );
    if (typeof value.to !== "string" || value.to.trim() === "") {
      throw new Error(
        `Field "${entityName}.${fieldName}" reference target must be a non-empty entity name.`,
      );
    }

    const displayField = parseOptionalNonEmptyString(
      `Field "${entityName}.${fieldName}" displayField`,
      value.displayField,
    );
    const field: ReferenceFieldSchema = {
      type: "reference",
      required: value.required,
      to: value.to,
    };

    if (label !== undefined) {
      field.label = label;
    }

    if (displayField !== undefined) {
      field.displayField = displayField;
    }

    return field;
  }

  throw new Error(
    `Field "${entityName}.${fieldName}" has unsupported type "${String(value.type)}".`,
  );
}

function parseOptionalTextFieldAssetPolicy(
  context: string,
  value: unknown,
): TextFieldDocumentAssetPolicySchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["kind", "acceptedMimeTypes", "maxBytes", "access"]);

  if (value.kind !== "document") {
    throw new Error(`${context} kind must be "document".`);
  }

  const acceptedMimeTypes = parseDocumentAssetMimeTypes(
    `${context} acceptedMimeTypes`,
    value.acceptedMimeTypes,
  );
  const maxBytes = value.maxBytes;
  if (!Number.isSafeInteger(maxBytes) || (maxBytes as number) <= 0) {
    throw new Error(`${context} maxBytes must be a positive integer.`);
  }
  if ((maxBytes as number) > DOCUMENT_ASSET_POLICY_MAX_BYTES) {
    throw new Error(`${context} maxBytes must be at most ${DOCUMENT_ASSET_POLICY_MAX_BYTES}.`);
  }

  const access = value.access;
  if (access !== "public" && access !== "private") {
    throw new Error(`${context} access must be "public" or "private".`);
  }

  return {
    kind: "document",
    acceptedMimeTypes,
    maxBytes: maxBytes as number,
    access,
  };
}

function parseDocumentAssetMimeTypes(context: string, value: unknown): DocumentAssetMimeType[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context} must be a non-empty array.`);
  }

  const mimeTypes = value.map((mimeType, index) => {
    if (typeof mimeType !== "string" || mimeType.trim() === "") {
      throw new Error(`${context}[${index}] must be a non-empty string.`);
    }

    if (mimeType !== mimeType.trim().toLowerCase() || mimeType.includes(";")) {
      throw new Error(`${context}[${index}] must be a normalized MIME type.`);
    }

    if (!(documentAssetMimeTypes as readonly string[]).includes(mimeType)) {
      throw new Error(
        `${context}[${index}] must be a supported document MIME type (${documentAssetMimeTypes.join(", ")}).`,
      );
    }

    return mimeType as DocumentAssetMimeType;
  });

  if (new Set(mimeTypes).size !== mimeTypes.length) {
    throw new Error(`${context} must not contain duplicates.`);
  }

  return mimeTypes;
}

function assertNumberFieldValue(
  entityName: string,
  fieldName: string,
  value: number,
  field: NumberFieldSchema,
  valueLabel: string,
) {
  if (field.min !== undefined && value < field.min) {
    throw new Error(`Field "${entityName}.${fieldName}" number ${valueLabel} must be >= min.`);
  }

  if (field.max !== undefined && value > field.max) {
    throw new Error(`Field "${entityName}.${fieldName}" number ${valueLabel} must be <= max.`);
  }

  if (field.integer && !Number.isInteger(value)) {
    throw new Error(`Field "${entityName}.${fieldName}" number ${valueLabel} must be an integer.`);
  }
}

function parseEnumValues(
  entityName: string,
  fieldName: string,
  value: unknown,
): KeyedDefinition<EnumValueSchema>[] {
  const values = parseKeyedDefinitionArray(
    `Field "${entityName}.${fieldName}" enum values`,
    value,
    (enumValue, enumValueSchema) =>
      parseEnumValue(entityName, fieldName, enumValue, enumValueSchema),
  );
  if (values.length === 0) {
    throw new Error(`Field "${entityName}.${fieldName}" enum values must not be empty.`);
  }
  return values;
}
function parseEnumValue(
  entityName: string,
  fieldName: string,
  enumValue: string,
  value: unknown,
): EnumValueSchema {
  if (!isRecord(value)) {
    throw new Error(
      `Field "${entityName}.${fieldName}" enum value "${enumValue}" must be an object.`,
    );
  }

  assertExactKeys(
    `Field "${entityName}.${fieldName}" enum value "${enumValue}"`,
    value,
    ["key", "label"],
    ["presentation"],
  );
  if (typeof value.label !== "string" || value.label.trim() === "") {
    throw new Error(
      `Field "${entityName}.${fieldName}" enum value "${enumValue}" label must be a non-empty string.`,
    );
  }

  const presentation = parseEnumValuePresentation(
    `Field "${entityName}.${fieldName}" enum value "${enumValue}" presentation`,
    value.presentation,
  );

  return {
    label: value.label,
    ...(presentation === undefined ? {} : { presentation }),
  };
}

function parseEnumValuePresentation(
  context: string,
  value: unknown,
): EnumValuePresentationSchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, [], ["icon", "color"]);

  const icon = parseOptionalNonEmptyString(`${context} icon`, value.icon);
  const color = parseOptionalNonEmptyString(`${context} color`, value.color);

  if (icon === undefined && color === undefined) {
    throw new Error(`${context} must include "icon" or "color".`);
  }

  return {
    ...(icon === undefined ? {} : { icon }),
    ...(color === undefined ? {} : { color }),
  };
}

function parseFieldLabel(
  entityName: string,
  fieldName: string,
  value: unknown,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Field "${entityName}.${fieldName}" label must be a non-empty string.`);
  }

  return value;
}

export function parseOptionalTextFieldFormat(
  context: string,
  value: unknown,
): TextFieldFormat | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || !textFieldFormats.includes(value as TextFieldFormat)) {
    throw new Error(
      `${context} must be "plain", "longText", "markdown", "href", "slug", "color", "icon", "email", or "phone".`,
    );
  }

  return value as TextFieldFormat;
}

export function parseOptionalOperationTextFieldFormat(
  context: string,
  value: unknown,
): ContactTextFieldFormat | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== "string" ||
    !operationTextFieldFormats.includes(value as ContactTextFieldFormat)
  ) {
    throw new Error(`${context} must be "email" or "phone".`);
  }

  return value as ContactTextFieldFormat;
}

export function parseOptionalTextSuggestions(
  context: string,
  value: unknown,
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context} must be a non-empty array.`);
  }

  return value.map((suggestion, index) => {
    if (typeof suggestion !== "string" || suggestion.trim() === "") {
      throw new Error(`${context}[${index}] must be a non-empty string.`);
    }

    return suggestion;
  });
}
