import { createHash, generateKeyPairSync, randomUUID, type KeyObject } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import { IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX } from "@dpeek/formless-identity-control-plane";
import { FORMLESS_PROGRAM_STORAGE_IDENTITY } from "../program/target.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import {
  COLLABORATOR_INVITATION_ACCEPT_PATH,
  parseCollaboratorInvitationAcceptanceStatusResponse,
  parseCollaboratorInvitationPasskeyRegistrationOptionsResponse,
  parseCollaboratorInvitationPasskeyRegistrationVerifyResponse,
  type AccountCompletionGateTarget,
  type CollaboratorInvitationAcceptanceFailureReason,
} from "../shared/instance-auth.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import type { BootstrapResponse } from "../shared/protocol.ts";
import { recordOperationRequest } from "../test/authority-write.ts";
import {
  resetTestIdentityStorage,
  testIdentityOwnerSessionHeaders,
} from "../test/identity-owner.ts";
import {
  customOnboardingPackageAppKey,
  customOnboardingProfileCompletionOperation,
  customOnboardingRegistrationOperationKey,
  customOnboardingWorkspacePackageFixture,
} from "../test/custom-onboarding-app.ts";
import {
  FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME,
  formatRuntimeWorkspaceAppPackages,
} from "../shared/workspace-runtime-packages.ts";
import {
  HOST_AUTH_SESSION_COOKIE_NAME,
  INSTANCE_AUTH_HANDOFF_CALLBACK_PATH,
  INSTANCE_AUTH_HANDOFF_START_PATH,
} from "./instance-auth-handoff.ts";
import { CENTRAL_AUTH_SESSION_COOKIE_NAME } from "./central-auth-session.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { OWNER_SESSION_COOKIE_NAME } from "./owner-session.ts";
import { handleCollaboratorInvitationAcceptanceBrowserRequest } from "./collaborator-invitation-acceptance.ts";
import { INSTANCE_AUTH_PROFILE_COMPLETION_GATE_COMPLETE_PATH } from "./instance-auth-account-completion.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

type CollaboratorInvitationResponse = {
  error?: string;
  invitation: StoredRecord;
  records: StoredRecord[];
  status: "committed" | "replayed";
};

type PrivateInvitationToken = {
  consumedAt?: string;
  expiresAt: string;
  invitationId: string;
  tokenHash: string;
};

const adminToken = "test-admin-token";
const authOrigin = "https://auth.example.com";
const wrongOrigin = "https://app.example.com";
const mappedAppOrigin = "https://mapped-app.example.com";
const mappedSiteOrigin = "https://mapped-site.example.com";
const identityApi = IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX;
const controlPlaneApi = "/api/formless/program";
const rawToken = "aW52aXRlLXJhdy10b2tlbi0x";
const otherRawToken = "aW52aXRlLXJhdy10b2tlbi0y";
const createdAt = new Date().toISOString();
const futureExpiresAt = new Date(
  new Date(createdAt).getTime() + 7 * 24 * 60 * 60 * 1000,
).toISOString();
const pastCreatedAt = "2026-01-01T00:00:00.000Z";
const pastExpiresAt = "2026-01-02T00:00:00.000Z";

let harness: Harness;
let harnessDir: string | undefined;
let instanceAuthHarnessName: string;

beforeAll(async () => {
  const customOnboardingPackage = await customOnboardingWorkspacePackageFixture();

  harness = await createWorkerHarness(
    await writeCollaboratorInvitationAcceptanceHarness(),
    {
      FORMLESS_AUTHORITY: {
        className: "CollaboratorInvitationAcceptanceHarness",
        useSQLite: true,
      },
    },
    {
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        [FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME]: formatRuntimeWorkspaceAppPackages([
          customOnboardingPackage,
        ]),
      },
    },
  );
});

beforeEach(async () => {
  instanceAuthHarnessName = randomUUID();
  await resetIdentityStorage();
  await writeAuthConfig();
  await createDefaultAppInstall("site", {
    label: "Site",
    packageAppKey: "site",
  });
});

afterAll(async () => {
  await harness.dispose();

  if (harnessDir) {
    await rm(harnessDir, { recursive: true, force: true });
    harnessDir = undefined;
  }
});

describe("collaborator invitation acceptance status", () => {
  it("serves the browser route shell separately from the status API", async () => {
    const assetRequests: string[] = [];
    const env = {
      ASSETS: {
        fetch(request: Request) {
          assetRequests.push(new URL(request.url).pathname);

          return new Response("<!doctype html><html><body>acceptance shell</body></html>", {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        },
      },
    } as unknown as Parameters<typeof handleCollaboratorInvitationAcceptanceBrowserRequest>[1];
    const documentResponse = await handleCollaboratorInvitationAcceptanceBrowserRequest(
      new Request(
        `${authOrigin}${COLLABORATOR_INVITATION_ACCEPT_PATH}?invitationId=invitation%3Aada&token=${rawToken}`,
        { headers: { Accept: "text/html" } },
      ),
      env,
    );
    const headResponse = await handleCollaboratorInvitationAcceptanceBrowserRequest(
      new Request(
        `${authOrigin}${COLLABORATOR_INVITATION_ACCEPT_PATH}?invitationId=invitation%3Aada&token=${rawToken}`,
        { headers: { Accept: "text/html" }, method: "HEAD" },
      ),
      env,
    );
    const apiResponse = await handleCollaboratorInvitationAcceptanceBrowserRequest(
      new Request(
        `${authOrigin}${COLLABORATOR_INVITATION_ACCEPT_PATH}?invitationId=invitation%3Aada&token=${rawToken}`,
        { headers: { Accept: "application/json" } },
      ),
      env,
    );
    const passkeyApiResponse = await handleCollaboratorInvitationAcceptanceBrowserRequest(
      new Request(`${authOrigin}${COLLABORATOR_INVITATION_ACCEPT_PATH}/passkeys/register/options`, {
        headers: { Accept: "text/html" },
        method: "POST",
      }),
      env,
    );

    expect(documentResponse?.status).toBe(200);
    expect(documentResponse?.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await documentResponse?.text()).toContain("acceptance shell");
    expect(headResponse?.status).toBe(200);
    expect(await headResponse?.text()).toBe("");
    expect(apiResponse).toBeUndefined();
    expect(passkeyApiResponse).toBeUndefined();
    expect(assetRequests).toEqual(["/index.html", "/index.html"]);
  });

  it("returns display-safe eligible invitation facts without consuming tokens or issuing auth state", async () => {
    const invitation = await createInvitation({
      invitationId: "invitation:eligible",
      targetEmail: "Ada.Collab@Example.COM",
      targetSurface: "app-install",
      targetAppInstallId: "site",
      invitedPrincipal: {
        id: "principal:eligible",
        displayName: "Ada Collaborator",
      },
    });

    await createPrivateToken({
      invitationId: invitation.id,
      rawToken,
      targetEmail: "ada.collab@example.com",
      targetSurface: "app-install",
      targetAppInstallId: "site",
    });

    const status = await fetchAcceptanceStatus(invitation.id, rawToken);
    const token = await readPrivateToken(invitation.id);
    const counts = await authCounts();

    expect(status.response.status).toBe(200);
    expect(status.response.headers.get("Set-Cookie")).toBeNull();
    expect(status.body).toEqual({
      eligible: true,
      invitation: {
        invitationId: invitation.id,
        targetEmail: "Ada.Collab@example.com",
        targetSurface: "app-install",
        targetAppInstallId: "site",
        expiresAt: futureExpiresAt,
        invitedPrincipalDisplayName: "Ada Collaborator",
        passkeyRegistrationRequired: true,
      },
    });
    expect(token.consumedAt).toBeUndefined();
    expect(counts).toEqual({
      centralSessions: 0,
      challenges: 0,
      credentials: 0,
      handoffGrants: 0,
    });
    expect(JSON.stringify(status.body)).not.toContain(rawToken);
    expect(JSON.stringify(status.body)).not.toContain(token.tokenHash);
  });

  it("returns display-safe eligibility failures for invalid invitation links", async () => {
    const cases: Array<{
      expectedStatus: number;
      invitationId: string;
      prepare?: () => Promise<string>;
      reason: Exclude<
        CollaboratorInvitationAcceptanceFailureReason,
        "configuration-unavailable" | "wrong-origin"
      >;
      requestToken?: string;
    }> = [
      {
        expectedStatus: 404,
        invitationId: "invitation:missing",
        reason: "missing-invitation",
      },
      {
        expectedStatus: 410,
        invitationId: "invitation:expired",
        prepare: async () => {
          const invitation = await createInvitation({
            invitationId: "invitation:expired",
            targetEmail: "expired@example.com",
            targetSurface: "instance",
            now: pastCreatedAt,
          });

          await createPrivateToken({
            invitationId: invitation.id,
            rawToken: rawTokenFor(invitation.id),
            targetEmail: "expired@example.com",
            targetSurface: "instance",
            createdAt: pastCreatedAt,
            expiresAt: pastExpiresAt,
          });

          return invitation.id;
        },
        reason: "expired-invitation",
      },
      {
        expectedStatus: 409,
        invitationId: "invitation:revoked",
        prepare: async () => {
          const invitation = await prepareActiveInvitation("invitation:revoked", {
            targetEmail: "revoked@example.com",
          });

          await revokePrivateToken(invitation.id);

          return invitation.id;
        },
        reason: "revoked-invitation",
      },
      {
        expectedStatus: 409,
        invitationId: "invitation:consumed",
        prepare: async () => {
          const invitation = await prepareActiveInvitation("invitation:consumed", {
            targetEmail: "consumed@example.com",
          });

          await consumePrivateToken(invitation.id, rawTokenFor(invitation.id));

          return invitation.id;
        },
        reason: "consumed-invitation",
      },
      {
        expectedStatus: 409,
        invitationId: "invitation:accepted",
        prepare: async () => {
          const invitation = await prepareActiveInvitation("invitation:accepted", {
            targetEmail: "accepted@example.com",
          });

          await updateInvitationStatus(invitation.id, "accepted");

          return invitation.id;
        },
        reason: "accepted-invitation",
      },
      {
        expectedStatus: 401,
        invitationId: "invitation:wrong-token",
        prepare: async () => {
          const invitation = await prepareActiveInvitation("invitation:wrong-token", {
            targetEmail: "wrong-token@example.com",
          });

          await createUnrelatedPrincipalForEmail("wrong-token@example.com");

          return invitation.id;
        },
        reason: "wrong-token",
        requestToken: otherRawToken,
      },
      {
        expectedStatus: 401,
        invitationId: "invitation:wrong-email",
        prepare: async () => {
          const invitation = await createInvitation({
            invitationId: "invitation:wrong-email",
            targetEmail: "wrong-email@example.com",
            targetSurface: "instance",
          });

          await createPrivateToken({
            invitationId: invitation.id,
            rawToken: rawTokenFor(invitation.id),
            targetEmail: "other-email@example.com",
            targetSurface: "instance",
          });

          return invitation.id;
        },
        reason: "wrong-email",
      },
      {
        expectedStatus: 401,
        invitationId: "invitation:wrong-target",
        prepare: async () => {
          const invitation = await createInvitation({
            invitationId: "invitation:wrong-target",
            targetEmail: "wrong-target@example.com",
            targetSurface: "app-install",
            targetAppInstallId: "site",
          });

          await createPrivateToken({
            invitationId: invitation.id,
            rawToken: rawTokenFor(invitation.id),
            targetEmail: "wrong-target@example.com",
            targetSurface: "app-install",
            targetAppInstallId: "crm",
          });

          return invitation.id;
        },
        reason: "wrong-target",
      },
    ];

    for (const testCase of cases) {
      const invitationId = testCase.prepare ? await testCase.prepare() : testCase.invitationId;
      const requestToken = testCase.requestToken ?? rawTokenFor(invitationId);
      const status = await fetchAcceptanceStatus(invitationId, requestToken);

      expect(status.response.status, `${testCase.reason}: ${JSON.stringify(status.body)}`).toBe(
        testCase.expectedStatus,
      );
      expect(status.response.headers.get("Set-Cookie")).toBeNull();
      expect(status.body).toEqual({
        eligible: false,
        error:
          testCase.reason === "expired-invitation"
            ? "Invitation link has expired."
            : testCase.reason === "revoked-invitation"
              ? "Invitation link is no longer available."
              : testCase.reason === "consumed-invitation"
                ? "Invitation link has already been used."
                : testCase.reason === "accepted-invitation"
                  ? "Invitation has already been accepted."
                  : "Invitation link is invalid.",
        reason: testCase.reason,
      });
      expect(JSON.stringify(status.body)).not.toContain(rawToken);
      expect(JSON.stringify(status.body)).not.toContain(otherRawToken);
      expect(JSON.stringify(status.body)).not.toContain(requestToken);
      expect(JSON.stringify(status.body)).not.toContain("principal:");
    }
  });

  it("rejects acceptance checks outside the configured auth origin", async () => {
    const invitation = await prepareActiveInvitation("invitation:wrong-origin", {
      targetEmail: "wrong-origin@example.com",
    });
    const status = await fetchAcceptanceStatus(invitation.id, rawToken, wrongOrigin);

    expect(status.response.status).toBe(404);
    expect(status.body).toEqual({
      eligible: false,
      error: "Invitation must be accepted on the configured auth origin.",
      reason: "wrong-origin",
    });
  });

  it("accepts an invitation by activating identity records and storing private auth state", async () => {
    const group = await postIdentityOperation({
      entity: "group",
      idempotencyKey: "create-passkey-group",
      input: {
        displayName: "Passkey group",
        status: "active",
      },
      operationName: "create",
    });
    const invitation = await createInvitation({
      invitationId: "invitation:passkey",
      targetEmail: "Passkey.Collab@Example.COM",
      targetSurface: "app-install",
      targetAppInstallId: "site",
      invitedPrincipal: {
        id: "principal:passkey",
        displayName: "Passkey Collaborator",
      },
      principalEmail: {
        id: "principal-email:passkey",
        primary: true,
        recovery: false,
      },
      memberships: [
        {
          id: "membership:passkey-group",
          targetKind: "group",
          targetGroup: group.id,
        },
      ],
      appRegistrations: [
        {
          id: "app-registration:passkey-site",
          appInstallId: "site",
        },
      ],
    });
    const token = rawTokenFor(invitation.id);

    await createPrivateToken({
      invitationId: invitation.id,
      rawToken: token,
      targetEmail: "passkey.collab@example.com",
      targetSurface: "app-install",
      targetAppInstallId: "site",
    });

    const authenticator = new VirtualPasskey("Y29sbGFib3JhdG9yLWNyZWRlbnRpYWwtMQ");
    const unverifiedOptions = await fetchPasskeyRegistrationOptions(invitation.id, token);

    if (!("options" in unverifiedOptions.body)) {
      throw new Error(
        `Expected passkey options, received ${JSON.stringify(unverifiedOptions.body)}.`,
      );
    }

    const unverified = await verifyPasskeyRegistration(
      invitation.id,
      token,
      authenticator.registrationResponse(unverifiedOptions.body.options, {
        origin: authOrigin,
        rpId: "example.com",
        userVerified: false,
      }),
    );
    const options = await fetchPasskeyRegistrationOptions(invitation.id, token);
    const countsAfterOptions = await authCounts();

    if (!("options" in options.body)) {
      throw new Error(`Expected passkey options, received ${JSON.stringify(options.body)}.`);
    }

    const verified = await verifyPasskeyRegistration(
      invitation.id,
      token,
      authenticator.registrationResponse(options.body.options, {
        origin: authOrigin,
        rpId: "example.com",
      }),
    );
    const privateToken = await readPrivateToken(invitation.id);
    const countsAfterVerify = await authCounts();
    const records = await readIdentityRecords();
    const acceptedInvitation = recordById(records, invitation.id);

    expect(options.response.status).toBe(200);
    expect(options.response.headers.get("Set-Cookie")).toBeNull();
    expect(options.body.options.rp).toEqual({ id: "example.com", name: "Formless" });
    expect(options.body.options.user.name).toBe("Passkey.Collab@example.com");
    expect(options.body.options.user.displayName).toBe("Passkey Collaborator");
    expect(options.body.options.authenticatorSelection).toMatchObject({
      requireResidentKey: true,
      residentKey: "required",
      userVerification: "required",
    });
    expect(Buffer.from(options.body.options.user.id, "base64url").toString()).toBe(
      "principal:passkey",
    );
    expect(JSON.stringify(options.body)).not.toContain(token);
    expect(JSON.stringify(options.body)).not.toContain(privateToken.tokenHash);
    expect(unverified.response.status).toBe(401);
    expect(unverified.body).toEqual({ error: "Passkey registration verification failed." });
    expect(countsAfterOptions).toEqual({
      centralSessions: 0,
      challenges: 2,
      credentials: 0,
      handoffGrants: 0,
    });
    expect(verified.response.status).toBe(200);
    expect(verified.response.headers.get("Set-Cookie")).toContain(
      `${CENTRAL_AUTH_SESSION_COOKIE_NAME}=`,
    );
    expect(verified.response.headers.get("Set-Cookie")).not.toContain(
      `${OWNER_SESSION_COOKIE_NAME}=`,
    );
    expect(verified.response.headers.get("Set-Cookie")).not.toContain(
      `${HOST_AUTH_SESSION_COOKIE_NAME}=`,
    );
    expect(verified.body).toMatchObject({
      acceptedPrincipal: {
        principalId: "principal:passkey",
        displayName: "Passkey Collaborator",
      },
      invitation: {
        invitationId: invitation.id,
        targetEmail: "Passkey.Collab@example.com",
        targetSurface: "app-install",
        targetAppInstallId: "site",
        expiresAt: futureExpiresAt,
        invitedPrincipalDisplayName: "Passkey Collaborator",
        passkeyRegistrationRequired: true,
      },
      session: { expiresAt: expect.any(String) },
      verified: true,
    });
    expect(privateToken.consumedAt).toEqual(expect.any(String));
    expect(countsAfterVerify).toEqual({
      centralSessions: 1,
      challenges: 2,
      credentials: 1,
      handoffGrants: 0,
    });
    expect(recordById(records, "principal:passkey")).toMatchObject({
      entity: "principal",
      values: expect.objectContaining({ status: "active" }),
    });
    expect(recordById(records, "principal-email:passkey")).toMatchObject({
      entity: "principal-email",
      values: expect.objectContaining({
        principal: "principal:passkey",
        displayEmail: "Passkey.Collab@example.com",
        normalizedEmail: "passkey.collab@example.com",
        verificationStatus: "verified",
        verifiedAt: expect.any(String),
      }),
    });
    expect(recordById(records, "membership:passkey-group")).toMatchObject({
      entity: "membership",
      values: expect.objectContaining({ status: "active" }),
    });
    expect(recordById(records, "app-registration:passkey-site")).toMatchObject({
      entity: "app-registration",
      values: expect.objectContaining({ status: "active" }),
    });
    expect(acceptedInvitation).toMatchObject({
      entity: "invitation",
      values: expect.objectContaining({
        acceptedAt: expect.any(String),
        invitedPrincipal: "principal:passkey",
        status: "accepted",
      }),
    });
    expect(JSON.stringify(records)).not.toContain(token);
    expect(JSON.stringify(records)).not.toContain(privateToken.tokenHash);
  });

  it("creates an accepted principal when the invitation has no invited principal record", async () => {
    const invitation = await createInvitation({
      invitationId: "invitation:create-principal",
      targetEmail: "created-principal@example.com",
      targetSurface: "instance",
    });
    const token = rawTokenFor(invitation.id);

    await createPrivateToken({
      invitationId: invitation.id,
      rawToken: token,
      targetEmail: "created-principal@example.com",
      targetSurface: "instance",
    });

    const options = await fetchPasskeyRegistrationOptions(invitation.id, token);
    const authenticator = new VirtualPasskey("Y3JlYXRlZC1wcmluY2lwYWwtY3JlZGVudGlhbA");

    if (!("options" in options.body)) {
      throw new Error(`Expected passkey options, received ${JSON.stringify(options.body)}.`);
    }

    const verified = await verifyPasskeyRegistration(
      invitation.id,
      token,
      authenticator.registrationResponse(options.body.options, {
        origin: authOrigin,
        rpId: "example.com",
      }),
    );
    const records = await readIdentityRecords();
    const principalId = generatedInvitationPrincipalId(invitation.id);

    expect(verified.response.status).toBe(200);
    expect(recordById(records, principalId)).toMatchObject({
      entity: "principal",
      values: {
        displayName: "created-principal@example.com",
        kind: "human",
        status: "active",
      },
    });
    expect(recordById(records, invitation.id)).toMatchObject({
      entity: "invitation",
      values: expect.objectContaining({
        invitedPrincipal: principalId,
        status: "accepted",
      }),
    });
  });

  it("rejects duplicate credentials without consuming the token or accepting identity records", async () => {
    const invitation = await createInvitation({
      invitationId: "invitation:duplicate-credential",
      targetEmail: "duplicate-credential@example.com",
      targetSurface: "instance",
      invitedPrincipal: {
        id: "principal:duplicate-credential",
        displayName: "Duplicate Credential",
      },
    });
    const token = rawTokenFor(invitation.id);
    const credentialId = "ZHVwbGljYXRlLWNyZWRlbnRpYWw";

    await createPrivateToken({
      invitationId: invitation.id,
      rawToken: token,
      targetEmail: "duplicate-credential@example.com",
      targetSurface: "instance",
    });
    await createPrivateCredential({
      credentialId,
      principalId: "principal:other",
    });

    const options = await fetchPasskeyRegistrationOptions(invitation.id, token);
    const authenticator = new VirtualPasskey(credentialId);

    if (!("options" in options.body)) {
      throw new Error(`Expected passkey options, received ${JSON.stringify(options.body)}.`);
    }

    const rejected = await verifyPasskeyRegistration(
      invitation.id,
      token,
      authenticator.registrationResponse(options.body.options, {
        origin: authOrigin,
        rpId: "example.com",
      }),
    );
    const privateToken = await readPrivateToken(invitation.id);
    const records = await readIdentityRecords();

    expect(rejected.response.status).toBe(409);
    expect(rejected.body).toEqual({ error: "Passkey credential already exists." });
    expect(privateToken.consumedAt).toBeUndefined();
    expect(recordById(records, invitation.id).values.status).toBe("pending");
    expect(recordById(records, "principal:duplicate-credential").values.status).toBe("invited");
    expect(await authCounts()).toEqual({
      centralSessions: 0,
      challenges: 1,
      credentials: 1,
      handoffGrants: 0,
    });
  });

  it("rejects stale target facts without committing private or identity state", async () => {
    const invitation = await createInvitation({
      invitationId: "invitation:stale-target",
      targetEmail: "stale-target@example.com",
      targetSurface: "app-install",
      targetAppInstallId: "site",
      invitedPrincipal: {
        id: "principal:stale-target",
        displayName: "Stale Target",
      },
    });
    const token = rawTokenFor(invitation.id);

    await createPrivateToken({
      invitationId: invitation.id,
      rawToken: token,
      targetEmail: "stale-target@example.com",
      targetSurface: "app-install",
      targetAppInstallId: "site",
    });

    const options = await fetchPasskeyRegistrationOptions(invitation.id, token);

    await updateInvitationTarget(invitation.id, {
      targetSurface: "app-install",
      targetAppInstallId: "crm",
    });

    const authenticator = new VirtualPasskey("c3RhbGUtdGFyZ2V0LWNyZWRlbnRpYWw");

    if (!("options" in options.body)) {
      throw new Error(`Expected passkey options, received ${JSON.stringify(options.body)}.`);
    }

    const rejected = await verifyPasskeyRegistration(
      invitation.id,
      token,
      authenticator.registrationResponse(options.body.options, {
        origin: authOrigin,
        rpId: "example.com",
      }),
    );
    const privateToken = await readPrivateToken(invitation.id);
    const records = await readIdentityRecords();

    expect(rejected.response.status).toBe(401);
    expect(rejected.body).toEqual({
      eligible: false,
      error: "Invitation link is invalid.",
      reason: "wrong-target",
    });
    expect(privateToken.consumedAt).toBeUndefined();
    expect(recordById(records, invitation.id).values.status).toBe("pending");
    expect(recordById(records, "principal:stale-target").values.status).toBe("invited");
    expect(await authCounts()).toEqual({
      centralSessions: 0,
      challenges: 1,
      credentials: 0,
      handoffGrants: 0,
    });
  });

  it("rejects identity validation failures without consuming tokens or storing credentials", async () => {
    const invitation = await createInvitation({
      invitationId: "invitation:identity-validation",
      targetEmail: "identity-validation@example.com",
      targetSurface: "instance",
      invitedPrincipal: {
        id: "principal:identity-validation",
        displayName: "Identity Validation",
      },
      appRegistrations: [
        {
          id: "app-registration:identity-validation-pending",
          appInstallId: "site",
        },
      ],
    });
    const token = rawTokenFor(invitation.id);

    await createPrivateToken({
      invitationId: invitation.id,
      rawToken: token,
      targetEmail: "identity-validation@example.com",
      targetSurface: "instance",
    });
    await postIdentityOperation({
      entity: "app-registration",
      idempotencyKey: "create-active-duplicate-app-registration",
      input: {
        appInstallId: "site",
        targetKind: "principal",
        targetPrincipal: "principal:identity-validation",
        status: "active",
      },
      operationName: "create",
    });

    const options = await fetchPasskeyRegistrationOptions(invitation.id, token);
    const authenticator = new VirtualPasskey("aWRlbnRpdHktdmFsaWRhdGlvbi1jcmVkZW50aWFs");

    if (!("options" in options.body)) {
      throw new Error(`Expected passkey options, received ${JSON.stringify(options.body)}.`);
    }

    const rejected = await verifyPasskeyRegistration(
      invitation.id,
      token,
      authenticator.registrationResponse(options.body.options, {
        origin: authOrigin,
        rpId: "example.com",
      }),
    );
    const privateToken = await readPrivateToken(invitation.id);
    const records = await readIdentityRecords();

    expect(rejected.response.status).toBe(409);
    expect(rejected.body).toEqual({ error: "Invitation acceptance could not be committed." });
    expect(privateToken.consumedAt).toBeUndefined();
    expect(recordById(records, invitation.id).values.status).toBe("pending");
    expect(recordById(records, "principal:identity-validation").values.status).toBe("invited");
    expect(recordById(records, "app-registration:identity-validation-pending").values.status).toBe(
      "pending",
    );
    expect(await authCounts()).toEqual({
      centralSessions: 0,
      challenges: 1,
      credentials: 0,
      handoffGrants: 0,
    });
  });

  it("rejects already accepted completion retries without creating duplicate auth state", async () => {
    const invitation = await createInvitation({
      invitationId: "invitation:already-accepted-completion",
      targetEmail: "already-accepted-completion@example.com",
      targetSurface: "instance",
      invitedPrincipal: {
        id: "principal:already-accepted-completion",
        displayName: "Already Accepted Completion",
      },
    });
    const token = rawTokenFor(invitation.id);

    await createPrivateToken({
      invitationId: invitation.id,
      rawToken: token,
      targetEmail: "already-accepted-completion@example.com",
      targetSurface: "instance",
    });

    const options = await fetchPasskeyRegistrationOptions(invitation.id, token);
    const authenticator = new VirtualPasskey("YWxyZWFkeS1hY2NlcHRlZC1jcmVkZW50aWFs");

    if (!("options" in options.body)) {
      throw new Error(`Expected passkey options, received ${JSON.stringify(options.body)}.`);
    }

    const registration = authenticator.registrationResponse(options.body.options, {
      origin: authOrigin,
      rpId: "example.com",
    });
    const accepted = await verifyPasskeyRegistration(invitation.id, token, registration);
    const retried = await verifyPasskeyRegistration(invitation.id, token, registration);

    expect(accepted.response.status).toBe(200);
    expect(retried.response.status).toBe(409);
    expect(retried.body).toEqual({
      eligible: false,
      error: "Invitation has already been accepted.",
      reason: "accepted-invitation",
    });
    expect(await authCounts()).toEqual({
      centralSessions: 1,
      challenges: 1,
      credentials: 1,
      handoffGrants: 0,
    });
  });

  it("issues a central session and continues mapped app targets through target-bound handoff", async () => {
    const unique = randomUUID().replace(/-/g, "");
    const appInstallId = `invite-target-${unique}`;
    const mappedHost = `invite-target-${unique}.example.com`;
    const targetEmail = `mapped-app-${unique}@example.com`;

    await writeDefaultAuthConfig();
    await configureDefaultProductionIdentity();
    await createDefaultAppInstall(appInstallId);

    const invitation = await createInvitation({
      invitationId: `invitation:mapped-app-${unique}`,
      targetEmail,
      targetSurface: "app-install",
      targetAppInstallId: appInstallId,
      appRegistrations: [{ appInstallId }],
      invitedPrincipal: {
        id: `principal:mapped-app-${unique}`,
        displayName: "Mapped App Collaborator",
      },
    });
    const token = rawTokenFor(invitation.id);

    const route = await createDefaultRoute(`route:mapped-app:${unique}`, {
      access: "authenticated",
      appInstall: appInstallId,
      enabled: true,
      kind: "mount",
      matchHost: mappedHost,
      matchPath: "/",
      matchPrefix: "/",
      surface: "admin",
      targetProfile: "app",
    });
    await createDefaultPrivateToken({
      invitationId: invitation.id,
      rawToken: token,
      targetEmail,
      targetSurface: "app-install",
      targetAppInstallId: appInstallId,
    });

    const countsBefore = await defaultAuthCounts();
    const options = await fetchDefaultPasskeyRegistrationOptions(invitation.id, token);
    const authenticator = new VirtualPasskey(
      Buffer.from(`mapped-app-credential:${unique}`).toString("base64url"),
    );

    if (!("options" in options.body)) {
      throw new Error(`Expected passkey options, received ${JSON.stringify(options.body)}.`);
    }

    const verified = await verifyDefaultPasskeyRegistration(
      invitation.id,
      token,
      authenticator.registrationResponse(options.body.options, {
        origin: authOrigin,
        rpId: "example.com",
      }),
    );
    const sessionCookie = requiredHeader(verified.response, "Set-Cookie");

    expect(verified.response.status).toBe(200);
    expect(sessionCookie).toContain(`${CENTRAL_AUTH_SESSION_COOKIE_NAME}=`);
    expect(sessionCookie).not.toContain(`${OWNER_SESSION_COOKIE_NAME}=`);
    expect(sessionCookie).not.toContain(`${HOST_AUTH_SESSION_COOKIE_NAME}=`);
    expect(verified.body).toMatchObject({
      acceptedPrincipal: {
        displayName: "Mapped App Collaborator",
        principalId: `principal:mapped-app-${unique}`,
      },
      handoff: {
        returnTo: "/",
        targetOrigin: `https://${mappedHost}`,
      },
      continueTo: `https://${mappedHost}/`,
      accountCompletion: {
        continueTo: "/",
        status: "complete",
        target: {
          appInstallId,
          returnTo: "/",
          routeId: route.id,
          storageIdentity: `app:${appInstallId}`,
          targetOrigin: `https://${mappedHost}`,
          targetProfile: "app",
        },
      },
      session: { expiresAt: expect.any(String) },
      verified: true,
    });
    expect(JSON.stringify(verified.body)).not.toContain(token);
    expect(JSON.stringify(verified.body)).not.toContain("grantSecret");
    expect(await defaultAuthCounts()).toEqual({
      centralSessions: countsBefore.centralSessions + 1,
      challenges: countsBefore.challenges + 1,
      credentials: countsBefore.credentials + 1,
      handoffGrants: countsBefore.handoffGrants,
    });

    const target = {
      access: "authenticated" as const,
      appInstallId,
      routeId: route.id,
      storageIdentity: `app:${appInstallId}`,
      targetOrigin: `https://${mappedHost}`,
      targetProfile: "app" as const,
    };
    const nonce = Buffer.from(`nonce:${unique}`).toString("base64url");
    const state = Buffer.from(`state:${unique}`).toString("base64url");
    const handoffStartUrl = new URL(INSTANCE_AUTH_HANDOFF_START_PATH, authOrigin);

    handoffStartUrl.searchParams.set("targetOrigin", target.targetOrigin);
    handoffStartUrl.searchParams.set("access", target.access);
    handoffStartUrl.searchParams.set("routeId", target.routeId);
    handoffStartUrl.searchParams.set("targetProfile", target.targetProfile);
    handoffStartUrl.searchParams.set("appInstallId", target.appInstallId);
    handoffStartUrl.searchParams.set("storageIdentity", target.storageIdentity);
    handoffStartUrl.searchParams.set("returnTo", "/");
    handoffStartUrl.searchParams.set("nonceHash", sha256Base64Url(nonce));
    handoffStartUrl.searchParams.set("state", state);

    const grant = await harness.mf.dispatchFetch(handoffStartUrl.toString(), {
      headers: {
        Accept: "text/html",
        Cookie: cookiePair(sessionCookie),
      },
      redirect: "manual",
    });
    const grantLocation = new URL(requiredHeader(grant, "Location"), authOrigin);

    expect(grant.status).toBe(302);
    expect(grantLocation.origin).toBe(target.targetOrigin);
    expect(grantLocation.pathname).toBe(INSTANCE_AUTH_HANDOFF_CALLBACK_PATH);
    expect(grantLocation.searchParams.get("grantId")).toEqual(expect.any(String));
    expect(grantLocation.searchParams.get("grantSecret")).toEqual(expect.any(String));
    expect(grantLocation.searchParams.get("state")).toBe(state);
    expect(grantLocation.search).not.toContain(token);
    expect(await defaultAuthCounts()).toEqual({
      centralSessions: countsBefore.centralSessions + 1,
      challenges: countsBefore.challenges + 1,
      credentials: countsBefore.credentials + 1,
      handoffGrants: countsBefore.handoffGrants + 1,
    });

    expect(route.values).toMatchObject({
      appInstall: appInstallId,
      matchHost: mappedHost,
      targetProfile: "app",
    });
  });

  it("blocks mapped handoff when account completion still requires app registration", async () => {
    const unique = randomUUID().replace(/-/g, "");
    const appInstallId = `invite-blocked-${unique}`;
    const mappedHost = `invite-blocked-${unique}.example.com`;
    const targetEmail = `blocked-mapped-app-${unique}@example.com`;

    await writeDefaultAuthConfig();
    await configureDefaultProductionIdentity();
    await createDefaultAppInstall(appInstallId);

    const invitation = await createInvitation({
      invitationId: `invitation:blocked-mapped-app-${unique}`,
      targetEmail,
      targetSurface: "app-install",
      targetAppInstallId: appInstallId,
      invitedPrincipal: {
        id: `principal:blocked-mapped-app-${unique}`,
        displayName: "Blocked App Collaborator",
      },
    });
    const token = rawTokenFor(invitation.id);

    const route = await createDefaultRoute(`route:blocked-mapped-app:${unique}`, {
      access: "authenticated",
      appInstall: appInstallId,
      enabled: true,
      kind: "mount",
      matchHost: mappedHost,
      matchPath: "/",
      matchPrefix: "/",
      surface: "admin",
      targetProfile: "app",
    });
    await createDefaultPrivateToken({
      invitationId: invitation.id,
      rawToken: token,
      targetEmail,
      targetSurface: "app-install",
      targetAppInstallId: appInstallId,
    });

    const countsBefore = await defaultAuthCounts();
    const options = await fetchDefaultPasskeyRegistrationOptions(invitation.id, token);
    const authenticator = new VirtualPasskey(
      Buffer.from(`blocked-mapped-app-credential:${unique}`).toString("base64url"),
    );

    if (!("options" in options.body)) {
      throw new Error(`Expected passkey options, received ${JSON.stringify(options.body)}.`);
    }

    const verified = await verifyDefaultPasskeyRegistration(
      invitation.id,
      token,
      authenticator.registrationResponse(options.body.options, {
        origin: authOrigin,
        rpId: "example.com",
      }),
    );
    const sessionCookie = requiredHeader(verified.response, "Set-Cookie");

    expect(verified.response.status).toBe(200);
    expect(sessionCookie).toContain(`${CENTRAL_AUTH_SESSION_COOKIE_NAME}=`);
    expect(sessionCookie).not.toContain(`${OWNER_SESSION_COOKIE_NAME}=`);
    expect(sessionCookie).not.toContain(`${HOST_AUTH_SESSION_COOKIE_NAME}=`);
    expect(verified.body).toMatchObject({
      acceptedPrincipal: {
        displayName: "Blocked App Collaborator",
        principalId: `principal:blocked-mapped-app-${unique}`,
      },
      accountCompletion: {
        gate: {
          appInstallId,
          kind: "app-registration",
          registrationPolicy: "closed",
        },
        status: "blocked",
        target: {
          appInstallId,
          returnTo: "/",
          routeId: route.id,
          storageIdentity: `app:${appInstallId}`,
          targetOrigin: `https://${mappedHost}`,
          targetProfile: "app",
        },
      },
      session: { expiresAt: expect.any(String) },
      verified: true,
    });
    expect(isObjectWithKey(verified.body, "handoff")).toBe(false);
    expect(JSON.stringify(verified.body)).not.toContain(token);
    expect(JSON.stringify(verified.body)).not.toContain("grantSecret");
    expect(await defaultAuthCounts()).toEqual({
      centralSessions: countsBefore.centralSessions + 1,
      challenges: countsBefore.challenges + 1,
      credentials: countsBefore.credentials + 1,
      handoffGrants: countsBefore.handoffGrants,
    });
  });

  it("blocks accepted custom-operation app invitations until profile completion commits", async () => {
    const unique = randomUUID().replace(/-/g, "");
    const appInstallId = `invite-custom-${unique}`;
    const mappedHost = `invite-custom-${unique}.example.com`;
    const targetEmail = `custom-invite-${unique}@example.com`;
    const principalId = `principal:custom-invite-${unique}`;

    await writeDefaultAuthConfig();
    await configureDefaultProductionIdentity();
    await createDefaultAppInstall(appInstallId, {
      label: "Custom invitation target",
      packageAppKey: customOnboardingPackageAppKey,
      registrationOperation: customOnboardingRegistrationOperationKey,
      registrationPolicy: "custom-operation",
    });

    const invitation = await createInvitation({
      invitationId: `invitation:custom-invite-${unique}`,
      targetEmail,
      targetSurface: "app-install",
      targetAppInstallId: appInstallId,
      appRegistrations: [{ appInstallId }],
      invitedPrincipal: {
        id: principalId,
        displayName: "Custom App Collaborator",
      },
    });
    const token = rawTokenFor(invitation.id);

    const route = await createDefaultRoute(`route:custom-invite:${unique}`, {
      access: "authenticated",
      appInstall: appInstallId,
      enabled: true,
      kind: "mount",
      matchHost: mappedHost,
      matchPath: "/",
      matchPrefix: "/",
      surface: "admin",
      targetProfile: "app",
    });
    const target: AccountCompletionGateTarget = {
      access: "authenticated",
      appInstallId,
      returnTo: "/",
      routeId: route.id,
      storageIdentity: `app:${appInstallId}`,
      targetOrigin: `https://${mappedHost}`,
      targetProfile: "app",
    };

    await createDefaultPrivateToken({
      invitationId: invitation.id,
      rawToken: token,
      targetEmail,
      targetSurface: "app-install",
      targetAppInstallId: appInstallId,
    });

    const countsBefore = await defaultAuthCounts();
    const options = await fetchDefaultPasskeyRegistrationOptions(invitation.id, token);
    const authenticator = new VirtualPasskey(
      Buffer.from(`custom-invite-credential:${unique}`).toString("base64url"),
    );

    if (!("options" in options.body)) {
      throw new Error(`Expected passkey options, received ${JSON.stringify(options.body)}.`);
    }

    const verified = await verifyDefaultPasskeyRegistration(
      invitation.id,
      token,
      authenticator.registrationResponse(options.body.options, {
        origin: authOrigin,
        rpId: "example.com",
      }),
    );
    const sessionCookie = requiredHeader(verified.response, "Set-Cookie");
    const nonce = Buffer.from(`nonce:${unique}`).toString("base64url");
    const state = Buffer.from(`state:${unique}`).toString("base64url");
    const profileCompletion = await completeDefaultProfileCompletionGate({
      cookie: cookiePair(sessionCookie),
      idempotencyKey: `custom-invite-profile-${unique}`,
      input: {
        displayName: "Custom Invitation Profile",
        principal: principalId,
      },
      nonceHash: sha256Base64Url(nonce),
      operation: customOnboardingProfileCompletionOperation(appInstallId),
      state,
      target,
    });
    const handoffUrl = new URL(stringBodyValue(profileCompletion.body, "continueTo"), authOrigin);
    const grant = await harness.mf.dispatchFetch(handoffUrl.toString(), {
      headers: {
        Accept: "text/html",
        Cookie: cookiePair(sessionCookie),
      },
      redirect: "manual",
    });
    const grantLocation = new URL(requiredHeader(grant, "Location"), authOrigin);
    const appRecords = await readDefaultAppRecords(customOnboardingPackageAppKey, appInstallId);
    const profiles = appRecords.records.filter(
      (record) => record.entity === "profile" && !record.deletedAt,
    );

    expect(verified.response.status).toBe(200);
    expect(sessionCookie).toContain(`${CENTRAL_AUTH_SESSION_COOKIE_NAME}=`);
    expect(sessionCookie).not.toContain(`${OWNER_SESSION_COOKIE_NAME}=`);
    expect(sessionCookie).not.toContain(`${HOST_AUTH_SESSION_COOKIE_NAME}=`);
    expect(verified.body).toMatchObject({
      acceptedPrincipal: {
        displayName: "Custom App Collaborator",
        principalId,
      },
      accountCompletion: {
        gate: {
          appInstallId,
          kind: "profile-completion",
          operation: customOnboardingProfileCompletionOperation(appInstallId),
        },
        status: "blocked",
        target,
      },
      session: { expiresAt: expect.any(String) },
      verified: true,
    });
    expect(isObjectWithKey(verified.body, "continueTo")).toBe(false);
    expect(isObjectWithKey(verified.body, "handoff")).toBe(false);
    expect(JSON.stringify(verified.body)).not.toContain(token);
    expect(JSON.stringify(verified.body)).not.toContain("grantSecret");

    expect(profileCompletion.response.status).toBe(200);
    expect(profileCompletion.body).toMatchObject({
      accountCompletion: {
        continueTo: "/",
        status: "complete",
        target,
      },
      completed: true,
      handoff: {
        returnTo: "/",
        targetOrigin: `https://${mappedHost}`,
      },
    });
    expect(handoffUrl.pathname).toBe(INSTANCE_AUTH_HANDOFF_START_PATH);
    expect(handoffUrl.searchParams.get("targetOrigin")).toBe(`https://${mappedHost}`);
    expect(handoffUrl.searchParams.get("appInstallId")).toBe(appInstallId);
    expect(handoffUrl.searchParams.get("storageIdentity")).toBe(`app:${appInstallId}`);
    expect(handoffUrl.searchParams.get("nonceHash")).toBe(sha256Base64Url(nonce));
    expect(handoffUrl.searchParams.get("state")).toBe(state);
    expect(JSON.stringify(profileCompletion.body)).not.toContain("Custom Invitation Profile");

    expect(grant.status).toBe(302);
    expect(grantLocation.origin).toBe(`https://${mappedHost}`);
    expect(grantLocation.pathname).toBe(INSTANCE_AUTH_HANDOFF_CALLBACK_PATH);
    expect(grantLocation.searchParams.get("grantId")).toEqual(expect.any(String));
    expect(grantLocation.searchParams.get("grantSecret")).toEqual(expect.any(String));
    expect(grantLocation.searchParams.get("state")).toBe(state);

    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      entity: "profile",
      values: {
        actorPrincipalId: principalId,
        displayName: "Custom Invitation Profile",
        principal: principalId,
      },
    });
    expect(await defaultAuthCounts()).toEqual({
      centralSessions: countsBefore.centralSessions + 1,
      challenges: countsBefore.challenges + 1,
      credentials: countsBefore.credentials + 1,
      handoffGrants: countsBefore.handoffGrants + 1,
    });
  });

  it("continues instance targets through the preferred admin origin and normal handoff", async () => {
    const unique = randomUUID().replace(/-/g, "");
    const decoyHost = `invite-instance-decoy-${unique}.example.com`;
    const adminHost = `invite-instance-admin-${unique}.example.com`;
    const targetEmail = `mapped-instance-${unique}@example.com`;
    const invitation = await createInvitation({
      invitationId: `invitation:mapped-instance-${unique}`,
      targetEmail,
      targetSurface: "instance",
      invitedPrincipal: {
        id: `principal:mapped-instance-${unique}`,
        displayName: "Mapped Instance Collaborator",
      },
    });
    const token = rawTokenFor(invitation.id);

    await writeDefaultAuthConfig();
    const decoyRoute = await createDefaultRoute(`aaa-instance-decoy-${unique}`, {
      access: "authenticated",
      enabled: true,
      kind: "mount",
      matchHost: decoyHost,
      matchPath: "/",
      matchPrefix: "/",
      surface: "admin",
      targetProfile: "instance",
    });
    const adminRoute = await createDefaultRoute(`zzz-instance-admin-${unique}`, {
      access: "authenticated",
      enabled: true,
      kind: "mount",
      matchHost: adminHost,
      matchPath: "/",
      matchPrefix: "/",
      surface: "admin",
      targetProfile: "instance",
    });

    await configureDefaultProductionIdentity({ adminRoute: adminRoute.id });
    await createDefaultPrivateToken({
      invitationId: invitation.id,
      rawToken: token,
      targetEmail,
      targetSurface: "instance",
    });

    const countsBefore = await defaultAuthCounts();
    const options = await fetchDefaultPasskeyRegistrationOptions(invitation.id, token);
    const authenticator = new VirtualPasskey(
      Buffer.from(`mapped-instance-credential:${unique}`).toString("base64url"),
    );

    if (!("options" in options.body)) {
      throw new Error(`Expected passkey options, received ${JSON.stringify(options.body)}.`);
    }

    const verified = await verifyDefaultPasskeyRegistration(
      invitation.id,
      token,
      authenticator.registrationResponse(options.body.options, {
        origin: authOrigin,
        rpId: "example.com",
      }),
    );
    const sessionCookie = requiredHeader(verified.response, "Set-Cookie");

    const handoffCandidate = isObjectWithKey(verified.body, "handoff")
      ? verified.body.handoff
      : undefined;

    if (
      !isObjectWithKey(handoffCandidate, "returnTo") ||
      !isObjectWithKey(handoffCandidate, "targetOrigin") ||
      typeof handoffCandidate.returnTo !== "string" ||
      typeof handoffCandidate.targetOrigin !== "string"
    ) {
      throw new Error(`Expected handoff continuation, received ${JSON.stringify(verified.body)}.`);
    }
    const handoff = {
      returnTo: handoffCandidate.returnTo,
      targetOrigin: handoffCandidate.targetOrigin,
    };

    expect(verified.response.status).toBe(200);
    expect(sessionCookie).toContain(`${CENTRAL_AUTH_SESSION_COOKIE_NAME}=`);
    expect(sessionCookie).not.toContain(`${OWNER_SESSION_COOKIE_NAME}=`);
    expect(sessionCookie).not.toContain(`${HOST_AUTH_SESSION_COOKIE_NAME}=`);
    expect(decoyRoute.values.matchHost).toBe(decoyHost);
    expect(verified.body).toMatchObject({
      acceptedPrincipal: {
        displayName: "Mapped Instance Collaborator",
        principalId: `principal:mapped-instance-${unique}`,
      },
      handoff: {
        returnTo: "/",
        targetOrigin: `https://${adminHost}`,
      },
      continueTo: `https://${adminHost}/`,
      accountCompletion: {
        continueTo: "/",
        status: "complete",
        target: {
          returnTo: "/",
          routeId: adminRoute.id,
          storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
          targetOrigin: `https://${adminHost}`,
          targetProfile: "instance",
        },
      },
      session: { expiresAt: expect.any(String) },
      verified: true,
    });
    expect(JSON.stringify(verified.body)).not.toContain(decoyHost);
    expect(await defaultAuthCounts()).toEqual({
      centralSessions: countsBefore.centralSessions + 1,
      challenges: countsBefore.challenges + 1,
      credentials: countsBefore.credentials + 1,
      handoffGrants: countsBefore.handoffGrants,
    });

    const continuationUrl = new URL(handoff.returnTo, handoff.targetOrigin);
    const target = {
      access: "authenticated" as const,
      routeId: adminRoute.id,
      storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
      targetOrigin: `https://${adminHost}`,
      targetProfile: "instance" as const,
    };
    const nonce = Buffer.from(`instance-nonce:${unique}`).toString("base64url");
    const state = Buffer.from(`instance-state:${unique}`).toString("base64url");
    const handoffStartUrl = new URL(INSTANCE_AUTH_HANDOFF_START_PATH, authOrigin);

    handoffStartUrl.searchParams.set("targetOrigin", target.targetOrigin);
    handoffStartUrl.searchParams.set("access", target.access);
    handoffStartUrl.searchParams.set("routeId", target.routeId);
    handoffStartUrl.searchParams.set("targetProfile", target.targetProfile);
    handoffStartUrl.searchParams.set("storageIdentity", target.storageIdentity);
    handoffStartUrl.searchParams.set("returnTo", "/");
    handoffStartUrl.searchParams.set("nonceHash", sha256Base64Url(nonce));
    handoffStartUrl.searchParams.set("state", state);

    expect(continuationUrl.origin).toBe(`https://${adminHost}`);
    expect(continuationUrl.pathname).toBe("/");
    expect(continuationUrl.search).toBe("");
    expect(handoffStartUrl.searchParams.get("targetOrigin")).toBe(`https://${adminHost}`);
    expect(handoffStartUrl.searchParams.get("routeId")).toBe(adminRoute.id);
    expect(handoffStartUrl.searchParams.get("targetProfile")).toBe("instance");
    expect(handoffStartUrl.searchParams.get("storageIdentity")).toBe(
      FORMLESS_PROGRAM_STORAGE_IDENTITY,
    );
    expect(handoffStartUrl.searchParams.get("returnTo")).toBe("/");

    const grant = await harness.mf.dispatchFetch(handoffStartUrl.toString(), {
      headers: {
        Accept: "text/html",
        Cookie: cookiePair(sessionCookie),
      },
      redirect: "manual",
    });
    const grantLocation = new URL(requiredHeader(grant, "Location"), authOrigin);

    expect(grant.status).toBe(302);
    expect(grantLocation.origin).toBe(target.targetOrigin);
    expect(grantLocation.pathname).toBe(INSTANCE_AUTH_HANDOFF_CALLBACK_PATH);
    expect(grantLocation.searchParams.get("grantId")).toEqual(expect.any(String));
    expect(grantLocation.searchParams.get("grantSecret")).toEqual(expect.any(String));
    expect(grantLocation.searchParams.get("state")).toBe(state);
    expect(grantLocation.search).not.toContain(token);
    expect(await defaultAuthCounts()).toEqual({
      centralSessions: countsBefore.centralSessions + 1,
      challenges: countsBefore.challenges + 1,
      credentials: countsBefore.credentials + 1,
      handoffGrants: countsBefore.handoffGrants + 1,
    });
  });

  it("does not start invitation passkey ceremonies on mapped app or public Site hosts", async () => {
    const invitation = await prepareActiveInvitation("invitation:mapped-hosts", {
      targetEmail: "mapped-hosts@example.com",
    });

    for (const origin of [mappedAppOrigin, mappedSiteOrigin]) {
      const options = await fetchPasskeyRegistrationOptions(
        invitation.id,
        rawTokenFor(invitation.id),
        origin,
      );

      expect(options.response.status).toBe(404);
      expect(options.body).toEqual({
        eligible: false,
        error: "Invitation must be accepted on the configured auth origin.",
        reason: "wrong-origin",
      });
    }

    expect(await authCounts()).toEqual({
      centralSessions: 0,
      challenges: 0,
      credentials: 0,
      handoffGrants: 0,
    });
  });
});

async function prepareActiveInvitation(
  invitationId: string,
  input: {
    targetEmail: string;
  },
) {
  const invitation = await createInvitation({
    invitationId,
    targetEmail: input.targetEmail,
    targetSurface: "instance",
  });

  await createPrivateToken({
    invitationId: invitation.id,
    rawToken: rawTokenFor(invitation.id),
    targetEmail: input.targetEmail,
    targetSurface: "instance",
  });

  return invitation;
}

async function createInvitation(input: {
  appRegistrations?: Array<{
    appInstallId: string;
    id?: string;
    selectedOrganization?: string;
  }>;
  invitationId: string;
  invitedPrincipal?: {
    displayName: string;
    id: string;
  };
  memberships?: Array<{
    id?: string;
    targetGroup?: string;
    targetKind: "group" | "organization";
    targetOrganization?: string;
  }>;
  now?: string;
  principalEmail?: {
    id?: string;
    primary?: boolean;
    recovery?: boolean;
  };
  targetAppInstallId?: string;
  targetEmail: string;
  targetOrganization?: string;
  targetSurface: "app-install" | "instance" | "organization";
}): Promise<StoredRecord> {
  const response = await harness.fetch(`${identityApi}/collaborator-invitations`, {
    body: JSON.stringify({
      idempotencyKey: `create-${input.invitationId}`,
      invitationId: input.invitationId,
      targetEmail: input.targetEmail,
      targetSurface: input.targetSurface,
      ...(input.targetAppInstallId === undefined
        ? {}
        : { targetAppInstallId: input.targetAppInstallId }),
      ...(input.targetOrganization === undefined
        ? {}
        : { targetOrganization: input.targetOrganization }),
      now: input.now ?? createdAt,
      ...(input.invitedPrincipal === undefined ? {} : { invitedPrincipal: input.invitedPrincipal }),
      ...(input.principalEmail === undefined ? {} : { principalEmail: input.principalEmail }),
      ...(input.memberships === undefined ? {} : { memberships: input.memberships }),
      ...(input.appRegistrations === undefined ? {} : { appRegistrations: input.appRegistrations }),
    }),
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });
  const body = (await response.json()) as CollaboratorInvitationResponse;

  expect(response.status).toBe(200);

  return body.invitation;
}

async function updateInvitationStatus(invitationId: string, status: string) {
  const request = recordOperationRequest({
    entity: "invitation",
    idempotencyKey: `update-${invitationId}-${status}`,
    input: { status },
    operationName: "update",
    recordId: invitationId,
  });
  const response = await harness.fetch(`${controlPlaneApi}${request.path.slice("/api".length)}`, {
    body: JSON.stringify(request.body),
    headers: {
      ...(await testIdentityOwnerSessionHeaders(harness, adminToken)),
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const body = (await response.json()) as
    | OperationInvocationResponse
    | {
        error: string;
      };
  expect(response.status).toBe(200);
  return body;
}
async function updateInvitationTarget(
  invitationId: string,
  target: {
    targetAppInstallId?: string;
    targetOrganization?: string;
    targetSurface: "app-install" | "instance" | "organization";
  },
) {
  const response = await harness.fetch("/harness/identity/invitation-target", {
    body: JSON.stringify({ invitationId, ...target }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  expect(response.status).toBe(200);

  return await response.json();
}

async function createUnrelatedPrincipalForEmail(email: string) {
  const principal = await postIdentityOperation({
    entity: "principal",
    idempotencyKey: `create-unrelated-${email}`,
    input: {
      displayName: "Unrelated Principal",
      kind: "human",
      status: "active",
    },
    operationName: "create",
  });

  await postIdentityOperation({
    entity: "principal-email",
    idempotencyKey: `create-unrelated-email-${email}`,
    input: {
      principal: principal.id,
      displayEmail: email,
      normalizedEmail: email.toLowerCase(),
      verificationStatus: "verified",
      primary: true,
      recovery: false,
      verifiedAt: createdAt,
    },
    operationName: "create",
  });
}

async function postIdentityOperation(input: Parameters<typeof recordOperationRequest>[0]) {
  const request = recordOperationRequest(input);
  const response = await harness.fetch(`${controlPlaneApi}${request.path.slice("/api".length)}`, {
    body: JSON.stringify(request.body),
    headers: {
      ...(await testIdentityOwnerSessionHeaders(harness, adminToken)),
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const body = await response.json();

  expect(response.status).toBe(200);

  return request.response(body).record;
}

async function fetchAcceptanceStatus(invitationId: string, token: string, origin = authOrigin) {
  const url = new URL("/harness/auth/acceptance", authOrigin);

  url.searchParams.set("origin", origin);
  url.searchParams.set("invitationId", invitationId);
  url.searchParams.set("token", token);

  const response = await fetchAuthHarness(`${url.pathname}${url.search}`);
  const value = await response.json();

  if (typeof value === "object" && value !== null && !("eligible" in value)) {
    throw new Error(`Expected acceptance status response, received ${JSON.stringify(value)}.`);
  }

  const body = parseCollaboratorInvitationAcceptanceStatusResponse(value);

  return { body, response };
}

async function fetchPasskeyRegistrationOptions(
  invitationId: string,
  token: string,
  origin = authOrigin,
) {
  const url = new URL("/harness/auth/acceptance/passkeys/register/options", authOrigin);

  url.searchParams.set("origin", origin);

  const response = await fetchAuthHarness(`${url.pathname}${url.search}`, {
    body: JSON.stringify({ invitationId, token }),
    method: "POST",
  });
  const value = await response.json();
  const body = response.ok
    ? parseCollaboratorInvitationPasskeyRegistrationOptionsResponse(value)
    : parseCollaboratorInvitationAcceptanceStatusResponse(value);

  return { body, response };
}

async function verifyPasskeyRegistration(
  invitationId: string,
  token: string,
  registration: RegistrationResponseJSON,
  origin = authOrigin,
) {
  const url = new URL("/harness/auth/acceptance/passkeys/register/verify", authOrigin);

  url.searchParams.set("origin", origin);

  const response = await fetchAuthHarness(`${url.pathname}${url.search}`, {
    body: JSON.stringify({ invitationId, token, response: registration }),
    method: "POST",
  });
  const value = await response.json();
  const body = response.ok
    ? parseCollaboratorInvitationPasskeyRegistrationVerifyResponse(value)
    : isObjectWithKey(value, "eligible")
      ? parseCollaboratorInvitationAcceptanceStatusResponse(value)
      : value;

  return { body, response };
}

async function writeAuthConfig() {
  await postAuthHarness("/harness/auth/config", {
    canonicalOrigin: authOrigin,
    relyingPartyId: "example.com",
    relyingPartyName: "Formless",
    now: createdAt,
  });
}

async function createPrivateToken(input: Record<string, unknown>) {
  await postAuthHarness("/harness/auth/token", {
    createdAt,
    expiresAt: futureExpiresAt,
    ...input,
  });
}

async function revokePrivateToken(invitationId: string) {
  await postAuthHarness("/harness/auth/token/revoke", {
    invitationId,
    now: createdAt,
  });
}

async function consumePrivateToken(invitationId: string, token: string) {
  await postAuthHarness("/harness/auth/token/consume", {
    invitationId,
    rawToken: token,
    now: createdAt,
  });
}

function rawTokenFor(invitationId: string) {
  return Buffer.from(`raw-token:${invitationId}`).toString("base64url");
}

async function readPrivateToken(invitationId: string): Promise<PrivateInvitationToken> {
  const response = await fetchAuthHarness(
    `/harness/auth/token?invitationId=${encodeURIComponent(invitationId)}`,
  );
  const body = (await response.json()) as {
    token: PrivateInvitationToken | null;
  };
  expect(response.status).toBe(200);
  expect(body.token).not.toBeNull();
  return body.token as PrivateInvitationToken;
}
async function authCounts() {
  const response = await fetchAuthHarness("/harness/auth/counts");
  const body = (await response.json()) as {
    centralSessions: number;
    challenges: number;
    credentials: number;
    handoffGrants: number;
  };

  expect(response.status).toBe(200);

  return body;
}

async function readIdentityRecords(): Promise<StoredRecord[]> {
  const response = await harness.fetch(`${controlPlaneApi}/bootstrap`, {
    headers: adminHeaders(),
  });
  const body = (await response.json()) as BootstrapResponse;

  expect(response.status).toBe(200);

  return body.records;
}

function recordById(records: readonly StoredRecord[], id: string): StoredRecord {
  const record = records.find((candidate) => candidate.id === id && !candidate.deletedAt);

  if (!record) {
    throw new Error(`Expected identity record "${id}".`);
  }

  return record;
}

async function createPrivateCredential(input: { credentialId: string; principalId: string }) {
  await postAuthHarness("/harness/auth/credential", input);
}

async function postAuthHarness(path: string, body: unknown) {
  const response = await fetchAuthHarness(path, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  expect(response.status).toBe(200);

  return await response.json();
}

function fetchAuthHarness(path: string, init: Parameters<Harness["fetch"]>[1] = {}) {
  return harness.fetch(path, {
    body: init.body,
    headers: { "x-instance-auth-harness-name": instanceAuthHarnessName },
    method: init.method,
  });
}

function fetchDefaultAuthHarness(path: string, init: Parameters<Harness["fetch"]>[1] = {}) {
  return harness.fetch(path, init);
}

async function writeDefaultAuthConfig() {
  await postDefaultAuthHarness("/harness/auth/config", {
    canonicalOrigin: authOrigin,
    relyingPartyId: "example.com",
    relyingPartyName: "Formless",
    now: createdAt,
  });
}

async function createDefaultPrivateToken(input: Record<string, unknown>) {
  await postDefaultAuthHarness("/harness/auth/token", {
    createdAt,
    expiresAt: futureExpiresAt,
    ...input,
  });
}

async function postDefaultAuthHarness(path: string, body: unknown) {
  const response = await fetchDefaultAuthHarness(path, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  expect(response.status).toBe(200);

  return await response.json();
}

async function defaultAuthCounts() {
  const response = await fetchDefaultAuthHarness("/harness/auth/counts");
  const body = (await response.json()) as {
    centralSessions: number;
    challenges: number;
    credentials: number;
    handoffGrants: number;
  };

  expect(response.status).toBe(200);

  return body;
}

async function fetchDefaultPasskeyRegistrationOptions(invitationId: string, token: string) {
  const response = await fetchDefaultAuthHarness(
    "/harness/auth/acceptance/passkeys/register/options",
    {
      body: JSON.stringify({ invitationId, token }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  const value = await response.json();
  const body = response.ok
    ? parseCollaboratorInvitationPasskeyRegistrationOptionsResponse(value)
    : parseCollaboratorInvitationAcceptanceStatusResponse(value);

  return { body, response };
}

async function verifyDefaultPasskeyRegistration(
  invitationId: string,
  token: string,
  registration: RegistrationResponseJSON,
) {
  const response = await fetchDefaultAuthHarness(
    "/harness/auth/acceptance/passkeys/register/verify",
    {
      body: JSON.stringify({ invitationId, token, response: registration }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  const value = await response.json();
  const body = response.ok
    ? parseCollaboratorInvitationPasskeyRegistrationVerifyResponse(value)
    : isObjectWithKey(value, "eligible")
      ? parseCollaboratorInvitationAcceptanceStatusResponse(value)
      : value;

  return { body, response };
}

async function completeDefaultProfileCompletionGate(input: {
  cookie: string;
  idempotencyKey: string;
  input: Record<string, unknown>;
  nonceHash: string;
  operation: Record<string, unknown>;
  state: string;
  target: AccountCompletionGateTarget;
}) {
  const url = new URL(INSTANCE_AUTH_PROFILE_COMPLETION_GATE_COMPLETE_PATH, authOrigin);

  url.searchParams.set("nonceHash", input.nonceHash);
  url.searchParams.set("state", input.state);

  const response = await harness.mf.dispatchFetch(url.toString(), {
    body: JSON.stringify({
      idempotencyKey: input.idempotencyKey,
      input: input.input,
      operation: input.operation,
      target: input.target,
    }),
    headers: {
      "Content-Type": "application/json",
      Cookie: input.cookie,
    },
    method: "POST",
  });

  return {
    body: (await response.json()) as Record<string, unknown>,
    response,
  };
}
async function configureDefaultProductionIdentity(
  input: {
    adminRoute?: string;
  } = {},
) {
  const values = {
    ...(input.adminRoute === undefined ? {} : { adminRoute: input.adminRoute }),
    canonicalOrigin: "https://www.example.com",
    authOrigin,
    productionIdentityStatus: "configured",
  };

  await upsertDefaultControlPlaneRecord(
    "instance-settings",
    `default-auth-origin-${randomUUID()}`,
    {
      settingsId: "instance",
      ...values,
    },
    values,
  );
}

async function createDefaultAppInstall(
  installId: string,
  values: {
    label?: string;
    packageAppKey?: string;
    registrationOperation?: string;
    registrationPolicy?: "closed" | "custom-operation" | "email-verified";
  } = {},
) {
  const response = await harness.fetch(
    `${controlPlaneApi}/operations/app-install/createAppInstall`,
    {
      body: JSON.stringify({
        idempotencyKey: `create-install-${installId}`,
        input: {
          installId,
          label: "Invitation target",
          packageAppKey: "tasks",
          ...values,
        },
      }),
      headers: adminHeaders({ "Content-Type": "application/json" }),
      method: "POST",
    },
  );

  expect(response.status).toBe(200);
}

async function createDefaultRoute(idempotencyKey: string, input: Record<string, unknown>) {
  const body = await postDefaultControlPlaneOperation("route", idempotencyKey, input);

  return operationRecord(body);
}

async function postDefaultControlPlaneOperation(
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

  if (response.status !== 200) {
    throw new Error(`Expected ${entity} operation to succeed, received ${JSON.stringify(body)}.`);
  }

  return body;
}

async function upsertDefaultControlPlaneRecord(
  entity: string,
  idempotencyKey: string,
  createInput: Record<string, unknown>,
  updateInput: Record<string, unknown> = createInput,
) {
  const records = await readDefaultControlPlaneRecords();
  const existing = records.find((record) => record.entity === entity && !record.deletedAt);

  if (!existing) {
    return operationRecord(
      await postDefaultControlPlaneOperation(entity, idempotencyKey, createInput),
    );
  }

  const request = recordOperationRequest({
    entity,
    idempotencyKey,
    input: updateInput,
    operationName: "update",
    recordId: existing.id,
  });
  const response = await harness.fetch(`${controlPlaneApi}${request.path.slice("/api".length)}`, {
    body: JSON.stringify(request.body),
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });
  const body = await response.json();

  if (response.status !== 200) {
    throw new Error(`Expected ${entity} upsert to succeed, received ${JSON.stringify(body)}.`);
  }

  return request.response(body).record;
}

async function readDefaultControlPlaneRecords(): Promise<StoredRecord[]> {
  const response = await harness.fetch(`${controlPlaneApi}/bootstrap`, {
    headers: adminHeaders(),
  });
  const body = (await response.json()) as BootstrapResponse;

  expect(response.status).toBe(200);

  return body.records;
}

async function readDefaultAppRecords(
  packageAppKey: string,
  appInstallId: string,
): Promise<{
  records: StoredRecord[];
}> {
  const response = await harness.fetch(
    `/harness/app-records?installId=${encodeURIComponent(appInstallId)}&packageAppKey=${encodeURIComponent(packageAppKey)}`,
  );
  const body = (await response.json()) as {
    records: StoredRecord[];
  };
  expect(response.status).toBe(200);
  return body;
}
function operationRecord(response: OperationInvocationResponse): StoredRecord {
  const output = response.output;
  if (output.type !== "create" && output.type !== "update") {
    throw new Error(`Expected record write output, received "${output.type}".`);
  }

  return output.record;
}

async function resetIdentityStorage() {
  await resetTestIdentityStorage(harness, adminToken);
}

function adminHeaders(headers: Record<string, string> = {}) {
  return {
    ...headers,
    Authorization: `Bearer ${adminToken}`,
  };
}
function requiredHeader(
  response: {
    headers: {
      get(name: string): string | null;
    };
  },
  name: string,
): string {
  const value = response.headers.get(name);

  if (!value) {
    throw new Error(`Expected response header "${name}".`);
  }

  return value;
}

function sha256Base64Url(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

function cookiePair(cookie: string) {
  return cookie.split(";")[0] ?? cookie;
}

function generatedInvitationPrincipalId(invitationId: string) {
  return `principal:invitation:${Buffer.from(invitationId).toString("base64url")}`;
}

function stringBodyValue(body: Record<string, unknown>, key: string): string {
  const value = body[key];

  if (typeof value !== "string") {
    throw new Error(`Expected response field "${key}" to be a string.`);
  }

  return value;
}

function isObjectWithKey(value: unknown, key: string): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && key in value;
}

class VirtualPasskey {
  private readonly credentialId: string;
  private readonly publicKey: KeyObject;

  constructor(credentialIdValue: string) {
    const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });

    this.credentialId = credentialIdValue;
    this.publicKey = pair.publicKey;
  }
  registrationResponse(
    options: PublicKeyCredentialCreationOptionsJSON,
    input: {
      origin: string;
      rpId: string;
      userVerified?: boolean;
    },
  ): RegistrationResponseJSON {
    const clientDataJSON = clientDataJson("webauthn.create", options.challenge, input.origin);
    const authData = registrationAuthenticatorData({
      credentialId: base64UrlDecode(this.credentialId),
      credentialPublicKey: this.credentialPublicKey(),
      counter: 0,
      rpId: input.rpId,
      userVerified: input.userVerified ?? true,
    });
    const attestationObject = cborMap([
      ["fmt", "none"],
      ["attStmt", []],
      ["authData", authData],
    ]);

    return {
      id: this.credentialId,
      rawId: this.credentialId,
      response: {
        clientDataJSON: base64UrlEncode(clientDataJSON),
        attestationObject: base64UrlEncode(attestationObject),
        transports: ["internal"],
      },
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      type: "public-key",
    };
  }

  private credentialPublicKey(): Uint8Array {
    const jwk = this.publicKey.export({ format: "jwk" }) as JsonWebKey;

    if (!jwk.x || !jwk.y) {
      throw new Error("Virtual passkey public key export is missing coordinates.");
    }

    return cborMap([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, base64UrlDecode(jwk.x)],
      [-3, base64UrlDecode(jwk.y)],
    ]);
  }
}

function registrationAuthenticatorData(input: {
  counter: number;
  credentialId: Uint8Array;
  credentialPublicKey: Uint8Array;
  rpId: string;
  userVerified: boolean;
}) {
  const credentialIdLength = new Uint8Array(2);
  const credentialIdLengthView = new DataView(credentialIdLength.buffer);

  credentialIdLengthView.setUint16(0, input.credentialId.byteLength, false);

  return concatBytes([
    sha256(new TextEncoder().encode(input.rpId)),
    new Uint8Array([input.userVerified ? 0x45 : 0x41]),
    uint32(input.counter),
    new Uint8Array(16),
    credentialIdLength,
    input.credentialId,
    input.credentialPublicKey,
  ]);
}

function clientDataJson(type: "webauthn.create", challenge: string, origin: string) {
  return new TextEncoder().encode(
    JSON.stringify({
      type,
      challenge,
      origin,
      crossOrigin: false,
    }),
  );
}

type CborMapKey = number | string;
type CborMapEntry = readonly [CborMapKey, CborValue];
type CborValue = number | string | Uint8Array | readonly CborMapEntry[];

function cborMap(entries: readonly CborMapEntry[]): Uint8Array {
  return concatBytes([
    cborHeader(5, entries.length),
    ...entries.flatMap(([key, value]) => [cborEncode(key), cborEncode(value)]),
  ]);
}

function cborEncode(value: CborValue): Uint8Array {
  if (typeof value === "number") {
    return value >= 0 ? cborHeader(0, value) : cborHeader(1, -1 - value);
  }

  if (typeof value === "string") {
    const bytes = new TextEncoder().encode(value);

    return concatBytes([cborHeader(3, bytes.byteLength), bytes]);
  }

  if (value instanceof Uint8Array) {
    return concatBytes([cborHeader(2, value.byteLength), value]);
  }

  return cborMap(value);
}

function cborHeader(major: number, value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("CBOR value must be a non-negative integer.");
  }

  if (value < 24) {
    return new Uint8Array([(major << 5) | value]);
  }

  if (value <= 0xff) {
    return new Uint8Array([(major << 5) | 24, value]);
  }

  if (value <= 0xffff) {
    const bytes = new Uint8Array(3);
    const view = new DataView(bytes.buffer);

    bytes[0] = (major << 5) | 25;
    view.setUint16(1, value, false);

    return bytes;
  }

  const bytes = new Uint8Array(5);
  const view = new DataView(bytes.buffer);

  bytes[0] = (major << 5) | 26;
  view.setUint32(1, value, false);

  return bytes;
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, value, false);

  return bytes;
}

function sha256(bytes: Uint8Array): Uint8Array {
  return createHash("sha256").update(Buffer.from(bytes)).digest();
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function base64UrlDecode(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

async function writeCollaboratorInvitationAcceptanceHarness() {
  harnessDir = await mkdtemp(join(tmpdir(), "formless-invitation-acceptance-harness-"));

  const path = join(harnessDir, "collaborator-invitation-acceptance-harness.ts");

  await writeFile(
    path,
    `
      import { FormlessAuthority } from "${process.cwd()}/src/worker/authority.ts";
      import {
        COLLABORATOR_INVITATION_PASSKEY_REGISTER_OPTIONS_PATH,
        COLLABORATOR_INVITATION_PASSKEY_REGISTER_VERIFY_PATH,
        handleCollaboratorInvitationAcceptanceDurableObjectRequest,
      } from "${process.cwd()}/src/worker/collaborator-invitation-acceptance.ts";
      import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "${process.cwd()}/src/worker/formless-instance.ts";
      import { IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX } from "@dpeek/formless-identity-control-plane";
      import { FORMLESS_PROGRAM_API_ROUTE_PREFIX, FORMLESS_PROGRAM_STORAGE_IDENTITY } from "${process.cwd()}/src/program/target.ts";
      import { getBootstrapRecords } from "${process.cwd()}/src/worker/storage.ts";
      import {
        consumeCollaboratorInvitationToken,
        createCollaboratorInvitationToken,
        COLLABORATOR_INVITATION_ACCEPT_PATH,
        ensureInstanceAuthTables,
        hashCollaboratorInvitationToken,
        createPasskeyCredential,
        readCollaboratorInvitationToken,
        revokeCollaboratorInvitationToken,
        writeInstanceAuthConfig,
      } from "${process.cwd()}/src/worker/instance-auth-state.ts";

      export class CollaboratorInvitationAcceptanceHarness extends FormlessAuthority {
        constructor(ctx, env) {
          super(ctx, env);
          this.bindings = env;
        }

        async fetch(request) {
          const url = new URL(request.url);

          if (url.pathname === "/harness/auth/config" && request.method === "POST") {
            return Response.json(writeInstanceAuthConfig(this.ctx.storage, await request.json()));
          }

          if (url.pathname === "/harness/auth/token" && request.method === "POST") {
            const body = await request.json();

            return Response.json(createCollaboratorInvitationToken(this.ctx.storage, {
              ...body,
              tokenHash: await hashCollaboratorInvitationToken(body.rawToken),
            }));
          }

          if (url.pathname === "/harness/auth/token" && request.method === "GET") {
            return Response.json({
              token: readCollaboratorInvitationToken(
                this.ctx.storage,
                url.searchParams.get("invitationId"),
              ) ?? null,
            });
          }

          if (url.pathname === "/harness/auth/token/revoke" && request.method === "POST") {
            const body = await request.json();

            return Response.json(
              revokeCollaboratorInvitationToken(this.ctx.storage, body.invitationId, body.now),
            );
          }

          if (url.pathname === "/harness/auth/token/consume" && request.method === "POST") {
            const body = await request.json();

            return Response.json(
              consumeCollaboratorInvitationToken(this.ctx.storage, {
                invitationId: body.invitationId,
                tokenHash: await hashCollaboratorInvitationToken(body.rawToken),
                now: body.now,
              }),
            );
          }

          if (url.pathname === "/harness/auth/counts" && request.method === "GET") {
            ensureInstanceAuthTables(this.ctx.storage);

            return Response.json({
              centralSessions: this.ctx.storage.sql.exec("SELECT COUNT(*) AS count FROM instance_auth_central_sessions").one().count,
              challenges: this.ctx.storage.sql.exec("SELECT COUNT(*) AS count FROM instance_auth_challenges").one().count,
              credentials: this.ctx.storage.sql.exec("SELECT COUNT(*) AS count FROM instance_auth_passkey_credentials").one().count,
              handoffGrants: this.ctx.storage.sql.exec("SELECT COUNT(*) AS count FROM instance_auth_handoff_grants").one().count,
            });
          }

          if (url.pathname === "/harness/auth/credential" && request.method === "POST") {
            const body = await request.json();

            return Response.json(createPasskeyCredential(this.ctx.storage, {
              credentialId: body.credentialId,
              principalId: body.principalId,
              publicKey: new Uint8Array([1, 2, 3, 4]),
              counter: 0,
              transports: [],
              credentialDeviceType: "singleDevice",
              credentialBackedUp: false,
              createdAt: "2026-06-01T00:00:00.000Z",
              updatedAt: "2026-06-01T00:00:00.000Z",
            }));
          }

          if (url.pathname === "/harness/app-records") {
            const installId = url.searchParams.get("installId");
            const packageAppKey = url.searchParams.get("packageAppKey");

            if (!installId || !packageAppKey) {
              return Response.json({ error: "App record read requires installId and packageAppKey." }, { status: 400 });
            }

            const schemaResponse = await super.fetch(
              new Request(\`http://internal/api/app-installs/\${packageAppKey}/\${installId}/schema\`, {
                headers: {
                  Accept: "application/json",
                  Authorization: "Bearer " + this.bindings.FORMLESS_ADMIN_TOKEN,
                },
                method: "GET",
              }),
            );

            if (!schemaResponse.ok) {
              return schemaResponse;
            }

            return Response.json({ records: getBootstrapRecords(this.ctx.storage) });
          }

          if (url.pathname === "/harness/identity/invitation-target" && request.method === "POST") {
            const body = await request.json();
            const row = this.ctx.storage.sql.exec(
              "SELECT values_json FROM records WHERE id = ? AND entity = 'invitation' AND deleted_at IS NULL",
              body.invitationId,
            ).next();

            if (row.done) {
              return Response.json({ error: "Invitation not found." }, { status: 404 });
            }

            const values = JSON.parse(row.value.values_json);

            delete values.targetAppInstallId;
            delete values.targetOrganization;
            values.targetSurface = body.targetSurface;

            if (body.targetAppInstallId !== undefined) {
              values.targetAppInstallId = body.targetAppInstallId;
            }

            if (body.targetOrganization !== undefined) {
              values.targetOrganization = body.targetOrganization;
            }

            this.ctx.storage.sql.exec(
              "UPDATE records SET values_json = ?, updated_at = ? WHERE id = ?",
              JSON.stringify(values),
              "2026-06-01T00:00:01.000Z",
              body.invitationId,
            );

            return Response.json({ updated: true });
          }

          if (url.pathname === "/harness/auth/acceptance" && request.method === "GET") {
            const targetUrl = new URL(
              COLLABORATOR_INVITATION_ACCEPT_PATH,
              url.searchParams.get("origin") ?? "https://auth.example.com",
            );

            targetUrl.searchParams.set("invitationId", url.searchParams.get("invitationId") ?? "");
            targetUrl.searchParams.set("token", url.searchParams.get("token") ?? "");

            const acceptanceResponse =
              await handleCollaboratorInvitationAcceptanceDurableObjectRequest(
                new Request(targetUrl),
                this.ctx.storage,
                this.bindings,
              );

            if (acceptanceResponse) {
              return acceptanceResponse;
            }
          }

          if (
            url.pathname === "/harness/auth/acceptance/passkeys/register/options" &&
            request.method === "POST"
          ) {
            const targetUrl = new URL(
              COLLABORATOR_INVITATION_PASSKEY_REGISTER_OPTIONS_PATH,
              url.searchParams.get("origin") ?? "https://auth.example.com",
            );
            const acceptanceResponse =
              await handleCollaboratorInvitationAcceptanceDurableObjectRequest(
                new Request(targetUrl, {
                  body: JSON.stringify(await request.json()),
                  headers: { "Content-Type": "application/json" },
                  method: "POST",
                }),
                this.ctx.storage,
                this.bindings,
              );

            if (acceptanceResponse) {
              return acceptanceResponse;
            }
          }

          if (
            url.pathname === "/harness/auth/acceptance/passkeys/register/verify" &&
            request.method === "POST"
          ) {
            const targetUrl = new URL(
              COLLABORATOR_INVITATION_PASSKEY_REGISTER_VERIFY_PATH,
              url.searchParams.get("origin") ?? "https://auth.example.com",
            );
            const acceptanceResponse =
              await handleCollaboratorInvitationAcceptanceDurableObjectRequest(
                new Request(targetUrl, {
                  body: JSON.stringify(await request.json()),
                  headers: { "Content-Type": "application/json" },
                  method: "POST",
                }),
                this.ctx.storage,
                this.bindings,
              );

            if (acceptanceResponse) {
              return acceptanceResponse;
            }
          }

          const acceptanceResponse =
            await handleCollaboratorInvitationAcceptanceDurableObjectRequest(
              request,
              this.ctx.storage,
              this.bindings,
            );

          if (acceptanceResponse) {
            return acceptanceResponse;
          }

          return super.fetch(request);
        }
      }

      export default {
        fetch(request, env) {
          const url = new URL(request.url);
          const instanceAuthHarnessName = request.headers.get("x-instance-auth-harness-name");
          const harnessAppRecordsInstallId =
            url.pathname === "/harness/app-records" ? url.searchParams.get("installId") : null;
          const authorityName = harnessAppRecordsInstallId
            ? \`app:\${harnessAppRecordsInstallId}\`
            : url.pathname.startsWith(IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX) ||
            url.pathname.startsWith("/harness/identity/")
            ? FORMLESS_PROGRAM_STORAGE_IDENTITY
            : url.pathname.startsWith(FORMLESS_PROGRAM_API_ROUTE_PREFIX)
              ? FORMLESS_PROGRAM_STORAGE_IDENTITY
              : instanceAuthHarnessName
                ? instanceAuthHarnessName
                : FORMLESS_INSTANCE_AUTHORITY_NAME;
          const id = env.FORMLESS_AUTHORITY.idFromName(authorityName);

          return env.FORMLESS_AUTHORITY.get(id).fetch(request);
        },
      };
    `,
  );

  return path;
}
