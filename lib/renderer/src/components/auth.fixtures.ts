import type {
  AccountGateAuthSurfaceContract,
  AccountGateKind,
  AuthActionContract,
  AuthFieldContract,
  AuthMessageContract,
  AuthPasskeyContract,
  AuthPolicyContract,
  AuthSurfaceBaseContract,
  AuthSurfaceContract,
  ButtonContract,
  CollaboratorInvitationAuthSurfaceContract,
  CreateFieldContract,
  OperationInputFieldContract,
  OwnerSetupAuthSurfaceContract,
  OwnerSetupStep,
  AccountSignInAuthSurfaceContract,
  SignupAuthSurfaceContract,
  SignupStep,
} from "@dpeek/formless-presentation/contract";

export type FormlessAuthFixture = {
  family: string;
  id: string;
  label: string;
  surface: AuthSurfaceContract;
};

export type FormlessAuthFixtureId = FormlessAuthFixture["id"];

export function createFormlessAuthFixtures(): FormlessAuthFixture[] {
  return [
    ...ownerSetupFixtures(),
    ...accountSignInFixtures(),
    ...accountGateFixtures(),
    ...signupFixtures(),
    ...invitationFixtures(),
  ];
}

function ownerSetupFixtures(): FormlessAuthFixture[] {
  return [
    ownerSetupFixture("loading", {
      message: authMessage("loading", "Checking setup status."),
    }),
    ownerSetupFixture("invalid", {
      message: authMessage("invalid", "This setup link is unavailable.", "danger"),
    }),
    ownerSetupFixture(
      "ready",
      {
        actions: [authAction("owner-setup:identity:ready", "submit", "Send verification email")],
        fields: ownerIdentityFields("owner-setup:identity:ready"),
      },
      "identity",
    ),
    ownerSetupFixture(
      "submitting",
      {
        actions: [
          authAction(
            "owner-setup:identity:submitting",
            "submit",
            "Sending verification email",
            "primary",
            true,
          ),
        ],
        fields: ownerIdentityFields("owner-setup:identity:submitting"),
        pending: true,
      },
      "identity",
    ),
    ownerSetupFixture(
      "ready",
      {
        actions: [authAction("owner-setup:email-verification:ready", "submit", "Verify email")],
        facts: [authFact("email", "Primary email", "ada@example.com")],
        fields: [
          authCreateField({
            autocomplete: "one-time-code",
            fieldName: "token",
            label: "Verification token",
            purpose: "verification-token",
            required: true,
            surfaceId: "owner-setup:email-verification:ready",
          }),
        ],
      },
      "email-verification",
    ),
    ownerSetupFixture(
      "submitting",
      {
        actions: [
          authAction(
            "owner-setup:email-verification:submitting",
            "submit",
            "Verifying email",
            "primary",
            true,
          ),
        ],
        facts: [authFact("email", "Primary email", "ada@example.com")],
        fields: [
          authCreateField({
            autocomplete: "one-time-code",
            fieldName: "token",
            label: "Verification token",
            purpose: "verification-token",
            required: true,
            surfaceId: "owner-setup:email-verification:submitting",
          }),
        ],
        pending: true,
      },
      "email-verification",
    ),
    ownerSetupFixture(
      "ready",
      {
        facts: [authFact("email", "Verified primary email", "ada@example.com")],
        passkey: availablePasskey("owner-setup:passkey:ready", "create", "Create owner passkey"),
      },
      "passkey",
    ),
    ownerSetupFixture(
      "submitting",
      {
        facts: [authFact("email", "Verified primary email", "ada@example.com")],
        passkey: availablePasskey(
          "owner-setup:passkey:submitting",
          "create",
          "Creating owner passkey",
          true,
        ),
        pending: true,
      },
      "passkey",
    ),
    ownerSetupFixture(
      "passkey-unavailable",
      {
        message: authMessage(
          "passkey-unavailable",
          "This browser does not support passkeys.",
          "warning",
        ),
        passkey: unavailablePasskey(
          "owner-setup:passkey-unavailable",
          "create",
          "This browser does not support passkeys.",
        ),
      },
      "passkey",
    ),
    ownerSetupFixture(
      "failed",
      {
        actions: [authAction("owner-setup:completion:failed", "retry", "Try owner setup again")],
        feedback: authFeedback("setup-failed", "Owner activation failed"),
        facts: [authFact("email", "Verified primary email", "ada@example.com")],
      },
      "completion",
    ),
    ownerSetupFixture(
      "submitting",
      {
        facts: [authFact("email", "Verified primary email", "ada@example.com")],
        pending: true,
      },
      "completion",
    ),
    ownerSetupFixture("already-complete", {
      continuation: authContinuation("owner-setup:already-complete", "Instance administration"),
      facts: [authFact("owner", "Owner", "Ada Lovelace")],
      message: authMessage("already-complete", "Owner setup is already complete.", "success"),
    }),
    ownerSetupFixture(
      "complete",
      {
        continuation: authContinuation("owner-setup:complete", "Instance administration"),
        facts: [authFact("owner", "Owner", "Ada Lovelace")],
        message: authMessage("complete", "Owner setup is complete.", "success"),
      },
      "completion",
    ),
    ownerSetupFixture(
      "continuing",
      {
        facts: [authFact("owner", "Owner", "Ada Lovelace")],
        message: authMessage("continuing", "Opening the approved destination.", "success"),
        pending: true,
      },
      "completion",
    ),
  ];
}

function accountSignInFixtures(): FormlessAuthFixture[] {
  return [
    accountSignInFixture("loading", {
      message: authMessage("loading", "Checking account session."),
    }),
    accountSignInFixture("incomplete", {
      message: authMessage("incomplete", "Complete owner setup before signing in.", "warning"),
    }),
    accountSignInFixture("ready", {
      passkey: availablePasskey("account-sign-in:ready", "sign-in", "Sign in with passkey"),
    }),
    accountSignInFixture("submitting", {
      passkey: availablePasskey("account-sign-in:submitting", "sign-in", "Signing in", true),
      pending: true,
    }),
    accountSignInFixture("passkey-unavailable", {
      message: authMessage(
        "passkey-unavailable",
        "This browser does not support passkeys.",
        "warning",
      ),
      passkey: unavailablePasskey(
        "account-sign-in:passkey-unavailable",
        "sign-in",
        "This browser does not support passkeys.",
      ),
    }),
    accountSignInFixture("failed", {
      actions: [authAction("account-sign-in:failed", "retry", "Try again")],
      feedback: authFeedback("sign-in-failed", "Account sign in failed"),
    }),
    accountSignInFixture("complete", {
      actions: [authAction("account-sign-in:complete", "logout", "Sign out", "secondary")],
      continuation: authContinuation("account-sign-in:complete", "Approved account destination"),
      facts: [authFact("principal", "Account", "Ada Lovelace")],
      message: authMessage("complete", "Signed in.", "success"),
    }),
    accountSignInFixture("logout-pending", {
      actions: [
        authAction("account-sign-in:logout-pending", "logout", "Signing out", "secondary", true),
      ],
      facts: [authFact("principal", "Account", "Ada Lovelace")],
      pending: true,
    }),
    accountSignInFixture("continuing", {
      facts: [authFact("principal", "Account", "Ada Lovelace")],
      message: authMessage("continuing", "Opening the approved destination.", "success"),
      pending: true,
    }),
  ];
}

function accountGateFixtures(): FormlessAuthFixture[] {
  return [
    accountTerminalFixture("loading", {
      message: authMessage("loading", "Checking account requirements."),
    }),
    accountGateFixture("email-verification", "ready", {
      actions: [authAction("account-gate:email-verification:ready", "submit", "Verify email")],
      fields: [
        authCreateField({
          autocomplete: "one-time-code",
          fieldName: "verificationToken",
          label: "Verification token",
          purpose: "verification-token",
          required: true,
          surfaceId: "account-gate:email-verification:ready",
        }),
      ],
    }),
    accountGateFixture("email-verification", "submitting", {
      actions: [
        authAction(
          "account-gate:email-verification:submitting",
          "submit",
          "Verifying email",
          "primary",
          true,
        ),
      ],
      fields: [
        authCreateField({
          autocomplete: "one-time-code",
          fieldName: "verificationToken",
          label: "Verification token",
          purpose: "verification-token",
          required: true,
          surfaceId: "account-gate:email-verification:submitting",
        }),
      ],
      pending: true,
    }),
    accountGateFixture("credential", "blocked", {
      message: authMessage("credential", "A credential is required to continue.", "warning"),
    }),
    accountGateFixture("invitation", "blocked", {
      message: authMessage("invitation", "An accepted invitation is required.", "warning"),
    }),
    accountGateFixture("profile-completion", "ready", {
      actions: [authAction("account-gate:profile-completion:ready", "submit", "Complete profile")],
      fields: [
        authOperationField({
          inputName: "displayName",
          label: "Display name",
          surfaceId: "account-gate:profile-completion:ready",
          value: "Ada Lovelace",
        }),
      ],
    }),
    accountGateFixture("terms-acceptance", "ready", {
      actions: [authAction("account-gate:terms-acceptance:ready", "submit", "Accept terms")],
      policies: [authPolicy("account-gate:terms-acceptance:ready")],
    }),
    accountGateFixture("role-review", "blocked", {
      facts: [authFact("role", "Required role", "Editor")],
      message: authMessage("role-review", "Role approval is required.", "warning"),
    }),
    accountTerminalFixture("failed", {
      actions: [authAction("account-gate:failed", "retry", "Try again")],
      feedback: authFeedback("account-failed", "Account requirements could not be loaded"),
    }),
    accountTerminalFixture("forbidden", {
      actions: [authAction("account-gate:forbidden", "logout", "Sign out", "secondary")],
      facts: [authFact("principal", "Account", "Ada App User")],
      message: authMessage(
        "forbidden",
        "This account cannot open the requested destination.",
        "warning",
      ),
    }),
    accountTerminalFixture("complete", {
      continuation: authContinuation("account-gate:complete", "Approved destination"),
      message: authMessage("complete", "Account requirements are complete.", "success"),
    }),
    accountTerminalFixture("continuing", {
      message: authMessage("continuing", "Opening the approved destination.", "success"),
      pending: true,
    }),
  ];
}

function signupFixtures(): FormlessAuthFixture[] {
  return [
    signupFixture("identity", "ready", {
      actions: [authAction("signup:identity:ready", "submit", "Send verification email")],
      fields: signupIdentityFields("signup:identity:ready"),
    }),
    signupFixture("identity", "submitting", {
      actions: [
        authAction(
          "signup:identity:submitting",
          "submit",
          "Sending verification email",
          "primary",
          true,
        ),
      ],
      fields: signupIdentityFields("signup:identity:submitting"),
      pending: true,
    }),
    signupFixture("identity", "failed", {
      actions: [authAction("signup:identity:failed", "submit", "Try again")],
      feedback: authFeedback("signup-identity-failed", "Account details could not be submitted"),
      fields: signupIdentityFields("signup:identity:failed"),
    }),
    signupFixture("email-verification", "ready", {
      actions: [authAction("signup:email-verification:ready", "submit", "Verify email")],
      facts: [authFact("email", "Email", "ada@example.com")],
      fields: [
        authCreateField({
          autocomplete: "one-time-code",
          fieldName: "verificationToken",
          label: "Verification token",
          purpose: "verification-token",
          required: true,
          surfaceId: "signup:email-verification:ready",
        }),
      ],
    }),
    signupFixture("email-verification", "submitting", {
      actions: [
        authAction(
          "signup:email-verification:submitting",
          "submit",
          "Verifying email",
          "primary",
          true,
        ),
      ],
      facts: [authFact("email", "Email", "ada@example.com")],
      fields: [
        authCreateField({
          autocomplete: "one-time-code",
          fieldName: "verificationToken",
          label: "Verification token",
          purpose: "verification-token",
          required: true,
          surfaceId: "signup:email-verification:submitting",
        }),
      ],
      pending: true,
    }),
    signupFixture("email-verification", "failed", {
      actions: [authAction("signup:email-verification:failed", "submit", "Try again")],
      facts: [authFact("email", "Email", "ada@example.com")],
      feedback: authFeedback("signup-verification-failed", "Email verification failed"),
      fields: [
        authCreateField({
          autocomplete: "one-time-code",
          fieldName: "verificationToken",
          label: "Verification token",
          purpose: "verification-token",
          required: true,
          surfaceId: "signup:email-verification:failed",
        }),
      ],
    }),
    signupFixture("passkey", "ready", {
      passkey: availablePasskey("signup:passkey:ready", "create", "Create passkey"),
    }),
    signupFixture("passkey", "submitting", {
      passkey: availablePasskey("signup:passkey:submitting", "create", "Creating passkey", true),
      pending: true,
    }),
    signupFixture("passkey", "passkey-unavailable", {
      message: authMessage(
        "passkey-unavailable",
        "This browser does not support passkeys.",
        "warning",
      ),
      passkey: unavailablePasskey(
        "signup:passkey:passkey-unavailable",
        "create",
        "This browser does not support passkeys.",
      ),
    }),
    signupFixture("passkey", "failed", {
      feedback: authFeedback("signup-passkey-failed", "Passkey creation failed"),
      passkey: availablePasskey("signup:passkey:failed", "create", "Try again"),
    }),
    signupFixture("passkey", "complete", {
      continuation: authContinuation("signup:passkey:complete", "Approved destination"),
      message: authMessage("complete", "Account setup is complete.", "success"),
    }),
    signupFixture("passkey", "continuing", {
      message: authMessage("continuing", "Opening the approved destination.", "success"),
      pending: true,
    }),
  ];
}

function invitationFixtures(): FormlessAuthFixture[] {
  const eligibilityFacts = [
    authFact("email", "Email", "ada@example.com"),
    authFact("surface", "Surface", "Directory"),
    authFact("name", "Name", "Ada Lovelace"),
    authFact("expiry", "Expires", "2030-01-02T03:04:05Z"),
  ];
  const acceptedFacts = [
    authFact("principal", "Signed in as", "Ada Lovelace"),
    authFact("session-expiry", "Session expires", "2030-01-02T04:04:05Z"),
    authFact("target-origin", "Continue to", "https://directory.example.test"),
  ];

  return [
    invitationFixture("loading", {
      message: authMessage("loading", "Checking invitation status."),
    }),
    invitationFixture("invalid-link", {
      message: authMessage("invalid-link", "This invitation link is invalid.", "danger"),
    }),
    invitationFixture("unavailable", {
      message: authMessage("unavailable", "This invitation is unavailable.", "danger"),
    }),
    invitationFixture("eligible", {
      facts: eligibilityFacts,
      passkey: availablePasskey(
        "collaborator-invitation-acceptance:eligible",
        "accept-invitation",
        "Create passkey and accept",
      ),
    }),
    invitationFixture("submitting", {
      facts: eligibilityFacts,
      passkey: availablePasskey(
        "collaborator-invitation-acceptance:submitting",
        "accept-invitation",
        "Creating passkey",
        true,
      ),
      pending: true,
    }),
    invitationFixture("passkey-unavailable", {
      facts: eligibilityFacts,
      message: authMessage(
        "passkey-unavailable",
        "This browser does not support passkeys.",
        "warning",
      ),
      passkey: unavailablePasskey(
        "collaborator-invitation-acceptance:passkey-unavailable",
        "accept-invitation",
        "This browser does not support passkeys.",
      ),
    }),
    invitationFixture("failed", {
      feedback: authFeedback("invitation-failed", "Invitation acceptance failed"),
    }),
    invitationFixture("accepted", {
      facts: acceptedFacts,
      message: authMessage("accepted", "Invitation accepted.", "success"),
    }),
    invitationFixture("continuing", {
      continuation: authContinuation(
        "collaborator-invitation-acceptance:continuing",
        "Approved invitation destination",
      ),
      facts: acceptedFacts,
      message: authMessage("continuing", "Opening the approved destination.", "success"),
    }),
  ];
}

function ownerSetupFixture(
  state: OwnerSetupAuthSurfaceContract["state"],
  overrides: Partial<AuthSurfaceBaseContract> = {},
  step?: OwnerSetupStep,
): FormlessAuthFixture {
  const suffix = `owner-setup:${step ? `${step}:` : ""}${state}`;
  return fixture("Owner setup", stateLabel(state), {
    ...authSurface(suffix, ownerSetupHeading(state)),
    ...overrides,
    state,
    ...(step ? { step } : {}),
    surfaceKind: "owner-setup",
  });
}

function accountSignInFixture(
  state: AccountSignInAuthSurfaceContract["state"],
  overrides: Partial<AuthSurfaceBaseContract> = {},
): FormlessAuthFixture {
  const suffix = `account-sign-in:${state}`;
  return fixture("Account sign in", stateLabel(state), {
    ...authSurface(suffix, accountSignInHeading(state)),
    ...overrides,
    state,
    surfaceKind: "account-sign-in",
  });
}

function accountGateFixture(
  gateKind: AccountGateKind,
  state: Exclude<
    AccountGateAuthSurfaceContract["state"],
    "complete" | "continuing" | "failed" | "forbidden" | "loading"
  >,
  overrides: Partial<AuthSurfaceBaseContract> = {},
): FormlessAuthFixture {
  const suffix = `account-gate:${gateKind}:${state}`;
  return fixture("Account gate", `${gateLabel(gateKind)} · ${stateLabel(state)}`, {
    ...authSurface(suffix, gateLabel(gateKind)),
    ...overrides,
    gateKind,
    state,
    surfaceKind: "account-gate",
  });
}

function accountTerminalFixture(
  state: "complete" | "continuing" | "failed" | "forbidden" | "loading",
  overrides: Partial<AuthSurfaceBaseContract> = {},
): FormlessAuthFixture {
  const suffix = `account-gate:${state}`;
  return fixture("Account gate", stateLabel(state), {
    ...authSurface(
      suffix,
      state === "loading"
        ? "Checking account"
        : state === "forbidden"
          ? "Access unavailable"
          : "Account ready",
    ),
    ...overrides,
    state,
    surfaceKind: "account-gate",
  });
}

function signupFixture(
  step: SignupStep,
  state: Exclude<SignupAuthSurfaceContract["state"], "loading">,
  overrides: Partial<AuthSurfaceBaseContract> = {},
): FormlessAuthFixture {
  const suffix = `signup:${step}:${state}`;
  return fixture("Signup", `${stepLabel(step)} · ${stateLabel(state)}`, {
    ...authSurface(suffix, signupHeading(step, state)),
    ...overrides,
    state,
    step,
    surfaceKind: "signup",
  });
}

function invitationFixture(
  state: CollaboratorInvitationAuthSurfaceContract["state"],
  overrides: Partial<AuthSurfaceBaseContract> = {},
): FormlessAuthFixture {
  const suffix = `collaborator-invitation-acceptance:${state}`;
  return fixture("Invitation", stateLabel(state), {
    ...authSurface(suffix, invitationHeading(state)),
    ...overrides,
    state,
    surfaceKind: "collaborator-invitation-acceptance",
  });
}

function fixture(family: string, label: string, surface: AuthSurfaceContract): FormlessAuthFixture {
  return { family, id: surface.id.replace(/^auth:fixture:/, ""), label, surface };
}

function authSurface(idSuffix: string, title: string): AuthSurfaceBaseContract {
  return {
    actions: [],
    facts: [],
    fields: [],
    frame: {
      accessibilityLabel: `${title} authentication`,
      brand: { kind: "authBrand", label: "Formless" },
      heading: { kind: "authHeading", title },
      kind: "authFrame",
    },
    id: `auth:fixture:${idSuffix}`,
    kind: "authSurface",
    pending: false,
    policies: [],
  };
}

function ownerIdentityFields(idSuffix: string) {
  return [
    authCreateField({
      autocomplete: "name",
      fieldName: "displayName",
      label: "Display name",
      purpose: "display-name",
      required: true,
      surfaceId: idSuffix,
      value: "Ada Lovelace",
    }),
    authCreateField({
      autocomplete: "email",
      fieldName: "email",
      label: "Email",
      purpose: "email",
      required: true,
      surfaceId: idSuffix,
      value: "ada@example.com",
    }),
  ];
}

function signupIdentityFields(idSuffix: string) {
  return [
    authCreateField({
      autocomplete: "name",
      fieldName: "displayName",
      label: "Display name",
      purpose: "display-name",
      required: true,
      surfaceId: idSuffix,
      value: "Ada Lovelace",
    }),
    authCreateField({
      autocomplete: "email",
      fieldName: "email",
      label: "Email",
      purpose: "email",
      required: true,
      surfaceId: idSuffix,
      value: "ada@example.com",
    }),
  ];
}

function authCreateField({
  autocomplete,
  fieldName,
  label,
  purpose,
  required = false,
  surfaceId: idSuffix,
  value = "",
}: {
  autocomplete: AuthFieldContract["autocomplete"];
  fieldName: string;
  label: string;
  purpose: "display-name" | "email" | "verification-token";
  required?: boolean;
  surfaceId: string;
  value?: string;
}): AuthFieldContract {
  const surfaceId = `auth:fixture:${idSuffix}`;
  const field = createTextField(surfaceId, fieldName, label, value, required);
  return {
    autocomplete,
    field,
    intent: { fieldId: field.fieldId, surfaceId, type: "authField" },
    kind: "authField",
    purpose,
  };
}

function authOperationField({
  inputName,
  label,
  surfaceId: idSuffix,
  value,
}: {
  inputName: string;
  label: string;
  surfaceId: string;
  value: string;
}): AuthFieldContract {
  const surfaceId = `auth:fixture:${idSuffix}`;
  const createField = createTextField(surfaceId, inputName, label, value, true);
  const field: OperationInputFieldContract = {
    ...createField,
    input: { control: "text", label, name: inputName, required: true },
    inputName,
    surface: "operation",
  };
  return {
    autocomplete: "name",
    field,
    intent: { fieldId: field.fieldId, surfaceId, type: "authField" },
    kind: "authField",
    purpose: "profile-input",
  };
}

function createTextField(
  surfaceId: string,
  fieldName: string,
  label: string,
  value: string,
  required: boolean,
): CreateFieldContract {
  const field = { label, required, type: "text" as const };
  return {
    access: { canPatch: true, kind: "editable", writable: true },
    commit: "submit",
    control: {
      control: { inputType: "text", kind: "input" },
      controlKind: "text",
      createDefaultChecked: false,
      createDefaultValue: undefined,
      editor: "text",
      field,
      inputAttributes: {},
      kind: "text",
      label,
      required,
    },
    density: "default",
    draftInput: { kind: "input", value },
    editor: "text",
    field,
    fieldId: `${surfaceId}:field:${fieldName}`,
    fieldName,
    label,
    labelVisibility: "visible",
    mode: "editor",
    required,
    surface: "create",
    value,
  };
}

function authPolicy(idSuffix: string): AuthPolicyContract {
  const surfaceId = `auth:fixture:${idSuffix}`;
  return {
    accepted: false,
    description: "Required to continue.",
    id: `${surfaceId}:policy:terms`,
    kind: "authPolicy",
    label: "Accept the current terms",
    required: true,
    selectionIntent: {
      accepted: true,
      policyId: `${surfaceId}:policy:terms`,
      surfaceId,
      type: "authPolicySelection",
    },
  };
}

function authAction(
  idSuffix: string,
  purpose: AuthActionContract["purpose"],
  label: string,
  prominence: ButtonContract["prominence"] = "primary",
  pending = false,
): AuthActionContract {
  const surfaceId = `auth:fixture:${idSuffix}`;
  const id = `${surfaceId}:action:${purpose}`;
  const control = authButton(
    `${id}:control`,
    label,
    prominence,
    purpose === "submit" ? "submit" : "button",
    pending,
  );
  return {
    control,
    id,
    intent: { actionId: id, controlId: control.id, surfaceId, type: "authAction" },
    kind: "authAction",
    purpose,
  };
}
function availablePasskey(
  idSuffix: string,
  purpose: Extract<
    AuthPasskeyContract,
    {
      availability: "available";
    }
  >["purpose"],
  label: string,
  pending = false,
): AuthPasskeyContract {
  const surfaceId = `auth:fixture:${idSuffix}`;
  const id = `${surfaceId}:passkey:${purpose}`;
  const control = authButton(`${id}:control`, label, "primary", "submit", pending);
  return {
    availability: "available",
    control,
    id,
    intent: { controlId: control.id, passkeyId: id, surfaceId, type: "authPasskey" },
    kind: "authPasskey",
    purpose,
  };
}

function unavailablePasskey(
  idSuffix: string,
  purpose: AuthPasskeyContract["purpose"],
  unavailableReason: string,
): AuthPasskeyContract {
  return {
    availability: "unavailable",
    id: `auth:fixture:${idSuffix}:passkey:${purpose}`,
    kind: "authPasskey",
    purpose,
    unavailableReason,
  };
}

function authContinuation(idSuffix: string, label: string) {
  const surfaceId = `auth:fixture:${idSuffix}`;
  const destinationId = `${surfaceId}:destination:approved`;
  const control = authButton(`${destinationId}:control`, "Continue", "primary", "button");
  return {
    control,
    destination: {
      detail: "Open the destination approved by the auth runtime.",
      id: destinationId,
      kind: "authContinuationDestination" as const,
      label,
    },
    intent: {
      controlId: control.id,
      destinationId,
      surfaceId,
      type: "authContinuation" as const,
    },
    kind: "authContinuation" as const,
  };
}

function authButton(
  id: string,
  label: string,
  prominence: ButtonContract["prominence"],
  type: ButtonContract["type"],
  pending = false,
): ButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    id,
    kind: "button",
    ...(pending ? { pending: { isPending: true, label } } : {}),
    prominence,
    type,
  };
}

function authMessage(
  id: string,
  title: string,
  severity: AuthMessageContract["severity"] = "info",
): AuthMessageContract {
  return { id: `message:${id}`, kind: "authMessage", severity, title };
}

function authFeedback(id: string, title: string) {
  return {
    id: `feedback:${id}`,
    kind: "authFeedback" as const,
    severity: "danger" as const,
    title,
  };
}

function authFact(id: string, label: string, value: string) {
  return { id: `fact:${id}`, kind: "authFact" as const, label, value };
}

function ownerSetupHeading(state: OwnerSetupAuthSurfaceContract["state"]) {
  if (state === "ready" || state === "submitting" || state === "failed")
    return "Claim this instance";
  if (state === "passkey-unavailable") return "Passkeys are unavailable";
  if (state === "already-complete" || state === "complete" || state === "continuing")
    return "Owner setup complete";
  return "Check owner setup";
}

function accountSignInHeading(state: AccountSignInAuthSurfaceContract["state"]) {
  if (state === "complete" || state === "continuing" || state === "logout-pending")
    return "Signed in";
  if (state === "passkey-unavailable") return "Passkeys are unavailable";
  return "Account sign in";
}

function signupHeading(
  step: SignupStep,
  state: Exclude<SignupAuthSurfaceContract["state"], "loading">,
) {
  if (state === "complete" || state === "continuing") return "Account ready";
  if (state === "passkey-unavailable") return "Passkeys are unavailable";
  if (step === "identity") return "Create account";
  if (step === "email-verification") return "Verify email";
  return "Create passkey";
}

function invitationHeading(state: CollaboratorInvitationAuthSurfaceContract["state"]) {
  if (state === "accepted" || state === "continuing") return "Invitation accepted";
  if (state === "eligible" || state === "submitting") return "Invitation ready";
  if (state === "loading") return "Checking invitation";
  if (state === "passkey-unavailable") return "Passkeys are unavailable";
  return "Invitation unavailable";
}

function gateLabel(gateKind: AccountGateKind) {
  return gateKind
    .split("-")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function stepLabel(step: SignupStep) {
  if (step === "identity") return "Identity";
  return step === "email-verification" ? "Email Verification" : "Passkey";
}

function stateLabel(state: string) {
  return state
    .split("-")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}
