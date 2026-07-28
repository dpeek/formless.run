import { describe, expect, it } from "vite-plus/test";
import type {
  GeneratedOperationControlBinding,
  GeneratedOperationExecutionState,
} from "../../client/views.ts";
import {
  projectGeneratedOperationControl,
  projectGeneratedOperationFeedback,
} from "./operation-projection.ts";

describe("generated operation projection", () => {
  it("projects explicit button presentation, shared pending state, target count, and progress", () => {
    const binding = collectionCommandBinding();
    const sharedBinding = {
      ...binding,
      id: "collection:task.clearCompletedTasks:secondary",
    } satisfies GeneratedOperationControlBinding;
    const state = pendingState();
    const control = projectGeneratedOperationControl({
      binding,
      presentation: {
        accessibilityLabel: "Clear completed tasks",
        content: { icon: "archive", kind: "iconAndLabel", label: "Clear completed" },
        density: "compact",
        pendingLabel: "Clearing completed tasks",
        prominence: "secondary",
      },
      state,
      targetCount: {
        accessibilityLabel: "Clear completed target count",
        count: 7,
      },
    });
    const sharedControl = projectGeneratedOperationControl({
      binding: sharedBinding,
      presentation: {
        accessibilityLabel: "Clear completed from menu",
        content: { kind: "label", label: "Clear completed" },
        density: "default",
        prominence: "quiet",
      },
      state,
    });

    expect(control.trigger).toEqual({
      accessibilityLabel: "Clear completed tasks",
      content: { icon: "archive", kind: "iconAndLabel", label: "Clear completed" },
      countBadge: {
        accessibilityLabel: "Clear completed target count",
        count: 7,
        id: "collection:task.clearCompletedTasks:count",
        kind: "countBadge",
      },
      density: "compact",
      disabled: true,
      disabledReason: "Clearing completed tasks",
      id: "collection:task.clearCompletedTasks",
      intent: {
        controlId: "collection:task.clearCompletedTasks",
        invocationSource: "button",
        type: "operationInvoke",
      },
      kind: "button",
      pending: { isPending: true, label: "Clearing completed tasks" },
      prominence: "secondary",
      type: "button",
    });
    expect(control.status).toMatchObject({
      detail: "Apply deletes",
      intent: "info",
      kind: "compactStatus",
      label: "Clearing completed tasks",
      status: "pending",
    });
    expect(control.progress).toEqual({
      detail: "Removing completed task records.",
      id: control.progress?.id,
      kind: "operationProgress",
      steps: [
        { id: "select", label: "Select completed tasks", status: "succeeded" },
        {
          detail: "Deleting seven records.",
          id: "apply",
          label: "Apply deletes",
          status: "running",
        },
        { id: "sync", label: "Sync changes", status: "pending" },
      ],
      title: "Clearing completed tasks",
      updatedAt: 1010,
    });
    expect(control.feedback).toMatchObject({
      activeProgress: {
        detail: "Deleting seven records.",
        label: "Apply deletes",
        stepId: "apply",
      },
      intent: "info",
      kind: "operationFeedbackEvent",
      status: "pending",
      title: "Clear completed...",
    });
    expect(sharedControl.feedback?.id).toBe(control.feedback?.id);
    expect(JSON.stringify(control)).not.toContain("executionKey");
    expect(JSON.stringify(control)).not.toContain("canonicalOperationKey");
    expect(JSON.stringify(control)).not.toContain('"input"');
  });

  it("keeps disabled reasons explicit independently of execution state", () => {
    const binding = {
      ...collectionCommandBinding(),
      availability: { state: "disabled", reason: "Requires owner access" },
      disabledReason: "Requires owner access",
    } satisfies GeneratedOperationControlBinding;
    const control = projectGeneratedOperationControl({
      binding,
      presentation: {
        accessibilityLabel: "Clear completed tasks",
        content: { kind: "label", label: "Clear completed" },
        density: "default",
        disabledReason: "Another command is running",
        prominence: "secondary",
      },
      state: idleState(binding.executionKey),
    });

    expect(control.trigger).toMatchObject({
      disabled: true,
      disabledReason: "Requires owner access",
      pending: undefined,
    });
    expect(control.status).toMatchObject({
      detail: "Ready",
      label: "Clear completed",
      status: "idle",
    });
    expect(control.feedback).toBeUndefined();
  });

  it("projects controlled destructive confirmation and committed, replayed, and failed feedback", () => {
    const binding = recordDeleteBinding();
    const pending = projectGeneratedOperationControl({
      binding,
      confirmationOpen: true,
      presentation: deletePresentation,
      state: {
        executionKey: binding.executionKey,
        startedAt: 1000,
        status: "pending",
      },
    });
    const failed = projectGeneratedOperationControl({
      binding,
      confirmationOpen: true,
      presentation: deletePresentation,
      state: {
        completedAt: 2010,
        executionKey: binding.executionKey,
        result: { type: "failed", displayError: "Active references block deletion." },
        startedAt: 2000,
        status: "failed",
      },
    });

    expect(pending.confirmation).toMatchObject({
      action: {
        disabled: true,
        pending: { isPending: true },
      },
      cancel: {
        disabled: false,
      },
      open: true,
    });
    expect(failed.trigger).toMatchObject({
      intent: {
        controlId: binding.id,
        open: true,
        type: "operationConfirmationOpenChange",
      },
      prominence: "destructive",
    });
    expect(failed.confirmation).toMatchObject({
      action: {
        content: { kind: "label", label: "Delete" },
        intent: {
          controlId: binding.id,
          invocationSource: "confirmationDialog",
          type: "operationInvoke",
        },
        prominence: "destructive",
      },
      cancel: {
        intent: {
          controlId: binding.id,
          open: false,
          type: "operationConfirmationOpenChange",
        },
      },
      closeIntent: {
        controlId: binding.id,
        open: false,
        type: "operationConfirmationOpenChange",
      },
      description:
        "The record will be hidden from active views. Active references can block deletion.",
      open: true,
      title: "Delete Hero block?",
    });
    expect(failed.feedback).toMatchObject({
      detail: "Active references block deletion.",
      intent: "danger",
      status: "failed",
      title: "Delete failed.",
    });

    const committed = projectGeneratedOperationControl({
      binding,
      confirmationOpen: false,
      presentation: deletePresentation,
      state: completedState(binding.executionKey, "committed", 3000),
    });
    const replayed = projectGeneratedOperationControl({
      binding,
      confirmationOpen: false,
      presentation: deletePresentation,
      state: completedState(binding.executionKey, "replayed", 4000),
    });
    expect(committed.confirmation?.open).toBe(false);
    expect(committed.feedback).toMatchObject({
      intent: "success",
      status: "committed",
      title: "Deleted Hero block.",
    });
    expect(replayed.confirmation?.open).toBe(false);
    expect(replayed.feedback).toMatchObject({
      intent: "neutral",
      status: "replayed",
      title: "Deleted Hero block.",
    });
    expect(committed.feedback?.id).not.toBe(replayed.feedback?.id);
  });

  it("projects affected counts and explicit feedback copy from normalized results", () => {
    const binding = collectionCommandBinding();
    const committedState = {
      completedAt: 5010,
      executionKey: binding.executionKey,
      result: { type: "committed", affectedCount: 3 },
      startedAt: 5000,
      status: "committed",
    } satisfies GeneratedOperationExecutionState;
    expect(projectGeneratedOperationFeedback(binding, committedState)).toMatchObject({
      detail: "3 affected.",
      status: "committed",
      title: "Clear completed synced.",
    });
    expect(
      projectGeneratedOperationFeedback(binding, committedState, {
        copy: {
          committed: {
            detail: "Three completed tasks removed.",
            title: "Completed tasks cleared",
          },
        },
      }),
    ).toMatchObject({
      detail: "Three completed tasks removed.",
      title: "Completed tasks cleared",
    });
  });
});

const deletePresentation = {
  accessibilityLabel: "Delete Hero block",
  content: { icon: "delete", kind: "iconOnly" },
  density: "compact",
  prominence: "destructive",
} as const;

function collectionCommandBinding(): GeneratedOperationControlBinding {
  return {
    availability: { state: "enabled" },
    canonicalOperationKey: "task.clearCompletedTasks",
    entityName: "task",
    executionKey: "task.clearCompletedTasks",
    feedback: {
      failureLabel: "Clear completed failed.",
      progressLabel: "Clear completed...",
      replayLabel: "Clear completed replayed.",
      successLabel: "Clear completed synced.",
    },
    id: "collection:task.clearCompletedTasks",
    input: {
      kind: "collectionCommand",
      ui: {
        showAffectedCountOnSuccess: true,
      },
    },
    kind: "command",
    label: "Clear completed",
    operationKind: "command",
    operationName: "clearCompletedTasks",
    scope: "collection",
    visualIntent: "default",
  };
}

function recordDeleteBinding(): GeneratedOperationControlBinding {
  return {
    availability: { state: "enabled" },
    canonicalOperationKey: "block.delete",
    confirmation: {
      actionLabel: "Delete",
      description:
        "The record will be hidden from active views. Active references can block deletion.",
      title: "Delete Hero block?",
    },
    destructive: true,
    entityName: "block",
    executionKey: "block.delete:block-1",
    feedback: {
      failureLabel: "Delete failed.",
      progressLabel: "Delete...",
      replayLabel: "Delete replayed.",
      successLabel: "Delete synced.",
    },
    id: "record-delete:block.delete",
    input: {
      entityLabel: "Block",
      kind: "recordDelete",
      recordLabel: "Hero block",
    },
    kind: "delete",
    label: "Delete",
    operationKind: "delete",
    operationName: "delete",
    scope: "record",
    visualIntent: "destructive",
  };
}

function idleState(executionKey: string): GeneratedOperationExecutionState {
  return { executionKey, status: "idle" };
}

function pendingState(): GeneratedOperationExecutionState {
  return {
    executionKey: "task.clearCompletedTasks",
    progress: {
      detail: "Removing completed task records.",
      steps: [
        { id: "select", label: "Select completed tasks", status: "succeeded" },
        {
          detail: "Deleting seven records.",
          id: "apply",
          label: "Apply deletes",
          status: "running",
        },
        { id: "sync", label: "Sync changes", status: "pending" },
      ],
      title: "Clearing completed tasks",
      updatedAt: 1010,
    },
    startedAt: 1000,
    status: "pending",
  };
}

function completedState(
  executionKey: string,
  type: "committed" | "replayed",
  startedAt: number,
): GeneratedOperationExecutionState {
  return {
    completedAt: startedAt + 10,
    executionKey,
    result: { type },
    startedAt,
    status: type,
  };
}
