import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  WORKSPACE_GATEWAY_ENABLED_ENV,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
  WORKSPACE_GATEWAY_STATUS_API_PATH,
} from "@dpeek/formless-gateway";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";

let harness: Harness;

beforeEach(async () => {
  harness = await createGatewayHarness();
});

afterEach(async () => {
  await harness.dispose();
});

describe("Worker workspace gateway proxy routes", () => {
  it("advertises workspace operation capabilities before proxying", async () => {
    const response = await fetchHost("instance.example.com", WORKSPACE_GATEWAY_STATUS_API_PATH, {
      headers: gatewayAuthHeaders(),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: "gateway-unavailable",
    });
  });

  it("injects gateway route availability for local instance targets", async () => {
    for (const testCase of [
      { expectedStatus: 503, host: "instance.example.com" },
      { expectedStatus: 503, host: "example.com" },
      { expectedStatus: 503, host: "site-authoring.example.com" },
      { expectedStatus: 404, host: "published-site.example.com" },
    ]) {
      const response = await fetchHost(testCase.host, WORKSPACE_GATEWAY_STATUS_API_PATH, {
        headers: gatewayAuthHeaders(),
      });

      expect(response.status).toBe(testCase.expectedStatus);
      if (testCase.expectedStatus === 503) {
        await expect(response.json()).resolves.toEqual({
          code: "gateway-unavailable",
        });
      }
    }
  });

  it("keeps exact-host mapped runtimes unavailable to gateway proxy routes", async () => {
    await createRouteRecord("route:host:admin.example.com", {
      access: "owner",
      enabled: true,
      kind: "mount",
      matchHost: "admin.example.com",
      matchPath: "/",
      matchPrefix: "/",
      surface: "admin",
      targetProfile: "instance",
    });

    const response = await fetchHost("admin.example.com", WORKSPACE_GATEWAY_STATUS_API_PATH, {
      headers: gatewayAuthHeaders(),
    });

    expect(response.status).toBe(404);
  });
});

function createGatewayHarness() {
  return createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        [WORKSPACE_GATEWAY_ENABLED_ENV]: "1",
        [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: "test-proxy-token",
        [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]: "http://127.0.0.1:1",
      },
    },
  );
}

async function createRouteRecord(recordId: string, values: Record<string, unknown>) {
  const response = await harness.fetch("/api/formless/program/operations/route/create", {
    body: JSON.stringify({
      idempotencyKey: `route-${recordId}`,
      input: values,
    }),
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });

  expect(response.status).toBe(200);
}

function fetchHost(
  host: string,
  path: string,
  init?: Parameters<Harness["mf"]["dispatchFetch"]>[1],
) {
  return harness.mf.dispatchFetch(`http://${host}${path}`, init);
}

function gatewayAuthHeaders() {
  return adminHeaders();
}

function adminHeaders(extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${adminToken}`,
    ...extra,
  };
}
