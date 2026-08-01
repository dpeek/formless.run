import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

import {
  PROGRAM_BROWSER_RUNTIME_VIRTUAL_MODULE_ID,
  PROGRAM_SHARED_RUNTIME_VIRTUAL_MODULE_ID,
  PROGRAM_WORKER_RUNTIME_VIRTUAL_MODULE_ID,
  programRuntimeVirtualModulesPlugin,
  resolveWorkspaceProgramRuntimeEntrypoints,
  runtimeWorkspaceProgramRuntimeEnvValue,
} from "./program-runtime-bundler.ts";
import {
  readWorkspaceConfig,
  resolveActiveWorkspaceProgram,
} from "./instance-workspace-foundation.ts";

const fixtureRoot = fileURLToPath(
  new URL("../test/workspace-runtime-composition/", import.meta.url),
);

describe("workspace Program runtime composition bundling", () => {
  it("loads and validates one workspace-owned shared, browser, and Worker composition", async () => {
    const { config } = await readWorkspaceConfig(fixtureRoot);
    const active = await resolveActiveWorkspaceProgram(fixtureRoot, config);
    const envValue = JSON.parse(
      runtimeWorkspaceProgramRuntimeEnvValue(config, active.runtimeComposition),
    ) as {
      browserPublicSite: boolean;
      composition: Record<string, string>;
    };

    expect(active.runtimeComposition.shared.recordAdapters.map(({ key }) => key)).toEqual([
      "workspace.record",
    ]);
    expect(active.runtimeComposition.browser.projections.map(({ key }) => key)).toEqual([
      "workspace.browser",
    ]);
    expect(active.runtimeComposition.worker.publicReads.map(({ key }) => key)).toEqual([
      "workspace.worker",
    ]);
    expect(envValue).toEqual({
      browserPublicSite: false,
      composition: {
        shared: "shared.ts",
        browser: "browser.ts",
        worker: "worker.ts",
      },
    });
  });

  it("emits target-specific static graphs and serves requests without the workspace config module", async () => {
    const { config } = await readWorkspaceConfig(fixtureRoot);
    const active = await resolveActiveWorkspaceProgram(fixtureRoot, config);
    const runtime = {
      browserPublicSite: false,
      composition: config.runtime.composition,
    };
    const browserBundle = await buildRuntimeFixture(
      `import { programSharedRuntime } from ${JSON.stringify(PROGRAM_SHARED_RUNTIME_VIRTUAL_MODULE_ID)};
import { programBrowserRuntime } from ${JSON.stringify(PROGRAM_BROWSER_RUNTIME_VIRTUAL_MODULE_ID)};
export const values = [programSharedRuntime.recordAdapters[0].bundleMarker, programBrowserRuntime.projections[0].project()];
`,
      runtime,
    );
    const workerBundle = await buildRuntimeFixture(
      `import { programSharedRuntime } from ${JSON.stringify(PROGRAM_SHARED_RUNTIME_VIRTUAL_MODULE_ID)};
import { programWorkerRuntime } from ${JSON.stringify(PROGRAM_WORKER_RUNTIME_VIRTUAL_MODULE_ID)};
export function handleRequest() { return [programSharedRuntime.recordAdapters[0].bundleMarker, programWorkerRuntime.publicReads[0].read()]; }
`,
      runtime,
    );
    const browserInputs = Object.keys(browserBundle.metafile.inputs);
    const workerInputs = Object.keys(workerBundle.metafile.inputs);

    expect(browserInputs.some((file) => file.endsWith("/shared-adapter.ts"))).toBe(true);
    expect(browserInputs.some((file) => file.endsWith("/browser-adapter.ts"))).toBe(true);
    expect(browserInputs.some((file) => file.endsWith("/worker-adapter.ts"))).toBe(false);
    expect(workerInputs.some((file) => file.endsWith("/shared-adapter.ts"))).toBe(true);
    expect(workerInputs.some((file) => file.endsWith("/worker-adapter.ts"))).toBe(true);
    expect(workerInputs.some((file) => file.endsWith("/browser-adapter.ts"))).toBe(false);
    expect(workerInputs.some((file) => file.endsWith("/formless.ts"))).toBe(false);

    const workerModule = (await import(
      `data:text/javascript;base64,${Buffer.from(workerBundle.output).toString("base64")}`
    )) as { handleRequest: () => string[] };

    expect(workerModule.handleRequest()).toEqual([
      "workspace-shared-adapter",
      "workspace-worker-adapter",
    ]);
    expect(active.runtimeComposition.worker.publicReads[0]?.key).toBe("workspace.worker");
  });

  it("rejects composition entrypoints that escape the workspace root", () => {
    expect(() =>
      resolveWorkspaceProgramRuntimeEntrypoints({
        composition: {
          shared: "../shared.ts",
          browser: "browser.ts",
          worker: "worker.ts",
        },
        workspaceRoot: fixtureRoot,
      }),
    ).toThrow('Program runtime composition entry "../shared.ts" escapes the workspace root.');
  });
});

async function buildRuntimeFixture(
  contents: string,
  runtime: {
    browserPublicSite: boolean;
    composition: { shared: string; browser: string; worker: string };
  },
) {
  const result = await build({
    bundle: true,
    format: "esm",
    logLevel: "silent",
    metafile: true,
    plugins: [
      programRuntimeVirtualModulesPlugin({
        resolveDir: path.resolve(fixtureRoot, "../../.."),
        runtime,
        workspaceRoot: fixtureRoot,
      }),
    ],
    stdin: { contents, resolveDir: fixtureRoot, sourcefile: "entry.ts" },
    write: false,
  });

  return {
    metafile: result.metafile,
    output: result.outputFiles[0]?.text ?? "",
  };
}
