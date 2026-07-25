import { parseEntities } from "./schema-fields.ts";
import { parseEntityOperationsForEntities } from "./schema-operations.ts";
import { assertExactKeys, isRecord } from "./schema-parse-helpers.ts";
import { parseReadModels } from "./schema-read-models.ts";
import { parseRelationships } from "./schema-relationships.ts";
import { parseRuntimeMetadata } from "./schema-runtime.ts";
import { parseScreens } from "./schema-screens.ts";
import { parseTableViews } from "./schema-table-views.ts";
import { parseUnions } from "./schema-unions.ts";
import { parseCollectionQueries, parseItemViews, parseViews } from "./schema-views.ts";
import type { AppSchema, AppSchemaSource } from "./types.ts";

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
    ["relationships", "readModels", "runtime", "screens", "unions"],
  );

  const version = value.version;
  if (version !== 1) {
    throw new Error("Schema version must be 1.");
  }

  const parsedEntities = parseEntities(value.entities);
  if (Object.keys(parsedEntities.entities).length === 0) {
    throw new Error("Schema must define at least one entity.");
  }

  const relationships = parseRelationships(value.relationships, parsedEntities.entities);
  const queries = parseCollectionQueries(value.queries, parsedEntities.entities);
  const entitiesWithOperations = parseEntityOperationsForEntities(
    parsedEntities.entities,
    parsedEntities.operationInputsByEntity,
    queries,
    relationships,
  );
  const readModels = parseReadModels(value.readModels, entitiesWithOperations, queries);
  const unions = parseUnions(value.unions, entitiesWithOperations);
  const itemViews = parseItemViews(value.itemViews, entitiesWithOperations, unions);
  const tableViews = parseTableViews(
    value.tableViews,
    entitiesWithOperations,
    itemViews,
    readModels,
  );
  const views = parseViews(
    value.views,
    entitiesWithOperations,
    queries,
    itemViews,
    tableViews,
    relationships,
    readModels,
    unions,
  );
  const screens = parseScreens(value.screens, views);
  const runtime = parseRuntimeMetadata(value.runtime, entitiesWithOperations);

  return {
    version,
    entities: entitiesWithOperations,
    ...(relationships === undefined ? {} : { relationships }),
    queries,
    ...(readModels === undefined ? {} : { readModels }),
    ...(unions === undefined ? {} : { unions }),
    itemViews,
    tableViews,
    views,
    screens,
    ...(runtime === undefined ? {} : { runtime }),
  };
}

export function stringifySchema(schema: AppSchema) {
  return JSON.stringify(sourceSchemaForStringify(schema), null, 2);
}

export function formatAppSchemaSource(source: AppSchemaSource): string {
  parseAppSchema(source);
  return `${JSON.stringify(stableTopLevelSourceValue(source), null, 2)}\n`;
}

function sourceSchemaForStringify(schema: AppSchema): unknown {
  return {
    ...schema,
    entities: schema.entities,
  };
}

function stableTopLevelSourceValue(source: AppSchemaSource): unknown {
  return Object.fromEntries(
    Object.entries(source).sort(([left], [right]) => left.localeCompare(right)),
  );
}
