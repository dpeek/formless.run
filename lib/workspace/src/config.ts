import {
  DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT,
  DEFAULT_INSTANCE_WORKSPACE_MEDIA_ROOT,
  DEFAULT_INSTANCE_WORKSPACE_SECRET_STATE_ROOT,
  DEFAULT_INSTANCE_WORKSPACE_STATE_ROOT,
  FORMLESS_CONFIG_FILE,
  FORMLESS_CONFIG_KIND,
  FORMLESS_CONFIG_VERSION,
  INSTANCE_WORKSPACE_SITE_PUBLIC_RENDERER_EXTENSION,
} from "./types.ts";
import type {
  FormlessConfig,
  InstanceWorkspaceRuntimeExtensions,
  ResolvedFormlessConfig,
  WorkspacePackageLink,
} from "./types.ts";

const resourceSlugPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const targetAliasPattern = /^[a-z][a-z0-9]*(?:(?:[.-])[a-z0-9]+)*$/;
const urlLikePathPattern = /^[a-z][a-z0-9+.-]*:/i;

export function defineConfig<const Config extends FormlessConfig>(config: Config): Config {
  return config;
}

export function resolveFormlessConfig(config: FormlessConfig): ResolvedFormlessConfig {
  return {
    version: FORMLESS_CONFIG_VERSION,
    kind: FORMLESS_CONFIG_KIND,
    name: parseConfigName(config.name),
    state: {
      root: parseWorkspaceRelativePath(
        `${FORMLESS_CONFIG_FILE} state.root`,
        config.state?.root ?? DEFAULT_INSTANCE_WORKSPACE_STATE_ROOT,
      ),
    },
    media: {
      root: parseWorkspaceRelativePath(
        `${FORMLESS_CONFIG_FILE} media.root`,
        config.media?.root ?? DEFAULT_INSTANCE_WORKSPACE_MEDIA_ROOT,
      ),
    },
    local: {
      stateRoot: parseWorkspaceRelativePath(
        `${FORMLESS_CONFIG_FILE} local.stateRoot`,
        config.local?.stateRoot ?? DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT,
      ),
      secretStateRoot: parseWorkspaceRelativePath(
        `${FORMLESS_CONFIG_FILE} local.secretStateRoot`,
        config.local?.secretStateRoot ?? DEFAULT_INSTANCE_WORKSPACE_SECRET_STATE_ROOT,
      ),
    },
    packages: {
      links: resolvePackageLinks(config.packages?.links ?? []),
    },
    runtime: {
      extensions: resolveRuntimeExtensions(config.runtime?.extensions),
    },
  };
}

function parseConfigName(value: string): string {
  return parseInstanceWorkspaceResourceSlug(`${FORMLESS_CONFIG_FILE} name`, value);
}

export function parseInstanceWorkspaceTargetAlias(context: string, value: unknown): string {
  const alias = parseRequiredString(context, value);

  if (!targetAliasPattern.test(alias)) {
    throw new Error(
      `${context} must start with a lowercase letter and use lowercase letters, numbers, dots, and single hyphens.`,
    );
  }

  return alias;
}

export function normalizeInstanceWorkspaceTargetUrl(value: string): string {
  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error();
    }

    return url.origin;
  } catch {
    throw new Error(`Formless instance workspace target URL is invalid: ${value}`);
  }
}

export function parseInstanceWorkspaceResourceSlug(context: string, value: unknown): string {
  const name = parseRequiredString(context, value);

  if (!resourceSlugPattern.test(name)) {
    throw new Error(
      `${context} must start with a lowercase letter and use lowercase letters, numbers, and single hyphens.`,
    );
  }

  return name;
}

export function parseInstanceWorkspaceRelativePath(context: string, value: unknown): string {
  const filePath = parseRequiredString(context, value);
  const parts = filePath.split("/");

  if (
    filePath.startsWith("/") ||
    filePath.includes("\\") ||
    parts.some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`${context} must be a relative workspace path.`);
  }

  return filePath;
}

function parseWorkspaceRelativePath(context: string, value: string): string {
  return parseInstanceWorkspaceRelativePath(context, value);
}

function resolvePackageLinks(links: readonly WorkspacePackageLink[]): WorkspacePackageLink[] {
  const resolved = links.map((link, index) => ({
    manifest: parsePackageManifestLinkPath(
      `${FORMLESS_CONFIG_FILE} packages.links[${index}].manifest`,
      link.manifest,
    ),
  }));
  const seen = new Set<string>();

  for (const link of resolved) {
    if (seen.has(link.manifest)) {
      throw new Error(
        `${FORMLESS_CONFIG_FILE} packages.links has duplicate manifest "${link.manifest}".`,
      );
    }

    seen.add(link.manifest);
  }

  return resolved;
}

export function parseWorkspacePackageManifestLinkPath(context: string, value: unknown): string {
  const filePath = parseRequiredString(context, value);
  const parts = filePath.split("/");

  if (
    filePath.startsWith("/") ||
    filePath.startsWith("~") ||
    filePath.includes("\\") ||
    urlLikePathPattern.test(filePath) ||
    parts.some((part) => part === "" || part === ".") ||
    parts.at(-1) !== "formless.app.json" ||
    hasNonLeadingParentSegment(parts)
  ) {
    throw new Error(`${context} must be a local relative formless.app.json path.`);
  }

  return filePath;
}

function parsePackageManifestLinkPath(context: string, value: string): string {
  return parseWorkspacePackageManifestLinkPath(context, value);
}

function resolveRuntimeExtensions(
  extensions: InstanceWorkspaceRuntimeExtensions | undefined,
): InstanceWorkspaceRuntimeExtensions {
  const sitePublicRenderer = extensions?.[INSTANCE_WORKSPACE_SITE_PUBLIC_RENDERER_EXTENSION];

  if (sitePublicRenderer === undefined) {
    return {};
  }

  const context = `${FORMLESS_CONFIG_FILE} runtime.extensions["${INSTANCE_WORKSPACE_SITE_PUBLIC_RENDERER_EXTENSION}"]`;

  return {
    [INSTANCE_WORKSPACE_SITE_PUBLIC_RENDERER_EXTENSION]: {
      browser: parseRuntimeExtensionEntrypointPath(
        `${context}.browser`,
        sitePublicRenderer.browser,
      ),
      worker: parseRuntimeExtensionEntrypointPath(`${context}.worker`, sitePublicRenderer.worker),
    },
  };
}

function parseRuntimeExtensionEntrypointPath(context: string, value: string): string {
  const filePath = parseRequiredString(context, value);
  const parts = filePath.split("/");

  if (
    filePath.startsWith("/") ||
    filePath.startsWith("~") ||
    filePath.includes("\\") ||
    urlLikePathPattern.test(filePath) ||
    parts.some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`${context} must be a local workspace-relative path.`);
  }

  return filePath;
}

function hasNonLeadingParentSegment(parts: string[]) {
  let seenPackagePathSegment = false;

  for (const part of parts) {
    if (part === "..") {
      if (seenPackagePathSegment) {
        return true;
      }
    } else {
      seenPackagePathSegment = true;
    }
  }

  return false;
}

function parseRequiredString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
}
