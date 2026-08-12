// @vitest-environment jsdom

import { describe, expect, it } from "vite-plus/test";
import { fireEvent, render, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  CompactStatusContract,
  OperationButtonContract,
  OperationCommandDialogContract,
  OperationDestructiveConfirmationContract,
  OperationFeedbackEventContract,
  OperationPresentationIntent,
  OperationProgressContract,
} from "@dpeek/formless-presentation/contract";
import { operationControlFixtures } from "./operation-controls.fixtures.ts";
import {
  AstryxOperationButton,
  AstryxOperationButtonWithProgress,
  AstryxOperationCommandDialog,
  AstryxOperationCompactStatus,
  AstryxOperationDestructiveConfirmation,
  AstryxOperationProgress,
  astryxOperationButtonFacts,
  astryxOperationConfirmationFacts,
  astryxOperationFeedbackUpdateKey,
  astryxOperationFeedbackToastOptions,
  isAstryxOperationResultFeedback,
  operationButtonVariant,
} from "./operation-renderer.tsx";
import { operationField, textControl } from "./fields/fixture-helpers.ts";

describe("Astryx operation controls", () => {
  it("maps projected hierarchy to semantic Astryx button variants", () => {
    expect(operationButtonVariant("primary")).toBe("primary");
    expect(operationButtonVariant("secondary")).toBe("secondary");
    expect(operationButtonVariant("quiet")).toBe("ghost");
    expect(operationButtonVariant("destructive")).toBe("destructive");
  });

  it("renders an accessible compact icon action with its projected count badge", () => {
    const button = operationButton({
      accessibilityLabel: "Delete completed tasks",
      content: { icon: "delete", kind: "iconOnly" },
      countBadge: {
        accessibilityLabel: "Three completed tasks",
        count: 3,
        id: "delete-completed:count",
        kind: "countBadge",
      },
      density: "compact",
      prominence: "destructive",
    });
    const html = renderToStaticMarkup(
      <AstryxOperationButton button={button} onIntent={() => undefined} />,
    );

    expect(html).toContain('aria-label="Delete completed tasks"');
    expect(html).toContain('aria-label="Three completed tasks"');
    expect(html).toContain('data-operation-count="3"');
    expect(html).toContain('data-variant="destructive"');
  });

  it("maps pending and disabled state to loading without dispatching duplicate intent", () => {
    const intents: OperationPresentationIntent[] = [];
    const intent = {
      controlId: "clear-completed",
      invocationSource: "button",
      type: "operationInvoke",
    } as const;
    const pendingButton = operationButton({
      disabled: true,
      disabledReason: "Clearing completed tasks",
      intent,
      pending: { isPending: true, label: "Clearing completed tasks" },
    });
    const pendingFacts = astryxOperationButtonFacts(pendingButton, (nextIntent) => {
      intents.push(nextIntent);
    });

    expect(pendingFacts).toMatchObject({
      isDisabled: true,
      isLoading: true,
      tooltip: "Clearing completed tasks",
    });
    pendingFacts.onClick();
    expect(intents).toEqual([]);

    const enabledFacts = astryxOperationButtonFacts(operationButton({ intent }), (nextIntent) => {
      intents.push(nextIntent);
    });
    enabledFacts.onClick();
    expect(intents).toEqual([intent]);

    const html = renderToStaticMarkup(
      <AstryxOperationButton button={pendingButton} onIntent={() => undefined} />,
    );
    expect(html).toContain('aria-busy="true"');
  });

  it("keeps destructive confirmation controlled through projected intents", () => {
    const intents: OperationPresentationIntent[] = [];
    const confirmation = destructiveConfirmation();
    const facts = astryxOperationConfirmationFacts(confirmation, (intent) => {
      intents.push(intent);
    });

    expect(facts).toMatchObject({
      actionLabel: "Delete task",
      actionVariant: "destructive",
      cancelLabel: "Cancel",
      description: "The task and its history will be permanently deleted.",
      isActionLoading: false,
      isOpen: true,
      title: "Delete Prepare launch?",
    });
    void facts.onOpenChange(true);
    void facts.onOpenChange(false);
    void facts.onAction();
    expect(intents).toEqual([confirmation.closeIntent, confirmation.action.intent]);
  });

  it("keeps cancel available while a destructive action is loading", () => {
    const intents: OperationPresentationIntent[] = [];
    const confirmation = destructiveConfirmation();
    const pendingConfirmation = {
      ...confirmation,
      action: {
        ...confirmation.action,
        disabled: true,
        disabledReason: "Deleting task",
        pending: { isPending: true, label: "Deleting task" },
      },
    } satisfies OperationDestructiveConfirmationContract;
    const facts = astryxOperationConfirmationFacts(pendingConfirmation, (intent) => {
      intents.push(intent);
    });

    expect(facts.isActionLoading).toBe(true);
    void facts.onAction();
    void facts.onOpenChange(false);
    expect(intents).toEqual([confirmation.closeIntent]);

    const html = renderToStaticMarkup(
      <AstryxOperationDestructiveConfirmation
        confirmation={pendingConfirmation}
        onIntent={() => undefined}
      />,
    );
    expect(html).toContain('aria-busy="true"');
    expect(html.match(/disabled=""/g)).toHaveLength(1);
  });

  it("submits the production Astryx command dialog through deferred required validation", () => {
    const field = {
      type: "text",
      required: true,
      label: "Customer name",
    } as const;
    const closeIntent = {
      controlId: "add-sample",
      open: false,
      type: "operationCommandDialogOpenChange",
    } as const;
    const commandDialog = ({
      errors,
      submitDisabled,
      value,
    }: {
      errors?: readonly { fieldName: string; message: string }[];
      submitDisabled: boolean;
      value: string;
    }) =>
      ({
        cancel: operationButton({
          accessibilityLabel: "Cancel",
          content: { kind: "label", label: "Cancel" },
          id: "add-sample:cancel",
          intent: closeIntent,
        }),
        closeIntent,
        errors: [],
        fieldSet: {
          disabled: false,
          fields: [
            operationField({
              control: textControl(field),
              draftInput: { kind: "input", value },
              editor: "text",
              errors,
              field,
              fieldName: "customerName",
              inputName: "customerName",
              label: "Customer name",
              labelVisibility: "visible",
              occurrence: { ownerId: "add-sample", placementId: "customerName" },
            }),
          ],
          id: "add-sample:fields",
          kind: "fieldSet",
          label: "Add sample fields",
        },
        id: "add-sample:dialog",
        kind: "operationCommandDialog",
        open: true,
        submit: operationButton({
          accessibilityLabel: "Add sample",
          content: { kind: "label", label: "Add sample" },
          disabled: submitDisabled,
          ...(submitDisabled ? { disabledReason: "Complete the required fields." } : {}),
          id: "add-sample:submit",
          intent: { controlId: "add-sample", type: "operationCommandSubmit" },
          prominence: "primary",
          type: "submit",
        }),
        title: "Add sample",
      }) satisfies OperationCommandDialogContract;
    const intents: OperationPresentationIntent[] = [];
    const initial = commandDialog({ submitDisabled: false, value: "" });
    const mounted = render(
      <AstryxOperationCommandDialog
        dialog={initial}
        onIntent={(intent) => {
          intents.push(intent);
        }}
      />,
    );
    let dialog = within(mounted.getByRole("dialog", { name: "Add sample" }));

    expect(dialog.getByText("Customer name")).toBeTruthy();
    expect(dialog.queryByText('Field "customerName" cannot be empty.')).toBeNull();
    expect(dialog.getByRole("button", { name: "Add sample" }).getAttribute("aria-disabled")).toBe(
      null,
    );
    fireEvent.submit(mounted.container.querySelector("form")!);
    expect(intents).toEqual([{ controlId: "add-sample", type: "operationCommandSubmit" }]);

    mounted.rerender(
      <AstryxOperationCommandDialog
        dialog={commandDialog({
          errors: [{ fieldName: "customerName", message: 'Field "customerName" cannot be empty.' }],
          submitDisabled: true,
          value: "",
        })}
        onIntent={(intent) => {
          intents.push(intent);
        }}
      />,
    );
    dialog = within(mounted.getByRole("dialog", { name: "Add sample" }));
    expect(dialog.getByText('Field "customerName" cannot be empty.')).toBeTruthy();
    expect(dialog.getByRole("button", { name: "Add sample" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
    fireEvent.change(dialog.getByRole("textbox", { name: /Customer name/ }), {
      target: { value: "Ada Lovelace" },
    });
    expect(intents.at(-1)).toMatchObject({
      intent: {
        inputName: "customerName",
        inputValue: { value: "Ada Lovelace" },
        type: "operationDraftChange",
      },
      type: "operationCommandFieldIntent",
    });

    mounted.rerender(
      <AstryxOperationCommandDialog
        dialog={commandDialog({ submitDisabled: false, value: "Ada Lovelace" })}
        onIntent={(intent) => {
          intents.push(intent);
        }}
      />,
    );
    fireEvent.submit(mounted.container.querySelector("form")!);
    expect(intents.filter((intent) => intent.type === "operationCommandSubmit")).toHaveLength(2);
    mounted.unmount();
  });

  it("renders visible compact status text with semantic async and failure state", () => {
    const pendingHtml = renderToStaticMarkup(
      <AstryxOperationCompactStatus
        status={compactStatus({
          accessibilityLabel: "Clear completed: Applying changes",
          detail: "Applying changes",
          intent: "info",
          label: "Clearing completed tasks",
          pending: { isPending: true, label: "Clearing completed tasks" },
          status: "pending",
        })}
      />,
    );
    const failureHtml = renderToStaticMarkup(
      <AstryxOperationCompactStatus
        status={compactStatus({
          accessibilityLabel: "Clear completed failed: No changes applied",
          detail: "No changes applied",
          intent: "danger",
          label: "Clear completed failed",
          status: "failed",
        })}
      />,
    );

    expect(pendingHtml).toContain("Clearing completed tasks");
    expect(pendingHtml).toContain("Applying changes");
    expect(pendingHtml).toContain('data-operation-status="pending"');
    expect(failureHtml).toContain('role="alert"');
    expect(failureHtml).toContain("Clear completed failed");
    expect(failureHtml).toContain("No changes applied");
  });

  it("preserves ordered progress and exposes each step's visible state", () => {
    const progress = operationProgress();
    const html = renderToStaticMarkup(<AstryxOperationProgress progress={progress} />);

    expect(html.indexOf("Select completed tasks")).toBeLessThan(html.indexOf("Apply deletes"));
    expect(html.indexOf("Apply deletes")).toBeLessThan(html.indexOf("Sync changes"));
    expect(html).toContain("Completed");
    expect(html).toContain("In progress");
    expect(html).toContain("Not started");
    expect(html).toContain("<ul");
    expect(html.match(/<li/g)).toHaveLength(3);
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain("Removing completed task records.");
  });

  it("reveals multi-step progress from its operation button", () => {
    const progress = operationProgress();
    const html = renderToStaticMarkup(
      <AstryxOperationButtonWithProgress
        button={operationButton({
          pending: { isPending: true, label: "Clearing completed tasks" },
        })}
        onIntent={() => undefined}
        progress={progress}
      />,
    );

    expect(html).toContain("Clear completed");
    expect(html).toContain('data-operation-progress="progress:clear-completed"');
    expect(html).toContain("Select completed tasks");
    expect(html).not.toContain('role="progressbar"');
  });

  it("models user-initiated workspace pushes with one-second step transitions", () => {
    const success = operationControlFixtures.workspacePushSuccess;
    const failure = operationControlFixtures.workspacePushFailure;

    for (const fixture of [success, failure]) {
      expect(fixture.initial.trigger.pending).toBeUndefined();
      expect(fixture.initial.progress).toBeUndefined();
      expect(fixture.timeline?.map((transition) => transition.delayMs)).toEqual([1000, 1000, 1000]);
      expect(fixture.pending.progress?.steps.map((step) => step.status)).toEqual([
        "running",
        "pending",
        "pending",
      ]);
      expect(fixture.timeline?.[0]?.snapshot.progress?.steps.map((step) => step.status)).toEqual([
        "succeeded",
        "running",
        "pending",
      ]);
      expect(fixture.timeline?.[1]?.snapshot.progress?.steps.map((step) => step.status)).toEqual([
        "succeeded",
        "succeeded",
        "running",
      ]);
    }

    expect(success.settled.feedback?.status).toBe("committed");
    expect(success.settled.progress?.steps.map((step) => step.status)).toEqual([
      "succeeded",
      "succeeded",
      "succeeded",
    ]);
    expect(failure.settled.feedback?.status).toBe("failed");
    expect(failure.settled.progress?.steps.map((step) => step.status)).toEqual([
      "succeeded",
      "succeeded",
      "failed",
    ]);
  });

  it("deduplicates feedback toasts by projected event identity", () => {
    const feedback = operationFeedback();
    const options = astryxOperationFeedbackToastOptions(feedback);
    const repeatedOptions = astryxOperationFeedbackToastOptions({ ...feedback });

    expect(options.uniqueID).toBe(feedback.id);
    expect(repeatedOptions.uniqueID).toBe(feedback.id);
    expect(options.collisionBehavior).toBe("overwrite");
    expect(options.body).toBe("Completed tasks cleared");
    expect(options.isAutoHide).toBe(true);
    expect(options.type).toBe("info");

    const failureOptions = astryxOperationFeedbackToastOptions({
      ...feedback,
      detail: "The archive policy rejected this command.",
      intent: "danger",
      status: "failed",
      title: "Overdue tasks not archived",
    });

    expect(failureOptions.body).toBe("Overdue tasks not archived");
    expect(failureOptions.isAutoHide).toBe(false);
    expect(failureOptions.type).toBe("error");
    expect(failureOptions).not.toHaveProperty("autoHideDuration");

    const pendingFeedback = {
      ...feedback,
      id: "feedback:clear-completed:pending:10",
      intent: "info",
      progress: operationProgress(),
      status: "pending",
    } satisfies OperationFeedbackEventContract;
    const advancedFeedback = {
      ...pendingFeedback,
      progress: {
        ...pendingFeedback.progress,
        updatedAt: 11,
      },
    } satisfies OperationFeedbackEventContract;

    expect(isAstryxOperationResultFeedback(pendingFeedback)).toBe(false);
    expect(isAstryxOperationResultFeedback(feedback)).toBe(true);
    expect(astryxOperationFeedbackUpdateKey({ ...pendingFeedback })).toBe(
      astryxOperationFeedbackUpdateKey(pendingFeedback),
    );
    expect(astryxOperationFeedbackUpdateKey(advancedFeedback)).not.toBe(
      astryxOperationFeedbackUpdateKey(pendingFeedback),
    );
    expect(astryxOperationFeedbackToastOptions(advancedFeedback).uniqueID).toBe(pendingFeedback.id);
  });
});

function operationButton(
  overrides: Partial<OperationButtonContract> = {},
): OperationButtonContract {
  return {
    accessibilityLabel: "Clear completed tasks",
    content: { icon: "archive", kind: "iconAndLabel", label: "Clear completed" },
    density: "default",
    id: "clear-completed",
    intent: {
      controlId: "clear-completed",
      invocationSource: "button",
      type: "operationInvoke",
    },
    kind: "button",
    prominence: "secondary",
    type: "button",
    ...overrides,
  };
}

function destructiveConfirmation(): OperationDestructiveConfirmationContract {
  return {
    action: operationButton({
      accessibilityLabel: "Delete task",
      content: { kind: "label", label: "Delete task" },
      id: "delete-task:confirm",
      intent: {
        controlId: "delete-task",
        invocationSource: "confirmationDialog",
        type: "operationInvoke",
      },
      prominence: "destructive",
    }),
    cancel: operationButton({
      accessibilityLabel: "Cancel",
      content: { kind: "label", label: "Cancel" },
      id: "delete-task:cancel",
      intent: {
        controlId: "delete-task",
        open: false,
        type: "operationConfirmationOpenChange",
      },
      prominence: "secondary",
    }),
    closeIntent: {
      controlId: "delete-task",
      open: false,
      type: "operationConfirmationOpenChange",
    },
    description: "The task and its history will be permanently deleted.",
    id: "delete-task:confirmation",
    kind: "destructiveConfirmation",
    open: true,
    title: "Delete Prepare launch?",
  };
}

function compactStatus(overrides: Partial<CompactStatusContract> = {}): CompactStatusContract {
  return {
    accessibilityLabel: "Clear completed: Ready",
    detail: "Ready",
    id: "clear-completed:status",
    intent: "neutral",
    kind: "compactStatus",
    label: "Clear completed",
    status: "idle",
    ...overrides,
  };
}

function operationProgress(): OperationProgressContract {
  return {
    detail: "Removing completed task records.",
    id: "progress:clear-completed",
    kind: "operationProgress",
    steps: [
      { id: "select", label: "Select completed tasks", status: "succeeded" },
      { id: "apply", label: "Apply deletes", status: "running" },
      { id: "sync", label: "Sync changes", status: "pending" },
    ],
    title: "Clearing completed tasks",
    updatedAt: 10,
  };
}

function operationFeedback(): OperationFeedbackEventContract {
  return {
    detail: "3 affected.",
    id: "feedback:clear-completed:committed:20",
    intent: "success",
    kind: "operationFeedbackEvent",
    status: "committed",
    title: "Completed tasks cleared",
  };
}
