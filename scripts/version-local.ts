import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Usage: bun run version:local -- <version>");
  console.error("Example: bun run version:local -- 0.1.10");
  process.exit(1);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const libRoot = path.resolve(repoRoot, "lib");

for (const entry of readdirSync(libRoot, { withFileTypes: true }).sort((left, right) =>
  left.name.localeCompare(right.name),
)) {
  if (!entry.isDirectory()) continue;

  const packageRoot = path.resolve(libRoot, entry.name);
  const manifestPath = path.resolve(packageRoot, "package.json");

  let manifest: { name?: string; version?: string };
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    continue;
  }

  if (!manifest.name?.startsWith("@dpeek/") || !manifest.version) continue;

  const source = readFileSync(manifestPath, "utf8");
  const updated = source.replace(/("version"\s*:\s*)"[^"]+"/, `$1"${version}"`);

  if (updated === source) {
    throw new Error(`Could not update version in ${manifestPath}.`);
  }

  writeFileSync(manifestPath, updated);
  console.log(`${manifest.name}: ${manifest.version} -> ${version}`);
}
