import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuthIntent } from "@dpeek/formless-presentation/contract";
import { useLocation, useSearch } from "wouter";

import {
  parseAccountCompletionGateResolutionResult,
  parseAuthAccountStatusResult,
  parseInstanceAuthCanonicalOrigin,
  parseInstanceAuthErrorResponse,
  parseAccountRedirectTarget,
  type AccountAuthorizationForbiddenResult,
  type AccountCompletionContinuationResult,
  type AccountCompletionGateResolutionResult,
  type AccountCompletionGateResult,
  type AccountCompletionGateTarget,
  type AccountCompletionProfileCompletionGate,
  type AuthAccountStatusResult,
  type InstanceAuthErrorCode,
} from "../../shared/instance-auth.ts";
import {
  parseOwnerSetupToken,
  type OwnerIdentity,
  type OwnerSetupStatusResponse,
} from "../../shared/protocol.ts";
import {
  runtimeAuthAccountGateRoutes,
  runtimeTopologyRoutes,
} from "../../shared/runtime-topology.ts";
import { ApplicationPresentation } from "../application-presentation.tsx";
import {
  authIntentIsCurrent,
  createAuthPendingGuard,
  NoShellAuthRuntimeBoundary,
} from "./auth-runtime-boundary.tsx";
import {
  authAccountSurfaceReference,
  initialAuthAccountDraftSession,
  markAuthAccountDraftSessionSubmitted,
  nextAuthAccountDraftSession,
  prepareAuthAccountDraftSession,
  projectAuthAccountSurface,
  selectAuthAccountDraftSubmission,
} from "./auth-account-projection.ts";
import {
  browserSupportsPasskeys,
  createBrowserPasskeyRegistrationResponse,
  type CreatePasskeyRegistrationResponse,
} from "./passkey-browser.ts";
import { logoutAccountSession } from "./account-sign-in.tsx";

const instanceAuthHandoffStartPath = "/formless/auth/handoff";
const emailVerificationRequestPath = `${runtimeAuthAccountGateRoutes.emailVerification}/request`;
const emailVerificationVerifyPath = `${runtimeAuthAccountGateRoutes.emailVerification}/verify`;
const ownerSetupStatusPath = "/api/formless/setup";
const ownerSetupStartPath = `${runtimeTopologyRoutes.authAccountSetupRoute}/start`;
const ownerSetupEmailVerifyPath = `${runtimeTopologyRoutes.authAccountSetupRoute}/email/verify`;
const ownerSetupPasskeyRegistrationOptionsPath = `${runtimeTopologyRoutes.authAccountSetupRoute}/passkeys/register/options`;
const ownerSetupPasskeyRegistrationVerifyPath = `${runtimeTopologyRoutes.authAccountSetupRoute}/passkeys/register/verify`;
const ownerSetupCompletePath = `${runtimeTopologyRoutes.authAccountSetupRoute}/complete`;
const profileCompletionGateCompletePath = `${runtimeAuthAccountGateRoutes.profileCompletion}/complete`;
const termsAcceptanceGateCompletePath = `${runtimeAuthAccountGateRoutes.termsAcceptance}/complete`;

type AuthAccountGateActionState =
  | {
      challengeId: string;
      email: string;
      expiresAt: string;
      failureCode?: AuthAccountFailureCode;
      kind: "email-verification-sent";
    }
  | { kind: "email-verification-requesting" }
  | {
      challengeId: string;
      email: string;
      expiresAt: string;
      kind: "email-verification-verifying";
    }
  | { kind: "gate-submitting" }
  | { code: AuthAccountFailureCode; kind: "gate-unavailable" }
  | { kind: "profile-completion-submitting" };

type AuthAccountForbiddenActionState =
  | { kind: "logout-pending" }
  | { code: AuthAccountFailureCode; kind: "logout-failed" };

type AuthAccountOwnerSetupChallengeState = {
  challengeId: string;
  displayName: string;
  email: string;
  expiresAt: string;
  failureCode?: AuthAccountFailureCode;
  setupToken: string;
};

type AuthAccountOwnerSetupCompletionState = AuthAccountOwnerSetupChallengeState & {
  completionId: string;
};

export type AuthAccountRouteState =
  | {
      action?: AuthAccountGateActionState;
      result: AccountCompletionGateResult;
      status: "blocked";
    }
  | {
      continueTo?: `/${string}`;
      result: AccountCompletionContinuationResult;
      status: "complete";
    }
  | {
      continueTo: `/${string}`;
      result: AccountCompletionContinuationResult;
      status: "continuing";
    }
  | {
      action?: AuthAccountForbiddenActionState;
      result: AccountAuthorizationForbiddenResult;
      status: "forbidden";
    }
  | { code: AuthAccountFailureCode; status: "failed" }
  | { status: "loading" }
  | { owner?: OwnerIdentity; status: "owner-setup-already-complete" }
  | (AuthAccountOwnerSetupCompletionState & {
      status: "owner-setup-completing";
    })
  | (AuthAccountOwnerSetupCompletionState & {
      status: "owner-setup-completion-ready";
    })
  | {
      continueTo?: string;
      handoff?: AuthAccountCompletionHandoff;
      owner: OwnerIdentity;
      status: "owner-setup-complete";
    }
  | (AuthAccountOwnerSetupChallengeState & {
      status: "owner-setup-credential-ready";
    })
  | (AuthAccountOwnerSetupChallengeState & {
      status: "owner-setup-credential-submitting";
    })
  | (AuthAccountOwnerSetupChallengeState & {
      status: "owner-setup-email-sent";
    })
  | (AuthAccountOwnerSetupChallengeState & {
      status: "owner-setup-email-verifying";
    })
  | {
      displayName: string;
      email: string;
      failureCode?: AuthAccountFailureCode;
      setupToken: string;
      status: "owner-setup-email-sending";
    }
  | { code: AuthAccountFailureCode; status: "owner-setup-invalid" }
  | { status: "owner-setup-loading" }
  | (AuthAccountOwnerSetupChallengeState & {
      status: "owner-setup-passkey-unavailable";
    })
  | {
      continueTo: string;
      handoff?: AuthAccountCompletionHandoff;
      owner: OwnerIdentity;
      status: "owner-setup-continuing";
    }
  | {
      failureCode?: AuthAccountFailureCode;
      setupToken: string;
      status: "owner-setup-ready";
    };

export type AuthAccountFailureCode =
  | InstanceAuthErrorCode
  | "invalid-response"
  | "network-failure"
  | "passkey-failed";

type StartAuthAccountRouteSessionOptions = {
  currentOrigin?: string;
  fetcher?: typeof fetch;
  locationPath?: string;
  locationSearch: string;
  navigateTo?: (target: string) => void;
  onState: (state: AuthAccountRouteState) => void;
};

type AuthAccountFetchOptions = {
  fetcher?: typeof fetch;
  locationSearch: string;
  signal?: AbortSignal;
};

type AuthAccountApiOptions = {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
};

export type AuthAccountCompletionHandoff = {
  returnTo: `/${string}`;
  targetOrigin: string;
};

export type AuthAccountCompletionApiResult = {
  accountCompletion: AccountCompletionGateResolutionResult;
  continueTo?: `/${string}`;
  handoff?: AuthAccountCompletionHandoff;
};

type EmailVerificationChallengeSummary = {
  challengeId: string;
  displayEmail: string;
  expiresAt: string;
  purpose: "account-completion" | "invitation-acceptance" | "owner-setup" | "recovery";
};

type OwnerSetupChallengeSummary = {
  challengeId: string;
  displayEmail: string;
  displayName: string;
  expiresAt: string;
  status: "email-sent" | "email-verified" | "passkey-prepared";
};

type OwnerSetupRouteRequest = {
  challengeId?: string;
  email?: string;
  setupToken: string;
  verificationToken?: string;
};

type OwnerSetupPasskeyPreparation = {
  completionId: string;
  ownerSetup: OwnerSetupChallengeSummary;
  prepared: true;
};

export type OwnerSetupCompletionApiResult = {
  completed: true;
  completionId: string;
  continueTo?: string;
  handoff?: AuthAccountCompletionHandoff;
  owner: OwnerIdentity;
  session: { expiresAt: string };
  setupComplete: true;
};

type AuthAccountPasskeyRegistrationOptions = Parameters<CreatePasskeyRegistrationResponse>[0];

export function AuthAccountRoute() {
  const [locationPath] = useLocation();
  const locationSearch = useSearch();
  const [state, setState] = useState<AuthAccountRouteState>({ status: "loading" });
  const [draftSession, setDraftSession] = useState(() =>
    initialAuthAccountDraftSession({ status: "loading" }),
  );
  const [sessionRevision, setSessionRevision] = useState(0);
  const pendingGuard = useRef(createAuthPendingGuard());
  const currentOrigin = typeof window === "undefined" ? undefined : window.location.origin;
  const navigateTo = (target: string) => {
    if (typeof window !== "undefined") {
      window.location.assign(target);
    }
  };
  const publishState = useCallback((nextState: AuthAccountRouteState) => {
    setState(nextState);
    setDraftSession((session) => prepareAuthAccountDraftSession(session, nextState));
  }, []);

  useEffect(
    () =>
      startAuthAccountRouteSession({
        currentOrigin,
        locationPath,
        locationSearch,
        navigateTo,
        onState: publishState,
      }),
    [currentOrigin, locationPath, locationSearch, publishState, sessionRevision],
  );

  const surface = useMemo(
    () => projectAuthAccountSurface({ session: draftSession, state }),
    [draftSession, state],
  );
  const reference = authAccountSurfaceReference(surface);

  function applyGateCompletionResult(result: AuthAccountCompletionApiResult) {
    if (result.accountCompletion.status === "blocked") {
      publishState({ result: result.accountCompletion, status: "blocked" });
      return;
    }

    const continueTo = authAccountCompletionApiContinuationTarget(
      result,
      locationSearch,
      currentOrigin,
    );

    if (continueTo) {
      publishState({ continueTo, result: result.accountCompletion, status: "continuing" });
      navigateTo(continueTo);
      return;
    }

    publishState({ result: result.accountCompletion, status: "complete" });
  }

  function applyAccountStatusResult(result: AuthAccountStatusResult) {
    if (result.status === "forbidden") {
      publishState({ result, status: "forbidden" });
      return;
    }

    applyGateCompletionResult({ accountCompletion: result });
  }

  function applyOwnerSetupCompletionResult(result: OwnerSetupCompletionApiResult) {
    if (result.continueTo) {
      publishState({
        continueTo: result.continueTo,
        ...(result.handoff ? { handoff: result.handoff } : {}),
        owner: result.owner,
        status: "owner-setup-continuing",
      });
      navigateTo(result.continueTo);
      return;
    }

    publishState({
      ...(result.handoff ? { handoff: result.handoff } : {}),
      owner: result.owner,
      status: "owner-setup-complete",
    });
  }

  async function submitEmailVerificationRequest(email: string) {
    if (state.status !== "blocked" || state.result.gate.kind !== "email-verification") {
      return;
    }

    publishState({
      action: { kind: "email-verification-requesting" },
      result: state.result,
      status: "blocked",
    });

    try {
      const requested = await requestAuthAccountEmailVerification({
        email,
        target: state.result.target,
      });

      publishState({
        action: {
          challengeId: requested.challenge.challengeId,
          email: requested.challenge.displayEmail,
          expiresAt: requested.challenge.expiresAt,
          kind: "email-verification-sent",
        },
        result: state.result,
        status: "blocked",
      });
    } catch (error) {
      publishState({
        action: {
          code: authAccountFailureCode(error),
          kind: "gate-unavailable",
        },
        result: state.result,
        status: "blocked",
      });
    }
  }

  async function submitEmailVerificationToken(token: string) {
    if (
      state.status !== "blocked" ||
      state.result.gate.kind !== "email-verification" ||
      state.action?.kind !== "email-verification-sent"
    ) {
      return;
    }

    const action = state.action;

    publishState({
      action: {
        challengeId: action.challengeId,
        email: action.email,
        expiresAt: action.expiresAt,
        kind: "email-verification-verifying",
      },
      result: state.result,
      status: "blocked",
    });

    try {
      await verifyAuthAccountEmailVerification({
        challengeId: action.challengeId,
        email: action.email,
        target: state.result.target,
        token,
      });
      applyAccountStatusResult(await fetchAuthAccountStatus({ locationSearch }));
    } catch (error) {
      publishState({
        action: {
          ...action,
          failureCode: authAccountFailureCode(error),
          kind: "email-verification-sent",
        },
        result: state.result,
        status: "blocked",
      });
    }
  }

  async function submitTermsAcceptance(acceptedPolicyIds: string[]) {
    if (state.status !== "blocked" || state.result.gate.kind !== "terms-acceptance") {
      return;
    }

    publishState({ action: { kind: "gate-submitting" }, result: state.result, status: "blocked" });

    try {
      applyGateCompletionResult(
        await completeAuthAccountTermsAcceptanceGate({
          acceptedPolicyIds,
          locationSearch,
          target: state.result.target,
        }),
      );
    } catch (error) {
      publishState({
        action: {
          code: authAccountFailureCode(error),
          kind: "gate-unavailable",
        },
        result: state.result,
        status: "blocked",
      });
    }
  }

  async function submitProfileCompletion(input: Record<string, unknown>) {
    if (state.status !== "blocked" || state.result.gate.kind !== "profile-completion") {
      return;
    }

    const { gate } = state.result;

    if (gate.operation === undefined || gate.inputContract === undefined) {
      publishState({
        action: {
          code: "unavailable",
          kind: "gate-unavailable",
        },
        result: state.result,
        status: "blocked",
      });
      return;
    }

    publishState({
      action: { kind: "profile-completion-submitting" },
      result: state.result,
      status: "blocked",
    });

    try {
      applyGateCompletionResult(
        await completeAuthAccountProfileCompletionGate({
          input,
          locationSearch,
          operation: gate.operation,
          target: state.result.target,
        }),
      );
    } catch (error) {
      publishState({
        action: {
          code: authAccountFailureCode(error),
          kind: "gate-unavailable",
        },
        result: state.result,
        status: "blocked",
      });
    }
  }

  async function submitOwnerSetupStart(displayName: string, email: string) {
    if (state.status !== "owner-setup-ready") {
      return;
    }

    publishState({
      displayName,
      email,
      setupToken: state.setupToken,
      status: "owner-setup-email-sending",
    });

    try {
      const started = await startProductionOwnerSetup({
        displayName,
        email,
        setupToken: state.setupToken,
      });

      publishState({
        challengeId: started.ownerSetup.challengeId,
        displayName: started.ownerSetup.displayName,
        email: started.ownerSetup.displayEmail,
        expiresAt: started.ownerSetup.expiresAt,
        setupToken: state.setupToken,
        status: "owner-setup-email-sent",
      });
    } catch (error) {
      publishState({
        failureCode: authAccountFailureCode(error),
        setupToken: state.setupToken,
        status: "owner-setup-ready",
      });
    }
  }

  async function submitOwnerSetupEmailToken(token: string) {
    if (state.status !== "owner-setup-email-sent") {
      return;
    }

    const challengeState = state;

    publishState({ ...challengeState, status: "owner-setup-email-verifying" });

    try {
      const verified = await verifyProductionOwnerSetupEmail({
        challengeId: challengeState.challengeId,
        email: challengeState.email,
        setupToken: challengeState.setupToken,
        token,
      });

      publishState({
        challengeId: verified.ownerSetup.challengeId,
        displayName: verified.ownerSetup.displayName,
        email: verified.ownerSetup.displayEmail,
        expiresAt: verified.ownerSetup.expiresAt,
        setupToken: challengeState.setupToken,
        status: "owner-setup-credential-ready",
      });
    } catch (error) {
      publishState({
        ...challengeState,
        failureCode: authAccountFailureCode(error),
        status: "owner-setup-email-sent",
      });
    }
  }

  async function submitOwnerSetupPasskey() {
    if (state.status !== "owner-setup-credential-ready") {
      return;
    }

    if (!browserSupportsPasskeys()) {
      publishState({
        ...state,
        status: "owner-setup-passkey-unavailable",
      });
      return;
    }

    const challengeState = state;

    publishState({ ...challengeState, status: "owner-setup-credential-submitting" });

    try {
      const prepared = await prepareProductionOwnerSetupPasskey({
        challengeId: challengeState.challengeId,
        email: challengeState.email,
        setupToken: challengeState.setupToken,
      });
      const completionState: AuthAccountOwnerSetupCompletionState = {
        challengeId: prepared.ownerSetup.challengeId,
        completionId: prepared.completionId,
        displayName: prepared.ownerSetup.displayName,
        email: prepared.ownerSetup.displayEmail,
        expiresAt: prepared.ownerSetup.expiresAt,
        setupToken: challengeState.setupToken,
      };

      publishState({ ...completionState, status: "owner-setup-completing" });

      try {
        applyOwnerSetupCompletionResult(
          await completeProductionOwnerSetup({
            challengeId: completionState.challengeId,
            completionId: completionState.completionId,
            email: completionState.email,
            setupToken: completionState.setupToken,
          }),
        );
      } catch (error) {
        publishState({
          ...completionState,
          failureCode: authAccountFailureCode(error),
          status: "owner-setup-completion-ready",
        });
      }
    } catch (error) {
      publishState({
        ...challengeState,
        failureCode: authAccountFailureCode(error),
        status: "owner-setup-credential-ready",
      });
    }
  }

  async function retryOwnerSetupCompletion() {
    if (state.status !== "owner-setup-completion-ready") {
      return;
    }

    const completionState = state;

    publishState({ ...completionState, status: "owner-setup-completing" });

    try {
      applyOwnerSetupCompletionResult(
        await completeProductionOwnerSetup({
          challengeId: completionState.challengeId,
          completionId: completionState.completionId,
          email: completionState.email,
          setupToken: completionState.setupToken,
        }),
      );
    } catch (error) {
      publishState({
        ...completionState,
        failureCode: authAccountFailureCode(error),
        status: "owner-setup-completion-ready",
      });
    }
  }

  async function submitCurrentAction() {
    const submittedSession = markAuthAccountDraftSessionSubmitted(draftSession);
    const submission = selectAuthAccountDraftSubmission({ session: submittedSession, state });
    if (!submission.ok) {
      setDraftSession(submittedSession);
      return;
    }

    await pendingGuard.current.run(async () => {
      switch (submission.kind) {
        case "owner-setup-identity":
          await submitOwnerSetupStart(submission.displayName, submission.email);
          return;
        case "owner-setup-verification-token":
          await submitOwnerSetupEmailToken(submission.token);
          return;
        case "email-verification":
          await submitEmailVerificationRequest(submission.email);
          return;
        case "verification-token":
          await submitEmailVerificationToken(submission.token);
          return;
        case "profile-completion":
          await submitProfileCompletion(submission.input);
          return;
        case "terms-acceptance":
          await submitTermsAcceptance(submission.acceptedPolicyIds);
          return;
      }
    });
  }

  async function logoutForbiddenAccount() {
    if (state.status !== "forbidden" || state.action?.kind === "logout-pending") {
      return;
    }

    const result = state.result;

    publishState({ action: { kind: "logout-pending" }, result, status: "forbidden" });

    try {
      const loggedOut = await logoutAccountSession();

      if (loggedOut.continueTo) {
        navigateTo(loggedOut.continueTo);
        return;
      }

      setSessionRevision((revision) => revision + 1);
    } catch (error) {
      publishState({
        action: {
          code: authAccountFailureCode(error),
          kind: "logout-failed",
        },
        result,
        status: "forbidden",
      });
    }
  }

  function retryCurrentState() {
    if (state.status === "owner-setup-completion-ready") {
      void pendingGuard.current.run(retryOwnerSetupCompletion);
      return;
    }
    if (state.status === "owner-setup-invalid") {
      setSessionRevision((revision) => revision + 1);
      return;
    }
    if (state.status.startsWith("owner-setup-") && "failureCode" in state && state.failureCode) {
      publishState({ ...state, failureCode: undefined } as AuthAccountRouteState);
      return;
    }
    if (state.status === "failed") {
      setSessionRevision((revision) => revision + 1);
      return;
    }
    if (state.status === "blocked" && state.action) {
      publishState({ result: state.result, status: "blocked" });
      return;
    }
  }

  async function handleIntent(intent: AuthIntent) {
    if (!authIntentIsCurrent(surface, intent)) return;

    if (intent.type === "authField") {
      setDraftSession((session) => nextAuthAccountDraftSession(session, intent.intent));
      return;
    }
    if (intent.type === "authPolicySelection") {
      setDraftSession((session) => nextAuthAccountDraftSession(session, intent));
      return;
    }
    if (intent.type === "authPasskey") {
      await pendingGuard.current.run(submitOwnerSetupPasskey);
      return;
    }
    if (intent.type === "authAction") {
      const action = surface.actions.find((candidate) => candidate.id === intent.actionId);
      if (action?.purpose === "submit") await submitCurrentAction();
      else if (action?.purpose === "retry") retryCurrentState();
      else if (action?.purpose === "logout") {
        await pendingGuard.current.run(logoutForbiddenAccount);
      }
      return;
    }
    if (intent.type === "authContinuation" && "continueTo" in state && state.continueTo) {
      navigateTo(state.continueTo);
    }
  }

  return (
    <NoShellAuthRuntimeBoundary
      key={surface.surfaceKind}
      onIntent={handleIntent}
      reference={reference}
      snapshot={surface}
    >
      <ApplicationPresentation presentation={{ kind: "auth", reference }} />
    </NoShellAuthRuntimeBoundary>
  );
}

export function startAuthAccountRouteSession({
  currentOrigin,
  fetcher = fetch,
  locationPath = runtimeTopologyRoutes.authAccountRoute,
  locationSearch,
  navigateTo,
  onState,
}: StartAuthAccountRouteSessionOptions) {
  if (locationPath === runtimeTopologyRoutes.authAccountSetupRoute) {
    return startOwnerSetupAccountRouteSession({
      fetcher,
      locationSearch,
      onState,
    });
  }

  const controller = new AbortController();
  let stopped = false;

  onState({ status: "loading" });

  if (!searchHasContinuationTarget(normalizedSearch(locationSearch))) {
    onState({
      code: "invalid-response",
      status: "failed",
    });

    return () => {
      stopped = true;
      controller.abort();
    };
  }

  async function loadAccountStatus() {
    try {
      const result = await fetchAuthAccountStatus({
        fetcher,
        locationSearch,
        signal: controller.signal,
      });

      if (stopped) {
        return;
      }

      if (result.status === "forbidden") {
        onState({ result, status: "forbidden" });
        return;
      }

      if (result.status === "blocked") {
        onState({ result, status: "blocked" });
        return;
      }

      const continueTo = authAccountContinuationTarget(result, locationSearch, currentOrigin);

      if (continueTo && navigateTo) {
        onState({ continueTo, result, status: "continuing" });
        navigateTo(continueTo);
        return;
      }

      onState({ ...(continueTo ? { continueTo } : {}), result, status: "complete" });
    } catch (error) {
      if (!stopped && !controller.signal.aborted) {
        onState({
          code: authAccountFailureCode(error),
          status: "failed",
        });
      }
    }
  }

  void loadAccountStatus();

  return () => {
    stopped = true;
    controller.abort();
  };
}

function startOwnerSetupAccountRouteSession({
  fetcher,
  locationSearch,
  onState,
}: {
  fetcher: typeof fetch;
  locationSearch: string;
  onState: (state: AuthAccountRouteState) => void;
}) {
  const controller = new AbortController();
  let stopped = false;
  const routeRequest = ownerSetupRouteRequestFromSearch(locationSearch);

  onState({ status: "owner-setup-loading" });

  if (!routeRequest.ok) {
    onState({ code: "invalid-response", status: "owner-setup-invalid" });

    return () => {
      stopped = true;
      controller.abort();
    };
  }
  const request = routeRequest.request;

  async function loadOwnerSetup() {
    try {
      const setup = await fetchProductionOwnerSetupStatus({
        fetcher,
        signal: controller.signal,
      });

      if (stopped) {
        return;
      }

      if (setup.setupComplete) {
        onState({
          ...(setup.owner ? { owner: setup.owner } : {}),
          status: "owner-setup-already-complete",
        });
        return;
      }

      if (request.challengeId && request.email && request.verificationToken) {
        const verified = await verifyProductionOwnerSetupEmail({
          challengeId: request.challengeId,
          email: request.email,
          fetcher,
          setupToken: request.setupToken,
          signal: controller.signal,
          token: request.verificationToken,
        });

        if (!stopped) {
          onState({
            challengeId: verified.ownerSetup.challengeId,
            displayName: verified.ownerSetup.displayName,
            email: verified.ownerSetup.displayEmail,
            expiresAt: verified.ownerSetup.expiresAt,
            setupToken: request.setupToken,
            status: "owner-setup-credential-ready",
          });
        }
        return;
      }

      onState({
        setupToken: request.setupToken,
        status: "owner-setup-ready",
      });
    } catch (error) {
      if (!stopped && !controller.signal.aborted) {
        onState({
          code: authAccountFailureCode(error),
          status: "owner-setup-invalid",
        });
      }
    }
  }

  void loadOwnerSetup();

  return () => {
    stopped = true;
    controller.abort();
  };
}

export async function fetchProductionOwnerSetupStatus({
  fetcher = fetch,
  signal,
}: AuthAccountApiOptions = {}): Promise<OwnerSetupStatusResponse> {
  const response = await fetcher(ownerSetupStatusPath, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  const body = await readAuthAccountJson(response);

  if (!response.ok) {
    throw authAccountApiError(body, response.status);
  }

  return parseAuthAccountResponse(() => parseOwnerSetupStatusResponse(body), response.status);
}

export async function startProductionOwnerSetup({
  displayName,
  email,
  fetcher = fetch,
  setupToken,
  signal,
}: AuthAccountApiOptions & {
  displayName: string;
  email: string;
  setupToken: string;
}): Promise<{ ownerSetup: OwnerSetupChallengeSummary }> {
  const response = await postAuthAccountJson({
    body: { displayName, email, setupToken },
    fetcher,
    path: ownerSetupStartPath,
    signal,
  });

  if (!response.ok) {
    throw authAccountApiError(response.body, response.status);
  }

  return parseAuthAccountResponse(
    () => parseOwnerSetupChallengeResponse(response.body),
    response.status,
  );
}

export async function verifyProductionOwnerSetupEmail({
  challengeId,
  email,
  fetcher = fetch,
  setupToken,
  signal,
  token,
}: AuthAccountApiOptions & {
  challengeId: string;
  email: string;
  setupToken: string;
  token: string;
}): Promise<{ ownerSetup: OwnerSetupChallengeSummary; verified: true }> {
  const response = await postAuthAccountJson({
    body: { challengeId, email, setupToken, token },
    fetcher,
    path: ownerSetupEmailVerifyPath,
    signal,
  });

  if (!response.ok) {
    throw authAccountApiError(response.body, response.status);
  }

  return parseAuthAccountResponse(() => {
    const parsed = parseRecord("Owner setup email verification response", response.body);

    if (parsed.verified !== true) throw new AuthAccountApiError("invalid-response");

    return {
      ownerSetup: parseOwnerSetupChallengeSummary(parsed.ownerSetup),
      verified: true as const,
    };
  }, response.status);
}

export async function prepareProductionOwnerSetupPasskey({
  challengeId,
  createRegistrationResponse = createBrowserPasskeyRegistrationResponse,
  email,
  fetcher = fetch,
  setupToken,
  signal,
}: AuthAccountApiOptions & {
  challengeId: string;
  createRegistrationResponse?: CreatePasskeyRegistrationResponse;
  email: string;
  setupToken: string;
}): Promise<OwnerSetupPasskeyPreparation> {
  const request = { challengeId, email, setupToken };
  const optionsResponse = await postAuthAccountJson({
    body: request,
    fetcher,
    path: ownerSetupPasskeyRegistrationOptionsPath,
    signal,
  });

  if (!optionsResponse.ok) {
    throw authAccountApiError(optionsResponse.body, optionsResponse.status);
  }

  const options = parseAuthAccountResponse(
    () => parseOwnerSetupPasskeyOptionsResponse(optionsResponse.body),
    optionsResponse.status,
  );
  let registrationResponse: Awaited<ReturnType<CreatePasskeyRegistrationResponse>>;

  try {
    registrationResponse = await createRegistrationResponse(options.options);
  } catch {
    throw new AuthAccountPasskeyError();
  }
  const verifyResponse = await postAuthAccountJson({
    body: {
      ...request,
      completionId: options.completionId,
      response: registrationResponse,
    },
    fetcher,
    path: ownerSetupPasskeyRegistrationVerifyPath,
    signal,
  });

  if (!verifyResponse.ok) {
    throw authAccountApiError(verifyResponse.body, verifyResponse.status);
  }

  return parseAuthAccountResponse(
    () => parseOwnerSetupPasskeyPreparation(verifyResponse.body),
    verifyResponse.status,
  );
}

export async function completeProductionOwnerSetup({
  challengeId,
  completionId,
  email,
  fetcher = fetch,
  setupToken,
  signal,
}: AuthAccountApiOptions & {
  challengeId: string;
  completionId: string;
  email: string;
  setupToken: string;
}): Promise<OwnerSetupCompletionApiResult> {
  const response = await postAuthAccountJson({
    body: { challengeId, completionId, email, setupToken },
    fetcher,
    path: ownerSetupCompletePath,
    signal,
  });

  if (!response.ok) {
    throw authAccountApiError(response.body, response.status);
  }

  return parseAuthAccountResponse(
    () => parseOwnerSetupCompletionResponse(response.body),
    response.status,
  );
}

export async function fetchAuthAccountStatus({
  fetcher = fetch,
  locationSearch,
  signal,
}: AuthAccountFetchOptions): Promise<AuthAccountStatusResult> {
  const response = await fetcher(authAccountStatusRequestPath(locationSearch), {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  const body = await readAuthAccountJson(response);

  if (response.status === 403) {
    try {
      const result = parseAuthAccountStatusResult(body);

      if (result.status === "forbidden") return result;
    } catch {
      // Fall through to the closed API error parser.
    }
  }

  if (response.status === 409) {
    try {
      const result = parseAuthAccountStatusResult(body);

      if (result.status === "blocked") return result;
    } catch {
      // Fall through to the closed API error parser.
    }
  }

  if (!response.ok) {
    throw authAccountApiError(body, response.status);
  }

  return parseAuthAccountResponse(() => parseAuthAccountStatusResult(body), response.status);
}

export async function requestAuthAccountEmailVerification({
  email,
  fetcher = fetch,
  signal,
  target,
}: AuthAccountApiOptions & {
  email: string;
  target: AccountCompletionGateTarget;
}): Promise<{ challenge: EmailVerificationChallengeSummary }> {
  const response = await postAuthAccountJson({
    body: { email, purpose: "account-completion", target },
    fetcher,
    path: emailVerificationRequestPath,
    signal,
  });

  if (!response.ok) {
    throw authAccountApiError(response.body, response.status);
  }

  return parseAuthAccountResponse(
    () => parseEmailVerificationRequestResponse(response.body),
    response.status,
  );
}

export async function verifyAuthAccountEmailVerification({
  challengeId,
  email,
  fetcher = fetch,
  signal,
  target,
  token,
}: AuthAccountApiOptions & {
  challengeId: string;
  email: string;
  target: AccountCompletionGateTarget;
  token: string;
}): Promise<void> {
  const response = await postAuthAccountJson({
    body: { challengeId, email, purpose: "account-completion", target, token },
    fetcher,
    path: emailVerificationVerifyPath,
    signal,
  });

  if (!response.ok) {
    throw authAccountApiError(response.body, response.status);
  }
}

export async function completeAuthAccountProfileCompletionGate({
  fetcher = fetch,
  idempotencyKey = profileCompletionIdempotencyKey(),
  input,
  locationSearch = "",
  operation,
  signal,
  target,
}: AuthAccountApiOptions & {
  idempotencyKey?: string;
  input: Record<string, unknown>;
  locationSearch?: string;
  operation: NonNullable<AccountCompletionProfileCompletionGate["operation"]>;
  target: AccountCompletionGateTarget;
}): Promise<AuthAccountCompletionApiResult> {
  const response = await postAuthAccountJson({
    body: { idempotencyKey, input, operation, target },
    fetcher,
    path: authAccountApiPathWithSearch(profileCompletionGateCompletePath, locationSearch),
    signal,
  });

  return parseGateCompletionResponse(response, "Profile completion response");
}

export async function completeAuthAccountTermsAcceptanceGate({
  acceptedPolicyIds,
  fetcher = fetch,
  locationSearch = "",
  signal,
  target,
}: AuthAccountApiOptions & {
  acceptedPolicyIds: string[];
  locationSearch?: string;
  target: AccountCompletionGateTarget;
}): Promise<AuthAccountCompletionApiResult> {
  const response = await postAuthAccountJson({
    body: { acceptedPolicyIds, target },
    fetcher,
    path: authAccountApiPathWithSearch(termsAcceptanceGateCompletePath, locationSearch),
    signal,
  });

  return parseGateCompletionResponse(response, "Terms acceptance completion response");
}

export function authAccountContinuationTarget(
  result: AccountCompletionContinuationResult,
  locationSearch: string,
  currentOrigin?: string,
): `/${string}` | undefined {
  void locationSearch;

  if (
    currentOrigin !== undefined &&
    result.target.targetOrigin !== currentOrigin &&
    !result.continueTo.startsWith(instanceAuthHandoffStartPath)
  ) {
    return undefined;
  }

  return result.continueTo;
}

export function authAccountCompletionApiContinuationTarget(
  result: AuthAccountCompletionApiResult,
  locationSearch: string,
  currentOrigin?: string,
): `/${string}` | undefined {
  void locationSearch;

  if (result.accountCompletion.status !== "complete") {
    return undefined;
  }

  if (result.continueTo) {
    return result.continueTo;
  }

  if (
    currentOrigin !== undefined &&
    result.accountCompletion.target.targetOrigin !== currentOrigin
  ) {
    return undefined;
  }

  return result.accountCompletion.continueTo;
}

export function authAccountHandoffContinuationTarget(
  result: AuthAccountCompletionApiResult,
  locationSearch: string,
): `/${string}` | undefined {
  void locationSearch;

  if (result.accountCompletion.status !== "complete") {
    return undefined;
  }

  return result.continueTo;
}

export class AuthAccountApiError extends Error {
  readonly code: InstanceAuthErrorCode | "invalid-response";
  status: number | undefined;

  constructor(code: InstanceAuthErrorCode | "invalid-response", options: { status?: number } = {}) {
    super("Auth account API request failed.");
    this.name = "AuthAccountApiError";
    this.code = code;
    this.status = options.status;
  }
}

class AuthAccountPasskeyError extends Error {
  constructor() {
    super("Auth account passkey ceremony failed.");
    this.name = "AuthAccountPasskeyError";
  }
}

function authAccountStatusRequestPath(locationSearch: string): string {
  return `${runtimeTopologyRoutes.authAccountRoute}${normalizedSearch(locationSearch)}`;
}

function authAccountApiPathWithSearch(path: string, locationSearch: string): string {
  return `${path}${normalizedSearch(locationSearch)}`;
}

function normalizedSearch(locationSearch: string): string {
  if (locationSearch === "") {
    return "";
  }

  return locationSearch.startsWith("?") ? locationSearch : `?${locationSearch}`;
}

function searchHasContinuationTarget(search: string): boolean {
  if (search === "") {
    return false;
  }

  const params = new URLSearchParams(search);

  return params.has("returnTo") || params.has("targetOrigin");
}

async function postAuthAccountJson({
  body,
  fetcher,
  path,
  signal,
}: {
  body: unknown;
  fetcher: typeof fetch;
  path: string;
  signal?: AbortSignal;
}): Promise<{ body: unknown; ok: boolean; status: number }> {
  const response = await fetcher(path, {
    body: JSON.stringify(body),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });

  return {
    body: await readAuthAccountJson(response),
    ok: response.ok,
    status: response.status,
  };
}

function parseGateCompletionResponse(
  response: { body: unknown; ok: boolean; status: number },
  context: string,
): AuthAccountCompletionApiResult {
  if (!response.ok) {
    try {
      const object = parseRecord(context, response.body);
      const accountCompletion = parseAccountCompletionGateResolutionResult(
        object.accountCompletion,
      );

      if (accountCompletion.status === "blocked") return { accountCompletion };
    } catch {
      // Fall through to the closed API error parser.
    }

    throw authAccountApiError(response.body, response.status);
  }

  return parseAuthAccountResponse(
    () =>
      parseAuthAccountCompletionApiResult(response.body, {
        completedRequired: true,
        context,
      }),
    response.status,
  );
}

function profileCompletionIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;

  if (typeof cryptoApi?.randomUUID === "function") {
    return `profile-completion:${cryptoApi.randomUUID()}`;
  }

  return `profile-completion:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function parseAuthAccountCompletionApiResult(
  value: unknown,
  options: { completedRequired: boolean; context: string },
): AuthAccountCompletionApiResult {
  const object = parseRecord(options.context, value);

  if (options.completedRequired && object.completed !== true) {
    throw new AuthAccountApiError("invalid-response");
  }

  return {
    accountCompletion: parseAccountCompletionGateResolutionResult(object.accountCompletion),
    ...parseOptionalPathOnlyContinueTo(object.continueTo),
    ...parseOptionalAuthAccountCompletionHandoff(object.handoff),
  };
}

function parseOptionalPathOnlyContinueTo(value: unknown): { continueTo?: `/${string}` } {
  if (value === undefined) {
    return {};
  }

  const continueTo = parseAccountRedirectTarget(value);

  if (!continueTo) {
    throw new AuthAccountApiError("invalid-response");
  }

  return { continueTo };
}

function parseOptionalAuthAccountCompletionHandoff(value: unknown): {
  handoff?: AuthAccountCompletionHandoff;
} {
  if (value === undefined) {
    return {};
  }

  const object = parseRecord("Account completion handoff", value);
  const returnTo = parseAccountRedirectTarget(object.returnTo);

  if (!returnTo) {
    throw new AuthAccountApiError("invalid-response");
  }

  return {
    handoff: {
      returnTo,
      targetOrigin: parseInstanceAuthCanonicalOrigin(object.targetOrigin),
    },
  };
}

function ownerSetupRouteRequestFromSearch(
  locationSearch: string,
): { ok: true; request: OwnerSetupRouteRequest } | { ok: false } {
  const params = new URLSearchParams(normalizedSearch(locationSearch));
  const challengeId = optionalSearchParam(params, "challengeId");
  const email = optionalSearchParam(params, "email");
  const setupTokenValue =
    optionalSearchParam(params, "setupToken") ??
    (challengeId === undefined ? optionalSearchParam(params, "token") : undefined);
  const verificationToken =
    challengeId === undefined ? undefined : optionalSearchParam(params, "token");

  try {
    const setupToken = parseOwnerSetupToken(setupTokenValue);
    const hasVerificationInput =
      challengeId !== undefined || email !== undefined || verificationToken !== undefined;

    if (
      hasVerificationInput &&
      (challengeId === undefined || email === undefined || verificationToken === undefined)
    ) {
      throw new Error("Owner setup email link is incomplete.");
    }

    return {
      ok: true,
      request: {
        ...(challengeId ? { challengeId } : {}),
        ...(email ? { email } : {}),
        setupToken,
        ...(verificationToken ? { verificationToken } : {}),
      },
    };
  } catch {
    return { ok: false };
  }
}

function parseOwnerSetupStatusResponse(value: unknown): OwnerSetupStatusResponse {
  const object = parseRecord("Owner setup status response", value);

  if (typeof object.setupComplete !== "boolean") {
    throw new AuthAccountApiError("invalid-response");
  }

  return {
    ...(typeof object.adminOrigin === "string" ? { adminOrigin: object.adminOrigin } : {}),
    ...(typeof object.authOrigin === "string" ? { authOrigin: object.authOrigin } : {}),
    setupComplete: object.setupComplete,
    ...(object.owner === undefined ? {} : { owner: parseOwnerIdentity(object.owner) }),
  };
}

function parseOwnerSetupChallengeResponse(value: unknown): {
  ownerSetup: OwnerSetupChallengeSummary;
} {
  const object = parseRecord("Owner setup challenge response", value);

  return { ownerSetup: parseOwnerSetupChallengeSummary(object.ownerSetup) };
}

function parseOwnerSetupChallengeSummary(value: unknown): OwnerSetupChallengeSummary {
  const object = parseRecord("Owner setup challenge", value);
  const status = requiredString(object.status, "Owner setup challenge status");

  if (status !== "email-sent" && status !== "email-verified" && status !== "passkey-prepared") {
    throw new AuthAccountApiError("invalid-response");
  }

  return {
    challengeId: requiredString(object.challengeId, "Owner setup challenge id"),
    displayEmail: requiredString(object.displayEmail, "Owner setup display email"),
    displayName: requiredString(object.displayName, "Owner setup display name"),
    expiresAt: requiredString(object.expiresAt, "Owner setup expiry"),
    status,
  };
}

function parseOwnerSetupPasskeyOptionsResponse(value: unknown): {
  completionId: string;
  options: AuthAccountPasskeyRegistrationOptions;
} {
  const object = parseRecord("Owner setup passkey options response", value);

  if (!isRecord(object.options)) {
    throw new AuthAccountApiError("invalid-response");
  }

  return {
    completionId: requiredString(object.completionId, "Owner setup completion id"),
    options: object.options as unknown as AuthAccountPasskeyRegistrationOptions,
  };
}

function parseOwnerSetupPasskeyPreparation(value: unknown): OwnerSetupPasskeyPreparation {
  const object = parseRecord("Owner setup passkey verification response", value);

  if (object.prepared !== true) {
    throw new AuthAccountApiError("invalid-response");
  }

  return {
    completionId: requiredString(object.completionId, "Owner setup completion id"),
    ownerSetup: parseOwnerSetupChallengeSummary(object.ownerSetup),
    prepared: true,
  };
}

function parseOwnerSetupCompletionResponse(value: unknown): OwnerSetupCompletionApiResult {
  const object = parseRecord("Owner setup completion response", value);

  if (object.completed !== true || object.setupComplete !== true) {
    throw new AuthAccountApiError("invalid-response");
  }

  const session = parseRecord("Owner setup session", object.session);

  return {
    completed: true,
    completionId: requiredString(object.completionId, "Owner setup completion id"),
    ...parseOptionalOwnerSetupContinueTo(object.continueTo),
    ...parseOptionalAuthAccountCompletionHandoff(object.handoff),
    owner: parseOwnerIdentity(object.owner),
    session: {
      expiresAt: requiredString(session.expiresAt, "Owner setup session expiry"),
    },
    setupComplete: true,
  };
}

function parseOptionalOwnerSetupContinueTo(value: unknown): { continueTo?: string } {
  if (value === undefined) {
    return {};
  }

  if (typeof value !== "string") {
    throw new AuthAccountApiError("invalid-response");
  }

  const path = parseAccountRedirectTarget(value);

  if (path) {
    return { continueTo: path };
  }

  try {
    const url = new URL(value);

    if (
      url.username ||
      url.password ||
      url.hash ||
      (url.protocol !== "http:" && url.protocol !== "https:")
    ) {
      throw new Error("unsafe continuation");
    }

    return { continueTo: `${url.origin}${url.pathname}${url.search}` };
  } catch {
    throw new AuthAccountApiError("invalid-response");
  }
}

function parseOwnerIdentity(value: unknown): OwnerIdentity {
  const object = parseRecord("Owner identity", value);

  return {
    createdAt: requiredString(object.createdAt, "Owner createdAt"),
    ...(object.email === undefined ? {} : { email: requiredString(object.email, "Owner email") }),
    id: requiredString(object.id, "Owner id"),
    name: requiredString(object.name, "Owner name"),
  };
}

function parseEmailVerificationRequestResponse(value: unknown): {
  challenge: EmailVerificationChallengeSummary;
} {
  const object = parseRecord("Email verification request response", value);

  return {
    challenge: parseEmailVerificationChallengeSummary(object.challenge),
  };
}

function parseEmailVerificationChallengeSummary(value: unknown): EmailVerificationChallengeSummary {
  const object = parseRecord("Email verification challenge", value);

  return {
    challengeId: requiredString(object.challengeId, "Email verification challenge id"),
    displayEmail: requiredString(object.displayEmail, "Email verification display email"),
    expiresAt: requiredString(object.expiresAt, "Email verification expiry"),
    purpose: requiredString(
      object.purpose,
      "Email verification purpose",
    ) as EmailVerificationChallengeSummary["purpose"],
  };
}

function parseRecord(_context: string, value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new AuthAccountApiError("invalid-response");
  }

  return value;
}

function requiredString(value: unknown, _context: string): string {
  if (typeof value !== "string" || value === "") {
    throw new AuthAccountApiError("invalid-response");
  }

  return value;
}

function optionalSearchParam(params: URLSearchParams, name: string): string | undefined {
  const value = params.get(name);

  return value === null || value === "" ? undefined : value;
}

async function readAuthAccountJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new AuthAccountApiError("invalid-response", {
      status: response.status,
    });
  }
}

function authAccountApiError(value: unknown, status: number): AuthAccountApiError {
  try {
    return new AuthAccountApiError(parseInstanceAuthErrorResponse(value).code, { status });
  } catch {
    return new AuthAccountApiError("invalid-response", { status });
  }
}

function parseAuthAccountResponse<T>(parse: () => T, status?: number): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof AuthAccountApiError) throw error;
    throw new AuthAccountApiError("invalid-response", status === undefined ? {} : { status });
  }
}

function authAccountFailureCode(error: unknown): AuthAccountFailureCode {
  if (error instanceof AuthAccountApiError) return error.code;
  if (error instanceof AuthAccountPasskeyError) return "passkey-failed";
  return "network-failure";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
