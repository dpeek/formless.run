import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  DEFAULT_INSTANCE_WORKSPACE_MEDIA_ROOT,
  DEFAULT_INSTANCE_WORKSPACE_SECRET_STATE_ROOT,
} from "@dpeek/formless-workspace";
import { defineAppSchemaModule } from "@dpeek/formless-schema";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  FORMLESS_PROGRAM_ARTIFACT_FILE,
  parseFormlessProgramArtifact,
} from "../program/artifact.ts";
import {
  discoverFormlessInstanceWorkspaceRoot,
  formatFormlessConfigModule,
  materializeActiveWorkspaceProgramArtifact,
  readWorkspaceConfig,
} from "./instance-workspace-foundation.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("TypeScript workspace configuration", () => {
  it("loads project-local TypeScript imports and resolves adjacent defaults", async () => {
    const workspaceRoot = await makeTempDir();

    await writeFile(
      path.join(workspaceRoot, "workspace-values.ts"),
      [
        'export const workspaceName = "imported-workspace";',
        'export const stateRoot = "records";',
        "",
      ].join("\n"),
    );
    await writeFile(
      path.join(workspaceRoot, "formless.ts"),
      [
        `import { stateRoot, workspaceName } from ${JSON.stringify("./workspace-values.ts")};`,
        "",
        "export default {",
        "  name: workspaceName,",
        "  state: { root: stateRoot },",
        '  local: { stateRoot: ".cache/formless" },',
        "};",
        "",
      ].join("\n"),
    );

    await expect(readWorkspaceConfig(workspaceRoot)).resolves.toMatchObject({
      config: {
        name: "imported-workspace",
        state: { root: "records" },
        media: { root: DEFAULT_INSTANCE_WORKSPACE_MEDIA_ROOT },
        local: {
          stateRoot: ".cache/formless",
          secretStateRoot: DEFAULT_INSTANCE_WORKSPACE_SECRET_STATE_ROOT,
        },
      },
      configPath: path.join(workspaceRoot, "formless.ts"),
    });
  });

  it("discovers only the nearest exact entrypoint and formats explicit-name bootstrap", async () => {
    const workspaceRoot = await makeTempDir();
    const nestedRoot = path.join(workspaceRoot, "packages/site");

    await mkdir(nestedRoot, { recursive: true });
    await writeFile(path.join(workspaceRoot, "formless.config.ts"), "export default {};\n");

    await expect(discoverFormlessInstanceWorkspaceRoot(nestedRoot)).rejects.toThrow(
      `Could not find formless.ts from ${nestedRoot}.`,
    );

    await writeFile(
      path.join(workspaceRoot, "formless.ts"),
      formatFormlessConfigModule({ name: "explicit-workspace" }),
    );

    await expect(discoverFormlessInstanceWorkspaceRoot(nestedRoot)).resolves.toEqual({
      configPath: path.join(workspaceRoot, "formless.ts"),
      workspaceRoot,
    });
    expect(formatFormlessConfigModule({ name: "explicit-workspace" })).toBe(
      [
        'import { defineConfig } from "@dpeek/formless";',
        "",
        "export default defineConfig({",
        '  name: "explicit-workspace",',
        "});",
        "",
      ].join("\n"),
    );
  });

  it("materializes trusted formless.ts Program composition as one data-only artifact", async () => {
    const workspaceRoot = await makeTempDir();
    const extension = defineAppSchemaModule({
      key: "workspace-verification-records",
      entities: [
        {
          id: "entity_d0501a6e-4992-46dc-9f76-c67b362dd3bd",
          key: "verification",
          label: "Verification",
          fields: [{ key: "reference", type: "text", required: true }],
        },
      ],
      queries: [
        {
          key: "verificationAll",
          label: "All verifications",
          entity: "verification",
          expression: { kind: "all" },
        },
      ],
      itemViews: [
        {
          key: "verificationItem",
          entity: "verification",
          fields: [{ field: "reference", editor: "text" }],
        },
      ],
      views: [
        {
          key: "verificationHome",
          type: "collection",
          label: "Verifications",
          entity: "verification",
          queries: [{ query: "verificationAll" }],
          defaultQuery: "verificationAll",
          result: { type: "list", itemView: "verificationItem" },
        },
      ],
      screens: [
        {
          key: "verificationHome",
          type: "workspace",
          label: "Verifications",
          path: "/verifications",
          access: { actor: "owner" },
          layout: {
            type: "stack",
            sections: [{ id: "verifications", type: "collection", view: "verificationHome" }],
          },
        },
      ],
    });
    await writeFile(
      path.join(workspaceRoot, "program.ts"),
      `export const extension = ${JSON.stringify(extension, null, 2)} as const;\n`,
    );
    await writeFile(
      path.join(workspaceRoot, "formless.ts"),
      [
        `import { extension } from ${JSON.stringify("./program.ts")};`,
        "",
        "export default {",
        '  name: "workspace-program",',
        "  program: {",
        "    version: 1,",
        "    modules: [extension],",
        '    runtime: { owner: "runtime" },',
        "  },",
        "  runtime: {",
        "    composition: {",
        '      shared: "runtime/shared.ts",',
        '      browser: "runtime/browser.ts",',
        '      worker: "runtime/worker.ts",',
        "    },",
        "  },",
        "};",
        "",
      ].join("\n"),
    );
    await mkdir(path.join(workspaceRoot, "runtime"), { recursive: true });
    await Promise.all([
      writeFile(
        path.join(workspaceRoot, "runtime/shared.ts"),
        'export default { target: "shared", recordAdapters: [], operationAdapters: [], bootstrapContributions: [], createIdContributions: [] };\n',
      ),
      writeFile(
        path.join(workspaceRoot, "runtime/browser.ts"),
        'export default { target: "browser", projections: [], surfaces: [], mounts: [] };\n',
      ),
      writeFile(
        path.join(workspaceRoot, "runtime/worker.ts"),
        'export default { target: "worker", publicReads: [], surfaces: [], mounts: [], afterCommit: [] };\n',
      ),
    ]);

    const { config } = await readWorkspaceConfig(workspaceRoot);
    const active = await materializeActiveWorkspaceProgramArtifact(workspaceRoot, config);
    const parsed = await parseFormlessProgramArtifact(
      JSON.parse(await readFile(active.path, "utf8")) as unknown,
    );

    expect(active.path).toBe(
      path.join(workspaceRoot, ".formless/local", FORMLESS_PROGRAM_ARTIFACT_FILE),
    );
    expect(parsed).toEqual(active.artifact);
    expect(parsed.sourceSchema.entities.at(-1)).toMatchObject({
      id: "entity_d0501a6e-4992-46dc-9f76-c67b362dd3bd",
      key: "verification",
    });
    expect(active.contents).not.toContain("workspace-verification-records");
  });
});

async function makeTempDir(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "formless-config-test-"));

  tempDirs.push(root);
  return root;
}
