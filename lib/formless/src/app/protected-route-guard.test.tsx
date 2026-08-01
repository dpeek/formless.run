// @vitest-environment jsdom

import { act, render } from "@testing-library/react";
import { Router } from "wouter";
import { describe, expect, it, vi } from "vite-plus/test";
import { useEffect } from "react";

import { ProtectedRouteGuard, startProtectedRouteGuardSession } from "../app.tsx";

vi.mock("./routes/application-system-state-runtime.tsx", () => ({
  ApplicationSystemStateRuntime: ({ snapshot }: { snapshot: { id: string } }) => (
    <output
      data-route-state={
        snapshot.id === "application-system-state:route-forbidden"
          ? "forbidden"
          : snapshot.id === "application-system-state:route-access-failed"
            ? "failed"
            : "loading"
      }
    />
  ),
}));
(
  globalThis as {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;
describe("protected route guard", () => {
  it("accepts management navigation only after the protected control-plane boundary accepts it", async () => {
    const accepted = await runGuard("management", {
      response: completeRouteResponse("/access"),
      route: "/access",
    });
    const rejected = await runGuard("management", {
      response: Response.json(
        { error: "Authenticated account session is required." },
        { status: 401 },
      ),
      route: "/",
    });

    expect(accepted.calls).toEqual(["/formless/auth?returnTo=%2Faccess"]);
    expect(accepted.states).toEqual(["checking", "authorized"]);
    expect(rejected.calls).toEqual(["/formless/auth?returnTo=%2F"]);
    expect(rejected.states).toEqual(["checking", "redirect"]);
  });

  it("keeps Program owner routes on the owner-session check", async () => {
    const result = await runGuard("owner", {
      response: Response.json({ authenticated: false, setupComplete: true }),
      route: "/site/settings",
    });

    expect(result.calls).toEqual(["/api/formless/session"]);
    expect(result.states).toEqual(["checking", "redirect"]);
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

  it("stops rendering and protected loading while current Program authority is rechecked", async () => {
    window.history.replaceState(null, "", "/access");
    let renderer!: ReturnType<typeof render>;
    const protectedLoads: string[] = [];

    function ProtectedLoad({ route }: { route: string }) {
      useEffect(() => {
        protectedLoads.push(route);
      }, [route]);

      return <output data-protected-child={route} />;
    }

    await act(async () => {
      renderer = render(
        <Router ssrPath="/access">
          <ProtectedRouteGuard
            access="management"
            fetcher={async () => completeRouteResponse("/access")}
          >
            <ProtectedLoad route="access" />
          </ProtectedRouteGuard>
        </Router>,
      );
      await Promise.resolve();
    });

    expect(renderer.container.querySelector("[data-protected-child=access]")).not.toBeNull();
    expect(protectedLoads).toEqual(["access"]);

    const pending = deferred<Response>();
    window.history.replaceState(null, "", "/deployments");
    await act(async () => {
      renderer.rerender(
        <Router ssrPath="/deployments">
          <ProtectedRouteGuard access="management" fetcher={async () => pending.promise}>
            <ProtectedLoad route="deployments" />
          </ProtectedRouteGuard>
        </Router>,
      );
      await Promise.resolve();
    });

    expect(renderer.container.querySelector("[data-protected-child=deployments]")).toBeNull();
    expect(renderer.container.querySelector("[data-route-state=loading]")).not.toBeNull();
    expect(protectedLoads).toEqual(["access"]);

    await act(async () => {
      pending.resolve(forbiddenRouteResponse());
      await pending.promise;
    });

    expect(renderer.container.querySelector("[data-protected-child=deployments]")).toBeNull();
    expect(renderer.container.querySelector("[data-route-state=forbidden]")).not.toBeNull();
    expect(protectedLoads).toEqual(["access"]);

    renderer.unmount();
    window.history.replaceState(null, "", "/");
  });
});

async function runGuard(
  access: "authenticated" | "management" | "owner",
  input: {
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

function completeRouteResponse(route: `/${string}`): Response {
  return Response.json({
    continueTo: route,
    status: "complete",
    target: routeTarget(route),
  });
}

function forbiddenRouteResponse(): Response {
  return Response.json(
    {
      principal: {
        displayName: "Insufficient member",
        principalId: "principal:member",
      },
      status: "forbidden",
    },
    { status: 403 },
  );
}

function routeTarget(route: `/${string}`) {
  return {
    returnTo: route,
    routeId: "route:instance",
    targetOrigin: "https://formless.test",
    targetProfile: "instance",
  };
}
