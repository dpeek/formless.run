import {
  INSTANCE_DOMAIN_PROVIDER_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_DELETE_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_DELETE_JOBS_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_MANUAL_CLEANUP_API_PATH,
  type InstanceDomainProviderDeleteRequest,
  type InstanceDomainProviderDeleteJobResponse,
  type InstanceDomainProviderDeleteResponse,
  type InstanceDomainProviderManualCleanupRequest,
  type InstanceDomainProviderManualCleanupResponse,
  type InstanceDomainProviderPlanResponse,
} from "../shared/domain-provider-api.ts";
import { invalidateProgramAuthorityForProtectedResponse } from "./program-authority.ts";

export type DomainProviderApiErrorBody = {
  code?: string;
  error: string;
  status?: string;
};

export class DomainProviderApiError extends Error {
  readonly body: DomainProviderApiErrorBody;
  readonly status: number;

  constructor(message: string, options: { body: DomainProviderApiErrorBody; status: number }) {
    super(message);
    this.name = "DomainProviderApiError";
    this.body = options.body;
    this.status = options.status;
  }
}

export async function fetchInstanceDomainProviderPlan({
  fetcher = fetch,
  signal,
}: {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
} = {}): Promise<InstanceDomainProviderPlanResponse> {
  const response = await fetcher(INSTANCE_DOMAIN_PROVIDER_API_PATH, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });

  return readJsonResponse<InstanceDomainProviderPlanResponse>(response);
}

export async function deleteInstanceDomainProviderResource(
  input: InstanceDomainProviderDeleteRequest,
  {
    fetcher = fetch,
    signal,
  }: {
    fetcher?: typeof fetch;
    signal?: AbortSignal;
  } = {},
): Promise<InstanceDomainProviderDeleteResponse> {
  const response = await fetcher(INSTANCE_DOMAIN_PROVIDER_DELETE_API_PATH, {
    body: JSON.stringify(input),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });

  return readJsonResponse<InstanceDomainProviderDeleteResponse>(response);
}

export async function markInstanceDomainProviderResourceManuallyRemoved(
  input: InstanceDomainProviderManualCleanupRequest,
  {
    fetcher = fetch,
    signal,
  }: {
    fetcher?: typeof fetch;
    signal?: AbortSignal;
  } = {},
): Promise<InstanceDomainProviderManualCleanupResponse> {
  const response = await fetcher(INSTANCE_DOMAIN_PROVIDER_MANUAL_CLEANUP_API_PATH, {
    body: JSON.stringify(input),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });

  return readJsonResponse<InstanceDomainProviderManualCleanupResponse>(response);
}

export async function fetchInstanceDomainProviderDeleteJob(
  input: { jobId: string },
  {
    fetcher = fetch,
    signal,
  }: {
    fetcher?: typeof fetch;
    signal?: AbortSignal;
  } = {},
): Promise<InstanceDomainProviderDeleteJobResponse> {
  const response = await fetcher(
    `${INSTANCE_DOMAIN_PROVIDER_DELETE_JOBS_API_PATH}/${encodeURIComponent(input.jobId)}`,
    {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal,
    },
  );

  return readJsonResponse<InstanceDomainProviderDeleteJobResponse>(response);
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  invalidateProgramAuthorityForProtectedResponse(response);
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    const errorBody = domainProviderErrorBody(body);

    throw new DomainProviderApiError(errorBody.error, {
      body: errorBody,
      status: response.status,
    });
  }

  return body as T;
}

function domainProviderErrorBody(value: unknown): DomainProviderApiErrorBody {
  if (!isRecord(value)) {
    return { error: "Domain provider request failed." };
  }

  const error = typeof value.error === "string" ? value.error : "Domain provider request failed.";
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
