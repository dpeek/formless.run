import type { AppPackageManifest } from "./app-packages.ts";

export const FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME = "FORMLESS_WORKSPACE_APP_PACKAGES";
export const runtimeWorkspaceAppPackagesKind = "formless.runtimeWorkspaceAppPackages";
export const runtimeWorkspaceAppPackagesVersion = 1;

export type RuntimeWorkspaceAppPackageSource = {
  manifest: AppPackageManifest;
  sourceSchema: unknown;
};

export type RuntimeWorkspaceAppPackages = {
  kind: typeof runtimeWorkspaceAppPackagesKind;
  version: typeof runtimeWorkspaceAppPackagesVersion;
  packages: RuntimeWorkspaceAppPackageSource[];
};

export function defaultRuntimeWorkspaceAppPackages(): RuntimeWorkspaceAppPackages {
  return {
    kind: runtimeWorkspaceAppPackagesKind,
    version: runtimeWorkspaceAppPackagesVersion,
    packages: [],
  };
}

export function formatRuntimeWorkspaceAppPackages(
  packages: readonly RuntimeWorkspaceAppPackageSource[],
): string {
  return `${JSON.stringify(
    {
      ...defaultRuntimeWorkspaceAppPackages(),
      packages: packages.map((appPackage) => ({
        manifest: appPackage.manifest,
        sourceSchema: appPackage.sourceSchema,
      })),
    },
    null,
    2,
  )}\n`;
}

export function parseRuntimeWorkspaceAppPackagesJson(
  contents: string,
): RuntimeWorkspaceAppPackages {
  const value = JSON.parse(contents) as unknown;

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Runtime workspace app packages must be an object.");
  }

  const object = value as Record<string, unknown>;

  if (object.kind !== runtimeWorkspaceAppPackagesKind) {
    throw new Error(
      `Runtime workspace app packages kind must be "${runtimeWorkspaceAppPackagesKind}".`,
    );
  }

  if (object.version !== runtimeWorkspaceAppPackagesVersion) {
    throw new Error(
      `Runtime workspace app packages version must be ${runtimeWorkspaceAppPackagesVersion}.`,
    );
  }

  if (!Array.isArray(object.packages)) {
    throw new Error("Runtime workspace app packages packages must be an array.");
  }

  return {
    kind: runtimeWorkspaceAppPackagesKind,
    version: runtimeWorkspaceAppPackagesVersion,
    packages: object.packages.map((appPackage, index) =>
      parseRuntimeWorkspaceAppPackageSource(appPackage, `packages[${index}]`),
    ),
  };
}

function parseRuntimeWorkspaceAppPackageSource(
  value: unknown,
  context: string,
): RuntimeWorkspaceAppPackageSource {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Runtime workspace app package ${context} must be an object.`);
  }

  const object = value as Record<string, unknown>;

  return {
    manifest: object.manifest as AppPackageManifest,
    sourceSchema: object.sourceSchema,
  };
}
