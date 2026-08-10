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
      projectInstanceManagement(input({ controlPlaneLoadFailure: "program-sync-failed" })).manifest,
    ).toMatchObject({
      feedback: { detail: "Program routes could not be loaded. Try again." },
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

  it("maps workspace route failure codes to fixed management copy", () => {
    const unavailable = readyManifest(
      projectInstanceManagement(
        input({ workspaceGatewayState: { code: "network-failure", status: "failed" } }),
      ),
    );
    const failedPush = readyManifest(
      projectInstanceManagement(
        input({ workspaceGatewayState: gatewayReady({ error: "push-active" }) }),
      ),
    );

    expect(unavailable.workspaceFeedback).toMatchObject({
      detail: "Workspace gateway request failed. Try again.",
    });
    expect(failedPush.workspaceOperation?.control.status).toMatchObject({
      detail: "A workspace push is already running.",
      status: "failed",
    });
    expect(JSON.stringify({ failedPush, unavailable })).not.toContain("push-active");
  });

  it("projects direct account names and dispatches only a current account-selection choice", async () => {
    const currentPush = accountSelectionPush();
    const projection = projectInstanceManagement(
      input({ workspaceGatewayState: gatewayReady({ currentPush }) }),
    );
    const prompt = required(readyManifest(projection).workspaceOperation?.accountSelectionPrompt);
    const intent = prompt.choices[0]!.intent as ManagementAccountSelectionIntent;

    expect(prompt.choices[0]).toMatchObject({
      action: { content: { label: "Production / Australia" } },
      label: "Production / Australia",
    });
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

  it("uses the Gateway-validated authorization URL for the current interaction", async () => {
    const currentPush = externalAuthorizationPush();
    const projection = projectInstanceManagement(
      input({ workspaceGatewayState: gatewayReady({ currentPush }) }),
    );
    const operation = required(readyManifest(projection).workspaceOperation);
    const prompt = required(operation.authorizationPrompt);
    const authorization = required(projection.authorization);

    expect(authorization.url).toBe(currentPush.interaction.url);
    expect(resolveInstanceManagementIntent(projection, prompt.intent)).toEqual({
      authorization,
      kind: "authorizationOpen",
    });

    const opened: string[] = [];
    const polled: string[] = [];
    await dispatchInstanceManagementIntent(projection, prompt.intent, {
      ...actions(),
      openAuthorization: (url) => {
        opened.push(url);
      },
      pollWorkspacePush: (pushId) => {
        polled.push(pushId);
      },
    });
    expect(opened).toEqual([currentPush.interaction.url]);
    expect(polled).toEqual([currentPush.id]);
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
      choices: [{ id: "account-a", name: "Production / Australia" }],
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

function externalAuthorizationPush(): Extract<
  WorkspaceGatewayPush,
  { lifecycle: "waiting-for-interaction" }
> & {
  interaction: Extract<
    Extract<WorkspaceGatewayPush, { lifecycle: "waiting-for-interaction" }>["interaction"],
    { kind: "external-authorization" }
  >;
} {
  return {
    createdAt: "2026-08-04T00:00:00.000Z",
    id: "push_1234567890abcdef",
    interaction: {
      expiresAt: "2026-08-04T00:05:00.000Z",
      id: "interaction_1234567890abcdef",
      kind: "external-authorization",
      provider: "cloudflare",
      url: "https://dash.cloudflare.com/oauth2/auth?client_id=formless&state=opaque",
    },
    lifecycle: "waiting-for-interaction",
    mode: "apply",
    phases: [
      { id: "credentials", status: "running" },
      { id: "account-selection", status: "pending" },
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
    surface: "constrained",
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
