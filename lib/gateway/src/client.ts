import {
  WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  WORKSPACE_GATEWAY_CSRF_HEADER,
  isWorkspaceGatewayApiErrorBody,
  isWorkspaceGatewayPushResponse,
  isWorkspaceGatewayStatusResponse,
  workspaceGatewayAutoSaveApiPath,
  workspaceGatewayPushApiPath,
  workspaceGatewayPushInteractionApiPath,
  workspaceGatewayPushesApiPath,
  workspaceGatewayStatusApiPath,
  type WorkspaceGatewayAccountSelectionInput,
  type WorkspaceGatewayApiErrorBody,
  type WorkspaceGatewayAutoSaveEnqueueInput,
  type WorkspaceGatewayErrorCode,
  type WorkspaceGatewayPushResponse,
  type WorkspaceGatewayPushStartInput,
  type WorkspaceGatewayStatusResponse,
} from "./index.ts";

export { WORKSPACE_GATEWAY_BOOTSTRAP_HEADER, WORKSPACE_GATEWAY_CSRF_HEADER } from "./index.ts";
export type {
  WorkspaceGatewayAccountChoice,
  WorkspaceGatewayAccountSelectionInput,
  WorkspaceGatewayAccountSelectionInteraction,
  WorkspaceGatewayApiErrorBody,
  WorkspaceGatewayAutoSaveEnqueueInput,
  WorkspaceGatewayAutoSaveWriteSource,
  WorkspaceGatewayErrorCode,
  WorkspaceGatewayExternalAuthorizationInteraction,
  WorkspaceGatewayPush,
  WorkspaceGatewayPushFailureCode,
  WorkspaceGatewayPushInteraction,
  WorkspaceGatewayPushLifecycle,
  WorkspaceGatewayPushMode,
  WorkspaceGatewayPushOutcome,
  WorkspaceGatewayPushPhase,
  WorkspaceGatewayPushPhaseId,
  WorkspaceGatewayPushPhaseStatus,
  WorkspaceGatewayPushResponse,
  WorkspaceGatewayPushStartInput,
  WorkspaceGatewayStatusResponse,
} from "./index.ts";

export type WorkspaceGatewayConfig = { apiBasePath: string; bootstrapToken?: string };

export class WorkspaceGatewayApiError extends Error {
  readonly code: WorkspaceGatewayErrorCode;
  readonly status: number;

  constructor(code: WorkspaceGatewayErrorCode, status: number) {
    super();
    this.name = "WorkspaceGatewayApiError";
    this.code = code;
    this.status = status;
  }
}

export function workspaceGatewayBrowserConfig(
  env: Record<string, unknown> = import.meta.env,
): WorkspaceGatewayConfig | undefined {
  const apiBasePath = stringConfigValue(env.VITE_FORMLESS_WORKSPACE_GATEWAY_API);
  if (!apiBasePath) return undefined;
  const bootstrapToken = stringConfigValue(env.VITE_FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN);
  return {
    apiBasePath: apiBasePath.replace(/\/+$/, ""),
    ...(bootstrapToken === undefined ? {} : { bootstrapToken }),
  };
}

export async function fetchWorkspaceGatewayStatus({
  config = workspaceGatewayBrowserConfig(),
  fetcher = fetch,
  signal,
}: {
  config?: WorkspaceGatewayConfig;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
} = {}): Promise<WorkspaceGatewayStatusResponse | undefined> {
  if (!config) return undefined;
  const request = (allowBootstrap: boolean) =>
    fetcher(workspaceGatewayStatusApiPath(config.apiBasePath), {
      credentials: "same-origin",
      headers: gatewayHeaders(config, { allowBootstrap }),
      signal,
    });
  return requestWithBootstrapRetry(request, readStatusResponse);
}

export async function startWorkspaceGatewayPush(
  input: WorkspaceGatewayPushStartInput,
  options: MutationOptions = {},
): Promise<WorkspaceGatewayPushResponse | undefined> {
  const config = options.config ?? workspaceGatewayBrowserConfig();
  if (!config) return undefined;
  return readPushResponse(
    await (options.fetcher ?? fetch)(workspaceGatewayPushesApiPath(config.apiBasePath), {
      body: JSON.stringify(input),
      credentials: "same-origin",
      headers: gatewayHeaders(config, {
        allowBootstrap: false,
        csrfToken: options.csrfToken,
        includeJsonContentType: true,
      }),
      method: "POST",
      signal: options.signal,
    }),
  );
}

export async function fetchWorkspaceGatewayPush(
  pushId: string,
  options: ReadOptions = {},
): Promise<WorkspaceGatewayPushResponse | undefined> {
  const config = options.config ?? workspaceGatewayBrowserConfig();
  if (!config) return undefined;
  return readPushResponse(
    await (options.fetcher ?? fetch)(workspaceGatewayPushApiPath(pushId, config.apiBasePath), {
      credentials: "same-origin",
      headers: gatewayHeaders(config, { allowBootstrap: false }),
      signal: options.signal,
    }),
  );
}

export async function submitWorkspaceGatewayAccountSelection(
  input: {
    accountId: string;
    interactionId: string;
    pushId: string;
  },
  options: MutationOptions = {},
): Promise<WorkspaceGatewayPushResponse | undefined> {
  const config = options.config ?? workspaceGatewayBrowserConfig();
  if (!config) return undefined;
  const body: WorkspaceGatewayAccountSelectionInput = {
    accountId: input.accountId,
    kind: "account-selection",
  };
  return readPushResponse(
    await (options.fetcher ?? fetch)(
      workspaceGatewayPushInteractionApiPath(input.pushId, input.interactionId, config.apiBasePath),
      {
        body: JSON.stringify(body),
        credentials: "same-origin",
        headers: gatewayHeaders(config, {
          allowBootstrap: false,
          csrfToken: options.csrfToken,
          includeJsonContentType: true,
        }),
        method: "POST",
        signal: options.signal,
      },
    ),
  );
}

export async function enqueueWorkspaceGatewayAutoSave(
  input: WorkspaceGatewayAutoSaveEnqueueInput,
  options: MutationOptions = {},
): Promise<void> {
  const config = options.config ?? workspaceGatewayBrowserConfig();
  if (!config) return;
  const response = await (options.fetcher ?? fetch)(
    workspaceGatewayAutoSaveApiPath(config.apiBasePath),
    {
      body: JSON.stringify(input),
      credentials: "same-origin",
      headers: gatewayHeaders(config, {
        allowBootstrap: false,
        csrfToken: options.csrfToken,
        includeJsonContentType: true,
      }),
      method: "POST",
      signal: options.signal,
    },
  );
  if (!response.ok || response.status !== 204) await throwGatewayError(response);
}

type ReadOptions = {
  config?: WorkspaceGatewayConfig;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
};
type MutationOptions = ReadOptions & { csrfToken?: string };

async function requestWithBootstrapRetry<T>(
  request: (allowBootstrap: boolean) => Promise<Response>,
  parse: (response: Response) => Promise<T>,
): Promise<T> {
  const first = await request(true);
  if (first.status !== 403) return parse(first);
  const body = await readGatewayErrorBody(first);
  if (body.code !== "bootstrap-expired") {
    throw new WorkspaceGatewayApiError(body.code, first.status);
  }
  return parse(await request(false));
}

async function readStatusResponse(response: Response): Promise<WorkspaceGatewayStatusResponse> {
  const body = await readResponseJson(response);
  if (!response.ok) {
    throw new WorkspaceGatewayApiError(gatewayErrorBody(body).code, response.status);
  }
  if (!isWorkspaceGatewayStatusResponse(body)) throw invalidResponseError();
  return body;
}

async function readPushResponse(response: Response): Promise<WorkspaceGatewayPushResponse> {
  const body = await readResponseJson(response);
  if (!response.ok) {
    throw new WorkspaceGatewayApiError(gatewayErrorBody(body).code, response.status);
  }
  if (!isWorkspaceGatewayPushResponse(body)) throw invalidResponseError();
  return body;
}

async function throwGatewayError(response: Response): Promise<never> {
  throw new WorkspaceGatewayApiError((await readGatewayErrorBody(response)).code, response.status);
}

async function readGatewayErrorBody(response: Response): Promise<WorkspaceGatewayApiErrorBody> {
  return gatewayErrorBody(await readResponseJson(response));
}

function gatewayErrorBody(body: unknown): WorkspaceGatewayApiErrorBody {
  return isWorkspaceGatewayApiErrorBody(body) ? body : { code: "invalid-sidecar-response" };
}

function invalidResponseError(): WorkspaceGatewayApiError {
  return new WorkspaceGatewayApiError("invalid-sidecar-response", 502);
}

async function readResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function gatewayHeaders(
  config: WorkspaceGatewayConfig,
  options: {
    allowBootstrap: boolean;
    csrfToken?: string;
    includeJsonContentType?: boolean;
  },
): Headers {
  const headers = new Headers({ Accept: "application/json" });
  if (options.includeJsonContentType) headers.set("Content-Type", "application/json");
  if (options.allowBootstrap && config.bootstrapToken) {
    headers.set(WORKSPACE_GATEWAY_BOOTSTRAP_HEADER, config.bootstrapToken);
  }
  if (options.csrfToken) headers.set(WORKSPACE_GATEWAY_CSRF_HEADER, options.csrfToken);
  return headers;
}

function stringConfigValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
