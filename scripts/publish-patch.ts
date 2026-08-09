import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const versions = new Set<string>();

for (const entry of readdirSync(path.resolve(repoRoot, "lib"), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;

  const manifestPath = path.resolve(repoRoot, "lib", entry.name, "package.json");
  let manifest: { name?: string; version?: string };

  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    continue;
  }

  if (manifest.name?.startsWith("@dpeek/") && manifest.version) {
    versions.add(manifest.version);
  }
}

if (versions.size !== 1) {
  console.error(`Expected one shared @dpeek/* version, found: ${[...versions].join(", ")}`);
  process.exit(1);
}

const currentVersion = [...versions][0];
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(currentVersion);

if (!match) {
  console.error(`Cannot increment non-release version: ${currentVersion}`);
  process.exit(1);
}

const nextVersion = `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
const existingTag = spawnSync("git", ["tag", "--list", nextVersion], {
  cwd: repoRoot,
  encoding: "utf8",
});

if (existingTag.status !== 0) process.exit(existingTag.status ?? 1);

if (existingTag.stdout.trim()) {
  console.error(`Tag already exists: ${nextVersion}`);
  process.exit(1);
}

const versionResult = spawnSync("bun", ["run", "version", "--", nextVersion], {
  cwd: repoRoot,
  stdio: "inherit",
});

if (versionResult.status !== 0) process.exit(versionResult.status ?? 1);

const publishResult = spawnSync("bun", ["run", "publish"], {
  cwd: repoRoot,
  stdio: "inherit",
});

if (publishResult.status !== 0) process.exit(publishResult.status ?? 1);

const addResult = spawnSync("git", ["add", "-A", "."], {
  cwd: repoRoot,
  stdio: "inherit",
});

if (addResult.status !== 0) process.exit(addResult.status ?? 1);

const commitResult = spawnSync("git", ["commit", "-m", nextVersion], {
  cwd: repoRoot,
  stdio: "inherit",
});

if (commitResult.status !== 0) process.exit(commitResult.status ?? 1);

const tagResult = spawnSync("git", ["tag", nextVersion], {
  cwd: repoRoot,
  stdio: "inherit",
});

process.exit(tagResult.status ?? 1);
