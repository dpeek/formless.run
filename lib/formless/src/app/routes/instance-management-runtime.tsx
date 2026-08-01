import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import type { PresentationIntent } from "@dpeek/formless-presentation/contract";
import { isManagementIntent, type PresentationNodeSet } from "@dpeek/formless-presentation/host";
import { programClientTarget } from "../../client/program-target.ts";
import { FORMLESS_PROGRAM_SCHEMA_KEY } from "../../program/target.ts";
import { normalizeRuntimeBrowserPath } from "../runtime-profile.ts";
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
  onPollWorkspaceOperation,
  onStartWorkspacePush,
  workspaceGatewayState,
}: {
  onOpenWorkspaceAuthorization: (url: string) => void;
  onPollWorkspaceOperation: (operationId: string, operationKind: "push") => Promise<void> | void;
  onStartWorkspacePush: () => Promise<void> | void;
  workspaceGatewayState: WorkspaceGatewayRouteState;
}) {
  const application = useApplicationRuntimePublicationCoordinatorContext();
  const [location] = useLocation();
  const screenPath = normalizeRuntimeBrowserPath(location);
  const [publicationController] = useState(() =>
    createInstanceManagementRuntimePublicationController(application),
  );
  const [controlPlaneLoadError, setControlPlaneLoadError] = useState<string>();
  const programTarget = useMemo(() => programClientTarget(), []);
  const actions = useMemo<InstanceManagementIntentActions>(
    () => ({
      openAuthorization: onOpenWorkspaceAuthorization,
      pollWorkspaceOperation: onPollWorkspaceOperation,
      startWorkspacePush: onStartWorkspacePush,
    }),
    [onOpenWorkspaceAuthorization, onPollWorkspaceOperation, onStartWorkspacePush],
  );
  const registerRoutes = useCallback(
    (controller: GeneratedWorkspaceRuntimeController | undefined) =>
      publicationController.updateWorkspace(controller),
    [publicationController],
  );
  const updateControlPlaneLoadState = useCallback((loadState: HomeRouteClientLoadState) => {
    setControlPlaneLoadError(loadState.state === "failed" ? loadState.message : undefined);
  }, []);

  useLayoutEffect(() => {
    publicationController.updateRuntime(
      {
        ...(controlPlaneLoadError === undefined ? {} : { controlPlaneLoadError }),
        workspaceGatewayState,
      },
      actions,
    );
  }, [actions, screenPath, controlPlaneLoadError, publicationController, workspaceGatewayState]);

  useLayoutEffect(() => {
    publicationController.activate();
    return () => publicationController.dispose();
  }, [publicationController]);

  return (
    <>
      <HomeRoute
        clientSync
        onClientLoadStateChange={updateControlPlaneLoadState}
        onGeneratedWorkspaceController={registerRoutes}
        schemaKey={FORMLESS_PROGRAM_SCHEMA_KEY}
        screenPath="/routes"
        target={programTarget}
      />
      {screenPath === "/routes" ? (
        <ApplicationPresentation
          presentation={{
            kind: "management",
            managementReference: instanceManagementReference,
          }}
        />
      ) : (
        <HomeRoute
          clientSync={false}
          schemaKey={FORMLESS_PROGRAM_SCHEMA_KEY}
          screenPath={screenPath}
          target={programTarget}
        />
      )}
    </>
  );
}
