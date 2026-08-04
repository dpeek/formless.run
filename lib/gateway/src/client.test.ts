import { describe, expect, it } from "vite-plus/test";

import {
  WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  WORKSPACE_GATEWAY_CSRF_HEADER,
  WorkspaceGatewayApiError,
  fetchWorkspaceGatewayStatus,
  startWorkspaceGatewayPush,
  submitWorkspaceGatewayAccountSelection,
  workspaceGatewayBrowserConfig,
  type WorkspaceGatewayPush,
} from "./client.ts";
import { WORKSPACE_GATEWAY_PUSH_PHASE_IDS } from "./index.ts";

const config = { apiBasePath: "/api/formless/workspace", bootstrapToken: "bootstrap" };

describe("Gateway browser client", () => {
  it("reads exact status and retries only bootstrap-expired", async () => {
    const calls: RequestInit[] = [];
    const status = await fetchWorkspaceGatewayStatus({
      config,
      fetcher: async (_input, init) => {
        calls.push(init ?? {});
        return calls.length === 1
          ? Response.json({ code: "bootstrap-expired" }, { status: 403 })
          : Response.json({ currentPush: null, gateway: "available", latestPush: null });
      },
    });
    expect(status).toEqual({ currentPush: null, gateway: "available", latestPush: null });
    expect(new Headers(calls[0]?.headers).get(WORKSPACE_GATEWAY_BOOTSTRAP_HEADER)).toBe(
      "bootstrap",
    );
    expect(new Headers(calls[1]?.headers).has(WORKSPACE_GATEWAY_BOOTSTRAP_HEADER)).toBe(false);
  });

  it("posts only exact Push intent with CSRF", async () => {
    const response = await startWorkspaceGatewayPush(
      { mode: "apply", targetAlias: "primary" },
      {
        config,
        csrfToken: "csrf",
        fetcher: async (input, init) => {
          expect(input).toBe("/api/formless/workspace/pushes");
          expect(init?.method).toBe("POST");
          expect(typeof init?.body).toBe("string");
          expect(JSON.parse(init?.body as string)).toEqual({
            mode: "apply",
            targetAlias: "primary",
          });
          expect(new Headers(init?.headers).get(WORKSPACE_GATEWAY_CSRF_HEADER)).toBe("csrf");
          return Response.json({ push: queuedPush() });
        },
      },
    );
    expect(response?.push.lifecycle).toBe("queued");
  });

  it("submits exact current account selection", async () => {
    await submitWorkspaceGatewayAccountSelection(
      {
        accountId: "account-a",
        interactionId: "interaction_1234567890abcdef",
        pushId: "push_1234567890abcdef",
      },
      {
        config,
        csrfToken: "csrf",
        fetcher: async (input, init) => {
          expect(input).toBe(
            "/api/formless/workspace/pushes/push_1234567890abcdef/interactions/interaction_1234567890abcdef",
          );
          expect(typeof init?.body).toBe("string");
          expect(JSON.parse(init?.body as string)).toEqual({
            accountId: "account-a",
            kind: "account-selection",
          });
          return Response.json({ push: { ...queuedPush(), lifecycle: "running" } });
        },
      },
    );
  });

  it("preserves only code and status for code-only failures", async () => {
    await expect(
      startWorkspaceGatewayPush(
        { mode: "apply" },
        {
          config,
          fetcher: async () => Response.json({ code: "push-active" }, { status: 409 }),
        },
      ),
    ).rejects.toMatchObject({
      code: "push-active",
      message: "",
      status: 409,
    } satisfies Partial<WorkspaceGatewayApiError>);
  });

  it("rejects invalid or diagnostic-bearing successful responses", async () => {
    await expect(
      startWorkspaceGatewayPush(
        { mode: "apply" },
        {
          config,
          fetcher: async () =>
            Response.json({ push: { ...queuedPush(), diagnostics: { token: "secret" } } }),
        },
      ),
    ).rejects.toMatchObject({ code: "invalid-sidecar-response", status: 502 });
  });

  it("reads same-origin browser configuration only from safe Vite facts", () => {
    expect(
      workspaceGatewayBrowserConfig({
        VITE_FORMLESS_WORKSPACE_GATEWAY_API: "/api/formless/workspace/",
        VITE_FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN: "bootstrap",
        VITE_FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN: "must-not-be-read",
      }),
    ).toEqual(config);
  });
});

function queuedPush(): WorkspaceGatewayPush {
  return {
    createdAt: "2026-08-04T00:00:00.000Z",
    id: "push_1234567890abcdef",
    lifecycle: "queued",
    mode: "apply",
    phases: WORKSPACE_GATEWAY_PUSH_PHASE_IDS.map((id) => ({ id, status: "pending" })),
    updatedAt: "2026-08-04T00:00:00.000Z",
  };
}
