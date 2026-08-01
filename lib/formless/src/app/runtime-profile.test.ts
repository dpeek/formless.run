import { describe, expect, it } from "vite-plus/test";
import {
  createDevWorkbenchRuntimeProfile,
  createInstanceRuntimeProfile,
  createPublishedSiteRuntimeProfile,
  FORMLESS_RUNTIME_PROFILE_META_NAME,
  findRuntimeWorldMountByRoute,
  readRuntimeProfileDocumentHint,
  resolveRuntimeProfile,
  runtimeBrowserRoutePatterns,
  runtimeRoutePolicy,
  runtimeScreenPathFromRoute,
  selectBrowserRuntimeProfileHint,
} from "./runtime-profile.ts";

describe("runtime profile resolver", () => {
  it("resolves instance and dev profiles without installed app mounts", () => {
    const instance = createInstanceRuntimeProfile();
    const dev = createDevWorkbenchRuntimeProfile();

    expect(instance).toMatchObject({ kind: "instance", shell: "instance", worlds: [] });
    expect(dev).toMatchObject({ kind: "dev", shell: "dev", worlds: [] });
    expect(findRuntimeWorldMountByRoute(instance, "/apps/tasks")).toBeUndefined();
    expect(findRuntimeWorldMountByRoute(dev, "/apps/tasks/schema")).toBeUndefined();
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

  it("keeps the dev public Site preview Program-native", () => {
    const profile = createDevWorkbenchRuntimeProfile();

    expect(profile.publicSitePreview).toMatchObject({
      homeRoute: "/pages/home",
      target: {
        storageIdentity: {
          authorityName: "instance:control-plane",
          kind: "program",
        },
      },
    });
  });

  it("resolves the published Site profile without generated admin routes", () => {
    const profile = createPublishedSiteRuntimeProfile();
    const world = profile.worlds[0];

    expect(profile).toMatchObject({ kind: "publishedSite", shell: "publishedSite" });
    expect(world).toMatchObject({ generatedRoutes: false, route: "/" });
    expect(runtimeBrowserRoutePatterns(profile)).toEqual({
      authAccountGateRoutePattern: "/formless/auth/*",
      authAccountRoute: "/formless/auth",
      authAccountSetupRoute: "/formless/auth/setup",
      authAccountSignInRoute: "/formless/auth/sign-in",
    });
    expect(world && runtimeScreenPathFromRoute(world, "/blog")).toBe("/blog");
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
