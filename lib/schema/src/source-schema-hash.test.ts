import { describe, expect, it } from "vite-plus/test";

import {
  computeSourceSchemaHash,
  isSourceSchemaHash,
  parseSourceSchemaHash,
  sourceSchemaCanonicalJson,
} from "./source-schema-hash.ts";

describe("source schema hash", () => {
  it("canonicalizes object keys while preserving registry order", async () => {
    expect(sourceSchemaCanonicalJson({ b: { d: 4, c: 3 }, a: 1 })).toBe(
      '{"a":1,"b":{"c":3,"d":4}}',
    );
    expect(sourceSchemaCanonicalJson({ a: 1, b: [2, { d: 4, c: 3 }] })).toBe(
      sourceSchemaCanonicalJson({ b: [2, { c: 3, d: 4 }], a: 1 }),
    );
    expect(sourceSchemaCanonicalJson({ ä: 3, a: 2, Z: 1 })).toBe('{"Z":1,"a":2,"ä":3}');

    const declared = { registry: [{ key: "first" }, { key: "second" }] };
    const reordered = { registry: [...declared.registry].reverse() };

    expect(sourceSchemaCanonicalJson(reordered)).not.toBe(sourceSchemaCanonicalJson(declared));
    await expect(computeSourceSchemaHash(reordered)).resolves.not.toBe(
      await computeSourceSchemaHash(declared),
    );
    await expect(computeSourceSchemaHash({ b: { d: 4, c: 3 }, a: 1 })).resolves.toBe(
      "sha256:8d463b4d44d84c3a5f01c287245d254181e5d88e0f520c14c325a33422ed9331",
    );
  });

  it("parses canonical SHA-256 source schema hashes", () => {
    const hash = "sha256:1111111111111111111111111111111111111111111111111111111111111111";

    expect(isSourceSchemaHash(hash)).toBe(true);
    expect(parseSourceSchemaHash(hash)).toBe(hash);
    expect(isSourceSchemaHash("sha256:BAD")).toBe(false);
    expect(() => parseSourceSchemaHash("sha256:BAD", "Program provenance")).toThrow(
      "Program provenance must be a sha256 source schema hash.",
    );
  });

  it("hashes the complete schema data", async () => {
    const source = {
      version: 1,
      entities: [{ id: "entity_task", key: "task", label: "Task", fields: [] }],
      queries: [],
      readModels: { computedValues: [], aggregates: [] },
      itemViews: [],
      tableViews: [],
      views: [{ key: "tasks", type: "collection", label: "Tasks", entity: "task" }],
      screens: [],
    };
    const baseHash = await computeSourceSchemaHash(source);

    await expect(
      computeSourceSchemaHash({
        ...source,
        views: [{ ...source.views[0], label: "Open tasks" }],
      }),
    ).resolves.not.toBe(baseHash);
  });
});
