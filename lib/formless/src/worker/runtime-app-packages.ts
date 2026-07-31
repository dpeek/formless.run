import { parseAppSchema } from "@dpeek/formless-schema";
import type { AppSchema } from "@dpeek/formless-schema";

import {
  bundledAppPackageManifests,
  bundledAppPackageResolver,
  createAppPackageResolver,
  findResolvedAppPackage,
  listResolvedAppPackages,
  parseAppPackageManifest,
  runtimeInstallableAppPackageResolver,
  type AppPackageManifest,
  type AppPackageResolver,
  type ResolvedAppPackage,
} from "../shared/app-packages.ts";
import {
  FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME,
  parseRuntimeWorkspaceAppPackagesJson,
} from "../shared/workspace-runtime-packages.ts";

declare const __FORMLESS_WORKSPACE_APP_PACKAGES_JSON__: string | undefined;

export type WorkerAppDefinition = {
  key: string;
  label: string;
  route: `/${string}`;
  sourceSchema: AppSchema;
};

export type ActiveRuntimeAppPackageEnv = {
  [FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME]?: string;
};

type ActiveRuntimeAppPackages = {
  resolver: AppPackageResolver;
  schemaDefinitions: ReadonlyMap<string, WorkerAppDefinition>;
  sourceSchemas: ReadonlyMap<string, AppSchema>;
};

const activeRuntimeAppPackagesCache = new Map<string, ActiveRuntimeAppPackages>();

export function activeAppPackageResolver(env?: ActiveRuntimeAppPackageEnv): AppPackageResolver {
  return activeRuntimeAppPackages(env).resolver;
}

export function listActiveAppPackages(env?: ActiveRuntimeAppPackageEnv): ResolvedAppPackage[] {
  return listResolvedAppPackages(activeAppPackageResolver(env));
}

export function findActiveAppPackage(
  packageAppKey: string,
  env?: ActiveRuntimeAppPackageEnv,
): ResolvedAppPackage | undefined {
  return findResolvedAppPackage(packageAppKey, activeAppPackageResolver(env));
}

export function findActiveWorkerSchemaAppDefinition(
  key: string,
  env?: ActiveRuntimeAppPackageEnv,
): WorkerAppDefinition | undefined {
  return activeRuntimeAppPackages(env).schemaDefinitions.get(key);
}

export function activeWorkerSourceSchemas(
  env?: ActiveRuntimeAppPackageEnv,
): Partial<Record<string, AppSchema>> {
  return Object.fromEntries(activeRuntimeAppPackages(env).sourceSchemas);
}

function activeRuntimeAppPackages(env?: ActiveRuntimeAppPackageEnv): ActiveRuntimeAppPackages {
  const contents = activeRuntimeAppPackagesContents(env);

  if (!contents) {
    return bundledRuntimeAppPackages();
  }

  const cached = activeRuntimeAppPackagesCache.get(contents);

  if (cached) {
    return cached;
  }

  const parsed = parseRuntimeWorkspaceAppPackagesJson(contents);
  const linked = parsed.packages.map((source, index) =>
    parseRuntimeWorkspaceAppPackageSource(source, `workspace app packages[${index}]`),
  );
  const resolver = runtimeInstallableAppPackageResolver(
    createAppPackageResolver([
      ...bundledAppPackageManifests,
      ...linked.map((source) => source.manifest),
    ]),
  );
  const schemaDefinitions = new Map<string, WorkerAppDefinition>();
  const sourceSchemas = new Map<string, AppSchema>();

  for (const source of linked) {
    const appPackage = resolver.findPackage(source.manifest.packageAppKey);

    if (!appPackage) {
      continue;
    }

    const definition = workerSchemaAppDefinitionFromPackageSource(appPackage, source);

    schemaDefinitions.set(appPackage.sourceSchemaKey, definition);
    sourceSchemas.set(appPackage.sourceSchemaKey, source.sourceSchema);
  }

  const result = {
    resolver,
    schemaDefinitions,
    sourceSchemas,
  };

  activeRuntimeAppPackagesCache.set(contents, result);

  return result;
}

function activeRuntimeAppPackagesContents(env?: ActiveRuntimeAppPackageEnv): string | undefined {
  const envContents = env?.[FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME]?.trim();

  if (envContents) {
    return envContents;
  }

  if (
    typeof __FORMLESS_WORKSPACE_APP_PACKAGES_JSON__ === "string" &&
    __FORMLESS_WORKSPACE_APP_PACKAGES_JSON__.trim()
  ) {
    return __FORMLESS_WORKSPACE_APP_PACKAGES_JSON__.trim();
  }

  return undefined;
}

function bundledRuntimeAppPackages(): ActiveRuntimeAppPackages {
  return {
    resolver: bundledAppPackageResolver,
    schemaDefinitions: new Map(),
    sourceSchemas: new Map(),
  };
}

function parseRuntimeWorkspaceAppPackageSource(
  source: {
    manifest: unknown;
    sourceSchema: unknown;
  },
  context: string,
): {
  manifest: AppPackageManifest;
  sourceSchema: AppSchema;
} {
  const manifest = parseAppPackageManifest(source.manifest, `${context} manifest`);
  const sourceSchema = parseAppSchema(source.sourceSchema);

  return {
    manifest,
    sourceSchema,
  };
}

function workerSchemaAppDefinitionFromPackageSource(
  appPackage: ResolvedAppPackage,
  source: {
    sourceSchema: AppSchema;
  },
): WorkerAppDefinition {
  const route = `/${appPackage.defaultInstallId}` as `/${string}`;

  return {
    key: appPackage.sourceSchemaKey,
    label: appPackage.label,
    route,
    sourceSchema: source.sourceSchema,
  };
}
