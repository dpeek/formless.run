import { describe, expect, it } from "vite-plus/test";
import {
  createInstanceRuntimeProfile,
  createPublishedSiteRuntimeProfile,
  FORMLESS_RUNTIME_PROFILE_META_NAME,
  readRuntimeProfileDocumentHint,
  resolveRuntimeProfile,
  runtimeBrowserRoutePatterns,
  runtimeRoutePolicy,
  selectBrowserRuntimeProfileHint,
} from "./runtime-profile.ts";

describe("runtime profile resolver", () => {
  it("resolves the instance Program shell profile", () => {
    const instance = createInstanceRuntimeProfile();

    expect(instance).toMatchObject({ instanceShell: true, kind: "instance", shell: "instance" });
    expect(runtimeRoutePolicy(instance)).toEqual({
      accountSessionBrowserRoutes: true,
      instanceBrowserRoutes: true,
    });
    expect(runtimeBrowserRoutePatterns(instance)).toEqual({
      authAccountGateRoutePattern: "/formless/auth/*",
      authAccountRoute: "/formless/auth",
      authAccountSetupRoute: "/formless/auth/setup",
      authAccountSignInRoute: "/formless/auth/sign-in",
      instanceShellRoute: "/",
      localSessionRoute: "/local-session",
    });
  });

  it("resolves the published Site profile without generated admin routes", () => {
    const profile = createPublishedSiteRuntimeProfile();

    expect(profile).toMatchObject({ kind: "publishedSite", shell: "publishedSite" });
    expect(profile.publishedSite).toEqual({ homeSlug: "home", rootRoute: "/", routePattern: "/*" });
    expect(runtimeBrowserRoutePatterns(profile)).toEqual({
      authAccountGateRoutePattern: "/formless/auth/*",
      authAccountRoute: "/formless/auth",
      authAccountSetupRoute: "/formless/auth/setup",
      authAccountSignInRoute: "/formless/auth/sign-in",
    });
  });

  it("uses the instance profile as the fallback", () => {
    expect(resolveRuntimeProfile({ profile: "unknown" }).kind).toBe("instance");
    expect(resolveRuntimeProfile({ hostname: "unknown.formless.local" }).kind).toBe("instance");
    expect(resolveRuntimeProfile({ profile: "instance" }).kind).toBe("instance");
    expect(resolveRuntimeProfile({ profile: "publishedSite" }).kind).toBe("publishedSite");
  });

  it("uses the document profile hint before the environment fallback", () => {
    const doc = {
      querySelector: (selector: string) =>
        selector === `meta[name="${FORMLESS_RUNTIME_PROFILE_META_NAME}"]`
          ? { getAttribute: (name: string) => (name === "content" ? "publishedSite" : null) }
          : null,
    };

    expect(readRuntimeProfileDocumentHint(doc)).toBe("publishedSite");
    expect(
      selectBrowserRuntimeProfileHint({
        documentProfile: "publishedSite",
        envProfile: "instance",
      }),
    ).toBe("publishedSite");
    expect(
      selectBrowserRuntimeProfileHint({
        documentProfile: "unknown",
        envProfile: "instance",
      }),
    ).toBe("instance");
  });
});
