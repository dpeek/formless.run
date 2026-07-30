// @vitest-environment jsdom

import { act, render } from "@testing-library/react";
import { Router } from "wouter";
import { describe, expect, it, vi } from "vite-plus/test";

import { ProtectedRouteGuard, startProtectedRouteGuardSession } from "../app.tsx";

vi.mock("./routes/application-system-state-runtime.tsx", () => ({
  ApplicationSystemStateRuntime: () => <output data-route-state="loading" />,
}));
(
  globalThis as {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;
describe("protected route guard", () => {
  it("accepts management navigation only after the protected control-plane boundary accepts it", async () => {
    const accepted = await runGuard("management", {
      response: Response.json({ records: [] }),
      route: "/access",
    });
    const rejected = await runGuard("management", {
      response: Response.json({ error: "Management authority is required." }, { status: 401 }),
      route: "/",
    });

    expect(accepted.calls).toEqual(["/api/formless/program/bootstrap"]);
    expect(accepted.states).toEqual(["checking", "authorized"]);
    expect(rejected.calls).toEqual(["/api/formless/program/bootstrap"]);
    expect(rejected.states).toEqual(["checking", "redirect"]);
  });

  it("checks exact app-role authorization before an installed app can mount or sync", async () => {
    const matching = await runGuard("authenticated", {
      requiredRole: "app.admin",
      response: Response.json({
        continueTo: "/apps/personal/settings",
        status: "complete",
        target: {
          appInstallId: "personal",
          returnTo: "/apps/personal/settings",
          routeId: "route:personal:admin",
          storageIdentity: "app:personal",
          targetOrigin: "https://formless.test",
          targetProfile: "app",
        },
      }),
      route: "/apps/personal/settings",
    });
    const wrongApp = await runGuard("authenticated", {
      requiredRole: "app.admin",
      response: Response.json(
        {
          gates: [{ kind: "role-review", roleKey: "app.admin", scopeKind: "app-install" }],
          status: "blocked",
        },
        { status: 409 },
      ),
      route: "/apps/work",
    });

    expect(matching.calls).toEqual(["/formless/auth?returnTo=%2Fapps%2Fpersonal%2Fsettings"]);
    expect(matching.states).toEqual(["checking", "authorized"]);
    expect(wrongApp.calls).toEqual(["/formless/auth?returnTo=%2Fapps%2Fwork"]);
    expect(wrongApp.states).toEqual(["checking", "redirect"]);
    expect(`${matching.calls.join(" ")} ${wrongApp.calls.join(" ")}`).not.toContain("/bootstrap");
    expect(`${matching.calls.join(" ")} ${wrongApp.calls.join(" ")}`).not.toContain("/sync");
  });

  it("keeps owner routes on the owner-session check", async () => {
    const result = await runGuard("owner", {
      response: Response.json({
        authenticated: false,
        setupComplete: true,
      }),
      route: "/owner-only",
    });

    expect(result.calls).toEqual(["/api/formless/session"]);
    expect(result.states).toEqual(["checking", "redirect"]);
  });

  it("does not reuse an authorized route state while a new app role check is pending", async () => {
    window.history.replaceState(null, "", "/access");
    let renderer!: ReturnType<typeof render>;

    await act(async () => {
      renderer = render(
        <Router ssrPath="/access">
          <ProtectedRouteGuard
            access="management"
            fetcher={async () => Response.json({ records: [] })}
          >
            <output data-protected-child="management" />
          </ProtectedRouteGuard>
        </Router>,
      );
      await Promise.resolve();
    });

    expect(renderer.container.querySelector("[data-protected-child=management]")).not.toBeNull();

    const pending = deferred<Response>();
    window.history.replaceState(null, "", "/apps/work");
    await act(async () => {
      renderer.rerender(
        <Router ssrPath="/apps/work">
          <ProtectedRouteGuard
            access="authenticated"
            fetcher={async () => pending.promise}
            requiredRole="app.admin"
          >
            <output data-protected-child="app" />
          </ProtectedRouteGuard>
        </Router>,
      );
      await Promise.resolve();
    });

    expect(renderer.container.querySelector("[data-protected-child=app]")).toBeNull();
    expect(renderer.container.querySelector("[data-route-state=loading]")).not.toBeNull();

    renderer.unmount();
    window.history.replaceState(null, "", "/");
  });
});

async function runGuard(
  access: "authenticated" | "management" | "owner",
  input: {
    requiredRole?: "app.admin";
    response: Response;
    route: `/${string}`;
  },
) {
  const calls: string[] = [];
  const states: string[] = [];
  const fetcher: typeof fetch = async (request) => {
    calls.push(
      typeof request === "string"
        ? request
        : request instanceof URL
          ? request.toString()
          : request.url,
    );
    return input.response;
  };
  const stop = startProtectedRouteGuardSession({
    access,
    fetcher,
    location: input.route,
    onState: (state) => states.push(state),
    requiredRole: input.requiredRole,
  });

  try {
    await waitFor(() => states.length === 2);
  } finally {
    stop();
  }

  return { calls, states };
}

async function waitFor(assertion: () => boolean) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (assertion()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error("Timed out waiting for protected route guard state.");
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}
