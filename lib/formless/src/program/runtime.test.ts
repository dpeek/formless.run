import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  parseInstanceArchive,
} from "@dpeek/formless-archive";
import { crmOwnedProgramEntityIds } from "@dpeek/formless-crm-app";
import { computeSourceSchemaHash } from "@dpeek/formless-schema";
import { defineAppSchemaModule } from "@dpeek/formless-schema";
import { identityControlPlaneEntityIds } from "@dpeek/formless-identity-control-plane";
import { instanceControlPlaneEntityIds } from "@dpeek/formless-instance-control-plane";
import { siteEntityIds } from "@dpeek/formless-site-app";
import { tasksEntityIds } from "@dpeek/formless-tasks-app";
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
import { programClientTarget } from "../client/program-target.ts";
import { testSiteRecords } from "../test/site-records.ts";
import rawFormlessProgramSchema from "./schema.json";
import { formatFormlessProgramArtifact, materializeFormlessProgramArtifact } from "./artifact.ts";
import { formlessProgramDefaultComposition, formlessProgramSchemaModules } from "./schema.ts";
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
  resolveFormlessProgramScreenRouteTarget,
  validateFormlessProgramRecords,
} from "./runtime.ts";

const now = "2026-07-30T00:00:00.000Z";

describe("Formless Program runtime contracts", () => {
  it("loads the materialized artifact with one root-owned target and provenance", async () => {
    expect(await computeSourceSchemaHash(rawFormlessProgramSchema)).toBe(
      FORMLESS_PROGRAM_SOURCE_SCHEMA_HASH,
    );
    expect(formlessProgramSchema.entities).toHaveLength(31);
    expect(formlessProgramSchemaProvenance).toEqual({
      kind: "program",
      sourceSchemaHash: FORMLESS_PROGRAM_SOURCE_SCHEMA_HASH,
    });
    expect(programClientTarget()).toEqual({
      kind: "program",
      schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
      authorityName: FORMLESS_PROGRAM_STORAGE_IDENTITY,
      apiRoutePrefix: FORMLESS_PROGRAM_API_ROUTE_PREFIX,
      browserDatabaseName: FORMLESS_PROGRAM_BROWSER_STORAGE_NAME,
      broadcastChannelName: FORMLESS_PROGRAM_BROWSER_STORAGE_NAME,
    });
  });

  it("materializes explicit access for every current Program operation", () => {
    const identityEntityIds = new Set(identityControlPlaneEntityIds);
    const instanceEntityIds = new Set(instanceControlPlaneEntityIds);
    const crmEntityIds = new Set<string>(crmOwnedProgramEntityIds);
    const siteStableEntityIds = new Set<string>(siteEntityIds);
    const taskEntityIds = new Set<string>(tasksEntityIds);

    for (const entity of formlessProgramSchema.entities) {
      expect(
        identityEntityIds.has(entity.id) ||
          instanceEntityIds.has(entity.id) ||
          taskEntityIds.has(entity.id) ||
          siteStableEntityIds.has(entity.id) ||
          crmEntityIds.has(entity.id),
        entity.key,
      ).toBe(true);

      for (const operation of entity.operations ?? []) {
        const operationName = `${entity.key}.${operation.key}`;
        const isAnonymousSiteOperation =
          operationName === "contact-message.submit" || operationName === "subscription.subscribe";

        if (isAnonymousSiteOperation) {
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
          taskEntityIds.has(entity.id) ||
          siteStableEntityIds.has(entity.id) ||
          crmEntityIds.has(entity.id)
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

  it("loads only concrete Program screens with explicit access", () => {
    expect(resolveFormlessProgramScreenRouteTarget("/deployments")).toEqual({
      access: { role: "administrator" },
      key: "deployments",
      label: "Deployments",
      path: "/deployments",
    });
    expect(resolveFormlessProgramScreenRouteTarget("/tasks")).toEqual({
      access: { role: "member" },
      key: "taskHome",
      label: "Tasks",
      path: "/tasks",
    });
    expect(resolveFormlessProgramScreenRouteTarget("/site")).toEqual({
      access: { role: "member" },
      key: "siteEditor",
      label: "Blocks",
      path: "/site",
    });
    expect(resolveFormlessProgramScreenRouteTarget("/site/settings")).toEqual({
      access: { role: "member" },
      key: "siteSettings",
      label: "Settings",
      path: "/site/settings",
    });
    expect(resolveFormlessProgramScreenRouteTarget("/crm")).toEqual({
      access: { role: "member" },
      key: "contacts",
      label: "Contacts",
      path: "/crm",
    });
    expect(resolveFormlessProgramScreenRouteTarget("/crm/broadcasts")).toEqual({
      access: { role: "member" },
      key: "broadcasts",
      label: "Broadcasts",
      path: "/crm/broadcasts",
    });
    expect(resolveFormlessProgramScreenRouteTarget("/pages")).toBeUndefined();
    expect(resolveFormlessProgramScreenRouteTarget("/unknown")).toBeUndefined();

    const missingAccess: unknown = structuredClone(rawFormlessProgramSchema);
    const [firstScreen] = (missingAccess as { screens: Array<{ access?: unknown }> }).screens;

    delete firstScreen?.access;

    expect(() => parseFormlessProgramSchemaArtifact(missingAccess)).toThrow(
      'Formless Program schema screen "routes" must declare explicit access.',
    );
  });

  it("validates mixed records through stable-id-owned package constraints", () => {
    const records = [
      ...programRecords(),
      taskRecord("task:active", { title: "Active", done: false, priority: "high" }),
      testSiteRecord("site"),
      storedRecord("company:formless", "company", {
        name: "Formless",
        status: "customer",
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

  it("retains active and tombstoned CRM records in the Program snapshot", () => {
    const active = testCrmCompanyRecord("company:program-native", "Program Native");
    const tombstone = {
      ...testCrmCompanyRecord("company:program-native-deleted", "Program Native Deleted"),
      deletedAt: "2026-07-31T01:00:00.000Z",
    };
    const canonical = canonicalizeFormlessProgramStorageSnapshot(
      programSnapshot([tombstone, ...programRecords(), active]),
    );
    const canonicalCrmRecords = canonical.records.filter(({ entity }) => entity === "company");

    expect(canonical.storageIdentity).toBe(FORMLESS_PROGRAM_STORAGE_IDENTITY);
    expect(canonical.schemaKey).toBe(FORMLESS_PROGRAM_SCHEMA_KEY);
    expect(
      canonicalCrmRecords.map(({ id, entity, deletedAt }) => ({
        deletedAt,
        entity,
        id,
      })),
    ).toEqual([
      { deletedAt: undefined, entity: "company", id: active.id },
      { deletedAt: tombstone.deletedAt, entity: "company", id: tombstone.id },
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
        await materializeFormlessProgramArtifact({
          ...formlessProgramDefaultComposition,
          modules: [...formlessProgramSchemaModules, workspaceRecords],
        }),
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
    for (const schemaKey of ["instance-control-plane", "crm"]) {
      expect(() =>
        parseInstanceArchive(
          {
            ...archive,
            program: {
              ...archive.program,
              snapshot: { ...archive.program.snapshot, schemaKey },
            },
          },
          options,
        ),
      ).toThrow(`schemaKey must be "${FORMLESS_PROGRAM_SCHEMA_KEY}"`);
    }
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

function testSiteRecord(entity: "block" | "site"): StoredRecord {
  const record = testSiteRecords.find((candidate) => candidate.entity === entity);

  if (record === undefined) {
    throw new Error(`Missing Site test record for entity "${entity}".`);
  }

  return structuredClone(record);
}

function testCrmCompanyRecord(id: string, name: string): StoredRecord {
  return {
    createdAt: now,
    entity: "company",
    id,
    updatedAt: now,
    values: {
      name,
      status: "prospect",
    },
  };
}
