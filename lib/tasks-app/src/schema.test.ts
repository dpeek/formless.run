import { computeSourceSchemaHash, parseAppPackageManifest } from "@dpeek/formless-installed-apps";
import { parseAppSchema } from "@dpeek/formless-schema";
import { describe, expect, it } from "vite-plus/test";
import rawAppPackageManifest from "../formless.app.json";
import rawSourceSchema from "../schema.json";
import { tasksSchemaSource } from "./schema.ts";

describe("Tasks schema authoring", () => {
  it("keeps authored, materialized, parsed, and manifest schema data aligned", async () => {
    const manifest = parseAppPackageManifest(rawAppPackageManifest);

    expect(tasksSchemaSource).toEqual(rawSourceSchema);
    expect(parseAppSchema(tasksSchemaSource)).toEqual(parseAppSchema(rawSourceSchema));
    expect(manifest.sourceSchema).toEqual({
      kind: "bundled",
      key: "tasks",
      path: "schema.json",
    });
    expect(await computeSourceSchemaHash(tasksSchemaSource)).toBe(manifest.sourceSchemaHash);
  });
});
