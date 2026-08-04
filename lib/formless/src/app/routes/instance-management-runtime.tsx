import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import type { PresentationIntent } from "@dpeek/formless-presentation/contract";
import { isManagementIntent, type PresentationNodeSet } from "@dpeek/formless-presentation/host";
import type { GeneratedWorkspaceRuntimeController } from "../generated/generated-workspace-runtime.tsx";
import {
  type ApplicationRuntimeContractPublication,
  type ApplicationRuntimePublicationCoordinator,
  useApplicationRuntimePublicationCoordinatorContext,
} from "../generated/application-runtime-contract-host.tsx";
import type { WorkspaceGatewayRouteState } from "./instance-shell.tsx";
import { ApplicationPresentation } from "../application-presentation.tsx";
import { HomeRoute, type HomeRouteClientLoadState } from "./home.tsx";
import {
  dispatchInstanceManagementIntent,
  instanceManagementReference,
  projectInstanceManagement,
  type InstanceManagementIntentActions,
  type InstanceManagementProjection,
  type ProjectInstanceManagementOptions,
} from "./instance-management-projection.ts";
import { INSTANCE_MANAGEMENT_CONTRIBUTOR_ID } from "./instance-management-contract.ts";

export type InstanceManagementRuntimePublicationController = {
  activate(): void;
  dispose(): void;
  updateRuntime(
    input: Omit<ProjectInstanceManagementOptions, "workspaces">,
    actions: InstanceManagementIntentActions,
  ): void;
  updateWorkspace(controller: GeneratedWorkspaceRuntimeController | undefined): void;
};

export function createInstanceManagementRuntimePublicationController(
  application: ApplicationRuntimePublicationCoordinator,
): InstanceManagementRuntimePublicationController {
  let actions: InstanceManagementIntentActions | undefined;
  let disposed = false;
  let input: Omit<ProjectInstanceManagementOptions, "workspaces"> | undefined;
  let projection: InstanceManagementProjection | undefined;
  let routesWorkspace: GeneratedWorkspaceRuntimeController | undefined;

  return { activate, dispose, updateRuntime, updateWorkspace };

  function activate() {
    disposed = false;
    publish();
  }

  function dispose() {
    disposed = true;
    application.remove(INSTANCE_MANAGEMENT_CONTRIBUTOR_ID);
  }

  function updateRuntime(
    nextInput: Omit<ProjectInstanceManagementOptions, "workspaces">,
    nextActions: InstanceManagementIntentActions,
  ) {
    input = nextInput;
    actions = nextActions;
    publish();
  }

  function updateWorkspace(controller: GeneratedWorkspaceRuntimeController | undefined) {
    routesWorkspace = controller;
    publish();
  }

  function publish() {
    if (disposed || !input || !actions) {
      return;
    }

    const routes = routesWorkspace?.publication;
    projection = projectInstanceManagement({
      ...input,
      ...(routes
        ? {
            workspaces: {
              routes: routes.workspaceReference,
            },
          }
        : {}),
    });
    application.publish(
      INSTANCE_MANAGEMENT_CONTRIBUTOR_ID,
      prepareInstanceManagementRuntimePublication({
        dispatch: dispatchManagementIntent,
        projection,
        routes,
      }),
    );
  }

  async function dispatchManagementIntent(intent: PresentationIntent) {
    if (!isManagementIntent(intent) || !projection || !actions) {
      return;
    }
    await dispatchInstanceManagementIntent(projection, intent, actions);
  }
}

export function prepareInstanceManagementRuntimePublication({
  dispatch,
  projection,
  routes,
}: {
  dispatch: (intent: PresentationIntent) => Promise<void> | void;
  projection: InstanceManagementProjection;
  routes: GeneratedWorkspaceRuntimeController["publication"] | undefined;
}): ApplicationRuntimeContractPublication {
  const managementNodes: PresentationNodeSet = [
    { reference: instanceManagementReference, snapshot: projection.manifest },
  ];

  return {
    intentHandlers: [
      {
        dispatch,
        matches: (intent) =>
          isManagementIntent(intent) &&
          intent.managementId === instanceManagementReference.managementId,
      },
      ...(routes?.intentHandlers ?? []),
    ],
    nodes: [...managementNodes, ...(routes?.nodes ?? [])],
  };
}

export function InstanceManagementRuntime({
  onOpenWorkspaceAuthorization,
  onPollWorkspacePush,
  onSelectWorkspaceAccount,
  onStartWorkspacePush,
  routesScreenPath,
  screenKey,
  screenPath,
  workspaceGatewayState,
}: {
  onOpenWorkspaceAuthorization: (url: string) => void;
  onPollWorkspacePush: (pushId: string) => Promise<void> | void;
  onSelectWorkspaceAccount: (input: {
    accountId: string;
    interactionId: string;
    pushId: string;
  }) => Promise<void> | void;
  onStartWorkspacePush: () => Promise<void> | void;
  routesScreenPath?: `/${string}` | undefined;
  screenKey: string;
  screenPath: `/${string}`;
  workspaceGatewayState: WorkspaceGatewayRouteState;
}) {
  const application = useApplicationRuntimePublicationCoordinatorContext();
  const screenSelection = selectInstanceManagementScreen({
    routesScreenPath,
    screenKey,
    screenPath,
  });
  const [publicationController] = useState(() =>
    createInstanceManagementRuntimePublicationController(application),
  );
  const [controlPlaneLoadFailure, setControlPlaneLoadFailure] =
    useState<Extract<HomeRouteClientLoadState, { state: "failed" }>["code"]>();
  const actions = useMemo<InstanceManagementIntentActions>(
    () => ({
      openAuthorization: onOpenWorkspaceAuthorization,
      pollWorkspacePush: onPollWorkspacePush,
      selectAccount: onSelectWorkspaceAccount,
      startWorkspacePush: onStartWorkspacePush,
    }),
    [
      onOpenWorkspaceAuthorization,
      onPollWorkspacePush,
      onSelectWorkspaceAccount,
      onStartWorkspacePush,
    ],
  );
  const registerRoutes = useCallback(
    (controller: GeneratedWorkspaceRuntimeController | undefined) =>
      publicationController.updateWorkspace(controller),
    [publicationController],
  );
  const updateControlPlaneLoadState = useCallback((loadState: HomeRouteClientLoadState) => {
    setControlPlaneLoadFailure(loadState.state === "failed" ? loadState.code : undefined);
  }, []);

  useLayoutEffect(() => {
    publicationController.updateRuntime(
      {
        ...(controlPlaneLoadFailure === undefined ? {} : { controlPlaneLoadFailure }),
        workspaceGatewayState,
      },
      actions,
    );
  }, [actions, screenPath, controlPlaneLoadFailure, publicationController, workspaceGatewayState]);

  useLayoutEffect(() => {
    publicationController.activate();
    return () => publicationController.dispose();
  }, [publicationController]);

  return (
    <>
      {screenSelection.routesWorkspacePath === undefined ? null : (
        <HomeRoute
          onClientLoadStateChange={updateControlPlaneLoadState}
          onGeneratedWorkspaceController={registerRoutes}
          screenPath={screenSelection.routesWorkspacePath}
        />
      )}
      {screenSelection.managementSelected ? (
        <ApplicationPresentation
          presentation={{
            kind: "management",
            managementReference: instanceManagementReference,
          }}
        />
      ) : (
        <HomeRoute screenPath={screenSelection.activeWorkspacePath} />
      )}
    </>
  );
}

export function selectInstanceManagementScreen({
  routesScreenPath,
  screenKey,
  screenPath,
}: {
  routesScreenPath?: `/${string}` | undefined;
  screenKey: string;
  screenPath: `/${string}`;
}): {
  activeWorkspacePath: `/${string}`;
  managementSelected: boolean;
  routesWorkspacePath?: `/${string}` | undefined;
} {
  return {
    activeWorkspacePath: screenPath,
    managementSelected: screenKey === "routes",
    ...(routesScreenPath === undefined ? {} : { routesWorkspacePath: routesScreenPath }),
  };
}
