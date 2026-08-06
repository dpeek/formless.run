import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

type DependencyField = (typeof dependencyFields)[number];

type PackageManifest = {
  [field in DependencyField]?: Record<string, string>;
} & {
  exports?: unknown;
  name: string;
  publishConfig?: Record<string, unknown> & { exports?: unknown };
  scripts?: Record<string, string>;
  version: string;
};

type PrepareReleaseTarballsInput = {
  destination: string;
  repoRoot?: string;
};

export function prepareReleaseTarballs(input: PrepareReleaseTarballsInput): Map<string, string> {
  const repoRoot = input.repoRoot ?? defaultRepoRoot;
  const packageRoots = workspacePackageRoots(repoRoot);
  const versions = new Map(
    packageRoots.map((packageRoot) => {
      const manifest = readPackageManifest(packageRoot);

      return [manifest.name, manifest.version] as const;
    }),
  );

  mkdirSync(input.destination, { recursive: true });

  for (const packageRoot of packageRoots) {
    const manifest = readPackageManifest(packageRoot);

    if (manifest.scripts?.pack) {
      runBun(["run", "--cwd", packageRoot, "pack"], repoRoot);
    }
  }

  return new Map(
    packageRoots.map((packageRoot) => {
      const manifest = readPackageManifest(packageRoot);
      const tarballPath = packReleasePackage({
        destination: input.destination,
        packageRoot,
        versions,
      });

      return [manifest.name, tarballPath] as const;
    }),
  );
}

export function releasePackageManifest(
  manifest: PackageManifest,
  versions: ReadonlyMap<string, string>,
): PackageManifest {
  const releaseExports = manifest.publishConfig?.exports;

  if (releaseExports === undefined) {
    return resolveWorkspaceDependencies(manifest, versions);
  }

  const publishConfig = { ...manifest.publishConfig };

  delete publishConfig.exports;

  return resolveWorkspaceDependencies(
    {
      ...manifest,
      exports: releaseExports,
      publishConfig,
    },
    versions,
  );
}

function workspacePackageRoots(repoRoot: string): string[] {
  return readdirSync(path.resolve(repoRoot, "lib"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.resolve(repoRoot, "lib", entry.name))
    .filter((packageRoot) => existsSync(path.resolve(packageRoot, "package.json")))
    .sort();
}

export function packReleasePackage(input: {
  destination: string;
  packageRoot: string;
  versions: ReadonlyMap<string, string>;
}): string {
  const manifest = readPackageManifest(input.packageRoot);

  mkdirSync(input.destination, { recursive: true });

  const stagingRoot = mkdtempSync(path.join(tmpdir(), "formless-release-package-"));
  const stagingPackageRoot = path.resolve(stagingRoot, "package");

  try {
    cpSync(input.packageRoot, stagingPackageRoot, {
      filter(source) {
        const relativePath = path.relative(input.packageRoot, source);

        return !(
          relativePath === "node_modules" ||
          relativePath.startsWith(`node_modules${path.sep}`) ||
          relativePath === ".git" ||
          relativePath.startsWith(`.git${path.sep}`)
        );
      },
      recursive: true,
    });
    writeFileSync(
      path.resolve(stagingPackageRoot, "package.json"),
      `${JSON.stringify(releasePackageManifest(manifest, input.versions), null, 2)}\n`,
    );

    return bunPack(stagingPackageRoot, input.destination);
  } finally {
    rmSync(stagingRoot, { force: true, recursive: true });
  }
}

function bunPack(packageRoot: string, destination: string): string {
  const output = runBun(
    ["pm", "pack", "--ignore-scripts", "--destination", destination, "--quiet"],
    packageRoot,
  );
  const reportedPath = output
    .split("\n")
    .map((line) => line.trim())
    .findLast((line) => line.endsWith(".tgz"));

  if (!reportedPath) {
    throw new Error(`Pack did not report a tarball for ${packageRoot}.`);
  }

  if (path.isAbsolute(reportedPath)) {
    return reportedPath;
  }

  const packageRelativePath = path.resolve(packageRoot, reportedPath);

  return existsSync(packageRelativePath)
    ? packageRelativePath
    : path.resolve(destination, path.basename(reportedPath));
}

function readPackageManifest(packageRoot: string): PackageManifest {
  return JSON.parse(readFileSync(path.resolve(packageRoot, "package.json"), "utf8"));
}

function resolveWorkspaceDependencies(
  manifest: PackageManifest,
  versions: ReadonlyMap<string, string>,
): PackageManifest {
  const resolved = { ...manifest };

  for (const field of dependencyFields) {
    const dependencies = manifest[field];

    if (!dependencies) {
      continue;
    }

    resolved[field] = Object.fromEntries(
      Object.entries(dependencies).map(([name, specifier]) => [
        name,
        releaseDependencySpecifier(name, specifier, versions),
      ]),
    );
  }

  return resolved;
}

function releaseDependencySpecifier(
  name: string,
  specifier: string,
  versions: ReadonlyMap<string, string>,
): string {
  if (!specifier.startsWith("workspace:")) {
    return specifier;
  }

  const version = versions.get(name);

  if (!version) {
    throw new Error(`Cannot resolve workspace dependency ${name}.`);
  }

  const workspaceRange = specifier.slice("workspace:".length);

  if (workspaceRange === "" || workspaceRange === "*") {
    return version;
  }
  if (workspaceRange === "^" || workspaceRange === "~") {
    return `${workspaceRange}${version}`;
  }

  return workspaceRange;
}

function runBun(args: string[], cwd: string): string {
  const result = spawnSync("bun", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 40 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `bun ${args.slice(0, 5).join(" ")} failed with ${result.status}`,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
}

if (import.meta.main) {
  const destination = path.resolve(defaultRepoRoot, process.argv[2] ?? "tmp/release-packages");

  rmSync(destination, { force: true, recursive: true });

  const tarballs = prepareReleaseTarballs({ destination });

  for (const [name, tarballPath] of tarballs) {
    console.log(`${name}: ${tarballPath}`);
  }
}
