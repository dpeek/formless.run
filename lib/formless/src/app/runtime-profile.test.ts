import { describe, expect, it } from "vite-plus/test";
import {
  createDevWorkbenchRuntimeProfile,
  createDevRuntimeProfile,
  createInstalledAppRuntimeProfile,
  createInstanceRuntimeProfile,
  createPublishedSiteRuntimeProfile,
  FORMLESS_RUNTIME_APP_INSTALL_ID_META_NAME,
  FORMLESS_RUNTIME_PACKAGE_APP_KEY_META_NAME,
  FORMLESS_RUNTIME_PROFILE_META_NAME,
  findRuntimeWorldMountByRoute,
  installedAppWorldMountFromInstallId,
  runtimeBrowserRoutePatterns,
  runtimeProfileNeedsInstalledAppRouteInstalls,
  runtimeProfileWithActivePackageResolver,
  readRuntimeProfileDocumentHint,
  readRuntimeProfileDocumentHints,
  resolveRuntimeProfile,
  runtimeRoutePolicy,
  runtimeScreenPathFromRoute,
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
    expect(profile.worlds).toEqual([]);
    expect(findRuntimeWorldMountByRoute(profile, "/tasks")).toBeUndefined();
    expect(findRuntimeWorldMountByRoute(profile, "/crm")).toBeUndefined();
    expect(findRuntimeWorldMountByRoute(profile, "/site")).toBeUndefined();
    expect(findRuntimeWorldMountByRoute(profile, "/tasks/schema")).toBeUndefined();
    expect(runtimeRoutePolicy(profile)).toEqual({
      instanceBrowserRoutes: true,
      installedAppBrowserRoutes: true,
      accountSessionBrowserRoutes: true,
    });
    expect(runtimeBrowserRoutePatterns(profile)).toEqual({
      authAccountGateRoutePattern: "/formless/auth/*",
      authAccountRoute: "/formless/auth",
      authAccountSetupRoute: "/formless/auth/setup",
      authAccountSignInRoute: "/formless/auth/sign-in",
      instanceShellRoute: "/",
      installedAppHomeRoutePattern: "/apps/:installId",
      installedAppScreenRoutePattern: "/apps/:installId/*",
      localSessionRoute: "/local-session",
    });
  });

  it("resolves the dev workbench without source-app mounts", () => {
    const profile = createDevWorkbenchRuntimeProfile();

    expect(profile.kind).toBe("dev");
    expect(profile.shell).toBe("dev");
    expect(profile.defaultRedirect).toBeUndefined();
    expect(profile.instanceShell).toBe(true);
    expect(profile.installedAppRoutes).toEqual({
      appRouteBase: "/apps",
    });
    expect(profile.worlds).toEqual([]);
    expect(profile.publicSitePreview?.homeRoute).toBe("/pages/home");
    expect(profile.publicSitePreview?.target).toEqual({
      storageIdentity: {
        apiRoutePrefix: "/api/formless/program",
        authorityName: "instance:control-plane",
        broadcastChannelName: "formless:instance:control-plane",
        browserDatabaseName: "formless:instance:control-plane",
        kind: "program",
        schemaKey: "formless-program",
      },
    });
    expect(findRuntimeWorldMountByRoute(profile, "/rates")).toBeUndefined();
    expect(findRuntimeWorldMountByRoute(profile, "/rates/schema")).toBeUndefined();
    expect(runtimeRoutePolicy(profile)).toEqual({
      instanceBrowserRoutes: true,
      installedAppBrowserRoutes: true,
      accountSessionBrowserRoutes: true,
    });
    expect(runtimeBrowserRoutePatterns(profile)).toEqual({
      authAccountGateRoutePattern: "/formless/auth/*",
      authAccountRoute: "/formless/auth",
      authAccountSetupRoute: "/formless/auth/setup",
      authAccountSignInRoute: "/formless/auth/sign-in",
      instanceShellRoute: "/",
      installedAppHomeRoutePattern: "/apps/:installId",
      installedAppScreenRoutePattern: "/apps/:installId/*",
      localSessionRoute: "/local-session",
    });
    expect(runtimeProfileNeedsInstalledAppRouteInstalls(profile)).toBe(true);
  });

  it("resolves installed admin route mounts from install records", () => {
    const profile = createDevRuntimeProfile();
    const appInstalls = [
      appInstallFixture({ installId: "personal", label: "Dormant Site", packageAppKey: "site" }),
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
    expect(world).toBeUndefined();
    expect(tasksWorld).toBeUndefined();
    expect(installedAppWorldMountFromInstallId(profile, "crm", { appInstalls })).toBeUndefined();
    expect(findRuntimeWorldMountByRoute(profile, "/apps/personal/settings", { appInstalls })).toBe(
      undefined,
    );
    expect(
      findRuntimeWorldMountByRoute(profile, "/apps/task-workspace", { appInstalls }),
    ).toBeUndefined();
    expect(
      findRuntimeWorldMountByRoute(profile, "/apps/crm/audiences", { appInstalls }),
    ).toBeUndefined();
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

  it("does not resolve dormant Tasks installs as product app worlds", () => {
    const profile = createInstanceRuntimeProfile();
    const appInstalls = [
      appInstallFixture({
        installId: "task-workspace",
        label: "Task Workspace",
        packageAppKey: "tasks",
      }),
    ];
    const world = installedAppWorldMountFromInstallId(profile, "task-workspace", { appInstalls });

    expect(world).toBeUndefined();
    expect(
      findRuntimeWorldMountByRoute(profile, "/apps/task-workspace", { appInstalls }),
    ).toBeUndefined();
    expect(
      findRuntimeWorldMountByRoute(profile, "/apps/task-workspace/schema", { appInstalls }),
    ).toBeUndefined();
  });

  it("resolves installed app browser routes from enabled appRoute records", () => {
    const profile = createDevRuntimeProfile();
    const appPackage = privateSitePackage();
    const appInstalls: AppInstall[] = [
      {
        ...appInstallFromPackage({
          appPackage,
          installId: "private-site",
          label: "Private Site",
        }),
        routes: [
          {
            enabled: false,
            id: "app-route:private-site:admin",
            path: "/apps/private-site",
            routeKind: "admin",
          },
          {
            access: "authenticated",
            enabled: true,
            id: "app-route:private-site:admin-custom",
            path: "/apps/private-site-admin",
            requiredRole: "app.admin",
            routeKind: "admin",
          },
        ],
      },
    ];
    const context = {
      activePackageResolver: appPackageResolver([appPackage]),
      appInstalls,
    };
    const world = findRuntimeWorldMountByRoute(
      profile,
      "/apps/private-site-admin/settings",
      context,
    );

    if (!world?.target || world.target.kind !== "appInstall") {
      throw new Error("Missing custom installed app route world.");
    }

    expect(world.route).toBe("/apps/private-site-admin");
    expect(world.access).toBe("authenticated");
    expect(world.requiredRole).toBe("app.admin");
    expect(world.target.installId).toBe("private-site");
    expect(findRuntimeWorldMountByRoute(profile, "/apps/private-site", context)).toBeUndefined();
  });

  it("keeps a dormant Tasks app profile pending without an installed world", () => {
    const profile = createInstalledAppRuntimeProfile({
      installId: "task-workspace",
      packageAppKey: "tasks",
    });
    expect(profile).toMatchObject({
      appProfileTarget: {
        installId: "task-workspace",
        packageAppKey: "tasks",
      },
      kind: "app",
      shell: "app",
      worlds: [],
    });
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
      rootRoute: "/",
      routePattern: "/*",
      target: {
        storageIdentity: {
          apiRoutePrefix: "/api/formless/program",
          authorityName: "instance:control-plane",
          broadcastChannelName: "formless:instance:control-plane",
          browserDatabaseName: "formless:instance:control-plane",
          kind: "program",
          schemaKey: "formless-program",
        },
      },
    });
    expect(runtimeBrowserRoutePatterns(profile)).toEqual({
      authAccountGateRoutePattern: "/formless/auth/*",
      authAccountRoute: "/formless/auth",
      authAccountSetupRoute: "/formless/auth/setup",
      authAccountSignInRoute: "/formless/auth/sign-in",
    });
  });

  it("ignores installed target hints when resolving the published Site profile", () => {
    const profile = resolveRuntimeProfile({
      appInstallId: "personal",
      packageAppKey: "private-site",
      profile: "publishedSite",
    });

    expect(profile.publishedSite?.target).toEqual({
      storageIdentity: expect.objectContaining({
        apiRoutePrefix: "/api/formless/program",
        authorityName: "instance:control-plane",
        kind: "program",
      }),
    });
  });

  it("uses explicit config first and host config only as a deterministic fallback", () => {
    expect(resolveRuntimeProfile({ profile: "instance" }).kind).toBe("instance");
    expect(resolveRuntimeProfile({ profile: "app" }).kind).toBe("app");
    expect(resolveRuntimeProfile({ profile: "siteAuthoring" }).kind).toBe("dev");
    expect(resolveRuntimeProfile({ profile: "publishedSite" }).kind).toBe("publishedSite");
    expect(
      resolveRuntimeProfile({
        hostname: "formless.twitchy.workers.dev",
        profile: "dev",
      }).kind,
    ).toBe("dev");
    expect(resolveRuntimeProfile({ hostname: "app.formless.local" }).kind).toBe("app");
    expect(resolveRuntimeProfile({ hostname: "site-authoring.formless.local" }).kind).toBe("dev");
    expect(resolveRuntimeProfile({ hostname: "published-site.formless.local" }).kind).toBe(
      "publishedSite",
    );
    expect(resolveRuntimeProfile({ hostname: "instance.formless.local" }).kind).toBe("instance");
    expect(resolveRuntimeProfile({ hostname: "formless.twitchy.workers.dev" }).kind).toBe(
      "publishedSite",
    );
    expect(resolveRuntimeProfile({ profile: "missing" }).kind).toBe("dev");
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
    expect(readRuntimeProfileDocumentHint(doc)).toBe("app");
    expect(profile.kind).toBe("app");
    expect(profile.appProfileTarget).toEqual({
      installId: "task-workspace",
      packageAppKey: "tasks",
    });
    expect(profile.worlds).toEqual([]);
  });

  it("keeps published Site browser selection on Program storage", () => {
    const profile = resolveRuntimeProfile({
      appInstallId: "private-site",
      hostname: "site.example.com",
      packageAppKey: "private-site",
      profile: "publishedSite",
    });

    expect(profile.kind).toBe("publishedSite");
    expect(profile.publishedSite?.target).toEqual({
      storageIdentity: expect.objectContaining({
        apiRoutePrefix: "/api/formless/program",
        authorityName: "instance:control-plane",
        kind: "program",
      }),
    });
    expect(profile.publishedSite?.target).not.toHaveProperty("packageAppKey");
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
