import { describe, expect, it } from "vite-plus/test";

import { parseAppSchema, stringifySchema } from "./index.ts";
import { taskCollectionView, taskEntity, taskSchema } from "./schema-test-fixtures.ts";

describe("schema unions", () => {
  it("parses discriminator variants and preserves them through stringify", () => {
    const schema = parseAppSchema(unionSchema());
    expect(schema.unions?.find((definition) => definition.key === "taskByPriority")).toEqual({
      key: "taskByPriority",
      entity: "task",
      discriminator: "priority",
      variants: [
        {
          key: "normal",
          label: "Normal",
          fields: ["title", "priority"],
          requiredFields: ["title"],
        },
        { key: "high", label: "High", fields: ["title", "dueDate"] },
      ],
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("parses union-aware item, edit, and create presentations", () => {
    const source = unionSchema();
    const schema = parseAppSchema({
      ...source,
      itemViews: [
        {
          key: "taskItem",
          entity: "task",
          fields: [{ field: "priority", editor: "enum", commit: "immediate" }],
          union: "taskByPriority",
          variants: [
            {
              variant: "normal",
              presentation: "fields",
              fields: [{ field: "title", editor: "text", commit: "field-commit" }],
            },
            {
              variant: "high",
              presentation: "contextLink",
              labelField: "title",
              target: { kind: "selectContext", context: "task", record: "self" },
            },
          ],
        },
      ],
      views: [
        {
          key: "taskHome",
          ...taskCollectionView(),
        },
        {
          key: "taskCreate",
          type: "create",
          entity: "task",
          fields: [
            { field: "title", editor: "text" },
            { field: "priority", editor: "enum" },
          ],
          union: "taskByPriority",
          variants: unionFieldPresentations(false),
        },
        {
          key: "taskEdit",
          type: "edit",
          entity: "task",
          fields: [{ field: "priority", editor: "enum", commit: "immediate" }],
          union: "taskByPriority",
          variants: unionFieldPresentations(true),
        },
      ],
    });
    expect(
      schema.itemViews
        .find((definition) => definition.key === "taskItem")!
        .variants?.find((definition) => definition.variant === "high"),
    ).toMatchObject({
      presentation: "contextLink",
      labelField: "title",
      target: { kind: "selectContext", context: "task", record: "self" },
    });
    expect(schema.views.find((definition) => definition.key === "taskCreate")!).toMatchObject({
      type: "create",
      union: "taskByPriority",
    });
    expect(schema.views.find((definition) => definition.key === "taskEdit")!).toMatchObject({
      type: "edit",
      union: "taskByPriority",
    });
  });

  it("requires discriminator coverage and matching presentation entities", () => {
    const source = unionSchema();

    expect(() =>
      parseAppSchema({
        ...source,
        unions: [
          {
            key: "taskByPriority",
            entity: "task",
            discriminator: "priority",
            variants: [{ key: "normal", label: "Normal", fields: ["title"] }],
          },
        ],
      }),
    ).toThrow('must define variants for discriminator values "high" or a fallback');
    expect(() =>
      parseAppSchema({
        ...source,
        itemViews: [
          {
            key: "taskItem",
            entity: "task",
            fields: [{ field: "title", editor: "text", commit: "field-commit" }],
            union: "missing",
            variants: [],
          },
        ],
      }),
    ).toThrow('references unknown union "missing"');
  });
});
function unionSchema() {
  return taskSchema({
    entities: [
      {
        key: "task",
        ...taskEntity(),
      },
    ],
    unions: [
      {
        key: "taskByPriority",
        entity: "task",
        discriminator: "priority",
        variants: [
          {
            key: "normal",
            label: "Normal",
            fields: ["title", "priority"],
            requiredFields: ["title"],
          },
          { key: "high", label: "High", fields: ["title", "dueDate"] },
        ],
      },
    ],
  });
}
function unionFieldPresentations(edit: boolean) {
  return [
    {
      variant: "normal",
      presentation: "fields",
      fields: [
        {
          field: "title",
          ...(edit ? { editor: "text", commit: "field-commit" } : { editor: "text" }),
        },
      ],
    },
    {
      variant: "high",
      presentation: "fields",
      fields: edit
        ? [{ field: "dueDate", editor: "date", commit: "field-commit" }]
        : [{ field: "dueDate", editor: "date" }],
    },
  ];
}
