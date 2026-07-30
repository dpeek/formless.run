import { describe, expect, it } from "vite-plus/test";
import { computeSourceSchemaHash } from "@dpeek/formless-installed-apps";
import { parseAppSchema, type AppSchema } from "@dpeek/formless-schema";
import {
  STORAGE_SNAPSHOT_KIND,
  STORAGE_SNAPSHOT_VERSION,
  type StorageSnapshot,
  type StoredRecord,
} from "@dpeek/formless-storage";
import {
  identityControlPlanePresentationSchemaModule,
  identityControlPlaneRecordSchemaModule,
} from "@dpeek/formless-identity-control-plane/schema";
import {
  IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_PATH,
  IDENTITY_ACCESS_PERSON_REMOVAL_API_PATH,
  IDENTITY_ACCESS_PERSON_ROLE_REPLACEMENT_API_PATH,
  IDENTITY_COLLABORATOR_INVITATIONS_API_PATH,
  IDENTITY_COLLABORATOR_INVITATION_REVOKE_API_PATH,
  IDENTITY_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY,
  IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX,
  IDENTITY_CONTROL_PLANE_SCHEMA_KEY,
  IDENTITY_CONTROL_PLANE_SOURCE_SCHEMA_HASH,
  IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY,
  formatIdentityControlPlaneBoundaryEntityName,
  identityControlPlaneEntityNames,
  identityControlPlaneRoleKeys,
  identityControlPlaneImmutableFields,
  identityControlPlaneRecordSourceEntityName,
  identityControlPlaneSchema,
  identityControlPlaneSchemaProvenance,
  identityControlPlaneSourceSchema,
  isIdentityControlPlaneEntityName,
  parseIdentityControlPlaneBoundaryEntityName,
  parseIdentityControlPlaneStorageSnapshot,
  resolveIdentityCollaboratorInvitationGrantAuthority,
  reviewableIdentityControlPlaneStorageSnapshot,
  validateIdentityCollaboratorInvitationGrants,
  validateIdentityControlPlaneRecords,
} from "./index.ts";

const privateAuthStateEntities = [
  "auth-session",
  "central-session",
  "challenge",
  "credential",
  "credential-material",
  "cross-domain-grant",
  "email-verification-challenge",
  "host-session",
  "invite-token",
  "invite-token-hash",
  "passkey-challenge",
  "passkey-credential",
  "provider-response",
  "recovery-secret",
  "revocation",
] as const;

describe("identity control-plane schema contracts", () => {
  it("publishes record declarations before dependent presentation declarations", () => {
    expect(identityControlPlaneRecordSchemaModule).toMatchObject({
      key: "identity-control-plane-records",
      entities: identityControlPlaneEntityNames.map((key) => expect.objectContaining({ key })),
      relationships: expect.arrayContaining([
        expect.objectContaining({ key: "principalEmailPrincipal" }),
        expect.objectContaining({ key: "policyAcceptances" }),
      ]),
      queries: expect.arrayContaining([
        expect.objectContaining({ key: "principalAll" }),
        expect.objectContaining({ key: "principalPolicyAcceptanceAll" }),
      ]),
      runtime: expect.objectContaining({
        controlPlane: expect.objectContaining({
          entities: expect.any(Object),
        }),
      }),
    });
    expect(identityControlPlanePresentationSchemaModule).toMatchObject({
      key: "identity-control-plane-presentation",
      requires: ["identity-control-plane-records"],
      itemViews: expect.arrayContaining([expect.objectContaining({ key: "principalItem" })]),
      tableViews: expect.arrayContaining([expect.objectContaining({ key: "principalTable" })]),
      views: expect.arrayContaining([
        expect.objectContaining({ key: "principalList" }),
        expect.objectContaining({ key: "principalPolicyAcceptanceList" }),
      ]),
      screens: expect.arrayContaining([
        expect.objectContaining({ key: "principals" }),
        expect.objectContaining({ key: "organizations" }),
        expect.objectContaining({ key: "access" }),
        expect.objectContaining({ key: "apps" }),
        expect.objectContaining({ key: "invitations" }),
        expect.objectContaining({ key: "policies" }),
      ]),
    });
    expect(identityControlPlaneSourceSchema.runtime?.owner).toBe("runtime");
    expect(identityControlPlaneRecordSchemaModule.runtime.controlPlane.entities).toEqual(
      identityControlPlaneSourceSchema.runtime?.controlPlane?.entities,
    );
  });

  it("publishes deterministic source provenance for the identity schema", async () => {
    const baseHash = await computeSourceSchemaHash(identityControlPlaneSourceSchema);
    const mutationCases: Array<[string, (schema: AppSchema) => void]> = [
      [
        "schema field metadata",
        (schema) => {
          schema.entities
            .find((definition) => definition.key === "principal")!
            .fields.find((definition) => definition.key === "displayName")!.label = "Name";
        },
      ],
      [
        "operation metadata",
        (schema) => {
          const create = schema.entities
            .find((definition) => definition.key === "principal")!
            .operations?.find((definition) => definition.key === "create");
          if (!create) {
            throw new Error("Expected principal create operation.");
          }

          create.label = "Create identity principal";
        },
      ],
      [
        "runtime metadata",
        (schema) => {
          const metadata = schema.runtime?.controlPlane?.entities.principal;

          if (!metadata) {
            throw new Error("Expected principal runtime metadata.");
          }

          metadata.immutableFields = ["kind", "status"];
        },
      ],
    ];

    expect(parseAppSchema(identityControlPlaneSourceSchema)).toEqual(identityControlPlaneSchema);
    expect(IDENTITY_CONTROL_PLANE_SOURCE_SCHEMA_HASH).toBe(baseHash);
    expect(identityControlPlaneSchemaProvenance).toEqual({
      kind: "identity-control-plane",
      sourceSchemaHash: baseHash,
    });

    for (const [label, mutate] of mutationCases) {
      const changedSchema = structuredClone(
        identityControlPlaneSourceSchema,
      ) as unknown as AppSchema;
      mutate(changedSchema);

      expect(await computeSourceSchemaHash(changedSchema), label).not.toBe(baseHash);
    }
  });
  it("defines the runtime-owned flat identity entities and local references", () => {
    const schema = identityControlPlaneSchema;
    const referenceTargets = schema.entities.flatMap((entity) =>
      entity.fields.flatMap((field) => (field.type === "reference" ? [field.to] : [])),
    );
    expect(schema.entities.map(({ key }) => key).sort()).toEqual(
      [...identityControlPlaneEntityNames].sort(),
    );
    expect(referenceTargets.filter((target) => target.includes(":"))).toEqual([]);
    expect(referenceTargets).toEqual(
      expect.arrayContaining(["principal", "group", "organization", "role"]),
    );
    expect(schema.runtime?.owner).toBe("runtime");
    expect(schema.runtime?.controlPlane?.entities).toEqual(
      Object.fromEntries(
        identityControlPlaneEntityNames.map((entityName) => [
          entityName,
          { immutableFields: [...identityControlPlaneImmutableFields[entityName]] },
        ]),
      ),
    );
    expect(
      definitionRecord(
        schema.entities.find((definition) => definition.key === "principal")!.fields,
      ),
    ).toMatchObject({
      displayName: { type: "text", required: true },
      kind: {
        type: "enum",
        required: true,
        values: [
          { key: "human", label: "Human" },
          { key: "service", label: "Service" },
        ],
      },
      status: {
        type: "enum",
        required: true,
        values: [
          { key: "active", label: "Active" },
          { key: "disabled", label: "Disabled" },
          { key: "invited", label: "Invited" },
        ],
      },
    });
    expect(
      definitionRecord(
        schema.entities.find((definition) => definition.key === "principal-email")!.fields,
      ),
    ).toMatchObject({
      principal: { type: "reference", required: true, to: "principal" },
      displayEmail: { type: "text", required: true },
      normalizedEmail: { type: "text", required: true },
      verificationStatus: {
        type: "enum",
        required: true,
        values: [
          { key: "unverified", label: "Unverified" },
          { key: "verified", label: "Verified" },
        ],
      },
      primary: { type: "boolean", required: true, default: false },
      recovery: { type: "boolean", required: true, default: false },
      verifiedAt: { type: "text", required: false },
    });
    expect(
      definitionRecord(
        schema.entities.find((definition) => definition.key === "principal-email")!.constraints ??
          [],
      ),
    ).toEqual({
      uniqueNormalizedEmail: { kind: "unique", fields: ["normalizedEmail"] },
    });
    expect(
      definitionRecord(schema.entities.find((definition) => definition.key === "group")!.fields),
    ).toMatchObject({
      displayName: { type: "text", required: true },
      status: { type: "enum", required: true },
    });
    expect(
      definitionRecord(
        schema.entities.find((definition) => definition.key === "organization")!.fields,
      ),
    ).toMatchObject({
      displayName: { type: "text", required: true },
      status: { type: "enum", required: true },
    });
    expect(
      definitionRecord(
        schema.entities.find((definition) => definition.key === "membership")!.fields,
      ),
    ).toMatchObject({
      principal: { type: "reference", required: true, to: "principal" },
      targetKind: {
        type: "enum",
        required: true,
        values: [
          { key: "group", label: "Group" },
          { key: "organization", label: "Organization" },
        ],
      },
      targetGroup: { type: "reference", required: false, to: "group" },
      targetOrganization: { type: "reference", required: false, to: "organization" },
      status: { type: "enum", required: true },
    });
    expect(
      schema.entities.find((definition) => definition.key === "membership")!.constraints ?? [],
    ).toEqual([]);
    expect(
      definitionRecord(schema.entities.find((definition) => definition.key === "role")!.fields),
    ).toMatchObject({
      key: {
        type: "enum",
        required: true,
        values: [
          { key: "instance.owner", label: "instance.owner" },
          { key: "app.admin", label: "app.admin" },
          { key: "app.editor", label: "app.editor" },
          { key: "app.viewer", label: "app.viewer" },
          { key: "app.user", label: "app.user" },
        ],
      },
      displayLabel: { type: "text", required: true },
      status: { type: "enum", required: true },
    });
    expect(
      definitionRecord(
        schema.entities.find((definition) => definition.key === "role")!.constraints ?? [],
      ),
    ).toEqual({
      uniqueKey: { kind: "unique", fields: ["key"] },
    });
    expect(
      definitionRecord(
        schema.entities.find((definition) => definition.key === "role-assignment")!.fields,
      ),
    ).toMatchObject({
      role: { type: "reference", required: true, to: "role" },
      targetKind: {
        type: "enum",
        required: true,
        values: [
          { key: "group", label: "Group" },
          { key: "organization", label: "Organization" },
          { key: "principal", label: "Principal" },
        ],
      },
      targetPrincipal: { type: "reference", required: false, to: "principal" },
      targetGroup: { type: "reference", required: false, to: "group" },
      targetOrganization: { type: "reference", required: false, to: "organization" },
      scopeKind: {
        type: "enum",
        required: true,
        values: [
          { key: "app-install", label: "App install" },
          { key: "instance", label: "Instance" },
          { key: "organization", label: "Organization" },
        ],
      },
      appInstallId: { type: "text", required: false },
      scopeOrganization: { type: "reference", required: false, to: "organization" },
      status: { type: "enum", required: true },
    });
    expect(
      schema.entities.find((definition) => definition.key === "role-assignment")!.constraints ?? [],
    ).toEqual([]);
    expect(
      definitionRecord(
        schema.entities.find((definition) => definition.key === "app-registration")!.fields,
      ),
    ).toMatchObject({
      appInstallId: { type: "text", required: true },
      targetKind: {
        type: "enum",
        required: true,
        values: [
          { key: "organization", label: "Organization" },
          { key: "principal", label: "Principal" },
        ],
      },
      targetPrincipal: { type: "reference", required: false, to: "principal" },
      targetOrganization: { type: "reference", required: false, to: "organization" },
      status: { type: "enum", required: true },
      selectedOrganization: { type: "reference", required: false, to: "organization" },
    });
    expect(
      schema.entities.find((definition) => definition.key === "app-registration")!.constraints ??
        [],
    ).toEqual([]);
    expect(
      definitionRecord(
        schema.entities.find((definition) => definition.key === "invitation")!.fields,
      ),
    ).toMatchObject({
      targetEmail: { type: "text", required: true },
      targetSurface: {
        type: "enum",
        required: true,
        values: [
          { key: "app-install", label: "App install" },
          { key: "instance", label: "Instance" },
          { key: "organization", label: "Organization" },
        ],
      },
      targetAppInstallId: { type: "text", required: false },
      targetOrganization: { type: "reference", required: false, to: "organization" },
      invitedPrincipal: { type: "reference", required: false, to: "principal" },
      inviterPrincipal: { type: "reference", required: false, to: "principal" },
      status: {
        type: "enum",
        required: true,
        values: [
          { key: "accepted", label: "Accepted" },
          { key: "expired", label: "Expired" },
          { key: "pending", label: "Pending" },
          { key: "revoked", label: "Revoked" },
        ],
      },
      expiresAt: { type: "text", required: true },
      acceptedAt: { type: "text", required: false },
    });
    expect(
      definitionRecord(
        schema.entities.find((definition) => definition.key === "account-policy")!.fields,
      ),
    ).toMatchObject({
      displayName: { type: "text", required: true },
      policyKey: { type: "text", required: true },
      version: { type: "text", required: true },
      scopeKind: {
        type: "enum",
        required: true,
        values: [
          { key: "app-install", label: "App install" },
          { key: "instance", label: "Instance" },
          { key: "organization", label: "Organization" },
        ],
      },
      appInstallId: { type: "text", required: false },
      scopeOrganization: { type: "reference", required: false, to: "organization" },
      status: {
        type: "enum",
        required: true,
        values: [
          { key: "active", label: "Active" },
          { key: "retired", label: "Retired" },
        ],
      },
      publishedAt: { type: "text", required: false },
      policyDocumentUrl: { type: "text", required: false, format: "href" },
      policyContentRef: { type: "text", required: false },
    });
    expect(
      schema.entities.find((definition) => definition.key === "account-policy")!.constraints ?? [],
    ).toEqual([]);
    expect(
      definitionRecord(
        schema.entities.find((definition) => definition.key === "principal-policy-acceptance")!
          .fields,
      ),
    ).toMatchObject({
      principal: { type: "reference", required: true, to: "principal" },
      accountPolicy: { type: "reference", required: true, to: "account-policy" },
      status: {
        type: "enum",
        required: true,
        values: [
          { key: "accepted", label: "Accepted" },
          { key: "revoked", label: "Revoked" },
        ],
      },
      acceptedAt: { type: "text", required: true },
    });
    expect(
      schema.entities.find((definition) => definition.key === "principal-policy-acceptance")!
        .constraints ?? [],
    ).toEqual([]);
  });
  it("declares local relationship shapes for fixed identity references", () => {
    const schema = identityControlPlaneSchema;
    expect(
      schema.relationships?.find((definition) => definition.key === "principalEmailPrincipal"),
    ).toMatchObject({
      kind: "toOne",
      label: "Principal email principal",
      from: { entity: "principal-email", field: "principal" },
      to: { entity: "principal" },
      inverse: "principalEmails",
    });
    expect(
      schema.relationships?.find((definition) => definition.key === "principalEmails"),
    ).toMatchObject({
      kind: "toMany",
      label: "Principal emails",
      from: { entity: "principal" },
      to: { entity: "principal-email", field: "principal" },
      inverse: "principalEmailPrincipal",
    });
    expect(
      schema.relationships?.find((definition) => definition.key === "membershipGroup"),
    ).toMatchObject({
      kind: "toOne",
      from: { entity: "membership", field: "targetGroup" },
      to: { entity: "group" },
    });
    expect(
      schema.relationships?.find((definition) => definition.key === "membershipOrganization"),
    ).toMatchObject({
      kind: "toOne",
      from: { entity: "membership", field: "targetOrganization" },
      to: { entity: "organization" },
    });
    expect(
      schema.relationships?.find((definition) => definition.key === "roleAssignmentRole"),
    ).toMatchObject({
      kind: "toOne",
      from: { entity: "role-assignment", field: "role" },
      to: { entity: "role" },
    });
    expect(
      schema.relationships?.find(
        (definition) => definition.key === "appRegistrationSelectedOrganization",
      ),
    ).toMatchObject({
      kind: "toOne",
      from: { entity: "app-registration", field: "selectedOrganization" },
      to: { entity: "organization" },
    });
    expect(
      schema.relationships?.find((definition) => definition.key === "invitationInvitedPrincipal"),
    ).toMatchObject({
      kind: "toOne",
      from: { entity: "invitation", field: "invitedPrincipal" },
      to: { entity: "principal" },
    });
    expect(
      schema.relationships?.find(
        (definition) => definition.key === "accountPolicyScopeOrganization",
      ),
    ).toMatchObject({
      kind: "toOne",
      from: { entity: "account-policy", field: "scopeOrganization" },
      to: { entity: "organization" },
    });
    expect(
      schema.relationships?.find(
        (definition) => definition.key === "principalPolicyAcceptancePrincipal",
      ),
    ).toMatchObject({
      kind: "toOne",
      from: { entity: "principal-policy-acceptance", field: "principal" },
      to: { entity: "principal" },
    });
    expect(
      schema.relationships?.find(
        (definition) => definition.key === "principalPolicyAcceptancePolicy",
      ),
    ).toMatchObject({
      kind: "toOne",
      from: { entity: "principal-policy-acceptance", field: "accountPolicy" },
      to: { entity: "account-policy" },
    });
  });
  it("declares generated write operations without private auth-state entities", () => {
    const schema = identityControlPlaneSchema;
    for (const entityName of identityControlPlaneEntityNames) {
      const operations = schema.entities.find(
        (definition) => definition.key === entityName,
      )!.operations;
      expect(operation(operations, "create")).toMatchObject({
        kind: "create",
        scope: "collection",
        effect: { type: "createRecord" },
        output: { type: "create" },
      });
      expect(operation(operations, "update")).toMatchObject({
        kind: "update",
        scope: "record",
        effect: { type: "patchRecord" },
        output: { type: "update" },
      });
      expect(operation(operations, "create").input?.fields?.map(({ key }) => key)).toEqual(
        schema.entities
          .find((definition) => definition.key === entityName)!
          .fields.map(({ key }) => key),
      );
    }
    expect(
      operation(
        schema.entities.find((definition) => definition.key === "principal")!.operations,
        "update",
      ).input?.fields?.map(({ key }) => key),
    ).toEqual(["displayName", "status"]);
    expect(
      operation(
        schema.entities.find((definition) => definition.key === "principal-email")!.operations,
        "update",
      ).input?.fields?.map(({ key }) => key),
    ).toEqual(["displayEmail", "verificationStatus", "primary", "recovery", "verifiedAt"]);
    expect(
      operation(
        schema.entities.find((definition) => definition.key === "membership")!.operations,
        "update",
      ).input?.fields?.map(({ key }) => key),
    ).toEqual(["status"]);
    expect(
      operation(
        schema.entities.find((definition) => definition.key === "role-assignment")!.operations,
        "update",
      ).input?.fields?.map(({ key }) => key),
    ).toEqual(["status"]);
    expect(
      operation(
        schema.entities.find((definition) => definition.key === "role-assignment")!.operations,
        "delete",
      ),
    ).toMatchObject({
      kind: "delete",
      scope: "record",
      effect: { type: "deleteRecord" },
      output: { type: "delete" },
    });
    expect(
      schema.entities
        .find((definition) => definition.key === "principal")!
        .operations?.find((definition) => definition.key === "delete"),
    ).toBeUndefined();
    expect(
      operation(
        schema.entities.find((definition) => definition.key === "app-registration")!.operations,
        "update",
      ).input?.fields?.map(({ key }) => key),
    ).toEqual(["status", "selectedOrganization"]);
    expect(
      operation(
        schema.entities.find((definition) => definition.key === "invitation")!.operations,
        "update",
      ).input?.fields?.map(({ key }) => key),
    ).toEqual(["status", "acceptedAt"]);
    expect(
      operation(
        schema.entities.find((definition) => definition.key === "account-policy")!.operations,
        "update",
      ).input?.fields?.map(({ key }) => key),
    ).toEqual(["displayName", "status", "publishedAt"]);
    expect(
      operation(
        schema.entities.find((definition) => definition.key === "principal-policy-acceptance")!
          .operations,
        "update",
      ).input?.fields?.map(({ key }) => key),
    ).toEqual(["status"]);
    for (const privateEntity of privateAuthStateEntities) {
      expect(schema.entities).not.toHaveProperty(privateEntity);
    }
  });

  it("formats, parses, and identifies identity boundary entity names", () => {
    expect(IDENTITY_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY).toBe("auth");
    expect(IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX).toBe("/api/formless/identity");
    expect(IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_PATH).toBe("/access-summary");
    expect(IDENTITY_ACCESS_PERSON_ROLE_REPLACEMENT_API_PATH).toBe("/access-people/replace-roles");
    expect(IDENTITY_ACCESS_PERSON_REMOVAL_API_PATH).toBe("/access-people/remove");
    expect(IDENTITY_COLLABORATOR_INVITATIONS_API_PATH).toBe("/collaborator-invitations");
    expect(IDENTITY_COLLABORATOR_INVITATION_REVOKE_API_PATH).toBe(
      "/collaborator-invitations/revoke",
    );
    expect(IDENTITY_CONTROL_PLANE_SCHEMA_KEY).toBe("identity-control-plane");
    expect(IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY).toBe("instance:identity");
    expect(formatIdentityControlPlaneBoundaryEntityName("principal")).toBe("auth:principal");
    expect(formatIdentityControlPlaneBoundaryEntityName("organization")).toBe("auth:organization");
    expect(formatIdentityControlPlaneBoundaryEntityName("account-policy")).toBe(
      "auth:account-policy",
    );
    expect(parseIdentityControlPlaneBoundaryEntityName("Archive record entity", "auth:group")).toBe(
      "group",
    );
    expect(identityControlPlaneRecordSourceEntityName("auth:principal-email")).toBe(
      "principal-email",
    );
    expect(identityControlPlaneRecordSourceEntityName("auth:principal-policy-acceptance")).toBe(
      "principal-policy-acceptance",
    );
    expect(identityControlPlaneRecordSourceEntityName("role-assignment")).toBe("role-assignment");
    expect(isIdentityControlPlaneEntityName("app-registration")).toBe(true);
    expect(isIdentityControlPlaneEntityName("account-policy")).toBe(true);
    expect(isIdentityControlPlaneEntityName("auth-session")).toBe(false);
    expect(() =>
      parseIdentityControlPlaneBoundaryEntityName(
        "Archive record entity",
        "identity-control-plane:principal",
      ),
    ).toThrow('Archive record entity schema key must be "auth".');
    expect(() =>
      parseIdentityControlPlaneBoundaryEntityName("Archive record entity", "auth:auth-session"),
    ).toThrow("is not an identity control-plane entity");
  });

  it("validates display-safe identity storage snapshots and records", () => {
    const snapshot = identityStorageSnapshot();

    expect(parseIdentityControlPlaneStorageSnapshot("Identity archive", snapshot)).toEqual(
      snapshot,
    );
    expect(
      reviewableIdentityControlPlaneStorageSnapshot({
        ...snapshot,
        sourceCursor: 123,
        records: snapshot.records.map((record) => ({
          ...record,
          entity: formatIdentityControlPlaneBoundaryEntityName(
            record.entity as (typeof identityControlPlaneEntityNames)[number],
          ),
        })),
      }),
    ).toMatchObject({
      sourceCursor: snapshot.records.length,
      records: snapshot.records,
    });
    expect(() =>
      parseIdentityControlPlaneStorageSnapshot("Identity archive", {
        ...snapshot,
        storageIdentity: "instance:control-plane",
      }),
    ).toThrow('Storage snapshot storageIdentity must be "instance:identity".');
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...identityRecords(),
        identityRecord("unknown", "unknown:1", {}),
      ]),
    ).toThrow('references unknown entity "unknown"');
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...identityRecords(),
        {
          ...identityRecords()[0],
          id: "principal:duplicate-id",
        },
      ]),
    ).not.toThrow();
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...identityRecords(),
        {
          ...identityRecords()[0],
        },
      ]),
    ).toThrow('includes duplicate identity record id "principal:ada"');
  });

  it("validates identity record invariants that are outside field shape", () => {
    const records = identityRecords();

    expect(
      validateIdentityControlPlaneRecords("Identity records", records, {
        authorizationRoles: testAuthorizationRoles,
      }),
    ).toBeUndefined();
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        principalEmailRecord("principal-email:duplicate", {
          principal: "principal:grace",
          displayEmail: "duplicate@example.com",
          normalizedEmail: "ada@example.com",
        }),
      ]),
    ).toThrow('violates unique constraint "auth:principal-email.uniqueNormalizedEmail"');
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        {
          ...principalEmailRecord("principal-email:tombstoned-duplicate", {
            principal: "principal:grace",
            displayEmail: "duplicate@example.com",
            normalizedEmail: "ada@example.com",
          }),
          deletedAt: testNow,
        },
      ]),
    ).not.toThrow();
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        roleRecord("role:owner-duplicate", {
          displayLabel: "Duplicate owner",
          key: "instance.owner",
        }),
      ]),
    ).toThrow('violates unique constraint "auth:role.uniqueKey"');
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        {
          ...roleRecord("role:owner-tombstoned-duplicate", {
            displayLabel: "Duplicate owner",
            key: "instance.owner",
          }),
          deletedAt: testNow,
        },
      ]),
    ).not.toThrow();

    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          membershipRecord("membership:ada-group", { targetGroup: undefined }),
        ),
      ),
    ).toThrow('requires field "auth:membership.targetGroup"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          membershipRecord("membership:ada-group", { targetOrganization: "organization:acme" }),
        ),
      ),
    ).toThrow('cannot set field "auth:membership.targetOrganization"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          roleAssignmentRecord("role-assignment:ada-owner", {
            targetGroup: "group:operators",
          }),
        ),
      ),
    ).toThrow('cannot set field "auth:role-assignment.targetGroup"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          roleAssignmentRecord("role-assignment:ada-owner", { appInstallId: "site" }),
        ),
      ),
    ).toThrow('cannot set field "auth:role-assignment.appInstallId"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          roleAssignmentRecord("role-assignment:ada-owner", {
            appInstallId: undefined,
            scopeKind: "app-install",
          }),
        ),
      ),
    ).toThrow('requires field "auth:role-assignment.appInstallId"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          roleAssignmentRecord("role-assignment:ada-owner", {
            scopeKind: "organization",
            scopeOrganization: undefined,
          }),
        ),
      ),
    ).toThrow('requires field "auth:role-assignment.scopeOrganization"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          appRegistrationRecord("app-registration:site-ada", {
            targetKind: "organization",
            targetPrincipal: "principal:ada",
          }),
        ),
      ),
    ).toThrow('requires field "auth:app-registration.targetOrganization"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          appRegistrationRecord("app-registration:site-ada", {
            targetKind: "organization",
            targetOrganization: "organization:acme",
            targetPrincipal: "principal:ada",
          }),
        ),
      ),
    ).toThrow('cannot set field "auth:app-registration.targetPrincipal"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          invitationRecord("invitation:ada", {
            targetAppInstallId: undefined,
          }),
        ),
      ),
    ).toThrow('requires field "auth:invitation.targetAppInstallId"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          invitationRecord("invitation:ada", {
            targetOrganization: "organization:acme",
          }),
        ),
      ),
    ).toThrow('cannot set field "auth:invitation.targetOrganization"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          invitationRecord("invitation:ada", {
            targetAppInstallId: "site",
            targetSurface: "instance",
          }),
        ),
      ),
    ).toThrow('cannot set field "auth:invitation.targetAppInstallId"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          accountPolicyRecord("account-policy:terms", {
            appInstallId: undefined,
            scopeKind: "app-install",
          }),
        ),
      ),
    ).toThrow('requires field "auth:account-policy.appInstallId"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          accountPolicyRecord("account-policy:terms", {
            appInstallId: "site",
          }),
        ),
      ),
    ).toThrow('cannot set field "auth:account-policy.appInstallId"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          accountPolicyRecord("account-policy:terms", {
            scopeKind: "organization",
            scopeOrganization: undefined,
          }),
        ),
      ),
    ).toThrow('requires field "auth:account-policy.scopeOrganization"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          principalPolicyAcceptanceRecord("principal-policy-acceptance:ada-terms", {
            accountPolicy: "account-policy:missing",
          }),
        ),
      ),
    ).toThrow('references unknown auth:account-policy record "account-policy:missing"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          principalPolicyAcceptanceRecord("principal-policy-acceptance:ada-terms", {
            status: "pending",
          }),
        ),
      ),
    ).toThrow('has invalid field "auth:principal-policy-acceptance.status"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          invitationRecord("invitation:ada", { inviteTokenHash: "sha256:private" }),
        ),
      ),
    ).toThrow("cannot store private auth state");
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          invitationRecord("invitation:ada", {
            targetEmail: JSON.stringify({ providerResponse: { id: "message-id" } }),
          }),
        ),
      ),
    ).toThrow("cannot store private auth state");
  });

  it("validates target-aware active identity uniqueness", () => {
    const records = identityRecords();
    const recordsWithAlternateTargets = [
      ...records,
      identityRecord("group", "group:reviewers", {
        displayName: "Reviewers",
        status: "active",
      }),
      identityRecord("organization", "organization:globex", {
        displayName: "Globex",
        status: "active",
      }),
      membershipRecord("membership:ada-reviewers", {
        targetGroup: "group:reviewers",
      }),
      membershipRecord("membership:ada-acme", {
        targetGroup: undefined,
        targetKind: "organization",
        targetOrganization: "organization:acme",
      }),
      membershipRecord("membership:ada-globex", {
        targetGroup: undefined,
        targetKind: "organization",
        targetOrganization: "organization:globex",
      }),
      roleAssignmentRecord("role-assignment:grace-owner", {
        targetPrincipal: "principal:grace",
      }),
      appRegistrationRecord("app-registration:site-grace", {
        targetPrincipal: "principal:grace",
      }),
    ];

    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", recordsWithAlternateTargets),
    ).not.toThrow();
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        membershipRecord("membership:ada-group-duplicate"),
      ]),
    ).toThrow('violates identity uniqueness "auth:membership.uniqueActiveMembership"');
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        {
          ...membershipRecord("membership:ada-group-tombstoned-duplicate"),
          deletedAt: testNow,
        },
      ]),
    ).not.toThrow();
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        roleAssignmentRecord("role-assignment:ada-owner-duplicate"),
      ]),
    ).toThrow('violates identity uniqueness "auth:role-assignment.uniqueActiveAssignment"');
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        roleAssignmentRecord("role-assignment:ada-owner-app", {
          appInstallId: "site",
          scopeKind: "app-install",
        }),
        roleAssignmentRecord("role-assignment:ada-owner-other-app", {
          appInstallId: "tasks",
          scopeKind: "app-install",
        }),
      ]),
    ).not.toThrow();
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        {
          ...roleAssignmentRecord("role-assignment:ada-owner-tombstoned-duplicate"),
          deletedAt: testNow,
        },
      ]),
    ).not.toThrow();
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        appRegistrationRecord("app-registration:site-ada-duplicate"),
      ]),
    ).toThrow('violates identity uniqueness "auth:app-registration.uniqueActiveRegistration"');
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        {
          ...appRegistrationRecord("app-registration:site-ada-tombstoned-duplicate"),
          deletedAt: testNow,
        },
      ]),
    ).not.toThrow();
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...recordsWithAlternateTargets,
        accountPolicyRecord("account-policy:app-terms", {
          appInstallId: "site",
          policyKey: "terms",
          scopeKind: "app-install",
          version: "2026-07",
        }),
        principalPolicyAcceptanceRecord("principal-policy-acceptance:ada-app-terms", {
          accountPolicy: "account-policy:app-terms",
        }),
      ]),
    ).not.toThrow();
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        principalPolicyAcceptanceRecord("principal-policy-acceptance:ada-terms-duplicate"),
      ]),
    ).toThrow(
      'violates identity uniqueness "auth:principal-policy-acceptance.uniqueAcceptedPrincipalPolicy"',
    );
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        principalPolicyAcceptanceRecord("principal-policy-acceptance:ada-terms-revoked", {
          status: "revoked",
        }),
      ]),
    ).not.toThrow();
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        {
          ...principalPolicyAcceptanceRecord(
            "principal-policy-acceptance:ada-terms-tombstoned-duplicate",
          ),
          deletedAt: testNow,
        },
      ]),
    ).not.toThrow();
  });

  it("keeps account policy acceptance flat and outside authentication authority", () => {
    const records = [
      ...identityCollaboratorInvitationGrantPolicyRecords(),
      accountPolicyRecord("account-policy:terms", {
        policyDocumentUrl: "https://example.com/legal/terms",
      }),
      principalPolicyAcceptanceRecord("principal-policy-acceptance:ordinary-terms", {
        principal: "principal:ordinary",
      }),
    ];

    expect(
      validateIdentityControlPlaneRecords("Identity records", records, {
        authorizationRoles: testAuthorizationRoles,
      }),
    ).toBeUndefined();
    expect(
      resolveIdentityCollaboratorInvitationGrantAuthority(
        records,
        "principal:ordinary",
        testAuthorizationRoles,
      ),
    ).toEqual({
      instanceOwner: false,
      principalId: "principal:ordinary",
      programAdministrator: false,
    });
    expect(() =>
      validateIdentityCollaboratorInvitationGrants("Collaborator invitation grants", {
        authorizationRoles: testAuthorizationRoles,
        grantRecords: [invitedPrincipalGrantRecord()],
        inviterPrincipalId: "principal:ordinary",
        records,
      }),
    ).toThrow("requires current instance owner or Program administrator authority");

    const policy = records.find((record) => record.entity === "account-policy");
    const acceptance = records.find((record) => record.entity === "principal-policy-acceptance");

    expect(policy?.values).toEqual({
      displayName: "Terms of service",
      policyContentRef: "site:terms",
      policyDocumentUrl: "https://example.com/legal/terms",
      policyKey: "terms",
      publishedAt: testNow,
      scopeKind: "instance",
      status: "active",
      version: "2026-07",
    });
    expect(acceptance?.values).toEqual({
      acceptedAt: testNow,
      accountPolicy: "account-policy:terms",
      principal: "principal:ordinary",
      status: "accepted",
    });
  });

  it("resolves and accepts owner collaborator invitation grant authority", () => {
    const records = identityCollaboratorInvitationGrantPolicyRecords();
    const grantRecords = [
      invitedPrincipalGrantRecord(),
      invitedPrincipalEmailGrantRecord(),
      membershipRecord("membership:invitee-acme", {
        principal: "principal:invitee",
        status: "invited",
        targetGroup: undefined,
        targetKind: "organization",
        targetOrganization: "organization:acme",
      }),
      roleAssignmentRecord("role-assignment:invitee-owner", {
        role: "role:instance.owner",
        targetPrincipal: "principal:invitee",
      }),
      roleAssignmentRecord("role-assignment:invitee-org-editor", {
        appInstallId: undefined,
        role: "role:app.editor",
        scopeKind: "organization",
        scopeOrganization: "organization:acme",
        targetPrincipal: "principal:invitee",
      }),
      appRegistrationRecord("app-registration:site-invitee", {
        selectedOrganization: undefined,
        targetPrincipal: "principal:invitee",
      }),
    ];

    expect(
      resolveIdentityCollaboratorInvitationGrantAuthority(
        records,
        "principal:owner",
        testAuthorizationRoles,
      ),
    ).toEqual({
      instanceOwner: true,
      principalId: "principal:owner",
      programAdministrator: false,
    });
    expect(
      validateIdentityCollaboratorInvitationGrants("Collaborator invitation grants", {
        authorizationRoles: testAuthorizationRoles,
        grantRecords,
        inviterPrincipalId: "principal:owner",
        records,
      }),
    ).toEqual({
      instanceOwner: true,
      principalId: "principal:owner",
      programAdministrator: false,
    });
  });

  it("accepts Program administrator collaborator invitation grant authority for non-owner grants", () => {
    const records = identityCollaboratorInvitationGrantPolicyRecords();
    const grantRecords = [
      invitedPrincipalGrantRecord(),
      invitedPrincipalEmailGrantRecord(),
      appRegistrationRecord("app-registration:site-invitee", {
        selectedOrganization: undefined,
        targetPrincipal: "principal:invitee",
      }),
      programRoleAssignmentRecord("program-role-assignment:invitee-admin", {
        principal: "principal:invitee",
        roleId: testAuthorizationRoles[2].id,
      }),
      roleAssignmentRecord("role-assignment:invitee-app-editor", {
        role: "role:app.editor",
        scopeKind: "app-install",
        appInstallId: "site",
        targetPrincipal: "principal:invitee",
      }),
    ];

    expect(
      validateIdentityCollaboratorInvitationGrants("Collaborator invitation grants", {
        authorizationRoles: testAuthorizationRoles,
        grantRecords,
        inviterPrincipalId: "principal:admin",
        records,
      }),
    ).toEqual({
      instanceOwner: false,
      principalId: "principal:admin",
      programAdministrator: true,
    });
  });

  it("rejects collaborator invitation grants from non-admin principals", () => {
    expect(() =>
      validateIdentityCollaboratorInvitationGrants("Collaborator invitation grants", {
        authorizationRoles: testAuthorizationRoles,
        grantRecords: [invitedPrincipalGrantRecord()],
        inviterPrincipalId: "principal:ordinary",
        records: identityCollaboratorInvitationGrantPolicyRecords(),
      }),
    ).toThrow("requires current instance owner or Program administrator authority");
  });

  it("rejects collaborator invitation grants from stale or disabled inviter principals", () => {
    const records = identityCollaboratorInvitationGrantPolicyRecords();

    expect(() =>
      validateIdentityCollaboratorInvitationGrants("Collaborator invitation grants", {
        authorizationRoles: testAuthorizationRoles,
        grantRecords: [invitedPrincipalGrantRecord()],
        inviterPrincipalId: "principal:missing",
        records,
      }),
    ).toThrow("requires an active inviter principal");
    expect(() =>
      validateIdentityCollaboratorInvitationGrants("Collaborator invitation grants", {
        authorizationRoles: testAuthorizationRoles,
        grantRecords: [invitedPrincipalGrantRecord()],
        inviterPrincipalId: "principal:disabled",
        records,
      }),
    ).toThrow("requires an active inviter principal");
  });

  it("rejects collaborator invitation grants after current role authority is removed", () => {
    const records = identityCollaboratorInvitationGrantPolicyRecords({
      removedAdminAuthority: true,
    });

    expect(
      resolveIdentityCollaboratorInvitationGrantAuthority(
        records,
        "principal:admin",
        testAuthorizationRoles,
      ),
    ).toEqual({
      instanceOwner: false,
      principalId: "principal:admin",
      programAdministrator: false,
    });
    expect(() =>
      validateIdentityCollaboratorInvitationGrants("Collaborator invitation grants", {
        authorizationRoles: testAuthorizationRoles,
        grantRecords: [invitedPrincipalGrantRecord()],
        inviterPrincipalId: "principal:admin",
        records,
      }),
    ).toThrow("requires current instance owner or Program administrator authority");
  });

  it("rejects Program administrator collaborator invitation role and membership grants outside policy", () => {
    const records = identityCollaboratorInvitationGrantPolicyRecords();

    expect(() =>
      validateIdentityCollaboratorInvitationGrants("Collaborator invitation grants", {
        authorizationRoles: testAuthorizationRoles,
        grantRecords: [
          roleAssignmentRecord("role-assignment:invitee-owner", {
            role: "role:instance.owner",
            targetPrincipal: "principal:invitee",
          }),
        ],
        inviterPrincipalId: "principal:admin",
        records,
      }),
    ).toThrow("cannot grant instance.owner with Program administrator authority");
    expect(() =>
      validateIdentityCollaboratorInvitationGrants("Collaborator invitation grants", {
        authorizationRoles: testAuthorizationRoles,
        grantRecords: [
          roleAssignmentRecord("role-assignment:invitee-org-editor", {
            appInstallId: undefined,
            role: "role:app.editor",
            scopeKind: "organization",
            scopeOrganization: "organization:acme",
            targetPrincipal: "principal:invitee",
          }),
        ],
        inviterPrincipalId: "principal:admin",
        records,
      }),
    ).toThrow("cannot grant organization-scoped roles with Program administrator authority");
    expect(() =>
      validateIdentityCollaboratorInvitationGrants("Collaborator invitation grants", {
        authorizationRoles: testAuthorizationRoles,
        grantRecords: [
          membershipRecord("membership:invitee-acme", {
            principal: "principal:invitee",
            status: "invited",
            targetGroup: undefined,
            targetKind: "organization",
            targetOrganization: "organization:acme",
          }),
        ],
        inviterPrincipalId: "principal:admin",
        records,
      }),
    ).toThrow("cannot grant collaborator memberships with Program administrator authority");
  });
});
function operation<T extends { key: string }>(
  definitions: readonly T[] | undefined,
  key: string,
): T {
  const value = definitions?.find((definition) => definition.key === key);
  if (!value) {
    throw new Error(`Missing operation "${key}".`);
  }
  return value;
}
const testNow = "2026-06-26T00:00:00.000Z";
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

function identityCollaboratorInvitationGrantPolicyRecords(
  options: {
    removedAdminAuthority?: boolean;
  } = {},
): StoredRecord[] {
  return [
    identityRecord("principal", "principal:owner", {
      displayName: "Owner",
      kind: "human",
      status: "active",
    }),
    identityRecord("principal", "principal:admin", {
      displayName: "Admin",
      kind: "human",
      status: "active",
    }),
    identityRecord("principal", "principal:ordinary", {
      displayName: "Ordinary",
      kind: "human",
      status: "active",
    }),
    identityRecord("principal", "principal:disabled", {
      displayName: "Disabled",
      kind: "human",
      status: "disabled",
    }),
    identityRecord("organization", "organization:acme", {
      displayName: "Acme",
      status: "active",
    }),
    identityRecord("group", "group:operators", {
      displayName: "Operators",
      status: "active",
    }),
    ...builtInRoleRecords(),
    roleAssignmentRecord("role-assignment:owner-owner", {
      role: "role:instance.owner",
      targetPrincipal: "principal:owner",
    }),
    {
      ...programRoleAssignmentRecord("program-role-assignment:admin-admin", {
        principal: "principal:admin",
        roleId: testAuthorizationRoles[2].id,
      }),
      ...(options.removedAdminAuthority === true ? { deletedAt: testNow } : {}),
    },
    roleAssignmentRecord("role-assignment:disabled-owner", {
      role: "role:instance.owner",
      targetPrincipal: "principal:disabled",
    }),
  ];
}

function invitedPrincipalGrantRecord(): StoredRecord {
  return identityRecord("principal", "principal:invitee", {
    displayName: "Invitee",
    kind: "human",
    status: "invited",
  });
}

function invitedPrincipalEmailGrantRecord(): StoredRecord {
  return principalEmailRecord("principal-email:invitee", {
    principal: "principal:invitee",
    displayEmail: "invitee@example.com",
    normalizedEmail: "invitee@example.com",
  });
}

function builtInRoleRecords(): StoredRecord[] {
  return identityControlPlaneRoleKeys.map((roleKey) =>
    identityRecord("role", `role:${roleKey}`, {
      displayLabel: roleKey,
      key: roleKey,
      status: "active",
    }),
  );
}

function identityStorageSnapshot(overrides: Partial<StorageSnapshot> = {}): StorageSnapshot {
  const records = identityRecords();

  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY,
    schemaKey: IDENTITY_CONTROL_PLANE_SCHEMA_KEY,
    exportedAt: testNow,
    schemaUpdatedAt: testNow,
    sourceCursor: records.length,
    schema: identityControlPlaneSchema,
    records,
    ...overrides,
  };
}

function identityRecords(): StoredRecord[] {
  return [
    identityRecord("principal", "principal:ada", {
      displayName: "Ada Lovelace",
      kind: "human",
      status: "active",
    }),
    identityRecord("principal", "principal:grace", {
      displayName: "Grace Hopper",
      kind: "human",
      status: "active",
    }),
    principalEmailRecord("principal-email:ada", {
      principal: "principal:ada",
      displayEmail: "Ada@example.com",
      normalizedEmail: "ada@example.com",
    }),
    identityRecord("group", "group:operators", {
      displayName: "Operators",
      status: "active",
    }),
    identityRecord("organization", "organization:acme", {
      displayName: "Acme",
      status: "active",
    }),
    membershipRecord("membership:ada-group"),
    roleRecord("role:owner", {
      displayLabel: "Owner",
      key: "instance.owner",
    }),
    roleAssignmentRecord("role-assignment:ada-owner"),
    appRegistrationRecord("app-registration:site-ada"),
    invitationRecord("invitation:ada"),
    accountPolicyRecord("account-policy:terms"),
    principalPolicyAcceptanceRecord("principal-policy-acceptance:ada-terms"),
  ];
}

function principalEmailRecord(
  id: string,
  values: {
    displayEmail: string;
    normalizedEmail: string;
    principal: string;
  },
): StoredRecord {
  return identityRecord("principal-email", id, {
    displayEmail: values.displayEmail,
    normalizedEmail: values.normalizedEmail,
    principal: values.principal,
    primary: false,
    recovery: false,
    verificationStatus: "verified",
    verifiedAt: testNow,
  });
}

function membershipRecord(
  id: string,
  overrides: Record<string, string | undefined> = {},
): StoredRecord {
  return identityRecord(
    "membership",
    id,
    omitUndefined({
      principal: "principal:ada",
      targetGroup: "group:operators",
      targetKind: "group",
      status: "active",
      ...overrides,
    }),
  );
}

function roleRecord(
  id: string,
  values: {
    displayLabel: string;
    key: string;
  },
): StoredRecord {
  return identityRecord("role", id, {
    displayLabel: values.displayLabel,
    key: values.key,
    status: "active",
  });
}

function roleAssignmentRecord(
  id: string,
  overrides: Record<string, string | undefined> = {},
): StoredRecord {
  return identityRecord(
    "role-assignment",
    id,
    omitUndefined({
      role: "role:owner",
      targetKind: "principal",
      targetPrincipal: "principal:ada",
      scopeKind: "instance",
      status: "active",
      ...overrides,
    }),
  );
}

function programRoleAssignmentRecord(
  id: string,
  overrides: Record<string, string | undefined> = {},
): StoredRecord {
  return identityRecord(
    "program-role-assignment",
    id,
    omitUndefined({
      principal: "principal:ada",
      roleId: testAuthorizationRoles[0].id,
      status: "active",
      ...overrides,
    }),
  );
}

function appRegistrationRecord(
  id: string,
  overrides: Record<string, string | undefined> = {},
): StoredRecord {
  return identityRecord(
    "app-registration",
    id,
    omitUndefined({
      appInstallId: "site",
      targetKind: "principal",
      targetPrincipal: "principal:ada",
      selectedOrganization: "organization:acme",
      status: "active",
      ...overrides,
    }),
  );
}

function invitationRecord(
  id: string,
  overrides: Record<string, string | undefined> = {},
): StoredRecord {
  return identityRecord(
    "invitation",
    id,
    omitUndefined({
      acceptedAt: undefined,
      expiresAt: "2026-07-26T00:00:00.000Z",
      invitedPrincipal: "principal:ada",
      inviterPrincipal: "principal:grace",
      status: "pending",
      targetAppInstallId: "site",
      targetEmail: "ada@example.com",
      targetSurface: "app-install",
      ...overrides,
    }),
  );
}

function accountPolicyRecord(
  id: string,
  overrides: Record<string, string | undefined> = {},
): StoredRecord {
  return identityRecord(
    "account-policy",
    id,
    omitUndefined({
      appInstallId: undefined,
      displayName: "Terms of service",
      policyContentRef: "site:terms",
      policyDocumentUrl: undefined,
      policyKey: "terms",
      publishedAt: testNow,
      scopeKind: "instance",
      scopeOrganization: undefined,
      status: "active",
      version: "2026-07",
      ...overrides,
    }),
  );
}

function principalPolicyAcceptanceRecord(
  id: string,
  overrides: Record<string, string | undefined> = {},
): StoredRecord {
  return identityRecord(
    "principal-policy-acceptance",
    id,
    omitUndefined({
      acceptedAt: testNow,
      accountPolicy: "account-policy:terms",
      principal: "principal:ada",
      status: "accepted",
      ...overrides,
    }),
  );
}

function identityRecord(
  entity: string,
  id: string,
  values: Record<string, boolean | number | string>,
): StoredRecord {
  return {
    id,
    entity,
    values,
    createdAt: testNow,
    updatedAt: testNow,
  };
}

function replaceRecord(records: StoredRecord[], replacement: StoredRecord): StoredRecord[] {
  return records.map((record) => (record.id === replacement.id ? replacement : record));
}
function definitionRecord<Definition extends { key: string }>(
  definitions: readonly Definition[],
): Record<string, Omit<Definition, "key">> {
  return Object.fromEntries(
    definitions.map(({ key, ...definition }) => [key, definition]),
  ) as Record<string, Omit<Definition, "key">>;
}
function omitUndefined<T extends Record<string, string | undefined>>(values: T) {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}
