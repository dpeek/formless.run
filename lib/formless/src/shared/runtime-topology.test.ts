import { describe, expect, it } from "vite-plus/test";

import {
  acceptsRuntimeHtml,
  effectiveRuntimeRouteAccess,
  isRuntimeRouteAccess,
  isRuntimeApiPath,
  isRuntimeClientShellRoute,
  isRuntimeAuthAccountRoutePath,
  isRuntimeDynamicSiteIconPath,
  isRuntimeInstanceProfileClientShellRoute,
  isRuntimePublishedProfileClientShellRoute,
  isRuntimeReadRequestMethod,
  looksLikeRuntimeStaticAssetPath,
  matchRuntimeRouteBase,
  parseRuntimeProfileKind,
  parseRuntimeRouteAccess,
  publishedSiteRedirectLocation,
  resolveRuntimeProfileKind,
  runtimeRouteFromBase,
  runtimeAuthAccountGateRoutes,
  runtimeProfileKindFromHost,
  runtimeRoutePolicyForProfileKind,
  stricterRuntimeRouteAccess,
  runtimeTopologyRoutes,
} from "./runtime-topology.ts";

describe("runtime topology", () => {
  it("parses the shared runtime profile vocabulary", () => {
    expect(parseRuntimeProfileKind("instance")).toBe("instance");
    expect(parseRuntimeProfileKind("dev")).toBe("dev");
    expect(parseRuntimeProfileKind("siteAuthoring")).toBeUndefined();
    expect(parseRuntimeProfileKind("publishedSite")).toBe("publishedSite");
    expect(parseRuntimeProfileKind("")).toBeUndefined();
    expect(parseRuntimeProfileKind("missing")).toBeUndefined();
  });

  it("parses route access and resolves stricter effective access", () => {
    expect(parseRuntimeRouteAccess("anonymous")).toBe("anonymous");
    expect(parseRuntimeRouteAccess("authenticated")).toBe("authenticated");
    expect(parseRuntimeRouteAccess("management")).toBe("management");
    expect(parseRuntimeRouteAccess("owner")).toBe("owner");
    expect(parseRuntimeRouteAccess("")).toBeUndefined();
    expect(parseRuntimeRouteAccess("admin")).toBeUndefined();
    expect(isRuntimeRouteAccess("anonymous")).toBe(true);
    expect(isRuntimeRouteAccess("authenticated")).toBe(true);
    expect(isRuntimeRouteAccess("management")).toBe(true);
    expect(isRuntimeRouteAccess("owner")).toBe(true);
    expect(isRuntimeRouteAccess("admin")).toBe(false);
    expect(stricterRuntimeRouteAccess("anonymous", "anonymous")).toBe("anonymous");
    expect(stricterRuntimeRouteAccess("anonymous", "authenticated")).toBe("authenticated");
    expect(stricterRuntimeRouteAccess("authenticated", "anonymous")).toBe("authenticated");
    expect(stricterRuntimeRouteAccess("authenticated", "owner")).toBe("owner");
    expect(stricterRuntimeRouteAccess("authenticated", "management")).toBe("management");
    expect(stricterRuntimeRouteAccess("management", "owner")).toBe("owner");
    expect(stricterRuntimeRouteAccess("owner", "management")).toBe("owner");
    expect(stricterRuntimeRouteAccess("owner", "authenticated")).toBe("owner");
    expect(stricterRuntimeRouteAccess("anonymous", "owner")).toBe("owner");
    expect(stricterRuntimeRouteAccess("owner", "anonymous")).toBe("owner");
    expect(effectiveRuntimeRouteAccess({ routeAccess: "anonymous" })).toBe("anonymous");
    expect(effectiveRuntimeRouteAccess({ routeAccess: "authenticated" })).toBe("authenticated");
    expect(effectiveRuntimeRouteAccess({ routeAccess: "management" })).toBe("management");
    expect(effectiveRuntimeRouteAccess({ routeAccess: "owner" })).toBe("owner");
    expect(
      effectiveRuntimeRouteAccess({ routeAccess: "authenticated", screenAccess: "anonymous" }),
    ).toBe("authenticated");
    expect(
      effectiveRuntimeRouteAccess({ routeAccess: "authenticated", screenAccess: "owner" }),
    ).toBe("owner");
    expect(effectiveRuntimeRouteAccess({ routeAccess: "anonymous", screenAccess: "owner" })).toBe(
      "owner",
    );
  });

  it("infers profile kinds from current host conventions", () => {
    expect(runtimeProfileKindFromHost("instance.formless.local")).toBe("instance");
    expect(runtimeProfileKindFromHost("site-authoring.formless.local")).toBeUndefined();
    expect(runtimeProfileKindFromHost("published-site.formless.local")).toBe("publishedSite");
    expect(runtimeProfileKindFromHost("FORMLESS.TWITCHY.WORKERS.DEV")).toBe("publishedSite");
    expect(runtimeProfileKindFromHost("workers.dev")).toBe("publishedSite");
    expect(runtimeProfileKindFromHost("formless.local")).toBeUndefined();
  });

  it("uses explicit profile intent before host inference and falls back to dev", () => {
    expect(
      resolveRuntimeProfileKind({
        hostname: "published-site.formless.local",
        profile: "instance",
      }),
    ).toBe("instance");
    expect(resolveRuntimeProfileKind({ hostname: "formless.local" })).toBe("dev");
    expect(resolveRuntimeProfileKind({ fallback: "instance", profile: "missing" })).toBe(
      "instance",
    );
  });

  it("answers shared route policy by profile kind", () => {
    expect(runtimeRoutePolicyForProfileKind("instance")).toEqual({
      instanceBrowserRoutes: true,
      accountSessionBrowserRoutes: true,
      workspaceGatewayApiRoutes: true,
    });
    expect(runtimeRoutePolicyForProfileKind("dev")).toEqual({
      instanceBrowserRoutes: true,
      accountSessionBrowserRoutes: true,
      workspaceGatewayApiRoutes: true,
    });
    expect(runtimeRoutePolicyForProfileKind("publishedSite")).toMatchObject({
      accountSessionBrowserRoutes: true,
      workspaceGatewayApiRoutes: false,
    });
  });

  it("owns Program and public Site route constants", () => {
    expect(runtimeTopologyRoutes.accessRoute).toBe("/access");
    expect(runtimeTopologyRoutes.authAccountRoute).toBe("/formless/auth");
    expect(runtimeTopologyRoutes.authAccountGateRoutePattern).toBe("/formless/auth/*");
    expect(runtimeTopologyRoutes.authAccountSetupRoute).toBe("/formless/auth/setup");
    expect(runtimeTopologyRoutes.authAccountSignInRoute).toBe("/formless/auth/sign-in");
    expect(runtimeTopologyRoutes.formlessRouteBase).toBe("/formless");
    expect(runtimeTopologyRoutes.publicSiteHomeSlug).toBe("home");
    expect(runtimeTopologyRoutes.publicSitePreviewRouteBase).toBe("/pages");
    expect(runtimeAuthAccountGateRoutes).toEqual({
      credential: "/formless/auth/credential",
      emailVerification: "/formless/auth/email-verification",
      invitation: "/formless/auth/invitation",
      profileCompletion: "/formless/auth/profile-completion",
      termsAcceptance: "/formless/auth/terms-acceptance",
    });
  });

  it("matches and builds runtime routes under shared route bases", () => {
    expect(matchRuntimeRouteBase("/records/personal", "/records")).toEqual({
      pathSuffix: "",
      routeBase: "/records",
      routeId: "personal",
      suffixSegments: [],
    });
    expect(matchRuntimeRouteBase("/records/personal/history", "/records")).toEqual({
      pathSuffix: "/history",
      routeBase: "/records",
      routeId: "personal",
      suffixSegments: ["history"],
    });
    expect(matchRuntimeRouteBase("/sites/personal/blog/post", "/sites")).toEqual({
      pathSuffix: "/blog/post",
      routeBase: "/sites",
      routeId: "personal",
      suffixSegments: ["blog", "post"],
    });
    expect(matchRuntimeRouteBase("/records", "/records")).toBeUndefined();
    expect(matchRuntimeRouteBase("/record/personal", "/records")).toBeUndefined();
    expect(runtimeRouteFromBase("/records", "personal")).toBe("/records/personal");
    expect(runtimeRouteFromBase("/sites", "personal", "/blog/post")).toBe(
      "/sites/personal/blog/post",
    );
  });

  it("classifies client-shell routes for general, published, and instance profiles", () => {
    expect(isRuntimeClientShellRoute("/pages/home")).toBe(true);
    expect(isRuntimeClientShellRoute("/tasks")).toBe(true);
    expect(isRuntimeClientShellRoute("/crm/audiences")).toBe(false);
    expect(isRuntimeClientShellRoute("/site/schema")).toBe(false);
    expect(isRuntimeClientShellRoute("/schema")).toBe(true);
    expect(isRuntimeClientShellRoute("/formless/auth")).toBe(true);
    expect(isRuntimeClientShellRoute("/formless/auth/profile-completion")).toBe(true);
    expect(isRuntimeClientShellRoute("/formless/auth/sign-in")).toBe(true);
    expect(isRuntimeClientShellRoute("/formless/auth/setup")).toBe(true);
    expect(isRuntimeClientShellRoute("/formless/auth/invitations/accept")).toBe(true);
    expect(isRuntimeClientShellRoute("/local-session")).toBe(true);
    expect(isRuntimeClientShellRoute("/login")).toBe(false);
    expect(isRuntimeClientShellRoute("/setup")).toBe(false);
    expect(isRuntimeClientShellRoute("/rates")).toBe(false);
    expect(isRuntimeClientShellRoute("/blog")).toBe(false);

    expect(isRuntimePublishedProfileClientShellRoute("/formless/auth")).toBe(true);
    expect(isRuntimePublishedProfileClientShellRoute("/formless/auth/profile-completion")).toBe(
      true,
    );
    expect(isRuntimePublishedProfileClientShellRoute("/formless/auth/callback")).toBe(true);
    expect(isRuntimePublishedProfileClientShellRoute("/formless/auth/sign-in")).toBe(true);
    expect(isRuntimePublishedProfileClientShellRoute("/formless/auth/setup")).toBe(true);
    expect(isRuntimePublishedProfileClientShellRoute("/login")).toBe(false);
    expect(isRuntimePublishedProfileClientShellRoute("/setup")).toBe(false);
    expect(isRuntimePublishedProfileClientShellRoute("/local-session")).toBe(false);
    expect(isRuntimePublishedProfileClientShellRoute("/pages/home")).toBe(false);
    expect(isRuntimePublishedProfileClientShellRoute("/site")).toBe(false);

    expect(isRuntimeInstanceProfileClientShellRoute("/")).toBe(true);
    expect(isRuntimeInstanceProfileClientShellRoute("/access")).toBe(true);
    expect(isRuntimeInstanceProfileClientShellRoute("/local-session")).toBe(true);
    expect(isRuntimeInstanceProfileClientShellRoute("/formless/auth")).toBe(true);
    expect(isRuntimeInstanceProfileClientShellRoute("/formless/auth/profile-completion")).toBe(
      true,
    );
    expect(isRuntimeInstanceProfileClientShellRoute("/formless/auth/sign-in")).toBe(true);
    expect(isRuntimeInstanceProfileClientShellRoute("/formless/auth/setup")).toBe(true);
    expect(isRuntimeInstanceProfileClientShellRoute("/deployments")).toBe(true);
    expect(isRuntimeInstanceProfileClientShellRoute("/tasks")).toBe(true);
    expect(isRuntimeInstanceProfileClientShellRoute("/pages/home")).toBe(false);
    expect(isRuntimeAuthAccountRoutePath("/formless/auth")).toBe(true);
    expect(isRuntimeAuthAccountRoutePath("/formless/auth/profile-completion")).toBe(true);
    expect(isRuntimeAuthAccountRoutePath("/formless/authentic")).toBe(false);
  });

  it("classifies API, read method, dynamic icon, static asset, and HTML accept facts", () => {
    expect(isRuntimeApiPath("/api")).toBe(true);
    expect(isRuntimeApiPath("/api/site/bootstrap")).toBe(true);
    expect(isRuntimeApiPath("/site")).toBe(false);
    expect(isRuntimeReadRequestMethod("GET")).toBe(true);
    expect(isRuntimeReadRequestMethod("HEAD")).toBe(true);
    expect(isRuntimeReadRequestMethod("POST")).toBe(false);
    expect(isRuntimeDynamicSiteIconPath("/favicon.svg")).toBe(true);
    expect(isRuntimeDynamicSiteIconPath("/assets/favicon.svg")).toBe(false);
    expect(looksLikeRuntimeStaticAssetPath("/assets/index.js")).toBe(true);
    expect(looksLikeRuntimeStaticAssetPath("/@vite/client")).toBe(true);
    expect(looksLikeRuntimeStaticAssetPath("/blog/post")).toBe(false);
    expect(acceptsRuntimeHtml(null)).toBe(true);
    expect(acceptsRuntimeHtml("text/html")).toBe(true);
    expect(acceptsRuntimeHtml("*/*")).toBe(true);
    expect(acceptsRuntimeHtml("application/json")).toBe(false);
  });

  it("builds published Site redirects from old preview routes", () => {
    expect(publishedSiteRedirectLocation("/pages")).toBe("/");
    expect(publishedSiteRedirectLocation("/pages/")).toBe("/");
    expect(publishedSiteRedirectLocation("/pages/home")).toBe("/");
    expect(publishedSiteRedirectLocation("/pages/projects")).toBe("/projects");
    expect(publishedSiteRedirectLocation("/pages/blog/agents", "?ref=old")).toBe(
      "/blog/agents?ref=old",
    );
    expect(publishedSiteRedirectLocation("/pages//projects")).toBe("/projects");
    expect(publishedSiteRedirectLocation("/pages/logo.svg")).toBe("/logo.svg");
    expect(publishedSiteRedirectLocation("/blog")).toBeUndefined();
  });
});
