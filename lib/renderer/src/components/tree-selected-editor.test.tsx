import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  FieldContract,
  FieldIntent,
  TreeIntent,
  TreeItemContract,
} from "@dpeek/formless-presentation/contract";
import {
  AstryxTreeSelectedEditor,
  dispatchAstryxTreeFieldIntent,
} from "./tree-selected-editor.tsx";
import { createTreeResultFixtures, type TreeResultFixtureId } from "./tree-results.fixtures.ts";
import { AstryxTreeResultRenderer } from "./tree-renderer.tsx";

describe("Astryx tree selected-item editor", () => {
  it("renders placement-edge and child-record fields in distinct labelled regions", () => {
    const tree = treeFixture("shallow");
    const editor = required(tree.selectedEditor);
    const selectedItem = required(findSelectedItem(tree.items));
    const childFields = required(editor.childFields);
    const childLabel = requiredField(childFields.fields, "label");
    const targetBlock = requiredField(childFields.fields, "targetBlock");
    const icon = requiredField(childFields.fields, "pageIcon");
    const html = renderToStaticMarkup(
      <AstryxTreeSelectedEditor
        editor={editor}
        onIntent={() => undefined}
        selectedItem={selectedItem}
        tree={tree}
      />,
    );

    expect(editor.placementId).toBe("placement:navigation");
    expect(editor.childRecordId).toBe("block:navigation");
    expect(editor.placementFields.fields).toMatchObject([
      { density: "compact", recordId: editor.placementId, rendererKind: "text" },
    ]);
    expect(selectedItem.variant?.label).toBe("Navigation");
    expect(childLabel).toMatchObject({
      drafts: { draft: "Draft navigation", recordValue: "Navigation" },
      presentationMode: "heading",
      recordId: editor.childRecordId,
      rendererKind: "autosize-text",
    });
    expect(targetBlock).toMatchObject({
      recordId: editor.childRecordId,
      reference: { kind: "editor", valueStatus: { kind: "missing", value: "block:missing" } },
      rendererKind: "reference",
      visibleWhen: { field: "targetMode", values: ["block"] },
    });
    expect(icon).toMatchObject({
      pending: { isPending: true, label: "Saving icon" },
      recordId: editor.childRecordId,
      rendererKind: "icon",
    });
    expect(editor.placementFields.fields[0]?.fieldId).not.toBe(childLabel.fieldId);

    expect(html).toContain('aria-label="Edit Navigation placement and block"');
    expect(html.match(/role="region"/g)).toHaveLength(2);
    expect(html).toContain('data-formless-astryx-tree-field-set-kind="placement"');
    expect(html).toContain('data-formless-astryx-tree-field-set-kind="child"');
    expect(html).toContain("Placement fields");
    expect(html).toContain("Child fields");
    expect(html.indexOf("Placement fields")).toBeLessThan(html.indexOf("Child fields"));
    expect(html).toContain("Navigation · Header");
    expect(html).toContain('value="Draft navigation"');
    expect(html).toContain("Navigation label could not be saved.");
    expect(html).toContain("Current reference “block:missing” is unavailable.");
    expect(html).toContain("Page Icon");
  });

  it("routes ordinary and specialized field intents with exact edge-versus-child identity", async () => {
    const tree = treeFixture("shallow");
    const editor = required(tree.selectedEditor);
    const childFields = required(editor.childFields);
    const placementLabel = requiredField(editor.placementFields.fields, "label");
    const childLabel = requiredField(childFields.fields, "label");
    const icon = requiredField(childFields.fields, "pageIcon");
    const placementIntent = {
      fieldName: "label",
      type: "recordEditorDraftChange",
      value: "Secondary navigation",
    } satisfies FieldIntent;
    const childIntent = {
      fieldName: "label",
      type: "recordEditorDraftChange",
      value: "Draft header navigation",
    } satisfies FieldIntent;
    const iconIntent = {
      fieldName: "pageIcon",
      open: true,
      type: "iconDialogOpenChange",
    } satisfies FieldIntent;
    const intents: TreeIntent[] = [];
    const onIntent = (intent: TreeIntent) => {
      intents.push(intent);
    };

    await dispatchAstryxTreeFieldIntent(
      onIntent,
      tree.id,
      editor,
      editor.placementFields,
      "placement",
      placementLabel,
      placementIntent,
    );
    await dispatchAstryxTreeFieldIntent(
      onIntent,
      tree.id,
      editor,
      childFields,
      "child",
      childLabel,
      childIntent,
    );
    await dispatchAstryxTreeFieldIntent(
      onIntent,
      tree.id,
      editor,
      childFields,
      "child",
      icon,
      iconIntent,
    );

    expect(intents).toEqual([
      {
        fieldId: placementLabel.fieldId,
        intent: placementIntent,
        resultId: tree.id,
        target: {
          fieldSetId: editor.placementFields.id,
          itemId: editor.itemId,
          kind: "placement",
        },
        type: "treeField",
      },
      {
        fieldId: childLabel.fieldId,
        intent: childIntent,
        resultId: tree.id,
        target: { fieldSetId: childFields.id, itemId: editor.itemId, kind: "child" },
        type: "treeField",
      },
      {
        fieldId: icon.fieldId,
        intent: iconIntent,
        resultId: tree.id,
        target: { fieldSetId: childFields.id, itemId: editor.itemId, kind: "child" },
        type: "treeField",
      },
    ]);
  });

  it("renders explicit no-selection, missing-child, unavailable, and editing-disabled states", () => {
    const noSelection = renderTree("no-selection");
    const missingChild = renderTree("missing-child");
    const unavailable = renderTree("unavailable");
    const editingDisabled = renderTree("editing-disabled");

    expect(noSelection).toContain(">Group<");
    expect(noSelection).not.toContain("Select an item to edit.");
    expect(missingChild).toContain("The placed block is unavailable.");
    expect(missingChild).toContain("Remove placement");
    expect(missingChild).not.toContain("Child fields");
    expect(missingChild).not.toContain("This selected item is unavailable.");
    expect(unavailable).toContain("Page composition is temporarily unavailable.");
    expect(unavailable).not.toContain("data-formless-astryx-tree-editor");
    expect(editingDisabled).toContain("Editing requires an owner session.");
    expect(editingDisabled).toContain("This selected item is unavailable.");
    expect(editingDisabled.match(/<fieldset[^>]*disabled=""/g)).toHaveLength(1);
  });
});

function renderTree(id: TreeResultFixtureId) {
  return renderToStaticMarkup(<AstryxTreeResultRenderer tree={treeFixture(id)} />);
}

function treeFixture(id: TreeResultFixtureId) {
  const fixture = createTreeResultFixtures().find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`Missing ${id} tree-result fixture.`);
  }
  return fixture.tree;
}

function findSelectedItem(items: readonly TreeItemContract[]): TreeItemContract | undefined {
  for (const item of items) {
    if (item.selected) {
      return item;
    }
    const selectedChild = findSelectedItem(item.children);
    if (selectedChild) {
      return selectedChild;
    }
  }
  return undefined;
}

function requiredField(fields: readonly FieldContract[], fieldName: string) {
  return required(fields.find((field) => field.fieldName === fieldName));
}

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("Expected fixture value.");
  }
  return value;
}
