import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  DEFAULT_INSTANCE_WORKSPACE_MEDIA_ROOT,
  DEFAULT_INSTANCE_WORKSPACE_SECRET_STATE_ROOT,
} from "@dpeek/formless-workspace";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  discoverFormlessInstanceWorkspaceRoot,
  formatFormlessConfigModule,
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
});

async function makeTempDir(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "formless-config-test-"));

  tempDirs.push(root);
  return root;
}
