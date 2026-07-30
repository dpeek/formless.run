import path from "node:path";

import { mkdir, writeFile } from "node:fs/promises";

import rawTaskSourceSchema from "@dpeek/formless-tasks-app/schema.json";
import {
  appPackageManifestKind,
  appPackageManifestVersion,
  computeSourceSchemaHash,
  parseAppPackageManifest,
  type AppPackageCapability,
  type AppPackageManifest,
  type SourceSchemaHash,
} from "@dpeek/formless-installed-apps";

export type WorkspaceAppPackageFixture = {
  manifest: AppPackageManifest;
  manifestPath: string;
  packageRoot: string;
  sourceSchema: unknown;
  sourceSchemaHash: SourceSchemaHash;
  sourceSchemaPath: string;
};

export async function runtimeWorkspaceTaskAppPackageFixture(
  options: WorkspaceAppPackageFixtureOptions = {},
) {
  const sourceSchema = options.sourceSchema ?? rawTaskSourceSchema;
  const sourceSchemaHash =
    options.sourceSchemaHash ?? (await computeSourceSchemaHash(sourceSchema));

  return {
    manifest: workspaceAppPackageManifestFixture({
      defaultInstallId: "test-tasks",
      label: "Test Tasks",
      packageAppKey: "test-tasks",
      supportsMultipleInstalls: true,
      ...options,
      sourceSchemaHash,
    }),
    sourceSchema,
  };
}

type WorkspaceAppPackageFixtureOptions = {
  capabilities?: AppPackageCapability[];
  defaultInstallId?: string;
  description?: string;
  label?: string;
  packageAppKey?: string;
  packageRevision?: number;
  sourceSchema?: unknown;
  sourceSchemaHash?: SourceSchemaHash;
  sourceSchemaPath?: string;
  supportsMultipleInstalls?: boolean;
};

export async function writeWorkspaceAppPackageFixture(
  packageRoot: string,
  options: WorkspaceAppPackageFixtureOptions = {},
): Promise<WorkspaceAppPackageFixture> {
  const sourceSchema = options.sourceSchema ?? rawTaskSourceSchema;
  const sourceSchemaHash =
    options.sourceSchemaHash ?? (await computeSourceSchemaHash(sourceSchema));
  const sourceSchemaPath = options.sourceSchemaPath ?? "source/schema.json";
  const manifest = workspaceAppPackageManifestFixture({
    ...options,
    sourceSchemaHash,
    sourceSchemaPath,
  });
  const manifestPath = path.join(packageRoot, "formless.app.json");
  const resolvedSourceSchemaPath = path.join(packageRoot, sourceSchemaPath);

  await writeJsonFile(resolvedSourceSchemaPath, sourceSchema);
  await writeJsonFile(manifestPath, manifest);

  return {
    manifest,
    manifestPath,
    packageRoot,
    sourceSchema,
    sourceSchemaHash,
    sourceSchemaPath: resolvedSourceSchemaPath,
  };
}

export function workspaceAppPackageManifestFixture(
  options: WorkspaceAppPackageFixtureOptions & { sourceSchemaHash: SourceSchemaHash },
): AppPackageManifest {
  const packageAppKey = options.packageAppKey ?? "private-labs";
  const label = options.label ?? "Private Labs";
  const defaultInstallId = options.defaultInstallId ?? "labs";
  const sourceSchemaPath = options.sourceSchemaPath ?? "source/schema.json";

  return parseAppPackageManifest({
    kind: appPackageManifestKind,
    version: appPackageManifestVersion,
    packageAppKey,
    label,
    description: options.description ?? "Private lab package fixture.",
    defaultInstallId,
    supportsMultipleInstalls: options.supportsMultipleInstalls ?? false,
    packageRevision: options.packageRevision ?? 7,
    sourceSchema: {
      kind: "workspace",
      key: packageAppKey,
      path: sourceSchemaPath,
    },
    sourceSchemaHash: options.sourceSchemaHash,
    capabilities: options.capabilities ?? [{ kind: "generatedAdmin", routeBase: "/apps" }],
  });
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
