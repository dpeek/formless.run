import { describe, expect, it } from "vite-plus/test";
import type {
  AccountCompletionContinuationResult,
  AccountCompletionGate,
  AccountCompletionGateResult,
  AccountCompletionGateTarget,
} from "../../shared/instance-auth.ts";
import type { AuthAccountRouteState } from "./auth-account.tsx";
import {
  initialAuthAccountDraftSession,
  markAuthAccountDraftSessionSubmitted,
  nextAuthAccountDraftSession,
  projectAuthAccountSurface,
  selectAuthAccountDraftSubmission,
} from "./auth-account-projection.ts";

describe("auth account projection", () => {
  it("projects only current Program account gates", () => {
    const cases: Array<[AccountCompletionGate, string, string]> = [
      [{ credentialMethod: "passkey", kind: "credential" }, "Create credential", "blocked"],
      [{ displayEmail: "ada@example.com", kind: "email-verification" }, "Verify email", "ready"],
      [
        { kind: "invitation", targetEmail: "ada@example.com", targetSurface: "instance" },
        "Accept invitation",
        "blocked",
      ],
      [termsGate(), "Accept terms", "ready"],
    ];

    for (const [gate, heading, state] of cases) {
      const routeState: AuthAccountRouteState = { result: blockedResult(gate), status: "blocked" };
      const surface = projectAuthAccountSurface({
        session: initialAuthAccountDraftSession(routeState),
        state: routeState,
      });

      expect(surface).toMatchObject({
        frame: { heading: { title: heading } },
        gateKind: gate.kind,
        state,
        surfaceKind: "account-gate",
      });
      expect(JSON.stringify(surface)).not.toContain("role-review");
    }
  });

  it("submits exactly the current Program policy set", () => {
    const state: AuthAccountRouteState = {
      result: blockedResult(termsGate()),
      status: "blocked",
    };
    let session = initialAuthAccountDraftSession(state);
    const initial = projectAuthAccountSurface({ session, state });
    const policy = initial.policies[0];

    if (!policy?.selectionIntent) throw new Error("Expected selectable policy.");

    expect(selectAuthAccountDraftSubmission({ session, state })).toEqual({ ok: false });
    session = markAuthAccountDraftSessionSubmitted(session);
    expect(projectAuthAccountSurface({ session, state }).feedback?.title).toBe(
      "Accept required policies",
    );
    session = nextAuthAccountDraftSession(session, policy.selectionIntent);
    expect(selectAuthAccountDraftSubmission({ session, state })).toEqual({
      acceptedPolicyIds: ["policy:program"],
      kind: "terms-acceptance",
      ok: true,
    });
  });

  it("keeps owner setup and continuation secrets out of presentation", () => {
    const ownerState: AuthAccountRouteState = {
      setupToken: "owner-setup-private",
      status: "owner-setup-ready",
    };
    const ownerSurface = projectAuthAccountSurface({
      session: initialAuthAccountDraftSession(ownerState),
      state: ownerState,
    });
    const completeState: AuthAccountRouteState = {
      continueTo: "/",
      result: completeResult(),
      status: "complete",
    };
    const completeSurface = projectAuthAccountSurface({
      session: initialAuthAccountDraftSession(completeState),
      state: completeState,
    });

    expect(ownerSurface.surfaceKind).toBe("owner-setup");
    expect(JSON.stringify(ownerSurface)).not.toContain("owner-setup-private");
    expect(completeSurface).toMatchObject({ state: "complete", surfaceKind: "account-gate" });
  });

  it("maps semantic failures to fixed copy and preserves intentional auth data", () => {
    const setupState: AuthAccountRouteState = {
      challengeId: "challenge:owner",
      displayName: "Ada API_TOKEN=kept /Users/profile",
      email: "Ada.Owner@example.com",
      expiresAt: "2026-08-05T00:00:00.000Z",
      failureCode: "invalid-response",
      setupToken: "owner-setup-private",
      status: "owner-setup-email-sent",
    };
    const setupSurface = projectAuthAccountSurface({
      session: initialAuthAccountDraftSession(setupState),
      state: setupState,
    });
    const failedState = Object.assign(
      { code: "internal-failure", status: "failed" } satisfies AuthAccountRouteState,
      { diagnostic: "SQLITE_ERROR at /Users/ada/formless" },
    );
    const failedSurface = projectAuthAccountSurface({
      session: initialAuthAccountDraftSession(failedState),
      state: failedState,
    });

    expect(setupSurface.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "Ada API_TOKEN=kept /Users/profile" }),
        expect.objectContaining({ value: "Ada.Owner@example.com" }),
      ]),
    );
    expect(setupSurface.feedback?.detail).toBe(
      "The account service returned an invalid response. Try again.",
    );
    expect(failedSurface.feedback?.detail).toBe("The account service is unavailable. Try again.");
    expect(JSON.stringify({ failedSurface, setupSurface })).not.toContain("SQLITE_ERROR");
    expect(JSON.stringify(setupSurface)).not.toContain("owner-setup-private");
  });
});

function target(): AccountCompletionGateTarget {
  return {
    access: "authenticated",
    returnTo: "/",
    routeId: "route:program",
    targetOrigin: "https://example.com",
    targetProfile: "instance",
  };
}

function blockedResult(gate: AccountCompletionGate): AccountCompletionGateResult {
  return { gate, status: "blocked", target: target() };
}

function completeResult(): AccountCompletionContinuationResult {
  return { continueTo: "/", status: "complete", target: target() };
}

function termsGate(): Extract<AccountCompletionGate, { kind: "terms-acceptance" }> {
  return {
    kind: "terms-acceptance",
    operation: { label: "Accept terms", operationKey: "auth.terms-acceptance.complete" },
    policies: [
      {
        accountPolicyId: "policy:program",
        displayName: "Program terms",
        policyKey: "program-terms",
        version: "2026-08-01",
      },
    ],
  };
}
