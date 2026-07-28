import { describe, expect, it } from "vite-plus/test";

import { parseAppSchema } from "./index.ts";
import { rateEntities, rateRelationships, rateSchema } from "./schema-test-fixtures.ts";

describe("schema relationships", () => {
  it("parses optional to-one, to-many, and many-to-many relationships", () => {
    expect(parseAppSchema(rateSchema({ relationships: undefined })).relationships).toBeUndefined();
    const schema = parseAppSchema(rateSchema());
    expect(schema.relationships?.find((definition) => definition.key === "rateCard")).toEqual(
      relationship("rateCard"),
    );
    expect(schema.relationships?.find((definition) => definition.key === "cardRates")).toEqual(
      relationship("cardRates"),
    );
    expect(schema.relationships?.find((definition) => definition.key === "cardResources")).toEqual(
      relationship("cardResources"),
    );
  });
  it("rejects invalid relationship endpoints, through constraints, and inverse links", () => {
    const relationships = rateRelationships();
    const invalidCases = [
      {
        relationships: {},
        message: "Schema relationships must be an array",
      },
      {
        relationships: replaceRelationship(relationships, "rateCard", {
          to: { entity: "resource" },
        }),
        message: 'from field "rate.card" must reference entity "resource"',
      },
      {
        relationships: replaceRelationship(relationships, "cardRates", {
          to: { entity: "rate", field: "resource" },
        }),
        message: 'to field "rate.resource" must reference entity "card"',
      },
      {
        relationships: replaceRelationship(relationships, "cardResources", {
          through: {
            ...relationship("cardResources").through,
            fromField: "cost",
          },
        }),
        message: 'through fromField field "rate.cost" must be a reference field',
      },
      {
        relationships: replaceRelationship(relationships, "cardResources", {
          through: {
            ...relationship("cardResources").through,
            uniqueConstraint: "missing",
          },
        }),
        message: 'references unknown constraint "rate.missing"',
      },
      {
        relationships: replaceRelationship(relationships, "rateCard", { inverse: "missing" }),
        message: 'inverse references unknown relationship "missing"',
      },
    ];

    for (const invalidCase of invalidCases) {
      expect(() =>
        parseAppSchema(rateSchema({ relationships: invalidCase.relationships })),
      ).toThrow(invalidCase.message);
    }

    expect(() =>
      parseAppSchema(
        rateSchema({
          entities: rateEntities({
            constraints: [{ key: "uniqueRatePair", kind: "unique", fields: ["card"] }],
          }),
        }),
      ),
    ).toThrow('must cover through fields "card" and "resource"');
  });
});
function relationship(key: string) {
  return rateRelationships().find((definition) => definition.key === key)!;
}
function replaceRelationship(
  relationships: ReturnType<typeof rateRelationships>,
  key: string,
  patch: Record<string, unknown>,
) {
  return relationships.map((definition) =>
    definition.key === key ? { ...definition, ...patch } : definition,
  );
}
