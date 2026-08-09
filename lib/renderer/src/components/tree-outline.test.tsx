import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type { TreeIntent, TreeItemContract } from "@dpeek/formless-presentation/contract";
import {
  AstryxTreeOutline,
  astryxTreeContextMenuItems,
  astryxTreeOutlineItems,
  dispatchAstryxTreeContextAction,
  dispatchAstryxTreeDisclosureKeyIntent,
  dispatchAstryxTreeItemSelection,
} from "./tree-outline.tsx";
import { createTreeResultFixtures, type TreeResultFixtureId } from "./tree-results.fixtures.ts";

describe("Astryx tree hierarchy outline", () => {
  it("renders concise accessible rows with tree roles, semantic icons, slot facts, and context actions", () => {
    const tree = treeFixture("shallow");
    const html = renderToStaticMarkup(<AstryxTreeOutline onIntent={() => {}} tree={tree} />);

    expect(html).toContain(`aria-label="${tree.accessibilityLabel}"`);
    expect(html).toContain('role="tree"');
    expect(html.match(/role="treeitem"/g)).toHaveLength(5);
    expect(html).toContain('aria-level="1"');
    expect(html).toContain('aria-level="2"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Navigation block");
    expect(html).toContain("Navigation · Header");
    expect(html).toContain("Logo · Start");
    expect(html).toContain('data-slot="icon"');
    expect(html).toContain('aria-label="Open navigation block"');
    expect(html).not.toContain("Home block");
    expect(html).not.toContain("About block");
  });

  it("maps controlled selection, disclosure, disabled state, and canonical intent dispatch", () => {
    const shallow = treeFixture("shallow");
    const navigation = requiredItem(shallow.items, "tree-item:navigation");
    const primaryLinks = requiredItem(shallow.items, "tree-item:primary-links");
    const disabled = requiredItem(treeFixture("editing-disabled").items, "tree-item:gallery");
    const intents: TreeIntent[] = [];
    const onIntent = (intent: TreeIntent) => {
      intents.push(intent);
    };
    const mapped = astryxTreeOutlineItems(shallow.items, onIntent);
    const mappedNavigation = mapped[0];
    const mappedPrimaryLinks = mappedNavigation?.children?.[1];

    expect(mappedNavigation).toMatchObject({
      id: navigation.id,
      isDisabled: false,
      isExpanded: true,
      isSelected: true,
    });
    expect(mappedPrimaryLinks).toMatchObject({
      id: primaryLinks.id,
      isExpanded: false,
      isSelected: false,
    });

    void dispatchAstryxTreeItemSelection(onIntent, primaryLinks);
    expect(dispatchAstryxTreeDisclosureKeyIntent(onIntent, primaryLinks, "ArrowRight")).toBe(true);
    expect(dispatchAstryxTreeDisclosureKeyIntent(onIntent, primaryLinks, "ArrowLeft")).toBe(false);
    expect(dispatchAstryxTreeDisclosureKeyIntent(onIntent, navigation, "ArrowLeft")).toBe(true);
    expect(dispatchAstryxTreeDisclosureKeyIntent(onIntent, navigation, "ArrowRight")).toBe(false);

    const contextAction = navigation.contextActions[0]!;
    const contextItems = astryxTreeContextMenuItems(navigation, onIntent);
    expect(contextItems).toHaveLength(1);
    expect(contextItems[0]).toMatchObject({
      isDisabled: false,
      label: "Open navigation block",
    });
    if (contextItems[0] && "onClick" in contextItems[0]) {
      contextItems[0].onClick?.();
    }

    void dispatchAstryxTreeItemSelection(onIntent, disabled);
    void dispatchAstryxTreeContextAction(onIntent, disabled, contextAction);

    expect(intents).toEqual([
      primaryLinks.selectionIntent,
      primaryLinks.disclosure?.intent,
      navigation.disclosure?.intent,
      contextAction.intent,
    ]);
    expect(astryxTreeOutlineItems([disabled], onIntent)[0]).toMatchObject({
      description: "Gallery · Main · This block cannot be edited.",
      isDisabled: true,
      isSelected: true,
    });
  });

  it("keeps all eight levels of the controlled selected path visible and keyboard reachable", () => {
    const tree = treeFixture("maximum-depth");
    const mappedPath = selectedDataPath(astryxTreeOutlineItems(tree.items, () => {}));
    const html = renderToStaticMarkup(<AstryxTreeOutline onIntent={() => {}} tree={tree} />);

    expect(mappedPath).toHaveLength(8);
    expect(mappedPath?.slice(0, -1).every((item) => item.isExpanded)).toBe(true);
    expect(mappedPath?.at(-1)).toMatchObject({ isSelected: true, label: expect.anything() });
    expect(html.match(/role="treeitem"/g)).toHaveLength(8);
    expect(html.match(/role="treeitem" aria-expanded="true"/g)).toHaveLength(7);
    expect(html).toContain('aria-level="8"');
    expect(html).toMatch(/aria-selected="true"[^>]*tabindex="0"/);
    expect(html).toContain("Maximum tree depth reached.");
  });
});

function treeFixture(id: TreeResultFixtureId) {
  const fixture = createTreeResultFixtures().find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`Missing ${id} tree-result fixture.`);
  }
  return fixture.tree;
}

function requiredItem(items: readonly TreeItemContract[], itemId: string): TreeItemContract {
  for (const item of items) {
    if (item.id === itemId) {
      return item;
    }
    const child = findItem(item.children, itemId);
    if (child) {
      return child;
    }
  }
  throw new Error(`Missing ${itemId} tree item.`);
}

function findItem(
  items: readonly TreeItemContract[],
  itemId: string,
): TreeItemContract | undefined {
  for (const item of items) {
    if (item.id === itemId) {
      return item;
    }
    const child = findItem(item.children, itemId);
    if (child) {
      return child;
    }
  }
  return undefined;
}

function selectedDataPath(
  items: ReturnType<typeof astryxTreeOutlineItems>,
  ancestors: ReturnType<typeof astryxTreeOutlineItems> = [],
): ReturnType<typeof astryxTreeOutlineItems> | undefined {
  for (const item of items) {
    const path = [...ancestors, item];
    if (item.isSelected) {
      return path;
    }
    const selectedPath = selectedDataPath(item.children ?? [], path);
    if (selectedPath) {
      return selectedPath;
    }
  }
  return undefined;
}
