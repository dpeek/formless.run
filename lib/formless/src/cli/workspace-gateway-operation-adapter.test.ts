import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  initialWorkspaceAutoSaveState,
  nextWorkspaceAutoSaveSuppressedState,
  type WorkspaceAutoSaveState,
  type WorkspaceAutoSaveSuppressionReason,
  type WorkspaceOperationRequiredCapability,
} from "@dpeek/formless-workspace";
import {
  createWorkspaceOperationState,
  updateWorkspaceOperationState,
} from "@dpeek/formless-workspace/node";

import {
  createWorkspaceGatewayOperationHandlers,
  projectWorkspaceGatewayOperationDependencies,
  type WorkspaceGatewayOperationAdapterDependencies,
} from "./workspace-gateway-operation-adapter.ts";
import type { WorkspaceGatewayOperationAutoSaveScheduler } from "./workspace-gateway-auto-save.ts";
import { formlessProgramSchemaProvenance } from "../program/runtime.ts";

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

describe("workspace gateway operation adapter", () => {
  it("projects dry-run push dependencies without provider mutation dependencies", () => {
    const workspaceRoot = "/workspace/project";
    const deps = adapterDeps(workspaceRoot);
    const projected = projectWorkspaceGatewayOperationDependencies(
      deps,
      {
        dryRun: true,
        kind: "push",
        workspacePath: workspaceRoot,
      },
      workspaceRoot,
    );

    expect(projected.cwd).toBe(workspaceRoot);
    expect(projected.accountDiscovery).toBe(deps.accountDiscovery);
    expect(projected.env).toBe(deps.env);
    expect(projected.fetch).toBe(deps.fetch);
    expect(projected.now).toBe(deps.now);
    expect(projected.packageVersion).toBe(deps.packageVersion);
    expect(projected.deploymentAdapter).toBeUndefined();
    expect(projected.healthCheck).toBeUndefined();
    expect(projected.localSecretEnv).toBeUndefined();
    expect(projected.packageRoot).toBeUndefined();
    expect(projected.randomToken).toBeUndefined();
    expect(projected.setupCapability).toBeUndefined();
  });

  it("projects push apply dependencies required for provider reconciliation", () => {
    const workspaceRoot = "/workspace/project";
    const deps = adapterDeps(workspaceRoot);
    const projected = projectWorkspaceGatewayOperationDependencies(
      deps,
      {
        dryRun: false,
        kind: "push",
        workspacePath: workspaceRoot,
      },
      workspaceRoot,
    );

    expect(projected.accountDiscovery).toBe(deps.accountDiscovery);
    expect(projected.deploymentAdapter).toBe(deps.deploymentAdapter);
    expect(projected.healthCheck).toBe(deps.healthCheck);
    expect(projected.localSecretEnv).toBe(deps.localSecretEnv);
    expect(projected.packageRoot).toBe(deps.packageRoot);
    expect(projected.packageVersion).toBe(deps.packageVersion);
    expect(projected.randomToken).toBe(deps.randomToken);
    expect(projected.setupCapability).toBe(deps.setupCapability);
  });

  it("forwards actor, capabilities, and configured workspace root to the operation runner", async () => {
    const workspaceRoot = await makeTempDir();
    const scheduler = autoSaveScheduler();
    const credentialSetupInputs: Array<{
      accountId?: string;
      profileLabel?: string;
      provider: string;
      workspaceRoot: string;
    }> = [];
    const handlers = createWorkspaceGatewayOperationHandlers(
      adapterDeps(workspaceRoot, {
        autoSaveScheduler: scheduler.scheduler,
        credentialSetup: async (input) => {
          credentialSetupInputs.push({
            accountId: input.accountId,
            profileLabel: input.profileLabel,
            provider: input.provider,
            workspaceRoot: input.workspaceRoot,
          });

          return {
            result: {
              details: {
                raw: `FORMLESS_TOKEN=secret ${workspaceRoot}/state`,
              },
              summary: {
                fields: {
                  provider: input.provider,
                  selectedAccountId: input.accountId ?? "",
                  token: "FORMLESS_TOKEN=secret",
                  workspaceRoot: input.workspaceRoot,
                },
                title: "Credential setup ready",
              },
            },
            status: "succeeded",
          };
        },
        operationCapabilities: ["credential-setup"],
        operationIds: ["op_credential_adapter_00000001"],
      }),
    );

    const operation = await handlers.startOperation({
      authorization: { actor: "browser", via: "owner-session" },
      operationInput: {
        accountId: "acct_personal",
        kind: "credentialSetup",
        profileLabel: "personal",
        provider: "cloudflare",
      },
      request: new Request("http://local.test/api/formless/workspace-gateway/operations"),
      workspaceRoot,
    });
    const serialized = JSON.stringify(operation);

    expect(credentialSetupInputs).toEqual([
      {
        accountId: "acct_personal",
        profileLabel: "personal",
        provider: "cloudflare",
        workspaceRoot,
      },
    ]);
    expect(operation).toMatchObject({
      actor: "browser",
      id: "op_credential_adapter_00000001",
      input: {
        accountId: "acct_personal",
        profileLabel: "personal",
        provider: "cloudflare",
      },
      operation: "credentialSetup",
      status: "succeeded",
    });
    expect(serialized).not.toContain(workspaceRoot);
    expect(serialized).not.toContain("secret");
    expect(scheduler.suppressed).toEqual(["gateway-operation-state"]);
  });

  it("reads operation ids from only the configured workspace root", async () => {
    const workspaceRoot = await makeTempDir();
    const otherWorkspaceRoot = await makeTempDir();
    const handlers = createWorkspaceGatewayOperationHandlers(
      adapterDeps(workspaceRoot, {
        operationCapabilities: ["credential-setup"],
        operationIds: ["op_scoped_adapter_00000001"],
      }),
    );

    await handlers.startOperation({
      authorization: { actor: "browser", via: "owner-session" },
      operationInput: { kind: "credentialSetup", provider: "cloudflare" },
      request: new Request("http://local.test/api/formless/workspace-gateway/operations"),
      workspaceRoot,
    });

    await expect(
      handlers.readOperation({
        authorization: { actor: "browser", via: "owner-session" },
        operationId: "op_scoped_adapter_00000001",
        request: new Request(
          "http://local.test/api/formless/workspace-gateway/operations/op_scoped_adapter_00000001",
        ),
        workspaceRoot,
      }),
    ).resolves.toMatchObject({
      id: "op_scoped_adapter_00000001",
      operation: "credentialSetup",
    });
    await expect(
      handlers.readOperation({
        authorization: { actor: "browser", via: "owner-session" },
        operationId: "op_scoped_adapter_00000001",
        request: new Request(
          "http://local.test/api/formless/workspace-gateway/operations/op_scoped_adapter_00000001",
        ),
        workspaceRoot: otherWorkspaceRoot,
      }),
    ).resolves.toBeUndefined();
  });

  it("filters stored non-gateway operation state from gateway reads", async () => {
    const workspaceRoot = await makeTempDir();
    const handlers = createWorkspaceGatewayOperationHandlers(adapterDeps(workspaceRoot));
    const operation = await createWorkspaceOperationState({
      actor: "cli",
      id: "op_init_not_gateway",
      input: {},
      now: () => "2026-06-02T01:00:00.000Z",
      operation: "init",
      workspaceRoot,
    });

    await updateWorkspaceOperationState(operation.id, {
      logs: [
        {
          at: "2026-06-02T01:00:01.000Z",
          level: "info",
          message: "init completed.",
        },
      ],
      status: "succeeded",
      summary: {
        fields: {},
        title: "Workspace initialized",
      },
      workspaceRoot,
    });

    await expect(
      handlers.readOperation({
        authorization: { actor: "browser", via: "owner-session" },
        operationId: operation.id,
        request: new Request(
          "http://local.test/api/formless/workspace-gateway/operations/op_init_not_gateway",
        ),
        workspaceRoot,
      }),
    ).resolves.toBeUndefined();
  });

  it("forwards capability restrictions to the operation runner", async () => {
    const workspaceRoot = await makeTempDir();
    const handlers = createWorkspaceGatewayOperationHandlers(
      adapterDeps(workspaceRoot, {
        operationCapabilities: ["workspace-read"],
      }),
    );

    await expect(
      handlers.startOperation({
        authorization: { actor: "browser", via: "owner-session" },
        operationInput: { kind: "credentialSetup", provider: "cloudflare" },
        request: new Request("http://local.test/api/formless/workspace-gateway/operations"),
        workspaceRoot,
      }),
    ).rejects.toThrow(
      'Workspace operation "credentialSetup" requires execution capability "credential-setup".',
    );
  });
});

function adapterDeps(
  workspaceRoot: string,
  options: {
    autoSaveScheduler?: WorkspaceGatewayOperationAutoSaveScheduler;
    credentialSetup?: WorkspaceGatewayOperationAdapterDependencies["credentialSetup"];
    operationCapabilities?: readonly WorkspaceOperationRequiredCapability[];
    operationIds?: string[];
  } = {},
): WorkspaceGatewayOperationAdapterDependencies {
  const operationIds = [...(options.operationIds ?? [])];

  return {
    accountDiscovery: {
      listAccounts: async () => [{ id: "account-123", workersDevSubdomain: "dpeek" }],
    },
    autoSaveScheduler: options.autoSaveScheduler ?? autoSaveScheduler().scheduler,
    createOperationId: () => operationIds.shift() ?? "op_adapter_00000001",
    credentialSetup:
      options.credentialSetup ??
      (async (input) => ({
        result: {
          summary: {
            fields: { provider: input.provider },
            title: "Credential setup ready",
          },
        },
        status: "succeeded",
      })),
    cwd: workspaceRoot,
    deploymentAdapter: {
      deploy: async (input: {
        plan: {
          expectedUrl: {
            url: string;
          };
        };
      }) => ({
        url: input.plan.expectedUrl.url,
      }),
    },
    env: { FORMLESS_ADMIN_TOKEN: "admin-token" },
    fetch: async () => Response.json({ ok: true }),
    healthCheck: {
      check: async (input) => ({
        cacheControl: "no-store",
        metadataUrl: new URL("/api/formless/deploy", `${input.url}/`).toString(),
        packageVersion: input.expectedVersion,
        runtimeProtocolVersion: 1,
        schemaProvenance: formlessProgramSchemaProvenance,
        storageMigrationSet: "formless-storage-migrations:v1",
        url: input.url,
        version: input.expectedVersion,
      }),
    },
    localSecretEnv: {
      ensure: async (input: { root: string }) => ({
        created: false,
        path: path.join(input.root, "deploy.env"),
        secrets: { ALCHEMY_PASSWORD: "alchemy-password" },
      }),
    },
    now: timestampSequence(
      "2026-06-02T01:00:00.000Z",
      "2026-06-02T01:00:01.000Z",
      "2026-06-02T01:00:02.000Z",
      "2026-06-02T01:00:03.000Z",
    ),
    operationCapabilities: options.operationCapabilities,
    packageRoot: "/package/root",
    packageVersion: "0.0.0-test",
    randomToken: () => "random-token",
    setupCapability: {
      create: async (input: { deploymentUrl: string }) => ({
        capabilityCreated: true,
        endpointUrl: new URL(
          "/api/formless/setup/capability",
          `${input.deploymentUrl}/`,
        ).toString(),
        setupComplete: false,
      }),
    },
  };
}

function autoSaveScheduler(): {
  scheduler: WorkspaceGatewayOperationAutoSaveScheduler;
  suppressed: WorkspaceAutoSaveSuppressionReason[];
} {
  const now = () => "2026-06-02T01:00:00.000Z";
  let state: WorkspaceAutoSaveState = initialWorkspaceAutoSaveState({ now });
  const suppressed: WorkspaceAutoSaveSuppressionReason[] = [];

  return {
    scheduler: {
      enqueue: async () => state,
      recordGatewayOperationStateSuppressed: async (input) =>
        recordSuppressed(input.workspaceRoot, "gateway-operation-state"),
      recordWorkspaceOperationSuppressed: async (input) => {
        switch (input.operationInput.kind) {
          case "check":
          case "status":
            return recordSuppressed(input.workspaceRoot, "workspace-check-status");
          case "push":
            return recordSuppressed(input.workspaceRoot, "push-deploy-remote-apply");
          case "pull":
            return recordSuppressed(input.workspaceRoot, "workspace-pull");
          case "save":
            return recordSuppressed(
              input.workspaceRoot,
              input.operationInput.check ? "workspace-check-status" : "manual-save",
            );
          case "credentialSetup":
            return undefined;
        }
      },
      status: async () => state,
    },
    suppressed,
  };

  async function recordSuppressed(
    workspaceRoot: string,
    reason: WorkspaceAutoSaveSuppressionReason,
  ): Promise<WorkspaceAutoSaveState> {
    expect(workspaceRoot).toBeTruthy();
    suppressed.push(reason);
    state = nextWorkspaceAutoSaveSuppressedState(state, {
      now,
      reason,
    });

    return state;
  }
}

function timestampSequence(...timestamps: string[]): () => string {
  let index = 0;

  return () =>
    timestamps[index++ % timestamps.length] ?? timestamps.at(-1) ?? new Date(0).toISOString();
}

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "formless-gateway-operation-adapter-test-"));

  tempDirs.push(tempDir);
  return tempDir;
}
