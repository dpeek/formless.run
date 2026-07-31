import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { WebSocketEventMap } from "miniflare";
import {
  type InstanceControlPlaneAppInstallValues,
  type InstanceControlPlaneRouteValues,
} from "@dpeek/formless-instance-control-plane";
import {
  IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_PATH,
  IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX,
} from "@dpeek/formless-identity-control-plane";
import { formlessProgramSchema } from "../program/runtime.ts";
import {
  FORMLESS_PROGRAM_API_ROUTE_PREFIX,
  FORMLESS_PROGRAM_SCHEMA_KEY,
  FORMLESS_PROGRAM_SOURCE_SCHEMA_HASH,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
  formlessProgramSchemaProvenance,
} from "../program/target.ts";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import { FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER } from "../shared/protocol.ts";
import type {
  AppInstallsResponse,
  BootstrapResponse,
  CreateAppInstallResponse,
  OwnerIdentity,
  SchemaResponse,
  SyncResponse,
  SyncSocketServerMessage,
} from "../shared/protocol.ts";
import type {
  OperationCommandOutput,
  OperationInvocationResponse,
} from "../shared/operation-invocation.ts";
import { computeSourceSchemaHash, type SourceSchemaHash } from "../shared/upgrade-migrations.ts";
import { crmSourceSchema, siteSourceSchema } from "../test/schema-apps.ts";
import { ensureTestIdentityOwner } from "../test/identity-owner.ts";
import {
  appPackageManifestKind,
  appPackageManifestVersion,
  type AppPackageManifest,
} from "../shared/app-packages.ts";
import {
  FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME,
  formatRuntimeWorkspaceAppPackages,
} from "../shared/workspace-runtime-packages.ts";
import {
  instanceControlPlaneTestStorageSnapshot,
  recordOperationRequest,
  operationWriteRequest,
  restoreTestStorageSnapshot,
} from "../test/authority-write.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { INTERNAL_READ_OPERATION_INVOCATIONS_PATH } from "./instance-control-plane.ts";
import { createOwnerSessionCookie } from "./owner-session.ts";
import type { StoredOperationInvocation } from "./storage.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

type FailureResponse = {
  code?: string;
  error: string;
  field?: string;
};

const adminToken = "test-admin-token";
const controlPlaneApi = "/api/formless/program";
const createAppInstallOperation = `${controlPlaneApi}/operations/app-install/createAppInstall`;
const owner: OwnerIdentity = {
  id: "owner-1",
  name: "Ada Owner",
  email: "ada@example.com",
  createdAt: "2026-06-09T00:00:00.000Z",
};

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  await resetWorkerState();
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
      bindings: { FORMLESS_ADMIN_TOKEN: adminToken },
    },
  );
}

describe("instance control-plane API routes", () => {
  it("requires owner, Program-administrator, or admin authorization for dashboard control-plane reads", async () => {
    const anonymous = await harness.fetch(`${controlPlaneApi}/bootstrap`);
    const anonymousBody = await anonymous.json();
    const admin = await getJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);
    const ownerRead = await getOwnerJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);

    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
    expect(anonymousBody).toEqual({
      error:
        "Current Program member, owner, or admin authorization is required for this read endpoint.",
    });
    expect(ownerRead.body.records).toEqual(expect.arrayContaining(admin.body.records));
    expect(admin.body.records.map((record) => record.id).sort()).toEqual(
      [
        "role:app.admin",
        "role:app.editor",
        "role:app.user",
        "role:app.viewer",
        "role:instance.owner",
      ].sort(),
    );
  });

  it("grants the complete replica by ordered Program role while separating management and operations", async () => {
    const member = await createIdentityPrincipal("Replica Member");
    const memberAssignment = await assignIdentityProgramRole(member.id, "member");
    const editor = await createIdentityPrincipal("Replica Editor");
    await assignIdentityProgramRole(editor.id, "editor");
    const administrator = await createIdentityPrincipal("Replica Administrator");
    await assignIdentityProgramRole(administrator.id, "administrator");
    const memberSession = await principalSessionHeaders(member.id);
    const editorSession = await principalSessionHeaders(editor.id);
    const administratorSession = await principalSessionHeaders(administrator.id);
    const ownerSession = await ownerSessionHeaders();
    const memberSocket = await openProgramSyncSocket(memberSession);

    memberSocket.send(JSON.stringify({ type: "hello", cursor: 0, schemaUpdatedAt: null }));
    await expect(readProgramSyncSocketMessage(memberSocket)).resolves.toMatchObject({
      type: "sync",
      payload: { cursor: expect.any(Number) },
    });

    const replicaBodiesByPath = new Map<string, unknown>();
    for (const headers of [memberSession, editorSession, administratorSession, ownerSession]) {
      for (const path of [
        `${controlPlaneApi}/bootstrap`,
        `${controlPlaneApi}/schema`,
        `${controlPlaneApi}/sync?after=0`,
      ]) {
        const response = await harness.fetch(path, { headers });
        expect(response.status, path).toBe(200);
        const body = await response.json();
        if (!replicaBodiesByPath.has(path)) {
          replicaBodiesByPath.set(path, body);
        } else {
          expect(body, path).toEqual(replicaBodiesByPath.get(path));
        }
      }
    }

    for (const headers of [memberSession, editorSession]) {
      const management = await harness.fetch(
        `${IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX}${IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_PATH}`,
        { headers },
      );
      const snapshot = await harness.fetch(`${controlPlaneApi}/snapshot`, { headers });

      expect(management.status).toBe(401);
      expect(snapshot.status).toBe(401);
    }

    const unauthorizedOperation = await harness.fetch(
      `${controlPlaneApi}/operations/email-domain/create`,
      {
        body: "{invalid-json",
        headers: {
          ...memberSession,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );
    expect(unauthorizedOperation.status).toBe(401);
    expect(await unauthorizedOperation.json()).toEqual({
      error: "Current Program operation access is required for this endpoint.",
    });

    const memberTaskWrite = await harness.fetch(`${controlPlaneApi}/operations/task/create`, {
      body: JSON.stringify({
        idempotencyKey: "member-cannot-create-task",
        input: {
          done: false,
          priority: "normal",
          title: "Member task",
        },
      }),
      headers: {
        ...memberSession,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    expect(memberTaskWrite.status).toBe(401);

    const pushedTaskChange = readProgramSyncSocketMessage(memberSocket);
    const editorTaskWrite = await harness.fetch(`${controlPlaneApi}/operations/task/create`, {
      body: JSON.stringify({
        idempotencyKey: "editor-creates-program-task",
        input: {
          done: false,
          priority: "high",
          title: "Program-native task",
        },
      }),
      headers: {
        ...editorSession,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const editorTaskBody = (await editorTaskWrite.json()) as OperationInvocationResponse;
    const pushedTaskBody = await pushedTaskChange;
    const pushedSiteChange = readProgramSyncSocketMessage(memberSocket);
    const editorSiteWrite = await harness.fetch(`${controlPlaneApi}/operations/block/create`, {
      body: JSON.stringify({
        idempotencyKey: "editor-creates-program-site-page",
        input: {
          href: "/replica-site",
          label: "Program-native Site page",
          type: "page",
        },
      }),
      headers: {
        ...editorSession,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const editorSiteBody = (await editorSiteWrite.json()) as OperationInvocationResponse;
    const pushedSiteBody = await pushedSiteChange;
    const memberBootstrap = await harness.fetch(`${controlPlaneApi}/bootstrap`, {
      headers: memberSession,
    });
    const memberBootstrapBody = (await memberBootstrap.json()) as BootstrapResponse;

    expect(editorTaskWrite.status).toBe(200);
    expect(editorTaskBody.output).toMatchObject({
      changes: [expect.objectContaining({ entity: "task" })],
      cursor: expect.any(Number),
      type: "create",
    });
    expect(pushedTaskBody).toMatchObject({
      type: "sync",
      payload: {
        changes: [expect.objectContaining({ entity: "task" })],
        cursor: expect.any(Number),
      },
    });
    expect(editorSiteWrite.status).toBe(200);
    expect(editorSiteBody.output).toMatchObject({
      changes: [expect.objectContaining({ entity: "block" })],
      cursor: expect.any(Number),
      type: "create",
    });
    expect(pushedSiteBody).toMatchObject({
      type: "sync",
      payload: {
        changes: [expect.objectContaining({ entity: "block" })],
        cursor: expect.any(Number),
      },
    });
    expect(memberBootstrapBody.schema.entities).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "task" })]),
    );
    expect(memberBootstrapBody.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: "task",
          values: expect.objectContaining({ title: "Program-native task" }),
        }),
        expect.objectContaining({
          entity: "block",
          values: expect.objectContaining({ label: "Program-native Site page" }),
        }),
      ]),
    );

    const administratorManagement = await harness.fetch(
      `${IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX}${IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_PATH}`,
      { headers: administratorSession },
    );
    expect(administratorManagement.status).toBe(200);

    const memberSocketClosed = expectProgramSyncSocketClosedWithoutMessage(memberSocket);
    await postIdentityRecordOperation({
      entity: "program-role-assignment",
      idempotencyKey: "revoke-replica-member",
      operationName: "delete",
      recordId: memberAssignment.id,
    });
    await memberSocketClosed;
    const revokedRead = await harness.fetch(`${controlPlaneApi}/bootstrap`, {
      headers: memberSession,
    });
    expect(revokedRead.status).toBe(401);
  });

  it("authorizes same-origin Program administrators for operational control-plane intent only", async () => {
    const adminPrincipal = await createIdentityPrincipal("Same Origin Program Administrator");
    await assignIdentityProgramRole(adminPrincipal.id);
    const ordinaryPrincipal = await createIdentityPrincipal("Same Origin Ordinary Principal");
    const removedAdminPrincipal = await createIdentityPrincipal("Same Origin Removed Admin");
    const removedAdminAssignment = await assignIdentityProgramRole(removedAdminPrincipal.id);
    const disabledAdminPrincipal = await createIdentityPrincipal("Same Origin Disabled Admin");
    await assignIdentityProgramRole(disabledAdminPrincipal.id);

    const adminSession = await principalSessionHeaders(adminPrincipal.id);
    const ordinarySession = await principalSessionHeaders(ordinaryPrincipal.id);
    const removedAdminSession = await principalSessionHeaders(removedAdminPrincipal.id);
    const disabledAdminSession = await principalSessionHeaders(disabledAdminPrincipal.id);

    const appInstall = await postJson<CreateAppInstallResponse>(
      "/api/formless/app-installs",
      {
        packageAppKey: "test-crm",
        installId: "admin-crm",
        label: "Admin CRM",
      },
      adminSession,
    );
    const deploymentConfig = await postJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/deployment-config/create`,
      {
        idempotencyKey: "same-origin-admin-deployment-config",
        input: {
          targetId: "instance.primary",
          targetKind: "instance",
          label: "Primary",
          enabled: true,
          targetUrl: "https://same-origin-admin.example.workers.dev",
          providerFamily: "cloudflare",
        },
      },
      adminSession,
    );
    const route = await postJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/route/create`,
      {
        idempotencyKey: "same-origin-admin-route",
        input: {
          enabled: true,
          matchPath: "/admin-site",
          matchPrefix: "/admin-site/",
          kind: "mount",
          targetProfile: "public-site",
          surface: "public-site",
          access: "anonymous",
        },
      },
      adminSession,
    );
    const emailDomain = await postJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/email-domain/create`,
      {
        idempotencyKey: "same-origin-admin-email-domain",
        input: {
          enabled: true,
          providerFamily: "cloudflare",
          domain: "mail.example.com",
        },
      },
      adminSession,
    );
    const emailSender = await postJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/email-sender/create`,
      {
        idempotencyKey: "same-origin-admin-email-sender",
        input: {
          enabled: true,
          address: "contact@mail.example.com",
          displayName: "Contact",
          purpose: "contact-notification",
          emailDomain: operationRecord(emailDomain).id,
        },
      },
      adminSession,
    );
    const ownerSettings = await postJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/instance-settings/create`,
      {
        idempotencyKey: "same-origin-owner-settings",
        input: {
          settingsId: "instance",
          productionIdentityStatus: "unconfigured",
        },
      },
      await ownerSessionHeaders(),
    );
    const adminSettings = await postJson<FailureResponse>(
      `${controlPlaneApi}/operations/instance-settings/update`,
      {
        idempotencyKey: "same-origin-admin-settings-rejected",
        recordId: operationRecord(ownerSettings).id,
        input: {
          authOrigin: "https://auth.example.com",
        },
      },
      adminSession,
    );
    const ordinaryRead = await harness.fetch(`${controlPlaneApi}/bootstrap`, {
      headers: ordinarySession,
    });
    const ordinaryWrite = await postJson<FailureResponse>(
      `${controlPlaneApi}/operations/email-domain/create`,
      {
        idempotencyKey: "same-origin-ordinary-email-domain",
        input: {
          enabled: true,
          providerFamily: "cloudflare",
          domain: "ordinary-mail.example.com",
        },
      },
      ordinarySession,
    );

    await postIdentityRecordOperation({
      entity: "program-role-assignment",
      idempotencyKey: "same-origin-remove-admin-role",
      operationName: "delete",
      recordId: removedAdminAssignment.id,
    });
    await postIdentityRecordOperation({
      entity: "principal",
      idempotencyKey: "same-origin-disable-admin-principal",
      operationName: "update",
      recordId: disabledAdminPrincipal.id,
      input: { status: "disabled" },
    });

    const removedAdminRead = await harness.fetch("/api/formless/app-installs", {
      headers: removedAdminSession,
    });
    const disabledAdminWrite = await postJson<FailureResponse>(
      `${controlPlaneApi}/operations/email-domain/create`,
      {
        idempotencyKey: "same-origin-disabled-admin-email-domain",
        input: {
          enabled: true,
          providerFamily: "cloudflare",
          domain: "disabled-mail.example.com",
        },
      },
      disabledAdminSession,
    );

    expect(appInstall.response.status).toBe(201);
    expect(appInstall.body.install.installId).toBe("admin-crm");
    expect(deploymentConfig.response.status).toBe(200);
    expect(route.response.status).toBe(200);
    expect(emailDomain.response.status).toBe(200);
    expect(emailSender.response.status).toBe(200);
    expect(operationRecord(emailSender).values.address).toBe("contact@mail.example.com");
    expect(ownerSettings.response.status).toBe(200);
    expect(adminSettings.response.status).toBe(401);
    expect(adminSettings.body.error).toBe(
      "Current Program operation access is required for this endpoint.",
    );
    expect(ordinaryRead.status).toBe(401);
    expect(await ordinaryRead.json()).toEqual({
      error:
        "Current Program member, owner, or admin authorization is required for this read endpoint.",
    });
    expect(ordinaryWrite.response.status).toBe(401);
    expect(ordinaryWrite.body.error).toBe(
      "Current Program operation access is required for this endpoint.",
    );
    expect(removedAdminRead.status).toBe(200);
    expect(await removedAdminRead.json()).toEqual({
      installs: [],
      launchLinks: [],
      packages: [],
    });
    expect(disabledAdminWrite.response.status).toBe(401);
    expect(disabledAdminWrite.body.error).toBe(
      "Current Program operation access is required for this endpoint.",
    );
  });

  it("bootstraps the runtime-owned control-plane storage identity for safe query actors", async () => {
    const runnerBootstrap = await getJson<BootstrapResponse>(
      `${controlPlaneApi}/bootstrap?actorKind=runner`,
    );
    const ownerSchema = await getJson<SchemaResponse>(`${controlPlaneApi}/schema`);

    expect(runnerBootstrap.body.schema).toEqual(formlessProgramSchema);
    expect(runnerBootstrap.body.schemaProvenance).toEqual(formlessProgramSchemaProvenance);
    expect(FORMLESS_PROGRAM_SOURCE_SCHEMA_HASH).toBe(
      formlessProgramSchemaProvenance.sourceSchemaHash,
    );
    expect(runnerBootstrap.body.records.filter((record) => record.entity === "role")).toHaveLength(
      5,
    );
    expect(runnerBootstrap.body.cursor).toBeGreaterThanOrEqual(6);
    expect(runnerBootstrap.response.headers.get(FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER)).toBe(
      runnerBootstrap.body.schemaProvenance?.sourceSchemaHash,
    );
    expect(ownerSchema.body.schema).toEqual(formlessProgramSchema);
    expect(ownerSchema.body.schemaProvenance).toEqual(runnerBootstrap.body.schemaProvenance);
    expect(ownerSchema.response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("exports control-plane storage snapshots with the control-plane identity", async () => {
    const created = await postAdminJson<OperationInvocationResponse>(createAppInstallOperation, {
      idempotencyKey: "create-snapshot-export",
      input: {
        packageAppKey: "test-crm",
        installId: "snapshot-export",
        label: "Snapshot Export CRM",
      },
    });
    const bootstrap = await getJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);
    const snapshot = await getJson<StorageSnapshot>(`${controlPlaneApi}/snapshot`);

    expect(snapshot.body).toMatchObject({
      kind: STORAGE_SNAPSHOT_KIND,
      version: STORAGE_SNAPSHOT_VERSION,
      storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
      schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
      exportedAt: expect.any(String),
      schemaUpdatedAt: bootstrap.body.schemaUpdatedAt,
      sourceCursor: operationCommandResponse(created).cursor,
      schema: formlessProgramSchema,
    });
    expect([...snapshot.body.records].sort(byRecordId)).toEqual(
      [...bootstrap.body.records].sort(byRecordId),
    );
  });

  it("creates app install and default route records as one idempotent control-plane operation", async () => {
    const created = await postAdminJson<OperationInvocationResponse>(createAppInstallOperation, {
      idempotencyKey: "create-personal",
      input: {
        packageAppKey: "test-crm",
        installId: "personal",
        label: "Personal CRM",
      },
    });
    const replay = await postAdminJson<OperationInvocationResponse>(createAppInstallOperation, {
      idempotencyKey: "create-personal",
      input: {
        packageAppKey: "test-crm",
        installId: "personal",
        label: "Personal CRM",
      },
    });
    const controlPlane = await getJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);
    const installedCrm = await getJson<BootstrapResponse>(
      "/api/app-installs/test-crm/personal/bootstrap",
    );
    const sync = await getJson<SyncResponse>(`${controlPlaneApi}/sync?after=0`);
    const createdOutput = operationCommandResponse(created);
    const replayOutput = operationCommandResponse(replay);
    const invocations = await readControlPlaneOperationInvocations();

    expect(created.response.status).toBe(200);
    expect(created.body.status).toBe("committed");
    expect(createdOutput.affectedChangeIds).toHaveLength(2);
    expect(createdOutput.cursor).toBe(createdOutput.changes.at(-1)?.seq);
    expect(createdOutput.affectedChangeIds).toEqual(
      createdOutput.changes.map((change) => String(change.seq)),
    );
    expect(createdOutput.changes.map((change) => change.payload.id)).toEqual([
      "personal",
      "route:personal:admin",
    ]);
    expect(createdOutput.changes.map((change) => change.writeId)).toEqual([
      created.body.invocation.invocationId,
      created.body.invocation.invocationId,
    ]);
    expect(created.body.output).not.toHaveProperty("actionId");
    expect(created.body.output).not.toHaveProperty("response");
    expect(replay.response.status).toBe(200);
    expect(replay.body.status).toBe("replayed");
    expect(replayOutput).toEqual(createdOutput);
    expect(sync.body.changes).toEqual(expect.arrayContaining(createdOutput.changes));
    expect(sync.body.cursor).toBe(createdOutput.cursor);
    expect(invocations).toHaveLength(1);
    expect(invocations[0]).toMatchObject({
      invocationId: created.body.invocation.invocationId,
      operationKey: "app-install.createAppInstall",
      status: "replayed",
      affectedChangeIds: createdOutput.affectedChangeIds,
      output: createdOutput,
    });
    expect(invocations[0]?.statusHistory.map((entry) => entry.status)).toEqual([
      "accepted",
      "committed",
      "replayed",
    ]);
    expect(installedCrm.body.schema).toEqual(crmSourceSchema);
    expect(installedCrm.body.records).toEqual([]);
    expect(
      controlPlane.body.records.filter(
        (record) => record.entity === "app-install" || record.entity === "route",
      ),
    ).toHaveLength(2);
    expect(appInstallValues(controlPlane.body, "personal")).toMatchObject({
      installId: "personal",
      packageAppKey: "test-crm",
      label: "Personal CRM",
      storageIdentity: "app:personal",
    });
    expect(routeValues(controlPlane.body).map((route) => route["matchPath"])).toEqual([
      "/apps/personal",
    ]);
    expect(JSON.stringify(controlPlane.body.records)).not.toContain("block-placement");
  });

  it("keeps control-plane records isolated from installed app storage writes", async () => {
    await postAdminJson<OperationInvocationResponse>(createAppInstallOperation, {
      idempotencyKey: "create-work",
      input: {
        packageAppKey: "test-crm",
        installId: "work",
        label: "Work CRM",
      },
    });
    const appRecordWrite = await postInstalledAppRecordOperation("test-crm", "work", {
      idempotencyKey: "write-installed-crm-contact",
      entity: "contact",
      operationName: "create",
      input: {
        label: "Installed only",
      },
    });
    const controlPlane = await getJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);
    const installedCrm = await getJson<BootstrapResponse>(
      "/api/app-installs/test-crm/work/bootstrap",
    );
    const sync = await getJson<SyncResponse>(`${controlPlaneApi}/sync?after=0`);

    expect(appRecordWrite.body.record.entity).toBe("contact");
    expect(
      installedCrm.body.records.some((record) => record.id === appRecordWrite.body.record.id),
    ).toBe(true);
    expect(
      controlPlane.body.records
        .filter((record) => record.entity === "app-install" || record.entity === "route")
        .map((record) => record.entity),
    ).toEqual(["app-install", "route"]);
    expect(JSON.stringify(controlPlane.body.records)).not.toContain("Installed only");
    expect(JSON.stringify(sync.body)).not.toContain(appRecordWrite.body.record.id);
  });

  it("derives installed app API summaries from real control-plane route records", async () => {
    await postAdminJson<OperationInvocationResponse>(createAppInstallOperation, {
      idempotencyKey: "create-route-validation",
      input: {
        packageAppKey: "test-crm",
        installId: "personal",
        label: "Personal CRM",
      },
    });
    const before = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    const routeEdit = await postAdminJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/route/update`,
      {
        idempotencyKey: "route-edit",
        recordId: "route:personal:admin",
        input: {
          matchPath: "/apps/personal-admin",
          matchPrefix: "/apps/personal-admin/",
        },
      },
    );
    const after = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    expect(before.body.installs[0]).toMatchObject({
      adminRoute: "/apps/personal",
      installId: "personal",
    });
    expect(routeEdit.response.status).toBe(200);
    expect(after.body.installs[0]).toMatchObject({
      adminRoute: "/apps/personal-admin",
      installId: "personal",
    });
  });

  it("validates app install package keys and route capabilities against resolved packages", async () => {
    const missingPackage = await postAdminJson<FailureResponse>(
      `${controlPlaneApi}/operations/app-install/create`,
      {
        idempotencyKey: "missing-package-install",
        input: {
          installId: "missing",
          packageAppKey: "missing-package",
          label: "Missing",
          registrationPolicy: "closed",
          status: "installed",
          storageIdentity: "app:missing",
        },
      },
    );

    await postAdminJson<OperationInvocationResponse>(createAppInstallOperation, {
      idempotencyKey: "create-crm-workspace",
      input: {
        packageAppKey: "test-crm",
        installId: "tasks",
        label: "CRM Workspace",
      },
    });

    const unsupportedPublicRoute = await postAdminJson<FailureResponse>(
      `${controlPlaneApi}/operations/route/create`,
      {
        idempotencyKey: "tasks-public-route",
        input: {
          enabled: true,
          matchPath: "/sites/tasks",
          matchPrefix: "/sites/tasks/",
          kind: "mount",
          targetProfile: "public-site",
          appInstall: "tasks",
          surface: "public-site",
          access: "anonymous",
        },
      },
    );

    expect(missingPackage.response.status).toBe(400);
    expect(missingPackage.body.error).toContain('references unsupported package "missing-package"');
    expect(unsupportedPublicRoute.response.status).toBe(400);
    expect(unsupportedPublicRoute.body.error).toContain(
      'Package app "test-crm" does not support public Site routes.',
    );
  });

  it("validates management and app-role route authorization on writes", async () => {
    await postAdminJson<OperationInvocationResponse>(createAppInstallOperation, {
      idempotencyKey: "create-route-authorization",
      input: {
        packageAppKey: "test-crm",
        installId: "personal",
        label: "Personal CRM",
      },
    });

    const managementRoute = await postAdminJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/route/create`,
      {
        idempotencyKey: "management-route",
        input: {
          access: "management",
          enabled: true,
          kind: "mount",
          matchPath: "/settings",
          surface: "admin",
          targetProfile: "instance",
        },
      },
    );
    const appRoleRoute = await postAdminJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/route/create`,
      {
        idempotencyKey: "app-role-route",
        input: {
          access: "authenticated",
          appInstall: "personal",
          enabled: true,
          kind: "mount",
          matchPath: "/apps/personal-alt",
          requiredRole: "app.admin",
          surface: "admin",
          targetProfile: "app",
        },
      },
    );
    const ownerRoleRoute = await postAdminJson<FailureResponse>(
      `${controlPlaneApi}/operations/route/create`,
      {
        idempotencyKey: "owner-role-route",
        input: {
          access: "owner",
          appInstall: "personal",
          enabled: true,
          kind: "mount",
          matchPath: "/apps/personal-owner",
          requiredRole: "app.admin",
          surface: "admin",
          targetProfile: "app",
        },
      },
    );
    const managementAppRoute = await postAdminJson<FailureResponse>(
      `${controlPlaneApi}/operations/route/create`,
      {
        idempotencyKey: "management-app-route",
        input: {
          access: "management",
          appInstall: "personal",
          enabled: true,
          kind: "mount",
          matchPath: "/apps/personal-management",
          surface: "admin",
          targetProfile: "app",
        },
      },
    );

    expect(managementRoute.response.status).toBe(200);
    expect(operationRecord(managementRoute).values).toMatchObject({
      access: "management",
      targetProfile: "instance",
    });
    expect(appRoleRoute.response.status).toBe(200);
    expect(operationRecord(appRoleRoute).values).toMatchObject({
      access: "authenticated",
      appInstall: "personal",
      requiredRole: "app.admin",
      targetProfile: "app",
    });
    expect(ownerRoleRoute.response.status).toBe(400);
    expect(ownerRoleRoute.body.error).toBe(
      'Field "requiredRole" requires an authenticated app admin mount with one app install.',
    );
    expect(managementAppRoute.response.status).toBe(400);
    expect(managementAppRoute.body.error).toBe(
      'Field "access" can only be "management" for instance mount routes.',
    );
  });

  it("validates public Site route capability through the active package resolver", async () => {
    const sourceSchemaHash = await computeSourceSchemaHash(siteSourceSchema);
    const privateHarness = await createWorkerHarness(
      "src/worker/index.ts",
      {
        FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
      },
      {
        bindings: {
          FORMLESS_ADMIN_TOKEN: adminToken,
          [FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME]: formatRuntimeWorkspaceAppPackages([
            {
              manifest: privatePublicSitePackageManifest(sourceSchemaHash),
              sourceSchema: siteSourceSchema,
            },
          ]),
        },
      },
    );

    try {
      const install = await postHarnessAdminJson<OperationInvocationResponse>(
        privateHarness,
        createAppInstallOperation,
        {
          idempotencyKey: "private-site-install",
          input: {
            packageAppKey: "private-site",
            label: "Private Site",
            installId: "private-site",
          },
        },
      );
      const route = await postHarnessAdminJson<OperationInvocationResponse>(
        privateHarness,
        `${controlPlaneApi}/operations/route/create`,
        {
          idempotencyKey: "private-site-public-route",
          input: {
            enabled: true,
            matchPath: "/sites/private-site-alt",
            matchPrefix: "/sites/private-site-alt/",
            kind: "mount",
            targetProfile: "public-site",
            appInstall: "private-site",
            surface: "public-site",
            access: "anonymous",
          },
        },
      );

      expect(install.response.status).toBe(200);
      expect(install.body.status).toBe("committed");
      expect(route.response.status).toBe(200);
      expect(operationRecord(route).values).toMatchObject({
        appInstall: "private-site",
        surface: "public-site",
      });
    } finally {
      await privateHarness.dispose();
    }
  });

  it("commits generated route and deployment config management writes through operation routes", async () => {
    const deploymentConfig = await postAdminJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/deployment-config/create`,
      {
        idempotencyKey: "operation-deployment-config-create",
        input: {
          targetId: "instance.primary",
          targetKind: "instance",
          label: "Primary",
          enabled: true,
          targetUrl: "https://operation-managed.example.workers.dev",
          providerFamily: "cloudflare",
          accountId: "account-123",
          workerName: "operation-managed",
          credentialRef: "secret:cloudflare:primary",
        },
      },
    );
    const deploymentConfigRecord = operationRecord(deploymentConfig);
    const route = await postAdminJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/route/create`,
      {
        idempotencyKey: "operation-route-create",
        input: {
          enabled: true,
          matchHost: "operation-managed.example.com",
          matchPath: "/",
          matchPrefix: "/",
          kind: "mount",
          targetProfile: "public-site",
          surface: "public-site",
          access: "anonymous",
          deploymentConfig: deploymentConfigRecord.id,
        },
      },
    );
    const routePatch = await postAdminJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/route/update`,
      {
        idempotencyKey: "operation-route-update",
        recordId: operationRecord(route).id,
        input: {
          enabled: false,
          deploymentConfig: deploymentConfigRecord.id,
        },
      },
    );
    const deploymentPatch = await postAdminJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/deployment-config/update`,
      {
        idempotencyKey: "operation-deployment-config-update",
        recordId: deploymentConfigRecord.id,
        input: {
          label: "Primary Cloudflare",
          enabled: false,
        },
      },
    );

    expect(deploymentConfig.response.status).toBe(200);
    expect(deploymentConfig.body.invocation.operation.canonicalKey).toBe(
      "deployment-config.create",
    );
    expect(deploymentConfigRecord.values).toMatchObject({
      targetId: "instance.primary",
      providerFamily: "cloudflare",
    });
    expect(route.response.status).toBe(200);
    expect(route.body.invocation.operation.canonicalKey).toBe("route.create");
    expect(operationRecord(route).values).toMatchObject({
      deploymentConfig: deploymentConfigRecord.id,
      targetProfile: "public-site",
    });
    expect(routePatch.body.invocation.operation.canonicalKey).toBe("route.update");
    expect(operationRecord(routePatch).values).toMatchObject({
      enabled: false,
      deploymentConfig: deploymentConfigRecord.id,
    });
    expect(deploymentPatch.body.invocation.operation.canonicalKey).toBe("deployment-config.update");
    expect(operationRecord(deploymentPatch).values).toMatchObject({
      label: "Primary Cloudflare",
      enabled: false,
    });
    expect(operationRecord(deploymentPatch).values).not.toHaveProperty("observedStatus");
  });

  it("validates generated email sender defaults for auth settings writes", async () => {
    const emailDomain = await postAdminJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/email-domain/create`,
      {
        idempotencyKey: "auth-default-email-domain",
        input: {
          enabled: true,
          providerFamily: "cloudflare",
          domain: "mail.example.com",
        },
      },
    );
    const contactSender = await postAdminJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/email-sender/create`,
      {
        idempotencyKey: "auth-default-contact-sender",
        input: {
          enabled: true,
          address: "contact@mail.example.com",
          displayName: "Contact",
          purpose: "contact-notification",
          emailDomain: operationRecord(emailDomain).id,
        },
      },
    );
    const authSender = await postAdminJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/email-sender/create`,
      {
        idempotencyKey: "auth-default-auth-sender",
        input: {
          enabled: true,
          address: "auth@mail.example.com",
          displayName: "Auth",
          purpose: "auth",
          emailDomain: operationRecord(emailDomain).id,
        },
      },
    );
    const rejectedSettings = await postAdminJson<FailureResponse>(
      `${controlPlaneApi}/operations/instance-settings/create`,
      {
        idempotencyKey: "auth-default-settings-rejected",
        input: {
          settingsId: "instance",
          defaultEmailDomain: operationRecord(emailDomain).id,
          defaultContactSender: operationRecord(contactSender).id,
          defaultAuthSender: operationRecord(contactSender).id,
          productionIdentityStatus: "unconfigured",
        },
      },
    );
    const settings = await postAdminJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/instance-settings/create`,
      {
        idempotencyKey: "auth-default-settings-created",
        input: {
          settingsId: "instance",
          defaultEmailDomain: operationRecord(emailDomain).id,
          defaultContactSender: operationRecord(contactSender).id,
          defaultAuthSender: operationRecord(authSender).id,
          contactNotificationRecipient: "owner@example.com",
          productionIdentityStatus: "unconfigured",
        },
      },
    );

    expect(emailDomain.response.status).toBe(200);
    expect(contactSender.response.status).toBe(200);
    expect(authSender.response.status).toBe(200);
    expect(rejectedSettings.response.status).toBe(400);
    expect(rejectedSettings.body.error).toContain('must reference a sender with purpose "auth".');
    expect(settings.response.status).toBe(200);
    expect(operationRecord(settings).values).toMatchObject({
      defaultContactSender: operationRecord(contactSender).id,
      defaultAuthSender: operationRecord(authSender).id,
    });
  });

  it("validates preferred admin route references on settings writes", async () => {
    const adminRoute = await postAdminJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/route/create`,
      {
        idempotencyKey: "settings-admin-route",
        input: {
          enabled: true,
          matchHost: "admin.example.com",
          matchPath: "/",
          matchPrefix: "/",
          kind: "mount",
          targetProfile: "instance",
          surface: "admin",
          access: "owner",
        },
      },
    );
    const disabledAdminRoute = await postAdminJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/route/create`,
      {
        idempotencyKey: "settings-disabled-admin-route",
        input: {
          enabled: false,
          matchHost: "disabled-admin.example.com",
          matchPath: "/",
          matchPrefix: "/",
          kind: "mount",
          targetProfile: "instance",
          surface: "admin",
          access: "owner",
        },
      },
    );
    const hostlessAdminRoute = await postAdminJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/route/create`,
      {
        idempotencyKey: "settings-hostless-admin-route",
        input: {
          enabled: true,
          matchPath: "/hostless-admin",
          kind: "mount",
          targetProfile: "instance",
          surface: "admin",
          access: "owner",
        },
      },
    );
    const unmarkedInstanceRoute = await postAdminJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/route/create`,
      {
        idempotencyKey: "settings-unmarked-instance-route",
        input: {
          enabled: true,
          matchHost: "unmarked-admin.example.com",
          matchPath: "/",
          matchPrefix: "/",
          kind: "mount",
          targetProfile: "instance",
          access: "owner",
        },
      },
    );
    const settings = await postAdminJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/instance-settings/create`,
      {
        idempotencyKey: "settings-admin-route-created",
        input: {
          settingsId: "instance",
          adminRoute: operationRecord(adminRoute).id,
          productionIdentityStatus: "unconfigured",
        },
      },
    );
    const settingsRecordId = operationRecord(settings).id;
    const rejectedDisabledRoute = await postAdminJson<FailureResponse>(
      `${controlPlaneApi}/operations/instance-settings/update?recordId=${encodeURIComponent(settingsRecordId)}`,
      {
        idempotencyKey: "settings-admin-route-disabled-rejected",
        input: {
          adminRoute: operationRecord(disabledAdminRoute).id,
        },
      },
    );
    const rejectedHostlessRoute = await postAdminJson<FailureResponse>(
      `${controlPlaneApi}/operations/instance-settings/update?recordId=${encodeURIComponent(settingsRecordId)}`,
      {
        idempotencyKey: "settings-admin-route-hostless-rejected",
        input: {
          adminRoute: operationRecord(hostlessAdminRoute).id,
        },
      },
    );
    const rejectedUnmarkedRoute = await postAdminJson<FailureResponse>(
      `${controlPlaneApi}/operations/instance-settings/update?recordId=${encodeURIComponent(settingsRecordId)}`,
      {
        idempotencyKey: "settings-admin-route-unmarked-rejected",
        input: {
          adminRoute: operationRecord(unmarkedInstanceRoute).id,
        },
      },
    );

    expect(adminRoute.response.status).toBe(200);
    expect(disabledAdminRoute.response.status).toBe(200);
    expect(hostlessAdminRoute.response.status).toBe(200);
    expect(unmarkedInstanceRoute.response.status).toBe(200);
    expect(settings.response.status).toBe(200);
    expect(operationRecord(settings).values).toMatchObject({
      adminRoute: operationRecord(adminRoute).id,
    });
    expect(rejectedDisabledRoute.response.status).toBe(400);
    expect(rejectedDisabledRoute.body.error).toContain(
      "must reference an enabled exact-host instance admin route.",
    );
    expect(rejectedHostlessRoute.response.status).toBe(400);
    expect(rejectedHostlessRoute.body.error).toContain(
      "must reference an enabled exact-host instance admin route.",
    );
    expect(rejectedUnmarkedRoute.response.status).toBe(400);
    expect(rejectedUnmarkedRoute.body.error).toContain(
      "must reference an enabled exact-host instance admin route.",
    );
  });

  it("enforces operational management writes and rejects runner-only access to install creation", async () => {
    const unauthenticated = await postJson<FailureResponse>(createAppInstallOperation, {
      idempotencyKey: "create-private",
      input: {
        packageAppKey: "test-crm",
        installId: "private",
        label: "Private",
      },
    });
    const runner = await postAdminJson<FailureResponse>(
      createAppInstallOperation,
      {
        idempotencyKey: "create-runner",
        input: {
          packageAppKey: "test-crm",
          installId: "runner",
          label: "Runner",
        },
      },
      { actorKind: "runner" },
    );
    const runnerMutation = await postAdminJson<FailureResponse>(
      `${controlPlaneApi}/operations/app-install/create`,
      {
        idempotencyKey: "runner-install",
        input: {
          installId: "runner",
          packageAppKey: "test-crm",
          label: "Runner",
          registrationPolicy: "closed",
          status: "installed",
          storageIdentity: "app:runner",
        },
      },
      { actorKind: "runner" },
    );

    expect(unauthenticated.response.status).toBe(401);
    expect(unauthenticated.body.error).toBe(
      "Owner session, Program administrator session, or admin authorization is required for this write endpoint.",
    );
    expect(runner.response.status).toBe(400);
    expect(runner.body.error).toBe(
      'Operation "app-install.createAppInstall" is not exposed to actor "runner".',
    );
    expect(runnerMutation.response.status).toBe(400);
    expect(runnerMutation.body.error).toBe(
      'Control-plane entityOperation writes are not exposed to actor "runner".',
    );
  });

  it("allows secret references but rejects secret values in records and snapshot restore", async () => {
    const now = "2026-05-28T00:00:00.000Z";
    const deploymentConfig = await postAdminJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/deployment-config/create`,
      {
        idempotencyKey: "deployment-config",
        input: {
          targetId: "instance.primary",
          targetKind: "instance",
          label: "Cloudflare",
          enabled: true,
          targetUrl: "https://instance.example.workers.dev",
          providerFamily: "cloudflare",
          credentialRef: "secret:cloudflare:primary",
        },
      },
    );
    const rejectedRecord = await postAdminJson<FailureResponse>(
      `${controlPlaneApi}/operations/deployment-config/create`,
      {
        idempotencyKey: "secret-deployment-config",
        input: {
          targetId: "instance.secret",
          targetKind: "instance",
          label: "Secret",
          enabled: true,
          targetUrl: "https://secret.example.workers.dev",
          providerFamily: "cloudflare",
          accountId: "CF_API_TOKEN",
        },
      },
    );
    const rejectedSnapshot = await postAdminJson<FailureResponse>(
      `${controlPlaneApi}/snapshot/restore`,
      secretSnapshot(now),
    );
    const browserBootstrap = await getJson<BootstrapResponse>(
      `${controlPlaneApi}/bootstrap?actorKind=owner`,
    );

    expect(deploymentConfig.response.status).toBe(200);
    expect(operationRecord(deploymentConfig).values.credentialRef).toBe(
      "secret:cloudflare:primary",
    );
    expect(JSON.stringify(browserBootstrap.body)).not.toContain("CF_API_TOKEN");
    expect(JSON.stringify(browserBootstrap.body)).not.toContain("ALCHEMY_PASSWORD");
    expect(rejectedRecord.response.status).toBe(400);
    expect(rejectedRecord.body.error).toContain("cannot store control-plane secret values.");
    expect(rejectedSnapshot.response.status).toBe(400);
    expect(rejectedSnapshot.body.error).toContain("cannot store control-plane secret values.");
  });
});

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
async function postAdminJson<T>(
  path: string,
  body: unknown,
  options: {
    actorKind?: string;
  } = {},
) {
  return postJson<T>(path, body, {
    ...adminHeaders(),
    ...(options.actorKind === undefined
      ? {}
      : { "X-Formless-Control-Plane-Actor": options.actorKind }),
  });
}

async function postJson<T>(path: string, body: unknown, headers: Record<string, string> = {}) {
  const request = operationWriteRequest(path, body);
  const response = await harness.fetch(request.path, {
    body: JSON.stringify(request.body),
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const bodyJson = await response.json();

  return {
    body: (response.ok ? request.response(bodyJson) : bodyJson) as T,
    response,
  };
}

async function postInstalledAppRecordOperation(
  packageAppKey: string,
  installId: string,
  body: Parameters<typeof recordOperationRequest>[0],
) {
  const request = recordOperationRequest(body);
  const response = await harness.fetch(
    `/api/app-installs/${packageAppKey}/${installId}${request.path.slice("/api".length)}`,
    {
      body: JSON.stringify(request.body),
      headers: {
        ...adminHeaders(),
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );
  const bodyJson = await response.json();

  return {
    body: request.response(bodyJson),
    response,
  };
}

async function postHarnessAdminJson<T>(targetHarness: Harness, path: string, body: unknown) {
  const request = operationWriteRequest(path, body);
  const response = await targetHarness.fetch(request.path, {
    body: JSON.stringify(request.body),
    headers: {
      ...adminHeaders(),
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const bodyJson = await response.json();

  return {
    body: (response.ok ? request.response(bodyJson) : bodyJson) as T,
    response,
  };
}

async function resetWorkerState() {
  try {
    await resetKnownState();
  } catch {
    await harness.dispose();
    harness = await createHarness();
    await resetKnownState();
  }
}

async function resetKnownState() {
  await restoreTestStorageSnapshot(
    harness,
    `${controlPlaneApi}/snapshot/restore`,
    instanceControlPlaneTestStorageSnapshot(),
    adminHeaders(),
  );
}

async function readControlPlaneOperationInvocations(): Promise<StoredOperationInvocation[]> {
  const response = await harness.durableObjectFetch(
    "FORMLESS_AUTHORITY",
    FORMLESS_PROGRAM_STORAGE_IDENTITY,
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}${INTERNAL_READ_OPERATION_INVOCATIONS_PATH}`,
    { method: "GET" },
  );
  const body = (await response.json()) as {
    invocations?: StoredOperationInvocation[];
  };
  expect(response.status).toBe(200);
  expect(Array.isArray(body.invocations)).toBe(true);
  return body.invocations ?? [];
}
function adminHeaders(headers: Record<string, string> = {}) {
  return {
    ...headers,
    Authorization: `Bearer ${adminToken}`,
  };
}

function byRecordId(left: StoredRecord, right: StoredRecord) {
  return left.id.localeCompare(right.id);
}

async function ownerSessionHeaders() {
  const identityOwner = await ensureTestIdentityOwner(harness, adminToken, owner);
  const created = await createOwnerSessionCookie({
    env: { FORMLESS_ADMIN_TOKEN: adminToken },
    maxAgeSeconds: 60,
    now: "2999-01-01T00:00:00.000Z",
    owner: identityOwner,
    request: new Request("http://example.com/"),
  });

  return {
    Cookie: cookiePair(created.cookie),
  };
}

async function principalSessionHeaders(principalId: string) {
  return {
    Cookie: await ownerCookieForPrincipal(principalId),
  };
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

async function createIdentityPrincipal(displayName: string): Promise<StoredRecord> {
  return await postIdentityRecordOperation({
    entity: "principal",
    idempotencyKey: `control-plane-create-${displayName.toLowerCase().replace(/\W+/g, "-")}`,
    operationName: "create",
    input: {
      displayName,
      kind: "human",
      status: "active",
    },
  });
}

async function assignIdentityProgramRole(
  principalId: string,
  roleKey: "administrator" | "editor" | "member" = "administrator",
): Promise<StoredRecord> {
  const roleId = {
    administrator: "role_04144de6-7927-49f2-826a-cdcc70c47357",
    editor: "role_3e6f3057-22bf-4fb0-8bd5-7b61bb0f45c4",
    member: "role_de3ae092-31a9-49df-b7f6-9f51f9403ff9",
  }[roleKey];

  return await postIdentityRecordOperation({
    entity: "program-role-assignment",
    idempotencyKey: ["control-plane-assign", principalId.replace(/\W+/g, "-"), roleKey].join("-"),
    operationName: "create",
    input: {
      principal: principalId,
      roleId,
      status: "active",
    },
  });
}

async function postIdentityRecordOperation(
  input: Parameters<typeof recordOperationRequest>[0],
): Promise<StoredRecord> {
  const request = recordOperationRequest(input);
  const response = await harness.fetch(
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}${request.path.slice("/api".length)}`,
    {
      body: JSON.stringify(request.body),
      headers: {
        ...(await ownerSessionHeaders()),
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );

  expect(response.status).toBe(200);

  return request.response(await response.json()).record;
}

function cookiePair(cookie: string) {
  return cookie.split(";")[0] ?? cookie;
}

async function openProgramSyncSocket(headers: Record<string, string>) {
  const response = await harness.fetch(`${controlPlaneApi}/sync/ws`, {
    headers: { ...headers, Upgrade: "websocket" },
  });

  expect(response.status).toBe(101);
  expect(response.webSocket).toBeTruthy();

  const socket = response.webSocket;
  if (!socket) {
    throw new Error("Program WebSocket upgrade did not return a client socket.");
  }
  socket.accept();
  return socket;
}

function readProgramSyncSocketMessage(socket: Awaited<ReturnType<typeof openProgramSyncSocket>>) {
  return new Promise<SyncSocketServerMessage>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for Program sync message."));
    }, 1000);
    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("error", onError);
    };
    const onMessage = (event: WebSocketEventMap["message"]) => {
      cleanup();
      if (typeof event.data !== "string") {
        reject(new Error("Program sync message was not text."));
        return;
      }
      resolve(JSON.parse(event.data) as SyncSocketServerMessage);
    };
    const onError = () => {
      cleanup();
      reject(new Error("Program sync socket emitted an error."));
    };

    socket.addEventListener("message", onMessage);
    socket.addEventListener("error", onError);
  });
}

function expectProgramSyncSocketClosedWithoutMessage(
  socket: Awaited<ReturnType<typeof openProgramSyncSocket>>,
) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for Program sync socket to close."));
    }, 1000);
    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeEventListener("close", onClose);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("error", onError);
    };
    const onClose = () => {
      cleanup();
      resolve();
    };
    const onMessage = () => {
      cleanup();
      reject(new Error("Revoked Program sync socket received protected data."));
    };
    const onError = () => {
      cleanup();
      reject(new Error("Program sync socket errored before closing."));
    };

    socket.addEventListener("close", onClose);
    socket.addEventListener("message", onMessage);
    socket.addEventListener("error", onError);
  });
}

function appInstallValues(
  bootstrap: BootstrapResponse,
  installId: string,
): InstanceControlPlaneAppInstallValues | undefined {
  return bootstrap.records.find(
    (record) => record.id === installId && record.entity === "app-install",
  )?.values as InstanceControlPlaneAppInstallValues | undefined;
}

function routeValues(bootstrap: BootstrapResponse): InstanceControlPlaneRouteValues[] {
  return bootstrap.records
    .filter((record) => record.entity === "route")
    .map((record) => record.values as InstanceControlPlaneRouteValues);
}

function operationRecord(response: { body: OperationInvocationResponse }) {
  const output = response.body.output;

  if (output === undefined) {
    throw new Error(`Expected operation response, received ${JSON.stringify(response.body)}.`);
  }

  if (output.type !== "create" && output.type !== "update") {
    throw new Error(`Expected create or update operation output, received "${output.type}".`);
  }

  return output.record;
}

function operationCommandResponse(response: {
  body: OperationInvocationResponse;
}): OperationCommandOutput {
  const output = response.body.output;

  if (output.type !== "command") {
    throw new Error(`Expected command operation output, received "${output.type}".`);
  }

  return output;
}

function secretSnapshot(now: string): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
    schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
    exportedAt: now,
    schemaUpdatedAt: now,
    sourceCursor: 0,
    schema: formlessProgramSchema,
    records: [
      {
        id: "secret",
        entity: "app-install",
        createdAt: now,
        updatedAt: now,
        values: {
          installId: "secret",
          packageAppKey: "test-crm",
          label: "CF_API_TOKEN=hidden",
          registrationPolicy: "closed",
          status: "installed",
          storageIdentity: "app:secret",
        },
      },
    ],
  };
}

function privatePublicSitePackageManifest(sourceSchemaHash: SourceSchemaHash): AppPackageManifest {
  return {
    kind: appPackageManifestKind,
    version: appPackageManifestVersion,
    packageAppKey: "private-site",
    label: "Private Site",
    description: "Private workspace Site package.",
    defaultInstallId: "private-site",
    supportsMultipleInstalls: true,
    packageRevision: 7,
    sourceSchema: {
      kind: "workspace",
      key: "private-site",
      path: "packages/private-site/schema.json",
    },
    sourceSchemaHash,
    capabilities: [
      { kind: "generatedAdmin", routeBase: "/apps" },
      { kind: "publicSite", routeBase: "/sites" },
    ],
  };
}
