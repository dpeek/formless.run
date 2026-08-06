import { Banner } from "@astryxdesign/core/Banner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { VStack } from "@astryxdesign/core/VStack";
import type {
  CollectionEmptyStatePrimaryActionContract,
  CreateFieldIntentHandler,
  CreateIntentHandler,
  OperationPresentationIntent,
  TreeIntent,
  TreeIntentHandler,
  TreeItemContract,
  TreeResultContract,
  TreeResultReference,
  WorkspaceIntentHandler,
  WorkspaceIntentScope,
} from "@dpeek/formless-presentation/contract";
import { useTreeResult, useWorkspaceIntentHandler } from "@dpeek/formless-presentation/host/react";
import { AstryxTreeResultSignals } from "./tree-actions.tsx";
import { AstryxTreeChildCreation } from "./tree-child-creation.tsx";
import { AstryxTreeOutline } from "./tree-outline.tsx";
import { AstryxTreeSelectedEditor } from "./tree-selected-editor.tsx";
import { AstryxCreateSurfaceRenderer } from "./create-renderer.tsx";
import {
  AstryxOperationButton,
  AstryxOperationButtonWithProgress,
  AstryxOperationDestructiveConfirmation,
  AstryxOperationFeedback,
} from "./operation-renderer.tsx";

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
          ? onIntent({
              ...scope,
              intent,
              surfaceId: action.surface.id,
              type: "workspaceCreate",
            })
          : undefined;
      }}
      onIntent={(intent) => {
        const action =
          tree.availability.state === "empty" ? tree.availability.emptyState.action : undefined;
        return action?.kind === "operationAction" &&
          intent.type === "treeOperation" &&
          intent.controlId === action.control.id
          ? onIntent({
              ...scope,
              controlId: action.control.id,
              intent: intent.intent,
              type: "workspaceOperation",
            })
          : dispatchAstryxWorkspaceTreeIntent(onIntent, scope, tree.id, intent);
      }}
      tree={tree}
    />
  ) : null;
}

export function AstryxTreeResultRenderer({
  onCreateFieldIntent = ignoreCreateFieldIntent,
  onCreateIntent = ignoreCreateIntent,
  onIntent = ignoreTreeIntent,
  tree,
}: {
  onCreateFieldIntent?: CreateFieldIntentHandler;
  onCreateIntent?: CreateIntentHandler;
  onIntent?: TreeIntentHandler;
  tree: TreeResultContract;
}) {
  if (tree.availability.state === "empty") {
    return (
      <VStack gap={3} width="100%">
        <EmptyState
          actions={
            tree.availability.emptyState.action ? (
              <AstryxTreeEmptyStatePrimaryAction
                action={tree.availability.emptyState.action}
                onCreateFieldIntent={onCreateFieldIntent}
                onCreateIntent={onCreateIntent}
                onIntent={onIntent}
                resultId={tree.id}
              />
            ) : undefined
          }
          description={tree.availability.emptyState.description}
          title={tree.availability.emptyState.title}
        />
        {tree.rootChildCreation ? (
          <AstryxTreeChildCreation
            creation={tree.rootChildCreation}
            onIntent={onIntent}
            parent={{ kind: "root" }}
            resultId={tree.id}
          />
        ) : null}
      </VStack>
    );
  }

  if (tree.availability.state === "unavailable") {
    return <Banner container="card" status="warning" title={tree.availability.message} />;
  }

  const selectedItem = findSelectedTreeItem(tree.items);

  return (
    <Grid
      aria-label={tree.accessibilityLabel}
      columns={{ max: 2, minWidth: 320, repeat: "fit" }}
      data-formless-astryx-tree-layout={tree.id}
      gap={5}
      width="100%"
    >
      <VStack gap={3} width="100%">
        <AstryxTreeResultSignals tree={tree} />
        <AstryxTreeOutline onIntent={onIntent} tree={tree} />
        {tree.rootChildCreation ? (
          <AstryxTreeChildCreation
            creation={tree.rootChildCreation}
            onIntent={onIntent}
            parent={{ kind: "root" }}
            resultId={tree.id}
          />
        ) : null}
      </VStack>
      <AstryxTreeSelectedEditor
        editor={tree.selectedEditor}
        onIntent={onIntent}
        selectedItem={selectedItem}
        tree={tree}
      />
    </Grid>
  );
}

function AstryxTreeEmptyStatePrimaryAction({
  action,
  onCreateFieldIntent,
  onCreateIntent,
  onIntent,
  resultId,
}: {
  action: CollectionEmptyStatePrimaryActionContract;
  onCreateFieldIntent: CreateFieldIntentHandler;
  onCreateIntent: CreateIntentHandler;
  onIntent: TreeIntentHandler;
  resultId: string;
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

  const dispatch = (intent: OperationPresentationIntent) =>
    onIntent({
      controlId: action.control.id,
      intent,
      resultId,
      type: "treeOperation",
    });

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

function findSelectedTreeItem(items: readonly TreeItemContract[]): TreeItemContract | undefined {
  for (const item of items) {
    if (item.selected) {
      return item;
    }
    const selectedChild = findSelectedTreeItem(item.children);
    if (selectedChild) {
      return selectedChild;
    }
  }
  return undefined;
}

function ignoreTreeIntent() {}

function ignoreCreateFieldIntent() {}

function ignoreCreateIntent() {}
