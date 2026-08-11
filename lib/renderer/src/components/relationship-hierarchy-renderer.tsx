import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import type { DropdownMenuItemData } from "@astryxdesign/core/DropdownMenu";
import { HStack } from "@astryxdesign/core/HStack";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type {
  CreateIntent,
  FieldIntent,
  OperationPresentationIntent,
  RecordResultIntent,
  RelationshipHierarchyContract,
  RelationshipHierarchyCreateActionContract,
  RelationshipHierarchyIntent,
  RelationshipHierarchyIntentHandler,
  RelationshipHierarchyNodeContract,
  RelationshipHierarchyOperationActionContract,
  RelationshipHierarchyReference,
  WorkspaceIntentHandler,
  WorkspaceIntentScope,
} from "@dpeek/formless-presentation/contract";
import {
  useRelationshipHierarchy,
  useWorkspaceIntentHandler,
} from "@dpeek/formless-presentation/host/react";
import { AstryxCreateSurfaceRenderer } from "./create-renderer.tsx";
import {
  AstryxOperationCompactStatus,
  AstryxOperationDestructiveConfirmation,
  AstryxOperationFeedback,
  AstryxOperationProgress,
  operationIcon,
} from "./operation-renderer.tsx";
import { AstryxRecordResultRenderer } from "./record-result-renderer.tsx";
import { semanticIcon } from "./semantic-icon.tsx";

export function AstryxSubscribedRelationshipHierarchyRenderer({
  reference,
  scope,
}: {
  reference: RelationshipHierarchyReference;
  scope: WorkspaceIntentScope;
}) {
  const hierarchy = useRelationshipHierarchy(reference);
  const onIntent = useWorkspaceIntentHandler();

  return hierarchy ? (
    <AstryxRelationshipHierarchyRenderer
      hierarchy={hierarchy}
      onIntent={(intent) =>
        dispatchAstryxWorkspaceRelationshipHierarchyIntent(onIntent, scope, hierarchy.id, intent)
      }
    />
  ) : null;
}

export function AstryxRelationshipHierarchyRenderer({
  hierarchy,
  onIntent,
}: {
  hierarchy: RelationshipHierarchyContract;
  onIntent: RelationshipHierarchyIntentHandler;
}) {
  return (
    <VStack aria-label={hierarchy.accessibilityLabel} gap={4} width="100%">
      <AstryxRelationshipHierarchyNode
        hierarchy={hierarchy}
        node={hierarchy.root}
        onIntent={onIntent}
        root
      />
    </VStack>
  );
}

function AstryxRelationshipHierarchyNode({
  hierarchy,
  node,
  onIntent,
  root = false,
}: {
  hierarchy: RelationshipHierarchyContract;
  node: RelationshipHierarchyNodeContract;
  onIntent: RelationshipHierarchyIntentHandler;
  root?: boolean;
}) {
  const menuItems = astryxRelationshipHierarchyActionMenuItems(hierarchy, node, onIntent);

  return (
    <Card elevation="med" padding={0} variant={root ? "transparent" : "muted"} width="100%">
      <VStack as="section" aria-label={node.accessibilityLabel} gap={0} width="100%">
        <HStack
          align="center"
          gap={3}
          justify="between"
          paddingBlock={4}
          paddingInline={8}
          width="100%"
        >
          <Text color="secondary" type="supporting">
            {node.entityTypeLabel}
          </Text>
          {menuItems.length > 0 ? (
            <MoreMenu
              items={menuItems}
              label={node.headerActions.accessibilityLabel}
              size="sm"
              variant="ghost"
            />
          ) : null}
        </HStack>
        <Divider isFullBleed />
        <VStack gap={4} padding={8} width="100%">
          <AstryxRelationshipHierarchyActionEffects
            hierarchy={hierarchy}
            node={node}
            onIntent={onIntent}
          />
          <AstryxRecordResultRenderer
            container="inline"
            onIntent={(intent) =>
              dispatchAstryxRelationshipHierarchyRecordResultIntent(
                onIntent,
                hierarchy,
                node,
                intent,
              )
            }
            recordResult={node.editor}
            showActions={false}
          />
          {node.relationshipGroups.map((group) =>
            group.label === undefined && group.nodes.length === 0 ? null : (
              <VStack
                {...(group.label === undefined
                  ? {}
                  : { "aria-label": group.label, as: "section" as const })}
                gap={4}
                key={group.id}
                width="100%"
              >
                {group.label === undefined ? null : <Heading level={4}>{group.label}</Heading>}
                {group.nodes.map((child) => (
                  <AstryxRelationshipHierarchyNode
                    hierarchy={hierarchy}
                    key={child.id}
                    node={child}
                    onIntent={onIntent}
                  />
                ))}
              </VStack>
            ),
          )}
        </VStack>
      </VStack>
    </Card>
  );
}

function AstryxRelationshipHierarchyActionEffects({
  hierarchy,
  node,
  onIntent,
}: {
  hierarchy: RelationshipHierarchyContract;
  node: RelationshipHierarchyNodeContract;
  onIntent: RelationshipHierarchyIntentHandler;
}) {
  return node.headerActions.items.map((action) => {
    if (action.kind === "createAction") {
      return (
        <AstryxCreateSurfaceRenderer
          key={action.surface.id}
          onFieldIntent={(fieldId, intent) =>
            dispatchAstryxRelationshipHierarchyCreateFieldIntent(
              onIntent,
              hierarchy,
              node,
              action,
              fieldId,
              intent,
            )
          }
          onIntent={(intent) =>
            dispatchAstryxRelationshipHierarchyCreateIntent(
              onIntent,
              hierarchy,
              node,
              action,
              intent,
            )
          }
          renderTrigger={false}
          surface={action.surface}
        />
      );
    }

    const control = action.control;
    const dispatch = (intent: OperationPresentationIntent) =>
      dispatchAstryxRelationshipHierarchyOperationIntent(onIntent, hierarchy, node, action, intent);

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

export function astryxRelationshipHierarchyActionMenuItems(
  hierarchy: RelationshipHierarchyContract,
  node: RelationshipHierarchyNodeContract,
  onIntent: RelationshipHierarchyIntentHandler,
): DropdownMenuItemData[] {
  return node.headerActions.items.map((action) => {
    if (action.kind === "createAction") {
      const trigger = action.surface.trigger;
      const disabled = Boolean(trigger.disabled || trigger.pending?.isPending);
      return {
        icon: trigger.content.kind === "label" ? undefined : semanticIcon(trigger.content.icon),
        isDisabled: disabled,
        label: hierarchyActionLabel(trigger),
        onClick: () => {
          if (disabled) {
            return;
          }
          void dispatchAstryxRelationshipHierarchyCreateIntent(onIntent, hierarchy, node, action, {
            open: true,
            surfaceId: action.surface.id,
            type: "createOpenChange",
          });
        },
      };
    }

    const trigger = action.control.trigger;
    const disabled = Boolean(trigger.disabled || trigger.pending?.isPending);
    return {
      icon: trigger.content.kind === "label" ? undefined : operationIcon(trigger.content.icon),
      isDisabled: disabled,
      label: hierarchyActionLabel(trigger),
      onClick: () => {
        if (disabled) {
          return;
        }
        void dispatchAstryxRelationshipHierarchyOperationIntent(
          onIntent,
          hierarchy,
          node,
          action,
          trigger.intent,
        );
      },
    };
  });
}

export function dispatchAstryxRelationshipHierarchyRecordResultIntent(
  handler: RelationshipHierarchyIntentHandler,
  hierarchy: RelationshipHierarchyContract,
  node: RelationshipHierarchyNodeContract,
  intent: RecordResultIntent,
) {
  if (
    intent.resultId !== node.editor.id ||
    ("recordId" in intent && intent.recordId !== undefined && intent.recordId !== node.recordId)
  ) {
    return;
  }

  return handler({
    hierarchyId: hierarchy.id,
    intent,
    occurrenceId: node.id,
    recordId: node.recordId,
    resultId: node.editor.id,
    type: "relationshipHierarchyRecordResult",
  });
}

export function dispatchAstryxRelationshipHierarchyOperationIntent(
  handler: RelationshipHierarchyIntentHandler,
  hierarchy: RelationshipHierarchyContract,
  node: RelationshipHierarchyNodeContract,
  action: RelationshipHierarchyOperationActionContract,
  intent: OperationPresentationIntent,
) {
  if (intent.controlId !== action.control.id) {
    return;
  }

  return handler({
    controlId: action.control.id,
    hierarchyId: hierarchy.id,
    intent,
    occurrenceId: node.id,
    recordId: node.recordId,
    type: "relationshipHierarchyOperation",
  });
}

export function dispatchAstryxRelationshipHierarchyCreateIntent(
  handler: RelationshipHierarchyIntentHandler,
  hierarchy: RelationshipHierarchyContract,
  node: RelationshipHierarchyNodeContract,
  action: RelationshipHierarchyCreateActionContract,
  intent: CreateIntent,
) {
  if (intent.surfaceId !== action.surface.id) {
    return;
  }

  return handler({
    hierarchyId: hierarchy.id,
    intent,
    occurrenceId: node.id,
    relationshipGroupId: action.relationshipGroupId,
    surfaceId: action.surface.id,
    type: "relationshipHierarchyCreate",
  });
}

export function dispatchAstryxRelationshipHierarchyCreateFieldIntent(
  handler: RelationshipHierarchyIntentHandler,
  hierarchy: RelationshipHierarchyContract,
  node: RelationshipHierarchyNodeContract,
  action: RelationshipHierarchyCreateActionContract,
  fieldId: string,
  intent: FieldIntent,
) {
  if (!action.surface.dialog.form.fieldSet.fields.some((field) => field.fieldId === fieldId)) {
    return;
  }

  return handler({
    fieldId,
    hierarchyId: hierarchy.id,
    intent,
    occurrenceId: node.id,
    relationshipGroupId: action.relationshipGroupId,
    surfaceId: action.surface.id,
    type: "relationshipHierarchyCreateField",
  });
}

export function dispatchAstryxWorkspaceRelationshipHierarchyIntent(
  handler: WorkspaceIntentHandler,
  scope: WorkspaceIntentScope,
  hierarchyId: string,
  intent: RelationshipHierarchyIntent,
) {
  return handler({
    ...scope,
    hierarchyId,
    intent,
    type: "workspaceRelationshipHierarchy",
  });
}

function hierarchyActionLabel(
  trigger:
    | RelationshipHierarchyCreateActionContract["surface"]["trigger"]
    | RelationshipHierarchyOperationActionContract["control"]["trigger"],
) {
  const label =
    trigger.pending?.label ??
    (trigger.content.kind === "iconOnly" ? trigger.accessibilityLabel : trigger.content.label);

  return trigger.disabledReason && trigger.disabledReason !== label
    ? `${label} — ${trigger.disabledReason}`
    : label;
}
