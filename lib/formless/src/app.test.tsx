import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { describe, expect, it } from "vite-plus/test";
import { App, type AppRouteComponents } from "./app.tsx";
import {
  createDevRuntimeProfile,
  createPublishedSiteRuntimeProfile,
  type RuntimeProfile,
} from "./app/runtime-profile.ts";

describe("application route selection", () => {
  it("selects Program surfaces inside the application shell", () => {
    const instance = renderRoute("/");
    const crmProgramScreen = renderRoute("/crm/audiences");

    expect(instance).toContain('data-surface="application-shell"');
    expect(instance).toContain('data-route="instance"');
    expect(crmProgramScreen).toContain('data-surface="application-shell"');
    expect(crmProgramScreen).toContain('data-route="instance"');
    expect(crmProgramScreen).not.toContain('data-schema-key="crm"');
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
});

function renderRoute(
  path: string,
  options: {
    localWorkspaceGatewayAvailable?: boolean;
    runtimeProfile?: RuntimeProfile;
  } = {},
) {
  return renderToStaticMarkup(
    <Router ssrPath={path}>
      <App
        localWorkspaceGatewayAvailable={options.localWorkspaceGatewayAvailable}
        routeComponents={routeComponents()}
        runtimeProfile={options.runtimeProfile ?? createDevRuntimeProfile()}
      />
    </Router>,
  );
}

function routeComponents(): AppRouteComponents {
  return {
    AccessRoute: () => <output data-route="access" />,
    ApplicationShellRuntimeBoundary: ({ children }) => (
      <section data-surface="application-shell">{children}</section>
    ),
    AuthAccountRoute: () => <output data-route="auth-account" />,
    CollaboratorInvitationAcceptanceRoute: () => <output data-route="invitation" />,
    InstanceShellRoute: () => <output data-route="instance" />,
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
