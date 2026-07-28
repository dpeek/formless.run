import { Heading } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useState } from "react";
import type {
  CreateFieldContract,
  FieldSetContract,
  TreeChildCreationContract,
  TreeIntent,
  TreeItemContract,
  TreeResultContract,
  TreeResultReference,
  TreeSelectedEditorContract,
  WorkspaceIntentScope,
} from "@dpeek/formless-presentation/contract";
import {
  createMemoryPresentationHost,
  treeResultReference,
  isWorkspaceIntent,
  type PresentationNodeSet,
  type MutablePresentationHost,
} from "@dpeek/formless-presentation/host";
import { PresentationHostProvider } from "@dpeek/formless-presentation/host/react";
import { AstryxApplicationSurfaceFrame } from "./application-surface-frame.tsx";
import { applyScenarioFieldIntent } from "./fields/fixture-helpers.ts";
import { FormlessFixtureFrame, FormlessFixtureSelector } from "./fixture-layout.tsx";
import {
  createTreeResultFixtures,
  type TreeResultFixture,
  type TreeResultFixtureId,
} from "./tree-results.fixtures.ts";
import { AstryxSubscribedTreeResultRenderer } from "./tree-renderer.tsx";

export function FormlessTreeResultsLayout() {
  const [fixtureHost] = useState(() => createTreeResultFixtureHost(createTreeResultFixtures()));
  const [selectedFixtureId, setSelectedFixtureId] = useState<TreeResultFixtureId>("shallow");

  return (
    <FormlessFixtureFrame
      ariaLabel="Tree result fixtures"
      controls={
        <FormlessFixtureSelector
          label="Tree state"
          onSelectionChange={setSelectedFixtureId}
          options={fixtureHost.fixtures}
          selectedId={selectedFixtureId}
        />
      }
    >
      <main>
        <AstryxApplicationSurfaceFrame width="wide">
          <VStack gap={5} width="100%">
            <Heading level={1}>Tree Results</Heading>
            <PresentationHostProvider host={fixtureHost.host}>
              <AstryxSubscribedTreeResultRenderer
                reference={fixtureHost.referenceFor(selectedFixtureId)}
                scope={treeFixtureWorkspaceScope}
              />
            </PresentationHostProvider>
          </VStack>
        </AstryxApplicationSurfaceFrame>
      </main>
    </FormlessFixtureFrame>
  );
}

export type TreeResultFixtureHost = {
  fixtures: readonly TreeResultFixture[];
  getTree(fixtureId: TreeResultFixtureId): TreeResultContract;
  host: MutablePresentationHost;
  referenceFor(fixtureId: TreeResultFixtureId): TreeResultReference;
};

export function createTreeResultFixtureHost(
  fixtures: readonly TreeResultFixture[],
): TreeResultFixtureHost {
  const trees = new Map(fixtures.map((fixture) => [fixture.id, structuredClone(fixture.tree)]));
  const references = new Map(
    fixtures.map((fixture) => [fixture.id, treeFixtureReference(fixture.tree)]),
  );
  let host: MutablePresentationHost;

  host = createMemoryPresentationHost({
    dispatch: (intent) => {
      if (!isWorkspaceIntent(intent)) {
        throw new Error("Tree-result fixture host received a non-workspace intent.");
      }
      if (intent.type !== "workspaceTree") {
        return;
      }
      if (
        intent.screenId !== treeFixtureWorkspaceScope.screenId ||
        intent.sectionId !== treeFixtureWorkspaceScope.sectionId ||
        intent.collectionId !== treeFixtureWorkspaceScope.collectionId
      ) {
        return;
      }

      const fixture = fixtures.find((candidate) => candidate.tree.id === intent.resultId);
      const tree = fixture ? trees.get(fixture.id) : undefined;
      if (!fixture || !tree) {
        return;
      }

      const nextTree = applyTreeResultFixtureIntent(tree, intent.intent);
      if (nextTree === tree) {
        return;
      }

      trees.set(fixture.id, nextTree);
      host.publish(projectTreeResultFixtureNodes(fixtures, trees));
    },
    nodes: projectTreeResultFixtureNodes(fixtures, trees),
  });

  return {
    fixtures,
    getTree: (fixtureId) => {
      const tree = trees.get(fixtureId);
      if (!tree) {
        throw new Error(`Missing ${fixtureId} tree-result fixture.`);
      }
      return tree;
    },
    host,
    referenceFor: (fixtureId) => {
      const reference = references.get(fixtureId);
      if (!reference) {
        throw new Error(`Missing ${fixtureId} tree-result fixture reference.`);
      }
      return reference;
    },
  };
}

export function projectTreeResultFixtureNodes(
  fixtures: readonly TreeResultFixture[],
  trees: ReadonlyMap<TreeResultFixtureId, TreeResultContract> = new Map(
    fixtures.map((fixture) => [fixture.id, fixture.tree]),
  ),
): PresentationNodeSet {
  return fixtures.map((fixture) => {
    const tree = trees.get(fixture.id);
    if (!tree) {
      throw new Error(`Missing ${fixture.id} tree-result fixture.`);
    }
    return { reference: treeFixtureReference(tree), snapshot: tree };
  });
}

export function applyTreeResultFixtureIntent(
  tree: TreeResultContract,
  intent: TreeIntent,
): TreeResultContract {
  if (intent.resultId !== tree.id) {
    return tree;
  }

  if (intent.type === "treeItemSelection") {
    const item = findTreeItem(tree.items, intent.itemId);
    if (!item?.availability.available) {
      return tree;
    }

    return {
      ...tree,
      items: selectTreeItem(tree.items, item.id),
      selectedEditor: fixtureSelectedEditorForItem(tree, item),
    };
  }

  if (intent.type === "treeDisclosureOpenChange") {
    const disclosureItem = findTreeItem(tree.items, intent.itemId);
    if (
      !disclosureItem?.availability.available ||
      !disclosureItem.disclosure ||
      disclosureItem.disclosure.open === intent.open
    ) {
      return tree;
    }
    const updated = updateTreeItem(tree.items, intent.itemId, (item) =>
      item.disclosure
        ? {
            ...item,
            disclosure: {
              ...item.disclosure,
              accessibilityLabel: `${intent.open ? "Collapse" : "Expand"} ${item.label}`,
              intent: { ...item.disclosure.intent, open: !intent.open },
              open: intent.open,
            },
          }
        : item,
    );
    return updated === tree.items ? tree : { ...tree, items: updated };
  }

  if (intent.type === "treeContextAction") {
    const item = findTreeItem(tree.items, intent.itemId);
    const action = item?.contextActions.find(
      (candidate) => candidate.id === intent.actionId && candidate.availability.available,
    );
    if (!item?.availability.available || !action) {
      return tree;
    }

    return {
      ...tree,
      feedback: [
        ...tree.feedback,
        {
          detail: `${item.label} context action handled by the fixture host.`,
          id: `${action.id}:fixture:committed`,
          intent: "success",
          kind: "operationFeedbackEvent",
          status: "committed",
          title: action.control.accessibilityLabel,
        },
      ],
    };
  }

  if (intent.type === "treeChildVariantSelection") {
    return updateTreeChildCreation(tree, intent.parent, (creation) => {
      const variant = creation.variants.find(
        (candidate) => candidate.id === intent.variantId && candidate.availability.available,
      );
      if (!variant) {
        return creation;
      }

      return {
        ...creation,
        activeVariantId: variant.id,
        variants: creation.variants.map((candidate) => ({
          ...candidate,
          selected: candidate.id === variant.id,
        })),
      };
    });
  }

  if (intent.type === "treeCreate") {
    return updateTreeChildCreation(tree, intent.parent, (creation) => {
      const surface = creation.activeCreateSurface;
      if (!surface || surface.id !== intent.surfaceId || intent.intent.surfaceId !== surface.id) {
        return creation;
      }
      return {
        ...creation,
        activeCreateSurface: {
          ...surface,
          dialog: {
            ...surface.dialog,
            open: intent.intent.type === "createOpenChange" ? intent.intent.open : false,
          },
        },
      };
    });
  }

  if (intent.type === "treeField") {
    if (intent.target.kind === "create") {
      const target = intent.target;
      return updateTreeChildCreation(tree, target.parent, (creation) => {
        const surface = creation.activeCreateSurface;
        const field = surface?.dialog.form.fieldSet.fields.find(
          (candidate) => candidate.fieldId === intent.fieldId,
        );
        if (!surface || surface.id !== target.surfaceId || !field) {
          return creation;
        }
        const nextField = applyScenarioFieldIntent(field, intent.intent) as CreateFieldContract;
        if (nextField === field) {
          return creation;
        }
        return {
          ...creation,
          activeCreateSurface: {
            ...surface,
            dialog: {
              ...surface.dialog,
              form: {
                ...surface.dialog.form,
                fieldSet: {
                  ...surface.dialog.form.fieldSet,
                  fields: surface.dialog.form.fieldSet.fields.map((candidate) =>
                    candidate.fieldId === field.fieldId ? nextField : candidate,
                  ),
                },
              },
            },
          },
        };
      });
    }

    const editor = tree.selectedEditor;
    if (!editor || editor.itemId !== intent.target.itemId) {
      return tree;
    }

    const fieldSet =
      intent.target.kind === "placement" ? editor.placementFields : editor.childFields;
    if (!fieldSet || fieldSet.id !== intent.target.fieldSetId) {
      return tree;
    }

    const field = fieldSet.fields.find((candidate) => candidate.fieldId === intent.fieldId);
    if (!field) {
      return tree;
    }
    const nextField = applyScenarioFieldIntent(field, intent.intent);
    if (nextField === field) {
      return tree;
    }

    const nextFieldSet = {
      ...fieldSet,
      fields: fieldSet.fields.map((candidate) =>
        candidate.fieldId === field.fieldId ? nextField : candidate,
      ),
    };
    return {
      ...tree,
      selectedEditor: {
        ...editor,
        ...(intent.target.kind === "placement"
          ? { placementFields: nextFieldSet }
          : { childFields: nextFieldSet }),
      },
    };
  }

  if (intent.type === "treeOperation") {
    const editor = tree.selectedEditor;
    const control = editor?.removePlacement;
    if (
      !editor ||
      editor.itemId !== intent.itemId ||
      !control ||
      control.id !== intent.controlId ||
      intent.intent.controlId !== control.id
    ) {
      return tree;
    }

    if (intent.intent.type === "operationConfirmationOpenChange") {
      if (!control.confirmation) {
        return tree;
      }
      return {
        ...tree,
        selectedEditor: {
          ...editor,
          removePlacement: {
            ...control,
            confirmation: { ...control.confirmation, open: intent.intent.open },
          },
        },
      };
    }

    if (control.confirmation && !control.confirmation.open) {
      return tree;
    }

    const items = removeTreeItem(tree.items, editor.itemId);
    const fallback = firstAvailableTreeItem(items);
    return {
      ...tree,
      feedback: [
        ...tree.feedback,
        {
          detail: "Placement removed without deleting its child record.",
          id: `${control.id}:fixture:committed`,
          intent: "success",
          kind: "operationFeedbackEvent",
          status: "committed",
          title: "Placement removed",
        },
      ],
      items: fallback ? selectTreeItem(items, fallback.id) : items,
      selectedEditor: fallback ? fixtureSelectedEditorForItem(tree, fallback) : undefined,
    };
  }

  const item = findTreeItem(tree.items, intent.itemId);
  const action = item?.ordering?.actions.find(
    (candidate) =>
      candidate.id === intent.actionId &&
      candidate.direction === intent.direction &&
      candidate.intent.actionId === intent.actionId &&
      candidate.intent.itemId === intent.itemId,
  );
  if (
    !item?.availability.available ||
    !item.ordering ||
    item.ordering.pending ||
    !action?.structurallyAvailable ||
    action.disabled ||
    action.pending?.isPending
  ) {
    return tree;
  }

  const reordered = reorderTreeItem(tree.items, intent.itemId, intent.direction);
  return reordered === tree.items ? tree : { ...tree, items: reordered };
}
function updateTreeChildCreation(
  tree: TreeResultContract,
  parent: Extract<
    TreeIntent,
    {
      type: "treeChildVariantSelection";
    }
  >["parent"],
  update: (creation: TreeChildCreationContract) => TreeChildCreationContract,
) {
  if (parent.kind === "root") {
    if (!tree.rootChildCreation) {
      return tree;
    }
    const rootChildCreation = update(tree.rootChildCreation);
    return rootChildCreation === tree.rootChildCreation ? tree : { ...tree, rootChildCreation };
  }

  const editor = tree.selectedEditor;
  if (!editor?.childCreation || editor.itemId !== parent.itemId) {
    return tree;
  }
  const childCreation = update(editor.childCreation);
  return childCreation === editor.childCreation
    ? tree
    : { ...tree, selectedEditor: { ...editor, childCreation } };
}

function fixtureSelectedEditorForItem(
  tree: TreeResultContract,
  item: TreeItemContract,
): TreeSelectedEditorContract {
  if (tree.selectedEditor?.itemId === item.id) {
    return tree.selectedEditor;
  }

  const placementFields = emptyFixtureTreeFieldSet(
    `${tree.id}:${item.id}:placement-fields`,
    "Placement fields",
    tree.editing,
  );
  return {
    accessibilityLabel: `Edit ${item.label} placement and block`,
    availability: item.availability,
    ...(item.childRecordId
      ? {
          childFields: emptyFixtureTreeFieldSet(
            `${tree.id}:${item.id}:child-fields`,
            "Child fields",
            tree.editing,
          ),
          childRecordId: item.childRecordId,
        }
      : {}),
    editing: tree.editing,
    id: `${tree.id}:${item.id}:editor`,
    itemId: item.id,
    kind: "treeSelectedEditor",
    placementFields,
    placementId: item.placementId,
    warnings: item.warnings,
  };
}

function emptyFixtureTreeFieldSet(
  id: string,
  label: string,
  editing: TreeResultContract["editing"],
): FieldSetContract {
  return {
    disabled: !editing.enabled,
    ...(editing.enabled ? {} : { disabledReason: editing.disabledReason }),
    fields: [],
    id,
    kind: "fieldSet",
    label,
  };
}

function findTreeItem(
  items: readonly TreeItemContract[],
  itemId: string,
): TreeItemContract | undefined {
  for (const item of items) {
    if (item.id === itemId) {
      return item;
    }
    const child = findTreeItem(item.children, itemId);
    if (child) {
      return child;
    }
  }
  return undefined;
}

function firstAvailableTreeItem(items: readonly TreeItemContract[]): TreeItemContract | undefined {
  for (const item of items) {
    if (item.availability.available) {
      return item;
    }
    const child = firstAvailableTreeItem(item.children);
    if (child) {
      return child;
    }
  }
  return undefined;
}

function updateTreeItem(
  items: readonly TreeItemContract[],
  itemId: string,
  update: (item: TreeItemContract) => TreeItemContract,
): readonly TreeItemContract[] {
  let changed = false;
  const nextItems = items.map((item) => {
    if (item.id === itemId) {
      const nextItem = update(item);
      changed ||= nextItem !== item;
      return nextItem;
    }
    const children = updateTreeItem(item.children, itemId, update);
    if (children === item.children) {
      return item;
    }
    changed = true;
    return { ...item, children };
  });
  return changed ? nextItems : items;
}

function selectTreeItem(
  items: readonly TreeItemContract[],
  itemId: string,
): readonly TreeItemContract[] {
  return items.map((item) => ({
    ...item,
    children: selectTreeItem(item.children, itemId),
    selected: item.id === itemId,
  }));
}

function removeTreeItem(
  items: readonly TreeItemContract[],
  itemId: string,
): readonly TreeItemContract[] {
  return items
    .filter((item) => item.id !== itemId)
    .map((item) => ({ ...item, children: removeTreeItem(item.children, itemId) }));
}

function reorderTreeItem(
  items: readonly TreeItemContract[],
  itemId: string,
  direction: Extract<
    TreeIntent,
    {
      type: "treeReorder";
    }
  >["direction"],
): readonly TreeItemContract[] {
  const index = items.findIndex((item) => item.id === itemId);
  if (index >= 0) {
    const targetIndex =
      direction === "top"
        ? 0
        : direction === "up"
          ? Math.max(0, index - 1)
          : direction === "down"
            ? Math.min(items.length - 1, index + 1)
            : items.length - 1;
    if (targetIndex === index) {
      return items;
    }
    const reordered = [...items];
    const [item] = reordered.splice(index, 1);
    if (!item) {
      return items;
    }
    reordered.splice(targetIndex, 0, item);
    return reordered;
  }

  let changed = false;
  const nextItems = items.map((item) => {
    const children = reorderTreeItem(item.children, itemId, direction);
    if (children === item.children) {
      return item;
    }
    changed = true;
    return { ...item, children };
  });
  return changed ? nextItems : items;
}

function treeFixtureReference(tree: TreeResultContract) {
  return treeResultReference({
    resultId: tree.id,
    role: "mainResult",
    sectionId: "section:tree-result-fixtures",
    workspaceId: "workspace:tree-result-fixtures",
  });
}

const treeFixtureWorkspaceScope = {
  collectionId: "collection:tree-result-fixtures",
  screenId: "workspace:tree-result-fixtures",
  sectionId: "section:tree-result-fixtures",
} satisfies WorkspaceIntentScope;
