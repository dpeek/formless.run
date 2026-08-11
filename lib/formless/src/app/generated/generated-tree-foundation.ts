import type {
  CollectionEmptyStatePrimaryActionContract,
  FieldContract,
  TreeChildVariantSelectionIntent,
  TreeContextActionContract,
  TreeContextActionIntent,
  TreeCreateFieldIntent,
  TreeCreateIntent,
  TreeEditingAvailability,
  TreeNodeContract,
  TreeOperationIntent,
  TreeOrderingContract,
  TreeRecordResultIntent,
  TreeReorderIntent,
  TreeResultContract,
  TreeWarningContract,
} from "@dpeek/formless-presentation/contract";
import type { AppSchema } from "@dpeek/formless-schema";
import type { FieldValue, StoredRecord } from "@dpeek/formless-storage";
import type { RecordResultModel } from "../../client/list-result-model.ts";
import { getRecordReadinessWarnings } from "../../client/readiness.ts";
import { selectTransitionStateOperations } from "../../client/state-machine-model.ts";
import type { TreeResultModel } from "../../client/tree-result-model.ts";
import {
  createIdleGeneratedOperationExecutionState,
  projectOrderingMoveOperationControlBinding,
  projectTreeCompositionOperationControlBindings,
  type GeneratedOperationControlBinding,
  type GeneratedOperationExecutionState,
  type HomeContextConfig,
} from "../../client/views.ts";
import { humanizeFieldName } from "../../client/view-labels.ts";
import { sortRecordIdsByOrdering } from "../../shared/result-ordering.ts";
import { resolveGeneratedCreateFieldIntent } from "./generated-create-field-index.ts";
import {
  rebaseGeneratedRecordResultRecordState,
  selectGeneratedRecordResultFoundation,
  selectGeneratedRecordResultRuntimeForIntent,
  type GeneratedRecordResultFoundation,
  type GeneratedRecordResultRecordState,
  type GeneratedRecordResultRuntime,
  type SelectGeneratedRecordResultFoundationOptions,
} from "./generated-record-result-foundation.ts";
import {
  projectGeneratedTreeChildCreation,
  type GeneratedTreeChildCreateRuntime,
  type GeneratedTreeChildCreationProjection,
  type GeneratedTreeChildCreationProjectionOptions,
  type GeneratedTreeChildVariantRuntime,
} from "./generated-tree-create-foundation.ts";
import {
  projectGeneratedOperationControl,
  projectGeneratedOperationFeedback,
} from "./operation-projection.ts";
import {
  selectOrderingMoveMenuItems,
  selectResultOrderingContext,
  type OrderingMoveMenuItem,
  type ResultOrderingContext,
} from "./ordering-ui.ts";
import { projectDeleteRecordButtonBinding, selectRecordLabel } from "./record-delete-runtime.ts";
import { selectRecordContextLinkForActiveUnion } from "./union-presentation.ts";

type GeneratedTreeRecordProjectionOptions = Pick<
  SelectGeneratedRecordResultFoundationOptions,
  | "confirmationOpenByControlId"
  | "mediaAssetOptionsByFieldName"
  | "operationStateByExecutionKey"
  | "referenceOptionsByFieldName"
>;

export type GeneratedTreePlacementRemovalProjectionOptions = {
  confirmationOpenByControlId?: Readonly<Record<string, boolean | undefined>>;
  operationStateByExecutionKey?: Readonly<
    Record<string, GeneratedOperationExecutionState | undefined>
  >;
};

export type GeneratedTreeOrderingProjectionOptions = {
  operationStateByExecutionKey?: Readonly<
    Record<string, GeneratedOperationExecutionState | undefined>
  >;
};

export type GeneratedTreeRootDeleteProjectionOptions = {
  confirmationOpenByControlId?: Readonly<Record<string, boolean | undefined>>;
  operationStateByExecutionKey?: Readonly<
    Record<string, GeneratedOperationExecutionState | undefined>
  >;
};

export type SelectGeneratedTreeFoundationOptions = {
  childCreation?: GeneratedTreeChildCreationProjectionOptions;
  context?: HomeContextConfig;
  emptyStateAction?: CollectionEmptyStatePrimaryActionContract;
  id: string;
  ordering?: GeneratedTreeOrderingProjectionOptions;
  placementRemoval?: GeneratedTreePlacementRemovalProjectionOptions;
  recordResult?: GeneratedTreeRecordProjectionOptions;
  recordStateByEditorId?: Readonly<Record<string, GeneratedRecordResultRecordState | undefined>>;
  recordsById: Record<string, StoredRecord>;
  result: TreeResultModel;
  rootDelete?: GeneratedTreeRootDeleteProjectionOptions;
  rootRecordId?: string | null;
  schema?: AppSchema | null;
  selectableContextRecordIds?: ReadonlySet<string>;
};

export type GeneratedTreeContextNavigationRuntime = {
  actionId: string;
  available: boolean;
  nodeId: string;
  recordId: string;
};

export type GeneratedTreeRecordResultRuntime = {
  foundation: GeneratedRecordResultFoundation;
  model: RecordResultModel;
  nodeId: string;
  recordId: string;
  recordState: GeneratedRecordResultRecordState;
};

export type GeneratedTreeRecordResultIntentRuntime = {
  node: GeneratedTreeRecordResultRuntime;
  runtime: GeneratedRecordResultRuntime;
};

export type GeneratedTreePlacementRemovalRuntime = {
  binding: GeneratedOperationControlBinding;
  kind: "placementRemoval";
  nodeId: string;
  placementId: string;
};

export type GeneratedTreeRootDeleteRuntime = {
  binding: GeneratedOperationControlBinding;
  kind: "rootDelete";
  nodeId: string;
  recordId: string;
  recordLabel: string;
};

export type GeneratedTreeOperationRuntime =
  | GeneratedTreePlacementRemovalRuntime
  | GeneratedTreeRootDeleteRuntime;

export type GeneratedTreeOrderingRuntime = {
  actionId: string;
  binding: GeneratedOperationControlBinding;
  item: OrderingMoveMenuItem;
  nodeId: string;
  orderingContext: ResultOrderingContext;
  placementId: string;
};

export type GeneratedTreeRuntimePlan = {
  childCreateBySurfaceId: ReadonlyMap<string, GeneratedTreeChildCreateRuntime>;
  childVariantById: ReadonlyMap<string, GeneratedTreeChildVariantRuntime>;
  contextActionById: ReadonlyMap<string, GeneratedTreeContextNavigationRuntime>;
  orderingByNodeId: ReadonlyMap<string, readonly GeneratedTreeOrderingRuntime[]>;
  orderings: readonly GeneratedTreeOrderingRuntime[];
  recordResultByNodeId: ReadonlyMap<string, GeneratedTreeRecordResultRuntime>;
  recordResults: readonly GeneratedTreeRecordResultRuntime[];
  removePlacementByControlId: ReadonlyMap<string, GeneratedTreePlacementRemovalRuntime>;
  removePlacements: readonly GeneratedTreePlacementRemovalRuntime[];
  resultId: string;
  rootDeleteByControlId: ReadonlyMap<string, GeneratedTreeRootDeleteRuntime>;
  rootDeletes: readonly GeneratedTreeRootDeleteRuntime[];
};

export type GeneratedTreeFoundation = {
  runtimePlan: GeneratedTreeRuntimePlan;
  tree: TreeResultContract;
};

type MutableGeneratedTreeRuntimePlan = {
  childCreations: GeneratedTreeChildCreationProjection[];
  contextNavigations: GeneratedTreeContextNavigationRuntime[];
  orderings: GeneratedTreeOrderingRuntime[];
  recordResults: GeneratedTreeRecordResultRuntime[];
  removePlacements: GeneratedTreePlacementRemovalRuntime[];
  rootDeletes: GeneratedTreeRootDeleteRuntime[];
};

type GeneratedTreeProjectionContext = {
  childCreation: GeneratedTreeChildCreationProjectionOptions | undefined;
  context: HomeContextConfig | undefined;
  editing: TreeEditingAvailability;
  id: string;
  ordering: GeneratedTreeOrderingProjectionOptions | undefined;
  placementRemoval: GeneratedTreePlacementRemovalProjectionOptions | undefined;
  recordResult: GeneratedTreeRecordProjectionOptions | undefined;
  recordStateByEditorId: Readonly<Record<string, GeneratedRecordResultRecordState | undefined>>;
  recordsById: Record<string, StoredRecord>;
  result: TreeResultModel;
  rootDelete: GeneratedTreeRootDeleteProjectionOptions | undefined;
  runtime: MutableGeneratedTreeRuntimePlan;
  schema: AppSchema | null;
  selectableContextRecordIds: ReadonlySet<string> | undefined;
};

export function selectGeneratedTreeFoundation({
  childCreation,
  context,
  emptyStateAction,
  id,
  ordering,
  placementRemoval,
  recordResult,
  recordStateByEditorId = {},
  recordsById,
  result,
  rootDelete,
  rootRecordId,
  schema = null,
  selectableContextRecordIds,
}: SelectGeneratedTreeFoundationOptions): GeneratedTreeFoundation {
  const selectedRootId = stringValue(rootRecordId ?? undefined);
  const rootRecord = selectChildRecord(selectedRootId, recordsById, result);
  const unavailableMessage =
    selectedRootId === undefined
      ? "Select a tree root to continue."
      : "The selected tree root is unavailable.";
  const editing: TreeEditingAvailability =
    rootRecord === undefined
      ? { disabledReason: unavailableMessage, enabled: false }
      : generatedTreeSupportsEditing(result)
        ? { enabled: true }
        : { disabledReason: "Editing is unavailable for this tree.", enabled: false };
  const runtime: MutableGeneratedTreeRuntimePlan = {
    childCreations: [],
    contextNavigations: [],
    orderings: [],
    recordResults: [],
    removePlacements: [],
    rootDeletes: [],
  };
  const projection: GeneratedTreeProjectionContext = {
    childCreation,
    context,
    editing,
    id,
    ordering,
    placementRemoval,
    recordResult,
    recordStateByEditorId,
    recordsById,
    result,
    rootDelete,
    runtime,
    schema,
    selectableContextRecordIds,
  };
  const root =
    rootRecord === undefined
      ? undefined
      : projectGeneratedTreeRootNode({ projection, record: rootRecord });
  const recordResultByNodeId = uniqueRuntimeMap(
    runtime.recordResults,
    ({ nodeId }) => nodeId,
    "record-result node",
  );
  const childVariantById = uniqueRuntimeMap(
    runtime.childCreations.flatMap(({ variantRuntimes }) => variantRuntimes),
    ({ variantId }) => variantId,
    "child variant",
  );
  const childCreateBySurfaceId = uniqueRuntimeMap(
    runtime.childCreations.flatMap(({ createRuntime }) =>
      createRuntime === undefined ? [] : [createRuntime],
    ),
    ({ surfaceId }) => surfaceId,
    "child create surface",
  );
  const contextActionById = uniqueRuntimeMap(
    runtime.contextNavigations,
    ({ actionId }) => actionId,
    "context action",
  );
  const orderingByNodeId = new Map<string, GeneratedTreeOrderingRuntime[]>();
  for (const item of runtime.orderings) {
    const current = orderingByNodeId.get(item.nodeId) ?? [];
    orderingByNodeId.set(item.nodeId, [...current, item]);
  }
  const removePlacementByControlId = uniqueRuntimeMap(
    runtime.removePlacements,
    ({ binding }) => binding.id,
    "placement removal",
  );
  const rootDeleteByControlId = uniqueRuntimeMap(
    runtime.rootDeletes,
    ({ binding }) => binding.id,
    "root delete",
  );

  return {
    runtimePlan: {
      childCreateBySurfaceId,
      childVariantById,
      contextActionById,
      orderingByNodeId,
      orderings: runtime.orderings,
      recordResultByNodeId,
      recordResults: runtime.recordResults,
      removePlacementByControlId,
      removePlacements: runtime.removePlacements,
      resultId: id,
      rootDeleteByControlId,
      rootDeletes: runtime.rootDeletes,
    },
    tree: {
      accessibilityLabel: `${treeRootLabel(rootRecord, result)} tree`,
      availability:
        rootRecord !== undefined
          ? { state: "ready" }
          : emptyStateAction === undefined
            ? { message: unavailableMessage, state: "unavailable" }
            : {
                emptyState: {
                  action: emptyStateAction,
                  id: `${id}:empty`,
                  kind: "treeEmptyState",
                  title: "No tree root yet.",
                },
                state: "empty",
              },
      density: "default",
      editing,
      feedback: projectGeneratedTreeOrderingFeedback(runtime.orderings, ordering),
      id,
      kind: "treeResult",
      ...(root === undefined ? {} : { root }),
      warnings: [],
    },
  };
}

export function resolveGeneratedTreeContextActionIntent(
  runtimePlan: GeneratedTreeRuntimePlan,
  intent: TreeContextActionIntent,
): GeneratedTreeContextNavigationRuntime | undefined {
  if (intent.resultId !== runtimePlan.resultId) {
    return undefined;
  }
  const runtime = runtimePlan.contextActionById.get(intent.actionId);
  return runtime?.available === true && runtime.nodeId === intent.nodeId ? runtime : undefined;
}

export function resolveGeneratedTreeChildVariantSelectionIntent(
  runtimePlan: GeneratedTreeRuntimePlan,
  intent: TreeChildVariantSelectionIntent,
): GeneratedTreeChildVariantRuntime | undefined {
  if (intent.resultId !== runtimePlan.resultId) {
    return undefined;
  }
  const runtime = runtimePlan.childVariantById.get(intent.variantId);
  return runtime?.available === true && runtime.nodeId === intent.nodeId ? runtime : undefined;
}

export function resolveGeneratedTreeCreateIntent(
  runtimePlan: GeneratedTreeRuntimePlan,
  intent: TreeCreateIntent,
): GeneratedTreeChildCreateRuntime | undefined {
  if (intent.resultId !== runtimePlan.resultId || intent.surfaceId !== intent.intent.surfaceId) {
    return undefined;
  }
  const runtime = runtimePlan.childCreateBySurfaceId.get(intent.surfaceId);
  return runtime?.nodeId === intent.nodeId ? runtime : undefined;
}

export function resolveGeneratedTreeCreateFieldIntent(
  runtimePlan: GeneratedTreeRuntimePlan,
  intent: TreeCreateFieldIntent,
): { field: FieldContract; runtime: GeneratedTreeChildCreateRuntime } | undefined {
  if (intent.resultId !== runtimePlan.resultId) {
    return undefined;
  }
  const runtime = runtimePlan.childCreateBySurfaceId.get(intent.surfaceId);
  if (runtime === undefined || runtime.nodeId !== intent.nodeId) {
    return undefined;
  }
  const field =
    intent.intent.type === "mediaFileSelect"
      ? runtime.fieldsById.get(intent.fieldId)
      : resolveGeneratedCreateFieldIntent(runtime.fieldsById, intent.fieldId, intent.intent);
  if (
    intent.intent.type === "mediaFileSelect" &&
    (field === undefined || field.fieldName !== intent.intent.fieldName)
  ) {
    return undefined;
  }
  return field === undefined ? undefined : { field, runtime };
}

export function resolveGeneratedTreeRecordResultIntent(
  runtimePlan: GeneratedTreeRuntimePlan,
  intent: TreeRecordResultIntent,
): GeneratedTreeRecordResultIntentRuntime | undefined {
  if (intent.resultId !== runtimePlan.resultId) {
    return undefined;
  }
  const node = runtimePlan.recordResultByNodeId.get(intent.nodeId);
  if (node === undefined) {
    return undefined;
  }
  const runtime = selectGeneratedRecordResultRuntimeForIntent(
    node.foundation.runtimePlan,
    intent.intent,
  );
  return runtime === undefined ? undefined : { node, runtime };
}

export function resolveGeneratedTreeOperationIntent(
  runtimePlan: GeneratedTreeRuntimePlan,
  intent: TreeOperationIntent,
): GeneratedTreeOperationRuntime | undefined {
  if (intent.resultId !== runtimePlan.resultId || intent.controlId !== intent.intent.controlId) {
    return undefined;
  }
  const runtime =
    runtimePlan.rootDeleteByControlId.get(intent.controlId) ??
    runtimePlan.removePlacementByControlId.get(intent.controlId);
  return runtime?.nodeId === intent.nodeId ? runtime : undefined;
}

export function resolveGeneratedTreeReorderIntent(
  runtimePlan: GeneratedTreeRuntimePlan,
  intent: TreeReorderIntent,
): GeneratedTreeOrderingRuntime | undefined {
  if (intent.resultId !== runtimePlan.resultId) {
    return undefined;
  }
  return (runtimePlan.orderingByNodeId.get(intent.nodeId) ?? []).find(
    (runtime) =>
      runtime.actionId === intent.actionId && runtime.item.direction === intent.direction,
  );
}

function projectGeneratedTreeRootNode({
  projection,
  record,
}: {
  projection: GeneratedTreeProjectionContext;
  record: StoredRecord;
}): TreeNodeContract {
  const nodeId = `${projection.id}:root:${record.id}`;
  const label = treeRootLabel(record, projection.result);
  const leaf = isTreeBranchLeaf(projection.result, record);
  const editor = projectGeneratedTreeRecordResult({ nodeId, projection, record });
  const contextActions = projectGeneratedTreeContextActions({
    nodeId,
    projection,
    record,
  });
  const childCreation = leaf
    ? undefined
    : projectGeneratedTreeNodeChildCreation({ label, nodeId, projection, record });
  const rootDelete = projectGeneratedTreeRootDelete({ label, nodeId, projection, record });
  const children = leaf
    ? []
    : selectChildPlacements(record.id, projection.recordsById, projection.result).map((placement) =>
        projectGeneratedTreePlacementNode({
          ancestors: new Set([record.id]),
          depth: 0,
          parentNodeId: nodeId,
          placement,
          projection,
        }),
      );
  const headerItems = [
    ...contextActions,
    ...(childCreation === undefined ? [] : [childCreation.contract]),
    ...(rootDelete === undefined
      ? []
      : [
          {
            control: rootDelete.control,
            kind: "operationAction" as const,
            role: "rootDelete" as const,
          },
        ]),
  ];

  return {
    accessibilityLabel: `${label} block`,
    availability: { available: true },
    children,
    editor: editor.foundation.recordResult,
    entityTypeLabel: treeNodeTypeLabel(record, projection.result),
    headerActions: treeNodeActions(nodeId, label, headerItems),
    id: nodeId,
    kind: "treeNode",
    label,
    structure: { state: leaf ? "leaf" : "branch" },
    ...(selectTreeNodeVariant(projection.result, record, nodeId) === undefined
      ? {}
      : { variant: selectTreeNodeVariant(projection.result, record, nodeId) }),
    warnings: projectGeneratedTreeRootReadinessWarnings({
      nodeId,
      record,
      recordsById: projection.recordsById,
    }),
  };
}

function projectGeneratedTreePlacementNode({
  ancestors,
  depth,
  parentNodeId,
  placement,
  projection,
}: {
  ancestors: ReadonlySet<string>;
  depth: number;
  parentNodeId: string;
  placement: StoredRecord;
  projection: GeneratedTreeProjectionContext;
}): TreeNodeContract {
  const nodeId = `${parentNodeId}:placement:${placement.id}`;
  const childRecordId = stringValue(placement.values[projection.result.childFieldName]);
  const childRecord = selectChildRecord(childRecordId, projection.recordsById, projection.result);
  const leaf = childRecord ? isTreeBranchLeaf(projection.result, childRecord) : false;
  const cycle = childRecord !== undefined && !leaf && ancestors.has(childRecord.id);
  const descendants =
    childRecord !== undefined && !leaf && !cycle
      ? selectChildPlacements(childRecord.id, projection.recordsById, projection.result)
      : [];
  const depthStopped =
    childRecord !== undefined &&
    !leaf &&
    !cycle &&
    depth >= projection.result.maxDepth &&
    descendants.length > 0;
  const structure: TreeNodeContract["structure"] =
    childRecord === undefined
      ? { message: "Child record is unavailable.", state: "missingChild" }
      : leaf
        ? { state: "leaf" }
        : cycle
          ? { message: "Cycle stopped at this item.", state: "cycleStopped" }
          : depthStopped
            ? { message: "Maximum tree depth reached.", state: "depthStopped" }
            : { state: "branch" };
  const label =
    childRecord === undefined
      ? "Missing child"
      : selectRecordLabel(
          childRecord,
          projection.result.childRecordFields,
          projection.result.childEntity.label,
          childRecord.id,
        );
  const children =
    childRecord === undefined || leaf || cycle || depthStopped
      ? []
      : descendants.map((childPlacement) =>
          projectGeneratedTreePlacementNode({
            ancestors: new Set([...ancestors, childRecord.id]),
            depth: depth + 1,
            parentNodeId: nodeId,
            placement: childPlacement,
            projection,
          }),
        );
  const editor =
    childRecord === undefined
      ? undefined
      : projectGeneratedTreeRecordResult({ nodeId, projection, record: childRecord });
  const contextActions =
    childRecord === undefined
      ? []
      : projectGeneratedTreeContextActions({ nodeId, projection, record: childRecord });
  const childCreation =
    childRecord === undefined || structure.state !== "branch"
      ? undefined
      : projectGeneratedTreeNodeChildCreation({
          label,
          nodeId,
          projection,
          record: childRecord,
        });
  const ordering = projectGeneratedTreeOrdering({ nodeId, placement, projection, label });
  const removal = projectGeneratedTreePlacementRemoval({ nodeId, placement, projection, label });
  const slotValue = stringValue(placement.values.slot);
  const headerItems = [
    ...contextActions,
    ...(childCreation === undefined ? [] : [childCreation.contract]),
    ...(ordering === undefined ? [] : [ordering]),
    ...(removal === undefined
      ? []
      : [
          {
            control: removal.control,
            kind: "operationAction" as const,
            role: "placementRemoval" as const,
          },
        ]),
  ];

  return {
    accessibilityLabel: label,
    availability: { available: true },
    children,
    ...(editor === undefined ? {} : { editor: editor.foundation.recordResult }),
    entityTypeLabel:
      childRecord === undefined
        ? projection.result.childEntity.label
        : treeNodeTypeLabel(childRecord, projection.result),
    headerActions: treeNodeActions(nodeId, label, headerItems),
    id: nodeId,
    kind: "treeNode",
    label,
    ...(slotValue === undefined
      ? {}
      : {
          slot: {
            id: `${nodeId}:slot:${slotValue}`,
            kind: "treeNodeSlot" as const,
            label: humanizeFieldName(slotValue),
          },
        }),
    structure,
    ...(childRecord === undefined ||
    selectTreeNodeVariant(projection.result, childRecord, nodeId) === undefined
      ? {}
      : { variant: selectTreeNodeVariant(projection.result, childRecord, nodeId) }),
    warnings: projectGeneratedTreeReadinessWarnings({
      childRecord,
      nodeId,
      placement,
      recordsById: projection.recordsById,
    }),
  };
}

function projectGeneratedTreeRecordResult({
  nodeId,
  projection,
  record,
}: {
  nodeId: string;
  projection: GeneratedTreeProjectionContext;
  record: StoredRecord;
}): GeneratedTreeRecordResultRuntime {
  const editorId = `${nodeId}:editor`;
  const model = generatedTreeRecordResult(projection.result);
  const recordState = rebaseGeneratedRecordResultRecordState({
    current: projection.recordStateByEditorId[editorId],
    record,
    result: model,
  });
  if (recordState === undefined) {
    throw new Error(`Missing tree record editor state for "${record.id}".`);
  }
  const foundation = selectGeneratedRecordResultFoundation({
    accessibilityLabel: `${treeNodeTypeLabel(record, projection.result)} editor`,
    density: "compact",
    editingDisabledReason:
      projection.editing.enabled === false ? projection.editing.disabledReason : undefined,
    entity: projection.result.childEntity,
    entityName: projection.result.childEntityName,
    fieldPresentation: "treeChild",
    fieldState: recordState,
    id: editorId,
    recordIds: [record.id],
    recordsById: projection.recordsById,
    result: model,
    schema: projection.schema,
    selectedRecordId: record.id,
    ...projection.recordResult,
  });
  const runtime = { foundation, model, nodeId, recordId: record.id, recordState };
  projection.runtime.recordResults.push(runtime);
  return runtime;
}

function projectGeneratedTreeNodeChildCreation({
  label,
  nodeId,
  projection,
  record,
}: {
  label: string;
  nodeId: string;
  projection: GeneratedTreeProjectionContext;
  record: StoredRecord;
}): GeneratedTreeChildCreationProjection | undefined {
  const creation = projectGeneratedTreeChildCreation({
    creationId: `${nodeId}:children`,
    editing: projection.editing,
    nodeId,
    options: { ...projection.childCreation, schema: projection.schema },
    parentLabel: label,
    parentRecord: record,
    result: projection.result,
    resultId: projection.id,
  });
  if (creation !== undefined) {
    projection.runtime.childCreations.push(creation);
  }
  return creation;
}

function projectGeneratedTreeContextActions({
  nodeId,
  projection,
  record,
}: {
  nodeId: string;
  projection: GeneratedTreeProjectionContext;
  record: StoredRecord;
}): TreeContextActionContract[] {
  const contextLink = selectRecordContextLinkForActiveUnion(
    projection.result.childRecordUnion,
    record,
  );
  if (contextLink === undefined) {
    return [];
  }
  const label = stringValue(record.values[contextLink.labelFieldName]) ?? record.id;
  const available =
    projection.context !== undefined &&
    projection.context.name === contextLink.target.contextName &&
    projection.context.entityName === projection.result.childEntityName &&
    projection.selectableContextRecordIds?.has(record.id) === true;
  const unavailableMessage = "This item is unavailable as a workspace context target.";
  const actionId = `${nodeId}:context:${contextLink.target.contextName}`;
  const runtime = { actionId, available, nodeId, recordId: record.id };
  projection.runtime.contextNavigations.push(runtime);

  return [
    {
      availability: available
        ? { available: true }
        : { available: false, message: unavailableMessage },
      control: {
        accessibilityLabel: `Open ${label}`,
        content: { kind: "label", label: "Open" },
        density: "compact",
        ...(available ? {} : { disabled: true, disabledReason: unavailableMessage }),
        id: `${actionId}:control`,
        kind: "button",
        prominence: "secondary",
        type: "button",
      },
      id: actionId,
      intent: { actionId, nodeId, resultId: projection.id, type: "treeContextAction" },
      kind: "treeContextAction",
    },
  ];
}

function projectGeneratedTreeOrdering({
  label,
  nodeId,
  placement,
  projection,
}: {
  label: string;
  nodeId: string;
  placement: StoredRecord;
  projection: GeneratedTreeProjectionContext;
}): TreeOrderingContract | undefined {
  const result = projection.result;
  if (result.ordering === undefined) {
    return undefined;
  }
  const parentValue = placement.values[result.relationship.to.field];
  const slotValue = placement.values.slot;
  const exactScopeRecordIds = Object.values(projection.recordsById)
    .filter(
      (candidate) =>
        candidate.entity === result.placementEntityName &&
        !candidate.deletedAt &&
        candidate.values[result.relationship.to.field] === parentValue &&
        candidate.values.slot === slotValue,
    )
    .map(({ id }) => id);
  const orderingContext = selectResultOrderingContext({
    entityName: result.placementEntityName,
    ordering: result.ordering,
    recordIds: exactScopeRecordIds,
    recordsById: projection.recordsById,
    updateOperation: result.placementUpdateOperation,
  });
  const items = selectOrderingMoveMenuItems({
    includeOrdering: orderingContext !== undefined,
    orderingContext,
    sourceRecordId: placement.id,
  });
  if (orderingContext === undefined || items.length === 0) {
    return undefined;
  }
  const runtimes = items.flatMap((item): GeneratedTreeOrderingRuntime[] => {
    const actionId = `${nodeId}:order:${item.direction}`;
    const binding = projectOrderingMoveOperationControlBinding(
      {
        direction: item.direction,
        disabledReason: item.disabledReason,
        label: item.label,
        ordering: orderingContext.ordering,
        updateOperation: orderingContext.updateOperation,
      },
      { executionTargetKey: placement.id, id: actionId },
    );
    return binding === undefined
      ? []
      : [{ actionId, binding, item, nodeId, orderingContext, placementId: placement.id }];
  });
  projection.runtime.orderings.push(...runtimes);
  const pending = runtimes.some(
    ({ binding }) =>
      projection.ordering?.operationStateByExecutionKey?.[binding.executionKey]?.status ===
      "pending",
  );

  return {
    accessibilityLabel: `Reorder ${label}`,
    actions: items.map((item) => {
      const id = `${nodeId}:order:${item.direction}`;
      const disabledReason = pending ? "Ordering in progress" : item.disabledReason;
      return {
        direction: item.direction,
        disabled: item.disabled || pending,
        ...(disabledReason === undefined ? {} : { disabledReason }),
        id,
        intent: {
          actionId: id,
          direction: item.direction,
          nodeId,
          resultId: projection.id,
          type: "treeReorder",
        },
        label: item.label,
        ...(pending ? { pending: { isPending: true, label: "Ordering in progress" } } : {}),
        structurallyAvailable: !(
          item.plan.kind === "unavailable" && item.plan.reason === "already-at-boundary"
        ),
      };
    }),
    affordance: "reorder",
    id: `${nodeId}:ordering`,
    kind: "treeOrderingAction",
    pending,
  };
}

function projectGeneratedTreePlacementRemoval({
  label,
  nodeId,
  placement,
  projection,
}: {
  label: string;
  nodeId: string;
  placement: StoredRecord;
  projection: GeneratedTreeProjectionContext;
}) {
  const binding = projectTreeCompositionOperationControlBindings(projection.result.composition, {
    executionTargetKey: placement.id,
    id: `${nodeId}:remove-placement`,
  }).find(
    (candidate) =>
      candidate.input.kind === "treeComposition" && candidate.input.action === "remove",
  );
  if (binding === undefined) {
    return undefined;
  }
  const state =
    projection.placementRemoval?.operationStateByExecutionKey?.[binding.executionKey] ??
    createIdleGeneratedOperationExecutionState(binding.executionKey);
  const projectedState =
    state.result?.type === "failed"
      ? { ...state, result: { displayError: "Remove failed. Try again.", type: "failed" as const } }
      : state;
  const runtime: GeneratedTreePlacementRemovalRuntime = {
    binding,
    kind: "placementRemoval",
    nodeId,
    placementId: placement.id,
  };
  projection.runtime.removePlacements.push(runtime);
  return {
    control: projectGeneratedOperationControl({
      binding,
      confirmationOpen:
        projection.placementRemoval?.confirmationOpenByControlId?.[binding.id] ?? false,
      feedbackCopy: {
        committed: { title: "Placement removed and synced." },
        failed: { detail: "Remove failed. Try again.", title: "Remove failed." },
        replayed: { title: "Placement removed and synced." },
      },
      presentation: {
        accessibilityLabel: `Remove ${label} placement`,
        content: { icon: "delete", kind: "iconOnly" },
        density: "compact",
        pendingLabel: "Removing placement...",
        prominence: "quiet",
      },
      state: projectedState,
    }),
    runtime,
  };
}

function projectGeneratedTreeRootDelete({
  label,
  nodeId,
  projection,
  record,
}: {
  label: string;
  nodeId: string;
  projection: GeneratedTreeProjectionContext;
  record: StoredRecord;
}) {
  if (projection.result.childDeleteOperation === undefined) {
    return undefined;
  }
  const binding = projectDeleteRecordButtonBinding({
    deleteOperation: projection.result.childDeleteOperation,
    entityLabel: projection.result.childEntity.label,
    idPrefix: `${nodeId}:root-delete`,
    recordId: record.id,
    recordLabel: label,
  });
  if (binding === undefined) {
    return undefined;
  }
  const state =
    projection.rootDelete?.operationStateByExecutionKey?.[binding.executionKey] ??
    createIdleGeneratedOperationExecutionState(binding.executionKey);
  const runtime: GeneratedTreeRootDeleteRuntime = {
    binding,
    kind: "rootDelete",
    nodeId,
    recordId: record.id,
    recordLabel: label,
  };
  projection.runtime.rootDeletes.push(runtime);
  return {
    control: projectGeneratedOperationControl({
      binding,
      confirmationOpen: projection.rootDelete?.confirmationOpenByControlId?.[binding.id] ?? false,
      presentation: {
        accessibilityLabel: `Delete ${label}`,
        content: { icon: "delete", kind: "iconOnly" },
        density: "compact",
        prominence: "quiet",
      },
      state,
    }),
    runtime,
  };
}

function generatedTreeRecordResult(result: TreeResultModel): RecordResultModel {
  return {
    ...(result.childUpdateOperation === undefined
      ? {}
      : { updateOperation: result.childUpdateOperation }),
    itemViewName: result.childItemViewName,
    recordFields: result.childRecordFields,
    ...(result.childRecordUnion === undefined ? {} : { recordUnion: result.childRecordUnion }),
    transitionOperations: selectTransitionStateOperations(
      result.childEntityName,
      result.childEntity,
    ),
    type: "record",
  };
}

function treeNodeActions(
  nodeId: string,
  label: string,
  items: TreeNodeContract["headerActions"]["items"],
): TreeNodeContract["headerActions"] {
  return {
    accessibilityLabel: `More ${label} actions`,
    id: `${nodeId}:header-actions`,
    items,
    kind: "treeNodeActions",
  };
}

function projectGeneratedTreeOrderingFeedback(
  orderings: readonly GeneratedTreeOrderingRuntime[],
  options: GeneratedTreeOrderingProjectionOptions | undefined,
): TreeResultContract["feedback"] {
  const projected = [];
  const seenExecutionKeys = new Set<string>();
  for (const runtime of orderings) {
    const executionKey = runtime.binding.executionKey;
    if (seenExecutionKeys.has(executionKey)) {
      continue;
    }
    seenExecutionKeys.add(executionKey);
    const state = options?.operationStateByExecutionKey?.[executionKey];
    if (state === undefined || state.status === "idle") {
      continue;
    }
    const feedback = projectGeneratedOperationFeedback(
      runtime.binding,
      displaySafeTreeOrderingState(state),
      {
        copy: {
          committed: { title: "Placement moved and synced." },
          failed: { detail: "Move failed. Try again.", title: "Move failed." },
          pending: { title: "Moving placement." },
          replayed: { title: "Placement moved and synced." },
        },
      },
    );
    if (feedback !== undefined) {
      projected.push(feedback);
    }
  }
  return projected;
}

function displaySafeTreeOrderingState(
  state: GeneratedOperationExecutionState,
): GeneratedOperationExecutionState {
  return {
    ...(state.completedAt === undefined ? {} : { completedAt: state.completedAt }),
    executionKey: state.executionKey,
    ...(state.startedAt === undefined ? {} : { startedAt: state.startedAt }),
    status: state.status,
    ...(state.result === undefined
      ? {}
      : {
          result:
            state.result.type === "failed"
              ? { displayError: "Move failed. Try again.", type: "failed" as const }
              : { type: state.result.type },
        }),
  };
}

function projectGeneratedTreeRootReadinessWarnings({
  nodeId,
  record,
  recordsById,
}: {
  nodeId: string;
  record: StoredRecord;
  recordsById: Readonly<Record<string, StoredRecord>>;
}): TreeWarningContract[] {
  const warning = projectGeneratedTreeRecordReadinessWarning({
    nodeId,
    record,
    recordsById,
    source: "child",
    title: "Block readiness warnings",
  });
  return warning === undefined ? [] : [warning];
}

function projectGeneratedTreeReadinessWarnings({
  childRecord,
  nodeId,
  placement,
  recordsById,
}: {
  childRecord: StoredRecord | undefined;
  nodeId: string;
  placement: StoredRecord;
  recordsById: Readonly<Record<string, StoredRecord>>;
}): TreeWarningContract[] {
  return [
    projectGeneratedTreeRecordReadinessWarning({
      nodeId,
      record: placement,
      recordsById,
      source: "placement",
      title: "Placement readiness warnings",
    }),
    childRecord === undefined
      ? undefined
      : projectGeneratedTreeRecordReadinessWarning({
          nodeId,
          record: childRecord,
          recordsById,
          source: "child",
          title: "Block readiness warnings",
        }),
  ].filter((warning): warning is TreeWarningContract => warning !== undefined);
}

function projectGeneratedTreeRecordReadinessWarning({
  nodeId,
  record,
  recordsById,
  source,
  title,
}: {
  nodeId: string;
  record: StoredRecord;
  recordsById: Readonly<Record<string, StoredRecord>>;
  source: "child" | "placement";
  title: string;
}): TreeWarningContract | undefined {
  const items = getRecordReadinessWarnings(record, recordsById);
  return items.length === 0
    ? undefined
    : {
        id: `${nodeId}:warning:${source}-readiness`,
        items: items.map(({ code, message }) => ({ code, message })),
        kind: "treeWarning",
        source,
        title,
      };
}

function selectChildPlacements(
  parentRecordId: string,
  recordsById: Record<string, StoredRecord>,
  result: TreeResultModel,
): StoredRecord[] {
  const placements = Object.values(recordsById)
    .filter(
      (record) =>
        record.entity === result.relationship.to.entity &&
        !record.deletedAt &&
        record.values[result.relationship.to.field] === parentRecordId,
    )
    .sort(compareStableRecords);
  const placementIds = placements.map(({ id }) => id);
  const orderedRecordIds = result.ordering
    ? sortRecordIdsByOrdering(
        placementIds,
        recordsById,
        result.ordering.fieldName,
        result.ordering.scope.map(({ fieldName }) => fieldName),
      )
    : placementIds;
  return orderedRecordIds.flatMap((recordId) => {
    const record = recordsById[recordId];
    return record?.entity === result.relationship.to.entity && !record.deletedAt ? [record] : [];
  });
}

function selectChildRecord(
  recordId: string | undefined,
  recordsById: Record<string, StoredRecord>,
  result: TreeResultModel,
): StoredRecord | undefined {
  const record = recordId === undefined ? undefined : recordsById[recordId];
  return record?.entity === result.childEntityName && !record.deletedAt ? record : undefined;
}

function selectTreeNodeVariant(
  result: TreeResultModel,
  record: StoredRecord,
  nodeId: string,
): TreeNodeContract["variant"] {
  const union = result.childRecordUnion;
  const variantValue = union ? stringValue(record.values[union.discriminatorFieldName]) : undefined;
  const variant = union?.variants.find((candidate) => candidate.variantValue === variantValue);
  const definition =
    variantValue === undefined
      ? undefined
      : union?.union.variants.find((candidate) => candidate.key === variantValue);
  return variantValue === undefined || definition === undefined
    ? undefined
    : {
        id: `${nodeId}:variant:${variantValue}`,
        kind: "treeNodeVariant",
        label: variant?.label ?? definition.label,
      };
}

function treeRootLabel(record: StoredRecord | undefined, result: TreeResultModel): string {
  return record === undefined
    ? result.childEntity.label
    : selectRecordLabel(record, result.childRecordFields, result.childEntity.label, record.id);
}

function treeNodeTypeLabel(record: StoredRecord, result: TreeResultModel): string {
  const discriminator = result.branches?.variants.discriminatorFieldName ?? "type";
  const type = stringValue(record.values[discriminator]);
  return type === undefined ? result.childEntity.label : humanizeFieldName(type);
}

function isTreeBranchLeaf(result: TreeResultModel, record: StoredRecord): boolean {
  const variants = result.branches?.variants;
  const variantValue = variants
    ? stringValue(record.values[variants.discriminatorFieldName])
    : undefined;
  return (
    variantValue !== undefined && (variants?.leafVariantValues.includes(variantValue) ?? false)
  );
}

function generatedTreeSupportsEditing(result: TreeResultModel): boolean {
  return (
    result.childUpdateOperation !== undefined ||
    result.composition?.create !== undefined ||
    result.composition?.remove !== undefined
  );
}

function uniqueRuntimeMap<Value>(
  values: readonly Value[],
  key: (value: Value) => string,
  label: string,
): Map<string, Value> {
  const result = new Map<string, Value>();
  for (const value of values) {
    const id = key(value);
    if (result.has(id)) {
      throw new Error(`Duplicate tree ${label} "${id}".`);
    }
    result.set(id, value);
  }
  return result;
}

function stringValue(value: FieldValue | string | null | undefined): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function compareStableRecords(left: StoredRecord, right: StoredRecord): number {
  return compareStrings(left.createdAt, right.createdAt) || compareStrings(left.id, right.id);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
