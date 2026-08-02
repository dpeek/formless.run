import { useEffect, useMemo, useState } from "react";
import { useHydrated, useSchema } from "../../client/store.ts";
import { useSyncStatus } from "../../client/sync-status.ts";
import { selectScreenModelByPath } from "../../client/views.ts";
import { todayDateString } from "../../shared/date.ts";
import { FORMLESS_PROGRAM_SCHEMA_KEY } from "../../program/target.ts";
import {
  GeneratedWorkspaceRuntime,
  GeneratedWorkspaceRuntimeRegistration,
  type GeneratedWorkspaceRuntimeController,
  type GeneratedWorkspaceRuntimeProps,
  type GeneratedWorkspaceSectionExternalAction,
} from "../generated/generated-workspace-runtime.tsx";
import { NotFoundRoute } from "./not-found.tsx";
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
  onClientLoadStateChange,
  onGeneratedWorkspaceController,
  sectionExternalActions,
  screenPath,
  workspaceActions,
}: {
  onClientLoadStateChange?: ((state: HomeRouteClientLoadState) => void) | undefined;
  onGeneratedWorkspaceController?: (
    controller: GeneratedWorkspaceRuntimeController | undefined,
  ) => void;
  sectionExternalActions?: Readonly<
    Record<string, readonly GeneratedWorkspaceSectionExternalAction[] | undefined>
  >;
  screenPath: string;
  workspaceActions?: readonly WorkspaceLinkActionContract[];
}) {
  const schema = useSchema();
  const hydrated = useHydrated();
  const syncStatus = useSyncStatus();
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
  }, [setSelectionState]);

  useEffect(() => {
    if (!onClientLoadStateChange) {
      return;
    }

    onClientLoadStateChange(
      syncStatus.state === "error"
        ? { message: syncStatus.message, state: "failed" }
        : hydrated
          ? { state: "ready" }
          : { state: "loading" },
    );
  }, [hydrated, onClientLoadStateChange, syncStatus]);

  if (!schema) {
    if (onGeneratedWorkspaceController) {
      return null;
    }

    return <HomeRouteSchemaSystemState />;
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
          id: `application-system-state:schema-empty:${FORMLESS_PROGRAM_SCHEMA_KEY}`,
          message: "No entities are defined in the active schema.",
          state: "empty",
        })}
      />
    );
  }

  return (
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
  );
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

function HomeRouteSchemaSystemState() {
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
                title: "Formless Program unavailable",
              },
            }
          : {}),
        heading: "Formless",
        id: "application-system-state:schema:formless-program",
        message: failed ? "Could not load Formless Program." : "Loading Formless Program...",
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
