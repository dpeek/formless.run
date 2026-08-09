import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  CreateSurfaceContract,
  FieldIntent,
  TreeChildCreationContract,
  TreeIntent,
  TreeParentIdentity,
} from "@dpeek/formless-presentation/contract";
import {
  AstryxTreeChildCreation,
  astryxTreeChildVariantMenuItems,
  dispatchAstryxTreeChildVariantSelection,
  dispatchAstryxTreeCreateFieldIntent,
  dispatchAstryxTreeCreateIntent,
} from "./tree-child-creation.tsx";
import { createTreeResultFixtures, type TreeResultFixtureId } from "./tree-results.fixtures.ts";
import { AstryxTreeResultRenderer } from "./tree-renderer.tsx";
import { fieldError as createFieldError } from "./fields/fixture-helpers.ts";

describe("Astryx tree child creation", () => {
  it("renders accessible root and nested action menus from projected variants", () => {
    const tree = treeFixture("shallow");
    const rootCreation = required(tree.rootChildCreation);
    const nestedCreation = required(tree.selectedEditor?.childCreation);
    const items = astryxTreeChildVariantMenuItems(nestedCreation, () => undefined);
    const html = renderToStaticMarkup(
      <AstryxTreeResultRenderer onIntent={() => undefined} tree={tree} />,
    );

    expect(items).toMatchObject([
      { isDisabled: false, label: "Text · Main" },
      { isDisabled: false, label: "Button · Actions" },
    ]);
    expect(rootCreation.variants.map((variant) => variant.selectionIntent.parent)).toEqual([
      { kind: "root" },
      { kind: "root" },
    ]);
    expect(nestedCreation.variants.map((variant) => variant.selectionIntent.parent)).toEqual([
      { itemId: tree.selectedEditor?.itemId, kind: "item" },
      { itemId: tree.selectedEditor?.itemId, kind: "item" },
    ]);
    expect(html).toContain('aria-label="Add child to Homepage"');
    expect(html).toContain('aria-label="Add child to Navigation"');
    expect(html).toContain('aria-haspopup="menu"');

    const emptyHtml = renderToStaticMarkup(
      <AstryxTreeResultRenderer tree={treeFixture("empty")} />,
    );
    expect(emptyHtml).toContain("No blocks yet");
    expect(emptyHtml).toContain('aria-label="Add first block to Blank page"');
  });

  it("omits leaf creation and disables projected unavailable parent actions", async () => {
    const disabledTree = treeFixture("editing-disabled");
    const disabledCreation = required(disabledTree.selectedEditor?.childCreation);
    const disabledVariant = required(disabledCreation.variants[0]);
    const intents: TreeIntent[] = [];
    const disabledHtml = renderCreation(
      disabledTree.id,
      disabledCreation,
      { itemId: required(disabledTree.selectedEditor).itemId, kind: "item" },
      (intent) => intents.push(intent),
    );

    expect(disabledCreation.variants.every((variant) => !variant.availability.available)).toBe(
      true,
    );
    expect(disabledHtml).toContain('aria-label="Add child to Gallery"');
    expect(disabledHtml).toContain("disabled");
    await dispatchAstryxTreeChildVariantSelection((intent) => {
      intents.push(intent);
    }, disabledVariant);
    expect(intents).toEqual([]);

    const leafHtml = renderToStaticMarkup(<AstryxTreeResultRenderer tree={treeFixture("leaf")} />);
    expect(treeFixture("leaf").selectedEditor?.childCreation).toBeUndefined();
    expect(leafHtml).not.toContain("data-formless-astryx-tree-child-creation");
  });

  it("forwards exact variant, create, cancel, and create-field identities", async () => {
    const tree = treeFixture("shallow");
    const editor = required(tree.selectedEditor);
    const creation = required(editor.childCreation);
    const variant = required(creation.variants[1]);
    const surface = required(creation.activeCreateSurface);
    const field = required(surface.dialog.form.fieldSet.fields[0]);
    const parent = { itemId: editor.itemId, kind: "item" } as const;
    const draftIntent = {
      fieldName: field.fieldName,
      fieldValue: { kind: "input", value: "Contact us" },
      type: "createDraftChange",
    } satisfies FieldIntent;
    const closeIntent = {
      open: false,
      surfaceId: surface.id,
      type: "createOpenChange",
    } as const;
    const intents: TreeIntent[] = [];
    const onIntent = (intent: TreeIntent) => {
      intents.push(intent);
    };

    await dispatchAstryxTreeChildVariantSelection(onIntent, variant);
    await dispatchAstryxTreeCreateFieldIntent(
      onIntent,
      tree.id,
      parent,
      surface.id,
      field.fieldId,
      draftIntent,
    );
    await dispatchAstryxTreeCreateIntent(onIntent, tree.id, parent, surface.id, closeIntent);

    expect(intents).toEqual([
      variant.selectionIntent,
      {
        fieldId: field.fieldId,
        intent: draftIntent,
        resultId: tree.id,
        target: { kind: "create", parent, surfaceId: surface.id },
        type: "treeField",
      },
      {
        intent: closeIntent,
        parent,
        resultId: tree.id,
        surfaceId: surface.id,
        type: "treeCreate",
      },
    ]);
  });

  it("renders controlled validation, pending, retry, and closed create states", () => {
    const tree = treeFixture("shallow");
    const editor = required(tree.selectedEditor);
    const creation = required(editor.childCreation);
    const surface = required(creation.activeCreateSurface);
    const parent = { itemId: editor.itemId, kind: "item" } as const;
    const validationSurface = createSurfaceState(surface, {
      fieldError: "Block label is required.",
      open: true,
    });
    const retrySurface = createSurfaceState(surface, {
      formError: "Create failed. Try again.",
      open: true,
      submitLabel: "Retry",
    });
    const validationHtml = renderCreation(
      tree.id,
      { ...creation, activeCreateSurface: validationSurface },
      parent,
    );
    const retryHtml = renderCreation(
      tree.id,
      { ...creation, activeCreateSurface: retrySurface },
      parent,
    );
    const pendingTree = treeFixture("pending");
    const pendingEditor = required(pendingTree.selectedEditor);
    const pendingCreation = required(pendingEditor.childCreation);
    const pendingHtml = renderCreation(pendingTree.id, pendingCreation, {
      itemId: pendingEditor.itemId,
      kind: "item",
    });
    const closedHtml = renderCreation(
      tree.id,
      { ...creation, activeCreateSurface: undefined, activeVariantId: undefined },
      parent,
    );

    expect(validationHtml).toContain("Add text block");
    expect(validationHtml).toContain("Block label");
    expect(validationHtml).toContain("Block label is required.");
    expect(validationHtml).not.toContain(">Add block<");
    expect(retryHtml).toContain("Create failed. Try again.");
    expect(retryHtml).toContain("Retry");
    expect(pendingHtml).toContain("Creating block");
    expect(pendingHtml).toContain("Feature child");
    expect(closedHtml).not.toContain("Add text block");
  });
});

function renderCreation(
  resultId: string,
  creation: TreeChildCreationContract,
  parent: TreeParentIdentity,
  onIntent: (intent: TreeIntent) => void = () => undefined,
) {
  return renderToStaticMarkup(
    <AstryxTreeChildCreation
      creation={creation}
      onIntent={onIntent}
      parent={parent}
      resultId={resultId}
    />,
  );
}

function createSurfaceState(
  surface: CreateSurfaceContract,
  {
    fieldError,
    formError,
    open,
    submitLabel,
  }: {
    fieldError?: string;
    formError?: string;
    open: boolean;
    submitLabel?: string;
  },
): CreateSurfaceContract {
  const fields = surface.dialog.form.fieldSet.fields.map((field, index) =>
    index === 0 && fieldError
      ? { ...field, errors: [createFieldError(field.fieldName, fieldError)] }
      : field,
  );
  const submit = submitLabel
    ? {
        ...surface.dialog.form.submit,
        accessibilityLabel: submitLabel,
        content: { kind: "label" as const, label: submitLabel },
      }
    : surface.dialog.form.submit;

  return {
    ...surface,
    dialog: {
      ...surface.dialog,
      form: {
        ...surface.dialog.form,
        errors: formError ? [formError] : [],
        fieldSet: { ...surface.dialog.form.fieldSet, fields },
        submit,
      },
      open,
    },
  };
}

function treeFixture(id: TreeResultFixtureId) {
  const fixture = createTreeResultFixtures().find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`Missing ${id} tree-result fixture.`);
  }
  return fixture.tree;
}

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("Expected fixture value.");
  }
  return value;
}
