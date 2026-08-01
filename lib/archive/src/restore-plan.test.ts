import { describe, expect, it } from "vite-plus/test";
import {
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  planPortableArchiveRestore,
  type ArchiveMediaObject,
  type ArchiveProgramSnapshotContract,
  type InstanceArchive,
} from "./index.ts";
import {
  STORAGE_SNAPSHOT_KIND,
  STORAGE_SNAPSHOT_VERSION,
  parseStorageSnapshot,
  type StorageSnapshot,
} from "@dpeek/formless-storage";
import type { AppSchema } from "@dpeek/formless-schema";

const now = "2026-05-23T00:00:00.000Z";
const sourceSchemaHash =
  "sha256:1111111111111111111111111111111111111111111111111111111111111111" as const;
const schema: AppSchema = {
  version: 1,
  entities: [
    {
      id: "entity_11111111-1111-4111-8111-111111111111",
      key: "note",
      label: "Note",
      fields: [{ key: "title", label: "Title", type: "text", required: true }],
      constraints: [{ key: "uniqueTitle", kind: "unique", fields: ["title"] }],
    },
  ],
  queries: [{ key: "all", label: "All notes", entity: "note", expression: { kind: "all" } }],
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
      key: "notes",
      type: "collection",
      label: "Notes",
      entity: "note",
      queries: [{ query: "all" }],
      defaultQuery: "all",
      result: { type: "list", itemView: "noteItem" },
    },
  ],
  screens: [
    {
      key: "home",
      type: "workspace",
      label: "Home",
      layout: {
        type: "stack",
        sections: [{ id: "notes", type: "collection", view: "notes" }],
      },
    },
  ],
};
const contract: ArchiveProgramSnapshotContract = {
  canonicalize: (snapshot) => snapshot,
  parse: (_context, value) =>
    parseStorageSnapshot(value, {
      schemaKey: "formless-program",
      storageIdentity: "instance:control-plane",
    }),
  schemaProvenance: { kind: "program", sourceSchemaHash },
};

describe("Program archive restore planning", () => {
  it("plans deterministic media-before-record dry-run steps", () => {
    const media = imageObject("hero");
    const result = planPortableArchiveRestore(instanceArchive({ media: { objects: [media] } }), {
      mediaFiles: [
        {
          archivePath: media.archivePath,
          byteSize: media.byteSize,
          bytes: new Uint8Array([1, 2, 3, 4]),
          contentType: media.contentType,
        },
      ],
      programSnapshotContract: contract,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.dryRun).toBe(true);
    expect(result.plan.steps.map((step) => step.kind)).toEqual(["restoreMedia", "restoreProgram"]);
    expect(result.plan.summary).toEqual({
      mediaCount: 1,
      recordCounts: {
        active: 1,
        byEntity: { note: 1 },
        tombstoned: 0,
        total: 1,
      },
    });
  });

  it("rejects invalid records and media before planning mutation", () => {
    const duplicate = note("note-b", "Hello");
    const archive = instanceArchive({
      program: {
        schemaProvenance: { kind: "program", sourceSchemaHash },
        snapshot: snapshot([note("note-a", "Hello"), duplicate]),
      },
      media: { objects: [imageObject("missing")] },
    });
    const result = planPortableArchiveRestore(archive, {
      mediaFiles: [],
      programSnapshotContract: contract,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((error) => error.code)).toEqual([
      "missing-media-object",
      "unique-constraint",
    ]);
  });

  it("rejects non-Program provenance before record or media validation", () => {
    const archive = instanceArchive();
    archive.program.schemaProvenance.sourceSchemaHash =
      "sha256:2222222222222222222222222222222222222222222222222222222222222222";
    const result = planPortableArchiveRestore(archive, {
      programSnapshotContract: contract,
    });

    expect(result).toMatchObject({
      ok: false,
      errors: [{ code: "invalid-archive" }],
    });
  });
});

function instanceArchive(overrides: Partial<InstanceArchive> = {}): InstanceArchive {
  return {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: now,
    capabilities: ["core-media-assets"],
    restorePolicy: { dryRun: true },
    program: {
      schemaProvenance: { kind: "program", sourceSchemaHash },
      snapshot: snapshot([note("note-a", "Hello")]),
    },
    media: { objects: [] },
    ...overrides,
  };
}

function snapshot(records: StorageSnapshot["records"]): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: "instance:control-plane",
    schemaKey: "formless-program",
    exportedAt: now,
    schemaUpdatedAt: now,
    sourceCursor: records.length,
    schema,
    records,
  };
}

function note(id: string, title: string) {
  return {
    id,
    entity: "note",
    values: { title },
    createdAt: now,
    updatedAt: now,
  };
}

function imageObject(name: string): ArchiveMediaObject {
  const storageKey = `media/images/${name}.png`;
  return {
    archivePath: `media/program/${storageKey}`,
    byteSize: 4,
    contentType: "image/png",
    deliveryHref: `/api/formless/media/${storageKey}`,
    storageKey,
  };
}
