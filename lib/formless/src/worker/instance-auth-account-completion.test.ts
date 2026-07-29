import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { rm, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX } from "@dpeek/formless-identity-control-plane";
import type { StoredRecord } from "@dpeek/formless-storage";
import {
  FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME,
  formatRuntimeWorkspaceAppPackages,
} from "../shared/workspace-runtime-packages.ts";
import { computeSourceSchemaHash } from "../shared/upgrade-migrations.ts";
import { workspaceAppPackageManifestFixture } from "../test/workspace-app-package.ts";

import {
  parseAccountCompletionGateResolutionResult,
  type AccountCompletionGateResolutionResult,
  type AccountCompletionGateTarget,
} from "../shared/instance-auth.ts";
import { recordOperationRequest } from "../test/authority-write.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import {
  INSTANCE_AUTH_APP_REGISTRATION_GATE_COMPLETE_PATH,
  INSTANCE_AUTH_ACCOUNT_COMPLETION_RESOLVE_PATH,
  INSTANCE_AUTH_PROFILE_COMPLETION_GATE_COMPLETE_PATH,
  INSTANCE_AUTH_TERMS_ACCEPTANCE_GATE_COMPLETE_PATH,
  type AccountCompletionGateResolverInput,
} from "./instance-auth-account-completion.ts";
import { CENTRAL_AUTH_SESSION_COOKIE_NAME } from "./central-auth-session.ts";
import type { CreateAppInstallResponse } from "../shared/protocol.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";
const identityApi = IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX;

let harness: Harness;
let harnessDir: string;
let harnessPath: string;
let writeCounter = 0;

beforeAll(async () => {
  harnessPath = await writeAccountCompletionHarness();
});

beforeEach(async () => {
  writeCounter = 0;
  const profilePackage = await profileCompletionWorkspacePackage();
  harness = await createWorkerHarness(
    harnessPath,
    {
      FORMLESS_AUTHORITY: { className: "AccountCompletionHarness", useSQLite: true },
    },
    {
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        FORMLESS_INSTANCE_AUTH_ORIGIN: "https://auth.example.com",
        FORMLESS_OWNER_SESSION_SECRET: "test-owner-session-secret",
        [FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME]: formatRuntimeWorkspaceAppPackages([
          profilePackage,
        ]),
      },
    },
  );
  await createAppInstall({ installId: "crm", label: "CRM", packageAppKey: "crm" });
  await createAppInstall({ installId: "billing", label: "Billing", packageAppKey: "tasks" });
});

afterEach(async () => {
  await harness.dispose();
});

afterAll(async () => {
  await rm(harnessDir, { force: true, recursive: true });
});

describe("instance auth account completion resolver", () => {
  it("returns the next blocking gate in deterministic first-pass order", async () => {
    const principal = await createPrincipal("Ordered Gates");

    await expectGate({ principalId: principal.id, target: appTarget() }, "email-verification");

    const email = await createPrimaryEmail(principal.id, "ordered@example.com", "verified");

    await expectGate({ principalId: principal.id, target: appTarget() }, "credential");

    await createCredential(principal.id, "ordered");
    const invitation = await createInvitation(principal.id, {
      targetAppInstallId: "crm",
      targetSurface: "app-install",
    });

    await expectGate({ principalId: principal.id, target: appTarget() }, "invitation");

    await updateIdentityRecord("invitation", invitation.id, {
      acceptedAt: "2026-07-06T00:00:00.000Z",
      status: "accepted",
    });

    await expectGate({ principalId: principal.id, target: appTarget() }, "app-registration");

    await createAppRegistration(principal.id, { appInstallId: "crm" });

    await expectGate(
      {
        principalId: principal.id,
        profileCompletion: { satisfied: false },
        target: appTarget(),
      },
      "profile-completion",
    );

    const policy = await createAccountPolicy({
      appInstallId: "crm",
      displayName: "CRM terms",
      policyKey: "crm-terms",
      scopeKind: "app-install",
    });

    await expectGate(
      {
        principalId: principal.id,
        profileCompletion: { satisfied: true },
        target: appTarget(),
      },
      "terms-acceptance",
    );

    await acceptPolicy(principal.id, policy.id);

    await expectGate(
      {
        principalId: principal.id,
        requiredRole: { roleKey: "app.user", scopeKind: "app-install" },
        target: appTarget(),
      },
      "role-review",
    );

    await assignRole(principal.id, "app.user", { appInstallId: "crm", scopeKind: "app-install" });

    const complete = await resolveGate({
      principalId: principal.id,
      requiredRole: { roleKey: "app.user", scopeKind: "app-install" },
      target: appTarget(),
    });

    expect(complete).toMatchObject({
      continueTo: "/dashboard",
      status: "complete",
      target: appTarget(),
    });
    expect(email.values.verificationStatus).toBe("verified");
  });

  it("rereads identity and policy state instead of trusting stale signed session facts", async () => {
    const principal = await createReadyPrincipal("Stale Principal", {
      appInstallId: "crm",
      policyKey: "crm-policy",
    });
    const initial = await resolveGate({ principalId: principal.id, target: appTarget() });

    expect(initial.status).toBe("complete");

    await updateIdentityRecord("principal-email", principal.email.id, {
      verificationStatus: "unverified",
    });

    await expectGate({ principalId: principal.id, target: appTarget() }, "email-verification");

    await updateIdentityRecord("principal-email", principal.email.id, {
      verificationStatus: "verified",
      verifiedAt: "2026-07-06T01:00:00.000Z",
    });
    await updateIdentityRecord("principal-policy-acceptance", principal.acceptance.id, {
      status: "revoked",
    });

    const blocked = await expectGate(
      { principalId: principal.id, target: appTarget() },
      "terms-acceptance",
    );

    expect(JSON.stringify(blocked)).not.toContain("sessionId");
    expect(JSON.stringify(blocked)).not.toContain("credentialId");
  });

  it("keeps target gates isolated and bypasses public anonymous operations", async () => {
    const principal = await createPrincipal("Target Isolation");
    await createPrimaryEmail(principal.id, "target-isolation@example.com", "verified");
    await createCredential(principal.id, "target-isolation");
    const organizationA = await createOrganization("North");
    const organizationB = await createOrganization("South");
    const appPolicy = await createAccountPolicy({
      appInstallId: "crm",
      displayName: "CRM policy",
      policyKey: "crm-policy",
      scopeKind: "app-install",
    });
    const organizationPolicyA = await createAccountPolicy({
      displayName: "North terms",
      policyKey: "north-terms",
      scopeKind: "organization",
      scopeOrganization: organizationA.id,
    });

    await createAccountPolicy({
      displayName: "South terms",
      policyKey: "south-terms",
      scopeKind: "organization",
      scopeOrganization: organizationB.id,
    });
    await createAppRegistration(principal.id, {
      appInstallId: "crm",
      selectedOrganization: organizationA.id,
    });
    await acceptPolicy(principal.id, appPolicy.id);
    await acceptPolicy(principal.id, organizationPolicyA.id);

    const northTarget = appTarget({
      returnTo: "/north",
      routeId: "route:crm:north",
      selectedOrganization: organizationA.id,
      storageIdentity: "app:crm:north",
    });
    const southTarget = appTarget({
      returnTo: "/south",
      routeId: "route:crm:south",
      selectedOrganization: organizationB.id,
      storageIdentity: "app:crm:south",
    });
    const billingTarget = appTarget({
      appInstallId: "billing",
      returnTo: "/billing",
      routeId: "route:billing",
      storageIdentity: "app:billing",
    });

    await expect(resolveGate({ principalId: principal.id, target: northTarget })).resolves.toEqual({
      continueTo: "/north",
      status: "complete",
      target: northTarget,
    });

    await expectGate({ principalId: principal.id, target: southTarget }, "app-registration");

    const billing = await expectGate(
      { principalId: principal.id, target: billingTarget },
      "app-registration",
    );

    expect(billing).toMatchObject({
      gate: { appInstallId: "billing", kind: "app-registration" },
      target: billingTarget,
    });

    const anonymous = await resolveGate({
      actorKind: "anonymous",
      target: billingTarget,
    });

    expect(anonymous).toEqual({
      continueTo: "/billing",
      status: "complete",
      target: billingTarget,
    });
  });

  it("resolves closed app registration policy and continues after active registration", async () => {
    const principal = await createPrincipal("Closed Registration");

    await createPrimaryEmail(principal.id, "closed-registration@example.com", "verified");
    await createCredential(principal.id, "closed-registration");

    const blocked = await expectGate(
      { principalId: principal.id, target: appTarget() },
      "app-registration",
    );

    expect(blocked).toMatchObject({
      gate: {
        appInstallId: "crm",
        kind: "app-registration",
        registrationPolicy: "closed",
      },
      status: "blocked",
      target: appTarget(),
    });
    expect(JSON.stringify(blocked)).not.toContain("session");
    expect(JSON.stringify(blocked)).not.toContain("grantSecret");
    expect(JSON.stringify(blocked)).not.toContain("credential");
    expect(JSON.stringify(blocked)).not.toContain("tokenHash");

    await createAppRegistration(principal.id, { appInstallId: "crm" });

    await expect(resolveGate({ principalId: principal.id, target: appTarget() })).resolves.toEqual({
      continueTo: "/dashboard",
      status: "complete",
      target: appTarget(),
    });
  });

  it("honors matching app admins without registration and reviews missing or wrong-install roles", async () => {
    const matching = await createPrincipal("Matching App Admin");

    await createPrimaryEmail(matching.id, "matching-app-admin@example.com", "verified");
    await createCredential(matching.id, "matching-app-admin");
    await assignRole(matching.id, "app.admin", {
      appInstallId: "crm",
      scopeKind: "app-install",
    });

    await expect(
      resolveGate({
        principalId: matching.id,
        requiredRole: { roleKey: "app.admin", scopeKind: "app-install" },
        target: appTarget(),
      }),
    ).resolves.toEqual({
      continueTo: "/dashboard",
      status: "complete",
      target: appTarget(),
    });

    const wrongInstall = await expectGate(
      {
        principalId: matching.id,
        requiredRole: { roleKey: "app.admin", scopeKind: "app-install" },
        target: appTarget({
          appInstallId: "billing",
          routeId: "route:billing",
          storageIdentity: "app:billing",
        }),
      },
      "role-review",
    );
    const ordinary = await createPrincipal("Ordinary App Principal");

    await createPrimaryEmail(ordinary.id, "ordinary-app-principal@example.com", "verified");
    await createCredential(ordinary.id, "ordinary-app-principal");

    const missingRole = await expectGate(
      {
        principalId: ordinary.id,
        requiredRole: { roleKey: "app.admin", scopeKind: "app-install" },
        target: appTarget(),
      },
      "role-review",
    );
    const appRegistrations = (await identityRecords()).records.filter(
      (record) =>
        record.entity === "app-registration" &&
        (record.values.targetPrincipal === matching.id ||
          record.values.targetPrincipal === ordinary.id),
    );

    expect(wrongInstall).toMatchObject({
      gate: { kind: "role-review", roleKey: "app.admin", scopeKind: "app-install" },
    });
    expect(missingRole).toMatchObject({
      gate: { kind: "role-review", roleKey: "app.admin", scopeKind: "app-install" },
    });
    expect(appRegistrations).toEqual([]);
  });

  it("returns a self-service email-verified app registration gate", async () => {
    await createAppInstall({
      installId: "portal",
      label: "Portal",
      packageAppKey: "tasks",
      registrationPolicy: "email-verified",
    });
    const principal = await createPrincipal("Email Verified Registration");
    const target = appTarget({
      appInstallId: "portal",
      returnTo: "/portal",
      routeId: "route:portal",
      storageIdentity: "app:portal",
      targetOrigin: "https://portal.example.com",
    });

    await createPrimaryEmail(principal.id, "email-verified-registration@example.com", "verified");
    await createCredential(principal.id, "email-verified-registration");

    const blocked = await expectGate({ principalId: principal.id, target }, "app-registration");

    expect(blocked).toMatchObject({
      gate: {
        appInstallId: "portal",
        kind: "app-registration",
        operation: {
          appInstallId: "portal",
          entityName: "app-registration",
          label: "Register for app",
          operationKey: "auth.app-registration.complete",
          operationName: "completeEmailVerifiedAppRegistration",
        },
        registrationPolicy: "email-verified",
      },
      status: "blocked",
      target,
    });
    expect(JSON.stringify(blocked)).not.toContain("session");
    expect(JSON.stringify(blocked)).not.toContain("grantSecret");
    expect(JSON.stringify(blocked)).not.toContain("credential");
    expect(JSON.stringify(blocked)).not.toContain("tokenHash");
  });

  it("returns a display-safe custom-operation app registration gate without side effects", async () => {
    const install = await createAppInstall({
      installId: "members",
      label: "Members",
      packageAppKey: "tasks",
      registrationOperation: "task.create",
      registrationPolicy: "custom-operation",
    });
    const principal = await createPrincipal("Custom Operation Registration");
    const target = appTargetForInstall(install);

    await createPrimaryEmail(principal.id, "custom-operation-registration@example.com", "verified");
    await createCredential(principal.id, "custom-operation-registration");

    const beforeAppRecords = await appRecords(install);
    const beforeRecords = await identityRecords();
    const beforeCounts = identityRecordCounts(beforeRecords.records);
    const beforePrivateCounts = await authPrivateCounts();
    const blocked = await expectGate({ principalId: principal.id, target }, "app-registration");
    const afterAppRecords = await appRecords(install);
    const afterRecords = await identityRecords();
    const afterPrivateCounts = await authPrivateCounts();

    expect(blocked).toMatchObject({
      gate: {
        appInstallId: "members",
        kind: "app-registration",
        operation: {
          appInstallId: "members",
          entityName: "task",
          label: "Create Task",
          operationKey: "task.create",
          operationName: "create",
        },
        registrationPolicy: "custom-operation",
      },
      status: "blocked",
      target,
    });
    expect(blocked).not.toHaveProperty("continueTo");
    expect(blocked).not.toHaveProperty("handoff");
    expect(afterAppRecords.records).toEqual(beforeAppRecords.records);
    expect(identityRecordCounts(afterRecords.records)).toEqual(beforeCounts);
    expect(afterPrivateCounts).toEqual(beforePrivateCounts);
    expect(JSON.stringify(blocked)).not.toContain("session");
    expect(JSON.stringify(blocked)).not.toContain("grantSecret");
    expect(JSON.stringify(blocked)).not.toContain("credential");
    expect(JSON.stringify(blocked)).not.toContain("tokenHash");
    expect(
      afterRecords.records.some(
        (record) =>
          record.entity === "app-registration" &&
          record.values.appInstallId === "members" &&
          record.values.targetPrincipal === principal.id,
      ),
    ).toBe(false);
  });

  it("rejects custom-operation gates with invalid app install operation metadata", async () => {
    const principal = await createPrincipal("Invalid Custom Operation Registration");

    await createPrimaryEmail(principal.id, "invalid-custom-operation@example.com", "verified");
    await createCredential(principal.id, "invalid-custom-operation");

    const cases = [
      {
        expected: 'App install "missing-operation" registration operation must be a string.',
        installId: "missing-operation",
        patch: { deleteFields: ["registrationOperation"] },
      },
      {
        expected:
          'App install "malformed-operation" registration operation must use "<entity-key>.<operation-key>" format.',
        installId: "malformed-operation",
        patch: { values: { registrationOperation: "task/create" } },
      },
      {
        expected: 'App install "unresolved-operation" registration operation does not resolve.',
        installId: "unresolved-operation",
        patch: { values: { registrationOperation: "task.missing" } },
      },
      {
        expected: 'App install "disabled-operation" is disabled.',
        installId: "disabled-operation",
        patch: { values: { status: "disabled" } },
      },
      {
        expected: "Custom operation app-registration target storage does not match app install.",
        installId: "wrong-target-operation",
        target: { storageIdentity: "app:crm" },
      },
      {
        expected: "Custom operation app-registration target route is not available.",
        installId: "wrong-route-operation",
        target: { routeId: "route:crm" },
      },
    ] as const;

    const installs = new Map<string, CreateAppInstallResponse["install"]>();

    for (const testCase of cases) {
      const install = await createAppInstall({
        installId: testCase.installId,
        label: testCase.installId,
        packageAppKey: "tasks",
        registrationOperation: "task.create",
        registrationPolicy: "custom-operation",
      });

      installs.set(testCase.installId, install);
    }

    for (const testCase of cases) {
      if ("patch" in testCase) {
        await patchControlPlaneAppInstall({
          installId: testCase.installId,
          ...testCase.patch,
        });
      }

      const install = installs.get(testCase.installId);

      if (!install) {
        throw new Error(`Missing test install "${testCase.installId}".`);
      }

      const rejected = await resolveGateFailure({
        principalId: principal.id,
        target: appTargetForInstall(install, "target" in testCase ? testCase.target : {}),
      });

      expect(rejected.error).toBe(testCase.expected);
    }
  });

  it("completes an email-verified app registration gate and returns a safe continuation", async () => {
    const install = await createAppInstall({
      installId: "portal",
      label: "Portal",
      packageAppKey: "tasks",
      registrationPolicy: "email-verified",
    });
    const principal = await createPrincipal("Complete Registration");
    const target = appTargetForInstall(install);

    await createPrimaryEmail(principal.id, "complete-registration@example.com", "verified");
    await createCredential(principal.id, "complete-registration");

    const completed = await completeAppRegistrationGate({
      cookie: await createCentralSessionCookie(principal.id),
      target,
    });
    const records = await identityRecords();
    const privateCounts = await authPrivateCounts();

    expect(completed.status).toBe(200);
    expect(completed.setCookie).toBeNull();
    expect(completed.body).toMatchObject({
      accountCompletion: {
        continueTo: "/apps/portal",
        status: "complete",
        target,
      },
      appRegistration: {
        appInstallId: "portal",
        status: "active",
        targetKind: "principal",
        targetPrincipal: principal.id,
      },
      completed: true,
      continueTo: "/apps/portal",
    });
    expect(completed.body).not.toHaveProperty("handoff");
    expect(records.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: "app-registration",
          values: expect.objectContaining({
            appInstallId: "portal",
            status: "active",
            targetKind: "principal",
            targetPrincipal: principal.id,
          }),
        }),
      ]),
    );
    expect(privateCounts.handoffGrants).toBe(0);
  });

  it("re-evaluates account completion after app registration before returning continuation", async () => {
    const install = await createAppInstall({
      installId: "portal",
      label: "Portal",
      packageAppKey: "tasks",
      registrationPolicy: "email-verified",
    });
    const principal = await createPrincipal("Blocked After Registration");
    const target = appTargetForInstall(install);

    await createPrimaryEmail(principal.id, "blocked-after-registration@example.com", "verified");
    await createCredential(principal.id, "blocked-after-registration");
    await createAccountPolicy({
      appInstallId: "portal",
      displayName: "Portal terms",
      policyKey: "portal-terms",
      scopeKind: "app-install",
    });

    const completed = await completeAppRegistrationGate({
      cookie: await createCentralSessionCookie(principal.id),
      target,
    });
    const privateCounts = await authPrivateCounts();

    expect(completed.status).toBe(409);
    expect(completed.body).toMatchObject({
      accountCompletion: {
        gate: {
          kind: "terms-acceptance",
          policies: [expect.objectContaining({ policyKey: "portal-terms" })],
        },
        status: "blocked",
        target,
      },
      completed: true,
    });
    expect(completed.body).not.toHaveProperty("handoff");
    expect(privateCounts.handoffGrants).toBe(0);
  });

  it("completes a custom-operation app registration gate and returns profile completion", async () => {
    const install = await createAppInstall({
      installId: "members",
      label: "Members",
      packageAppKey: "tasks",
      registrationOperation: "task.create",
      registrationPolicy: "custom-operation",
    });
    const principal = await createPrincipal("Complete Custom Registration");
    const organization = await createOrganization("Members North");
    const target = appTargetForInstall(install, { selectedOrganization: organization.id });

    await createPrimaryEmail(principal.id, "complete-custom-registration@example.com", "verified");
    await createCredential(principal.id, "complete-custom-registration");

    const cookie = await createCentralSessionCookie(principal.id);
    const beforeAppRecords = await appRecords(install);
    const beforeRecords = await identityRecords();
    const beforeCounts = identityRecordCounts(beforeRecords.records);
    const beforePrivateCounts = await authPrivateCounts();
    const completed = await completeAppRegistrationGate({ cookie, target });
    const afterAppRecords = await appRecords(install);
    const afterRecords = await identityRecords();
    const afterCounts = identityRecordCounts(afterRecords.records);
    const afterPrivateCounts = await authPrivateCounts();

    expect(completed.status).toBe(409);
    expect(completed.setCookie).toBeNull();
    expect(completed.body).toMatchObject({
      accountCompletion: {
        gate: {
          appInstallId: "members",
          kind: "profile-completion",
          operation: {
            appInstallId: "members",
            entityName: "task",
            label: "Create Task",
            operationKey: "task.create",
            operationName: "create",
          },
          selectedOrganization: organization.id,
        },
        status: "blocked",
        target,
      },
      appRegistration: {
        appInstallId: "members",
        selectedOrganization: organization.id,
        status: "active",
        targetKind: "principal",
        targetPrincipal: principal.id,
      },
      completed: true,
    });
    expect(completed.body).not.toHaveProperty("continueTo");
    expect(completed.body).not.toHaveProperty("handoff");
    expect(afterAppRecords.records).toEqual(beforeAppRecords.records);
    expect(afterCounts).toMatchObject({
      acceptedPolicies: beforeCounts.acceptedPolicies,
      appRegistrations: beforeCounts.appRegistrations + 1,
      roleAssignments: beforeCounts.roleAssignments,
    });
    expect(afterPrivateCounts).toEqual(beforePrivateCounts);
    expect(
      afterRecords.records.filter(
        (record) =>
          record.entity === "app-registration" &&
          !record.deletedAt &&
          record.values.appInstallId === "members" &&
          record.values.targetPrincipal === principal.id &&
          record.values.selectedOrganization === organization.id,
      ),
    ).toHaveLength(1);
  });

  it("reuses an inactive custom-operation app registration for the current principal", async () => {
    const install = await createAppInstall({
      installId: "custom-reuse",
      label: "Custom Reuse",
      packageAppKey: "tasks",
      registrationOperation: "task.create",
      registrationPolicy: "custom-operation",
    });
    const principal = await createPrincipal("Reuse Custom Registration");
    const target = appTargetForInstall(install);

    await createPrimaryEmail(principal.id, "reuse-custom-registration@example.com", "verified");
    await createCredential(principal.id, "reuse-custom-registration");
    const pendingRegistration = await createAppRegistration(principal.id, {
      appInstallId: "custom-reuse",
      status: "pending",
    });

    const completed = await completeAppRegistrationGate({
      cookie: await createCentralSessionCookie(principal.id),
      target,
    });
    const records = await identityRecords();
    const registrations = records.records.filter(
      (record) =>
        record.entity === "app-registration" &&
        !record.deletedAt &&
        record.values.appInstallId === "custom-reuse" &&
        record.values.targetPrincipal === principal.id,
    );

    expect(completed.status).toBe(409);
    expect(completed.body).toMatchObject({
      accountCompletion: {
        gate: {
          appInstallId: "custom-reuse",
          kind: "profile-completion",
          operation: {
            appInstallId: "custom-reuse",
            operationKey: "task.create",
          },
        },
        status: "blocked",
        target,
      },
      appRegistration: {
        appRegistrationId: pendingRegistration.id,
        appInstallId: "custom-reuse",
        status: "active",
        targetPrincipal: principal.id,
      },
      completed: true,
    });
    expect(completed.body).not.toHaveProperty("continueTo");
    expect(completed.body).not.toHaveProperty("handoff");
    expect(registrations).toHaveLength(1);
    expect(registrations[0]).toMatchObject({
      id: pendingRegistration.id,
      values: {
        status: "active",
      },
    });
  });

  it("rejects app registration completion when the current gate is not self-service", async () => {
    const install = await createAppInstall({
      installId: "closed-portal",
      label: "Closed Portal",
      packageAppKey: "tasks",
    });
    const principal = await createPrincipal("Reject Closed Registration");
    const target = appTargetForInstall(install);

    await createPrimaryEmail(principal.id, "reject-closed-registration@example.com", "verified");
    await createCredential(principal.id, "reject-closed-registration");

    const rejected = await completeAppRegistrationGate({
      cookie: await createCentralSessionCookie(principal.id),
      target,
    });
    const records = await identityRecords();

    expect(rejected.status).toBe(409);
    expect(rejected.body).toMatchObject({
      accountCompletion: {
        gate: {
          appInstallId: "closed-portal",
          kind: "app-registration",
          registrationPolicy: "closed",
        },
        status: "blocked",
      },
      error: "App-registration gate is not current.",
    });
    expect(
      records.records.some(
        (record) =>
          record.entity === "app-registration" &&
          record.values.appInstallId === "closed-portal" &&
          record.values.targetPrincipal === principal.id,
      ),
    ).toBe(false);
  });

  it("rejects app registration completion while an earlier credential gate is current", async () => {
    const install = await createAppInstall({
      installId: "credential-portal",
      label: "Credential Portal",
      packageAppKey: "tasks",
      registrationPolicy: "email-verified",
    });
    const principal = await createPrincipal("Reject Missing Credential");
    const target = appTargetForInstall(install);

    await createPrimaryEmail(principal.id, "reject-missing-credential@example.com", "verified");

    const rejected = await completeAppRegistrationGate({
      cookie: await createCentralSessionCookie(principal.id),
      target,
    });
    const records = await identityRecords();

    expect(rejected.status).toBe(409);
    expect(rejected.body).toMatchObject({
      accountCompletion: {
        gate: {
          credentialMethod: "passkey",
          kind: "credential",
        },
        status: "blocked",
      },
      error: "App-registration gate is not current.",
    });
    expect(
      records.records.some(
        (record) =>
          record.entity === "app-registration" &&
          record.values.appInstallId === "credential-portal" &&
          record.values.targetPrincipal === principal.id,
      ),
    ).toBe(false);
  });

  it("keeps app profile completion evidence explicit and app-owned", async () => {
    const principal = await createPrincipal("Profile Evidence");

    await createPrimaryEmail(principal.id, "profile-evidence@example.com", "verified");
    await createCredential(principal.id, "profile-evidence");
    await createAppRegistration(principal.id, { appInstallId: "crm" });

    const blocked = await expectGate(
      {
        principalId: principal.id,
        profileCompletion: {
          operation: {
            appInstallId: "crm",
            entityName: "profile",
            label: "Complete profile",
            operationKey: "complete-profile",
            operationName: "completeProfile",
          },
          profileRecordId: "profile:ada",
          satisfied: false,
        },
        target: appTarget(),
      },
      "profile-completion",
    );

    const complete = await resolveGate({
      principalId: principal.id,
      profileCompletion: {
        profileRecordId: "profile:ada",
        satisfied: true,
      },
      target: appTarget(),
    });

    expect(blocked).toMatchObject({
      gate: {
        appInstallId: "crm",
        kind: "profile-completion",
        operation: {
          appInstallId: "crm",
          operationKey: "complete-profile",
        },
        profileRecordId: "profile:ada",
      },
      status: "blocked",
    });
    expect(JSON.stringify(blocked)).not.toContain("profileValue");
    expect(complete).toEqual({
      continueTo: "/dashboard",
      status: "complete",
      target: appTarget(),
    });
  });

  it("completes an operation-backed profile gate through the declared app operation", async () => {
    const install = await createAppInstall({
      installId: "profile-runtime",
      label: "Profile Runtime",
      packageAppKey: "profile-app",
      registrationOperation: "profile.completeRegistration",
      registrationPolicy: "custom-operation",
    });
    const principal = await createPrincipal("Profile Runtime User");
    const target = appTargetForInstall(install);

    await createPrimaryEmail(principal.id, "profile-runtime@example.com", "verified");
    await createCredential(principal.id, "profile-runtime");
    await createAppRegistration(principal.id, { appInstallId: install.installId });

    const cookie = await createCentralSessionCookie(principal.id);
    const beforeAppRecords = await appRecords(install);
    const beforeIdentityRecords = await identityRecords();
    const beforeCounts = identityRecordCounts(beforeIdentityRecords.records);
    const beforePrivateCounts = await authPrivateCounts();
    const completed = await completeProfileCompletionGate({
      cookie,
      idempotencyKey: "profile-runtime-complete",
      input: {
        displayName: "Ada Profile",
        principal: principal.id,
      },
      operation: profileCompletionOperation(install.installId),
      target,
    });
    const afterAppRecords = await appRecords(install);
    const afterIdentityRecords = await identityRecords();
    const afterPrivateCounts = await authPrivateCounts();
    const profiles = afterAppRecords.records.filter(
      (record) => record.entity === "profile" && !record.deletedAt,
    );

    expect(completed.status).toBe(200);
    expect(completed.setCookie).toBeNull();
    expect(completed.body).toMatchObject({
      accountCompletion: {
        continueTo: target.returnTo,
        status: "complete",
        target,
      },
      completed: true,
      continueTo: target.returnTo,
    });
    expect(JSON.stringify(completed.body)).not.toContain("Ada Profile");
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      entity: "profile",
      values: {
        actorPrincipalId: principal.id,
        displayName: "Ada Profile",
        principal: principal.id,
      },
    });
    expect(afterAppRecords.records.length).toBe(beforeAppRecords.records.length + 1);
    expect(identityRecordCounts(afterIdentityRecords.records)).toEqual(beforeCounts);
    expect(afterPrivateCounts).toEqual(beforePrivateCounts);
  });

  it("rejects profile completion when the profile gate is not current", async () => {
    const install = await createAppInstall({
      installId: "profile-not-current",
      label: "Profile Not Current",
      packageAppKey: "profile-app",
      registrationOperation: "profile.completeRegistration",
      registrationPolicy: "custom-operation",
    });
    const principal = await createPrincipal("Profile Not Current User");
    const target = appTargetForInstall(install);

    await createPrimaryEmail(principal.id, "profile-not-current@example.com", "verified");
    await createCredential(principal.id, "profile-not-current");

    const beforeAppRecords = await appRecords(install);
    const rejected = await completeProfileCompletionGate({
      cookie: await createCentralSessionCookie(principal.id),
      idempotencyKey: "profile-not-current-complete",
      input: {
        displayName: "Not Current",
        principal: principal.id,
      },
      operation: profileCompletionOperation(install.installId),
      target,
    });
    const afterAppRecords = await appRecords(install);

    expect(rejected.status).toBe(409);
    expect(rejected.body).toMatchObject({
      accountCompletion: {
        gate: {
          appInstallId: install.installId,
          kind: "app-registration",
          registrationPolicy: "custom-operation",
        },
        status: "blocked",
      },
      error: "Profile-completion gate is not current.",
    });
    expect(afterAppRecords.records).toEqual(beforeAppRecords.records);
  });

  it("rejects profile operation writes with invalid identity references", async () => {
    const install = await createAppInstall({
      installId: "profile-reference",
      label: "Profile Reference",
      packageAppKey: "profile-app",
      registrationOperation: "profile.completeRegistration",
      registrationPolicy: "custom-operation",
    });
    const principal = await createPrincipal("Profile Reference User");
    const target = appTargetForInstall(install);

    await createPrimaryEmail(principal.id, "profile-reference@example.com", "verified");
    await createCredential(principal.id, "profile-reference");
    await createAppRegistration(principal.id, { appInstallId: install.installId });

    const beforeAppRecords = await appRecords(install);
    const rejected = await completeProfileCompletionGate({
      cookie: await createCentralSessionCookie(principal.id),
      idempotencyKey: "profile-reference-complete",
      input: {
        displayName: "Bad Reference",
        principal: "principal:missing-profile-reference",
      },
      operation: profileCompletionOperation(install.installId),
      target,
    });
    const afterAppRecords = await appRecords(install);

    expect(rejected.status).toBe(400);
    expect(rejected.body).toMatchObject({
      error:
        'Field "principal" references unknown auth:principal record "principal:missing-profile-reference".',
    });
    expect(afterAppRecords.records).toEqual(beforeAppRecords.records);
  });

  it("completes terms acceptance and reuses already accepted policy records", async () => {
    const install = await createAppInstall({
      installId: "terms-portal",
      label: "Terms Portal",
      packageAppKey: "tasks",
    });
    const principal = await createPrincipal("Terms Acceptance");
    const target = appTargetForInstall(install);

    await createPrimaryEmail(principal.id, "terms-acceptance@example.com", "verified");
    await createCredential(principal.id, "terms-acceptance");
    await createAppRegistration(principal.id, { appInstallId: "terms-portal" });
    const privacyPolicy = await createAccountPolicy({
      appInstallId: "terms-portal",
      displayName: "Portal privacy",
      policyKey: "terms-portal-privacy",
      scopeKind: "app-install",
    });
    const termsPolicy = await createAccountPolicy({
      appInstallId: "terms-portal",
      displayName: "Portal terms",
      policyKey: "terms-portal-terms",
      scopeKind: "app-install",
    });
    const existingAcceptance = await acceptPolicy(principal.id, privacyPolicy.id);
    const blocked = await expectGate({ principalId: principal.id, target }, "terms-acceptance");

    expect(blocked).toMatchObject({
      gate: {
        kind: "terms-acceptance",
        operation: {
          entityName: "principal-policy-acceptance",
          operationKey: "auth.terms-acceptance.complete",
          operationName: "completeTermsAcceptance",
        },
        policies: [expect.objectContaining({ accountPolicyId: termsPolicy.id })],
      },
      status: "blocked",
      target,
    });

    const cookie = await createCentralSessionCookie(principal.id);
    const beforeRecords = await identityRecords();
    const beforeCounts = identityRecordCounts(beforeRecords.records);
    const beforePrivateCounts = await authPrivateCounts();
    const completed = await completeTermsAcceptanceGate({
      acceptedPolicyIds: [privacyPolicy.id, termsPolicy.id],
      cookie,
      target,
    });
    const afterRecords = await identityRecords();
    const afterCounts = identityRecordCounts(afterRecords.records);
    const afterPrivateCounts = await authPrivateCounts();

    expect(completed.status).toBe(200);
    expect(completed.setCookie).toBeNull();
    expect(completed.body).toMatchObject({
      acceptedPolicies: expect.arrayContaining([
        expect.objectContaining({
          accountPolicyId: privacyPolicy.id,
          principalPolicyAcceptanceId: existingAcceptance.id,
          status: "accepted",
        }),
        expect.objectContaining({
          accountPolicyId: termsPolicy.id,
          status: "accepted",
        }),
      ]),
      accountCompletion: {
        continueTo: "/apps/terms-portal",
        status: "complete",
        target,
      },
      completed: true,
      continueTo: "/apps/terms-portal",
    });
    expect(afterCounts).toMatchObject({
      appRegistrations: beforeCounts.appRegistrations,
      roleAssignments: beforeCounts.roleAssignments,
    });
    expect(afterCounts.acceptedPolicies).toBe(beforeCounts.acceptedPolicies + 1);
    expect(afterPrivateCounts).toEqual(beforePrivateCounts);
  });

  it("rejects wrong-scope, retired, and tombstoned terms policies without acceptance writes", async () => {
    const install = await createAppInstall({
      installId: "reject-terms",
      label: "Reject Terms",
      packageAppKey: "tasks",
    });
    const principal = await createPrincipal("Reject Terms");
    const target = appTargetForInstall(install);

    await createPrimaryEmail(principal.id, "reject-terms@example.com", "verified");
    await createCredential(principal.id, "reject-terms");
    await createAppRegistration(principal.id, { appInstallId: "reject-terms" });
    const requiredPolicy = await createAccountPolicy({
      appInstallId: "reject-terms",
      displayName: "Required terms",
      policyKey: "reject-terms-required",
      scopeKind: "app-install",
    });
    const wrongScopePolicy = await createAccountPolicy({
      appInstallId: "billing",
      displayName: "Wrong app terms",
      policyKey: "wrong-app-terms",
      scopeKind: "app-install",
    });
    const retiredPolicy = await createAccountPolicy({
      appInstallId: "reject-terms",
      displayName: "Retired terms",
      policyKey: "retired-terms",
      scopeKind: "app-install",
    });
    const tombstonedPolicy = await createAccountPolicy({
      appInstallId: "reject-terms",
      displayName: "Tombstoned terms",
      policyKey: "tombstoned-terms",
      scopeKind: "app-install",
    });

    await updateIdentityRecord("account-policy", retiredPolicy.id, { status: "retired" });
    await deleteIdentityRecord("account-policy", tombstonedPolicy.id);

    const cookie = await createCentralSessionCookie(principal.id);

    for (const invalidPolicy of [wrongScopePolicy, retiredPolicy, tombstonedPolicy]) {
      const beforeRecords = await identityRecords();
      const rejected = await completeTermsAcceptanceGate({
        acceptedPolicyIds: [requiredPolicy.id, invalidPolicy.id],
        cookie,
        target,
      });
      const afterRecords = await identityRecords();

      expect(rejected.status).toBe(409);
      expect(rejected.body).toEqual({
        error: "Terms acceptance policies must be active and target-scoped.",
      });
      expect(identityRecordCounts(afterRecords.records)).toEqual(
        identityRecordCounts(beforeRecords.records),
      );
    }
  });

  it("rejects duplicate and partial terms acceptance submissions without writes", async () => {
    const install = await createAppInstall({
      installId: "partial-terms",
      label: "Partial Terms",
      packageAppKey: "tasks",
    });
    const principal = await createPrincipal("Partial Terms");
    const target = appTargetForInstall(install);

    await createPrimaryEmail(principal.id, "partial-terms@example.com", "verified");
    await createCredential(principal.id, "partial-terms");
    await createAppRegistration(principal.id, { appInstallId: "partial-terms" });
    const firstPolicy = await createAccountPolicy({
      appInstallId: "partial-terms",
      displayName: "First terms",
      policyKey: "partial-terms-first",
      scopeKind: "app-install",
    });
    const secondPolicy = await createAccountPolicy({
      appInstallId: "partial-terms",
      displayName: "Second terms",
      policyKey: "partial-terms-second",
      scopeKind: "app-install",
    });
    const cookie = await createCentralSessionCookie(principal.id);
    const beforeRecords = await identityRecords();
    const duplicate = await completeTermsAcceptanceGate({
      acceptedPolicyIds: [firstPolicy.id, firstPolicy.id],
      cookie,
      target,
    });
    const partial = await completeTermsAcceptanceGate({
      acceptedPolicyIds: [firstPolicy.id],
      cookie,
      target,
    });
    const afterRecords = await identityRecords();

    expect(duplicate.status).toBe(400);
    expect(duplicate.body).toEqual({
      error: "Account completion terms acceptance acceptedPolicyIds must not contain duplicates.",
    });
    expect(partial.status).toBe(409);
    expect(partial.body).toMatchObject({
      accountCompletion: {
        gate: {
          kind: "terms-acceptance",
          policies: expect.arrayContaining([
            expect.objectContaining({ accountPolicyId: firstPolicy.id }),
            expect.objectContaining({ accountPolicyId: secondPolicy.id }),
          ]),
        },
        status: "blocked",
      },
      error: "Terms acceptance request does not include every current policy.",
    });
    expect(identityRecordCounts(afterRecords.records)).toEqual(
      identityRecordCounts(beforeRecords.records),
    );
  });

  it("treats revoked and tombstoned policy acceptances as unsatisfied before creating new accepted records", async () => {
    const install = await createAppInstall({
      installId: "stale-acceptances",
      label: "Stale Acceptances",
      packageAppKey: "tasks",
    });
    const principal = await createPrincipal("Stale Acceptances");
    const target = appTargetForInstall(install);

    await createPrimaryEmail(principal.id, "stale-acceptances@example.com", "verified");
    await createCredential(principal.id, "stale-acceptances");
    await createAppRegistration(principal.id, { appInstallId: "stale-acceptances" });
    const revokedPolicy = await createAccountPolicy({
      appInstallId: "stale-acceptances",
      displayName: "Revoked terms",
      policyKey: "revoked-terms",
      scopeKind: "app-install",
    });
    const tombstonedPolicy = await createAccountPolicy({
      appInstallId: "stale-acceptances",
      displayName: "Deleted acceptance terms",
      policyKey: "deleted-acceptance-terms",
      scopeKind: "app-install",
    });
    const revokedAcceptance = await acceptPolicy(principal.id, revokedPolicy.id);
    const tombstonedAcceptance = await acceptPolicy(principal.id, tombstonedPolicy.id);

    await updateIdentityRecord("principal-policy-acceptance", revokedAcceptance.id, {
      status: "revoked",
    });
    await deleteIdentityRecord("principal-policy-acceptance", tombstonedAcceptance.id);

    const blocked = await expectGate({ principalId: principal.id, target }, "terms-acceptance");

    expect(blocked).toMatchObject({
      gate: {
        policies: expect.arrayContaining([
          expect.objectContaining({ accountPolicyId: revokedPolicy.id }),
          expect.objectContaining({ accountPolicyId: tombstonedPolicy.id }),
        ]),
      },
    });

    const completed = await completeTermsAcceptanceGate({
      acceptedPolicyIds: [revokedPolicy.id, tombstonedPolicy.id],
      cookie: await createCentralSessionCookie(principal.id),
      target,
    });
    const records = (await identityRecords()).records;

    expect(completed.status).toBe(200);
    expect(completed.body).toMatchObject({
      accountCompletion: { status: "complete" },
      completed: true,
      continueTo: "/apps/stale-acceptances",
    });
    expect(
      records.filter(
        (record) =>
          record.entity === "principal-policy-acceptance" &&
          record.values.principal === principal.id &&
          record.values.accountPolicy === revokedPolicy.id &&
          record.values.status === "accepted" &&
          !record.deletedAt,
      ),
    ).toHaveLength(1);
    expect(
      records.filter(
        (record) =>
          record.entity === "principal-policy-acceptance" &&
          record.values.principal === principal.id &&
          record.values.accountPolicy === tombstonedPolicy.id &&
          record.values.status === "accepted" &&
          !record.deletedAt,
      ),
    ).toHaveLength(1);
    expect(records.find((record) => record.id === revokedAcceptance.id)?.values.status).toBe(
      "revoked",
    );
    expect(records.find((record) => record.id === tombstonedAcceptance.id)?.deletedAt).toEqual(
      expect.any(String),
    );
  });
});

async function createReadyPrincipal(
  displayName: string,
  options: {
    appInstallId: string;
    policyKey: string;
  },
) {
  const principal = await createPrincipal(displayName);
  const email = await createPrimaryEmail(
    principal.id,
    `${options.policyKey.replace(/\W+/g, "-")}@example.com`,
    "verified",
  );
  await createCredential(principal.id, options.policyKey);
  await createAppRegistration(principal.id, { appInstallId: options.appInstallId });
  const policy = await createAccountPolicy({
    appInstallId: options.appInstallId,
    displayName: `${options.policyKey} terms`,
    policyKey: options.policyKey,
    scopeKind: "app-install",
  });
  const acceptance = await acceptPolicy(principal.id, policy.id);

  return {
    acceptance,
    email,
    id: principal.id,
    principal,
  };
}

async function expectGate(input: AccountCompletionGateResolverInput, kind: string) {
  const result = await resolveGate(input);

  expect(result.status).toBe("blocked");

  if (result.status !== "blocked") {
    throw new Error("Expected blocked gate result.");
  }

  expect(result.gate.kind).toBe(kind);

  return result;
}

async function resolveGate(
  input: AccountCompletionGateResolverInput,
): Promise<AccountCompletionGateResolutionResult> {
  const response = await harness.fetch(INSTANCE_AUTH_ACCOUNT_COMPLETION_RESOLVE_PATH, {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const body = await response.json();

  expect(response.status).toBe(200);

  return parseAccountCompletionGateResolutionResult(body);
}

async function resolveGateFailure(input: AccountCompletionGateResolverInput) {
  const response = await harness.fetch(INSTANCE_AUTH_ACCOUNT_COMPLETION_RESOLVE_PATH, {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const body = (await response.json()) as {
    error: string;
  };
  expect(response.status).toBe(400);
  return body;
}
async function completeAppRegistrationGate(input: {
  cookie: string;
  target: AccountCompletionGateTarget;
}) {
  const response = await fetchAuthOrigin(INSTANCE_AUTH_APP_REGISTRATION_GATE_COMPLETE_PATH, {
    body: JSON.stringify({ target: input.target }),
    headers: {
      "Content-Type": "application/json",
      Cookie: input.cookie,
    },
    method: "POST",
  });

  return {
    body: (await response.json()) as Record<string, unknown>,
    setCookie: response.headers.get("Set-Cookie"),
    status: response.status,
  };
}

async function completeProfileCompletionGate(input: {
  cookie: string;
  idempotencyKey: string;
  input: Record<string, unknown>;
  operation: Record<string, unknown>;
  target: AccountCompletionGateTarget;
}) {
  const response = await fetchAuthOrigin(INSTANCE_AUTH_PROFILE_COMPLETION_GATE_COMPLETE_PATH, {
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
    setCookie: response.headers.get("Set-Cookie"),
    status: response.status,
  };
}

async function completeTermsAcceptanceGate(input: {
  acceptedPolicyIds: string[];
  cookie: string;
  target: AccountCompletionGateTarget;
}) {
  const response = await fetchAuthOrigin(INSTANCE_AUTH_TERMS_ACCEPTANCE_GATE_COMPLETE_PATH, {
    body: JSON.stringify({
      acceptedPolicyIds: input.acceptedPolicyIds,
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
    setCookie: response.headers.get("Set-Cookie"),
    status: response.status,
  };
}

async function createCentralSessionCookie(principalId: string) {
  const response = await fetchAuthOrigin("/harness/auth/session", {
    body: JSON.stringify({ principalId }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const cookie = response.headers.get("Set-Cookie") ?? "";
  expect(response.status).toBe(200);
  expect(cookie).toContain(`${CENTRAL_AUTH_SESSION_COOKIE_NAME}=`);
  return cookie.split(";")[0] ?? cookie;
}
async function identityRecords() {
  const response = await fetchAuthOrigin("/harness/identity-records");
  expect(response.status).toBe(200);
  return (await response.json()) as {
    records: StoredRecord[];
  };
}
async function authPrivateCounts() {
  const response = await fetchAuthOrigin("/harness/auth/private-counts");
  expect(response.status).toBe(200);
  return (await response.json()) as {
    centralSessions: number;
    handoffGrants: number;
    passkeyCredentials: number;
  };
}
async function appRecords(install: CreateAppInstallResponse["install"]) {
  const response = await harness.fetch(
    `/harness/app-records?installId=${encodeURIComponent(install.installId)}&packageAppKey=${encodeURIComponent(install.packageAppKey)}`,
  );
  const body = (await response.json()) as {
    records: StoredRecord[];
  };
  expect(response.status).toBe(200);
  return body;
}
async function patchControlPlaneAppInstall(input: {
  deleteFields?: readonly string[];
  installId: string;
  values?: Record<string, unknown>;
}) {
  const response = await harness.fetch("/harness/control-plane/app-install/patch", {
    body: JSON.stringify({
      deleteFields: input.deleteFields ?? [],
      idempotencyKey: nextWriteKey("control-plane-app-install-patch"),
      installId: input.installId,
      values: input.values ?? {},
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const body = (await response.json()) as {
    error?: string;
    record?: StoredRecord;
  };
  expect(response.status, JSON.stringify(body)).toBe(200);
  return body.record;
}
function profileCompletionOperation(appInstallId: string) {
  return {
    appInstallId,
    entityName: "profile",
    label: "Complete profile",
    operationKey: "profile.completeRegistration",
    operationName: "completeRegistration",
  };
}

async function profileCompletionWorkspacePackage() {
  const sourceSchema = profileCompletionSourceSchema();
  const sourceSchemaHash = await computeSourceSchemaHash(sourceSchema);

  return {
    manifest: workspaceAppPackageManifestFixture({
      defaultInstallId: "profile",
      label: "Profile App",
      packageAppKey: "profile-app",
      packageRevision: 1,
      sourceSchemaHash,
      supportsMultipleInstalls: true,
    }),
    seedRecords: [],
    sourceSchema,
  };
}

function profileCompletionSourceSchema() {
  return {
    version: 1,
    entities: [
      {
        id: "entity_d66347a4-4328-411d-bcd4-ab4a8ffc31e0",
        key: "profile",
        label: "Profile",
        fields: [
          {
            key: "actorPrincipalId",
            type: "text",
            required: true,
            label: "Actor principal",
          },
          {
            key: "displayName",
            type: "text",
            required: true,
            label: "Display name",
          },
          {
            key: "principal",
            type: "reference",
            required: true,
            label: "Principal",
            to: "auth:principal",
          },
        ],
        operations: [
          {
            key: "completeRegistration",
            label: "Complete profile",
            kind: "command",
            scope: "collection",
            policy: {
              actors: ["authenticated"],
            },
            input: {
              fields: [
                {
                  key: "displayName",
                  field: "displayName",
                },
                {
                  key: "principal",
                  field: "principal",
                },
              ],
            },
            effect: {
              type: "recordPlan",
              steps: [
                {
                  name: "createProfile",
                  kind: "create",
                  entity: "profile",
                  recordId: { kind: "generatedId", prefix: "profile" },
                  values: {
                    actorPrincipalId: { kind: "actor", field: "principalId" },
                    displayName: { kind: "input", field: "displayName" },
                    principal: {
                      kind: "reference",
                      entity: "auth:principal",
                      id: { kind: "input", field: "principal" },
                    },
                  },
                },
              ],
            },
            output: {
              type: "command",
            },
            idempotency: {
              required: true,
            },
          },
        ],
      },
    ],
    queries: [
      {
        key: "profileAll",
        label: "All",
        entity: "profile",
        expression: {
          kind: "all",
        },
      },
    ],
    itemViews: [
      {
        key: "profileItem",
        entity: "profile",
        fields: [
          {
            field: "displayName",
            editor: "text",
            commit: "field-commit",
          },
        ],
      },
    ],
    tableViews: [],
    views: [
      {
        key: "profileHome",
        type: "collection",
        label: "Profiles",
        entity: "profile",
        queries: [{ query: "profileAll" }],
        defaultQuery: "profileAll",
        result: {
          type: "list",
          itemView: "profileItem",
        },
      },
    ],
    screens: [
      {
        key: "profileHome",
        type: "workspace",
        label: "Profiles",
        path: "/",
        layout: {
          type: "stack",
          sections: [
            {
              id: "profiles",
              type: "collection",
              view: "profileHome",
            },
          ],
        },
      },
    ],
  };
}
function fetchAuthOrigin(path: string, init?: Parameters<Harness["mf"]["dispatchFetch"]>[1]) {
  return harness.mf.dispatchFetch(`https://auth.example.com${path}`, init);
}

async function createAppInstall(input: {
  installId: string;
  label: string;
  packageAppKey: string;
  registrationOperation?: string;
  registrationPolicy?: "closed" | "custom-operation" | "email-verified";
}) {
  const response = await harness.fetch("/api/formless/app-installs", {
    body: JSON.stringify(input),
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });
  const body = (await response.json()) as CreateAppInstallResponse;

  expect(response.status, JSON.stringify(body)).toBe(201);

  return body.install;
}

async function createPrincipal(displayName: string) {
  return postIdentityRecordOperation({
    entity: "principal",
    idempotencyKey: nextWriteKey("principal"),
    operationName: "create",
    input: {
      displayName,
      kind: "human",
      status: "active",
    },
  });
}

async function createPrimaryEmail(
  principalId: string,
  email: string,
  verificationStatus: "unverified" | "verified",
) {
  return postIdentityRecordOperation({
    entity: "principal-email",
    idempotencyKey: nextWriteKey("email"),
    operationName: "create",
    input: {
      displayEmail: email,
      normalizedEmail: email.toLowerCase(),
      primary: true,
      principal: principalId,
      recovery: false,
      verificationStatus,
      ...(verificationStatus === "verified" ? { verifiedAt: "2026-07-06T00:00:00.000Z" } : {}),
    },
  });
}

async function createCredential(principalId: string, label: string) {
  const response = await harness.fetch("/harness/auth/credential", {
    body: JSON.stringify({
      credentialId: Buffer.from(`credential:${principalId}:${label}`).toString("base64url"),
      principalId,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  expect(response.status).toBe(200);
}

async function createInvitation(
  principalId: string,
  target: {
    targetAppInstallId?: string;
    targetOrganization?: string;
    targetSurface: "app-install" | "instance" | "organization";
  },
) {
  return postIdentityRecordOperation({
    entity: "invitation",
    idempotencyKey: nextWriteKey("invitation"),
    operationName: "create",
    input: {
      expiresAt: "2999-01-01T00:00:00.000Z",
      invitedPrincipal: principalId,
      status: "pending",
      targetEmail: `${nextWriteKey("invitee")}@example.com`,
      ...target,
    },
  });
}

async function createAppRegistration(
  principalId: string,
  input: {
    appInstallId: string;
    selectedOrganization?: string;
    status?: "active" | "pending";
  },
) {
  return postIdentityRecordOperation({
    entity: "app-registration",
    idempotencyKey: nextWriteKey("app-registration"),
    operationName: "create",
    input: {
      appInstallId: input.appInstallId,
      selectedOrganization: input.selectedOrganization,
      status: input.status ?? "active",
      targetKind: "principal",
      targetPrincipal: principalId,
    },
  });
}

async function createAccountPolicy(input: {
  appInstallId?: string;
  displayName: string;
  policyKey: string;
  scopeKind: "app-install" | "instance" | "organization";
  scopeOrganization?: string;
}) {
  return postIdentityRecordOperation({
    entity: "account-policy",
    idempotencyKey: nextWriteKey("policy"),
    operationName: "create",
    input: {
      displayName: input.displayName,
      policyKey: input.policyKey,
      version: "2026-07-06",
      scopeKind: input.scopeKind,
      status: "active",
      ...(input.appInstallId === undefined ? {} : { appInstallId: input.appInstallId }),
      ...(input.scopeOrganization === undefined
        ? {}
        : { scopeOrganization: input.scopeOrganization }),
    },
  });
}

async function acceptPolicy(principalId: string, accountPolicy: string) {
  return postIdentityRecordOperation({
    entity: "principal-policy-acceptance",
    idempotencyKey: nextWriteKey("acceptance"),
    operationName: "create",
    input: {
      acceptedAt: "2026-07-06T00:00:00.000Z",
      accountPolicy,
      principal: principalId,
      status: "accepted",
    },
  });
}

async function createOrganization(displayName: string) {
  return postIdentityRecordOperation({
    entity: "organization",
    idempotencyKey: nextWriteKey("organization"),
    operationName: "create",
    input: {
      displayName,
      status: "active",
    },
  });
}

async function assignRole(
  principalId: string,
  roleKey: "app.admin" | "app.user" | "instance.admin" | "instance.owner",
  input: {
    appInstallId?: string;
    scopeKind: "app-install" | "instance" | "organization";
    scopeOrganization?: string;
  },
) {
  return postIdentityRecordOperation({
    entity: "role-assignment",
    idempotencyKey: nextWriteKey("role-assignment"),
    operationName: "create",
    input: {
      appInstallId: input.appInstallId,
      role: `role:${roleKey}`,
      scopeKind: input.scopeKind,
      scopeOrganization: input.scopeOrganization,
      status: "active",
      targetKind: "principal",
      targetPrincipal: principalId,
    },
  });
}

async function updateIdentityRecord(
  entity: string,
  recordId: string,
  input: Record<string, unknown>,
) {
  return postIdentityRecordOperation({
    entity,
    idempotencyKey: nextWriteKey(`${entity}-update`),
    input,
    operationName: "update",
    recordId,
  });
}

async function deleteIdentityRecord(entity: string, recordId: string) {
  const response = await fetchAuthOrigin("/harness/identity/tombstone", {
    body: JSON.stringify({
      entity,
      idempotencyKey: nextWriteKey(`${entity}-tombstone`),
      recordId,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const body = (await response.json()) as {
    record: StoredRecord;
  };
  expect(response.status).toBe(200);
  return body.record;
}
async function postIdentityRecordOperation(input: Parameters<typeof recordOperationRequest>[0]) {
  const request = recordOperationRequest(input);
  const response = await harness.fetch(`${identityApi}${request.path.slice("/api".length)}`, {
    body: JSON.stringify(request.body),
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });
  const body = (await response.json()) as OperationInvocationResponse;

  expect(response.status, JSON.stringify(body)).toBe(200);

  return request.response(body).record as StoredRecord;
}

function appTarget(
  overrides: Partial<AccountCompletionGateTarget> = {},
): AccountCompletionGateTarget {
  return {
    appInstallId: "crm",
    returnTo: "/dashboard",
    routeId: "route:crm",
    storageIdentity: "app:crm",
    targetOrigin: "https://crm.example.com",
    targetProfile: "app",
    ...overrides,
  };
}

function appTargetForInstall(
  install: CreateAppInstallResponse["install"],
  overrides: Partial<AccountCompletionGateTarget> = {},
): AccountCompletionGateTarget {
  const route = install.routes?.find((candidate) => candidate.routeKind === "admin");

  if (!route) {
    throw new Error(`Install "${install.installId}" did not expose an admin route.`);
  }

  return appTarget({
    appInstallId: install.installId,
    returnTo: route.path,
    routeId: route.id,
    storageIdentity: `app:${install.installId}`,
    targetOrigin: "https://auth.example.com",
    ...overrides,
  });
}

function identityRecordCounts(records: StoredRecord[]) {
  return {
    acceptedPolicies: records.filter(
      (record) =>
        record.entity === "principal-policy-acceptance" &&
        !record.deletedAt &&
        record.values.status === "accepted",
    ).length,
    appRegistrations: records.filter(
      (record) => record.entity === "app-registration" && !record.deletedAt,
    ).length,
    roleAssignments: records.filter(
      (record) => record.entity === "role-assignment" && !record.deletedAt,
    ).length,
  };
}

function nextWriteKey(prefix: string) {
  writeCounter += 1;

  return `${prefix}-${writeCounter}`;
}

function adminHeaders(headers: Record<string, string> = {}) {
  return {
    ...headers,
    Authorization: `Bearer ${adminToken}`,
  };
}

async function writeAccountCompletionHarness() {
  harnessDir = await mkdtemp(join(tmpdir(), "formless-account-completion-harness-"));
  const path = join(harnessDir, "account-completion-harness.ts");

  await writeFile(
    path,
    `
      import { IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX, IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY } from "@dpeek/formless-identity-control-plane";
      import { INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY } from "@dpeek/formless-instance-control-plane";
      import { FormlessAuthority } from "${process.cwd()}/src/worker/authority.ts";
      import { createCentralAuthSessionCookie } from "${process.cwd()}/src/worker/central-auth-session.ts";
      import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "${process.cwd()}/src/worker/formless-instance.ts";
      import { createPasskeyCredential } from "${process.cwd()}/src/worker/instance-auth-state.ts";
      import { getBootstrapRecords, writeRecordSetForCommandOperationOutcome } from "${process.cwd()}/src/worker/storage.ts";

      export class AccountCompletionHarness extends FormlessAuthority {
        constructor(ctx, env) {
          super(ctx, env);
          this.env = env;
        }

        async fetch(request) {
          const url = new URL(request.url);

          if (url.pathname === "/harness/identity-records") {
            return Response.json({ records: getBootstrapRecords(this.ctx.storage) });
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
                  Authorization: "Bearer " + this.env.FORMLESS_ADMIN_TOKEN,
                },
                method: "GET",
              }),
            );

            if (!schemaResponse.ok) {
              return schemaResponse;
            }

            return Response.json({ records: getBootstrapRecords(this.ctx.storage) });
          }

          if (url.pathname === "/harness/control-plane/app-install/patch" && request.method === "POST") {
            const body = await request.json();
            const record = getBootstrapRecords(this.ctx.storage).find(
              (candidate) =>
                candidate.entity === "app-install" &&
                (candidate.id === body.installId || candidate.values.installId === body.installId),
            );

            if (!record) {
              return Response.json({ error: "Missing app install." }, { status: 404 });
            }

            const values = {
              ...record.values,
              ...(body.values ?? {}),
            };

            for (const fieldName of body.deleteFields ?? []) {
              delete values[fieldName];
            }

            const outcome = writeRecordSetForCommandOperationOutcome(
              this.ctx.storage,
              \`harness-control-plane-app-install-patch:\${body.installId}:\${body.idempotencyKey}\`,
              [{ kind: "patch", record, values }],
              undefined,
              { now: "2026-07-06T00:00:00.000Z" },
            );

            return Response.json({
              record: outcome.response.changes.at(-1)?.payload,
            });
          }

          if (url.pathname === "/harness/identity/tombstone" && request.method === "POST") {
            const body = await request.json();
            const record = getBootstrapRecords(this.ctx.storage).find(
              (candidate) => candidate.entity === body.entity && candidate.id === body.recordId,
            );

            if (!record) {
              return Response.json({ error: "Missing identity record." }, { status: 404 });
            }

            const outcome = writeRecordSetForCommandOperationOutcome(
              this.ctx.storage,
              \`harness-tombstone:\${body.entity}:\${body.recordId}:\${body.idempotencyKey}\`,
              [{ kind: "delete", record }],
              undefined,
              { now: "2026-07-06T00:00:00.000Z" },
            );

            return Response.json({
              record: outcome.response.changes.at(-1)?.payload,
            });
          }

          if (url.pathname === "/harness/auth/private-counts") {
            return Response.json({
              centralSessions: this.ctx.storage.sql.exec("SELECT COUNT(*) AS count FROM instance_auth_central_sessions").one().count,
              handoffGrants: this.ctx.storage.sql.exec("SELECT COUNT(*) AS count FROM instance_auth_handoff_grants").one().count,
              passkeyCredentials: this.ctx.storage.sql.exec("SELECT COUNT(*) AS count FROM instance_auth_passkey_credentials").one().count,
            });
          }

          if (url.pathname === "/harness/auth/session" && request.method === "POST") {
            const body = await request.json();
            const session = await createCentralAuthSessionCookie(this.ctx.storage, {
              env: this.env,
              now: "2026-07-06T00:00:00.000Z",
              principalId: body.principalId,
              request,
            });

            return Response.json(
              { session: session.session },
              { headers: { "Set-Cookie": session.cookie } },
            );
          }

          if (url.pathname === "/harness/auth/credential" && request.method === "POST") {
            const body = await request.json();

            return Response.json(createPasskeyCredential(this.ctx.storage, {
              credentialBackedUp: false,
              credentialDeviceType: "singleDevice",
              credentialId: body.credentialId,
              counter: 0,
              createdAt: "2026-07-06T00:00:00.000Z",
              principalId: body.principalId,
              publicKey: new Uint8Array([1, 2, 3, 4]),
              transports: [],
              updatedAt: "2026-07-06T00:00:00.000Z",
            }));
          }

          return super.fetch(request);
        }
      }

      export default {
        fetch(request, env) {
          const url = new URL(request.url);
          const harnessAppRecordsInstallId =
            url.pathname === "/harness/app-records" ? url.searchParams.get("installId") : null;
          const authorityName =
            harnessAppRecordsInstallId
              ? \`app:\${harnessAppRecordsInstallId}\`
              : url.pathname.startsWith("/harness/control-plane")
              ? INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY
              : url.pathname.startsWith(IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX) ||
                  url.pathname === "/harness/identity-records" ||
                  url.pathname === "/harness/identity/tombstone"
                ? IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY
                : FORMLESS_INSTANCE_AUTHORITY_NAME;
          const id = env.FORMLESS_AUTHORITY.idFromName(authorityName);

          return env.FORMLESS_AUTHORITY.get(id).fetch(request);
        },
      };
    `,
  );

  return path;
}
