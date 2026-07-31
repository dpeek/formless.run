import {
  installedAppStorageIdentity,
  type AppStorageIdentity,
} from "../shared/app-storage-identity.ts";
import type { AppInstall } from "@dpeek/formless-installed-apps";
import {
  APP_STORAGE_UPGRADE_STATUS_API_PATH_SUFFIX,
  INSTANCE_UPGRADE_APPLY_API_PATH,
  INSTANCE_UPGRADE_STATUS_API_PATH,
  type InstanceUpgradeStatusResponse,
  type UpgradeStorageIdentityStatus,
} from "../shared/upgrade-status.ts";
import { authorizeInstanceWrite, type AuthorityAdminGuardEnv } from "./authority-admin-guard.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { readControlPlaneAppInstallsForRequest } from "./instance-app-installs.ts";
import { readAllAppliedSqlMigrations } from "./sql-migrations.ts";
import {
  ensureStorageTables,
  readAppliedPackageAppMigrations,
  readPackageAppMigrationState,
} from "./storage.ts";
import {
  activeAppPackageResolver,
  type ActiveRuntimeAppPackageEnv,
} from "./runtime-app-packages.ts";

type InstanceUpgradeStatusApiEnv = AuthorityAdminGuardEnv &
  ActiveRuntimeAppPackageEnv & {
    FORMLESS_AUTHORITY: DurableObjectNamespace;
  };

export async function handleInstanceUpgradeStatusApiRequest(
  request: Request,
  env: InstanceUpgradeStatusApiEnv,
): Promise<Response | undefined> {
  if (!isInstanceUpgradeApiPath(new URL(request.url).pathname)) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleInstanceUpgradeStatusDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceUpgradeStatusApiEnv,
): Promise<Response | undefined> {
  const pathname = new URL(request.url).pathname;

  if (!isInstanceUpgradeApiPath(pathname)) {
    return undefined;
  }

  try {
    if (pathname === INSTANCE_UPGRADE_STATUS_API_PATH && request.method !== "GET") {
      return methodNotAllowedResponse("GET");
    }

    if (pathname === INSTANCE_UPGRADE_APPLY_API_PATH && request.method !== "POST") {
      return methodNotAllowedResponse("POST");
    }

    const authorization = await authorizeInstanceWrite(request, env);

    if (!authorization.authorized) {
      return jsonResponse(
        { error: authorization.error },
        authorization.status,
        authorization.headers,
      );
    }

    return jsonResponse(await instanceUpgradeStatusResponse(request, storage, env));
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

export async function handleAppStorageUpgradeStatusDurableObjectRequest(input: {
  env: AuthorityAdminGuardEnv;
  identity: AppStorageIdentity;
  path: string;
  request: Request;
  storage: DurableObjectStorage;
}): Promise<Response | undefined> {
  if (input.path !== APP_STORAGE_UPGRADE_STATUS_API_PATH_SUFFIX) {
    return undefined;
  }

  try {
    if (input.request.method !== "GET") {
      return methodNotAllowedResponse("GET");
    }

    const authorization = await authorizeInstanceWrite(input.request, input.env);

    if (!authorization.authorized) {
      return jsonResponse(
        { error: authorization.error },
        authorization.status,
        authorization.headers,
      );
    }

    ensureStorageTables(input.storage);

    return jsonResponse(appStorageUpgradeStatus(input.storage, input.identity));
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

function instanceStorageUpgradeStatus(storage: DurableObjectStorage): UpgradeStorageIdentityStatus {
  return {
    identity: {
      authorityName: FORMLESS_INSTANCE_AUTHORITY_NAME,
      kind: "instance",
    },
    sqlMigrations: readAllAppliedSqlMigrations(storage),
  };
}

function appStorageUpgradeStatus(
  storage: DurableObjectStorage,
  identity: AppStorageIdentity,
): UpgradeStorageIdentityStatus {
  return {
    identity,
    packageAppMigrations: {
      applied: readAppliedPackageAppMigrations(storage, identity.packageAppKey),
      state: readPackageAppMigrationState(storage, identity.packageAppKey) ?? null,
    },
    sqlMigrations: readAllAppliedSqlMigrations(storage),
  };
}

async function readInstalledAppStorageUpgradeStatus(
  request: Request,
  env: InstanceUpgradeStatusApiEnv,
  install: AppInstall,
): Promise<UpgradeStorageIdentityStatus> {
  const identity = installedAppStorageIdentity(
    {
      installId: install.installId,
      packageAppKey: install.packageAppKey,
    },
    activeAppPackageResolver(env),
  );

  if (!identity) {
    throw new Error(`Installed app "${install.installId}" has invalid storage identity.`);
  }

  const requestUrl = new URL(request.url);
  const statusUrl = new URL(
    `${identity.apiRoutePrefix}${APP_STORAGE_UPGRADE_STATUS_API_PATH_SUFFIX}`,
    requestUrl.origin,
  );
  const id = env.FORMLESS_AUTHORITY.idFromName(identity.authorityName);
  const headers = new Headers();
  const authorization = request.headers.get("Authorization");
  const cookie = request.headers.get("Cookie");

  headers.set("Accept", "application/json");
  if (authorization) {
    headers.set("Authorization", authorization);
  }
  if (cookie) {
    headers.set("Cookie", cookie);
  }

  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(statusUrl, {
      headers,
      method: "GET",
    }),
  );
  const body = (await response.json()) as UpgradeStorageIdentityStatus | { error?: string };

  if (!response.ok) {
    throw new Error(
      "error" in body && body.error
        ? body.error
        : `Upgrade status read failed for install "${install.installId}".`,
    );
  }

  return body as UpgradeStorageIdentityStatus;
}

async function instanceUpgradeStatusResponse(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceUpgradeStatusApiEnv,
): Promise<InstanceUpgradeStatusResponse> {
  const installs = await readControlPlaneAppInstallsForRequest(env, request.url);

  return {
    storageIdentities: [
      instanceStorageUpgradeStatus(storage),
      ...(await Promise.all(
        installs.map((install) => readInstalledAppStorageUpgradeStatus(request, env, install)),
      )),
    ],
  };
}

function isInstanceUpgradeApiPath(pathname: string): boolean {
  return (
    pathname === INSTANCE_UPGRADE_STATUS_API_PATH || pathname === INSTANCE_UPGRADE_APPLY_API_PATH
  );
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
