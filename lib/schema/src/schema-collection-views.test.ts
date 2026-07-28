import { describe, expect, it } from "vite-plus/test";

import { parseAppSchema, stringifySchema } from "./index.ts";
import { taskCollectionView, taskEntity, taskSchema, taskScreen } from "./schema-test-fixtures.ts";

describe("schema collection views", () => {
  it("parses query slots, list results, navigation, and operation bindings", () => {
    const schema = parseAppSchema({
      ...taskSchema(),
      views: replaceDefinition(
        taskSchema().views,
        "taskHome",
        taskCollectionView({ navigation: { primary: true } }),
      ),
    });
    expect(schema.views.find((definition) => definition.key === "taskHome")!).toEqual({
      key: "taskHome",
      type: "collection",
      label: "Tasks",
      entity: "task",
      queries: [{ query: "taskAll", count: { type: "count" } }],
      defaultQuery: "taskAll",
      result: { type: "list", itemView: "taskItem" },
      navigation: { primary: true },
      operations: [{ operation: "task.create", createView: "taskCreate" }],
    });
  });

  it("rejects query, result, and operation references owned by another entity", () => {
    const source = schemaWithNotes();

    expect(() =>
      parseAppSchema({
        ...source,
        views: replaceDefinition(
          source.views,
          "taskHome",
          taskCollectionView({ queries: [{ query: "noteAll" }] }),
        ),
      }),
    ).toThrow('query "noteAll" must use entity "task"');
    expect(() =>
      parseAppSchema({
        ...source,
        views: replaceDefinition(
          source.views,
          "taskHome",
          taskCollectionView({ result: { type: "list", itemView: "noteItem" } }),
        ),
      }),
    ).toThrow('item view "noteItem" must use entity "task"');
    expect(() =>
      parseAppSchema({
        ...source,
        views: replaceDefinition(
          source.views,
          "taskHome",
          taskCollectionView({ operations: [{ operation: "task.missing" }] }),
        ),
      }),
    ).toThrow('references unknown operation "task.missing"');
  });

  it("parses relationship-backed context and context-bound create defaults", () => {
    const source = projectTaskSchema();
    const schema = parseAppSchema(source);
    expect(schema.views.find((definition) => definition.key === "taskHome")!).toMatchObject({
      type: "collection",
      entity: "task",
      context: {
        name: "project",
        entity: "project",
        query: "projectAll",
        labelField: "name",
        presentation: "listDetail",
        relationship: "projectTasks",
        itemView: "projectItem",
        createView: "projectCreate",
      },
      queries: [{ query: "tasksForProject" }],
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("requires context-bound queries and defaults to match collection context", () => {
    const source = projectTaskSchema();

    expect(() =>
      parseAppSchema({
        ...source,
        views: replaceDefinition(source.views, "taskHome", {
          context: {
            name: "selection",
            entity: "project",
            query: "projectAll",
            labelField: "name",
            presentation: "listDetail",
            relationship: "projectTasks",
            itemView: "projectItem",
            createView: "projectCreate",
          },
        }),
      }),
    ).toThrow('query "tasksForProject" requires context "project"');
    expect(() =>
      parseAppSchema({
        ...source,
        views: replaceDefinition(source.views, "taskCreate", {
          defaults: { project: { kind: "context", name: "selection" } },
        }),
      }),
    ).toThrow('requires context "selection" but the collection context is "project"');
  });
});
function schemaWithNotes() {
  const source = taskSchema();
  return {
    ...source,
    entities: [
      ...source.entities,
      {
        key: "note",
        label: "Note",
        fields: [{ key: "title", type: "text", required: true }],
      },
    ],
    queries: [
      ...source.queries,
      { key: "noteAll", label: "Notes", entity: "note", expression: { kind: "all" } },
    ],
    itemViews: [
      ...source.itemViews,
      {
        key: "noteItem",
        entity: "note",
        fields: [{ field: "title", editor: "text", commit: "field-commit" }],
      },
    ],
  };
}
function projectTaskSchema() {
  const source = taskSchema();
  const task = taskEntity({
    fields: [
      ...taskEntity().fields,
      {
        key: "project",
        type: "reference",
        required: true,
        to: "project",
        displayField: "name",
      },
    ],
  });
  return {
    ...source,
    entities: [
      { key: "task", ...task },
      {
        key: "project",
        label: "Project",
        fields: [{ key: "name", type: "text", required: true, label: "Name" }],
        operations: [
          {
            key: "create",
            label: "Create project",
            kind: "create",
            scope: "collection",
            effect: { type: "createRecord" },
            output: { type: "create" },
            idempotency: { required: true },
            audit: { input: "summary" },
          },
        ],
      },
    ],
    relationships: [
      {
        key: "projectTasks",
        kind: "toMany",
        from: { entity: "project" },
        to: { entity: "task", field: "project" },
      },
    ],
    queries: [
      { key: "projectAll", label: "Projects", entity: "project", expression: { kind: "all" } },
      {
        key: "tasksForProject",
        label: "Tasks",
        entity: "task",
        expression: {
          kind: "where",
          ref: { kind: "value", name: "project" },
          op: "eq",
          value: { kind: "context", name: "project" },
        },
      },
    ],
    itemViews: [
      ...source.itemViews,
      {
        key: "projectItem",
        entity: "project",
        fields: [{ field: "name", editor: "text", commit: "field-commit" }],
      },
    ],
    views: [
      {
        key: "taskHome",
        ...taskCollectionView({
          context: {
            name: "project",
            entity: "project",
            query: "projectAll",
            labelField: "name",
            presentation: "listDetail",
            relationship: "projectTasks",
            itemView: "projectItem",
            createView: "projectCreate",
          },
          queries: [{ query: "tasksForProject" }],
          defaultQuery: "tasksForProject",
        }),
      },
      {
        key: "taskCreate",
        type: "create",
        entity: "task",
        fields: [{ field: "title", editor: "text" }],
        defaults: { project: { kind: "context", name: "project" } },
      },
      {
        key: "projectCreate",
        type: "create",
        entity: "project",
        fields: [{ field: "name", editor: "text" }],
      },
    ],
    screens: [{ key: "home", ...taskScreen() }],
  };
}
function replaceDefinition<T extends { key: string }>(
  definitions: readonly T[],
  key: string,
  patch: Record<string, unknown>,
): T[] {
  return definitions.map((definition) =>
    definition.key === key ? { ...definition, ...patch } : definition,
  );
}
