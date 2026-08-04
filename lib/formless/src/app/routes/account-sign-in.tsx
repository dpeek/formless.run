import { useEffect, useMemo, useRef, useState } from "react";
import type { AuthIntent } from "@dpeek/formless-presentation/contract";
import { useLocation } from "wouter";
import {
  authAccountContinuationLocationForReturnTarget,
  accountRedirectTargetFromSearch,
  parseAccountLogoutResponse,
  parseAccountPasskeyLoginOptionsResponse,
  parseAccountPasskeyLoginVerifyResponse,
  parseAccountSessionStatusResponse,
  parseInstanceAuthErrorResponse,
  type AccountLogoutResponse,
  type AccountPasskeyLoginOptionsResponse,
  type AccountPasskeyLoginVerifyRequest,
  type AccountPasskeyLoginVerifyResponse,
  type AccountPrincipalIdentity,
  type AccountSessionStatusResponse,
  type InstanceAuthErrorCode,
} from "../../shared/instance-auth.ts";
import { runtimeTopologyRoutes } from "../../shared/runtime-topology.ts";
import {
  browserSupportsPasskeys,
  createBrowserPasskeyAuthenticationResponse,
  type CreatePasskeyAuthenticationResponse,
} from "./passkey-browser.ts";
import { ApplicationPresentation } from "../application-presentation.tsx";
import {
  authIntentIsCurrent,
  createAuthPendingGuard,
  NoShellAuthRuntimeBoundary,
} from "./auth-runtime-boundary.tsx";
import {
  accountSignInAuthSurfaceReference,
  projectAccountSignInAuthSurface,
} from "./account-sign-in-auth-projection.ts";

export type AccountSignInRouteState =
  | { status: "complete"; principal: AccountPrincipalIdentity }
  | {
      continueTo: `/${string}`;
      principal?: AccountPrincipalIdentity;
      status: "continuing";
    }
  | {
      code: AccountSignInFailureCode;
      principal?: AccountPrincipalIdentity;
      retry: "load" | "sign-in";
      status: "failed";
    }
  | { status: "logging-out"; principal: AccountPrincipalIdentity }
  | { status: "loading" }
  | { status: "passkey-unavailable" }
  | { status: "ready" }
  | { status: "setup-incomplete" }
  | { status: "submitting" };

export type AccountSignInFailureCode =
  | InstanceAuthErrorCode
  | "invalid-response"
  | "network-failure"
  | "passkey-failed";

type StartAccountSignInRouteSessionOptions = {
  fetcher?: typeof fetch;
  onState: (state: AccountSignInRouteState) => void;
  passkeysSupported?: () => boolean;
};

type AccountSignInFetchOptions = {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
};

type AccountSignInLocationSetter = (path: `/${string}`, options?: { replace?: boolean }) => void;

export function AccountSignInRoute() {
  const [state, setState] = useState<AccountSignInRouteState>({ status: "loading" });
  const [sessionRevision, setSessionRevision] = useState(0);
  const pendingGuard = useRef(createAuthPendingGuard());
  const [location, setLocation] = useLocation();
  const redirectTarget = accountRedirectTargetFromSearch(
    accountSignInSearchFromRouteLocation(location),
  );

  useEffect(
    () =>
      startAccountSignInRouteSession({
        onState: setState,
      }),
    [sessionRevision],
  );

  const signInAvailable =
    state.status === "ready" || (state.status === "failed" && state.retry === "sign-in");
  const surface = useMemo(() => projectAccountSignInAuthSurface({ state }), [state]);

  async function submitLogin() {
    if (!signInAvailable) {
      return;
    }

    await pendingGuard.current.run(async () => {
      setState({ status: "submitting" });

      try {
        const response = await loginWithPasskey();
        const continueTo = accountSignInSuccessContinuationTarget(
          response.continueTo,
          accountSignInSearchFromRouteLocation(location),
        );

        setState({
          continueTo,
          principal: response.principal,
          status: "continuing",
        });
        navigateAfterAccountSignIn(continueTo, { setLocation });
      } catch (error) {
        setState({
          code: accountSignInFailureCode(error),
          status: "failed",
          retry: "sign-in",
        });
      }
    });
  }

  async function logout() {
    if (state.status !== "complete") {
      return;
    }

    const loggedOutPrincipal = state.principal;

    await pendingGuard.current.run(async () => {
      setState({ status: "logging-out", principal: loggedOutPrincipal });

      try {
        const response = await logoutAccountSession();

        if (response.continueTo) {
          setState({ continueTo: response.continueTo, status: "continuing" });
          navigateAfterAccountSignIn(response.continueTo, { setLocation });
          return;
        }

        setState({ status: "ready" });
      } catch (error) {
        setState({
          code: accountSignInFailureCode(error),
          status: "failed",
          principal: loggedOutPrincipal,
          retry: "load",
        });
      }
    });
  }

  async function handleIntent(intent: AuthIntent) {
    if (!authIntentIsCurrent(surface, intent)) {
      return;
    }

    if (intent.type === "authPasskey") {
      await submitLogin();
      return;
    }

    if (intent.type === "authAction") {
      const action = surface.actions.find((candidate) => candidate.id === intent.actionId);
      if (action?.purpose === "logout") {
        await logout();
      } else if (action?.purpose === "retry") {
        setSessionRevision((revision) => revision + 1);
      }
      return;
    }

    if (intent.type === "authContinuation") {
      navigateAfterAccountSignIn(redirectTarget, { setLocation });
    }
  }

  return (
    <NoShellAuthRuntimeBoundary
      onIntent={handleIntent}
      reference={accountSignInAuthSurfaceReference}
      snapshot={surface}
    >
      <ApplicationPresentation
        presentation={{ kind: "auth", reference: accountSignInAuthSurfaceReference }}
      />
    </NoShellAuthRuntimeBoundary>
  );
}

export function navigateAfterAccountSignIn(
  redirectTarget: `/${string}`,
  options: {
    replaceDocumentLocation?: (target: `/${string}`) => void;
    setLocation: AccountSignInLocationSetter;
  },
): void {
  if (accountSignInRedirectRequiresDocumentNavigation(redirectTarget)) {
    const replaceDocumentLocation =
      options.replaceDocumentLocation ??
      ((target: `/${string}`) => window.location.replace(target));

    replaceDocumentLocation(redirectTarget);
    return;
  }

  options.setLocation(redirectTarget, { replace: true });
}

export function accountSignInRedirectRequiresDocumentNavigation(
  redirectTarget: `/${string}`,
): boolean {
  return redirectTarget === "/formless" || redirectTarget.startsWith("/formless/");
}

export function accountSignInSuccessContinuationTarget(
  continueTo: `/${string}`,
  locationSearch: string,
): `/${string}` {
  const continuationUrl = new URL(continueTo, "https://formless.local");

  if (
    continuationUrl.pathname !== runtimeTopologyRoutes.authAccountRoute ||
    continuationUrl.search !== ""
  ) {
    return continueTo;
  }

  const redirectTarget = accountRedirectTargetFromSearch(locationSearch);
  const redirectUrl = new URL(redirectTarget, "https://formless.local");

  if (
    redirectUrl.pathname === runtimeTopologyRoutes.authAccountRoute &&
    redirectUrl.search !== ""
  ) {
    return redirectTarget;
  }

  return authAccountContinuationLocationForReturnTarget(redirectTarget);
}

export function startAccountSignInRouteSession({
  fetcher = fetch,
  onState,
  passkeysSupported = browserSupportsPasskeys,
}: StartAccountSignInRouteSessionOptions) {
  const controller = new AbortController();
  let stopped = false;

  onState({ status: "loading" });

  async function loadSessionState() {
    try {
      const status = await fetchAccountSessionStatus({ fetcher, signal: controller.signal });

      if (stopped) {
        return;
      }

      if (status.authenticated) {
        onState({ status: "complete", principal: status.principal });
        return;
      }

      if (status.setupComplete) {
        if (!passkeysSupported()) {
          onState({ status: "passkey-unavailable" });
          return;
        }

        onState({ status: "ready" });
        return;
      }

      onState({ status: "setup-incomplete" });
    } catch (error) {
      if (!stopped && !controller.signal.aborted) {
        onState({
          code: accountSignInFailureCode(error),
          status: "failed",
          retry: "load",
        });
      }
    }
  }

  void loadSessionState();

  return () => {
    stopped = true;
    controller.abort();
  };
}

export async function fetchAccountSessionStatus({
  fetcher = fetch,
  signal,
}: AccountSignInFetchOptions = {}): Promise<AccountSessionStatusResponse> {
  const response = await fetcher("/api/formless/session", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  const body = await readAccountSignInJson(response);

  if (!response.ok) {
    throw accountSignInApiError(body, response.status);
  }

  return parseAccountSignInResponse(() => parseAccountSessionStatusResponse(body), response.status);
}

export async function loginWithPasskey({
  createAuthenticationResponse = createBrowserPasskeyAuthenticationResponse,
  fetcher = fetch,
  signal,
}: AccountSignInFetchOptions & {
  createAuthenticationResponse?: CreatePasskeyAuthenticationResponse;
} = {}): Promise<AccountPasskeyLoginVerifyResponse> {
  const options = await fetchAccountPasskeyLoginOptions({ fetcher, signal });
  let response: AccountPasskeyLoginVerifyRequest["response"];

  try {
    response = await createAuthenticationResponse(options.options);
  } catch {
    throw new AccountSignInPasskeyError();
  }

  return await verifyAccountPasskeyLogin({ fetcher, response, signal });
}

export async function fetchAccountPasskeyLoginOptions({
  fetcher = fetch,
  signal,
}: AccountSignInFetchOptions = {}): Promise<AccountPasskeyLoginOptionsResponse> {
  const response = await fetcher("/api/formless/passkeys/login/options", {
    body: "{}",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });
  const body = await readAccountSignInJson(response);

  if (!response.ok) {
    throw accountSignInApiError(body, response.status);
  }

  return parseAccountSignInResponse(
    () => parseAccountPasskeyLoginOptionsResponse(body),
    response.status,
  );
}

async function verifyAccountPasskeyLogin({
  fetcher = fetch,
  response: assertionResponse,
  signal,
}: AccountSignInFetchOptions & {
  response: AccountPasskeyLoginVerifyRequest["response"];
}): Promise<AccountPasskeyLoginVerifyResponse> {
  const response = await fetcher("/api/formless/passkeys/login/verify", {
    body: JSON.stringify({
      response: assertionResponse,
    }),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });
  const body = await readAccountSignInJson(response);

  if (!response.ok) {
    throw accountSignInApiError(body, response.status);
  }

  return parseAccountSignInResponse(
    () => parseAccountPasskeyLoginVerifyResponse(body),
    response.status,
  );
}

export async function logoutAccountSession({
  fetcher = fetch,
  signal,
}: AccountSignInFetchOptions = {}): Promise<AccountLogoutResponse> {
  const response = await fetcher("/api/formless/session/logout", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    method: "POST",
    signal,
  });
  const body = await readAccountSignInJson(response);

  if (!response.ok) {
    throw accountSignInApiError(body, response.status);
  }

  return parseAccountSignInResponse(() => parseAccountLogoutResponse(body), response.status);
}

export class AccountSignInApiError extends Error {
  readonly code: InstanceAuthErrorCode | "invalid-response";
  status: number | undefined;

  constructor(code: InstanceAuthErrorCode | "invalid-response", options: { status?: number } = {}) {
    super("Account sign-in API request failed.");
    this.name = "AccountSignInApiError";
    this.code = code;
    this.status = options.status;
  }
}

class AccountSignInPasskeyError extends Error {
  constructor() {
    super("Account sign-in passkey ceremony failed.");
    this.name = "AccountSignInPasskeyError";
  }
}

async function readAccountSignInJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new AccountSignInApiError("invalid-response", {
      status: response.status,
    });
  }
}

function accountSignInApiError(value: unknown, status: number): AccountSignInApiError {
  try {
    return new AccountSignInApiError(parseInstanceAuthErrorResponse(value).code, { status });
  } catch {
    return new AccountSignInApiError("invalid-response", { status });
  }
}

function parseAccountSignInResponse<T>(parse: () => T, status: number): T {
  try {
    return parse();
  } catch {
    throw new AccountSignInApiError("invalid-response", { status });
  }
}

function accountSignInFailureCode(error: unknown): AccountSignInFailureCode {
  if (error instanceof AccountSignInApiError) return error.code;
  if (error instanceof AccountSignInPasskeyError) return "passkey-failed";
  return "network-failure";
}

function accountSignInSearchFromRouteLocation(location: string): string {
  const queryStart = location.indexOf("?");

  if (queryStart >= 0) {
    return location.slice(queryStart);
  }

  return typeof window === "undefined" ? "" : window.location.search;
}
