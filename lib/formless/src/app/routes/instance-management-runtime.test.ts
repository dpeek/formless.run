import { describe, expect, it } from "vite-plus/test";
import type {
  ManagementReadyContract,
  WorkspaceContract,
  WorkspaceIntent,
} from "@dpeek/formless-presentation/contract";
import { workspaceManifestReference } from "@dpeek/formless-presentation/host";
import type { WorkspaceGatewayOperation } from "@dpeek/formless-gateway/client";
import { createApplicationRuntimePublicationCoordinator } from "../generated/application-runtime-contract-host.tsx";
import { prepareGeneratedWorkspaceRuntimePublication } from "../generated/generated-workspace-contract-host.ts";
import type { GeneratedWorkspaceRuntimeController } from "../generated/generated-workspace-runtime.tsx";
import type { WorkspaceGatewayRouteState } from "./instance-shell.tsx";
import {
  instanceManagementReference,
  projectInstanceManagement,
  resolveInstanceManagementIntent,
  type InstanceManagementIntentActions,
  type ProjectInstanceManagementOptions,
} from "./instance-management-projection.ts";
import { createInstanceManagementRuntimePublicationController } from "./instance-management-runtime.tsx";
import { initialInstanceManagementRuntimeContribution } from "./instance-management-contract.ts";

const routesReference = workspaceManifestReference("instance-routes");

describe("instance management projection", () => {
  it("projects loading, failure, and the current routes workspace", () => {
    expect(projectInstanceManagement(input({ workspaces: undefined })).manifest).toMatchObject({
      message: "Loading Program routes...",
      state: "loading",
    });

    expect(
      projectInstanceManagement(input({ controlPlaneLoadError: "Control-plane bootstrap failed." }))
        .manifest,
    ).toMatchObject({
      feedback: { detail: "Control-plane bootstrap failed." },
      state: "failed",
    });

    const ready = readyManifest(projectInstanceManagement(input()));
    expect(ready.workspaces).toEqual([{ reference: routesReference, role: "routes" }]);
  });

  it("projects and resolves workspace push without install intents", () => {
    const projection = projectInstanceManagement(input({ workspaceGatewayState: gatewayReady() }));
    const workspaceOperation = required(readyManifest(projection).workspaceOperation);
    const intent = {
      controlId: workspaceOperation.control.id,
      intent: workspaceOperation.control.trigger.intent,
      managementId: readyManifest(projection).id,
      operationId: workspaceOperation.id,
      type: "managementWorkspaceOperation" as const,
    };

    expect(resolveInstanceManagementIntent(projection, intent)).toEqual({
      kind: "workspacePush",
    });
  });
});

describe("instance management runtime publication", () => {
  it("publishes the routes workspace through one management node", () => {
    const application = createApplicationRuntimePublicationCoordinator([
      initialInstanceManagementRuntimeContribution,
    ]);
    const runtime = createInstanceManagementRuntimePublicationController(application);

    runtime.updateWorkspace(workspaceController());
    runtime.updateRuntime(input({ workspaces: undefined }), actions());
    runtime.activate();

    const manifest = required(application.host.read(instanceManagementReference));
    expect(manifest.state).toBe("ready");
    expect(manifest.state === "ready" ? manifest.workspaces : []).toEqual([
      { reference: routesReference, role: "routes" },
    ]);

    runtime.dispose();
    expect(application.host.read(instanceManagementReference)).toBeUndefined();
  });
});

function input(
  overrides: Partial<ProjectInstanceManagementOptions> = {},
): ProjectInstanceManagementOptions {
  return {
    workspaceGatewayState: gatewayReady(),
    workspaces: { routes: routesReference },
    ...overrides,
  };
}

function gatewayReady(
  overrides: Partial<Extract<WorkspaceGatewayRouteState, { status: "ready" }>> = {},
): Extract<WorkspaceGatewayRouteState, { status: "ready" }> {
  return {
    csrfToken: "csrf-token",
    currentOperation: statusOperation(),
    status: "ready",
    ...overrides,
  };
}

function statusOperation(
  overrides: Partial<WorkspaceGatewayOperation> = {},
): WorkspaceGatewayOperation {
  return {
    actor: "browser",
    createdAt: "2026-07-16T00:00:00.000Z",
    errors: [],
    events: [],
    id: "op_status_00000001",
    input: {},
    kind: "formless.workspaceOperation",
    logs: [],
    operation: "status",
    result: { summary: { fields: {}, title: "Workspace status" } },
    status: "succeeded",
    summary: { fields: {}, title: "Workspace status" },
    updatedAt: "2026-07-16T00:00:02.000Z",
    version: 1,
    workspace: { label: "formless" },
    ...overrides,
  };
}

function workspaceController(
  dispatch: (intent: WorkspaceIntent) => void = () => undefined,
): GeneratedWorkspaceRuntimeController {
  const workspace: WorkspaceContract = {
    accessibilityLabel: "Routes workspace",
    actions: [],
    id: "instance-routes",
    kind: "workspace",
    label: "Routes",
    sections: [],
    width: "standard",
  };
  return {
    dispatch,
    publication: prepareGeneratedWorkspaceRuntimePublication(workspace, dispatch),
    workspace,
  };
}

function actions(): InstanceManagementIntentActions {
  return {
    openAuthorization: () => undefined,
    pollWorkspaceOperation: () => undefined,
    startWorkspacePush: () => undefined,
  };
}

function readyManifest(projection: {
  manifest: ReturnType<typeof projectInstanceManagement>["manifest"];
}): ManagementReadyContract {
  if (projection.manifest.state !== "ready") {
    throw new Error(`Expected ready management, received ${projection.manifest.state}.`);
  }
  return projection.manifest;
}

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error("Expected value.");
  }
  return value;
}
