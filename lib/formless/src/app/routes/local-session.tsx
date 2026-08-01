import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { FormlessProgramReplicaDeleteBlockedError } from "../../client/db.ts";
import { resetLocalBrowserReplicaState } from "../../client/sync.ts";
import {
  accountDefaultRedirectTarget,
  parseAccountRedirectTarget,
  type AccountRedirectTarget,
} from "../../shared/instance-auth.ts";
import { runtimeTopologyRoutes } from "../../shared/runtime-topology.ts";
import { fetchAccountSessionStatus } from "./account-sign-in.tsx";
import type { ApplicationSystemStateContract } from "@dpeek/formless-presentation/contract";
import { projectApplicationSystemState } from "./application-system-state-projection.ts";
import { ApplicationSystemStateRuntime } from "./application-system-state-runtime.tsx";

export type LocalSessionRouteState =
  | { status: "blocked"; message: string }
  | { status: "checking" }
  | { status: "complete" }
  | { status: "failed"; message: string }
  | { status: "resetting" };

type StartLocalSessionRouteSessionOptions = {
  fetcher?: typeof fetch;
  onComplete?: () => void;
  onState: (state: LocalSessionRouteState) => void;
  resetBrowserState?: () => Promise<void>;
  resetBrowserStateRequested?: boolean;
};

export function LocalSessionRoute() {
  const [location, setLocation] = useLocation();
  const [state, setState] = useState<LocalSessionRouteState>({ status: "checking" });
  const search = localSessionSearchFromRouteLocation(location);
  const redirectTarget = localSessionRedirectTargetFromSearch(search);
  const resetBrowserStateRequested = localSessionBrowserResetRequestedFromSearch(search);

  useEffect(
    () =>
      startLocalSessionRouteSession({
        onComplete: () => setLocation(redirectTarget, { replace: true }),
        onState: setState,
        resetBrowserStateRequested,
      }),
    [redirectTarget, resetBrowserStateRequested, setLocation],
  );

  return <LocalSessionRouteView state={state} />;
}

export function LocalSessionRouteView({ state }: { state: LocalSessionRouteState }) {
  return <ApplicationSystemStateRuntime snapshot={projectLocalSessionRouteSystemState(state)} />;
}

export function projectLocalSessionRouteSystemState(
  state: LocalSessionRouteState,
): ApplicationSystemStateContract {
  return projectApplicationSystemState({
    ...(state.status === "blocked"
      ? {
          feedback: {
            detail: state.message,
            id: "feedback:local-session-blocked",
            intent: "warning" as const,
            title: "Browser cache reset blocked",
          },
        }
      : state.status === "failed"
        ? {
            feedback: {
              detail: state.message,
              id: "feedback:local-session-failed",
              intent: "danger" as const,
              title: "Local session failed",
            },
          }
        : {}),
    heading: localSessionRouteHeading(state),
    id: "application-system-state:local-session",
    message: localSessionRouteMessage(state),
    state:
      state.status === "blocked" ? "blocked" : state.status === "failed" ? "failure" : "loading",
  });
}

export function startLocalSessionRouteSession({
  fetcher = fetch,
  onComplete,
  onState,
  resetBrowserState = resetLocalBrowserReplicaState,
  resetBrowserStateRequested = false,
}: StartLocalSessionRouteSessionOptions) {
  const controller = new AbortController();
  let stopped = false;

  onState({ status: "checking" });

  async function startSession() {
    try {
      const session = await fetchAccountSessionStatus({ fetcher, signal: controller.signal });

      if (stopped) {
        return;
      }

      if (!session.authenticated) {
        onState({
          status: "failed",
          message: "Local owner session is not authenticated.",
        });
        return;
      }

      if (resetBrowserStateRequested) {
        onState({ status: "resetting" });
        await resetBrowserState();
      }

      if (stopped) {
        return;
      }

      onState({ status: "complete" });
      onComplete?.();
    } catch (error) {
      if (stopped || controller.signal.aborted) {
        return;
      }

      if (error instanceof FormlessProgramReplicaDeleteBlockedError) {
        onState({
          status: "blocked",
          message: error.message,
        });
        return;
      }

      onState({
        status: "failed",
        message: error instanceof Error ? error.message : "Local session failed.",
      });
    }
  }

  void startSession();

  return () => {
    stopped = true;
    controller.abort();
  };
}

export function localSessionRedirectTargetFromSearch(search: string): AccountRedirectTarget {
  const normalized = search.startsWith("?") ? search : `?${search}`;
  const redirectTo = new URLSearchParams(normalized).get("redirectTo");
  const parsed = parseAccountRedirectTarget(redirectTo) ?? accountDefaultRedirectTarget;

  return parsed === runtimeTopologyRoutes.localSessionRoute ||
    parsed.startsWith(`${runtimeTopologyRoutes.localSessionRoute}?`)
    ? accountDefaultRedirectTarget
    : parsed;
}

export function localSessionBrowserResetRequestedFromSearch(search: string): boolean {
  const normalized = search.startsWith("?") ? search : `?${search}`;

  return new URLSearchParams(normalized).get("reset") === "1";
}

function localSessionSearchFromRouteLocation(location: string): string {
  const queryStart = location.indexOf("?");

  if (queryStart >= 0) {
    return location.slice(queryStart);
  }

  return typeof window === "undefined" ? "" : window.location.search;
}

function localSessionRouteHeading(state: LocalSessionRouteState): string {
  switch (state.status) {
    case "blocked":
      return "Browser cache reset blocked";
    case "checking":
      return "Checking local session";
    case "complete":
      return "Opening local runtime";
    case "failed":
      return "Local session failed";
    case "resetting":
      return "Resetting browser cache";
  }
}

function localSessionRouteMessage(state: LocalSessionRouteState): string {
  switch (state.status) {
    case "blocked":
    case "failed":
      return state.message;
    case "checking":
      return "Verifying owner access.";
    case "complete":
      return "Loading from Authority storage.";
    case "resetting":
      return "Clearing same-origin Formless replicas.";
  }
}
