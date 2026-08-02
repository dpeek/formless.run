import {
  IDENTITY_COLLABORATOR_INVITATIONS_API_PATH,
  IDENTITY_COLLABORATOR_INVITATION_REVOKE_API_PATH,
  IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_PATH,
  IDENTITY_ACCESS_PERSON_REMOVAL_API_PATH,
  IDENTITY_ACCESS_PERSON_ROLE_REPLACEMENT_API_PATH,
  IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX,
  type IdentityControlPlaneRoleKey,
  type IdentityAccessManagementSummary,
  type IdentityAccessPersonRemovalRequest,
  type IdentityAccessPersonRemovalResponse,
  type IdentityAccessPersonRoleReplacementRequest,
  type IdentityAccessPersonRoleReplacementResponse,
  type IdentityCollaboratorInvitationRevokeRequest,
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

export type IdentityAccessManagementApiErrorBody = {
  error: string;
  reason?: string;
};

export class IdentityAccessManagementApiError extends Error {
  readonly body: IdentityAccessManagementApiErrorBody;
  readonly status: number;

  constructor(
    message: string,
    options: { body: IdentityAccessManagementApiErrorBody; status: number },
  ) {
    super(message);
    this.name = "IdentityAccessManagementApiError";
    this.body = options.body;
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

  return readJsonResponse<IdentityAccessManagementSummary>(response);
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

  return readJsonResponse<IdentityAccessManagementInvitationResponse>(response);
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
  return postIdentityAccessManagementRequest(IDENTITY_ACCESS_PERSON_REMOVAL_API_ROUTE, input, {
    fetcher,
    signal,
  });
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

  return readJsonResponse<IdentityAccessManagementInvitationRevokeResponse>(response);
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

  return readJsonResponse<T>(response);
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  invalidateProgramAuthorityForProtectedResponse(response);
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    const errorBody = identityAccessManagementErrorBody(body);

    throw new IdentityAccessManagementApiError(errorBody.error, {
      body: errorBody,
      status: response.status,
    });
  }

  return body as T;
}

function identityAccessManagementErrorBody(value: unknown): IdentityAccessManagementApiErrorBody {
  if (!isRecord(value)) {
    return { error: "Access management request failed." };
  }

  const error = typeof value.error === "string" ? value.error : "Access management request failed.";

  return {
    error,
    ...(typeof value.reason === "string" ? { reason: value.reason } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
