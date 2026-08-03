import { describe, expect, it } from "vite-plus/test";
import {
  WorkspaceGatewayApiError,
  enqueueWorkspaceGatewayAutoSave,
  fetchWorkspaceGatewayOperation,
  fetchWorkspaceGatewayStatus,
  startWorkspaceGatewayOperation,
  workspaceGatewayBrowserConfig,
  type WorkspaceGatewayOperation,
} from "./client.ts";
import { workspaceGatewayErrorResponse } from "./response-safety.ts";

const config = {
  apiBasePath: "/api/formless/workspace",
  bootstrapToken: "bootstrap-token",
};

describe("gateway package client helpers", () => {
  it("resolves browser config only when the local gateway API is present", () => {
    expect(
      workspaceGatewayBrowserConfig({
        FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN: "sidecar-proxy-token",
        FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL: "http://127.0.0.1:7777",
        VITE_FORMLESS_WORKSPACE_GATEWAY_API: "/api/formless/workspace",
        VITE_FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN: "bootstrap-token",
      }),
    ).toEqual(config);

    expect(workspaceGatewayBrowserConfig({})).toBeUndefined();
    expect(JSON.stringify(config)).not.toContain("sidecar-proxy-token");
    expect(JSON.stringify(config)).not.toContain("127.0.0.1");
  });

  it("reads status with bootstrap and retries without bootstrap after owner setup", async () => {
    const calls: Array<{
      credentials?: RequestCredentials;
      headers: Headers;
      path: string;
    }> = [];
    const response = await fetchWorkspaceGatewayStatus({
      config,
      fetcher: async (input, init) => {
        calls.push({
          credentials: init?.credentials,
          headers: new Headers(init?.headers),
          path: requestUrl(input),
        });

        if (calls.length === 1) {
          return Response.json(
            { error: "Workspace bootstrap authorization has expired." },
            { status: 403 },
          );
        }

        return Response.json({
          csrfToken: "csrf-token",
          operation: operation({ operation: "status" }),
        });
      },
    });

    expect(response?.csrfToken).toBe("csrf-token");
    expect("error" in (response ?? {})).toBe(false);
    expect(calls.map((call) => call.path)).toEqual([
      "/api/formless/workspace/status",
      "/api/formless/workspace/status",
    ]);
    expect(calls.map((call) => call.credentials)).toEqual(["same-origin", "same-origin"]);
    expect(calls[0]?.headers.get("x-formless-workspace-bootstrap")).toBe("bootstrap-token");
    expect(calls[1]?.headers.get("x-formless-workspace-bootstrap")).toBeNull();
  });

  it("starts owner-session operations with CSRF and without bootstrap", async () => {
    const response = await startWorkspaceGatewayOperation(
      { check: true, kind: "save" },
      {
        config,
        csrfToken: "csrf-token",
        fetcher: async (input, init) => {
          expect(requestUrl(input)).toBe("/api/formless/workspace/operations");
          expect(init?.method).toBe("POST");
          expect(init?.credentials).toBe("same-origin");
          expect(new Headers(init?.headers).get("x-formless-workspace-bootstrap")).toBeNull();
          expect(new Headers(init?.headers).get("x-formless-csrf")).toBe("csrf-token");
          expect(typeof init?.body === "string" ? JSON.parse(init.body) : undefined).toEqual({
            check: true,
            kind: "save",
          });

          return Response.json({ operation: operation({ operation: "save" }) });
        },
      },
    );

    expect(response?.operation.operation).toBe("save");
  });

  it("enqueues auto-save with CSRF and accepts an empty success response", async () => {
    const calls: Array<{
      body?: unknown;
      headers: Headers;
      method?: string;
      path: string;
    }> = [];
    const enqueued = await enqueueWorkspaceGatewayAutoSave(
      { source: "schema-save" },
      {
        config,
        csrfToken: "csrf-token",
        fetcher: async (input, init) => {
          calls.push({
            body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
            headers: new Headers(init?.headers),
            method: init?.method,
            path: requestUrl(input),
          });

          return new Response(null, { status: 204 });
        },
      },
    );

    expect(enqueued).toBeUndefined();
    expect(calls.map((call) => call.path)).toEqual(["/api/formless/workspace/auto-save"]);
    expect(calls[0]?.headers.get("x-formless-workspace-bootstrap")).toBeNull();
    expect(calls[0]?.headers.get("x-formless-csrf")).toBe("csrf-token");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.body).toEqual({
      source: "schema-save",
    });
  });

  it("uses bootstrap only for status operation progress reads", async () => {
    const statusRead = await fetchWorkspaceGatewayOperation(
      { operationId: "op_status_00000001", operationKind: "status" },
      {
        config,
        fetcher: async (input, init) => {
          expect(requestUrl(input)).toBe("/api/formless/workspace/operations/op_status_00000001");
          expect(init?.credentials).toBe("same-origin");
          expect(new Headers(init?.headers).get("x-formless-workspace-bootstrap")).toBe(
            "bootstrap-token",
          );
          expect(new Headers(init?.headers).get("x-formless-workspace-operation-kind")).toBe(
            "status",
          );

          return Response.json({ operation: operation({ operation: "status" }) });
        },
      },
    );

    const saveRead = await fetchWorkspaceGatewayOperation(
      { operationId: "op_save_00000001", operationKind: "save" },
      {
        config,
        fetcher: async (_input, init) => {
          expect(init?.credentials).toBe("same-origin");
          expect(new Headers(init?.headers).get("x-formless-workspace-bootstrap")).toBeNull();
          expect(new Headers(init?.headers).get("x-formless-workspace-operation-kind")).toBe(
            "save",
          );

          return Response.json({ operation: operation({ operation: "save" }) });
        },
      },
    );

    expect(statusRead?.operation.operation).toBe("status");
    expect(saveRead?.operation.operation).toBe("save");
  });

  it("throws client errors with parsed or fallback response bodies", async () => {
    const jsonError = await captureError(() =>
      fetchWorkspaceGatewayStatus({
        config,
        fetcher: async () => workspaceGatewayErrorResponse("Owner session required.", 403),
      }),
    );
    const fallbackError = await captureError(() =>
      fetchWorkspaceGatewayStatus({
        config,
        fetcher: async () => new Response("not json", { status: 500 }),
      }),
    );

    expect(jsonError).toBeInstanceOf(WorkspaceGatewayApiError);
    expect(fallbackError).toBeInstanceOf(WorkspaceGatewayApiError);

    if (
      !(jsonError instanceof WorkspaceGatewayApiError) ||
      !(fallbackError instanceof WorkspaceGatewayApiError)
    ) {
      throw new Error("Expected workspace gateway client errors.");
    }

    expect(jsonError.status).toBe(403);
    expect(jsonError.body).toEqual({ error: "Owner session required." });
    expect(fallbackError.status).toBe(500);
    expect(fallbackError.body).toEqual({ error: "Workspace gateway request failed." });
  });
});

async function captureError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }

  return undefined;
}

function operation(overrides: Partial<WorkspaceGatewayOperation> = {}): WorkspaceGatewayOperation {
  return {
    actor: "browser",
    createdAt: "2026-06-02T00:00:00.000Z",
    errors: [],
    events: [],
    id: "op_status_00000001",
    input: {},
    kind: "formless.workspaceOperation",
    logs: [],
    operation: "status",
    status: "succeeded",
    summary: {
      fields: {},
      title: "Workspace status",
    },
    updatedAt: "2026-06-02T00:00:01.000Z",
    version: 1,
    workspace: { label: "workspace" },
    ...overrides,
  };
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.href : input.url;
}
