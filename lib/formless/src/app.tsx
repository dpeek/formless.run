import {
  lazy,
  Suspense,
  type ElementType,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { NotFoundRoute } from "./app/routes/not-found.tsx";
import { normalizeSitePageSlug } from "@dpeek/formless-site-app/public/react";
import {
  FormlessSitePageRenderer,
  FormlessSiteSystemStateRenderer,
} from "@dpeek/formless-renderer/site/renderer";
import "@dpeek/formless-renderer/site/global.css";
import {
  CoreSitePageRoute,
  type PublicSiteRouteInputProps,
  type PublicSiteRouteProps,
} from "./app/public-site-runtime.tsx";
import type { ApplicationShellRuntimeBoundaryProps } from "./app/application-shell-runtime.tsx";
import { selectGeneratedShellScope } from "./app/generated/application-shell-projection.ts";
import type {
  GeneratedWorkspaceRuntimeController,
  GeneratedWorkspaceSectionExternalAction,
} from "./app/generated/generated-workspace-runtime.tsx";
import type { HomeRouteClientLoadState } from "./app/routes/home.tsx";
import { sitePublicRenderer as workspaceSitePublicRenderer } from "virtual:formless/site-public-renderer/browser";
import {
  findRuntimeWorldMountByRoute,
  hasGeneratedRoutes,
  normalizeRuntimeBrowserPath,
  resolveRuntimeProfile,
  runtimeBrowserRoutePatterns,
  type RuntimeProfile,
  type RuntimeWorldMount,
} from "./app/runtime-profile.ts";
import type { ProgramClientSchemaKey, ProgramClientTarget } from "./client/program-target.ts";
import {
  authAccountContinuationLocationForReturnTarget,
  COLLABORATOR_INVITATION_ACCEPT_PATH,
  type AccountRedirectTarget,
} from "./shared/instance-auth.ts";
import { runtimeTopologyRoutes, type RuntimeRouteAccess } from "./shared/runtime-topology.ts";
import type { WorkspaceLinkActionContract } from "@dpeek/formless-presentation/contract";
import { initialInstanceManagementRuntimeContribution } from "./app/routes/instance-management-contract.ts";
import { FORMLESS_PROGRAM_SCREEN_PATHS } from "./program/runtime.ts";
import { projectApplicationSystemState } from "./app/routes/application-system-state-projection.ts";
import { ApplicationSystemStateRuntime } from "./app/routes/application-system-state-runtime.tsx";
import { useApplicationRootThemeRuntime } from "./app/application-root-context.tsx";
import { resolveProtectedRouteAccess } from "./app/protected-route-access.ts";

type HomeRouteProps = {
  clientSync?: boolean | undefined;
  onClientLoadStateChange?: ((state: HomeRouteClientLoadState) => void) | undefined;
  onGeneratedWorkspaceController?: (
    controller: GeneratedWorkspaceRuntimeController | undefined,
  ) => void;
  sectionExternalActions?: Readonly<
    Record<string, readonly GeneratedWorkspaceSectionExternalAction[] | undefined>
  >;
  target: ProgramClientTarget;
  schemaKey: ProgramClientSchemaKey;
  screenPath: string;
  workspaceActions?: readonly WorkspaceLinkActionContract[];
};

type InstanceShellRouteProps = {
  localWorkspaceGatewayAvailable?: boolean | undefined;
};

export type AppRouteComponents = {
  AccessRoute: ElementType;
  ApplicationShellRuntimeBoundary: ElementType<ApplicationShellRuntimeBoundaryProps>;
  AuthAccountRoute: ElementType;
  CollaboratorInvitationAcceptanceRoute: ElementType;
  HomeRoute: ElementType<HomeRouteProps>;
  InstanceShellRoute: ElementType<InstanceShellRouteProps>;
  LocalSessionRoute: ElementType;
  AccountSignInRoute: ElementType;
  SitePageRoute: ElementType<PublicSiteRouteProps>;
};

const defaultRouteComponents: AppRouteComponents = {
  AccessRoute: lazy(() =>
    import("./app/routes/access.tsx").then((module) => ({ default: module.AccessRoute })),
  ),
  ApplicationShellRuntimeBoundary: lazy(() =>
    import("./app/application-shell-runtime.tsx").then((module) => ({
      default: module.ApplicationShellRuntimeBoundary,
    })),
  ),
  AuthAccountRoute: lazy(() =>
    import("./app/routes/auth-account.tsx").then((module) => ({
      default: module.AuthAccountRoute,
    })),
  ),
  CollaboratorInvitationAcceptanceRoute: lazy(() =>
    import("./app/routes/collaborator-invitation-acceptance.tsx").then((module) => ({
      default: module.CollaboratorInvitationAcceptanceRoute,
    })),
  ),
  HomeRoute: lazy(() =>
    import("./app/routes/home.tsx").then((module) => ({ default: module.HomeRoute })),
  ),
  InstanceShellRoute: lazy(() =>
    import("./app/routes/instance-shell.tsx").then((module) => ({
      default: module.InstanceShellRoute,
    })),
  ),
  LocalSessionRoute: lazy(() =>
    import("./app/routes/local-session.tsx").then((module) => ({
      default: module.LocalSessionRoute,
    })),
  ),
  AccountSignInRoute: lazy(() =>
    import("./app/routes/account-sign-in.tsx").then((module) => ({
      default: module.AccountSignInRoute,
    })),
  ),
  SitePageRoute: CoreSitePageRoute,
};

export type AppProps = {
  localWorkspaceGatewayAvailable?: boolean;
  routeComponents?: Partial<AppRouteComponents>;
  runtimeProfile?: RuntimeProfile;
};

export function App({
  localWorkspaceGatewayAvailable: localWorkspaceGatewayAvailableProp,
  routeComponents: routeComponentOverrides,
  runtimeProfile: runtimeProfileProp,
}: AppProps = {}) {
  const [location] = useLocation();
  const runtimeProfile = useMemo(
    () => runtimeProfileProp ?? resolveRuntimeProfile(),
    [runtimeProfileProp],
  );
  const normalizedLocation = normalizeRuntimeBrowserPath(location);
  const browserRoutes = runtimeBrowserRoutePatterns(runtimeProfile);
  const runtime = (
    <AppRuntime
      localWorkspaceGatewayAvailable={localWorkspaceGatewayAvailableProp}
      location={location}
      routeComponents={routeComponentOverrides}
      runtimeProfile={runtimeProfile}
    />
  );

  return browserRoutes.instanceShellRoute &&
    FORMLESS_PROGRAM_SCREEN_PATHS.includes(normalizedLocation) ? (
    <ProtectedRouteGuard access="management">{runtime}</ProtectedRouteGuard>
  ) : (
    runtime
  );
}

function AppRuntime({
  localWorkspaceGatewayAvailable: localWorkspaceGatewayAvailableProp,
  location,
  routeComponents: routeComponentOverrides,
  runtimeProfile,
}: AppProps & { location: string; runtimeProfile: RuntimeProfile }) {
  const rootThemeRuntime = useApplicationRootThemeRuntime();
  const routeComponents = resolveAppRouteComponents(routeComponentOverrides);
  const browserRoutes = useMemo(
    () => runtimeBrowserRoutePatterns(runtimeProfile),
    [runtimeProfile],
  );
  const normalizedLocation = normalizeRuntimeBrowserPath(location);
  const initialRouteContractContributions = useMemo(() => {
    if (normalizedLocation === "/routes") {
      return [initialInstanceManagementRuntimeContribution];
    }
    return [];
  }, [normalizedLocation]);
  const localWorkspaceGatewayAvailable = useLocalWorkspaceGatewayAvailable(
    localWorkspaceGatewayAvailableProp,
    routeMayNeedLocalWorkspaceGateway(browserRoutes, normalizedLocation),
  );
  const routeWorld = findRuntimeWorldMountByRoute(runtimeProfile, location);

  const shellScope = selectGeneratedShellScope({
    currentPath: location,
    routeWorld,
    runtimeProfile,
  });

  if (!shellScope) {
    return (
      <AppRoutes
        localWorkspaceGatewayAvailable={localWorkspaceGatewayAvailable}
        routeComponents={routeComponents}
        runtimeProfile={runtimeProfile}
      />
    );
  }

  const ApplicationShellRuntimeBoundary = routeComponents.ApplicationShellRuntimeBoundary;

  return (
    <Suspense fallback={<RouteLoading />}>
      <ApplicationShellRuntimeBoundary
        applicationTheme={rootThemeRuntime}
        currentPath={location}
        initialRouteContractContributions={initialRouteContractContributions}
        routeWorld={routeWorld}
        runtimeProfile={runtimeProfile}
      >
        <AppRoutes
          localWorkspaceGatewayAvailable={localWorkspaceGatewayAvailable}
          routeComponents={routeComponents}
          runtimeProfile={runtimeProfile}
        />
      </ApplicationShellRuntimeBoundary>
    </Suspense>
  );
}

function resolveAppRouteComponents(
  overrides: Partial<AppRouteComponents> | undefined,
): AppRouteComponents {
  return {
    ...defaultRouteComponents,
    ...overrides,
  };
}

function useLocalWorkspaceGatewayAvailable(
  explicitAvailable: boolean | undefined,
  shouldResolve: boolean,
): boolean {
  const [available, setAvailable] = useState(() => explicitAvailable ?? false);

  useEffect(() => {
    if (explicitAvailable !== undefined) {
      setAvailable(explicitAvailable);
      return;
    }

    if (!shouldResolve) {
      setAvailable(false);
      return;
    }

    let stopped = false;

    async function resolveGatewayAvailability() {
      const { workspaceGatewayBrowserConfig } = await import("@dpeek/formless-gateway/client");

      if (!stopped) {
        setAvailable(workspaceGatewayBrowserConfig() !== undefined);
      }
    }

    void resolveGatewayAvailability().catch(() => {
      if (!stopped) {
        setAvailable(false);
      }
    });

    return () => {
      stopped = true;
    };
  }, [explicitAvailable, shouldResolve]);

  return available;
}

function routeMayNeedLocalWorkspaceGateway(
  routes: ReturnType<typeof runtimeBrowserRoutePatterns>,
  path: string,
): boolean {
  return (
    path === routes.localSessionRoute ||
    (routes.instanceShellRoute !== undefined && FORMLESS_PROGRAM_SCREEN_PATHS.includes(path))
  );
}

function AppRoutes({
  localWorkspaceGatewayAvailable,
  routeComponents,
  runtimeProfile,
}: {
  localWorkspaceGatewayAvailable: boolean;
  routeComponents: AppRouteComponents;
  runtimeProfile: RuntimeProfile;
}) {
  const {
    AuthAccountRoute,
    CollaboratorInvitationAcceptanceRoute,
    HomeRoute,
    InstanceShellRoute,
    LocalSessionRoute,
    AccountSignInRoute,
    SitePageRoute,
  } = routeComponents;
  const generatedWorlds = runtimeProfile.worlds.filter(hasGeneratedRoutes);
  const browserRoutes = runtimeBrowserRoutePatterns(runtimeProfile);
  const publishedSite = runtimeProfile.publishedSite;
  const publicSitePreview = runtimeProfile.publicSitePreview;
  const routes = (
    <Switch>
      {runtimeProfile.defaultRedirect ? (
        <Route path="/">
          <Redirect replace to={runtimeProfile.defaultRedirect} />
        </Route>
      ) : null}
      <Route path={COLLABORATOR_INVITATION_ACCEPT_PATH}>
        <CollaboratorInvitationAcceptanceRoute />
      </Route>
      <Route path={runtimeTopologyRoutes.authAccountRoute}>
        <AuthAccountRoute />
      </Route>
      {browserRoutes.authAccountSetupRoute ? (
        <Route path={browserRoutes.authAccountSetupRoute}>
          <AuthAccountRoute />
        </Route>
      ) : null}
      {browserRoutes.authAccountSignInRoute ? (
        <Route path={browserRoutes.authAccountSignInRoute}>
          <AccountSignInRoute />
        </Route>
      ) : null}
      <Route path={runtimeTopologyRoutes.authAccountGateRoutePattern}>
        <AuthAccountRoute />
      </Route>
      {browserRoutes.localSessionRoute && localWorkspaceGatewayAvailable ? (
        <Route path={browserRoutes.localSessionRoute}>
          <LocalSessionRoute />
        </Route>
      ) : null}
      {browserRoutes.instanceShellRoute ? (
        <Route path={browserRoutes.instanceShellRoute}>
          <InstanceShellRoute localWorkspaceGatewayAvailable={localWorkspaceGatewayAvailable} />
        </Route>
      ) : null}
      {browserRoutes.instanceShellRoute
        ? FORMLESS_PROGRAM_SCREEN_PATHS.filter((path) => path !== "/").map((path) => (
            <Route key={path} path={path}>
              <InstanceShellRoute localWorkspaceGatewayAvailable={localWorkspaceGatewayAvailable} />
            </Route>
          ))
        : null}
      {publishedSite ? (
        <Route path={publishedSite.rootRoute}>
          <PublicSiteRoute
            RouteComponent={SitePageRoute}
            routeProps={{
              linkMode: "published",
              slug: publishedSite.homeSlug,
              target: publishedSite.target.storageIdentity,
            }}
          />
        </Route>
      ) : null}
      {publishedSite ? (
        <Route path={publishedSite.routePattern}>
          {(params) => (
            <PublicSiteRoute
              RouteComponent={SitePageRoute}
              routeProps={{
                linkMode: "published",
                slug: runtimeWildcardSiteSlug(params),
                target: publishedSite.target.storageIdentity,
              }}
            />
          )}
        </Route>
      ) : null}
      {generatedWorlds.map((world) => (
        <Route key={world.route} path={world.route}>
          <ProtectedRouteGuard access={world.access ?? "anonymous"}>
            <HomeRoute
              schemaKey={world.target.schemaKey}
              screenPath="/"
              target={world.target}
              workspaceActions={siteWorkspaceLinkActionsForWorld(world, publicSitePreview)}
            />
          </ProtectedRouteGuard>
        </Route>
      ))}
      {generatedWorlds.map((world) => (
        <Route key={`${world.route}/*`} path={runtimeScreenWildcardRoute(world)}>
          {(params) => (
            <ProtectedRouteGuard access={world.access ?? "anonymous"}>
              <HomeRoute
                schemaKey={world.target.schemaKey}
                screenPath={runtimeWildcardScreenPath(params)}
                target={world.target}
                workspaceActions={siteWorkspaceLinkActionsForWorld(world, publicSitePreview)}
              />
            </ProtectedRouteGuard>
          )}
        </Route>
      ))}
      {publicSitePreview ? (
        <Route path={publicSitePreview.rootRoute}>
          {publicSitePreview.homeRoute ? (
            <Redirect replace to={publicSitePreview.homeRoute} />
          ) : (
            <PublicSiteRoute
              RouteComponent={SitePageRoute}
              routeProps={{
                linkMode: publicSitePreview.linkMode,
                slug: publicSitePreview.homeSlug,
                target: publicSitePreview.target?.storageIdentity,
              }}
            />
          )}
        </Route>
      ) : null}
      {publicSitePreview ? (
        <Route path={publicSitePreview.routePattern}>
          {(params) => (
            <PublicSiteRoute
              RouteComponent={SitePageRoute}
              routeProps={{
                linkMode: publicSitePreview.linkMode,
                slug: runtimeWildcardSiteSlug(params),
                target: publicSitePreview.target?.storageIdentity,
              }}
            />
          )}
        </Route>
      ) : null}
      <Route>
        <NotFoundRoute />
      </Route>
    </Switch>
  );

  return <Suspense fallback={<RouteLoading />}>{routes}</Suspense>;
}

function siteWorkspaceLinkActionsForWorld(
  world: RuntimeWorldMount,
  publicSitePreview: RuntimeProfile["publicSitePreview"],
): readonly WorkspaceLinkActionContract[] {
  if (!publicSitePreview || world.app.key !== "site") {
    return [];
  }

  return siteWorkspaceLinkActions(publicSitePreview.homeRoute ?? publicSitePreview.rootRoute);
}

function siteWorkspaceLinkActions(href: string): readonly WorkspaceLinkActionContract[] {
  return [
    {
      accessibilityLabel: "View site (opens in a new tab)",
      href,
      id: "view-site",
      kind: "workspaceLinkAction",
      label: "View site",
      prominence: "primary",
      target: "newTab",
    },
  ];
}

function PublicSiteRoute({
  RouteComponent,
  routeProps,
}: {
  RouteComponent: ElementType<PublicSiteRouteProps>;
  routeProps: PublicSiteRouteInputProps;
}) {
  return (
    <RouteComponent
      {...routeProps}
      builtInRenderer={FormlessSitePageRenderer}
      builtInSystemStateRenderer={FormlessSiteSystemStateRenderer}
      workspaceRenderer={routeProps.workspaceRenderer ?? workspaceSitePublicRenderer}
    />
  );
}

function RouteLoading() {
  return (
    <ApplicationSystemStateRuntime
      snapshot={projectApplicationSystemState({
        heading: "Loading Formless",
        id: "application-system-state:route-loading",
        message: "Loading...",
        state: "loading",
      })}
    />
  );
}

type ProtectedRouteGuardState = "authorized" | "checking" | "failed" | "forbidden" | "redirect";

export function ProtectedRouteGuard({
  access,
  children,
  fetcher,
}: {
  access: RuntimeRouteAccess;
  children: ReactNode;
  fetcher?: typeof fetch;
}) {
  const [location] = useLocation();
  const routeTarget = protectedRouteTarget(location);
  const guardKey = [access, routeTarget].join(":");
  const [resolution, setResolution] = useState<{
    key: string;
    state: ProtectedRouteGuardState;
  }>(() => ({
    key: guardKey,
    state: access !== "anonymous" && typeof window !== "undefined" ? "checking" : "authorized",
  }));
  const state =
    resolution.key === guardKey
      ? resolution.state
      : access === "anonymous"
        ? "authorized"
        : "checking";

  useEffect(
    () =>
      startProtectedRouteGuardSession({
        access,
        fetcher,
        location: routeTarget,
        onState: (nextState) => setResolution({ key: guardKey, state: nextState }),
      }),
    [access, fetcher, guardKey, routeTarget],
  );

  if (access === "anonymous" || state === "authorized") {
    return <>{children}</>;
  }

  if (state === "redirect") {
    return <Redirect replace to={authAccountContinuationLocationForReturnTarget(routeTarget)} />;
  }

  if (state === "forbidden") {
    return <ProtectedRouteForbidden />;
  }

  if (state === "failed") {
    return <ProtectedRouteFailed />;
  }

  return <ProtectedRouteLoading />;
}

export function startProtectedRouteGuardSession({
  access,
  fetcher = fetch,
  location,
  onState,
}: {
  access: RuntimeRouteAccess;
  fetcher?: typeof fetch;
  location: AccountRedirectTarget;
  onState: (state: ProtectedRouteGuardState) => void;
}): () => void {
  if (access === "anonymous") {
    onState("authorized");
    return () => undefined;
  }

  const controller = new AbortController();
  let stopped = false;

  onState("checking");

  async function checkAccess() {
    try {
      const decision =
        access === "owner"
          ? {
              kind: (await ownerRouteSessionIsAuthorized(fetcher, controller.signal))
                ? ("authorized" as const)
                : ("continuation" as const),
            }
          : await resolveProtectedRouteAccess(location, {
              fetcher,
              signal: controller.signal,
            });

      if (!stopped) {
        onState(
          decision.kind === "authorized"
            ? "authorized"
            : decision.kind === "forbidden"
              ? "forbidden"
              : "redirect",
        );
      }
    } catch {
      if (!stopped && !controller.signal.aborted) {
        onState("failed");
      }
    }
  }

  void checkAccess();

  return () => {
    stopped = true;
    controller.abort();
  };
}

async function ownerRouteSessionIsAuthorized(fetcher: typeof fetch, signal: AbortSignal) {
  const { fetchAccountSessionStatus } = await import("./app/routes/account-sign-in.tsx");
  const status = await fetchAccountSessionStatus({ fetcher, signal });

  return status.authenticated;
}

function ProtectedRouteLoading() {
  return (
    <ApplicationSystemStateRuntime
      snapshot={projectApplicationSystemState({
        heading: "Checking route access",
        id: "application-system-state:route-access",
        message: "Checking route access...",
        state: "loading",
      })}
    />
  );
}

function ProtectedRouteForbidden() {
  return (
    <ApplicationSystemStateRuntime
      snapshot={projectApplicationSystemState({
        heading: "Route access forbidden",
        id: "application-system-state:route-forbidden",
        message: "Your current account does not have access to this screen.",
        state: "unavailable",
      })}
    />
  );
}

function ProtectedRouteFailed() {
  return (
    <ApplicationSystemStateRuntime
      snapshot={projectApplicationSystemState({
        heading: "Route access unavailable",
        id: "application-system-state:route-access-failed",
        message: "Route access could not be checked.",
        state: "unavailable",
      })}
    />
  );
}

function protectedRouteTarget(location: string): AccountRedirectTarget {
  if (typeof window === "undefined") {
    return protectedRouteTargetFromLocation(location);
  }

  return protectedRouteTargetFromLocation(`${window.location.pathname}${window.location.search}`);
}

function protectedRouteTargetFromLocation(location: string): AccountRedirectTarget {
  return location.startsWith("/") ? (location as AccountRedirectTarget) : "/";
}

function runtimeScreenWildcardRoute(world: RuntimeWorldMount): `/${string}` {
  return world.route === "/" ? "/*" : `${world.route}/*`;
}

function runtimeWildcardScreenPath(params: unknown): string {
  const wildcard = (params as { "*": string | undefined })["*"];

  return `/${wildcard ?? ""}`;
}

function runtimeWildcardSiteSlug(params: unknown): string {
  const wildcard = (params as { "*": string | undefined })["*"];

  return normalizeSitePageSlug(wildcard);
}
