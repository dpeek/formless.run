import { describe, expect, it } from "vite-plus/test";
import type { AppInstall, InstallableAppPackage } from "@dpeek/formless-installed-apps";
import { bundledSourceSchemaHashFixtures } from "../shared/upgrade-migrations.ts";
import { createDevRuntimeProfile } from "./runtime-profile.ts";
import {
  runtimeInstalledAppRouteRegistryFromResponse,
  runtimeInstalledAppRouteRegistryRefreshKey,
} from "./runtime-installed-app-route-registry.ts";

describe("runtime installed app route registry", () => {
  it("retains fetched installs and active workspace packages", () => {
    const appPackage = privateSitePackage();
    const install = {
      adminRoute: "/apps/private-site",
      createdAt: "2026-05-25T00:00:00.000Z",
      installId: "private-site",
      label: "Private Site",
      packageAppKey: "private-site",
      packageRevision: appPackage.packageRevision,
      registrationPolicy: "closed",
      sourceSchemaHash: appPackage.sourceSchemaHash,
      status: "installed",
      updatedAt: "2026-05-25T00:00:00.000Z",
    } satisfies AppInstall;
    const registry = runtimeInstalledAppRouteRegistryFromResponse({
      installs: [install],
      packages: [appPackage],
    });

    expect(registry.installs).toEqual([install]);
    expect(registry.packages).toEqual([appPackage]);
    expect(registry.activePackageResolver?.findPackage("private-site")).toMatchObject({
      packageAppKey: "private-site",
      sourceOrigin: "workspace",
      sourceSchemaKey: "private-site",
    });
    expect(registry.activePackageResolver?.findPackage("site")).toBeUndefined();
  });

  it("keeps refresh keys stable within installed admin route roots", () => {
    const runtimeProfile = createDevRuntimeProfile();

    expect(runtimeInstalledAppRouteRegistryRefreshKey(runtimeProfile, "/apps/crm")).toBe(
      "/apps/crm",
    );
    expect(runtimeInstalledAppRouteRegistryRefreshKey(runtimeProfile, "/apps/crm/audiences")).toBe(
      "/apps/crm",
    );
    expect(runtimeInstalledAppRouteRegistryRefreshKey(runtimeProfile, "/sites/site/blog")).toBe(
      "/sites/site/blog",
    );
    expect(runtimeInstalledAppRouteRegistryRefreshKey(runtimeProfile, "/crm/audiences")).toBe(
      "/crm/audiences",
    );
  });
});

function privateSitePackage(): InstallableAppPackage {
  return {
    adminRouteBase: "/apps",
    defaultInstallId: "private-site",
    description: "Workspace-linked package.",
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
