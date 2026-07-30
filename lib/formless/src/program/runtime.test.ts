import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  parseInstanceArchive,
} from "@dpeek/formless-archive";
import { computeSourceSchemaHash } from "@dpeek/formless-installed-apps";
import { identityControlPlaneEntityIds } from "@dpeek/formless-identity-control-plane";
import { instanceControlPlaneEntityIds } from "@dpeek/formless-instance-control-plane";
import {
  STORAGE_SNAPSHOT_KIND,
  STORAGE_SNAPSHOT_VERSION,
  type StorageSnapshot,
  type StoredRecord,
} from "@dpeek/formless-storage";
import {
  readInstanceWorkspaceControlPlaneStorageSnapshot,
  writeInstanceWorkspaceControlPlaneStorageSnapshot,
} from "@dpeek/formless-workspace/node";
import { resolveFormlessConfig } from "@dpeek/formless-workspace";
import { describe, expect, it } from "vite-plus/test";
import { programClientTarget } from "../client/app-target.ts";
import rawFormlessProgramSchema from "./schema.json";
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
  validateFormlessProgramRecords,
} from "./runtime.ts";

const now = "2026-07-30T00:00:00.000Z";

describe("Formless Program runtime contracts", () => {
  it("loads the materialized artifact with one root-owned target and provenance", async () => {
    expect(await computeSourceSchemaHash(rawFormlessProgramSchema)).toBe(
      FORMLESS_PROGRAM_SOURCE_SCHEMA_HASH,
    );
    expect(formlessProgramSchema.entities).toHaveLength(18);
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

    for (const entity of formlessProgramSchema.entities) {
      expect(identityEntityIds.has(entity.id) || instanceEntityIds.has(entity.id), entity.key).toBe(
        true,
      );

      for (const operation of entity.operations ?? []) {
        expect(operation.access, `${entity.key}.${operation.key}`).toBeDefined();

        if (identityEntityIds.has(entity.id)) {
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

  it("validates mixed records through stable-id-owned package constraints", () => {
    const records = programRecords();

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

  it("parses only Program control-plane archives through the injected contract", () => {
    const archive = {
      kind: INSTANCE_ARCHIVE_KIND,
      version: ARCHIVE_VERSION,
      exportedAt: now,
      capabilities: [],
      restorePolicy: { dryRun: false, installCollisions: "reject" },
      controlPlane: programSnapshot(programRecords()),
      apps: [],
    } as const;
    const options = {
      controlPlaneSnapshotContract: formlessProgramArchiveSnapshotContract(),
    };

    expect(parseInstanceArchive(archive, options).controlPlane?.schemaKey).toBe(
      FORMLESS_PROGRAM_SCHEMA_KEY,
    );
    expect(() =>
      parseInstanceArchive(
        {
          ...archive,
          controlPlane: {
            ...archive.controlPlane,
            schemaKey: "instance-control-plane",
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
      await writeInstanceWorkspaceControlPlaneStorageSnapshot({
        controlPlaneSnapshotContract: contract,
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
        readInstanceWorkspaceControlPlaneStorageSnapshot({
          controlPlaneSnapshotContract: contract,
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
        readInstanceWorkspaceControlPlaneStorageSnapshot({
          controlPlaneSnapshotContract: contract,
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
