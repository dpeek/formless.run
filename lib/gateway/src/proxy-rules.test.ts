import { describe, expect, it } from "vite-plus/test";

import { WORKSPACE_OPERATION_CAPABILITIES } from "@dpeek/formless-workspace";
import {
  WORKSPACE_GATEWAY_ACTOR_HEADER,
  WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER,
  WORKSPACE_GATEWAY_INTENT_HEADER,
  WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER,
  WORKSPACE_GATEWAY_PUSH_PHASE_IDS,
  type WorkspaceGatewayPush,
} from "./index.ts";
import {
  handleWorkspaceGatewayProxyRulesRequest,
  type WorkspaceGatewayProxyRulesDependencies,
} from "./proxy-rules.ts";

const env = { adminToken: "admin", bootstrapToken: "bootstrap", csrfToken: "csrf" };

describe("shared Gateway proxy rules", () => {
  it("authorizes status through bootstrap and owner-session CSRF delivery", async () => {
    const bootstrap = await handleWorkspaceGatewayProxyRulesRequest(
      new Request("https://example.com/api/formless/workspace/status", {
        headers: { "x-formless-workspace-bootstrap": "bootstrap" },
      }),
      env,
      dependencies(),
    );
    expect(await bootstrap?.json()).toEqual({
      currentPush: null,
      gateway: "available",
      latestPush: null,
    });

    const owner = await handleWorkspaceGatewayProxyRulesRequest(
      new Request("https://example.com/api/formless/workspace/status", {
        headers: { Cookie: "owner=valid" },
      }),
      env,
      dependencies(),
    );
    expect(await owner?.json()).toEqual({
      csrfToken: "csrf",
      currentPush: null,
      gateway: "available",
      latestPush: null,
    });
  });

  it("requires same-origin owner session and double-submit CSRF for Push", async () => {
    for (const headers of [
      new Headers(),
      new Headers({ Cookie: "owner=valid", Origin: "https://evil.example" }),
      new Headers({ Cookie: "owner=valid", Origin: "https://example.com" }),
    ]) {
      const response = await handleWorkspaceGatewayProxyRulesRequest(
        pushRequest(headers),
        env,
        dependencies(),
      );
      expect(response?.ok).toBe(false);
    }

    const response = await handleWorkspaceGatewayProxyRulesRequest(
      pushRequest(browserMutationHeaders()),
      env,
      dependencies(),
    );
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ push: queuedPush() });
  });

  it("forwards only bounded sidecar headers and exact Push intent", async () => {
    let forwarded: RequestInit | undefined;
    await handleWorkspaceGatewayProxyRulesRequest(
      pushRequest({
        ...browserMutationHeaders(),
        Authorization: "Bearer browser-secret",
        "x-untrusted": "provider-output",
      }),
      env,
      dependencies({
        fetch: async (_input, init) => {
          forwarded = init;
          return Response.json({ push: queuedPush() });
        },
      }),
    );
    const headers = new Headers(forwarded?.headers);
    expect(headers.get(WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER)).toBe("proxy");
    expect(headers.get(WORKSPACE_GATEWAY_ACTOR_HEADER)).toBe("browser");
    expect(headers.get(WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER)).toBe("owner-session");
    expect(headers.get(WORKSPACE_GATEWAY_INTENT_HEADER)).toBe("push-start");
    expect(headers.has("Authorization")).toBe(false);
    expect(headers.has("Cookie")).toBe(false);
    expect(headers.has("x-untrusted")).toBe(false);
  });

  it("rejects generic routes and arbitrary Push fields before sidecar forwarding", async () => {
    let calls = 0;
    const deps = dependencies({
      fetch: async () => {
        calls += 1;
        return Response.json({ push: queuedPush() });
      },
    });
    const generic = await handleWorkspaceGatewayProxyRulesRequest(
      new Request("https://example.com/api/formless/workspace/operations", {
        method: "POST",
      }),
      env,
      deps,
    );
    expect(await generic?.json()).toEqual({ code: "not-found" });
    const arbitrary = await handleWorkspaceGatewayProxyRulesRequest(
      new Request("https://example.com/api/formless/workspace/pushes", {
        body: JSON.stringify({ command: "rm", mode: "apply" }),
        headers: browserMutationHeaders(),
        method: "POST",
      }),
      env,
      deps,
    );
    expect(await arbitrary?.json()).toEqual({ code: "invalid-request" });
    expect(calls).toBe(0);
  });

  it("maps invalid sidecar bodies to one closed error code", async () => {
    const response = await handleWorkspaceGatewayProxyRulesRequest(
      pushRequest(browserMutationHeaders()),
      env,
      dependencies({ fetch: async () => new Response("token=secret /tmp/workspace") }),
    );
    expect(response?.status).toBe(502);
    expect(await response?.json()).toEqual({ code: "invalid-sidecar-response" });
  });
});

function dependencies(
  overrides: Partial<WorkspaceGatewayProxyRulesDependencies> = {},
): WorkspaceGatewayProxyRulesDependencies {
  return {
    capabilities: WORKSPACE_OPERATION_CAPABILITIES,
    fetch: async (input) =>
      typeof input === "string" && input.includes("/pushes")
        ? Response.json({ push: queuedPush() })
        : Response.json({ currentPush: null, gateway: "available", latestPush: null }),
    proxyTarget: () => ({ endpoint: "http://127.0.0.1:1234", proxyToken: "proxy" }),
    validateOwnerSession: (request) =>
      request.headers.get("Cookie")?.includes("owner=valid") ? { ok: true } : { ok: false },
    ...overrides,
  };
}

function pushRequest(headers: HeadersInit): Request {
  return new Request("https://example.com/api/formless/workspace/pushes", {
    body: JSON.stringify({ mode: "apply" }),
    headers,
    method: "POST",
  });
}

function browserMutationHeaders(): Record<string, string> {
  return {
    Cookie: "owner=valid; formless_workspace_csrf=csrf",
    "Content-Type": "application/json",
    Origin: "https://example.com",
    "x-formless-csrf": "csrf",
  };
}

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
