import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { List, ListItem, type ListDensity } from "@astryxdesign/core/List";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { Text } from "@astryxdesign/core/Text";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { VStack } from "@astryxdesign/core/VStack";
import type { DropdownMenuOption } from "@astryxdesign/core/DropdownMenu";
import type {
  CollectionEmptyStatePrimaryActionContract,
  CreateFieldIntentHandler,
  CreateIntentHandler,
  FieldContract,
  FieldIntent,
  ListContract,
  ListFieldItemContract,
  ListIntentHandler,
  ListItemContract,
  ListOperationActionContract,
  ListOrderingActionContract,
  ListOrderingContract,
  OperationPresentationIntent,
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

export type AstryxListFieldIntentHandler = (
  itemId: string,
  field: FieldContract,
  intent: FieldIntent,
) => Promise<void> | void;

export type AstryxListOperationIntentHandler = (
  action: ListOperationActionContract,
  intent: OperationPresentationIntent,
) => Promise<void> | void;

export function AstryxListRenderer({
  list,
  onCreateFieldIntent = ignoreCreateFieldIntent,
  onCreateIntent = ignoreCreateIntent,
  onFieldIntent,
  onListIntent,
  onOperationIntent,
  onItemSelect,
  selectedItemId,
}: {
  list: ListContract;
  onCreateFieldIntent?: CreateFieldIntentHandler;
  onCreateIntent?: CreateIntentHandler;
  onFieldIntent: AstryxListFieldIntentHandler;
  onItemSelect?: (item: ListItemContract) => Promise<void> | void;
  onListIntent: ListIntentHandler;
  onOperationIntent: AstryxListOperationIntentHandler;
  selectedItemId?: string | null;
}) {
  return (
    <VStack as="section" aria-label={list.accessibilityLabel} gap={2} width="100%">
      {list.editing.enabled ? null : (
        <Text color="secondary" display="block" role="status" type="supporting">
          {list.editing.disabledReason}
        </Text>
      )}
      {list.items.length === 0 ? (
        list.emptyState ? (
          <>
            <EmptyState
              actions={
                list.emptyState.action ? (
                  <AstryxListEmptyStatePrimaryAction
                    action={list.emptyState.action}
                    onCreateFieldIntent={onCreateFieldIntent}
                    onCreateIntent={onCreateIntent}
                    onOperationIntent={onOperationIntent}
                  />
                ) : undefined
              }
              description={list.emptyState.description}
              isCompact
              title={list.emptyState.title}
            />
            {list.emptyState.action?.kind === "operationAction" ? (
              <AstryxListActionEffects
                action={list.emptyState.action}
                onOperationIntent={onOperationIntent}
              />
            ) : null}
          </>
        ) : null
      ) : (
        <>
          <List
            density={astryxListDensity(list.density)}
            hasDividers
            header={<VisuallyHidden>{list.accessibilityLabel}</VisuallyHidden>}
          >
            {list.items.map((item) => (
              <AstryxListItem
                item={item}
                key={item.id}
                onFieldIntent={onFieldIntent}
                onItemSelect={onItemSelect}
                onListIntent={onListIntent}
                onOperationIntent={onOperationIntent}
                selected={selectedItemId === item.id}
              />
            ))}
          </List>
          {list.items.flatMap((item) =>
            item.presentation === "summary"
              ? []
              : [...item.actions.primary, ...item.actions.secondary].map((action) => (
                  <AstryxListActionEffects
                    action={action}
                    key={`${item.id}:${action.control.id}:effects`}
                    onOperationIntent={onOperationIntent}
                  />
                )),
          )}
        </>
      )}
    </VStack>
  );
}

function AstryxListEmptyStatePrimaryAction({
  action,
  onCreateFieldIntent,
  onCreateIntent,
  onOperationIntent,
}: {
  action: CollectionEmptyStatePrimaryActionContract;
  onCreateFieldIntent: CreateFieldIntentHandler;
  onCreateIntent: CreateIntentHandler;
  onOperationIntent: AstryxListOperationIntentHandler;
}) {
  return action.kind === "createAction" ? (
    <AstryxCreateSurfaceRenderer
      onFieldIntent={onCreateFieldIntent}
      onIntent={onCreateIntent}
      surface={action.surface}
    />
  ) : (
    <AstryxListPrimaryAction action={action} onOperationIntent={onOperationIntent} />
  );
}

function AstryxListItem({
  item,
  onFieldIntent,
  onItemSelect,
  onListIntent,
  onOperationIntent,
  selected,
}: {
  item: ListItemContract;
  onFieldIntent: AstryxListFieldIntentHandler;
  onItemSelect?: (item: ListItemContract) => Promise<void> | void;
  onListIntent: ListIntentHandler;
  onOperationIntent: AstryxListOperationIntentHandler;
  selected: boolean;
}) {
  if (item.presentation === "summary") {
    return (
      <ListItem
        aria-label={item.accessibilityLabel}
        description={item.subtitle}
        isSelected={item.selected ?? false}
        label={item.title}
        onClick={
          onItemSelect && item.selectionIntent
            ? () => {
                void onItemSelect(item);
              }
            : undefined
        }
      />
    );
  }

  return (
    <ListItem
      aria-label={item.accessibilityLabel}
      endContent={
        <HStack align="center" gap={1} wrap="wrap">
          {onItemSelect && item.availability.available ? (
            <Button
              label={`Select ${item.accessibilityLabel}`}
              onClick={() => {
                void onItemSelect(item);
              }}
              size="sm"
              variant="ghost"
            >
              View
            </Button>
          ) : null}
          {item.actions.primary.map((action) => (
            <AstryxListPrimaryAction
              action={action}
              key={action.control.id}
              onOperationIntent={onOperationIntent}
            />
          ))}
          <AstryxListOverflow
            item={item}
            onListIntent={onListIntent}
            onOperationIntent={onOperationIntent}
          />
          <AstryxListWarningIndicator item={item} />
        </HStack>
      }
      isSelected={selected}
      label={
        item.availability.available ? (
          <HStack align="start" gap={2} width="100%" wrap="wrap">
            {item.fields.map((field) => (
              <FieldRenderer
                field={field}
                key={field.fieldId}
                onIntent={(intent) =>
                  dispatchAstryxListFieldIntent(onFieldIntent, item.id, field, intent)
                }
              />
            ))}
          </HStack>
        ) : (
          <Text color="secondary" display="block" type="supporting">
            {item.availability.message}
          </Text>
        )
      }
    />
  );
}

function AstryxListPrimaryAction({
  action,
  onOperationIntent,
}: {
  action: ListOperationActionContract;
  onOperationIntent: AstryxListOperationIntentHandler;
}) {
  const onIntent = (intent: OperationPresentationIntent) => onOperationIntent(action, intent);

  return action.control.progress ? (
    <AstryxOperationButtonWithProgress
      button={action.control.trigger}
      onIntent={onIntent}
      progress={action.control.progress}
    />
  ) : (
    <AstryxOperationButton button={action.control.trigger} onIntent={onIntent} />
  );
}

function AstryxListOverflow({
  item,
  onListIntent,
  onOperationIntent,
}: {
  item: ListFieldItemContract;
  onListIntent: ListIntentHandler;
  onOperationIntent: AstryxListOperationIntentHandler;
}) {
  const items = astryxListOverflowItems(item, onOperationIntent, onListIntent);

  if (items.length === 0) {
    return null;
  }

  return <MoreMenu items={items} label={astryxListOverflowLabel(item)} size="sm" variant="ghost" />;
}

function AstryxListWarningIndicator({ item }: { item: ListFieldItemContract }) {
  const message = item.warnings
    .flatMap((warning) => warning.items.map((warningItem) => warningItem.message))
    .join(" ");

  return message ? (
    <IconButton
      icon={<Icon color="warning" icon="warning" size="sm" />}
      label={message}
      size="sm"
      tooltip={message}
      variant="ghost"
    />
  ) : null;
}

function AstryxListActionEffects({
  action,
  onOperationIntent,
}: {
  action: ListOperationActionContract;
  onOperationIntent: AstryxListOperationIntentHandler;
}) {
  return (
    <>
      {action.control.confirmation ? (
        <AstryxOperationDestructiveConfirmation
          confirmation={action.control.confirmation}
          onIntent={(intent) => onOperationIntent(action, intent)}
        />
      ) : null}
      <AstryxOperationFeedback feedback={action.control.feedback} />
    </>
  );
}

export function astryxListDensity(density: ListContract["density"]): ListDensity {
  return density === "compact" ? "compact" : "balanced";
}

export function astryxListOverflowItems(
  item: ListFieldItemContract,
  onOperationIntent: AstryxListOperationIntentHandler,
  onListIntent: ListIntentHandler,
): DropdownMenuOption[] {
  const actionItems = astryxListSecondaryActionItems(item.actions.secondary, onOperationIntent);
  const orderingItems = item.ordering ? astryxListOrderingItems(item.ordering, onListIntent) : [];

  return actionItems.length > 0 && orderingItems.length > 0
    ? [...actionItems, { type: "divider" }, ...orderingItems]
    : [...actionItems, ...orderingItems];
}

export function astryxListSecondaryActionItems(
  actions: readonly ListOperationActionContract[],
  onOperationIntent: AstryxListOperationIntentHandler,
): DropdownMenuOption[] {
  return actions.map((action) => {
    const trigger = action.control.trigger;

    return {
      icon: trigger.content.kind === "label" ? undefined : operationIcon(trigger.content.icon),
      isDisabled: astryxListOperationActionDisabled(action),
      label: astryxListOperationActionLabel(action),
      onClick: () => dispatchAstryxListOperationAction(onOperationIntent, action),
    };
  });
}

export function astryxListOrderingItems(
  ordering: ListOrderingContract,
  onListIntent: ListIntentHandler,
): DropdownMenuOption[] {
  return ordering.actions
    .filter((action) => action.structurallyAvailable)
    .map((action) => ({
      isDisabled: astryxListOrderingActionDisabled(action),
      label: astryxListOrderingActionLabel(action),
      onClick: () => dispatchAstryxListOrderingIntent(onListIntent, action),
    }));
}

export function dispatchAstryxListFieldIntent(
  handler: AstryxListFieldIntentHandler,
  itemId: string,
  field: FieldContract,
  intent: FieldIntent,
) {
  return handler(itemId, field, intent);
}

export function dispatchAstryxListOperationAction(
  handler: AstryxListOperationIntentHandler,
  action: ListOperationActionContract,
) {
  if (astryxListOperationActionDisabled(action)) {
    return;
  }

  return handler(action, action.control.trigger.intent);
}

export function dispatchAstryxListOrderingIntent(
  handler: ListIntentHandler,
  action: ListOrderingActionContract,
) {
  if (astryxListOrderingActionDisabled(action) || !action.structurallyAvailable) {
    return;
  }

  return handler(action.intent);
}

function astryxListOverflowLabel(item: ListFieldItemContract) {
  return item.actions.secondary.length > 0
    ? item.actions.secondaryAccessibilityLabel
    : (item.ordering?.accessibilityLabel ?? item.actions.secondaryAccessibilityLabel);
}

function astryxListOperationActionLabel(action: ListOperationActionContract) {
  const trigger = action.control.trigger;
  const label =
    trigger.pending?.label ??
    (trigger.content.kind === "iconOnly" ? trigger.accessibilityLabel : trigger.content.label);

  return trigger.disabledReason && trigger.disabledReason !== label
    ? `${label} — ${trigger.disabledReason}`
    : label;
}

function astryxListOrderingActionLabel(action: ListOrderingActionContract) {
  const label = action.pending?.label ?? action.label;

  return action.disabledReason && action.disabledReason !== label
    ? `${label} — ${action.disabledReason}`
    : label;
}

function astryxListOperationActionDisabled(action: ListOperationActionContract) {
  return Boolean(action.control.trigger.disabled || action.control.trigger.pending?.isPending);
}

function astryxListOrderingActionDisabled(action: ListOrderingActionContract) {
  return Boolean(action.disabled || action.pending?.isPending);
}

function ignoreCreateFieldIntent() {}

function ignoreCreateIntent() {}
