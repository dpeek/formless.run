import { describe, expect, it } from "vite-plus/test";

import {
  isEntityOperationVisibleToBrowser,
  isRuntimeControlPlaneImmutableField,
  isRuntimeControlPlaneObservedField,
  isRuntimeControlPlaneSecretReferenceField,
  parseAppSchema,
} from "./index.ts";

describe("control-plane schema runtime metadata", () => {
  it("parses runtime-owned metadata, secret references, route validation, and operation policy", () => {
    const schema = parseAppSchema(controlPlaneTaskSchema());
    const operation = schema.entities
      .find((definition) => definition.key === "task")!
      .operations?.find((definition) => definition.key === "runnerApply");
    expect(schema.runtime).toEqual({
      owner: "runtime",
      controlPlane: {
        entities: {
          route: {
            immutableFields: ["target"],
            routeValidation: {
              pathField: "path",
              prefixField: "prefix",
              enabledField: "enabled",
              routeKindField: "routeKind",
              packageCapabilityField: "packageCapability",
              reservedPaths: ["/api"],
              routeKindCapabilities: {
                admin: "generatedApp",
                publicSite: "publicSite",
              },
            },
          },
          task: {
            immutableFields: ["title"],
            observedFields: ["done"],
            secretReferenceFields: ["secretRef"],
          },
        },
      },
    });
    expect(isRuntimeControlPlaneImmutableField(schema, "task", "title")).toBe(true);
    expect(isRuntimeControlPlaneObservedField(schema, "task", "done")).toBe(true);
    expect(isRuntimeControlPlaneObservedField(schema, "task", "title")).toBe(false);
    expect(isRuntimeControlPlaneSecretReferenceField(schema, "task", "secretRef")).toBe(true);
    expect(operation?.policy).toEqual({
      actors: ["runner"],
      responseFields: { runner: ["done"] },
    });
    expect(operation?.policy?.actors?.includes("runner")).toBe(true);
    expect(operation?.policy?.actors?.includes("owner")).toBe(false);
    expect(operation && isEntityOperationVisibleToBrowser(operation)).toBe(false);
  });

  it("rejects control-plane metadata that references unsupported fields", () => {
    expect(() =>
      parseAppSchema({
        ...controlPlaneTaskSchema(),
        runtime: {
          owner: "runtime",
          controlPlane: {
            entities: {
              task: { immutableFields: ["missing"] },
            },
          },
        },
      }),
    ).toThrow('references unknown field "missing"');
  });

  it("rejects observed field metadata that references unknown fields", () => {
    expect(() =>
      parseAppSchema({
        ...controlPlaneTaskSchema(),
        runtime: {
          owner: "runtime",
          controlPlane: {
            entities: {
              task: { observedFields: ["missing"] },
            },
          },
        },
      }),
    ).toThrow('references unknown field "missing"');
  });

  it("parses runtime control-plane history declarations", () => {
    const source = controlPlaneTaskSchema();
    const operationCreatedSchema = parseAppSchema({
      ...source,
      runtime: {
        owner: "runtime",
        controlPlane: {
          entities: {
            task: {
              history: { kind: "operationCreated" },
            },
          },
        },
      },
    });
    const appendOnlySchema = parseAppSchema({
      ...source,
      entities: source.entities.map((definition) =>
        definition.key === "task"
          ? {
              ...definition,
              operations: undefined,
            }
          : definition,
      ),
      runtime: {
        owner: "runtime",
        controlPlane: {
          entities: {
            task: {
              history: { kind: "appendOnly" },
            },
          },
        },
      },
    });

    expect(operationCreatedSchema.runtime?.controlPlane?.entities.task?.history?.kind).toBe(
      "operationCreated",
    );
    expect(appendOnlySchema.runtime?.controlPlane?.entities.task?.history?.kind).toBe("appendOnly");
  });
});

function controlPlaneTaskSchema() {
  return {
    version: 1,
    entities: [
      {
        id: "entity_63aa8c10-96a6-480f-915b-abafe0184ed0",
        key: "task",
        label: "Task",
        fields: [
          { key: "title", type: "text", required: true, label: "Title" },
          { key: "done", type: "boolean", required: true, label: "Done", default: false },
          { key: "secretRef", type: "text", required: false, label: "Secret ref" },
        ],
        operations: [
          {
            key: "runnerApply",
            label: "Runner apply",
            kind: "command",
            scope: "collection",
            target: { query: "taskCompleted" },
            effect: {
              type: "operationHandler",
              handler: "clear-completed",
              config: { query: "taskCompleted" },
            },
            policy: {
              actors: ["runner"],
              responseFields: { runner: ["done"] },
            },
          },
        ],
      },
      {
        id: "entity_504ff45e-a169-4c9d-b3fb-ce23b15375c7",
        key: "route",
        label: "Route",
        fields: [
          { key: "target", type: "text", required: true },
          { key: "path", type: "text", required: true },
          { key: "prefix", type: "text", required: false },
          { key: "enabled", type: "boolean", required: true, default: true },
          {
            key: "routeKind",
            type: "enum",
            required: true,
            values: [
              { key: "admin", label: "Admin" },
              { key: "publicSite", label: "Public Site" },
            ],
          },
          {
            key: "packageCapability",
            type: "enum",
            required: true,
            values: [
              { key: "generatedApp", label: "Generated app" },
              { key: "publicSite", label: "Public Site" },
            ],
          },
        ],
      },
    ],
    queries: [
      {
        key: "taskCompleted",
        label: "Completed",
        entity: "task",
        expression: {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: true,
        },
      },
    ],
    itemViews: [
      {
        key: "taskItem",
        entity: "task",
        fields: [
          { field: "title", editor: "text", commit: "field-commit" },
          { field: "done", editor: "boolean", commit: "immediate" },
        ],
      },
    ],
    tableViews: [],
    views: [
      {
        key: "taskHome",
        type: "collection",
        label: "Tasks",
        entity: "task",
        queries: [{ query: "taskCompleted" }],
        defaultQuery: "taskCompleted",
        result: { type: "list", itemView: "taskItem" },
      },
    ],
    screens: [
      {
        key: "home",
        type: "workspace",
        label: "Home",
        layout: {
          type: "stack",
          sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
        },
      },
    ],
    runtime: {
      owner: "runtime",
      controlPlane: {
        entities: {
          task: {
            immutableFields: ["title"],
            observedFields: ["done"],
            secretReferenceFields: ["secretRef"],
          },
          route: {
            immutableFields: ["target"],
            routeValidation: {
              pathField: "path",
              prefixField: "prefix",
              enabledField: "enabled",
              routeKindField: "routeKind",
              packageCapabilityField: "packageCapability",
              reservedPaths: ["/api"],
              routeKindCapabilities: {
                admin: "generatedApp",
                publicSite: "publicSite",
              },
            },
          },
        },
      },
    },
  };
}
