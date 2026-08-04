import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

import * as ts from "typescript";
import { loadConfigFromFile } from "vite-plus";
import { describe, expect, it } from "vite-plus/test";
import { packReleasePackage, releasePackageManifest } from "./release-packaging.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type CodeExport = {
  import: string;
  types: string;
};

type PackageManifest = {
  exports: Record<string, string>;
  files: string[];
  name: string;
  publishConfig?: {
    exports?: Record<string, CodeExport | string>;
  };
  scripts: Record<string, string | undefined>;
  version: string;
};

type ConventionalPackage = {
  manifest: PackageManifest;
  root: string;
};

type PackageSandbox = {
  packages: ConventionalPackage[];
  root: string;
};

const conventionalPackages = readdirSync(path.resolve(repoRoot, "lib"), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.resolve(repoRoot, "lib", entry.name))
  .filter((root) => existsSync(path.resolve(root, "package.json")))
  .map(
    (root): ConventionalPackage => ({
      manifest: JSON.parse(readFileSync(path.resolve(root, "package.json"), "utf8")),
      root,
    }),
  )
  .filter(({ manifest }) => manifest.scripts.pack?.startsWith("vp pack "))
  .sort((left, right) => left.manifest.name.localeCompare(right.manifest.name));

describe("release package development exports", () => {
  it("loads package-dependent Vite config before compiled output exists", async () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), "formless-vite-config-source-"));
    const gateway = conventionalPackages.find(
      ({ manifest }) => manifest.name === "@dpeek/formless-gateway",
    );

    expect(gateway).toBeDefined();

    if (!gateway) {
      return;
    }

    try {
      const fixturePackageRoot = path.resolve(fixtureRoot, "lib/gateway");
      const fixturePackageLink = path.resolve(fixtureRoot, "node_modules/@dpeek/formless-gateway");
      const rootExport = gateway.manifest.exports["."];
      const configPath = path.resolve(fixtureRoot, "vite.config.ts");

      mkdirSync(fixturePackageRoot, { recursive: true });
      mkdirSync(path.dirname(fixturePackageLink), { recursive: true });
      symlinkSync(fixturePackageRoot, fixturePackageLink, "dir");
      writeFileSync(
        path.resolve(fixturePackageRoot, "package.json"),
        `${JSON.stringify(
          {
            exports: gateway.manifest.exports,
            name: gateway.manifest.name,
            type: "module",
            version: gateway.manifest.version,
          },
          null,
          2,
        )}\n`,
      );
      writeSandboxFile(
        fixturePackageRoot,
        rootExport,
        'export const gatewayConfigValue = "source";\n',
      );
      writeFileSync(
        configPath,
        [
          'import { gatewayConfigValue } from "@dpeek/formless-gateway";',
          "export default { define: { __GATEWAY_CONFIG_VALUE__: JSON.stringify(gatewayConfigValue) } };",
          "",
        ].join("\n"),
      );

      const loaded = await loadConfigFromFile(
        { command: "serve", isPreview: false, isSsrBuild: false, mode: "development" },
        configPath,
        fixtureRoot,
      );

      expect(loaded?.config.define?.__GATEWAY_CONFIG_VALUE__).toBe('"source"');
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it("resolves current source in TypeScript and Bun development", () => {
    const rootTsconfig = readTsconfig(path.resolve(repoRoot, "tsconfig.json"));
    const importer = path.resolve(repoRoot, "scripts/release-packaging.test.ts");
    const targets = conventionalPackages.flatMap(({ manifest, root }) =>
      packageCodeExports(manifest).map(([subpath]) => ({
        source: realpathSync(path.resolve(root, manifest.exports[subpath])),
        specifier: packageSpecifier(manifest.name, subpath),
      })),
    );
    const bunSourceResolutions = bunResolutions(
      targets.map(({ specifier }) => specifier),
      [],
      repoRoot,
    );

    for (const target of targets) {
      expect(resolveTypeScript(target.specifier, importer, rootTsconfig.options)).toBe(
        target.source,
      );
      expect(realpathFromUrl(bunSourceResolutions[target.specifier])).toBe(target.source);
    }
  });

  it("observes source changes without rebuilding stale declarations or runtime output", () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), "formless-release-source-"));

    try {
      const fixturePackageRoot = path.resolve(fixtureRoot, "node_modules/@fixture/source-linked");
      const consumerPath = path.resolve(fixtureRoot, "consumer.ts");
      const manifest = {
        exports: { ".": "./src/index.ts" },
        name: "@fixture/source-linked",
        publishConfig: {
          exports: {
            ".": {
              types: "./dist/index.d.mts",
              import: "./dist/index.mjs",
            },
          },
        },
        type: "module",
        version: "1.0.0",
      };

      mkdirSync(path.resolve(fixturePackageRoot, "src"), { recursive: true });
      mkdirSync(path.resolve(fixturePackageRoot, "dist"), { recursive: true });
      writeFileSync(path.resolve(fixturePackageRoot, "package.json"), JSON.stringify(manifest));
      writeFileSync(
        path.resolve(fixturePackageRoot, "src/index.ts"),
        'export const releaseValue: "current" = "current";\n',
      );
      writeFileSync(
        path.resolve(fixturePackageRoot, "dist/index.d.mts"),
        'export declare const releaseValue: "stale";\n',
      );
      writeFileSync(
        path.resolve(fixturePackageRoot, "dist/index.mjs"),
        'export const releaseValue = "stale";\n',
      );
      writeFileSync(
        consumerPath,
        [
          'import { releaseValue } from "@fixture/source-linked";',
          'const current: "current" = releaseValue;',
          "console.log(current);",
          "",
        ].join("\n"),
      );

      const sourceProgram = ts.createProgram([consumerPath], fixtureCompilerOptions());

      expect(errorDiagnostics(sourceProgram)).toEqual([]);
      expect(runBun([consumerPath], fixtureRoot)).toBe("current");

      writeFileSync(
        path.resolve(fixturePackageRoot, "package.json"),
        JSON.stringify(releasePackageManifest(manifest, new Map())),
      );

      const releaseProgram = ts.createProgram([consumerPath], fixtureCompilerOptions());

      expect(errorDiagnostics(releaseProgram)).toEqual(
        expect.arrayContaining([expect.stringContaining("Type '\"stale\"' is not assignable")]),
      );
      expect(runBun([consumerPath], fixtureRoot)).toBe("stale");
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });
});

describe("packed conventional packages", () => {
  it("resolves source for editors and compiled declarations from release manifests", () => {
    const sourceSandbox = createPackageSandbox("source");
    const releaseSandbox = createPackageSandbox("release");
    const parsedTsconfig = readTsconfig(path.resolve(repoRoot, "tsconfig.json"));
    const sourceImporter = path.resolve(sourceSandbox.root, "consumer.ts");
    const releaseImporter = path.resolve(releaseSandbox.root, "consumer.ts");

    try {
      for (let index = 0; index < sourceSandbox.packages.length; index += 1) {
        const { manifest, root: sourceRoot } = sourceSandbox.packages[index];
        const releaseRoot = releaseSandbox.packages[index].root;

        for (const [subpath, target] of packageCodeExports(manifest)) {
          const specifier = packageSpecifier(manifest.name, subpath);

          expect(resolveTypeScript(specifier, sourceImporter, parsedTsconfig.options)).toBe(
            realpathSync(path.resolve(sourceRoot, manifest.exports[subpath])),
          );
          expect(resolveTypeScript(specifier, releaseImporter, parsedTsconfig.options)).toBe(
            realpathSync(path.resolve(releaseRoot, target.types)),
          );
        }
      }
    } finally {
      rmSync(sourceSandbox.root, { force: true, recursive: true });
      rmSync(releaseSandbox.root, { force: true, recursive: true });
    }
  });

  it("resolves source in the repository and compiled ESM from release manifests", () => {
    const sourceSandbox = createPackageSandbox("source");
    const releaseSandbox = createPackageSandbox("release");
    const targets = sourceSandbox.packages.flatMap(({ manifest, root }, packageIndex) =>
      packageCodeExports(manifest).map(([subpath, target]) => ({
        compiled: realpathSync(
          path.resolve(releaseSandbox.packages[packageIndex].root, target.import),
        ),
        source: realpathSync(path.resolve(root, manifest.exports[subpath])),
        specifier: packageSpecifier(manifest.name, subpath),
      })),
    );
    const specifiers = targets.map(({ specifier }) => specifier);
    try {
      const sourceResolutions = bunResolutions(specifiers, [], sourceSandbox.root);
      const releaseResolutions = bunResolutions(specifiers, [], releaseSandbox.root);

      for (const target of targets) {
        expect(realpathFromUrl(sourceResolutions[target.specifier])).toBe(target.source);
        expect(realpathFromUrl(releaseResolutions[target.specifier])).toBe(target.compiled);
      }
    } finally {
      rmSync(sourceSandbox.root, { force: true, recursive: true });
      rmSync(releaseSandbox.root, { force: true, recursive: true });
    }
  });

  it("packs compiled manifests, source entrypoints, and declared raw assets", () => {
    const sandbox = createPackageSandbox("source");
    const tarballRoot = path.resolve(sandbox.root, "tarballs");
    const versions = new Map(
      sandbox.packages.map(({ manifest }) => [manifest.name, manifest.version] as const),
    );

    try {
      for (const { manifest, root } of sandbox.packages) {
        const tarballPath = packReleasePackage({
          destination: tarballRoot,
          packageRoot: root,
          versions,
        });
        const packedFiles = packedTarballFiles(tarballPath);
        const packedManifest = packedTarballManifest(tarballPath);

        expect(packedFiles).toContain("package.json");
        expect(packedManifest.exports).toEqual(manifest.publishConfig?.exports);
        expect(packedManifest.publishConfig?.exports).toBeUndefined();

        for (const [subpath, target] of packageCodeExports(manifest)) {
          expect(packedFiles).toContain(target.import.slice(2));
          expect(packedFiles).toContain(target.types.slice(2));
          expect(packedFiles).toContain(manifest.exports[subpath].slice(2));
        }

        for (const [, target] of packageAssetExports(manifest)) {
          expect(packedFiles).toContain(target.slice(2));
        }
      }
    } finally {
      rmSync(sandbox.root, { force: true, recursive: true });
    }
  });
});

describe("installed runtime build hosts", () => {
  it("packs every documented Renderer source entrypoint", () => {
    const root = path.resolve(repoRoot, "lib/renderer");
    const manifest = JSON.parse(readFileSync(path.resolve(root, "package.json"), "utf8")) as {
      exports: Record<string, string>;
    };
    const packedFiles = packedFileNames(
      runBun(["pm", "pack", "--dry-run", "--ignore-scripts"], root),
    );

    for (const target of Object.values(manifest.exports)) {
      expect(packedFiles).toContain(target.slice(2));
    }
  });

  it("packs the Bun CLI and package-local runtime build inputs", () => {
    const root = path.resolve(repoRoot, "lib/formless");
    const packedFiles = packedFileNames(
      runBun(["pm", "pack", "--dry-run", "--ignore-scripts"], root),
    );

    expect(packedFiles).toEqual(
      expect.arrayContaining([
        "bin/formless.ts",
        "index.html",
        "src/main.tsx",
        "src/public-site-main.tsx",
        "src/runtime/vite-config.ts",
        "src/worker/index.ts",
        "src/worker/wrangler.jsonc",
        "tsconfig.json",
        "vite.config.ts",
      ]),
    );
  });
});

function packageCodeExports(manifest: PackageManifest): [string, CodeExport][] {
  return Object.entries(manifest.publishConfig?.exports ?? {}).filter(
    (entry): entry is [string, CodeExport] => typeof entry[1] === "object",
  );
}

function createPackageSandbox(mode: "release" | "source"): PackageSandbox {
  const root = mkdtempSync(path.join(tmpdir(), "formless-release-packages-"));
  const packages = conventionalPackages.map(({ manifest }): ConventionalPackage => {
    const packageRoot = path.resolve(root, "node_modules", ...manifest.name.split("/"));
    const packageExports = mode === "release" ? manifest.publishConfig?.exports : manifest.exports;

    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(
      path.resolve(packageRoot, "package.json"),
      JSON.stringify({
        exports: packageExports,
        files: manifest.files,
        name: manifest.name,
        publishConfig: manifest.publishConfig,
        type: "module",
        version: manifest.version,
      }),
    );

    for (const [subpath, target] of packageCodeExports(manifest)) {
      writeSandboxFile(
        packageRoot,
        manifest.exports[subpath],
        'export const packageTarget: "source" = "source";\n',
      );
      writeSandboxFile(packageRoot, target.types, "export declare const packageTarget: string;\n");
      writeSandboxFile(packageRoot, target.import, 'export const packageTarget = "compiled";\n');
    }

    for (const [, target] of packageAssetExports(manifest)) {
      writeSandboxFile(packageRoot, target, "{}\n");
    }

    return { manifest, root: packageRoot };
  });

  writeFileSync(path.resolve(root, "consumer.ts"), "export {};\n");

  return { packages, root };
}

function writeSandboxFile(packageRoot: string, target: string, contents: string): void {
  const filePath = path.resolve(packageRoot, target);

  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

function packageAssetExports(manifest: PackageManifest): [string, string][] {
  return Object.entries(manifest.publishConfig?.exports ?? {}).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
}

function packageSpecifier(packageName: string, subpath: string): string {
  return subpath === "." ? packageName : `${packageName}${subpath.slice(1)}`;
}

function readTsconfig(tsconfigPath: string): ts.ParsedCommandLine {
  const result = ts.readConfigFile(tsconfigPath, (filePath) => ts.sys.readFile(filePath));

  if (result.error) {
    throw new Error(ts.flattenDiagnosticMessageText(result.error.messageText, "\n"));
  }

  return ts.parseJsonConfigFileContent(result.config, ts.sys, path.dirname(tsconfigPath));
}

function fixtureCompilerOptions(): ts.CompilerOptions {
  return {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2023,
  };
}

function errorDiagnostics(program: ts.Program): string[] {
  return ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
}

function resolveTypeScript(
  specifier: string,
  importer: string,
  options: ts.CompilerOptions,
): string | undefined {
  const result = ts.resolveModuleName(specifier, importer, options, ts.sys).resolvedModule;

  return result ? realpathSync(result.resolvedFileName) : undefined;
}

function bunResolutions(specifiers: string[], args: string[], cwd: string): Record<string, string> {
  const script = [
    `const specifiers = ${JSON.stringify(specifiers)};`,
    "console.log(JSON.stringify(Object.fromEntries(specifiers.map((specifier) => [specifier, import.meta.resolve(specifier)]))));",
  ].join("\n");
  const output = runBun([...args, "--eval", script], cwd);

  return JSON.parse(output);
}

function realpathFromUrl(url: string | undefined): string | undefined {
  return url ? realpathSync(fileURLToPath(url)) : undefined;
}

function packedFileNames(output: string): string[] {
  return output
    .split("\n")
    .map((line) => /^packed\s+\S+\s+(.+)$/.exec(stripVTControlCharacters(line))?.[1])
    .filter((file): file is string => file !== undefined);
}

function packedTarballFiles(tarballPath: string): string[] {
  return runCommand("tar", ["-tzf", tarballPath], repoRoot)
    .split("\n")
    .map((file) => file.replace(/^package\//, ""))
    .filter((file) => file !== "" && !file.endsWith("/"));
}

function packedTarballManifest(tarballPath: string): PackageManifest {
  return JSON.parse(runCommand("tar", ["-xOf", tarballPath, "package/package.json"], repoRoot));
}

function runBun(args: string[], cwd: string): string {
  return runCommand("bun", args, cwd);
}

function runCommand(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `${command} ${args.slice(0, 3).join(" ")} failed with ${result.status}`,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
}
