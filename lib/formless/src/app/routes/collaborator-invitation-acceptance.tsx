import { useEffect, useMemo, useRef, useState } from "react";
import type { AuthIntent } from "@dpeek/formless-presentation/contract";
import { useSearch } from "wouter";

import {
  COLLABORATOR_INVITATION_ACCEPT_PATH,
  parseCollaboratorInvitationAcceptanceRequest,
  parseCollaboratorInvitationAcceptanceStatusResponse,
  parseCollaboratorInvitationPasskeyRegistrationOptionsResponse,
  parseCollaboratorInvitationPasskeyRegistrationVerifyResponse,
  parseInstanceAuthErrorResponse,
  type CollaboratorInvitationAcceptanceHandoffSummary,
  type CollaboratorInvitationAcceptanceFailureReason,
  type CollaboratorInvitationAcceptanceInvitationSummary,
  type CollaboratorInvitationAcceptanceRequest,
  type CollaboratorInvitationAcceptanceStatusResponse,
  type CollaboratorInvitationAcceptedPrincipalSummary,
  type CollaboratorInvitationPasskeyRegistrationOptionsResponse,
  type CollaboratorInvitationPasskeyRegistrationVerifyRequest,
  type CollaboratorInvitationPasskeyRegistrationVerifyResponse,
  type InstanceAuthErrorCode,
} from "../../shared/instance-auth.ts";
import { ApplicationPresentation } from "../application-presentation.tsx";
import {
  authIntentIsCurrent,
  createAuthPendingGuard,
  NoShellAuthRuntimeBoundary,
} from "./auth-runtime-boundary.tsx";
import {
  collaboratorInvitationAuthSurfaceReference,
  projectCollaboratorInvitationAuthSurface,
} from "./collaborator-invitation-auth-projection.ts";
import {
  browserSupportsPasskeys,
  createBrowserPasskeyRegistrationResponse,
  type CreatePasskeyRegistrationResponse,
} from "./passkey-browser.ts";

export const COLLABORATOR_INVITATION_PASSKEY_REGISTER_OPTIONS_ROUTE = `${COLLABORATOR_INVITATION_ACCEPT_PATH}/passkeys/register/options`;
export const COLLABORATOR_INVITATION_PASSKEY_REGISTER_VERIFY_ROUTE = `${COLLABORATOR_INVITATION_ACCEPT_PATH}/passkeys/register/verify`;

export type CollaboratorInvitationAcceptanceRouteState =
  | {
      status: "accepted";
      acceptedPrincipal: CollaboratorInvitationAcceptedPrincipalSummary;
      handoff?: CollaboratorInvitationAcceptanceHandoffSummary;
      invitation: CollaboratorInvitationAcceptanceInvitationSummary;
      session: CollaboratorInvitationPasskeyRegistrationVerifyResponse["session"];
    }
  | {
      status: "continuing";
      acceptedPrincipal: CollaboratorInvitationAcceptedPrincipalSummary;
      continueTo: string;
      handoff?: CollaboratorInvitationAcceptanceHandoffSummary;
      invitation: CollaboratorInvitationAcceptanceInvitationSummary;
      session: CollaboratorInvitationPasskeyRegistrationVerifyResponse["session"];
    }
  | { status: "eligible"; invitation: CollaboratorInvitationAcceptanceInvitationSummary }
  | { code: CollaboratorInvitationFailureCode; status: "failed" }
  | { status: "invalid-link" }
  | { status: "loading" }
  | {
      status: "passkey-unavailable";
      invitation: CollaboratorInvitationAcceptanceInvitationSummary;
    }
  | { status: "submitting"; invitation: CollaboratorInvitationAcceptanceInvitationSummary }
  | {
      status: "unavailable";
      reason: CollaboratorInvitationAcceptanceFailureReason;
    };

export type CollaboratorInvitationFailureCode =
  | InstanceAuthErrorCode
  | "invalid-response"
  | "network-failure"
  | "passkey-failed";

type StartCollaboratorInvitationAcceptanceRouteSessionOptions = {
  fetcher?: typeof fetch;
  locationSearch: string;
  onState: (state: CollaboratorInvitationAcceptanceRouteState) => void;
  passkeysSupported?: () => boolean;
};

type CollaboratorInvitationAcceptanceFetchOptions = {
  fetcher?: typeof fetch;
  request: CollaboratorInvitationAcceptanceRequest;
  signal?: AbortSignal;
};

type CompleteCollaboratorInvitationAcceptanceOptions =
  CollaboratorInvitationAcceptanceFetchOptions & {
    createRegistrationResponse?: CreatePasskeyRegistrationResponse;
  };

export function CollaboratorInvitationAcceptanceRoute() {
  const locationSearch = useSearch();
  const [state, setState] = useState<CollaboratorInvitationAcceptanceRouteState>({
    status: "loading",
  });
  const pendingGuard = useRef(createAuthPendingGuard());

  useEffect(
    () =>
      startCollaboratorInvitationAcceptanceRouteSession({
        locationSearch,
        onState: setState,
      }),
    [locationSearch],
  );

  const surface = useMemo(() => projectCollaboratorInvitationAuthSurface({ state }), [state]);

  async function submitAcceptance() {
    if (state.status !== "eligible") {
      return;
    }

    const routeRequest = collaboratorInvitationAcceptanceRequestFromSearch(locationSearch);

    if (!routeRequest.ok) {
      setState({ status: "invalid-link" });
      return;
    }

    if (!browserSupportsPasskeys()) {
      setState({
        status: "passkey-unavailable",
        invitation: state.invitation,
      });
      return;
    }

    const invitation = state.invitation;

    await pendingGuard.current.run(async () => {
      setState({ status: "submitting", invitation });

      try {
        const accepted = await completeCollaboratorInvitationAcceptance({
          request: routeRequest.request,
        });
        const continuationUrl = collaboratorInvitationAcceptanceContinuationUrl(accepted);

        if (continuationUrl) {
          setState({
            status: "continuing",
            acceptedPrincipal: accepted.acceptedPrincipal,
            continueTo: continuationUrl,
            ...(accepted.handoff === undefined ? {} : { handoff: accepted.handoff }),
            invitation: accepted.invitation,
            session: accepted.session,
          });
          window.location.assign(continuationUrl);
          return;
        }

        setState({
          status: "accepted",
          acceptedPrincipal: accepted.acceptedPrincipal,
          ...(accepted.handoff === undefined ? {} : { handoff: accepted.handoff }),
          invitation: accepted.invitation,
          session: accepted.session,
        });
      } catch (error) {
        setState({
          code: collaboratorInvitationFailureCode(error),
          status: "failed",
        });
      }
    });
  }

  async function handleIntent(intent: AuthIntent) {
    if (!authIntentIsCurrent(surface, intent)) {
      return;
    }

    if (intent.type === "authPasskey") {
      await submitAcceptance();
      return;
    }

    if (intent.type === "authContinuation" && state.status === "continuing") {
      window.location.assign(state.continueTo);
    }
  }

  return (
    <NoShellAuthRuntimeBoundary
      onIntent={handleIntent}
      reference={collaboratorInvitationAuthSurfaceReference}
      snapshot={surface}
    >
      <ApplicationPresentation
        presentation={{
          kind: "auth",
          reference: collaboratorInvitationAuthSurfaceReference,
        }}
      />
    </NoShellAuthRuntimeBoundary>
  );
}

export function startCollaboratorInvitationAcceptanceRouteSession({
  fetcher = fetch,
  locationSearch,
  onState,
  passkeysSupported = browserSupportsPasskeys,
}: StartCollaboratorInvitationAcceptanceRouteSessionOptions) {
  const controller = new AbortController();
  let stopped = false;
  const routeRequest = collaboratorInvitationAcceptanceRequestFromSearch(locationSearch);

  onState({ status: "loading" });

  if (!routeRequest.ok) {
    onState({ status: "invalid-link" });

    return () => {
      stopped = true;
      controller.abort();
    };
  }

  const acceptanceRequest = routeRequest.request;

  async function loadInvitationStatus() {
    try {
      const status = await fetchCollaboratorInvitationAcceptanceStatus({
        fetcher,
        request: acceptanceRequest,
        signal: controller.signal,
      });

      if (stopped) {
        return;
      }

      onState(
        status.eligible
          ? passkeysSupported()
            ? { status: "eligible", invitation: status.invitation }
            : {
                status: "passkey-unavailable",
                invitation: status.invitation,
              }
          : {
              status: "unavailable",
              reason: status.reason,
            },
      );
    } catch (error) {
      if (!stopped && !controller.signal.aborted) {
        onState({
          code: collaboratorInvitationFailureCode(error),
          status: "failed",
        });
      }
    }
  }

  void loadInvitationStatus();

  return () => {
    stopped = true;
    controller.abort();
  };
}

export async function completeCollaboratorInvitationAcceptance({
  createRegistrationResponse = createBrowserPasskeyRegistrationResponse,
  fetcher = fetch,
  request,
  signal,
}: CompleteCollaboratorInvitationAcceptanceOptions): Promise<CollaboratorInvitationPasskeyRegistrationVerifyResponse> {
  const options = await fetchCollaboratorInvitationPasskeyRegistrationOptions({
    fetcher,
    request,
    signal,
  });
  let response: CollaboratorInvitationPasskeyRegistrationVerifyRequest["response"];

  try {
    response = await createRegistrationResponse(options.options);
  } catch {
    throw new CollaboratorInvitationPasskeyError();
  }

  return await verifyCollaboratorInvitationPasskeyRegistration({
    fetcher,
    request,
    response,
    signal,
  });
}

export async function fetchCollaboratorInvitationAcceptanceStatus({
  fetcher = fetch,
  request,
  signal,
}: CollaboratorInvitationAcceptanceFetchOptions): Promise<CollaboratorInvitationAcceptanceStatusResponse> {
  const url = new URL(COLLABORATOR_INVITATION_ACCEPT_PATH, "https://formless.local");

  url.searchParams.set("invitationId", request.invitationId);
  url.searchParams.set("token", request.token);

  const response = await fetcher(`${url.pathname}${url.search}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  const body = await readCollaboratorInvitationAcceptanceJson(response, {
    context: "Invitation status response",
  });

  try {
    return parseCollaboratorInvitationAcceptanceStatusResponse(body);
  } catch {
    if (!response.ok) throw collaboratorInvitationApiError(body, response.status);
    throw new CollaboratorInvitationAcceptanceApiError("invalid-response", {
      status: response.status,
    });
  }
}

export async function fetchCollaboratorInvitationPasskeyRegistrationOptions({
  fetcher = fetch,
  request,
  signal,
}: CollaboratorInvitationAcceptanceFetchOptions): Promise<CollaboratorInvitationPasskeyRegistrationOptionsResponse> {
  const response = await fetcher(COLLABORATOR_INVITATION_PASSKEY_REGISTER_OPTIONS_ROUTE, {
    body: JSON.stringify(request),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });
  const body = await readCollaboratorInvitationAcceptanceJson(response, {
    context: "Passkey registration options response",
  });

  if (!response.ok) {
    throw collaboratorInvitationApiError(body, response.status);
  }

  try {
    return parseCollaboratorInvitationPasskeyRegistrationOptionsResponse(body);
  } catch {
    throw new CollaboratorInvitationAcceptanceApiError("invalid-response", {
      status: response.status,
    });
  }
}

export async function verifyCollaboratorInvitationPasskeyRegistration({
  fetcher = fetch,
  request,
  response: registrationResponse,
  signal,
}: CollaboratorInvitationAcceptanceFetchOptions & {
  response: CollaboratorInvitationPasskeyRegistrationVerifyRequest["response"];
}): Promise<CollaboratorInvitationPasskeyRegistrationVerifyResponse> {
  const response = await fetcher(COLLABORATOR_INVITATION_PASSKEY_REGISTER_VERIFY_ROUTE, {
    body: JSON.stringify({
      invitationId: request.invitationId,
      response: registrationResponse,
      token: request.token,
    }),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });
  const body = await readCollaboratorInvitationAcceptanceJson(response, {
    context: "Passkey registration verify response",
  });

  if (!response.ok) {
    throw collaboratorInvitationApiError(body, response.status);
  }

  try {
    return parseCollaboratorInvitationPasskeyRegistrationVerifyResponse(body);
  } catch {
    throw new CollaboratorInvitationAcceptanceApiError("invalid-response", {
      status: response.status,
    });
  }
}

export function collaboratorInvitationAcceptanceContinuationUrl(
  accepted: Pick<
    CollaboratorInvitationPasskeyRegistrationVerifyResponse,
    "accountCompletion" | "continueTo" | "handoff"
  >,
  currentOrigin = typeof window === "undefined" ? undefined : window.location.origin,
): string | undefined {
  void currentOrigin;

  return accepted.accountCompletion?.status === "complete" ? accepted.continueTo : undefined;
}

export class CollaboratorInvitationAcceptanceApiError extends Error {
  readonly code: InstanceAuthErrorCode | "invalid-response";
  status: number | undefined;

  constructor(code: InstanceAuthErrorCode | "invalid-response", options: { status?: number } = {}) {
    super("Collaborator invitation API request failed.");
    this.name = "CollaboratorInvitationAcceptanceApiError";
    this.code = code;
    this.status = options.status;
  }
}

class CollaboratorInvitationPasskeyError extends Error {
  constructor() {
    super("Collaborator invitation passkey ceremony failed.");
    this.name = "CollaboratorInvitationPasskeyError";
  }
}

function collaboratorInvitationAcceptanceRequestFromSearch(
  locationSearch: string,
): { ok: true; request: CollaboratorInvitationAcceptanceRequest } | { ok: false } {
  const searchParams = new URLSearchParams(trimSearchPrefix(locationSearch));

  try {
    return {
      ok: true,
      request: parseCollaboratorInvitationAcceptanceRequest({
        invitationId: searchParams.get("invitationId"),
        token: searchParams.get("token"),
      }),
    };
  } catch {
    return { ok: false };
  }
}

async function readCollaboratorInvitationAcceptanceJson(
  response: Response,
  options: { context: string },
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    void options;
    throw new CollaboratorInvitationAcceptanceApiError("invalid-response", {
      status: response.status,
    });
  }
}

function collaboratorInvitationApiError(
  value: unknown,
  status: number,
): CollaboratorInvitationAcceptanceApiError {
  try {
    return new CollaboratorInvitationAcceptanceApiError(
      parseInstanceAuthErrorResponse(value).code,
      { status },
    );
  } catch {
    return new CollaboratorInvitationAcceptanceApiError("invalid-response", { status });
  }
}

function collaboratorInvitationFailureCode(error: unknown): CollaboratorInvitationFailureCode {
  if (error instanceof CollaboratorInvitationAcceptanceApiError) return error.code;
  if (error instanceof CollaboratorInvitationPasskeyError) return "passkey-failed";
  return "network-failure";
}

function trimSearchPrefix(search: string): string {
  return search.startsWith("?") ? search.slice(1) : search;
}
