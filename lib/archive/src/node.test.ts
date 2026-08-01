import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
  ARCHIVE_VERSION,
  APP_ARCHIVE_KIND,
  PORTABLE_ARCHIVE_MANIFEST_FILE,
  readPortableArchiveDirectory,
  writePortableArchiveDirectory,
  type AppArchive,
} from "./node.ts";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import { parseAppSchema } from "@dpeek/formless-schema";

const siteSourceSchemaHash =
  "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const siteSourceSchema = parseAppSchema({
  version: 1,
  entities: [
    {
      id: "entity_7762a513-1efb-40ce-ac4c-16c89604acdc",
      key: "site",
      label: "Site",
      fields: [
        { key: "key", type: "text", required: true, label: "Key" },
        { key: "label", type: "text", required: true, label: "Label" },
      ],
      operations: writeOperations("Site", ["key", "label"], { delete: true }),
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
describe("archive node adapter", () => {
  it("writes and reads portable archive directories with media files", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "formless-archive-node-test-"));
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const archive = appArchive(bytes.byteLength);

    const write = await writePortableArchiveDirectory(
      {
        archive,
        mediaFiles: [
          {
            archivePath: "media/site/media/images/hero.png",
            byteSize: bytes.byteLength,
            bytes,
            contentType: "image/png",
          },
        ],
        outDir: "archives/site",
      },
      { cwd },
    );

    expect(write).toEqual({
      appCount: 1,
      archivePath: path.join(cwd, "archives/site", PORTABLE_ARCHIVE_MANIFEST_FILE),
      mediaCount: 1,
      recordCount: 0,
    });
    expect(
      await readFile(path.join(cwd, "archives/site/media/site/media/images/hero.png")),
    ).toEqual(Buffer.from(bytes));

    const read = await readPortableArchiveDirectory("archives/site", { cwd });

    expect(read.archive).toEqual(archive);
    expect(read.archivePath).toBe(write.archivePath);
    expect(read.mediaFiles).toEqual([
      {
        archivePath: "media/site/media/images/hero.png",
        byteSize: bytes.byteLength,
        bytes,
        contentType: "image/png",
      },
    ]);
  });
});

function appArchive(byteSize: number): AppArchive {
  return {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: "2026-05-23T00:00:00.000Z",
    capabilities: ["app-store-snapshots", "core-media-assets"],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    app: {
      installId: "site",
      packageAppKey: "site",
      packageRevision: 1,
      sourceSchemaKey: "site",
      sourceSchemaHash: siteSourceSchemaHash,
      label: "Site",
      status: "installed",
      createdAt: "2026-05-23T00:00:00.000Z",
      updatedAt: "2026-05-23T00:00:00.000Z",
    },
    data: {
      kind: STORAGE_SNAPSHOT_KIND,
      version: STORAGE_SNAPSHOT_VERSION,
      storageIdentity: "app:site",
      schemaKey: "site",
      exportedAt: "2026-05-23T00:00:00.000Z",
      schemaUpdatedAt: "2026-05-23T00:00:00.000Z",
      sourceCursor: 0,
      schema: siteSourceSchema,
      records: [],
    },
    media: {
      objects: [
        {
          archivePath: "media/site/media/images/hero.png",
          byteSize,
          contentType: "image/png",
          deliveryHref: "/api/formless/media/media/images/hero.png",
          storageKey: "media/images/hero.png",
        },
      ],
    },
  };
}
