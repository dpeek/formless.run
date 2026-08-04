import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  WorkspaceGatewayApiError,
  fetchWorkspaceGatewayPush,
  fetchWorkspaceGatewayStatus,
  startWorkspaceGatewayPush,
  submitWorkspaceGatewayAccountSelection,
  workspaceGatewayBrowserConfig,
  type WorkspaceGatewayConfig,
  type WorkspaceGatewayPush,
  type WorkspaceGatewayPushResponse,
  type WorkspaceGatewayStatusResponse,
} from "@dpeek/formless-gateway/client";
import { InstanceManagementRuntime } from "./instance-management-runtime.tsx";
import { displaySafeText } from "./instance-management-display-safety.ts";

export type WorkspaceGatewayRouteState =
  | { status: "unavailable" }
  | { status: "loading" }
  | { status: "failed"; message: string }
  | {
      csrfToken?: string;
      currentPush?: WorkspaceGatewayPush;
      error?: string;
      latestPush?: WorkspaceGatewayPush;
      status: "ready";
    };

export function InstanceShellRoute({
  localWorkspaceGatewayAvailable: availableProp,
  routesScreenPath,
  screenKey,
  screenPath,
}: {
  localWorkspaceGatewayAvailable?: boolean | undefined;
  routesScreenPath?: `/${string}` | undefined;
  screenKey: string;
  screenPath: `/${string}`;
}) {
  const startPending = useRef(false);
  const config = useMemo(() => workspaceGatewayBrowserConfig(), []);
  const available = availableProp ?? config !== undefined;
  const [state, setState] = useState<WorkspaceGatewayRouteState>(() =>
    available ? { status: "loading" } : { status: "unavailable" },
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadInitialWorkspaceGatewayStatus({ config, signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        setState(response ? readyStateFromStatus(response) : { status: "unavailable" });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({
          message: displaySafeText(
            error instanceof Error ? error.message : "Workspace gateway status could not load.",
          ),
          status: "failed",
        });
      });
    return () => controller.abort();
  }, [config]);

  useEffect(() => {
    if (
      state.status !== "ready" ||
      !state.currentPush ||
      !workspaceGatewayPushPolls(state.currentPush)
    ) {
      return;
    }
    const pushId = state.currentPush.id;
    const interval = window.setInterval(() => {
      void refreshWorkspaceGatewayPush({ config, pushId, setState });
    }, 1_500);
    return () => window.clearInterval(interval);
  }, [config, state]);

  async function startPush() {
    if (state.status !== "ready" || !config || startPending.current) return;
    startPending.current = true;
    setState({ ...state, error: undefined });
    try {
      const response = await startWorkspaceGatewayPush(
        { mode: "apply" },
        { config, csrfToken: state.csrfToken },
      );
      if (!response) return setState({ status: "unavailable" });
      setState((current) => readyStateFromPush(response, current));
    } catch (error) {
      setState({
        ...state,
        error: displaySafeText(
          error instanceof Error ? error.message : "Workspace Push failed to start.",
        ),
      });
    } finally {
      startPending.current = false;
    }
  }

  async function selectAccount(input: {
    accountId: string;
    interactionId: string;
    pushId: string;
  }) {
    if (state.status !== "ready" || !config) return;
    try {
      const response = await submitWorkspaceGatewayAccountSelection(input, {
        config,
        csrfToken: state.csrfToken,
      });
      if (response) setState((current) => readyStateFromPush(response, current));
    } catch (error) {
      setState((current) =>
        current.status === "ready"
          ? {
              ...current,
              error: displaySafeText(
                error instanceof Error ? error.message : "Cloudflare account selection failed.",
              ),
            }
          : current,
      );
    }
  }

  return (
    <InstanceManagementRuntime
      onOpenWorkspaceAuthorization={(url) => window.open(url, "_blank", "noopener,noreferrer")}
      onPollWorkspacePush={(pushId) => refreshWorkspaceGatewayPush({ config, pushId, setState })}
      onSelectWorkspaceAccount={selectAccount}
      onStartWorkspacePush={startPush}
      routesScreenPath={routesScreenPath}
      screenKey={screenKey}
      screenPath={screenPath}
      workspaceGatewayState={state}
    />
  );
}

async function loadInitialWorkspaceGatewayStatus({
  config,
  signal,
}: {
  config?: WorkspaceGatewayConfig;
  signal: AbortSignal;
}): Promise<WorkspaceGatewayStatusResponse | undefined> {
  if (!config) return undefined;
  try {
    return await fetchWorkspaceGatewayStatus({ config, signal });
  } catch (error) {
    if (
      error instanceof WorkspaceGatewayApiError &&
      (error.code === "gateway-unavailable" || error.code === "not-found")
    ) {
      return undefined;
    }
    throw error;
  }
}

async function refreshWorkspaceGatewayPush({
  config,
  pushId,
  setState,
}: {
  config?: WorkspaceGatewayConfig;
  pushId: string;
  setState: Dispatch<SetStateAction<WorkspaceGatewayRouteState>>;
}) {
  if (!config) return;
  try {
    const response = await fetchWorkspaceGatewayPush(pushId, { config });
    if (response) setState((current) => readyStateFromPush(response, current));
  } catch (error) {
    setState((current) =>
      current.status === "ready"
        ? {
            ...current,
            error: displaySafeText(
              error instanceof Error ? error.message : "Workspace Push refresh failed.",
            ),
          }
        : current,
    );
  }
}

function readyStateFromStatus(
  response: WorkspaceGatewayStatusResponse,
): Extract<WorkspaceGatewayRouteState, { status: "ready" }> {
  return {
    ...(response.csrfToken === undefined ? {} : { csrfToken: response.csrfToken }),
    ...(response.currentPush === null ? {} : { currentPush: response.currentPush }),
    ...(response.latestPush === null ? {} : { latestPush: response.latestPush }),
    status: "ready",
  };
}

function readyStateFromPush(
  response: WorkspaceGatewayPushResponse,
  current: WorkspaceGatewayRouteState,
): Extract<WorkspaceGatewayRouteState, { status: "ready" }> {
  const ready = current.status === "ready" ? current : { status: "ready" as const };
  return response.push.lifecycle === "succeeded" || response.push.lifecycle === "failed"
    ? { ...ready, currentPush: undefined, error: undefined, latestPush: response.push }
    : { ...ready, currentPush: response.push, error: undefined };
}

export function workspaceGatewayPushPolls(push: WorkspaceGatewayPush): boolean {
  return (
    push.lifecycle === "queued" ||
    push.lifecycle === "running" ||
    push.lifecycle === "waiting-for-interaction"
  );
}
