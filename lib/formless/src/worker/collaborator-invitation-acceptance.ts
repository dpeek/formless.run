import { generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server";

import {
  parseCollaboratorInvitationAcceptanceRequest,
  parseCollaboratorInvitationPasskeyRegistrationOptionsRequest,
  parseCollaboratorInvitationPasskeyRegistrationVerifyRequest,
  authAccountContinuationLocationForReturnTarget,
  type CollaboratorInvitationAcceptanceFailureReason,
  type CollaboratorInvitationAcceptanceHandoffSummary,
  type CollaboratorInvitationAcceptanceInvitationSummary,
  type CollaboratorInvitationPasskeyRegistrationOptionsResponse,
  type CollaboratorInvitationPasskeyRegistrationVerifyResponse,
  type CollaboratorInvitationAcceptanceStatusResponse,
  type AccountCompletionGateTarget,
  type AuthSuccessContinuationTarget,
  parseInstanceAuthCanonicalOrigin,
  parseAccountRedirectTarget,
} from "../shared/instance-auth.ts";
import { normalizeEmailDeliveryAddress } from "../shared/email-runtime.ts";
import { nowIsoString } from "../shared/clock.ts";
import { acceptsRuntimeHtml } from "../shared/runtime-topology.ts";
import {
  instanceControlPlaneEffectiveRouteAccess,
  instanceControlPlanePreferredAdminOriginFromRecords,
} from "@dpeek/formless-instance-control-plane";
import { FORMLESS_PROGRAM_STORAGE_IDENTITY } from "../program/target.ts";
import type { OwnerIdentity } from "../shared/protocol.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import {
  COLLABORATOR_INVITATION_ACCEPT_PATH,
  consumeCollaboratorInvitationTokenInCurrentTransaction,
  createPasskeyCredentialInCurrentTransaction,
  consumePasskeyChallenge,
  createPasskeyChallenge,
  hashCollaboratorInvitationToken,
  readPasskeyCredential,
  readCollaboratorInvitationToken,
  readInstanceAuthConfig,
  type CollaboratorInvitationTargetFacts,
  type StoredCollaboratorInvitationToken,
} from "./instance-auth-state.ts";
import {
  acceptIdentityCollaboratorInvitation,
  readIdentityCollaboratorInvitationAcceptanceStatus,
  type IdentityCollaboratorInvitationAcceptanceCommitFailureReason,
  type IdentityCollaboratorInvitationAcceptanceStatus,
} from "./identity-control-plane.ts";
import { createCentralAuthSessionCookie } from "./central-auth-session.ts";
import { readControlPlaneRecords } from "./deployment-control-plane-client.ts";
import { handleClientShellDocumentRequest } from "./client-shell.ts";
import { resolveAccountCompletionGate } from "./instance-auth-account-completion.ts";

type CollaboratorInvitationAcceptanceEnv = {
  ASSETS?: Fetcher;
  FORMLESS_ADMIN_TOKEN?: string;
  FORMLESS_AUTHORITY: DurableObjectNamespace;
  FORMLESS_OWNER_SESSION_SECRET?: string;
};

export const COLLABORATOR_INVITATION_PASSKEY_REGISTER_OPTIONS_PATH = `${COLLABORATOR_INVITATION_ACCEPT_PATH}/passkeys/register/options`;
export const COLLABORATOR_INVITATION_PASSKEY_REGISTER_VERIFY_PATH = `${COLLABORATOR_INVITATION_ACCEPT_PATH}/passkeys/register/verify`;

const passkeyChallengeTtlMs = 5 * 60 * 1000;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
type CollaboratorInvitationTokenCommitFailureReason =
  | "already-consumed"
  | "expired-token"
  | "missing-token"
  | "revoked-token"
  | "wrong-target"
  | "wrong-target-email"
  | "wrong-token";

export async function handleCollaboratorInvitationAcceptanceBrowserRequest(
  request: Request,
  env: CollaboratorInvitationAcceptanceEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (url.pathname !== COLLABORATOR_INVITATION_ACCEPT_PATH || !isBrowserDocumentRequest(request)) {
    return undefined;
  }

  return await handleClientShellDocumentRequest(request, env);
}

export async function handleCollaboratorInvitationAcceptanceApiRequest(
  request: Request,
  env: CollaboratorInvitationAcceptanceEnv,
): Promise<Response | undefined> {
  if (!isCollaboratorInvitationAcceptancePath(new URL(request.url).pathname)) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleCollaboratorInvitationAcceptanceDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: CollaboratorInvitationAcceptanceEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (!isCollaboratorInvitationAcceptancePath(url.pathname)) {
    return undefined;
  }

  try {
    if (url.pathname === COLLABORATOR_INVITATION_ACCEPT_PATH) {
      if (request.method !== "GET") {
        return methodNotAllowedResponse("GET");
      }

      return await handleAcceptanceStatusRequest(url, storage, env);
    }

    if (url.pathname === COLLABORATOR_INVITATION_PASSKEY_REGISTER_OPTIONS_PATH) {
      if (request.method !== "POST") {
        return methodNotAllowedResponse("POST");
      }

      return await handlePasskeyRegistrationOptionsRequest(request, storage, env);
    }

    if (url.pathname === COLLABORATOR_INVITATION_PASSKEY_REGISTER_VERIFY_PATH) {
      if (request.method !== "POST") {
        return methodNotAllowedResponse("POST");
      }

      return await handlePasskeyRegistrationVerifyRequest(request, storage, env);
    }

    return jsonResponse({ error: "Not found." }, 404);
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

function isCollaboratorInvitationAcceptancePath(pathname: string): boolean {
  return (
    pathname === COLLABORATOR_INVITATION_ACCEPT_PATH ||
    pathname.startsWith(`${COLLABORATOR_INVITATION_ACCEPT_PATH}/`)
  );
}

function isBrowserDocumentRequest(request: Request): boolean {
  return (
    (request.method === "GET" || request.method === "HEAD") &&
    acceptsRuntimeHtml(request.headers.get("Accept"))
  );
}

async function handleAcceptanceStatusRequest(
  url: URL,
  storage: DurableObjectStorage,
  env: CollaboratorInvitationAcceptanceEnv,
): Promise<Response> {
  const input = parseCollaboratorInvitationAcceptanceRequest({
    invitationId: url.searchParams.get("invitationId"),
    token: url.searchParams.get("token"),
  });
  const candidate = await collaboratorInvitationAcceptanceCandidate({
    env,
    input,
    origin: url.origin,
    storage,
  });

  if (!candidate.ok) {
    return acceptanceFailureResponse(candidate.reason);
  }

  return jsonResponse({
    eligible: true,
    invitation: candidate.summary,
  } satisfies CollaboratorInvitationAcceptanceStatusResponse);
}

async function handlePasskeyRegistrationOptionsRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: CollaboratorInvitationAcceptanceEnv,
): Promise<Response> {
  const url = new URL(request.url);
  const input = parseCollaboratorInvitationPasskeyRegistrationOptionsRequest(
    await readJson(request),
  );
  const candidate = await collaboratorInvitationAcceptanceCandidate({
    env,
    input,
    origin: url.origin,
    storage,
  });

  if (!candidate.ok) {
    return acceptanceFailureResponse(candidate.reason);
  }

  const options = await generateRegistrationOptions({
    rpID: candidate.config.relyingPartyId,
    rpName: candidate.config.relyingPartyName,
    userDisplayName:
      candidate.invitation.invitedPrincipalDisplayName ?? candidate.invitation.targetEmail,
    userID: textBytes(candidate.principalId),
    userName: candidate.invitation.targetEmail,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  });
  const created = createPasskeyChallenge(storage, {
    kind: "registration",
    challenge: options.challenge,
    invitationId: candidate.invitation.invitationId,
    invitationTokenHash: candidate.tokenHash,
    principalId: candidate.principalId,
    canonicalOrigin: candidate.config.canonicalOrigin,
    relyingPartyId: candidate.config.relyingPartyId,
    createdAt: nowIsoString(),
    expiresAt: challengeExpiresAt(),
  });

  if (!created.ok) {
    return jsonResponse({ error: "Passkey challenge already exists." }, 409);
  }

  const response: CollaboratorInvitationPasskeyRegistrationOptionsResponse = { options };

  return jsonResponse(response);
}

async function handlePasskeyRegistrationVerifyRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: CollaboratorInvitationAcceptanceEnv,
): Promise<Response> {
  const url = new URL(request.url);
  const body = parseCollaboratorInvitationPasskeyRegistrationVerifyRequest(await readJson(request));
  const candidate = await collaboratorInvitationAcceptanceCandidate({
    env,
    input: body,
    origin: url.origin,
    storage,
  });

  if (!candidate.ok) {
    return acceptanceFailureResponse(candidate.reason);
  }

  const challengeValue = clientDataChallenge(
    "Collaborator invitation passkey registration response",
    body.response.response.clientDataJSON,
  );
  const challenge = consumePasskeyChallenge(storage, {
    kind: "registration",
    challenge: challengeValue,
    now: nowIsoString(),
  });

  if (!challenge.ok) {
    return passkeyChallengeFailureResponse(challenge.reason);
  }

  if (
    challenge.challenge.kind !== "registration" ||
    !("invitationId" in challenge.challenge) ||
    challenge.challenge.invitationId !== candidate.invitation.invitationId ||
    challenge.challenge.invitationTokenHash !== candidate.tokenHash ||
    challenge.challenge.principalId !== candidate.principalId ||
    challenge.challenge.canonicalOrigin !== candidate.config.canonicalOrigin ||
    challenge.challenge.relyingPartyId !== candidate.config.relyingPartyId
  ) {
    return jsonResponse({ error: "Passkey registration challenge is invalid." }, 401);
  }

  let verified: Awaited<ReturnType<typeof verifyRegistrationResponse>>;

  try {
    verified = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challenge.challenge.challenge,
      expectedOrigin: candidate.config.canonicalOrigin,
      expectedRPID: candidate.config.relyingPartyId,
      requireUserVerification: true,
    });
  } catch {
    return jsonResponse({ error: "Passkey registration verification failed." }, 401);
  }

  if (!verified.verified) {
    return jsonResponse({ error: "Passkey registration verification failed." }, 401);
  }

  if (readPasskeyCredential(storage, verified.registrationInfo.credential.id)) {
    return jsonResponse({ error: "Passkey credential already exists." }, 409);
  }

  const completedAt = nowIsoString();
  const identityAcceptance = await acceptIdentityCollaboratorInvitation(env, {
    invitationId: candidate.invitation.invitationId,
    principalId: candidate.principalId,
    targetEmail: candidate.invitation.targetEmail,
    targetSurface: candidate.invitation.targetSurface,
    ...(candidate.invitation.targetOrganization === undefined
      ? {}
      : { targetOrganization: candidate.invitation.targetOrganization }),
    now: completedAt,
  });

  if (!identityAcceptance.ok) {
    return identityAcceptanceFailureResponse(identityAcceptance.reason);
  }

  try {
    storage.transactionSync(() => {
      const consumedToken = consumeCollaboratorInvitationTokenInCurrentTransaction(storage, {
        invitationId: candidate.invitation.invitationId,
        tokenHash: candidate.tokenHash,
        targetEmail: candidate.invitation.targetEmail,
        target: {
          targetSurface: candidate.invitation.targetSurface,
          ...(candidate.invitation.targetOrganization === undefined
            ? {}
            : { targetOrganization: candidate.invitation.targetOrganization }),
        },
        now: completedAt,
      });

      if (!consumedToken.ok) {
        throw new CollaboratorInvitationTokenCommitError(consumedToken.reason);
      }

      const credential = createPasskeyCredentialInCurrentTransaction(storage, {
        credentialId: verified.registrationInfo.credential.id,
        principalId: identityAcceptance.principalId,
        publicKey: new Uint8Array(verified.registrationInfo.credential.publicKey),
        counter: verified.registrationInfo.credential.counter,
        transports: verified.registrationInfo.credential.transports,
        credentialDeviceType: verified.registrationInfo.credentialDeviceType,
        credentialBackedUp: verified.registrationInfo.credentialBackedUp,
        createdAt: completedAt,
        updatedAt: completedAt,
      });

      if (!credential.ok) {
        throw new DuplicatePasskeyCredentialError();
      }
    });
  } catch (error) {
    if (error instanceof CollaboratorInvitationTokenCommitError) {
      return invitationTokenCommitFailureResponse(error.reason);
    }

    if (error instanceof DuplicatePasskeyCredentialError) {
      return jsonResponse({ error: "Passkey credential already exists." }, 409);
    }

    throw error;
  }

  const acceptedPrincipal = acceptedPrincipalIdentity(identityAcceptance, completedAt);
  const session = await createCentralAuthSessionCookie(storage, {
    env,
    now: completedAt,
    principalId: identityAcceptance.principalId,
    request,
  });

  const continuation = await collaboratorInvitationAcceptanceContinuation(request, env, {
    invitation: identityAcceptance.invitation,
  });
  const accountCompletion =
    continuation === undefined
      ? undefined
      : await resolveAccountCompletionGate({
          env,
          input: {
            actorKind: "authenticated",
            principalId: identityAcceptance.principalId,
            target: continuation.target,
          },
          storage,
        });
  const continueTo =
    accountCompletion?.status === "complete"
      ? collaboratorInvitationAcceptanceContinueTo(accountCompletion, continuation)
      : undefined;
  const headers = new Headers();

  headers.set("Set-Cookie", session.cookie);

  const response: CollaboratorInvitationPasskeyRegistrationVerifyResponse = {
    acceptedPrincipal: {
      displayName: acceptedPrincipal.name,
      principalId: acceptedPrincipal.id,
    },
    ...(accountCompletion === undefined ? {} : { accountCompletion }),
    ...(continueTo === undefined ? {} : { continueTo }),
    ...(accountCompletion?.status !== "complete" || continuation?.handoff === undefined
      ? {}
      : { handoff: continuation.handoff }),
    invitation: collaboratorInvitationSummary(identityAcceptance.invitation),
    session: { expiresAt: session.session.expiresAt },
    verified: true,
  };

  return jsonResponse(response, 200, headers);
}

function collaboratorInvitationAcceptanceContinueTo(
  accountCompletion: Extract<
    NonNullable<CollaboratorInvitationPasskeyRegistrationVerifyResponse["accountCompletion"]>,
    { status: "complete" }
  >,
  continuation:
    | {
        handoff?: CollaboratorInvitationAcceptanceHandoffSummary;
        target: AccountCompletionGateTarget;
      }
    | undefined,
): AuthSuccessContinuationTarget | undefined {
  if (continuation?.handoff !== undefined) {
    return new URL(
      continuation.handoff.returnTo,
      continuation.handoff.targetOrigin,
    ).toString() as AuthSuccessContinuationTarget;
  }

  return authAccountContinuationLocationForReturnTarget(accountCompletion.continueTo);
}

function acceptedPrincipalIdentity(
  identityAcceptance: Extract<
    Awaited<ReturnType<typeof acceptIdentityCollaboratorInvitation>>,
    { ok: true }
  >,
  now: string,
): OwnerIdentity {
  const principal = identityAcceptance.records.find(
    (record) =>
      record.entity === "principal" &&
      record.id === identityAcceptance.principalId &&
      !record.deletedAt,
  );
  const displayName = stringValue(principal?.values.displayName);

  return {
    createdAt: principal?.createdAt ?? now,
    id: identityAcceptance.principalId,
    name:
      displayName ??
      identityAcceptance.invitation.invitedPrincipalDisplayName ??
      identityAcceptance.invitation.targetEmail,
  };
}

async function collaboratorInvitationAcceptanceContinuation(
  request: Request,
  env: CollaboratorInvitationAcceptanceEnv,
  input: { invitation: IdentityCollaboratorInvitationAcceptanceStatus },
): Promise<
  | {
      handoff?: CollaboratorInvitationAcceptanceHandoffSummary;
      target: AccountCompletionGateTarget;
    }
  | undefined
> {
  const records = (await readControlPlaneRecords({ env, requestUrl: request.url })) ?? [];
  const target = invitationAcceptanceHandoffTarget(records, input.invitation);

  if (!target) {
    return undefined;
  }

  const returnTo = parseAccountRedirectTarget(target.returnTo);

  return returnTo === undefined
    ? undefined
    : {
        ...(target.targetOrigin === new URL(request.url).origin
          ? {}
          : {
              handoff: {
                returnTo,
                targetOrigin: target.targetOrigin,
              },
            }),
        target,
      };
}

function invitationAcceptanceHandoffTarget(
  records: readonly StoredRecord[],
  invitation: IdentityCollaboratorInvitationAcceptanceStatus,
): AccountCompletionGateTarget | undefined {
  if (invitation.targetSurface === "instance") {
    return preferredAdminInvitationTarget(records);
  }

  return undefined;
}

function preferredAdminInvitationTarget(
  records: readonly StoredRecord[],
): AccountCompletionGateTarget | undefined {
  const resolution = instanceControlPlanePreferredAdminOriginFromRecords({ records });

  if (resolution.status !== "resolved" || resolution.source === "deploymentTargetUrl") {
    return undefined;
  }

  const route = records
    .map(routeRecordTarget)
    .find((candidate) => candidate?.recordId === resolution.routeId);

  return route === undefined || route.targetProfile !== "instance" || route.access === "anonymous"
    ? undefined
    : {
        access: route.access,
        returnTo: route.matchPath,
        routeId: route.recordId,
        storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
        targetOrigin: parseInstanceAuthCanonicalOrigin(resolution.adminOrigin),
        targetProfile: "instance",
      };
}

function routeRecordTarget(record: StoredRecord):
  | {
      access: "anonymous" | "authenticated" | "management" | "owner";
      matchHost: string;
      matchPath: `/${string}`;
      recordId: string;
      targetProfile: "instance" | "public-site";
    }
  | undefined {
  if (record.deletedAt || record.entity !== "route" || record.values.kind !== "mount") {
    return undefined;
  }

  const matchHost = stringValue(record.values.matchHost);
  const matchPath = pathValue(record.values.matchPath);
  const targetProfile = routeTargetProfile(record.values.targetProfile);

  if (record.values.enabled !== true || !matchHost || !matchPath || !targetProfile) {
    return undefined;
  }

  return {
    access: instanceControlPlaneEffectiveRouteAccess({
      access: stringValue(record.values.access) as
        | "anonymous"
        | "authenticated"
        | "management"
        | "owner"
        | undefined,
      kind: "mount",
      surface:
        record.values.surface === "admin" || record.values.surface === "public-site"
          ? record.values.surface
          : undefined,
      targetProfile,
    }),
    matchHost,
    matchPath,
    recordId: record.id,
    targetProfile,
  };
}

function routeTargetProfile(value: unknown): "instance" | "public-site" | undefined {
  return value === "instance" || value === "public-site" ? value : undefined;
}

async function collaboratorInvitationAcceptanceCandidate(input: {
  env: CollaboratorInvitationAcceptanceEnv;
  input: { invitationId: string; token: string };
  origin: string;
  storage: DurableObjectStorage;
}): Promise<
  | {
      config: NonNullable<ReturnType<typeof readInstanceAuthConfig>>;
      invitation: IdentityCollaboratorInvitationAcceptanceStatus;
      ok: true;
      principalId: string;
      summary: CollaboratorInvitationAcceptanceInvitationSummary;
      token: StoredCollaboratorInvitationToken;
      tokenHash: string;
    }
  | { ok: false; reason: CollaboratorInvitationAcceptanceFailureReason }
> {
  const config = readInstanceAuthConfig(input.storage);

  if (!config) {
    return { ok: false, reason: "configuration-unavailable" };
  }

  if (input.origin !== config.canonicalOrigin) {
    return { ok: false, reason: "wrong-origin" };
  }

  const tokenHash = await hashCollaboratorInvitationToken(input.input.token);
  const token = readCollaboratorInvitationToken(input.storage, input.input.invitationId);
  const invitation = await readIdentityCollaboratorInvitationAcceptanceStatus(
    input.env,
    input.input.invitationId,
  );
  const eligibility = collaboratorInvitationAcceptanceEligibility({
    invitation,
    now: nowIsoString(),
    token,
    tokenHash,
  });

  if (!eligibility.eligible) {
    return { ok: false, reason: eligibility.reason };
  }

  if (!token || !invitation) {
    return { ok: false, reason: "missing-invitation" };
  }

  return {
    config,
    invitation,
    ok: true,
    principalId: invitation.invitedPrincipalId ?? generatedInvitationPrincipalId(invitation),
    summary: eligibility.invitation,
    token,
    tokenHash,
  };
}

function collaboratorInvitationAcceptanceEligibility(input: {
  invitation: IdentityCollaboratorInvitationAcceptanceStatus | null;
  now: string;
  token: StoredCollaboratorInvitationToken | undefined;
  tokenHash: string;
}): CollaboratorInvitationAcceptanceStatusResponse {
  if (!input.token || !input.invitation) {
    return { eligible: false, ...acceptanceFailure("missing-invitation") };
  }

  if (input.token.revokedAt !== undefined || input.invitation.status === "revoked") {
    return { eligible: false, ...acceptanceFailure("revoked-invitation") };
  }

  if (input.invitation.status === "accepted") {
    return { eligible: false, ...acceptanceFailure("accepted-invitation") };
  }

  if (input.token.consumedAt !== undefined) {
    return { eligible: false, ...acceptanceFailure("consumed-invitation") };
  }

  if (
    input.token.expiresAt <= input.now ||
    input.invitation.expiresAt <= input.now ||
    input.invitation.status === "expired"
  ) {
    return { eligible: false, ...acceptanceFailure("expired-invitation") };
  }

  if (input.token.tokenHash !== input.tokenHash) {
    return { eligible: false, ...acceptanceFailure("wrong-token") };
  }

  if (
    input.token.normalizedTargetEmail !==
    normalizeEmailDeliveryAddress(
      "Collaborator invitation acceptance target email",
      input.invitation.targetEmail,
    ).toLowerCase()
  ) {
    return { eligible: false, ...acceptanceFailure("wrong-email") };
  }

  if (!collaboratorInvitationTargetFactsEqual(input.token, input.invitation)) {
    return { eligible: false, ...acceptanceFailure("wrong-target") };
  }

  return {
    eligible: true,
    invitation: collaboratorInvitationSummary(input.invitation),
  };
}

function collaboratorInvitationSummary(
  invitation: IdentityCollaboratorInvitationAcceptanceStatus,
): CollaboratorInvitationAcceptanceInvitationSummary {
  return {
    expiresAt: invitation.expiresAt,
    invitationId: invitation.invitationId,
    ...(invitation.invitedPrincipalDisplayName === undefined
      ? {}
      : { invitedPrincipalDisplayName: invitation.invitedPrincipalDisplayName }),
    passkeyRegistrationRequired: true,
    targetEmail: invitation.targetEmail,
    targetSurface: invitation.targetSurface,
    ...(invitation.targetOrganization === undefined
      ? {}
      : { targetOrganization: invitation.targetOrganization }),
  };
}

function collaboratorInvitationTargetFactsEqual(
  left: CollaboratorInvitationTargetFacts,
  right: CollaboratorInvitationTargetFacts,
): boolean {
  return (
    left.targetSurface === right.targetSurface &&
    (left.targetOrganization ?? undefined) === (right.targetOrganization ?? undefined)
  );
}

function acceptanceFailureResponse(
  reason: CollaboratorInvitationAcceptanceFailureReason,
): Response {
  return jsonResponse(
    {
      eligible: false,
      ...acceptanceFailure(reason),
    },
    acceptanceFailureStatus(reason),
  );
}

function acceptanceFailure(reason: CollaboratorInvitationAcceptanceFailureReason): {
  error: string;
  reason: CollaboratorInvitationAcceptanceFailureReason;
} {
  return {
    reason,
    error: acceptanceFailureMessage(reason),
  };
}

function acceptanceFailureMessage(reason: CollaboratorInvitationAcceptanceFailureReason): string {
  switch (reason) {
    case "accepted-invitation":
      return "Invitation has already been accepted.";
    case "configuration-unavailable":
      return "Invitation acceptance is unavailable.";
    case "consumed-invitation":
      return "Invitation link has already been used.";
    case "expired-invitation":
      return "Invitation link has expired.";
    case "missing-invitation":
    case "wrong-email":
    case "wrong-target":
    case "wrong-token":
      return "Invitation link is invalid.";
    case "revoked-invitation":
      return "Invitation link is no longer available.";
    case "wrong-origin":
      return "Invitation must be accepted on the configured auth origin.";
  }
}

function acceptanceFailureStatus(reason: CollaboratorInvitationAcceptanceFailureReason): number {
  switch (reason) {
    case "accepted-invitation":
    case "consumed-invitation":
    case "revoked-invitation":
      return 409;
    case "configuration-unavailable":
      return 503;
    case "expired-invitation":
      return 410;
    case "missing-invitation":
      return 404;
    case "wrong-origin":
      return 404;
    case "wrong-email":
    case "wrong-target":
    case "wrong-token":
      return 401;
  }
}

function identityAcceptanceFailureResponse(
  reason: IdentityCollaboratorInvitationAcceptanceCommitFailureReason,
): Response {
  switch (reason) {
    case "accepted-invitation":
    case "expired-invitation":
    case "missing-invitation":
    case "revoked-invitation":
    case "wrong-email":
    case "wrong-target":
      return acceptanceFailureResponse(reason);
    case "wrong-principal":
      return acceptanceFailureResponse("wrong-target");
    case "identity-validation-failed":
      return jsonResponse({ error: "Invitation acceptance could not be committed." }, 409);
  }
}

function invitationTokenCommitFailureResponse(
  reason: CollaboratorInvitationTokenCommitFailureReason,
): Response {
  switch (reason) {
    case "already-consumed":
      return acceptanceFailureResponse("consumed-invitation");
    case "expired-token":
      return acceptanceFailureResponse("expired-invitation");
    case "missing-token":
      return acceptanceFailureResponse("missing-invitation");
    case "revoked-token":
      return acceptanceFailureResponse("revoked-invitation");
    case "wrong-target":
      return acceptanceFailureResponse("wrong-target");
    case "wrong-target-email":
      return acceptanceFailureResponse("wrong-email");
    case "wrong-token":
      return acceptanceFailureResponse("wrong-token");
  }
}

function methodNotAllowedResponse(allow: string): Response {
  return jsonResponse({ error: "Method not allowed." }, 405, { Allow: allow });
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}) {
  const responseHeaders = new Headers(headers);

  responseHeaders.set("Cache-Control", "no-store");

  return Response.json(body, {
    headers: responseHeaders,
    status,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}

function passkeyChallengeFailureResponse(
  reason: "already-consumed" | "expired-challenge" | "missing-challenge" | "wrong-kind",
) {
  switch (reason) {
    case "already-consumed":
    case "missing-challenge":
    case "wrong-kind":
      return jsonResponse({ error: "Passkey challenge is invalid." }, 401);
    case "expired-challenge":
      return jsonResponse({ error: "Passkey challenge has expired." }, 410);
  }
}

class CollaboratorInvitationTokenCommitError extends Error {
  readonly reason: CollaboratorInvitationTokenCommitFailureReason;

  constructor(reason: CollaboratorInvitationTokenCommitFailureReason) {
    super("Collaborator invitation token commit failed.");
    this.reason = reason;
  }
}

class DuplicatePasskeyCredentialError extends Error {
  constructor() {
    super("Passkey credential already exists.");
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
    throw new Error("Request body must be valid JSON.");
  }
}

function challengeExpiresAt() {
  return new Date(Date.now() + passkeyChallengeTtlMs).toISOString();
}

function generatedInvitationPrincipalId(
  invitation: IdentityCollaboratorInvitationAcceptanceStatus,
): string {
  return `principal:invitation:${base64UrlEncode(textBytes(invitation.invitationId))}`;
}

function textBytes(value: string): Uint8Array<ArrayBuffer> {
  const bytes = new TextEncoder().encode(value);
  const output = new Uint8Array(new ArrayBuffer(bytes.byteLength));

  output.set(bytes);

  return output;
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

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function pathValue(value: unknown): `/${string}` | undefined {
  return typeof value === "string" && value.startsWith("/") ? (value as `/${string}`) : undefined;
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

function base64UrlEncode(value: Uint8Array): string {
  let binary = "";

  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
