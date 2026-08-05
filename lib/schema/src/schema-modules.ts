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
  const runtime = composeRuntimeMetadata(composition);
  const declarationOwners = new Map<string, string>();
  const entityIdOwners = new Map<string, { entityKey: string; moduleKey: string }>();
  const entities: AppSchemaSource["entities"] = [];
  const relationships: NonNullable<AppSchemaSource["relationships"]> = [];
  const queries: AppSchemaSource["queries"] = [];
  const computedValues: NonNullable<NonNullable<AppSchemaSource["readModels"]>["computedValues"]> =
    [];
  const aggregates: NonNullable<NonNullable<AppSchemaSource["readModels"]>["aggregates"]> = [];
  const unions: NonNullable<AppSchemaSource["unions"]> = [];
  const itemViews: AppSchemaSource["itemViews"] = [];
  const tableViews: AppSchemaSource["tableViews"] = [];
  const views: AppSchemaSource["views"] = [];
  const screens: AppSchemaSource["screens"] = [];
  const surfaceMounts: NonNullable<AppSchemaSource["surfaceMounts"]> = [];
  let hasRelationships = false;
  let hasReadModels = false;
  let hasComputedValues = false;
  let hasAggregates = false;
  let hasUnions = false;
  let hasSurfaceMounts = false;

  for (const module of composition.modules) {
    appendEntityDeclarations(
      entities,
      module.entities,
      module.key,
      declarationOwners,
      entityIdOwners,
    );
    appendDeclarations(queries, module.queries, "queries", module.key, declarationOwners);
    appendDeclarations(itemViews, module.itemViews, "itemViews", module.key, declarationOwners);
    appendDeclarations(tableViews, module.tableViews, "tableViews", module.key, declarationOwners);
    appendDeclarations(views, module.views, "views", module.key, declarationOwners);
    appendDeclarations(screens, module.screens, "screens", module.key, declarationOwners);
    if (module.surfaceMounts !== undefined) {
      hasSurfaceMounts = true;
      appendDeclarations(
        surfaceMounts,
        module.surfaceMounts,
        "surfaceMounts",
        module.key,
        declarationOwners,
      );
    }

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
    ...(composition.authorization === undefined
      ? {}
      : { authorization: composition.authorization }),
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
    ...(hasSurfaceMounts ? { surfaceMounts } : {}),
    ...(composition.navigation === undefined ? {} : { navigation: composition.navigation }),
    ...(runtime === undefined ? {} : { runtime }),
  };
  parseAppSchema(source);
  return source;
}

function composeRuntimeMetadata(
  composition: AppSchemaCompositionSource,
): AppSchemaSource["runtime"] {
  const entityOwners = new Map<string, string>();
  const policyOwners = new Map<string, string>();
  const entities: NonNullable<NonNullable<AppSchemaSource["runtime"]>["controlPlane"]>["entities"] =
    {};
  let hasModuleRuntime = false;

  for (const module of composition.modules) {
    for (const entity of module.entities ?? []) {
      if (!entityOwners.has(entity.key)) {
        entityOwners.set(entity.key, module.key);
      }
    }
  }

  for (const module of composition.modules) {
    if (module.runtime === undefined) {
      continue;
    }

    assertNarrowModuleRuntime(module);
    hasModuleRuntime = true;

    if (composition.runtime === undefined) {
      throw new Error(
        `Schema module "${module.key}" contributes runtime controlPlane entity policy, but the composition root has no runtime owner.`,
      );
    }

    const ownedEntities = new Set((module.entities ?? []).map((entity) => entity.key));
    for (const [entityKey, policy] of Object.entries(module.runtime.controlPlane.entities)) {
      const currentPolicyOwner = policyOwners.get(entityKey);
      if (currentPolicyOwner !== undefined) {
        throw new Error(
          `Schema runtime controlPlane entity policy "${entityKey}" is contributed by both modules "${currentPolicyOwner}" and "${module.key}".`,
        );
      }

      if (!ownedEntities.has(entityKey)) {
        const entityOwner = entityOwners.get(entityKey);
        throw new Error(
          entityOwner === undefined
            ? `Schema module "${module.key}" contributes runtime controlPlane policy for entity "${entityKey}", but does not declare that entity.`
            : `Schema module "${module.key}" contributes runtime controlPlane policy for entity "${entityKey}", but that entity is owned by module "${entityOwner}".`,
        );
      }

      policyOwners.set(entityKey, module.key);
      entities[entityKey] = policy;
    }
  }

  if (composition.runtime === undefined) {
    return undefined;
  }

  return {
    owner: composition.runtime.owner,
    ...(hasModuleRuntime ? { controlPlane: { entities } } : {}),
  };
}

function assertNarrowModuleRuntime(module: AppSchemaModuleSource): void {
  if (
    !isRecord(module.runtime) ||
    !hasExactKeys(module.runtime, ["controlPlane"]) ||
    !isRecord(module.runtime.controlPlane) ||
    !hasExactKeys(module.runtime.controlPlane, ["entities"]) ||
    !isRecord(module.runtime.controlPlane.entities)
  ) {
    throw new Error(
      `Schema module "${module.key}" runtime contribution must contain only "controlPlane.entities".`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function appendEntityDeclarations(
  target: AppSchemaSource["entities"],
  declarations: AppSchemaModuleSource["entities"],
  moduleKey: string,
  declarationOwners: Map<string, string>,
  entityIdOwners: Map<string, { entityKey: string; moduleKey: string }>,
): void {
  if (declarations === undefined) {
    return;
  }

  for (const declaration of declarations) {
    appendDeclarations(target, [declaration], "entities", moduleKey, declarationOwners);
    const currentOwner = entityIdOwners.get(declaration.id);
    if (currentOwner !== undefined) {
      throw new Error(
        `Schema entity id "${declaration.id}" is contributed by both module "${currentOwner.moduleKey}" entity "${currentOwner.entityKey}" and module "${moduleKey}" entity "${declaration.key}".`,
      );
    }
    entityIdOwners.set(declaration.id, { entityKey: declaration.key, moduleKey });
  }
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
  const moduleIndexes = new Map<string, number>(
    modules.map((module, index) => [module.key, index]),
  );

  for (const [consumerIndex, module] of modules.entries()) {
    for (const dependencyKey of module.requires ?? []) {
      const dependencyIndex = moduleIndexes.get(dependencyKey);

      if (dependencyIndex === undefined) {
        throw new Error(
          `Schema module "${module.key}" requires module "${dependencyKey}", but "${dependencyKey}" is not listed.`,
        );
      }

      if (dependencyIndex >= consumerIndex) {
        throw new Error(
          `Schema module "${module.key}" requires module "${dependencyKey}" to be listed before it.`,
        );
      }
    }
  }
}
function appendDeclarations<
  Declaration extends {
    key: string;
  },
>(
  target: Declaration[],
  declarations: readonly Declaration[] | undefined,
  registryPath: string,
  moduleKey: string,
  declarationOwners: Map<string, string>,
): void {
  if (declarations === undefined) {
    return;
  }
  for (const declaration of declarations) {
    const declarationKey = declaration.key;
    const declarationPath = `${registryPath}.${declarationKey}`;
    const currentOwner = declarationOwners.get(declarationPath);
    if (currentOwner !== undefined) {
      throw new Error(
        `Schema declaration "${declarationPath}" is contributed by both modules "${currentOwner}" and "${moduleKey}".`,
      );
    }
    declarationOwners.set(declarationPath, moduleKey);
    target.push(declaration);
  }
}
