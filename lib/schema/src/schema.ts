import { parseAppAuthorization } from "./schema-authorization.ts";
import { parseEntities } from "./schema-fields.ts";
import { parseEntityOperationsForEntities } from "./schema-operations.ts";
import { assertExactKeys, definitionsToRecord, isRecord } from "./schema-parse-helpers.ts";
import { parseReadModels } from "./schema-read-models.ts";
import { parseRelationships } from "./schema-relationships.ts";
import { parseRuntimeMetadata } from "./schema-runtime.ts";
import { parseAppNavigation, parseScreens } from "./schema-screens.ts";
import { parseTableViews } from "./schema-table-views.ts";
import { parseUnions } from "./schema-unions.ts";
import { parseCollectionQueries, parseItemViews, parseViews } from "./schema-views.ts";
import type { AppSchema, AppSchemaSource } from "./types.ts";
import { canonicalJsonStringify } from "./canonical-json.ts";
import { getAppSchemaDefinitionIndex } from "./schema-definition-index.ts";
export function defineAppSchema<const Source extends AppSchemaSource>(source: Source): Source {
  parseAppSchema(source);
  return source;
}

export function parseAppSchema(value: unknown): AppSchema {
  if (!isRecord(value)) {
    throw new Error("Schema must be an object.");
  }

  assertExactKeys(
    "Schema",
    value,
    ["version", "entities", "queries", "itemViews", "tableViews", "views"],
    ["authorization", "navigation", "relationships", "readModels", "runtime", "screens", "unions"],
  );
  const version = value.version;
  if (version !== 1) {
    throw new Error("Schema version must be 1.");
  }
  const authorization = parseAppAuthorization(value.authorization);
  const parsedEntities = parseEntities(value.entities);
  if (parsedEntities.entities.length === 0) {
    throw new Error("Schema must define at least one entity.");
  }
  const parsedEntitiesByKey = definitionsToRecord(parsedEntities.entities);
  const relationships = parseRelationships(value.relationships, parsedEntitiesByKey);
  const relationshipsByKey = definitionsToRecord(relationships);
  const queries = parseCollectionQueries(value.queries, parsedEntitiesByKey);
  const queriesByKey = definitionsToRecord(queries);
  const entitiesWithOperations = parseEntityOperationsForEntities(
    parsedEntities.entities,
    parsedEntities.operationInputsByEntity,
    queriesByKey,
    relationshipsByKey,
    authorization,
  );
  const entitiesWithOperationsByKey = definitionsToRecord(entitiesWithOperations);
  const readModels = parseReadModels(value.readModels, entitiesWithOperationsByKey, queriesByKey);
  const unions = parseUnions(value.unions, entitiesWithOperationsByKey);
  const unionsByKey = definitionsToRecord(unions);
  const itemViews = parseItemViews(value.itemViews, entitiesWithOperationsByKey, unionsByKey);
  const itemViewsByKey = definitionsToRecord(itemViews);
  const tableViews = parseTableViews(
    value.tableViews,
    entitiesWithOperations,
    itemViews,
    readModels,
  );
  const tableViewsByKey = definitionsToRecord(tableViews);
  const views = parseViews(
    value.views,
    entitiesWithOperationsByKey,
    queriesByKey,
    itemViewsByKey,
    tableViewsByKey,
    relationshipsByKey,
    readModels,
    unionsByKey,
  );
  const screens = parseScreens(value.screens, definitionsToRecord(views));
  const navigation = parseAppNavigation(value.navigation, screens);
  const runtime = parseRuntimeMetadata(value.runtime, entitiesWithOperationsByKey);
  const schema: AppSchema = {
    version,
    ...(authorization === undefined ? {} : { authorization }),
    entities: entitiesWithOperations,
    ...(relationships === undefined ? {} : { relationships }),
    queries,
    ...(readModels === undefined ? {} : { readModels }),
    ...(unions === undefined ? {} : { unions }),
    itemViews,
    tableViews,
    views,
    screens,
    ...(navigation === undefined ? {} : { navigation }),
    ...(runtime === undefined ? {} : { runtime }),
  };
  getAppSchemaDefinitionIndex(schema);
  return schema;
}
export function stringifySchema(schema: AppSchema) {
  return canonicalJsonStringify(sourceSchemaForStringify(schema), 2);
}

export function formatAppSchemaSource(source: AppSchemaSource): string {
  parseAppSchema(source);
  return `${canonicalJsonStringify(source, 2)}\n`;
}

function sourceSchemaForStringify(schema: AppSchema): unknown {
  return {
    ...schema,
    entities: schema.entities,
  };
}
