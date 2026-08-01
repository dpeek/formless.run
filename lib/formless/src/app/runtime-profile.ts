import { getSchemaAppDefinition, type SchemaAppDefinition } from "../shared/schema-apps.ts";
import type { AuthorityStorageIdentity } from "../shared/app-storage-identity.ts";
import {
  programPublicSiteRuntimeTarget,
  type PublicSiteRuntimeTarget,
} from "../shared/public-site-runtime-target.ts";
import {
  FORMLESS_RUNTIME_PROFILE_META_NAME,
  resolveRuntimeProfileKind,
  runtimeRoutePolicyForProfileKind,
  runtimeTopologyRoutes,
  stringRuntimeConfigValue,
  type RuntimeRouteAccess,
  type RuntimeProfileKind,
} from "../shared/runtime-topology.ts";

export type { RuntimeProfileKind };
export { FORMLESS_RUNTIME_PROFILE_META_NAME };

export type RuntimeShellKind = "instance" | "dev" | "publishedSite";

export type RuntimeAppDefinition = Omit<SchemaAppDefinition, "key"> & { key: string };

export type RuntimeWorldMount = {
  access?: RuntimeRouteAccess;
  app: RuntimeAppDefinition;
  generatedRoutes: boolean;
  route: `/${string}`;
  target: AuthorityStorageIdentity;
};

export type RuntimePublicSitePreviewLinkMode = "preview" | "authoring";

export type RuntimePublicSitePreview = {
  rootRoute: `/${string}`;
  routePattern: `/${string}`;
  homeRoute?: `/${string}`;
  homeSlug: string;
  linkMode: RuntimePublicSitePreviewLinkMode;
  target?: PublicSiteRuntimeTarget;
};

export type RuntimePublishedSiteRoutes = {
  homeSlug: "home";
  rootRoute: "/";
  routePattern: "/*";
  target: PublicSiteRuntimeTarget;
};

export type RuntimeProfile = {
  kind: RuntimeProfileKind;
  shell: RuntimeShellKind;
  worlds: readonly RuntimeWorldMount[];
  defaultRedirect?: `/${string}`;
  instanceShell?: boolean;
  publicSitePreview?: RuntimePublicSitePreview;
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
    case "dev":
      return createDevRuntimeProfile();
  }
}

export function createInstanceRuntimeProfile(): RuntimeProfile {
  return {
    kind: "instance",
    shell: "instance",
    worlds: [],
    instanceShell: true,
  };
}

export function createDevRuntimeProfile(): RuntimeProfile {
  return createDevWorkbenchRuntimeProfile();
}

export function createDevWorkbenchRuntimeProfile(): RuntimeProfile {
  return {
    kind: "dev",
    shell: "dev",
    worlds: [],
    instanceShell: true,
    publicSitePreview: {
      rootRoute: runtimeTopologyRoutes.publicSitePreviewRouteBase,
      routePattern: `${runtimeTopologyRoutes.publicSitePreviewRouteBase}/*`,
      homeRoute: `${runtimeTopologyRoutes.publicSitePreviewRouteBase}/home`,
      homeSlug: runtimeTopologyRoutes.publicSiteHomeSlug,
      linkMode: "preview",
      target: programPublicSiteRuntimeTarget(),
    },
  };
}

export function createPublishedSiteRuntimeProfile(): RuntimeProfile {
  const target = programPublicSiteRuntimeTarget();
  const app = getSchemaAppDefinition("site");

  return {
    kind: "publishedSite",
    shell: "publishedSite",
    worlds: [
      {
        app: runtimeAppDefinitionFromSchemaApp(app),
        generatedRoutes: false,
        route: runtimeTopologyRoutes.instanceRootRoute,
        target: target.storageIdentity,
      },
    ],
    publishedSite: {
      homeSlug: runtimeTopologyRoutes.publicSiteHomeSlug,
      rootRoute: runtimeTopologyRoutes.instanceRootRoute,
      routePattern: "/*",
      target,
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

export function findRuntimeWorldMountByRoute(
  profile: RuntimeProfile,
  pathname: string,
): RuntimeWorldMount | undefined {
  return profile.worlds
    .filter(hasGeneratedRoutes)
    .find((world) => runtimeScreenPathFromRoute(world, pathname));
}

export function hasGeneratedRoutes(world: RuntimeWorldMount): boolean {
  return world.generatedRoutes;
}

export function isRuntimePublicSiteRoute(profile: RuntimeProfile, pathname: string): boolean {
  const preview = profile.publicSitePreview;

  if (!preview || findRuntimeWorldMountByRoute(profile, pathname)) {
    return false;
  }

  return Boolean(
    pathname === preview.rootRoute ||
    (preview.rootRoute === "/"
      ? pathname.startsWith("/")
      : pathname.startsWith(`${preview.rootRoute}/`)),
  );
}

export function runtimeScreenRoute(world: RuntimeWorldMount, screenPath: string): `/${string}` {
  if (screenPath === "/") {
    return world.route;
  }

  return world.route === "/"
    ? (screenPath as `/${string}`)
    : (`${world.route}${screenPath}` as const);
}

export function runtimeScreenPathFromRoute(
  world: RuntimeWorldMount,
  pathname: string,
): string | undefined {
  if (pathname === world.route) {
    return "/";
  }

  if (world.route === "/") {
    return pathname.startsWith("/") ? pathname : undefined;
  }

  const routePrefix = `${world.route}/`;

  return pathname.startsWith(routePrefix) ? pathname.slice(world.route.length) : undefined;
}

function runtimeAppDefinitionFromSchemaApp(app: SchemaAppDefinition): RuntimeAppDefinition {
  return {
    key: app.key,
    label: app.label,
    route: app.route,
  };
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
}): string | undefined {
  return (
    stringRuntimeConfigValue(input.documentProfile) ?? stringRuntimeConfigValue(input.envProfile)
  );
}

function browserDocument(): RuntimeProfileHintDocument | undefined {
  return typeof document === "undefined" ? undefined : document;
}
