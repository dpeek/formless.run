import {
  INSTANCE_DEPLOYMENT_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_FAILURE_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_HEARTBEAT_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_PLAN_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_START_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_SUCCESS_API_PATH,
  INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH,
  INSTANCE_DEPLOYMENT_DRIFT_API_PATH,
  INSTANCE_DEPLOYMENT_STATUS_API_PATH,
  validateDeploymentTargetId,
  type DeploymentRuntimeValidationError,
  type DeploymentTarget,
  type InstanceDeploymentDesiredStateResponse,
  type InstanceDeploymentStatusResponse,
} from "../shared/deployment-runtime.ts";
import { nowIsoString } from "../shared/clock.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import type { DeploymentControlPlaneClientEnv } from "./deployment-control-plane-client.ts";
import { readControlPlaneRecords } from "./deployment-control-plane-client.ts";
import {
  INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
  materializeDeploymentDesiredStateVersion,
  readLatestDeploymentStatus,
} from "./deployment-runtime-state.ts";
import { buildPrimaryInstanceDeploymentDesiredStateProjection } from "./deployment-runtime-projection.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { AuthorityAdminGuardEnv } from "./authority-admin-guard.ts";

type InstanceDeploymentRuntimeApiEnv = AuthorityAdminGuardEnv & {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
};

type DurableObjectDeploymentRuntimeEnv = AuthorityAdminGuardEnv & {
  FORMLESS_AUTHORITY?: DeploymentControlPlaneClientEnv["FORMLESS_AUTHORITY"];
  FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID?: string;
  FORMLESS_DOMAIN_PROVIDER_WORKER_NAME?: string;
};

export const INTERNAL_RESET_INSTANCE_DEPLOYMENT_RUNTIME_PATH =
  "/_internal/reset-instance-deployment-runtime";

const removedDeploymentMutationPaths = new Set([
  INSTANCE_DEPLOYMENT_ATTEMPT_START_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_HEARTBEAT_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_PLAN_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_SUCCESS_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_FAILURE_API_PATH,
  INSTANCE_DEPLOYMENT_DRIFT_API_PATH,
]);

const primaryInstanceDeploymentTarget: DeploymentTarget = {
  label: "Primary instance target",
  targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
};

export async function handleInstanceDeploymentRuntimeApiRequest(
  request: Request,
  env: InstanceDeploymentRuntimeApiEnv,
): Promise<Response | undefined> {
  if (!isInstanceDeploymentRuntimeApiPath(new URL(request.url).pathname)) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleInstanceDeploymentRuntimeDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: DurableObjectDeploymentRuntimeEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (url.pathname === INTERNAL_RESET_INSTANCE_DEPLOYMENT_RUNTIME_PATH) {
    if (request.method !== "POST") {
      return methodNotAllowedResponse("POST");
    }

    return jsonResponse({ reset: true });
  }

  if (!isInstanceDeploymentRuntimeApiPath(url.pathname)) {
    return undefined;
  }

  try {
    if (url.pathname === INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH) {
      return handleDesiredStateRequest(request, storage, url, env);
    }

    if (url.pathname === INSTANCE_DEPLOYMENT_STATUS_API_PATH) {
      return handleStatusRequest(request, storage, url, env);
    }

    if (removedDeploymentMutationPaths.has(url.pathname)) {
      return jsonResponse({ error: "Deployment runtime API is read-only." }, 404);
    }

    return jsonResponse({ error: "Not found." }, 404);
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

async function handleDesiredStateRequest(
  request: Request,
  storage: DurableObjectStorage,
  url: URL,
  env: DurableObjectDeploymentRuntimeEnv,
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowedResponse("GET");
  }

  const target = deploymentTargetFromSearchParams(url.searchParams);

  if (!target.ok) {
    return jsonResponse(deploymentValidationErrorBody(target.error), 400);
  }

  const targetError = deploymentTargetNotFoundBody(target.target.targetId);

  if (targetError) {
    return jsonResponse(targetError, 404);
  }

  const desiredState = await readDesiredStateProjection({
    env,
    request,
    storage,
    target: target.target,
  });
  const response: InstanceDeploymentDesiredStateResponse = {
    desiredState,
    target: target.target,
  };

  return jsonResponse(response);
}

async function handleStatusRequest(
  request: Request,
  storage: DurableObjectStorage,
  url: URL,
  env: DurableObjectDeploymentRuntimeEnv,
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowedResponse("GET");
  }

  const target = deploymentTargetFromSearchParams(url.searchParams);

  if (!target.ok) {
    return jsonResponse(deploymentValidationErrorBody(target.error), 400);
  }

  const targetError = deploymentTargetNotFoundBody(target.target.targetId);

  if (targetError) {
    return jsonResponse(targetError, 404);
  }

  const desiredState = await readDesiredStateProjection({
    env,
    request,
    storage,
    target: target.target,
  });
  const records =
    (await readControlPlaneRecords({
      env,
      requestUrl: request.url,
    })) ?? [];
  const deploymentConfig = activeDeploymentConfigForTarget(records, target.target.targetId);

  return jsonResponse({
    status: readLatestDeploymentStatus({
      deploymentConfig,
      desiredState,
      now: nowIsoString(),
      targetId: target.target.targetId,
    }),
    target: target.target,
  } satisfies InstanceDeploymentStatusResponse);
}

async function readDesiredStateProjection(input: {
  env: DurableObjectDeploymentRuntimeEnv;
  request: Request;
  storage: DurableObjectStorage;
  target: DeploymentTarget;
}) {
  const now = nowIsoString();
  const projection = await buildPrimaryInstanceDeploymentDesiredStateProjection({
    env: input.env,
    now,
    requestUrl: input.request.url,
    target: input.target,
    targetId: input.target.targetId,
  });

  return materializeDeploymentDesiredStateVersion(input.storage, {
    now,
    resourceGraph: projection.resourceGraph,
    source: projection.source,
    targetId: input.target.targetId,
    title: input.target.label,
  });
}

function activeDeploymentConfigForTarget(
  records: readonly StoredRecord[],
  targetId: string,
): StoredRecord | undefined {
  return records.find(
    (record) =>
      !record.deletedAt &&
      record.entity === "deployment-config" &&
      record.values.enabled === true &&
      record.values.targetId === targetId,
  );
}

function deploymentTargetFromSearchParams(searchParams: URLSearchParams):
  | {
      ok: true;
      target: DeploymentTarget;
    }
  | {
      ok: false;
      error: DeploymentRuntimeValidationError;
    } {
  const targetId = validateDeploymentTargetId(
    searchParams.get("targetId") ?? INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
  );

  if (!targetId.ok) {
    return targetId;
  }

  return {
    ok: true,
    target: {
      ...primaryInstanceDeploymentTarget,
      targetId: targetId.targetId,
    },
  };
}

function deploymentTargetNotFoundBody(targetId: string): { error: string } | undefined {
  return targetId === INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID
    ? undefined
    : { error: `Deployment target "${targetId}" was not found.` };
}

function isInstanceDeploymentRuntimeApiPath(pathname: string) {
  return (
    pathname === INSTANCE_DEPLOYMENT_API_PATH ||
    pathname.startsWith(`${INSTANCE_DEPLOYMENT_API_PATH}/`)
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

function deploymentValidationErrorBody(error: DeploymentRuntimeValidationError) {
  return {
    error: error.message,
    code: error.code,
    ...(error.field === undefined ? {} : { field: error.field }),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Bad request.";
}
