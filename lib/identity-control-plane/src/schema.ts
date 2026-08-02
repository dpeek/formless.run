import type {
  AppSchema,
  FieldEditor,
  FieldSchema,
  ToManyRelationshipSchema,
  ToOneRelationshipSchema,
} from "@dpeek/formless-schema";
import { composeAppSchema, defineAppSchemaModule } from "@dpeek/formless-schema";
import {
  identityControlPlaneEntityNames,
  identityControlPlaneImmutableFields,
  identityControlPlaneRoleKeys,
  type IdentityAccountPolicyScopeKind,
  type IdentityAccountPolicyStatus,
  type IdentityContainerStatus,
  type IdentityControlPlaneEntityName,
  type IdentityInvitationStatus,
  type IdentityInvitationTargetSurface,
  type IdentityMembershipStatus,
  type IdentityMembershipTargetKind,
  type IdentityPrincipalPolicyAcceptanceStatus,
  type IdentityPrincipalEmailVerificationStatus,
  type IdentityPrincipalKind,
  type IdentityPrincipalStatus,
  type IdentityProgramRoleAssignmentStatus,
  type IdentityRoleAssignmentScopeKind,
  type IdentityRoleAssignmentStatus,
  type IdentityRoleAssignmentTargetKind,
  type IdentityRoleStatus,
} from "./types.ts";

type IdentityControlPlaneTableField =
  | string
  | {
      display?: "editor" | "hidden" | "readOnly";
      field: string;
    };

type IdentityControlPlaneViewField =
  | string
  | {
      field: string;
      visibleWhen?: {
        field: string;
        values: Array<string | boolean | number>;
      };
    };
const principalKindLabels = {
  human: "Human",
  service: "Service",
} satisfies Record<IdentityPrincipalKind, string>;

const principalStatusLabels = {
  active: "Active",
  disabled: "Disabled",
  invited: "Invited",
} satisfies Record<IdentityPrincipalStatus, string>;

const emailVerificationStatusLabels = {
  unverified: "Unverified",
  verified: "Verified",
} satisfies Record<IdentityPrincipalEmailVerificationStatus, string>;

const containerStatusLabels = {
  active: "Active",
  disabled: "Disabled",
} satisfies Record<IdentityContainerStatus, string>;

const membershipTargetKindLabels = {
  group: "Group",
  organization: "Organization",
} satisfies Record<IdentityMembershipTargetKind, string>;

const membershipStatusLabels = {
  active: "Active",
  disabled: "Disabled",
  invited: "Invited",
} satisfies Record<IdentityMembershipStatus, string>;

const roleStatusLabels = {
  active: "Active",
  disabled: "Disabled",
} satisfies Record<IdentityRoleStatus, string>;

const roleAssignmentTargetKindLabels = {
  group: "Group",
  organization: "Organization",
  principal: "Principal",
} satisfies Record<IdentityRoleAssignmentTargetKind, string>;

const roleAssignmentScopeKindLabels = {
  instance: "Instance",
  organization: "Organization",
} satisfies Record<IdentityRoleAssignmentScopeKind, string>;

const roleAssignmentStatusLabels = {
  active: "Active",
  disabled: "Disabled",
} satisfies Record<IdentityRoleAssignmentStatus, string>;

const programRoleAssignmentStatusLabels = {
  active: "Active",
  disabled: "Disabled",
} satisfies Record<IdentityProgramRoleAssignmentStatus, string>;

const invitationTargetSurfaceLabels = {
  instance: "Instance",
  organization: "Organization",
} satisfies Record<IdentityInvitationTargetSurface, string>;

const invitationStatusLabels = {
  accepted: "Accepted",
  expired: "Expired",
  pending: "Pending",
  revoked: "Revoked",
} satisfies Record<IdentityInvitationStatus, string>;

const accountPolicyScopeKindLabels = {
  instance: "Instance",
  organization: "Organization",
} satisfies Record<IdentityAccountPolicyScopeKind, string>;

const accountPolicyStatusLabels = {
  active: "Active",
  retired: "Retired",
} satisfies Record<IdentityAccountPolicyStatus, string>;

const principalPolicyAcceptanceStatusLabels = {
  accepted: "Accepted",
  revoked: "Revoked",
} satisfies Record<IdentityPrincipalPolicyAcceptanceStatus, string>;

const roleKeyLabels = Object.fromEntries(
  identityControlPlaneRoleKeys.map((roleKey) => [roleKey, roleKey]),
) as Record<(typeof identityControlPlaneRoleKeys)[number], string>;

const entityViewConfig = {
  principal: {
    createFields: ["displayName", "kind", "status"],
    editFields: ["displayName", "status"],
    itemFields: ["displayName", "kind", "status"],
    label: "Principals",
    tableFields: ["displayName", "kind", "status"],
  },
  "principal-email": {
    createFields: [
      "principal",
      "displayEmail",
      "normalizedEmail",
      "verificationStatus",
      "primary",
      "recovery",
      "verifiedAt",
    ],
    editFields: ["displayEmail", "verificationStatus", "primary", "recovery", "verifiedAt"],
    itemFields: ["displayEmail", "normalizedEmail", "verificationStatus", "principal"],
    label: "Principal emails",
    tableFields: [
      "displayEmail",
      "normalizedEmail",
      "principal",
      "verificationStatus",
      "primary",
      "recovery",
      "verifiedAt",
    ],
  },
  group: {
    createFields: ["displayName", "status"],
    editFields: ["status"],
    itemFields: ["displayName", "status"],
    label: "Groups",
    tableFields: ["displayName", "status"],
  },
  organization: {
    createFields: ["displayName", "status"],
    editFields: ["status"],
    itemFields: ["displayName", "status"],
    label: "Organizations",
    tableFields: ["displayName", "status"],
  },
  membership: {
    createFields: [
      "principal",
      "targetKind",
      {
        field: "targetGroup",
        visibleWhen: { field: "targetKind", values: ["group"] },
      },
      {
        field: "targetOrganization",
        visibleWhen: { field: "targetKind", values: ["organization"] },
      },
      "status",
    ],
    editFields: ["status"],
    itemFields: ["principal", "targetKind", "targetGroup", "targetOrganization", "status"],
    label: "Memberships",
    tableFields: ["principal", "targetKind", "targetGroup", "targetOrganization", "status"],
  },
  role: {
    createFields: ["key", "displayLabel", "status"],
    editFields: ["displayLabel", "status"],
    itemFields: ["key", "displayLabel", "status"],
    label: "Roles",
    tableFields: ["key", "displayLabel", "status"],
  },
  "role-assignment": {
    createFields: [
      "role",
      "targetKind",
      {
        field: "targetPrincipal",
        visibleWhen: { field: "targetKind", values: ["principal"] },
      },
      {
        field: "targetGroup",
        visibleWhen: { field: "targetKind", values: ["group"] },
      },
      {
        field: "targetOrganization",
        visibleWhen: { field: "targetKind", values: ["organization"] },
      },
      "scopeKind",
      {
        field: "scopeOrganization",
        visibleWhen: { field: "scopeKind", values: ["organization"] },
      },
      "status",
    ],
    editFields: ["status"],
    itemFields: ["role", "targetKind", "scopeKind", "status"],
    label: "Role assignments",
    tableFields: [
      "role",
      "targetKind",
      "targetPrincipal",
      "targetGroup",
      "targetOrganization",
      "scopeKind",
      "scopeOrganization",
      "status",
    ],
  },
  "program-role-assignment": {
    createFields: ["principal", "roleId", "status"],
    editFields: ["status"],
    itemFields: ["principal", "roleId", "status"],
    label: "Program role assignments",
    tableFields: ["principal", "roleId", "status"],
  },
  invitation: {
    createFields: [
      "targetEmail",
      "targetSurface",
      {
        field: "targetOrganization",
        visibleWhen: { field: "targetSurface", values: ["organization"] },
      },
      "invitedPrincipal",
      "inviterPrincipal",
      "status",
      "expiresAt",
      "acceptedAt",
    ],
    editFields: ["status", "acceptedAt"],
    itemFields: ["targetEmail", "targetSurface", "status", "expiresAt"],
    label: "Invitations",
    tableFields: [
      "targetEmail",
      "targetSurface",
      "targetOrganization",
      "invitedPrincipal",
      "inviterPrincipal",
      "status",
      "expiresAt",
      "acceptedAt",
    ],
  },
  "account-policy": {
    createFields: [
      "displayName",
      "policyKey",
      "version",
      "scopeKind",
      {
        field: "scopeOrganization",
        visibleWhen: { field: "scopeKind", values: ["organization"] },
      },
      "status",
      "publishedAt",
      "policyDocumentUrl",
      "policyContentRef",
    ],
    editFields: ["displayName", "status", "publishedAt"],
    itemFields: ["displayName", "policyKey", "version", "scopeKind", "status"],
    label: "Account policies",
    tableFields: [
      "displayName",
      "policyKey",
      "version",
      "scopeKind",
      "scopeOrganization",
      "status",
      "publishedAt",
      "policyDocumentUrl",
      "policyContentRef",
    ],
  },
  "principal-policy-acceptance": {
    createFields: ["principal", "accountPolicy", "status", "acceptedAt"],
    editFields: ["status"],
    itemFields: ["principal", "accountPolicy", "status", "acceptedAt"],
    label: "Policy acceptances",
    tableFields: ["principal", "accountPolicy", "status", "acceptedAt"],
  },
} as const satisfies Record<
  IdentityControlPlaneEntityName,
  {
    createFields: readonly IdentityControlPlaneViewField[];
    editFields: readonly IdentityControlPlaneViewField[];
    itemFields: readonly string[];
    label: string;
    tableFields: readonly IdentityControlPlaneTableField[];
  }
>;
export const identityControlPlaneRecordSchemaModule = defineAppSchemaModule({
  key: "identity-control-plane-records",
  runtimeRequirements: {
    shared: {
      recordAdapters: ["identity-control-plane.records"],
      bootstrapContributions: ["identity-control-plane.bootstrap"],
    },
  },
  entities: [
    {
      id: "entity_9a973724-79ed-4e91-b5a3-6364bb03aa18",
      key: "principal",
      label: "Principal",
      fields: [
        {
          key: "displayName",
          ...textField("Display name"),
        },
        {
          key: "kind",
          ...enumField("Kind", principalKindLabels),
        },
        {
          key: "status",
          ...enumField("Status", principalStatusLabels, "active"),
        },
      ],
      operations: writeOperations("principal", ["displayName", "kind", "status"], {
        updateFields: ["displayName", "status"],
      }),
    },
    {
      id: "entity_44ca1842-9aa9-44de-8f84-3b6348ba781f",
      key: "principal-email",
      label: "Principal email",
      fields: [
        {
          key: "principal",
          ...referenceField("Principal", "principal", "displayName"),
        },
        {
          key: "displayEmail",
          ...textField("Display email"),
        },
        {
          key: "normalizedEmail",
          ...textField("Normalized email"),
        },
        {
          key: "verificationStatus",
          ...enumField("Verification status", emailVerificationStatusLabels, "unverified"),
        },
        {
          key: "primary",
          ...booleanField("Primary", false),
        },
        {
          key: "recovery",
          ...booleanField("Recovery", false),
        },
        {
          key: "verifiedAt",
          ...optionalTextField("Verified at"),
        },
      ],
      operations: writeOperations(
        "principal email",
        [
          "principal",
          "displayEmail",
          "normalizedEmail",
          "verificationStatus",
          "primary",
          "recovery",
          "verifiedAt",
        ],
        {
          updateFields: ["displayEmail", "verificationStatus", "primary", "recovery", "verifiedAt"],
        },
      ),
      constraints: [{ key: "uniqueNormalizedEmail", kind: "unique", fields: ["normalizedEmail"] }],
    },
    {
      id: "entity_7fdc2084-9c69-46e7-8ae6-3abdef0844e6",
      key: "group",
      label: "Group",
      fields: [
        {
          key: "displayName",
          ...textField("Display name"),
        },
        {
          key: "status",
          ...enumField("Status", containerStatusLabels, "active"),
        },
      ],
      operations: writeOperations("group", ["displayName", "status"], {
        updateFields: ["status"],
      }),
    },
    {
      id: "entity_a1f3cd81-3ff7-49af-8613-c9551a0ef673",
      key: "organization",
      label: "Organization",
      fields: [
        {
          key: "displayName",
          ...textField("Display name"),
        },
        {
          key: "status",
          ...enumField("Status", containerStatusLabels, "active"),
        },
      ],
      operations: writeOperations("organization", ["displayName", "status"], {
        updateFields: ["status"],
      }),
    },
    {
      id: "entity_dba733fd-fcce-4183-98ea-092f2e54d676",
      key: "membership",
      label: "Membership",
      fields: [
        {
          key: "principal",
          ...referenceField("Principal", "principal", "displayName"),
        },
        {
          key: "targetKind",
          ...enumField("Target kind", membershipTargetKindLabels),
        },
        {
          key: "targetGroup",
          ...optionalReferenceField("Target group", "group", "displayName"),
        },
        {
          key: "targetOrganization",
          ...optionalReferenceField("Target organization", "organization", "displayName"),
        },
        {
          key: "status",
          ...enumField("Status", membershipStatusLabels, "active"),
        },
      ],
      operations: writeOperations(
        "membership",
        ["principal", "targetKind", "targetGroup", "targetOrganization", "status"],
        {
          updateFields: ["status"],
        },
      ),
    },
    {
      id: "entity_3d39cc7b-afd7-49c2-92a2-95c17eb382d6",
      key: "role",
      label: "Role",
      fields: [
        {
          key: "key",
          ...enumField("Key", roleKeyLabels),
        },
        {
          key: "displayLabel",
          ...textField("Display label"),
        },
        {
          key: "status",
          ...enumField("Status", roleStatusLabels, "active"),
        },
      ],
      operations: writeOperations("role", ["key", "displayLabel", "status"], {
        updateFields: ["displayLabel", "status"],
      }),
      constraints: [{ key: "uniqueKey", kind: "unique", fields: ["key"] }],
    },
    {
      id: "entity_59caf16c-c00f-424c-8f40-337ee7043326",
      key: "role-assignment",
      label: "Role assignment",
      fields: [
        {
          key: "role",
          ...referenceField("Role", "role", "displayLabel"),
        },
        {
          key: "targetKind",
          ...enumField("Target kind", roleAssignmentTargetKindLabels),
        },
        {
          key: "targetPrincipal",
          ...optionalReferenceField("Target principal", "principal", "displayName"),
        },
        {
          key: "targetGroup",
          ...optionalReferenceField("Target group", "group", "displayName"),
        },
        {
          key: "targetOrganization",
          ...optionalReferenceField("Target organization", "organization", "displayName"),
        },
        {
          key: "scopeKind",
          ...enumField("Scope kind", roleAssignmentScopeKindLabels),
        },
        {
          key: "scopeOrganization",
          ...optionalReferenceField("Scope organization", "organization", "displayName"),
        },
        {
          key: "status",
          ...enumField("Status", roleAssignmentStatusLabels, "active"),
        },
      ],
      operations: writeOperations(
        "role assignment",
        [
          "role",
          "targetKind",
          "targetPrincipal",
          "targetGroup",
          "targetOrganization",
          "scopeKind",
          "scopeOrganization",
          "status",
        ],
        {
          delete: true,
          updateFields: ["status"],
        },
      ),
    },
    {
      id: "entity_2f180371-22d4-461e-8a97-1964cc175d43",
      key: "program-role-assignment",
      label: "Program role assignment",
      fields: [
        {
          key: "principal",
          ...referenceField("Principal", "principal", "displayName"),
        },
        {
          key: "roleId",
          ...textField("Program role id"),
        },
        {
          key: "status",
          ...enumField("Status", programRoleAssignmentStatusLabels, "active"),
        },
      ],
      operations: writeOperations("Program role assignment", ["principal", "roleId", "status"], {
        delete: true,
        updateFields: ["status"],
      }),
    },
    {
      id: "entity_f176ed5c-3e07-4107-8e4d-50e89539c9e1",
      key: "invitation",
      label: "Invitation",
      fields: [
        {
          key: "targetEmail",
          ...textField("Target email"),
        },
        {
          key: "targetSurface",
          ...enumField("Target surface", invitationTargetSurfaceLabels),
        },
        {
          key: "targetOrganization",
          ...optionalReferenceField("Target organization", "organization", "displayName"),
        },
        {
          key: "invitedPrincipal",
          ...optionalReferenceField("Invited principal", "principal", "displayName"),
        },
        {
          key: "inviterPrincipal",
          ...optionalReferenceField("Inviter principal", "principal", "displayName"),
        },
        {
          key: "status",
          ...enumField("Status", invitationStatusLabels, "pending"),
        },
        {
          key: "expiresAt",
          ...textField("Expires at"),
        },
        {
          key: "acceptedAt",
          ...optionalTextField("Accepted at"),
        },
      ],
      operations: writeOperations(
        "invitation",
        [
          "targetEmail",
          "targetSurface",
          "targetOrganization",
          "invitedPrincipal",
          "inviterPrincipal",
          "status",
          "expiresAt",
          "acceptedAt",
        ],
        {
          updateFields: ["status", "acceptedAt"],
        },
      ),
    },
    {
      id: "entity_954732d5-5b4b-4cc5-a7c5-644e6f964a62",
      key: "account-policy",
      label: "Account policy",
      fields: [
        {
          key: "displayName",
          ...textField("Display name"),
        },
        {
          key: "policyKey",
          ...textField("Policy key"),
        },
        {
          key: "version",
          ...textField("Version"),
        },
        {
          key: "scopeKind",
          ...enumField("Scope kind", accountPolicyScopeKindLabels),
        },
        {
          key: "scopeOrganization",
          ...optionalReferenceField("Scope organization", "organization", "displayName"),
        },
        {
          key: "status",
          ...enumField("Status", accountPolicyStatusLabels, "active"),
        },
        {
          key: "publishedAt",
          ...optionalTextField("Published at"),
        },
        {
          key: "policyDocumentUrl",
          ...optionalTextField("Policy document URL", "href"),
        },
        {
          key: "policyContentRef",
          ...optionalTextField("Policy content ref"),
        },
      ],
      operations: writeOperations(
        "account policy",
        [
          "displayName",
          "policyKey",
          "version",
          "scopeKind",
          "scopeOrganization",
          "status",
          "publishedAt",
          "policyDocumentUrl",
          "policyContentRef",
        ],
        {
          updateFields: ["displayName", "status", "publishedAt"],
        },
      ),
    },
    {
      id: "entity_edc192f5-9b11-4f79-ac18-b256a842a6e8",
      key: "principal-policy-acceptance",
      label: "Principal policy acceptance",
      fields: [
        {
          key: "principal",
          ...referenceField("Principal", "principal", "displayName"),
        },
        {
          key: "accountPolicy",
          ...referenceField("Account policy", "account-policy", "displayName"),
        },
        {
          key: "status",
          ...enumField("Status", principalPolicyAcceptanceStatusLabels, "accepted"),
        },
        {
          key: "acceptedAt",
          ...textField("Accepted at"),
        },
      ],
      operations: writeOperations(
        "principal policy acceptance",
        ["principal", "accountPolicy", "status", "acceptedAt"],
        {
          updateFields: ["status"],
        },
      ),
    },
  ],
  relationships: [
    {
      key: "principalEmailPrincipal",
      ...toOne(
        "Principal email principal",
        "principal-email",
        "principal",
        "principal",
        "principalEmails",
      ),
    },
    {
      key: "principalEmails",
      ...toMany(
        "Principal emails",
        "principal",
        "principal-email",
        "principal",
        "principalEmailPrincipal",
      ),
    },
    {
      key: "membershipPrincipal",
      ...toOne(
        "Membership principal",
        "membership",
        "principal",
        "principal",
        "principalMemberships",
      ),
    },
    {
      key: "principalMemberships",
      ...toMany(
        "Principal memberships",
        "principal",
        "membership",
        "principal",
        "membershipPrincipal",
      ),
    },
    {
      key: "membershipGroup",
      ...toOne("Membership group", "membership", "targetGroup", "group", "groupMemberships"),
    },
    {
      key: "groupMemberships",
      ...toMany("Group memberships", "group", "membership", "targetGroup", "membershipGroup"),
    },
    {
      key: "membershipOrganization",
      ...toOne(
        "Membership organization",
        "membership",
        "targetOrganization",
        "organization",
        "organizationMemberships",
      ),
    },
    {
      key: "organizationMemberships",
      ...toMany(
        "Organization memberships",
        "organization",
        "membership",
        "targetOrganization",
        "membershipOrganization",
      ),
    },
    {
      key: "roleAssignmentRole",
      ...toOne("Role assignment role", "role-assignment", "role", "role", "roleAssignments"),
    },
    {
      key: "programRoleAssignmentPrincipal",
      ...toOne(
        "Program role assignment principal",
        "program-role-assignment",
        "principal",
        "principal",
        "principalProgramRoleAssignments",
      ),
    },
    {
      key: "principalProgramRoleAssignments",
      ...toMany(
        "Principal Program role assignments",
        "principal",
        "program-role-assignment",
        "principal",
        "programRoleAssignmentPrincipal",
      ),
    },
    {
      key: "roleAssignments",
      ...toMany("Role assignments", "role", "role-assignment", "role", "roleAssignmentRole"),
    },
    {
      key: "roleAssignmentTargetPrincipal",
      ...toOne(
        "Role assignment principal target",
        "role-assignment",
        "targetPrincipal",
        "principal",
      ),
    },
    {
      key: "roleAssignmentTargetGroup",
      ...toOne("Role assignment group target", "role-assignment", "targetGroup", "group"),
    },
    {
      key: "roleAssignmentTargetOrganization",
      ...toOne(
        "Role assignment organization target",
        "role-assignment",
        "targetOrganization",
        "organization",
      ),
    },
    {
      key: "roleAssignmentScopeOrganization",
      ...toOne(
        "Role assignment scope organization",
        "role-assignment",
        "scopeOrganization",
        "organization",
      ),
    },
    {
      key: "invitationTargetOrganization",
      ...toOne(
        "Invitation target organization",
        "invitation",
        "targetOrganization",
        "organization",
      ),
    },
    {
      key: "invitationInvitedPrincipal",
      ...toOne("Invitation invited principal", "invitation", "invitedPrincipal", "principal"),
    },
    {
      key: "invitationInviterPrincipal",
      ...toOne("Invitation inviter principal", "invitation", "inviterPrincipal", "principal"),
    },
    {
      key: "accountPolicyScopeOrganization",
      ...toOne(
        "Account policy scope organization",
        "account-policy",
        "scopeOrganization",
        "organization",
      ),
    },
    {
      key: "principalPolicyAcceptancePrincipal",
      ...toOne(
        "Principal policy acceptance principal",
        "principal-policy-acceptance",
        "principal",
        "principal",
        "principalPolicyAcceptances",
      ),
    },
    {
      key: "principalPolicyAcceptances",
      ...toMany(
        "Principal policy acceptances",
        "principal",
        "principal-policy-acceptance",
        "principal",
        "principalPolicyAcceptancePrincipal",
      ),
    },
    {
      key: "principalPolicyAcceptancePolicy",
      ...toOne(
        "Principal policy acceptance policy",
        "principal-policy-acceptance",
        "accountPolicy",
        "account-policy",
        "policyAcceptances",
      ),
    },
    {
      key: "policyAcceptances",
      ...toMany(
        "Policy acceptances",
        "account-policy",
        "principal-policy-acceptance",
        "accountPolicy",
        "principalPolicyAcceptancePolicy",
      ),
    },
  ],
  queries: identityControlPlaneEntityNames.map((entityName) => ({
    key: `${camelEntityName(entityName)}All`,
    ...allQuery(entityViewConfig[entityName].label, entityName),
  })),
  runtime: {
    controlPlane: {
      entities: Object.fromEntries(
        identityControlPlaneEntityNames.map((entityName) => [
          entityName,
          { immutableFields: [...identityControlPlaneImmutableFields[entityName]] },
        ]),
      ),
    },
  },
});

export const identityControlPlanePresentationSchemaModule = defineAppSchemaModule({
  key: "identity-control-plane-presentation",
  requires: ["identity-control-plane-records"],
  itemViews: identityControlPlaneEntityNames.map((entityName) => ({
    key: `${camelEntityName(entityName)}Item`,
    ...itemView(entityName, entityViewConfig[entityName].itemFields),
  })),
  tableViews: identityControlPlaneEntityNames.map((entityName) => ({
    key: `${camelEntityName(entityName)}Table`,
    ...tableView(entityName, entityViewConfig[entityName].tableFields, {
      editView: `${camelEntityName(entityName)}Edit`,
      operationLabel: `${entityLabel(entityName)} operations`,
    }),
  })),
  views: identityControlPlaneEntityNames.flatMap((entityName) => {
    const viewName = camelEntityName(entityName);
    return [
      {
        key: `${viewName}Create`,
        ...createView(entityName, entityViewConfig[entityName].createFields),
      },
      { key: `${viewName}Edit`, ...editView(entityName, entityViewConfig[entityName].editFields) },
      {
        key: `${viewName}List`,
        ...collectionView(
          entityViewConfig[entityName].label,
          entityName,
          `${viewName}All`,
          `${viewName}Table`,
          `${viewName}Create`,
        ),
      },
    ];
  }),
  screens: [
    {
      key: "principals",
      ...screen("Principals", "/", [
        ["principals", "principalList"],
        ["principal-emails", "principalEmailList"],
      ]),
    },
    {
      key: "organizations",
      ...screen("Organizations", "/organizations", [
        ["organizations", "organizationList"],
        ["groups", "groupList"],
        ["memberships", "membershipList"],
      ]),
    },
    {
      key: "invitations",
      ...screen("Invitations", "/invitations", [["invitations", "invitationList"]]),
    },
    {
      key: "policies",
      ...screen("Policies", "/policies", [
        ["account-policies", "accountPolicyList"],
        ["policy-acceptances", "principalPolicyAcceptanceList"],
      ]),
    },
  ],
});

export const identityControlPlaneAccessScreenSchemaModule = defineAppSchemaModule({
  key: "identity-control-plane-access-screen",
  requires: [identityControlPlanePresentationSchemaModule.key],
  screens: [
    {
      key: "access",
      ...screen("Access", "/access", [
        ["program-role-assignments", "programRoleAssignmentList"],
        ["roles", "roleList"],
        ["role-assignments", "roleAssignmentList"],
      ]),
    },
  ],
});

export const identityControlPlaneSourceSchema = composeAppSchema({
  version: 1,
  modules: [
    identityControlPlaneRecordSchemaModule,
    identityControlPlanePresentationSchemaModule,
    identityControlPlaneAccessScreenSchemaModule,
  ],
  runtime: {
    owner: "runtime",
  },
});

function textField(label: string, format?: "href" | "longText"): FieldSchema {
  return { type: "text", required: true, label, ...(format === undefined ? {} : { format }) };
}

function optionalTextField(label: string, format?: "href" | "longText"): FieldSchema {
  return { type: "text", required: false, label, ...(format === undefined ? {} : { format }) };
}

function booleanField(label: string, defaultValue: boolean): FieldSchema {
  return { type: "boolean", required: true, label, default: defaultValue };
}

function enumField(
  label: string,
  values: Record<string, string>,
  defaultValue?: string,
): FieldSchema {
  return {
    type: "enum",
    required: true,
    label,
    values: Object.entries(values).map(([key, valueLabel]) => ({ key, label: valueLabel })),
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
  };
}

function optionalReferenceField(label: string, to: string, displayField: string): FieldSchema {
  return { type: "reference", required: false, label, to, displayField };
}

function referenceField(label: string, to: string, displayField: string): FieldSchema {
  return { type: "reference", required: true, label, to, displayField };
}

function toOne(
  label: string,
  fromEntity: string,
  fromField: string,
  toEntity: string,
  inverse?: string,
): ToOneRelationshipSchema {
  return {
    kind: "toOne",
    label,
    from: { entity: fromEntity, field: fromField },
    to: { entity: toEntity },
    ...(inverse === undefined ? {} : { inverse }),
  };
}

function toMany(
  label: string,
  fromEntity: string,
  toEntity: string,
  toField: string,
  inverse?: string,
): ToManyRelationshipSchema {
  return {
    kind: "toMany",
    label,
    from: { entity: fromEntity },
    to: { entity: toEntity, field: toField },
    ...(inverse === undefined ? {} : { inverse }),
  };
}

function allQuery(label: string, entity: IdentityControlPlaneEntityName) {
  return {
    label,
    entity,
    expression: { kind: "all" },
  } satisfies Omit<AppSchema["queries"][number], "key">;
}
function itemView(entity: IdentityControlPlaneEntityName, fields: readonly string[]) {
  return {
    entity,
    fields: fields.map((field) => ({ field, ...viewField(editorForField(field)) })),
  } satisfies Omit<AppSchema["itemViews"][number], "key">;
}
function tableView(
  entity: IdentityControlPlaneEntityName,
  fields: readonly IdentityControlPlaneTableField[],
  options: {
    editView: string;
    operationLabel: string;
  },
) {
  return {
    entity,
    operations: [
      {
        operation: `${entity}.update`,
        label: `Edit ${entityLabel(entity)}`,
        target: { kind: "row" },
        editView: options.editView,
      },
    ],
    columns: [
      ...fields.map(tableFieldColumn),
      {
        type: "operationControl",
        label: options.operationLabel,
        operations: [`${entity}.update`],
        align: "end",
        width: "xs",
        presentation: "dropdown",
      },
    ],
  } satisfies Omit<AppSchema["tableViews"][number], "key">;
}
function tableFieldColumn(fieldInput: IdentityControlPlaneTableField) {
  const field = typeof fieldInput === "string" ? fieldInput : fieldInput.field;
  const display = typeof fieldInput === "string" ? "readOnly" : (fieldInput.display ?? "readOnly");

  return {
    type: "field",
    field,
    display,
  } satisfies AppSchema["tableViews"][number]["columns"][number];
}
function createView(
  entity: IdentityControlPlaneEntityName,
  fields: readonly IdentityControlPlaneViewField[],
) {
  return {
    type: "create",
    entity,
    fields: fields.map(createFieldEntry),
  } satisfies Omit<Extract<AppSchema["views"][number], { type: "create" }>, "key">;
}
function editView(
  entity: IdentityControlPlaneEntityName,
  fields: readonly IdentityControlPlaneViewField[],
) {
  return {
    type: "edit",
    entity,
    fields: fields.map(viewFieldEntry),
  } satisfies Omit<Extract<AppSchema["views"][number], { type: "edit" }>, "key">;
}
function collectionView(
  label: string,
  entity: IdentityControlPlaneEntityName,
  defaultQuery: string,
  tableViewName: string,
  createViewName: string,
) {
  return {
    type: "collection",
    label,
    entity,
    queries: [{ query: defaultQuery, count: { type: "count" } }],
    defaultQuery,
    result: {
      type: "table",
      tableView: tableViewName,
    },
    operations: [{ operation: `${entity}.create`, createView: createViewName }],
  } satisfies Omit<Extract<AppSchema["views"][number], { type: "collection" }>, "key">;
}
function screen(
  label: string,
  path: `/${string}`,
  sections: ReadonlyArray<[id: string, view: string]>,
) {
  return {
    type: "workspace",
    label,
    path,
    layout: {
      type: "stack",
      sections: sections.map(([id, view]) => ({ id, type: "collection", view })),
    },
  } satisfies Omit<AppSchema["screens"][number], "key">;
}
function writeOperations(
  label: string,
  fields: readonly string[],
  options: {
    delete?: boolean;
    updateFields?: readonly string[];
  } = {},
): NonNullable<AppSchema["entities"][number]["operations"]> {
  const input = {
    fields: fields.map((field) => ({ key: field, field })),
  };
  const updateInput = {
    fields: (options.updateFields ?? fields).map((field) => ({ key: field, field })),
  };
  return [
    {
      access: { actor: "owner" },
      key: "create",
      label: `Create ${label}`,
      kind: "create",
      scope: "collection",
      input,
      effect: { type: "createRecord" },
      output: { type: "create" },
      idempotency: { required: true },
      audit: { input: "summary" },
    },
    {
      access: { actor: "owner" },
      key: "update",
      label: `Update ${label}`,
      kind: "update",
      scope: "record",
      input: updateInput,
      effect: { type: "patchRecord" },
      output: { type: "update" },
      idempotency: { required: true },
      audit: { input: "summary" },
    },
    ...(options.delete
      ? [
          {
            access: { actor: "owner" },
            key: "delete",
            label: `Delete ${label}`,
            kind: "delete",
            scope: "record",
            effect: { type: "deleteRecord" },
            output: { type: "delete" },
            idempotency: { required: true },
            audit: { input: "summary" },
          } as const,
        ]
      : []),
  ] satisfies NonNullable<AppSchema["entities"][number]["operations"]>;
}
function viewField(editor: FieldEditor) {
  return {
    editor,
    commit:
      editor === "boolean" || editor === "enum" || editor === "reference"
        ? "immediate"
        : "field-commit",
  } satisfies Omit<AppSchema["itemViews"][number]["fields"][number], "field">;
}
function createField(editor: FieldEditor) {
  return { editor } satisfies Omit<
    NonNullable<
      Extract<
        AppSchema["views"][number],
        {
          type: "create";
        }
      >["fields"]
    >[number],
    "field"
  >;
}
function createFieldEntry(fieldInput: IdentityControlPlaneViewField) {
  const field = typeof fieldInput === "string" ? fieldInput : fieldInput.field;
  return {
    field,
    ...createField(editorForField(field)),
    ...(typeof fieldInput === "string" || fieldInput.visibleWhen === undefined
      ? {}
      : { visibleWhen: fieldInput.visibleWhen }),
  } as const;
}
function viewFieldEntry(fieldInput: IdentityControlPlaneViewField) {
  const field = typeof fieldInput === "string" ? fieldInput : fieldInput.field;
  return {
    field,
    ...viewField(editorForField(field)),
    ...(typeof fieldInput === "string" || fieldInput.visibleWhen === undefined
      ? {}
      : { visibleWhen: fieldInput.visibleWhen }),
  } as const;
}
function editorForField(field: string): FieldEditor {
  if (field === "primary" || field === "recovery") {
    return "boolean";
  }

  if (
    field === "kind" ||
    field === "status" ||
    field === "key" ||
    field === "verificationStatus" ||
    field === "targetKind" ||
    field === "scopeKind" ||
    field === "targetSurface"
  ) {
    return "enum";
  }

  if (
    field === "principal" ||
    field === "accountPolicy" ||
    field === "role" ||
    field === "targetPrincipal" ||
    field === "targetGroup" ||
    field === "targetOrganization" ||
    field === "scopeOrganization" ||
    field === "selectedOrganization" ||
    field === "invitedPrincipal" ||
    field === "inviterPrincipal"
  ) {
    return "reference";
  }

  return "text";
}

function camelEntityName(entityName: IdentityControlPlaneEntityName): string {
  return entityName.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function entityLabel(entityName: IdentityControlPlaneEntityName): string {
  return entityName.replace(/-/g, " ");
}
