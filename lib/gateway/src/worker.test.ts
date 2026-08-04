import { describe, expect, it } from "vite-plus/test";

import { WORKSPACE_OPERATION_CAPABILITIES } from "@dpeek/formless-workspace";
import {
  handleWorkspaceGatewayProxyRequest,
  workspaceGatewayProxyConfigFromEnv,
} from "./worker.ts";

describe("Worker Gateway proxy adapter", () => {
  it("accepts only loopback sidecar configuration", () => {
    expect(
      workspaceGatewayProxyConfigFromEnv({
        FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN: "proxy",
        FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL: "http://127.0.0.1:4321",
      }),
    ).toEqual({ endpoint: "http://127.0.0.1:4321", proxyToken: "proxy" });
    expect(
      workspaceGatewayProxyConfigFromEnv({
        FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN: "proxy",
        FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL: "https://remote.example",
      }),
    ).toBeUndefined();
  });

  it("distinguishes an unavailable route from an unavailable sidecar", async () => {
    const route = await handleWorkspaceGatewayProxyRequest(
      new Request("https://example.com/api/formless/workspace/status"),
      {},
      { routeAvailable: false },
    );
    expect(route?.status).toBe(404);
    expect(await route?.json()).toEqual({ code: "not-found" });

    const sidecar = await handleWorkspaceGatewayProxyRequest(
      new Request("https://example.com/api/formless/workspace/status"),
      {},
    );
    expect(sidecar?.status).toBe(503);
    expect(await sidecar?.json()).toEqual({ code: "gateway-unavailable" });
  });

  it("injects Worker capability and owner-session seams into shared proxy rules", async () => {
    const response = await handleWorkspaceGatewayProxyRequest(
      new Request("https://example.com/api/formless/workspace/status", {
        headers: { Cookie: "owner=valid" },
      }),
      {
        FORMLESS_WORKSPACE_GATEWAY_CSRF_TOKEN: "csrf",
        FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN: "proxy",
        FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL: "http://127.0.0.1:4321",
      },
      {
        capabilities: WORKSPACE_OPERATION_CAPABILITIES,
        fetch: async () =>
          Response.json({ currentPush: null, gateway: "available", latestPush: null }),
        validateOwnerSession: () => ({ ok: true }),
      },
    );
    expect(await response?.json()).toEqual({
      csrfToken: "csrf",
      currentPush: null,
      gateway: "available",
      latestPush: null,
    });
  });
});
