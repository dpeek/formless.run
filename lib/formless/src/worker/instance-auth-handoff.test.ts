import { describe, expect, it } from "vite-plus/test";

import type { InstanceRuntimeMountRouteResolution } from "./instance-runtime-routes.ts";
import {
  configuredInstanceAuthOriginFromFacts,
  instanceAuthCallbackReservationFromFacts,
  INSTANCE_AUTH_HANDOFF_CALLBACK_PATH,
  INSTANCE_AUTH_HANDOFF_START_PATH,
  mappedInstanceManagementTargetFromFacts,
  planProtectedRouteAuthRedirect,
} from "./instance-auth-handoff.ts";
import { planRuntimeInstanceAuthConfig } from "./instance-auth-runtime.ts";

describe("instance auth origin and protected-route handoff decisions", () => {
  it("selects explicit local and configured production auth origins from facts", () => {
    expect(
      configuredInstanceAuthOriginFromFacts({
        explicitOrigin: "https://local.formless.local/",
        productionOrigin: "https://auth.example.com",
      }),
    ).toBe("https://local.formless.local");
    expect(
      configuredInstanceAuthOriginFromFacts({ productionOrigin: "https://auth.example.com" }),
    ).toBe("https://auth.example.com");
    expect(configuredInstanceAuthOriginFromFacts({})).toBeUndefined();
  });

  it("plans local and configured production auth config without storage readers", () => {
    expect(
      planRuntimeInstanceAuthConfig({
        localRuntime: true,
        requestOrigin: "https://local.formless.local",
        runtimeProfile: "instance",
      }),
    ).toEqual({
      config: {
        canonicalOrigin: "https://local.formless.local",
        relyingPartyId: "local.formless.local",
        relyingPartyName: "Formless",
      },
      kind: "write",
    });

    expect(
      planRuntimeInstanceAuthConfig({
        requestOrigin: "https://ordinary-instance.example.com",
        runtimeProfile: "instance",
      }),
    ).toEqual({ kind: "keep" });

    expect(
      planRuntimeInstanceAuthConfig({
        productionIdentity: {
          authOrigin: "https://auth.example.com",
          canonicalOrigin: "https://www.example.com",
          relyingPartyId: "example.com",
        },
        requestOrigin: "https://worker.example.workers.dev",
        runtimeProfile: "instance",
      }),
    ).toEqual({
      config: {
        canonicalOrigin: "https://auth.example.com",
        relyingPartyId: "example.com",
        relyingPartyName: "Formless",
      },
      kind: "write",
    });
  });

  it("keeps same-origin account continuation path-only for Program routes", () => {
    expect(
      planProtectedRouteAuthRedirect({
        authOrigin: "https://admin.example.com",
        entry: "account",
        requestOrigin: "https://admin.example.com",
        requiredAccess: "owner",
        runtimeRoute: instanceRoute("owner"),
        safeReturnTo: "/deployments?view=active",
      }),
    ).toEqual({
      kind: "account",
      location: "/formless/auth?returnTo=%2Fdeployments%3Fview%3Dactive",
      returnTo: "/deployments?view=active",
    });
  });

  it("binds public Site and instance handoff to current routes and profiles", () => {
    expect(
      planProtectedRouteAuthRedirect({
        authOrigin: "https://auth.example.com",
        entry: "account",
        requestOrigin: "https://site.example.com",
        requiredAccess: "authenticated",
        runtimeRoute: publicSiteRoute("authenticated"),
        safeReturnTo: "/blog/shipping-schema-backed-authoring?ref=nav",
      }),
    ).toMatchObject({
      kind: "handoff",
      target: {
        routeId: "route:public-site:program",
        targetProfile: "public-site",
      },
    });

    expect(
      planProtectedRouteAuthRedirect({
        authOrigin: "https://auth.example.com",
        entry: "handoff",
        requestOrigin: "https://admin.example.com",
        requiredAccess: "owner",
        runtimeRoute: instanceRoute("owner"),
        safeReturnTo: "/deployments",
      }),
    ).toMatchObject({
      entryPath: INSTANCE_AUTH_HANDOFF_START_PATH,
      kind: "handoff",
      target: {
        targetProfile: "instance",
      },
    });
  });

  it("reserves callbacks with exact current Program route bindings", () => {
    expect(
      instanceAuthCallbackReservationFromFacts({
        pathname: INSTANCE_AUTH_HANDOFF_CALLBACK_PATH,
        requestOrigin: "https://admin.example.com",
        runtimeRoute: instanceRoute("owner"),
      }),
    ).toEqual({
      kind: "reserved",
      target: {
        access: "owner",
        routeId: "route:instance:admin",
        targetOrigin: "https://admin.example.com",
        targetProfile: "instance",
      },
    });
    expect(
      instanceAuthCallbackReservationFromFacts({
        pathname: INSTANCE_AUTH_HANDOFF_CALLBACK_PATH,
        requestOrigin: "https://unmapped.example.com",
      }),
    ).toEqual({ kind: "reserved" });
  });

  it("binds mapped management only to management-capable Program routes", () => {
    expect(
      mappedInstanceManagementTargetFromFacts({
        requestOrigin: "https://admin.example.com",
        runtimeRoute: instanceRoute("owner"),
      }),
    ).toEqual({
      access: "owner",
      routeId: "route:instance:admin",
      targetOrigin: "https://admin.example.com",
      targetProfile: "instance",
    });
    expect(
      mappedInstanceManagementTargetFromFacts({
        requestOrigin: "https://admin.example.com",
        runtimeRoute: instanceRoute("authenticated"),
      }),
    ).toBeUndefined();
  });
});

function instanceRoute(
  access: "authenticated" | "management" | "owner",
): InstanceRuntimeMountRouteResolution {
  return {
    access,
    id: "route:instance:admin",
    kind: "mount",
    matchHost: "admin.example.com",
    matchPath: "/",
    matchPrefix: "/",
    targetProfile: "instance",
  };
}

function publicSiteRoute(access: "authenticated" | "owner"): InstanceRuntimeMountRouteResolution {
  return {
    access,
    id: "route:public-site:program",
    kind: "mount",
    matchHost: "site.example.com",
    matchPath: "/",
    matchPrefix: "/",
    surface: "public-site",
    targetProfile: "public-site",
  };
}
