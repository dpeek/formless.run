import type {
  RecordResultIntent,
  TreeChildCreationContract,
  TreeIntent,
  TreeNodeContract,
  TreeOperationActionContract,
  TreeResultContract,
  WorkspaceIntent,
  WorkspaceIntentScope,
} from "@dpeek/formless-presentation/contract";
import { PresentationHostProvider } from "@dpeek/formless-presentation/host/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { createTreeResultFixtures, type TreeResultFixtureId } from "./tree-results.fixtures.ts";
import { createTreeResultFixtureHost } from "./tree-results.tsx";
import {
  AstryxSubscribedTreeResultRenderer,
  AstryxTreeResultRenderer,
  astryxTreeActionMenuItems,
  dispatchAstryxTreeCreateFieldIntent,
  dispatchAstryxTreeCreateIntent,
  dispatchAstryxTreeRecordResultIntent,
  dispatchAstryxWorkspaceTreeIntent,
} from "./tree-renderer.tsx";

describe("Astryx tree-result renderer", () => {
  it("renders heterogeneous nodes, duplicate record occurrences, and the full declared depth inline", () => {
    const shallowHtml = renderTree("shallow");
    const duplicateHtml = renderTree("duplicate-occurrences");
    const maximumDepthHtml = renderTree("maximum-depth");

    expect(shallowHtml).toContain('aria-label="Homepage composition tree"');
    expect(shallowHtml).toContain('aria-label="Navigation"');
    expect(shallowHtml).toContain('aria-label="Brand"');
    expect(shallowHtml).toContain('aria-label="Primary links"');
    expect(shallowHtml).toContain(">Page<");
    expect(shallowHtml).toContain(">Navigation<");
    expect(shallowHtml).toContain(">Logo<");
    expect(shallowHtml).toContain("Navigation · Header");
    expect(shallowHtml).toContain('value="Build without boilerplate"');
    expect(shallowHtml).not.toContain('role="tree"');
    expect(shallowHtml).not.toMatch(/aria-label="(?:Select|Expand|Collapse|Toggle) /);

    expect(occurrences(duplicateHtml, 'value="Start free"')).toBe(2);
    expect(duplicateHtml).toContain("promo-main:editor");
    expect(duplicateHtml).toContain("promo-footer:editor");
    expect(occurrences(maximumDepthHtml, "data-formless-record-result=")).toBe(8);
    expect(maximumDepthHtml).toContain("Maximum tree depth reached.");
  });

  it("renders one populated or absent header menu with canonical create, destructive, and pending effects", () => {
    const actionsHtml = renderTree("actions");
    const noActionsHtml = renderTree("no-actions");
    const pendingHtml = renderTree("pending");

    expect(actionsHtml).toContain('aria-label="More landing page actions"');
    expect(actionsHtml).toContain('aria-label="More announcement actions"');
    expect(actionsHtml).toContain('value="New release"');
    expect(actionsHtml).toContain("Add text block");
    expect(actionsHtml).toContain("Remove announcement placement?");
    expect(actionsHtml).toContain(
      "Remove announcement placement will update the flat stored records.",
    );
    expect(noActionsHtml).not.toContain('aria-label="More read-only page actions"');
    expect(pendingHtml).toContain('data-operation-status="pending"');
    expect(pendingHtml).toContain('data-operation-progress="');
    expect(pendingHtml).toContain("Creating block");
  });

  it("renders structural, readiness, editing, empty, and unavailable states without a selected editor", () => {
    const missing = treeFixture("missing-child");
    const missingNode = required(missing.root?.children[0]);
    const missingHtml = renderTree("missing-child");
    const warningHtml = renderTree("warnings");

    expect(missingNode.editor).toBeUndefined();
    expect(missingHtml).toContain("The placed block is unavailable.");
    expect(missingHtml).toContain('aria-label="More missing child actions"');
    expect(missingHtml).not.toContain(`${missingNode.id}:editor`);
    expect(renderTree("cycle")).toContain("This branch stops before repeating an ancestor.");
    expect(renderTree("leaf")).not.toContain("Add text block");
    expect(warningHtml).toContain("Page readiness");
    expect(warningHtml).toContain("Placement readiness");
    expect(warningHtml).toContain("Block readiness");
    expect(renderTree("editing-disabled")).toContain("Editing requires an owner session.");
    expect(renderTree("empty")).toContain("No blocks yet");
    expect(renderTree("unavailable")).toContain("Page composition is temporarily unavailable.");
  });

  it("dispatches ordered node actions and occurrence-scoped record, create, and workspace intents", () => {
    const tree = treeFixture("actions");
    const node = required(tree.root?.children[0]);
    const creation = requiredAction(
      node,
      (action): action is TreeChildCreationContract => action.kind === "treeChildCreation",
    );
    const operation = requiredAction(
      node,
      (action): action is TreeOperationActionContract => action.kind === "operationAction",
    );
    const field = required(node.editor?.fields[0]);
    const createField = required(creation.activeCreateSurface?.dialog.form.fieldSet.fields[0]);
    const intents: TreeIntent[] = [];
    const onIntent = (intent: TreeIntent) => {
      intents.push(intent);
    };
    const menuItems = astryxTreeActionMenuItems(tree, node, onIntent);

    expect(menuItems.map((item) => item.label)).toEqual([
      "Open announcement",
      "Text · Main",
      "Image · Media",
      "Move down",
      "Move bottom",
      "Remove announcement placement",
    ]);
    for (const item of menuItems) {
      item.onClick?.();
    }

    const fieldIntent = {
      fieldName: field.fieldName,
      type: "recordEditorDraftChange" as const,
      value: "Updated announcement",
    };
    const recordIntent = {
      fieldId: field.fieldId,
      intent: fieldIntent,
      recordId: required(node.editor?.selectedRecord).id,
      resultId: required(node.editor).id,
      type: "recordResultFieldIntent" as const,
    } satisfies RecordResultIntent;
    void dispatchAstryxTreeRecordResultIntent(onIntent, tree, node, recordIntent);
    void dispatchAstryxTreeCreateIntent(onIntent, tree, node, creation, {
      open: false,
      surfaceId: required(creation.activeCreateSurface).id,
      type: "createOpenChange",
    });
    void dispatchAstryxTreeCreateFieldIntent(onIntent, tree, node, creation, createField.fieldId, {
      fieldName: createField.fieldName,
      fieldValue: { kind: "input", value: "New announcement" },
      type: "createDraftChange",
    });
    void dispatchAstryxTreeRecordResultIntent(onIntent, tree, node, {
      ...recordIntent,
      resultId: "stale-editor",
    });

    expect(intents.map((intent) => intent.type)).toEqual([
      "treeContextAction",
      "treeChildVariantSelection",
      "treeChildVariantSelection",
      "treeReorder",
      "treeReorder",
      "treeOperation",
      "treeRecordResult",
      "treeCreate",
      "treeCreateField",
    ]);
    expect(intents.every((intent) => intent.nodeId === node.id)).toBe(true);
    expect(required(intents.at(5))).toMatchObject({
      controlId: operation.control.id,
      resultId: tree.id,
      type: "treeOperation",
    });
    expect(required(intents.at(6))).toEqual({
      intent: recordIntent,
      nodeId: node.id,
      resultId: tree.id,
      type: "treeRecordResult",
    });

    const workspaceIntents: WorkspaceIntent[] = [];
    const scope = {
      collectionId: "collection:pages",
      screenId: "workspace:site",
      sectionId: "section:composition",
    } satisfies WorkspaceIntentScope;
    void dispatchAstryxWorkspaceTreeIntent(
      (intent) => {
        workspaceIntents.push(intent);
      },
      scope,
      tree.id,
      required(intents.at(6)),
    );
    expect(workspaceIntents).toEqual([
      {
        ...scope,
        intent: intents.at(6),
        resultId: tree.id,
        type: "workspaceTree",
      },
    ]);
  });

  it("renders a complete tree snapshot through the reusable Presentation Host", () => {
    const fixture = required(
      createTreeResultFixtures().find((candidate) => candidate.id === "shallow"),
    );
    const fixtureHost = createTreeResultFixtureHost([fixture]);
    const html = renderToStaticMarkup(
      <PresentationHostProvider host={fixtureHost.host}>
        <AstryxSubscribedTreeResultRenderer
          reference={fixtureHost.referenceFor("shallow")}
          scope={{
            collectionId: "collection:tree-result-fixtures",
            screenId: "workspace:tree-result-fixtures",
            sectionId: "section:tree-result-fixtures",
          }}
        />
      </PresentationHostProvider>,
    );

    expect(html).toContain('aria-label="Homepage composition tree"');
    expect(html).toContain('aria-label="Navigation"');
    expect(html).toContain('value="Build without boilerplate"');
  });
});

function renderTree(id: TreeResultFixtureId) {
  return renderToStaticMarkup(<AstryxTreeResultRenderer tree={treeFixture(id)} />);
}

function treeFixture(id: TreeResultFixtureId): TreeResultContract {
  return required(createTreeResultFixtures().find((fixture) => fixture.id === id)).tree;
}

function requiredAction<Action extends TreeNodeContract["headerActions"]["items"][number]>(
  node: TreeNodeContract,
  select: (action: TreeNodeContract["headerActions"]["items"][number]) => action is Action,
): Action {
  return required(node.headerActions.items.find(select));
}

function occurrences(value: string, needle: string) {
  return value.split(needle).length - 1;
}

function required<Value>(value: Value | null | undefined): NonNullable<Value> {
  if (value === undefined || value === null) {
    throw new Error("Expected value.");
  }
  return value as NonNullable<Value>;
}
