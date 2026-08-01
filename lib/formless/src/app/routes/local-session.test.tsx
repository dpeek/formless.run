import { describe, expect, it } from "vite-plus/test";
import { FormlessProgramReplicaDeleteBlockedError } from "../../client/db.ts";
import {
  localSessionBrowserResetRequestedFromSearch,
  localSessionRedirectTargetFromSearch,
  startLocalSessionRouteSession,
  type LocalSessionRouteState,
} from "./local-session.tsx";

const principal = {
  displayName: "Ada Owner",
  principalId: "owner-1",
};

describe("local session route data flow", () => {
  it("verifies an owner session and completes without resetting browser replicas by default", async () => {
    const states: LocalSessionRouteState[] = [];
    const events: string[] = [];
    const stop = startLocalSessionRouteSession({
      resetBrowserState: async () => {
        events.push("reset-browser-state");
      },
      fetcher: jsonFetcher({
        authenticated: true,
        principal,
        session: { expiresAt: "2026-06-21T00:00:00.000Z" },
        setupComplete: true,
      }),
      onComplete: () => events.push("complete"),
      onState: (state) => states.push(state),
    });

    try {
      await waitFor(() => states.some((state) => state.status === "complete"));
    } finally {
      stop();
    }

    expect(states).toEqual([{ status: "checking" }, { status: "complete" }]);
    expect(events).toEqual(["complete"]);
  });

  it("resets browser replicas when requested and completes", async () => {
    const states: LocalSessionRouteState[] = [];
    const events: string[] = [];
    const stop = startLocalSessionRouteSession({
      resetBrowserState: async () => {
        events.push("reset-browser-state");
      },
      fetcher: jsonFetcher({
        authenticated: true,
        principal,
        session: { expiresAt: "2026-06-21T00:00:00.000Z" },
        setupComplete: true,
      }),
      onComplete: () => events.push("complete"),
      onState: (state) => states.push(state),
      resetBrowserStateRequested: true,
    });

    try {
      await waitFor(() => states.some((state) => state.status === "complete"));
    } finally {
      stop();
    }

    expect(states).toEqual([
      { status: "checking" },
      { status: "resetting" },
      { status: "complete" },
    ]);
    expect(events).toEqual(["reset-browser-state", "complete"]);
  });

  it("reports blocked browser replica reset before redirecting", async () => {
    const states: LocalSessionRouteState[] = [];
    const events: string[] = [];
    const stop = startLocalSessionRouteSession({
      resetBrowserState: async () => {
        throw new FormlessProgramReplicaDeleteBlockedError();
      },
      fetcher: jsonFetcher({
        authenticated: true,
        principal,
        session: { expiresAt: "2026-06-21T00:00:00.000Z" },
        setupComplete: true,
      }),
      onComplete: () => events.push("complete"),
      onState: (state) => states.push(state),
      resetBrowserStateRequested: true,
    });

    try {
      await waitFor(() => states.some((state) => state.status === "blocked"));
    } finally {
      stop();
    }

    expect(states).toEqual([
      { status: "checking" },
      { status: "resetting" },
      {
        status: "blocked",
        message:
          "Local Program browser replica reset was blocked. Close other tabs using this local runtime and try again.",
      },
    ]);
    expect(events).toEqual([]);
  });

  it("does not reset replicas without an authenticated owner session", async () => {
    const states: LocalSessionRouteState[] = [];
    const events: string[] = [];
    const stop = startLocalSessionRouteSession({
      resetBrowserState: async () => {
        events.push("reset-browser-state");
      },
      fetcher: jsonFetcher({ authenticated: false, setupComplete: true }),
      onComplete: () => events.push("complete"),
      onState: (state) => states.push(state),
      resetBrowserStateRequested: true,
    });

    try {
      await waitFor(() => states.some((state) => state.status === "failed"));
    } finally {
      stop();
    }

    expect(states).toEqual([
      { status: "checking" },
      { status: "failed", message: "Local owner session is not authenticated." },
    ]);
    expect(events).toEqual([]);
  });

  it("keeps redirect targets same-origin and avoids local-session loops", () => {
    expect(localSessionRedirectTargetFromSearch("?redirectTo=%2Fsettings")).toBe("/settings");
    expect(localSessionRedirectTargetFromSearch("?redirectTo=https%3A%2F%2Fevil.example")).toBe(
      "/",
    );
    expect(localSessionRedirectTargetFromSearch("?redirectTo=%2Flocal-session")).toBe("/");
    expect(localSessionRedirectTargetFromSearch("?reset=1&redirectTo=%2Fsettings")).toBe(
      "/settings",
    );
  });

  it("parses browser reset requests from the local session query", () => {
    expect(localSessionBrowserResetRequestedFromSearch("?reset=1")).toBe(true);
    expect(localSessionBrowserResetRequestedFromSearch("?reset=0")).toBe(false);
    expect(localSessionBrowserResetRequestedFromSearch("")).toBe(false);
  });
});

function jsonFetcher(body: unknown, init: ResponseInit = {}): typeof fetch {
  return async (input) => {
    expect(input).toBe("/api/formless/session");

    return Response.json(body, init);
  };
}

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 1000;

  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  throw new Error("Timed out waiting for condition.");
}
