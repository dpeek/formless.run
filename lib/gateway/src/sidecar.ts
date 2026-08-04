import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";

import { WORKSPACE_OPERATION_CAPABILITIES } from "@dpeek/formless-workspace";
import {
  WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH,
  WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_CSRF_TOKEN_ENV,
  WORKSPACE_GATEWAY_ENABLED_ENV,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_PUSHES_API_PATH,
  WORKSPACE_GATEWAY_ROOT_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
  WORKSPACE_GATEWAY_STATUS_API_PATH,
  isWorkspaceGatewayPath,
  parseWorkspaceGatewayAccountSelectionInput,
  parseWorkspaceGatewayAutoSaveEnqueueInput,
  parseWorkspaceGatewayPushPath,
  parseWorkspaceGatewayPushStartInput,
  workspaceGatewayAutoSaveEnqueueIntent,
  workspaceGatewayInteractionSubmitIntent,
  workspaceGatewayPushReadIntent,
  workspaceGatewayPushStartIntent,
  workspaceGatewayStatusIntent,
  type WorkspaceGatewayAutoSaveEnqueueInput,
  type WorkspaceGatewayPushHandler,
} from "./index.ts";
import {
  handleWorkspaceGatewayProxyRulesRequest,
  isLoopbackSidecarEndpoint,
  type WorkspaceGatewayProxyRulesEnv,
  type WorkspaceGatewayProxyRulesOwnerSessionValidationResult,
  type WorkspaceGatewayProxyRulesTarget,
} from "./proxy-rules.ts";
import {
  createWorkspaceGatewayPushRegistry,
  WorkspaceGatewayRegistryError,
  type WorkspaceGatewayPushRegistry,
  type WorkspaceGatewayPushRegistryDependencies,
} from "./push-registry.ts";
import {
  workspaceGatewayEmptySuccessResponse,
  workspaceGatewayErrorResponse,
  workspaceGatewayMethodNotAllowedResponse,
  workspaceGatewayNotFoundResponse,
  workspaceGatewayPushResponse,
  workspaceGatewayStatusResponse,
} from "./response-safety.ts";
import {
  authorizeWorkspaceGatewaySidecarExecutionRequest,
  type WorkspaceGatewaySidecarExecutionAuthorization,
  type WorkspaceGatewaySidecarExecutionAuthorizationEnv,
} from "./sidecar-execution.ts";

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
  WORKSPACE_GATEWAY_INTENT_HEADER,
  WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_PUSHES_API_PATH,
  WORKSPACE_GATEWAY_ROOT_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
  WORKSPACE_GATEWAY_STATUS_API_PATH,
} from "./index.ts";
export type {
  WorkspaceGatewayActorFacts,
  WorkspaceGatewayAutoSaveEnqueueInput,
  WorkspaceGatewayPush,
  WorkspaceGatewayPushHandler,
  WorkspaceGatewayPushStartInput,
} from "./index.ts";
export {
  createWorkspaceGatewayPushRegistry,
  WorkspaceGatewayPushExecutionError,
  WorkspaceGatewayRegistryError,
  type WorkspaceGatewayPushRegistry,
  type WorkspaceGatewayPushRegistryDependencies,
} from "./push-registry.ts";
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
export type WorkspaceGatewaySidecarHandlers = {
  enqueueAutoSave: (input: {
    authorization: WorkspaceGatewaySidecarAuthorization;
    enqueue: WorkspaceGatewayAutoSaveEnqueueInput;
    workspaceRoot: string;
  }) => Promise<void>;
  push: WorkspaceGatewayPushHandler;
};
export type WorkspaceGatewaySidecarDependencies = {
  createProxyToken: () => string;
  handlers: WorkspaceGatewaySidecarHandlers;
  registry?: Omit<WorkspaceGatewayPushRegistryDependencies, "executePush">;
};
export type WorkspaceGatewaySidecarRuntime = {
  handlers: WorkspaceGatewaySidecarHandlers;
  registry: WorkspaceGatewayPushRegistry;
};

export type WorkspaceGatewayOwnerSessionValidationResult =
  WorkspaceGatewayProxyRulesOwnerSessionValidationResult;
export type WorkspaceGatewayLocalProxyDependencies = {
  capabilities?: readonly (typeof WORKSPACE_OPERATION_CAPABILITIES)[number][];
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

export function createWorkspaceGatewaySidecarRuntime(
  handlers: WorkspaceGatewaySidecarHandlers,
  dependencies: Omit<WorkspaceGatewayPushRegistryDependencies, "executePush"> = {},
): WorkspaceGatewaySidecarRuntime {
  return {
    handlers,
    registry: createWorkspaceGatewayPushRegistry({ ...dependencies, executePush: handlers.push }),
  };
}

export async function handleWorkspaceGatewayLocalProxyRequest(
  request: Request,
  env: WorkspaceGatewayLocalProxyEnv,
  dependencies: WorkspaceGatewayLocalProxyDependencies = {},
): Promise<Response | undefined> {
  return handleWorkspaceGatewayProxyRulesRequest(request, proxyRulesEnv(env), {
    capabilities: dependencies.capabilities ?? WORKSPACE_OPERATION_CAPABILITIES,
    fetch: dependencies.proxyFetch,
    proxyTarget: () => workspaceGatewayProxyTargetFromEnv(request, env),
    readOwnerSetupStatus: dependencies.readOwnerSetupStatus,
    routeAvailable: dependencies.routeAvailable,
    validateOwnerSession: dependencies.validateOwnerSession,
  });
}

export async function handleWorkspaceGatewaySidecarRequest(
  request: Request,
  env: WorkspaceGatewaySidecarExecutionEnv,
  runtime: WorkspaceGatewaySidecarRuntime,
): Promise<Response | undefined> {
  const pathname = new URL(request.url).pathname;
  if (!isWorkspaceGatewayPath(pathname)) return undefined;
  const workspaceRoot = workspaceGatewaySidecarRoot(env);
  if (!workspaceRoot) return workspaceGatewayNotFoundResponse();

  try {
    if (pathname === WORKSPACE_GATEWAY_STATUS_API_PATH) {
      if (request.method !== "GET") return workspaceGatewayMethodNotAllowedResponse(["GET"]);
      const authorization = authorize(request, env, workspaceGatewayStatusIntent());
      if ("code" in authorization) return workspaceGatewayErrorResponse(authorization.code);
      return workspaceGatewayStatusResponse({
        currentPush: runtime.registry.current(),
        gateway: "available",
        latestPush: runtime.registry.latest(),
      });
    }

    if (pathname === WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH) {
      if (request.method !== "POST") return workspaceGatewayMethodNotAllowedResponse(["POST"]);
      const parsed = parseWorkspaceGatewayAutoSaveEnqueueInput(await readJson(request));
      if (!parsed.ok) return workspaceGatewayErrorResponse(parsed.code);
      const authorization = authorize(request, env, workspaceGatewayAutoSaveEnqueueIntent());
      if ("code" in authorization) return workspaceGatewayErrorResponse(authorization.code);
      await runtime.handlers.enqueueAutoSave({
        authorization,
        enqueue: parsed.input,
        workspaceRoot,
      });
      return workspaceGatewayEmptySuccessResponse();
    }

    if (pathname === WORKSPACE_GATEWAY_PUSHES_API_PATH) {
      if (request.method !== "POST") return workspaceGatewayMethodNotAllowedResponse(["POST"]);
      const parsed = parseWorkspaceGatewayPushStartInput(await readJson(request));
      if (!parsed.ok) return workspaceGatewayErrorResponse(parsed.code);
      const authorization = authorize(request, env, workspaceGatewayPushStartIntent(parsed.input));
      if ("code" in authorization) return workspaceGatewayErrorResponse(authorization.code);
      return workspaceGatewayPushResponse(
        runtime.registry.start({ authorization, push: parsed.input, workspaceRoot }),
      );
    }

    const pathMatch = parseWorkspaceGatewayPushPath(pathname);
    if (pathMatch?.kind === "push") {
      if (request.method !== "GET") return workspaceGatewayMethodNotAllowedResponse(["GET"]);
      const authorization = authorize(request, env, workspaceGatewayPushReadIntent());
      if ("code" in authorization) return workspaceGatewayErrorResponse(authorization.code);
      const push = runtime.registry.read(pathMatch.pushId);
      return push
        ? workspaceGatewayPushResponse(push)
        : workspaceGatewayErrorResponse("push-not-found");
    }
    if (pathMatch?.kind === "interaction") {
      if (request.method !== "POST") return workspaceGatewayMethodNotAllowedResponse(["POST"]);
      const parsed = parseWorkspaceGatewayAccountSelectionInput(await readJson(request));
      if (!parsed.ok) return workspaceGatewayErrorResponse(parsed.code);
      const authorization = authorize(request, env, workspaceGatewayInteractionSubmitIntent());
      if ("code" in authorization) return workspaceGatewayErrorResponse(authorization.code);
      return workspaceGatewayPushResponse(
        runtime.registry.submitAccountSelection({
          accountId: parsed.input.accountId,
          interactionId: pathMatch.interactionId,
          pushId: pathMatch.pushId,
        }),
      );
    }
    return pathname.startsWith(`${WORKSPACE_GATEWAY_PUSHES_API_PATH}/`)
      ? workspaceGatewayErrorResponse("invalid-request")
      : workspaceGatewayNotFoundResponse();
  } catch (error) {
    if (error instanceof WorkspaceGatewayRegistryError) {
      return workspaceGatewayErrorResponse(error.code);
    }
    return workspaceGatewayErrorResponse("gateway-unavailable");
  }
}

export async function startWorkspaceGatewaySidecar(
  input: { env?: WorkspaceGatewaySidecarExecutionEnv; workspaceRoot: string },
  dependencies: WorkspaceGatewaySidecarDependencies,
): Promise<WorkspaceGatewaySidecar> {
  const proxyToken = dependencies.createProxyToken();
  const env = createWorkspaceGatewaySidecarExecutionEnv({
    env: input.env,
    proxyToken,
    workspaceRoot: input.workspaceRoot,
  });
  const runtime = createWorkspaceGatewaySidecarRuntime(
    dependencies.handlers,
    dependencies.registry,
  );
  const server = createServer((req, res) => {
    void createWorkspaceGatewaySidecarNodeHandler(env, runtime)(req, res);
  });
  const endpoint = await listen(server);
  return { close: () => close(server), endpoint, proxyToken };
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
    const response = await handleWorkspaceGatewayLocalProxyRequest(
      await nodeRequest(req),
      env,
      dependencies,
    );
    if (!response) return next();
    await sendNodeResponse(res, response);
  };
}

export function createWorkspaceGatewaySidecarNodeHandler(
  env: WorkspaceGatewaySidecarExecutionEnv,
  runtime: WorkspaceGatewaySidecarRuntime,
) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const response =
      (await handleWorkspaceGatewaySidecarRequest(await nodeRequest(req), env, runtime)) ??
      workspaceGatewayNotFoundResponse();
    await sendNodeResponse(res, response);
  };
}

export function workspaceGatewayProxyTargetFromEnv(
  request: Request,
  env: WorkspaceGatewayLocalProxyEnv,
  dependencies: Pick<WorkspaceGatewayLocalProxyDependencies, "routeAvailable"> = {},
): WorkspaceGatewayProxyTarget | undefined {
  if (env[WORKSPACE_GATEWAY_ENABLED_ENV] !== "1") return undefined;
  const routeAvailable =
    typeof dependencies.routeAvailable === "function"
      ? dependencies.routeAvailable(request)
      : dependencies.routeAvailable !== false;
  const endpoint = env[WORKSPACE_GATEWAY_SIDECAR_URL_ENV]?.trim();
  const proxyToken = env[WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]?.trim();
  return routeAvailable && endpoint && proxyToken && isLoopbackSidecarEndpoint(endpoint)
    ? { endpoint, proxyToken }
    : undefined;
}

export function workspaceGatewaySidecarRoot(
  env: WorkspaceGatewaySidecarExecutionEnv,
): string | undefined {
  const root = env[WORKSPACE_GATEWAY_ROOT_ENV]?.trim();
  return env[WORKSPACE_GATEWAY_ENABLED_ENV] === "1" && root ? path.resolve(root) : undefined;
}

function proxyRulesEnv(env: WorkspaceGatewayLocalProxyEnv): WorkspaceGatewayProxyRulesEnv {
  return {
    adminToken: env.FORMLESS_ADMIN_TOKEN,
    bootstrapToken: env[WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV],
    csrfToken: env[WORKSPACE_GATEWAY_CSRF_TOKEN_ENV],
  };
}

function authorize(
  request: Request,
  env: WorkspaceGatewaySidecarExecutionEnv,
  intent: Parameters<typeof authorizeWorkspaceGatewaySidecarExecutionRequest>[2],
) {
  return authorizeWorkspaceGatewaySidecarExecutionRequest(request, authorizationEnv(env), intent);
}

function authorizationEnv(
  env: WorkspaceGatewaySidecarExecutionEnv,
): WorkspaceGatewaySidecarExecutionAuthorizationEnv {
  return {
    adminToken: env.FORMLESS_ADMIN_TOKEN,
    proxyToken: env[WORKSPACE_GATEWAY_PROXY_TOKEN_ENV],
  };
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Gateway sidecar did not bind.");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING")
        reject(error);
      else resolve();
    });
  });
}

async function nodeRequest(req: IncomingMessage): Promise<Request> {
  const protocol =
    headerValue(req.headers["x-forwarded-proto"]) ??
    ((req.socket as { encrypted?: boolean }).encrypted ? "https" : "http");
  const host = headerValue(req.headers.host) ?? "localhost";
  const url = new URL(req.url ?? "/", `${protocol}://${host}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
    else if (value !== undefined) headers.append(key, value);
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
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function sendNodeResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  for (const [key, value] of response.headers) res.setHeader(key, value);
  res.end(Buffer.from(await response.arrayBuffer()));
}
