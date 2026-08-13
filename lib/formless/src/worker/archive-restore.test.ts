import { describe, expect, it } from "vite-plus/test";

import {
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  type ArchiveMediaObject,
  type InstanceArchive,
} from "../program/archive.ts";
import { formlessProgramSchema, formlessProgramSchemaProvenance } from "../program/runtime.ts";
import { defineProgramSharedRuntime } from "../program/composition.ts";
import {
  FORMLESS_PROGRAM_SCHEMA_KEY,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
} from "../program/target.ts";
import { coreMediaHrefForKey } from "@dpeek/formless-media";
import {
  STORAGE_SNAPSHOT_KIND,
  STORAGE_SNAPSHOT_VERSION,
  type StoredRecord,
} from "@dpeek/formless-storage";
import {
  applyInstanceArchiveRestore,
  ArchiveRestoreSourceConflictError,
  dryRunInstanceArchiveRestore,
  type ArchiveRestoreApplyTarget,
} from "./archive-restore.ts";

const now = "2026-08-01T00:00:00.000Z";
const bytes = new Uint8Array([1, 2, 3, 4]);

describe("portable Program archive restore", () => {
  it("plans a dry run without beginning a restore transaction", async () => {
    const events: string[] = [];
    const result = await dryRunInstanceArchiveRestore(
      instanceArchive({ dryRun: true }),
      restoreTarget(events),
    );

    expect(result).toMatchObject({ ok: true, report: { applied: false } });
    expect(result.ok && result.report.steps.map((step) => step.kind)).toEqual(["media", "program"]);
    expect(events).toEqual(["validate:media/images/hero.png"]);
  });

  it("restores global media before the complete Program snapshot", async () => {
    const events: string[] = [];
    const result = await applyInstanceArchiveRestore(
      instanceArchive({ dryRun: false }),
      restoreTarget(events),
    );

    expect(result).toMatchObject({ ok: true, report: { applied: true } });
    expect(events).toEqual([
      "validate:media/images/hero.png",
      "begin",
      "media:media/images/hero.png",
      "replace-media:media/images/hero.png",
      "program:formless-program",
      "commit",
    ]);
  });

  it("validates all media before beginning mutation", async () => {
    const events: string[] = [];
    const target = restoreTarget(events);
    target.media!.readFile = async () => undefined;

    const result = await applyInstanceArchiveRestore(instanceArchive({ dryRun: false }), target);

    expect(result).toMatchObject({
      ok: false,
      errors: [{ code: "media-read-failed" }],
    });
    expect(events).toEqual([]);
  });

  it("validates the complete snapshot through selected ownership before global mutation", async () => {
    const events: string[] = [];
    const adapterInputs: Array<{ all: string[]; owned: string[] }> = [];
    const target = restoreTarget(events);
    const taskEntityId = formlessProgramSchema.entities.find(({ key }) => key === "task")!.id;
    const records = [
      storedRecord("task-1", "task", { title: "Archived task", done: false, priority: "normal" }),
      storedRecord("route-1", "route", {
        enabled: true,
        kind: "mount",
        matchHost: "archive.example.com",
        matchPath: "/",
        matchPrefix: "/",
        targetProfile: "public-site",
      }),
    ];

    target.programSharedRuntime = defineProgramSharedRuntime({
      target: "shared",
      recordAdapters: [
        {
          target: "shared",
          kind: "record-adapter",
          key: "test.archive-task",
          entityIds: [taskEntityId],
          adapter: {
            canonicalize: ({ records }) => records,
            validate: (_context, { allRecords, records: owned }) => {
              adapterInputs.push({
                all: allRecords.map(({ entity }) => entity),
                owned: owned.map(({ entity }) => entity),
              });
            },
            validateCandidate: () => undefined,
          },
        },
      ],
      operationAdapters: [],
      bootstrapContributions: [],
      createIdContributions: [],
    });
    target.restoreProgram = async (snapshot) => {
      events.push(`program:${snapshot.records.map(({ entity }) => entity).join(",")}`);
    };

    const result = await applyInstanceArchiveRestore(
      instanceArchive({ dryRun: false }, records),
      target,
    );

    expect(result).toMatchObject({ ok: true, report: { applied: true } });
    expect(adapterInputs.length).toBeGreaterThan(0);
    expect(adapterInputs).toEqual(
      expect.arrayContaining([{ all: ["task", "route"], owned: ["task"] }]),
    );
    expect(events).toEqual([
      "validate:media/images/hero.png",
      "begin",
      "media:media/images/hero.png",
      "replace-media:media/images/hero.png",
      "program:task,route",
      "commit",
    ]);
  });

  it("returns a typed conflict before media mutation when the target cursor advanced", async () => {
    const events: string[] = [];
    const target = restoreTarget(events);
    target.expectedSourceCursor = 4;
    target.beginRestore = async () => {
      events.push("begin:conflict");
      throw new ArchiveRestoreSourceConflictError(4, 5);
    };

    const result = await applyInstanceArchiveRestore(instanceArchive({ dryRun: false }), target);

    expect(result).toMatchObject({
      errors: [
        {
          code: "target-source-conflict",
          currentSourceCursor: 5,
          expectedSourceCursor: 4,
        },
      ],
      ok: false,
      plan: { expectedSourceCursor: 4 },
    });
    expect(events).toEqual(["validate:media/images/hero.png", "begin:conflict"]);
  });

  it("rolls back media and Program mutations when Program restore fails", async () => {
    const events: string[] = [];
    const state = { media: "original", program: "original" };
    const target = restoreTarget(events);
    const restoreMedia = target.media!.restoreObject;
    target.beginRestore = async () => {
      const prior = { ...state };
      events.push("begin");

      return {
        commit: async () => {
          events.push("commit");
        },
        rollback: async () => {
          Object.assign(state, prior);
          events.push("rollback");
        },
      };
    };
    target.media!.restoreObject = async (input) => {
      state.media = "replacement";
      return restoreMedia(input);
    };
    target.restoreProgram = async () => {
      state.program = "replacement";
      events.push("program:failed");
      throw new Error("Program restore failed");
    };

    const result = await applyInstanceArchiveRestore(instanceArchive({ dryRun: false }), target);

    expect(result).toMatchObject({
      ok: false,
      errors: [{ code: "program-restore-failed" }],
    });
    expect(events).toEqual([
      "validate:media/images/hero.png",
      "begin",
      "media:media/images/hero.png",
      "replace-media:media/images/hero.png",
      "program:failed",
      "rollback",
    ]);
    expect(state).toEqual({ media: "original", program: "original" });
  });
});

function restoreTarget(events: string[]): ArchiveRestoreApplyTarget {
  const object = imageObject();

  return {
    beginRestore: async () => {
      events.push("begin");
      return {
        commit: async () => {
          events.push("commit");
        },
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

function instanceArchive(
  restorePolicy: InstanceArchive["restorePolicy"],
  records: StoredRecord[] = [],
): InstanceArchive {
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
        records,
      },
    },
    media: { objects: [imageObject()] },
  };
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

function imageObject(): ArchiveMediaObject {
  const storageKey = "media/images/hero.png";

  return {
    archivePath: "media/images/hero.png",
    byteSize: bytes.byteLength,
    contentType: "image/png",
    deliveryHref: coreMediaHrefForKey(storageKey),
    storageKey,
  };
}
