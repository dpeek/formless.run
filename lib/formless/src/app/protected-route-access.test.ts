import { describe, expect, it } from "vite-plus/test";

import { resolveProtectedRouteAccess } from "./protected-route-access.ts";

describe("protected route access", () => {
  it("accepts only a server decision bound to the exact requested target", async () => {
    const calls: string[] = [];
    const authorized = await resolveProtectedRouteAccess("/deployments?view=current", {
      fetcher: async (input) => {
        calls.push(
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url,
        );
        return completeResponse("/deployments?view=current");
      },
    });

    expect(authorized).toEqual({ kind: "authorized" });
    expect(calls).toEqual(["/formless/auth?returnTo=%2Fdeployments%3Fview%3Dcurrent"]);
    await expect(
      resolveProtectedRouteAccess("/deployments", {
        fetcher: async () => completeResponse("/settings"),
      }),
    ).rejects.toThrow("did not match the requested target");
  });

  it("keeps continuation and authenticated forbidden outcomes distinct", async () => {
    await expect(
      resolveProtectedRouteAccess("/deployments", {
        fetcher: async () =>
          Response.json({ error: "Authenticated account session is required." }, { status: 401 }),
      }),
    ).resolves.toEqual({ kind: "continuation" });
    await expect(
      resolveProtectedRouteAccess("/deployments", {
        fetcher: async () =>
          Response.json(
            {
              principal: {
                displayName: "Program member",
                principalId: "principal:member",
              },
              status: "forbidden",
            },
            { status: 403 },
          ),
      }),
    ).resolves.toEqual({ kind: "forbidden" });
  });
});

function completeResponse(returnTo: `/${string}`): Response {
  return Response.json({
    continueTo: returnTo,
    status: "complete",
    target: {
      returnTo,
      routeId: "route:instance",
      storageIdentity: "formless-program",
      targetOrigin: "https://formless.test",
      targetProfile: "instance",
    },
  });
}
