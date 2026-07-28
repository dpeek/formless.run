import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vite-plus/test";
import type {
  ManagementReadyContract,
  WorkspaceContract,
  WorkspaceIntent,
} from "@dpeek/formless-presentation/contract";
import { workspaceManifestReference } from "@dpeek/formless-presentation/host";
import { listInstallableAppPackages } from "@dpeek/formless-installed-apps";
import type { WorkspaceGatewayOperation } from "@dpeek/formless-gateway/client";
import { bundledAppPackageResolver } from "../../shared/app-packages.ts";
import { createApplicationRuntimePublicationCoordinator } from "../generated/application-runtime-contract-host.tsx";
import { prepareGeneratedWorkspaceRuntimePublication } from "../generated/generated-workspace-contract-host.ts";
import type { GeneratedWorkspaceRuntimeController } from "../generated/generated-workspace-runtime.tsx";
import type { InstanceShellRouteState, WorkspaceGatewayRouteState } from "./instance-shell.tsx";
import {
  instanceManagementInstallDialogReference,
  instanceManagementReference,
  projectInstanceManagement,
  resolveInstanceManagementIntent,
  type InstanceManagementIntentActions,
  type ProjectInstanceManagementOptions,
} from "./instance-management-projection.ts";
import { createInstanceManagementRuntimePublicationController } from "./instance-management-runtime.tsx";
import { initialInstanceManagementRuntimeContribution } from "./instance-management-contract.ts";

const appsReference = workspaceManifestReference("instance-apps");
const routesReference = workspaceManifestReference("instance-routes");

describe("instance management projection", () => {
  it("projects loading and display-safe failure independently from gateway availability", () => {
    expect(projectInstanceManagement(input({ state: { status: "loading" } })).manifest).toEqual({
      accessibilityLabel: "Instance management",
      id: "instance-management",
      kind: "managementManifest",
      message: "Loading installed apps...",
      state: "loading",
      title: "Instance Settings",
    });

    const failed = projectInstanceManagement(
      input({
        state: {
          message:
            'Failed at /Users/ada/formless with CLOUDFLARE_API_TOKEN="secret-provider-token".',
          status: "failed",
        },
      }),
    ).manifest;
    expect(failed.state).toBe("failed");
    expect(JSON.stringify(failed)).toContain("<path>");
    expect(JSON.stringify(failed)).toContain("[redacted]");
    expect(JSON.stringify(failed)).not.toContain("secret-provider-token");

    const unavailable = readyProjection({ workspaceGatewayState: { status: "unavailable" } });
    const gatewayFailed = readyProjection({
      workspaceGatewayState: {
        message: "Gateway failed at /Users/ada/formless with owner-setup-token owner-secret",
        status: "failed",
      },
    });

    expect(unavailable.manifest.state).toBe("ready");
    expect(readyManifest(unavailable).workspaceOperation).toBeUndefined();
    expect(readyManifest(unavailable).workspaces).toEqual([
      { reference: appsReference, role: "apps" },
      { reference: routesReference, role: "routes" },
    ]);
    expect(gatewayFailed.manifest.state).toBe("ready");
    expect(readyManifest(gatewayFailed).workspaceOperation).toBeUndefined();
    expect(readyManifest(gatewayFailed).workspaceFeedback).toMatchObject({
      detail: "Gateway failed at <path> with owner-setup-token [redacted]",
      intent: "danger",
      title: "Push unavailable",
    });
    expect(JSON.stringify(gatewayFailed.manifest)).not.toContain("owner-secret");

    const controlPlaneFailed = projectInstanceManagement(
      input({
        controlPlaneLoadError: "Control-plane bootstrap failed.",
        state: readyState(),
      }),
    );
    expect(controlPlaneFailed.manifest).toMatchObject({
      feedback: {
        detail: "Control-plane bootstrap failed.",
        title: "Instance management unavailable",
      },
      state: "failed",
    });
  });

  it("projects controlled package fields, validation, pending state, and failed submission feedback", () => {
    const invalid = readyProjection({
      installDialogOpen: true,
      installDrafts: {
        site: { installId: "Bad Id", label: "" },
        tasks: { installId: "tasks", label: "Tasks" },
      },
      selectedPackageAppKey: "site",
    });
    const invalidDialog = required(invalid.dialog);

    expect(invalidDialog.open).toBe(true);
    expect(invalidDialog.packageOptions.map(({ packageAppKey }) => packageAppKey)).toEqual([
      "site",
      "tasks",
      "crm",
    ]);
    expect(invalidDialog.errors).toEqual([
      "Install label is required.",
      "Install id must start with a lowercase letter and use lowercase letters, numbers, and single hyphens.",
    ]);
    expect(invalidDialog.fields.label.errors).toEqual([
      { fieldName: "label", message: "Install label is required." },
    ]);
    expect(invalidDialog.submit.disabled).toBe(true);

    const pending = readyProjection({
      state: readyState({ installing: true, installingPackageAppKey: "tasks" }),
      selectedPackageAppKey: "tasks",
    });
    const pendingDialog = required(pending.dialog);
    expect(pendingDialog.pending).toEqual({ isPending: true, label: "Installing app" });
    expect(pendingDialog.fields.installId.pending).toEqual({
      isPending: true,
      label: "Installing app",
    });
    expect(pendingDialog.submit).toMatchObject({ disabled: true });
    expect(pendingDialog.submit.content).toEqual({ kind: "label", label: "Installing..." });

    const failed = readyProjection({
      state: readyState({
        installError:
          'Install failed at /Users/ada/formless with ALCHEMY_API_KEY="secret-alchemy-key".',
        installErrorPackageAppKey: "crm",
      }),
      selectedPackageAppKey: "site",
    });
    expect(failed.selectedPackageAppKey).toBe("crm");
    expect(required(failed.dialog).feedback?.detail).toContain("<path>");
    expect(JSON.stringify(failed.dialog)).not.toContain("secret-alchemy-key");
  });

  it("projects Push lifecycle, progress, authorization, and secret-free host presentation", () => {
    const idle = readyProjection({ workspaceGatewayState: gatewayReady() });
    const pending = readyProjection({
      workspaceGatewayState: gatewayReady({
        currentOperation: operation({
          events: [
            {
              at: "2026-07-16T00:00:01.000Z",
              id: "event:authorize",
              profileLabel: "Local Cloudflare",
              provider: "cloudflare",
              status: "waiting",
              type: "externalAuthorizationUrl",
              url: "https://dash.cloudflare.com/oauth/authorize?client_id=formless",
            },
          ],
          operation: "push",
          status: "running",
          steps: [
            { id: "plan", label: "Plan", status: "succeeded" },
            {
              detail: "Writing /Users/ada/formless with API_TOKEN=secret-step-token",
              id: "push",
              label: "Push source",
              status: "running",
            },
          ],
          summary: { fields: {}, title: "Pushing /Users/ada/formless" },
        }),
      }),
    });
    const succeeded = readyProjection({
      workspaceGatewayState: gatewayReady({
        currentOperation: operation({ operation: "push", status: "succeeded" }),
      }),
    });
    const failed = readyProjection({
      workspaceGatewayState: gatewayReady({
        currentOperation: operation({ operation: "push", status: "failed" }),
        error: "Push failed with CLOUDFLARE_API_TOKEN=secret-failure-token",
      }),
    });

    expect(required(readyManifest(idle).workspaceOperation).control.status.status).toBe("idle");
    expect(required(readyManifest(pending).workspaceOperation).control).toMatchObject({
      progress: {
        steps: [
          { id: "plan", status: "succeeded" },
          { detail: "Writing <path> with API_TOKEN=[redacted]", id: "push", status: "running" },
        ],
        title: "Pushing <path>",
      },
      status: { status: "pending" },
      trigger: { disabled: true },
    });
    expect(required(readyManifest(succeeded).workspaceOperation).control.status.status).toBe(
      "committed",
    );
    expect(required(readyManifest(failed).workspaceOperation).control.status).toMatchObject({
      detail: "Push failed with CLOUDFLARE_API_TOKEN=[redacted]",
      status: "failed",
    });
    expect(readyManifest(pending).workspaceOperation?.authorizationPrompt).toMatchObject({
      detail: "Local Cloudflare requires external authorization.",
      title: "Cloudflare authorization",
    });
    expect(pending.authorization?.url).toBe(
      "https://dash.cloudflare.com/oauth/authorize?client_id=formless",
    );
    expect(JSON.stringify(pending.manifest)).not.toContain("dash.cloudflare.com");
    expect(JSON.stringify(pending.manifest)).not.toContain("secret-step-token");

    const operationIntent = managementPushIntent(pending);
    expect(resolveInstanceManagementIntent(pending, operationIntent)).toEqual({
      kind: "ignored",
    });
  });
});

describe("instance management runtime publication", () => {
  it("receives control-plane load failures without subscribing to global sync feedback", async () => {
    const source = await readFile(
      new URL("./instance-management-runtime.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("onClientLoadStateChange={updateControlPlaneLoadState}");
    expect(source).not.toContain("useSyncStatus");
  });

  it("atomically composes current workspace nodes and dispatches exact latest intents", async () => {
    const application = createApplicationRuntimePublicationCoordinator();
    const runtime = createInstanceManagementRuntimePublicationController(application);
    const calls: Array<{
      kind: string;
      value?: unknown;
    }> = [];
    const actions = actionsRecording(calls);
    const appWorkspaceIntents: WorkspaceIntent[] = [];
    runtime.updateRuntime(input(), actions);
    expect(required(application.host.read(instanceManagementReference)).state).toBe("loading");
    runtime.updateWorkspace(
      "apps",
      workspaceController("instance-apps", "Apps · empty", (intent) =>
        appWorkspaceIntents.push(intent),
      ),
    );
    expect(required(application.host.read(instanceManagementReference)).state).toBe("loading");

    runtime.updateWorkspace("routes", workspaceController("instance-routes", "Routes · empty"));
    const ready = readyManifest({
      manifest: required(application.host.read(instanceManagementReference)),
    });
    const dialog = required(application.host.read(instanceManagementInstallDialogReference));
    expect(ready.state).toBe("ready");
    expect(application.host.read(ready.workspaces[0].reference)?.label).toBe("Apps · empty");
    expect(application.host.read(ready.workspaces[1].reference)?.label).toBe("Routes · empty");

    runtime.updateWorkspace(
      "apps",
      workspaceController("instance-apps", "Apps · 2 installed", (intent) =>
        appWorkspaceIntents.push(intent),
      ),
    );
    expect(application.host.read(ready.workspaces[0].reference)?.label).toBe("Apps · 2 installed");

    await application.host.dispatch({ ...dialog.closeIntent, open: true });
    await application.host.dispatch(dialog.packageOptions[1]!.selectionIntent);
    await application.host.dispatch({
      dialogId: dialog.id,
      fieldId: dialog.fields.label.fieldId,
      intent: {
        fieldName: "label",
        fieldValue: { kind: "input", value: "Task Space" },
        type: "createDraftChange",
      },
      managementId: ready.id,
      type: "managementInstallField",
    });
    await application.host.dispatch(dialog.submitIntent);
    await application.host.dispatch(managementPushIntent({ manifest: ready }));
    expect(calls).toEqual([
      { kind: "dialog", value: true },
      { kind: "package", value: "tasks" },
      { kind: "draft", value: ["site", { installId: "site", label: "Task Space" }] },
      { kind: "submit", value: "site" },
      { kind: "push" },
    ]);

    const workspaceIntent = {
      collectionId: "app-installs",
      queryId: "all",
      screenId: "instance-apps",
      sectionId: "app-installs",
      type: "workspaceQuerySelection",
    } as const;
    await application.host.dispatch(workspaceIntent);
    expect(appWorkspaceIntents).toEqual([workspaceIntent]);

    runtime.updateRuntime(
      input({
        workspaceGatewayState: gatewayReady({
          currentOperation: operation({
            events: [
              {
                at: "2026-07-16T00:00:01.000Z",
                id: "event:authorize",
                profileLabel: "Local Cloudflare",
                provider: "cloudflare",
                status: "waiting",
                type: "externalAuthorizationUrl",
                url: "https://dash.cloudflare.com/oauth/authorize?client_id=formless",
              },
            ],
            id: "op_push_00000009",
            operation: "push",
            status: "running",
          }),
        }),
      }),
      actions,
    );
    const authorized = readyManifest({
      manifest: required(application.host.read(instanceManagementReference)),
    });
    await application.host.dispatch(
      required(authorized.workspaceOperation?.authorizationPrompt).intent,
    );
    expect(calls.slice(-2)).toEqual([
      {
        kind: "open",
        value: "https://dash.cloudflare.com/oauth/authorize?client_id=formless",
      },
      { kind: "poll", value: ["op_push_00000009", "push"] },
    ]);

    await application.host.dispatch(managementPushIntent({ manifest: authorized }));
    expect(calls.filter(({ kind }) => kind === "push")).toHaveLength(1);

    runtime.dispose();
    expect(application.host.read(instanceManagementReference)).toBeUndefined();
    expect(application.host.read(appsReference)).toBeUndefined();

    runtime.activate();
    expect(required(application.host.read(instanceManagementReference)).state).toBe("ready");
    expect(application.host.read(appsReference)?.label).toBe("Apps · 2 installed");
    runtime.dispose();
  });

  it("replaces the server loading contribution without an absent management snapshot", () => {
    const application = createApplicationRuntimePublicationCoordinator([
      initialInstanceManagementRuntimeContribution,
    ]);
    const observedStates: string[] = [
      required(application.host.read(instanceManagementReference)).state,
    ];
    application.host.subscribe(instanceManagementReference, () => {
      observedStates.push(application.host.read(instanceManagementReference)?.state ?? "absent");
    });
    const runtime = createInstanceManagementRuntimePublicationController(application);

    runtime.updateRuntime(input(), actionsRecording([]));
    runtime.updateWorkspace("apps", workspaceController("instance-apps", "Apps"));
    runtime.updateWorkspace("routes", workspaceController("instance-routes", "Routes"));

    expect(observedStates[0]).toBe("loading");
    expect(observedStates.at(-1)).toBe("ready");
    expect(observedStates).not.toContain("absent");
  });
  it("keeps invalid and failed install outcomes current without dispatching disabled submits", async () => {
    const calls: Array<{
      kind: string;
      value?: unknown;
    }> = [];
    const application = createApplicationRuntimePublicationCoordinator();
    const runtime = createInstanceManagementRuntimePublicationController(application);
    const actions = actionsRecording(calls);
    runtime.updateWorkspace("apps", workspaceController("instance-apps", "Apps"));
    runtime.updateWorkspace("routes", workspaceController("instance-routes", "Routes"));
    runtime.updateRuntime(
      input({ installDrafts: { site: { installId: "Bad Id", label: "" } } }),
      actions,
    );

    const invalidDialog = required(application.host.read(instanceManagementInstallDialogReference));
    await application.host.dispatch(invalidDialog.submitIntent);
    expect(calls).toEqual([]);

    runtime.updateRuntime(
      input({
        state: readyState({
          installError: "Install failed with API_TOKEN=private-install-token",
          installErrorPackageAppKey: "site",
        }),
      }),
      actions,
    );
    const failedDialog = required(application.host.read(instanceManagementInstallDialogReference));
    expect(failedDialog.feedback?.detail).toBe("Install failed with API_TOKEN=[redacted]");
    expect(JSON.stringify(failedDialog)).not.toContain("private-install-token");
  });
});

function input(overrides: Partial<ProjectInstanceManagementOptions> = {}): Omit<
  ProjectInstanceManagementOptions,
  "workspaces"
> & {
  workspaces?: ProjectInstanceManagementOptions["workspaces"];
} {
  return {
    installDialogOpen: false,
    installDrafts: {
      crm: { installId: "crm", label: "CRM" },
      site: { installId: "site", label: "Site" },
      tasks: { installId: "tasks", label: "Tasks" },
    },
    state: readyState(),
    workspaceGatewayState: gatewayReady(),
    ...overrides,
  };
}

function readyProjection(overrides: Partial<ProjectInstanceManagementOptions> = {}) {
  return projectInstanceManagement(
    input({ workspaces: { apps: appsReference, routes: routesReference }, ...overrides }),
  );
}

function readyManifest(projection: {
  manifest: ReturnType<typeof projectInstanceManagement>["manifest"];
}): ManagementReadyContract {
  if (projection.manifest.state !== "ready") {
    throw new Error(`Expected ready management, received ${projection.manifest.state}.`);
  }
  return projection.manifest;
}
function readyState(
  overrides: Partial<
    Extract<
      InstanceShellRouteState,
      {
        status: "ready";
      }
    >
  > = {},
): Extract<
  InstanceShellRouteState,
  {
    status: "ready";
  }
> {
  return {
    installing: false,
    installs: [],
    packages: listInstallableAppPackages(bundledAppPackageResolver),
    status: "ready",
    ...overrides,
  };
}
function gatewayReady(
  overrides: Partial<
    Extract<
      WorkspaceGatewayRouteState,
      {
        status: "ready";
      }
    >
  > = {},
): Extract<
  WorkspaceGatewayRouteState,
  {
    status: "ready";
  }
> {
  return {
    csrfToken: "csrf-token",
    currentOperation: operation(),
    status: "ready",
    ...overrides,
  };
}

function operation(overrides: Partial<WorkspaceGatewayOperation> = {}): WorkspaceGatewayOperation {
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

function managementPushIntent(projection: {
  manifest: ReturnType<typeof projectInstanceManagement>["manifest"];
}) {
  const operation = required(readyManifest(projection).workspaceOperation);
  return {
    controlId: operation.control.id,
    intent: operation.control.trigger.intent,
    managementId: readyManifest(projection).id,
    operationId: operation.id,
    type: "managementWorkspaceOperation" as const,
  };
}

function workspaceController(
  id: string,
  label: string,
  dispatch: (intent: WorkspaceIntent) => void = () => undefined,
): GeneratedWorkspaceRuntimeController {
  const workspace: WorkspaceContract = {
    accessibilityLabel: `${label} workspace`,
    actions: [],
    id,
    kind: "workspace",
    label,
    sections: [],
    width: "standard",
  };
  return {
    dispatch,
    publication: prepareGeneratedWorkspaceRuntimePublication(workspace, dispatch),
    workspace,
  };
}
function actionsRecording(
  calls: Array<{
    kind: string;
    value?: unknown;
  }>,
): InstanceManagementIntentActions {
  return {
    changeInstallDialogOpen: (open) => calls.push({ kind: "dialog", value: open }),
    changeInstallDraft: (packageAppKey, draft) =>
      calls.push({ kind: "draft", value: [packageAppKey, draft] }),
    openAuthorization: (url) => calls.push({ kind: "open", value: url }),
    pollWorkspaceOperation: (operationId, operationKind) => {
      calls.push({ kind: "poll", value: [operationId, operationKind] });
    },
    selectInstallPackage: (packageAppKey) => calls.push({ kind: "package", value: packageAppKey }),
    startWorkspacePush: () => {
      calls.push({ kind: "push" });
    },
    submitInstall: (packageAppKey) => {
      calls.push({ kind: "submit", value: packageAppKey });
    },
  };
}

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error("Expected value.");
  }
  return value;
}
