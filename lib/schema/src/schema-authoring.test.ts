import { describe, expect, it } from "vite-plus/test";

import {
  DOCUMENT_ASSET_POLICY_MAX_BYTES,
  defineAppSchema,
  formatAppSchemaSource,
  parseAppSchema,
  type AppSchemaSource,
  type KeyedDefinition,
  type WorkspaceScreenSchema,
} from "./index.ts";

describe("App schema source authoring", () => {
  it("preserves source omissions while parsing runtime defaults", () => {
    const source = taskSource();
    const literalVersion: 1 = source.version;
    expect(literalVersion).toBe(1);
    expect(
      source.entities
        .find((definition) => definition.key === "task")!
        .operations.find((definition) => definition.key === "create")!,
    ).toEqual({
      key: "create",
      kind: "create",
      scope: "collection",
    });
    expect(
      source.views.find((definition) => definition.key === "taskHome")!.context,
    ).not.toHaveProperty("presentation");
    expect(
      source.screens.find((definition) => definition.key === "home")!.layout,
    ).not.toHaveProperty("width");
    const parsed = parseAppSchema(source);
    expect(
      parsed.entities
        .find((definition) => definition.key === "task")!
        .operations?.find((definition) => definition.key === "create"),
    ).toMatchObject({
      audit: { input: "summary" },
      effect: { type: "createRecord" },
      idempotency: { required: true },
      output: { type: "create" },
    });
    expect(parsed.views.find((definition) => definition.key === "taskHome")!).toMatchObject({
      context: { presentation: "tabs" },
    });
    expect(
      parsed.screens.find(
        (definition): definition is KeyedDefinition<WorkspaceScreenSchema> =>
          definition.key === "home" && definition.type === "workspace",
      )!.layout.width,
    ).toBe("standard");
  });
  it("rejects invalid cross-references at the definition boundary", () => {
    const source = taskSource();
    expect(() =>
      defineAppSchema({
        ...source,
        queries: source.queries.map((definition) =>
          definition.key === "taskAll"
            ? {
                ...definition,
                entity: "missing",
              }
            : definition,
        ),
      }),
    ).toThrow('Query "taskAll" references unknown entity "missing".');
  });

  it("authors document-backed text fields without changing their value type", () => {
    const source = taskSource();
    const authored = defineAppSchema({
      ...source,
      entities: source.entities.map((definition) =>
        definition.key === "task"
          ? {
              ...definition,
              fields: [
                ...definition.fields,
                {
                  key: "report",
                  type: "text",
                  required: false,
                  asset: {
                    kind: "document",
                    acceptedMimeTypes: ["application/pdf"],
                    maxBytes: DOCUMENT_ASSET_POLICY_MAX_BYTES,
                    access: "public",
                  },
                },
              ],
            }
          : definition,
      ),
    });
    expect(
      authored.entities
        .find((definition) => definition.key === "task")!
        .fields.find((definition) => definition.key === "report")!,
    ).toEqual({
      key: "report",
      type: "text",
      required: false,
      asset: {
        kind: "document",
        acceptedMimeTypes: ["application/pdf"],
        maxBytes: DOCUMENT_ASSET_POLICY_MAX_BYTES,
        access: "public",
      },
    });
  });
  it("formats deterministic source data that round-trips through parsing", () => {
    const source = taskSource();
    const reordered = Object.fromEntries(
      Object.entries(source).reverse(),
    ) as unknown as AppSchemaSource;
    const formatted = formatAppSchemaSource(source);
    expect(formatAppSchemaSource(reordered)).toBe(formatted);
    expect(formatted.endsWith("\n")).toBe(true);
    expect(JSON.parse(formatted)).toEqual(source);
    expect(
      (JSON.parse(formatted) as AppSchemaSource).entities
        .find((definition) => definition.key === "task")!
        .fields.map(({ key }) => key),
    ).toEqual(["title", "done"]);
    expect(parseAppSchema(JSON.parse(formatted))).toEqual(parseAppSchema(source));
  });
});

function taskSource() {
  return defineAppSchema({
    version: 1,
    entities: [
      {
        key: "task",
        id: "entity_c7cdf288-bdb9-4285-9480-9787f641e0bf",
        label: "Task",
        fields: [
          {
            key: "title",
            type: "text",
            required: true,
          },
          {
            key: "done",
            type: "boolean",
            required: true,
          },
        ],
        operations: [
          {
            key: "create",
            kind: "create",
            scope: "collection",
          },
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
    tableViews: [],
    views: [
      {
        key: "taskHome",
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
    ],
    screens: [
      {
        key: "home",
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
    ],
  });
}
