import { Banner } from "@astryxdesign/core/Banner";
import type { DropdownMenuOption } from "@astryxdesign/core/DropdownMenu";
import { HStack } from "@astryxdesign/core/HStack";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { VStack } from "@astryxdesign/core/VStack";
import type {
  OperationControlContract,
  OperationPresentationIntent,
  TreeIntentHandler,
  TreeItemContract,
  TreeOrderingActionContract,
  TreeOrderingContract,
  TreeResultContract,
  TreeSelectedEditorContract,
  TreeWarningContract,
} from "@dpeek/formless-presentation/contract";
import {
  AstryxOperationButton,
  AstryxOperationButtonWithProgress,
  AstryxOperationCompactStatus,
  AstryxOperationDestructiveConfirmation,
  AstryxOperationFeedback,
} from "./operation-renderer.tsx";

export function AstryxTreeSelectedActions({
  editor,
  item,
  onIntent,
  resultId,
}: {
  editor: TreeSelectedEditorContract;
  item: TreeItemContract | undefined;
  onIntent: TreeIntentHandler;
  resultId: string;
}) {
  const ordering = item?.id === editor.itemId ? item.ordering : undefined;
  const removePlacement = editor.removePlacement;

  if (!ordering && !removePlacement) {
    return null;
  }

  return (
    <VStack
      aria-label={`${editor.accessibilityLabel} actions`}
      data-formless-astryx-tree-actions={editor.itemId}
      gap={2}
      width="100%"
    >
      <HStack align="center" gap={2} justify="end" width="100%" wrap="wrap">
        {ordering && item ? (
          <AstryxTreeOrderingMenu item={item} onIntent={onIntent} ordering={ordering} />
        ) : null}
        {removePlacement ? (
          <AstryxTreeRemovePlacementButton
            control={removePlacement}
            editor={editor}
            onIntent={onIntent}
            resultId={resultId}
          />
        ) : null}
      </HStack>
      {removePlacement && removePlacement.status.status !== "idle" ? (
        <AstryxOperationCompactStatus status={removePlacement.status} />
      ) : null}
      {removePlacement ? (
        <AstryxTreeRemovePlacementEffects
          control={removePlacement}
          editor={editor}
          onIntent={onIntent}
          resultId={resultId}
        />
      ) : null}
    </VStack>
  );
}

export function AstryxTreeResultSignals({ tree }: { tree: TreeResultContract }) {
  const hasVisibleSignals = tree.status !== undefined || tree.warnings.length > 0;

  return (
    <>
      {hasVisibleSignals ? (
        <VStack gap={2} width="100%">
          <AstryxTreeWarnings warnings={tree.warnings} />
          {tree.status ? <AstryxOperationCompactStatus status={tree.status} /> : null}
        </VStack>
      ) : null}
      {tree.feedback.map((feedback) => (
        <AstryxOperationFeedback feedback={feedback} key={feedback.id} />
      ))}
    </>
  );
}

export function AstryxTreeSelectedDiagnostics({
  editor,
  item,
}: {
  editor: TreeSelectedEditorContract;
  item: TreeItemContract | undefined;
}) {
  const structure = item?.id === editor.itemId ? item.structure : undefined;

  return (
    <VStack
      aria-label={`${editor.accessibilityLabel} diagnostics`}
      data-formless-astryx-tree-diagnostics={editor.itemId}
      gap={2}
      width="100%"
    >
      <AstryxTreeWarnings warnings={editor.warnings} />
      {structure && "message" in structure ? (
        <Banner container="card" status="warning" title={structure.message} />
      ) : null}
      {editor.availability.available ? null : (
        <Banner container="card" status="warning" title={editor.availability.message} />
      )}
      {editor.editing.enabled ? null : (
        <Banner container="card" status="info" title={editor.editing.disabledReason} />
      )}
    </VStack>
  );
}

export function AstryxTreeWarnings({ warnings }: { warnings: readonly TreeWarningContract[] }) {
  return warnings.map((warning) => (
    <Banner
      container="card"
      data-formless-astryx-tree-warning={warning.id}
      data-formless-astryx-tree-warning-source={warning.source}
      description={warning.items.map((item) => item.message).join(" ") || undefined}
      key={warning.id}
      status="warning"
      title={warning.title}
    />
  ));
}

export function astryxTreeOrderingMenuItems(
  ordering: TreeOrderingContract,
  item: TreeItemContract,
  onIntent: TreeIntentHandler,
): Array<{
  isDisabled: boolean;
  label: string;
  onClick: () => Promise<void> | void;
}> {
  const items = ordering.actions
    .filter((action) => action.structurallyAvailable)
    .map((action) => ({
      isDisabled: astryxTreeOrderingActionDisabled(ordering, action),
      label: astryxTreeOrderingActionLabel(action),
      onClick: () => dispatchAstryxTreeOrderingIntent(onIntent, ordering, item, action),
    }));

  return items satisfies DropdownMenuOption[];
}

export function dispatchAstryxTreeOrderingIntent(
  onIntent: TreeIntentHandler,
  ordering: TreeOrderingContract,
  item: TreeItemContract,
  action: TreeOrderingActionContract,
) {
  if (
    !action.structurallyAvailable ||
    astryxTreeOrderingActionDisabled(ordering, action) ||
    action.intent.actionId !== action.id ||
    action.intent.itemId !== item.id
  ) {
    return;
  }

  return onIntent(action.intent);
}

export function dispatchAstryxTreeOperationIntent(
  onIntent: TreeIntentHandler,
  resultId: string,
  editor: TreeSelectedEditorContract,
  control: OperationControlContract,
  intent: OperationPresentationIntent,
) {
  if (intent.controlId !== control.id) {
    return;
  }

  return onIntent({
    controlId: control.id,
    intent,
    itemId: editor.itemId,
    resultId,
    type: "treeOperation",
  });
}

function AstryxTreeOrderingMenu({
  item,
  onIntent,
  ordering,
}: {
  item: TreeItemContract;
  onIntent: TreeIntentHandler;
  ordering: TreeOrderingContract;
}) {
  const items = astryxTreeOrderingMenuItems(ordering, item, onIntent);

  return items.length > 0 ? (
    <MoreMenu items={items} label={ordering.accessibilityLabel} size="sm" variant="ghost" />
  ) : null;
}

function AstryxTreeRemovePlacementButton({
  control,
  editor,
  onIntent,
  resultId,
}: {
  control: OperationControlContract;
  editor: TreeSelectedEditorContract;
  onIntent: TreeIntentHandler;
  resultId: string;
}) {
  const handleIntent = (intent: OperationPresentationIntent) =>
    dispatchAstryxTreeOperationIntent(onIntent, resultId, editor, control, intent);

  return control.progress ? (
    <AstryxOperationButtonWithProgress
      button={control.trigger}
      onIntent={handleIntent}
      progress={control.progress}
    />
  ) : (
    <AstryxOperationButton button={control.trigger} onIntent={handleIntent} />
  );
}

function AstryxTreeRemovePlacementEffects({
  control,
  editor,
  onIntent,
  resultId,
}: {
  control: OperationControlContract;
  editor: TreeSelectedEditorContract;
  onIntent: TreeIntentHandler;
  resultId: string;
}) {
  const handleIntent = (intent: OperationPresentationIntent) =>
    dispatchAstryxTreeOperationIntent(onIntent, resultId, editor, control, intent);

  return (
    <>
      {control.confirmation ? (
        <AstryxOperationDestructiveConfirmation
          confirmation={control.confirmation}
          onIntent={handleIntent}
        />
      ) : null}
      <AstryxOperationFeedback feedback={control.feedback} />
    </>
  );
}

function astryxTreeOrderingActionLabel(action: TreeOrderingActionContract) {
  const label = action.pending?.label ?? action.label;

  return action.disabledReason && action.disabledReason !== label
    ? `${label} — ${action.disabledReason}`
    : label;
}

function astryxTreeOrderingActionDisabled(
  ordering: TreeOrderingContract,
  action: TreeOrderingActionContract,
) {
  return Boolean(ordering.pending || action.disabled || action.pending?.isPending);
}
