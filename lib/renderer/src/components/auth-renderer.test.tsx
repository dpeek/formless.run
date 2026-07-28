// @vitest-environment jsdom

import { act, fireEvent, render, within, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  AccountGateAuthSurfaceContract,
  AuthActionContract,
  AuthFieldContract,
  AuthIntent,
  AuthPolicyContract,
  AuthSurfaceBaseContract,
  AuthSurfaceContract,
  ButtonContract,
  CollaboratorInvitationAuthSurfaceContract,
  CreateFieldContract,
  OperationInputFieldContract,
  OwnerSetupAuthSurfaceContract,
  AccountSignInAuthSurfaceContract,
  SignupAuthSurfaceContract,
} from "@dpeek/formless-presentation/contract";
import {
  createMemoryPresentationHost,
  authSurfaceReference,
} from "@dpeek/formless-presentation/host";
import { PresentationHostProvider } from "@dpeek/formless-presentation/host/react";
import {
  AstryxAuthRenderer,
  AstryxSubscribedAuthRenderer,
  dispatchAstryxAuthFieldIntent,
} from "./auth-renderer.tsx";
(
  globalThis as {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;
const accountSignInReference = authSurfaceReference({
  surfaceId: "auth:test:account-sign-in",
  surfaceKind: "account-sign-in",
});

describe("Astryx auth renderer", () => {
  it.each([
    ["loading", accountSignInSurface("loading", authMessage("Loading account", "info"))],
    ["blocked", accountGateSurface("blocked", authMessage("Account blocked", "warning"))],
    [
      "forbidden",
      accountTerminalSurface("forbidden", authMessage("Access unavailable", "warning")),
    ],
    ["unavailable", invitationSurface("unavailable", authMessage("Invite unavailable", "warning"))],
    ["failed", signupSurface("failed", authMessage("Signup failed", "danger"))],
    ["complete", ownerSetupSurface("complete", authMessage("Setup complete", "success"))],
    ["continuing", accountSignInSurface("continuing", authMessage("Continuing", "info"))],
  ] satisfies readonly [string, AuthSurfaceContract][])(
    "renders the accessible %s frame, card, and status hierarchy",
    (state, surface) => {
      const html = renderAuth(surface);

      expect(html).toContain(`aria-label="${surface.frame.accessibilityLabel}"`);
      expect(html).toContain(`data-formless-astryx-auth-surface-state="${state}"`);
      expect(html).toContain(`data-formless-astryx-auth-card="${surface.id}"`);
      expect(html).toContain("<h1");
      expect(html).toContain(`id="${surface.id}:heading"`);
      expect(html).toContain(surface.frame.brand.label);
      expect(html).toContain(surface.frame.heading.title);
      expect(html).toContain(surface.message?.title);
      expect(html).not.toContain("Choose destination");
      expect(html).not.toContain("Decline invitation");

      if (state === "loading") {
        expect(html).toContain(`data-formless-astryx-auth-loading="${surface.id}"`);
        expect(html).toContain('role="status"');
      }

      if (surface.message?.severity === "danger" || surface.message?.severity === "warning") {
        expect(html).toContain('role="alert"');
      }
    },
  );

  it("renders forbidden account identity and logout without protected target data", () => {
    const html = renderAuth(
      accountTerminalSurface(
        "forbidden",
        authMessage("This account cannot open the requested destination.", "warning"),
        {
          actions: [authAction("auth:test:account-gate", "logout", "Sign out")],
          facts: [authFact("account", "Account", "Ada App User")],
        },
      ),
    );

    expect(html).toContain("Access unavailable");
    expect(html).toContain("Ada App User");
    expect(html).toContain("Sign out");
    expect(html).toContain('data-formless-astryx-auth-control-kind="action"');
    expect(html).not.toContain("route:private");
    expect(html).not.toContain("app:private");
    expect(html).not.toContain("principal:other");
  });

  it("composes controlled opaque-token, policy, fact, feedback, action, and passkey primitives", () => {
    const tokenSurface = signupSurface("ready", authMessage("Enter the token", "info"), {
      actions: [authAction("auth:test:signup", "submit", "Verify")],
      facts: [authFact("email", "Email", "ada@example.com")],
      feedback: {
        detail: "Paste the complete value.",
        id: "feedback:token",
        kind: "authFeedback",
        severity: "danger",
        title: "Token invalid",
      },
      fields: [authCreateField("auth:test:signup", verificationTokenField())],
      policies: [termsPolicy("auth:test:signup")],
    });
    const passkeySurface = accountSignInSurface("ready", undefined, {
      passkey: availablePasskey(accountSignInReference.surfaceId),
    });
    const unavailableSurface = accountSignInSurface(
      "passkey-unavailable",
      authMessage("Passkeys unavailable", "warning"),
      {
        passkey: {
          availability: "unavailable",
          id: "passkey:unavailable",
          kind: "authPasskey",
          purpose: "sign-in",
          unavailableReason: "This browser does not support passkeys.",
        },
      },
    );
    const tokenHtml = renderAuth(tokenSurface);
    const passkeyHtml = renderAuth(passkeySurface);
    const unavailableHtml = renderAuth(unavailableSurface);

    expect(tokenHtml).toContain('data-formless-astryx-auth-field="field:verification-token"');
    expect(tokenHtml).toMatch(/auto[Cc]omplete="one-time-code"/);
    expect(tokenHtml).toContain('value="opaque-base64url-value"');
    expect(tokenHtml).toContain('data-formless-astryx-auth-policy="policy:terms"');
    expect(tokenHtml).toContain('href="/runtime-policy/terms"');
    expect(tokenHtml).toContain('data-formless-astryx-auth-facts="auth:test:signup"');
    expect(tokenHtml).toContain("ada@example.com");
    expect(tokenHtml).toContain('data-formless-astryx-auth-status="feedback:token"');
    expect(tokenHtml).toContain('data-formless-astryx-auth-control-kind="action"');
    expect(passkeyHtml).toContain('data-formless-astryx-auth-control-kind="passkey"');
    expect(unavailableHtml).toContain('data-formless-astryx-auth-passkey="passkey:unavailable"');
    expect(unavailableHtml).toContain("This browser does not support passkeys.");
    expect(unavailableHtml).not.toContain("Passkeys unavailable");
    expect(unavailableHtml).not.toContain('data-formless-astryx-auth-control-kind="passkey"');
    expect(`${tokenHtml}${passkeyHtml}${unavailableHtml}`).not.toContain("raw-invitation-token");
    expect(`${tokenHtml}${passkeyHtml}${unavailableHtml}`).not.toContain("central-session-secret");
  });

  it("renders the complete verified-email owner setup sequence through the common auth surface", () => {
    const surfaceId = "auth:test:owner-setup";
    const identity = ownerSetupSurface("ready", undefined, {
      actions: [authAction(surfaceId, "submit", "Send verification email")],
      step: "identity",
    });
    const emailVerification = ownerSetupSurface("ready", undefined, {
      actions: [authAction(surfaceId, "submit", "Verify email")],
      fields: [authCreateField(surfaceId, verificationTokenField())],
      step: "email-verification",
    });
    const passkey = ownerSetupSurface("ready", undefined, {
      passkey: availablePasskey(surfaceId, "create"),
      step: "passkey",
    });
    const completionRetry = ownerSetupSurface(
      "failed",
      authMessage("Activation failed", "danger"),
      {
        actions: [authAction(surfaceId, "retry", "Try owner setup again")],
        step: "completion",
      },
    );
    const complete = ownerSetupSurface("complete", authMessage("Owner setup complete", "success"), {
      continuation: authContinuation(surfaceId),
      step: "completion",
    });

    const identityHtml = renderAuth(identity);
    const emailHtml = renderAuth(emailVerification);
    const passkeyHtml = renderAuth(passkey);
    const retryHtml = renderAuth(completionRetry);
    const completeHtml = renderAuth(complete);

    expect(identityHtml).toContain('data-formless-astryx-auth-surface-step="identity"');
    expect(identityHtml).toContain("Send verification email");
    expect(emailHtml).toContain('data-formless-astryx-auth-surface-step="email-verification"');
    expect(emailHtml).toContain("Verification token");
    expect(passkeyHtml).toContain('data-formless-astryx-auth-surface-step="passkey"');
    expect(passkeyHtml).toContain("Continue with a passkey");
    expect(retryHtml).toContain('data-formless-astryx-auth-surface-step="completion"');
    expect(retryHtml).toContain("Try owner setup again");
    expect(completeHtml).toContain('data-formless-astryx-auth-surface-step="completion"');
    expect(completeHtml).toContain("Continue");
  });

  it("dispatches exact controlled field, policy, submit, retry, passkey, and continuation intents", async () => {
    const intents: AuthIntent[] = [];
    const onIntent = (intent: AuthIntent) => {
      intents.push(intent);
    };
    const tokenSurface = signupSurface("ready", undefined, {
      actions: [authAction("auth:test:signup", "submit", "Verify")],
      fields: [authCreateField("auth:test:signup", verificationTokenField())],
      policies: [termsPolicy("auth:test:signup")],
    });
    const tokenRenderer = mount(<AstryxAuthRenderer onIntent={onIntent} surface={tokenSurface} />);

    const tokenQueries = within(tokenRenderer.container);
    fireEvent.change(tokenQueries.getByRole("textbox", { name: /^Verification token/ }), {
      target: { value: "next-opaque-token" },
    });
    fireEvent.click(tokenQueries.getByRole("checkbox", { name: /^Accept terms/ }));
    fireEvent.submit(required(tokenRenderer.container.querySelector("form")));

    const retrySurface = signupSurface("failed", authMessage("Failed", "danger"), {
      actions: [authAction("auth:test:signup", "retry", "Try again")],
    });
    const retryRenderer = mount(<AstryxAuthRenderer onIntent={onIntent} surface={retrySurface} />);
    fireEvent.click(authButtonByControlId(retryRenderer, "auth:test:signup:action:retry:control"));

    const passkeySurface = accountSignInSurface("ready", undefined, {
      passkey: availablePasskey(accountSignInReference.surfaceId),
    });
    const passkeyRenderer = mount(
      <AstryxAuthRenderer onIntent={onIntent} surface={passkeySurface} />,
    );
    fireEvent.submit(required(passkeyRenderer.container.querySelector("form")));

    const continuingSurface = accountSignInSurface("continuing", undefined, {
      continuation: authContinuation(accountSignInReference.surfaceId),
    });
    const continuingRenderer = mount(
      <AstryxAuthRenderer onIntent={onIntent} surface={continuingSurface} />,
    );
    fireEvent.click(
      authButtonByControlId(
        continuingRenderer,
        `${accountSignInReference.surfaceId}:destination:account:control`,
      ),
    );

    expect(intents).toEqual([
      {
        fieldId: "field:verification-token",
        intent: {
          fieldName: "verificationToken",
          fieldValue: { kind: "input", value: "next-opaque-token" },
          type: "createDraftChange",
        },
        surfaceId: "auth:test:signup",
        type: "authField",
      },
      {
        accepted: true,
        policyId: "policy:terms",
        surfaceId: "auth:test:signup",
        type: "authPolicySelection",
      },
      {
        actionId: "auth:test:signup:action:submit",
        controlId: "auth:test:signup:action:submit:control",
        surfaceId: "auth:test:signup",
        type: "authAction",
      },
      {
        actionId: "auth:test:signup:action:retry",
        controlId: "auth:test:signup:action:retry:control",
        surfaceId: "auth:test:signup",
        type: "authAction",
      },
      {
        controlId: `${accountSignInReference.surfaceId}:passkey:control`,
        passkeyId: `${accountSignInReference.surfaceId}:passkey`,
        surfaceId: accountSignInReference.surfaceId,
        type: "authPasskey",
      },
      {
        controlId: `${accountSignInReference.surfaceId}:destination:account:control`,
        destinationId: `${accountSignInReference.surfaceId}:destination:account`,
        surfaceId: accountSignInReference.surfaceId,
        type: "authContinuation",
      },
    ]);

    const operationField = authOperationField("auth:test:account-gate", operationTextField());
    await dispatchAstryxAuthFieldIntent(onIntent, operationField, {
      inputName: "displayName",
      inputValue: { kind: "input", value: "Ada Byron" },
      type: "operationDraftChange",
    });
    expect(intents.at(-1)).toEqual({
      fieldId: "field:profile-display-name",
      intent: {
        inputName: "displayName",
        inputValue: { kind: "input", value: "Ada Byron" },
        type: "operationDraftChange",
      },
      surfaceId: "auth:test:account-gate",
      type: "authField",
    });

    unmountAll(tokenRenderer, retryRenderer, passkeyRenderer, continuingRenderer);
  });

  it("keeps pending controls disabled and omits unavailable actions", async () => {
    const intents: AuthIntent[] = [];
    const pendingSurface = signupSurface("submitting", undefined, {
      actions: [authAction("auth:test:signup", "submit", "Verifying", true)],
      fields: [authCreateField("auth:test:signup", verificationTokenField())],
      pending: true,
    });
    const renderer = mount(
      <AstryxAuthRenderer
        onIntent={(intent) => {
          intents.push(intent);
        }}
        surface={pendingSurface}
      />,
    );
    const submitButton = authButtonByControlId(renderer, "auth:test:signup:action:submit:control");

    expect(submitButton.disabled).toBe(true);
    expect(submitButton.getAttribute("aria-busy")).toBe("true");
    expect(renderer.container.querySelector("input")?.getAttribute("aria-busy")).toBeNull();
    fireEvent.submit(required(renderer.container.querySelector("form")));
    expect(intents).toEqual([]);
    expect(renderer.container.querySelectorAll("button")).toHaveLength(1);
    expect(renderer.container.textContent).not.toContain("Contact owner");
    expect(renderer.container.textContent).not.toContain("Decline");

    unmountAll(renderer);
  });

  it("subscribes to one auth host boundary and dispatches through that host", async () => {
    const intents: AuthIntent[] = [];
    const host = createMemoryPresentationHost({
      dispatch: (intent) => {
        if (intent.type.startsWith("auth")) intents.push(intent as AuthIntent);
      },
      nodes: [
        {
          reference: accountSignInReference,
          snapshot: accountSignInSurface("loading", authMessage("Loading account", "info")),
        },
      ],
    });
    const renderer = mount(
      <PresentationHostProvider host={host}>
        <AstryxSubscribedAuthRenderer reference={accountSignInReference} />
      </PresentationHostProvider>,
    );

    expect(authSurfaceNode(renderer).getAttribute("data-formless-astryx-auth-surface-state")).toBe(
      "loading",
    );
    await act(async () => {
      host.publish([
        {
          reference: accountSignInReference,
          snapshot: accountSignInSurface("continuing", undefined, {
            continuation: authContinuation(accountSignInReference.surfaceId),
          }),
        },
      ]);
    });
    expect(authSurfaceNode(renderer).getAttribute("data-formless-astryx-auth-surface-state")).toBe(
      "continuing",
    );
    fireEvent.click(
      authButtonByControlId(
        renderer,
        `${accountSignInReference.surfaceId}:destination:account:control`,
      ),
    );
    expect(intents).toEqual([authContinuation(accountSignInReference.surfaceId).intent]);

    unmountAll(renderer);
  });
});

function ownerSetupSurface(
  state: OwnerSetupAuthSurfaceContract["state"],
  message?: OwnerSetupAuthSurfaceContract["message"],
  overrides: Partial<OwnerSetupAuthSurfaceContract> = {},
): OwnerSetupAuthSurfaceContract {
  return {
    ...authSurfaceBase("auth:test:owner-setup", "Owner setup", message),
    ...overrides,
    state,
    surfaceKind: "owner-setup",
  };
}

function accountSignInSurface(
  state: AccountSignInAuthSurfaceContract["state"],
  message?: AccountSignInAuthSurfaceContract["message"],
  overrides: Partial<AuthSurfaceBaseContract> = {},
): AccountSignInAuthSurfaceContract {
  return {
    ...authSurfaceBase(accountSignInReference.surfaceId, "Account sign in", message),
    ...overrides,
    state,
    surfaceKind: "account-sign-in",
  };
}

function accountGateSurface(
  state: Exclude<
    AccountGateAuthSurfaceContract["state"],
    "complete" | "continuing" | "failed" | "forbidden" | "loading"
  >,
  message?: AccountGateAuthSurfaceContract["message"],
  overrides: Partial<AuthSurfaceBaseContract> = {},
): AccountGateAuthSurfaceContract {
  return {
    ...authSurfaceBase("auth:test:account-gate", "Account gate", message),
    ...overrides,
    gateKind: "role-review",
    state,
    surfaceKind: "account-gate",
  };
}

function accountTerminalSurface(
  state: "complete" | "continuing" | "failed" | "forbidden" | "loading",
  message?: AccountGateAuthSurfaceContract["message"],
  overrides: Partial<AuthSurfaceBaseContract> = {},
): AccountGateAuthSurfaceContract {
  return {
    ...authSurfaceBase(
      "auth:test:account-gate",
      state === "forbidden" ? "Access unavailable" : "Account gate",
      message,
    ),
    ...overrides,
    state,
    surfaceKind: "account-gate",
  };
}

function signupSurface(
  state: Exclude<SignupAuthSurfaceContract["state"], "loading">,
  message?: SignupAuthSurfaceContract["message"],
  overrides: Partial<AuthSurfaceBaseContract> = {},
): SignupAuthSurfaceContract {
  return {
    ...authSurfaceBase("auth:test:signup", "Sign up", message),
    ...overrides,
    state,
    step: "email-verification",
    surfaceKind: "signup",
  };
}

function invitationSurface(
  state: CollaboratorInvitationAuthSurfaceContract["state"],
  message?: CollaboratorInvitationAuthSurfaceContract["message"],
  overrides: Partial<AuthSurfaceBaseContract> = {},
): CollaboratorInvitationAuthSurfaceContract {
  return {
    ...authSurfaceBase("auth:test:invitation", "Accept invitation", message),
    ...overrides,
    state,
    surfaceKind: "collaborator-invitation-acceptance",
  };
}

function authSurfaceBase(
  id: string,
  title: string,
  message?: AuthSurfaceBaseContract["message"],
): AuthSurfaceBaseContract {
  return {
    actions: [],
    facts: [],
    fields: [],
    frame: {
      accessibilityLabel: `${title} authentication`,
      brand: { kind: "authBrand", label: "Formless" },
      heading: { description: `${title} description`, kind: "authHeading", title },
      kind: "authFrame",
    },
    id,
    kind: "authSurface",
    message,
    pending: false,
    policies: [],
  };
}

function authMessage(
  title: string,
  severity: NonNullable<AuthSurfaceBaseContract["message"]>["severity"],
) {
  return {
    id: `message:${title.toLowerCase().replaceAll(" ", "-")}`,
    kind: "authMessage" as const,
    severity,
    title,
  };
}

function authFact(id: string, label: string, value: string) {
  return { id: `fact:${id}`, kind: "authFact" as const, label, value };
}

function authCreateField(surfaceId: string, field: CreateFieldContract): AuthFieldContract {
  return {
    autocomplete: "one-time-code",
    field,
    intent: { fieldId: field.fieldId, surfaceId, type: "authField" },
    kind: "authField",
    purpose: "verification-token",
  };
}

function authOperationField(
  surfaceId: string,
  field: OperationInputFieldContract,
): AuthFieldContract {
  return {
    autocomplete: "name",
    field,
    intent: { fieldId: field.fieldId, surfaceId, type: "authField" },
    kind: "authField",
    purpose: "profile-input",
  };
}

function verificationTokenField(): CreateFieldContract {
  return createTextField(
    "field:verification-token",
    "verificationToken",
    "Verification token",
    "opaque-base64url-value",
  );
}

function operationTextField(): OperationInputFieldContract {
  const field = createTextField(
    "field:profile-display-name",
    "displayName",
    "Display name",
    "Ada Lovelace",
  );
  return {
    ...field,
    input: { control: "text", label: "Display name", name: "displayName", required: true },
    inputName: "displayName",
    surface: "operation",
  };
}

function createTextField(
  fieldId: string,
  fieldName: string,
  label: string,
  value: string,
): CreateFieldContract {
  const field = { label, required: true, type: "text" as const };
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
      required: true,
    },
    density: "default",
    draftInput: { kind: "input", value },
    editor: "text",
    field,
    fieldId,
    fieldName,
    label,
    labelVisibility: "visible",
    mode: "editor",
    required: true,
    surface: "create",
    value,
  };
}

function termsPolicy(surfaceId: string): AuthPolicyContract {
  return {
    accepted: false,
    description: "Required to continue.",
    destination: {
      href: "/runtime-policy/terms",
      kind: "authPolicyDestination",
      label: "Read terms",
    },
    id: "policy:terms",
    kind: "authPolicy",
    label: "Accept terms",
    required: true,
    selectionIntent: {
      accepted: true,
      policyId: "policy:terms",
      surfaceId,
      type: "authPolicySelection",
    },
  };
}

function authAction(
  surfaceId: string,
  purpose: AuthActionContract["purpose"],
  label: string,
  pending = false,
): AuthActionContract {
  const id = `${surfaceId}:action:${purpose}`;
  const control = authButton(
    `${id}:control`,
    label,
    purpose === "submit" ? "primary" : "secondary",
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

function availablePasskey(surfaceId: string, purpose: "create" | "sign-in" = "sign-in") {
  const id = `${surfaceId}:passkey`;
  const control = authButton(`${id}:control`, "Continue with a passkey", "primary", "submit");
  return {
    availability: "available" as const,
    control,
    id,
    intent: { controlId: control.id, passkeyId: id, surfaceId, type: "authPasskey" as const },
    kind: "authPasskey" as const,
    purpose,
  };
}

function authContinuation(surfaceId: string) {
  const destinationId = `${surfaceId}:destination:account`;
  const control = authButton(`${destinationId}:control`, "Continue", "primary", "button");
  return {
    control,
    destination: {
      detail: "/formless/auth",
      id: destinationId,
      kind: "authContinuationDestination" as const,
      label: "Account",
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

function renderAuth(surface: AuthSurfaceContract) {
  return renderToStaticMarkup(<AstryxAuthRenderer onIntent={() => undefined} surface={surface} />);
}

function mount(element: ReactElement) {
  return render(element);
}

function unmountAll(...renderers: RenderResult[]) {
  renderers.forEach((renderer) => renderer.unmount());
}

function authButtonByControlId(renderer: RenderResult, controlId: string): HTMLButtonElement {
  return required(
    renderer.container.querySelector<HTMLButtonElement>(
      `[data-formless-astryx-auth-control="${controlId}"]`,
    ),
  );
}

function authSurfaceNode(renderer: RenderResult): HTMLElement {
  return required(
    renderer.container.querySelector<HTMLElement>(
      `[data-formless-astryx-auth-surface="${accountSignInReference.surfaceId}"]`,
    ),
  );
}

function required<Value>(value: Value): NonNullable<Value> {
  if (value === null || value === undefined) {
    throw new Error("Expected value.");
  }

  return value as NonNullable<Value>;
}
