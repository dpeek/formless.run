import { describe, expect, it } from "vite-plus/test";
import type { WorkspaceGatewayPush } from "@dpeek/formless-gateway/client";
import {
  executeWorkspaceGatewayGeneratedOperation,
  workspaceGatewayPushGeneratedProgress,
  workspaceGatewayPushGeneratedRuntimeAdapterResponse,
  workspaceGatewayPushStartInputFromGeneratedOperation,
} from "./workspace-operation-runtime.ts";
import type {
  GeneratedOperationControlBinding,
  GeneratedOperationProgress,
} from "./operation-control-model.ts";

describe("workspace Push generated runtime adapter", () => {
  it("projects only mode and optional target alias from generated input", () => {
    expect(
      workspaceGatewayPushStartInputFromGeneratedOperation(
        request({
          dryRun: true,
          providerToken: "secret-provider-token",
          targetAlias: "instance.primary",
          workspacePath: "/Users/example/project",
        }),
      ),
    ).toEqual({ mode: "dry-run", targetAlias: "instance.primary" });
  });

  it("starts and polls the exact Push resource", async () => {
    const calls: Array<{ body?: unknown; method?: string; url: string }> = [];
    const reported: GeneratedOperationProgress[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({
        body: requestJsonBody(init?.body),
        method: init?.method,
        url: requestUrl(input),
      });
      return calls.length === 1
        ? Response.json({ push: push("running") })
        : Response.json({ push: succeededPush("applied") });
    };

    const response = await executeWorkspaceGatewayGeneratedOperation(
      request({ dryRun: false }, reported),
      {
        config: { apiBasePath: "/api/formless/workspace" },
        csrfToken: "csrf-token",
        fetcher,
        wait: async () => undefined,
      },
    );

    expect(calls).toEqual([
      {
        body: { mode: "apply" },
        method: "POST",
        url: "/api/formless/workspace/pushes",
      },
      {
        body: undefined,
        method: undefined,
        url: "/api/formless/workspace/pushes/push_1234567890abcdef",
      },
    ]);
    expect(reported).toHaveLength(2);
    expect(response).toMatchObject({
      displayMessage: "Workspace Push applied.",
      status: "committed",
    });
  });

  it("maps transport codes and caught failures to fixed Formless copy", async () => {
    await expect(
      executeWorkspaceGatewayGeneratedOperation(request({}), {
        config: { apiBasePath: "/api/formless/workspace" },
        fetcher: async () => Response.json({ code: "push-active" }, { status: 409 }),
      }),
    ).resolves.toEqual({
      displayError: "A workspace push is already running.",
      status: "failed",
    });

    const response = await executeWorkspaceGatewayGeneratedOperation(request({}), {
      config: { apiBasePath: "/api/formless/workspace" },
      fetcher: async () => {
        throw new Error("provider diagnostic alchemy-secret-value");
      },
    });

    expect(response).toEqual({ displayError: "Workspace Push failed.", status: "failed" });
    expect(JSON.stringify(response)).not.toContain("alchemy-secret-value");
  });

  it("submits only a listed account through the current interaction", async () => {
    const calls: Array<{ body?: unknown; url: string }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({ body: requestJsonBody(init?.body), url: requestUrl(input) });
      return calls.length === 1
        ? Response.json({ push: accountSelectionPush() })
        : Response.json({ push: succeededPush("applied") });
    };

    const response = await executeWorkspaceGatewayGeneratedOperation(request({}), {
      config: { apiBasePath: "/api/formless/workspace" },
      csrfToken: "csrf-token",
      fetcher,
      selectAccount: async (interaction) => interaction.choices[0]!.id,
      wait: async () => undefined,
    });

    expect(calls[1]).toEqual({
      body: { accountId: "account-a", kind: "account-selection" },
      url: "/api/formless/workspace/pushes/push_1234567890abcdef/interactions/interaction_1234567890abcdef",
    });
    expect(response.status).toBe("committed");
  });

  it("uses fixed progress, outcome, and failure copy without diagnostic data", () => {
    const failed = {
      ...push("running"),
      failureCode: "health-check-failed",
      lifecycle: "failed",
      phases: phaseIds().map((id) => ({
        id,
        status: id === "health-check" ? "failed" : id === "credentials" ? "succeeded" : "pending",
      })),
    } as WorkspaceGatewayPush;
    const progress = workspaceGatewayPushGeneratedProgress(failed);
    const response = workspaceGatewayPushGeneratedRuntimeAdapterResponse(failed);

    expect(progress.steps.find((step) => step.id === "health-check")).toEqual({
      id: "health-check",
      label: "Check deployed runtime",
      status: "failed",
    });
    expect(response).toMatchObject({
      displayError: "The deployed runtime did not pass its health check.",
      status: "failed",
    });
    expect(JSON.stringify({ progress, response })).not.toContain("secret");
  });
});

function request(input: Record<string, unknown>, reported: GeneratedOperationProgress[] = []) {
  return {
    binding: workspaceBinding(),
    callerInput: { bindingId: "workspace-push", input, source: "button" as const },
    input,
    reportProgress: (progress: GeneratedOperationProgress) => reported.push(progress),
    source: { surface: "button" as const },
  };
}

function workspaceBinding(): GeneratedOperationControlBinding {
  return {
    availability: { state: "enabled" },
    canonicalOperationKey: "workspace.source.push",
    executionKey: "workspace.source.push",
    id: "workspace-push",
    input: {
      bootstrapAllowed: false,
      inputFields: ["dryRun", "targetAlias"],
      kind: "workspace",
      mode: "write",
      operationKind: "push",
      requiredCapability: "workspace-source-sync",
    },
    kind: "workspace",
    label: "Push",
    operationName: "workspace.source.push",
    scope: "workspace",
    visualIntent: "default",
  };
}

function push(lifecycle: "queued" | "running"): WorkspaceGatewayPush {
  return {
    createdAt: "2026-08-04T00:00:00.000Z",
    id: "push_1234567890abcdef",
    lifecycle,
    mode: "apply",
    phases: phaseIds().map((id, index) => ({
      id,
      status: index === 0 ? "running" : "pending",
    })),
    updatedAt: "2026-08-04T00:00:01.000Z",
  };
}

function succeededPush(outcome: "applied" | "planned" | "up-to-date"): WorkspaceGatewayPush {
  return {
    ...push("running"),
    lifecycle: "succeeded",
    outcome,
    phases: phaseIds().map((id) => ({ id, status: "succeeded" })),
  };
}

function accountSelectionPush(): WorkspaceGatewayPush {
  return {
    ...push("running"),
    interaction: {
      choices: [{ id: "account-a", name: "Account A" }],
      expiresAt: "2026-08-04T00:05:00.000Z",
      id: "interaction_1234567890abcdef",
      kind: "account-selection",
      provider: "cloudflare",
    },
    lifecycle: "waiting-for-interaction",
  };
}

function phaseIds() {
  return [
    "credentials",
    "account-selection",
    "desired-state-plan",
    "provider-reconciliation",
    "health-check",
    "owner-setup",
    "workspace-push-writeback",
    "observation-refresh",
  ] as const;
}

function requestJsonBody(body: BodyInit | null | undefined): unknown {
  return typeof body === "string" ? JSON.parse(body) : undefined;
}

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
}
