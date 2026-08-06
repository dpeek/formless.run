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
import type { AppSchema } from "@dpeek/formless-schema";
import { getClientStoreSnapshot, subscribeToClientStore } from "../client/store.ts";
import { useSyncStatus } from "../client/sync-status.ts";
import { selectGeneratedRootNavigationFacts } from "../client/generated-authoring.ts";
import { selectPrimaryScreenModels, type HomeScreenModel } from "../client/views.ts";
import { todayDateString } from "../shared/date.ts";
import type {
  AccountSessionStatusResponse,
  ProgramSessionResponse,
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
  selectGeneratedShellRootScopeSelection,
} from "./generated/application-shell-projection.ts";
import { ApplicationPresentation } from "./application-presentation.tsx";
import type { ApplicationRootThemeRuntime } from "./application-root-context.tsx";
import {
  HomeRouteSelectionProvider,
  selectHomeRouteSectionContextRecordId,
  useHomeRouteSelectionStore,
  withHomeRouteSelectedSectionContextRecordId,
} from "./routes/home-selection.tsx";
import { normalizeRuntimeBrowserPath, type RuntimeProfile } from "./runtime-profile.ts";
import {
  formlessProgramSchema,
  resolveFormlessProgramScreenRouteTarget,
} from "../program/runtime.ts";
import { projectAuthorizedProgramScreenPaths } from "./program-screen-access.ts";

const ROOT_CREATE_TRIGGER: GeneratedCreateTriggerPresentation = {
  content: { icon: "add", kind: "iconOnly" },
  density: "compact",
  prominence: "quiet",
};

export type ApplicationShellRuntimeDependencies = {
  submitCreate?: (surfaceId: string, values: RecordValues) => Promise<{ recordId: string }>;
};

export type ApplicationShellRuntimeBoundaryProps = {
  applicationTheme?: ApplicationRootThemeRuntime | undefined;
  children: ReactNode;
  currentPath: string;
  dependencies?: ApplicationShellRuntimeDependencies;
  initialRouteContractContributions?: readonly ApplicationRuntimeContractContribution[];
  accountSession?: AccountSessionStatusResponse | undefined;
  logoutState?: "error" | "idle" | "pending" | undefined;
  onLogout?: (() => Promise<void> | void) | undefined;
  programSchema?: AppSchema | undefined;
  programSession?: ProgramSessionResponse | undefined;
  runtimeProfile: RuntimeProfile;
  screenModels?: readonly HomeScreenModel[] | undefined;
};

export function ApplicationShellRuntimeBoundary(props: ApplicationShellRuntimeBoundaryProps) {
  return (
    <HomeRouteSelectionProvider>
      <ApplicationShellRuntime {...props} />
    </HomeRouteSelectionProvider>
  );
}

function ApplicationShellRuntime({
  applicationTheme,
  children,
  currentPath,
  dependencies = {},
  initialRouteContractContributions,
  accountSession,
  logoutState = "idle",
  onLogout,
  programSchema = formlessProgramSchema,
  programSession,
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
  const normalizedCurrentPath = normalizeRuntimeBrowserPath(currentPath);
  const programRoute =
    resolveFormlessProgramScreenRouteTarget(normalizedCurrentPath, programSchema) !== undefined;
  const authorizedProgramScreenPaths = useMemo(
    () => (programRoute ? projectAuthorizedProgramScreenPaths(programSession, programSchema) : []),
    [programRoute, programSchema, programSession],
  );
  const routeSchema = programRoute ? snapshot.schema : null;
  const projectedScreenModels = useMemo(
    () => (routeSchema ? selectPrimaryScreenModels(routeSchema) : []),
    [routeSchema],
  );
  const screenModels = screenModelsProp ?? projectedScreenModels;
  const selectedScreenPath = programRoute ? normalizedCurrentPath : undefined;
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
  const rootScopeSelection = useMemo(
    () =>
      rootFacts
        ? selectGeneratedShellRootScopeSelection({
            facts: rootFacts,
            snapshot,
            today: todayDateString(),
          })
        : undefined,
    [rootFacts, snapshot],
  );
  const createDescriptors = useMemo(
    () =>
      rootScopeSelection && rootScopeSelection.state !== "ready"
        ? []
        : (rootFacts?.groups.flatMap((group) =>
            group.createOperation
              ? [
                  {
                    operation: group.createOperation,
                    queryContext: rootScopeSelection?.queryContext,
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
          ) ?? []),
    [rootFacts, rootScopeSelection],
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
            queryContext: descriptor.queryContext,
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
  const projection = projectGeneratedApplicationShell({
    authorizedProgramScreenPaths,
    currentPath,
    logoutState,
    accountSession,
    programSchema,
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
    runtimeProfile,
    sync: programRoute
      ? {
          cursor: snapshot.cursor,
          lastSyncedAt: snapshot.lastSyncedAt,
          schemaVersion: snapshot.schema?.version ?? null,
          status: syncStatus,
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
          return await onLogout?.();
      }
    },
    [onLogout, registeredCreateRuntimes, rootFacts, selectionStore],
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
  queryContext?: Parameters<typeof projectInitialGeneratedCreateRuntimeSurface>[0]["queryContext"];
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
    onOpenChange: setOpen,
    onSuccess,
    open,
    operation: descriptor.operation,
    queryContext: descriptor.queryContext,
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
