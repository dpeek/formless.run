import type { AppSchema } from "@dpeek/formless-schema";
import type {
  ButtonContent,
  CompactStatusContract,
  CompactStatusIntent,
  OperationButtonContract,
  OperationControlContract,
  OperationCommandDialogContract,
  OperationExecutionStatus,
  OperationFeedbackEventContract,
  OperationPresentationIntent,
  OperationProgressContract,
  OperationProgressStepContract,
} from "@dpeek/formless-presentation/contract";
import type {
  GeneratedCommandDraftSessionState,
  GeneratedOperationControlBinding,
  GeneratedOperationExecutionState,
  GeneratedOperationProgressStep,
} from "../../client/views.ts";
import {
  generatedCommandInputForm,
  initialGeneratedCommandDraftSessionState,
  selectGeneratedCommandDraftSession,
} from "../../client/views.ts";
import { projectGeneratedCommandFields } from "./field-projection.ts";

type ProjectedFeedbackStatus = Exclude<OperationExecutionStatus, "idle">;

export type GeneratedOperationButtonPresentation = {
  accessibilityLabel: string;
  content: ButtonContent;
  density: OperationButtonContract["density"];
  disabledReason?: string;
  invocationSource?: "button" | "menuItem";
  pendingLabel?: string;
  prominence: OperationButtonContract["prominence"];
};

export type GeneratedOperationTargetCount = {
  accessibilityLabel: string;
  count: number;
};

export type GeneratedOperationStatusPresentation = {
  id: string;
  label: string;
  progressLabel?: string;
};

export type GeneratedOperationFeedbackCopy = Partial<
  Record<
    ProjectedFeedbackStatus,
    {
      detail?: string;
      title: string;
    }
  >
>;

export type ProjectGeneratedOperationControlOptions = {
  binding: GeneratedOperationControlBinding;
  confirmationOpen?: boolean;
  feedbackCopy?: GeneratedOperationFeedbackCopy;
  presentation: GeneratedOperationButtonPresentation;
  state: GeneratedOperationExecutionState;
  targetCount?: GeneratedOperationTargetCount;
  commandDialogOpen?: boolean;
  commandState?: GeneratedCommandDraftSessionState;
  schema?: AppSchema | null;
};

export function projectGeneratedOperationControl({
  binding,
  commandDialogOpen = false,
  commandState,
  confirmationOpen = false,
  feedbackCopy,
  presentation,
  state,
  schema,
  targetCount,
}: ProjectGeneratedOperationControlOptions): OperationControlContract {
  const pending = state.status === "pending";
  const disabledReason =
    binding.availability.state === "disabled"
      ? binding.availability.reason
      : (presentation.disabledReason ??
        (pending ? (presentation.pendingLabel ?? `${binding.label} is running.`) : undefined));
  const progress = projectGeneratedOperationProgress(state);
  const status = projectGeneratedOperationCompactStatus(binding, state);
  const feedback = projectGeneratedOperationFeedback(binding, state, {
    copy: feedbackCopy,
    progress,
  });
  const commandDialog = projectGeneratedOperationCommandDialog({
    binding,
    open: commandDialogOpen,
    pending,
    schema,
    state: commandState,
  });
  const triggerIntent: OperationPresentationIntent =
    commandDialog !== undefined
      ? {
          controlId: binding.id,
          open: true,
          type: "operationCommandDialogOpenChange" as const,
        }
      : binding.confirmation === undefined
        ? {
            controlId: binding.id,
            invocationSource: presentation.invocationSource ?? ("button" as const),
            type: "operationInvoke" as const,
          }
        : {
            controlId: binding.id,
            open: true,
            type: "operationConfirmationOpenChange" as const,
          };
  const trigger: OperationButtonContract = {
    accessibilityLabel: presentation.accessibilityLabel,
    content: presentation.content,
    density: presentation.density,
    disabled: disabledReason !== undefined,
    ...(disabledReason === undefined ? {} : { disabledReason }),
    id: binding.id,
    intent: triggerIntent,
    kind: "button",
    pending: pending
      ? { isPending: true, label: presentation.pendingLabel ?? `${binding.label} is running.` }
      : undefined,
    prominence: presentation.prominence,
    type: "button",
    ...(targetCount === undefined
      ? {}
      : {
          countBadge: {
            accessibilityLabel: targetCount.accessibilityLabel,
            count: targetCount.count,
            id: `${binding.id}:count`,
            kind: "countBadge" as const,
          },
        }),
  };

  return {
    ...(commandDialog === undefined ? {} : { commandDialog }),
    ...(binding.confirmation === undefined
      ? {}
      : {
          confirmation: {
            action: operationConfirmationButton({
              binding,
              content: { kind: "label", label: binding.confirmation.actionLabel },
              disabledReason,
              intent: {
                controlId: binding.id,
                invocationSource: "confirmationDialog",
                type: "operationInvoke",
              },
              label: binding.confirmation.actionLabel,
              pending,
              prominence: "destructive",
            }),
            cancel: operationConfirmationButton({
              binding,
              content: { kind: "label", label: "Cancel" },
              disabledReason: undefined,
              intent: {
                controlId: binding.id,
                open: false,
                type: "operationConfirmationOpenChange",
              },
              label: "Cancel",
              pending: false,
              prominence: "secondary",
            }),
            closeIntent: {
              controlId: binding.id,
              open: false,
              type: "operationConfirmationOpenChange",
            },
            description: binding.confirmation.description,
            id: `${binding.id}:confirmation`,
            kind: "destructiveConfirmation" as const,
            open: confirmationOpen,
            title: binding.confirmation.title,
          },
        }),
    ...(feedback === undefined ? {} : { feedback }),
    id: binding.id,
    kind: "operationControl",
    ...(progress === undefined ? {} : { progress }),
    status,
    trigger,
  };
}

export function projectGeneratedOperationCommandDialog(input: {
  binding: GeneratedOperationControlBinding;
  open: boolean;
  pending: boolean;
  schema?: AppSchema | null;
  state?: GeneratedCommandDraftSessionState;
}): OperationCommandDialogContract | undefined {
  const form = generatedCommandInputForm(input.binding);
  if (form === undefined) {
    return undefined;
  }
  const state = input.state ?? initialGeneratedCommandDraftSessionState(form);
  const session = selectGeneratedCommandDraftSession({
    enabled: !input.pending,
    form,
    state,
  });
  const closeIntent = {
    controlId: input.binding.id,
    open: false,
    type: "operationCommandDialogOpenChange" as const,
  };

  return {
    cancel: commandDialogButton({
      binding: input.binding,
      id: "cancel",
      intent: closeIntent,
      label: "Cancel",
      prominence: "secondary",
    }),
    closeIntent,
    errors: [],
    fieldSet: {
      disabled: input.pending,
      ...(input.pending ? { disabledReason: `${input.binding.label} is running.` } : {}),
      fields: projectGeneratedCommandFields({
        owner: { formId: `${input.binding.id}:form`, kind: "operationForm" },
        schema: input.schema,
        session,
        state,
      }),
      id: `${input.binding.id}:fields`,
      kind: "fieldSet",
      label: `${input.binding.label} fields`,
    },
    id: `${input.binding.id}:dialog`,
    kind: "operationCommandDialog",
    open: input.open,
    submit: commandDialogButton({
      binding: input.binding,
      disabledReason: session.canSubmit ? undefined : "Complete the required fields.",
      id: "submit",
      intent: { controlId: input.binding.id, type: "operationCommandSubmit" },
      label: input.binding.label,
      pending: input.pending,
      prominence: "primary",
      type: "submit",
    }),
    title: input.binding.label,
  };
}

function commandDialogButton(input: {
  binding: GeneratedOperationControlBinding;
  id: string;
  intent: OperationPresentationIntent;
  label: string;
  prominence: OperationButtonContract["prominence"];
  disabledReason?: string;
  pending?: boolean;
  type?: OperationButtonContract["type"];
}): OperationButtonContract {
  return {
    accessibilityLabel: input.label,
    content: { kind: "label", label: input.label },
    density: "default",
    disabled: input.disabledReason !== undefined,
    ...(input.disabledReason === undefined ? {} : { disabledReason: input.disabledReason }),
    id: `${input.binding.id}:${input.id}`,
    intent: input.intent,
    kind: "button",
    pending: input.pending ? { isPending: true, label: `${input.binding.label}...` } : undefined,
    prominence: input.prominence,
    type: input.type ?? "button",
  };
}

export function projectGeneratedOperationCompactStatus(
  binding: GeneratedOperationControlBinding,
  state: GeneratedOperationExecutionState,
): CompactStatusContract {
  const status = projectGeneratedOperationStateCompactStatus(
    {
      id: binding.id,
      label: binding.label,
      ...(binding.feedback?.progressLabel === undefined
        ? {}
        : { progressLabel: binding.feedback.progressLabel }),
    },
    state,
  );
  const affectedDetail =
    state.result?.type === "committed"
      ? affectedCountDetail(binding, state.result.affectedCount)
      : undefined;
  const displayMessage =
    state.result?.type === "committed" ? state.result.displayMessage : undefined;

  return affectedDetail === undefined || displayMessage !== undefined
    ? status
    : {
        ...status,
        accessibilityLabel: `${status.label}: ${affectedDetail}`,
        detail: affectedDetail,
      };
}

export function projectGeneratedOperationStateCompactStatus(
  presentation: GeneratedOperationStatusPresentation,
  state: GeneratedOperationExecutionState,
): CompactStatusContract {
  const text = generatedOperationCompactStatusText(presentation.label, state);

  return {
    accessibilityLabel: `${text.label}: ${text.detail}`,
    detail: text.detail,
    id: `${presentation.id}:status`,
    intent: generatedOperationStatusIntent(state.status),
    kind: "compactStatus",
    label: text.label,
    pending:
      state.status === "pending"
        ? {
            isPending: true,
            label: presentation.progressLabel ?? `${presentation.label} is running.`,
          }
        : undefined,
    status: state.status,
  };
}

export function projectGeneratedOperationProgress(
  state: GeneratedOperationExecutionState,
): OperationProgressContract | undefined {
  if (state.progress === undefined) {
    return undefined;
  }

  return projectGeneratedOperationProgressContract({
    id: `operation-progress:${opaqueExecutionIdentity(state.executionKey)}`,
    progress: state.progress,
  });
}

export function projectGeneratedOperationProgressContract({
  id,
  progress,
}: {
  id: string;
  progress: NonNullable<GeneratedOperationExecutionState["progress"]>;
}): OperationProgressContract {
  return {
    ...(progress.detail === undefined ? {} : { detail: progress.detail }),
    id,
    kind: "operationProgress",
    steps: progress.steps.map(projectGeneratedOperationProgressStep),
    title: progress.title,
    updatedAt: progress.updatedAt,
  };
}

export function projectGeneratedOperationFeedback(
  binding: GeneratedOperationControlBinding,
  state: GeneratedOperationExecutionState,
  options: {
    copy?: GeneratedOperationFeedbackCopy;
    progress?: OperationProgressContract;
  } = {},
): OperationFeedbackEventContract | undefined {
  if (state.status === "idle") {
    return undefined;
  }

  const progress = options.progress ?? projectGeneratedOperationProgress(state);
  const activeProgressStep = selectActiveGeneratedOperationProgressStep(state);
  const copy = options.copy?.[state.status] ?? generatedOperationFeedbackCopy(binding, state);
  const timestamp =
    state.status === "pending"
      ? (state.startedAt ?? 0)
      : (state.completedAt ?? state.startedAt ?? 0);

  return {
    ...(activeProgressStep === undefined
      ? {}
      : {
          activeProgress: {
            ...(activeProgressStep.detail === undefined
              ? {}
              : { detail: activeProgressStep.detail }),
            label: activeProgressStep.label,
            stepId: activeProgressStep.id,
          },
        }),
    ...(copy.detail === undefined ? {} : { detail: copy.detail }),
    id: `operation-feedback:${opaqueExecutionIdentity(state.executionKey)}:${state.status}:${timestamp}`,
    intent: generatedOperationStatusIntent(state.status),
    kind: "operationFeedbackEvent",
    ...(progress === undefined ? {} : { progress }),
    status: state.status,
    title: copy.title,
  };
}

function operationConfirmationButton({
  binding,
  content,
  disabledReason,
  intent,
  label,
  pending,
  prominence,
}: {
  binding: GeneratedOperationControlBinding;
  content: ButtonContent;
  disabledReason: string | undefined;
  intent: OperationButtonContract["intent"];
  label: string;
  pending: boolean;
  prominence: OperationButtonContract["prominence"];
}): OperationButtonContract {
  return {
    accessibilityLabel: label,
    content,
    density: "default",
    disabled: disabledReason !== undefined,
    ...(disabledReason === undefined ? {} : { disabledReason }),
    id: `${binding.id}:${prominence === "destructive" ? "confirm" : "cancel"}`,
    intent,
    kind: "button",
    pending: pending ? { isPending: true, label: `${binding.label} is running.` } : undefined,
    prominence,
    type: "button",
  };
}

function generatedOperationCompactStatusText(
  operationLabel: string,
  state: GeneratedOperationExecutionState,
): { detail: string; label: string } {
  if (state.status === "pending") {
    const progressStep = selectActiveGeneratedOperationProgressStep(state);

    return {
      label: state.progress?.title ?? `${operationLabel} running`,
      detail: progressStep?.label ?? state.progress?.detail ?? "Pending",
    };
  }

  if (state.result?.type === "failed") {
    return {
      label: `${operationLabel} failed`,
      detail: state.result.displayError,
    };
  }

  if (state.result?.type === "replayed") {
    return {
      label: `${operationLabel} replayed`,
      detail: state.result.displayMessage ?? "No changes applied.",
    };
  }

  if (state.result?.type === "committed") {
    return {
      label: `${operationLabel} synced`,
      detail: state.result.displayMessage ?? "Committed.",
    };
  }

  return {
    label: operationLabel,
    detail: "Ready",
  };
}

function generatedOperationFeedbackCopy(
  binding: GeneratedOperationControlBinding,
  state: Exclude<GeneratedOperationExecutionState, { status: "idle" }>,
): { detail?: string; title: string } {
  if (state.status === "pending") {
    return {
      ...(state.progress?.detail === undefined ? {} : { detail: state.progress.detail }),
      title:
        recordDeleteFeedbackTitle(binding, "pending") ??
        binding.feedback?.progressLabel ??
        `${binding.label}...`,
    };
  }

  if (state.result?.type === "failed") {
    return {
      detail: state.result.displayError,
      title: binding.feedback?.failureLabel ?? `${binding.label} failed.`,
    };
  }

  if (state.result?.type === "replayed") {
    return {
      title:
        state.result.displayMessage ??
        recordDeleteFeedbackTitle(binding, "replayed") ??
        binding.feedback?.replayLabel ??
        binding.feedback?.successLabel ??
        `${binding.label} replayed.`,
    };
  }

  return {
    ...(affectedCountDetail(binding, state.result?.affectedCount) === undefined
      ? {}
      : { detail: affectedCountDetail(binding, state.result?.affectedCount) }),
    title:
      state.result?.displayMessage ??
      recordDeleteFeedbackTitle(binding, "committed") ??
      binding.feedback?.successLabel ??
      `${binding.label} synced.`,
  };
}

function recordDeleteFeedbackTitle(
  binding: GeneratedOperationControlBinding,
  status: "committed" | "pending" | "replayed",
): string | undefined {
  if (binding.input.kind !== "recordDelete" || binding.input.recordLabel === undefined) {
    return undefined;
  }

  return status === "pending"
    ? `Deleting ${binding.input.recordLabel}...`
    : `Deleted ${binding.input.recordLabel}.`;
}

function affectedCountDetail(
  binding: GeneratedOperationControlBinding,
  affectedCount: number | undefined,
): string | undefined {
  return binding.input.kind === "collectionCommand" && binding.input.ui.showAffectedCountOnSuccess
    ? `${affectedCount ?? 0} affected.`
    : undefined;
}

function selectActiveGeneratedOperationProgressStep(
  state: GeneratedOperationExecutionState,
): GeneratedOperationProgressStep | undefined {
  const steps = state.progress?.steps;

  if (steps === undefined) {
    return undefined;
  }

  return (
    steps.find((step) => step.status === "running") ??
    steps.find((step) => step.status === "failed") ??
    steps.find((step) => step.status === "pending") ??
    steps.find((step) => step.status === "skipped") ??
    steps[steps.length - 1]
  );
}

function projectGeneratedOperationProgressStep(
  step: GeneratedOperationProgressStep,
): OperationProgressStepContract {
  return {
    ...(step.detail === undefined ? {} : { detail: step.detail }),
    id: step.id,
    label: step.label,
    status: step.status,
  };
}

function generatedOperationStatusIntent(status: OperationExecutionStatus): CompactStatusIntent {
  switch (status) {
    case "committed":
      return "success";
    case "failed":
      return "danger";
    case "pending":
      return "info";
    case "idle":
    case "replayed":
      return "neutral";
  }
}

function opaqueExecutionIdentity(executionKey: string): string {
  let hash = 2166136261;

  for (let index = 0; index < executionKey.length; index += 1) {
    hash ^= executionKey.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}
