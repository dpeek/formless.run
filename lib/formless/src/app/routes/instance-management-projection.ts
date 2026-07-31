import type {
  ButtonContract,
  CreateFieldContract,
  ManagementAuthorizationPromptContract,
  ManagementFeedbackContract,
  ManagementInstallDialogContract,
  ManagementIntent,
  ManagementManifestContract,
  ManagementReadyContract,
  ManagementWorkspaceOperationContract,
  WorkspaceManifestReference,
} from "@dpeek/formless-presentation/contract";
import {
  validateAppInstallId,
  type InstallableAppPackage,
  type PackageAppKey,
} from "@dpeek/formless-installed-apps";
import type { WorkspaceGatewayOperation } from "@dpeek/formless-gateway/client";
import { workspaceBrowserOperationControlMetadata } from "@dpeek/formless-workspace";
import {
  normalizeGeneratedOperationRuntimeAdapterResponse,
  projectWorkspaceOperationControlBinding,
  workspaceGatewayOperationGeneratedProgress,
  workspaceGatewayOperationGeneratedRuntimeAdapterResponse,
  type GeneratedOperationExecutionState,
} from "../../client/views.ts";
import { projectGeneratedOperationControl } from "../generated/operation-projection.ts";
import type {
  InstanceShellRouteState,
  PackageInstallDraft,
  PackageInstallDrafts,
  WorkspaceGatewayRouteState,
} from "./instance-shell.tsx";
import {
  displaySafeAuthorizationUrl,
  displaySafeText,
} from "./instance-management-display-safety.ts";
import {
  INSTANCE_MANAGEMENT_ID,
  INSTANCE_MANAGEMENT_INSTALL_DIALOG_ID,
  INSTANCE_MANAGEMENT_PUSH_CONTROL_ID,
  INSTANCE_MANAGEMENT_PUSH_OPERATION_ID,
  instanceManagementInstallDialogReference,
  instanceManagementLoadingManifest,
} from "./instance-management-contract.ts";

export {
  INSTANCE_MANAGEMENT_ID,
  INSTANCE_MANAGEMENT_INSTALL_DIALOG_ID,
  INSTANCE_MANAGEMENT_PUSH_CONTROL_ID,
  INSTANCE_MANAGEMENT_PUSH_OPERATION_ID,
  instanceManagementInstallDialogReference,
  instanceManagementReference,
} from "./instance-management-contract.ts";

export type InstanceManagementWorkspaceReferences = {
  apps: WorkspaceManifestReference;
  routes: WorkspaceManifestReference;
};

export type ProjectInstanceManagementOptions = {
  activeWorkspace: keyof InstanceManagementWorkspaceReferences;
  controlPlaneLoadError?: string | undefined;
  installDialogOpen: boolean;
  installDrafts: PackageInstallDrafts;
  selectedPackageAppKey?: PackageAppKey | undefined;
  state: InstanceShellRouteState;
  workspaceGatewayState: WorkspaceGatewayRouteState;
  workspaces?: InstanceManagementWorkspaceReferences | undefined;
};

export type InstanceManagementAuthorizationRuntime = {
  operationId: string;
  operationKind: "push";
  promptId: string;
  url: string;
};

export type InstanceManagementProjection = {
  authorization?: InstanceManagementAuthorizationRuntime | undefined;
  dialog?: ManagementInstallDialogContract | undefined;
  manifest: ManagementManifestContract;
  selectedDraft?: PackageInstallDraft | undefined;
  selectedPackageAppKey?: PackageAppKey | undefined;
};

export type ResolvedInstanceManagementIntent =
  | { kind: "authorizationOpen"; authorization: InstanceManagementAuthorizationRuntime }
  | { kind: "ignored" }
  | { kind: "installDialogOpenChange"; open: boolean }
  | { draft: PackageInstallDraft; kind: "installDraftChange"; packageAppKey: PackageAppKey }
  | { kind: "installPackageSelection"; packageAppKey: PackageAppKey }
  | { kind: "installSubmit"; packageAppKey: PackageAppKey }
  | { kind: "workspacePush" };

export type InstanceManagementIntentActions = {
  changeInstallDraft: (packageAppKey: PackageAppKey, draft: PackageInstallDraft) => void;
  changeInstallDialogOpen: (open: boolean) => void;
  openAuthorization: (url: string) => void;
  pollWorkspaceOperation: (operationId: string, operationKind: "push") => Promise<void> | void;
  selectInstallPackage: (packageAppKey: PackageAppKey) => void;
  startWorkspacePush: () => Promise<void> | void;
  submitInstall: (packageAppKey: PackageAppKey) => Promise<void> | void;
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

  if (options.state.status === "loading") {
    return {
      manifest: instanceManagementLoadingManifest,
    };
  }

  if (options.state.status === "failed") {
    return {
      manifest: {
        ...base,
        feedback: managementFeedback(
          "management-load",
          "Instance management unavailable",
          options.state.message,
          "danger",
        ),
        state: "failed",
      },
    };
  }

  if (options.controlPlaneLoadError) {
    return {
      manifest: {
        ...base,
        feedback: managementFeedback(
          "control-plane-load",
          "Instance management unavailable",
          options.controlPlaneLoadError,
          "danger",
        ),
        state: "failed",
      },
    };
  }

  if (!options.workspaces) {
    return {
      manifest: {
        ...base,
        message: "Loading Instance control plane...",
        state: "loading",
      },
    };
  }

  const workspaces = options.workspaces;
  const selectedPackage = selectInstanceManagementPackage(
    options.state.packages,
    options.selectedPackageAppKey,
    options.state.installErrorPackageAppKey,
  );
  const workspace = projectWorkspaceOperation(options.workspaceGatewayState);
  const readyManifest = (): ManagementReadyContract => ({
    ...base,
    installDialog: instanceManagementInstallDialogReference,
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
    workspaces: [
      {
        reference: workspaces[options.activeWorkspace],
        role: options.activeWorkspace,
      },
    ],
  });

  if (!selectedPackage) {
    return {
      ...(workspace.authorizationRuntime === undefined
        ? {}
        : { authorization: workspace.authorizationRuntime }),
      manifest: readyManifest(),
    };
  }

  const selectedDraft = options.installDrafts[selectedPackage.packageAppKey] ?? {
    installId: selectedPackage.defaultInstallId,
    label: selectedPackage.label,
  };
  const dialog = projectInstallDialog({
    draft: selectedDraft,
    installDialogOpen: options.installDialogOpen,
    selectedPackage,
    state: options.state,
  });

  return {
    ...(workspace.authorizationRuntime === undefined
      ? {}
      : { authorization: workspace.authorizationRuntime }),
    dialog,
    manifest: readyManifest(),
    selectedDraft,
    selectedPackageAppKey: selectedPackage.packageAppKey,
  };
}

export function selectInstanceManagementPackage(
  packages: readonly InstallableAppPackage[],
  requestedPackageAppKey?: PackageAppKey,
  failedPackageAppKey?: PackageAppKey,
): InstallableAppPackage | undefined {
  const selectedKey =
    failedPackageAppKey &&
    packages.some(({ packageAppKey }) => packageAppKey === failedPackageAppKey)
      ? failedPackageAppKey
      : requestedPackageAppKey;

  return packages.find(({ packageAppKey }) => packageAppKey === selectedKey) ?? packages[0];
}

export function resolveInstanceManagementIntent(
  projection: InstanceManagementProjection,
  intent: ManagementIntent,
): ResolvedInstanceManagementIntent {
  if (intent.managementId !== projection.manifest.id || projection.manifest.state !== "ready") {
    return { kind: "ignored" };
  }

  const dialog = projection.dialog;
  if (!dialog) {
    return { kind: "ignored" };
  }

  switch (intent.type) {
    case "managementInstallDialogOpenChange":
      return intent.dialogId === dialog.id
        ? { kind: "installDialogOpenChange", open: intent.open }
        : { kind: "ignored" };
    case "managementInstallPackageSelection": {
      const option = dialog.packageOptions.find(
        (candidate) =>
          candidate.id === intent.optionId &&
          candidate.selectionIntent.fieldId === intent.fieldId &&
          intent.dialogId === dialog.id,
      );
      return option
        ? { kind: "installPackageSelection", packageAppKey: option.packageAppKey as PackageAppKey }
        : { kind: "ignored" };
    }
    case "managementInstallField": {
      if (intent.dialogId !== dialog.id || intent.intent.type !== "createDraftChange") {
        return { kind: "ignored" };
      }
      const fieldIntent = intent.intent;
      const field = Object.values(dialog.fields).find(
        (candidate) =>
          candidate.fieldId === intent.fieldId && candidate.fieldName === fieldIntent.fieldName,
      );
      const packageAppKey = projection.selectedPackageAppKey;
      const draft = projection.selectedDraft;
      if (!field || !packageAppKey || !draft || field.fieldName === "packageAppKey") {
        return { kind: "ignored" };
      }
      const value = fieldIntent.fieldValue.value;
      if (typeof value !== "string") {
        return { kind: "ignored" };
      }
      return {
        draft: { ...draft, [field.fieldName]: value },
        kind: "installDraftChange",
        packageAppKey,
      };
    }
    case "managementInstallSubmit":
      return intent.dialogId === dialog.id &&
        intent.controlId === dialog.submit.id &&
        dialog.submit.disabled !== true &&
        projection.selectedPackageAppKey
        ? { kind: "installSubmit", packageAppKey: projection.selectedPackageAppKey }
        : { kind: "ignored" };
    case "managementWorkspaceOperation": {
      const operation = projection.manifest.workspaceOperation;
      return operation &&
        intent.operationId === operation.id &&
        intent.controlId === operation.control.id &&
        intent.intent.type === "operationInvoke" &&
        intent.intent.controlId === operation.control.trigger.id &&
        operation.control.trigger.disabled !== true
        ? { kind: "workspacePush" }
        : { kind: "ignored" };
    }
    case "managementAuthorizationOpen": {
      const operation = projection.manifest.workspaceOperation;
      const prompt = operation?.authorizationPrompt;
      return prompt &&
        projection.authorization &&
        intent.operationId === operation?.id &&
        intent.promptId === prompt.id &&
        intent.controlId === prompt.action.id
        ? { authorization: projection.authorization, kind: "authorizationOpen" }
        : { kind: "ignored" };
    }
  }
}

export async function dispatchInstanceManagementIntent(
  projection: InstanceManagementProjection,
  intent: ManagementIntent,
  actions: InstanceManagementIntentActions,
): Promise<void> {
  const resolved = resolveInstanceManagementIntent(projection, intent);

  switch (resolved.kind) {
    case "ignored":
      return;
    case "installDialogOpenChange":
      actions.changeInstallDialogOpen(resolved.open);
      return;
    case "installPackageSelection":
      actions.selectInstallPackage(resolved.packageAppKey);
      return;
    case "installDraftChange":
      actions.changeInstallDraft(resolved.packageAppKey, resolved.draft);
      return;
    case "installSubmit":
      await actions.submitInstall(resolved.packageAppKey);
      return;
    case "workspacePush":
      await actions.startWorkspacePush();
      return;
    case "authorizationOpen":
      actions.openAuthorization(resolved.authorization.url);
      await actions.pollWorkspaceOperation(
        resolved.authorization.operationId,
        resolved.authorization.operationKind,
      );
  }
}

export function workspacePushOperationExecutionState({
  error,
  operation,
}: {
  error?: string;
  operation?: WorkspaceGatewayOperation;
}): GeneratedOperationExecutionState {
  if (!operation && !error) {
    return { executionKey: INSTANCE_MANAGEMENT_PUSH_OPERATION_ID, status: "idle" };
  }

  const progress = operation ? workspaceGatewayOperationGeneratedProgress(operation) : undefined;
  const startedAt = workspaceOperationTimestamp(operation?.createdAt);
  const completedAt = workspaceOperationTimestamp(operation?.updatedAt);
  const base = {
    executionKey: INSTANCE_MANAGEMENT_PUSH_OPERATION_ID,
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(progress === undefined
      ? {}
      : {
          progress: {
            ...progress,
            ...(progress.detail === undefined ? {} : { detail: displaySafeText(progress.detail) }),
            steps: progress.steps.map((step) => ({
              ...step,
              ...(step.detail === undefined ? {} : { detail: displaySafeText(step.detail) }),
              label: displaySafeText(step.label),
            })),
            title: displaySafeText(progress.title),
          },
        }),
  };

  if (error) {
    return {
      ...base,
      status: "failed",
      result: { displayError: displaySafeText(error), type: "failed" },
      ...(completedAt === undefined ? {} : { completedAt }),
    };
  }

  if (!operation) {
    return { ...base, status: "idle" };
  }

  if (operation.status === "queued" || operation.status === "running") {
    return { ...base, status: "pending" };
  }

  const result = normalizeGeneratedOperationRuntimeAdapterResponse(
    workspaceGatewayOperationGeneratedRuntimeAdapterResponse(operation),
  );
  const displaySafeResult =
    result.type === "failed"
      ? { ...result, displayError: displaySafeText(result.displayError) }
      : {
          ...result,
          ...(result.displayMessage === undefined
            ? {}
            : { displayMessage: displaySafeText(result.displayMessage) }),
          output: undefined,
        };

  return {
    ...base,
    status: displaySafeResult.type,
    result: displaySafeResult,
    ...(completedAt === undefined ? {} : { completedAt }),
  };
}

function projectInstallDialog({
  draft,
  installDialogOpen,
  selectedPackage,
  state,
}: {
  draft: PackageInstallDraft;
  installDialogOpen: boolean;
  selectedPackage: InstallableAppPackage;
  state: Extract<InstanceShellRouteState, { status: "ready" }>;
}): ManagementInstallDialogContract {
  const pending = state.installing;
  const selectedInstalling =
    pending && state.installingPackageAppKey === selectedPackage.packageAppKey;
  const validation = validateInstallDraft(draft, state);
  const installError =
    state.installErrorPackageAppKey === selectedPackage.packageAppKey
      ? state.installError
      : undefined;
  const packageField = createInstallField({
    fieldName: "packageAppKey",
    label: "App type",
    pending,
    value: selectedPackage.packageAppKey,
  });
  const labelField = createInstallField({
    error: validation.label,
    fieldName: "label",
    label: "Label",
    pending,
    value: draft.label,
  });
  const installIdField = createInstallField({
    error: validation.installId,
    fieldName: "installId",
    label: "Install id",
    pending,
    value: draft.installId,
  });
  const submit = button(
    "instance-management:install-submit",
    selectedInstalling ? "Installing..." : `Install ${selectedPackage.label}`,
    "primary",
    "submit",
    pending || validation.errors.length > 0,
  );

  return {
    cancel: button("instance-management:install-cancel", "Cancel", "secondary", "button", pending),
    closeIntent: {
      dialogId: INSTANCE_MANAGEMENT_INSTALL_DIALOG_ID,
      managementId: INSTANCE_MANAGEMENT_ID,
      open: false,
      type: "managementInstallDialogOpenChange",
    },
    description: "Choose an app type, then set its instance label and install id.",
    errors: validation.errors,
    ...(installError === undefined
      ? {}
      : {
          feedback: managementFeedback(
            `install:${selectedPackage.packageAppKey}`,
            `${selectedPackage.label} install failed`,
            installError,
            "danger",
          ),
        }),
    fields: { installId: installIdField, label: labelField, package: packageField },
    id: INSTANCE_MANAGEMENT_INSTALL_DIALOG_ID,
    kind: "managementInstallDialog",
    managementId: INSTANCE_MANAGEMENT_ID,
    open: installDialogOpen,
    packageOptions: state.packages.map((appPackage) => {
      const id = `instance-management:package:${appPackage.packageAppKey}`;
      return {
        description: appPackage.description,
        id,
        kind: "managementPackageOption" as const,
        label: appPackage.label,
        packageAppKey: appPackage.packageAppKey,
        selected: appPackage.packageAppKey === selectedPackage.packageAppKey,
        selectionIntent: {
          dialogId: INSTANCE_MANAGEMENT_INSTALL_DIALOG_ID,
          fieldId: packageField.fieldId,
          managementId: INSTANCE_MANAGEMENT_ID,
          optionId: id,
          type: "managementInstallPackageSelection" as const,
        },
      };
    }),
    ...(pending ? { pending: { isPending: true, label: "Installing app" } } : {}),
    selectedPackageOptionId: `instance-management:package:${selectedPackage.packageAppKey}`,
    submit,
    submitIntent: {
      controlId: submit.id,
      dialogId: INSTANCE_MANAGEMENT_INSTALL_DIALOG_ID,
      managementId: INSTANCE_MANAGEMENT_ID,
      type: "managementInstallSubmit",
    },
    title: "Install app",
  };
}

function validateInstallDraft(
  draft: PackageInstallDraft,
  state: Extract<InstanceShellRouteState, { status: "ready" }>,
): { errors: string[]; installId?: string; label?: string } {
  const installIdResult = validateAppInstallId(draft.installId);
  const duplicate = state.installs.some(({ installId }) => installId === draft.installId.trim());
  const installId = !installIdResult.ok
    ? installIdResult.error.message
    : duplicate
      ? `Install id "${draft.installId.trim()}" is already installed.`
      : undefined;
  const label = draft.label.trim() === "" ? "Install label is required." : undefined;
  return {
    errors: [label, installId].filter((message): message is string => message !== undefined),
    ...(installId === undefined ? {} : { installId }),
    ...(label === undefined ? {} : { label }),
  };
}

function createInstallField({
  error,
  fieldName,
  label,
  pending,
  value,
}: {
  error?: string;
  fieldName: "installId" | "label" | "packageAppKey";
  label: string;
  pending: boolean;
  value: string;
}): CreateFieldContract {
  const field = { label, required: true, type: "text" as const };
  return {
    access: { canPatch: true, kind: "editable", writable: true },
    commit: "submit",
    control: {
      control: { inputType: "text", kind: "input" },
      controlKind: "text",
      createDefaultChecked: false,
      createDefaultValue: undefined,
      editor: "text",
      field,
      inputAttributes: {},
      kind: "text",
      label,
      required: true,
    },
    density: "default",
    draftInput: { kind: "input", value },
    editor: "text",
    ...(error === undefined ? {} : { errors: [{ fieldName, message: error }] }),
    field,
    fieldId: `field:standalone:${INSTANCE_MANAGEMENT_INSTALL_DIALOG_ID}:${fieldName}`,
    fieldName,
    label,
    labelVisibility: "visible",
    mode: "editor",
    ...(pending ? { pending: { isPending: true, label: "Installing app" } } : {}),
    required: true,
    surface: "create",
    value,
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
        state.message,
        "danger",
      ),
    };
  }

  if (state.status !== "ready") {
    return {};
  }

  const metadata = workspaceBrowserOperationControlMetadata().find(({ kind }) => kind === "push");
  if (!metadata) {
    return {};
  }
  const operation = managementPushOperation(state);
  const executionState = workspacePushOperationExecutionState({
    error: state.error,
    operation,
  });
  const disabledReason = state.csrfToken ? undefined : "Workspace authorization is unavailable.";
  const binding = projectWorkspaceOperationControlBinding(
    {
      bootstrapAllowed: metadata.bootstrapAllowed,
      ...(disabledReason === undefined ? {} : { disabledReason }),
      inputFields: metadata.inputFields,
      key: metadata.kind,
      kind: metadata.kind,
      label: metadata.label,
      mode: metadata.mode,
      requiredCapability: metadata.requiredCapability,
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
  const authorizationRuntime = selectAuthorizationRuntime(operation);
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
            operationId: operation?.id ?? "",
            operationKind: "push" as const,
            promptId: authorizationRuntime.promptId,
            url: authorizationRuntime.url,
          },
        }),
    operation: {
      control,
      id: INSTANCE_MANAGEMENT_PUSH_OPERATION_ID,
      kind: "managementWorkspaceOperation" as const,
    },
  };
}

function selectAuthorizationRuntime(operation: WorkspaceGatewayOperation | undefined) {
  const event = operation?.events
    .map((candidate) => {
      const url = displaySafeAuthorizationUrl(candidate.url, candidate.provider);
      return url === "" ? undefined : { event: candidate, url };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined)
    .at(-1);

  if (!event) {
    return undefined;
  }

  const provider = event.event.provider === "cloudflare" ? "Cloudflare" : "Alchemy";
  return {
    detail: `${displaySafeText(event.event.profileLabel)} requires external authorization.`,
    promptId: `instance-management:workspace:push:authorization:${event.event.id}`,
    title: `${provider} authorization`,
    url: event.url,
  };
}

function managementPushOperation(
  state: Extract<WorkspaceGatewayRouteState, { status: "ready" }>,
): WorkspaceGatewayOperation | undefined {
  return state.currentOperation?.operation === "push" ? state.currentOperation : undefined;
}

function managementFeedback(
  id: string,
  title: string,
  detail: string,
  intent: "danger" | "info" | "neutral" | "success" | "warning",
) {
  return {
    detail: displaySafeText(detail),
    id: `instance-management:feedback:${id}`,
    intent,
    kind: "managementFeedback" as const,
    title,
  };
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
