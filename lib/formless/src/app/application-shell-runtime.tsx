import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { ShellIntent } from "@dpeek/formless-presentation/contract";
import type { AppInstall, AppPackageResolver } from "@dpeek/formless-installed-apps";
import {
  appStorageIdentityForClientTarget,
  clientTargetForSchemaKey,
  clientTargetSourceSchemaKey,
  type ClientAppTarget,
} from "../client/app-target.ts";
import { getClientStoreSnapshot, subscribeToClientStore } from "../client/store.ts";
import { useSyncStatus } from "../client/sync-status.ts";
import { selectGeneratedRootNavigationFacts } from "../client/generated-authoring.ts";
import { selectPrimaryScreenModels, type HomeScreenModel } from "../client/views.ts";
import { todayDateString } from "../shared/date.ts";
import type {
  AccountLogoutResponse,
  AccountSessionStatusResponse,
} from "../shared/instance-auth.ts";
import type { RecordValues } from "@dpeek/formless-storage";
import {
  projectInitialGeneratedCreateRuntimeSurface,
  useGeneratedCreateRuntime,
  type GeneratedCreateRuntime,
  type GeneratedCreateTriggerPresentation,
} from "./generated/generated-create-runtime.ts";
import {
  resolveGeneratedApplicationShellIntent,
  useGeneratedApplicationShellContractHost,
} from "./generated/generated-application-shell-contract-host.ts";
import {
  ApplicationRuntimeContractHostProvider,
  type ApplicationRuntimeContractContribution,
} from "./generated/application-runtime-contract-host.tsx";
import {
  generatedShellRootSectionId,
  projectGeneratedApplicationShell,
  selectGeneratedShellScope,
} from "./generated/application-shell-projection.ts";
import { ApplicationPresentation } from "./application-presentation.tsx";
import type { ApplicationRootThemeRuntime } from "./application-root-context.tsx";
import { SchemaAppProvider } from "./generated/schema-app-context.tsx";
import {
  HomeRouteSelectionProvider,
  selectHomeRouteSectionContextRecordId,
  useHomeRouteSelectionStore,
  withHomeRouteSelectedSectionContextRecordId,
} from "./routes/home-selection.tsx";
import { fetchAccountSessionStatus, logoutAccountSession } from "./routes/account-sign-in.tsx";
import {
  runtimeScreenPathFromRoute,
  type RuntimeProfile,
  type RuntimeWorldMount,
} from "./runtime-profile.ts";

const ROOT_CREATE_TRIGGER: GeneratedCreateTriggerPresentation = {
  content: { icon: "add", kind: "iconOnly" },
  density: "compact",
  prominence: "quiet",
};

export type ApplicationShellRuntimeDependencies = {
  fetchAccountSession?: () => Promise<AccountSessionStatusResponse>;
  logout?: () => Promise<AccountLogoutResponse>;
  navigate?: (path: `/${string}`) => void;
  submitCreate?: (surfaceId: string, values: RecordValues) => Promise<{ recordId: string }>;
};

export type ApplicationShellRuntimeBoundaryProps = {
  activePackageResolver?: AppPackageResolver | undefined;
  activeScreenPath?: string | undefined;
  applicationTheme?: ApplicationRootThemeRuntime | undefined;
  children: ReactNode;
  currentPath: string;
  dependencies?: ApplicationShellRuntimeDependencies;
  installedAppRouteInstalls?: readonly AppInstall[] | undefined;
  initialRouteContractContributions?: readonly ApplicationRuntimeContractContribution[];
  accountSession?: AccountSessionStatusResponse | undefined;
  routeWorld: RuntimeWorldMount | undefined;
  runtimeProfile: RuntimeProfile;
  screenModels?: readonly HomeScreenModel[] | undefined;
};

export function ApplicationShellRuntimeBoundary(props: ApplicationShellRuntimeBoundaryProps) {
  const runtime = (
    <HomeRouteSelectionProvider>
      <ApplicationShellRuntime {...props} />
    </HomeRouteSelectionProvider>
  );

  if (!props.routeWorld) {
    return runtime;
  }

  return (
    <SchemaAppProvider
      activePackageResolver={props.activePackageResolver}
      schemaKey={props.routeWorld.app.key}
      target={props.routeWorld.target}
    >
      {runtime}
    </SchemaAppProvider>
  );
}

function ApplicationShellRuntime({
  activePackageResolver,
  activeScreenPath,
  applicationTheme,
  children,
  currentPath,
  dependencies = {},
  initialRouteContractContributions,
  installedAppRouteInstalls = [],
  accountSession: accountSessionProp,
  routeWorld,
  runtimeProfile,
  screenModels: screenModelsProp,
}: ApplicationShellRuntimeBoundaryProps) {
  const snapshot = useSyncExternalStore(
    subscribeToClientStore,
    getClientStoreSnapshot,
    getClientStoreSnapshot,
  );
  const syncStatus = useSyncStatus();
  const selectionStore = useHomeRouteSelectionStore();
  const routeTarget = routeWorld ? runtimeWorldClientTarget(routeWorld) : undefined;
  const routeIdentity = routeTarget ? appStorageIdentityForClientTarget(routeTarget) : undefined;
  const routeSchemaKey = routeTarget ? clientTargetSourceSchemaKey(routeTarget) : undefined;
  const storeMatchesRoute =
    snapshot.activeClientStorageName === null ||
    snapshot.activeClientStorageName === routeIdentity?.browserDatabaseName;
  const routeSchema =
    routeWorld &&
    storeMatchesRoute &&
    (snapshot.activeSchemaKey === null || snapshot.activeSchemaKey === routeSchemaKey)
      ? snapshot.schema
      : null;
  const projectedScreenModels = useMemo(
    () => (routeSchema ? selectPrimaryScreenModels(routeSchema) : []),
    [routeSchema],
  );
  const screenModels = screenModelsProp ?? projectedScreenModels;
  const selectedScreenPath =
    activeScreenPath ??
    (routeWorld ? runtimeScreenPathFromRoute(routeWorld, currentPath) : undefined);
  const activeScreen = screenModels.find((screen) => screen.path === selectedScreenPath);
  const rootFacts = activeScreen ? selectGeneratedRootNavigationFacts(activeScreen) : undefined;
  const selectedRootRecordId =
    rootFacts && selectionStore
      ? selectHomeRouteSectionContextRecordId(
          selectionStore.selectionState,
          rootFacts.screen.screenName,
          rootFacts.section.id,
        )
      : null;
  const createDescriptors = useMemo(
    () =>
      rootFacts?.groups.flatMap((group) =>
        group.createOperation
          ? [
              {
                operation: group.createOperation,
                queryName: group.queryName,
                sectionId: generatedShellRootSectionId(
                  rootFacts.screen.screenName,
                  rootFacts.section.id,
                  group.queryName,
                ),
                surfaceId: `root-navigation:${group.createOperation.operation.canonicalKey}`,
              },
            ]
          : [],
      ) ?? [],
    [rootFacts],
  );
  const [registeredCreateRuntimes, setRegisteredCreateRuntimes] = useState<
    Readonly<Record<string, RegisteredGeneratedCreateRuntime | undefined>>
  >({});
  const initialCreateSurfaces = useMemo(
    () =>
      Object.fromEntries(
        createDescriptors.map((descriptor) => [
          descriptor.queryName,
          projectInitialGeneratedCreateRuntimeSurface({
            operation: descriptor.operation,
            snapshot,
            surfaceId: descriptor.surfaceId,
            trigger: ROOT_CREATE_TRIGGER,
          }),
        ]),
      ),
    [createDescriptors, snapshot],
  );
  const createSurfacesByQueryName = useMemo(
    () =>
      Object.fromEntries(
        createDescriptors.map((descriptor) => [
          descriptor.queryName,
          registeredCreateRuntimes[descriptor.sectionId]?.runtime.surface ??
            initialCreateSurfaces[descriptor.queryName],
        ]),
      ),
    [createDescriptors, initialCreateSurfaces, registeredCreateRuntimes],
  );
  const [accountSession, setAccountSession] = useState<AccountSessionStatusResponse | undefined>(
    accountSessionProp,
  );
  const [logoutState, setLogoutState] = useState<"error" | "idle" | "pending">("idle");
  const scope = selectGeneratedShellScope({
    currentPath,
    routeContext: {
      activePackageResolver,
      appInstalls: installedAppRouteInstalls,
    },
    routeWorld,
    runtimeProfile,
  });
  const projection = projectGeneratedApplicationShell({
    activePackageResolver,
    activeScreenPath: selectedScreenPath,
    currentPath,
    installs: installedAppRouteInstalls,
    logoutState,
    accountSession,
    root:
      rootFacts === undefined
        ? undefined
        : {
            createSurfacesByQueryName,
            facts: rootFacts,
            selectedRecordId: selectedRootRecordId,
            snapshot,
            today: todayDateString(),
          },
    routeWorld,
    runtimeProfile,
    screenModels,
    sync:
      routeWorld && routeIdentity
        ? {
            cursor: storeMatchesRoute ? snapshot.cursor : 0,
            lastSyncedAt: storeMatchesRoute ? snapshot.lastSyncedAt : null,
            schemaVersion: storeMatchesRoute ? (snapshot.schema?.version ?? null) : null,
            status: syncStatus,
            worldLabel: routeIdentity.authorityName,
          }
        : undefined,
  });
  const projectionRef = useRef(projection);
  projectionRef.current = projection;

  const registerCreateRuntime = useCallback(
    (sectionId: string, runtime: RegisteredGeneratedCreateRuntime | undefined) => {
      setRegisteredCreateRuntimes((current) => {
        if (runtime === undefined) {
          if (!(sectionId in current)) {
            return current;
          }

          const next = { ...current };
          delete next[sectionId];
          return next;
        }

        return current[sectionId]?.surfaceKey === runtime.surfaceKey
          ? current
          : { ...current, [sectionId]: runtime };
      });
    },
    [],
  );

  const dispatch = useCallback(
    async (intent: ShellIntent) => {
      const resolved = resolveGeneratedApplicationShellIntent(projectionRef.current, intent);

      switch (resolved.kind) {
        case "ignored":
          return;
        case "rootSelection":
          if (!rootFacts || !selectionStore) {
            return;
          }

          selectionStore.setSelectionState((current) =>
            withHomeRouteSelectedSectionContextRecordId(
              current,
              rootFacts.screen.screenName,
              rootFacts.section.id,
              resolved.intent.recordId,
            ),
          );
          return;
        case "create":
          return registeredCreateRuntimes[resolved.intent.sectionId]?.dispatch(resolved.intent);
        case "logout":
          return await executeLogout();
      }
    },
    [
      activePackageResolver,
      dependencies,
      logoutState,
      accountSession,
      registeredCreateRuntimes,
      rootFacts,
      selectionStore,
    ],
  );
  const { coordinator, shellReference } = useGeneratedApplicationShellContractHost({
    dispatch,
    initialRouteContributions: initialRouteContractContributions,
    projection,
  });

  useLayoutEffect(() => {
    if (applicationTheme) {
      coordinator.publish("application-theme", applicationTheme.publication);
    } else {
      coordinator.remove("application-theme");
    }
  }, [applicationTheme, coordinator]);

  useLayoutEffect(
    () => () => {
      coordinator.remove("application-theme");
    },
    [coordinator],
  );

  useEffect(() => {
    if (accountSessionProp !== undefined) {
      setAccountSession(accountSessionProp);
      return;
    }

    if (!scope) {
      setAccountSession(undefined);
      return;
    }

    let stopped = false;
    const load = dependencies.fetchAccountSession ?? (() => fetchAccountSessionStatus());

    void load()
      .then((session) => {
        if (!stopped) {
          setAccountSession(session);
        }
      })
      .catch(() => {
        if (!stopped) {
          setAccountSession(undefined);
        }
      });

    return () => {
      stopped = true;
    };
  }, [dependencies.fetchAccountSession, accountSessionProp, scope]);

  async function executeLogout() {
    if (logoutState === "pending" || accountSession?.authenticated !== true) {
      return;
    }

    setLogoutState("pending");

    try {
      const logout = dependencies.logout ?? (() => logoutAccountSession());
      const response = await logout();
      setAccountSession({ authenticated: false, setupComplete: true });
      setLogoutState("idle");

      if (response.continueTo) {
        navigateTo(response.continueTo, dependencies.navigate);
      }
    } catch {
      setLogoutState("error");
    }
  }

  const routeWorkspace = shellReference ? (
    <ApplicationPresentation
      presentation={{
        children,
        kind: "shell",
        shellReference,
        themeReference: applicationTheme?.reference,
      }}
    />
  ) : (
    children
  );

  return (
    <ApplicationRuntimeContractHostProvider coordinator={coordinator}>
      {createDescriptors.map((descriptor) => (
        <RegisteredRootCreateRuntime
          descriptor={descriptor}
          key={descriptor.sectionId}
          onRegister={registerCreateRuntime}
          onSuccess={(recordId) => {
            if (!rootFacts || !selectionStore) {
              return;
            }

            selectionStore.setSelectionState((current) =>
              withHomeRouteSelectedSectionContextRecordId(
                current,
                rootFacts.screen.screenName,
                rootFacts.section.id,
                recordId,
              ),
            );
          }}
          submitValues={
            dependencies.submitCreate
              ? (values) => dependencies.submitCreate!(descriptor.surfaceId, values)
              : undefined
          }
        />
      ))}
      {routeWorkspace}
    </ApplicationRuntimeContractHostProvider>
  );
}

type RootCreateDescriptor = {
  operation: Parameters<typeof projectInitialGeneratedCreateRuntimeSurface>[0]["operation"];
  queryName: string;
  sectionId: string;
  surfaceId: string;
};

type RegisteredGeneratedCreateRuntime = {
  dispatch: (intent: ShellCreateIntent) => Promise<void> | void;
  runtime: GeneratedCreateRuntime;
  surfaceKey: string;
};

type ShellCreateIntent = Extract<ShellIntent, { type: "shellCreate" }>;

function RegisteredRootCreateRuntime({
  descriptor,
  onRegister,
  onSuccess,
  submitValues,
}: {
  descriptor: RootCreateDescriptor;
  onRegister: (sectionId: string, runtime: RegisteredGeneratedCreateRuntime | undefined) => void;
  onSuccess: (recordId: string) => void;
  submitValues?: (values: RecordValues) => Promise<{ recordId: string }>;
}) {
  const [open, setOpen] = useState(false);
  const runtime = useGeneratedCreateRuntime({
    closeOnSuccess: true,
    displaySafeErrors: true,
    onOpenChange: setOpen,
    onSuccess,
    open,
    operation: descriptor.operation,
    submitValues,
    surfaceId: descriptor.surfaceId,
    trigger: ROOT_CREATE_TRIGGER,
  });
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;
  const dispatch = useCallback((intent: ShellCreateIntent) => {
    if ("fieldId" in intent) {
      return runtimeRef.current.onFieldIntent(intent.fieldId, intent.intent);
    }

    return runtimeRef.current.onCreateIntent(intent.intent);
  }, []);
  const surfaceKey = JSON.stringify(runtime.surface);

  useLayoutEffect(() => {
    onRegister(descriptor.sectionId, { dispatch, runtime, surfaceKey });
  }, [descriptor.sectionId, dispatch, onRegister, surfaceKey]);

  useEffect(
    () => () => {
      onRegister(descriptor.sectionId, undefined);
    },
    [descriptor.sectionId, onRegister],
  );

  return null;
}

function runtimeWorldClientTarget(world: RuntimeWorldMount): ClientAppTarget {
  return world.target ?? clientTargetForSchemaKey(world.app.key);
}

function navigateTo(path: `/${string}`, navigate: ((path: `/${string}`) => void) | undefined) {
  if (navigate) {
    navigate(path);
    return;
  }

  if (typeof window !== "undefined") {
    window.location.assign(path);
  }
}
