import {
  appInstallInitializationPlan,
  findAppInstall,
  type AppInstall,
  type AppInstallLaunchLink,
  type AppInstallRoute,
} from "@dpeek/formless-installed-apps";
import {
  instanceControlPlaneAppLaunchLinksFromRecords,
  instanceControlPlaneAppInstallsFromRecords,
} from "@dpeek/formless-instance-control-plane";
import {
  FORMLESS_PROGRAM_API_ROUTE_PREFIX,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
} from "../program/target.ts";
import {
  parseCreateAppInstallRequest,
  type AppInstallsResponse,
  type CreateAppInstallRequest,
  type CreateAppInstallResponse,
} from "../shared/protocol.ts";
import {
  isSourceSchemaHash,
  type PackageAppRevision,
  type SourceSchemaHash,
} from "../shared/upgrade-migrations.ts";
import {
  authorizeOperationalManagement,
  type AuthorityAdminGuardEnv,
} from "./authority-admin-guard.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import {
  hostAuthSessionTargetFromRequestHeaders,
  validateInstanceAuthAccessSession,
} from "./instance-auth-handoff.ts";
import type { InstanceAuthSessionTargetBinding } from "./instance-auth-state.ts";
import {
  CREATE_APP_INSTALL_CONTROL_PLANE_OPERATION_PATH,
  INTERNAL_UPDATE_APP_INSTALL_PACKAGE_FACTS_PATH,
} from "./instance-control-plane.ts";
import { readControlPlaneRecords } from "./deployment-control-plane-client.ts";
import {
  activeAppPackageResolver,
  listActiveAppPackages,
  type ActiveRuntimeAppPackageEnv,
} from "./runtime-app-packages.ts";

export const INSTANCE_APP_INSTALLS_API_PATH = "/api/formless/app-installs";
export const INSTANCE_APP_INSTALL_PACKAGE_MIGRATIONS_PATH_SUFFIX = "/package-migrations/apply";

export type InstanceAppInstallsApiEnv = AuthorityAdminGuardEnv &
  ActiveRuntimeAppPackageEnv & {
    FORMLESS_AUTHORITY: DurableObjectNamespace;
  };

export async function handleInstanceAppInstallsApiRequest(
  request: Request,
  env: InstanceAppInstallsApiEnv,
): Promise<Response | undefined> {
  if (!isInstanceAppInstallsApiPath(new URL(request.url).pathname)) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function lookupInstanceAppInstallForRequest(
  request: Request,
  env: InstanceAppInstallsApiEnv,
  installId: string,
): Promise<AppInstall | undefined> {
  const requestUrl = new URL(request.url);
  const lookupUrl = new URL(INSTANCE_APP_INSTALLS_API_PATH, requestUrl.origin);
  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);
  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(lookupUrl, {
      headers: { Accept: "application/json" },
      method: "GET",
    }),
  );

  if (!response.ok) {
    return undefined;
  }

  const body = (await response.json()) as AppInstallsResponse;

  return findAppInstall(body.installs, installId);
}

export async function handleInstanceAppInstallsDurableObjectRequest(
  request: Request,
  _storage: DurableObjectStorage,
  env: InstanceAppInstallsApiEnv,
): Promise<Response | undefined> {
  const pathname = new URL(request.url).pathname;

  if (!isInstanceAppInstallsApiPath(pathname)) {
    return undefined;
  }

  try {
    const migrationApplyRoute = parsePackageMigrationApplyRoute(pathname);

    if (migrationApplyRoute) {
      if (request.method !== "POST") {
        return methodNotAllowedResponse("POST");
      }

      const authorization = await authorizeOperationalManagement(request, env, {
        error:
          "Owner session, Program administrator session, or admin authorization is required for this write endpoint.",
        hostSessionTarget: hostAuthSessionTargetForInstanceAppInstallsRequest(request),
      });

      if (!authorization.authorized) {
        return jsonResponse(
          { error: authorization.error },
          authorization.status,
          authorization.headers,
        );
      }

      const install = findAppInstall(
        await readControlPlaneAppInstallsForRequest(env, request.url),
        migrationApplyRoute.installId,
      );

      if (!install || install.packageAppKey !== migrationApplyRoute.packageAppKey) {
        return jsonResponse({ error: "App install not found." }, 404);
      }

      const migrationResponse = await applyInstalledAppPackageMigrations(request, env, install);
      const installs = await updateControlPlaneAppInstallPackageFacts(request, env, {
        installId: install.installId,
        packageAppKey: install.packageAppKey,
        packageRevision: migrationResponse.packageRevision,
        sourceSchemaHash: migrationResponse.sourceSchemaHash,
      });
      const updatedInstall = findAppInstall(installs, install.installId);

      if (!updatedInstall) {
        throw new Error(
          `Migrated install "${install.installId}" was not returned by control-plane.`,
        );
      }

      return jsonResponse({
        ...migrationResponse,
        install: updatedInstall,
        installs,
      });
    }

    if (pathname !== INSTANCE_APP_INSTALLS_API_PATH) {
      return jsonResponse({ error: "Not found." }, 404);
    }

    if (request.method === "GET") {
      const authorization = await authorizeOperationalManagement(request, env, {
        error:
          "Owner session, Program administrator session, or admin authorization is required for this read endpoint.",
        hostSessionTarget: hostAuthSessionTargetForInstanceAppInstallsRequest(request),
      });

      if (authorization.authorized) {
        return jsonResponse(await appInstallsResponse(request, env));
      }

      const hostSessionTarget = hostAuthSessionTargetFromRequestHeaders(request.headers);
      const authenticated = await validateInstanceAuthAccessSession(request, env, {
        requiredAuthority: "authenticated",
        ...(hostSessionTarget === undefined ? {} : { target: hostSessionTarget }),
      });

      if (!authenticated.ok) {
        return jsonResponse(
          { error: authorization.error },
          authorization.status,
          authorization.headers,
        );
      }

      const response = await appInstallsResponse(request, env);

      return jsonResponse(
        await appAdminAppInstallsResponse(request, env, response, hostSessionTarget),
      );
    }

    if (request.method === "POST") {
      const authorization = await authorizeOperationalManagement(request, env, {
        error:
          "Owner session, Program administrator session, or admin authorization is required for this write endpoint.",
        hostSessionTarget: hostAuthSessionTargetForInstanceAppInstallsRequest(request),
      });

      if (!authorization.authorized) {
        return jsonResponse(
          { error: authorization.error },
          authorization.status,
          authorization.headers,
        );
      }

      const body = parseCreateAppInstallRequest(await readJson(request));
      const created = await createControlPlaneAppInstall(request, env, body);

      if (!created.response.ok) {
        return jsonResponse(
          created.body,
          installFailureStatus(
            typeof created.body === "object" && created.body !== null && "code" in created.body
              ? String(created.body.code)
              : undefined,
          ),
        );
      }

      const installs = await readControlPlaneAppInstallsForRequest(env, request.url);
      const install = findAppInstall(installs, body.installId);

      if (!install) {
        throw new Error(`Created install "${body.installId}" was not returned by control-plane.`);
      }

      const response: CreateAppInstallResponse = {
        initialization: appInstallInitializationPlan(install, activeAppPackageResolver(env)),
        install,
        installs,
      };

      return jsonResponse(response, 201);
    }

    return methodNotAllowedResponse("GET, POST");
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

export function isInstanceAppInstallsApiPath(pathname: string) {
  return (
    pathname === INSTANCE_APP_INSTALLS_API_PATH ||
    pathname.startsWith(`${INSTANCE_APP_INSTALLS_API_PATH}/`)
  );
}

function hostAuthSessionTargetForInstanceAppInstallsRequest(request: Request) {
  const target = hostAuthSessionTargetFromRequestHeaders(request.headers);

  if (
    !target ||
    target.appInstallId !== undefined ||
    target.targetProfile !== "instance" ||
    target.storageIdentity !== FORMLESS_PROGRAM_STORAGE_IDENTITY
  ) {
    return undefined;
  }

  return target;
}

function parsePackageMigrationApplyRoute(pathname: string):
  | {
      installId: string;
      packageAppKey: string;
    }
  | undefined {
  const prefix = `${INSTANCE_APP_INSTALLS_API_PATH}/`;

  if (
    !pathname.startsWith(prefix) ||
    !pathname.endsWith(INSTANCE_APP_INSTALL_PACKAGE_MIGRATIONS_PATH_SUFFIX)
  ) {
    return undefined;
  }

  const route = pathname.slice(
    prefix.length,
    -INSTANCE_APP_INSTALL_PACKAGE_MIGRATIONS_PATH_SUFFIX.length,
  );
  const [packageAppKey, installId, ...extra] = route.split("/").filter(Boolean);

  if (!packageAppKey || !installId || extra.length > 0) {
    return undefined;
  }

  return {
    installId,
    packageAppKey,
  };
}

async function applyInstalledAppPackageMigrations(
  request: Request,
  env: InstanceAppInstallsApiEnv,
  install: AppInstall,
): Promise<{
  applied: unknown[];
  changes: unknown[];
  cursor: number;
  packageAppKey: string;
  packageRevision: PackageAppRevision;
  schemaUpdatedAt: string;
  skipped: unknown[];
  sourceSchemaHash: SourceSchemaHash;
}> {
  const requestUrl = new URL(request.url);
  const requestBody = await readOptionalJson(request);
  const applyUrl = new URL(
    `/api/app-installs/${install.packageAppKey}/${install.installId}${INSTANCE_APP_INSTALL_PACKAGE_MIGRATIONS_PATH_SUFFIX}`,
    requestUrl.origin,
  );
  const id = env.FORMLESS_AUTHORITY.idFromName(`app:${install.installId}`);
  const headers = new Headers(request.headers);

  headers.set("Content-Type", "application/json");

  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(applyUrl, {
      body: JSON.stringify({
        currentPackageRevision: install.packageRevision,
        currentSourceSchemaHash: install.sourceSchemaHash,
        ...(isRecord(requestBody) && requestBody.safety === "auto-safe"
          ? { safety: requestBody.safety }
          : {}),
      }),
      headers,
      method: "POST",
    }),
  );
  const body = (await response.json()) as {
    error?: string;
    applied?: unknown[];
    changes?: unknown[];
    cursor?: number;
    packageAppKey?: string;
    packageRevision?: number;
    schemaUpdatedAt?: string;
    skipped?: unknown[];
    sourceSchemaHash?: unknown;
  };

  if (!response.ok) {
    throw new Error(body.error ?? "Package app migration apply failed.");
  }

  if (
    !Array.isArray(body.applied) ||
    !Array.isArray(body.changes) ||
    typeof body.cursor !== "number" ||
    body.packageAppKey !== install.packageAppKey ||
    !isPackageAppRevision(body.packageRevision) ||
    typeof body.schemaUpdatedAt !== "string" ||
    !Array.isArray(body.skipped) ||
    !isSourceSchemaHash(body.sourceSchemaHash)
  ) {
    throw new Error("Package app migration response is invalid.");
  }

  return {
    applied: body.applied,
    changes: body.changes,
    cursor: body.cursor,
    packageAppKey: body.packageAppKey,
    packageRevision: body.packageRevision,
    schemaUpdatedAt: body.schemaUpdatedAt,
    skipped: body.skipped,
    sourceSchemaHash: body.sourceSchemaHash,
  };
}

async function appInstallsResponse(
  request: Request,
  env: InstanceAppInstallsApiEnv,
): Promise<AppInstallsResponse> {
  const records = await readControlPlaneRecords({ env, requestUrl: request.url });
  const packageResolver = activeAppPackageResolver(env);

  return {
    packages: listActiveAppPackages(env),
    installs: instanceControlPlaneAppInstallsFromRecords(records ?? [], packageResolver),
    launchLinks: instanceControlPlaneAppLaunchLinksFromRecords(records ?? [], packageResolver),
  };
}

async function appAdminAppInstallsResponse(
  request: Request,
  env: InstanceAppInstallsApiEnv,
  response: AppInstallsResponse,
  hostSessionTarget: InstanceAuthSessionTargetBinding | undefined,
): Promise<AppInstallsResponse> {
  const installs: AppInstall[] = [];

  for (const install of response.installs) {
    const target = appAdminRegistryTarget(request, install, hostSessionTarget);

    if (!target) {
      continue;
    }

    const authorization = await validateInstanceAuthAccessSession(request, env, {
      requiredAuthority: "app.admin",
      target,
    });

    if (authorization.ok) {
      installs.push(appAdminInstallProjection(install));
    }
  }

  const packageAppKeys = new Set(installs.map((install) => install.packageAppKey));
  const installIds = new Set(installs.map((install) => install.installId));

  return {
    installs,
    packages: response.packages.filter((appPackage) =>
      packageAppKeys.has(appPackage.packageAppKey),
    ),
    ...(response.launchLinks === undefined
      ? {}
      : {
          launchLinks: response.launchLinks.filter(
            (link) => installIds.has(link.installId) && appAdminLaunchLinkIsEligible(link),
          ),
        }),
  };
}

function appAdminRegistryTarget(
  request: Request,
  install: AppInstall,
  hostSessionTarget: InstanceAuthSessionTargetBinding | undefined,
): InstanceAuthSessionTargetBinding | undefined {
  if (hostSessionTarget) {
    return hostSessionTarget.appInstallId === install.installId ? hostSessionTarget : undefined;
  }

  const adminRoute = install.routes?.find(
    (route) => route.routeKind === "admin" && route.requiredRole === "app.admin",
  );

  return {
    access: "authenticated",
    appInstallId: install.installId,
    requiredRole: "app.admin",
    routeId: adminRoute?.id ?? `app-install:${install.installId}:admin`,
    storageIdentity: `app:${install.installId}`,
    targetOrigin: new URL(request.url).origin,
    targetProfile: "app",
  };
}

function appAdminInstallProjection(install: AppInstall): AppInstall {
  const routes = install.routes?.filter(appAdminRouteIsEligible);
  const launchLinks = install.launchLinks?.filter(appAdminLaunchLinkIsEligible);

  return {
    ...install,
    ...(routes === undefined ? {} : { routes }),
    ...(launchLinks === undefined ? {} : { launchLinks }),
  };
}

function appAdminRouteIsEligible(route: AppInstallRoute): boolean {
  if (!route.enabled) {
    return false;
  }

  return appAdminRouteAccessIsEligible(route.access ?? "anonymous", route.requiredRole);
}

function appAdminLaunchLinkIsEligible(link: AppInstallLaunchLink): boolean {
  return appAdminRouteAccessIsEligible(link.access, link.requiredRole);
}

function appAdminRouteAccessIsEligible(
  access: AppInstallRoute["access"] | AppInstallLaunchLink["access"],
  requiredRole: AppInstallRoute["requiredRole"],
): boolean {
  if (access === "anonymous") {
    return true;
  }

  return access === "authenticated" && (requiredRole === undefined || requiredRole === "app.admin");
}

export async function readControlPlaneAppInstallsForRequest(
  env: InstanceAppInstallsApiEnv,
  requestUrl: string,
): Promise<AppInstall[]> {
  const records = await readControlPlaneRecords({ env, requestUrl });

  return instanceControlPlaneAppInstallsFromRecords(records ?? [], activeAppPackageResolver(env));
}

async function updateControlPlaneAppInstallPackageFacts(
  request: Request,
  env: InstanceAppInstallsApiEnv,
  input: {
    installId: string;
    packageAppKey: string;
    packageRevision: PackageAppRevision;
    sourceSchemaHash: SourceSchemaHash;
  },
): Promise<AppInstall[]> {
  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_PROGRAM_STORAGE_IDENTITY);
  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(
      new URL(
        `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}${INTERNAL_UPDATE_APP_INSTALL_PACKAGE_FACTS_PATH}`,
        request.url,
      ),
      {
        body: JSON.stringify(input),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    ),
  );
  const body = (await response.json()) as { installs?: AppInstall[]; error?: string };

  if (!response.ok || !Array.isArray(body.installs)) {
    throw new Error(body.error ?? "Control-plane app install package fact update failed.");
  }

  return body.installs;
}

async function createControlPlaneAppInstall(
  request: Request,
  env: InstanceAppInstallsApiEnv,
  input: CreateAppInstallRequest,
): Promise<{ body: unknown; response: Response }> {
  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_PROGRAM_STORAGE_IDENTITY);
  const headers = new Headers(request.headers);

  headers.set("Content-Type", "application/json");

  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(
      new URL(
        `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}${CREATE_APP_INSTALL_CONTROL_PLANE_OPERATION_PATH}`,
        request.url,
      ),
      {
        body: JSON.stringify({
          idempotencyKey: `appInstallApi:${input.installId}:${crypto.randomUUID()}`,
          input,
        }),
        headers,
        method: "POST",
      },
    ),
  );

  return {
    body: await response.json(),
    response,
  };
}

function installFailureStatus(code: string | undefined) {
  return code === "duplicate-install-id" ? 409 : 400;
}

function isPackageAppRevision(value: unknown): value is PackageAppRevision {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

async function readOptionalJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function methodNotAllowedResponse(allow: string): Response {
  return jsonResponse({ error: "Method not allowed." }, 405, { Allow: allow });
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);

  if (!responseHeaders.has("Cache-Control")) {
    responseHeaders.set("Cache-Control", "no-store");
  }

  return Response.json(body, {
    status,
    headers: responseHeaders,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Bad request.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
