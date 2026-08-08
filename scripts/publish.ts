import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareReleaseTarballs } from "./release-packaging.ts";

const registry = "http://localhost:4873/";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = mkdtempSync(path.join(tmpdir(), "formless-packages-"));

try {
  const local = false;
  const tarballs = prepareReleaseTarballs({ destination, repoRoot });
  const localArgs = local ? ["--registry", registry] : [];

  for (const [name, tarballPath] of tarballs) {
    console.log(`Publishing ${name}`);
    const result = spawnSync("bun", ["publish", tarballPath, ...localArgs], {
      cwd: repoRoot,
      stdio: "inherit",
    });

    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
} finally {
  rmSync(destination, { force: true, recursive: true });
}
