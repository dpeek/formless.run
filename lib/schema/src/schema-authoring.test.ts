import { describe, expect, it } from "vite-plus/test";

import {
  defineAppSchema,
  formatAppSchemaSource,
  parseAppSchema,
  type AppSchemaSource,
} from "./index.ts";

describe("App schema source authoring", () => {
  it("preserves source omissions while parsing runtime defaults", () => {
    const source = taskSource();
    const literalVersion: 1 = source.version;

    expect(literalVersion).toBe(1);
    expect(source.entities.task.operations.create).toEqual({
      kind: "create",
      scope: "collection",
    });
    expect(source.views.taskHome.context).not.toHaveProperty("presentation");
    expect(source.screens.home.layout).not.toHaveProperty("width");

    const parsed = parseAppSchema(source);

    expect(parsed.entities.task.operations?.create).toMatchObject({
      audit: { input: "summary" },
      effect: { type: "createRecord" },
      idempotency: { required: true },
      output: { type: "create" },
    });
    expect(parsed.views.taskHome).toMatchObject({
      context: { presentation: "tabs" },
    });
    expect(parsed.screens?.home.layout.width).toBe("standard");
  });

  it("rejects invalid cross-references at the definition boundary", () => {
    const source = taskSource();

    expect(() =>
      defineAppSchema({
        ...source,
        queries: {
          taskAll: {
            ...source.queries.taskAll,
            entity: "missing",
          },
        },
      }),
    ).toThrow('Query "taskAll" references unknown entity "missing".');
  });

  it("formats deterministic source data that round-trips through parsing", () => {
    const source = taskSource();
    const reordered = Object.fromEntries(Object.entries(source).reverse()) as AppSchemaSource;
    const formatted = formatAppSchemaSource(source);

    expect(formatAppSchemaSource(reordered)).toBe(formatted);
    expect(formatted.endsWith("\n")).toBe(true);
    expect(JSON.parse(formatted)).toEqual(source);
    expect(Object.keys((JSON.parse(formatted) as AppSchemaSource).entities.task.fields)).toEqual([
      "title",
      "done",
    ]);
    expect(parseAppSchema(JSON.parse(formatted))).toEqual(parseAppSchema(source));
  });
});

function taskSource() {
  return defineAppSchema({
    version: 1,
    entities: {
      task: {
        label: "Task",
        fields: {
          title: {
            type: "text",
            required: true,
          },
          done: {
            type: "boolean",
            required: true,
          },
        },
        operations: {
          create: {
            kind: "create",
            scope: "collection",
          },
        },
      },
    },
    queries: {
      taskAll: {
        label: "All tasks",
        entity: "task",
        expression: { kind: "all" },
      },
    },
    itemViews: {
      taskItem: {
        entity: "task",
        fields: {
          title: {
            editor: "text",
            commit: "field-commit",
          },
        },
      },
    },
    tableViews: {},
    views: {
      taskHome: {
        type: "collection",
        label: "Tasks",
        entity: "task",
        context: {
          name: "task",
          entity: "task",
          query: "taskAll",
          labelField: "title",
        },
        queries: [{ query: "taskAll" }],
        defaultQuery: "taskAll",
        result: {
          type: "list",
          itemView: "taskItem",
        },
      },
    },
    screens: {
      home: {
        type: "workspace",
        label: "Tasks",
        layout: {
          type: "stack",
          sections: [
            {
              id: "tasks",
              type: "collection",
              view: "taskHome",
            },
          ],
        },
      },
    },
  });
}
