import { describe, expect, it } from "vite-plus/test";
import type {
  OperationControlContract,
  TreeChildCreationContract,
  TreeNodeContract,
  TreeOperationActionContract,
  TreeOrderingContract,
  TreeRecordResultIntent,
} from "@dpeek/formless-presentation/contract";
import type { StoredRecord } from "@dpeek/formless-storage";
import { selectTreeResultModel, type TreeResultModel } from "../../client/tree-result-model.ts";
import { selectScreenModels } from "../../client/views.ts";
import { siteSourceSchema } from "../../test/schema-apps.ts";
import {
  resolveGeneratedTreeChildVariantSelectionIntent,
  resolveGeneratedTreeContextActionIntent,
  resolveGeneratedTreeCreateFieldIntent,
  resolveGeneratedTreeCreateIntent,
  resolveGeneratedTreeOperationIntent,
  resolveGeneratedTreeRecordResultIntent,
  resolveGeneratedTreeReorderIntent,
  selectGeneratedTreeFoundation,
} from "./generated-tree-foundation.ts";

describe("generated tree foundation", () => {
  it("projects heterogeneous flat records into recursive path-scoped record nodes", () => {
    const resultId = "tree:recursive";
    const root = block("root", "page", "Root", { href: "/" });
    const branch = block("branch", "group", "Branch");
    const leaf = block("leaf", "card", "Leaf");
    const deep = block("deep", "section", "Deep");
    const records = [
      root,
      branch,
      leaf,
      deep,
      placement("placement-branch", root.id, branch.id, 1000, { slot: "main" }),
      placement("placement-leaf-a", root.id, leaf.id, 2000, { slot: "main" }),
      placement("placement-leaf-b", root.id, leaf.id, 3000, { slot: "main" }),
      placement("placement-missing", branch.id, "missing", 1000),
      placement("placement-cycle", branch.id, root.id, 2000),
      placement("placement-deep", branch.id, deep.id, 3000),
      placement("placement-cut", deep.id, leaf.id, 1000),
    ];
    const foundation = selectGeneratedTreeFoundation({
      id: resultId,
      recordsById: recordsById(records),
      result: { ...siteTreeResult(), maxDepth: 1 },
      rootRecordId: root.id,
    });
    const treeRoot = required(foundation.tree.root);
    const branchNode = required(treeRoot.children[0]);
    const duplicateLeaves = treeRoot.children.filter(({ label }) => label === "Leaf");

    expect(foundation.tree).toMatchObject({
      accessibilityLabel: "Root tree",
      availability: { state: "ready" },
      editing: { enabled: true },
      kind: "treeResult",
      root: {
        editor: { id: `${resultId}:root:root:editor`, kind: "recordResult" },
        entityTypeLabel: "Page",
        id: `${resultId}:root:root`,
        kind: "treeNode",
        label: "Root",
      },
    });
    expect(treeRoot.children.map(({ label }) => label)).toEqual(["Branch", "Leaf", "Leaf"]);
    expect(branchNode.children).toMatchObject([
      {
        children: [],
        label: "Missing child",
        structure: { message: "Child record is unavailable.", state: "missingChild" },
      },
      {
        children: [],
        editor: { kind: "recordResult" },
        label: "Root",
        structure: { message: "Cycle stopped at this item.", state: "cycleStopped" },
      },
      {
        children: [],
        editor: { kind: "recordResult" },
        label: "Deep",
        structure: { message: "Maximum tree depth reached.", state: "depthStopped" },
      },
    ]);
    expect(branchNode.children[0]).not.toHaveProperty("editor");
    expect(duplicateLeaves).toHaveLength(2);
    expect(duplicateLeaves[0]?.id).not.toBe(duplicateLeaves[1]?.id);
    expect(duplicateLeaves[0]?.editor?.id).not.toBe(duplicateLeaves[1]?.editor?.id);
    expect(duplicateLeaves.map(({ editor }) => editor?.selectedRecord?.id)).toEqual([
      leaf.id,
      leaf.id,
    ]);
    expect(foundation.runtimePlan.recordResults.map(({ nodeId }) => nodeId).sort()).toEqual(
      flattenNodes(treeRoot)
        .filter(({ editor }) => editor !== undefined)
        .map(({ id }) => id)
        .sort(),
    );
    const projected = JSON.stringify(foundation.tree);
    expect(projected).not.toContain("selectedEditor");
    expect(projected).not.toContain('"type":"treeItemSelection"');
    expect(projected).not.toContain('"type":"treeDisclosureOpenChange"');
    expect(projected).not.toContain("placementFields");
  });

  it("scopes canonical editors, context navigation, and child creation to each node", () => {
    const resultId = "tree:intents";
    const root = block("root", "page", "Root", { href: "/" });
    const header = block("header", "header", "Header");
    const records = [root, header, placement("placement-header", root.id, header.id, 1000)];
    const initial = selectGeneratedTreeFoundation({
      context: siteContext(),
      id: resultId,
      recordsById: recordsById(records),
      result: siteTreeResult(),
      rootRecordId: root.id,
      selectableContextRecordIds: new Set([header.id]),
    });
    const treeRoot = required(initial.tree.root);
    const headerNode = required(treeRoot.children[0]);
    const labelField = required(
      treeRoot.editor?.fields.find(({ fieldName }) => fieldName === "label"),
    );
    const recordIntent: TreeRecordResultIntent = {
      intent: {
        fieldId: labelField.fieldId,
        intent: { fieldName: "label", type: "recordEditorDraftChange", value: "Next" },
        recordId: root.id,
        resultId: required(treeRoot.editor).id,
        type: "recordResultFieldIntent",
      },
      nodeId: treeRoot.id,
      resultId,
      type: "treeRecordResult",
    };
    const contextAction = treeContextAction(headerNode);
    const rootCreation = childCreationAction(treeRoot);
    const markdownVariant = required(
      rootCreation.variants.find(({ label }) => label === "Markdown"),
    );

    expect(resolveGeneratedTreeRecordResultIntent(initial.runtimePlan, recordIntent)).toMatchObject(
      {
        node: { nodeId: treeRoot.id, recordId: root.id },
        runtime: { fieldId: labelField.fieldId, kind: "field" },
      },
    );
    expect(
      resolveGeneratedTreeRecordResultIntent(initial.runtimePlan, {
        ...recordIntent,
        nodeId: `${treeRoot.id}:stale`,
      }),
    ).toBeUndefined();
    expect(
      resolveGeneratedTreeContextActionIntent(initial.runtimePlan, contextAction.intent),
    ).toMatchObject({ nodeId: headerNode.id, recordId: header.id });
    expect(
      resolveGeneratedTreeContextActionIntent(initial.runtimePlan, {
        ...contextAction.intent,
        nodeId: treeRoot.id,
      }),
    ).toBeUndefined();
    expect(
      resolveGeneratedTreeChildVariantSelectionIntent(
        initial.runtimePlan,
        markdownVariant.selectionIntent,
      ),
    ).toMatchObject({ nodeId: treeRoot.id, parentRecordId: root.id });

    const active = selectGeneratedTreeFoundation({
      childCreation: {
        activeVariantIdByCreationId: { [rootCreation.id]: markdownVariant.id },
        createOpenBySurfaceId: { [`${markdownVariant.id}:create`]: true },
      },
      id: resultId,
      recordsById: recordsById(records),
      result: siteTreeResult(),
      rootRecordId: root.id,
    });
    const activeRoot = required(active.tree.root);
    const activeCreation = childCreationAction(activeRoot);
    const surface = required(activeCreation.activeCreateSurface);
    const field = required(surface.dialog.form.fieldSet.fields[0]);
    const createIntent = {
      intent: { surfaceId: surface.id, type: "createSubmit" as const },
      nodeId: activeRoot.id,
      resultId,
      surfaceId: surface.id,
      type: "treeCreate" as const,
    };
    const fieldIntent = {
      fieldId: field.fieldId,
      intent: {
        fieldName: field.fieldName,
        fieldValue: { kind: "input" as const, value: "Child" },
        type: "createDraftChange" as const,
      },
      nodeId: activeRoot.id,
      resultId,
      surfaceId: surface.id,
      type: "treeCreateField" as const,
    };

    expect(resolveGeneratedTreeCreateIntent(active.runtimePlan, createIntent)).toMatchObject({
      nodeId: activeRoot.id,
      surfaceId: surface.id,
    });
    expect(resolveGeneratedTreeCreateFieldIntent(active.runtimePlan, fieldIntent)).toMatchObject({
      field: { fieldId: field.fieldId },
      runtime: { nodeId: activeRoot.id },
    });
    expect(
      resolveGeneratedTreeCreateIntent(active.runtimePlan, {
        ...createIntent,
        nodeId: `${activeRoot.id}:stale`,
      }),
    ).toBeUndefined();
  });

  it("orders one node action group and keeps root deletion separate from placement removal", () => {
    const resultId = "tree:actions";
    const root = block("root", "page", "Root", { href: "/" });
    const first = block("first", "header", "First");
    const second = block("second", "markdown", "Second");
    const firstPlacement = placement("placement-first", root.id, first.id, 1000, { slot: "main" });
    const secondPlacement = placement("placement-second", root.id, second.id, 2000, {
      slot: "main",
    });
    const records = [root, first, second, firstPlacement, secondPlacement];
    const foundation = selectGeneratedTreeFoundation({
      context: siteContext(),
      id: resultId,
      recordsById: recordsById(records),
      result: siteTreeResult(),
      rootRecordId: root.id,
      selectableContextRecordIds: new Set([first.id]),
    });
    const treeRoot = required(foundation.tree.root);
    const firstNode = required(treeRoot.children[0]);
    const secondNode = required(treeRoot.children[1]);
    const rootDelete = operationAction(treeRoot, "rootDelete");
    const removal = operationAction(firstNode, "placementRemoval");
    const ordering = orderingAction(secondNode);
    const moveUp = required(ordering.actions.find(({ direction }) => direction === "up"));

    expect(treeRoot.headerActions.items.map(actionKind)).toEqual(["childCreation", "rootDelete"]);
    expect(firstNode.headerActions.items.map(actionKind)).toEqual([
      "context",
      "ordering",
      "placementRemoval",
    ]);
    expect(secondNode.headerActions.items.map(actionKind)).toEqual([
      "ordering",
      "placementRemoval",
    ]);
    expect(firstNode.editor?.actions.secondary).toEqual([]);
    expect(
      resolveGeneratedTreeOperationIntent(foundation.runtimePlan, {
        controlId: rootDelete.control.id,
        intent: rootDelete.control.trigger.intent,
        nodeId: treeRoot.id,
        resultId,
        type: "treeOperation",
      }),
    ).toMatchObject({ kind: "rootDelete", recordId: root.id });
    expect(
      resolveGeneratedTreeOperationIntent(foundation.runtimePlan, {
        controlId: removal.control.id,
        intent: removal.control.trigger.intent,
        nodeId: firstNode.id,
        resultId,
        type: "treeOperation",
      }),
    ).toMatchObject({ kind: "placementRemoval", placementId: firstPlacement.id });
    expect(resolveGeneratedTreeReorderIntent(foundation.runtimePlan, moveUp.intent)).toMatchObject({
      nodeId: secondNode.id,
      placementId: secondPlacement.id,
    });
    expect(
      resolveGeneratedTreeOperationIntent(foundation.runtimePlan, {
        controlId: removal.control.id,
        intent: removal.control.trigger.intent,
        nodeId: secondNode.id,
        resultId,
        type: "treeOperation",
      }),
    ).toBeUndefined();
  });

  it("projects readiness, missing-child removal, pending ordering, and safe failures", () => {
    const resultId = "tree:states";
    const root = block("root", "page", "Root");
    const child = block("child", "markdown", "Child");
    const childPlacement = placement("placement-child", root.id, child.id, 1000, { slot: "main" });
    const missingPlacement = placement("placement-missing", root.id, "missing", 2000, {
      slot: "main",
    });
    const records = [root, child, childPlacement, missingPlacement];
    const initial = selectGeneratedTreeFoundation({
      id: resultId,
      recordsById: recordsById(records),
      result: siteTreeResult(),
      rootRecordId: root.id,
    });
    const initialRoot = required(initial.tree.root);
    const initialChild = required(initialRoot.children[0]);
    const initialMissing = required(initialRoot.children[1]);
    const orderingRuntime = required(
      initial.runtimePlan.orderings.find(
        ({ nodeId, item }) => nodeId === initialChild.id && item.direction === "down",
      ),
    );
    const removal = operationAction(initialMissing, "placementRemoval");
    const removalRuntime = required(
      initial.runtimePlan.removePlacementByControlId.get(removal.control.id),
    );
    const projected = selectGeneratedTreeFoundation({
      id: resultId,
      ordering: {
        operationStateByExecutionKey: {
          [orderingRuntime.binding.executionKey]: {
            executionKey: orderingRuntime.binding.executionKey,
            status: "pending",
          },
        },
      },
      placementRemoval: {
        confirmationOpenByControlId: { [removal.control.id]: true },
        operationStateByExecutionKey: {
          [removalRuntime.binding.executionKey]: {
            executionKey: removalRuntime.binding.executionKey,
            result: { displayError: "PRIVATE", type: "failed" },
            status: "failed",
          },
        },
      },
      recordsById: recordsById(records),
      result: siteTreeResult(),
      rootRecordId: root.id,
    });
    const rootNode = required(projected.tree.root);
    const childNode = required(rootNode.children[0]);
    const missingNode = required(rootNode.children[1]);
    const pendingOrdering = orderingAction(childNode);
    const failedRemoval = operationAction(missingNode, "placementRemoval").control;

    expect(rootNode.warnings).toMatchObject([
      { items: [{ code: "block-route" }], source: "child" },
    ]);
    expect(missingNode).toMatchObject({
      structure: { state: "missingChild" },
      warnings: [{ items: [{ code: "placement-block-child" }], source: "placement" }],
    });
    expect(missingNode).not.toHaveProperty("editor");
    expect(childCreationActionOrUndefined(missingNode)).toBeUndefined();
    expect(pendingOrdering).toMatchObject({ pending: true });
    expect(
      pendingOrdering.actions.every(({ disabled, pending }) => disabled && pending?.isPending),
    ).toBe(true);
    expect(failedRemoval).toMatchObject({
      confirmation: { open: true },
      feedback: { detail: "Remove failed. Try again.", status: "failed" },
      status: { detail: "Remove failed. Try again.", status: "failed" },
    });
    expect(JSON.stringify(failedRemoval)).not.toContain("PRIVATE");
  });

  it("projects empty and unavailable states without recursive authoring state", () => {
    const unavailable = selectGeneratedTreeFoundation({
      id: "tree:unavailable",
      recordsById: {},
      result: siteTreeResult(),
    });
    const empty = selectGeneratedTreeFoundation({
      emptyStateAction: {
        control: idleOperationControl("create-starter"),
        kind: "operationAction",
        role: "command",
      },
      id: "tree:empty",
      recordsById: {},
      result: siteTreeResult(),
    });

    expect(unavailable.tree).toMatchObject({
      availability: { message: "Select a tree root to continue.", state: "unavailable" },
      editing: { enabled: false },
    });
    expect(empty.tree).toMatchObject({
      availability: {
        emptyState: { action: { kind: "operationAction" }, kind: "treeEmptyState" },
        state: "empty",
      },
    });
    expect(unavailable.tree).not.toHaveProperty("root");
    expect(empty.tree).not.toHaveProperty("root");
    expect(unavailable.runtimePlan.recordResults).toEqual([]);
    expect(empty.runtimePlan.childCreateBySurfaceId.size).toBe(0);
  });
});

function siteTreeResult(): TreeResultModel {
  const view = siteSourceSchema.views.find(({ key }) => key === "siteCompositionHome");
  const placementEntity = siteSourceSchema.entities.find(({ key }) => key === "block-placement");
  if (view?.type !== "collection" || view.result.type !== "tree" || placementEntity === undefined) {
    throw new Error("Missing Site composition tree view.");
  }
  return selectTreeResultModel(siteSourceSchema, view.result, "block-placement", placementEntity);
}

function siteContext() {
  const screen = required(
    selectScreenModels(siteSourceSchema).find(({ screenName }) => screenName === "siteEditor"),
  );
  return required(screen.layout.sections.find(({ id }) => id === "site")?.collection.context);
}

function childCreationAction(node: TreeNodeContract): TreeChildCreationContract {
  return required(childCreationActionOrUndefined(node));
}

function childCreationActionOrUndefined(
  node: TreeNodeContract,
): TreeChildCreationContract | undefined {
  return node.headerActions.items.find(
    (item): item is TreeChildCreationContract => item.kind === "treeChildCreation",
  );
}

function orderingAction(node: TreeNodeContract): TreeOrderingContract {
  return required(
    node.headerActions.items.find(
      (item): item is TreeOrderingContract => item.kind === "treeOrderingAction",
    ),
  );
}

function operationAction(
  node: TreeNodeContract,
  role: TreeOperationActionContract["role"],
): TreeOperationActionContract {
  return required(
    node.headerActions.items.find(
      (item): item is TreeOperationActionContract =>
        item.kind === "operationAction" && item.role === role,
    ),
  );
}

function treeContextAction(node: TreeNodeContract) {
  return required(
    node.headerActions.items.find(
      (
        item,
      ): item is Extract<
        TreeNodeContract["headerActions"]["items"][number],
        { kind: "treeContextAction" }
      > => item.kind === "treeContextAction",
    ),
  );
}

function actionKind(item: TreeNodeContract["headerActions"]["items"][number]): string {
  if (item.kind === "treeChildCreation") return "childCreation";
  if (item.kind === "treeContextAction") return "context";
  if (item.kind === "treeOrderingAction") return "ordering";
  return item.role;
}

function flattenNodes(root: TreeNodeContract): TreeNodeContract[] {
  return [root, ...root.children.flatMap(flattenNodes)];
}

function block(
  id: string,
  type: string,
  label: string,
  values: StoredRecord["values"] = {},
): StoredRecord {
  return record(id, "block", { label, site: "site", type, ...values });
}

function placement(
  id: string,
  parent: string,
  child: string,
  order: number,
  values: StoredRecord["values"] = {},
): StoredRecord {
  return record(id, "block-placement", { block: child, order, parent, ...values });
}

function record(id: string, entity: string, values: StoredRecord["values"]): StoredRecord {
  return {
    createdAt: `2026-08-11T00:00:${id.length.toString().padStart(2, "0")}.000Z`,
    entity,
    id,
    updatedAt: "2026-08-11T01:00:00.000Z",
    values,
  };
}

function recordsById(records: readonly StoredRecord[]): Record<string, StoredRecord> {
  return Object.fromEntries(records.map((record) => [record.id, record]));
}

function idleOperationControl(id: string): OperationControlContract {
  return {
    id,
    kind: "operationControl",
    status: {
      accessibilityLabel: "Ready",
      detail: "Ready",
      id: `${id}:status`,
      intent: "neutral",
      kind: "compactStatus",
      label: "Ready",
      status: "idle",
    },
    trigger: {
      accessibilityLabel: "Create starter",
      content: { kind: "label", label: "Create starter" },
      density: "default",
      id: `${id}:trigger`,
      intent: { controlId: id, invocationSource: "button", type: "operationInvoke" },
      kind: "button",
      prominence: "primary",
      type: "button",
    },
  };
}

function required<Value>(value: Value | null | undefined): Value {
  if (value === undefined || value === null) {
    throw new Error("Expected value.");
  }
  return value;
}
