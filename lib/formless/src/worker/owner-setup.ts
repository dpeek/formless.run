import { instanceAuthError, type InstanceAuthErrorCode } from "../shared/instance-auth.ts";
import { parseOwnerSetupToken, type OwnerSetupStatusResponse } from "../shared/protocol.ts";
import { runtimeTopologyRoutes } from "../shared/runtime-topology.ts";
import { nowIsoString } from "../shared/clock.ts";
import { authorizeAdminWrite, type AuthorityAdminGuardEnv } from "./authority-admin-guard.ts";
import {
  hashOwnerSetupToken,
  readInstanceSetupState,
  resetInstanceSetupTables,
  writeOwnerSetupCapability,
  type WriteOwnerSetupCapabilityResult,
} from "./instance-setup-state.ts";
import { clearOwnerSessionCookie, validateOwnerSessionCookie } from "./owner-session.ts";
import {
  CENTRAL_AUTH_SESSION_COOKIE_NAME,
  clearCentralAuthSessionCookie,
  revokeCentralAuthSessionCookie,
  validateCentralAuthSessionCookie,
} from "./central-auth-session.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { readInstanceAuthConfig, resetInstanceAuthTables } from "./instance-auth-state.ts";
import { resetOwnerSetupEmailProofTables } from "./instance-auth-owner-setup-state.ts";
import {
  clearHostAuthSessionCookie,
  configuredInstanceAuthOrigin,
  hostAuthSessionTargetFromRequestHeaders,
  validateHostAuthSessionAuthorityInStorage,
} from "./instance-auth-handoff.ts";
import { isLocalOwnerSessionRuntime } from "./local-session-bootstrap.ts";
import { readIdentityOwner, resetIdentityOwner } from "./identity-control-plane.ts";
import {
  readInternalActiveIdentityPrincipal,
  type ActiveIdentityPrincipal,
} from "./identity-owner-internal.ts";
import { ownerSetupAdminOrigin } from "./owner-setup-continuation.ts";

export const OWNER_SETUP_API_PATH = "/api/formless/setup";
export const ACCOUNT_SESSION_API_PATH = "/api/formless/session";
export const INTERNAL_RESET_OWNER_SETUP_PATH = "/_internal/reset-owner-setup";
export const ACCOUNT_SESSION_LOGOUT_API_PATH = `${ACCOUNT_SESSION_API_PATH}/logout`;

const ownerSetupCapabilityPath = `${OWNER_SETUP_API_PATH}/capability`;

type OwnerSetupApiEnv = AuthorityAdminGuardEnv & {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
};

type OwnerSetupCapabilityRequest = {
  expiresAt?: string;
  setupToken: string;
};

export async function handleOwnerSetupApiRequest(
  request: Request,
  env: OwnerSetupApiEnv,
): Promise<Response | undefined> {
  if (!isOwnerSetupOrAccountApiPath(new URL(request.url).pathname)) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleOwnerSetupDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: OwnerSetupApiEnv,
): Promise<Response | undefined> {
  const pathname = new URL(request.url).pathname;

  if (pathname === INTERNAL_RESET_OWNER_SETUP_PATH) {
    if (request.method !== "POST") {
      return methodNotAllowedResponse("POST");
    }

    resetInstanceSetupTables(storage);
    resetInstanceAuthTables(storage);
    resetOwnerSetupEmailProofTables(storage);
    await resetIdentityOwner(env);

    return jsonResponse({ reset: true });
  }

  if (!isOwnerSetupOrAccountApiPath(pathname)) {
    return undefined;
  }

  try {
    if (pathname === ACCOUNT_SESSION_LOGOUT_API_PATH) {
      return await handleAccountLogoutRequest(request, storage, env);
    }

    if (pathname === ACCOUNT_SESSION_API_PATH) {
      return await handleAccountSessionRequest(request, storage, env);
    }

    if (pathname === OWNER_SETUP_API_PATH) {
      return await handleOwnerSetupStatusRequest(request, storage, env);
    }

    if (pathname === ownerSetupCapabilityPath) {
      return await handleOwnerSetupCapabilityRequest(request, storage, env);
    }

    return jsonResponse(instanceAuthError("not-found"), 404);
  } catch {
    return jsonResponse(instanceAuthError("invalid-request"), 400);
  }
}

function isOwnerSetupOrAccountApiPath(pathname: string) {
  return (
    isOwnerSetupApiPath(pathname) ||
    pathname === ACCOUNT_SESSION_API_PATH ||
    pathname === ACCOUNT_SESSION_LOGOUT_API_PATH
  );
}

function isOwnerSetupApiPath(pathname: string) {
  return pathname === OWNER_SETUP_API_PATH || pathname.startsWith(`${OWNER_SETUP_API_PATH}/`);
}

async function handleAccountSessionRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: OwnerSetupApiEnv,
): Promise<Response> {
  switch (request.method) {
    case "GET":
      return await handleAccountSessionStatusRequest(request, storage, env);
    case "POST":
      return await handleAccountLoginRequest(request, storage, env);
    default:
      return methodNotAllowedResponse("GET, POST");
  }
}

async function handleAccountSessionStatusRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: OwnerSetupApiEnv,
): Promise<Response> {
  const owner = await readIdentityOwner(env);
  const state = readInstanceSetupState(storage, owner);

  if (!state.owner) {
    return jsonResponse({ authenticated: false, setupComplete: false });
  }

  const centralSession = await validateCentralAuthSessionCookie(request, storage, env);

  if (centralSession.ok) {
    const principal = await readInternalActiveIdentityPrincipal(
      env,
      centralSession.session.principalId,
    );

    if (principal) {
      return authenticatedAccountSessionResponse(principal, centralSession.session.expiresAt);
    }
  }

  if (ownerSessionFallbackAllowed(request, storage, env)) {
    const session = await validateOwnerSessionCookie(request, env);

    if (session.ok) {
      const principal = await readInternalActiveIdentityPrincipal(env, session.session.principalId);

      if (principal) {
        return authenticatedAccountSessionResponse(principal, session.session.expiresAt);
      }
    }
  }

  const hostSession = await hostAccountSessionStatusResponse(request, storage, env);

  if (hostSession) {
    return hostSession;
  }

  return jsonResponse({ authenticated: false, setupComplete: true });
}

async function handleAccountLoginRequest(
  _request: Request,
  storage: DurableObjectStorage,
  env: OwnerSetupApiEnv,
): Promise<Response> {
  const owner = await readIdentityOwner(env);
  const state = readInstanceSetupState(storage, owner);

  if (!state.owner) {
    return jsonResponse(instanceAuthError("conflict"), 409);
  }

  return jsonResponse(instanceAuthError("unauthorized"), 401, {
    "WWW-Authenticate": 'Bearer realm="formless-passkey"',
  });
}

async function handleAccountLogoutRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: OwnerSetupApiEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  const hostSessionTarget = hostAuthSessionTargetFromRequestHeaders(request.headers);

  if (hostSessionTarget) {
    return jsonResponse(
      { authenticated: false, continueTo: runtimeTopologyRoutes.authAccountSignInRoute },
      200,
      {
        "Set-Cookie": clearHostAuthSessionCookie(hostSessionTarget.targetOrigin),
      },
    );
  }

  const headers = new Headers();

  if (requestHasCookie(request, CENTRAL_AUTH_SESSION_COOKIE_NAME)) {
    await revokeCentralAuthSessionCookie(request, storage, env);
    headers.append("Set-Cookie", clearCentralAuthSessionCookie(request));
  }

  if (ownerSessionFallbackAllowed(request, storage, env)) {
    headers.append("Set-Cookie", clearOwnerSessionCookie(request));
  }

  return jsonResponse(
    { authenticated: false, continueTo: runtimeTopologyRoutes.authAccountSignInRoute },
    200,
    headers,
  );
}

async function hostAccountSessionStatusResponse(
  request: Request,
  storage: DurableObjectStorage,
  env: OwnerSetupApiEnv,
): Promise<Response | undefined> {
  const hostSessionTarget = hostAuthSessionTargetFromRequestHeaders(request.headers);

  if (!hostSessionTarget) {
    return undefined;
  }

  const hostSession = await validateHostAuthSessionAuthorityInStorage(request, storage, env, {
    target: hostSessionTarget,
  });

  if (!hostSession.ok) {
    return jsonResponse({ authenticated: false, setupComplete: true }, 401);
  }

  const principal = await readInternalActiveIdentityPrincipal(env, hostSession.session.principalId);

  return principal
    ? authenticatedAccountSessionResponse(principal, hostSession.session.expiresAt)
    : jsonResponse({ authenticated: false, setupComplete: true }, 401);
}

function authenticatedAccountSessionResponse(
  principal: ActiveIdentityPrincipal,
  expiresAt: string,
): Response {
  return jsonResponse({
    authenticated: true,
    principal: {
      displayName: principal.displayName,
      ...(principal.email === undefined ? {} : { email: principal.email }),
      principalId: principal.id,
    },
    session: { expiresAt },
    setupComplete: true,
  });
}

function ownerSessionFallbackAllowed(
  request: Request,
  storage: DurableObjectStorage,
  env: OwnerSetupApiEnv,
): boolean {
  return readInstanceAuthConfig(storage) === undefined || isLocalOwnerSessionRuntime(request, env);
}

async function handleOwnerSetupStatusRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: OwnerSetupApiEnv,
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowedResponse("GET");
  }

  return jsonResponse(await ownerSetupStatusResponse(request, storage, env));
}

async function handleOwnerSetupCapabilityRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: OwnerSetupApiEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  const authorization = authorizeAdminWrite(request, env);

  if (!authorization.authorized) {
    return jsonResponse(
      instanceAuthError(instanceAuthCodeForStatus(authorization.status)),
      authorization.status,
      authorization.headers,
    );
  }

  const body = parseOwnerSetupCapabilityRequest(await readJson(request));
  const owner = await readIdentityOwner(env);
  const result = writeOwnerSetupCapability(
    storage,
    {
      tokenHash: await hashOwnerSetupToken(body.setupToken),
      instanceId: requestInstanceId(request),
      createdAt: nowIsoString(),
      ...(body.expiresAt === undefined ? {} : { expiresAt: body.expiresAt }),
    },
    { owner },
  );

  return ownerSetupCapabilityResponse(result);
}

async function ownerSetupStatusResponse(
  request: Request,
  storage: DurableObjectStorage,
  env: OwnerSetupApiEnv,
): Promise<OwnerSetupStatusResponse> {
  const owner = await readIdentityOwner(env);
  const state = readInstanceSetupState(storage, owner);
  const authOrigin = await configuredInstanceAuthOrigin(request, env);
  const adminOrigin = await ownerSetupAdminOrigin(request, env);

  if (!state.owner) {
    return {
      ...(adminOrigin === undefined ? {} : { adminOrigin }),
      ...(authOrigin === undefined ? {} : { authOrigin }),
      setupComplete: false,
    };
  }

  return {
    ...(adminOrigin === undefined ? {} : { adminOrigin }),
    ...(authOrigin === undefined ? {} : { authOrigin }),
    setupComplete: true,
    owner: state.owner,
  };
}

function ownerSetupCapabilityResponse(result: WriteOwnerSetupCapabilityResult): Response {
  if (!result.ok) {
    return jsonResponse(
      {
        owner: result.owner,
        reason: result.reason,
        setupComplete: true,
      },
      409,
    );
  }

  return jsonResponse({
    capabilityCreated: true,
    ...(result.capability.expiresAt === undefined
      ? {}
      : { expiresAt: result.capability.expiresAt }),
    setupComplete: false,
  });
}

function parseOwnerSetupCapabilityRequest(value: unknown): OwnerSetupCapabilityRequest {
  if (!isRecord(value)) {
    throw new Error("Owner setup capability request must be an object.");
  }

  const allowedKeys = new Set(["expiresAt", "setupToken"]);

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Owner setup capability request has unsupported key "${key}".`);
    }
  }

  if (!("setupToken" in value)) {
    throw new Error('Owner setup capability request must include "setupToken".');
  }

  const expiresAt =
    value.expiresAt === undefined
      ? undefined
      : parseTrimmedNonEmptyString("Owner setup capability expiresAt", value.expiresAt);

  return {
    setupToken: parseOwnerSetupToken(value.setupToken),
    ...(expiresAt === undefined ? {} : { expiresAt }),
  };
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function requestInstanceId(request: Request): string {
  return new URL(request.url).hostname.toLowerCase();
}

function requestHasCookie(request: Request, name: string): boolean {
  const header = request.headers.get("Cookie");

  if (!header) {
    return false;
  }

  return header.split(";").some((part) => part.split("=", 1)[0]?.trim() === name);
}

function methodNotAllowedResponse(allow: string): Response {
  return jsonResponse(instanceAuthError("method-not-allowed"), 405, { Allow: allow });
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

function instanceAuthCodeForStatus(status: number): InstanceAuthErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not-found";
  if (status === 405) return "method-not-allowed";
  if (status === 409) return "conflict";
  if (status === 410) return "expired";
  if (status === 503) return "unavailable";
  return status >= 500 ? "internal-failure" : "invalid-request";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTrimmedNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
}
