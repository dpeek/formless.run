import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build as buildWorker } from "esbuild";
import { build, type Plugin, type PluginOption } from "vite-plus";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { Layout } from "@astryxdesign/core/Layout";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { formlessStylexWorkerBundlePlugin } from "../runtime/stylex-esbuild.ts";
import {
  FORMLESS_CLIENT_ASSET_HEADERS,
  FORMLESS_CLIENT_ASSET_MANIFEST_FILE,
  FORMLESS_IMMUTABLE_CLIENT_ASSET_DIRECTORY,
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
const applicationEntry = resolve(packageRoot, "index.html");
const publicSiteEntry = resolve(packageRoot, "src/public-site-main.tsx");
const stylexCollisionProbeEntry = resolve(packageRoot, "src/test/stylex-collision-probe.ts");
const stylexStateParityClientEntry = resolve(
  repoRoot,
  "lib/renderer/src/stylex-state-parity-client.tsx",
);
const stylexStateParityWorkerEntry = resolve(
  repoRoot,
  "lib/renderer/src/stylex-state-parity-worker.tsx",
);
const rendererGlobalCss = resolve(repoRoot, "lib/renderer/src/global.css");
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
        assetsDir: FORMLESS_IMMUTABLE_CLIENT_ASSET_DIRECTORY,
        cssCodeSplit: true,
        manifest: FORMLESS_CLIENT_ASSET_MANIFEST_FILE,
        minify: false,
        rollupOptions: {
          input: {
            app: applicationEntry,
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
    const headers = requiredAssetText(assets, "_headers");
    const sharedCss = publicSiteCss.filter((fileName) => applicationCss.includes(fileName));
    const publicSiteCssText = cssText(publicSiteCss, cssAssets);
    const emittedJavaScript = chunks.map(({ code }) => code).join("\n");
    const serverRenderedAstryxClasses = atomicClasses(
      renderToStaticMarkup(createElement(Layout, { content: "production SSR" })),
    );

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
    expect(applicationEntryChunk.fileName).toMatch(contentAddressedClientAssetPattern("js"));
    expect(publicSiteEntryChunk.fileName).toMatch(contentAddressedClientAssetPattern("js"));
    applicationCss.forEach((fileName) =>
      expect(fileName).toMatch(contentAddressedClientAssetPattern("css")),
    );
    publicSiteCss.forEach((fileName) =>
      expect(fileName).toMatch(contentAddressedClientAssetPattern("css")),
    );
    expect(headers).toBe(FORMLESS_CLIENT_ASSET_HEADERS);
    expect(sharedCss.length).toBeGreaterThan(0);
    expect(publicSiteCssText).toMatch(/min-height:\s*260px/);
    expect(publicSiteCssText).toContain("@layer product.priority");
    expect(emittedCss).toContain("@layer");
    expect(emittedCss).toMatch(/\.x[a-z0-9]+/);
    expect(emittedCss).not.toContain("stylex.create");
    expect(emittedJavaScript).not.toContain("createTheme");
    expect(serverRenderedAstryxClasses.length).toBeGreaterThan(0);
    serverRenderedAstryxClasses.forEach((className) =>
      expect(emittedCss).toContain(`.${className}`),
    );
  }, 30000);
  it("keeps equal Astryx and Formless declarations isolated across Vite and Worker builds", async () => {
    const runtimeConfig = runtimeViteConfig({
      env: { NODE_ENV: "production", VITEST: "true" },
      packageRoot,
      workspaceRoot: repoRoot,
    }) as {
      plugins?: PluginOption[];
      resolve?: Record<string, unknown>;
    };
    const viteEntryId = "virtual:formless-stylex-collision-probe.ts";
    const result = await build({
      build: {
        cssCodeSplit: true,
        cssMinify: false,
        minify: false,
        rollupOptions: {
          input: viteEntryId,
          preserveEntrySignatures: "strict",
        },
        write: false,
      },
      configFile: false,
      plugins: [stylexCollisionProbeViteEntryPlugin(viteEntryId), ...(runtimeConfig.plugins ?? [])],
      resolve: runtimeConfig.resolve,
      root: packageRoot,
    });
    const items = buildOutputs(result).flatMap(({ output }) => output);
    const viteEntryChunk = items.find(
      (item): item is BuildChunk => item.type === "chunk" && item.isEntry,
    );

    if (!viteEntryChunk) {
      throw new Error("Missing Vite StyleX collision probe entry chunk.");
    }

    const clientCss = items
      .filter((item): item is BuildAsset => item.type === "asset" && item.fileName.endsWith(".css"))
      .map(assetText)
      .join("\n");
    const viteProbe = await importBuiltProbe(viteEntryChunk.code, "vite");
    const workerOutputDirectory = await mkdtemp(join(tmpdir(), "formless-stylex-worker-probe-"));
    const workerScriptPath = join(workerOutputDirectory, "probe.mjs");

    tempDirs.push(workerOutputDirectory);
    await buildWorker({
      bundle: true,
      entryPoints: [stylexCollisionProbeEntry],
      format: "esm",
      metafile: true,
      nodePaths: [resolve(repoRoot, "node_modules")],
      outfile: workerScriptPath,
      platform: "node",
      plugins: [formlessStylexWorkerBundlePlugin(resolve(repoRoot, "lib/renderer"))],
    });

    const workerProbe = (await import(`${pathToFileURL(workerScriptPath).href}?probe`)) as {
      renderStylexCollisionProbe: () => string;
    };
    const workerCss = await readFile(join(workerOutputDirectory, "stylex.css"), "utf8");
    const viteClasses = atomicClasses(viteProbe.renderStylexCollisionProbe(), "fml");
    const workerClasses = atomicClasses(workerProbe.renderStylexCollisionProbe(), "fml");
    const viteProductClasses = declarationClassesInLayers(clientCss, "product.", "fml");
    const workerProductClasses = declarationClassesInLayers(workerCss, "product.", "fml");
    const astryxClasses = declarationClassesInLayers(clientCss, "astryx-base", "x");
    const viteProductClassNames = [
      ...new Set([...viteProductClasses.background, ...viteProductClasses.transform]),
    ].sort();
    const workerProductClassNames = [
      ...new Set([...workerProductClasses.background, ...workerProductClasses.transform]),
    ].sort();

    expect(viteClasses).toHaveLength(2);
    expect(workerClasses).toEqual(viteClasses);
    expect(viteProductClasses.background).toHaveLength(1);
    expect(viteProductClasses.transform).toHaveLength(1);
    expect(viteProductClassNames).toEqual(viteClasses);
    expect(workerProductClasses.background).toHaveLength(1);
    expect(workerProductClasses.transform).toHaveLength(1);
    expect(workerProductClassNames).toEqual(workerClasses);
    expect(astryxClasses.background.length).toBeGreaterThan(0);
    expect(astryxClasses.transform.length).toBeGreaterThan(0);
    expect(astryxClasses.background).not.toContain(viteProductClasses.background[0]);
    expect(astryxClasses.transform).not.toContain(viteProductClasses.transform[0]);
    workerClasses.forEach((className) => expect(clientCss).toContain(`.${className}`));
  }, 30000);
  it("keeps real Astryx state fixture SSR classes in production hydration CSS", async () => {
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
        cssMinify: false,
        minify: false,
        rollupOptions: {
          input: stylexStateParityClientEntry,
        },
        write: false,
      },
      configFile: false,
      plugins: runtimeConfig.plugins ?? [],
      root: packageRoot,
    });
    const items = buildOutputs(result).flatMap(({ output }) => output);
    const chunks = items.filter((item): item is BuildChunk => item.type === "chunk");
    const assets = items.filter((item): item is BuildAsset => item.type === "asset");
    const clientEntryChunk = requiredEntryChunk(chunks, stylexStateParityClientEntry);
    const clientModules = reachableModules(clientEntryChunk, chunks);
    const clientCss = assets
      .filter(({ fileName }) => fileName.endsWith(".css"))
      .map(assetText)
      .join("\n");
    const workerOutputDirectory = await mkdtemp(join(tmpdir(), "formless-stylex-state-parity-"));
    const workerScriptPath = join(workerOutputDirectory, "fixture.mjs");

    tempDirs.push(workerOutputDirectory);
    await buildWorker({
      bundle: true,
      entryPoints: [stylexStateParityWorkerEntry],
      format: "esm",
      nodePaths: [resolve(repoRoot, "node_modules")],
      outfile: workerScriptPath,
      platform: "node",
      plugins: [formlessStylexWorkerBundlePlugin(resolve(repoRoot, "lib/renderer"))],
    });

    const workerFixture = (await import(`${pathToFileURL(workerScriptPath).href}?fixture`)) as {
      renderStylexStateParityFixture: () => string;
    };
    const workerCss = await readFile(join(workerOutputDirectory, "stylex.css"), "utf8");
    const markup = workerFixture.renderStylexStateParityFixture();
    const serverAstryxClasses = atomicClasses(markup);
    const serverProductClasses = atomicClasses(markup, "fml");
    const interactiveButtonClasses = atomicClasses(
      startTagWithAttribute(markup, "aria-label", "Interactive state probe"),
    );
    const responsiveLayoutClasses = atomicClasses(
      startTagWithAttribute(markup, "aria-label", "Astryx responsive layout"),
    );

    expect(clientModules).toEqual(
      expect.arrayContaining([
        expect.stringContaining("lib/renderer/src/stylex-state-parity-client.tsx"),
        expect.stringContaining("lib/renderer/src/components/stylex-state-parity.tsx"),
      ]),
    );
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('aria-checked="true"');
    expect(markup).toContain('data-theme="light"');
    expect(serverAstryxClasses.length).toBeGreaterThan(0);
    expect(serverProductClasses.length).toBeGreaterThan(0);
    expect(hasClassStateRule(clientCss, interactiveButtonClasses, ":hover")).toBe(true);
    expect(hasClassStateRule(clientCss, interactiveButtonClasses, ":active")).toBe(true);
    expect(hasClassStateRule(clientCss, interactiveButtonClasses, ":focus-visible")).toBe(true);
    expect(hasClassMediaRule(clientCss, responsiveLayoutClasses, "(max-width: 480px)")).toBe(true);
    expect(clientCss).toContain('html[data-theme="light"]');
    expect(clientCss).toContain('html[data-theme="dark"]');
    [...serverAstryxClasses, ...serverProductClasses].forEach((className) =>
      expect(clientCss).toContain(`.${className}`),
    );
    serverProductClasses.forEach((className) => expect(workerCss).toContain(`.${className}`));
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

function stylexCollisionProbeViteEntryPlugin(entryId: string): Plugin {
  const resolvedEntryId = `\0${entryId}`;

  return {
    name: "formless-stylex-collision-probe-entry",
    resolveId(id) {
      return id === entryId ? resolvedEntryId : undefined;
    },
    load(id) {
      if (id !== resolvedEntryId) {
        return;
      }

      return `import ${JSON.stringify(rendererGlobalCss)};
export { renderStylexCollisionProbe } from ${JSON.stringify(stylexCollisionProbeEntry)};
`;
    },
  };
}

async function importBuiltProbe(
  code: string,
  compiler: string,
): Promise<{
  renderStylexCollisionProbe: () => string;
}> {
  const outputDirectory = await mkdtemp(join(tmpdir(), `formless-stylex-${compiler}-probe-`));
  const outputPath = join(outputDirectory, "probe.mjs");

  tempDirs.push(outputDirectory);
  await writeFile(outputPath, code);

  return (await import(`${pathToFileURL(outputPath).href}?probe`)) as {
    renderStylexCollisionProbe: () => string;
  };
}

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
  const asset = assets.find(({ fileName }) => fileName === FORMLESS_CLIENT_ASSET_MANIFEST_FILE);

  if (!asset) {
    throw new Error("Missing emitted client manifest.");
  }

  return JSON.parse(assetText(asset)) as Record<string, ManifestChunk>;
}

function requiredAssetText(assets: readonly BuildAsset[], fileName: string): string {
  const asset = assets.find((candidate) => candidate.fileName === fileName);

  if (!asset) {
    throw new Error(`Missing emitted asset ${fileName}.`);
  }

  return assetText(asset);
}

function contentAddressedClientAssetPattern(extension: "css" | "js"): RegExp {
  return new RegExp(
    `^${FORMLESS_IMMUTABLE_CLIENT_ASSET_DIRECTORY}/.+-[A-Za-z0-9_-]+\\.${extension}$`,
  );
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

function declarationClassesInLayers(
  css: string,
  layerNamePrefix: string,
  classNamePrefix: string,
): { background: string[]; transform: string[] } {
  const layerCss = cssLayerBlocks(css)
    .filter(({ name }) => name.startsWith(layerNamePrefix))
    .map(({ body }) => body)
    .join("\n");

  return {
    background: atomicClassesForDeclaration(
      layerCss,
      "background-color",
      "transparent",
      classNamePrefix,
    ),
    transform: atomicClassesForDeclaration(layerCss, "transform", "scale(1)", classNamePrefix),
  };
}

function cssLayerBlocks(css: string): Array<{ body: string; name: string }> {
  const blocks: Array<{ body: string; name: string }> = [];
  const layerStart = /@layer\s+([a-z0-9.-]+)\s*\{/gi;
  let match: RegExpExecArray | null;

  while ((match = layerStart.exec(css))) {
    const openBraceIndex = layerStart.lastIndex - 1;
    let depth = 1;
    let cursor = openBraceIndex + 1;

    while (cursor < css.length && depth > 0) {
      if (css[cursor] === "{") {
        depth += 1;
      } else if (css[cursor] === "}") {
        depth -= 1;
      }
      cursor += 1;
    }

    if (depth !== 0) {
      throw new Error(`Unclosed CSS layer ${match[1]}.`);
    }

    blocks.push({ body: css.slice(openBraceIndex + 1, cursor - 1), name: match[1] });
    layerStart.lastIndex = cursor;
  }

  return blocks;
}

function atomicClassesForDeclaration(
  css: string,
  property: string,
  value: string,
  classNamePrefix: string,
): string[] {
  const classNames = new Set<string>();
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  const declaration = normalizeCssDeclaration(`${property}:${value}`);
  let match: RegExpExecArray | null;

  while ((match = rule.exec(css))) {
    const declarations = match[2].split(";").map(normalizeCssDeclaration);

    if (!declarations.includes(declaration)) {
      continue;
    }

    const classPattern = new RegExp(`\\.(${classNamePrefix}[a-z0-9]+)(?![a-z0-9-])`, "g");
    let classMatch: RegExpExecArray | null;

    while ((classMatch = classPattern.exec(match[1]))) {
      classNames.add(classMatch[1]);
    }
  }

  return [...classNames].sort();
}

function normalizeCssDeclaration(declaration: string): string {
  return declaration.replace(/\s+/g, "").replace(/:#(?:0000|00000000)$/i, ":transparent");
}

function atomicClasses(markup: string, classNamePrefix = "x"): string[] {
  const classPattern = new RegExp(`^${classNamePrefix}[a-z0-9]+$`);

  return [
    ...new Set(
      [...markup.matchAll(/class="([^"]+)"/g)]
        .flatMap(([, classNames]) => classNames.split(/\s+/))
        .filter((className) => classPattern.test(className)),
    ),
  ].sort();
}

function startTagWithAttribute(markup: string, attribute: string, value: string): string {
  const attributeText = `${attribute}="${value}"`;
  const startTag = [...markup.matchAll(/<[^/][^>]*>/g)]
    .map(([tag]) => tag)
    .find((tag) => tag.includes(attributeText));

  if (!startTag) {
    throw new Error(`Missing SSR element with ${attributeText}.`);
  }

  return startTag;
}

function hasClassStateRule(css: string, classNames: readonly string[], state: string): boolean {
  return classNames.some((className) =>
    new RegExp(`\\.${className}(?:\\.${className})*${escapeRegExp(state)}`).test(css),
  );
}

function hasClassMediaRule(
  css: string,
  classNames: readonly string[],
  mediaCondition: string,
): boolean {
  const mediaRule = new RegExp(
    `@media\\s*${escapeRegExp(mediaCondition)}\\s*\\{([^{}]|\\{[^{}]*\\})*\\}`,
    "g",
  );

  return [...css.matchAll(mediaRule)].some(([rule]) =>
    classNames.some((className) => rule.includes(`.${className}`)),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
