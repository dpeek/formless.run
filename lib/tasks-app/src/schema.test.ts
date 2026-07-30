import { computeSourceSchemaHash, parseAppPackageManifest } from "@dpeek/formless-installed-apps";
import { parseAppSchema } from "@dpeek/formless-schema";
import { describe, expect, it } from "vite-plus/test";
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
          id: "entity_dc20cc24-23e4-4a16-98fe-bd6e09427c68",
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
});
