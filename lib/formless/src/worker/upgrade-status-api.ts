import {
  INSTANCE_UPGRADE_APPLY_API_PATH,
  INSTANCE_UPGRADE_STATUS_API_PATH,
  type InstanceUpgradeStatusResponse,
  type UpgradeStorageIdentityStatus,
} from "../shared/upgrade-status.ts";
import { authorizeInstanceWrite, type AuthorityAdminGuardEnv } from "./authority-admin-guard.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { readAllAppliedSqlMigrations } from "./sql-migrations.ts";

type InstanceUpgradeStatusApiEnv = AuthorityAdminGuardEnv & {
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

    return jsonResponse(instanceUpgradeStatusResponse(storage));
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

function instanceUpgradeStatusResponse(
  storage: DurableObjectStorage,
): InstanceUpgradeStatusResponse {
  return {
    storageIdentities: [instanceStorageUpgradeStatus(storage)],
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
