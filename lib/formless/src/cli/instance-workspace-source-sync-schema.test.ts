import { describe, expect, it } from "vite-plus/test";

import {
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  type InstanceArchive,
} from "@dpeek/formless-archive";
import { defineAppSchemaModule, parseAppSchema, type IconValueMode } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";

import {
  materializeFormlessProgramArtifact,
  type FormlessProgramArtifact,
} from "../program/artifact.ts";
import {
  formlessProgramDefaultComposition,
  formlessProgramDefaultRuntimeComposition,
  formlessProgramSchemaModules,
} from "../program/default.ts";
import {
  requireWorkspacePushSchemaCompatibility,
  WorkspacePushSchemaCompatibilityError,
} from "./instance-workspace-source-sync.ts";

const now = "2026-08-10T00:00:00.000Z";
const safeSource = '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z" /></svg>';

describe("workspace push icon schema compatibility", () => {
  it("accepts source-to-fallback refresh with an unchanged legacy SVG record", async () => {
    const current = await iconProgramArtifact();
    const desired = await iconProgramArtifact("iconIdWithSvgFallback", true);

    expect(
      requireWorkspacePushSchemaCompatibility({
        currentArchive: archiveFor(current, safeSource),
        currentSchema: parseAppSchema(current.sourceSchema),
        currentSchemaProvenance: current.schemaProvenance,
        desiredProgramArtifact: desired,
      }),
    ).toEqual({ issues: [], status: "storage-compatible" });
  });

  it("requires materialization before strict id mode when a raw source remains", async () => {
    const current = await iconProgramArtifact("iconIdWithSvgFallback", true);
    const desired = await iconProgramArtifact("iconId", true);
    let thrown: unknown;

    try {
      requireWorkspacePushSchemaCompatibility({
        currentArchive: archiveFor(current, safeSource),
        currentSchema: parseAppSchema(current.sourceSchema),
        currentSchemaProvenance: current.schemaProvenance,
        desiredProgramArtifact: desired,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(WorkspacePushSchemaCompatibilityError);
    expect(thrown).toMatchObject({
      decision: {
        issues: [expect.objectContaining({ code: "current-record-materialization-required" })],
        status: "migration-required",
      },
    });
  });

  it("accepts strict id mode after the stored source is converted to an id", async () => {
    const current = await iconProgramArtifact("iconIdWithSvgFallback", true);
    const desired = await iconProgramArtifact("iconId", true);

    expect(
      requireWorkspacePushSchemaCompatibility({
        currentArchive: archiveFor(current, "missing-catalog-key"),
        currentSchema: parseAppSchema(current.sourceSchema),
        currentSchemaProvenance: current.schemaProvenance,
        desiredProgramArtifact: desired,
      }),
    ).toEqual({ issues: [], status: "storage-compatible" });
  });
});

async function iconProgramArtifact(
  valueMode?: IconValueMode,
  includeCatalog = false,
): Promise<FormlessProgramArtifact> {
  const icons = defineAppSchemaModule({
    key: "icon-compatibility",
    ...(includeCatalog
      ? {
          icons: [
            {
              key: "square",
              label: "Square",
              source: safeSource,
            },
          ],
        }
      : {}),
    entities: [
      {
        key: "note",
        id: "entity_11111111-1111-4111-8111-111111111111",
        label: "Note",
        fields: [
          { key: "title", type: "text", required: true },
          {
            key: "icon",
            type: "text",
            required: false,
            format: "icon",
            ...(valueMode === undefined ? {} : { icon: { valueMode } }),
          },
        ],
      },
    ],
  });

  return materializeFormlessProgramArtifact(
    {
      ...formlessProgramDefaultComposition,
      modules: [...formlessProgramSchemaModules, icons],
    },
    { runtime: formlessProgramDefaultRuntimeComposition },
  );
}

function archiveFor(artifact: FormlessProgramArtifact, icon: string): InstanceArchive {
  const record: StoredRecord = {
    id: "note-1",
    entity: "note",
    values: { title: "Note", icon },
    createdAt: now,
    updatedAt: now,
  };

  return {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: now,
    capabilities: ["core-media-assets"],
    restorePolicy: { dryRun: true },
    program: {
      schemaProvenance: artifact.schemaProvenance,
      snapshot: {
        kind: "formless.storageSnapshot",
        version: 1,
        storageIdentity: "instance:control-plane",
        schemaKey: "formless-program",
        exportedAt: now,
        schemaUpdatedAt: now,
        sourceCursor: 1,
        schema: parseAppSchema(artifact.sourceSchema),
        records: [record],
      },
    },
    media: { objects: [] },
  };
}
