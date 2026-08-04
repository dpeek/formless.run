import { describe, expect, it } from "vite-plus/test";
import type { WorkspaceGatewayPushPhaseObserver } from "@dpeek/formless-gateway";
import { WorkspaceGatewayPushExecutionError } from "@dpeek/formless-gateway/sidecar";
import {
  createWorkspaceGatewayPushHandler,
  type WorkspaceGatewayCredentialSetupAdapterResult,
  type WorkspaceGatewayPushAdapterDependencies,
} from "./workspace-gateway-operation-adapter.ts";
import type {
  PushFormlessInstanceWorkspaceCloudflareOAuthPreflightResult,
  PushFormlessInstanceWorkspaceResult,
} from "./instance-workspace-deployment.ts";

describe("workspace Gateway typed Push adapter", () => {
  it("invokes typed dry-run Push and reports the exact ordered phases", async () => {
    const phases: string[] = [];
    const pushed: unknown[] = [];
    const handler = createWorkspaceGatewayPushHandler(
      dependencies({
        push: async (input) => {
          pushed.push(input);
          return pushResult({ mode: "dry-run", noop: false });
        },
      }),
    );

    const result = await handler({
      authorization: { actor: "browser", via: "owner-session" },
      observer: observer(phases),
      push: { mode: "dry-run", targetAlias: "staging" },
      workspaceRoot: "/workspace/project",
    });

    expect(pushed).toEqual([
      {
        apply: false,
        targetAlias: "staging",
        workspacePath: "/workspace/project",
      },
    ]);
    expect(result).toEqual({ outcome: "planned" });
    expect(phases).toEqual([
      "start:credentials",
      "succeed:credentials",
      "skip:account-selection",
      "start:desired-state-plan",
      "succeed:desired-state-plan",
      "skip:provider-reconciliation",
      "skip:health-check",
      "skip:owner-setup",
      "start:workspace-push-writeback",
      "succeed:workspace-push-writeback",
      "skip:observation-refresh",
    ]);
  });

  it("continues credential setup with one listed account selection", async () => {
    const phases: string[] = [];
    const setupInputs: unknown[] = [];
    const handler = createWorkspaceGatewayPushHandler(
      dependencies({
        preflightPushCredential: async () => preflight({ needsSetup: true }),
        pushCredentialSetup: async (
          input,
        ): Promise<WorkspaceGatewayCredentialSetupAdapterResult> => {
          setupInputs.push(input);
          return input.accountId
            ? {
                account: {
                  id: input.accountId,
                  name: "Account A",
                  workersDevSubdomain: "example",
                },
                accountCount: 1,
                credentialRef: "formless-cloudflare-oauth:default",
                deploymentConfig: {
                  accountId: input.accountId,
                  targetId: "instance.primary",
                  targetUrl: "https://example.workers.dev",
                  workerName: "example",
                },
                kind: "ready",
                provider: "cloudflare",
                source: "oauth",
              }
            : {
                accounts: [{ id: "account-a", name: "Account A", workersDevSubdomain: "example" }],
                credentialRef: "formless-cloudflare-oauth:default",
                kind: "account-selection-required",
                provider: "cloudflare",
              };
        },
      }),
    );

    await handler({
      authorization: { actor: "browser", via: "owner-session" },
      observer: observer(phases, "account-a"),
      push: { mode: "dry-run" },
      workspaceRoot: "/workspace/project",
    });

    expect(setupInputs).toHaveLength(2);
    expect(setupInputs[1]).toMatchObject({ accountId: "account-a" });
    expect(phases.slice(0, 5)).toEqual([
      "start:credentials",
      "succeed:credentials",
      "start:account-selection",
      "accounts:account-a",
      "succeed:account-selection",
    ]);
  });

  it("preserves typed local failure cause while projecting a closed failure", async () => {
    const diagnostic = new Error("health probe included secret local diagnostics");
    const handler = createWorkspaceGatewayPushHandler(
      dependencies({
        push: async () => {
          throw diagnostic;
        },
      }),
    );

    const rejected = await handler({
      authorization: { actor: "browser", via: "owner-session" },
      observer: observer([]),
      push: { mode: "dry-run" },
      workspaceRoot: "/workspace/project",
    }).catch((error: unknown) => error);

    expect(rejected).toBeInstanceOf(WorkspaceGatewayPushExecutionError);
    if (!(rejected instanceof WorkspaceGatewayPushExecutionError)) {
      throw new Error("Expected typed Workspace Gateway Push failure.");
    }
    expect(rejected).toMatchObject({ code: "health-check-failed", phase: "health-check" });
    expect(rejected.cause).toBe(diagnostic);
    expect(JSON.stringify({ code: rejected.code, phase: rejected.phase })).not.toContain("secret");
  });
});

function dependencies(
  overrides: Partial<WorkspaceGatewayPushAdapterDependencies> = {},
): WorkspaceGatewayPushAdapterDependencies {
  return {
    accountDiscovery: { listAccounts: async () => [] },
    autoSaveScheduler: {
      enqueue: async () => undefined,
    },
    cwd: "/workspace/project",
    fetch: async () => Response.json({}),
    now: () => "2026-08-04T00:00:00.000Z",
    packageVersion: "0.0.0-test",
    preflightPushCredential: async () => preflight({ needsSetup: false }),
    push: async () => pushResult({ mode: "dry-run", noop: true }),
    ...overrides,
  };
}

function observer(events: string[], accountId = "account-a"): WorkspaceGatewayPushPhaseObserver {
  return {
    fail: (phase, code): never => {
      throw new WorkspaceGatewayPushExecutionError(code, phase);
    },
    requestAccountSelection: async (choices) => {
      events.push(`accounts:${choices.map((choice) => choice.id).join(",")}`);
      return accountId;
    },
    setExternalAuthorization: () => "interaction_1234567890abcdef",
    skip: (phase) => events.push(`skip:${phase}`),
    start: (phase) => events.push(`start:${phase}`),
    succeed: (phase) => events.push(`succeed:${phase}`),
  };
}

function preflight(
  overrides: Partial<PushFormlessInstanceWorkspaceCloudflareOAuthPreflightResult>,
): PushFormlessInstanceWorkspaceCloudflareOAuthPreflightResult {
  return {
    credentialId: "default",
    deploymentConfigId: "deployment-config-primary",
    needsSetup: false,
    selectedTarget: { alias: "primary", url: "https://example.workers.dev" },
    workspaceRoot: "/workspace/project",
    ...overrides,
  };
}

function pushResult(
  overrides: Pick<PushFormlessInstanceWorkspaceResult, "mode" | "noop">,
): PushFormlessInstanceWorkspaceResult {
  return {
    deploymentDisplay: {
      accountId: "account-a",
      providerFamily: "cloudflare",
      target: "primary",
      targetUrl: "https://example.workers.dev",
      workerName: "example",
      workersDevSubdomain: "example",
    },
    selectedTarget: { alias: "primary", url: "https://example.workers.dev" },
    source: { archivePath: "/workspace/project/archive.json", mediaCount: 0, recordCount: 0 },
    syncPlan: {} as PushFormlessInstanceWorkspaceResult["syncPlan"],
    workspaceRoot: "/workspace/project",
    ...overrides,
  };
}
