import type {
  InstanceWorkspaceRuntimeExtensions,
  ResolvedFormlessConfig,
} from "@dpeek/formless-workspace";

export const FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME =
  "FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS";
export const FORMLESS_SITE_PROJECT_ROOT_ENV_NAME = "FORMLESS_SITE_PROJECT_ROOT";
export const SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY = "site.publicRenderer";
export const SITE_PUBLIC_RENDERER_BROWSER_VIRTUAL_MODULE_ID =
  "virtual:formless/site-public-renderer/browser";
export const SITE_PUBLIC_RENDERER_WORKER_VIRTUAL_MODULE_ID =
  "virtual:formless/site-public-renderer/worker";
export const SITE_PUBLIC_RENDERER_BROWSER_ENTRYPOINT_MODULE_ID =
  "virtual:formless/site-public-renderer/browser-entry";
export const SITE_PUBLIC_RENDERER_WORKER_ENTRYPOINT_MODULE_ID =
  "virtual:formless/site-public-renderer/worker-entry";

export function workspaceRuntimeExtensionKeys(
  config: Pick<ResolvedFormlessConfig, "runtime">,
): string[] {
  const extensions = config.runtime.extensions;

  if (extensions?.[SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY] === undefined) {
    return [];
  }

  return [SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY];
}

export function runtimeWorkspaceExtensionsEnvValue(
  config: Pick<ResolvedFormlessConfig, "runtime">,
): string | undefined {
  const extensions = config.runtime.extensions;

  if (extensions?.[SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY] === undefined) {
    return undefined;
  }

  const runtimeExtensions: InstanceWorkspaceRuntimeExtensions = {
    [SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY]:
      extensions[SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY],
  };

  return JSON.stringify(runtimeExtensions);
}
