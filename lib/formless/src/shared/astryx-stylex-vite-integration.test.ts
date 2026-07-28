import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build, type PluginOption } from "vite-plus";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  runtimeViteConfig,
  SITE_PUBLIC_RENDERER_BROWSER_VIRTUAL_MODULE_ID,
} from "../runtime/vite-config.ts";
import {
  FORMLESS_SITE_PROJECT_ROOT_ENV_NAME,
  FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME,
  SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY,
} from "./workspace-runtime-extensions.ts";

const packageRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const repoRoot = resolve(packageRoot, "../..");
const applicationEntry = resolve(packageRoot, "src/main.tsx");
const publicSiteEntry = resolve(packageRoot, "src/public-site-main.tsx");
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

type BuildAsset = {
  fileName: string;
  source: string | Uint8Array;
  type: "asset";
};

type BuildChunk = {
  code: string;
  facadeModuleId: string | null;
  fileName: string;
  imports: string[];
  isEntry: boolean;
  modules: Record<string, unknown>;
  type: "chunk";
};

type BuildOutput = {
  output: Array<BuildAsset | BuildChunk>;
};

type ManifestChunk = {
  css?: string[];
  file: string;
  imports?: string[];
  isEntry?: boolean;
};

describe("Formless Renderer Astryx StyleX root build integration", () => {
  it("emits the selected production application and public entries with isolated Renderer graphs", async () => {
    const runtimeConfig = runtimeViteConfig({
      env: { NODE_ENV: "production", VITEST: "true" },
      packageRoot,
      workspaceRoot: repoRoot,
    }) as {
      plugins?: PluginOption[];
    };
    const result = await build({
      build: {
        cssCodeSplit: true,
        manifest: "assets/formless-client-manifest.json",
        minify: false,
        rollupOptions: {
          input: {
            application: applicationEntry,
            "public-site": publicSiteEntry,
          },
        },
        write: false,
      },
      configFile: false,
      plugins: runtimeConfig.plugins ?? [],
      root: packageRoot,
    });
    const outputs = buildOutputs(result);
    const items = outputs.flatMap(({ output }) => output);
    const chunks = items.filter((item): item is BuildChunk => item.type === "chunk");
    const assets = items.filter((item): item is BuildAsset => item.type === "asset");
    const applicationEntryChunk = requiredEntryChunk(chunks, applicationEntry);
    const publicSiteEntryChunk = requiredEntryChunk(chunks, publicSiteEntry);
    const applicationModules = reachableModules(applicationEntryChunk, chunks);
    const publicSiteModules = reachableModules(publicSiteEntryChunk, chunks);
    const manifest = emittedManifest(assets);
    const applicationManifestEntry = requiredManifestEntry(
      manifest,
      applicationEntryChunk.fileName,
    );
    const publicSiteManifestEntry = requiredManifestEntry(manifest, publicSiteEntryChunk.fileName);
    const applicationCss = manifestCss(applicationManifestEntry, manifest);
    const publicSiteCss = manifestCss(publicSiteManifestEntry, manifest);
    const cssAssets = new Map(
      assets
        .filter(({ fileName }) => fileName.endsWith(".css"))
        .map((asset) => [asset.fileName, assetText(asset)]),
    );
    const emittedCss = [...cssAssets.values()].join("\n");
    const sharedCss = publicSiteCss.filter((fileName) => applicationCss.includes(fileName));
    const publicSiteCssText = cssText(publicSiteCss, cssAssets);
    const emittedJavaScript = chunks.map(({ code }) => code).join("\n");

    expect(applicationModules).toEqual(
      expect.arrayContaining([
        expect.stringContaining("src/main.tsx"),
        expect.stringContaining("src/app/application-renderer-root.tsx"),
        expect.stringContaining("lib/renderer/src/application-assembly.tsx"),
        expect.stringContaining("lib/renderer/src/components/shell.tsx"),
      ]),
    );
    expect(applicationModules).not.toEqual(
      expect.arrayContaining([expect.stringContaining("src/public-site-main.tsx")]),
    );
    expect(publicSiteModules).toEqual(
      expect.arrayContaining([
        expect.stringContaining("lib/renderer/src/components/site.tsx"),
        expect.stringContaining("lib/renderer/src/site-provider.tsx"),
      ]),
    );
    expect(publicSiteModules).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("lib/renderer/src/application-assembly.tsx"),
        expect.stringContaining("src/app/"),
      ]),
    );
    expect(applicationCss.length).toBeGreaterThan(0);
    expect(publicSiteCss.length).toBeGreaterThan(0);
    expect(sharedCss.length).toBeGreaterThan(0);
    expect(publicSiteCssText).toMatch(/min-height:\s*260px/);
    expect(publicSiteCssText).toContain("@layer priority");
    expect(emittedCss).toContain("@layer");
    expect(emittedCss).toMatch(/\.astryx[a-z0-9]+/);
    expect(emittedCss).toMatch(/\.x[a-z0-9]+/);
    expect(emittedCss).not.toContain("stylex.create");
    expect(emittedJavaScript).not.toContain("createTheme");
  }, 30000);
  it("shares React with a hook-using browser renderer from an external workspace", async () => {
    const workspaceRoot = await makeExternalRendererWorkspace();
    const rendererEntrypoint = "renderers/site-public.browser.js";
    const runtimeConfig = runtimeViteConfig({
      env: {
        NODE_ENV: "production",
        VITEST: "true",
        [FORMLESS_SITE_PROJECT_ROOT_ENV_NAME]: workspaceRoot,
        [FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME]: JSON.stringify({
          [SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY]: {
            browser: rendererEntrypoint,
            worker: rendererEntrypoint,
          },
        }),
      },
      packageRoot,
      workspaceRoot: repoRoot,
    }) as {
      plugins?: PluginOption[];
      resolve?: Record<string, unknown>;
    };
    const testEntryId = "virtual:formless-react-singleton-test-entry";
    const resolvedTestEntryId = `\0${testEntryId}`;
    const result = await build({
      build: {
        minify: false,
        rollupOptions: {
          input: testEntryId,
          preserveEntrySignatures: "strict",
          output: {
            format: "es",
          },
        },
        write: false,
      },
      configFile: false,
      plugins: [
        {
          name: "formless-react-singleton-test-entry",
          resolveId(id) {
            return id === testEntryId ? resolvedTestEntryId : undefined;
          },
          load(id) {
            if (id !== resolvedTestEntryId) {
              return;
            }

            return `import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { sitePublicRenderer } from ${JSON.stringify(SITE_PUBLIC_RENDERER_BROWSER_VIRTUAL_MODULE_ID)};

export function renderWorkspaceRenderer() {
  return renderToString(createElement(sitePublicRenderer));
}
`;
          },
        },
        ...(runtimeConfig.plugins ?? []),
      ],
      resolve: runtimeConfig.resolve,
      root: packageRoot,
    });
    const chunks = buildOutputs(result)
      .flatMap(({ output }) => output)
      .filter((item): item is BuildChunk => item.type === "chunk");
    const entryChunk = chunks.find(({ isEntry }) => isEntry);

    if (!entryChunk) {
      throw new Error("Missing React singleton integration entry chunk.");
    }

    const outputPath = join(workspaceRoot, "react-singleton-build.mjs");
    await writeFile(outputPath, entryChunk.code);
    const builtModule = (await import(`${pathToFileURL(outputPath).href}?build`)) as {
      renderWorkspaceRenderer: () => string;
    };
    expect(builtModule.renderWorkspaceRenderer()).toContain("shared React runtime");
  }, 30000);
});
async function makeExternalRendererWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "formless-react-singleton-"));
  const rendererDirectory = join(workspaceRoot, "renderers");
  const externalReactDirectory = join(workspaceRoot, "node_modules", "react");
  const sourceReactDirectory = dirname(createRequire(import.meta.url).resolve("react"));

  tempDirs.push(workspaceRoot);
  await mkdir(rendererDirectory, { recursive: true });
  await cp(sourceReactDirectory, externalReactDirectory, { recursive: true });
  await writeFile(
    join(rendererDirectory, "site-public.browser.js"),
    `import { createElement, useMemo } from "react";

export default function ExternalWorkspaceRenderer() {
  const label = useMemo(() => "shared React runtime", []);
  return createElement("p", null, label);
}
`,
  );

  return workspaceRoot;
}

function buildOutputs(value: unknown): BuildOutput[] {
  const outputs = Array.isArray(value) ? value : [value];

  if (
    outputs.some(
      (output) =>
        typeof output !== "object" ||
        output === null ||
        !("output" in output) ||
        !Array.isArray(output.output),
    )
  ) {
    throw new Error("Expected completed Vite build outputs.");
  }

  return outputs as BuildOutput[];
}

function requiredEntryChunk(chunks: readonly BuildChunk[], facadeModuleId: string): BuildChunk {
  const chunk = chunks.find((candidate) => candidate.facadeModuleId === facadeModuleId);

  if (!chunk) {
    throw new Error(`Missing build entry ${facadeModuleId}.`);
  }

  return chunk;
}

function reachableModules(entry: BuildChunk, chunks: readonly BuildChunk[]): string[] {
  const chunksByFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const modules = new Set<string>();
  const queue = [entry];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const chunk = queue.shift();

    if (!chunk || seen.has(chunk.fileName)) {
      continue;
    }

    seen.add(chunk.fileName);
    Object.keys(chunk.modules).forEach((moduleId) => modules.add(moduleId));
    chunk.imports.forEach((fileName) => {
      const importedChunk = chunksByFileName.get(fileName);

      if (importedChunk) {
        queue.push(importedChunk);
      }
    });
  }

  return [...modules].sort();
}

function emittedManifest(assets: readonly BuildAsset[]): Record<string, ManifestChunk> {
  const asset = assets.find(({ fileName }) => fileName === "assets/formless-client-manifest.json");

  if (!asset) {
    throw new Error("Missing emitted client manifest.");
  }

  return JSON.parse(assetText(asset)) as Record<string, ManifestChunk>;
}

function requiredManifestEntry(
  manifest: Record<string, ManifestChunk>,
  entryFileName: string,
): ManifestChunk {
  const entry = Object.values(manifest).find(
    (chunk) => chunk.isEntry && chunk.file === entryFileName,
  );

  if (!entry) {
    throw new Error(`Missing manifest entry for ${entryFileName}.`);
  }

  return entry;
}

function manifestCss(
  entry: ManifestChunk,
  manifest: Record<string, ManifestChunk>,
  seen: Set<string> = new Set(),
): string[] {
  const css = new Set(entry.css ?? []);

  for (const key of entry.imports ?? []) {
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    const imported = manifest[key];

    if (imported) {
      manifestCss(imported, manifest, seen).forEach((fileName) => css.add(fileName));
    }
  }

  return [...css].sort();
}

function assetText(asset: BuildAsset): string {
  return typeof asset.source === "string" ? asset.source : new TextDecoder().decode(asset.source);
}

function cssText(fileNames: readonly string[], assets: ReadonlyMap<string, string>): string {
  return fileNames.map((fileName) => assets.get(fileName) ?? "").join("\n");
}
