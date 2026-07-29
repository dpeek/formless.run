import {
  validateAppInstallId,
  type AppInstallId,
  type PackageAppKey,
} from "@dpeek/formless-installed-apps";
import { findResolvedAppPackage, type AppPackageResolver } from "./app-packages.ts";
import {
  INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX,
  INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
} from "@dpeek/formless-instance-control-plane";
import {
  IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX,
  IDENTITY_CONTROL_PLANE_SCHEMA_KEY,
  IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY,
} from "@dpeek/formless-identity-control-plane";
import { findSchemaAppDefinition, getSchemaAppDefinition, type SchemaKey } from "./schema-apps.ts";

export type AppStorageIdentity = SchemaKeyStorageIdentity | InstalledAppStorageIdentity;

export type InstanceControlPlaneStorageIdentity = {
  kind: "instanceControlPlane";
  schemaKey: typeof INSTANCE_CONTROL_PLANE_SCHEMA_KEY;
  authorityName: typeof INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY;
  apiRoutePrefix: typeof INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX;
  browserDatabaseName: string;
  broadcastChannelName: string;
};

export type IdentityControlPlaneStorageIdentity = {
  kind: "identityControlPlane";
  schemaKey: typeof IDENTITY_CONTROL_PLANE_SCHEMA_KEY;
  authorityName: typeof IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY;
  apiRoutePrefix: typeof IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX;
  browserDatabaseName: string;
  broadcastChannelName: string;
};

export type SchemaKeyStorageIdentity = {
  kind: "schemaKey";
  packageAppKey: PackageAppKey;
  sourceSchemaKey: SchemaKey;
  authorityName: SchemaKey;
  apiRoutePrefix: `/api/${SchemaKey}`;
  browserDatabaseName: string;
  broadcastChannelName: string;
};

export type InstalledAppStorageIdentity = {
  kind: "appInstall";
  installId: AppInstallId;
  packageAppKey: PackageAppKey;
  sourceSchemaKey: string;
  authorityName: `app:${AppInstallId}`;
  apiRoutePrefix: `/api/app-installs/${PackageAppKey}/${AppInstallId}`;
  browserDatabaseName: string;
  broadcastChannelName: string;
};

export type AuthorityApiRoute = {
  identity: AppStorageIdentity;
  path: `/${string}`;
};

const browserStoragePrefix = "formless";
const installedAppAuthorityPrefix = "app";
const installedAppApiPrefix = "/api/app-installs";

export function schemaKeyStorageIdentity(schemaKey: SchemaKey): SchemaKeyStorageIdentity {
  const app = getSchemaAppDefinition(schemaKey);
  const storageName = browserStorageName(schemaKey);

  return {
    kind: "schemaKey",
    packageAppKey: app.key,
    sourceSchemaKey: app.key,
    authorityName: app.key,
    apiRoutePrefix: `/api/${app.key}`,
    browserDatabaseName: storageName,
    broadcastChannelName: storageName,
  };
}

export function installedAppStorageIdentity(
  input: {
    installId: string;
    packageAppKey: string;
  },
  resolver?: AppPackageResolver,
): InstalledAppStorageIdentity | undefined {
  const packageApp = findResolvedAppPackage(input.packageAppKey, resolver);
  const installId = validateAppInstallId(input.installId);

  if (!packageApp || !installId.ok) {
    return undefined;
  }

  const storageName = browserStorageName(`app:${installId.installId}`);
  const apiRoutePrefix =
    `${installedAppApiPrefix}/${packageApp.packageAppKey}/${installId.installId}` as const;

  return {
    kind: "appInstall",
    installId: installId.installId,
    packageAppKey: packageApp.packageAppKey,
    sourceSchemaKey: packageApp.sourceSchemaKey,
    authorityName: `${installedAppAuthorityPrefix}:${installId.installId}`,
    apiRoutePrefix,
    browserDatabaseName: storageName,
    broadcastChannelName: storageName,
  };
}

export function instanceControlPlaneStorageIdentity(): InstanceControlPlaneStorageIdentity {
  const storageName = browserStorageName(INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY);

  return {
    kind: "instanceControlPlane",
    schemaKey: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
    authorityName: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
    apiRoutePrefix: INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX,
    browserDatabaseName: storageName,
    broadcastChannelName: storageName,
  };
}

export function identityControlPlaneStorageIdentity(): IdentityControlPlaneStorageIdentity {
  const storageName = browserStorageName(IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY);

  return {
    kind: "identityControlPlane",
    schemaKey: IDENTITY_CONTROL_PLANE_SCHEMA_KEY,
    authorityName: IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY,
    apiRoutePrefix: IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX,
    browserDatabaseName: storageName,
    broadcastChannelName: storageName,
  };
}

export function parseAuthorityApiRoute(
  pathname: string,
  resolver?: AppPackageResolver,
): AuthorityApiRoute | undefined {
  return parseInstalledAppApiRoute(pathname, resolver) ?? parseSchemaKeyApiRoute(pathname);
}

export function parseInstanceControlPlaneApiRoute(pathname: string):
  | {
      identity: InstanceControlPlaneStorageIdentity;
      path: `/${string}`;
    }
  | undefined {
  if (
    pathname !== INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX &&
    !pathname.startsWith(`${INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX}/`)
  ) {
    return undefined;
  }

  const suffix = pathname.slice(INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX.length);

  if (!suffix.startsWith("/") || suffix === "/") {
    return undefined;
  }

  return {
    identity: instanceControlPlaneStorageIdentity(),
    path: suffix as `/${string}`,
  };
}

export function parseIdentityControlPlaneApiRoute(pathname: string):
  | {
      identity: IdentityControlPlaneStorageIdentity;
      path: `/${string}`;
    }
  | undefined {
  if (
    pathname !== IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX &&
    !pathname.startsWith(`${IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX}/`)
  ) {
    return undefined;
  }

  const suffix = pathname.slice(IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX.length);

  if (!suffix.startsWith("/") || suffix === "/") {
    return undefined;
  }

  return {
    identity: identityControlPlaneStorageIdentity(),
    path: suffix as `/${string}`,
  };
}

function parseInstalledAppApiRoute(
  pathname: string,
  resolver?: AppPackageResolver,
): AuthorityApiRoute | undefined {
  const [apiSegment, appInstallsSegment, packageAppKey, installId, ...routeSegments] = pathname
    .split("/")
    .filter(Boolean);

  if (
    apiSegment !== "api" ||
    appInstallsSegment !== "app-installs" ||
    !packageAppKey ||
    !installId ||
    routeSegments.length === 0
  ) {
    return undefined;
  }

  const identity = installedAppStorageIdentity({ installId, packageAppKey }, resolver);

  return identity ? { identity, path: `/${routeSegments.join("/")}` } : undefined;
}

function parseSchemaKeyApiRoute(pathname: string): AuthorityApiRoute | undefined {
  const [apiSegment, schemaKey, ...routeSegments] = pathname.split("/").filter(Boolean);

  if (apiSegment !== "api" || !schemaKey || routeSegments.length === 0) {
    return undefined;
  }

  const app = findSchemaAppDefinition(schemaKey);

  return app
    ? {
        identity: schemaKeyStorageIdentity(app.key),
        path: `/${routeSegments.join("/")}`,
      }
    : undefined;
}

function browserStorageName(identitySegment: string) {
  return `${browserStoragePrefix}:${identitySegment}`;
}
