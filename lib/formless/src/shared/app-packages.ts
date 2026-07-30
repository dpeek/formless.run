import rawCrmAppPackageManifest from "@dpeek/formless-crm-app/formless.app.json";
import rawSiteAppPackageManifest from "@dpeek/formless-site-app/formless.app.json";
import rawTasksAppPackageManifest from "@dpeek/formless-tasks-app/formless.app.json";
import {
  createAppPackageResolver,
  findResolvedAppPackage as findResolvedAppPackageWithResolver,
  listResolvedAppPackages as listResolvedAppPackagesWithResolver,
  parseAppPackageManifest,
  type AppPackageManifest,
  type AppPackageResolver,
  type ResolvedAppPackage,
} from "@dpeek/formless-installed-apps";

import type { SchemaKey } from "./schema-apps.ts";

export {
  appPackageManifestKind,
  appPackageManifestVersion,
  createAppPackageResolver,
  parseAppPackageManifest,
  type AppPackageCapability,
  type AppPackageKey,
  type AppPackageManifest,
  type AppPackageResolver,
  type AppPackageSourceLocation,
  type AppPackageSourceLocationKind,
  type AppPackageSourceOrigin,
  type ResolvedAppPackage,
} from "@dpeek/formless-installed-apps";

const bundledSiteAppPackageManifest = bundledAppPackageManifestFromSource(
  rawSiteAppPackageManifest,
  {
    context: "bundled Site app package manifest",
    packageAppKey: "site",
  },
);
const bundledTasksAppPackageManifest = bundledAppPackageManifestFromSource(
  rawTasksAppPackageManifest,
  {
    context: "bundled Tasks app package manifest",
    packageAppKey: "tasks",
  },
);
const bundledCrmAppPackageManifest = bundledAppPackageManifestFromSource(rawCrmAppPackageManifest, {
  context: "bundled CRM app package manifest",
  packageAppKey: "crm",
});

export const rootKnownAppPackageManifests = [
  bundledSiteAppPackageManifest,
  bundledTasksAppPackageManifest,
  bundledCrmAppPackageManifest,
] as const satisfies readonly AppPackageManifest[];

export const bundledAppPackageManifests = [
  bundledSiteAppPackageManifest,
  bundledCrmAppPackageManifest,
] as const satisfies readonly AppPackageManifest[];

export const bundledAppPackageResolver = createAppPackageResolver(bundledAppPackageManifests);
const rootKnownAppPackageResolver = createAppPackageResolver(rootKnownAppPackageManifests);

export function isRuntimeInstallableAppPackageKey(packageAppKey: string): boolean {
  return packageAppKey !== "tasks";
}

export function runtimeInstallableAppPackageResolver(
  resolver: AppPackageResolver,
): AppPackageResolver {
  return {
    findPackage(packageAppKey) {
      return isRuntimeInstallableAppPackageKey(packageAppKey)
        ? resolver.findPackage(packageAppKey)
        : undefined;
    },
    listPackages() {
      return resolver
        .listPackages()
        .filter((appPackage) => isRuntimeInstallableAppPackageKey(appPackage.packageAppKey));
    },
  };
}

export function rootKnownPackageFactsResolver(
  runtimeResolver: AppPackageResolver = bundledAppPackageResolver,
): AppPackageResolver {
  return {
    findPackage(packageAppKey) {
      return !isRuntimeInstallableAppPackageKey(packageAppKey)
        ? rootKnownAppPackageResolver.findPackage(packageAppKey)
        : runtimeResolver.findPackage(packageAppKey);
    },
    listPackages() {
      return [
        ...runtimeResolver
          .listPackages()
          .filter((appPackage) => isRuntimeInstallableAppPackageKey(appPackage.packageAppKey)),
        rootKnownAppPackageResolver.findPackage("tasks")!,
      ];
    },
  };
}

export function listResolvedAppPackages(
  resolver: AppPackageResolver = bundledAppPackageResolver,
): ResolvedAppPackage[] {
  return listResolvedAppPackagesWithResolver(resolver);
}

export function findResolvedAppPackage(
  packageAppKey: string,
  resolver: AppPackageResolver = bundledAppPackageResolver,
): ResolvedAppPackage | undefined {
  return findResolvedAppPackageWithResolver(packageAppKey, resolver);
}

function bundledAppPackageManifestFromSource(
  manifest: unknown,
  input: {
    context: string;
    packageAppKey: SchemaKey;
  },
): AppPackageManifest {
  const parsed = parseAppPackageManifest(manifest, input.context);

  if (parsed.packageAppKey !== input.packageAppKey) {
    throw new Error(`${input.context} packageAppKey must be "${input.packageAppKey}".`);
  }

  if (parsed.sourceSchema.kind !== "bundled") {
    throw new Error(`${input.context} sourceSchema kind must be "bundled".`);
  }

  return parsed;
}
