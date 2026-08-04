import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";

import {
  accountPasskeyLoginContinuationTarget,
  instanceAuthError,
  parseAccountPasskeyLoginOptionsRequest,
  parseAccountPasskeyLoginVerifyRequest,
  type AccountPasskeyLoginOptionsResponse,
  type AccountPasskeyLoginVerifyResponse,
  type InstanceAuthErrorCode,
} from "../shared/instance-auth.ts";
import { nowIsoString } from "../shared/clock.ts";
import { type AuthorityAdminGuardEnv } from "./authority-admin-guard.ts";
import { createCentralAuthSessionCookie } from "./central-auth-session.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { readInstanceSetupState } from "./instance-setup-state.ts";
import {
  consumePasskeyChallenge,
  createPasskeyChallenge,
  passkeyCredentialToWebAuthnCredential,
  readInstanceAuthConfig,
  readPasskeyCredential,
  updatePasskeyCredentialVerification,
  type StoredInstanceAuthConfig,
} from "./instance-auth-state.ts";
import { readIdentityOwner } from "./identity-control-plane.ts";
import { readInternalActiveIdentityPrincipal } from "./identity-owner-internal.ts";

export const ACCOUNT_PASSKEY_API_PATH = "/api/formless/passkeys";

const loginOptionsPath = `${ACCOUNT_PASSKEY_API_PATH}/login/options`;
const loginVerifyPath = `${ACCOUNT_PASSKEY_API_PATH}/login/verify`;
const passkeyChallengeTtlMs = 5 * 60 * 1000;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

class AccountPasskeyResponseError extends Error {
  readonly code: InstanceAuthErrorCode;
  readonly status: number;

  constructor(code: InstanceAuthErrorCode, status: number) {
    super("Account passkey request failed.");
    this.name = "AccountPasskeyResponseError";
    this.code = code;
    this.status = status;
  }
}

type AccountPasskeyApiEnv = AuthorityAdminGuardEnv & {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
};

export async function handleAccountPasskeyApiRequest(
  request: Request,
  env: AccountPasskeyApiEnv,
): Promise<Response | undefined> {
  if (!isAccountPasskeyApiPath(new URL(request.url).pathname)) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleAccountPasskeyDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: AccountPasskeyApiEnv,
): Promise<Response | undefined> {
  const pathname = new URL(request.url).pathname;

  if (!isAccountPasskeyApiPath(pathname)) {
    return undefined;
  }

  try {
    if (pathname === loginOptionsPath) {
      return await handleLoginOptionsRequest(request, storage, env);
    }

    if (pathname === loginVerifyPath) {
      return await handleLoginVerifyRequest(request, storage, env);
    }

    return jsonResponse(instanceAuthError("not-found"), 404);
  } catch (error) {
    return error instanceof AccountPasskeyResponseError
      ? jsonResponse(instanceAuthError(error.code), error.status)
      : jsonResponse(instanceAuthError("internal-failure"), 500);
  }
}

function isAccountPasskeyApiPath(pathname: string) {
  return (
    pathname === ACCOUNT_PASSKEY_API_PATH || pathname.startsWith(`${ACCOUNT_PASSKEY_API_PATH}/`)
  );
}

async function handleLoginOptionsRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: AccountPasskeyApiEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  const requestBody = await readJson(request);

  parseAccountPasskeyRequest(() => parseAccountPasskeyLoginOptionsRequest(requestBody));

  const config = requireInstanceAuthConfig(storage);
  const owner = await readIdentityOwner(env);
  const state = readInstanceSetupState(storage, owner);

  if (!state.owner) {
    return jsonResponse(instanceAuthError("conflict"), 409);
  }

  const options = await generateAuthenticationOptions({
    rpID: config.relyingPartyId,
    userVerification: "required",
  });
  const created = createPasskeyChallenge(storage, {
    kind: "login",
    challenge: options.challenge,
    createdAt: nowIsoString(),
    expiresAt: challengeExpiresAt(),
  });

  if (!created.ok) {
    return jsonResponse(instanceAuthError("conflict"), 409);
  }

  const response: AccountPasskeyLoginOptionsResponse = { options };

  return jsonResponse(response);
}

async function handleLoginVerifyRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: AccountPasskeyApiEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  const requestBody = await readJson(request);
  const body = parseAccountPasskeyRequest(() => parseAccountPasskeyLoginVerifyRequest(requestBody));
  const config = requireInstanceAuthConfig(storage);
  const owner = await readIdentityOwner(env);
  const state = readInstanceSetupState(storage, owner);

  if (!state.owner) {
    return jsonResponse(instanceAuthError("conflict"), 409);
  }

  const challengeValue = parseAccountPasskeyRequest(() =>
    clientDataChallenge("Passkey login response", body.response.response.clientDataJSON),
  );
  const challenge = consumePasskeyChallenge(storage, {
    kind: "login",
    challenge: challengeValue,
    now: nowIsoString(),
  });

  if (!challenge.ok) {
    return passkeyChallengeFailureResponse(challenge.reason);
  }

  if (challenge.challenge.kind !== "login") {
    return jsonResponse(instanceAuthError("unauthorized"), 401);
  }

  const credential = readPasskeyCredential(storage, body.response.id);

  if (!credential) {
    return jsonResponse(instanceAuthError("unauthorized"), 401);
  }

  const resolvedPrincipal = await readInternalActiveIdentityPrincipal(env, credential.principalId);

  if (
    !resolvedPrincipal ||
    resolvedPrincipal.id !== credential.principalId ||
    !passkeyUserHandleMatchesPrincipal(body.response.response.userHandle, credential.principalId)
  ) {
    return jsonResponse(instanceAuthError("unauthorized"), 401);
  }

  let verified: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;

  try {
    verified = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: challenge.challenge.challenge,
      expectedOrigin: config.canonicalOrigin,
      expectedRPID: config.relyingPartyId,
      credential: passkeyCredentialToWebAuthnCredential(credential),
      requireUserVerification: true,
    });
  } catch {
    return jsonResponse(instanceAuthError("unauthorized"), 401);
  }

  if (!verified.verified) {
    return jsonResponse(instanceAuthError("unauthorized"), 401);
  }

  const principal = await readInternalActiveIdentityPrincipal(env, credential.principalId);

  if (!principal || principal.id !== credential.principalId) {
    return jsonResponse(instanceAuthError("unauthorized"), 401);
  }

  const updated = updatePasskeyCredentialVerification(storage, {
    credentialId: credential.credentialId,
    counter: verified.authenticationInfo.newCounter,
    userVerified: verified.authenticationInfo.userVerified,
    credentialDeviceType: verified.authenticationInfo.credentialDeviceType,
    credentialBackedUp: verified.authenticationInfo.credentialBackedUp,
    origin: verified.authenticationInfo.origin,
    relyingPartyId: verified.authenticationInfo.rpID,
    verifiedAt: nowIsoString(),
  });

  if (!updated.ok) {
    return jsonResponse(instanceAuthError("unauthorized"), 401);
  }

  const session = await createCentralAuthSessionCookie(storage, {
    env,
    principalId: principal.id,
    request,
  });
  const headers = new Headers();

  headers.set("Set-Cookie", session.cookie);

  const response: AccountPasskeyLoginVerifyResponse = {
    authenticated: true,
    continueTo: accountPasskeyLoginContinuationTarget,
    principal: {
      displayName: principal.displayName,
      ...(principal.email === undefined ? {} : { email: principal.email }),
      principalId: principal.id,
    },
    session: { expiresAt: session.session.expiresAt },
  };

  return jsonResponse(response, 200, headers);
}

function passkeyUserHandleMatchesPrincipal(
  userHandle: string | undefined,
  principalId: string,
): boolean {
  if (!userHandle) {
    return false;
  }

  let actual: Uint8Array;

  try {
    actual = base64UrlDecode(userHandle);
  } catch {
    return false;
  }

  const expected = new TextEncoder().encode(principalId);

  if (actual.byteLength !== expected.byteLength) {
    return false;
  }

  return actual.every((value, index) => value === expected[index]);
}

function requireInstanceAuthConfig(storage: DurableObjectStorage): StoredInstanceAuthConfig {
  const config = readInstanceAuthConfig(storage);

  if (!config) {
    throw new AccountPasskeyResponseError("unavailable", 503);
  }

  return config;
}

function passkeyChallengeFailureResponse(
  reason: "already-consumed" | "expired-challenge" | "missing-challenge" | "wrong-kind",
) {
  switch (reason) {
    case "already-consumed":
    case "missing-challenge":
    case "wrong-kind":
      return jsonResponse(instanceAuthError("unauthorized"), 401);
    case "expired-challenge":
      return jsonResponse(instanceAuthError("expired"), 410);
  }
}

function clientDataChallenge(context: string, value: string): string {
  let parsed: unknown;

  try {
    parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(value)));
  } catch {
    throw new Error(`${context} clientDataJSON must be valid JSON.`);
  }

  if (!isRecord(parsed) || typeof parsed.challenge !== "string") {
    throw new Error(`${context} clientDataJSON challenge must be a string.`);
  }

  return parseBase64UrlString(`${context} clientDataJSON challenge`, parsed.challenge);
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AccountPasskeyResponseError("invalid-request", 400);
  }
}

function challengeExpiresAt() {
  return new Date(Date.now() + passkeyChallengeTtlMs).toISOString();
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

function parseAccountPasskeyRequest<T>(parse: () => T): T {
  try {
    return parse();
  } catch {
    throw new AccountPasskeyResponseError("invalid-request", 400);
  }
}

function parseBase64UrlString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  const normalized = value.trim();

  if (!base64UrlPattern.test(normalized)) {
    throw new Error(`${context} must be base64url.`);
  }

  return normalized;
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const normalized = parseBase64UrlString("Passkey base64url value", value);
  const base64 = normalized.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  let binary: string;

  try {
    binary = atob(padded);
  } catch {
    throw new Error("Passkey base64url value must be valid base64url.");
  }

  const bytes = new Uint8Array(new ArrayBuffer(binary.length));

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
