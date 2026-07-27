import { describe, expect, it } from "vite-plus/test";

import { composeAppSchema, defineAppSchemaModule, type AppSchemaModuleSource } from "./index.ts";

describe("App schema module authoring", () => {
  it("preserves literal declarations and composes cross-module references", () => {
    const records = taskRecordsModule();
    const projects = projectRecordsModule();
    const presentation = taskPresentationModule(records);
    const moduleKey: "task-records" = records.key;
    const fieldType: "number" = records.entities.task.fields.estimate.type;

    const source = composeAppSchema({
      version: 1,
      modules: [records, projects, presentation],
    });

    expect(moduleKey).toBe("task-records");
    expect(fieldType).toBe("number");
    expect(source).toEqual({
      version: 1,
      entities: { ...records.entities, ...projects.entities },
      queries: records.queries,
      readModels: records.readModels,
      itemViews: presentation.itemViews,
      tableViews: {},
      views: presentation.views,
      screens: presentation.screens,
    });
    expect(Object.keys(source.entities)).toEqual(["task", "project"]);
    expect(Object.keys(source.entities.task.fields)).toEqual(["title", "estimate"]);
    expect(Object.keys(source.readModels?.computedValues ?? {})).toEqual([
      "doubledEstimate",
      "fixedEstimate",
    ]);
    expect(Object.keys(source.readModels?.aggregates ?? {})).toEqual([
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
      entities: {
        shared: {
          label: "Shared",
          fields: {
            title: { type: "text", required: true },
          },
        },
      },
    });
    const queries = defineAppSchemaModule({
      key: "queries",
      queries: {
        shared: {
          label: "Shared",
          entity: "shared",
          expression: { kind: "all" },
        },
      },
      itemViews: {
        sharedItem: {
          entity: "shared",
          fields: {
            title: {
              editor: "text",
              commit: "field-commit",
            },
          },
        },
      },
      views: {
        shared: {
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
      },
      screens: {
        shared: {
          type: "workspace",
          label: "Shared",
          layout: {
            type: "stack",
            sections: [{ id: "shared", type: "collection", view: "shared" }],
          },
        },
      },
    });

    expect(composeAppSchema({ version: 1, modules: [records, queries] })).toMatchObject({
      entities: { shared: records.entities.shared },
      queries: { shared: queries.queries.shared },
    });
  });

  it("validates cross-module references only at the complete App schema boundary", () => {
    const records = taskRecordsModule();
    const invalidQueries = defineAppSchemaModule({
      key: "invalid-queries",
      requires: [records],
      queries: {
        missingTasks: {
          label: "Missing tasks",
          entity: "missing",
          expression: { kind: "all" },
        },
      },
    });

    expect(invalidQueries.queries.missingTasks.entity).toBe("missing");
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
  { path: "entities.shared", declarations: { entities: { shared: {} as never } } },
  {
    path: "relationships.shared",
    declarations: { relationships: { shared: {} as never } },
  },
  { path: "queries.shared", declarations: { queries: { shared: {} as never } } },
  {
    path: "readModels.computedValues.shared",
    declarations: { readModels: { computedValues: { shared: {} as never } } },
  },
  {
    path: "readModels.aggregates.shared",
    declarations: { readModels: { aggregates: { shared: {} as never } } },
  },
  { path: "unions.shared", declarations: { unions: { shared: {} as never } } },
  { path: "itemViews.shared", declarations: { itemViews: { shared: {} as never } } },
  { path: "tableViews.shared", declarations: { tableViews: { shared: {} as never } } },
  { path: "views.shared", declarations: { views: { shared: {} as never } } },
  { path: "screens.shared", declarations: { screens: { shared: {} as never } } },
];

function taskRecordsModule() {
  return defineAppSchemaModule({
    key: "task-records",
    entities: {
      task: {
        label: "Task",
        fields: {
          title: { type: "text", required: true },
          estimate: { type: "number", required: false },
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
    readModels: {
      computedValues: {
        doubledEstimate: {
          entity: "task",
          type: "number",
          expression: {
            kind: "binary",
            op: "multiply",
            left: { kind: "field", field: "estimate" },
            right: { kind: "literal", value: 2 },
          },
        },
        fixedEstimate: {
          entity: "task",
          type: "number",
          expression: { kind: "literal", value: 1 },
        },
      },
      aggregates: {
        taskCount: {
          query: "taskAll",
          function: "count",
        },
        totalEstimate: {
          query: "taskAll",
          function: "sum",
          value: { kind: "field", field: "estimate" },
        },
      },
    },
  });
}

function projectRecordsModule() {
  return defineAppSchemaModule({
    key: "project-records",
    entities: {
      project: {
        label: "Project",
        fields: {
          name: { type: "text", required: true },
        },
      },
    },
  });
}

function taskPresentationModule(records: ReturnType<typeof taskRecordsModule>) {
  return defineAppSchemaModule({
    key: "task-presentation",
    requires: [records],
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
    views: {
      taskHome: {
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
    },
    screens: {
      home: {
        type: "workspace",
        label: "Tasks",
        layout: {
          type: "stack",
          sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
        },
      },
    },
  });
}
