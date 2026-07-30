import { describe, expect, it } from "vite-plus/test";

import {
  runtimeTopologyRoutes,
  runtimeProfileKinds,
  runtimeRoutePolicyForProfileKind,
} from "../shared/runtime-topology.ts";
import {
  areSchemaKeyApiRoutesEnabledForRequest,
  isClientShellRoute,
  isDynamicSiteIconPath,
  mappedAuthOriginRouteDecisionFromFacts,
  mappedRuntimeRoutePolicyFromFacts,
  ownerBrowserRouteAccessForRequest,
  protectedBrowserRouteDecisionFromFacts,
  publishedSiteRedirectForRequest,
  resolveProgramScreenRouteTargetFromFacts,
  resolveProtectedBrowserRouteTargetFromFacts,
  resolveWorkerRuntimeRequestTopology,
  shouldDeferToStaticAssets,
  shouldBlockMappedSiteHostBrowserRoute,
  shouldHandlePublishedSiteDocument,
  shouldHandlePublishedSiteIndexingResource,
  shouldRedirectAnonymousProtectedBrowserRoute,
  shouldRedirectAnonymousOwnerBrowserRoute,
  shouldServeMappedAppHostClientShell,
  workerRuntimeRoutePolicy,
} from "./routing.ts";

describe("Worker document routing", () => {
  it("classifies Worker request topology from shared runtime policy", () => {
    const preview = resolveWorkerRuntimeRequestTopology(
      documentRequest("http://published-site.example.com/pages/home?ref=old"),
    );
    const robots = resolveWorkerRuntimeRequestTopology(
      new Request("http://example.com/robots.txt"),
      {
        profile: "publishedSite",
      },
    );
    const icon = resolveWorkerRuntimeRequestTopology(
      new Request("http://example.com/favicon.svg"),
      {
        profile: "publishedSite",
      },
    );
    const media = resolveWorkerRuntimeRequestTopology(
      new Request("http://example.com/api/formless/media/images"),
      { profile: "instance" },
    );

    expect(preview.profileKind).toBe("publishedSite");
    expect(preview.routePolicy).toEqual({
      instanceBrowserRoutes: false,
      installedAppApiRoutes: true,
      schemaKeyApiRoutes: true,
      schemaKeyBrowserRoutes: false,
      workspaceGatewayApiRoutes: false,
    });
    expect(preview.clientShellRoute).toBe(true);
    expect(preview.publishedSitePreviewRedirectLocation).toBe("/?ref=old");
    expect(preview.acceptsHtml).toBe(true);

    expect(robots.publishedSiteIndexingResourcePath).toBe(true);
    expect(robots.staticAssetPath).toBe(true);
    expect(icon.dynamicSiteIconPath).toBe(true);
    expect(icon.staticAssetPath).toBe(true);
    expect(media.apiPath).toBe(true);
    expect(media.routePolicy.schemaKeyApiRoutes).toBe(false);
  });

  it("lets Worker adapter helpers reuse precomputed request topology", () => {
    const document = documentRequest("http://example.com/blog");
    const documentTopology = resolveWorkerRuntimeRequestTopology(document, {
      profile: "publishedSite",
    });
    const mappedAppShell = documentRequest("http://tasks.example.com/");
    const mappedAppTopology = resolveWorkerRuntimeRequestTopology(mappedAppShell, {
      profile: "app",
    });

    expect(shouldHandlePublishedSiteDocument(document, documentTopology)).toBe(true);
    expect(shouldDeferToStaticAssets(document, documentTopology)).toBe(false);
    expect(shouldServeMappedAppHostClientShell(mappedAppShell, mappedAppTopology)).toBe(true);
  });

  it("derives mapped-host runtime and auth-route eligibility from explicit route facts", () => {
    const mappedAppRoute = {
      access: "owner",
      id: "route:host:app:tasks.example.com",
      kind: "mount",
      matchHost: "tasks.example.com",
      matchPath: "/",
      matchPrefix: "/",
      targetProfile: "app",
    } as const;
    const mappedSiteRoute = {
      ...mappedAppRoute,
      access: "anonymous",
      id: "route:host:site:www.example.com",
      matchHost: "www.example.com",
      targetProfile: "public-site",
    } as const;
    const mappedInstanceRoute = {
      ...mappedAppRoute,
      id: "route:host:instance:admin.example.com",
      matchHost: "admin.example.com",
      targetProfile: "instance",
    } as const;
    const hostlessAppRoute = {
      ...mappedAppRoute,
      id: "route:app:tasks",
      matchHost: undefined,
      matchPath: "/apps/tasks",
      matchPrefix: undefined,
    } as const;

    expect(
      mappedRuntimeRoutePolicyFromFacts({
        configuredRuntimeProfile: "publishedSite",
        runtimeRoute: mappedAppRoute,
      }),
    ).toEqual({
      blocksAuthOriginRoutes: true,
      blocksSchemaKeyApiRoutes: true,
      mappedTargetProfile: "app",
      runtimeProfile: "app",
    });
    expect(
      mappedRuntimeRoutePolicyFromFacts({
        configuredRuntimeProfile: "instance",
        runtimeRoute: mappedSiteRoute,
      }),
    ).toEqual({
      blocksAuthOriginRoutes: true,
      blocksSchemaKeyApiRoutes: true,
      mappedTargetProfile: "public-site",
      runtimeProfile: "instance",
    });
    expect(
      mappedRuntimeRoutePolicyFromFacts({
        configuredRuntimeProfile: "publishedSite",
        runtimeRoute: mappedInstanceRoute,
      }),
    ).toEqual({
      blocksAuthOriginRoutes: false,
      blocksSchemaKeyApiRoutes: false,
      mappedTargetProfile: "instance",
      runtimeProfile: "instance",
    });
    expect(
      mappedRuntimeRoutePolicyFromFacts({
        configuredRuntimeProfile: "dev",
        runtimeRoute: hostlessAppRoute,
      }),
    ).toEqual({
      blocksAuthOriginRoutes: false,
      blocksSchemaKeyApiRoutes: false,
      runtimeProfile: "dev",
    });

    const signInTopology = resolveWorkerRuntimeRequestTopology(
      documentRequest("https://tasks.example.com/formless/auth/sign-in?returnTo=%2Fschema"),
      { profile: "app" },
    );
    const mappedAppPolicy = mappedRuntimeRoutePolicyFromFacts({ runtimeRoute: mappedAppRoute });

    expect(
      mappedAuthOriginRouteDecisionFromFacts({
        authOriginRead: false,
        mappedRoutePolicy: mappedAppPolicy,
        requestOrigin: "https://tasks.example.com",
        reservedAuthOriginRoute: true,
        topology: signInTopology,
      }),
    ).toEqual({ kind: "read-auth-origin" });
    expect(
      mappedAuthOriginRouteDecisionFromFacts({
        authOrigin: "https://auth.example.com",
        authOriginRead: true,
        mappedRoutePolicy: mappedAppPolicy,
        requestOrigin: "https://tasks.example.com",
        reservedAuthOriginRoute: true,
        topology: signInTopology,
      }),
    ).toEqual({
      kind: "redirect",
      location: "https://auth.example.com/formless/auth/sign-in?returnTo=%2Fschema",
    });
    expect(
      mappedAuthOriginRouteDecisionFromFacts({
        authOriginRead: true,
        mappedRoutePolicy: mappedAppPolicy,
        requestOrigin: "https://tasks.example.com",
        reservedAuthOriginRoute: true,
        topology: resolveWorkerRuntimeRequestTopology(
          documentRequest("https://tasks.example.com/formless/auth/profile-completion"),
          { profile: "app" },
        ),
      }),
    ).toEqual({ kind: "not-found" });
    expect(
      mappedAuthOriginRouteDecisionFromFacts({
        authOriginRead: false,
        mappedRoutePolicy: mappedRuntimeRoutePolicyFromFacts({
          runtimeRoute: mappedInstanceRoute,
        }),
        requestOrigin: "https://admin.example.com",
        reservedAuthOriginRoute: true,
        topology: signInTopology,
      }),
    ).toEqual({ kind: "continue" });
  });

  it("plans protected browser access from topology, route, and session-result facts", () => {
    const mappedRoute = {
      access: "authenticated",
      id: "route:host:app:tasks.example.com",
      kind: "mount",
      matchHost: "tasks.example.com",
      matchPath: "/",
      matchPrefix: "/",
      targetProfile: "app",
    } as const;
    const topology = resolveWorkerRuntimeRequestTopology(
      documentRequest("https://tasks.example.com/schema?view=board"),
      { profile: "app" },
    );

    expect(
      protectedBrowserRouteDecisionFromFacts({
        runtimeRoute: mappedRoute,
        session: "unread",
        topology,
      }),
    ).toEqual({ kind: "validate-session", requiredAccess: "authenticated" });
    expect(
      protectedBrowserRouteDecisionFromFacts({
        runtimeRoute: mappedRoute,
        session: "allowed",
        topology,
      }),
    ).toEqual({ kind: "continue" });
    expect(
      protectedBrowserRouteDecisionFromFacts({
        runtimeRoute: mappedRoute,
        session: "account-completion-required",
        topology,
      }),
    ).toEqual({ kind: "account-completion", requiredAccess: "authenticated" });
    expect(
      protectedBrowserRouteDecisionFromFacts({
        runtimeRoute: { ...mappedRoute, access: "owner" },
        session: "rejected",
        topology,
      }),
    ).toEqual({ kind: "authenticate", requiredAccess: "owner" });
    expect(
      protectedBrowserRouteDecisionFromFacts({
        runtimeRoute: mappedRoute,
        session: "unread",
        topology: resolveWorkerRuntimeRequestTopology(
          new Request("https://tasks.example.com/schema", {
            headers: { Accept: "application/json" },
          }),
          { profile: "app" },
        ),
      }),
    ).toEqual({ kind: "continue" });
    const programTopology = resolveWorkerRuntimeRequestTopology(
      documentRequest("https://admin.example.com/access"),
      { profile: "instance" },
    );

    expect(
      protectedBrowserRouteDecisionFromFacts({
        session: "unread",
        topology: programTopology,
      }),
    ).toEqual({
      kind: "validate-session",
      programScreen: {
        access: { role: "administrator" },
        key: "access",
        label: "Access",
        path: "/access",
        requiredAccess: "authenticated",
        routeAccess: "anonymous",
      },
      requiredAccess: "authenticated",
    });

    const mappedInstanceRoute = {
      ...mappedRoute,
      access: "owner",
      id: "route:host:instance:admin.example.com",
      matchHost: "admin.example.com",
      targetProfile: "instance",
    } as const;

    expect(
      resolveProgramScreenRouteTargetFromFacts({
        runtimeRoute: mappedInstanceRoute,
        topology: programTopology,
      }),
    ).toMatchObject({
      access: { role: "administrator" },
      key: "access",
      requiredAccess: "owner",
      routeAccess: "owner",
    });

    expect(
      resolveProtectedBrowserRouteTargetFromFacts({
        topology: resolveWorkerRuntimeRequestTopology(
          new Request("https://admin.example.com/access", {
            headers: { Accept: "application/json" },
          }),
          { profile: "instance" },
        ),
      }),
    ).toMatchObject({
      programScreen: {
        access: { role: "administrator" },
        key: "access",
      },
      requiredAccess: "authenticated",
    });
  });

  it("routes published Site documents to the Worker SSR path only in the published profile", () => {
    expect(
      shouldHandlePublishedSiteDocument(documentRequest("http://example.com/"), {
        profile: "publishedSite",
      }),
    ).toBe(true);
    expect(
      shouldHandlePublishedSiteDocument(documentRequest("http://published-site.example.com/")),
    ).toBe(true);
    expect(
      shouldHandlePublishedSiteDocument(
        documentRequest("https://formless.twitchy.workers.dev/blog"),
      ),
    ).toBe(true);
    expect(
      shouldHandlePublishedSiteDocument(documentRequest("http://example.com/blog/post"), {
        profile: "publishedSite",
      }),
    ).toBe(true);
    expect(
      shouldHandlePublishedSiteDocument(
        new Request("http://example.com/projects", {
          headers: { Accept: "text/html" },
          method: "HEAD",
        }),
        { profile: "publishedSite" },
      ),
    ).toBe(true);
    expect(shouldHandlePublishedSiteDocument(documentRequest("http://example.com/"))).toBe(false);
    expect(
      shouldHandlePublishedSiteDocument(documentRequest("http://published-site.example.com/"), {
        profile: "dev",
      }),
    ).toBe(false);
    expect(
      shouldHandlePublishedSiteDocument(documentRequest("http://example.com/"), {
        profile: "siteAuthoring",
      }),
    ).toBe(false);
  });

  it("marks non-published document routes for asset serving fallback", () => {
    expect(shouldDeferToStaticAssets(documentRequest("http://example.com/"))).toBe(true);
    expect(shouldDeferToStaticAssets(documentRequest("http://example.com/blog/post"))).toBe(true);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/"), {
        profile: "publishedSite",
      }),
    ).toBe(false);
    expect(shouldDeferToStaticAssets(documentRequest("http://published-site.example.com/"))).toBe(
      false,
    );
    expect(
      shouldDeferToStaticAssets(documentRequest("https://formless.twitchy.workers.dev/blog")),
    ).toBe(false);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://published-site.example.com/"), {
        profile: "dev",
      }),
    ).toBe(true);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/admin"), {
        profile: "siteAuthoring",
      }),
    ).toBe(true);
  });

  it("keeps product instance browser fallback to instance route roots", () => {
    const instanceProfile = { profile: "instance" };

    expect(shouldDeferToStaticAssets(documentRequest("http://example.com/"), instanceProfile)).toBe(
      true,
    );
    expect(
      shouldDeferToStaticAssets(
        documentRequest(`http://example.com${runtimeTopologyRoutes.authAccountSetupRoute}`),
        instanceProfile,
      ),
    ).toBe(true);
    expect(
      shouldDeferToStaticAssets(
        documentRequest(`http://example.com${runtimeTopologyRoutes.authAccountSignInRoute}`),
        instanceProfile,
      ),
    ).toBe(true);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/setup"), instanceProfile),
    ).toBe(false);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/login"), instanceProfile),
    ).toBe(false);
    expect(
      shouldDeferToStaticAssets(
        documentRequest("http://example.com/local-session"),
        instanceProfile,
      ),
    ).toBe(true);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/access"), instanceProfile),
    ).toBe(true);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/deployments"), instanceProfile),
    ).toBe(true);
    expect(
      shouldDeferToStaticAssets(
        documentRequest("http://example.com/apps/personal"),
        instanceProfile,
      ),
    ).toBe(true);
    expect(
      shouldDeferToStaticAssets(
        documentRequest("http://example.com/sites/personal/blog"),
        instanceProfile,
      ),
    ).toBe(true);
    expect(
      shouldDeferToStaticAssets(
        documentRequest("http://example.com/assets/index.js"),
        instanceProfile,
      ),
    ).toBe(true);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/tasks"), instanceProfile),
    ).toBe(true);
    expect(
      shouldDeferToStaticAssets(
        documentRequest("http://example.com/crm/audiences"),
        instanceProfile,
      ),
    ).toBe(false);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/site/schema"), instanceProfile),
    ).toBe(false);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/pages/home"), instanceProfile),
    ).toBe(false);
  });

  it("marks only owner browser routes for anonymous login redirects", () => {
    const instanceProfile = { profile: "instance" };
    const publicSiteRoute = {
      access: "anonymous",
      id: "route:site:public-site",
      kind: "mount",
      matchPath: "/sites/personal",
      matchPrefix: "/sites/personal/",
      surface: "public-site",
      targetProfile: "public-site",
    } as const;
    const anonymousAppRoute = {
      access: "anonymous",
      id: "route:tasks:admin",
      kind: "mount",
      matchPath: "/apps/tasks",
      surface: "admin",
      targetProfile: "app",
    } as const;
    const mappedOwnerAppRoute = {
      access: "owner",
      id: "route:host:app:tasks.example.com",
      kind: "mount",
      matchHost: "tasks.example.com",
      matchPath: "/",
      matchPrefix: "/",
      surface: "admin",
      targetProfile: "app",
    } as const;
    const mappedAuthenticatedAppRoute = {
      ...mappedOwnerAppRoute,
      access: "authenticated",
      id: "route:host:app:authenticated-tasks.example.com",
    } as const;
    const mappedProtectedSiteRoute = {
      access: "authenticated",
      id: "route:host:public-site:site.example.com",
      kind: "mount",
      matchHost: "site.example.com",
      matchPath: "/",
      matchPrefix: "/",
      surface: "public-site",
      targetProfile: "public-site",
    } as const;

    expect(
      shouldRedirectAnonymousOwnerBrowserRoute(
        documentRequest("http://example.com/"),
        instanceProfile,
      ),
    ).toBe(false);
    expect(
      shouldRedirectAnonymousOwnerBrowserRoute(
        documentRequest("http://example.com/apps/personal?screen=routes"),
        instanceProfile,
      ),
    ).toBe(true);
    expect(
      shouldRedirectAnonymousOwnerBrowserRoute(
        documentRequest("http://example.com/deployments"),
        instanceProfile,
      ),
    ).toBe(false);
    expect(
      shouldRedirectAnonymousOwnerBrowserRoute(
        documentRequest("http://example.com/access"),
        instanceProfile,
      ),
    ).toBe(false);
    expect(
      shouldRedirectAnonymousProtectedBrowserRoute(
        documentRequest("http://example.com/access"),
        instanceProfile,
      ),
    ).toBe(true);
    expect(
      shouldRedirectAnonymousOwnerBrowserRoute(
        new Request("http://example.com/apps/personal/schema", {
          headers: { Accept: "text/html" },
          method: "HEAD",
        }),
        instanceProfile,
      ),
    ).toBe(true);
    expect(
      shouldRedirectAnonymousOwnerBrowserRoute(
        documentRequest("http://example.com/login"),
        instanceProfile,
      ),
    ).toBe(false);
    expect(
      shouldRedirectAnonymousOwnerBrowserRoute(
        documentRequest("http://example.com/setup"),
        instanceProfile,
      ),
    ).toBe(false);
    expect(
      shouldRedirectAnonymousOwnerBrowserRoute(
        documentRequest("http://example.com/local-session"),
        instanceProfile,
      ),
    ).toBe(false);
    expect(
      shouldRedirectAnonymousOwnerBrowserRoute(
        documentRequest("http://example.com/sites/personal/blog"),
        instanceProfile,
        publicSiteRoute,
      ),
    ).toBe(false);
    expect(
      shouldRedirectAnonymousOwnerBrowserRoute(
        documentRequest("http://example.com/assets/index.js"),
        instanceProfile,
      ),
    ).toBe(false);
    expect(
      shouldRedirectAnonymousOwnerBrowserRoute(
        new Request("http://example.com/apps/personal", {
          headers: { Accept: "application/json" },
        }),
        instanceProfile,
      ),
    ).toBe(false);
    expect(
      shouldRedirectAnonymousOwnerBrowserRoute(
        documentRequest("http://example.com/apps/personal"),
        { profile: "publishedSite" },
      ),
    ).toBe(false);
    expect(
      shouldRedirectAnonymousOwnerBrowserRoute(
        documentRequest("https://tasks.example.com/schema"),
        { profile: "app" },
        mappedOwnerAppRoute,
      ),
    ).toBe(true);
    expect(
      shouldRedirectAnonymousProtectedBrowserRoute(
        documentRequest("https://tasks.example.com/schema"),
        { profile: "app" },
        mappedAuthenticatedAppRoute,
      ),
    ).toBe(true);
    expect(
      shouldRedirectAnonymousOwnerBrowserRoute(
        documentRequest("https://tasks.example.com/schema"),
        { profile: "app" },
        mappedAuthenticatedAppRoute,
      ),
    ).toBe(false);
    expect(
      shouldRedirectAnonymousProtectedBrowserRoute(
        documentRequest("https://site.example.com/blog"),
        { profile: "publishedSite" },
        mappedProtectedSiteRoute,
      ),
    ).toBe(true);
    expect(
      shouldRedirectAnonymousProtectedBrowserRoute(
        documentRequest("https://site.example.com/assets/index.js"),
        { profile: "publishedSite" },
        mappedProtectedSiteRoute,
      ),
    ).toBe(false);
    expect(
      ownerBrowserRouteAccessForRequest(
        documentRequest("http://example.com/apps/tasks"),
        instanceProfile,
        anonymousAppRoute,
      ),
    ).toBe("anonymous");
    expect(
      ownerBrowserRouteAccessForRequest(
        documentRequest("http://example.com/access"),
        instanceProfile,
      ),
    ).toBe("authenticated");
    expect(
      ownerBrowserRouteAccessForRequest(
        documentRequest("http://example.com/deployments"),
        instanceProfile,
      ),
    ).toBe("authenticated");
  });

  it("projects shared route policy by runtime profile", () => {
    for (const profileKind of runtimeProfileKinds) {
      const sharedPolicy = runtimeRoutePolicyForProfileKind(profileKind);

      expect(workerRuntimeRoutePolicy({ profile: profileKind })).toEqual({
        instanceBrowserRoutes: sharedPolicy.instanceBrowserRoutes,
        installedAppApiRoutes: sharedPolicy.installedAppApiRoutes,
        schemaKeyApiRoutes: sharedPolicy.schemaKeyApiRoutes,
        schemaKeyBrowserRoutes: sharedPolicy.schemaKeyBrowserRoutes,
        workspaceGatewayApiRoutes: sharedPolicy.workspaceGatewayApiRoutes,
      });
    }
    expect(
      Object.fromEntries(
        runtimeProfileKinds.map((profileKind) => [
          profileKind,
          workerRuntimeRoutePolicy({ profile: profileKind }).workspaceGatewayApiRoutes,
        ]),
      ),
    ).toEqual({
      app: false,
      dev: true,
      instance: true,
      publishedSite: false,
      siteAuthoring: false,
    });
    expect(
      areSchemaKeyApiRoutesEnabledForRequest(
        new Request("http://instance.example.com/api/site/bootstrap"),
      ),
    ).toBe(false);
    expect(
      areSchemaKeyApiRoutesEnabledForRequest(new Request("http://example.com/api/site/bootstrap"), {
        profile: "siteAuthoring",
      }),
    ).toBe(true);
  });

  it("lets explicit profile config override host-derived profile config", () => {
    expect(
      shouldHandlePublishedSiteDocument(documentRequest("http://published-site.example.com/"), {
        profile: "app",
      }),
    ).toBe(false);
    expect(
      shouldHandlePublishedSiteDocument(documentRequest("http://app.example.com/"), {
        profile: "publishedSite",
      }),
    ).toBe(true);
    expect(
      shouldHandlePublishedSiteDocument(
        documentRequest("https://formless.twitchy.workers.dev/blog"),
        {
          profile: "dev",
        },
      ),
    ).toBe(false);
  });

  it("keeps API, Formless view, preview redirect, generated app, app-profile, asset, and non-HTML routes out of SSR", () => {
    const nonSsrRequests = [
      documentRequest("http://example.com/api/site/tree/home"),
      documentRequest("http://example.com/formless/auth/callback"),
      documentRequest("http://example.com/pages/home"),
      documentRequest("http://example.com/tasks"),
      documentRequest("http://example.com/crm/audiences"),
      documentRequest("http://example.com/site/schema"),
      documentRequest("http://example.com/schema"),
      documentRequest(`http://example.com${runtimeTopologyRoutes.authAccountSetupRoute}`),
      documentRequest(`http://example.com${runtimeTopologyRoutes.authAccountSignInRoute}`),
      documentRequest("http://example.com/local-session"),
      documentRequest("http://example.com/apps/personal"),
      documentRequest("http://example.com/sites/personal"),
      documentRequest("http://example.com/assets/index.js"),
      new Request("http://example.com/@vite/client", { headers: { Accept: "*/*" } }),
      new Request("http://example.com/@react-refresh", { headers: { Accept: "*/*" } }),
      documentRequest("http://example.com/favicon.svg"),
      documentRequest("http://example.com/favicon.ico"),
      documentRequest("http://example.com/apple-touch-icon.png"),
      new Request("http://example.com/blog/post", { headers: { Accept: "application/json" } }),
    ];

    expect(
      nonSsrRequests.map((request) =>
        shouldHandlePublishedSiteDocument(request, { profile: "publishedSite" }),
      ),
    ).toEqual(nonSsrRequests.map(() => false));

    expect(shouldHandlePublishedSiteDocument(documentRequest("http://app.example.com/"))).toBe(
      false,
    );
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/formless/auth/callback"), {
        profile: "publishedSite",
      }),
    ).toBe(true);
  });

  it("routes published Site indexing resources before static asset fallback", () => {
    expect(
      shouldHandlePublishedSiteIndexingResource(new Request("http://example.com/robots.txt"), {
        profile: "publishedSite",
      }),
    ).toBe(true);
    expect(
      shouldHandlePublishedSiteIndexingResource(new Request("http://example.com/sitemap.xml"), {
        profile: "publishedSite",
      }),
    ).toBe(true);
    expect(
      shouldHandlePublishedSiteIndexingResource(new Request("http://example.com/sitemap.xml")),
    ).toBe(false);
    expect(
      shouldHandlePublishedSiteIndexingResource(
        new Request("http://example.com/sitemap.xml", { method: "HEAD" }),
        { profile: "publishedSite" },
      ),
    ).toBe(true);
    expect(
      shouldDeferToStaticAssets(new Request("http://example.com/sitemap.xml"), {
        profile: "publishedSite",
      }),
    ).toBe(true);
  });

  it("blocks generated app paths from published document and static shell handling", () => {
    const generatedAppRequests = [
      documentRequest("http://example.com/tasks"),
      documentRequest("http://example.com/crm/audiences"),
      documentRequest("http://example.com/site/schema"),
      documentRequest("http://example.com/schema"),
    ];

    expect(
      generatedAppRequests.map((request) =>
        shouldHandlePublishedSiteDocument(request, { profile: "publishedSite" }),
      ),
    ).toEqual(generatedAppRequests.map(() => false));

    expect(
      generatedAppRequests.map((request) =>
        shouldDeferToStaticAssets(request, { profile: "publishedSite" }),
      ),
    ).toEqual(generatedAppRequests.map(() => false));
  });

  it("treats deployments path as a published Site document path", () => {
    expect(
      shouldBlockMappedSiteHostBrowserRoute(documentRequest("http://example.com/deployments"), {
        profile: "publishedSite",
      }),
    ).toBe(false);
    expect(
      shouldHandlePublishedSiteDocument(documentRequest("http://example.com/deployments"), {
        profile: "publishedSite",
      }),
    ).toBe(true);
  });

  it("treats the former rates path as a published Site document path", () => {
    const request = documentRequest("http://example.com/rates");

    expect(shouldHandlePublishedSiteDocument(request, { profile: "publishedSite" })).toBe(true);
    expect(shouldDeferToStaticAssets(request, { profile: "publishedSite" })).toBe(false);
  });

  it("marks client-shell and static asset requests for asset serving fallback", () => {
    expect(shouldDeferToStaticAssets(documentRequest("http://example.com/pages/home"))).toBe(true);
    expect(shouldDeferToStaticAssets(documentRequest("http://example.com/apps/personal"))).toBe(
      true,
    );
    expect(shouldDeferToStaticAssets(documentRequest("http://example.com/sites/personal"))).toBe(
      true,
    );
    expect(
      shouldDeferToStaticAssets(
        documentRequest(`http://example.com${runtimeTopologyRoutes.authAccountSetupRoute}`),
      ),
    ).toBe(true);
    expect(
      shouldDeferToStaticAssets(
        documentRequest(`http://example.com${runtimeTopologyRoutes.authAccountSignInRoute}`),
      ),
    ).toBe(true);
    expect(shouldDeferToStaticAssets(documentRequest("http://example.com/setup"))).toBe(true);
    expect(shouldDeferToStaticAssets(documentRequest("http://example.com/login"))).toBe(true);
    expect(shouldDeferToStaticAssets(documentRequest("http://example.com/local-session"))).toBe(
      true,
    );
    expect(shouldDeferToStaticAssets(documentRequest("http://example.com/site"))).toBe(true);
    expect(shouldDeferToStaticAssets(documentRequest("http://app.example.com/setup"))).toBe(true);
    expect(shouldDeferToStaticAssets(documentRequest("http://app.example.com/login"))).toBe(true);
    expect(shouldDeferToStaticAssets(documentRequest("http://example.com/assets/index.js"))).toBe(
      true,
    );
    expect(
      shouldDeferToStaticAssets(
        new Request("http://example.com/@vite/client", { headers: { Accept: "*/*" } }),
      ),
    ).toBe(true);
    expect(
      shouldDeferToStaticAssets(
        new Request("http://example.com/@react-refresh", { headers: { Accept: "*/*" } }),
      ),
    ).toBe(true);
    expect(shouldDeferToStaticAssets(documentRequest("http://example.com/api/site/schema"))).toBe(
      false,
    );
    expect(
      shouldDeferToStaticAssets(
        new Request("http://example.com/pages/home", {
          headers: { Accept: "text/html" },
          method: "POST",
        }),
      ),
    ).toBe(false);
  });

  it("limits published profile static fallback to asset-like paths and owner shell routes", () => {
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/assets/index.js"), {
        profile: "publishedSite",
      }),
    ).toBe(true);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/favicon.svg"), {
        profile: "publishedSite",
      }),
    ).toBe(false);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/favicon.ico"), {
        profile: "publishedSite",
      }),
    ).toBe(false);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/apple-touch-icon.png"), {
        profile: "publishedSite",
      }),
    ).toBe(false);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/pages/home"), {
        profile: "publishedSite",
      }),
    ).toBe(false);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/setup"), {
        profile: "publishedSite",
      }),
    ).toBe(false);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/login"), {
        profile: "publishedSite",
      }),
    ).toBe(false);
    expect(
      shouldDeferToStaticAssets(
        documentRequest(`http://example.com${runtimeTopologyRoutes.authAccountSetupRoute}`),
        {
          profile: "publishedSite",
        },
      ),
    ).toBe(true);
    expect(
      shouldDeferToStaticAssets(
        documentRequest(`http://example.com${runtimeTopologyRoutes.authAccountSignInRoute}`),
        {
          profile: "publishedSite",
        },
      ),
    ).toBe(true);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/site"), {
        profile: "publishedSite",
      }),
    ).toBe(false);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/apps/personal"), {
        profile: "publishedSite",
      }),
    ).toBe(true);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/sites/personal"), {
        profile: "publishedSite",
      }),
    ).toBe(true);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/sites/personal/blog"), {
        profile: "publishedSite",
      }),
    ).toBe(true);
  });

  it("keeps dynamic root icon requests out of static fallback for read methods", () => {
    for (const method of ["GET", "HEAD"]) {
      for (const path of ["/favicon.svg", "/favicon.ico", "/apple-touch-icon.png"]) {
        expect(
          shouldDeferToStaticAssets(new Request(`http://example.com${path}`, { method }), {
            profile: "publishedSite",
          }),
        ).toBe(false);
        expect(
          shouldDeferToStaticAssets(new Request(`http://example.com${path}?v=preview`, { method })),
        ).toBe(false);
      }
    }

    expect(
      shouldDeferToStaticAssets(new Request("http://example.com/favicon.svg", { method: "POST" }), {
        profile: "publishedSite",
      }),
    ).toBe(false);
  });

  it("builds published Site redirects for old preview routes", () => {
    expect(
      publishedSiteRedirectForRequest(documentRequest("http://example.com/pages"), {
        profile: "publishedSite",
      }),
    ).toEqual({ location: "/", status: 308 });
    expect(
      publishedSiteRedirectForRequest(documentRequest("http://example.com/pages/"), {
        profile: "publishedSite",
      }),
    ).toEqual({ location: "/", status: 308 });
    expect(
      publishedSiteRedirectForRequest(documentRequest("http://example.com/pages/home"), {
        profile: "publishedSite",
      }),
    ).toEqual({ location: "/", status: 308 });
    expect(
      publishedSiteRedirectForRequest(documentRequest("http://example.com/pages/projects"), {
        profile: "publishedSite",
      }),
    ).toEqual({ location: "/projects", status: 308 });
    expect(
      publishedSiteRedirectForRequest(
        documentRequest("http://example.com/pages/blog/agents?ref=old"),
        {
          profile: "publishedSite",
        },
      ),
    ).toEqual({ location: "/blog/agents?ref=old", status: 308 });
    expect(
      publishedSiteRedirectForRequest(documentRequest("http://example.com/pages//projects"), {
        profile: "publishedSite",
      }),
    ).toEqual({ location: "/projects", status: 308 });
    expect(
      publishedSiteRedirectForRequest(
        new Request("http://example.com/pages/home", {
          headers: { Accept: "text/html" },
          method: "HEAD",
        }),
        { profile: "publishedSite" },
      ),
    ).toEqual({ location: "/", status: 308 });
  });

  it("does not redirect outside the published profile or for API, asset, or mutating requests", () => {
    expect(publishedSiteRedirectForRequest(documentRequest("http://example.com/pages/home"))).toBe(
      undefined,
    );
    expect(
      publishedSiteRedirectForRequest(documentRequest("http://example.com/pages/home"), {
        profile: "siteAuthoring",
      }),
    ).toBe(undefined);
    expect(
      publishedSiteRedirectForRequest(documentRequest("http://example.com/api/site/pages/home"), {
        profile: "publishedSite",
      }),
    ).toBe(undefined);
    expect(
      publishedSiteRedirectForRequest(documentRequest("http://example.com/pages/logo.svg"), {
        profile: "publishedSite",
      }),
    ).toBe(undefined);
    expect(
      publishedSiteRedirectForRequest(
        new Request("http://example.com/pages/home", {
          headers: { Accept: "text/html" },
          method: "POST",
        }),
        { profile: "publishedSite" },
      ),
    ).toBe(undefined);
  });

  it("recognizes generated app and preview route prefixes as client shell routes", () => {
    expect(isClientShellRoute("/pages/home")).toBe(true);
    expect(isClientShellRoute("/tasks")).toBe(true);
    expect(isClientShellRoute("/crm/audiences")).toBe(true);
    expect(isClientShellRoute("/site/schema")).toBe(true);
    expect(isClientShellRoute("/apps/personal")).toBe(true);
    expect(isClientShellRoute("/sites/personal/blog")).toBe(true);
    expect(isClientShellRoute("/formless/auth")).toBe(true);
    expect(isClientShellRoute("/formless/auth/profile-completion")).toBe(true);
    expect(isClientShellRoute(runtimeTopologyRoutes.authAccountSetupRoute)).toBe(true);
    expect(isClientShellRoute(runtimeTopologyRoutes.authAccountSignInRoute)).toBe(true);
    expect(isClientShellRoute("/setup")).toBe(false);
    expect(isClientShellRoute("/login")).toBe(false);
    expect(isClientShellRoute("/local-session")).toBe(true);
    expect(isClientShellRoute("/rates")).toBe(false);
    expect(isClientShellRoute("/blog")).toBe(false);
  });

  it("recognizes root Site icon convention paths as dynamic Worker routes", () => {
    expect(isDynamicSiteIconPath("/favicon.svg")).toBe(true);
    expect(isDynamicSiteIconPath("/favicon.ico")).toBe(true);
    expect(isDynamicSiteIconPath("/apple-touch-icon.png")).toBe(true);
    expect(isDynamicSiteIconPath("/assets/favicon.svg")).toBe(false);
  });
});

function documentRequest(url: string): Request {
  return new Request(url, { headers: { Accept: "text/html" } });
}
