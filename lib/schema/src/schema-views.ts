import {
  assertCreateViewIncludesRequiredFields,
  createViewContextDefaultEntries,
  createViewRequiresContextDefaults,
  parseCreateViewDefaults,
} from "./create-defaults.ts";
import { getEntityFieldCatalog } from "./fields.ts";
import { parseQueryExpression } from "./query.ts";
import {
  getCollectionContextRelationship,
  parseCollectionContext,
  parseCollectionSingletonScope,
  parseCollectionViewQuerySlots,
} from "./schema-collection-contexts.ts";
import { parseCollectionResult } from "./schema-collection-results.ts";
import { parseCountDisplay } from "./schema-count-display.ts";
import {
  assertExactKeys,
  definitionsToRecord,
  isRecord,
  parseKeyedDefinitionArray,
  parseOptionalNonEmptyString,
  parseRequiredNonEmptyString,
} from "./schema-parse-helpers.ts";
import { parseEntityOperationKey } from "./schema-operations.ts";
import {
  assertTableOperationEditViews,
  parseOptionalTableColumnFormat,
} from "./schema-table-views.ts";
import {
  assertViewHasFields,
  parseCreateViewFields,
  parseListViewFields,
} from "./schema-view-fields.ts";
import {
  parseCreateViewUnionPresentation,
  parseEditViewUnionPresentation,
  parseItemViewUnionPresentation,
} from "./schema-union-presentations.ts";
import type {
  AggregateSchema,
  CollectionContextSchema,
  CollectionNavigationSchema,
  CollectionOperationBindingSchema,
  CollectionQuerySchema,
  CollectionSingletonScopeSchema,
  CollectionSummarySlotSchema,
  CollectionViewQuerySlotSchema,
  CollectionViewSchema,
  CreateViewSchema,
  EditViewSchema,
  EntitySchema,
  EntityUnionSchema,
  ItemViewSchema,
  KeyedDefinition,
  RelationshipSchema,
  ReadModelSchema,
  TableViewSchema,
  ViewSchema,
} from "./types.ts";

export function parseCollectionQueries(
  value: unknown,
  entities: Record<string, EntitySchema>,
): KeyedDefinition<CollectionQuerySchema>[] {
  return parseKeyedDefinitionArray("Schema queries", value, (queryName, query) =>
    parseCollectionQuery(queryName, query, entities),
  );
}
function parseCollectionQuery(
  queryName: string,
  value: unknown,
  entities: Record<string, EntitySchema>,
): CollectionQuerySchema {
  if (!isRecord(value)) {
    throw new Error(`Query "${queryName}" must be an object.`);
  }
  assertExactKeys(`Query "${queryName}"`, value, ["key", "label", "entity", "expression"]);
  if (typeof value.label !== "string" || value.label.trim() === "") {
    throw new Error(`Query "${queryName}" label must be a non-empty string.`);
  }

  if (typeof value.entity !== "string" || value.entity.trim() === "") {
    throw new Error(`Query "${queryName}" must include an entity.`);
  }

  const entity = entities[value.entity];
  if (!entity) {
    throw new Error(`Query "${queryName}" references unknown entity "${value.entity}".`);
  }

  return {
    label: value.label,
    entity: value.entity,
    expression: parseQueryExpression(
      value.expression,
      getEntityFieldCatalog(entity),
      `query ${queryName}`,
    ),
  };
}

export function parseItemViews(
  value: unknown,
  entities: Record<string, EntitySchema>,
  unions?: Record<string, EntityUnionSchema>,
): KeyedDefinition<ItemViewSchema>[] {
  return parseKeyedDefinitionArray("Schema itemViews", value, (itemViewName, itemView) =>
    parseItemView(itemViewName, itemView, entities, unions),
  );
}
function parseItemView(
  itemViewName: string,
  value: unknown,
  entities: Record<string, EntitySchema>,
  unions?: Record<string, EntityUnionSchema>,
): ItemViewSchema {
  if (!isRecord(value)) {
    throw new Error(`Item view "${itemViewName}" must be an object.`);
  }

  assertExactKeys(
    `Item view "${itemViewName}"`,
    value,
    ["key", "entity", "fields"],
    ["union", "variants", "fallback"],
  );
  if (typeof value.entity !== "string" || value.entity.trim() === "") {
    throw new Error(`Item view "${itemViewName}" must include an entity.`);
  }

  const entity = entities[value.entity];
  if (!entity) {
    throw new Error(`Item view "${itemViewName}" references unknown entity "${value.entity}".`);
  }

  const fields = parseListViewFields(itemViewName, value.entity, value.fields, entity);
  assertViewHasFields(itemViewName, fields);
  const unionPresentation = parseItemViewUnionPresentation(
    `Item view "${itemViewName}"`,
    itemViewName,
    value,
    value.entity,
    entity,
    unions,
  );

  return {
    entity: value.entity,
    fields,
    ...unionPresentation,
  };
}

export function parseViews(
  value: unknown,
  entities: Record<string, EntitySchema>,
  queries: Record<string, CollectionQuerySchema>,
  itemViews: Record<string, ItemViewSchema>,
  tableViews: Record<string, TableViewSchema>,
  relationships: Record<string, RelationshipSchema> | undefined,
  readModels?: ReadModelSchema,
  unions?: Record<string, EntityUnionSchema>,
): KeyedDefinition<ViewSchema>[] {
  const views = parseKeyedDefinitionArray("Schema views", value, (viewName, view) =>
    parseView(
      viewName,
      view,
      entities,
      queries,
      itemViews,
      tableViews,
      relationships,
      readModels,
      unions,
    ),
  );
  if (views.length > 0) {
    const viewsByKey = definitionsToRecord(views);
    assertCollectionViews(viewsByKey, entities, relationships);
    assertTableOperationEditViews(viewsByKey, tableViews, entities);
  }
  return views;
}
function assertCollectionViews(
  views: Record<string, ViewSchema>,
  entities: Record<string, EntitySchema>,
  relationships: Record<string, RelationshipSchema> | undefined,
) {
  const collectionEntries = Object.entries(views).filter(
    (entry): entry is [string, CollectionViewSchema] => entry[1].type === "collection",
  );

  if (collectionEntries.length === 0) {
    throw new Error('Schema must define at least one "collection" view.');
  }

  for (const [viewName, view] of collectionEntries) {
    if (view.type !== "collection") {
      continue;
    }

    for (const operationBinding of view.operations ?? []) {
      if (operationBinding.createView === undefined) {
        continue;
      }

      const createView = views[operationBinding.createView];
      if (!createView) {
        throw new Error(
          `Collection view "${viewName}" create operation references unknown view "${operationBinding.createView}".`,
        );
      }

      if (createView.type !== "create") {
        throw new Error(
          `Collection view "${viewName}" create operation must reference a create view.`,
        );
      }

      validateCreateOperationContextDefaults(
        viewName,
        operationBinding.createView,
        createView,
        entities,
        view.context,
        view.scope,
        relationships,
      );
    }

    const context = view.context;
    if (context === undefined) {
      continue;
    }

    if (context.createView !== undefined) {
      validateContextCreateView(
        views,
        viewName,
        context.entity,
        context.createView,
        "context createView",
        entities,
        view.scope,
      );
    }

    for (const group of context.navigation?.groups ?? []) {
      if (group.createView === undefined) {
        continue;
      }

      validateContextCreateView(
        views,
        viewName,
        context.entity,
        group.createView,
        `context navigation group "${group.label}" createView`,
        entities,
        view.scope,
      );
    }
  }
}

function validateContextCreateView(
  views: Record<string, ViewSchema>,
  collectionViewName: string,
  contextEntityName: string,
  createViewName: string,
  description: string,
  entities: Record<string, EntitySchema>,
  collectionScope: CollectionSingletonScopeSchema | undefined,
) {
  const createView = views[createViewName];
  if (!createView) {
    throw new Error(
      `Collection view "${collectionViewName}" ${description} references unknown view "${createViewName}".`,
    );
  }

  if (createView.type !== "create") {
    throw new Error(
      `Collection view "${collectionViewName}" ${description} must reference a create view.`,
    );
  }

  if (createView.entity !== contextEntityName) {
    throw new Error(
      `Collection view "${collectionViewName}" ${description} "${createViewName}" must use entity "${contextEntityName}".`,
    );
  }

  for (const [fieldName, defaultValue] of createViewContextDefaultEntries(createView)) {
    if (collectionScope === undefined || defaultValue.name !== collectionScope.name) {
      if (collectionScope === undefined) {
        throw new Error(
          `Collection view "${collectionViewName}" ${description} "${createViewName}" must not require context defaults.`,
        );
      }
      throw new Error(
        `Collection view "${collectionViewName}" ${description} "${createViewName}" requires unavailable context "${defaultValue.name}".`,
      );
    }
    const field = definitionsToRecord(entities[createView.entity]?.fields)[fieldName];
    if (field?.type !== "reference" || field.to !== collectionScope.entity) {
      throw new Error(
        `Collection view "${collectionViewName}" ${description} default field "${fieldName}" must reference scope entity "${collectionScope.entity}".`,
      );
    }
  }
}

function validateCreateOperationContextDefaults(
  collectionViewName: string,
  createViewName: string,
  createView: CreateViewSchema,
  entities: Record<string, EntitySchema>,
  collectionContext: CollectionContextSchema | undefined,
  collectionScope: CollectionSingletonScopeSchema | undefined,
  relationships: Record<string, RelationshipSchema> | undefined,
) {
  if (!createViewRequiresContextDefaults(createView)) {
    return;
  }

  const contextDefaults = createViewContextDefaultEntries(createView);
  const context = `Collection view "${collectionViewName}" create operation view "${createViewName}"`;

  if (!collectionContext && !collectionScope) {
    throw new Error(`${context} requires context defaults but the collection has no context.`);
  }

  const entity = entities[createView.entity];

  if (!entity) {
    throw new Error(`${context} references unknown entity "${createView.entity}".`);
  }

  const relationship = getCollectionContextRelationship(collectionContext, relationships);
  if (relationship !== undefined && createView.entity !== relationship.to.entity) {
    throw new Error(`${context} must use relationship target entity "${relationship.to.entity}".`);
  }

  for (const [fieldName, defaultValue] of contextDefaults) {
    const target =
      defaultValue.name === collectionContext?.name
        ? collectionContext
        : defaultValue.name === collectionScope?.name
          ? collectionScope
          : undefined;
    if (target === undefined) {
      if (collectionScope === undefined && collectionContext !== undefined) {
        throw new Error(
          `${context} requires context "${defaultValue.name}" but the collection context is "${collectionContext.name}".`,
        );
      }
      throw new Error(`${context} requires unavailable context "${defaultValue.name}".`);
    }
    const field = definitionsToRecord(entity.fields)[fieldName];
    if (field?.type !== "reference" || field.to !== target.entity) {
      throw new Error(
        `${context} default field "${fieldName}" must reference entity "${target.entity}".`,
      );
    }

    if (
      relationship !== undefined &&
      defaultValue.name === collectionContext?.name &&
      fieldName !== relationship.to.field
    ) {
      throw new Error(
        `${context} default field "${fieldName}" must use relationship field "${relationship.to.entity}.${relationship.to.field}".`,
      );
    }
  }
}

function parseView(
  viewName: string,
  value: unknown,
  entities: Record<string, EntitySchema>,
  queries: Record<string, CollectionQuerySchema>,
  itemViews: Record<string, ItemViewSchema>,
  tableViews: Record<string, TableViewSchema>,
  relationships: Record<string, RelationshipSchema> | undefined,
  readModels?: ReadModelSchema,
  unions?: Record<string, EntityUnionSchema>,
): ViewSchema {
  if (viewName.trim() === "") {
    throw new Error("View names must be non-empty.");
  }

  if (!isRecord(value)) {
    throw new Error(`View "${viewName}" must be an object.`);
  }

  if (value.type !== "collection" && value.type !== "create" && value.type !== "edit") {
    throw new Error(`View "${viewName}" type must be "collection", "create", or "edit".`);
  }

  if (value.type === "collection") {
    return parseCollectionView(
      viewName,
      value,
      entities,
      queries,
      itemViews,
      tableViews,
      relationships,
      readModels,
      unions,
    );
  }

  if (value.type === "edit") {
    return parseEditView(viewName, value, entities, unions);
  }

  assertExactKeys(
    `View "${viewName}"`,
    value,
    ["key", "type", "entity", "fields"],
    ["defaults", "union", "variants", "fallback"],
  );
  if (typeof value.entity !== "string" || value.entity.trim() === "") {
    throw new Error(`View "${viewName}" must include an entity.`);
  }

  const entity = entities[value.entity];
  if (!entity) {
    throw new Error(`View "${viewName}" references unknown entity "${value.entity}".`);
  }

  const fields = parseCreateViewFields(viewName, value.entity, value.fields, entity);
  const defaults = parseCreateViewDefaults(viewName, value.entity, value.defaults, entity, fields);
  assertViewHasFields(viewName, fields);
  assertCreateViewIncludesRequiredFields(viewName, fields, defaults ?? {}, entity);
  const unionPresentation = parseCreateViewUnionPresentation(
    `View "${viewName}"`,
    viewName,
    value,
    value.entity,
    entity,
    unions,
  );

  return {
    type: "create",
    entity: value.entity,
    fields,
    ...(defaults === undefined ? {} : { defaults }),
    ...unionPresentation,
  };
}

function parseEditView(
  viewName: string,
  value: Record<string, unknown>,
  entities: Record<string, EntitySchema>,
  unions?: Record<string, EntityUnionSchema>,
): EditViewSchema {
  assertExactKeys(
    `View "${viewName}"`,
    value,
    ["key", "type", "entity", "fields"],
    ["union", "variants", "fallback"],
  );
  if (typeof value.entity !== "string" || value.entity.trim() === "") {
    throw new Error(`View "${viewName}" must include an entity.`);
  }

  const entity = entities[value.entity];
  if (!entity) {
    throw new Error(`View "${viewName}" references unknown entity "${value.entity}".`);
  }

  const fields = parseListViewFields(viewName, value.entity, value.fields, entity);
  assertViewHasFields(viewName, fields);
  const unionPresentation = parseEditViewUnionPresentation(
    `View "${viewName}"`,
    viewName,
    value,
    value.entity,
    entity,
    unions,
  );

  return {
    type: "edit",
    entity: value.entity,
    fields,
    ...unionPresentation,
  };
}

function parseCollectionView(
  viewName: string,
  value: Record<string, unknown>,
  entities: Record<string, EntitySchema>,
  queries: Record<string, CollectionQuerySchema>,
  itemViews: Record<string, ItemViewSchema>,
  tableViews: Record<string, TableViewSchema>,
  relationships: Record<string, RelationshipSchema> | undefined,
  readModels?: ReadModelSchema,
  unions?: Record<string, EntityUnionSchema>,
): CollectionViewSchema {
  assertExactKeys(
    `Collection view "${viewName}"`,
    value,
    ["key", "type", "label", "entity", "queries", "defaultQuery", "result"],
    ["navigation", "scope", "context", "operations", "summary"],
  );
  if (typeof value.label !== "string" || value.label.trim() === "") {
    throw new Error(`Collection view "${viewName}" label must be a non-empty string.`);
  }

  if (typeof value.entity !== "string" || value.entity.trim() === "") {
    throw new Error(`Collection view "${viewName}" must include an entity.`);
  }

  const entity = entities[value.entity];
  if (!entity) {
    throw new Error(`Collection view "${viewName}" references unknown entity "${value.entity}".`);
  }

  const navigation = parseCollectionNavigation(viewName, value.navigation);
  const scope = parseCollectionSingletonScope(viewName, value.scope, entities, queries);
  const context = parseCollectionContext(
    viewName,
    value.context,
    value.entity,
    entities,
    queries,
    itemViews,
    relationships,
    scope,
  );
  const querySlots = parseCollectionViewQuerySlots(
    viewName,
    value.entity,
    entity,
    value.queries,
    queries,
    context,
    scope,
    relationships,
  );

  if (typeof value.defaultQuery !== "string" || value.defaultQuery.trim() === "") {
    throw new Error(`Collection view "${viewName}" defaultQuery must be a non-empty string.`);
  }

  if (!querySlots.some((slot) => slot.query === value.defaultQuery)) {
    throw new Error(
      `Collection view "${viewName}" defaultQuery must reference one of its query slots.`,
    );
  }

  const result = parseCollectionResult(
    viewName,
    value.entity,
    entity,
    value.result,
    entities,
    itemViews,
    tableViews,
    querySlots,
    context,
    relationships,
    definitionsToRecord(readModels?.aggregates),
    unions,
  );
  const operations = parseCollectionOperationBindings(viewName, value.operations, entities);
  const summary = parseCollectionSummarySlots(
    viewName,
    value.entity,
    value.summary,
    querySlots,
    definitionsToRecord(readModels?.aggregates),
  );
  return {
    type: "collection",
    label: value.label,
    entity: value.entity,
    ...(navigation === undefined ? {} : { navigation }),
    ...(scope === undefined ? {} : { scope }),
    ...(context === undefined ? {} : { context }),
    queries: querySlots,
    defaultQuery: value.defaultQuery,
    result,
    ...(operations ? { operations } : {}),
    ...(summary ? { summary } : {}),
  };
}

function parseCollectionNavigation(
  viewName: string,
  value: unknown,
): CollectionNavigationSchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  const context = `Collection view "${viewName}" navigation`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["primary"]);

  if (typeof value.primary !== "boolean") {
    throw new Error(`${context} primary must be a boolean.`);
  }

  return { primary: value.primary };
}

function parseCollectionOperationBindings(
  viewName: string,
  value: unknown,
  entities: Record<string, EntitySchema>,
): CollectionOperationBindingSchema[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`Collection view "${viewName}" operations must be an array.`);
  }

  const operations = value.map((slot, index) =>
    parseCollectionOperationBinding(viewName, index, slot, entities),
  );

  if (operations.filter(({ placement }) => placement === "emptyStatePrimary").length > 1) {
    throw new Error(
      `Collection view "${viewName}" must not define more than one emptyStatePrimary operation binding.`,
    );
  }

  return operations.length > 0 ? operations : undefined;
}

function parseCollectionOperationBinding(
  viewName: string,
  index: number,
  value: unknown,
  entities: Record<string, EntitySchema>,
): CollectionOperationBindingSchema {
  const context = `Collection view "${viewName}" operation binding ${index}`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }
  assertExactKeys(context, value, ["operation"], ["label", "createView", "count", "placement"]);
  const operationKey = parseEntityOperationKey(`${context} operation`, value.operation);
  const entity = entities[operationKey.entityKey];
  const operation = definitionsToRecord(entity?.operations)[operationKey.operationKey];
  if (!entity || !operation) {
    throw new Error(`${context} references unknown operation "${String(value.operation)}".`);
  }

  if (operation.scope !== "collection") {
    throw new Error(`${context} operation must use collection scope.`);
  }

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const createView = parseOptionalNonEmptyString(`${context} createView`, value.createView);
  const count =
    value.count === undefined ? undefined : parseCountDisplay(`${context} count`, value.count);
  const placement = value.placement ?? "toolbar";

  if (placement !== "toolbar" && placement !== "emptyStatePrimary") {
    throw new Error(`${context} placement must be toolbar or emptyStatePrimary.`);
  }

  if (operation.kind === "create") {
    if (createView === undefined) {
      throw new Error(`${context} create operation requires createView.`);
    }
  } else if (createView !== undefined) {
    throw new Error(`${context} createView is only valid for create operations.`);
  }

  if (count !== undefined && operation.kind !== "command") {
    throw new Error(`${context} count is only valid for command operations.`);
  }

  if (
    placement === "emptyStatePrimary" &&
    operation.kind === "command" &&
    operation.input?.fields.some((field) =>
      "field" in field ? field.required === true : field.required,
    )
  ) {
    throw new Error(`${context} emptyStatePrimary command must not require caller input.`);
  }

  return {
    operation: `${operationKey.entityKey}.${operationKey.operationKey}`,
    placement,
    ...(label === undefined ? {} : { label }),
    ...(createView === undefined ? {} : { createView }),
    ...(count === undefined ? {} : { count }),
  };
}

function parseCollectionSummarySlots(
  viewName: string,
  entityName: string,
  value: unknown,
  querySlots: CollectionViewQuerySlotSchema[],
  aggregates: Record<string, AggregateSchema>,
): CollectionSummarySlotSchema[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`Collection view "${viewName}" summary must be an array.`);
  }

  const slots = value.map((slot, index) =>
    parseCollectionSummarySlot(viewName, entityName, index, slot, querySlots, aggregates),
  );

  return slots.length > 0 ? slots : undefined;
}

function parseCollectionSummarySlot(
  viewName: string,
  entityName: string,
  index: number,
  value: unknown,
  querySlots: CollectionViewQuerySlotSchema[],
  aggregates: Record<string, AggregateSchema>,
): CollectionSummarySlotSchema {
  const context = `Collection view "${viewName}" summary slot ${index}`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["type", "aggregate"], ["label", "suffix", "format"]);

  if (value.type !== "aggregate") {
    throw new Error(`${context} type must be "aggregate".`);
  }

  const aggregateName = parseRequiredNonEmptyString(`${context} aggregate`, value.aggregate);
  const aggregate = aggregates[aggregateName];

  if (!aggregate) {
    throw new Error(`${context} references unknown aggregate "${aggregateName}".`);
  }

  if (!querySlots.some((slot) => slot.query === aggregate.query)) {
    throw new Error(
      `${context} aggregate "${aggregateName}" query "${aggregate.query}" must be one of its query slots for entity "${entityName}".`,
    );
  }

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const suffix = parseOptionalNonEmptyString(`${context} suffix`, value.suffix);
  const format = parseOptionalTableColumnFormat(`${context} format`, value.format);

  return {
    type: "aggregate",
    aggregate: aggregateName,
    ...(label === undefined ? {} : { label }),
    ...(suffix === undefined ? {} : { suffix }),
    ...(format === undefined ? {} : { format }),
  };
}
