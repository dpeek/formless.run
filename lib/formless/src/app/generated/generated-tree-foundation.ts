import type {
  FieldContract,
  TreeChildVariantSelectionIntent,
  TreeContextActionIntent,
  TreeCreateIntent,
  TreeDisclosureOpenChangeIntent,
  TreeEditingAvailability,
  TreeFieldIntent,
  TreeItemContract,
  TreeItemSelectionIntent,
  TreeOperationIntent,
  CollectionEmptyStatePrimaryActionContract,
  TreeOrderingContract,
  TreeReorderIntent,
  TreeResultContract,
  TreeWarningContract,
} from "@dpeek/formless-presentation/contract";
import type { AppSchema } from "@dpeek/formless-schema";
import type { FieldValue, StoredRecord } from "@dpeek/formless-storage";
import type { RecordResultModel } from "../../client/list-result-model.ts";
import { getRecordReadinessWarnings } from "../../client/readiness.ts";
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
import {
  rebaseGeneratedRecordResultRecordState,
  resolveGeneratedRecordResultFieldIntent,
  selectGeneratedRecordResultFoundation,
  type GeneratedRecordResultFoundation,
  type GeneratedRecordResultRecordState,
  type SelectGeneratedRecordResultFoundationOptions,
} from "./generated-record-result-foundation.ts";
import { selectRecordLabel } from "./record-delete-runtime.ts";
import { selectRecordContextLinkForActiveUnion } from "./union-presentation.ts";
import {
  projectGeneratedTreeChildCreation,
  type GeneratedTreeChildCreateRuntime,
  type GeneratedTreeChildCreationProjectionOptions,
  type GeneratedTreeChildVariantRuntime,
} from "./generated-tree-create-foundation.ts";
import { resolveGeneratedCreateFieldIntent } from "./generated-create-field-index.ts";
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

type GeneratedTreeRecordProjectionOptions = Pick<
  SelectGeneratedRecordResultFoundationOptions,
  "mediaAssetOptionsByFieldName" | "referenceOptionsByFieldName"
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

export type SelectGeneratedTreeFoundationOptions = {
  childCreation?: GeneratedTreeChildCreationProjectionOptions;
  childFields?: GeneratedTreeRecordProjectionOptions;
  context?: HomeContextConfig;
  disclosureOpenByItemId?: Readonly<Record<string, boolean | undefined>>;
  emptyStateAction?: CollectionEmptyStatePrimaryActionContract;
  fieldStateByFieldSetId?: Readonly<Record<string, GeneratedRecordResultRecordState | undefined>>;
  id: string;
  ordering?: GeneratedTreeOrderingProjectionOptions;
  placementFields?: GeneratedTreeRecordProjectionOptions;
  placementRemoval?: GeneratedTreePlacementRemovalProjectionOptions;
  recordsById: Record<string, StoredRecord>;
  result: TreeResultModel;
  rootRecordId?: string | null;
  schema?: AppSchema | null;
  selectedPlacementId?: string | null;
  selectableContextRecordIds?: ReadonlySet<string>;
};

export type GeneratedTreeItemSelectionRuntime = {
  itemId: string;
  placementId: string;
};

export type GeneratedTreeDisclosureRuntime = {
  itemId: string;
  open: boolean;
};

export type GeneratedTreeContextNavigationRuntime = {
  actionId: string;
  available: boolean;
  itemId: string;
  recordId: string;
};

export type GeneratedTreeRecordFieldRuntime = {
  fieldSetId: string;
  foundation: GeneratedRecordResultFoundation;
  itemId: string;
  kind: "child" | "placement";
  recordId: string;
  recordState: GeneratedRecordResultRecordState;
  result: RecordResultModel;
};

export type GeneratedTreeFieldIntentRuntime = {
  field: FieldContract;
  target: GeneratedTreeRecordFieldRuntime;
};

export type GeneratedTreePlacementRemovalRuntime = {
  binding: GeneratedOperationControlBinding;
  fallbackPlacementId: string | null;
  itemId: string;
  placementId: string;
};

export type GeneratedTreeOrderingRuntime = {
  actionId: string;
  binding: GeneratedOperationControlBinding;
  item: OrderingMoveMenuItem;
  itemId: string;
  orderingContext: ResultOrderingContext;
  placementId: string;
};

export type GeneratedTreeRuntimePlan = {
  childCreateBySurfaceId: ReadonlyMap<string, GeneratedTreeChildCreateRuntime>;
  childVariantById: ReadonlyMap<string, GeneratedTreeChildVariantRuntime>;
  contextActionById: ReadonlyMap<string, GeneratedTreeContextNavigationRuntime>;
  disclosureByItemId: ReadonlyMap<string, GeneratedTreeDisclosureRuntime>;
  fieldTargetByFieldSetId: ReadonlyMap<string, GeneratedTreeRecordFieldRuntime>;
  itemById: ReadonlyMap<string, GeneratedTreeItemSelectionRuntime>;
  orderingByItemId: ReadonlyMap<string, readonly GeneratedTreeOrderingRuntime[]>;
  orderings: readonly GeneratedTreeOrderingRuntime[];
  removePlacementByControlId: ReadonlyMap<string, GeneratedTreePlacementRemovalRuntime>;
  removePlacements: readonly GeneratedTreePlacementRemovalRuntime[];
  resultId: string;
  selectedPlacementId: string | null;
};

export type GeneratedTreeFoundation = {
  runtimePlan: GeneratedTreeRuntimePlan;
  tree: TreeResultContract;
};

export function selectGeneratedTreeFoundation({
  childCreation,
  childFields,
  context,
  disclosureOpenByItemId = {},
  emptyStateAction,
  fieldStateByFieldSetId = {},
  id,
  ordering,
  placementFields,
  placementRemoval,
  recordsById,
  result,
  rootRecordId,
  schema = null,
  selectedPlacementId,
  selectableContextRecordIds,
}: SelectGeneratedTreeFoundationOptions): GeneratedTreeFoundation {
  const selectedRootId = stringValue(rootRecordId ?? undefined);
  const rootRecord = selectChildRecord(selectedRootId, recordsById, result);
  const rootLabel = rootRecord
    ? selectRecordLabel(
        rootRecord,
        result.childRecordFields,
        result.childEntity.label,
        rootRecord.id,
      )
    : result.childEntity.label;
  const structuralItems = rootRecord
    ? selectGeneratedTreeItems({
        ancestors: new Set([rootRecord.id]),
        depth: 0,
        id,
        parentRecordId: rootRecord.id,
        recordsById,
        result,
        context,
        selectableContextRecordIds,
        disclosureOpenByItemId,
      })
    : [];
  const structuralFlatItems = flattenTreeItems(structuralItems);
  const orderingPlan = selectGeneratedTreeOrderingPlan({
    items: structuralFlatItems,
    recordsById,
    result,
  });
  const items = projectGeneratedTreeOrderings(structuralItems, orderingPlan, ordering);
  const flatItems = flattenTreeItems(items);
  const selectedItem =
    flatItems.find((item) => item.placementId === selectedPlacementId) ?? flatItems[0];
  const selectedItems = projectGeneratedTreeSelection(items, selectedItem?.placementId);
  const rootUnavailableMessage =
    selectedRootId === undefined
      ? "Select a tree root to continue."
      : "The selected tree root is unavailable.";
  const editing: TreeEditingAvailability =
    rootRecord === undefined
      ? { disabledReason: rootUnavailableMessage, enabled: false }
      : generatedTreeSupportsEditing(result)
        ? { enabled: true }
        : { disabledReason: "Editing is unavailable for this tree.", enabled: false };
  const rootChildCreation =
    rootRecord === undefined
      ? undefined
      : projectGeneratedTreeChildCreation({
          creationId: `${id}:children:root`,
          editing,
          options: childCreation,
          parent: { kind: "root" },
          parentLabel: rootLabel,
          parentRecord: rootRecord,
          result,
          resultId: id,
        });
  const selectedChildRecord =
    selectedItem?.childRecordId === undefined
      ? undefined
      : selectChildRecord(selectedItem.childRecordId, recordsById, result);
  const selectedChildCreation =
    selectedItem === undefined ||
    selectedChildRecord === undefined ||
    selectedItem.structure.state !== "branch"
      ? undefined
      : projectGeneratedTreeChildCreation({
          creationId: `${selectedItem.id}:children`,
          editing,
          options: childCreation,
          parent: { itemId: selectedItem.id, kind: "item" },
          parentLabel: selectedItem.label,
          parentRecord: selectedChildRecord,
          result,
          resultId: id,
        });
  const selectedPlacementRemoval =
    selectedItem === undefined
      ? undefined
      : projectGeneratedTreePlacementRemoval({
          fallbackPlacementId:
            flatItems.find((item) => item.placementId !== selectedItem.placementId)?.placementId ??
            null,
          item: selectedItem,
          options: placementRemoval,
          result,
        });
  const childCreations = [rootChildCreation, selectedChildCreation].filter(
    (creation) => creation !== undefined,
  );
  const selectedProjection =
    selectedItem === undefined
      ? undefined
      : projectGeneratedTreeSelectedEditor({
          childFields,
          childCreation: selectedChildCreation?.contract,
          editing,
          fieldStateByFieldSetId,
          item: selectedItem,
          placementFields,
          removePlacement: selectedPlacementRemoval?.control,
          recordsById,
          result,
          schema,
        });

  return {
    runtimePlan: {
      childCreateBySurfaceId: new Map(
        childCreations.flatMap((creation) =>
          creation.createRuntime === undefined
            ? []
            : [[creation.createRuntime.surfaceId, creation.createRuntime] as const],
        ),
      ),
      childVariantById: new Map(
        childCreations.flatMap((creation) =>
          creation.variantRuntimes.map((runtime) => [runtime.variantId, runtime] as const),
        ),
      ),
      contextActionById: new Map(
        flatItems.flatMap((item) =>
          item.contextActions.flatMap((action) =>
            item.childRecordId === undefined
              ? []
              : [
                  [
                    action.id,
                    {
                      actionId: action.id,
                      available: action.availability.available,
                      itemId: item.id,
                      recordId: item.childRecordId,
                    },
                  ] as const,
                ],
          ),
        ),
      ),
      disclosureByItemId: new Map(
        flatItems.flatMap((item) =>
          item.disclosure === undefined
            ? []
            : [[item.id, { itemId: item.id, open: item.disclosure.intent.open }] as const],
        ),
      ),
      fieldTargetByFieldSetId: new Map(
        selectedProjection?.fieldTargets.map((target) => [target.fieldSetId, target]) ?? [],
      ),
      itemById: new Map(
        flatItems.map((item) => [item.id, { itemId: item.id, placementId: item.placementId }]),
      ),
      orderingByItemId: orderingPlan.orderingByItemId,
      orderings: orderingPlan.orderings,
      removePlacementByControlId: new Map(
        selectedPlacementRemoval === undefined
          ? []
          : [
              [
                selectedPlacementRemoval.runtime.binding.id,
                selectedPlacementRemoval.runtime,
              ] as const,
            ],
      ),
      removePlacements:
        selectedPlacementRemoval === undefined ? [] : [selectedPlacementRemoval.runtime],
      resultId: id,
      selectedPlacementId: selectedItem?.placementId ?? null,
    },
    tree: {
      accessibilityLabel: `${rootLabel} tree`,
      availability:
        rootRecord === undefined
          ? { message: rootUnavailableMessage, state: "unavailable" }
          : items.length === 0
            ? {
                emptyState: {
                  ...(emptyStateAction === undefined ? {} : { action: emptyStateAction }),
                  id: `${id}:empty`,
                  kind: "treeEmptyState",
                  title: "No placements yet.",
                },
                state: "empty",
              }
            : { state: "ready" },
      density: "default",
      editing,
      feedback: projectGeneratedTreeOrderingFeedback(orderingPlan.orderings, ordering),
      id,
      items: selectedItems,
      kind: "treeResult",
      root: {
        accessibilityLabel: `${rootLabel} tree root`,
        id: `${id}:root${selectedRootId === undefined ? "" : `:${selectedRootId}`}`,
        kind: "treeRoot",
        label: rootLabel,
      },
      ...(rootChildCreation === undefined ? {} : { rootChildCreation: rootChildCreation.contract }),
      ...(selectedProjection === undefined ? {} : { selectedEditor: selectedProjection.editor }),
      warnings: [],
    },
  };
}

export function resolveGeneratedTreeItemSelectionIntent(
  runtimePlan: GeneratedTreeRuntimePlan,
  intent: TreeItemSelectionIntent,
): GeneratedTreeItemSelectionRuntime | undefined {
  if (intent.resultId !== runtimePlan.resultId) {
    return undefined;
  }

  return runtimePlan.itemById.get(intent.itemId);
}

export function resolveGeneratedTreeDisclosureIntent(
  runtimePlan: GeneratedTreeRuntimePlan,
  intent: TreeDisclosureOpenChangeIntent,
): GeneratedTreeDisclosureRuntime | undefined {
  if (intent.resultId !== runtimePlan.resultId) {
    return undefined;
  }

  const runtime = runtimePlan.disclosureByItemId.get(intent.itemId);
  return runtime?.open === intent.open ? runtime : undefined;
}

export function resolveGeneratedTreeContextActionIntent(
  runtimePlan: GeneratedTreeRuntimePlan,
  intent: TreeContextActionIntent,
): GeneratedTreeContextNavigationRuntime | undefined {
  if (intent.resultId !== runtimePlan.resultId) {
    return undefined;
  }

  const runtime = runtimePlan.contextActionById.get(intent.actionId);
  return runtime?.available === true && runtime.itemId === intent.itemId ? runtime : undefined;
}

export function resolveGeneratedTreeChildVariantSelectionIntent(
  runtimePlan: GeneratedTreeRuntimePlan,
  intent: TreeChildVariantSelectionIntent,
): GeneratedTreeChildVariantRuntime | undefined {
  if (intent.resultId !== runtimePlan.resultId) {
    return undefined;
  }

  const runtime = runtimePlan.childVariantById.get(intent.variantId);
  return runtime?.available === true && treeParentIdentityMatches(runtime.parent, intent.parent)
    ? runtime
    : undefined;
}

export function resolveGeneratedTreeCreateIntent(
  runtimePlan: GeneratedTreeRuntimePlan,
  intent: TreeCreateIntent,
): GeneratedTreeChildCreateRuntime | undefined {
  if (intent.resultId !== runtimePlan.resultId || intent.surfaceId !== intent.intent.surfaceId) {
    return undefined;
  }

  const runtime = runtimePlan.childCreateBySurfaceId.get(intent.surfaceId);
  return runtime !== undefined && treeParentIdentityMatches(runtime.parent, intent.parent)
    ? runtime
    : undefined;
}

export function resolveGeneratedTreeCreateFieldIntent(
  runtimePlan: GeneratedTreeRuntimePlan,
  intent: TreeFieldIntent,
):
  | {
      field: FieldContract;
      runtime: GeneratedTreeChildCreateRuntime;
    }
  | undefined {
  if (intent.resultId !== runtimePlan.resultId || intent.target.kind !== "create") {
    return undefined;
  }

  const runtime = runtimePlan.childCreateBySurfaceId.get(intent.target.surfaceId);
  if (runtime === undefined || !treeParentIdentityMatches(runtime.parent, intent.target.parent)) {
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

export function resolveGeneratedTreeFieldIntent(
  runtimePlan: GeneratedTreeRuntimePlan,
  intent: TreeFieldIntent,
): GeneratedTreeFieldIntentRuntime | undefined {
  if (intent.resultId !== runtimePlan.resultId || intent.target.kind === "create") {
    return undefined;
  }

  const target = runtimePlan.fieldTargetByFieldSetId.get(intent.target.fieldSetId);
  if (
    target === undefined ||
    target.itemId !== intent.target.itemId ||
    target.kind !== intent.target.kind
  ) {
    return undefined;
  }

  const field = resolveGeneratedRecordResultFieldIntent(target.foundation.runtimePlan, {
    fieldId: intent.fieldId,
    intent: intent.intent,
    recordId: target.recordId,
    resultId: target.fieldSetId,
  });
  return field === undefined ? undefined : { field: field.field, target };
}

export function resolveGeneratedTreeOperationIntent(
  runtimePlan: GeneratedTreeRuntimePlan,
  intent: TreeOperationIntent,
): GeneratedTreePlacementRemovalRuntime | undefined {
  if (intent.resultId !== runtimePlan.resultId || intent.controlId !== intent.intent.controlId) {
    return undefined;
  }

  const runtime = runtimePlan.removePlacementByControlId.get(intent.controlId);
  return runtime?.itemId === intent.itemId ? runtime : undefined;
}

export function resolveGeneratedTreeReorderIntent(
  runtimePlan: GeneratedTreeRuntimePlan,
  intent: TreeReorderIntent,
): GeneratedTreeOrderingRuntime | undefined {
  if (intent.resultId !== runtimePlan.resultId) {
    return undefined;
  }

  return (runtimePlan.orderingByItemId.get(intent.itemId) ?? []).find(
    (runtime) =>
      runtime.actionId === intent.actionId && runtime.item.direction === intent.direction,
  );
}

type GeneratedTreeOrderingPlan = {
  itemsByItemId: ReadonlyMap<string, readonly OrderingMoveMenuItem[]>;
  orderingByItemId: ReadonlyMap<string, readonly GeneratedTreeOrderingRuntime[]>;
  orderings: readonly GeneratedTreeOrderingRuntime[];
};

function selectGeneratedTreeOrderingPlan({
  items,
  recordsById,
  result,
}: {
  items: readonly TreeItemContract[];
  recordsById: Record<string, StoredRecord>;
  result: TreeResultModel;
}): GeneratedTreeOrderingPlan {
  if (result.ordering === undefined) {
    return { itemsByItemId: new Map(), orderingByItemId: new Map(), orderings: [] };
  }

  const placementRecords = items.flatMap((item) => {
    const placement = recordsById[item.placementId];
    return placement?.entity === result.placementEntityName && !placement.deletedAt
      ? [placement]
      : [];
  });
  const itemsByItemId = new Map<string, readonly OrderingMoveMenuItem[]>();
  const orderingByItemId = new Map<string, readonly GeneratedTreeOrderingRuntime[]>();
  const orderings: GeneratedTreeOrderingRuntime[] = [];

  for (const item of items) {
    const placement = recordsById[item.placementId];
    if (placement === undefined) {
      continue;
    }
    const parentValue = placement.values[result.relationship.to.field];
    const slotValue = placement.values.slot;
    const exactScopeRecordIds = placementRecords
      .filter(
        (candidate) =>
          candidate.values[result.relationship.to.field] === parentValue &&
          candidate.values.slot === slotValue,
      )
      .map((candidate) => candidate.id);
    const orderingContext = selectResultOrderingContext({
      entityName: result.placementEntityName,
      ordering: result.ordering,
      recordIds: exactScopeRecordIds,
      recordsById,
      updateOperation: result.placementUpdateOperation,
    });
    const orderingItems = selectOrderingMoveMenuItems({
      includeOrdering: orderingContext !== undefined,
      orderingContext,
      sourceRecordId: item.placementId,
    });

    if (orderingContext === undefined || orderingItems.length === 0) {
      continue;
    }

    itemsByItemId.set(item.id, orderingItems);
    const itemOrderings = orderingItems.flatMap((orderingItem) => {
      const actionId = `${item.id}:order:${orderingItem.direction}`;
      const binding = projectOrderingMoveOperationControlBinding(
        {
          direction: orderingItem.direction,
          disabledReason: orderingItem.disabledReason,
          label: orderingItem.label,
          ordering: orderingContext.ordering,
          updateOperation: orderingContext.updateOperation,
        },
        {
          executionTargetKey: item.placementId,
          id: actionId,
        },
      );

      return binding === undefined
        ? []
        : [
            {
              actionId,
              binding,
              item: orderingItem,
              itemId: item.id,
              orderingContext,
              placementId: item.placementId,
            } satisfies GeneratedTreeOrderingRuntime,
          ];
    });
    orderingByItemId.set(item.id, itemOrderings);
    orderings.push(...itemOrderings);
  }

  return { itemsByItemId, orderingByItemId, orderings };
}

function projectGeneratedTreeOrderings(
  items: readonly TreeItemContract[],
  plan: GeneratedTreeOrderingPlan,
  options: GeneratedTreeOrderingProjectionOptions | undefined,
): TreeItemContract[] {
  return items.map((item) => {
    const orderingItems = plan.itemsByItemId.get(item.id);
    const orderingRuntimes = plan.orderingByItemId.get(item.id) ?? [];
    const pending = orderingRuntimes.some(
      (runtime) =>
        options?.operationStateByExecutionKey?.[runtime.binding.executionKey]?.status === "pending",
    );

    return {
      ...item,
      children: projectGeneratedTreeOrderings(item.children, plan, options),
      ...(orderingItems === undefined
        ? {}
        : {
            ordering: projectGeneratedTreeOrdering({
              item,
              orderingItems,
              pending,
            }),
          }),
    };
  });
}

function projectGeneratedTreeOrdering({
  item,
  orderingItems,
  pending,
}: {
  item: TreeItemContract;
  orderingItems: readonly OrderingMoveMenuItem[];
  pending: boolean;
}): TreeOrderingContract {
  return {
    accessibilityLabel: `Reorder ${item.label}`,
    actions: orderingItems.map((orderingItem) => {
      const id = `${item.id}:order:${orderingItem.direction}`;
      const disabledReason = pending ? "Ordering in progress" : orderingItem.disabledReason;

      return {
        direction: orderingItem.direction,
        disabled: orderingItem.disabled || pending,
        ...(disabledReason === undefined ? {} : { disabledReason }),
        id,
        intent: {
          actionId: id,
          direction: orderingItem.direction,
          itemId: item.id,
          resultId: item.selectionIntent.resultId,
          type: "treeReorder",
        },
        label: orderingItem.label,
        ...(pending ? { pending: { isPending: true, label: "Ordering in progress" } } : {}),
        structurallyAvailable: !(
          orderingItem.plan.kind === "unavailable" &&
          orderingItem.plan.reason === "already-at-boundary"
        ),
      };
    }),
    affordance: "reorder",
    id: `${item.id}:ordering`,
    kind: "treeOrdering",
    pending,
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

function projectGeneratedTreeSelection(
  items: readonly TreeItemContract[],
  selectedPlacementId: string | undefined,
): TreeItemContract[] {
  return items.map((item) => ({
    ...item,
    children: projectGeneratedTreeSelection(item.children, selectedPlacementId),
    selected: item.placementId === selectedPlacementId,
  }));
}

function projectGeneratedTreeSelectedEditor({
  childFields,
  childCreation,
  editing,
  fieldStateByFieldSetId,
  item,
  placementFields,
  removePlacement,
  recordsById,
  result,
  schema,
}: {
  childFields: GeneratedTreeRecordProjectionOptions | undefined;
  childCreation: NonNullable<TreeResultContract["selectedEditor"]>["childCreation"];
  editing: TreeEditingAvailability;
  fieldStateByFieldSetId: Readonly<Record<string, GeneratedRecordResultRecordState | undefined>>;
  item: TreeItemContract;
  placementFields: GeneratedTreeRecordProjectionOptions | undefined;
  removePlacement: NonNullable<TreeResultContract["selectedEditor"]>["removePlacement"];
  recordsById: Record<string, StoredRecord>;
  result: TreeResultModel;
  schema: AppSchema | null;
}): {
  editor: NonNullable<TreeResultContract["selectedEditor"]>;
  fieldTargets: GeneratedTreeRecordFieldRuntime[];
} {
  const placementRecord = recordsById[item.placementId];
  const placementTarget =
    placementRecord === undefined
      ? undefined
      : selectGeneratedTreeRecordFieldRuntime({
          fieldStateByFieldSetId,
          itemId: item.id,
          kind: "placement",
          options: placementFields,
          record: placementRecord,
          recordsById,
          result,
          schema,
        });
  const childRecord = selectChildRecord(item.childRecordId, recordsById, result);
  const childContextLink = selectRecordContextLinkForActiveUnion(
    result.childRecordUnion,
    childRecord,
  );
  const childTarget =
    childRecord === undefined || childContextLink !== undefined
      ? undefined
      : selectGeneratedTreeRecordFieldRuntime({
          fieldStateByFieldSetId,
          itemId: item.id,
          kind: "child",
          options: childFields,
          record: childRecord,
          recordsById,
          result,
          schema,
        });
  const fieldTargets = [placementTarget, childTarget].filter(
    (target): target is GeneratedTreeRecordFieldRuntime => target !== undefined,
  );

  return {
    editor: {
      accessibilityLabel: `Edit ${item.label}`,
      availability: item.availability,
      ...(childCreation === undefined ? {} : { childCreation }),
      ...(childTarget === undefined
        ? {}
        : { childFields: treeFieldSet(childTarget, editing, "Child fields") }),
      ...(item.childRecordId === undefined ? {} : { childRecordId: item.childRecordId }),
      editing,
      id: `${item.id}:editor`,
      itemId: item.id,
      kind: "treeSelectedEditor",
      placementFields:
        placementTarget === undefined
          ? emptyTreeFieldSet(`${item.id}:placement:fields`, editing, "Placement fields")
          : treeFieldSet(placementTarget, editing, "Placement fields"),
      placementId: item.placementId,
      ...(removePlacement === undefined ? {} : { removePlacement }),
      warnings: item.warnings,
    },
    fieldTargets,
  };
}

function projectGeneratedTreePlacementRemoval({
  fallbackPlacementId,
  item,
  options,
  result,
}: {
  fallbackPlacementId: string | null;
  item: TreeItemContract;
  options: GeneratedTreePlacementRemovalProjectionOptions | undefined;
  result: TreeResultModel;
}):
  | {
      control: NonNullable<NonNullable<TreeResultContract["selectedEditor"]>["removePlacement"]>;
      runtime: GeneratedTreePlacementRemovalRuntime;
    }
  | undefined {
  const binding = projectTreeCompositionOperationControlBindings(result.composition, {
    executionTargetKey: item.placementId,
    id: `${item.id}:remove-placement`,
  }).find(
    (candidate) =>
      candidate.input.kind === "treeComposition" && candidate.input.action === "remove",
  );

  if (binding === undefined) {
    return undefined;
  }

  const state =
    options?.operationStateByExecutionKey?.[binding.executionKey] ??
    createIdleGeneratedOperationExecutionState(binding.executionKey);
  const projectedState =
    state.result?.type === "failed"
      ? {
          ...state,
          result: { type: "failed" as const, displayError: "Remove failed. Try again." },
        }
      : state;

  return {
    control: projectGeneratedOperationControl({
      binding,
      confirmationOpen: options?.confirmationOpenByControlId?.[binding.id] ?? false,
      feedbackCopy: {
        committed: { title: "Placement removed and synced." },
        failed: { detail: "Remove failed. Try again.", title: "Remove failed." },
        replayed: { title: "Placement removed and synced." },
      },
      presentation: {
        accessibilityLabel: `Remove ${item.label} placement`,
        content: { icon: "remove", kind: "iconAndLabel", label: binding.label },
        density: "compact",
        pendingLabel: "Removing placement...",
        prominence: "destructive",
      },
      state: projectedState,
    }),
    runtime: {
      binding,
      fallbackPlacementId,
      itemId: item.id,
      placementId: item.placementId,
    },
  };
}

function selectGeneratedTreeRecordFieldRuntime({
  fieldStateByFieldSetId,
  itemId,
  kind,
  options,
  record,
  recordsById,
  result,
  schema,
}: {
  fieldStateByFieldSetId: Readonly<Record<string, GeneratedRecordResultRecordState | undefined>>;
  itemId: string;
  kind: GeneratedTreeRecordFieldRuntime["kind"];
  options: GeneratedTreeRecordProjectionOptions | undefined;
  record: StoredRecord;
  recordsById: Record<string, StoredRecord>;
  result: TreeResultModel;
  schema: AppSchema | null;
}): GeneratedTreeRecordFieldRuntime {
  const fieldSetId = `${itemId}:${kind}:fields`;
  const recordResult = generatedTreeRecordResult(result, kind);
  const recordState = rebaseGeneratedRecordResultRecordState({
    current: fieldStateByFieldSetId[fieldSetId],
    record,
    result: recordResult,
  });

  if (recordState === undefined) {
    throw new Error(`Missing selected tree ${kind} record "${record.id}".`);
  }

  const entity = kind === "child" ? result.childEntity : result.placementEntity;
  const entityName = kind === "child" ? result.childEntityName : result.placementEntityName;
  const foundation = selectGeneratedRecordResultFoundation({
    density: "compact",
    entity,
    entityName,
    fieldPresentation: kind === "child" ? "treeChild" : "treePlacement",
    fieldState: recordState,
    id: fieldSetId,
    recordIds: [record.id],
    recordsById,
    result: recordResult,
    schema,
    selectedRecordId: record.id,
    ...options,
  });

  return {
    fieldSetId,
    foundation,
    itemId,
    kind,
    recordId: record.id,
    recordState,
    result: recordResult,
  };
}

function generatedTreeRecordResult(
  result: TreeResultModel,
  kind: GeneratedTreeRecordFieldRuntime["kind"],
): RecordResultModel {
  return kind === "child"
    ? {
        ...(result.childUpdateOperation === undefined
          ? {}
          : { updateOperation: result.childUpdateOperation }),
        itemViewName: result.childItemViewName,
        recordFields: result.childRecordFields,
        ...(result.childRecordUnion === undefined ? {} : { recordUnion: result.childRecordUnion }),
        transitionOperations: [],
        type: "record",
      }
    : {
        ...(result.placementUpdateOperation === undefined
          ? {}
          : { updateOperation: result.placementUpdateOperation }),
        itemViewName: result.placementItemViewName ?? `${result.childItemViewName}:placement`,
        recordFields: result.placementRecordFields ?? [],
        ...(result.placementRecordUnion === undefined
          ? {}
          : { recordUnion: result.placementRecordUnion }),
        transitionOperations: [],
        type: "record",
      };
}

function treeFieldSet(
  target: GeneratedTreeRecordFieldRuntime,
  editing: TreeEditingAvailability,
  label: string,
) {
  return {
    disabled: !editing.enabled,
    ...(editing.enabled ? {} : { disabledReason: editing.disabledReason }),
    fields: target.foundation.recordResult.fields,
    id: target.fieldSetId,
    kind: "fieldSet" as const,
    label,
  };
}

function emptyTreeFieldSet(id: string, editing: TreeEditingAvailability, label: string) {
  return {
    disabled: !editing.enabled,
    ...(editing.enabled ? {} : { disabledReason: editing.disabledReason }),
    fields: [],
    id,
    kind: "fieldSet" as const,
    label,
  };
}

function flattenTreeItems(items: readonly TreeItemContract[]): TreeItemContract[] {
  return items.flatMap((item) => [item, ...flattenTreeItems(item.children)]);
}

function selectGeneratedTreeItems({
  ancestors,
  context,
  depth,
  disclosureOpenByItemId,
  id,
  parentRecordId,
  recordsById,
  result,
  selectableContextRecordIds,
}: {
  ancestors: ReadonlySet<string>;
  context: HomeContextConfig | undefined;
  depth: number;
  disclosureOpenByItemId: Readonly<Record<string, boolean | undefined>>;
  id: string;
  parentRecordId: string;
  recordsById: Record<string, StoredRecord>;
  result: TreeResultModel;
  selectableContextRecordIds: ReadonlySet<string> | undefined;
}): TreeItemContract[] {
  return selectChildPlacements(parentRecordId, recordsById, result).map((placement) =>
    projectGeneratedTreeItem({
      ancestors,
      context,
      depth,
      disclosureOpenByItemId,
      id,
      placement,
      recordsById,
      result,
      selectableContextRecordIds,
    }),
  );
}

function projectGeneratedTreeItem({
  ancestors,
  context,
  depth,
  disclosureOpenByItemId,
  id,
  placement,
  recordsById,
  result,
  selectableContextRecordIds,
}: {
  ancestors: ReadonlySet<string>;
  context: HomeContextConfig | undefined;
  depth: number;
  disclosureOpenByItemId: Readonly<Record<string, boolean | undefined>>;
  id: string;
  placement: StoredRecord;
  recordsById: Record<string, StoredRecord>;
  result: TreeResultModel;
  selectableContextRecordIds: ReadonlySet<string> | undefined;
}): TreeItemContract {
  const itemId = `${id}:item:${placement.id}`;
  const childRecordId = stringValue(placement.values[result.childFieldName]);
  const childRecord = selectChildRecord(childRecordId, recordsById, result);
  const missingChildMessage = "Child record is unavailable.";
  const isLeaf = childRecord ? isTreeBranchLeaf(result, childRecord) : false;
  const isCycle = childRecord && !isLeaf ? ancestors.has(childRecord.id) : false;
  const descendants =
    childRecord && !isLeaf && !isCycle
      ? selectChildPlacements(childRecord.id, recordsById, result)
      : [];
  const isDepthStopped =
    childRecord !== undefined &&
    !isLeaf &&
    !isCycle &&
    depth >= result.maxDepth &&
    descendants.length > 0;
  const children =
    childRecord && !isLeaf && !isCycle && !isDepthStopped
      ? selectGeneratedTreeItems({
          ancestors: new Set([...ancestors, childRecord.id]),
          context,
          depth: depth + 1,
          disclosureOpenByItemId,
          id,
          parentRecordId: childRecord.id,
          recordsById,
          result,
          selectableContextRecordIds,
        })
      : [];
  const label = childRecord
    ? selectRecordLabel(
        childRecord,
        result.childRecordFields,
        result.childEntity.label,
        childRecord.id,
      )
    : "Missing child";
  const slotValue = stringValue(placement.values.slot);
  const variant = childRecord ? selectTreeItemVariant(result, childRecord) : undefined;
  const contextActions = projectGeneratedTreeContextActions({
    childRecord,
    context,
    itemId,
    result,
    resultId: id,
    selectableContextRecordIds,
  });
  const warnings = projectGeneratedTreeReadinessWarnings({
    childRecord,
    itemId,
    placement,
    recordsById,
  });
  const disclosureOpen = disclosureOpenByItemId[itemId] ?? true;

  return {
    accessibilityLabel: label,
    availability: { available: true },
    ...(childRecordId === undefined ? {} : { childRecordId }),
    children,
    contextActions,
    ...(children.length === 0
      ? {}
      : {
          disclosure: {
            accessibilityLabel: `${disclosureOpen ? "Collapse" : "Expand"} ${label}`,
            id: `${itemId}:disclosure`,
            intent: {
              itemId,
              open: !disclosureOpen,
              resultId: id,
              type: "treeDisclosureOpenChange" as const,
            },
            kind: "treeItemDisclosure" as const,
            open: disclosureOpen,
          },
        }),
    id: itemId,
    kind: "treeItem",
    label,
    placementId: placement.id,
    selected: false,
    selectionIntent: { itemId, resultId: id, type: "treeItemSelection" },
    ...(slotValue === undefined
      ? {}
      : {
          slot: {
            id: `${itemId}:slot:${slotValue}`,
            kind: "treeItemSlot" as const,
            label: humanizeFieldName(slotValue),
          },
        }),
    structure:
      childRecord === undefined
        ? { message: missingChildMessage, state: "missingChild" }
        : isLeaf
          ? { state: "leaf" }
          : isCycle
            ? { message: "Cycle stopped at this item.", state: "cycleStopped" }
            : isDepthStopped
              ? { message: "Maximum tree depth reached.", state: "depthStopped" }
              : { state: "branch" },
    ...(variant === undefined
      ? {}
      : { variant: { ...variant, id: `${itemId}:variant:${variant.id}` } }),
    warnings,
  };
}

function projectGeneratedTreeReadinessWarnings({
  childRecord,
  itemId,
  placement,
  recordsById,
}: {
  childRecord: StoredRecord | undefined;
  itemId: string;
  placement: StoredRecord;
  recordsById: Readonly<Record<string, StoredRecord>>;
}): TreeWarningContract[] {
  return [
    projectGeneratedTreeRecordReadinessWarning({
      itemId,
      record: placement,
      recordsById,
      source: "placement",
      title: "Placement readiness warnings",
    }),
    childRecord === undefined
      ? undefined
      : projectGeneratedTreeRecordReadinessWarning({
          itemId,
          record: childRecord,
          recordsById,
          source: "child",
          title: "Child readiness warnings",
        }),
  ].filter((warning): warning is TreeWarningContract => warning !== undefined);
}

function projectGeneratedTreeRecordReadinessWarning({
  itemId,
  record,
  recordsById,
  source,
  title,
}: {
  itemId: string;
  record: StoredRecord;
  recordsById: Readonly<Record<string, StoredRecord>>;
  source: "child" | "placement";
  title: string;
}): TreeWarningContract | undefined {
  const items = getRecordReadinessWarnings(record, recordsById);

  return items.length === 0
    ? undefined
    : {
        id: `${itemId}:warning:${source}-readiness`,
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
  const placementIds = placements.map((placement) => placement.id);
  const orderedRecordIds = result.ordering
    ? sortRecordIdsByOrdering(
        placementIds,
        recordsById,
        result.ordering.fieldName,
        result.ordering.scope.map((field) => field.fieldName),
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

function selectTreeItemVariant(result: TreeResultModel, childRecord: StoredRecord) {
  const union = result.childRecordUnion;
  const variantValue = union
    ? stringValue(childRecord.values[union.discriminatorFieldName])
    : undefined;
  const variant = union?.variants.find((candidate) => candidate.variantValue === variantValue);
  const unionVariant =
    variantValue === undefined
      ? undefined
      : union?.union.variants.find((definition) => definition.key === variantValue);
  return variantValue === undefined || unionVariant === undefined
    ? undefined
    : {
        id: variantValue,
        kind: "treeItemVariant" as const,
        label: variant?.label ?? unionVariant.label,
      };
}

function projectGeneratedTreeContextActions({
  childRecord,
  context,
  itemId,
  result,
  resultId,
  selectableContextRecordIds,
}: {
  childRecord: StoredRecord | undefined;
  context: HomeContextConfig | undefined;
  itemId: string;
  result: TreeResultModel;
  resultId: string;
  selectableContextRecordIds: ReadonlySet<string> | undefined;
}) {
  const contextLink = selectRecordContextLinkForActiveUnion(result.childRecordUnion, childRecord);
  if (contextLink === undefined || childRecord === undefined) {
    return [];
  }

  const label = stringValue(childRecord.values[contextLink.labelFieldName]) ?? childRecord.id;
  const available =
    context !== undefined &&
    context.name === contextLink.target.contextName &&
    context.entityName === result.childEntityName &&
    selectableContextRecordIds?.has(childRecord.id) === true;
  const unavailableMessage = "This item is unavailable as a workspace context target.";
  const actionId = `${itemId}:context:${contextLink.target.contextName}`;
  const intent: TreeContextActionIntent = {
    actionId,
    itemId,
    resultId,
    type: "treeContextAction",
  };

  return [
    {
      availability: available
        ? ({ available: true } as const)
        : ({ available: false, message: unavailableMessage } as const),
      control: {
        accessibilityLabel: `Open ${label}`,
        content: { kind: "label" as const, label: "Open" },
        density: "compact" as const,
        ...(available ? {} : { disabled: true, disabledReason: unavailableMessage }),
        id: `${actionId}:control`,
        kind: "button" as const,
        prominence: "secondary" as const,
        type: "button" as const,
      },
      id: actionId,
      intent,
      kind: "treeContextAction" as const,
    },
  ];
}

function isTreeBranchLeaf(result: TreeResultModel, childRecord: StoredRecord): boolean {
  const variantPolicy = result.branches?.variants;
  const variantValue = variantPolicy
    ? stringValue(childRecord.values[variantPolicy.discriminatorFieldName])
    : undefined;

  return (
    variantValue !== undefined && (variantPolicy?.leafVariantValues.includes(variantValue) ?? false)
  );
}

function generatedTreeSupportsEditing(result: TreeResultModel): boolean {
  return (
    result.childUpdateOperation !== undefined ||
    result.placementUpdateOperation !== undefined ||
    result.composition?.create !== undefined ||
    result.composition?.remove !== undefined
  );
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

function treeParentIdentityMatches(
  left: GeneratedTreeChildVariantRuntime["parent"],
  right: GeneratedTreeChildVariantRuntime["parent"],
): boolean {
  return (
    left.kind === right.kind &&
    (left.kind === "root" || (right.kind === "item" && left.itemId === right.itemId))
  );
}
