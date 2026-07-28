import { describe, expect, it } from "vite-plus/test";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

import {
  authAccountContinuationTarget,
  authAccountCompletionApiContinuationTarget,
  authAccountSignupTargetFromSearch,
  completeAuthAccountAppRegistrationGate,
  completeAuthAccountProfileCompletionGate,
  completeAuthAccountTermsAcceptanceGate,
  completeEmailVerifiedSignupWithPasskey,
  completeProductionOwnerSetup,
  fetchAuthAccountStatus,
  prepareProductionOwnerSetupPasskey,
  requestAuthAccountEmailVerification,
  startAuthAccountRouteSession,
  startEmailVerifiedSignup,
  startProductionOwnerSetup,
  verifyProductionOwnerSetupEmail,
  type AuthAccountApiError,
  type AuthAccountRouteState,
} from "./auth-account.tsx";
import type {
  AccountCompletionContinuationResult,
  AccountCompletionGate,
  AccountCompletionGateOperationInputContract,
  AccountCompletionGateResult,
  AccountCompletionGateTarget,
} from "../../shared/instance-auth.ts";

const setupToken = "abcDEF0123456789_-abcDEF0123456789_-";

describe("auth account route data flow", () => {
  it("keeps missing continuation targets local", () => {
    const calls: FetchCall[] = [];
    const states: AuthAccountRouteState[] = [];
    const stop = startAuthAccountRouteSession({
      fetcher: recordingJsonFetcher(calls, completeResult()),
      locationSearch: "",
      onState: (state) => states.push(state),
    });

    stop();

    expect(calls).toEqual([]);
    expect(states).toEqual([
      { status: "loading" },
      {
        message: "Account continuation target is missing.",
        status: "failed",
      },
    ]);
  });

  it("loads the owner setup entry through the common account route", async () => {
    const calls: JsonFetchCall[] = [];
    const states: AuthAccountRouteState[] = [];
    const stop = startAuthAccountRouteSession({
      fetcher: recordingJsonSequenceFetcher(calls, [
        { body: { authOrigin: "https://auth.example.com", setupComplete: false } },
      ]),
      locationPath: "/formless/auth/setup",
      locationSearch: `?token=${setupToken}`,
      onState: (state) => states.push(state),
    });

    try {
      await waitFor(() => states.some((state) => state.status === "owner-setup-ready"));
    } finally {
      stop();
    }

    expect(calls).toEqual([
      {
        body: undefined,
        credentials: "same-origin",
        input: "/api/formless/setup",
        method: undefined,
      },
    ]);
    expect(states).toEqual([
      { status: "owner-setup-loading" },
      { setupToken, status: "owner-setup-ready" },
    ]);
  });

  it("verifies an emailed owner setup link before exposing passkey creation", async () => {
    const calls: JsonFetchCall[] = [];
    const states: AuthAccountRouteState[] = [];
    const challenge = ownerSetupChallenge("email-verified");
    const stop = startAuthAccountRouteSession({
      fetcher: recordingJsonSequenceFetcher(calls, [
        { body: { setupComplete: false } },
        { body: { ownerSetup: challenge, verified: true } },
      ]),
      locationPath: "/formless/auth/setup",
      locationSearch: `?challengeId=${encodeURIComponent(challenge.challengeId)}&email=${encodeURIComponent(challenge.displayEmail)}&setupToken=${setupToken}&token=email-token`,
      onState: (state) => states.push(state),
    });

    try {
      await waitFor(() => states.some((state) => state.status === "owner-setup-credential-ready"));
    } finally {
      stop();
    }

    expect(calls.map((call) => call.input)).toEqual([
      "/api/formless/setup",
      "/formless/auth/setup/email/verify",
    ]);
    expect(calls[1]?.body).toEqual({
      challengeId: challenge.challengeId,
      email: challenge.displayEmail,
      setupToken,
      token: "email-token",
    });
    expect(states.at(-1)).toEqual({
      challengeId: challenge.challengeId,
      displayName: challenge.displayName,
      email: challenge.displayEmail,
      expiresAt: challenge.expiresAt,
      setupToken,
      status: "owner-setup-credential-ready",
    });
  });

  it("loads blocked account completion from the status response", async () => {
    const calls: FetchCall[] = [];
    const states: AuthAccountRouteState[] = [];
    const blocked = blockedResult({
      displayEmail: "Ada.User@example.com",
      kind: "email-verification",
    });
    const stop = startAuthAccountRouteSession({
      fetcher: recordingJsonFetcher(calls, blocked, { status: 409 }),
      locationSearch: "?returnTo=%2Fschema%3Fview%3Dboard",
      onState: (state) => states.push(state),
    });

    try {
      await waitFor(() => states.some((state) => state.status === "blocked"));
    } finally {
      stop();
    }

    expect(calls).toEqual([
      {
        credentials: "same-origin",
        input: "/formless/auth?returnTo=%2Fschema%3Fview%3Dboard",
        method: undefined,
      },
    ]);
    expect(states).toEqual([{ status: "loading" }, { result: blocked, status: "blocked" }]);
    expect(JSON.stringify(states)).not.toContain("sessionId");
    expect(JSON.stringify(states)).not.toContain("grantSecret");
  });

  it("keeps authenticated authorization failures on a forbidden account outcome", async () => {
    const calls: FetchCall[] = [];
    const navigations: string[] = [];
    const states: AuthAccountRouteState[] = [];
    const forbidden = {
      principal: {
        displayName: "Ada App User",
        email: "ada@example.com",
        principalId: "principal:ada",
      },
      status: "forbidden",
    } as const;
    const stop = startAuthAccountRouteSession({
      fetcher: recordingJsonFetcher(calls, forbidden, { status: 403 }),
      locationSearch: "?returnTo=%2Fdeployments",
      navigateTo: (target) => navigations.push(target),
      onState: (state) => states.push(state),
    });

    try {
      await waitFor(() => states.some((state) => state.status === "forbidden"));
    } finally {
      stop();
    }

    expect(calls).toEqual([
      {
        credentials: "same-origin",
        input: "/formless/auth?returnTo=%2Fdeployments",
        method: undefined,
      },
    ]);
    expect(navigations).toEqual([]);
    expect(states).toEqual([{ status: "loading" }, { result: forbidden, status: "forbidden" }]);
    expect(JSON.stringify(states)).not.toContain("/deployments");
    expect(JSON.stringify(states)).not.toContain("routeId");
    expect(JSON.stringify(states)).not.toContain("storageIdentity");
  });

  it("renders signup when an anonymous target-bound account status can expose safe target facts", async () => {
    const calls: FetchCall[] = [];
    const states: AuthAccountRouteState[] = [];
    const locationSearch = targetBoundLocationSearch();
    const stop = startAuthAccountRouteSession({
      fetcher: recordingJsonFetcher(
        calls,
        { error: "Authenticated account session is required." },
        { status: 401 },
      ),
      locationSearch,
      onState: (state) => states.push(state),
    });

    try {
      await waitFor(() => states.some((state) => state.status === "signup-ready"));
    } finally {
      stop();
    }

    expect(calls).toEqual([
      {
        credentials: "same-origin",
        input: `/formless/auth${locationSearch}`,
        method: undefined,
      },
    ]);
    expect(states).toEqual([
      { status: "loading" },
      { status: "signup-ready", target: accountTarget() },
    ]);
  });

  it("continues to a same-origin path-only target after completion", async () => {
    const states: AuthAccountRouteState[] = [];
    const navigations: string[] = [];
    const complete = completeResult({
      returnTo: "/deployments",
      targetOrigin: "https://auth.example.com",
    });
    const stop = startAuthAccountRouteSession({
      currentOrigin: "https://auth.example.com",
      fetcher: recordingJsonFetcher([], complete),
      locationSearch: "?returnTo=%2Fdeployments",
      navigateTo: (target) => navigations.push(target),
      onState: (state) => states.push(state),
    });

    try {
      await waitFor(() => states.some((state) => state.status === "continuing"));
    } finally {
      stop();
    }

    expect(navigations).toEqual(["/deployments"]);
    expect(states).toEqual([
      { status: "loading" },
      { continueTo: "/deployments", result: complete, status: "continuing" },
    ]);
  });

  it("surfaces missing central session failures without continuing", async () => {
    const states: AuthAccountRouteState[] = [];
    const navigations: string[] = [];
    const stop = startAuthAccountRouteSession({
      fetcher: recordingJsonFetcher(
        [],
        { error: "Authenticated account session is required." },
        { status: 401 },
      ),
      locationSearch: "?returnTo=%2Fdeployments",
      navigateTo: (target) => navigations.push(target),
      onState: (state) => states.push(state),
    });

    try {
      await waitFor(() => states.some((state) => state.status === "failed"));
    } finally {
      stop();
    }

    expect(navigations).toEqual([]);
    expect(states).toEqual([
      { status: "loading" },
      {
        message: "Authenticated account session is required.",
        status: "failed",
      },
    ]);
  });

  it("surfaces unsafe return target failures without continuing", async () => {
    const states: AuthAccountRouteState[] = [];
    const navigations: string[] = [];
    const stop = startAuthAccountRouteSession({
      fetcher: recordingJsonFetcher(
        [],
        { error: "Account return target must be path-only." },
        { status: 400 },
      ),
      locationSearch: "?returnTo=https%3A%2F%2Fevil.example.com%2Fdeployments",
      navigateTo: (target) => navigations.push(target),
      onState: (state) => states.push(state),
    });

    try {
      await waitFor(() => states.some((state) => state.status === "failed"));
    } finally {
      stop();
    }

    expect(navigations).toEqual([]);
    expect(states).toEqual([
      { status: "loading" },
      {
        message: "Account return target must be path-only.",
        status: "failed",
      },
    ]);
  });

  it("continues through the cross-domain handoff path after completion", async () => {
    const locationSearch = targetBoundLocationSearch();
    const complete = {
      ...completeResult(),
      continueTo: `/formless/auth/handoff${locationSearch}` as const,
    };

    expect(
      authAccountContinuationTarget(complete, locationSearch, "https://auth.example.com"),
    ).toBe(`/formless/auth/handoff${locationSearch}`);
  });

  it("uses server-returned completion continuations without rebuilding target facts", () => {
    const locationSearch =
      "?targetOrigin=https%3A%2F%2Fevil.example.com&routeId=route%3Aevil&targetProfile=app&appInstallId=evil&storageIdentity=app%3Aevil&returnTo=%2Fevil&nonceHash=bm9uY2U&state=c3RhdGU";
    const target = accountTarget({
      returnTo: "/schema?view=board",
      targetOrigin: "https://tasks.example.com",
    });
    const continueTo =
      "/formless/auth/handoff?targetOrigin=https%3A%2F%2Ftasks.example.com&routeId=route%3Atasks&targetProfile=app&appInstallId=task-workspace&storageIdentity=app%3Atask-workspace&returnTo=%2Fschema%3Fview%3Dboard&nonceHash=bm9uY2U&state=c3RhdGU" as const;

    expect(
      authAccountCompletionApiContinuationTarget(
        {
          accountCompletion: completeResult(target),
          continueTo,
          handoff: { returnTo: "/schema?view=board", targetOrigin: "https://tasks.example.com" },
        },
        locationSearch,
        "https://auth.example.com",
      ),
    ).toBe(continueTo);
    expect(
      authAccountCompletionApiContinuationTarget(
        {
          accountCompletion: completeResult(target),
          handoff: { returnTo: "/schema?view=board", targetOrigin: "https://tasks.example.com" },
        },
        locationSearch,
        "https://auth.example.com",
      ),
    ).toBeUndefined();
    expect(
      authAccountContinuationTarget(
        completeResult(target),
        locationSearch,
        "https://auth.example.com",
      ),
    ).toBeUndefined();
  });

  it("passes continuation search only to completion APIs", async () => {
    const calls: JsonFetchCall[] = [];
    const locationSearch = targetBoundLocationSearch();
    const target = accountTarget();

    await completeAuthAccountAppRegistrationGate({
      fetcher: recordingJsonSequenceFetcher(calls, [
        {
          body: {
            accountCompletion: completeResult(),
            appRegistration: {
              appInstallId: "task-workspace",
              appRegistrationId: "app-registration:ada",
              status: "active",
            },
            completed: true,
            continueTo: "/formless/auth/handoff?state=runtime",
          },
        },
      ]),
      locationSearch,
      target,
    });

    expect(calls).toEqual([
      {
        body: { target },
        credentials: "same-origin",
        input: `/formless/auth/app-registration/complete${locationSearch}`,
        method: "POST",
      },
    ]);
  });

  it("parses target-bound signup searches without accepting return-only searches", () => {
    expect(authAccountSignupTargetFromSearch(targetBoundLocationSearch())).toEqual(accountTarget());
    expect(authAccountSignupTargetFromSearch("?returnTo=%2Fschema")).toBeUndefined();
  });

  it("posts email verification and gate completion submissions to runtime APIs", async () => {
    const calls: JsonFetchCall[] = [];
    const target = accountTarget();

    await requestAuthAccountEmailVerification({
      email: "ada@example.com",
      fetcher: recordingJsonSequenceFetcher(calls, [
        {
          body: {
            challenge: {
              challengeId: "challenge:email",
              displayEmail: "ada@example.com",
              expiresAt: "2026-07-07T16:00:00.000Z",
              purpose: "account-completion",
            },
          },
        },
      ]),
      target,
    });
    await completeAuthAccountAppRegistrationGate({
      fetcher: recordingJsonSequenceFetcher(calls, [
        {
          body: {
            accountCompletion: completeResult(),
            appRegistration: {
              appInstallId: "task-workspace",
              appRegistrationId: "app-registration:ada",
              status: "active",
            },
            completed: true,
          },
        },
      ]),
      target,
    });
    await completeAuthAccountTermsAcceptanceGate({
      acceptedPolicyIds: ["policy:workspace"],
      fetcher: recordingJsonSequenceFetcher(calls, [
        {
          body: {
            acceptedPolicies: [],
            accountCompletion: completeResult(),
            completed: true,
          },
        },
      ]),
      target,
    });

    expect(calls.map((call) => call.input)).toEqual([
      "/formless/auth/email-verification/request",
      "/formless/auth/app-registration/complete",
      "/formless/auth/terms-acceptance/complete",
    ]);
    expect(calls.map((call) => call.method)).toEqual(["POST", "POST", "POST"]);
    expect(calls[0]?.body).toEqual({
      email: "ada@example.com",
      purpose: "account-completion",
      target,
    });
    expect(calls[1]?.body).toEqual({ target });
    expect(calls[2]?.body).toEqual({ acceptedPolicyIds: ["policy:workspace"], target });
  });

  it("posts profile completion input to the auth-origin runtime endpoint", async () => {
    const calls: JsonFetchCall[] = [];
    const target = accountTarget();
    const operation = profileCompletionOperation();
    const input = { contactPreference: "email", displayName: "Ada Profile" };

    const completed = await completeAuthAccountProfileCompletionGate({
      fetcher: recordingJsonSequenceFetcher(calls, [
        {
          body: {
            accountCompletion: completeResult(target),
            completed: true,
            continueTo: "/formless/auth/handoff?state=runtime",
          },
        },
      ]),
      idempotencyKey: "profile-completion-test",
      input,
      locationSearch: targetBoundLocationSearch(),
      operation,
      target,
    });

    expect(completed.accountCompletion.status).toBe("complete");
    expect(calls).toEqual([
      {
        body: {
          idempotencyKey: "profile-completion-test",
          input: { contactPreference: "email", displayName: "Ada Profile" },
          operation,
          target,
        },
        credentials: "same-origin",
        input: `/formless/auth/profile-completion/complete${targetBoundLocationSearch()}`,
        method: "POST",
      },
    ]);
    expect(
      authAccountCompletionApiContinuationTarget(
        completed,
        "?targetOrigin=https%3A%2F%2Fevil.example.com&returnTo=%2Fevil",
        "https://auth.example.com",
      ),
    ).toBe("/formless/auth/handoff?state=runtime");
  });

  it("returns blocked profile completion results without inventing continuation targets", async () => {
    const calls: JsonFetchCall[] = [];
    const blocked = blockedResult(
      profileCompletionGate({ inputContract: { fields: [], unsupportedRequiredFields: [] } }),
    );

    const completed = await completeAuthAccountProfileCompletionGate({
      fetcher: recordingJsonSequenceFetcher(calls, [
        {
          body: {
            accountCompletion: blocked,
            completed: true,
            error: "Profile-completion gate is not current.",
          },
          init: { status: 409 },
        },
      ]),
      idempotencyKey: "profile-completion-blocked",
      input: {},
      operation: profileCompletionOperation(),
      target: accountTarget(),
    });

    expect(completed).toEqual({ accountCompletion: blocked });
    expect(
      authAccountCompletionApiContinuationTarget(
        completed,
        targetBoundLocationSearch(),
        "https://auth.example.com",
      ),
    ).toBeUndefined();
    expect(JSON.stringify(calls)).not.toContain("grantSecret");
  });

  it("surfaces display-safe profile completion errors", async () => {
    await expect(
      completeAuthAccountProfileCompletionGate({
        fetcher: recordingJsonSequenceFetcher(
          [],
          [
            {
              body: {
                appPrivateProfileValues: { profileValue: "profileValue-private" },
                error: "Profile completion failed.",
              },
              init: { status: 400 },
            },
          ],
        ),
        idempotencyKey: "profile-completion-error",
        input: {},
        operation: profileCompletionOperation(),
        target: accountTarget(),
      }),
    ).rejects.toMatchObject({
      message: "Profile completion failed.",
    } satisfies Partial<AuthAccountApiError>);
  });

  it("sets up email-verified signup credentials through runtime APIs", async () => {
    const calls: JsonFetchCall[] = [];
    const target = accountTarget();
    const signup = {
      challengeId: "challenge:signup",
      displayEmail: "ada.signup@example.com",
      expiresAt: "2026-07-07T16:00:00.000Z",
      target,
    };

    await startEmailVerifiedSignup({
      email: "ada.signup@example.com",
      fetcher: recordingJsonSequenceFetcher(calls, [{ body: { signup } }]),
      target,
    });
    const completed = await completeEmailVerifiedSignupWithPasskey({
      challengeId: signup.challengeId,
      createRegistrationResponse: async () => passkeyRegistrationResponse(),
      displayName: "Ada Signup",
      email: signup.displayEmail,
      fetcher: recordingJsonSequenceFetcher(calls, [
        { body: { options: passkeyRegistrationOptions() } },
        {
          body: {
            accountCompletion: completeResult(),
            principal: { displayName: "Ada Signup", principalId: "principal:signup" },
            session: { expiresAt: "2026-07-07T20:00:00.000Z" },
            verified: true,
          },
        },
      ]),
      target,
    });

    expect(completed.accountCompletion.status).toBe("complete");
    expect(calls.map((call) => call.input)).toEqual([
      "/formless/auth/signup/start",
      "/formless/auth/signup/passkeys/register/options",
      "/formless/auth/signup/passkeys/register/verify",
    ]);
    expect(JSON.stringify(calls)).not.toContain("sessionId");
    expect(JSON.stringify(calls)).not.toContain("grantSecret");
  });

  it("runs verified-email-first owner setup through only the production account APIs", async () => {
    const calls: JsonFetchCall[] = [];
    const sent = ownerSetupChallenge("email-sent");
    const verified = ownerSetupChallenge("email-verified");
    const prepared = ownerSetupChallenge("passkey-prepared");
    const completionId = "Y29tcGxldGlvbi1vd25lci1zZXR1cA";
    const fetcher = recordingJsonSequenceFetcher(calls, [
      { body: { ownerSetup: sent } },
      { body: { ownerSetup: verified, verified: true } },
      { body: { completionId, options: passkeyRegistrationOptions() } },
      { body: { completionId, ownerSetup: prepared, prepared: true } },
      {
        body: {
          completed: true,
          completionId,
          continueTo: "https://admin.example.com/",
          handoff: { returnTo: "/", targetOrigin: "https://admin.example.com" },
          owner: {
            createdAt: "2026-07-24T04:00:00.000Z",
            email: sent.displayEmail,
            id: "principal:owner",
            name: sent.displayName,
          },
          session: { expiresAt: "2026-07-24T12:00:00.000Z" },
          setupComplete: true,
        },
      },
    ]);

    const started = await startProductionOwnerSetup({
      displayName: sent.displayName,
      email: sent.displayEmail,
      fetcher,
      setupToken,
    });
    await verifyProductionOwnerSetupEmail({
      challengeId: started.ownerSetup.challengeId,
      email: started.ownerSetup.displayEmail,
      fetcher,
      setupToken,
      token: "owner-email-token",
    });
    const passkey = await prepareProductionOwnerSetupPasskey({
      challengeId: started.ownerSetup.challengeId,
      createRegistrationResponse: async () => passkeyRegistrationResponse(),
      email: started.ownerSetup.displayEmail,
      fetcher,
      setupToken,
    });
    const completed = await completeProductionOwnerSetup({
      challengeId: started.ownerSetup.challengeId,
      completionId: passkey.completionId,
      email: started.ownerSetup.displayEmail,
      fetcher,
      setupToken,
    });

    expect(completed).toMatchObject({
      continueTo: "https://admin.example.com/",
      handoff: { returnTo: "/", targetOrigin: "https://admin.example.com" },
      setupComplete: true,
    });
    expect(calls.map((call) => call.input)).toEqual([
      "/formless/auth/setup/start",
      "/formless/auth/setup/email/verify",
      "/formless/auth/setup/passkeys/register/options",
      "/formless/auth/setup/passkeys/register/verify",
      "/formless/auth/setup/complete",
    ]);
    expect(calls.map((call) => call.method)).toEqual(["POST", "POST", "POST", "POST", "POST"]);
  });

  it("rejects status responses that expose private session or grant material", async () => {
    await expect(
      fetchAuthAccountStatus({
        fetcher: recordingJsonFetcher([], {
          ...completeResult(),
          sessionId: "central-session-private",
        }),
        locationSearch: "?returnTo=%2Fschema",
      }),
    ).rejects.toMatchObject({
      message:
        'Auth account status result cannot include private browser-visible field "sessionId".',
    } satisfies Partial<AuthAccountApiError>);
  });
});

type FetchCall = {
  credentials: RequestCredentials | undefined;
  input: string;
  method: string | undefined;
};

type JsonFetchCall = FetchCall & {
  body: unknown;
};

function recordingJsonFetcher(
  calls: FetchCall[],
  body: unknown,
  init: ResponseInit = {},
): typeof fetch {
  return async (input, requestInit) => {
    calls.push({
      credentials: requestInit?.credentials,
      input: requestInputString(input),
      method: requestInit?.method,
    });

    return Response.json(body, init);
  };
}
function recordingJsonSequenceFetcher(
  calls: JsonFetchCall[],
  responses: Array<{
    body: unknown;
    init?: ResponseInit;
  }>,
): typeof fetch {
  return async (input, requestInit) => {
    const body =
      typeof requestInit?.body === "string" ? JSON.parse(requestInit.body) : requestInit?.body;

    calls.push({
      body,
      credentials: requestInit?.credentials,
      input: requestInputString(input),
      method: requestInit?.method,
    });

    const response = responses.shift();

    if (!response) {
      throw new Error("No recorded response.");
    }

    return Response.json(response.body, response.init);
  };
}

function blockedResult(gate: AccountCompletionGate): AccountCompletionGateResult {
  return {
    gate,
    status: "blocked",
    target: accountTarget(),
  };
}

function completeResult(
  target: Partial<AccountCompletionGateTarget> = {},
): AccountCompletionContinuationResult {
  const resolvedTarget = accountTarget(target);

  return {
    continueTo: resolvedTarget.returnTo,
    status: "complete",
    target: resolvedTarget,
  };
}
function profileCompletionGate(
  input: Partial<
    Extract<
      AccountCompletionGate,
      {
        kind: "profile-completion";
      }
    >
  > = {},
): Extract<
  AccountCompletionGate,
  {
    kind: "profile-completion";
  }
> {
  return {
    appInstallId: "task-workspace",
    inputContract: profileCompletionInputContract(),
    kind: "profile-completion",
    operation: profileCompletionOperation(),
    ...input,
  };
}

function profileCompletionOperation() {
  return {
    appInstallId: "task-workspace",
    entityName: "profile",
    label: "Complete profile",
    operationKey: "profile.completeRegistration",
    operationName: "completeRegistration",
  };
}

function profileCompletionInputContract(
  input: Partial<AccountCompletionGateOperationInputContract> = {},
): AccountCompletionGateOperationInputContract {
  return {
    fields: [
      {
        control: "text",
        label: "Display name",
        name: "displayName",
        required: true,
      },
      {
        control: "enum",
        label: "Contact preference",
        name: "contactPreference",
        options: [
          { label: "Email", value: "email" },
          { label: "Phone", value: "phone" },
        ],
        required: false,
      },
    ],
    unsupportedRequiredFields: [],
    ...input,
  };
}

function accountTarget(
  input: Partial<AccountCompletionGateTarget> = {},
): AccountCompletionGateTarget {
  return {
    appInstallId: "task-workspace",
    returnTo: "/schema?view=board",
    routeId: "route:tasks",
    storageIdentity: "app:task-workspace",
    targetOrigin: "https://tasks.example.com",
    targetProfile: "app",
    ...input,
  };
}

function targetBoundLocationSearch(): string {
  return "?targetOrigin=https%3A%2F%2Ftasks.example.com&routeId=route%3Atasks&targetProfile=app&appInstallId=task-workspace&storageIdentity=app%3Atask-workspace&returnTo=%2Fschema%3Fview%3Dboard&nonceHash=bm9uY2U&state=c3RhdGU";
}

function passkeyRegistrationOptions() {
  return {
    challenge: "registration-challenge",
  };
}

function passkeyRegistrationResponse(): RegistrationResponseJSON {
  return {
    id: "credential-id",
    rawId: "credential-id",
    response: {
      attestationObject: "attestation-object",
      clientDataJSON: "client-data-json",
    },
    type: "public-key",
    clientExtensionResults: {},
  };
}

function ownerSetupChallenge(status: "email-sent" | "email-verified" | "passkey-prepared") {
  return {
    challengeId: "challenge:owner-setup",
    displayEmail: "ada.owner@example.com",
    displayName: "Ada Owner",
    expiresAt: "2026-07-24T05:00:00.000Z",
    status,
  };
}

function requestInputString(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
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
