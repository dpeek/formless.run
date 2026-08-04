import { WORKSPACE_OPERATION_CAPABILITIES } from "@dpeek/formless-workspace";
import {
  WORKSPACE_GATEWAY_ACTOR_HEADER,
  WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER,
  WORKSPACE_GATEWAY_INTENT_HEADER,
  WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER,
  workspaceGatewayIntentAllowed,
  type WorkspaceGatewayActorFacts,
  type WorkspaceGatewayIntent,
} from "./index.ts";

export type WorkspaceGatewaySidecarExecutionAuthorization = WorkspaceGatewayActorFacts;
export type WorkspaceGatewaySidecarExecutionAuthorizationEnv = {
  adminToken?: string;
  proxyToken?: string;
};
export type WorkspaceGatewaySidecarExecutionAuthorizationResult =
  | WorkspaceGatewaySidecarExecutionAuthorization
  | { code: "forbidden" | "invalid-request" | "unauthorized" };

export function authorizeWorkspaceGatewaySidecarExecutionRequest(
  request: Request,
  env: WorkspaceGatewaySidecarExecutionAuthorizationEnv,
  intent: WorkspaceGatewayIntent,
): WorkspaceGatewaySidecarExecutionAuthorizationResult {
  const proxied = authorizeProxy(request, env, intent);
  if (proxied) return proxied;
  if (request.headers.get("Origin") === null && matchesAdminBearer(request, env)) {
    return authorizeIntent({ actor: "automation", via: "admin-bearer" }, intent);
  }
  return { code: "unauthorized" };
}

function authorizeProxy(
  request: Request,
  env: WorkspaceGatewaySidecarExecutionAuthorizationEnv,
  intent: WorkspaceGatewayIntent,
): WorkspaceGatewaySidecarExecutionAuthorizationResult | undefined {
  const token = request.headers.get(WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER);
  if (token === null) return undefined;
  if (!env.proxyToken?.trim() || token !== env.proxyToken.trim()) return { code: "unauthorized" };
  if (request.headers.get(WORKSPACE_GATEWAY_INTENT_HEADER) !== intent.kind) {
    return { code: "invalid-request" };
  }
  const actor = request.headers.get(WORKSPACE_GATEWAY_ACTOR_HEADER);
  const via = request.headers.get(WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER);
  if (!isActor(actor) || !isVia(via) || !validActorVia(actor, via)) {
    return { code: "invalid-request" };
  }
  return authorizeIntent({ actor, via }, intent);
}

function authorizeIntent(
  authorization: WorkspaceGatewaySidecarExecutionAuthorization,
  intent: WorkspaceGatewayIntent,
): WorkspaceGatewaySidecarExecutionAuthorizationResult {
  if (authorization.via === "bootstrap" && !intent.bootstrapAllowed) return { code: "forbidden" };
  return workspaceGatewayIntentAllowed({
    actor: authorization.actor,
    capabilities: WORKSPACE_OPERATION_CAPABILITIES,
    intent,
  })
    ? authorization
    : { code: "forbidden" };
}

function matchesAdminBearer(
  request: Request,
  env: WorkspaceGatewaySidecarExecutionAuthorizationEnv,
): boolean {
  const expected = env.adminToken?.trim();
  return Boolean(
    expected && request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] === expected,
  );
}

function isActor(value: unknown): value is WorkspaceGatewayActorFacts["actor"] {
  return value === "automation" || value === "browser" || value === "cli" || value === "system";
}

function isVia(value: unknown): value is WorkspaceGatewayActorFacts["via"] {
  return value === "admin-bearer" || value === "bootstrap" || value === "owner-session";
}

function validActorVia(
  actor: WorkspaceGatewayActorFacts["actor"],
  via: WorkspaceGatewayActorFacts["via"],
): boolean {
  return via === "admin-bearer" ? actor !== "browser" : actor === "browser";
}
