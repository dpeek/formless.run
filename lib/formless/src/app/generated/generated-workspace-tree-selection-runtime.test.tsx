// @vitest-environment jsdom

import { act, render, type RenderResult } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type {
  TreeChildCreationContract,
  TreeNodeContract,
  TreeOperationActionContract,
  TreeResultContract,
} from "@dpeek/formless-presentation/contract";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { ChangeRow } from "../../shared/protocol.ts";
import type { OperationInvocationResponse } from "../../shared/operation-invocation.ts";
import {
  applyBootstrapResponse,
  applyRecordMerge,
  getClientStoreSnapshot,
  resetClientStore,
} from "../../client/store.ts";
import { selectScreenModels } from "../../client/views.ts";
import { bootstrapResponse } from "../../test/protocol-builders.ts";
import { siteSourceSchema } from "../../test/schema-apps.ts";
import { testSiteRecords } from "../../test/site-records.ts";
import { projectGeneratedWorkspaceTreeIntent } from "./workspace-projection.ts";
import {
  useGeneratedWorkspaceRuntimeController,
  type GeneratedWorkspaceRuntimeController,
} from "./generated-workspace-runtime.tsx";

const submitOperationMock = vi.hoisted(() => vi.fn());
const listProgramDocumentMediaAssetsMock = vi.hoisted(() => vi.fn());
const listCoreImageMediaAssetsMock = vi.hoisted(() => vi.fn());

vi.mock("../../client/sync.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../client/sync.ts")>()),
  submitOperation: submitOperationMock,
}));

vi.mock("@dpeek/formless-media/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@dpeek/formless-media/client")>()),
  listProgramDocumentMediaAssets: listProgramDocumentMediaAssetsMock,
  listCoreImageMediaAssets: listCoreImageMediaAssetsMock,
}));

(
  globalThis as {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  resetClientStore();
  submitOperationMock.mockReset();
  listProgramDocumentMediaAssetsMock.mockReset();
  listProgramDocumentMediaAssetsMock.mockResolvedValue([]);
  listCoreImageMediaAssetsMock.mockReset();
  listCoreImageMediaAssetsMock.mockResolvedValue([]);
});

describe("generated workspace recursive tree runtime", () => {
  it("routes context and canonical record intents through exact node occurrences", async () => {
    applyBootstrapResponse(bootstrapResponse(siteSourceSchema, testSiteRecords));
    applyRecordMerge(
      [
        placement(
          "placement-header-context",
          "rec_site_content_home",
          "rec_site_content_group_header",
        ),
      ],
      undefined,
    );
    const onSelectContext = vi.fn();
    const mounted = await mountRuntime(onSelectContext);
    const tree = currentTree(mounted.controller());
    const headerNode = nodeForRecord(tree, "rec_site_content_group_header");
    const contextAction = treeContextAction(headerNode);

    await dispatchTreeIntent(mounted.controller(), contextAction.intent);
    expect(onSelectContext).toHaveBeenCalledWith(
      expect.objectContaining({ id: "site" }),
      "rec_site_content_group_header",
    );

    const heroNode = nodeForRecord(tree, "rec_site_block_home_hero");
    const editor = required(heroNode.editor);
    const field = required(editor.fields.find(({ fieldName }) => fieldName === "label"));
    const recordIntent = {
      intent: {
        fieldId: field.fieldId,
        intent: { fieldName: "label", type: "recordValueCommit" as const, value: "Next hero" },
        recordId: required(editor.selectedRecord).id,
        resultId: editor.id,
        type: "recordResultFieldIntent" as const,
      },
      nodeId: heroNode.id,
      resultId: tree.id,
      type: "treeRecordResult" as const,
    };

    await dispatchTreeIntent(mounted.controller(), {
      ...recordIntent,
      nodeId: `${heroNode.id}:stale`,
    });
    expect(submitOperationMock).not.toHaveBeenCalled();

    submitOperationMock.mockRejectedValueOnce(new Error("PRIVATE storage diagnostic"));
    await dispatchTreeIntent(mounted.controller(), recordIntent);
    expect(submitOperationMock).toHaveBeenCalledWith(
      "block",
      "update",
      expect.objectContaining({
        input: { label: "Next hero" },
        recordId: "rec_site_block_home_hero",
      }),
      undefined,
      {},
    );
    const failedField = required(
      nodeForRecord(
        currentTree(mounted.controller()),
        "rec_site_block_home_hero",
      ).editor?.fields.find(({ fieldName }) => fieldName === "label"),
    );
    expect(failedField).toMatchObject({ errors: [{ message: "Update failed. Try again." }] });
    expect(JSON.stringify(failedField)).not.toContain("PRIVATE");
    expect(JSON.stringify(currentTree(mounted.controller()))).not.toContain(
      '"type":"treeItemSelection"',
    );
    expect(JSON.stringify(currentTree(mounted.controller()))).not.toContain(
      '"type":"treeDisclosureOpenChange"',
    );

    await mounted.unmount();
  });

  it("creates and removes flat placements through ordinary recursive reprojection", async () => {
    applyBootstrapResponse(bootstrapResponse(siteSourceSchema, testSiteRecords));
    const feature = block("block-feature-create", "feature", "Feature create parent");
    const featurePlacement = placement(
      "placement-feature-create",
      "rec_site_content_home",
      feature.id,
    );
    applyRecordMerge([feature, featurePlacement], undefined);
    const mounted = await mountRuntime(() => {});
    let tree = currentTree(mounted.controller());
    let featureNode = nodeForRecord(tree, feature.id);
    const creation = childCreationAction(featureNode);
    const actionLink = required(creation.variants.find(({ label }) => label === "Action link"));

    await dispatchTreeIntent(mounted.controller(), actionLink.selectionIntent);
    expect(submitOperationMock).not.toHaveBeenCalled();
    tree = currentTree(mounted.controller());
    featureNode = nodeForRecord(tree, feature.id);
    let activeCreation = childCreationAction(featureNode);
    let surface = required(activeCreation.activeCreateSurface);
    expect(surface.dialog.open).toBe(true);

    for (const [fieldName, value] of [
      ["label", "Docs"],
      ["linkTargetMode", "external"],
    ] as const) {
      const field = required(
        surface.dialog.form.fieldSet.fields.find((candidate) => candidate.fieldName === fieldName),
      );
      await dispatchTreeIntent(mounted.controller(), {
        fieldId: field.fieldId,
        intent: {
          fieldName,
          fieldValue: { kind: "input", value },
          type: "createDraftChange",
        },
        nodeId: featureNode.id,
        resultId: tree.id,
        surfaceId: surface.id,
        type: "treeCreateField",
      });
      tree = currentTree(mounted.controller());
      featureNode = nodeForRecord(tree, feature.id);
      activeCreation = childCreationAction(featureNode);
      surface = required(activeCreation.activeCreateSurface);
    }

    const createdChild = block("block-created-link", "link", "Docs", {
      linkTargetMode: "external",
    });
    const createdPlacement = placement("placement-created-link", feature.id, createdChild.id, {
      slot: "actions",
    });
    let resolveCreate: ((response: OperationInvocationResponse) => void) | undefined;
    submitOperationMock.mockImplementationOnce(
      () =>
        new Promise<OperationInvocationResponse>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    let createSubmission: Promise<void> | void;
    await act(async () => {
      createSubmission = mounted.controller().dispatch(
        projectGeneratedWorkspaceTreeIntent(currentScope(mounted.controller()), tree.id, {
          intent: { surfaceId: surface.id, type: "createSubmit" },
          nodeId: featureNode.id,
          resultId: tree.id,
          surfaceId: surface.id,
          type: "treeCreate",
        }),
      );
      await Promise.resolve();
    });
    expect(
      childCreationAction(nodeForRecord(currentTree(mounted.controller()), feature.id))
        .activeCreateSurface?.dialog.form.submit,
    ).toMatchObject({ disabled: true, pending: { isPending: true } });
    await act(async () => {
      applyRecordMerge([createdChild, createdPlacement], undefined);
      required(resolveCreate)(commandResponse([createdChild, createdPlacement]));
      await createSubmission;
    });

    tree = currentTree(mounted.controller());
    const createdNode = nodeForRecord(tree, createdChild.id);
    expect(createdNode.id).toContain(`${featureNode.id}:placement:${createdPlacement.id}`);
    expect(
      childCreationAction(nodeForRecord(tree, feature.id)).activeCreateSurface,
    ).toBeUndefined();
    expect(submitOperationMock).toHaveBeenLastCalledWith(
      "block-placement",
      "addTreeChild",
      expect.objectContaining({
        input: {
          childValues: expect.objectContaining({ label: "Docs", type: "link" }),
          parentRecordId: feature.id,
          placementValues: { slot: "actions" },
        },
      }),
      undefined,
      {},
    );

    const removal = operationAction(createdNode, "placementRemoval");
    const openIntent = {
      controlId: removal.control.id,
      intent: removal.control.trigger.intent,
      nodeId: createdNode.id,
      resultId: tree.id,
      type: "treeOperation" as const,
    };
    await dispatchTreeIntent(mounted.controller(), openIntent);
    tree = currentTree(mounted.controller());
    const openRemoval = operationAction(nodeForRecord(tree, createdChild.id), "placementRemoval");
    const tombstone = {
      ...createdPlacement,
      deletedAt: "2026-08-11T03:00:00.000Z",
      updatedAt: "2026-08-11T03:00:00.000Z",
    };
    let resolveRemoval: ((response: OperationInvocationResponse) => void) | undefined;
    submitOperationMock.mockImplementationOnce(
      () =>
        new Promise<OperationInvocationResponse>((resolve) => {
          resolveRemoval = resolve;
        }),
    );
    let removalSubmission: Promise<void> | void;
    await act(async () => {
      removalSubmission = mounted.controller().dispatch(
        projectGeneratedWorkspaceTreeIntent(currentScope(mounted.controller()), tree.id, {
          ...openIntent,
          intent: required(openRemoval.control.confirmation).action.intent,
        }),
      );
      await Promise.resolve();
    });
    await act(async () => {
      applyRecordMerge([tombstone], undefined);
      required(resolveRemoval)(commandResponse([tombstone]));
      await removalSubmission;
    });

    expect(
      flattenNodes(required(currentTree(mounted.controller()).root)).some(
        ({ editor }) => editor?.selectedRecord?.id === createdChild.id,
      ),
    ).toBe(false);
    expect(getClientStoreSnapshot().recordsById[createdChild.id]?.deletedAt).toBeUndefined();
    expect(JSON.stringify(currentTree(mounted.controller()))).not.toContain("selectedEditor");

    await mounted.unmount();
  });

  it("executes occurrence-scoped ordering and root deletion with display-safe failures", async () => {
    applyBootstrapResponse(bootstrapResponse(siteSourceSchema, testSiteRecords));
    const root = block("ordering-root", "page", "Ordering root", { href: "/ordering" });
    const first = block("ordering-first", "markdown", "First");
    const second = block("ordering-second", "markdown", "Second");
    const firstPlacement = placement("ordering-placement-first", root.id, first.id, {
      order: 1000,
      slot: "main",
    });
    const secondPlacement = placement("ordering-placement-second", root.id, second.id, {
      order: 2000,
      slot: "main",
    });
    applyRecordMerge([root, first, second, firstPlacement, secondPlacement], undefined);
    const mounted = await mountRuntime(() => {}, root.id);
    let tree = currentTree(mounted.controller());
    const secondNode = nodeForRecord(tree, second.id);
    const ordering = orderingAction(secondNode);
    const moveUp = required(ordering.actions.find(({ direction }) => direction === "up"));

    await dispatchTreeIntent(mounted.controller(), {
      ...moveUp.intent,
      nodeId: `${secondNode.id}:stale`,
    });
    expect(submitOperationMock).not.toHaveBeenCalled();
    submitOperationMock.mockRejectedValueOnce(new Error("PRIVATE ordering failure"));
    await dispatchTreeIntent(mounted.controller(), moveUp.intent);
    expect(submitOperationMock).toHaveBeenCalledWith(
      "block-placement",
      "update",
      expect.objectContaining({ recordId: secondPlacement.id }),
      undefined,
      {},
    );
    expect(currentTree(mounted.controller()).feedback).toMatchObject([
      { detail: "Move failed. Try again.", status: "failed", title: "Move failed." },
    ]);
    expect(JSON.stringify(currentTree(mounted.controller()).feedback)).not.toContain("PRIVATE");

    tree = currentTree(mounted.controller());
    const treeRoot = required(tree.root);
    const rootDelete = operationAction(treeRoot, "rootDelete");
    await dispatchTreeIntent(mounted.controller(), {
      controlId: rootDelete.control.id,
      intent: rootDelete.control.trigger.intent,
      nodeId: treeRoot.id,
      resultId: tree.id,
      type: "treeOperation",
    });
    const openDelete = operationAction(
      required(currentTree(mounted.controller()).root),
      "rootDelete",
    );
    submitOperationMock.mockRejectedValueOnce(new Error("PRIVATE delete failure"));
    await dispatchTreeIntent(mounted.controller(), {
      controlId: openDelete.control.id,
      intent: required(openDelete.control.confirmation).action.intent,
      nodeId: treeRoot.id,
      resultId: tree.id,
      type: "treeOperation",
    });
    const failedDelete = operationAction(
      required(currentTree(mounted.controller()).root),
      "rootDelete",
    ).control;
    expect(failedDelete.status).toMatchObject({ status: "failed" });
    expect(JSON.stringify(failedDelete)).not.toContain("PRIVATE");

    await mounted.unmount();
  });
});

async function mountRuntime(
  onSelectContext: (section: unknown, recordId: string | null) => void,
  selectedContextRecordId = "rec_site_content_home",
) {
  const screen = required(
    selectScreenModels(siteSourceSchema).find(({ screenName }) => screenName === "siteEditor"),
  );
  let controller: GeneratedWorkspaceRuntimeController | undefined;
  let renderer: RenderResult | undefined;

  function RuntimeProbe() {
    controller = useGeneratedWorkspaceRuntimeController({
      getSectionSelection: () => ({ selectedContextRecordId }),
      onSelectContext,
      onSelectQuery: () => {},
      screen,
      today: "2026-08-11",
    });
    return null;
  }

  await act(async () => {
    renderer = render(<RuntimeProbe />);
  });
  return {
    controller: () => required(controller),
    unmount: async () => {
      await act(async () => required(renderer).unmount());
    },
  };
}

async function dispatchTreeIntent(
  controller: GeneratedWorkspaceRuntimeController,
  intent: Parameters<typeof projectGeneratedWorkspaceTreeIntent>[2],
) {
  await act(async () => {
    await controller.dispatch(
      projectGeneratedWorkspaceTreeIntent(
        currentScope(controller),
        currentTree(controller).id,
        intent,
      ),
    );
  });
}

function currentTree(controller: GeneratedWorkspaceRuntimeController): TreeResultContract {
  const result = required(controller.workspace?.sections[0]).collection.presentation.result;
  if (result.kind !== "treeResult") {
    throw new Error("Expected a tree result.");
  }
  return result;
}

function currentScope(controller: GeneratedWorkspaceRuntimeController) {
  const workspace = required(controller.workspace);
  const section = required(workspace.sections[0]);
  return { collectionId: section.collection.id, screenId: workspace.id, sectionId: section.id };
}

function nodeForRecord(tree: TreeResultContract, recordId: string): TreeNodeContract {
  return required(
    flattenNodes(required(tree.root)).find(({ editor }) => editor?.selectedRecord?.id === recordId),
  );
}

function flattenNodes(node: TreeNodeContract): TreeNodeContract[] {
  return [node, ...node.children.flatMap(flattenNodes)];
}

function childCreationAction(node: TreeNodeContract): TreeChildCreationContract {
  return required(
    node.headerActions.items.find(
      (item): item is TreeChildCreationContract => item.kind === "treeChildCreation",
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

function orderingAction(node: TreeNodeContract) {
  return required(
    node.headerActions.items.find(
      (
        item,
      ): item is Extract<
        TreeNodeContract["headerActions"]["items"][number],
        { kind: "treeOrderingAction" }
      > => item.kind === "treeOrderingAction",
    ),
  );
}

function block(
  id: string,
  type: string,
  label: string,
  values: StoredRecord["values"] = {},
): StoredRecord {
  return {
    createdAt: "2026-08-11T00:00:00.000Z",
    entity: "block",
    id,
    updatedAt: "2026-08-11T00:00:00.000Z",
    values: { label, site: "rec_site_settings_primary", type, ...values },
  };
}

function placement(
  id: string,
  parentId: string,
  childId: string,
  values: StoredRecord["values"] = {},
): StoredRecord {
  return {
    createdAt: "2026-08-11T00:00:01.000Z",
    entity: "block-placement",
    id,
    updatedAt: "2026-08-11T00:00:01.000Z",
    values: { block: childId, order: 4000, parent: parentId, ...values },
  };
}

function commandResponse(records: readonly StoredRecord[]): OperationInvocationResponse {
  const changes = records.map((record, index) => change(index + 1, record));
  return {
    invocation: {} as OperationInvocationResponse["invocation"],
    output: {
      affectedChangeIds: changes.map(({ writeId }) => writeId),
      changes,
      cursor: changes.length,
      type: "command",
    },
    status: "committed",
  };
}

function change(seq: number, storedRecord: StoredRecord): ChangeRow {
  return {
    createdAt: "2026-08-11T00:00:00.000Z",
    entity: storedRecord.entity,
    operationKind: "create",
    payload: storedRecord,
    recordId: storedRecord.id,
    seq,
    writeId: `write-${seq}`,
  };
}

function required<Value>(value: Value | null | undefined): Value {
  if (value === undefined || value === null) {
    throw new Error("Expected value.");
  }
  return value;
}
