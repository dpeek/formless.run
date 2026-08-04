import {
  composeAppSchema,
  computeSourceSchemaHash,
  defineAppSchemaModule,
  parseAppSchema,
  type AppSchema,
} from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import { describe, expect, it } from "vite-plus/test";
import {
  identityControlPlaneAccessScreenSchemaModule,
  identityControlPlaneRecordSchemaModule,
} from "@dpeek/formless-identity-control-plane/schema";
import {
  identityControlPlaneBootstrapContribution,
  identityControlPlaneRecordAdapter,
} from "@dpeek/formless-identity-control-plane/records";
import {
  formatIdentityControlPlaneBoundaryEntityName,
  identityControlPlaneEntityNames,
  identityControlPlaneImmutableFields,
  identityControlPlaneRecordSourceEntityName,
  identityControlPlaneRoleKeys,
  identityControlPlaneSchema,
  identityControlPlaneSourceSchema,
  isIdentityControlPlaneEntityName,
  identityAccessErrorCodes,
  identityAccessPersonMutationFailureReasons,
  identityCollaboratorInvitationRevokeFailureReasons,
  parseIdentityAccessErrorResponse,
  parseIdentityAccessPersonMutationErrorResponse,
  parseIdentityCollaboratorInvitationRevokeErrorResponse,
  parseIdentityControlPlaneBoundaryEntityName,
  resolveIdentityCollaboratorInvitationGrantAuthority,
  validateIdentityCollaboratorInvitationGrants,
  validateIdentityControlPlaneRecords,
} from "./index.ts";

const testNow = "2026-08-01T00:00:00.000Z";
const testAuthorizationRoles = [
  {
    id: "role_de3ae092-31a9-49df-b7f6-9f51f9403ff9",
    key: "member",
    label: "Member",
  },
  {
    id: "role_3e6f3057-22bf-4fb0-8bd5-7b61bb0f45c4",
    key: "editor",
    label: "Editor",
  },
  {
    id: "role_04144de6-7927-49f2-826a-cdcc70c47357",
    key: "administrator",
    label: "Administrator",
  },
] as const;

describe("identity control-plane schema contracts", () => {
  it("publishes identity records and the runtime-owned Access screen", () => {
    expect(identityControlPlaneRoleKeys).toEqual(["instance.owner"]);
    expect(identityControlPlaneRecordSchemaModule).toMatchObject({
      key: "identity-control-plane-records",
      runtimeRequirements: {
        shared: {
          recordAdapters: ["identity-control-plane.records"],
          bootstrapContributions: ["identity-control-plane.bootstrap"],
        },
      },
      entities: identityControlPlaneEntityNames.map((key) => expect.objectContaining({ key })),
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
    expect(identityControlPlaneRecordAdapter.entityIds).toEqual(
      identityControlPlaneSchema.entities.map(({ id }) => id),
    );
    expect(identityControlPlaneBootstrapContribution.contribute()).toEqual([
      {
        id: "role:instance.owner",
        entity: "role",
        values: {
          key: "instance.owner",
          displayLabel: "instance.owner",
          status: "active",
        },
        createdAt: "2026-06-26T00:00:00.000Z",
        updatedAt: "2026-06-26T00:00:00.000Z",
      },
    ]);
    expect(identityControlPlaneAccessScreenSchemaModule).toMatchObject({
      key: "identity-control-plane-access-screen",
      requires: ["identity-control-plane-records"],
      screens: [
        {
          key: "access",
          type: "runtime",
          label: "Access",
          path: "/access",
        },
      ],
    });
    expect(identityControlPlaneSchema.itemViews).toEqual([]);
    expect(identityControlPlaneSchema.tableViews).toEqual([]);
    expect(identityControlPlaneSchema.views).toEqual([]);
    expect(identityControlPlaneSchema.screens).toEqual([
      { key: "access", type: "runtime", label: "Access", path: "/access" },
    ]);
  });

  it("composes a same-key downstream access screen replacement", () => {
    const replacement = defineAppSchemaModule({
      ...identityControlPlaneAccessScreenSchemaModule,
      screens: identityControlPlaneAccessScreenSchemaModule.screens.map((screen) => ({
        ...screen,
        path: "/people/access",
        access: { role: "administrator" },
      })),
    });
    const schema = parseAppSchema(
      composeAppSchema({
        version: 1,
        authorization: { roles: [...testAuthorizationRoles] },
        modules: [identityControlPlaneRecordSchemaModule, replacement],
        runtime: { owner: "runtime" },
      }),
    );
    const accessScreen = schema.screens.find((screen) => screen.key === "access");

    expect(replacement.key).toBe(identityControlPlaneAccessScreenSchemaModule.key);
    expect(accessScreen).toMatchObject({
      key: "access",
      type: "runtime",
      path: "/people/access",
      access: { role: "administrator" },
    });
    expect(accessScreen === undefined || "layout" in accessScreen).toBe(false);
    expect(schema.itemViews).toEqual([]);
    expect(schema.tableViews).toEqual([]);
    expect(schema.views).toEqual([]);
  });

  it("uses normal App schema source hashing", async () => {
    const sourceHash = await computeSourceSchemaHash(identityControlPlaneSourceSchema);
    const changed = structuredClone(identityControlPlaneSourceSchema) as unknown as AppSchema;

    changed.entities.find((entity) => entity.key === "principal")!.label = "Person";

    expect(parseAppSchema(identityControlPlaneSourceSchema)).toEqual(identityControlPlaneSchema);
    expect(sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(await computeSourceSchemaHash(changed)).not.toBe(sourceHash);
  });

  it("keeps owner and Program role assignments flat", () => {
    const role = entity("role");
    const roleAssignment = entity("role-assignment");
    const programRoleAssignment = entity("program-role-assignment");

    expect(field(role, "key")).toMatchObject({
      type: "enum",
      values: [{ key: "instance.owner", label: "instance.owner" }],
    });
    expect(field(roleAssignment, "scopeKind")).toMatchObject({
      type: "enum",
      values: [
        { key: "instance", label: "Instance" },
        { key: "organization", label: "Organization" },
      ],
    });
    expect(roleAssignment.fields.map(({ key }) => key)).toEqual([
      "role",
      "targetKind",
      "targetPrincipal",
      "targetGroup",
      "targetOrganization",
      "scopeKind",
      "scopeOrganization",
      "status",
    ]);
    expect(programRoleAssignment.fields.map(({ key }) => key)).toEqual([
      "principal",
      "roleId",
      "status",
    ]);
  });

  it("keeps invitation and policy targets instance or organization scoped", () => {
    const invitation = entity("invitation");
    const accountPolicy = entity("account-policy");

    expect(field(invitation, "targetSurface")).toMatchObject({
      type: "enum",
      values: [
        { key: "instance", label: "Instance" },
        { key: "organization", label: "Organization" },
      ],
    });
    expect(invitation.fields.map(({ key }) => key)).toEqual([
      "targetEmail",
      "targetSurface",
      "targetOrganization",
      "invitedPrincipal",
      "inviterPrincipal",
      "status",
      "expiresAt",
      "acceptedAt",
    ]);
    expect(field(accountPolicy, "scopeKind")).toMatchObject({
      type: "enum",
      values: [
        { key: "instance", label: "Instance" },
        { key: "organization", label: "Organization" },
      ],
    });
  });

  it("formats and parses qualified identity entity names", () => {
    expect(formatIdentityControlPlaneBoundaryEntityName("principal")).toBe("auth:principal");
    expect(parseIdentityControlPlaneBoundaryEntityName("Record entity", "auth:organization")).toBe(
      "organization",
    );
    expect(identityControlPlaneRecordSourceEntityName("auth:principal-email")).toBe(
      "principal-email",
    );
    expect(isIdentityControlPlaneEntityName("program-role-assignment")).toBe(true);
    expect(isIdentityControlPlaneEntityName("auth-session")).toBe(false);
  });

  it("parses closed access failure contracts without arbitrary detail", () => {
    expect(
      identityAccessErrorCodes.map((code) => parseIdentityAccessErrorResponse({ code })),
    ).toEqual(identityAccessErrorCodes.map((code) => ({ code })));
    expect(
      identityAccessPersonMutationFailureReasons.map((reason) =>
        parseIdentityAccessPersonMutationErrorResponse({ reason }),
      ),
    ).toEqual(identityAccessPersonMutationFailureReasons.map((reason) => ({ reason })));
    expect(
      identityCollaboratorInvitationRevokeFailureReasons.map((reason) =>
        parseIdentityCollaboratorInvitationRevokeErrorResponse({ reason }),
      ),
    ).toEqual(identityCollaboratorInvitationRevokeFailureReasons.map((reason) => ({ reason })));

    expect(() =>
      parseIdentityAccessErrorResponse({
        code: "forbidden",
        error: "SQLITE_ERROR at /Users/ada/formless",
      }),
    ).toThrow('Identity access error response has unsupported key "error".');
    expect(() =>
      parseIdentityAccessPersonMutationErrorResponse({
        error: "private diagnostic",
        reason: "missing-principal",
      }),
    ).toThrow('Identity access person mutation error response has unsupported key "error".');
    expect(() =>
      parseIdentityCollaboratorInvitationRevokeErrorResponse({ reason: "provider-failure" }),
    ).toThrow("Identity collaborator invitation revoke error response reason is unsupported.");
  });

  it("validates current owner, Program role, invitation, and policy records", () => {
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", identityRecords(), {
        authorizationRoles: testAuthorizationRoles,
      }),
    ).not.toThrow();
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          identityRecords(),
          record("invitation", "invitation:member", {
            expiresAt: "2026-08-08T00:00:00.000Z",
            invitedPrincipal: "principal:member",
            inviterPrincipal: "principal:owner",
            status: "pending",
            targetEmail: "member@example.com",
            targetSurface: "organization",
          }),
        ),
        { authorizationRoles: testAuthorizationRoles },
      ),
    ).toThrow('requires field "auth:invitation.targetOrganization"');
  });

  it("enforces one active Program role per principal", () => {
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        [
          ...identityRecords(),
          record("program-role-assignment", "program-role-assignment:member-editor", {
            principal: "principal:member",
            roleId: testAuthorizationRoles[1].id,
            status: "active",
          }),
        ],
        { authorizationRoles: testAuthorizationRoles },
      ),
    ).toThrow('violates identity uniqueness "auth:program-role-assignment.uniqueActiveAssignment"');
  });

  it("authorizes owner and Program administrator invitation grants", () => {
    const records = identityRecords();
    const grantRecords = [
      record("principal", "principal:invitee", {
        displayName: "Invitee",
        kind: "human",
        status: "invited",
      }),
      record("principal-email", "principal-email:invitee", {
        displayEmail: "invitee@example.com",
        normalizedEmail: "invitee@example.com",
        primary: true,
        principal: "principal:invitee",
        recovery: false,
        verificationStatus: "unverified",
      }),
      record("program-role-assignment", "program-role-assignment:invitee-member", {
        principal: "principal:invitee",
        roleId: testAuthorizationRoles[0].id,
        status: "active",
      }),
    ];

    expect(
      resolveIdentityCollaboratorInvitationGrantAuthority(
        records,
        "principal:owner",
        testAuthorizationRoles,
      ),
    ).toMatchObject({ instanceOwner: true, programAdministrator: false });
    expect(
      validateIdentityCollaboratorInvitationGrants("Invitation grants", {
        authorizationRoles: testAuthorizationRoles,
        grantRecords,
        inviterPrincipalId: "principal:administrator",
        records,
      }),
    ).toMatchObject({ instanceOwner: false, programAdministrator: true });
    expect(() =>
      validateIdentityCollaboratorInvitationGrants("Invitation grants", {
        authorizationRoles: testAuthorizationRoles,
        grantRecords: [
          record("role-assignment", "role-assignment:invitee-owner", {
            role: "role:instance.owner",
            scopeKind: "instance",
            status: "active",
            targetKind: "principal",
            targetPrincipal: "principal:invitee",
          }),
        ],
        inviterPrincipalId: "principal:administrator",
        records,
      }),
    ).toThrow("cannot grant instance.owner with Program administrator authority");
  });
});

function entity(key: string) {
  const value = identityControlPlaneSchema.entities.find((candidate) => candidate.key === key);
  if (!value) throw new Error(`Missing entity "${key}".`);
  return value;
}

function field(entityDefinition: ReturnType<typeof entity>, key: string) {
  const value = entityDefinition.fields.find((candidate) => candidate.key === key);
  if (!value) throw new Error(`Missing field "${entityDefinition.key}.${key}".`);
  return value;
}

function identityRecords(): StoredRecord[] {
  return [
    record("principal", "principal:owner", {
      displayName: "Owner",
      kind: "human",
      status: "active",
    }),
    record("principal", "principal:administrator", {
      displayName: "Administrator",
      kind: "human",
      status: "active",
    }),
    record("principal", "principal:member", {
      displayName: "Member",
      kind: "human",
      status: "active",
    }),
    record("principal-email", "principal-email:member", {
      displayEmail: "member@example.com",
      normalizedEmail: "member@example.com",
      primary: true,
      principal: "principal:member",
      recovery: false,
      verificationStatus: "verified",
      verifiedAt: testNow,
    }),
    record("organization", "organization:acme", {
      displayName: "Acme",
      status: "active",
    }),
    record("role", "role:instance.owner", {
      displayLabel: "Owner",
      key: "instance.owner",
      status: "active",
    }),
    record("role-assignment", "role-assignment:owner", {
      role: "role:instance.owner",
      scopeKind: "instance",
      status: "active",
      targetKind: "principal",
      targetPrincipal: "principal:owner",
    }),
    record("program-role-assignment", "program-role-assignment:administrator", {
      principal: "principal:administrator",
      roleId: testAuthorizationRoles[2].id,
      status: "active",
    }),
    record("program-role-assignment", "program-role-assignment:member", {
      principal: "principal:member",
      roleId: testAuthorizationRoles[0].id,
      status: "active",
    }),
    record("invitation", "invitation:member", {
      expiresAt: "2026-08-08T00:00:00.000Z",
      invitedPrincipal: "principal:member",
      inviterPrincipal: "principal:owner",
      status: "pending",
      targetEmail: "member@example.com",
      targetOrganization: "organization:acme",
      targetSurface: "organization",
    }),
    record("account-policy", "account-policy:terms", {
      displayName: "Terms",
      policyKey: "terms",
      publishedAt: testNow,
      scopeKind: "instance",
      status: "active",
      version: "2026-08",
    }),
    record("principal-policy-acceptance", "policy-acceptance:member", {
      acceptedAt: testNow,
      accountPolicy: "account-policy:terms",
      principal: "principal:member",
      status: "accepted",
    }),
  ];
}

function record(entity: string, id: string, values: StoredRecord["values"]): StoredRecord {
  return { createdAt: testNow, entity, id, updatedAt: testNow, values };
}

function replaceRecord(records: StoredRecord[], replacement: StoredRecord): StoredRecord[] {
  return records.map((candidate) => (candidate.id === replacement.id ? replacement : candidate));
}
