import { computeSourceSchemaHash, parseAppPackageManifest } from "@dpeek/formless-installed-apps";
import { parseAppSchema } from "@dpeek/formless-schema";
import { describe, expect, it } from "vite-plus/test";
import rawAppPackageManifest from "@dpeek/formless-tasks-app/formless.app.json";
import rawSourceSchema from "@dpeek/formless-tasks-app/schema.json";
import { tasksPresentationSchemaModule } from "./schema-presentation.ts";
import { tasksRecordSchemaModule } from "./schema-records.ts";
import { tasksSchemaSource } from "./schema.ts";

describe("Tasks schema authoring", () => {
  it("composes record declarations before dependent presentation declarations", () => {
    expect(tasksRecordSchemaModule).toMatchObject({
      key: "tasks-records",
      entities: { task: expect.any(Object) },
      queries: {
        taskAll: expect.any(Object),
        taskActive: expect.any(Object),
        taskCompleted: expect.any(Object),
        taskOverdue: expect.any(Object),
      },
    });
    expect(tasksPresentationSchemaModule).toMatchObject({
      key: "tasks-presentation",
      requires: [tasksRecordSchemaModule],
      itemViews: { taskListItem: expect.any(Object) },
      views: {
        taskHome: expect.any(Object),
        taskCreate: expect.any(Object),
      },
      screens: { taskHome: expect.any(Object) },
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
