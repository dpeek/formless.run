import { stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { Plugin as EsbuildPlugin } from "esbuild";
import type {
  InstanceWorkspaceRuntimeComposition,
  ResolvedFormlessConfig,
} from "@dpeek/formless-workspace";
import {
  DEFAULT_FORMLESS_PROGRAM_BROWSER_RUNTIME_MODULE,
  DEFAULT_FORMLESS_PROGRAM_SHARED_RUNTIME_MODULE,
  DEFAULT_FORMLESS_PROGRAM_WORKER_RUNTIME_MODULE,
} from "@dpeek/formless-workspace";
import { SITE_PUBLIC_SURFACE_KEY } from "@dpeek/formless-site-app/runtime";
import type { Plugin } from "vite-plus";
import {
  validateProgramSharedRuntimeComposition,
  validateProgramRuntimeComposition,
  type ProgramBrowserRuntimeDefinition,
  type ProgramRuntimeComposition,
  type ProgramSharedRuntimeDefinition,
  type ProgramWorkerRuntimeDefinition,
} from "../program/composition.ts";
import type { AppSchemaCompositionSource, AppSchemaSource } from "@dpeek/formless-schema";

export const FORMLESS_WORKSPACE_PROGRAM_RUNTIME_ENV_NAME = "FORMLESS_WORKSPACE_PROGRAM_RUNTIME";
export const PROGRAM_SHARED_RUNTIME_VIRTUAL_MODULE_ID = "virtual:formless/program-runtime/shared";
export const PROGRAM_BROWSER_RUNTIME_VIRTUAL_MODULE_ID = "virtual:formless/program-runtime/browser";
export const PROGRAM_WORKER_RUNTIME_VIRTUAL_MODULE_ID = "virtual:formless/program-runtime/worker";

export type ResolvedWorkspaceProgramRuntime = {
  browserPublicSite: boolean;
  composition: InstanceWorkspaceRuntimeComposition;
};

type ProgramRuntimeTarget = "shared" | "browser" | "worker";

const defaultRuntimeComposition = {
  shared: DEFAULT_FORMLESS_PROGRAM_SHARED_RUNTIME_MODULE,
  browser: DEFAULT_FORMLESS_PROGRAM_BROWSER_RUNTIME_MODULE,
  worker: DEFAULT_FORMLESS_PROGRAM_WORKER_RUNTIME_MODULE,
} as const;
const virtualModuleIds = {
  shared: PROGRAM_SHARED_RUNTIME_VIRTUAL_MODULE_ID,
  browser: PROGRAM_BROWSER_RUNTIME_VIRTUAL_MODULE_ID,
  worker: PROGRAM_WORKER_RUNTIME_VIRTUAL_MODULE_ID,
} as const;
const virtualModuleNamespace = "formless-program-runtime";

export async function loadWorkspaceProgramRuntimeComposition(input: {
  composition: AppSchemaCompositionSource;
  config: Pick<ResolvedFormlessConfig, "runtime">;
  sourceSchema: AppSchemaSource;
  workspaceRoot: string;
}): Promise<ProgramRuntimeComposition> {
  const entrypoints = resolveWorkspaceProgramRuntimeEntrypoints({
    composition: input.config.runtime.composition,
    workspaceRoot: input.workspaceRoot,
  });
  const [shared, browser, worker] = await Promise.all([
    importProgramRuntimeDefinition<ProgramSharedRuntimeDefinition>(entrypoints.shared, "shared"),
    importProgramRuntimeDefinition<ProgramBrowserRuntimeDefinition>(entrypoints.browser, "browser"),
    importProgramRuntimeDefinition<ProgramWorkerRuntimeDefinition>(entrypoints.worker, "worker"),
  ]);
  const runtime = { shared, browser, worker };

  validateProgramRuntimeComposition({
    composition: input.composition,
    runtime,
    sourceSchema: input.sourceSchema,
  });

  return runtime;
}

export async function loadWorkspaceProgramSharedRuntime(input: {
  composition: AppSchemaCompositionSource;
  config: Pick<ResolvedFormlessConfig, "runtime">;
  sourceSchema: AppSchemaSource;
  workspaceRoot: string;
}): Promise<ProgramSharedRuntimeDefinition> {
  const entrypoint = resolveWorkspaceProgramRuntimeEntrypoints({
    composition: input.config.runtime.composition,
    workspaceRoot: input.workspaceRoot,
  }).shared;
  const runtime = await importProgramRuntimeDefinition<ProgramSharedRuntimeDefinition>(
    entrypoint,
    "shared",
  );

  validateProgramSharedRuntimeComposition({
    composition: input.composition,
    runtime,
    sourceSchema: input.sourceSchema,
  });

  return runtime;
}

export function runtimeWorkspaceProgramRuntimeEnvValue(
  config: Pick<ResolvedFormlessConfig, "runtime">,
  runtime: ProgramRuntimeComposition,
): string {
  return JSON.stringify({
    browserPublicSite: runtime.browser.surfaces.some(({ key }) => key === SITE_PUBLIC_SURFACE_KEY),
    composition: config.runtime.composition,
  } satisfies ResolvedWorkspaceProgramRuntime);
}

export function isDefaultWorkspaceProgramRuntimeComposition(
  config: Pick<ResolvedFormlessConfig, "runtime">,
): boolean {
  return (
    config.runtime.composition.shared === defaultRuntimeComposition.shared &&
    config.runtime.composition.browser === defaultRuntimeComposition.browser &&
    config.runtime.composition.worker === defaultRuntimeComposition.worker
  );
}

export function resolveWorkspaceProgramRuntimeFromEnv(
  env: NodeJS.ProcessEnv,
): ResolvedWorkspaceProgramRuntime {
  const raw = env[FORMLESS_WORKSPACE_PROGRAM_RUNTIME_ENV_NAME]?.trim();

  if (!raw) {
    return {
      browserPublicSite: true,
      composition: defaultRuntimeComposition,
    };
  }

  const value = JSON.parse(raw) as unknown;

  if (!isRecord(value)) {
    throw new Error(`${FORMLESS_WORKSPACE_PROGRAM_RUNTIME_ENV_NAME} must be a JSON object.`);
  }

  assertOnlyKeys(
    value,
    new Set(["browserPublicSite", "composition"]),
    FORMLESS_WORKSPACE_PROGRAM_RUNTIME_ENV_NAME,
  );
  if (typeof value.browserPublicSite !== "boolean") {
    throw new Error(
      `${FORMLESS_WORKSPACE_PROGRAM_RUNTIME_ENV_NAME}.browserPublicSite must be a boolean.`,
    );
  }
  if (!isRecord(value.composition)) {
    throw new Error(
      `${FORMLESS_WORKSPACE_PROGRAM_RUNTIME_ENV_NAME}.composition must be a JSON object.`,
    );
  }

  assertOnlyKeys(
    value.composition,
    new Set(["shared", "browser", "worker"]),
    `${FORMLESS_WORKSPACE_PROGRAM_RUNTIME_ENV_NAME}.composition`,
  );

  return {
    browserPublicSite: value.browserPublicSite,
    composition: {
      shared: parseEntrypoint("shared", value.composition.shared),
      browser: parseEntrypoint("browser", value.composition.browser),
      worker: parseEntrypoint("worker", value.composition.worker),
    },
  };
}

export function resolveWorkspaceProgramRuntimeEntrypoints(input: {
  composition: InstanceWorkspaceRuntimeComposition;
  workspaceRoot?: string;
}): InstanceWorkspaceRuntimeComposition {
  return {
    shared: resolveRuntimeEntrypoint("shared", input.composition.shared, input.workspaceRoot),
    browser: resolveRuntimeEntrypoint("browser", input.composition.browser, input.workspaceRoot),
    worker: resolveRuntimeEntrypoint("worker", input.composition.worker, input.workspaceRoot),
  };
}

export function formlessWorkspaceProgramRuntimePlugin(
  input: {
    env?: NodeJS.ProcessEnv;
    runtime?: ResolvedWorkspaceProgramRuntime;
    workspaceRoot?: string;
  } = {},
): Plugin {
  const runtime = input.runtime ?? resolveWorkspaceProgramRuntimeFromEnv(input.env ?? process.env);
  const entrypoints = resolveWorkspaceProgramRuntimeEntrypoints({
    composition: runtime.composition,
    workspaceRoot: input.workspaceRoot,
  });

  return {
    enforce: "pre",
    name: "formless-workspace-program-runtime",
    resolveId(id) {
      const target = programRuntimeTargetForCompiledModuleId(id);

      if (target !== undefined) {
        return resolvedVirtualModuleId(virtualModuleIds[target]);
      }

      return isProgramRuntimeVirtualModuleId(id) ? resolvedVirtualModuleId(id) : undefined;
    },
    load(id) {
      const normalizedId = id.startsWith("\0") ? id.slice(1) : id;
      const target =
        programRuntimeTargetForVirtualModuleId(normalizedId) ??
        programRuntimeTargetForCompiledModuleId(normalizedId);

      return target === undefined
        ? undefined
        : programRuntimeVirtualModuleCode(target, entrypoints[target]);
    },
  };
}

export function programRuntimeVirtualModulesPlugin(
  input: {
    env?: NodeJS.ProcessEnv;
    resolveDir?: string;
    runtime?: ResolvedWorkspaceProgramRuntime;
    workspaceRoot?: string;
  } = {},
): EsbuildPlugin {
  const runtime = input.runtime ?? resolveWorkspaceProgramRuntimeFromEnv(input.env ?? process.env);
  const entrypoints = resolveWorkspaceProgramRuntimeEntrypoints({
    composition: runtime.composition,
    workspaceRoot: input.workspaceRoot,
  });

  return {
    name: "formless-program-runtime-virtual-modules",
    setup(build) {
      build.onResolve(
        { filter: /^virtual:formless\/program-runtime\/(shared|browser|worker)$/ },
        (args) =>
          isProgramRuntimeVirtualModuleId(args.path)
            ? { namespace: virtualModuleNamespace, path: args.path }
            : undefined,
      );
      build.onResolve({ filter: /program\/compiled\/(shared|browser|worker)\.ts$/ }, (args) => {
        const target = programRuntimeTargetForCompiledModuleId(args.path);

        return target === undefined
          ? undefined
          : { namespace: virtualModuleNamespace, path: virtualModuleIds[target] };
      });
      build.onLoad({ filter: /.*/, namespace: virtualModuleNamespace }, (args) => {
        const target = programRuntimeTargetForVirtualModuleId(args.path);

        return target === undefined
          ? undefined
          : {
              contents: programRuntimeVirtualModuleCode(target, entrypoints[target]),
              loader: "js",
              resolveDir: input.resolveDir ?? process.cwd(),
            };
      });
    },
  };
}

export function programRuntimeVirtualModuleCode(
  target: ProgramRuntimeTarget,
  entrypoint: string,
): string {
  const exportName = `program${target[0]?.toUpperCase()}${target.slice(1)}Runtime`;

  return `import selectedProgramRuntime from ${JSON.stringify(entrypoint)};

if (selectedProgramRuntime.target !== ${JSON.stringify(target)}) {
  throw new Error("Configured Program ${target} runtime entrypoint must default-export a ${target} runtime definition.");
}

export const ${exportName} = selectedProgramRuntime;
`;
}

async function importProgramRuntimeDefinition<Definition extends { target: ProgramRuntimeTarget }>(
  entrypoint: string,
  target: ProgramRuntimeTarget,
): Promise<Definition> {
  const specifier = await runtimeImportSpecifier(entrypoint);
  const module = (await import(/* @vite-ignore */ specifier)) as { default?: Definition };
  const definition = module.default;

  if (definition === undefined || definition.target !== target) {
    throw new Error(
      `Configured Program ${target} runtime entrypoint must default-export a ${target} runtime definition.`,
    );
  }

  return definition;
}

async function runtimeImportSpecifier(entrypoint: string): Promise<string> {
  if (!path.isAbsolute(entrypoint)) {
    return entrypoint;
  }

  const fileStat = await stat(entrypoint, { bigint: true });
  const url = pathToFileURL(entrypoint);

  url.searchParams.set("formlessRuntimeVersion", `${fileStat.mtimeNs}-${fileStat.size}`);
  return url.href;
}

function resolveRuntimeEntrypoint(
  target: ProgramRuntimeTarget,
  entrypoint: string,
  workspaceRoot: string | undefined,
): string {
  if (entrypoint === defaultRuntimeComposition[target]) {
    return entrypoint;
  }
  if (workspaceRoot === undefined || workspaceRoot.trim() === "") {
    throw new Error(
      `Formless workspace root is required for Program runtime composition entry "${entrypoint}".`,
    );
  }

  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(root, entrypoint);
  const relative = path.relative(root, resolved);

  if (
    relative === "" ||
    relative.startsWith(`..${path.sep}`) ||
    relative === ".." ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      `Program runtime composition entry "${entrypoint}" escapes the workspace root.`,
    );
  }

  return normalizeModulePath(resolved);
}

function parseEntrypoint(target: ProgramRuntimeTarget, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `${FORMLESS_WORKSPACE_PROGRAM_RUNTIME_ENV_NAME}.composition.${target} must be a non-empty string.`,
    );
  }

  return value.trim();
}

function programRuntimeTargetForVirtualModuleId(id: string): ProgramRuntimeTarget | undefined {
  return (Object.entries(virtualModuleIds).find(([, moduleId]) => moduleId === id)?.[0] ??
    undefined) as ProgramRuntimeTarget | undefined;
}

function programRuntimeTargetForCompiledModuleId(id: string): ProgramRuntimeTarget | undefined {
  const match = id.replace(/\\/g, "/").match(/\/program\/compiled\/(shared|browser|worker)\.ts$/);

  return match?.[1] as ProgramRuntimeTarget | undefined;
}

function isProgramRuntimeVirtualModuleId(id: string): boolean {
  return programRuntimeTargetForVirtualModuleId(id) !== undefined;
}

function resolvedVirtualModuleId(id: string): string {
  return `\0${id}`;
}

function normalizeModulePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertOnlyKeys(value: Record<string, unknown>, allowedKeys: Set<string>, context: string) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }
}
