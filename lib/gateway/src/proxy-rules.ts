import type { WorkspaceOperationRequiredCapability } from "@dpeek/formless-workspace";
import {
  WORKSPACE_GATEWAY_ACTOR_HEADER,
  WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER,
  WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH,
  WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  WORKSPACE_GATEWAY_CSRF_COOKIE_NAME,
  WORKSPACE_GATEWAY_CSRF_HEADER,
  WORKSPACE_GATEWAY_INTENT_HEADER,
  WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER,
  WORKSPACE_GATEWAY_PUSHES_API_PATH,
  WORKSPACE_GATEWAY_STATUS_API_PATH,
  isWorkspaceGatewayPath,
  parseWorkspaceGatewayAccountSelectionInput,
  parseWorkspaceGatewayAutoSaveEnqueueInput,
  parseWorkspaceGatewayPushPath,
  parseWorkspaceGatewayPushStartInput,
  workspaceGatewayAutoSaveEnqueueIntent,
  workspaceGatewayIntentAllowed,
  workspaceGatewayInteractionSubmitIntent,
  workspaceGatewayPushReadIntent,
  workspaceGatewayPushStartIntent,
  workspaceGatewayStatusIntent,
  type WorkspaceGatewayActor,
  type WorkspaceGatewayAuthorizationVia,
  type WorkspaceGatewayIntent,
} from "./index.ts";
import {
  workspaceGatewayErrorResponse,
  workspaceGatewayMethodNotAllowedResponse,
  workspaceGatewayNotFoundResponse,
  workspaceGatewaySafeSidecarResponse,
  workspaceGatewaySidecarUnavailableResponse,
  type WorkspaceGatewayResponseKind,
} from "./response-safety.ts";

export type WorkspaceGatewayProxyRulesEnv = {
  adminToken?: string;
  bootstrapToken?: string;
  csrfToken?: string;
};
export type WorkspaceGatewayProxyRulesTarget = { endpoint: string; proxyToken: string };
export type WorkspaceGatewayProxyRulesAuthorization = {
  actor: WorkspaceGatewayActor;
  via: WorkspaceGatewayAuthorizationVia;
};
export type WorkspaceGatewayProxyRulesOwnerSessionValidationResult =
  | { ok: true }
  | { ok: false; reason?: string };
export type WorkspaceGatewayProxyRulesDependencies = {
  capabilities: readonly WorkspaceOperationRequiredCapability[];
  fetch?: typeof fetch;
  proxyTarget: () => WorkspaceGatewayProxyRulesTarget | undefined;
  readOwnerSetupStatus?: (request: Request) => Promise<{ setupComplete: boolean }>;
  routeAvailable?: boolean | ((request: Request) => boolean);
  validateOwnerSession?: (
    request: Request,
  ) =>
    | Promise<WorkspaceGatewayProxyRulesOwnerSessionValidationResult>
    | WorkspaceGatewayProxyRulesOwnerSessionValidationResult;
};

type ClassifiedRequest = {
  intent: WorkspaceGatewayIntent;
  responseKind: WorkspaceGatewayResponseKind;
};

export async function handleWorkspaceGatewayProxyRulesRequest(
  request: Request,
  env: WorkspaceGatewayProxyRulesEnv,
  dependencies: WorkspaceGatewayProxyRulesDependencies,
): Promise<Response | undefined> {
  const pathname = new URL(request.url).pathname;
  if (!isWorkspaceGatewayPath(pathname)) return undefined;
  const routeAvailable =
    typeof dependencies.routeAvailable === "function"
      ? dependencies.routeAvailable(request)
      : dependencies.routeAvailable !== false;
  if (!routeAvailable) return workspaceGatewayNotFoundResponse();

  const classified = await classifyGatewayRequest(request);
  if (classified instanceof Response) return classified;
  const target = dependencies.proxyTarget();
  if (!target) return workspaceGatewaySidecarUnavailableResponse();
  const authorization = await authorizeGatewayRequest(
    request,
    env,
    dependencies,
    classified.intent,
  );
  if (authorization instanceof Response) return authorization;
  return proxyWorkspaceGatewayRequest(
    request,
    env,
    dependencies,
    target,
    authorization,
    classified,
  );
}

export function isLoopbackSidecarEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

async function classifyGatewayRequest(request: Request): Promise<ClassifiedRequest | Response> {
  const pathname = new URL(request.url).pathname;
  if (pathname === WORKSPACE_GATEWAY_STATUS_API_PATH) {
    return request.method === "GET"
      ? { intent: workspaceGatewayStatusIntent(), responseKind: "status" }
      : workspaceGatewayMethodNotAllowedResponse(["GET"]);
  }
  if (pathname === WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH) {
    if (request.method !== "POST") return workspaceGatewayMethodNotAllowedResponse(["POST"]);
    const body = await readJson(request.clone());
    if (!parseWorkspaceGatewayAutoSaveEnqueueInput(body).ok) {
      return workspaceGatewayErrorResponse("invalid-request");
    }
    return { intent: workspaceGatewayAutoSaveEnqueueIntent(), responseKind: "empty" };
  }
  if (pathname === WORKSPACE_GATEWAY_PUSHES_API_PATH) {
    if (request.method !== "POST") return workspaceGatewayMethodNotAllowedResponse(["POST"]);
    const parsed = parseWorkspaceGatewayPushStartInput(await readJson(request.clone()));
    return parsed.ok
      ? { intent: workspaceGatewayPushStartIntent(parsed.input), responseKind: "push" }
      : workspaceGatewayErrorResponse(parsed.code);
  }
  const path = parseWorkspaceGatewayPushPath(pathname);
  if (path?.kind === "push") {
    return request.method === "GET"
      ? { intent: workspaceGatewayPushReadIntent(), responseKind: "push" }
      : workspaceGatewayMethodNotAllowedResponse(["GET"]);
  }
  if (path?.kind === "interaction") {
    if (request.method !== "POST") return workspaceGatewayMethodNotAllowedResponse(["POST"]);
    const parsed = parseWorkspaceGatewayAccountSelectionInput(await readJson(request.clone()));
    return parsed.ok
      ? { intent: workspaceGatewayInteractionSubmitIntent(), responseKind: "push" }
      : workspaceGatewayErrorResponse(parsed.code);
  }
  return pathname.startsWith(`${WORKSPACE_GATEWAY_PUSHES_API_PATH}/`)
    ? workspaceGatewayErrorResponse("invalid-request")
    : workspaceGatewayNotFoundResponse();
}

async function authorizeGatewayRequest(
  request: Request,
  env: WorkspaceGatewayProxyRulesEnv,
  dependencies: WorkspaceGatewayProxyRulesDependencies,
  intent: WorkspaceGatewayIntent,
): Promise<WorkspaceGatewayProxyRulesAuthorization | Response> {
  if (!isSameOriginOrNoOrigin(request)) return workspaceGatewayErrorResponse("forbidden");
  if (!request.headers.get("Origin") && matchesAdminBearer(request, env)) {
    return authorizeIntent({ actor: "automation", via: "admin-bearer" }, dependencies, intent);
  }

  const owner = await validateOwnerSession(request, dependencies);
  if (owner.ok) {
    if (intent.mutating && !isSameOriginWithOrigin(request)) {
      return workspaceGatewayErrorResponse("forbidden");
    }
    if (intent.mutating && !validCsrfProof(request, env)) {
      return workspaceGatewayErrorResponse("csrf-invalid");
    }
    return authorizeIntent({ actor: "browser", via: "owner-session" }, dependencies, intent);
  }

  if (matchesBootstrapCapability(request, env)) {
    if (!intent.bootstrapAllowed) return workspaceGatewayErrorResponse("forbidden");
    if (await ownerSetupComplete(request, dependencies)) {
      return workspaceGatewayErrorResponse("bootstrap-expired");
    }
    return authorizeIntent({ actor: "browser", via: "bootstrap" }, dependencies, intent);
  }

  return workspaceGatewayErrorResponse("unauthorized");
}

function authorizeIntent(
  authorization: WorkspaceGatewayProxyRulesAuthorization,
  dependencies: Pick<WorkspaceGatewayProxyRulesDependencies, "capabilities">,
  intent: WorkspaceGatewayIntent,
): WorkspaceGatewayProxyRulesAuthorization | Response {
  return workspaceGatewayIntentAllowed({
    actor: authorization.actor,
    capabilities: dependencies.capabilities,
    intent,
  })
    ? authorization
    : workspaceGatewayErrorResponse("forbidden");
}

async function proxyWorkspaceGatewayRequest(
  request: Request,
  env: WorkspaceGatewayProxyRulesEnv,
  dependencies: WorkspaceGatewayProxyRulesDependencies,
  target: WorkspaceGatewayProxyRulesTarget,
  authorization: WorkspaceGatewayProxyRulesAuthorization,
  classified: ClassifiedRequest,
): Promise<Response> {
  let response: Response;
  try {
    response = await (dependencies.fetch ?? fetch)(sidecarRequestUrl(request, target), {
      body: await proxyRequestBody(request),
      headers: proxyHeaders(request, target, authorization, classified.intent),
      method: request.method,
    });
  } catch {
    return workspaceGatewaySidecarUnavailableResponse();
  }
  return workspaceGatewaySafeSidecarResponse({
    authorization,
    env,
    kind: classified.responseKind,
    request,
    response,
  });
}

function proxyHeaders(
  request: Request,
  target: WorkspaceGatewayProxyRulesTarget,
  authorization: WorkspaceGatewayProxyRulesAuthorization,
  intent: WorkspaceGatewayIntent,
): Headers {
  const headers = new Headers({ Accept: "application/json" });
  const contentType = request.headers.get("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);
  headers.set(WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER, target.proxyToken);
  headers.set(WORKSPACE_GATEWAY_ACTOR_HEADER, authorization.actor);
  headers.set(WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER, authorization.via);
  headers.set(WORKSPACE_GATEWAY_INTENT_HEADER, intent.kind);
  return headers;
}

function matchesBootstrapCapability(request: Request, env: WorkspaceGatewayProxyRulesEnv): boolean {
  const expected = env.bootstrapToken?.trim();
  return Boolean(expected && request.headers.get(WORKSPACE_GATEWAY_BOOTSTRAP_HEADER) === expected);
}

function matchesAdminBearer(request: Request, env: WorkspaceGatewayProxyRulesEnv): boolean {
  const expected = env.adminToken?.trim();
  return Boolean(
    expected && request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] === expected,
  );
}

function validCsrfProof(request: Request, env: WorkspaceGatewayProxyRulesEnv): boolean {
  const expected = env.csrfToken?.trim();
  return Boolean(
    expected &&
    request.headers.get(WORKSPACE_GATEWAY_CSRF_HEADER) === expected &&
    requestCookie(request, WORKSPACE_GATEWAY_CSRF_COOKIE_NAME) === expected,
  );
}

async function ownerSetupComplete(
  request: Request,
  dependencies: WorkspaceGatewayProxyRulesDependencies,
): Promise<boolean> {
  return dependencies.readOwnerSetupStatus
    ? (await dependencies.readOwnerSetupStatus(request)).setupComplete
    : false;
}

async function validateOwnerSession(
  request: Request,
  dependencies: WorkspaceGatewayProxyRulesDependencies,
): Promise<WorkspaceGatewayProxyRulesOwnerSessionValidationResult> {
  return dependencies.validateOwnerSession
    ? dependencies.validateOwnerSession(request)
    : { ok: false, reason: "missing-validator" };
}

function sidecarRequestUrl(request: Request, target: WorkspaceGatewayProxyRulesTarget): string {
  const url = new URL(request.url);
  return new URL(`${url.pathname}${url.search}`, target.endpoint).toString();
}

async function proxyRequestBody(request: Request): Promise<ArrayBuffer | undefined> {
  return request.method === "GET" || request.method === "HEAD" ? undefined : request.arrayBuffer();
}

async function readJson(request: { json(): Promise<unknown> }): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function isSameOriginOrNoOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return origin === null || origin === browserFacingRequestOrigin(request);
}

function isSameOriginWithOrigin(request: Request): boolean {
  return request.headers.get("Origin") === browserFacingRequestOrigin(request);
}

function browserFacingRequestOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = firstForwardedHeaderValue(request.headers.get("x-forwarded-host"));
  if (forwardedHost) {
    const proto =
      firstForwardedHeaderValue(request.headers.get("x-forwarded-proto")) ??
      forwardedHeaderValue(request.headers.get("forwarded"), "proto") ??
      url.protocol.replace(/:$/, "");
    return `${proto}://${forwardedHost}`;
  }
  const standardHost = forwardedHeaderValue(request.headers.get("forwarded"), "host");
  if (!standardHost) return url.origin;
  const proto =
    forwardedHeaderValue(request.headers.get("forwarded"), "proto") ??
    url.protocol.replace(/:$/, "");
  return `${proto}://${standardHost}`;
}

function firstForwardedHeaderValue(value: string | null): string | undefined {
  const first = value?.split(",")[0]?.trim();
  return first ? unquote(first) : undefined;
}

function forwardedHeaderValue(value: string | null, key: "host" | "proto"): string | undefined {
  const first = firstForwardedHeaderValue(value);
  if (!first) return undefined;
  for (const part of first.split(";")) {
    const [candidateKey, candidateValue] = part.split("=", 2);
    if (candidateKey?.trim().toLowerCase() === key && candidateValue?.trim()) {
      return unquote(candidateValue.trim());
    }
  }
  return undefined;
}

function unquote(value: string): string {
  return value.replace(/^"|"$/g, "");
}

function requestCookie(request: Request, name: string): string | undefined {
  for (const part of request.headers.get("Cookie")?.split(";") ?? []) {
    const [candidate, ...value] = part.trim().split("=");
    if (candidate === name) return value.join("=");
  }
  return undefined;
}
