import type {
  AuthContinuationContract,
  AuthFactContract,
  AuthFeedbackContract,
  AuthMessageContract,
  AuthPasskeyContract,
  ButtonContract,
  CollaboratorInvitationAuthSurfaceContract,
} from "@dpeek/formless-presentation/contract";
import { authSurfaceReference } from "@dpeek/formless-presentation/host";

import type { CollaboratorInvitationAcceptanceInvitationSummary } from "../../shared/instance-auth.ts";
import { displaySafeText } from "./instance-management-display-safety.ts";
import type { CollaboratorInvitationAcceptanceRouteState } from "./collaborator-invitation-acceptance.tsx";

export const COLLABORATOR_INVITATION_AUTH_SURFACE_ID = "auth:collaborator-invitation-acceptance";

export const collaboratorInvitationAuthSurfaceReference = authSurfaceReference({
  surfaceId: COLLABORATOR_INVITATION_AUTH_SURFACE_ID,
  surfaceKind: "collaborator-invitation-acceptance",
});

export function projectCollaboratorInvitationAuthSurface({
  state,
}: {
  state: CollaboratorInvitationAcceptanceRouteState;
}): CollaboratorInvitationAuthSurfaceContract {
  const passkey = invitationPasskey(state);
  const continuation = invitationContinuation(state);

  return {
    actions: [],
    ...(continuation ? { continuation } : {}),
    facts: invitationFacts(state),
    ...(state.status === "failed"
      ? {
          feedback: authFeedback(
            "acceptance-failure",
            "Invitation acceptance failed",
            state.message,
          ),
        }
      : {}),
    fields: [],
    frame: authFrame(invitationHeading(state), invitationDescription(state)),
    id: COLLABORATOR_INVITATION_AUTH_SURFACE_ID,
    kind: "authSurface",
    ...(invitationMessage(state) ? { message: invitationMessage(state) } : {}),
    ...(passkey ? { passkey } : {}),
    pending: state.status === "submitting",
    policies: [],
    state: state.status,
    surfaceKind: "collaborator-invitation-acceptance",
  };
}

function invitationPasskey(
  state: CollaboratorInvitationAcceptanceRouteState,
): AuthPasskeyContract | undefined {
  const passkeyId = `${COLLABORATOR_INVITATION_AUTH_SURFACE_ID}:passkey:accept-invitation`;

  if (state.status === "passkey-unavailable") {
    return {
      availability: "unavailable",
      id: passkeyId,
      kind: "authPasskey",
      purpose: "accept-invitation",
      unavailableReason: displaySafeText(state.message),
    };
  }

  if (state.status !== "eligible" && state.status !== "submitting") {
    return undefined;
  }

  const pending = state.status === "submitting";
  const control = authButton(
    `${passkeyId}:control`,
    pending ? "Creating passkey..." : "Create passkey and accept",
    "primary",
    "submit",
    { pending },
  );

  return {
    availability: "available",
    control,
    id: passkeyId,
    intent: {
      controlId: control.id,
      passkeyId,
      surfaceId: COLLABORATOR_INVITATION_AUTH_SURFACE_ID,
      type: "authPasskey",
    },
    kind: "authPasskey",
    purpose: "accept-invitation",
  };
}

function invitationContinuation(
  state: CollaboratorInvitationAcceptanceRouteState,
): AuthContinuationContract | undefined {
  if (state.status !== "continuing") {
    return undefined;
  }

  const destinationId = `${COLLABORATOR_INVITATION_AUTH_SURFACE_ID}:destination:approved`;
  const control = authButton(`${destinationId}:control`, "Continue", "primary");
  const origin = safeHttpOrigin(state.handoff?.targetOrigin ?? state.continueTo);

  return {
    control,
    destination: {
      detail: "Open the destination approved by the invitation runtime.",
      id: destinationId,
      kind: "authContinuationDestination",
      label: "Approved destination",
      ...(origin ? { origin } : {}),
    },
    intent: {
      controlId: control.id,
      destinationId,
      surfaceId: COLLABORATOR_INVITATION_AUTH_SURFACE_ID,
      type: "authContinuation",
    },
    kind: "authContinuation",
  };
}

function invitationFacts(
  state: CollaboratorInvitationAcceptanceRouteState,
): readonly AuthFactContract[] {
  if (
    state.status === "eligible" ||
    state.status === "submitting" ||
    state.status === "passkey-unavailable"
  ) {
    return invitationEligibilityFacts(state.invitation);
  }

  if (state.status === "accepted" || state.status === "continuing") {
    return compactFacts(
      authFact("principal", "Signed in as", state.acceptedPrincipal.displayName),
      authFact("session-expiry", "Session expires", state.session.expiresAt),
      authFact("target-origin", "Continue to", state.handoff?.targetOrigin),
    );
  }

  return [];
}

function invitationEligibilityFacts(
  invitation: CollaboratorInvitationAcceptanceInvitationSummary,
): readonly AuthFactContract[] {
  return compactFacts(
    authFact("target-email", "Email", invitation.targetEmail),
    authFact("target-surface", "Surface", targetSurfaceLabel(invitation.targetSurface)),
    authFact("principal-name", "Name", invitation.invitedPrincipalDisplayName),
    authFact("expiry", "Expires", invitation.expiresAt),
  );
}

function invitationHeading(state: CollaboratorInvitationAcceptanceRouteState): string {
  switch (state.status) {
    case "accepted":
    case "continuing":
      return "Invitation accepted";
    case "eligible":
    case "submitting":
      return "Invitation ready";
    case "loading":
      return "Checking invitation";
    case "passkey-unavailable":
      return "Passkeys are unavailable";
    case "failed":
    case "invalid-link":
    case "unavailable":
      return "Invitation unavailable";
  }
}

function invitationDescription(
  state: CollaboratorInvitationAcceptanceRouteState,
): string | undefined {
  if (
    state.status === "eligible" ||
    state.status === "submitting" ||
    state.status === "passkey-unavailable"
  ) {
    return state.invitation.invitedPrincipalDisplayName
      ? `${displaySafeText(state.invitation.invitedPrincipalDisplayName)} has been invited.`
      : "This invitation is ready.";
  }
  if (state.status === "accepted") {
    return `Signed in as ${displaySafeText(state.acceptedPrincipal.displayName)}.`;
  }
  if (state.status === "continuing") {
    return "Opening your approved destination.";
  }
  return undefined;
}

function invitationMessage(
  state: CollaboratorInvitationAcceptanceRouteState,
): AuthMessageContract | undefined {
  if (state.status === "loading") {
    return authMessage("loading", "Loading invitation status.");
  }
  if (state.status === "invalid-link") {
    return authMessage("invalid-link", state.message, "danger");
  }
  if (state.status === "unavailable") {
    return authMessage("unavailable", state.message, "danger");
  }
  if (state.status === "passkey-unavailable") {
    return authMessage("passkey-unavailable", state.message, "warning");
  }
  if (state.status === "continuing") {
    return authMessage("continuing", "Continuing...", "success");
  }
  return undefined;
}

function authFrame(title: string, description?: string) {
  return {
    accessibilityLabel: title,
    brand: { kind: "authBrand" as const, label: "Formless" },
    heading: {
      ...(description ? { description } : {}),
      kind: "authHeading" as const,
      title,
    },
    kind: "authFrame" as const,
  };
}

function authMessage(
  id: string,
  title: string,
  severity: AuthMessageContract["severity"] = "info",
): AuthMessageContract {
  return {
    id: `${COLLABORATOR_INVITATION_AUTH_SURFACE_ID}:message:${id}`,
    kind: "authMessage",
    severity,
    title: displaySafeText(title),
  };
}

function authFeedback(id: string, title: string, detail: string): AuthFeedbackContract {
  return {
    detail: displaySafeText(detail),
    id: `${COLLABORATOR_INVITATION_AUTH_SURFACE_ID}:feedback:${id}`,
    kind: "authFeedback",
    severity: "danger",
    title,
  };
}

function authFact(
  id: string,
  label: string,
  value: string | undefined,
): AuthFactContract | undefined {
  return value
    ? {
        id: `${COLLABORATOR_INVITATION_AUTH_SURFACE_ID}:fact:${id}`,
        kind: "authFact",
        label,
        value: displaySafeText(value),
      }
    : undefined;
}

function compactFacts(...facts: Array<AuthFactContract | undefined>): AuthFactContract[] {
  return facts.filter((fact): fact is AuthFactContract => fact !== undefined);
}

function authButton(
  id: string,
  label: string,
  prominence: ButtonContract["prominence"],
  type: ButtonContract["type"] = "button",
  options: { pending?: boolean } = {},
): ButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    id,
    kind: "button",
    ...(options.pending ? { pending: { isPending: true, label } } : {}),
    prominence,
    type,
  };
}

function targetSurfaceLabel(
  surface: CollaboratorInvitationAcceptanceInvitationSummary["targetSurface"],
): string {
  switch (surface) {
    case "instance":
      return "Instance";
    case "organization":
      return "Organization";
  }
}

function safeHttpOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, "https://formless.local");
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return value.startsWith("/") ? undefined : url.origin;
  } catch {
    return undefined;
  }
}
