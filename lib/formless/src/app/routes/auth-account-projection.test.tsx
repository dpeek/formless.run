import { describe, expect, it } from "vite-plus/test";
import type { AuthIntent } from "@dpeek/formless-presentation/contract";
import type {
  AccountCompletionContinuationResult,
  AccountCompletionGate,
  AccountCompletionGateOperationInputContract,
  AccountCompletionGateResult,
  AccountCompletionGateTarget,
} from "../../shared/instance-auth.ts";
import {
  authAccountGateSurfaceReference,
  authAccountOwnerSetupSurfaceReference,
  authAccountSignupSurfaceReference,
  authAccountSurfaceReference,
  initialAuthAccountDraftSession,
  markAuthAccountDraftSessionSubmitted,
  nextAuthAccountDraftSession,
  prepareAuthAccountDraftSession,
  projectAuthAccountSurface,
  selectAuthAccountDraftSubmission,
} from "./auth-account-projection.ts";
import { authIntentIsCurrent, createAuthPendingGuard } from "./auth-runtime-boundary.tsx";
import type { AuthAccountRouteState } from "./auth-account.tsx";

const privateValues = [
  "abcDEF0123456789_-abcDEF0123456789_-",
  "challenge:owner-setup-private",
  "completion:owner-setup-private",
  "challenge:signup-private",
  "storage:private",
  "central-session-private",
  "handoff-secret-private",
  "profile-value-private",
] as const;

describe("auth account projection", () => {
  it("projects account loading, pending, failure, completion, and continuation states", () => {
    const pending: AuthAccountRouteState = {
      action: { kind: "gate-submitting" },
      result: blockedResult(emailVerifiedAppRegistrationGate()),
      status: "blocked",
    };
    const states: Array<[AuthAccountRouteState, string]> = [
      [{ status: "loading" }, "loading"],
      [pending, "submitting"],
      [{ message: "Account failed.", status: "failed" }, "failed"],
      [
        { continueTo: "/schema?view=board", result: completeResult(), status: "complete" },
        "complete",
      ],
      [
        {
          continueTo: "/formless/auth/handoff?state=runtime",
          result: completeResult(),
          status: "continuing",
        },
        "continuing",
      ],
    ];

    expect(states.map(([state]) => project(state).state)).toEqual(states.map(([, state]) => state));
    expect(project(states[2]![0]).actions.map((action) => action.purpose)).toEqual(["retry"]);
    expect(project(states[3]![0]).continuation?.destination.detail).toBe("/schema?view=board");
    const continuing = project(states[4]![0]);
    expect(continuing.continuation?.destination.detail).toBe(
      "/formless/auth/handoff?state=runtime",
    );
    expect(continuing.pending).toBe(false);
    if (!continuing.continuation) throw new Error("Expected approved continuation.");
    expect(authIntentIsCurrent(continuing, continuing.continuation.intent)).toBe(true);
    expect(project({ result: completeResult(), status: "complete" }).continuation).toBeUndefined();
  });

  it("projects forbidden account access with only current identity and logout", () => {
    const surface = project({
      result: {
        principal: {
          displayName: "Ada App User",
          email: "ada@example.com",
          principalId: "principal:ada",
        },
        status: "forbidden",
      },
      status: "forbidden",
    });

    expect(surface).toMatchObject({
      actions: [
        {
          control: { content: { label: "Sign out" } },
          purpose: "logout",
        },
      ],
      facts: [{ label: "Account", value: "Ada App User" }],
      frame: {
        heading: {
          description: "Signed in as Ada App User.",
          title: "Access unavailable",
        },
      },
      message: {
        severity: "warning",
        title: "This account cannot open the requested destination.",
      },
      state: "forbidden",
      surfaceKind: "account-gate",
    });
    expect(surface).not.toHaveProperty("gateKind");
    expect(surface.continuation).toBeUndefined();
    expect(JSON.stringify(surface)).not.toContain("ada@example.com");
    expect(JSON.stringify(surface)).not.toContain("principal:ada");
  });

  it("projects all seven account gate kinds with only available completion actions", () => {
    const cases: Array<{
      action: boolean;
      gate: AccountCompletionGate;
      heading: string;
      state: string;
    }> = [
      {
        action: true,
        gate: { displayEmail: "Ada.User@example.com", kind: "email-verification" },
        heading: "Verify email",
        state: "ready",
      },
      {
        action: false,
        gate: { credentialMethod: "passkey", kind: "credential" },
        heading: "Create credential",
        state: "blocked",
      },
      {
        action: false,
        gate: {
          kind: "invitation",
          targetEmail: "Ada.Invited@example.com",
          targetSurface: "app-install",
        },
        heading: "Accept invitation",
        state: "blocked",
      },
      {
        action: true,
        gate: emailVerifiedAppRegistrationGate(),
        heading: "Register for app",
        state: "ready",
      },
      {
        action: true,
        gate: profileCompletionGate(),
        heading: "Complete profile",
        state: "ready",
      },
      {
        action: true,
        gate: termsAcceptanceGate(),
        heading: "Accept terms",
        state: "ready",
      },
      {
        action: false,
        gate: { kind: "role-review", roleKey: "app.user", scopeKind: "app-install" },
        heading: "Access review required",
        state: "blocked",
      },
    ];

    for (const testCase of cases) {
      const routeState: AuthAccountRouteState = {
        result: blockedResult(testCase.gate),
        status: "blocked",
      };
      const surface = project(routeState);

      expect(surface.surfaceKind, testCase.heading).toBe("account-gate");
      expect(surface.state, testCase.heading).toBe(testCase.state);
      expect(surface.frame.heading.title, testCase.heading).toBe(testCase.heading);
      expect(
        surface.actions.some((action) => action.purpose === "submit"),
        testCase.heading,
      ).toBe(testCase.action);
      expect(
        surface.facts.some((fact) => fact.label === "Destination"),
        testCase.heading,
      ).toBe(true);
    }

    const closed = project({
      result: blockedResult({
        ...emailVerifiedAppRegistrationGate(),
        operation: { label: "Invented signup", operationKey: "signup" },
        registrationPolicy: "closed",
      }),
      status: "blocked",
    });
    expect(closed.state).toBe("blocked");
    expect(closed.actions).toEqual([]);
    expect(JSON.stringify(closed)).not.toContain("Invented signup");
  });

  it("projects the complete owner setup account journey without private runtime state", () => {
    const challenge = ownerSetupChallengeState();
    const completion = {
      ...challenge,
      completionId: "completion:owner-setup-private",
    };
    const owner = {
      createdAt: "2026-07-24T04:00:00.000Z",
      email: "ada.owner@example.com",
      id: "principal:owner",
      name: "Ada Owner",
    };
    const states: Array<[AuthAccountRouteState, string | undefined, string]> = [
      [{ status: "owner-setup-loading" }, undefined, "loading"],
      [
        { message: "Owner setup link is invalid.", status: "owner-setup-invalid" },
        undefined,
        "invalid",
      ],
      [ownerSetupState(), "identity", "ready"],
      [
        {
          displayName: "Ada Owner",
          email: "ada.owner@example.com",
          setupToken: privateValues[0],
          status: "owner-setup-email-sending",
        },
        "identity",
        "submitting",
      ],
      [{ ...challenge, status: "owner-setup-email-sent" }, "email-verification", "ready"],
      [{ ...challenge, status: "owner-setup-email-verifying" }, "email-verification", "submitting"],
      [{ ...challenge, status: "owner-setup-credential-ready" }, "passkey", "ready"],
      [{ ...challenge, status: "owner-setup-credential-submitting" }, "passkey", "submitting"],
      [
        {
          ...challenge,
          message: "This browser does not support passkeys.",
          status: "owner-setup-passkey-unavailable",
        },
        "passkey",
        "passkey-unavailable",
      ],
      [
        {
          ...completion,
          message: "Owner setup completion must be retried.",
          status: "owner-setup-completion-ready",
        },
        "completion",
        "failed",
      ],
      [{ ...completion, status: "owner-setup-completing" }, "completion", "submitting"],
      [{ owner, status: "owner-setup-already-complete" }, undefined, "already-complete"],
      [
        {
          continueTo: "/formless/auth?returnTo=%2F",
          owner,
          status: "owner-setup-complete",
        },
        "completion",
        "complete",
      ],
      [
        {
          continueTo: "https://admin.example.com/",
          handoff: { returnTo: "/", targetOrigin: "https://admin.example.com" },
          owner,
          status: "owner-setup-continuing",
        },
        "completion",
        "continuing",
      ],
    ];

    for (const [state, step, contractState] of states) {
      const surface = project(state);
      expect(surface.surfaceKind).toBe("owner-setup");
      expect(surface.state).toBe(contractState);
      if (surface.surfaceKind === "owner-setup") expect(surface.step).toBe(step);
      const serialized = JSON.stringify(surface);
      expect(serialized).not.toContain(privateValues[0]);
      expect(serialized).not.toContain("challenge:owner-setup-private");
      expect(serialized).not.toContain("completion:owner-setup-private");
    }

    const continuation = project(states.at(-1)![0]);
    expect(continuation.continuation?.destination.origin).toBe("https://admin.example.com");
    expect(continuation.continuation?.destination.detail).toBe("Open your approved destination.");
  });

  it("controls owner identity and opaque verification token submissions", () => {
    const identityState = ownerSetupState();
    let session = initialAuthAccountDraftSession(identityState);

    session = nextAuthAccountDraftSession(session, {
      fieldName: "displayName",
      fieldValue: { kind: "input", value: "Ada Owner" },
      type: "createDraftChange",
    });
    session = nextAuthAccountDraftSession(session, {
      fieldName: "email",
      fieldValue: { kind: "input", value: "ada.owner@example.com" },
      type: "createDraftChange",
    });

    const identitySurface = projectAuthAccountSurface({ session, state: identityState });
    expect(identitySurface.fields.map((field) => field.autocomplete)).toEqual(["name", "email"]);
    expect(selectAuthAccountDraftSubmission({ session, state: identityState })).toEqual({
      displayName: "Ada Owner",
      email: "ada.owner@example.com",
      kind: "owner-setup-identity",
      ok: true,
    });

    const tokenState: AuthAccountRouteState = {
      ...ownerSetupChallengeState(),
      status: "owner-setup-email-sent",
    };
    session = prepareAuthAccountDraftSession(session, tokenState);
    session = nextAuthAccountDraftSession(session, {
      fieldName: "token",
      fieldValue: { kind: "input", value: "opaque_owner_email_token-123" },
      type: "createDraftChange",
    });
    const tokenSurface = projectAuthAccountSurface({ session, state: tokenState });

    expect(tokenSurface.fields[0]).toMatchObject({
      autocomplete: "one-time-code",
      purpose: "verification-token",
    });
    expect(selectAuthAccountDraftSubmission({ session, state: tokenState })).toEqual({
      kind: "owner-setup-verification-token",
      ok: true,
      token: "opaque_owner_email_token-123",
    });
  });

  it("projects every shipped signup step, failure, completion, and continuation state", () => {
    const signup = signupState();
    const states: Array<[AuthAccountRouteState, string, string]> = [
      [signup, "identity", "ready"],
      [{ ...signup, status: "signup-email-sending" }, "identity", "submitting"],
      [{ ...signup, message: "Email failed.", status: "signup-ready" }, "identity", "failed"],
      [
        {
          ...signup,
          challengeId: "challenge:signup-private",
          displayName: "Ada Signup",
          email: "ada@example.com",
          expiresAt: "2026-07-17T03:00:00.000Z",
          status: "signup-email-sent",
        },
        "email-verification",
        "ready",
      ],
      [
        {
          ...signup,
          challengeId: "challenge:signup-private",
          email: "ada@example.com",
          status: "signup-email-verifying",
        },
        "email-verification",
        "submitting",
      ],
      [
        {
          ...signup,
          challengeId: "challenge:signup-private",
          displayName: "Ada Signup",
          email: "ada@example.com",
          status: "signup-credential-ready",
        },
        "passkey",
        "ready",
      ],
      [
        {
          ...signup,
          challengeId: "challenge:signup-private",
          displayName: "Ada Signup",
          email: "ada@example.com",
          status: "signup-credential-submitting",
        },
        "passkey",
        "submitting",
      ],
      [
        {
          ...signup,
          message: "WebAuthn unavailable.",
          status: "signup-passkey-unavailable",
        },
        "passkey",
        "passkey-unavailable",
      ],
      [
        {
          ...signup,
          continueTo: "/schema?view=board",
          result: completeResult(),
          status: "signup-complete",
        },
        "passkey",
        "complete",
      ],
      [
        {
          ...signup,
          continueTo: "/formless/auth/handoff?state=runtime",
          result: completeResult(),
          status: "signup-continuing",
        },
        "passkey",
        "continuing",
      ],
    ];

    for (const [state, step, contractState] of states) {
      const surface = project(state);
      expect(surface.surfaceKind).toBe("signup");
      expect(surface.state).toBe(contractState);
      if (surface.surfaceKind === "signup") expect(surface.step).toBe(step);
      expect(JSON.stringify(surface)).not.toContain("challenge:signup-private");
    }

    const continuing = project(states.at(-1)![0]);
    expect(continuing.continuation?.destination.detail).toBe(
      "/formless/auth/handoff?state=runtime",
    );
    expect(continuing.pending).toBe(false);
    if (!continuing.continuation) throw new Error("Expected approved signup continuation.");
    expect(authIntentIsCurrent(continuing, continuing.continuation.intent)).toBe(true);
    expect(
      project({ ...signup, result: completeResult(), status: "signup-complete" }).continuation,
    ).toBeUndefined();
  });

  it("keeps ordinary signup and opaque token drafts controlled and validated", () => {
    const state = signupState();
    let session = initialAuthAccountDraftSession(state);
    let surface = projectAuthAccountSurface({ session, state });
    const [nameField, emailField] = surface.fields;
    if (!nameField || !emailField) throw new Error("Expected signup fields.");

    session = nextAuthAccountDraftSession(session, {
      fieldName: "displayName",
      fieldValue: { kind: "input", value: "Ada Signup" },
      type: "createDraftChange",
    });
    session = nextAuthAccountDraftSession(session, {
      fieldName: "email",
      fieldValue: { kind: "input", value: "ada@example.com" },
      type: "createDraftChange",
    });
    surface = projectAuthAccountSurface({ session, state });
    expect(surface.fields.map((field) => field.field.draftInput?.value)).toEqual([
      "Ada Signup",
      "ada@example.com",
    ]);
    expect(selectAuthAccountDraftSubmission({ session, state })).toEqual({
      displayName: "Ada Signup",
      email: "ada@example.com",
      kind: "signup-identity",
      ok: true,
    });

    const invalid = projectAuthAccountSurface({
      session: markAuthAccountDraftSessionSubmitted(initialAuthAccountDraftSession(state)),
      state,
    });
    expect(invalid.fields.every((field) => field.field.errors?.length === 1)).toBe(true);

    const tokenState: AuthAccountRouteState = {
      ...state,
      challengeId: "challenge:signup-private",
      displayName: "Ada Signup",
      email: "ada@example.com",
      status: "signup-email-sent",
    };
    session = prepareAuthAccountDraftSession(session, tokenState);
    session = nextAuthAccountDraftSession(session, {
      fieldName: "token",
      fieldValue: { kind: "input", value: "opaque_base64url-token_ABC-123" },
      type: "createDraftChange",
    });
    surface = projectAuthAccountSurface({ session, state: tokenState });
    expect(surface.fields[0]).toMatchObject({
      autocomplete: "one-time-code",
      field: { draftInput: { value: "opaque_base64url-token_ABC-123" }, surface: "create" },
      purpose: "verification-token",
    });
    expect(selectAuthAccountDraftSubmission({ session, state: tokenState })).toEqual({
      kind: "verification-token",
      ok: true,
      token: "opaque_base64url-token_ABC-123",
    });
  });

  it("keeps account email and verification-token entry controlled", () => {
    const emailState: AuthAccountRouteState = {
      result: blockedResult({
        displayEmail: "ada.initial@example.com",
        kind: "email-verification",
      }),
      status: "blocked",
    };
    let session = initialAuthAccountDraftSession(emailState);
    let surface = projectAuthAccountSurface({ session, state: emailState });
    expect(surface.fields[0]).toMatchObject({
      autocomplete: "email",
      field: { draftInput: { value: "ada.initial@example.com" } },
    });
    session = nextAuthAccountDraftSession(session, {
      fieldName: "email",
      fieldValue: { kind: "input", value: "ada.changed@example.com" },
      type: "createDraftChange",
    });
    expect(selectAuthAccountDraftSubmission({ session, state: emailState })).toEqual({
      email: "ada.changed@example.com",
      kind: "email-verification",
      ok: true,
    });

    const tokenState: AuthAccountRouteState = {
      action: {
        challengeId: "challenge:signup-private",
        email: "ada.changed@example.com",
        expiresAt: "2026-07-17T03:00:00.000Z",
        kind: "email-verification-sent",
      },
      result: emailState.result,
      status: "blocked",
    };
    session = prepareAuthAccountDraftSession(session, tokenState);
    session = nextAuthAccountDraftSession(session, {
      fieldName: "token",
      fieldValue: { kind: "input", value: "opaque_account_token-123_ABC" },
      type: "createDraftChange",
    });
    surface = projectAuthAccountSurface({ session, state: tokenState });
    expect(surface.fields[0]?.autocomplete).toBe("one-time-code");
    expect(surface.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Verification email", value: "ada.changed@example.com" }),
        expect.objectContaining({ label: "Expires", value: "2026-07-17T03:00:00.000Z" }),
      ]),
    );
    expect(selectAuthAccountDraftSubmission({ session, state: tokenState })).toEqual({
      kind: "verification-token",
      ok: true,
      token: "opaque_account_token-123_ABC",
    });
    expect(JSON.stringify(surface)).not.toContain("challenge:signup-private");
  });

  it("projects canonical operation fields and rejects unsupported required profile inputs", () => {
    const state: AuthAccountRouteState = {
      result: blockedResult(profileCompletionGate()),
      status: "blocked",
    };
    let session = initialAuthAccountDraftSession(state);
    let surface = projectAuthAccountSurface({ session, state });
    const [displayName, preference] = surface.fields;
    if (!displayName || !preference) throw new Error("Expected profile fields.");

    expect(displayName).toMatchObject({
      field: { inputName: "displayName", surface: "operation" },
      purpose: "profile-input",
    });
    const change = {
      inputName: "displayName",
      inputValue: { kind: "input" as const, value: "Ada Profile" },
      type: "operationDraftChange" as const,
    };
    expect(authIntentIsCurrent(surface, { ...displayName.intent, intent: change })).toBe(true);
    expect(
      authIntentIsCurrent(surface, {
        ...displayName.intent,
        intent: { ...change, inputName: "stale" },
      }),
    ).toBe(false);
    session = nextAuthAccountDraftSession(session, change);
    session = nextAuthAccountDraftSession(session, {
      inputName: "contactPreference",
      inputValue: { kind: "input", value: "email" },
      type: "operationDraftChange",
    });
    expect(selectAuthAccountDraftSubmission({ session, state })).toEqual({
      input: { contactPreference: "email", displayName: "Ada Profile" },
      kind: "profile-completion",
      ok: true,
    });

    const fieldIntent: AuthIntent = { ...displayName.intent, intent: change };
    expect(authIntentIsCurrent(surface, fieldIntent)).toBe(true);

    const unavailableState: AuthAccountRouteState = {
      result: blockedResult(
        profileCompletionGate({
          inputContract: { fields: [], unsupportedRequiredFields: ["principal"] },
        }),
      ),
      status: "blocked",
    };
    const unavailable = project(unavailableState);
    expect(unavailable.state).toBe("unavailable");
    expect(unavailable.fields).toEqual([]);
    expect(unavailable.actions).toEqual([]);
    expect(unavailable.message?.title).toContain("requires fields this form cannot render");
  });

  it("controls policy selection and submits only the runtime-supplied policy set", () => {
    const gate = termsAcceptanceGate();
    const state: AuthAccountRouteState = {
      result: blockedResult({
        ...gate,
        policies: [
          ...gate.policies,
          {
            accountPolicyId: "policy:privacy",
            displayName: "Privacy policy",
            policyDocumentUrl: "https://tasks.example.com/policies/privacy",
            policyKey: "privacy-policy",
            version: "2026-07-17",
          },
        ],
      }),
      status: "blocked",
    };
    let session = initialAuthAccountDraftSession(state);
    let surface = projectAuthAccountSurface({ session, state });
    const policy = surface.policies[0];
    if (!policy?.selectionIntent) throw new Error("Expected selectable policy.");

    expect(policy).toMatchObject({
      accepted: false,
      destination: { href: "https://tasks.example.com/policies/workspace" },
      required: true,
    });
    expect(selectAuthAccountDraftSubmission({ session, state })).toEqual({ ok: false });
    expect(authIntentIsCurrent(surface, policy.selectionIntent)).toBe(true);
    session = markAuthAccountDraftSessionSubmitted(session);
    surface = projectAuthAccountSurface({ session, state });
    expect(surface.feedback).toMatchObject({
      detail: "Accept all required policies to continue.",
      title: "Accept required policies",
    });
    session = nextAuthAccountDraftSession(session, policy.selectionIntent);
    surface = projectAuthAccountSurface({ session, state });
    expect(surface.policies[0]?.accepted).toBe(true);
    expect(surface.feedback?.title).toBe("Accept required policies");
    const privacyPolicy = surface.policies[1];
    if (!privacyPolicy?.selectionIntent) throw new Error("Expected second selectable policy.");
    session = nextAuthAccountDraftSession(session, privacyPolicy.selectionIntent);
    surface = projectAuthAccountSurface({ session, state });
    expect(surface.feedback).toBeUndefined();
    expect(selectAuthAccountDraftSubmission({ session, state })).toEqual({
      acceptedPolicyIds: ["policy:workspace", "policy:privacy"],
      kind: "terms-acceptance",
      ok: true,
    });
  });

  it("projects accessible account presentation without private runtime values", () => {
    const state: AuthAccountRouteState = {
      result: blockedResult(profileCompletionGate()),
      status: "blocked",
    };
    const session = initialAuthAccountDraftSession(state);
    const surface = projectAuthAccountSurface({ session, state });
    expect(surface.frame.accessibilityLabel).toBe("Complete profile");
    expect(surface.fields.map(({ field }) => field.label)).toEqual([
      "Display name",
      "Contact preference",
    ]);
    expect(surface.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          control: expect.objectContaining({ accessibilityLabel: "Complete profile" }),
        }),
      ]),
    );
    const serialized = JSON.stringify(surface);
    for (const privateValue of privateValues) expect(serialized).not.toContain(privateValue);
  });

  it("keeps references scoped, rejects pending intents, and deduplicates operations", async () => {
    const account = project({ status: "loading" });
    const ownerSetup = project(ownerSetupState());
    const signup = project(signupState());
    expect(authAccountSurfaceReference(account)).toBe(authAccountGateSurfaceReference);
    expect(authAccountSurfaceReference(ownerSetup)).toBe(authAccountOwnerSetupSurfaceReference);
    expect(authAccountSurfaceReference(signup)).toBe(authAccountSignupSurfaceReference);

    const pendingState: AuthAccountRouteState = {
      action: { kind: "email-verification-requesting" },
      result: blockedResult({ displayEmail: "ada@example.com", kind: "email-verification" }),
      status: "blocked",
    };
    const pending = project(pendingState);
    expect(pending.pending).toBe(true);
    expect(pending.actions[0]).toBeDefined();
    expect(authIntentIsCurrent(pending, pending.actions[0]!.intent)).toBe(false);

    const guard = createAuthPendingGuard();
    let release: (() => void) | undefined;
    let calls = 0;
    const operation = () =>
      guard.run(
        () =>
          new Promise<void>((resolve) => {
            calls += 1;
            release = resolve;
          }),
      );
    const first = operation();
    expect(await operation()).toBe(false);
    expect(calls).toBe(1);
    release?.();
    expect(await first).toBe(true);
  });

  it("excludes runtime challenge, storage, session, handoff, and app-private values", () => {
    const state = {
      ...signupState(),
      appPrivateProfileValues: { displayName: "profile-value-private" },
      challengeId: "challenge:signup-private",
      displayName: "Ada Signup",
      email: "ada@example.com",
      handoff: { secret: "handoff-secret-private" },
      sessionId: "central-session-private",
      status: "signup-credential-ready",
      target: { ...accountTarget(), storageIdentity: "storage:private" },
    } as AuthAccountRouteState;
    const serialized = JSON.stringify(project(state));

    for (const privateValue of privateValues) expect(serialized).not.toContain(privateValue);

    const failed = project({
      message: "Failed with API_TOKEN=central-session-private at /Users/ada/formless",
      status: "failed",
    });
    expect(failed.feedback?.detail).toBe("Failed with API_TOKEN=[redacted] at <path>");
  });
});

function project(state: AuthAccountRouteState) {
  return projectAuthAccountSurface({ session: initialAuthAccountDraftSession(state), state });
}
function signupState(): Extract<
  AuthAccountRouteState,
  {
    status: "signup-ready";
  }
> {
  return { status: "signup-ready", target: accountTarget() };
}
function ownerSetupState(): Extract<
  AuthAccountRouteState,
  {
    status: "owner-setup-ready";
  }
> {
  return {
    setupToken: privateValues[0],
    status: "owner-setup-ready",
  };
}

function ownerSetupChallengeState() {
  return {
    challengeId: "challenge:owner-setup-private",
    displayName: "Ada Owner",
    email: "ada.owner@example.com",
    expiresAt: "2026-07-24T05:00:00.000Z",
    setupToken: privateValues[0],
  };
}

function blockedResult(gate: AccountCompletionGate): AccountCompletionGateResult {
  return { gate, status: "blocked", target: accountTarget() };
}

function completeResult(): AccountCompletionContinuationResult {
  return { continueTo: "/schema?view=board", status: "complete", target: accountTarget() };
}
function emailVerifiedAppRegistrationGate(): Extract<
  AccountCompletionGate,
  {
    kind: "app-registration";
  }
> {
  return {
    appInstallId: "task-workspace",
    kind: "app-registration",
    operation: {
      appInstallId: "task-workspace",
      entityName: "app-registration",
      label: "Register for app",
      operationKey: "auth.app-registration.complete",
    },
    registrationPolicy: "email-verified",
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
    operation: {
      appInstallId: "task-workspace",
      entityName: "profile",
      label: "Complete profile",
      operationKey: "profile.completeRegistration",
      operationName: "completeRegistration",
    },
    ...input,
  };
}

function profileCompletionInputContract(): AccountCompletionGateOperationInputContract {
  return {
    fields: [
      { control: "text", label: "Display name", name: "displayName", required: true },
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
  };
}
function termsAcceptanceGate(): Extract<
  AccountCompletionGate,
  {
    kind: "terms-acceptance";
  }
> {
  return {
    kind: "terms-acceptance",
    operation: {
      label: "Accept terms",
      operationKey: "auth.terms-acceptance.complete",
    },
    policies: [
      {
        accountPolicyId: "policy:workspace",
        displayName: "Workspace terms",
        policyDocumentUrl: "https://tasks.example.com/policies/workspace",
        policyKey: "workspace-terms",
        version: "2026-07-17",
      },
    ],
  };
}

function accountTarget(): AccountCompletionGateTarget {
  return {
    appInstallId: "task-workspace",
    returnTo: "/schema?view=board",
    routeId: "route:tasks",
    storageIdentity: "storage:private",
    targetOrigin: "https://tasks.example.com",
    targetProfile: "app",
  };
}
