import { describe, expect, it } from "vite-plus/test";
import type {
  ManagementReadyContract,
  ManagementAccountSelectionIntent,
  WorkspaceContract,
  WorkspaceIntent,
} from "@dpeek/formless-presentation/contract";
import { workspaceManifestReference } from "@dpeek/formless-presentation/host";
import type { WorkspaceGatewayPush } from "@dpeek/formless-gateway/client";
import { createApplicationRuntimePublicationCoordinator } from "../generated/application-runtime-contract-host.tsx";
import { prepareGeneratedWorkspaceRuntimePublication } from "../generated/generated-workspace-contract-host.ts";
import type { GeneratedWorkspaceRuntimeController } from "../generated/generated-workspace-runtime.tsx";
import type { WorkspaceGatewayRouteState } from "./instance-shell.tsx";
import {
  dispatchInstanceManagementIntent,
  instanceManagementReference,
  projectInstanceManagement,
  resolveInstanceManagementIntent,
  type InstanceManagementIntentActions,
  type ProjectInstanceManagementOptions,
} from "./instance-management-projection.ts";
import {
  createInstanceManagementRuntimePublicationController,
  selectInstanceManagementScreen,
} from "./instance-management-runtime.tsx";
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

  it("projects, resolves, and dispatches only a current account-selection choice", async () => {
    const currentPush = accountSelectionPush();
    const projection = projectInstanceManagement(
      input({ workspaceGatewayState: gatewayReady({ currentPush }) }),
    );
    const prompt = required(readyManifest(projection).workspaceOperation?.accountSelectionPrompt);
    const intent = prompt.choices[0]!.intent as ManagementAccountSelectionIntent;

    expect(resolveInstanceManagementIntent(projection, intent)).toEqual({
      accountId: "account-a",
      interactionId: "interaction_1234567890abcdef",
      kind: "accountSelection",
      pushId: currentPush.id,
    });
    expect(
      resolveInstanceManagementIntent(projection, { ...intent, accountId: "unlisted" }),
    ).toEqual({ kind: "ignored" });

    const selected: unknown[] = [];
    await dispatchInstanceManagementIntent(projection, intent, {
      ...actions(),
      selectAccount: (input) => {
        selected.push(input);
      },
    });
    expect(selected).toEqual([
      {
        accountId: "account-a",
        interactionId: "interaction_1234567890abcdef",
        pushId: currentPush.id,
      },
    ]);
  });
});

describe("instance management runtime publication", () => {
  it("selects route management by stable screen key at a relocated path", () => {
    expect(
      selectInstanceManagementScreen({
        routesScreenPath: "/infrastructure/routes",
        screenKey: "routes",
        screenPath: "/infrastructure/routes",
      }),
    ).toEqual({
      activeWorkspacePath: "/infrastructure/routes",
      managementSelected: true,
      routesWorkspacePath: "/infrastructure/routes",
    });
    expect(
      selectInstanceManagementScreen({
        routesScreenPath: "/infrastructure/routes",
        screenKey: "deployments",
        screenPath: "/deployments",
      }),
    ).toEqual({
      activeWorkspacePath: "/deployments",
      managementSelected: false,
      routesWorkspacePath: "/infrastructure/routes",
    });
  });

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
    status: "ready",
    ...overrides,
  };
}

function accountSelectionPush(): WorkspaceGatewayPush {
  return {
    createdAt: "2026-08-04T00:00:00.000Z",
    id: "push_1234567890abcdef",
    interaction: {
      choices: [{ id: "account-a", name: "Account A" }],
      expiresAt: "2026-08-04T00:05:00.000Z",
      id: "interaction_1234567890abcdef",
      kind: "account-selection",
      provider: "cloudflare",
    },
    lifecycle: "waiting-for-interaction",
    mode: "apply",
    phases: [
      { id: "credentials", status: "succeeded" },
      { id: "account-selection", status: "running" },
      { id: "desired-state-plan", status: "pending" },
      { id: "provider-reconciliation", status: "pending" },
      { id: "health-check", status: "pending" },
      { id: "owner-setup", status: "pending" },
      { id: "workspace-push-writeback", status: "pending" },
      { id: "observation-refresh", status: "pending" },
    ],
    updatedAt: "2026-08-04T00:00:01.000Z",
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
    pollWorkspacePush: () => undefined,
    selectAccount: () => undefined,
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
