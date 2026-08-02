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
  ApplicationSystemStateRuntime: ({ snapshot }: { snapshot: { id: string } }) => (
    <output data-system-state={snapshot.id} />
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

    fireEvent.click(renderer.getByTestId("intent-crm"));
    await waitFor(() => expect(selectedWorkspace(renderer)).toBe("contacts"));

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
      "contacts",
      "siteEditor",
      "taskHome",
      "siteEditor",
    ]);
    expect(workspaceUnmounts).toEqual([
      "taskHome",
      "siteEditor",
      "contacts",
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
    fireEvent.click(renderer.getByTestId("intent-settings"));
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
        <button data-testid="intent-crm" onClick={() => navigate("/crm")} type="button">
          CRM intent
        </button>
        <button data-testid="intent-settings" onClick={() => navigate("/settings")} type="button">
          Settings intent
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
