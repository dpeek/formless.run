import { describe, expect, it } from "vite-plus/test";
import {
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  archiveMediaObjects,
  archiveRecordCount,
  formatInstanceArchive,
  parseInstanceArchive,
  instanceArchiveMediaPath,
  type ArchiveProgramSnapshotContract,
  type InstanceArchive,
} from "./index.ts";
import {
  STORAGE_SNAPSHOT_KIND,
  STORAGE_SNAPSHOT_VERSION,
  formatStoredRecordsForArtifact,
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
      fields: [
        { key: "title", label: "Title", type: "text", required: true },
        { key: "done", label: "Done", type: "boolean", required: false },
      ],
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
  canonicalize: (snapshot) => ({
    ...parseStorageSnapshot(snapshot, {
      schemaKey: "formless-program",
      storageIdentity: "instance:control-plane",
    }),
    records: formatStoredRecordsForArtifact(snapshot.schema, snapshot.records),
  }),
  parse: (_context, value) =>
    parseStorageSnapshot(value, {
      schemaKey: "formless-program",
      storageIdentity: "instance:control-plane",
    }),
  schemaProvenance: { kind: "program", sourceSchemaHash },
};

describe("portable Program archive protocol", () => {
  it("parses only the current instance archive with one required Program", () => {
    const archive = instanceArchive();
    const parsed = parseInstanceArchive(archive, { programSnapshotContract: contract });

    expect(parsed.program.snapshot.schema.screens[0]).toMatchObject({
      type: "workspace",
      layout: { width: "standard" },
    });
    expect(archiveRecordCount(archive)).toBe(2);
    expect(archiveMediaObjects(archive)).toEqual([]);
    expect(() =>
      parseInstanceArchive(
        { ...archive, kind: "unknown.archive" },
        { programSnapshotContract: contract },
      ),
    ).toThrow(`Instance archive kind must be "${INSTANCE_ARCHIVE_KIND}".`);
    expect(() =>
      parseInstanceArchive({ ...archive, unexpected: true }, { programSnapshotContract: contract }),
    ).toThrow('Instance archive has unsupported key "unexpected".');
    expect(() =>
      parseInstanceArchive({ ...archive, version: 2 }, { programSnapshotContract: contract }),
    ).toThrow(`Instance archive version must be ${ARCHIVE_VERSION}.`);
  });

  it("assigns canonical Program archive paths independently from provider keys", () => {
    expect(instanceArchiveMediaPath({ assetId: "hero.png", kind: "image" })).toBe(
      "media/images/hero.png",
    );
    expect(instanceArchiveMediaPath({ assetId: "report.pdf", kind: "document" })).toBe(
      "media/documents/report.pdf",
    );
    expect(
      instanceArchiveMediaPath({ assetId: "../report.pdf", kind: "document" }),
    ).toBeUndefined();
  });

  it("rejects unsupported capabilities, policies, and Program provenance", () => {
    const archive = instanceArchive();

    expect(() =>
      parseInstanceArchive(
        { ...archive, capabilities: ["unknown-capability"] },
        { programSnapshotContract: contract },
      ),
    ).toThrow('Instance archive capabilities[0] "unknown-capability" is unsupported.');
    expect(() =>
      parseInstanceArchive(
        { ...archive, restorePolicy: { dryRun: true, unexpected: "value" } },
        { programSnapshotContract: contract },
      ),
    ).toThrow('Instance archive restorePolicy has unsupported key "unexpected".');
    expect(() =>
      parseInstanceArchive(
        {
          ...archive,
          program: {
            ...archive.program,
            schemaProvenance: {
              kind: "program",
              sourceSchemaHash:
                "sha256:2222222222222222222222222222222222222222222222222222222222222222",
            },
          },
        },
        { programSnapshotContract: contract },
      ),
    ).toThrow(`sourceSchemaHash must be "${sourceSchemaHash}".`);
  });

  it("formats Program records and media deterministically", () => {
    const archive = instanceArchive({
      media: {
        objects: [imageObject("zeta"), imageObject("alpha")],
      },
    });
    const formatted = formatInstanceArchive(archive, { programSnapshotContract: contract });
    const reparsed = parseInstanceArchive(JSON.parse(formatted), {
      programSnapshotContract: contract,
    });

    expect(formatInstanceArchive(reparsed, { programSnapshotContract: contract })).toBe(formatted);
    expect(reparsed.program.snapshot.records.map((record) => record.id)).toEqual([
      "note-a",
      "note-z",
    ]);
    expect(Object.keys(reparsed.program.snapshot.records[0]!.values)).toEqual(["title", "done"]);
    expect(reparsed.media.objects.map((object) => object.storageKey)).toEqual([
      "media/images/alpha.png",
      "media/images/zeta.png",
    ]);
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
      snapshot: storageSnapshot(),
    },
    media: { objects: [] },
    ...overrides,
  };
}

function storageSnapshot(): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: "instance:control-plane",
    schemaKey: "formless-program",
    exportedAt: now,
    schemaUpdatedAt: now,
    sourceCursor: 2,
    schema,
    records: [
      {
        id: "note-z",
        entity: "note",
        values: { done: false, title: "Zeta" },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "note-a",
        entity: "note",
        values: { done: true, title: "Alpha" },
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

function imageObject(name: string) {
  const storageKey = `media/images/${name}.png`;
  const deliveryHref = `/api/formless/media/${storageKey}`;

  return {
    archivePath: `media/images/${name}.png`,
    asset: {
      byteSize: 4,
      contentType: "image/png",
      deliveryHref,
      id: `${name}.png`,
      kind: "image" as const,
      label: name,
      provider: "r2",
      status: "ready" as const,
      storageKey,
    },
    byteSize: 4,
    contentType: "image/png",
    deliveryHref,
    storageKey,
  };
}
