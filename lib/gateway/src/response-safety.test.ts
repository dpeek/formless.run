import { describe, expect, it } from "vite-plus/test";

import { WORKSPACE_GATEWAY_PUSH_PHASE_IDS, type WorkspaceGatewayPush } from "./index.ts";
import {
  workspaceGatewayErrorResponse,
  workspaceGatewaySafeSidecarResponse,
} from "./response-safety.ts";

describe("Gateway response safety", () => {
  it("delivers CSRF only on exact owner-session status", async () => {
    const response = await workspaceGatewaySafeSidecarResponse({
      authorization: { actor: "browser", via: "owner-session" },
      env: { csrfToken: "csrf" },
      kind: "status",
      request: new Request("https://example.com/api/formless/workspace/status"),
      response: Response.json({ currentPush: null, gateway: "available", latestPush: null }),
    });
    expect(await response.json()).toEqual({
      csrfToken: "csrf",
      currentPush: null,
      gateway: "available",
      latestPush: null,
    });
    expect(response.headers.get("Set-Cookie")).toBe(
      "formless_workspace_csrf=csrf; Path=/; SameSite=Lax; Secure",
    );
  });

  it("forwards only closed code errors", async () => {
    const safe = await workspaceGatewaySafeSidecarResponse({
      authorization: { actor: "browser", via: "owner-session" },
      env: {},
      kind: "push",
      request: new Request("https://example.com/api/formless/workspace/pushes"),
      response: workspaceGatewayErrorResponse("push-active"),
    });
    expect(await safe.json()).toEqual({ code: "push-active" });

    const invalid = await workspaceGatewaySafeSidecarResponse({
      authorization: { actor: "browser", via: "owner-session" },
      env: {},
      kind: "push",
      request: new Request("https://example.com/api/formless/workspace/pushes"),
      response: Response.json({ error: "token=secret /tmp/workspace" }, { status: 500 }),
    });
    expect(invalid.status).toBe(502);
    expect(await invalid.json()).toEqual({ code: "invalid-sidecar-response" });
  });

  it("rejects non-JSON and structurally invalid Push responses", async () => {
    for (const response of [
      new Response("provider output"),
      Response.json({ push: { ...queuedPush(), path: "/tmp/workspace" } }),
    ]) {
      const safe = await workspaceGatewaySafeSidecarResponse({
        authorization: { actor: "browser", via: "owner-session" },
        env: {},
        kind: "push",
        request: new Request("https://example.com/api/formless/workspace/pushes"),
        response,
      });
      expect(await safe.json()).toEqual({ code: "invalid-sidecar-response" });
    }
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
