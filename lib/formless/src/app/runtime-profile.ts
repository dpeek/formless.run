import {
  defaultSchemaKey,
  findSchemaAppDefinition,
  getSchemaAppDefinition,
  schemaApps,
  type SchemaAppDefinition,
  type SourceSchemaKey,
} from "../shared/schema-apps.ts";
import {
  installedAppStorageIdentity,
  type AppStorageIdentity,
} from "../shared/app-storage-identity.ts";
import { findResolvedAppPackage, type ResolvedAppPackage } from "../shared/app-packages.ts";
import {
  validateAppInstallId,
  type AppInstall,
  type AppInstallRoute,
  type AppPackageResolver,
  type PackageAppKey,
} from "@dpeek/formless-installed-apps";
import {
  FORMLESS_RUNTIME_APP_INSTALL_ID_META_NAME,
  FORMLESS_RUNTIME_PACKAGE_APP_KEY_META_NAME,
  FORMLESS_RUNTIME_PROFILE_META_NAME,
  matchRuntimeRouteBase,
  resolveRuntimeProfileKind,
  runtimeRouteFromBase,
  runtimeRoutePolicyForProfileKind,
  runtimeTopologyRoutes,
  stringRuntimeConfigValue,
  type RuntimeRouteAccess,
  type RuntimeRouteRequiredRole,
  type RuntimeProfileKind,
} from "../shared/runtime-topology.ts";

export type { RuntimeProfileKind };

export type RuntimeShellKind = "instance" | "dev" | "app" | "publishedSite";

export type RuntimeAppDefinition = Omit<SchemaAppDefinition, "key"> & {
  key: string;
};

export type RuntimeWorldMount = {
  access?: RuntimeRouteAccess;
  app: RuntimeAppDefinition;
  generatedRoutes: boolean;
  requiredRole?: RuntimeRouteRequiredRole;
  route: `/${string}`;
  target?: AppStorageIdentity;
};

export type RuntimeInstalledAppRoutes = {
  appRouteBase: "/apps";
};

export type RuntimeInstalledSitePublicRoutes = {
  homeSlug: "home";
  siteRouteBase: "/sites";
};

export type RuntimeInstalledSitePublicSurface = {
  routeBase: `/${string}`;
  slug: string;
  target: AppStorageIdentity;
};

export type RuntimeAppProfileTarget = {
  installId: string;
  packageAppKey: string;
};

export type RuntimeInstalledAppRouteContext = {
  activePackageResolver?: AppPackageResolver | undefined;
  appInstalls?: readonly AppInstall[] | undefined;
};

export type RuntimePublicSitePreviewLinkMode = "preview" | "authoring";

export type RuntimePublicSitePreview = {
  packageAppKey: PackageAppKey;
  rootRoute: `/${string}`;
  routePattern: `/${string}`;
  homeRoute?: `/${string}`;
  homeSlug: string;
  linkMode: RuntimePublicSitePreviewLinkMode;
};

export type RuntimePublishedSiteRoutes = {
  homeSlug: "home";
  packageAppKey: PackageAppKey;
  rootRoute: "/";
  routePattern: "/*";
  target?: AppStorageIdentity;
};

export type RuntimeProfile = {
  kind: RuntimeProfileKind;
  shell: RuntimeShellKind;
  worlds: readonly RuntimeWorldMount[];
  appProfileTarget?: RuntimeAppProfileTarget;
  defaultRedirect?: `/${string}`;
  instanceShell?: boolean;
  installedAppRoutes?: RuntimeInstalledAppRoutes;
  installedSitePublicRoutes?: RuntimeInstalledSitePublicRoutes;
  publicSitePreview?: RuntimePublicSitePreview;
  publishedSite?: RuntimePublishedSiteRoutes;
};

export type RuntimeRoutePolicy = {
  instanceBrowserRoutes: boolean;
  installedAppBrowserRoutes: boolean;
  installedSitePublicRoutes: boolean;
  accountSessionBrowserRoutes: boolean;
  schemaKeyApiRoutes: boolean;
  schemaKeyBrowserRoutes: boolean;
};

export type RuntimeBrowserRoutePatterns = {
  authAccountGateRoutePattern?: typeof runtimeTopologyRoutes.authAccountGateRoutePattern;
  authAccountRoute?: typeof runtimeTopologyRoutes.authAccountRoute;
  authAccountSetupRoute?: typeof runtimeTopologyRoutes.authAccountSetupRoute;
  authAccountSignInRoute?: typeof runtimeTopologyRoutes.authAccountSignInRoute;
  instanceShellRoute?: typeof runtimeTopologyRoutes.instanceRootRoute;
  installedAppHomeRoutePattern?: `/${string}`;
  installedAppScreenRoutePattern?: `/${string}`;
  installedSitePublicHomeRoutePattern?: `/${string}`;
  installedSitePublicSlugRoutePattern?: `/${string}`;
  localSessionRoute?: typeof runtimeTopologyRoutes.localSessionRoute;
};

export type RuntimeProfileResolverInput = {
  appInstallId?: string | undefined;
  packageAppKey?: string | undefined;
  profile?: string | undefined;
  schemaKey?: string | undefined;
  hostname?: string | undefined;
};

export type AppRuntimeProfileOptions = {
  target?: AppStorageIdentity;
};

export type PublishedSiteRuntimeProfileOptions = {
  installId?: string | undefined;
  packageAppKey?: string | undefined;
  target?: AppStorageIdentity;
};

export {
  FORMLESS_RUNTIME_APP_INSTALL_ID_META_NAME,
  FORMLESS_RUNTIME_PACKAGE_APP_KEY_META_NAME,
  FORMLESS_RUNTIME_PROFILE_META_NAME,
};

type RuntimeProfileHintDocument = {
  querySelector(selector: string): { getAttribute(name: string): string | null } | null;
};

export type RuntimeProfileDocumentHints = {
  appInstallId?: string;
  packageAppKey?: string;
  profile?: string;
};

export function resolveRuntimeProfile(
  input: RuntimeProfileResolverInput = browserRuntimeProfileConfig(),
): RuntimeProfile {
  const profileKind = resolveRuntimeProfileKind(input);
  const schemaKey = parseSchemaKey(input.schemaKey) ?? defaultSchemaKey;

  switch (profileKind) {
    case "instance":
      return createInstanceRuntimeProfile();
    case "app":
      return (
        createInstalledAppRuntimeProfile({
          installId: input.appInstallId,
          packageAppKey: input.packageAppKey,
        }) ?? createAppRuntimeProfile(schemaKey)
      );
    case "siteAuthoring":
      return createSiteAuthoringRuntimeProfile();
    case "publishedSite":
      return createPublishedSiteRuntimeProfile({
        installId: input.appInstallId,
        packageAppKey: input.packageAppKey,
      });
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
    installedAppRoutes: {
      appRouteBase: runtimeTopologyRoutes.appRouteBase,
    },
    installedSitePublicRoutes: {
      homeSlug: runtimeTopologyRoutes.publicSiteHomeSlug,
      siteRouteBase: runtimeTopologyRoutes.siteRouteBase,
    },
  };
}

export function createDevRuntimeProfile(): RuntimeProfile {
  return createDevWorkbenchRuntimeProfile();
}

export function createDevWorkbenchRuntimeProfile(): RuntimeProfile {
  return {
    kind: "dev",
    shell: "dev",
    worlds: sourceAppWorldMountsForProfileKind("dev"),
    instanceShell: true,
    installedAppRoutes: {
      appRouteBase: runtimeTopologyRoutes.appRouteBase,
    },
    installedSitePublicRoutes: {
      homeSlug: runtimeTopologyRoutes.publicSiteHomeSlug,
      siteRouteBase: runtimeTopologyRoutes.siteRouteBase,
    },
    publicSitePreview: {
      packageAppKey: runtimeTopologyRoutes.publicSitePackageAppKey,
      rootRoute: runtimeTopologyRoutes.publicSitePreviewRouteBase,
      routePattern: `${runtimeTopologyRoutes.publicSitePreviewRouteBase}/*`,
      homeRoute: `${runtimeTopologyRoutes.publicSitePreviewRouteBase}/home`,
      homeSlug: runtimeTopologyRoutes.publicSiteHomeSlug,
      linkMode: "preview",
    },
  };
}

export function runtimeRoutePolicy(profile: RuntimeProfile): RuntimeRoutePolicy {
  const policy = runtimeRoutePolicyForProfileKind(profile.kind);

  return {
    instanceBrowserRoutes: policy.instanceBrowserRoutes,
    installedAppBrowserRoutes: policy.installedAppBrowserRoutes,
    installedSitePublicRoutes: policy.installedSitePublicRoutes,
    accountSessionBrowserRoutes: policy.accountSessionBrowserRoutes,
    schemaKeyApiRoutes: policy.schemaKeyApiRoutes,
    schemaKeyBrowserRoutes: policy.schemaKeyBrowserRoutes,
  };
}

export function runtimeBrowserRoutePatterns(profile: RuntimeProfile): RuntimeBrowserRoutePatterns {
  const policy = runtimeRoutePolicy(profile);
  const installedAppRoutes = runtimeInstalledAppRoutesForProfile(profile);
  const installedSitePublicRoutes = runtimeInstalledSitePublicRoutesForProfile(profile);
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
    ...(installedAppRoutes
      ? {
          installedAppHomeRoutePattern:
            `${installedAppRoutes.appRouteBase}/:installId` as `/${string}`,
          installedAppScreenRoutePattern:
            `${installedAppRoutes.appRouteBase}/:installId/*` as `/${string}`,
        }
      : {}),
    ...(installedSitePublicRoutes
      ? {
          installedSitePublicHomeRoutePattern:
            `${installedSitePublicRoutes.siteRouteBase}/:installId` as `/${string}`,
          installedSitePublicSlugRoutePattern:
            `${installedSitePublicRoutes.siteRouteBase}/:installId/*` as `/${string}`,
        }
      : {}),
  };
}

export function runtimeProfileNeedsInstalledAppRouteInstalls(profile: RuntimeProfile): boolean {
  const routes = runtimeBrowserRoutePatterns(profile);

  return Boolean(
    runtimeProfileNeedsAppProfilePackageResolver(profile) ||
    routes.installedAppHomeRoutePattern ||
    routes.installedSitePublicHomeRoutePattern,
  );
}

export function runtimeProfileWithActivePackageResolver(
  profile: RuntimeProfile,
  activePackageResolver: AppPackageResolver | undefined,
): RuntimeProfile {
  if (!profile.appProfileTarget || !activePackageResolver) {
    return profile;
  }

  const resolved = createInstalledAppRuntimeProfile(profile.appProfileTarget, {
    activePackageResolver,
  });

  return resolved?.worlds.length ? resolved : profile;
}

export function runtimeInstalledSitePublicHomeSlug(profile: RuntimeProfile): string | undefined {
  return runtimeInstalledSitePublicRoutesForProfile(profile)?.homeSlug;
}

export function runtimeInstalledSitePublicPath(
  profile: RuntimeProfile,
  installId: string,
  slug: string,
): `/${string}` | undefined {
  const routes = runtimeInstalledSitePublicRoutesForProfile(profile);

  if (!routes) {
    return undefined;
  }

  const pathSuffix = slug === routes.homeSlug ? "" : (`/${slug}` as const);

  return runtimeRouteFromBase(routes.siteRouteBase, installId, pathSuffix);
}

export function normalizeRuntimeBrowserPath(path: string): string {
  return path.split("?")[0] ?? path;
}

export function createAppRuntimeProfile(
  schemaKey: SourceSchemaKey = defaultSchemaKey,
  options: AppRuntimeProfileOptions = {},
): RuntimeProfile {
  const app = getSchemaAppDefinition(schemaKey);

  return {
    kind: "app",
    shell: "app",
    worlds: [
      {
        app: runtimeAppDefinitionFromSchemaApp(app),
        generatedRoutes: true,
        route: "/",
        ...(options.target ? { target: options.target } : {}),
      },
    ],
  };
}

export function createInstalledAppRuntimeProfile(
  input: {
    installId?: string | undefined;
    packageAppKey?: string | undefined;
  },
  options: { activePackageResolver?: AppPackageResolver | undefined } = {},
): RuntimeProfile | undefined {
  if (!input.installId || !input.packageAppKey) {
    return undefined;
  }

  const installIdResult = validateAppInstallId(input.installId);

  if (!installIdResult.ok) {
    return undefined;
  }

  const appProfileTarget = {
    installId: installIdResult.installId,
    packageAppKey: input.packageAppKey,
  };
  const appPackage = findResolvedAppPackage(input.packageAppKey, options.activePackageResolver);

  if (!appPackage) {
    return createPendingInstalledAppRuntimeProfile(appProfileTarget);
  }

  const target = installedAppStorageIdentity(
    {
      installId: installIdResult.installId,
      packageAppKey: input.packageAppKey,
    },
    options.activePackageResolver,
  );

  if (!target) {
    return createPendingInstalledAppRuntimeProfile(appProfileTarget);
  }

  const route = runtimeTopologyRoutes.instanceRootRoute;
  const app = runtimeAppDefinitionFromPackage(appPackage, {
    route,
  });

  return {
    kind: "app",
    shell: "app",
    appProfileTarget,
    worlds: [
      {
        app,
        generatedRoutes: true,
        route,
        target,
      },
    ],
  };
}

function createPendingInstalledAppRuntimeProfile(
  appProfileTarget: RuntimeAppProfileTarget,
): RuntimeProfile {
  return {
    kind: "app",
    shell: "app",
    appProfileTarget,
    worlds: [],
  };
}

function runtimeProfileNeedsAppProfilePackageResolver(profile: RuntimeProfile): boolean {
  return Boolean(profile.appProfileTarget && profile.worlds.length === 0);
}

export function createSiteAuthoringRuntimeProfile(): RuntimeProfile {
  return {
    kind: "siteAuthoring",
    shell: "app",
    worlds: [
      {
        app: runtimeAppDefinitionFromSchemaApp(getSchemaAppDefinition("site")),
        generatedRoutes: true,
        route: runtimeTopologyRoutes.siteAdminRoute,
      },
    ],
    publicSitePreview: {
      packageAppKey: runtimeTopologyRoutes.publicSitePackageAppKey,
      rootRoute: runtimeTopologyRoutes.instanceRootRoute,
      routePattern: "/*",
      homeSlug: runtimeTopologyRoutes.publicSiteHomeSlug,
      linkMode: "authoring",
    },
  };
}

export function createPublishedSiteRuntimeProfile(
  options: PublishedSiteRuntimeProfileOptions = {},
): RuntimeProfile {
  const target =
    options.target ??
    (options.installId && options.packageAppKey
      ? installedAppStorageIdentity({
          installId: options.installId,
          packageAppKey: options.packageAppKey,
        })
      : undefined);
  const packageAppKey =
    target?.packageAppKey ?? options.packageAppKey ?? runtimeTopologyRoutes.publicSitePackageAppKey;
  const app =
    (target
      ? findSchemaAppDefinition(target.sourceSchemaKey)
      : findSchemaAppDefinition(packageAppKey)) ?? getSchemaAppDefinition("site");

  return {
    kind: "publishedSite",
    shell: "publishedSite",
    worlds: [
      {
        app: runtimeAppDefinitionFromSchemaApp(app),
        generatedRoutes: false,
        route: runtimeTopologyRoutes.instanceRootRoute,
        ...(target ? { target } : {}),
      },
    ],
    publishedSite: {
      homeSlug: runtimeTopologyRoutes.publicSiteHomeSlug,
      packageAppKey,
      rootRoute: runtimeTopologyRoutes.instanceRootRoute,
      routePattern: "/*",
      ...(target ? { target } : {}),
    },
  };
}

export function findRuntimeWorldMountByRoute(
  profile: RuntimeProfile,
  pathname: string,
  context: RuntimeInstalledAppRouteContext = {},
): RuntimeWorldMount | undefined {
  return (
    profile.worlds
      .filter(hasGeneratedRoutes)
      .find((world) => runtimeScreenPathFromRoute(world, pathname)) ??
    installedAppWorldMountFromRoute(profile, pathname, context)
  );
}

export function hasGeneratedRoutes(world: RuntimeWorldMount): boolean {
  return world.generatedRoutes;
}

export function isRuntimePublicSiteRoute(
  profile: RuntimeProfile,
  pathname: string,
  context: RuntimeInstalledAppRouteContext = {},
): boolean {
  if (installedSitePublicSurfaceFromRoute(profile, pathname, context)) {
    return true;
  }

  const preview = profile.publicSitePreview;

  if (!preview || findRuntimeWorldMountByRoute(profile, pathname, context)) {
    return false;
  }

  return Boolean(
    pathname === preview.rootRoute ||
    (preview.rootRoute === "/"
      ? pathname.startsWith("/")
      : pathname.startsWith(`${preview.rootRoute}/`)),
  );
}

export function installedSitePublicSurfaceFromRoute(
  profile: RuntimeProfile,
  pathname: string,
  context: RuntimeInstalledAppRouteContext = {},
): RuntimeInstalledSitePublicSurface | undefined {
  const routes = runtimeInstalledSitePublicRoutesForProfile(profile);

  if (!routes) {
    return undefined;
  }

  const install = (context.appInstalls ?? []).find((candidate) =>
    installedSitePublicRouteMatch(candidate, pathname),
  );

  if (!install) {
    return undefined;
  }

  const target = installedAppStorageIdentity(
    {
      installId: install.installId,
      packageAppKey: install.packageAppKey,
    },
    context.activePackageResolver,
  );

  if (!target) {
    return undefined;
  }

  const routeMatch = installedSitePublicRouteMatch(install, pathname);

  if (!routeMatch) {
    return undefined;
  }

  return {
    routeBase: routeMatch.routeBase,
    slug: routeMatch.slug || routes.homeSlug,
    target,
  };
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

export function installedAppWorldMountFromInstallId(
  profile: RuntimeProfile,
  installId: string,
  context: RuntimeInstalledAppRouteContext = {},
): RuntimeWorldMount | undefined {
  const install = findInstalledAppByInstallId(context.appInstalls, installId);

  return install ? installedAppWorldMountFromInstall(profile, install, context) : undefined;
}

export function installedAppWorldMountFromInstall(
  profile: RuntimeProfile,
  install: AppInstall,
  context: RuntimeInstalledAppRouteContext = {},
): RuntimeWorldMount | undefined {
  const routes = runtimeInstalledAppRoutesForProfile(profile);

  if (!routes) {
    return undefined;
  }

  const appPackage = findResolvedAppPackage(install.packageAppKey, context.activePackageResolver);
  const target = installedAppStorageIdentity(
    {
      installId: install.installId,
      packageAppKey: install.packageAppKey,
    },
    context.activePackageResolver,
  );

  if (!appPackage || !target) {
    return undefined;
  }

  const fallbackRoute = runtimeRouteFromBase(routes.appRouteBase, target.installId);
  const adminRoute = enabledInstallRoute(install, "admin");
  const route = adminRoute?.path ?? (install.routes ? undefined : fallbackRoute);
  const app = runtimeAppDefinitionFromPackage(appPackage, {
    route: route ?? fallbackRoute,
  });

  if (!route) {
    return undefined;
  }

  return {
    access: adminRoute?.access ?? "owner",
    app,
    generatedRoutes: true,
    ...(adminRoute?.requiredRole === undefined ? {} : { requiredRole: adminRoute.requiredRole }),
    route,
    target,
  };
}

function installedAppWorldMountFromRoute(
  profile: RuntimeProfile,
  pathname: string,
  context: RuntimeInstalledAppRouteContext = {},
): RuntimeWorldMount | undefined {
  const routes = runtimeInstalledAppRoutesForProfile(profile);

  if (!routes) {
    return undefined;
  }

  for (const install of context.appInstalls ?? []) {
    const world = installedAppWorldMountFromInstall(profile, install, context);

    if (!world) {
      continue;
    }

    const routeMatch = matchInstalledRoutePath(pathname, world.route);

    if (!routeMatch) {
      continue;
    }

    return world;
  }

  return undefined;
}

export function isInstalledAppRoutePath(profile: RuntimeProfile, pathname: string): boolean {
  const routes = runtimeInstalledAppRoutesForProfile(profile);

  return Boolean(routes && matchRuntimeRouteBase(pathname, routes.appRouteBase));
}

export function isInstalledSitePublicRoutePath(profile: RuntimeProfile, pathname: string): boolean {
  const routes = runtimeInstalledSitePublicRoutesForProfile(profile);

  return Boolean(routes && matchRuntimeRouteBase(pathname, routes.siteRouteBase));
}

function sourceAppWorldMountsForProfileKind(profileKind: RuntimeProfileKind): RuntimeWorldMount[] {
  const policy = runtimeRoutePolicyForProfileKind(profileKind);

  if (!policy.schemaKeyBrowserRoutes) {
    return [];
  }

  return schemaApps.map((app) => ({
    app: runtimeAppDefinitionFromSchemaApp(app),
    generatedRoutes: true,
    route: app.route,
  }));
}

function runtimeAppDefinitionFromPackage(
  appPackage: ResolvedAppPackage,
  routes: { route: `/${string}` },
): RuntimeAppDefinition {
  const bundledApp = findSchemaAppDefinition(appPackage.sourceSchemaKey);

  return (
    (bundledApp ? runtimeAppDefinitionFromSchemaApp(bundledApp) : undefined) ?? {
      key: appPackage.sourceSchemaKey,
      label: appPackage.label,
      route: routes.route,
    }
  );
}

function runtimeAppDefinitionFromSchemaApp(app: SchemaAppDefinition): RuntimeAppDefinition {
  return {
    key: app.key,
    label: app.label,
    route: app.route,
  };
}

function runtimeInstalledAppRoutesForProfile(
  profile: RuntimeProfile,
): RuntimeInstalledAppRoutes | undefined {
  return runtimeRoutePolicy(profile).installedAppBrowserRoutes
    ? profile.installedAppRoutes
    : undefined;
}

function runtimeInstalledSitePublicRoutesForProfile(
  profile: RuntimeProfile,
): RuntimeInstalledSitePublicRoutes | undefined {
  return runtimeRoutePolicy(profile).installedSitePublicRoutes
    ? profile.installedSitePublicRoutes
    : undefined;
}

function findInstalledAppByInstallId(
  appInstalls: readonly AppInstall[] | undefined,
  installId: string,
): AppInstall | undefined {
  return appInstalls?.find((install) => install.installId === installId);
}

function enabledInstallRoute(
  install: AppInstall,
  routeKind: AppInstallRoute["routeKind"],
): AppInstallRoute | undefined {
  return install.routes?.find((route) => route.enabled && route.routeKind === routeKind);
}

function matchInstalledRoutePath(
  pathname: string,
  route: `/${string}`,
): { pathSuffix: string } | undefined {
  if (pathname === route) {
    return { pathSuffix: "" };
  }

  const routePrefix = `${route}/`;

  return pathname.startsWith(routePrefix)
    ? { pathSuffix: pathname.slice(route.length) }
    : undefined;
}

function installedSitePublicRouteMatch(
  install: AppInstall,
  pathname: string,
): { routeBase: `/${string}`; slug: string } | undefined {
  const route = enabledInstallRoute(install, "publicSite");

  if (route) {
    return publicSiteRouteMatch(pathname, route.path, route.prefix);
  }

  if (install.routes || !install.publicRoute) {
    return undefined;
  }

  return publicSiteRouteMatch(pathname, install.publicRoute, install.publicRoutePrefix);
}

function publicSiteRouteMatch(
  pathname: string,
  routeBase: `/${string}`,
  prefix?: `/${string}/`,
): { routeBase: `/${string}`; slug: string } | undefined {
  if (pathname === routeBase) {
    return { routeBase, slug: "" };
  }

  const routePrefix = prefix ?? (`${routeBase.replace(/\/+$/, "")}/` as `/${string}/`);

  return pathname.startsWith(routePrefix)
    ? { routeBase, slug: pathname.slice(routePrefix.length) }
    : undefined;
}

function browserRuntimeProfileConfig(): RuntimeProfileResolverInput {
  const documentHints = readRuntimeProfileDocumentHints();

  return {
    profile: selectBrowserRuntimeProfileHint({
      documentProfile: documentHints.profile,
      envProfile: import.meta.env.VITE_FORMLESS_RUNTIME_PROFILE,
    }),
    appInstallId: documentHints.appInstallId,
    packageAppKey: documentHints.packageAppKey,
    schemaKey: stringRuntimeConfigValue(import.meta.env.VITE_FORMLESS_SCHEMA_KEY),
    hostname: typeof window === "undefined" ? undefined : window.location.hostname,
  };
}

export function readRuntimeProfileDocumentHint(
  doc: RuntimeProfileHintDocument | undefined = browserDocument(),
): string | undefined {
  return readRuntimeProfileDocumentHints(doc).profile;
}

export function readRuntimeProfileDocumentHints(
  doc: RuntimeProfileHintDocument | undefined = browserDocument(),
): RuntimeProfileDocumentHints {
  return {
    profile: readRuntimeProfileMetaContent(doc, FORMLESS_RUNTIME_PROFILE_META_NAME),
    appInstallId: readRuntimeProfileMetaContent(doc, FORMLESS_RUNTIME_APP_INSTALL_ID_META_NAME),
    packageAppKey: readRuntimeProfileMetaContent(doc, FORMLESS_RUNTIME_PACKAGE_APP_KEY_META_NAME),
  };
}

export function selectBrowserRuntimeProfileHint(input: {
  documentProfile?: string | undefined;
  envProfile?: string | undefined;
}): string | undefined {
  return (
    stringRuntimeConfigValue(input.documentProfile) ?? stringRuntimeConfigValue(input.envProfile)
  );
}

function parseSchemaKey(value: string | undefined): SourceSchemaKey | undefined {
  return value ? findSchemaAppDefinition(value)?.key : undefined;
}

function browserDocument(): RuntimeProfileHintDocument | undefined {
  return typeof document === "undefined" ? undefined : document;
}

function readRuntimeProfileMetaContent(
  doc: RuntimeProfileHintDocument | undefined,
  name: string,
): string | undefined {
  const value = doc?.querySelector(`meta[name="${name}"]`)?.getAttribute("content");

  return stringRuntimeConfigValue(value);
}
