import { describe, expect, it } from "vite-plus/test";

import { composeAppSchema, defineAppSchemaModule, type AppSchemaModuleSource } from "./index.ts";

describe("App schema module authoring", () => {
  it("preserves literal declarations and composes cross-module references", () => {
    const records = taskRecordsModule();
    const projects = projectRecordsModule();
    const presentation = taskPresentationModule(records);
    const moduleKey: "task-records" = records.key;
    const fieldType: "number" = records.entities
      .find((definition) => definition.key === "task")!
      .fields.find((definition) => definition.key === "estimate")!.type;
    const source = composeAppSchema({
      version: 1,
      modules: [records, projects, presentation],
    });

    expect(moduleKey).toBe("task-records");
    expect(fieldType).toBe("number");
    expect(source).toEqual({
      version: 1,
      entities: [...records.entities, ...projects.entities],
      queries: records.queries,
      readModels: records.readModels,
      itemViews: presentation.itemViews,
      tableViews: [],
      views: presentation.views,
      screens: presentation.screens,
    });
    expect(source.entities.map(({ key }) => key)).toEqual(["task", "project"]);
    expect(
      source.entities.find((definition) => definition.key === "task")!.fields.map(({ key }) => key),
    ).toEqual(["title", "estimate"]);
    expect(source.readModels?.computedValues?.map(({ key }) => key) ?? []).toEqual([
      "doubledEstimate",
      "fixedEstimate",
    ]);
    expect(source.readModels?.aggregates?.map(({ key }) => key) ?? []).toEqual([
      "taskCount",
      "totalEstimate",
    ]);
    expect(source).not.toHaveProperty("modules");
    expect(source).not.toHaveProperty("key");
    expect(source).not.toHaveProperty("requires");
    expect(source).not.toHaveProperty("relationships");
    expect(source).not.toHaveProperty("unions");
    expect(source).not.toHaveProperty("runtime");
  });

  it("preserves optional root runtime metadata", () => {
    const records = taskRecordsModule();
    const source = composeAppSchema({
      version: 1,
      runtime: { owner: "runtime" },
      modules: [records, taskPresentationModule(records)],
    });

    expect(source.runtime).toEqual({ owner: "runtime" });
  });

  it("requires direct dependencies to be present before their consumers", () => {
    const records = taskRecordsModule();
    const presentation = taskPresentationModule(records);

    expect(() => composeAppSchema({ version: 1, modules: [presentation] })).toThrow(
      'Schema module "task-presentation" requires module "task-records", but "task-records" is not listed.',
    );
    expect(() => composeAppSchema({ version: 1, modules: [presentation, records] })).toThrow(
      'Schema module "task-presentation" requires module "task-records" to be listed before it.',
    );
    expect(() => composeAppSchema({ version: 1, modules: [records, presentation] })).not.toThrow();
  });

  it("rejects duplicate module keys before final schema parsing", () => {
    const first = defineAppSchemaModule({ key: "duplicate" });
    const second = defineAppSchemaModule({ key: "duplicate" });

    expect(() => composeAppSchema({ version: 1, modules: [first, second] })).toThrow(
      'Schema module key "duplicate" is listed more than once.',
    );
  });

  it.each(declarationCollisionCases)("rejects collisions at $path", ({ path, declarations }) => {
    const first = defineAppSchemaModule({ key: "first", ...declarations });
    const second = defineAppSchemaModule({ key: "second", ...declarations });

    expect(() => composeAppSchema({ version: 1, modules: [first, second] })).toThrow(
      `Schema declaration "${path}" is contributed by both modules "first" and "second".`,
    );
  });

  it("keeps identical keys in different declaration namespaces independent", () => {
    const records = defineAppSchemaModule({
      key: "records",
      entities: [
        {
          key: "shared",
          label: "Shared",
          fields: [{ key: "title", type: "text", required: true }],
        },
      ],
    });
    const queries = defineAppSchemaModule({
      key: "queries",
      queries: [
        {
          key: "shared",
          label: "Shared",
          entity: "shared",
          expression: { kind: "all" },
        },
      ],
      itemViews: [
        {
          key: "sharedItem",
          entity: "shared",
          fields: [
            {
              field: "title",
              editor: "text",
              commit: "field-commit",
            },
          ],
        },
      ],
      views: [
        {
          key: "shared",
          type: "collection",
          label: "Shared",
          entity: "shared",
          queries: [{ query: "shared" }],
          defaultQuery: "shared",
          result: {
            type: "list",
            itemView: "sharedItem",
          },
        },
      ],
      screens: [
        {
          key: "shared",
          type: "workspace",
          label: "Shared",
          layout: {
            type: "stack",
            sections: [{ id: "shared", type: "collection", view: "shared" }],
          },
        },
      ],
    });
    expect(composeAppSchema({ version: 1, modules: [records, queries] })).toMatchObject({
      entities: [records.entities.find((definition) => definition.key === "shared")!],
      queries: [queries.queries.find((definition) => definition.key === "shared")!],
    });
  });
  it("validates cross-module references only at the complete App schema boundary", () => {
    const records = taskRecordsModule();
    const invalidQueries = defineAppSchemaModule({
      key: "invalid-queries",
      requires: [records],
      queries: [
        {
          key: "missingTasks",
          label: "Missing tasks",
          entity: "missing",
          expression: { kind: "all" },
        },
      ],
    });
    expect(
      invalidQueries.queries.find((definition) => definition.key === "missingTasks")!.entity,
    ).toBe("missing");
    expect(() => composeAppSchema({ version: 1, modules: [records, invalidQueries] })).toThrow(
      'Query "missingTasks" references unknown entity "missing".',
    );
  });
});

type ModuleDeclarations = Omit<AppSchemaModuleSource, "key" | "requires">;

const declarationCollisionCases: Array<{
  path: string;
  declarations: ModuleDeclarations;
}> = [
  { path: "entities.shared", declarations: { entities: [{ key: "shared" } as never] } },
  {
    path: "relationships.shared",
    declarations: { relationships: [{ key: "shared" } as never] },
  },
  { path: "queries.shared", declarations: { queries: [{ key: "shared" } as never] } },
  {
    path: "readModels.computedValues.shared",
    declarations: { readModels: { computedValues: [{ key: "shared" } as never] } },
  },
  {
    path: "readModels.aggregates.shared",
    declarations: { readModels: { aggregates: [{ key: "shared" } as never] } },
  },
  { path: "unions.shared", declarations: { unions: [{ key: "shared" } as never] } },
  { path: "itemViews.shared", declarations: { itemViews: [{ key: "shared" } as never] } },
  { path: "tableViews.shared", declarations: { tableViews: [{ key: "shared" } as never] } },
  { path: "views.shared", declarations: { views: [{ key: "shared" } as never] } },
  { path: "screens.shared", declarations: { screens: [{ key: "shared" } as never] } },
];
function taskRecordsModule() {
  return defineAppSchemaModule({
    key: "task-records",
    entities: [
      {
        key: "task",
        label: "Task",
        fields: [
          { key: "title", type: "text", required: true },
          { key: "estimate", type: "number", required: false },
        ],
      },
    ],
    queries: [
      {
        key: "taskAll",
        label: "All tasks",
        entity: "task",
        expression: { kind: "all" },
      },
    ],
    readModels: {
      computedValues: [
        {
          key: "doubledEstimate",
          entity: "task",
          type: "number",
          expression: {
            kind: "binary",
            op: "multiply",
            left: { kind: "field", field: "estimate" },
            right: { kind: "literal", value: 2 },
          },
        },
        {
          key: "fixedEstimate",
          entity: "task",
          type: "number",
          expression: { kind: "literal", value: 1 },
        },
      ],
      aggregates: [
        {
          key: "taskCount",
          query: "taskAll",
          function: "count",
        },
        {
          key: "totalEstimate",
          query: "taskAll",
          function: "sum",
          value: { kind: "field", field: "estimate" },
        },
      ],
    },
  });
}

function projectRecordsModule() {
  return defineAppSchemaModule({
    key: "project-records",
    entities: [
      {
        key: "project",
        label: "Project",
        fields: [{ key: "name", type: "text", required: true }],
      },
    ],
  });
}
function taskPresentationModule(records: ReturnType<typeof taskRecordsModule>) {
  return defineAppSchemaModule({
    key: "task-presentation",
    requires: [records],
    itemViews: [
      {
        key: "taskItem",
        entity: "task",
        fields: [
          {
            field: "title",
            editor: "text",
            commit: "field-commit",
          },
        ],
      },
    ],
    views: [
      {
        key: "taskHome",
        type: "collection",
        label: "Tasks",
        entity: "task",
        queries: [{ query: "taskAll" }],
        defaultQuery: "taskAll",
        result: {
          type: "list",
          itemView: "taskItem",
        },
      },
    ],
    screens: [
      {
        key: "home",
        type: "workspace",
        label: "Tasks",
        layout: {
          type: "stack",
          sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
        },
      },
    ],
  });
}
