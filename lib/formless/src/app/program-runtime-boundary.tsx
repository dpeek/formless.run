import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { publishClientEvent } from "../client/broadcast.ts";
import {
  clearProgramReplicaPrincipalBoundary,
  prepareProgramReplicaPrincipalBoundary,
} from "../client/db.ts";
import {
  connectBroadcastToClientStore,
  hydrateClientStore,
  resetClientStore,
  subscribeToProgramAuthorityChanges,
} from "../client/store.ts";
import { bootstrapClient, startPushSync } from "../client/sync.ts";
import { resetSyncStatus, setSyncStatus } from "../client/sync-status.ts";
import {
  invalidateProgramAuthority,
  listenForProgramAuthorityInvalidation,
  type ProgramAuthorityInvalidationReason,
} from "../client/program-authority.ts";
import {
  parseProgramSessionResponse,
  PROGRAM_SESSION_API_PATH,
  type AccountLogoutResponse,
  type AccountRedirectTarget,
  type AccountSessionStatusResponse,
  type ProgramSessionResponse,
  type ProgramSessionTargetBinding,
} from "../shared/instance-auth.ts";
import { logoutAccountSession } from "./routes/account-sign-in.tsx";
import { FORMLESS_PROGRAM_STORAGE_IDENTITY } from "../program/target.ts";

type ProgramRuntimePublicationBoundary = {
  canPublish: () => boolean;
  onAuthorityInvalidated: () => void;
  onReplicaReset: () => void;
  principalId: string;
  runtimeTarget: ProgramSessionTargetBinding;
  signal: AbortSignal;
};

type ProgramRuntimePushSyncHandle = (() => void) & {
  requestSync?: (() => void) | undefined;
};

export type ProgramRuntimeDependencies = {
  bootstrap: (boundary: ProgramRuntimePublicationBoundary) => Promise<unknown>;
  clearReplica: () => Promise<void>;
  connectBroadcast: (boundary: ProgramRuntimePublicationBoundary) => () => void;
  fetchSession: (
    returnTo: AccountRedirectTarget,
    signal: AbortSignal,
  ) => Promise<ProgramSessionResponse>;
  hydrate: (boundary: ProgramRuntimePublicationBoundary) => Promise<unknown>;
  listenForFocusRecovery: (listener: (event: { suspended: boolean }) => void) => () => void;
  listenForInvalidation: (
    listener: (reason: ProgramAuthorityInvalidationReason) => void,
  ) => () => void;
  logout: (signal: AbortSignal) => Promise<AccountLogoutResponse>;
  navigate: (path: AccountRedirectTarget) => void;
  now: () => number;
  prepareReplica: (
    principalId: string,
    target: ProgramSessionTargetBinding,
  ) => Promise<"reset" | "reused">;
  publishReplicaReset: () => void;
  publishInvalidation: (reason: ProgramAuthorityInvalidationReason) => void;
  resetMemory: () => void;
  scheduleRefresh: (listener: () => void, delayMs: number) => () => void;
  startPush: (boundary: ProgramRuntimePublicationBoundary) => ProgramRuntimePushSyncHandle;
  subscribeAuthorityChanges: (principalId: string, listener: () => void) => () => void;
};

export type ProgramRuntimeSnapshot = {
  failureCode?: "runtime-start-failed" | undefined;
  logout: () => Promise<void>;
  logoutState: "error" | "idle" | "pending";
  session?: ProgramSessionResponse | undefined;
  status: "anonymous" | "blocked" | "failed" | "forbidden" | "loading" | "ready" | "server";
};

export type ProgramRuntimeBoundaryProps = {
  children: (snapshot: ProgramRuntimeSnapshot) => ReactNode;
  currentPath: AccountRedirectTarget;
  dependencies?: Partial<ProgramRuntimeDependencies> | undefined;
};

type ProgramRuntimeState = Omit<ProgramRuntimeSnapshot, "logout" | "logoutState">;

type ActiveProgramRuntime = {
  canPublish: () => boolean;
  end: () => void;
  replaceSessionExpiry: (session: ProgramSessionResponse) => void;
  requestSync: () => void;
};

export const PROGRAM_SESSION_FRESHNESS_MS = 60_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

export function ProgramRuntimeBoundary({
  children,
  currentPath,
  dependencies,
}: ProgramRuntimeBoundaryProps) {
  const initialPath = useRef(currentPath);
  const dependenciesRef = useRef(resolveProgramRuntimeDependencies(dependencies));
  const activeRuntimeRef = useRef<ActiveProgramRuntime | undefined>(undefined);
  const logoutControllerRef = useRef<AbortController | undefined>(undefined);
  const mountedRef = useRef(true);
  const refreshRef = useRef<
    (reason?: ProgramAuthorityInvalidationReason | "startup") => Promise<void>
  >(async () => undefined);
  const sessionRef = useRef<ProgramSessionResponse | undefined>(undefined);
  const logoutPendingRef = useRef(false);
  const [logoutState, setLogoutState] = useState<"error" | "idle" | "pending">("idle");
  const [state, setState] = useState<ProgramRuntimeState>(() =>
    typeof window === "undefined" ? { status: "server" } : { status: "loading" },
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    mountedRef.current = true;
    const resolvedDependencies = dependenciesRef.current;
    let lastSnapshotAt = 0;
    let refreshPromise: Promise<void> | undefined;
    let revalidationPromise: Promise<void> | undefined;
    let sessionRequestController: AbortController | undefined;
    let sessionRequestPromise: Promise<ProgramSessionResponse> | undefined;

    function requestRestart(
      reason: ProgramAuthorityInvalidationReason | "startup" = "startup",
      prefetchedSession?: ProgramSessionResponse,
    ): Promise<void> {
      if (!mountedRef.current) {
        return Promise.resolve();
      }

      if (refreshPromise) {
        return refreshPromise;
      }

      if (reason === "logout") {
        cancelSessionRequest();
      }

      const promise = restart(reason, prefetchedSession);
      refreshPromise = promise;
      void promise.finally(() => {
        if (refreshPromise === promise) {
          refreshPromise = undefined;
        }
      });
      return promise;
    }

    function requestRevalidation(reason: ProgramAuthorityInvalidationReason): Promise<void> {
      if (!mountedRef.current) {
        return Promise.resolve();
      }

      if (refreshPromise) {
        return refreshPromise;
      }

      if (revalidationPromise) {
        return revalidationPromise;
      }

      const runtime = activeRuntimeRef.current;
      const session = sessionRef.current;

      if (!runtime || session?.status !== "ready") {
        return requestRestart(reason);
      }

      const promise = revalidate(reason, runtime, session);
      revalidationPromise = promise;
      void promise.finally(() => {
        if (revalidationPromise === promise) {
          revalidationPromise = undefined;
        }
      });
      return promise;
    }

    function requestAuthorityRefresh(reason: ProgramAuthorityInvalidationReason): Promise<void> {
      return reason === "logout" || reason === "push-policy-violation"
        ? requestRestart(reason)
        : requestRevalidation(reason);
    }

    function invalidate(reason: ProgramAuthorityInvalidationReason): Promise<void> {
      resolvedDependencies.publishInvalidation(reason);
      return requestAuthorityRefresh(reason);
    }

    function requestSessionSnapshot(): Promise<ProgramSessionResponse> {
      if (sessionRequestPromise) {
        return sessionRequestPromise;
      }

      const controller = new AbortController();
      const request = resolvedDependencies.fetchSession(initialPath.current, controller.signal);
      sessionRequestController = controller;
      sessionRequestPromise = request;
      void request.then(clearRequest, clearRequest);
      return request;

      function clearRequest() {
        if (sessionRequestPromise === request) {
          sessionRequestController = undefined;
          sessionRequestPromise = undefined;
        }
      }
    }

    function cancelSessionRequest() {
      sessionRequestController?.abort();
      sessionRequestController = undefined;
      sessionRequestPromise = undefined;
    }

    async function revalidate(
      reason: ProgramAuthorityInvalidationReason,
      runtime: ActiveProgramRuntime,
      previousSession: Extract<ProgramSessionResponse, { status: "ready" }>,
    ) {
      let session: ProgramSessionResponse;

      try {
        session = await requestSessionSnapshot();
      } catch {
        if (runtime.canPublish() && activeRuntimeRef.current === runtime) {
          failRuntime(runtime);
        }
        return;
      }

      if (!runtime.canPublish() || activeRuntimeRef.current !== runtime) {
        return;
      }

      if (
        session.status === "ready" &&
        session.principal.principalId === previousSession.principal.principalId &&
        programSessionTargetsEqual(session.target, previousSession.target)
      ) {
        lastSnapshotAt = resolvedDependencies.now();
        sessionRef.current = session;
        runtime.replaceSessionExpiry(session);
        setState({ session, status: "ready" });
        runtime.requestSync();
        return;
      }

      await requestRestart(reason, session);
    }

    async function restart(
      reason: ProgramAuthorityInvalidationReason | "startup",
      prefetchedSession?: ProgramSessionResponse,
    ) {
      const previousRuntime = activeRuntimeRef.current;
      activeRuntimeRef.current = undefined;
      previousRuntime?.end();
      if (!previousRuntime) {
        resolvedDependencies.resetMemory();
      }
      sessionRef.current = undefined;
      setState({ status: "loading" });

      const controller = new AbortController();
      let active = true;
      let cancelExpiry: () => void = () => undefined;
      let stopAuthorityChanges: () => void = () => undefined;
      let stopBroadcast: () => void = () => undefined;
      let stopPush: () => void = () => undefined;
      let requestSync: () => void = () => undefined;
      const canPublish = () => active && mountedRef.current && !controller.signal.aborted;
      const end = () => {
        if (!active) {
          return;
        }

        active = false;
        controller.abort();
        cancelExpiry();
        stopAuthorityChanges();
        stopBroadcast();
        stopPush();
        resolvedDependencies.resetMemory();
      };
      const replaceSessionExpiry = (session: ProgramSessionResponse) => {
        cancelExpiry();
        cancelExpiry =
          session.status === "anonymous"
            ? () => undefined
            : scheduleProgramSessionExpiry(session.session.expiresAt, resolvedDependencies, () => {
                void invalidate("session-expiry");
              });
      };
      const runtime = {
        canPublish,
        end,
        replaceSessionExpiry,
        requestSync: () => requestSync(),
      };
      activeRuntimeRef.current = runtime;
      let replicaCleared = false;

      try {
        if (reason === "logout") {
          await resolvedDependencies.clearReplica();

          if (!canPublish()) {
            return;
          }

          replicaCleared = true;
          resolvedDependencies.publishReplicaReset();
        }

        const session = prefetchedSession ?? (await requestSessionSnapshot());

        if (!canPublish()) {
          return;
        }

        lastSnapshotAt = resolvedDependencies.now();
        sessionRef.current = session;
        replaceSessionExpiry(session);

        if (session.status !== "ready") {
          if (!replicaCleared) {
            await resolvedDependencies.clearReplica();
          }

          if (!canPublish()) {
            return;
          }

          if (!replicaCleared) {
            resolvedDependencies.publishReplicaReset();
          }
          setState({ session, status: session.status });
          return;
        }

        assertCurrentTargetOrigin(session.target);
        const principalId = session.principal.principalId;
        const prepared = await resolvedDependencies.prepareReplica(principalId, session.target);

        if (!canPublish()) {
          return;
        }

        if (prepared === "reset") {
          resolvedDependencies.publishReplicaReset();
        }

        const boundary = {
          canPublish,
          onAuthorityInvalidated: () => {
            void invalidate("push-policy-violation");
          },
          onReplicaReset: () => {
            if (!canPublish()) {
              return;
            }

            void requestRestart("cross-tab");
          },
          principalId,
          runtimeTarget: session.target,
          signal: controller.signal,
        };
        stopBroadcast = resolvedDependencies.connectBroadcast(boundary);
        setSyncStatus({ code: "program-syncing", state: "syncing" });
        await resolvedDependencies.hydrate(boundary);

        if (!canPublish()) {
          return;
        }

        await resolvedDependencies.bootstrap(boundary);

        if (!canPublish()) {
          return;
        }

        stopAuthorityChanges = resolvedDependencies.subscribeAuthorityChanges(principalId, () => {
          if (canPublish()) {
            void invalidate("replica-authority-change");
          }
        });
        setSyncStatus({ code: "program-synced", state: "idle" });
        const push = resolvedDependencies.startPush(boundary);
        stopPush = push;
        requestSync = push.requestSync ?? (() => undefined);
        setState({ session, status: "ready" });
      } catch {
        if (!canPublish()) {
          return;
        }

        failRuntime(runtime);
      }
    }

    function failRuntime(runtime: ActiveProgramRuntime) {
      runtime.end();
      if (activeRuntimeRef.current === runtime) {
        activeRuntimeRef.current = undefined;
      }
      sessionRef.current = undefined;
      setSyncStatus({ code: "program-sync-failed", state: "error" });
      setState({
        failureCode: "runtime-start-failed",
        status: "failed",
      });
    }

    refreshRef.current = requestRestart;
    const stopInvalidation = resolvedDependencies.listenForInvalidation((reason) => {
      void requestAuthorityRefresh(reason);
    });
    const stopFocusRecovery = resolvedDependencies.listenForFocusRecovery(({ suspended }) => {
      const session = sessionRef.current;
      const expiresAt =
        session && session.status !== "anonymous"
          ? Date.parse(session.session.expiresAt)
          : undefined;
      const stale = resolvedDependencies.now() - lastSnapshotAt >= PROGRAM_SESSION_FRESHNESS_MS;
      const expired = expiresAt !== undefined && resolvedDependencies.now() >= expiresAt;

      if (stale || expired) {
        void invalidate("focus-recovery");
      } else if (suspended) {
        activeRuntimeRef.current?.requestSync();
      }
    });

    void requestRestart();

    return () => {
      mountedRef.current = false;
      refreshRef.current = async () => undefined;
      logoutControllerRef.current?.abort();
      cancelSessionRequest();
      stopFocusRecovery();
      stopInvalidation();
      activeRuntimeRef.current?.end();
      activeRuntimeRef.current = undefined;
      sessionRef.current = undefined;
    };
  }, []);

  const logout = useCallback(async () => {
    const session = sessionRef.current;

    if (logoutPendingRef.current || session === undefined || session.status === "anonymous") {
      return;
    }

    logoutPendingRef.current = true;
    setLogoutState("pending");
    const controller = new AbortController();
    logoutControllerRef.current = controller;
    let response: AccountLogoutResponse;

    try {
      response = await dependenciesRef.current.logout(controller.signal);
    } catch {
      logoutPendingRef.current = false;
      if (mountedRef.current) {
        setLogoutState("error");
      }
      return;
    } finally {
      logoutControllerRef.current = undefined;
    }

    dependenciesRef.current.publishInvalidation("logout");
    await refreshRef.current("logout");

    if (mountedRef.current) {
      setLogoutState("idle");

      if (response.continueTo) {
        dependenciesRef.current.navigate(response.continueTo);
      }
    }
    logoutPendingRef.current = false;
  }, []);

  return children({ ...state, logout, logoutState });
}

export async function fetchProgramSessionSnapshot(
  returnTo: AccountRedirectTarget,
  options: { fetcher?: typeof fetch; signal?: AbortSignal } = {},
): Promise<ProgramSessionResponse> {
  const params = new URLSearchParams({ returnTo });
  const response = await (options.fetcher ?? fetch)(`${PROGRAM_SESSION_API_PATH}?${params}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal: options.signal,
  });
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(programSessionErrorMessage(body));
  }

  return parseProgramSessionResponse(body);
}

export function programRuntimeAccountSession(
  snapshot: ProgramRuntimeSnapshot | undefined,
): AccountSessionStatusResponse | undefined {
  const session = snapshot?.session;

  if (session === undefined) {
    return undefined;
  }

  if (session.status === "anonymous") {
    return { authenticated: false, setupComplete: session.setupComplete };
  }

  return {
    authenticated: true,
    principal: session.principal,
    session: session.session,
    setupComplete: true,
  };
}

function resolveProgramRuntimeDependencies(
  overrides: Partial<ProgramRuntimeDependencies> | undefined,
): ProgramRuntimeDependencies {
  return {
    bootstrap: overrides?.bootstrap ?? ((boundary) => bootstrapClient(fetch, boundary)),
    clearReplica:
      overrides?.clearReplica ??
      (() => clearProgramReplicaPrincipalBoundary(FORMLESS_PROGRAM_STORAGE_IDENTITY)),
    connectBroadcast:
      overrides?.connectBroadcast ?? ((boundary) => connectBroadcastToClientStore(boundary)),
    fetchSession:
      overrides?.fetchSession ??
      ((returnTo, signal) => fetchProgramSessionSnapshot(returnTo, { signal })),
    hydrate: overrides?.hydrate ?? ((boundary) => hydrateClientStore(boundary)),
    listenForFocusRecovery:
      overrides?.listenForFocusRecovery ?? listenForProgramRuntimeFocusRecovery,
    listenForInvalidation:
      overrides?.listenForInvalidation ?? listenForProgramAuthorityInvalidation,
    logout: overrides?.logout ?? ((signal) => logoutAccountSession({ signal })),
    navigate:
      overrides?.navigate ??
      ((path) => {
        window.location.assign(path);
      }),
    now: overrides?.now ?? (() => Date.now()),
    prepareReplica:
      overrides?.prepareReplica ??
      ((principalId, target) =>
        prepareProgramReplicaPrincipalBoundary(principalId, target.storageIdentity)),
    publishReplicaReset:
      overrides?.publishReplicaReset ?? (() => publishClientEvent("replica-reset")),
    publishInvalidation: overrides?.publishInvalidation ?? invalidateProgramAuthority,
    resetMemory:
      overrides?.resetMemory ??
      (() => {
        resetClientStore();
        resetSyncStatus();
      }),
    scheduleRefresh:
      overrides?.scheduleRefresh ??
      ((listener, delayMs) => {
        const timerId = globalThis.setTimeout(listener, delayMs);
        return () => globalThis.clearTimeout(timerId);
      }),
    startPush:
      overrides?.startPush ??
      ((boundary) =>
        startPushSync({
          canPublish: boundary.canPublish,
          onAuthorityInvalidated: boundary.onAuthorityInvalidated,
          principalId: boundary.principalId,
          runtimeTarget: boundary.runtimeTarget,
          signal: boundary.signal,
        })),
    subscribeAuthorityChanges:
      overrides?.subscribeAuthorityChanges ?? subscribeToProgramAuthorityChanges,
  };
}

function listenForProgramRuntimeFocusRecovery(
  listener: (event: { suspended: boolean }) => void,
): () => void {
  let suspended = document.visibilityState === "hidden";
  const onFocus = () => {
    const wasSuspended = suspended;
    suspended = false;
    listener({ suspended: wasSuspended });
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      suspended = true;
      return;
    }

    onFocus();
  };

  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}

function scheduleProgramSessionExpiry(
  expiresAt: string,
  dependencies: ProgramRuntimeDependencies,
  listener: () => void,
): () => void {
  const expiresAtMs = Date.parse(expiresAt);

  if (!Number.isFinite(expiresAtMs)) {
    return () => undefined;
  }

  let cancelled = false;
  let cancelTimer: () => void = () => undefined;

  const schedule = () => {
    const remainingMs = expiresAtMs - dependencies.now();
    const delayMs = Math.min(Math.max(remainingMs, 0), MAX_TIMER_DELAY_MS);
    cancelTimer = dependencies.scheduleRefresh(() => {
      if (cancelled) {
        return;
      }

      if (dependencies.now() >= expiresAtMs) {
        listener();
      } else {
        schedule();
      }
    }, delayMs);
  };

  schedule();

  return () => {
    cancelled = true;
    cancelTimer();
  };
}

function assertCurrentTargetOrigin(target: ProgramSessionTargetBinding): void {
  if (target.targetOrigin !== window.location.origin) {
    throw new Error("Program session target origin does not match this browser runtime.");
  }
}

function programSessionTargetsEqual(
  left: ProgramSessionTargetBinding,
  right: ProgramSessionTargetBinding,
): boolean {
  return (
    left.routeAccess === right.routeAccess &&
    left.routeId === right.routeId &&
    left.storageIdentity === right.storageIdentity &&
    left.targetOrigin === right.targetOrigin &&
    left.targetProfile === right.targetProfile
  );
}

function programSessionErrorMessage(body: unknown): string {
  return typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    "error" in body &&
    typeof body.error === "string"
    ? body.error
    : "Program session status failed.";
}
