import { afterEach, describe, expect, it } from "vite-plus/test";

import { WORKSPACE_GATEWAY_PUSH_PHASE_IDS } from "./index.ts";
import {
  createWorkspaceGatewaySidecarRuntime,
  handleWorkspaceGatewaySidecarRequest,
  startWorkspaceGatewaySidecar,
  type WorkspaceGatewaySidecar,
  type WorkspaceGatewaySidecarExecutionEnv,
  type WorkspaceGatewaySidecarHandlers,
} from "./sidecar.ts";

const sidecars: WorkspaceGatewaySidecar[] = [];
const env: WorkspaceGatewaySidecarExecutionEnv = {
  FORMLESS_LOCAL_WORKSPACE_GATEWAY: "1",
  FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN: "proxy",
  FORMLESS_WORKSPACE_GATEWAY_ROOT: "/tmp/workspace",
};

afterEach(async () => {
  await Promise.all(sidecars.splice(0).map((sidecar) => sidecar.close()));
});

describe("Gateway sidecar", () => {
  it("returns queued Push before typed execution completes and exposes current status", async () => {
    const release = deferred<void>();
    const runtime = createWorkspaceGatewaySidecarRuntime(
      handlers(async ({ observer }) => {
        observer.start("credentials");
        await release.promise;
        observer.succeed("credentials");
        for (const id of WORKSPACE_GATEWAY_PUSH_PHASE_IDS.slice(1)) {
          observer.start(id);
          observer.succeed(id);
        }
        return { outcome: "applied" };
      }),
      { createPushId: () => "push_1234567890abcdef" },
    );
    const start = await handleWorkspaceGatewaySidecarRequest(
      request("/api/formless/workspace/pushes", "push-start", {
        body: JSON.stringify({ mode: "apply" }),
        method: "POST",
      }),
      env,
      runtime,
    );
    expect(await start?.json()).toMatchObject({ push: { lifecycle: "queued" } });
    await settle();
    const status = await handleWorkspaceGatewaySidecarRequest(
      request("/api/formless/workspace/status", "status"),
      env,
      runtime,
    );
    expect(await status?.json()).toMatchObject({
      currentPush: { id: "push_1234567890abcdef", lifecycle: "running" },
      gateway: "available",
      latestPush: null,
    });

    release.resolve();
    await settle();
    const terminal = await handleWorkspaceGatewaySidecarRequest(
      request("/api/formless/workspace/pushes/push_1234567890abcdef", "push-read"),
      env,
      runtime,
    );
    expect(await terminal?.json()).toMatchObject({
      push: { lifecycle: "succeeded", outcome: "applied" },
    });
  });

  it("routes empty auto-save enqueue separately", async () => {
    const enqueues: unknown[] = [];
    const runtime = createWorkspaceGatewaySidecarRuntime({
      enqueueAutoSave: async (input) => {
        enqueues.push(input.enqueue);
      },
      push: async () => ({ outcome: "applied" }),
    });
    const response = await handleWorkspaceGatewaySidecarRequest(
      request("/api/formless/workspace/auto-save", "auto-save", {
        body: JSON.stringify({ source: "control-plane-write" }),
        method: "POST",
      }),
      env,
      runtime,
    );
    expect(response?.status).toBe(204);
    expect(await response?.text()).toBe("");
    expect(enqueues).toEqual([{ source: "control-plane-write" }]);
  });

  it("rejects missing internal authorization and mismatched exact intent", async () => {
    const runtime = createWorkspaceGatewaySidecarRuntime(handlers());
    const unauthorized = await handleWorkspaceGatewaySidecarRequest(
      new Request("http://local.test/api/formless/workspace/status"),
      env,
      runtime,
    );
    expect(await unauthorized?.json()).toEqual({ code: "unauthorized" });
    const mismatched = await handleWorkspaceGatewaySidecarRequest(
      request("/api/formless/workspace/status", "push-read"),
      env,
      runtime,
    );
    expect(await mismatched?.json()).toEqual({ code: "invalid-request" });
  });

  it("starts each sidecar with an empty registry", async () => {
    const first = await startWorkspaceGatewaySidecar(
      { workspaceRoot: "/tmp/workspace" },
      { createProxyToken: () => "first-proxy", handlers: handlers(completingPush) },
    );
    sidecars.push(first);
    await fetch(`${first.endpoint}/api/formless/workspace/pushes`, {
      body: JSON.stringify({ mode: "apply" }),
      headers: proxyHeaders("first-proxy", "push-start"),
      method: "POST",
    });
    await settle();
    const firstStatus = await fetch(`${first.endpoint}/api/formless/workspace/status`, {
      headers: proxyHeaders("first-proxy", "status"),
    });
    expect(await firstStatus.json()).toMatchObject({ latestPush: { lifecycle: "succeeded" } });
    await first.close();
    sidecars.splice(sidecars.indexOf(first), 1);

    const restarted = await startWorkspaceGatewaySidecar(
      { workspaceRoot: "/tmp/workspace" },
      { createProxyToken: () => "second-proxy", handlers: handlers(completingPush) },
    );
    sidecars.push(restarted);
    const restartedStatus = await fetch(`${restarted.endpoint}/api/formless/workspace/status`, {
      headers: proxyHeaders("second-proxy", "status"),
    });
    expect(await restartedStatus.json()).toEqual({
      currentPush: null,
      gateway: "available",
      latestPush: null,
    });
  });
});

const completingPush: WorkspaceGatewaySidecarHandlers["push"] = async ({ observer }) => {
  for (const id of WORKSPACE_GATEWAY_PUSH_PHASE_IDS) {
    observer.start(id);
    observer.succeed(id);
  }
  return { outcome: "applied" };
};

function handlers(
  push: WorkspaceGatewaySidecarHandlers["push"] = completingPush,
): WorkspaceGatewaySidecarHandlers {
  return { enqueueAutoSave: async () => undefined, push };
}

function request(pathname: string, intent: string, init: RequestInit = {}): Request {
  return new Request(`http://local.test${pathname}`, {
    ...init,
    headers: { ...proxyHeaders("proxy", intent), ...Object.fromEntries(new Headers(init.headers)) },
  });
}

function proxyHeaders(proxyToken: string, intent: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-formless-workspace-actor": "browser",
    "x-formless-workspace-authorization-via": "owner-session",
    "x-formless-workspace-gateway-intent": intent,
    "x-formless-workspace-proxy-token": proxyToken,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
