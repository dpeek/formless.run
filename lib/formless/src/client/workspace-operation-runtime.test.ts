import { describe, expect, it } from "vite-plus/test";
import type { WorkspaceGatewayOperation } from "@dpeek/formless-gateway/client";

import {
  executeWorkspaceGatewayGeneratedOperation,
  workspaceGatewayOperationGeneratedProgress,
  workspaceGatewayOperationGeneratedRuntimeAdapterResponse,
  workspaceGatewayStartInputFromGeneratedOperation,
} from "./workspace-operation-runtime.ts";
import type {
  GeneratedOperationControlBinding,
  GeneratedOperationProgress,
} from "./operation-control-model.ts";

describe("workspace operation generated runtime adapter", () => {
  it("builds push gateway start input from definition-declared generated fields", () => {
    expect(
      workspaceGatewayStartInputFromGeneratedOperation({
        binding: workspaceBinding(),
        callerInput: {
          bindingId: "workspace-push",
          input: {
            dryRun: false,
            providerToken: "secret-provider-token",
            targetAlias: "instance.primary",
            workspacePath: "/Users/dpeek/project",
          },
          source: "button",
        },
        input: {
          dryRun: false,
          providerToken: "secret-provider-token",
          targetAlias: "instance.primary",
          workspacePath: "/Users/dpeek/project",
        },
        reportProgress: () => {},
        source: { surface: "button" },
      }),
    ).toEqual({
      dryRun: false,
      kind: "push",
      targetAlias: "instance.primary",
    });
  });
  it("starts push through the gateway client and reports polled generated progress", async () => {
    const calls: Array<{
      body?: unknown;
      method?: string;
      url: string;
    }> = [];
    const reported: GeneratedOperationProgress[] = [];
    const running = workspaceOperation({
      status: "running",
      steps: [
        { id: "sync-plan", label: "Plan workspace source", status: "succeeded" },
        { id: "provider", label: "Provider reconciliation", status: "running" },
        { id: "health", label: "Health check", status: "pending" },
      ],
      summary: {
        fields: { noop: false },
        title: "Workspace push running",
      },
      updatedAt: "2026-06-02T00:00:01.000Z",
    });
    const succeeded = workspaceOperation({
      status: "succeeded",
      steps: [
        { id: "sync-plan", label: "Plan workspace source", status: "succeeded" },
        { id: "provider", label: "Provider reconciliation", status: "succeeded" },
        { id: "health", label: "Health check", status: "succeeded" },
      ],
      summary: {
        fields: { noop: false },
        title: "Workspace push applied",
      },
      updatedAt: "2026-06-02T00:00:02.000Z",
    });
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({
        body: requestJsonBody(init?.body),
        method: init?.method,
        url: requestUrl(input),
      });

      return Response.json({
        csrfToken: "csrf-token",
        operation: calls.length === 1 ? running : succeeded,
      });
    };

    const response = await executeWorkspaceGatewayGeneratedOperation(
      {
        binding: workspaceBinding(),
        callerInput: {
          bindingId: "workspace-push",
          input: { dryRun: false, providerToken: "secret-provider-token" },
          source: "button",
        },
        input: { dryRun: false, providerToken: "secret-provider-token" },
        reportProgress: (progress) => reported.push(progress),
        source: { surface: "button" },
      },
      {
        config: { apiBasePath: "/api/formless/workspace" },
        csrfToken: "csrf-token",
        fetcher,
        wait: async () => {},
      },
    );

    expect(calls).toEqual([
      {
        body: { dryRun: false, kind: "push" },
        method: "POST",
        url: "/api/formless/workspace/operations",
      },
      {
        body: undefined,
        method: undefined,
        url: "/api/formless/workspace/operations/op_push_00000001",
      },
    ]);
    expect(reported).toHaveLength(2);
    expect(reported[0]).toMatchObject({
      title: "Workspace push running",
      steps: [
        { id: "sync-plan", label: "Plan workspace source", status: "succeeded" },
        { id: "provider", label: "Provider reconciliation", status: "running" },
        { id: "health", label: "Health check", status: "pending" },
      ],
    });
    expect(response).toMatchObject({
      status: "committed",
      displayMessage: "Workspace push applied.",
      output: {
        operationId: "op_push_00000001",
        operationKind: "push",
        status: "succeeded",
      },
    });
  });

  it("maps display-safe push progress and replayed results without gateway internals", () => {
    const operation = workspaceOperation({
      input: {
        proxyToken: "sidecar-proxy-token",
      },
      logs: [
        {
          at: "2026-06-02T00:00:01.000Z",
          id: "log-1",
          level: "info",
          message:
            'Raw deploy log at /Users/dpeek/project with CLOUDFLARE_API_TOKEN="secret-token".',
        },
      ],
      result: {
        deployment: {
          providerToken: "secret-provider-token",
          rawAdapterOutput: "raw provider payload",
        },
        summary: {
          fields: {
            noop: true,
            proxyToken: "sidecar-proxy-token",
          },
          title: "Workspace push applied",
        },
      },
      status: "succeeded",
      steps: [
        {
          fields: { providerToken: "secret-provider-token" },
          id: "sync-plan",
          label: "Plan workspace source",
          status: "succeeded",
        },
        {
          detail: "Provider state already matches the workspace source.",
          fields: { proxyToken: "sidecar-proxy-token" },
          id: "provider",
          label: "Provider reconciliation",
          status: "skipped",
        },
      ],
      summary: {
        fields: {
          noop: true,
          proxyToken: "sidecar-proxy-token",
        },
        title: "Workspace push applied",
      },
    });

    const progress = workspaceGatewayOperationGeneratedProgress(operation);
    const response = workspaceGatewayOperationGeneratedRuntimeAdapterResponse(operation);
    const serialized = JSON.stringify({ progress, response });

    expect(progress).toEqual({
      title: "Workspace push applied",
      updatedAt: Date.parse("2026-06-02T00:00:00.000Z"),
      steps: [
        { id: "sync-plan", label: "Plan workspace source", status: "succeeded" },
        {
          id: "provider",
          label: "Provider reconciliation",
          detail: "Provider state already matches the workspace source.",
          status: "skipped",
        },
      ],
    });
    expect(response).toMatchObject({
      status: "replayed",
      displayMessage: "Workspace source push already applied.",
    });
    expect(serialized).not.toContain("secret-provider-token");
    expect(serialized).not.toContain("sidecar-proxy-token");
    expect(serialized).not.toContain("raw provider payload");
    expect(serialized).not.toContain("Raw deploy log");
    expect(serialized).not.toContain("/Users/dpeek");
  });

  it("maps failed push state to concise display-safe failure feedback", () => {
    const operation = workspaceOperation({
      errors: [
        {
          at: "2026-06-02T00:00:02.000Z",
          message: "Health check failed with TOKEN=[redacted] at <workspace>/deploy.",
        },
      ],
      logs: [
        {
          at: "2026-06-02T00:00:01.000Z",
          id: "log-1",
          level: "error",
          message:
            'Provider output at /Users/dpeek/project with CLOUDFLARE_API_TOKEN="secret-token".',
        },
      ],
      result: {
        deployment: {
          providerToken: "secret-provider-token",
        },
        summary: {
          fields: { proxyToken: "sidecar-proxy-token" },
          title: "Workspace push failed",
        },
      },
      status: "failed",
      steps: [
        { id: "sync-plan", label: "Plan workspace source", status: "succeeded" },
        {
          error: "Health check failed with TOKEN=[redacted].",
          fields: { providerToken: "secret-provider-token" },
          id: "health",
          label: "Health check",
          status: "failed",
        },
      ],
      summary: {
        fields: { workspacePath: "/Users/dpeek/project" },
        title: "Workspace push failed",
      },
    });

    const response = workspaceGatewayOperationGeneratedRuntimeAdapterResponse(operation);
    const serialized = JSON.stringify(response);

    expect(response).toMatchObject({
      status: "failed",
      displayError: "Health check failed with TOKEN=[redacted] at <workspace>/deploy.",
      progress: {
        detail: "Health check failed with TOKEN=[redacted].",
        steps: [
          { id: "sync-plan", label: "Plan workspace source", status: "succeeded" },
          {
            detail: "Health check failed with TOKEN=[redacted].",
            id: "health",
            label: "Health check",
            status: "failed",
          },
        ],
      },
    });
    expect(serialized).not.toContain("secret-provider-token");
    expect(serialized).not.toContain("sidecar-proxy-token");
    expect(serialized).not.toContain("Provider output");
    expect(serialized).not.toContain("/Users/dpeek");
  });
});

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

function workspaceOperation(
  overrides: Partial<WorkspaceGatewayOperation> = {},
): WorkspaceGatewayOperation {
  return {
    actor: "browser",
    createdAt: "2026-06-02T00:00:00.000Z",
    errors: [],
    events: [],
    id: "op_push_00000001",
    input: {},
    kind: "formless.workspaceOperation",
    logs: [],
    operation: "push",
    status: "running",
    summary: {
      fields: {},
      title: "Workspace push running",
    },
    updatedAt: "2026-06-02T00:00:00.000Z",
    version: 1,
    workspace: {
      label: "personal-sites",
    },
    ...overrides,
  };
}

function requestJsonBody(body: BodyInit | null | undefined): unknown {
  return typeof body === "string" ? JSON.parse(body) : undefined;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}
