import { parseAppSchema } from "./schema.ts";
import type {
  AppSchemaCompositionSource,
  AppSchemaModuleSource,
  AppSchemaSource,
} from "./types.ts";

export function defineAppSchemaModule<const Source extends AppSchemaModuleSource>(
  source: Source,
): Source {
  return source;
}

export function composeAppSchema<const Composition extends AppSchemaCompositionSource>(
  composition: Composition,
): AppSchemaSource {
  assertUniqueModuleKeys(composition.modules);
  assertDependenciesPrecedeConsumers(composition.modules);

  const declarationOwners = new Map<string, string>();
  const entities: AppSchemaSource["entities"] = {};
  const relationships: NonNullable<AppSchemaSource["relationships"]> = {};
  const queries: AppSchemaSource["queries"] = {};
  const computedValues: NonNullable<NonNullable<AppSchemaSource["readModels"]>["computedValues"]> =
    {};
  const aggregates: NonNullable<NonNullable<AppSchemaSource["readModels"]>["aggregates"]> = {};
  const unions: NonNullable<AppSchemaSource["unions"]> = {};
  const itemViews: AppSchemaSource["itemViews"] = {};
  const tableViews: AppSchemaSource["tableViews"] = {};
  const views: AppSchemaSource["views"] = {};
  const screens: AppSchemaSource["screens"] = {};

  let hasRelationships = false;
  let hasReadModels = false;
  let hasComputedValues = false;
  let hasAggregates = false;
  let hasUnions = false;

  for (const module of composition.modules) {
    appendDeclarations(entities, module.entities, "entities", module.key, declarationOwners);
    appendDeclarations(queries, module.queries, "queries", module.key, declarationOwners);
    appendDeclarations(itemViews, module.itemViews, "itemViews", module.key, declarationOwners);
    appendDeclarations(tableViews, module.tableViews, "tableViews", module.key, declarationOwners);
    appendDeclarations(views, module.views, "views", module.key, declarationOwners);
    appendDeclarations(screens, module.screens, "screens", module.key, declarationOwners);

    if (module.relationships !== undefined) {
      hasRelationships = true;
      appendDeclarations(
        relationships,
        module.relationships,
        "relationships",
        module.key,
        declarationOwners,
      );
    }

    if (module.readModels !== undefined) {
      hasReadModels = true;

      if (module.readModels.computedValues !== undefined) {
        hasComputedValues = true;
        appendDeclarations(
          computedValues,
          module.readModels.computedValues,
          "readModels.computedValues",
          module.key,
          declarationOwners,
        );
      }

      if (module.readModels.aggregates !== undefined) {
        hasAggregates = true;
        appendDeclarations(
          aggregates,
          module.readModels.aggregates,
          "readModels.aggregates",
          module.key,
          declarationOwners,
        );
      }
    }

    if (module.unions !== undefined) {
      hasUnions = true;
      appendDeclarations(unions, module.unions, "unions", module.key, declarationOwners);
    }
  }

  const source: AppSchemaSource = {
    version: composition.version,
    entities,
    ...(hasRelationships ? { relationships } : {}),
    queries,
    ...(hasReadModels
      ? {
          readModels: {
            ...(hasComputedValues ? { computedValues } : {}),
            ...(hasAggregates ? { aggregates } : {}),
          },
        }
      : {}),
    ...(hasUnions ? { unions } : {}),
    itemViews,
    tableViews,
    views,
    screens,
    ...(composition.runtime === undefined ? {} : { runtime: composition.runtime }),
  };

  parseAppSchema(source);
  return source;
}

function assertUniqueModuleKeys(modules: readonly AppSchemaModuleSource[]): void {
  const moduleKeys = new Set<string>();

  for (const module of modules) {
    if (moduleKeys.has(module.key)) {
      throw new Error(`Schema module key "${module.key}" is listed more than once.`);
    }
    moduleKeys.add(module.key);
  }
}

function assertDependenciesPrecedeConsumers(modules: readonly AppSchemaModuleSource[]): void {
  const moduleIndexes = new Map<AppSchemaModuleSource, number>(
    modules.map((module, index) => [module, index]),
  );

  for (const [consumerIndex, module] of modules.entries()) {
    for (const dependency of module.requires ?? []) {
      const dependencyIndex = moduleIndexes.get(dependency);

      if (dependencyIndex === undefined) {
        throw new Error(
          `Schema module "${module.key}" requires module "${dependency.key}", but "${dependency.key}" is not listed.`,
        );
      }

      if (dependencyIndex >= consumerIndex) {
        throw new Error(
          `Schema module "${module.key}" requires module "${dependency.key}" to be listed before it.`,
        );
      }
    }
  }
}

function appendDeclarations<Declaration>(
  target: Record<string, Declaration>,
  declarations: Record<string, Declaration> | undefined,
  registryPath: string,
  moduleKey: string,
  declarationOwners: Map<string, string>,
): void {
  if (declarations === undefined) {
    return;
  }

  for (const [declarationKey, declaration] of Object.entries(declarations)) {
    const declarationPath = `${registryPath}.${declarationKey}`;
    const currentOwner = declarationOwners.get(declarationPath);

    if (currentOwner !== undefined) {
      throw new Error(
        `Schema declaration "${declarationPath}" is contributed by both modules "${currentOwner}" and "${moduleKey}".`,
      );
    }

    declarationOwners.set(declarationPath, moduleKey);
    Object.defineProperty(target, declarationKey, {
      value: declaration,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
}
