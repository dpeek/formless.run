import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  parseInstanceArchive,
} from "@dpeek/formless-archive";
import {
  computeSourceSchemaHash,
  defineAppSchemaModule,
  parseAppSchema,
  type AppSchema,
} from "@dpeek/formless-schema";
import {
  STORAGE_SNAPSHOT_KIND,
  STORAGE_SNAPSHOT_VERSION,
  type StorageSnapshot,
  type StoredRecord,
} from "@dpeek/formless-storage";
import {
  readInstanceWorkspaceProgramStorageSnapshot,
  writeInstanceWorkspaceProgramStorageSnapshot,
} from "@dpeek/formless-workspace/node";
import { resolveFormlessConfig } from "@dpeek/formless-workspace";
import { describe, expect, it } from "vite-plus/test";
import { testSiteRecords } from "../test/site-records.ts";
import rawFormlessProgramSchema from "./schema.json";
import {
  formatFormlessProgramArtifact,
  materializeFormlessProgramArtifact,
  materializeFormlessProgramSourceArtifact,
} from "./artifact.ts";
import { defineProgramSharedRuntime } from "./composition.ts";
import { formlessProgramDefaultRuntimeComposition } from "./default.ts";
import {
  formlessProgramBuiltInModules,
  formlessProgramDefaultComposition,
  formlessProgramSchemaModules,
} from "./schema.ts";
import {
  FORMLESS_PROGRAM_API_ROUTE_PREFIX,
  FORMLESS_PROGRAM_BROWSER_STORAGE_NAME,
  FORMLESS_PROGRAM_SCHEMA_KEY,
  FORMLESS_PROGRAM_SOURCE_SCHEMA_HASH,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
  canonicalizeFormlessProgramStorageSnapshot,
  formlessProgramArchiveSnapshotContract,
  formlessProgramSchema,
  formlessProgramSchemaProvenance,
  formlessProgramWorkspaceSnapshotContract,
  parseFormlessProgramSchemaArtifact,
  parseRuntimeFormlessProgramArtifactJson,
  resolveFormlessProgramBrowserRouteTarget,
  resolveFormlessProgramScreenRouteTarget,
  resolveFormlessProgramScreenRouteTargetByKey,
  resolveFormlessProgramSurfaceMountRouteTarget,
  validateFormlessProgramRecords,
} from "./runtime.ts";
import { formlessProgramTarget } from "./target.ts";
import {
  readInstanceWorkspaceProgramStorageSnapshot as readValidatedWorkspaceSnapshot,
  writeInstanceWorkspaceProgramStorageSnapshot as writeValidatedWorkspaceSnapshot,
} from "./workspace.ts";
import { workspaceProgramComposition } from "../test/workspace-runtime-composition/program.ts";

const now = "2026-07-30T00:00:00.000Z";

describe("Formless Program runtime contracts", () => {
  it("loads the materialized artifact with one root-owned target and provenance", async () => {
    expect(await computeSourceSchemaHash(rawFormlessProgramSchema)).toBe(
      FORMLESS_PROGRAM_SOURCE_SCHEMA_HASH,
    );
    expect(formlessProgramSchema.entities).toHaveLength(24);
    expect(formlessProgramSchemaProvenance).toEqual({
      kind: "program",
      sourceSchemaHash: FORMLESS_PROGRAM_SOURCE_SCHEMA_HASH,
    });
    expect(formlessProgramTarget).toEqual({
      kind: "program",
      schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
      authorityName: FORMLESS_PROGRAM_STORAGE_IDENTITY,
      apiRoutePrefix: FORMLESS_PROGRAM_API_ROUTE_PREFIX,
      browserDatabaseName: FORMLESS_PROGRAM_BROWSER_STORAGE_NAME,
      broadcastChannelName: FORMLESS_PROGRAM_BROWSER_STORAGE_NAME,
    });
  });

  it("materializes explicit access for every current Program operation", () => {
    const identityEntityIds = moduleEntityIds(
      formlessProgramBuiltInModules.identityControlPlaneRecords,
    );
    const instanceEntityIds = moduleEntityIds(
      formlessProgramBuiltInModules.instanceControlPlaneRecords,
    );
    const standardEntityIds = new Set([
      ...moduleEntityIds(formlessProgramBuiltInModules.standardInquiryRecords),
      ...moduleEntityIds(formlessProgramBuiltInModules.standardContactSubscriptionRecords),
    ]);
    const siteEntityIds = moduleEntityIds(formlessProgramBuiltInModules.siteRecords);
    const taskEntityIds = moduleEntityIds(formlessProgramBuiltInModules.tasksRecords);

    for (const entity of formlessProgramSchema.entities) {
      expect(
        identityEntityIds.has(entity.id) ||
          instanceEntityIds.has(entity.id) ||
          standardEntityIds.has(entity.id) ||
          taskEntityIds.has(entity.id) ||
          siteEntityIds.has(entity.id),
        entity.key,
      ).toBe(true);

      for (const operation of entity.operations ?? []) {
        const operationName = `${entity.key}.${operation.key}`;
        const isAnonymousPublicOperation =
          operationName === "contact-message.submit" || operationName === "subscription.subscribe";

        if (isAnonymousPublicOperation) {
          expect(operation.access, operationName).toBeUndefined();
          expect(operation.policy?.actors, operationName).toEqual(["anonymous"]);
          expect(operation.policy?.access, operationName).toEqual({
            actor: "anonymous",
            challenge: { kind: "turnstile" },
            origin: { kind: "same-origin" },
          });
          continue;
        }

        expect(operation.access, operationName).toBeDefined();

        if (
          standardEntityIds.has(entity.id) ||
          taskEntityIds.has(entity.id) ||
          siteEntityIds.has(entity.id)
        ) {
          expect(operation.access).toEqual({ role: "editor" });
        } else if (identityEntityIds.has(entity.id)) {
          expect(operation.access).toEqual({ actor: "owner" });
        } else if (entity.key === "instance-settings") {
          expect(operation.access).toEqual({
            anyOf: [{ actor: "owner" }, { actor: "adminBearer" }],
          });
        } else {
          expect(operation.access).toEqual({
            anyOf: [{ role: "administrator" }, { actor: "adminBearer" }],
          });
        }
      }
    }
  });

  it("loads every concrete Program screen route", () => {
    expect(resolveFormlessProgramScreenRouteTarget("/")).toEqual({
      access: { role: "member" },
      key: "instanceHome",
      label: "Home",
      path: "/",
      type: "runtime",
    });
    expect(resolveFormlessProgramScreenRouteTarget("/settings/routes")).toEqual({
      access: { role: "administrator" },
      key: "routes",
      label: "Routes",
      path: "/settings/routes",
      type: "workspace",
    });
    expect(resolveFormlessProgramScreenRouteTarget("/settings/access")).toEqual({
      access: { role: "administrator" },
      key: "access",
      label: "Access",
      path: "/settings/access",
      type: "runtime",
    });
    expect(resolveFormlessProgramScreenRouteTarget("/tasks")).toEqual({
      access: { role: "member" },
      key: "taskHome",
      label: "Tasks",
      path: "/tasks",
      type: "workspace",
    });
    expect(resolveFormlessProgramScreenRouteTarget("/site")).toEqual({
      access: { role: "member" },
      key: "siteEditor",
      label: "Blocks",
      path: "/site",
      type: "workspace",
    });
    expect(resolveFormlessProgramScreenRouteTarget("/site/settings")).toEqual({
      access: { role: "member" },
      key: "siteSettings",
      label: "Settings",
      path: "/site/settings",
      type: "workspace",
    });
    expect(resolveFormlessProgramScreenRouteTarget("/site/subscribers")).toEqual({
      access: { role: "member" },
      key: "siteSubscribers",
      label: "Subscribers",
      path: "/site/subscribers",
      type: "workspace",
    });
    expect(resolveFormlessProgramScreenRouteTarget("/site/contacts")).toEqual({
      access: { role: "member" },
      key: "siteContacts",
      label: "Contacts",
      path: "/site/contacts",
      type: "workspace",
    });
    expect(resolveFormlessProgramScreenRouteTarget("/routes")).toBeUndefined();
    expect(resolveFormlessProgramScreenRouteTarget("/access")).toBeUndefined();
    expect(resolveFormlessProgramScreenRouteTarget("/principals")).toBeUndefined();
    expect(resolveFormlessProgramScreenRouteTarget("/deployments")).toBeUndefined();
    expect(resolveFormlessProgramScreenRouteTarget("/settings")).toBeUndefined();
    expect(resolveFormlessProgramScreenRouteTarget("/organizations")).toBeUndefined();
    expect(resolveFormlessProgramScreenRouteTarget("/invitations")).toBeUndefined();
    expect(resolveFormlessProgramScreenRouteTarget("/policies")).toBeUndefined();
    expect(resolveFormlessProgramScreenRouteTarget("/unknown")).toBeUndefined();

    const runtimeAccessSchema = {
      ...formlessProgramSchema,
      screens: formlessProgramSchema.screens.map((screen) =>
        screen.key === "access" ? { ...screen, path: "/people/access" } : screen,
      ),
    };
    expect(resolveFormlessProgramScreenRouteTarget("/people/access", runtimeAccessSchema)).toEqual({
      access: { role: "administrator" },
      key: "access",
      label: "Access",
      path: "/people/access",
      type: "runtime",
    });

    const runtimeRootSchema: AppSchema = {
      ...formlessProgramSchema,
      navigation: {
        primaryScreens: [
          {
            key: "administration",
            label: "Administration",
            screens: ["access"],
          },
        ],
      },
      screens: formlessProgramSchema.screens
        .filter((screen) => screen.key !== "instanceHome")
        .map((screen) =>
          screen.key === "access"
            ? {
                key: screen.key,
                type: "runtime",
                label: screen.label,
                access: screen.access,
              }
            : screen,
        ),
    };
    expect(resolveFormlessProgramScreenRouteTargetByKey("access", runtimeRootSchema)).toEqual({
      access: { role: "administrator" },
      key: "access",
      label: "Access",
      path: "/",
      type: "runtime",
    });

    const missingAccess: unknown = structuredClone(rawFormlessProgramSchema);
    const routesScreen = (
      missingAccess as {
        screens: Array<{ access?: unknown; key: string }>;
      }
    ).screens.find((screen) => screen.key === "routes");

    delete routesScreen?.access;

    expect(() => parseFormlessProgramSchemaArtifact(missingAccess)).toThrow(
      'Formless Program schema screen "routes" must declare explicit access.',
    );
  });

  it("resolves browser surface mounts as segment-boundary Program subtrees", () => {
    expect(resolveFormlessProgramBrowserRouteTarget("/site/preview")).toEqual({
      access: { actor: "authenticated" },
      key: "site.preview.browser",
      path: "/site/preview",
      pathSuffix: "",
      target: "browser",
    });
    expect(resolveFormlessProgramBrowserRouteTarget("/site/preview/")).toMatchObject({
      key: "site.preview.browser",
      pathSuffix: "",
    });
    expect(
      resolveFormlessProgramBrowserRouteTarget("/site/preview/blog/shipping?draft=1"),
    ).toMatchObject({
      key: "site.preview.browser",
      pathSuffix: "/blog/shipping",
    });
    expect(resolveFormlessProgramBrowserRouteTarget("/site/previewed")).toBeUndefined();
    expect(resolveFormlessProgramBrowserRouteTarget("/site/public")).toBeUndefined();
    expect(
      resolveFormlessProgramSurfaceMountRouteTarget("/site/public/blog", "worker"),
    ).toMatchObject({
      key: "site.preview.worker",
      path: "/site/public",
      pathSuffix: "/blog",
      target: "worker",
    });

    const downstream = structuredClone(formlessProgramSchema);
    const browserMount = downstream.surfaceMounts?.find(
      (mount) => mount.key === "site.preview.browser",
    );

    if (!browserMount) {
      throw new Error("Expected the Program schema to include the Site browser preview mount.");
    }

    browserMount.path = "/review/site";

    expect(
      resolveFormlessProgramBrowserRouteTarget("/review/site/projects", downstream),
    ).toMatchObject({
      key: "site.preview.browser",
      path: "/review/site",
      pathSuffix: "/projects",
    });
    expect(resolveFormlessProgramBrowserRouteTarget("/site/preview", downstream)).toBeUndefined();
  });

  it("validates mixed records through stable-id-owned package constraints", () => {
    const records = [
      ...programRecords(),
      taskRecord("task:active", { title: "Active", done: false, priority: "high" }),
      testSiteRecord("site"),
      storedRecord("contact-message:formless", "contact-message", {
        name: "Ada",
        email: "ada@example.com",
        message: "Hello",
      }),
    ];

    expect(() => validateFormlessProgramRecords("Program records", records)).not.toThrow();
    expect(() =>
      validateFormlessProgramRecords("Program records", [
        ...records,
        storedRecord("foreign", "foreign", {}),
      ]),
    ).toThrow('record "foreign" references unknown entity "foreign"');

    const missingPrincipal = records.filter((record) => record.entity !== "principal");
    expect(() => validateFormlessProgramRecords("Program records", missingPrincipal)).toThrow(
      'references unknown principal record "principal:ada"',
    );
    expect(() =>
      validateFormlessProgramRecords("Program records", [
        ...records,
        { ...testSiteRecord("site"), id: "principal:ada" },
      ]),
    ).toThrow('includes duplicate record id "principal:ada"');
  });

  it("runs explicitly selected candidate validation for Program writes", () => {
    const route = storedRecord("route:reserved", "route", {
      enabled: true,
      kind: "mount",
      matchPath: "/api",
      targetProfile: "instance",
    });

    expect(() =>
      validateFormlessProgramRecords("Program records", [...programRecords(), route], {
        candidateRecord: route,
      }),
    ).toThrow('field "instance:route.matchPath" must be a normalized absolute path');
  });

  it("keeps generic-only domains valid when their shared composition is empty", () => {
    const schema = genericOnlySchema();
    const sharedRuntime = emptySharedRuntime();
    const note = storedRecord("note:one", "note", { title: "One" });

    expect(() =>
      validateFormlessProgramRecords("Generic Program records", [note], {
        schema,
        sharedRuntime,
      }),
    ).not.toThrow();
    expect(
      canonicalizeFormlessProgramStorageSnapshot(
        { ...programSnapshot([note]), schema },
        { schema, sharedRuntime },
      ).records,
    ).toEqual([note]);
  });

  it("canonicalizes only records owned by the injected adapter", () => {
    const schema = genericOnlySchema();
    const note = storedRecord("note:one", "note", { title: "One" });
    const sharedRuntime = defineProgramSharedRuntime({
      ...emptySharedRuntime(),
      recordAdapters: [
        {
          target: "shared",
          kind: "record-adapter",
          key: "notes.records",
          entityIds: [schema.entities[0]!.id],
          adapter: {
            canonicalize: ({ records }) =>
              records.map((record) => ({
                ...record,
                values: { ...record.values, title: "Canonical" },
              })),
            validate: () => undefined,
            validateCandidate: () => undefined,
          },
        },
      ],
    });

    expect(
      canonicalizeFormlessProgramStorageSnapshot(
        { ...programSnapshot([note]), schema },
        { schema, sharedRuntime },
      ).records,
    ).toEqual([{ ...note, values: { title: "Canonical" } }]);
  });

  it("rejects ambiguous entity ownership in injected shared composition", () => {
    const schema = genericOnlySchema();
    const adapter = {
      target: "shared",
      kind: "record-adapter",
      key: "notes.records",
      entityIds: [schema.entities[0]!.id],
      adapter: {
        canonicalize: ({ records }: { records: readonly StoredRecord[] }) => records,
        validate: () => undefined,
        validateCandidate: () => undefined,
      },
    } as const;
    const sharedRuntime = defineProgramSharedRuntime({
      ...emptySharedRuntime(),
      recordAdapters: [adapter, { ...adapter, key: "notes.records.alternate" }],
    });

    expect(() =>
      validateFormlessProgramRecords("Generic Program records", [], {
        schema,
        sharedRuntime,
      }),
    ).toThrow(
      `Program runtime selections "notes.records" and "notes.records.alternate" in shared.recordAdapters both claim entity id "${schema.entities[0]!.id}".`,
    );
  });

  it("retains active and tombstoned Task records in canonical Program snapshots", () => {
    const active = taskRecord("task:active", {
      priority: "high",
      title: "Active",
      done: false,
    });
    const tombstone = {
      ...taskRecord("task:deleted", {
        done: true,
        priority: "normal",
        title: "Deleted",
      }),
      deletedAt: "2026-07-30T01:00:00.000Z",
    };
    const canonical = canonicalizeFormlessProgramStorageSnapshot(
      programSnapshot([tombstone, ...programRecords(), active]),
    );

    expect(canonical.records.filter(({ entity }) => entity === "task")).toEqual([
      {
        ...active,
        values: {
          title: "Active",
          done: false,
          priority: "high",
        },
      },
      {
        ...tombstone,
        values: {
          title: "Deleted",
          done: true,
          priority: "normal",
        },
      },
    ]);
    expect(canonicalizeFormlessProgramStorageSnapshot(canonical)).toEqual(canonical);
  });

  it("retains active and tombstoned Site records in the Program snapshot", () => {
    const active = testSiteRecord("site");
    const tombstone = {
      ...testSiteRecord("block"),
      deletedAt: "2026-07-31T01:00:00.000Z",
    };
    const canonical = canonicalizeFormlessProgramStorageSnapshot(
      programSnapshot([tombstone, ...programRecords(), active]),
    );
    const canonicalSiteRecords = canonical.records.filter(
      ({ entity }) => entity === "site" || entity === "block",
    );

    expect(canonical.storageIdentity).toBe(FORMLESS_PROGRAM_STORAGE_IDENTITY);
    expect(canonical.schemaKey).toBe(FORMLESS_PROGRAM_SCHEMA_KEY);
    expect(
      canonicalSiteRecords.map(({ id, entity, deletedAt }) => ({
        deletedAt,
        entity,
        id,
      })),
    ).toEqual([
      { deletedAt: undefined, entity: "site", id: active.id },
      { deletedAt: tombstone.deletedAt, entity: "block", id: tombstone.id },
    ]);
    expect(canonicalizeFormlessProgramStorageSnapshot(canonical)).toEqual(canonical);
  });

  it("loads workspace module records from data-only runtime artifact JSON", async () => {
    const workspaceRecords = defineAppSchemaModule({
      key: "workspace-verification-records",
      entities: [
        {
          id: "entity_d0501a6e-4992-46dc-9f76-c67b362dd3bd",
          key: "verification",
          label: "Verification",
          fields: [{ key: "reference", type: "text", required: true }],
        },
      ],
    });
    const artifact = parseRuntimeFormlessProgramArtifactJson(
      formatFormlessProgramArtifact(
        await materializeFormlessProgramArtifact(
          {
            ...formlessProgramDefaultComposition,
            modules: [...formlessProgramSchemaModules, workspaceRecords],
          },
          { runtime: formlessProgramDefaultRuntimeComposition },
        ),
      ),
    );
    const schema = parseFormlessProgramSchemaArtifact(artifact.sourceSchema);
    const verification = storedRecord("verification:one", "verification", {
      reference: "VER-001",
    });
    const snapshot = {
      ...programSnapshot([...programRecords(), verification]),
      schema,
    };
    const canonical = canonicalizeFormlessProgramStorageSnapshot(snapshot, { artifact });
    const workspaceContract = formlessProgramWorkspaceSnapshotContract({ artifact });
    const archiveContract = formlessProgramArchiveSnapshotContract({ artifact });

    expect(canonical.records).toContainEqual(verification);
    expect(workspaceContract).toMatchObject({
      schema,
      schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
      schemaProvenance: artifact.schemaProvenance,
      storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
    });
    expect(archiveContract.parse("workspace Program archive", canonical)).toEqual(canonical);
  });

  it("excludes private state and formats one mixed snapshot deterministically", () => {
    const records = programRecords();
    const snapshot = programSnapshot([...records].reverse());
    const canonical = canonicalizeFormlessProgramStorageSnapshot(snapshot);

    expect(canonical.sourceCursor).toBe(47);
    expect(canonical.records.map(({ entity }) => entity)).toEqual([
      "instance-settings",
      "principal",
      "principal-email",
    ]);
    expect(canonicalizeFormlessProgramStorageSnapshot(canonical)).toEqual(canonical);

    const unsafe = records.map((record) =>
      record.entity === "principal"
        ? {
            ...record,
            values: {
              ...record.values,
              displayName: '{"sessionToken":"private"}',
            },
          }
        : record,
    );
    expect(() => canonicalizeFormlessProgramStorageSnapshot(programSnapshot(unsafe))).toThrow(
      "cannot store private auth state",
    );
  });

  it("parses only Program archives through the injected contract", () => {
    const archive = {
      kind: INSTANCE_ARCHIVE_KIND,
      version: ARCHIVE_VERSION,
      exportedAt: now,
      capabilities: ["core-media-assets"],
      restorePolicy: { dryRun: false },
      program: {
        schemaProvenance: formlessProgramSchemaProvenance,
        snapshot: programSnapshot(programRecords()),
      },
      media: { objects: [] },
    } as const;
    const options = {
      programSnapshotContract: formlessProgramArchiveSnapshotContract(),
    };

    expect(parseInstanceArchive(archive, options).program.snapshot.schemaKey).toBe(
      FORMLESS_PROGRAM_SCHEMA_KEY,
    );
    expect(() =>
      parseInstanceArchive(
        {
          ...archive,
          program: {
            ...archive.program,
            snapshot: { ...archive.program.snapshot, schemaKey: "other-program" },
          },
        },
        options,
      ),
    ).toThrow(`schemaKey must be "${FORMLESS_PROGRAM_SCHEMA_KEY}"`);
  });

  it("writes and reads only the current Program workspace state shape", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "formless-program-workspace-"));
    const manifest = resolveFormlessConfig({ name: "program-workspace" });
    const contract = formlessProgramWorkspaceSnapshotContract();

    try {
      await writeInstanceWorkspaceProgramStorageSnapshot({
        programSnapshotContract: contract,
        manifest,
        snapshot: programSnapshot(programRecords()),
        workspaceRoot,
      });

      const statePath = path.join(workspaceRoot, "state", "instance.json");
      const state = JSON.parse(await readFile(statePath, "utf8")) as {
        records: StoredRecord[];
        schemaKey: string;
        schemaProvenance: unknown;
      };
      expect(state.schemaKey).toBe(FORMLESS_PROGRAM_SCHEMA_KEY);
      expect(state.schemaProvenance).toEqual(formlessProgramSchemaProvenance);
      expect(state.records.map(({ entity }) => entity)).toEqual([
        "instance-settings",
        "principal",
        "principal-email",
      ]);

      await expect(
        readInstanceWorkspaceProgramStorageSnapshot({
          programSnapshotContract: contract,
          manifest,
          workspaceRoot,
        }),
      ).resolves.toEqual(
        canonicalizeFormlessProgramStorageSnapshot(programSnapshot(programRecords())),
      );

      await writeFile(
        statePath,
        JSON.stringify({
          ...state,
          schemaKey: "instance-control-plane",
          schemaProvenance: {
            kind: "instance-control-plane",
            sourceSchemaHash:
              "sha256:1111111111111111111111111111111111111111111111111111111111111111",
          },
        }),
      );
      await expect(
        readInstanceWorkspaceProgramStorageSnapshot({
          programSnapshotContract: contract,
          manifest,
          workspaceRoot,
        }),
      ).rejects.toThrow(`schemaKey must be "${FORMLESS_PROGRAM_SCHEMA_KEY}"`);
    } finally {
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("validates workspace snapshots with the selected shared record adapter", async () => {
    const fixtureRoot = fileURLToPath(
      new URL("../test/workspace-runtime-composition/", import.meta.url),
    );
    const testStateParent = path.join(fixtureRoot, ".formless");

    await mkdir(testStateParent, { recursive: true });
    const stateRoot = await mkdtemp(path.join(testStateParent, "snapshot-adapter-"));
    const manifest = resolveFormlessConfig({
      name: "workspace-snapshot-adapter",
      program: workspaceProgramComposition,
      state: { root: path.relative(fixtureRoot, stateRoot) },
      runtime: {
        composition: {
          shared: "shared.ts",
          browser: "browser.ts",
          worker: "worker.ts",
        },
      },
    });
    const artifact = await materializeFormlessProgramSourceArtifact(manifest.programSource!);
    const snapshot = workspaceRuntimeSnapshot(
      parseFormlessProgramSchemaArtifact(artifact.sourceSchema),
      [
        storedRecord("workspace-record", "workspace-record", {
          label: "rejected-by-workspace-adapter",
        }),
      ],
    );

    try {
      await writeInstanceWorkspaceProgramStorageSnapshot({
        manifest,
        programSnapshotContract: formlessProgramWorkspaceSnapshotContract({
          artifact,
          sharedRuntime: emptySharedRuntime(),
        }),
        snapshot,
        workspaceRoot: fixtureRoot,
      });
      const stateContents = await readFile(path.join(stateRoot, "instance.json"), "utf8");

      expect(stateContents).not.toContain("shared.ts");
      expect(stateContents).not.toContain("workspace.record");

      await expect(
        readValidatedWorkspaceSnapshot({ manifest, workspaceRoot: fixtureRoot }),
      ).rejects.toThrow("Workspace record adapter rejected snapshot records.");
      await expect(
        writeValidatedWorkspaceSnapshot({
          manifest,
          snapshot,
          workspaceRoot: fixtureRoot,
        }),
      ).rejects.toThrow("Workspace record adapter rejected snapshot records.");
    } finally {
      await rm(stateRoot, { force: true, recursive: true });
    }
  });
});

function programSnapshot(records: StoredRecord[]): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
    schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
    exportedAt: now,
    schemaUpdatedAt: now,
    sourceCursor: 47,
    schema: formlessProgramSchema,
    records,
  };
}

function workspaceRuntimeSnapshot(
  schema: StorageSnapshot["schema"],
  records: StoredRecord[],
): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
    schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
    exportedAt: now,
    schemaUpdatedAt: now,
    sourceCursor: records.length,
    schema,
    records,
  };
}

function programRecords(): StoredRecord[] {
  return [
    storedRecord("instance", "instance-settings", {
      settingsId: "instance",
      productionIdentityStatus: "unconfigured",
    }),
    storedRecord("principal:ada", "principal", {
      displayName: "Ada",
      kind: "human",
      status: "active",
    }),
    storedRecord("principal-email:ada", "principal-email", {
      principal: "principal:ada",
      displayEmail: "Ada@example.com",
      normalizedEmail: "ada@example.com",
      verificationStatus: "verified",
      primary: true,
      recovery: true,
    }),
  ];
}

function storedRecord(id: string, entity: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity,
    values,
    createdAt: now,
    updatedAt: now,
  };
}

function taskRecord(id: string, values: StoredRecord["values"]): StoredRecord {
  return storedRecord(id, "task", values);
}

function moduleEntityIds(module: { entities?: readonly { id: string }[] }): Set<string> {
  return new Set(module.entities?.map(({ id }) => id) ?? []);
}

function genericOnlySchema() {
  return parseAppSchema({
    version: 1,
    entities: [
      {
        id: "entity_66dd9be0-8af5-45c6-a391-ed19a73b271b",
        key: "note",
        label: "Note",
        fields: [{ key: "title", type: "text", required: true }],
      },
    ],
    queries: [{ key: "noteAll", label: "Notes", entity: "note", expression: { kind: "all" } }],
    itemViews: [
      {
        key: "noteItem",
        entity: "note",
        fields: [{ field: "title", editor: "text", commit: "field-commit" }],
      },
    ],
    tableViews: [],
    views: [
      {
        key: "noteHome",
        type: "collection",
        label: "Notes",
        entity: "note",
        queries: [{ query: "noteAll" }],
        defaultQuery: "noteAll",
        result: { type: "list", itemView: "noteItem" },
        operations: [],
      },
    ],
    screens: [
      {
        key: "noteHome",
        type: "workspace",
        label: "Notes",
        path: "/notes",
        layout: {
          type: "stack",
          sections: [{ id: "notes", type: "collection", view: "noteHome" }],
        },
      },
    ],
  });
}

function emptySharedRuntime() {
  return defineProgramSharedRuntime({
    target: "shared",
    recordAdapters: [],
    operationAdapters: [],
    bootstrapContributions: [],
    createIdContributions: [],
  });
}

function testSiteRecord(entity: "block" | "site"): StoredRecord {
  const record = testSiteRecords.find((candidate) => candidate.entity === entity);

  if (record === undefined) {
    throw new Error(`Missing Site test record for entity "${entity}".`);
  }

  const cloned = structuredClone(record);

  if (entity === "site") {
    delete cloned.values.home;
    delete cloned.values.header;
    delete cloned.values.footer;
  }

  return cloned;
}
