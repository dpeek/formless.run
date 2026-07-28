import {
  assertExactKeys,
  definitionsToRecord,
  isRecord,
  parseKeyedDefinitionArray,
  parseOptionalNonEmptyString,
  parseRequiredNonEmptyString,
} from "./schema-parse-helpers.ts";
import { assertSchemaLocalEntityKey, parseQualifiedEntityName } from "./entity-names.ts";
import type {
  EntitySchema,
  FieldSchema,
  KeyedDefinition,
  ManyToManyRelationshipSchema,
  ReferenceFieldSchema,
  RelationshipSchema,
  ToManyRelationshipSchema,
  ToOneRelationshipSchema,
  UniqueConstraintSchema,
} from "./types.ts";

export function parseRelationships(
  value: unknown,
  entities: Record<string, EntitySchema>,
): KeyedDefinition<RelationshipSchema>[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const relationships = parseKeyedDefinitionArray(
    "Schema relationships",
    value,
    (relationshipName, relationship) => parseRelationship(relationshipName, relationship, entities),
  );
  validateInverseRelationships(relationships);
  return relationships;
}
function parseRelationship(
  relationshipName: string,
  value: unknown,
  entities: Record<string, EntitySchema>,
): RelationshipSchema {
  const context = `Relationship "${relationshipName}"`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.kind === "toOne") {
    return parseToOneRelationship(context, value, entities);
  }

  if (value.kind === "toMany") {
    return parseToManyRelationship(context, value, entities);
  }

  if (value.kind === "manyToMany") {
    return parseManyToManyRelationship(context, value, entities);
  }

  throw new Error(`${context} has unsupported kind "${String(value.kind)}".`);
}

function parseToOneRelationship(
  context: string,
  value: Record<string, unknown>,
  entities: Record<string, EntitySchema>,
): ToOneRelationshipSchema {
  assertExactKeys(context, value, ["key", "kind", "from", "to"], ["label", "inverse"]);
  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const from = parseReferenceFieldEndpoint(`${context} from`, value.from, entities);
  const to = parseEntityEndpoint(`${context} to`, value.to, entities);
  const inverse = parseOptionalNonEmptyString(`${context} inverse`, value.inverse);

  if (from.field.to !== to.entity) {
    throw new Error(
      `${context} from field "${from.entity}.${from.fieldName}" must reference entity "${to.entity}".`,
    );
  }

  return {
    kind: "toOne",
    ...(label === undefined ? {} : { label }),
    from: { entity: from.entity, field: from.fieldName },
    to,
    ...(inverse === undefined ? {} : { inverse }),
  };
}

function parseToManyRelationship(
  context: string,
  value: Record<string, unknown>,
  entities: Record<string, EntitySchema>,
): ToManyRelationshipSchema {
  assertExactKeys(context, value, ["key", "kind", "from", "to"], ["label", "inverse"]);
  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const from = parseEntityEndpoint(`${context} from`, value.from, entities);
  const to = parseReferenceFieldEndpoint(`${context} to`, value.to, entities);
  const inverse = parseOptionalNonEmptyString(`${context} inverse`, value.inverse);

  if (to.field.to !== from.entity) {
    throw new Error(
      `${context} to field "${to.entity}.${to.fieldName}" must reference entity "${from.entity}".`,
    );
  }

  return {
    kind: "toMany",
    ...(label === undefined ? {} : { label }),
    from,
    to: { entity: to.entity, field: to.fieldName },
    ...(inverse === undefined ? {} : { inverse }),
  };
}

function parseManyToManyRelationship(
  context: string,
  value: Record<string, unknown>,
  entities: Record<string, EntitySchema>,
): ManyToManyRelationshipSchema {
  assertExactKeys(context, value, ["key", "kind", "from", "to", "through"], ["label", "inverse"]);
  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const from = parseEntityEndpoint(`${context} from`, value.from, entities);
  const to = parseEntityEndpoint(`${context} to`, value.to, entities);
  const through = parseManyToManyThrough(context, value.through, from.entity, to.entity, entities);
  const inverse = parseOptionalNonEmptyString(`${context} inverse`, value.inverse);

  return {
    kind: "manyToMany",
    ...(label === undefined ? {} : { label }),
    from,
    to,
    through,
    ...(inverse === undefined ? {} : { inverse }),
  };
}

function parseEntityEndpoint(
  context: string,
  value: unknown,
  entities: Record<string, EntitySchema>,
): {
  entity: string;
} {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["entity"]);
  const entityName = parseRequiredNonEmptyString(`${context} entity`, value.entity);
  requireEntity(context, entityName, entities);

  return { entity: entityName };
}

function parseReferenceFieldEndpoint(
  context: string,
  value: unknown,
  entities: Record<string, EntitySchema>,
): {
  entity: string;
  fieldName: string;
  field: ReferenceFieldSchema;
} {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["entity", "field"]);
  const entityName = parseRequiredNonEmptyString(`${context} entity`, value.entity);
  const fieldName = parseRequiredNonEmptyString(`${context} field`, value.field);
  const entity = requireEntity(context, entityName, entities);
  const field = requireField(context, entityName, fieldName, entity);

  if (field.type !== "reference") {
    throw new Error(`${context} field "${entityName}.${fieldName}" must be a reference field.`);
  }

  return { entity: entityName, fieldName, field };
}

function parseManyToManyThrough(
  context: string,
  value: unknown,
  fromEntityName: string,
  toEntityName: string,
  entities: Record<string, EntitySchema>,
): ManyToManyRelationshipSchema["through"] {
  const throughContext = `${context} through`;

  if (!isRecord(value)) {
    throw new Error(`${throughContext} must be an object.`);
  }

  assertExactKeys(throughContext, value, ["entity", "fromField", "toField"], ["uniqueConstraint"]);

  const entityName = parseRequiredNonEmptyString(`${throughContext} entity`, value.entity);
  const fromField = parseRequiredNonEmptyString(`${throughContext} fromField`, value.fromField);
  const toField = parseRequiredNonEmptyString(`${throughContext} toField`, value.toField);
  const uniqueConstraint = parseOptionalNonEmptyString(
    `${throughContext} uniqueConstraint`,
    value.uniqueConstraint,
  );
  const entity = requireEntity(throughContext, entityName, entities);
  const parsedFromField = requireReferenceField(
    `${throughContext} fromField`,
    entityName,
    fromField,
    entity,
  );
  const parsedToField = requireReferenceField(
    `${throughContext} toField`,
    entityName,
    toField,
    entity,
  );

  if (parsedFromField.to !== fromEntityName) {
    throw new Error(
      `${throughContext} fromField "${entityName}.${fromField}" must reference entity "${fromEntityName}".`,
    );
  }

  if (parsedToField.to !== toEntityName) {
    throw new Error(
      `${throughContext} toField "${entityName}.${toField}" must reference entity "${toEntityName}".`,
    );
  }

  if (uniqueConstraint !== undefined) {
    validateThroughUniqueConstraint(
      `${throughContext} uniqueConstraint`,
      entityName,
      entity,
      uniqueConstraint,
      fromField,
      toField,
    );
  }

  return {
    entity: entityName,
    fromField,
    toField,
    ...(uniqueConstraint === undefined ? {} : { uniqueConstraint }),
  };
}

function requireEntity(
  context: string,
  entityName: string,
  entities: Record<string, EntitySchema>,
): EntitySchema {
  if (entityName.includes(":")) {
    const qualifiedName = parseQualifiedEntityName(`${context} entity "${entityName}"`, entityName);

    if (entities[qualifiedName.entityKey] !== undefined) {
      throw new Error(
        `${context} entity "${entityName}" references local entity "${qualifiedName.entityKey}" with a qualified name. Use local entity key "${qualifiedName.entityKey}".`,
      );
    }
  } else {
    assertSchemaLocalEntityKey(`${context} entity "${entityName}"`, entityName);
  }

  const entity = entities[entityName];

  if (!entity) {
    throw new Error(`${context} references unknown entity "${entityName}".`);
  }

  return entity;
}

function requireField(
  context: string,
  entityName: string,
  fieldName: string,
  entity: EntitySchema,
): FieldSchema {
  const field = definitionsToRecord(entity.fields)[fieldName];
  if (!field) {
    throw new Error(`${context} references unknown field "${entityName}.${fieldName}".`);
  }

  return field;
}

function requireReferenceField(
  context: string,
  entityName: string,
  fieldName: string,
  entity: EntitySchema,
): ReferenceFieldSchema {
  const field = requireField(context, entityName, fieldName, entity);

  if (field.type !== "reference") {
    throw new Error(`${context} field "${entityName}.${fieldName}" must be a reference field.`);
  }

  return field;
}

function validateThroughUniqueConstraint(
  context: string,
  entityName: string,
  entity: EntitySchema,
  constraintName: string,
  fromField: string,
  toField: string,
) {
  const constraint = definitionsToRecord(entity.constraints)[constraintName];
  if (!constraint) {
    throw new Error(`${context} references unknown constraint "${entityName}.${constraintName}".`);
  }

  const uniqueConstraint = constraint as UniqueConstraintSchema;
  const fields = new Set(uniqueConstraint.fields);

  if (!fields.has(fromField) || !fields.has(toField)) {
    throw new Error(
      `${context} "${entityName}.${constraintName}" must cover through fields "${fromField}" and "${toField}".`,
    );
  }
}
function validateInverseRelationships(relationships: KeyedDefinition<RelationshipSchema>[]) {
  const relationshipsByKey = definitionsToRecord(relationships);
  for (const relationship of relationships) {
    const relationshipName = relationship.key;
    if (relationship.inverse === undefined) {
      continue;
    }
    const inverse = relationshipsByKey[relationship.inverse];
    if (!inverse) {
      throw new Error(
        `Relationship "${relationshipName}" inverse references unknown relationship "${relationship.inverse}".`,
      );
    }

    if (inverse.inverse !== relationshipName) {
      throw new Error(
        `Relationship "${relationshipName}" inverse "${relationship.inverse}" must point back to "${relationshipName}".`,
      );
    }

    validateInverseShape(relationshipName, relationship, relationship.inverse, inverse);
  }
}

function validateInverseShape(
  relationshipName: string,
  relationship: RelationshipSchema,
  inverseName: string,
  inverse: RelationshipSchema,
) {
  if (relationship.kind === "toOne" && inverse.kind === "toMany") {
    validateReferenceInverse(relationshipName, relationship, inverseName, inverse);
    return;
  }

  if (relationship.kind === "toMany" && inverse.kind === "toOne") {
    validateReferenceInverse(inverseName, inverse, relationshipName, relationship);
    return;
  }

  if (relationship.kind === "manyToMany" && inverse.kind === "manyToMany") {
    validateManyToManyInverse(relationshipName, relationship, inverseName, inverse);
    return;
  }

  throw new Error(
    `Relationship "${relationshipName}" inverse "${inverseName}" has incompatible kind "${inverse.kind}".`,
  );
}

function validateReferenceInverse(
  toOneName: string,
  toOne: ToOneRelationshipSchema,
  toManyName: string,
  toMany: ToManyRelationshipSchema,
) {
  if (
    toOne.from.entity !== toMany.to.entity ||
    toOne.from.field !== toMany.to.field ||
    toOne.to.entity !== toMany.from.entity
  ) {
    throw new Error(
      `Relationship "${toOneName}" inverse "${toManyName}" must use the same reference field in the opposite direction.`,
    );
  }
}

function validateManyToManyInverse(
  relationshipName: string,
  relationship: ManyToManyRelationshipSchema,
  inverseName: string,
  inverse: ManyToManyRelationshipSchema,
) {
  const sameThrough =
    relationship.through.entity === inverse.through.entity &&
    relationship.through.fromField === inverse.through.toField &&
    relationship.through.toField === inverse.through.fromField;

  if (
    relationship.from.entity !== inverse.to.entity ||
    relationship.to.entity !== inverse.from.entity ||
    !sameThrough
  ) {
    throw new Error(
      `Relationship "${relationshipName}" inverse "${inverseName}" must use the same through fields in the opposite direction.`,
    );
  }
}
