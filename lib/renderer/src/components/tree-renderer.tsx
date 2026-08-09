import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import { FolderIcon, FolderOpenIcon } from "@heroicons/react/24/outline";
import * as stylex from "@stylexjs/stylex";
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
import {
  AstryxTreeResultSignals,
  AstryxTreeSelectedActions,
  AstryxTreeSelectedDiagnostics,
} from "./tree-actions.tsx";
import { AstryxTreeChildCreation, AstryxTreeChildCreationTrigger } from "./tree-child-creation.tsx";
import { AstryxTreeFieldSet } from "./tree-selected-editor.tsx";
import { AstryxCreateSurfaceRenderer } from "./create-renderer.tsx";
import {
  AstryxOperationButton,
  AstryxOperationButtonWithProgress,
  AstryxOperationDestructiveConfirmation,
  AstryxOperationFeedback,
} from "./operation-renderer.tsx";

const styles = stylex.create({
  childCards: {
    paddingBlockStart: spacingVars["--spacing-4"],
  },
  inlineNode: {
    marginInline: `calc(${spacingVars["--spacing-8"]} * -1)`,
  },
});

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

  return (
    <VStack
      aria-label={tree.accessibilityLabel}
      data-formless-astryx-tree-layout={tree.id}
      gap={5}
      width="100%"
    >
      <AstryxTreeResultSignals tree={tree} />
      <AstryxTreeRootNode onIntent={onIntent} tree={tree} />
    </VStack>
  );
}

function AstryxTreeRootNode({
  onIntent,
  tree,
}: {
  onIntent: TreeIntentHandler;
  tree: TreeResultContract;
}) {
  const root = tree.root;

  return (
    <Card
      data-formless-astryx-tree-node={root.id}
      elevation="med"
      padding={0}
      variant="transparent"
      width="100%"
    >
      <VStack gap={0} width="100%">
        <HStack
          align="center"
          gap={3}
          justify="between"
          paddingBlock={4}
          paddingInline={8}
          width="100%"
        >
          <HStack align="center" gap={2}>
            <Icon aria-hidden icon={root.childCreation ? FolderOpenIcon : FolderIcon} size="sm" />
            <Text color="secondary" type="supporting">
              {root.typeLabel ?? "Block"}
            </Text>
          </HStack>
          <HStack align="center" gap={1}>
            {root.childCreation ? (
              <AstryxTreeChildCreationTrigger creation={root.childCreation} onIntent={onIntent} />
            ) : null}
            {root.deleteRecord ? (
              <AstryxTreeRootDelete
                control={root.deleteRecord}
                onIntent={onIntent}
                resultId={tree.id}
              />
            ) : null}
          </HStack>
        </HStack>
        <Divider isFullBleed />
        <VStack gap={4} padding={8} width="100%">
          {root.deleteRecord ? (
            <AstryxTreeRootDeleteEffects
              control={root.deleteRecord}
              onIntent={onIntent}
              resultId={tree.id}
            />
          ) : null}
          {root.childFields ? (
            <AstryxTreeFieldSet
              editor={{ itemId: root.id }}
              fieldSet={root.childFields}
              kind="child"
              onIntent={onIntent}
              resultId={tree.id}
              showLabel={false}
            />
          ) : null}
          {tree.items.length > 0 ? (
            <VStack
              gap={4}
              width="100%"
              xstyle={root.childFields ? styles.childCards : undefined}
            >
              {tree.items.map((item) => (
                <AstryxTreeInlineNode item={item} key={item.id} onIntent={onIntent} tree={tree} />
              ))}
            </VStack>
          ) : null}
          {root.childCreation ? (
            <AstryxTreeChildCreation
              creation={root.childCreation}
              onIntent={onIntent}
              parent={{ kind: "root" }}
              renderTrigger={false}
              resultId={tree.id}
            />
          ) : null}
        </VStack>
      </VStack>
    </Card>
  );
}

function AstryxTreeInlineNode({
  item,
  onIntent,
  tree,
}: {
  item: TreeItemContract;
  onIntent: TreeIntentHandler;
  tree: TreeResultContract;
}) {
  const editor = item.editor;
  const disclosure = item.disclosure;
  const expanded = disclosure?.open ?? true;

  return (
    <Card
      data-formless-astryx-tree-node={item.id}
      elevation="med"
      padding={0}
      variant="muted"
      width={`calc(100% + ${spacingVars["--spacing-8"]} * 2)`}
      {...stylex.props(styles.inlineNode)}
    >
      <VStack gap={0} width="100%">
        <HStack
          align="center"
          gap={3}
          justify="between"
          paddingBlock={4}
          paddingInline={8}
          width="100%"
        >
          <HStack align="center" gap={2}>
            {disclosure ? (
              <IconButton
                icon={
                  <Icon
                    aria-hidden
                    icon={disclosure.open ? FolderOpenIcon : FolderIcon}
                    size="sm"
                  />
                }
                label={disclosure.accessibilityLabel}
                onClick={() => void onIntent(disclosure.intent)}
                size="sm"
                variant="ghost"
              />
            ) : (
              <Icon aria-hidden icon={FolderIcon} size="sm" />
            )}
            <Text color="secondary" type="supporting">
              {item.variant?.label ?? "Block"}
            </Text>
          </HStack>
          <HStack align="center" gap={1}>
            {editor?.childCreation ? (
              <AstryxTreeChildCreationTrigger creation={editor.childCreation} onIntent={onIntent} />
            ) : null}
            {editor ? (
              <AstryxTreeSelectedActions
                editor={editor}
                item={item}
                onIntent={onIntent}
                resultId={tree.id}
              />
            ) : null}
          </HStack>
        </HStack>
        <Divider isFullBleed />
        <VStack gap={4} padding={8} width="100%">
          {editor ? <AstryxTreeSelectedDiagnostics editor={editor} item={item} /> : null}
          {expanded && editor?.childFields ? (
            <AstryxTreeFieldSet
              editor={editor}
              fieldSet={editor.childFields}
              kind="child"
              onIntent={onIntent}
              resultId={tree.id}
              showLabel={false}
            />
          ) : null}
          {expanded && item.children.length > 0 ? (
            <VStack
              gap={4}
              width="100%"
              xstyle={editor?.childFields ? styles.childCards : undefined}
            >
              {item.children.map((child) => (
                <AstryxTreeInlineNode item={child} key={child.id} onIntent={onIntent} tree={tree} />
              ))}
            </VStack>
          ) : null}
          {expanded && editor?.childCreation ? (
            <AstryxTreeChildCreation
              creation={editor.childCreation}
              onIntent={onIntent}
              parent={{ itemId: item.id, kind: "item" }}
              renderTrigger={false}
              resultId={tree.id}
            />
          ) : null}
        </VStack>
      </VStack>
    </Card>
  );
}

function AstryxTreeRootDelete({
  control,
  onIntent,
  resultId,
}: {
  control: NonNullable<TreeResultContract["root"]["deleteRecord"]>;
  onIntent: TreeIntentHandler;
  resultId: string;
}) {
  return (
    <AstryxOperationButton
      button={control.trigger}
      onIntent={(intent) =>
        onIntent({ controlId: control.id, intent, resultId, type: "treeOperation" })
      }
    />
  );
}

function AstryxTreeRootDeleteEffects({
  control,
  onIntent,
  resultId,
}: {
  control: NonNullable<TreeResultContract["root"]["deleteRecord"]>;
  onIntent: TreeIntentHandler;
  resultId: string;
}) {
  const dispatch = (intent: OperationPresentationIntent) =>
    onIntent({ controlId: control.id, intent, resultId, type: "treeOperation" });

  return (
    <>
      {control.confirmation ? (
        <AstryxOperationDestructiveConfirmation
          confirmation={control.confirmation}
          onIntent={dispatch}
        />
      ) : null}
      <AstryxOperationFeedback feedback={control.feedback} />
    </>
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

function ignoreTreeIntent() {}

function ignoreCreateFieldIntent() {}

function ignoreCreateIntent() {}
