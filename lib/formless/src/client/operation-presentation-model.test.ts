import { describe, expect, it } from "vite-plus/test";
import type { EntitySchema } from "@dpeek/formless-schema";
import { rateSourceSchema, taskSourceSchema } from "../test/schema-apps.ts";
import {
  selectAvailableEntityOperations,
  selectCommandOperationByHandlerCapability,
  selectCommandOperationsByHandlerCapability,
} from "./operation-presentation-model.ts";

describe("operation presentation model", () => {
  it("selects command operations from operation handler capabilities", () => {
    const clearCompleted = selectCommandOperationByHandlerCapability(
      "task",
      taskSourceSchema.entities.find((definition) => definition.key === "task")!,
      "clearCompletedTargetCount",
      "collection",
    );
    const regenerateMissingRates = selectCommandOperationByHandlerCapability(
      "rate",
      rateSourceSchema.entities.find((definition) => definition.key === "rate")!,
      "createMissingJoinRecords",
      "collection",
    );

    expect(clearCompleted).toMatchObject({
      canonicalKey: "task.clearCompletedTasks",
      operationName: "clearCompletedTasks",
      operation: {
        kind: "command",
        effect: {
          type: "operationHandler",
          handler: "clear-completed",
          config: { query: "taskCompleted" },
        },
      },
    });
    expect(regenerateMissingRates).toMatchObject({
      canonicalKey: "rate.regenerateMissingRates",
      operationName: "regenerateMissingRates",
      operation: {
        kind: "command",
        effect: {
          type: "operationHandler",
          handler: "create-missing-join-records",
        },
      },
    });
  });
  it("returns no command capabilities without source operations", () => {
    const entityWithoutOperations = {
      ...taskSourceSchema.entities.find((definition) => definition.key === "task")!,
      operations: undefined,
    } as unknown as EntitySchema;
    expect(
      selectCommandOperationsByHandlerCapability(
        "task",
        entityWithoutOperations,
        "clearCompletedTargetCount",
        "collection",
      ),
    ).toEqual([]);
  });
  it("includes authenticated browser operations and hides non-browser actors", () => {
    const entity = {
      ...taskSourceSchema.entities.find((definition) => definition.key === "task")!,
      operations: [
        {
          key: "authenticatedCommand",
          label: "Authenticated command",
          kind: "command",
          scope: "collection",
          effect: {
            type: "operationHandler",
            handler: "clear-completed",
            config: { query: "taskCompleted" },
          },
          output: { type: "command" },
          idempotency: { required: true },
          audit: { input: "summary" },
          policy: { actors: ["authenticated"] },
        },
        {
          key: "runnerCommand",
          label: "Runner command",
          kind: "command",
          scope: "collection",
          effect: {
            type: "operationHandler",
            handler: "clear-completed",
            config: { query: "taskCompleted" },
          },
          output: { type: "command" },
          idempotency: { required: true },
          audit: { input: "summary" },
          policy: { actors: ["runner"] },
        },
      ],
    } as unknown as EntitySchema;
    expect(
      selectAvailableEntityOperations("task", entity, "collection").map(
        (operation) => operation.operationName,
      ),
    ).toEqual(["authenticatedCommand"]);
  });
});
