import { describe, expect, it } from "vite-plus/test";
import { rateSourceSchema, taskSourceSchema } from "../test/schema-apps.ts";

describe("task source schema", () => {
  it("imports and parses the checked-in schema", () => {
    expect(taskSourceSchema.version).toBe(1);
    expect(taskSourceSchema.entities.find((definition) => definition.key === "task")?.label).toBe(
      "Task",
    );
  });
  it("contains task queries in schema order", () => {
    expect(taskSourceSchema.queries.map(({ key }) => key)).toEqual([
      "taskAll",
      "taskActive",
      "taskCompleted",
      "taskOverdue",
    ]);
    expect(taskSourceSchema.queries.map((query) => query.label)).toEqual([
      "All",
      "Active",
      "Completed",
      "Overdue",
    ]);
  });
  it("parses the overdue query into the normalized and query", () => {
    expect(
      taskSourceSchema.queries.find((definition) => definition.key === "taskOverdue")?.expression,
    ).toEqual({
      kind: "and",
      expressions: [
        {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: false,
        },
        {
          kind: "where",
          ref: { kind: "value", name: "dueDate" },
          op: "before",
          value: { kind: "today" },
        },
      ],
    });
  });
  it("contains the task collection, item view, and operation bindings", () => {
    const priority = taskSourceSchema.entities
      .find((definition) => definition.key === "task")
      ?.fields.find((definition) => definition.key === "priority")!;
    expect(priority?.type === "enum" ? priority.values : undefined).toEqual([
      {
        key: "low",
        label: "Low",
        presentation: { icon: "priority-marker", color: "priority.low" },
      },
      {
        key: "normal",
        label: "Normal",
        presentation: { icon: "priority-marker", color: "priority.normal" },
      },
      {
        key: "high",
        label: "High",
        presentation: { icon: "priority-marker", color: "priority.high" },
      },
    ]);
    const taskHome = taskSourceSchema.views.find((definition) => definition.key === "taskHome");
    if (taskHome?.type !== "collection") {
      throw new Error("Expected taskHome collection view.");
    }
    expect(
      taskSourceSchema.itemViews.find((definition) => definition.key === "taskListItem")?.fields,
    ).toEqual([
      { field: "title", editor: "text" },
      {
        field: "dueDate",
        editor: "date",
        presentation: { visibility: "valueOrInteraction" },
      },
      {
        field: "priority",
        editor: "enum",
        presentation: { list: "both", mode: "iconOnly", trigger: "icon" },
      },
      {
        field: "done",
        editor: "boolean",
        presentation: { mode: "completion" },
      },
    ]);
    expect(taskHome).toMatchObject({
      type: "collection",
      label: "Tasks",
      entity: "task",
      defaultQuery: "taskAll",
      result: { type: "list", itemView: "taskListItem" },
    });
    expect(taskHome.queries).toEqual([
      { query: "taskAll", count: { type: "count" } },
      { query: "taskActive", count: { type: "count" } },
      { query: "taskCompleted", count: { type: "count" } },
      { query: "taskOverdue", count: { type: "count" } },
    ]);
    const operations = taskSourceSchema.entities.find(
      (definition) => definition.key === "task",
    )!.operations!;
    expect(operations.find((definition) => definition.key === "create")!).toMatchObject({
      kind: "create",
      scope: "collection",
      effect: { type: "createRecord" },
      output: { type: "create" },
    });
    expect(operations.find((definition) => definition.key === "update")!).toMatchObject({
      kind: "update",
      scope: "record",
      effect: { type: "patchRecord" },
      output: { type: "update" },
    });
    expect(
      operations.find((definition) => definition.key === "clearCompletedTasks")!,
    ).toMatchObject({
      kind: "command",
      scope: "collection",
      target: { query: "taskCompleted" },
      effect: {
        type: "operationHandler",
        handler: "tombstone-query-results",
        config: { query: "taskCompleted" },
      },
      output: { type: "command" },
    });
    expect(taskHome.operations).toEqual([
      { operation: "task.create", placement: "toolbar", createView: "taskCreate" },
      {
        operation: "task.clearCompletedTasks",
        placement: "toolbar",
        count: { type: "count" },
      },
    ]);
    const clearCompletedEffect = operations.find(
      (definition) => definition.key === "clearCompletedTasks",
    )!.effect;
    expect(
      clearCompletedEffect?.type === "operationHandler" &&
        clearCompletedEffect.handler === "tombstone-query-results"
        ? clearCompletedEffect.config.query
        : undefined,
    ).toBe("taskCompleted");
  });
  it("contains an explicit primary task source screen", () => {
    expect(taskSourceSchema.screens).toEqual([
      {
        key: "taskHome",
        type: "workspace",
        label: "Tasks",
        path: "/",
        layout: {
          type: "stack",
          surface: "constrained",
          sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
          width: "standard",
        },
      },
    ]);
  });
});
describe("rate source schema", () => {
  it("keeps primary route ownership out of rate collection views", () => {
    const collectionNavigation = ["resourceHome", "cardHome", "rateHome"].map((viewName) => {
      const view = rateSourceSchema.views.find((definition) => definition.key === viewName)!;
      return view?.type === "collection" ? view.navigation : "missing";
    });
    expect(collectionNavigation).toEqual([undefined, undefined, undefined]);
  });
  it("contains explicit rates and setup source screens", () => {
    expect(rateSourceSchema.screens).toEqual([
      {
        key: "rateHome",
        type: "workspace",
        label: "Rates",
        path: "/",
        layout: {
          type: "stack",
          surface: "constrained",
          sections: [{ id: "rates", type: "collection", view: "rateHome" }],
          width: "standard",
        },
      },
      {
        key: "rateSetup",
        type: "workspace",
        label: "Setup",
        path: "/setup",
        layout: {
          type: "stack",
          surface: "constrained",
          sections: [
            { id: "cards", type: "collection", view: "cardHome" },
            { id: "resources", type: "collection", view: "resourceHome" },
          ],
          width: "standard",
        },
      },
    ]);
  });
});
