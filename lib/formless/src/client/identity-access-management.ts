import {
  IDENTITY_COLLABORATOR_INVITATIONS_API_PATH,
  IDENTITY_COLLABORATOR_INVITATION_REVOKE_API_PATH,
  IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_PATH,
  IDENTITY_ACCESS_PERSON_REMOVAL_API_PATH,
  IDENTITY_ACCESS_PERSON_ROLE_REPLACEMENT_API_PATH,
  IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX,
  parseIdentityAccessErrorResponse,
  parseIdentityAccessPersonMutationErrorResponse,
  parseIdentityCollaboratorInvitationRevokeErrorResponse,
  type IdentityAccessErrorCode,
  type IdentityControlPlaneRoleKey,
  type IdentityAccessManagementSummary,
  type IdentityAccessPersonMutationFailureReason,
  type IdentityAccessPersonRemovalRequest,
  type IdentityAccessPersonRemovalResponse,
  type IdentityAccessPersonRoleReplacementRequest,
  type IdentityAccessPersonRoleReplacementResponse,
  type IdentityCollaboratorInvitationRevokeRequest,
  type IdentityCollaboratorInvitationRevokeFailureReason,
  type IdentityCollaboratorInvitationRevokeResponse,
  type IdentityInvitationTargetSurface,
  type IdentityMembershipTargetKind,
  type IdentityProgramRoleId,
  type IdentityRoleAssignmentScopeKind,
} from "@dpeek/formless-identity-control-plane";
import { invalidateProgramAuthorityForProtectedResponse } from "./program-authority.ts";

export const IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_ROUTE =
  `${IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX}${IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_PATH}` as const;
export const IDENTITY_ACCESS_PERSON_ROLE_REPLACEMENT_API_ROUTE =
  `${IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX}${IDENTITY_ACCESS_PERSON_ROLE_REPLACEMENT_API_PATH}` as const;
export const IDENTITY_ACCESS_PERSON_REMOVAL_API_ROUTE =
  `${IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX}${IDENTITY_ACCESS_PERSON_REMOVAL_API_PATH}` as const;
export const IDENTITY_COLLABORATOR_INVITATIONS_API_ROUTE =
  `${IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX}${IDENTITY_COLLABORATOR_INVITATIONS_API_PATH}` as const;
export const IDENTITY_COLLABORATOR_INVITATION_REVOKE_API_ROUTE =
  `${IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX}${IDENTITY_COLLABORATOR_INVITATION_REVOKE_API_PATH}` as const;

export type CreateIdentityAccessManagementInvitationInput = {
  idempotencyKey: string;
  invitedPrincipal?: {
    displayName: string;
  };
  memberships?: Array<
    | {
        targetGroup: string;
        targetKind: Extract<IdentityMembershipTargetKind, "group">;
      }
    | {
        targetKind: Extract<IdentityMembershipTargetKind, "organization">;
        targetOrganization: string;
      }
  >;
  principalEmail?: {
    primary: boolean;
    recovery: boolean;
  };
  roleAssignments?: Array<
    | {
        roleKey: Extract<IdentityControlPlaneRoleKey, "instance.owner">;
        scopeKind: Extract<IdentityRoleAssignmentScopeKind, "instance">;
      }
    | {
        roleId: IdentityProgramRoleId;
        scopeKind: "program";
      }
  >;
  targetEmail: string;
  targetOrganization?: string;
  targetSurface?: IdentityInvitationTargetSurface;
};

export type IdentityAccessManagementInvitationResponse = {
  delivery?: unknown;
  invitation?: unknown;
  output?: unknown;
  records?: unknown[];
  status?: "committed" | "replayed";
};

export type RevokeIdentityAccessManagementInvitationInput =
  IdentityCollaboratorInvitationRevokeRequest;

export type IdentityAccessManagementInvitationRevokeResponse =
  IdentityCollaboratorInvitationRevokeResponse;

export type IdentityAccessManagementTransportFailure = {
  code: IdentityAccessErrorCode | "invalid-response";
  kind: "transport";
};

export type IdentityAccessManagementFailure =
  | IdentityAccessManagementTransportFailure
  | {
      kind: "person-mutation";
      reason: IdentityAccessPersonMutationFailureReason;
    }
  | {
      kind: "invitation-revocation";
      reason: IdentityCollaboratorInvitationRevokeFailureReason;
    };

export class IdentityAccessManagementApiError extends Error {
  readonly failure: IdentityAccessManagementFailure;
  readonly status: number;

  constructor(failure: IdentityAccessManagementFailure, options: { status: number }) {
    super("Identity access management request failed.");
    this.name = "IdentityAccessManagementApiError";
    this.failure = failure;
    this.status = options.status;
  }
}

export async function fetchIdentityAccessManagementSummary({
  fetcher = fetch,
  signal,
}: {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
} = {}): Promise<IdentityAccessManagementSummary> {
  const response = await fetcher(IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_ROUTE, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });

  return readJsonResponse(response, "transport", identityAccessManagementSummary);
}

export async function createIdentityAccessManagementInvitation(
  input: CreateIdentityAccessManagementInvitationInput,
  {
    fetcher = fetch,
    signal,
  }: {
    fetcher?: typeof fetch;
    signal?: AbortSignal;
  } = {},
): Promise<IdentityAccessManagementInvitationResponse> {
  const response = await fetcher(IDENTITY_COLLABORATOR_INVITATIONS_API_ROUTE, {
    body: JSON.stringify({
      memberships: [],
      roleAssignments: [],
      ...input,
    }),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });

  return readJsonResponse(response, "transport", identityAccessManagementInvitationResponse);
}

export async function replaceIdentityAccessManagementPersonRoles(
  input: IdentityAccessPersonRoleReplacementRequest,
  {
    fetcher = fetch,
    signal,
  }: {
    fetcher?: typeof fetch;
    signal?: AbortSignal;
  } = {},
): Promise<IdentityAccessPersonRoleReplacementResponse> {
  return postIdentityAccessManagementRequest(
    IDENTITY_ACCESS_PERSON_ROLE_REPLACEMENT_API_ROUTE,
    input,
    { fetcher, signal },
    "person-mutation",
    identityAccessPersonRoleReplacementResponse,
  );
}

export async function removeIdentityAccessManagementPerson(
  input: IdentityAccessPersonRemovalRequest,
  {
    fetcher = fetch,
    signal,
  }: {
    fetcher?: typeof fetch;
    signal?: AbortSignal;
  } = {},
): Promise<IdentityAccessPersonRemovalResponse> {
  return postIdentityAccessManagementRequest(
    IDENTITY_ACCESS_PERSON_REMOVAL_API_ROUTE,
    input,
    { fetcher, signal },
    "person-mutation",
    identityAccessPersonRemovalResponse,
  );
}

export async function revokeIdentityAccessManagementInvitation(
  input: RevokeIdentityAccessManagementInvitationInput,
  {
    fetcher = fetch,
    signal,
  }: {
    fetcher?: typeof fetch;
    signal?: AbortSignal;
  } = {},
): Promise<IdentityAccessManagementInvitationRevokeResponse> {
  const response = await fetcher(IDENTITY_COLLABORATOR_INVITATION_REVOKE_API_ROUTE, {
    body: JSON.stringify(input),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });

  return readJsonResponse(
    response,
    "invitation-revocation",
    identityAccessManagementInvitationRevokeResponse,
  );
}

async function postIdentityAccessManagementRequest<T>(
  route: string,
  input: unknown,
  {
    fetcher,
    signal,
  }: {
    fetcher: typeof fetch;
    signal?: AbortSignal;
  },
  failureKind: IdentityAccessManagementFailureKind,
  parseSuccess: (value: unknown) => T | undefined,
): Promise<T> {
  const response = await fetcher(route, {
    body: JSON.stringify(input),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });

  return readJsonResponse(response, failureKind, parseSuccess);
}

type IdentityAccessManagementFailureKind =
  | "invitation-revocation"
  | "person-mutation"
  | "transport";

async function readJsonResponse<T>(
  response: Response,
  failureKind: IdentityAccessManagementFailureKind,
  parseSuccess: (value: unknown) => T | undefined,
): Promise<T> {
  invalidateProgramAuthorityForProtectedResponse(response);
  let body: unknown;

  try {
    body = (await response.json()) as unknown;
  } catch {
    throw invalidIdentityAccessManagementResponse(response.status);
  }

  if (!response.ok) {
    throw new IdentityAccessManagementApiError(identityAccessManagementFailure(body, failureKind), {
      status: response.status,
    });
  }

  const parsed = parseSuccess(body);
  if (parsed === undefined) {
    throw invalidIdentityAccessManagementResponse(response.status);
  }

  return parsed;
}

function identityAccessManagementFailure(
  value: unknown,
  failureKind: IdentityAccessManagementFailureKind,
): IdentityAccessManagementFailure {
  if (failureKind === "person-mutation") {
    try {
      return {
        kind: "person-mutation",
        ...parseIdentityAccessPersonMutationErrorResponse(value),
      };
    } catch {
      // Fall through to the generic transport contract.
    }
  }

  if (failureKind === "invitation-revocation") {
    try {
      return {
        kind: "invitation-revocation",
        ...parseIdentityCollaboratorInvitationRevokeErrorResponse(value),
      };
    } catch {
      // Fall through to the generic transport contract.
    }
  }

  try {
    return { kind: "transport", ...parseIdentityAccessErrorResponse(value) };
  } catch {
    return { code: "invalid-response", kind: "transport" };
  }
}

function invalidIdentityAccessManagementResponse(status: number) {
  return new IdentityAccessManagementApiError(
    { code: "invalid-response", kind: "transport" },
    { status },
  );
}

function identityAccessManagementSummary(
  value: unknown,
): IdentityAccessManagementSummary | undefined {
  if (
    !isRecord(value) ||
    !isRecord(value.invitationGrantOptions) ||
    !isRecord(value.invitationGrantOptions.authority) ||
    !Array.isArray(value.invitationGrantOptions.memberships) ||
    !Array.isArray(value.invitationGrantOptions.roles)
  ) {
    return undefined;
  }

  const arrayKeys = [
    "groups",
    "invitations",
    "memberships",
    "organizations",
    "people",
    "programRoles",
    "roles",
  ] as const;

  return arrayKeys.every((key) => Array.isArray(value[key]))
    ? (value as IdentityAccessManagementSummary)
    : undefined;
}

function identityAccessManagementInvitationResponse(
  value: unknown,
): IdentityAccessManagementInvitationResponse | undefined {
  return isRecord(value) ? (value as IdentityAccessManagementInvitationResponse) : undefined;
}

function identityAccessPersonRoleReplacementResponse(
  value: unknown,
): IdentityAccessPersonRoleReplacementResponse | undefined {
  return isRecord(value) &&
    typeof value.principalId === "string" &&
    Array.isArray(value.programRoles) &&
    Array.isArray(value.roles) &&
    (value.status === "committed" || value.status === "replayed")
    ? (value as IdentityAccessPersonRoleReplacementResponse)
    : undefined;
}

function identityAccessPersonRemovalResponse(
  value: unknown,
): IdentityAccessPersonRemovalResponse | undefined {
  return isRecord(value) &&
    isRecord(value.person) &&
    typeof value.removedAt === "string" &&
    value.status === "disabled"
    ? (value as IdentityAccessPersonRemovalResponse)
    : undefined;
}

function identityAccessManagementInvitationRevokeResponse(
  value: unknown,
): IdentityAccessManagementInvitationRevokeResponse | undefined {
  return isRecord(value) &&
    isRecord(value.invitation) &&
    typeof value.revokedAt === "string" &&
    value.status === "revoked"
    ? (value as IdentityAccessManagementInvitationRevokeResponse)
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
