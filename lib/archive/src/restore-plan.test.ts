import { describe, expect, it } from "vite-plus/test";
import rawCrmAppPackageManifest from "@dpeek/formless-crm-app/formless.app.json";
import rawCrmSeedRecords from "@dpeek/formless-crm-app/seed-records.json";
import rawCrmSourceSchema from "@dpeek/formless-crm-app/schema.json";
import {
  APP_ARCHIVE_KIND,
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  type AppArchive,
  type AppArchiveMediaObject,
  type InstanceArchive,
} from "./index.ts";
import {
  appPackageManifestKind,
  appPackageManifestVersion,
  createAppPackageResolver,
  listInstallableAppPackages,
  parseAppPackageManifest,
  type AppInstall,
  type SourceSchemaHash,
} from "@dpeek/formless-installed-apps";
import {
  planAppArchiveRestore,
  planInstanceArchiveRestore,
  planPortableArchiveRestore,
  type ArchiveRestoreMediaFile,
  type ArchiveRestorePlan,
  type ArchiveRestorePlanError,
  type ArchiveRestorePlanResult,
} from "./index.ts";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import { parseAppSchema } from "@dpeek/formless-schema";

const now = "2026-05-23T00:00:00.000Z";
const siteSourceSchemaHash =
  "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const tasksSourceSchemaHash =
  "sha256:2222222222222222222222222222222222222222222222222222222222222222";
const crmPackageManifest = parseAppPackageManifest(
  rawCrmAppPackageManifest,
  "CRM package manifest",
);
const crmSourceSchemaHash = crmPackageManifest.sourceSchemaHash;
const siteSourceSchema = parseAppSchema({
  version: 1,
  entities: [
    {
      id: "entity_4d8e2d7c-72d6-4073-b16e-5d166f34a6c1",
      key: "site",
      label: "Site",
      fields: [
        { key: "key", type: "text", required: true, label: "Key" },
        { key: "label", type: "text", required: true, label: "Label" },
      ],
      constraints: [{ key: "uniqueKey", kind: "unique", fields: ["key"] }],
      operations: writeOperations("Site", ["key", "label"], { delete: true }),
    },
    {
      id: "entity_3ef07253-2620-4c77-be92-3096df861767",
      key: "block",
      label: "Block",
      fields: [
        { key: "type", type: "text", required: true, label: "Type" },
        { key: "label", type: "text", required: true, label: "Label" },
        { key: "href", type: "text", required: false, label: "Href", format: "href" },
        { key: "mediaAssetId", type: "text", required: false, label: "Media asset id" },
        { key: "width", type: "number", required: false, label: "Width", integer: true },
        { key: "height", type: "number", required: false, label: "Height", integer: true },
      ],
      operations: writeOperations(
        "Block",
        ["type", "label", "href", "mediaAssetId", "width", "height"],
        { delete: true },
      ),
    },
    {
      id: "entity_bbb47901-1536-4558-8d7f-e4810fae75d8",
      key: "block-placement",
      label: "Block Placement",
      fields: [
        {
          key: "parent",
          type: "reference",
          required: true,
          label: "Parent",
          to: "block",
          displayField: "label",
        },
        {
          key: "block",
          type: "reference",
          required: true,
          label: "Block",
          to: "block",
          displayField: "label",
        },
        { key: "order", type: "number", required: true, label: "Order", integer: true },
      ],
      operations: writeOperations("Block placement", ["parent", "block", "order"], {
        delete: true,
      }),
    },
  ],
  queries: [{ key: "siteAll", label: "Sites", entity: "site", expression: { kind: "all" } }],
  itemViews: [
    {
      key: "siteItem",
      entity: "site",
      fields: [{ field: "label", editor: "text", commit: "field-commit" }],
    },
  ],
  tableViews: [],
  views: [
    {
      key: "siteList",
      type: "collection",
      label: "Sites",
      entity: "site",
      queries: [{ query: "siteAll" }],
      defaultQuery: "siteAll",
      result: { type: "list", itemView: "siteItem" },
    },
  ],
  screens: [
    {
      key: "home",
      type: "workspace",
      label: "Home",
      layout: {
        type: "stack",
        sections: [{ id: "sites", type: "collection", view: "siteList" }],
      },
    },
  ],
});
const taskSourceSchema = parseAppSchema({
  version: 1,
  entities: [
    {
      id: "entity_f7b77f9a-b890-4bc8-887b-89a0a3399dc6",
      key: "task",
      label: "Task",
      fields: [
        { key: "title", type: "text", required: true, label: "Title" },
        { key: "done", type: "boolean", required: true, label: "Done" },
      ],
      operations: writeOperations("Task", ["title", "done"], { delete: true }),
    },
  ],
  queries: [{ key: "taskAll", label: "Tasks", entity: "task", expression: { kind: "all" } }],
  itemViews: [
    {
      key: "taskItem",
      entity: "task",
      fields: [{ field: "title", editor: "text", commit: "field-commit" }],
    },
  ],
  tableViews: [],
  views: [
    {
      key: "taskList",
      type: "collection",
      label: "Tasks",
      entity: "task",
      queries: [{ query: "taskAll" }],
      defaultQuery: "taskAll",
      result: { type: "list", itemView: "taskItem" },
    },
  ],
  screens: [
    {
      key: "home",
      type: "workspace",
      label: "Home",
      layout: {
        type: "stack",
        sections: [{ id: "tasks", type: "collection", view: "taskList" }],
      },
    },
  ],
});
const crmSourceSchema = parseAppSchema(rawCrmSourceSchema);
const taskSeedRecords: StoredRecord[] = [
  taskRecord("rec_task_overdue", "Review overdue proposal", false),
  taskRecord("rec_task_today", "Plan today's delivery", false),
  taskRecord("rec_task_later", "Schedule design review", false),
  taskRecord("rec_task_completed", "Send signed kickoff notes", true),
  taskRecord("rec_task_backlog", "Capture research notes", false),
];
const crmSeedRecords = materializedPackageSeedRecords(rawCrmSeedRecords);
const archiveTestPackageResolver = createAppPackageResolver([
  packageManifest({
    defaultInstallId: "site",
    label: "Site",
    packageAppKey: "site",
    publicSite: true,
    sourceSchemaHash: siteSourceSchemaHash,
  }),
  packageManifest({
    defaultInstallId: "tasks",
    label: "Tasks",
    packageAppKey: "tasks",
    sourceSchemaHash: tasksSourceSchemaHash,
  }),
  crmPackageManifest,
]);
const archiveTestInstallablePackages = listInstallableAppPackages(archiveTestPackageResolver);
function writeOperations(
  label: string,
  fields: string[],
  options: {
    delete?: boolean;
  } = {},
) {
  const input = {
    fields: fields.map((field) => ({ key: field, field })),
  };
  return [
    {
      key: "create",
      label: `Create ${label}`,
      kind: "create",
      scope: "collection",
      input,
      effect: { type: "createRecord" },
      output: { type: "create" },
      idempotency: { required: true },
      audit: { input: "summary" },
    },
    {
      key: "update",
      label: `Update ${label}`,
      kind: "update",
      scope: "record",
      input,
      effect: { type: "patchRecord" },
      output: { type: "update" },
      idempotency: { required: true },
      audit: { input: "summary" },
    },
    ...(options.delete
      ? [
          {
            key: "delete",
            label: `Delete ${label}`,
            kind: "delete",
            scope: "record",
            effect: { type: "tombstoneRecord" },
            output: { type: "delete" },
            idempotency: { required: true },
            audit: { input: "summary" },
          },
        ]
      : []),
  ];
}
describe("archive restore planner", () => {
  it("plans mixed Site, Tasks, and CRM instance archive restores with current core media", () => {
    const archive = instanceArchive({
      apps: [
        appArchive({
          app: archivedInstall("site", "Site"),
          data: {
            ...storageSnapshot({ storageIdentity: "app:site" }),
            records: [coreImageBlock("hero"), siteRecord("rec_site_settings_site", "site")],
          },
          media: {
            objects: [coreMediaObject("hero")],
          },
        }),
        appArchive({
          app: archivedInstall("tasks", "Tasks", "tasks"),
          data: {
            ...storageSnapshot({
              records: taskSeedRecords,
              schema: taskSourceSchema,
              schemaKey: "tasks",
              sourceCursor: taskSeedRecords.length,
              storageIdentity: "app:tasks",
            }),
          },
          media: { objects: [] },
        }),
        appArchive({
          app: archivedInstall("crm", "CRM", "crm"),
          data: {
            ...storageSnapshot({
              records: crmSeedRecords,
              schema: crmSourceSchema,
              schemaKey: "crm",
              sourceCursor: crmSeedRecords.length,
              storageIdentity: "app:crm",
            }),
          },
          media: { objects: [] },
        }),
      ],
    });

    const plan = expectPlan(
      planInstanceArchiveRestore(archive, {
        packages: archiveTestInstallablePackages,
        mediaFiles: [coreMediaFile("hero")],
        sourceSchemas: {
          crm: crmSourceSchema,
          site: siteSourceSchema,
          tasks: taskSourceSchema,
        },
      }),
    );

    expect(plan.summary.appCount).toBe(3);
    expect(plan.summary.createdInstalls).toEqual(["crm", "site", "tasks"]);
    expect(plan.summary.mediaCountsByApp).toEqual({
      crm: 0,
      site: 1,
      tasks: 0,
    });
    expect(
      plan.steps.filter((step) => step.kind === "restoreMedia").map((step) => step.appInstallId),
    ).toEqual(["site"]);
    expect(
      plan.steps.filter((step) => step.kind === "restoreMedia").map((step) => step.storageKey),
    ).toEqual(["media/images/hero.png"]);
  });

  it("rejects install collisions unless replacement is explicit", () => {
    const existing = [siteInstall("personal")];
    const rejected = expectFailure(
      planAppArchiveRestore(appArchive({ app: archivedInstall("personal", "Personal") }), {
        installedApps: existing,
        packages: archiveTestInstallablePackages,
        sourceSchemas: { site: siteSourceSchema },
      }),
    );

    expect(rejected.map((error) => error.code)).toEqual(["install-collision"]);

    const replacementPlan = expectPlan(
      planAppArchiveRestore(
        appArchive({
          app: archivedInstall("personal", "Personal"),
          restorePolicy: { dryRun: true, installCollisions: "replace" },
        }),
        {
          installedApps: existing,
          packages: archiveTestInstallablePackages,
          sourceSchemas: { site: siteSourceSchema },
        },
      ),
    );

    expect(replacementPlan.summary.createdInstalls).toEqual([]);
    expect(replacementPlan.summary.replacedInstalls).toEqual(["personal"]);
    expect(replacementPlan.steps[0]).toMatchObject({
      install: expect.objectContaining({ installId: "personal" }),
      kind: "replaceInstall",
    });
  });

  it("validates package availability and storage snapshot schema compatibility", () => {
    const unsupportedPackage = expectFailure(
      planAppArchiveRestore(
        appArchive({
          app: {
            ...archivedInstall("tasks-copy", "Tasks Copy"),
            packageAppKey: "missing",
            sourceSchemaKey: "missing",
          },
          data: {
            ...storageSnapshot({
              records: [siteRecord("rec_site_settings_tasks", "tasks")],
              schemaKey: "missing",
              storageIdentity: "app:tasks-copy",
            }),
          },
        }),
        {
          packages: archiveTestInstallablePackages,
          sourceSchemas: { site: siteSourceSchema },
        },
      ),
    );
    const missingSource = expectFailure(
      planAppArchiveRestore(appArchive(), {
        packages: archiveTestInstallablePackages,
        sourceSchemas: {},
      }),
    );
    const mismatchedSchema = structuredClone(siteSourceSchema);
    mismatchedSchema.entities.find((definition) => definition.key === "site")!.label =
      "Different Site";
    const schemaMismatch = expectFailure(
      planAppArchiveRestore(appArchive(), {
        packages: archiveTestInstallablePackages,
        sourceSchemas: { site: mismatchedSchema },
      }),
    );

    expect(unsupportedPackage.map((error) => error.code)).toContain("unsupported-package");
    expect(missingSource.map((error) => error.code)).toContain("missing-source-schema");
    expect(schemaMismatch.map((error) => error.code)).toContain("schema-mismatch");
  });

  it("validates archive records, references, and unique constraints", () => {
    const errors = expectFailure(
      planAppArchiveRestore(
        appArchive({
          data: {
            ...storageSnapshot({
              records: [
                siteRecord("rec_dup", "primary"),
                siteRecord("rec_dup", "secondary"),
                siteRecord("rec_duplicate_key", "primary"),
                {
                  ...siteRecord("rec_unknown_field", "other"),
                  values: {
                    key: "other",
                    label: "Other",
                    missing: "unsupported",
                  },
                },
                blockRecord("rec_block_target", "Target"),
                placementRecord("rec_place_broken", "missing-parent", "rec_block_target"),
              ],
            }),
          },
        }),
        {
          packages: archiveTestInstallablePackages,
          sourceSchemas: { site: siteSourceSchema },
        },
      ),
    );

    expect(errors.map((error) => error.code)).toEqual([
      "duplicate-record-id",
      "unique-constraint",
      "broken-reference",
      "invalid-record",
    ]);
    expect(errors.map((error) => error.recordId)).toEqual([
      "rec_dup",
      "rec_duplicate_key",
      "rec_place_broken",
      "rec_unknown_field",
    ]);
  });

  it("validates current core media manifests and media files", () => {
    const errors = expectFailure(
      planAppArchiveRestore(
        appArchive({
          capabilities: ["app-store-snapshots", "core-media-assets"],
          data: {
            ...storageSnapshot({
              records: [siteRecord("rec_site_settings_media", "media"), coreImageBlock("hero")],
            }),
          },
          media: {
            objects: [coreMediaObject("hero", { contentType: "image/jpeg" })],
          },
        }),
        {
          packages: archiveTestInstallablePackages,
          mediaFiles: [],
          sourceSchemas: { site: siteSourceSchema },
        },
      ),
    );

    expect(errors.map((error) => error.code)).toEqual([
      "invalid-media",
      "invalid-media",
      "missing-media-object",
    ]);
    expect(errors.map((error) => error.storageKey)).toEqual([
      "media/images/hero.png",
      "media/images/hero.png",
      "media/images/hero.png",
    ]);
  });

  it("plans core media asset restores before records that store media asset ids", () => {
    const plan = expectPlan(
      planAppArchiveRestore(
        appArchive({
          capabilities: ["app-store-snapshots", "core-media-assets"],
          data: {
            ...storageSnapshot({
              records: [siteRecord("rec_site_settings_media", "media"), coreImageBlock("hero")],
            }),
          },
          media: {
            objects: [coreMediaObject("hero")],
          },
        }),
        {
          packages: archiveTestInstallablePackages,
          mediaFiles: [coreMediaFile("hero")],
          sourceSchemas: { site: siteSourceSchema },
        },
      ),
    );

    expect(plan.steps.map((step) => step.kind)).toEqual([
      "createInstall",
      "restoreMedia",
      "restoreAppData",
    ]);
    expect(
      plan.steps.filter((step) => step.kind === "restoreMedia").map((step) => step.storageKey),
    ).toEqual(["media/images/hero.png"]);
  });

  it("discovers image references from schema media editors rather than field names", () => {
    const schema = imageAliasSourceSchema();
    const plan = expectPlan(
      planAppArchiveRestore(
        appArchive({
          capabilities: ["app-store-snapshots", "core-media-assets"],
          data: {
            ...storageSnapshot({
              schema,
              records: [
                siteRecord("rec_site_settings_media", "media"),
                blockRecord("rec_block_hero", "Hero", {
                  assetReference: "hero.png",
                }),
              ],
            }),
          },
          media: {
            objects: [coreMediaObject("hero")],
          },
        }),
        {
          packages: archiveTestInstallablePackages,
          mediaFiles: [coreMediaFile("hero")],
          sourceSchemas: { site: schema },
        },
      ),
    );

    expect(plan.summary.mediaCountsByApp).toEqual({ personal: 1 });
    expect(plan.steps[1]).toMatchObject({
      kind: "restoreMedia",
      storageKey: "media/images/hero.png",
    });
  });

  it("plans schema-referenced document restores before app records", () => {
    const schema = documentSourceSchema();
    const bytes = pdfBytes("private report");
    const plan = expectPlan(
      planAppArchiveRestore(
        appArchive({
          capabilities: ["app-store-snapshots", "core-media-assets"],
          data: {
            ...storageSnapshot({
              schema,
              records: [
                siteRecord("rec_site_settings_media", "media"),
                blockRecord("rec_block_report", "Report", {
                  documentAssetId: "report.pdf",
                }),
              ],
            }),
          },
          media: {
            objects: [documentMediaObject("report", "private", bytes.byteLength)],
          },
        }),
        {
          packages: archiveTestInstallablePackages,
          mediaFiles: [documentMediaFile("report", bytes)],
          sourceSchemas: { site: schema },
        },
      ),
    );

    expect(plan.steps.map((step) => step.kind)).toEqual([
      "createInstall",
      "restoreMedia",
      "restoreAppData",
    ]);
    expect(plan.steps[1]).toMatchObject({
      appInstallId: "personal",
      asset: expect.objectContaining({
        access: "private",
        filename: "report.pdf",
        ownerAppInstallId: "personal",
      }),
      storageKey: "media/app-installs/personal/documents/report.pdf",
    });
  });

  it("rejects document metadata and PDF payload mismatches before restore", () => {
    const schema = documentSourceSchema();
    const bytes = pdfBytes("issued report");
    const archive = appArchive({
      capabilities: ["app-store-snapshots", "core-media-assets"],
      data: {
        ...storageSnapshot({
          schema,
          records: [
            siteRecord("rec_site_settings_media", "media"),
            blockRecord("rec_block_report", "Report", {
              documentAssetId: "report.pdf",
            }),
          ],
        }),
      },
      media: {
        objects: [documentMediaObject("report", "private", bytes.byteLength)],
      },
    });
    const metadataMismatch = structuredClone(archive);
    const metadataAsset = metadataMismatch.media.objects[0]?.asset;

    if (!metadataAsset || metadataAsset.kind !== "document") {
      throw new Error("Expected document media fixture.");
    }

    metadataAsset.byteSize += 1;

    const metadataErrors = expectFailure(
      planAppArchiveRestore(metadataMismatch, {
        packages: archiveTestInstallablePackages,
        mediaFiles: [documentMediaFile("report", bytes)],
        sourceSchemas: { site: schema },
      }),
    );
    const payloadErrors = expectFailure(
      planAppArchiveRestore(archive, {
        packages: archiveTestInstallablePackages,
        mediaFiles: [documentMediaFile("report", new Uint8Array(bytes.byteLength).fill(1))],
        sourceSchemas: { site: schema },
      }),
    );

    expect(metadataErrors.map((error) => error.code)).toContain("invalid-media");
    expect(payloadErrors.map((error) => error.message)).toContain(
      'Archive app "personal" document file "media/personal/media/app-installs/personal/documents/report.pdf" has invalid PDF payload.',
    );
  });

  it("preserves app install registration policy in restore plans", () => {
    const plan = expectPlan(
      planAppArchiveRestore(
        appArchive({
          app: {
            ...archivedInstall("members", "Members"),
            registrationOperation: "profile.register",
            registrationPolicy: "custom-operation",
          },
        }),
        {
          packages: archiveTestInstallablePackages,
          sourceSchemas: { site: siteSourceSchema },
        },
      ),
    );

    expect(plan.steps[0]).toMatchObject({
      install: {
        installId: "members",
        registrationOperation: "profile.register",
        registrationPolicy: "custom-operation",
      },
      kind: "createInstall",
    });
  });

  it("reports codec failures as invalid archive planner errors", () => {
    expect(expectFailure(planPortableArchiveRestore({ kind: "formless.futureArchive" }))).toEqual([
      {
        code: "invalid-archive",
        message: 'Archive kind "formless.futureArchive" is unsupported.',
      },
    ]);
  });
});

function expectPlan(result: ArchiveRestorePlanResult): ArchiveRestorePlan {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(result.errors.map((error) => error.message).join("\n"));
  }

  return result.plan;
}

function expectFailure(result: ArchiveRestorePlanResult): ArchiveRestorePlanError[] {
  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error("Expected archive restore planning to fail.");
  }

  return result.errors;
}

function instanceArchive(overrides: Partial<InstanceArchive> = {}): InstanceArchive {
  return {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: now,
    capabilities: ["installed-app-registry", "app-store-snapshots"],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    apps: [appArchive()],
    ...overrides,
  };
}

function appArchive(overrides: Partial<AppArchive> = {}): AppArchive {
  const app = overrides.app ?? archivedInstall("personal", "Personal");

  return {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: now,
    capabilities: ["app-store-snapshots"],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    app,
    data:
      overrides.data ??
      storageSnapshot({
        records: [siteRecord("rec_site_settings_primary", "primary")],
        schemaKey: app.sourceSchemaKey,
        storageIdentity: `app:${app.installId}`,
      }),
    media: { objects: [] },
    ...overrides,
  };
}

function archivedInstall(
  installId: string,
  label: string,
  packageAppKey = "site",
): AppArchive["app"] {
  return {
    installId,
    packageAppKey,
    packageRevision: 1,
    sourceSchemaKey: packageAppKey,
    sourceSchemaHash: sourceSchemaHashForPackageAppKey(packageAppKey),
    label,
    registrationPolicy: "closed",
    status: "installed",
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:01:00.000Z",
  };
}

function sourceSchemaHashForPackageAppKey(packageAppKey: string) {
  if (packageAppKey === "tasks") {
    return tasksSourceSchemaHash;
  }

  if (packageAppKey === "crm") {
    return crmSourceSchemaHash;
  }

  return siteSourceSchemaHash;
}

function storageSnapshot(overrides: Partial<StorageSnapshot> = {}): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: "app:personal",
    schemaKey: "site",
    exportedAt: now,
    schemaUpdatedAt: now,
    sourceCursor: 7,
    schema: siteSourceSchema,
    records: [siteRecord("rec_site_settings_primary", "primary")],
    ...overrides,
  };
}

function siteRecord(id: string, key: string): StoredRecord {
  const createdAt = "2026-05-23T00:00:00.000Z";

  return {
    id,
    entity: "site",
    values: {
      key,
      label: `${key} Site`,
    },
    createdAt,
    updatedAt: createdAt,
  };
}

function blockRecord(id: string, label: string, values: StoredRecord["values"] = {}): StoredRecord {
  const createdAt = id.endsWith("missing")
    ? "2026-05-23T00:00:03.000Z"
    : "2026-05-23T00:00:02.000Z";

  return {
    id,
    entity: "block",
    values: {
      type: "image",
      label,
      ...values,
    },
    createdAt,
    updatedAt: createdAt,
  };
}

function coreImageBlock(name: string): StoredRecord {
  return blockRecord(`rec_block_${name}`, `${name} image`, {
    mediaAssetId: `${name}.png`,
    width: 1200,
    height: 800,
  });
}

function placementRecord(id: string, parent: string, block: string): StoredRecord {
  const createdAt = "2026-05-23T00:00:04.000Z";

  return {
    id,
    entity: "block-placement",
    values: {
      parent,
      block,
      order: 1000,
    },
    createdAt,
    updatedAt: createdAt,
  };
}

function coreMediaObject(
  name: string,
  overrides: Partial<AppArchiveMediaObject> = {},
): AppArchiveMediaObject {
  const storageKey = `media/images/${name}.png`;

  return {
    storageKey,
    archivePath: `media/personal/media/images/${name}.png`,
    asset: {
      byteSize: 8,
      contentType: "image/png",
      deliveryHref: `/api/formless/media/${storageKey}`,
      id: `${name}.png`,
      kind: "image",
      label: `${name}.png`,
      provider: "r2",
      status: "ready",
      storageKey,
    },
    contentType: "image/png",
    byteSize: 8,
    deliveryHref: `/api/formless/media/${storageKey}`,
    ...overrides,
  };
}

function coreMediaFile(name: string): ArchiveRestoreMediaFile {
  return {
    archivePath: `media/personal/media/images/${name}.png`,
    byteSize: 8,
    contentType: "image/png",
  };
}
function documentSourceSchema() {
  const schema = structuredClone(siteSourceSchema);
  const block = schema.entities.find((definition) => definition.key === "block");
  if (!block) {
    throw new Error("Expected block schema.");
  }
  block.fields.push({
    key: "documentAssetId",
    type: "text",
    required: false,
    label: "Document",
    asset: {
      kind: "document",
      acceptedMimeTypes: ["application/pdf"],
      maxBytes: 1024 * 1024,
      access: "private",
    },
  });
  return schema;
}
function imageAliasSourceSchema() {
  const schema = structuredClone(siteSourceSchema);
  const block = schema.entities.find((definition) => definition.key === "block");
  if (!block) {
    throw new Error("Expected block schema.");
  }
  block.fields.push({
    key: "assetReference",
    type: "text",
    required: false,
    label: "Asset",
  });
  schema.itemViews.push({
    key: "blockMedia",
    entity: "block",
    fields: [
      {
        field: "assetReference",
        editor: "media",
        commit: "field-commit",
      },
    ],
  });
  return schema;
}
function documentMediaObject(
  name: string,
  access: "public" | "private",
  byteSize: number,
): AppArchiveMediaObject {
  const id = `${name}.pdf`;
  const storageKey = `media/app-installs/personal/documents/${id}`;
  const deliveryHref = `/api/app-installs/site/personal/media/documents/${id}`;

  return {
    archivePath: `media/personal/${storageKey}`,
    asset: {
      access,
      byteSize,
      contentType: "application/pdf",
      deliveryHref,
      filename: id,
      id,
      kind: "document",
      label: id,
      ownerAppInstallId: "personal",
      provider: "r2",
      status: "ready",
      storageKey,
    },
    byteSize,
    contentType: "application/pdf",
    deliveryHref,
    storageKey,
  };
}

function documentMediaFile(name: string, bytes: Uint8Array): ArchiveRestoreMediaFile {
  return {
    archivePath: `media/personal/media/app-installs/personal/documents/${name}.pdf`,
    byteSize: bytes.byteLength,
    bytes,
    contentType: "application/pdf",
  };
}

function pdfBytes(body: string): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.7\n${body}`);
}

function siteInstall(installId: string): AppInstall {
  return {
    adminRoute: `/apps/${installId}`,
    createdAt: now,
    installId,
    label: "Personal",
    packageAppKey: "site",
    packageRevision: 1,
    publicRoute: `/sites/${installId}`,
    publicRoutePrefix: `/sites/${installId}/`,
    registrationPolicy: "closed",
    sourceSchemaHash: siteSourceSchemaHash,
    status: "installed",
    updatedAt: now,
  };
}

function packageManifest(input: {
  defaultInstallId: string;
  label: string;
  packageAppKey: string;
  publicSite?: boolean;
  sourceSchemaHash: SourceSchemaHash;
}) {
  return parseAppPackageManifest({
    kind: appPackageManifestKind,
    version: appPackageManifestVersion,
    packageAppKey: input.packageAppKey,
    label: input.label,
    description: `${input.label} test package.`,
    defaultInstallId: input.defaultInstallId,
    supportsMultipleInstalls: true,
    packageRevision: 1,
    sourceSchema: {
      kind: "bundled",
      key: input.packageAppKey,
      path: `${input.packageAppKey}/schema.json`,
    },
    seedRecords: {
      kind: "bundled",
      key: input.packageAppKey,
      path: `${input.packageAppKey}/seed-records.json`,
    },
    sourceSchemaHash: input.sourceSchemaHash,
    capabilities: [
      { kind: "generatedAdmin", routeBase: "/apps" },
      ...(input.publicSite ? [{ kind: "publicSite", routeBase: "/sites" } as const] : []),
    ],
  });
}

function taskRecord(id: string, title: string, done: boolean): StoredRecord {
  return {
    id,
    entity: "task",
    values: { done, title },
    createdAt: now,
    updatedAt: now,
  };
}

function materializedPackageSeedRecords(records: unknown): StoredRecord[] {
  if (!Array.isArray(records)) {
    throw new Error("Package seed records fixture must be an array.");
  }

  return records.map((record) => {
    if (typeof record !== "object" || record === null || Array.isArray(record)) {
      throw new Error("Package seed record fixture must be an object.");
    }

    const storedRecord = record as Omit<StoredRecord, "updatedAt"> & {
      updatedAt?: string;
    };

    return {
      ...storedRecord,
      updatedAt: storedRecord.updatedAt ?? storedRecord.createdAt,
    };
  });
}
