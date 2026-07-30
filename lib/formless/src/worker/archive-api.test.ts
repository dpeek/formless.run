import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  APP_ARCHIVE_KIND,
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  type AppArchive,
  type InstanceArchive,
} from "../program/archive.ts";
import type { SitePageTreeResponse } from "@dpeek/formless-site-app";
import {
  FormlessSitePageRenderer,
  FormlessSiteSystemStateRenderer,
} from "@dpeek/formless-renderer/site/renderer";
import { renderPublishedSiteDocumentResponse } from "@dpeek/formless-site-app/worker";
import type { AppInstall } from "@dpeek/formless-installed-apps";
import { instanceControlPlaneRecordsForAppInstall } from "@dpeek/formless-instance-control-plane";
import { formlessProgramSchema } from "../program/runtime.ts";
import {
  FORMLESS_PROGRAM_SCHEMA_KEY,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
} from "../program/target.ts";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
import type { AppInstallsResponse, BootstrapResponse } from "../shared/protocol.ts";
import { bundledSourceSchemaHashFixtures } from "../shared/upgrade-migrations.ts";
import {
  crmTestRecords,
  crmSourceSchema,
  siteSourceSchema,
  taskSourceSchema,
} from "../test/schema-apps.ts";
import {
  commandOperationRequest,
  instanceControlPlaneTestStorageSnapshot,
  restoreTestStorageSnapshot,
} from "../test/authority-write.ts";
import { testSiteRecords } from "../test/site-records.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";
const internalResetAppStoragePath = "/_internal/reset-app-storage";

let harness: Harness;

beforeAll(async () => {
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: { FORMLESS_ADMIN_TOKEN: adminToken },
      r2Buckets: ["FORMLESS_MEDIA"],
    },
  );
});

beforeEach(async () => {
  await resetWorkerState();
});

afterAll(async () => {
  await harness.dispose();
});

describe("instance archive restore API", () => {
  it("dry-runs and applies app archive restore through installed app storage", async () => {
    const dryRun = await postArchiveRestore(appArchive({ dryRun: true }));
    const before = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const applied = await postArchiveRestore(appArchive({ dryRun: false }));
    const after = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const bootstrap = await getJson<BootstrapResponse>("/api/app-installs/site/personal/bootstrap");

    expect(dryRun.response.status).toBe(200);
    expect(dryRun.body).toMatchObject({
      ok: true,
      report: {
        applied: false,
        summary: {
          appCount: 1,
          createdInstalls: ["personal"],
        },
      },
    });
    expect(before.body.installs).toEqual([]);
    expect(applied.response.status).toBe(200);
    expect(applied.body).toMatchObject({
      ok: true,
      report: {
        applied: true,
        summary: {
          appCount: 1,
          createdInstalls: ["personal"],
        },
      },
    });
    expect(after.body.installs.map((install) => install.installId)).toEqual(["personal"]);
    expect(bootstrap.body.records).toContainEqual(siteRecord());
  });

  it("restores installed Tasks app archives without Site media", async () => {
    const dryRun = await postArchiveRestore(tasksAppArchive({ dryRun: true }));
    const applied = await postArchiveRestore(tasksAppArchive({ dryRun: false }));
    const installs = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const bootstrap = await getJson<BootstrapResponse>("/api/app-installs/tasks/work/bootstrap");

    expect(dryRun.response.status).toBe(200);
    expect(dryRun.body).toMatchObject({
      ok: true,
      report: {
        applied: false,
        summary: {
          appCount: 1,
          createdInstalls: ["work"],
          mediaCountsByApp: { work: 0 },
        },
      },
    });
    expect(applied.response.status).toBe(200);
    expect(applied.body).toMatchObject({
      ok: true,
      report: {
        applied: true,
        summary: {
          appCount: 1,
          createdInstalls: ["work"],
          mediaCountsByApp: { work: 0 },
        },
      },
    });
    expect(installs.body.installs).toEqual([
      expect.objectContaining({
        adminRoute: "/apps/work",
        installId: "work",
        packageAppKey: "tasks",
      }),
    ]);
    expect(installs.body.installs[0]).not.toHaveProperty("publicRoute");
    expect(bootstrap.body.schema).toEqual(taskSourceSchema);
    expect(bootstrap.body.records).toEqual([taskRecord()]);
  });

  it("replaces installed app archive data with monotonic cursors and cleared operation replay", async () => {
    const initial = await postArchiveRestore(
      tasksAppArchive({
        dryRun: false,
        records: [taskRecord({ done: true, id: "task-before-replace", title: "Before replace" })],
      }),
    );
    const before = await getJson<BootstrapResponse>("/api/app-installs/tasks/work/bootstrap");
    const firstAction = await postInstalledAppAction("tasks", "work", {
      idempotencyKey: "command-archive-clear",
      entity: "task",
      operationName: "clearCompletedTasks",
    });
    const replacementRecord = taskRecord({
      done: true,
      id: "task-after-replace",
      title: "After replace",
    });
    const replaced = await postArchiveRestore(
      tasksAppArchive({
        dryRun: false,
        installCollisions: "replace",
        records: [replacementRecord],
      }),
    );
    const after = await getJson<BootstrapResponse>("/api/app-installs/tasks/work/bootstrap");
    const secondAction = await postInstalledAppAction("tasks", "work", {
      idempotencyKey: "command-archive-clear",
      entity: "task",
      operationName: "clearCompletedTasks",
    });

    expect(initial.response.status).toBe(200);
    expect(before.body.cursor).toBe(1);
    expect(firstAction.cursor).toBe(2);
    expect(firstAction.changes).toHaveLength(1);
    expect(replaced.response.status).toBe(200);
    expect(replaced.body).toMatchObject({
      ok: true,
      report: {
        applied: true,
        summary: { replacedInstalls: ["work"] },
      },
    });
    expect(after.body.cursor).toBeGreaterThan(firstAction.cursor);
    expect(after.body.records).toHaveLength(2);
    expect(after.body.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "task-before-replace",
          deletedAt: expect.any(String),
        }),
        replacementRecord,
      ]),
    );
    expect(secondAction.cursor).toBeGreaterThan(after.body.cursor);
    expect(secondAction.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          writeId: "operation:task.clearCompletedTasks:command-archive-clear",
          operationKind: "command",
          recordId: replacementRecord.id,
          payload: expect.objectContaining({
            id: replacementRecord.id,
            deletedAt: expect.any(String),
          }),
        }),
      ]),
    );
  });

  it("restores installed CRM app archives without Site media", async () => {
    const dryRun = await postArchiveRestore(crmAppArchive({ dryRun: true }));
    const applied = await postArchiveRestore(crmAppArchive({ dryRun: false }));
    const installs = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const bootstrap = await getJson<BootstrapResponse>("/api/app-installs/crm/rates/bootstrap");

    expect(dryRun.response.status).toBe(200);
    expect(dryRun.body).toMatchObject({
      ok: true,
      report: {
        applied: false,
        summary: {
          appCount: 1,
          createdInstalls: ["rates"],
          mediaCountsByApp: { rates: 0 },
        },
      },
    });
    expect(applied.response.status).toBe(200);
    expect(applied.body).toMatchObject({
      ok: true,
      report: {
        applied: true,
        summary: {
          appCount: 1,
          createdInstalls: ["rates"],
          mediaCountsByApp: { rates: 0 },
        },
      },
    });
    expect(installs.body.installs).toEqual([
      expect.objectContaining({
        adminRoute: "/apps/rates",
        installId: "rates",
        packageAppKey: "crm",
      }),
    ]);
    expect(installs.body.installs[0]).not.toHaveProperty("publicRoute");
    expect(bootstrap.body.schema).toEqual(crmSourceSchema);
    expect(bootstrap.body.records).toEqual(crmTestRecords);
  });

  it("restores mixed Site, Tasks, and CRM instance archives without non-Site media", async () => {
    const dryRun = await postArchiveRestore(mixedInstanceArchive({ dryRun: true }));
    const applied = await postArchiveRestore(mixedInstanceArchive({ dryRun: false }));
    const installs = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const site = await getJson<BootstrapResponse>("/api/app-installs/site/personal/bootstrap");
    const tasks = await getJson<BootstrapResponse>("/api/app-installs/tasks/work/bootstrap");
    const crm = await getJson<BootstrapResponse>("/api/app-installs/crm/rates/bootstrap");

    expect(dryRun.response.status).toBe(200);
    expect(dryRun.body).toMatchObject({
      ok: true,
      report: {
        applied: false,
        summary: {
          appCount: 3,
          createdInstalls: ["personal", "rates", "work"],
          mediaCountsByApp: { personal: 0, rates: 0, work: 0 },
        },
      },
    });
    expect(applied.response.status).toBe(200);
    expect(applied.body).toMatchObject({
      ok: true,
      report: {
        applied: true,
        summary: {
          appCount: 3,
          createdInstalls: ["personal", "rates", "work"],
          mediaCountsByApp: { personal: 0, rates: 0, work: 0 },
        },
      },
    });
    expect(installs.body.installs.map((install) => install.packageAppKey)).toEqual([
      "site",
      "crm",
      "tasks",
    ]);
    expect(
      installs.body.installs.find((install) => install.installId === "work"),
    ).not.toHaveProperty("publicRoute");
    expect(
      installs.body.installs.find((install) => install.installId === "rates"),
    ).not.toHaveProperty("publicRoute");
    expect(site.body.schema).toEqual(siteSourceSchema);
    expect(site.body.records).toEqual([siteRecord()]);
    expect(tasks.body.schema).toEqual(taskSourceSchema);
    expect(tasks.body.records).toEqual([taskRecord()]);
    expect(crm.body.schema).toEqual(crmSourceSchema);
    expect(crm.body.records).toEqual(crmTestRecords);
  });

  it("restores schema-owned control-plane records through the archive API", async () => {
    const restored = await postArchiveRestore(controlPlaneInstanceArchive({ dryRun: false }));
    const installs = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const installedApp = await getJson<BootstrapResponse>(
      "/api/app-installs/site/personal/bootstrap",
    );
    const controlPlane = await getJson<BootstrapResponse>(
      "/api/formless/program/bootstrap?actorKind=owner",
    );
    const serializedControlPlane = JSON.stringify(controlPlane.body);

    expect(restored.response.status).toBe(200);
    expect(restored.body).toMatchObject({
      ok: true,
      report: {
        applied: true,
        summary: {
          appCount: 1,
          createdInstalls: ["personal"],
        },
      },
    });
    expect(installs.response.status).toBe(200);
    expect(installs.body.installs).toEqual([
      expect.objectContaining({
        adminRoute: "/apps/personal-dashboard",
        installId: "personal",
        label: "Archived Personal",
        packageAppKey: "site",
        publicRoute: "/sites/personal",
      }),
    ]);
    expect(
      installs.body.installs[0]?.routes?.map((route) => [route.routeKind, route.path]),
    ).toEqual([
      ["admin", "/apps/personal-dashboard"],
      ["publicSite", "/sites/personal"],
    ]);
    expect(installedApp.body.records).toContainEqual(siteRecord());
    expect(controlPlane.body.records.map((record) => `${record.entity}:${record.id}`)).toEqual(
      expect.arrayContaining([
        "app-install:personal",
        "route:route:host:publicSite:archive.example.com",
        "route:route:redirect:old.archive.example.com",
        "deployment-config:instance.primary",
      ]),
    );
    expect(serializedControlPlane).not.toContain("site-main");
    expect(serializedControlPlane).not.toContain("CF_API_TOKEN");
    expect(serializedControlPlane).not.toContain("ALCHEMY_PASSWORD");
    expect(serializedControlPlane).not.toContain("raw-lease-token");
  });

  it("restores core Site media before public tree reads reference it", async () => {
    const applied = await postArchiveRestore(appArchiveWithMedia({ dryRun: false }), [mediaFile()]);
    const tree = await getJson<SitePageTreeResponse>("/api/app-installs/site/personal/tree/home");
    const document = await renderPublishedSiteDocumentResponse({
      builtInRenderer: FormlessSitePageRenderer,
      builtInSystemStateRenderer: FormlessSiteSystemStateRenderer,
      clientAssets: { body: "", head: "" },
      requestUrl: new URL("https://personal.example/"),
      treeResult: { kind: "found", tree: tree.body },
    });
    const html = await document.text();
    const served = await harness.fetch(coreMediaHref);

    expect(applied.response.status).toBe(200);
    expect(applied.body).toMatchObject({
      ok: true,
      report: {
        applied: true,
        summary: {
          appCount: 1,
          createdInstalls: ["personal"],
          mediaCountsByApp: { personal: 1 },
        },
      },
    });
    expect(JSON.stringify(tree.body)).toContain(coreMediaHref);
    expect(tree.body.page.label).toBe("Home");
    expect(document.status).toBe(200);
    expect(html).toContain('<main style="min-height:100dvh">');
    expect(html).toContain("data-astryx-public-site-provider");
    expect(html).toContain(coreMediaHref);
    expect(html).not.toContain("data-custom-public-site-renderer");
    expect(served.status).toBe(200);
    expect(served.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(mediaBytes);
  });

  it("exact instance replacement replaces matching installs and prunes absent installs and media", async () => {
    const beforeTaskRecord = taskRecord({
      id: "task-before-exact",
      title: "Before exact replacement",
    });
    const afterTaskRecord = taskRecord({
      id: "task-after-exact",
      title: "After exact replacement",
    });
    const bucket = await harness.mf.getR2Bucket("FORMLESS_MEDIA");

    await postArchiveRestore(appArchiveWithMedia({ dryRun: false }), [mediaFile()]);
    await postArchiveRestore(
      tasksAppArchive({
        dryRun: false,
        records: [beforeTaskRecord],
      }),
    );
    await bucket.put("media/images/orphan.png", new Uint8Array([1, 2, 3]));
    await bucket.put(
      "media/app-installs/personal/documents/orphan.pdf",
      new TextEncoder().encode("%PDF-1.7\norphan"),
    );

    const applied = await postArchiveRestore(
      exactTasksInstanceArchive({
        dryRun: false,
        records: [afterTaskRecord],
      }),
      [],
      { exactInstanceReplacement: true },
    );
    const installs = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const tasks = await getJson<BootstrapResponse>("/api/app-installs/tasks/work/bootstrap");
    const personal = await getJson<BootstrapResponse>("/api/app-installs/site/personal/bootstrap");
    const media = await bucket.list({ prefix: "media/images/" });
    const documents = await bucket.list({ prefix: "media/app-installs/" });

    expect(applied.response.status).toBe(200);
    expect(applied.body).toMatchObject({
      ok: true,
      report: {
        applied: true,
        summary: {
          appCount: 1,
          replacedInstalls: ["work"],
        },
      },
    });
    expect(installs.body.installs.map((install) => install.installId)).toEqual(["work"]);
    expect(tasks.body.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: beforeTaskRecord.id,
          deletedAt: expect.any(String),
        }),
        afterTaskRecord,
      ]),
    );
    expect(personal.body.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "rec_site_media_avatar",
          deletedAt: expect.any(String),
        }),
      ]),
    );
    expect(personal.body.records.every((record) => record.deletedAt !== undefined)).toBe(true);
    expect(media.objects.map((object) => object.key)).toEqual([]);
    expect(documents.objects.map((object) => object.key)).toEqual([]);
  });

  it("requires write authorization", async () => {
    const response = await harness.fetch("/api/formless/archive/restore", {
      body: JSON.stringify({ archive: appArchive({ dryRun: true }) }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Owner session or admin authorization is required for this write endpoint.",
    });
  });
});

async function resetWorkerState() {
  await restoreTestStorageSnapshot(
    harness,
    "/api/formless/program/snapshot/restore",
    instanceControlPlaneTestStorageSnapshot(),
    { Authorization: `Bearer ${adminToken}` },
  );
  await Promise.all([
    postInternalAppStorageReset("personal"),
    postInternalAppStorageReset("work"),
    postInternalAppStorageReset("rates"),
    clearMediaBucket(),
  ]);
}

async function postInternalAppStorageReset(installId: string) {
  const response = await harness.durableObjectFetch(
    "FORMLESS_AUTHORITY",
    `app:${installId}`,
    internalResetAppStoragePath,
    {
      method: "POST",
    },
  );

  expect(response.status).toBe(200);
}

async function clearMediaBucket() {
  const bucket = await harness.mf.getR2Bucket("FORMLESS_MEDIA");
  const objects = await bucket.list();

  if (objects.objects.length > 0) {
    await bucket.delete(objects.objects.map((object) => object.key));
  }
}

async function postArchiveRestore(
  archive: AppArchive | InstanceArchive,
  mediaFiles: Array<{
    archivePath: string;
    byteSize: number;
    bytesBase64: string;
    contentType: string;
  }> = [],
  options: {
    exactInstanceReplacement?: boolean;
  } = {},
) {
  const response = await harness.fetch("/api/formless/archive/restore", {
    body: JSON.stringify({
      archive,
      ...(options.exactInstanceReplacement === undefined
        ? {}
        : { exactInstanceReplacement: options.exactInstanceReplacement }),
      mediaFiles,
    }),
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  return {
    body: (await response.json()) as unknown,
    response,
  };
}

async function getJson<T>(path: string) {
  const response = await harness.fetch(path, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);

  return {
    body: body as T,
    response,
  };
}

async function postInstalledAppAction(
  packageAppKey: string,
  installId: string,
  body: Parameters<typeof commandOperationRequest>[0],
) {
  const request = commandOperationRequest(body);
  const response = await harness.fetch(
    `/api/app-installs/${packageAppKey}/${installId}${request.path.slice("/api".length)}`,
    {
      body: JSON.stringify(request.body),
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );

  expect(response.status).toBe(200);

  return request.response(await response.json());
}

function mixedInstanceArchive(input: { dryRun: boolean }): InstanceArchive {
  return {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: "2026-05-12T00:00:00.000Z",
    capabilities: ["installed-app-registry", "app-store-snapshots", "core-media-assets"],
    restorePolicy: { dryRun: input.dryRun, installCollisions: "reject" },
    apps: [appArchive(input), tasksAppArchive(input), crmAppArchive(input)],
  };
}

function controlPlaneInstanceArchive(input: { dryRun: boolean }): InstanceArchive {
  return {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: "2026-05-12T00:00:00.000Z",
    capabilities: [
      "installed-app-registry",
      "schema-owned-control-plane",
      "app-store-snapshots",
      "core-media-assets",
    ],
    restorePolicy: { dryRun: input.dryRun, installCollisions: "reject" },
    apps: [appArchive(input)],
    controlPlane: {
      kind: STORAGE_SNAPSHOT_KIND,
      version: STORAGE_SNAPSHOT_VERSION,
      storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
      schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
      exportedAt: "2026-05-12T00:00:00.000Z",
      schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
      sourceCursor: controlPlaneArchiveRecords().length,
      schema: formlessProgramSchema,
      records: controlPlaneArchiveRecords(),
    },
  };
}

function exactTasksInstanceArchive(input: {
  dryRun: boolean;
  records?: StoredRecord[];
}): InstanceArchive {
  const app = tasksAppArchive({
    dryRun: input.dryRun,
    installCollisions: "replace",
    records: input.records,
  });
  const now = "2026-05-12T00:00:00.000Z";

  return {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: now,
    capabilities: [
      "installed-app-registry",
      "schema-owned-control-plane",
      "app-store-snapshots",
      "core-media-assets",
    ],
    restorePolicy: { dryRun: input.dryRun, installCollisions: "replace" },
    apps: [app],
    controlPlane: {
      kind: STORAGE_SNAPSHOT_KIND,
      version: STORAGE_SNAPSHOT_VERSION,
      storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
      schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
      exportedAt: now,
      schemaUpdatedAt: now,
      sourceCursor: 1,
      schema: formlessProgramSchema,
      records: instanceControlPlaneRecordsForAppInstall({
        install: tasksInstall(),
        now,
      }).map(storedControlPlaneRecord),
    },
  };
}

function tasksInstall(): AppInstall {
  return {
    installId: "work",
    packageAppKey: "tasks",
    packageRevision: 1,
    sourceSchemaHash: bundledSourceSchemaHashFixtures.tasks,
    label: "Work Tasks",
    registrationPolicy: "closed",
    status: "installed",
    createdAt: "2026-05-12T00:00:00.000Z",
    updatedAt: "2026-05-12T00:00:00.000Z",
    adminRoute: "/apps/work",
  };
}

function controlPlaneArchiveRecords(): StoredRecord[] {
  const now = "2026-05-12T00:00:00.000Z";
  const install: AppInstall = {
    installId: "personal",
    packageAppKey: "site",
    packageRevision: 1,
    sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
    label: "Archived Personal",
    registrationPolicy: "closed",
    status: "installed",
    createdAt: now,
    updatedAt: now,
    adminRoute: "/apps/personal",
    publicRoute: "/sites/personal",
    publicRoutePrefix: "/sites/personal/",
  };
  const records = instanceControlPlaneRecordsForAppInstall({ install, now }).map(
    storedControlPlaneRecord,
  );
  const adminRoute = records.find((record) => record.id === "route:personal:admin");

  if (!adminRoute) {
    throw new Error("Expected default admin app route.");
  }

  adminRoute.values = {
    ...adminRoute.values,
    matchPath: "/apps/personal-dashboard",
    matchPrefix: "/apps/personal-dashboard/",
  };

  return [
    ...records,
    {
      id: "instance.primary",
      entity: "deployment-config",
      createdAt: now,
      updatedAt: now,
      values: {
        targetId: "instance.primary",
        targetKind: "instance",
        label: "Primary instance target",
        enabled: true,
        targetUrl: "https://personal.dpeek.workers.dev",
        providerFamily: "cloudflare",
        accountId: "account-123",
        workerName: "personal-worker",
      },
    },
    {
      id: "route:host:publicSite:archive.example.com",
      entity: "route",
      createdAt: now,
      updatedAt: now,
      values: {
        enabled: true,
        matchHost: "archive.example.com",
        matchPath: "/",
        matchPrefix: "/",
        kind: "mount",
        targetProfile: "public-site",
        appInstall: "personal",
        surface: "public-site",
        deploymentConfig: "instance.primary",
      },
    },
    {
      id: "route:redirect:old.archive.example.com",
      entity: "route",
      createdAt: now,
      updatedAt: now,
      values: {
        enabled: true,
        matchHost: "old.archive.example.com",
        matchPath: "/",
        matchPrefix: "/",
        kind: "redirect",
        toHost: "archive.example.com",
        statusCode: "308",
        preservePath: true,
        preserveQueryString: true,
      },
    },
  ];
}

function storedControlPlaneRecord(record: {
  createdAt: string;
  deletedAt?: string;
  entity: string;
  id: string;
  updatedAt?: string;
  values: RecordValues;
}): StoredRecord {
  return {
    id: record.id,
    entity: record.entity,
    values: record.values,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt ?? record.createdAt,
    ...(record.deletedAt === undefined ? {} : { deletedAt: record.deletedAt }),
  };
}

function appArchive(input: { dryRun: boolean }): AppArchive {
  return {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: "2026-05-12T00:00:00.000Z",
    capabilities: ["app-store-snapshots", "core-media-assets"],
    restorePolicy: { dryRun: input.dryRun, installCollisions: "reject" },
    app: {
      installId: "personal",
      packageAppKey: "site",
      packageRevision: 1,
      sourceSchemaKey: "site",
      sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
      label: "Personal",
      registrationPolicy: "closed",
      status: "installed",
      createdAt: "2026-05-12T00:00:00.000Z",
      updatedAt: "2026-05-12T00:00:00.000Z",
    },
    data: {
      kind: STORAGE_SNAPSHOT_KIND,
      version: STORAGE_SNAPSHOT_VERSION,
      storageIdentity: "app:personal",
      schemaKey: "site",
      exportedAt: "2026-05-12T00:00:00.000Z",
      schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
      sourceCursor: 1,
      schema: siteSourceSchema,
      records: [siteRecord()],
    },
    media: { objects: [] },
  };
}

function tasksAppArchive(input: {
  dryRun: boolean;
  installCollisions?: "reject" | "replace";
  records?: StoredRecord[];
}): AppArchive {
  return {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: "2026-05-12T00:00:00.000Z",
    capabilities: ["app-store-snapshots", "core-media-assets"],
    restorePolicy: { dryRun: input.dryRun, installCollisions: input.installCollisions ?? "reject" },
    app: {
      installId: "work",
      packageAppKey: "tasks",
      packageRevision: 1,
      sourceSchemaKey: "tasks",
      sourceSchemaHash: bundledSourceSchemaHashFixtures.tasks,
      label: "Work Tasks",
      registrationPolicy: "closed",
      status: "installed",
      createdAt: "2026-05-12T00:00:00.000Z",
      updatedAt: "2026-05-12T00:00:00.000Z",
    },
    data: {
      kind: STORAGE_SNAPSHOT_KIND,
      version: STORAGE_SNAPSHOT_VERSION,
      storageIdentity: "app:work",
      schemaKey: "tasks",
      exportedAt: "2026-05-12T00:00:00.000Z",
      schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
      sourceCursor: 1,
      schema: taskSourceSchema,
      records: input.records ?? [taskRecord()],
    },
    media: { objects: [] },
  };
}

function crmAppArchive(input: { dryRun: boolean }): AppArchive {
  return {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: "2026-05-12T00:00:00.000Z",
    capabilities: ["app-store-snapshots", "core-media-assets"],
    restorePolicy: { dryRun: input.dryRun, installCollisions: "reject" },
    app: {
      installId: "rates",
      packageAppKey: "crm",
      packageRevision: 1,
      sourceSchemaKey: "crm",
      sourceSchemaHash: bundledSourceSchemaHashFixtures.crm,
      label: "Rates",
      registrationPolicy: "closed",
      status: "installed",
      createdAt: "2026-05-12T00:00:00.000Z",
      updatedAt: "2026-05-12T00:00:00.000Z",
    },
    data: {
      kind: STORAGE_SNAPSHOT_KIND,
      version: STORAGE_SNAPSHOT_VERSION,
      storageIdentity: "app:rates",
      schemaKey: "crm",
      exportedAt: "2026-05-12T00:00:00.000Z",
      schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
      sourceCursor: crmTestRecords.length,
      schema: crmSourceSchema,
      records: crmTestRecords,
    },
    media: { objects: [] },
  };
}

const mediaBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const coreMediaStorageKey = "media/images/installed.png";
const coreMediaHref = `/api/formless/media/${coreMediaStorageKey}`;

function appArchiveWithMedia(input: { dryRun: boolean }): AppArchive {
  return {
    ...appArchive(input),
    data: {
      kind: STORAGE_SNAPSHOT_KIND,
      version: STORAGE_SNAPSHOT_VERSION,
      storageIdentity: "app:personal",
      schemaKey: "site",
      exportedAt: "2026-05-12T00:00:00.000Z",
      schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
      sourceCursor: testSiteRecords.length,
      schema: siteSourceSchema,
      records: testSiteRecords.map((record) =>
        record.id === "rec_site_media_avatar" ? imageAssetRecord(record) : record,
      ),
    },
    media: {
      objects: [
        {
          archivePath: "media/personal/installed.png",
          asset: {
            byteSize: mediaBytes.byteLength,
            contentType: "image/png",
            deliveryHref: coreMediaHref,
            id: "installed.png",
            kind: "image",
            label: "installed.png",
            provider: "r2",
            status: "ready",
            storageKey: coreMediaStorageKey,
          },
          byteSize: mediaBytes.byteLength,
          contentType: "image/png",
          deliveryHref: coreMediaHref,
          storageKey: coreMediaStorageKey,
        },
      ],
    },
  };
}

function imageAssetRecord(record: StoredRecord): StoredRecord {
  const values = { ...record.values };

  delete values.href;

  return {
    ...record,
    values: {
      ...values,
      mediaAssetId: "installed.png",
    },
  };
}

function mediaFile() {
  return {
    archivePath: "media/personal/installed.png",
    byteSize: mediaBytes.byteLength,
    bytesBase64: Buffer.from(mediaBytes).toString("base64"),
    contentType: "image/png",
  };
}

function siteRecord(): StoredRecord {
  return {
    id: "site-main",
    createdAt: "2026-05-12T00:00:00.000Z",
    updatedAt: "2026-05-12T00:00:00.000Z",
    entity: "site",
    values: {
      key: "personal",
      label: "Personal",
    },
  };
}
function taskRecord(
  overrides: {
    done?: boolean;
    id?: string;
    title?: string;
  } = {},
): StoredRecord {
  return {
    id: overrides.id ?? "task-restored",
    createdAt: "2026-05-12T00:00:00.000Z",
    updatedAt: "2026-05-12T00:00:00.000Z",
    entity: "task",
    values: {
      title: overrides.title ?? "Restored task",
      done: overrides.done ?? false,
      priority: "normal",
    },
  };
}
