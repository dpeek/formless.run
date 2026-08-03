// @vitest-environment jsdom

import { act, render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it } from "vite-plus/test";

import type {
  ProgramSessionResponse,
  ProgramSessionTargetBinding,
} from "../shared/instance-auth.ts";
import {
  ProgramRuntimeBoundary,
  type ProgramRuntimeDependencies,
  type ProgramRuntimeSnapshot,
} from "./program-runtime-boundary.tsx";

describe("persistent Program runtime boundary", () => {
  it("keeps session, shell, replica, broadcast, and push lifetimes across route workspaces", async () => {
    const calls: string[] = [];
    const mounts: string[] = [];
    const unmounts: string[] = [];
    const dependencies = runtimeDependencies({
      bootstrap: async () => {
        calls.push("bootstrap");
      },
      connectBroadcast: () => {
        calls.push("broadcast:start");
        return () => calls.push("broadcast:stop");
      },
      fetchSession: async (returnTo) => {
        calls.push(`session:${returnTo}`);
        return readySession("principal:one", target("route:one"));
      },
      hydrate: async () => {
        calls.push("hydrate");
      },
      prepareReplica: async () => {
        calls.push("replica:prepare");
        return "reset";
      },
      startPush: () => {
        calls.push("push:start");
        return () => calls.push("push:stop");
      },
    });

    function LifetimeProbe({ id }: { id: string }) {
      useEffect(() => {
        mounts.push(id);
        return () => {
          unmounts.push(id);
        };
      }, [id]);
      return null;
    }

    function Harness({ path }: { path: `/${string}` }) {
      return (
        <ProgramRuntimeBoundary currentPath={path} dependencies={dependencies}>
          {(runtime) => (
            <>
              <output data-runtime-status={runtime.status} />
              <LifetimeProbe id="shell" />
              <LifetimeProbe id={`workspace:${path}`} key={path} />
            </>
          )}
        </ProgramRuntimeBoundary>
      );
    }

    const renderer = render(<Harness path="/tasks" />);
    await waitFor(() => expect(runtimeStatus(renderer)).toBe("ready"));
    expect(calls).toEqual([
      "session:/tasks",
      "replica:prepare",
      "broadcast:start",
      "hydrate",
      "bootstrap",
      "push:start",
    ]);
    expect(mounts).toEqual(["shell", "workspace:/tasks"]);

    renderer.rerender(<Harness path="/site" />);

    expect(runtimeStatus(renderer)).toBe("ready");
    expect(calls).toEqual([
      "session:/tasks",
      "replica:prepare",
      "broadcast:start",
      "hydrate",
      "bootstrap",
      "push:start",
    ]);
    expect(mounts).toEqual(["shell", "workspace:/tasks", "workspace:/site"]);
    expect(unmounts).toEqual(["workspace:/tasks"]);

    renderer.unmount();
    expect(calls.slice(-2)).toEqual(["broadcast:stop", "push:stop"]);
    expect(unmounts).toEqual(["workspace:/tasks", "shell", "workspace:/site"]);
  });

  it.each(["anonymous", "blocked", "forbidden"] as const)(
    "clears the persistent cache before publishing a %s session",
    async (status) => {
      const calls: string[] = [];
      const dependencies = runtimeDependencies({
        clearReplica: async () => {
          calls.push("replica:clear");
        },
        fetchSession: async () => sessionWithStatus(status),
        publishReplicaReset: () => calls.push("replica:publish-reset"),
      });
      const renderer = render(
        <ProgramRuntimeBoundary currentPath="/tasks" dependencies={dependencies}>
          {(runtime) => <output data-runtime-status={runtime.status} />}
        </ProgramRuntimeBoundary>,
      );

      await waitFor(() => expect(runtimeStatus(renderer)).toBe(status));
      expect(calls).toEqual(["replica:clear", "replica:publish-reset"]);
      renderer.unmount();
    },
  );

  it.each([
    {
      first: readySession("principal:one", target("route:one")),
      name: "principal change",
      second: readySession("principal:two", target("route:one")),
    },
    {
      first: readySession("principal:one", target("route:one")),
      name: "target change",
      second: readySession("principal:one", target("route:two")),
    },
  ])("prevents stale async publication after a $name", async ({ first, second }) => {
    const firstHydration = deferred<void>();
    const publications: string[] = [];
    const preparedTargets: string[] = [];
    let sessionIndex = 0;
    let firstHydrationStarted = false;
    const dependencies = runtimeDependencies({
      bootstrap: async ({ principalId }) => {
        publications.push(`bootstrap:${principalId}`);
      },
      fetchSession: async () => [first, second][sessionIndex++]!,
      hydrate: async (boundary) => {
        if (!firstHydrationStarted) {
          firstHydrationStarted = true;
          await firstHydration.promise;
        }

        if (boundary.canPublish()) {
          publications.push(`hydrate:${boundary.principalId}`);
        }
      },
      prepareReplica: async (_principalId, runtimeTarget) => {
        preparedTargets.push(runtimeTarget.routeId);
        return "reused";
      },
    });

    function Harness({ lifetime }: { lifetime: string }) {
      return (
        <ProgramRuntimeBoundary currentPath="/tasks" dependencies={dependencies} key={lifetime}>
          {(runtime) => <output data-runtime-status={runtime.status} />}
        </ProgramRuntimeBoundary>
      );
    }

    const renderer = render(<Harness lifetime="first" />);
    await waitFor(() => expect(firstHydrationStarted).toBe(true));
    renderer.rerender(<Harness lifetime="second" />);
    await waitFor(() => expect(runtimeStatus(renderer)).toBe("ready"));

    await act(async () => {
      firstHydration.resolve();
      await firstHydration.promise;
    });

    expect(preparedTargets).toEqual([first.target.routeId, second.target.routeId]);
    expect(publications).toEqual([
      `hydrate:${second.principal.principalId}`,
      `bootstrap:${second.principal.principalId}`,
    ]);
    renderer.unmount();
  });

  it("fails closed when the principal-bound replica cannot be reset", async () => {
    const calls: string[] = [];
    const dependencies = runtimeDependencies({
      fetchSession: async () => readySession("principal:one", target("route:one")),
      hydrate: async () => {
        calls.push("hydrate");
      },
      prepareReplica: async () => {
        throw new Error("Local Program browser replica reset was blocked.");
      },
    });
    const renderer = render(
      <ProgramRuntimeBoundary currentPath="/tasks" dependencies={dependencies}>
        {(runtime) => (
          <output data-runtime-message={runtime.message} data-runtime-status={runtime.status} />
        )}
      </ProgramRuntimeBoundary>,
    );

    await waitFor(() => expect(runtimeStatus(renderer)).toBe("failed"));
    expect(renderer.container.querySelector("output")?.getAttribute("data-runtime-message")).toBe(
      "Local Program browser replica reset was blocked.",
    );
    expect(calls).toEqual([]);
    renderer.unmount();
  });

  it("ends synchronization and clears the principal cache after logout", async () => {
    const calls: string[] = [];
    let sessionIndex = 0;
    const dependencies = runtimeDependencies({
      clearReplica: async () => {
        calls.push("replica:clear");
      },
      connectBroadcast: () => () => calls.push("broadcast:stop"),
      fetchSession: async () =>
        sessionIndex++ === 0
          ? readySession("principal:one", target("route:one"))
          : sessionWithStatus("anonymous"),
      logout: async () => ({ authenticated: false }),
      publishReplicaReset: () => calls.push("replica:publish-reset"),
      startPush: () => () => calls.push("push:stop"),
    });
    let snapshot: ProgramRuntimeSnapshot | undefined;
    const renderer = render(
      <ProgramRuntimeBoundary currentPath="/tasks" dependencies={dependencies}>
        {(runtime) => {
          snapshot = runtime;
          return <output data-runtime-status={runtime.status} />;
        }}
      </ProgramRuntimeBoundary>,
    );
    await waitFor(() => expect(runtimeStatus(renderer)).toBe("ready"));

    await act(async () => {
      await snapshot?.logout();
    });

    expect(runtimeStatus(renderer)).toBe("anonymous");
    expect(calls).toEqual([
      "broadcast:stop",
      "push:stop",
      "replica:clear",
      "replica:publish-reset",
    ]);
    renderer.unmount();
  });

  it("coalesces expiry, cross-tab, and push invalidation into one current refresh", async () => {
    const refreshed = deferred<ProgramSessionResponse>();
    const published: string[] = [];
    let expire: (() => void) | undefined;
    let invalidateFromAnotherTab: (() => void) | undefined;
    let pushPolicyViolation: (() => void) | undefined;
    let now = Date.parse("2026-08-02T06:00:00.000Z");
    let sessionCalls = 0;
    const dependencies = runtimeDependencies({
      fetchSession: async () => {
        sessionCalls += 1;
        return sessionCalls === 1
          ? readySession("principal:one", target("route:one"))
          : refreshed.promise;
      },
      listenForInvalidation: (listener) => {
        invalidateFromAnotherTab = () => listener("cross-tab");
        return () => undefined;
      },
      now: () => now,
      publishInvalidation: (reason) => published.push(reason),
      scheduleRefresh: (listener) => {
        expire = listener;
        return () => undefined;
      },
      startPush: (boundary) => {
        pushPolicyViolation = boundary.onAuthorityInvalidated;
        return () => undefined;
      },
    });
    const renderer = render(
      <ProgramRuntimeBoundary currentPath="/tasks" dependencies={dependencies}>
        {(runtime) => <output data-runtime-status={runtime.status} />}
      </ProgramRuntimeBoundary>,
    );
    await waitFor(() => expect(runtimeStatus(renderer)).toBe("ready"));

    now = Date.parse("2026-08-02T13:00:00.000Z");
    act(() => {
      expire?.();
      invalidateFromAnotherTab?.();
      pushPolicyViolation?.();
    });

    expect(runtimeStatus(renderer)).toBe("loading");
    expect(sessionCalls).toBe(2);

    await act(async () => {
      refreshed.resolve(sessionWithStatus("forbidden"));
      await refreshed.promise;
    });

    await waitFor(() => expect(runtimeStatus(renderer)).toBe("forbidden"));
    expect(sessionCalls).toBe(2);
    expect(published).toEqual(["session-expiry", "push-policy-violation"]);
    renderer.unmount();
  });

  it("pulls after fresh suspension and refreshes authority after stale focus", async () => {
    let focus: ((event: { suspended: boolean }) => void) | undefined;
    let now = 1_000;
    let pullRequests = 0;
    let sessionCalls = 0;
    const dependencies = runtimeDependencies({
      fetchSession: async () => {
        sessionCalls += 1;
        return readySession("principal:one", target("route:one"));
      },
      listenForFocusRecovery: (listener) => {
        focus = listener;
        return () => undefined;
      },
      now: () => now,
      startPush: () =>
        Object.assign(() => undefined, {
          requestSync: () => {
            pullRequests += 1;
          },
        }),
    });
    const renderer = render(
      <ProgramRuntimeBoundary currentPath="/tasks" dependencies={dependencies}>
        {(runtime) => <output data-runtime-status={runtime.status} />}
      </ProgramRuntimeBoundary>,
    );
    await waitFor(() => expect(runtimeStatus(renderer)).toBe("ready"));

    act(() => focus?.({ suspended: false }));
    expect(sessionCalls).toBe(1);
    expect(pullRequests).toBe(0);

    act(() => focus?.({ suspended: true }));
    expect(sessionCalls).toBe(1);
    expect(pullRequests).toBe(1);

    now += 60_000;
    act(() => focus?.({ suspended: false }));
    await waitFor(() => {
      expect(sessionCalls).toBe(2);
      expect(runtimeStatus(renderer)).toBe("ready");
    });

    expect(pullRequests).toBe(1);
    renderer.unmount();
  });

  it("refreshes caller facts after role upgrade, downgrade, and owner removal", async () => {
    const sessions = [
      readySessionWithFacts({ owner: true, roleId: "role_member" }),
      readySessionWithFacts({ owner: true, roleId: "role_administrator" }),
      readySessionWithFacts({ owner: true, roleId: "role_member" }),
      readySessionWithFacts({ owner: false, roleId: "role_member" }),
    ];
    let authorityChanged: (() => void) | undefined;
    let sessionCalls = 0;
    let snapshot: ProgramRuntimeSnapshot | undefined;
    const dependencies = runtimeDependencies({
      fetchSession: async () => sessions[sessionCalls++]!,
      subscribeAuthorityChanges: (_principalId, listener) => {
        authorityChanged = listener;
        return () => undefined;
      },
    });
    const renderer = render(
      <ProgramRuntimeBoundary currentPath="/tasks" dependencies={dependencies}>
        {(runtime) => {
          snapshot = runtime;
          return <output data-runtime-status={runtime.status} />;
        }}
      </ProgramRuntimeBoundary>,
    );
    await waitFor(() => expect(sessionCalls).toBe(1));

    for (const [index, expectedCalls] of [2, 3, 4].entries()) {
      act(() => authorityChanged?.());
      await waitFor(() => {
        expect(sessionCalls).toBe(expectedCalls);
        expect(snapshot?.session).toEqual(sessions[index + 1]);
      });
    }

    expect(snapshot?.session).toEqual(sessions[3]);
    renderer.unmount();
  });

  it.each([
    { name: "session revocation through 401", result: sessionWithStatus("anonymous") },
    { name: "authority staleness through 403", result: sessionWithStatus("forbidden") },
  ])("fails closed and refreshes after $name", async ({ result }) => {
    let invalidated: (() => void) | undefined;
    let sessionCalls = 0;
    const dependencies = runtimeDependencies({
      fetchSession: async () => {
        sessionCalls += 1;
        return sessionCalls === 1 ? readySession("principal:one", target("route:one")) : result;
      },
      listenForInvalidation: (listener) => {
        invalidated = () => listener("protected-rejection");
        return () => undefined;
      },
    });
    const renderer = render(
      <ProgramRuntimeBoundary currentPath="/tasks" dependencies={dependencies}>
        {(runtime) => <output data-runtime-status={runtime.status} />}
      </ProgramRuntimeBoundary>,
    );
    await waitFor(() => expect(runtimeStatus(renderer)).toBe("ready"));

    act(() => invalidated?.());

    await waitFor(() => expect(runtimeStatus(renderer)).toBe(result.status));
    expect(sessionCalls).toBe(2);
    renderer.unmount();
  });

  it("does not publish refresh completion after runtime teardown", async () => {
    const refresh = deferred<ProgramSessionResponse>();
    let invalidated: (() => void) | undefined;
    let sessionCalls = 0;
    let bootstrapCalls = 0;
    const dependencies = runtimeDependencies({
      bootstrap: async () => {
        bootstrapCalls += 1;
      },
      fetchSession: async () => {
        sessionCalls += 1;
        return sessionCalls === 1
          ? readySession("principal:one", target("route:one"))
          : refresh.promise;
      },
      listenForInvalidation: (listener) => {
        invalidated = () => listener("cross-tab");
        return () => undefined;
      },
    });
    const renderer = render(
      <ProgramRuntimeBoundary currentPath="/tasks" dependencies={dependencies}>
        {(runtime) => <output data-runtime-status={runtime.status} />}
      </ProgramRuntimeBoundary>,
    );
    await waitFor(() => expect(runtimeStatus(renderer)).toBe("ready"));

    act(() => invalidated?.());
    expect(sessionCalls).toBe(2);
    renderer.unmount();

    await act(async () => {
      refresh.resolve(readySession("principal:one", target("route:one")));
      await refresh.promise;
    });

    expect(bootstrapCalls).toBe(1);
  });
});

function runtimeDependencies(
  overrides: Partial<ProgramRuntimeDependencies> = {},
): Partial<ProgramRuntimeDependencies> {
  return {
    bootstrap: async () => undefined,
    clearReplica: async () => undefined,
    connectBroadcast: () => () => undefined,
    fetchSession: async () => readySession("principal:one", target("route:one")),
    hydrate: async () => undefined,
    listenForFocusRecovery: () => () => undefined,
    listenForInvalidation: () => () => undefined,
    logout: async () => ({ authenticated: false }),
    navigate: () => undefined,
    now: () => Date.parse("2026-08-02T06:00:00.000Z"),
    prepareReplica: async () => "reused",
    publishInvalidation: () => undefined,
    publishReplicaReset: () => undefined,
    resetMemory: () => undefined,
    scheduleRefresh: () => () => undefined,
    startPush: () => () => undefined,
    subscribeAuthorityChanges: () => () => undefined,
    ...overrides,
  };
}

function readySessionWithFacts({
  owner,
  roleId,
}: {
  owner: boolean;
  roleId: `role_${string}`;
}): Extract<ProgramSessionResponse, { status: "ready" }> {
  return {
    ...readySession("principal:one", target("route:one")),
    callerFacts: { active: true, kind: "principal", owner, roleId },
  };
}

function readySession(
  principalId: string,
  runtimeTarget: ProgramSessionTargetBinding,
): Extract<ProgramSessionResponse, { status: "ready" }> {
  return {
    callerFacts: { active: true, kind: "principal", owner: false },
    principal: { displayName: principalId, principalId },
    session: { expiresAt: "2026-08-02T12:00:00.000Z" },
    status: "ready",
    target: runtimeTarget,
  };
}

function sessionWithStatus(status: "anonymous" | "blocked" | "forbidden"): ProgramSessionResponse {
  if (status === "anonymous") {
    return { setupComplete: true, status };
  }

  const principal = { displayName: "Principal", principalId: "principal:one" };
  const session = { expiresAt: "2026-08-02T12:00:00.000Z" };

  if (status === "forbidden") {
    return { principal, session, status };
  }

  return {
    accountCompletion: {
      gate: { credentialMethod: "passkey", kind: "credential" },
      status: "blocked",
      target: {
        access: "management",
        returnTo: "/tasks",
        routeId: "route:one",
        targetOrigin: window.location.origin,
        targetProfile: "instance",
      },
    },
    principal,
    session,
    status,
    target: target("route:one"),
  };
}

function target(routeId: string): ProgramSessionTargetBinding {
  return {
    routeAccess: "management",
    routeId,
    storageIdentity: "instance:control-plane",
    targetOrigin: window.location.origin,
    targetProfile: "instance",
  };
}

function runtimeStatus(renderer: ReturnType<typeof render>) {
  return renderer.container.querySelector("output")?.getAttribute("data-runtime-status");
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
