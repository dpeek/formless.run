import { describe, expect, it } from "vite-plus/test";

import {
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  type ArchiveMediaObject,
  type InstanceArchive,
} from "../program/archive.ts";
import { formlessProgramSchema, formlessProgramSchemaProvenance } from "../program/runtime.ts";
import {
  FORMLESS_PROGRAM_SCHEMA_KEY,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
} from "../program/target.ts";
import { coreMediaHrefForKey } from "@dpeek/formless-media";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import {
  applyPortableArchiveRestore,
  dryRunPortableArchiveRestore,
  type ArchiveRestoreApplyTarget,
} from "./archive-restore.ts";

const now = "2026-08-01T00:00:00.000Z";
const bytes = new Uint8Array([1, 2, 3, 4]);

describe("portable Program archive restore", () => {
  it("plans a dry run without beginning a restore transaction", async () => {
    const events: string[] = [];
    const result = await dryRunPortableArchiveRestore(
      instanceArchive({ dryRun: true }),
      restoreTarget(events),
    );

    expect(result).toMatchObject({ ok: true, report: { applied: false } });
    expect(result.ok && result.report.steps.map((step) => step.kind)).toEqual(["media", "program"]);
    expect(events).toEqual(["validate:media/images/hero.png"]);
  });

  it("restores global media before the complete Program snapshot", async () => {
    const events: string[] = [];
    const result = await applyPortableArchiveRestore(
      instanceArchive({ dryRun: false }),
      restoreTarget(events),
    );

    expect(result).toMatchObject({ ok: true, report: { applied: true } });
    expect(events).toEqual([
      "validate:media/images/hero.png",
      "begin",
      "media:media/images/hero.png",
      "program:formless-program",
      "replace-media:media/images/hero.png",
    ]);
  });

  it("validates all media before beginning mutation", async () => {
    const events: string[] = [];
    const target = restoreTarget(events);
    target.media!.readFile = async () => undefined;

    const result = await applyPortableArchiveRestore(instanceArchive({ dryRun: false }), target);

    expect(result).toMatchObject({
      ok: false,
      errors: [{ code: "media-read-failed" }],
    });
    expect(events).toEqual([]);
  });

  it("rolls back media and Program mutations when Program restore fails", async () => {
    const events: string[] = [];
    const target = restoreTarget(events);
    target.restoreProgram = async () => {
      events.push("program:failed");
      throw new Error("Program restore failed");
    };

    const result = await applyPortableArchiveRestore(instanceArchive({ dryRun: false }), target);

    expect(result).toMatchObject({
      ok: false,
      errors: [{ code: "program-restore-failed" }],
    });
    expect(events).toEqual([
      "validate:media/images/hero.png",
      "begin",
      "media:media/images/hero.png",
      "program:failed",
      "rollback",
    ]);
  });
});

function restoreTarget(events: string[]): ArchiveRestoreApplyTarget {
  const object = imageObject();

  return {
    beginRestore: async () => {
      events.push("begin");
      return {
        rollback: async () => {
          events.push("rollback");
        },
      };
    },
    media: {
      listFiles: async () => [
        {
          archivePath: object.archivePath,
          byteSize: bytes.byteLength,
          contentType: object.contentType,
        },
      ],
      readFile: async () => ({
        archivePath: object.archivePath,
        byteSize: bytes.byteLength,
        bytes,
        contentType: object.contentType,
      }),
      restoreObject: async ({ object: restored }) => {
        events.push(`media:${restored.storageKey}`);
        return {
          assetId: "hero.png",
          contentType: restored.contentType,
          href: restored.deliveryHref,
          key: restored.storageKey,
          size: restored.byteSize,
        };
      },
      validateObject: async ({ object: validated }) => {
        events.push(`validate:${validated.storageKey}`);
      },
    },
    replaceMedia: async (storageKeys) => {
      events.push(`replace-media:${[...storageKeys].join(",")}`);
    },
    restoreProgram: async (snapshot) => {
      events.push(`program:${snapshot.schemaKey}`);
    },
  };
}

function instanceArchive(restorePolicy: InstanceArchive["restorePolicy"]): InstanceArchive {
  return {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: now,
    capabilities: ["core-media-assets"],
    restorePolicy,
    program: {
      schemaProvenance: formlessProgramSchemaProvenance,
      snapshot: {
        kind: STORAGE_SNAPSHOT_KIND,
        version: STORAGE_SNAPSHOT_VERSION,
        storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
        schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
        exportedAt: now,
        schemaUpdatedAt: now,
        sourceCursor: 0,
        schema: formlessProgramSchema,
        records: [],
      },
    },
    media: { objects: [imageObject()] },
  };
}

function imageObject(): ArchiveMediaObject {
  const storageKey = "media/images/hero.png";

  return {
    archivePath: `media/program/${storageKey}`,
    byteSize: bytes.byteLength,
    contentType: "image/png",
    deliveryHref: coreMediaHrefForKey(storageKey),
    storageKey,
  };
}
