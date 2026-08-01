import { describe, expect, it } from "vite-plus/test";

import {
  formatQualifiedEntityName,
  isEntityId,
  parseAppSchema,
  parseEntityId,
  parseQualifiedEntityName,
} from "./index.ts";
import { rateEntities, rateSchema, taskEntity, taskSchema } from "./schema-test-fixtures.ts";

describe("schema entities", () => {
  it("parses schema-local entity keys and qualified boundary names", () => {
    const schema = parseAppSchema(
      taskSchema({
        entities: [
          {
            key: "task",
            ...taskEntity(),
          },
          {
            key: "project-note",
            ...taskEntity({
              id: "entity_831e331f-41dd-4f3d-950d-211c5328b974",
              label: "Project note",
            }),
          },
          {
            key: "deployment-config",
            ...taskEntity({
              id: "entity_3576cc01-d469-4c23-a3af-68c4ed979bed",
              label: "Deployment config",
            }),
          },
        ],
      }),
    );
    expect(schema.entities.map(({ key }) => key)).toEqual(
      expect.arrayContaining(["task", "project-note", "deployment-config"]),
    );
    expect(parseQualifiedEntityName("Archive entity", "instance:route")).toEqual({
      schemaKey: "instance",
      entityKey: "route",
    });
    expect(formatQualifiedEntityName({ schemaKey: "instance", entityKey: "route" })).toBe(
      "instance:route",
    );
  });

  it("parses canonical stable ids and rejects missing, malformed, or duplicate ids", () => {
    const id = "entity_65f1689f-ce51-457f-b4da-b46775132ff6";
    expect(isEntityId(id)).toBe(true);
    expect(parseEntityId("Entity id", id)).toBe(id);
    expect(isEntityId("entity_65F1689F-ce51-457f-b4da-b46775132ff6")).toBe(false);
    expect(() =>
      parseAppSchema(
        taskSchema({
          entities: [{ key: "task", ...taskEntity({ id: undefined }) }],
        }),
      ),
    ).toThrow('Entity "task" id must use "entity_<lowercase-uuid>" format.');
    expect(() =>
      parseAppSchema(
        taskSchema({
          entities: [{ key: "task", ...taskEntity({ id: "entity_not-a-uuid" }) }],
        }),
      ),
    ).toThrow('Entity "task" id must use "entity_<lowercase-uuid>" format.');
    expect(() =>
      parseAppSchema(
        taskSchema({
          entities: [
            {
              key: "task",
              ...taskEntity(),
            },
            {
              key: "project",
              ...taskEntity({ label: "Project" }),
            },
          ],
        }),
      ),
    ).toThrow(`Schema entities contain duplicate entity id "${id}"`);
  });

  it("rejects non-canonical local entity keys and qualified local references", () => {
    const invalidKeys = [
      "",
      "appInstall",
      "App",
      "app_install",
      "app.install",
      "app/install",
      "site:block",
      "1app",
      "-app",
      "app-",
      "app--install",
    ];

    for (const entityKey of invalidKeys) {
      expect(() =>
        parseAppSchema(
          taskSchema({
            entities: [
              {
                key: "task",
                ...taskEntity(),
              },
              {
                key: entityKey,
                ...taskEntity({ label: "Invalid" }),
              },
            ],
          }),
        ),
      ).toThrow(
        entityKey === ""
          ? "Schema entities[1] key must be a non-empty string."
          : `Schema entity key "${entityKey}" must be a singular kebab-case entity key.`,
      );
    }
    expect(() =>
      parseAppSchema(
        taskSchema({
          entities: [
            {
              key: "task",
              ...taskEntity({
                fields: [
                  ...taskEntity().fields,
                  { key: "parent", type: "reference", required: false, to: "tasks:task" },
                ],
              }),
            },
          ],
        }),
      ),
    ).toThrow('Use local entity key "task"');
  });
  it("parses unique constraints and rejects invalid constraint fields", () => {
    const schema = parseAppSchema(rateSchema({ relationships: undefined }));
    expect(
      schema.entities
        .find((definition) => definition.key === "rate")!
        .constraints?.find((definition) => definition.key === "uniqueRatePair"),
    ).toEqual({
      key: "uniqueRatePair",
      kind: "unique",
      fields: ["resource", "card"],
    });
    const invalidCases = [
      {
        constraints: [],
        message: 'Entity "rate" constraints must not be empty',
      },
      {
        constraints: [{ key: "uniqueRatePair", kind: "unique", fields: [] }],
        message: "fields must be a non-empty array",
      },
      {
        constraints: [{ key: "uniqueRatePair", kind: "unique", fields: ["resource", "missing"] }],
        message: 'references unknown field "missing"',
      },
      {
        constraints: [{ key: "duplicateField", kind: "unique", fields: ["resource", "resource"] }],
        message: "fields must be unique",
      },
      {
        constraints: [{ key: "oneDefaultCard", kind: "uniqueWhere", fields: ["card"] }],
        message: 'has unsupported kind "uniqueWhere"',
      },
    ];

    for (const invalidCase of invalidCases) {
      expect(() =>
        parseAppSchema(
          rateSchema({
            entities: rateEntities({ constraints: invalidCase.constraints }),
            relationships: undefined,
          }),
        ),
      ).toThrow(invalidCase.message);
    }
  });
});
