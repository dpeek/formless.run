import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { describe, expect, it } from "vite-plus/test";
import type { AppSchema } from "@dpeek/formless-schema";
import { App, type AppRouteComponents } from "./app.tsx";
import type { ProgramBrowserRuntimeDefinition } from "./program/composition.ts";
import {
  createDevRuntimeProfile,
  createInstanceRuntimeProfile,
  createPublishedSiteRuntimeProfile,
  type RuntimeProfile,
} from "./app/runtime-profile.ts";
import { formlessProgramSchema } from "./program/runtime.ts";

describe("application route selection", () => {
  it("selects Program surfaces inside the application shell", () => {
    const instance = renderRoute("/settings/access");
    const contactIntakeScreen = renderRoute("/site/subscribers");

    expect(instance).toContain('data-surface="application-shell"');
    expect(instance).toContain('data-route="access"');
    expect(contactIntakeScreen).toContain('data-surface="application-shell"');
    expect(contactIntakeScreen).toContain('data-route="instance"');
  });

  it("selects local session, account, and published Site surfaces outside the shell", () => {
    const localSession = renderRoute("/local-session", {
      localWorkspaceGatewayAvailable: true,
    });
    const account = renderRoute("/formless/auth", {
      runtimeProfile: createPublishedSiteRuntimeProfile(),
    });
    const ownerSetup = renderRoute("/formless/auth/setup", {
      runtimeProfile: createPublishedSiteRuntimeProfile(),
    });
    const publishedSite = renderRoute("/blog/shipping", {
      runtimeProfile: createPublishedSiteRuntimeProfile(),
    });
    const previewSite = renderRoute("/pages/blog/shipping");

    expect(localSession).toContain('data-route="local-session"');
    expect(account).toContain('data-route="auth-account"');
    expect(ownerSetup).toContain('data-route="auth-account"');
    expect(publishedSite).toContain('data-route="public-site"');
    expect(publishedSite).toContain('data-link-mode="published"');
    expect(publishedSite).toContain('data-slug="blog/shipping"');
    expect(previewSite).toContain('data-link-mode="preview"');
    expect(previewSite).toContain('data-slug="blog/shipping"');
    expect(`${localSession}${account}${publishedSite}${previewSite}`).not.toContain(
      'data-surface="application-shell"',
    );
  });

  it("does not mount Site routes when the Program has no Site browser surface", () => {
    const runtimeWithoutSite: ProgramBrowserRuntimeDefinition = {
      target: "browser",
      projections: [],
      surfaces: [],
    };

    const preview = renderRoute("/pages/home", { browserRuntime: runtimeWithoutSite });
    const published = renderRoute("/", {
      browserRuntime: runtimeWithoutSite,
      runtimeProfile: createPublishedSiteRuntimeProfile(),
    });

    expect(preview).not.toContain('data-route="public-site"');
    expect(published).not.toContain('data-route="public-site"');
  });

  it("mounts product behavior and loading contributions by relocated screen key", () => {
    const programSchema = relocatedProductScreenSchema();
    const runtimeProfile = createInstanceRuntimeProfile();
    const routes = renderRoute("/infrastructure/routes", { programSchema, runtimeProfile });
    const access = renderRoute("/people/access", { programSchema, runtimeProfile });
    const previousAccessPath = renderRoute("/access", { programSchema, runtimeProfile });

    expect(routes).toContain('data-route="instance"');
    expect(routes).toContain('data-screen-key="routes"');
    expect(routes).toContain('data-screen-path="/infrastructure/routes"');
    expect(routes).toContain('data-routes-screen-path="/infrastructure/routes"');
    expect(routes).toContain('data-initial-contributions="instance-management"');
    expect(access).toContain('data-route="access"');
    expect(access).toContain('data-initial-contributions="instance-access"');
    expect(previousAccessPath).not.toContain('data-surface="application-shell"');
    expect(previousAccessPath).not.toContain('data-route="access"');
  });

  it("mounts default product screens under settings and leaves top-level paths unclaimed", () => {
    const runtimeProfile = createInstanceRuntimeProfile();
    const routes = renderRoute("/settings/routes", { runtimeProfile });
    const access = renderRoute("/settings/access", { runtimeProfile });
    const previousRoutesPath = renderRoute("/routes", { runtimeProfile });
    const previousAccessPath = renderRoute("/access", { runtimeProfile });
    const rawDeploymentPath = renderRoute("/deployments", { runtimeProfile });
    const rawSettingsPath = renderRoute("/settings", { runtimeProfile });

    expect(routes).toContain('data-screen-key="routes"');
    expect(routes).toContain('data-routes-screen-path="/settings/routes"');
    expect(access).toContain('data-route="access"');
    expect(
      `${previousRoutesPath}${previousAccessPath}${rawDeploymentPath}${rawSettingsPath}`,
    ).not.toContain('data-surface="application-shell"');
    expect(previousAccessPath).not.toContain('data-route="access"');
  });
});

function renderRoute(
  path: string,
  options: {
    browserRuntime?: ProgramBrowserRuntimeDefinition;
    localWorkspaceGatewayAvailable?: boolean;
    programSchema?: AppSchema;
    runtimeProfile?: RuntimeProfile;
  } = {},
) {
  return renderToStaticMarkup(
    <Router ssrPath={path}>
      <App
        browserRuntime={options.browserRuntime}
        localWorkspaceGatewayAvailable={options.localWorkspaceGatewayAvailable}
        programSchema={options.programSchema}
        routeComponents={routeComponents()}
        runtimeProfile={options.runtimeProfile ?? createDevRuntimeProfile()}
      />
    </Router>,
  );
}

function routeComponents(): AppRouteComponents {
  return {
    AccessRoute: () => <output data-route="access" />,
    ApplicationShellRuntimeBoundary: ({ children, initialRouteContractContributions }) => (
      <section
        data-initial-contributions={initialRouteContractContributions
          ?.map(([contributorId]) => contributorId)
          .join(",")}
        data-surface="application-shell"
      >
        {children}
      </section>
    ),
    AuthAccountRoute: () => <output data-route="auth-account" />,
    CollaboratorInvitationAcceptanceRoute: () => <output data-route="invitation" />,
    InstanceShellRoute: ({ routesScreenPath, screenKey, screenPath }) => (
      <output
        data-route="instance"
        data-routes-screen-path={routesScreenPath}
        data-screen-key={screenKey}
        data-screen-path={screenPath}
      />
    ),
    LocalSessionRoute: () => <output data-route="local-session" />,
    AccountSignInRoute: () => <output data-route="account-sign-in" />,
    SitePageRoute: ({ linkMode, routeBase, slug }) => (
      <output
        data-link-mode={linkMode}
        data-route="public-site"
        data-route-base={routeBase}
        data-slug={slug}
      />
    ),
  };
}

function relocatedProductScreenSchema(): AppSchema {
  return {
    ...formlessProgramSchema,
    screens: formlessProgramSchema.screens.map((screen) =>
      screen.key === "routes"
        ? { ...screen, path: "/infrastructure/routes" }
        : screen.key === "access"
          ? { ...screen, path: "/people/access" }
          : screen,
    ),
  };
}
