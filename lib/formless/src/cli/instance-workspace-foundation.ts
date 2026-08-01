import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  FORMLESS_CONFIG_FILE,
  resolveFormlessConfig,
  type FormlessConfig,
  type ResolvedFormlessConfig,
} from "@dpeek/formless-workspace";
import {
  FORMLESS_PROGRAM_ARTIFACT_FILE,
  formatFormlessProgramArtifact,
  materializeFormlessProgramSourceArtifact,
  type FormlessProgramArtifact,
} from "../program/artifact.ts";
import { formlessProgramSourceSchema } from "../program/schema.ts";

export type ActiveWorkspaceProgramArtifact = {
  artifact: FormlessProgramArtifact;
  contents: string;
  path: string;
};

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

export function formatFormlessConfigModule(config: Omit<FormlessConfig, "program">): string {
  const authorConfig: Omit<FormlessConfig, "program"> = {
    name: config.name,
    ...(config.state === undefined ? {} : { state: config.state }),
    ...(config.media === undefined ? {} : { media: config.media }),
    ...(config.local === undefined ? {} : { local: config.local }),
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

export async function materializeActiveWorkspaceProgramArtifact(
  workspaceRoot: string,
  config: ResolvedFormlessConfig,
): Promise<ActiveWorkspaceProgramArtifact> {
  const artifact = await activeWorkspaceProgramArtifact(config);
  const contents = formatFormlessProgramArtifact(artifact);
  const artifactPath = path.join(
    formlessInstanceWorkspaceLocalStateRoot(workspaceRoot, config),
    FORMLESS_PROGRAM_ARTIFACT_FILE,
  );

  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFileIfChanged(artifactPath, contents);

  return {
    artifact,
    contents,
    path: artifactPath,
  };
}

export function activeWorkspaceProgramArtifact(config: ResolvedFormlessConfig) {
  return materializeFormlessProgramSourceArtifact(
    config.programSource ?? formlessProgramSourceSchema,
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

async function writeFileIfChanged(filePath: string, contents: string): Promise<void> {
  try {
    if ((await readFile(filePath, "utf8")) === contents) {
      return;
    }
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  await writeFile(filePath, contents);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
