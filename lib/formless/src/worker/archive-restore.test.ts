import { setKeyedDefinition } from "../test/schema-definition-test-helpers.ts";
import { describe, expect, it } from "vite-plus/test";
import {
  APP_ARCHIVE_KIND,
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  type AppArchive,
  type AppArchiveMediaObject,
  type InstanceArchive,
} from "@dpeek/formless-archive";
import type { AppInstall } from "@dpeek/formless-installed-apps";
import { installedAppStorageIdentity } from "../shared/app-storage-identity.ts";
import { bundledSourceSchemaHashFixtures } from "../shared/upgrade-migrations.ts";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import { type BootstrapResponse } from "../shared/protocol.ts";
import {
  INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  instanceControlPlaneSchema,
} from "@dpeek/formless-instance-control-plane";
import { siteSourceSchema } from "../test/schema-apps.ts";
import { mediaObjectMetadataForAsset } from "@dpeek/formless-media";
import {
  applyPortableArchiveRestore,
  dryRunPortableArchiveRestore,
  restoreArchiveMediaObjectToStore,
  type ArchiveRestoreApplyTarget,
  type ArchiveRestoreMediaRead,
} from "./archive-restore.ts";

const now = "2026-05-23T00:00:00.000Z";
const pngBytes = new Uint8Array([1, 2, 3, 4]);
const documentBytes = new TextEncoder().encode("%PDF-1.7\nprivate report");

describe("archive restore execution", () => {
  it("dry-runs restore plans without mutating the target", async () => {
    const archive = instanceArchive({
      restorePolicy: { dryRun: false, installCollisions: "reject" },
    });
    const events: string[] = [];
    const target = memoryRestoreTarget({ events });
    const result = await dryRunPortableArchiveRestore(archive, target);

    expect(result.ok).toBe(true);
    expect(events).toEqual([]);

    if (!result.ok) {
      throw new Error(result.errors.map((error) => error.message).join("\n"));
    }

    expect(result.report.applied).toBe(false);
    expect(result.report.steps.map((step) => step.kind)).toEqual(["appData", "install"]);
    expect(result.report.summary.createdInstalls).toEqual(["personal"]);
  });

  it("restores new app state before activating its install routes", async () => {
    const archive = instanceArchive({
      restorePolicy: { dryRun: false, installCollisions: "reject" },
      apps: [
        appArchive({
          app: archivedInstall("personal", "Personal"),
          data: {
            ...storageSnapshot(),
            records: [coreImageBlock("hero"), siteRecord("rec_site_settings_personal", "personal")],
          },
          media: { objects: [coreMediaObject("hero")] },
        }),
        appArchive({
          app: archivedInstall("docs", "Docs"),
          data: {
            ...storageSnapshot({ storageIdentity: "app:docs" }),
            records: [siteRecord("rec_site_settings_docs", "docs")],
          },
          media: { objects: [] },
        }),
      ],
    });
    const events: string[] = [];
    const target = memoryRestoreTarget({
      events,
      mediaFiles: [coreMediaFile("hero")],
    });
    const result = await applyPortableArchiveRestore(archive, target);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.errors.map((error) => error.message).join("\n"));
    }

    expect(events).toEqual([
      "app-data:app:docs:docs:formless.storageSnapshot",
      "install:create:docs",
      "media:app:personal:media/images/hero.png",
      "app-data:app:personal:personal:formless.storageSnapshot",
      "install:create:personal",
    ]);
    expect(result.report.applied).toBe(true);
    expect(result.report.summary.createdInstalls).toEqual(["docs", "personal"]);
    expect(result.report.steps.map((step) => step.kind)).toEqual([
      "appData",
      "install",
      "media",
      "appData",
      "install",
    ]);
  });

  it("restores instance control-plane snapshots when present", async () => {
    const archive = instanceArchive({
      capabilities: ["installed-app-registry", "schema-owned-control-plane", "app-store-snapshots"],
      restorePolicy: { dryRun: false, installCollisions: "reject" },
      controlPlane: controlPlaneSnapshot({ records: [] }),
    });
    const events: string[] = [];
    const result = await applyPortableArchiveRestore(
      archive,
      memoryRestoreTarget({ events, restoreControlPlane: true }),
    );

    expect(result.ok).toBe(true);
    expect(events).toEqual([
      "app-data:app:personal:personal:formless.storageSnapshot",
      "install:create:personal",
      "control-plane:0",
    ]);
  });

  it("does not activate a new install when media restore fails", async () => {
    const activeInstalls = new Set<string>();
    const events: string[] = [];
    const result = await applyPortableArchiveRestore(
      appArchive({
        restorePolicy: { dryRun: false, installCollisions: "reject" },
        data: {
          ...storageSnapshot(),
          records: [coreImageBlock("hero"), siteRecord("rec_site_settings_personal", "personal")],
        },
        media: { objects: [coreMediaObject("hero")] },
      }),
      memoryRestoreTarget({
        activeInstalls,
        events,
        failAt: "media",
        mediaFiles: [coreMediaFile("hero")],
      }),
    );

    expect(result.ok).toBe(false);
    expect(events).toEqual(["media:app:personal:media/images/hero.png"]);
    expect([...activeInstalls]).toEqual([]);

    if (result.ok) {
      throw new Error("Expected media restore to fail.");
    }

    expect(result.errors.map((error) => error.code)).toEqual(["media-restore-failed"]);
  });

  it("does not activate a new install when app data restore fails", async () => {
    const activeInstalls = new Set<string>();
    const events: string[] = [];
    const result = await applyPortableArchiveRestore(
      appArchive({
        restorePolicy: { dryRun: false, installCollisions: "reject" },
      }),
      memoryRestoreTarget({
        activeInstalls,
        events,
        failAt: "appData",
      }),
    );

    expect(result.ok).toBe(false);
    expect(events).toEqual(["app-data:app:personal:personal:formless.storageSnapshot"]);
    expect([...activeInstalls]).toEqual([]);

    if (result.ok) {
      throw new Error("Expected app data restore to fail.");
    }

    expect(result.errors.map((error) => error.code)).toEqual(["app-data-restore-failed"]);
  });

  it("keeps a new install inactive when route activation fails", async () => {
    const activeInstalls = new Set<string>();
    const events: string[] = [];
    const result = await applyPortableArchiveRestore(
      appArchive({
        restorePolicy: { dryRun: false, installCollisions: "reject" },
      }),
      memoryRestoreTarget({
        activeInstalls,
        events,
        failAt: "install",
      }),
    );

    expect(result.ok).toBe(false);
    expect(events).toEqual([
      "app-data:app:personal:personal:formless.storageSnapshot",
      "install:create:personal",
    ]);
    expect([...activeInstalls]).toEqual([]);

    if (result.ok) {
      throw new Error("Expected install activation to fail.");
    }

    expect(result.errors.map((error) => error.code)).toEqual(["install-restore-failed"]);
  });

  it("restores a retargeted archive through selected app and document ownership", async () => {
    const installId = "personal-copy";
    const schema = documentSourceSchema();
    const object = documentMediaObject("report", "private", installId);
    const restoredDataIdentities: string[] = [];
    const restoredMedia: Array<{
      authorityName: string;
      object: AppArchiveMediaObject;
    }> = [];
    const events: string[] = [];
    const result = await applyPortableArchiveRestore(
      appArchive({
        app: archivedInstall(installId, "Personal Copy"),
        data: {
          ...storageSnapshot({
            schema,
            storageIdentity: `app:${installId}`,
          }),
          records: [
            siteRecord("rec_site_settings_personal_copy", installId),
            documentBlock("report"),
          ],
        },
        media: { objects: [object] },
        restorePolicy: { dryRun: false, installCollisions: "reject" },
      }),
      memoryRestoreTarget({
        events,
        mediaFiles: [
          {
            archivePath: object.archivePath,
            byteSize: documentBytes.byteLength,
            bytes: documentBytes,
            contentType: "application/pdf",
          },
        ],
        restoredDataIdentities,
        restoredMedia,
        sourceSchemas: { site: schema },
      }),
    );

    expect(result.ok).toBe(true);
    expect(events).toEqual([
      "media:app:personal-copy:media/app-installs/personal-copy/documents/report.pdf",
      "app-data:app:personal-copy:personal-copy:formless.storageSnapshot",
      "install:create:personal-copy",
    ]);
    expect(restoredDataIdentities).toEqual(["app:personal-copy"]);
    expect(restoredMedia).toEqual([
      {
        authorityName: "app:personal-copy",
        object: expect.objectContaining({
          asset: expect.objectContaining({
            deliveryHref: "/api/app-installs/site/personal-copy/media/documents/report.pdf",
            ownerAppInstallId: "personal-copy",
            storageKey: "media/app-installs/personal-copy/documents/report.pdf",
          }),
          deliveryHref: "/api/app-installs/site/personal-copy/media/documents/report.pdf",
          storageKey: "media/app-installs/personal-copy/documents/report.pdf",
        }),
      },
    ]);
  });

  it("refuses apply when the archive restore policy is dry-run", async () => {
    const events: string[] = [];
    const result = await applyPortableArchiveRestore(appArchive(), memoryRestoreTarget({ events }));

    expect(result.ok).toBe(false);
    expect(events).toEqual([]);

    if (result.ok) {
      throw new Error("Expected dry-run policy to fail apply.");
    }

    expect(result.errors).toEqual([
      {
        code: "dry-run-policy",
        message: "Archive restore policy is dry-run; apply requires dryRun false.",
      },
    ]);
  });

  it("returns planner errors without mutating the target", async () => {
    const events: string[] = [];
    const result = await applyPortableArchiveRestore(
      appArchive({
        restorePolicy: { dryRun: false, installCollisions: "reject" },
      }),
      memoryRestoreTarget({
        events,
        installedApps: [siteInstall("personal")],
      }),
    );

    expect(result.ok).toBe(false);
    expect(events).toEqual([]);

    if (result.ok) {
      throw new Error("Expected collision to fail planning.");
    }

    expect(result.errors.map((error) => error.code)).toEqual(["install-collision"]);
  });

  it("rejects unsupported archive versions without mutating the target", async () => {
    const events: string[] = [];
    const result = await applyPortableArchiveRestore(
      {
        ...appArchive({ restorePolicy: { dryRun: false, installCollisions: "reject" } }),
        version: 0,
      },
      memoryRestoreTarget({ events }),
    );

    expect(result.ok).toBe(false);
    expect(events).toEqual([]);

    if (result.ok) {
      throw new Error("Expected unsupported archive version to fail.");
    }

    expect(result.errors).toEqual([
      {
        code: "invalid-archive",
        message: "App archive version must be 2.",
      },
    ]);
  });

  it("restores core media archive objects through the media core", async () => {
    const identity = installedAppStorageIdentity({
      installId: "personal",
      packageAppKey: "site",
    });
    const writes: unknown[] = [];

    if (!identity) {
      throw new Error("Expected installed app identity.");
    }

    const response = await restoreArchiveMediaObjectToStore(
      {
        getObject: async () => undefined,
        putObject: async (write) => {
          writes.push(write);
        },
      },
      identity,
      coreMediaObject("hero"),
      pngBytes,
    );

    expect(response).toEqual({
      contentType: "image/png",
      href: "/api/formless/media/media/images/hero.png",
      key: "media/images/hero.png",
      size: pngBytes.byteLength,
    });
    expect(writes).toEqual([
      expect.objectContaining({
        bytes: pngBytes,
        contentType: "image/png",
        key: "media/images/hero.png",
      }),
    ]);
  });

  it("restores immutable documents and rejects incompatible target collisions", async () => {
    const identity = installedAppStorageIdentity({
      installId: "personal",
      packageAppKey: "site",
    });
    const object = documentMediaObject("report", "private");
    const writes: unknown[] = [];

    if (!identity || object.asset?.kind !== "document") {
      throw new Error("Expected installed app document fixture.");
    }
    const asset = object.asset;

    const response = await restoreArchiveMediaObjectToStore(
      {
        getObject: async () => undefined,
        putObject: async (write) => {
          writes.push(write);
        },
      },
      identity,
      object,
      documentBytes,
    );

    expect(response).toMatchObject({
      assetId: "report.pdf",
      href: "/api/app-installs/site/personal/media/documents/report.pdf",
      key: "media/app-installs/personal/documents/report.pdf",
    });
    expect(writes).toEqual([
      expect.objectContaining({
        contentType: "application/pdf",
        key: "media/app-installs/personal/documents/report.pdf",
        customMetadata: expect.objectContaining({
          "formless-media-document-access": "private",
          "formless-media-owner-app-install-id": "personal",
        }),
      }),
    ]);

    await expect(
      restoreArchiveMediaObjectToStore(
        {
          getObject: async () => ({
            body: new Uint8Array(documentBytes.byteLength).fill(1),
            customMetadata: mediaObjectMetadataForAsset(asset),
            httpEtag: "incompatible",
            writeHttpMetadata() {},
          }),
          putObject: async () => {
            throw new Error("Incompatible immutable media must not be overwritten.");
          },
        },
        identity,
        object,
        documentBytes,
      ),
    ).rejects.toThrow(
      'Archive document "media/app-installs/personal/documents/report.pdf" collides with incompatible immutable media.',
    );
  });

  it("preflights immutable document collisions before install or record mutation", async () => {
    const schema = documentSourceSchema();
    const object = documentMediaObject("report", "private");
    const events: string[] = [];
    const result = await applyPortableArchiveRestore(
      appArchive({
        restorePolicy: { dryRun: false, installCollisions: "reject" },
        data: {
          ...storageSnapshot(),
          schema,
          records: [siteRecord("rec_site_settings_personal", "personal"), documentBlock("report")],
        },
        media: { objects: [object] },
      }),
      memoryRestoreTarget({
        events,
        mediaFiles: [
          {
            archivePath: object.archivePath,
            byteSize: documentBytes.byteLength,
            bytes: documentBytes,
            contentType: "application/pdf",
          },
        ],
        sourceSchemas: { site: schema },
        validateObject: async () => {
          throw new Error("Immutable document collision.");
        },
      }),
    );

    expect(result.ok).toBe(false);
    expect(events).toEqual([]);

    if (result.ok) {
      throw new Error("Expected immutable collision preflight to fail.");
    }

    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "media-restore-failed",
        message: "Immutable document collision.",
        storageKey: object.storageKey,
      }),
    ]);
  });
});

function memoryRestoreTarget(input: {
  activeInstalls?: Set<string>;
  events: string[];
  failAt?: "appData" | "install" | "media";
  installedApps?: AppInstall[];
  mediaFiles?: ArchiveRestoreMediaRead[];
  restoredDataIdentities?: string[];
  restoredMedia?: Array<{
    authorityName: string;
    object: AppArchiveMediaObject;
  }>;
  restoreControlPlane?: boolean;
  sourceSchemas?: Partial<Record<string, StorageSnapshot["schema"]>>;
  validateObject?: NonNullable<ArchiveRestoreApplyTarget["media"]>["validateObject"];
}): ArchiveRestoreApplyTarget {
  return {
    listInstalledApps: () => input.installedApps ?? [],
    media: {
      listFiles: async () => input.mediaFiles ?? [],
      readFile: async (archivePath) =>
        input.mediaFiles?.find((file) => file.archivePath === archivePath),
      ...(input.validateObject === undefined ? {} : { validateObject: input.validateObject }),
      restoreObject: async ({ identity, object }) => {
        input.events.push(`media:${identity.authorityName}:${object.storageKey}`);
        input.restoredMedia?.push({
          authorityName: identity.authorityName,
          object,
        });

        if (input.failAt === "media") {
          throw new Error("Media restore failed.");
        }

        return {
          contentType: object.contentType,
          href: object.deliveryHref,
          key: object.storageKey,
          size: object.byteSize,
        };
      },
    },
    restoreAppData: ({ data, identity, app }) => {
      input.events.push(`app-data:${identity.authorityName}:${app.installId}:${data.kind}`);
      input.restoredDataIdentities?.push(identity.authorityName);

      if (input.failAt === "appData") {
        throw new Error("App data restore failed.");
      }

      return bootstrapResponse(data);
    },
    ...(input.restoreControlPlane
      ? {
          restoreControlPlane: (controlPlane) => {
            input.events.push(`control-plane:${controlPlane.records.length}`);
          },
        }
      : {}),
    restoreInstall: ({ action, install }) => {
      input.events.push(`install:${action}:${install.installId}`);

      if (input.failAt === "install") {
        throw new Error("Install activation failed.");
      }

      input.activeInstalls?.add(install.installId);
    },
    ...(input.sourceSchemas === undefined ? {} : { sourceSchemas: input.sourceSchemas }),
  };
}

function bootstrapResponse(data: AppArchive["data"]): BootstrapResponse {
  return {
    cursor: 0,
    records: [],
    schema: data.schema,
    schemaUpdatedAt: data.schemaUpdatedAt,
  };
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
        records: [siteRecord("rec_site_settings_personal", "personal")],
        schemaKey: app.sourceSchemaKey,
        storageIdentity: `app:${app.installId}`,
      }),
    media: { objects: [] },
    ...overrides,
  };
}

function archivedInstall(installId: string, label: string): AppArchive["app"] {
  return {
    installId,
    packageAppKey: "site",
    packageRevision: 1,
    sourceSchemaKey: "site",
    sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
    label,
    registrationPolicy: "closed",
    status: "installed",
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:01:00.000Z",
  };
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
    records: [siteRecord("rec_site_settings_personal", "personal")],
    ...overrides,
  };
}

function controlPlaneSnapshot(overrides: Partial<StorageSnapshot> = {}): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
    schemaKey: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
    exportedAt: now,
    schemaUpdatedAt: now,
    sourceCursor: 0,
    schema: instanceControlPlaneSchema,
    records: [],
    ...overrides,
  };
}

function siteRecord(id: string, key: string): StoredRecord {
  return {
    id,
    entity: "site",
    values: {
      key,
      label: `${key} Site`,
    },
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
  };
}

function coreImageBlock(name: string): StoredRecord {
  return {
    id: `rec_block_${name}`,
    entity: "block",
    values: {
      type: "image",
      label: `${name} image`,
      mediaAssetId: `${name}.png`,
    },
    createdAt: "2026-05-23T00:00:02.000Z",
    updatedAt: "2026-05-23T00:00:02.000Z",
  };
}

function documentBlock(name: string): StoredRecord {
  return {
    id: `rec_block_${name}`,
    entity: "block",
    values: {
      type: "image",
      label: `${name} document`,
      documentAssetId: `${name}.pdf`,
    },
    createdAt: "2026-05-23T00:00:02.000Z",
    updatedAt: "2026-05-23T00:00:02.000Z",
  };
}

function coreMediaObject(name: string): AppArchiveMediaObject {
  const storageKey = `media/images/${name}.png`;

  return {
    storageKey,
    archivePath: `media/personal/media/images/${name}.png`,
    asset: {
      byteSize: pngBytes.byteLength,
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
    byteSize: pngBytes.byteLength,
    deliveryHref: `/api/formless/media/${storageKey}`,
  };
}

function coreMediaFile(name: string): ArchiveRestoreMediaRead {
  return {
    archivePath: `media/personal/media/images/${name}.png`,
    byteSize: pngBytes.byteLength,
    bytes: pngBytes,
    contentType: "image/png",
  };
}

function documentMediaObject(
  name: string,
  access: "public" | "private",
  installId = "personal",
): AppArchiveMediaObject {
  const id = `${name}.pdf`;
  const storageKey = `media/app-installs/${installId}/documents/${id}`;
  const deliveryHref = `/api/app-installs/site/${installId}/media/documents/${id}`;

  return {
    archivePath: `media/personal/media/app-installs/personal/documents/${id}`,
    asset: {
      access,
      byteSize: documentBytes.byteLength,
      contentType: "application/pdf",
      deliveryHref,
      filename: id,
      id,
      kind: "document",
      label: id,
      ownerAppInstallId: installId,
      provider: "r2",
      status: "ready",
      storageKey,
    },
    byteSize: documentBytes.byteLength,
    contentType: "application/pdf",
    deliveryHref,
    storageKey,
  };
}
function documentSourceSchema() {
  const schema = structuredClone(siteSourceSchema);
  const block = schema.entities.find((definition) => definition.key === "block")!;
  if (!block) {
    throw new Error("Expected Site block schema.");
  }
  setKeyedDefinition(block.fields, "documentAssetId", {
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
    sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
    status: "installed",
    updatedAt: now,
  };
}
