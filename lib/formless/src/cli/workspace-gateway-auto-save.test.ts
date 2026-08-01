import { setKeyedDefinition } from "../test/schema-definition-test-helpers.ts";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";
import packageJson from "../../package.json";
import { packageAppFactsForKey, listInstallableAppPackages } from "@dpeek/formless-installed-apps";
import { formlessProgramSchema } from "../program/runtime.ts";
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
import { rootKnownPackageFactsResolver } from "../shared/app-packages.ts";
import { siteSourceSchema } from "../test/schema-apps.ts";
import {
  createDefaultWorkspaceAutoSaveScheduler,
  createWorkspaceAutoSaveScheduler,
  workspaceAutoSaveLocalStateRoot,
  type WorkspaceDefaultAutoSaveSchedulerDependencies,
} from "./workspace-gateway-auto-save.ts";
import { createWorkspaceGatewayOperationHandlers } from "./workspace-gateway-operation-adapter.ts";
import {
  createWorkerHarness,
  FORMLESS_WORKER_COMPATIBILITY_DATE,
} from "../worker/miniflare-test.ts";

const tempDirs: string[] = [];
const privateSitePackageAppKey = "private-site";
const rootKnownSitePackage = rootKnownPackageFactsResolver().findPackage("site")!;
const privateSiteSourceSchemaHash =
  "sha256:06789270061b43a2a0e4709f96e8aac35514e0f61bf15a29f234ca253d021c25" as typeof rootKnownSitePackage.sourceSchemaHash;
const privateSitePackage = {
  ...rootKnownSitePackage,
  defaultInstallId: "personal",
  packageAppKey: privateSitePackageAppKey,
  sourceOrigin: "workspace" as const,
  sourceSchemaHash: privateSiteSourceSchemaHash,
  sourceSchemaKey: privateSitePackageAppKey,
  sourceSchemaLocation: {
    kind: "workspace" as const,
    key: privateSitePackageAppKey,
    path: "packages/private-site/schema.json",
  },
};
const privateSitePackageResolver = {
  findPackage: (packageAppKey: string) =>
    packageAppKey === privateSitePackageAppKey ? privateSitePackage : undefined,
  listPackages: () => [privateSitePackage],
};

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
        storageIdentities: ["app:site"],
        writeSources: ["schema-save"],
      },
      workspaceRoot,
    });

    await expect(scheduler.status({ workspaceRoot })).resolves.toMatchObject({
      dirtyGeneration: 1,
      displayState: "dirty",
      savedGeneration: 0,
      storageIdentities: ["app:site"],
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
        source: "app-operation",
        storageIdentity: "app:site",
        workspaceRoot,
      }),
    ).resolves.toMatchObject({
      dirtyGeneration: 1,
      displayState: "queued",
      storageIdentities: ["app:site"],
      writeSources: ["app-operation"],
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
      source: "app-operation",
      storageIdentity: "app:site",
      workspaceRoot,
    });
    await scheduler.enqueue({
      source: "deployment-intent",
      storageIdentity: "instance:control-plane",
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
      storageIdentity: "app:site",
      workspaceRoot,
    });
    saving.resolve(undefined);
    await running;

    await expect(scheduler.status({ workspaceRoot })).resolves.toMatchObject({
      dirtyGeneration: 3,
      displayState: "queued",
      savedGeneration: 2,
      storageIdentities: ["app:site", "instance:control-plane"],
      writeSources: ["app-operation", "deployment-intent", "schema-save"],
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
      source: "app-operation",
      storageIdentity: "app:site",
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
      storageIdentities: [],
      writeSources: [],
    });
  });

  it("executes default auto-save through the workspace operation runner", async () => {
    const workspaceRoot = await makeTempDir();
    const requests: CapturedRequest[] = [];
    const scheduler = createDefaultWorkspaceAutoSaveScheduler(
      autoSaveDeps(workspaceRoot, {
        fetch: workspaceSaveFetch(requests, "site"),
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
          source: "app-operation",
          storageIdentity: "app:site",
        },
      ),
      workspaceRoot,
    });
    await expect(scheduler.runNow(workspaceRoot)).resolves.toMatchObject({
      dirtyGeneration: 1,
      displayState: "saved",
      savedGeneration: 1,
      storageIdentities: [],
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
    await expect(stat(path.join(workspaceRoot, "state/apps/site.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
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

  it("omits installed-app documents from current Program auto-save", async () => {
    const workspaceRoot = await makeTempDir();
    const requests: CapturedRequest[] = [];
    const privateBytes = new TextEncoder().encode("%PDF-1.7\nprivate workspace document");
    const publicBytes = new TextEncoder().encode("%PDF-1.7\npublic workspace document");
    const unreferencedBytes = new TextEncoder().encode("%PDF-1.7\nunreferenced document");
    const scheduler = createDefaultWorkspaceAutoSaveScheduler(
      autoSaveDeps(workspaceRoot, {
        fetch: workspaceDocumentSaveFetch(requests, {
          privateBytes,
          publicBytes,
          unreferencedBytes,
        }),
        operationIds: ["op_document_save_00000001"],
        timestamps: [
          "2026-06-02T02:45:00.000Z",
          "2026-06-02T02:45:01.000Z",
          "2026-06-02T02:45:02.000Z",
          "2026-06-02T02:45:03.000Z",
          "2026-06-02T02:45:04.000Z",
        ],
      }),
    );

    await writeWorkspaceConfig(workspaceRoot);
    await writeLocalDevEnv(workspaceRoot);
    await scheduler.enqueue({
      source: "media-reference",
      storageIdentity: "app:reports",
      workspaceRoot,
    });
    await expect(scheduler.runNow(workspaceRoot)).resolves.toMatchObject({
      displayState: "saved",
      savedGeneration: 1,
    });

    await expect(stat(path.join(workspaceRoot, "state/media/manifest.json"))).rejects.toMatchObject(
      { code: "ENOENT" },
    );
    expect(requests.map((request) => new URL(request.url).pathname)).not.toEqual(
      expect.arrayContaining([
        "/api/app-installs/private-site/reports/snapshot",
        "/api/app-installs/private-site/reports/media/documents",
      ]),
    );
  });

  it("does not select installed-app uploads for current Program auto-save", async () => {
    const workspaceRoot = await makeTempDir();
    const mediaHarness = await createWorkerHarness(
      "src/cli/workspace-document-media-worker-test.ts",
      {},
      {
        compatibilityDate: FORMLESS_WORKER_COMPATIBILITY_DATE,
        r2Buckets: ["FORMLESS_MEDIA"],
      },
    );

    try {
      const upload = await uploadWorkspaceDocument(mediaHarness, "referenced-report.pdf");

      expect(upload.status).toBe(200);

      const uploaded = (await upload.json()) as {
        asset: ReturnType<typeof workspaceDocumentAsset>;
      };
      const referencedAsset = uploaded.asset;
      const bucket = await mediaHarness.mf.getR2Bucket("FORMLESS_MEDIA");

      await Promise.all(
        Array.from({ length: 50 }, (_, index) =>
          bucket.put(
            `media/program/documents/!decoy-${String(index).padStart(2, "0")}.pdf`,
            pdfBytesForWorkspace,
            {
              customMetadata: { decoy: String(index) },
              httpMetadata: { contentType: "application/pdf" },
            },
          ),
        ),
      );

      const list = await mediaHarness.fetch(
        "/api/formless/program/media/documents?entity=block&field=privateDocument",
      );

      expect(list.status).toBe(200);
      expect((await list.clone().json()) as unknown).toEqual({
        assets: expect.arrayContaining([
          expect.objectContaining({
            id: referencedAsset.id,
            storageKey: referencedAsset.storageKey,
          }),
        ]),
      });

      const scheduler = createDefaultWorkspaceAutoSaveScheduler(
        autoSaveDeps(workspaceRoot, {
          fetch: workspaceDocumentWorkerFetch(mediaHarness, referencedAsset.id),
          operationIds: ["op_r2_document_save_00000001"],
          timestamps: [
            "2026-06-02T02:46:00.000Z",
            "2026-06-02T02:46:01.000Z",
            "2026-06-02T02:46:02.000Z",
            "2026-06-02T02:46:03.000Z",
            "2026-06-02T02:46:04.000Z",
          ],
        }),
      );

      await writeWorkspaceConfig(workspaceRoot);
      await writeLocalDevEnv(workspaceRoot);
      await scheduler.enqueue({
        source: "media-reference",
        storageIdentity: "app:reports",
        workspaceRoot,
      });
      await expect(scheduler.runNow(workspaceRoot)).resolves.toMatchObject({
        displayState: "saved",
        savedGeneration: 1,
      });

      await expect(stat(path.join(workspaceRoot, "state/apps/reports.json"))).rejects.toMatchObject(
        {
          code: "ENOENT",
        },
      );
      await expect(
        stat(path.join(workspaceRoot, "state/media/manifest.json")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await mediaHarness.dispose();
    }
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
          source: "app-operation",
          storageIdentity: "app:site",
        },
      ),
      {
        error: new Error(`${workspaceRoot}/state failed FORMLESS_TOKEN=secret`),
        now: () => "2026-06-02T02:50:02.000Z",
        workspaceRoot,
      },
    );
    const deps = autoSaveDeps(workspaceRoot, {
      fetch: workspaceSaveFetch(requests, "site"),
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
      storageIdentities: [],
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
    packages: {
      links: [{ manifest: "packages/private-site/formless.app.json" }],
    },
    ...(extensions === undefined ? {} : { runtime: { extensions } }),
  });

  await writePrivateSitePackage(workspaceRoot);
  await writeFile(
    path.join(workspaceRoot, FORMLESS_CONFIG_FILE),
    formatTestFormlessConfigModule(config),
  );
}

async function writePrivateSitePackage(workspaceRoot: string) {
  const packageRoot = path.join(workspaceRoot, "packages/private-site");

  await mkdir(packageRoot, { recursive: true });
  await writeFile(path.join(packageRoot, "schema.json"), JSON.stringify(siteSourceSchema));
  await writeFile(
    path.join(packageRoot, "formless.app.json"),
    JSON.stringify({
      kind: "formless.appPackage",
      version: 1,
      packageAppKey: privateSitePackageAppKey,
      label: "Private Site",
      description: "Private Site test package.",
      defaultInstallId: "personal",
      supportsMultipleInstalls: true,
      packageRevision: rootKnownSitePackage.packageRevision,
      sourceSchema: {
        kind: "workspace",
        key: privateSitePackageAppKey,
        path: "schema.json",
      },
      sourceSchemaHash: privateSiteSourceSchemaHash,
      capabilities: [{ kind: "generatedAdmin", routeBase: "/apps" }],
    }),
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

function workspaceSaveFetch(requests: CapturedRequest[], installId: string): typeof fetch {
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

    if (parsedUrl.pathname === "/api/formless/app-installs") {
      return Response.json({
        installs: [installedSite(installId, "Site")],
        packages: listInstallableAppPackages(privateSitePackageResolver),
      });
    }

    if (parsedUrl.pathname === "/api/formless/program/snapshot") {
      return Response.json(controlPlaneSnapshot(gatewayControlPlaneRecords(installId)));
    }

    if (parsedUrl.pathname === `/api/app-installs/private-site/${installId}/snapshot`) {
      return Response.json(snapshot([], `app:${installId}`));
    }

    return Response.json({ error: "not found" }, { status: 404 });
  };
}

function workspaceDocumentSaveFetch(
  requests: CapturedRequest[],
  input: {
    privateBytes: Uint8Array;
    publicBytes: Uint8Array;
    unreferencedBytes: Uint8Array;
  },
): typeof fetch {
  const installId = "reports";
  const assets = [
    workspaceDocumentAsset(installId, "private-report.pdf", "private", input.privateBytes),
    workspaceDocumentAsset(installId, "public-report.pdf", "public", input.publicBytes),
    workspaceDocumentAsset(installId, "unreferenced.pdf", "public", input.unreferencedBytes),
  ];
  const bytesByAssetId = new Map([
    ["private-report.pdf", input.privateBytes],
    ["public-report.pdf", input.publicBytes],
    ["unreferenced.pdf", input.unreferencedBytes],
  ]);

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

    if (parsedUrl.pathname === "/api/formless/app-installs") {
      return Response.json({
        installs: [installedSite(installId, "Reports")],
        packages: listInstallableAppPackages(privateSitePackageResolver),
      });
    }

    if (parsedUrl.pathname === "/api/formless/program/snapshot") {
      return Response.json(controlPlaneSnapshot(gatewayControlPlaneRecords(installId)));
    }

    if (parsedUrl.pathname === `/api/app-installs/private-site/${installId}/snapshot`) {
      return Response.json({
        ...snapshot(
          [
            {
              createdAt: "2026-06-02T02:44:00.000Z",
              entity: "block",
              id: "documents",
              updatedAt: "2026-06-02T02:44:00.000Z",
              values: {
                privateDocument: "private-report.pdf",
                publicDocument: "public-report.pdf",
                type: "group",
              },
            },
          ],
          `app:${installId}`,
        ),
        schema: workspaceDocumentSchema(),
      });
    }

    if (parsedUrl.pathname === `/api/app-installs/private-site/${installId}/media/documents`) {
      const field = parsedUrl.searchParams.get("field");
      const access = field === "privateDocument" ? "private" : "public";

      return Response.json({ assets: assets.filter((asset) => asset.access === access) });
    }

    const deliveryMatch = parsedUrl.pathname.match(
      /^\/api\/app-installs\/private-site\/reports\/media\/documents\/([^/]+)$/,
    );

    if (deliveryMatch) {
      const assetId = deliveryMatch[1] ?? "";
      const bytes = bytesByAssetId.get(assetId);

      return bytes
        ? new Response(Buffer.from(bytes), {
            headers: { "content-type": "application/pdf" },
          })
        : Response.json({ error: "not found" }, { status: 404 });
    }

    return Response.json({ error: "not found" }, { status: 404 });
  };
}

function workspaceDocumentWorkerFetch(
  mediaHarness: Awaited<ReturnType<typeof createWorkerHarness>>,
  _referencedAssetId: string,
): typeof fetch {
  return async (url, init) => {
    const requestUrl =
      typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const parsedUrl = new URL(requestUrl);

    if (parsedUrl.pathname.startsWith("/api/formless/program/media/documents")) {
      return (await mediaHarness.fetch(`${parsedUrl.pathname}${parsedUrl.search}`, {
        headers: normalizeHeaders(init?.headers),
        method: init?.method,
      })) as unknown as Response;
    }

    if (parsedUrl.pathname === "/api/formless/program/snapshot") {
      return Response.json(controlPlaneSnapshot(gatewayControlPlaneRecords("reports")));
    }

    return Response.json({ error: "not found" }, { status: 404 });
  };
}

const pdfBytesForWorkspace = new TextEncoder().encode("%PDF-1.7\nworkspace R2 document");

async function uploadWorkspaceDocument(
  mediaHarness: Awaited<ReturnType<typeof createWorkerHarness>>,
  filename: string,
) {
  const boundary = `formless-workspace-${filename}`;
  const prefix = new TextEncoder().encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`,
  );
  const suffix = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(
    prefix.byteLength + pdfBytesForWorkspace.byteLength + suffix.byteLength,
  );

  body.set(prefix);
  body.set(pdfBytesForWorkspace, prefix.byteLength);
  body.set(suffix, prefix.byteLength + pdfBytesForWorkspace.byteLength);

  return mediaHarness.fetch(
    "/api/formless/program/media/documents?entity=block&field=privateDocument",
    {
      body,
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      method: "POST",
    },
  );
}

function installedSite(installId: string, label: string) {
  const facts = packageAppFactsForKey(privateSitePackageAppKey, privateSitePackageResolver);

  if (!facts) {
    throw new Error("Missing bundled package facts for site.");
  }

  return {
    adminRoute: `/apps/${installId}` as `/apps/${string}`,
    createdAt: "2026-05-01T00:00:00.000Z",
    installId,
    label,
    packageAppKey: privateSitePackageAppKey,
    packageRevision: facts.packageRevision,
    sourceSchemaHash: facts.sourceSchemaHash,
    status: "installed" as const,
    updatedAt: "2026-05-01T00:00:00.000Z",
  };
}

function snapshot(
  records: StoredRecord[],
  storageIdentity: `app:${string}` = "app:david",
): StorageSnapshot {
  return {
    exportedAt: "2026-05-12T02:00:00.000Z",
    kind: STORAGE_SNAPSHOT_KIND,
    records,
    schema: siteSourceSchema,
    schemaKey: privateSitePackageAppKey,
    schemaUpdatedAt: "2026-05-01T00:00:00.000Z",
    sourceCursor: 1,
    storageIdentity,
    version: STORAGE_SNAPSHOT_VERSION,
  };
}
function workspaceDocumentSchema() {
  const schema = structuredClone(siteSourceSchema);
  const block = schema.entities.find((definition) => definition.key === "block")!;
  if (!block) {
    throw new Error("Expected Site block schema.");
  }
  setKeyedDefinition(block.fields, "privateDocument", {
    asset: {
      acceptedMimeTypes: ["application/pdf"],
      access: "private",
      kind: "document",
      maxBytes: 1024 * 1024,
    },
    label: "Private document",
    required: false,
    type: "text",
  });
  setKeyedDefinition(block.fields, "publicDocument", {
    asset: {
      acceptedMimeTypes: ["application/pdf"],
      access: "public",
      kind: "document",
      maxBytes: 1024 * 1024,
    },
    label: "Public document",
    required: false,
    type: "text",
  });
  return schema;
}
function workspaceDocumentAsset(
  _installId: string,
  assetId: string,
  access: "private" | "public",
  bytes: Uint8Array,
) {
  const storageKey = `media/program/documents/${assetId}`;

  return {
    access,
    byteSize: bytes.byteLength,
    contentType: "application/pdf",
    deliveryHref: `/api/formless/program/media/documents/${assetId}`,
    filename: assetId,
    id: assetId,
    kind: "document",
    label: assetId,
    provider: "r2",
    status: "ready",
    storageKey,
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

function gatewayControlPlaneRecords(installId: string): StoredRecord[] {
  const now = "2026-05-26T00:00:00.000Z";

  return [
    {
      createdAt: now,
      updatedAt: now,
      entity: "app-install",
      id: installId,
      values: {
        installId,
        label: "Site",
        packageAppKey: privateSitePackageAppKey,
        status: "installed",
        storageIdentity: `app:${installId}`,
      },
    },
    {
      createdAt: now,
      updatedAt: now,
      entity: "route",
      id: `route:${installId}:admin`,
      values: {
        appInstall: installId,
        enabled: true,
        kind: "mount",
        matchPath: `/apps/${installId}`,
        surface: "admin",
        targetProfile: "app",
      },
    },
  ];
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  return Object.fromEntries(new Headers(headers).entries());
}
