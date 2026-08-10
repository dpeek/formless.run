import type { MediaAssetOption } from "@dpeek/formless-media/client";
import type {
  FieldContract,
  FieldIntent,
  CollectionEmptyStatePrimaryActionContract,
  RecordResultContract,
  RecordResultIntent,
} from "@dpeek/formless-presentation/contract";
import {
  resolveRecordFieldValue,
  type AppSchema,
  type EntitySchema,
  type GeneratedFieldDraftInput,
} from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import { getRecordReadinessWarnings } from "../../client/readiness.ts";
import { selectTransitionStateOperationAvailability } from "../../client/state-machine-model.ts";
import type { RecordResultModel } from "../../client/list-result-model.ts";
import {
  createIdleGeneratedOperationExecutionState,
  projectStateTransitionOperationControlBinding,
  type GeneratedOperationControlBinding,
  type GeneratedOperationExecutionState,
  type RecordFieldConfig,
  type TransitionStateOperationConfig,
  recordFieldRef,
} from "../../client/views.ts";
import {
  projectGeneratedRecordResultContract,
  projectGeneratedRecordResultOperationAction,
  type GeneratedRecordResultPlacedAction,
} from "./record-result-projection.ts";
import { projectGeneratedOperationControl } from "./operation-projection.ts";
import { projectGeneratedRecordFields, type GeneratedReferenceOption } from "./field-projection.ts";
import { projectDeleteRecordButtonBinding, selectRecordLabel } from "./record-delete-runtime.ts";
import {
  initialGeneratedUpdateDraftSessionState,
  selectGeneratedUpdateDraftSession,
  type GeneratedUpdateDraftSessionState,
} from "./record-field-authoring.ts";

export type GeneratedRecordResultFieldAuthoringState = {
  editorDraftByFieldName: Readonly<Record<string, string | undefined>>;
  errorsByFieldName: Readonly<Record<string, string | undefined>>;
  iconDialogDraftByFieldName: Readonly<Record<string, string | undefined>>;
  iconDialogOpenByFieldName: Readonly<Record<string, boolean | undefined>>;
  iconParseErrorByFieldName: Readonly<Record<string, string | undefined>>;
  pendingByFieldName: Readonly<Record<string, boolean | undefined>>;
  pendingLabelByFieldName: Readonly<Record<string, string | undefined>>;
  session: GeneratedUpdateDraftSessionState;
  unitDraftByFieldName: Readonly<Record<string, string | undefined>>;
  unitDraftInputByFieldName: Readonly<Record<string, GeneratedFieldDraftInput | undefined>>;
};

export type GeneratedRecordResultFieldRuntime = {
  field: FieldContract;
  fieldConfig: RecordFieldConfig;
  fieldId: string;
  kind: "field";
  recordId: string;
  resultId: string;
};

export type GeneratedRecordResultOperationRuntime =
  | {
      binding: GeneratedOperationControlBinding;
      kind: "delete";
      recordId: string;
      recordLabel: string;
    }
  | {
      binding: GeneratedOperationControlBinding;
      kind: "transition";
      operation: TransitionStateOperationConfig;
      recordId: string;
    };

export type GeneratedRecordResultRuntime =
  | GeneratedRecordResultFieldRuntime
  | GeneratedRecordResultOperationRuntime;

export type GeneratedRecordResultRuntimePlan = {
  fieldById: ReadonlyMap<string, GeneratedRecordResultFieldRuntime>;
  fields: readonly GeneratedRecordResultFieldRuntime[];
  operationByControlId: ReadonlyMap<string, GeneratedRecordResultOperationRuntime>;
  operations: readonly GeneratedRecordResultOperationRuntime[];
  recordId?: string;
  resultId: string;
};

export type GeneratedRecordResultFoundation = {
  fieldState?: GeneratedRecordResultFieldAuthoringState;
  recordResult: RecordResultContract;
  runtimePlan: GeneratedRecordResultRuntimePlan;
};

export type SelectGeneratedRecordResultFoundationOptions = {
  accessibilityLabel?: string;
  confirmationOpenByControlId?: Readonly<Record<string, boolean | undefined>>;
  density?: RecordResultContract["density"];
  editingDisabledReason?: string;
  emptyStateAction?: CollectionEmptyStatePrimaryActionContract;
  emptyStateDescription?: string;
  emptyStateTitle?: string;
  entity: EntitySchema;
  entityName: string;
  fieldState?: GeneratedRecordResultFieldAuthoringState;
  fieldPresentation?: "contextDetail" | "recordResult" | "treeChild" | "treePlacement";
  id: string;
  mediaAssetOptionsByFieldName?: Readonly<Record<string, readonly MediaAssetOption[]>>;
  operationStateByExecutionKey?: Readonly<
    Record<string, GeneratedOperationExecutionState | undefined>
  >;
  recordIds: readonly string[];
  recordsById: Readonly<Record<string, StoredRecord>>;
  referenceOptionsByFieldName?: Readonly<Record<string, readonly GeneratedReferenceOption[]>>;
  result: RecordResultModel;
  schema?: AppSchema | null;
  selectedRecordId?: string | null;
};

export function selectGeneratedRecordResultFoundation({
  accessibilityLabel,
  confirmationOpenByControlId = {},
  density = "default",
  editingDisabledReason,
  emptyStateAction,
  emptyStateDescription,
  emptyStateTitle,
  entity,
  entityName,
  fieldState,
  fieldPresentation = "recordResult",
  id,
  mediaAssetOptionsByFieldName,
  operationStateByExecutionKey = {},
  recordIds,
  recordsById,
  referenceOptionsByFieldName,
  result,
  schema = null,
  selectedRecordId,
}: SelectGeneratedRecordResultFoundationOptions): GeneratedRecordResultFoundation {
  const recordId = selectedRecordId === undefined ? recordIds[0] : (selectedRecordId ?? undefined);
  const record = recordId === undefined ? undefined : recordsById[recordId];
  const resolvedAccessibilityLabel = accessibilityLabel ?? `${entity.label} record`;
  const resolvedEditingDisabledReason =
    editingDisabledReason ?? `Editing is disabled for ${entity.label}.`;

  if (recordId === undefined) {
    return {
      recordResult: projectGeneratedRecordResultContract({
        accessibilityLabel: resolvedAccessibilityLabel,
        density,
        editingDisabledReason: resolvedEditingDisabledReason,
        editingEnabled: result.updateOperation !== undefined,
        id,
        result: {
          ...(emptyStateAction === undefined ? {} : { action: emptyStateAction }),
          ...(emptyStateDescription === undefined ? {} : { description: emptyStateDescription }),
          state: "empty",
          title: emptyStateTitle ?? `No ${entity.label.toLowerCase()} record found.`,
        },
      }),
      runtimePlan: emptyRuntimePlan(id),
    };
  }

  if (record === undefined) {
    return {
      recordResult: projectGeneratedRecordResultContract({
        accessibilityLabel: resolvedAccessibilityLabel,
        density,
        editingDisabledReason: resolvedEditingDisabledReason,
        editingEnabled: result.updateOperation !== undefined,
        id,
        result: {
          message: "Record unavailable.",
          recordId,
          recordLabel: `${entity.label} ${recordId}`,
          state: "unavailable",
        },
      }),
      runtimePlan: { ...emptyRuntimePlan(id), recordId },
    };
  }

  const initialFieldState =
    fieldState ?? createGeneratedRecordResultFieldAuthoringState(record, result);
  const nextFieldState = resolveGeneratedRecordResultSystemFieldValues(
    record,
    initialFieldState,
    result,
  );
  const session = selectGeneratedUpdateDraftSession({
    fields: result.recordFields,
    state: nextFieldState.session,
    union: result.recordUnion,
  });
  const fieldDisabledReasons = Object.fromEntries(
    session.visibleFields.map((field) => [field.fieldName, resolvedEditingDisabledReason]),
  );
  const transitionRuntimes = selectGeneratedRecordResultTransitionRuntimes({
    id,
    record,
    result,
  });
  const transitionOperationsByFieldName = groupGeneratedRecordResultTransitionOperations(
    session.visibleFields,
    transitionRuntimes,
  );
  const fields = projectGeneratedRecordFields({
    canPatch: result.updateOperation !== undefined,
    density: fieldPresentation === "treePlacement" ? "compact" : density,
    densityByFieldName:
      fieldPresentation === "contextDetail" || fieldPresentation === "treeChild"
        ? Object.fromEntries(
            session.visibleFields.map((field) => [
              field.fieldName,
              isGeneratedRecordResultHeadingField(field) ||
              (fieldPresentation === "treeChild" && isGeneratedRecordResultRichField(field))
                ? "default"
                : density,
            ]),
          )
        : undefined,
    disabledReasonByFieldName: fieldDisabledReasons,
    editorDraftByFieldName: nextFieldState.editorDraftByFieldName,
    entityName,
    errorsByFieldName: nextFieldState.errorsByFieldName,
    iconDialogDraftByFieldName: nextFieldState.iconDialogDraftByFieldName,
    iconDialogOpenByFieldName: nextFieldState.iconDialogOpenByFieldName,
    iconParseErrorByFieldName: nextFieldState.iconParseErrorByFieldName,
    mediaAssetOptionsByFieldName,
    owner: { kind: "recordResult", recordId, resultId: id },
    pendingByFieldName: nextFieldState.pendingByFieldName as Readonly<Record<string, boolean>>,
    pendingLabelByFieldName: nextFieldState.pendingLabelByFieldName,
    presentationByFieldName:
      fieldPresentation === "contextDetail"
        ? Object.fromEntries(
            session.visibleFields.map((field) => [
              field.fieldName,
              isGeneratedRecordResultHeadingField(field) ? "heading" : "default",
            ]),
          )
        : undefined,
    recordId,
    referenceOptionsByFieldName,
    schema,
    session,
    showLabel: true,
    showLabelByFieldName:
      fieldPresentation === "contextDetail"
        ? Object.fromEntries(
            session.visibleFields.map((field) => [
              field.fieldName,
              !isGeneratedRecordResultHeadingField(field),
            ]),
          )
        : undefined,
    state: nextFieldState.session,
    surface: "record",
    transitionOperationsByFieldName,
    unitDraftByFieldName: nextFieldState.unitDraftByFieldName,
    unitDraftInputByFieldName: nextFieldState.unitDraftInputByFieldName,
  }).map((field) =>
    withGeneratedRecordResultTransitionControls({
      confirmationOpenByControlId,
      density,
      field,
      operationStateByExecutionKey,
      transitionRuntimes,
    }),
  );
  const recordLabel = selectRecordLabel(record, session.visibleFields, entity.label, recordId);
  const runtimePlan = selectGeneratedRecordResultRuntimePlan({
    entity,
    id,
    projectedFields: fields,
    record,
    recordLabel,
    result,
    transitionRuntimes,
    visibleFields: session.visibleFields,
  });
  const pairedTransitionOperationNames = new Set(
    transitionRuntimes.flatMap((runtime) =>
      recordResultFieldOwnsTransition(session.visibleFields, runtime.operation)
        ? [runtime.operation.operationName]
        : [],
    ),
  );
  const actions = projectGeneratedRecordResultActions({
    confirmationOpenByControlId,
    density,
    operationStateByExecutionKey,
    pairedTransitionOperationNames,
    runtimePlan,
  });

  return {
    fieldState: nextFieldState,
    recordResult: projectGeneratedRecordResultContract({
      accessibilityLabel: resolvedAccessibilityLabel,
      density,
      editingDisabledReason: resolvedEditingDisabledReason,
      editingEnabled: result.updateOperation !== undefined,
      id,
      result: {
        actions,
        fields,
        readinessWarnings: getRecordReadinessWarnings(record, recordsById),
        recordId,
        recordLabel,
        state: "ready",
      },
    }),
    runtimePlan,
  };
}

export type GeneratedRecordResultRecordState = GeneratedRecordResultFieldAuthoringState & {
  baselineRecordId: string;
  baselineUpdatedAt: string;
  confirmationOpenByControlId: Readonly<Record<string, boolean | undefined>>;
};

export function rebaseGeneratedRecordResultRecordState({
  current,
  record,
  result,
}: {
  current?: GeneratedRecordResultRecordState;
  record: StoredRecord | undefined;
  result: Pick<RecordResultModel, "recordFields" | "recordUnion">;
}): GeneratedRecordResultRecordState | undefined {
  if (record === undefined) {
    return undefined;
  }

  if (current?.baselineRecordId === record.id && current.baselineUpdatedAt === record.updatedAt) {
    return current;
  }

  return {
    ...createGeneratedRecordResultFieldAuthoringState(record, result),
    baselineRecordId: record.id,
    baselineUpdatedAt: record.updatedAt,
    confirmationOpenByControlId: {},
  };
}

export function createGeneratedRecordResultFieldAuthoringState(
  record: StoredRecord,
  result: Pick<RecordResultModel, "recordFields" | "recordUnion">,
): GeneratedRecordResultFieldAuthoringState {
  return {
    editorDraftByFieldName: {},
    errorsByFieldName: {},
    iconDialogDraftByFieldName: {},
    iconDialogOpenByFieldName: {},
    iconParseErrorByFieldName: {},
    pendingByFieldName: {},
    pendingLabelByFieldName: {},
    session: initialGeneratedUpdateDraftSessionState({
      baselineValues: record.values,
      fields: result.recordFields,
      union: result.recordUnion,
    }),
    unitDraftByFieldName: {},
    unitDraftInputByFieldName: {},
  };
}

export function selectGeneratedRecordResultRuntimeForIntent(
  runtimePlan: GeneratedRecordResultRuntimePlan,
  intent: RecordResultIntent,
): GeneratedRecordResultRuntime | undefined {
  if (intent.resultId !== runtimePlan.resultId || intent.recordId !== runtimePlan.recordId) {
    return undefined;
  }

  if (intent.type === "recordResultOperationIntent") {
    if (intent.controlId !== intent.intent.controlId) {
      return undefined;
    }

    return runtimePlan.operationByControlId.get(intent.controlId);
  }

  return resolveGeneratedRecordResultFieldIntent(runtimePlan, intent);
}

export function resolveGeneratedRecordResultFieldIntent(
  runtimePlan: GeneratedRecordResultRuntimePlan,
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
): GeneratedRecordResultFieldRuntime | undefined {
  if (resultId !== runtimePlan.resultId || recordId !== runtimePlan.recordId) {
    return undefined;
  }

  const runtime = runtimePlan.fieldById.get(fieldId);
  const fieldName = recordResultFieldIntentFieldName(intent);
  const intentRecordId = intent.type === "stateTransitionInvoke" ? intent.recordId : recordId;
  const transitionRuntime =
    intent.type === "stateTransitionInvoke"
      ? selectGeneratedRecordResultTransitionRuntimeForFieldIntent(runtimePlan, intent)
      : undefined;

  return runtime !== undefined &&
    runtime.recordId === recordId &&
    runtime.resultId === resultId &&
    runtime.field.recordId === recordId &&
    intentRecordId === recordId &&
    runtime.fieldConfig.fieldName === fieldName &&
    (intent.type !== "stateTransitionInvoke" || transitionRuntime !== undefined)
    ? runtime
    : undefined;
}

export function selectGeneratedRecordResultTransitionRuntimeForFieldIntent(
  runtimePlan: GeneratedRecordResultRuntimePlan,
  intent: Extract<FieldIntent, { type: "stateTransitionInvoke" }>,
): Extract<GeneratedRecordResultOperationRuntime, { kind: "transition" }> | undefined {
  return runtimePlan.operations.find(
    (runtime): runtime is Extract<GeneratedRecordResultOperationRuntime, { kind: "transition" }> =>
      runtime.kind === "transition" &&
      runtime.recordId === intent.recordId &&
      runtime.operation.fieldName === intent.fieldName &&
      runtime.operation.operationName === intent.operationName &&
      runtime.operation.transitionName === intent.transitionName &&
      runtime.binding.availability.state === "enabled",
  );
}

function selectGeneratedRecordResultRuntimePlan({
  entity,
  id,
  projectedFields,
  record,
  recordLabel,
  result,
  transitionRuntimes,
  visibleFields,
}: {
  entity: EntitySchema;
  id: string;
  projectedFields: RecordResultContract["fields"];
  record: StoredRecord;
  recordLabel: string;
  result: RecordResultModel;
  transitionRuntimes: readonly Extract<
    GeneratedRecordResultOperationRuntime,
    { kind: "transition" }
  >[];
  visibleFields: readonly RecordFieldConfig[];
}): GeneratedRecordResultRuntimePlan {
  const fields: GeneratedRecordResultFieldRuntime[] = [];
  const fieldById = new Map<string, GeneratedRecordResultFieldRuntime>();

  for (const field of projectedFields) {
    const fieldConfig = visibleFields.find((candidate) => candidate.fieldName === field.fieldName);

    if (fieldConfig === undefined) {
      throw new Error(`Missing record-result runtime field config for ${field.fieldId}.`);
    }

    if (fieldById.has(field.fieldId)) {
      throw new Error(
        `Generated record result "${id}" contains duplicate field occurrence "${field.fieldId}".`,
      );
    }

    const runtime: GeneratedRecordResultFieldRuntime = {
      field,
      fieldConfig,
      fieldId: field.fieldId,
      kind: "field",
      recordId: record.id,
      resultId: id,
    };
    fieldById.set(field.fieldId, runtime);
    fields.push(runtime);
  }
  const operations: GeneratedRecordResultOperationRuntime[] = [...transitionRuntimes];

  if (result.deleteOperation) {
    const binding = projectDeleteRecordButtonBinding({
      deleteOperation: result.deleteOperation,
      entityLabel: entity.label,
      idPrefix: `${id}:${record.id}`,
      recordId: record.id,
      recordLabel,
    });

    if (binding) {
      operations.push({ binding, kind: "delete", recordId: record.id, recordLabel });
    }
  }

  return {
    fieldById,
    fields,
    operationByControlId: new Map(operations.map((operation) => [operation.binding.id, operation])),
    operations,
    recordId: record.id,
    resultId: id,
  };
}

function projectGeneratedRecordResultActions({
  confirmationOpenByControlId,
  density,
  operationStateByExecutionKey,
  pairedTransitionOperationNames,
  runtimePlan,
}: {
  confirmationOpenByControlId: Readonly<Record<string, boolean | undefined>>;
  density: RecordResultContract["density"];
  operationStateByExecutionKey: Readonly<
    Record<string, GeneratedOperationExecutionState | undefined>
  >;
  pairedTransitionOperationNames: ReadonlySet<string>;
  runtimePlan: GeneratedRecordResultRuntimePlan;
}): readonly GeneratedRecordResultPlacedAction[] {
  return runtimePlan.operations.flatMap((operation): GeneratedRecordResultPlacedAction[] => {
    if (
      operation.kind === "transition" &&
      pairedTransitionOperationNames.has(operation.operation.operationName)
    ) {
      return [];
    }
    const binding = operation.binding;
    const deleting = operation.kind === "delete";
    const state =
      operationStateByExecutionKey[binding.executionKey] ??
      createIdleGeneratedOperationExecutionState(binding.executionKey);
    const control = projectGeneratedOperationControl({
      binding,
      confirmationOpen: confirmationOpenByControlId[binding.id] ?? false,
      presentation: {
        accessibilityLabel: deleting ? `Delete ${operation.recordLabel}` : binding.label,
        content: { kind: "label", label: binding.label },
        density,
        pendingLabel: `${binding.label}...`,
        prominence: deleting ? "destructive" : "primary",
      },
      state,
    });

    return [
      {
        action: projectGeneratedRecordResultOperationAction(
          control,
          deleting ? "delete" : "transition",
        ),
        placement: deleting ? "secondary" : "primary",
      },
    ];
  });
}

function selectGeneratedRecordResultTransitionRuntimes({
  id,
  record,
  result,
}: {
  id: string;
  record: StoredRecord;
  result: RecordResultModel;
}): Extract<GeneratedRecordResultOperationRuntime, { kind: "transition" }>[] {
  return result.transitionOperations.map((operation) => {
    const availability = selectTransitionStateOperationAvailability({
      currentValue: record.values[operation.fieldName],
      field: operation.field,
      operation,
    });
    const binding = projectStateTransitionOperationControlBinding({
      availability,
      operation,
      options: { executionTargetKey: record.id, idPrefix: `${id}:${record.id}` },
    });

    return { binding, kind: "transition" as const, operation, recordId: record.id };
  });
}

function groupGeneratedRecordResultTransitionOperations(
  visibleFields: readonly RecordFieldConfig[],
  runtimes: readonly Extract<GeneratedRecordResultOperationRuntime, { kind: "transition" }>[],
): Readonly<Record<string, readonly TransitionStateOperationConfig[]>> {
  const byFieldName: Record<string, TransitionStateOperationConfig[]> = {};

  for (const field of visibleFields) {
    const matching = runtimes
      .filter(
        (runtime) =>
          runtime.binding.availability.state === "enabled" &&
          recordResultFieldOwnsTransition([field], runtime.operation),
      )
      .map((runtime) => runtime.operation);
    if (matching.length > 0) {
      byFieldName[field.fieldName] = matching;
    }
  }

  return byFieldName;
}

function recordResultFieldOwnsTransition(
  visibleFields: readonly RecordFieldConfig[],
  operation: TransitionStateOperationConfig,
): boolean {
  return visibleFields.some(
    (field) =>
      field.fieldName === operation.fieldName &&
      field.stateMachine?.machineName === operation.machineName,
  );
}

function withGeneratedRecordResultTransitionControls({
  confirmationOpenByControlId,
  density,
  field,
  operationStateByExecutionKey,
  transitionRuntimes,
}: {
  confirmationOpenByControlId: Readonly<Record<string, boolean | undefined>>;
  density: RecordResultContract["density"];
  field: FieldContract;
  operationStateByExecutionKey: Readonly<
    Record<string, GeneratedOperationExecutionState | undefined>
  >;
  transitionRuntimes: readonly Extract<
    GeneratedRecordResultOperationRuntime,
    { kind: "transition" }
  >[];
}): FieldContract {
  const facts = field.stateMachineFacts;
  if (facts?.interaction.kind !== "transitions") {
    return field;
  }

  const runtimeByOperationName = new Map(
    transitionRuntimes
      .filter((runtime) => runtime.operation.fieldName === field.fieldName)
      .map((runtime) => [runtime.operation.operationName, runtime]),
  );
  const transitions = facts.interaction.transitions.flatMap((transition) => {
    const runtime = runtimeByOperationName.get(transition.operationName);
    if (runtime === undefined || runtime.binding.availability.state !== "enabled") {
      return [];
    }
    const state =
      operationStateByExecutionKey[runtime.binding.executionKey] ??
      createIdleGeneratedOperationExecutionState(runtime.binding.executionKey);
    const control = projectGeneratedOperationControl({
      binding: runtime.binding,
      confirmationOpen: confirmationOpenByControlId[runtime.binding.id] ?? false,
      presentation: {
        accessibilityLabel: runtime.binding.label,
        content: { kind: "label", label: runtime.binding.label },
        density,
        pendingLabel: `${runtime.binding.label}...`,
        prominence: "primary",
      },
      state,
    });

    return [
      {
        ...transition,
        control,
        ...(control.trigger.pending === undefined ? {} : { pending: control.trigger.pending }),
      },
    ];
  });
  const pending = transitions.find((transition) => transition.pending?.isPending)?.pending;

  return {
    ...field,
    ...(pending === undefined ? {} : { pending }),
    stateMachineFacts: {
      ...facts,
      interaction: { ...facts.interaction, transitions },
    },
  };
}

function emptyRuntimePlan(resultId: string): GeneratedRecordResultRuntimePlan {
  return {
    fieldById: new Map(),
    fields: [],
    operationByControlId: new Map(),
    operations: [],
    resultId,
  };
}

function resolveGeneratedRecordResultSystemFieldValues(
  record: StoredRecord,
  fieldState: GeneratedRecordResultFieldAuthoringState,
  result: Pick<RecordResultModel, "recordFields" | "recordUnion">,
): GeneratedRecordResultFieldAuthoringState {
  const session = selectGeneratedUpdateDraftSession({
    fields: result.recordFields,
    state: fieldState.session,
    union: result.recordUnion,
  });
  const baselineValues = { ...fieldState.session.baselineValues };

  for (const fieldConfig of session.visibleFields) {
    const fieldRef = recordFieldRef(fieldConfig);

    if (fieldRef.kind !== "system") {
      continue;
    }

    const value = resolveRecordFieldValue(record, fieldRef);

    if (value === undefined) {
      delete baselineValues[fieldConfig.fieldName];
    } else {
      baselineValues[fieldConfig.fieldName] = value;
    }
  }

  return {
    ...fieldState,
    session: { ...fieldState.session, baselineValues },
  };
}

function recordResultFieldIntentFieldName(intent: FieldIntent): string | undefined {
  switch (intent.type) {
    case "fieldErrorChange":
    case "iconDialogCancel":
    case "iconDialogDraftChange":
    case "iconDialogOpenChange":
    case "iconDialogSave":
    case "mediaAssetSelect":
    case "mediaFileSelect":
    case "recordDraftChange":
    case "recordDraftCommit":
    case "recordDraftRevert":
    case "recordEditorDraftChange":
    case "recordValueCommit":
    case "recordValueUnitCommit":
    case "stateTransitionInvoke":
      return intent.fieldName;
    case "createDraftChange":
    case "operationDraftChange":
      return undefined;
  }
}

function isGeneratedRecordResultHeadingField(fieldConfig: RecordFieldConfig): boolean {
  return (
    fieldConfig.field.type === "text" &&
    fieldConfig.editor === "text" &&
    (fieldConfig.fieldName === "label" ||
      fieldConfig.fieldName === "name" ||
      fieldConfig.fieldName === "title")
  );
}

function isGeneratedRecordResultRichField(fieldConfig: RecordFieldConfig): boolean {
  return fieldConfig.field.type === "text" && fieldConfig.editor === "markdown";
}
