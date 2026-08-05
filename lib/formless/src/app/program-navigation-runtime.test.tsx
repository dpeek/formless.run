// @vitest-environment jsdom

import { fireEvent, render, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { App, type AppRouteComponents } from "../app.tsx";
import { formlessProgramSchema } from "../program/runtime.ts";
import type {
  ProgramSessionResponse,
  ProgramSessionTargetBinding,
} from "../shared/instance-auth.ts";
import { ApplicationNavigationBridge } from "./application-navigation.tsx";
import { createInstanceRuntimeProfile } from "./runtime-profile.ts";
import type { ProgramRuntimeDependencies } from "./program-runtime-boundary.tsx";

vi.mock("./routes/application-system-state-runtime.tsx", () => ({
  ApplicationSystemStateRuntime: ({ snapshot }: { snapshot: { id: string; message: string } }) => (
    <output data-system-message={snapshot.message} data-system-state={snapshot.id} />
  ),
}));

describe("Program navigation runtime", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/tasks");
  });

  it("keeps one startup lifetime across sidebar, intent, back, and forward navigation", async () => {
    const calls: string[] = [];
    const shellMounts: string[] = [];
    const shellUnmounts: string[] = [];
    const workspaceMounts: string[] = [];
    const workspaceUnmounts: string[] = [];
    const dependencies = runtimeDependencies(calls, readySession("administrator", "management"));
    const routeComponents = programRouteComponents({
      shellMounts,
      shellUnmounts,
      workspaceMounts,
      workspaceUnmounts,
    });
    const renderer = render(
      <BrowserHarness>
        <App
          localWorkspaceGatewayAvailable={false}
          programRuntimeDependencies={dependencies}
          routeComponents={routeComponents}
          runtimeProfile={createInstanceRuntimeProfile()}
        />
      </BrowserHarness>,
    );

    await waitFor(() => expect(selectedWorkspace(renderer)).toBe("taskHome"));
    expect(startupCalls(calls)).toEqual([
      "session:/tasks",
      "broadcast:start",
      "hydrate",
      "bootstrap",
      "push:start",
    ]);

    fireEvent.click(renderer.getByTestId("sidebar-site"));
    await waitFor(() => expect(selectedWorkspace(renderer)).toBe("siteEditor"));

    fireEvent.click(renderer.getByTestId("intent-subscribers"));
    await waitFor(() => expect(selectedWorkspace(renderer)).toBe("siteSubscribers"));

    window.history.back();
    await waitFor(() => expect(selectedWorkspace(renderer)).toBe("siteEditor"));

    window.history.back();
    await waitFor(() => expect(selectedWorkspace(renderer)).toBe("taskHome"));

    window.history.forward();
    await waitFor(() => expect(selectedWorkspace(renderer)).toBe("siteEditor"));

    expect(startupCalls(calls)).toEqual([
      "session:/tasks",
      "broadcast:start",
      "hydrate",
      "bootstrap",
      "push:start",
    ]);
    expect(shellMounts).toEqual(["shell"]);
    expect(shellUnmounts).toEqual([]);
    expect(workspaceMounts).toEqual([
      "taskHome",
      "siteEditor",
      "siteSubscribers",
      "siteEditor",
      "taskHome",
      "siteEditor",
    ]);
    expect(workspaceUnmounts).toEqual([
      "taskHome",
      "siteEditor",
      "siteSubscribers",
      "siteEditor",
      "taskHome",
    ]);
    expect(calls).not.toContain("broadcast:stop");
    expect(calls).not.toContain("push:stop");

    renderer.unmount();
    expect(calls.slice(-2)).toEqual(["broadcast:stop", "push:stop"]);
    expect(shellUnmounts).toEqual(["shell"]);
  });

  it("fails closed at the workspace outlet for a locally forbidden Program screen", async () => {
    const calls: string[] = [];
    const workspaceMounts: string[] = [];
    const dependencies = runtimeDependencies(calls, readySession("member", "authenticated"));
    const renderer = render(
      <BrowserHarness>
        <App
          localWorkspaceGatewayAvailable={false}
          programRuntimeDependencies={dependencies}
          routeComponents={programRouteComponents({ workspaceMounts })}
          runtimeProfile={createInstanceRuntimeProfile()}
        />
      </BrowserHarness>,
    );

    await waitFor(() => expect(selectedWorkspace(renderer)).toBe("taskHome"));
    fireEvent.click(renderer.getByTestId("intent-routes"));
    await waitFor(() =>
      expect(
        renderer.container.querySelector(
          '[data-system-state="application-system-state:route-forbidden"]',
        ),
      ).not.toBeNull(),
    );

    expect(workspaceMounts).toEqual(["taskHome"]);
    expect(startupCalls(calls)).toEqual([
      "session:/tasks",
      "broadcast:start",
      "hydrate",
      "bootstrap",
      "push:start",
    ]);

    renderer.unmount();
  });

  it("renders a runtime-owned screen through its registered stable key", async () => {
    window.history.replaceState(null, "", "/settings/access");
    const workspaceMounts: string[] = [];
    const renderer = render(
      <BrowserHarness>
        <App
          localWorkspaceGatewayAvailable={false}
          programRuntimeDependencies={runtimeDependencies(
            [],
            readySession("administrator", "management"),
          )}
          programSchema={runtimeAccessProgramSchema()}
          routeComponents={programRouteComponents({ workspaceMounts })}
          runtimeProfile={createInstanceRuntimeProfile()}
        />
      </BrowserHarness>,
    );

    await waitFor(() => expect(selectedWorkspace(renderer)).toBe("access"));
    await waitFor(() => expect(workspaceMounts).toEqual(["access"]));
    renderer.unmount();
  });

  it("applies Program screen authorization before rendering a runtime-owned child", async () => {
    window.history.replaceState(null, "", "/settings/access");
    const workspaceMounts: string[] = [];
    const renderer = render(
      <BrowserHarness>
        <App
          localWorkspaceGatewayAvailable={false}
          programRuntimeDependencies={runtimeDependencies(
            [],
            readySession("member", "authenticated"),
          )}
          programSchema={runtimeAccessProgramSchema()}
          routeComponents={programRouteComponents({ workspaceMounts })}
          runtimeProfile={createInstanceRuntimeProfile()}
        />
      </BrowserHarness>,
    );

    await waitFor(() =>
      expect(
        renderer.container.querySelector(
          '[data-system-state="application-system-state:route-forbidden"]',
        ),
      ).not.toBeNull(),
    );
    expect(workspaceMounts).toEqual([]);
    renderer.unmount();
  });

  it("fails closed when a runtime-owned screen has no registered route child", async () => {
    window.history.replaceState(null, "", "/runtime-unavailable");
    const workspaceMounts: string[] = [];
    const renderer = render(
      <BrowserHarness>
        <App
          localWorkspaceGatewayAvailable={false}
          programRuntimeDependencies={runtimeDependencies(
            [],
            readySession("administrator", "management"),
          )}
          programSchema={unavailableRuntimeScreenProgramSchema()}
          routeComponents={programRouteComponents({ workspaceMounts })}
          runtimeProfile={createInstanceRuntimeProfile()}
        />
      </BrowserHarness>,
    );

    await waitFor(() =>
      expect(
        renderer.container.querySelector(
          '[data-system-state="application-system-state:not-found"]',
        ),
      ).not.toBeNull(),
    );
    expect(workspaceMounts).toEqual([]);
    renderer.unmount();
  });

  it("projects fixed system-state copy when Program startup throws diagnostics", async () => {
    const dependencies = {
      ...runtimeDependencies([], readySession("administrator", "management")),
      fetchSession: async () => {
        throw new Error("storage path diagnostic alchemy-secret-value");
      },
    };
    const renderer = render(
      <BrowserHarness>
        <App
          localWorkspaceGatewayAvailable={false}
          programRuntimeDependencies={dependencies}
          routeComponents={programRouteComponents()}
          runtimeProfile={createInstanceRuntimeProfile()}
        />
      </BrowserHarness>,
    );

    await waitFor(() =>
      expect(
        renderer.container.querySelector(
          '[data-system-state="application-system-state:program-runtime-failed"]',
        ),
      ).not.toBeNull(),
    );
    expect(
      renderer.container
        .querySelector('[data-system-state="application-system-state:program-runtime-failed"]')
        ?.getAttribute("data-system-message"),
    ).toBe("Program runtime could not be started.");
    expect(renderer.container.innerHTML).not.toContain("alchemy-secret-value");
    renderer.unmount();
  });
});

function BrowserHarness({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();

  return <ApplicationNavigationBridge navigate={navigate}>{children}</ApplicationNavigationBridge>;
}

function programRouteComponents(
  probes: {
    shellMounts?: string[];
    shellUnmounts?: string[];
    workspaceMounts?: string[];
    workspaceUnmounts?: string[];
  } = {},
): AppRouteComponents {
  function Shell({ children }: { children: ReactNode }) {
    const [, navigate] = useLocation();

    useEffect(() => {
      probes.shellMounts?.push("shell");
      return () => {
        probes.shellUnmounts?.push("shell");
      };
    }, []);

    return (
      <section data-program-shell>
        <a data-testid="sidebar-site" href="/site">
          Site
        </a>
        <button
          data-testid="intent-subscribers"
          onClick={() => navigate("/site/subscribers")}
          type="button"
        >
          Subscribers intent
        </button>
        <button
          data-testid="intent-routes"
          onClick={() => navigate("/settings/routes")}
          type="button"
        >
          Routes intent
        </button>
        {children}
      </section>
    );
  }

  function Workspace({ screenKey }: { screenKey: string }) {
    useEffect(() => {
      probes.workspaceMounts?.push(screenKey);
      return () => {
        probes.workspaceUnmounts?.push(screenKey);
      };
    }, [screenKey]);

    return <output data-workspace={screenKey} />;
  }

  return {
    AccessRoute: () => <Workspace screenKey="access" />,
    ApplicationShellRuntimeBoundary: Shell,
    AuthAccountRoute: () => null,
    CollaboratorInvitationAcceptanceRoute: () => null,
    InstanceShellRoute: ({ screenKey }) => <Workspace screenKey={screenKey} />,
    LocalSessionRoute: () => null,
    AccountSignInRoute: () => null,
    SitePageRoute: () => null,
  };
}

function runtimeDependencies(
  calls: string[],
  session: Extract<ProgramSessionResponse, { status: "ready" }>,
): Partial<ProgramRuntimeDependencies> {
  return {
    bootstrap: async () => {
      calls.push("bootstrap");
    },
    clearReplica: async () => undefined,
    connectBroadcast: () => {
      calls.push("broadcast:start");
      return () => calls.push("broadcast:stop");
    },
    fetchSession: async (returnTo) => {
      calls.push(`session:${returnTo}`);
      return session;
    },
    hydrate: async () => {
      calls.push("hydrate");
    },
    listenForFocusRecovery: () => () => undefined,
    listenForInvalidation: () => () => undefined,
    now: () => Date.parse("2026-08-02T06:00:00.000Z"),
    prepareReplica: async () => "reused",
    publishInvalidation: () => undefined,
    publishReplicaReset: () => undefined,
    resetMemory: () => undefined,
    scheduleRefresh: () => () => undefined,
    startPush: () => {
      calls.push("push:start");
      return () => calls.push("push:stop");
    },
    subscribeAuthorityChanges: () => () => undefined,
  };
}

function readySession(
  roleKey: "administrator" | "member",
  routeAccess: ProgramSessionTargetBinding["routeAccess"],
): Extract<ProgramSessionResponse, { status: "ready" }> {
  const role = formlessProgramSchema.authorization?.roles.find(
    (candidate) => candidate.key === roleKey,
  );

  if (!role) {
    throw new Error(`Expected ${roleKey} Program role.`);
  }

  return {
    callerFacts: { active: true, kind: "principal", owner: false, roleId: role.id },
    principal: { displayName: role.label, principalId: `principal:${roleKey}` },
    session: { expiresAt: "2026-08-02T12:00:00.000Z" },
    status: "ready",
    target: {
      routeAccess,
      routeId: "route:instance",
      storageIdentity: "instance:control-plane",
      targetOrigin: window.location.origin,
      targetProfile: "instance",
    },
  };
}

function runtimeAccessProgramSchema() {
  return {
    ...formlessProgramSchema,
    screens: formlessProgramSchema.screens.map((screen) =>
      screen.key === "access"
        ? {
            key: screen.key,
            type: "runtime" as const,
            label: screen.label,
            path: screen.path,
            access: screen.access,
          }
        : screen,
    ),
  };
}

function unavailableRuntimeScreenProgramSchema() {
  return {
    ...formlessProgramSchema,
    screens: [
      ...formlessProgramSchema.screens,
      {
        key: "runtimeUnavailable",
        type: "runtime" as const,
        label: "Runtime unavailable",
        path: "/runtime-unavailable",
        access: { role: "administrator" as const },
      },
    ],
  };
}

function selectedWorkspace(renderer: ReturnType<typeof render>): string | null {
  return (
    renderer.container.querySelector("[data-workspace]")?.getAttribute("data-workspace") ?? null
  );
}

function startupCalls(calls: readonly string[]): string[] {
  return calls.filter(
    (call) =>
      call.startsWith("session:") ||
      call === "hydrate" ||
      call === "bootstrap" ||
      call === "broadcast:start" ||
      call === "push:start",
  );
}
