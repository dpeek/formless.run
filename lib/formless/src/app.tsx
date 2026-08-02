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
import type { AppSchema } from "@dpeek/formless-schema";
import { NotFoundRoute } from "./app/routes/not-found.tsx";
import { normalizeSitePageSlug } from "@dpeek/formless-site-app/public/react";
import {
  FormlessSitePageRenderer,
  FormlessSiteSystemStateRenderer,
} from "@dpeek/formless-renderer/site/renderer";
import "@dpeek/formless-renderer/site/global.css";
import {
  CoreSitePageRoute,
  resolveSitePublicBrowserRuntimeSurface,
  type PublicSiteRouteInputProps,
  type PublicSiteRouteProps,
} from "./app/public-site-runtime.tsx";
import type { ApplicationShellRuntimeBoundaryProps } from "./app/application-shell-runtime.tsx";
import { shouldRenderGeneratedShell } from "./app/generated/application-shell-projection.ts";
import { sitePublicRenderer as workspaceSitePublicRenderer } from "virtual:formless/site-public-renderer/browser";
import {
  normalizeRuntimeBrowserPath,
  resolveRuntimeProfile,
  runtimeBrowserRoutePatterns,
  type RuntimeProfile,
} from "./app/runtime-profile.ts";
import {
  authAccountContinuationLocationForReturnTarget,
  COLLABORATOR_INVITATION_ACCEPT_PATH,
  type AccountRedirectTarget,
} from "./shared/instance-auth.ts";
import { runtimeTopologyRoutes, type RuntimeRouteAccess } from "./shared/runtime-topology.ts";
import { initialInstanceManagementRuntimeContribution } from "./app/routes/instance-management-contract.ts";
import { initialInstanceAccessRuntimeContribution } from "./app/routes/access-contract.ts";
import {
  formlessProgramSchema,
  formlessProgramScreenRouteTargets,
  resolveFormlessProgramScreenRouteTarget,
  resolveFormlessProgramScreenRouteTargetByKey,
} from "./program/runtime.ts";
import type { ProgramBrowserRuntimeDefinition } from "./program/composition.ts";
import { programBrowserRuntime } from "./program/compiled/browser.ts";
import { projectApplicationSystemState } from "./app/routes/application-system-state-projection.ts";
import { ApplicationSystemStateRuntime } from "./app/routes/application-system-state-runtime.tsx";
import { useApplicationRootThemeRuntime } from "./app/application-root-context.tsx";
import { resolveProtectedRouteAccess } from "./app/protected-route-access.ts";

type InstanceShellRouteProps = {
  localWorkspaceGatewayAvailable?: boolean | undefined;
  routesScreenPath?: `/${string}` | undefined;
  screenKey: string;
  screenPath: `/${string}`;
};

export type AppRouteComponents = {
  AccessRoute: ElementType;
  ApplicationShellRuntimeBoundary: ElementType<ApplicationShellRuntimeBoundaryProps>;
  AuthAccountRoute: ElementType;
  CollaboratorInvitationAcceptanceRoute: ElementType;
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
  browserRuntime?: ProgramBrowserRuntimeDefinition;
  localWorkspaceGatewayAvailable?: boolean;
  programSchema?: AppSchema;
  routeComponents?: Partial<AppRouteComponents>;
  runtimeProfile?: RuntimeProfile;
};

export function App({
  browserRuntime = programBrowserRuntime,
  localWorkspaceGatewayAvailable: localWorkspaceGatewayAvailableProp,
  programSchema = formlessProgramSchema,
  routeComponents: routeComponentOverrides,
  runtimeProfile: runtimeProfileProp,
}: AppProps = {}) {
  const [location] = useLocation();
  const runtimeProfile = useMemo(
    () => runtimeProfileProp ?? resolveRuntimeProfile(),
    [runtimeProfileProp],
  );
  const normalizedLocation = normalizeRuntimeBrowserPath(location);
  const programScreen = resolveFormlessProgramScreenRouteTarget(normalizedLocation, programSchema);
  const browserRoutes = runtimeBrowserRoutePatterns(runtimeProfile);
  const runtime = (
    <AppRuntime
      browserRuntime={browserRuntime}
      localWorkspaceGatewayAvailable={localWorkspaceGatewayAvailableProp}
      location={location}
      programSchema={programSchema}
      routeComponents={routeComponentOverrides}
      runtimeProfile={runtimeProfile}
    />
  );

  return browserRoutes.instanceShellRoute && programScreen !== undefined ? (
    <ProtectedRouteGuard access="management">{runtime}</ProtectedRouteGuard>
  ) : (
    runtime
  );
}

function AppRuntime({
  browserRuntime = programBrowserRuntime,
  localWorkspaceGatewayAvailable: localWorkspaceGatewayAvailableProp,
  location,
  programSchema = formlessProgramSchema,
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
  const programScreen = resolveFormlessProgramScreenRouteTarget(normalizedLocation, programSchema);
  const initialRouteContractContributions = useMemo(() => {
    switch (programScreen?.key) {
      case "routes":
        return [initialInstanceManagementRuntimeContribution];
      case "access":
        return [initialInstanceAccessRuntimeContribution];
      default:
        return [];
    }
  }, [programScreen?.key]);
  const localWorkspaceGatewayAvailable = useLocalWorkspaceGatewayAvailable(
    localWorkspaceGatewayAvailableProp,
    routeMayNeedLocalWorkspaceGateway(browserRoutes, normalizedLocation, programSchema),
  );
  const renderShell = shouldRenderGeneratedShell({
    currentPath: location,
    programSchema,
    runtimeProfile,
  });

  if (!renderShell) {
    return (
      <AppRoutes
        browserRuntime={browserRuntime}
        localWorkspaceGatewayAvailable={localWorkspaceGatewayAvailable}
        programSchema={programSchema}
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
        programSchema={programSchema}
        runtimeProfile={runtimeProfile}
      >
        <AppRoutes
          browserRuntime={browserRuntime}
          localWorkspaceGatewayAvailable={localWorkspaceGatewayAvailable}
          programSchema={programSchema}
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
  programSchema: AppSchema,
): boolean {
  return (
    path === routes.localSessionRoute ||
    (routes.instanceShellRoute !== undefined &&
      resolveFormlessProgramScreenRouteTarget(path, programSchema) !== undefined)
  );
}

function AppRoutes({
  browserRuntime,
  localWorkspaceGatewayAvailable,
  programSchema,
  routeComponents,
  runtimeProfile,
}: {
  browserRuntime: ProgramBrowserRuntimeDefinition;
  localWorkspaceGatewayAvailable: boolean;
  programSchema: AppSchema;
  routeComponents: AppRouteComponents;
  runtimeProfile: RuntimeProfile;
}) {
  const {
    AccessRoute,
    AuthAccountRoute,
    CollaboratorInvitationAcceptanceRoute,
    InstanceShellRoute,
    LocalSessionRoute,
    AccountSignInRoute,
    SitePageRoute,
  } = routeComponents;
  const browserRoutes = runtimeBrowserRoutePatterns(runtimeProfile);
  const siteSurfaceSelected = resolveSitePublicBrowserRuntimeSurface(browserRuntime) !== undefined;
  const publishedSite = siteSurfaceSelected ? runtimeProfile.publishedSite : undefined;
  const publicSitePreview = siteSurfaceSelected ? runtimeProfile.publicSitePreview : undefined;
  const programScreens = formlessProgramScreenRouteTargets(programSchema);
  const routesScreenPath = resolveFormlessProgramScreenRouteTargetByKey(
    "routes",
    programSchema,
  )?.path;
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
      {browserRoutes.instanceShellRoute
        ? programScreens.map((screen) => (
            <Route key={screen.key} path={screen.path}>
              {screen.key === "access" ? (
                <AccessRoute />
              ) : (
                <InstanceShellRoute
                  localWorkspaceGatewayAvailable={localWorkspaceGatewayAvailable}
                  routesScreenPath={routesScreenPath}
                  screenKey={screen.key}
                  screenPath={screen.path}
                />
              )}
            </Route>
          ))
        : null}
      {publishedSite ? (
        <Route path={publishedSite.rootRoute}>
          <PublicSiteRoute
            RouteComponent={SitePageRoute}
            routeProps={{
              browserRuntime,
              linkMode: "published",
              slug: publishedSite.homeSlug,
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
                browserRuntime,
                linkMode: "published",
                slug: runtimeWildcardSiteSlug(params),
              }}
            />
          )}
        </Route>
      ) : null}
      {publicSitePreview ? (
        <Route path={publicSitePreview.rootRoute}>
          {publicSitePreview.homeRoute ? (
            <Redirect replace to={publicSitePreview.homeRoute} />
          ) : (
            <PublicSiteRoute
              RouteComponent={SitePageRoute}
              routeProps={{
                browserRuntime,
                linkMode: publicSitePreview.linkMode,
                slug: publicSitePreview.homeSlug,
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
                browserRuntime,
                linkMode: publicSitePreview.linkMode,
                slug: runtimeWildcardSiteSlug(params),
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

function runtimeWildcardSiteSlug(params: unknown): string {
  const wildcard = (params as { "*": string | undefined })["*"];

  return normalizeSitePageSlug(wildcard);
}
