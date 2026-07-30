import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { describe, expect, it } from "vite-plus/test";
import type { AppInstall } from "@dpeek/formless-installed-apps";
import { App, type AppRouteComponents } from "./app.tsx";
import type { ClientAppTarget } from "./client/app-target.ts";
import {
  createDevRuntimeProfile,
  createPublishedSiteRuntimeProfile,
  type RuntimeProfile,
} from "./app/runtime-profile.ts";
import { bundledSourceSchemaHashFixtures } from "./shared/upgrade-migrations.ts";

describe("application route selection", () => {
  it("selects instance and generated app surfaces inside the application shell", () => {
    const instance = renderRoute("/");
    const sourceApp = renderRoute("/site/completed");

    expect(instance).toContain('data-surface="application-shell"');
    expect(instance).toContain('data-route="instance"');
    expect(sourceApp).toContain('data-surface="application-shell"');
    expect(sourceApp).toContain('data-route="home"');
    expect(sourceApp).toContain('data-schema-key="site"');
    expect(sourceApp).toContain('data-screen-path="/completed"');
    expect(sourceApp).toContain('data-target-kind="none"');
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

    expect(localSession).toContain('data-route="local-session"');
    expect(account).toContain('data-route="auth-account"');
    expect(ownerSetup).toContain('data-route="auth-account"');
    expect(publishedSite).toContain('data-route="public-site"');
    expect(publishedSite).toContain('data-link-mode="published"');
    expect(publishedSite).toContain('data-slug="blog/shipping"');
    expect(`${localSession}${account}${publishedSite}`).not.toContain(
      'data-surface="application-shell"',
    );
  });

  it("passes installed admin and public route targets to the selected surfaces", () => {
    const install = siteInstall();
    const admin = renderRoute("/apps/personal/settings", { installs: [install] });
    const publicSite = renderRoute("/sites/personal/blog/shipping", { installs: [install] });

    expect(admin).toContain('data-surface="application-shell"');
    expect(admin).toContain('data-route="home"');
    expect(admin).toContain('data-schema-key="site"');
    expect(admin).toContain('data-screen-path="/settings"');
    expect(admin).toContain('data-target-kind="appInstall"');
    expect(admin).toContain('data-install-id="personal"');
    expect(admin).toContain('data-workspace-href="/sites/personal"');
    expect(publicSite).toContain('data-route="public-site"');
    expect(publicSite).toContain('data-link-mode="installed"');
    expect(publicSite).toContain('data-route-base="/sites/personal"');
    expect(publicSite).toContain('data-slug="blog/shipping"');
    expect(publicSite).toContain('data-target-kind="appInstall"');
    expect(publicSite).toContain('data-install-id="personal"');
    expect(publicSite).not.toContain('data-surface="application-shell"');
  });
});

function renderRoute(
  path: string,
  options: {
    installs?: readonly AppInstall[];
    localWorkspaceGatewayAvailable?: boolean;
    runtimeProfile?: RuntimeProfile;
  } = {},
) {
  return renderToStaticMarkup(
    <Router ssrPath={path}>
      <App
        installedAppRouteInstalls={options.installs}
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
    ApplicationShellRuntimeBoundary: ({ children, routeWorld }) => (
      <section data-surface="application-shell" data-world={routeWorld?.app.key}>
        {children}
      </section>
    ),
    AuthAccountRoute: () => <output data-route="auth-account" />,
    CollaboratorInvitationAcceptanceRoute: () => <output data-route="invitation" />,
    HomeRoute: ({ schemaKey, screenPath, target, workspaceActions }) => (
      <output
        data-install-id={targetInstallId(target)}
        data-route="home"
        data-schema-key={schemaKey}
        data-screen-path={screenPath}
        data-target-kind={targetKind(target)}
      >
        {workspaceActions?.map((action) => (
          <span data-workspace-href={action.href} key={action.id} />
        ))}
      </output>
    ),
    InstanceShellRoute: () => <output data-route="instance" />,
    LocalSessionRoute: () => <output data-route="local-session" />,
    AccountSignInRoute: () => <output data-route="account-sign-in" />,
    SitePageRoute: ({ linkMode, routeBase, slug, target }) => (
      <output
        data-install-id={targetInstallId(target)}
        data-link-mode={linkMode}
        data-route="public-site"
        data-route-base={routeBase}
        data-slug={slug}
        data-target-kind={targetKind(target)}
      />
    ),
  };
}

function targetKind(target: ClientAppTarget | undefined) {
  return typeof target === "string" ? "schemaKey" : (target?.kind ?? "none");
}

function targetInstallId(target: ClientAppTarget | undefined) {
  return typeof target === "object" && target.kind === "appInstall" ? target.installId : undefined;
}

function siteInstall(): AppInstall {
  return {
    adminRoute: "/apps/personal",
    createdAt: "2026-05-25T00:00:00.000Z",
    installId: "personal",
    label: "Personal Site",
    packageAppKey: "site",
    packageRevision: 1,
    publicRoute: "/sites/personal",
    publicRoutePrefix: "/sites/personal/",
    registrationPolicy: "closed",
    sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
    status: "installed",
    updatedAt: "2026-05-25T00:00:00.000Z",
  };
}
