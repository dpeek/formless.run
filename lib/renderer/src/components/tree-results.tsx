import { Heading } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type {
  CreateFieldContract,
  TreeIntent,
  TreeNodeActionContract,
  TreeNodeContract,
  TreeResultContract,
  TreeResultReference,
  WorkspaceIntentScope,
} from "@dpeek/formless-presentation/contract";
import {
  createMemoryPresentationHost,
  isWorkspaceIntent,
  treeResultReference,
  type MutablePresentationHost,
  type PresentationNodeSet,
} from "@dpeek/formless-presentation/host";
import { PresentationHostProvider } from "@dpeek/formless-presentation/host/react";
import { useState } from "react";
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
      if (
        intent.type !== "workspaceTree" ||
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
      if (nextTree !== tree) {
        trees.set(fixture.id, nextTree);
        host.publish(projectTreeResultFixtureNodes(fixtures, trees));
      }
    },
    nodes: projectTreeResultFixtureNodes(fixtures, trees),
  });

  return {
    fixtures,
    getTree: (fixtureId) => required(trees.get(fixtureId), `Missing ${fixtureId} tree fixture.`),
    host,
    referenceFor: (fixtureId) =>
      required(references.get(fixtureId), `Missing ${fixtureId} tree fixture reference.`),
  };
}

export function projectTreeResultFixtureNodes(
  fixtures: readonly TreeResultFixture[],
  trees: ReadonlyMap<TreeResultFixtureId, TreeResultContract> = new Map(
    fixtures.map((fixture) => [fixture.id, fixture.tree]),
  ),
): PresentationNodeSet {
  return fixtures.map((fixture) => ({
    reference: treeFixtureReference(fixture.tree),
    snapshot: required(trees.get(fixture.id), `Missing ${fixture.id} tree fixture.`),
  }));
}

export function applyTreeResultFixtureIntent(
  tree: TreeResultContract,
  intent: TreeIntent,
): TreeResultContract {
  if (intent.resultId !== tree.id || tree.availability.state !== "ready" || !tree.root) {
    return tree;
  }

  if (intent.type === "treeContextAction") {
    const node = findTreeNode(tree.root, intent.nodeId);
    const action = node?.headerActions.items.find(
      (candidate) => candidate.kind === "treeContextAction" && candidate.id === intent.actionId,
    );
    if (
      !node?.availability.available ||
      !action ||
      action.kind !== "treeContextAction" ||
      !action.availability.available
    ) {
      return tree;
    }
    return {
      ...tree,
      feedback: [
        ...tree.feedback,
        {
          detail: `${node.label} context navigation dispatched by the fixture host.`,
          id: `${action.id}:fixture`,
          intent: "success",
          kind: "operationFeedbackEvent",
          status: "committed",
          title: action.control.accessibilityLabel,
        },
      ],
    };
  }

  if (intent.type === "treeReorder") {
    const root = reorderTreeNode(tree.root, intent.nodeId, intent.direction);
    return root === tree.root ? tree : { ...tree, root };
  }

  const root = updateTreeNode(tree.root, intent.nodeId, (node) => {
    if (intent.type === "treeRecordResult") {
      const editor = node.editor;
      const nested = intent.intent;
      if (!editor || nested.resultId !== editor.id || nested.type !== "recordResultFieldIntent") {
        return node;
      }
      const field = editor.fields.find((candidate) => candidate.fieldId === nested.fieldId);
      if (!field) {
        return node;
      }
      const nextField = applyScenarioFieldIntent(field, nested.intent);
      return nextField === field
        ? node
        : {
            ...node,
            editor: {
              ...editor,
              fields: editor.fields.map((candidate) =>
                candidate.fieldId === field.fieldId ? nextField : candidate,
              ),
            },
          };
    }

    if (intent.type === "treeChildVariantSelection") {
      return updateTreeNodeAction(node, (action) => {
        if (
          action.kind !== "treeChildCreation" ||
          !action.variants.some((variant) => variant.id === intent.variantId)
        ) {
          return action;
        }
        return {
          ...action,
          activeVariantId: intent.variantId,
          variants: action.variants.map((variant) => ({
            ...variant,
            selected: variant.id === intent.variantId,
          })),
        };
      });
    }

    if (intent.type === "treeCreate") {
      return updateTreeNodeAction(node, (action) => {
        const surface =
          action.kind === "treeChildCreation" ? action.activeCreateSurface : undefined;
        if (!surface || surface.id !== intent.surfaceId || intent.intent.surfaceId !== surface.id) {
          return action;
        }
        return {
          ...action,
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

    if (intent.type === "treeCreateField") {
      return updateTreeNodeAction(node, (action) => {
        const surface =
          action.kind === "treeChildCreation" ? action.activeCreateSurface : undefined;
        const field = surface?.dialog.form.fieldSet.fields.find(
          (candidate) => candidate.fieldId === intent.fieldId,
        );
        if (!surface || surface.id !== intent.surfaceId || !field) {
          return action;
        }
        const nextField = applyScenarioFieldIntent(field, intent.intent) as CreateFieldContract;
        return nextField === field
          ? action
          : {
              ...action,
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

    if (intent.type === "treeOperation") {
      return updateTreeNodeAction(node, (action) => {
        if (
          action.kind !== "operationAction" ||
          action.control.id !== intent.controlId ||
          intent.intent.controlId !== action.control.id ||
          intent.intent.type !== "operationConfirmationOpenChange" ||
          !action.control.confirmation
        ) {
          return action;
        }
        return {
          ...action,
          control: {
            ...action.control,
            confirmation: { ...action.control.confirmation, open: intent.intent.open },
          },
        };
      });
    }

    return node;
  });

  return root === tree.root ? tree : { ...tree, root };
}

function updateTreeNode(
  node: TreeNodeContract,
  nodeId: string,
  update: (node: TreeNodeContract) => TreeNodeContract,
): TreeNodeContract {
  if (node.id === nodeId) {
    return update(node);
  }

  let changed = false;
  const children = node.children.map((child) => {
    const next = updateTreeNode(child, nodeId, update);
    changed ||= next !== child;
    return next;
  });
  return changed ? { ...node, children } : node;
}

function updateTreeNodeAction(
  node: TreeNodeContract,
  update: (action: TreeNodeActionContract) => TreeNodeActionContract,
) {
  let changed = false;
  const items = node.headerActions.items.map((action) => {
    const next = update(action);
    changed ||= next !== action;
    return next;
  });
  return changed ? { ...node, headerActions: { ...node.headerActions, items } } : node;
}

function reorderTreeNode(
  node: TreeNodeContract,
  nodeId: string,
  direction: Extract<TreeIntent, { type: "treeReorder" }>["direction"],
): TreeNodeContract {
  const index = node.children.findIndex((child) => child.id === nodeId);
  if (index >= 0) {
    const target =
      direction === "top"
        ? 0
        : direction === "up"
          ? Math.max(0, index - 1)
          : direction === "down"
            ? Math.min(node.children.length - 1, index + 1)
            : node.children.length - 1;
    if (target === index) {
      return node;
    }
    const children = [...node.children];
    const [moved] = children.splice(index, 1);
    if (!moved) {
      return node;
    }
    children.splice(target, 0, moved);
    return { ...node, children };
  }

  let changed = false;
  const children = node.children.map((child) => {
    const next = reorderTreeNode(child, nodeId, direction);
    changed ||= next !== child;
    return next;
  });
  return changed ? { ...node, children } : node;
}

function findTreeNode(node: TreeNodeContract, nodeId: string): TreeNodeContract | undefined {
  if (node.id === nodeId) {
    return node;
  }
  for (const child of node.children) {
    const found = findTreeNode(child, nodeId);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function treeFixtureReference(tree: TreeResultContract) {
  return treeResultReference({
    resultId: tree.id,
    role: "mainResult",
    sectionId: treeFixtureWorkspaceScope.sectionId,
    workspaceId: treeFixtureWorkspaceScope.screenId,
  });
}

const treeFixtureWorkspaceScope = {
  collectionId: "collection:tree-result-fixtures",
  screenId: "workspace:tree-result-fixtures",
  sectionId: "section:tree-result-fixtures",
} satisfies WorkspaceIntentScope;

function required<Value>(value: Value | undefined, message: string): Value {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}
