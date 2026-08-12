import type { DropdownMenuItemData } from "@astryxdesign/core/DropdownMenu";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Heading } from "@astryxdesign/core/Text";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { OverflowList } from "@astryxdesign/core/OverflowList";
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
  RelationshipHierarchyLinkActionContract,
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
import { Fragment } from "react";
import { AstryxCreateSurfaceRenderer } from "./create-renderer.tsx";
import {
  AstryxOperationButton,
  AstryxOperationCompactStatus,
  AstryxOperationDestructiveConfirmation,
  AstryxOperationFeedback,
  AstryxOperationProgress,
  operationIcon,
} from "./operation-renderer.tsx";
import { AstryxRecursiveRecordNode } from "./recursive-record-node.tsx";
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
  return (
    <AstryxRecursiveRecordNode
      accessibilityLabel={node.accessibilityLabel}
      actionMenuAccessibilityLabel={node.headerActions.accessibilityLabel}
      actionMenuItems={[]}
      editor={node.editor}
      entityTypeLabel={node.entityTypeLabel}
      headerActions={
        <AstryxRelationshipHierarchyActionList
          actionGroup={node.headerActions}
          forceLabelledContent
          hierarchy={hierarchy}
          node={node}
          onIntent={onIntent}
        />
      }
      leadingContent={
        <AstryxRelationshipHierarchyActionEffects
          actionGroup={node.headerActions}
          hierarchy={hierarchy}
          node={node}
          onIntent={onIntent}
        />
      }
      onEditorIntent={(intent) =>
        dispatchAstryxRelationshipHierarchyRecordResultIntent(onIntent, hierarchy, node, intent)
      }
      root={root}
    >
      {node.relationshipGroups.map((group) => (
        <AstryxRelationshipHierarchyGroup
          group={group}
          hierarchy={hierarchy}
          key={group.id}
          node={node}
          onIntent={onIntent}
        />
      ))}
    </AstryxRecursiveRecordNode>
  );
}

function AstryxRelationshipHierarchyGroup({
  group,
  hierarchy,
  node,
  onIntent,
}: {
  group: RelationshipHierarchyNodeContract["relationshipGroups"][number];
  hierarchy: RelationshipHierarchyContract;
  node: RelationshipHierarchyNodeContract;
  onIntent: RelationshipHierarchyIntentHandler;
}) {
  const hasActions = group.headerActions.items.length > 0;
  const hasHeading = group.label !== undefined || hasActions;

  if (!hasHeading && group.nodes.length === 0) {
    return null;
  }

  return (
    <VStack
      {...(hasHeading ? { "aria-label": group.accessibilityLabel, as: "section" as const } : {})}
      gap={4}
      width="100%"
    >
      {hasHeading ? (
        <HStack align="center" gap={3} justify="between" width="100%">
          {group.label === undefined ? null : <Heading level={4}>{group.label}</Heading>}
          <AstryxRelationshipHierarchyActionList
            actionGroup={group.headerActions}
            hierarchy={hierarchy}
            node={node}
            onIntent={onIntent}
            relationshipGroupId={group.id}
          />
        </HStack>
      ) : null}
      <AstryxRelationshipHierarchyActionEffects
        actionGroup={group.headerActions}
        hierarchy={hierarchy}
        node={node}
        onIntent={onIntent}
        relationshipGroupId={group.id}
      />
      {group.nodes.map((child) => (
        <AstryxRelationshipHierarchyNode
          hierarchy={hierarchy}
          key={child.id}
          node={child}
          onIntent={onIntent}
        />
      ))}
    </VStack>
  );
}

type AstryxRelationshipHierarchyActionDescriptor = {
  inline: React.ReactElement;
  menuItem: DropdownMenuItemData;
};

function AstryxRelationshipHierarchyActionList({
  actionGroup,
  forceLabelledContent = false,
  hierarchy,
  node,
  onIntent,
  relationshipGroupId,
}: {
  actionGroup: RelationshipHierarchyNodeContract["headerActions"];
  forceLabelledContent?: boolean;
  hierarchy: RelationshipHierarchyContract;
  node: RelationshipHierarchyNodeContract;
  onIntent: RelationshipHierarchyIntentHandler;
  relationshipGroupId?: string;
}) {
  const descriptors = astryxRelationshipHierarchyActionDescriptors({
    actionGroup,
    forceLabelledContent,
    hierarchy,
    node,
    onIntent,
    relationshipGroupId,
  });

  if (descriptors.length === 0) {
    return null;
  }

  return (
    <OverflowList
      aria-label={actionGroup.accessibilityLabel}
      collapseFrom="end"
      gap={1}
      minVisibleItems={0}
      overflowRenderer={(overflowItems) => (
        <MoreMenu
          items={overflowItems.flatMap(({ index }) => {
            const descriptor = descriptors[index];
            return descriptor ? [descriptor.menuItem] : [];
          })}
          label={actionGroup.accessibilityLabel}
          size="sm"
          variant="ghost"
        />
      )}
    >
      {descriptors.map(({ inline }) => inline)}
    </OverflowList>
  );
}

function astryxRelationshipHierarchyActionDescriptors({
  actionGroup,
  forceLabelledContent,
  hierarchy,
  node,
  onIntent,
  relationshipGroupId,
}: {
  actionGroup: RelationshipHierarchyNodeContract["headerActions"];
  forceLabelledContent: boolean;
  hierarchy: RelationshipHierarchyContract;
  node: RelationshipHierarchyNodeContract;
  onIntent: RelationshipHierarchyIntentHandler;
  relationshipGroupId?: string;
}): AstryxRelationshipHierarchyActionDescriptor[] {
  return actionGroup.items.map((action) => ({
    inline: (
      <div key={hierarchyActionId(action)}>
        <AstryxRelationshipHierarchyInlineAction
          action={action}
          forceLabelledContent={forceLabelledContent}
          hierarchy={hierarchy}
          node={node}
          onIntent={onIntent}
          relationshipGroupId={relationshipGroupId}
        />
      </div>
    ),
    menuItem: astryxRelationshipHierarchyActionMenuItem(
      hierarchy,
      node,
      action,
      onIntent,
      relationshipGroupId,
    ),
  }));
}

function AstryxRelationshipHierarchyInlineAction({
  action,
  forceLabelledContent,
  hierarchy,
  node,
  onIntent,
  relationshipGroupId,
}: {
  action: RelationshipHierarchyNodeContract["headerActions"]["items"][number];
  forceLabelledContent: boolean;
  hierarchy: RelationshipHierarchyContract;
  node: RelationshipHierarchyNodeContract;
  onIntent: RelationshipHierarchyIntentHandler;
  relationshipGroupId?: string;
}) {
  if (action.kind === "linkAction") {
    const link = action.link;
    const opensInNewTab = link.target === "newTab";

    return (
      <Button
        href={link.availability === "available" ? link.href : undefined}
        isDisabled={link.availability === "unavailable"}
        label={link.accessibilityLabel}
        rel={opensInNewTab && link.availability === "available" ? "noopener noreferrer" : undefined}
        size="sm"
        target={opensInNewTab && link.availability === "available" ? "_blank" : undefined}
        tooltip={link.availability === "unavailable" ? link.unavailableReason : undefined}
        variant={link.prominence}
      >
        {link.label}
      </Button>
    );
  }

  if (action.kind === "createAction") {
    const trigger = action.surface.trigger;
    const content =
      forceLabelledContent && trigger.content.kind === "iconOnly"
        ? {
            icon: trigger.content.icon,
            kind: "iconAndLabel" as const,
            label: trigger.accessibilityLabel,
          }
        : trigger.content;
    const icon = content.kind === "label" ? undefined : semanticIcon(content.icon);
    const disabled = Boolean(trigger.disabled || trigger.pending?.isPending);
    const onClick = () => {
      if (disabled) {
        return;
      }
      void dispatchAstryxRelationshipHierarchyCreateIntent(onIntent, hierarchy, node, action, {
        open: true,
        surfaceId: action.surface.id,
        type: "createOpenChange",
      });
    };
    const tooltip =
      trigger.disabledReason ??
      (content.kind === "iconOnly" ? trigger.accessibilityLabel : undefined);

    if (content.kind === "iconOnly") {
      return (
        <IconButton
          icon={icon}
          isDisabled={disabled}
          isLoading={Boolean(trigger.pending?.isPending)}
          label={trigger.accessibilityLabel}
          onClick={onClick}
          size={trigger.density === "compact" ? "sm" : "md"}
          tooltip={tooltip}
          type={trigger.type}
          variant={trigger.prominence === "quiet" ? "ghost" : trigger.prominence}
        />
      );
    }

    return (
      <Button
        icon={icon}
        isDisabled={disabled}
        isLoading={Boolean(trigger.pending?.isPending)}
        label={trigger.accessibilityLabel}
        onClick={onClick}
        size={trigger.density === "compact" ? "sm" : "md"}
        tooltip={tooltip}
        type={trigger.type}
        variant={trigger.prominence === "quiet" ? "ghost" : trigger.prominence}
      >
        {content.label}
      </Button>
    );
  }

  const trigger = action.control.trigger;
  const labelledTrigger =
    forceLabelledContent && trigger.content.kind === "iconOnly"
      ? {
          ...trigger,
          content: {
            icon: trigger.content.icon,
            kind: "iconAndLabel" as const,
            label: trigger.accessibilityLabel,
          },
        }
      : trigger;

  return (
    <AstryxOperationButton
      button={labelledTrigger}
      onIntent={(intent) =>
        dispatchAstryxRelationshipHierarchyOperationIntent(
          onIntent,
          hierarchy,
          node,
          action,
          intent,
          relationshipGroupId,
        )
      }
    />
  );
}

function AstryxRelationshipHierarchyActionEffects({
  actionGroup,
  hierarchy,
  node,
  onIntent,
  relationshipGroupId,
}: {
  actionGroup: RelationshipHierarchyNodeContract["headerActions"];
  hierarchy: RelationshipHierarchyContract;
  node: RelationshipHierarchyNodeContract;
  onIntent: RelationshipHierarchyIntentHandler;
  relationshipGroupId?: string;
}) {
  return actionGroup.items.map((action) => {
    if (action.kind === "linkAction") {
      return null;
    }

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
      dispatchAstryxRelationshipHierarchyOperationIntent(
        onIntent,
        hierarchy,
        node,
        action,
        intent,
        relationshipGroupId,
      );
    const hasInlineEffects = control.progress !== undefined || control.status.status !== "idle";

    return (
      <Fragment key={control.id}>
        {hasInlineEffects ? (
          <VStack gap={2} width="100%">
            {control.progress ? <AstryxOperationProgress progress={control.progress} /> : null}
            {control.status.status === "idle" ? null : (
              <AstryxOperationCompactStatus status={control.status} />
            )}
          </VStack>
        ) : null}
        {control.confirmation ? (
          <AstryxOperationDestructiveConfirmation
            confirmation={control.confirmation}
            onIntent={dispatch}
          />
        ) : null}
        <AstryxOperationFeedback feedback={control.feedback} />
      </Fragment>
    );
  });
}

export function astryxRelationshipHierarchyActionMenuItems(
  hierarchy: RelationshipHierarchyContract,
  node: RelationshipHierarchyNodeContract,
  onIntent: RelationshipHierarchyIntentHandler,
): DropdownMenuItemData[] {
  return node.headerActions.items.map((action) =>
    astryxRelationshipHierarchyActionMenuItem(hierarchy, node, action, onIntent),
  );
}

function astryxRelationshipHierarchyActionMenuItem(
  hierarchy: RelationshipHierarchyContract,
  node: RelationshipHierarchyNodeContract,
  action: RelationshipHierarchyNodeContract["headerActions"]["items"][number],
  onIntent: RelationshipHierarchyIntentHandler,
  relationshipGroupId?: string,
): DropdownMenuItemData {
  if (action.kind === "linkAction") {
    return astryxRelationshipHierarchyLinkMenuItem(action);
  }

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
        relationshipGroupId,
      );
    },
  };
}

function astryxRelationshipHierarchyLinkMenuItem(
  action: RelationshipHierarchyLinkActionContract,
): DropdownMenuItemData {
  const link = action.link;
  if (link.availability === "unavailable") {
    return {
      isDisabled: true,
      label: `${link.label} — ${link.unavailableReason}`,
    };
  }

  return {
    isDisabled: false,
    label: link.label,
    onClick: () => {
      if (link.target === "newTab") {
        window.open(link.href, "_blank", "noopener,noreferrer");
        return;
      }
      window.location.assign(link.href);
    },
  };
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
  relationshipGroupId?: string,
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
    ...(relationshipGroupId === undefined ? {} : { relationshipGroupId }),
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

function hierarchyActionId(
  action: RelationshipHierarchyNodeContract["headerActions"]["items"][number],
) {
  switch (action.kind) {
    case "createAction":
      return action.surface.id;
    case "linkAction":
      return action.link.id;
    case "operationAction":
      return action.control.id;
  }
}
