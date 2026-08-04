import {
  WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_CSRF_TOKEN_ENV,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
} from "./index.ts";
import {
  handleWorkspaceGatewayProxyRulesRequest,
  isLoopbackSidecarEndpoint,
  type WorkspaceGatewayProxyRulesEnv,
  type WorkspaceGatewayProxyRulesOwnerSessionValidationResult,
  type WorkspaceGatewayProxyRulesTarget,
} from "./proxy-rules.ts";
import type { WorkspaceOperationRequiredCapability } from "@dpeek/formless-workspace";

export {
  WORKSPACE_GATEWAY_ACTOR_HEADER,
  WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER,
  WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH,
  WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  WORKSPACE_GATEWAY_CSRF_COOKIE_NAME,
  WORKSPACE_GATEWAY_CSRF_HEADER,
  WORKSPACE_GATEWAY_INTENT_HEADER,
  WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER,
  WORKSPACE_GATEWAY_PUSHES_API_PATH,
} from "./index.ts";
export type { WorkspaceGatewayPush, WorkspaceGatewayPushStartInput } from "./index.ts";

export type WorkspaceGatewayWorkerProxyEnv = {
  FORMLESS_ADMIN_TOKEN?: string;
  FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN?: string;
  FORMLESS_WORKSPACE_GATEWAY_CSRF_TOKEN?: string;
  FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN?: string;
  FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL?: string;
};

export type WorkspaceGatewayProxyConfig = WorkspaceGatewayProxyRulesTarget;

export type WorkspaceGatewayOwnerSessionValidationResult =
  WorkspaceGatewayProxyRulesOwnerSessionValidationResult;

export type WorkspaceGatewayProxyDependencies = {
  capabilities?: readonly WorkspaceOperationRequiredCapability[];
  fetch?: typeof fetch;
  readOwnerSetupStatus?: (request: Request) => Promise<{ setupComplete: boolean }>;
  validateOwnerSession?: (
    request: Request,
  ) =>
    | Promise<WorkspaceGatewayOwnerSessionValidationResult>
    | WorkspaceGatewayOwnerSessionValidationResult;
};

export type WorkspaceGatewayProxyOptions = WorkspaceGatewayProxyDependencies & {
  routeAvailable?: boolean;
};

export async function handleWorkspaceGatewayProxyRequest(
  request: Request,
  env: WorkspaceGatewayWorkerProxyEnv,
  options: WorkspaceGatewayProxyOptions = {},
): Promise<Response | undefined> {
  return handleWorkspaceGatewayProxyRulesRequest(request, proxyRulesEnvFromWorkerEnv(env), {
    capabilities: options.capabilities ?? [],
    fetch: options.fetch,
    proxyTarget: () => workspaceGatewayProxyConfigFromEnv(env),
    readOwnerSetupStatus: options.readOwnerSetupStatus,
    routeAvailable: options.routeAvailable,
    validateOwnerSession: options.validateOwnerSession,
  });
}

export function workspaceGatewayProxyConfigFromEnv(
  env: WorkspaceGatewayWorkerProxyEnv,
): WorkspaceGatewayProxyConfig | undefined {
  const endpoint = env[WORKSPACE_GATEWAY_SIDECAR_URL_ENV]?.trim();
  const proxyToken = env[WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]?.trim();

  if (!endpoint || !proxyToken || !isLoopbackSidecarEndpoint(endpoint)) {
    return undefined;
  }

  return { endpoint, proxyToken };
}

function proxyRulesEnvFromWorkerEnv(
  env: WorkspaceGatewayWorkerProxyEnv,
): WorkspaceGatewayProxyRulesEnv {
  return {
    adminToken: env.FORMLESS_ADMIN_TOKEN,
    bootstrapToken: env[WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV],
    csrfToken: env[WORKSPACE_GATEWAY_CSRF_TOKEN_ENV],
  };
}
