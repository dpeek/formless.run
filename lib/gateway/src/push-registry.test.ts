import { describe, expect, it } from "vite-plus/test";

import { WORKSPACE_GATEWAY_PUSH_PHASE_IDS } from "./index.ts";
import {
  createWorkspaceGatewayPushRegistry,
  WorkspaceGatewayRegistryError,
} from "./push-registry.ts";

const authorization = { actor: "browser", via: "owner-session" } as const;

describe("process-local Push registry", () => {
  it("starts asynchronously, rejects concurrency, and atomically moves terminal current to latest", async () => {
    const queued: Array<() => void> = [];
    const registry = createWorkspaceGatewayPushRegistry({
      createPushId: () => "push_1234567890abcdef",
      executePush: async ({ observer }) => {
        for (const id of WORKSPACE_GATEWAY_PUSH_PHASE_IDS) {
          observer.start(id);
          observer.succeed(id);
        }
        return { outcome: "applied" };
      },
      now: sequenceClock(),
      queue: (callback) => queued.push(callback),
    });

    expect(
      registry.start({ authorization, push: { mode: "apply" }, workspaceRoot: "/workspace" }),
    ).toMatchObject({ lifecycle: "queued", mode: "apply" });
    expect(() =>
      registry.start({ authorization, push: { mode: "dry-run" }, workspaceRoot: "/workspace" }),
    ).toThrowError(new WorkspaceGatewayRegistryError("push-active"));
    expect(registry.latest()).toBeNull();

    queued.shift()?.();
    await settle();
    expect(registry.current()).toBeNull();
    expect(registry.latest()).toMatchObject({ lifecycle: "succeeded", outcome: "applied" });
    expect(registry.latest()?.phases.map(({ id }) => id)).toEqual(WORKSPACE_GATEWAY_PUSH_PHASE_IDS);
  });

  it("retains latest while a replacement Push is current", async () => {
    const queued: Array<() => void> = [];
    let pushNumber = 0;
    const registry = createWorkspaceGatewayPushRegistry({
      createPushId: () => `push_1234567890abcde${pushNumber++}`,
      executePush: async ({ observer, push }) => {
        for (const id of WORKSPACE_GATEWAY_PUSH_PHASE_IDS) {
          observer.start(id);
          observer.succeed(id);
        }
        return { outcome: push.mode === "dry-run" ? "planned" : "applied" };
      },
      queue: (callback) => queued.push(callback),
    });
    registry.start({ authorization, push: { mode: "apply" }, workspaceRoot: "/workspace" });
    queued.shift()?.();
    await settle();
    const first = registry.latest();
    registry.start({ authorization, push: { mode: "dry-run" }, workspaceRoot: "/workspace" });
    expect(registry.current()?.lifecycle).toBe("queued");
    expect(registry.latest()).toEqual(first);
    queued.shift()?.();
    await settle();
    expect(registry.latest()).toMatchObject({ mode: "dry-run", outcome: "planned" });
    expect(registry.read(first!.id)).toBeUndefined();
  });

  it("publishes authorization then bounded account selection and resumes the same Push", async () => {
    const queued: Array<() => void> = [];
    const authorized = deferred<void>();
    const registry = createWorkspaceGatewayPushRegistry({
      createInteractionId: interactionIds(),
      createPushId: () => "push_1234567890abcdef",
      executePush: async ({ observer }) => {
        observer.start("credentials");
        observer.setExternalAuthorization("https://dash.cloudflare.com/oauth2/auth?state=x");
        await authorized.promise;
        observer.succeed("credentials");
        observer.start("account-selection");
        const accountId = await observer.requestAccountSelection([
          { id: "account-a", name: "Account A" },
          { id: "account-b" },
        ]);
        expect(accountId).toBe("account-b");
        observer.succeed("account-selection");
        for (const id of WORKSPACE_GATEWAY_PUSH_PHASE_IDS.slice(2)) {
          observer.start(id);
          observer.succeed(id);
        }
        return { outcome: "applied" };
      },
      queue: (callback) => queued.push(callback),
    });
    registry.start({ authorization, push: { mode: "apply" }, workspaceRoot: "/workspace" });
    queued.shift()?.();
    await settle();
    expect(registry.current()).toMatchObject({
      interaction: { kind: "external-authorization", provider: "cloudflare" },
      lifecycle: "waiting-for-interaction",
    });

    authorized.resolve();
    await settle();
    const current = registry.current();
    expect(current).toMatchObject({
      interaction: {
        choices: [{ id: "account-a", name: "Account A" }, { id: "account-b" }],
        kind: "account-selection",
      },
      lifecycle: "waiting-for-interaction",
    });
    if (current?.lifecycle !== "waiting-for-interaction") throw new Error("interaction missing");
    registry.submitAccountSelection({
      accountId: "account-b",
      interactionId: current.interaction.id,
      pushId: current.id,
    });
    await settle();
    expect(registry.latest()).toMatchObject({ lifecycle: "succeeded", outcome: "applied" });
  });

  it("expires interaction, rejects late answers, and discards state on restart", async () => {
    const queued: Array<() => void> = [];
    const timers: Array<() => void> = [];
    const registry = createWorkspaceGatewayPushRegistry({
      createInteractionId: () => "interaction_1234567890abcdef",
      createPushId: () => "push_1234567890abcdef",
      executePush: async ({ observer }) => {
        observer.start("credentials");
        observer.succeed("credentials");
        observer.start("account-selection");
        await observer.requestAccountSelection([{ id: "account-a" }]);
        throw new Error("continuation should expire");
      },
      queue: (callback) => queued.push(callback),
      schedule: (callback) => {
        timers.push(callback);
        return { cancel() {} };
      },
    });
    registry.start({ authorization, push: { mode: "apply" }, workspaceRoot: "/workspace" });
    queued.shift()?.();
    await settle();
    timers.shift()?.();
    await settle();
    expect(registry.latest()).toMatchObject({
      failedPhase: "account-selection",
      failureCode: "interaction-expired",
      lifecycle: "failed",
    });
    expect(() =>
      registry.submitAccountSelection({
        accountId: "account-a",
        interactionId: "interaction_1234567890abcdef",
        pushId: "push_1234567890abcdef",
      }),
    ).toThrowError(new WorkspaceGatewayRegistryError("interaction-expired"));

    const restarted = createWorkspaceGatewayPushRegistry({
      executePush: async () => ({ outcome: "applied" }),
    });
    expect(restarted.current()).toBeNull();
    expect(restarted.latest()).toBeNull();
    expect(restarted.read("push_1234567890abcdef")).toBeUndefined();
  });

  it("projects external authorization expiry separately from account-selection expiry", async () => {
    const queued: Array<() => void> = [];
    const timers: Array<() => void> = [];
    const registry = createWorkspaceGatewayPushRegistry({
      createInteractionId: () => "interaction_1234567890abcdef",
      createPushId: () => "push_1234567890abcdef",
      executePush: async ({ observer }) => {
        observer.start("credentials");
        observer.setExternalAuthorization(
          "https://dash.cloudflare.com/oauth2/auth?state=authorization",
        );
        await new Promise<never>(() => undefined);
        return { outcome: "applied" };
      },
      queue: (callback) => queued.push(callback),
      schedule: (callback) => {
        timers.push(callback);
        return { cancel() {} };
      },
    });
    registry.start({ authorization, push: { mode: "apply" }, workspaceRoot: "/workspace" });
    queued.shift()?.();
    await settle();
    timers.shift()?.();

    expect(registry.latest()).toMatchObject({
      failedPhase: "credentials",
      failureCode: "authorization-expired",
      lifecycle: "failed",
    });
  });

  it("projects unexpected diagnostics only to internal-failure", async () => {
    const queued: Array<() => void> = [];
    const registry = createWorkspaceGatewayPushRegistry({
      createPushId: () => "push_1234567890abcdef",
      executePush: async ({ observer }) => {
        observer.start("credentials");
        throw new Error("token=secret /Users/dpeek/workspace provider output");
      },
      queue: (callback) => queued.push(callback),
    });
    registry.start({ authorization, push: { mode: "apply" }, workspaceRoot: "/workspace" });
    queued.shift()?.();
    await settle();
    const serialized = JSON.stringify(registry.latest());
    expect(registry.latest()).toMatchObject({
      failedPhase: "credentials",
      failureCode: "internal-failure",
      lifecycle: "failed",
    });
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("/Users");
    expect(serialized).not.toContain("provider output");
  });
});

function interactionIds(): () => string {
  const values = ["interaction_1234567890abcdef", "interaction_fedcba0987654321"];
  return () => values.shift()!;
}

function sequenceClock(): () => string {
  let offset = 0;
  return () => new Date(Date.parse("2026-08-04T00:00:00.000Z") + offset++).toISOString();
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
