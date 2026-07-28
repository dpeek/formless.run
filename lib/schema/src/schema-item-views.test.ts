import { describe, expect, it } from "vite-plus/test";

import { parseAppSchema } from "./index.ts";
import { taskSchema } from "./schema-test-fixtures.ts";

describe("schema item views", () => {
  it("parses field editors, commit policies, and presentation metadata", () => {
    const schema = parseAppSchema({
      ...taskSchema(),
      itemViews: [
        {
          key: "taskItem",
          entity: "task",
          fields: [
            { field: "title", editor: "text", commit: "field-commit" },
            {
              field: "done",
              editor: "boolean",
              commit: "immediate",
              presentation: { mode: "completion" },
            },
            {
              field: "dueDate",
              editor: "date",
              commit: "field-commit",
              presentation: { visibility: "valueOrInteraction" },
            },
          ],
        },
      ],
    });
    expect(schema.itemViews.find((definition) => definition.key === "taskItem")!.fields).toEqual([
      { field: "title", editor: "text", commit: "field-commit" },
      {
        field: "done",
        editor: "boolean",
        commit: "immediate",
        presentation: { mode: "completion" },
      },
      {
        field: "dueDate",
        editor: "date",
        commit: "field-commit",
        presentation: { visibility: "valueOrInteraction" },
      },
    ]);
  });
  it("rejects unknown fields and incompatible commit policies", () => {
    expect(() =>
      parseAppSchema({
        ...taskSchema(),
        itemViews: [
          {
            key: "taskItem",
            entity: "task",
            fields: [{ field: "missing", editor: "text", commit: "field-commit" }],
          },
        ],
      }),
    ).toThrow('references unknown field "task.missing"');
    expect(() =>
      parseAppSchema({
        ...taskSchema(),
        itemViews: [
          {
            key: "taskItem",
            entity: "task",
            fields: [{ field: "done", editor: "boolean", commit: "field-commit" }],
          },
        ],
      }),
    ).toThrow("boolean fields must commit immediately");
  });
});
