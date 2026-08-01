import { computeSourceSchemaHash, parseAppSchema } from "@dpeek/formless-schema";
import { describe, expect, it } from "vite-plus/test";
import { TASK_ENTITY_ID } from "@dpeek/formless-tasks-app";
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

  it("keeps authored, materialized, and parsed schema data aligned", async () => {
    expect(tasksSchemaSource).toEqual(rawSourceSchema);
    expect(parseAppSchema(tasksSchemaSource)).toEqual(parseAppSchema(rawSourceSchema));
    expect(await computeSourceSchemaHash(tasksSchemaSource)).toBe(
      await computeSourceSchemaHash(rawSourceSchema),
    );
  });
});
