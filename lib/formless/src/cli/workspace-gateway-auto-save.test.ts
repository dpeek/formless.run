import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";
import packageJson from "../../package.json";
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
  initialWorkspaceAutoSaveState,
  nextWorkspaceAutoSaveEnqueuedState,
  nextWorkspaceAutoSaveFailedState,
} from "@dpeek/formless-workspace";
import { formatTestFormlessConfigModule } from "./instance-workspace-config-test.ts";
import {
  readInstanceWorkspaceAutoSaveState,
  writeInstanceWorkspaceAutoSaveState,
} from "@dpeek/formless-workspace/node";

import { FORMLESS_RUNTIME_PROTOCOL_VERSION } from "../shared/deploy-metadata.ts";
import {
  createDefaultWorkspaceAutoSaveScheduler,
  createWorkspaceAutoSaveScheduler,
  workspaceAutoSaveLocalStateRoot,
  type WorkspaceDefaultAutoSaveSchedulerDependencies,
} from "./workspace-gateway-auto-save.ts";
import { createWorkspaceGatewayOperationHandlers } from "./workspace-gateway-operation-adapter.ts";

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
  it("reads clean and dirty status from ignored local state", async () => {
    const workspaceRoot = await makeTempDir();
    const scheduler = createWorkspaceAutoSaveScheduler({
      now: timestampSequence("2026-06-02T02:00:00.000Z", "2026-06-02T02:00:01.000Z"),
      save: async () => undefined,
    });

    await expect(scheduler.status({ workspaceRoot })).resolves.toMatchObject({
      dirtyGeneration: 0,
      displayState: "clean",
      savedGeneration: 0,
    });

    await writeInstanceWorkspaceAutoSaveState({
      localStateRoot: workspaceAutoSaveLocalStateRoot(workspaceRoot),
      state: {
        ...initialWorkspaceAutoSaveState({
          now: () => "2026-06-02T02:00:02.000Z",
        }),
        dirtyGeneration: 1,
        displayState: "dirty",
        lastEnqueueAt: "2026-06-02T02:00:03.000Z",
        writeSources: ["schema-save"],
      },
      workspaceRoot,
    });

    await expect(scheduler.status({ workspaceRoot })).resolves.toMatchObject({
      dirtyGeneration: 1,
      displayState: "dirty",
      savedGeneration: 0,
      writeSources: ["schema-save"],
    });
  });
  it("enqueues dirty work and records gateway-owned suppression reasons", async () => {
    const workspaceRoot = await makeTempDir();
    const scheduled: Array<{
      callback: () => void;
      delayMs: number;
    }> = [];
    const scheduler = createWorkspaceAutoSaveScheduler({
      clearTimeout: () => undefined,
      debounceMs: 25,
      now: timestampSequence(
        "2026-06-02T02:10:00.000Z",
        "2026-06-02T02:10:01.000Z",
        "2026-06-02T02:10:02.000Z",
        "2026-06-02T02:10:03.000Z",
        "2026-06-02T02:10:04.000Z",
        "2026-06-02T02:10:05.000Z",
        "2026-06-02T02:10:06.000Z",
      ),
      save: async () => undefined,
      setTimeout: (callback, delayMs) => {
        scheduled.push({ callback, delayMs });
        return callback;
      },
    });

    await expect(
      scheduler.enqueue({
        source: "control-plane-write",
        workspaceRoot,
      }),
    ).resolves.toMatchObject({
      dirtyGeneration: 1,
      displayState: "queued",
      writeSources: ["control-plane-write"],
    });
    await expect(
      scheduler.recordGatewayOperationStateSuppressed({ workspaceRoot }),
    ).resolves.toMatchObject({
      suppressed: { reason: "gateway-operation-state" },
    });
    await expect(
      scheduler.recordWorkspaceOperationSuppressed({
        operationInput: { kind: "save" },
        workspaceRoot,
      }),
    ).resolves.toMatchObject({ suppressed: { reason: "manual-save" } });
    await expect(
      scheduler.recordWorkspaceOperationSuppressed({
        operationInput: { check: true, kind: "save" },
        workspaceRoot,
      }),
    ).resolves.toMatchObject({ suppressed: { reason: "workspace-check-status" } });
    await expect(
      scheduler.recordWorkspaceOperationSuppressed({
        operationInput: { kind: "pull" },
        workspaceRoot,
      }),
    ).resolves.toMatchObject({ suppressed: { reason: "workspace-pull" } });
    await expect(
      scheduler.recordWorkspaceOperationSuppressed({
        operationInput: { kind: "push" },
        workspaceRoot,
      }),
    ).resolves.toMatchObject({ suppressed: { reason: "push-deploy-remote-apply" } });
    await expect(
      scheduler.recordWorkspaceOperationSuppressed({
        operationInput: { kind: "status" },
        workspaceRoot,
      }),
    ).resolves.toMatchObject({ suppressed: { reason: "workspace-check-status" } });
    await expect(
      scheduler.recordWorkspaceOperationSuppressed({
        operationInput: { kind: "credentialSetup", provider: "cloudflare" },
        workspaceRoot,
      }),
    ).resolves.toBeUndefined();
    expect(scheduled.map((entry) => entry.delayMs)).toEqual([25]);
  });
  it("coalesces dirty generations while a save is running", async () => {
    const workspaceRoot = await makeTempDir();
    const saves: Array<{
      dirtyGeneration: number;
      sources: readonly string[];
    }> = [];
    const saving = deferred<void>();
    const scheduler = createWorkspaceAutoSaveScheduler({
      clearTimeout: () => undefined,
      debounceMs: 50,
      now: timestampSequence(
        "2026-06-02T02:20:00.000Z",
        "2026-06-02T02:20:01.000Z",
        "2026-06-02T02:20:02.000Z",
        "2026-06-02T02:20:03.000Z",
        "2026-06-02T02:20:04.000Z",
        "2026-06-02T02:20:05.000Z",
        "2026-06-02T02:20:06.000Z",
      ),
      save: async (input) => {
        saves.push({
          dirtyGeneration: input.dirtyGeneration,
          sources: input.writeSources,
        });
        await saving.promise;
      },
      setTimeout: (callback) => callback,
    });

    await scheduler.enqueue({
      source: "control-plane-write",
      workspaceRoot,
    });
    await scheduler.enqueue({
      source: "deployment-intent",
      workspaceRoot,
    });

    const running = scheduler.runNow(workspaceRoot);
    await waitUntil(() => Promise.resolve(saves.length === 1));
    await expect(scheduler.status({ workspaceRoot })).resolves.toMatchObject({
      dirtyGeneration: 2,
      displayState: "saving",
      inFlightGeneration: 2,
      savedGeneration: 0,
    });

    await scheduler.enqueue({
      source: "schema-save",
      workspaceRoot,
    });
    saving.resolve(undefined);
    await running;

    await expect(scheduler.status({ workspaceRoot })).resolves.toMatchObject({
      dirtyGeneration: 3,
      displayState: "queued",
      savedGeneration: 2,
      writeSources: ["control-plane-write", "deployment-intent", "schema-save"],
    });
  });
  it("records retryable failed state with display-safe errors and explicit run-now recovery", async () => {
    const workspaceRoot = await makeTempDir();
    const scheduled: Array<{
      callback: () => void;
      delayMs: number;
    }> = [];
    let failNextSave = true;
    const scheduler = createWorkspaceAutoSaveScheduler({
      clearTimeout: () => undefined,
      debounceMs: 50,
      maxRetries: 1,
      now: timestampSequence(
        "2026-06-02T02:30:00.000Z",
        "2026-06-02T02:30:01.000Z",
        "2026-06-02T02:30:02.000Z",
        "2026-06-02T02:30:03.000Z",
        "2026-06-02T02:30:04.000Z",
        "2026-06-02T02:30:05.000Z",
      ),
      retryBackoffMs: (retryCount) => retryCount * 100,
      save: async () => {
        if (failNextSave) {
          failNextSave = false;
          throw new Error(
            `${workspaceRoot}/state failed FORMLESS_TOKEN=secret Bearer local-secret-token`,
          );
        }
      },
      setTimeout: (callback, delayMs) => {
        scheduled.push({ callback, delayMs });
        return callback;
      },
    });

    await scheduler.enqueue({
      source: "control-plane-write",
      workspaceRoot,
    });

    const failed = await scheduler.runNow(workspaceRoot);

    expect(failed).toMatchObject({
      dirtyGeneration: 1,
      displayState: "failed",
      retryCount: 1,
      savedGeneration: 0,
    });
    expect(failed.error?.message).toContain("<workspace>");
    expect(failed.error?.message).toContain("FORMLESS_TOKEN=[redacted]");
    expect(failed.error?.message).toContain("Bearer [redacted]");
    expect(failed.error?.message).not.toContain(workspaceRoot);
    expect(failed.error?.message).not.toContain("local-secret-token");
    expect(scheduled.map((entry) => entry.delayMs)).toEqual([50, 100]);

    await expect(scheduler.runNow(workspaceRoot)).resolves.toMatchObject({
      dirtyGeneration: 1,
      displayState: "saved",
      retryCount: 0,
      savedGeneration: 1,
      writeSources: [],
    });
  });

  it("executes default auto-save through the workspace operation runner", async () => {
    const workspaceRoot = await makeTempDir();
    const requests: CapturedRequest[] = [];
    const scheduler = createDefaultWorkspaceAutoSaveScheduler(
      autoSaveDeps(workspaceRoot, {
        fetch: workspaceSaveFetch(requests),
        operationIds: ["op_auto_save_00000001"],
        timestamps: [
          "2026-06-02T02:40:00.000Z",
          "2026-06-02T02:40:01.000Z",
          "2026-06-02T02:40:02.000Z",
          "2026-06-02T02:40:03.000Z",
          "2026-06-02T02:40:04.000Z",
          "2026-06-02T02:40:05.000Z",
          "2026-06-02T02:40:06.000Z",
        ],
      }),
    );

    await writeWorkspaceConfig(workspaceRoot, {
      "site.publicRenderer": {
        browser: "renderers/site.browser.tsx",
        worker: "renderers/site.worker.tsx",
      },
    });
    const configBytes = await readFile(path.join(workspaceRoot, FORMLESS_CONFIG_FILE), "utf8");
    await writeLocalDevEnv(workspaceRoot);
    await writeInstanceWorkspaceAutoSaveState({
      localStateRoot: workspaceAutoSaveLocalStateRoot(workspaceRoot),
      state: nextWorkspaceAutoSaveEnqueuedState(
        initialWorkspaceAutoSaveState({
          now: () => "2026-06-02T02:39:59.000Z",
        }),
        {
          now: () => "2026-06-02T02:40:00.000Z",
          source: "control-plane-write",
        },
      ),
      workspaceRoot,
    });
    await expect(scheduler.runNow(workspaceRoot)).resolves.toMatchObject({
      dirtyGeneration: 1,
      displayState: "saved",
      savedGeneration: 1,
      suppressed: { reason: "auto-save" },
      writeSources: [],
    });
    await expect(readFile(path.join(workspaceRoot, FORMLESS_CONFIG_FILE), "utf8")).resolves.toBe(
      configBytes,
    );

    const instanceState = JSON.parse(
      await readFile(path.join(workspaceRoot, "state/instance.json"), "utf8"),
    ) as {
      kind: string;
      schema?: unknown;
      schemaProvenance?: {
        kind: string;
      };
      storageIdentity: string;
    };
    expect(instanceState).toMatchObject({
      kind: WORKSPACE_RECORD_STATE_FILE_KIND,
      schemaProvenance: { kind: "program" },
      storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
    });
    expect(instanceState.schema).toBeUndefined();
    await expect(stat(path.join(workspaceRoot, "archives"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(path.join(workspaceRoot, "state/media"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET http://localhost:5173/api/formless/program/snapshot?actorKind=cliDeployer",
    ]);
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer local-save-token",
    ]);
  });

  it("lets manual gateway save flush failed dirty auto-save state", async () => {
    const workspaceRoot = await makeTempDir();
    const requests: CapturedRequest[] = [];
    const localStateRoot = workspaceAutoSaveLocalStateRoot(workspaceRoot);
    const failedState = nextWorkspaceAutoSaveFailedState(
      nextWorkspaceAutoSaveEnqueuedState(
        initialWorkspaceAutoSaveState({
          now: () => "2026-06-02T02:50:00.000Z",
        }),
        {
          now: () => "2026-06-02T02:50:01.000Z",
          source: "control-plane-write",
        },
      ),
      {
        error: new Error(`${workspaceRoot}/state failed FORMLESS_TOKEN=secret`),
        now: () => "2026-06-02T02:50:02.000Z",
        workspaceRoot,
      },
    );
    const deps = autoSaveDeps(workspaceRoot, {
      fetch: workspaceSaveFetch(requests),
      operationIds: ["op_manual_save_00000001"],
      timestamps: [
        "2026-06-02T02:50:03.000Z",
        "2026-06-02T02:50:04.000Z",
        "2026-06-02T02:50:05.000Z",
        "2026-06-02T02:50:06.000Z",
        "2026-06-02T02:50:07.000Z",
      ],
    });
    const handlers = createWorkspaceGatewayOperationHandlers({
      ...deps,
      autoSaveScheduler: createDefaultWorkspaceAutoSaveScheduler(deps),
    });

    await writeWorkspaceConfig(workspaceRoot);
    await writeInstanceWorkspaceAutoSaveState({
      localStateRoot,
      state: failedState,
      workspaceRoot,
    });
    await writeLocalDevEnv(workspaceRoot);

    await expect(
      handlers.startOperation({
        authorization: { actor: "browser", via: "owner-session" },
        operationInput: { kind: "save" },
        request: new Request("http://local.test/api/formless/workspace-gateway/operations"),
        workspaceRoot,
      }),
    ).resolves.toMatchObject({
      operation: "save",
      status: "succeeded",
    });
    await expect(readInstanceWorkspaceAutoSaveState(localStateRoot)).resolves.toMatchObject({
      dirtyGeneration: 1,
      displayState: "saved",
      retryCount: 0,
      savedGeneration: 1,
      suppressed: { reason: "manual-save" },
      writeSources: [],
    });
  });
});

function autoSaveDeps(
  workspaceRoot: string,
  options: {
    fetch?: typeof fetch;
    operationIds?: string[];
    timestamps?: string[];
  } = {},
): WorkspaceDefaultAutoSaveSchedulerDependencies & {
  createOperationId: () => string;
} {
  const operationIds = [...(options.operationIds ?? [])];
  return {
    createOperationId: () => operationIds.shift() ?? "op_auto_save_test_00000001",
    cwd: workspaceRoot,
    env: { FORMLESS_ADMIN_TOKEN: "local-save-token" },
    fetch: options.fetch ?? (async () => Response.json({ error: "not found" }, { status: 404 })),
    healthCheck: {
      check: async (input: { expectedVersion: string; url: string }) => ({
        cacheControl: "no-store",
        metadataUrl: new URL("/api/formless/deploy", `${input.url}/`).toString(),
        packageVersion: input.expectedVersion,
        runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
        schemaProvenance: formlessProgramSchemaProvenance,
        storageMigrationSet: "formless-storage-migrations:v1",
        url: input.url,
        version: input.expectedVersion,
      }),
    },
    now: timestampSequence(...(options.timestamps ?? ["2026-06-02T02:00:00.000Z"])),
    packageVersion: packageJson.version,
  };
}

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "formless-gateway-auto-save-test-"));

  tempDirs.push(tempDir);
  return tempDir;
}

async function writeWorkspaceConfig(
  workspaceRoot: string,
  extensions?: ReturnType<typeof resolveFormlessConfig>["runtime"]["extensions"],
) {
  const config = resolveFormlessConfig({
    name: "personal-sites",
    ...(extensions === undefined ? {} : { runtime: { extensions } }),
  });

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

function timestampSequence(...timestamps: string[]): () => string {
  let index = 0;

  return () =>
    timestamps[index++ % timestamps.length] ?? timestamps.at(-1) ?? new Date(0).toISOString();
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
      return Response.json(controlPlaneSnapshot([]));
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
