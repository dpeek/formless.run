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

export const bundledAppPackageManifests = [
  bundledAppPackageManifestFromSource(rawSiteAppPackageManifest, {
    context: "bundled Site app package manifest",
    packageAppKey: "site",
  }),
  bundledAppPackageManifestFromSource(rawTasksAppPackageManifest, {
    context: "bundled Tasks app package manifest",
    packageAppKey: "tasks",
  }),
  bundledAppPackageManifestFromSource(rawCrmAppPackageManifest, {
    context: "bundled CRM app package manifest",
    packageAppKey: "crm",
  }),
] as const satisfies readonly AppPackageManifest[];

export const bundledAppPackageResolver = createAppPackageResolver(bundledAppPackageManifests);

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
