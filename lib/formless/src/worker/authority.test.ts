import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { WebSocketEventMap } from "miniflare";
import {
  STORAGE_SNAPSHOT_KIND,
  STORAGE_SNAPSHOT_VERSION,
  formatStoredRecordsForArtifact,
} from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import {
  FORMLESS_CLIENT_PACKAGE_REVISION_HEADER,
  FORMLESS_CLIENT_RUNTIME_PROTOCOL_HEADER,
  FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER,
  FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER,
  FORMLESS_RELOAD_REQUIRED_ERROR_CODE,
  type BootstrapResponse,
  type SchemaResponse,
  type SchemaUpdateResponse,
  type SyncResponse,
  type SyncSocketServerMessage,
} from "../shared/protocol.ts";
import type { SitePageTreeResponse } from "@dpeek/formless-site-app";
import { FORMLESS_RUNTIME_PROTOCOL_VERSION } from "../shared/deploy-metadata.ts";
import { packageAppFactsForKey } from "@dpeek/formless-installed-apps";
import {
  appPackageManifestKind,
  appPackageManifestVersion,
  bundledAppPackageResolver,
  type AppPackageManifest,
} from "../shared/app-packages.ts";
import type { SchemaKey } from "../shared/schema-apps.ts";
import { computeSourceSchemaHash, type SourceSchemaHash } from "../shared/upgrade-migrations.ts";
import {
  FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME,
  formatRuntimeWorkspaceAppPackages,
} from "../shared/workspace-runtime-packages.ts";
import {
  type AppSchema,
  type EntityOperationSchema,
  type EntitySchema,
  type RecordPlanStepSchema,
} from "@dpeek/formless-schema";
import { IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX } from "@dpeek/formless-identity-control-plane";
import {
  crmSeedRecords,
  crmSourceSchema,
  siteSeedRecords,
  siteSourceSchema,
  taskSeedRecords,
  taskSourceSeedRecords,
  taskSourceSchema as appSchema,
} from "../test/schema-apps.ts";
import { testSiteSeedRecords } from "../test/site-records.ts";
import {
  commandOperationRequest,
  createAuthorityWriteHelpers,
  recordOperationRequest,
  operationWriteRequest,
  type AuthorityWriteHelpers,
  type AuthorityTestCommandOperationRequest,
  type AuthorityTestRecordOperationRequest,
} from "../test/authority-write.ts";
import { resetTestIdentityStorage } from "../test/identity-owner.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { PUBLIC_SITE_TREE_CACHE_CONTROL } from "@dpeek/formless-site-app/worker";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

let harness: Harness;
let authority: AuthorityWriteHelpers;
const adminToken = "test-admin-token";

function taskSchemaProvenance() {
  const packageFacts = packageAppFactsForKey("tasks", bundledAppPackageResolver);

  if (!packageFacts) {
    throw new Error("Expected bundled Tasks package facts.");
  }

  return {
    kind: "package-app" as const,
    packageAppKey: "tasks",
    packageRevision: packageFacts.packageRevision,
    sourceSchemaHash: packageFacts.sourceSchemaHash,
  };
}

beforeAll(async () => {
  harness = await createWorkerHarness("src/worker/index.ts", {
    FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
  });
  authority = createAuthorityWriteHelpers(harness);
});

beforeEach(async () => {
  await resetSchemaApp("tasks");
  useSchemaApp("tasks");
});

afterAll(async () => {
  await harness.dispose();
});

describe("authority", () => {
  it("returns schema, records, and cursor from bootstrap", async () => {
    const body = await getJson<BootstrapResponse>("/api/bootstrap");

    expect(body).toEqual({
      schema: appSchema,
      schemaProvenance: taskSchemaProvenance(),
      schemaUpdatedAt: expect.any(String),
      records: taskSeedRecords,
      cursor: taskSeedRecords.length,
    });
  });

  it("returns browser replica upgrade facts on compatible bootstrap and sync reads", async () => {
    const bootstrap = await harness.fetch(apiPath("/api/bootstrap"));
    const bootstrapBody = (await bootstrap.json()) as BootstrapResponse;
    const sync = await harness.fetch(
      apiPath(
        `/api/sync?after=${bootstrapBody.cursor}&schemaUpdatedAt=${encodeURIComponent("2026-01-01T00:00:00.000Z")}`,
      ),
    );
    const syncBody = (await sync.json()) as SyncResponse;
    const packageFacts = packageAppFactsForKey("tasks", bundledAppPackageResolver);

    expect(bootstrap.status).toBe(200);
    expect(sync.status).toBe(200);
    expect(bootstrap.headers.get(FORMLESS_CLIENT_RUNTIME_PROTOCOL_HEADER)).toBe(
      String(FORMLESS_RUNTIME_PROTOCOL_VERSION),
    );
    expect(sync.headers.get(FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER)).toBe(
      bootstrapBody.schemaUpdatedAt,
    );
    expect(sync.headers.get(FORMLESS_CLIENT_PACKAGE_REVISION_HEADER)).toBe(
      String(packageFacts?.packageRevision),
    );
    expect(sync.headers.get(FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER)).toBe(
      packageFacts?.sourceSchemaHash,
    );
    expect(bootstrapBody.schemaProvenance).toEqual({
      kind: "package-app",
      packageAppKey: "tasks",
      packageRevision: packageFacts?.packageRevision,
      sourceSchemaHash: packageFacts?.sourceSchemaHash,
    });
    expect(syncBody).toMatchObject({
      changes: [],
      cursor: bootstrapBody.cursor,
      schema: appSchema,
      schemaProvenance: bootstrapBody.schemaProvenance,
      schemaUpdatedAt: bootstrapBody.schemaUpdatedAt,
    });
  });

  it("returns the site source schema from the site bootstrap path", async () => {
    await resetSchemaApp("site");
    useSchemaApp("site");

    const body = await getJson<BootstrapResponse>("/api/bootstrap");

    expect(body.schema).toEqual(siteSourceSchema);
    expect(body.schemaUpdatedAt).toEqual(expect.any(String));
    expect(body.cursor).toBe(siteSeedRecords.length);
    expectRecordsIgnoringOrder(body.records, siteSeedRecords);
    expect(new Set(body.records.map((record) => record.entity))).toEqual(
      new Set(["site", "block", "block-placement"]),
    );
  });

  it("rejects stale browser writes before commit or push notification", async () => {
    const before = await getJson<BootstrapResponse>("/api/bootstrap");
    const socket = await openSyncSocket();

    try {
      await primeSyncSocket(socket, before.cursor, before.schemaUpdatedAt);
      const capture = captureSyncSocketMessages(socket);
      const response = await harness.fetch(apiPath("/api/operations/task/create"), {
        body: JSON.stringify({
          idempotencyKey: "operation-stale-client-rejected",
          input: {
            title: "Stale client write",
            done: false,
          },
        }),
        headers: {
          "Content-Type": "application/json",
          [FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER]: "2026-01-01T00:00:00.000Z",
        },
        method: "POST",
      });
      const body = (await response.json()) as {
        code: string;
        reloadRequired: boolean;
        upgrade: {
          schemaUpdatedAt: string | null;
        };
      };
      const after = await getJson<BootstrapResponse>("/api/bootstrap");
      expect(response.status).toBe(409);
      expect(body).toMatchObject({
        code: FORMLESS_RELOAD_REQUIRED_ERROR_CODE,
        reloadRequired: true,
        upgrade: {
          schemaUpdatedAt: before.schemaUpdatedAt,
        },
      });
      expect(after.cursor).toBe(before.cursor);
      expect(after.records).toEqual(before.records);
      await expectNoCapturedMessages(capture);
      capture.stop();
    } finally {
      socket.close();
    }
  });

  it("bootstraps installed Site API routes from the bundled Site source", async () => {
    await resetInstalledApp("site", "starter");

    const body = await getInstalledAppJson<BootstrapResponse>("site", "starter", "/bootstrap");

    expect(body.schema).toEqual(siteSourceSchema);
    expect(body.schemaUpdatedAt).toEqual(expect.any(String));
    expect(body.cursor).toBe(siteSeedRecords.length);
    expectRecordsIgnoringOrder(body.records, siteSeedRecords);
  });

  it("isolates installed Site storage by install id while preserving legacy Site storage", async () => {
    await resetInstalledApp("site", "personal");
    await resetInstalledApp("site", "docs");

    const created = await postInstalledAppRecordOperation("site", "personal", {
      idempotencyKey: "write-installed-site-page",
      entity: "block",
      operationName: "create",
      input: {
        type: "page",
        label: "Personal only",
        href: "/personal-only",
      },
    });

    const personal = await getInstalledAppJson<BootstrapResponse>("site", "personal", "/bootstrap");
    const docs = await getInstalledAppJson<BootstrapResponse>("site", "docs", "/bootstrap");
    await resetSchemaApp("site");
    useSchemaApp("site");
    const legacySite = await getJson<BootstrapResponse>("/api/bootstrap");

    expect(personal.records).toContainEqual(created.record);
    expect(docs.records).not.toContainEqual(created.record);
    expect(legacySite.records).not.toContainEqual(created.record);
    expect(docs.schema).toEqual(siteSourceSchema);
    expect(legacySite.schema).toEqual(siteSourceSchema);
  });

  it("isolates installed Tasks storage, sync, reset, snapshot, and command operations by install id", async () => {
    await resetInstalledApp("tasks", "work");
    await resetInstalledApp("tasks", "team");

    const initialSync = await getInstalledAppJson<SyncResponse>("tasks", "work", "/sync?after=0");
    const created = await postInstalledAppRecordOperation("tasks", "work", {
      idempotencyKey: "write-installed-tasks-work",
      entity: "task",
      operationName: "create",
      input: {
        title: "Installed work only",
        done: true,
      },
    });
    const workSnapshot = await getInstalledAppJson<StorageSnapshot>("tasks", "work", "/snapshot");
    const restoredRecord = taskSnapshotRecord("snapshot-installed-task", "Restored installed task");
    const restored = await postInstalledAppJson<BootstrapResponse>(
      "tasks",
      "work",
      "/snapshot/restore",
      storageSnapshot({
        storageIdentity: "app:work",
        sourceCursor: workSnapshot.sourceCursor,
        schemaUpdatedAt: workSnapshot.schemaUpdatedAt,
        records: [restoredRecord],
      }),
    );
    const cleared = await postInstalledAppRecordOperation("tasks", "work", {
      idempotencyKey: "write-installed-tasks-completed",
      entity: "task",
      operationName: "create",
      input: {
        title: "Completed installed task",
        done: true,
      },
    });
    const command = await postInstalledAppCommandOperation("tasks", "work", {
      idempotencyKey: "command-installed-tasks-clear-completed",
      entity: "task",
      operationName: "clearCompletedTasks",
    });
    const reset = await postInstalledAppJson<BootstrapResponse>("tasks", "work", "/reset/seed", {});
    const work = await getInstalledAppJson<BootstrapResponse>("tasks", "work", "/bootstrap");
    const team = await getInstalledAppJson<BootstrapResponse>("tasks", "team", "/bootstrap");
    const legacy = await getJson<BootstrapResponse>("/api/bootstrap");

    expect(initialSync.cursor).toBe(taskSeedRecords.length);
    expect(initialSync.changes.map((change) => change.payload)).toEqual(taskSourceSeedRecords);
    expect(workSnapshot).toMatchObject({
      kind: STORAGE_SNAPSHOT_KIND,
      storageIdentity: "app:work",
      schemaKey: "tasks",
      schema: appSchema,
      sourceCursor: created.cursor,
    });
    expect(workSnapshot.records).toEqual(
      formatStoredRecordsForArtifact(appSchema, [...taskSeedRecords, created.record]),
    );
    expect(restored.records).toContainEqual(restoredRecord);
    expect(command.changes.map((change) => change.payload)).toContainEqual(
      expect.objectContaining({
        id: cleared.record.id,
        deletedAt: expect.any(String),
      }),
    );
    expect(reset.records).toEqual(taskSeedRecords);
    expect(work.records).toEqual(taskSeedRecords);
    expect(team.records).toEqual(taskSeedRecords);
    expect(legacy.records).toEqual(taskSeedRecords);
    expect(team.records).not.toContainEqual(created.record);
    expect(legacy.records).not.toContainEqual(created.record);
  });

  it("projects installed Site tree media asset ids through core delivery without manual hrefs", async () => {
    await postInstalledAppJson<BootstrapResponse>(
      "site",
      "personal",
      "/snapshot/restore",
      siteStorageSnapshot({
        storageIdentity: "app:personal",
        records: [
          ...testSiteSeedRecords,
          {
            id: "rec_installed_site_image",
            entity: "block",
            values: {
              type: "image",
              label: "Installed image",
              mediaAssetId: "installed.webp",
              href: "https://cdn.example.com/installed-manual.webp",
            },
            createdAt: "2026-05-22T00:00:00.000Z",
            updatedAt: "2026-05-22T00:00:00.000Z",
          },
          {
            id: "rec_installed_site_image_place",
            entity: "block-placement",
            values: {
              parent: "rec_site_content_home",
              block: "rec_installed_site_image",
              order: 9000,
            },
            createdAt: "2026-05-22T00:00:01.000Z",
            updatedAt: "2026-05-22T00:00:01.000Z",
          },
        ],
      }),
    );

    const body = await getInstalledAppJson<SitePageTreeResponse>("site", "personal", "/tree/home");

    expect(JSON.stringify(body)).toContain("/api/formless/media/media/images/installed.webp");
    expect(JSON.stringify(body)).not.toContain("https://cdn.example.com/installed-manual.webp");
  });

  it("renders duplicate installed Site public slugs from the selected install storage", async () => {
    await postInstalledAppJson<BootstrapResponse>(
      "site",
      "personal",
      "/snapshot/restore",
      siteStorageSnapshot({
        storageIdentity: "app:personal",
        records: siteRecordsWithHomeLabel("Personal Home"),
      }),
    );
    await postInstalledAppJson<BootstrapResponse>(
      "site",
      "docs",
      "/snapshot/restore",
      siteStorageSnapshot({
        storageIdentity: "app:docs",
        records: siteRecordsWithHomeLabel("Docs Home"),
      }),
    );

    const personal = await getInstalledAppJson<SitePageTreeResponse>(
      "site",
      "personal",
      "/tree/home",
    );
    const docs = await getInstalledAppJson<SitePageTreeResponse>("site", "docs", "/tree/home");

    expect(personal.page.label).toBe("Personal Home");
    expect(docs.page.label).toBe("Docs Home");
    expect(personal.meta.slug).toBe("home");
    expect(docs.meta.slug).toBe("home");
  });

  it("returns a public page tree for a published site page", async () => {
    await resetSchemaApp("site");
    useSchemaApp("site");
    await postJson<BootstrapResponse>("/api/snapshot/restore", siteStorageSnapshot());

    const response = await harness.fetch(apiPath("/api/tree/home"));
    const body = (await response.json()) as SitePageTreeResponse;

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(PUBLIC_SITE_TREE_CACHE_CONTROL);
    expect(body.page).toMatchObject({
      id: "rec_site_content_home",
      type: "page",
      label: "Home",
      href: "/",
    });
    expect(body.site).toMatchObject({
      id: "rec_site_settings_primary",
      label: "Example Site",
      description: "A public test site.",
      icon: expect.stringContaining("<svg"),
    });
    expect(body.page.placements.length).toBeGreaterThan(0);
    expect(body.meta).toEqual({
      slug: "home",
      generatedAt: expect.any(String),
      warnings: [],
    });
    expect(body.page.placements.length).toBeGreaterThan(0);
    expect(body.frame.header?.id).toBe("rec_site_content_group_header");
    expect(body.frame.footer?.id).toBe("rec_site_content_group_footer");
    expect(body).not.toHaveProperty("schema");
    expect(body).not.toHaveProperty("records");
  });

  it("returns a public page tree for any live site page href", async () => {
    await resetSchemaApp("site");
    useSchemaApp("site");
    await postCreateOperationForEntity("write-site-extra-page", "block", {
      type: "page",
      label: "Extra page",
      href: "/extra-page",
    });

    const body = await getJson<SitePageTreeResponse>("/api/tree/extra-page");

    expect(body.page).toMatchObject({
      type: "page",
      label: "Extra page",
      href: "/extra-page",
    });
  });

  it("returns regular blog and dated post route trees for the site app", async () => {
    await resetSchemaApp("site");
    useSchemaApp("site");
    await postJson<BootstrapResponse>("/api/snapshot/restore", siteStorageSnapshot());

    const blog = await getJson<SitePageTreeResponse>("/api/tree/blog");
    const post = await getJson<SitePageTreeResponse>(
      "/api/tree/blog%2Fshipping-schema-backed-authoring",
    );

    expect(blog.route).toEqual({
      kind: "page",
      slug: "blog",
    });
    expect(blog.page).toMatchObject({
      id: "rec_site_content_blog",
      type: "page",
    });
    expect(post.route).toEqual({
      kind: "post",
      slug: "blog/shipping-schema-backed-authoring",
    });
    expect(post.page).toMatchObject({
      id: "rec_site_content_post_shipped_schema",
      type: "post",
    });
  });

  it("returns 404 for a missing site page href", async () => {
    await resetSchemaApp("site");
    useSchemaApp("site");
    const response = await harness.fetch(apiPath("/api/tree/missing-page"));
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe(PUBLIC_SITE_TREE_CACHE_CONTROL);
    expect(
      (await response.json()) as {
        error: string;
      },
    ).toEqual({
      error: "Site page not found.",
    });
  });
  it("rejects page tree requests for non-site schema keys", async () => {
    const response = await harness.fetch(apiPath("/api/tree/home"));
    expect(response.status).toBe(400);
    expect(
      (await response.json()) as {
        error: string;
      },
    ).toEqual({
      error: 'Package app "tasks" does not declare public Site runtime support.',
    });
  });

  it("rejects public tree reads for public Site packages without a Worker adapter", async () => {
    const sourceSchemaHash = await computeSourceSchemaHash(siteSourceSchema);
    const privateHarness = await createWorkerHarness(
      "src/worker/index.ts",
      {
        FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
      },
      {
        bindings: {
          FORMLESS_ADMIN_TOKEN: "test-admin-token",
          [FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME]: formatRuntimeWorkspaceAppPackages([
            {
              manifest: privatePublicSitePackageManifest(sourceSchemaHash),
              sourceSchema: siteSourceSchema,
              seedRecords: siteSeedRecords,
            },
          ]),
        },
      },
    );

    try {
      const created = await privateHarness.fetch("/api/formless/app-installs", {
        body: JSON.stringify({
          packageAppKey: "private-site",
          installId: "private-site",
          label: "Private Site",
        }),
        headers: {
          Authorization: "Bearer test-admin-token",
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const response = await privateHarness.fetch(
        "/api/app-installs/private-site/private-site/tree/home",
      );
      expect(created.status).toBe(201);
      expect(response.status).toBe(400);
      expect(
        (await response.json()) as {
          error: string;
        },
      ).toEqual({
        error:
          'Package app "private-site" declares public Site runtime support, but no public Site Worker adapter is registered.',
      });
    } finally {
      await privateHarness.dispose();
    }
  });

  it("returns source seed changes when sync initializes fresh storage", async () => {
    const body = await getJson<SyncResponse>("/api/sync?after=0");

    expect(body.cursor).toBe(taskSeedRecords.length);
    expect(body.changes.map((change) => change.writeId)).toEqual(
      taskSourceSeedRecords.map((record) => `seed-task:${record.id}`),
    );
    expect(body.changes.map((change) => change.payload)).toEqual(taskSourceSeedRecords);
  });

  it("rejects unknown schema keys and old unkeyed API paths", async () => {
    await expectNotFound("/api/missing/bootstrap");
    await expectNotFound("/api/rates/bootstrap");
    await expectNotFound("/api/bootstrap");
    await expectNotFound("/api/schema");
    await expectNotFound("/api/dev/reset");
  });

  it("isolates records and write replay by schema key", async () => {
    const task = await postCreateOperation("write-shared", { title: "First", done: false });

    await resetSchemaApp("crm");
    useSchemaApp("crm");
    const contact = await postCreateOperationForEntity("write-shared", "contact", {
      label: "Designer",
    });
    const crmBootstrap = await getJson<BootstrapResponse>("/api/bootstrap");

    useSchemaApp("tasks");
    const tasksBootstrap = await getJson<BootstrapResponse>("/api/bootstrap");

    expect(task.writeIdentity).toBe(operationWriteId("task", "create", "write-shared"));
    expect(contact.writeIdentity).toBe(operationWriteId("contact", "create", "write-shared"));
    expect(tasksBootstrap.schema).toEqual(appSchema);
    expect(tasksBootstrap.records).toEqual([...taskSeedRecords, task.record]);
    expect(crmBootstrap.schema).toEqual(crmSourceSchema);
    expect(crmBootstrap.records).toContainEqual(contact.record);
    expect(crmBootstrap.records.every((record) => record.entity !== "task")).toBe(true);
  });
  it("returns query, item view, and collection definitions from bootstrap", async () => {
    const body = await getJson<BootstrapResponse>("/api/bootstrap");
    expect(body.schema.queries.map(({ key }) => key).sort()).toEqual([
      "taskActive",
      "taskAll",
      "taskCompleted",
      "taskOverdue",
    ]);
    expect(body.schema.queries.find((definition) => definition.key === "taskOverdue")!).toEqual(
      appSchema.queries.find((definition) => definition.key === "taskOverdue")!,
    );
    expect(body.schema.itemViews.find((definition) => definition.key === "taskListItem")!).toEqual(
      appSchema.itemViews.find((definition) => definition.key === "taskListItem")!,
    );
    expect(body.schema.views.find((definition) => definition.key === "taskHome")!).toEqual(
      appSchema.views.find((definition) => definition.key === "taskHome")!,
    );
  });
  it("returns the active schema and metadata from the schema route", async () => {
    const body = await getJson<SchemaResponse>("/api/schema");
    expect(body.schema).toEqual(appSchema);
    expect(body.updatedAt).toEqual(expect.any(String));
  });

  it("persists compatible schema updates and returns them from bootstrap", async () => {
    const nextSchema = {
      ...appSchema,
      entities: appSchema.entities.map((entity) =>
        entity.key === "task"
          ? {
              ...entity,
              label: "Planner task",
              fields: [...entity.fields, { key: "notes", type: "text" as const, required: false }],
            }
          : entity,
      ),
    } as unknown as AppSchema;
    const update = await postJson<SchemaUpdateResponse>("/api/schema", { schema: nextSchema });
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");

    expect(update.schema).toEqual(nextSchema);
    expect(update.updatedAt).toEqual(expect.any(String));
    expect(schemaResponse.schema).toEqual(nextSchema);
    expect(schemaResponse.updatedAt).toBe(update.updatedAt);
    expect(bootstrap.schema).toEqual(nextSchema);
    expect(bootstrap.schemaUpdatedAt).toBe(update.updatedAt);
    expect(update.schema.screens).toEqual(appSchema.screens);
  });

  it("resets only the schema to the source schema while preserving records and cursor", async () => {
    const created = await postCreateOperation("write-reset-schema-record", {
      title: "Keep me",
      done: false,
    });
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskLabel("Planner task"),
    });
    const beforeReset = await getJson<BootstrapResponse>("/api/bootstrap");
    const reset = await postJson<BootstrapResponse>("/api/reset/schema", {});
    expect(beforeReset.schema.entities.find((definition) => definition.key === "task")?.label).toBe(
      "Planner task",
    );
    expect(reset.schema).toEqual(appSchema);
    expect(reset.schema.screens).toEqual(appSchema.screens);
    expect(reset.records).toEqual([...taskSeedRecords, created.record]);
    expect(reset.cursor).toBe(beforeReset.cursor);
  });

  it("resets source schema after a source field removal and prunes stored values", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskNotesField(),
    });
    const created = await postCreateOperation("write-task-with-retired-field", {
      title: "Has retired field",
      notes: "Remove this when the source schema resets.",
    });

    const reset = await postJson<BootstrapResponse>("/api/reset/schema", {});
    const resetRecord = reset.records.find((record) => record.id === created.record.id);
    const sync = await getJson<SyncResponse>(`/api/sync?after=${created.cursor}`);
    expect(reset.schema).toEqual(appSchema);
    expect(
      reset.schema.entities.find((definition) => definition.key === "task")!.fields,
    ).not.toHaveProperty("notes");
    expect(resetRecord?.values).toEqual({
      title: "Has retired field",
      done: false,
      priority: "normal",
    });
    expect(reset.cursor).toBe(created.cursor + 1);
    expect(sync.changes).toEqual([
      expect.objectContaining({
        operationKind: "update",
        entity: "task",
        recordId: created.record.id,
        payload: expect.objectContaining({
          values: resetRecord?.values,
        }),
      }),
    ]);
  });

  it("removes retired estimate values when resetting source schema", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithEstimateNumber({ min: -10 }),
    });
    const created = await postCreateOperation("write-negative-estimate", {
      title: "Negative",
      estimate: -1,
    });
    const reset = await postJson<BootstrapResponse>("/api/reset/schema", {});
    const resetRecord = reset.records.find((record) => record.id === created.record.id);
    expect(reset.schema).toEqual(appSchema);
    expect(
      reset.schema.entities.find((definition) => definition.key === "task")!.fields,
    ).not.toHaveProperty("estimate");
    expect(resetRecord?.values).toEqual({
      title: "Negative",
      done: false,
      priority: "normal",
    });
  });

  it("resets seed data to source schema, records, and seeded changes", async () => {
    await postCreateOperation("write-before-seed-reset", { title: "Temporary", done: false });

    const reset = await postJson<BootstrapResponse>("/api/reset/seed", {});
    const sync = await getJson<SyncResponse>("/api/sync?after=0");

    expect(reset).toEqual({
      schema: appSchema,
      schemaProvenance: taskSchemaProvenance(),
      schemaUpdatedAt: expect.any(String),
      records: taskSeedRecords,
      cursor: taskSeedRecords.length,
    });
    expect(sync.cursor).toBe(taskSeedRecords.length);
    expect(sync.changes).toHaveLength(taskSeedRecords.length);
    expect(sync.changes.map((change) => change.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(sync.changes.map((change) => change.writeId)).toEqual(
      taskSourceSeedRecords.map((record) => `seed-task:${record.id}`),
    );
    expect(sync.changes.map((change) => change.operationKind)).toEqual(
      taskSourceSeedRecords.map(() => "create"),
    );
    expect(sync.changes.map((change) => change.payload)).toEqual(taskSourceSeedRecords);
  });

  it("resets seed data for one schema key without touching another", async () => {
    const task = await postCreateOperation("write-task-before-rate-reset", {
      title: "Route local",
      done: false,
    });

    await resetSchemaApp("crm");
    useSchemaApp("crm");
    await postCreateOperationForEntity("write-crm-local-contact", "contact", {
      label: "Temporary contact",
    });
    const crmReset = await postJson<BootstrapResponse>("/api/reset/seed", {});

    useSchemaApp("tasks");
    const tasksBootstrap = await getJson<BootstrapResponse>("/api/bootstrap");

    expect(crmReset.records).toEqual(crmSeedRecords);
    expect(crmReset.cursor).toBe(crmSeedRecords.length);
    expect(tasksBootstrap.records).toEqual([...taskSeedRecords, task.record]);
  });

  it("exports authority storage snapshots by storage identity and schema key", async () => {
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const created = await postCreateOperation("write-snapshot-export-task", {
      title: "Snapshot export",
      done: false,
    });

    const snapshot = await getJson<StorageSnapshot>("/api/snapshot");

    expect(snapshot).toMatchObject({
      kind: STORAGE_SNAPSHOT_KIND,
      version: STORAGE_SNAPSHOT_VERSION,
      storageIdentity: "tasks",
      schemaKey: "tasks",
      exportedAt: expect.any(String),
      schemaUpdatedAt: schemaResponse.updatedAt,
      sourceCursor: created.cursor,
      schema: appSchema,
    });
    expect(snapshot.records).toEqual(
      formatStoredRecordsForArtifact(appSchema, [...taskSeedRecords, created.record]),
    );

    await resetSchemaApp("crm");
    useSchemaApp("crm");
    const crmSnapshot = await getJson<StorageSnapshot>("/api/snapshot");

    expect(crmSnapshot.storageIdentity).toBe("crm");
    expect(crmSnapshot.schemaKey).toBe("crm");
    expect(crmSnapshot.schema).toEqual(crmSourceSchema);
    expect(crmSnapshot.records).toEqual(crmSeedRecords);
    expect(crmSnapshot.records.some((record) => record.id === created.record.id)).toBe(false);
  });

  it("keeps manual Site snapshots separate from source seed reset", async () => {
    await resetSchemaApp("site");
    useSchemaApp("site");
    const created = await postCreateOperationForEntity("write-site-manual-snapshot", "block", {
      type: "page",
      label: "Temporary preview page",
      href: "/temporary-preview-page",
    });

    const snapshot = await getJson<StorageSnapshot>("/api/snapshot");

    expect(snapshot.storageIdentity).toBe("site");
    expect(snapshot.schemaKey).toBe("site");
    expect(snapshot.schema).toEqual(siteSourceSchema);
    expectRecordsIgnoringOrder(snapshot.records, [...siteSeedRecords, created.record]);
    expect(siteSeedRecords.some((record) => record.id === created.record.id)).toBe(false);

    const reset = await postJson<BootstrapResponse>("/api/reset/seed", {});

    expectRecordsIgnoringOrder(reset.records, siteSeedRecords);
    expect(reset.cursor).toBe(siteSeedRecords.length);
    expect(reset.records.some((record) => record.id === created.record.id)).toBe(false);
  });

  it("restores snapshots and broadcasts committed restore writes", async () => {
    const before = await getJson<BootstrapResponse>("/api/bootstrap");
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const restoredRecord = taskSnapshotRecord("snapshot-task-restored", "Restored task");
    await resetSchemaApp("crm");
    const taskSocket = await openSyncSocket("/api/sync/ws", "tasks");
    const crmSocket = await openSyncSocket("/api/sync/ws", "crm");
    let crmCapture: ReturnType<typeof captureSyncSocketMessages> | undefined;

    try {
      await primeSyncSocket(taskSocket, before.cursor, schemaResponse.updatedAt);

      useSchemaApp("crm");
      const crmSchema = await getJson<SchemaResponse>("/api/schema");
      await primeSyncSocket(crmSocket, crmSeedRecords.length, crmSchema.updatedAt);
      crmCapture = captureSyncSocketMessages(crmSocket);

      useSchemaApp("tasks");
      const message = readSyncSocketMessage(taskSocket);
      const restored = await postJson<BootstrapResponse>(
        "/api/snapshot/restore",
        storageSnapshot({
          schemaUpdatedAt: schemaResponse.updatedAt,
          sourceCursor: before.cursor,
          records: [...before.records, restoredRecord],
        }),
      );

      expect(restored.records).toEqual([...before.records, restoredRecord]);
      expect(restored.cursor).toBe(before.cursor + 1);
      expect(restored.schemaUpdatedAt).not.toBe(schemaResponse.updatedAt);
      await expect(message).resolves.toEqual({
        type: "sync",
        payload: {
          changes: [
            expect.objectContaining({
              writeId: `snapshot-restore:${restored.schemaUpdatedAt}`,
              operationKind: "command",
              entity: "task",
              recordId: restoredRecord.id,
              payload: restoredRecord,
              createdAt: restored.schemaUpdatedAt,
            }),
          ],
          cursor: restored.cursor,
          schema: restored.schema,
          schemaProvenance: restored.schemaProvenance,
          schemaUpdatedAt: restored.schemaUpdatedAt,
        },
      });
      await expectNoCapturedMessages(crmCapture);
    } finally {
      crmCapture?.stop();
      taskSocket.close();
      crmSocket.close();
    }
  });

  it("rejects invalid restore snapshots without committing or broadcasting", async () => {
    const before = await getJson<BootstrapResponse>("/api/bootstrap");
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const socket = await openSyncSocket();

    try {
      await primeSyncSocket(socket, before.cursor, schemaResponse.updatedAt);

      const capture = captureSyncSocketMessages(socket);
      await expectError(
        "/api/snapshot/restore",
        storageSnapshot({ storageIdentity: "app:work" }),
        'Storage snapshot storageIdentity must be "tasks".',
      );
      await expectNoCapturedMessages(capture);
      capture.stop();
    } finally {
      socket.close();
    }

    await expect(getJson<BootstrapResponse>("/api/bootstrap")).resolves.toEqual(before);
  });

  it("creates Site tree child blocks with placement edges and removes only the placement", async () => {
    await resetSchemaApp("site");
    useSchemaApp("site");
    const parent = await postCreateOperationForEntity("write-site-tree-test-parent", "block", {
      type: "page",
      label: "Tree test parent",
      href: "/tree-test-parent",
    });

    const input = {
      input: {
        parentRecordId: parent.record.id,
        childValues: {
          type: "image",
          label: "Primary image",
          href: "https://cdn.example.com/primary.webp",
        },
        placementValues: {
          slot: "primaryImage",
        },
      },
    };
    const added = await postCommandOperationForEntity(
      "command-site-tree-add-child",
      "block-placement",
      "addTreeChild",
      input,
    );
    const replay = await postCommandOperationForEntity(
      "command-site-tree-add-child",
      "block-placement",
      "addTreeChild",
      input,
    );
    const child = added.changes.find((change) => change.payload.entity === "block")?.payload;
    const placement = added.changes.find(
      (change) => change.payload.entity === "block-placement",
    )?.payload;

    if (!child || !placement) {
      throw new Error("Site tree child command did not create both records.");
    }

    expect(added.changes).toHaveLength(2);
    expect(added.changes.every((change) => change.operationKind === "command")).toBe(true);
    expect(child.values).toEqual({
      type: "image",
      label: "Primary image",
      href: "https://cdn.example.com/primary.webp",
    });
    expect(placement.values).toEqual({
      parent: parent.record.id,
      block: child.id,
      order: 1000,
      slot: "primaryImage",
    });
    expect(replay).toEqual(added);

    const removed = await postCommandOperationForEntity(
      "command-site-tree-remove-placement",
      "block-placement",
      "removeTreePlacement",
      { input: { placementId: placement.id } },
    );
    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");
    const storedChild = bootstrap.records.find((record) => record.id === child.id);
    const storedPlacement = bootstrap.records.find((record) => record.id === placement.id);

    expect(removed.changes).toHaveLength(1);
    expect(removed.changes[0]?.payload).toMatchObject({
      id: placement.id,
      entity: "block-placement",
      deletedAt: expect.any(String),
    });
    expect(storedChild).toMatchObject({
      id: child.id,
      entity: "block",
      values: child.values,
    });
    expect(storedChild).not.toHaveProperty("deletedAt");
    expect(storedPlacement).toMatchObject({
      id: placement.id,
      entity: "block-placement",
      deletedAt: expect.any(String),
    });
  });
  it("rejects incompatible schema changes", async () => {
    await postCreateOperation("write-1", { title: "First", done: false });
    const nextSchema = {
      version: 1,
      entities: [
        {
          key: "task",
          label: "Task",
          fields: [{ key: "done", type: "boolean", required: true, default: false }],
          operations: taskOperations("Task", [{ key: "done" }]),
        },
      ],
      queries: [
        {
          key: "taskAll",
          label: "All",
          entity: "task",
          expression: { kind: "all" },
        },
      ],
      itemViews: [
        {
          key: "taskListItem",
          entity: "task",
          fields: [{ field: "done", editor: "boolean", commit: "immediate" }],
        },
      ],
      tableViews: [],
      views: [
        {
          key: "taskHome",
          type: "collection",
          label: "Tasks",
          entity: "task",
          queries: [{ query: "taskAll" }],
          defaultQuery: "taskAll",
          result: { type: "list", itemView: "taskListItem" },
        },
        {
          key: "taskCreate",
          type: "create",
          entity: "task",
          fields: [{ field: "done", editor: "boolean" }],
        },
      ],
      screens: defaultScreens(),
    } as unknown as AppSchema;
    await expectError("/api/schema", { schema: nextSchema }, "Cannot remove or rename field");
  });
  it("returns changes after a known sync cursor", async () => {
    await postCreateOperation("write-1", { title: "First", done: false });
    const second = await postCreateOperation("write-2", { title: "Second", done: true });

    const body = await getJson<SyncResponse>(`/api/sync?after=${taskSeedRecords.length + 1}`);

    expect(body.cursor).toBe(taskSeedRecords.length + 2);
    expect(body.changes).toHaveLength(1);
    expect(body.changes[0]).toMatchObject({
      writeId: second.writeIdentity,
      recordId: second.record.id,
      payload: second.record,
    });
  });

  it("omits schema from sync when the client schema timestamp is current", async () => {
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const body = await getJson<SyncResponse>(
      `/api/sync?after=0&schemaUpdatedAt=${encodeURIComponent(schemaResponse.updatedAt)}`,
    );

    expect(body.schema).toBeUndefined();
    expect(body.schemaUpdatedAt).toBeUndefined();
  });

  it("returns schema from sync when the client schema timestamp is missing or stale", async () => {
    const missing = await getJson<SyncResponse>("/api/sync?after=0");
    const stale = await getJson<SyncResponse>(
      "/api/sync?after=0&schemaUpdatedAt=2026-04-27T00%3A00%3A00.000Z",
    );

    expect(missing.schema).toEqual(appSchema);
    expect(missing.schemaUpdatedAt).toEqual(expect.any(String));
    expect(stale.schema).toEqual(appSchema);
    expect(stale.schemaUpdatedAt).toBe(missing.schemaUpdatedAt);
  });

  it("accepts keyed hibernatable sync WebSocket upgrades", async () => {
    const tasksSocket = await openSyncSocket("/api/sync/ws", "tasks");
    const ratesSocket = await openSyncSocket("/api/sync/ws", "crm");

    tasksSocket.close();
    ratesSocket.close();
  });

  it("rejects missing schema keys, non-upgrade requests, and non-GET sync WebSocket requests", async () => {
    await expectNotFound("/api/missing/sync/ws");

    const missingUpgrade = await harness.fetch(apiPath("/api/sync/ws"));
    const wrongMethod = await harness.fetch(apiPath("/api/sync/ws"), {
      method: "POST",
    });

    expect(missingUpgrade.status).toBe(426);
    expect(wrongMethod.status).toBe(405);
  });

  it("sends the same stale cursor changes over the sync WebSocket as HTTP sync", async () => {
    await postCreateOperation("write-1", { title: "First", done: false });
    await postCreateOperation("write-2", { title: "Second", done: true });
    const cursor = taskSeedRecords.length + 1;
    const httpSync = await getJson<SyncResponse>(`/api/sync?after=${cursor}`);
    const socket = await openSyncSocket();

    socket.send(
      JSON.stringify({
        type: "hello",
        cursor,
        schemaUpdatedAt: null,
      }),
    );
    const message = await readSyncSocketMessage(socket);

    expect(message).toEqual({
      type: "sync",
      payload: httpSync,
    });

    socket.close();
  });

  it("returns delete catch-up rows over HTTP and WebSocket while omitting current schema", async () => {
    const schemaUpdate = await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskDeleteOperation(),
    });
    const created = await postCreateOperation("write-sync-delete-catchup-source", {
      title: "Delete catch-up source",
      done: false,
    });
    const deleted = await postRecordOperationRequest({
      idempotencyKey: "write-sync-delete-catchup",
      entity: "task",
      operationName: "delete",
      recordId: created.record.id,
    });
    const httpSync = await getJson<SyncResponse>(
      `/api/sync?after=${created.cursor}&schemaUpdatedAt=${encodeURIComponent(schemaUpdate.updatedAt)}`,
    );
    const socket = await openSyncSocket();
    try {
      expect(httpSync).toEqual({
        changes: deleted.changes,
        cursor: deleted.cursor,
      });
      expect(httpSync.changes).toEqual([
        {
          seq: deleted.cursor,
          writeId: deleted.writeIdentity,
          operationKind: "delete",
          entity: "task",
          recordId: created.record.id,
          payload: {
            ...created.record,
            deletedAt: expect.any(String),
            updatedAt: deleted.record.deletedAt,
          },
          createdAt: expect.any(String),
        },
      ]);

      socket.send(
        JSON.stringify({
          type: "hello",
          cursor: created.cursor,
          schemaUpdatedAt: schemaUpdate.updatedAt,
        }),
      );

      await expect(readSyncSocketMessage(socket)).resolves.toEqual({
        type: "sync",
        payload: httpSync,
      });
    } finally {
      socket.close();
    }
  });

  it("omits schema from sync WebSocket messages when the client schema timestamp is current", async () => {
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const socket = await openSyncSocket();

    socket.send(
      JSON.stringify({
        type: "hello",
        cursor: 0,
        schemaUpdatedAt: schemaResponse.updatedAt,
      }),
    );
    const message = await readSyncSocketMessage(socket);

    expect(message.type).toBe("sync");
    if (message.type === "sync") {
      expect(message.payload.schema).toBeUndefined();
      expect(message.payload.schemaUpdatedAt).toBeUndefined();
      expect(message.payload.changes.map((change) => change.payload)).toEqual(
        taskSourceSeedRecords,
      );
    }

    socket.close();
  });

  it("sends an error and closes malformed sync WebSocket clients", async () => {
    const socket = await openSyncSocket();

    socket.send("not-json");
    const message = await readSyncSocketMessage(socket);

    expect(message).toEqual({
      type: "error",
      message: "Malformed sync socket message.",
    });
  });

  it("does not broadcast read-only HTTP operations to sync WebSocket clients", async () => {
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const taskSocket = await openSyncSocket("/api/sync/ws", "tasks");

    try {
      await primeSyncSocket(taskSocket, taskSeedRecords.length, schemaResponse.updatedAt);

      const capture = captureSyncSocketMessages(taskSocket);
      try {
        await getJson<BootstrapResponse>("/api/bootstrap");
        await getJson<SchemaResponse>("/api/schema");
        await getJson<StorageSnapshot>("/api/snapshot");
        await getJson<SyncResponse>(
          `/api/sync?after=${taskSeedRecords.length}&schemaUpdatedAt=${encodeURIComponent(schemaResponse.updatedAt)}`,
        );
        await expectNoCapturedMessages(capture);
      } finally {
        capture.stop();
      }
    } finally {
      taskSocket.close();
    }

    await resetSchemaApp("site");
    useSchemaApp("site");
    const siteBootstrap = await getJson<BootstrapResponse>("/api/bootstrap");
    const siteSocket = await openSyncSocket("/api/sync/ws", "site");

    try {
      await primeSyncSocket(siteSocket, siteBootstrap.cursor, siteBootstrap.schemaUpdatedAt);

      const capture = captureSyncSocketMessages(siteSocket);
      try {
        await getJson<SitePageTreeResponse>("/api/tree/home");

        await expectNoCapturedMessages(capture);
      } finally {
        capture.stop();
      }
    } finally {
      siteSocket.close();
    }
  });

  it("keeps write responses protocol-shaped and no-store while outcome kind drives broadcasts", async () => {
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const socket = await openSyncSocket();

    try {
      await primeSyncSocket(socket, taskSeedRecords.length, schemaResponse.updatedAt);

      const write = {
        idempotencyKey: "write-authority-outcome-policy",
        entity: "task",
        operationName: "create",
        input: {
          title: "Authority outcome policy",
          done: false,
        },
      };
      const committedMessage = readSyncSocketMessage(socket);
      const committedRequest = recordOperationRequest(write);
      const committedResponse = await harness.fetch(apiPath(committedRequest.path), {
        body: JSON.stringify(committedRequest.body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const committed = committedRequest.response(await committedResponse.json());

      expect(committedResponse.status).toBe(200);
      expect(committedResponse.headers.get("Cache-Control")).toBe("no-store");
      expect(committed).not.toHaveProperty("kind");
      expect(committed).not.toHaveProperty("response");
      await expect(committedMessage).resolves.toEqual({
        type: "sync",
        payload: {
          changes: committed.changes,
          cursor: committed.cursor,
        },
      });

      const replayCapture = captureSyncSocketMessages(socket);
      const replayRequest = recordOperationRequest(write);
      const replayResponse = await harness.fetch(apiPath(replayRequest.path), {
        body: JSON.stringify(replayRequest.body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      expect(replayResponse.status).toBe(200);
      expect(replayResponse.headers.get("Cache-Control")).toBe("no-store");
      expect(replayRequest.response(await replayResponse.json())).toEqual(committed);
      await expectNoCapturedMessages(replayCapture);
      replayCapture.stop();

      const invalidCapture = captureSyncSocketMessages(socket);
      const invalidRequest = recordOperationRequest({
        idempotencyKey: "write-authority-invalid-no-broadcast",
        entity: "missing",
        operationName: "create",
        input: {},
      });
      const invalidResponse = await harness.fetch(apiPath(invalidRequest.path), {
        body: JSON.stringify(invalidRequest.body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      expect(invalidResponse.status).toBe(400);
      expect(invalidResponse.headers.get("Cache-Control")).toBe("no-store");
      expect(
        (await invalidResponse.json()) as {
          error: string;
        },
      ).toEqual({
        error: 'Unknown entity "missing".',
      });
      await expectNoCapturedMessages(invalidCapture);
      invalidCapture.stop();
    } finally {
      socket.close();
    }
  });

  it("broadcasts committed task creates to same-schema sync WebSockets only", async () => {
    await resetSchemaApp("crm");
    const taskSocketA = await openSyncSocket("/api/sync/ws", "tasks");
    const taskSocketB = await openSyncSocket("/api/sync/ws", "tasks");
    const crmSocket = await openSyncSocket("/api/sync/ws", "crm");
    let crmCapture: ReturnType<typeof captureSyncSocketMessages> | undefined;

    try {
      const taskSchema = await getJson<SchemaResponse>("/api/schema");
      await primeSyncSocket(taskSocketA, taskSeedRecords.length, taskSchema.updatedAt);
      await primeSyncSocket(taskSocketB, taskSeedRecords.length, taskSchema.updatedAt);

      useSchemaApp("crm");
      const crmSchema = await getJson<SchemaResponse>("/api/schema");
      await primeSyncSocket(crmSocket, crmSeedRecords.length, crmSchema.updatedAt);
      crmCapture = captureSyncSocketMessages(crmSocket);

      useSchemaApp("tasks");
      const messageA = readSyncSocketMessage(taskSocketA);
      const messageB = readSyncSocketMessage(taskSocketB);
      const created = await postCreateOperation("write-broadcast-create", {
        title: "Broadcast create",
        done: false,
      });

      await expect(messageA).resolves.toEqual({
        type: "sync",
        payload: {
          changes: created.changes,
          cursor: created.cursor,
        },
      });
      await expect(messageB).resolves.toEqual({
        type: "sync",
        payload: {
          changes: created.changes,
          cursor: created.cursor,
        },
      });
      await expectNoCapturedMessages(crmCapture);
    } finally {
      crmCapture?.stop();
      taskSocketA.close();
      taskSocketB.close();
      crmSocket.close();
    }
  });

  it("broadcasts committed patch writes, delete writes, and commands", async () => {
    const created = await postCreateOperation("write-broadcast-patch-source", {
      title: "Broadcast patch",
      done: false,
    });
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskAndProjectDeleteEnabled(),
    });
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const socket = await openSyncSocket();

    try {
      await primeSyncSocket(socket, created.cursor, schemaResponse.updatedAt);

      const patchMessage = readSyncSocketMessage(socket);
      const patched = await postRecordOperationRequest({
        idempotencyKey: "write-broadcast-patch",
        entity: "task",
        operationName: "update",
        recordId: created.record.id,
        input: { done: true },
      });

      await expect(patchMessage).resolves.toEqual({
        type: "sync",
        payload: {
          changes: patched.changes,
          cursor: patched.cursor,
        },
      });

      const deleteMessage = readSyncSocketMessage(socket);
      const deleted = await postRecordOperationRequest({
        idempotencyKey: "write-broadcast-delete",
        entity: "task",
        operationName: "delete",
        recordId: created.record.id,
      });

      await expect(deleteMessage).resolves.toEqual({
        type: "sync",
        payload: {
          changes: deleted.changes,
          cursor: deleted.cursor,
        },
      });

      const commandMessage = readSyncSocketMessage(socket);
      const command = await postCommandOperation("command-broadcast-clear", "clearCompletedTasks");

      await expect(commandMessage).resolves.toEqual({
        type: "sync",
        payload: {
          changes: command.changes,
          cursor: command.cursor,
        },
      });

      const noOpCommandMessage = readSyncSocketMessage(socket);
      const noOpCommand = await postCommandOperation(
        "command-broadcast-no-op-clear",
        "clearCompletedTasks",
      );

      await expect(noOpCommandMessage).resolves.toEqual({
        type: "sync",
        payload: {
          changes: noOpCommand.changes,
          cursor: noOpCommand.cursor,
        },
      });
    } finally {
      socket.close();
    }
  });

  it("broadcasts schema-only sync messages after schema writes", async () => {
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const socket = await openSyncSocket();

    try {
      await primeSyncSocket(socket, taskSeedRecords.length, schemaResponse.updatedAt);

      const schemaMessage = readSyncSocketMessage(socket);
      const update = await postJson<SchemaUpdateResponse>("/api/schema", {
        schema: schemaWithTaskLabel("Planner task"),
      });

      await expect(schemaMessage).resolves.toEqual({
        type: "sync",
        payload: {
          changes: [],
          cursor: taskSeedRecords.length,
          schema: update.schema,
          schemaUpdatedAt: update.updatedAt,
        },
      });
    } finally {
      socket.close();
    }
  });

  it("broadcasts reset schema and reset seed after committed reset writes", async () => {
    const schemaUpdate = await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskLabel("Planner task"),
    });
    const schemaSocket = await openSyncSocket();

    try {
      await primeSyncSocket(schemaSocket, taskSeedRecords.length, schemaUpdate.updatedAt);

      const schemaMessage = readSyncSocketMessage(schemaSocket);
      const schemaReset = await postJson<BootstrapResponse>("/api/reset/schema", {});

      await expect(schemaMessage).resolves.toEqual({
        type: "sync",
        payload: {
          changes: [],
          cursor: schemaReset.cursor,
          schema: schemaReset.schema,
          schemaProvenance: schemaReset.schemaProvenance,
          schemaUpdatedAt: schemaReset.schemaUpdatedAt,
        },
      });
    } finally {
      schemaSocket.close();
    }

    const created = await postCreateOperation("write-before-broadcast-seed-reset", {
      title: "Temporary",
      done: false,
    });
    const seedSchema = await getJson<SchemaResponse>("/api/schema");
    const seedSocket = await openSyncSocket();

    try {
      await primeSyncSocket(seedSocket, created.cursor, seedSchema.updatedAt);

      const seedMessage = readSyncSocketMessage(seedSocket);
      const seedReset = await postJson<BootstrapResponse>("/api/reset/seed", {});

      await expect(seedMessage).resolves.toEqual({
        type: "sync",
        payload: {
          changes: [],
          cursor: seedReset.cursor,
          schema: seedReset.schema,
          schemaProvenance: seedReset.schemaProvenance,
          schemaUpdatedAt: seedReset.schemaUpdatedAt,
        },
      });
    } finally {
      seedSocket.close();
    }
  });
  it("does not broadcast failed write validation, constraint failures, or write replay", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskConstraints([
        { kind: "unique", fields: ["title"], key: "uniqueTitle" },
      ]),
    });
    const existing = await postCreateOperation("write-constraint-source", {
      title: "Constraint source",
      done: false,
    });
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const socket = await openSyncSocket();

    try {
      await primeSyncSocket(socket, existing.cursor, schemaResponse.updatedAt);

      const invalidCapture = captureSyncSocketMessages(socket);
      const invalidRequest = recordOperationRequest({
        idempotencyKey: "write-invalid-no-broadcast",
        entity: "task",
        operationName: "create",
        input: { title: "   " },
      });
      const invalid = await harness.fetch(apiPath(invalidRequest.path), {
        body: JSON.stringify(invalidRequest.body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      expect(invalid.status).toBe(400);
      await expectNoCapturedMessages(invalidCapture);
      invalidCapture.stop();

      const constraintCapture = captureSyncSocketMessages(socket);
      const constraintRequest = recordOperationRequest({
        idempotencyKey: "write-constraint-no-broadcast",
        entity: "task",
        operationName: "create",
        input: { title: "Constraint source", done: false },
      });
      const constraintFailure = await harness.fetch(apiPath(constraintRequest.path), {
        body: JSON.stringify(constraintRequest.body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      expect(constraintFailure.status).toBe(400);
      expect(
        (await constraintFailure.json()) as {
          error: string;
        },
      ).toEqual({
        error: 'Unique constraint "task.uniqueTitle" would be violated.',
      });
      await expectNoCapturedMessages(constraintCapture);
      constraintCapture.stop();

      const createMessage = readSyncSocketMessage(socket);
      const write = {
        idempotencyKey: "write-replay-no-broadcast",
        entity: "task",
        operationName: "create",
        input: { title: "Replay check", done: false },
      };
      const created = await postRecordOperationRequest(write);

      await expect(createMessage).resolves.toEqual({
        type: "sync",
        payload: {
          changes: created.changes,
          cursor: created.cursor,
        },
      });

      const replayCapture = captureSyncSocketMessages(socket);
      const replay = await postRecordOperationRequest(write);
      const sync = await getJson<SyncResponse>(`/api/sync?after=${existing.cursor}`);

      expect(replay).toEqual(created);
      expect(sync.changes).toEqual(created.changes);
      await expectNoCapturedMessages(replayCapture);
      replayCapture.stop();
    } finally {
      socket.close();
    }
  });

  it("does not broadcast command replay", async () => {
    const completed = await postCreateOperation("write-command-replay-source", {
      title: "Command replay source",
      done: true,
    });
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const socket = await openSyncSocket();

    try {
      await primeSyncSocket(socket, completed.cursor, schemaResponse.updatedAt);

      const commandMessage = readSyncSocketMessage(socket);
      const command = await postCommandOperation(
        "command-replay-no-broadcast",
        "clearCompletedTasks",
      );

      await expect(commandMessage).resolves.toEqual({
        type: "sync",
        payload: {
          changes: command.changes,
          cursor: command.cursor,
        },
      });

      const replayCapture = captureSyncSocketMessages(socket);
      const replay = await postCommandOperation(
        "command-replay-no-broadcast",
        "clearCompletedTasks",
      );
      const sync = await getJson<SyncResponse>(`/api/sync?after=${completed.cursor}`);

      expect(replay).toEqual(command);
      expect(sync.changes.filter((change) => change.writeId === command.writeIdentity)).toEqual(
        command.changes,
      );
      await expectNoCapturedMessages(replayCapture);
      replayCapture.stop();
    } finally {
      socket.close();
    }
  });

  it("does not broadcast failed schema or command operation validation", async () => {
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const socket = await openSyncSocket();

    try {
      await primeSyncSocket(socket, taskSeedRecords.length, schemaResponse.updatedAt);

      const schemaCapture = captureSyncSocketMessages(socket);
      const invalidSchema = await harness.fetch(apiPath("/api/schema"), {
        body: JSON.stringify({
          schema: {
            version: 1,
            entities: [
              {
                key: "task",
                label: "Task",
                fields: [{ key: "title", type: "text", required: true, label: "" }],
              },
            ],
            queries: [],
            itemViews: [],
            tableViews: [],
            views: [],
          },
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      expect(invalidSchema.status).toBe(400);
      await expectNoCapturedMessages(schemaCapture);
      schemaCapture.stop();

      const commandCapture = captureSyncSocketMessages(socket);
      const invalidCommandRequest = commandOperationRequest({
        idempotencyKey: "command-invalid-no-broadcast",
        entity: "task",
        operationName: "missing",
      });
      const invalidCommand = await harness.fetch(apiPath(invalidCommandRequest.path), {
        body: JSON.stringify(invalidCommandRequest.body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      expect(invalidCommand.status).toBe(400);
      await expectNoCapturedMessages(commandCapture);
      commandCapture.stop();
    } finally {
      socket.close();
    }
  });

  it("rejects invalid sync cursors", async () => {
    await expectError("/api/sync?after=bad", undefined, "Sync cursor must be");
  });

  it("restores app identity references through the control-plane resolver", async () => {
    const privateHarness = await createIdentityReferenceHarness();

    try {
      await resetTestIdentityStorage(privateHarness, adminToken);

      const principal = await createIdentityPrincipal(
        privateHarness,
        "restore-app-ref-principal",
        "Restore Principal",
      );
      const organization = await createIdentityOrganization(
        privateHarness,
        "restore-app-ref-organization",
        "Restore Organization",
      );
      const group = await createIdentityGroup(
        privateHarness,
        "restore-app-ref-group",
        "Restore Group",
      );
      const schema = schemaWithIdentityReferenceAccount();
      const account = identityReferenceAccountSnapshotRecord({
        ownerPrincipal: principal.id,
        organization: organization.id,
        group: group.id,
      });
      const restored = await postPrivateJson<BootstrapResponse>(
        privateHarness,
        "/api/snapshot/restore",
        storageSnapshot({ schema, records: [account] }),
      );

      expect(restored.records).toContainEqual(account);
    } finally {
      await privateHarness.dispose();
    }
  });

  it("patches an existing record and returns patch changes from sync", async () => {
    const created = await postCreateOperation("write-1", { title: "First", done: false });
    const patched = await postRecordOperationRequest({
      idempotencyKey: "write-2",
      entity: "task",
      operationName: "update",
      recordId: created.record.id,
      input: { done: true, dueDate: "2026-05-01" },
    });
    const sync = await getJson<SyncResponse>(`/api/sync?after=${taskSeedRecords.length + 1}`);

    expect(patched.record.values).toEqual({
      title: "First",
      done: true,
      dueDate: "2026-05-01",
      priority: "normal",
    });
    expect(sync.changes).toHaveLength(1);
    expect(sync.changes[0]).toMatchObject({
      writeId: patched.writeIdentity,
      operationKind: "update",
      recordId: created.record.id,
      payload: patched.record,
    });
  });

  it("commits enabled generic delete writes as tombstone changes", async () => {
    const created = await postCreateOperation("write-1", { title: "First", done: false });
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskDeleteOperation(),
    });

    const deleted = await postRecordOperationRequest({
      idempotencyKey: "write-delete-ready",
      entity: "task",
      operationName: "delete",
      recordId: created.record.id,
    });
    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");
    const sync = await getJson<SyncResponse>(`/api/sync?after=${created.cursor}`);

    expect(deleted).toMatchObject({
      record: {
        ...created.record,
        deletedAt: expect.any(String),
        updatedAt: deleted.record.deletedAt,
      },
      changes: [
        {
          writeId: deleted.writeIdentity,
          operationKind: "delete",
          entity: "task",
          recordId: created.record.id,
          payload: {
            ...created.record,
            deletedAt: expect.any(String),
            updatedAt: deleted.record.deletedAt,
          },
          createdAt: expect.any(String),
        },
      ],
      cursor: created.cursor + 1,
      writeIdentity: deleted.writeIdentity,
    });
    expect(bootstrap.records.find((record) => record.id === created.record.id)).toEqual(
      deleted.record,
    );
    expect(sync.changes).toEqual(deleted.changes);
  });

  it("replays delete write IDs without duplicating changes", async () => {
    const created = await postCreateOperation("write-delete-replay-source", {
      title: "First",
      done: false,
    });
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskDeleteOperation(),
    });

    const first = await postRecordOperationRequest({
      idempotencyKey: "write-replay-delete",
      entity: "task",
      operationName: "delete",
      recordId: created.record.id,
    });
    const replay = await postRecordOperationRequest({
      idempotencyKey: "write-replay-delete",
      entity: "task",
      operationName: "delete",
      recordId: "missing",
    });

    const sync = await getJson<SyncResponse>(`/api/sync?after=${created.cursor}`);

    expect(replay).toEqual(first);
    expect(sync.changes).toEqual(first.changes);
  });

  it("replays patch write IDs without duplicating changes", async () => {
    const created = await postCreateOperation("write-1", { title: "First", done: false });
    const body = {
      idempotencyKey: "write-2",
      entity: "task",
      operationName: "update",
      recordId: created.record.id,
      input: { title: "Second" },
    };

    const first = await postRecordOperationRequest(body);
    const replay = await postRecordOperationRequest(body);
    const sync = await getJson<SyncResponse>(`/api/sync?after=${taskSeedRecords.length}`);

    expect(replay).toEqual(first);
    expect(sync.changes).toHaveLength(2);
  });

  it("tombstones completed records through clearCompletedTasks", async () => {
    const seedCompleted = getSeedCompletedTask();
    const completed = await postCreateOperation("write-1", { title: "Done", done: true });
    const active = await postCreateOperation("write-2", { title: "Open", done: false });

    const command = await postCommandOperation("command-1", "clearCompletedTasks");
    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");
    const sync = await getJson<SyncResponse>(`/api/sync?after=${taskSeedRecords.length + 2}`);

    expect(command.writeIdentity).toBe(
      operationWriteId("task", "clearCompletedTasks", "command-1"),
    );
    expect(command.cursor).toBe(taskSeedRecords.length + 4);
    expect(command.changes).toHaveLength(2);
    expect(command.changes.map((change) => change.recordId).sort()).toEqual(
      [seedCompleted.id, completed.record.id].sort(),
    );
    expect(command.changes.every((change) => change.writeId === command.writeIdentity)).toBe(true);
    expect(command.changes.every((change) => change.operationKind === "command")).toBe(true);
    expect(bootstrap.records).toContainEqual(
      expect.objectContaining({ id: seedCompleted.id, deletedAt: expect.any(String) }),
    );
    expect(bootstrap.records).toContainEqual(
      expect.objectContaining({ id: completed.record.id, deletedAt: expect.any(String) }),
    );
    expect(bootstrap.records).toContainEqual(active.record);
    expect(sync.changes).toEqual(command.changes);
  });

  it("keeps create and update behavior on declared operations", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithViews(),
    });
    const created = await postRecordOperationRequest({
      idempotencyKey: "write-1",
      entity: "task",
      operationName: "create",
      input: { title: "First", done: false },
    });

    const patched = await postRecordOperationRequest({
      idempotencyKey: "write-2",
      entity: "task",
      operationName: "update",
      recordId: created.record.id,
      input: { title: "Second" },
    });

    expect(created.record.values.title).toBe("First");
    expect(patched.record.values.title).toBe("Second");
  });

  it("replays accepted operations after a compatible schema update", async () => {
    const created = await postCreateOperation("write-1", { title: "First", done: false });
    const patched = await postRecordOperationRequest({
      idempotencyKey: "write-2",
      entity: "task",
      operationName: "update",
      recordId: created.record.id,
      input: { title: "Second" },
    });

    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskLabel("Task backlog"),
    });

    await expect(postCreateOperation("write-1", { title: "First", done: false })).resolves.toEqual(
      created,
    );
    await expect(
      postRecordOperationRequest({
        idempotencyKey: "write-2",
        entity: "task",
        operationName: "update",
        recordId: created.record.id,
        input: { title: "Second" },
      }),
    ).resolves.toEqual(patched);
  });

  it("rejects bad JSON request bodies", async () => {
    const response = await harness.fetch(apiPath("/api/operations/task/create"), {
      body: "{",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Request body must be valid JSON." });
  });
});

function operationWriteId(entity: string, operation: string, idempotencyKey: string) {
  return `operation:${entity}.${operation}:${idempotencyKey}`;
}

function getSeedCompletedTask() {
  const completed = taskSeedRecords.find((record) => record.values.done === true);

  if (!completed) {
    throw new Error("Task seed records must include a completed task.");
  }

  return completed;
}

function storageSnapshot(overrides: Partial<StorageSnapshot> = {}): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: "tasks",
    schemaKey: "tasks",
    exportedAt: "2026-04-28T00:00:00.000Z",
    schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
    sourceCursor: taskSeedRecords.length,
    schema: appSchema,
    records: taskSeedRecords,
    ...overrides,
  };
}

function siteStorageSnapshot(overrides: Partial<StorageSnapshot> = {}): StorageSnapshot {
  return storageSnapshot({
    storageIdentity: "site",
    schemaKey: "site",
    sourceCursor: testSiteSeedRecords.length,
    schema: siteSourceSchema,
    records: testSiteSeedRecords,
    ...overrides,
  });
}

function siteRecordsWithHomeLabel(label: string): StoredRecord[] {
  return testSiteSeedRecords.map((record) =>
    record.id === "rec_site_content_home"
      ? {
          ...record,
          values: {
            ...record.values,
            label,
          },
        }
      : record,
  );
}

function taskSnapshotRecord(id: string, title: string): StoredRecord {
  return {
    id,
    entity: "task",
    values: { title, done: false },
    createdAt: "2026-05-07T00:10:00.000Z",
    updatedAt: "2026-05-07T00:10:00.000Z",
  };
}

function schemaWithTaskLabel(label: string) {
  return {
    ...appSchema,
    entities: appSchema.entities.map((entity) =>
      entity.key === "task" ? { ...entity, label } : entity,
    ),
  } as unknown as AppSchema;
}
function schemaWithTaskNotesField(): AppSchema {
  const task = appSchema.entities.find((definition) => definition.key === "task")!;
  const fields = [
    ...task.fields,
    { key: "notes", type: "text" as const, required: false, label: "Notes" },
  ];
  return {
    ...appSchema,
    entities: appSchema.entities.map((entity) =>
      entity.key === "task"
        ? {
            ...task,
            fields,
            operations: taskOperations(
              "Task",
              fields,
              commandOperationsFromSource(task.operations),
            ),
            key: "task",
          }
        : entity,
    ),
  };
}
function taskOperations(
  label: string,
  fields: readonly { key: string }[],
  commandOperations: NonNullable<AppSchema["entities"][number]["operations"]> = [],
  options: {
    delete?: boolean;
  } = {},
): NonNullable<AppSchema["entities"][number]["operations"]> {
  const input = {
    fields: fields.map(({ key }) => ({ key, field: key })),
  };
  return [
    {
      label: `Create ${label}`,
      kind: "create",
      scope: "collection",
      input,
      effect: { type: "createRecord" },
      output: { type: "create" },
      idempotency: { required: true },
      audit: { input: "summary" },
      key: "create",
    },
    {
      label: `Update ${label}`,
      kind: "update",
      scope: "record",
      input,
      effect: { type: "patchRecord" },
      output: { type: "update" },
      idempotency: { required: true },
      audit: { input: "summary" },
      key: "update",
    },
    ...(options.delete
      ? [
          {
            key: "delete",
            label: `Delete ${label}`,
            kind: "delete" as const,
            scope: "record" as const,
            effect: { type: "tombstoneRecord" as const },
            output: { type: "delete" as const },
            idempotency: { required: true },
            audit: { input: "summary" as const },
          },
        ]
      : []),
    ...commandOperations,
  ];
}
function commandOperationsFromSource(
  operations: AppSchema["entities"][number]["operations"] | undefined,
): NonNullable<AppSchema["entities"][number]["operations"]> {
  return (operations ?? []).filter((operation) => operation.kind === "command");
}
function schemaWithTaskAndProjectDeleteEnabled(): AppSchema {
  return {
    ...appSchema,
    entities: [
      {
        ...appSchema.entities.find((definition) => definition.key === "task")!,
        operations: taskOperations(
          "Task",
          appSchema.entities.find((definition) => definition.key === "task")!.fields,
          commandOperationsFromSource(
            appSchema.entities.find((definition) => definition.key === "task")!.operations,
          ),
          { delete: true },
        ),
        key: "task",
      },
      {
        key: "project",
        label: "Project",
        fields: [{ key: "name", type: "text", required: true }],
        operations: taskOperations("Project", [{ key: "name" }], undefined, { delete: true }),
      },
    ],
  } as unknown as AppSchema;
}
function schemaWithTaskDeleteOperation(): AppSchema {
  return {
    ...appSchema,
    entities: appSchema.entities.map((entity) =>
      entity.key === "task"
        ? {
            ...entity,
            operations: taskOperations(
              "Task",
              entity.fields,
              commandOperationsFromSource(entity.operations),
              { delete: true },
            ),
          }
        : entity,
    ),
  } as unknown as AppSchema;
}
function schemaWithEstimateNumber(numberOverrides: Record<string, unknown> = {}) {
  const fields = [
    ...appSchema.entities.find((definition) => definition.key === "task")!.fields,
    {
      key: "estimate",
      type: "number",
      required: false,
      label: "Estimate",
      min: 0,
      integer: true,
      ...numberOverrides,
    },
  ];
  return {
    version: 1,
    entities: [
      {
        key: "task",
        label: "Task",
        fields,
        operations: taskOperations(
          "Task",
          fields,
          commandOperationsFromSource(
            appSchema.entities.find((definition) => definition.key === "task")!.operations,
          ),
        ),
      },
    ],
    queries: appSchema.queries,
    itemViews: appSchema.itemViews,
    tableViews: appSchema.tableViews,
    views: appSchema.views,
    screens: appSchema.screens,
  };
}
function schemaWithIdentityReferenceAccount(): AppSchema {
  const fields = identityReferenceAccountFields();
  return {
    version: 1,
    entities: [
      ...appSchema.entities,
      {
        key: "account",
        label: "Account",
        fields,
        operations: taskOperations("Account", fields, [
          { key: "createFromPlan", ...identityReferenceAccountPlanOperation() },
        ]),
      },
    ],
    queries: [
      ...appSchema.queries,
      {
        key: "accountAll",
        label: "All accounts",
        entity: "account",
        expression: { kind: "all" },
      },
    ],
    itemViews: [
      ...appSchema.itemViews,
      {
        key: "accountListItem",
        entity: "account",
        fields: [
          { field: "name", editor: "text", commit: "field-commit" },
          { field: "ownerPrincipal", editor: "reference", commit: "immediate" },
          { field: "organization", editor: "reference", commit: "immediate" },
          { field: "group", editor: "reference", commit: "immediate" },
        ],
      },
    ],
    tableViews: appSchema.tableViews,
    views: [
      ...appSchema.views,
      {
        key: "accountHome",
        type: "collection",
        label: "Accounts",
        entity: "account",
        queries: [{ query: "accountAll" }],
        defaultQuery: "accountAll",
        result: { type: "list", itemView: "accountListItem" },
      },
      {
        key: "accountCreate",
        type: "create",
        entity: "account",
        fields: [
          { field: "name", editor: "text" },
          { field: "ownerPrincipal", editor: "reference" },
          { field: "organization", editor: "reference" },
          { field: "group", editor: "reference" },
        ],
      },
    ],
    screens: appSchema.screens,
  } as AppSchema;
}
function identityReferenceAccountFields(): EntitySchema["fields"] {
  return [
    { type: "text", required: true, label: "Name", key: "name" },
    {
      type: "reference",
      required: true,
      label: "Owner principal",
      to: "auth:principal",
      key: "ownerPrincipal",
    },
    {
      type: "reference",
      required: true,
      label: "Organization",
      to: "auth:organization",
      key: "organization",
    },
    {
      type: "reference",
      required: true,
      label: "Group",
      to: "auth:group",
      key: "group",
    },
  ];
}
function identityReferenceAccountSnapshotRecord({
  group,
  id = "snapshot-account-identity-refs",
  name = "Restored identity account",
  organization,
  ownerPrincipal,
}: {
  group: string;
  id?: string;
  name?: string;
  organization: string;
  ownerPrincipal: string;
}): StoredRecord {
  return {
    id,
    entity: "account",
    values: {
      name,
      ownerPrincipal,
      organization,
      group,
    },
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
  };
}

function identityReferenceAccountPlanOperation(): EntityOperationSchema {
  return {
    label: "Create account from plan",
    kind: "command",
    scope: "collection",
    input: {
      fields: [
        { key: "name", field: "name" },
        { key: "ownerPrincipal", field: "ownerPrincipal" },
        { key: "organization", field: "organization" },
        { key: "group", field: "group" },
      ],
    },
    effect: {
      type: "recordPlan",
      steps: identityReferenceAccountPlanSteps(),
    },
    output: { type: "command" },
    idempotency: { required: true },
    audit: { input: "summary" },
  };
}

function identityReferenceAccountPlanSteps(): RecordPlanStepSchema[] {
  return [
    {
      name: "createAccount",
      kind: "create",
      entity: "account",
      values: {
        name: { kind: "input", field: "name" },
        ownerPrincipal: {
          kind: "reference",
          entity: "auth:principal",
          id: { kind: "input", field: "ownerPrincipal" },
        },
        organization: {
          kind: "reference",
          entity: "auth:organization",
          id: { kind: "input", field: "organization" },
        },
        group: {
          kind: "reference",
          entity: "auth:group",
          id: { kind: "input", field: "group" },
        },
      },
    },
  ];
}
function schemaWithTaskConstraints(constraints: EntitySchema["constraints"]) {
  const fields = appSchema.entities.find((definition) => definition.key === "task")!.fields;
  return {
    version: 1,
    entities: [
      {
        key: "task",
        label: "Task",
        fields,
        constraints,
        operations: taskOperations(
          "Task",
          fields,
          commandOperationsFromSource(
            appSchema.entities.find((definition) => definition.key === "task")!.operations,
          ),
        ),
      },
    ],
    queries: defaultQueries(),
    itemViews: defaultItemViews(),
    tableViews: [],
    views: defaultViews(),
    screens: defaultScreens(),
  } as unknown as AppSchema;
}
function schemaWithViews(views: unknown = defaultViews()) {
  const fields = appSchema.entities.find((definition) => definition.key === "task")!.fields;
  return {
    version: 1,
    entities: [
      {
        key: "task",
        label: "Task",
        fields,
        operations: taskOperations("Task", fields),
      },
    ],
    queries: defaultQueries(),
    itemViews: defaultItemViews(),
    tableViews: [],
    views,
    screens: defaultScreens(),
  };
}
function defaultQueries(): AppSchema["queries"] {
  return [
    {
      label: "All",
      entity: "task",
      expression: { kind: "all" },
      key: "taskAll",
    },
    {
      label: "Active",
      entity: "task",
      expression: {
        kind: "where",
        ref: { kind: "value", name: "done" },
        op: "eq",
        value: false,
      },
      key: "taskActive",
    },
    {
      label: "Completed",
      entity: "task",
      expression: {
        kind: "where",
        ref: { kind: "value", name: "done" },
        op: "eq",
        value: true,
      },
      key: "taskCompleted",
    },
  ];
}
function defaultItemViews(): AppSchema["itemViews"] {
  return [
    {
      entity: "task",
      fields: [
        { field: "title", editor: "text", commit: "field-commit" },
        { field: "done", editor: "boolean", commit: "immediate" },
        { field: "dueDate", editor: "date", commit: "field-commit" },
        { field: "priority", editor: "enum", commit: "immediate" },
      ],
      key: "taskListItem",
    },
  ];
}
function defaultViews(): AppSchema["views"] {
  return [
    { ...defaultCollectionView(), key: "taskHome" },
    {
      type: "create",
      entity: "task",
      fields: [
        { field: "title", editor: "text" },
        { field: "dueDate", editor: "date" },
        { field: "priority", editor: "enum" },
      ],
      key: "taskCreate",
    },
  ];
}
function defaultScreens(): NonNullable<AppSchema["screens"]> {
  return [
    {
      type: "workspace",
      label: "Tasks",
      layout: {
        type: "stack",
        sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
      },
      key: "taskHome",
    },
  ];
}
function defaultCollectionView(): Extract<
  AppSchema["views"][number],
  {
    type: "collection";
  }
> {
  return {
    key: "taskHome",
    type: "collection",
    label: "All",
    entity: "task",
    queries: [{ query: "taskAll" }],
    defaultQuery: "taskAll",
    result: { type: "list", itemView: "taskListItem" },
  };
}

async function resetSchemaApp(schemaKey: SchemaKey) {
  await authority.resetSchemaApp(schemaKey);
}

function useSchemaApp(schemaKey: SchemaKey) {
  authority.useSchemaApp(schemaKey);
}

function apiPath(path: string, schemaKey?: SchemaKey) {
  return authority.apiPath(path, schemaKey);
}

async function getInstalledAppJson<T>(packageAppKey: string, installId: string, path: string) {
  const response = await harness.fetch(installedAppApiPath(packageAppKey, installId, path));

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

async function postInstalledAppJson<T>(
  packageAppKey: string,
  installId: string,
  path: string,
  body: unknown,
) {
  const request = operationWriteRequest(path, body);
  const response = await harness.fetch(
    installedAppApiPath(packageAppKey, installId, request.path),
    {
      body: JSON.stringify(request.body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );

  expect(response.status).toBe(200);

  return request.response(await response.json()) as T;
}

async function postInstalledAppRecordOperation(
  packageAppKey: string,
  installId: string,
  body: AuthorityTestRecordOperationRequest,
) {
  const request = recordOperationRequest(body);
  const response = await harness.fetch(
    installedAppApiPath(packageAppKey, installId, request.path.slice("/api".length)),
    {
      body: JSON.stringify(request.body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );

  expect(response.status).toBe(200);

  return request.response(await response.json());
}

async function postInstalledAppCommandOperation(
  packageAppKey: string,
  installId: string,
  body: AuthorityTestCommandOperationRequest,
) {
  const request = commandOperationRequest(body);
  const response = await harness.fetch(
    installedAppApiPath(packageAppKey, installId, request.path.slice("/api".length)),
    {
      body: JSON.stringify(request.body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );

  expect(response.status).toBe(200);

  return request.response(await response.json());
}

async function resetInstalledApp(packageAppKey: string, installId: string) {
  await postInstalledAppJson<BootstrapResponse>(packageAppKey, installId, "/reset/seed", {});
}

function installedAppApiPath(packageAppKey: string, installId: string, path: string) {
  if (!path.startsWith("/")) {
    throw new Error(`Expected installed app API operation path, received "${path}".`);
  }

  return `/api/app-installs/${packageAppKey}/${installId}${path}`;
}

async function createIdentityReferenceHarness() {
  return await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    { bindings: { FORMLESS_ADMIN_TOKEN: adminToken } },
  );
}

async function createIdentityPrincipal(
  targetHarness: Harness,
  idempotencyKey: string,
  displayName: string,
) {
  return await postIdentityRecordOperation({
    harness: targetHarness,
    entity: "principal",
    idempotencyKey,
    operationName: "create",
    input: {
      displayName,
      kind: "human",
      status: "active",
    },
  });
}

async function createIdentityOrganization(
  targetHarness: Harness,
  idempotencyKey: string,
  displayName: string,
) {
  return await postIdentityRecordOperation({
    harness: targetHarness,
    entity: "organization",
    idempotencyKey,
    operationName: "create",
    input: {
      displayName,
      status: "active",
    },
  });
}

async function createIdentityGroup(
  targetHarness: Harness,
  idempotencyKey: string,
  displayName: string,
) {
  return await postIdentityRecordOperation({
    harness: targetHarness,
    entity: "group",
    idempotencyKey,
    operationName: "create",
    input: {
      displayName,
      status: "active",
    },
  });
}
async function postIdentityRecordOperation(
  body: AuthorityTestRecordOperationRequest & {
    harness: Harness;
  },
) {
  const { harness: targetHarness, ...operationBody } = body;
  const request = recordOperationRequest(operationBody);
  const response = await targetHarness.fetch(
    `${IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX}${request.path.slice("/api".length)}`,
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

  return request.response(await response.json()).record;
}

async function postPrivateJson<T>(targetHarness: Harness, path: string, body: unknown) {
  const response = await targetHarness.fetch(privateTasksApiPath(path), {
    body: JSON.stringify(body),
    headers: privateWriteHeaders(),
    method: "POST",
  });
  const responseBody = await response.json();

  if (response.status !== 200) {
    throw new Error(`Private request failed: ${response.status} ${JSON.stringify(responseBody)}`);
  }

  return responseBody as T;
}

function privateTasksApiPath(path: string) {
  if (!path.startsWith("/api/")) {
    throw new Error(`Expected API path, received "${path}".`);
  }

  return `/api/tasks${path.slice("/api".length)}`;
}

function privateWriteHeaders() {
  return {
    Authorization: `Bearer ${adminToken}`,
    "Content-Type": "application/json",
  };
}

async function postCreateOperation(idempotencyKey: string, values: Record<string, unknown>) {
  return authority.postCreateOperation(idempotencyKey, values);
}

async function postCreateOperationForEntity(
  idempotencyKey: string,
  entity: string,
  values: Record<string, unknown>,
) {
  return authority.postCreateOperationForEntity(idempotencyKey, entity, values);
}

async function postRecordOperationRequest(body: AuthorityTestRecordOperationRequest) {
  return authority.postRecordOperationRequest(body);
}

async function postCommandOperation(idempotencyKey: string, operationName: string) {
  return authority.postCommandOperation(idempotencyKey, operationName);
}

async function postCommandOperationForEntity(
  idempotencyKey: string,
  entity: string,
  operationName: string,
  extra: Record<string, unknown> = {},
) {
  return authority.postCommandOperationForEntity(idempotencyKey, entity, operationName, extra);
}

async function openSyncSocket(path = "/api/sync/ws", schemaKey?: SchemaKey) {
  const response = await harness.fetch(apiPath(path, schemaKey), {
    headers: { Upgrade: "websocket" },
  });

  expect(response.status).toBe(101);
  expect(response.webSocket).toBeTruthy();

  const socket = response.webSocket;

  if (!socket) {
    throw new Error("WebSocket upgrade response did not include a client socket.");
  }

  socket.accept();

  return socket;
}

function readSyncSocketMessage(socket: Awaited<ReturnType<typeof openSyncSocket>>) {
  return new Promise<SyncSocketServerMessage>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for sync WebSocket message."));
    }, 1000);

    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("error", onError);
    };
    const onMessage = (event: WebSocketEventMap["message"]) => {
      cleanup();
      if (typeof event.data !== "string") {
        reject(new Error("Sync WebSocket message was not text."));
        return;
      }

      resolve(JSON.parse(event.data) as SyncSocketServerMessage);
    };
    const onError = () => {
      cleanup();
      reject(new Error("Sync WebSocket emitted an error."));
    };

    socket.addEventListener("message", onMessage);
    socket.addEventListener("error", onError);
  });
}

async function primeSyncSocket(
  socket: Awaited<ReturnType<typeof openSyncSocket>>,
  cursor: number,
  schemaUpdatedAt: string | null,
) {
  socket.send(
    JSON.stringify({
      type: "hello",
      cursor,
      schemaUpdatedAt,
    }),
  );

  await expect(readSyncSocketMessage(socket)).resolves.toEqual({
    type: "sync",
    payload: {
      changes: [],
      cursor,
    },
  });
}

function captureSyncSocketMessages(socket: Awaited<ReturnType<typeof openSyncSocket>>) {
  const messages: SyncSocketServerMessage[] = [];
  const onMessage = (event: WebSocketEventMap["message"]) => {
    if (typeof event.data === "string") {
      messages.push(JSON.parse(event.data) as SyncSocketServerMessage);
    }
  };

  socket.addEventListener("message", onMessage);

  return {
    messages,
    stop: () => {
      socket.removeEventListener("message", onMessage);
    },
  };
}

async function expectNoCapturedMessages(capture: ReturnType<typeof captureSyncSocketMessages>) {
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(capture.messages).toEqual([]);
}

async function getJson<T>(path: string) {
  return authority.getJson<T>(path);
}

async function postJson<T>(path: string, body: unknown) {
  return authority.postJson<T>(path, body);
}

async function expectError(path: string, body: unknown, message: string) {
  await authority.expectError(path, body, message);
}

async function expectNotFound(path: string) {
  await authority.expectNotFound(path);
}

function expectRecordsIgnoringOrder(actual: StoredRecord[], expected: StoredRecord[]) {
  expect(recordsById(actual)).toEqual(recordsById(expected));
}

function recordsById(records: StoredRecord[]) {
  return Object.fromEntries(records.map((record) => [record.id, record]));
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
    seedRecords: {
      kind: "workspace",
      key: "private-site",
      path: "packages/private-site/seed-records.json",
    },
    sourceSchemaHash,
    capabilities: [
      { kind: "generatedAdmin", routeBase: "/apps" },
      { kind: "publicSite", routeBase: "/sites" },
    ],
  };
}
