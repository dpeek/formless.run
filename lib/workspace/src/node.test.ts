import path from "node:path";

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vite-plus/test";
import { parseAppSchema } from "@dpeek/formless-schema";

import {
  STORAGE_SNAPSHOT_KIND,
  STORAGE_SNAPSHOT_VERSION,
  parseStorageSnapshot,
  type StorageSnapshot,
  type StoredRecord,
} from "@dpeek/formless-storage";

import {
  INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME,
  INSTANCE_WORKSPACE_GITIGNORE_ENTRY,
  INSTANCE_WORKSPACE_LOCAL_DEV_SECRET_STATE_PATH,
  INSTANCE_WORKSPACE_OWNER_SESSION_SECRET_ENV_NAME,
  INSTANCE_WORKSPACE_SECRET_STATE_PATH,
  WORKSPACE_MEDIA_MANIFEST_FILE,
  WORKSPACE_MEDIA_LEGACY_MANIFEST_VERSION,
  WORKSPACE_MEDIA_MANIFEST_VERSION,
  WORKSPACE_RECORD_STATE_FILE_KIND,
  resolveFormlessConfig,
  ensureInstanceWorkspaceLocalDevSecretState,
  ensureInstanceWorkspaceSecretStateIgnored,
  formatInstanceWorkspaceLocalDevSecretState,
  formatInstanceWorkspaceSecretState,
  instanceWorkspaceMediaFilePath,
  instanceWorkspaceMediaManifestPath,
  instanceWorkspaceLocalDevSecretStatePath,
  instanceWorkspaceSecretStatePath,
  parseInstanceWorkspaceLocalDevSecretState,
  parseInstanceWorkspaceSecretState,
  readInstanceWorkspaceProgramStorageSnapshot as readWorkspaceProgramSnapshot,
  readInstanceWorkspaceLocalDevSecretState,
  readInstanceWorkspaceMediaFiles,
  readInstanceWorkspaceSecretState,
  resolveInstanceWorkspaceAdminToken,
  replaceInstanceWorkspaceMediaFiles,
  workspaceMediaPayloadPathForArchivePath,
  writeInstanceWorkspaceProgramStorageSnapshot as writeWorkspaceProgramSnapshot,
  writeInstanceWorkspaceLocalDevSecretState,
  writeInstanceWorkspaceSecretState,
} from "./node.ts";

const programStorageIdentity = "instance:control-plane";
const workspaceTestSchema = parseAppSchema({
  version: 1,
  entities: [
    testEntity("entity_11111111-1111-4111-8111-111111111111", "instance-settings", [
      "settingsId",
      "canonicalOrigin",
      "defaultEmailDomain",
      "defaultContactSender",
      "contactNotificationRecipient",
      "productionIdentityStatus",
    ]),
    testEntity("entity_22222222-2222-4222-8222-222222222222", "email-domain", [
      "enabled",
      "providerFamily",
      "domain",
      "dnsStatus",
    ]),
    testEntity("entity_33333333-3333-4333-8333-333333333333", "email-sender", [
      "enabled",
      "address",
      "purpose",
      "emailDomain",
    ]),
    testEntity("entity_44444444-4444-4444-8444-444444444444", "route", [
      "enabled",
      "matchPath",
      "matchPrefix",
      "kind",
      "targetProfile",
      "surface",
    ]),
  ],
  queries: [{ key: "routeAll", label: "Routes", entity: "route", expression: { kind: "all" } }],
  itemViews: [
    {
      key: "routeItem",
      entity: "route",
      fields: [{ field: "enabled", editor: "boolean", commit: "immediate" }],
    },
  ],
  tableViews: [],
  views: [
    {
      key: "routeList",
      type: "collection",
      label: "Routes",
      entity: "route",
      queries: [{ query: "routeAll" }],
      defaultQuery: "routeAll",
      result: { type: "list", itemView: "routeItem" },
    },
  ],
  screens: [
    {
      key: "home",
      type: "workspace",
      label: "Home",
      layout: {
        type: "stack",
        sections: [{ id: "routes", type: "collection", view: "routeList" }],
      },
    },
  ],
});

function testEntity(id: string, key: string, fields: string[]) {
  return {
    id,
    key,
    label: key,
    fields: fields.map((field) => ({
      key: field,
      label: field,
      required: false,
      type: field === "enabled" ? ("boolean" as const) : ("text" as const),
    })),
  };
}

function programSnapshotContract() {
  return {
    canonicalize: (snapshot: StorageSnapshot) =>
      parseStorageSnapshot(snapshot, {
        schemaKey: "formless-program",
        storageIdentity: programStorageIdentity,
      }),
    schema: workspaceTestSchema,
    schemaKey: "formless-program",
    schemaProvenance: {
      kind: "program" as const,
      sourceSchemaHash: `sha256:${"a".repeat(64)}` as const,
    },
    storageIdentity: programStorageIdentity,
  };
}

function readInstanceWorkspaceProgramStorageSnapshot(
  input: Omit<Parameters<typeof readWorkspaceProgramSnapshot>[0], "programSnapshotContract">,
) {
  return readWorkspaceProgramSnapshot({
    ...input,
    programSnapshotContract: programSnapshotContract(),
  });
}

function writeInstanceWorkspaceProgramStorageSnapshot(
  input: Omit<Parameters<typeof writeWorkspaceProgramSnapshot>[0], "programSnapshotContract">,
) {
  return writeWorkspaceProgramSnapshot({
    ...input,
    programSnapshotContract: programSnapshotContract(),
  });
}

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

describe("Formless instance workspace secret state", () => {
  it("defines the ignored workspace secret path", () => {
    expect(INSTANCE_WORKSPACE_SECRET_STATE_PATH).toBe(".formless/instance.env");
    expect(INSTANCE_WORKSPACE_LOCAL_DEV_SECRET_STATE_PATH).toBe(".formless/local/dev.env");
    expect(INSTANCE_WORKSPACE_GITIGNORE_ENTRY).toBe(".formless/");
    expect(instanceWorkspaceSecretStatePath("/workspace")).toBe(
      path.join("/workspace", ".formless/instance.env"),
    );
    expect(instanceWorkspaceLocalDevSecretStatePath("/workspace/.formless/local")).toBe(
      path.join("/workspace/.formless/local", "dev.env"),
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

describe("workspace record state node files", () => {
  it("writes and reads Program record state without embedding schema source", async () => {
    const workspaceRoot = await makeTempDir();
    const manifest = resolveFormlessConfig({ name: "personal-sites" });
    const records: StoredRecord[] = [
      {
        id: "settings:instance",
        entity: "instance-settings",
        values: {
          settingsId: "instance",
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
      storageIdentity: programStorageIdentity,
      schemaKey: "formless-program",
      exportedAt: "2026-06-18T00:00:00.000Z",
      schemaUpdatedAt: "2026-06-18T00:00:01.000Z",
      sourceCursor: records.length,
      schema: workspaceTestSchema,
      records,
    };

    await writeInstanceWorkspaceProgramStorageSnapshot({
      manifest,
      snapshot,
      workspaceRoot,
    });

    const fileText = await readFile(path.join(workspaceRoot, "state/instance.json"), "utf8");
    const file = JSON.parse(fileText) as Record<string, unknown>;

    expect(file.kind).toBe(WORKSPACE_RECORD_STATE_FILE_KIND);
    expect(file.storageIdentity).toBe(programStorageIdentity);
    expect(file.schema).toBeUndefined();
    expect(file.schemaProvenance).toEqual(programSnapshotContract().schemaProvenance);
    expect((file.records as StoredRecord[]).map((record) => record.entity)).toEqual([
      "instance-settings",
      "email-domain",
      "email-sender",
    ]);
    await expect(
      readInstanceWorkspaceProgramStorageSnapshot({ manifest, workspaceRoot }),
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

  it("rejects Program record state when provenance does not match the resolved schema", async () => {
    const workspaceRoot = await makeTempDir();
    const manifest = resolveFormlessConfig({ name: "personal-sites" });
    const snapshot: StorageSnapshot = {
      kind: STORAGE_SNAPSHOT_KIND,
      version: STORAGE_SNAPSHOT_VERSION,
      storageIdentity: programStorageIdentity,
      schemaKey: "formless-program",
      exportedAt: "2026-06-18T00:00:00.000Z",
      schemaUpdatedAt: "2026-06-18T00:00:01.000Z",
      sourceCursor: 0,
      schema: workspaceTestSchema,
      records: [],
    };

    await writeInstanceWorkspaceProgramStorageSnapshot({
      manifest,
      snapshot,
      workspaceRoot,
    });

    const filePath = path.join(workspaceRoot, "state/instance.json");
    const file = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;

    file.schemaProvenance = {
      kind: "program",
      sourceSchemaHash: `sha256:${"0".repeat(64)}`,
    };
    await writeFile(filePath, `${JSON.stringify(file, null, 2)}\n`);

    await expect(
      readInstanceWorkspaceProgramStorageSnapshot({ manifest, workspaceRoot }),
    ).rejects.toThrow(
      "Workspace instance state state/instance.json schemaProvenance does not match resolved runtime source.",
    );
  });

  it("validates Program-native public Site route record state", async () => {
    const workspaceRoot = await makeTempDir();
    const manifest = resolveFormlessConfig({ name: "personal-sites" });
    const records: StoredRecord[] = [
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
      storageIdentity: programStorageIdentity,
      schemaKey: "formless-program",
      exportedAt: "2026-06-18T00:00:00.000Z",
      schemaUpdatedAt: "2026-06-18T00:00:01.000Z",
      sourceCursor: records.length,
      schema: workspaceTestSchema,
      records,
    };

    await writeInstanceWorkspaceProgramStorageSnapshot({
      manifest,
      snapshot,
      workspaceRoot,
    });

    await expect(
      readInstanceWorkspaceProgramStorageSnapshot({
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
        payloadPath: string;
      }>;
      version: number;
    };
    expect(path.basename(instanceWorkspaceMediaManifestPath(workspaceRoot, manifest))).toBe(
      WORKSPACE_MEDIA_MANIFEST_FILE,
    );
    expect(writtenManifest).toMatchObject({
      kind: "formless.workspaceMedia",
      version: WORKSPACE_MEDIA_MANIFEST_VERSION,
    });
    expect(writtenManifest.objects.map((object) => object.archivePath)).toEqual([
      privateObject.archivePath,
      publicObject.archivePath,
    ]);
    expect(writtenManifest.objects.map((object) => object.payloadPath)).toEqual([
      "documents/private.pdf",
      "documents/public.pdf",
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
    expect(read.manifestVersion).toBe(WORKSPACE_MEDIA_MANIFEST_VERSION);
    expect(read.requiresLayoutAdoption).toBe(false);
    expect(read.mediaFiles.map((file) => [file.archivePath, file.contentType])).toEqual([
      [privateObject.archivePath, "application/pdf"],
      [publicObject.archivePath, "application/pdf"],
    ]);
    expect(read.mediaFiles.map((file) => file.object)).toEqual([privateObject, publicObject]);

    const selected = await readInstanceWorkspaceMediaFiles({
      archivePaths: [privateObject.archivePath],
      manifest,
      workspaceRoot,
    });

    expect(selected.unreferencedManifestPayloadPaths).toEqual(["documents/public.pdf"]);

    await replaceInstanceWorkspaceMediaFiles({
      manifest,
      mediaFiles: selected.mediaFiles,
      workspaceRoot,
    });

    await expect(
      readFile(
        instanceWorkspaceMediaFilePath(
          workspaceRoot,
          manifest,
          workspaceMediaPayloadPathForArchivePath(publicObject.archivePath),
        ),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(path.join(workspaceRoot, "state/media/documents/private.pdf")),
    ).resolves.toEqual(Buffer.from(privateBytes));
  });

  it("adopts a valid version 1 layout only after version 2 is safely written", async () => {
    const workspaceRoot = await makeTempDir();
    const manifest = resolveFormlessConfig({ name: "documents" });
    const bytes = new TextEncoder().encode("%PDF-1.7\nlegacy");
    const object = workspaceDocumentObject("legacy.pdf", "private", bytes.byteLength);
    const mediaRoot = path.join(workspaceRoot, "state/media");
    const legacyPayloadPath = object.archivePath;
    const legacyPayloadFile = path.join(mediaRoot, legacyPayloadPath);

    await mkdir(path.dirname(legacyPayloadFile), { recursive: true });
    await writeFile(legacyPayloadFile, bytes);
    await writeFile(
      path.join(mediaRoot, WORKSPACE_MEDIA_MANIFEST_FILE),
      `${JSON.stringify(
        {
          kind: "formless.workspaceMedia",
          version: WORKSPACE_MEDIA_LEGACY_MANIFEST_VERSION,
          objects: [object],
        },
        null,
        2,
      )}\n`,
    );

    const legacy = await readInstanceWorkspaceMediaFiles({
      archivePaths: [object.archivePath],
      manifest,
      workspaceRoot,
    });

    expect(legacy).toMatchObject({
      manifestPayloadPaths: [legacyPayloadPath],
      manifestVersion: WORKSPACE_MEDIA_LEGACY_MANIFEST_VERSION,
      requiresLayoutAdoption: true,
    });
    expect(legacy.mediaFiles[0]?.payloadPath).toBe(legacyPayloadPath);

    await replaceInstanceWorkspaceMediaFiles({
      manifest,
      mediaFiles: legacy.mediaFiles,
      workspaceRoot,
    });

    const adoptedManifest = JSON.parse(
      await readFile(path.join(mediaRoot, WORKSPACE_MEDIA_MANIFEST_FILE), "utf8"),
    ) as { objects: Array<{ payloadPath: string }>; version: number };

    expect(adoptedManifest).toEqual(
      expect.objectContaining({
        objects: [expect.objectContaining({ payloadPath: "documents/legacy.pdf" })],
        version: WORKSPACE_MEDIA_MANIFEST_VERSION,
      }),
    );
    await expect(readFile(path.join(mediaRoot, "documents/legacy.pdf"))).resolves.toEqual(
      Buffer.from(bytes),
    );
    await expect(readFile(legacyPayloadFile)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves version 1 media when replacement validation fails", async () => {
    const workspaceRoot = await makeTempDir();
    const manifest = resolveFormlessConfig({ name: "documents" });
    const bytes = new TextEncoder().encode("%PDF-1.7\npreserved");
    const object = workspaceDocumentObject("preserved.pdf", "private", bytes.byteLength);
    const mediaRoot = path.join(workspaceRoot, "state/media");
    const legacyPayloadFile = path.join(mediaRoot, object.archivePath);
    const manifestPath = path.join(mediaRoot, WORKSPACE_MEDIA_MANIFEST_FILE);

    await mkdir(path.dirname(legacyPayloadFile), { recursive: true });
    await writeFile(legacyPayloadFile, bytes);
    await writeFile(
      manifestPath,
      `${JSON.stringify({
        kind: "formless.workspaceMedia",
        version: WORKSPACE_MEDIA_LEGACY_MANIFEST_VERSION,
        objects: [object],
      })}\n`,
    );
    const priorManifest = await readFile(manifestPath, "utf8");

    await expect(
      replaceInstanceWorkspaceMediaFiles({
        manifest,
        mediaFiles: [
          {
            archivePath: object.archivePath,
            byteSize: bytes.byteLength + 1,
            bytes,
            contentType: object.contentType,
            object,
          },
        ],
        workspaceRoot,
      }),
    ).rejects.toThrow("byteSize must match its payload bytes");

    await expect(readFile(legacyPayloadFile)).resolves.toEqual(Buffer.from(bytes));
    await expect(readFile(manifestPath, "utf8")).resolves.toBe(priorManifest);
  });

  it("rejects traversal and non-canonical version 2 payload paths", async () => {
    const workspaceRoot = await makeTempDir();
    const manifest = resolveFormlessConfig({ name: "documents" });
    const bytes = new TextEncoder().encode("%PDF-1.7\ninvalid-path");
    const object = workspaceDocumentObject("invalid.pdf", "private", bytes.byteLength);
    const manifestPath = instanceWorkspaceMediaManifestPath(workspaceRoot, manifest);

    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(
      manifestPath,
      `${JSON.stringify({
        kind: "formless.workspaceMedia",
        version: WORKSPACE_MEDIA_MANIFEST_VERSION,
        objects: [{ ...object, payloadPath: "../invalid.pdf" }],
      })}\n`,
    );

    await expect(
      readInstanceWorkspaceMediaFiles({
        archivePaths: [object.archivePath],
        manifest,
        workspaceRoot,
      }),
    ).rejects.toThrow("workspace media payload path");
  });
});

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "instance-workspace-node-test-"));

  tempDirs.push(tempDir);
  await mkdir(tempDir, { recursive: true });

  return tempDir;
}

function workspaceDocumentObject(assetId: string, access: "private" | "public", byteSize: number) {
  const storageKey = `media/documents/${assetId}`;
  const deliveryHref = `/api/formless/program/media/documents/${assetId}`;

  return {
    archivePath: `media/documents/${assetId}`,
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
