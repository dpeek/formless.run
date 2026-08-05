import { describe, expect, it } from "vite-plus/test";

import { createDefinitionIndex, getAppSchemaDefinitionIndex, parseAppSchema } from "./index.ts";
import { taskEntity, taskSchema } from "./schema-test-fixtures.ts";

describe("App schema definition indexes", () => {
  it("indexes top-level and nested registries in declaration order", () => {
    const schema = parseAppSchema(
      taskSchema({
        entities: [
          {
            key: "task",
            ...taskEntity({
              constraints: [{ key: "uniqueTitle", kind: "unique", fields: ["title"] }],
              stateMachines: [
                {
                  key: "priorityFlow",
                  field: "priority",
                  initial: "normal",
                  terminal: ["high"],
                  transitions: [
                    {
                      key: "escalate",
                      label: "Escalate",
                      from: ["normal"],
                      to: "high",
                    },
                  ],
                },
              ],
            }),
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
          ],
          aggregates: [
            {
              key: "taskCount",
              query: "taskAll",
              function: "count",
            },
          ],
        },
        unions: [
          {
            key: "taskByPriority",
            entity: "task",
            discriminator: "priority",
            variants: [
              { key: "normal", label: "Normal", fields: ["title"] },
              { key: "high", label: "High", fields: ["title", "dueDate"] },
            ],
          },
        ],
        surfaceMounts: [
          {
            key: "site.preview.browser",
            target: "browser",
            path: "/site/preview",
            access: { actor: "authenticated" },
          },
        ],
      }),
    );
    const index = getAppSchemaDefinitionIndex(schema);
    expect(index.entities.ordered.map(({ key }) => key)).toEqual(["task"]);
    expect(index.entities.byKey.get("task")).toMatchObject({
      key: "task",
      label: "Task",
    });
    expect(index.entitiesById.get("entity_65f1689f-ce51-457f-b4da-b46775132ff6")).toMatchObject({
      key: "task",
      label: "Task",
    });
    expect(index.queries.byKey.get("taskAll")).toMatchObject({
      key: "taskAll",
      entity: "task",
    });
    expect(index.readModels.computedValues.byKey.has("doubledEstimate")).toBe(true);
    expect(index.readModels.aggregates.byKey.has("taskCount")).toBe(true);
    expect(index.itemViews.byKey.has("taskItem")).toBe(true);
    expect(index.tableViews.ordered).toEqual([]);
    expect(index.views.ordered.map(({ key }) => key)).toEqual(["taskHome", "taskCreate"]);
    expect(index.screens.byKey.has("home")).toBe(true);
    expect(index.surfaceMounts.byKey.get("site.preview.browser")?.path).toBe("/site/preview");
    expect(index.relationships.ordered).toEqual([]);

    expect(index.fieldsByEntity.get("task")?.ordered.map(({ key }) => key)).toEqual([
      "title",
      "details",
      "done",
      "dueDate",
      "estimate",
      "priority",
    ]);
    expect(
      index.enumValuesByEntityField
        .get("task")
        ?.get("priority")
        ?.ordered.map(({ key }) => key),
    ).toEqual(["normal", "high"]);
    expect(index.constraintsByEntity.get("task")?.byKey.has("uniqueTitle")).toBe(true);
    expect(index.stateMachinesByEntity.get("task")?.byKey.has("priorityFlow")).toBe(true);
    expect(
      index.transitionsByEntityStateMachine.get("task")?.get("priorityFlow")?.byKey.has("escalate"),
    ).toBe(true);
    expect(index.operationsByEntity.get("task")?.ordered.map(({ key }) => key)).toEqual([
      "create",
      "update",
    ]);
    expect(
      index.operationInputFieldsByEntityOperation
        .get("task")
        ?.get("create")
        ?.ordered.map(({ key }) => key),
    ).toEqual(["title", "details", "done", "dueDate", "estimate", "priority"]);
    expect(index.variantsByUnion.get("taskByPriority")?.ordered.map(({ key }) => key)).toEqual([
      "normal",
      "high",
    ]);
  });

  it("rejects duplicate keys before constructing a map", () => {
    expect(() =>
      createDefinitionIndex(
        [
          { key: "duplicate", label: "First" },
          { key: "duplicate", label: "Second" },
        ],
        "Test definitions",
      ),
    ).toThrow('Test definitions contains duplicate definition key "duplicate".');
  });

  it("caches by parsed schema object identity", () => {
    const schema = parseAppSchema(taskSchema());
    const sameSchemaIndex = getAppSchemaDefinitionIndex(schema);
    const newSchema = parseAppSchema(taskSchema());

    expect(getAppSchemaDefinitionIndex(schema)).toBe(sameSchemaIndex);
    expect(getAppSchemaDefinitionIndex(newSchema)).not.toBe(sameSchemaIndex);
  });
});
