import { useEffect, useRef, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge } from "@astryxdesign/core/Badge";
import { Button, type ButtonSize, type ButtonVariant } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { HoverCard } from "@astryxdesign/core/HoverCard";
import { IconButton } from "@astryxdesign/core/IconButton";
import { List, ListItem } from "@astryxdesign/core/List";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot, type StatusDotVariant } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { useToast, type ToastOptions } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import { spacingVars, typeScaleVars } from "@astryxdesign/core/theme/tokens.stylex";
import type {
  CompactStatusContract,
  CompactStatusIntent,
  OperationButtonContract,
  OperationDestructiveConfirmationContract,
  OperationExecutionStatus,
  OperationFeedbackEventContract,
  OperationPresentationIntentHandler,
  OperationProgressContract,
  OperationProgressStepStatus,
  SemanticIconId,
} from "@dpeek/formless-presentation/contract";
import { semanticIcon } from "./semantic-icon.tsx";

export type AstryxOperationButtonFacts = {
  badge?: OperationButtonContract["countBadge"];
  icon?: ReactNode;
  isDisabled: boolean;
  isIconOnly: boolean;
  isLoading: boolean;
  label: string;
  onClick: () => void;
  size: ButtonSize;
  tooltip?: string;
  type: OperationButtonContract["type"];
  variant: ButtonVariant;
  visibleLabel?: string;
};

export function astryxOperationButtonFacts(
  button: OperationButtonContract,
  onIntent: OperationPresentationIntentHandler,
): AstryxOperationButtonFacts {
  const isLoading = Boolean(button.pending?.isPending);
  const isDisabled = Boolean(button.disabled || isLoading);
  const icon = button.content.kind === "label" ? undefined : operationIcon(button.content.icon);

  return {
    ...(button.countBadge === undefined ? {} : { badge: button.countBadge }),
    ...(icon === undefined ? {} : { icon }),
    isDisabled,
    isIconOnly: button.content.kind === "iconOnly",
    isLoading,
    label: button.accessibilityLabel,
    onClick: () => {
      if (isDisabled) {
        return;
      }

      void onIntent(button.intent);
    },
    size: button.density === "compact" ? "sm" : "md",
    tooltip:
      button.disabledReason ??
      (button.content.kind === "iconOnly" ? button.accessibilityLabel : undefined),
    type: button.type,
    variant: operationButtonVariant(button.prominence),
    ...(button.content.kind === "iconOnly" ? {} : { visibleLabel: button.content.label }),
  };
}

export function AstryxOperationButton({
  button,
  onIntent,
}: {
  button: OperationButtonContract;
  onIntent: OperationPresentationIntentHandler;
}) {
  const facts = astryxOperationButtonFacts(button, onIntent);
  const badge = facts.badge ? <AstryxOperationCountBadge badge={facts.badge} /> : undefined;

  if (facts.isIconOnly && facts.icon !== undefined) {
    return (
      <HStack align="center" gap={0.5}>
        <IconButton
          icon={facts.icon}
          isDisabled={facts.isDisabled}
          isLoading={facts.isLoading}
          label={facts.label}
          onClick={facts.onClick}
          size={facts.size}
          tooltip={facts.tooltip}
          type={facts.type}
          variant={facts.variant}
        />
        {badge}
      </HStack>
    );
  }

  return (
    <Button
      endContent={badge}
      icon={facts.icon}
      isDisabled={facts.isDisabled}
      isLoading={facts.isLoading}
      label={facts.label}
      onClick={facts.onClick}
      size={facts.size}
      tooltip={facts.tooltip}
      type={facts.type}
      variant={facts.variant}
    >
      {facts.visibleLabel}
    </Button>
  );
}

export function AstryxOperationButtonWithProgress({
  button,
  onIntent,
  progress,
}: {
  button: OperationButtonContract;
  onIntent: OperationPresentationIntentHandler;
  progress: OperationProgressContract;
}) {
  const isPending = Boolean(button.pending?.isPending);
  const isDisabled = Boolean(button.disabled || isPending);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const handleIntent: OperationPresentationIntentHandler = (intent) => {
    triggerRef.current?.focus({ preventScroll: true });
    return onIntent(intent);
  };

  return (
    <HoverCard
      alignment="start"
      content={<AstryxOperationProgress progress={progress} />}
      focusTrigger="always"
      hasHoverIndication={false}
      isDefaultOpen={isPending}
      placement="below"
    >
      <span
        {...(isDisabled
          ? { "aria-label": `${button.accessibilityLabel}. Operation progress` }
          : {})}
        ref={triggerRef}
        tabIndex={isDisabled ? 0 : -1}
        {...stylex.props(styles.progressTrigger)}
      >
        <AstryxOperationButton button={button} onIntent={handleIntent} />
      </span>
    </HoverCard>
  );
}

export function AstryxOperationCountBadge({
  badge,
}: {
  badge: NonNullable<OperationButtonContract["countBadge"]>;
}) {
  return (
    <Badge
      aria-label={badge.accessibilityLabel}
      data-operation-count={String(badge.count)}
      id={badge.id}
      label={badge.count}
      variant="neutral"
    />
  );
}

export type AstryxOperationConfirmationFacts = {
  actionLabel: string;
  actionVariant: ButtonVariant;
  cancelLabel: string;
  description: string;
  isActionLoading: boolean;
  isOpen: boolean;
  onAction: () => Promise<void> | void;
  onOpenChange: (open: boolean) => Promise<void> | void;
  title: string;
};

export function astryxOperationConfirmationFacts(
  confirmation: OperationDestructiveConfirmationContract,
  onIntent: OperationPresentationIntentHandler,
): AstryxOperationConfirmationFacts {
  const actionDisabled = Boolean(
    confirmation.action.disabled || confirmation.action.pending?.isPending,
  );
  const cancelDisabled = Boolean(
    confirmation.cancel.disabled || confirmation.cancel.pending?.isPending,
  );

  return {
    actionLabel: operationButtonVisibleLabel(confirmation.action),
    actionVariant: "destructive",
    cancelLabel: operationButtonVisibleLabel(confirmation.cancel),
    description: confirmation.description,
    isActionLoading: Boolean(confirmation.action.pending?.isPending),
    isOpen: confirmation.open,
    onAction: () => (actionDisabled ? undefined : onIntent(confirmation.action.intent)),
    onOpenChange: (open) =>
      open || cancelDisabled ? undefined : onIntent(confirmation.closeIntent),
    title: confirmation.title,
  };
}

export function AstryxOperationDestructiveConfirmation({
  confirmation,
  onIntent,
}: {
  confirmation: OperationDestructiveConfirmationContract;
  onIntent: OperationPresentationIntentHandler;
}) {
  const facts = astryxOperationConfirmationFacts(confirmation, onIntent);

  return (
    <AlertDialog
      actionLabel={facts.actionLabel}
      actionVariant={facts.actionVariant}
      cancelLabel={facts.cancelLabel}
      description={facts.description}
      isActionLoading={facts.isActionLoading}
      isOpen={facts.isOpen}
      onAction={facts.onAction}
      onOpenChange={facts.onOpenChange}
      title={facts.title}
      xstyle={styles.confirmationDialog}
    />
  );
}

export function AstryxOperationCompactStatus({ status }: { status: CompactStatusContract }) {
  const isPending = Boolean(status.pending?.isPending);

  return (
    <HStack
      align="start"
      aria-label={status.accessibilityLabel}
      data-operation-status={status.status}
      gap={2}
      role={status.intent === "danger" ? "alert" : "status"}
      xstyle={styles.status}
    >
      {isPending ? (
        <Spinner
          aria-label={status.pending?.label ?? status.accessibilityLabel}
          shade="subtle"
          size="sm"
        />
      ) : (
        <StatusDot
          label={operationExecutionStatusLabel(status.status)}
          variant={astryxOperationStatusVariant(status.intent)}
        />
      )}
      <VStack gap={0.5} xstyle={styles.copy}>
        <Text display="block" maxLines={1} type="label">
          {status.label}
        </Text>
        <Text color="secondary" display="block" maxLines={2} type="supporting">
          {status.detail}
        </Text>
      </VStack>
    </HStack>
  );
}

export function AstryxOperationProgress({ progress }: { progress: OperationProgressContract }) {
  return (
    <VStack aria-label={progress.title} data-operation-progress={progress.id} role="status">
      <List density="compact">
        {progress.steps.map((step) => (
          <ListItem
            description={
              step.detail === undefined ? (
                operationProgressStepStatusLabel(step.status)
              ) : (
                <VStack gap={0.5}>
                  <Text color="secondary" display="block" type="supporting">
                    {step.detail}
                  </Text>
                  <Text color="secondary" display="block" type="supporting">
                    {operationProgressStepStatusLabel(step.status)}
                  </Text>
                </VStack>
              )
            }
            key={step.id}
            label={step.label}
            startContent={<OperationProgressStepMarker status={step.status} />}
            xstyle={styles.progressStep}
          />
        ))}
      </List>
    </VStack>
  );
}

export function astryxOperationFeedbackToastOptions(
  feedback: OperationFeedbackEventContract,
): ToastOptions {
  const isFailure = feedback.status === "failed";
  return {
    ...(isFailure ? {} : { autoHideDuration: 5000 }),
    body: feedback.title,
    collisionBehavior: "overwrite",
    isAutoHide: !isFailure,
    type: isFailure ? "error" : "info",
    uniqueID: feedback.id,
  };
}

export function AstryxOperationFeedback({
  feedback,
}: {
  feedback: OperationFeedbackEventContract | undefined;
}) {
  const showToast = useToast();
  const feedbackRef = useRef(feedback);
  const feedbackUpdateKey = astryxOperationFeedbackUpdateKey(feedback);
  feedbackRef.current = feedback;

  useEffect(() => {
    const currentFeedback = feedbackRef.current;

    if (
      !isAstryxOperationResultFeedback(currentFeedback) ||
      astryxOperationFeedbackUpdateKey(currentFeedback) !== feedbackUpdateKey
    ) {
      return;
    }

    showToast(astryxOperationFeedbackToastOptions(currentFeedback));
  }, [feedbackUpdateKey, showToast]);

  return null;
}

export function isAstryxOperationResultFeedback(
  feedback: OperationFeedbackEventContract | undefined,
): feedback is OperationFeedbackEventContract {
  return feedback !== undefined && feedback.status !== "pending";
}

export function astryxOperationFeedbackUpdateKey(
  feedback: OperationFeedbackEventContract | undefined,
): string | undefined {
  return feedback === undefined ? undefined : JSON.stringify(feedback);
}

export function operationButtonVariant(
  prominence: OperationButtonContract["prominence"],
): ButtonVariant {
  switch (prominence) {
    case "primary":
      return "primary";
    case "quiet":
      return "ghost";
    case "destructive":
      return "destructive";
    case "secondary":
      return "secondary";
  }
}

export function astryxOperationStatusVariant(intent: CompactStatusIntent): StatusDotVariant {
  switch (intent) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "danger":
      return "error";
    case "info":
      return "accent";
    case "neutral":
      return "neutral";
  }
}

function OperationProgressStepMarker({ status }: { status: OperationProgressStepStatus }) {
  const marker =
    status === "running" ? (
      <Spinner aria-label={operationProgressStepStatusLabel(status)} shade="subtle" size="sm" />
    ) : (
      <StatusDot
        label={operationProgressStepStatusLabel(status)}
        variant={status === "failed" ? "error" : status === "succeeded" ? "success" : "neutral"}
      />
    );

  return <span {...stylex.props(styles.progressStepMarker)}>{marker}</span>;
}

function operationButtonVisibleLabel(button: OperationButtonContract): string {
  return button.content.kind === "iconOnly" ? button.accessibilityLabel : button.content.label;
}

function operationExecutionStatusLabel(status: OperationExecutionStatus): string {
  const labels: Record<OperationExecutionStatus, string> = {
    committed: "Committed",
    failed: "Failed",
    idle: "Ready",
    pending: "In progress",
    replayed: "Already applied",
  };

  return labels[status];
}

function operationProgressStepStatusLabel(status: OperationProgressStepStatus): string {
  const labels: Record<OperationProgressStepStatus, string> = {
    failed: "Failed",
    pending: "Not started",
    running: "In progress",
    skipped: "Skipped",
    succeeded: "Completed",
  };

  return labels[status];
}

export function operationIcon(icon: SemanticIconId) {
  return semanticIcon(icon);
}

const styles = stylex.create({
  confirmationDialog: {
    textAlign: "start",
  },
  copy: {
    minWidth: 0,
  },
  progressStep: {
    alignItems: "flex-start",
  },
  progressStepMarker: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    height: `calc(1em * ${typeScaleVars["--text-body-leading"]})`,
    justifyContent: "center",
    width: spacingVars["--spacing-4"],
  },
  progressTrigger: {
    display: "inline-block",
  },
  status: {
    minWidth: 0,
  },
});
