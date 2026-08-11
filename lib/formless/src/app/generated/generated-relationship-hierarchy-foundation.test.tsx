// @vitest-environment jsdom

import { act, render, type RenderResult } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { parseAppSchema, type AppSchema } from "@dpeek/formless-schema";
import type {
  CreateFieldContract,
  OperationControlContract,
  RelationshipHierarchyCreateActionContract,
  RelationshipHierarchyCreateFieldIntent,
  RelationshipHierarchyCreateIntent,
  RelationshipHierarchyNodeContract,
  RelationshipHierarchyOperationIntent,
  RelationshipHierarchyRecordResultIntent,
  WorkspaceIntentScope,
} from "@dpeek/formless-presentation/contract";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { BrowserReplicaProjectionSnapshot } from "../../client/projections.ts";
import {
  applyBootstrapResponse,
  applyRecordMerge,
  getClientStoreSnapshot,
  resetClientStore,
} from "../../client/store.ts";
import type { ChangeRow } from "../../shared/protocol.ts";
import type { OperationInvocationResponse } from "../../shared/operation-invocation.ts";
import {
  selectScreenModels,
  type HomeSelectedRecordDetailRelationshipHierarchySectionConfig,
} from "../../client/views.ts";
import { bootstrapResponse } from "../../test/protocol-builders.ts";
import { rateCardTestRecords, rateSourceSchema } from "../../test/schema-apps.ts";
import {
  resolveGeneratedRelationshipHierarchyRecordFieldIntent,
  selectGeneratedRelationshipHierarchyFoundation,
  type GeneratedRelationshipHierarchyFoundation,
} from "./generated-relationship-hierarchy-foundation.ts";
import {
  useGeneratedWorkspaceRuntimeController,
  type GeneratedWorkspaceRuntimeController,
} from "./generated-workspace-runtime.tsx";
import { projectGeneratedWorkspaceRelationshipHierarchyIntent } from "./workspace-projection.ts";

const submitOperationMock = vi.hoisted(() => vi.fn());

vi.mock("../../client/sync.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../client/sync.ts")>()),
  submitOperation: submitOperationMock,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  submitOperationMock.mockReset();
});

describe("generated selected-record relationship hierarchy", () => {
  it("projects heterogeneous flat records in declaration and sibling order with path identities", () => {
    const schema = relationshipHierarchySchema();
    const records = hierarchyProjectionRecords();
    const foundation = selectHierarchyFoundation(schema, records, "rec_card_premium");
    const root = foundation.runtimePlan.root;

    expect(root.contract).toMatchObject({
      entityTypeLabel: "Rate card",
      recordId: "rec_card_premium",
    });
    expect(root.relationshipGroups.map((group) => group.relationship.id)).toEqual([
      "rates",
      "rateCopies",
    ]);
    expect(root.relationshipGroups[0]?.nodes.map((node) => node.recordId)).toEqual([
      "rec_rate_premium_designer",
      "rec_rate_premium_developer",
    ]);
    expect(root.relationshipGroups[0]?.nodes[1]?.relationshipGroups[0]?.contract).toMatchObject({
      kind: "relationshipHierarchyRelationshipGroup",
      label: "Adjustments",
      nodes: [
        {
          entityTypeLabel: "Adjustment",
          recordId: "adjustment-developer",
        },
      ],
    });
    expect(root.relationshipGroups[0]?.nodes[0]?.relationshipGroups[0]?.contract).toMatchObject({
      label: "Adjustments",
      nodes: [],
    });

    const primaryDesigner = required(root.relationshipGroups[0]?.nodes[0]);
    const duplicateDesigner = required(root.relationshipGroups[1]?.nodes[0]);
    expect(primaryDesigner.recordId).toBe(duplicateDesigner.recordId);
    expect(primaryDesigner.occurrenceId).not.toBe(duplicateDesigner.occurrenceId);
    expect(primaryDesigner.editor.contract.id).not.toBe(duplicateDesigner.editor.contract.id);
  });

  it("projects only explicit enabled operations with occurrence-scoped canonical state", () => {
    const schema = relationshipHierarchySchema();
    const records = hierarchyProjectionRecords();
    const initial = selectHierarchyFoundation(schema, records, "rec_card_premium");
    const root = initial.runtimePlan.root;
    const primaryDesigner = required(root.relationshipGroups[0]?.nodes[0]);
    const duplicateDesigner = required(root.relationshipGroups[1]?.nodes[0]);
    const adjustment = required(
      root.relationshipGroups[0]?.nodes[1]?.relationshipGroups[0]?.nodes[0],
    );
    const rootDelete = required(root.operations[0]);
    const primaryArchive = required(primaryDesigner.operations[0]);
    const duplicateArchive = required(duplicateDesigner.operations[0]);

    expect(operationLabels(root.contract)).toEqual(["Remove card"]);
    expect(operationLabels(primaryDesigner.contract)).toEqual(["Archive rate"]);
    expect(operationLabels(adjustment.contract)).toEqual(["Update adjustment"]);
    expect(primaryDesigner.model.operations.map((operation) => operation.label)).toEqual([
      "Archive rate",
      "Restore rate",
    ]);
    expect(primaryDesigner.operations).toHaveLength(1);
    expect(primaryArchive.binding).toMatchObject({
      availability: { state: "enabled" },
      input: { kind: "stateTransition" },
    });
    expect(rootDelete.control.confirmation).toMatchObject({
      open: false,
      title: "Remove card Premium?",
    });
    expect(primaryArchive.binding.id).not.toBe(duplicateArchive.binding.id);
    expect(primaryArchive.binding.executionKey).not.toBe(duplicateArchive.binding.executionKey);

    const pending = selectHierarchyFoundation(schema, records, "rec_card_premium", {}, () => ({
      confirmationOpenByControlId: { [rootDelete.binding.id]: true },
      operationStateByExecutionKey: {
        [primaryArchive.binding.executionKey]: {
          executionKey: primaryArchive.binding.executionKey,
          progress: {
            detail: "Updating rate state.",
            steps: [{ id: "apply", label: "Apply archive", status: "running" }],
            title: "Archiving rate",
            updatedAt: 1010,
          },
          startedAt: 1000,
          status: "pending",
        },
        [rootDelete.binding.executionKey]: {
          completedAt: 2010,
          executionKey: rootDelete.binding.executionKey,
          result: { displayError: "Delete rejected.", type: "failed" },
          startedAt: 2000,
          status: "failed",
        },
      },
    }));
    const pendingRoot = pending.runtimePlan.root;
    const pendingPrimary = required(pendingRoot.relationshipGroups[0]?.nodes[0]);
    const pendingDuplicate = required(pendingRoot.relationshipGroups[1]?.nodes[0]);

    expect(required(pendingRoot.operations[0]).control).toMatchObject({
      confirmation: { open: true },
      feedback: { detail: "Delete rejected.", status: "failed" },
    });
    expect(required(pendingPrimary.operations[0]).control).toMatchObject({
      progress: {
        detail: "Updating rate state.",
        steps: [{ id: "apply", status: "running" }],
      },
      status: { status: "pending" },
      trigger: { disabled: true, pending: { isPending: true } },
    });
    expect(required(pendingDuplicate.operations[0]).control).toMatchObject({
      status: { status: "idle" },
      trigger: { disabled: false },
    });
  });

  it("rebases editor state by occurrence and rejects removed, changed-root, and stale field intents", () => {
    const schema = relationshipHierarchySchema();
    const records = hierarchyProjectionRecords();
    const initial = selectHierarchyFoundation(schema, records, "rec_card_premium");
    const primaryDesigner = required(initial.runtimePlan.root.relationshipGroups[0]?.nodes[0]);
    const duplicateDesigner = required(initial.runtimePlan.root.relationshipGroups[1]?.nodes[0]);
    const initialState = required(primaryDesigner.editor.recordState);
    const occurrenceState = {
      ...initialState,
      errorsByFieldName: { ...initialState.errorsByFieldName, cost: "Occurrence draft" },
    };
    const retained = selectHierarchyFoundation(schema, records, "rec_card_premium", {
      [primaryDesigner.editor.contract.id]: occurrenceState,
    });
    const retainedPrimary = required(retained.runtimePlan.root.relationshipGroups[0]?.nodes[0]);
    const retainedDuplicate = required(retained.runtimePlan.root.relationshipGroups[1]?.nodes[0]);

    expect(retainedPrimary.editor.recordState).toBe(occurrenceState);
    expect(retainedDuplicate.editor.recordState?.errorsByFieldName.cost).toBeUndefined();

    const validIntent = hierarchyFieldIntent(retained, retainedPrimary, "900");
    expect(
      resolveGeneratedRelationshipHierarchyRecordFieldIntent(retained.runtimePlan, validIntent),
    ).toMatchObject({ node: { occurrenceId: retainedPrimary.occurrenceId } });
    expect(
      resolveGeneratedRelationshipHierarchyRecordFieldIntent(retained.runtimePlan, {
        ...validIntent,
        recordId: duplicateDesigner.recordId,
        occurrenceId: duplicateDesigner.occurrenceId,
      }),
    ).toBeUndefined();

    const updatedRecords = records.map((record) =>
      record.id === retainedPrimary.recordId
        ? { ...record, updatedAt: "2026-08-11T05:00:00.000Z" }
        : record,
    );
    const rebased = selectHierarchyFoundation(schema, updatedRecords, "rec_card_premium", {
      [retainedPrimary.editor.contract.id]: occurrenceState,
    });
    expect(
      required(rebased.runtimePlan.root.relationshipGroups[0]?.nodes[0]).editor.recordState
        ?.errorsByFieldName.cost,
    ).toBeUndefined();

    const removed = selectHierarchyFoundation(
      schema,
      records.map((record) =>
        record.id === retainedPrimary.recordId
          ? { ...record, deletedAt: "2026-08-11T06:00:00.000Z" }
          : record,
      ),
      "rec_card_premium",
    );
    expect(
      removed.runtimePlan.root.relationshipGroups[0]?.nodes.map((node) => node.recordId),
    ).toEqual(["rec_rate_premium_developer"]);
    expect(
      resolveGeneratedRelationshipHierarchyRecordFieldIntent(removed.runtimePlan, validIntent),
    ).toBeUndefined();

    const changedRoot = selectHierarchyFoundation(schema, records, "rec_card_default", {
      [retainedPrimary.editor.contract.id]: occurrenceState,
    });
    expect(changedRoot.runtimePlan.root.occurrenceId).not.toBe(
      retained.runtimePlan.root.occurrenceId,
    );
    expect(
      resolveGeneratedRelationshipHierarchyRecordFieldIntent(changedRoot.runtimePlan, validIntent),
    ).toBeUndefined();
  });

  it("routes drafts through the latest path occurrence without sharing duplicate record state", async () => {
    resetClientStore();
    const schema = relationshipHierarchySchema();
    applyBootstrapResponse(bootstrapResponse(schema, hierarchyRuntimeRecords()));
    const screen = required(
      selectScreenModels(schema).find((candidate) => candidate.screenName === "rateSetup"),
    );
    let controller: GeneratedWorkspaceRuntimeController | undefined;
    let renderer: RenderResult | undefined;

    function RuntimeProbe({ selectedRecordId }: { selectedRecordId: string }) {
      controller = useGeneratedWorkspaceRuntimeController({
        getSectionSelection: () => ({ selectedRecordId }),
        onSelectContext: () => undefined,
        onSelectQuery: () => undefined,
        onSelectRecord: () => undefined,
        screen,
        today: "2026-08-11",
      });
      return null;
    }

    await act(async () => {
      renderer = render(<RuntimeProbe selectedRecordId="rec_card_premium" />);
    });
    let runtime = required(controller);
    const scope = currentScope(runtime);
    let hierarchy = currentHierarchy(runtime);
    const primaryNode = required(hierarchy.root.relationshipGroups[0]?.nodes[0]);
    const duplicateNode = required(
      hierarchy.root.relationshipGroups[1]?.nodes.find(
        (node) => node.recordId === primaryNode.recordId,
      ),
    );
    const primaryIntent = hierarchyFieldIntentFromContract(hierarchy.id, primaryNode, "777");
    const stalePrimaryIntent = hierarchyFieldIntentFromContract(hierarchy.id, primaryNode, "999");

    await act(async () => {
      await runtime.dispatch(
        projectGeneratedWorkspaceRelationshipHierarchyIntent(scope, hierarchy.id, primaryIntent),
      );
    });
    runtime = required(controller);
    hierarchy = currentHierarchy(runtime);
    expect(fieldDraft(required(hierarchy.root.relationshipGroups[0]?.nodes[0]), "cost")).toBe(
      "777",
    );
    expect(
      fieldDraft(
        required(
          hierarchy.root.relationshipGroups[1]?.nodes.find(
            (node) => node.recordId === duplicateNode.recordId,
          ),
        ),
        "cost",
      ),
    ).toBe("550");

    await act(async () => {
      required(renderer).rerender(<RuntimeProbe selectedRecordId="rec_card_default" />);
    });
    runtime = required(controller);
    const defaultHierarchy = currentHierarchy(runtime);
    const defaultNode = required(defaultHierarchy.root.relationshipGroups[0]?.nodes[0]);
    const defaultIntent = hierarchyFieldIntentFromContract(defaultHierarchy.id, defaultNode, "333");
    await act(async () => {
      await runtime.dispatch(
        projectGeneratedWorkspaceRelationshipHierarchyIntent(
          currentScope(runtime),
          defaultHierarchy.id,
          defaultIntent,
        ),
      );
      await runtime.dispatch(
        projectGeneratedWorkspaceRelationshipHierarchyIntent(
          currentScope(runtime),
          defaultHierarchy.id,
          stalePrimaryIntent,
        ),
      );
    });
    runtime = required(controller);
    expect(
      fieldDraft(required(currentHierarchy(runtime).root.relationshipGroups[0]?.nodes[0]), "cost"),
    ).toBe("333");

    await act(async () => {
      required(renderer).unmount();
    });
  });

  it("routes operation execution, confirmation, feedback, duplicates, and stale intents", async () => {
    resetClientStore();
    const schema = relationshipHierarchySchema();
    applyBootstrapResponse(bootstrapResponse(schema, hierarchyRuntimeRecords()));
    const screen = required(
      selectScreenModels(schema).find((candidate) => candidate.screenName === "rateSetup"),
    );
    let controller: GeneratedWorkspaceRuntimeController | undefined;
    let renderer: RenderResult | undefined;

    function RuntimeProbe({ selectedRecordId }: { selectedRecordId: string }) {
      controller = useGeneratedWorkspaceRuntimeController({
        getSectionSelection: () => ({ selectedRecordId }),
        onSelectContext: () => undefined,
        onSelectQuery: () => undefined,
        onSelectRecord: () => undefined,
        screen,
        today: "2026-08-11",
      });
      return null;
    }

    await act(async () => {
      renderer = render(<RuntimeProbe selectedRecordId="rec_card_premium" />);
    });
    let runtime = required(controller);
    let hierarchy = currentHierarchy(runtime);
    const primaryNode = required(hierarchy.root.relationshipGroups[0]?.nodes[0]);
    const duplicateNode = required(hierarchy.root.relationshipGroups[1]?.nodes[0]);
    const primaryArchive = operationControl(primaryNode, "Archive rate");
    const duplicateArchive = operationControl(duplicateNode, "Archive rate");
    const primaryEnvelope = projectGeneratedWorkspaceRelationshipHierarchyIntent(
      currentScope(runtime),
      hierarchy.id,
      hierarchyOperationIntent(hierarchy.id, primaryNode, primaryArchive),
    );
    const deferred = deferredOperationResponse();
    submitOperationMock.mockImplementationOnce(() => deferred.promise);
    let pending: Promise<void> | undefined;

    await act(async () => {
      pending = Promise.resolve(runtime.dispatch(primaryEnvelope));
      await Promise.resolve();
    });
    expect(submitOperationMock).toHaveBeenCalledTimes(1);
    runtime = required(controller);
    hierarchy = currentHierarchy(runtime);
    expect(
      operationControl(required(hierarchy.root.relationshipGroups[0]?.nodes[0]), "Archive rate"),
    ).toMatchObject({
      status: { status: "pending" },
      trigger: { disabled: true, pending: { isPending: true } },
    });
    expect(
      operationControl(required(hierarchy.root.relationshipGroups[1]?.nodes[0]), "Archive rate"),
    ).toMatchObject({ status: { status: "idle" } });

    await act(async () => {
      await runtime.dispatch(
        projectGeneratedWorkspaceRelationshipHierarchyIntent(currentScope(runtime), hierarchy.id, {
          ...hierarchyOperationIntent(hierarchy.id, duplicateNode, duplicateArchive),
          controlId: primaryArchive.id,
          intent: primaryArchive.trigger.intent,
        }),
      );
    });
    expect(submitOperationMock).toHaveBeenCalledTimes(1);

    deferred.resolve(committedCommandResponse());
    await act(async () => {
      await pending;
    });
    expect(submitOperationMock.mock.calls[0]?.slice(0, 3)).toEqual([
      "rate",
      "archive",
      {
        recordId: primaryNode.recordId,
        source: { protocol: "generated-ui", surface: "button" },
      },
    ]);
    runtime = required(controller);
    hierarchy = currentHierarchy(runtime);
    expect(
      operationControl(required(hierarchy.root.relationshipGroups[0]?.nodes[0]), "Archive rate")
        .feedback,
    ).toMatchObject({ status: "committed" });

    let rootDelete = operationControl(hierarchy.root, "Remove card");
    await act(async () => {
      await runtime.dispatch(
        projectGeneratedWorkspaceRelationshipHierarchyIntent(
          currentScope(runtime),
          hierarchy.id,
          hierarchyOperationIntent(hierarchy.id, hierarchy.root, rootDelete),
        ),
      );
    });
    expect(submitOperationMock).toHaveBeenCalledTimes(1);
    runtime = required(controller);
    hierarchy = currentHierarchy(runtime);
    rootDelete = operationControl(hierarchy.root, "Remove card");
    expect(rootDelete.confirmation?.open).toBe(true);

    submitOperationMock.mockResolvedValueOnce(committedDeleteResponse(hierarchy.root.recordId));
    await act(async () => {
      await runtime.dispatch(
        projectGeneratedWorkspaceRelationshipHierarchyIntent(
          currentScope(runtime),
          hierarchy.id,
          hierarchyOperationIntent(
            hierarchy.id,
            hierarchy.root,
            rootDelete,
            required(rootDelete.confirmation).action.intent,
          ),
        ),
      );
    });
    expect(submitOperationMock.mock.calls[1]?.slice(0, 3)).toEqual([
      "card",
      "delete",
      {
        recordId: hierarchy.root.recordId,
        source: { protocol: "generated-ui", surface: "confirmationDialog" },
      },
    ]);

    await act(async () => {
      required(renderer).rerender(<RuntimeProbe selectedRecordId="rec_card_default" />);
    });
    runtime = required(controller);
    await act(async () => {
      await runtime.dispatch(primaryEnvelope);
    });
    expect(submitOperationMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      required(renderer).unmount();
    });
  });

  it("scopes child create surfaces, drafts, fields, and stale intents to their path occurrence", async () => {
    resetClientStore();
    const schema = relationshipHierarchySchema();
    const projected = selectHierarchyFoundation(
      schema,
      hierarchyProjectionRecords(),
      "rec_card_premium",
    );
    const [projectedRatesCreate, projectedCopiesCreate] = projected.runtimePlan.root.creates;
    expect(required(projectedRatesCreate).surfaceId).not.toBe(
      required(projectedCopiesCreate).surfaceId,
    );
    expect(required(projectedRatesCreate).queryContext.values).toMatchObject({
      card: "rec_card_premium",
    });
    expect(required(projectedRatesCreate).parentRecordId).toBe("rec_card_premium");

    applyBootstrapResponse(bootstrapResponse(schema, hierarchyRuntimeRecords()));
    const screen = required(
      selectScreenModels(schema).find((candidate) => candidate.screenName === "rateSetup"),
    );
    let controller: GeneratedWorkspaceRuntimeController | undefined;
    let renderer: RenderResult | undefined;

    function RuntimeProbe({ selectedRecordId }: { selectedRecordId: string }) {
      controller = useGeneratedWorkspaceRuntimeController({
        getSectionSelection: () => ({ selectedRecordId }),
        onSelectContext: () => undefined,
        onSelectQuery: () => undefined,
        onSelectRecord: () => undefined,
        screen,
        today: "2026-08-11",
      });
      return null;
    }

    await act(async () => {
      renderer = render(<RuntimeProbe selectedRecordId="rec_card_premium" />);
    });
    let runtime = required(controller);
    let hierarchy = currentHierarchy(runtime);
    const ratesCreate = hierarchyCreateAction(hierarchy.root, 0);
    const copiesCreate = hierarchyCreateAction(hierarchy.root, 1);
    const costField = hierarchyCreateField(ratesCreate, "cost");
    const openIntent = hierarchyCreateIntent(hierarchy.id, hierarchy.root, ratesCreate, {
      open: true,
      surfaceId: ratesCreate.surface.id,
      type: "createOpenChange",
    });
    const costIntent = hierarchyCreateFieldIntent(
      hierarchy.id,
      hierarchy.root,
      ratesCreate,
      costField,
      "777",
    );
    const recordCount = Object.keys(getClientStoreSnapshot().recordsById).length;

    await act(async () => {
      await runtime.dispatch(
        projectGeneratedWorkspaceRelationshipHierarchyIntent(
          currentScope(runtime),
          hierarchy.id,
          openIntent,
        ),
      );
      await runtime.dispatch(
        projectGeneratedWorkspaceRelationshipHierarchyIntent(
          currentScope(runtime),
          hierarchy.id,
          costIntent,
        ),
      );
    });

    expect(submitOperationMock).not.toHaveBeenCalled();
    expect(Object.keys(getClientStoreSnapshot().recordsById)).toHaveLength(recordCount);
    runtime = required(controller);
    hierarchy = currentHierarchy(runtime);
    expect(hierarchyCreateAction(hierarchy.root, 0).surface.dialog.open).toBe(true);
    expect(
      hierarchyCreateField(hierarchyCreateAction(hierarchy.root, 0), "cost").draftInput,
    ).toEqual({ kind: "input", value: "777" });
    expect(hierarchyCreateAction(hierarchy.root, 1).surface.dialog.open).toBe(false);
    expect(hierarchyCreateAction(hierarchy.root, 1).surface.id).toBe(copiesCreate.surface.id);
    expect(
      hierarchyCreateField(hierarchyCreateAction(hierarchy.root, 1), "cost").draftInput,
    ).not.toEqual({ kind: "input", value: "777" });

    await act(async () => {
      required(renderer).rerender(<RuntimeProbe selectedRecordId="rec_card_default" />);
    });
    runtime = required(controller);
    hierarchy = currentHierarchy(runtime);
    const defaultCreate = hierarchyCreateAction(hierarchy.root, 0);
    expect(defaultCreate.surface.id).not.toBe(ratesCreate.surface.id);

    await act(async () => {
      await runtime.dispatch(
        projectGeneratedWorkspaceRelationshipHierarchyIntent(
          currentScope(runtime),
          openIntent.hierarchyId,
          openIntent,
        ),
      );
      await runtime.dispatch(
        projectGeneratedWorkspaceRelationshipHierarchyIntent(
          currentScope(runtime),
          costIntent.hierarchyId,
          costIntent,
        ),
      );
    });
    runtime = required(controller);
    hierarchy = currentHierarchy(runtime);
    expect(hierarchyCreateAction(hierarchy.root, 0).surface.dialog.open).toBe(false);
    expect(
      hierarchyCreateField(hierarchyCreateAction(hierarchy.root, 0), "cost").draftInput,
    ).not.toEqual({ kind: "input", value: "777" });
    expect(submitOperationMock).not.toHaveBeenCalled();

    await act(async () => {
      required(renderer).unmount();
    });
  });

  it("submits one flat attached child, retains failure, and reprojects committed records", async () => {
    resetClientStore();
    const schema = relationshipHierarchySchema();
    applyBootstrapResponse(bootstrapResponse(schema, hierarchyRuntimeRecords()));
    const screen = required(
      selectScreenModels(schema).find((candidate) => candidate.screenName === "rateSetup"),
    );
    let controller: GeneratedWorkspaceRuntimeController | undefined;
    let renderer: RenderResult | undefined;

    function RuntimeProbe() {
      controller = useGeneratedWorkspaceRuntimeController({
        getSectionSelection: () => ({ selectedRecordId: "rec_card_premium" }),
        onSelectContext: () => undefined,
        onSelectQuery: () => undefined,
        onSelectRecord: () => undefined,
        screen,
        today: "2026-08-11",
      });
      return null;
    }

    await act(async () => {
      renderer = render(<RuntimeProbe />);
    });
    let runtime = required(controller);
    let hierarchy = currentHierarchy(runtime);
    let create = hierarchyCreateAction(hierarchy.root, 0);
    const resourceField = hierarchyCreateField(create, "resource");

    await act(async () => {
      await runtime.dispatch(
        projectGeneratedWorkspaceRelationshipHierarchyIntent(
          currentScope(runtime),
          hierarchy.id,
          hierarchyCreateIntent(hierarchy.id, hierarchy.root, create, {
            open: true,
            surfaceId: create.surface.id,
            type: "createOpenChange",
          }),
        ),
      );
      await runtime.dispatch(
        projectGeneratedWorkspaceRelationshipHierarchyIntent(
          currentScope(runtime),
          hierarchy.id,
          hierarchyCreateFieldIntent(
            hierarchy.id,
            hierarchy.root,
            create,
            resourceField,
            "rec_resource_product_lead",
          ),
        ),
      );
    });

    runtime = required(controller);
    hierarchy = currentHierarchy(runtime);
    create = hierarchyCreateAction(hierarchy.root, 0);
    submitOperationMock.mockRejectedValueOnce(new Error("Private create failure."));
    await act(async () => {
      await runtime.dispatch(
        projectGeneratedWorkspaceRelationshipHierarchyIntent(
          currentScope(runtime),
          hierarchy.id,
          hierarchyCreateIntent(hierarchy.id, hierarchy.root, create, {
            surfaceId: create.surface.id,
            type: "createSubmit",
          }),
        ),
      );
    });
    runtime = required(controller);
    hierarchy = currentHierarchy(runtime);
    create = hierarchyCreateAction(hierarchy.root, 0);
    expect(create.surface.dialog.open).toBe(true);
    expect(create.surface.dialog.form.errors).toEqual(["Create failed. Try again."]);
    expect(JSON.stringify(create.surface)).not.toContain("Private create failure");

    const created = createdRateRecord();
    const deferred = deferredOperationResponse();
    submitOperationMock.mockImplementationOnce(() => deferred.promise);
    let submission: Promise<void> | undefined;
    await act(async () => {
      submission = Promise.resolve(
        runtime.dispatch(
          projectGeneratedWorkspaceRelationshipHierarchyIntent(
            currentScope(runtime),
            hierarchy.id,
            hierarchyCreateIntent(hierarchy.id, hierarchy.root, create, {
              surfaceId: create.surface.id,
              type: "createSubmit",
            }),
          ),
        ),
      );
      await Promise.resolve();
    });
    runtime = required(controller);
    expect(
      hierarchyCreateAction(currentHierarchy(runtime).root, 0).surface.dialog.form.submit,
    ).toMatchObject({ disabled: true, pending: { isPending: true } });

    await act(async () => {
      applyRecordMerge([created], undefined);
      deferred.resolve(committedCreateResponse(created));
      await submission;
    });

    expect(submitOperationMock).toHaveBeenCalledTimes(2);
    expect(submitOperationMock.mock.calls[1]?.slice(0, 3)).toEqual([
      "rate",
      "create",
      {
        input: expect.objectContaining({
          card: "rec_card_premium",
          resource: "rec_resource_product_lead",
        }),
        source: { protocol: "generated-ui", surface: "submitButton" },
      },
    ]);
    runtime = required(controller);
    hierarchy = currentHierarchy(runtime);
    create = hierarchyCreateAction(hierarchy.root, 0);
    expect(create.surface.dialog.open).toBe(false);
    expect(create.surface.dialog.form.errors).toEqual([]);
    expect(hierarchyCreateField(create, "resource").draftInput).not.toEqual({
      kind: "input",
      value: "rec_resource_product_lead",
    });
    expect(hierarchy.root.recordId).toBe("rec_card_premium");
    expect(hierarchy.root.relationshipGroups[0]?.nodes.map((node) => node.recordId)).toContain(
      created.id,
    );

    await act(async () => {
      required(renderer).unmount();
    });
  });
});

function selectHierarchyFoundation(
  schema: AppSchema,
  records: readonly StoredRecord[],
  selectedRecordId: string,
  recordStateByResultId: Parameters<
    typeof selectGeneratedRelationshipHierarchyFoundation
  >[0]["recordStateByResultId"] = {},
  recordResultOptions?: Parameters<
    typeof selectGeneratedRelationshipHierarchyFoundation
  >[0]["recordResultOptions"],
) {
  return selectGeneratedRelationshipHierarchyFoundation({
    id: "hierarchy:rate-card",
    model: hierarchyModel(schema),
    queryContext: { today: "2026-08-11" },
    recordResultOptions,
    recordStateByResultId,
    selectedRecordId,
    snapshot: projectionSnapshot(records),
  });
}

function hierarchyModel(
  schema: AppSchema,
): HomeSelectedRecordDetailRelationshipHierarchySectionConfig {
  const screen = required(
    selectScreenModels(schema).find((candidate) => candidate.screenName === "rateSetup"),
  );
  const section = required(screen.layout.sections.find((candidate) => candidate.id === "cards"));
  const hierarchy = required(
    section.collection.detail?.sections.find(
      (candidate) => candidate.type === "relationshipHierarchy",
    ),
  );
  if (hierarchy.type !== "relationshipHierarchy") {
    throw new Error("Missing relationship-hierarchy model.");
  }
  return hierarchy;
}

function hierarchyFieldIntent(
  foundation: GeneratedRelationshipHierarchyFoundation,
  node: GeneratedRelationshipHierarchyFoundation["runtimePlan"]["root"],
  value: string,
): RelationshipHierarchyRecordResultIntent {
  return hierarchyFieldIntentFromContract(foundation.hierarchy.id, node.contract, value);
}

function hierarchyFieldIntentFromContract(
  hierarchyId: string,
  node: RelationshipHierarchyNodeContract,
  value: string,
): RelationshipHierarchyRecordResultIntent {
  const field = required(node.editor.fields.find((candidate) => candidate.fieldName === "cost"));
  const recordId = node.recordId;
  const resultId = node.editor.id;
  return {
    hierarchyId,
    intent: {
      fieldId: field.fieldId,
      intent: {
        fieldName: field.fieldName,
        fieldValue: { kind: "input", value },
        type: "recordDraftChange",
      },
      recordId,
      resultId,
      type: "recordResultFieldIntent",
    },
    occurrenceId: node.id,
    recordId,
    resultId,
    type: "relationshipHierarchyRecordResult",
  };
}

function hierarchyOperationIntent(
  hierarchyId: string,
  node: RelationshipHierarchyNodeContract,
  control: OperationControlContract,
  intent = control.trigger.intent,
): RelationshipHierarchyOperationIntent {
  return {
    controlId: control.id,
    hierarchyId,
    intent,
    occurrenceId: node.id,
    recordId: node.recordId,
    type: "relationshipHierarchyOperation",
  };
}

function hierarchyCreateAction(
  node: RelationshipHierarchyNodeContract,
  relationshipGroupIndex: number,
): RelationshipHierarchyCreateActionContract {
  const group = required(node.relationshipGroups[relationshipGroupIndex]);
  const action = required(
    node.headerActions.items.find(
      (candidate) =>
        candidate.kind === "createAction" && candidate.relationshipGroupId === group.id,
    ),
  );
  if (action.kind !== "createAction") {
    throw new Error(`Missing hierarchy create action for group "${group.id}".`);
  }
  return action;
}

function hierarchyCreateField(
  action: RelationshipHierarchyCreateActionContract,
  fieldName: string,
): CreateFieldContract {
  return required(
    action.surface.dialog.form.fieldSet.fields.find((field) => field.fieldName === fieldName),
  );
}

function hierarchyCreateIntent(
  hierarchyId: string,
  node: RelationshipHierarchyNodeContract,
  action: RelationshipHierarchyCreateActionContract,
  intent: RelationshipHierarchyCreateIntent["intent"],
): RelationshipHierarchyCreateIntent {
  return {
    hierarchyId,
    intent,
    occurrenceId: node.id,
    relationshipGroupId: action.relationshipGroupId,
    surfaceId: action.surface.id,
    type: "relationshipHierarchyCreate",
  };
}

function hierarchyCreateFieldIntent(
  hierarchyId: string,
  node: RelationshipHierarchyNodeContract,
  action: RelationshipHierarchyCreateActionContract,
  field: CreateFieldContract,
  value: string,
): RelationshipHierarchyCreateFieldIntent {
  return {
    fieldId: field.fieldId,
    hierarchyId,
    intent: {
      fieldName: field.fieldName,
      fieldValue: { kind: "input", value },
      type: "createDraftChange",
    },
    occurrenceId: node.id,
    relationshipGroupId: action.relationshipGroupId,
    surfaceId: action.surface.id,
    type: "relationshipHierarchyCreateField",
  };
}

function operationControl(
  node: RelationshipHierarchyNodeContract,
  label: string,
): OperationControlContract {
  const action = required(
    node.headerActions.items.find(
      (candidate) =>
        candidate.kind === "operationAction" &&
        candidate.control.trigger.accessibilityLabel === label,
    ),
  );
  if (action.kind !== "operationAction") {
    throw new Error(`Missing hierarchy operation "${label}".`);
  }
  return action.control;
}

function operationLabels(node: RelationshipHierarchyNodeContract): string[] {
  return node.headerActions.items.flatMap((action) =>
    action.kind === "operationAction" ? [action.control.trigger.accessibilityLabel] : [],
  );
}

function fieldDraft(node: RelationshipHierarchyNodeContract, fieldName: string): string {
  const field = required(node.editor.fields.find((candidate) => candidate.fieldName === fieldName));
  if (field.mode !== "editor" || !("drafts" in field)) {
    throw new Error(`Missing hierarchy editor field "${fieldName}".`);
  }
  return field.drafts.draft;
}

function currentHierarchy(controller: GeneratedWorkspaceRuntimeController) {
  const presentation = required(controller.workspace?.sections[0]).collection.presentation;
  if (presentation.kind !== "selectedRecord") {
    throw new Error("Missing selected-record presentation.");
  }
  const section = required(
    presentation.sections.find(
      (candidate) => candidate.kind === "selectedRecordRelationshipHierarchySection",
    ),
  );
  if (section.kind !== "selectedRecordRelationshipHierarchySection") {
    throw new Error("Missing relationship-hierarchy section.");
  }
  return section.hierarchy;
}

function currentScope(controller: GeneratedWorkspaceRuntimeController): WorkspaceIntentScope {
  const workspace = required(controller.workspace);
  const section = required(workspace.sections[0]);
  return {
    collectionId: section.collection.id,
    screenId: workspace.id,
    sectionId: section.id,
  };
}

function projectionSnapshot(records: readonly StoredRecord[]): BrowserReplicaProjectionSnapshot {
  const recordsById = Object.fromEntries(records.map((record) => [record.id, record]));
  const recordIdsByEntity: Record<string, string[]> = {};
  for (const record of records.toReversed()) {
    (recordIdsByEntity[record.entity] ??= []).push(record.id);
  }
  return { recordsById, recordIdsByEntity };
}

function hierarchyProjectionRecords(): StoredRecord[] {
  const premium = required(rateCardTestRecords.find((record) => record.id === "rec_card_premium"));
  const defaultCard = required(
    rateCardTestRecords.find((record) => record.id === "rec_card_default"),
  );
  const designer = required(
    rateCardTestRecords.find((record) => record.id === "rec_rate_premium_designer"),
  );
  const developer = required(
    rateCardTestRecords.find((record) => record.id === "rec_rate_premium_developer"),
  );
  const resources = rateCardTestRecords.filter((record) => record.entity === "resource");
  const tiedCreatedAt = "2026-05-01T00:00:13.000Z";
  return [
    premium,
    defaultCard,
    ...resources,
    { ...designer, createdAt: tiedCreatedAt, values: { ...designer.values, workflow: "draft" } },
    { ...developer, createdAt: tiedCreatedAt, values: { ...developer.values, workflow: "draft" } },
    adjustmentRecord(),
  ];
}

function hierarchyRuntimeRecords(): StoredRecord[] {
  return [
    ...rateCardTestRecords.map((record) =>
      record.entity === "rate"
        ? { ...record, values: { ...record.values, workflow: "draft" } }
        : record,
    ),
    adjustmentRecord(),
  ];
}

function adjustmentRecord(): StoredRecord {
  return {
    createdAt: "2026-05-01T00:00:18.000Z",
    entity: "adjustment",
    id: "adjustment-developer",
    updatedAt: "2026-05-01T00:00:18.000Z",
    values: { label: "Developer premium", rate: "rec_rate_premium_developer" },
  };
}

function createdRateRecord(): StoredRecord {
  return {
    createdAt: "2026-08-11T09:00:00.000Z",
    entity: "rate",
    id: "rec_rate_premium_created",
    updatedAt: "2026-08-11T09:00:00.000Z",
    values: {
      card: "rec_card_premium",
      cost: 0,
      costUnit: "day",
      currency: "usd",
      price: 0,
      priceSet: true,
      resource: "rec_resource_product_lead",
      workflow: "draft",
    },
  };
}

function relationshipHierarchySchema(): AppSchema {
  const setup = required(rateSourceSchema.screens.find((screen) => screen.key === "rateSetup"));
  if (setup.type !== "workspace") {
    throw new Error("Missing rate setup workspace.");
  }
  const cards = required(setup.layout.sections.find((section) => section.id === "cards"));
  const hierarchy = {
    id: "hierarchy",
    type: "relationshipHierarchy" as const,
    label: "Rate card hierarchy",
    itemView: "cardListItem",
    operations: [{ operation: "card.delete", label: "Remove card" }],
    relationships: [
      {
        id: "rates",
        label: "Rates",
        relationship: "cardRates",
        itemView: "rateListItem",
        createAction: {
          operation: "rate.create",
          createView: "rateCreateForCard",
          label: "Add rate",
        },
        operations: [{ operation: "rate.archive" }, { operation: "rate.restore" }],
        relationships: [
          {
            id: "adjustments",
            label: "Adjustments",
            relationship: "rateAdjustments",
            itemView: "adjustmentItem",
            operations: [{ operation: "adjustment.update" }],
          },
        ],
      },
      {
        id: "rateCopies",
        label: "Rate copies",
        relationship: "cardRates",
        itemView: "rateListItem",
        createAction: {
          operation: "rate.create",
          createView: "rateCreateForCard",
          label: "Add rate copy",
        },
        operations: [{ operation: "rate.archive" }, { operation: "rate.restore" }],
      },
    ],
  };

  return parseAppSchema({
    ...rateSourceSchema,
    entities: [
      ...rateSourceSchema.entities.map((entity) => {
        if (entity.key === "card") {
          return {
            ...entity,
            operations: [
              ...(entity.operations ?? []),
              {
                key: "delete",
                label: "Delete rate card",
                kind: "delete" as const,
                scope: "record" as const,
                effect: { type: "deleteRecord" as const },
              },
            ],
          };
        }
        if (entity.key === "rate") {
          return {
            ...entity,
            fields: [
              ...entity.fields,
              {
                key: "workflow",
                default: "draft",
                label: "Workflow",
                required: true,
                type: "enum" as const,
                values: [
                  { key: "draft", label: "Draft" },
                  { key: "archived", label: "Archived" },
                ],
              },
            ],
            stateMachines: [
              ...(entity.stateMachines ?? []),
              {
                key: "workflow",
                field: "workflow",
                initial: "draft",
                transitions: [
                  { key: "archive", label: "Archive", from: ["draft"], to: "archived" },
                  { key: "restore", label: "Restore", from: ["archived"], to: "draft" },
                ],
              },
            ],
            operations: [
              ...(entity.operations ?? []),
              {
                key: "archive",
                label: "Archive rate",
                kind: "command" as const,
                scope: "record" as const,
                effect: {
                  type: "operationHandler" as const,
                  handler: "transition-state" as const,
                  config: { machine: "workflow", transition: "archive" },
                },
              },
              {
                key: "restore",
                label: "Restore rate",
                kind: "command" as const,
                scope: "record" as const,
                effect: {
                  type: "operationHandler" as const,
                  handler: "transition-state" as const,
                  config: { machine: "workflow", transition: "restore" },
                },
              },
            ],
          };
        }
        return entity;
      }),
      {
        key: "adjustment",
        id: "entity_2cf12865-498a-4e42-92fc-d0f63a796622",
        label: "Adjustment",
        fields: [
          { key: "label", type: "text", required: true, label: "Label" },
          {
            key: "rate",
            type: "reference",
            required: true,
            label: "Rate",
            to: "rate",
          },
        ],
        operations: [
          {
            key: "update",
            label: "Update adjustment",
            kind: "update",
            scope: "record",
            effect: { type: "patchRecord" },
          },
        ],
      },
    ],
    relationships: [
      ...(rateSourceSchema.relationships ?? []),
      {
        key: "rateAdjustments",
        kind: "toMany",
        from: { entity: "rate" },
        to: { entity: "adjustment", field: "rate" },
      },
    ],
    itemViews: [
      ...rateSourceSchema.itemViews,
      {
        key: "adjustmentItem",
        entity: "adjustment",
        fields: [{ field: "label", editor: "text", commit: "field-commit" }],
      },
    ],
    screens: rateSourceSchema.screens.map((screen) =>
      screen.key === setup.key
        ? {
            ...setup,
            layout: {
              ...setup.layout,
              sections: [
                {
                  ...cards,
                  detail: {
                    type: "selectedRecord" as const,
                    context: "selectedCard",
                    sections: [hierarchy],
                  },
                },
              ],
            },
          }
        : screen,
    ),
  });
}

function committedCommandResponse(): OperationInvocationResponse {
  return {
    invocation: {} as OperationInvocationResponse["invocation"],
    output: {
      affectedChangeIds: [],
      changes: [],
      cursor: 1,
      recordPlan: { steps: [] },
      type: "command",
    },
    status: "committed",
  };
}

function committedCreateResponse(record: StoredRecord): OperationInvocationResponse {
  return {
    invocation: {} as OperationInvocationResponse["invocation"],
    output: {
      affectedChangeIds: ["write-rate-create"],
      changes: [change(3, record, "create", "write-rate-create")],
      cursor: 3,
      record,
      type: "create",
    },
    status: "committed",
  };
}

function change(
  seq: number,
  record: StoredRecord,
  operationKind: ChangeRow["operationKind"],
  writeId: string,
): ChangeRow {
  return {
    createdAt: record.updatedAt,
    entity: record.entity,
    operationKind,
    payload: record,
    recordId: record.id,
    seq,
    writeId,
  };
}

function committedDeleteResponse(recordId: string): OperationInvocationResponse {
  return {
    invocation: {} as OperationInvocationResponse["invocation"],
    output: { affectedChangeIds: [], changes: [], cursor: 2, recordId, type: "delete" },
    status: "committed",
  };
}

function deferredOperationResponse() {
  let resolve!: (response: OperationInvocationResponse) => void;
  const promise = new Promise<OperationInvocationResponse>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error("Expected fixture value.");
  }
  return value;
}
