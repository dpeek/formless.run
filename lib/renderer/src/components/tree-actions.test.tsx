import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  OperationPresentationIntent,
  TreeIntent,
  TreeItemContract,
} from "@dpeek/formless-presentation/contract";
import {
  astryxOperationConfirmationFacts,
  astryxOperationFeedbackToastOptions,
} from "./operation-renderer.tsx";
import {
  astryxTreeOrderingMenuItems,
  dispatchAstryxTreeOperationIntent,
  dispatchAstryxTreeOrderingIntent,
} from "./tree-actions.tsx";
import { createTreeResultFixtures, type TreeResultFixtureId } from "./tree-results.fixtures.ts";
import { AstryxTreeResultRenderer } from "./tree-renderer.tsx";

describe("Astryx tree actions and diagnostics", () => {
  it("keeps placement removal visible and semantic ordering in a boundary-aware menu", () => {
    const tree = treeFixture("actions");
    const item = requiredSelectedItem(tree.items);
    const editor = requiredEditor(tree);
    const ordering = requiredOrdering(item);
    const intents: TreeIntent[] = [];
    const onIntent = (intent: TreeIntent) => {
      intents.push(intent);
    };
    const menuItems = astryxTreeOrderingMenuItems(ordering, item, onIntent);
    const html = renderToStaticMarkup(<AstryxTreeResultRenderer onIntent={onIntent} tree={tree} />);

    expect(menuItems).toMatchObject([
      { isDisabled: false, label: "Move down" },
      { isDisabled: false, label: "Move bottom" },
    ]);
    expect(menuItems.map((menuItem) => menuItem.label)).not.toContain("Move top");
    expect(menuItems.map((menuItem) => menuItem.label)).not.toContain("Move up");
    clickMenuItem(menuItems[0]);
    expect(intents).toEqual([
      ordering.actions.find((action) => action.direction === "down")?.intent,
    ]);

    const boundaryAction = ordering.actions.find((action) => action.direction === "top");
    if (!boundaryAction) {
      throw new Error("Missing top ordering action.");
    }
    void dispatchAstryxTreeOrderingIntent(onIntent, ordering, item, boundaryAction);
    expect(intents).toHaveLength(1);

    expect(html).toContain(`data-formless-astryx-tree-actions="${editor.itemId}"`);
    expect(html).toContain('aria-label="Order Announcement"');
    expect(html).toContain("Remove placement");
    expect(html).toContain('data-variant="destructive"');
    expect(html).not.toContain("Delete child");
    expect(html).not.toContain("Delete block");
  });

  it("retains pending ordering actions and visible move status without dispatching duplicates", () => {
    const tree = treeFixture("pending");
    const item = requiredSelectedItem(tree.items);
    const ordering = requiredOrdering(item);
    const intents: TreeIntent[] = [];
    const menuItems = astryxTreeOrderingMenuItems(ordering, item, (intent) => {
      intents.push(intent);
    });
    const html = renderToStaticMarkup(<AstryxTreeResultRenderer tree={tree} />);

    expect(menuItems).toHaveLength(4);
    expect(menuItems.every((menuItem) => "isDisabled" in menuItem && menuItem.isDisabled)).toBe(
      true,
    );
    expect(menuItems.map((menuItem) => menuItem.label)).toEqual([
      "Move top — Ordering in progress",
      "Move up — Ordering in progress",
      "Move down — Ordering in progress",
      "Move bottom — Ordering in progress",
    ]);
    clickMenuItem(menuItems[0]);
    expect(intents).toEqual([]);
    expect(html).toContain('data-operation-status="pending"');
    expect(html).toContain("Ordering change is in progress.");
  });

  it("routes controlled removal confirmation, pending progress, and failure retry exactly", () => {
    const confirmationTree = treeFixture("removal-confirmation");
    const confirmationEditor = requiredEditor(confirmationTree);
    const confirmationControl = requiredRemoval(confirmationEditor);
    const intents: TreeIntent[] = [];
    const handleOperationIntent = (intent: OperationPresentationIntent) =>
      dispatchAstryxTreeOperationIntent(
        (treeIntent) => {
          intents.push(treeIntent);
        },
        confirmationTree.id,
        confirmationEditor,
        confirmationControl,
        intent,
      );
    const confirmation = confirmationControl.confirmation;
    if (!confirmation) {
      throw new Error("Missing removal confirmation.");
    }
    const confirmationFacts = astryxOperationConfirmationFacts(confirmation, handleOperationIntent);

    expect(confirmationFacts).toMatchObject({
      actionLabel: "Remove",
      actionVariant: "destructive",
      cancelLabel: "Cancel",
      isOpen: true,
      title: "Remove placement?",
    });
    void confirmationFacts.onOpenChange(false);
    void confirmationFacts.onAction();
    expect(intents).toEqual([
      treeOperationIntent(
        confirmationTree.id,
        confirmationEditor.itemId,
        confirmationControl.id,
        confirmation.closeIntent,
      ),
      treeOperationIntent(
        confirmationTree.id,
        confirmationEditor.itemId,
        confirmationControl.id,
        confirmation.action.intent,
      ),
    ]);

    const pendingTree = treeFixture("removal-pending");
    const pendingHtml = renderToStaticMarkup(<AstryxTreeResultRenderer tree={pendingTree} />);
    expect(pendingHtml).toContain('data-operation-progress="');
    expect(pendingHtml).toContain("Refresh tree");
    expect(pendingHtml).toContain('data-operation-status="pending"');
    expect(pendingHtml).toContain('aria-busy="true"');

    const failedTree = treeFixture("removal-failed");
    const failedEditor = requiredEditor(failedTree);
    const failedControl = requiredRemoval(failedEditor);
    const failedHtml = renderToStaticMarkup(<AstryxTreeResultRenderer tree={failedTree} />);
    const failedConfirmation = failedControl.confirmation;
    if (!failedConfirmation || !failedControl.feedback) {
      throw new Error("Missing failed removal state.");
    }
    const retryIntents: TreeIntent[] = [];
    const retryFacts = astryxOperationConfirmationFacts(failedConfirmation, (intent) =>
      dispatchAstryxTreeOperationIntent(
        (treeIntent) => {
          retryIntents.push(treeIntent);
        },
        failedTree.id,
        failedEditor,
        failedControl,
        intent,
      ),
    );
    void retryFacts.onAction();

    expect(retryFacts.isActionLoading).toBe(false);
    expect(retryIntents).toEqual([
      treeOperationIntent(
        failedTree.id,
        failedEditor.itemId,
        failedControl.id,
        failedConfirmation.action.intent,
      ),
    ]);
    expect(failedHtml).toContain('data-operation-status="failed"');
    expect(failedHtml).toContain("Remove failed. Try again.");
    expect(astryxOperationFeedbackToastOptions(failedControl.feedback)).toMatchObject({
      body: "Remove failed.",
      isAutoHide: false,
      type: "error",
      uniqueID: failedControl.feedback.id,
    });
  });

  it("renders source-distinct combined warnings and selected structural or disabled state", () => {
    const disabledHtml = renderToStaticMarkup(
      <AstryxTreeResultRenderer tree={treeFixture("editing-disabled")} />,
    );
    const missingHtml = renderToStaticMarkup(
      <AstryxTreeResultRenderer tree={treeFixture("missing-child")} />,
    );
    const cycleHtml = renderToStaticMarkup(
      <AstryxTreeResultRenderer tree={treeFixture("cycle")} />,
    );
    const depthHtml = renderToStaticMarkup(
      <AstryxTreeResultRenderer tree={treeFixture("maximum-depth")} />,
    );

    expect(disabledHtml).toContain('data-formless-astryx-tree-warning-source="tree"');
    expect(disabledHtml).toContain('data-formless-astryx-tree-warning-source="placement"');
    expect(disabledHtml).toContain('data-formless-astryx-tree-warning-source="child"');
    expect(disabledHtml).toContain("The page contains unpublished changes.");
    expect(disabledHtml).toContain("Placement is hidden from the published page.");
    expect(disabledHtml).toContain("Image reference is unavailable.");
    expect(disabledHtml).toContain("This selected item is unavailable.");
    expect(disabledHtml).toContain("Editing requires an owner session.");
    expect(disabledHtml).not.toContain("data-formless-astryx-tree-actions");
    expect(missingHtml).toContain("The placed block is unavailable.");
    expect(cycleHtml).toContain("This branch stops before repeating an ancestor.");
    expect(depthHtml).toContain("Maximum tree depth reached.");
  });
});

function treeFixture(id: TreeResultFixtureId) {
  const fixture = createTreeResultFixtures().find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`Missing ${id} tree-result fixture.`);
  }
  return fixture.tree;
}

function requiredSelectedItem(items: readonly TreeItemContract[]) {
  for (const item of items) {
    if (item.selected) {
      return item;
    }
    const selectedChild = requiredSelectedItemOrUndefined(item.children);
    if (selectedChild) {
      return selectedChild;
    }
  }
  throw new Error("Missing selected tree item.");
}

function requiredSelectedItemOrUndefined(
  items: readonly TreeItemContract[],
): TreeItemContract | undefined {
  for (const item of items) {
    if (item.selected) {
      return item;
    }
    const selectedChild = requiredSelectedItemOrUndefined(item.children);
    if (selectedChild) {
      return selectedChild;
    }
  }
  return undefined;
}

function requiredEditor(tree: ReturnType<typeof treeFixture>) {
  if (!tree.selectedEditor) {
    throw new Error("Missing selected editor.");
  }
  return tree.selectedEditor;
}

function requiredOrdering(item: TreeItemContract) {
  if (!item.ordering) {
    throw new Error("Missing tree ordering.");
  }
  return item.ordering;
}

function requiredRemoval(editor: ReturnType<typeof requiredEditor>) {
  if (!editor.removePlacement) {
    throw new Error("Missing remove-placement control.");
  }
  return editor.removePlacement;
}

function clickMenuItem(item: ReturnType<typeof astryxTreeOrderingMenuItems>[number] | undefined) {
  if (!item || !("onClick" in item) || !item.onClick) {
    throw new Error("Missing actionable ordering menu item.");
  }
  void item.onClick();
}

function treeOperationIntent(
  resultId: string,
  itemId: string,
  controlId: string,
  intent: OperationPresentationIntent,
) {
  return { controlId, intent, itemId, resultId, type: "treeOperation" } as const;
}
