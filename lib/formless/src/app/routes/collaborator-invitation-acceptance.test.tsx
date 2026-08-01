import { describe, expect, it } from "vite-plus/test";

import {
  COLLABORATOR_INVITATION_PASSKEY_REGISTER_OPTIONS_ROUTE,
  COLLABORATOR_INVITATION_PASSKEY_REGISTER_VERIFY_ROUTE,
  collaboratorInvitationAcceptanceContinuationUrl,
  completeCollaboratorInvitationAcceptance,
  fetchCollaboratorInvitationAcceptanceStatus,
  startCollaboratorInvitationAcceptanceRouteSession,
  type CollaboratorInvitationAcceptanceRouteState,
} from "./collaborator-invitation-acceptance.tsx";
import {
  COLLABORATOR_INVITATION_ACCEPT_PATH,
  type CollaboratorInvitationAcceptanceFailureReason,
  type CollaboratorInvitationAcceptanceInvitationSummary,
  type CollaboratorInvitationPasskeyRegistrationVerifyRequest,
} from "../../shared/instance-auth.ts";

const rawToken = "aW52aXRlLXJhdy10b2tlbi0x";
const tokenHash = "sha256-private-token-hash";
const sessionId = "central-session-private";
const grantSecret = "handoff-grant-private";

const eligibleInvitation = {
  expiresAt: "2026-07-01T00:00:00.000Z",
  invitationId: "invitation:eligible",
  invitedPrincipalDisplayName: "Ada Collaborator",
  passkeyRegistrationRequired: true,
  targetEmail: "Ada.Collab@example.com",
  targetSurface: "instance",
} satisfies CollaboratorInvitationAcceptanceInvitationSummary;

const failureCases = [
  {
    error: "Invitation link is invalid.",
    reason: "missing-invitation",
  },
  {
    error: "Invitation link has expired.",
    reason: "expired-invitation",
  },
  {
    error: "Invitation link is no longer available.",
    reason: "revoked-invitation",
  },
  {
    error: "Invitation link has already been used.",
    reason: "consumed-invitation",
  },
  {
    error: "Invitation has already been accepted.",
    reason: "accepted-invitation",
  },
  {
    error: "Invitation link is invalid.",
    reason: "wrong-token",
  },
  {
    error: "Invitation link is invalid.",
    reason: "wrong-target",
  },
  {
    error: "Invitation must be accepted on the configured auth origin.",
    reason: "wrong-origin",
  },
  {
    error: "Invitation acceptance is unavailable.",
    reason: "configuration-unavailable",
  },
] as const satisfies ReadonlyArray<{
  error: string;
  reason: CollaboratorInvitationAcceptanceFailureReason;
}>;

describe("collaborator invitation acceptance route data flow", () => {
  it("loads eligible invitation status through the display-safe status API only", async () => {
    const calls: FetchCall[] = [];
    const states: CollaboratorInvitationAcceptanceRouteState[] = [];
    const stop = startCollaboratorInvitationAcceptanceRouteSession({
      fetcher: recordingJsonFetcher(calls, {
        eligible: true,
        invitation: eligibleInvitation,
      }),
      locationSearch: `?invitationId=${encodeURIComponent(eligibleInvitation.invitationId)}&token=${rawToken}`,
      onState: (state) => states.push(state),
      passkeysSupported: () => true,
    });

    try {
      await waitFor(() => states.some((state) => state.status === "eligible"));
    } finally {
      stop();
    }

    expect(calls).toEqual([
      {
        body: undefined,
        credentials: "same-origin",
        input: `${COLLABORATOR_INVITATION_ACCEPT_PATH}?invitationId=invitation%3Aeligible&token=${rawToken}`,
        method: undefined,
      },
    ]);
    expect(states).toEqual([
      { status: "loading" },
      { status: "eligible", invitation: eligibleInvitation },
    ]);
    expect(JSON.stringify(states)).not.toContain(rawToken);
    expect(JSON.stringify(states)).not.toContain(tokenHash);
  });

  it("keeps eligible invitation facts visible when passkeys are unavailable", async () => {
    const states: CollaboratorInvitationAcceptanceRouteState[] = [];
    const stop = startCollaboratorInvitationAcceptanceRouteSession({
      fetcher: recordingJsonFetcher([], {
        eligible: true,
        invitation: eligibleInvitation,
      }),
      locationSearch: `?invitationId=${encodeURIComponent(eligibleInvitation.invitationId)}&token=${rawToken}`,
      onState: (state) => states.push(state),
      passkeysSupported: () => false,
    });

    try {
      await waitFor(() => states.some((state) => state.status === "passkey-unavailable"));
    } finally {
      stop();
    }

    expect(states).toEqual([
      { status: "loading" },
      {
        invitation: eligibleInvitation,
        message: "This browser does not support passkeys.",
        status: "passkey-unavailable",
      },
    ]);
    expect(JSON.stringify(states)).not.toContain(rawToken);
    expect(JSON.stringify(states)).not.toContain(tokenHash);
  });

  it("loads safe failure states without requesting passkey registration", async () => {
    for (const testCase of failureCases) {
      const calls: FetchCall[] = [];
      const states: CollaboratorInvitationAcceptanceRouteState[] = [];
      const stop = startCollaboratorInvitationAcceptanceRouteSession({
        fetcher: recordingJsonFetcher(
          calls,
          {
            eligible: false,
            error: testCase.error,
            reason: testCase.reason,
          },
          { status: testCase.reason === "configuration-unavailable" ? 503 : 401 },
        ),
        locationSearch: `?invitationId=invitation%3A${testCase.reason}&token=${rawToken}`,
        onState: (state) => states.push(state),
      });

      try {
        await waitFor(() => states.some((state) => state.status === "unavailable"));
      } finally {
        stop();
      }

      expect(calls, testCase.reason).toHaveLength(1);
      expect(calls[0]?.input, testCase.reason).toContain(COLLABORATOR_INVITATION_ACCEPT_PATH);
      expect(calls[0]?.input, testCase.reason).not.toContain("/passkeys/register/options");
      expect(calls[0]?.input, testCase.reason).not.toContain("/passkeys/register/verify");
      expect(states, testCase.reason).toEqual([
        { status: "loading" },
        {
          status: "unavailable",
          message: testCase.error,
          reason: testCase.reason,
        },
      ]);
      expect(JSON.stringify(states), testCase.reason).not.toContain(rawToken);
      expect(JSON.stringify(states), testCase.reason).not.toContain(tokenHash);
      expect(JSON.stringify(states), testCase.reason).not.toContain("principal:");
    }
  });

  it("keeps malformed invitation links local and display-safe", () => {
    const calls: FetchCall[] = [];
    const states: CollaboratorInvitationAcceptanceRouteState[] = [];
    const stop = startCollaboratorInvitationAcceptanceRouteSession({
      fetcher: recordingJsonFetcher(calls, { eligible: true, invitation: eligibleInvitation }),
      locationSearch: "?invitationId=invitation%3Amalformed&token=not a token",
      onState: (state) => states.push(state),
    });

    stop();

    expect(calls).toEqual([]);
    expect(states).toEqual([
      { status: "loading" },
      { status: "invalid-link", message: "Invitation link is invalid." },
    ]);
    expect(JSON.stringify(states)).not.toContain("not a token");
  });

  it("rejects status responses that expose private token material", async () => {
    await expect(
      fetchCollaboratorInvitationAcceptanceStatus({
        fetcher: recordingJsonFetcher([], {
          eligible: false,
          error: "Invitation link is invalid.",
          reason: "wrong-token",
          tokenHash,
        }),
        request: {
          invitationId: "invitation:private-field",
          token: rawToken,
        },
      }),
    ).rejects.toMatchObject({
      message:
        'Collaborator invitation acceptance status response has unsupported key "tokenHash".',
    });
  });

  it("requests invitation-bound passkey options and verifies registration", async () => {
    const calls: FetchCall[] = [];
    const createdFromOptions: unknown[] = [];
    const accepted = await completeCollaboratorInvitationAcceptance({
      createRegistrationResponse: async (options) => {
        createdFromOptions.push(options);

        return registrationResponse();
      },
      fetcher: recordingJsonSequenceFetcher(calls, [
        { body: { options: registrationOptions() } },
        { body: acceptedResponse() },
      ]),
      request: {
        invitationId: eligibleInvitation.invitationId,
        token: rawToken,
      },
    });

    expect(createdFromOptions).toEqual([registrationOptions()]);
    expect(calls).toEqual([
      {
        body: {
          invitationId: eligibleInvitation.invitationId,
          token: rawToken,
        },
        credentials: "same-origin",
        input: COLLABORATOR_INVITATION_PASSKEY_REGISTER_OPTIONS_ROUTE,
        method: "POST",
      },
      {
        body: {
          invitationId: eligibleInvitation.invitationId,
          response: registrationResponse(),
          token: rawToken,
        },
        credentials: "same-origin",
        input: COLLABORATOR_INVITATION_PASSKEY_REGISTER_VERIFY_ROUTE,
        method: "POST",
      },
    ]);
    expect(accepted).toEqual(acceptedResponse());
    expect(JSON.stringify(accepted)).not.toContain(rawToken);
    expect(JSON.stringify(accepted)).not.toContain(tokenHash);
    expect(JSON.stringify(accepted)).not.toContain(sessionId);
    expect(JSON.stringify(accepted)).not.toContain(grantSecret);
  });

  it("rejects passkey completion responses that expose private session or handoff material", async () => {
    const calls: FetchCall[] = [];

    await expect(
      completeCollaboratorInvitationAcceptance({
        createRegistrationResponse: async () => registrationResponse(),
        fetcher: recordingJsonSequenceFetcher(calls, [
          { body: { options: registrationOptions() } },
          {
            body: {
              ...acceptedResponse(),
              sessionId,
            },
          },
        ]),
        request: {
          invitationId: eligibleInvitation.invitationId,
          token: rawToken,
        },
      }),
    ).rejects.toMatchObject({
      message:
        'Collaborator invitation passkey registration verify response has unsupported key "sessionId".',
    });
    expect(calls).toHaveLength(2);
  });

  it("uses server-returned continuation URLs without rebuilding handoff targets", () => {
    expect(
      collaboratorInvitationAcceptanceContinuationUrl(
        {
          accountCompletion: completeAccountCompletion("https://site.example.com"),
          continueTo: "https://site.example.com/dashboard?view=home",
          handoff: { returnTo: "/dashboard?view=home", targetOrigin: "https://site.example.com" },
        },
        "https://auth.example.com",
      ),
    ).toBe("https://site.example.com/dashboard?view=home");
    expect(
      collaboratorInvitationAcceptanceContinuationUrl(
        {
          accountCompletion: completeAccountCompletion("https://auth.example.com"),
          continueTo: "/formless/auth?returnTo=%2Fdashboard%3Fview%3Dhome",
        },
        "https://auth.example.com",
      ),
    ).toBe("/formless/auth?returnTo=%2Fdashboard%3Fview%3Dhome");
    expect(
      collaboratorInvitationAcceptanceContinuationUrl(
        {
          accountCompletion: completeAccountCompletion("https://site.example.com"),
          handoff: { returnTo: "/dashboard?view=home", targetOrigin: "https://site.example.com" },
        },
        "https://auth.example.com",
      ),
    ).toBeUndefined();
    expect(
      collaboratorInvitationAcceptanceContinuationUrl({}, "https://auth.example.com"),
    ).toBeUndefined();
  });
});

type FetchCall = {
  body: unknown;
  credentials: RequestCredentials | undefined;
  input: string;
  method: string | undefined;
};

function recordingJsonFetcher(
  calls: FetchCall[],
  body: unknown,
  init: ResponseInit = {},
): typeof fetch {
  return recordingJsonSequenceFetcher(calls, [{ body, init }]);
}
function recordingJsonSequenceFetcher(
  calls: FetchCall[],
  responses: ReadonlyArray<{
    body: unknown;
    init?: ResponseInit;
  }>,
): typeof fetch {
  let index = 0;
  return async (input, requestInit) => {
    calls.push({
      body: typeof requestInit?.body === "string" ? JSON.parse(requestInit.body) : undefined,
      credentials: requestInit?.credentials,
      input: requestInputString(input),
      method: requestInit?.method,
    });

    const response = responses[index];

    index += 1;

    if (!response) {
      throw new Error(`Unexpected fetch call ${index}.`);
    }

    return Response.json(response.body, response.init);
  };
}

function acceptedResponse() {
  return {
    acceptedPrincipal: {
      displayName: "Ada Collaborator",
      principalId: "principal:accepted",
    },
    accountCompletion: completeAccountCompletion("https://site.example.com"),
    continueTo: "https://site.example.com/dashboard?view=home",
    handoff: {
      returnTo: "/dashboard?view=home",
      targetOrigin: "https://site.example.com",
    },
    invitation: eligibleInvitation,
    session: { expiresAt: "2026-07-02T00:00:00.000Z" },
    verified: true,
  } as const;
}

function completeAccountCompletion(targetOrigin: string) {
  return {
    continueTo: "/dashboard?view=home",
    status: "complete",
    target: {
      returnTo: "/dashboard?view=home",
      routeId: "route:site",
      storageIdentity: "instance:control-plane",
      targetOrigin,
      targetProfile: "instance",
    },
  } as const;
}

function registrationOptions() {
  return {
    rp: { id: "example.com", name: "Formless" },
    user: {
      id: "Y29sbGFib3JhdG9yLTE",
      name: "Ada.Collab@example.com",
      displayName: "Ada Collaborator",
    },
    challenge: "cmVnaXN0cmF0aW9uLWNoYWxsZW5nZQ",
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    timeout: 60000,
    excludeCredentials: [
      { id: "ZXhpc3RpbmctY3JlZGVudGlhbA", type: "public-key", transports: ["internal"] },
    ],
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
    attestation: "none",
    hints: ["client-device"],
    extensions: {},
  } as const;
}

function registrationResponse(): CollaboratorInvitationPasskeyRegistrationVerifyRequest["response"] {
  return {
    id: "Y3JlZGVudGlhbC0x",
    rawId: "Y3JlZGVudGlhbC0x",
    response: {
      clientDataJSON: "Y2xpZW50LWRhdGE",
      attestationObject: "YXR0ZXN0YXRpb24",
      transports: ["internal"],
      publicKeyAlgorithm: -7,
      publicKey: "cHVibGljLWtleQ",
    },
    authenticatorAttachment: "platform",
    clientExtensionResults: {},
    type: "public-key",
  };
}

function requestInputString(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.href;
  }

  return input.url;
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
