import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { astryxStylex } from "@astryxdesign/build/vite";
import { cloudflare, type PluginConfig, type WorkerConfig } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { type Plugin, type PluginOption } from "vite-plus";
import {
  FORMLESS_PROGRAM_ARTIFACT_DEFINE_NAME,
  FORMLESS_PROGRAM_ARTIFACT_PATH_ENV_NAME,
  formatFormlessProgramArtifact,
  parseFormlessProgramArtifactData,
} from "../program/artifact.ts";
import {
  FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME,
  FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID_ENV_NAME,
  FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME_ENV_NAME,
} from "../shared/instance-auth.ts";
import {
  FORMLESS_TURNSTILE_SECRET_KEY_ENV_NAME,
  FORMLESS_TURNSTILE_SITE_KEY_ENV_NAME,
} from "../shared/turnstile-config.ts";
import {
  LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_CSRF_TOKEN_ENV,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
} from "@dpeek/formless-gateway";
import {
  FORMLESS_SITE_PROJECT_ROOT_ENV_NAME,
  SITE_PUBLIC_RENDERER_BROWSER_ENTRYPOINT_MODULE_ID,
  SITE_PUBLIC_RENDERER_BROWSER_VIRTUAL_MODULE_ID,
  SITE_PUBLIC_RENDERER_WORKER_ENTRYPOINT_MODULE_ID,
  SITE_PUBLIC_RENDERER_WORKER_VIRTUAL_MODULE_ID,
} from "../shared/workspace-runtime-extensions.ts";
import {
  resolveWorkspaceSitePublicRendererEntrypointsFromEnv,
  sitePublicRendererVirtualModuleCode,
  type SitePublicRendererResolvedEntrypoints,
} from "../cli/runtime-extension-bundler.ts";
import {
  formlessWorkspaceProgramRuntimePlugin,
  resolveWorkspaceProgramRuntimeFromEnv,
} from "../cli/program-runtime-bundler.ts";

export {
  SITE_PUBLIC_RENDERER_BROWSER_ENTRYPOINT_MODULE_ID,
  SITE_PUBLIC_RENDERER_BROWSER_VIRTUAL_MODULE_ID,
  SITE_PUBLIC_RENDERER_WORKER_ENTRYPOINT_MODULE_ID,
  SITE_PUBLIC_RENDERER_WORKER_VIRTUAL_MODULE_ID,
} from "../shared/workspace-runtime-extensions.ts";

type RuntimeViteConfigInput = {
  env?: NodeJS.ProcessEnv;
  packageRoot?: string;
  workspaceRoot?: string;
};

const defaultPackageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workerConfigRelativePath = "src/worker/wrangler.jsonc";
const astryxWorkerSourcePackages = ["@astryxdesign/core", "@astryxdesign/theme-neutral"] as const;
const astryxWorkerOptimizedDependencies = ["react/jsx-runtime"] as const;

// vite-plus bundles its own Vite core, while third-party plugins type against public "vite".
const publicVitePlugins = (plugins: unknown[]): PluginOption[] => plugins as PluginOption[];

export function runtimeViteConfig(input: RuntimeViteConfigInput = {}) {
  const env = input.env ?? process.env;
  const packageRoot = input.packageRoot ?? defaultPackageRoot;
  const workspaceRoot = input.workspaceRoot ?? workspaceRootForPackageRoot(packageRoot);
  const isUnitTest = env.VITEST === "true" && env.NODE_ENV !== "production";
  const installedNodeModulesRoot = packageInstallNodeModulesRoot(packageRoot);
  const siteProjectRoot = env[FORMLESS_SITE_PROJECT_ROOT_ENV_NAME];
  const workspaceProgramArtifact = runtimeFormlessProgramArtifactFromEnv(env);
  const workspaceProgramRuntime = resolveWorkspaceProgramRuntimeFromEnv(env);
  const serverFsAllow = [
    packageRoot,
    ...(workspaceRoot === packageRoot ? [] : [workspaceRoot]),
    ...(installedNodeModulesRoot ? [installedNodeModulesRoot] : []),
    ...(siteProjectRoot ? [siteProjectRoot] : []),
  ];
  const cloudflarePluginConfig = runtimeCloudflarePluginConfig({ env, packageRoot });
  const activeAstryxPlugins = isUnitTest
    ? []
    : astryxStylex({
        dev: env.NODE_ENV !== "production",
        rootDir: workspaceRoot,
        stylexOverrides: {
          cssInjectionTarget: isSharedClientCssAsset,
        },
      });

  return {
    environments: {
      client: {
        build: {
          cssMinify: "esbuild" as const,
          manifest: "assets/formless-client-manifest.json",
          rollupOptions: {
            input: {
              app: path.resolve(packageRoot, "index.html"),
              ...(workspaceProgramRuntime.browserPublicSite
                ? { "public-site": path.resolve(packageRoot, "src/public-site-main.tsx") }
                : {}),
            },
          },
        },
      },
    },
    define: {
      [FORMLESS_PROGRAM_ARTIFACT_DEFINE_NAME]: JSON.stringify(workspaceProgramArtifact ?? ""),
    },
    plugins: [
      formlessWorkspaceProgramRuntimePlugin({
        runtime: workspaceProgramRuntime,
        workspaceRoot,
      }),
      formlessWorkspaceRuntimeExtensionsPlugin({ env }),
      ...publicVitePlugins(activeAstryxPlugins),
      ...publicVitePlugins(react()),
      ...(env.VITEST
        ? []
        : [
            ...publicVitePlugins(cloudflare(cloudflarePluginConfig)),
            astryxCloudflareWorkerSourceCompilationPlugin(),
          ]),
    ],
    resolve: {
      dedupe: ["react", "react-dom"],
      ...(isUnitTest
        ? {
            alias: {
              "@stylexjs/stylex": path.resolve(packageRoot, "src/test/stylex.ts"),
            },
          }
        : {}),
    },
    server: {
      fs: {
        allow: serverFsAllow,
      },
    },
  };
}

export function runtimeFormlessProgramArtifactFromEnv(env: NodeJS.ProcessEnv): string | undefined {
  const artifactPath = env[FORMLESS_PROGRAM_ARTIFACT_PATH_ENV_NAME]?.trim();

  if (!artifactPath) {
    return undefined;
  }

  const value = parseFormlessProgramArtifactData(
    JSON.parse(readFileSync(artifactPath, "utf8")) as unknown,
  );

  return formatFormlessProgramArtifact(value);
}

function isSharedClientCssAsset(fileName: string): boolean {
  const baseName = path.basename(fileName);

  return (
    baseName === "global.css" ||
    baseName === "target.css" ||
    ((baseName.startsWith("global-") || baseName.startsWith("target-")) &&
      baseName.endsWith(".css"))
  );
}

export function astryxCloudflareWorkerSourceCompilationPlugin(): Plugin {
  return {
    name: "formless-astryx-cloudflare-worker-source-compilation",
    configEnvironment(name) {
      if (name === "client") {
        return;
      }

      return {
        optimizeDeps: {
          exclude: [...astryxWorkerSourcePackages],
          include: [...astryxWorkerOptimizedDependencies],
        },
      };
    },
  };
}

export function packageInstallNodeModulesRoot(root: string): string | null {
  const scopeRoot = path.dirname(root);
  const nodeModulesRoot = path.dirname(scopeRoot);

  return path.basename(scopeRoot) === "@dpeek" && path.basename(nodeModulesRoot) === "node_modules"
    ? nodeModulesRoot
    : null;
}

export function workspaceRootForPackageRoot(packageRoot: string): string {
  const installedNodeModulesRoot = packageInstallNodeModulesRoot(packageRoot);

  if (installedNodeModulesRoot) {
    return path.dirname(installedNodeModulesRoot);
  }

  return path.basename(path.dirname(packageRoot)) === "lib"
    ? path.resolve(packageRoot, "../..")
    : packageRoot;
}

export function runtimeWorkerConfigPath(packageRoot = defaultPackageRoot): string {
  return path.resolve(packageRoot, workerConfigRelativePath);
}

export function runtimeCloudflarePluginConfig(input: RuntimeViteConfigInput = {}): PluginConfig {
  const env = input.env ?? process.env;
  const packageRoot = input.packageRoot ?? defaultPackageRoot;
  const wranglerPersistPath = env.FORMLESS_WRANGLER_PERSIST;
  const workerRuntimeVars = runtimeWorkerVars(env);

  return {
    configPath: runtimeWorkerConfigPath(packageRoot),
    ...(wranglerPersistPath ? { persistState: { path: wranglerPersistPath } } : {}),
    ...(Object.keys(workerRuntimeVars).length > 0
      ? {
          config: (config: WorkerConfig): Partial<WorkerConfig> => ({
            vars: {
              ...config.vars,
              ...workerRuntimeVars,
            },
          }),
        }
      : {}),
  };
}

export function runtimeWorkerVars(env: NodeJS.ProcessEnv): Record<string, string> {
  return {
    ...optionalWorkerVar("FORMLESS_ADMIN_TOKEN", env.FORMLESS_ADMIN_TOKEN),
    ...optionalWorkerVar("FORMLESS_OWNER_SESSION_SECRET", env.FORMLESS_OWNER_SESSION_SECRET),
    ...optionalWorkerVar("FORMLESS_RUNTIME_PROFILE", env.FORMLESS_RUNTIME_PROFILE),
    ...optionalWorkerVar(LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV, env[LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV]),
    ...optionalWorkerVar(
      FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME,
      env[FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME],
    ),
    ...optionalWorkerVar(
      FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID_ENV_NAME,
      env[FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID_ENV_NAME],
    ),
    ...optionalWorkerVar(
      FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME_ENV_NAME,
      env[FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME_ENV_NAME],
    ),
    ...optionalWorkerVar(
      FORMLESS_TURNSTILE_SITE_KEY_ENV_NAME,
      env[FORMLESS_TURNSTILE_SITE_KEY_ENV_NAME],
    ),
    ...optionalWorkerVar(
      FORMLESS_TURNSTILE_SECRET_KEY_ENV_NAME,
      env[FORMLESS_TURNSTILE_SECRET_KEY_ENV_NAME],
    ),
    ...optionalWorkerVar(
      WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV,
      env[WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV],
    ),
    ...optionalWorkerVar(WORKSPACE_GATEWAY_CSRF_TOKEN_ENV, env[WORKSPACE_GATEWAY_CSRF_TOKEN_ENV]),
    ...optionalWorkerVar(WORKSPACE_GATEWAY_SIDECAR_URL_ENV, env[WORKSPACE_GATEWAY_SIDECAR_URL_ENV]),
    ...optionalWorkerVar(WORKSPACE_GATEWAY_PROXY_TOKEN_ENV, env[WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]),
  };
}

function optionalWorkerVar(name: string, value: string | undefined): Record<string, string> {
  return value && value.length > 0 ? { [name]: value } : {};
}

export function formlessWorkspaceRuntimeExtensionsPlugin(
  input: {
    env?: NodeJS.ProcessEnv;
    renderer?: SitePublicRendererResolvedEntrypoints;
  } = {},
): Plugin {
  const renderer =
    input.renderer ??
    resolveWorkspaceSitePublicRendererEntrypointsFromEnv(input.env ?? process.env);

  return {
    name: "formless-workspace-runtime-extensions",
    resolveId(id) {
      if (
        id === SITE_PUBLIC_RENDERER_BROWSER_VIRTUAL_MODULE_ID ||
        id === SITE_PUBLIC_RENDERER_WORKER_VIRTUAL_MODULE_ID
      ) {
        return resolvedVirtualModuleId(id);
      }

      if (id === SITE_PUBLIC_RENDERER_BROWSER_ENTRYPOINT_MODULE_ID) {
        return renderer?.browser;
      }

      if (id === SITE_PUBLIC_RENDERER_WORKER_ENTRYPOINT_MODULE_ID) {
        return renderer?.worker;
      }

      return undefined;
    },
    load(id) {
      if (id === resolvedVirtualModuleId(SITE_PUBLIC_RENDERER_BROWSER_VIRTUAL_MODULE_ID)) {
        return sitePublicRendererVirtualModuleCode("browser", renderer !== undefined);
      }

      if (id === resolvedVirtualModuleId(SITE_PUBLIC_RENDERER_WORKER_VIRTUAL_MODULE_ID)) {
        return sitePublicRendererVirtualModuleCode("worker", renderer !== undefined);
      }

      return undefined;
    },
  };
}

function resolvedVirtualModuleId(id: string): string {
  return `\0${id}`;
}
