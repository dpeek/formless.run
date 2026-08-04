import { describe, expect, it } from "vite-plus/test";

import {
  fetchAccountSessionStatus,
  loginWithPasskey,
  logoutAccountSession,
  navigateAfterAccountSignIn,
  accountSignInRedirectRequiresDocumentNavigation,
  accountSignInSuccessContinuationTarget,
  startAccountSignInRouteSession,
  type AccountSignInApiError,
  type AccountSignInRouteState,
} from "./account-sign-in.tsx";
import type {
  AccountPasskeyLoginOptionsResponse,
  AccountPasskeyLoginVerifyRequest,
  AccountPrincipalIdentity,
} from "../../shared/instance-auth.ts";
import { isRuntimeClientShellRoute, runtimeTopologyRoutes } from "../../shared/runtime-topology.ts";

const principal: AccountPrincipalIdentity = {
  displayName: "Ada Account",
  email: "ada@example.com",
  principalId: "principal:ada",
};

describe("account sign-in route", () => {
  it("uses the account sign-in gate route instead of the deleted legacy login route", () => {
    expect(runtimeTopologyRoutes.authAccountSignInRoute).toBe("/formless/auth/sign-in");
    expect(isRuntimeClientShellRoute(runtimeTopologyRoutes.authAccountSignInRoute)).toBe(true);
    expect(isRuntimeClientShellRoute("/login")).toBe(false);
  });
});

describe("account sign-in route data flow", () => {
  it("uses document navigation for internal auth handoff redirects", () => {
    const clientLocations: unknown[] = [];
    const documentLocations: string[] = [];
    const handoffTarget =
      "/formless/auth/handoff?targetOrigin=https%3A%2F%2Fadmin.example.com&state=c0tPAI" as const;

    navigateAfterAccountSignIn(handoffTarget, {
      replaceDocumentLocation: (target) => documentLocations.push(target),
      setLocation: (...args) => clientLocations.push(args),
    });

    expect(accountSignInRedirectRequiresDocumentNavigation(handoffTarget)).toBe(true);
    expect(documentLocations).toEqual([handoffTarget]);
    expect(clientLocations).toEqual([]);
  });

  it("routes passkey login success through the account continuation contract", () => {
    expect(
      accountSignInSuccessContinuationTarget(
        "/formless/auth",
        "?redirectTo=%2Fapps%2Fpersonal%3Fscreen%3Droutes",
      ),
    ).toBe("/formless/auth?returnTo=%2Fapps%2Fpersonal%3Fscreen%3Droutes");
    expect(
      accountSignInSuccessContinuationTarget(
        "/formless/auth",
        "?redirectTo=https%3A%2F%2Fevil.example.com%2Fadmin",
      ),
    ).toBe("/formless/auth?returnTo=%2F");
    expect(
      accountSignInSuccessContinuationTarget(
        "/formless/auth?returnTo=%2Fdeployments",
        "?redirectTo=%2Fapps%2Fpersonal",
      ),
    ).toBe("/formless/auth?returnTo=%2Fdeployments");
  });

  it("resumes an existing account continuation after passkey login", () => {
    const clientLocations: unknown[] = [];
    const documentLocations: string[] = [];
    const continuationTarget = accountSignInSuccessContinuationTarget(
      "/formless/auth",
      "?redirectTo=%2Fformless%2Fauth%3FreturnTo%3D%252F",
    );

    navigateAfterAccountSignIn(continuationTarget, {
      replaceDocumentLocation: (target) => documentLocations.push(target),
      setLocation: (...args) => clientLocations.push(args),
    });

    expect(continuationTarget).toBe("/formless/auth?returnTo=%2F");
    expect(documentLocations).toEqual(["/formless/auth?returnTo=%2F"]);
    expect(clientLocations).toEqual([]);
  });

  it("uses client navigation for normal account sign-in redirects", () => {
    const clientLocations: unknown[] = [];
    const documentLocations: string[] = [];
    const redirectTarget = "/settings?panel=routes" as const;

    navigateAfterAccountSignIn(redirectTarget, {
      replaceDocumentLocation: (target) => documentLocations.push(target),
      setLocation: (...args) => clientLocations.push(args),
    });

    expect(accountSignInRedirectRequiresDocumentNavigation(redirectTarget)).toBe(false);
    expect(clientLocations).toEqual([[redirectTarget, { replace: true }]]);
    expect(documentLocations).toEqual([]);
  });

  it("loads ready state when owner setup is complete but no session exists", async () => {
    const states: AccountSignInRouteState[] = [];
    const stop = startAccountSignInRouteSession({
      fetcher: jsonFetcher({ authenticated: false, setupComplete: true }),
      onState: (state) => states.push(state),
      passkeysSupported: () => true,
    });

    try {
      await waitFor(() => states.some((state) => state.status === "ready"));
    } finally {
      stop();
    }

    expect(states).toEqual([{ status: "loading" }, { status: "ready" }]);
  });

  it("loads unavailable state when setup is complete but WebAuthn is unavailable", async () => {
    const states: AccountSignInRouteState[] = [];
    const stop = startAccountSignInRouteSession({
      fetcher: jsonFetcher({ authenticated: false, setupComplete: true }),
      onState: (state) => states.push(state),
      passkeysSupported: () => false,
    });

    try {
      await waitFor(() => states.some((state) => state.status === "passkey-unavailable"));
    } finally {
      stop();
    }

    expect(states).toEqual([{ status: "loading" }, { status: "passkey-unavailable" }]);
  });

  it("loads complete state with the authenticated principal identity", async () => {
    const states: AccountSignInRouteState[] = [];
    const stop = startAccountSignInRouteSession({
      fetcher: jsonFetcher({
        authenticated: true,
        principal,
        session: { expiresAt: "2026-06-21T00:00:00.000Z" },
        setupComplete: true,
      }),
      onState: (state) => states.push(state),
    });

    try {
      await waitFor(() => states.some((state) => state.status === "complete"));
    } finally {
      stop();
    }

    expect(states).toEqual([{ status: "loading" }, { status: "complete", principal }]);
  });

  it("loads setup-incomplete state before the first owner exists", async () => {
    const states: AccountSignInRouteState[] = [];
    const stop = startAccountSignInRouteSession({
      fetcher: jsonFetcher({ authenticated: false, setupComplete: false }),
      onState: (state) => states.push(state),
    });

    try {
      await waitFor(() => states.some((state) => state.status === "setup-incomplete"));
    } finally {
      stop();
    }

    expect(states).toEqual([{ status: "loading" }, { status: "setup-incomplete" }]);
  });

  it("runs account sign-in through passkey assertion without admin authorization", async () => {
    const calls: Array<{
      authorization: string | null;
      body: unknown;
      credentials: RequestCredentials | undefined;
      input: RequestInfo | URL;
      method: string | undefined;
    }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;

      calls.push({
        authorization: new Headers(init?.headers).get("Authorization"),
        body: body as unknown,
        credentials: init?.credentials,
        input,
        method: init?.method,
      });

      if (input === "/api/formless/passkeys/login/options") {
        return Response.json(loginOptionsResponse);
      }

      return Response.json({
        authenticated: true,
        continueTo: "/formless/auth",
        principal,
        session: { expiresAt: "2026-06-21T00:00:00.000Z" },
      });
    };

    await expect(
      loginWithPasskey({
        createAuthenticationResponse: async () => authenticationResponse,
        fetcher,
      }),
    ).resolves.toEqual({
      authenticated: true,
      continueTo: "/formless/auth",
      principal,
      session: { expiresAt: "2026-06-21T00:00:00.000Z" },
    });
    expect(calls).toEqual([
      {
        authorization: null,
        body: {},
        credentials: "same-origin",
        input: "/api/formless/passkeys/login/options",
        method: "POST",
      },
      {
        authorization: null,
        body: {
          response: authenticationResponse,
        },
        credentials: "same-origin",
        input: "/api/formless/passkeys/login/verify",
        method: "POST",
      },
    ]);
  });

  it("keeps recognized account failure codes without supplied details", async () => {
    await expect(
      loginWithPasskey({
        createAuthenticationResponse: async () => authenticationResponse,
        fetcher: jsonFetcher({ code: "unavailable" }, { status: 503 }),
      }),
    ).rejects.toMatchObject({
      code: "unavailable",
      status: 503,
    } satisfies Partial<AccountSignInApiError>);

    await expect(
      loginWithPasskey({
        createAuthenticationResponse: async () => authenticationResponse,
        fetcher: jsonFetcher(
          { code: "unavailable", error: "SQLITE_ERROR at /Users/ada/formless" },
          { status: 503 },
        ),
      }),
    ).rejects.toMatchObject({
      code: "invalid-response",
      status: 503,
    } satisfies Partial<AccountSignInApiError>);
  });

  it("posts logout without admin authorization", async () => {
    const calls: Array<{
      authorization: string | null;
      credentials: RequestCredentials | undefined;
      input: RequestInfo | URL;
      method: string | undefined;
    }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({
        authorization: new Headers(init?.headers).get("Authorization"),
        credentials: init?.credentials,
        input,
        method: init?.method,
      });

      return Response.json({ authenticated: false, continueTo: "/formless/auth/sign-in" });
    };

    await expect(logoutAccountSession({ fetcher })).resolves.toEqual({
      authenticated: false,
      continueTo: "/formless/auth/sign-in",
    });
    expect(calls).toEqual([
      {
        authorization: null,
        credentials: "same-origin",
        input: "/api/formless/session/logout",
        method: "POST",
      },
    ]);
  });

  it("parses anonymous account session status without candidate identity", async () => {
    await expect(
      fetchAccountSessionStatus({
        fetcher: jsonFetcher({ authenticated: false, setupComplete: true }),
      }),
    ).resolves.toEqual({ authenticated: false, setupComplete: true });
  });
});

const loginOptionsResponse = {
  options: {
    challenge: "Y2hhbGxlbmdl",
    rpId: "example.com",
    userVerification: "required",
  },
} satisfies AccountPasskeyLoginOptionsResponse;

const authenticationResponse = {
  clientExtensionResults: {},
  id: "Y3JlZA",
  rawId: "Y3JlZA",
  response: {
    authenticatorData: "YXV0aA",
    clientDataJSON: "Y2xpZW50",
    signature: "c2ln",
    userHandle: "dXNlcg",
  },
  type: "public-key",
} satisfies AccountPasskeyLoginVerifyRequest["response"];

function jsonFetcher(body: unknown, init: ResponseInit = {}): typeof fetch {
  return async () => Response.json(body, init);
}

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 1000;

  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  throw new Error("Timed out waiting for condition.");
}
