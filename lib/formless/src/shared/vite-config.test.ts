import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  FORMLESS_PROGRAM_ARTIFACT_DEFINE_NAME,
  FORMLESS_PROGRAM_ARTIFACT_PATH_ENV_NAME,
  formatFormlessProgramArtifact,
  materializeFormlessProgramArtifact,
} from "../program/artifact.ts";
import { formlessProgramDefaultComposition } from "../program/schema.ts";
import {
  astryxCloudflareWorkerSourceCompilationPlugin,
  runtimeCloudflarePluginConfig,
  runtimeViteConfig,
  runtimeWorkerConfigPath,
} from "../runtime/vite-config.ts";

const repoRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));

type ViteConfigBuild = {
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
    expect(clientBuild?.manifest).toBe("assets/formless-client-manifest.json");
    expect(clientBuild?.rollupOptions?.input).toEqual({
      app: resolve(repoRoot, "index.html"),
      "public-site": resolve(repoRoot, "src/public-site-main.tsx"),
    });
  });

  it("orders the supported Astryx StyleX integration before React and Cloudflare", () => {
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
        "formless-workspace-runtime-extensions",
        "astryx-config",
        "astryx-css-layer-order",
        "@stylexjs/unplugin",
        "astryx-split-layers",
        "vite:react-babel",
        "vite:react-refresh",
        "vite-plugin-cloudflare",
        "formless-astryx-cloudflare-worker-source-compilation",
      ]),
    );
    expect(developmentPlugins.indexOf("@stylexjs/unplugin")).toBeLessThan(
      developmentPlugins.indexOf("vite:react-babel"),
    );
    expect(developmentPlugins.indexOf("@stylexjs/unplugin")).toBeLessThan(
      developmentPlugins.indexOf("vite-plugin-cloudflare"),
    );
    expect(developmentPlugins.indexOf("vite-plugin-cloudflare")).toBeLessThan(
      developmentPlugins.indexOf("formless-astryx-cloudflare-worker-source-compilation"),
    );
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
    expect(namedPlugins(testConfig.plugins)).not.toContain("@stylexjs/unplugin");
    expect(namedPlugins(testConfig.plugins)).not.toContain("astryx-split-layers");
    expect(testConfig.resolve?.alias).toEqual({
      "@stylexjs/stylex": resolve(repoRoot, "src/test/stylex.ts"),
    });
    expect(namedPlugins(productionBuildTestConfig.plugins)).toContain("@stylexjs/unplugin");
    expect(productionBuildTestConfig.resolve?.alias).toBeUndefined();
  });

  it("keeps Astryx source out of Cloudflare Worker dependency optimization", async () => {
    const plugin = astryxCloudflareWorkerSourceCompilationPlugin();
    const configEnvironment = plugin.configEnvironment;

    if (typeof configEnvironment !== "function") {
      throw new Error("Expected Astryx Cloudflare Worker environment config.");
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
        exclude: ["@astryxdesign/core", "@astryxdesign/theme-neutral"],
        include: ["react/jsx-runtime"],
      },
    });
  });

  it("uses the Worker-owned Wrangler config and preserves runtime Cloudflare overrides", () => {
    const persistPath = resolve(repoRoot, "tmp/wrangler-state");
    const pluginConfig = runtimeCloudflarePluginConfig({
      env: {
        FORMLESS_ADMIN_TOKEN: "secret",
        FORMLESS_RUNTIME_PROFILE: "instance",
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
      },
    });
  });

  it("injects the same materialized Program into browser and Worker compilation", async () => {
    const tempRoot = await mkdtemp(resolve(tmpdir(), "formless-program-vite-"));
    const artifactPath = resolve(tempRoot, "formless-program.json");
    const contents = formatFormlessProgramArtifact(
      await materializeFormlessProgramArtifact(formlessProgramDefaultComposition),
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
