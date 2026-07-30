import { describe, expect, it } from "vite-plus/test";

import { FORMLESS_PROGRAM_STORAGE_IDENTITY } from "../program/target.ts";
import { installedAppStorageIdentity } from "../shared/app-storage-identity.ts";
import type { InstanceRuntimeMountRouteResolution } from "./instance-runtime-routes.ts";
import {
  configuredInstanceAuthOriginFromFacts,
  installedAppApiRouteAccessFromFacts,
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
      configuredInstanceAuthOriginFromFacts({
        productionOrigin: "https://auth.example.com",
      }),
    ).toBe("https://auth.example.com");
    expect(configuredInstanceAuthOriginFromFacts({})).toBeUndefined();
  });

  it("plans local and configured production auth config without storage readers", () => {
    expect(
      planRuntimeInstanceAuthConfig({
        requestOrigin: "https://local.formless.local",
        runtimeProfile: "dev",
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
        localRuntime: true,
        productionIdentity: {
          authOrigin: "https://auth.example.com",
          canonicalOrigin: "https://www.example.com",
          relyingPartyId: "example.com",
        },
        requestOrigin: "http://localhost:5174",
        runtimeProfile: "instance",
      }),
    ).toEqual({
      config: {
        canonicalOrigin: "http://localhost:5174",
        relyingPartyId: "localhost",
        relyingPartyName: "Formless",
      },
      kind: "write",
    });

    expect(
      planRuntimeInstanceAuthConfig({
        productionIdentity: {
          authOrigin: "https://auth.example.com",
          canonicalOrigin: "https://www.example.com",
          primaryRoute: "route:production",
          relyingPartyId: "example.com",
          relyingPartyName: "Example",
        },
        requestOrigin: "https://worker.example.workers.dev",
        runtimeProfile: "instance",
      }),
    ).toEqual({
      config: {
        canonicalOrigin: "https://auth.example.com",
        relyingPartyId: "example.com",
        relyingPartyName: "Example",
      },
      kind: "write",
    });
  });

  it("refreshes changed auth config only before an owner exists", () => {
    const facts = {
      existing: {
        canonicalOrigin: "https://old.example.com",
        relyingPartyId: "old.example.com",
        relyingPartyName: "Formless",
      },
      productionIdentity: {
        authOrigin: "https://auth.example.com",
        canonicalOrigin: "https://www.example.com",
        relyingPartyId: "example.com",
      },
      requestOrigin: "https://worker.example.workers.dev",
      runtimeProfile: "instance" as const,
    };

    expect(planRuntimeInstanceAuthConfig(facts)).toMatchObject({ kind: "check-owner" });
    expect(planRuntimeInstanceAuthConfig({ ...facts, ownerPresent: false })).toEqual({
      config: {
        canonicalOrigin: "https://auth.example.com",
        relyingPartyId: "example.com",
        relyingPartyName: "Formless",
      },
      kind: "write",
    });
    expect(planRuntimeInstanceAuthConfig({ ...facts, ownerPresent: true })).toEqual({
      kind: "keep",
    });
    expect(
      planRuntimeInstanceAuthConfig({
        ...facts,
        localRuntime: true,
        ownerPresent: true,
        requestOrigin: "https://local.formless.local",
      }),
    ).toEqual({
      config: {
        canonicalOrigin: "https://local.formless.local",
        relyingPartyId: "local.formless.local",
        relyingPartyName: "Formless",
      },
      kind: "write",
    });
  });

  it("keeps same-origin account continuation path-only for authenticated and owner routes", () => {
    for (const requiredAccess of ["authenticated", "owner"] as const) {
      expect(
        planProtectedRouteAuthRedirect({
          authOrigin: "https://admin.example.com",
          entry: "account",
          requestOrigin: "https://admin.example.com",
          requiredAccess,
          runtimeRoute: instanceRoute(requiredAccess),
          safeReturnTo: "/deployments?view=active",
        }),
      ).toEqual({
        kind: "account",
        location: "/formless/auth?returnTo=%2Fdeployments%3Fview%3Dactive",
        returnTo: "/deployments?view=active",
      });
    }
  });

  it("binds cross-origin authenticated app and public Site targets", () => {
    expect(
      planProtectedRouteAuthRedirect({
        authOrigin: "https://auth.example.com",
        entry: "account",
        requestOrigin: "https://tasks.example.com",
        requiredAccess: "authenticated",
        runtimeRoute: appRoute("app", "tasks", "authenticated"),
        safeReturnTo: "/schema?view=board",
      }),
    ).toMatchObject({
      authOrigin: "https://auth.example.com",
      entryPath: "/formless/auth",
      kind: "handoff",
      returnTo: "/schema?view=board",
      target: {
        access: "authenticated",
        appInstallId: "tasks",
        routeId: "route:app:tasks",
        storageIdentity: "app:tasks",
        targetOrigin: "https://tasks.example.com",
        targetProfile: "app",
      },
    });

    expect(
      planProtectedRouteAuthRedirect({
        authOrigin: "https://auth.example.com",
        entry: "account",
        requestOrigin: "https://site.example.com",
        requiredAccess: "authenticated",
        runtimeRoute: appRoute("public-site", "site", "authenticated"),
        safeReturnTo: "/blog/shipping-schema-backed-authoring?ref=nav",
      }),
    ).toMatchObject({
      kind: "handoff",
      target: {
        access: "authenticated",
        appInstallId: "site",
        routeId: "route:public-site:site",
        storageIdentity: "app:site",
        targetOrigin: "https://site.example.com",
        targetProfile: "public-site",
      },
    });
  });

  it("binds cross-origin owner handoff to the instance control plane", () => {
    expect(
      planProtectedRouteAuthRedirect({
        authOrigin: "https://auth.example.com",
        entry: "handoff",
        requestOrigin: "https://admin.example.com",
        requiredAccess: "owner",
        runtimeRoute: instanceRoute("owner"),
        safeReturnTo: "/deployments",
      }),
    ).toEqual({
      authOrigin: "https://auth.example.com",
      entryPath: INSTANCE_AUTH_HANDOFF_START_PATH,
      kind: "handoff",
      returnTo: "/deployments",
      target: {
        access: "owner",
        routeId: "route:instance:admin",
        storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
        targetOrigin: "https://admin.example.com",
        targetProfile: "instance",
      },
    });
  });

  it("binds mapped Program screen admission above an anonymous route floor", () => {
    const anonymousInstanceRoute = {
      ...instanceRoute("management"),
      access: "anonymous" as const,
    };

    expect(
      planProtectedRouteAuthRedirect({
        allowRouteAccessElevation: true,
        authOrigin: "https://auth.example.com",
        entry: "account",
        requestOrigin: "https://admin.example.com",
        requiredAccess: "authenticated",
        runtimeRoute: anonymousInstanceRoute,
        safeReturnTo: "/deployments",
      }),
    ).toMatchObject({
      kind: "handoff",
      target: {
        access: "authenticated",
        routeId: "route:instance:admin",
        storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
        targetOrigin: "https://admin.example.com",
        targetProfile: "instance",
      },
    });

    expect(
      instanceAuthCallbackReservationFromFacts({
        effectiveAccess: "authenticated",
        pathname: INSTANCE_AUTH_HANDOFF_CALLBACK_PATH,
        requestOrigin: "https://admin.example.com",
        runtimeRoute: anonymousInstanceRoute,
      }),
    ).toMatchObject({
      kind: "reserved",
      target: {
        access: "authenticated",
        routeId: "route:instance:admin",
      },
    });
  });

  it("keeps missing targets on the auth account surface and rejects unsafe return facts", () => {
    expect(
      planProtectedRouteAuthRedirect({
        authOrigin: "https://auth.example.com",
        entry: "account",
        requestOrigin: "https://tasks.example.com",
        requiredAccess: "authenticated",
        runtimeRoute: { ...appRoute("app", "tasks", "authenticated"), target: undefined },
        safeReturnTo: "/schema",
      }),
    ).toEqual({
      kind: "account",
      location: "https://auth.example.com/formless/auth?returnTo=%2Fschema",
      returnTo: "/schema",
    });

    expect(
      planProtectedRouteAuthRedirect({
        authOrigin: "https://auth.example.com",
        entry: "account",
        requestOrigin: "https://tasks.example.com",
        requiredAccess: "authenticated",
        runtimeRoute: appRoute("app", "tasks", "authenticated"),
        safeReturnTo: undefined,
      }),
    ).toEqual({
      error: "Handoff return target must be path-only.",
      kind: "invalid-return-target",
    });
  });

  it("does not start cross-origin handoff without a target or across insufficient access", () => {
    expect(
      planProtectedRouteAuthRedirect({
        authOrigin: "https://auth.example.com",
        entry: "handoff",
        requestOrigin: "https://tasks.example.com",
        requiredAccess: "authenticated",
        runtimeRoute: undefined,
        safeReturnTo: "/schema",
      }),
    ).toEqual({ kind: "unavailable" });
    expect(
      planProtectedRouteAuthRedirect({
        authOrigin: "https://auth.example.com",
        entry: "handoff",
        requestOrigin: "https://tasks.example.com",
        requiredAccess: "owner",
        runtimeRoute: appRoute("app", "tasks", "authenticated"),
        safeReturnTo: "/schema",
      }),
    ).toEqual({ kind: "unavailable" });
  });

  it("reserves mapped callbacks with exact route target bindings", () => {
    const callback = {
      pathname: INSTANCE_AUTH_HANDOFF_CALLBACK_PATH,
      requestOrigin: "https://tasks.example.com",
      runtimeRoute: appRoute("app", "tasks", "authenticated"),
    };

    expect(instanceAuthCallbackReservationFromFacts(callback)).toEqual({
      kind: "reserved",
      target: {
        access: "authenticated",
        appInstallId: "tasks",
        routeId: "route:app:tasks",
        storageIdentity: "app:tasks",
        targetOrigin: "https://tasks.example.com",
        targetProfile: "app",
      },
    });
    expect(
      instanceAuthCallbackReservationFromFacts({
        ...callback,
        requestOrigin: "https://admin.example.com",
        runtimeRoute: instanceRoute("owner"),
      }),
    ).toEqual({
      kind: "reserved",
      target: {
        access: "owner",
        routeId: "route:instance:admin",
        storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
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
    expect(
      instanceAuthCallbackReservationFromFacts({
        ...callback,
        pathname: "/schema",
      }),
    ).toEqual({ kind: "not-callback" });
  });

  it("binds installed APIs and mapped instance management only to matching route targets", () => {
    const appRuntimeRoute = appRoute("app", "tasks", "authenticated");

    expect(
      installedAppApiRouteAccessFromFacts({
        requestOrigin: "https://tasks.example.com",
        runtimeRoute: appRuntimeRoute,
        storageIdentity: "app:tasks",
      }),
    ).toEqual({
      access: "authenticated",
      target: {
        access: "authenticated",
        appInstallId: "tasks",
        routeId: "route:app:tasks",
        storageIdentity: "app:tasks",
        targetOrigin: "https://tasks.example.com",
        targetProfile: "app",
      },
    });
    expect(
      installedAppApiRouteAccessFromFacts({
        requestOrigin: "https://tasks.example.com",
        runtimeRoute: appRuntimeRoute,
        storageIdentity: "app:other",
      }),
    ).toEqual({});
    expect(
      installedAppApiRouteAccessFromFacts({
        requestOrigin: "https://tasks.example.com",
        runtimeRoute: { ...appRuntimeRoute, access: "anonymous" },
        storageIdentity: "app:tasks",
      }),
    ).toEqual({ access: "anonymous" });

    expect(
      mappedInstanceManagementTargetFromFacts({
        requestOrigin: "https://admin.example.com",
        runtimeRoute: instanceRoute("owner"),
      }),
    ).toEqual({
      access: "owner",
      routeId: "route:instance:admin",
      storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
      targetOrigin: "https://admin.example.com",
      targetProfile: "instance",
    });
    expect(
      mappedInstanceManagementTargetFromFacts({
        requestOrigin: "https://admin.example.com",
        runtimeRoute: instanceRoute("authenticated"),
      }),
    ).toBeUndefined();
    expect(
      mappedInstanceManagementTargetFromFacts({
        requestOrigin: "https://tasks.example.com",
        runtimeRoute: appRuntimeRoute,
      }),
    ).toBeUndefined();
  });

  it("binds management access and required app role into route targets", () => {
    const appAdminRoute = {
      ...appRoute("app", "tasks", "authenticated"),
      requiredRole: "app.admin" as const,
    };

    expect(
      planProtectedRouteAuthRedirect({
        authOrigin: "https://auth.example.com",
        entry: "handoff",
        requestOrigin: "https://tasks.example.com",
        requiredAccess: "authenticated",
        runtimeRoute: appAdminRoute,
        safeReturnTo: "/schema",
      }),
    ).toMatchObject({
      kind: "handoff",
      target: {
        access: "authenticated",
        appInstallId: "tasks",
        requiredRole: "app.admin",
      },
    });
    expect(
      mappedInstanceManagementTargetFromFacts({
        requestOrigin: "https://admin.example.com",
        runtimeRoute: instanceRoute("management"),
      }),
    ).toMatchObject({
      access: "management",
      targetProfile: "instance",
    });
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

function appRoute(
  targetProfile: "app" | "public-site",
  installId: string,
  access: "authenticated" | "owner",
): InstanceRuntimeMountRouteResolution {
  const target = installedAppStorageIdentity({
    installId,
    packageAppKey: installId === "tasks" ? "crm" : installId,
  });

  if (!target) {
    throw new Error(`Missing ${installId} test app storage identity.`);
  }

  return {
    access,
    id: `route:${targetProfile}:${installId}`,
    kind: "mount",
    matchHost: `${installId}.example.com`,
    matchPath: "/",
    matchPrefix: "/",
    target,
    targetProfile,
  };
}
