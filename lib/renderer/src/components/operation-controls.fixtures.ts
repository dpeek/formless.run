import type {
  ButtonContent,
  CompactStatusContract,
  OperationButtonContract,
  OperationControlContract,
  OperationDestructiveConfirmationContract,
  OperationFeedbackEventContract,
  OperationProgressContract,
  OperationProgressStepStatus,
} from "@dpeek/formless-presentation/contract";

export type OperationControlFixtureTransition = {
  delayMs: number;
  snapshot: OperationControlContract;
};

export type OperationControlFixtureSnapshots = {
  initial: OperationControlContract;
  pending: OperationControlContract;
  settled: OperationControlContract;
  timeline?: readonly OperationControlFixtureTransition[];
};

const clearCompletedProgress = {
  detail: "Refreshing the Tasks collection.",
  id: "tasks-clear-completed-progress",
  kind: "operationProgress",
  steps: [
    {
      id: "find-completed",
      label: "Find completed tasks",
      status: "succeeded",
    },
    {
      detail: "Removing two matching records.",
      id: "clear-records",
      label: "Clear matching records",
      status: "running",
    },
    {
      id: "refresh-collection",
      label: "Refresh task list",
      status: "pending",
    },
  ],
  title: "Clearing completed tasks",
  updatedAt: 1,
} satisfies OperationProgressContract;

const clearCompletedPendingFeedback = pendingFeedback({
  activeProgress: {
    detail: "Removing two matching records.",
    label: "Clear matching records",
    stepId: "clear-records",
  },
  id: "tasks-clear-completed-pending",
  progress: clearCompletedProgress,
  title: "Clearing completed tasks",
});

const clearCompletedCommittedFeedback = {
  detail: "2 records updated.",
  id: "tasks-clear-completed-committed",
  intent: "success",
  kind: "operationFeedbackEvent",
  status: "committed",
  title: "Completed tasks cleared",
} satisfies OperationFeedbackEventContract;

const clearCompletedPendingStatus = compactStatus({
  detail: "Clear matching records",
  id: "tasks-clear-completed-status",
  intent: "info",
  label: "Clearing completed tasks",
  status: "pending",
});

const clearCompletedCommittedStatus = compactStatus({
  detail: "2 records updated.",
  id: "tasks-clear-completed-status",
  intent: "success",
  label: "Completed tasks cleared",
  status: "committed",
});

const clearCompletedToolbarBase = operationControl({
  countBadge: {
    accessibilityLabel: "2 completed tasks",
    count: 2,
    id: "tasks-clear-completed-count",
    kind: "countBadge",
  },
  id: "tasks-clear-completed-toolbar",
  label: "Clear completed",
  icon: "archive",
  prominence: "secondary",
  status: clearCompletedCommittedStatus,
});

const clearCompletedSummaryBase = operationControl({
  content: { icon: "archive", kind: "iconOnly" },
  density: "compact",
  id: "tasks-clear-completed-summary",
  label: "Clear completed tasks",
  prominence: "quiet",
  status: clearCompletedCommittedStatus,
});

const clearCompletedToolbar = snapshots({
  initial: operationSnapshot(clearCompletedToolbarBase, {
    feedback: clearCompletedCommittedFeedback,
    status: clearCompletedCommittedStatus,
  }),
  pending: operationSnapshot(clearCompletedToolbarBase, {
    feedback: clearCompletedPendingFeedback,
    progress: clearCompletedProgress,
    status: clearCompletedPendingStatus,
  }),
  settled: operationSnapshot(clearCompletedToolbarBase, {
    feedback: clearCompletedCommittedFeedback,
    status: clearCompletedCommittedStatus,
  }),
});

const clearCompletedSummary = snapshots({
  initial: operationSnapshot(clearCompletedSummaryBase, {
    feedback: clearCompletedCommittedFeedback,
    status: clearCompletedCommittedStatus,
  }),
  pending: operationSnapshot(clearCompletedSummaryBase, {
    feedback: clearCompletedPendingFeedback,
    progress: clearCompletedProgress,
    status: clearCompletedPendingStatus,
  }),
  settled: operationSnapshot(clearCompletedSummaryBase, {
    feedback: clearCompletedCommittedFeedback,
    status: clearCompletedCommittedStatus,
  }),
});

const refreshTasksBase = operationControl({
  id: "tasks-refresh",
  label: "Refresh tasks",
  icon: "sync",
  prominence: "primary",
  status: compactStatus({
    detail: "No duplicate changes made.",
    id: "tasks-refresh-status",
    intent: "neutral",
    label: "Tasks already up to date",
    status: "replayed",
  }),
});

const refreshTasks = snapshots({
  initial: operationSnapshot(refreshTasksBase, {
    feedback: {
      detail: "No duplicate changes made.",
      id: "tasks-refresh-replayed",
      intent: "neutral",
      kind: "operationFeedbackEvent",
      status: "replayed",
      title: "Tasks already up to date",
    },
    status: refreshTasksBase.status,
  }),
  pending: operationSnapshot(refreshTasksBase, {
    feedback: pendingFeedback({
      id: "tasks-refresh-pending",
      title: "Refreshing tasks",
    }),
    status: compactStatus({
      detail: "Checking for collection changes.",
      id: "tasks-refresh-status",
      intent: "info",
      label: "Refreshing tasks",
      status: "pending",
    }),
  }),
  settled: operationSnapshot(refreshTasksBase, {
    feedback: {
      detail: "No duplicate changes made.",
      id: "tasks-refresh-replayed",
      intent: "neutral",
      kind: "operationFeedbackEvent",
      status: "replayed",
      title: "Tasks already up to date",
    },
    status: refreshTasksBase.status,
  }),
});

const archiveOverdueBase = operationControl({
  id: "tasks-archive-overdue",
  label: "Archive overdue",
  icon: "archive",
  prominence: "secondary",
  status: compactStatus({
    detail: "The archive policy rejected this command.",
    id: "tasks-archive-overdue-status",
    intent: "danger",
    label: "Overdue tasks not archived",
    status: "failed",
  }),
});

const archiveOverdue = snapshots({
  initial: operationSnapshot(archiveOverdueBase, {
    feedback: {
      detail: "The archive policy rejected this command.",
      id: "tasks-archive-overdue-failed",
      intent: "danger",
      kind: "operationFeedbackEvent",
      status: "failed",
      title: "Overdue tasks not archived",
    },
    status: archiveOverdueBase.status,
  }),
  pending: operationSnapshot(archiveOverdueBase, {
    feedback: pendingFeedback({
      id: "tasks-archive-overdue-pending",
      title: "Archiving overdue tasks",
    }),
    status: compactStatus({
      detail: "Checking archive policy.",
      id: "tasks-archive-overdue-status",
      intent: "info",
      label: "Archiving overdue tasks",
      status: "pending",
    }),
  }),
  settled: operationSnapshot(archiveOverdueBase, {
    feedback: {
      detail: "The archive policy rejected this command.",
      id: "tasks-archive-overdue-failed",
      intent: "danger",
      kind: "operationFeedbackEvent",
      status: "failed",
      title: "Overdue tasks not archived",
    },
    status: archiveOverdueBase.status,
  }),
});

const workspacePushSuccess = createWorkspacePushOperationControlFixture({
  id: "workspace-source-push-success",
  outcome: "success",
});

const workspacePushFailure = createWorkspacePushOperationControlFixture({
  id: "workspace-source-push-failure",
  outcome: "failure",
});

const transferOwnerUnavailable = operationControl({
  disabledReason: "Requires owner role.",
  id: "task-transfer-owner",
  label: "Transfer owner",
  icon: "edit",
  prominence: "secondary",
  status: compactStatus({
    detail: "Requires owner role.",
    id: "task-transfer-owner-status",
    intent: "warning",
    label: "Transfer owner unavailable",
    status: "idle",
  }),
});

const transferOwner = snapshots({
  initial: transferOwnerUnavailable,
  pending: transferOwnerUnavailable,
  settled: transferOwnerUnavailable,
});

const deleteTaskBase = operationControl({
  confirmation: destructiveConfirmation({
    controlId: "task-delete",
    description: "Prepare launch checklist will be removed from this workspace.",
    title: "Delete task?",
  }),
  id: "task-delete",
  label: "Delete task",
  icon: "delete",
  prominence: "destructive",
  status: compactStatus({
    detail: "Prepare launch checklist",
    id: "task-delete-status",
    intent: "neutral",
    label: "Task available",
    status: "idle",
  }),
});

const deleteTask = snapshots({
  initial: deleteTaskBase,
  pending: operationSnapshot(deleteTaskBase, {
    confirmationOpen: true,
    feedback: pendingFeedback({
      id: "task-delete-pending",
      title: "Deleting task",
    }),
    status: compactStatus({
      detail: "Removing Prepare launch checklist.",
      id: "task-delete-status",
      intent: "info",
      label: "Deleting task",
      status: "pending",
    }),
  }),
  settled: operationSnapshot(deleteTaskBase, {
    confirmationOpen: false,
    feedback: {
      detail: "1 record deleted.",
      id: "task-delete-committed",
      intent: "success",
      kind: "operationFeedbackEvent",
      status: "committed",
      title: "Task deleted",
    },
    status: compactStatus({
      detail: "1 record deleted.",
      id: "task-delete-status",
      intent: "success",
      label: "Task deleted",
      status: "committed",
    }),
  }),
});

export const operationControlFixtures = {
  archiveOverdue,
  clearCompletedSummary,
  clearCompletedToolbar,
  deleteTask,
  refreshTasks,
  transferOwner,
  workspacePushFailure,
  workspacePushSuccess,
} satisfies Record<string, OperationControlFixtureSnapshots>;

export type OperationControlFixtureKey = keyof typeof operationControlFixtures;

export function createWorkspacePushOperationControlFixture({
  id,
  outcome,
}: {
  id: string;
  outcome: "failure" | "success";
}): OperationControlFixtureSnapshots {
  const base = operationControl({
    id,
    label: "Push workspace",
    icon: "sync",
    prominence: "primary",
    status: compactStatus({
      detail: "Ready",
      id: `${id}-status`,
      intent: "neutral",
      label: "Workspace ready to push",
      status: "idle",
    }),
  });
  const planProgress = workspacePushProgress({
    id,
    statuses: ["running", "pending", "pending"],
    updatedAt: 1,
  });
  const providerProgress = workspacePushProgress({
    id,
    statuses: ["succeeded", "running", "pending"],
    updatedAt: 2,
  });
  const healthProgress = workspacePushProgress({
    id,
    statuses: ["succeeded", "succeeded", "running"],
    updatedAt: 3,
  });
  const finalProgress = workspacePushProgress({
    id,
    statuses: ["succeeded", "succeeded", outcome === "success" ? "succeeded" : "failed"],
    updatedAt: 4,
  });
  const settledStatus = outcome === "success" ? "committed" : "failed";
  const settledTitle = outcome === "success" ? "Workspace push applied" : "Workspace push failed";
  const settled = operationSnapshot(base, {
    feedback: {
      detail: outcome === "success" ? "Health check completed." : "Health check failed.",
      id: `${id}-${settledStatus}`,
      intent: outcome === "success" ? "success" : "danger",
      kind: "operationFeedbackEvent",
      status: settledStatus,
      title: settledTitle,
    },
    progress: finalProgress,
    status: compactStatus({
      detail: outcome === "success" ? "Health check completed." : "Health check failed.",
      id: `${id}-status`,
      intent: outcome === "success" ? "success" : "danger",
      label: settledTitle,
      status: settledStatus,
    }),
  });

  return snapshots({
    initial: base,
    pending: workspacePushPendingSnapshot({ base, id, progress: planProgress, runningStep: 0 }),
    settled,
    timeline: [
      {
        delayMs: 1000,
        snapshot: workspacePushPendingSnapshot({
          base,
          id,
          progress: providerProgress,
          runningStep: 1,
        }),
      },
      {
        delayMs: 1000,
        snapshot: workspacePushPendingSnapshot({
          base,
          id,
          progress: healthProgress,
          runningStep: 2,
        }),
      },
      { delayMs: 1000, snapshot: settled },
    ],
  });
}

function workspacePushPendingSnapshot({
  base,
  id,
  progress,
  runningStep,
}: {
  base: OperationControlContract;
  id: string;
  progress: OperationProgressContract;
  runningStep: number;
}): OperationControlContract {
  const activeStep = progress.steps[runningStep];

  if (activeStep === undefined) {
    return base;
  }

  return operationSnapshot(base, {
    feedback: pendingFeedback({
      activeProgress: {
        ...(activeStep.detail === undefined ? {} : { detail: activeStep.detail }),
        label: activeStep.label,
        stepId: activeStep.id,
      },
      id: `${id}-pending`,
      progress,
      title: "Pushing workspace",
    }),
    progress,
    status: compactStatus({
      detail: activeStep.label,
      id: `${id}-status`,
      intent: "info",
      label: "Pushing workspace",
      status: "pending",
    }),
  });
}

function workspacePushProgress({
  id,
  statuses,
  updatedAt,
}: {
  id: string;
  statuses: readonly [
    OperationProgressStepStatus,
    OperationProgressStepStatus,
    OperationProgressStepStatus,
  ];
  updatedAt: number;
}): OperationProgressContract {
  return {
    detail: "Updating deployment intent.",
    id: `${id}-progress`,
    kind: "operationProgress",
    steps: [
      {
        id: "sync-plan",
        label: "Plan workspace source",
        status: statuses[0],
      },
      {
        detail: "Updating deployment intent.",
        id: "provider",
        label: "Provider reconciliation",
        status: statuses[1],
      },
      {
        id: "health",
        label: "Health check",
        status: statuses[2],
      },
    ],
    title: "Pushing workspace",
    updatedAt,
  };
}

function operationControl({
  confirmation,
  content,
  countBadge,
  density = "default",
  disabledReason,
  icon,
  id,
  label,
  prominence,
  status,
}: {
  confirmation?: OperationDestructiveConfirmationContract;
  content?: ButtonContent;
  countBadge?: OperationButtonContract["countBadge"];
  density?: OperationButtonContract["density"];
  disabledReason?: string;
  icon?: Extract<
    ButtonContent,
    {
      icon: unknown;
    }
  >["icon"];
  id: string;
  label: string;
  prominence: OperationButtonContract["prominence"];
  status: CompactStatusContract;
}): OperationControlContract {
  const triggerContent =
    content ?? (icon ? { icon, kind: "iconAndLabel", label } : { kind: "label", label });
  const triggerIntent = confirmation
    ? {
        controlId: id,
        open: true,
        type: "operationConfirmationOpenChange" as const,
      }
    : {
        controlId: id,
        invocationSource: "button" as const,
        type: "operationInvoke" as const,
      };

  return {
    ...(confirmation ? { confirmation } : {}),
    id,
    kind: "operationControl",
    status,
    trigger: {
      accessibilityLabel: label,
      content: triggerContent,
      ...(countBadge ? { countBadge } : {}),
      density,
      ...(disabledReason ? { disabled: true, disabledReason } : {}),
      id: `${id}-trigger`,
      intent: triggerIntent,
      kind: "button",
      prominence,
      type: "button",
    },
  };
}

function operationSnapshot(
  control: OperationControlContract,
  {
    confirmationOpen,
    feedback,
    progress,
    status,
  }: {
    confirmationOpen?: boolean;
    feedback?: OperationFeedbackEventContract;
    progress?: OperationProgressContract;
    status: CompactStatusContract;
  },
): OperationControlContract {
  const isPending = status.status === "pending";
  const pending = isPending ? { isPending: true, label: status.label } : undefined;
  const confirmation = control.confirmation
    ? {
        ...control.confirmation,
        action: {
          ...control.confirmation.action,
          ...(pending ? { pending } : {}),
        },
        cancel: {
          ...control.confirmation.cancel,
        },
        open: confirmationOpen ?? control.confirmation.open,
      }
    : undefined;

  return {
    ...control,
    ...(confirmation ? { confirmation } : {}),
    ...(feedback ? { feedback } : {}),
    ...(progress ? { progress } : {}),
    status,
    trigger: {
      ...control.trigger,
      ...(pending ? { pending } : {}),
    },
  };
}

function compactStatus({
  detail,
  id,
  intent,
  label,
  status,
}: Omit<CompactStatusContract, "accessibilityLabel" | "kind" | "pending">): CompactStatusContract {
  return {
    accessibilityLabel: `${label}. ${detail}`,
    detail,
    id,
    intent,
    kind: "compactStatus",
    label,
    ...(status === "pending" ? { pending: { isPending: true, label } } : {}),
    status,
  };
}

function pendingFeedback({
  activeProgress,
  id,
  progress,
  title,
}: Pick<
  OperationFeedbackEventContract,
  "activeProgress" | "id" | "progress" | "title"
>): OperationFeedbackEventContract {
  return {
    ...(activeProgress ? { activeProgress } : {}),
    id,
    intent: "info",
    kind: "operationFeedbackEvent",
    ...(progress ? { progress } : {}),
    status: "pending",
    title,
  };
}

function destructiveConfirmation({
  controlId,
  description,
  title,
}: {
  controlId: string;
  description: string;
  title: string;
}): OperationDestructiveConfirmationContract {
  return {
    action: confirmationButton({
      controlId,
      label: "Delete task",
      prominence: "destructive",
      source: "confirmationDialog",
    }),
    cancel: confirmationButton({
      controlId,
      label: "Cancel",
      prominence: "secondary",
      source: "button",
    }),
    closeIntent: {
      controlId,
      open: false,
      type: "operationConfirmationOpenChange",
    },
    description,
    id: `${controlId}-confirmation`,
    kind: "destructiveConfirmation",
    open: false,
    title,
  };
}

function confirmationButton({
  controlId,
  label,
  prominence,
  source,
}: {
  controlId: string;
  label: string;
  prominence: OperationButtonContract["prominence"];
  source: "button" | "confirmationDialog";
}): OperationButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    id: `${controlId}-${source}`,
    intent:
      source === "confirmationDialog"
        ? {
            controlId,
            invocationSource: source,
            type: "operationInvoke",
          }
        : {
            controlId,
            open: false,
            type: "operationConfirmationOpenChange",
          },
    kind: "button",
    prominence,
    type: "button",
  };
}

function snapshots(value: OperationControlFixtureSnapshots): OperationControlFixtureSnapshots {
  return value;
}
