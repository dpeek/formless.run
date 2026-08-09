import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { prepareReleaseTarballs } from "./release-packaging.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = mkdtempSync(path.join(tmpdir(), "formless-packed-install-"));
const tarballRoot = path.resolve(smokeRoot, "tarballs");
const installRoot = path.resolve(smokeRoot, "install");
const workspaceRoot = path.resolve(installRoot, "workspace");
try {
  mkdirSync(tarballRoot, { recursive: true });
  mkdirSync(installRoot, { recursive: true });

  console.log("Preparing compiled release tarballs...");
  const packedDependencies = Object.fromEntries(
    [...prepareReleaseTarballs({ destination: tarballRoot, repoRoot })].map(
      ([name, tarballPath]) => [name, `file:${tarballPath}`],
    ),
  );

  writeFileSync(
    path.resolve(installRoot, "package.json"),
    `${JSON.stringify(
      {
        dependencies: packedDependencies,
        name: "formless-packed-install-smoke",
        overrides: packedDependencies,
        private: true,
      },
      null,
      2,
    )}\n`,
  );

  console.log("Installing tarballs without workspace access...");
  runBun(["install", "--offline", "--ignore-scripts"], installRoot);

  const formlessRoot = path.resolve(installRoot, "node_modules/@dpeek/formless");
  const rendererRoot = path.resolve(installRoot, "node_modules/@dpeek/formless-renderer");
  const cliPath = path.resolve(installRoot, "node_modules/.bin/formless");
  const releaseEnv: NodeJS.ProcessEnv = {
    ...process.env,
    FORMLESS_RUNTIME_PROFILE: "instance",
    NODE_ENV: "production",
    VITE_FORMLESS_RUNTIME_PROFILE: "instance",
  };

  requireFiles(rendererRoot, [
    "src/application-assembly.tsx",
    "src/application-provider.tsx",
    "src/application.css",
    "src/components/input-density.ts",
    "src/site-renderer.tsx",
    "src/site-provider.tsx",
    "src/global.css",
  ]);

  console.log("Executing installed CLI help...");
  const help = runCommand(cliPath, ["--help"], installRoot);
  if (!help.includes("Usage: formless <command>")) {
    throw new Error("Installed CLI help did not print the Formless usage header.");
  }

  mkdirSync(workspaceRoot, { recursive: true });
  writeFileSync(
    path.resolve(workspaceRoot, "formless.ts"),
    [
      'import { defineConfig } from "@dpeek/formless";',
      "",
      'export default defineConfig({ name: "packed-install-smoke" });',
      "",
    ].join("\n"),
  );

  console.log("Loading downstream TypeScript configuration through the installed CLI...");
  const configLoad = runCommand(
    cliPath,
    [
      "token",
      "adopt",
      "--workspace",
      workspaceRoot,
      "--admin-token",
      "packed-install-smoke-token",
    ],
    installRoot,
  );
  if (!configLoad.includes("Instance workspace admin token adopted.")) {
    throw new Error("Installed CLI did not load the downstream TypeScript configuration.");
  }

  console.log("Starting the installed development runtime...");
  await requireInstalledDevRuntime({ cliPath, installRoot, workspaceRoot });

  console.log("Building bundled browser and Worker runtime...");
  runBun(["run", "vp", "build"], formlessRoot, releaseEnv);
  requireRuntimeBuild(formlessRoot);

  const browserEntrypoint = "renderers/site-public.browser.tsx";
  const workerEntrypoint = "renderers/site-public.worker.tsx";
  const browserMarker = "FORMLESS_PACKED_BROWSER_RENDERER";
  const workerMarker = "FORMLESS_PACKED_WORKER_RENDERER";

  writeRenderer(path.resolve(workspaceRoot, browserEntrypoint), browserMarker);
  writeRenderer(path.resolve(workspaceRoot, workerEntrypoint), workerMarker);

  console.log("Building trusted workspace browser and Worker renderers...");
  runBun(["run", "vp", "build"], formlessRoot, {
    ...releaseEnv,
    FORMLESS_SITE_PROJECT_ROOT: workspaceRoot,
    FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS: JSON.stringify({
      "site.publicRenderer": {
        browser: browserEntrypoint,
        worker: workerEntrypoint,
      },
    }),
  });
  requireRuntimeBuild(formlessRoot);

  const clientOutput = readOutputTree(path.resolve(formlessRoot, "dist/client"));
  const workerOutput = readOutputTree(path.resolve(formlessRoot, "dist/formless"));

  if (!clientOutput.includes(browserMarker)) {
    throw new Error("Custom browser renderer marker is absent from the installed build.");
  }
  if (!workerOutput.includes(workerMarker)) {
    throw new Error("Custom Worker renderer marker is absent from the installed build.");
  }

  console.log(
    "Packed install smoke passed: CLI help, downstream config, development runtime, default build, and custom renderer build.",
  );
} finally {
  rmSync(smokeRoot, { force: true, recursive: true });
}

function runBun(args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env): string {
  return runCommand("bun", args, cwd, env);
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env,
    maxBuffer: 40 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `${command} ${args.slice(0, 5).join(" ")} failed with ${result.status}`,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
}

async function requireInstalledDevRuntime(input: {
  cliPath: string;
  installRoot: string;
  workspaceRoot: string;
}): Promise<void> {
  const port = await availablePort();

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      input.cliPath,
      ["dev", "--workspace", input.workspaceRoot, "--reset"],
      {
        cwd: input.installRoot,
        env: {
          ...process.env,
          HOST: "127.0.0.1",
          PORT: String(port),
        },
        stdio: "pipe",
      },
    );
    let output = "";
    let ready = false;
    let settled = false;
    let shutdownTimer: ReturnType<typeof setTimeout> | undefined;
    const startupTimer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error(`Installed Formless development runtime timed out.\n${safeDevOutput(output)}`));
    }, 45_000);
    const capture = (chunk: Buffer) => {
      output = `${output}${chunk.toString()}`.slice(-40_000);

      if (!ready && output.includes("/api/formless/local-session/bootstrap?")) {
        ready = true;
        child.kill("SIGTERM");
        shutdownTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
      }
    };
    const finish = (error?: Error) => {
      if (settled) return;

      settled = true;
      clearTimeout(startupTimer);
      if (shutdownTimer) clearTimeout(shutdownTimer);
      if (error) reject(error);
      else resolve();
    };

    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.once("error", (error) => finish(error));
    child.once("close", (code, signal) => {
      if (ready) {
        finish();
        return;
      }

      finish(
        new Error(
          `Installed Formless development runtime exited with ${
            signal ? `signal ${signal}` : `code ${code ?? "unknown"}`
          }.\n${safeDevOutput(output)}`,
        ),
      );
    });
  });
}

function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a local port for the installed development runtime."));
        return;
      }

      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

function safeDevOutput(output: string): string {
  return output.replace(
    /https?:\/\/\S+\/api\/formless\/local-session\/bootstrap\?\S+/g,
    "[redacted local session bootstrap URL]",
  );
}

function requireFiles(root: string, files: string[]): void {
  for (const file of files) {
    if (!existsSync(path.resolve(root, file))) {
      throw new Error(`Packed install is missing ${path.join(path.basename(root), file)}.`);
    }
  }
}

function requireRuntimeBuild(formlessRoot: string): void {
  requireFiles(formlessRoot, [
    "dist/client/index.html",
    "dist/client/assets/formless-client-manifest.json",
    "dist/formless/index.js",
    "dist/formless/wrangler.json",
  ]);
}

function writeRenderer(filePath: string, marker: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    `export default function SitePublicRenderer() { return ${JSON.stringify(marker)}; }\n`,
  );
}

function readOutputTree(root: string): string {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:js|mjs)$/.test(entry.name))
    .map((entry) => readFileSync(path.resolve(entry.parentPath, entry.name), "utf8"))
    .join("\n");
}
