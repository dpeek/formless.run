import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { VStack } from "@astryxdesign/core/VStack";
import type { DropdownMenuOption } from "@astryxdesign/core/DropdownMenu";
import type {
  CollectionEmptyStatePrimaryActionContract,
  CreateFieldIntentHandler,
  CreateIntentHandler,
  FieldIntent,
  FieldContract,
  OperationPresentationIntent,
  RecordResultActionContract,
  RecordResultContract,
  RecordResultIntentHandler,
} from "@dpeek/formless-presentation/contract";
import { AstryxCreateSurfaceRenderer } from "./create-renderer.tsx";
import { FieldRenderer } from "./fields/field-renderer.tsx";
import {
  AstryxOperationButton,
  AstryxOperationButtonWithProgress,
  AstryxOperationDestructiveConfirmation,
  AstryxOperationFeedback,
  operationIcon,
} from "./operation-renderer.tsx";

export function AstryxRecordResultRenderer({
  onCreateFieldIntent = ignoreCreateFieldIntent,
  onCreateIntent = ignoreCreateIntent,
  onIntent,
  recordResult,
}: {
  onCreateFieldIntent?: CreateFieldIntentHandler;
  onCreateIntent?: CreateIntentHandler;
  onIntent: RecordResultIntentHandler;
  recordResult: RecordResultContract;
}) {
  const spacing = astryxRecordResultSpacing(recordResult.density);

  return (
    <VStack
      as="section"
      aria-label={recordResult.accessibilityLabel}
      data-formless-record-result={recordResult.id}
      data-formless-record-result-density={recordResult.density}
      gap={spacing.gap}
      width="100%"
    >
      <AstryxRecordResultContent
        onCreateFieldIntent={onCreateFieldIntent}
        onCreateIntent={onCreateIntent}
        onIntent={onIntent}
        recordResult={recordResult}
        spacing={spacing}
      />
    </VStack>
  );
}

function AstryxRecordResultContent({
  onCreateFieldIntent,
  onCreateIntent,
  onIntent,
  recordResult,
  spacing,
}: {
  onCreateFieldIntent: CreateFieldIntentHandler;
  onCreateIntent: CreateIntentHandler;
  onIntent: RecordResultIntentHandler;
  recordResult: RecordResultContract;
  spacing: ReturnType<typeof astryxRecordResultSpacing>;
}) {
  if (recordResult.availability.state === "empty") {
    return recordResult.emptyState ? (
      <>
        <EmptyState
          actions={
            recordResult.emptyState.action ? (
              <AstryxRecordResultEmptyStatePrimaryAction
                action={recordResult.emptyState.action}
                onCreateFieldIntent={onCreateFieldIntent}
                onCreateIntent={onCreateIntent}
                onIntent={onIntent}
                recordId={recordResult.selectedRecord?.id}
                recordResult={recordResult}
              />
            ) : undefined
          }
          description={recordResult.emptyState.description}
          isCompact={recordResult.density === "compact"}
          title={recordResult.emptyState.title}
        />
        {recordResult.emptyState.action?.kind === "operationAction" ? (
          <AstryxRecordResultActionEffects
            action={recordResult.emptyState.action}
            onIntent={onIntent}
            recordId={recordResult.selectedRecord?.id}
            recordResult={recordResult}
          />
        ) : null}
      </>
    ) : null;
  }

  if (recordResult.availability.state === "unavailable") {
    return (
      <EmptyState
        isCompact={recordResult.density === "compact"}
        title={recordResult.availability.message}
      />
    );
  }

  const selectedRecord = recordResult.selectedRecord;

  if (!selectedRecord) {
    return (
      <EmptyState
        isCompact={recordResult.density === "compact"}
        title={recordResult.accessibilityLabel}
      />
    );
  }

  return (
    <Card padding={spacing.padding} width="100%">
      <VStack
        as="article"
        aria-label={selectedRecord.accessibilityLabel}
        gap={spacing.gap}
        width="100%"
      >
        {recordResult.editing.enabled ? null : (
          <Banner container="card" status="info" title={recordResult.editing.disabledReason} />
        )}
        {recordResult.warnings.map((warning) => {
          const firstWarning = warning.items[0];
          const otherIssueCount = Math.max(0, warning.items.length - 1);
          const title = firstWarning
            ? `${firstWarning.message}${
                otherIssueCount > 0
                  ? ` and ${otherIssueCount} other issue${otherIssueCount === 1 ? "" : "s"}`
                  : ""
              }`
            : warning.title;

          return <Banner container="card" key={warning.id} status="warning" title={title} />;
        })}
        <VStack gap={spacing.fieldGap} width="100%">
          {recordResult.fields.map((field) => (
            <FieldRenderer
              field={astryxRecordResultFieldPresentation(field, recordResult)}
              key={field.fieldId}
              onIntent={(intent) =>
                dispatchAstryxRecordResultFieldIntent(
                  onIntent,
                  recordResult,
                  selectedRecord.id,
                  field,
                  intent,
                )
              }
            />
          ))}
        </VStack>
        <AstryxRecordResultActionGroup
          onIntent={onIntent}
          recordId={selectedRecord.id}
          recordResult={recordResult}
        />
      </VStack>
    </Card>
  );
}

function AstryxRecordResultEmptyStatePrimaryAction({
  action,
  onCreateFieldIntent,
  onCreateIntent,
  onIntent,
  recordId,
  recordResult,
}: {
  action: CollectionEmptyStatePrimaryActionContract;
  onCreateFieldIntent: CreateFieldIntentHandler;
  onCreateIntent: CreateIntentHandler;
  onIntent: RecordResultIntentHandler;
  recordId: string | undefined;
  recordResult: RecordResultContract;
}) {
  return action.kind === "createAction" ? (
    <AstryxCreateSurfaceRenderer
      onFieldIntent={onCreateFieldIntent}
      onIntent={onCreateIntent}
      surface={action.surface}
    />
  ) : (
    <AstryxRecordResultActionButton
      action={action}
      onIntent={onIntent}
      recordId={recordId}
      recordResult={recordResult}
    />
  );
}

function astryxRecordResultFieldPresentation(
  field: FieldContract,
  recordResult: RecordResultContract,
) {
  if (
    recordResult.editing.enabled ||
    field.access.kind !== "disabled" ||
    field.access.disabledReason !== recordResult.editing.disabledReason
  ) {
    return field;
  }

  return {
    ...field,
    access: {
      canPatch: false as const,
      kind: "disabled" as const,
      writable: true as const,
    },
  };
}

function AstryxRecordResultActionGroup({
  onIntent,
  recordId,
  recordResult,
}: {
  onIntent: RecordResultIntentHandler;
  recordId: string;
  recordResult: RecordResultContract;
}) {
  const actions = [...recordResult.actions.primary, ...recordResult.actions.secondary];
  const secondaryItems = astryxRecordResultSecondaryItems(recordResult, recordId, onIntent);

  if (actions.length === 0) {
    return null;
  }

  return (
    <>
      <Divider isFullBleed />
      <HStack align="center" gap={1} justify="end" width="100%" wrap="wrap">
        {recordResult.actions.primary.map((action) => (
          <AstryxRecordResultActionButton
            action={action}
            key={action.control.id}
            onIntent={onIntent}
            recordId={recordId}
            recordResult={recordResult}
          />
        ))}
        {secondaryItems.length > 0 ? (
          <MoreMenu
            items={secondaryItems}
            label={recordResult.actions.secondaryAccessibilityLabel}
            size={recordResult.density === "compact" ? "sm" : "md"}
            variant="ghost"
          />
        ) : null}
      </HStack>
      {actions.map((action) => (
        <AstryxRecordResultActionEffects
          action={action}
          key={`${action.control.id}:effects`}
          onIntent={onIntent}
          recordId={recordId}
          recordResult={recordResult}
        />
      ))}
    </>
  );
}

function AstryxRecordResultActionButton({
  action,
  onIntent,
  recordId,
  recordResult,
}: {
  action: RecordResultActionContract;
  onIntent: RecordResultIntentHandler;
  recordId: string | undefined;
  recordResult: RecordResultContract;
}) {
  const handleIntent = (intent: OperationPresentationIntent) =>
    dispatchAstryxRecordResultOperationIntent(onIntent, recordResult, recordId, action, intent);

  return action.control.progress ? (
    <AstryxOperationButtonWithProgress
      button={action.control.trigger}
      onIntent={handleIntent}
      progress={action.control.progress}
    />
  ) : (
    <AstryxOperationButton button={action.control.trigger} onIntent={handleIntent} />
  );
}

function AstryxRecordResultActionEffects({
  action,
  onIntent,
  recordId,
  recordResult,
}: {
  action: RecordResultActionContract;
  onIntent: RecordResultIntentHandler;
  recordId: string | undefined;
  recordResult: RecordResultContract;
}) {
  const handleIntent = (intent: OperationPresentationIntent) =>
    dispatchAstryxRecordResultOperationIntent(onIntent, recordResult, recordId, action, intent);

  return (
    <>
      {action.control.confirmation ? (
        <AstryxOperationDestructiveConfirmation
          confirmation={action.control.confirmation}
          onIntent={handleIntent}
        />
      ) : null}
      <AstryxOperationFeedback feedback={action.control.feedback} />
    </>
  );
}

export function astryxRecordResultSpacing(density: RecordResultContract["density"]) {
  return density === "compact"
    ? ({ fieldGap: 2, gap: 2, padding: 3 } as const)
    : ({ fieldGap: 4, gap: 4, padding: 4 } as const);
}

export function astryxRecordResultSecondaryItems(
  recordResult: RecordResultContract,
  recordId: string | undefined,
  onIntent: RecordResultIntentHandler,
): DropdownMenuOption[] {
  return recordResult.actions.secondary.map((action) => {
    const trigger = action.control.trigger;

    return {
      icon: trigger.content.kind === "label" ? undefined : operationIcon(trigger.content.icon),
      isDisabled: astryxRecordResultActionDisabled(action),
      label: astryxRecordResultActionLabel(action),
      onClick: () => {
        if (astryxRecordResultActionDisabled(action)) {
          return;
        }

        void dispatchAstryxRecordResultOperationIntent(
          onIntent,
          recordResult,
          recordId,
          action,
          trigger.intent,
        );
      },
    };
  });
}

export function dispatchAstryxRecordResultFieldIntent(
  handler: RecordResultIntentHandler,
  recordResult: RecordResultContract,
  recordId: string,
  field: FieldContract,
  intent: FieldIntent,
) {
  return handler({
    fieldId: field.fieldId,
    intent,
    recordId,
    resultId: recordResult.id,
    type: "recordResultFieldIntent",
  });
}

export function dispatchAstryxRecordResultOperationIntent(
  handler: RecordResultIntentHandler,
  recordResult: RecordResultContract,
  recordId: string | undefined,
  action: RecordResultActionContract,
  intent: OperationPresentationIntent,
) {
  return handler({
    controlId: action.control.id,
    intent,
    ...(recordId === undefined ? {} : { recordId }),
    resultId: recordResult.id,
    type: "recordResultOperationIntent",
  });
}

function ignoreCreateFieldIntent() {}

function ignoreCreateIntent() {}

function astryxRecordResultActionLabel(action: RecordResultActionContract) {
  const trigger = action.control.trigger;
  const label =
    trigger.pending?.label ??
    (trigger.content.kind === "iconOnly" ? trigger.accessibilityLabel : trigger.content.label);

  return trigger.disabledReason && trigger.disabledReason !== label
    ? `${label} — ${trigger.disabledReason}`
    : label;
}

function astryxRecordResultActionDisabled(action: RecordResultActionContract) {
  return Boolean(action.control.trigger.disabled || action.control.trigger.pending?.isPending);
}
