import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH,
  WORKSPACE_GATEWAY_PUSHES_API_PATH,
  WORKSPACE_GATEWAY_STATUS_API_PATH,
  handleWorkspaceGatewayLocalProxyRequest,
  startWorkspaceGatewaySidecar,
  type WorkspaceGatewaySidecar,
} from "@dpeek/formless-gateway/sidecar";
import type {
  PushFormlessInstanceWorkspaceCloudflareOAuthPreflightResult,
  PushFormlessInstanceWorkspaceResult,
} from "./instance-workspace-deployment.ts";
import {
  createWorkspaceGatewayHandlers,
  createWorkspaceGatewayProxyDependencies,
  type WorkspaceGatewayRuntimeDependencies,
  type WorkspaceGatewayRuntimeEnv,
} from "./workspace-gateway-runtime.ts";

const adminToken = "admin-local-token";
const proxyToken = "proxy-local-token";
const sidecars: WorkspaceGatewaySidecar[] = [];

afterEach(async () => {
  await Promise.all(sidecars.splice(0).map((sidecar) => sidecar.close()));
});

describe("local workspace Gateway Push runtime", () => {
  it("starts Push asynchronously and rediscovers its terminal result through status", async () => {
    let releasePush: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      releasePush = resolve;
    });
    const deps = dependencies({
      push: async () => {
        await blocked;
        return pushResult();
      },
    });
    const sidecar = await startSidecar(deps);

    const started = await proxyJson(
      new Request(`http://local.test${WORKSPACE_GATEWAY_PUSHES_API_PATH}`, {
        body: JSON.stringify({ mode: "dry-run", targetAlias: "staging" }),
        headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
        method: "POST",
      }),
      deps,
      sidecar,
    );

    expect(started.response.status).toBe(200);
    expect(started.body).toMatchObject({
      push: { lifecycle: "queued", mode: "dry-run", targetAlias: "staging" },
    });

    await eventually(async () => {
      const status = await proxyJson(
        new Request(`http://local.test${WORKSPACE_GATEWAY_STATUS_API_PATH}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        }),
        deps,
        sidecar,
      );
      expect(status.body).toMatchObject({ currentPush: { lifecycle: "running" } });
    });

    releasePush?.();
    await eventually(async () => {
      const status = await proxyJson(
        new Request(`http://local.test${WORKSPACE_GATEWAY_STATUS_API_PATH}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        }),
        deps,
        sidecar,
      );
      expect(status.body).toMatchObject({
        currentPush: null,
        gateway: "available",
        latestPush: { lifecycle: "succeeded", outcome: "planned" },
      });
    });
  });

  it("keeps auto-save separate and rejects the removed generic operation route", async () => {
    const enqueued: unknown[] = [];
    const deps = dependencies({
      autoSaveScheduler: {
        enqueue: async (input) => {
          enqueued.push(input);
        },
        runNow: async () => undefined,
      },
    });
    const sidecar = await startSidecar(deps);
    const authHeaders = {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    };

    const autoSave = await proxyJson(
      new Request(`http://local.test${WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH}`, {
        body: JSON.stringify({ source: "schema-save" }),
        headers: authHeaders,
        method: "POST",
      }),
      deps,
      sidecar,
    );
    const generic = await proxyJson(
      new Request("http://local.test/api/formless/workspace/operations", {
        body: JSON.stringify({ kind: "push" }),
        headers: authHeaders,
        method: "POST",
      }),
      deps,
      sidecar,
    );

    expect(autoSave.response.status).toBe(204);
    expect(autoSave.body).toEqual({});
    expect(enqueued).toHaveLength(1);
    expect(generic.response.status).toBe(404);
    expect(generic.body).toEqual({ code: "not-found" });
  });
});

function dependencies(
  overrides: Partial<WorkspaceGatewayRuntimeDependencies> = {},
): WorkspaceGatewayRuntimeDependencies {
  return {
    accountDiscovery: { listAccounts: async () => [] },
    autoSaveScheduler: {
      enqueue: async () => undefined,
      runNow: async () => undefined,
    },
    cwd: "/workspace/project",
    fetch: async () => Response.json({}),
    now: () => "2026-08-04T00:00:00.000Z",
    packageVersion: "0.0.0-test",
    preflightPushCredential: async () => preflight(),
    push: async () => pushResult(),
    ...overrides,
  };
}

async function startSidecar(
  deps: WorkspaceGatewayRuntimeDependencies,
): Promise<WorkspaceGatewaySidecar> {
  const sidecar = await startWorkspaceGatewaySidecar(
    { workspaceRoot: deps.cwd },
    {
      createProxyToken: () => proxyToken,
      handlers: createWorkspaceGatewayHandlers(deps),
    },
  );
  sidecars.push(sidecar);
  return sidecar;
}

async function proxyJson(
  request: Request,
  deps: WorkspaceGatewayRuntimeDependencies,
  sidecar: WorkspaceGatewaySidecar,
) {
  const env: WorkspaceGatewayRuntimeEnv = {
    FORMLESS_ADMIN_TOKEN: adminToken,
    FORMLESS_LOCAL_WORKSPACE_GATEWAY: "1",
    FORMLESS_RUNTIME_PROFILE: "instance",
    FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN: sidecar.proxyToken,
    FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL: sidecar.endpoint,
  };
  const response = await handleWorkspaceGatewayLocalProxyRequest(
    request,
    env,
    createWorkspaceGatewayProxyDependencies(env, { ...deps, proxyFetch: fetch }),
  );
  if (!response) throw new Error("Expected Gateway response.");
  const text = await response.text();
  return {
    body: text === "" ? {} : (JSON.parse(text) as Record<string, unknown>),
    response,
  };
}

function preflight(): PushFormlessInstanceWorkspaceCloudflareOAuthPreflightResult {
  return {
    credentialId: "default",
    deploymentConfigId: "deployment-config-primary",
    needsSetup: false,
    selectedTarget: { alias: "staging", url: "https://example.workers.dev" },
    workspaceRoot: "/workspace/project",
  };
}

function pushResult(): PushFormlessInstanceWorkspaceResult {
  return {
    deploymentDisplay: {
      accountId: "account-a",
      providerFamily: "cloudflare",
      target: "staging",
      targetUrl: "https://example.workers.dev",
      workerName: "example",
      workersDevSubdomain: "example",
    },
    mode: "dry-run",
    noop: false,
    selectedTarget: { alias: "staging", url: "https://example.workers.dev" },
    source: { archivePath: "/workspace/project/archive.json", mediaCount: 0, recordCount: 0 },
    syncPlan: {} as PushFormlessInstanceWorkspaceResult["syncPlan"],
    workspaceRoot: "/workspace/project",
  };
}

async function eventually(assertion: () => Promise<void>): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
    }
  }
  throw lastError;
}
