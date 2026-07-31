import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { describe, expect, it } from "vite-plus/test";
import type { AppInstall, InstallableAppPackage } from "@dpeek/formless-installed-apps";
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
    expect(publishedSite).toContain('data-target-kind="program"');
    expect(previewSite).toContain('data-link-mode="preview"');
    expect(previewSite).toContain('data-slug="blog/shipping"');
    expect(previewSite).toContain('data-target-kind="program"');
    expect(`${localSession}${account}${publishedSite}${previewSite}`).not.toContain(
      'data-surface="application-shell"',
    );
  });

  it("passes installed admin targets and fails closed without a package renderer adapter", () => {
    const appPackage = privateSitePackage();
    const install = privateSiteInstall(appPackage);
    const admin = renderRoute("/apps/private-site/settings", {
      installs: [install],
      packages: [appPackage],
    });
    const publicSite = renderRoute("/sites/private-site/blog/shipping", {
      installs: [install],
      packages: [appPackage],
    });

    expect(admin).toContain('data-surface="application-shell"');
    expect(admin).toContain('data-route="home"');
    expect(admin).toContain('data-schema-key="private-site"');
    expect(admin).toContain('data-screen-path="/settings"');
    expect(admin).toContain('data-target-kind="appInstall"');
    expect(admin).toContain('data-install-id="private-site"');
    expect(admin).toContain('data-workspace-href="/sites/private-site"');
    expect(publicSite).toContain("Unsupported public Site package");
    expect(publicSite).toContain("private-site");
    expect(publicSite).not.toContain('data-surface="application-shell"');
  });
});

function renderRoute(
  path: string,
  options: {
    installs?: readonly AppInstall[];
    packages?: readonly InstallableAppPackage[];
    localWorkspaceGatewayAvailable?: boolean;
    runtimeProfile?: RuntimeProfile;
  } = {},
) {
  return renderToStaticMarkup(
    <Router ssrPath={path}>
      <App
        installedAppRouteInstalls={options.installs}
        installedAppRoutePackages={options.packages}
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

function privateSiteInstall(appPackage: InstallableAppPackage): AppInstall {
  return {
    adminRoute: "/apps/private-site",
    createdAt: "2026-05-25T00:00:00.000Z",
    installId: "private-site",
    label: "Private Site",
    packageAppKey: appPackage.packageAppKey,
    packageRevision: appPackage.packageRevision,
    publicRoute: "/sites/private-site",
    publicRoutePrefix: "/sites/private-site/",
    registrationPolicy: "closed",
    sourceSchemaHash: appPackage.sourceSchemaHash,
    status: "installed",
    updatedAt: "2026-05-25T00:00:00.000Z",
  };
}

function privateSitePackage(): InstallableAppPackage {
  return {
    adminRouteBase: "/apps",
    defaultInstallId: "private-site",
    description: "Workspace-linked public Site package.",
    label: "Private Site",
    packageAppKey: "private-site",
    packageRevision: 7,
    publicRouteBase: "/sites",
    sourceOrigin: "workspace",
    sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
    sourceSchemaKey: "private-site",
    sourceSchemaLocation: {
      kind: "workspace",
      key: "private-site",
      path: "source/schema.json",
    },
    supportsMultipleInstalls: false,
  };
}
