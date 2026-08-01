import { describe, expect, it } from "vite-plus/test";
import type { AuthIntent } from "@dpeek/formless-presentation/contract";

import type { CollaboratorInvitationAcceptanceInvitationSummary } from "../../shared/instance-auth.ts";
import {
  authIntentIsCurrent,
  createAuthPendingGuard,
  createNoShellAuthRuntimeHost,
} from "./auth-runtime-boundary.tsx";
import {
  collaboratorInvitationAuthSurfaceReference,
  projectCollaboratorInvitationAuthSurface,
} from "./collaborator-invitation-auth-projection.ts";
import type { CollaboratorInvitationAcceptanceRouteState } from "./collaborator-invitation-acceptance.tsx";

const rawToken = "aW52aXRlLXJhdy10b2tlbi0x";
const tokenHash = "sha256-private-token-hash";
const credentialId = "credential-private";
const sessionId = "central-session-private";
const handoffSecret = "handoff-grant-private";

const invitation = {
  expiresAt: "2026-07-01T00:00:00.000Z",
  invitationId: "invitation:eligible",
  invitedPrincipalDisplayName: "Ada Collaborator",
  passkeyRegistrationRequired: true,
  targetEmail: "Ada.Collab@example.com",
  targetSurface: "instance",
} satisfies CollaboratorInvitationAcceptanceInvitationSummary;

const acceptedState = {
  acceptedPrincipal: {
    displayName: "Ada Collaborator",
    principalId: "principal:accepted",
  },
  invitation,
  session: { expiresAt: "2026-07-02T00:00:00.000Z" },
  status: "accepted",
} satisfies CollaboratorInvitationAcceptanceRouteState;

const continuingState = {
  ...acceptedState,
  continueTo: "https://site.example.com/dashboard?view=home",
  handoff: {
    returnTo: "/dashboard?view=home",
    targetOrigin: "https://site.example.com",
  },
  status: "continuing",
} satisfies CollaboratorInvitationAcceptanceRouteState;

describe("collaborator invitation auth projection", () => {
  it("projects every invitation acceptance runtime state", () => {
    const states: CollaboratorInvitationAcceptanceRouteState[] = [
      { status: "loading" },
      { message: "Invitation link is invalid.", status: "invalid-link" },
      {
        message: "Invitation acceptance is unavailable.",
        reason: "configuration-unavailable",
        status: "unavailable",
      },
      { invitation, status: "eligible" },
      { invitation, status: "submitting" },
      {
        invitation,
        message: "This browser does not support passkeys.",
        status: "passkey-unavailable",
      },
      { message: "Invitation acceptance failed.", status: "failed" },
      acceptedState,
      continuingState,
    ];

    expect(
      states.map((state) => projectCollaboratorInvitationAuthSurface({ state }).state),
    ).toEqual([
      "loading",
      "invalid-link",
      "unavailable",
      "eligible",
      "submitting",
      "passkey-unavailable",
      "failed",
      "accepted",
      "continuing",
    ]);
  });

  it("projects only display-safe eligibility facts and one passkey action", () => {
    const state = Object.assign(
      { invitation, status: "eligible" } satisfies CollaboratorInvitationAcceptanceRouteState,
      {
        credentialId,
        rawInvitationToken: rawToken,
        tokenHash,
      },
    );
    const surface = projectCollaboratorInvitationAuthSurface({ state });
    const serialized = JSON.stringify(surface);

    expect(surface.facts.map(({ label, value }) => [label, value])).toEqual([
      ["Email", "Ada.Collab@example.com"],
      ["Surface", "Instance"],
      ["Name", "Ada Collaborator"],
      ["Expires", "2026-07-01T00:00:00.000Z"],
    ]);
    expect(surface.passkey).toMatchObject({
      availability: "available",
      purpose: "accept-invitation",
    });
    expect(surface.actions).toEqual([]);
    expect(surface.fields).toEqual([]);
    expect(surface.policies).toEqual([]);
    expect(serialized).not.toContain(invitation.invitationId);
    expect(serialized).not.toContain(rawToken);
    expect(serialized).not.toContain(tokenHash);
    expect(serialized).not.toContain(credentialId);
  });

  it("projects passkey unavailability, acceptance, and runtime-approved continuation safely", () => {
    const unavailable = projectCollaboratorInvitationAuthSurface({
      state: {
        invitation,
        message: "Passkeys unavailable with API_TOKEN=passkey-secret",
        status: "passkey-unavailable",
      },
    });
    const accepted = projectCollaboratorInvitationAuthSurface({ state: acceptedState });
    const continuing = projectCollaboratorInvitationAuthSurface({ state: continuingState });
    const serialized = JSON.stringify({ accepted, continuing });

    expect(unavailable.passkey).toMatchObject({
      availability: "unavailable",
      unavailableReason: "Passkeys unavailable with API_TOKEN=[redacted]",
    });
    expect(accepted.facts.map(({ label, value }) => [label, value])).toEqual([
      ["Signed in as", "Ada Collaborator"],
      ["Session expires", "2026-07-02T00:00:00.000Z"],
    ]);
    expect(continuing.facts.map(({ label, value }) => [label, value])).toEqual([
      ["Signed in as", "Ada Collaborator"],
      ["Session expires", "2026-07-02T00:00:00.000Z"],
      ["Continue to", "https://site.example.com"],
    ]);
    expect(continuing.continuation?.destination).toMatchObject({
      label: "Approved destination",
      origin: "https://site.example.com",
    });
    expect(serialized).not.toContain("principal:accepted");
    expect(serialized).not.toContain(invitation.invitationId);
    expect(serialized).not.toContain(continuingState.handoff.returnTo);
    expect(serialized).not.toContain(sessionId);
    expect(serialized).not.toContain(handoffSecret);
  });

  it("keeps inaccessible links and failures display-safe without invented actions", () => {
    const unavailableState = Object.assign(
      {
        message: "Invitation link is invalid.",
        reason: "wrong-token",
        status: "unavailable",
      } satisfies CollaboratorInvitationAcceptanceRouteState,
      { rawInvitationToken: rawToken, tokenHash },
    );
    const unavailable = projectCollaboratorInvitationAuthSurface({ state: unavailableState });
    const failed = projectCollaboratorInvitationAuthSurface({
      state: {
        message: "Failed with API_TOKEN=invitation-secret at /Users/ada/formless",
        status: "failed",
      },
    });
    const serialized = JSON.stringify({ failed, unavailable });

    expect(unavailable.message?.title).toBe("Invitation link is invalid.");
    expect(unavailable.facts).toEqual([]);
    expect(failed.feedback?.detail).toBe("Failed with API_TOKEN=[redacted] at <path>");
    expect(serialized).not.toContain("wrong-token");
    expect(serialized).not.toContain(rawToken);
    expect(serialized).not.toContain(tokenHash);
    expect(serialized).not.toContain("decline");
    expect(serialized).not.toContain("contact-owner");
    expect(serialized).not.toContain("target-selection");
  });

  it("projects accessible invitation presentation without private identity state", () => {
    const surface = projectCollaboratorInvitationAuthSurface({
      state: { invitation, status: "eligible" },
    });
    expect(surface.frame.accessibilityLabel).toBe("Invitation ready");
    expect(surface.facts).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: "Ada.Collab@example.com" })]),
    );
    expect(surface.passkey).toMatchObject({
      availability: "available",
      control: { accessibilityLabel: "Create passkey and accept" },
    });
    const serialized = JSON.stringify(surface);
    expect(serialized).not.toContain(invitation.invitationId);
    expect(serialized).not.toMatch(/Decline|Contact owner|Choose destination/);
  });

  it("dispatches only exact current intents and deduplicates pending acceptance", async () => {
    const eligible = projectCollaboratorInvitationAuthSurface({
      state: { invitation, status: "eligible" },
    });
    const passkey = eligible.passkey;
    if (passkey?.availability !== "available") {
      throw new Error("Expected invitation acceptance passkey.");
    }

    expect(authIntentIsCurrent(eligible, passkey.intent)).toBe(true);
    expect(authIntentIsCurrent(eligible, { ...passkey.intent, passkeyId: "stale" })).toBe(false);
    expect(
      authIntentIsCurrent(
        projectCollaboratorInvitationAuthSurface({
          state: { invitation, status: "submitting" },
        }),
        passkey.intent,
      ),
    ).toBe(false);

    const continuing = projectCollaboratorInvitationAuthSurface({ state: continuingState });
    const continuationIntent = continuing.continuation?.intent;
    if (!continuationIntent) throw new Error("Expected invitation continuation intent.");
    expect(authIntentIsCurrent(continuing, continuationIntent)).toBe(true);
    expect(authIntentIsCurrent(continuing, { ...continuationIntent, destinationId: "stale" })).toBe(
      false,
    );

    const calls: AuthIntent[] = [];
    const runtime = createNoShellAuthRuntimeHost(
      collaboratorInvitationAuthSurfaceReference,
      eligible,
      (intent) => {
        calls.push(intent);
      },
    );
    await runtime.host.dispatch(passkey.intent);
    expect(calls).toEqual([passkey.intent]);

    const guard = createAuthPendingGuard();
    let release: (() => void) | undefined;
    let operationCalls = 0;
    const operation = () =>
      guard.run(
        () =>
          new Promise<void>((resolve) => {
            operationCalls += 1;
            release = resolve;
          }),
      );
    const firstRun = operation();
    const duplicateRun = operation();
    expect(await duplicateRun).toBe(false);
    expect(operationCalls).toBe(1);
    release?.();
    expect(await firstRun).toBe(true);
  });
});
