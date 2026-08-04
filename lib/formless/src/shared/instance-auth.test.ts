import { describe, expect, it } from "vite-plus/test";

import {
  instanceAuthErrorCodes,
  parseAccountCompletionContinuationResult,
  parseAccountCompletionGate,
  parseAccountCompletionGateResolutionResult,
  parseAccountCompletionGateResult,
  parseAccountCompletionGateTarget,
  parseAuthAccountStatusResult,
  parseCollaboratorInvitationAcceptanceRequest,
  parseCollaboratorInvitationAcceptanceStatusResponse,
  parseCollaboratorInvitationPasskeyRegistrationOptionsRequest,
  parseCollaboratorInvitationPasskeyRegistrationOptionsResponse,
  parseCollaboratorInvitationPasskeyRegistrationVerifyRequest,
  parseCollaboratorInvitationPasskeyRegistrationVerifyResponse,
  parseInstanceAuthCanonicalOrigin,
  parseInstanceAuthConfigInput,
  parseInstanceAuthErrorResponse,
  parseInstanceAuthRelyingPartyId,
  parseAccountLogoutResponse,
  parseAccountPasskeyLoginOptionsRequest,
  parseAccountPasskeyLoginOptionsResponse,
  parseAccountPasskeyLoginVerifyRequest,
  parseAccountPasskeyLoginVerifyResponse,
  parseAccountSessionStatusResponse,
  parseProgramSessionRequest,
  parseProgramSessionResponse,
  accountRedirectLocationForRoute,
  accountRedirectTargetFromSearch,
  parseAccountRedirectTarget,
} from "./instance-auth.ts";
import { FORMLESS_PROGRAM_STORAGE_IDENTITY } from "../program/target.ts";

const setupToken = "abcDEF0123456789_-abcDEF0123456789_-";
const invitationToken = "aW52aXRlLXJhdy10b2tlbi0x";
const owner = {
  id: "owner-1",
  name: "Ada Owner",
  email: "ada@example.com",
  createdAt: "2026-05-28T00:00:00.000Z",
};
const principal = {
  displayName: "Ada Account",
  email: "ada@example.com",
  principalId: "principal:ada",
};

describe("instance auth origin policy", () => {
  it("parses explicit canonical origin and relying-party config", () => {
    expect(
      parseInstanceAuthConfigInput({
        canonicalOrigin: "https://Instance.Example.com/",
        relyingPartyId: " example.com ",
        relyingPartyName: " Formless ",
      }),
    ).toEqual({
      canonicalOrigin: "https://instance.example.com",
      relyingPartyId: "example.com",
      relyingPartyName: "Formless",
    });

    expect(parseInstanceAuthCanonicalOrigin("http://localhost:5173")).toBe("http://localhost:5173");
    expect(
      parseInstanceAuthRelyingPartyId("instance.example.com", {
        canonicalOrigin: "https://instance.example.com",
      }),
    ).toBe("instance.example.com");
  });

  it("rejects non-origin values and mapped sibling hosts as relying parties", () => {
    expect(() => parseInstanceAuthCanonicalOrigin("https://instance.example.com/login")).toThrow(
      "Instance auth canonical origin must not include a path, query, or fragment.",
    );
    expect(() => parseInstanceAuthCanonicalOrigin("http://instance.example.com")).toThrow(
      "Instance auth canonical origin must use HTTPS unless it is localhost.",
    );
    expect(() =>
      parseInstanceAuthRelyingPartyId("mapped.example.com", {
        canonicalOrigin: "https://instance.example.com",
      }),
    ).toThrow(
      "Instance auth relying-party id must match or be a parent domain of the canonical origin.",
    );
    expect(() => parseInstanceAuthRelyingPartyId("https://example.com")).toThrow(
      "Instance auth relying-party id must be a host name, not a URL.",
    );
  });
});

describe("collaborator invitation acceptance protocol", () => {
  it("parses invitation acceptance requests, passkey requests, and public responses", () => {
    expect(
      parseCollaboratorInvitationAcceptanceRequest({
        invitationId: " invitation:ada ",
        token: invitationToken,
      }),
    ).toEqual({
      invitationId: "invitation:ada",
      token: invitationToken,
    });
    expect(
      parseCollaboratorInvitationAcceptanceStatusResponse({
        eligible: true,
        invitation: {
          invitationId: "invitation:ada",
          targetEmail: "Ada.Collab@example.com",
          targetSurface: "instance",
          expiresAt: "2999-02-01T00:00:00.000Z",
          invitedPrincipalDisplayName: "Ada Collaborator",
          passkeyRegistrationRequired: true,
        },
      }),
    ).toEqual({
      eligible: true,
      invitation: {
        invitationId: "invitation:ada",
        targetEmail: "Ada.Collab@example.com",
        targetSurface: "instance",
        expiresAt: "2999-02-01T00:00:00.000Z",
        invitedPrincipalDisplayName: "Ada Collaborator",
        passkeyRegistrationRequired: true,
      },
    });
    expect(
      parseCollaboratorInvitationAcceptanceStatusResponse({
        eligible: false,
        reason: "wrong-target",
      }),
    ).toEqual({
      eligible: false,
      reason: "wrong-target",
    });
    expect(
      parseCollaboratorInvitationPasskeyRegistrationOptionsRequest({
        invitationId: "invitation:ada",
        token: invitationToken,
      }),
    ).toEqual({
      invitationId: "invitation:ada",
      token: invitationToken,
    });
    expect(
      parseCollaboratorInvitationPasskeyRegistrationOptionsResponse({
        options: registrationOptions(),
      }),
    ).toEqual({
      options: registrationOptions(),
    });
    expect(
      parseCollaboratorInvitationPasskeyRegistrationVerifyRequest({
        invitationId: "invitation:ada",
        token: invitationToken,
        response: registrationResponse(),
      }),
    ).toEqual({
      invitationId: "invitation:ada",
      token: invitationToken,
      response: registrationResponse(),
    });
    expect(
      parseCollaboratorInvitationPasskeyRegistrationVerifyResponse({
        acceptedPrincipal: {
          principalId: "principal:ada",
          displayName: "Ada Collaborator",
        },
        accountCompletion: {
          continueTo: "/site?screen=home",
          status: "complete",
          target: accountCompletionTarget(),
        },
        handoff: {
          targetOrigin: "https://app.example.com",
          returnTo: "/",
        },
        continueTo: "https://app.example.com/",
        invitation: {
          invitationId: "invitation:ada",
          targetEmail: "Ada.Collab@example.com",
          targetSurface: "instance",
          expiresAt: "2999-02-01T00:00:00.000Z",
          passkeyRegistrationRequired: true,
        },
        session: { expiresAt: "2026-06-28T00:00:00.000Z" },
        verified: true,
      }),
    ).toEqual({
      acceptedPrincipal: {
        principalId: "principal:ada",
        displayName: "Ada Collaborator",
      },
      accountCompletion: {
        continueTo: "/site?screen=home",
        status: "complete",
        target: accountCompletionTarget(),
      },
      handoff: {
        targetOrigin: "https://app.example.com",
        returnTo: "/",
      },
      continueTo: "https://app.example.com/",
      invitation: {
        invitationId: "invitation:ada",
        targetEmail: "Ada.Collab@example.com",
        targetSurface: "instance",
        expiresAt: "2999-02-01T00:00:00.000Z",
        passkeyRegistrationRequired: true,
      },
      session: { expiresAt: "2026-06-28T00:00:00.000Z" },
      verified: true,
    });
    expect(
      parseCollaboratorInvitationPasskeyRegistrationVerifyResponse({
        acceptedPrincipal: {
          principalId: "principal:ada",
          displayName: "Ada Collaborator",
        },
        accountCompletion: {
          gate: { credentialMethod: "passkey", kind: "credential" },
          status: "blocked",
          target: accountCompletionTarget(),
        },
        invitation: {
          invitationId: "invitation:ada",
          targetEmail: "Ada.Collab@example.com",
          targetSurface: "instance",
          expiresAt: "2999-02-01T00:00:00.000Z",
          passkeyRegistrationRequired: true,
        },
        session: { expiresAt: "2026-06-28T00:00:00.000Z" },
        verified: true,
      }),
    ).toEqual({
      acceptedPrincipal: {
        principalId: "principal:ada",
        displayName: "Ada Collaborator",
      },
      accountCompletion: {
        gate: { credentialMethod: "passkey", kind: "credential" },
        status: "blocked",
        target: accountCompletionTarget(),
      },
      invitation: {
        invitationId: "invitation:ada",
        targetEmail: "Ada.Collab@example.com",
        targetSurface: "instance",
        expiresAt: "2999-02-01T00:00:00.000Z",
        passkeyRegistrationRequired: true,
      },
      session: { expiresAt: "2026-06-28T00:00:00.000Z" },
      verified: true,
    });
  });

  it("rejects malformed invitation acceptance payloads and private fields", () => {
    expect(() =>
      parseCollaboratorInvitationAcceptanceRequest({
        invitationId: "invitation:ada",
        token: "not+base64",
      }),
    ).toThrow("Collaborator invitation acceptance token must be base64url.");
    expect(() =>
      parseCollaboratorInvitationAcceptanceStatusResponse({
        eligible: false,
        reason: "wrong-token",
        tokenHash: "private",
      }),
    ).toThrow(
      'Collaborator invitation acceptance status response has unsupported key "tokenHash".',
    );
    expect(() =>
      parseCollaboratorInvitationPasskeyRegistrationOptionsResponse({
        options: registrationOptions(),
        tokenHash: "private",
      }),
    ).toThrow(
      'Collaborator invitation passkey registration options response has unsupported key "tokenHash".',
    );
    expect(() =>
      parseCollaboratorInvitationPasskeyRegistrationVerifyResponse({
        acceptedPrincipal: {
          principalId: "principal:ada",
          displayName: "Ada Collaborator",
        },
        invitation: {
          invitationId: "invitation:ada",
          targetEmail: "Ada.Collab@example.com",
          targetSurface: "instance",
          expiresAt: "2999-02-01T00:00:00.000Z",
          passkeyRegistrationRequired: true,
        },
        session: { expiresAt: "2026-06-28T00:00:00.000Z" },
        sessionId: "private",
        verified: true,
      }),
    ).toThrow(
      'Collaborator invitation passkey registration verify response has unsupported key "sessionId".',
    );
    expect(() =>
      parseCollaboratorInvitationPasskeyRegistrationVerifyRequest({
        invitationId: "invitation:ada",
        token: invitationToken,
        response: { ...registrationResponse(), type: "password" },
      }),
    ).toThrow('Collaborator invitation passkey registration response type must be "public-key".');
  });
});

describe("account completion gate protocol", () => {
  it("parses current Program gate kinds with display-safe target facts", () => {
    const target = accountCompletionTarget();
    const gates = [
      {
        kind: "email-verification",
        displayEmail: "Ada.User@example.com",
        principalEmailId: "principal-email:ada",
      },
      {
        kind: "credential",
        credentialMethod: "passkey",
        operation: {
          operationKey: "auth.passkey.create",
          label: "Create passkey",
        },
      },
      {
        kind: "invitation",
        invitationId: "invitation:ada",
        targetEmail: "ada@example.com",
        targetSurface: "instance",
      },
      {
        kind: "profile-completion",
        profileRecordId: "profile:ada",
        selectedOrganization: "organization:acme",
        operation: {
          entityName: "profile",
          operationKey: "profile.complete",
          operationName: "complete",
        },
      },
      {
        kind: "terms-acceptance",
        policies: [
          {
            accountPolicyId: "account-policy:terms",
            displayName: "Terms of Service",
            policyContentRef: "block:terms",
            policyDocumentUrl: "https://policies.example.com/terms",
            policyKey: "terms",
            version: "2026-07",
          },
        ],
      },
    ] as const;

    for (const gate of gates) {
      expect(parseAccountCompletionGateResult({ gate, status: "blocked", target })).toEqual({
        gate,
        status: "blocked",
        target,
      });
    }
  });

  it("parses current Program route target binding fields", () => {
    expect(
      parseAccountCompletionGateTarget({
        returnTo: "/records?view=mine",
        routeId: " route:access ",
        selectedOrganization: " organization:acme ",
        targetOrigin: "https://Instance.Example.com/",
        targetProfile: "instance",
      }),
    ).toEqual({
      returnTo: "/records?view=mine",
      routeId: "route:access",
      selectedOrganization: "organization:acme",
      targetOrigin: "https://instance.example.com",
      targetProfile: "instance",
    });
  });

  it("keeps continuation targets path-only", () => {
    const complete = {
      continueTo: "/formless/auth/handoff?targetOrigin=https%3A%2F%2Fapp.example.com",
      status: "complete",
      target: accountCompletionTarget(),
    } as const;

    expect(parseAccountCompletionContinuationResult(complete)).toEqual(complete);
    expect(parseAccountCompletionGateResolutionResult(complete)).toEqual(complete);

    expect(() =>
      parseAccountCompletionContinuationResult({
        ...complete,
        continueTo: "https://evil.example.com/formless/auth/handoff",
      }),
    ).toThrow("Account completion continuation result continueTo must be path-only.");
    expect(() =>
      parseAccountCompletionContinuationResult({
        ...complete,
        continueTo: "/formless/auth/handoff#session",
      }),
    ).toThrow("Account completion continuation result continueTo must be path-only.");
  });

  it("parses display-safe forbidden account outcomes without target facts", () => {
    const forbidden = {
      principal,
      status: "forbidden",
    } as const;

    expect(parseAuthAccountStatusResult(forbidden)).toEqual(forbidden);
    expect(() =>
      parseAuthAccountStatusResult({
        ...forbidden,
        routeId: "route:private",
      }),
    ).toThrow('Auth account forbidden result has unsupported key "routeId".');
    expect(() =>
      parseAuthAccountStatusResult({
        ...forbidden,
        sessionId: "private-session",
      }),
    ).toThrow("private browser-visible field");
  });

  it("rejects unsupported gates and gate payload values", () => {
    expect(() => parseAccountCompletionGate({ kind: "captcha" })).toThrow(
      "Account completion gate kind is unsupported.",
    );
    expect(() =>
      parseAccountCompletionGate({
        kind: "credential",
        credentialMethod: "oauth",
      }),
    ).toThrow("Account completion credential gate credentialMethod is unsupported.");
    expect(() =>
      parseAccountCompletionGateResolutionResult({
        status: "waiting",
        target: accountCompletionTarget(),
      }),
    ).toThrow("Account completion result status is unsupported.");
  });

  it("rejects private material in browser-visible gate and continuation responses", () => {
    const target = accountCompletionTarget();
    const privateResponses = [
      {
        gate: { kind: "email-verification" },
        sessionId: "private-session",
        status: "blocked",
        target,
      },
      {
        gate: { kind: "invitation", tokenHash: "private-token-hash" },
        status: "blocked",
        target,
      },
      {
        gate: { credentialId: "private-credential-id", kind: "credential" },
        status: "blocked",
        target,
      },
      {
        gate: {
          kind: "email-verification",
          operation: {
            operationKey: "auth.verify-email",
            providerResponse: { id: "provider-response" },
          },
        },
        status: "blocked",
        target,
      },
      {
        gate: {
          kind: "profile-completion",
          profileValues: { firstName: "Ada" },
        },
        status: "blocked",
        target,
      },
      {
        continueTo: "/site",
        hostSessionCookie: "private-cookie",
        status: "complete",
        target,
      },
    ] as const;

    for (const response of privateResponses) {
      expect(() => parseAccountCompletionGateResolutionResult(response)).toThrow(
        "private browser-visible field",
      );
    }
  });
});

describe("Program session protocol", () => {
  it("parses safe requests and every display-safe response state", () => {
    const target = programSessionTarget();
    const session = { expiresAt: "2026-08-02T12:00:00.000Z" };
    const accountCompletion = {
      gate: { credentialMethod: "passkey", kind: "credential" },
      status: "blocked",
      target: {
        access: "authenticated",
        returnTo: "/tasks?view=active",
        routeId: target.routeId,
        targetOrigin: target.targetOrigin,
        targetProfile: "instance",
      },
    } as const;
    const responses = [
      { setupComplete: true, status: "anonymous" },
      {
        accountCompletion,
        principal,
        session,
        status: "blocked",
        target,
      },
      { principal, session, status: "forbidden" },
      {
        callerFacts: {
          active: true,
          kind: "principal",
          owner: false,
          roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357",
        },
        principal,
        session,
        status: "ready",
        target,
      },
    ] as const;

    expect(parseProgramSessionRequest({ returnTo: "/tasks?view=active" })).toEqual({
      returnTo: "/tasks?view=active",
    });

    for (const response of responses) {
      expect(parseProgramSessionResponse(response)).toEqual(response);
    }
  });

  it("rejects unsafe targets, unsupported state fields, and private auth facts", () => {
    expect(() =>
      parseProgramSessionRequest({ returnTo: "https://evil.example.com/tasks" }),
    ).toThrow("Program session request returnTo must be path-only.");
    expect(() =>
      parseProgramSessionRequest({ returnTo: "/tasks", targetOrigin: "https://example.com" }),
    ).toThrow('Program session request has unsupported key "targetOrigin".');
    expect(() =>
      parseProgramSessionResponse({
        setupComplete: true,
        sessionId: "private-session",
        status: "anonymous",
      }),
    ).toThrow('Anonymous Program session response has unsupported key "sessionId".');
    expect(() =>
      parseProgramSessionResponse({
        principal,
        session: { expiresAt: "2026-08-02T12:00:00.000Z", sessionVersion: 7 },
        status: "forbidden",
      }),
    ).toThrow('Forbidden Program session has unsupported key "sessionVersion".');
    expect(() =>
      parseProgramSessionResponse({
        callerFacts: { active: true, kind: "principal", owner: true },
        cookie: "private-cookie",
        principal,
        session: { expiresAt: "2026-08-02T12:00:00.000Z" },
        status: "ready",
        target: programSessionTarget(),
      }),
    ).toThrow('Ready Program session response has unsupported key "cookie".');
    expect(() =>
      parseProgramSessionResponse({
        accountCompletion: {
          gate: { kind: "credential", credentialId: "private-credential" },
          status: "blocked",
          target: accountCompletionTarget(),
        },
        principal,
        session: { expiresAt: "2026-08-02T12:00:00.000Z" },
        status: "blocked",
        target: programSessionTarget(),
      }),
    ).toThrow("private browser-visible field");
  });

  it("keeps the general account session response unchanged", () => {
    expect(() =>
      parseAccountSessionStatusResponse({
        authenticated: true,
        callerFacts: { active: true, kind: "principal", owner: true },
        principal,
        session: { expiresAt: "2026-08-02T12:00:00.000Z" },
        setupComplete: true,
      }),
    ).toThrow('Account session status response has unsupported key "callerFacts".');
  });
});

describe("account passkey protocol", () => {
  it("parses login options, login verify, session status, and logout responses", () => {
    expect(parseAccountPasskeyLoginOptionsRequest({})).toEqual({});
    expect(parseAccountPasskeyLoginOptionsResponse({ options: loginOptions() })).toEqual({
      options: loginOptions(),
    });
    expect(
      parseAccountPasskeyLoginVerifyRequest({
        response: authenticationResponse(),
      }),
    ).toEqual({
      response: authenticationResponse(),
    });
    expect(
      parseAccountPasskeyLoginVerifyResponse({
        authenticated: true,
        continueTo: "/formless/auth",
        principal,
        session: { expiresAt: "2026-06-28T00:00:00.000Z" },
      }),
    ).toEqual({
      authenticated: true,
      continueTo: "/formless/auth",
      principal,
      session: { expiresAt: "2026-06-28T00:00:00.000Z" },
    });
    expect(
      parseAccountSessionStatusResponse({
        authenticated: false,
        setupComplete: true,
      }),
    ).toEqual({
      authenticated: false,
      setupComplete: true,
    });
    expect(
      parseAccountSessionStatusResponse({
        authenticated: true,
        principal,
        session: { expiresAt: "2026-06-28T00:00:00.000Z" },
        setupComplete: true,
      }),
    ).toEqual({
      authenticated: true,
      principal,
      session: { expiresAt: "2026-06-28T00:00:00.000Z" },
      setupComplete: true,
    });
    expect(
      parseAccountLogoutResponse({ authenticated: false, continueTo: "/formless/auth/sign-in" }),
    ).toEqual({ authenticated: false, continueTo: "/formless/auth/sign-in" });
  });

  it("rejects malformed passkey payloads and unsupported keys", () => {
    expect(() =>
      parseAccountPasskeyLoginVerifyRequest({
        redirectTo: "/site",
        response: authenticationResponse(),
      }),
    ).toThrow('Passkey login verify request has unsupported key "redirectTo".');
    expect(() =>
      parseAccountPasskeyLoginVerifyRequest({
        response: {
          ...authenticationResponse(),
          type: "password",
        },
      }),
    ).toThrow('Passkey login response type must be "public-key".');
    expect(() =>
      parseAccountPasskeyLoginVerifyResponse({
        authenticated: true,
        continueTo: "https://evil.example/site",
        principal,
        session: { expiresAt: "2026-06-28T00:00:00.000Z" },
      }),
    ).toThrow("Passkey login verify response continueTo must be path-only.");
    expect(() =>
      parseAccountPasskeyLoginVerifyResponse({
        authenticated: true,
        continueTo: "/site",
        principal,
        session: { expiresAt: "2026-06-28T00:00:00.000Z" },
      }),
    ).toThrow("Passkey login verify response continueTo must route through /formless/auth.");
    expect(() => parseAccountPasskeyLoginOptionsRequest({ setupToken })).toThrow(
      'Passkey login options request has unsupported key "setupToken".',
    );
    expect(() =>
      parseAccountSessionStatusResponse({
        authenticated: false,
        owner,
        setupComplete: true,
      }),
    ).toThrow('Account session status response has unsupported key "owner".');
  });

  it("parses every closed error code without accepting arbitrary details", () => {
    expect(instanceAuthErrorCodes.map((code) => parseInstanceAuthErrorResponse({ code }))).toEqual(
      instanceAuthErrorCodes.map((code) => ({ code })),
    );
    expect(() =>
      parseInstanceAuthErrorResponse({
        code: "unauthorized",
        stack: "private stack trace",
      }),
    ).toThrow('Instance auth error response has unsupported key "stack".');
    expect(() =>
      parseInstanceAuthErrorResponse({
        code: "unauthorized",
        error: "SQLITE_ERROR at /Users/ada/formless",
      }),
    ).toThrow('Instance auth error response has unsupported key "error".');
    expect(() => parseInstanceAuthErrorResponse({ code: "diagnostic" })).toThrow(
      "Instance auth error response code is unsupported.",
    );
  });
});

describe("account redirects", () => {
  it("keeps only same-origin path and query return targets", () => {
    expect(parseAccountRedirectTarget("/settings?screen=routes")).toBe("/settings?screen=routes");
    expect(accountRedirectTargetFromSearch("?redirectTo=%2Fsettings%3Fpanel%3Ddeploy")).toBe(
      "/settings?panel=deploy",
    );
    expect(accountRedirectLocationForRoute("/settings?screen=routes")).toBe(
      "/formless/auth/sign-in?redirectTo=%2Fsettings%3Fscreen%3Droutes",
    );
  });

  it("ignores unsafe account return targets", () => {
    for (const value of [
      "https://formless.local/settings",
      "https://example.com/settings",
      "//example.com/settings",
      "settings",
      "/settings#secret",
      "/\\example.com",
      "/settings\u0000",
      undefined,
    ]) {
      expect(parseAccountRedirectTarget(value)).toBeUndefined();
    }

    expect(accountRedirectTargetFromSearch("?redirectTo=https%3A%2F%2Fexample.com")).toBe("/");
    expect(accountRedirectLocationForRoute("https://example.com/settings")).toBe(
      "/formless/auth/sign-in?redirectTo=%2F",
    );
  });
});

function accountCompletionTarget() {
  return {
    returnTo: "/settings/access",
    routeId: "route:access",
    selectedOrganization: "organization:acme",
    targetOrigin: "https://instance.example.com",
    targetProfile: "instance",
  } as const;
}

function programSessionTarget() {
  return {
    routeAccess: "authenticated",
    routeId: "route:program",
    storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
    targetOrigin: "https://instance.example.com",
    targetProfile: "instance",
  } as const;
}

function registrationOptions() {
  return {
    rp: { id: "example.com", name: "Formless" },
    user: {
      id: "b3duZXItMQ",
      name: "ada@example.com",
      displayName: "Ada Owner",
    },
    challenge: "cmVnaXN0cmF0aW9uLWNoYWxsZW5nZQ",
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    timeout: 60000,
    excludeCredentials: [
      { id: "ZXhpc3RpbmctY3JlZGVudGlhbA", type: "public-key", transports: ["internal"] },
    ],
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
    attestation: "none",
    hints: ["client-device"],
    extensions: {},
  } as const;
}

function registrationResponse() {
  return {
    id: "Y3JlZGVudGlhbC0x",
    rawId: "Y3JlZGVudGlhbC0x",
    response: {
      clientDataJSON: "Y2xpZW50LWRhdGE",
      attestationObject: "YXR0ZXN0YXRpb24",
      transports: ["internal"],
      publicKeyAlgorithm: -7,
      publicKey: "cHVibGljLWtleQ",
    },
    authenticatorAttachment: "platform",
    clientExtensionResults: {},
    type: "public-key",
  } as const;
}

function loginOptions() {
  return {
    challenge: "bG9naW4tY2hhbGxlbmdl",
    rpId: "example.com",
    allowCredentials: [{ id: "Y3JlZGVudGlhbC0x", type: "public-key", transports: ["internal"] }],
    timeout: 60000,
    userVerification: "preferred",
    hints: ["client-device"],
    extensions: {},
  } as const;
}

function authenticationResponse() {
  return {
    id: "Y3JlZGVudGlhbC0x",
    rawId: "Y3JlZGVudGlhbC0x",
    response: {
      clientDataJSON: "Y2xpZW50LWRhdGE",
      authenticatorData: "YXV0aGVudGljYXRvci1kYXRh",
      signature: "c2lnbmF0dXJl",
      userHandle: "b3duZXItMQ",
    },
    authenticatorAttachment: "platform",
    clientExtensionResults: {},
    type: "public-key",
  } as const;
}
