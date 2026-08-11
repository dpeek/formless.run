import { Banner } from "@astryxdesign/core/Banner";
import type { DropdownMenuItemData } from "@astryxdesign/core/DropdownMenu";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { VStack } from "@astryxdesign/core/VStack";
import type {
  ButtonContract,
  CollectionEmptyStatePrimaryActionContract,
  CreateFieldIntentHandler,
  CreateIntent,
  CreateIntentHandler,
  FieldIntent,
  OperationControlContract,
  OperationPresentationIntent,
  OperationPresentationIntentHandler,
  RecordResultIntent,
  TreeChildCreationContract,
  TreeChildVariantContract,
  TreeContextActionContract,
  TreeIntent,
  TreeIntentHandler,
  TreeNodeContract,
  TreeOperationActionContract,
  TreeOrderingActionContract,
  TreeOrderingContract,
  TreeResultContract,
  TreeResultReference,
  TreeWarningContract,
  WorkspaceIntentHandler,
  WorkspaceIntentScope,
} from "@dpeek/formless-presentation/contract";
import { useTreeResult, useWorkspaceIntentHandler } from "@dpeek/formless-presentation/host/react";
import { AstryxCreateSurfaceRenderer } from "./create-renderer.tsx";
import {
  AstryxOperationButton,
  AstryxOperationButtonWithProgress,
  AstryxOperationCompactStatus,
  AstryxOperationDestructiveConfirmation,
  AstryxOperationFeedback,
  AstryxOperationProgress,
  operationIcon,
} from "./operation-renderer.tsx";
import { AstryxRecursiveRecordNode } from "./recursive-record-node.tsx";
import { semanticIcon } from "./semantic-icon.tsx";

export function AstryxSubscribedTreeResultRenderer({
  reference,
  scope,
}: {
  reference: TreeResultReference;
  scope: WorkspaceIntentScope;
}) {
  const tree = useTreeResult(reference);
  const onIntent = useWorkspaceIntentHandler();

  return tree ? (
    <AstryxTreeResultRenderer
      onCreateFieldIntent={(fieldId, intent) => {
        const action =
          tree.availability.state === "empty" ? tree.availability.emptyState.action : undefined;
        return action?.kind === "createAction"
          ? onIntent({
              ...scope,
              fieldId,
              intent,
              surfaceId: action.surface.id,
              type: "workspaceField",
            })
          : undefined;
      }}
      onCreateIntent={(intent) => {
        const action =
          tree.availability.state === "empty" ? tree.availability.emptyState.action : undefined;
        return action?.kind === "createAction"
          ? onIntent({ ...scope, intent, surfaceId: action.surface.id, type: "workspaceCreate" })
          : undefined;
      }}
      onEmptyOperationIntent={(controlId, intent) =>
        onIntent({ ...scope, controlId, intent, type: "workspaceOperation" })
      }
      onIntent={(intent) => dispatchAstryxWorkspaceTreeIntent(onIntent, scope, tree.id, intent)}
      tree={tree}
    />
  ) : null;
}

export function AstryxTreeResultRenderer({
  onCreateFieldIntent = ignoreCreateFieldIntent,
  onCreateIntent = ignoreCreateIntent,
  onEmptyOperationIntent = ignoreEmptyOperationIntent,
  onIntent = ignoreTreeIntent,
  tree,
}: {
  onCreateFieldIntent?: CreateFieldIntentHandler;
  onCreateIntent?: CreateIntentHandler;
  onEmptyOperationIntent?: (
    controlId: string,
    intent: OperationPresentationIntent,
  ) => Promise<void> | void;
  onIntent?: TreeIntentHandler;
  tree: TreeResultContract;
}) {
  if (tree.availability.state === "empty") {
    return (
      <EmptyState
        actions={
          tree.availability.emptyState.action ? (
            <AstryxTreeEmptyStatePrimaryAction
              action={tree.availability.emptyState.action}
              onCreateFieldIntent={onCreateFieldIntent}
              onCreateIntent={onCreateIntent}
              onOperationIntent={onEmptyOperationIntent}
            />
          ) : undefined
        }
        description={tree.availability.emptyState.description}
        title={tree.availability.emptyState.title}
      />
    );
  }

  if (tree.availability.state === "unavailable") {
    return <Banner container="card" status="warning" title={tree.availability.message} />;
  }

  if (!tree.root) {
    return <Banner container="card" status="warning" title={tree.accessibilityLabel} />;
  }

  return (
    <VStack aria-label={tree.accessibilityLabel} gap={5} width="100%">
      <AstryxTreeResultSignals tree={tree} />
      <AstryxTreeNode node={tree.root} onIntent={onIntent} root tree={tree} />
    </VStack>
  );
}

function AstryxTreeNode({
  node,
  onIntent,
  root = false,
  tree,
}: {
  node: TreeNodeContract;
  onIntent: TreeIntentHandler;
  root?: boolean;
  tree: TreeResultContract;
}) {
  const headerDetail = [node.variant?.label, node.slot?.label].filter(Boolean).join(" · ");

  return (
    <AstryxRecursiveRecordNode
      accessibilityLabel={node.accessibilityLabel}
      actionMenuAccessibilityLabel={node.headerActions.accessibilityLabel}
      actionMenuItems={astryxTreeActionMenuItems(tree, node, onIntent)}
      editor={node.editor}
      entityTypeLabel={node.entityTypeLabel}
      headerDetail={headerDetail || undefined}
      leadingContent={
        <>
          <AstryxTreeNodeDiagnostics node={node} />
          <AstryxTreeNodeActionEffects node={node} onIntent={onIntent} tree={tree} />
        </>
      }
      onEditorIntent={(intent) =>
        dispatchAstryxTreeRecordResultIntent(onIntent, tree, node, intent)
      }
      root={root}
    >
      {node.children.length > 0 ? (
        <VStack gap={4} width="100%">
          {node.children.map((child) => (
            <AstryxTreeNode key={child.id} node={child} onIntent={onIntent} tree={tree} />
          ))}
        </VStack>
      ) : null}
    </AstryxRecursiveRecordNode>
  );
}

function AstryxTreeNodeActionEffects({
  node,
  onIntent,
  tree,
}: {
  node: TreeNodeContract;
  onIntent: TreeIntentHandler;
  tree: TreeResultContract;
}) {
  return node.headerActions.items.map((action) => {
    if (action.kind === "treeChildCreation") {
      const surface = action.activeCreateSurface;
      return surface ? (
        <AstryxCreateSurfaceRenderer
          key={action.id}
          onFieldIntent={(fieldId, intent) =>
            dispatchAstryxTreeCreateFieldIntent(onIntent, tree, node, action, fieldId, intent)
          }
          onIntent={(intent) =>
            dispatchAstryxTreeCreateIntent(onIntent, tree, node, action, intent)
          }
          renderTrigger={false}
          surface={surface}
        />
      ) : null;
    }

    if (action.kind !== "operationAction") {
      return null;
    }

    const control = action.control;
    const dispatch: OperationPresentationIntentHandler = (intent) =>
      dispatchAstryxTreeOperationIntent(onIntent, tree, node, action, intent);

    return (
      <VStack gap={2} key={control.id} width="100%">
        {control.progress ? <AstryxOperationProgress progress={control.progress} /> : null}
        {control.status.status === "idle" ? null : (
          <AstryxOperationCompactStatus status={control.status} />
        )}
        {control.confirmation ? (
          <AstryxOperationDestructiveConfirmation
            confirmation={control.confirmation}
            onIntent={dispatch}
          />
        ) : null}
        <AstryxOperationFeedback feedback={control.feedback} />
      </VStack>
    );
  });
}

function AstryxTreeNodeDiagnostics({ node }: { node: TreeNodeContract }) {
  const hasDiagnostics =
    node.warnings.length > 0 || "message" in node.structure || !node.availability.available;

  return hasDiagnostics ? (
    <VStack aria-label={`${node.accessibilityLabel} diagnostics`} gap={2} width="100%">
      <AstryxTreeWarnings warnings={node.warnings} />
      {"message" in node.structure ? (
        <Banner container="card" status="warning" title={node.structure.message} />
      ) : null}
      {node.availability.available ? null : (
        <Banner container="card" status="warning" title={node.availability.message} />
      )}
    </VStack>
  ) : null;
}

function AstryxTreeResultSignals({ tree }: { tree: TreeResultContract }) {
  return tree.status || tree.warnings.length > 0 || tree.feedback.length > 0 ? (
    <VStack gap={2} width="100%">
      <AstryxTreeWarnings warnings={tree.warnings} />
      {tree.status ? <AstryxOperationCompactStatus status={tree.status} /> : null}
      {tree.feedback.map((feedback) => (
        <AstryxOperationFeedback feedback={feedback} key={feedback.id} />
      ))}
    </VStack>
  ) : null;
}

function AstryxTreeWarnings({ warnings }: { warnings: readonly TreeWarningContract[] }) {
  return warnings.map((warning) => (
    <Banner
      container="card"
      description={warning.items.map((item) => item.message).join(" ") || undefined}
      key={warning.id}
      status="warning"
      title={warning.title}
    />
  ));
}

export function astryxTreeActionMenuItems(
  tree: TreeResultContract,
  node: TreeNodeContract,
  onIntent: TreeIntentHandler,
): DropdownMenuItemData[] {
  return node.headerActions.items.flatMap((action): DropdownMenuItemData[] => {
    if (action.kind === "treeContextAction") {
      const disabled = treeActionDisabled(node, action);
      return [
        {
          icon:
            action.control.content.kind === "label"
              ? undefined
              : operationIcon(action.control.content.icon),
          isDisabled: disabled,
          label: treeContextActionLabel(action),
          onClick: () => {
            if (!disabled) {
              void onIntent(action.intent);
            }
          },
        },
      ];
    }

    if (action.kind === "treeChildCreation") {
      return action.variants.map((variant) => {
        const disabled = !node.availability.available || !variant.availability.available;
        return {
          icon: semanticIcon("add"),
          isDisabled: disabled,
          label: treeChildVariantLabel(variant),
          onClick: () => {
            if (!disabled) {
              void onIntent(variant.selectionIntent);
            }
          },
        };
      });
    }

    if (action.kind === "treeOrderingAction") {
      return action.actions
        .filter((orderingAction) => orderingAction.structurallyAvailable)
        .map((orderingAction) => {
          const disabled = treeOrderingActionDisabled(node, action, orderingAction);
          return {
            isDisabled: disabled,
            label: treeOrderingActionLabel(orderingAction),
            onClick: () => {
              if (!disabled) {
                void onIntent(orderingAction.intent);
              }
            },
          };
        });
    }

    const disabled = operationActionDisabled(node, action);
    return [
      {
        icon:
          action.control.trigger.content.kind === "label"
            ? undefined
            : operationIcon(action.control.trigger.content.icon),
        isDisabled: disabled,
        label: buttonLabel(action.control.trigger),
        onClick: () => {
          if (!disabled) {
            void dispatchAstryxTreeOperationIntent(
              onIntent,
              tree,
              node,
              action,
              action.control.trigger.intent,
            );
          }
        },
      },
    ];
  });
}

export function dispatchAstryxTreeRecordResultIntent(
  handler: TreeIntentHandler,
  tree: TreeResultContract,
  node: TreeNodeContract,
  intent: RecordResultIntent,
) {
  const editor = node.editor;
  if (
    !editor ||
    intent.resultId !== editor.id ||
    ("recordId" in intent &&
      intent.recordId !== undefined &&
      intent.recordId !== editor.selectedRecord?.id)
  ) {
    return;
  }

  return handler({ intent, nodeId: node.id, resultId: tree.id, type: "treeRecordResult" });
}

export function dispatchAstryxTreeOperationIntent(
  handler: TreeIntentHandler,
  tree: TreeResultContract,
  node: TreeNodeContract,
  action: TreeOperationActionContract,
  intent: OperationPresentationIntent,
) {
  if (intent.controlId !== action.control.id) {
    return;
  }

  return handler({
    controlId: action.control.id,
    intent,
    nodeId: node.id,
    resultId: tree.id,
    type: "treeOperation",
  });
}

export function dispatchAstryxTreeCreateIntent(
  handler: TreeIntentHandler,
  tree: TreeResultContract,
  node: TreeNodeContract,
  action: TreeChildCreationContract,
  intent: CreateIntent,
) {
  const surface = action.activeCreateSurface;
  if (!surface || intent.surfaceId !== surface.id) {
    return;
  }

  return handler({
    intent,
    nodeId: node.id,
    resultId: tree.id,
    surfaceId: surface.id,
    type: "treeCreate",
  });
}

export function dispatchAstryxTreeCreateFieldIntent(
  handler: TreeIntentHandler,
  tree: TreeResultContract,
  node: TreeNodeContract,
  action: TreeChildCreationContract,
  fieldId: string,
  intent: FieldIntent,
) {
  const surface = action.activeCreateSurface;
  if (!surface?.dialog.form.fieldSet.fields.some((field) => field.fieldId === fieldId)) {
    return;
  }

  return handler({
    fieldId,
    intent,
    nodeId: node.id,
    resultId: tree.id,
    surfaceId: surface.id,
    type: "treeCreateField",
  });
}

export function dispatchAstryxWorkspaceTreeIntent(
  handler: WorkspaceIntentHandler,
  scope: WorkspaceIntentScope,
  resultId: string,
  intent: TreeIntent,
) {
  if (intent.resultId !== resultId) {
    return;
  }

  return handler({ ...scope, intent, resultId, type: "workspaceTree" });
}

function treeContextActionLabel(action: TreeContextActionContract) {
  const reason = action.availability.available
    ? action.control.disabledReason
    : action.availability.message;
  return withDisabledReason(buttonLabel(action.control), reason);
}

function treeActionDisabled(node: TreeNodeContract, action: TreeContextActionContract) {
  return Boolean(
    !node.availability.available ||
    !action.availability.available ||
    action.control.disabled ||
    action.control.pending?.isPending,
  );
}

function treeChildVariantLabel(variant: TreeChildVariantContract) {
  const label = variant.slot ? `${variant.label} · ${variant.slot.label}` : variant.label;
  return withDisabledReason(
    label,
    variant.availability.available ? undefined : variant.availability.message,
  );
}

function treeOrderingActionDisabled(
  node: TreeNodeContract,
  ordering: TreeOrderingContract,
  action: TreeOrderingActionContract,
) {
  return Boolean(
    !node.availability.available ||
    ordering.pending ||
    action.disabled ||
    action.pending?.isPending,
  );
}

function treeOrderingActionLabel(action: TreeOrderingActionContract) {
  return withDisabledReason(action.pending?.label ?? action.label, action.disabledReason);
}

function operationActionDisabled(node: TreeNodeContract, action: TreeOperationActionContract) {
  return Boolean(
    !node.availability.available ||
    action.control.trigger.disabled ||
    action.control.trigger.pending?.isPending,
  );
}

function buttonLabel(button: ButtonContract | OperationControlContract["trigger"]) {
  const label =
    button.pending?.label ??
    (button.content.kind === "iconOnly" ? button.accessibilityLabel : button.content.label);
  return withDisabledReason(label, button.disabledReason);
}

function withDisabledReason(label: string, reason: string | undefined) {
  return reason && reason !== label ? `${label} — ${reason}` : label;
}

function AstryxTreeEmptyStatePrimaryAction({
  action,
  onCreateFieldIntent,
  onCreateIntent,
  onOperationIntent,
}: {
  action: CollectionEmptyStatePrimaryActionContract;
  onCreateFieldIntent: CreateFieldIntentHandler;
  onCreateIntent: CreateIntentHandler;
  onOperationIntent: (
    controlId: string,
    intent: OperationPresentationIntent,
  ) => Promise<void> | void;
}) {
  if (action.kind === "createAction") {
    return (
      <AstryxCreateSurfaceRenderer
        onFieldIntent={onCreateFieldIntent}
        onIntent={onCreateIntent}
        surface={action.surface}
      />
    );
  }

  const dispatch: OperationPresentationIntentHandler = (intent) =>
    onOperationIntent(action.control.id, intent);

  return (
    <VStack gap={2}>
      {action.control.progress ? (
        <AstryxOperationButtonWithProgress
          button={action.control.trigger}
          onIntent={dispatch}
          progress={action.control.progress}
        />
      ) : (
        <AstryxOperationButton button={action.control.trigger} onIntent={dispatch} />
      )}
      {action.control.confirmation ? (
        <AstryxOperationDestructiveConfirmation
          confirmation={action.control.confirmation}
          onIntent={dispatch}
        />
      ) : null}
      <AstryxOperationFeedback feedback={action.control.feedback} />
    </VStack>
  );
}

function ignoreTreeIntent() {}

function ignoreCreateFieldIntent() {}

function ignoreCreateIntent() {}

function ignoreEmptyOperationIntent() {}
