import { useEffect, useMemo, useState } from "react";
import {
  connectBroadcastToClientStore,
  hydrateClientStore,
  selectClientStoreTarget,
  useActiveClientStorageName,
  useActiveSchemaKey,
  useSchema,
} from "../../client/store.ts";
import { setSyncStatus, useSyncStatus } from "../../client/sync-status.ts";
import { bootstrapClient, startPushSync } from "../../client/sync.ts";
import {
  appStorageIdentityForClientTarget,
  clientTargetLabel,
  clientTargetSourceSchemaKey,
  type ClientAppSchemaKey,
  type ClientAppTarget,
} from "../../client/app-target.ts";
import { selectScreenModelByPath } from "../../client/views.ts";
import { todayDateString } from "../../shared/date.ts";
import { SchemaAppProvider } from "../generated/schema-app-context.tsx";
import {
  GeneratedWorkspaceRuntime,
  GeneratedWorkspaceRuntimeRegistration,
  type GeneratedWorkspaceRuntimeController,
  type GeneratedWorkspaceRuntimeProps,
  type GeneratedWorkspaceSectionExternalAction,
} from "../generated/generated-workspace-runtime.tsx";
import { NotFoundRoute } from "./not-found.tsx";
import type { AppPackageResolver } from "@dpeek/formless-installed-apps";
import type { WorkspaceLinkActionContract } from "@dpeek/formless-presentation/contract";
import {
  createHomeRouteSelectionState,
  selectHomeRouteSectionContextRecordId,
  selectHomeRouteSectionQueryName,
  useHomeRouteSelectionStore,
  withHomeRouteSelectedSectionContextRecordId,
  withHomeRouteSelectedSectionQueryName,
} from "./home-selection.tsx";
import { projectApplicationSystemState } from "./application-system-state-projection.ts";
import { ApplicationSystemStateRuntime } from "./application-system-state-runtime.tsx";

export {
  createHomeRouteSelectionState,
  homeRouteSectionSelectionKey,
  selectHomeRouteSectionContextRecordId,
  selectHomeRouteSectionQueryName,
  withHomeRouteSelectedScreenName,
  withHomeRouteSelectedSectionContextRecordId,
  withHomeRouteSelectedSectionQueryName,
} from "./home-selection.tsx";

export type HomeRouteClientLoadState =
  | { state: "failed"; message: string }
  | { state: "loading" }
  | { state: "ready" };

export function HomeRoute({
  activePackageResolver,
  clientSync = true,
  onClientLoadStateChange,
  onGeneratedWorkspaceController,
  target,
  schemaKey,
  sectionExternalActions,
  screenPath,
  workspaceActions,
}: {
  activePackageResolver?: AppPackageResolver | undefined;
  clientSync?: boolean | undefined;
  onClientLoadStateChange?: ((state: HomeRouteClientLoadState) => void) | undefined;
  onGeneratedWorkspaceController?: (
    controller: GeneratedWorkspaceRuntimeController | undefined,
  ) => void;
  target: ClientAppTarget;
  schemaKey: ClientAppSchemaKey;
  sectionExternalActions?: Readonly<
    Record<string, readonly GeneratedWorkspaceSectionExternalAction[] | undefined>
  >;
  screenPath: string;
  workspaceActions?: readonly WorkspaceLinkActionContract[];
}) {
  const appTargetIdentity = appStorageIdentityForClientTarget(target);
  const appLabel = clientTargetLabel(target);
  const appSchemaKey = clientTargetSourceSchemaKey(target);
  const activeClientStorageName = useActiveClientStorageName();
  const activeSchemaKey = useActiveSchemaKey();
  const activeSchema = useSchema();
  const routeStoreMatchesTarget =
    activeClientStorageName === null ||
    activeClientStorageName === appTargetIdentity.browserDatabaseName;
  const routeIsActive =
    routeStoreMatchesTarget && (activeSchemaKey === null || activeSchemaKey === appSchemaKey);
  const schema = routeIsActive ? activeSchema : null;
  const homeScreen = useMemo(
    () => (schema ? selectScreenModelByPath(schema, screenPath) : undefined),
    [schema, screenPath],
  );
  const [localSelectionState, setLocalSelectionState] = useState(createHomeRouteSelectionState);
  const routeSelectionStore = useHomeRouteSelectionStore();
  const selectionState = routeSelectionStore?.selectionState ?? localSelectionState;
  const setSelectionState = routeSelectionStore?.setSelectionState ?? setLocalSelectionState;
  const today = useTodayDateString();

  useEffect(() => {
    setSelectionState(createHomeRouteSelectionState());
  }, [appTargetIdentity.browserDatabaseName, setSelectionState]);

  useEffect(() => {
    if (!clientSync) {
      return;
    }

    selectClientStoreTarget(target);
    const stopBroadcast = connectBroadcastToClientStore(target);
    let stopPushSync = () => {};
    let cancelled = false;

    async function startSync() {
      onClientLoadStateChange?.({ state: "loading" });
      setSyncStatus({ state: "syncing", message: `Syncing ${appLabel}...` });

      try {
        await hydrateClientStore(target);
        await bootstrapClient(target);

        if (cancelled) {
          return;
        }

        setSyncStatus({ state: "idle", message: "Synced." });
        onClientLoadStateChange?.({ state: "ready" });
        stopPushSync = startPushSync(target);
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : "Sync failed.";
        setSyncStatus({ state: "error", message });
        onClientLoadStateChange?.({ message, state: "failed" });
      }
    }

    void startSync();

    return () => {
      cancelled = true;
      stopBroadcast();
      stopPushSync();
    };
  }, [
    appLabel,
    appTargetIdentity.browserDatabaseName,
    appTargetIdentity.kind,
    clientSync,
    onClientLoadStateChange,
  ]);

  if (!schema) {
    if (onGeneratedWorkspaceController) {
      return null;
    }

    return <HomeRouteSchemaSystemState appLabel={appLabel} />;
  }

  if (!homeScreen) {
    if (onGeneratedWorkspaceController) {
      return null;
    }

    if (screenPath !== "/") {
      return <NotFoundRoute />;
    }

    return (
      <ApplicationSystemStateRuntime
        snapshot={projectApplicationSystemState({
          heading: "Formless",
          id: `application-system-state:schema-empty:${appSchemaKey}`,
          message: "No entities are defined in the active schema.",
          state: "empty",
        })}
      />
    );
  }

  const workspace = (
    <SchemaAppProvider
      activePackageResolver={activePackageResolver}
      schemaKey={schemaKey}
      target={target}
    >
      <HomeRouteGeneratedWorkspace
        getSectionSelection={(section) => ({
          selectedContextRecordId: selectHomeRouteSectionContextRecordId(
            selectionState,
            homeScreen.screenName,
            section.id,
          ),
          selectedQueryName: selectHomeRouteSectionQueryName(
            selectionState,
            homeScreen.screenName,
            section.id,
          ),
        })}
        onSelectContext={(section, recordId) =>
          setSelectionState((current) =>
            withHomeRouteSelectedSectionContextRecordId(
              current,
              homeScreen.screenName,
              section.id,
              recordId,
            ),
          )
        }
        onSelectQuery={(section, queryName) =>
          setSelectionState((current) =>
            withHomeRouteSelectedSectionQueryName(
              current,
              homeScreen.screenName,
              section.id,
              queryName,
            ),
          )
        }
        onGeneratedWorkspaceController={onGeneratedWorkspaceController}
        screen={homeScreen}
        sectionExternalActions={sectionExternalActions}
        today={today}
        workspaceActions={workspaceActions}
      />
    </SchemaAppProvider>
  );

  return workspace;
}

function HomeRouteGeneratedWorkspace({
  onGeneratedWorkspaceController,
  ...props
}: GeneratedWorkspaceRuntimeProps & {
  onGeneratedWorkspaceController?: (
    controller: GeneratedWorkspaceRuntimeController | undefined,
  ) => void;
}) {
  return onGeneratedWorkspaceController ? (
    <GeneratedWorkspaceRuntimeRegistration
      {...props}
      onController={onGeneratedWorkspaceController}
    />
  ) : (
    <GeneratedWorkspaceRuntime {...props} />
  );
}

function HomeRouteSchemaSystemState({ appLabel }: { appLabel: string }) {
  const syncStatus = useSyncStatus();
  const failed = syncStatus.state === "error";

  return (
    <ApplicationSystemStateRuntime
      snapshot={projectApplicationSystemState({
        ...(failed
          ? {
              feedback: {
                id: "feedback:schema-load",
                intent: "danger" as const,
                title: `${appLabel} unavailable`,
              },
            }
          : {}),
        heading: "Formless",
        id: `application-system-state:schema:${appLabel}`,
        message: failed ? `Could not load ${appLabel}.` : `Loading ${appLabel}...`,
        state: failed ? "failure" : "loading",
      })}
    />
  );
}

function useTodayDateString() {
  const [today, setToday] = useState(() => todayDateString());

  useEffect(() => {
    let timeoutId: number | undefined;

    function scheduleNextMidnight() {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);

      timeoutId = window.setTimeout(
        () => {
          setToday(todayDateString());
          scheduleNextMidnight();
        },
        nextMidnight.getTime() - now.getTime() + 1,
      );
    }

    scheduleNextMidnight();

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  return today;
}
