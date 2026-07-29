import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";

import type { AppSchema } from "@dpeek/formless-schema";
import {
  INSTANCE_WORKSPACE_MANIFEST_FILE as FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE,
  parseInstanceWorkspaceManifestJson as parseFormlessInstanceWorkspaceManifestJson,
  type InstanceWorkspaceManifest as FormlessInstanceWorkspaceManifest,
  type WorkspacePackageAppSchemaProvenance,
} from "@dpeek/formless-workspace";
import {
  createWorkspaceAppPackageResolver,
  type WorkspaceAppPackageResolverResult,
} from "@dpeek/formless-workspace/node";
import {
  bundledAppPackageManifests,
  findResolvedAppPackage,
  type AppPackageResolver,
} from "../shared/app-packages.ts";
import { formatRuntimeWorkspaceAppPackages } from "../shared/workspace-runtime-packages.ts";
import { findWorkerSchemaAppDefinition } from "../worker/schema-apps.ts";

export type ActiveWorkspaceAppPackages = WorkspaceAppPackageResolverResult;

export type FormlessInstanceWorkspaceDiscoveryResult = {
  manifestPath: string;
  workspaceRoot: string;
};

export function workspaceRootForInput(cwd: string, workspacePath = "."): string {
  return path.resolve(cwd, workspacePath);
}

export function workspaceManifestPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE);
}

export async function readWorkspaceManifest(workspaceRoot: string): Promise<{
  manifest: FormlessInstanceWorkspaceManifest;
  manifestPath: string;
}> {
  const manifestPath = workspaceManifestPath(workspaceRoot);

  return {
    manifest: parseFormlessInstanceWorkspaceManifestJson(await readFile(manifestPath, "utf8")),
    manifestPath,
  };
}

export async function discoverFormlessInstanceWorkspaceRoot(
  cwd: string,
): Promise<FormlessInstanceWorkspaceDiscoveryResult> {
  let directory = path.resolve(cwd);

  while (true) {
    const manifestPath = workspaceManifestPath(directory);

    if (await pathExists(manifestPath)) {
      return {
        manifestPath,
        workspaceRoot: directory,
      };
    }

    const parent = path.dirname(directory);

    if (parent === directory) {
      throw new Error(
        `Could not find ${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} from ${path.resolve(cwd)}.`,
      );
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
  manifest: FormlessInstanceWorkspaceManifest,
): string {
  return path.resolve(workspaceRoot, manifest.local.stateRoot);
}

export function formlessInstanceWorkspaceWranglerPersistPath(
  workspaceRoot: string,
  manifest: FormlessInstanceWorkspaceManifest,
): string {
  return path.join(formlessInstanceWorkspaceLocalStateRoot(workspaceRoot, manifest), "wrangler");
}

export async function createActiveWorkspaceAppPackages(
  workspaceRoot: string,
  manifest?: FormlessInstanceWorkspaceManifest,
): Promise<ActiveWorkspaceAppPackages> {
  const workspaceManifest = manifest ?? (await readWorkspaceManifest(workspaceRoot)).manifest;

  return createWorkspaceAppPackageResolver({
    bundledManifests: bundledAppPackageManifests,
    manifest: workspaceManifest,
    workspaceRoot,
  });
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
