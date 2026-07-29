import { describe, expect, it } from "vite-plus/test";
import {
  APP_ARCHIVE_KIND,
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  formatAppArchive,
  formatInstanceArchive,
  parseAppArchive,
  parseInstanceArchive,
  parsePortableArchive,
  type AppArchive,
  type AppArchiveMediaObject,
  type InstanceArchive,
} from "./index.ts";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import {
  appPackageManifestKind,
  appPackageManifestVersion,
  createAppPackageResolver,
} from "@dpeek/formless-installed-apps";
import {
  INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  instanceControlPlaneSchema,
} from "@dpeek/formless-instance-control-plane";
import { parseAppSchema } from "@dpeek/formless-schema";

const now = "2026-05-23T00:00:00.000Z";
const siteSourceSchemaHash =
  "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const archivePackageResolver = createAppPackageResolver([
  packageManifest({
    label: "Site",
    packageAppKey: "site",
    publicSite: true,
    sourceSchemaHash: siteSourceSchemaHash,
  }),
]);
const siteSourceSchema = parseAppSchema({
  version: 1,
  entities: [
    {
      id: "entity_b7492df1-ecf6-40dd-95b2-5d8bb7ee5a8e",
      key: "site",
      label: "Site",
      fields: [
        { key: "key", type: "text", required: true, label: "Key" },
        { key: "label", type: "text", required: true, label: "Label" },
      ],
      constraints: [{ key: "uniqueKey", kind: "unique", fields: ["key"] }],
      operations: writeOperations("Site", ["key", "label"]),
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
function writeOperations(label: string, fields: string[]) {
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
  ];
}
function packageManifest(input: {
  label: string;
  packageAppKey: string;
  publicSite?: boolean;
  sourceSchemaHash: string;
}): Record<string, unknown> {
  return {
    kind: appPackageManifestKind,
    version: appPackageManifestVersion,
    packageAppKey: input.packageAppKey,
    label: input.label,
    description: `${input.label} package fixture.`,
    defaultInstallId: input.packageAppKey,
    supportsMultipleInstalls: true,
    packageRevision: 1,
    sourceSchema: {
      kind: "bundled",
      key: input.packageAppKey,
      path: "schema.json",
    },
    sourceSchemaHash: input.sourceSchemaHash,
    capabilities: [
      {
        kind: "generatedAdmin",
        routeBase: "/apps",
      },
      ...(input.publicSite
        ? [
            {
              kind: "publicSite",
              routeBase: "/sites",
            },
          ]
        : []),
    ],
  };
}

describe("portable archive protocol", () => {
  it("parses the supported version 2 app archive envelope", () => {
    const archive = appArchive({
      data: {
        ...storageSnapshot(),
        records: [
          activeSiteRecord("rec_site_settings_primary"),
          {
            ...activeSiteRecord("rec_site_settings_old"),
            deletedAt: "2026-05-23T00:03:00.000Z",
          },
        ],
      },
    });

    expect(parseAppArchive(archive)).toEqual(archive);
    expect(parsePortableArchive(archive)).toEqual(archive);
  });

  it("accepts and preserves app install registration policy metadata", () => {
    const archive = appArchive({
      app: { ...archivedInstall("members", "Members"), registrationPolicy: "email-verified" },
    });
    const customOperationArchive = appArchive({
      app: {
        ...archivedInstall("profiles", "Profiles"),
        registrationOperation: "profile.register",
        registrationPolicy: "custom-operation",
      },
    });
    const formatted = JSON.parse(formatAppArchive(archive)) as AppArchive;
    const formattedCustomOperation = JSON.parse(
      formatAppArchive(customOperationArchive),
    ) as AppArchive;
    const omittedPolicyApp = { ...archive.app } as Record<string, unknown>;
    delete omittedPolicyApp.registrationPolicy;

    expect(parseAppArchive(archive).app.registrationPolicy).toBe("email-verified");
    expect(parseAppArchive(customOperationArchive).app).toMatchObject({
      registrationOperation: "profile.register",
      registrationPolicy: "custom-operation",
    });
    expect(formatted.app.registrationPolicy).toBe("email-verified");
    expect(formattedCustomOperation.app.registrationOperation).toBe("profile.register");
    expect(parseAppArchive({ ...archive, app: omittedPolicyApp }).app.registrationPolicy).toBe(
      "closed",
    );
    expect(() =>
      parseAppArchive({
        ...archive,
        app: { ...archive.app, registrationPolicy: "custom-operation" },
      }),
    ).toThrow(
      'App archive app registrationOperation is required when registrationPolicy is "custom-operation".',
    );
    expect(() =>
      parseAppArchive({
        ...archive,
        app: {
          ...archive.app,
          registrationOperation: "profile.register",
          registrationPolicy: "email-verified",
        },
      }),
    ).toThrow(
      'App archive app registrationOperation must be omitted unless registrationPolicy is "custom-operation".',
    );
    expect(() =>
      parseAppArchive({
        ...archive,
        app: { ...archive.app, registrationPolicy: "domain-allowlist" },
      }),
    ).toThrow(
      'App archive app registrationPolicy must be "closed", "email-verified", or "custom-operation".',
    );
  });

  it("parses instance archives as app archive collections", () => {
    const archive = instanceArchive({
      apps: [
        appArchive({ app: archivedInstall("docs", "Docs") }),
        appArchive({ app: archivedInstall("personal", "Personal") }),
      ],
    });

    expect(parseInstanceArchive(archive)).toEqual(archive);
    expect(parsePortableArchive(archive)).toEqual(archive);
  });

  it("parses reviewable instance control-plane records and rejects secrets", () => {
    const archive = instanceArchive({
      capabilities: [
        "installed-app-registry",
        "schema-owned-control-plane",
        "app-store-snapshots",
        "core-media-assets",
      ],
      controlPlane: controlPlaneSnapshot(),
    });
    expect(() => parseInstanceArchive(archive)).toThrow(
      'Instance archive controlPlane records route "route:site:public-site" requires an active package resolver',
    );
    const parsed = parseInstanceArchive(archive, { packageResolver: archivePackageResolver });
    const formatted = formatInstanceArchive(parsed, { packageResolver: archivePackageResolver });
    const formattedArchive = JSON.parse(formatted) as InstanceArchive;

    expect(parsed.controlPlane?.records.map((record) => record.entity)).toContain(
      "deployment-config",
    );
    expect(formattedArchive.controlPlane?.records.map((record) => record.entity)).toContain(
      "deployment-config",
    );
    expect(JSON.stringify(parsed.controlPlane)).not.toContain("rec_site");
    expect(
      parseInstanceArchive(formattedArchive, {
        packageResolver: archivePackageResolver,
      }).controlPlane?.records.map((record) => record.entity),
    ).toContain("deployment-config");
    expect(
      formatInstanceArchive(
        parseInstanceArchive(JSON.parse(formatted), {
          packageResolver: archivePackageResolver,
        }),
        {
          packageResolver: archivePackageResolver,
        },
      ),
    ).toBe(formatted);
    const controlPlane = archive.controlPlane;

    if (!controlPlane) {
      throw new Error("Expected control-plane archive records.");
    }

    const formattedObservedArchive = JSON.parse(
      formatInstanceArchive(
        {
          ...archive,
          controlPlane: {
            ...controlPlane,
            records: controlPlaneRecords({ observedCache: true }),
          },
        },
        {
          packageResolver: archivePackageResolver,
        },
      ),
    ) as InstanceArchive;

    expect(JSON.stringify(formattedObservedArchive.controlPlane?.records)).not.toContain(
      "observedStatus",
    );

    expect(() =>
      parseInstanceArchive(
        {
          ...archive,
          controlPlane: {
            ...controlPlane,
            records: controlPlaneRecords({
              accountId: "CF_API_TOKEN",
            }),
          },
        },
        { packageResolver: archivePackageResolver },
      ),
    ).toThrow("cannot store control-plane secret");
    expect(() =>
      parseInstanceArchive(
        {
          ...archive,
          controlPlane: {
            ...controlPlane,
            records: controlPlaneRecords().map((record) =>
              record.entity === "route" && record.id === "route:host:publicSite:www.example.com"
                ? {
                    ...record,
                    values: {
                      ...record.values,
                      toUrl: "https://example.com/CF_API_TOKEN",
                    },
                  }
                : record,
            ),
          },
        },
        { packageResolver: archivePackageResolver },
      ),
    ).toThrow(
      'Instance archive controlPlane records record "route:host:publicSite:www.example.com" field "instance:route.toUrl" cannot store control-plane secret values.',
    );
    expect(() =>
      parseInstanceArchive(
        {
          ...archive,
          controlPlane: {
            ...controlPlane,
            records: controlPlaneRecords().map((record) =>
              record.entity === "route" && record.id === "route:site:public-site"
                ? {
                    ...record,
                    values: {
                      ...record.values,
                      appInstall: "missing",
                    },
                  }
                : record,
            ),
          },
        },
        { packageResolver: archivePackageResolver },
      ),
    ).toThrow(
      'Instance archive controlPlane records record "route:site:public-site" field "instance:route.appInstall" references unknown instance:app-install record "missing".',
    );
    expect(() =>
      parseInstanceArchive(
        {
          ...archive,
          controlPlane: {
            ...controlPlane,
            records: controlPlaneRecords({ observedCache: true }),
          },
        },
        { packageResolver: archivePackageResolver },
      ),
    ).toThrow("cannot store runtime-observed deployment cache fields");
  });

  it("rejects deployment execution history as instance control-plane source", () => {
    const archive = instanceArchive({
      capabilities: [
        "installed-app-registry",
        "schema-owned-control-plane",
        "app-store-snapshots",
        "core-media-assets",
      ],
      controlPlane: controlPlaneSnapshot({
        records: [
          ...controlPlaneRecords(),
          {
            id: "deploy-drift:instance.primary",
            entity: "deploy-drift-report",
            values: {
              deployTarget: "instance.primary",
              versionId: "version-1",
              desiredStateHash: "hash-1",
              revision: 1,
              status: "in-sync",
              actorKind: "runner",
              actorId: "runner",
              affectedLogicalIdsJson: "[]",
              createCount: 0,
              updateCount: 0,
              deleteCount: 0,
              reportedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
        ],
      }),
    });

    expect(() => parseInstanceArchive(archive)).toThrow(
      'Instance archive controlPlane records record "deploy-drift:instance.primary" references unknown entity "deploy-drift-report".',
    );
  });

  it("rejects unknown kinds, unsupported versions, and missing sections", () => {
    expect(() => parsePortableArchive({ kind: "formless.futureArchive", version: 1 })).toThrow(
      'Archive kind "formless.futureArchive" is unsupported.',
    );

    expect(() => parseAppArchive({ ...appArchive(), version: 3 })).toThrow(
      "App archive version must be 2.",
    );

    expect(() => parseInstanceArchive({ ...instanceArchive(), kind: APP_ARCHIVE_KIND })).toThrow(
      'Instance archive kind must be "formless.instanceArchive".',
    );

    const missingData = { ...appArchive() } as Record<string, unknown>;
    delete missingData.data;

    expect(() => parseAppArchive(missingData)).toThrow('App archive must include "data".');
  });

  it("rejects precise invalid archive fields", () => {
    expect(() =>
      parseAppArchive({
        ...appArchive(),
        capabilities: ["unknown-capability"],
      }),
    ).toThrow('App archive capabilities[0] "unknown-capability" is unsupported.');

    expect(() =>
      parseAppArchive({
        ...appArchive(),
        restorePolicy: { dryRun: true, installCollisions: "overwrite" },
      }),
    ).toThrow('App archive restorePolicy installCollisions must be "reject" or "replace".');

    expect(() =>
      parseAppArchive({
        ...appArchive(),
        media: {
          objects: [{ ...mediaObject("hero"), byteSize: 1.5 }],
        },
      }),
    ).toThrow("App archive media objects[0] byteSize must be a non-negative integer.");

    expect(() =>
      parseAppArchive({
        ...appArchive(),
        app: { ...archivedInstall("api", "API") },
      }),
    ).toThrow('App archive app installId is invalid: Install id "api" is reserved.');
  });

  it("formats app archives deterministically", () => {
    const archive = appArchive({
      capabilities: ["core-media-assets", "app-store-snapshots"],
      data: {
        ...storageSnapshot(),
        records: [
          {
            ...activeSiteRecord("rec_site_settings_zeta"),
            values: {
              zeta: "forward",
              label: "Zeta",
              key: "zeta",
              alpha: "forward",
            },
            createdAt: "2026-05-23T00:00:01.000Z",
          },
          {
            ...activeSiteRecord("rec_site_settings_alpha"),
            values: {
              label: "Alpha",
              key: "alpha",
            },
            createdAt: "2026-05-23T00:00:02.000Z",
            deletedAt: "2026-05-23T00:00:03.000Z",
          },
        ],
      },
      media: {
        objects: [mediaObject("zeta"), mediaObject("alpha")],
      },
    });
    const formatted = formatAppArchive(archive);
    const reparsed = parseAppArchive(JSON.parse(formatted));

    expect(formatAppArchive(reparsed)).toBe(formatted);
    expect(formatted.endsWith("\n")).toBe(true);
    expect(reparsed.capabilities).toEqual(["app-store-snapshots", "core-media-assets"]);
    expect(reparsed.media.objects.map((object) => object.storageKey)).toEqual([
      "media/images/alpha.png",
      "media/images/zeta.png",
    ]);
    expect(
      reparsed.data.kind === STORAGE_SNAPSHOT_KIND
        ? reparsed.data.records.map((record) => record.id)
        : [],
    ).toEqual(["rec_site_settings_alpha", "rec_site_settings_zeta"]);
    expect(Object.keys(reparsed.data.records[0]!.values)).toEqual(["key", "label"]);
    expect(Object.keys(reparsed.data.records[1]!.values)).toEqual([
      "key",
      "label",
      "alpha",
      "zeta",
    ]);
  });

  it("parses and formats public and private document asset metadata", () => {
    const archive = appArchive({
      media: {
        objects: [documentMediaObject("issued", "public"), documentMediaObject("draft", "private")],
      },
    });
    const reparsed = parseAppArchive(JSON.parse(formatAppArchive(archive)));

    expect(reparsed.media.objects.map((object) => object.asset)).toEqual([
      expect.objectContaining({
        access: "private",
        filename: "draft.pdf",
        id: "draft.pdf",
        kind: "document",
        ownerAppInstallId: "personal",
      }),
      expect.objectContaining({
        access: "public",
        filename: "issued.pdf",
        id: "issued.pdf",
        kind: "document",
        ownerAppInstallId: "personal",
      }),
    ]);

    expect(() =>
      parseAppArchive({
        ...archive,
        media: {
          objects: [
            {
              ...documentMediaObject("draft", "private"),
              asset: {
                ...documentMediaObject("draft", "private").asset,
                ownerAppInstallId: "other",
              },
            },
          ],
        },
      }),
    ).toThrow("must be valid document media metadata");
  });

  it("formats instance archives deterministically by install id", () => {
    const archive = instanceArchive({
      capabilities: ["core-media-assets", "installed-app-registry"],
      apps: [
        appArchive({ app: archivedInstall("zeta", "Zeta") }),
        appArchive({ app: archivedInstall("alpha", "Alpha") }),
      ],
    });
    const formatted = formatInstanceArchive(archive);
    const reparsed = parseInstanceArchive(JSON.parse(formatted));

    expect(formatInstanceArchive(reparsed)).toBe(formatted);
    expect(reparsed.capabilities).toEqual(["installed-app-registry", "core-media-assets"]);
    expect(reparsed.apps.map((app) => app.app.installId)).toEqual(["alpha", "zeta"]);
  });
});

function instanceArchive(overrides: Partial<InstanceArchive> = {}): InstanceArchive {
  return {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: now,
    capabilities: ["installed-app-registry", "app-store-snapshots", "core-media-assets"],
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
    capabilities: ["app-store-snapshots", "core-media-assets"],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    app,
    data:
      overrides.data ??
      storageSnapshot({ schemaKey: app.sourceSchemaKey, storageIdentity: `app:${app.installId}` }),
    media: { objects: [mediaObject("hero")] },
    ...overrides,
  };
}

function archivedInstall(installId: string, label: string): AppArchive["app"] {
  return {
    installId,
    packageAppKey: "site",
    packageRevision: 1,
    sourceSchemaKey: "site",
    sourceSchemaHash: siteSourceSchemaHash,
    label,
    registrationPolicy: "closed",
    status: "installed",
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:01:00.000Z",
  };
}
function controlPlaneRecords(
  options: {
    accountId?: string;
    observedCache?: boolean;
  } = {},
): StoredRecord[] {
  return [
    {
      id: "site",
      entity: "app-install",
      values: {
        installId: "site",
        packageAppKey: "site",
        label: "Site",
        registrationPolicy: "closed",
        status: "installed",
        storageIdentity: "app:site",
      },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "route:site:public-site",
      entity: "route",
      values: {
        enabled: true,
        matchPath: "/sites/site",
        matchPrefix: "/sites/site/",
        kind: "mount",
        targetProfile: "public-site",
        appInstall: "site",
        surface: "public-site",
      },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "route:host:publicSite:www.example.com",
      entity: "route",
      values: {
        enabled: true,
        matchHost: "www.example.com",
        matchPath: "/",
        matchPrefix: "/",
        kind: "mount",
        targetProfile: "public-site",
        appInstall: "site",
        surface: "public-site",
      },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "instance.primary",
      entity: "deployment-config",
      values: {
        targetId: "instance.primary",
        targetKind: "instance",
        label: "instance.primary",
        enabled: true,
        targetUrl: "https://personal.dpeek.workers.dev",
        providerFamily: "cloudflare",
        ...(options.accountId === undefined ? {} : { accountId: options.accountId }),
        ...(options.observedCache
          ? {
              observedAt: now,
              observedDesiredStateHash:
                "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              observedError: "none",
              observedRunnerId: "local-gateway",
              observedStatus: "deployed",
              observedSummary: "Deployed revision 2",
            }
          : {}),
      },
      createdAt: now,
      updatedAt: now,
    },
  ];
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
    records: [activeSiteRecord("rec_site_settings_primary")],
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
    sourceCursor: controlPlaneRecords().length,
    schema: instanceControlPlaneSchema,
    records: controlPlaneRecords(),
    ...overrides,
  };
}

function activeSiteRecord(id: string, values: StoredRecord["values"] = {}): StoredRecord {
  const createdAt = id.endsWith("alpha") ? "2026-05-23T00:00:01.000Z" : "2026-05-23T00:00:02.000Z";

  return {
    id,
    entity: "site",
    values: {
      key: "primary",
      label: "Primary Site",
      ...values,
    },
    createdAt,
    updatedAt: createdAt,
  };
}

function mediaObject(name: string): AppArchiveMediaObject {
  const storageKey = `media/images/${name}.png`;
  const deliveryHref = `/api/formless/media/${storageKey}`;

  return {
    storageKey,
    archivePath: `media/personal/media/images/${name}.png`,
    asset: {
      byteSize: name.length,
      contentType: "image/png",
      deliveryHref,
      id: `${name}.png`,
      kind: "image",
      label: `${name}.png`,
      provider: "r2",
      status: "ready",
      storageKey,
    },
    contentType: "image/png",
    byteSize: name.length,
    deliveryHref,
  };
}

function documentMediaObject(name: string, access: "public" | "private"): AppArchiveMediaObject {
  const id = `${name}.pdf`;
  const storageKey = `media/app-installs/personal/documents/${id}`;
  const deliveryHref = `/api/app-installs/site/personal/media/documents/${id}`;

  return {
    storageKey,
    archivePath: `media/personal/${storageKey}`,
    asset: {
      access,
      byteSize: name.length,
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
    contentType: "application/pdf",
    byteSize: name.length,
    deliveryHref,
  };
}
