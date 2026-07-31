import { defineAppSchemaModule } from "@dpeek/formless-schema";
import { describe, expect, it } from "vite-plus/test";
import {
  FORMLESS_PROGRAM_ARTIFACT_KIND,
  FORMLESS_PROGRAM_ARTIFACT_VERSION,
  formatFormlessProgramArtifact,
  formlessProgramBuiltInModules,
  formlessProgramDefaultComposition,
  formlessProgramSchemaModules,
  materializeFormlessProgramArtifact,
  parseFormlessProgramArtifact,
} from "@dpeek/formless/program";
import { formlessProgramSourceSchema } from "./schema.ts";
import { FORMLESS_PROGRAM_SOURCE_SCHEMA_HASH } from "./target.ts";

describe("workspace Program artifact", () => {
  it("materializes the default composition with canonical source provenance", async () => {
    const artifact = await materializeFormlessProgramArtifact(formlessProgramDefaultComposition);

    expect(artifact).toEqual({
      kind: FORMLESS_PROGRAM_ARTIFACT_KIND,
      version: FORMLESS_PROGRAM_ARTIFACT_VERSION,
      sourceSchema: formlessProgramSourceSchema,
      schemaProvenance: {
        kind: "program",
        sourceSchemaHash: FORMLESS_PROGRAM_SOURCE_SCHEMA_HASH,
      },
    });
    await expect(
      parseFormlessProgramArtifact(JSON.parse(formatFormlessProgramArtifact(artifact))),
    ).resolves.toEqual(artifact);
  });

  it("extends the explicit built-in surface without retaining authoring identity", async () => {
    const workspaceRecords = defineAppSchemaModule({
      key: "verification-records",
      entities: [
        {
          id: "entity_d0501a6e-4992-46dc-9f76-c67b362dd3bd",
          key: "verification",
          label: "Verification",
          fields: [{ key: "reference", type: "text", required: true }],
        },
      ],
    });
    const composition = {
      ...formlessProgramDefaultComposition,
      modules: [...formlessProgramSchemaModules, workspaceRecords],
    };
    const first = await materializeFormlessProgramArtifact(composition);
    const second = await materializeFormlessProgramArtifact(composition);
    const artifactText = formatFormlessProgramArtifact(first);

    expect(first).toEqual(second);
    expect(first.sourceSchema.entities.at(-1)).toMatchObject({
      id: "entity_d0501a6e-4992-46dc-9f76-c67b362dd3bd",
      key: "verification",
    });
    expect(artifactText).not.toContain("verification-records");
    expect(artifactText).not.toContain('"requires"');
  });

  it("uses omission for deliberate replacement and rejects duplicate module keys", async () => {
    const replacement = defineAppSchemaModule({
      ...formlessProgramBuiltInModules.tasksPresentation,
      screens: formlessProgramBuiltInModules.tasksPresentation.screens.map((screen) => ({
        ...screen,
        path: "/work",
      })),
    });
    const replacedModules = formlessProgramSchemaModules.map((module) =>
      module.key === replacement.key ? replacement : module,
    );
    const artifact = await materializeFormlessProgramArtifact({
      ...formlessProgramDefaultComposition,
      modules: replacedModules,
      navigation: {
        ...formlessProgramDefaultComposition.navigation,
        primaryScreens: [...(formlessProgramDefaultComposition.navigation?.primaryScreens ?? [])],
      },
    });

    expect(artifact.sourceSchema.screens.find((screen) => screen.key === "taskHome")?.path).toBe(
      "/work",
    );
    await expect(
      materializeFormlessProgramArtifact({
        ...formlessProgramDefaultComposition,
        modules: [...formlessProgramSchemaModules, replacement],
      }),
    ).rejects.toThrow('Schema module key "tasks-presentation" is listed more than once.');
  });

  it("rejects artifacts whose schema no longer matches provenance", async () => {
    const artifact = await materializeFormlessProgramArtifact(formlessProgramDefaultComposition);
    const changed = {
      ...artifact,
      sourceSchema: {
        ...artifact.sourceSchema,
        navigation: {
          primaryScreens: [...(artifact.sourceSchema.navigation?.primaryScreens ?? [])].reverse(),
        },
      },
    };

    await expect(parseFormlessProgramArtifact(changed)).rejects.toThrow("does not match");
  });
});
