import type {
  AppInstall,
  AppPackageResolver,
  InstallableAppPackage,
} from "@dpeek/formless-installed-apps";
import {
  activeAppPackageResolverFromAppInstallsResponse,
  activeAppPackageResolverFromPackages,
} from "../client/app-installs.ts";
import type { AppInstallsResponse } from "../shared/protocol.ts";
import {
  normalizeRuntimeBrowserPath,
  runtimeBrowserRoutePatterns,
  type RuntimeProfile,
} from "./runtime-profile.ts";

export type RuntimeInstalledAppRouteRegistry = {
  activePackageResolver?: AppPackageResolver | undefined;
  installs: readonly AppInstall[];
  packages: readonly InstallableAppPackage[];
};

export function runtimeInstalledAppRouteRegistryFromResponse(
  response: AppInstallsResponse,
): RuntimeInstalledAppRouteRegistry {
  return {
    activePackageResolver: activeAppPackageResolverFromAppInstallsResponse(response),
    installs: [...response.installs],
    packages: [...response.packages],
  };
}

export function runtimeInstalledAppRouteRegistryFromInstalls(
  installs: readonly AppInstall[],
  packages: readonly InstallableAppPackage[] = [],
): RuntimeInstalledAppRouteRegistry {
  return {
    activePackageResolver:
      packages.length > 0 ? activeAppPackageResolverFromPackages(packages) : undefined,
    installs: [...installs],
    packages: [...packages],
  };
}

export function emptyRuntimeInstalledAppRouteRegistry(): RuntimeInstalledAppRouteRegistry {
  return {
    installs: [],
    packages: [],
  };
}

export function runtimeInstalledAppRouteRegistryRefreshKey(
  runtimeProfile: RuntimeProfile,
  location: string,
): string {
  const path = normalizeRuntimeBrowserPath(location);
  const routes = runtimeBrowserRoutePatterns(runtimeProfile);

  return installedRouteRootPath(path, routes.installedAppHomeRoutePattern) ?? path;
}

function installedRouteRootPath(
  path: string,
  routePattern: `/${string}` | undefined,
): string | undefined {
  const routeBase = routePattern?.split("/:installId")[0];

  if (!routeBase) {
    return undefined;
  }

  const routePrefix = `${routeBase}/`;

  if (!path.startsWith(routePrefix)) {
    return undefined;
  }

  const installId = path.slice(routePrefix.length).split("/")[0];

  return installId ? `${routePrefix}${installId}` : undefined;
}
