import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  AppInstallsResponse,
  BootstrapResponse,
  CreateAppInstallResponse,
  OwnerIdentity,
} from "../shared/protocol.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import type { SitePageTreeResponse } from "@dpeek/formless-site-app";
import { parseAppSchema } from "@dpeek/formless-schema";
import {
  INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX,
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
} from "@dpeek/formless-instance-control-plane";
import { IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX } from "@dpeek/formless-identity-control-plane";
import type { StoredRecord } from "@dpeek/formless-storage";
import { crmSourceSchema, siteSourceSchema, taskSourceSchema } from "../test/schema-apps.ts";
import {
  instanceControlPlaneTestStorageSnapshot,
  operationWriteRequest,
  recordOperationRequest,
  restoreTestStorageSnapshot,
  schemaAppTestStorageSnapshot,
} from "../test/authority-write.ts";
import { ensureTestIdentityOwner, resetTestIdentityStorage } from "../test/identity-owner.ts";
import {
  bundledSourceSchemaHashFixtures,
  computeSourceSchemaHash,
} from "../shared/upgrade-migrations.ts";
import {
  FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME,
  formatRuntimeWorkspaceAppPackages,
} from "../shared/workspace-runtime-packages.ts";
import {
  workspaceAppPackageManifestFixture,
  writeWorkspaceAppPackageFixture,
} from "../test/workspace-app-package.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { INTERNAL_READ_OPERATION_INVOCATIONS_PATH } from "./instance-control-plane.ts";
import { createOwnerSessionCookie } from "./owner-session.ts";
import type { StoredOperationInvocation } from "./storage.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

type AppInstallFailureResponse = {
  code: string;
  error: string;
  field?: string;
};

type PackageMigrationApplyResponse = {
  applied: unknown[];
  changes: unknown[];
  cursor: number;
  install: CreateAppInstallResponse["install"];
  installs: CreateAppInstallResponse["installs"];
  packageAppKey: string;
  packageRevision: number;
  skipped: unknown[];
  sourceSchemaHash: string;
};

const adminToken = "test-admin-token";
const owner: OwnerIdentity = {
  id: "owner-1",
  name: "Ada Owner",
  email: "ada@example.com",
  createdAt: "2026-06-09T00:00:00.000Z",
};
const tempDirs: string[] = [];

let harness: Harness;

beforeAll(async () => {
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: { FORMLESS_ADMIN_TOKEN: adminToken },
    },
  );
});

beforeEach(async () => {
  await resetWorkerState();
});

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

afterAll(async () => {
  await harness.dispose();
});

describe("instance app install API routes", () => {
  it("lists bundled packages and persists Site installs", async () => {
    const before = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const created = await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "site",
      label: "Site",
    });
    const after = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const invocations = await readControlPlaneOperationInvocations();
    const output = invocations[0]?.output;

    expect(before.body.packages).toEqual([
      expect.objectContaining({
        defaultInstallId: "site",
        label: "Site",
        packageAppKey: "site",
        packageRevision: 1,
        sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
      }),
      expect.objectContaining({
        defaultInstallId: "tasks",
        label: "Tasks",
        packageAppKey: "tasks",
        packageRevision: 1,
        sourceSchemaHash: bundledSourceSchemaHashFixtures.tasks,
      }),
      expect.objectContaining({
        defaultInstallId: "crm",
        label: "CRM",
        packageAppKey: "crm",
        packageRevision: 1,
        sourceSchemaHash: bundledSourceSchemaHashFixtures.crm,
        sourceSchemaLocation: {
          kind: "bundled",
          key: "crm",
          path: "schema.json",
        },
      }),
    ]);
    expect(before.body.installs).toEqual([]);
    expect(before.response.headers.get("Cache-Control")).toBe("no-store");
    expect(created.response.status).toBe(201);
    expect(created.response.headers.get("Cache-Control")).toBe("no-store");
    expect(created.body.initialization).toEqual({
      installId: "site",
      packageAppKey: "site",
      sourceSchemaKey: "site",
    });
    expect(created.body.install).toMatchObject({
      adminRoute: "/apps/site",
      installId: "site",
      label: "Site",
      packageAppKey: "site",
      packageRevision: 1,
      publicRoute: "/sites/site",
      registrationPolicy: "closed",
      sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
      status: "installed",
    });
    expect(after.body.installs).toEqual(created.body.installs);
    expect(invocations).toHaveLength(1);
    expect(invocations[0]).toMatchObject({
      operationKey: "app-install.createAppInstall",
      status: "committed",
      affectedChangeIds: ["1", "2", "3"],
    });
    expect(invocations[0]?.statusHistory.map((entry) => entry.status)).toEqual([
      "accepted",
      "committed",
    ]);
    expect(output).toMatchObject({
      type: "command",
      affectedChangeIds: ["1", "2", "3"],
      cursor: 3,
    });
    expect(output).not.toHaveProperty("actionId");
    expect(output).not.toHaveProperty("response");
  });

  it("lists and creates linked workspace app packages from the active resolver", async () => {
    const sourceSchemaHash = await computeSourceSchemaHash(taskSourceSchema);
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
              manifest: workspaceAppPackageManifestFixture({
                capabilities: [
                  { kind: "generatedAdmin", routeBase: "/apps" },
                  { kind: "publicSite", routeBase: "/sites" },
                ],
                sourceSchemaHash,
              }),
              sourceSchema: taskSourceSchema,
            },
          ]),
        },
      },
    );

    try {
      const before = await getHarnessJson<AppInstallsResponse>(
        privateHarness,
        "/api/formless/app-installs",
      );
      const created = await postHarnessAdminJson<CreateAppInstallResponse>(
        privateHarness,
        "/api/formless/app-installs",
        {
          packageAppKey: "private-labs",
          installId: "labs",
          label: "Private Labs",
        },
      );
      const bootstrap = await getHarnessJson<BootstrapResponse>(
        privateHarness,
        "/api/app-installs/private-labs/labs/bootstrap",
      );
      const controlPlane = await getHarnessJson<BootstrapResponse>(
        privateHarness,
        "/api/formless/control-plane/bootstrap",
      );
      const appInstall = controlPlane.body.records.find(
        (record) => record.entity === "app-install" && record.id === "labs",
      );
      const routes = controlPlane.body.records.filter((record) => record.entity === "route");
      const controlPlaneJson = JSON.stringify(controlPlane.body.records);

      expect(before.body.packages.map((appPackage) => appPackage.packageAppKey)).toContain(
        "private-labs",
      );
      expect(
        before.body.packages.find((appPackage) => appPackage.packageAppKey === "private-labs"),
      ).toMatchObject({
        defaultInstallId: "labs",
        packageRevision: 7,
        publicRouteBase: "/sites",
        sourceOrigin: "workspace",
        sourceSchemaHash,
        sourceSchemaKey: "private-labs",
      });
      expect(created.response.status).toBe(201);
      expect(created.body.initialization).toEqual({
        installId: "labs",
        packageAppKey: "private-labs",
        sourceSchemaKey: "private-labs",
      });
      expect(created.body.install).toEqual(
        expect.objectContaining({
          adminRoute: "/apps/labs",
          installId: "labs",
          label: "Private Labs",
          packageAppKey: "private-labs",
          packageRevision: 7,
          publicRoute: "/sites/labs",
          publicRoutePrefix: "/sites/labs/",
          sourceSchemaHash,
          status: "installed",
        }),
      );
      expect(bootstrap.body.schema).toEqual(taskSourceSchema);
      expect(bootstrap.body.records).toEqual([]);
      expect(bootstrap.body.cursor).toBe(0);
      expect(appInstall?.values).toMatchObject({
        installId: "labs",
        packageAppKey: "private-labs",
        registrationPolicy: "closed",
        sourceSchemaHash,
      });
      expect(
        routes
          .map((record) => record.values.matchPath)
          .sort((left, right) => String(left).localeCompare(String(right))),
      ).toEqual(["/apps/labs", "/sites/labs"]);
      expect(
        routes
          .map((record) => [
            record.id,
            record.values.targetProfile,
            record.values.surface,
            record.values.access,
            record.values.requiredRole,
          ])
          .sort(([left], [right]) => String(left).localeCompare(String(right))),
      ).toEqual([
        ["route:labs:admin", "app", "admin", "authenticated", "app.admin"],
        ["route:labs:public-site", "public-site", "public-site", "anonymous", undefined],
      ]);
      expect(controlPlaneJson).not.toContain("formless.app.json");
      expect(controlPlaneJson).not.toContain("../app");
    } finally {
      await privateHarness.dispose();
    }
  });

  it("accepts email-verified app install policy as flat install metadata", async () => {
    const created = await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "members",
      label: "Members",
      registrationPolicy: "email-verified",
    });
    const after = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const controlPlane = await getJson<BootstrapResponse>("/api/formless/control-plane/bootstrap");
    const appInstall = controlPlane.body.records.find(
      (record) => record.entity === "app-install" && record.id === "members",
    );

    if (!appInstall) {
      throw new Error("Expected members app-install record.");
    }

    expect(created.response.status).toBe(201);
    expect(created.body.install).toMatchObject({
      installId: "members",
      label: "Members",
      registrationPolicy: "email-verified",
    });
    expect(after.body.installs.find((install) => install.installId === "members")).toMatchObject({
      installId: "members",
      registrationPolicy: "email-verified",
    });
    expect(appInstall.values.registrationPolicy).toBe("email-verified");
    expect(Object.keys(appInstall.values).sort()).toEqual([
      "installId",
      "label",
      "packageAppKey",
      "packageRevision",
      "registrationPolicy",
      "sourceSchemaHash",
      "status",
      "storageIdentity",
    ]);

    for (const key of [
      "appRegistration",
      "appRegistrationId",
      "challenge",
      "credential",
      "handoff",
      "principal",
      "principalId",
      "profile",
      "role",
      "roleAssignment",
      "session",
    ]) {
      expect(appInstall.values).not.toHaveProperty(key);
    }
  });

  it("accepts custom-operation app install metadata as a flat operation reference", async () => {
    const created = await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "members",
      label: "Members",
      registrationOperation: "profile.register",
      registrationPolicy: "custom-operation",
    });
    const after = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const controlPlane = await getJson<BootstrapResponse>("/api/formless/control-plane/bootstrap");
    const appInstall = controlPlane.body.records.find(
      (record) => record.entity === "app-install" && record.id === "members",
    );

    expect(created.response.status).toBe(201);
    expect(created.body.install).toMatchObject({
      installId: "members",
      label: "Members",
      registrationOperation: "profile.register",
      registrationPolicy: "custom-operation",
    });
    expect(after.body.installs.find((install) => install.installId === "members")).toMatchObject({
      installId: "members",
      registrationOperation: "profile.register",
      registrationPolicy: "custom-operation",
    });
    expect(appInstall?.values).toMatchObject({
      registrationOperation: "profile.register",
      registrationPolicy: "custom-operation",
    });
    expect(Object.keys(appInstall?.values ?? {}).sort()).toEqual([
      "installId",
      "label",
      "packageAppKey",
      "packageRevision",
      "registrationOperation",
      "registrationPolicy",
      "sourceSchemaHash",
      "status",
      "storageIdentity",
    ]);
  });

  it("rejects missing or extra custom registration operation metadata", async () => {
    const missing = await postAdminJson<AppInstallFailureResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "members",
      label: "Members",
      registrationPolicy: "custom-operation",
    });
    const extra = await postAdminJson<AppInstallFailureResponse>("/api/formless/app-installs", {
      packageAppKey: "tasks",
      installId: "tasks",
      label: "Tasks",
      registrationOperation: "profile.register",
      registrationPolicy: "email-verified",
    });
    const after = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    expect(missing.response.status).toBe(400);
    expect(missing.body).toMatchObject({
      code: "invalid-registration-operation",
      field: "registrationOperation",
    });
    expect(missing.body.error).toContain('required when registration policy is "custom-operation"');
    expect(extra.response.status).toBe(400);
    expect(extra.body).toMatchObject({
      code: "invalid-registration-operation",
      field: "registrationOperation",
    });
    expect(extra.body.error).toContain(
      'must be omitted unless registration policy is "custom-operation"',
    );
    expect(after.body.installs).toEqual([]);
  });

  it("derives app install API responses from control-plane install and route records", async () => {
    await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "personal",
      label: "Personal Site",
    });
    const controlPlane = await getJson<BootstrapResponse>("/api/formless/control-plane/bootstrap");
    const patchedRoute = await postAdminJson<OperationInvocationResponse>(
      "/api/formless/control-plane/operations/route/update",
      {
        idempotencyKey: "personal-admin-route",
        recordId: "route:personal:admin",
        input: {
          matchPath: "/apps/personal-admin",
          matchPrefix: "/apps/personal-admin/",
        },
      },
    );
    const after = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    expect(controlPlane.body.records.map((record) => `${record.entity}:${record.id}`)).toEqual([
      "app-install:personal",
      "route:route:personal:admin",
      "route:route:personal:public-site",
    ]);
    expect(patchedRoute.response.status).toBe(200);
    expect(after.body.installs[0]).toEqual(
      expect.objectContaining({
        adminRoute: "/apps/personal-admin",
        installId: "personal",
        publicRoute: "/sites/personal",
        publicRoutePrefix: "/sites/personal/",
      }),
    );
    expect(after.body.installs[0]?.routes?.map((route) => [route.routeKind, route.path])).toEqual([
      ["admin", "/apps/personal-admin"],
      ["publicSite", "/sites/personal"],
    ]);
    expect(
      after.body.installs[0]?.routes?.map((route) => [
        route.routeKind,
        route.access,
        route.requiredRole,
      ]),
    ).toEqual([
      ["admin", "authenticated", "app.admin"],
      ["publicSite", "anonymous", undefined],
    ]);
    expect(after.body.installs[0]?.launchLinks).toEqual([
      {
        access: "authenticated",
        href: "/apps/personal-admin",
        installId: "personal",
        label: "Personal Site",
        packageAppKey: "site",
        requiredRole: "app.admin",
        routeId: "route:personal:admin",
        routeKind: "admin",
      },
      {
        access: "anonymous",
        href: "/sites/personal",
        installId: "personal",
        label: "Personal Site",
        packageAppKey: "site",
        routeId: "route:personal:public-site",
        routeKind: "publicSite",
      },
    ]);
    expect(after.body.launchLinks).toEqual(after.body.installs[0]?.launchLinks);
  });

  it("rejects app installs whose generated route records conflict before recording the install", async () => {
    const conflictingRoute = await postAdminJson<OperationInvocationResponse>(
      "/api/formless/control-plane/operations/route/create",
      {
        idempotencyKey: "reserve-personal-admin-route",
        input: {
          enabled: true,
          matchPath: "/apps/personal",
          kind: "mount",
          targetProfile: "instance",
          surface: "admin",
        },
      },
    );
    const rejected = await postAdminJson<AppInstallFailureResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "personal",
      label: "Personal Site",
    });
    const after = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    expect(conflictingRoute.response.status).toBe(200);
    expect(rejected.response.status).toBe(400);
    expect(rejected.body.error).toContain(
      'Enabled route match "<hostless>/apps/personal /apps/personal/" conflicts with enabled route',
    );
    expect(after.body.installs).toEqual([]);
  });

  it("keeps installed app storage identity based on install id after route path edits", async () => {
    await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "personal",
      label: "Personal Site",
    });
    const routeEdit = await postAdminJson<OperationInvocationResponse>(
      "/api/formless/control-plane/operations/route/update",
      {
        idempotencyKey: "personal-admin-storage-identity-route",
        recordId: "route:personal:admin",
        input: {
          matchPath: "/apps/personal-admin",
          matchPrefix: "/apps/personal-admin/",
        },
      },
    );
    const controlPlane = await getJson<BootstrapResponse>("/api/formless/control-plane/bootstrap");
    const installs = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const bootstrap = await getJson<BootstrapResponse>("/api/app-installs/site/personal/bootstrap");

    expect(routeEdit.response.status).toBe(200);
    expect(
      controlPlane.body.records.find(
        (record) => record.entity === "app-install" && record.id === "personal",
      )?.values.storageIdentity,
    ).toBe("app:personal");
    expect(installs.body.installs[0]).toMatchObject({
      adminRoute: "/apps/personal-admin",
      installId: "personal",
    });
    expect(bootstrap.body.schema).toEqual(siteSourceSchema);
  });

  it("persists Tasks installs and bootstraps empty storage from the bundled schema", async () => {
    const created = await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "tasks",
      installId: "empty-tasks",
      label: "Tasks",
    });
    const bootstrap = await getJson<BootstrapResponse>(
      "/api/app-installs/tasks/empty-tasks/bootstrap",
    );

    expect(created.response.status).toBe(201);
    expect(created.body.initialization).toEqual({
      installId: "empty-tasks",
      packageAppKey: "tasks",
      sourceSchemaKey: "tasks",
    });
    expect(created.body.install).toEqual(
      expect.objectContaining({
        adminRoute: "/apps/empty-tasks",
        installId: "empty-tasks",
        label: "Tasks",
        packageAppKey: "tasks",
        packageRevision: 1,
        sourceSchemaHash: bundledSourceSchemaHashFixtures.tasks,
        status: "installed",
      }),
    );
    expect(created.body.install).not.toHaveProperty("publicRoute");
    expect(created.body.install).not.toHaveProperty("publicRoutePrefix");
    expect(bootstrap.body.schema).toEqual(taskSourceSchema);
    expect(bootstrap.body.records).toEqual([]);
    expect(bootstrap.body.cursor).toBe(0);
  });

  it("applies installed app package migrations through Authority and updates install facts", async () => {
    await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "tasks",
      installId: "migration-tasks",
      label: "Tasks",
    });

    const applied = await postAdminJson<PackageMigrationApplyResponse>(
      "/api/formless/app-installs/tasks/migration-tasks/package-migrations/apply",
      {},
    );
    const after = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    expect(applied.response.status).toBe(200);
    expect(applied.body).toMatchObject({
      applied: [],
      changes: [],
      packageAppKey: "tasks",
      packageRevision: 1,
      skipped: [],
      sourceSchemaHash: bundledSourceSchemaHashFixtures.tasks,
    });
    expect(applied.body.cursor).toBe(0);
    expect(applied.body.install).toEqual(
      expect.objectContaining({
        installId: "migration-tasks",
        packageAppKey: "tasks",
        packageRevision: 1,
        sourceSchemaHash: bundledSourceSchemaHashFixtures.tasks,
      }),
    );
    expect(after.body.installs).toEqual(applied.body.installs);
  });

  it("persists CRM installs and bootstraps empty storage from the bundled schema", async () => {
    const created = await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "crm",
      installId: "empty-crm",
      label: "CRM",
    });
    const bootstrap = await getJson<BootstrapResponse>("/api/app-installs/crm/empty-crm/bootstrap");

    expect(created.response.status).toBe(201);
    expect(created.body.initialization).toEqual({
      installId: "empty-crm",
      packageAppKey: "crm",
      sourceSchemaKey: "crm",
    });
    expect(created.body.install).toEqual(
      expect.objectContaining({
        adminRoute: "/apps/empty-crm",
        installId: "empty-crm",
        label: "CRM",
        packageAppKey: "crm",
        packageRevision: 1,
        sourceSchemaHash: bundledSourceSchemaHashFixtures.crm,
        status: "installed",
      }),
    );
    expect(created.body.install).not.toHaveProperty("publicRoute");
    expect(created.body.install).not.toHaveProperty("publicRoutePrefix");
    expect(bootstrap.body.schema).toEqual(crmSourceSchema);
    expect(bootstrap.body.records).toEqual([]);
    expect(bootstrap.body.cursor).toBe(0);
  });

  it("persists generated-admin-only installs and bootstraps from a workspace package", async () => {
    const packageRoot = path.join(await makeTempDir(), "client-orders");
    const workspacePackage = await writeWorkspaceAppPackageFixture(packageRoot, {
      defaultInstallId: "orders",
      label: "Client Orders",
      packageAppKey: "client-orders",
      packageRevision: 3,
    });
    const privateHarness = await createWorkerHarness(
      "src/worker/index.ts",
      {
        FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
      },
      {
        bindings: {
          FORMLESS_ADMIN_TOKEN: adminToken,
          [FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME]: formatRuntimeWorkspaceAppPackages([
            workspacePackage,
          ]),
        },
      },
    );

    try {
      const before = await getHarnessJson<AppInstallsResponse>(
        privateHarness,
        "/api/formless/app-installs",
      );
      const created = await postHarnessAdminJson<CreateAppInstallResponse>(
        privateHarness,
        "/api/formless/app-installs",
        {
          packageAppKey: "client-orders",
          installId: "orders",
          label: "Client Orders",
        },
      );
      const controlPlane = await getHarnessJson<BootstrapResponse>(
        privateHarness,
        "/api/formless/control-plane/bootstrap",
      );
      const bootstrap = await getHarnessJson<BootstrapResponse>(
        privateHarness,
        "/api/app-installs/client-orders/orders/bootstrap",
      );

      expect(before.body.packages.map((appPackage) => appPackage.packageAppKey)).toContain(
        "client-orders",
      );
      expect(created.response.status).toBe(201);
      expect(created.body.initialization).toEqual({
        installId: "orders",
        packageAppKey: "client-orders",
        sourceSchemaKey: "client-orders",
      });
      expect(created.body.install).toEqual(
        expect.objectContaining({
          adminRoute: "/apps/orders",
          installId: "orders",
          label: "Client Orders",
          packageAppKey: "client-orders",
          packageRevision: 3,
          sourceSchemaHash: workspacePackage.manifest.sourceSchemaHash,
          status: "installed",
        }),
      );
      expect(created.body.install).not.toHaveProperty("publicRoute");
      expect(created.body.install).not.toHaveProperty("publicRoutePrefix");
      expect(
        controlPlane.body.records
          .filter((record) => record.entity === "route")
          .map((record) => [
            record.values.appInstall,
            record.values.matchPath,
            record.values.surface,
          ])
          .sort((left, right) => String(left[1]).localeCompare(String(right[1]))),
      ).toEqual([["orders", "/apps/orders", "admin"]]);
      expect(bootstrap.body.schema).toEqual(parseAppSchema(workspacePackage.sourceSchema));
      expect(bootstrap.body.records).toEqual([]);
      expect(bootstrap.body.cursor).toBe(0);
    } finally {
      await privateHarness.dispose();
    }
  });

  it("rejects duplicate and invalid installs without mutating existing installs", async () => {
    await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "personal",
      label: "Personal Site",
    });

    const duplicate = await postAdminJson<AppInstallFailureResponse>("/api/formless/app-installs", {
      packageAppKey: "tasks",
      installId: "personal",
      label: "Personal Tasks",
    });
    const invalid = await postAdminJson<AppInstallFailureResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "Site",
      label: "Bad Site",
    });
    const unsupported = await postAdminJson<AppInstallFailureResponse>(
      "/api/formless/app-installs",
      {
        packageAppKey: "missing",
        installId: "missing",
        label: "Missing",
      },
    );
    const after = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    expect(duplicate.response.status).toBe(409);
    expect(duplicate.body).toMatchObject({
      code: "duplicate-install-id",
      field: "installId",
    });
    expect(invalid.response.status).toBe(400);
    expect(invalid.body).toMatchObject({
      code: "invalid-install-id",
      field: "installId",
    });
    expect(unsupported.response.status).toBe(400);
    expect(unsupported.body).toMatchObject({
      code: "unsupported-package",
      field: "packageAppKey",
    });
    expect(after.body.installs.map((install) => install.installId)).toEqual(["personal"]);
  });

  it("requires operational management authorization for install creation when configured", async () => {
    const rejected = await harness.fetch("/api/formless/app-installs", {
      body: JSON.stringify({
        packageAppKey: "site",
        installId: "personal",
        label: "Personal Site",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const accepted = await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "personal",
      label: "Personal Site",
    });

    expect(rejected.status).toBe(401);
    expect(rejected.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
    expect(await rejected.json()).toEqual({
      error:
        "Owner session, instance-admin session, or admin authorization is required for this write endpoint.",
    });
    expect(accepted.response.status).toBe(201);
  });

  it("projects app install registry metadata through current management and app authority", async () => {
    await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "personal",
      label: "Personal Site",
    });
    await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "tasks",
      installId: "work",
      label: "Work Tasks",
    });
    const instanceAdmin = await createIdentityPrincipal("Registry Instance Admin");
    await assignIdentityRole(instanceAdmin.id, "instance.admin");
    const personalAdmin = await createIdentityPrincipal("Registry Personal App Admin");
    await assignIdentityRole(personalAdmin.id, "app.admin", "personal");
    const workAdmin = await createIdentityPrincipal("Registry Work App Admin");
    await assignIdentityRole(workAdmin.id, "app.admin", "work");
    const ordinary = await createIdentityPrincipal("Registry Ordinary Principal");
    const anonymous = await harness.fetch("/api/formless/app-installs");
    const admin = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const ownerRead = await getOwnerJson<AppInstallsResponse>("/api/formless/app-installs");
    const instanceAdminRead = await getRegistryForPrincipal(instanceAdmin.id);
    const personalAdminRead = await getRegistryForPrincipal(personalAdmin.id);
    const workAdminRead = await getRegistryForPrincipal(workAdmin.id);
    const ordinaryRead = await getRegistryForPrincipal(ordinary.id);

    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
    expect(await anonymous.json()).toEqual({
      error:
        "Owner session, instance-admin session, or admin authorization is required for this read endpoint.",
    });
    expect(admin.body.installs.map((install) => install.installId)).toEqual(["personal", "work"]);
    expect(ownerRead.body).toEqual(admin.body);
    expect(instanceAdminRead).toEqual(admin.body);
    expect(personalAdminRead.installs.map((install) => install.installId)).toEqual(["personal"]);
    expect(personalAdminRead.packages.map((appPackage) => appPackage.packageAppKey)).toEqual([
      "site",
    ]);
    expect(personalAdminRead.installs[0]?.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requiredRole: "app.admin",
          routeKind: "admin",
        }),
        expect.objectContaining({
          access: "anonymous",
          routeKind: "publicSite",
        }),
      ]),
    );
    expect(personalAdminRead.launchLinks?.every((link) => link.installId === "personal")).toBe(
      true,
    );
    expect(workAdminRead.installs.map((install) => install.installId)).toEqual(["work"]);
    expect(workAdminRead.packages.map((appPackage) => appPackage.packageAppKey)).toEqual(["tasks"]);
    expect(ordinaryRead).toEqual({ installs: [], launchLinks: [], packages: [] });
  });

  it("guards installed app management reads while keeping public Site tree reads anonymous", async () => {
    await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "personal",
      label: "Personal Site",
    });

    const anonymousBootstrap = await harness.fetch("/api/app-installs/site/personal/bootstrap");
    const anonymousTree = await harness.fetch("/api/app-installs/site/personal/tree/home");
    const adminBootstrap = await getJson<BootstrapResponse>(
      "/api/app-installs/site/personal/bootstrap",
    );
    const ownerBootstrap = await getOwnerJson<BootstrapResponse>(
      "/api/app-installs/site/personal/bootstrap",
    );
    const tree = (await anonymousTree.json()) as SitePageTreeResponse;

    expect(anonymousBootstrap.status).toBe(401);
    expect(await anonymousBootstrap.json()).toEqual({
      error: "Owner session or admin authorization is required for this read endpoint.",
    });
    expect(anonymousTree.status).toBe(200);
    expect(tree.page.id).toBe("rec_site_content_home");
    expect(adminBootstrap.body.schema).toEqual(siteSourceSchema);
    expect(ownerBootstrap.body.schema).toEqual(siteSourceSchema);
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

async function getRegistryForPrincipal(principalId: string) {
  const response = await harness.fetch("/api/formless/app-installs", {
    headers: await principalSessionHeaders(principalId),
  });

  expect(response.status).toBe(200);

  return (await response.json()) as AppInstallsResponse;
}

async function postAdminJson<T>(path: string, body: unknown) {
  const request = operationWriteRequest(path, body);
  const response = await harness.fetch(request.path, {
    body: JSON.stringify(request.body),
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });

  return {
    body: request.response(await response.json()) as T,
    response,
  };
}

async function getHarnessJson<T>(targetHarness: Harness, path: string) {
  const response = await targetHarness.fetch(path, { headers: adminHeaders() });

  expect(response.status).toBe(200);

  return {
    body: (await response.json()) as T,
    response,
  };
}

async function postHarnessAdminJson<T>(targetHarness: Harness, path: string, body: unknown) {
  const request = operationWriteRequest(path, body);
  const response = await targetHarness.fetch(request.path, {
    body: JSON.stringify(request.body),
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });

  return {
    body: request.response(await response.json()) as T,
    response,
  };
}

async function resetWorkerState() {
  await resetTestIdentityStorage(harness, adminToken);
  await Promise.all([
    restoreTestStorageSnapshot(
      harness,
      "/api/formless/control-plane/snapshot/restore",
      instanceControlPlaneTestStorageSnapshot(),
      adminHeaders(),
    ),
    restoreTestStorageSnapshot(
      harness,
      "/api/app-installs/site/site/snapshot/restore",
      schemaAppTestStorageSnapshot("site", "app:site"),
      adminHeaders(),
    ),
    restoreTestStorageSnapshot(
      harness,
      "/api/app-installs/site/personal/snapshot/restore",
      schemaAppTestStorageSnapshot("site", "app:personal"),
      adminHeaders(),
    ),
    restoreTestStorageSnapshot(
      harness,
      "/api/app-installs/tasks/tasks/snapshot/restore",
      schemaAppTestStorageSnapshot("tasks", "app:tasks"),
      adminHeaders(),
    ),
    restoreTestStorageSnapshot(
      harness,
      "/api/app-installs/crm/crm/snapshot/restore",
      schemaAppTestStorageSnapshot("crm", "app:crm"),
      adminHeaders(),
    ),
  ]);
}

async function readControlPlaneOperationInvocations(): Promise<StoredOperationInvocation[]> {
  const response = await harness.durableObjectFetch(
    "FORMLESS_AUTHORITY",
    INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
    `${INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX}${INTERNAL_READ_OPERATION_INVOCATIONS_PATH}`,
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

async function ownerSessionHeaders() {
  const identityOwner = await ensureTestIdentityOwner(harness, adminToken, owner);
  const created = await createOwnerSessionCookie({
    env: { FORMLESS_ADMIN_TOKEN: adminToken },
    maxAgeSeconds: 60,
    now: "2999-01-01T00:00:00.000Z",
    owner: identityOwner,
    request: new Request("http://example.com/apps"),
  });

  return {
    Cookie: cookiePair(created.cookie),
  };
}

async function principalSessionHeaders(principalId: string) {
  const created = await createOwnerSessionCookie({
    env: { FORMLESS_ADMIN_TOKEN: adminToken },
    maxAgeSeconds: 60,
    now: "2999-01-01T00:00:00.000Z",
    owner: {
      createdAt: "2999-01-01T00:00:00.000Z",
      id: principalId,
      name: "Session Principal",
    },
    request: new Request("http://example.com/apps"),
  });

  return { Cookie: cookiePair(created.cookie) };
}

async function createIdentityPrincipal(displayName: string): Promise<StoredRecord> {
  return await postIdentityRecordOperation({
    entity: "principal",
    idempotencyKey: `registry-create-${displayName.toLowerCase().replace(/\W+/g, "-")}`,
    operationName: "create",
    input: {
      displayName,
      kind: "human",
      status: "active",
    },
  });
}

async function assignIdentityRole(
  principalId: string,
  roleKey: "app.admin" | "instance.admin",
  appInstallId?: string,
): Promise<StoredRecord> {
  return await postIdentityRecordOperation({
    entity: "role-assignment",
    idempotencyKey: [
      "registry-assign",
      principalId.replace(/\W+/g, "-"),
      roleKey.replace(/\./g, "-"),
      appInstallId ?? "instance",
    ].join("-"),
    operationName: "create",
    input: {
      ...(appInstallId === undefined ? {} : { appInstallId }),
      role: `role:${roleKey}`,
      scopeKind: appInstallId === undefined ? "instance" : "app-install",
      status: "active",
      targetKind: "principal",
      targetPrincipal: principalId,
    },
  });
}

async function postIdentityRecordOperation(
  input: Parameters<typeof recordOperationRequest>[0],
): Promise<StoredRecord> {
  const request = recordOperationRequest(input);
  const response = await harness.fetch(
    `${IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX}${request.path.slice("/api".length)}`,
    {
      body: JSON.stringify(request.body),
      headers: adminHeaders({ "Content-Type": "application/json" }),
      method: "POST",
    },
  );

  expect(response.status).toBe(200);

  return request.response(await response.json()).record;
}

function cookiePair(cookie: string) {
  return cookie.split(";")[0] ?? cookie;
}

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "instance-app-installs-test-"));

  tempDirs.push(tempDir);

  return tempDir;
}
