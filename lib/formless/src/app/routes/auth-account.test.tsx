import { describe, expect, it } from "vite-plus/test";

import type { AccountCompletionGateTarget } from "../../shared/instance-auth.ts";
import {
  AuthAccountApiError,
  completeAuthAccountTermsAcceptanceGate,
  fetchProductionOwnerSetupStatus,
  startAuthAccountRouteSession,
  type AuthAccountRouteState,
} from "./auth-account.tsx";

const target = {
  access: "authenticated",
  returnTo: "/settings",
  routeId: "route:settings",
  targetOrigin: "https://example.com",
  targetProfile: "instance",
} satisfies AccountCompletionGateTarget;

describe("auth account route data flow", () => {
  it("keeps recognized setup API codes and rejects diagnostic-bearing bodies", async () => {
    await expect(
      fetchProductionOwnerSetupStatus({
        fetcher: jsonFetcher({ code: "unavailable" }, { status: 503 }),
      }),
    ).rejects.toMatchObject({
      code: "unavailable",
      status: 503,
    } satisfies Partial<AuthAccountApiError>);

    await expect(
      fetchProductionOwnerSetupStatus({
        fetcher: jsonFetcher(
          { code: "unavailable", diagnostic: "SQLITE_ERROR at /Users/ada/formless" },
          { status: 503 },
        ),
      }),
    ).rejects.toMatchObject({
      code: "invalid-response",
      status: 503,
    } satisfies Partial<AuthAccountApiError>);
  });

  it("records account status failures as semantic route state", async () => {
    const states: AuthAccountRouteState[] = [];
    const stop = startAuthAccountRouteSession({
      fetcher: jsonFetcher({ code: "internal-failure" }, { status: 500 }),
      locationSearch: "?returnTo=%2Fsettings",
      onState: (state) => states.push(state),
    });

    try {
      await waitFor(() => states.some((state) => state.status === "failed"));
    } finally {
      stop();
    }

    expect(states).toEqual([{ status: "loading" }, { code: "internal-failure", status: "failed" }]);
  });

  it("retains a typed blocked account gate without an arbitrary error", async () => {
    const accountCompletion = {
      gate: {
        kind: "terms-acceptance",
        policies: [
          {
            accountPolicyId: "policy:terms",
            displayName: "Program terms",
            policyKey: "program-terms",
            version: "2026-08-01",
          },
        ],
      },
      status: "blocked",
      target,
    } as const;
    const result = await completeAuthAccountTermsAcceptanceGate({
      acceptedPolicyIds: [],
      fetcher: jsonFetcher({ accountCompletion }, { status: 409 }),
      target,
    });

    expect(result).toEqual({ accountCompletion });
  });
});

function jsonFetcher(body: unknown, init: ResponseInit = {}): typeof fetch {
  return async () => Response.json(body, init);
}

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 1000;

  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  throw new Error("Timed out waiting for condition.");
}
