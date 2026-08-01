import path from "node:path";

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vite-plus/test";
import rawCrmAppPackageManifest from "@dpeek/formless-crm-app/formless.app.json";
import {
  INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
  INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  canonicalizeInstanceControlPlaneStorageSnapshot,
  formatInstanceControlPlaneBoundaryEntityName,
  instanceControlPlaneRecordSourceEntityName,
  instanceControlPlaneSchema,
  instanceControlPlaneSchemaProvenance,
  parseInstanceControlPlaneStorageSnapshot,
} from "@dpeek/formless-instance-control-plane";
import { parseAppSchema } from "@dpeek/formless-schema";

import {
  STORAGE_SNAPSHOT_KIND,
  STORAGE_SNAPSHOT_VERSION,
  type StorageSnapshot,
  type StoredRecord,
} from "@dpeek/formless-storage";

import {
  appPackageManifestKind,
  appPackageManifestVersion,
  computeSourceSchemaHash,
  createAppPackageResolver,
  findResolvedAppPackage,
  parseAppPackageManifest,
  type AppPackageCapability,
  type AppPackageManifest,
  type SourceSchemaHash,
} from "@dpeek/formless-installed-apps";
import {
  INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME,
  INSTANCE_WORKSPACE_AUTO_SAVE_STATE_PATH,
  INSTANCE_WORKSPACE_GITIGNORE_ENTRY,
  INSTANCE_WORKSPACE_LOCAL_DEV_SECRET_STATE_PATH,
  INSTANCE_WORKSPACE_OWNER_SESSION_SECRET_ENV_NAME,
  INSTANCE_WORKSPACE_SECRET_STATE_PATH,
  WORKSPACE_MEDIA_MANIFEST_FILE,
  WORKSPACE_RECORD_STATE_FILE_KIND,
  createWorkspaceAppPackageResolver,
  createWorkspaceOperationState,
  resolveFormlessConfig,
  ensureInstanceWorkspaceLocalDevSecretState,
  ensureInstanceWorkspaceSecretStateIgnored,
  formatInstanceWorkspaceLocalDevSecretState,
  formatInstanceWorkspaceSecretState,
  initialWorkspaceAutoSaveState,
  instanceWorkspaceAutoSaveStatePath,
  instanceWorkspaceMediaFilePath,
  instanceWorkspaceMediaManifestPath,
  instanceWorkspaceLocalDevSecretStatePath,
  instanceWorkspaceSecretStatePath,
  nextWorkspaceAutoSaveEnqueuedState,
  parseInstanceWorkspaceLocalDevSecretState,
  parseInstanceWorkspaceSecretState,
  readInstanceWorkspaceAutoSaveState,
  readInstanceWorkspaceAppStorageSnapshot,
  readInstanceWorkspaceControlPlaneStorageSnapshot as readWorkspaceControlPlaneSnapshot,
  readWorkspaceOperationState,
  readInstanceWorkspaceLocalDevSecretState,
  readInstanceWorkspaceMediaFiles,
  readInstanceWorkspaceSecretState,
  resolveInstanceWorkspaceAdminToken,
  replaceInstanceWorkspaceMediaFiles,
  listWorkspaceOperationStates,
  updateWorkspaceOperationState,
  workspaceOperationStatePath,
  workspaceOperationStateRoot,
  writeInstanceWorkspaceAppStorageSnapshot,
  writeInstanceWorkspaceAutoSaveState,
  writeInstanceWorkspaceControlPlaneStorageSnapshot as writeWorkspaceControlPlaneSnapshot,
  writeInstanceWorkspaceLocalDevSecretState,
  writeInstanceWorkspaceSecretState,
} from "./node.ts";

function controlPlaneSnapshotContract() {
  return {
    canonicalize: (
      snapshot: StorageSnapshot,
      input: { context?: string; sourceLabel?: string } = {},
    ) =>
      canonicalizeInstanceControlPlaneStorageSnapshot(snapshot, {
        ...input,
      }),
    formatRecordEntity: (entity: string) => {
      const sourceEntity = instanceControlPlaneRecordSourceEntityName(entity);
      return sourceEntity === undefined
        ? entity
        : formatInstanceControlPlaneBoundaryEntityName(sourceEntity);
    },
    normalizeRecordEntity: (entity: string) =>
      instanceControlPlaneRecordSourceEntityName(entity) ?? entity,
    parse: (context: string, value: unknown) =>
      parseInstanceControlPlaneStorageSnapshot(context, value),
    schema: instanceControlPlaneSchema,
    schemaKey: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
    schemaProvenance: instanceControlPlaneSchemaProvenance,
    storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  };
}

function readInstanceWorkspaceControlPlaneStorageSnapshot(
  input: Omit<
    Parameters<typeof readWorkspaceControlPlaneSnapshot>[0],
    "controlPlaneSnapshotContract"
  >,
) {
  return readWorkspaceControlPlaneSnapshot({
    ...input,
    controlPlaneSnapshotContract: controlPlaneSnapshotContract(),
  });
}

function writeInstanceWorkspaceControlPlaneStorageSnapshot(
  input: Omit<
    Parameters<typeof writeWorkspaceControlPlaneSnapshot>[0],
    "controlPlaneSnapshotContract"
  >,
) {
  return writeWorkspaceControlPlaneSnapshot({
    ...input,
    controlPlaneSnapshotContract: controlPlaneSnapshotContract(),
  });
}

const tempDirs: string[] = [];
const workspaceTestBundledManifests = [
  workspaceTestPackageManifest({
    label: "Site",
    packageAppKey: "site",
    sourceSchemaHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
  }),
  workspaceTestPackageManifest({
    label: "Tasks",
    packageAppKey: "tasks",
    sourceSchemaHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
  }),
  parseAppPackageManifest(rawCrmAppPackageManifest, "CRM package manifest"),
];
const workspaceFixtureTaskSourceSchema = {
  version: 1,
  entities: [
    {
      id: "entity_2021e1ef-3373-419d-8804-af380d03928a",
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
};
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
afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

describe("Formless instance workspace secret state", () => {
  it("defines the ignored workspace secret path", () => {
    expect(INSTANCE_WORKSPACE_SECRET_STATE_PATH).toBe(".formless/instance.env");
    expect(INSTANCE_WORKSPACE_LOCAL_DEV_SECRET_STATE_PATH).toBe(".formless/local/dev.env");
    expect(INSTANCE_WORKSPACE_AUTO_SAVE_STATE_PATH).toBe(".formless/local/auto-save.json");
    expect(INSTANCE_WORKSPACE_GITIGNORE_ENTRY).toBe(".formless/");
    expect(instanceWorkspaceSecretStatePath("/workspace")).toBe(
      path.join("/workspace", ".formless/instance.env"),
    );
    expect(instanceWorkspaceLocalDevSecretStatePath("/workspace/.formless/local")).toBe(
      path.join("/workspace/.formless/local", "dev.env"),
    );
    expect(instanceWorkspaceAutoSaveStatePath("/workspace/.formless/local")).toBe(
      path.join("/workspace/.formless/local", "auto-save.json"),
    );
  });

  it("parses and formats automation admin token env state", () => {
    const parsed = parseInstanceWorkspaceSecretState(
      '# local instance secrets\nFORMLESS_ADMIN_TOKEN="admin secret"\n',
    );

    expect(parsed).toEqual({ adminToken: "admin secret" });
    expect(formatInstanceWorkspaceSecretState(parsed)).toBe(
      'FORMLESS_ADMIN_TOKEN="admin secret"\n',
    );
    expect(formatInstanceWorkspaceSecretState({})).toBe("");
    expect(INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME).toBe("FORMLESS_ADMIN_TOKEN");
    expect(INSTANCE_WORKSPACE_OWNER_SESSION_SECRET_ENV_NAME).toBe("FORMLESS_OWNER_SESSION_SECRET");
  });

  it("reads, writes, and completes ignored local dev secret state", async () => {
    const workspaceRoot = await makeTempDir();
    const localStateRoot = path.join(workspaceRoot, ".formless/local");

    expect(
      parseInstanceWorkspaceLocalDevSecretState(
        "FORMLESS_ADMIN_TOKEN=admin\nFORMLESS_OWNER_SESSION_SECRET=session\n",
      ),
    ).toEqual({ adminToken: "admin", ownerSessionSecret: "session" });
    expect(
      formatInstanceWorkspaceLocalDevSecretState({
        adminToken: "admin",
        ownerSessionSecret: "session",
      }),
    ).toBe("FORMLESS_ADMIN_TOKEN=admin\nFORMLESS_OWNER_SESSION_SECRET=session\n");
    await expect(readInstanceWorkspaceLocalDevSecretState(localStateRoot)).resolves.toEqual({});

    const write = await writeInstanceWorkspaceLocalDevSecretState(localStateRoot, {
      adminToken: "persisted-admin",
      ownerSessionSecret: "persisted-session",
    });

    expect(write).toEqual({
      path: path.join(workspaceRoot, ".formless/local/dev.env"),
      state: {
        adminToken: "persisted-admin",
        ownerSessionSecret: "persisted-session",
      },
    });
    await expect(readFile(write.path, "utf8")).resolves.toBe(
      "FORMLESS_ADMIN_TOKEN=persisted-admin\nFORMLESS_OWNER_SESSION_SECRET=persisted-session\n",
    );

    await writeFile(write.path, "FORMLESS_ADMIN_TOKEN=persisted-admin\n");
    await expect(
      ensureInstanceWorkspaceLocalDevSecretState(
        workspaceRoot,
        localStateRoot,
        () => "generated-session",
      ),
    ).resolves.toMatchObject({
      state: {
        adminToken: "persisted-admin",
        ownerSessionSecret: "generated-session",
      },
    });
    await expect(readFile(path.join(workspaceRoot, ".gitignore"), "utf8")).resolves.toBe(
      ".formless/\n",
    );
  });

  it("resolves explicit and environment token overrides before ignored state", () => {
    expect(
      resolveInstanceWorkspaceAdminToken({
        env: { FORMLESS_ADMIN_TOKEN: "env-token" },
        explicitAdminToken: "explicit-token",
        secretState: { adminToken: "state-token" },
      }),
    ).toBe("explicit-token");
    expect(
      resolveInstanceWorkspaceAdminToken({
        env: { FORMLESS_ADMIN_TOKEN: "env-token" },
        secretState: { adminToken: "state-token" },
      }),
    ).toBe("env-token");
    expect(
      resolveInstanceWorkspaceAdminToken({
        env: {},
        secretState: { adminToken: "state-token" },
      }),
    ).toBe("state-token");
    expect(
      resolveInstanceWorkspaceAdminToken({
        env: {},
        secretState: {},
      }),
    ).toBeNull();
  });

  it("reads and writes ignored workspace secret state", async () => {
    const workspaceRoot = await makeTempDir();

    await expect(readInstanceWorkspaceSecretState(workspaceRoot)).resolves.toEqual({});

    const write = await writeInstanceWorkspaceSecretState(workspaceRoot, {
      adminToken: "secret",
    });

    expect(write).toEqual({
      path: path.join(workspaceRoot, ".formless/instance.env"),
      state: { adminToken: "secret" },
    });
    await expect(readFile(write.path, "utf8")).resolves.toBe("FORMLESS_ADMIN_TOKEN=secret\n");
    await expect(readInstanceWorkspaceSecretState(workspaceRoot)).resolves.toEqual({
      adminToken: "secret",
    });
  });

  it("ensures workspace secret state is ignored without duplicates", async () => {
    const workspaceRoot = await makeTempDir();

    await writeFile(path.join(workspaceRoot, ".gitignore"), "dist\n");
    await ensureInstanceWorkspaceSecretStateIgnored(workspaceRoot);
    await ensureInstanceWorkspaceSecretStateIgnored(workspaceRoot);

    await expect(readFile(path.join(workspaceRoot, ".gitignore"), "utf8")).resolves.toBe(
      "dist\n.formless/\n",
    );

    const existingRoot = await makeTempDir();

    await writeFile(path.join(existingRoot, ".gitignore"), ".formless\nnode_modules\n");
    await ensureInstanceWorkspaceSecretStateIgnored(existingRoot);
    await expect(readFile(path.join(existingRoot, ".gitignore"), "utf8")).resolves.toBe(
      ".formless\nnode_modules\n",
    );
  });
});

describe("workspace app package source resolver", () => {
  it("defaults to bundled packages when package links are omitted", async () => {
    const workspaceRoot = await makeTempDir();
    const manifest = resolveFormlessConfig({ name: "personal-sites" });
    const result = await createWorkspaceAppPackageResolver({
      bundledManifests: workspaceTestBundledManifests,
      manifest,
      workspaceRoot,
    });

    expect(result.packageLinks).toEqual([]);
    expect(result.linkedPackages).toEqual([]);
    expect(result.resolver.findPackage("site")).toMatchObject({
      packageAppKey: "site",
      sourceOrigin: "bundled",
    });
    expect(result.resolver.findPackage("private-labs")).toBeUndefined();
  });

  it("reads sibling linked package manifests and source schemas", async () => {
    const root = await makeTempDir();
    const workspaceRoot = path.join(root, "instance");
    const packageRoot = path.join(root, "app");
    const manifest = workspaceManifestWithPackageLink("../app/formless.app.json");

    const fixture = await writeWorkspaceAppPackageFixture(packageRoot);

    const result = await createWorkspaceAppPackageResolver({
      bundledManifests: workspaceTestBundledManifests,
      manifest,
      workspaceRoot,
    });
    const linkedPackage = result.linkedPackages[0];

    expect(
      findResolvedAppPackage(
        "private-labs",
        createAppPackageResolver(workspaceTestBundledManifests),
      ),
    ).toBeUndefined();
    expect(result.resolver.findPackage("private-labs")).toMatchObject({
      defaultInstallId: "labs",
      label: "Private Labs",
      packageAppKey: "private-labs",
      packageRevision: 7,
      sourceOrigin: "workspace",
      sourceSchemaHash: fixture.sourceSchemaHash,
      sourceSchemaKey: "private-labs",
    });
    expect(result.resolver.listPackages().map((appPackage) => appPackage.packageAppKey)).toEqual([
      "site",
      "tasks",
      "crm",
      "private-labs",
    ]);
    expect(linkedPackage).toMatchObject({
      appPackage: expect.objectContaining({ packageAppKey: "private-labs" }),
      manifest: expect.objectContaining({ packageAppKey: "private-labs" }),
      manifestPath: path.join(packageRoot, "formless.app.json"),
      packageRoot,
      sourceSchemaHash: fixture.sourceSchemaHash,
      sourceSchemaPath: path.join(packageRoot, "source/schema.json"),
    });
    expect(
      linkedPackage?.sourceSchema.entities.find((definition) => definition.key === "task"),
    ).toBeDefined();
  });

  it("links a package outside the workspace root through workspace package links", async () => {
    const root = await makeTempDir();
    const workspaceRoot = path.join(root, "instance");
    const packageRoot = path.join(root, "packages/client-orders");
    const fixture = await writeWorkspaceAppPackageFixture(packageRoot, {
      defaultInstallId: "orders",
      label: "Client Orders",
      packageAppKey: "client-orders",
      packageRevision: 3,
    });
    const manifestLink = path.relative(workspaceRoot, fixture.manifestPath);
    const manifest = workspaceManifestWithPackageLink(manifestLink);

    const result = await createWorkspaceAppPackageResolver({
      bundledManifests: workspaceTestBundledManifests,
      manifest,
      workspaceRoot,
    });
    const linkedPackage = result.linkedPackages[0];

    expect(
      findResolvedAppPackage(
        "client-orders",
        createAppPackageResolver(workspaceTestBundledManifests),
      ),
    ).toBeUndefined();
    expect(result.resolver.findPackage("client-orders")).toMatchObject({
      defaultInstallId: "orders",
      label: "Client Orders",
      packageAppKey: "client-orders",
      packageRevision: 3,
      sourceOrigin: "workspace",
      sourceSchemaHash: fixture.sourceSchemaHash,
      sourceSchemaKey: "client-orders",
    });
    expect(result.resolver.listPackages().map((appPackage) => appPackage.packageAppKey)).toEqual([
      "site",
      "tasks",
      "crm",
      "client-orders",
    ]);
    expect(linkedPackage).toMatchObject({
      appPackage: expect.objectContaining({ packageAppKey: "client-orders" }),
      manifest: expect.objectContaining({ packageAppKey: "client-orders" }),
      manifestPath: fixture.manifestPath,
      packageRoot,
      sourceSchemaHash: fixture.sourceSchemaHash,
      sourceSchemaPath: fixture.sourceSchemaPath,
    });
    expect(
      linkedPackage?.sourceSchema.entities.find((definition) => definition.key === "task"),
    ).toBeDefined();
  });

  it("rejects linked source schemas that do not parse as app schemas", async () => {
    const root = await makeTempDir();
    const workspaceRoot = path.join(root, "instance");
    const packageRoot = path.join(root, "app");
    const invalidSchema = { version: 1 };
    const manifest = workspaceManifestWithPackageLink("../app/formless.app.json");

    await writeWorkspaceAppPackageFixture(packageRoot, { sourceSchema: invalidSchema });

    await expect(
      createWorkspaceAppPackageResolver({
        bundledManifests: workspaceTestBundledManifests,
        manifest,
        workspaceRoot,
      }),
    ).rejects.toThrow('Schema must include "entities".');
  });

  it("rejects linked source schema hash mismatches", async () => {
    const root = await makeTempDir();
    const workspaceRoot = path.join(root, "instance");
    const packageRoot = path.join(root, "app");
    const manifest = workspaceManifestWithPackageLink("../app/formless.app.json");

    await writeWorkspaceAppPackageFixture(packageRoot, {
      sourceSchemaHash: `sha256:${"2".repeat(64)}`,
    });

    await expect(
      createWorkspaceAppPackageResolver({
        bundledManifests: workspaceTestBundledManifests,
        manifest,
        workspaceRoot,
      }),
    ).rejects.toThrow(/does not match manifest sourceSchemaHash/);
  });
});

describe("workspace record state node files", () => {
  it("writes and reads control-plane record state without embedding schema source", async () => {
    const workspaceRoot = await makeTempDir();
    const manifest = resolveFormlessConfig({ name: "personal-sites" });
    const records: StoredRecord[] = [
      {
        id: "settings:instance",
        entity: "instance-settings",
        values: {
          settingsId: INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
          canonicalOrigin: "https://www.example.com",
          defaultEmailDomain: "email-domain:mail.example.com",
          defaultContactSender: "email-sender:contact@mail.example.com",
          contactNotificationRecipient: "owner@example.com",
          productionIdentityStatus: "configured",
        },
        createdAt: "2026-06-18T00:00:00.000Z",
        updatedAt: "2026-06-18T00:00:00.000Z",
      },
      {
        id: "email-domain:mail.example.com",
        entity: "email-domain",
        values: {
          enabled: true,
          providerFamily: "cloudflare",
          domain: "mail.example.com",
          dnsStatus: "pending",
        },
        createdAt: "2026-06-18T00:00:00.000Z",
        updatedAt: "2026-06-18T00:00:00.000Z",
      },
      {
        id: "email-sender:contact@mail.example.com",
        entity: "email-sender",
        values: {
          enabled: true,
          address: "contact@mail.example.com",
          purpose: "contact-notification",
          emailDomain: "email-domain:mail.example.com",
        },
        createdAt: "2026-06-18T00:00:00.000Z",
        updatedAt: "2026-06-18T00:00:00.000Z",
      },
    ];
    const snapshot: StorageSnapshot = {
      kind: STORAGE_SNAPSHOT_KIND,
      version: STORAGE_SNAPSHOT_VERSION,
      storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
      schemaKey: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
      exportedAt: "2026-06-18T00:00:00.000Z",
      schemaUpdatedAt: "2026-06-18T00:00:01.000Z",
      sourceCursor: records.length,
      schema: instanceControlPlaneSchema,
      records,
    };

    await writeInstanceWorkspaceControlPlaneStorageSnapshot({
      manifest,
      snapshot,
      workspaceRoot,
    });

    const fileText = await readFile(path.join(workspaceRoot, "state/instance.json"), "utf8");
    const file = JSON.parse(fileText) as Record<string, unknown>;

    expect(file.kind).toBe(WORKSPACE_RECORD_STATE_FILE_KIND);
    expect(file.storageIdentity).toBe(INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY);
    expect(file.schema).toBeUndefined();
    expect(file.schemaProvenance).toEqual(instanceControlPlaneSchemaProvenance);
    expect((file.records as StoredRecord[]).map((record) => record.entity)).toEqual([
      "instance:instance-settings",
      "instance:email-domain",
      "instance:email-sender",
    ]);
    await expect(
      readInstanceWorkspaceControlPlaneStorageSnapshot({ manifest, workspaceRoot }),
    ).resolves.toMatchObject({
      records: [
        { entity: "instance-settings", id: "settings:instance" },
        { entity: "email-domain", id: "email-domain:mail.example.com" },
        { entity: "email-sender", id: "email-sender:contact@mail.example.com" },
      ],
      schemaKey: snapshot.schemaKey,
      storageIdentity: snapshot.storageIdentity,
    });
  });

  it("rejects control-plane record state when provenance does not match the resolved schema", async () => {
    const workspaceRoot = await makeTempDir();
    const manifest = resolveFormlessConfig({ name: "personal-sites" });
    const snapshot: StorageSnapshot = {
      kind: STORAGE_SNAPSHOT_KIND,
      version: STORAGE_SNAPSHOT_VERSION,
      storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
      schemaKey: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
      exportedAt: "2026-06-18T00:00:00.000Z",
      schemaUpdatedAt: "2026-06-18T00:00:01.000Z",
      sourceCursor: 0,
      schema: instanceControlPlaneSchema,
      records: [],
    };

    await writeInstanceWorkspaceControlPlaneStorageSnapshot({
      manifest,
      snapshot,
      workspaceRoot,
    });

    const filePath = path.join(workspaceRoot, "state/instance.json");
    const file = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;

    file.schemaProvenance = {
      kind: "instance-control-plane",
      sourceSchemaHash: `sha256:${"0".repeat(64)}`,
    };
    await writeFile(filePath, `${JSON.stringify(file, null, 2)}\n`);

    await expect(
      readInstanceWorkspaceControlPlaneStorageSnapshot({ manifest, workspaceRoot }),
    ).rejects.toThrow(
      "Workspace instance state state/instance.json schemaProvenance does not match resolved runtime source.",
    );
  });

  it("validates Program-native public Site route record state without package resolution", async () => {
    const workspaceRoot = await makeTempDir();
    const manifest = resolveFormlessConfig({ name: "personal-sites" });
    const records: StoredRecord[] = [
      {
        id: "labs",
        entity: "app-install",
        values: {
          installId: "labs",
          packageAppKey: "private-labs",
          label: "Private Labs",
          status: "installed",
          storageIdentity: "app:labs",
        },
        createdAt: "2026-06-18T00:00:00.000Z",
        updatedAt: "2026-06-18T00:00:00.000Z",
      },
      {
        id: "route:labs:public-site",
        entity: "route",
        values: {
          enabled: true,
          matchPath: "/pages",
          matchPrefix: "/pages/",
          kind: "mount",
          targetProfile: "public-site",
          surface: "public-site",
        },
        createdAt: "2026-06-18T00:00:00.000Z",
        updatedAt: "2026-06-18T00:00:00.000Z",
      },
    ];
    const snapshot: StorageSnapshot = {
      kind: STORAGE_SNAPSHOT_KIND,
      version: STORAGE_SNAPSHOT_VERSION,
      storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
      schemaKey: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
      exportedAt: "2026-06-18T00:00:00.000Z",
      schemaUpdatedAt: "2026-06-18T00:00:01.000Z",
      sourceCursor: records.length,
      schema: instanceControlPlaneSchema,
      records,
    };

    await writeInstanceWorkspaceControlPlaneStorageSnapshot({
      manifest,
      snapshot,
      workspaceRoot,
    });

    await expect(
      readInstanceWorkspaceControlPlaneStorageSnapshot({
        manifest,
        workspaceRoot,
      }),
    ).resolves.toMatchObject({
      records: [
        {
          id: "route:labs:public-site",
          values: { matchPath: "/pages", matchPrefix: "/pages/" },
        },
      ],
    });
  });

  it("writes and reads app record state with package schema provenance", async () => {
    const workspaceRoot = await makeTempDir();
    const manifest = resolveFormlessConfig({ name: "personal-sites" });
    const schemaProvenance = {
      kind: "package-app",
      packageAppKey: "tasks",
      packageRevision: 7,
      sourceSchemaHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    } as const;
    const records: StoredRecord[] = [
      {
        ...workspaceFixtureTaskRecord("rec_task_saved", "Persist record state", false),
        values: {
          done: false,
          title: "Persist record state",
        },
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ];
    const sourceSchema = parseAppSchema(workspaceFixtureTaskSourceSchema);
    const snapshot: StorageSnapshot = {
      kind: STORAGE_SNAPSHOT_KIND,
      version: STORAGE_SNAPSHOT_VERSION,
      storageIdentity: "app:tasks",
      schemaKey: "tasks",
      exportedAt: "2026-06-18T00:00:00.000Z",
      schemaUpdatedAt: "2026-06-18T00:00:01.000Z",
      sourceCursor: 1,
      schema: sourceSchema,
      records,
    };

    await writeInstanceWorkspaceAppStorageSnapshot({
      installId: "tasks",
      manifest,
      schemaProvenance,
      snapshot,
      workspaceRoot,
    });

    const fileText = await readFile(path.join(workspaceRoot, "state/apps/tasks.json"), "utf8");
    const file = JSON.parse(fileText) as Record<string, unknown>;

    expect(file.kind).toBe(WORKSPACE_RECORD_STATE_FILE_KIND);
    expect(file.storageIdentity).toBe("app:tasks");
    expect(file.schema).toBeUndefined();
    expect(file.schemaProvenance).toEqual(schemaProvenance);
    expect(Object.keys((file.records as StoredRecord[])[0]!.values)).toEqual(["title", "done"]);
    await expect(
      readInstanceWorkspaceAppStorageSnapshot({
        installId: "tasks",
        manifest,
        schemaKey: "tasks",
        schemaProvenance,
        sourceSchema,
        workspaceRoot,
      }),
    ).resolves.toEqual(snapshot);
  });
});

describe("workspace media source node files", () => {
  it("round-trips deterministic payload paths and validated document metadata", async () => {
    const workspaceRoot = await makeTempDir();
    const manifest = resolveFormlessConfig({ name: "documents" });
    const privateBytes = new TextEncoder().encode("%PDF-1.7\nprivate");
    const publicBytes = new TextEncoder().encode("%PDF-1.7\npublic");
    const privateObject = workspaceDocumentObject(
      "private.pdf",
      "private",
      privateBytes.byteLength,
    );
    const publicObject = workspaceDocumentObject("public.pdf", "public", publicBytes.byteLength);

    await replaceInstanceWorkspaceMediaFiles({
      manifest,
      mediaFiles: [
        {
          archivePath: publicObject.archivePath,
          byteSize: publicBytes.byteLength,
          bytes: publicBytes,
          contentType: "application/pdf",
          object: publicObject,
        },
        {
          archivePath: privateObject.archivePath,
          byteSize: privateBytes.byteLength,
          bytes: privateBytes,
          contentType: "application/pdf",
          object: privateObject,
        },
      ],
      workspaceRoot,
    });

    const writtenManifest = JSON.parse(
      await readFile(instanceWorkspaceMediaManifestPath(workspaceRoot, manifest), "utf8"),
    ) as {
      kind: string;
      objects: Array<{
        archivePath: string;
        asset: {
          access: string;
          filename: string;
        };
      }>;
      version: number;
    };
    expect(path.basename(instanceWorkspaceMediaManifestPath(workspaceRoot, manifest))).toBe(
      WORKSPACE_MEDIA_MANIFEST_FILE,
    );
    expect(writtenManifest).toMatchObject({
      kind: "formless.workspaceMedia",
      version: 1,
    });
    expect(writtenManifest.objects.map((object) => object.archivePath)).toEqual([
      privateObject.archivePath,
      publicObject.archivePath,
    ]);
    expect(writtenManifest.objects.map((object) => object.asset)).toMatchObject([
      { access: "private", filename: "private.pdf" },
      { access: "public", filename: "public.pdf" },
    ]);

    const read = await readInstanceWorkspaceMediaFiles({
      archivePaths: [publicObject.archivePath, privateObject.archivePath],
      manifest,
      workspaceRoot,
    });

    expect(read.missingMediaFiles).toEqual([]);
    expect(read.mediaFiles.map((file) => [file.archivePath, file.contentType])).toEqual([
      [privateObject.archivePath, "application/pdf"],
      [publicObject.archivePath, "application/pdf"],
    ]);
    expect(read.mediaFiles.map((file) => file.object)).toEqual([privateObject, publicObject]);

    await replaceInstanceWorkspaceMediaFiles({
      manifest,
      mediaFiles: [
        {
          archivePath: privateObject.archivePath,
          byteSize: privateBytes.byteLength,
          bytes: privateBytes,
          contentType: "application/pdf",
          object: privateObject,
        },
      ],
      workspaceRoot,
    });

    await expect(
      readFile(instanceWorkspaceMediaFilePath(workspaceRoot, manifest, publicObject.archivePath)),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("workspace operation node state", () => {
  it("creates, updates, reads, and lists ignored operation state files", async () => {
    const workspaceRoot = await makeTempDir();
    const now = timestampSequence("2026-06-02T00:00:00.000Z", "2026-06-02T00:00:01.000Z");
    const state = await createWorkspaceOperationState({
      actor: "browser",
      id: "op_status_00000001",
      input: { targetAlias: "remote" },
      now,
      operation: "status",
      workspaceRoot,
    });

    expect(workspaceOperationStateRoot(workspaceRoot)).toBe(
      path.join(workspaceRoot, ".formless/operations"),
    );
    expect(workspaceOperationStatePath(workspaceRoot, state.id)).toBe(
      path.join(workspaceRoot, ".formless/operations/op_status_00000001.json"),
    );
    await expect(readFile(path.join(workspaceRoot, ".gitignore"), "utf8")).resolves.toBe(
      ".formless/\n",
    );

    const updated = await updateWorkspaceOperationState(state.id, {
      logs: [{ at: now(), level: "info", message: `${workspaceRoot}/status.log` }],
      status: "running",
      workspaceRoot,
    });
    const persistedText = await readFile(
      workspaceOperationStatePath(workspaceRoot, state.id),
      "utf8",
    );

    expect(updated).toMatchObject({
      actor: "browser",
      id: "op_status_00000001",
      logs: [
        {
          id: "op_status_00000001-log-1",
          message: "<workspace>/status.log",
        },
      ],
      operation: "status",
      startedAt: "2026-06-02T00:00:01.000Z",
      status: "running",
      workspace: { label: path.basename(workspaceRoot) },
    });
    await expect(
      readWorkspaceOperationState({ operationId: state.id, workspaceRoot }),
    ).resolves.toEqual(updated);
    expect(await listWorkspaceOperationStates(workspaceRoot)).toEqual([updated]);
    expect(persistedText).not.toContain(workspaceRoot);
  });

  it("returns no operation states when the ignored state directory is absent", async () => {
    await expect(listWorkspaceOperationStates(await makeTempDir())).resolves.toEqual([]);
    expect(() => workspaceOperationStatePath("/workspace", "../secret")).toThrow(
      "Workspace operation id is invalid.",
    );
  });
});

describe("workspace auto-save node state", () => {
  it("reads and writes ignored local auto-save state files", async () => {
    const workspaceRoot = await makeTempDir();
    const localStateRoot = path.join(workspaceRoot, ".formless/local");
    const state = nextWorkspaceAutoSaveEnqueuedState(
      initialWorkspaceAutoSaveState({
        now: () => "2026-06-02T00:00:00.000Z",
      }),
      {
        now: () => "2026-06-02T00:00:01.000Z",
        source: "control-plane-write",
        storageIdentity: "instance:control-plane",
      },
    );

    await expect(readInstanceWorkspaceAutoSaveState(localStateRoot)).resolves.toBeUndefined();

    const write = await writeInstanceWorkspaceAutoSaveState({
      localStateRoot,
      state,
      workspaceRoot,
    });
    const persistedText = await readFile(
      instanceWorkspaceAutoSaveStatePath(localStateRoot),
      "utf8",
    );

    expect(write).toEqual({
      path: path.join(localStateRoot, "auto-save.json"),
      state,
    });
    await expect(readFile(path.join(workspaceRoot, ".gitignore"), "utf8")).resolves.toBe(
      ".formless/\n",
    );
    await expect(readInstanceWorkspaceAutoSaveState(localStateRoot)).resolves.toEqual(state);
    expect(persistedText).toBe(`${JSON.stringify(JSON.parse(persistedText), null, 2)}\n`);
    expect(persistedText).not.toContain(workspaceRoot);
  });
});

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "instance-workspace-node-test-"));

  tempDirs.push(tempDir);
  await mkdir(tempDir, { recursive: true });

  return tempDir;
}

function workspaceManifestWithPackageLink(manifest: string) {
  return {
    ...resolveFormlessConfig({ name: "personal-sites" }),
    packages: {
      links: [{ manifest }],
    },
  };
}

type WorkspaceAppPackageFixture = {
  manifest: AppPackageManifest;
  manifestPath: string;
  packageRoot: string;
  sourceSchema: unknown;
  sourceSchemaHash: SourceSchemaHash;
  sourceSchemaPath: string;
};

type WorkspaceAppPackageFixtureOptions = {
  capabilities?: AppPackageCapability[];
  defaultInstallId?: string;
  description?: string;
  label?: string;
  packageAppKey?: string;
  packageRevision?: number;
  sourceSchema?: unknown;
  sourceSchemaHash?: SourceSchemaHash;
  sourceSchemaPath?: string;
  supportsMultipleInstalls?: boolean;
};

async function writeWorkspaceAppPackageFixture(
  packageRoot: string,
  options: WorkspaceAppPackageFixtureOptions = {},
): Promise<WorkspaceAppPackageFixture> {
  const sourceSchema = options.sourceSchema ?? workspaceFixtureTaskSourceSchema;
  const sourceSchemaHash =
    options.sourceSchemaHash ?? (await computeSourceSchemaHash(sourceSchema));
  const sourceSchemaPath = options.sourceSchemaPath ?? "source/schema.json";
  const manifest = workspaceAppPackageManifestFixture({
    ...options,
    sourceSchemaHash,
    sourceSchemaPath,
  });
  const manifestPath = path.join(packageRoot, "formless.app.json");
  const resolvedSourceSchemaPath = path.join(packageRoot, sourceSchemaPath);

  await writeJsonFile(resolvedSourceSchemaPath, sourceSchema);
  await writeJsonFile(manifestPath, manifest);

  return {
    manifest,
    manifestPath,
    packageRoot,
    sourceSchema,
    sourceSchemaHash,
    sourceSchemaPath: resolvedSourceSchemaPath,
  };
}
function workspaceAppPackageManifestFixture(
  options: WorkspaceAppPackageFixtureOptions & {
    sourceSchemaHash: SourceSchemaHash;
  },
): AppPackageManifest {
  const packageAppKey = options.packageAppKey ?? "private-labs";
  const label = options.label ?? "Private Labs";
  const defaultInstallId = options.defaultInstallId ?? "labs";
  const sourceSchemaPath = options.sourceSchemaPath ?? "source/schema.json";

  return parseAppPackageManifest({
    kind: appPackageManifestKind,
    version: appPackageManifestVersion,
    packageAppKey,
    label,
    description: options.description ?? "Private lab package fixture.",
    defaultInstallId,
    supportsMultipleInstalls: options.supportsMultipleInstalls ?? false,
    packageRevision: options.packageRevision ?? 7,
    sourceSchema: {
      kind: "workspace",
      key: packageAppKey,
      path: sourceSchemaPath,
    },
    sourceSchemaHash: options.sourceSchemaHash,
    capabilities: options.capabilities ?? [{ kind: "generatedAdmin", routeBase: "/apps" }],
  });
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function workspaceFixtureTaskRecord(id: string, title: string, done: boolean) {
  return {
    id,
    entity: "task",
    values: { done, title },
    createdAt: "2026-06-01T00:00:00.000Z",
  };
}

function timestampSequence(...timestamps: string[]): () => string {
  let index = 0;

  return () =>
    timestamps[index++ % timestamps.length] ?? timestamps.at(-1) ?? new Date(0).toISOString();
}

function workspaceTestPackageManifest(input: {
  label: string;
  packageAppKey: string;
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
    capabilities: [{ kind: "generatedAdmin", routeBase: "/apps" }],
  };
}

function workspaceDocumentObject(assetId: string, access: "private" | "public", byteSize: number) {
  const storageKey = `media/app-installs/reports/documents/${assetId}`;
  const deliveryHref = `/api/app-installs/reports/reports/media/documents/${assetId}`;

  return {
    archivePath: `media/reports/${storageKey}`,
    asset: {
      access,
      byteSize,
      contentType: "application/pdf",
      deliveryHref,
      filename: assetId,
      id: assetId,
      kind: "document",
      label: assetId,
      ownerAppInstallId: "reports",
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
