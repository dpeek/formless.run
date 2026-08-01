import { describe, expect, it } from "vite-plus/test";

import { generatedDocumentMediaTarget } from "./media-field-model.ts";

describe("generated document media targeting", () => {
  it("targets the single Program document route for Program fields", () => {
    expect(generatedDocumentMediaTarget("report", "documentAssetId")).toEqual({
      documentsPath: "/api/formless/program/media/documents",
      field: {
        entityName: "report",
        fieldName: "documentAssetId",
      },
    });
  });
});
