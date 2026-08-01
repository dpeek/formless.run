import {
  IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_PATH,
  IDENTITY_ACCESS_PERSON_REMOVAL_API_PATH,
  IDENTITY_ACCESS_PERSON_ROLE_REPLACEMENT_API_PATH,
  IDENTITY_COLLABORATOR_INVITATION_REVOKE_API_PATH,
  IDENTITY_COLLABORATOR_INVITATIONS_API_PATH,
  IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX,
  identityControlPlaneRecordSourceEntityName,
  identityControlPlaneRoleKeys,
  resolveIdentityProgramCallerFacts,
  validateIdentityCollaboratorInvitationGrants,
  validateIdentityControlPlaneRecords,
  type IdentityAccessInvitationSummary,
  type IdentityAccessInvitationGrantAuthoritySummary,
  type IdentityAccessInvitationGrantOptions,
  type IdentityAccessInvitationMembershipGrantOption,
  type IdentityAccessInvitationRoleGrantOption,
  type IdentityAccessManagementSummary,
  type IdentityAccessPersonMutationErrorResponse,
  type IdentityAccessPersonMutationFailureReason,
  type IdentityAccessPersonRemovalRequest,
  type IdentityAccessPersonRemovalResponse,
  type IdentityAccessPersonRoleReplacementRequest,
  type IdentityAccessPersonRoleReplacementResponse,
  type IdentityAccessPersonRoleSelection,
  type IdentityAccessPersonSummary,
  type IdentityAccessProgramRoleSummary,
  type IdentityAccessRoleSummary,
  type IdentityCollaboratorInvitationGrantRecord,
  type IdentityCollaboratorInvitationRevokeErrorResponse,
  type IdentityCollaboratorInvitationRevokeFailureReason,
  type IdentityCollaboratorInvitationRevokeRequest,
  type IdentityCollaboratorInvitationRevokeResponse,
  type IdentityContainerStatus,
  type IdentityControlPlaneRoleKey,
  type IdentityGroupValues,
  type IdentityInvitationValues,
  type IdentityInvitationStatus,
  type IdentityInvitationTargetSurface,
  type IdentityMembershipTargetKind,
  type IdentityMembershipValues,
  type IdentityPrincipalEmailValues,
  type IdentityPrincipalKind,
  type IdentityPrincipalStatus,
  type IdentityPrincipalValues,
  type IdentityProgramRoleAssignmentValues,
  type IdentityPrincipalEmailVerificationStatus,
  type IdentityRoleAssignmentStatus,
  type IdentityRoleAssignmentValues,
  type IdentityRoleAssignmentTargetKind,
  type IdentityRoleValues,
  type IdentityOrganizationValues,
} from "@dpeek/formless-identity-control-plane";
import {
  isIdentityReferenceTargetResolution,
  type IdentityReferenceTargetLookup,
  type IdentityReferenceTargetResolution,
} from "./identity-reference-targets.ts";
import { instanceControlPlaneProductionIdentityFromRecords } from "@dpeek/formless-instance-control-plane";
import { parseAuthorizationRoleId } from "@dpeek/formless-schema";
import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
import type { OperationCommandOutput } from "../shared/operation-invocation.ts";
import type { OwnerIdentity, OwnerIdentityInput } from "../shared/protocol.ts";
import {
  authorizeOperationalManagement,
  type AuthorityAdminGuardEnv,
} from "./authority-admin-guard.ts";
import { normalizeEmailDeliveryAddress } from "../shared/email-runtime.ts";
import type { EmailDeliveryRecord, EmailDeliveryScheduleRequest } from "../shared/email-runtime.ts";
import {
  INTERNAL_IDENTITY_ACTIVE_PRINCIPAL_PATH,
  INTERNAL_IDENTITY_ACCOUNT_COMPLETION_STATE_PATH,
  INTERNAL_IDENTITY_EMAIL_VERIFICATION_COMMIT_PATH,
  INTERNAL_IDENTITY_OWNER_PATH,
  INTERNAL_IDENTITY_OWNER_PRINCIPAL_PATH,
  INTERNAL_IDENTITY_PRINCIPAL_AUTHORITY_PATH,
  INTERNAL_IDENTITY_OWNER_RESET_PATH,
  type AccountCompletionIdentityState,
  type ActiveIdentityAuthority,
  type ActiveIdentityPrincipal,
} from "./identity-owner-internal.ts";
import { parseAccountCompletionGateTarget } from "../shared/instance-auth.ts";
import type { OwnerSession } from "./owner-session.ts";
import { BadRequestError } from "./errors.ts";
import { formlessProgramSchema } from "../program/runtime.ts";
import {
  ActiveSchemaRefreshBlockedError,
  getBootstrapRecords,
  removeStorageRecords,
  writeRecordSetForCommandOperationOutcome,
  type RecordConstraintValidator,
  type OperationRecordWritePlan,
  type WriteOutcome,
} from "./storage.ts";
import {
  resolveConfiguredDefaultCloudflareSender,
  resolveDefaultEmailSenderReference,
  scheduleEmailDelivery,
  type EmailDeliveryQueueBinding,
} from "./email-runtime.ts";
import { readEmailDeliveryByScheduleRequest } from "./email-runtime-state.ts";
import {
  buildCollaboratorInvitationLink,
  createCollaboratorInvitationToken,
  generateCollaboratorInvitationToken,
  hashCollaboratorInvitationToken,
  revokeCollaboratorInvitationToken,
  type RevokeCollaboratorInvitationTokenResult,
} from "./instance-auth-state.ts";
import { hostAuthSessionTargetFromRequestHeaders } from "./instance-auth-handoff.ts";
import { readControlPlaneRecords } from "./deployment-control-plane-client.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { nowIsoString } from "../shared/clock.ts";
import { FORMLESS_PROGRAM_STORAGE_IDENTITY } from "../program/target.ts";
import { validateFormlessProgramRecords } from "../program/runtime.ts";
import {
  ensureFormlessProgramStorage,
  isCurrentFormlessProgramRecord,
  isIdentityProgramRecord,
  selectCurrentFormlessProgramRecords,
} from "./program-authority.ts";

const invitationTargetSurfaces = ["instance", "organization"] as const;
const invitationStatuses = [
  "accepted",
  "expired",
  "pending",
  "revoked",
] as const satisfies readonly IdentityInvitationStatus[];
const membershipTargetKinds = ["group", "organization"] as const;
const builtInRoleCreatedAt = "2026-06-26T00:00:00.000Z";
const collaboratorInvitationLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const collaboratorInvitationDeliveryMessageKind = "identity.collaboratorInvitation";
const collaboratorInvitationDeliveryPurpose = "collaborator-invitation-delivery";
export const INTERNAL_COLLABORATOR_INVITATION_DELIVERY_PATH =
  "/_internal/identity/collaborator-invitation-delivery";
export const INTERNAL_COLLABORATOR_INVITATION_TOKEN_REVOKE_PATH =
  "/_internal/identity/collaborator-invitation-token-revoke";
export const INTERNAL_COLLABORATOR_INVITATION_ACCEPTANCE_STATUS_PATH =
  "/_internal/identity/collaborator-invitation-acceptance-status";
export const INTERNAL_COLLABORATOR_INVITATION_ACCEPTANCE_COMMIT_PATH =
  "/_internal/identity/collaborator-invitation-acceptance-commit";
export const INTERNAL_OWNER_SETUP_ACTIVATION_COMMIT_PATH =
  "/_internal/identity/owner-setup-activation-commit";
export const INTERNAL_TERMS_ACCEPTANCE_COMMIT_PATH = "/_internal/identity/terms-acceptance-commit";
export const INTERNAL_IDENTITY_APP_REFERENCE_TARGET_PATH =
  "/_internal/identity/app-reference-target";
function ensureIdentityControlPlaneStorage(storage: DurableObjectStorage) {
  ensureFormlessProgramStorage(storage, undefined);
}

type IdentityControlPlaneApiEnv = AuthorityAdminGuardEnv & {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
  FORMLESS_EMAIL_DELIVERY_QUEUE?: EmailDeliveryQueueBinding;
};

export type IdentityOwnerEnv = {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
};

type CollaboratorInvitationDeliveryResult =
  | {
      delivery: EmailDeliveryRecord;
      queued: boolean;
      replayed: boolean;
      status: "scheduled";
    }
  | {
      reason:
        | "email-delivery-scheduling-failed"
        | "existing-token-without-delivery"
        | "missing-auth-email-configuration"
        | "missing-email-delivery-queue";
      status: "skipped";
    };

type CreateCollaboratorInvitationResponse = {
  delivery: CollaboratorInvitationDeliveryResult;
  invitation: StoredRecord;
  output: OperationCommandOutput;
  records: StoredRecord[];
  status: "committed" | "replayed";
};
type CreateCollaboratorInvitationWriteResponse = Omit<
  CreateCollaboratorInvitationResponse,
  "delivery"
>;

type RevokeCollaboratorInvitationResult =
  | {
      body: IdentityCollaboratorInvitationRevokeResponse;
      ok: true;
    }
  | {
      body: IdentityCollaboratorInvitationRevokeErrorResponse;
      ok: false;
      status: number;
    };

type IdentityAccessMutationActor = {
  principalId?: string;
  trustedAdmin: boolean;
};

type IdentityAccessMutationAuthority = {
  instanceOwner: boolean;
  programAdministrator: boolean;
};

class IdentityAccessPersonMutationError extends Error {
  readonly reason: IdentityAccessPersonMutationFailureReason;
  readonly status: number;

  constructor(message: string, reason: IdentityAccessPersonMutationFailureReason, status: number) {
    super(message);
    this.name = "IdentityAccessPersonMutationError";
    this.reason = reason;
    this.status = status;
  }

  body(): IdentityAccessPersonMutationErrorResponse {
    return { error: this.message, reason: this.reason };
  }
}

type CollaboratorInvitationTokenRevocationInput = {
  invitationId: string;
  now: string;
};
type CollaboratorInvitationTokenRevocationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: Extract<
        RevokeCollaboratorInvitationTokenResult,
        {
          ok: false;
        }
      >["reason"];
    };
type CollaboratorInvitationTargetFacts = {
  targetOrganization?: string;
  targetSurface: IdentityInvitationTargetSurface;
};

type CollaboratorInvitationPrincipalInput = {
  displayName: string;
  id?: string;
};

type CollaboratorInvitationPrincipalEmailInput = {
  id?: string;
  primary: boolean;
  recovery: boolean;
};

type CollaboratorInvitationMembershipInput = {
  id?: string;
  targetGroup?: string;
  targetKind: IdentityMembershipTargetKind;
  targetOrganization?: string;
};

type CollaboratorInvitationRoleAssignmentInput =
  | {
      id?: string;
      roleId: `role_${string}`;
      scopeKind: "program";
    }
  | {
      id?: string;
      role: string;
      scopeKind: "instance";
    };

type CreateCollaboratorInvitationBaseInput = {
  expiresAt: string;
  idempotencyKey: string;
  invitedPrincipal?: CollaboratorInvitationPrincipalInput;
  invitationId?: string;
  memberships: CollaboratorInvitationMembershipInput[];
  now?: string;
  principalEmail?: CollaboratorInvitationPrincipalEmailInput;
  roleAssignments: CollaboratorInvitationRoleAssignmentInput[];
  targetEmail: string;
};

type ParsedCreateCollaboratorInvitationInput = CreateCollaboratorInvitationBaseInput & {
  acceptanceTarget?: CollaboratorInvitationTargetFacts;
};

type CreateCollaboratorInvitationInput = CreateCollaboratorInvitationBaseInput &
  CollaboratorInvitationTargetFacts;

type CollaboratorInvitationDeliveryInput = CollaboratorInvitationTargetFacts & {
  createdAt: string;
  expiresAt: string;
  invitationId: string;
  targetEmail: string;
};

export type IdentityCollaboratorInvitationAcceptanceStatus = CollaboratorInvitationTargetFacts & {
  expiresAt: string;
  invitedPrincipalId?: string;
  invitationId: string;
  invitedPrincipalDisplayName?: string;
  status: IdentityInvitationStatus;
  targetEmail: string;
};

export type IdentityCollaboratorInvitationAcceptanceCommitInput =
  CollaboratorInvitationTargetFacts & {
    invitationId: string;
    now: string;
    principalId: string;
    targetEmail: string;
  };

export type IdentityCollaboratorInvitationAcceptanceCommitFailureReason =
  | "accepted-invitation"
  | "expired-invitation"
  | "identity-validation-failed"
  | "missing-invitation"
  | "revoked-invitation"
  | "wrong-email"
  | "wrong-principal"
  | "wrong-target";

export type IdentityCollaboratorInvitationAcceptanceCommitResult =
  | {
      invitation: IdentityCollaboratorInvitationAcceptanceStatus;
      ok: true;
      output: OperationCommandOutput;
      principalId: string;
      records: StoredRecord[];
      status: "committed" | "replayed";
    }
  | {
      error: string;
      ok: false;
      reason: IdentityCollaboratorInvitationAcceptanceCommitFailureReason;
    };

export type IdentityEmailVerificationCommitInput = {
  challengeId: string;
  displayEmail: string;
  normalizedEmail: string;
  principalId: string;
  primary: boolean;
  recovery: boolean;
  verifiedAt: string;
};

export type IdentityEmailVerificationPrincipalEmailSummary = {
  displayEmail: string;
  normalizedEmail: string;
  primary: boolean;
  principalEmailId: string;
  recovery: boolean;
  verificationStatus: "verified";
  verifiedAt: string;
};

export type IdentityEmailVerificationCommitFailureReason =
  | "email-owned-by-another-principal"
  | "identity-validation-failed"
  | "missing-principal";

export type IdentityEmailVerificationCommitResult =
  | {
      ok: true;
      output: OperationCommandOutput;
      principalEmail: IdentityEmailVerificationPrincipalEmailSummary;
      records: StoredRecord[];
      status: "committed" | "replayed";
    }
  | {
      error: string;
      ok: false;
      reason: IdentityEmailVerificationCommitFailureReason;
    };

export type IdentityOwnerSetupActivationCommitInput = {
  activatedAt: string;
  completionId: string;
  displayEmail: string;
  displayName: string;
  normalizedEmail: string;
  principalId: string;
};

export type IdentityOwnerSetupActivationCommitFailureReason =
  | "email-owned-by-another-principal"
  | "identity-validation-failed"
  | "owner-already-active";

export type IdentityOwnerSetupActivationCommitResult =
  | {
      ok: true;
      output: OperationCommandOutput;
      owner: OwnerIdentity;
      principalEmail: IdentityEmailVerificationPrincipalEmailSummary;
      records: StoredRecord[];
      status: "committed" | "replayed";
    }
  | {
      error: string;
      ok: false;
      reason: IdentityOwnerSetupActivationCommitFailureReason;
    };

export type IdentityTermsAcceptanceCommitInput = {
  acceptedAt: string;
  acceptedPolicyIds: string[];
  acceptanceId: string;
  principalId: string;
  target: ReturnType<typeof parseAccountCompletionGateTarget>;
};

export type IdentityTermsAcceptanceSummary = {
  acceptedAt: string;
  accountPolicyId: string;
  principalId: string;
  principalPolicyAcceptanceId: string;
  status: "accepted";
};

export type IdentityTermsAcceptanceCommitFailureReason =
  | "identity-validation-failed"
  | "inactive-principal"
  | "invalid-policy";

export type IdentityTermsAcceptanceCommitResult =
  | {
      acceptedPolicies: IdentityTermsAcceptanceSummary[];
      ok: true;
      output: OperationCommandOutput;
      records: StoredRecord[];
      status: "committed" | "replayed";
    }
  | {
      error: string;
      ok: false;
      reason: IdentityTermsAcceptanceCommitFailureReason;
    };

export type EnsureIdentityOwnerInput = {
  now: string;
  owner: OwnerIdentityInput;
  ownerId?: string;
};

function parseIdentityCapabilityApiRoute(pathname: string): { path: `/${string}` } | undefined {
  if (
    pathname !== IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX &&
    !pathname.startsWith(`${IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX}/`)
  ) {
    return undefined;
  }

  const suffix = pathname.slice(IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX.length);

  return suffix.startsWith("/") && suffix !== "/" ? { path: suffix as `/${string}` } : undefined;
}

export async function handleIdentityControlPlaneApiRequest(
  request: Request,
  env: IdentityControlPlaneApiEnv,
): Promise<Response | undefined> {
  const route = parseIdentityCapabilityApiRoute(new URL(request.url).pathname);

  if (!route) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_PROGRAM_STORAGE_IDENTITY);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleIdentityControlPlaneDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: IdentityControlPlaneApiEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const identityOwnerResponse = await handleIdentityOwnerInternalRequest(request, storage);

  if (identityOwnerResponse) {
    return identityOwnerResponse;
  }

  const route = parseIdentityCapabilityApiRoute(url.pathname);

  if (!route) {
    return undefined;
  }

  try {
    const resolveManagementAuthority = (session: OwnerSession) =>
      Promise.resolve(readActiveIdentityAuthorityForPrincipal(storage, session.principalId));

    if (route.path === IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_PATH) {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "GET" });
      }

      const authorization = await authorizeOperationalManagement(request, env, {
        hostSessionTarget: hostAuthSessionTargetFromRequestHeaders(request.headers),
        resolveManagementAuthority,
      });

      if (!authorization.authorized) {
        return jsonResponse(
          { error: authorization.error },
          authorization.status,
          authorization.headers,
        );
      }

      return jsonResponse(
        readIdentityAccessManagementSummary(
          storage,
          identityAccessGrantAuthorityFromAuthorization(storage, authorization),
        ),
      );
    }

    if (route.path === IDENTITY_ACCESS_PERSON_ROLE_REPLACEMENT_API_PATH) {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
      }

      const authorization = await authorizeOperationalManagement(request, env, {
        hostSessionTarget: hostAuthSessionTargetFromRequestHeaders(request.headers),
        resolveManagementAuthority,
      });

      if (!authorization.authorized) {
        return jsonResponse(
          { error: authorization.error },
          authorization.status,
          authorization.headers,
        );
      }

      ensureIdentityControlPlaneStorage(storage);

      return jsonResponse(
        replaceIdentityAccessPersonRoles(
          storage,
          await readJson(request),
          identityAccessMutationActorFromAuthorization(authorization),
        ),
      );
    }

    if (route.path === IDENTITY_ACCESS_PERSON_REMOVAL_API_PATH) {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
      }

      const authorization = await authorizeOperationalManagement(request, env, {
        hostSessionTarget: hostAuthSessionTargetFromRequestHeaders(request.headers),
        resolveManagementAuthority,
      });

      if (!authorization.authorized) {
        return jsonResponse(
          { error: authorization.error },
          authorization.status,
          authorization.headers,
        );
      }

      ensureIdentityControlPlaneStorage(storage);

      return jsonResponse(
        await removeIdentityAccessPerson(
          storage,
          await readJson(request),
          identityAccessMutationActorFromAuthorization(authorization),
          { env, requestUrl: request.url },
        ),
      );
    }

    if (route.path === IDENTITY_COLLABORATOR_INVITATIONS_API_PATH) {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
      }

      const authorization = await authorizeOperationalManagement(request, env, {
        hostSessionTarget: hostAuthSessionTargetFromRequestHeaders(request.headers),
        resolveManagementAuthority,
      });

      if (!authorization.authorized) {
        return jsonResponse(
          { error: authorization.error },
          authorization.status,
          authorization.headers,
        );
      }

      ensureIdentityControlPlaneStorage(storage);

      const inviterPrincipalId =
        (authorization.via === "owner-session" || authorization.via === "host-session") &&
        typeof authorization.session?.principalId === "string"
          ? authorization.session.principalId
          : undefined;
      const created = createCollaboratorInvitation(storage, await readJson(request), {
        grantAuthorityPrincipalId: inviterPrincipalId,
        inviterPrincipalId,
      });

      return jsonResponse({
        ...created,
        delivery: await requestCollaboratorInvitationDelivery({
          env,
          invitation: created.invitation,
          requestUrl: request.url,
        }),
      });
    }

    if (route.path === IDENTITY_COLLABORATOR_INVITATION_REVOKE_API_PATH) {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
      }

      const authorization = await authorizeOperationalManagement(request, env, {
        hostSessionTarget: hostAuthSessionTargetFromRequestHeaders(request.headers),
        resolveManagementAuthority,
      });

      if (!authorization.authorized) {
        return jsonResponse(
          { error: authorization.error },
          authorization.status,
          authorization.headers,
        );
      }

      ensureIdentityControlPlaneStorage(storage);

      const revoked = await revokeCollaboratorInvitationFromAccessManagement(
        storage,
        await readJson(request),
        {
          env,
          requestUrl: request.url,
        },
      );

      return jsonResponse(revoked.body, revoked.ok ? 200 : revoked.status);
    }

    return jsonResponse({ error: "Not found." }, 404);
  } catch (error) {
    if (error instanceof ActiveSchemaRefreshBlockedError) {
      return jsonResponse({ error: error.message, blocker: error.blocker }, 409);
    }

    if (error instanceof BadRequestError) {
      return jsonResponse({ error: error.message }, 400);
    }

    if (error instanceof IdentityAccessPersonMutationError) {
      return jsonResponse(error.body(), error.status);
    }

    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

export async function handleCollaboratorInvitationDeliveryDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: IdentityControlPlaneApiEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (url.pathname !== INTERNAL_COLLABORATOR_INVITATION_DELIVERY_PATH) {
    return undefined;
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
  }

  try {
    return jsonResponse(
      await scheduleCollaboratorInvitationDelivery({
        env,
        input: parseCollaboratorInvitationDeliveryRequest(await readJson(request)),
        requestUrl: request.url,
        storage,
      }),
    );
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

export async function handleCollaboratorInvitationTokenRevocationDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (url.pathname !== INTERNAL_COLLABORATOR_INVITATION_TOKEN_REVOKE_PATH) {
    return undefined;
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
  }

  try {
    const input = parseCollaboratorInvitationTokenRevocationRequest(await readJson(request));
    const revoked = revokeCollaboratorInvitationToken(storage, input.invitationId, input.now);

    return jsonResponse(collaboratorInvitationTokenRevocationResult(revoked));
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

export async function readIdentityOwner(env: IdentityOwnerEnv): Promise<OwnerIdentity | null> {
  const response = await fetchIdentityOwnerInternal(env, INTERNAL_IDENTITY_OWNER_PATH, {
    method: "GET",
  });
  const body = (await response.json()) as {
    owner?: OwnerIdentity | null;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error ?? "Identity owner lookup failed.");
  }

  return body.owner ?? null;
}

export async function ensureIdentityOwner(
  env: IdentityOwnerEnv,
  input: EnsureIdentityOwnerInput,
): Promise<OwnerIdentity> {
  const response = await fetchIdentityOwnerInternal(env, INTERNAL_IDENTITY_OWNER_PATH, {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const body = (await response.json()) as {
    owner?: OwnerIdentity;
    error?: string;
  };
  if (!response.ok || !body.owner) {
    throw new Error(body.error ?? "Identity owner creation failed.");
  }

  return body.owner;
}

export async function resetIdentityOwner(env: IdentityOwnerEnv): Promise<void> {
  const response = await fetchIdentityOwnerInternal(env, INTERNAL_IDENTITY_OWNER_RESET_PATH, {
    method: "POST",
  });
  const body = (await response.json()) as {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error ?? "Identity owner reset failed.");
  }
}

export async function readIdentityCollaboratorInvitationAcceptanceStatus(
  env: IdentityOwnerEnv,
  invitationId: string,
): Promise<IdentityCollaboratorInvitationAcceptanceStatus | null> {
  const url = new URL(INTERNAL_COLLABORATOR_INVITATION_ACCEPTANCE_STATUS_PATH, "http://internal");

  url.searchParams.set("invitationId", invitationId);

  const response = await fetchIdentityOwnerInternal(env, `${url.pathname}${url.search}`, {
    method: "GET",
  });
  const body = (await response.json()) as {
    error?: string;
    invitation?: IdentityCollaboratorInvitationAcceptanceStatus | null;
  };

  if (!response.ok) {
    throw new Error(body.error ?? "Identity collaborator invitation lookup failed.");
  }

  return body.invitation ?? null;
}

export async function resolveIdentityAppReferenceTarget(
  env: IdentityOwnerEnv,
  lookup: IdentityReferenceTargetLookup,
): Promise<IdentityReferenceTargetResolution> {
  const response = await fetchIdentityOwnerInternal(
    env,
    INTERNAL_IDENTITY_APP_REFERENCE_TARGET_PATH,
    {
      body: JSON.stringify(lookup),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );

  if (!response.ok) {
    return { kind: "unavailable" };
  }
  const body = (await response.json()) as {
    resolution?: unknown;
  };
  return isIdentityReferenceTargetResolution(body.resolution)
    ? body.resolution
    : { kind: "unavailable" };
}

export async function acceptIdentityCollaboratorInvitation(
  env: IdentityOwnerEnv,
  input: IdentityCollaboratorInvitationAcceptanceCommitInput,
): Promise<IdentityCollaboratorInvitationAcceptanceCommitResult> {
  const response = await fetchIdentityOwnerInternal(
    env,
    INTERNAL_COLLABORATOR_INVITATION_ACCEPTANCE_COMMIT_PATH,
    {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  const body = (await response.json()) as
    | IdentityCollaboratorInvitationAcceptanceCommitResult
    | {
        error?: string;
      };
  if (!response.ok || !isIdentityCollaboratorInvitationAcceptanceCommitResult(body)) {
    throw new Error(
      responseBodyError(body) ?? "Identity collaborator invitation acceptance failed.",
    );
  }

  return body;
}

export async function commitIdentityEmailVerification(
  env: IdentityOwnerEnv,
  input: IdentityEmailVerificationCommitInput,
): Promise<IdentityEmailVerificationCommitResult> {
  const response = await fetchIdentityOwnerInternal(
    env,
    INTERNAL_IDENTITY_EMAIL_VERIFICATION_COMMIT_PATH,
    {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  const body = (await response.json()) as
    | IdentityEmailVerificationCommitResult
    | {
        error?: string;
      };
  if (!response.ok || !isIdentityEmailVerificationCommitResult(body)) {
    throw new Error(responseBodyError(body) ?? "Identity email verification commit failed.");
  }

  return body;
}

export async function commitIdentityOwnerSetupActivation(
  env: IdentityOwnerEnv,
  input: IdentityOwnerSetupActivationCommitInput,
): Promise<IdentityOwnerSetupActivationCommitResult> {
  const response = await fetchIdentityOwnerInternal(
    env,
    INTERNAL_OWNER_SETUP_ACTIVATION_COMMIT_PATH,
    {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  const body = (await response.json()) as
    | IdentityOwnerSetupActivationCommitResult
    | {
        error?: string;
      };
  if (!response.ok || !isIdentityOwnerSetupActivationCommitResult(body)) {
    throw new Error(responseBodyError(body) ?? "Identity owner setup activation failed.");
  }

  return body;
}

async function fetchIdentityOwnerInternal(
  env: IdentityOwnerEnv,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_PROGRAM_STORAGE_IDENTITY);

  return env.FORMLESS_AUTHORITY.get(id).fetch(new Request(`http://internal${path}`, init));
}

async function handleIdentityOwnerInternalRequest(
  request: Request,
  storage: DurableObjectStorage,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (url.pathname === INTERNAL_IDENTITY_APP_REFERENCE_TARGET_PATH) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
    }

    ensureIdentityControlPlaneStorage(storage);

    return jsonResponse({
      resolution: resolveIdentityAppReferenceTargetFromStorage(
        storage,
        parseIdentityAppReferenceTargetLookup(await readJson(request)),
      ),
    });
  }

  if (url.pathname === INTERNAL_IDENTITY_OWNER_RESET_PATH) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
    }

    ensureIdentityControlPlaneStorage(storage);
    removeStorageRecords(storage, getBootstrapRecords(storage).filter(isIdentityProgramRecord), {
      validate: (records) =>
        validateFormlessProgramRecords("Identity reset Program records", records),
      writeId: "identity-owner:reset",
    });
    ensureIdentityControlPlaneStorage(storage);

    return jsonResponse({ reset: true });
  }

  if (url.pathname === INTERNAL_IDENTITY_OWNER_PRINCIPAL_PATH) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "GET" });
    }

    const principalId = parseNonEmptyString(
      "Identity owner principal id",
      url.searchParams.get("principalId"),
    );

    return jsonResponse({ owner: readActiveIdentityOwnerForPrincipal(storage, principalId) });
  }

  if (url.pathname === INTERNAL_IDENTITY_ACTIVE_PRINCIPAL_PATH) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "GET" });
    }

    const principalId = parseNonEmptyString(
      "Identity active principal id",
      url.searchParams.get("principalId"),
    );

    return jsonResponse({ principal: readActiveIdentityPrincipal(storage, principalId) });
  }

  if (url.pathname === INTERNAL_IDENTITY_PRINCIPAL_AUTHORITY_PATH) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "GET" });
    }

    const principalId = parseNonEmptyString(
      "Identity principal authority id",
      url.searchParams.get("principalId"),
    );

    return jsonResponse({
      authority: readActiveIdentityAuthorityForPrincipal(storage, principalId),
    });
  }

  if (url.pathname === INTERNAL_IDENTITY_ACCOUNT_COMPLETION_STATE_PATH) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
    }

    ensureIdentityControlPlaneStorage(storage);

    return jsonResponse({
      state: readAccountCompletionIdentityState(
        storage,
        parseAccountCompletionStateRequest(await readJson(request)),
      ),
    });
  }

  if (url.pathname === INTERNAL_COLLABORATOR_INVITATION_ACCEPTANCE_STATUS_PATH) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "GET" });
    }

    const invitationId = parseNonEmptyString(
      "Identity collaborator invitation id",
      url.searchParams.get("invitationId"),
    );

    return jsonResponse({
      invitation: readCollaboratorInvitationAcceptanceStatus(storage, invitationId),
    });
  }

  if (url.pathname === INTERNAL_COLLABORATOR_INVITATION_ACCEPTANCE_COMMIT_PATH) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
    }

    const result = acceptCollaboratorInvitationIntoIdentity(storage, await readJson(request));

    return jsonResponse(result);
  }

  if (url.pathname === INTERNAL_IDENTITY_EMAIL_VERIFICATION_COMMIT_PATH) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
    }

    const result = commitEmailVerificationIntoIdentity(storage, await readJson(request));

    return jsonResponse(result);
  }

  if (url.pathname === INTERNAL_OWNER_SETUP_ACTIVATION_COMMIT_PATH) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
    }

    const result = commitOwnerSetupActivationIntoIdentity(storage, await readJson(request));

    return jsonResponse(result);
  }

  if (url.pathname === INTERNAL_TERMS_ACCEPTANCE_COMMIT_PATH) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
    }

    const result = commitTermsAcceptanceIntoIdentity(storage, await readJson(request));

    return jsonResponse(result);
  }

  if (url.pathname !== INTERNAL_IDENTITY_OWNER_PATH) {
    return undefined;
  }

  try {
    if (request.method === "GET") {
      return jsonResponse({ owner: readActiveIdentityOwner(storage) });
    }

    if (request.method === "POST") {
      const input = parseEnsureIdentityOwnerRequest(await readJson(request));
      const result = ensureIdentityOwnerRecords(storage, input);

      return jsonResponse(result);
    }

    return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "GET, POST" });
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

function parseIdentityAppReferenceTargetLookup(value: unknown): IdentityReferenceTargetLookup {
  const object = parseRecord("Identity app reference target lookup", value);

  assertAllowedKeys("Identity app reference target lookup", object, ["id", "target"]);

  return {
    id: parseNonEmptyString("Identity app reference target id", object.id),
    target: parseNonEmptyString("Identity app reference target", object.target),
  };
}

function parseAccountCompletionStateRequest(value: unknown): {
  principalId: string;
  target: ReturnType<typeof parseAccountCompletionGateTarget>;
} {
  const object = parseRecord("Identity account completion state request", value);

  assertAllowedKeys("Identity account completion state request", object, ["principalId", "target"]);

  return {
    principalId: parseNonEmptyString(
      "Identity account completion principal id",
      object.principalId,
    ),
    target: parseAccountCompletionGateTarget(object.target),
  };
}

function resolveIdentityAppReferenceTargetFromStorage(
  storage: DurableObjectStorage,
  lookup: IdentityReferenceTargetLookup,
): IdentityReferenceTargetResolution {
  const entity = identityAppReferenceTargetEntity(lookup.target);

  if (entity === undefined) {
    return { kind: "unsupported" };
  }

  const record = getBootstrapRecords(storage).find((candidate) => candidate.id === lookup.id);

  if (!record) {
    return { kind: "missing" };
  }

  if (identityControlPlaneRecordSourceEntityName(record.entity) !== entity) {
    return { kind: "wrong-entity" };
  }

  if (record.deletedAt) {
    return { kind: "tombstoned" };
  }

  return { kind: "active" };
}

function identityAppReferenceTargetEntity(
  value: string,
): "group" | "organization" | "principal" | undefined {
  if (value === "auth:principal") {
    return "principal";
  }

  if (value === "auth:organization") {
    return "organization";
  }

  if (value === "auth:group") {
    return "group";
  }

  return undefined;
}

function ensureIdentityOwnerRecords(
  storage: DurableObjectStorage,
  input: EnsureIdentityOwnerInput,
): {
  created: boolean;
  owner: OwnerIdentity;
} {
  const existingOwner = readActiveIdentityOwner(storage);
  if (existingOwner) {
    return { created: false, owner: existingOwner };
  }

  ensureIdentityControlPlaneStorage(storage);

  const records = selectCurrentFormlessProgramRecords(getBootstrapRecords(storage));
  const now = parseNonEmptyString("Identity owner createdAt", input.now);
  const ownerInput = normalizeIdentityOwnerInput(input.owner);
  const principalId =
    input.ownerId === undefined
      ? crypto.randomUUID()
      : parseNonEmptyString("Identity owner principal id", input.ownerId);
  const newRecords = identityOwnerRecords({
    now,
    owner: ownerInput,
    principalId,
    records,
  });

  const candidateRecords = [...records, ...newRecords];
  validateIdentityControlPlaneRecords(
    "Identity owner records",
    candidateRecords.filter(isIdentityProgramRecord).filter(isCurrentFormlessProgramRecord),
    {
      authorizationRoles: formlessProgramSchema.authorization?.roles,
      candidateRecords,
    },
  );

  writeRecordSetForCommandOperationOutcome(
    storage,
    `identity-owner:ensure:${principalId}`,
    newRecords.map(
      (record): OperationRecordWritePlan => ({
        kind: "create",
        entity: record.entity,
        id: record.id,
        values: record.values,
      }),
    ),
    undefined,
    { now },
  );

  const owner = readActiveIdentityOwner(storage);

  if (!owner) {
    throw new Error("Identity owner records did not produce an active owner.");
  }

  return { created: true, owner };
}

function identityAccessGrantAuthorityFromAuthorization(
  storage: DurableObjectStorage,
  authorization: {
    session?: {
      principalId?: string;
    };
    via: "admin-bearer" | "central-session" | "host-session" | "owner-session" | "open";
  },
): IdentityAccessInvitationGrantAuthoritySummary {
  const principalId = authorization.session?.principalId;

  if (principalId !== undefined) {
    const authority = readActiveIdentityAuthorityForPrincipal(storage, principalId);

    return {
      instanceOwner: authority?.callerFacts.owner === true,
      programAdministrator:
        authority?.callerFacts.roleId === identityAccessProgramRoleByKey("administrator")?.id,
    };
  }

  return {
    instanceOwner: true,
    programAdministrator: true,
  };
}

function readIdentityAccessManagementSummary(
  storage: DurableObjectStorage,
  grantAuthority: IdentityAccessInvitationGrantAuthoritySummary,
): IdentityAccessManagementSummary {
  ensureIdentityControlPlaneStorage(storage);

  const records = selectCurrentFormlessProgramRecords(getBootstrapRecords(storage));
  const primaryEmails = primaryIdentityAccessEmailsByPrincipal(records);
  const roleRecords = new Map(
    identityAccessRecordsForEntity(records, "role").map((record) => [record.id, record]),
  );
  const activePersonIds = new Set(
    identityAccessRecordsForEntity(records, "principal")
      .filter((record) => (record.values as IdentityPrincipalValues).status !== "disabled")
      .map((record) => record.id),
  );

  return {
    groups: identityAccessRecordsForEntity(records, "group").map((record) => {
      const values = record.values as IdentityGroupValues;

      return {
        createdAt: record.createdAt,
        displayName: values.displayName,
        groupId: record.id,
        status: values.status as IdentityContainerStatus,
        updatedAt: record.updatedAt,
      };
    }),
    invitationGrantOptions: identityAccessInvitationGrantOptions(records, grantAuthority),
    invitations: identityAccessRecordsForEntity(records, "invitation")
      .filter((record) => (record.values as IdentityInvitationValues).status !== "revoked")
      .map(identityAccessInvitationSummary),
    memberships: identityAccessRecordsForEntity(records, "membership").map((record) => {
      const values = record.values as IdentityMembershipValues;

      return {
        createdAt: record.createdAt,
        membershipId: record.id,
        principalId: values.principal,
        status: values.status,
        ...(values.targetGroup === undefined ? {} : { targetGroupId: values.targetGroup }),
        targetKind: values.targetKind,
        ...(values.targetOrganization === undefined
          ? {}
          : { targetOrganizationId: values.targetOrganization }),
        updatedAt: record.updatedAt,
      };
    }),
    organizations: identityAccessRecordsForEntity(records, "organization").map((record) => {
      const values = record.values as IdentityOrganizationValues;

      return {
        createdAt: record.createdAt,
        displayName: values.displayName,
        organizationId: record.id,
        status: values.status as IdentityContainerStatus,
        updatedAt: record.updatedAt,
      };
    }),
    people: identityAccessRecordsForEntity(records, "principal")
      .filter((record) => activePersonIds.has(record.id))
      .map((record) => identityAccessPersonSummary(record, primaryEmails.get(record.id))),
    programRoles: identityAccessRecordsForEntity(records, "program-role-assignment")
      .filter((record) => {
        const values = record.values as IdentityProgramRoleAssignmentValues;

        return (
          values.status === "active" &&
          activePersonIds.has(values.principal) &&
          identityAccessProgramRoleById(values.roleId) !== undefined
        );
      })
      .map(identityAccessProgramRoleSummary),
    roles: identityAccessRecordsForEntity(records, "role-assignment")
      .filter((record) => {
        const values = record.values as IdentityRoleAssignmentValues;

        return (
          values.status === "active" &&
          (values.targetKind !== "principal" ||
            (values.targetPrincipal !== undefined && activePersonIds.has(values.targetPrincipal)))
        );
      })
      .map((record) => identityAccessRoleSummary(record, roleRecords)),
  };
}

function identityAccessProgramRoleSummary(record: StoredRecord): IdentityAccessProgramRoleSummary {
  const values = record.values as IdentityProgramRoleAssignmentValues;
  const role = identityAccessProgramRoleById(values.roleId);

  if (!role) {
    throw new Error(`Identity access summary Program role "${values.roleId}" is missing.`);
  }

  return {
    createdAt: record.createdAt,
    displayLabel: role.label,
    roleAssignmentId: record.id,
    roleId: role.id,
    roleKey: role.key,
    scopeKind: "program",
    status: values.status,
    targetPrincipalId: values.principal,
    updatedAt: record.updatedAt,
  };
}

function identityAccessPersonSummary(
  record: StoredRecord,
  primaryEmail?: StoredRecord,
): IdentityAccessPersonSummary {
  const values = record.values as IdentityPrincipalValues;

  return {
    createdAt: record.createdAt,
    displayName: values.displayName,
    kind: values.kind as IdentityPrincipalKind,
    ...(primaryEmail === undefined
      ? {}
      : { primaryEmail: identityAccessPrimaryEmailSummary(primaryEmail) }),
    principalId: record.id,
    status: values.status as IdentityPrincipalStatus,
    updatedAt: record.updatedAt,
  };
}

function identityAccessRoleSummary(
  record: StoredRecord,
  roleRecords: ReadonlyMap<string, StoredRecord>,
): IdentityAccessRoleSummary {
  const values = record.values as IdentityRoleAssignmentValues;
  const role = roleRecords.get(values.role);

  if (!role) {
    throw new Error(`Identity access summary role "${values.role}" is missing.`);
  }

  const roleValues = role.values as IdentityRoleValues;

  return {
    createdAt: record.createdAt,
    displayLabel: roleValues.displayLabel,
    roleAssignmentId: record.id,
    roleId: role.id,
    roleKey: roleValues.key,
    scopeKind: values.scopeKind,
    ...(values.scopeOrganization === undefined
      ? {}
      : { scopeOrganizationId: values.scopeOrganization }),
    status: values.status as IdentityRoleAssignmentStatus,
    ...(values.targetGroup === undefined ? {} : { targetGroupId: values.targetGroup }),
    targetKind: values.targetKind as IdentityRoleAssignmentTargetKind,
    ...(values.targetOrganization === undefined
      ? {}
      : { targetOrganizationId: values.targetOrganization }),
    ...(values.targetPrincipal === undefined ? {} : { targetPrincipalId: values.targetPrincipal }),
    updatedAt: record.updatedAt,
  };
}

function identityAccessInvitationGrantOptions(
  records: readonly StoredRecord[],
  authority: IdentityAccessInvitationGrantAuthoritySummary,
): IdentityAccessInvitationGrantOptions {
  return {
    authority,
    memberships: identityAccessInvitationMembershipGrantOptions(records, authority),
    roles: identityAccessInvitationRoleGrantOptions(records, authority),
  };
}

function identityAccessInvitationSummary(record: StoredRecord): IdentityAccessInvitationSummary {
  const values = record.values as IdentityInvitationValues;

  return {
    ...(values.acceptedAt === undefined ? {} : { acceptedAt: values.acceptedAt }),
    createdAt: record.createdAt,
    expiresAt: values.expiresAt,
    ...(values.invitedPrincipal === undefined
      ? {}
      : { invitedPrincipalId: values.invitedPrincipal }),
    invitationId: record.id,
    ...(values.inviterPrincipal === undefined
      ? {}
      : { inviterPrincipalId: values.inviterPrincipal }),
    status: values.status,
    targetEmail: values.targetEmail,
    ...(values.targetOrganization === undefined
      ? {}
      : { targetOrganizationId: values.targetOrganization }),
    targetSurface: values.targetSurface,
    updatedAt: record.updatedAt,
  };
}

function identityAccessInvitationRoleGrantOptions(
  records: readonly StoredRecord[],
  authority: IdentityAccessInvitationGrantAuthoritySummary,
): IdentityAccessInvitationRoleGrantOption[] {
  const activeRoleKeys = new Set(
    identityAccessRecordsForEntity(records, "role")
      .filter((record) => (record.values as IdentityRoleValues).status === "active")
      .map((record) => (record.values as IdentityRoleValues).key),
  );
  const options: IdentityAccessInvitationRoleGrantOption[] = [];

  if (authority.instanceOwner && activeRoleKeys.has("instance.owner")) {
    options.push({
      displayLabel: identityAccessInvitationRoleGrantDisplayLabel("Instance", "instance.owner"),
      roleKey: "instance.owner",
      scopeKind: "instance",
    });
  }

  if (authority.instanceOwner || authority.programAdministrator) {
    for (const role of formlessProgramSchema.authorization?.roles ?? []) {
      if (
        !authority.instanceOwner &&
        role.key !== "member" &&
        role.key !== "editor" &&
        role.key !== "administrator"
      ) {
        continue;
      }

      options.push({
        displayLabel: `Program — ${role.label}`,
        roleId: role.id,
        roleKey: role.key,
        scopeKind: "program",
      });
    }
  }

  return options;
}

function identityAccessInvitationRoleGrantDisplayLabel(
  surfaceLabel: string,
  roleKey: IdentityControlPlaneRoleKey,
): string {
  return `${surfaceLabel} — ${identityAccessRoleLevelLabel(roleKey)}`;
}

function identityAccessInvitationMembershipGrantOptions(
  records: readonly StoredRecord[],
  authority: IdentityAccessInvitationGrantAuthoritySummary,
): IdentityAccessInvitationMembershipGrantOption[] {
  if (!authority.instanceOwner) {
    return [];
  }

  return [
    ...identityAccessRecordsForEntity(records, "organization")
      .filter((record) => (record.values as IdentityOrganizationValues).status === "active")
      .map((record): IdentityAccessInvitationMembershipGrantOption => {
        const values = record.values as IdentityOrganizationValues;

        return {
          displayLabel: values.displayName,
          targetKind: "organization",
          targetOrganizationId: record.id,
        };
      }),
    ...identityAccessRecordsForEntity(records, "group")
      .filter((record) => (record.values as IdentityGroupValues).status === "active")
      .map((record): IdentityAccessInvitationMembershipGrantOption => {
        const values = record.values as IdentityGroupValues;

        return {
          displayLabel: values.displayName,
          targetGroupId: record.id,
          targetKind: "group",
        };
      }),
  ].sort((left, right) => left.displayLabel.localeCompare(right.displayLabel));
}

function identityAccessRecordsForEntity(
  records: readonly StoredRecord[],
  entity: string,
): StoredRecord[] {
  return records
    .filter((record) => record.entity === entity && !record.deletedAt)
    .sort(compareStoredRecords);
}

function primaryIdentityAccessEmailsByPrincipal(
  records: readonly StoredRecord[],
): Map<string, StoredRecord> {
  const emails = new Map<string, StoredRecord>();

  for (const record of identityAccessRecordsForEntity(records, "principal-email")) {
    const values = record.values as IdentityPrincipalEmailValues;

    if (values.primary === true && !emails.has(values.principal)) {
      emails.set(values.principal, record);
    }
  }

  return emails;
}

function identityAccessPrimaryEmailSummary(record: StoredRecord) {
  const values = record.values as IdentityPrincipalEmailValues;

  return {
    displayEmail: values.displayEmail,
    normalizedEmail: values.normalizedEmail,
    principalEmailId: record.id,
    verificationStatus: values.verificationStatus as IdentityPrincipalEmailVerificationStatus,
    ...(values.verifiedAt === undefined ? {} : { verifiedAt: values.verifiedAt }),
  };
}

function identityAccessRoleLevelLabel(roleKey: IdentityControlPlaneRoleKey): string {
  const level = roleKey.split(".").at(-1) ?? roleKey;

  return level === "admin" ? "Administrator" : identityAccessFieldLabel(level);
}

function identityAccessProgramRoleById(roleId: string) {
  return formlessProgramSchema.authorization?.roles.find((role) => role.id === roleId);
}

function identityAccessProgramRoleByKey(roleKey: string) {
  return formlessProgramSchema.authorization?.roles.find((role) => role.key === roleKey);
}

function identityAccessFieldLabel(value: string): string {
  return value.replaceAll(/[-_]/g, " ").replace(/^\w/, (match) => match.toUpperCase());
}
function identityAccessMutationActorFromAuthorization(authorization: {
  session?: {
    principalId?: string;
  };
  via: "admin-bearer" | "central-session" | "host-session" | "owner-session" | "open";
}): IdentityAccessMutationActor {
  return {
    ...(typeof authorization.session?.principalId === "string"
      ? { principalId: authorization.session.principalId }
      : {}),
    trustedAdmin: authorization.via === "admin-bearer",
  };
}

function replaceIdentityAccessPersonRoles(
  storage: DurableObjectStorage,
  value: unknown,
  actor: IdentityAccessMutationActor,
): IdentityAccessPersonRoleReplacementResponse {
  const input = parseIdentityAccessPersonRoleReplacementRequest(value);
  const records = selectCurrentFormlessProgramRecords(getBootstrapRecords(storage));
  const authority = currentIdentityAccessMutationAuthority(records, actor);
  const principal = currentIdentityAccessMutationPrincipal(records, input.principalId, {
    activeOnly: true,
  });
  const rolesById = identityAccessRoleRecordsById(records);
  const desiredBySurface = new Map<string, IdentityAccessPersonRoleSelection>();

  for (const selection of input.roles) {
    const surfaceKey = identityAccessRoleSelectionSurfaceKey(selection);

    if (desiredBySurface.has(surfaceKey)) {
      throw identityAccessPersonMutationError(
        "A person may have only one active role level for each access surface.",
        "invalid-role-selection",
      );
    }

    if (!identityAccessRoleSelectionIsEditable(selection, authority)) {
      throw identityAccessPersonMutationError(
        "Current principal cannot manage the requested role assignment.",
        "protected-assignment",
      );
    }

    if (selection.scopeKind !== "program") {
      const role = identityAccessActiveRoleRecordByKey(records, selection.roleKey);

      if (!role) {
        throw identityAccessPersonMutationError(
          `Requested role "${selection.roleKey}" is unavailable.`,
          "invalid-role-selection",
        );
      }
    }

    desiredBySurface.set(surfaceKey, selection);
  }

  const currentAssignments = identityAccessPrincipalRoleAssignments(records, principal.id);
  const currentProgramAssignments = identityAccessPrincipalProgramRoleAssignments(
    records,
    principal.id,
  );

  for (const assignment of currentAssignments) {
    if (
      assignment.values.status === "active" &&
      !identityAccessRoleAssignmentIsEditable(authority) &&
      desiredBySurface.has(identityAccessRoleAssignmentSurfaceKey(assignment))
    ) {
      throw identityAccessPersonMutationError(
        "Requested roles would alter an assignment outside the current principal's authority.",
        "protected-assignment",
      );
    }
  }

  for (const assignment of currentProgramAssignments) {
    if (
      assignment.values.status === "active" &&
      !identityAccessProgramRoleAssignmentIsEditable(authority) &&
      desiredBySurface.has(JSON.stringify(["program", ""]))
    ) {
      throw identityAccessPersonMutationError(
        "Requested roles would alter an assignment outside the current principal's authority.",
        "protected-assignment",
      );
    }
  }

  assertIdentityAccessReplacementPreservesOwner(
    records,
    principal,
    currentAssignments,
    rolesById,
    desiredBySurface,
    authority,
  );

  const plans: OperationRecordWritePlan[] = [];

  for (const assignment of currentProgramAssignments) {
    if (
      assignment.values.status !== "active" ||
      !identityAccessProgramRoleAssignmentIsEditable(authority)
    ) {
      continue;
    }

    const desired = desiredBySurface.get(JSON.stringify(["program", ""]));

    if (desired?.scopeKind === "program" && desired.roleId === assignment.values.roleId) {
      continue;
    }

    plans.push({
      kind: "patch",
      record: assignment,
      values: {
        ...assignment.values,
        status: "disabled",
      },
    });
  }

  for (const assignment of currentAssignments) {
    if (assignment.values.status !== "active") {
      continue;
    }

    const roleKey = identityAccessRoleKeyForAssignment(assignment, rolesById);

    if (!identityAccessRoleAssignmentIsEditable(authority)) {
      continue;
    }

    const desired = desiredBySurface.get(identityAccessRoleAssignmentSurfaceKey(assignment));

    if (desired?.scopeKind !== "program" && desired?.roleKey === roleKey) {
      continue;
    }

    plans.push({
      kind: "patch",
      record: assignment,
      values: {
        ...assignment.values,
        status: "disabled",
      },
    });
  }

  for (const selection of desiredBySurface.values()) {
    if (selection.scopeKind === "program") {
      const active = currentProgramAssignments.find(
        (assignment) =>
          assignment.values.status === "active" && assignment.values.roleId === selection.roleId,
      );

      if (active) {
        continue;
      }

      const disabled = currentProgramAssignments.find(
        (assignment) =>
          assignment.values.status === "disabled" && assignment.values.roleId === selection.roleId,
      );

      if (disabled) {
        plans.push({
          kind: "patch",
          record: disabled,
          values: { ...disabled.values, status: "active" },
        });
      } else {
        plans.push({
          kind: "create",
          entity: "program-role-assignment",
          id: generatedIdentityRecordId("program-role-assignment"),
          values: {
            principal: principal.id,
            roleId: selection.roleId,
            status: "active",
          },
        });
      }

      continue;
    }

    const active = currentAssignments.find(
      (assignment) =>
        assignment.values.status === "active" &&
        identityAccessRoleAssignmentMatchesSelection(assignment, selection, rolesById),
    );

    if (active) {
      continue;
    }

    const disabled = currentAssignments.find(
      (assignment) =>
        assignment.values.status === "disabled" &&
        identityAccessRoleAssignmentMatchesSelection(assignment, selection, rolesById),
    );

    if (disabled) {
      plans.push({
        kind: "patch",
        record: disabled,
        values: {
          ...disabled.values,
          status: "active",
        },
      });
      continue;
    }

    const role = identityAccessActiveRoleRecordByKey(records, selection.roleKey);

    if (!role) {
      throw identityAccessPersonMutationError(
        `Requested role "${selection.roleKey}" is unavailable.`,
        "invalid-role-selection",
      );
    }

    plans.push({
      kind: "create",
      entity: "role-assignment",
      id: generatedIdentityRecordId("role-assignment"),
      values: identityAccessPersonRoleAssignmentValues(principal.id, role.id, selection),
    });
  }

  const outcome = writeRecordSetForCommandOperationOutcome(
    storage,
    `access-person-role-replacement:${input.principalId}:${input.idempotencyKey}`,
    plans,
    validateIdentityControlPlaneRecordConstraint(storage),
    input.now === undefined ? {} : { now: input.now },
  );
  const currentRecords = getBootstrapRecords(storage);
  const currentRolesById = identityAccessRoleRecordsById(currentRecords);

  return {
    principalId: principal.id,
    programRoles: identityAccessPrincipalProgramRoleAssignments(currentRecords, principal.id)
      .filter((assignment) => assignment.values.status === "active")
      .map(identityAccessProgramRoleSummary),
    roles: identityAccessPrincipalRoleAssignments(currentRecords, principal.id)
      .filter((assignment) => assignment.values.status === "active")
      .map((assignment) => identityAccessRoleSummary(assignment, currentRolesById)),
    status: outcome.kind === "replay" ? "replayed" : "committed",
  };
}

async function removeIdentityAccessPerson(
  storage: DurableObjectStorage,
  value: unknown,
  actor: IdentityAccessMutationActor,
  options: {
    env: IdentityControlPlaneApiEnv;
    requestUrl: string;
  },
): Promise<IdentityAccessPersonRemovalResponse> {
  const input = parseIdentityAccessPersonRemovalRequest(value);
  const records = getBootstrapRecords(storage);
  const authority = currentIdentityAccessMutationAuthority(records, actor);
  const principal = currentIdentityAccessMutationPrincipal(records, input.principalId, {
    activeOnly: false,
  });
  const rolesById = identityAccessRoleRecordsById(records);
  const activeAssignments = identityAccessPrincipalRoleAssignments(records, principal.id).filter(
    (assignment) => assignment.values.status === "active",
  );

  if (
    !authority.instanceOwner &&
    activeAssignments.some(() => !identityAccessRoleAssignmentIsEditable(authority))
  ) {
    throw identityAccessPersonMutationError(
      "Current principal cannot remove a person with protected role authority.",
      "protected-assignment",
    );
  }

  if (
    principal.values.status === "active" &&
    identityAccessPrincipalHasActiveOwnerAssignment(principal.id, activeAssignments, rolesById) &&
    activeIdentityOwnerPrincipalIds(records).size <= 1
  ) {
    throw identityAccessPersonMutationError(
      "The last active instance owner cannot be removed.",
      "last-active-owner",
    );
  }

  const removedAt = input.now ?? nowIsoString();
  const pendingInvitations = records.filter(
    (record) =>
      record.entity === "invitation" &&
      !record.deletedAt &&
      (record.values as IdentityInvitationValues).invitedPrincipal === principal.id &&
      (record.values as IdentityInvitationValues).status === "pending",
  );

  await Promise.all(
    pendingInvitations.map((invitation) =>
      requestCollaboratorInvitationTokenRevocation({
        env: options.env,
        invitationId: invitation.id,
        now: removedAt,
        requestUrl: options.requestUrl,
      }),
    ),
  );

  const invitationRevocationPlans: OperationRecordWritePlan[] = pendingInvitations.map(
    (invitation) => ({
      kind: "patch",
      record: invitation,
      values: {
        ...invitation.values,
        status: "revoked",
      },
    }),
  );
  const outcome = writeRecordSetForCommandOperationOutcome(
    storage,
    `access-person-removal:${principal.id}:${input.idempotencyKey}`,
    [
      ...invitationRevocationPlans,
      {
        kind: "patch",
        record: principal,
        values: {
          ...principal.values,
          status: "disabled",
        },
      },
    ],
    validateIdentityControlPlaneRecordConstraint(storage),
    { now: removedAt },
  );
  const removedPrincipal = outcome.response.changes
    .map((change) => change.payload)
    .find((record) => record.entity === "principal" && record.id === principal.id);

  if (!removedPrincipal) {
    throw new Error("Identity access person removal did not update the principal.");
  }

  return {
    person: identityAccessPersonSummary(
      removedPrincipal,
      primaryIdentityAccessEmailsByPrincipal(getBootstrapRecords(storage)).get(principal.id),
    ),
    removedAt,
    status: "disabled",
  };
}

function currentIdentityAccessMutationAuthority(
  records: readonly StoredRecord[],
  actor: IdentityAccessMutationActor,
): IdentityAccessMutationAuthority {
  if (actor.trustedAdmin) {
    return { instanceOwner: true, programAdministrator: true };
  }

  if (actor.principalId !== undefined) {
    const authority = resolveActiveIdentityAuthorityForPrincipal(records, actor.principalId);

    if (authority?.instanceOwner || authority?.programAdministrator) {
      return authority;
    }
  }

  throw identityAccessPersonMutationError(
    "Current principal no longer has access management authority.",
    "protected-assignment",
  );
}

function resolveActiveIdentityAuthorityForPrincipal(
  records: readonly StoredRecord[],
  principalId: string,
): IdentityAccessMutationAuthority | null {
  const principal = records.find(
    (record) =>
      record.id === principalId &&
      record.entity === "principal" &&
      !record.deletedAt &&
      record.values.status === "active",
  );

  if (!principal) {
    return null;
  }

  const callerFacts = resolveIdentityProgramCallerFacts(
    records,
    principal.id,
    formlessProgramSchema.authorization?.roles ?? [],
  );

  return {
    instanceOwner: callerFacts.owner,
    programAdministrator:
      callerFacts.roleId === identityAccessProgramRoleByKey("administrator")?.id,
  };
}

function currentIdentityAccessMutationPrincipal(
  records: readonly StoredRecord[],
  principalId: string,
  options: {
    activeOnly: boolean;
  },
): StoredRecord {
  const principal = records.find(
    (record) => record.id === principalId && record.entity === "principal",
  );

  if (!principal || principal.deletedAt) {
    throw identityAccessPersonMutationError(
      "Access management person could not be found.",
      "missing-principal",
    );
  }

  const status = principal.values.status;

  if (
    status === "disabled" ||
    (options.activeOnly && status !== "active") ||
    (!options.activeOnly && status !== "active" && status !== "invited")
  ) {
    throw identityAccessPersonMutationError(
      options.activeOnly
        ? "Role replacement requires an active person."
        : "Person removal requires an active or invited person.",
      "inactive-principal",
    );
  }

  return principal;
}

function identityAccessRoleRecordsById(
  records: readonly StoredRecord[],
): Map<string, StoredRecord> {
  return new Map(
    records
      .filter((record) => record.entity === "role" && !record.deletedAt)
      .map((record) => [record.id, record]),
  );
}

function identityAccessActiveRoleRecordByKey(
  records: readonly StoredRecord[],
  roleKey: IdentityControlPlaneRoleKey,
): StoredRecord | undefined {
  return records.find(
    (record) =>
      record.entity === "role" &&
      !record.deletedAt &&
      record.values.status === "active" &&
      record.values.key === roleKey,
  );
}

function identityAccessPrincipalRoleAssignments(
  records: readonly StoredRecord[],
  principalId: string,
): StoredRecord[] {
  return records.filter(
    (record) =>
      record.entity === "role-assignment" &&
      !record.deletedAt &&
      record.values.targetKind === "principal" &&
      record.values.targetPrincipal === principalId,
  );
}

function identityAccessPrincipalProgramRoleAssignments(
  records: readonly StoredRecord[],
  principalId: string,
): StoredRecord[] {
  return records.filter(
    (record) =>
      record.entity === "program-role-assignment" &&
      !record.deletedAt &&
      record.values.principal === principalId,
  );
}

function identityAccessRoleKeyForAssignment(
  assignment: StoredRecord,
  rolesById: ReadonlyMap<string, StoredRecord>,
): IdentityControlPlaneRoleKey {
  const role = rolesById.get(String(assignment.values.role));
  const roleKey = role?.values.key;

  if (
    typeof roleKey !== "string" ||
    !identityControlPlaneRoleKeys.includes(roleKey as IdentityControlPlaneRoleKey)
  ) {
    throw identityAccessPersonMutationError(
      "Person has an unsupported role assignment.",
      "protected-assignment",
    );
  }

  return roleKey as IdentityControlPlaneRoleKey;
}

function identityAccessRoleSelectionIsEditable(
  selection: IdentityAccessPersonRoleSelection,
  authority: IdentityAccessMutationAuthority,
): boolean {
  if (authority.instanceOwner) {
    return true;
  }

  if (selection.scopeKind === "program") {
    const role = identityAccessProgramRoleById(selection.roleId);

    return (
      authority.programAdministrator &&
      role !== undefined &&
      (role.key === "member" || role.key === "editor" || role.key === "administrator")
    );
  }

  return false;
}

function identityAccessProgramRoleAssignmentIsEditable(
  authority: IdentityAccessMutationAuthority,
): boolean {
  return authority.instanceOwner || authority.programAdministrator;
}

function identityAccessRoleAssignmentIsEditable(
  authority: IdentityAccessMutationAuthority,
): boolean {
  return authority.instanceOwner;
}

function identityAccessRoleSelectionSurfaceKey(
  selection: IdentityAccessPersonRoleSelection,
): string {
  return JSON.stringify([selection.scopeKind, ""]);
}

function identityAccessRoleAssignmentSurfaceKey(assignment: StoredRecord): string {
  return JSON.stringify([
    assignment.values.scopeKind,
    assignment.values.scopeKind === "organization" ? assignment.values.scopeOrganization : "",
  ]);
}

function identityAccessRoleAssignmentMatchesSelection(
  assignment: StoredRecord,
  selection: IdentityAccessPersonRoleSelection,
  rolesById: ReadonlyMap<string, StoredRecord>,
): boolean {
  if (selection.scopeKind === "program") {
    return false;
  }

  return (
    identityAccessRoleAssignmentSurfaceKey(assignment) ===
      identityAccessRoleSelectionSurfaceKey(selection) &&
    identityAccessRoleKeyForAssignment(assignment, rolesById) === selection.roleKey
  );
}

function identityAccessPersonRoleAssignmentValues(
  principalId: string,
  roleId: string,
  selection: IdentityAccessPersonRoleSelection,
): IdentityRoleAssignmentValues {
  if (selection.scopeKind === "program") {
    throw new Error("Program role selections use Program role assignment records.");
  }

  return {
    role: roleId,
    scopeKind: selection.scopeKind,
    status: "active",
    targetKind: "principal",
    targetPrincipal: principalId,
  };
}

function assertIdentityAccessReplacementPreservesOwner(
  records: readonly StoredRecord[],
  principal: StoredRecord,
  assignments: readonly StoredRecord[],
  rolesById: ReadonlyMap<string, StoredRecord>,
  desiredBySurface: ReadonlyMap<string, IdentityAccessPersonRoleSelection>,
  authority: IdentityAccessMutationAuthority,
) {
  if (
    !authority.instanceOwner ||
    !identityAccessPrincipalHasActiveOwnerAssignment(principal.id, assignments, rolesById)
  ) {
    return;
  }

  const desiredInstanceRole = desiredBySurface.get(JSON.stringify(["instance", ""]));

  if (
    desiredInstanceRole?.scopeKind !== "program" &&
    desiredInstanceRole?.roleKey === "instance.owner"
  ) {
    return;
  }

  if (activeIdentityOwnerPrincipalIds(records).size <= 1) {
    throw identityAccessPersonMutationError(
      "The last active instance owner cannot be removed.",
      "last-active-owner",
    );
  }
}

function identityAccessPrincipalHasActiveOwnerAssignment(
  principalId: string,
  assignments: readonly StoredRecord[],
  rolesById: ReadonlyMap<string, StoredRecord>,
): boolean {
  return assignments.some(
    (assignment) =>
      assignment.values.status === "active" &&
      assignment.values.targetPrincipal === principalId &&
      assignment.values.scopeKind === "instance" &&
      identityAccessRoleKeyForAssignment(assignment, rolesById) === "instance.owner" &&
      rolesById.get(String(assignment.values.role))?.values.status === "active",
  );
}

function activeIdentityOwnerPrincipalIds(records: readonly StoredRecord[]): Set<string> {
  const rolesById = identityAccessRoleRecordsById(records);
  const activePrincipalIds = new Set(
    records
      .filter(
        (record) =>
          record.entity === "principal" && !record.deletedAt && record.values.status === "active",
      )
      .map((record) => record.id),
  );
  const ownerPrincipalIds = new Set<string>();

  for (const record of records) {
    if (
      record.entity !== "role-assignment" ||
      record.deletedAt ||
      record.values.status !== "active" ||
      record.values.targetKind !== "principal" ||
      record.values.scopeKind !== "instance" ||
      typeof record.values.targetPrincipal !== "string" ||
      !activePrincipalIds.has(record.values.targetPrincipal)
    ) {
      continue;
    }

    const role = rolesById.get(String(record.values.role));

    if (role?.values.status === "active" && role.values.key === "instance.owner") {
      ownerPrincipalIds.add(record.values.targetPrincipal);
    }
  }

  return ownerPrincipalIds;
}

function parseIdentityAccessPersonRoleReplacementRequest(
  value: unknown,
): IdentityAccessPersonRoleReplacementRequest {
  const object = parseRecord("Identity access person role replacement request", value);

  assertAllowedKeys("Identity access person role replacement request", object, [
    "idempotencyKey",
    "now",
    "principalId",
    "roles",
  ]);

  if (!Array.isArray(object.roles)) {
    throw identityAccessPersonMutationError(
      "Identity access person roles must be an array.",
      "invalid-role-selection",
    );
  }

  return {
    idempotencyKey: parseNonEmptyString(
      "Identity access person role replacement idempotencyKey",
      object.idempotencyKey,
    ),
    ...(object.now === undefined
      ? {}
      : { now: parseIsoTimestamp("Identity access person role replacement now", object.now) }),
    principalId: parseNonEmptyString(
      "Identity access person role replacement principalId",
      object.principalId,
    ),
    roles: object.roles.map(parseIdentityAccessPersonRoleSelection),
  };
}

function parseIdentityAccessPersonRoleSelection(
  value: unknown,
  index: number,
): IdentityAccessPersonRoleSelection {
  const context = `Identity access person roles ${index}`;
  const object = parseRecord(context, value);

  assertAllowedKeys(context, object, ["roleId", "roleKey", "scopeKind"]);

  const scopeKind = parseStringLiteral(`${context} scopeKind`, object.scopeKind, [
    "instance",
    "program",
  ] as const);

  if (scopeKind === "program") {
    if (object.roleKey !== undefined) {
      throw identityAccessPersonMutationError(
        "Identity access Program role selection has incompatible fields.",
        "invalid-role-selection",
      );
    }

    const roleId = parseAuthorizationRoleId(`${context} roleId`, object.roleId);

    if (identityAccessProgramRoleById(roleId) === undefined) {
      throw identityAccessPersonMutationError(
        `Requested Program role "${roleId}" is unavailable.`,
        "invalid-role-selection",
      );
    }

    return { roleId, scopeKind };
  }

  const roleKey = parseStringLiteral(
    `${context} roleKey`,
    object.roleKey,
    identityControlPlaneRoleKeys,
  );

  if (scopeKind === "instance" && roleKey === "instance.owner" && object.roleId === undefined) {
    return { roleKey, scopeKind };
  }

  throw identityAccessPersonMutationError(
    "Identity access person role selection has incompatible role and scope fields.",
    "invalid-role-selection",
  );
}

function parseIdentityAccessPersonRemovalRequest(
  value: unknown,
): IdentityAccessPersonRemovalRequest {
  const object = parseRecord("Identity access person removal request", value);

  assertAllowedKeys("Identity access person removal request", object, [
    "idempotencyKey",
    "now",
    "principalId",
  ]);

  return {
    idempotencyKey: parseNonEmptyString(
      "Identity access person removal idempotencyKey",
      object.idempotencyKey,
    ),
    ...(object.now === undefined
      ? {}
      : { now: parseIsoTimestamp("Identity access person removal now", object.now) }),
    principalId: parseNonEmptyString(
      "Identity access person removal principalId",
      object.principalId,
    ),
  };
}

function identityAccessPersonMutationError(
  message: string,
  reason: IdentityAccessPersonMutationFailureReason,
): IdentityAccessPersonMutationError {
  return new IdentityAccessPersonMutationError(
    message,
    reason,
    reason === "missing-principal"
      ? 404
      : reason === "inactive-principal" || reason === "last-active-owner"
        ? 409
        : reason === "protected-assignment"
          ? 403
          : 400,
  );
}

function createCollaboratorInvitation(
  storage: DurableObjectStorage,
  value: unknown,
  options: {
    grantAuthorityPrincipalId?: string;
    inviterPrincipalId?: string;
  },
): CreateCollaboratorInvitationWriteResponse {
  const input = resolveCreateCollaboratorInvitationInput(
    storage,
    parseCreateCollaboratorInvitationRequest(value),
  );
  const plans = collaboratorInvitationRecordWritePlans(input, options);

  if (options.grantAuthorityPrincipalId !== undefined) {
    validateCollaboratorInvitationGrantAuthority(storage, options.grantAuthorityPrincipalId, plans);
  }

  const outcome = writeRecordSetForCommandOperationOutcome(
    storage,
    `collaborator-invitation:${input.idempotencyKey}`,
    plans,
    validateIdentityControlPlaneRecordConstraint(storage),
    input.now === undefined ? {} : { now: input.now },
  );
  const records = outcome.response.changes.map((change) => change.payload);
  const invitation = records.find((record) => record.entity === "invitation");

  if (!invitation) {
    throw new Error("Collaborator invitation write did not create an invitation record.");
  }

  return {
    invitation,
    output: outcome.response,
    records,
    status: outcome.kind === "replay" ? "replayed" : "committed",
  };
}

function resolveCreateCollaboratorInvitationInput(
  storage: DurableObjectStorage,
  input: ParsedCreateCollaboratorInvitationInput,
): CreateCollaboratorInvitationInput {
  const records = getBootstrapRecords(storage);
  const activeOrganizationIds = new Set(
    identityAccessRecordsForEntity(records, "organization")
      .filter((record) => record.values.status === "active")
      .map((record) => record.id),
  );
  const selectedSurfaces = new Map<string, CollaboratorInvitationTargetFacts>();

  for (const [index, roleAssignment] of input.roleAssignments.entries()) {
    const surface = collaboratorInvitationRoleSurface(roleAssignment);
    const surfaceKey = collaboratorInvitationTargetKey(surface);

    assertCollaboratorInvitationRoleLevel(records, roleAssignment, index);
    assertCollaboratorInvitationSurfaceAvailable(surface, activeOrganizationIds);

    if (selectedSurfaces.has(surfaceKey)) {
      throw new BadRequestError(
        "Collaborator invitation may select only one role level for each access surface.",
      );
    }

    selectedSurfaces.set(surfaceKey, surface);
  }

  const acceptanceTarget = resolveCollaboratorInvitationAcceptanceTarget(input.acceptanceTarget, [
    ...selectedSurfaces.values(),
  ]);

  assertCollaboratorInvitationSurfaceAvailable(acceptanceTarget, activeOrganizationIds);

  const { acceptanceTarget: _acceptanceTarget, ...baseInput } = input;

  return {
    ...baseInput,
    ...acceptanceTarget,
  };
}

function collaboratorInvitationRoleSurface(
  roleAssignment: CollaboratorInvitationRoleAssignmentInput,
): CollaboratorInvitationTargetFacts {
  if (roleAssignment.scopeKind === "program") {
    return { targetSurface: "instance" };
  }

  return { targetSurface: "instance" };
}

function assertCollaboratorInvitationRoleLevel(
  records: readonly StoredRecord[],
  roleAssignment: CollaboratorInvitationRoleAssignmentInput,
  index: number,
) {
  if (roleAssignment.scopeKind === "program") {
    if (identityAccessProgramRoleById(roleAssignment.roleId) === undefined) {
      throw new BadRequestError(
        `Collaborator invitation role assignment ${index} references an unavailable Program role.`,
      );
    }

    return;
  }

  const role = records.find(
    (record) =>
      record.entity === "role" &&
      record.id === roleAssignment.role &&
      !record.deletedAt &&
      record.values.status === "active",
  );
  const roleKey = role?.values.key;

  if (
    typeof roleKey !== "string" ||
    !identityControlPlaneRoleKeys.includes(roleKey as IdentityControlPlaneRoleKey)
  ) {
    throw new BadRequestError(
      `Collaborator invitation role assignment ${index} references an unavailable role.`,
    );
  }

  if (roleKey !== "instance.owner") {
    throw new BadRequestError(
      `Collaborator invitation role assignment ${index} role "${roleKey}" is unavailable for ${roleAssignment.scopeKind} scope.`,
    );
  }
}

function resolveCollaboratorInvitationAcceptanceTarget(
  explicitTarget: CollaboratorInvitationTargetFacts | undefined,
  selectedSurfaces: readonly CollaboratorInvitationTargetFacts[],
): CollaboratorInvitationTargetFacts {
  if (selectedSurfaces.length === 0) {
    if (explicitTarget === undefined) {
      throw new BadRequestError(
        "Collaborator invitation requires an acceptance target when no role surface is selected.",
      );
    }

    return explicitTarget;
  }

  if (selectedSurfaces.length === 1) {
    const selectedSurface = selectedSurfaces[0]!;

    if (
      explicitTarget !== undefined &&
      collaboratorInvitationTargetKey(explicitTarget) !==
        collaboratorInvitationTargetKey(selectedSurface)
    ) {
      throw new BadRequestError(
        "Collaborator invitation acceptance target must be one of its selected role surfaces.",
      );
    }

    return selectedSurface;
  }

  if (explicitTarget === undefined) {
    throw new BadRequestError(
      "Collaborator invitation requires an explicit acceptance target for multiple role surfaces.",
    );
  }

  const explicitTargetKey = collaboratorInvitationTargetKey(explicitTarget);

  if (
    !selectedSurfaces.some(
      (surface) => collaboratorInvitationTargetKey(surface) === explicitTargetKey,
    )
  ) {
    throw new BadRequestError(
      "Collaborator invitation acceptance target must be one of its selected role surfaces.",
    );
  }

  return explicitTarget;
}

function assertCollaboratorInvitationSurfaceAvailable(
  surface: CollaboratorInvitationTargetFacts,
  activeOrganizationIds: ReadonlySet<string>,
) {
  if (
    surface.targetSurface === "organization" &&
    (surface.targetOrganization === undefined ||
      !activeOrganizationIds.has(surface.targetOrganization))
  ) {
    throw new BadRequestError(
      `Collaborator invitation organization "${surface.targetOrganization ?? ""}" is unavailable.`,
    );
  }
}

function collaboratorInvitationTargetKey(target: CollaboratorInvitationTargetFacts): string {
  if (target.targetSurface === "organization") {
    return `organization:${target.targetOrganization ?? ""}`;
  }

  return "instance";
}

async function revokeCollaboratorInvitationFromAccessManagement(
  storage: DurableObjectStorage,
  value: unknown,
  options: {
    env: IdentityControlPlaneApiEnv;
    requestUrl: string;
  },
): Promise<RevokeCollaboratorInvitationResult> {
  const input = parseCollaboratorInvitationRevokeRequest(value);
  const revokedAt = input.now ?? nowIsoString();
  const records = getBootstrapRecords(storage);
  const candidate = collaboratorInvitationRevocationCandidate(records, {
    ...input,
    now: revokedAt,
  });

  if (!candidate.ok) {
    return identityCollaboratorInvitationRevokeFailure(candidate.reason);
  }

  const tokenRevocation = await requestCollaboratorInvitationTokenRevocation({
    env: options.env,
    invitationId: candidate.invitation.id,
    now: revokedAt,
    requestUrl: options.requestUrl,
  });

  if (!tokenRevocation.ok && tokenRevocation.reason === "already-consumed") {
    return identityCollaboratorInvitationRevokeFailure("accepted-invitation");
  }

  if (!tokenRevocation.ok && tokenRevocation.reason === "expired-token") {
    return identityCollaboratorInvitationRevokeFailure("expired-invitation");
  }

  const outcome = writeRecordSetForCommandOperationOutcome(
    storage,
    `collaborator-invitation-revocation:${candidate.invitation.id}:${revokedAt}`,
    [
      {
        kind: "patch",
        record: candidate.invitation,
        values: {
          ...candidate.invitation.values,
          status: "revoked",
        },
      },
    ],
    validateIdentityControlPlaneRecordConstraint(storage),
    { allowStoredReplay: false, now: revokedAt },
  );
  const invitation = outcome.response.changes
    .map((change) => change.payload)
    .find((record) => record.entity === "invitation" && record.id === candidate.invitation.id);

  if (!invitation) {
    throw new Error("Collaborator invitation revocation did not update the invitation record.");
  }

  return {
    body: {
      invitation: identityAccessInvitationSummary(invitation),
      revokedAt,
      status: "revoked",
    },
    ok: true,
  };
}
function collaboratorInvitationRevocationCandidate(
  records: readonly StoredRecord[],
  input: IdentityCollaboratorInvitationRevokeRequest & {
    now: string;
  },
):
  | {
      invitation: StoredRecord;
      ok: true;
    }
  | {
      ok: false;
      reason: IdentityCollaboratorInvitationRevokeFailureReason;
    } {
  const invitation = records.find(
    (record) => record.id === input.invitationId && record.entity === "invitation",
  );

  if (!invitation) {
    return { ok: false, reason: "missing-invitation" };
  }

  if (invitation.deletedAt) {
    return { ok: false, reason: "tombstoned-invitation" };
  }

  const status = parseStringLiteral(
    "Identity collaborator invitation status",
    invitation.values.status,
    invitationStatuses,
  );

  if (status === "accepted") {
    return { ok: false, reason: "accepted-invitation" };
  }

  if (status === "revoked") {
    return { ok: false, reason: "revoked-invitation" };
  }

  if (
    status === "expired" ||
    parseIsoTimestamp("Identity collaborator invitation expiresAt", invitation.values.expiresAt) <=
      input.now
  ) {
    return { ok: false, reason: "expired-invitation" };
  }
  return { invitation, ok: true };
}
function identityCollaboratorInvitationRevokeFailure(
  reason: IdentityCollaboratorInvitationRevokeFailureReason,
): Extract<
  RevokeCollaboratorInvitationResult,
  {
    ok: false;
  }
> {
  return {
    body: {
      error:
        reason === "accepted-invitation"
          ? "Invitation has already been accepted."
          : reason === "expired-invitation"
            ? "Invitation has expired."
            : reason === "revoked-invitation"
              ? "Invitation has already been revoked."
              : "Invitation could not be found.",
      reason,
    },
    ok: false,
    status: identityCollaboratorInvitationRevokeFailureStatus(reason),
  };
}

function identityCollaboratorInvitationRevokeFailureStatus(
  reason: IdentityCollaboratorInvitationRevokeFailureReason,
): number {
  switch (reason) {
    case "accepted-invitation":
    case "revoked-invitation":
      return 409;
    case "expired-invitation":
      return 410;
    case "missing-invitation":
    case "tombstoned-invitation":
      return 404;
  }
}

function validateCollaboratorInvitationGrantAuthority(
  storage: DurableObjectStorage,
  inviterPrincipalId: string,
  plans: readonly OperationRecordWritePlan[],
) {
  const grantRecords: IdentityCollaboratorInvitationGrantRecord[] = [];

  for (const plan of plans) {
    if (plan.kind !== "create" || plan.entity === "invitation") {
      continue;
    }

    if (plan.id === undefined) {
      throw new Error("Collaborator invitation grant record is missing an id.");
    }

    if (typeof plan.values === "function") {
      throw new Error("Collaborator invitation grant record values must be materialized.");
    }

    grantRecords.push({
      entity: plan.entity,
      id: plan.id,
      values: plan.values,
    });
  }

  validateIdentityCollaboratorInvitationGrants("Collaborator invitation grants", {
    authorizationRoles: formlessProgramSchema.authorization?.roles ?? [],
    grantRecords,
    inviterPrincipalId,
    records: getBootstrapRecords(storage),
  });
}

function readCollaboratorInvitationAcceptanceStatus(
  storage: DurableObjectStorage,
  invitationId: string,
): IdentityCollaboratorInvitationAcceptanceStatus | null {
  ensureIdentityControlPlaneStorage(storage);

  const records = getBootstrapRecords(storage);
  const invitation = records.find(
    (record) => record.id === invitationId && record.entity === "invitation" && !record.deletedAt,
  );

  if (!invitation) {
    return null;
  }

  const targetFacts = parseCollaboratorInvitationTargetFacts(invitation.values);
  const invitedPrincipalId =
    typeof invitation.values.invitedPrincipal === "string"
      ? invitation.values.invitedPrincipal
      : undefined;
  const invitedPrincipal =
    invitedPrincipalId === undefined
      ? undefined
      : records.find(
          (record) =>
            record.id === invitedPrincipalId && record.entity === "principal" && !record.deletedAt,
        );

  return {
    ...targetFacts,
    invitationId: invitation.id,
    targetEmail: normalizeEmailDeliveryAddress(
      "Identity collaborator invitation target email",
      invitation.values.targetEmail,
    ),
    expiresAt: parseIsoTimestamp(
      "Identity collaborator invitation expiresAt",
      invitation.values.expiresAt,
    ),
    ...(invitedPrincipalId === undefined ? {} : { invitedPrincipalId }),
    status: parseStringLiteral(
      "Identity collaborator invitation status",
      invitation.values.status,
      invitationStatuses,
    ),
    ...(invitedPrincipal === undefined
      ? {}
      : {
          invitedPrincipalDisplayName: parseNonEmptyString(
            "Identity collaborator invitation invited principal displayName",
            invitedPrincipal.values.displayName,
          ),
        }),
  };
}

function acceptCollaboratorInvitationIntoIdentity(
  storage: DurableObjectStorage,
  value: unknown,
): IdentityCollaboratorInvitationAcceptanceCommitResult {
  const input = parseIdentityCollaboratorInvitationAcceptanceCommitRequest(value);

  ensureIdentityControlPlaneStorage(storage);

  let plans: OperationRecordWritePlan[];

  try {
    const planned = collaboratorInvitationAcceptanceRecordWritePlans(
      getBootstrapRecords(storage),
      input,
    );

    if (!planned.ok) {
      return planned;
    }

    plans = planned.plans;
  } catch {
    return identityCollaboratorInvitationAcceptanceFailure("identity-validation-failed");
  }

  let outcome: WriteOutcome<OperationCommandOutput>;

  try {
    outcome = writeRecordSetForCommandOperationOutcome(
      storage,
      `collaborator-invitation-acceptance:${input.invitationId}`,
      plans,
      validateIdentityControlPlaneRecordConstraint(storage),
      { now: input.now },
    );
  } catch {
    return identityCollaboratorInvitationAcceptanceFailure("identity-validation-failed");
  }

  const invitation = readCollaboratorInvitationAcceptanceStatus(storage, input.invitationId);

  if (!invitation || invitation.status !== "accepted") {
    return identityCollaboratorInvitationAcceptanceFailure("identity-validation-failed");
  }

  return {
    invitation,
    ok: true,
    output: outcome.response,
    principalId: input.principalId,
    records: outcome.response.changes.map((change) => change.payload),
    status: outcome.kind === "replay" ? "replayed" : "committed",
  };
}

function collaboratorInvitationAcceptanceRecordWritePlans(
  records: readonly StoredRecord[],
  input: IdentityCollaboratorInvitationAcceptanceCommitInput,
):
  | {
      ok: true;
      plans: OperationRecordWritePlan[];
    }
  | Extract<
      IdentityCollaboratorInvitationAcceptanceCommitResult,
      {
        ok: false;
      }
    > {
  const invitation = records.find(
    (record) =>
      record.id === input.invitationId && record.entity === "invitation" && !record.deletedAt,
  );

  if (!invitation) {
    return identityCollaboratorInvitationAcceptanceFailure("missing-invitation");
  }

  const status = parseStringLiteral(
    "Identity collaborator invitation status",
    invitation.values.status,
    invitationStatuses,
  );

  if (status === "accepted") {
    return identityCollaboratorInvitationAcceptanceFailure("accepted-invitation");
  }

  if (status === "revoked") {
    return identityCollaboratorInvitationAcceptanceFailure("revoked-invitation");
  }

  if (
    status === "expired" ||
    parseIsoTimestamp("Identity collaborator invitation expiresAt", invitation.values.expiresAt) <=
      input.now
  ) {
    return identityCollaboratorInvitationAcceptanceFailure("expired-invitation");
  }

  if (
    normalizeEmailDeliveryAddress(
      "Identity collaborator invitation target email",
      invitation.values.targetEmail,
    ).toLowerCase() !== input.targetEmail.toLowerCase()
  ) {
    return identityCollaboratorInvitationAcceptanceFailure("wrong-email");
  }

  const invitationTargetFacts = parseCollaboratorInvitationTargetFacts(invitation.values);

  if (!collaboratorInvitationTargetFactsEqual(invitationTargetFacts, input)) {
    return identityCollaboratorInvitationAcceptanceFailure("wrong-target");
  }

  const invitedPrincipalId = parseOptionalNonEmptyString(
    "Identity collaborator invitation invited principal",
    invitation.values.invitedPrincipal,
  );

  if (invitedPrincipalId !== undefined && invitedPrincipalId !== input.principalId) {
    return identityCollaboratorInvitationAcceptanceFailure("wrong-principal");
  }

  const principal = records.find(
    (record) => record.id === input.principalId && record.entity === "principal",
  );

  if (principal?.deletedAt) {
    return identityCollaboratorInvitationAcceptanceFailure("identity-validation-failed");
  }

  const plans: OperationRecordWritePlan[] = [];

  if (!principal) {
    plans.push({
      kind: "create",
      entity: "principal",
      id: input.principalId,
      values: {
        displayName: input.targetEmail,
        kind: "human",
        status: "active",
      },
    });
  } else if (principal.values.status !== "active") {
    plans.push({
      kind: "patch",
      record: principal,
      values: {
        ...principal.values,
        status: "active",
      },
    });
  }

  plans.push(...collaboratorInvitationPrincipalEmailWritePlans(records, input));

  for (const membership of records) {
    if (
      membership.entity === "membership" &&
      !membership.deletedAt &&
      membership.values.principal === input.principalId &&
      membership.values.status === "invited"
    ) {
      plans.push({
        kind: "patch",
        record: membership,
        values: {
          ...membership.values,
          status: "active",
        },
      });
    }
  }

  plans.push({
    kind: "patch",
    record: invitation,
    values: {
      ...invitation.values,
      invitedPrincipal: input.principalId,
      status: "accepted",
      acceptedAt: input.now,
    },
  });

  return { ok: true, plans };
}

function collaboratorInvitationPrincipalEmailWritePlans(
  records: readonly StoredRecord[],
  input: IdentityCollaboratorInvitationAcceptanceCommitInput,
): OperationRecordWritePlan[] {
  const normalizedEmail = normalizeEmailDeliveryAddress(
    "Identity collaborator invitation target email",
    input.targetEmail,
  ).toLowerCase();
  const existingEmail = records.find(
    (record) =>
      record.entity === "principal-email" &&
      !record.deletedAt &&
      record.values.normalizedEmail === normalizedEmail,
  );

  if (existingEmail) {
    if (existingEmail.values.principal !== input.principalId) {
      throw new Error(
        "Identity collaborator invitation target email belongs to another principal.",
      );
    }

    return [
      {
        kind: "patch",
        record: existingEmail,
        values: {
          ...existingEmail.values,
          displayEmail: input.targetEmail,
          normalizedEmail,
          verificationStatus: "verified",
          verifiedAt: input.now,
        },
      },
    ];
  }

  return [
    {
      kind: "create",
      entity: "principal-email",
      id: generatedIdentityRecordId("principal-email"),
      values: {
        principal: input.principalId,
        displayEmail: input.targetEmail,
        normalizedEmail,
        verificationStatus: "verified",
        primary: true,
        recovery: false,
        verifiedAt: input.now,
      },
    },
  ];
}

function commitEmailVerificationIntoIdentity(
  storage: DurableObjectStorage,
  value: unknown,
): IdentityEmailVerificationCommitResult {
  const input = parseIdentityEmailVerificationCommitRequest(value);

  ensureIdentityControlPlaneStorage(storage);

  let plans: OperationRecordWritePlan[];

  try {
    const planned = emailVerificationPrincipalEmailWritePlans(getBootstrapRecords(storage), input);

    if (!planned.ok) {
      return planned;
    }

    plans = planned.plans;
  } catch {
    return identityEmailVerificationCommitFailure("identity-validation-failed");
  }

  let outcome: WriteOutcome<OperationCommandOutput>;

  try {
    outcome = writeRecordSetForCommandOperationOutcome(
      storage,
      `email-verification:${input.challengeId}`,
      plans,
      validateIdentityControlPlaneRecordConstraint(storage),
      { now: input.verifiedAt },
    );
  } catch {
    return identityEmailVerificationCommitFailure("identity-validation-failed");
  }

  const records = outcome.response.changes.map((change) => change.payload);
  const principalEmail =
    records.find(
      (record) =>
        record.entity === "principal-email" &&
        !record.deletedAt &&
        record.values.normalizedEmail === input.normalizedEmail &&
        record.values.principal === input.principalId,
    ) ??
    getBootstrapRecords(storage).find(
      (record) =>
        record.entity === "principal-email" &&
        !record.deletedAt &&
        record.values.normalizedEmail === input.normalizedEmail &&
        record.values.principal === input.principalId,
    );

  if (!principalEmail) {
    return identityEmailVerificationCommitFailure("identity-validation-failed");
  }

  return {
    ok: true,
    output: outcome.response,
    principalEmail: emailVerificationPrincipalEmailSummary(principalEmail),
    records,
    status: outcome.kind === "replay" ? "replayed" : "committed",
  };
}

function emailVerificationPrincipalEmailWritePlans(
  records: readonly StoredRecord[],
  input: IdentityEmailVerificationCommitInput,
):
  | {
      ok: true;
      plans: OperationRecordWritePlan[];
    }
  | Extract<
      IdentityEmailVerificationCommitResult,
      {
        ok: false;
      }
    > {
  const principal = records.find(
    (record) => record.entity === "principal" && record.id === input.principalId,
  );

  if (!principal || principal.deletedAt || principal.values.status !== "active") {
    return identityEmailVerificationCommitFailure("missing-principal");
  }

  const existingEmail = records.find(
    (record) =>
      record.entity === "principal-email" &&
      !record.deletedAt &&
      record.values.normalizedEmail === input.normalizedEmail,
  );

  if (existingEmail && existingEmail.values.principal !== input.principalId) {
    return identityEmailVerificationCommitFailure("email-owned-by-another-principal");
  }

  const plans: OperationRecordWritePlan[] = [];

  if (input.primary) {
    for (const record of records) {
      if (
        record.entity === "principal-email" &&
        !record.deletedAt &&
        record.values.principal === input.principalId &&
        record.values.primary === true &&
        record.id !== existingEmail?.id
      ) {
        plans.push({
          kind: "patch",
          record,
          values: {
            ...record.values,
            primary: false,
          },
        });
      }
    }
  }

  if (existingEmail) {
    plans.push({
      kind: "patch",
      record: existingEmail,
      values: {
        ...existingEmail.values,
        displayEmail: input.displayEmail,
        normalizedEmail: input.normalizedEmail,
        primary: input.primary,
        recovery: input.recovery,
        verificationStatus: "verified",
        verifiedAt: input.verifiedAt,
      },
    });

    return { ok: true, plans };
  }

  plans.push({
    kind: "create",
    entity: "principal-email",
    id: generatedIdentityRecordId("principal-email"),
    values: {
      principal: input.principalId,
      displayEmail: input.displayEmail,
      normalizedEmail: input.normalizedEmail,
      verificationStatus: "verified",
      primary: input.primary,
      recovery: input.recovery,
      verifiedAt: input.verifiedAt,
    },
  });

  return { ok: true, plans };
}

function parseIdentityEmailVerificationCommitRequest(
  value: unknown,
): IdentityEmailVerificationCommitInput {
  const object = parseRecord("Identity email verification commit request", value);

  assertAllowedKeys("Identity email verification commit request", object, [
    "challengeId",
    "displayEmail",
    "normalizedEmail",
    "principalId",
    "primary",
    "recovery",
    "verifiedAt",
  ]);

  const displayEmail = normalizeEmailDeliveryAddress(
    "Identity email verification display email",
    object.displayEmail,
  );
  const normalizedEmail = normalizeEmailDeliveryAddress(
    "Identity email verification normalized email",
    object.normalizedEmail,
  ).toLowerCase();

  if (displayEmail.toLowerCase() !== normalizedEmail) {
    throw new Error("Identity email verification display email must match normalized email.");
  }

  return {
    challengeId: parseNonEmptyString(
      "Identity email verification challenge id",
      object.challengeId,
    ),
    displayEmail,
    normalizedEmail,
    principalId: parseNonEmptyString(
      "Identity email verification principal id",
      object.principalId,
    ),
    primary: parseBoolean("Identity email verification primary", object.primary),
    recovery: parseBoolean("Identity email verification recovery", object.recovery),
    verifiedAt: parseIsoTimestamp("Identity email verification verifiedAt", object.verifiedAt),
  };
}
function identityEmailVerificationCommitFailure(
  reason: IdentityEmailVerificationCommitFailureReason,
): Extract<
  IdentityEmailVerificationCommitResult,
  {
    ok: false;
  }
> {
  return {
    error:
      reason === "missing-principal"
        ? "Email verification requires an active principal."
        : reason === "email-owned-by-another-principal"
          ? "Email verification could not be committed."
          : "Email verification could not be committed.",
    ok: false,
    reason,
  };
}

function emailVerificationPrincipalEmailSummary(
  record: StoredRecord,
): IdentityEmailVerificationPrincipalEmailSummary {
  return {
    displayEmail: parseNonEmptyString(
      "Identity email verification principal-email displayEmail",
      record.values.displayEmail,
    ),
    normalizedEmail: parseNonEmptyString(
      "Identity email verification principal-email normalizedEmail",
      record.values.normalizedEmail,
    ),
    primary: parseBoolean(
      "Identity email verification principal-email primary",
      record.values.primary,
    ),
    principalEmailId: record.id,
    recovery: parseBoolean(
      "Identity email verification principal-email recovery",
      record.values.recovery,
    ),
    verificationStatus: "verified",
    verifiedAt: parseIsoTimestamp(
      "Identity email verification principal-email verifiedAt",
      record.values.verifiedAt,
    ),
  };
}

function commitOwnerSetupActivationIntoIdentity(
  storage: DurableObjectStorage,
  value: unknown,
): IdentityOwnerSetupActivationCommitResult {
  const input = parseIdentityOwnerSetupActivationCommitRequest(value);

  ensureIdentityControlPlaneStorage(storage);

  let plans: OperationRecordWritePlan[];

  try {
    const planned = ownerSetupActivationWritePlans(getBootstrapRecords(storage), input);

    if (!planned.ok) {
      return planned;
    }

    plans = planned.plans;
  } catch {
    return identityOwnerSetupActivationCommitFailure("identity-validation-failed");
  }

  let outcome: WriteOutcome<OperationCommandOutput>;

  try {
    outcome = writeRecordSetForCommandOperationOutcome(
      storage,
      `owner-setup-activation:${input.completionId}`,
      plans,
      validateIdentityControlPlaneRecordConstraint(storage),
      { now: input.activatedAt },
    );
  } catch {
    return identityOwnerSetupActivationCommitFailure("identity-validation-failed");
  }

  const records = getBootstrapRecords(storage);
  const owner = readActiveIdentityOwnerForPrincipal(storage, input.principalId);
  const principalEmail = records.find(
    (record) =>
      record.entity === "principal-email" &&
      !record.deletedAt &&
      record.values.normalizedEmail === input.normalizedEmail &&
      record.values.principal === input.principalId &&
      record.values.primary === true &&
      record.values.recovery === true &&
      record.values.verificationStatus === "verified",
  );

  if (!owner || !principalEmail) {
    return identityOwnerSetupActivationCommitFailure("identity-validation-failed");
  }

  return {
    ok: true,
    output: outcome.response,
    owner,
    principalEmail: emailVerificationPrincipalEmailSummary(principalEmail),
    records: outcome.response.changes.map((change) => change.payload),
    status: outcome.kind === "replay" ? "replayed" : "committed",
  };
}

function ownerSetupActivationWritePlans(
  records: readonly StoredRecord[],
  input: IdentityOwnerSetupActivationCommitInput,
):
  | {
      ok: true;
      plans: OperationRecordWritePlan[];
    }
  | Extract<
      IdentityOwnerSetupActivationCommitResult,
      {
        ok: false;
      }
    > {
  const ownerRole = activeRoleRecord(records, "instance.owner");
  const activeOwnerAssignment = records.find(
    (record) =>
      record.entity === "role-assignment" &&
      !record.deletedAt &&
      record.values.status === "active" &&
      record.values.role === ownerRole.id &&
      record.values.targetKind === "principal" &&
      record.values.scopeKind === "instance",
  );

  if (activeOwnerAssignment && activeOwnerAssignment.values.targetPrincipal !== input.principalId) {
    return identityOwnerSetupActivationCommitFailure("owner-already-active");
  }

  const ownerAssignment = records.find(
    (record) =>
      record.entity === "role-assignment" &&
      !record.deletedAt &&
      record.values.role === ownerRole.id &&
      record.values.targetKind === "principal" &&
      record.values.targetPrincipal === input.principalId &&
      record.values.scopeKind === "instance",
  );
  const principal = records.find(
    (record) => record.entity === "principal" && record.id === input.principalId,
  );

  if (principal?.deletedAt || (principal && principal.values.kind !== "human")) {
    return identityOwnerSetupActivationCommitFailure("identity-validation-failed");
  }

  const existingEmail = records.find(
    (record) =>
      record.entity === "principal-email" &&
      !record.deletedAt &&
      record.values.normalizedEmail === input.normalizedEmail,
  );

  if (existingEmail && existingEmail.values.principal !== input.principalId) {
    return identityOwnerSetupActivationCommitFailure("email-owned-by-another-principal");
  }

  const plans: OperationRecordWritePlan[] = [];

  if (!principal) {
    plans.push({
      kind: "create",
      entity: "principal",
      id: input.principalId,
      values: {
        displayName: input.displayName,
        kind: "human",
        status: "active",
      },
    });
  } else if (
    principal.values.displayName !== input.displayName ||
    principal.values.status !== "active"
  ) {
    plans.push({
      kind: "patch",
      record: principal,
      values: {
        ...principal.values,
        displayName: input.displayName,
        status: "active",
      },
    });
  }

  for (const record of records) {
    if (
      record.entity === "principal-email" &&
      !record.deletedAt &&
      record.values.principal === input.principalId &&
      record.values.primary === true &&
      record.id !== existingEmail?.id
    ) {
      plans.push({
        kind: "patch",
        record,
        values: {
          ...record.values,
          primary: false,
        },
      });
    }
  }

  if (!existingEmail) {
    plans.push({
      kind: "create",
      entity: "principal-email",
      id: `principal-email:${input.principalId}:primary`,
      values: {
        principal: input.principalId,
        displayEmail: input.displayEmail,
        normalizedEmail: input.normalizedEmail,
        verificationStatus: "verified",
        primary: true,
        recovery: true,
        verifiedAt: input.activatedAt,
      },
    });
  } else if (
    existingEmail.values.displayEmail !== input.displayEmail ||
    existingEmail.values.verificationStatus !== "verified" ||
    existingEmail.values.primary !== true ||
    existingEmail.values.recovery !== true ||
    existingEmail.values.verifiedAt !== input.activatedAt
  ) {
    plans.push({
      kind: "patch",
      record: existingEmail,
      values: {
        ...existingEmail.values,
        displayEmail: input.displayEmail,
        normalizedEmail: input.normalizedEmail,
        verificationStatus: "verified",
        primary: true,
        recovery: true,
        verifiedAt: input.activatedAt,
      },
    });
  }

  if (!ownerAssignment) {
    plans.push({
      kind: "create",
      entity: "role-assignment",
      id: `role-assignment:${input.principalId}:instance.owner`,
      values: {
        role: ownerRole.id,
        targetKind: "principal",
        targetPrincipal: input.principalId,
        scopeKind: "instance",
        status: "active",
      },
    });
  } else if (ownerAssignment.values.status !== "active") {
    plans.push({
      kind: "patch",
      record: ownerAssignment,
      values: {
        ...ownerAssignment.values,
        status: "active",
      },
    });
  }

  return { ok: true, plans };
}

function parseIdentityOwnerSetupActivationCommitRequest(
  value: unknown,
): IdentityOwnerSetupActivationCommitInput {
  const object = parseRecord("Identity owner setup activation commit request", value);

  assertAllowedKeys("Identity owner setup activation commit request", object, [
    "activatedAt",
    "completionId",
    "displayEmail",
    "displayName",
    "normalizedEmail",
    "principalId",
  ]);

  const displayEmail = normalizeEmailDeliveryAddress(
    "Identity owner setup activation display email",
    object.displayEmail,
  );
  const normalizedEmail = normalizeEmailDeliveryAddress(
    "Identity owner setup activation normalized email",
    object.normalizedEmail,
  ).toLowerCase();

  if (displayEmail.toLowerCase() !== normalizedEmail) {
    throw new BadRequestError("Identity owner setup activation display email must match email.");
  }

  return {
    activatedAt: parseIsoTimestamp(
      "Identity owner setup activation activatedAt",
      object.activatedAt,
    ),
    completionId: parseNonEmptyString(
      "Identity owner setup activation completion id",
      object.completionId,
    ),
    displayEmail,
    displayName: parseNonEmptyString(
      "Identity owner setup activation display name",
      object.displayName,
    ),
    normalizedEmail,
    principalId: parseNonEmptyString(
      "Identity owner setup activation principal id",
      object.principalId,
    ),
  };
}
function identityOwnerSetupActivationCommitFailure(
  reason: IdentityOwnerSetupActivationCommitFailureReason,
): Extract<
  IdentityOwnerSetupActivationCommitResult,
  {
    ok: false;
  }
> {
  return {
    error: "Owner setup activation could not be committed.",
    ok: false,
    reason,
  };
}

function commitTermsAcceptanceIntoIdentity(
  storage: DurableObjectStorage,
  value: unknown,
): IdentityTermsAcceptanceCommitResult {
  const input = parseIdentityTermsAcceptanceCommitRequest(value);

  ensureIdentityControlPlaneStorage(storage);

  let plans: OperationRecordWritePlan[];

  try {
    const planned = termsAcceptanceWritePlans(getBootstrapRecords(storage), input);

    if (!planned.ok) {
      return planned;
    }

    plans = planned.plans;
  } catch {
    return identityTermsAcceptanceCommitFailure("identity-validation-failed");
  }

  let outcome: WriteOutcome<OperationCommandOutput>;

  try {
    outcome = writeRecordSetForCommandOperationOutcome(
      storage,
      `terms-acceptance:${input.acceptanceId}`,
      plans,
      validateIdentityControlPlaneRecordConstraint(storage),
      { now: input.acceptedAt },
    );
  } catch {
    return identityTermsAcceptanceCommitFailure("identity-validation-failed");
  }

  const records = getBootstrapRecords(storage);
  const acceptedPolicies = input.acceptedPolicyIds.map((policyId) =>
    records.find(
      (record) =>
        record.entity === "principal-policy-acceptance" &&
        !record.deletedAt &&
        record.values.principal === input.principalId &&
        record.values.accountPolicy === policyId &&
        record.values.status === "accepted",
    ),
  );

  if (acceptedPolicies.some((record) => record === undefined)) {
    return identityTermsAcceptanceCommitFailure("identity-validation-failed");
  }

  return {
    acceptedPolicies: acceptedPolicies.map((record) =>
      termsAcceptanceSummary(record as StoredRecord),
    ),
    ok: true,
    output: outcome.response,
    records: outcome.response.changes.map((change) => change.payload),
    status: outcome.kind === "replay" ? "replayed" : "committed",
  };
}

function termsAcceptanceWritePlans(
  records: readonly StoredRecord[],
  input: IdentityTermsAcceptanceCommitInput,
):
  | {
      ok: true;
      plans: OperationRecordWritePlan[];
    }
  | Extract<
      IdentityTermsAcceptanceCommitResult,
      {
        ok: false;
      }
    > {
  const principal = records.find(
    (record) => record.entity === "principal" && record.id === input.principalId,
  );

  if (!principal || principal.deletedAt || principal.values.status !== "active") {
    return identityTermsAcceptanceCommitFailure("inactive-principal");
  }

  const policiesById = new Map(
    records
      .filter(
        (record) =>
          record.entity === "account-policy" &&
          !record.deletedAt &&
          record.values.status === "active" &&
          accountPolicyAppliesToCompletionTarget(record, input.target),
      )
      .map((record) => [record.id, record]),
  );
  const plans: OperationRecordWritePlan[] = [];

  for (const policyId of input.acceptedPolicyIds) {
    const policy = policiesById.get(policyId);

    if (!policy) {
      return identityTermsAcceptanceCommitFailure("invalid-policy");
    }

    const accepted = records.find(
      (record) =>
        record.entity === "principal-policy-acceptance" &&
        !record.deletedAt &&
        record.values.principal === input.principalId &&
        record.values.accountPolicy === policy.id &&
        record.values.status === "accepted",
    );

    if (accepted) {
      continue;
    }

    plans.push({
      kind: "create",
      entity: "principal-policy-acceptance",
      id: generatedIdentityRecordId("principal-policy-acceptance"),
      values: {
        acceptedAt: input.acceptedAt,
        accountPolicy: policy.id,
        principal: input.principalId,
        status: "accepted",
      },
    });
  }

  return { ok: true, plans };
}

function parseIdentityTermsAcceptanceCommitRequest(
  value: unknown,
): IdentityTermsAcceptanceCommitInput {
  const object = parseRecord("Identity terms acceptance commit request", value);

  assertAllowedKeys("Identity terms acceptance commit request", object, [
    "acceptedAt",
    "acceptedPolicyIds",
    "acceptanceId",
    "principalId",
    "target",
  ]);

  return {
    acceptedAt: parseIsoTimestamp("Identity terms acceptance acceptedAt", object.acceptedAt),
    acceptedPolicyIds: parseUniqueNonEmptyStringList(
      "Identity terms acceptance acceptedPolicyIds",
      object.acceptedPolicyIds,
    ),
    acceptanceId: parseNonEmptyString(
      "Identity terms acceptance acceptance id",
      object.acceptanceId,
    ),
    principalId: parseNonEmptyString("Identity terms acceptance principal id", object.principalId),
    target: parseAccountCompletionGateTarget(object.target),
  };
}

function termsAcceptanceSummary(record: StoredRecord): IdentityTermsAcceptanceSummary {
  return {
    acceptedAt: parseIsoTimestamp("Identity terms acceptance acceptedAt", record.values.acceptedAt),
    accountPolicyId: parseNonEmptyString(
      "Identity terms acceptance account policy",
      record.values.accountPolicy,
    ),
    principalId: parseNonEmptyString(
      "Identity terms acceptance principal",
      record.values.principal,
    ),
    principalPolicyAcceptanceId: record.id,
    status: "accepted",
  };
}
function identityTermsAcceptanceCommitFailure(
  reason: IdentityTermsAcceptanceCommitFailureReason,
): Extract<
  IdentityTermsAcceptanceCommitResult,
  {
    ok: false;
  }
> {
  return {
    error:
      reason === "inactive-principal"
        ? "Terms acceptance requires an active principal."
        : reason === "invalid-policy"
          ? "Terms acceptance policies must be active and target-scoped."
          : "Terms acceptance could not be committed.",
    ok: false,
    reason,
  };
}

function parseIdentityCollaboratorInvitationAcceptanceCommitRequest(
  value: unknown,
): IdentityCollaboratorInvitationAcceptanceCommitInput {
  const object = parseRecord("Identity collaborator invitation acceptance request", value);

  assertAllowedKeys("Identity collaborator invitation acceptance request", object, [
    "invitationId",
    "now",
    "principalId",
    "targetEmail",
    "targetOrganization",
    "targetSurface",
  ]);

  return {
    ...parseCollaboratorInvitationTargetFacts(object),
    invitationId: parseNonEmptyString(
      "Identity collaborator invitation acceptance invitation id",
      object.invitationId,
    ),
    now: parseIsoTimestamp("Identity collaborator invitation acceptance now", object.now),
    principalId: parseNonEmptyString(
      "Identity collaborator invitation acceptance principal id",
      object.principalId,
    ),
    targetEmail: normalizeEmailDeliveryAddress(
      "Identity collaborator invitation acceptance target email",
      object.targetEmail,
    ),
  };
}
function identityCollaboratorInvitationAcceptanceFailure(
  reason: IdentityCollaboratorInvitationAcceptanceCommitFailureReason,
): Extract<
  IdentityCollaboratorInvitationAcceptanceCommitResult,
  {
    ok: false;
  }
> {
  return {
    error:
      reason === "accepted-invitation"
        ? "Invitation has already been accepted."
        : reason === "expired-invitation"
          ? "Invitation link has expired."
          : reason === "missing-invitation" ||
              reason === "wrong-email" ||
              reason === "wrong-principal" ||
              reason === "wrong-target"
            ? "Invitation link is invalid."
            : reason === "revoked-invitation"
              ? "Invitation link is no longer available."
              : "Invitation acceptance could not be committed.",
    ok: false,
    reason,
  };
}

function isIdentityCollaboratorInvitationAcceptanceCommitResult(
  value: unknown,
): value is IdentityCollaboratorInvitationAcceptanceCommitResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (record.ok === true) {
    return (
      typeof record.principalId === "string" &&
      typeof record.status === "string" &&
      typeof record.invitation === "object" &&
      record.invitation !== null &&
      Array.isArray(record.records) &&
      typeof record.output === "object" &&
      record.output !== null
    );
  }

  return (
    record.ok === false && typeof record.reason === "string" && typeof record.error === "string"
  );
}

function isIdentityEmailVerificationCommitResult(
  value: unknown,
): value is IdentityEmailVerificationCommitResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (record.ok === true) {
    return (
      typeof record.status === "string" &&
      typeof record.output === "object" &&
      record.output !== null &&
      typeof record.principalEmail === "object" &&
      record.principalEmail !== null &&
      Array.isArray(record.records)
    );
  }

  return (
    record.ok === false && typeof record.reason === "string" && typeof record.error === "string"
  );
}

function isIdentityOwnerSetupActivationCommitResult(
  value: unknown,
): value is IdentityOwnerSetupActivationCommitResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (record.ok === true) {
    return (
      typeof record.status === "string" &&
      typeof record.output === "object" &&
      record.output !== null &&
      typeof record.owner === "object" &&
      record.owner !== null &&
      typeof record.principalEmail === "object" &&
      record.principalEmail !== null &&
      Array.isArray(record.records)
    );
  }

  return (
    record.ok === false && typeof record.reason === "string" && typeof record.error === "string"
  );
}

function responseBodyError(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const error = (value as Record<string, unknown>).error;

  return typeof error === "string" ? error : undefined;
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

async function requestCollaboratorInvitationDelivery(input: {
  env: IdentityControlPlaneApiEnv;
  invitation: StoredRecord;
  requestUrl: string;
}): Promise<CollaboratorInvitationDeliveryResult> {
  const id = input.env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);
  const response = await input.env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(new URL(INTERNAL_COLLABORATOR_INVITATION_DELIVERY_PATH, input.requestUrl), {
      body: JSON.stringify(collaboratorInvitationDeliveryInputFromRecord(input.invitation)),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
    }),
  );
  const body = (await response.json()) as
    | CollaboratorInvitationDeliveryResult
    | {
        error?: string;
      };
  if (!response.ok || !isCollaboratorInvitationDeliveryResult(body)) {
    return {
      reason: "email-delivery-scheduling-failed",
      status: "skipped",
    };
  }

  return body;
}

async function requestCollaboratorInvitationTokenRevocation(input: {
  env: IdentityControlPlaneApiEnv;
  invitationId: string;
  now: string;
  requestUrl: string;
}): Promise<CollaboratorInvitationTokenRevocationResult> {
  const id = input.env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);
  const response = await input.env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(new URL(INTERNAL_COLLABORATOR_INVITATION_TOKEN_REVOKE_PATH, input.requestUrl), {
      body: JSON.stringify({
        invitationId: input.invitationId,
        now: input.now,
      }),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
    }),
  );
  const body = (await response.json()) as
    | CollaboratorInvitationTokenRevocationResult
    | {
        error?: string;
      };

  if (!response.ok || !isCollaboratorInvitationTokenRevocationResult(body)) {
    return { ok: false, reason: "missing-token" };
  }

  return body;
}

async function scheduleCollaboratorInvitationDelivery(input: {
  env: IdentityControlPlaneApiEnv;
  input: CollaboratorInvitationDeliveryInput;
  requestUrl: string;
  storage: DurableObjectStorage;
}): Promise<CollaboratorInvitationDeliveryResult> {
  const controlPlaneRecords =
    (await readControlPlaneRecords({
      env: input.env,
      requestUrl: input.requestUrl,
    })) ?? [];
  const productionIdentity = instanceControlPlaneProductionIdentityFromRecords(controlPlaneRecords);
  const senderReference = resolveDefaultEmailSenderReference(controlPlaneRecords, "auth");

  if (!productionIdentity?.authOrigin || !senderReference) {
    return {
      reason: "missing-auth-email-configuration",
      status: "skipped",
    };
  }

  try {
    if (!resolveConfiguredDefaultCloudflareSender(controlPlaneRecords, "auth")) {
      return {
        reason: "missing-auth-email-configuration",
        status: "skipped",
      };
    }
  } catch {
    return {
      reason: "missing-auth-email-configuration",
      status: "skipped",
    };
  }

  const scheduleRequest = collaboratorInvitationDeliveryScheduleRequest({
    authOrigin: productionIdentity.authOrigin,
    input: input.input,
    inviteLink: undefined,
    senderId: senderReference.id,
  });
  const existingDelivery = readEmailDeliveryByScheduleRequest(input.storage, scheduleRequest);

  if (existingDelivery) {
    let result: Awaited<ReturnType<typeof scheduleEmailDelivery>>;

    try {
      result = await scheduleEmailDelivery({
        controlPlaneRecords,
        emailDeliveryQueue: input.env.FORMLESS_EMAIL_DELIVERY_QUEUE,
        now: input.input.createdAt,
        request: scheduleRequest,
        storage: input.storage,
        targetAuthorityName: FORMLESS_INSTANCE_AUTHORITY_NAME,
      });
    } catch {
      return {
        reason: "missing-email-delivery-queue",
        status: "skipped",
      };
    }

    return {
      delivery: result.delivery,
      queued: result.queued,
      replayed: result.replayed,
      status: "scheduled",
    };
  }

  if (!input.env.FORMLESS_EMAIL_DELIVERY_QUEUE) {
    return {
      reason: "missing-email-delivery-queue",
      status: "skipped",
    };
  }

  const tokenResult = await createFreshCollaboratorInvitationToken(input.storage, input.input);

  if (!tokenResult.ok) {
    return {
      reason:
        tokenResult.reason === "duplicate-invitation-id"
          ? "existing-token-without-delivery"
          : "email-delivery-scheduling-failed",
      status: "skipped",
    };
  }

  const inviteLink = buildCollaboratorInvitationLink({
    authOrigin: productionIdentity.authOrigin,
    invitationId: input.input.invitationId,
    token: tokenResult.rawToken,
  });
  const result = await scheduleEmailDelivery({
    controlPlaneRecords,
    emailDeliveryQueue: input.env.FORMLESS_EMAIL_DELIVERY_QUEUE,
    now: input.input.createdAt,
    request: collaboratorInvitationDeliveryScheduleRequest({
      authOrigin: productionIdentity.authOrigin,
      input: input.input,
      inviteLink,
      senderId: senderReference.id,
    }),
    storage: input.storage,
    targetAuthorityName: FORMLESS_INSTANCE_AUTHORITY_NAME,
  });

  return {
    delivery: result.delivery,
    queued: result.queued,
    replayed: result.replayed,
    status: "scheduled",
  };
}

async function createFreshCollaboratorInvitationToken(
  storage: DurableObjectStorage,
  input: CollaboratorInvitationDeliveryInput,
): Promise<
  | {
      ok: true;
      rawToken: string;
    }
  | {
      ok: false;
      reason: "duplicate-invitation-id" | "email-delivery-scheduling-failed";
    }
> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rawToken = generateCollaboratorInvitationToken();
    const tokenResult = createCollaboratorInvitationToken(storage, {
      invitationId: input.invitationId,
      tokenHash: await hashCollaboratorInvitationToken(rawToken),
      targetEmail: input.targetEmail,
      targetSurface: input.targetSurface,
      ...(input.targetOrganization === undefined
        ? {}
        : { targetOrganization: input.targetOrganization }),
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
    });

    if (tokenResult.ok) {
      return { ok: true, rawToken };
    }

    if (tokenResult.reason !== "duplicate-token-hash") {
      return { ok: false, reason: "duplicate-invitation-id" };
    }
  }

  return { ok: false, reason: "email-delivery-scheduling-failed" };
}

function collaboratorInvitationDeliveryScheduleRequest(input: {
  authOrigin: string;
  input: CollaboratorInvitationDeliveryInput;
  inviteLink: string | undefined;
  senderId: string;
}): EmailDeliveryScheduleRequest {
  return {
    canonicalOrigin: input.authOrigin,
    idempotencyKey: collaboratorInvitationDeliveryIdempotencyKey(input.input.invitationId),
    message: renderCollaboratorInvitationDeliveryMessage({
      expiresAt: input.input.expiresAt,
      inviteLink: input.inviteLink,
    }),
    messageKind: collaboratorInvitationDeliveryMessageKind,
    recipients: [{ address: input.input.targetEmail }],
    sender: { id: input.senderId },
    source: {
      recordId: input.input.invitationId,
      storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
    },
  };
}

function renderCollaboratorInvitationDeliveryMessage(input: {
  expiresAt: string;
  inviteLink: string | undefined;
}) {
  if (input.inviteLink === undefined) {
    return {
      subject: "Accept your Formless invitation",
      text: "This invitation delivery has already been rendered.",
    };
  }

  const escapedLink = htmlAttributeEscape(input.inviteLink);

  return {
    subject: "Accept your Formless invitation",
    text: [
      "You have been invited to collaborate in Formless.",
      "",
      `Accept the invitation: ${input.inviteLink}`,
      "",
      `This invitation expires at ${input.expiresAt}.`,
    ].join("\n"),
    html: [
      "<p>You have been invited to collaborate in Formless.</p>",
      `<p><a href="${escapedLink}">Accept invitation</a></p>`,
      `<p>This invitation expires at ${htmlTextEscape(input.expiresAt)}.</p>`,
    ].join(""),
  };
}

function collaboratorInvitationDeliveryIdempotencyKey(invitationId: string): string {
  return `${invitationId}:${collaboratorInvitationDeliveryPurpose}`;
}

function collaboratorInvitationDeliveryInputFromRecord(
  record: StoredRecord,
): CollaboratorInvitationDeliveryInput {
  if (record.entity !== "invitation") {
    throw new BadRequestError("Collaborator invitation delivery requires an invitation record.");
  }

  const targetFacts = parseCollaboratorInvitationTargetFacts(record.values);

  return {
    ...targetFacts,
    invitationId: parseNonEmptyString("Collaborator invitation id", record.id),
    targetEmail: normalizeEmailDeliveryAddress(
      "Collaborator invitation target email",
      record.values.targetEmail,
    ),
    createdAt: parseIsoTimestamp("Collaborator invitation createdAt", record.createdAt),
    expiresAt: parseIsoTimestamp("Collaborator invitation expiresAt", record.values.expiresAt),
  };
}

function parseCollaboratorInvitationDeliveryRequest(
  value: unknown,
): CollaboratorInvitationDeliveryInput {
  const object = parseRecord("Collaborator invitation delivery request", value);

  assertAllowedKeys("Collaborator invitation delivery request", object, [
    "createdAt",
    "expiresAt",
    "invitationId",
    "targetEmail",
    "targetOrganization",
    "targetSurface",
  ]);

  return {
    ...parseCollaboratorInvitationTargetFacts(object),
    invitationId: parseNonEmptyString("Collaborator invitation id", object.invitationId),
    targetEmail: normalizeEmailDeliveryAddress(
      "Collaborator invitation target email",
      object.targetEmail,
    ),
    createdAt: parseIsoTimestamp("Collaborator invitation createdAt", object.createdAt),
    expiresAt: parseIsoTimestamp("Collaborator invitation expiresAt", object.expiresAt),
  };
}

function parseCollaboratorInvitationRevokeRequest(
  value: unknown,
): IdentityCollaboratorInvitationRevokeRequest {
  const object = parseRecord("Collaborator invitation revoke request", value);
  const now = parseOptionalIsoTimestamp("Collaborator invitation revoke now", object.now);

  assertAllowedKeys("Collaborator invitation revoke request", object, ["invitationId", "now"]);

  return {
    invitationId: parseNonEmptyString(
      "Collaborator invitation revoke invitationId",
      object.invitationId,
    ),
    ...(now === undefined ? {} : { now }),
  };
}

function parseCollaboratorInvitationTokenRevocationRequest(
  value: unknown,
): CollaboratorInvitationTokenRevocationInput {
  const object = parseRecord("Collaborator invitation token revocation request", value);

  assertAllowedKeys("Collaborator invitation token revocation request", object, [
    "invitationId",
    "now",
  ]);

  return {
    invitationId: parseNonEmptyString(
      "Collaborator invitation token revocation invitationId",
      object.invitationId,
    ),
    now: parseIsoTimestamp("Collaborator invitation token revocation now", object.now),
  };
}

function isCollaboratorInvitationDeliveryResult(
  value: unknown,
): value is CollaboratorInvitationDeliveryResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (record.status === "skipped") {
    return typeof record.reason === "string";
  }

  return (
    record.status === "scheduled" &&
    typeof record.queued === "boolean" &&
    typeof record.replayed === "boolean" &&
    typeof record.delivery === "object" &&
    record.delivery !== null
  );
}

function collaboratorInvitationTokenRevocationResult(
  result: RevokeCollaboratorInvitationTokenResult,
): CollaboratorInvitationTokenRevocationResult {
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

function isCollaboratorInvitationTokenRevocationResult(
  value: unknown,
): value is CollaboratorInvitationTokenRevocationResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (record.ok === true) {
    return true;
  }

  return (
    record.ok === false &&
    typeof record.reason === "string" &&
    ["already-consumed", "expired-token", "missing-token", "revoked-token"].includes(record.reason)
  );
}

function htmlAttributeEscape(value: string): string {
  return htmlTextEscape(value).replaceAll('"', "&quot;");
}

function htmlTextEscape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function collaboratorInvitationRecordWritePlans(
  input: CreateCollaboratorInvitationInput,
  options: {
    inviterPrincipalId?: string;
  },
): OperationRecordWritePlan[] {
  const invitedPrincipalId =
    input.invitedPrincipal === undefined
      ? undefined
      : (input.invitedPrincipal.id ?? generatedIdentityRecordId("principal"));
  const linkedRecordsRequested =
    input.principalEmail !== undefined ||
    input.memberships.length > 0 ||
    input.roleAssignments.length > 0;

  if (linkedRecordsRequested && invitedPrincipalId === undefined) {
    throw new BadRequestError(
      "Collaborator invitation linked identity records require invitedPrincipal.",
    );
  }

  const invitationId = input.invitationId ?? generatedIdentityRecordId("invitation");
  const plans: OperationRecordWritePlan[] = [];

  if (input.invitedPrincipal !== undefined && invitedPrincipalId !== undefined) {
    plans.push({
      kind: "create",
      entity: "principal",
      id: invitedPrincipalId,
      values: {
        displayName: input.invitedPrincipal.displayName,
        kind: "human",
        status: "invited",
      },
    });
  }

  if (input.principalEmail !== undefined && invitedPrincipalId !== undefined) {
    plans.push({
      kind: "create",
      entity: "principal-email",
      id: input.principalEmail.id ?? generatedIdentityRecordId("principal-email"),
      values: {
        principal: invitedPrincipalId,
        displayEmail: input.targetEmail,
        normalizedEmail: input.targetEmail.toLowerCase(),
        verificationStatus: "unverified",
        primary: input.principalEmail.primary,
        recovery: input.principalEmail.recovery,
      },
    });
  }

  for (const [index, membership] of input.memberships.entries()) {
    if (invitedPrincipalId === undefined) {
      throw new BadRequestError(`Collaborator invitation membership ${index} requires principal.`);
    }

    plans.push({
      kind: "create",
      entity: "membership",
      id: membership.id ?? generatedIdentityRecordId("membership"),
      values: collaboratorInvitationMembershipValues(membership, invitedPrincipalId),
    });
  }

  for (const [index, roleAssignment] of input.roleAssignments.entries()) {
    if (invitedPrincipalId === undefined) {
      throw new BadRequestError(
        `Collaborator invitation role assignment ${index} requires principal.`,
      );
    }

    plans.push(
      roleAssignment.scopeKind === "program"
        ? {
            kind: "create",
            entity: "program-role-assignment",
            id: roleAssignment.id ?? generatedIdentityRecordId("program-role-assignment"),
            values: {
              principal: invitedPrincipalId,
              roleId: roleAssignment.roleId,
              status: "active",
            },
          }
        : {
            kind: "create",
            entity: "role-assignment",
            id: roleAssignment.id ?? generatedIdentityRecordId("role-assignment"),
            values: collaboratorInvitationRoleAssignmentValues(roleAssignment, invitedPrincipalId),
          },
    );
  }

  plans.push({
    kind: "create",
    entity: "invitation",
    id: invitationId,
    values: {
      targetEmail: input.targetEmail,
      ...collaboratorInvitationTargetValues(input),
      ...(invitedPrincipalId === undefined ? {} : { invitedPrincipal: invitedPrincipalId }),
      ...(options.inviterPrincipalId === undefined
        ? {}
        : { inviterPrincipal: options.inviterPrincipalId }),
      status: "pending",
      expiresAt: input.expiresAt,
    },
  });

  return plans;
}

function collaboratorInvitationTargetValues(
  input: CollaboratorInvitationTargetFacts,
): Pick<CreateCollaboratorInvitationInput, "targetOrganization" | "targetSurface"> {
  if (input.targetSurface === "organization") {
    return {
      targetSurface: input.targetSurface,
      targetOrganization: requiredParsedString(
        "Collaborator invitation target organization",
        input.targetOrganization,
      ),
    };
  }

  return {
    targetSurface: input.targetSurface,
  };
}

function collaboratorInvitationMembershipValues(
  input: CollaboratorInvitationMembershipInput,
  principalId: string,
): IdentityMembershipValues {
  if (input.targetKind === "group") {
    return {
      principal: principalId,
      targetKind: input.targetKind,
      targetGroup: requiredParsedString(
        "Collaborator invitation membership target group",
        input.targetGroup,
      ),
      status: "invited",
    };
  }

  return {
    principal: principalId,
    targetKind: input.targetKind,
    targetOrganization: requiredParsedString(
      "Collaborator invitation membership target organization",
      input.targetOrganization,
    ),
    status: "invited",
  };
}

function collaboratorInvitationRoleAssignmentValues(
  input: CollaboratorInvitationRoleAssignmentInput,
  principalId: string,
): IdentityRoleAssignmentValues {
  if (input.scopeKind === "program") {
    throw new Error("Program invitation roles use Program role assignment records.");
  }

  return {
    role: input.role,
    targetKind: "principal",
    targetPrincipal: principalId,
    scopeKind: input.scopeKind,
    status: "active",
  };
}

function identityOwnerRecords(input: {
  now: string;
  owner: OwnerIdentityInput;
  principalId: string;
  records: readonly StoredRecord[];
}): StoredRecord[] {
  const ownerRole = activeRoleRecord(input.records, "instance.owner");
  const records: StoredRecord[] = [
    {
      id: input.principalId,
      entity: "principal",
      values: {
        displayName: input.owner.name,
        kind: "human",
        status: "active",
      },
      createdAt: input.now,
      updatedAt: input.now,
    },
    {
      id: `role-assignment:${input.principalId}:instance.owner`,
      entity: "role-assignment",
      values: {
        role: ownerRole.id,
        targetKind: "principal",
        targetPrincipal: input.principalId,
        scopeKind: "instance",
        status: "active",
      },
      createdAt: input.now,
      updatedAt: input.now,
    },
  ];

  if (input.owner.email !== undefined) {
    records.splice(1, 0, {
      id: `principal-email:${input.principalId}:primary`,
      entity: "principal-email",
      values: {
        principal: input.principalId,
        displayEmail: input.owner.email,
        normalizedEmail: normalizeIdentityEmail(input.owner.email),
        verificationStatus: "unverified",
        primary: true,
        recovery: true,
      },
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  assertNewIdentityRecordIds(input.records, records);

  return records;
}

function readActiveIdentityOwner(storage: DurableObjectStorage): OwnerIdentity | null {
  ensureIdentityControlPlaneStorage(storage);

  const records = getBootstrapRecords(storage);
  const ownerRole = activeRoleRecordOrUndefined(records, "instance.owner");

  if (!ownerRole) {
    return null;
  }

  const principals = new Map(
    records
      .filter(
        (record) =>
          record.entity === "principal" && !record.deletedAt && record.values.status === "active",
      )
      .map((record) => [record.id, record]),
  );
  const assignment = records
    .filter(
      (record) =>
        record.entity === "role-assignment" &&
        !record.deletedAt &&
        record.values.status === "active" &&
        record.values.role === ownerRole.id &&
        record.values.targetKind === "principal" &&
        record.values.scopeKind === "instance" &&
        typeof record.values.targetPrincipal === "string" &&
        principals.has(record.values.targetPrincipal),
    )
    .sort(compareStoredRecords)[0];

  if (!assignment || typeof assignment.values.targetPrincipal !== "string") {
    return null;
  }

  const principal = principals.get(assignment.values.targetPrincipal);

  if (!principal) {
    return null;
  }

  return identityOwnerFromPrincipal(records, principal);
}

function readActiveIdentityOwnerForPrincipal(
  storage: DurableObjectStorage,
  principalId: string,
): OwnerIdentity | null {
  ensureIdentityControlPlaneStorage(storage);

  const records = getBootstrapRecords(storage);
  const ownerRole = activeRoleRecordOrUndefined(records, "instance.owner");
  const principal = records.find(
    (record) =>
      record.id === principalId &&
      record.entity === "principal" &&
      !record.deletedAt &&
      record.values.status === "active",
  );

  if (!principal) {
    return null;
  }

  const assignment = records.find(
    (record) =>
      record.entity === "role-assignment" &&
      !record.deletedAt &&
      record.values.status === "active" &&
      record.values.role === ownerRole?.id &&
      record.values.targetKind === "principal" &&
      record.values.scopeKind === "instance" &&
      record.values.targetPrincipal === principal.id,
  );

  if (!assignment) {
    return null;
  }

  return identityOwnerFromPrincipal(records, principal);
}

function readActiveIdentityAuthorityForPrincipal(
  storage: DurableObjectStorage,
  principalId: string,
): ActiveIdentityAuthority | null {
  ensureIdentityControlPlaneStorage(storage);

  const records = getBootstrapRecords(storage);
  const principal = records.find(
    (record) =>
      record.id === principalId &&
      record.entity === "principal" &&
      !record.deletedAt &&
      record.values.status === "active",
  );

  if (!principal) {
    return null;
  }

  return {
    callerFacts: resolveIdentityProgramCallerFacts(
      records,
      principal.id,
      formlessProgramSchema.authorization?.roles ?? [],
    ),
    id: principal.id,
  };
}

function readActiveIdentityPrincipal(
  storage: DurableObjectStorage,
  principalId: string,
): ActiveIdentityPrincipal | null {
  ensureIdentityControlPlaneStorage(storage);

  const records = getBootstrapRecords(storage);
  const principal = records.find(
    (record) =>
      record.id === principalId &&
      record.entity === "principal" &&
      !record.deletedAt &&
      record.values.status === "active",
  );

  return principal ? activeIdentityPrincipalFromRecord(records, principal) : null;
}

function readAccountCompletionIdentityState(
  storage: DurableObjectStorage,
  input: {
    principalId: string;
    target: ReturnType<typeof parseAccountCompletionGateTarget>;
  },
): AccountCompletionIdentityState {
  ensureIdentityControlPlaneStorage(storage);

  const records = selectCurrentFormlessProgramRecords(getBootstrapRecords(storage));
  const principal = records.find(
    (record) =>
      record.id === input.principalId && record.entity === "principal" && !record.deletedAt,
  );
  const emails = records
    .filter(
      (record) =>
        record.entity === "principal-email" &&
        !record.deletedAt &&
        record.values.principal === input.principalId,
    )
    .sort(compareStoredRecords);

  return {
    accountPolicies: records
      .filter(
        (record) =>
          record.entity === "account-policy" &&
          !record.deletedAt &&
          accountPolicyAppliesToCompletionTarget(record, input.target),
      )
      .sort(compareStoredRecords),
    invitations: records
      .filter(
        (record) =>
          record.entity === "invitation" &&
          !record.deletedAt &&
          record.values.invitedPrincipal === input.principalId &&
          invitationAppliesToCompletionTarget(record, input.target),
      )
      .sort(compareStoredRecords),
    memberships: records
      .filter(
        (record) =>
          record.entity === "membership" &&
          !record.deletedAt &&
          record.values.principal === input.principalId,
      )
      .sort(compareStoredRecords),
    policyAcceptances: records
      .filter(
        (record) =>
          record.entity === "principal-policy-acceptance" &&
          !record.deletedAt &&
          record.values.principal === input.principalId,
      )
      .sort(compareStoredRecords),
    primaryEmail: emails.find((record) => record.values.primary === true) ?? null,
    principal: principal ?? null,
  };
}

function invitationAppliesToCompletionTarget(
  record: StoredRecord,
  target: ReturnType<typeof parseAccountCompletionGateTarget>,
): boolean {
  if (record.values.targetSurface === "instance") {
    return target.targetProfile === "instance";
  }

  return (
    target.selectedOrganization !== undefined &&
    record.values.targetSurface === "organization" &&
    record.values.targetOrganization === target.selectedOrganization
  );
}

function accountPolicyAppliesToCompletionTarget(
  record: StoredRecord,
  target: ReturnType<typeof parseAccountCompletionGateTarget>,
): boolean {
  if (record.values.scopeKind === "instance") {
    return true;
  }

  return (
    target.selectedOrganization !== undefined &&
    record.values.scopeKind === "organization" &&
    record.values.scopeOrganization === target.selectedOrganization
  );
}

function identityOwnerFromPrincipal(
  records: readonly StoredRecord[],
  principal: StoredRecord,
): OwnerIdentity {
  const identity = activeIdentityPrincipalFromRecord(records, principal);

  return {
    id: identity.id,
    name: identity.displayName,
    ...(identity.email === undefined ? {} : { email: identity.email }),
    createdAt: principal.createdAt,
  };
}

function activeIdentityPrincipalFromRecord(
  records: readonly StoredRecord[],
  principal: StoredRecord,
): ActiveIdentityPrincipal {
  const email = primaryPrincipalEmail(records, principal.id);

  return {
    displayName: parseNonEmptyString(
      "Identity principal display name",
      principal.values.displayName,
    ),
    ...(email === undefined ? {} : { email }),
    id: principal.id,
  };
}

function activeRoleRecord(
  records: readonly StoredRecord[],
  roleKey: IdentityControlPlaneRoleKey,
): StoredRecord {
  const role = records.find(
    (record) =>
      record.entity === "role" &&
      !record.deletedAt &&
      record.values.status === "active" &&
      record.values.key === roleKey,
  );

  if (!role) {
    throw new Error(`Identity owner role "${roleKey}" is missing.`);
  }

  return role;
}

function activeRoleRecordOrUndefined(
  records: readonly StoredRecord[],
  roleKey: IdentityControlPlaneRoleKey,
): StoredRecord | undefined {
  return records.find(
    (record) =>
      record.entity === "role" &&
      !record.deletedAt &&
      record.values.status === "active" &&
      record.values.key === roleKey,
  );
}

function primaryPrincipalEmail(records: readonly StoredRecord[], principalId: string) {
  const record = records
    .filter(
      (candidate) =>
        candidate.entity === "principal-email" &&
        !candidate.deletedAt &&
        candidate.values.principal === principalId &&
        candidate.values.primary === true,
    )
    .sort(compareStoredRecords)[0];

  if (!record) {
    return undefined;
  }

  return parseNonEmptyString("Identity principal email", record.values.displayEmail);
}

function compareStoredRecords(left: StoredRecord, right: StoredRecord) {
  const created = left.createdAt.localeCompare(right.createdAt);

  return created === 0 ? left.id.localeCompare(right.id) : created;
}

function assertNewIdentityRecordIds(
  records: readonly StoredRecord[],
  newRecords: readonly StoredRecord[],
) {
  const existingIds = new Set(records.map((record) => record.id));

  for (const record of newRecords) {
    if (existingIds.has(record.id)) {
      throw new Error(`Identity owner record "${record.id}" already exists.`);
    }
  }
}

function parseEnsureIdentityOwnerRequest(value: unknown): EnsureIdentityOwnerInput {
  const object = parseRecord("Identity owner request", value);
  const allowedKeys = new Set(["now", "owner", "ownerId"]);

  for (const key of Object.keys(object)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Identity owner request has unsupported key "${key}".`);
    }
  }

  return {
    now: parseNonEmptyString("Identity owner now", object.now),
    owner: normalizeIdentityOwnerInput(object.owner),
    ...(object.ownerId === undefined
      ? {}
      : { ownerId: parseNonEmptyString("Identity owner principal id", object.ownerId) }),
  };
}

function parseCreateCollaboratorInvitationRequest(
  value: unknown,
): ParsedCreateCollaboratorInvitationInput {
  const object = parseRecord("Collaborator invitation request", value);

  assertAllowedKeys("Collaborator invitation request", object, [
    "idempotencyKey",
    "invitationId",
    "invitedPrincipal",
    "memberships",
    "now",
    "principalEmail",
    "roleAssignments",
    "targetEmail",
    "targetOrganization",
    "targetSurface",
  ]);

  const targetEmail = normalizeEmailDeliveryAddress(
    "Collaborator invitation target email",
    object.targetEmail,
  );
  const acceptanceTarget = parseOptionalCollaboratorInvitationTargetFacts(object);
  const now = parseOptionalIsoTimestamp("Collaborator invitation now", object.now);
  const expiresAt = new Date(
    new Date(now ?? new Date().toISOString()).getTime() + collaboratorInvitationLifetimeMs,
  ).toISOString();

  return {
    targetEmail,
    expiresAt,
    idempotencyKey: parseNonEmptyString(
      "Collaborator invitation idempotencyKey",
      object.idempotencyKey,
    ),
    ...(object.invitationId === undefined
      ? {}
      : {
          invitationId: parseNonEmptyString("Collaborator invitation id", object.invitationId),
        }),
    ...(object.invitedPrincipal === undefined
      ? {}
      : { invitedPrincipal: parseCollaboratorInvitationPrincipal(object.invitedPrincipal) }),
    ...(object.principalEmail === undefined
      ? {}
      : { principalEmail: parseCollaboratorInvitationPrincipalEmail(object.principalEmail) }),
    memberships: parseCollaboratorInvitationMemberships(object.memberships),
    roleAssignments: parseCollaboratorInvitationRoleAssignments(object.roleAssignments),
    ...(acceptanceTarget === undefined ? {} : { acceptanceTarget }),
    ...(now === undefined ? {} : { now }),
  };
}

function parseOptionalCollaboratorInvitationTargetFacts(
  object: Record<string, unknown>,
): CollaboratorInvitationTargetFacts | undefined {
  if (object.targetSurface === undefined && object.targetOrganization === undefined) {
    return undefined;
  }

  if (object.targetSurface === undefined) {
    throw new BadRequestError(
      "Collaborator invitation acceptance target ids require targetSurface.",
    );
  }

  return parseCollaboratorInvitationTargetFacts(object);
}

function parseCollaboratorInvitationTargetFacts(
  object: Record<string, unknown>,
): CollaboratorInvitationTargetFacts {
  const targetSurface = parseStringLiteral(
    "Collaborator invitation targetSurface",
    object.targetSurface,
    invitationTargetSurfaces,
  );
  const targetOrganization = parseOptionalNonEmptyString(
    "Collaborator invitation targetOrganization",
    object.targetOrganization,
  );

  if (targetSurface === "organization") {
    if (targetOrganization === undefined) {
      throw new BadRequestError(
        "Collaborator invitation organization target requires targetOrganization only.",
      );
    }

    return {
      targetSurface,
      targetOrganization,
    };
  }

  if (targetOrganization !== undefined) {
    throw new BadRequestError("Collaborator invitation instance target cannot include target ids.");
  }

  return { targetSurface };
}

function parseCollaboratorInvitationPrincipal(
  value: unknown,
): CollaboratorInvitationPrincipalInput {
  const object = parseRecord("Collaborator invitation invitedPrincipal", value);

  assertAllowedKeys("Collaborator invitation invitedPrincipal", object, ["displayName", "id"]);

  return {
    displayName: parseNonEmptyString(
      "Collaborator invitation invitedPrincipal displayName",
      object.displayName,
    ),
    ...(object.id === undefined
      ? {}
      : {
          id: parseNonEmptyString("Collaborator invitation invitedPrincipal id", object.id),
        }),
  };
}

function parseCollaboratorInvitationPrincipalEmail(
  value: unknown,
): CollaboratorInvitationPrincipalEmailInput {
  const object = parseRecord("Collaborator invitation principalEmail", value);

  assertAllowedKeys("Collaborator invitation principalEmail", object, [
    "id",
    "primary",
    "recovery",
  ]);

  return {
    ...(object.id === undefined
      ? {}
      : { id: parseNonEmptyString("Collaborator invitation principalEmail id", object.id) }),
    primary:
      parseOptionalBoolean("Collaborator invitation principalEmail primary", object.primary) ??
      true,
    recovery:
      parseOptionalBoolean("Collaborator invitation principalEmail recovery", object.recovery) ??
      false,
  };
}

function parseCollaboratorInvitationMemberships(
  value: unknown,
): CollaboratorInvitationMembershipInput[] {
  return parseOptionalArray("Collaborator invitation memberships", value, (item, index) => {
    const object = parseRecord(`Collaborator invitation memberships ${index}`, item);

    assertAllowedKeys(`Collaborator invitation memberships ${index}`, object, [
      "id",
      "targetGroup",
      "targetKind",
      "targetOrganization",
    ]);

    const targetKind = parseStringLiteral(
      `Collaborator invitation memberships ${index} targetKind`,
      object.targetKind,
      membershipTargetKinds,
    );
    const targetGroup = parseOptionalNonEmptyString(
      `Collaborator invitation memberships ${index} targetGroup`,
      object.targetGroup,
    );
    const targetOrganization = parseOptionalNonEmptyString(
      `Collaborator invitation memberships ${index} targetOrganization`,
      object.targetOrganization,
    );

    if (targetKind === "group") {
      if (targetGroup === undefined || targetOrganization !== undefined) {
        throw new BadRequestError(
          `Collaborator invitation memberships ${index} group target requires targetGroup only.`,
        );
      }

      return {
        ...(object.id === undefined
          ? {}
          : {
              id: parseNonEmptyString(`Collaborator invitation memberships ${index} id`, object.id),
            }),
        targetKind,
        targetGroup,
      };
    }

    if (targetOrganization === undefined || targetGroup !== undefined) {
      throw new BadRequestError(
        `Collaborator invitation memberships ${index} organization target requires targetOrganization only.`,
      );
    }

    return {
      ...(object.id === undefined
        ? {}
        : {
            id: parseNonEmptyString(`Collaborator invitation memberships ${index} id`, object.id),
          }),
      targetKind,
      targetOrganization,
    };
  });
}

function parseCollaboratorInvitationRoleAssignments(
  value: unknown,
): CollaboratorInvitationRoleAssignmentInput[] {
  return parseOptionalArray("Collaborator invitation roleAssignments", value, (item, index) => {
    const object = parseRecord(`Collaborator invitation roleAssignments ${index}`, item);

    assertAllowedKeys(`Collaborator invitation roleAssignments ${index}`, object, [
      "id",
      "role",
      "roleId",
      "roleKey",
      "scopeKind",
    ]);

    const scopeKind = parseStringLiteral(
      `Collaborator invitation roleAssignments ${index} scopeKind`,
      object.scopeKind,
      ["instance", "program"] as const,
    );

    if (scopeKind === "program") {
      if (object.role !== undefined || object.roleKey !== undefined) {
        throw new BadRequestError(
          `Collaborator invitation roleAssignments ${index} Program scope requires roleId only.`,
        );
      }

      let roleId: `role_${string}`;
      try {
        roleId = parseAuthorizationRoleId(
          `Collaborator invitation roleAssignments ${index} roleId`,
          object.roleId,
        );
      } catch (error) {
        throw new BadRequestError(
          error instanceof Error ? error.message : "Invalid Program role id.",
        );
      }

      return {
        ...(object.id === undefined
          ? {}
          : {
              id: parseNonEmptyString(
                `Collaborator invitation roleAssignments ${index} id`,
                object.id,
              ),
            }),
        roleId,
        scopeKind,
      };
    }

    if (object.roleId !== undefined) {
      throw new BadRequestError(
        `Collaborator invitation roleAssignments ${index} legacy scope cannot include roleId.`,
      );
    }

    const role = parseCollaboratorInvitationRoleReference(object, index);

    return {
      ...(object.id === undefined
        ? {}
        : {
            id: parseNonEmptyString(
              `Collaborator invitation roleAssignments ${index} id`,
              object.id,
            ),
          }),
      role,
      scopeKind,
    };
  });
}

function parseCollaboratorInvitationRoleReference(
  object: Record<string, unknown>,
  index: number,
): string {
  const role = parseOptionalNonEmptyString(
    `Collaborator invitation roleAssignments ${index} role`,
    object.role,
  );
  const roleKey = parseOptionalStringLiteral(
    `Collaborator invitation roleAssignments ${index} roleKey`,
    object.roleKey,
    identityControlPlaneRoleKeys,
  );

  if (
    (role === undefined && roleKey === undefined) ||
    (role !== undefined && roleKey !== undefined)
  ) {
    throw new BadRequestError(
      `Collaborator invitation roleAssignments ${index} must include exactly one of role or roleKey.`,
    );
  }

  return role ?? `role:${roleKey}`;
}

function normalizeIdentityOwnerInput(value: unknown): OwnerIdentityInput {
  const object = parseRecord("Identity owner", value);
  const allowedKeys = new Set(["email", "name"]);

  for (const key of Object.keys(object)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Identity owner has unsupported key "${key}".`);
    }
  }

  return {
    name: parseNonEmptyString("Identity owner name", object.name),
    ...(object.email === undefined
      ? {}
      : { email: parseNonEmptyString("Identity owner email", object.email) }),
  };
}

function normalizeIdentityEmail(value: string) {
  return parseNonEmptyString("Identity owner normalized email", value).toLowerCase();
}

function validateIdentityControlPlaneRecordConstraint(
  storage: DurableObjectStorage,
): RecordConstraintValidator {
  return (entityName, values, options) => {
    const records = getBootstrapRecords(storage);
    const candidateRecord = candidateIdentityRecord(records, entityName, values, options);
    const replacedRecords = options?.ignoreRecordId
      ? records.map((record) => (record.id === options.ignoreRecordId ? candidateRecord : record))
      : [...records, candidateRecord];
    const additionalRecords = options?.additionalRecords ?? [];
    const additionalIds = new Set(additionalRecords.map((record) => record.id));
    const candidateRecords = [
      ...replacedRecords.filter((record) => !additionalIds.has(record.id)),
      ...additionalRecords,
    ];

    validateIdentityControlPlaneRecords(
      "Identity control-plane records",
      candidateRecords.filter(isIdentityProgramRecord).filter(isCurrentFormlessProgramRecord),
      {
        authorizationRoles: formlessProgramSchema.authorization?.roles,
        candidateRecords,
      },
    );
  };
}

function candidateIdentityRecord(
  records: readonly StoredRecord[],
  entity: string,
  values: RecordValues,
  options:
    | {
        ignoreRecordId?: string;
      }
    | undefined,
): StoredRecord {
  const existing = options?.ignoreRecordId
    ? records.find((record) => record.id === options.ignoreRecordId)
    : undefined;

  if (existing) {
    return {
      ...existing,
      values,
      updatedAt: builtInRoleCreatedAt,
    };
  }

  return {
    id: pendingRecordId(records, entity),
    entity,
    values,
    createdAt: builtInRoleCreatedAt,
    updatedAt: builtInRoleCreatedAt,
  };
}

function pendingRecordId(records: readonly StoredRecord[], entity: string) {
  const existingIds = new Set(records.map((record) => record.id));
  let id = `pending:${entity}`;

  while (existingIds.has(id)) {
    id = `${id}:next`;
  }

  return id;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new BadRequestError("Request body must be valid JSON.");
  }
}

function parseRecord(context: string, value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestError(`${context} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function assertAllowedKeys(
  context: string,
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
) {
  const allowed = new Set(allowedKeys);

  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new BadRequestError(`${context} has unsupported key "${key}".`);
    }
  }
}

function parseOptionalArray<T>(
  context: string,
  value: unknown,
  parseItem: (item: unknown, index: number) => T,
): T[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new BadRequestError(`${context} must be an array.`);
  }

  return value.map((item, index) => parseItem(item, index));
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

function parseUniqueNonEmptyStringList(context: string, value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BadRequestError(`${context} must be a non-empty array.`);
  }

  const parsed = value.map((item, index) => parseNonEmptyString(`${context}[${index}]`, item));
  const unique = new Set(parsed);

  if (unique.size !== parsed.length) {
    throw new BadRequestError(`${context} must not contain duplicates.`);
  }

  return parsed;
}

function parseOptionalNonEmptyString(context: string, value: unknown): string | undefined {
  return value === undefined ? undefined : parseNonEmptyString(context, value);
}

function requiredParsedString(context: string, value: string | undefined): string {
  if (value === undefined) {
    throw new BadRequestError(`${context} must be a non-empty string.`);
  }

  return value;
}

function parseIsoTimestamp(context: string, value: unknown): string {
  const timestamp = parseNonEmptyString(context, value);
  const date = new Date(timestamp);

  if (Number.isNaN(date.valueOf()) || date.toISOString() !== timestamp) {
    throw new BadRequestError(`${context} must be an ISO timestamp.`);
  }

  return timestamp;
}

function parseOptionalIsoTimestamp(context: string, value: unknown): string | undefined {
  return value === undefined ? undefined : parseIsoTimestamp(context, value);
}

function parseBoolean(context: string, value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new BadRequestError(`${context} must be a boolean.`);
  }

  return value;
}

function parseOptionalBoolean(context: string, value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new BadRequestError(`${context} must be a boolean.`);
  }

  return value;
}

function parseStringLiteral<const Values extends readonly string[]>(
  context: string,
  value: unknown,
  values: Values,
): Values[number] {
  const parsed = parseNonEmptyString(context, value);

  if (!values.includes(parsed as Values[number])) {
    throw new BadRequestError(`${context} must be one of: ${values.join(", ")}.`);
  }

  return parsed as Values[number];
}

function parseOptionalStringLiteral<const Values extends readonly string[]>(
  context: string,
  value: unknown,
  values: Values,
): Values[number] | undefined {
  return value === undefined ? undefined : parseStringLiteral(context, value, values);
}

function generatedIdentityRecordId(entity: string): string {
  return `${entity}:${crypto.randomUUID()}`;
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Bad request.";
}
