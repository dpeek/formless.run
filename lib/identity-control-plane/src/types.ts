/**
 * Versioned public identity control-plane contract declarations.
 *
 * Version 1 covers runtime-neutral identity entity names, capability route
 * constants, and first-pass runtime role keys. Runtime execution and private
 * auth state remain outside this package contract.
 */
export const IDENTITY_CONTROL_PLANE_PUBLIC_CONTRACT_VERSION = 1;

export const IDENTITY_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY = "auth";
export const IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX = "/api/formless/identity";
export const IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_PATH = "/access-summary";
export const IDENTITY_ACCESS_PERSON_ROLE_REPLACEMENT_API_PATH = "/access-people/replace-roles";
export const IDENTITY_ACCESS_PERSON_REMOVAL_API_PATH = "/access-people/remove";
export const IDENTITY_COLLABORATOR_INVITATIONS_API_PATH = "/collaborator-invitations";
export const IDENTITY_COLLABORATOR_INVITATION_REVOKE_API_PATH = "/collaborator-invitations/revoke";

export type IdentityControlPlaneBoundarySchemaKey =
  typeof IDENTITY_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY;
export type IdentityControlPlaneApiRoutePrefix = typeof IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX;
export type IdentityAccessManagementSummaryApiPath =
  typeof IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_PATH;
export type IdentityAccessPersonRoleReplacementApiPath =
  typeof IDENTITY_ACCESS_PERSON_ROLE_REPLACEMENT_API_PATH;
export type IdentityAccessPersonRemovalApiPath = typeof IDENTITY_ACCESS_PERSON_REMOVAL_API_PATH;
export type IdentityCollaboratorInvitationsApiPath =
  typeof IDENTITY_COLLABORATOR_INVITATIONS_API_PATH;
export type IdentityCollaboratorInvitationRevokeApiPath =
  typeof IDENTITY_COLLABORATOR_INVITATION_REVOKE_API_PATH;

export const identityControlPlaneEntityNames = [
  "principal",
  "principal-email",
  "group",
  "organization",
  "membership",
  "role",
  "role-assignment",
  "program-role-assignment",
  "invitation",
  "account-policy",
  "principal-policy-acceptance",
] as const;

export type IdentityControlPlaneEntityName = (typeof identityControlPlaneEntityNames)[number];

export const identityControlPlaneRoleKeys = ["instance.owner"] as const;

export type IdentityControlPlaneRoleKey = (typeof identityControlPlaneRoleKeys)[number];

export type IdentityPrincipalKind = "human" | "service";
export type IdentityPrincipalStatus = "active" | "disabled" | "invited";
export type IdentityPrincipalEmailVerificationStatus = "unverified" | "verified";
export type IdentityContainerStatus = "active" | "disabled";
export type IdentityMembershipTargetKind = "group" | "organization";
export type IdentityMembershipStatus = "active" | "disabled" | "invited";
export type IdentityRoleStatus = "active" | "disabled";
export type IdentityRoleAssignmentTargetKind = "group" | "organization" | "principal";
export type IdentityRoleAssignmentScopeKind = "instance" | "organization";
export type IdentityRoleAssignmentStatus = "active" | "disabled";
export type IdentityProgramRoleAssignmentStatus = "active" | "disabled";
export type IdentityProgramRoleId = `role_${string}`;
export type IdentityInvitationTargetSurface = "instance" | "organization";
export type IdentityInvitationStatus = "accepted" | "expired" | "pending" | "revoked";
export type IdentityAccountPolicyScopeKind = "instance" | "organization";
export type IdentityAccountPolicyStatus = "active" | "retired";
export type IdentityPrincipalPolicyAcceptanceStatus = "accepted" | "revoked";

export type IdentityPrincipalValues = {
  displayName: string;
  kind: IdentityPrincipalKind;
  status: IdentityPrincipalStatus;
};

export type IdentityPrincipalEmailValues = {
  principal: string;
  displayEmail: string;
  normalizedEmail: string;
  verificationStatus: IdentityPrincipalEmailVerificationStatus;
  primary: boolean;
  recovery: boolean;
  verifiedAt?: string;
};

export type IdentityGroupValues = {
  displayName: string;
  status: IdentityContainerStatus;
};

export type IdentityOrganizationValues = {
  displayName: string;
  status: IdentityContainerStatus;
};

export type IdentityMembershipValues = {
  principal: string;
  targetKind: IdentityMembershipTargetKind;
  targetGroup?: string;
  targetOrganization?: string;
  status: IdentityMembershipStatus;
};

export type IdentityRoleValues = {
  key: IdentityControlPlaneRoleKey;
  displayLabel: string;
  status: IdentityRoleStatus;
};

export type IdentityRoleAssignmentValues = {
  role: string;
  targetKind: IdentityRoleAssignmentTargetKind;
  targetPrincipal?: string;
  targetGroup?: string;
  targetOrganization?: string;
  scopeKind: IdentityRoleAssignmentScopeKind;
  scopeOrganization?: string;
  status: IdentityRoleAssignmentStatus;
};

export type IdentityProgramRoleAssignmentValues = {
  principal: string;
  roleId: IdentityProgramRoleId;
  status: IdentityProgramRoleAssignmentStatus;
};

export type IdentityInvitationValues = {
  targetEmail: string;
  targetSurface: IdentityInvitationTargetSurface;
  targetOrganization?: string;
  invitedPrincipal?: string;
  inviterPrincipal?: string;
  status: IdentityInvitationStatus;
  expiresAt: string;
  acceptedAt?: string;
};

export type IdentityAccountPolicyValues = {
  displayName: string;
  policyKey: string;
  version: string;
  scopeKind: IdentityAccountPolicyScopeKind;
  scopeOrganization?: string;
  status: IdentityAccountPolicyStatus;
  publishedAt?: string;
  policyDocumentUrl?: string;
  policyContentRef?: string;
};

export type IdentityPrincipalPolicyAcceptanceValues = {
  principal: string;
  accountPolicy: string;
  status: IdentityPrincipalPolicyAcceptanceStatus;
  acceptedAt: string;
};

export type IdentityControlPlaneRecordValuesByEntity = {
  "account-policy": IdentityAccountPolicyValues;
  group: IdentityGroupValues;
  invitation: IdentityInvitationValues;
  membership: IdentityMembershipValues;
  organization: IdentityOrganizationValues;
  principal: IdentityPrincipalValues;
  "principal-email": IdentityPrincipalEmailValues;
  "principal-policy-acceptance": IdentityPrincipalPolicyAcceptanceValues;
  "program-role-assignment": IdentityProgramRoleAssignmentValues;
  role: IdentityRoleValues;
  "role-assignment": IdentityRoleAssignmentValues;
};

export const identityControlPlaneImmutableFields = {
  principal: ["kind"],
  "principal-email": ["principal", "normalizedEmail"],
  group: ["displayName"],
  organization: ["displayName"],
  membership: ["principal", "targetKind", "targetGroup", "targetOrganization"],
  role: ["key"],
  "role-assignment": [
    "role",
    "targetKind",
    "targetPrincipal",
    "targetGroup",
    "targetOrganization",
    "scopeKind",
    "scopeOrganization",
  ],
  "program-role-assignment": ["principal", "roleId"],
  invitation: ["targetEmail", "targetSurface", "targetOrganization"],
  "account-policy": [
    "policyKey",
    "version",
    "scopeKind",
    "scopeOrganization",
    "policyDocumentUrl",
    "policyContentRef",
  ],
  "principal-policy-acceptance": ["principal", "accountPolicy", "acceptedAt"],
} as const satisfies Record<IdentityControlPlaneEntityName, readonly string[]>;

export type IdentityAccessPrimaryEmailSummary = {
  displayEmail: string;
  normalizedEmail: string;
  principalEmailId: string;
  verificationStatus: IdentityPrincipalEmailVerificationStatus;
  verifiedAt?: string;
};

export type IdentityAccessPersonSummary = {
  createdAt: string;
  displayName: string;
  kind: IdentityPrincipalKind;
  primaryEmail?: IdentityAccessPrimaryEmailSummary;
  principalId: string;
  status: IdentityPrincipalStatus;
  updatedAt: string;
};

export type IdentityAccessRoleSummary = {
  createdAt: string;
  displayLabel: string;
  roleAssignmentId: string;
  roleId: string;
  roleKey: IdentityControlPlaneRoleKey;
  scopeKind: IdentityRoleAssignmentScopeKind;
  scopeOrganizationId?: string;
  status: IdentityRoleAssignmentStatus;
  targetGroupId?: string;
  targetKind: IdentityRoleAssignmentTargetKind;
  targetOrganizationId?: string;
  targetPrincipalId?: string;
  updatedAt: string;
};

export type IdentityAccessProgramRoleSummary = {
  createdAt: string;
  displayLabel: string;
  roleAssignmentId: string;
  roleId: IdentityProgramRoleId;
  roleKey: string;
  scopeKind: "program";
  status: IdentityProgramRoleAssignmentStatus;
  targetPrincipalId: string;
  updatedAt: string;
};

export type IdentityAccessMembershipSummary = {
  createdAt: string;
  membershipId: string;
  principalId: string;
  status: IdentityMembershipStatus;
  targetGroupId?: string;
  targetKind: IdentityMembershipTargetKind;
  targetOrganizationId?: string;
  updatedAt: string;
};

export type IdentityAccessOrganizationSummary = {
  createdAt: string;
  displayName: string;
  organizationId: string;
  status: IdentityContainerStatus;
  updatedAt: string;
};

export type IdentityAccessGroupSummary = {
  createdAt: string;
  displayName: string;
  groupId: string;
  status: IdentityContainerStatus;
  updatedAt: string;
};

export type IdentityAccessInvitationSummary = {
  acceptedAt?: string;
  createdAt: string;
  expiresAt: string;
  invitedPrincipalId?: string;
  invitationId: string;
  inviterPrincipalId?: string;
  status: IdentityInvitationStatus;
  targetEmail: string;
  targetOrganizationId?: string;
  targetSurface: IdentityInvitationTargetSurface;
  updatedAt: string;
};

export type IdentityAccessInvitationGrantAuthoritySummary = {
  instanceOwner: boolean;
  programAdministrator: boolean;
};

export type IdentityAccessInvitationRoleGrantOption =
  | {
      displayLabel: string;
      roleKey: Extract<IdentityControlPlaneRoleKey, "instance.owner">;
      scopeKind: Extract<IdentityRoleAssignmentScopeKind, "instance">;
    }
  | {
      displayLabel: string;
      roleId: IdentityProgramRoleId;
      roleKey: string;
      scopeKind: "program";
    };

export type IdentityAccessInvitationMembershipGrantOption = {
  displayLabel: string;
  targetGroupId?: string;
  targetKind: IdentityMembershipTargetKind;
  targetOrganizationId?: string;
};

export type IdentityAccessInvitationGrantOptions = {
  authority: IdentityAccessInvitationGrantAuthoritySummary;
  memberships: IdentityAccessInvitationMembershipGrantOption[];
  roles: IdentityAccessInvitationRoleGrantOption[];
};

export type IdentityAccessManagementSummary = {
  groups: IdentityAccessGroupSummary[];
  invitationGrantOptions: IdentityAccessInvitationGrantOptions;
  invitations: IdentityAccessInvitationSummary[];
  memberships: IdentityAccessMembershipSummary[];
  organizations: IdentityAccessOrganizationSummary[];
  people: IdentityAccessPersonSummary[];
  programRoles: IdentityAccessProgramRoleSummary[];
  roles: IdentityAccessRoleSummary[];
};

export type IdentityAccessPersonRoleSelection =
  | {
      roleKey: Extract<IdentityControlPlaneRoleKey, "instance.owner">;
      scopeKind: Extract<IdentityRoleAssignmentScopeKind, "instance">;
    }
  | {
      roleId: IdentityProgramRoleId;
      scopeKind: "program";
    };

export type IdentityAccessPersonRoleReplacementRequest = {
  idempotencyKey: string;
  now?: string;
  principalId: string;
  roles: IdentityAccessPersonRoleSelection[];
};

export type IdentityAccessPersonRoleReplacementResponse = {
  principalId: string;
  programRoles: IdentityAccessProgramRoleSummary[];
  roles: IdentityAccessRoleSummary[];
  status: "committed" | "replayed";
};

export type IdentityAccessPersonRemovalRequest = {
  idempotencyKey: string;
  now?: string;
  principalId: string;
};

export type IdentityAccessPersonRemovalResponse = {
  person: IdentityAccessPersonSummary;
  removedAt: string;
  status: "disabled";
};

export type IdentityAccessPersonMutationFailureReason =
  | "inactive-principal"
  | "invalid-role-selection"
  | "last-active-owner"
  | "missing-principal"
  | "protected-assignment";

export type IdentityAccessPersonMutationErrorResponse = {
  error: string;
  reason: IdentityAccessPersonMutationFailureReason;
};

export type IdentityCollaboratorInvitationRevokeRequest = {
  invitationId: string;
  now?: string;
};

export type IdentityCollaboratorInvitationRevokeFailureReason =
  | "accepted-invitation"
  | "expired-invitation"
  | "missing-invitation"
  | "revoked-invitation"
  | "tombstoned-invitation";

export type IdentityCollaboratorInvitationRevokeErrorResponse = {
  error: string;
  reason: IdentityCollaboratorInvitationRevokeFailureReason;
};

export type IdentityCollaboratorInvitationRevokeResponse = {
  invitation: IdentityAccessInvitationSummary;
  revokedAt: string;
  status: "revoked";
};
