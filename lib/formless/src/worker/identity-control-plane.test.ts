import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_PATH,
  IDENTITY_ACCESS_PERSON_REMOVAL_API_PATH,
  IDENTITY_ACCESS_PERSON_ROLE_REPLACEMENT_API_PATH,
  IDENTITY_COLLABORATOR_INVITATION_REVOKE_API_PATH,
  IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX,
  identityControlPlaneRoleKeys,
  type IdentityCollaboratorInvitationRevokeErrorResponse,
  type IdentityCollaboratorInvitationRevokeResponse,
  type IdentityAccessManagementSummary,
  type IdentityAccessPersonMutationErrorResponse,
  type IdentityAccessPersonRemovalResponse,
  type IdentityAccessPersonRoleReplacementResponse,
} from "@dpeek/formless-identity-control-plane";
import { formlessProgramSchema } from "../program/runtime.ts";
import {
  FORMLESS_PROGRAM_API_ROUTE_PREFIX,
  FORMLESS_PROGRAM_SCHEMA_KEY,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
  formlessProgramSchemaProvenance,
} from "../program/target.ts";
import {
  STORAGE_SNAPSHOT_KIND,
  STORAGE_SNAPSHOT_VERSION,
  formatStoredRecordsForArtifact,
} from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import type { EmailDeliveryRecord } from "../shared/email-runtime.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import { FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER } from "../shared/protocol.ts";
import type { BootstrapResponse, OwnerIdentity, SchemaResponse } from "../shared/protocol.ts";
import {
  COLLABORATOR_INVITATION_ACCEPT_PATH,
  type CollaboratorInvitationAcceptanceStatusResponse,
} from "../shared/instance-auth.ts";
import {
  LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
} from "@dpeek/formless-gateway";
import { recordOperationRequest } from "../test/authority-write.ts";
import { ensureTestIdentityOwner, resetTestIdentityStorage } from "../test/identity-owner.ts";
import {
  INTERNAL_IDENTITY_APP_AUTHORITY_PATH,
  INTERNAL_IDENTITY_PRINCIPAL_AUTHORITY_PATH,
  type ActiveIdentityAppAuthority,
  type ActiveIdentityAuthority,
} from "./identity-owner-internal.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { createOwnerSessionCookie } from "./owner-session.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";
const identityApi = IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX;
const controlPlaneApi = FORMLESS_PROGRAM_API_ROUTE_PREFIX;
const authOrigin = "https://auth.example.com";
const ownerEmail = "ada@example.com";
const owner: OwnerIdentity = {
  id: "owner-1",
  name: "Ada Owner",
  email: ownerEmail,
  createdAt: "2026-06-09T00:00:00.000Z",
};

type CollaboratorInvitationTestResponse = {
  delivery?:
    | {
        delivery: EmailDeliveryRecord;
        queued: boolean;
        replayed: boolean;
        status: "scheduled";
      }
    | {
        reason: string;
        status: "skipped";
      };
  error?: string;
  invitation: StoredRecord;
  records: StoredRecord[];
  status: "committed" | "replayed";
};

type CollaboratorInvitationRevokeTestResponse =
  | IdentityCollaboratorInvitationRevokeResponse
  | IdentityCollaboratorInvitationRevokeErrorResponse;

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  await resetKnownState();
});

afterAll(async () => {
  await harness.dispose();
});

function createHarness() {
  return createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        FORMLESS_INSTANCE_AUTH_ORIGIN: authOrigin,
        FORMLESS_RUNTIME_PROFILE: "instance",
        [LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV]: "identity-local-bootstrap-token",
        [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: "identity-local-proxy-token",
        [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]: "http://127.0.0.1:4555",
      },
      queueProducers: {
        FORMLESS_EMAIL_DELIVERY_QUEUE: "formless-email-delivery",
      },
    },
  );
}

describe("identity control-plane API routes", () => {
  it("requires owner or admin authorization and bootstraps built-in role records", async () => {
    const anonymous = await harness.fetch(`${controlPlaneApi}/bootstrap`);
    const admin = await getJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);
    const ownerRead = await getOwnerJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);
    const ownerSchema = await getJson<SchemaResponse>(`${controlPlaneApi}/schema`);

    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
    expect(await anonymous.json()).toEqual({
      error:
        "Current Program member, owner, or admin authorization is required for this read endpoint.",
    });
    expect(admin.body.schema).toEqual(formlessProgramSchema);
    expect(admin.body.schemaProvenance).toEqual(formlessProgramSchemaProvenance);
    expect(admin.body.records).toEqual(builtInRoleRecords());
    expect(admin.body.cursor).toBe(identityControlPlaneRoleKeys.length);
    expect(admin.response.headers.get(FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER)).toBe(
      formlessProgramSchemaProvenance.sourceSchemaHash,
    );
    expect(ownerRead.body.records).toEqual(expect.arrayContaining(admin.body.records));
    expect(ownerRead.body.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: "principal",
          values: expect.objectContaining({
            displayName: owner.name,
            status: "active",
          }),
        }),
        expect.objectContaining({
          entity: "role-assignment",
          values: expect.objectContaining({
            role: "role:instance.owner",
            status: "active",
          }),
        }),
      ]),
    );
    expect(ownerSchema.body.schema).toEqual(formlessProgramSchema);
    expect(ownerSchema.body.schemaProvenance).toEqual(formlessProgramSchemaProvenance);
    expect(ownerSchema.response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("reconciles required role records without advancing an unchanged write log", async () => {
    const first = await getJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);
    const second = await getJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);

    expect(second.body.cursor).toBe(first.body.cursor);
    expect(
      second.body.records.filter((record) => record.entity === "role").map((record) => record.id),
    ).toEqual(identityControlPlaneRoleKeys.map((roleKey) => `role:${roleKey}`));
  });

  it("exports identity control-plane storage snapshots with the identity storage boundary", async () => {
    const bootstrap = await getJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);
    const snapshot = await getJson<StorageSnapshot>(`${controlPlaneApi}/snapshot`);

    expect(snapshot.body).toMatchObject({
      kind: STORAGE_SNAPSHOT_KIND,
      version: STORAGE_SNAPSHOT_VERSION,
      storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
      schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
      exportedAt: expect.any(String),
      schemaUpdatedAt: bootstrap.body.schemaUpdatedAt,
      sourceCursor: bootstrap.body.cursor,
      schema: formlessProgramSchema,
    });
    expect(snapshot.body.records).toEqual(
      formatStoredRecordsForArtifact(formlessProgramSchema, bootstrap.body.records),
    );
  });

  it("rejects duplicate selected-target role assignments through runtime writes", async () => {
    const principal = await postRecordOperation({
      entity: "principal",
      idempotencyKey: "create-principal-ada",
      operationName: "create",
      input: {
        displayName: "Ada Owner",
        kind: "human",
        status: "active",
      },
    });
    const input = {
      role: "role:instance.owner",
      targetKind: "principal",
      targetPrincipal: principal.id,
      scopeKind: "instance",
      status: "active",
    };
    const first = await postRecordOperation({
      entity: "role-assignment",
      idempotencyKey: "assign-ada-owner",
      operationName: "create",
      input,
    });
    const duplicate = await postRecordOperationResponse({
      entity: "role-assignment",
      idempotencyKey: "assign-ada-owner-duplicate",
      operationName: "create",
      input,
    });

    expect(first.values).toEqual(input);
    expect(duplicate.response.status).toBe(400);
    expect(duplicate.body).toEqual({
      error: expect.stringContaining(
        'violates identity uniqueness "auth:role-assignment.uniqueActiveAssignment"',
      ),
    });
  });

  it("creates owner-authorized collaborator invitation record sets and replays by idempotency", async () => {
    await createInstalledApp("site", "Site");
    const ownerSession = await createOwnerSessionHeaders();
    const ownerHeaders = ownerSession.headers;
    const organization = await postRecordOperation({
      entity: "organization",
      idempotencyKey: "create-organization-acme",
      operationName: "create",
      input: {
        displayName: "Acme",
        status: "active",
      },
    });

    const input = {
      idempotencyKey: "invite-ada-collaborator",
      invitationId: "invitation:ada",
      targetEmail: "Ada.Collab@Example.COM",
      targetSurface: "organization",
      targetOrganization: organization.id,
      now: "2999-01-01T00:00:00.000Z",
      invitedPrincipal: {
        id: "principal:ada",
        displayName: "Ada Collaborator",
      },
      principalEmail: {
        id: "principal-email:ada",
        primary: true,
        recovery: false,
      },
      memberships: [
        {
          id: "membership:ada-acme",
          targetKind: "organization",
          targetOrganization: organization.id,
        },
      ],
      roleAssignments: [
        {
          id: "role-assignment:ada-app-editor",
          roleKey: "app.editor",
          scopeKind: "app-install",
          appInstallId: "site",
        },
        {
          id: "role-assignment:ada-organization-viewer",
          roleKey: "app.viewer",
          scopeKind: "organization",
          scopeOrganization: organization.id,
        },
      ],
      appRegistrations: [
        {
          id: "app-registration:site-ada",
          appInstallId: "site",
          selectedOrganization: organization.id,
        },
      ],
    };
    const created = await postCollaboratorInvitationResponse(input, ownerHeaders);
    const replay = await postCollaboratorInvitationResponse(
      {
        ...input,
        targetEmail: "changed@example.com",
      },
      ownerHeaders,
    );

    expect(created.response.status).toBe(200);
    expect(created.body.status).toBe("committed");
    expect(created.body.records.map((record) => record.entity)).toEqual([
      "principal",
      "principal-email",
      "membership",
      "role-assignment",
      "role-assignment",
      "app-registration",
      "invitation",
    ]);
    expect(created.body.invitation).toMatchObject({
      id: "invitation:ada",
      entity: "invitation",
      values: {
        targetEmail: "Ada.Collab@example.com",
        targetSurface: "organization",
        targetOrganization: organization.id,
        invitedPrincipal: "principal:ada",
        inviterPrincipal: ownerSession.owner.id,
        status: "pending",
        expiresAt: "2999-01-08T00:00:00.000Z",
      },
      createdAt: "2999-01-01T00:00:00.000Z",
      updatedAt: "2999-01-01T00:00:00.000Z",
    });
    expect(recordById(created.body.records, "principal:ada")).toMatchObject({
      entity: "principal",
      values: {
        displayName: "Ada Collaborator",
        kind: "human",
        status: "invited",
      },
    });
    expect(recordById(created.body.records, "principal-email:ada")).toMatchObject({
      entity: "principal-email",
      values: {
        principal: "principal:ada",
        displayEmail: "Ada.Collab@example.com",
        normalizedEmail: "ada.collab@example.com",
        verificationStatus: "unverified",
        primary: true,
        recovery: false,
      },
    });
    expect(recordById(created.body.records, "membership:ada-acme")).toMatchObject({
      entity: "membership",
      values: {
        principal: "principal:ada",
        targetKind: "organization",
        targetOrganization: organization.id,
        status: "invited",
      },
    });
    expect(recordById(created.body.records, "role-assignment:ada-app-editor")).toMatchObject({
      entity: "role-assignment",
      values: {
        role: "role:app.editor",
        targetKind: "principal",
        targetPrincipal: "principal:ada",
        scopeKind: "app-install",
        appInstallId: "site",
        status: "active",
      },
    });
    expect(
      recordById(created.body.records, "role-assignment:ada-organization-viewer"),
    ).toMatchObject({
      entity: "role-assignment",
      values: {
        role: "role:app.viewer",
        targetKind: "principal",
        targetPrincipal: "principal:ada",
        scopeKind: "organization",
        scopeOrganization: organization.id,
        status: "active",
      },
    });
    expect(recordById(created.body.records, "app-registration:site-ada")).toMatchObject({
      entity: "app-registration",
      values: {
        appInstallId: "site",
        targetKind: "principal",
        targetPrincipal: "principal:ada",
        selectedOrganization: organization.id,
        status: "pending",
      },
    });
    expect(JSON.stringify(created.body)).not.toContain("token");
    expect(replay.response.status).toBe(200);
    expect(replay.body.status).toBe("replayed");
    expect(replay.body.invitation).toEqual(created.body.invitation);
  });

  it("schedules collaborator invitation auth email delivery idempotently without issuing sessions", async () => {
    const { authSender } = await configureAuthInvitationEmailDelivery();
    const ownerSession = await createOwnerSessionHeaders();
    const input = {
      idempotencyKey: "invite-delivery-ada",
      invitationId: "invitation:delivery-ada",
      targetEmail: "Ada.Delivery@Example.COM",
      targetSurface: "instance",
      now: "2999-01-01T00:00:00.000Z",
    };
    const created = await postCollaboratorInvitationResponse(input, ownerSession.headers);
    const replay = await postCollaboratorInvitationResponse(input, ownerSession.headers);

    expect(created.response.status).toBe(200);
    expect(created.response.headers.get("Set-Cookie")).toBeNull();
    expect(created.body.delivery).toMatchObject({
      status: "scheduled",
      queued: true,
      replayed: false,
      delivery: {
        canonicalOrigin: "https://auth.example.com",
        idempotencyKey: "invitation:delivery-ada:collaborator-invitation-delivery",
        messageKind: "identity.collaboratorInvitation",
        recipients: [{ address: "Ada.Delivery@example.com" }],
        sender: {
          address: "auth@mail.example.com",
          displayName: "Example Auth",
          id: authSender.id,
        },
        sourceRecordId: "invitation:delivery-ada",
        sourceStorageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
        status: "pending",
      },
    });
    expect(replay.response.status).toBe(200);
    expect(replay.response.headers.get("Set-Cookie")).toBeNull();
    expect(replay.body.delivery).toMatchObject({
      status: "scheduled",
      queued: false,
      replayed: true,
      delivery: {
        id:
          created.body.delivery?.status === "scheduled"
            ? created.body.delivery.delivery.id
            : undefined,
      },
    });
    expect(JSON.stringify([created.body, replay.body])).not.toContain("token");
    expect(JSON.stringify([created.body, replay.body])).not.toContain("session");
  });

  it("commits invitations but skips delivery when auth email configuration is missing", async () => {
    const ownerSession = await createOwnerSessionHeaders();
    const created = await postCollaboratorInvitationResponse(
      {
        idempotencyKey: "invite-missing-auth-email",
        invitationId: "invitation:missing-auth-email",
        targetEmail: "missing-auth-email@example.com",
        targetSurface: "instance",
        now: "2999-01-01T00:00:00.000Z",
      },
      ownerSession.headers,
    );

    expect(created.response.status).toBe(200);
    expect(created.response.headers.get("Set-Cookie")).toBeNull();
    expect(created.body.status).toBe("committed");
    expect(created.body.invitation).toMatchObject({
      id: "invitation:missing-auth-email",
      entity: "invitation",
      values: {
        status: "pending",
        targetEmail: "missing-auth-email@example.com",
      },
    });
    expect(created.body.delivery).toEqual({
      reason: "missing-auth-email-configuration",
      status: "skipped",
    });
    expect(JSON.stringify(created.body)).not.toContain("token");
    expect(JSON.stringify(created.body)).not.toContain("session");
  });

  it("creates admin-authorized collaborator invitations without browser inviter facts", async () => {
    const created = await postCollaboratorInvitationResponse(
      {
        idempotencyKey: "invite-admin-created",
        invitationId: "invitation:admin-created",
        targetEmail: "admin-created@example.com",
        targetSurface: "instance",
        now: "2999-01-01T00:00:00.000Z",
      },
      adminHeaders(),
    );

    expect(created.response.status).toBe(200);
    expect(created.body.invitation).toMatchObject({
      id: "invitation:admin-created",
      entity: "invitation",
      values: {
        targetEmail: "admin-created@example.com",
        targetSurface: "instance",
        status: "pending",
        expiresAt: "2999-01-08T00:00:00.000Z",
      },
    });
    expect(created.body.invitation.values).not.toHaveProperty("inviterPrincipal");
  });

  it("revokes pending collaborator invitations and prevents later acceptance", async () => {
    await configureAuthInvitationEmailDelivery();
    const ownerSession = await createOwnerSessionHeaders();
    const created = await postCollaboratorInvitationResponse(
      {
        idempotencyKey: "invite-revoke-success",
        invitationId: "invitation:revoke-success",
        targetEmail: "revoke-success@example.com",
        targetSurface: "instance",
        now: "2999-01-01T00:00:00.000Z",
      },
      ownerSession.headers,
    );
    const revoked = await postRevokeCollaboratorInvitationResponse(
      {
        invitationId: "invitation:revoke-success",
        now: "2999-01-02T00:00:00.000Z",
      },
      ownerSession.headers,
    );
    const summary = await getAccessSummary(ownerSession.headers);
    const publicAcceptance = await fetchCollaboratorInvitationAcceptanceStatus(
      "invitation:revoke-success",
      "fake-token",
    );

    expect(created.response.status).toBe(200);
    expect(revoked.response.status).toBe(200);
    expect(revoked.body).toEqual({
      invitation: expect.objectContaining({
        invitationId: "invitation:revoke-success",
        status: "revoked",
        targetEmail: "revoke-success@example.com",
        targetSurface: "instance",
      }),
      revokedAt: "2999-01-02T00:00:00.000Z",
      status: "revoked",
    });
    expect(summary.body.invitations).not.toContainEqual(
      expect.objectContaining({ invitationId: "invitation:revoke-success" }),
    );
    const retained = await getJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);
    expect(recordById(retained.body.records, "invitation:revoke-success")).toMatchObject({
      values: {
        status: "revoked",
        targetEmail: "revoke-success@example.com",
        targetSurface: "instance",
      },
    });
    expect(publicAcceptance.response.status).toBe(409);
    expect(publicAcceptance.body).toEqual({
      eligible: false,
      error: "Invitation link is no longer available.",
      reason: "revoked-invitation",
    });
    for (const forbidden of ["challenge", "credential", "secret", "session", "token"]) {
      expect(JSON.stringify(revoked.body)).not.toContain(forbidden);
    }
  });

  it("revokes pending invitations when removing an invited person", async () => {
    await configureAuthInvitationEmailDelivery();
    const ownerSession = await createOwnerSessionHeaders();
    const created = await postCollaboratorInvitationResponse(
      {
        idempotencyKey: "invite-person-removal",
        invitationId: "invitation:person-removal",
        targetEmail: "person-removal@example.com",
        targetSurface: "instance",
        now: "2999-01-01T00:00:00.000Z",
        invitedPrincipal: {
          id: "principal:person-removal",
          displayName: "Person Removal",
        },
      },
      ownerSession.headers,
    );
    const removed = await postIdentityAccessPersonRemovalResponse(
      {
        idempotencyKey: "remove-invited-person",
        now: "2999-01-02T00:00:00.000Z",
        principalId: "principal:person-removal",
      },
      ownerSession.headers,
    );
    const summary = await getAccessSummary(ownerSession.headers);
    const retained = await getJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);
    const publicAcceptance = await fetchCollaboratorInvitationAcceptanceStatus(
      "invitation:person-removal",
      "fake-token",
    );
    const retainedInvitation = recordById(retained.body.records, "invitation:person-removal");

    expect(created.response.status).toBe(200);
    expect(removed.response.status).toBe(200);
    expect(removed.body).toMatchObject({
      person: {
        principalId: "principal:person-removal",
        status: "disabled",
      },
      removedAt: "2999-01-02T00:00:00.000Z",
      status: "disabled",
    });
    expect(summary.body.people).not.toContainEqual(
      expect.objectContaining({ principalId: "principal:person-removal" }),
    );
    expect(summary.body.invitations).not.toContainEqual(
      expect.objectContaining({ invitationId: "invitation:person-removal" }),
    );
    expect(recordById(retained.body.records, "principal:person-removal")).toMatchObject({
      values: { status: "disabled" },
    });
    expect(retainedInvitation).toMatchObject({
      values: {
        invitedPrincipal: "principal:person-removal",
        status: "revoked",
      },
    });
    expect(retainedInvitation.deletedAt).toBeUndefined();
    expect(publicAcceptance.response.status).toBe(409);
    expect(publicAcceptance.body).toEqual({
      eligible: false,
      error: "Invitation link is no longer available.",
      reason: "revoked-invitation",
    });
  });

  it("rejects unauthorized collaborator invitation revocation before identity writes", async () => {
    const ownerSession = await createOwnerSessionHeaders();
    const created = await postCollaboratorInvitationResponse(
      {
        idempotencyKey: "invite-revoke-unauthorized",
        invitationId: "invitation:revoke-unauthorized",
        targetEmail: "revoke-unauthorized@example.com",
        targetSurface: "instance",
        now: "2999-01-01T00:00:00.000Z",
      },
      ownerSession.headers,
    );
    const rejected = await postRevokeCollaboratorInvitationResponse(
      {
        invitationId: "invitation:revoke-unauthorized",
        now: "2999-01-02T00:00:00.000Z",
      },
      {},
    );
    const summary = await getAccessSummary(ownerSession.headers);

    expect(created.response.status).toBe(200);
    expect(rejected.response.status).toBe(401);
    expect(rejected.response.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
    expect(rejected.body).toEqual({
      error:
        "Owner session, Program administrator session, or admin authorization is required for this endpoint.",
    });
    expect(summary.body.invitations).toContainEqual(
      expect.objectContaining({
        invitationId: "invitation:revoke-unauthorized",
        status: "pending",
      }),
    );
  });

  it("rejects missing and non-pending collaborator invitation revocation before identity writes", async () => {
    const ownerSession = await createOwnerSessionHeaders();
    const accepted = await postCollaboratorInvitationResponse(
      {
        idempotencyKey: "invite-revoke-accepted",
        invitationId: "invitation:revoke-accepted",
        targetEmail: "revoke-accepted@example.com",
        targetSurface: "instance",
        now: "2999-01-01T00:00:00.000Z",
      },
      ownerSession.headers,
    );
    const expired = await postCollaboratorInvitationResponse(
      {
        idempotencyKey: "invite-revoke-expired",
        invitationId: "invitation:revoke-expired",
        targetEmail: "revoke-expired@example.com",
        targetSurface: "instance",
        now: "2999-01-01T00:00:00.000Z",
      },
      ownerSession.headers,
    );
    await postRecordOperation({
      entity: "invitation",
      idempotencyKey: "mark-revoke-accepted",
      operationName: "update",
      recordId: "invitation:revoke-accepted",
      input: {
        acceptedAt: "2999-01-02T00:00:00.000Z",
        status: "accepted",
      },
    });

    const missingRevoke = await postRevokeCollaboratorInvitationResponse(
      {
        invitationId: "invitation:missing-revoke",
        now: "2999-01-02T00:00:00.000Z",
      },
      ownerSession.headers,
    );
    const acceptedRevoke = await postRevokeCollaboratorInvitationResponse(
      {
        invitationId: "invitation:revoke-accepted",
        now: "2999-01-02T00:00:00.000Z",
      },
      ownerSession.headers,
    );
    const expiredRevoke = await postRevokeCollaboratorInvitationResponse(
      {
        invitationId: "invitation:revoke-expired",
        now: "2999-03-01T00:00:00.000Z",
      },
      ownerSession.headers,
    );

    expect(accepted.response.status).toBe(200);
    expect(expired.response.status).toBe(200);
    expect(missingRevoke.response.status).toBe(404);
    expect(missingRevoke.body).toEqual({
      error: "Invitation could not be found.",
      reason: "missing-invitation",
    });
    expect(acceptedRevoke.response.status).toBe(409);
    expect(acceptedRevoke.body).toEqual({
      error: "Invitation has already been accepted.",
      reason: "accepted-invitation",
    });
    expect(expiredRevoke.response.status).toBe(410);
    expect(expiredRevoke.body).toEqual({
      error: "Invitation has expired.",
      reason: "expired-invitation",
    });

    const firstRevoke = await postRevokeCollaboratorInvitationResponse(
      {
        invitationId: "invitation:revoke-expired",
        now: "2999-01-02T00:00:00.000Z",
      },
      ownerSession.headers,
    );
    const secondRevoke = await postRevokeCollaboratorInvitationResponse(
      {
        invitationId: "invitation:revoke-expired",
        now: "2999-01-02T00:00:00.000Z",
      },
      ownerSession.headers,
    );

    expect(firstRevoke.response.status).toBe(200);
    expect(secondRevoke.response.status).toBe(409);
    expect(secondRevoke.body).toEqual({
      error: "Invitation has already been revoked.",
      reason: "revoked-invitation",
    });
  });

  it("creates Program administrator browser collaborator invitations and keeps raw identity writes owner-only", async () => {
    await createInstalledApp("site", "Site");
    const adminPrincipal = await createIdentityPrincipal("Invite Program Administrator");
    await assignIdentityProgramRole(adminPrincipal.id, "administrator");

    const adminSessionHeaders = { Cookie: await ownerCookieForPrincipal(adminPrincipal.id) };
    const rawWrite = await postRecordOperationResponse(
      {
        entity: "principal",
        idempotencyKey: "Program-administrator-raw-principal-create",
        operationName: "create",
        input: {
          displayName: "Raw Write Should Fail",
          kind: "human",
          status: "active",
        },
      },
      adminSessionHeaders,
    );
    const created = await postCollaboratorInvitationResponse(
      {
        idempotencyKey: "invite-Program-administrator-scoped",
        invitationId: "invitation:Program-administrator-scoped",
        targetEmail: "Program-administrator-scoped@example.com",
        now: "2999-01-01T00:00:00.000Z",
        invitedPrincipal: {
          id: "principal:Program-administrator-scoped",
          displayName: "Scoped Collaborator",
        },
        principalEmail: {
          id: "principal-email:Program-administrator-scoped",
          primary: true,
          recovery: false,
        },
        roleAssignments: [
          {
            id: "role-assignment:Program-administrator-scoped-viewer",
            roleKey: "app.viewer",
            scopeKind: "app-install",
            appInstallId: "site",
          },
        ],
      },
      adminSessionHeaders,
    );

    expect(rawWrite.response.status).toBe(401);
    expect(rawWrite.body).toEqual({
      error: "Current Program operation access is required for this endpoint.",
    });
    expect(created.response.status).toBe(200);
    expect(created.body.status).toBe("committed");
    expect(created.body.invitation).toMatchObject({
      id: "invitation:Program-administrator-scoped",
      entity: "invitation",
      values: {
        targetEmail: "Program-administrator-scoped@example.com",
        targetSurface: "app-install",
        targetAppInstallId: "site",
        invitedPrincipal: "principal:Program-administrator-scoped",
        inviterPrincipal: adminPrincipal.id,
        status: "pending",
      },
    });
    const viewerAssignment = recordById(
      created.body.records,
      "role-assignment:Program-administrator-scoped-viewer",
    );

    expect(viewerAssignment).toMatchObject({
      entity: "role-assignment",
      values: {
        role: "role:app.viewer",
        targetKind: "principal",
        targetPrincipal: "principal:Program-administrator-scoped",
        scopeKind: "app-install",
        appInstallId: "site",
        status: "active",
      },
    });
    expect(created.body.records).toContainEqual(
      expect.objectContaining({
        entity: "app-registration",
        values: {
          appInstallId: "site",
          targetKind: "principal",
          targetPrincipal: "principal:Program-administrator-scoped",
          status: "pending",
        },
      }),
    );
  });

  it("atomically replaces owner-authorized person roles and immediately narrows authority", async () => {
    const ownerSession = await createOwnerSessionHeaders();
    const principal = await createIdentityPrincipal("Access Role Replacement");
    const siteViewer = await postRecordOperation({
      entity: "role-assignment",
      idempotencyKey: "assign-access-replacement-site-viewer",
      operationName: "create",
      input: {
        appInstallId: "site",
        role: "role:app.viewer",
        scopeKind: "app-install",
        status: "active",
        targetKind: "principal",
        targetPrincipal: principal.id,
      },
    });
    const tasksViewer = await postRecordOperation({
      entity: "role-assignment",
      idempotencyKey: "assign-access-replacement-tasks-viewer-disabled",
      operationName: "create",
      input: {
        appInstallId: "tasks",
        role: "role:app.viewer",
        scopeKind: "app-install",
        status: "disabled",
        targetKind: "principal",
        targetPrincipal: principal.id,
      },
    });
    const replaced = await postIdentityAccessPersonRoleReplacementResponse(
      {
        idempotencyKey: "replace-access-person-roles",
        now: "2999-01-02T00:00:00.000Z",
        principalId: principal.id,
        roles: [
          {
            roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357",
            scopeKind: "program",
          },
          {
            appInstallId: "site",
            roleKey: "app.editor",
            scopeKind: "app-install",
          },
          {
            appInstallId: "tasks",
            roleKey: "app.viewer",
            scopeKind: "app-install",
          },
        ],
      },
      ownerSession.headers,
    );

    expect(replaced.response.status).toBe(200);
    expect(replaced.body).toMatchObject({
      principalId: principal.id,
      status: "committed",
    });
    expect("programRoles" in replaced.body ? replaced.body.programRoles : []).toEqual([
      expect.objectContaining({
        roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357",
        scopeKind: "program",
      }),
    ]);
    expect("roles" in replaced.body ? replaced.body.roles : []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          appInstallId: "site",
          roleKey: "app.editor",
          scopeKind: "app-install",
        }),
        expect.objectContaining({
          appInstallId: "tasks",
          roleAssignmentId: tasksViewer.id,
          roleKey: "app.viewer",
          status: "active",
        }),
      ]),
    );
    expect(await readPrincipalAuthority(principal.id)).toEqual({
      callerFacts: {
        active: true,
        kind: "principal",
        owner: false,
        roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357",
      },
      id: principal.id,
    });

    const afterReplacement = await getJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);

    expect(recordById(afterReplacement.body.records, siteViewer.id).values.status).toBe("disabled");
    expect(recordById(afterReplacement.body.records, tasksViewer.id).values.status).toBe("active");

    const conflicting = await postIdentityAccessPersonRoleReplacementResponse(
      {
        idempotencyKey: "reject-conflicting-access-person-roles",
        principalId: principal.id,
        roles: [
          { roleId: "role_de3ae092-31a9-49df-b7f6-9f51f9403ff9", scopeKind: "program" },
          { roleId: "role_3e6f3057-22bf-4fb0-8bd5-7b61bb0f45c4", scopeKind: "program" },
        ],
      },
      ownerSession.headers,
    );

    expect(conflicting.response.status).toBe(400);
    expect(conflicting.body).toEqual({
      error: "A person may have only one active role level for each access surface.",
      reason: "invalid-role-selection",
    });
    expect(await readPrincipalAuthority(principal.id)).toEqual({
      callerFacts: {
        active: true,
        kind: "principal",
        owner: false,
        roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357",
      },
      id: principal.id,
    });

    const narrowed = await postIdentityAccessPersonRoleReplacementResponse(
      {
        idempotencyKey: "remove-access-person-roles",
        principalId: principal.id,
        roles: [],
      },
      ownerSession.headers,
    );
    const staleAccess = await getAccessSummaryResponse({
      Cookie: await ownerCookieForPrincipal(principal.id),
    });

    expect(narrowed.response.status).toBe(200);
    expect(narrowed.body).toMatchObject({
      principalId: principal.id,
      programRoles: [],
      roles: [],
    });
    expect(await readPrincipalAuthority(principal.id)).toEqual({
      callerFacts: { active: true, kind: "principal", owner: false },
      id: principal.id,
    });
    expect(staleAccess.response.status).toBe(401);
  });

  it("limits Program administrator person mutations to admin and app-install authority", async () => {
    const ownerSession = await createOwnerSessionHeaders();
    const actor = await createIdentityPrincipal("Access Mutation Admin");
    await assignIdentityProgramRole(actor.id, "administrator");
    const target = await createIdentityPrincipal("Access Mutation Target");
    await assignIdentityProgramRole(target.id, "administrator");
    await postRecordOperation({
      entity: "role-assignment",
      idempotencyKey: "assign-access-mutation-target-site-viewer",
      operationName: "create",
      input: {
        appInstallId: "site",
        role: "role:app.viewer",
        scopeKind: "app-install",
        status: "active",
        targetKind: "principal",
        targetPrincipal: target.id,
      },
    });
    const organization = await postRecordOperation({
      entity: "organization",
      idempotencyKey: "create-access-mutation-organization",
      operationName: "create",
      input: {
        displayName: "Protected Organization",
        status: "active",
      },
    });
    const protectedOrganizationRole = await postRecordOperation({
      entity: "role-assignment",
      idempotencyKey: "assign-access-mutation-target-organization-viewer",
      operationName: "create",
      input: {
        role: "role:app.viewer",
        scopeKind: "organization",
        scopeOrganization: organization.id,
        status: "active",
        targetKind: "principal",
        targetPrincipal: target.id,
      },
    });
    const actorHeaders = { Cookie: await ownerCookieForPrincipal(actor.id) };
    const replaced = await postIdentityAccessPersonRoleReplacementResponse(
      {
        idempotencyKey: "admin-replace-access-person-roles",
        principalId: target.id,
        roles: [
          {
            appInstallId: "site",
            roleKey: "app.editor",
            scopeKind: "app-install",
          },
        ],
      },
      actorHeaders,
    );

    expect(replaced.response.status).toBe(200);
    expect("roles" in replaced.body ? replaced.body.roles : []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          appInstallId: "site",
          roleKey: "app.editor",
        }),
        expect.objectContaining({
          roleAssignmentId: protectedOrganizationRole.id,
          roleKey: "app.viewer",
          scopeKind: "organization",
        }),
      ]),
    );

    const ownerGrant = await postIdentityAccessPersonRoleReplacementResponse(
      {
        idempotencyKey: "admin-reject-owner-role",
        principalId: target.id,
        roles: [{ roleKey: "instance.owner", scopeKind: "instance" }],
      },
      actorHeaders,
    );
    const protectedRemoval = await postIdentityAccessPersonRemovalResponse(
      {
        idempotencyKey: "admin-reject-protected-removal",
        principalId: target.id,
      },
      actorHeaders,
    );
    const ownerRemoval = await postIdentityAccessPersonRemovalResponse(
      {
        idempotencyKey: "admin-reject-owner-removal",
        principalId: ownerSession.owner.id,
      },
      actorHeaders,
    );

    for (const rejected of [ownerGrant, protectedRemoval, ownerRemoval]) {
      expect(rejected.response.status).toBe(403);
      expect(rejected.body).toMatchObject({ reason: "protected-assignment" });
    }

    const ordinary = await createIdentityPrincipal("Access Removal Ordinary");
    const removed = await postIdentityAccessPersonRemovalResponse(
      {
        idempotencyKey: "admin-remove-ordinary-person",
        now: "2999-01-03T00:00:00.000Z",
        principalId: ordinary.id,
      },
      actorHeaders,
    );
    const summary = await getAccessSummary(actorHeaders);
    const afterRemoval = await getJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);

    expect(removed.response.status).toBe(200);
    expect(removed.body).toMatchObject({
      person: {
        principalId: ordinary.id,
        status: "disabled",
      },
      removedAt: "2999-01-03T00:00:00.000Z",
      status: "disabled",
    });
    expect(summary.body.people).not.toContainEqual(
      expect.objectContaining({ principalId: ordinary.id }),
    );
    expect(recordById(afterRemoval.body.records, ordinary.id).values.status).toBe("disabled");
    expect(await readPrincipalAuthority(ordinary.id)).toBeNull();
  });

  it("protects the last active owner and retains reviewable records after owner removal", async () => {
    const firstOwner = await createOwnerSessionHeaders();
    const rejected = await postIdentityAccessPersonRoleReplacementResponse(
      {
        idempotencyKey: "reject-last-owner-role-removal",
        principalId: firstOwner.owner.id,
        roles: [],
      },
      firstOwner.headers,
    );

    expect(rejected.response.status).toBe(409);
    expect(rejected.body).toEqual({
      error: "The last active instance owner cannot be removed.",
      reason: "last-active-owner",
    });

    const secondOwner = await createIdentityOwnerAuthority("Second Access Owner");
    const secondOwnerHeaders = {
      Cookie: await ownerCookieForPrincipal(secondOwner.principal.id),
    };
    const removed = await postIdentityAccessPersonRemovalResponse(
      {
        idempotencyKey: "remove-first-access-owner",
        now: "2999-01-04T00:00:00.000Z",
        principalId: firstOwner.owner.id,
      },
      secondOwnerHeaders,
    );
    const summary = await getAccessSummary(secondOwnerHeaders);
    const retained = await getJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);

    expect(removed.response.status).toBe(200);
    expect(summary.body.people).not.toContainEqual(
      expect.objectContaining({ principalId: firstOwner.owner.id }),
    );
    expect(recordById(retained.body.records, firstOwner.owner.id).values.status).toBe("disabled");
    expect(
      retained.body.records.some(
        (record) =>
          record.entity === "role-assignment" &&
          !record.deletedAt &&
          record.values.targetPrincipal === firstOwner.owner.id &&
          record.values.role === "role:instance.owner",
      ),
    ).toBe(true);
    expect(await readPrincipalAuthority(firstOwner.owner.id)).toBeNull();
  });

  it("returns display-safe access summaries for owners and Program administrators", async () => {
    await createInstalledApp("site", "Site");
    const ownerSession = await createOwnerSessionHeaders();
    const adminPrincipal = await createIdentityPrincipal("Access Summary Admin");
    await createIdentityPrincipalEmail(adminPrincipal.id, "Access.Admin@Example.COM");
    const adminRole = await assignIdentityProgramRole(adminPrincipal.id, "administrator");
    const organization = await postRecordOperation({
      entity: "organization",
      idempotencyKey: "create-access-summary-organization",
      operationName: "create",
      input: {
        displayName: "Access Org",
        status: "active",
      },
    });
    const group = await postRecordOperation({
      entity: "group",
      idempotencyKey: "create-access-summary-group",
      operationName: "create",
      input: {
        displayName: "Access Group",
        status: "active",
      },
    });
    const membership = await postRecordOperation({
      entity: "membership",
      idempotencyKey: "create-access-summary-membership",
      operationName: "create",
      input: {
        principal: adminPrincipal.id,
        targetKind: "group",
        targetGroup: group.id,
        status: "active",
      },
    });
    const appRegistration = await postRecordOperation({
      entity: "app-registration",
      idempotencyKey: "create-access-summary-registration",
      operationName: "create",
      input: {
        appInstallId: "site",
        targetKind: "principal",
        targetPrincipal: adminPrincipal.id,
        selectedOrganization: organization.id,
        status: "active",
      },
    });
    const appRole = await postRecordOperation({
      entity: "role-assignment",
      idempotencyKey: "create-access-summary-app-role",
      operationName: "create",
      input: {
        role: "role:app.viewer",
        targetKind: "principal",
        targetPrincipal: adminPrincipal.id,
        scopeKind: "app-install",
        appInstallId: "site",
        status: "active",
      },
    });
    const invitation = await postCollaboratorInvitationResponse(
      {
        idempotencyKey: "invite-access-summary",
        invitationId: "invitation:access-summary",
        targetEmail: "access-summary@example.com",
        targetSurface: "organization",
        targetOrganization: organization.id,
        now: "2999-01-01T00:00:00.000Z",
        invitedPrincipal: {
          id: "principal:access-summary-invited",
          displayName: "Access Summary Invited",
        },
        principalEmail: {
          id: "principal-email:access-summary-invited",
          primary: true,
          recovery: false,
        },
      },
      ownerSession.headers,
    );

    const ownerSummary = await getAccessSummary(ownerSession.headers);
    const adminSummary = await getAccessSummary({
      Cookie: await ownerCookieForPrincipal(adminPrincipal.id),
    });

    expect({
      ...ownerSummary.body,
      invitationGrantOptions: adminSummary.body.invitationGrantOptions,
    }).toEqual(adminSummary.body);
    expect(ownerSummary.body.invitationGrantOptions).toEqual(
      expect.objectContaining({
        authority: {
          programAdministrator: false,
          instanceOwner: true,
        },
        memberships: expect.arrayContaining([
          expect.objectContaining({
            displayLabel: "Access Group",
            targetGroupId: group.id,
            targetKind: "group",
          }),
          expect.objectContaining({
            displayLabel: "Access Org",
            targetKind: "organization",
            targetOrganizationId: organization.id,
          }),
        ]),
        roles: expect.arrayContaining([
          expect.objectContaining({
            displayLabel: "Instance — Owner",
            roleKey: "instance.owner",
            scopeKind: "instance",
          }),
          expect.objectContaining({
            displayLabel: "Access Org — Editor",
            roleKey: "app.editor",
            scopeKind: "organization",
            scopeOrganizationId: organization.id,
          }),
          expect.objectContaining({
            appInstallId: "site",
            displayLabel: "Site — Viewer",
            roleKey: "app.viewer",
            scopeKind: "app-install",
          }),
        ]),
      }),
    );
    expect(adminSummary.body.invitationGrantOptions).toEqual(
      expect.objectContaining({
        authority: {
          programAdministrator: true,
          instanceOwner: false,
        },
        memberships: [],
        roles: expect.arrayContaining([
          expect.objectContaining({
            displayLabel: "Program — Administrator",
            roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357",
            scopeKind: "program",
          }),
          expect.objectContaining({
            appInstallId: "site",
            displayLabel: "Site — Editor",
            roleKey: "app.editor",
            scopeKind: "app-install",
          }),
        ]),
      }),
    );
    expect(adminSummary.body.invitationGrantOptions.roles).not.toContainEqual(
      expect.objectContaining({
        roleKey: "instance.owner",
      }),
    );
    expect(adminSummary.body.invitationGrantOptions.roles).not.toContainEqual(
      expect.objectContaining({
        scopeKind: "organization",
      }),
    );
    expect(ownerSummary.body.people).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: owner.name,
          primaryEmail: expect.objectContaining({
            displayEmail: ownerEmail,
            normalizedEmail: ownerEmail,
            verificationStatus: "unverified",
          }),
          principalId: ownerSession.owner.id,
          status: "active",
        }),
        expect.objectContaining({
          displayName: "Access Summary Admin",
          primaryEmail: expect.objectContaining({
            displayEmail: "Access.Admin@example.com",
            normalizedEmail: "access.admin@example.com",
            verificationStatus: "unverified",
          }),
          principalId: adminPrincipal.id,
          status: "active",
        }),
      ]),
    );
    expect(ownerSummary.body.programRoles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roleAssignmentId: adminRole.id,
          roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357",
          scopeKind: "program",
          targetPrincipalId: adminPrincipal.id,
        }),
      ]),
    );
    expect(ownerSummary.body.roles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          appInstallId: "site",
          roleAssignmentId: appRole.id,
          roleKey: "app.viewer",
          scopeKind: "app-install",
          targetPrincipalId: adminPrincipal.id,
        }),
      ]),
    );
    expect(ownerSummary.body.groups).toContainEqual(
      expect.objectContaining({
        displayName: "Access Group",
        groupId: group.id,
        status: "active",
      }),
    );
    expect(ownerSummary.body.organizations).toContainEqual(
      expect.objectContaining({
        displayName: "Access Org",
        organizationId: organization.id,
        status: "active",
      }),
    );
    expect(ownerSummary.body.memberships).toContainEqual(
      expect.objectContaining({
        membershipId: membership.id,
        principalId: adminPrincipal.id,
        targetGroupId: group.id,
        targetKind: "group",
      }),
    );
    expect(ownerSummary.body.appRegistrations).toContainEqual(
      expect.objectContaining({
        appInstallId: "site",
        appRegistrationId: appRegistration.id,
        selectedOrganizationId: organization.id,
        targetKind: "principal",
        targetPrincipalId: adminPrincipal.id,
      }),
    );
    expect(ownerSummary.body.invitations).toContainEqual(
      expect.objectContaining({
        invitedPrincipalId: "principal:access-summary-invited",
        invitationId: invitation.body.invitation.id,
        inviterPrincipalId: ownerSession.owner.id,
        status: "pending",
        targetEmail: "access-summary@example.com",
        targetOrganizationId: organization.id,
        targetSurface: "organization",
      }),
    );

    const serialized = JSON.stringify(ownerSummary.body);

    expect(serialized).not.toContain("records");
    expect(serialized).not.toContain("values");
    for (const forbidden of [
      "adminBearer",
      "challenge",
      "credential",
      "provider",
      "recovery",
      "secret",
      "session",
      "token",
      "tokenHash",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("rejects access summaries without current operational authority", async () => {
    const principalOnly = await createIdentityPrincipal("Access Summary Principal Only");
    const staleAdmin = await createIdentityPrincipal("Access Summary Stale Admin");
    const staleRole = await assignIdentityProgramRole(staleAdmin.id, "administrator");
    const anonymous = await getAccessSummaryResponse();
    const missingAuthority = await getAccessSummaryResponse({
      Cookie: await ownerCookieForPrincipal(principalOnly.id),
    });
    const beforeStale = await getAccessSummary({
      Cookie: await ownerCookieForPrincipal(staleAdmin.id),
    });

    await postRecordOperation({
      entity: "program-role-assignment",
      idempotencyKey: "disable-access-summary-stale-admin",
      operationName: "update",
      recordId: staleRole.id,
      input: { status: "disabled" },
    });

    const staleAuthority = await getAccessSummaryResponse({
      Cookie: await ownerCookieForPrincipal(staleAdmin.id),
    });

    expect(beforeStale.body.programRoles).toContainEqual(
      expect.objectContaining({
        roleAssignmentId: staleRole.id,
        roleKey: "administrator",
        status: "active",
      }),
    );

    for (const result of [anonymous, missingAuthority, staleAuthority]) {
      expect(result.response.status).toBe(401);
      expect(result.response.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
      expect(result.body).toEqual({
        error:
          "Owner session, Program administrator session, or admin authorization is required for this endpoint.",
      });
    }
  });

  it("allows Program reads but keeps role and snapshot replacement writes owner-only", async () => {
    const adminPrincipal = await createIdentityPrincipal("Access Summary Generic Admin");
    await assignIdentityProgramRole(adminPrincipal.id, "administrator");

    const adminSessionHeaders = { Cookie: await ownerCookieForPrincipal(adminPrincipal.id) };
    const summary = await getAccessSummary(adminSessionHeaders);
    const bootstrap = await harness.fetch(`${controlPlaneApi}/bootstrap`, {
      headers: adminSessionHeaders,
    });
    const snapshot = await harness.fetch(`${controlPlaneApi}/snapshot`, {
      headers: adminSessionHeaders,
    });
    const restore = await harness.fetch(`${controlPlaneApi}/snapshot/restore`, {
      body: "{}",
      headers: {
        ...adminSessionHeaders,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const rawRoleAssignmentWrite = await postRecordOperationResponse(
      {
        entity: "program-role-assignment",
        idempotencyKey: "Program-administrator-raw-role-assignment-create",
        operationName: "create",
        input: {
          principal: adminPrincipal.id,
          roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357",
          status: "active",
        },
      },
      adminSessionHeaders,
    );

    expect(summary.response.status).toBe(200);
    expect(bootstrap.status).toBe(200);
    expect(snapshot.status).toBe(401);
    expect(await snapshot.json()).toEqual({
      error: "Owner session or admin authorization is required for this read endpoint.",
    });
    expect(restore.status).toBe(401);
    expect(await restore.json()).toEqual({
      error: "Owner session or admin authorization is required for this write endpoint.",
    });
    expect(rawRoleAssignmentWrite.response.status).toBe(401);
    expect(rawRoleAssignmentWrite.body).toEqual({
      error: "Current Program operation access is required for this endpoint.",
    });
  });

  it("rejects unauthorized invitation grants before identity, token, link, or delivery state", async () => {
    const { authSender } = await configureAuthInvitationEmailDelivery();
    const adminPrincipal = await createIdentityPrincipal("Invite Boundary Admin");
    await assignIdentityProgramRole(adminPrincipal.id, "administrator");

    const input = {
      idempotencyKey: "invite-blocked-owner-grant",
      invitationId: "invitation:blocked-owner-grant",
      targetEmail: "blocked-owner-grant@example.com",
      targetSurface: "instance",
      now: "2999-01-01T00:00:00.000Z",
      invitedPrincipal: {
        id: "principal:blocked-owner-grant",
        displayName: "Blocked Owner Grant",
      },
      roleAssignments: [
        {
          id: "role-assignment:blocked-owner-grant",
          roleKey: "instance.owner",
          scopeKind: "instance",
        },
      ],
    };
    const rejected = await postCollaboratorInvitationResponse(input, {
      Cookie: await ownerCookieForPrincipal(adminPrincipal.id),
    });
    const afterRejected = await getJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);
    const created = await postCollaboratorInvitationResponse(input, adminHeaders());

    expect(rejected.response.status).toBe(400);
    expect(rejected.body).toEqual({
      error: expect.stringContaining("cannot grant instance.owner"),
    });
    expect(JSON.stringify(rejected.body)).not.toContain("token");
    expect(JSON.stringify(rejected.body)).not.toContain("/formless/auth/invitations/accept");
    expect(afterRejected.body.records.some((record) => record.id === input.invitationId)).toBe(
      false,
    );
    expect(
      afterRejected.body.records.some((record) => record.id === input.invitedPrincipal.id),
    ).toBe(false);
    expect(
      afterRejected.body.records.some((record) => record.id === input.roleAssignments[0]?.id),
    ).toBe(false);
    expect(created.response.status).toBe(200);
    expect(created.body.status).toBe("committed");
    expect(created.body.delivery).toMatchObject({
      status: "scheduled",
      queued: true,
      replayed: false,
      delivery: {
        idempotencyKey: "invitation:blocked-owner-grant:collaborator-invitation-delivery",
        sender: { id: authSender.id },
        sourceRecordId: "invitation:blocked-owner-grant",
        sourceStorageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
      },
    });
    expect(JSON.stringify(created.body)).not.toContain("token");
  });

  it("rejects invalid collaborator invitation targets without partial identity commits", async () => {
    const anonymous = await postCollaboratorInvitationResponse(
      {
        idempotencyKey: "anonymous-invite",
        targetEmail: "anonymous@example.com",
        targetSurface: "instance",
        now: "2999-01-01T00:00:00.000Z",
      },
      {},
    );
    const rejected = await postCollaboratorInvitationResponse(
      {
        idempotencyKey: "invalid-target-invite",
        targetEmail: "invalid@example.com",
        targetSurface: "instance",
        targetAppInstallId: "site",
        now: "2999-01-01T00:00:00.000Z",
      },
      adminHeaders(),
    );
    const bootstrap = await getJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);

    expect(anonymous.response.status).toBe(401);
    expect(anonymous.body).toEqual({
      error:
        "Owner session, Program administrator session, or admin authorization is required for this endpoint.",
    });
    expect(rejected.response.status).toBe(400);
    expect(rejected.body).toEqual({
      error: "Collaborator invitation instance target cannot include target ids.",
    });
    expect(bootstrap.body.records.some((record) => record.entity === "invitation")).toBe(false);
  });

  it("rejects conflicting, unavailable, and incomplete role surfaces without partial writes", async () => {
    await createInstalledApp("site", "Site");
    const ownerSession = await createOwnerSessionHeaders();
    const organization = await postRecordOperation({
      entity: "organization",
      idempotencyKey: "create-invitation-target-organization",
      operationName: "create",
      input: {
        displayName: "Invitation Target Org",
        status: "active",
      },
    });
    const invitedPrincipal = {
      displayName: "Rejected Surface Invite",
      id: "principal:rejected-surface-invite",
    };
    const duplicateSurface = await postCollaboratorInvitationResponse(
      {
        idempotencyKey: "invite-duplicate-role-surface",
        invitationId: "invitation:duplicate-role-surface",
        invitedPrincipal,
        roleAssignments: [
          {
            appInstallId: "site",
            roleKey: "app.editor",
            scopeKind: "app-install",
          },
          {
            appInstallId: "site",
            roleKey: "app.viewer",
            scopeKind: "app-install",
          },
        ],
        targetEmail: "duplicate-role-surface@example.com",
      },
      ownerSession.headers,
    );
    const missingMultiSurfaceTarget = await postCollaboratorInvitationResponse(
      {
        idempotencyKey: "invite-missing-multi-surface-target",
        invitationId: "invitation:missing-multi-surface-target",
        invitedPrincipal,
        roleAssignments: [
          {
            roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357",
            scopeKind: "program",
          },
          {
            appInstallId: "site",
            roleKey: "app.viewer",
            scopeKind: "app-install",
          },
        ],
        targetEmail: "missing-multi-surface-target@example.com",
      },
      ownerSession.headers,
    );
    const unselectedTarget = await postCollaboratorInvitationResponse(
      {
        idempotencyKey: "invite-unselected-role-target",
        invitationId: "invitation:unselected-role-target",
        invitedPrincipal,
        roleAssignments: [
          {
            roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357",
            scopeKind: "program",
          },
          {
            appInstallId: "site",
            roleKey: "app.viewer",
            scopeKind: "app-install",
          },
        ],
        targetEmail: "unselected-role-target@example.com",
        targetOrganization: organization.id,
        targetSurface: "organization",
      },
      ownerSession.headers,
    );
    const unavailableApp = await postCollaboratorInvitationResponse(
      {
        idempotencyKey: "invite-unavailable-role-surface",
        invitationId: "invitation:unavailable-role-surface",
        invitedPrincipal,
        roleAssignments: [
          {
            appInstallId: "missing",
            roleKey: "app.viewer",
            scopeKind: "app-install",
          },
        ],
        targetEmail: "unavailable-role-surface@example.com",
      },
      ownerSession.headers,
    );

    expect(duplicateSurface.response.status).toBe(400);
    expect(duplicateSurface.body).toEqual({
      error: "Collaborator invitation may select only one role level for each access surface.",
    });
    expect(missingMultiSurfaceTarget.response.status).toBe(400);
    expect(missingMultiSurfaceTarget.body).toEqual({
      error:
        "Collaborator invitation requires an explicit acceptance target for multiple role surfaces.",
    });
    expect(unselectedTarget.response.status).toBe(400);
    expect(unselectedTarget.body).toEqual({
      error: "Collaborator invitation acceptance target must be one of its selected role surfaces.",
    });
    expect(unavailableApp.response.status).toBe(400);
    expect(unavailableApp.body).toEqual({
      error: 'Collaborator invitation app install "missing" is unavailable.',
    });

    const bootstrap = await getJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);
    expect(
      bootstrap.body.records.some(
        (record) =>
          record.id === invitedPrincipal.id ||
          record.id.startsWith("invitation:duplicate-role-surface") ||
          record.id.startsWith("invitation:missing-multi-surface-target") ||
          record.id.startsWith("invitation:unselected-role-target") ||
          record.id.startsWith("invitation:unavailable-role-surface"),
      ),
    ).toBe(false);
  });

  it("rejects owner sessions without current active owner authority", async () => {
    const missingPrincipal = await ownerReadResponse("missing-principal");
    const principalOnly = await createIdentityPrincipal("Principal Only");
    const missingRole = await ownerReadResponse(principalOnly.id);
    const disabledPrincipal = await createIdentityOwnerAuthority("Disabled Principal");
    const disabledAssignment = await createIdentityOwnerAuthority("Disabled Role");

    await postRecordOperation({
      entity: "principal",
      idempotencyKey: "disable-owner-principal",
      operationName: "update",
      recordId: disabledPrincipal.principal.id,
      input: { status: "disabled" },
    });
    await postRecordOperation({
      entity: "role-assignment",
      idempotencyKey: "disable-owner-role",
      operationName: "update",
      recordId: disabledAssignment.assignment.id,
      input: { status: "disabled" },
    });

    const disabledPrincipalRead = await ownerReadResponse(disabledPrincipal.principal.id);
    const disabledAssignmentRead = await ownerReadResponse(disabledAssignment.principal.id);

    for (const response of [
      missingPrincipal,
      missingRole,
      disabledPrincipalRead,
      disabledAssignmentRead,
    ]) {
      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
      expect(await response.json()).toEqual({
        error:
          "Current Program member, owner, or admin authorization is required for this read endpoint.",
      });
    }
  });

  it("resolves current owner and Program administrator authority from identity records", async () => {
    const ownerAuthority = await createIdentityOwnerAuthority("Lookup Owner");
    const adminPrincipal = await createIdentityPrincipal("Lookup Admin");
    await assignIdentityProgramRole(adminPrincipal.id, "administrator");
    const ordinaryPrincipal = await createIdentityPrincipal("Lookup Ordinary");
    const disabledAuthority = await createIdentityOwnerAuthority("Lookup Disabled");
    const removedAdminPrincipal = await createIdentityPrincipal("Lookup Removed Admin");
    const removedAdminAssignment = await assignIdentityProgramRole(
      removedAdminPrincipal.id,
      "administrator",
    );

    await postRecordOperation({
      entity: "principal",
      idempotencyKey: "disable-lookup-principal",
      operationName: "update",
      recordId: disabledAuthority.principal.id,
      input: { status: "disabled" },
    });
    await postRecordOperation({
      entity: "program-role-assignment",
      idempotencyKey: "delete-lookup-admin-role",
      operationName: "delete",
      recordId: removedAdminAssignment.id,
    });

    expect(await readPrincipalAuthority(ownerAuthority.principal.id)).toEqual({
      callerFacts: { active: true, kind: "principal", owner: true },
      id: ownerAuthority.principal.id,
    });
    expect(await readPrincipalAuthority(adminPrincipal.id)).toEqual({
      callerFacts: {
        active: true,
        kind: "principal",
        owner: false,
        roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357",
      },
      id: adminPrincipal.id,
    });
    expect(await readPrincipalAuthority(ordinaryPrincipal.id)).toEqual({
      callerFacts: { active: true, kind: "principal", owner: false },
      id: ordinaryPrincipal.id,
    });
    expect(await readPrincipalAuthority(disabledAuthority.principal.id)).toBeNull();
    expect(await readPrincipalAuthority(removedAdminPrincipal.id)).toEqual({
      callerFacts: { active: true, kind: "principal", owner: false },
      id: removedAdminPrincipal.id,
    });
  });

  it("resolves app-admin authority by install and reconciles required role records", async () => {
    const ownerAuthority = await createIdentityOwnerAuthority("App Lookup Owner");
    const appAdmin = await createIdentityPrincipal("App Lookup Admin");
    const assignment = await assignIdentityAppRole(appAdmin.id, "tasks");
    const ordinary = await createIdentityPrincipal("App Lookup Ordinary");
    const disabled = await createIdentityPrincipal("App Lookup Disabled");
    await assignIdentityAppRole(disabled.id, "tasks");

    await postRecordOperation({
      entity: "principal",
      idempotencyKey: "disable-app-lookup-principal",
      operationName: "update",
      recordId: disabled.id,
      input: { status: "disabled" },
    });

    expect(await readAppAuthority(ownerAuthority.principal.id, "tasks")).toEqual({
      appAdmin: false,
      appInstallId: "tasks",
      id: ownerAuthority.principal.id,
      instanceOwner: true,
    });
    expect(await readAppAuthority(appAdmin.id, "tasks")).toEqual({
      appAdmin: true,
      appInstallId: "tasks",
      id: appAdmin.id,
      instanceOwner: false,
    });
    expect(await readAppAuthority(appAdmin.id, "crm")).toEqual({
      appAdmin: false,
      appInstallId: "crm",
      id: appAdmin.id,
      instanceOwner: false,
    });
    expect(await readAppAuthority(ordinary.id, "tasks")).toEqual({
      appAdmin: false,
      appInstallId: "tasks",
      id: ordinary.id,
      instanceOwner: false,
    });
    expect(await readAppAuthority(disabled.id, "tasks")).toBeNull();

    await postRecordOperation({
      entity: "role-assignment",
      idempotencyKey: "disable-app-lookup-assignment",
      operationName: "update",
      recordId: assignment.id,
      input: { status: "disabled" },
    });
    expect(await readAppAuthority(appAdmin.id, "tasks")).toEqual({
      appAdmin: false,
      appInstallId: "tasks",
      id: appAdmin.id,
      instanceOwner: false,
    });

    await postRecordOperation({
      entity: "role",
      idempotencyKey: "disable-app-admin-role",
      operationName: "update",
      recordId: "role:app.admin",
      input: { status: "disabled" },
    });
    const reconciled = await getJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);
    expect(recordById(reconciled.body.records, "role:app.admin").values.status).toBe("active");
  });
});

async function resetKnownState() {
  await resetTestIdentityStorage(harness, adminToken);
}

async function createInstalledApp(installId: string, label: string) {
  const response = await harness.fetch("/api/formless/app-installs", {
    body: JSON.stringify({
      installId,
      label,
      packageAppKey: "site",
    }),
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });

  expect(response.status).toBe(201);
}

async function getJson<T>(path: string) {
  const response = await harness.fetch(path, { headers: adminHeaders() });

  expect(response.status).toBe(200);

  return {
    body: (await response.json()) as T,
    response,
  };
}

async function getOwnerJson<T>(path: string) {
  const response = await harness.fetch(path, { headers: await ownerSessionHeaders() });

  expect(response.status).toBe(200);

  return {
    body: (await response.json()) as T,
    response,
  };
}

async function getAccessSummary(headers: Record<string, string>) {
  const result = await getAccessSummaryResponse(headers);

  expect(result.response.status).toBe(200);

  return {
    body: result.body as IdentityAccessManagementSummary,
    response: result.response,
  };
}

async function getAccessSummaryResponse(headers: Record<string, string> = {}) {
  const response = await harness.fetch(
    `${identityApi}${IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_PATH}`,
    { headers },
  );
  const body = (await response.json()) as
    | IdentityAccessManagementSummary
    | {
        error: string;
      };
  return {
    body,
    response,
  };
}

async function configureAuthInvitationEmailDelivery() {
  const emailDomain = await postControlPlaneOperation("email-domain", "auth-invite-domain", {
    enabled: true,
    providerFamily: "cloudflare",
    domain: "mail.example.com",
  });
  const authSender = operationRecord(
    await postControlPlaneOperation("email-sender", "auth-invite-sender", {
      enabled: true,
      address: "auth@mail.example.com",
      displayName: "Example Auth",
      purpose: "auth",
      emailDomain: operationRecord(emailDomain).id,
    }),
  );
  await postControlPlaneOperation("instance-settings", "auth-invite-settings", {
    settingsId: "instance",
    canonicalOrigin: "https://www.example.com",
    authOrigin,
    defaultEmailDomain: operationRecord(emailDomain).id,
    defaultAuthSender: authSender.id,
    productionIdentityStatus: "configured",
  });

  return { authSender };
}

async function postControlPlaneOperation(
  entity: string,
  idempotencyKey: string,
  input: Record<string, unknown>,
) {
  const response = await harness.fetch(`${controlPlaneApi}/operations/${entity}/create`, {
    body: JSON.stringify({ idempotencyKey, input }),
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });
  const body = (await response.json()) as OperationInvocationResponse;

  expect(response.status).toBe(200);

  return {
    body,
    response,
  };
}

function operationRecord(response: { body: OperationInvocationResponse }): StoredRecord {
  const output = response.body.output;

  if (output === undefined) {
    throw new Error(`Expected operation response, received ${JSON.stringify(response.body)}.`);
  }

  if (output.type !== "create" && output.type !== "update") {
    throw new Error(`Expected create or update operation output, received "${output.type}".`);
  }
  return output.record;
}
async function postRecordOperation(input: Parameters<typeof recordOperationRequest>[0]) {
  const result = await postRecordOperationResponse(input);
  expect(result.response.status).toBe(200);
  return (
    result.body as {
      record: StoredRecord;
    }
  ).record;
}
async function createIdentityPrincipal(displayName: string) {
  return await postRecordOperation({
    entity: "principal",
    idempotencyKey: `create-${displayName.toLowerCase().replace(/\s+/g, "-")}`,
    operationName: "create",
    input: {
      displayName,
      kind: "human",
      status: "active",
    },
  });
}

async function createIdentityPrincipalEmail(principalId: string, displayEmail: string) {
  const displayEmailWithNormalizedDomain = displayEmail.replace(
    /@(.+)$/,
    (_, domain: string) => `@${domain.toLowerCase()}`,
  );

  return await postRecordOperation({
    entity: "principal-email",
    idempotencyKey: `create-${principalId.replace(/\W+/g, "-")}-primary-email`,
    operationName: "create",
    input: {
      principal: principalId,
      displayEmail: displayEmailWithNormalizedDomain,
      normalizedEmail: displayEmail.toLowerCase(),
      verificationStatus: "unverified",
      primary: true,
      recovery: false,
    },
  });
}

async function createIdentityOwnerAuthority(displayName: string) {
  const principal = await createIdentityPrincipal(displayName);
  const assignment = await postRecordOperation({
    entity: "role-assignment",
    idempotencyKey: `assign-${displayName.toLowerCase().replace(/\s+/g, "-")}-owner`,
    operationName: "create",
    input: {
      role: "role:instance.owner",
      targetKind: "principal",
      targetPrincipal: principal.id,
      scopeKind: "instance",
      status: "active",
    },
  });

  return { assignment, principal };
}

async function assignIdentityProgramRole(principalId: string, roleKey: "administrator") {
  return await postRecordOperation({
    entity: "program-role-assignment",
    idempotencyKey: `assign-${principalId.replace(/\W+/g, "-")}-${roleKey}`,
    operationName: "create",
    input: {
      principal: principalId,
      roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357",
      status: "active",
    },
  });
}

async function assignIdentityAppRole(principalId: string, appInstallId: string) {
  return await postRecordOperation({
    entity: "role-assignment",
    idempotencyKey: ["assign", principalId.replace(/\W+/g, "-"), "app-admin", appInstallId].join(
      "-",
    ),
    operationName: "create",
    input: {
      appInstallId,
      role: "role:app.admin",
      scopeKind: "app-install",
      status: "active",
      targetKind: "principal",
      targetPrincipal: principalId,
    },
  });
}

async function readPrincipalAuthority(
  principalId: string,
): Promise<ActiveIdentityAuthority | null> {
  const url = new URL(INTERNAL_IDENTITY_PRINCIPAL_AUTHORITY_PATH, "http://internal");

  url.searchParams.set("principalId", principalId);

  const response = await harness.durableObjectFetch(
    "FORMLESS_AUTHORITY",
    FORMLESS_PROGRAM_STORAGE_IDENTITY,
    `${url.pathname}${url.search}`,
    { method: "GET" },
  );
  const body = (await response.json()) as {
    authority?: ActiveIdentityAuthority | null;
    error?: string;
  };

  expect(response.status).toBe(200);

  return body.authority ?? null;
}

async function readAppAuthority(
  principalId: string,
  appInstallId: string,
): Promise<ActiveIdentityAppAuthority | null> {
  const url = new URL(INTERNAL_IDENTITY_APP_AUTHORITY_PATH, "http://internal");

  url.searchParams.set("principalId", principalId);
  url.searchParams.set("appInstallId", appInstallId);

  const response = await harness.durableObjectFetch(
    "FORMLESS_AUTHORITY",
    FORMLESS_PROGRAM_STORAGE_IDENTITY,
    `${url.pathname}${url.search}`,
    { method: "GET" },
  );
  const body = (await response.json()) as {
    authority?: ActiveIdentityAppAuthority | null;
    error?: string;
  };

  expect(response.status).toBe(200);

  return body.authority ?? null;
}

async function ownerReadResponse(principalId: string) {
  return await harness.fetch(`${controlPlaneApi}/bootstrap`, {
    headers: { Cookie: await ownerCookieForPrincipal(principalId) },
  });
}

async function ownerCookieForPrincipal(principalId: string) {
  const created = await createOwnerSessionCookie({
    env: { FORMLESS_ADMIN_TOKEN: adminToken },
    maxAgeSeconds: 60,
    now: "2999-01-01T00:00:00.000Z",
    owner: {
      id: principalId,
      name: "Session Principal",
      createdAt: "2999-01-01T00:00:00.000Z",
    },
    request: new Request("http://example.com/"),
  });

  return cookiePair(created.cookie);
}

async function postRecordOperationResponse(
  input: Parameters<typeof recordOperationRequest>[0],
  headers?: Record<string, string>,
) {
  const request = recordOperationRequest(input);
  const response = await harness.fetch(`${controlPlaneApi}${request.path.slice("/api".length)}`, {
    body: JSON.stringify(request.body),
    headers: {
      ...(headers ?? (await ownerSessionHeaders())),
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const body = await response.json();

  return {
    body: response.ok ? request.response(body) : body,
    response,
  };
}

async function postCollaboratorInvitationResponse(input: unknown, headers: Record<string, string>) {
  const response = await harness.fetch(`${identityApi}/collaborator-invitations`, {
    body: JSON.stringify(input),
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const body = (await response.json()) as CollaboratorInvitationTestResponse;

  return {
    body,
    response,
  };
}

async function postRevokeCollaboratorInvitationResponse(
  input: unknown,
  headers: Record<string, string>,
) {
  const response = await harness.fetch(
    `${identityApi}${IDENTITY_COLLABORATOR_INVITATION_REVOKE_API_PATH}`,
    {
      body: JSON.stringify(input),
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );
  const body = (await response.json()) as
    | CollaboratorInvitationRevokeTestResponse
    | {
        error: string;
      };

  return {
    body,
    response,
  };
}

async function postIdentityAccessPersonRoleReplacementResponse(
  input: unknown,
  headers: Record<string, string>,
) {
  const response = await harness.fetch(
    `${identityApi}${IDENTITY_ACCESS_PERSON_ROLE_REPLACEMENT_API_PATH}`,
    {
      body: JSON.stringify(input),
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );
  const body = (await response.json()) as
    | IdentityAccessPersonMutationErrorResponse
    | IdentityAccessPersonRoleReplacementResponse;

  return { body, response };
}

async function postIdentityAccessPersonRemovalResponse(
  input: unknown,
  headers: Record<string, string>,
) {
  const response = await harness.fetch(`${identityApi}${IDENTITY_ACCESS_PERSON_REMOVAL_API_PATH}`, {
    body: JSON.stringify(input),
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const body = (await response.json()) as
    | IdentityAccessPersonMutationErrorResponse
    | IdentityAccessPersonRemovalResponse;

  return { body, response };
}

async function fetchCollaboratorInvitationAcceptanceStatus(invitationId: string, token: string) {
  const url = new URL(COLLABORATOR_INVITATION_ACCEPT_PATH, authOrigin);

  url.searchParams.set("invitationId", invitationId);
  url.searchParams.set("token", token);

  const response = await harness.mf.dispatchFetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  const body = (await response.json()) as CollaboratorInvitationAcceptanceStatusResponse;

  return {
    body,
    response,
  };
}

function recordById(records: StoredRecord[], id: string): StoredRecord {
  const record = records.find((candidate) => candidate.id === id);

  if (!record) {
    throw new Error(`Expected record "${id}".`);
  }

  return record;
}

function builtInRoleRecords(): StoredRecord[] {
  return identityControlPlaneRoleKeys.map((roleKey) => ({
    id: `role:${roleKey}`,
    entity: "role",
    values: {
      key: roleKey,
      displayLabel: roleKey,
      status: "active",
    },
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z",
  }));
}

function adminHeaders(headers: Record<string, string> = {}) {
  return {
    ...headers,
    Authorization: `Bearer ${adminToken}`,
  };
}

async function ownerSessionHeaders() {
  return (await createOwnerSessionHeaders()).headers;
}

async function createOwnerSessionHeaders() {
  const identityOwner = await ensureTestIdentityOwner(harness, adminToken, owner);
  const created = await createOwnerSessionCookie({
    env: { FORMLESS_ADMIN_TOKEN: adminToken },
    maxAgeSeconds: 60,
    now: "2999-01-01T00:00:00.000Z",
    owner: identityOwner,
    request: new Request("http://example.com/"),
  });

  return {
    headers: {
      Cookie: cookiePair(created.cookie),
    },
    owner: identityOwner,
  };
}

function cookiePair(cookie: string) {
  return cookie.split(";")[0] ?? cookie;
}
