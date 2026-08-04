import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { FormlessProgramReplicaDeleteBlockedError } from "../../client/db.ts";
import { resetLocalBrowserReplicaState } from "../../client/sync.ts";
import {
  accountDefaultRedirectTarget,
  parseAccountRedirectTarget,
  type AccountRedirectTarget,
  type InstanceAuthErrorCode,
} from "../../shared/instance-auth.ts";
import { runtimeTopologyRoutes } from "../../shared/runtime-topology.ts";
import { AccountSignInApiError, fetchAccountSessionStatus } from "./account-sign-in.tsx";
import type { ApplicationSystemStateContract } from "@dpeek/formless-presentation/contract";
import { projectApplicationSystemState } from "./application-system-state-projection.ts";
import { ApplicationSystemStateRuntime } from "./application-system-state-runtime.tsx";

export type LocalSessionRouteState =
  | { code: "replica-reset-blocked"; status: "blocked" }
  | { status: "checking" }
  | { status: "complete" }
  | { code: LocalSessionFailureCode; status: "failed" }
  | { status: "resetting" };

export type LocalSessionFailureCode =
  | InstanceAuthErrorCode
  | "invalid-response"
  | "network-failure"
  | "replica-reset-failed";

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
            detail:
              "Local Program browser replica reset was blocked. Close other tabs using this local runtime and try again.",
            id: "feedback:local-session-blocked",
            intent: "warning" as const,
            title: "Browser cache reset blocked",
          },
        }
      : state.status === "failed"
        ? {
            feedback: {
              detail: localSessionFailureMessage(state.code),
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
    let resettingReplica = false;

    try {
      const session = await fetchAccountSessionStatus({ fetcher, signal: controller.signal });

      if (stopped) {
        return;
      }

      if (!session.authenticated) {
        onState({
          code: "unauthorized",
          status: "failed",
        });
        return;
      }

      if (resetBrowserStateRequested) {
        resettingReplica = true;
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
          code: "replica-reset-blocked",
          status: "blocked",
        });
        return;
      }

      onState({
        code:
          error instanceof AccountSignInApiError
            ? error.code
            : resettingReplica
              ? "replica-reset-failed"
              : "network-failure",
        status: "failed",
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
      return "Close other tabs using this local runtime, then try again.";
    case "failed":
      return localSessionFailureMessage(state.code);
    case "checking":
      return "Verifying owner access.";
    case "complete":
      return "Loading from Authority storage.";
    case "resetting":
      return "Clearing same-origin Formless replicas.";
  }
}

function localSessionFailureMessage(code: LocalSessionFailureCode): string {
  if (code === "network-failure") {
    return "The local session service could not be reached. Check your connection and try again.";
  }
  if (code === "invalid-response") {
    return "The local session service returned an invalid response. Try again.";
  }
  if (code === "replica-reset-failed") {
    return "The local browser cache could not be reset. Try again.";
  }
  if (code === "unauthorized") return "Local owner session is not authenticated.";
  if (code === "forbidden") return "Local owner session access is not allowed.";
  if (code === "expired") return "The local owner session has expired. Start it again.";
  if (code === "conflict") return "Local session state changed. Try again.";
  if (code === "unavailable" || code === "internal-failure") {
    return "The local session service is unavailable. Try again.";
  }
  if (code === "not-found" || code === "method-not-allowed") {
    return "The local session service is unavailable at this address.";
  }
  return "The local session request was invalid. Try again.";
}
