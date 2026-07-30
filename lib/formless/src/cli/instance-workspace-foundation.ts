import { mkdir, mkdtemp, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { AppSchema } from "@dpeek/formless-schema";
import {
  FORMLESS_CONFIG_FILE,
  resolveFormlessConfig,
  type FormlessConfig,
  type ResolvedFormlessConfig,
  type WorkspacePackageAppSchemaProvenance,
} from "@dpeek/formless-workspace";
import {
  createWorkspaceAppPackageResolver,
  type WorkspaceAppPackageResolverResult,
} from "@dpeek/formless-workspace/node";
import {
  bundledAppPackageManifests,
  findResolvedAppPackage,
  runtimeInstallableAppPackageResolver,
  type AppPackageResolver,
} from "../shared/app-packages.ts";
import { formatRuntimeWorkspaceAppPackages } from "../shared/workspace-runtime-packages.ts";
import { findWorkerSchemaAppDefinition } from "../worker/schema-apps.ts";

export type ActiveWorkspaceAppPackages = WorkspaceAppPackageResolverResult;

export type FormlessInstanceWorkspaceDiscoveryResult = {
  configPath: string;
  workspaceRoot: string;
};

export function workspaceRootForInput(cwd: string, workspacePath = "."): string {
  return path.resolve(cwd, workspacePath);
}

export function workspaceConfigPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, FORMLESS_CONFIG_FILE);
}

export async function readWorkspaceConfig(workspaceRoot: string): Promise<{
  config: ResolvedFormlessConfig;
  configPath: string;
}> {
  const configPath = workspaceConfigPath(workspaceRoot);
  const configUrl = pathToFileURL(configPath);
  const configStat = await stat(configPath, { bigint: true });

  configUrl.searchParams.set("formlessConfigVersion", `${configStat.mtimeNs}-${configStat.size}`);

  const configModule = (await import(configUrl.href)) as {
    default?: FormlessConfig;
  };

  if (configModule.default === undefined) {
    throw new Error(`${FORMLESS_CONFIG_FILE} must default-export Formless configuration.`);
  }

  return {
    config: resolveFormlessConfig(configModule.default),
    configPath,
  };
}

export function formatFormlessConfigModule(config: FormlessConfig): string {
  const authorConfig: FormlessConfig = {
    name: config.name,
    ...(config.state === undefined ? {} : { state: config.state }),
    ...(config.media === undefined ? {} : { media: config.media }),
    ...(config.local === undefined ? {} : { local: config.local }),
    ...(config.packages === undefined ? {} : { packages: config.packages }),
    ...(config.runtime === undefined ? {} : { runtime: config.runtime }),
  };
  const resolved = resolveFormlessConfig(authorConfig);
  const properties = Object.keys(authorConfig);

  if (properties.length !== 1 || properties[0] !== "name") {
    return [
      'import { defineConfig } from "@dpeek/formless";',
      "",
      `export default defineConfig(${JSON.stringify(authorConfig, null, 2)});`,
      "",
    ].join("\n");
  }

  return [
    'import { defineConfig } from "@dpeek/formless";',
    "",
    "export default defineConfig({",
    `  name: ${JSON.stringify(resolved.name)},`,
    "});",
    "",
  ].join("\n");
}

export async function discoverFormlessInstanceWorkspaceRoot(
  cwd: string,
): Promise<FormlessInstanceWorkspaceDiscoveryResult> {
  let directory = path.resolve(cwd);

  while (true) {
    const configPath = workspaceConfigPath(directory);

    if (await pathExists(configPath)) {
      return {
        configPath,
        workspaceRoot: directory,
      };
    }

    const parent = path.dirname(directory);

    if (parent === directory) {
      throw new Error(`Could not find ${FORMLESS_CONFIG_FILE} from ${path.resolve(cwd)}.`);
    }

    directory = parent;
  }
}

export async function resolveFormlessInstanceWorkspaceRoot(input: {
  cwd: string;
  workspacePath?: string | null;
}): Promise<string> {
  if (input.workspacePath === undefined || input.workspacePath === null) {
    return (await discoverFormlessInstanceWorkspaceRoot(input.cwd)).workspaceRoot;
  }

  return workspaceRootForInput(input.cwd, input.workspacePath);
}

export async function createWorkspaceTempRoot(
  workspaceRoot: string,
  name: string,
): Promise<string> {
  const tempParent = path.join(workspaceRoot, ".formless");

  await mkdir(tempParent, { recursive: true });

  return mkdtemp(path.join(tempParent, `${name}-`));
}

export function formlessInstanceWorkspaceLocalStateRoot(
  workspaceRoot: string,
  config: ResolvedFormlessConfig,
): string {
  return path.resolve(workspaceRoot, config.local.stateRoot);
}

export function formlessInstanceWorkspaceWranglerPersistPath(
  workspaceRoot: string,
  config: ResolvedFormlessConfig,
): string {
  return path.join(formlessInstanceWorkspaceLocalStateRoot(workspaceRoot, config), "wrangler");
}

export async function createActiveWorkspaceAppPackages(
  workspaceRoot: string,
  config?: ResolvedFormlessConfig,
): Promise<ActiveWorkspaceAppPackages> {
  const workspaceConfig = config ?? (await readWorkspaceConfig(workspaceRoot)).config;

  const activePackages = await createWorkspaceAppPackageResolver({
    bundledManifests: bundledAppPackageManifests,
    manifest: workspaceConfig,
    workspaceRoot,
  });
  const resolver = runtimeInstallableAppPackageResolver(activePackages.resolver);

  return {
    ...activePackages,
    linkedPackages: activePackages.linkedPackages.filter(
      (appPackage) => resolver.findPackage(appPackage.appPackage.packageAppKey) !== undefined,
    ),
    resolver,
  };
}

export function workspaceSourceSchemaForPackageApp(input: {
  activePackages: ActiveWorkspaceAppPackages;
  packageAppKey: string;
}): AppSchema | undefined {
  const linked = input.activePackages.linkedPackages.find(
    (appPackage) => appPackage.appPackage.packageAppKey === input.packageAppKey,
  );

  if (linked) {
    return linked.sourceSchema;
  }

  const packageApp = findResolvedAppPackage(input.packageAppKey, input.activePackages.resolver);
  const bundled = packageApp
    ? findWorkerSchemaAppDefinition(packageApp.sourceSchemaKey)
    : undefined;

  return bundled?.sourceSchema;
}

export function workspaceSchemaProvenanceForPackageApp(
  packageApp: Pick<
    NonNullable<ReturnType<AppPackageResolver["findPackage"]>>,
    "packageAppKey" | "packageRevision" | "sourceSchemaHash"
  >,
): WorkspacePackageAppSchemaProvenance {
  return {
    kind: "package-app",
    packageAppKey: packageApp.packageAppKey,
    packageRevision: packageApp.packageRevision,
    sourceSchemaHash: packageApp.sourceSchemaHash,
  };
}

export function runtimeWorkspaceAppPackagesEnvValue(
  activePackages: ActiveWorkspaceAppPackages,
): string | undefined {
  if (activePackages.linkedPackages.length === 0) {
    return undefined;
  }

  return formatRuntimeWorkspaceAppPackages(
    activePackages.linkedPackages.map((appPackage) => ({
      manifest: appPackage.manifest,
      sourceSchema: appPackage.sourceSchema,
    })),
  );
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath, "utf8");
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
