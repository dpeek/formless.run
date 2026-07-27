import type { MediaAssetOption } from "@dpeek/formless-media/client";
import type {
  FieldContract,
  FieldIntent,
  ListContract,
  ListIntent,
} from "@dpeek/formless-presentation/contract";
import type { AppSchema, EntitySchema } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import { getRecordReadinessWarnings } from "../../client/readiness.ts";
import { selectTransitionStateOperationAvailability } from "../../client/state-machine-model.ts";
import {
  createIdleGeneratedOperationExecutionState,
  projectOrderingMoveOperationControlBinding,
  projectStateTransitionOperationControlBinding,
  type GeneratedOperationControlBinding,
  type GeneratedOperationExecutionState,
  type RecordFieldConfig,
  type TransitionStateOperationConfig,
} from "../../client/views.ts";
import type { ListResultModel } from "../../client/list-result-model.ts";
import {
  projectGeneratedListContract,
  projectGeneratedListOperationAction,
  type GeneratedListItemProjectionFacts,
  type GeneratedListPlacedAction,
} from "./list-projection.ts";
import { projectGeneratedOperationControl } from "./operation-projection.ts";
import { projectGeneratedRecordFields, type GeneratedReferenceOption } from "./field-projection.ts";
import {
  selectOrderingMoveMenuItems,
  selectResultOrderingContext,
  type OrderingMoveMenuItem,
  type ResultOrderingContext,
} from "./ordering-ui.ts";
import { projectDeleteRecordButtonBinding, selectRecordLabel } from "./record-delete-runtime.ts";
import {
  initialGeneratedUpdateDraftSessionState,
  selectGeneratedUpdateDraftSession,
  type GeneratedUpdateDraftSessionState,
} from "./record-field-authoring.ts";

export type GeneratedListFieldAuthoringState = {
  baselineUpdatedAt: string;
  editorDraftByFieldName: Readonly<Record<string, string | undefined>>;
  errorsByFieldName: Readonly<Record<string, string | undefined>>;
  iconDialogDraftByFieldName: Readonly<Record<string, string | undefined>>;
  iconDialogOpenByFieldName: Readonly<Record<string, boolean | undefined>>;
  pendingByFieldName: Readonly<Record<string, boolean | undefined>>;
  session: GeneratedUpdateDraftSessionState;
};

export type GeneratedListOperationRuntime =
  | {
      binding: GeneratedOperationControlBinding;
      kind: "delete";
      recordId: string;
      recordLabel: string;
    }
  | {
      binding: GeneratedOperationControlBinding;
      kind: "ordering";
      item: OrderingMoveMenuItem;
      orderingContext: ResultOrderingContext;
      recordId: string;
    }
  | {
      binding: GeneratedOperationControlBinding;
      kind: "transition";
      operation: TransitionStateOperationConfig;
      recordId: string;
    };

export type GeneratedListFieldRuntime = {
  field: FieldContract;
  fieldConfig: RecordFieldConfig;
  fieldId: string;
  kind: "field";
  record: StoredRecord;
  recordId: string;
  result: ListResultModel;
  resultId: string;
};

export type GeneratedListRuntimePlan = {
  fieldById: ReadonlyMap<string, GeneratedListFieldRuntime>;
  fields: readonly GeneratedListFieldRuntime[];
  operationByControlId: ReadonlyMap<string, GeneratedListOperationRuntime>;
  operations: readonly GeneratedListOperationRuntime[];
  orderingByRecordId: ReadonlyMap<
    string,
    readonly Extract<GeneratedListOperationRuntime, { kind: "ordering" }>[]
  >;
  orderingContext?: ResultOrderingContext;
  resultId: string;
};

type GeneratedListOperationRuntimePlan = Omit<
  GeneratedListRuntimePlan,
  "fieldById" | "fields" | "resultId"
>;

export type GeneratedListFoundation = {
  fieldStateByRecordId: Readonly<Record<string, GeneratedListFieldAuthoringState | undefined>>;
  list: ListContract;
  runtimePlan: GeneratedListRuntimePlan;
};

export type SelectGeneratedListFoundationOptions = {
  confirmationOpenByControlId?: Readonly<Record<string, boolean | undefined>>;
  density?: ListContract["density"];
  entity: EntitySchema;
  entityName: string;
  fieldStateByRecordId?: Readonly<Record<string, GeneratedListFieldAuthoringState | undefined>>;
  id: string;
  mediaAssetOptionsByRecordId?: GeneratedListMediaAssetOptionsByRecordId;
  operationStateByExecutionKey?: Readonly<
    Record<string, GeneratedOperationExecutionState | undefined>
  >;
  recordIds: readonly string[];
  recordsById: Readonly<Record<string, StoredRecord>>;
  referenceOptionsByRecordId?: GeneratedListReferenceOptionsByRecordId;
  result: ListResultModel;
  schema?: AppSchema | null;
};

export type GeneratedListReferenceOptionsByRecordId = Readonly<
  Record<string, Readonly<Record<string, readonly GeneratedReferenceOption[]>> | undefined>
>;

export type GeneratedListMediaAssetOptionsByRecordId = Readonly<
  Record<string, Readonly<Record<string, readonly MediaAssetOption[]>> | undefined>
>;

export function selectGeneratedListFoundation({
  confirmationOpenByControlId = {},
  density = "compact",
  entity,
  entityName,
  fieldStateByRecordId = {},
  id,
  mediaAssetOptionsByRecordId = {},
  operationStateByExecutionKey = {},
  recordIds,
  recordsById,
  referenceOptionsByRecordId = {},
  result,
  schema = null,
}: SelectGeneratedListFoundationOptions): GeneratedListFoundation {
  const orderingContext = selectResultOrderingContext({
    entityName,
    ordering: result.ordering,
    recordIds: [...recordIds],
    recordsById,
    updateOperation: result.updateOperation,
  });
  const orderedRecordIds = orderingContext?.orderedRecordIds ?? [...recordIds];
  const nextFieldStateByRecordId: Record<string, GeneratedListFieldAuthoringState | undefined> = {
    ...fieldStateByRecordId,
  };
  const operationRuntimePlan = selectGeneratedListRuntimePlan({
    entity,
    id,
    orderedRecordIds,
    orderingContext,
    recordsById,
    result,
  });
  const fieldById = new Map<string, GeneratedListFieldRuntime>();
  const fields: GeneratedListFieldRuntime[] = [];
  const itemsByRecordId: Record<string, GeneratedListItemProjectionFacts> = {};

  for (const recordId of orderedRecordIds) {
    const record = recordsById[recordId];

    if (!record) {
      itemsByRecordId[recordId] = {
        accessibilityLabel: `${entity.label} ${recordId}`,
        readinessWarnings: [{ code: "record-unavailable", message: "Record unavailable." }],
        unavailableMessage: "Record unavailable.",
      };
      continue;
    }

    const fieldState = rebaseGeneratedListFieldAuthoringState(
      record,
      result,
      fieldStateByRecordId[recordId],
    );
    const projected = projectGeneratedListFields({
      entityName,
      fieldState,
      listId: id,
      mediaAssetOptionsByFieldName: mediaAssetOptionsByRecordId[recordId],
      record,
      referenceOptionsByFieldName: referenceOptionsByRecordId[recordId],
      result,
      schema,
    });
    indexGeneratedListFields({
      fieldById,
      fields,
      fieldConfigs: projected.fieldConfigs,
      listId: id,
      projectedFields: projected.fields,
      record,
      recordId,
      result,
    });
    const accessibilityLabel = selectGeneratedListRecordLabel(
      record,
      projected.fieldConfigs,
      entity.label,
      recordId,
    );
    const itemOperations = operationRuntimePlan.operations.filter(
      (operation): operation is Exclude<GeneratedListOperationRuntime, { kind: "ordering" }> =>
        operation.recordId === recordId && operation.kind !== "ordering",
    );
    const actions = itemOperations.map((operation): GeneratedListPlacedAction => {
      const state =
        operationStateByExecutionKey[operation.binding.executionKey] ??
        createIdleGeneratedOperationExecutionState(operation.binding.executionKey);
      const control = projectGeneratedOperationControl({
        binding: operation.binding,
        confirmationOpen: confirmationOpenByControlId[operation.binding.id] ?? false,
        presentation: generatedListOperationPresentation(operation),
        state,
      });

      return {
        action: projectGeneratedListOperationAction(
          control,
          operation.kind === "delete" ? "delete" : "transition",
        ),
        placement: operation.kind === "delete" ? "secondary" : "primary",
      };
    });
    const orderingOperations = operationRuntimePlan.orderingByRecordId.get(recordId) ?? [];
    const orderingItems = selectOrderingMoveMenuItems({
      includeOrdering: orderingContext !== undefined,
      orderingContext,
      sourceRecordId: recordId,
    });

    nextFieldStateByRecordId[recordId] = fieldState;
    itemsByRecordId[recordId] = {
      accessibilityLabel,
      actions,
      fields: projected.fields,
      ...(orderingContext === undefined
        ? {}
        : {
            ordering: {
              accessibilityLabel: `Reorder ${accessibilityLabel}`,
              items: orderingItems,
              pending: orderingOperations.some(
                (operation) =>
                  operationStateByExecutionKey[operation.binding.executionKey]?.status ===
                  "pending",
              ),
            },
          }),
      readinessWarnings: getRecordReadinessWarnings(record, recordsById),
    };
  }

  const runtimePlan: GeneratedListRuntimePlan = {
    ...operationRuntimePlan,
    fieldById,
    fields,
    resultId: id,
  };

  return {
    fieldStateByRecordId: nextFieldStateByRecordId,
    list: projectGeneratedListContract({
      accessibilityLabel: `${entity.label} records`,
      density,
      editingDisabledReason: `Editing is disabled for ${entity.label}.`,
      editingEnabled: result.updateOperation !== undefined || orderedRecordIds.length === 0,
      id,
      itemsByRecordId,
      orderedRecordIds,
    }),
    runtimePlan,
  };
}

export function createGeneratedListFieldAuthoringState(
  record: StoredRecord,
  result: Pick<ListResultModel, "recordFields" | "recordUnion">,
): GeneratedListFieldAuthoringState {
  return {
    baselineUpdatedAt: record.updatedAt,
    editorDraftByFieldName: {},
    errorsByFieldName: {},
    iconDialogDraftByFieldName: {},
    iconDialogOpenByFieldName: {},
    pendingByFieldName: {},
    session: initialGeneratedUpdateDraftSessionState({
      baselineValues: record.values,
      fields: result.recordFields,
      union: result.recordUnion,
    }),
  };
}

export function rebaseGeneratedListFieldAuthoringState(
  record: StoredRecord,
  result: Pick<ListResultModel, "recordFields" | "recordUnion">,
  current?: GeneratedListFieldAuthoringState,
): GeneratedListFieldAuthoringState {
  return current?.baselineUpdatedAt === record.updatedAt
    ? current
    : createGeneratedListFieldAuthoringState(record, result);
}

export function selectGeneratedListRuntimeForIntent(
  runtimePlan: GeneratedListRuntimePlan,
  intent: ListIntent,
): Extract<GeneratedListOperationRuntime, { kind: "ordering" }> | undefined {
  return (runtimePlan.orderingByRecordId.get(intent.itemId) ?? []).find(
    (operation) => operation.item.direction === intent.direction,
  );
}

export function resolveGeneratedListFieldIntent(
  runtimePlan: GeneratedListRuntimePlan,
  {
    fieldId,
    intent,
    recordId,
    resultId,
  }: {
    fieldId: string;
    intent: FieldIntent;
    recordId?: string;
    resultId?: string;
  },
): GeneratedListFieldRuntime | undefined {
  if (resultId !== runtimePlan.resultId || recordId === undefined) {
    return undefined;
  }

  const runtime = runtimePlan.fieldById.get(fieldId);
  const fieldName = listFieldIntentFieldName(intent);
  const intentRecordId = intent.type === "stateTransitionInvoke" ? intent.recordId : recordId;

  return runtime !== undefined &&
    runtime.recordId === recordId &&
    runtime.field.recordId === recordId &&
    intentRecordId === recordId &&
    runtime.fieldConfig.fieldName === fieldName
    ? runtime
    : undefined;
}

function projectGeneratedListFields({
  entityName,
  fieldState,
  listId,
  mediaAssetOptionsByFieldName,
  record,
  referenceOptionsByFieldName,
  result,
  schema,
}: {
  entityName: string;
  fieldState: GeneratedListFieldAuthoringState;
  listId: string;
  mediaAssetOptionsByFieldName?: Readonly<Record<string, readonly MediaAssetOption[]>>;
  record: StoredRecord;
  referenceOptionsByFieldName?: Readonly<Record<string, readonly GeneratedReferenceOption[]>>;
  result: ListResultModel;
  schema: AppSchema | null;
}): {
  fieldConfigs: readonly RecordFieldConfig[];
  fields: readonly FieldContract[];
} {
  const session = selectGeneratedUpdateDraftSession({
    fields: result.recordFields,
    state: fieldState.session,
    union: result.recordUnion,
  });

  return {
    fieldConfigs: session.visibleFields,
    fields: projectGeneratedRecordFields({
      canPatch: result.updateOperation !== undefined,
      density: "default",
      editorDraftByFieldName: fieldState.editorDraftByFieldName,
      entityName,
      errorsByFieldName: fieldState.errorsByFieldName,
      iconDialogDraftByFieldName: fieldState.iconDialogDraftByFieldName,
      iconDialogOpenByFieldName: fieldState.iconDialogOpenByFieldName,
      mediaAssetOptionsByFieldName,
      owner: { kind: "listItem", listId, recordId: record.id },
      pendingByFieldName: fieldState.pendingByFieldName as Record<string, boolean>,
      recordId: record.id,
      referenceOptionsByFieldName,
      schema,
      session,
      showLabel: false,
      state: fieldState.session,
      surface: "record",
    }),
  };
}

function indexGeneratedListFields({
  fieldById,
  fields,
  fieldConfigs,
  listId,
  projectedFields,
  record,
  recordId,
  result,
}: {
  fieldById: Map<string, GeneratedListFieldRuntime>;
  fields: GeneratedListFieldRuntime[];
  fieldConfigs: readonly RecordFieldConfig[];
  listId: string;
  projectedFields: readonly FieldContract[];
  record: StoredRecord;
  recordId: string;
  result: ListResultModel;
}) {
  if (projectedFields.length !== fieldConfigs.length) {
    throw new Error(`Generated list "${listId}" projected incomplete field runtime facts.`);
  }

  for (const [index, field] of projectedFields.entries()) {
    const fieldConfig = fieldConfigs[index];
    if (
      fieldConfig === undefined ||
      field.fieldName !== fieldConfig.fieldName ||
      field.recordId !== recordId
    ) {
      throw new Error(`Generated list "${listId}" projected mismatched field runtime facts.`);
    }
    if (fieldById.has(field.fieldId)) {
      throw new Error(
        `Generated list "${listId}" contains duplicate field occurrence "${field.fieldId}".`,
      );
    }

    const runtime: GeneratedListFieldRuntime = {
      field,
      fieldConfig,
      fieldId: field.fieldId,
      kind: "field",
      record,
      recordId,
      result,
      resultId: listId,
    };
    fieldById.set(field.fieldId, runtime);
    fields.push(runtime);
  }
}

function listFieldIntentFieldName(intent: FieldIntent): string | undefined {
  return "fieldName" in intent ? intent.fieldName : undefined;
}

function selectGeneratedListRecordLabel(
  record: StoredRecord,
  visibleFields: readonly RecordFieldConfig[],
  entityLabel: string,
  recordId: string,
) {
  const visibleFieldNames = new Set(visibleFields.map((field) => field.fieldName));

  for (const fieldName of ["label", "title", "name", "slug"]) {
    if (!visibleFieldNames.has(fieldName)) {
      continue;
    }

    const value = record.values[fieldName];

    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }

  for (const field of visibleFields) {
    const value = record.values[field.fieldName];

    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }

  return `${entityLabel} ${recordId}`;
}

function selectGeneratedListRuntimePlan({
  entity,
  id,
  orderedRecordIds,
  orderingContext,
  recordsById,
  result,
}: {
  entity: EntitySchema;
  id: string;
  orderedRecordIds: readonly string[];
  orderingContext?: ResultOrderingContext;
  recordsById: Readonly<Record<string, StoredRecord>>;
  result: ListResultModel;
}): GeneratedListOperationRuntimePlan {
  const operations: GeneratedListOperationRuntime[] = [];
  const orderingByRecordId = new Map<
    string,
    readonly Extract<GeneratedListOperationRuntime, { kind: "ordering" }>[]
  >();

  for (const recordId of orderedRecordIds) {
    const record = recordsById[recordId];

    if (!record) {
      continue;
    }

    for (const operation of result.transitionOperations) {
      const availability = selectTransitionStateOperationAvailability({
        currentValue: record.values[operation.fieldName],
        field: operation.field,
        operation,
      });
      const binding = projectStateTransitionOperationControlBinding({
        availability,
        operation,
        options: { executionTargetKey: recordId, idPrefix: `${id}:${recordId}` },
      });

      operations.push({ binding, kind: "transition", operation, recordId });
    }

    if (result.deleteOperation) {
      const recordLabel = selectRecordLabel(record, result.recordFields, entity.label, recordId);
      const binding = projectDeleteRecordButtonBinding({
        deleteOperation: result.deleteOperation,
        entityLabel: entity.label,
        idPrefix: `${id}:${recordId}`,
        recordId,
        recordLabel,
      });

      if (binding) {
        operations.push({ binding, kind: "delete", recordId, recordLabel });
      }
    }

    const orderingItems = selectOrderingMoveMenuItems({
      includeOrdering: orderingContext !== undefined,
      orderingContext,
      sourceRecordId: recordId,
    });
    const orderingOperations = orderingItems.flatMap(
      (item): Extract<GeneratedListOperationRuntime, { kind: "ordering" }>[] => {
        if (!orderingContext) {
          return [];
        }

        const binding = projectOrderingMoveOperationControlBinding(
          {
            direction: item.direction,
            disabledReason: item.disabledReason,
            label: item.label,
            ordering: orderingContext.ordering,
            updateOperation: orderingContext.updateOperation,
          },
          { executionTargetKey: recordId, idPrefix: `${id}:${recordId}` },
        );

        return binding ? [{ binding, item, kind: "ordering", orderingContext, recordId }] : [];
      },
    );

    operations.push(...orderingOperations);
    orderingByRecordId.set(recordId, orderingOperations);
  }

  return {
    operationByControlId: new Map(operations.map((operation) => [operation.binding.id, operation])),
    operations,
    orderingByRecordId,
    ...(orderingContext === undefined ? {} : { orderingContext }),
  };
}

function generatedListOperationPresentation(
  operation: Exclude<GeneratedListOperationRuntime, { kind: "ordering" }>,
) {
  const deleting = operation.kind === "delete";

  return {
    accessibilityLabel: deleting ? `Delete ${operation.recordLabel}` : operation.binding.label,
    content: deleting
      ? ({ icon: "delete", kind: "iconOnly" } as const)
      : ({ kind: "label", label: operation.binding.label } as const),
    density: "compact" as const,
    pendingLabel: `${operation.binding.label}...`,
    prominence: deleting ? ("destructive" as const) : ("primary" as const),
  };
}
