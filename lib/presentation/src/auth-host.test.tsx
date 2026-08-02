import { describe, expect, it } from "vite-plus/test";
import type {
  AccountGateAuthSurfaceContract,
  AuthFieldContract,
  AuthFieldAutocomplete,
  AuthPasskeyContract,
  AuthSurfaceBaseContract,
  ButtonContract,
  CollaboratorInvitationAuthSurfaceContract,
  CreateFieldContract,
  OperationInputFieldContract,
  OwnerSetupAuthSurfaceContract,
  AccountSignInAuthSurfaceContract,
  SignupAuthSurfaceContract,
} from "./contract.ts";
import {
  createMemoryPresentationHost,
  authSurfaceReference,
  shellManifestReference,
  type AuthSurfaceNode,
  type PresentationNodeSet,
  type ShellManifestNode,
} from "./host.ts";

const ownerSetupReference = authSurfaceReference({
  surfaceId: "auth:owner-setup",
  surfaceKind: "owner-setup",
});
const accountSignInReference = authSurfaceReference({
  surfaceId: "auth:account-sign-in",
  surfaceKind: "account-sign-in",
});
const accountGateReference = authSurfaceReference({
  surfaceId: "auth:account-gate",
  surfaceKind: "account-gate",
});
const signupReference = authSurfaceReference({
  surfaceId: "auth:signup",
  surfaceKind: "signup",
});
const invitationReference = authSurfaceReference({
  surfaceId: "auth:invitation",
  surfaceKind: "collaborator-invitation-acceptance",
});
const shellReference = shellManifestReference("shell:instance");

describe("auth memory Presentation Host", () => {
  it("provides purpose-typed reads for every auth state family beside landed references", () => {
    const host = createMemoryPresentationHost({
      nodes: [...authStateFamilyNodes(), shellNode()],
    });
    const ownerSetup: OwnerSetupAuthSurfaceContract | undefined = host.read({
      ...ownerSetupReference,
    });
    const accountSignIn: AccountSignInAuthSurfaceContract | undefined = host.read({
      ...accountSignInReference,
    });
    const accountGate: AccountGateAuthSurfaceContract | undefined = host.read({
      ...accountGateReference,
    });
    const signup: SignupAuthSurfaceContract | undefined = host.read({
      ...signupReference,
    });
    const invitation: CollaboratorInvitationAuthSurfaceContract | undefined = host.read({
      ...invitationReference,
    });

    expect(ownerSetup?.state).toBe("loading");
    expect(accountSignIn?.state).toBe("ready");
    expect(accountGate?.gateKind).toBe("profile-completion");
    expect(accountGate?.fields[0]?.field.surface).toBe("operation");
    expect(signup?.step).toBe("email-verification");
    expect(signup?.fields[0]).toMatchObject({
      autocomplete: "one-time-code",
      purpose: "verification-token",
    });
    expect(invitation?.state).toBe("eligible");
    expect(host.read(shellReference)?.title).toBe("Formless Program");
  });

  it("validates auth surface, canonical field, and embedded intent identities", () => {
    const setup = ownerSetupNode();
    expect(() =>
      createMemoryPresentationHost({
        nodes: [
          {
            ...setup,
            snapshot: { ...setup.snapshot, id: "auth:other" },
          },
        ],
      }),
    ).toThrow("does not match reference");

    const signup = signupNode();
    expect(() =>
      createMemoryPresentationHost({
        nodes: [
          {
            ...signup,
            snapshot: {
              ...signup.snapshot,
              fields: signup.snapshot.fields.map((field) => ({
                ...field,
                intent: { ...field.intent, surfaceId: "auth:other" },
              })),
            },
          },
        ],
      }),
    ).toThrow("invalid field contract");

    const signIn = accountSignInNode();
    const passkey = signIn.snapshot.passkey;
    if (passkey?.availability !== "available") {
      throw new Error("Expected an available sign-in passkey fixture.");
    }
    expect(() =>
      createMemoryPresentationHost({
        nodes: [
          {
            ...signIn,
            snapshot: {
              ...signIn.snapshot,
              passkey: {
                ...passkey,
                intent: { ...passkey.intent, passkeyId: "passkey:other" },
              },
            },
          },
        ],
      }),
    ).toThrow("invalid passkey intent");
  });
});

function authStateFamilyNodes() {
  return [
    ownerSetupNode(),
    accountSignInNode(),
    accountGateNode(),
    signupNode(),
    invitationNode(),
  ] satisfies PresentationNodeSet;
}

function ownerSetupNode(
  state: OwnerSetupAuthSurfaceContract["state"] = "loading",
): AuthSurfaceNode & { snapshot: OwnerSetupAuthSurfaceContract } {
  return {
    reference: ownerSetupReference,
    snapshot: {
      ...authSurfaceBase(ownerSetupReference.surfaceId, "Owner setup"),
      fields:
        state === "ready"
          ? [
              authCreateField(
                ownerSetupReference.surfaceId,
                "display-name",
                createTextField("field:display-name", "displayName", "Name", "Ada Lovelace"),
                "name",
              ),
            ]
          : [],
      state,
      surfaceKind: "owner-setup",
    },
  };
}

function accountSignInNode(
  state: AccountSignInAuthSurfaceContract["state"] = "ready",
): AuthSurfaceNode & { snapshot: AccountSignInAuthSurfaceContract } {
  return {
    reference: accountSignInReference,
    snapshot: {
      ...authSurfaceBase(accountSignInReference.surfaceId, "Sign in"),
      passkey: authPasskey(accountSignInReference.surfaceId, "sign-in"),
      pending: state === "submitting",
      state,
      surfaceKind: "account-sign-in",
    },
  };
}

function accountGateNode(): AuthSurfaceNode & {
  snapshot: AccountGateAuthSurfaceContract;
} {
  const field = operationTextField(
    "field:profile-display-name",
    "displayName",
    "Display name",
    "Ada Lovelace",
  );
  return {
    reference: accountGateReference,
    snapshot: {
      ...authSurfaceBase(accountGateReference.surfaceId, "Complete your profile"),
      fields: [authOperationField(accountGateReference.surfaceId, field)],
      gateKind: "profile-completion",
      state: "ready",
      surfaceKind: "account-gate",
    },
  };
}

function signupNode(): AuthSurfaceNode & {
  snapshot: SignupAuthSurfaceContract;
} {
  const field = createTextField(
    "field:verification-token",
    "verificationToken",
    "Verification token",
    "opaque-base64url-value",
  );
  return {
    reference: signupReference,
    snapshot: {
      ...authSurfaceBase(signupReference.surfaceId, "Verify your email"),
      fields: [
        authCreateField(signupReference.surfaceId, "verification-token", field, "one-time-code"),
      ],
      state: "ready",
      step: "email-verification",
      surfaceKind: "signup",
    },
  };
}

function invitationNode(): AuthSurfaceNode & {
  snapshot: CollaboratorInvitationAuthSurfaceContract;
} {
  return {
    reference: invitationReference,
    snapshot: {
      ...authSurfaceBase(invitationReference.surfaceId, "Accept invitation"),
      facts: [
        {
          id: "fact:target-email",
          kind: "authFact",
          label: "Email",
          value: "ada@example.com",
        },
      ],
      passkey: authPasskey(invitationReference.surfaceId, "accept-invitation"),
      state: "eligible",
      surfaceKind: "collaborator-invitation-acceptance",
    },
  };
}

function authSurfaceBase(surfaceId: string, title: string): AuthSurfaceBaseContract {
  return {
    actions: [],
    facts: [],
    fields: [],
    frame: {
      accessibilityLabel: title,
      brand: { kind: "authBrand", label: "Formless" },
      heading: { kind: "authHeading", title },
      kind: "authFrame",
    },
    id: surfaceId,
    kind: "authSurface",
    pending: false,
    policies: [],
  };
}

function authCreateField(
  surfaceId: string,
  purpose: Exclude<AuthFieldContract["purpose"], "profile-input">,
  field: CreateFieldContract,
  autocomplete?: AuthFieldAutocomplete,
): AuthFieldContract {
  return {
    autocomplete,
    field,
    intent: { fieldId: field.fieldId, surfaceId, type: "authField" },
    kind: "authField",
    purpose,
  };
}

function authOperationField(
  surfaceId: string,
  field: OperationInputFieldContract,
): AuthFieldContract {
  return {
    field,
    intent: { fieldId: field.fieldId, surfaceId, type: "authField" },
    kind: "authField",
    purpose: "profile-input",
  };
}

function authPasskey(
  surfaceId: string,
  purpose: AuthPasskeyContract["purpose"],
): AuthPasskeyContract & { availability: "available" } {
  const id = `passkey:${purpose}`;
  const control = button(`control:${id}`, "Continue with a passkey", "primary");
  return {
    availability: "available",
    control,
    id,
    intent: { controlId: control.id, passkeyId: id, surfaceId, type: "authPasskey" },
    kind: "authPasskey",
    purpose,
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

function operationTextField(
  fieldId: string,
  fieldName: string,
  label: string,
  value: string,
): OperationInputFieldContract {
  const field = createTextField(fieldId, fieldName, label, value);
  return {
    ...field,
    input: { control: "text", label, name: fieldName, required: true },
    inputName: fieldName,
    surface: "operation",
  };
}

function button(
  id: string,
  label: string,
  prominence: ButtonContract["prominence"] = "secondary",
): ButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    id,
    kind: "button",
    prominence,
    type: "button",
  };
}

function shellNode(): ShellManifestNode {
  return {
    reference: shellReference,
    snapshot: {
      accessibilityLabel: "Formless Program application shell",
      activeDestination: null,
      id: shellReference.shellId,
      kind: "shellManifest",
      navigationSections: [],
      title: "Formless Program",
      workspaceSwitcher: null,
    },
  };
}
