import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { WORKSPACE_GATEWAY_ENABLED_ENV } from "@dpeek/formless-gateway";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  FORMLESS_PROGRAM_ARTIFACT_DEFINE_NAME,
  FORMLESS_PROGRAM_ARTIFACT_PATH_ENV_NAME,
  formatFormlessProgramArtifact,
  materializeFormlessProgramArtifact,
} from "../program/artifact.ts";
import { formlessProgramDefaultComposition } from "../program/schema.ts";
import { formlessProgramDefaultRuntimeComposition } from "../program/default.ts";
import { FORMLESS_WORKSPACE_PROGRAM_RUNTIME_ENV_NAME } from "../cli/program-runtime-bundler.ts";
import {
  FORMLESS_CLIENT_ASSET_MANIFEST_FILE,
  FORMLESS_IMMUTABLE_CLIENT_ASSET_DIRECTORY,
  formlessCloudflareWorkerDependencyOptimizationPlugin,
  runtimeCloudflarePluginConfig,
  runtimeViteConfig,
  runtimeWorkerConfigPath,
} from "../runtime/vite-config.ts";

const repoRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));

type ViteConfigBuild = {
  assetsDir?: unknown;
  manifest?: unknown;
  rollupOptions?: {
    input?: unknown;
  };
};

type ViteConfigWithEnvironments = {
  build?: unknown;
  define?: Record<string, string>;
  environments?: {
    client?: {
      build?: ViteConfigBuild;
    };
  };
  plugins?: unknown[];
  resolve?: {
    alias?: Record<string, string>;
  };
};
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

type WorkerConfigCustomizer = (config: { vars?: Record<string, string> }) => {
  vars?: Record<string, string>;
} | void;
describe("Runtime Vite config", () => {
  it("scopes client-only HTML entries to the client environment", () => {
    const config = runtimeViteConfig() as ViteConfigWithEnvironments;
    const clientBuild = config.environments?.client?.build;

    expect(config.build).toBeUndefined();
    expect(clientBuild?.assetsDir).toBe(FORMLESS_IMMUTABLE_CLIENT_ASSET_DIRECTORY);
    expect(clientBuild?.manifest).toBe(FORMLESS_CLIENT_ASSET_MANIFEST_FILE);
    expect(clientBuild?.rollupOptions?.input).toEqual({
      app: resolve(repoRoot, "index.html"),
      "public-site": resolve(repoRoot, "src/public-site-main.tsx"),
    });
  });

  it("orders Formless StyleX compilation before React and Cloudflare", () => {
    const developmentConfig = runtimeViteConfig({
      env: { NODE_ENV: "development" },
      packageRoot: repoRoot,
    }) as ViteConfigWithEnvironments;
    const productionConfig = runtimeViteConfig({
      env: { NODE_ENV: "production" },
      packageRoot: repoRoot,
    }) as ViteConfigWithEnvironments;
    const developmentPlugins = namedPlugins(developmentConfig.plugins);
    const productionPlugins = namedPlugins(productionConfig.plugins);

    expect(developmentPlugins).toEqual(productionPlugins);
    expect(developmentPlugins).toEqual(
      expect.arrayContaining([
        "formless-workspace-program-runtime",
        "formless-workspace-runtime-extensions",
        "formless-client-asset-headers",
        "formless-stylex-layer-order",
        "@stylexjs/unplugin",
        "vite:react-babel",
        "vite:react-refresh",
        "vite-plugin-cloudflare",
      ]),
    );
    expect(developmentPlugins.indexOf("@stylexjs/unplugin")).toBeLessThan(
      developmentPlugins.indexOf("vite:react-babel"),
    );
    expect(developmentPlugins.indexOf("@stylexjs/unplugin")).toBeLessThan(
      developmentPlugins.indexOf("vite-plugin-cloudflare"),
    );
  });

  it("emits the public Site browser input only for a selected Site browser surface", () => {
    const config = runtimeViteConfig({
      env: {
        NODE_ENV: "test",
        VITEST: "true",
        [FORMLESS_WORKSPACE_PROGRAM_RUNTIME_ENV_NAME]: JSON.stringify({
          browserPublicSite: false,
          composition: {
            shared: "runtime/shared.ts",
            browser: "runtime/browser.ts",
            worker: "runtime/worker.ts",
          },
        }),
      },
      packageRoot: repoRoot,
      workspaceRoot: repoRoot,
    }) as ViteConfigWithEnvironments;

    expect(config.environments?.client?.build?.rollupOptions?.input).toEqual({
      app: resolve(repoRoot, "index.html"),
    });
  });

  it("shims StyleX without starting its Vite server integration in unit tests", () => {
    const testConfig = runtimeViteConfig({
      env: { NODE_ENV: "test", VITEST: "true" },
      packageRoot: repoRoot,
    }) as ViteConfigWithEnvironments;
    const productionBuildTestConfig = runtimeViteConfig({
      env: { NODE_ENV: "production", VITEST: "true" },
      packageRoot: repoRoot,
    }) as ViteConfigWithEnvironments;

    expect(namedPlugins(testConfig.plugins)).not.toContain("astryx-config");
    expect(namedPlugins(testConfig.plugins)).not.toContain("formless-stylex-layer-order");
    expect(namedPlugins(testConfig.plugins)).not.toContain("@stylexjs/unplugin");
    expect(testConfig.resolve?.alias).toEqual({
      "@stylexjs/stylex": resolve(repoRoot, "src/test/stylex.ts"),
    });
    expect(namedPlugins(productionBuildTestConfig.plugins)).toContain("@stylexjs/unplugin");
    expect(productionBuildTestConfig.resolve?.alias).toBeUndefined();
  });

  it("prebundles CommonJS React entrypoints for Cloudflare Worker development", async () => {
    const plugin = formlessCloudflareWorkerDependencyOptimizationPlugin();
    const configEnvironment = plugin.configEnvironment;

    if (typeof configEnvironment !== "function") {
      throw new Error("Expected Cloudflare Worker dependency optimization config.");
    }

    expect(
      await configEnvironment.call(
        {} as never,
        "client",
        {},
        {
          command: "serve",
          isSsrTargetWebworker: false,
          mode: "development",
        },
      ),
    ).toBeUndefined();
    expect(
      await configEnvironment.call(
        {} as never,
        "formless",
        {},
        {
          command: "serve",
          isSsrTargetWebworker: true,
          mode: "development",
        },
      ),
    ).toEqual({
      optimizeDeps: {
        include: ["react", "react/jsx-dev-runtime", "react/jsx-runtime"],
      },
    });
  });

  it("uses the Worker-owned Wrangler config and preserves runtime Cloudflare overrides", () => {
    const persistPath = resolve(repoRoot, "tmp/wrangler-state");
    const pluginConfig = runtimeCloudflarePluginConfig({
      env: {
        FORMLESS_ADMIN_TOKEN: "secret",
        FORMLESS_RUNTIME_PROFILE: "instance",
        [WORKSPACE_GATEWAY_ENABLED_ENV]: "1",
        FORMLESS_WRANGLER_PERSIST: persistPath,
      },
      packageRoot: repoRoot,
    });

    expect(runtimeWorkerConfigPath(repoRoot)).toBe(resolve(repoRoot, "src/worker/wrangler.jsonc"));
    expect(pluginConfig.configPath).toBe(resolve(repoRoot, "src/worker/wrangler.jsonc"));
    expect(pluginConfig.persistState).toEqual({ path: persistPath });
    expect(typeof pluginConfig.config).toBe("function");

    const configCustomizer = pluginConfig.config;
    if (typeof configCustomizer !== "function") {
      throw new Error("Expected runtime Cloudflare config customizer.");
    }

    expect((configCustomizer as WorkerConfigCustomizer)({ vars: { EXISTING: "1" } })).toEqual({
      vars: {
        EXISTING: "1",
        FORMLESS_ADMIN_TOKEN: "secret",
        FORMLESS_RUNTIME_PROFILE: "instance",
        [WORKSPACE_GATEWAY_ENABLED_ENV]: "1",
      },
    });
  });

  it("injects the same materialized Program into browser and Worker compilation", async () => {
    const tempRoot = await mkdtemp(resolve(tmpdir(), "formless-program-vite-"));
    const artifactPath = resolve(tempRoot, "formless-program.json");
    const contents = formatFormlessProgramArtifact(
      await materializeFormlessProgramArtifact(formlessProgramDefaultComposition, {
        runtime: formlessProgramDefaultRuntimeComposition,
      }),
    );

    tempDirs.push(tempRoot);
    await writeFile(artifactPath, contents);

    const config = runtimeViteConfig({
      env: {
        NODE_ENV: "test",
        VITEST: "true",
        [FORMLESS_PROGRAM_ARTIFACT_PATH_ENV_NAME]: artifactPath,
      },
      packageRoot: repoRoot,
    }) as ViteConfigWithEnvironments;

    expect(config.define?.[FORMLESS_PROGRAM_ARTIFACT_DEFINE_NAME]).toBe(JSON.stringify(contents));
  });
});

function namedPlugins(plugins: unknown[] | undefined): string[] {
  return (plugins ?? [])
    .flat(Infinity)
    .map((plugin) =>
      typeof plugin === "object" && plugin !== null && "name" in plugin ? plugin.name : undefined,
    )
    .filter((name): name is string => typeof name === "string");
}
