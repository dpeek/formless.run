import type {
  CreateSurfaceContract,
  TreeChildCreationContract,
  TreeEditingAvailability,
  TreeParentIdentity,
} from "@dpeek/formless-presentation/contract";
import type { MediaAssetOption } from "@dpeek/formless-media/client";
import type { AppSchema, QueryEvaluationContext } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import type {
  CreateDefaultConfig,
  CreateFieldConfig,
  GeneratedOperationControlBinding,
  GeneratedOperationExecutionState,
  RecordFieldConfig,
} from "../../client/views.ts";
import { projectTreeCompositionOperationControlBindings } from "../../client/views.ts";
import type {
  TreeAllowedChildVariantConfig,
  TreeResultModel,
} from "../../client/tree-result-model.ts";
import {
  initialGeneratedCreateDraftSessionState,
  selectGeneratedCreateDraftSession,
  type GeneratedCreateDraftSessionState,
} from "./create-field-authoring.ts";
import { indexGeneratedCreateSurfaceFields } from "./generated-create-field-index.ts";
import {
  projectGeneratedCreateSurface,
  type GeneratedReferenceOption,
} from "./field-projection.ts";
import type { CreateHomeOperationConfig } from "./generated-create-runtime.ts";
import { humanizeFieldName } from "../../client/view-labels.ts";

export type GeneratedTreeChildCreationProjectionOptions = {
  activeVariantIdByCreationId?: Readonly<Record<string, string | null | undefined>>;
  createErrorBySurfaceId?: Readonly<Record<string, string | undefined>>;
  createOpenBySurfaceId?: Readonly<Record<string, boolean | undefined>>;
  createStateBySurfaceId?: Readonly<Record<string, GeneratedCreateDraftSessionState | undefined>>;
  fieldStateBySurfaceId?: Readonly<
    Record<string, GeneratedTreeCreateFieldProjectionState | undefined>
  >;
  mediaAssetOptionsByFieldName?: Readonly<Record<string, readonly MediaAssetOption[]>>;
  operationStateByExecutionKey?: Readonly<
    Record<string, GeneratedOperationExecutionState | undefined>
  >;
  queryContext?: QueryEvaluationContext;
  referenceOptionsByFieldName?: Readonly<Record<string, readonly GeneratedReferenceOption[]>>;
  schema?: AppSchema | null;
};

export type GeneratedTreeCreateFieldProjectionState = {
  errorsByFieldName: Readonly<Record<string, string | undefined>>;
  pendingByFieldName: Readonly<Record<string, boolean | undefined>>;
};

export type GeneratedTreeChildVariantRuntime = {
  available: boolean;
  creationId: string;
  operation?: CreateHomeOperationConfig;
  parent: TreeParentIdentity;
  parentRecordId: string;
  placementEntityName: string;
  placementValues?: TreeAllowedChildVariantConfig["placementValues"];
  queryContext?: QueryEvaluationContext;
  surfaceId: string;
  variantId: string;
};

export type GeneratedTreeChildCreateRuntime = GeneratedTreeChildVariantRuntime & {
  binding: GeneratedOperationControlBinding;
  fieldsById: ReturnType<typeof indexGeneratedCreateSurfaceFields>;
  operation: CreateHomeOperationConfig;
  surface: CreateSurfaceContract;
};

export type GeneratedTreeChildCreationProjection = {
  contract: TreeChildCreationContract;
  createRuntime?: GeneratedTreeChildCreateRuntime;
  variantRuntimes: readonly GeneratedTreeChildVariantRuntime[];
};

export function projectGeneratedTreeChildCreation({
  creationId,
  editing,
  options = {},
  parent,
  parentLabel,
  parentRecord,
  result,
  resultId,
}: {
  creationId: string;
  editing: TreeEditingAvailability;
  options?: GeneratedTreeChildCreationProjectionOptions;
  parent: TreeParentIdentity;
  parentLabel: string;
  parentRecord: StoredRecord;
  result: TreeResultModel;
  resultId: string;
}): GeneratedTreeChildCreationProjection | undefined {
  const allowedVariants = selectAllowedTreeChildVariants(result, parentRecord);

  if (allowedVariants.length === 0) {
    return undefined;
  }

  const disabledReason = !editing.enabled
    ? editing.disabledReason
    : result.composition?.create === undefined
      ? "Child creation is unavailable."
      : undefined;
  const activeVariantId = options.activeVariantIdByCreationId?.[creationId] ?? undefined;
  const variantRuntimes: GeneratedTreeChildVariantRuntime[] = [];
  const variants = allowedVariants.map((variant, index) => {
    const variantId = `${creationId}:variant:${variant.variantValue}:${index}`;
    const surfaceId = `${variantId}:create`;
    const operation = createTreeChildCreateOperation(result, variant);
    const available = disabledReason === undefined && operation !== undefined;
    const slotValue = stringValue(variant.placementValues?.slot);
    const runtime: GeneratedTreeChildVariantRuntime = {
      available,
      creationId,
      ...(operation === undefined ? {} : { operation }),
      parent,
      parentRecordId: parentRecord.id,
      placementEntityName: result.placementEntityName,
      ...(variant.placementValues === undefined
        ? {}
        : { placementValues: variant.placementValues }),
      ...(options.queryContext === undefined ? {} : { queryContext: options.queryContext }),
      surfaceId,
      variantId,
    };
    variantRuntimes.push(runtime);

    return {
      availability: available
        ? ({ available: true } as const)
        : {
            available: false as const,
            message: disabledReason ?? "Child creation is unavailable.",
          },
      id: variantId,
      kind: "treeChildVariant" as const,
      label: variant.label,
      selected: activeVariantId === variantId,
      selectionIntent: {
        parent,
        resultId,
        type: "treeChildVariantSelection" as const,
        variantId,
      },
      ...(slotValue === undefined
        ? {}
        : {
            slot: {
              id: `${variantId}:slot:${slotValue}`,
              kind: "treeItemSlot" as const,
              label: humanizeFieldName(slotValue),
            },
          }),
    };
  });
  const activeRuntime = variantRuntimes.find(
    (runtime) => runtime.variantId === activeVariantId && runtime.available && runtime.operation,
  );
  const activeOperation = activeRuntime?.operation;
  const createRuntime =
    activeRuntime === undefined || activeOperation === undefined
      ? undefined
      : projectGeneratedTreeChildCreateRuntime(
          { ...activeRuntime, operation: activeOperation },
          options,
          result,
        );

  return {
    contract: {
      accessibilityLabel: `Add child to ${parentLabel}`,
      ...(createRuntime === undefined ? {} : { activeCreateSurface: createRuntime.surface }),
      ...(variants.some((variant) => variant.selected) && activeVariantId !== undefined
        ? { activeVariantId }
        : {}),
      id: creationId,
      kind: "treeChildCreation",
      variants,
    },
    ...(createRuntime === undefined ? {} : { createRuntime }),
    variantRuntimes,
  };
}

function projectGeneratedTreeChildCreateRuntime(
  runtime: GeneratedTreeChildVariantRuntime & { operation: CreateHomeOperationConfig },
  options: GeneratedTreeChildCreationProjectionOptions,
  result: TreeResultModel,
): GeneratedTreeChildCreateRuntime {
  const binding = requiredTreeCreateBinding(runtime, result);
  const state =
    options.createStateBySurfaceId?.[runtime.surfaceId] ??
    initialGeneratedCreateDraftSessionState({
      defaults: runtime.operation.defaults,
      fields: runtime.operation.fields,
      union: runtime.operation.union,
    });
  const session = selectGeneratedCreateDraftSession({
    defaults: runtime.operation.defaults,
    enabled: runtime.operation.enabled,
    fields: runtime.operation.fields,
    queryContext: runtime.queryContext,
    state,
    union: runtime.operation.union,
  });
  const operationState = options.operationStateByExecutionKey?.[binding.executionKey];
  const fieldState = options.fieldStateBySurfaceId?.[runtime.surfaceId];
  const surface = projectGeneratedCreateSurface({
    enabled: runtime.operation.enabled,
    entityLabel: runtime.operation.entity.label,
    errorsByFieldName: fieldState?.errorsByFieldName,
    ...(options.createErrorBySurfaceId?.[runtime.surfaceId] === undefined
      ? {}
      : { formErrors: [options.createErrorBySurfaceId[runtime.surfaceId]!] }),
    id: runtime.surfaceId,
    isSubmitting: operationState?.status === "pending",
    mediaAssetOptionsByFieldName: options.mediaAssetOptionsByFieldName,
    open: options.createOpenBySurfaceId?.[runtime.surfaceId] ?? false,
    pendingByFieldName: fieldState?.pendingByFieldName as
      | Readonly<Record<string, boolean>>
      | undefined,
    referenceOptionsByFieldName: options.referenceOptionsByFieldName,
    schema: options.schema,
    session,
    state,
    submitLabel: runtime.operation.label,
    trigger: {
      content: { kind: "label", label: runtime.operation.label },
      density: "compact",
      prominence: "secondary",
    },
    triggerLabel: `${runtime.operation.label} child`,
  });

  return {
    ...runtime,
    binding,
    fieldsById: indexGeneratedCreateSurfaceFields(surface),
    surface,
  };
}

function requiredTreeCreateBinding(
  runtime: GeneratedTreeChildVariantRuntime,
  result: TreeResultModel,
): GeneratedOperationControlBinding {
  const binding = projectTreeCompositionOperationControlBindings(result.composition, {
    executionTargetKey: `${runtime.parentRecordId}:${runtime.variantId}`,
    id: `${runtime.surfaceId}:operation`,
  }).find(
    (candidate) =>
      candidate.input.kind === "treeComposition" && candidate.input.action === "create",
  );

  if (binding === undefined) {
    throw new Error("Missing tree child create operation binding.");
  }

  return binding;
}

function selectAllowedTreeChildVariants(
  result: TreeResultModel,
  parentRecord: StoredRecord,
): TreeAllowedChildVariantConfig[] {
  const variantPolicy = result.branches?.variants;

  if (!variantPolicy) {
    return [];
  }

  const variantValue = stringValue(parentRecord.values[variantPolicy.discriminatorFieldName]);

  return variantValue === undefined
    ? []
    : (variantPolicy.allowedChildVariantsByParentVariant[variantValue] ?? []);
}

function createTreeChildCreateOperation(
  result: TreeResultModel,
  variant: TreeAllowedChildVariantConfig,
): CreateHomeOperationConfig | undefined {
  const createOperation = result.composition?.create;
  const discriminatorFieldName = result.branches?.variants.discriminatorFieldName;
  const discriminatorField = result.branches?.variants.discriminatorField;

  if (!createOperation || !discriminatorFieldName || !discriminatorField) {
    return undefined;
  }

  const fields = uniqueCreateFields([
    ...recordFieldsToCreateFields(result.childRecordFields),
    ...recordFieldsToCreateFields(selectTreeChildVariantFields(result, variant.variantValue)),
  ]).filter((field) => field.fieldName !== discriminatorFieldName);
  const defaults: CreateDefaultConfig[] = [
    {
      field: discriminatorField,
      fieldName: discriminatorFieldName,
      value: { kind: "literal", value: variant.variantValue },
    },
  ];

  return {
    defaults,
    enabled: true,
    entity: result.childEntity,
    entityName: result.childEntityName,
    fields,
    label: `Add ${variant.label}`,
    operation: createOperation.operation,
    operationName: createOperation.operationName,
    placement: "toolbar",
    type: "create",
  };
}

function selectTreeChildVariantFields(
  result: TreeResultModel,
  variantValue: string,
): RecordFieldConfig[] {
  const variant = result.childRecordUnion?.variants.find(
    (candidate) => candidate.variantValue === variantValue,
  );

  return variant?.presentation.type === "fields" ? variant.presentation.fields : [];
}

function recordFieldsToCreateFields(fields: RecordFieldConfig[]): CreateFieldConfig[] {
  return fields.map((field) => ({
    editor: field.editor,
    field: field.field,
    fieldName: field.fieldName,
    ...(field.visibleWhen === undefined ? {} : { visibleWhen: field.visibleWhen }),
  }));
}

function uniqueCreateFields(fields: CreateFieldConfig[]): CreateFieldConfig[] {
  const seen = new Set<string>();
  return fields.filter((field) => {
    if (seen.has(field.fieldName)) {
      return false;
    }
    seen.add(field.fieldName);
    return true;
  });
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}
