import { describe, expect, it } from "vite-plus/test";

import {
  isSummaryItemViewSchema,
  parseAppSchema,
  stringifySchema,
  type ItemViewSchemaSource,
  type KeyedDefinition,
} from "./index.ts";
import { taskSchema } from "./schema-test-fixtures.ts";

describe("schema item views", () => {
  it("parses and canonically serializes summary title and subtitle fields", () => {
    const summaryItemView = {
      key: "taskItem",
      entity: "task",
      presentation: {
        type: "summary",
        slots: {
          title: { field: "title" },
          subtitle: { field: "dueDate" },
        },
      },
    } satisfies KeyedDefinition<ItemViewSchemaSource>;
    const schema = parseAppSchema({
      ...taskSchema(),
      itemViews: [summaryItemView],
    });
    const itemView = schema.itemViews[0]!;

    expect(isSummaryItemViewSchema(itemView)).toBe(true);
    if (!isSummaryItemViewSchema(itemView)) {
      throw new Error("Expected a summary item view.");
    }
    expect(itemView.presentation).toEqual(summaryItemView.presentation);
    expect(JSON.parse(stringifySchema(schema)).itemViews).toEqual([summaryItemView]);

    const titleOnly = parseAppSchema({
      ...taskSchema(),
      itemViews: [
        {
          key: "taskItem",
          entity: "task",
          presentation: {
            type: "summary",
            slots: { title: { field: "title" } },
          },
        },
      ],
    });
    expect(titleOnly.itemViews[0]!.presentation).toEqual({
      type: "summary",
      slots: { title: { field: "title" } },
    });
  });

  it("rejects mixed summary declarations and unsupported summary slots", () => {
    expect(() =>
      parseAppSchema({
        ...taskSchema(),
        itemViews: [
          {
            key: "taskItem",
            entity: "task",
            fields: [{ field: "title" }],
            presentation: {
              type: "summary",
              slots: { title: { field: "title" } },
            },
          },
        ],
      }),
    ).toThrow('Item view "taskItem" has unsupported key "fields".');

    expect(() =>
      parseAppSchema({
        ...taskSchema(),
        itemViews: [
          {
            key: "taskItem",
            entity: "task",
            presentation: {
              type: "summary",
              slots: {
                title: { field: "title" },
                status: { field: "done" },
              },
            },
          },
        ],
      }),
    ).toThrow('Item view "taskItem" summary slots has unsupported key "status".');

    expect(() =>
      parseAppSchema({
        ...taskSchema(),
        itemViews: [
          {
            key: "taskItem",
            entity: "task",
            presentation: {
              type: "summary",
              slots: { title: { field: "title", editor: "text" } },
            },
          },
        ],
      }),
    ).toThrow('Item view "taskItem" summary title has unsupported key "editor".');
  });

  it("requires summary title and resolves each slot field on the item entity", () => {
    expect(() =>
      parseAppSchema({
        ...taskSchema(),
        itemViews: [
          {
            key: "taskItem",
            entity: "task",
            presentation: {
              type: "summary",
              slots: { subtitle: { field: "dueDate" } },
            },
          },
        ],
      }),
    ).toThrow('Item view "taskItem" summary slots must include "title".');

    expect(() =>
      parseAppSchema({
        ...taskSchema(),
        itemViews: [
          {
            key: "taskItem",
            entity: "task",
            presentation: {
              type: "summary",
              slots: {
                title: { field: "title" },
                subtitle: { field: "project.title" },
              },
            },
          },
        ],
      }),
    ).toThrow(
      'Item view "taskItem" summary subtitle references unknown field "task.project.title".',
    );
  });

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
