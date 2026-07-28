import { findAddressableField, getEntityFieldCatalog } from "./fields.ts";
import type { QueryExpression } from "./types.ts";
import { collectQueryContextNames } from "./query.ts";
import { parseCountDisplay } from "./schema-count-display.ts";
import {
  assertExactKeys,
  definitionsToRecord,
  isRecord,
  parseOptionalNonEmptyString,
  parseRequiredNonEmptyString,
} from "./schema-parse-helpers.ts";
import type {
  CollectionContextNavigationSchema,
  CollectionContextPresentation,
  CollectionContextSchema,
  CollectionQuerySchema,
  CollectionViewQuerySlotSchema,
  EntitySchema,
  ItemViewSchema,
  RelationshipSchema,
  ToManyRelationshipSchema,
} from "./types.ts";

export function parseCollectionViewQuerySlots(
  viewName: string,
  entityName: string,
  entity: EntitySchema,
  value: unknown,
  queries: Record<string, CollectionQuerySchema>,
  context?: CollectionContextSchema,
  relationships?: Record<string, RelationshipSchema>,
): CollectionViewQuerySlotSchema[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Collection view "${viewName}" queries must be a non-empty array.`);
  }

  return value.map((slot, index) =>
    parseCollectionViewQuerySlot(
      viewName,
      entityName,
      entity,
      index,
      slot,
      queries,
      context,
      relationships,
    ),
  );
}

function parseCollectionViewQuerySlot(
  viewName: string,
  entityName: string,
  entity: EntitySchema,
  index: number,
  value: unknown,
  queries: Record<string, CollectionQuerySchema>,
  collectionContext?: CollectionContextSchema,
  relationships?: Record<string, RelationshipSchema>,
): CollectionViewQuerySlotSchema {
  const context = `Collection view "${viewName}" query slot ${index}`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["query"], ["label", "count"]);

  if (typeof value.query !== "string" || value.query.trim() === "") {
    throw new Error(`${context} query must be a non-empty string.`);
  }

  const query = queries[value.query];
  if (!query) {
    throw new Error(`${context} references unknown query "${value.query}".`);
  }

  if (query.entity !== entityName) {
    throw new Error(`${context} query "${value.query}" must use entity "${entityName}".`);
  }

  validateCollectionQueryContextRequirements(
    context,
    value.query,
    query.expression,
    entity,
    collectionContext,
    relationships,
  );

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const count =
    value.count === undefined ? undefined : parseCountDisplay(`${context} count`, value.count);

  return {
    query: value.query,
    ...(label === undefined ? {} : { label }),
    ...(count === undefined ? {} : { count }),
  };
}

export function parseCollectionContext(
  viewName: string,
  value: unknown,
  collectionEntityName: string,
  entities: Record<string, EntitySchema>,
  queries: Record<string, CollectionQuerySchema>,
  itemViews: Record<string, ItemViewSchema>,
  relationships: Record<string, RelationshipSchema> | undefined,
): CollectionContextSchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  const context = `Collection view "${viewName}" context`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(
    context,
    value,
    ["name", "entity", "query", "labelField"],
    ["presentation", "navigation", "relationship", "createView", "itemView"],
  );

  const name = parseRequiredNonEmptyString(`${context} name`, value.name);
  const entityName = parseRequiredNonEmptyString(`${context} entity`, value.entity);
  const queryName = parseRequiredNonEmptyString(`${context} query`, value.query);
  const labelField = parseRequiredNonEmptyString(`${context} labelField`, value.labelField);
  const presentation = parseCollectionContextPresentation(
    `${context} presentation`,
    value.presentation,
  );
  const navigation = parseCollectionContextNavigation(
    context,
    value.navigation,
    entityName,
    queries,
  );
  const relationship = parseCollectionContextRelationship(
    context,
    parseOptionalNonEmptyString(`${context} relationship`, value.relationship),
    entityName,
    collectionEntityName,
    relationships,
  );
  const createView = parseOptionalNonEmptyString(`${context} createView`, value.createView);
  const itemViewName = parseOptionalNonEmptyString(`${context} itemView`, value.itemView);
  const entity = entities[entityName];

  if (!entity) {
    throw new Error(`${context} references unknown entity "${entityName}".`);
  }

  const query = queries[queryName];
  if (!query) {
    throw new Error(`${context} references unknown query "${queryName}".`);
  }

  if (query.entity !== entityName) {
    throw new Error(`${context} query "${queryName}" must use entity "${entityName}".`);
  }

  const requiredContextNames = collectQueryContextNames(query.expression);
  if (requiredContextNames.length > 0) {
    throw new Error(`${context} query "${queryName}" must not require context.`);
  }
  const field = definitionsToRecord(entity.fields)[labelField];
  if (!field) {
    throw new Error(
      `${context} labelField references unknown field "${entityName}.${labelField}".`,
    );
  }

  if (field.type !== "text") {
    throw new Error(`${context} labelField must reference a text field.`);
  }

  if (itemViewName !== undefined) {
    const itemView = itemViews[itemViewName];

    if (!itemView) {
      throw new Error(`${context} itemView references unknown item view "${itemViewName}".`);
    }

    if (itemView.entity !== entityName) {
      throw new Error(`${context} itemView "${itemViewName}" must use entity "${entityName}".`);
    }
  }

  return {
    name,
    entity: entityName,
    query: queryName,
    labelField,
    presentation,
    ...(navigation === undefined ? {} : { navigation }),
    ...(relationship === undefined ? {} : { relationship }),
    ...(createView === undefined ? {} : { createView }),
    ...(itemViewName === undefined ? {} : { itemView: itemViewName }),
  };
}

function parseCollectionContextNavigation(
  context: string,
  value: unknown,
  contextEntityName: string,
  queries: Record<string, CollectionQuerySchema>,
): CollectionContextNavigationSchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} navigation must be an object.`);
  }

  assertExactKeys(`${context} navigation`, value, ["placement", "groups"]);

  if (value.placement !== "sidebar") {
    throw new Error(`${context} navigation placement must be "sidebar".`);
  }

  if (!Array.isArray(value.groups) || value.groups.length === 0) {
    throw new Error(`${context} navigation groups must be a non-empty array.`);
  }

  return {
    placement: "sidebar",
    groups: value.groups.map((group, index) =>
      parseCollectionContextNavigationGroup(context, index, group, contextEntityName, queries),
    ),
  };
}

function parseCollectionContextNavigationGroup(
  context: string,
  index: number,
  value: unknown,
  contextEntityName: string,
  queries: Record<string, CollectionQuerySchema>,
): CollectionContextNavigationSchema["groups"][number] {
  const groupContext = `${context} navigation group ${index}`;

  if (!isRecord(value)) {
    throw new Error(`${groupContext} must be an object.`);
  }

  assertExactKeys(groupContext, value, ["label", "query"], ["createView"]);

  const label = parseRequiredNonEmptyString(`${groupContext} label`, value.label);
  const queryName = parseRequiredNonEmptyString(`${groupContext} query`, value.query);
  const createView = parseOptionalNonEmptyString(`${groupContext} createView`, value.createView);
  const query = queries[queryName];

  if (!query) {
    throw new Error(`${groupContext} references unknown query "${queryName}".`);
  }

  if (query.entity !== contextEntityName) {
    throw new Error(`${groupContext} query "${queryName}" must use entity "${contextEntityName}".`);
  }

  const requiredContextNames = collectQueryContextNames(query.expression);
  if (requiredContextNames.length > 0) {
    throw new Error(`${groupContext} query "${queryName}" must not require context.`);
  }

  return {
    label,
    query: queryName,
    ...(createView === undefined ? {} : { createView }),
  };
}

function parseCollectionContextPresentation(
  context: string,
  value: unknown,
): CollectionContextPresentation {
  if (value === undefined) {
    return "tabs";
  }

  if (value === "tabs" || value === "listDetail") {
    return value;
  }

  throw new Error(`${context} must be "tabs" or "listDetail".`);
}

function parseCollectionContextRelationship(
  context: string,
  relationshipName: string | undefined,
  contextEntityName: string,
  collectionEntityName: string,
  relationships: Record<string, RelationshipSchema> | undefined,
): string | undefined {
  if (relationshipName === undefined) {
    return undefined;
  }

  const relationship = relationships?.[relationshipName];
  if (!relationship) {
    throw new Error(
      `${context} relationship references unknown relationship "${relationshipName}".`,
    );
  }

  if (relationship.kind !== "toMany") {
    throw new Error(`${context} relationship "${relationshipName}" must be a toMany relationship.`);
  }

  if (relationship.from.entity !== contextEntityName) {
    throw new Error(
      `${context} relationship "${relationshipName}" must start from context entity "${contextEntityName}".`,
    );
  }

  if (relationship.to.entity !== collectionEntityName) {
    throw new Error(
      `${context} relationship "${relationshipName}" must target collection entity "${collectionEntityName}".`,
    );
  }

  return relationshipName;
}

function validateCollectionQueryContextRequirements(
  context: string,
  queryName: string,
  query: QueryExpression,
  entity: EntitySchema,
  collectionContext: CollectionContextSchema | undefined,
  relationships: Record<string, RelationshipSchema> | undefined,
) {
  const requiredContextNames = collectQueryContextNames(query);

  if (requiredContextNames.length === 0) {
    validateRelationshipContextQuery(context, queryName, query, collectionContext, relationships);
    return;
  }

  if (!collectionContext) {
    throw new Error(
      `${context} query "${queryName}" requires context but the collection has no context.`,
    );
  }

  for (const name of requiredContextNames) {
    if (name !== collectionContext.name) {
      throw new Error(
        `${context} query "${queryName}" requires context "${name}" but the collection context is "${collectionContext.name}".`,
      );
    }
  }

  validateContextPredicateTargets(context, query, entity, collectionContext);
  validateRelationshipContextQuery(context, queryName, query, collectionContext, relationships);
}

function validateContextPredicateTargets(
  context: string,
  query: QueryExpression,
  entity: EntitySchema,
  collectionContext: CollectionContextSchema,
) {
  if (query.kind === "and" || query.kind === "or") {
    for (const expression of query.expressions) {
      validateContextPredicateTargets(context, expression, entity, collectionContext);
    }

    return;
  }

  if (query.kind !== "where" || typeof query.value !== "object" || query.value.kind !== "context") {
    return;
  }

  const field = findAddressableField(getEntityFieldCatalog(entity), query.ref);
  if (field?.type !== "reference" || field.to !== collectionContext.entity) {
    throw new Error(
      `${context} context query field must reference entity "${collectionContext.entity}".`,
    );
  }
}

function validateRelationshipContextQuery(
  context: string,
  queryName: string,
  query: QueryExpression,
  collectionContext: CollectionContextSchema | undefined,
  relationships: Record<string, RelationshipSchema> | undefined,
) {
  if (collectionContext === undefined) {
    return;
  }

  const relationship = getCollectionContextRelationship(collectionContext, relationships);
  if (relationship === undefined) {
    return;
  }

  if (queryFiltersRelationshipField(query, relationship.to.field, collectionContext.name)) {
    return;
  }

  throw new Error(
    `${context} query "${queryName}" must filter relationship field "${relationship.to.entity}.${relationship.to.field}" against context "${collectionContext.name}".`,
  );
}

function queryFiltersRelationshipField(
  query: QueryExpression,
  fieldName: string,
  contextName: string,
): boolean {
  if (query.kind === "and") {
    return query.expressions.some((expression) =>
      queryFiltersRelationshipField(expression, fieldName, contextName),
    );
  }

  if (query.kind === "or") {
    return query.expressions.every((expression) =>
      queryFiltersRelationshipField(expression, fieldName, contextName),
    );
  }

  return (
    query.kind === "where" &&
    query.op === "eq" &&
    query.ref.kind === "value" &&
    query.ref.name === fieldName &&
    typeof query.value === "object" &&
    query.value.kind === "context" &&
    query.value.name === contextName
  );
}

export function getCollectionContextRelationship(
  collectionContext: CollectionContextSchema | undefined,
  relationships: Record<string, RelationshipSchema> | undefined,
): ToManyRelationshipSchema | undefined {
  if (collectionContext?.relationship === undefined) {
    return undefined;
  }

  const relationship = relationships?.[collectionContext.relationship];

  if (relationship?.kind !== "toMany") {
    return undefined;
  }

  return relationship;
}
