import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";

import {
  WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH,
  WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_CSRF_TOKEN_ENV,
  WORKSPACE_GATEWAY_ENABLED_ENV,
  WORKSPACE_GATEWAY_OPERATIONS_API_PATH,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_ROOT_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
  WORKSPACE_GATEWAY_STATUS_API_PATH,
  isWorkspaceGatewayPath,
  parseWorkspaceGatewayAutoSaveEnqueueInput,
  parseWorkspaceGatewayOperationId,
  parseWorkspaceGatewayStartInput,
  workspaceGatewayAutoSaveEnqueueIntent,
  workspaceGatewayOperationPath,
  workspaceGatewayStartOperationIntent,
  workspaceGatewayStatusIntent,
  type WorkspaceGatewayAutoSaveEnqueueInput,
  type WorkspaceGatewayOperation,
  type WorkspaceGatewayStartInput,
  type WorkspaceGatewayStartInputParseResult,
} from "./index.ts";
import {
  handleWorkspaceGatewayProxyRulesRequest,
  isLoopbackSidecarEndpoint,
  type WorkspaceGatewayProxyRulesEnv,
  type WorkspaceGatewayProxyRulesOwnerSessionValidationResult,
  type WorkspaceGatewayProxyRulesTarget,
} from "./proxy-rules.ts";
import {
  workspaceGatewayEmptySuccessResponse,
  workspaceGatewayErrorResponse,
  workspaceGatewayMethodNotAllowedResponse,
  workspaceGatewayNotFoundResponse,
  workspaceGatewayOperationResponse,
} from "./response-safety.ts";
import {
  authorizeWorkspaceGatewaySidecarExecutionReadRequest,
  authorizeWorkspaceGatewaySidecarExecutionRequest,
  readWorkspaceGatewaySidecarOperationIntent,
  validateWorkspaceGatewaySidecarOperationStateIntent,
  type WorkspaceGatewaySidecarExecutionAuthorization,
  type WorkspaceGatewaySidecarExecutionAuthorizationEnv,
  type WorkspaceGatewaySidecarExecutionContext,
} from "./sidecar-execution.ts";
import {
  WORKSPACE_OPERATION_CAPABILITIES,
  type WorkspaceOperationRequiredCapability,
} from "@dpeek/formless-workspace";

export {
  WORKSPACE_GATEWAY_ACTOR_HEADER,
  WORKSPACE_GATEWAY_API_ROUTE_PREFIX,
  WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER,
  WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH,
  WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_CSRF_COOKIE_NAME,
  WORKSPACE_GATEWAY_CSRF_HEADER,
  WORKSPACE_GATEWAY_CSRF_TOKEN_ENV,
  WORKSPACE_GATEWAY_ENABLED_ENV,
  WORKSPACE_GATEWAY_OPERATION_KIND_HEADER,
  WORKSPACE_GATEWAY_OPERATIONS_API_PATH,
  WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_ROOT_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
  WORKSPACE_GATEWAY_STATUS_API_PATH,
} from "./index.ts";
export type {
  WorkspaceGatewayActor,
  WorkspaceGatewayActorFacts,
  WorkspaceGatewayAutoSaveEnqueueInput,
  WorkspaceGatewayAuthorizationVia,
  WorkspaceGatewayOperation,
  WorkspaceGatewayOperationKind,
  WorkspaceGatewayResponse,
  WorkspaceGatewayStartInput,
} from "./index.ts";
export { isLoopbackSidecarEndpoint } from "./proxy-rules.ts";

export type WorkspaceGatewayLocalProxyEnv = {
  FORMLESS_ADMIN_TOKEN?: string;
  FORMLESS_LOCAL_WORKSPACE_GATEWAY?: string;
  FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN?: string;
  FORMLESS_WORKSPACE_GATEWAY_CSRF_TOKEN?: string;
  FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN?: string;
  FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL?: string;
};

export type WorkspaceGatewaySidecarExecutionEnv = {
  FORMLESS_ADMIN_TOKEN?: string;
  FORMLESS_LOCAL_WORKSPACE_GATEWAY?: string;
  FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN?: string;
  FORMLESS_WORKSPACE_GATEWAY_ROOT?: string;
};

export type WorkspaceGatewaySidecar = {
  close: () => Promise<void>;
  endpoint: string;
  proxyToken: string;
};

export type WorkspaceGatewaySidecarAuthorization = WorkspaceGatewaySidecarExecutionAuthorization;

export type WorkspaceGatewaySidecarOperationHandlers = {
  enqueueAutoSave: (input: {
    authorization: WorkspaceGatewaySidecarAuthorization;
    enqueue: WorkspaceGatewayAutoSaveEnqueueInput;
    request: Request;
    workspaceRoot: string;
  }) => Promise<void>;
  readOperation: (input: {
    authorization: WorkspaceGatewaySidecarAuthorization;
    operationId: string;
    request: Request;
    workspaceRoot: string;
  }) => Promise<WorkspaceGatewayOperation | undefined>;
  startOperation: (input: {
    authorization: WorkspaceGatewaySidecarAuthorization;
    operationInput: WorkspaceGatewayStartInput;
    request: Request;
    workspaceRoot: string;
  }) => Promise<WorkspaceGatewayOperation>;
  status: (input: {
    authorization: WorkspaceGatewaySidecarAuthorization;
    request: Request;
    workspaceRoot: string;
  }) => Promise<WorkspaceGatewayOperation>;
};

export type WorkspaceGatewaySidecarDependencies = {
  createProxyToken: () => string;
  operations: WorkspaceGatewaySidecarOperationHandlers;
};

export type WorkspaceGatewayOwnerSessionValidationResult =
  WorkspaceGatewayProxyRulesOwnerSessionValidationResult;

export type WorkspaceGatewayLocalProxyDependencies = {
  capabilities?: readonly WorkspaceOperationRequiredCapability[];
  proxyFetch?: typeof fetch;
  readOwnerSetupStatus?: (request: Request) => Promise<{ setupComplete: boolean }>;
  routeAvailable?: boolean | ((request: Request) => boolean);
  validateOwnerSession?: (
    request: Request,
  ) =>
    | Promise<WorkspaceGatewayOwnerSessionValidationResult>
    | WorkspaceGatewayOwnerSessionValidationResult;
};

export type WorkspaceGatewayProxyTarget = WorkspaceGatewayProxyRulesTarget;

export async function handleWorkspaceGatewayLocalProxyRequest(
  request: Request,
  env: WorkspaceGatewayLocalProxyEnv,
  dependencies: WorkspaceGatewayLocalProxyDependencies = {},
): Promise<Response | undefined> {
  return handleWorkspaceGatewayProxyRulesRequest(request, proxyRulesEnvFromLocalProxyEnv(env), {
    capabilities: dependencies.capabilities ?? WORKSPACE_OPERATION_CAPABILITIES,
    fetch: dependencies.proxyFetch,
    proxyTarget: () => workspaceGatewayProxyTargetFromEnv(request, env, dependencies),
    readOwnerSetupStatus: dependencies.readOwnerSetupStatus,
    validateOwnerSession: dependencies.validateOwnerSession,
  });
}

export async function handleWorkspaceGatewaySidecarRequest(
  request: Request,
  env: WorkspaceGatewaySidecarExecutionEnv,
  handlers: WorkspaceGatewaySidecarOperationHandlers,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (!isWorkspaceGatewayPath(url.pathname)) {
    return undefined;
  }

  const workspaceRoot = workspaceGatewaySidecarRoot(env);

  if (!workspaceRoot) {
    return workspaceGatewayNotFoundResponse();
  }

  if (url.pathname === WORKSPACE_GATEWAY_STATUS_API_PATH) {
    if (request.method !== "GET") {
      return workspaceGatewayMethodNotAllowedResponse(["GET"]);
    }

    const authorization = authorizeSidecarGatewayRequest(
      request,
      env,
      workspaceGatewayStatusIntent(),
      { mutating: false },
    );

    if ("error" in authorization) {
      return workspaceGatewayErrorResponse(authorization.error, authorization.status);
    }

    return sidecarOperationResponse({
      authorization,
      operation: await handlers.status({ authorization, request, workspaceRoot }),
      request,
    });
  }

  if (url.pathname === WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH) {
    if (request.method === "POST") {
      const parsed = await parseGatewayAutoSaveEnqueueInput(request);

      if (!parsed.ok) {
        return workspaceGatewayErrorResponse(parsed.error, 400);
      }

      const authorization = authorizeSidecarGatewayRequest(
        request,
        env,
        workspaceGatewayAutoSaveEnqueueIntent(),
        { mutating: true },
      );

      if ("error" in authorization) {
        return workspaceGatewayErrorResponse(authorization.error, authorization.status);
      }

      await handlers.enqueueAutoSave({
        authorization,
        enqueue: parsed.input,
        request,
        workspaceRoot,
      });

      return workspaceGatewayEmptySuccessResponse();
    }

    return workspaceGatewayMethodNotAllowedResponse(["POST"]);
  }

  if (url.pathname === WORKSPACE_GATEWAY_OPERATIONS_API_PATH) {
    if (request.method !== "POST") {
      return workspaceGatewayMethodNotAllowedResponse(["POST"]);
    }

    const parsed = await parseGatewayStartInput(request);

    if (!parsed.ok) {
      return workspaceGatewayErrorResponse(parsed.error, 400);
    }

    const authorization = authorizeSidecarGatewayRequest(
      request,
      env,
      workspaceGatewayStartOperationIntent(parsed.input),
      { operationInput: parsed.input },
    );

    if ("error" in authorization) {
      return workspaceGatewayErrorResponse(authorization.error, authorization.status);
    }

    return sidecarOperationResponse({
      authorization,
      operation: await handlers.startOperation({
        authorization,
        operationInput: parsed.input,
        request,
        workspaceRoot,
      }),
      request,
    });
  }

  const operationMatch = workspaceGatewayOperationPath(url.pathname);

  if (operationMatch) {
    if (request.method !== "GET") {
      return workspaceGatewayMethodNotAllowedResponse(["GET"]);
    }

    const parsedOperationId = parseWorkspaceGatewayOperationId(operationMatch.operationId);

    if (!parsedOperationId.ok) {
      return workspaceGatewayErrorResponse(parsedOperationId.error, 400);
    }

    const proxiedOperation = readWorkspaceGatewaySidecarOperationIntent(request);

    if (!proxiedOperation.ok) {
      return workspaceGatewayErrorResponse(proxiedOperation.error, 400);
    }

    const authorization = authorizeSidecarGatewayReadOperationRequest(
      request,
      env,
      proxiedOperation.intent,
    );

    if ("error" in authorization) {
      return workspaceGatewayErrorResponse(authorization.error, authorization.status);
    }

    const operation = await handlers.readOperation({
      authorization,
      operationId: parsedOperationId.operationId,
      request,
      workspaceRoot,
    });

    if (!operation) {
      return workspaceGatewayErrorResponse("Workspace operation was not found.", 404);
    }

    const stateIntent = validateWorkspaceGatewaySidecarOperationStateIntent({
      authorization,
      expectedOperation: proxiedOperation.operation,
      operation,
    });

    if (!stateIntent.ok) {
      return workspaceGatewayErrorResponse(stateIntent.error, stateIntent.status);
    }

    return sidecarOperationResponse({ authorization, operation, request });
  }

  return workspaceGatewayNotFoundResponse();
}

export async function startWorkspaceGatewaySidecar(
  input: {
    env?: WorkspaceGatewaySidecarExecutionEnv;
    workspaceRoot: string;
  },
  dependencies: WorkspaceGatewaySidecarDependencies,
): Promise<WorkspaceGatewaySidecar> {
  const proxyToken = dependencies.createProxyToken();
  const sidecarEnv = createWorkspaceGatewaySidecarExecutionEnv({
    env: input.env,
    proxyToken,
    workspaceRoot: input.workspaceRoot,
  });
  const server = createServer((req, res) => {
    void createWorkspaceGatewaySidecarNodeHandler(sidecarEnv, dependencies.operations)(req, res);
  });
  const endpoint = await listenWorkspaceGatewaySidecar(server);

  return {
    close: () => closeWorkspaceGatewaySidecar(server),
    endpoint,
    proxyToken,
  };
}

export function createWorkspaceGatewaySidecarExecutionEnv(input: {
  env?: WorkspaceGatewaySidecarExecutionEnv;
  proxyToken: string;
  workspaceRoot: string;
}): WorkspaceGatewaySidecarExecutionEnv {
  return {
    ...(input.env?.FORMLESS_ADMIN_TOKEN === undefined
      ? {}
      : { FORMLESS_ADMIN_TOKEN: input.env.FORMLESS_ADMIN_TOKEN }),
    [WORKSPACE_GATEWAY_ENABLED_ENV]: "1",
    [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: input.proxyToken,
    [WORKSPACE_GATEWAY_ROOT_ENV]: input.workspaceRoot,
  };
}

export function createWorkspaceGatewayLocalProxyMiddleware(
  env: WorkspaceGatewayLocalProxyEnv,
  dependencies: WorkspaceGatewayLocalProxyDependencies = {},
) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const request = await nodeRequestFromIncomingMessage(req);
    const response = await handleWorkspaceGatewayLocalProxyRequest(request, env, dependencies);

    if (!response) {
      next();
      return;
    }

    await sendNodeResponse(res, response);
  };
}

export function createWorkspaceGatewaySidecarNodeHandler(
  env: WorkspaceGatewaySidecarExecutionEnv,
  handlers: WorkspaceGatewaySidecarOperationHandlers,
) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const request = await nodeRequestFromIncomingMessage(req);
    const response =
      (await handleWorkspaceGatewaySidecarRequest(request, env, handlers)) ??
      workspaceGatewayNotFoundResponse();

    await sendNodeResponse(res, response);
  };
}

export function workspaceGatewayProxyTargetFromEnv(
  request: Request,
  env: WorkspaceGatewayLocalProxyEnv,
  dependencies: Pick<WorkspaceGatewayLocalProxyDependencies, "routeAvailable"> = {},
): WorkspaceGatewayProxyTarget | undefined {
  if (env[WORKSPACE_GATEWAY_ENABLED_ENV] !== "1") {
    return undefined;
  }

  const routeAvailable =
    typeof dependencies.routeAvailable === "function"
      ? dependencies.routeAvailable(request)
      : dependencies.routeAvailable !== false;

  if (!routeAvailable) {
    return undefined;
  }

  const endpoint = env[WORKSPACE_GATEWAY_SIDECAR_URL_ENV]?.trim();
  const proxyToken = localProxyToken(env);

  if (!endpoint || !proxyToken || !isLoopbackSidecarEndpoint(endpoint)) {
    return undefined;
  }

  return { endpoint, proxyToken };
}

export function workspaceGatewaySidecarRoot(
  env: WorkspaceGatewaySidecarExecutionEnv,
): string | undefined {
  if (env[WORKSPACE_GATEWAY_ENABLED_ENV] !== "1") {
    return undefined;
  }

  const workspaceRoot = env[WORKSPACE_GATEWAY_ROOT_ENV]?.trim();

  return workspaceRoot ? path.resolve(workspaceRoot) : undefined;
}

function proxyRulesEnvFromLocalProxyEnv(
  env: WorkspaceGatewayLocalProxyEnv,
): WorkspaceGatewayProxyRulesEnv {
  return {
    adminToken: env.FORMLESS_ADMIN_TOKEN,
    bootstrapToken: env[WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV],
    csrfToken: env[WORKSPACE_GATEWAY_CSRF_TOKEN_ENV],
  };
}

function authorizeSidecarGatewayRequest(
  request: Request,
  env: WorkspaceGatewaySidecarExecutionEnv,
  intent: Parameters<typeof authorizeWorkspaceGatewaySidecarExecutionRequest>[2],
  context: WorkspaceGatewaySidecarExecutionContext = {},
) {
  return authorizeWorkspaceGatewaySidecarExecutionRequest(
    request,
    sidecarExecutionAuthorizationEnvFromEnv(env),
    intent,
    context,
  );
}

function authorizeSidecarGatewayReadOperationRequest(
  request: Request,
  env: WorkspaceGatewaySidecarExecutionEnv,
  intent?: Parameters<typeof authorizeWorkspaceGatewaySidecarExecutionReadRequest>[2],
) {
  return authorizeWorkspaceGatewaySidecarExecutionReadRequest(
    request,
    sidecarExecutionAuthorizationEnvFromEnv(env),
    intent,
  );
}

function sidecarOperationResponse(input: {
  authorization: WorkspaceGatewaySidecarExecutionAuthorization;
  operation: unknown;
  request: Request;
}): Response {
  return workspaceGatewayOperationResponse({
    authorization: input.authorization,
    env: {},
    operation: input.operation,
    request: input.request,
  });
}

async function parseGatewayStartInput(request: {
  json: () => Promise<unknown>;
}): Promise<WorkspaceGatewayStartInputParseResult> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return { error: "Workspace gateway operation request must be JSON.", ok: false };
  }

  return parseWorkspaceGatewayStartInput(body);
}

async function parseGatewayAutoSaveEnqueueInput(request: { json: () => Promise<unknown> }) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return { error: "Workspace auto-save enqueue request must be JSON.", ok: false } as const;
  }

  return parseWorkspaceGatewayAutoSaveEnqueueInput(body);
}

function localProxyToken(env: WorkspaceGatewayLocalProxyEnv): string | undefined {
  const proxyToken = env[WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]?.trim();

  return proxyToken ? proxyToken : undefined;
}

function sidecarExecutionAuthorizationEnvFromEnv(
  env: WorkspaceGatewaySidecarExecutionEnv,
): WorkspaceGatewaySidecarExecutionAuthorizationEnv {
  return {
    adminToken: env.FORMLESS_ADMIN_TOKEN,
    proxyToken: env[WORKSPACE_GATEWAY_PROXY_TOKEN_ENV],
  };
}

async function listenWorkspaceGatewaySidecar(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    const rejectOnError = (error: Error) => {
      reject(error);
    };

    server.once("error", rejectOnError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectOnError);
      resolve();
    });
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Local workspace gateway sidecar did not bind to a TCP port.");
  }

  return `http://127.0.0.1:${address.port}`;
}

async function closeWorkspaceGatewaySidecar(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function nodeRequestFromIncomingMessage(req: IncomingMessage): Promise<Request> {
  const protocol =
    headerValue(req.headers["x-forwarded-proto"]) ??
    ((req.socket as { encrypted?: boolean }).encrypted ? "https" : "http");
  const host = headerValue(req.headers.host) ?? "localhost";
  const url = new URL(req.url ?? "/", `${protocol}://${host}`);
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else if (value !== undefined) {
      headers.append(key, value);
    }
  }

  if (req.method === "GET" || req.method === "HEAD") {
    return new Request(url, { headers, method: req.method });
  }

  const body = await readIncomingBody(req);

  return new Request(url, {
    body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
    headers,
    method: req.method,
  });
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function readIncomingBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function sendNodeResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status;

  for (const [key, value] of response.headers) {
    res.setHeader(key, value);
  }

  res.end(Buffer.from(await response.arrayBuffer()));
}
