import type {
  EntitySchema,
  FieldValue,
  KeyedDefinition,
  RecordLinkFieldValueSourceSchema,
  RecordLinkMissingBehavior,
  RecordLinkQueryParameterSchema,
  RecordLinkSchema,
  RecordLinkTarget,
  RecordLinkUrlDestinationSchema,
  RecordLinkValueSourceSchema,
  StoredRecord,
} from "./types.ts";
import {
  assertExactKeys,
  definitionsToRecord,
  isFiniteNumber,
  isRecord,
  parseKeyedDefinitionArray,
  parseRequiredNonEmptyString,
} from "./schema-parse-helpers.ts";

export type RecordLinkResolution =
  | {
      kind: "available";
      href: string;
    }
  | {
      kind: "unavailable";
      reason: string;
    };

export type RecordLinkResolutionOptions = {
  mediaHrefForAssetId?: (assetId: string) => string | undefined;
};

const unavailableReason = "Link destination is unavailable.";

export function parseRecordLinks(
  context: string,
  value: unknown,
  entityName: string,
  entity: EntitySchema,
  entities: Record<string, EntitySchema>,
): KeyedDefinition<RecordLinkSchema>[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const links = parseKeyedDefinitionArray(context, value, (linkName, link) =>
    parseRecordLink(`${context} link "${linkName}"`, link, entityName, entity, entities),
  );

  return links.length === 0 ? undefined : links;
}

function parseRecordLink(
  context: string,
  value: Record<string, unknown>,
  entityName: string,
  entity: EntitySchema,
  entities: Record<string, EntitySchema>,
): RecordLinkSchema {
  assertExactKeys(context, value, ["key", "label", "target", "destination"]);

  return {
    label: parseRequiredNonEmptyString(`${context} label`, value.label),
    target: parseRecordLinkTarget(`${context} target`, value.target),
    destination: parseRecordLinkDestination(
      `${context} destination`,
      value.destination,
      entityName,
      entity,
      entities,
    ),
  };
}

function parseRecordLinkTarget(context: string, value: unknown): RecordLinkTarget {
  if (value !== "sameTab" && value !== "newTab") {
    throw new Error(`${context} must be "sameTab" or "newTab".`);
  }

  return value;
}

function parseRecordLinkDestination(
  context: string,
  value: unknown,
  entityName: string,
  entity: EntitySchema,
  entities: Record<string, EntitySchema>,
): RecordLinkUrlDestinationSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["type", "base", "query"]);
  if (value.type !== "url") {
    throw new Error(`${context} type must be "url".`);
  }

  const base = parseRecordLinkBaseUrl(`${context} base`, value.base);
  const query = parseRecordLinkQuery(`${context} query`, value.query, entityName, entity, entities);
  const baseParameterNames = new Set(new URL(base).searchParams.keys());

  for (const parameter of query) {
    if (baseParameterNames.has(parameter.name)) {
      throw new Error(
        `${context} query parameter "${parameter.name}" duplicates a parameter in the base URL.`,
      );
    }
  }

  return { type: "url", base, query };
}

function parseRecordLinkBaseUrl(context: string, value: unknown): string {
  const base = parseRequiredNonEmptyString(context, value);
  if (!/^https?:\/\//i.test(base)) {
    throw new Error(`${context} must be an absolute HTTP(S) URL.`);
  }

  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error(`${context} must be an absolute HTTP(S) URL.`);
  }

  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.hostname === "") {
    throw new Error(`${context} must be an absolute HTTP(S) URL.`);
  }

  if (url.username !== "" || url.password !== "") {
    throw new Error(`${context} must not include credentials.`);
  }

  return base;
}

function parseRecordLinkQuery(
  context: string,
  value: unknown,
  entityName: string,
  entity: EntitySchema,
  entities: Record<string, EntitySchema>,
): RecordLinkQueryParameterSchema[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  const names = new Set<string>();
  return value.map((parameter, index) => {
    const parsed = parseRecordLinkQueryParameter(
      `${context} parameter ${index}`,
      parameter,
      entityName,
      entity,
      entities,
    );
    if (names.has(parsed.name)) {
      throw new Error(`${context} contains duplicate parameter "${parsed.name}".`);
    }
    names.add(parsed.name);
    return parsed;
  });
}

function parseRecordLinkQueryParameter(
  context: string,
  value: unknown,
  entityName: string,
  entity: EntitySchema,
  entities: Record<string, EntitySchema>,
): RecordLinkQueryParameterSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["name", "source"], ["missing"]);
  return {
    name: parseRequiredNonEmptyString(`${context} name`, value.name),
    source: parseRecordLinkValueSource(
      `${context} source`,
      value.source,
      entityName,
      entity,
      entities,
    ),
    missing: parseRecordLinkMissingBehavior(`${context} missing`, value.missing),
  };
}

function parseRecordLinkMissingBehavior(
  context: string,
  value: unknown,
): RecordLinkMissingBehavior {
  if (value === undefined) {
    return "disable";
  }

  if (value !== "disable" && value !== "omit") {
    throw new Error(`${context} must be "disable" or "omit".`);
  }

  return value;
}

function parseRecordLinkValueSource(
  context: string,
  value: unknown,
  entityName: string,
  entity: EntitySchema,
  entities: Record<string, EntitySchema>,
): RecordLinkValueSourceSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.kind === "literal") {
    assertExactKeys(context, value, ["kind", "value"]);
    if (!isRecordLinkScalar(value.value)) {
      throw new Error(`${context} literal must be a string, finite number, or boolean.`);
    }
    return { kind: "literal", value: value.value };
  }

  if (value.kind === "mediaHref") {
    assertExactKeys(context, value, ["kind", "value"]);
    if (!isRecord(value.value)) {
      throw new Error(`${context} value must be an object.`);
    }
    return {
      kind: "mediaHref",
      value: parseRecordLinkFieldValueSource(
        `${context} value`,
        value.value,
        entityName,
        entity,
        entities,
        true,
      ),
    };
  }

  if (value.kind === "field" || value.kind === "referenceField") {
    return parseRecordLinkFieldValueSource(context, value, entityName, entity, entities, false);
  }

  throw new Error(`${context} kind must be "literal", "field", "referenceField", or "mediaHref".`);
}

function parseRecordLinkFieldValueSource(
  context: string,
  value: Record<string, unknown>,
  entityName: string,
  entity: EntitySchema,
  entities: Record<string, EntitySchema>,
  requireText: boolean,
): RecordLinkFieldValueSourceSchema {
  if (value.kind === "field") {
    assertExactKeys(context, value, ["kind", "field"]);
    const fieldName = parseRequiredNonEmptyString(`${context} field`, value.field);
    const field = definitionsToRecord(entity.fields)[fieldName];
    if (!field) {
      throw new Error(`${context} references unknown value field "${entityName}.${fieldName}".`);
    }
    if (field.type === "reference") {
      throw new Error(
        `${context} field "${entityName}.${fieldName}" must be a scalar value field.`,
      );
    }
    if (requireText && field.type !== "text") {
      throw new Error(
        `${context} field "${entityName}.${fieldName}" must be a text field containing a core image asset id.`,
      );
    }
    return { kind: "field", field: fieldName };
  }

  if (value.kind === "referenceField") {
    assertExactKeys(context, value, ["kind", "referenceField", "field"], ["targetEntity"]);
    const referenceFieldName = parseRequiredNonEmptyString(
      `${context} referenceField`,
      value.referenceField,
    );
    const referenceField = definitionsToRecord(entity.fields)[referenceFieldName];
    if (!referenceField) {
      throw new Error(
        `${context} references unknown reference field "${entityName}.${referenceFieldName}".`,
      );
    }
    if (referenceField.type !== "reference") {
      throw new Error(
        `${context} referenceField "${entityName}.${referenceFieldName}" must be a reference field.`,
      );
    }
    if (referenceField.to.includes(":")) {
      throw new Error(
        `${context} referenceField "${entityName}.${referenceFieldName}" must target a local entity.`,
      );
    }

    const targetEntity = entities[referenceField.to];
    if (!targetEntity) {
      throw new Error(
        `${context} referenceField "${entityName}.${referenceFieldName}" targets unknown entity "${referenceField.to}".`,
      );
    }
    if (value.targetEntity !== undefined && value.targetEntity !== referenceField.to) {
      throw new Error(
        `${context} targetEntity must match reference target "${referenceField.to}".`,
      );
    }
    const fieldName = parseRequiredNonEmptyString(`${context} field`, value.field);
    const field = definitionsToRecord(targetEntity.fields)[fieldName];
    if (!field) {
      throw new Error(
        `${context} references unknown value field "${referenceField.to}.${fieldName}".`,
      );
    }
    if (field.type === "reference") {
      throw new Error(
        `${context} field "${referenceField.to}.${fieldName}" must be a scalar value field.`,
      );
    }
    if (requireText && field.type !== "text") {
      throw new Error(
        `${context} field "${referenceField.to}.${fieldName}" must be a text field containing a core image asset id.`,
      );
    }

    return {
      kind: "referenceField",
      referenceField: referenceFieldName,
      targetEntity: referenceField.to,
      field: fieldName,
    };
  }

  throw new Error(`${context} kind must be "field" or "referenceField".`);
}

export function resolveRecordLink(
  link: RecordLinkSchema,
  record: StoredRecord,
  recordsById: Readonly<Record<string, StoredRecord>>,
  options: RecordLinkResolutionOptions = {},
): RecordLinkResolution {
  const url = new URL(link.destination.base);

  for (const parameter of link.destination.query) {
    const result = resolveRecordLinkValue(parameter.source, record, recordsById, options);
    if (result.kind === "invalid") {
      return { kind: "unavailable", reason: unavailableReason };
    }
    if (result.kind === "missing") {
      if (parameter.missing === "omit") {
        continue;
      }
      return { kind: "unavailable", reason: unavailableReason };
    }

    url.searchParams.append(parameter.name, String(result.value));
  }

  return { kind: "available", href: url.toString() };
}

type RecordLinkValueResolution =
  | { kind: "value"; value: FieldValue }
  | { kind: "missing" }
  | { kind: "invalid" };

function resolveRecordLinkValue(
  source: RecordLinkValueSourceSchema,
  record: StoredRecord,
  recordsById: Readonly<Record<string, StoredRecord>>,
  options: RecordLinkResolutionOptions,
): RecordLinkValueResolution {
  if (source.kind === "literal") {
    return resolveRuntimeScalar(source.value);
  }

  if (source.kind === "field") {
    return resolveRuntimeScalar(record.values[source.field]);
  }

  if (source.kind === "mediaHref") {
    const assetId = resolveRecordLinkValue(source.value, record, recordsById, options);
    if (assetId.kind !== "value") {
      return assetId;
    }
    if (typeof assetId.value !== "string") {
      return { kind: "invalid" };
    }

    const href = options.mediaHrefForAssetId?.(assetId.value);
    return href === undefined ? { kind: "missing" } : resolveRuntimeScalar(href);
  }

  const referenceId = record.values[source.referenceField];
  if (referenceId === undefined) {
    return { kind: "missing" };
  }
  if (typeof referenceId !== "string") {
    return { kind: "invalid" };
  }

  const referencedRecord = recordsById[referenceId];
  if (
    referencedRecord === undefined ||
    referencedRecord.entity !== source.targetEntity ||
    referencedRecord.deletedAt !== undefined
  ) {
    return { kind: "missing" };
  }

  return resolveRuntimeScalar(referencedRecord.values[source.field]);
}

function resolveRuntimeScalar(value: unknown): RecordLinkValueResolution {
  if (value === undefined) {
    return { kind: "missing" };
  }

  if (!isRecordLinkScalar(value)) {
    return { kind: "invalid" };
  }

  return { kind: "value", value };
}

function isRecordLinkScalar(value: unknown): value is FieldValue {
  return typeof value === "string" || typeof value === "boolean" || isFiniteNumber(value);
}
