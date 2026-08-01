import type {
  AuthenticationExtensionsClientInputs,
  AuthenticationExtensionsClientOutputs,
  AuthenticationResponseJSON,
  AttestationFormat,
  AuthenticatorAttachment,
  AuthenticatorSelectionCriteria,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialDescriptorJSON,
  PublicKeyCredentialHint,
  PublicKeyCredentialParameters,
  PublicKeyCredentialRequestOptionsJSON,
  PublicKeyCredentialRpEntity,
  PublicKeyCredentialUserEntityJSON,
  RegistrationResponseJSON,
  UserVerificationRequirement,
} from "@simplewebauthn/server";
import { type IdentityInvitationTargetSurface } from "@dpeek/formless-identity-control-plane";
import type {
  ContactTextFieldFormat,
  PublicSafeOperationInputControl,
  PublicSafeOperationInputField,
} from "@dpeek/formless-schema";

import {
  parseRuntimeRouteAccess,
  runtimeTopologyRoutes,
  type RuntimeRouteAccess,
} from "./runtime-topology.ts";

export type InstanceAuthConfigInput = {
  canonicalOrigin: string;
  relyingPartyId: string;
  relyingPartyName: string;
};

export const FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME = "FORMLESS_INSTANCE_AUTH_ORIGIN";
export const FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID_ENV_NAME =
  "FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID";
export const FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME_ENV_NAME =
  "FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME";
export const COLLABORATOR_INVITATION_ACCEPT_PATH = "/formless/auth/invitations/accept";

export type AccountSessionSummary = {
  expiresAt: string;
};

export type AccountPrincipalIdentity = {
  displayName: string;
  email?: string;
  principalId: string;
};

export type AccountPasskeyLoginOptionsRequest = Record<string, never>;

export type AccountPasskeyLoginOptionsResponse = {
  options: PublicKeyCredentialRequestOptionsJSON;
};

export type AccountPasskeyLoginVerifyRequest = {
  response: AuthenticationResponseJSON;
};

export type AccountPasskeyLoginVerifyResponse = {
  authenticated: true;
  continueTo: AccountRedirectTarget;
  principal: AccountPrincipalIdentity;
  session: AccountSessionSummary;
};

export type AccountSessionStatusResponse =
  | {
      authenticated: false;
      setupComplete: boolean;
    }
  | {
      authenticated: true;
      principal: AccountPrincipalIdentity;
      session: AccountSessionSummary;
      setupComplete: true;
    };

export type AccountLogoutResponse = {
  authenticated: false;
  continueTo?: AccountRedirectTarget;
};

export type InstanceAuthErrorResponse = {
  error: string;
};

export type CollaboratorInvitationAcceptanceFailureReason =
  | "accepted-invitation"
  | "configuration-unavailable"
  | "consumed-invitation"
  | "expired-invitation"
  | "missing-invitation"
  | "revoked-invitation"
  | "wrong-email"
  | "wrong-origin"
  | "wrong-target"
  | "wrong-token";

export type CollaboratorInvitationAcceptanceRequest = {
  invitationId: string;
  token: string;
};

export type CollaboratorInvitationAcceptanceInvitationSummary = {
  expiresAt: string;
  invitationId: string;
  invitedPrincipalDisplayName?: string;
  passkeyRegistrationRequired: boolean;
  targetEmail: string;
  targetOrganization?: string;
  targetSurface: IdentityInvitationTargetSurface;
};

export type CollaboratorInvitationAcceptedPrincipalSummary = {
  displayName: string;
  principalId: string;
};

export type CollaboratorInvitationAcceptanceHandoffSummary = {
  returnTo: `/${string}`;
  targetOrigin: string;
};

export type CollaboratorInvitationAcceptanceStatusResponse =
  | {
      eligible: true;
      invitation: CollaboratorInvitationAcceptanceInvitationSummary;
    }
  | {
      eligible: false;
      error: string;
      reason: CollaboratorInvitationAcceptanceFailureReason;
    };

export type CollaboratorInvitationPasskeyRegistrationOptionsRequest =
  CollaboratorInvitationAcceptanceRequest;

export type CollaboratorInvitationPasskeyRegistrationOptionsResponse = {
  options: PublicKeyCredentialCreationOptionsJSON;
};

export type CollaboratorInvitationPasskeyRegistrationVerifyRequest = {
  invitationId: string;
  response: RegistrationResponseJSON;
  token: string;
};

export type CollaboratorInvitationPasskeyRegistrationVerifyResponse = {
  acceptedPrincipal: CollaboratorInvitationAcceptedPrincipalSummary;
  accountCompletion?: AccountCompletionGateResolutionResult;
  continueTo?: AuthSuccessContinuationTarget;
  handoff?: CollaboratorInvitationAcceptanceHandoffSummary;
  invitation: CollaboratorInvitationAcceptanceInvitationSummary;
  session: AccountSessionSummary;
  verified: true;
};

export const accountCompletionGateTargetProfiles = ["instance", "public-site"] as const;
export type AccountCompletionGateTargetProfile =
  (typeof accountCompletionGateTargetProfiles)[number];

export const accountCompletionGateKinds = [
  "email-verification",
  "credential",
  "invitation",
  "profile-completion",
  "terms-acceptance",
] as const;
export type AccountCompletionGateKind = (typeof accountCompletionGateKinds)[number];

export const accountCompletionCredentialMethods = ["passkey"] as const;
export type AccountCompletionCredentialMethod = (typeof accountCompletionCredentialMethods)[number];

export const accountCompletionBrowserVisiblePrivateFieldNames = [
  "appPrivateProfile",
  "appPrivateProfileMaterial",
  "appPrivateProfileValues",
  "centralSessionId",
  "challengeSecret",
  "credential",
  "credentialId",
  "credentialMaterial",
  "credentialPublicKey",
  "grant",
  "grantSecret",
  "grantSecretHash",
  "hostSessionCookie",
  "inviteToken",
  "password",
  "profileValues",
  "providerResponse",
  "providerState",
  "providerStatePayload",
  "publicKey",
  "rawInviteToken",
  "recoveryMaterial",
  "recoveryToken",
  "session",
  "sessionCookie",
  "sessionId",
  "token",
  "tokenHash",
] as const;
export type AccountCompletionBrowserVisiblePrivateFieldName =
  (typeof accountCompletionBrowserVisiblePrivateFieldNames)[number];

export type AccountCompletionGateTarget = {
  access?: Exclude<RuntimeRouteAccess, "anonymous">;
  returnTo: AccountRedirectTarget;
  routeId: string;
  selectedOrganization?: string;
  storageIdentity?: string;
  targetOrigin: string;
  targetProfile: AccountCompletionGateTargetProfile;
};

export type AccountCompletionGateOperationReference = {
  entityName?: string;
  label?: string;
  operationKey: string;
  operationName?: string;
};

export type AccountCompletionGateOperationInputContract = {
  fields: PublicSafeOperationInputField[];
  unsupportedRequiredFields: string[];
};

export type AccountCompletionGatePolicyReference = {
  accountPolicyId: string;
  displayName: string;
  policyContentRef?: string;
  policyDocumentUrl?: string;
  policyKey: string;
  version: string;
};

export type AccountCompletionEmailVerificationGate = {
  displayEmail?: string;
  kind: "email-verification";
  operation?: AccountCompletionGateOperationReference;
  principalEmailId?: string;
};

export type AccountCompletionCredentialGate = {
  credentialMethod?: AccountCompletionCredentialMethod;
  kind: "credential";
  operation?: AccountCompletionGateOperationReference;
};

export type AccountCompletionInvitationGate = {
  invitationId?: string;
  kind: "invitation";
  operation?: AccountCompletionGateOperationReference;
  targetEmail?: string;
  targetSurface?: IdentityInvitationTargetSurface;
};

export type AccountCompletionProfileCompletionGate = {
  inputContract?: AccountCompletionGateOperationInputContract;
  kind: "profile-completion";
  operation?: AccountCompletionGateOperationReference;
  profileRecordId?: string;
  selectedOrganization?: string;
};

export type AccountCompletionTermsAcceptanceGate = {
  kind: "terms-acceptance";
  operation?: AccountCompletionGateOperationReference;
  policies: AccountCompletionGatePolicyReference[];
};

export type AccountCompletionGate =
  | AccountCompletionEmailVerificationGate
  | AccountCompletionCredentialGate
  | AccountCompletionInvitationGate
  | AccountCompletionProfileCompletionGate
  | AccountCompletionTermsAcceptanceGate;

export type AccountCompletionGateResult = {
  gate: AccountCompletionGate;
  status: "blocked";
  target: AccountCompletionGateTarget;
};

export type AccountCompletionContinuationResult = {
  continueTo: AccountRedirectTarget;
  status: "complete";
  target: AccountCompletionGateTarget;
};

export type AccountCompletionGateResolutionResult =
  | AccountCompletionContinuationResult
  | AccountCompletionGateResult;

export type AccountAuthorizationForbiddenResult = {
  principal: AccountPrincipalIdentity;
  status: "forbidden";
};

export type AuthAccountStatusResult =
  | AccountAuthorizationForbiddenResult
  | AccountCompletionGateResolutionResult;

export type AccountRedirectTarget = `/${string}`;
export type AuthSuccessContinuationTarget =
  | AccountRedirectTarget
  | `http://${string}`
  | `https://${string}`;

export const accountDefaultRedirectTarget = "/" satisfies AccountRedirectTarget;
export const accountPasskeyLoginContinuationTarget =
  "/formless/auth" satisfies AccountRedirectTarget;

const accountRedirectBaseOrigin = "https://formless.local";

export function parseAccountRedirectTarget(value: unknown): AccountRedirectTarget | undefined {
  if (
    typeof value !== "string" ||
    value === "" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\") ||
    hasAccountRedirectControlCharacter(value)
  ) {
    return undefined;
  }

  let url: URL;

  try {
    url = new URL(value, accountRedirectBaseOrigin);
  } catch {
    return undefined;
  }

  if (url.origin !== accountRedirectBaseOrigin || url.username || url.password || url.hash) {
    return undefined;
  }

  return `${url.pathname}${url.search}` as AccountRedirectTarget;
}

export function accountRedirectTargetFromSearch(search: string): AccountRedirectTarget {
  const normalized = search.startsWith("?") ? search : `?${search}`;
  const redirectTo = new URLSearchParams(normalized).get("redirectTo");

  return parseAccountRedirectTarget(redirectTo) ?? accountDefaultRedirectTarget;
}

export function accountRedirectLocationForRoute(
  routeTarget: string,
): `${typeof runtimeTopologyRoutes.authAccountSignInRoute}?${string}` {
  const redirectTarget = parseAccountRedirectTarget(routeTarget) ?? accountDefaultRedirectTarget;

  return `${runtimeTopologyRoutes.authAccountSignInRoute}?redirectTo=${encodeURIComponent(redirectTarget)}`;
}

export function authAccountContinuationLocationForReturnTarget(
  routeTarget: string,
): AccountRedirectTarget {
  const redirectTarget = parseAccountRedirectTarget(routeTarget) ?? accountDefaultRedirectTarget;

  return `${runtimeTopologyRoutes.authAccountRoute}?returnTo=${encodeURIComponent(redirectTarget)}` as AccountRedirectTarget;
}

function hasAccountRedirectControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code <= 31 || code === 127) {
      return true;
    }
  }

  return false;
}

const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const authenticatorAttachments = ["cross-platform", "platform"] as const;
const authenticatorTransports = [
  "ble",
  "cable",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb",
] as const;
const collaboratorInvitationAcceptanceTargetSurfaces = [
  "instance",
  "organization",
] as const satisfies readonly IdentityInvitationTargetSurface[];
const collaboratorInvitationAcceptanceFailureReasons = [
  "accepted-invitation",
  "configuration-unavailable",
  "consumed-invitation",
  "expired-invitation",
  "missing-invitation",
  "revoked-invitation",
  "wrong-email",
  "wrong-origin",
  "wrong-target",
  "wrong-token",
] as const satisfies readonly CollaboratorInvitationAcceptanceFailureReason[];
const accountCompletionOperationInputControls = [
  "text",
  "longText",
  "boolean",
  "date",
  "number",
  "enum",
] as const satisfies readonly PublicSafeOperationInputControl[];
const accountCompletionOperationTextFormats = [
  "email",
  "phone",
] as const satisfies readonly ContactTextFieldFormat[];
const publicKeyCredentialHints = ["client-device", "hybrid", "security-key"] as const;
const userVerificationRequirements = ["discouraged", "preferred", "required"] as const;
const residentKeyRequirements = ["discouraged", "preferred", "required"] as const;
const attestationConveyancePreferences = ["direct", "enterprise", "indirect", "none"] as const;
const attestationFormats = [
  "android-key",
  "android-safetynet",
  "apple",
  "fido-u2f",
  "none",
  "packed",
  "tpm",
] as const;
const accountCompletionPrivateResponseFieldKeys = new Set(
  accountCompletionBrowserVisiblePrivateFieldNames.map(normalizeAccountCompletionResponseKey),
);

export function parseInstanceAuthConfigInput(value: unknown): InstanceAuthConfigInput {
  const object = parseObject("Instance auth config", value);

  assertKeys("Instance auth config", object, [
    "canonicalOrigin",
    "relyingPartyId",
    "relyingPartyName",
  ]);

  const canonicalOrigin = parseInstanceAuthCanonicalOrigin(object.canonicalOrigin);

  return {
    canonicalOrigin,
    relyingPartyId: parseInstanceAuthRelyingPartyId(object.relyingPartyId, { canonicalOrigin }),
    relyingPartyName: parseInstanceAuthRelyingPartyName(object.relyingPartyName),
  };
}

export function parseInstanceAuthCanonicalOrigin(value: unknown): string {
  const raw = parseTrimmedNonEmptyString("Instance auth canonical origin", value);
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new Error("Instance auth canonical origin must be an absolute URL origin.");
  }

  if (url.username || url.password) {
    throw new Error("Instance auth canonical origin must not include credentials.");
  }

  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    throw new Error("Instance auth canonical origin must not include a path, query, or fragment.");
  }

  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost(url.hostname))) {
    throw new Error("Instance auth canonical origin must use HTTPS unless it is localhost.");
  }

  if (url.hostname.trim() === "") {
    throw new Error("Instance auth canonical origin must include a host.");
  }

  return url.origin;
}

export function parseInstanceAuthRelyingPartyId(
  value: unknown,
  options: { canonicalOrigin?: string } = {},
): string {
  const relyingPartyId = parseTrimmedNonEmptyString("Instance auth relying-party id", value)
    .toLowerCase()
    .replace(/\.$/, "");

  if (
    relyingPartyId.includes("://") ||
    relyingPartyId.includes("/") ||
    relyingPartyId.includes(":")
  ) {
    throw new Error("Instance auth relying-party id must be a host name, not a URL.");
  }

  if (!isValidRelyingPartyId(relyingPartyId)) {
    throw new Error("Instance auth relying-party id must be a valid host name.");
  }

  if (options.canonicalOrigin !== undefined) {
    const canonicalOrigin = parseInstanceAuthCanonicalOrigin(options.canonicalOrigin);
    const canonicalHost = new URL(canonicalOrigin).hostname.toLowerCase();

    if (canonicalHost !== relyingPartyId && !canonicalHost.endsWith(`.${relyingPartyId}`)) {
      throw new Error(
        "Instance auth relying-party id must match or be a parent domain of the canonical origin.",
      );
    }
  }

  return relyingPartyId;
}

export function parseInstanceAuthRelyingPartyName(value: unknown): string {
  return parseTrimmedNonEmptyString("Instance auth relying-party name", value);
}

export function parseAccountPasskeyLoginOptionsRequest(
  value: unknown,
): AccountPasskeyLoginOptionsRequest {
  const object = parseObject("Passkey login options request", value);

  assertKeys("Passkey login options request", object, []);

  return {};
}

export function parseAccountPasskeyLoginOptionsResponse(
  value: unknown,
): AccountPasskeyLoginOptionsResponse {
  const object = parseObject("Passkey login options response", value);

  assertKeys("Passkey login options response", object, ["options"]);

  return {
    options: parseRequestOptions("Passkey login options", object.options),
  };
}

export function parseAccountPasskeyLoginVerifyRequest(
  value: unknown,
): AccountPasskeyLoginVerifyRequest {
  const object = parseObject("Passkey login verify request", value);

  assertKeys("Passkey login verify request", object, ["response"]);

  return {
    response: parseAuthenticationResponse("Passkey login response", object.response),
  };
}

export function parseAccountPasskeyLoginVerifyResponse(
  value: unknown,
): AccountPasskeyLoginVerifyResponse {
  const object = parseObject("Passkey login verify response", value);

  assertKeys("Passkey login verify response", object, [
    "authenticated",
    "continueTo",
    "principal",
    "session",
  ]);

  if (object.authenticated !== true) {
    throw new Error("Passkey login verify response authenticated must be true.");
  }

  return {
    authenticated: true,
    continueTo: parseAccountPasskeyLoginContinuationTarget(
      "Passkey login verify response continueTo",
      object.continueTo,
    ),
    principal: parseAccountPrincipalIdentity("Passkey login principal", object.principal),
    session: parseAccountSessionSummary("Passkey login session", object.session),
  };
}

export function parseAccountSessionStatusResponse(value: unknown): AccountSessionStatusResponse {
  const object = parseObject("Account session status response", value);

  if (object.authenticated === true) {
    assertKeys("Account session status response", object, [
      "authenticated",
      "principal",
      "session",
      "setupComplete",
    ]);

    if (object.setupComplete !== true) {
      throw new Error("Account session status response setupComplete must be true.");
    }

    return {
      authenticated: true,
      principal: parseAccountPrincipalIdentity("Account session principal", object.principal),
      session: parseAccountSessionSummary("Account session", object.session),
      setupComplete: true,
    };
  }

  if (object.authenticated !== false) {
    throw new Error("Account session status response authenticated must be a boolean.");
  }

  assertKeys("Account session status response", object, ["authenticated", "setupComplete"]);

  if (typeof object.setupComplete !== "boolean") {
    throw new Error("Account session status response setupComplete must be a boolean.");
  }

  return {
    authenticated: false,
    setupComplete: object.setupComplete,
  };
}

export function parseAccountLogoutResponse(value: unknown): AccountLogoutResponse {
  const object = parseObject("Account logout response", value);

  assertKeys("Account logout response", object, ["authenticated"], ["continueTo"]);

  if (object.authenticated !== false) {
    throw new Error("Account logout response authenticated must be false.");
  }

  return {
    authenticated: false,
    ...(object.continueTo === undefined
      ? {}
      : {
          continueTo: parseAccountContinuationTarget(
            "Account logout response continueTo",
            object.continueTo,
          ),
        }),
  };
}

export function parseInstanceAuthErrorResponse(value: unknown): InstanceAuthErrorResponse {
  const object = parseObject("Instance auth error response", value);

  assertKeys("Instance auth error response", object, ["error"]);

  return {
    error: parseTrimmedNonEmptyString("Instance auth error response error", object.error),
  };
}

export function parseAccountCompletionGateTarget(value: unknown): AccountCompletionGateTarget {
  const object = parseObject("Account completion gate target", value);

  assertKeys(
    "Account completion gate target",
    object,
    ["returnTo", "routeId", "targetOrigin", "targetProfile"],
    ["access", "selectedOrganization", "storageIdentity"],
  );

  const access =
    object.access === undefined
      ? undefined
      : parseRuntimeRouteAccess(
          parseTrimmedNonEmptyString("Account completion gate target access", object.access),
        );

  if (access === "anonymous" || (object.access !== undefined && access === undefined)) {
    throw new Error("Account completion gate target access must be protected.");
  }

  const storageIdentity = parseOptionalTrimmedNonEmptyString(
    "Account completion gate target storageIdentity",
    object.storageIdentity,
  );

  if (storageIdentity === undefined) {
    throw new Error("Account completion gate target requires storageIdentity.");
  }

  const selectedOrganization = parseOptionalTrimmedNonEmptyString(
    "Account completion gate target selectedOrganization",
    object.selectedOrganization,
  );

  return {
    ...(access === undefined ? {} : { access }),
    returnTo: parseAccountContinuationTarget(
      "Account completion gate target returnTo",
      object.returnTo,
    ),
    routeId: parseTrimmedNonEmptyString("Account completion gate target routeId", object.routeId),
    ...(selectedOrganization === undefined ? {} : { selectedOrganization }),
    ...(storageIdentity === undefined ? {} : { storageIdentity }),
    targetOrigin: parseInstanceAuthCanonicalOrigin(object.targetOrigin),
    targetProfile: parseStringLiteral(
      "Account completion gate target profile",
      object.targetProfile,
      accountCompletionGateTargetProfiles,
    ),
  };
}

export function parseAccountCompletionGate(value: unknown): AccountCompletionGate {
  const object = parseObject("Account completion gate", value);
  const kind = parseStringLiteral(
    "Account completion gate kind",
    object.kind,
    accountCompletionGateKinds,
  );

  switch (kind) {
    case "email-verification": {
      assertKeys(
        "Account completion email-verification gate",
        object,
        ["kind"],
        ["displayEmail", "operation", "principalEmailId"],
      );

      return {
        kind,
        ...parseOptionalGateOperation("Account completion email-verification gate", object),
        ...parseOptionalStringField(
          "Account completion email-verification gate displayEmail",
          "displayEmail",
          object,
        ),
        ...parseOptionalStringField(
          "Account completion email-verification gate principalEmailId",
          "principalEmailId",
          object,
        ),
      };
    }
    case "credential": {
      assertKeys(
        "Account completion credential gate",
        object,
        ["kind"],
        ["credentialMethod", "operation"],
      );

      return {
        kind,
        ...parseOptionalGateOperation("Account completion credential gate", object),
        ...(object.credentialMethod === undefined
          ? {}
          : {
              credentialMethod: parseStringLiteral(
                "Account completion credential gate credentialMethod",
                object.credentialMethod,
                accountCompletionCredentialMethods,
              ),
            }),
      };
    }
    case "invitation": {
      assertKeys(
        "Account completion invitation gate",
        object,
        ["kind"],
        ["invitationId", "operation", "targetEmail", "targetSurface"],
      );

      return {
        kind,
        ...parseOptionalGateOperation("Account completion invitation gate", object),
        ...parseOptionalStringField(
          "Account completion invitation gate invitationId",
          "invitationId",
          object,
        ),
        ...parseOptionalStringField(
          "Account completion invitation gate targetEmail",
          "targetEmail",
          object,
        ),
        ...(object.targetSurface === undefined
          ? {}
          : {
              targetSurface: parseStringLiteral(
                "Account completion invitation gate targetSurface",
                object.targetSurface,
                collaboratorInvitationAcceptanceTargetSurfaces,
              ),
            }),
      };
    }
    case "profile-completion": {
      assertKeys(
        "Account completion profile-completion gate",
        object,
        ["kind"],
        ["inputContract", "operation", "profileRecordId", "selectedOrganization"],
      );

      return {
        kind,
        ...parseOptionalGateOperation("Account completion profile-completion gate", object),
        ...parseOptionalGateInputContract("Account completion profile-completion gate", object),
        ...parseOptionalStringField(
          "Account completion profile-completion gate profileRecordId",
          "profileRecordId",
          object,
        ),
        ...parseOptionalStringField(
          "Account completion profile-completion gate selectedOrganization",
          "selectedOrganization",
          object,
        ),
      };
    }
    case "terms-acceptance": {
      assertKeys(
        "Account completion terms-acceptance gate",
        object,
        ["kind", "policies"],
        ["operation"],
      );

      return {
        kind,
        ...parseOptionalGateOperation("Account completion terms-acceptance gate", object),
        policies: parseAccountCompletionGatePolicyReferences(object.policies),
      };
    }
  }
}

export function parseAccountCompletionGateResult(value: unknown): AccountCompletionGateResult {
  assertNoAccountCompletionPrivateResponseKeys("Account completion gate result", value);

  const object = parseObject("Account completion gate result", value);

  assertKeys("Account completion gate result", object, ["gate", "status", "target"]);

  if (object.status !== "blocked") {
    throw new Error('Account completion gate result status must be "blocked".');
  }

  return {
    gate: parseAccountCompletionGate(object.gate),
    status: "blocked",
    target: parseAccountCompletionGateTarget(object.target),
  };
}

export function parseAccountCompletionContinuationResult(
  value: unknown,
): AccountCompletionContinuationResult {
  assertNoAccountCompletionPrivateResponseKeys("Account completion continuation result", value);

  const object = parseObject("Account completion continuation result", value);

  assertKeys("Account completion continuation result", object, ["continueTo", "status", "target"]);

  if (object.status !== "complete") {
    throw new Error('Account completion continuation result status must be "complete".');
  }

  return {
    continueTo: parseAccountContinuationTarget(
      "Account completion continuation result continueTo",
      object.continueTo,
    ),
    status: "complete",
    target: parseAccountCompletionGateTarget(object.target),
  };
}

export function parseAccountCompletionGateResolutionResult(
  value: unknown,
): AccountCompletionGateResolutionResult {
  assertNoAccountCompletionPrivateResponseKeys("Account completion result", value);

  const object = parseObject("Account completion result", value);

  if (object.status === "blocked") {
    return parseAccountCompletionGateResult(object);
  }

  if (object.status === "complete") {
    return parseAccountCompletionContinuationResult(object);
  }

  throw new Error("Account completion result status is unsupported.");
}

export function parseAuthAccountStatusResult(value: unknown): AuthAccountStatusResult {
  assertNoAccountCompletionPrivateResponseKeys("Auth account status result", value);

  const object = parseObject("Auth account status result", value);

  if (object.status !== "forbidden") {
    return parseAccountCompletionGateResolutionResult(object);
  }

  assertKeys("Auth account forbidden result", object, ["principal", "status"]);

  return {
    principal: parseAccountPrincipalIdentity("Auth account forbidden principal", object.principal),
    status: "forbidden",
  };
}

export function parseCollaboratorInvitationAcceptanceRequest(
  value: unknown,
): CollaboratorInvitationAcceptanceRequest {
  const object = parseObject("Collaborator invitation acceptance request", value);

  assertKeys("Collaborator invitation acceptance request", object, ["invitationId", "token"]);

  return {
    invitationId: parseTrimmedNonEmptyString(
      "Collaborator invitation acceptance invitationId",
      object.invitationId,
    ),
    token: parseBase64UrlString("Collaborator invitation acceptance token", object.token),
  };
}

export function parseCollaboratorInvitationAcceptanceStatusResponse(
  value: unknown,
): CollaboratorInvitationAcceptanceStatusResponse {
  const object = parseObject("Collaborator invitation acceptance status response", value);

  if (object.eligible === true) {
    assertKeys("Collaborator invitation acceptance status response", object, [
      "eligible",
      "invitation",
    ]);

    return {
      eligible: true,
      invitation: parseCollaboratorInvitationAcceptanceInvitationSummary(object.invitation),
    };
  }

  if (object.eligible !== false) {
    throw new Error("Collaborator invitation acceptance status response eligible must be boolean.");
  }

  assertKeys("Collaborator invitation acceptance status response", object, [
    "eligible",
    "error",
    "reason",
  ]);

  return {
    eligible: false,
    error: parseTrimmedNonEmptyString(
      "Collaborator invitation acceptance status response error",
      object.error,
    ),
    reason: parseStringLiteral(
      "Collaborator invitation acceptance status response reason",
      object.reason,
      collaboratorInvitationAcceptanceFailureReasons,
    ),
  };
}

export function parseCollaboratorInvitationPasskeyRegistrationOptionsRequest(
  value: unknown,
): CollaboratorInvitationPasskeyRegistrationOptionsRequest {
  return parseCollaboratorInvitationAcceptanceRequest(value);
}

export function parseCollaboratorInvitationPasskeyRegistrationOptionsResponse(
  value: unknown,
): CollaboratorInvitationPasskeyRegistrationOptionsResponse {
  const object = parseObject(
    "Collaborator invitation passkey registration options response",
    value,
  );

  assertKeys("Collaborator invitation passkey registration options response", object, ["options"]);

  return {
    options: parseCreationOptions(
      "Collaborator invitation passkey registration options",
      object.options,
    ),
  };
}

export function parseCollaboratorInvitationPasskeyRegistrationVerifyRequest(
  value: unknown,
): CollaboratorInvitationPasskeyRegistrationVerifyRequest {
  const object = parseObject("Collaborator invitation passkey registration verify request", value);

  assertKeys("Collaborator invitation passkey registration verify request", object, [
    "invitationId",
    "response",
    "token",
  ]);

  return {
    invitationId: parseTrimmedNonEmptyString(
      "Collaborator invitation passkey registration invitationId",
      object.invitationId,
    ),
    response: parseRegistrationResponse(
      "Collaborator invitation passkey registration response",
      object.response,
    ),
    token: parseBase64UrlString("Collaborator invitation passkey registration token", object.token),
  };
}

export function parseCollaboratorInvitationPasskeyRegistrationVerifyResponse(
  value: unknown,
): CollaboratorInvitationPasskeyRegistrationVerifyResponse {
  const object = parseObject("Collaborator invitation passkey registration verify response", value);

  assertKeys(
    "Collaborator invitation passkey registration verify response",
    object,
    ["acceptedPrincipal", "invitation", "session", "verified"],
    ["accountCompletion", "continueTo", "handoff"],
  );

  if (object.verified !== true) {
    throw new Error(
      "Collaborator invitation passkey registration verify response verified must be true.",
    );
  }

  return {
    acceptedPrincipal: parseCollaboratorInvitationAcceptedPrincipalSummary(
      object.acceptedPrincipal,
    ),
    ...(object.accountCompletion === undefined
      ? {}
      : {
          accountCompletion: parseAccountCompletionGateResolutionResult(object.accountCompletion),
        }),
    ...(object.continueTo === undefined
      ? {}
      : {
          continueTo: parseAuthSuccessContinuationTarget(
            "Collaborator invitation passkey registration verify response continueTo",
            object.continueTo,
          ),
        }),
    ...(object.handoff === undefined
      ? {}
      : { handoff: parseCollaboratorInvitationAcceptanceHandoffSummary(object.handoff) }),
    invitation: parseCollaboratorInvitationAcceptanceInvitationSummary(object.invitation),
    session: parseAccountSessionSummary(
      "Collaborator invitation passkey registration verify session",
      object.session,
    ),
    verified: true,
  };
}

function parseCollaboratorInvitationAcceptedPrincipalSummary(
  value: unknown,
): CollaboratorInvitationAcceptedPrincipalSummary {
  const object = parseObject("Collaborator invitation accepted principal", value);

  assertKeys("Collaborator invitation accepted principal", object, ["displayName", "principalId"]);

  return {
    displayName: parseTrimmedNonEmptyString(
      "Collaborator invitation accepted principal displayName",
      object.displayName,
    ),
    principalId: parseTrimmedNonEmptyString(
      "Collaborator invitation accepted principal principalId",
      object.principalId,
    ),
  };
}

function parseCollaboratorInvitationAcceptanceHandoffSummary(
  value: unknown,
): CollaboratorInvitationAcceptanceHandoffSummary {
  const object = parseObject("Collaborator invitation acceptance handoff", value);

  assertKeys("Collaborator invitation acceptance handoff", object, ["returnTo", "targetOrigin"]);

  const returnTo = parseAccountRedirectTarget(object.returnTo);

  if (!returnTo) {
    throw new Error("Collaborator invitation acceptance handoff returnTo must be path-only.");
  }

  return {
    returnTo,
    targetOrigin: parseInstanceAuthCanonicalOrigin(object.targetOrigin),
  };
}

function parseAccountContinuationTarget(context: string, value: unknown): AccountRedirectTarget {
  const target = parseAccountRedirectTarget(value);

  if (!target) {
    throw new Error(`${context} must be path-only.`);
  }

  return target;
}

function parseAccountPasskeyLoginContinuationTarget(
  context: string,
  value: unknown,
): AccountRedirectTarget {
  const target = parseAccountContinuationTarget(context, value);
  const targetUrl = new URL(target, accountRedirectBaseOrigin);

  if (targetUrl.pathname !== accountPasskeyLoginContinuationTarget) {
    throw new Error(`${context} must route through /formless/auth.`);
  }

  return target;
}

function parseAuthSuccessContinuationTarget(
  context: string,
  value: unknown,
): AuthSuccessContinuationTarget {
  const pathOnlyTarget = parseAccountRedirectTarget(value);

  if (pathOnlyTarget) {
    return pathOnlyTarget;
  }

  if (typeof value !== "string" || value === "" || hasAccountRedirectControlCharacter(value)) {
    throw new Error(`${context} must be path-only or an HTTP(S) URL.`);
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${context} must be path-only or an HTTP(S) URL.`);
  }

  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error(`${context} must be path-only or an HTTP(S) URL without credentials or hash.`);
  }

  return `${url.origin}${url.pathname}${url.search}` as AuthSuccessContinuationTarget;
}

function parseCollaboratorInvitationAcceptanceInvitationSummary(
  value: unknown,
): CollaboratorInvitationAcceptanceInvitationSummary {
  const object = parseObject("Collaborator invitation acceptance invitation summary", value);

  assertKeys(
    "Collaborator invitation acceptance invitation summary",
    object,
    ["expiresAt", "invitationId", "passkeyRegistrationRequired", "targetEmail", "targetSurface"],
    ["invitedPrincipalDisplayName", "targetOrganization"],
  );

  return {
    expiresAt: parseTrimmedNonEmptyString(
      "Collaborator invitation acceptance expiresAt",
      object.expiresAt,
    ),
    invitationId: parseTrimmedNonEmptyString(
      "Collaborator invitation acceptance invitationId",
      object.invitationId,
    ),
    ...(object.invitedPrincipalDisplayName === undefined
      ? {}
      : {
          invitedPrincipalDisplayName: parseTrimmedNonEmptyString(
            "Collaborator invitation acceptance invitedPrincipalDisplayName",
            object.invitedPrincipalDisplayName,
          ),
        }),
    passkeyRegistrationRequired: parseBoolean(
      "Collaborator invitation acceptance passkeyRegistrationRequired",
      object.passkeyRegistrationRequired,
    ),
    targetEmail: parseTrimmedNonEmptyString(
      "Collaborator invitation acceptance targetEmail",
      object.targetEmail,
    ),
    ...parseCollaboratorInvitationAcceptanceTargetFacts(object),
  };
}

function parseCollaboratorInvitationAcceptanceTargetFacts(
  object: Record<string, unknown>,
): Pick<CollaboratorInvitationAcceptanceInvitationSummary, "targetOrganization" | "targetSurface"> {
  const targetSurface = parseStringLiteral(
    "Collaborator invitation acceptance targetSurface",
    object.targetSurface,
    collaboratorInvitationAcceptanceTargetSurfaces,
  );
  const targetOrganization =
    object.targetOrganization === undefined
      ? undefined
      : parseTrimmedNonEmptyString(
          "Collaborator invitation acceptance targetOrganization",
          object.targetOrganization,
        );

  if (targetSurface === "organization") {
    if (targetOrganization === undefined) {
      throw new Error(
        "Collaborator invitation acceptance organization target requires targetOrganization only.",
      );
    }

    return {
      targetSurface,
      targetOrganization,
    };
  }

  if (targetOrganization !== undefined) {
    throw new Error(
      "Collaborator invitation acceptance instance target cannot include target ids.",
    );
  }

  return { targetSurface };
}

function parseOptionalGateOperation(
  context: string,
  object: Record<string, unknown>,
): { operation?: AccountCompletionGateOperationReference } {
  return object.operation === undefined
    ? {}
    : {
        operation: parseAccountCompletionGateOperationReference(
          `${context} operation`,
          object.operation,
        ),
      };
}

function parseAccountCompletionGateOperationReference(
  context: string,
  value: unknown,
): AccountCompletionGateOperationReference {
  const object = parseObject(context, value);

  assertKeys(context, object, ["operationKey"], ["entityName", "label", "operationName"]);

  return {
    ...parseOptionalStringField(`${context} entityName`, "entityName", object),
    ...parseOptionalStringField(`${context} label`, "label", object),
    operationKey: parseTrimmedNonEmptyString(`${context} operationKey`, object.operationKey),
    ...parseOptionalStringField(`${context} operationName`, "operationName", object),
  };
}

function parseOptionalGateInputContract(
  context: string,
  object: Record<string, unknown>,
): { inputContract?: AccountCompletionGateOperationInputContract } {
  return object.inputContract === undefined
    ? {}
    : {
        inputContract: parseAccountCompletionGateOperationInputContract(
          `${context} input contract`,
          object.inputContract,
        ),
      };
}

function parseAccountCompletionGateOperationInputContract(
  context: string,
  value: unknown,
): AccountCompletionGateOperationInputContract {
  const object = parseObject(context, value);

  assertKeys(context, object, ["fields", "unsupportedRequiredFields"]);

  return {
    fields: parseAccountCompletionGateOperationInputFields(`${context} fields`, object.fields),
    unsupportedRequiredFields: parseStringArray(
      `${context} unsupportedRequiredFields`,
      object.unsupportedRequiredFields,
    ),
  };
}

function parseAccountCompletionGateOperationInputFields(
  context: string,
  value: unknown,
): PublicSafeOperationInputField[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  return value.map((item, index) =>
    parseAccountCompletionGateOperationInputField(`${context}[${index}]`, item),
  );
}

function parseAccountCompletionGateOperationInputField(
  context: string,
  value: unknown,
): PublicSafeOperationInputField {
  const object = parseObject(context, value);

  assertKeys(
    context,
    object,
    ["control", "label", "name", "required"],
    ["format", "options", "suggestions"],
  );

  const control = parseStringLiteral(
    `${context} control`,
    object.control,
    accountCompletionOperationInputControls,
  );

  return {
    name: parseTrimmedNonEmptyString(`${context} name`, object.name),
    label: parseTrimmedNonEmptyString(`${context} label`, object.label),
    required: parseBoolean(`${context} required`, object.required),
    control,
    ...(object.format === undefined
      ? {}
      : {
          format: parseStringLiteral(
            `${context} format`,
            object.format,
            accountCompletionOperationTextFormats,
          ),
        }),
    ...(object.options === undefined
      ? {}
      : { options: parseAccountCompletionGateOperationInputOptions(context, object.options) }),
    ...(object.suggestions === undefined
      ? {}
      : { suggestions: parseStringArray(`${context} suggestions`, object.suggestions) }),
  };
}

function parseAccountCompletionGateOperationInputOptions(
  context: string,
  value: unknown,
): PublicSafeOperationInputField["options"] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} options must be an array.`);
  }

  return value.map((item, index) => {
    const option = parseObject(`${context} options[${index}]`, item);

    assertKeys(`${context} options[${index}]`, option, ["label", "value"]);

    return {
      label: parseTrimmedNonEmptyString(`${context} options[${index}] label`, option.label),
      value: parseTrimmedNonEmptyString(`${context} options[${index}] value`, option.value),
    };
  });
}

function parseAccountCompletionGatePolicyReferences(
  value: unknown,
): AccountCompletionGatePolicyReference[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Account completion terms-acceptance gate policies must be a non-empty array.");
  }

  return value.map((item, index) =>
    parseAccountCompletionGatePolicyReference(
      `Account completion terms-acceptance gate policies[${index}]`,
      item,
    ),
  );
}

function parseAccountCompletionGatePolicyReference(
  context: string,
  value: unknown,
): AccountCompletionGatePolicyReference {
  const object = parseObject(context, value);

  assertKeys(
    context,
    object,
    ["accountPolicyId", "displayName", "policyKey", "version"],
    ["policyContentRef", "policyDocumentUrl"],
  );

  return {
    accountPolicyId: parseTrimmedNonEmptyString(
      `${context} accountPolicyId`,
      object.accountPolicyId,
    ),
    displayName: parseTrimmedNonEmptyString(`${context} displayName`, object.displayName),
    ...parseOptionalStringField(`${context} policyContentRef`, "policyContentRef", object),
    ...(object.policyDocumentUrl === undefined
      ? {}
      : {
          policyDocumentUrl: parseAccountCompletionDisplaySafeUrl(
            `${context} policyDocumentUrl`,
            object.policyDocumentUrl,
          ),
        }),
    policyKey: parseTrimmedNonEmptyString(`${context} policyKey`, object.policyKey),
    version: parseTrimmedNonEmptyString(`${context} version`, object.version),
  };
}

function parseOptionalStringField<Field extends string>(
  context: string,
  field: Field,
  object: Record<string, unknown>,
): { [Key in Field]?: string } {
  const parsed = parseOptionalTrimmedNonEmptyString(context, object[field]);

  return (parsed === undefined ? {} : { [field]: parsed }) as { [Key in Field]?: string };
}

function parseStringArray(context: string, value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  return value.map((item, index) => parseTrimmedNonEmptyString(`${context}[${index}]`, item));
}

function parseAccountCompletionDisplaySafeUrl(context: string, value: unknown): string {
  const raw = parseTrimmedNonEmptyString(context, value);
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${context} must be an absolute URL.`);
  }

  if (url.username || url.password) {
    throw new Error(`${context} must not include credentials.`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${context} must use HTTP or HTTPS.`);
  }

  if (hasAccountRedirectControlCharacter(raw)) {
    throw new Error(`${context} must not include control characters.`);
  }

  return url.toString();
}

function assertNoAccountCompletionPrivateResponseKeys(
  context: string,
  value: unknown,
  path: string[] = [],
) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoAccountCompletionPrivateResponseKeys(context, item, [...path, `[${index}]`]),
    );
    return;
  }

  if (typeof value !== "object" || value === null) {
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = [...path, key];

    if (accountCompletionPrivateResponseFieldKeys.has(normalizeAccountCompletionResponseKey(key))) {
      throw new Error(
        `${context} cannot include private browser-visible field "${formatAccountCompletionResponsePath(nestedPath)}".`,
      );
    }

    assertNoAccountCompletionPrivateResponseKeys(context, nested, nestedPath);
  }
}

function normalizeAccountCompletionResponseKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function formatAccountCompletionResponsePath(path: readonly string[]): string {
  return path.join(".").replaceAll(".[", "[");
}

function parseCreationOptions(
  context: string,
  value: unknown,
): PublicKeyCredentialCreationOptionsJSON {
  const object = parseObject(context, value);

  assertKeys(
    context,
    object,
    ["challenge", "pubKeyCredParams", "rp", "user"],
    [
      "attestation",
      "attestationFormats",
      "authenticatorSelection",
      "excludeCredentials",
      "extensions",
      "hints",
      "timeout",
    ],
  );

  return {
    rp: parseRelyingPartyEntity(`${context} rp`, object.rp),
    user: parseUserEntity(`${context} user`, object.user),
    challenge: parseBase64UrlString(`${context} challenge`, object.challenge),
    pubKeyCredParams: parseCredentialParameters(
      `${context} pubKeyCredParams`,
      object.pubKeyCredParams,
    ),
    ...(object.timeout === undefined
      ? {}
      : { timeout: parsePositiveInteger(`${context} timeout`, object.timeout) }),
    ...(object.excludeCredentials === undefined
      ? {}
      : {
          excludeCredentials: parseCredentialDescriptors(
            `${context} excludeCredentials`,
            object.excludeCredentials,
          ),
        }),
    ...(object.authenticatorSelection === undefined
      ? {}
      : {
          authenticatorSelection: parseAuthenticatorSelection(
            `${context} authenticatorSelection`,
            object.authenticatorSelection,
          ),
        }),
    ...(object.hints === undefined
      ? {}
      : { hints: parseCredentialHints(`${context} hints`, object.hints) }),
    ...(object.attestation === undefined
      ? {}
      : {
          attestation: parseStringLiteral(
            `${context} attestation`,
            object.attestation,
            attestationConveyancePreferences,
          ),
        }),
    ...(object.attestationFormats === undefined
      ? {}
      : {
          attestationFormats: parseAttestationFormats(
            `${context} attestationFormats`,
            object.attestationFormats,
          ),
        }),
    ...(object.extensions === undefined
      ? {}
      : { extensions: parseExtensions(`${context} extensions`, object.extensions) }),
  };
}

function parseRequestOptions(
  context: string,
  value: unknown,
): PublicKeyCredentialRequestOptionsJSON {
  const object = parseObject(context, value);

  assertKeys(
    context,
    object,
    ["challenge"],
    ["allowCredentials", "extensions", "hints", "rpId", "timeout", "userVerification"],
  );

  return {
    challenge: parseBase64UrlString(`${context} challenge`, object.challenge),
    ...(object.timeout === undefined
      ? {}
      : { timeout: parsePositiveInteger(`${context} timeout`, object.timeout) }),
    ...(object.rpId === undefined ? {} : { rpId: parseInstanceAuthRelyingPartyId(object.rpId) }),
    ...(object.allowCredentials === undefined
      ? {}
      : {
          allowCredentials: parseCredentialDescriptors(
            `${context} allowCredentials`,
            object.allowCredentials,
          ),
        }),
    ...(object.userVerification === undefined
      ? {}
      : {
          userVerification: parseStringLiteral(
            `${context} userVerification`,
            object.userVerification,
            userVerificationRequirements,
          ) as UserVerificationRequirement,
        }),
    ...(object.hints === undefined
      ? {}
      : { hints: parseCredentialHints(`${context} hints`, object.hints) }),
    ...(object.extensions === undefined
      ? {}
      : { extensions: parseExtensions(`${context} extensions`, object.extensions) }),
  };
}

function parseRegistrationResponse(context: string, value: unknown): RegistrationResponseJSON {
  const object = parseObject(context, value);

  assertKeys(
    context,
    object,
    ["clientExtensionResults", "id", "rawId", "response", "type"],
    ["authenticatorAttachment"],
  );

  return {
    id: parseBase64UrlString(`${context} id`, object.id),
    rawId: parseBase64UrlString(`${context} rawId`, object.rawId),
    response: parseAttestationResponse(`${context} response`, object.response),
    ...(object.authenticatorAttachment === undefined
      ? {}
      : {
          authenticatorAttachment: parseStringLiteral(
            `${context} authenticatorAttachment`,
            object.authenticatorAttachment,
            authenticatorAttachments,
          ) as AuthenticatorAttachment,
        }),
    clientExtensionResults: parseClientExtensionResults(
      `${context} clientExtensionResults`,
      object.clientExtensionResults,
    ),
    type: parsePublicKeyCredentialType(`${context} type`, object.type),
  };
}

function parseAuthenticationResponse(context: string, value: unknown): AuthenticationResponseJSON {
  const object = parseObject(context, value);

  assertKeys(
    context,
    object,
    ["clientExtensionResults", "id", "rawId", "response", "type"],
    ["authenticatorAttachment"],
  );

  return {
    id: parseBase64UrlString(`${context} id`, object.id),
    rawId: parseBase64UrlString(`${context} rawId`, object.rawId),
    response: parseAssertionResponse(`${context} response`, object.response),
    ...(object.authenticatorAttachment === undefined
      ? {}
      : {
          authenticatorAttachment: parseStringLiteral(
            `${context} authenticatorAttachment`,
            object.authenticatorAttachment,
            authenticatorAttachments,
          ) as AuthenticatorAttachment,
        }),
    clientExtensionResults: parseClientExtensionResults(
      `${context} clientExtensionResults`,
      object.clientExtensionResults,
    ),
    type: parsePublicKeyCredentialType(`${context} type`, object.type),
  };
}

function parseAttestationResponse(
  context: string,
  value: unknown,
): RegistrationResponseJSON["response"] {
  const object = parseObject(context, value);

  assertKeys(
    context,
    object,
    ["attestationObject", "clientDataJSON"],
    ["authenticatorData", "publicKey", "publicKeyAlgorithm", "transports"],
  );

  return {
    clientDataJSON: parseBase64UrlString(`${context} clientDataJSON`, object.clientDataJSON),
    attestationObject: parseBase64UrlString(
      `${context} attestationObject`,
      object.attestationObject,
    ),
    ...(object.authenticatorData === undefined
      ? {}
      : {
          authenticatorData: parseBase64UrlString(
            `${context} authenticatorData`,
            object.authenticatorData,
          ),
        }),
    ...(object.transports === undefined
      ? {}
      : { transports: parseTransports(`${context} transports`, object.transports) }),
    ...(object.publicKeyAlgorithm === undefined
      ? {}
      : {
          publicKeyAlgorithm: parseInteger(
            `${context} publicKeyAlgorithm`,
            object.publicKeyAlgorithm,
          ),
        }),
    ...(object.publicKey === undefined
      ? {}
      : { publicKey: parseBase64UrlString(`${context} publicKey`, object.publicKey) }),
  };
}

function parseAssertionResponse(
  context: string,
  value: unknown,
): AuthenticationResponseJSON["response"] {
  const object = parseObject(context, value);

  assertKeys(context, object, ["authenticatorData", "clientDataJSON", "signature"], ["userHandle"]);

  return {
    clientDataJSON: parseBase64UrlString(`${context} clientDataJSON`, object.clientDataJSON),
    authenticatorData: parseBase64UrlString(
      `${context} authenticatorData`,
      object.authenticatorData,
    ),
    signature: parseBase64UrlString(`${context} signature`, object.signature),
    ...(object.userHandle === undefined
      ? {}
      : { userHandle: parseBase64UrlString(`${context} userHandle`, object.userHandle) }),
  };
}

function parseRelyingPartyEntity(context: string, value: unknown): PublicKeyCredentialRpEntity {
  const object = parseObject(context, value);

  assertKeys(context, object, ["id", "name"]);

  return {
    id: parseInstanceAuthRelyingPartyId(object.id),
    name: parseTrimmedNonEmptyString(`${context} name`, object.name),
  };
}

function parseUserEntity(context: string, value: unknown): PublicKeyCredentialUserEntityJSON {
  const object = parseObject(context, value);

  assertKeys(context, object, ["displayName", "id", "name"]);

  return {
    id: parseBase64UrlString(`${context} id`, object.id),
    name: parseTrimmedNonEmptyString(`${context} name`, object.name),
    displayName: parseTrimmedNonEmptyString(`${context} displayName`, object.displayName),
  };
}

function parseCredentialParameters(
  context: string,
  value: unknown,
): PublicKeyCredentialParameters[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context} must be a non-empty array.`);
  }

  return value.map((item, index) => {
    const object = parseObject(`${context}[${index}]`, item);

    assertKeys(`${context}[${index}]`, object, ["alg", "type"]);

    return {
      type: parsePublicKeyCredentialType(`${context}[${index}] type`, object.type),
      alg: parseInteger(`${context}[${index}] alg`, object.alg),
    };
  });
}

function parseCredentialDescriptors(
  context: string,
  value: unknown,
): PublicKeyCredentialDescriptorJSON[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  return value.map((item, index) => {
    const object = parseObject(`${context}[${index}]`, item);

    assertKeys(`${context}[${index}]`, object, ["id", "type"], ["transports"]);

    return {
      id: parseBase64UrlString(`${context}[${index}] id`, object.id),
      type: parsePublicKeyCredentialType(`${context}[${index}] type`, object.type),
      ...(object.transports === undefined
        ? {}
        : { transports: parseTransports(`${context}[${index}] transports`, object.transports) }),
    };
  });
}

function parseAuthenticatorSelection(
  context: string,
  value: unknown,
): AuthenticatorSelectionCriteria {
  const object = parseObject(context, value);

  assertKeys(
    context,
    object,
    [],
    ["authenticatorAttachment", "residentKey", "requireResidentKey", "userVerification"],
  );

  return {
    ...(object.authenticatorAttachment === undefined
      ? {}
      : {
          authenticatorAttachment: parseStringLiteral(
            `${context} authenticatorAttachment`,
            object.authenticatorAttachment,
            authenticatorAttachments,
          ),
        }),
    ...(object.residentKey === undefined
      ? {}
      : {
          residentKey: parseStringLiteral(
            `${context} residentKey`,
            object.residentKey,
            residentKeyRequirements,
          ),
        }),
    ...(object.requireResidentKey === undefined
      ? {}
      : {
          requireResidentKey: parseBoolean(
            `${context} requireResidentKey`,
            object.requireResidentKey,
          ),
        }),
    ...(object.userVerification === undefined
      ? {}
      : {
          userVerification: parseStringLiteral(
            `${context} userVerification`,
            object.userVerification,
            userVerificationRequirements,
          ),
        }),
  };
}

function parseTransports(context: string, value: unknown): AuthenticatorTransportFuture[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  return value.map((item, index) =>
    parseStringLiteral(`${context}[${index}]`, item, authenticatorTransports),
  ) as AuthenticatorTransportFuture[];
}

function parseCredentialHints(context: string, value: unknown): PublicKeyCredentialHint[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  return value.map((item, index) =>
    parseStringLiteral(`${context}[${index}]`, item, publicKeyCredentialHints),
  ) as PublicKeyCredentialHint[];
}

function parseAttestationFormats(context: string, value: unknown): AttestationFormat[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  return value.map((item, index) =>
    parseStringLiteral(`${context}[${index}]`, item, attestationFormats),
  ) as AttestationFormat[];
}

function parseExtensions(context: string, value: unknown): AuthenticationExtensionsClientInputs {
  const object = parseObject(context, value);

  return { ...object } as AuthenticationExtensionsClientInputs;
}

function parseClientExtensionResults(
  context: string,
  value: unknown,
): AuthenticationExtensionsClientOutputs {
  const object = parseObject(context, value);

  return { ...object } as AuthenticationExtensionsClientOutputs;
}

function parseAccountPrincipalIdentity(context: string, value: unknown): AccountPrincipalIdentity {
  const object = parseObject(context, value);

  assertKeys(context, object, ["displayName", "principalId"], ["email"]);

  const email =
    object.email === undefined
      ? undefined
      : parseTrimmedNonEmptyString(`${context} email`, object.email);

  return {
    displayName: parseTrimmedNonEmptyString(`${context} displayName`, object.displayName),
    ...(email === undefined ? {} : { email }),
    principalId: parseTrimmedNonEmptyString(`${context} principalId`, object.principalId),
  };
}

function parseAccountSessionSummary(context: string, value: unknown): AccountSessionSummary {
  const object = parseObject(context, value);

  assertKeys(context, object, ["expiresAt"]);

  return {
    expiresAt: parseTrimmedNonEmptyString(`${context} expiresAt`, object.expiresAt),
  };
}

function parsePublicKeyCredentialType(context: string, value: unknown): "public-key" {
  if (value !== "public-key") {
    throw new Error(`${context} must be "public-key".`);
  }

  return "public-key";
}

function parseBase64UrlString(context: string, value: unknown): string {
  const stringValue = parseTrimmedNonEmptyString(context, value);

  if (!base64UrlPattern.test(stringValue)) {
    throw new Error(`${context} must be base64url.`);
  }

  return stringValue;
}

function parseStringLiteral<T extends readonly string[]>(
  context: string,
  value: unknown,
  allowedValues: T,
): T[number] {
  if (typeof value !== "string" || !allowedValues.includes(value as T[number])) {
    throw new Error(`${context} is unsupported.`);
  }

  return value;
}

function parsePositiveInteger(context: string, value: unknown): number {
  if (!Number.isInteger(value) || typeof value !== "number" || value <= 0) {
    throw new Error(`${context} must be a positive integer.`);
  }

  return value;
}

function parseInteger(context: string, value: unknown): number {
  if (!Number.isInteger(value) || typeof value !== "number") {
    throw new Error(`${context} must be an integer.`);
  }

  return value;
}

function parseBoolean(context: string, value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${context} must be a boolean.`);
  }

  return value;
}

function parseTrimmedNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

function parseOptionalTrimmedNonEmptyString(context: string, value: unknown): string | undefined {
  return value === undefined ? undefined : parseTrimmedNonEmptyString(context, value);
}

function parseObject(context: string, value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function assertKeys(
  context: string,
  object: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
) {
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);

  for (const key of Object.keys(object)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }

  for (const key of requiredKeys) {
    if (!(key in object)) {
      throw new Error(`${context} must include "${key}".`);
    }
  }
}

function isLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function isValidRelyingPartyId(value: string): boolean {
  if (value === "localhost") {
    return true;
  }

  if (/^\d+\.\d+\.\d+\.\d+$/.test(value)) {
    return false;
  }

  return value.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}
