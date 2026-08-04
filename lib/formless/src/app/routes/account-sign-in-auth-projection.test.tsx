import { describe, expect, it } from "vite-plus/test";
import type { AuthIntent } from "@dpeek/formless-presentation/contract";
import {
  instanceAuthErrorCodes,
  type AccountPrincipalIdentity,
} from "../../shared/instance-auth.ts";
import {
  authIntentIsCurrent,
  createAuthPendingGuard,
  createNoShellAuthRuntimeHost,
} from "./auth-runtime-boundary.tsx";
import type { AccountSignInRouteState } from "./account-sign-in.tsx";
import {
  accountSignInAuthSurfaceReference,
  projectAccountSignInAuthSurface,
} from "./account-sign-in-auth-projection.ts";

const principal: AccountPrincipalIdentity = {
  displayName: "Ada Account",
  email: "ada@example.com",
  principalId: "principal:ada",
};

describe("account sign-in auth projection", () => {
  it("projects every account sign-in runtime state", () => {
    const states: Array<[AccountSignInRouteState, string]> = [
      [{ status: "loading" }, "loading"],
      [{ status: "setup-incomplete" }, "incomplete"],
      [{ status: "ready" }, "ready"],
      [{ status: "submitting" }, "submitting"],
      [{ status: "passkey-unavailable" }, "passkey-unavailable"],
      [{ code: "unavailable", retry: "sign-in", status: "failed" }, "failed"],
      [{ principal, status: "complete" }, "complete"],
      [{ principal, status: "logging-out" }, "logout-pending"],
      [{ continueTo: "/apps", principal, status: "continuing" }, "continuing"],
    ];

    expect(states.map(([state]) => projectAccountSignInAuthSurface({ state }).state)).toEqual(
      states.map(([, state]) => state),
    );
  });

  it("projects passkey, logout, continuation, and fixed failures", () => {
    const unavailable = projectAccountSignInAuthSurface({
      state: { status: "passkey-unavailable" },
    });
    const ready = projectAccountSignInAuthSurface({ state: { status: "ready" } });
    const complete = projectAccountSignInAuthSurface({
      state: { principal, status: "complete" },
    });

    expect(unavailable.passkey).toMatchObject({
      availability: "unavailable",
      unavailableReason: "This browser does not support passkeys.",
    });
    expect(ready.facts).toEqual([]);
    expect(ready.frame.heading.description).not.toContain(principal.displayName);
    expect(complete.actions.map((action) => action.purpose)).toEqual(["logout"]);
    expect(complete.facts).toEqual([
      expect.objectContaining({ label: "Account", value: principal.displayName }),
    ]);
    expect(complete.continuation?.destination.label).toBe("Continue");

    const failed = projectAccountSignInAuthSurface({
      state: { code: "invalid-response", retry: "load", status: "failed" },
    });
    expect(failed.feedback?.detail).toBe(
      "The account service returned an invalid response. Try again.",
    );
  });

  it("maps every API and local sign-in failure code to fixed retry copy", () => {
    const codes = [
      ...instanceAuthErrorCodes,
      "network-failure",
      "invalid-response",
      "passkey-failed",
    ] as const;

    for (const code of codes) {
      const surface = projectAccountSignInAuthSurface({
        state: { code, retry: "sign-in", status: "failed" },
      });

      expect(surface.feedback?.detail, code).toBeTruthy();
      expect(surface.feedback?.detail, code).not.toBe(code);
    }
  });

  it("keeps the no-shell host stable and deduplicates pending operations", async () => {
    const first = projectAccountSignInAuthSurface({ state: { status: "ready" } });
    const calls: AuthIntent[] = [];
    const runtime = createNoShellAuthRuntimeHost(
      accountSignInAuthSurfaceReference,
      first,
      (intent) => {
        calls.push(intent);
      },
    );
    const host = runtime.host;
    const passkey = first.passkey;
    if (passkey?.availability !== "available") throw new Error("Expected sign-in passkey.");

    await host.dispatch(passkey.intent);
    runtime.publish(projectAccountSignInAuthSurface({ state: { principal, status: "complete" } }));
    expect(runtime.host).toBe(host);
    expect(host.read(accountSignInAuthSurfaceReference)?.state).toBe("complete");
    expect(calls).toEqual([passkey.intent]);
    expect(authIntentIsCurrent(first, passkey.intent)).toBe(true);

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
    expect(await operation()).toBe(false);
    expect(operationCalls).toBe(1);
    release?.();
    expect(await firstRun).toBe(true);
  });
});
