import { useEffect, useMemo, useState } from "react";
import type {
  OperationInvokeIntent,
  OperationPresentationIntent,
} from "@dpeek/formless-presentation/contract";
import {
  createGeneratedOperationController,
  type GeneratedOperationCallerInput,
  type GeneratedOperationControlBinding,
  type GeneratedOperationController,
  type GeneratedOperationExecutionResult,
} from "../../client/views.ts";
import { setSyncStatus, type SyncStatus } from "../../client/sync-status.ts";
import type { OrderingMovePatchPlan } from "../../shared/result-ordering.ts";
import type { ResultOrderingContext } from "./ordering-ui.ts";

type GeneratedOperationFeedbackOptions = {
  committedMessage?: string | ((result: GeneratedOperationExecutionResult) => string);
  failedMessage?: string | ((result: GeneratedOperationExecutionResult) => string);
  progressMessage?: string;
  replayedMessage?: string | ((result: GeneratedOperationExecutionResult) => string);
};

export type ExecuteGeneratedOperationControlOptions = {
  binding: GeneratedOperationControlBinding;
  callerInput: GeneratedOperationCallerInput;
  controller: GeneratedOperationController;
  feedback?: GeneratedOperationFeedbackOptions;
  setStatus?: (status: SyncStatus) => void;
};

export type GeneratedOperationControlTriggerDecision =
  | { type: "confirm" }
  | { type: "execute" }
  | { type: "ignore" };

export type HandleGeneratedOperationIntentOptions = {
  binding: GeneratedOperationControlBinding;
  confirmationOpen?: boolean;
  controller: GeneratedOperationController;
  intent: OperationPresentationIntent;
  invoke: (intent: OperationInvokeIntent) => Promise<GeneratedOperationExecutionResult>;
  onConfirmationOpenChange?: (open: boolean) => void;
  onSuccess?: (result: Exclude<GeneratedOperationExecutionResult, { type: "failed" }>) => void;
};

export function useGeneratedOperationController(
  bindings: readonly GeneratedOperationControlBinding[],
): GeneratedOperationController {
  return useMemo(
    () =>
      createGeneratedOperationController({
        bindings,
      }),
    [bindings],
  );
}

export function useGeneratedOperationControllerVersion(
  controller: GeneratedOperationController,
): number {
  const [version, setVersion] = useState(0);

  useEffect(
    () =>
      controller.subscribe(() => {
        setVersion((current) => current + 1);
      }),
    [controller],
  );

  return version;
}

export function selectGeneratedOperationControlTriggerDecision({
  binding,
  disabled = false,
  pending = false,
}: {
  binding: GeneratedOperationControlBinding | undefined;
  disabled?: boolean;
  pending?: boolean;
}): GeneratedOperationControlTriggerDecision {
  if (binding === undefined || disabled || pending || binding.availability.state === "disabled") {
    return { type: "ignore" };
  }

  if (binding.confirmation !== undefined) {
    return { type: "confirm" };
  }

  return { type: "execute" };
}

export async function handleGeneratedOperationIntent({
  binding,
  confirmationOpen = false,
  controller,
  intent,
  invoke,
  onConfirmationOpenChange,
  onSuccess,
}: HandleGeneratedOperationIntentOptions): Promise<GeneratedOperationExecutionResult | undefined> {
  if (intent.controlId !== binding.id) {
    return undefined;
  }

  if (intent.type === "operationConfirmationOpenChange") {
    if (binding.confirmation !== undefined) {
      onConfirmationOpenChange?.(intent.open);
    }
    return undefined;
  }

  if (controller.isPending(binding.id)) {
    return undefined;
  }

  if (binding.availability.state === "disabled") {
    return undefined;
  }

  if (
    (binding.confirmation !== undefined &&
      (!confirmationOpen || intent.invocationSource !== "confirmationDialog")) ||
    (binding.confirmation === undefined && intent.invocationSource === "confirmationDialog")
  ) {
    return undefined;
  }

  const result = await invoke(intent);

  if (result.type !== "failed") {
    if (binding.confirmation !== undefined) {
      onConfirmationOpenChange?.(false);
    }
    onSuccess?.(result);
  }

  return result;
}

export async function executeGeneratedOperationControl({
  binding,
  callerInput,
  controller,
  feedback,
  setStatus = setSyncStatus,
}: ExecuteGeneratedOperationControlOptions): Promise<GeneratedOperationExecutionResult> {
  setStatus({
    state: "syncing",
    message: generatedOperationProgressMessage(binding, feedback),
  });

  const result = await controller.execute(callerInput);
  setStatus(generatedOperationResultStatus(binding, result, feedback));

  return result;
}

export async function executeGeneratedOrderingMoveOperation({
  binding,
  controller,
  orderingContext,
  plan,
  source,
  failedMessage,
  setStatus,
  successMessage,
  syncingMessage,
}: {
  binding: GeneratedOperationControlBinding;
  controller: GeneratedOperationController;
  orderingContext: ResultOrderingContext;
  plan: OrderingMovePatchPlan;
  source: GeneratedOperationCallerInput["source"];
  failedMessage?: string;
  setStatus?: (status: SyncStatus) => void;
  successMessage: string;
  syncingMessage: string;
}): Promise<GeneratedOperationExecutionResult> {
  return executeGeneratedOperationControl({
    binding,
    callerInput: {
      bindingId: binding.id,
      input: {
        [orderingContext.ordering.fieldName]: plan.rank,
      },
      recordId: plan.recordId,
      source,
    },
    controller,
    feedback: {
      committedMessage: successMessage,
      failedMessage,
      progressMessage: syncingMessage,
      replayedMessage: successMessage,
    },
    setStatus,
  });
}

export function generatedOperationProgressMessage(
  binding: GeneratedOperationControlBinding,
  feedback?: GeneratedOperationFeedbackOptions,
): string {
  return feedback?.progressMessage ?? binding.feedback?.progressLabel ?? `${binding.label}...`;
}

export function generatedOperationResultStatus(
  binding: GeneratedOperationControlBinding,
  result: GeneratedOperationExecutionResult,
  feedback?: GeneratedOperationFeedbackOptions,
): SyncStatus {
  if (result.type === "failed") {
    return {
      state: "error",
      message:
        resolveFeedbackMessage(feedback?.failedMessage, result) ??
        result.displayError ??
        binding.feedback?.failureLabel ??
        "Operation failed.",
    };
  }

  if (result.type === "replayed") {
    return {
      state: "idle",
      message:
        result.displayMessage ??
        resolveFeedbackMessage(feedback?.replayedMessage, result) ??
        binding.feedback?.replayLabel ??
        binding.feedback?.successLabel ??
        `${binding.label} replayed.`,
    };
  }

  return {
    state: "idle",
    message:
      result.displayMessage ??
      resolveFeedbackMessage(feedback?.committedMessage, result) ??
      binding.feedback?.successLabel ??
      `${binding.label} synced.`,
  };
}

function resolveFeedbackMessage(
  message: string | ((result: GeneratedOperationExecutionResult) => string) | undefined,
  result: GeneratedOperationExecutionResult,
): string | undefined {
  return typeof message === "function" ? message(result) : message;
}
