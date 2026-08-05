import { createServer, type Server } from "node:http";

import {
  WORKSPACE_GATEWAY_ACTOR_HEADER,
  WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER,
  WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_ENABLED_ENV,
  WORKSPACE_GATEWAY_INTENT_HEADER,
  WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
  WORKSPACE_GATEWAY_STATUS_API_PATH,
} from "@dpeek/formless-gateway/sidecar";
import { WORKSPACE_OPERATION_CAPABILITIES } from "@dpeek/formless-workspace";
import { describe, expect, it } from "vite-plus/test";

import { createOwnerSessionCookie } from "../worker/owner-session.ts";
import {
  createWorkspaceGatewayProxyDependencies,
  createWorkspaceGatewayRuntimeMiddleware,
  workspaceGatewayRouteAvailable,
  type WorkspaceGatewayRuntimeEnv,
} from "./workspace-gateway-proxy-composition.ts";

const adminToken = "admin-local-token";
const bootstrapToken = "bootstrap-local-token";
const ownerSecret = "owner-session-secret";
const proxyToken = "proxy-local-token";

describe("workspace gateway proxy composition", () => {
  it("composes runtime proxy dependencies from local runtime facts", async () => {
    const setupRequests: Request[] = [];
    const proxyFetch = async () => Response.json({ ok: true });
    const setupFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      setupRequests.push(new Request(input, init));

      return Response.json({ setupComplete: true });
    };
    const dependencies = createWorkspaceGatewayProxyDependencies(gatewayEnv(), {
      fetch: setupFetch,
      operationCapabilities: ["workspace-read"],
      proxyFetch,
    });
    const routeAvailable = requireRouteAvailable(dependencies.routeAvailable);
    const ownerCookie = await createOwnerCookie();

    expect(dependencies.capabilities).toEqual(["workspace-read"]);
    expect(dependencies.proxyFetch).toBe(proxyFetch);
    expect(routeAvailable(statusRequest())).toBe(true);
    await expect(dependencies.readOwnerSetupStatus?.(statusRequest())).resolves.toEqual({
      setupComplete: true,
    });
    expect(setupRequests.map((request) => request.url)).toEqual([
      "http://local.test/api/formless/setup",
    ]);
    expect(setupRequests[0]?.headers.get("accept")).toBe("application/json");
    await expect(
      dependencies.validateOwnerSession?.(
        new Request("http://local.test/", {
          headers: { Cookie: ownerCookie },
        }),
      ),
    ).resolves.toMatchObject({ ok: true });
  });

  it("uses default execution capabilities and display-safe setup status fallback", async () => {
    const setupFetch = async () => new Response("unavailable", { status: 503 });
    const dependencies = createWorkspaceGatewayProxyDependencies(gatewayEnv(), {
      fetch: setupFetch,
    });

    expect(dependencies.capabilities).toEqual(WORKSPACE_OPERATION_CAPABILITIES);
    expect(dependencies.proxyFetch).toBe(setupFetch);
    await expect(dependencies.readOwnerSetupStatus?.(statusRequest())).resolves.toEqual({
      setupComplete: false,
    });
    await expect(dependencies.validateOwnerSession?.(statusRequest())).resolves.toMatchObject({
      ok: false,
      reason: "missing-cookie",
    });
  });

  it("injects route eligibility from explicit local instance facts", () => {
    const request = statusRequest();

    expect(workspaceGatewayRouteAvailable(request, gatewayEnv())).toBe(true);
    for (const overrides of [
      { FORMLESS_RUNTIME_PROFILE: "publishedSite" },
      { [WORKSPACE_GATEWAY_ENABLED_ENV]: "0" },
      { [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: "" },
      { [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]: "" },
    ]) {
      expect(workspaceGatewayRouteAvailable(request, gatewayEnv(overrides))).toBe(false);
    }
  });

  it("creates default middleware with focused proxy composition", async () => {
    const proxiedRequests: Request[] = [];
    const middleware = createWorkspaceGatewayRuntimeMiddleware(gatewayEnv(), {
      fetch: async () => Response.json({ setupComplete: false }),
      operationCapabilities: ["workspace-read"],
      proxyFetch: async (input, init) => {
        proxiedRequests.push(new Request(input, init));

        return Response.json({
          currentPush: null,
          gateway: "available",
          latestPush: null,
        });
      },
    });
    const response = await fetchThroughMiddleware(middleware, WORKSPACE_GATEWAY_STATUS_API_PATH, {
      [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      currentPush: null,
      gateway: "available",
      latestPush: null,
    });
    expect(proxiedRequests.map((request) => request.url)).toEqual([
      `http://127.0.0.1:9999${WORKSPACE_GATEWAY_STATUS_API_PATH}`,
    ]);
    expect(proxiedRequests[0]?.headers.get(WORKSPACE_GATEWAY_ACTOR_HEADER)).toBe("browser");
    expect(proxiedRequests[0]?.headers.get(WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER)).toBe(
      "bootstrap",
    );
    expect(proxiedRequests[0]?.headers.get(WORKSPACE_GATEWAY_INTENT_HEADER)).toBe("status");
    expect(proxiedRequests[0]?.headers.get(WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER)).toBe(
      proxyToken,
    );
  });
});

function gatewayEnv(
  overrides: Partial<WorkspaceGatewayRuntimeEnv> = {},
): WorkspaceGatewayRuntimeEnv {
  return {
    FORMLESS_ADMIN_TOKEN: adminToken,
    FORMLESS_OWNER_SESSION_SECRET: ownerSecret,
    FORMLESS_RUNTIME_PROFILE: "instance",
    [WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV]: bootstrapToken,
    [WORKSPACE_GATEWAY_ENABLED_ENV]: "1",
    [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: proxyToken,
    [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]: "http://127.0.0.1:9999",
    ...overrides,
  };
}

function statusRequest(): Request {
  return new Request(`http://local.test${WORKSPACE_GATEWAY_STATUS_API_PATH}`);
}

function requireRouteAvailable(
  routeAvailable: boolean | ((request: Request) => boolean) | undefined,
): (request: Request) => boolean {
  if (typeof routeAvailable !== "function") {
    throw new Error("Expected route availability function.");
  }

  return routeAvailable;
}

async function createOwnerCookie(): Promise<string> {
  const created = await createOwnerSessionCookie({
    env: { FORMLESS_OWNER_SESSION_SECRET: ownerSecret },
    now: "2999-01-01T00:00:00.000Z",
    owner: { createdAt: "2026-06-02T01:00:00.000Z", id: "owner-1", name: "Ada Owner" },
    request: new Request("http://local.test/"),
  });

  return created.cookie.split(";")[0] ?? created.cookie;
}

async function fetchThroughMiddleware(
  middleware: ReturnType<typeof createWorkspaceGatewayRuntimeMiddleware>,
  path: string,
  headers: Record<string, string>,
): Promise<Response> {
  const server = createServer((req, res) => {
    void middleware(req, res, () => {
      res.statusCode = 418;
      res.end("next");
    });
  });

  await listen(server);

  try {
    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("Expected local server port.");
    }

    return await fetch(`http://127.0.0.1:${address.port}${path}`, { headers });
  } finally {
    await close(server);
  }
}

async function listen(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
