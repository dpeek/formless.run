import { defineAppSchemaModule } from "@dpeek/formless-schema";
import { describe, expect, it } from "vite-plus/test";
import {
  FORMLESS_PROGRAM_ARTIFACT_KIND,
  FORMLESS_PROGRAM_ARTIFACT_VERSION,
  formatFormlessProgramArtifact,
  materializeFormlessProgramArtifact,
  parseFormlessProgramArtifact,
} from "@dpeek/formless/program";
import {
  formlessProgramBuiltInModules,
  formlessProgramDefaultComposition,
  formlessProgramDefaultRuntimeComposition,
  formlessProgramSchemaModules,
} from "@dpeek/formless/program/default";
import { formlessProgramSourceSchema } from "./schema.ts";
import { FORMLESS_PROGRAM_SOURCE_SCHEMA_HASH } from "./target.ts";
import type { ProgramRuntimeComposition } from "./composition.ts";

describe("workspace Program artifact", () => {
  it("materializes the default composition with canonical source provenance", async () => {
    const artifact = await materializeFormlessProgramArtifact(formlessProgramDefaultComposition, {
      runtime: formlessProgramDefaultRuntimeComposition,
    });

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
    const first = await materializeFormlessProgramArtifact(composition, {
      runtime: formlessProgramDefaultRuntimeComposition,
    });
    const second = await materializeFormlessProgramArtifact(composition, {
      runtime: formlessProgramDefaultRuntimeComposition,
    });
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
    const artifact = await materializeFormlessProgramArtifact(
      {
        ...formlessProgramDefaultComposition,
        modules: replacedModules,
        navigation: {
          groups: (formlessProgramDefaultComposition.navigation?.groups ?? []).map((group) => ({
            ...group,
            screens: [...group.screens],
          })),
        },
      },
      { runtime: formlessProgramDefaultRuntimeComposition },
    );

    expect(artifact.sourceSchema.screens.find((screen) => screen.key === "taskHome")?.path).toBe(
      "/work",
    );
    await expect(
      materializeFormlessProgramArtifact(
        {
          ...formlessProgramDefaultComposition,
          modules: [...formlessProgramSchemaModules, replacement],
        },
        { runtime: formlessProgramDefaultRuntimeComposition },
      ),
    ).rejects.toThrow('Schema module key "tasks-presentation" is listed more than once.');
  });

  it("materializes same-key product screen replacements by presentation kind", async () => {
    const routesReplacement = defineAppSchemaModule({
      ...formlessProgramBuiltInModules.instanceControlPlaneRoutesScreen,
      screens: formlessProgramBuiltInModules.instanceControlPlaneRoutesScreen.screens.map(
        (screen) => ({
          ...screen,
          path: "/infrastructure/routes",
          access: { role: "administrator" },
        }),
      ),
    });
    const accessReplacement = defineAppSchemaModule({
      ...formlessProgramBuiltInModules.identityControlPlaneAccessScreen,
      screens: formlessProgramBuiltInModules.identityControlPlaneAccessScreen.screens.map(
        (screen) => ({
          ...screen,
          path: "/people/access",
          access: { role: "administrator" },
        }),
      ),
    });
    const artifact = await materializeFormlessProgramArtifact(
      {
        ...formlessProgramDefaultComposition,
        modules: formlessProgramSchemaModules.map((module) =>
          module.key === routesReplacement.key
            ? routesReplacement
            : module.key === accessReplacement.key
              ? accessReplacement
              : module,
        ),
      },
      { runtime: formlessProgramDefaultRuntimeComposition },
    );
    const screens = new Map(artifact.sourceSchema.screens.map((screen) => [screen.key, screen]));
    const viewKeys = new Set(artifact.sourceSchema.views.map(({ key }) => key));
    const routes = screens.get("routes");
    const access = screens.get("access");

    expect(routes).toMatchObject({
      key: "routes",
      path: "/infrastructure/routes",
      access: { role: "administrator" },
    });
    expect(access).toMatchObject({
      key: "access",
      type: "runtime",
      path: "/people/access",
      access: { role: "administrator" },
    });
    expect(
      routes?.type === "workspace"
        ? routes.layout.sections.every(({ view }) => viewKeys.has(view))
        : false,
    ).toBe(true);
    expect(access === undefined || "layout" in access).toBe(false);
    await expect(parseFormlessProgramArtifact(artifact)).resolves.toEqual(artifact);
  });

  it("rejects artifacts whose schema no longer matches provenance", async () => {
    const artifact = await materializeFormlessProgramArtifact(formlessProgramDefaultComposition, {
      runtime: formlessProgramDefaultRuntimeComposition,
    });
    const changed = {
      ...artifact,
      sourceSchema: {
        ...artifact.sourceSchema,
        navigation: {
          groups: [...(artifact.sourceSchema.navigation?.groups ?? [])].reverse(),
        },
      },
    };

    await expect(parseFormlessProgramArtifact(changed)).rejects.toThrow("does not match");
  });

  it("keeps executable composition outside canonical Program provenance", async () => {
    const selected = formlessProgramDefaultRuntimeComposition.shared.recordAdapters[0]!;
    const alternateRuntime = {
      ...formlessProgramDefaultRuntimeComposition,
      shared: {
        ...formlessProgramDefaultRuntimeComposition.shared,
        recordAdapters: [
          {
            ...selected,
            adapter: {
              canonicalize: selected.adapter.canonicalize.bind(selected.adapter),
              validate: selected.adapter.validate.bind(selected.adapter),
              validateCandidate: selected.adapter.validateCandidate.bind(selected.adapter),
            },
          },
          ...formlessProgramDefaultRuntimeComposition.shared.recordAdapters.slice(1),
        ],
      },
    } satisfies ProgramRuntimeComposition;
    const baseline = await materializeFormlessProgramArtifact(formlessProgramDefaultComposition, {
      runtime: formlessProgramDefaultRuntimeComposition,
    });
    const alternate = await materializeFormlessProgramArtifact(formlessProgramDefaultComposition, {
      runtime: alternateRuntime,
    });
    const contents = formatFormlessProgramArtifact(alternate);

    expect(alternate).toEqual(baseline);
    expect(alternate.schemaProvenance.sourceSchemaHash).toBe(FORMLESS_PROGRAM_SOURCE_SCHEMA_HASH);
    expect(contents).not.toContain(selected.key);
  });
});
