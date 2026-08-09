import { describe, expect, it } from "vite-plus/test";
import type {
  OperationControlContract,
  TreeItemContract,
} from "@dpeek/formless-presentation/contract";
import type { StoredRecord } from "@dpeek/formless-storage";
import { selectTreeResultModel, type TreeResultModel } from "../../client/tree-result-model.ts";
import { selectScreenModels } from "../../client/views.ts";
import { siteSourceSchema } from "../../test/schema-apps.ts";
import {
  createGeneratedRecordResultFieldAuthoringState,
  type GeneratedRecordResultRecordState,
} from "./generated-record-result-foundation.ts";
import {
  resolveGeneratedTreeChildVariantSelectionIntent,
  resolveGeneratedTreeContextActionIntent,
  resolveGeneratedTreeCreateFieldIntent,
  resolveGeneratedTreeCreateIntent,
  resolveGeneratedTreeDisclosureIntent,
  resolveGeneratedTreeFieldIntent,
  resolveGeneratedTreeOperationIntent,
  resolveGeneratedTreeReorderIntent,
  selectGeneratedTreeFoundation,
} from "./generated-tree-foundation.ts";

describe("generated tree foundation", () => {
  it("projects ordered flat placements into structural tree items without runtime data", () => {
    const resultId = "workspace:site:section:composition:collection:site:result:blockTreeNode";
    const records = [
      block("root", "page", "Root"),
      block("branch", "group", "Branch"),
      block("leaf", "card", "Leaf"),
      block("deep", "section", "Deep branch"),
      block("cut", "markdown", "Cut child"),
      placement("placement-leaf", "root", "leaf", 2000, { slot: "main" }),
      placement("placement-branch", "root", "branch", 1000, { slot: "main" }),
      placement("placement-missing", "branch", "missing", 1000),
      placement("placement-cycle", "branch", "root", 2000),
      placement("placement-deep", "branch", "deep", 3000),
      placement("placement-cut", "deep", "cut", 1000),
      {
        ...placement("placement-deleted", "root", "cut", 500),
        deletedAt: "2026-07-18T00:00:00.000Z",
      },
    ];
    const recordsById = Object.fromEntries(records.map((record) => [record.id, record]));
    const foundation = selectGeneratedTreeFoundation({
      id: resultId,
      recordsById,
      result: { ...siteTreeResult(), maxDepth: 1 },
      rootRecordId: "root",
    });
    const [branch, leaf] = foundation.tree.items;

    expect(foundation.tree).toMatchObject({
      accessibilityLabel: "Root tree",
      availability: { state: "ready" },
      editing: { enabled: true },
      id: resultId,
      kind: "treeResult",
      root: {
        accessibilityLabel: "Root tree root",
        id: `${resultId}:root:root`,
        label: "Root",
      },
    });
    expect(foundation.tree.items.map((item) => item.placementId)).toEqual([
      "placement-branch",
      "placement-leaf",
    ]);
    expect(branch).toMatchObject({
      availability: { available: true },
      childRecordId: "branch",
      disclosure: {
        accessibilityLabel: "Collapse Branch",
        intent: {
          itemId: `${resultId}:item:placement-branch`,
          open: false,
          resultId,
          type: "treeDisclosureOpenChange",
        },
        open: true,
      },
      id: `${resultId}:item:placement-branch`,
      label: "Branch",
      placementId: "placement-branch",
      selected: true,
      selectionIntent: {
        itemId: `${resultId}:item:placement-branch`,
        resultId,
        type: "treeItemSelection",
      },
      slot: { label: "Main" },
      structure: { state: "branch" },
      variant: { id: `${resultId}:item:placement-branch:variant:group`, label: "Group" },
    });
    expect(branch?.id).not.toBe(branch?.placementId);
    expect(branch?.id).not.toBe(branch?.childRecordId);
    expect(branch?.children).toMatchObject([
      {
        availability: { available: true },
        childRecordId: "missing",
        children: [],
        placementId: "placement-missing",
        structure: { message: "Child record is unavailable.", state: "missingChild" },
      },
      {
        childRecordId: "root",
        children: [],
        placementId: "placement-cycle",
        structure: { message: "Cycle stopped at this item.", state: "cycleStopped" },
      },
      {
        childRecordId: "deep",
        children: [],
        placementId: "placement-deep",
        structure: { message: "Maximum tree depth reached.", state: "depthStopped" },
      },
    ]);
    expect(leaf).toMatchObject({
      childRecordId: "leaf",
      children: [],
      placementId: "placement-leaf",
      structure: { state: "leaf" },
      variant: { label: "Card" },
    });
    expect(foundation.runtimePlan.selectedPlacementId).toBe("placement-branch");
    expect(
      resolveGeneratedTreeDisclosureIntent(
        foundation.runtimePlan,
        required(branch?.disclosure).intent,
      ),
    ).toEqual({ itemId: branch?.id, open: false });
    expect(
      resolveGeneratedTreeDisclosureIntent(foundation.runtimePlan, {
        ...required(branch?.disclosure).intent,
        open: true,
      }),
    ).toBeUndefined();
    const collapsed = selectGeneratedTreeFoundation({
      disclosureOpenByItemId: { [required(branch).id]: false },
      id: resultId,
      recordsById,
      result: { ...siteTreeResult(), maxDepth: 1 },
      rootRecordId: "root",
    });
    expect(required(collapsed.tree.items[0]).disclosure).toMatchObject({
      accessibilityLabel: "Expand Branch",
      intent: { open: true },
      open: false,
    });
    expect(foundation.tree.selectedEditor).toMatchObject({
      accessibilityLabel: "Edit Branch",
      childRecordId: "branch",
      itemId: `${resultId}:item:placement-branch`,
      placementFields: {
        disabled: false,
        fields: [],
        kind: "fieldSet",
        label: "Placement fields",
      },
      placementId: "placement-branch",
    });

    expect(objectKeys(foundation.tree)).not.toEqual(
      expect.arrayContaining([
        "ancestors",
        "depth",
        "entity",
        "recordsById",
        "relationship",
        "result",
        "schema",
        "values",
      ]),
    );
  });

  it("projects combined display-safe diagnostics without renderer-boundary internals", () => {
    const resultId = "tree:diagnostics";
    const privateSentinels = [
      "PRIVATE_RECORD_PAYLOAD",
      "PRIVATE_EXCEPTION",
      "PRIVATE_PARSER_ERROR",
      "PRIVATE_OPERATION_RESPONSE",
      "PRIVATE_SYNC_INTERNALS",
    ];
    const root = block("root", "group", "Root");
    const branch = block("branch", "group", "Branch");
    const post = {
      ...block("post", "post", "Unready post"),
      exception: { message: privateSentinels[1] },
      operationResponse: { body: privateSentinels[3] },
      parserError: { message: privateSentinels[2] },
      payload: { secret: privateSentinels[0] },
      syncInternals: { cursor: privateSentinels[4] },
      values: {
        ...block("post", "post", "Unready post").values,
        internalPayload: privateSentinels[0],
      },
    };
    const records = [
      root,
      branch,
      post,
      block("leaf", "card", "Leaf"),
      block("deep", "section", "Deep"),
      block("cut", "markdown", "Cut"),
      placement("placement-branch", root.id, branch.id, 1000),
      placement("placement-post", root.id, post.id, 2000),
      placement("placement-leaf", root.id, "leaf", 3000),
      placement("placement-missing", branch.id, "missing", 1000),
      placement("placement-cycle", branch.id, root.id, 2000),
      placement("placement-deep", branch.id, "deep", 3000),
      placement("placement-cut", "deep", "cut", 1000),
    ];
    const recordsById = Object.fromEntries(records.map((record) => [record.id, record]));
    const result = {
      ...siteTreeResult(),
      maxDepth: 1,
      parserError: { message: privateSentinels[2] },
      payload: { secret: privateSentinels[0] },
      syncInternals: { cursor: privateSentinels[4] },
    };
    const initial = selectGeneratedTreeFoundation({
      id: resultId,
      recordsById,
      result,
      rootRecordId: root.id,
      selectedPlacementId: "placement-post",
    });
    const removal = required(
      initial.runtimePlan.removePlacements.find(
        (candidate) => candidate.placementId === "placement-post",
      ),
    );
    const foundation = selectGeneratedTreeFoundation({
      id: resultId,
      placementRemoval: {
        operationStateByExecutionKey: {
          [removal.binding.executionKey]: {
            executionKey: removal.binding.executionKey,
            completedAt: 2000,
            result: { displayError: privateSentinels[3], type: "failed" },
            startedAt: 1000,
            status: "failed",
          },
        },
      },
      recordsById,
      result,
      rootRecordId: root.id,
      selectedPlacementId: "placement-post",
    });
    const missing = treeItemByPlacement(foundation.tree.items, "placement-missing");
    const postItem = treeItemByPlacement(foundation.tree.items, "placement-post");

    expect(missing).toMatchObject({
      availability: { available: true },
      structure: { message: "Child record is unavailable.", state: "missingChild" },
      warnings: [
        {
          id: `${missing.id}:warning:placement-readiness`,
          items: [
            {
              code: "placement-block-child",
              message: "Placement should point to a live child block.",
            },
          ],
          kind: "treeWarning",
          source: "placement",
          title: "Placement readiness warnings",
        },
      ],
    });
    expect(postItem.warnings).toEqual([
      {
        id: `${postItem.id}:warning:child-readiness`,
        items: [
          { code: "block-route", message: "Post block should have a link." },
          { code: "post-body", message: "Post block should include body content." },
        ],
        kind: "treeWarning",
        source: "child",
        title: "Child readiness warnings",
      },
    ]);
    expect(foundation.tree.selectedEditor).toMatchObject({
      availability: { available: true },
      editing: { enabled: true },
      warnings: postItem.warnings,
    });
    expect(treeItemByPlacement(foundation.tree.items, "placement-cycle").structure).toEqual({
      message: "Cycle stopped at this item.",
      state: "cycleStopped",
    });
    expect(treeItemByPlacement(foundation.tree.items, "placement-deep").structure).toEqual({
      message: "Maximum tree depth reached.",
      state: "depthStopped",
    });
    expect(treeItemByPlacement(foundation.tree.items, "placement-leaf").structure).toEqual({
      state: "leaf",
    });
    expect(foundation.tree.selectedEditor?.removePlacement).toMatchObject({
      feedback: { detail: "Remove failed. Try again.", status: "failed" },
    });

    const rendererSnapshot = JSON.stringify(foundation.tree);
    for (const sentinel of privateSentinels) {
      expect(rendererSnapshot).not.toContain(sentinel);
    }
    expect(objectKeys(foundation.tree)).not.toEqual(
      expect.arrayContaining([
        "exception",
        "operationResponse",
        "parserError",
        "payload",
        "recordsById",
        "syncInternals",
        "values",
      ]),
    );

    const editingDisabled = selectGeneratedTreeFoundation({
      id: resultId,
      recordsById,
      result: {
        ...result,
        childUpdateOperation: undefined,
        composition: undefined,
        placementUpdateOperation: undefined,
      },
      rootRecordId: root.id,
      selectedPlacementId: "placement-post",
    }).tree;
    expect(editingDisabled.editing).toEqual({
      disabledReason: "Editing is unavailable for this tree.",
      enabled: false,
    });
    expect(editingDisabled.selectedEditor?.editing).toEqual(editingDisabled.editing);
  });

  it("keeps an inline-editor root available without placements", () => {
    const root = block("root", "page", "Empty root");
    const result = siteTreeResult();
    const emptyStateAction = {
      control: emptyOperationControl("tree:create-starter"),
      kind: "operationAction" as const,
      role: "command" as const,
    };
    const empty = selectGeneratedTreeFoundation({
      emptyStateAction,
      id: "tree:empty",
      recordsById: { [root.id]: root },
      result,
      rootRecordId: root.id,
    }).tree;
    const unavailable = selectGeneratedTreeFoundation({
      id: "tree:unavailable",
      recordsById: {},
      result,
      rootRecordId: "missing-root",
    }).tree;
    const unselected = selectGeneratedTreeFoundation({
      id: "tree:unselected",
      recordsById: {},
      result,
    }).tree;

    expect(empty).toMatchObject({
      availability: { state: "ready" },
      items: [],
      root: { label: "Empty root" },
    });
    expect(empty.selectedEditor).toBeUndefined();
    expect(unavailable).toMatchObject({
      availability: { message: "The selected tree root is unavailable.", state: "unavailable" },
      editing: { disabledReason: "The selected tree root is unavailable.", enabled: false },
      items: [],
    });
    expect(unselected.availability).toEqual({
      message: "Select a tree root to continue.",
      state: "unavailable",
    });
  });

  it("retains valid selection and rebases created, removed, disappeared, and empty items", () => {
    const result = siteTreeResult();
    const resultId = "tree:selection";
    const records = [
      block("root", "page", "Root"),
      block("first", "markdown", "First"),
      block("second", "markdown", "Second"),
      placement("placement-first", "root", "first", 1000),
      placement("placement-second", "root", "second", 2000),
    ];
    const recordsById = Object.fromEntries(records.map((record) => [record.id, record]));
    const initial = selectGeneratedTreeFoundation({
      id: resultId,
      recordsById,
      result,
      rootRecordId: "root",
    });

    expect(selectedPlacements(initial.tree.items)).toEqual(["placement-first"]);

    const retained = selectGeneratedTreeFoundation({
      id: resultId,
      recordsById: {
        ...recordsById,
        second: {
          ...recordsById.second!,
          values: { ...recordsById.second!.values, label: "Fresh" },
        },
      },
      result,
      rootRecordId: "root",
      selectedPlacementId: "placement-second",
    });
    expect(selectedPlacements(retained.tree.items)).toEqual(["placement-second"]);
    expect(retained.tree.selectedEditor).toMatchObject({
      accessibilityLabel: "Edit Fresh",
      placementId: "placement-second",
    });

    const createdRecords = {
      ...recordsById,
      created: block("created", "markdown", "Created"),
      "placement-created": placement("placement-created", "root", "created", 3000),
    };
    const created = selectGeneratedTreeFoundation({
      id: resultId,
      recordsById: createdRecords,
      result,
      rootRecordId: "root",
      selectedPlacementId: "placement-created",
    });
    expect(selectedPlacements(created.tree.items)).toEqual(["placement-created"]);

    const removed = selectGeneratedTreeFoundation({
      id: resultId,
      recordsById: {
        ...createdRecords,
        "placement-created": {
          ...createdRecords["placement-created"]!,
          deletedAt: "2026-07-19T00:00:00.000Z",
        },
      },
      result,
      rootRecordId: "root",
      selectedPlacementId: "placement-created",
    });
    expect(removed.runtimePlan.selectedPlacementId).toBe("placement-first");
    expect(selectedPlacements(removed.tree.items)).toEqual(["placement-first"]);

    const { "placement-second": _disappeared, ...withoutSecondPlacement } = recordsById;
    const disappeared = selectGeneratedTreeFoundation({
      id: resultId,
      recordsById: withoutSecondPlacement,
      result,
      rootRecordId: "root",
      selectedPlacementId: "placement-second",
    });
    expect(disappeared.runtimePlan.selectedPlacementId).toBe("placement-first");

    const empty = selectGeneratedTreeFoundation({
      id: resultId,
      recordsById: { root: recordsById.root! },
      result,
      rootRecordId: "root",
      selectedPlacementId: "placement-first",
    });
    expect(empty.runtimePlan.selectedPlacementId).toBeNull();
    expect(empty.tree.selectedEditor).toBeUndefined();
    expect(selectedPlacements(empty.tree.items)).toEqual([]);
  });

  it("projects distinct selected placement and active-union child field foundations", () => {
    const resultId = "tree:authoring";
    const itemId = `${resultId}:item:placement-link`;
    const placementFieldSetId = `${itemId}:placement:fields`;
    const childFieldSetId = `${itemId}:child:fields`;
    const result = siteTreeResult("blockPlacementTreeItem");
    const root = block("root", "page", "Root");
    const child = record("link", "block", {
      icon: "missing-icon",
      label: "Link",
      linkTargetBlock: "missing-target",
      linkTargetMode: "internal",
      type: "link",
    });
    const edge = placement("placement-link", root.id, child.id, 1000, { label: "Hero slot" });
    const recordsById = { [root.id]: root, [child.id]: child, [edge.id]: edge };
    const childState: GeneratedRecordResultRecordState = {
      ...createGeneratedRecordResultFieldAuthoringState(child, {
        recordFields: result.childRecordFields,
        recordUnion: result.childRecordUnion,
      }),
      baselineRecordId: child.id,
      baselineUpdatedAt: child.updatedAt,
      confirmationOpenByControlId: {},
      editorDraftByFieldName: { label: "Draft link" },
      errorsByFieldName: { linkTargetBlock: "Reference failed." },
      pendingByFieldName: { icon: true },
    };
    const placementState: GeneratedRecordResultRecordState = {
      ...createGeneratedRecordResultFieldAuthoringState(edge, {
        recordFields: result.placementRecordFields ?? [],
        recordUnion: result.placementRecordUnion,
      }),
      baselineRecordId: edge.id,
      baselineUpdatedAt: edge.updatedAt,
      confirmationOpenByControlId: {},
    };
    const foundation = selectGeneratedTreeFoundation({
      childFields: { referenceOptionsByFieldName: { linkTargetBlock: [] } },
      fieldStateByFieldSetId: {
        [childFieldSetId]: childState,
        [placementFieldSetId]: placementState,
      },
      id: resultId,
      recordsById,
      result,
      rootRecordId: root.id,
      schema: siteSourceSchema,
    });
    const editor = required(foundation.tree.selectedEditor);
    const placementLabel = required(
      editor.placementFields.fields.find((field) => field.fieldName === "label"),
    );
    const childLabel = required(
      editor.childFields?.fields.find((field) => field.fieldName === "label"),
    );
    const childReference = required(
      editor.childFields?.fields.find((field) => field.fieldName === "linkTargetBlock"),
    );
    const childIcon = required(
      editor.childFields?.fields.find((field) => field.fieldName === "icon"),
    );

    expect(editor.placementFields).toMatchObject({
      fields: [{ density: "compact", labelVisibility: "visible", recordId: edge.id }],
      id: placementFieldSetId,
      label: "Placement fields",
    });
    expect(editor.childFields).toMatchObject({
      id: childFieldSetId,
      label: "Child fields",
    });
    expect(editor.childFields?.fields.map((field) => field.fieldName)).toEqual([
      "label",
      "linkTargetMode",
      "linkTargetBlock",
      "icon",
    ]);
    expect(childLabel).toMatchObject({
      density: "default",
      drafts: { draft: "Draft link" },
      labelVisibility: "visible",
      recordId: child.id,
    });
    expect(childReference).toMatchObject({
      errors: [{ message: "Reference failed." }],
      reference: { kind: "editor", valueStatus: { kind: "missing", value: "missing-target" } },
    });
    expect(childIcon).toMatchObject({
      pending: { isPending: true },
      rendererKind: "icon",
    });
    expect(placementLabel.fieldId).not.toBe(childLabel.fieldId);

    const childIntent = {
      fieldId: childLabel.fieldId,
      intent: { fieldName: "label", type: "recordEditorDraftChange" as const, value: "Next" },
      resultId,
      target: {
        fieldSetId: childFieldSetId,
        itemId,
        kind: "child" as const,
      },
      type: "treeField" as const,
    };
    expect(resolveGeneratedTreeFieldIntent(foundation.runtimePlan, childIntent)).toMatchObject({
      field: { fieldId: childLabel.fieldId, recordId: child.id },
      target: { kind: "child", recordId: child.id },
    });
    expect(
      resolveGeneratedTreeFieldIntent(foundation.runtimePlan, {
        ...childIntent,
        target: { ...childIntent.target, kind: "placement" },
      }),
    ).toBeUndefined();
  });

  it("projects and validates active item-view context navigation", () => {
    const resultId = "tree:context";
    const root = block("root", "page", "Root");
    const header = block("header", "header", "Header");
    const edge = placement("placement-header", root.id, header.id, 1000);
    const context = required(
      required(
        required(
          selectScreenModels(siteSourceSchema).find((screen) => screen.screenName === "siteEditor"),
        ).layout.sections[0],
      ).collection.context,
    );
    const available = selectGeneratedTreeFoundation({
      context,
      id: resultId,
      recordsById: { [root.id]: root, [header.id]: header, [edge.id]: edge },
      result: siteTreeResult(),
      rootRecordId: root.id,
      selectableContextRecordIds: new Set([header.id]),
    });
    const item = required(available.tree.items[0]);
    const action = required(item.contextActions[0]);

    expect(action).toMatchObject({
      availability: { available: true },
      control: { accessibilityLabel: "Open Header" },
      intent: { itemId: item.id, resultId, type: "treeContextAction" },
    });
    expect(available.tree.selectedEditor?.childFields).toBeUndefined();
    expect(
      resolveGeneratedTreeContextActionIntent(available.runtimePlan, action.intent),
    ).toMatchObject({ itemId: item.id, recordId: header.id });

    const unavailable = selectGeneratedTreeFoundation({
      context,
      id: resultId,
      recordsById: { [root.id]: root, [header.id]: header, [edge.id]: edge },
      result: siteTreeResult(),
      rootRecordId: root.id,
      selectableContextRecordIds: new Set(),
    });
    const unavailableAction = required(unavailable.tree.items[0]?.contextActions[0]);
    expect(unavailableAction).toMatchObject({
      availability: { available: false },
      control: { disabled: true },
    });
    expect(
      resolveGeneratedTreeContextActionIntent(unavailable.runtimePlan, unavailableAction.intent),
    ).toBeUndefined();
  });

  it("projects parent- and slot-specific allowed child creation through one active surface", () => {
    const resultId = "tree:child-creation";
    const root = block("root", "page", "Root");
    const feature = block("feature", "feature", "Feature");
    const card = block("card", "card", "Leaf card");
    const featurePlacement = placement("placement-feature", root.id, feature.id, 1000);
    const cardPlacement = placement("placement-card", root.id, card.id, 2000);
    const recordsById = Object.fromEntries(
      [root, feature, card, featurePlacement, cardPlacement].map((storedRecord) => [
        storedRecord.id,
        storedRecord,
      ]),
    );
    const initial = selectGeneratedTreeFoundation({
      id: resultId,
      recordsById,
      result: siteTreeResult(),
      rootRecordId: root.id,
      selectedPlacementId: featurePlacement.id,
    });
    const rootCreation = required(initial.tree.rootChildCreation);
    const nestedCreation = required(initial.tree.selectedEditor?.childCreation);
    const actionLink = required(
      nestedCreation.variants.find((variant) => variant.label === "Action link"),
    );

    expect(rootCreation).toMatchObject({
      accessibilityLabel: "Add child to Root",
      kind: "treeChildCreation",
    });
    expect(rootCreation.activeCreateSurface).toBeUndefined();
    expect(rootCreation.activeVariantId).toBeUndefined();
    expect(rootCreation.variants.map(({ label }) => label)).toEqual(
      expect.arrayContaining(["Group", "Hero", "Feature"]),
    );
    expect(nestedCreation.variants).toMatchObject([
      {
        availability: { available: true },
        label: "Feature image",
        selected: false,
        slot: { label: "Media" },
      },
      {
        availability: { available: true },
        label: "Action link",
        selected: false,
        slot: { label: "Actions" },
      },
    ]);
    expect(
      resolveGeneratedTreeChildVariantSelectionIntent(
        initial.runtimePlan,
        actionLink.selectionIntent,
      ),
    ).toMatchObject({
      parentRecordId: feature.id,
      placementValues: { slot: "actions" },
      variantId: actionLink.id,
    });

    const active = selectGeneratedTreeFoundation({
      childCreation: {
        activeVariantIdByCreationId: { [nestedCreation.id]: actionLink.id },
        createOpenBySurfaceId: { [`${actionLink.id}:create`]: true },
      },
      id: resultId,
      recordsById,
      result: siteTreeResult(),
      rootRecordId: root.id,
      selectedPlacementId: featurePlacement.id,
    });
    const activeCreation = required(active.tree.selectedEditor?.childCreation);
    const surface = required(activeCreation.activeCreateSurface);
    const labelField = required(
      surface.dialog.form.fieldSet.fields.find((field) => field.fieldName === "label"),
    );

    expect(activeCreation).toMatchObject({
      activeVariantId: actionLink.id,
      variants: [
        { label: "Feature image", selected: false },
        { label: "Action link", selected: true },
      ],
    });
    expect(surface).toMatchObject({
      dialog: { open: true, title: "Add Action link" },
      id: `${actionLink.id}:create`,
      kind: "createSurface",
    });
    expect(surface.dialog.form.fieldSet.fields.map((field) => field.fieldName)).not.toContain(
      "type",
    );
    expect(active.tree.rootChildCreation?.activeCreateSurface).toBeUndefined();
    expect(
      resolveGeneratedTreeCreateIntent(active.runtimePlan, {
        intent: { open: false, surfaceId: surface.id, type: "createOpenChange" },
        parent: actionLink.selectionIntent.parent,
        resultId,
        surfaceId: surface.id,
        type: "treeCreate",
      }),
    ).toMatchObject({
      operation: { defaults: [{ fieldName: "type", value: { value: "link" } }] },
      placementValues: { slot: "actions" },
    });
    expect(
      resolveGeneratedTreeCreateFieldIntent(active.runtimePlan, {
        fieldId: labelField.fieldId,
        intent: {
          fieldName: "label",
          fieldValue: { kind: "input", value: "Docs" },
          type: "createDraftChange",
        },
        resultId,
        target: {
          kind: "create",
          parent: actionLink.selectionIntent.parent,
          surfaceId: surface.id,
        },
        type: "treeField",
      }),
    ).toMatchObject({ field: { fieldId: labelField.fieldId }, runtime: { surfaceId: surface.id } });

    const stable = selectGeneratedTreeFoundation({
      id: resultId,
      recordsById: { ...recordsById, root: { ...root, updatedAt: "2026-07-19T00:00:00.000Z" } },
      result: siteTreeResult(),
      rootRecordId: root.id,
      selectedPlacementId: featurePlacement.id,
    });
    expect(stable.tree.rootChildCreation?.variants.map(({ id }) => id)).toEqual(
      rootCreation.variants.map(({ id }) => id),
    );
    expect(stable.tree.selectedEditor?.childCreation?.variants.map(({ id }) => id)).toEqual(
      nestedCreation.variants.map(({ id }) => id),
    );

    const leaf = selectGeneratedTreeFoundation({
      id: resultId,
      recordsById,
      result: siteTreeResult(),
      rootRecordId: root.id,
      selectedPlacementId: cardPlacement.id,
    });
    expect(leaf.tree.selectedEditor?.childCreation).toBeUndefined();

    const cyclePlacement = placement("placement-cycle", feature.id, root.id, 1000);
    const recordsWithStoppedTraversal = {
      ...recordsById,
      [cyclePlacement.id]: cyclePlacement,
    };
    const cycleStopped = selectGeneratedTreeFoundation({
      id: resultId,
      recordsById: recordsWithStoppedTraversal,
      result: siteTreeResult(),
      rootRecordId: root.id,
      selectedPlacementId: cyclePlacement.id,
    });
    expect(cycleStopped.tree.selectedEditor).toMatchObject({
      placementId: cyclePlacement.id,
    });
    expect(cycleStopped.tree.selectedEditor).not.toHaveProperty("childCreation");
    expect(treeItemByPlacement(cycleStopped.tree.items, cyclePlacement.id).structure).toEqual({
      message: "Cycle stopped at this item.",
      state: "cycleStopped",
    });

    const depthStopped = selectGeneratedTreeFoundation({
      id: resultId,
      recordsById: recordsWithStoppedTraversal,
      result: { ...siteTreeResult(), maxDepth: 0 },
      rootRecordId: root.id,
      selectedPlacementId: featurePlacement.id,
    });
    expect(depthStopped.tree.selectedEditor?.childCreation).toBeUndefined();
    expect(treeItemByPlacement(depthStopped.tree.items, featurePlacement.id).structure).toEqual({
      message: "Maximum tree depth reached.",
      state: "depthStopped",
    });

    const disabled = selectGeneratedTreeFoundation({
      id: resultId,
      recordsById,
      result: { ...siteTreeResult(), composition: undefined },
      rootRecordId: root.id,
      selectedPlacementId: featurePlacement.id,
    });
    const disabledVariant = required(disabled.tree.selectedEditor?.childCreation?.variants[0]);
    expect(disabledVariant.availability).toEqual({
      available: false,
      message: "Child creation is unavailable.",
    });
    expect(
      resolveGeneratedTreeChildVariantSelectionIntent(
        disabled.runtimePlan,
        disabledVariant.selectionIntent,
      ),
    ).toBeUndefined();
  });

  it("projects exact parent-and-slot semantic ordering with boundaries and safe state", () => {
    const resultId = "tree:ordering";
    const root = block("root", "page", "Root");
    const branch = block("branch", "group", "Branch");
    const records = [
      root,
      branch,
      block("main-first", "markdown", "Main first"),
      block("main-second", "markdown", "Main second"),
      block("main-third", "markdown", "Main third"),
      block("side-first", "markdown", "Side first"),
      block("side-second", "markdown", "Side second"),
      block("nested-first", "markdown", "Nested first"),
      block("nested-second", "markdown", "Nested second"),
      placement("placement-branch", root.id, branch.id, 1000, { slot: "branch" }),
      placement("placement-main-first", root.id, "main-first", 1, { slot: "main" }),
      placement("placement-main-second", root.id, "main-second", 1 + Number.EPSILON, {
        slot: "main",
      }),
      placement("placement-main-third", root.id, "main-third", 2, { slot: "main" }),
      placement("placement-side-first", root.id, "side-first", 500, { slot: "side" }),
      placement("placement-side-second", root.id, "side-second", 1500, { slot: "side" }),
      placement("placement-nested-first", branch.id, "nested-first", 1000, { slot: "main" }),
      placement("placement-nested-second", branch.id, "nested-second", 2000, { slot: "main" }),
    ];
    const recordsById = Object.fromEntries(
      records.map((storedRecord) => [storedRecord.id, storedRecord]),
    );
    const initial = selectGeneratedTreeFoundation({
      id: resultId,
      recordsById,
      result: siteTreeResult(),
      rootRecordId: root.id,
    });
    const mainFirst = treeItemByPlacement(initial.tree.items, "placement-main-first");
    const mainThird = treeItemByPlacement(initial.tree.items, "placement-main-third");
    const sideFirst = treeItemByPlacement(initial.tree.items, "placement-side-first");
    const sideSecond = treeItemByPlacement(initial.tree.items, "placement-side-second");
    const nestedFirst = treeItemByPlacement(initial.tree.items, "placement-nested-first");

    expect(mainFirst.ordering?.actions.map(({ direction }) => direction)).toEqual([
      "top",
      "up",
      "down",
      "bottom",
    ]);
    expect(
      mainFirst.ordering?.actions.map(({ structurallyAvailable }) => structurallyAvailable),
    ).toEqual([false, false, true, true]);
    expect(sideFirst.ordering?.actions.find(({ direction }) => direction === "up")).toMatchObject({
      disabled: true,
      disabledReason: "Already first",
      structurallyAvailable: false,
    });
    expect(
      nestedFirst.ordering?.actions.find(({ direction }) => direction === "top"),
    ).toMatchObject({
      disabled: true,
      structurallyAvailable: false,
    });
    const rebalanceAction = required(
      mainThird.ordering?.actions.find(({ direction }) => direction === "up"),
    );
    expect(rebalanceAction).toMatchObject({
      disabled: true,
      disabledReason: "Rebalance required",
      structurallyAvailable: true,
    });

    const moveAction = required(
      sideSecond.ordering?.actions.find(({ direction }) => direction === "up"),
    );
    const runtime = required(
      resolveGeneratedTreeReorderIntent(initial.runtimePlan, moveAction.intent),
    );
    expect(runtime).toMatchObject({
      actionId: moveAction.id,
      itemId: sideSecond.id,
      item: { plan: { kind: "patch", rank: 250, recordId: "placement-side-second" } },
      placementId: "placement-side-second",
    });
    expect(runtime.orderingContext.orderedRecordIds).toEqual([
      "placement-side-first",
      "placement-side-second",
    ]);
    expect(
      resolveGeneratedTreeReorderIntent(initial.runtimePlan, {
        ...moveAction.intent,
        actionId: `${moveAction.id}:stale`,
      }),
    ).toBeUndefined();

    const pending = selectGeneratedTreeFoundation({
      id: resultId,
      ordering: {
        operationStateByExecutionKey: {
          [runtime.binding.executionKey]: {
            executionKey: runtime.binding.executionKey,
            startedAt: 1000,
            status: "pending",
          },
        },
      },
      recordsById,
      result: siteTreeResult(),
      rootRecordId: root.id,
    });
    const pendingOrdering = required(
      treeItemByPlacement(pending.tree.items, "placement-side-second").ordering,
    );
    expect(pendingOrdering.pending).toBe(true);
    expect(
      pendingOrdering.actions.every(
        (action) => action.disabled && action.pending?.isPending === true,
      ),
    ).toBe(true);
    expect(pending.tree.feedback).toMatchObject([
      { status: "pending", title: "Moving placement." },
    ]);

    const failed = selectGeneratedTreeFoundation({
      id: resultId,
      ordering: {
        operationStateByExecutionKey: {
          [runtime.binding.executionKey]: {
            completedAt: 2010,
            executionKey: runtime.binding.executionKey,
            result: { displayError: "Private ordering failure.", type: "failed" },
            startedAt: 2000,
            status: "failed",
          },
        },
      },
      recordsById,
      result: siteTreeResult(),
      rootRecordId: root.id,
    });
    expect(failed.tree.feedback).toMatchObject([
      {
        detail: "Move failed. Try again.",
        status: "failed",
        title: "Move failed.",
      },
    ]);
    expect(JSON.stringify(failed.tree)).not.toContain("Private ordering failure");
  });

  it("keeps broken placements selectable and excludes invalid children from authoring", () => {
    const resultId = "tree:broken-children";
    const result = siteTreeResult("blockPlacementTreeItem");
    const root = block("root", "page", "Root");
    const deletedChild = {
      ...block("deleted-child", "markdown", "PRIVATE_DELETED_CHILD"),
      deletedAt: "2026-07-19T00:00:00.000Z",
    };
    const invalidChild = record("invalid-child", "block-placement", {
      label: "PRIVATE_INVALID_CHILD",
      type: "markdown",
    });
    const missingPlacement = placement("placement-missing", root.id, "missing-child", 1000, {
      label: "Broken placement",
    });
    const deletedPlacement = placement("placement-deleted-child", root.id, deletedChild.id, 2000);
    const invalidPlacement = placement("placement-invalid-child", root.id, invalidChild.id, 3000);
    const recordsById = Object.fromEntries(
      [root, deletedChild, invalidChild, missingPlacement, deletedPlacement, invalidPlacement].map(
        (storedRecord) => [storedRecord.id, storedRecord],
      ),
    );
    const missing = selectGeneratedTreeFoundation({
      id: resultId,
      recordsById,
      result,
      rootRecordId: root.id,
      selectedPlacementId: missingPlacement.id,
    });
    const missingItem = treeItemByPlacement(missing.tree.items, missingPlacement.id);

    expect(missingItem).toMatchObject({
      availability: { available: true },
      selected: true,
      structure: { state: "missingChild" },
    });
    expect(missing.tree.selectedEditor).toMatchObject({
      availability: { available: true },
      childRecordId: "missing-child",
      placementFields: { fields: [{ fieldName: "label" }] },
      removePlacement: {
        trigger: { accessibilityLabel: "Remove Missing child placement" },
      },
    });
    expect(missing.tree.selectedEditor).not.toHaveProperty("childFields");
    expect(missing.runtimePlan.removePlacements).toContainEqual(
      expect.objectContaining({ placementId: missingPlacement.id }),
    );

    for (const [placementId, childRecordId, privateLabel] of [
      [deletedPlacement.id, deletedChild.id, "PRIVATE_DELETED_CHILD"],
      [invalidPlacement.id, invalidChild.id, "PRIVATE_INVALID_CHILD"],
    ] as const) {
      const foundation = selectGeneratedTreeFoundation({
        id: resultId,
        recordsById,
        result,
        rootRecordId: root.id,
        selectedPlacementId: placementId,
      });
      const editor = required(foundation.tree.selectedEditor);

      expect(editor).toMatchObject({
        availability: { available: true },
        childRecordId,
        placementId,
      });
      expect(editor).not.toHaveProperty("childCreation");
      expect(editor).not.toHaveProperty("childFields");
      expect(Array.from(foundation.runtimePlan.fieldTargetByFieldSetId.values())).toContainEqual(
        expect.objectContaining({ kind: "placement", recordId: placementId }),
      );
      expect(JSON.stringify(editor)).not.toContain(privateLabel);
    }
  });

  it("projects scoped placement removal without exposing child-record deletion", () => {
    const resultId = "tree:placement-removal";
    const root = block("root", "page", "Root");
    const firstChild = block("first", "markdown", "First child");
    const secondChild = block("second", "markdown", "Second child");
    const firstPlacement = placement("placement-first", root.id, firstChild.id, 1000);
    const secondPlacement = placement("placement-second", root.id, secondChild.id, 2000);
    const recordsById = Object.fromEntries(
      [root, firstChild, secondChild, firstPlacement, secondPlacement].map((storedRecord) => [
        storedRecord.id,
        storedRecord,
      ]),
    );
    const initial = selectGeneratedTreeFoundation({
      id: resultId,
      recordsById,
      result: siteTreeResult(),
      rootRecordId: root.id,
      selectedPlacementId: secondPlacement.id,
    });
    const editor = required(initial.tree.selectedEditor);
    const control = required(editor.removePlacement);
    const operationIntent = {
      controlId: control.id,
      intent: control.trigger.intent,
      itemId: editor.itemId,
      resultId,
      type: "treeOperation" as const,
    };
    const runtime = required(
      resolveGeneratedTreeOperationIntent(initial.runtimePlan, operationIntent),
    );

    expect(control).toMatchObject({
      confirmation: {
        description: "The placement will be removed without deleting the child record.",
        open: false,
      },
      status: { status: "idle" },
      trigger: {
        accessibilityLabel: "Remove Second child placement",
        content: { icon: "delete", kind: "iconOnly" },
        prominence: "quiet",
      },
    });
    expect(runtime).toMatchObject({
      fallbackPlacementId: firstPlacement.id,
      itemId: editor.itemId,
      placementId: secondPlacement.id,
      binding: {
        canonicalOperationKey: "block-placement.removeTreePlacement",
        input: { action: "remove", kind: "treeComposition" },
      },
    });
    expect(initial.runtimePlan.removePlacements).toHaveLength(2);
    expect(initial.runtimePlan.removePlacements[0]?.binding.canonicalOperationKey).not.toBe(
      "block.delete",
    );
    expect(
      resolveGeneratedTreeOperationIntent(initial.runtimePlan, {
        ...operationIntent,
        itemId: `${editor.itemId}:stale`,
      }),
    ).toBeUndefined();
    expect(
      resolveGeneratedTreeOperationIntent(initial.runtimePlan, {
        ...operationIntent,
        intent: { ...operationIntent.intent, controlId: `${control.id}:stale` },
      }),
    ).toBeUndefined();

    const pending = selectGeneratedTreeFoundation({
      id: resultId,
      placementRemoval: {
        confirmationOpenByControlId: { [control.id]: true },
        operationStateByExecutionKey: {
          [runtime.binding.executionKey]: {
            executionKey: runtime.binding.executionKey,
            startedAt: 1000,
            status: "pending",
          },
        },
      },
      recordsById,
      result: siteTreeResult(),
      rootRecordId: root.id,
      selectedPlacementId: secondPlacement.id,
    });
    expect(pending.tree.selectedEditor?.removePlacement).toMatchObject({
      confirmation: {
        action: { disabled: true, pending: { isPending: true } },
        cancel: { disabled: false },
        open: true,
      },
      status: { status: "pending" },
      trigger: { disabled: true, pending: { isPending: true } },
    });

    const failed = selectGeneratedTreeFoundation({
      id: resultId,
      placementRemoval: {
        confirmationOpenByControlId: { [control.id]: true },
        operationStateByExecutionKey: {
          [runtime.binding.executionKey]: {
            completedAt: 2010,
            executionKey: runtime.binding.executionKey,
            result: { type: "failed", displayError: "Private storage failure." },
            startedAt: 2000,
            status: "failed",
          },
        },
      },
      recordsById,
      result: siteTreeResult(),
      rootRecordId: root.id,
      selectedPlacementId: secondPlacement.id,
    });
    expect(failed.tree.selectedEditor?.removePlacement).toMatchObject({
      confirmation: { open: true },
      feedback: {
        detail: "Remove failed. Try again.",
        status: "failed",
        title: "Remove failed.",
      },
      status: { detail: "Remove failed. Try again.", status: "failed" },
    });
    expect(JSON.stringify(failed.tree)).not.toContain("Private storage failure");

    const unavailable = selectGeneratedTreeFoundation({
      id: resultId,
      recordsById,
      result: { ...siteTreeResult(), composition: undefined },
      rootRecordId: root.id,
      selectedPlacementId: secondPlacement.id,
    });
    expect(unavailable.tree.selectedEditor?.removePlacement).toBeUndefined();
    expect(unavailable.runtimePlan.removePlacements).toEqual([]);
  });
});
function siteTreeResult(placementItemView?: string): TreeResultModel {
  const view = siteSourceSchema.views.find(
    (definition) => definition.key === "siteCompositionHome",
  )!;
  if (view?.type !== "collection" || view.result.type !== "tree") {
    throw new Error("Missing Site composition tree view.");
  }

  return selectTreeResultModel(
    siteSourceSchema,
    placementItemView === undefined ? view.result : { ...view.result, placementItemView },
    "block-placement",
    siteSourceSchema.entities.find((definition) => definition.key === "block-placement")!,
  );
}
function block(id: string, type: string, label: string): StoredRecord {
  return record(id, "block", { label, type });
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
    createdAt: `2026-07-18T00:00:${id.length.toString().padStart(2, "0")}.000Z`,
    entity,
    id,
    updatedAt: "2026-07-18T01:00:00.000Z",
    values,
  };
}

function objectKeys(value: unknown): string[] {
  if (value === null || typeof value !== "object") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(objectKeys);
  }
  return Object.entries(value).flatMap(([key, nested]) => [key, ...objectKeys(nested)]);
}
function selectedPlacements(
  items: readonly {
    children: readonly unknown[];
    placementId: string;
    selected: boolean;
  }[],
): string[] {
  return items.flatMap((item) => [
    ...(item.selected ? [item.placementId] : []),
    ...selectedPlacements(
      item.children as readonly {
        children: readonly unknown[];
        placementId: string;
        selected: boolean;
      }[],
    ),
  ]);
}

function treeItemByPlacement(
  items: readonly TreeItemContract[],
  placementId: string,
): TreeItemContract {
  const item = flattenContractTreeItems(items).find(
    (candidate) => candidate.placementId === placementId,
  );
  return required(item);
}

function flattenContractTreeItems(items: readonly TreeItemContract[]): TreeItemContract[] {
  return items.flatMap((item) => [item, ...flattenContractTreeItems(item.children)]);
}

function emptyOperationControl(id: string): OperationControlContract {
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

function required<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) {
    throw new Error("Missing generated tree test value.");
  }
  return value;
}
