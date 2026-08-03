import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";
import { formlessProgramSchema, formlessProgramSchemaProvenance } from "../program/runtime.ts";
import {
  FORMLESS_PROGRAM_SCHEMA_KEY,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
} from "../program/target.ts";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import {
  DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT,
  FORMLESS_CONFIG_FILE,
  WORKSPACE_RECORD_STATE_FILE_KIND,
  resolveFormlessConfig,
} from "@dpeek/formless-workspace";
import { formatTestFormlessConfigModule } from "./instance-workspace-config-test.ts";

import { FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER } from "../shared/protocol.ts";
import {
  createDefaultWorkspaceAutoSaveScheduler,
  createWorkspaceAutoSaveScheduler,
  type WorkspaceAutoSaveSchedulerFailure,
  type WorkspaceDefaultAutoSaveSchedulerDependencies,
} from "./workspace-gateway-auto-save.ts";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((tempDir) =>
        rm(tempDir, { force: true, maxRetries: 10, recursive: true, retryDelay: 25 }),
      ),
  );
});

describe("workspace gateway auto-save", () => {
  it("coalesces generations and clears only writes included in a successful save", async () => {
    const workspaceRoot = await makeTempDir();
    const saves: Array<{
      dirtyGeneration: number;
      writeSources: readonly string[];
    }> = [];
    const saving = deferred<void>();
    const scheduler = createWorkspaceAutoSaveScheduler({
      clearTimeout: () => undefined,
      debounceMs: 50,
      reportFailure: () => undefined,
      save: async (input) => {
        saves.push({
          dirtyGeneration: input.dirtyGeneration,
          writeSources: input.writeSources,
        });
        if (saves.length === 1) {
          await saving.promise;
        }
      },
      setTimeout: (callback) => callback,
    });

    await scheduler.enqueue({ source: "control-plane-write", workspaceRoot });
    await scheduler.enqueue({ source: "deployment-intent", workspaceRoot });

    const running = scheduler.runNow(workspaceRoot);
    await waitUntil(() => Promise.resolve(saves.length === 1));
    await scheduler.enqueue({ source: "schema-save", workspaceRoot });
    saving.resolve(undefined);
    await running;
    await scheduler.runNow(workspaceRoot);

    expect(saves).toEqual([
      {
        dirtyGeneration: 2,
        writeSources: ["control-plane-write", "deployment-intent"],
      },
      {
        dirtyGeneration: 3,
        writeSources: ["schema-save"],
      },
    ]);
  });

  it("bounds automatic retries and reports original failures only to local diagnostics", async () => {
    const workspaceRoot = await makeTempDir();
    const diagnostics: Array<{ error: unknown; failure: WorkspaceAutoSaveSchedulerFailure }> = [];
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
    const originalError = new Error(
      `${workspaceRoot}/state failed FORMLESS_TOKEN=secret Bearer local-secret-token`,
    );
    let fail = true;
    let saveCount = 0;
    const scheduler = createWorkspaceAutoSaveScheduler({
      clearTimeout: () => undefined,
      debounceMs: 50,
      maxRetries: 1,
      reportFailure: (error, failure) => diagnostics.push({ error, failure }),
      retryBackoffMs: (retryCount) => retryCount * 100,
      save: async () => {
        saveCount += 1;
        if (fail) {
          throw originalError;
        }
      },
      setTimeout: (callback, delayMs) => {
        scheduled.push({ callback, delayMs });
        return callback;
      },
    });

    await scheduler.enqueue({ source: "control-plane-write", workspaceRoot });
    await scheduler.runNow(workspaceRoot);
    scheduled.at(-1)?.callback();
    await waitUntil(() => Promise.resolve(diagnostics.length === 2));

    expect(saveCount).toBe(2);
    expect(scheduled.map(({ delayMs }) => delayMs)).toEqual([50, 100]);
    expect(diagnostics.map(({ error }) => error)).toEqual([originalError, originalError]);
    expect(diagnostics.map(({ failure }) => failure.retryCount)).toEqual([1, 2]);

    fail = false;
    await scheduler.enqueue({ source: "schema-save", workspaceRoot });
    await scheduler.runNow(workspaceRoot);
    expect(saveCount).toBe(3);
  });

  it("lets manual save completion clear only the generation it started with", async () => {
    const workspaceRoot = await makeTempDir();
    const saves: Array<{ dirtyGeneration: number; writeSources: readonly string[] }> = [];
    const scheduler = createWorkspaceAutoSaveScheduler({
      clearTimeout: () => undefined,
      reportFailure: () => undefined,
      save: async (input) => {
        saves.push({
          dirtyGeneration: input.dirtyGeneration,
          writeSources: input.writeSources,
        });
      },
      setTimeout: (callback) => callback,
    });

    await scheduler.enqueue({ source: "control-plane-write", workspaceRoot });
    const manualSaveGeneration = await scheduler.recordWorkspaceOperationSuppressed({
      operationInput: { kind: "save" },
      workspaceRoot,
    });
    await scheduler.enqueue({ source: "schema-save", workspaceRoot });

    if (manualSaveGeneration === undefined) {
      throw new Error("Expected manual save generation.");
    }

    await scheduler.recordSaved({
      throughGeneration: manualSaveGeneration,
      workspaceRoot,
    });
    await scheduler.runNow(workspaceRoot);

    expect(saves).toEqual([{ dirtyGeneration: 2, writeSources: ["schema-save"] }]);
  });

  it("records operation suppression without scheduling save work", async () => {
    const workspaceRoot = await makeTempDir();
    const scheduled: number[] = [];
    let saveCount = 0;
    const scheduler = createWorkspaceAutoSaveScheduler({
      reportFailure: () => undefined,
      save: async () => {
        saveCount += 1;
      },
      setTimeout: (_callback, delayMs) => {
        scheduled.push(delayMs);
        return delayMs;
      },
    });

    await scheduler.recordGatewayOperationStateSuppressed({ workspaceRoot });
    await expect(
      scheduler.recordWorkspaceOperationSuppressed({
        operationInput: { kind: "save" },
        workspaceRoot,
      }),
    ).resolves.toBe(0);
    await expect(
      scheduler.recordWorkspaceOperationSuppressed({
        operationInput: { kind: "pull" },
        workspaceRoot,
      }),
    ).resolves.toBeUndefined();
    await expect(
      scheduler.recordWorkspaceOperationSuppressed({
        operationInput: { kind: "credentialSetup", provider: "cloudflare" },
        workspaceRoot,
      }),
    ).resolves.toBeUndefined();

    expect(saveCount).toBe(0);
    expect(scheduled).toEqual([]);
  });

  it("starts clean after sidecar restart and leaves old state files inert", async () => {
    const workspaceRoot = await makeTempDir();
    const oldStatePath = path.join(workspaceRoot, ".formless/local/auto-save.json");
    let restartedSaveCount = 0;
    const firstScheduler = createWorkspaceAutoSaveScheduler({
      reportFailure: () => undefined,
      save: async () => undefined,
      setTimeout: (callback) => callback,
    });

    await firstScheduler.enqueue({ source: "snapshot-restore", workspaceRoot });
    await mkdir(path.dirname(oldStatePath), { recursive: true });
    await writeFile(oldStatePath, '{"displayState":"queued","dirtyGeneration":9}\n');

    const restartedScheduler = createWorkspaceAutoSaveScheduler({
      reportFailure: () => undefined,
      save: async () => {
        restartedSaveCount += 1;
      },
    });
    await restartedScheduler.runNow(workspaceRoot);

    expect(restartedSaveCount).toBe(0);
    await expect(readFile(oldStatePath, "utf8")).resolves.toBe(
      '{"displayState":"queued","dirtyGeneration":9}\n',
    );
  });

  it("executes typed workspace save directly without operation or auto-save state files", async () => {
    const workspaceRoot = await makeTempDir();
    const requests: CapturedRequest[] = [];
    const scheduler = createDefaultWorkspaceAutoSaveScheduler(
      autoSaveDeps(workspaceRoot, { fetch: workspaceSaveFetch(requests) }),
    );

    await writeWorkspaceConfig(workspaceRoot);
    await writeLocalDevEnv(workspaceRoot);
    await scheduler.enqueue({ source: "control-plane-write", workspaceRoot });
    await scheduler.runNow(workspaceRoot);

    const instanceState = JSON.parse(
      await readFile(path.join(workspaceRoot, "state/instance.json"), "utf8"),
    ) as {
      kind: string;
      schema?: unknown;
      schemaProvenance?: { kind: string };
      storageIdentity: string;
    };
    expect(instanceState).toMatchObject({
      kind: WORKSPACE_RECORD_STATE_FILE_KIND,
      schemaProvenance: { kind: "program" },
      storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
    });
    expect(instanceState.schema).toBeUndefined();
    await expect(stat(path.join(workspaceRoot, ".formless/operations"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      stat(path.join(workspaceRoot, ".formless/local/auto-save.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET http://localhost:5173/api/formless/program/snapshot?actorKind=cliDeployer",
    ]);
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer local-save-token",
    ]);
  });
});

function autoSaveDeps(
  workspaceRoot: string,
  options: { fetch?: typeof fetch } = {},
): WorkspaceDefaultAutoSaveSchedulerDependencies {
  return {
    cwd: workspaceRoot,
    env: { FORMLESS_ADMIN_TOKEN: "local-save-token" },
    fetch: options.fetch ?? (async () => Response.json({ error: "not found" }, { status: 404 })),
    now: () => "2026-06-02T02:00:00.000Z",
  };
}

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "formless-gateway-auto-save-test-"));

  tempDirs.push(tempDir);
  return tempDir;
}

async function writeWorkspaceConfig(workspaceRoot: string) {
  const config = resolveFormlessConfig({ name: "personal-sites" });

  await writeFile(
    path.join(workspaceRoot, FORMLESS_CONFIG_FILE),
    formatTestFormlessConfigModule(config),
  );
}

async function writeLocalDevEnv(workspaceRoot: string) {
  await mkdir(path.join(workspaceRoot, DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT), {
    recursive: true,
  });
  await writeFile(
    path.join(workspaceRoot, DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT, "dev.env"),
    "FORMLESS_ADMIN_TOKEN=local-save-token\nFORMLESS_OWNER_SESSION_SECRET=local-owner-secret\n",
  );
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });

  return { promise, resolve };
}

async function waitUntil(condition: () => Promise<boolean>, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await condition()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error("Timed out waiting for condition.");
}

type CapturedRequest = {
  body?: string;
  headers: Record<string, string>;
  method: string;
  url: string;
};

function workspaceSaveFetch(requests: CapturedRequest[]): typeof fetch {
  return async (url, init) => {
    const requestUrl =
      typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const parsedUrl = new URL(requestUrl);

    requests.push({
      body: typeof init?.body === "string" ? init.body : undefined,
      headers: normalizeHeaders(init?.headers),
      method: init?.method ?? "GET",
      url: requestUrl,
    });

    if (parsedUrl.pathname === "/api/formless/program/snapshot") {
      return Response.json(controlPlaneSnapshot([]), {
        headers: {
          [FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER]:
            formlessProgramSchemaProvenance.sourceSchemaHash,
        },
      });
    }

    return Response.json({ error: "not found" }, { status: 404 });
  };
}

function controlPlaneSnapshot(records: StoredRecord[]): StorageSnapshot {
  return {
    exportedAt: "2026-05-12T02:00:00.000Z",
    kind: STORAGE_SNAPSHOT_KIND,
    records,
    schema: formlessProgramSchema,
    schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
    schemaUpdatedAt: "2026-05-01T00:00:00.000Z",
    sourceCursor: records.length,
    storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
    version: STORAGE_SNAPSHOT_VERSION,
  };
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  return Object.fromEntries(new Headers(headers).entries());
}
