import {
  validateAppInstallId,
  type AppInstallId,
  type PackageAppKey,
} from "@dpeek/formless-installed-apps";
import { findResolvedAppPackage, type AppPackageResolver } from "./app-packages.ts";
import { findSchemaAppDefinition, getSchemaAppDefinition, type SchemaKey } from "./schema-apps.ts";
import {
  FORMLESS_PROGRAM_API_ROUTE_PREFIX,
  formlessProgramTarget,
  type FormlessProgramTarget,
} from "../program/target.ts";

export type AppStorageIdentity = SchemaKeyStorageIdentity | InstalledAppStorageIdentity;
export type AuthorityStorageIdentity = AppStorageIdentity | ProgramStorageIdentity;

export type ProgramStorageIdentity = FormlessProgramTarget;

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
  identity: AuthorityStorageIdentity;
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

export function programStorageIdentity(): ProgramStorageIdentity {
  return formlessProgramTarget;
}

export function parseAuthorityApiRoute(
  pathname: string,
  resolver?: AppPackageResolver,
): AuthorityApiRoute | undefined {
  return (
    parseProgramApiRoute(pathname) ??
    parseInstalledAppApiRoute(pathname, resolver) ??
    parseSchemaKeyApiRoute(pathname)
  );
}

export function parseProgramApiRoute(pathname: string):
  | {
      identity: ProgramStorageIdentity;
      path: `/${string}`;
    }
  | undefined {
  if (
    pathname !== FORMLESS_PROGRAM_API_ROUTE_PREFIX &&
    !pathname.startsWith(`${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/`)
  ) {
    return undefined;
  }

  const suffix = pathname.slice(FORMLESS_PROGRAM_API_ROUTE_PREFIX.length);

  if (!suffix.startsWith("/") || suffix === "/") {
    return undefined;
  }

  return {
    identity: programStorageIdentity(),
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
