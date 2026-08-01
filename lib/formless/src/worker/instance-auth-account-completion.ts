import type { IdentityInvitationTargetSurface } from "@dpeek/formless-identity-control-plane";
import { FORMLESS_PROGRAM_STORAGE_IDENTITY } from "../program/target.ts";
import type { StoredRecord } from "@dpeek/formless-storage";

import {
  parseAccountCompletionGate,
  parseAccountCompletionGateResolutionResult,
  parseAccountCompletionGateTarget,
  parseInstanceAuthCanonicalOrigin,
  type AccountCompletionGate,
  type AccountCompletionGateOperationInputContract,
  type AccountCompletionGateOperationReference,
  type AccountCompletionGatePolicyReference,
  type AccountCompletionGateResolutionResult,
  type AccountCompletionGateTarget,
} from "../shared/instance-auth.ts";
import { nowIsoString } from "../shared/clock.ts";
import { validateCentralAuthSessionCookie } from "./central-auth-session.ts";
import { readInternalAccountCompletionIdentityState } from "./identity-owner-internal.ts";
import type {
  AccountCompletionIdentityState,
  IdentityOwnerInternalEnv,
} from "./identity-owner-internal.ts";
import {
  readInstanceAuthConfig,
  readPasskeyCredentialsForPrincipal,
} from "./instance-auth-state.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { accountCompletionContinueToFromRequest } from "./instance-auth-continuations.ts";

export const INSTANCE_AUTH_ACCOUNT_COMPLETION_RESOLVE_PATH =
  "/_internal/instance-auth/account-completion/resolve";
export const INSTANCE_AUTH_TERMS_ACCEPTANCE_GATE_COMPLETE_PATH =
  "/formless/auth/terms-acceptance/complete";

const termsAcceptanceCompletionOperationKey = "auth.terms-acceptance.complete";
const internalTermsAcceptanceCommitPath = "/_internal/identity/terms-acceptance-commit";

type AccountCompletionResolverActorKind = "anonymous" | "authenticated" | "owner";

type AccountCompletionApiEnv = IdentityOwnerInternalEnv & {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
  FORMLESS_OWNER_SESSION_SECRET?: string;
};

export type AccountCompletionProfileCompletionRequirement = {
  inputContract?: AccountCompletionGateOperationInputContract;
  operation?: AccountCompletionGateOperationReference;
  profileRecordId?: string;
  satisfied: boolean;
};

export type AccountCompletionGateResolverInput = {
  actorKind?: AccountCompletionResolverActorKind;
  principalId?: string;
  profileCompletion?: AccountCompletionProfileCompletionRequirement;
  target: AccountCompletionGateTarget;
};

type AccountCompletionTermsAcceptanceCompleteInput = {
  acceptedPolicyIds: string[];
  target: AccountCompletionGateTarget;
};

type AccountCompletionGateCompletionHandoff = {
  returnTo: `/${string}`;
  targetOrigin: string;
};

type TermsAcceptanceCommitResult =
  | {
      acceptedPolicies: Array<{
        accountPolicyId: string;
        acceptedAt: string;
        principalId: string;
        principalPolicyAcceptanceId: string;
        status: "accepted";
      }>;
      ok: true;
      records: StoredRecord[];
      status: "committed" | "replayed";
    }
  | {
      error: string;
      ok: false;
      reason: string;
    };

export async function handleInstanceAuthAccountCompletionApiRequest(
  request: Request,
  env: AccountCompletionApiEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (url.pathname !== INSTANCE_AUTH_TERMS_ACCEPTANCE_GATE_COMPLETE_PATH) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleInstanceAuthAccountCompletionDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: AccountCompletionApiEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (url.pathname === INSTANCE_AUTH_TERMS_ACCEPTANCE_GATE_COMPLETE_PATH) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
    }

    try {
      return await completeTermsAcceptanceGate({
        env,
        input: parseAccountCompletionTermsAcceptanceCompleteInput(await readJson(request)),
        request,
        storage,
      });
    } catch (error) {
      return jsonResponse({ error: errorMessage(error) }, 400);
    }
  }

  if (url.pathname !== INSTANCE_AUTH_ACCOUNT_COMPLETION_RESOLVE_PATH) {
    return undefined;
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
  }

  try {
    const result = await resolveAccountCompletionGate({
      env,
      input: parseAccountCompletionGateResolverInput(await readJson(request)),
      storage,
    });

    return jsonResponse(parseAccountCompletionGateResolutionResult(result));
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

export async function resolveAccountCompletionGate(input: {
  env: IdentityOwnerInternalEnv;
  input: AccountCompletionGateResolverInput;
  storage: DurableObjectStorage;
}): Promise<AccountCompletionGateResolutionResult> {
  const actorKind = input.input.actorKind ?? "authenticated";
  const target = parseAccountCompletionGateTarget(input.input.target);

  if (actorKind === "anonymous") {
    return completeResult(target);
  }

  const principalId = parseNonEmptyString(
    "Account completion principal id",
    input.input.principalId,
  );
  const state =
    (await readInternalAccountCompletionIdentityState(input.env, { principalId, target })) ??
    emptyAccountCompletionIdentityState();

  if (!state.principal || state.principal.values.status !== "active") {
    return blockedResult(target, { credentialMethod: "passkey", kind: "credential" });
  }

  if (!verifiedPrimaryEmail(state.primaryEmail)) {
    return blockedResult(target, emailVerificationGate(state.primaryEmail));
  }

  if (readPasskeyCredentialsForPrincipal(input.storage, principalId).length === 0) {
    return blockedResult(target, { credentialMethod: "passkey", kind: "credential" });
  }

  const pendingInvitation = state.invitations.find((record) => record.values.status === "pending");

  if (pendingInvitation) {
    return blockedResult(target, invitationGate(pendingInvitation));
  }

  if (input.input.profileCompletion && !input.input.profileCompletion.satisfied) {
    return blockedResult(target, {
      kind: "profile-completion",
      ...(input.input.profileCompletion.inputContract === undefined
        ? {}
        : { inputContract: input.input.profileCompletion.inputContract }),
      ...(input.input.profileCompletion.operation === undefined
        ? {}
        : { operation: input.input.profileCompletion.operation }),
      ...(input.input.profileCompletion.profileRecordId === undefined
        ? {}
        : { profileRecordId: input.input.profileCompletion.profileRecordId }),
      ...(target.selectedOrganization === undefined
        ? {}
        : { selectedOrganization: target.selectedOrganization }),
    });
  }

  const missingPolicies = missingAcceptedPolicies(state);

  if (missingPolicies.length > 0) {
    return blockedResult(target, {
      kind: "terms-acceptance",
      operation: termsAcceptanceCompletionOperation(target),
      policies: missingPolicies.map(accountCompletionPolicyReference),
    });
  }

  return completeResult(target);
}

async function completeTermsAcceptanceGate(input: {
  env: AccountCompletionApiEnv;
  input: AccountCompletionTermsAcceptanceCompleteInput;
  request: Request;
  storage: DurableObjectStorage;
}): Promise<Response> {
  const session = await validateCentralAuthSessionCookie(input.request, input.storage, input.env);

  if (!session.ok) {
    return jsonResponse({ error: "Authenticated account session is required." }, 401);
  }

  assertAuthOriginRequest(input.request, input.storage);

  const target = await validatedCurrentTermsAcceptanceTarget(
    input.input.target,
    input.request,
    input.env,
  );
  const before = await resolveAccountCompletionGate({
    env: input.env,
    input: {
      actorKind: "authenticated",
      principalId: session.session.principalId,
      target,
    },
    storage: input.storage,
  });

  if (before.status !== "blocked" || before.gate.kind !== "terms-acceptance") {
    return jsonResponse(
      {
        accountCompletion: parseAccountCompletionGateResolutionResult(before),
        error: "Terms acceptance gate is not current.",
      },
      409,
    );
  }

  const acceptedPolicyIds = new Set(input.input.acceptedPolicyIds);
  const missingSubmittedPolicyIds = before.gate.policies
    .map((policy) => policy.accountPolicyId)
    .filter((policyId) => !acceptedPolicyIds.has(policyId));

  if (missingSubmittedPolicyIds.length > 0) {
    return jsonResponse(
      {
        accountCompletion: parseAccountCompletionGateResolutionResult(before),
        error: "Terms acceptance request does not include every current policy.",
      },
      409,
    );
  }

  const completedAt = nowIsoString();
  const committed = await commitTermsAcceptance(input.env, {
    acceptedAt: completedAt,
    acceptedPolicyIds: input.input.acceptedPolicyIds,
    acceptanceId: termsAcceptanceCompletionId(
      session.session.principalId,
      target,
      input.input.acceptedPolicyIds,
    ),
    principalId: session.session.principalId,
    target,
  });

  if (!committed.ok) {
    return jsonResponse({ error: committed.error }, 409);
  }

  const accountCompletion = await resolveAccountCompletionGate({
    env: input.env,
    input: {
      actorKind: "authenticated",
      principalId: session.session.principalId,
      target,
    },
    storage: input.storage,
  });
  const response = {
    acceptedPolicies: committed.acceptedPolicies,
    accountCompletion,
    completed: true,
    ...accountCompletionContinueToFromRequest(
      input.request,
      accountCompletion,
      configuredAccountCompletionAuthOrigin(input.storage),
    ),
    ...(accountCompletion.status === "complete" &&
    target.targetOrigin !== configuredAccountCompletionAuthOrigin(input.storage)
      ? {
          handoff: {
            returnTo: target.returnTo,
            targetOrigin: target.targetOrigin,
          } satisfies AccountCompletionGateCompletionHandoff,
        }
      : {}),
  };

  return jsonResponse(response, accountCompletion.status === "complete" ? 200 : 409);
}

function completeResult(
  target: AccountCompletionGateTarget,
): AccountCompletionGateResolutionResult {
  return {
    continueTo: target.returnTo,
    status: "complete",
    target,
  };
}

function blockedResult(
  target: AccountCompletionGateTarget,
  gate: AccountCompletionGate,
): AccountCompletionGateResolutionResult {
  return {
    gate,
    status: "blocked",
    target,
  };
}

function termsAcceptanceCompletionOperation(
  _target: AccountCompletionGateTarget,
): AccountCompletionGateOperationReference {
  return {
    entityName: "principal-policy-acceptance",
    label: "Accept terms",
    operationKey: termsAcceptanceCompletionOperationKey,
    operationName: "completeTermsAcceptance",
  };
}

function emailVerificationGate(primaryEmail: StoredRecord | null): AccountCompletionGate {
  return {
    kind: "email-verification",
    ...(primaryEmail === null
      ? {}
      : {
          displayEmail: optionalStringValue(primaryEmail, "displayEmail"),
          principalEmailId: primaryEmail.id,
        }),
  };
}

function invitationGate(invitation: StoredRecord): AccountCompletionGate {
  return {
    invitationId: invitation.id,
    kind: "invitation",
    targetEmail: stringValue(invitation, "targetEmail"),
    targetSurface: stringValue(invitation, "targetSurface") as IdentityInvitationTargetSurface,
  };
}

function verifiedPrimaryEmail(primaryEmail: StoredRecord | null): boolean {
  return primaryEmail !== null && primaryEmail.values.verificationStatus === "verified";
}

function configuredAccountCompletionAuthOrigin(storage: DurableObjectStorage): string | undefined {
  const config = readInstanceAuthConfig(storage);

  return config === undefined
    ? undefined
    : parseInstanceAuthCanonicalOrigin(config.canonicalOrigin);
}

function assertAuthOriginRequest(request: Request, storage: DurableObjectStorage) {
  const configuredOrigin = configuredAccountCompletionAuthOrigin(storage);

  if (configuredOrigin === undefined) {
    throw new Error("Account completion auth origin is not configured.");
  }

  if (parseInstanceAuthCanonicalOrigin(new URL(request.url).origin) !== configuredOrigin) {
    throw new Error("Account completion gate must be completed on the configured auth origin.");
  }
}

async function validatedCurrentTermsAcceptanceTarget(
  value: AccountCompletionGateTarget,
  _request: Request,
  _env: AccountCompletionApiEnv,
): Promise<AccountCompletionGateTarget> {
  return parseAccountCompletionGateTarget(value);
}

function termsAcceptanceCompletionId(
  principalId: string,
  target: AccountCompletionGateTarget,
  policyIds: readonly string[],
) {
  return [
    principalId,
    target.targetProfile,
    target.storageIdentity ?? "",
    target.selectedOrganization ?? "",
    [...policyIds].sort().join(","),
  ].join(":");
}

async function commitTermsAcceptance(
  env: AccountCompletionApiEnv,
  input: {
    acceptedAt: string;
    acceptedPolicyIds: string[];
    acceptanceId: string;
    principalId: string;
    target: AccountCompletionGateTarget;
  },
): Promise<TermsAcceptanceCommitResult> {
  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_PROGRAM_STORAGE_IDENTITY);
  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(`http://internal${internalTermsAcceptanceCommitPath}`, {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  const body = (await response.json()) as
    | TermsAcceptanceCommitResult
    | {
        error?: string;
      };

  if (!response.ok || !isTermsAcceptanceCommitResult(body)) {
    throw new Error(responseBodyError(body) ?? "Identity terms acceptance commit failed.");
  }

  return body;
}

function isTermsAcceptanceCommitResult(value: unknown): value is TermsAcceptanceCommitResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (record.ok === true) {
    return (
      typeof record.status === "string" &&
      Array.isArray(record.acceptedPolicies) &&
      Array.isArray(record.records)
    );
  }

  return (
    record.ok === false && typeof record.reason === "string" && typeof record.error === "string"
  );
}

function responseBodyError(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const error = (value as Record<string, unknown>).error;

  return typeof error === "string" ? error : undefined;
}

function missingAcceptedPolicies(state: AccountCompletionIdentityState): StoredRecord[] {
  const acceptedPolicyIds = new Set(
    state.policyAcceptances
      .filter((record) => record.values.status === "accepted")
      .map((record) => stringValue(record, "accountPolicy")),
  );

  return state.accountPolicies.filter(
    (policy) => policy.values.status === "active" && !acceptedPolicyIds.has(policy.id),
  );
}

function accountCompletionPolicyReference(
  policy: StoredRecord,
): AccountCompletionGatePolicyReference {
  return {
    accountPolicyId: policy.id,
    displayName: stringValue(policy, "displayName"),
    policyKey: stringValue(policy, "policyKey"),
    version: stringValue(policy, "version"),
    ...optionalPolicyString(policy, "policyContentRef"),
    ...optionalPolicyString(policy, "policyDocumentUrl"),
  };
}

function emptyAccountCompletionIdentityState(): AccountCompletionIdentityState {
  return {
    accountPolicies: [],
    invitations: [],
    memberships: [],
    policyAcceptances: [],
    primaryEmail: null,
    principal: null,
  };
}

function parseAccountCompletionGateResolverInput(
  value: unknown,
): AccountCompletionGateResolverInput {
  const object = parseRecord("Account completion gate resolver input", value);

  assertAllowedKeys("Account completion gate resolver input", object, [
    "actorKind",
    "principalId",
    "profileCompletion",
    "target",
  ]);

  const actorKind =
    object.actorKind === undefined
      ? undefined
      : parseStringLiteral("Account completion actor kind", object.actorKind, [
          "anonymous",
          "authenticated",
          "owner",
        ]);

  return {
    ...(actorKind === undefined ? {} : { actorKind }),
    ...(object.principalId === undefined
      ? {}
      : {
          principalId: parseNonEmptyString("Account completion principal id", object.principalId),
        }),
    ...parseOptionalProfileCompletionRequirement(object.profileCompletion),
    target: parseAccountCompletionGateTarget(object.target),
  };
}

function parseAccountCompletionTermsAcceptanceCompleteInput(
  value: unknown,
): AccountCompletionTermsAcceptanceCompleteInput {
  const object = parseRecord("Account completion terms acceptance input", value);

  assertAllowedKeys("Account completion terms acceptance input", object, [
    "acceptedPolicyIds",
    "target",
  ]);

  return {
    acceptedPolicyIds: parseUniqueNonEmptyStringList(
      "Account completion terms acceptance acceptedPolicyIds",
      object.acceptedPolicyIds,
    ),
    target: parseAccountCompletionGateTarget(object.target),
  };
}

function parseOptionalProfileCompletionRequirement(value: unknown): {
  profileCompletion?: AccountCompletionProfileCompletionRequirement;
} {
  if (value === undefined) {
    return {};
  }

  const object = parseRecord("Account completion profile requirement", value);

  assertAllowedKeys("Account completion profile requirement", object, [
    "inputContract",
    "operation",
    "profileRecordId",
    "satisfied",
  ]);

  if (typeof object.satisfied !== "boolean") {
    throw new Error("Account completion profile requirement satisfied must be boolean.");
  }

  const gate = parseAccountCompletionGate({
    kind: "profile-completion",
    ...(object.inputContract === undefined ? {} : { inputContract: object.inputContract }),
    ...(object.operation === undefined ? {} : { operation: object.operation }),
    ...(object.profileRecordId === undefined ? {} : { profileRecordId: object.profileRecordId }),
  });

  if (gate.kind !== "profile-completion") {
    throw new Error("Account completion profile requirement is invalid.");
  }

  return {
    profileCompletion: {
      ...(gate.inputContract === undefined ? {} : { inputContract: gate.inputContract }),
      ...(gate.operation === undefined ? {} : { operation: gate.operation }),
      ...(gate.profileRecordId === undefined ? {} : { profileRecordId: gate.profileRecordId }),
      satisfied: object.satisfied,
    },
  };
}

function optionalPolicyString(
  record: StoredRecord,
  fieldName: "policyContentRef" | "policyDocumentUrl",
) {
  const value = optionalStringValue(record, fieldName);

  return value === undefined ? {} : { [fieldName]: value };
}

function stringValue(record: StoredRecord, fieldName: string): string {
  const value = record.values[fieldName];

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Account completion record "${record.id}" field "${fieldName}" must be set.`);
  }

  return value;
}

function optionalStringValue(record: StoredRecord, fieldName: string): string | undefined {
  const value = record.values[fieldName];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Account completion record "${record.id}" field "${fieldName}" is invalid.`);
  }

  return value;
}

function parseRecord(context: string, value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function assertAllowedKeys(
  context: string,
  object: Record<string, unknown>,
  allowedKeys: readonly string[],
) {
  const allowed = new Set(allowedKeys);

  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }
}

function parseStringLiteral<T extends string>(
  context: string,
  value: unknown,
  allowedValues: readonly T[],
): T {
  const parsed = parseNonEmptyString(context, value);

  if (!allowedValues.includes(parsed as T)) {
    throw new Error(`${context} is unsupported.`);
  }

  return parsed as T;
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

function parseUniqueNonEmptyStringList(context: string, value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context} must be a non-empty array.`);
  }

  const parsed = value.map((item, index) => parseNonEmptyString(`${context}[${index}]`, item));
  const unique = new Set(parsed);

  if (unique.size !== parsed.length) {
    throw new Error(`${context} must not contain duplicates.`);
  }

  return parsed;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be JSON.");
  }
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}) {
  const responseHeaders = new Headers(headers);

  responseHeaders.set("Content-Type", "application/json");

  return new Response(JSON.stringify(body), {
    headers: responseHeaders,
    status,
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error.";
}
