import type {
  ButtonContract,
  ManagementAuthorizationPromptContract,
  ManagementFeedbackContract,
  ManagementIntent,
  ManagementManifestContract,
  ManagementReadyContract,
  ManagementWorkspaceOperationContract,
  WorkspaceManifestReference,
} from "@dpeek/formless-presentation/contract";
import type { WorkspaceGatewayPush } from "@dpeek/formless-gateway/client";
import {
  normalizeGeneratedOperationRuntimeAdapterResponse,
  projectWorkspaceOperationControlBinding,
  workspaceGatewayErrorMessage,
  workspaceGatewayPushGeneratedProgress,
  workspaceGatewayPushGeneratedRuntimeAdapterResponse,
  type GeneratedOperationExecutionState,
} from "../../client/views.ts";
import { projectGeneratedOperationControl } from "../generated/operation-projection.ts";
import type { WorkspaceGatewayRouteState } from "./instance-shell.tsx";
import type { WorkspaceGatewayRouteFailureCode } from "./instance-shell.tsx";
import type { SyncStatusErrorCode } from "../../client/sync-status.ts";
import {
  INSTANCE_MANAGEMENT_ID,
  INSTANCE_MANAGEMENT_PUSH_CONTROL_ID,
  INSTANCE_MANAGEMENT_PUSH_OPERATION_ID,
  instanceManagementLoadingManifest,
} from "./instance-management-contract.ts";

export {
  INSTANCE_MANAGEMENT_ID,
  INSTANCE_MANAGEMENT_PUSH_CONTROL_ID,
  INSTANCE_MANAGEMENT_PUSH_OPERATION_ID,
  instanceManagementReference,
} from "./instance-management-contract.ts";

export type InstanceManagementWorkspaceReferences = {
  routes: WorkspaceManifestReference;
};

export type ProjectInstanceManagementOptions = {
  controlPlaneLoadFailure?: SyncStatusErrorCode;
  workspaceGatewayState: WorkspaceGatewayRouteState;
  workspaces?: InstanceManagementWorkspaceReferences;
};

export type InstanceManagementAuthorizationRuntime = {
  operationId: string;
  operationKind: "push";
  promptId: string;
  url: string;
};

export type InstanceManagementProjection = {
  authorization?: InstanceManagementAuthorizationRuntime;
  manifest: ManagementManifestContract;
};

export type ResolvedInstanceManagementIntent =
  | {
      accountId: string;
      interactionId: string;
      kind: "accountSelection";
      pushId: string;
    }
  | { kind: "authorizationOpen"; authorization: InstanceManagementAuthorizationRuntime }
  | { kind: "ignored" }
  | { kind: "workspacePush" };

export type InstanceManagementIntentActions = {
  openAuthorization: (url: string) => void;
  pollWorkspacePush: (pushId: string) => Promise<void> | void;
  selectAccount: (input: {
    accountId: string;
    interactionId: string;
    pushId: string;
  }) => Promise<void> | void;
  startWorkspacePush: () => Promise<void> | void;
};

export function projectInstanceManagement(
  options: ProjectInstanceManagementOptions,
): InstanceManagementProjection {
  const base = {
    accessibilityLabel: "Instance management",
    id: INSTANCE_MANAGEMENT_ID,
    kind: "managementManifest" as const,
    title: "Instance Settings",
  };

  if (options.controlPlaneLoadFailure) {
    return {
      manifest: {
        ...base,
        feedback: managementFeedback(
          "control-plane-load",
          "Instance management unavailable",
          "Program routes could not be loaded. Try again.",
          "danger",
        ),
        state: "failed",
      },
    };
  }

  if (!options.workspaces) {
    return { manifest: instanceManagementLoadingManifest };
  }

  const workspace = projectWorkspaceOperation(options.workspaceGatewayState);
  const manifest: ManagementReadyContract = {
    ...base,
    state: "ready",
    ...(workspace.operation === undefined
      ? {}
      : {
          workspaceOperation:
            workspace.authorization === undefined
              ? workspace.operation
              : { ...workspace.operation, authorizationPrompt: workspace.authorization },
        }),
    ...(workspace.feedback === undefined ? {} : { workspaceFeedback: workspace.feedback }),
    workspaces: [{ reference: options.workspaces.routes, role: "routes" }],
  };

  return {
    ...(workspace.authorizationRuntime === undefined
      ? {}
      : { authorization: workspace.authorizationRuntime }),
    manifest,
  };
}

export function resolveInstanceManagementIntent(
  projection: InstanceManagementProjection,
  intent: ManagementIntent,
): ResolvedInstanceManagementIntent {
  if (intent.managementId !== projection.manifest.id || projection.manifest.state !== "ready") {
    return { kind: "ignored" };
  }

  if (intent.type === "managementWorkspaceOperation") {
    const operation = projection.manifest.workspaceOperation;
    return operation &&
      intent.operationId === operation.id &&
      intent.controlId === operation.control.id &&
      intent.intent.type === "operationInvoke" &&
      intent.intent.controlId === operation.control.id &&
      operation.control.trigger.disabled !== true
      ? { kind: "workspacePush" }
      : { kind: "ignored" };
  }

  if (intent.type === "managementAuthorizationOpen") {
    const operation = projection.manifest.workspaceOperation;
    const prompt = operation?.authorizationPrompt;
    return prompt &&
      projection.authorization &&
      intent.operationId === operation.id &&
      intent.promptId === prompt.id &&
      intent.controlId === prompt.action.id
      ? { authorization: projection.authorization, kind: "authorizationOpen" }
      : { kind: "ignored" };
  }

  if (intent.type === "managementAccountSelection") {
    const operation = projection.manifest.workspaceOperation;
    const prompt = operation?.accountSelectionPrompt;
    const choice = prompt?.choices.find(
      (candidate) =>
        candidate.accountId === intent.accountId &&
        candidate.action.id === intent.controlId &&
        candidate.intent.interactionId === intent.interactionId &&
        candidate.intent.pushId === intent.pushId,
    );
    return operation &&
      prompt &&
      choice &&
      intent.operationId === operation.id &&
      intent.promptId === prompt.id &&
      projection.authorization === undefined
      ? {
          accountId: choice.accountId,
          interactionId: intent.interactionId,
          kind: "accountSelection",
          pushId: choice.intent.pushId,
        }
      : { kind: "ignored" };
  }

  return { kind: "ignored" };
}

export async function dispatchInstanceManagementIntent(
  projection: InstanceManagementProjection,
  intent: ManagementIntent,
  actions: InstanceManagementIntentActions,
): Promise<void> {
  const resolved = resolveInstanceManagementIntent(projection, intent);

  if (resolved.kind === "workspacePush") {
    await actions.startWorkspacePush();
    return;
  }

  if (resolved.kind === "authorizationOpen") {
    actions.openAuthorization(resolved.authorization.url);
    await actions.pollWorkspacePush(resolved.authorization.operationId);
    return;
  }

  if (resolved.kind === "accountSelection") {
    await actions.selectAccount({
      accountId: resolved.accountId,
      interactionId: resolved.interactionId,
      pushId: resolved.pushId,
    });
  }
}

export function workspacePushOperationExecutionState({
  error,
  push,
}: {
  error?: WorkspaceGatewayRouteFailureCode;
  push?: WorkspaceGatewayPush;
}): GeneratedOperationExecutionState {
  if (!push && !error) {
    return { executionKey: INSTANCE_MANAGEMENT_PUSH_OPERATION_ID, status: "idle" };
  }

  const progress = push ? workspaceGatewayPushGeneratedProgress(push) : undefined;
  const startedAt = workspaceOperationTimestamp(push?.createdAt);
  const completedAt = workspaceOperationTimestamp(push?.updatedAt);
  const base = {
    executionKey: INSTANCE_MANAGEMENT_PUSH_OPERATION_ID,
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(progress === undefined ? {} : { progress }),
  };

  if (error) {
    return {
      ...base,
      status: "failed",
      result: { displayError: workspaceGatewayRouteFailureMessage(error), type: "failed" },
      ...(completedAt === undefined ? {} : { completedAt }),
    };
  }

  if (!push) {
    return { ...base, status: "idle" };
  }

  if (
    push.lifecycle === "queued" ||
    push.lifecycle === "running" ||
    push.lifecycle === "waiting-for-interaction"
  ) {
    return { ...base, status: "pending" };
  }

  const result = normalizeGeneratedOperationRuntimeAdapterResponse(
    workspaceGatewayPushGeneratedRuntimeAdapterResponse(push),
  );

  return {
    ...base,
    status: result.type,
    result,
    ...(completedAt === undefined ? {} : { completedAt }),
  };
}

function projectWorkspaceOperation(state: WorkspaceGatewayRouteState): {
  authorization?: ManagementAuthorizationPromptContract;
  authorizationRuntime?: InstanceManagementAuthorizationRuntime;
  feedback?: ManagementFeedbackContract;
  operation?: ManagementWorkspaceOperationContract;
} {
  if (state.status === "failed") {
    return {
      feedback: managementFeedback(
        "workspace-gateway",
        "Push unavailable",
        workspaceGatewayRouteFailureMessage(state.code),
        "danger",
      ),
    };
  }

  if (state.status !== "ready") {
    return {};
  }

  const push = managementPush(state);
  const executionState = workspacePushOperationExecutionState({
    error: state.error,
    push,
  });
  const disabledReason = state.csrfToken ? undefined : "Workspace authorization is unavailable.";
  const binding = projectWorkspaceOperationControlBinding(
    {
      bootstrapAllowed: false,
      ...(disabledReason === undefined ? {} : { disabledReason }),
      inputFields: ["dryRun", "targetAlias"],
      key: "push",
      kind: "push",
      label: "Push",
      mode: "write",
      requiredCapability: "workspace-source-sync",
    },
    {
      executionKey: INSTANCE_MANAGEMENT_PUSH_OPERATION_ID,
      id: INSTANCE_MANAGEMENT_PUSH_CONTROL_ID,
    },
  );

  if (!binding) {
    return {};
  }

  const control = projectGeneratedOperationControl({
    binding,
    feedbackCopy: {
      committed: { title: "Push synced" },
      failed: { title: "Push failed" },
      pending: { title: "Pushing workspace" },
      replayed: { title: "Push already synced" },
    },
    presentation: {
      accessibilityLabel: "Push workspace",
      content: { kind: "label", label: "Push" },
      density: "compact",
      pendingLabel: "Pushing workspace",
      prominence: "primary",
    },
    state: executionState,
  });
  const authorizationRuntime = selectAuthorizationRuntime(push);
  const authorization = authorizationRuntime
    ? {
        action: button(`${authorizationRuntime.promptId}:open`, "Open authorization", "secondary"),
        detail: authorizationRuntime.detail,
        id: authorizationRuntime.promptId,
        intent: {
          controlId: `${authorizationRuntime.promptId}:open`,
          managementId: INSTANCE_MANAGEMENT_ID,
          operationId: INSTANCE_MANAGEMENT_PUSH_OPERATION_ID,
          promptId: authorizationRuntime.promptId,
          type: "managementAuthorizationOpen" as const,
        },
        kind: "managementAuthorizationPrompt" as const,
        title: authorizationRuntime.title,
      }
    : undefined;

  return {
    ...(authorization === undefined ? {} : { authorization }),
    ...(authorizationRuntime === undefined
      ? {}
      : {
          authorizationRuntime: {
            operationId: push?.id ?? "",
            operationKind: "push" as const,
            promptId: authorizationRuntime.promptId,
            url: authorizationRuntime.url,
          },
        }),
    operation: {
      ...(selectAccountSelectionPrompt(push) === undefined
        ? {}
        : { accountSelectionPrompt: selectAccountSelectionPrompt(push) }),
      control,
      id: INSTANCE_MANAGEMENT_PUSH_OPERATION_ID,
      kind: "managementWorkspaceOperation" as const,
    },
  };
}

function selectAuthorizationRuntime(push: WorkspaceGatewayPush | undefined) {
  const interaction =
    push?.lifecycle === "waiting-for-interaction" &&
    push.interaction.kind === "external-authorization"
      ? push.interaction
      : undefined;
  if (!interaction) {
    return undefined;
  }
  return {
    detail: "Connect Cloudflare to continue Workspace Push.",
    promptId: `instance-management:workspace:push:authorization:${interaction.id}`,
    title: "Cloudflare authorization",
    url: interaction.url,
  };
}

function selectAccountSelectionPrompt(push: WorkspaceGatewayPush | undefined) {
  const interaction =
    push?.lifecycle === "waiting-for-interaction" && push.interaction.kind === "account-selection"
      ? push.interaction
      : undefined;
  if (!push || !interaction) return undefined;
  const promptId = `instance-management:workspace:push:account:${interaction.id}`;
  return {
    choices: interaction.choices.map((choice) => {
      const controlId = `${promptId}:${choice.id}`;
      return {
        accountId: choice.id,
        action: button(controlId, choice.name ?? choice.id),
        id: controlId,
        intent: {
          accountId: choice.id,
          controlId,
          interactionId: interaction.id,
          managementId: INSTANCE_MANAGEMENT_ID,
          operationId: INSTANCE_MANAGEMENT_PUSH_OPERATION_ID,
          promptId,
          pushId: push.id,
          type: "managementAccountSelection" as const,
        },
        label: choice.name ?? choice.id,
      };
    }),
    detail: "Choose the Cloudflare account for this workspace.",
    id: promptId,
    kind: "managementAccountSelectionPrompt" as const,
    title: "Select Cloudflare account",
  };
}

function managementPush(
  state: Extract<WorkspaceGatewayRouteState, { status: "ready" }>,
): WorkspaceGatewayPush | undefined {
  return state.currentPush ?? state.latestPush;
}

function managementFeedback(
  id: string,
  title: string,
  detail: string,
  intent: "danger" | "info" | "neutral" | "success" | "warning",
) {
  return {
    detail,
    id: `instance-management:feedback:${id}`,
    intent,
    kind: "managementFeedback" as const,
    title,
  };
}

export function workspaceGatewayRouteFailureMessage(
  code: WorkspaceGatewayRouteFailureCode,
): string {
  return code === "network-failure"
    ? "Workspace gateway request failed. Try again."
    : workspaceGatewayErrorMessage(code);
}

function button(
  id: string,
  label: string,
  prominence: ButtonContract["prominence"] = "secondary",
  type: ButtonContract["type"] = "button",
  disabled = false,
): ButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    ...(disabled ? { disabled: true } : {}),
    id,
    kind: "button",
    prominence,
    type,
  };
}

function workspaceOperationTimestamp(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}
