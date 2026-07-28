import { describe, expect, it } from "vite-plus/test";

import {
  canonicalJsonStringify,
  compareOrdinalStrings,
  parseAppSchema,
  stringifySchema,
} from "./index.ts";
import { taskSchema } from "./schema-test-fixtures.ts";

describe("schema parsing and formatting", () => {
  it("returns canonical schema data that round-trips through stringify", () => {
    const schema = parseAppSchema(taskSchema());
    const serialized = JSON.parse(stringifySchema(schema));

    expect(serialized).toEqual(schema);
    expect(parseAppSchema(serialized)).toEqual(schema);
  });

  it("rejects unsupported top-level shape before returning a runtime model", () => {
    expect(() => parseAppSchema(null)).toThrow("Schema must be an object.");
    expect(() => parseAppSchema({ ...taskSchema(), version: 2 })).toThrow(
      "Schema version must be 1.",
    );
    expect(() => parseAppSchema({ ...taskSchema(), generatedAt: "now" })).toThrow(
      'Schema has unsupported key "generatedAt".',
    );
  });

  it("sorts object properties ordinally and preserves array order", () => {
    expect(compareOrdinalStrings("Z", "a")).toBe(-1);
    expect(compareOrdinalStrings("ä", "z")).toBe(1);
    expect(canonicalJsonStringify({ ä: 3, a: { z: 2, Z: 1 }, Z: 0 })).toBe(
      '{"Z":0,"a":{"Z":1,"z":2},"ä":3}',
    );

    const declared = { registry: [{ key: "first" }, { key: "second" }] };
    const reordered = { registry: [...declared.registry].reverse() };

    expect(canonicalJsonStringify(reordered)).not.toBe(canonicalJsonStringify(declared));
  });
});
