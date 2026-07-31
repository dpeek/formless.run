import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import type { CreateAppInstallResponse } from "../shared/protocol.ts";
import {
  INSTANCE_UPGRADE_APPLY_API_PATH,
  APP_STORAGE_UPGRADE_STATUS_API_PATH_SUFFIX,
  INSTANCE_UPGRADE_STATUS_API_PATH,
  type InstanceUpgradeStatusResponse,
} from "../shared/upgrade-status.ts";
import { bundledSourceSchemaHashFixtures } from "../shared/upgrade-migrations.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";

let harness: Harness;

beforeEach(async () => {
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

afterEach(async () => {
  await harness.dispose();
});

describe("runtime upgrade status API", () => {
  it("requires instance write authorization for status reads", async () => {
    const instanceStatus = await harness.fetch(INSTANCE_UPGRADE_STATUS_API_PATH);
    const appStatus = await harness.fetch(
      `/api/app-installs/test-crm/work${APP_STORAGE_UPGRADE_STATUS_API_PATH_SUFFIX}`,
    );

    expect(instanceStatus.status).toBe(401);
    expect(instanceStatus.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
    expect(await instanceStatus.json()).toEqual({
      error: "Owner session or admin authorization is required for this write endpoint.",
    });
    expect(appStatus.status).toBe(401);
    expect(appStatus.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
  });

  it("reports SQL and package app migration evidence scoped by storage identity", async () => {
    await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      installId: "work",
      label: "Work",
      packageAppKey: "test-crm",
    });
    await postAdminJson("/api/formless/app-installs/test-crm/work/package-migrations/apply", {});

    const status = await getAdminJson<InstanceUpgradeStatusResponse>(
      INSTANCE_UPGRADE_STATUS_API_PATH,
    );
    const instance = status.body.storageIdentities.find(
      (storage) => storage.identity.kind === "instance",
    );
    const work = status.body.storageIdentities.find(
      (storage) => storage.identity.kind === "appInstall" && storage.identity.installId === "work",
    );

    expect(status.response.headers.get("Cache-Control")).toBe("no-store");
    expect(status.body.storageIdentities).toHaveLength(2);
    expect(instance).toEqual(
      expect.objectContaining({
        identity: {
          authorityName: "__formless_instance__",
          kind: "instance",
        },
      }),
    );
    expect(instance?.sqlMigrations).not.toContainEqual(
      expect.objectContaining({
        migrationId: "2026-05-28-instance-app-installs-package-facts",
        storageFamily: "instance-app-installs",
      }),
    );
    expect(work).toEqual(
      expect.objectContaining({
        identity: expect.objectContaining({
          authorityName: "app:work",
          installId: "work",
          kind: "appInstall",
          packageAppKey: "test-crm",
        }),
        packageAppMigrations: {
          applied: [],
          state: expect.objectContaining({
            packageAppKey: "test-crm",
            packageRevision: 1,
            sourceSchemaHash: bundledSourceSchemaHashFixtures.crm,
          }),
        },
      }),
    );
    expect(
      status.body.storageIdentities.some(
        (storage) =>
          storage.identity.kind === "appInstall" && storage.identity.installId === "rates",
      ),
    ).toBe(false);
  });

  it("applies auto-safe SQL migration evidence through the secured runtime API", async () => {
    await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      installId: "work",
      label: "Work",
      packageAppKey: "test-crm",
    });

    const apply = await postAdminJson<InstanceUpgradeStatusResponse>(
      INSTANCE_UPGRADE_APPLY_API_PATH,
      { safety: "auto-safe" },
    );
    const instance = apply.body.storageIdentities.find(
      (storage) => storage.identity.kind === "instance",
    );

    expect(apply.response.headers.get("Cache-Control")).toBe("no-store");
    expect(instance?.sqlMigrations).not.toContainEqual(
      expect.objectContaining({
        migrationId: "2026-05-28-instance-app-installs-package-facts",
        storageFamily: "instance-app-installs",
      }),
    );
  });

  it("keeps status evidence out of public app and browser write routes", async () => {
    await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      installId: "crm",
      label: "CRM",
      packageAppKey: "test-crm",
    });

    const appStatusWrite = await harness.fetch(
      `/api/app-installs/test-crm/crm${APP_STORAGE_UPGRADE_STATUS_API_PATH_SUFFIX}`,
      {
        headers: adminHeaders(),
        method: "POST",
      },
    );
    const publicRoute = await harness.fetch(
      `/api/app-installs/test-crm/crm/public${APP_STORAGE_UPGRADE_STATUS_API_PATH_SUFFIX}`,
      {
        headers: adminHeaders(),
      },
    );

    expect(appStatusWrite.status).toBe(405);
    expect(appStatusWrite.headers.get("Allow")).toBe("GET");
    expect(publicRoute.status).toBe(404);
  });
});

async function getAdminJson<T>(path: string) {
  const response = await harness.fetch(path, {
    headers: adminHeaders(),
  });

  expect(response.status, await response.clone().text()).toBe(200);

  return {
    body: (await response.json()) as T,
    response,
  };
}

async function postAdminJson<T = unknown>(path: string, body: unknown) {
  const response = await harness.fetch(path, {
    body: JSON.stringify(body),
    headers: adminHeaders(),
    method: "POST",
  });

  expect([200, 201], await response.clone().text()).toContain(response.status);

  return {
    body: (await response.json()) as T,
    response,
  };
}

function adminHeaders() {
  return {
    Authorization: `Bearer ${adminToken}`,
    "Content-Type": "application/json",
  };
}
