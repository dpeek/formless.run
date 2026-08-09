import { Card } from "@astryxdesign/core/Card";
import type { DropdownMenuOption } from "@astryxdesign/core/DropdownMenu";
import { Icon, type IconType } from "@astryxdesign/core/Icon";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { Heading } from "@astryxdesign/core/Text";
import { TreeList, type TreeListItemData } from "@astryxdesign/core/TreeList";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import {
  ArrowPathIcon,
  DocumentIcon,
  EllipsisHorizontalCircleIcon,
  FolderIcon,
  QuestionMarkCircleIcon,
} from "@heroicons/react/24/outline";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import type {
  TreeContextActionContract,
  TreeIntentHandler,
  TreeItemContract,
  TreeItemStructureContract,
  TreeResultContract,
} from "@dpeek/formless-presentation/contract";
import { operationIcon } from "./operation-renderer.tsx";

export function AstryxTreeOutline({
  onIntent,
  tree,
}: {
  onIntent: TreeIntentHandler;
  tree: TreeResultContract;
}) {
  return (
    <Card
      aria-label={tree.accessibilityLabel}
      data-formless-astryx-tree-outline={tree.id}
      onClickCapture={(event) => captureAstryxTreeDisclosureClick(event, tree.items, onIntent)}
      onKeyDownCapture={(event) => captureAstryxTreeDisclosureKeyDown(event, tree.items, onIntent)}
      padding={3}
      width="100%"
    >
      <TreeList
        density={tree.density === "compact" ? "compact" : "balanced"}
        header={<Heading level={2}>{tree.root.label}</Heading>}
        items={astryxTreeOutlineItems(tree.items, onIntent)}
      />
    </Card>
  );
}

export function astryxTreeOutlineItems(
  items: readonly TreeItemContract[],
  onIntent: TreeIntentHandler,
): TreeListItemData[] {
  return items.map((item) => astryxTreeOutlineItem(item, onIntent));
}

export function astryxTreeContextMenuItems(
  item: TreeItemContract,
  onIntent: TreeIntentHandler,
): DropdownMenuOption[] {
  return item.contextActions.map((action) => ({
    icon:
      action.control.content.kind === "label"
        ? undefined
        : operationIcon(action.control.content.icon),
    isDisabled: astryxTreeContextActionDisabled(item, action),
    label: astryxTreeContextActionLabel(action),
    onClick: () => dispatchAstryxTreeContextAction(onIntent, item, action),
  }));
}

export function dispatchAstryxTreeItemSelection(
  handler: TreeIntentHandler,
  item: TreeItemContract,
) {
  if (!item.availability.available) {
    return;
  }

  return handler(item.selectionIntent);
}

export function dispatchAstryxTreeContextAction(
  handler: TreeIntentHandler,
  item: TreeItemContract,
  action: TreeContextActionContract,
) {
  if (astryxTreeContextActionDisabled(item, action)) {
    return;
  }

  return handler(action.intent);
}

export function dispatchAstryxTreeDisclosureKeyIntent(
  handler: TreeIntentHandler,
  item: TreeItemContract,
  key: string,
) {
  const disclosure = item.disclosure;
  if (!disclosure || !item.availability.available) {
    return false;
  }

  const shouldChange =
    (key === "ArrowRight" && !disclosure.open && disclosure.intent.open) ||
    (key === "ArrowLeft" && disclosure.open && !disclosure.intent.open);

  if (!shouldChange) {
    return false;
  }

  void handler(disclosure.intent);
  return true;
}

function astryxTreeOutlineItem(
  item: TreeItemContract,
  onIntent: TreeIntentHandler,
): TreeListItemData {
  const contextMenuItems = astryxTreeContextMenuItems(item, onIntent);
  const description = astryxTreeItemDescription(item);

  return {
    children: astryxTreeOutlineItems(item.children, onIntent),
    ...(description ? { description } : {}),
    ...(contextMenuItems.length > 0
      ? {
          endContent: (
            <MoreMenu
              isDisabled={!item.availability.available}
              items={contextMenuItems}
              label={item.contextActions
                .map((action) => action.control.accessibilityLabel)
                .join(", ")}
              size="sm"
              variant="ghost"
            />
          ),
        }
      : {}),
    id: item.id,
    isDisabled: !item.availability.available,
    isExpanded: item.disclosure?.open,
    isSelected: item.selected,
    label: (
      <span>
        <span aria-hidden>{item.label}</span>
        <VisuallyHidden>{item.accessibilityLabel}</VisuallyHidden>
      </span>
    ),
    onClick: () => dispatchAstryxTreeItemSelection(onIntent, item),
    startContent: astryxTreeStructureIcon(item.structure),
  };
}

function astryxTreeItemDescription(item: TreeItemContract) {
  const structuralFact = "message" in item.structure ? item.structure.message : undefined;
  const unavailableMessage = item.availability.available ? undefined : item.availability.message;

  return [...new Set([item.variant?.label, item.slot?.label, structuralFact, unavailableMessage])]
    .filter((fact): fact is string => Boolean(fact))
    .join(" · ");
}

function astryxTreeStructureIcon(structure: TreeItemStructureContract): ReactNode {
  const icon = astryxTreeStructureIconComponents[structure.state];
  const color =
    structure.state === "missingChild" ||
    structure.state === "cycleStopped" ||
    structure.state === "depthStopped"
      ? "warning"
      : "secondary";

  return <Icon aria-hidden color={color} icon={icon} size="sm" />;
}

const astryxTreeStructureIconComponents = {
  branch: FolderIcon,
  cycleStopped: ArrowPathIcon,
  depthStopped: EllipsisHorizontalCircleIcon,
  leaf: DocumentIcon,
  missingChild: QuestionMarkCircleIcon,
} satisfies Record<TreeItemStructureContract["state"], IconType>;

function astryxTreeContextActionLabel(action: TreeContextActionContract) {
  const control = action.control;
  const label =
    control.pending?.label ??
    (control.content.kind === "iconOnly" ? control.accessibilityLabel : control.content.label);
  const disabledReason = action.availability.available
    ? control.disabledReason
    : action.availability.message;

  return disabledReason && disabledReason !== label ? `${label} — ${disabledReason}` : label;
}

function astryxTreeContextActionDisabled(
  item: TreeItemContract,
  action: TreeContextActionContract,
) {
  return Boolean(
    !item.availability.available ||
    !action.availability.available ||
    action.control.disabled ||
    action.control.pending?.isPending,
  );
}

function captureAstryxTreeDisclosureClick(
  event: MouseEvent<HTMLDivElement>,
  items: readonly TreeItemContract[],
  onIntent: TreeIntentHandler,
) {
  const target = closestElement(event.target, 'button[aria-label="Toggle children"]');
  const item = target ? treeItemForElement(items, target) : undefined;
  if (!item?.disclosure || !item.availability.available) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  void onIntent(item.disclosure.intent);
}

function captureAstryxTreeDisclosureKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  items: readonly TreeItemContract[],
  onIntent: TreeIntentHandler,
) {
  const row = closestElement(event.target, '[role="treeitem"]');
  if (!row || row !== event.target) {
    return;
  }

  const item = treeItemForElement(items, row);
  if (!item || !dispatchAstryxTreeDisclosureKeyIntent(onIntent, item, event.key)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
}

function treeItemForElement(
  items: readonly TreeItemContract[],
  element: ElementLike,
): TreeItemContract | undefined {
  const row = closestElement(element, '[role="treeitem"]');
  const itemId = row?.getAttribute?.("data-tree-id");
  return itemId ? findAstryxTreeItem(items, itemId) : undefined;
}

function findAstryxTreeItem(
  items: readonly TreeItemContract[],
  itemId: string,
): TreeItemContract | undefined {
  for (const item of items) {
    if (item.id === itemId) {
      return item;
    }
    const child = findAstryxTreeItem(item.children, itemId);
    if (child) {
      return child;
    }
  }
  return undefined;
}

type ElementLike = {
  closest?: (selectors: string) => ElementLike | null;
  getAttribute?: (name: string) => string | null;
};

function closestElement(target: EventTarget | ElementLike, selector: string) {
  return "closest" in target && typeof target.closest === "function"
    ? target.closest(selector)
    : null;
}
