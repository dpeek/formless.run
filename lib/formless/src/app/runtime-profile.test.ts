import { describe, expect, it } from "vite-plus/test";
import {
  createAppRuntimeProfile,
  createDevWorkbenchRuntimeProfile,
  createDevRuntimeProfile,
  createInstalledAppRuntimeProfile,
  createInstanceRuntimeProfile,
  createPublishedSiteRuntimeProfile,
  createSiteAuthoringRuntimeProfile,
  FORMLESS_RUNTIME_APP_INSTALL_ID_META_NAME,
  FORMLESS_RUNTIME_PACKAGE_APP_KEY_META_NAME,
  FORMLESS_RUNTIME_PROFILE_META_NAME,
  findRuntimeWorldMountByRoute,
  installedAppWorldMountFromInstallId,
  installedSitePublicSurfaceFromRoute,
  isRuntimePublicSiteRoute,
  runtimeBrowserRoutePatterns,
  runtimeInstalledSitePublicPath,
  runtimeProfileNeedsInstalledAppRouteInstalls,
  runtimeProfileWithActivePackageResolver,
  readRuntimeProfileDocumentHint,
  readRuntimeProfileDocumentHints,
  resolveRuntimeProfile,
  runtimeRoutePolicy,
  runtimeScreenPathFromRoute,
  runtimeScreenRoute,
  selectBrowserRuntimeProfileHint,
} from "./runtime-profile.ts";
import type {
  AppInstall,
  AppPackageResolver,
  InstallableAppPackage,
} from "@dpeek/formless-installed-apps";
import type { SchemaKey } from "../shared/schema-apps.ts";
import { bundledSourceSchemaHashFixtures } from "../shared/upgrade-migrations.ts";

function appInstallFixture({
  installId,
  label,
  packageAppKey = "site",
}: {
  installId: string;
  label: string;
  packageAppKey?: SchemaKey;
}): AppInstall {
  return {
    adminRoute: `/apps/${installId}`,
    createdAt: "2026-05-25T00:00:00.000Z",
    installId,
    label,
    packageAppKey,
    packageRevision: 1,
    registrationPolicy: "closed",
    sourceSchemaHash: bundledSourceSchemaHashFixtures[packageAppKey],
    status: "installed",
    updatedAt: "2026-05-25T00:00:00.000Z",
    ...(packageAppKey === "site"
      ? {
          publicRoute: `/sites/${installId}` as const,
          publicRoutePrefix: `/sites/${installId}/` as const,
        }
      : {}),
  };
}

function privateSitePackage(): InstallableAppPackage {
  return {
    adminRouteBase: "/apps",
    defaultInstallId: "private-site",
    description: "Workspace-linked public Site package.",
    label: "Private Site",
    packageAppKey: "private-site",
    packageRevision: 7,
    publicRouteBase: "/sites",
    sourceOrigin: "workspace",
    sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
    sourceSchemaKey: "private-site",
    sourceSchemaLocation: {
      kind: "workspace",
      key: "private-site",
      path: "source/schema.json",
    },
    supportsMultipleInstalls: false,
  };
}

function appInstallFromPackage({
  appPackage,
  installId,
  label,
}: {
  appPackage: InstallableAppPackage;
  installId: string;
  label: string;
}): AppInstall {
  return {
    adminRoute: `/apps/${installId}`,
    createdAt: "2026-05-25T00:00:00.000Z",
    installId,
    label,
    packageAppKey: appPackage.packageAppKey,
    packageRevision: appPackage.packageRevision,
    registrationPolicy: "closed",
    sourceSchemaHash: appPackage.sourceSchemaHash,
    status: "installed",
    updatedAt: "2026-05-25T00:00:00.000Z",
  };
}

function appPackageResolver(packages: readonly InstallableAppPackage[]): AppPackageResolver {
  return {
    findPackage(packageAppKey) {
      return packages.find((appPackage) => appPackage.packageAppKey === packageAppKey);
    },
    listPackages() {
      return [...packages];
    },
  };
}

describe("runtime profile resolver", () => {
  it("resolves the product instance profile without schema-keyed app mounts", () => {
    const profile = createInstanceRuntimeProfile();

    expect(profile.kind).toBe("instance");
    expect(profile.shell).toBe("instance");
    expect(profile.defaultRedirect).toBeUndefined();
    expect(profile.instanceShell).toBe(true);
    expect(profile.installedAppRoutes).toEqual({
      appRouteBase: "/apps",
    });
    expect(profile.installedSitePublicRoutes).toEqual({
      homeSlug: "home",
      siteRouteBase: "/sites",
    });
    expect(profile.worlds).toEqual([]);
    expect(findRuntimeWorldMountByRoute(profile, "/tasks")).toBeUndefined();
    expect(findRuntimeWorldMountByRoute(profile, "/crm")).toBeUndefined();
    expect(findRuntimeWorldMountByRoute(profile, "/site")).toBeUndefined();
    expect(findRuntimeWorldMountByRoute(profile, "/tasks/schema")).toBeUndefined();
    expect(runtimeRoutePolicy(profile)).toEqual({
      instanceBrowserRoutes: true,
      installedAppBrowserRoutes: true,
      installedSitePublicRoutes: true,
      accountSessionBrowserRoutes: true,
      schemaKeyApiRoutes: false,
      schemaKeyBrowserRoutes: false,
    });
    expect(runtimeBrowserRoutePatterns(profile)).toEqual({
      authAccountGateRoutePattern: "/formless/auth/*",
      authAccountRoute: "/formless/auth",
      authAccountSetupRoute: "/formless/auth/setup",
      authAccountSignInRoute: "/formless/auth/sign-in",
      instanceAccessRoute: "/access",
      instanceShellRoute: "/",
      installedAppHomeRoutePattern: "/apps/:installId",
      installedAppScreenRoutePattern: "/apps/:installId/*",
      installedSitePublicHomeRoutePattern: "/sites/:installId",
      installedSitePublicSlugRoutePattern: "/sites/:installId/*",
      localSessionRoute: "/local-session",
    });
  });

  it("resolves the dev workbench profile with schema-keyed app mounts", () => {
    const profile = createDevWorkbenchRuntimeProfile();

    expect(profile.kind).toBe("dev");
    expect(profile.shell).toBe("dev");
    expect(profile.defaultRedirect).toBeUndefined();
    expect(profile.instanceShell).toBe(true);
    expect(profile.installedAppRoutes).toEqual({
      appRouteBase: "/apps",
    });
    expect(profile.installedSitePublicRoutes).toEqual({
      homeSlug: "home",
      siteRouteBase: "/sites",
    });
    expect(profile.worlds.map((world) => world.app.key)).toEqual(["tasks", "site", "crm"]);
    expect(profile.worlds.map((world) => world.generatedRoutes)).toEqual([true, true, true]);
    expect(profile.worlds.map((world) => world.route)).toEqual(["/tasks", "/site", "/crm"]);
    expect(profile.publicSitePreview?.homeRoute).toBe("/pages/home");
    expect(findRuntimeWorldMountByRoute(profile, "/rates")).toBeUndefined();
    expect(findRuntimeWorldMountByRoute(profile, "/rates/schema")).toBeUndefined();
    expect(runtimeScreenPathFromRoute(profile.worlds[0]!, "/tasks/schema")).toBe("/schema");
    expect(runtimeRoutePolicy(profile)).toEqual({
      instanceBrowserRoutes: true,
      installedAppBrowserRoutes: true,
      installedSitePublicRoutes: true,
      accountSessionBrowserRoutes: true,
      schemaKeyApiRoutes: true,
      schemaKeyBrowserRoutes: true,
    });
    expect(runtimeBrowserRoutePatterns(profile)).toEqual({
      authAccountGateRoutePattern: "/formless/auth/*",
      authAccountRoute: "/formless/auth",
      authAccountSetupRoute: "/formless/auth/setup",
      authAccountSignInRoute: "/formless/auth/sign-in",
      instanceAccessRoute: "/access",
      instanceShellRoute: "/",
      installedAppHomeRoutePattern: "/apps/:installId",
      installedAppScreenRoutePattern: "/apps/:installId/*",
      installedSitePublicHomeRoutePattern: "/sites/:installId",
      installedSitePublicSlugRoutePattern: "/sites/:installId/*",
      localSessionRoute: "/local-session",
    });
    expect(runtimeProfileNeedsInstalledAppRouteInstalls(profile)).toBe(true);
  });

  it("resolves installed admin route mounts from install records", () => {
    const profile = createDevRuntimeProfile();
    const appInstalls = [
      appInstallFixture({ installId: "personal", label: "Personal Site" }),
      appInstallFixture({
        installId: "task-workspace",
        label: "Task Workspace",
        packageAppKey: "tasks",
      }),
      appInstallFixture({
        installId: "crm",
        label: "CRM",
        packageAppKey: "crm",
      }),
    ];
    const world = installedAppWorldMountFromInstallId(profile, "personal", { appInstalls });
    const tasksWorld = installedAppWorldMountFromInstallId(profile, "task-workspace", {
      appInstalls,
    });
    const crmWorld = installedAppWorldMountFromInstallId(profile, "crm", { appInstalls });

    if (!world?.target || world.target.kind !== "appInstall") {
      throw new Error("Missing installed Site world.");
    }

    if (!tasksWorld?.target || tasksWorld.target.kind !== "appInstall") {
      throw new Error("Missing installed Tasks world.");
    }

    if (!crmWorld?.target || crmWorld.target.kind !== "appInstall") {
      throw new Error("Missing installed CRM world.");
    }

    expect(world.app.key).toBe("site");
    expect(world.route).toBe("/apps/personal");
    expect(world.access).toBe("owner");
    expect(world.target.installId).toBe("personal");
    expect(world.target.apiRoutePrefix).toBe("/api/app-installs/site/personal");
    expect(tasksWorld.app.key).toBe("tasks");
    expect(tasksWorld.route).toBe("/apps/task-workspace");
    expect(tasksWorld.target.installId).toBe("task-workspace");
    expect(tasksWorld.target.apiRoutePrefix).toBe("/api/app-installs/tasks/task-workspace");
    expect(crmWorld.app.key).toBe("crm");
    expect(crmWorld.route).toBe("/apps/crm");
    expect(crmWorld.target.installId).toBe("crm");
    expect(crmWorld.target.apiRoutePrefix).toBe("/api/app-installs/crm/crm");
    expect(runtimeScreenRoute(world, "/")).toBe("/apps/personal");
    expect(runtimeScreenRoute(world, "/settings")).toBe("/apps/personal/settings");
    expect(runtimeScreenRoute(crmWorld, "/audiences")).toBe("/apps/crm/audiences");
    expect(runtimeScreenPathFromRoute(world, "/apps/personal")).toBe("/");
    expect(runtimeScreenPathFromRoute(world, "/apps/personal/settings")).toBe("/settings");
    expect(runtimeScreenPathFromRoute(world, "/apps/personal/schema")).toBe("/schema");
    expect(runtimeScreenPathFromRoute(crmWorld, "/apps/crm/audiences")).toBe("/audiences");
    expect(
      findRuntimeWorldMountByRoute(profile, "/apps/personal/settings", { appInstalls })?.target,
    ).toEqual(world.target);
    expect(
      findRuntimeWorldMountByRoute(profile, "/apps/task-workspace", { appInstalls })?.target,
    ).toEqual(tasksWorld.target);
    expect(
      findRuntimeWorldMountByRoute(profile, "/apps/crm/audiences", { appInstalls })?.target,
    ).toEqual(crmWorld.target);
    expect(
      installedAppWorldMountFromInstallId(profile, "missing", { appInstalls }),
    ).toBeUndefined();
  });

  it("resolves workspace package installed admin route mounts from the active resolver", () => {
    const profile = createDevRuntimeProfile();
    const privatePackage = privateSitePackage();
    const appInstalls = [
      appInstallFromPackage({
        appPackage: privatePackage,
        installId: "private-site",
        label: "Workspace Site",
      }),
    ];
    const context = {
      activePackageResolver: appPackageResolver([privatePackage]),
      appInstalls,
    };
    const world = installedAppWorldMountFromInstallId(profile, "private-site", context);

    if (!world?.target || world.target.kind !== "appInstall") {
      throw new Error("Missing workspace package app world.");
    }

    expect(installedAppWorldMountFromInstallId(profile, "private-site", { appInstalls })).toBe(
      undefined,
    );
    expect(world.app.key).toBe("private-site");
    expect(world.app.label).toBe("Private Site");
    expect(world.route).toBe("/apps/private-site");
    expect(world.target.installId).toBe("private-site");
    expect(world.target.packageAppKey).toBe("private-site");
    expect(world.target.sourceSchemaKey).toBe("private-site");
    expect(world.target.apiRoutePrefix).toBe("/api/app-installs/private-site/private-site");
    expect(world.target.browserDatabaseName).toBe("formless:app:private-site");
    expect(runtimeScreenPathFromRoute(world, "/apps/private-site/dashboard")).toBe("/dashboard");
    expect(findRuntimeWorldMountByRoute(profile, "/apps/private-site/dashboard", context)).toEqual(
      world,
    );
  });

  it("resolves product instance installed app screen paths without schema route metadata", () => {
    const profile = createInstanceRuntimeProfile();
    const appInstalls = [
      appInstallFixture({
        installId: "task-workspace",
        label: "Task Workspace",
        packageAppKey: "tasks",
      }),
    ];
    const world = installedAppWorldMountFromInstallId(profile, "task-workspace", { appInstalls });

    if (!world?.target || world.target.kind !== "appInstall") {
      throw new Error("Missing installed Tasks world.");
    }

    expect(world.app.key).toBe("tasks");
    expect(world.route).toBe("/apps/task-workspace");
    expect(world.target.apiRoutePrefix).toBe("/api/app-installs/tasks/task-workspace");
    expect(findRuntimeWorldMountByRoute(profile, "/apps/task-workspace", { appInstalls })).toEqual(
      world,
    );
    expect(
      findRuntimeWorldMountByRoute(profile, "/apps/task-workspace/schema", { appInstalls }),
    ).toEqual(world);
  });

  it("resolves installed app browser routes from enabled appRoute records", () => {
    const profile = createDevRuntimeProfile();
    const appInstalls: AppInstall[] = [
      {
        ...appInstallFixture({ installId: "personal", label: "Personal Site" }),
        routes: [
          {
            enabled: false,
            id: "app-route:personal:admin",
            path: "/apps/personal",
            routeKind: "admin",
          },
          {
            access: "authenticated",
            enabled: true,
            id: "app-route:personal:admin-custom",
            path: "/apps/personal-admin",
            requiredRole: "app.admin",
            routeKind: "admin",
          },
        ],
      },
    ];
    const world = findRuntimeWorldMountByRoute(profile, "/apps/personal-admin/settings", {
      appInstalls,
    });

    if (!world?.target || world.target.kind !== "appInstall") {
      throw new Error("Missing custom installed app route world.");
    }

    expect(world.route).toBe("/apps/personal-admin");
    expect(world.access).toBe("authenticated");
    expect(world.requiredRole).toBe("app.admin");
    expect(world.target.installId).toBe("personal");
    expect(
      findRuntimeWorldMountByRoute(profile, "/apps/personal", { appInstalls }),
    ).toBeUndefined();
  });

  it("resolves installed Site public route surfaces from install ids", () => {
    const profile = createDevRuntimeProfile();
    const appInstalls = [
      appInstallFixture({ installId: "personal", label: "Personal Site" }),
      appInstallFixture({
        installId: "task-workspace",
        label: "Task Workspace",
        packageAppKey: "tasks",
      }),
    ];
    const home = installedSitePublicSurfaceFromRoute(profile, "/sites/personal", { appInstalls });
    const nested = installedSitePublicSurfaceFromRoute(profile, "/sites/personal/blog/post", {
      appInstalls,
    });

    if (!home?.target || home.target.kind !== "appInstall") {
      throw new Error("Missing installed Site public surface.");
    }

    expect(home.routeBase).toBe("/sites/personal");
    expect(home.slug).toBe("home");
    expect(home.target.installId).toBe("personal");
    expect(home.target.apiRoutePrefix).toBe("/api/app-installs/site/personal");
    expect(nested?.routeBase).toBe("/sites/personal");
    expect(nested?.slug).toBe("blog/post");
    expect(isRuntimePublicSiteRoute(profile, "/sites/personal", { appInstalls })).toBe(true);
    expect(isRuntimePublicSiteRoute(profile, "/sites/personal/blog/post", { appInstalls })).toBe(
      true,
    );
    expect(
      installedSitePublicSurfaceFromRoute(profile, "/sites/task-workspace", { appInstalls }),
    ).toBeUndefined();
    expect(
      installedSitePublicSurfaceFromRoute(profile, "/sites/rates", { appInstalls }),
    ).toBeUndefined();
    expect(isRuntimePublicSiteRoute(profile, "/sites/task-workspace", { appInstalls })).toBe(false);
    expect(isRuntimePublicSiteRoute(profile, "/sites/rates", { appInstalls })).toBe(false);
    expect(runtimeInstalledSitePublicPath(profile, "personal", "home")).toBe("/sites/personal");
    expect(runtimeInstalledSitePublicPath(profile, "personal", "blog/post")).toBe(
      "/sites/personal/blog/post",
    );
  });

  it("resolves installed Site public surfaces from enabled public appRoute records", () => {
    const profile = createDevRuntimeProfile();
    const appInstalls: AppInstall[] = [
      {
        ...appInstallFixture({ installId: "personal", label: "Personal Site" }),
        routes: [
          {
            enabled: false,
            id: "app-route:personal:publicSite",
            path: "/sites/personal",
            prefix: "/sites/personal/",
            routeKind: "publicSite",
          },
          {
            enabled: true,
            id: "app-route:personal:publicSite-custom",
            path: "/public/personal",
            prefix: "/public/personal/",
            routeKind: "publicSite",
          },
        ],
      },
    ];
    const custom = installedSitePublicSurfaceFromRoute(profile, "/public/personal/blog/post", {
      appInstalls,
    });

    expect(custom?.routeBase).toBe("/public/personal");
    expect(custom?.slug).toBe("blog/post");
    expect(
      installedSitePublicSurfaceFromRoute(profile, "/sites/personal", { appInstalls }),
    ).toBeUndefined();
  });

  it("resolves an app profile with one app mounted at root paths", () => {
    const profile = createAppRuntimeProfile("crm");
    const world = profile.worlds[0];

    if (!world) {
      throw new Error("Missing app profile world mount.");
    }

    expect(profile.kind).toBe("app");
    expect(profile.shell).toBe("app");
    expect(profile.defaultRedirect).toBeUndefined();
    expect(world.app.key).toBe("crm");
    expect(world.generatedRoutes).toBe(true);
    expect(world.route).toBe("/");
    expect(runtimeScreenRoute(world, "/")).toBe("/");
    expect(runtimeScreenRoute(world, "/setup")).toBe("/setup");
    expect(runtimeScreenPathFromRoute(world, "/")).toBe("/");
    expect(runtimeScreenPathFromRoute(world, "/setup")).toBe("/setup");
    expect(runtimeScreenPathFromRoute(world, "/schema")).toBe("/schema");
    expect(runtimeBrowserRoutePatterns(profile)).toEqual({});
    expect(runtimeProfileNeedsInstalledAppRouteInstalls(profile)).toBe(false);
  });

  it("resolves an installed app profile with install-scoped root paths", () => {
    const profile = createInstalledAppRuntimeProfile({
      installId: "task-workspace",
      packageAppKey: "tasks",
    });
    const world = profile?.worlds[0];

    if (!profile || !world?.target || world.target.kind !== "appInstall") {
      throw new Error("Missing installed app profile world mount.");
    }

    expect(profile.kind).toBe("app");
    expect(profile.shell).toBe("app");
    expect(world.app.key).toBe("tasks");
    expect(world.route).toBe("/");
    expect(world.target.installId).toBe("task-workspace");
    expect(world.target.apiRoutePrefix).toBe("/api/app-installs/tasks/task-workspace");
    expect(world.target.browserDatabaseName).toBe("formless:app:task-workspace");
    expect(findRuntimeWorldMountByRoute(profile, "/")?.target).toEqual(world.target);
    expect(findRuntimeWorldMountByRoute(profile, "/schema")?.target).toEqual(world.target);
    expect(runtimeScreenRoute(world, "/")).toBe("/");
    expect(runtimeScreenPathFromRoute(world, "/schema")).toBe("/schema");
  });

  it("hydrates workspace package app-profile root paths from the active package resolver", () => {
    const privatePackage = privateSitePackage();
    const pendingProfile = createInstalledAppRuntimeProfile({
      installId: "private-site",
      packageAppKey: "private-site",
    });

    if (!pendingProfile) {
      throw new Error("Missing pending installed app profile.");
    }

    expect(pendingProfile.worlds).toEqual([]);
    expect(runtimeProfileNeedsInstalledAppRouteInstalls(pendingProfile)).toBe(true);

    const profile = runtimeProfileWithActivePackageResolver(
      pendingProfile,
      appPackageResolver([privatePackage]),
    );
    const world = profile.worlds[0];

    if (!world?.target || world.target.kind !== "appInstall") {
      throw new Error("Missing hydrated workspace package app profile world.");
    }

    expect(profile.kind).toBe("app");
    expect(profile.shell).toBe("app");
    expect(world.app.key).toBe("private-site");
    expect(world.app.label).toBe("Private Site");
    expect(world.route).toBe("/");
    expect(world.target.installId).toBe("private-site");
    expect(world.target.packageAppKey).toBe("private-site");
    expect(world.target.sourceSchemaKey).toBe("private-site");
    expect(world.target.apiRoutePrefix).toBe("/api/app-installs/private-site/private-site");
    expect(findRuntimeWorldMountByRoute(profile, "/")?.target).toEqual(world.target);
    expect(findRuntimeWorldMountByRoute(profile, "/schema")?.target).toEqual(world.target);
    expect(runtimeScreenPathFromRoute(world, "/dashboard")).toBe("/dashboard");
    expect(runtimeScreenPathFromRoute(world, "/schema")).toBe("/schema");
  });

  it("resolves the Site authoring profile with top-level preview and admin routes", () => {
    const profile = createSiteAuthoringRuntimeProfile();
    const world = profile.worlds[0];

    if (!world) {
      throw new Error("Missing Site authoring profile world mount.");
    }

    expect(profile.kind).toBe("siteAuthoring");
    expect(profile.shell).toBe("app");
    expect(profile.defaultRedirect).toBeUndefined();
    expect(world.app.key).toBe("site");
    expect(world.generatedRoutes).toBe(true);
    expect(world.route).toBe("/admin");
    expect(profile.publicSitePreview).toEqual({
      packageAppKey: "site",
      rootRoute: "/",
      routePattern: "/*",
      homeSlug: "home",
      linkMode: "authoring",
    });
    expect(runtimeBrowserRoutePatterns(profile)).toEqual({});
    expect(runtimeScreenRoute(world, "/")).toBe("/admin");
    expect(runtimeScreenRoute(world, "/header")).toBe("/admin/header");
    expect(runtimeScreenPathFromRoute(world, "/admin")).toBe("/");
    expect(runtimeScreenPathFromRoute(world, "/admin/header")).toBe("/header");
  });

  it("resolves the published Site profile without generated admin routes", () => {
    const profile = createPublishedSiteRuntimeProfile();
    const world = profile.worlds[0];

    if (!world) {
      throw new Error("Missing published Site profile world mount.");
    }

    expect(profile.kind).toBe("publishedSite");
    expect(profile.shell).toBe("publishedSite");
    expect(world.app.key).toBe("site");
    expect(world.generatedRoutes).toBe(false);
    expect(world.route).toBe("/");
    expect(profile.publishedSite).toEqual({
      homeSlug: "home",
      packageAppKey: "site",
      rootRoute: "/",
      routePattern: "/*",
    });
    expect(runtimeBrowserRoutePatterns(profile)).toEqual({
      authAccountGateRoutePattern: "/formless/auth/*",
      authAccountRoute: "/formless/auth",
      authAccountSetupRoute: "/formless/auth/setup",
      authAccountSignInRoute: "/formless/auth/sign-in",
    });
  });

  it("uses explicit config first and host config only as a deterministic fallback", () => {
    expect(resolveRuntimeProfile({ profile: "instance" }).kind).toBe("instance");
    expect(resolveRuntimeProfile({ profile: "app", schemaKey: "crm" }).kind).toBe("app");
    expect(resolveRuntimeProfile({ profile: "siteAuthoring" }).kind).toBe("siteAuthoring");
    expect(resolveRuntimeProfile({ profile: "publishedSite" }).kind).toBe("publishedSite");
    expect(
      resolveRuntimeProfile({
        hostname: "formless.twitchy.workers.dev",
        profile: "dev",
      }).kind,
    ).toBe("dev");
    expect(resolveRuntimeProfile({ hostname: "app.formless.local", schemaKey: "site" }).kind).toBe(
      "app",
    );
    expect(resolveRuntimeProfile({ hostname: "site-authoring.formless.local" }).kind).toBe(
      "siteAuthoring",
    );
    expect(resolveRuntimeProfile({ hostname: "published-site.formless.local" }).kind).toBe(
      "publishedSite",
    );
    expect(resolveRuntimeProfile({ hostname: "instance.formless.local" }).kind).toBe("instance");
    expect(resolveRuntimeProfile({ hostname: "formless.twitchy.workers.dev" }).kind).toBe(
      "publishedSite",
    );
    expect(resolveRuntimeProfile({ profile: "missing", schemaKey: "missing" }).kind).toBe("dev");
  });

  it("uses an SSR document profile hint before falling back to the host", () => {
    const doc = {
      querySelector: (selector: string) =>
        selector === `meta[name="${FORMLESS_RUNTIME_PROFILE_META_NAME}"]`
          ? {
              getAttribute: (name: string) => (name === "content" ? "publishedSite" : null),
            }
          : null,
    };

    const profile = resolveRuntimeProfile({
      hostname: "34-public-site-ssr.formless.local",
      profile: readRuntimeProfileDocumentHint(doc),
    });

    expect(profile.kind).toBe("publishedSite");
  });

  it("uses document app target hints for mapped installed app hosts", () => {
    const doc = {
      querySelector: (selector: string) => {
        const values = {
          [`meta[name="${FORMLESS_RUNTIME_PROFILE_META_NAME}"]`]: "app",
          [`meta[name="${FORMLESS_RUNTIME_APP_INSTALL_ID_META_NAME}"]`]: "task-workspace",
          [`meta[name="${FORMLESS_RUNTIME_PACKAGE_APP_KEY_META_NAME}"]`]: "tasks",
        };
        const value = values[selector as keyof typeof values];

        return value
          ? {
              getAttribute: (name: string) => (name === "content" ? value : null),
            }
          : null;
      },
    };
    const hints = readRuntimeProfileDocumentHints(doc);
    const profile = resolveRuntimeProfile({
      hostname: "tasks.example.com",
      ...hints,
    });
    const world = profile.worlds[0];

    if (!world?.target || world.target.kind !== "appInstall") {
      throw new Error("Missing installed app target.");
    }

    expect(readRuntimeProfileDocumentHint(doc)).toBe("app");
    expect(profile.kind).toBe("app");
    expect(world.app.key).toBe("tasks");
    expect(world.route).toBe("/");
    expect(world.target.installId).toBe("task-workspace");
  });

  it("uses document public Site target hints for mapped installed public hosts", () => {
    const profile = resolveRuntimeProfile({
      profile: "publishedSite",
      appInstallId: "personal",
      packageAppKey: "site",
    });

    if (!profile.publishedSite?.target || profile.publishedSite.target.kind !== "appInstall") {
      throw new Error("Missing published Site target.");
    }

    expect(profile.kind).toBe("publishedSite");
    expect(profile.publishedSite.packageAppKey).toBe("site");
    expect(profile.publishedSite.target.installId).toBe("personal");
    expect(profile.publishedSite.target.apiRoutePrefix).toBe("/api/app-installs/site/personal");
  });

  it("lets SSR document profile hints override the baked browser env profile", () => {
    expect(
      selectBrowserRuntimeProfileHint({
        documentProfile: "publishedSite",
        envProfile: "instance",
      }),
    ).toBe("publishedSite");
    expect(
      selectBrowserRuntimeProfileHint({
        documentProfile: undefined,
        envProfile: "instance",
      }),
    ).toBe("instance");
  });
});
