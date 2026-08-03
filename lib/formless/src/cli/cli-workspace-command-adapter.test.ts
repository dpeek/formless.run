import { describe, expect, it } from "vite-plus/test";

import type {
  PushFormlessInstanceWorkspaceInput,
  PushFormlessInstanceWorkspaceResult,
} from "./instance-workspace-deployment.ts";
import type {
  FormlessInstanceWorkspaceSyncPlan,
  PullFormlessInstanceWorkspaceInput,
  PullFormlessInstanceWorkspaceResult,
} from "./instance-workspace-source-sync.ts";
import {
  formlessCliWorkspaceSourceSyncInputForParsedCommand,
  runFormlessCliWorkspacePullCommand,
  runFormlessCliWorkspacePushCommand,
} from "./cli-workspace-command-adapter.ts";

describe("CLI workspace command adapter", () => {
  it("translates parsed pull and push commands through their CLI bindings", () => {
    expect(
      formlessCliWorkspaceSourceSyncInputForParsedCommand({
        dryRun: true,
        kind: "workspacePull",
        targetAlias: "staging",
        workspacePath: "../personal",
      }),
    ).toEqual({
      commandName: "formless pull",
      input: {
        dryRun: true,
        targetAlias: "staging",
        workspacePath: "../personal",
      },
      operationKind: "pull",
    });

    expect(
      formlessCliWorkspaceSourceSyncInputForParsedCommand({
        dryRun: true,
        force: true,
        kind: "workspacePush",
        targetAlias: "production",
        workspacePath: "../personal",
      }),
    ).toEqual({
      commandName: "formless push",
      input: {
        apply: false,
        force: true,
        targetAlias: "production",
        workspacePath: "../personal",
      },
      operationKind: "push",
    });
  });

  it("omits unselected optional typed inputs", () => {
    expect(
      formlessCliWorkspaceSourceSyncInputForParsedCommand({
        dryRun: false,
        kind: "workspacePull",
        targetAlias: null,
        workspacePath: null,
      }),
    ).toEqual({
      commandName: "formless pull",
      input: {
        dryRun: false,
        targetAlias: null,
      },
      operationKind: "pull",
    });
    expect(
      formlessCliWorkspaceSourceSyncInputForParsedCommand({
        dryRun: false,
        force: false,
        kind: "workspacePush",
        targetAlias: null,
        workspacePath: null,
      }),
    ).toEqual({
      commandName: "formless push",
      input: {
        apply: true,
        targetAlias: null,
      },
      operationKind: "push",
    });
  });

  it("invokes typed pull directly with pull-only dependencies", async () => {
    const calls: Array<{
      dependencies: Record<string, unknown>;
      input: PullFormlessInstanceWorkspaceInput;
    }> = [];
    const result = pullResult({ noop: true });
    const output = await runFormlessCliWorkspacePullCommand(
      {
        dryRun: false,
        kind: "workspacePull",
        targetAlias: "staging",
        workspacePath: "../personal",
      },
      {
        cwd: "/workspace",
        env: { FORMLESS_ADMIN_TOKEN: "secret" },
        fetch,
        now: () => "2026-06-25T00:00:00.000Z",
        pullWorkspace: async (input, dependencies) => {
          calls.push({ dependencies, input });
          return result;
        },
      },
    );

    expect(calls).toEqual([
      {
        dependencies: {
          cwd: "/workspace",
          env: { FORMLESS_ADMIN_TOKEN: "secret" },
          fetch,
          now: expect.any(Function),
        },
        input: {
          dryRun: false,
          targetAlias: "staging",
          workspacePath: "../personal",
        },
      },
    ]);
    expect(output).toBe("Everything up to date.");
  });

  it("invokes typed push dry-run without provider mutation dependencies", async () => {
    const calls: Array<{
      dependencyKeys: string[];
      input: PushFormlessInstanceWorkspaceInput;
    }> = [];
    const output = await runFormlessCliWorkspacePushCommand(
      {
        dryRun: true,
        force: true,
        kind: "workspacePush",
        targetAlias: "production",
        workspacePath: "../personal",
      },
      {
        accountDiscovery: {
          listAccounts: async () => [],
        },
        cwd: "/workspace",
        fetch,
        now: () => "2026-06-25T00:00:00.000Z",
        packageVersion: "0.0.0-test",
        pushWorkspace: async (input, dependencies) => {
          calls.push({ dependencyKeys: Object.keys(dependencies).sort(), input });
          return pushResult({ noop: true });
        },
      },
    );

    expect(calls).toEqual([
      {
        dependencyKeys: ["accountDiscovery", "cwd", "fetch", "now", "packageVersion"],
        input: {
          apply: false,
          force: true,
          targetAlias: "production",
          workspacePath: "../personal",
        },
      },
    ]);
    expect(output).toBe("Everything up to date.");
  });

  it("requires provider mutation dependencies only for push apply", async () => {
    await expect(
      runFormlessCliWorkspacePushCommand(
        {
          dryRun: false,
          force: false,
          kind: "workspacePush",
          targetAlias: null,
          workspacePath: null,
        },
        {
          accountDiscovery: { listAccounts: async () => [] },
          cwd: "/workspace",
          fetch,
          now: () => "2026-06-25T00:00:00.000Z",
          packageVersion: "0.0.0-test",
        },
      ),
    ).rejects.toThrow(
      "Formless CLI push requires dependencies: deploymentAdapter, healthCheck, localSecretEnv, packageRoot, randomToken, setupCapability.",
    );
  });

  it("preserves typed source-sync exceptions", async () => {
    const failure = new Error("Remote source failed at /workspace/state/instance.json.");
    let thrown: unknown;

    try {
      await runFormlessCliWorkspacePullCommand(
        {
          dryRun: false,
          kind: "workspacePull",
          targetAlias: null,
          workspacePath: null,
        },
        {
          cwd: "/workspace",
          fetch,
          now: () => "2026-06-25T00:00:00.000Z",
          pullWorkspace: async () => {
            throw failure;
          },
        },
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(failure);
  });
});

function pullResult(
  overrides: Partial<PullFormlessInstanceWorkspaceResult> = {},
): PullFormlessInstanceWorkspaceResult {
  return {
    domains: [],
    instanceState: {
      mediaCount: 0,
      recordCount: 4,
      statePath: "/workspace/state/instance.json",
    },
    mode: "apply",
    noop: false,
    replacement: {
      changedStatePaths: [],
      prunedStatePaths: [],
      status: "no-changes",
    },
    selectedTarget: {
      alias: "instance.primary",
      url: "https://personal.dpeek.workers.dev",
    },
    syncPlan: sourceSyncPlan(),
    workspaceRoot: "/workspace",
    ...overrides,
  };
}

function pushResult(
  overrides: Partial<PushFormlessInstanceWorkspaceResult> = {},
): PushFormlessInstanceWorkspaceResult {
  return {
    deploymentDisplay: {
      accountId: "account-123",
      providerFamily: "cloudflare",
      target: "instance.primary",
      targetUrl: "https://personal.dpeek.workers.dev",
      workerName: "personal",
      workersDevSubdomain: "dpeek",
    },
    mode: "dry-run",
    noop: false,
    selectedTarget: {
      alias: "instance.primary",
      url: "https://personal.dpeek.workers.dev",
    },
    source: {
      archivePath: "/workspace/.formless/tmp/archive",
      mediaCount: 0,
      recordCount: 4,
    },
    syncPlan: sourceSyncPlan(),
    workspaceRoot: "/workspace",
    ...overrides,
  };
}

function sourceSyncPlan(): FormlessInstanceWorkspaceSyncPlan {
  return {
    changedAreas: [],
    changedDomainCount: 0,
    changedMedia: [],
    changedRecords: [],
    changedStatePaths: [],
    domainDesiredDrift: [],
    source: {
      domainCount: 0,
      fingerprint: "source-fingerprint",
      label: "workspace",
      mediaCount: 0,
      recordCount: 4,
    },
    status: "up-to-date",
    target: {
      domainCount: 0,
      fingerprint: "target-fingerprint",
      label: "instance.primary",
      mediaCount: 0,
      recordCount: 4,
    },
  };
}
