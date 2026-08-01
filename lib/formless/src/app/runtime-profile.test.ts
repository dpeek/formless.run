import { describe, expect, it } from "vite-plus/test";
import {
  createDevWorkbenchRuntimeProfile,
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
  it("resolves instance and dev Program shell profiles", () => {
    const instance = createInstanceRuntimeProfile();
    const dev = createDevWorkbenchRuntimeProfile();

    expect(instance).toMatchObject({ instanceShell: true, kind: "instance", shell: "instance" });
    expect(dev).toMatchObject({ instanceShell: true, kind: "dev", shell: "dev" });
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

  it("keeps the dev public Site preview on current preview routes", () => {
    const profile = createDevWorkbenchRuntimeProfile();

    expect(profile.publicSitePreview).toMatchObject({
      homeRoute: "/pages/home",
      linkMode: "preview",
      rootRoute: "/pages",
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

  it("uses the dev profile as the fallback", () => {
    expect(resolveRuntimeProfile({ profile: "unknown" }).kind).toBe("dev");
    expect(resolveRuntimeProfile({ hostname: "unknown.formless.local" }).kind).toBe("dev");
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
  });
});
