import { computeSourceSchemaHash, parseAppPackageManifest } from "@dpeek/formless-installed-apps";
import { parseAppSchema } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import { describe, expect, it } from "vite-plus/test";
import {
  TASK_ENTITY_ID,
  reviewableTaskRecords,
  tasksEntityIds,
  validateTaskRecords,
} from "@dpeek/formless-tasks-app";
import rawAppPackageManifest from "@dpeek/formless-tasks-app/formless.app.json";
import {
  tasksPresentationSchemaModule,
  tasksRecordSchemaModule,
  tasksSchemaSource,
} from "@dpeek/formless-tasks-app/schema";
import rawSourceSchema from "@dpeek/formless-tasks-app/schema.json";

describe("Tasks schema authoring", () => {
  it("composes record declarations before dependent presentation declarations", () => {
    expect([tasksRecordSchemaModule.key, tasksPresentationSchemaModule.key]).toEqual([
      "tasks-records",
      "tasks-presentation",
    ]);
    expect(tasksRecordSchemaModule).toMatchObject({
      key: "tasks-records",
      entities: [
        expect.objectContaining({
          id: TASK_ENTITY_ID,
          key: "task",
        }),
      ],
      queries: [
        expect.objectContaining({ key: "taskAll" }),
        expect.objectContaining({ key: "taskActive" }),
        expect.objectContaining({ key: "taskCompleted" }),
        expect.objectContaining({ key: "taskOverdue" }),
      ],
    });
    expect(tasksPresentationSchemaModule).toMatchObject({
      key: "tasks-presentation",
      requires: [tasksRecordSchemaModule.key],
      itemViews: [expect.objectContaining({ key: "taskListItem" })],
      views: [
        expect.objectContaining({ key: "taskHome" }),
        expect.objectContaining({ key: "taskCreate" }),
      ],
      screens: [expect.objectContaining({ key: "taskHome" })],
    });
  });

  it("keeps authored, materialized, parsed, and manifest schema data aligned", async () => {
    const manifest = parseAppPackageManifest(rawAppPackageManifest);

    expect(tasksSchemaSource).toEqual(rawSourceSchema);
    expect(parseAppSchema(tasksSchemaSource)).toEqual(parseAppSchema(rawSourceSchema));
    expect(manifest.sourceSchema).toEqual({
      kind: "bundled",
      key: "tasks",
      path: "schema.json",
    });
    expect(await computeSourceSchemaHash(tasksSchemaSource)).toBe(manifest.sourceSchemaHash);
  });

  it("owns Task stable identity and preserves active and tombstoned reviewable records", () => {
    const active = taskRecord("task:active", {
      priority: "high",
      done: false,
      title: "Active",
    });
    const tombstone = {
      ...taskRecord("task:deleted", {
        done: true,
        title: "Deleted",
        priority: "low",
      }),
      deletedAt: "2026-07-30T01:00:00.000Z",
    };

    expect(tasksEntityIds).toEqual([TASK_ENTITY_ID]);
    expect(() => validateTaskRecords("Tasks records", [active, tombstone])).not.toThrow();
    expect(reviewableTaskRecords([tombstone, active])).toEqual([
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
          priority: "low",
        },
      },
    ]);
    expect(() =>
      validateTaskRecords("Tasks records", [{ ...active, entity: "app-install" }]),
    ).toThrow('Tasks records does not support entity "app-install" for record "task:active".');
  });
});

function taskRecord(id: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity: "task",
    values,
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
  };
}
