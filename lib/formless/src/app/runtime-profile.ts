import {
  FORMLESS_RUNTIME_PROFILE_META_NAME,
  parseRuntimeProfileKind,
  resolveRuntimeProfileKind,
  runtimeRoutePolicyForProfileKind,
  runtimeTopologyRoutes,
  stringRuntimeConfigValue,
  type RuntimeProfileKind,
} from "../shared/runtime-topology.ts";

export type { RuntimeProfileKind };
export { FORMLESS_RUNTIME_PROFILE_META_NAME };

export type RuntimeShellKind = RuntimeProfileKind;

export type RuntimePublishedSiteRoutes = {
  homeSlug: "home";
  rootRoute: "/";
  routePattern: "/*";
};

export type RuntimeProfile = {
  kind: RuntimeProfileKind;
  shell: RuntimeShellKind;
  defaultRedirect?: `/${string}`;
  instanceShell?: boolean;
  publishedSite?: RuntimePublishedSiteRoutes;
};

export type RuntimeRoutePolicy = {
  instanceBrowserRoutes: boolean;
  accountSessionBrowserRoutes: boolean;
};

export type RuntimeBrowserRoutePatterns = {
  authAccountGateRoutePattern?: typeof runtimeTopologyRoutes.authAccountGateRoutePattern;
  authAccountRoute?: typeof runtimeTopologyRoutes.authAccountRoute;
  authAccountSetupRoute?: typeof runtimeTopologyRoutes.authAccountSetupRoute;
  authAccountSignInRoute?: typeof runtimeTopologyRoutes.authAccountSignInRoute;
  instanceShellRoute?: typeof runtimeTopologyRoutes.instanceRootRoute;
  localSessionRoute?: typeof runtimeTopologyRoutes.localSessionRoute;
};

export type RuntimeProfileResolverInput = {
  profile?: string;
  hostname?: string;
};

type RuntimeProfileHintDocument = {
  querySelector(selector: string): { getAttribute(name: string): string | null } | null;
};

export function resolveRuntimeProfile(
  input: RuntimeProfileResolverInput = browserRuntimeProfileConfig(),
): RuntimeProfile {
  switch (resolveRuntimeProfileKind(input)) {
    case "instance":
      return createInstanceRuntimeProfile();
    case "publishedSite":
      return createPublishedSiteRuntimeProfile();
  }
}

export function createInstanceRuntimeProfile(): RuntimeProfile {
  return {
    kind: "instance",
    shell: "instance",
    instanceShell: true,
  };
}

export function createPublishedSiteRuntimeProfile(): RuntimeProfile {
  return {
    kind: "publishedSite",
    shell: "publishedSite",
    publishedSite: {
      homeSlug: runtimeTopologyRoutes.publicSiteHomeSlug,
      rootRoute: runtimeTopologyRoutes.instanceRootRoute,
      routePattern: "/*",
    },
  };
}

export function runtimeRoutePolicy(profile: RuntimeProfile): RuntimeRoutePolicy {
  const policy = runtimeRoutePolicyForProfileKind(profile.kind);

  return {
    instanceBrowserRoutes: policy.instanceBrowserRoutes,
    accountSessionBrowserRoutes: policy.accountSessionBrowserRoutes,
  };
}

export function runtimeBrowserRoutePatterns(profile: RuntimeProfile): RuntimeBrowserRoutePatterns {
  const policy = runtimeRoutePolicy(profile);
  const hasInstanceBrowserShell = profile.instanceShell && policy.instanceBrowserRoutes;

  return {
    ...(policy.accountSessionBrowserRoutes
      ? {
          authAccountGateRoutePattern: runtimeTopologyRoutes.authAccountGateRoutePattern,
          authAccountRoute: runtimeTopologyRoutes.authAccountRoute,
          authAccountSetupRoute: runtimeTopologyRoutes.authAccountSetupRoute,
          authAccountSignInRoute: runtimeTopologyRoutes.authAccountSignInRoute,
        }
      : {}),
    ...(hasInstanceBrowserShell
      ? {
          instanceShellRoute: runtimeTopologyRoutes.instanceRootRoute,
          localSessionRoute: runtimeTopologyRoutes.localSessionRoute,
        }
      : {}),
  };
}

export function normalizeRuntimeBrowserPath(path: string): string {
  return path.split("?")[0] ?? path;
}

function browserRuntimeProfileConfig(): RuntimeProfileResolverInput {
  return {
    profile: selectBrowserRuntimeProfileHint({
      documentProfile: readRuntimeProfileDocumentHint(),
      envProfile: import.meta.env.VITE_FORMLESS_RUNTIME_PROFILE,
    }),
    hostname: typeof window === "undefined" ? undefined : window.location.hostname,
  };
}

export function readRuntimeProfileDocumentHint(
  doc: RuntimeProfileHintDocument | undefined = browserDocument(),
): string | undefined {
  const value = doc
    ?.querySelector(`meta[name="${FORMLESS_RUNTIME_PROFILE_META_NAME}"]`)
    ?.getAttribute("content");

  return stringRuntimeConfigValue(value);
}

export function selectBrowserRuntimeProfileHint(input: {
  documentProfile?: string;
  envProfile?: string;
}): RuntimeProfileKind | undefined {
  return (
    parseRuntimeProfileKind(stringRuntimeConfigValue(input.documentProfile)) ??
    parseRuntimeProfileKind(stringRuntimeConfigValue(input.envProfile))
  );
}

function browserDocument(): RuntimeProfileHintDocument | undefined {
  return typeof document === "undefined" ? undefined : document;
}
