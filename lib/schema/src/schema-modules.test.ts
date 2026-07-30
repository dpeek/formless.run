import { describe, expect, it } from "vite-plus/test";

import { composeAppSchema, defineAppSchemaModule, type AppSchemaModuleSource } from "./index.ts";

describe("App schema module authoring", () => {
  it("preserves literal declarations and composes cross-module references", () => {
    const records = taskRecordsModule();
    const projects = projectRecordsModule();
    const presentation = taskPresentationModule();
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
      modules: [records, taskPresentationModule()],
    });

    expect(source.runtime).toEqual({ owner: "runtime" });
  });

  it("requires dependency keys to be present before their consumers", () => {
    const records = taskRecordsModule();
    const presentation = taskPresentationModule();

    expect(() => composeAppSchema({ version: 1, modules: [presentation] })).toThrow(
      'Schema module "task-presentation" requires module "task-records", but "task-records" is not listed.',
    );
    expect(() => composeAppSchema({ version: 1, modules: [presentation, records] })).toThrow(
      'Schema module "task-presentation" requires module "task-records" to be listed before it.',
    );
    expect(() => composeAppSchema({ version: 1, modules: [records, presentation] })).not.toThrow();
  });

  it("lets an ejected same-key replacement satisfy an upstream dependent", () => {
    const upstream = taskRecordsModule();
    const replacement = defineAppSchemaModule({
      key: upstream.key,
      entities: upstream.entities,
      queries: upstream.queries,
      readModels: upstream.readModels,
    });
    const presentation = taskPresentationModule();

    expect(replacement).not.toBe(upstream);
    expect(
      composeAppSchema({ version: 1, modules: [replacement, presentation] }).entities.map(
        ({ key }) => key,
      ),
    ).toEqual(["task"]);
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
          id: "entity_f7f0a104-3fd7-438b-a502-caf3bef7495d",
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
  it("rejects entity id collisions across different entity keys", () => {
    const first = defineAppSchemaModule({
      key: "first",
      entities: [
        {
          key: "first",
          id: "entity_5e33afde-b424-4a89-94c5-e8ac89668d72",
          label: "First",
          fields: [{ key: "name", type: "text", required: true }],
        },
      ],
    });
    const second = defineAppSchemaModule({
      key: "second",
      entities: [
        {
          key: "second",
          id: "entity_5e33afde-b424-4a89-94c5-e8ac89668d72",
          label: "Second",
          fields: [{ key: "name", type: "text", required: true }],
        },
      ],
    });

    expect(() => composeAppSchema({ version: 1, modules: [first, second] })).toThrow(
      'Schema entity id "entity_5e33afde-b424-4a89-94c5-e8ac89668d72" is contributed by both module "first" entity "first" and module "second" entity "second".',
    );
  });
  it("validates cross-module references only at the complete App schema boundary", () => {
    const records = taskRecordsModule();
    const invalidQueries = defineAppSchemaModule({
      key: "invalid-queries",
      requires: [records.key],
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

  it("composes control-plane policy for an entity owned by the same module", () => {
    const records = runtimeRecordsModule();
    const source = composeAppSchema({
      version: 1,
      runtime: { owner: "runtime" },
      modules: [records],
    });

    expect(source.runtime).toEqual({
      owner: "runtime",
      controlPlane: {
        entities: {
          managed: {
            immutableFields: ["name"],
          },
        },
      },
    });
    expect(source.runtime).not.toHaveProperty("module");
  });

  it("rejects module control-plane policy without a root runtime owner", () => {
    expect(() => composeAppSchema({ version: 1, modules: [runtimeRecordsModule()] })).toThrow(
      'Schema module "runtime-records" contributes runtime controlPlane entity policy, but the composition root has no runtime owner.',
    );
  });

  it("rejects module control-plane policy for an entity owned elsewhere", () => {
    const records = runtimeRecordsModule({ runtime: false });
    const foreignPolicy = defineAppSchemaModule({
      key: "foreign-policy",
      runtime: {
        controlPlane: {
          entities: {
            managed: {
              immutableFields: ["name"],
            },
          },
        },
      },
    });

    expect(() =>
      composeAppSchema({
        version: 1,
        runtime: { owner: "runtime" },
        modules: [records, foreignPolicy],
      }),
    ).toThrow(
      'Schema module "foreign-policy" contributes runtime controlPlane policy for entity "managed", but that entity is owned by module "runtime-records".',
    );
  });

  it("rejects duplicate module control-plane policy ownership", () => {
    const records = runtimeRecordsModule();
    const duplicatePolicy = defineAppSchemaModule({
      key: "duplicate-policy",
      runtime: {
        controlPlane: {
          entities: {
            managed: {
              observedFields: ["name"],
            },
          },
        },
      },
    });

    expect(() =>
      composeAppSchema({
        version: 1,
        runtime: { owner: "runtime" },
        modules: [records, duplicatePolicy],
      }),
    ).toThrow(
      'Schema runtime controlPlane entity policy "managed" is contributed by both modules "runtime-records" and "duplicate-policy".',
    );
  });

  it("rejects module runtime metadata outside control-plane entity policy", () => {
    const invalidRuntime = defineAppSchemaModule({
      key: "invalid-runtime",
      runtime: { owner: "runtime" } as never,
    });

    expect(() =>
      composeAppSchema({
        version: 1,
        runtime: { owner: "runtime" },
        modules: [invalidRuntime],
      }),
    ).toThrow(
      'Schema module "invalid-runtime" runtime contribution must contain only "controlPlane.entities".',
    );
  });
});

type ModuleDeclarations = Omit<AppSchemaModuleSource, "key" | "requires" | "runtime">;

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
        id: "entity_1eef6113-0555-4e82-96fc-1a0dcfb9d475",
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
        id: "entity_2ea5a995-4506-49b4-8bb6-d372872089a4",
        label: "Project",
        fields: [{ key: "name", type: "text", required: true }],
      },
    ],
  });
}
function taskPresentationModule() {
  return defineAppSchemaModule({
    key: "task-presentation",
    requires: ["task-records"],
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

function runtimeRecordsModule(options: { runtime?: boolean } = {}) {
  return defineAppSchemaModule({
    key: "runtime-records",
    entities: [
      {
        key: "managed",
        id: "entity_4bac01cf-56f7-43aa-8914-8a2d2ea251c4",
        label: "Managed",
        fields: [{ key: "name", type: "text", required: true }],
      },
    ],
    queries: [
      {
        key: "managedAll",
        label: "All managed",
        entity: "managed",
        expression: { kind: "all" },
      },
    ],
    itemViews: [
      {
        key: "managedItem",
        entity: "managed",
        fields: [{ field: "name", editor: "text", commit: "field-commit" }],
      },
    ],
    views: [
      {
        key: "managedHome",
        type: "collection",
        label: "Managed",
        entity: "managed",
        queries: [{ query: "managedAll" }],
        defaultQuery: "managedAll",
        result: {
          type: "list",
          itemView: "managedItem",
        },
      },
    ],
    screens: [
      {
        key: "managedHome",
        type: "workspace",
        label: "Managed",
        layout: {
          type: "stack",
          sections: [{ id: "managed", type: "collection", view: "managedHome" }],
        },
      },
    ],
    ...(options.runtime === false
      ? {}
      : {
          runtime: {
            controlPlane: {
              entities: {
                managed: {
                  immutableFields: ["name"],
                },
              },
            },
          },
        }),
  });
}
