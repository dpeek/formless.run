import {
  INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH,
  INSTANCE_DEPLOYMENT_STATUS_API_PATH,
  type InstanceDeploymentDesiredStateResponse,
  type InstanceDeploymentStatusResponse,
} from "../shared/deployment-runtime.ts";
import { invalidateProgramAuthorityForProtectedResponse } from "./program-authority.ts";

export type DeploymentRuntimeApiErrorBody = {
  code?: string;
  error: string;
  status?: string;
};

export class DeploymentRuntimeApiError extends Error {
  readonly body: DeploymentRuntimeApiErrorBody;
  readonly status: number;

  constructor(message: string, options: { body: DeploymentRuntimeApiErrorBody; status: number }) {
    super(message);
    this.name = "DeploymentRuntimeApiError";
    this.body = options.body;
    this.status = options.status;
  }
}

export async function fetchInstanceDeploymentStatus({
  fetcher = fetch,
  signal,
}: {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
} = {}): Promise<InstanceDeploymentStatusResponse> {
  const response = await fetcher(INSTANCE_DEPLOYMENT_STATUS_API_PATH, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });

  return readJsonResponse<InstanceDeploymentStatusResponse>(response);
}

export async function fetchInstanceDeploymentDesiredState({
  fetcher = fetch,
  signal,
}: {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
} = {}): Promise<InstanceDeploymentDesiredStateResponse> {
  const response = await fetcher(INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });

  return readJsonResponse<InstanceDeploymentDesiredStateResponse>(response);
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  invalidateProgramAuthorityForProtectedResponse(response);
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    const errorBody = deploymentRuntimeErrorBody(body);

    throw new DeploymentRuntimeApiError(errorBody.error, {
      body: errorBody,
      status: response.status,
    });
  }

  return body as T;
}

function deploymentRuntimeErrorBody(value: unknown): DeploymentRuntimeApiErrorBody {
  if (!isRecord(value)) {
    return { error: "Deployment runtime request failed." };
  }

  const error =
    typeof value.error === "string" ? value.error : "Deployment runtime request failed.";
  const code = typeof value.code === "string" ? value.code : undefined;
  const status = typeof value.status === "string" ? value.status : undefined;

  return {
    error,
    ...(code === undefined ? {} : { code }),
    ...(status === undefined ? {} : { status }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
