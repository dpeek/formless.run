import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  INSTANCE_ARCHIVE_MANIFEST_FILE,
  parseInstanceArchive,
  readInstanceArchiveDirectory,
  writeInstanceArchiveDirectory,
  type ArchiveProgramSnapshotContract,
  type InstanceArchive,
} from "./node.ts";
import {
  STORAGE_SNAPSHOT_KIND,
  STORAGE_SNAPSHOT_VERSION,
  parseStorageSnapshot,
} from "@dpeek/formless-storage";
import type { AppSchema } from "@dpeek/formless-schema";

const roots: string[] = [];
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
        surface: "constrained",
        width: "standard",
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

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("portable archive directory adapter", () => {
  it("writes and reads one Program archive and its global media", async () => {
    const root = await tempRoot();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const archive = instanceArchive(bytes.byteLength);
    const write = await writeInstanceArchiveDirectory(
      {
        archive,
        mediaFiles: [
          {
            archivePath: archive.media.objects[0]!.archivePath,
            byteSize: bytes.byteLength,
            bytes,
            contentType: "image/png",
          },
        ],
        outDir: "backup",
        programSnapshotContract: contract,
      },
      { cwd: root },
    );

    expect(write).toMatchObject({ mediaCount: 1, recordCount: 0 });
    expect(write).not.toHaveProperty("appCount");
    expect(JSON.parse(await readFile(write.archivePath, "utf8"))).toMatchObject({
      kind: INSTANCE_ARCHIVE_KIND,
      program: { schemaProvenance: { kind: "program", sourceSchemaHash } },
    });

    const read = await readInstanceArchiveDirectory("backup", {
      cwd: root,
      programSnapshotContract: contract,
    });

    expect(read.archive).toEqual(
      parseInstanceArchive(archive, { programSnapshotContract: contract }),
    );
    expect(read.mediaFiles[0]?.bytes).toEqual(bytes);
    expect(read.archivePath).toBe(path.join(root, "backup", INSTANCE_ARCHIVE_MANIFEST_FILE));
  });

  it("rejects unsafe media paths before filesystem access", async () => {
    const root = await tempRoot();
    const archive = instanceArchive(4);
    archive.media.objects[0]!.archivePath = "../escape.png";

    await expect(
      writeInstanceArchiveDirectory(
        {
          archive,
          mediaFiles: [],
          outDir: "backup",
          programSnapshotContract: contract,
        },
        { cwd: root },
      ),
    ).rejects.toThrow("must be a relative path without dot segments");
  });
});

async function tempRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "formless-archive-"));
  roots.push(root);
  return root;
}

function instanceArchive(byteSize: number): InstanceArchive {
  const storageKey = "media/images/hero.png";
  const deliveryHref = `/api/formless/media/${storageKey}`;

  return {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: now,
    capabilities: ["core-media-assets"],
    restorePolicy: { dryRun: true },
    program: {
      schemaProvenance: { kind: "program", sourceSchemaHash },
      snapshot: {
        kind: STORAGE_SNAPSHOT_KIND,
        version: STORAGE_SNAPSHOT_VERSION,
        storageIdentity: "instance:control-plane",
        schemaKey: "formless-program",
        exportedAt: now,
        schemaUpdatedAt: now,
        sourceCursor: 0,
        schema,
        records: [],
      },
    },
    media: {
      objects: [
        {
          archivePath: "media/images/hero.png",
          byteSize,
          contentType: "image/png",
          deliveryHref,
          storageKey,
        },
      ],
    },
  };
}
