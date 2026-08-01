import type {
  AccountGateAuthSurfaceContract,
  AuthActionContract,
  AuthContinuationContract,
  AuthFactContract,
  AuthFeedbackContract,
  AuthFieldContract,
  AuthMessageContract,
  AuthPasskeyContract,
  AuthPolicyContract,
  AuthSurfaceContract,
  AuthSurfaceReference,
  ButtonContract,
  FieldIntent,
  OwnerSetupAuthSurfaceContract,
  OwnerSetupStep,
} from "@dpeek/formless-presentation/contract";
import { authSurfaceReference } from "@dpeek/formless-presentation/host";
import type { FieldValue } from "@dpeek/formless-schema";
import type { CreateFieldConfig } from "../../client/views.ts";
import type {
  AccountCompletionGate,
  AccountCompletionGateOperationInputContract,
  AccountCompletionGateTarget,
  AccountCompletionProfileCompletionGate,
} from "../../shared/instance-auth.ts";
import {
  initialGeneratedCreateDraftSessionState,
  markGeneratedCreateDraftSessionSubmitted,
  nextGeneratedCreateDraftSessionState,
  selectGeneratedCreateDraftSession,
  type GeneratedCreateDraftSessionState,
} from "../generated/create-field-authoring.ts";
import {
  initialGeneratedOperationDraftSessionState,
  nextGeneratedOperationDraftSessionState,
  selectGeneratedOperationDraftSession,
  type GeneratedOperationDraftSessionState,
} from "../generated/operation-field-authoring.ts";
import {
  projectGeneratedCreateFields,
  projectGeneratedOperationFields,
} from "../generated/field-projection.ts";
import { displaySafeText } from "./instance-management-display-safety.ts";
import type { AuthAccountRouteState } from "./auth-account.tsx";

type AuthAccountGateRouteState = Exclude<
  AuthAccountRouteState,
  { status: `owner-setup-${string}` }
>;

export const AUTH_ACCOUNT_GATE_SURFACE_ID = "auth:account";
export const AUTH_ACCOUNT_OWNER_SETUP_SURFACE_ID = "auth:account:owner-setup";

export const authAccountGateSurfaceReference = authSurfaceReference({
  surfaceId: AUTH_ACCOUNT_GATE_SURFACE_ID,
  surfaceKind: "account-gate",
});
export const authAccountOwnerSetupSurfaceReference = authSurfaceReference({
  surfaceId: AUTH_ACCOUNT_OWNER_SETUP_SURFACE_ID,
  surfaceKind: "owner-setup",
});

const accountDraftFieldConfigs: CreateFieldConfig[] = [
  createTextField("displayName", "Name", true),
  createTextField("email", "Email", true, "email"),
  createTextField("token", "Verification token", true),
];

export type AuthAccountDraftSession = {
  acceptedPolicyIds: readonly string[];
  create: GeneratedCreateDraftSessionState;
  key: string;
  profile: GeneratedOperationDraftSessionState;
  submitAttempted: boolean;
};

export type AuthAccountDraftSubmission =
  | { acceptedPolicyIds: string[]; kind: "terms-acceptance"; ok: true }
  | { displayName: string; email: string; kind: "owner-setup-identity"; ok: true }
  | { kind: "owner-setup-verification-token"; ok: true; token: string }
  | { input: Record<string, unknown>; kind: "profile-completion"; ok: true }
  | { kind: "verification-token"; ok: true; token: string }
  | { email: string; kind: "email-verification"; ok: true }
  | { ok: false };

export function initialAuthAccountDraftSession(
  state: AuthAccountRouteState,
): AuthAccountDraftSession {
  const create = initialGeneratedCreateDraftSessionState({ fields: accountDraftFieldConfigs });
  const seededCreate = Object.entries(authAccountDraftSeedValues(state)).reduce(
    (session, [fieldName, value]) =>
      nextGeneratedCreateDraftSessionState({
        fieldName,
        fieldValue: { kind: "input", value },
        state: session,
      }),
    create,
  );
  const profileFields = authAccountProfileInputContract(state)?.fields ?? [];

  return {
    acceptedPolicyIds: [],
    create: seededCreate,
    key: authAccountDraftSessionKey(state),
    profile: initialGeneratedOperationDraftSessionState({ fields: profileFields }),
    submitAttempted: false,
  };
}

export function prepareAuthAccountDraftSession(
  session: AuthAccountDraftSession,
  state: AuthAccountRouteState,
): AuthAccountDraftSession {
  return session.key === authAccountDraftSessionKey(state)
    ? session
    : initialAuthAccountDraftSession(state);
}

export function nextAuthAccountDraftSession(
  session: AuthAccountDraftSession,
  intent: FieldIntent | { accepted: boolean; policyId: string },
): AuthAccountDraftSession {
  if ("policyId" in intent) {
    const acceptedPolicyIds = new Set(session.acceptedPolicyIds);
    if (intent.accepted) acceptedPolicyIds.add(intent.policyId);
    else acceptedPolicyIds.delete(intent.policyId);
    return { ...session, acceptedPolicyIds: [...acceptedPolicyIds] };
  }

  if (intent.type === "createDraftChange") {
    return {
      ...session,
      create: nextGeneratedCreateDraftSessionState({
        fieldName: intent.fieldName,
        fieldValue: intent.fieldValue,
        state: session.create,
      }),
      submitAttempted: false,
    };
  }

  if (intent.type === "operationDraftChange") {
    return {
      ...session,
      profile: nextGeneratedOperationDraftSessionState({
        inputName: intent.inputName,
        inputValue: intent.inputValue,
        state: session.profile,
      }),
      submitAttempted: false,
    };
  }

  return session;
}

export function markAuthAccountDraftSessionSubmitted(
  session: AuthAccountDraftSession,
): AuthAccountDraftSession {
  return {
    ...session,
    create: markGeneratedCreateDraftSessionSubmitted(session.create),
    submitAttempted: true,
  };
}

export function selectAuthAccountDraftSubmission({
  session,
  state,
}: {
  session: AuthAccountDraftSession;
  state: AuthAccountRouteState;
}): AuthAccountDraftSubmission {
  const fields = authAccountCreateFieldConfigs(state);
  const create = selectGeneratedCreateDraftSession({
    enabled: true,
    fields,
    state: markGeneratedCreateDraftSessionSubmitted(session.create),
  });

  if (isOwnerSetupIdentityState(state)) {
    const displayName = stringFieldValue(create.values.displayName);
    const email = stringFieldValue(create.values.email);
    return create.canSubmit && displayName && email
      ? { displayName, email, kind: "owner-setup-identity", ok: true }
      : { ok: false };
  }

  if (isOwnerSetupEmailVerificationState(state)) {
    const token = stringFieldValue(create.values.token);
    return create.canSubmit && token
      ? { kind: "owner-setup-verification-token", ok: true, token }
      : { ok: false };
  }

  if (state.status === "blocked") {
    const { gate } = state.result;
    if (gate.kind === "email-verification") {
      if (state.action?.kind === "email-verification-sent") {
        const token = stringFieldValue(create.values.token);
        return create.canSubmit && token
          ? { kind: "verification-token", ok: true, token }
          : { ok: false };
      }
      const email = stringFieldValue(create.values.email);
      return create.canSubmit && email
        ? { email, kind: "email-verification", ok: true }
        : { ok: false };
    }
    if (gate.kind === "terms-acceptance") {
      const acceptedPolicyIds = gate.policies
        .map((policy) => policy.accountPolicyId)
        .filter((policyId) => session.acceptedPolicyIds.includes(policyId));
      return acceptedPolicyIds.length === gate.policies.length
        ? { acceptedPolicyIds, kind: "terms-acceptance", ok: true }
        : { ok: false };
    }
    if (gate.kind === "profile-completion" && gate.inputContract && gate.operation) {
      const profile = selectGeneratedOperationDraftSession({
        fields: gate.inputContract.fields,
        state: session.profile,
        unsupportedRequiredInputNames: gate.inputContract.unsupportedRequiredFields,
      });
      return profile.canSubmit
        ? { input: profile.input, kind: "profile-completion", ok: true }
        : { ok: false };
    }
    return { ok: false };
  }

  return { ok: false };
}

export function projectAuthAccountSurface({
  session,
  state,
}: {
  session: AuthAccountDraftSession;
  state: AuthAccountRouteState;
}): AccountGateAuthSurfaceContract | OwnerSetupAuthSurfaceContract {
  if (isOwnerSetupState(state)) return projectOwnerSetupSurface({ session, state });
  return projectAccountGateSurface({ session, state });
}

export function authAccountSurfaceReference(
  surface: AuthSurfaceContract,
): AuthSurfaceReference<"account-gate" | "owner-setup"> {
  if (surface.surfaceKind === "owner-setup") return authAccountOwnerSetupSurfaceReference;
  return authAccountGateSurfaceReference;
}

function projectAccountGateSurface({
  session,
  state,
}: {
  session: AuthAccountDraftSession;
  state: AuthAccountGateRouteState;
}): AccountGateAuthSurfaceContract {
  const gate = state.status === "blocked" ? state.result.gate : undefined;
  const pending =
    (state.status === "blocked" && accountGateActionIsPending(state.action)) ||
    (state.status === "forbidden" && state.action?.kind === "logout-pending");
  const contractState = accountGateContractState(state);
  const feedback = accountGateFeedback(state, session);
  const continuation = accountGateContinuation(state);

  return {
    actions: accountGateActions(state),
    ...(continuation ? { continuation } : {}),
    facts: accountGateFacts(state),
    ...(feedback ? { feedback } : {}),
    fields: accountGateFields(state, session, pending),
    frame: authFrame(accountGateHeading(state), accountGateDescription(state)),
    ...(gate ? { gateKind: gate.kind } : {}),
    id: AUTH_ACCOUNT_GATE_SURFACE_ID,
    kind: "authSurface",
    ...(accountGateMessage(state) ? { message: accountGateMessage(state) } : {}),
    pending,
    policies: accountGatePolicies(state, session),
    state: contractState,
    surfaceKind: "account-gate",
  } as AccountGateAuthSurfaceContract;
}

function projectOwnerSetupSurface({
  session,
  state,
}: {
  session: AuthAccountDraftSession;
  state: Extract<AuthAccountRouteState, { status: `owner-setup-${string}` }>;
}): OwnerSetupAuthSurfaceContract {
  const pending = ownerSetupIsPending(state);
  const feedback =
    "message" in state &&
    state.message &&
    state.status !== "owner-setup-invalid" &&
    state.status !== "owner-setup-passkey-unavailable"
      ? authFeedback("owner-setup-failure", "Owner setup failed", state.message)
      : undefined;
  const message = ownerSetupMessage(state);
  const passkey = ownerSetupPasskey(state);
  const continuation = ownerSetupContinuation(state);
  const step = ownerSetupStep(state);

  return {
    actions: ownerSetupActions(state),
    ...(continuation ? { continuation } : {}),
    facts: ownerSetupFacts(state),
    ...(feedback ? { feedback } : {}),
    fields: ownerSetupFields(state, session, pending),
    frame: authFrame(ownerSetupHeading(state), ownerSetupDescription(state)),
    id: AUTH_ACCOUNT_OWNER_SETUP_SURFACE_ID,
    kind: "authSurface",
    ...(message ? { message } : {}),
    ...(passkey ? { passkey } : {}),
    pending,
    policies: [],
    state: ownerSetupContractState(state),
    ...(step ? { step } : {}),
    surfaceKind: "owner-setup",
  };
}

function ownerSetupFields(
  state: Extract<AuthAccountRouteState, { status: `owner-setup-${string}` }>,
  session: AuthAccountDraftSession,
  pending: boolean,
): readonly AuthFieldContract[] {
  if (isOwnerSetupIdentityState(state)) {
    return projectCreateAuthFields({
      fields: accountDraftFieldConfigs.filter(
        (field) => field.fieldName === "displayName" || field.fieldName === "email",
      ),
      pending,
      purposeByFieldName: { displayName: "display-name", email: "email" },
      session,
      surfaceId: AUTH_ACCOUNT_OWNER_SETUP_SURFACE_ID,
    });
  }
  if (isOwnerSetupEmailVerificationState(state)) {
    return projectCreateAuthFields({
      fields: accountDraftFieldConfigs.filter((field) => field.fieldName === "token"),
      pending,
      purposeByFieldName: { token: "verification-token" },
      session,
      surfaceId: AUTH_ACCOUNT_OWNER_SETUP_SURFACE_ID,
    });
  }
  return [];
}

function accountGateFields(
  state: AuthAccountGateRouteState,
  session: AuthAccountDraftSession,
  pending: boolean,
): readonly AuthFieldContract[] {
  if (state.status !== "blocked") return [];
  const { gate } = state.result;
  if (gate.kind === "profile-completion") {
    return profileCompletionFields(gate, session, pending);
  }
  if (gate.kind !== "email-verification") return [];
  const fieldName =
    state.action?.kind === "email-verification-sent" ||
    state.action?.kind === "email-verification-verifying"
      ? "token"
      : "email";
  return projectCreateAuthFields({
    fields: accountDraftFieldConfigs.filter((field) => field.fieldName === fieldName),
    pending,
    purposeByFieldName:
      fieldName === "token" ? { token: "verification-token" } : { email: "email" },
    session,
    surfaceId: AUTH_ACCOUNT_GATE_SURFACE_ID,
  });
}

function projectCreateAuthFields({
  fields,
  pending,
  purposeByFieldName,
  session,
  surfaceId,
}: {
  fields: CreateFieldConfig[];
  pending: boolean;
  purposeByFieldName: Record<string, "display-name" | "email" | "verification-token">;
  session: AuthAccountDraftSession;
  surfaceId: string;
}): readonly AuthFieldContract[] {
  const facts = selectGeneratedCreateDraftSession({
    enabled: !pending,
    fields,
    state: session.create,
  });
  const projected = projectGeneratedCreateFields({
    owner: { kind: "createSurface", surfaceId },
    pendingByFieldName: Object.fromEntries(fields.map((field) => [field.fieldName, pending])),
    session: facts,
    state: session.create,
  });

  return projected.map((field) => ({
    autocomplete:
      field.fieldName === "displayName"
        ? "name"
        : field.fieldName === "email"
          ? "email"
          : "one-time-code",
    field,
    intent: { fieldId: field.fieldId, surfaceId, type: "authField" },
    kind: "authField",
    purpose: purposeByFieldName[field.fieldName]!,
  }));
}

function profileCompletionFields(
  gate: AccountCompletionProfileCompletionGate,
  session: AuthAccountDraftSession,
  pending: boolean,
): readonly AuthFieldContract[] {
  if (
    !gate.operation ||
    !gate.inputContract ||
    gate.inputContract.unsupportedRequiredFields.length > 0
  )
    return [];
  const selected = selectGeneratedOperationDraftSession({
    enabled: !pending,
    fields: gate.inputContract.fields,
    state: session.profile,
    unsupportedRequiredInputNames: gate.inputContract.unsupportedRequiredFields,
  });
  const visibleSession = session.submitAttempted ? selected : { ...selected, fieldErrors: {} };
  return projectGeneratedOperationFields({
    owner: { formId: AUTH_ACCOUNT_GATE_SURFACE_ID, kind: "operationForm" },
    pendingByFieldName: Object.fromEntries(
      gate.inputContract.fields.map((field) => [field.name, pending]),
    ),
    session: visibleSession,
    state: session.profile,
  }).map((field) => ({
    autocomplete: field.input.format === "email" ? "email" : "off",
    field,
    intent: { fieldId: field.fieldId, surfaceId: AUTH_ACCOUNT_GATE_SURFACE_ID, type: "authField" },
    kind: "authField",
    purpose: "profile-input",
  }));
}

function ownerSetupActions(
  state: Extract<AuthAccountRouteState, { status: `owner-setup-${string}` }>,
): readonly AuthActionContract[] {
  if (isOwnerSetupIdentityState(state)) {
    return [
      authAction(
        AUTH_ACCOUNT_OWNER_SETUP_SURFACE_ID,
        "submit",
        "Send verification email",
        "primary",
        state.status === "owner-setup-email-sending",
      ),
    ];
  }
  if (isOwnerSetupEmailVerificationState(state)) {
    return [
      authAction(
        AUTH_ACCOUNT_OWNER_SETUP_SURFACE_ID,
        "submit",
        "Verify email",
        "primary",
        state.status === "owner-setup-email-verifying",
      ),
    ];
  }
  if (state.status === "owner-setup-completion-ready") {
    return [authAction(AUTH_ACCOUNT_OWNER_SETUP_SURFACE_ID, "retry", "Try owner setup again")];
  }
  if (state.status === "owner-setup-invalid") {
    return [authAction(AUTH_ACCOUNT_OWNER_SETUP_SURFACE_ID, "retry", "Try again")];
  }
  return [];
}

function ownerSetupPasskey(
  state: Extract<AuthAccountRouteState, { status: `owner-setup-${string}` }>,
): AuthPasskeyContract | undefined {
  if (state.status === "owner-setup-passkey-unavailable") {
    return {
      availability: "unavailable",
      id: `${AUTH_ACCOUNT_OWNER_SETUP_SURFACE_ID}:passkey:create`,
      kind: "authPasskey",
      purpose: "create",
      unavailableReason: displaySafeText(
        state.message ?? "This browser does not support passkeys.",
      ),
    };
  }
  if (
    state.status !== "owner-setup-credential-ready" &&
    state.status !== "owner-setup-credential-submitting"
  ) {
    return undefined;
  }

  const passkeyId = `${AUTH_ACCOUNT_OWNER_SETUP_SURFACE_ID}:passkey:create`;
  const pending = state.status === "owner-setup-credential-submitting";
  const control = authButton(
    `${passkeyId}:control`,
    pending ? "Creating passkey..." : "Create owner passkey",
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
      surfaceId: AUTH_ACCOUNT_OWNER_SETUP_SURFACE_ID,
      type: "authPasskey",
    },
    kind: "authPasskey",
    purpose: "create",
  };
}

function accountGateActions(state: AuthAccountGateRouteState): readonly AuthActionContract[] {
  if (state.status === "forbidden") {
    return [
      authAction(
        AUTH_ACCOUNT_GATE_SURFACE_ID,
        "logout",
        state.action?.kind === "logout-pending" ? "Signing out..." : "Sign out",
        "secondary",
        state.action?.kind === "logout-pending",
      ),
    ];
  }
  if (state.status === "failed")
    return [authAction(AUTH_ACCOUNT_GATE_SURFACE_ID, "retry", "Try again")];
  if (state.status !== "blocked") return [];
  if (state.action?.kind === "gate-unavailable")
    return [authAction(AUTH_ACCOUNT_GATE_SURFACE_ID, "retry", "Try again")];
  const { gate } = state.result;
  if (gate.kind === "email-verification") {
    return [
      authAction(
        AUTH_ACCOUNT_GATE_SURFACE_ID,
        "submit",
        state.action?.kind === "email-verification-sent" ||
          state.action?.kind === "email-verification-verifying"
          ? "Verify email"
          : "Send verification email",
        "primary",
        accountGateActionIsPending(state.action),
      ),
    ];
  }
  if (gate.kind === "profile-completion" && profileCompletionIsAvailable(gate))
    return [
      authAction(
        AUTH_ACCOUNT_GATE_SURFACE_ID,
        "submit",
        operationLabel(gate.operation) ?? "Complete profile",
        "primary",
        accountGateActionIsPending(state.action),
      ),
    ];
  if (gate.kind === "terms-acceptance" && gate.policies.length > 0)
    return [
      authAction(
        AUTH_ACCOUNT_GATE_SURFACE_ID,
        "submit",
        operationLabel(gate.operation) ?? "Accept terms",
        "primary",
        accountGateActionIsPending(state.action),
      ),
    ];
  return [];
}

function accountGatePolicies(
  state: AuthAccountGateRouteState,
  session: AuthAccountDraftSession,
): readonly AuthPolicyContract[] {
  if (state.status !== "blocked" || state.result.gate.kind !== "terms-acceptance") return [];
  return state.result.gate.policies.map((policy) => {
    const accepted = session.acceptedPolicyIds.includes(policy.accountPolicyId);
    const destination = safePolicyDestination(policy.policyDocumentUrl, policy.displayName);
    return {
      accepted,
      ...(destination ? { destination } : {}),
      description: `Version ${displaySafeText(policy.version)}`,
      id: policy.accountPolicyId,
      kind: "authPolicy",
      label: displaySafeText(policy.displayName),
      required: true,
      selectionIntent: {
        accepted: !accepted,
        policyId: policy.accountPolicyId,
        surfaceId: AUTH_ACCOUNT_GATE_SURFACE_ID,
        type: "authPolicySelection",
      },
    };
  });
}

function ownerSetupFacts(
  state: Extract<AuthAccountRouteState, { status: `owner-setup-${string}` }>,
): readonly AuthFactContract[] {
  if (
    state.status === "owner-setup-already-complete" ||
    state.status === "owner-setup-complete" ||
    state.status === "owner-setup-continuing"
  ) {
    return compactFacts(authFact("owner", "Owner", state.owner?.name));
  }
  if (
    state.status === "owner-setup-ready" ||
    state.status === "owner-setup-loading" ||
    state.status === "owner-setup-invalid"
  ) {
    return [];
  }
  return compactFacts(
    authFact("owner-name", "Name", state.displayName),
    authFact("owner-email", "Primary email", state.email),
    "expiresAt" in state ? authFact("verification-expires", "Expires", state.expiresAt) : undefined,
  );
}

function accountGateFacts(state: AuthAccountGateRouteState): readonly AuthFactContract[] {
  if (state.status === "loading" || state.status === "failed") return [];
  if (state.status === "forbidden") {
    return compactFacts(authFact("principal", "Account", state.result.principal.displayName));
  }
  if (state.status === "blocked") {
    const verificationFacts =
      state.result.gate.kind === "email-verification" && state.action && "email" in state.action
        ? compactFacts(
            authFact("verification-email", "Verification email", state.action.email),
            authFact("verification-expires", "Expires", state.action.expiresAt),
          )
        : [];
    return [
      ...gateFacts(state.result.gate),
      ...verificationFacts,
      ...targetFacts(state.result.target),
    ];
  }
  return targetFacts(state.result.target);
}

function gateFacts(gate: AccountCompletionGate): AuthFactContract[] {
  const operation = operationLabel(gate.operation);
  switch (gate.kind) {
    case "email-verification":
      return compactFacts(
        authFact("gate", "Gate", "Email verification"),
        authFact("email", "Email", gate.displayEmail),
        authFact("action", "Action", operation),
      );
    case "credential":
      return compactFacts(
        authFact("gate", "Gate", "Credential"),
        authFact(
          "method",
          "Method",
          gate.credentialMethod === "passkey" ? "Passkey" : gate.credentialMethod,
        ),
        authFact("action", "Action", operation),
      );
    case "invitation":
      return compactFacts(
        authFact("gate", "Gate", "Invitation"),
        authFact("email", "Email", gate.targetEmail),
        authFact("surface", "Surface", titleCase(gate.targetSurface)),
        authFact("action", "Action", operation),
      );
    case "profile-completion":
      return compactFacts(
        authFact("gate", "Gate", "Profile completion"),
        authFact("organization", "Organization", gate.selectedOrganization),
        authFact("action", "Action", operation),
      );
    case "terms-acceptance":
      return compactFacts(
        authFact("gate", "Gate", "Terms acceptance"),
        authFact("action", "Action", operation),
      );
  }
}

function targetFacts(target: AccountCompletionGateTarget): AuthFactContract[] {
  return compactFacts(
    authFact("destination", "Destination", target.returnTo),
    authFact("origin", "Origin", safeHttpOrigin(target.targetOrigin)),
    authFact("target-surface", "Surface", targetProfileLabel(target.targetProfile)),
    authFact("route", "Route", target.routeId),
    authFact("target-organization", "Organization", target.selectedOrganization),
  );
}

function ownerSetupContractState(
  state: Extract<AuthAccountRouteState, { status: `owner-setup-${string}` }>,
): OwnerSetupAuthSurfaceContract["state"] {
  if (state.status === "owner-setup-already-complete") return "already-complete";
  if (state.status === "owner-setup-complete") return "complete";
  if (state.status === "owner-setup-continuing") return "continuing";
  if (state.status === "owner-setup-invalid") return "invalid";
  if (state.status === "owner-setup-loading") return "loading";
  if (state.status === "owner-setup-passkey-unavailable") return "passkey-unavailable";
  if (ownerSetupIsPending(state)) return "submitting";
  if ("message" in state && state.message) return "failed";
  return "ready";
}

function ownerSetupStep(
  state: Extract<AuthAccountRouteState, { status: `owner-setup-${string}` }>,
): OwnerSetupStep | undefined {
  if (isOwnerSetupIdentityState(state)) return "identity";
  if (isOwnerSetupEmailVerificationState(state)) return "email-verification";
  if (
    state.status === "owner-setup-credential-ready" ||
    state.status === "owner-setup-credential-submitting" ||
    state.status === "owner-setup-passkey-unavailable"
  ) {
    return "passkey";
  }
  if (
    state.status === "owner-setup-completion-ready" ||
    state.status === "owner-setup-completing" ||
    state.status === "owner-setup-complete" ||
    state.status === "owner-setup-continuing"
  ) {
    return "completion";
  }
  return undefined;
}

function ownerSetupIsPending(
  state: Extract<AuthAccountRouteState, { status: `owner-setup-${string}` }>,
): boolean {
  return (
    state.status === "owner-setup-email-sending" ||
    state.status === "owner-setup-email-verifying" ||
    state.status === "owner-setup-credential-submitting" ||
    state.status === "owner-setup-completing"
  );
}

function ownerSetupHeading(
  state: Extract<AuthAccountRouteState, { status: `owner-setup-${string}` }>,
): string {
  if (state.status === "owner-setup-loading") return "Checking setup link";
  if (state.status === "owner-setup-invalid") return "Setup link unavailable";
  if (state.status === "owner-setup-already-complete") return "Owner setup is complete";
  if (state.status === "owner-setup-complete" || state.status === "owner-setup-continuing") {
    return "Owner setup complete";
  }
  if (isOwnerSetupEmailVerificationState(state)) return "Verify primary email";
  if (state.status === "owner-setup-passkey-unavailable") return "Passkeys are unavailable";
  if (
    state.status === "owner-setup-credential-ready" ||
    state.status === "owner-setup-credential-submitting"
  ) {
    return "Create owner passkey";
  }
  if (
    state.status === "owner-setup-completion-ready" ||
    state.status === "owner-setup-completing"
  ) {
    return "Activate owner account";
  }
  return "Claim this Formless instance";
}

function ownerSetupDescription(
  state: Extract<AuthAccountRouteState, { status: `owner-setup-${string}` }>,
): string | undefined {
  if (state.status === "owner-setup-already-complete") {
    return state.owner
      ? `${displaySafeText(state.owner.name)} owns this Formless instance.`
      : "This instance has an owner.";
  }
  if (state.status === "owner-setup-complete") return "Your owner account is ready.";
  if (state.status === "owner-setup-continuing") return "Opening your approved destination.";
  if (isOwnerSetupIdentityState(state))
    return "Verify your primary email before creating an owner passkey.";
  if (isOwnerSetupEmailVerificationState(state))
    return `A verification email was sent to ${displaySafeText(state.email)}.`;
  if (
    state.status === "owner-setup-credential-ready" ||
    state.status === "owner-setup-credential-submitting" ||
    state.status === "owner-setup-passkey-unavailable"
  ) {
    return "Create a passkey to protect the owner account.";
  }
  if (
    state.status === "owner-setup-completion-ready" ||
    state.status === "owner-setup-completing"
  ) {
    return "Finish activating the verified owner account.";
  }
  return undefined;
}

function ownerSetupMessage(
  state: Extract<AuthAccountRouteState, { status: `owner-setup-${string}` }>,
): AuthMessageContract | undefined {
  if (state.status === "owner-setup-loading")
    return authMessage("owner-setup-loading", "Loading owner setup.");
  if (state.status === "owner-setup-invalid")
    return authMessage("owner-setup-invalid", state.message, "danger");
  if (state.status === "owner-setup-passkey-unavailable")
    return authMessage(
      "owner-setup-passkey",
      state.message ?? "This browser does not support passkeys.",
      "warning",
    );
  if (state.status === "owner-setup-continuing")
    return authMessage("owner-setup-continuing", "Continuing...", "success");
  return undefined;
}

function ownerSetupContinuation(
  state: Extract<AuthAccountRouteState, { status: `owner-setup-${string}` }>,
): AuthContinuationContract | undefined {
  if (
    (state.status !== "owner-setup-complete" && state.status !== "owner-setup-continuing") ||
    !state.continueTo
  ) {
    return undefined;
  }

  const destinationId = `${AUTH_ACCOUNT_OWNER_SETUP_SURFACE_ID}:destination:account`;
  const control = authButton(`${destinationId}:control`, "Continue", "primary");
  const origin =
    state.handoff?.targetOrigin ??
    (state.continueTo.startsWith("/") ? undefined : safeHttpOrigin(state.continueTo));

  return {
    control,
    destination: {
      detail: "Open your approved destination.",
      id: destinationId,
      kind: "authContinuationDestination",
      label: "Continue",
      ...(origin ? { origin } : {}),
    },
    intent: {
      controlId: control.id,
      destinationId,
      surfaceId: AUTH_ACCOUNT_OWNER_SETUP_SURFACE_ID,
      type: "authContinuation",
    },
    kind: "authContinuation",
  };
}

function accountGateContractState(
  state: AuthAccountGateRouteState,
): AccountGateAuthSurfaceContract["state"] {
  if (state.status !== "blocked") return state.status;
  if (accountGateActionIsPending(state.action)) return "submitting";
  if (state.action?.kind === "gate-unavailable") return "failed";
  if (accountGateIsUnavailable(state.result.gate)) return "unavailable";
  return accountGateActions(state).length > 0 ? "ready" : "blocked";
}

function accountGateHeading(state: AuthAccountGateRouteState): string {
  if (state.status === "loading") return "Checking account";
  if (state.status === "failed") return "Account unavailable";
  if (state.status === "forbidden") return "Access unavailable";
  if (state.status === "complete" || state.status === "continuing") return "Account ready";
  return gateCopy(state.result.gate).heading;
}

function accountGateDescription(state: AuthAccountGateRouteState): string | undefined {
  if (state.status === "complete") return "Your account is ready to continue.";
  if (state.status === "continuing") return "Opening your approved destination.";
  if (state.status === "forbidden")
    return `Signed in as ${displaySafeText(state.result.principal.displayName)}.`;
  if (state.status === "blocked") return gateCopy(state.result.gate).message;
  return undefined;
}

function accountGateMessage(state: AuthAccountGateRouteState): AuthMessageContract | undefined {
  if (state.status === "loading") return authMessage("loading", "Loading account status.");
  if (state.status === "continuing") return authMessage("continuing", "Continuing...", "success");
  if (state.status === "forbidden")
    return authMessage(
      "forbidden",
      "This account cannot open the requested destination.",
      "warning",
    );
  if (state.status === "blocked" && accountGateIsUnavailable(state.result.gate))
    return authMessage("unavailable", accountGateUnavailableMessage(state.result.gate), "warning");
  return undefined;
}

function accountGateFeedback(
  state: AuthAccountGateRouteState,
  session: AuthAccountDraftSession,
): AuthFeedbackContract | undefined {
  if (state.status === "failed")
    return authFeedback("account-failure", "Account unavailable", state.message);
  if (state.status === "forbidden" && state.action?.kind === "logout-failed")
    return authFeedback("logout-failure", "Sign out failed", state.action.message);
  if (state.status === "blocked" && state.action?.kind === "gate-unavailable")
    return authFeedback("gate-failure", "Account step failed", state.action.message);
  if (
    state.status === "blocked" &&
    state.action?.kind === "email-verification-sent" &&
    state.action.message
  )
    return authFeedback("verification-failure", "Email verification failed", state.action.message);
  if (
    state.status === "blocked" &&
    state.result.gate.kind === "terms-acceptance" &&
    session.submitAttempted &&
    state.result.gate.policies.some(
      (policy) => !session.acceptedPolicyIds.includes(policy.accountPolicyId),
    )
  )
    return authFeedback(
      "policy-required",
      "Accept required policies",
      "Accept all required policies to continue.",
    );
  return undefined;
}

function accountGateContinuation(
  state: AuthAccountGateRouteState,
): AuthContinuationContract | undefined {
  if ((state.status !== "complete" && state.status !== "continuing") || !state.continueTo)
    return undefined;
  return authContinuation(AUTH_ACCOUNT_GATE_SURFACE_ID, state.result.target, state.continueTo);
}

function authAccountCreateFieldConfigs(state: AuthAccountRouteState): CreateFieldConfig[] {
  if (isOwnerSetupIdentityState(state))
    return accountDraftFieldConfigs.filter(
      (field) => field.fieldName === "displayName" || field.fieldName === "email",
    );
  if (isOwnerSetupEmailVerificationState(state))
    return accountDraftFieldConfigs.filter((field) => field.fieldName === "token");
  if (state.status === "blocked" && state.result.gate.kind === "email-verification") {
    const name =
      state.action?.kind === "email-verification-sent" ||
      state.action?.kind === "email-verification-verifying"
        ? "token"
        : "email";
    return accountDraftFieldConfigs.filter((field) => field.fieldName === name);
  }
  return [];
}

function authAccountProfileInputContract(
  state: AuthAccountRouteState,
): AccountCompletionGateOperationInputContract | undefined {
  return state.status === "blocked" && state.result.gate.kind === "profile-completion"
    ? state.result.gate.inputContract
    : undefined;
}

function authAccountDraftSeedValues(state: AuthAccountRouteState): Record<string, string> {
  if (isOwnerSetupState(state)) {
    return {
      ...("displayName" in state && state.displayName ? { displayName: state.displayName } : {}),
      ...("email" in state && state.email ? { email: state.email } : {}),
    };
  }
  if (state.status === "blocked" && state.result.gate.kind === "email-verification") {
    const email =
      state.action && "email" in state.action ? state.action.email : state.result.gate.displayEmail;
    return email ? { email } : {};
  }
  return {};
}

function authAccountDraftSessionKey(state: AuthAccountRouteState): string {
  if (isOwnerSetupState(state)) {
    const challengeId = "challengeId" in state ? state.challengeId : "identity";
    return `owner-setup:${challengeId}`;
  }
  if (state.status === "blocked") {
    const operationKey = state.result.gate.operation?.operationKey ?? "none";
    return `gate:${targetKey(state.result.target)}:${state.result.gate.kind}:${operationKey}`;
  }
  return `account:${state.status}`;
}

function targetKey(target: AccountCompletionGateTarget): string {
  return JSON.stringify([
    target.targetOrigin,
    target.routeId,
    target.targetProfile,
    target.access,
    target.selectedOrganization,
    target.returnTo,
  ]);
}

function isOwnerSetupState(
  state: AuthAccountRouteState,
): state is Extract<AuthAccountRouteState, { status: `owner-setup-${string}` }> {
  return state.status.startsWith("owner-setup-");
}

function isOwnerSetupIdentityState(
  state: AuthAccountRouteState,
): state is Extract<
  AuthAccountRouteState,
  { status: "owner-setup-email-sending" | "owner-setup-ready" }
> {
  return state.status === "owner-setup-ready" || state.status === "owner-setup-email-sending";
}

function isOwnerSetupEmailVerificationState(
  state: AuthAccountRouteState,
): state is Extract<
  AuthAccountRouteState,
  { status: "owner-setup-email-sent" | "owner-setup-email-verifying" }
> {
  return (
    state.status === "owner-setup-email-sent" || state.status === "owner-setup-email-verifying"
  );
}

function accountGateActionIsPending(
  action: Extract<AuthAccountRouteState, { status: "blocked" }>["action"],
): boolean {
  return (
    action?.kind === "email-verification-requesting" ||
    action?.kind === "email-verification-verifying" ||
    action?.kind === "gate-submitting" ||
    action?.kind === "profile-completion-submitting"
  );
}

function accountGateIsUnavailable(gate: AccountCompletionGate): boolean {
  return gate.kind === "profile-completion" && !profileCompletionIsAvailable(gate);
}

function profileCompletionIsAvailable(gate: AccountCompletionProfileCompletionGate): boolean {
  return Boolean(
    gate.operation &&
    gate.inputContract &&
    gate.inputContract.unsupportedRequiredFields.length === 0,
  );
}

function accountGateUnavailableMessage(gate: AccountCompletionGate): string {
  if (gate.kind === "profile-completion") {
    if (!gate.operation || !gate.inputContract)
      return "Profile completion operation is unavailable.";
    if (gate.inputContract.unsupportedRequiredFields.length > 0)
      return "Profile completion requires fields this form cannot render.";
  }
  return "This account step is unavailable.";
}

function authAction(
  surfaceId: string,
  purpose: "logout" | "retry" | "submit",
  label: string,
  prominence: ButtonContract["prominence"] = "primary",
  pending = false,
): AuthActionContract {
  const id = `${surfaceId}:action:${purpose}`;
  const control = authButton(
    `${id}:control`,
    pending ? pendingLabel(label) : label,
    prominence,
    purpose === "submit" ? "submit" : "button",
    { pending },
  );
  return {
    control,
    id,
    intent: { actionId: id, controlId: control.id, surfaceId, type: "authAction" },
    kind: "authAction",
    purpose,
  };
}

function authContinuation(
  surfaceId: string,
  target: AccountCompletionGateTarget,
  continueTo: string,
): AuthContinuationContract {
  const destinationId = `${surfaceId}:destination:account`;
  const control = authButton(`${destinationId}:control`, "Continue", "primary");
  return {
    control,
    destination: {
      detail: displaySafeText(continueTo),
      id: destinationId,
      kind: "authContinuationDestination",
      label: "Continue",
      ...(safeHttpOrigin(target.targetOrigin)
        ? { origin: safeHttpOrigin(target.targetOrigin) }
        : {}),
    },
    intent: { controlId: control.id, destinationId, surfaceId, type: "authContinuation" },
    kind: "authContinuation",
  };
}

function authFrame(title: string, description?: string) {
  return {
    accessibilityLabel: title,
    brand: { kind: "authBrand" as const, label: "Formless" },
    heading: { ...(description ? { description } : {}), kind: "authHeading" as const, title },
    kind: "authFrame" as const,
  };
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

function authMessage(
  id: string,
  title: string,
  severity: AuthMessageContract["severity"] = "info",
): AuthMessageContract {
  return {
    id: `auth:account:message:${id}`,
    kind: "authMessage",
    severity,
    title: displaySafeText(title),
  };
}

function authFeedback(id: string, title: string, detail: string): AuthFeedbackContract {
  return {
    detail: displaySafeText(detail),
    id: `auth:account:feedback:${id}`,
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
    ? { id: `auth:account:fact:${id}`, kind: "authFact", label, value: displaySafeText(value) }
    : undefined;
}

function compactFacts(...facts: Array<AuthFactContract | undefined>): AuthFactContract[] {
  return facts.filter(factIsPresent);
}

function factIsPresent(fact: AuthFactContract | undefined): fact is AuthFactContract {
  return fact !== undefined;
}

function safePolicyDestination(href: string | undefined, label: string) {
  if (!href) return undefined;
  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return {
      href: url.toString(),
      kind: "authPolicyDestination" as const,
      label: `Open ${displaySafeText(label)}`,
    };
  } catch {
    return undefined;
  }
}

function safeHttpOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

function operationLabel(operation: AccountCompletionGate["operation"]): string | undefined {
  return operation?.label ?? operation?.operationName ?? operation?.operationKey;
}

function gateCopy(gate: AccountCompletionGate): { heading: string; message: string } {
  switch (gate.kind) {
    case "email-verification":
      return {
        heading: "Verify email",
        message: "Email verification is required before continuing.",
      };
    case "credential":
      return {
        heading: "Create credential",
        message: "A passkey credential is required before continuing.",
      };
    case "invitation":
      return {
        heading: "Accept invitation",
        message: "An invitation must be accepted before continuing.",
      };
    case "profile-completion":
      return {
        heading: "Complete profile",
        message: "Profile information is required before continuing.",
      };
    case "terms-acceptance":
      return {
        heading: "Accept terms",
        message: "Required account policies must be accepted before continuing.",
      };
  }
}

function targetProfileLabel(value: AccountCompletionGateTarget["targetProfile"]): string {
  if (value === "public-site") return "Public Site";
  return titleCase(value) ?? value;
}

function titleCase(value: string | undefined): string | undefined {
  return value
    ?.split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function createTextField(
  fieldName: string,
  label: string,
  required: boolean,
  format?: "email",
): CreateFieldConfig {
  return {
    editor: "text",
    field: { ...(format ? { format } : {}), label, required, type: "text" },
    fieldName,
  };
}

function stringFieldValue(value: FieldValue | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function pendingLabel(label: string): string {
  if (label === "Send verification email") return "Sending...";
  if (label === "Verify email") return "Verifying...";
  if (label === "Accept terms") return "Accepting...";
  if (label === "Complete profile") return "Saving...";
  if (label === "Register for app") return "Registering...";
  return label;
}
