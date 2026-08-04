import { siteSchemaSource } from "@dpeek/formless-site-app/schema";

import { describe, expect, it } from "vite-plus/test";

import { SITE_PUBLIC_BLOCK_TYPES } from "./public-block-types.ts";

describe("Site public block types", () => {
  it("matches the block type enum in the source schema", () => {
    const blockTypeField = siteSchemaSource.entities
      .find(({ key }) => key === "block")!
      .fields.find(({ key }) => key === "type")!;

    if (
      blockTypeField.type !== "enum" ||
      !("values" in blockTypeField) ||
      !Array.isArray(blockTypeField.values)
    ) {
      throw new Error("Expected block.type to be an enum field.");
    }
    expect(blockTypeField.values.map(({ key }) => key)).toEqual(SITE_PUBLIC_BLOCK_TYPES);
  });
});
