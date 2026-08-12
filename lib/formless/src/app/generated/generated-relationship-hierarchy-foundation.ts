import type {
  CreateSurfaceContract,
  FieldContract,
  OperationControlContract,
  RelationshipHierarchyContract,
  RelationshipHierarchyCreateFieldIntent,
  RelationshipHierarchyCreateIntent,
  RelationshipHierarchyNodeContract,
  RelationshipHierarchyOperationIntent,
  RelationshipHierarchyRecordResultIntent,
  RelationshipHierarchyRelationshipGroupActionContract,
} from "@dpeek/formless-presentation/contract";
import type { MediaAssetOption } from "@dpeek/formless-media/client";
import {
  resolveRecordLink,
  type AppSchema,
  type QueryEvaluationContext,
} from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { BrowserReplicaProjectionSnapshot } from "../../client/projections.ts";
import type {
  HomeSelectedRecordDetailRelationshipHierarchySectionConfig,
  HomeSelectedRecordRelationshipHierarchyCreateActionConfig,
  HomeSelectedRecordRelationshipHierarchyNodeConfig,
  HomeSelectedRecordRelationshipHierarchyOperationConfig,
  HomeSelectedRecordRelationshipHierarchyRecordOperationActionConfig,
  HomeSelectedRecordRelationshipHierarchyRelationshipConfig,
} from "../../client/views.ts";
import {
  createIdleGeneratedOperationExecutionState,
  projectCollectionOperationControlBinding,
  projectRecordOperationControlBinding,
  projectStateTransitionOperationControlBinding,
  type GeneratedOperationControlBinding,
  type TransitionStateOperationConfig,
} from "../../client/views.ts";
import {
  selectTransitionStateOperationAvailability,
  selectTransitionStateOperations,
} from "../../client/state-machine-model.ts";
import {
  initialGeneratedCreateDraftSessionState,
  selectGeneratedCreateDraftSession,
  type GeneratedCreateDraftSessionState,
} from "./create-field-authoring.ts";
import {
  indexGeneratedCreateSurfaceFields,
  resolveGeneratedCreateFieldIntent,
} from "./generated-create-field-index.ts";
import {
  rebaseGeneratedRecordResultRecordState,
  resolveGeneratedRecordResultFieldIntent,
  selectGeneratedRecordResultFoundation,
  type GeneratedRecordResultFieldRuntime,
  type GeneratedRecordResultFoundation,
  type GeneratedRecordResultRecordState,
  type SelectGeneratedRecordResultFoundationOptions,
} from "./generated-record-result-foundation.ts";
import { projectGeneratedOperationControl } from "./operation-projection.ts";
import {
  projectGeneratedCreateSurface,
  type GeneratedReferenceOption,
} from "./field-projection.ts";
import { projectGeneratedNativeLinkAction } from "./native-link-projection.ts";

type GeneratedRelationshipHierarchyRecordResultOptions = Partial<
  Pick<
    SelectGeneratedRecordResultFoundationOptions,
    | "confirmationOpenByControlId"
    | "editingDisabledReason"
    | "mediaAssetOptionsByFieldName"
    | "operationStateByExecutionKey"
    | "referenceOptionsByFieldName"
    | "schema"
  >
>;

export type GeneratedRelationshipHierarchyFoundationInput = {
  createActionOptions?: (
    relationship: HomeSelectedRecordRelationshipHierarchyRelationshipConfig,
    operation: HomeSelectedRecordRelationshipHierarchyCreateActionConfig,
  ) => GeneratedRelationshipHierarchyCreateActionOptions;
  recordResultOptions?: (
    node: HomeSelectedRecordRelationshipHierarchyNodeConfig,
  ) => GeneratedRelationshipHierarchyRecordResultOptions;
  recordStateByResultId?: Readonly<Record<string, GeneratedRecordResultRecordState | undefined>>;
};

export type GeneratedRelationshipHierarchyCreateFieldProjectionState = {
  errorsByFieldName: Readonly<Record<string, string | undefined>>;
  pendingByFieldName: Readonly<Record<string, boolean | undefined>>;
};

export type GeneratedRelationshipHierarchyCreateActionOptions = {
  createErrorBySurfaceId?: Readonly<Record<string, string | undefined>>;
  createOpenBySurfaceId?: Readonly<Record<string, boolean | undefined>>;
  createStateBySurfaceId?: Readonly<Record<string, GeneratedCreateDraftSessionState | undefined>>;
  fieldStateBySurfaceId?: Readonly<
    Record<string, GeneratedRelationshipHierarchyCreateFieldProjectionState | undefined>
  >;
  mediaAssetOptionsByFieldName?: Readonly<Record<string, readonly MediaAssetOption[]>>;
  operationStateByExecutionKey?: Readonly<
    Record<string, ReturnType<typeof createIdleGeneratedOperationExecutionState> | undefined>
  >;
  referenceOptionsByFieldName?: Readonly<Record<string, readonly GeneratedReferenceOption[]>>;
  schema?: AppSchema | null;
};

export type GeneratedRelationshipHierarchyRecordResultRuntime = {
  contract: GeneratedRecordResultFoundation["recordResult"];
  foundation: GeneratedRecordResultFoundation;
  model: HomeSelectedRecordRelationshipHierarchyNodeConfig["result"];
  recordState?: GeneratedRecordResultRecordState;
};

export type GeneratedRelationshipHierarchyOperationRuntime = {
  binding: GeneratedOperationControlBinding;
  control: OperationControlContract;
  operation: HomeSelectedRecordRelationshipHierarchyOperationConfig;
  occurrenceId: string;
  recordId: string;
  relationshipGroupId?: string;
  transition?: TransitionStateOperationConfig;
};

export type GeneratedRelationshipHierarchyCreateRuntime = {
  binding: GeneratedOperationControlBinding;
  fieldsById: ReturnType<typeof indexGeneratedCreateSurfaceFields>;
  occurrenceId: string;
  operation: HomeSelectedRecordRelationshipHierarchyCreateActionConfig;
  parentRecordId: string;
  queryContext: QueryEvaluationContext;
  relationshipGroupId: string;
  surface: CreateSurfaceContract;
  surfaceId: string;
};

export type GeneratedRelationshipHierarchyRelationshipGroupRuntime = {
  contract: RelationshipHierarchyNodeContract["relationshipGroups"][number];
  creates: readonly GeneratedRelationshipHierarchyCreateRuntime[];
  nodes: readonly GeneratedRelationshipHierarchyNodeRuntime[];
  operations: readonly GeneratedRelationshipHierarchyOperationRuntime[];
  relationship: HomeSelectedRecordRelationshipHierarchyRelationshipConfig;
};

export type GeneratedRelationshipHierarchyNodeRuntime = {
  contract: RelationshipHierarchyNodeContract;
  createBySurfaceId: ReadonlyMap<string, GeneratedRelationshipHierarchyCreateRuntime>;
  creates: readonly GeneratedRelationshipHierarchyCreateRuntime[];
  editor: GeneratedRelationshipHierarchyRecordResultRuntime;
  occurrenceId: string;
  operationByControlId: ReadonlyMap<string, GeneratedRelationshipHierarchyOperationRuntime>;
  operations: readonly GeneratedRelationshipHierarchyOperationRuntime[];
  recordId: string;
  relationshipGroups: readonly GeneratedRelationshipHierarchyRelationshipGroupRuntime[];
  model: HomeSelectedRecordRelationshipHierarchyNodeConfig;
};

export type GeneratedRelationshipHierarchyRuntimePlan = {
  createBySurfaceId: ReadonlyMap<string, GeneratedRelationshipHierarchyCreateRuntime>;
  hierarchyId: string;
  nodeByOccurrenceId: ReadonlyMap<string, GeneratedRelationshipHierarchyNodeRuntime>;
  nodes: readonly GeneratedRelationshipHierarchyNodeRuntime[];
  root: GeneratedRelationshipHierarchyNodeRuntime;
};

export type GeneratedRelationshipHierarchyFoundation = {
  hierarchy: RelationshipHierarchyContract;
  runtimePlan: GeneratedRelationshipHierarchyRuntimePlan;
};

export type SelectGeneratedRelationshipHierarchyFoundationOptions =
  GeneratedRelationshipHierarchyFoundationInput & {
    id: string;
    model: HomeSelectedRecordDetailRelationshipHierarchySectionConfig;
    queryContext: QueryEvaluationContext;
    selectedRecordId: string;
    snapshot: BrowserReplicaProjectionSnapshot;
  };

export function selectGeneratedRelationshipHierarchyFoundation({
  createActionOptions,
  id,
  model,
  queryContext,
  recordResultOptions,
  recordStateByResultId = {},
  selectedRecordId,
  snapshot,
}: SelectGeneratedRelationshipHierarchyFoundationOptions): GeneratedRelationshipHierarchyFoundation {
  const createBySurfaceId = new Map<string, GeneratedRelationshipHierarchyCreateRuntime>();
  const nodes: GeneratedRelationshipHierarchyNodeRuntime[] = [];
  const nodeByOccurrenceId = new Map<string, GeneratedRelationshipHierarchyNodeRuntime>();
  const root = selectGeneratedRelationshipHierarchyNode({
    id,
    createActionOptions,
    createBySurfaceId,
    model,
    nodes,
    nodeByOccurrenceId,
    occurrenceId: generatedRelationshipHierarchyRootOccurrenceId(id, selectedRecordId),
    recordId: selectedRecordId,
    recordResultOptions,
    recordStateByResultId,
    queryContext,
    snapshot,
  });

  return {
    hierarchy: {
      accessibilityLabel: model.label ?? `${model.entity.label} relationship hierarchy`,
      id,
      kind: "relationshipHierarchy",
      root: root.contract,
    },
    runtimePlan: { createBySurfaceId, hierarchyId: id, nodeByOccurrenceId, nodes, root },
  };
}

export function resolveGeneratedRelationshipHierarchyRecordFieldIntent(
  runtimePlan: GeneratedRelationshipHierarchyRuntimePlan,
  intent: RelationshipHierarchyRecordResultIntent,
):
  | {
      field: GeneratedRecordResultFieldRuntime;
      node: GeneratedRelationshipHierarchyNodeRuntime;
    }
  | undefined {
  if (intent.hierarchyId !== runtimePlan.hierarchyId) {
    return undefined;
  }

  const node = runtimePlan.nodeByOccurrenceId.get(intent.occurrenceId);
  if (
    node === undefined ||
    intent.recordId !== node.recordId ||
    intent.resultId !== node.editor.contract.id ||
    intent.intent.type !== "recordResultFieldIntent"
  ) {
    return undefined;
  }

  const field = resolveGeneratedRecordResultFieldIntent(
    node.editor.foundation.runtimePlan,
    intent.intent,
  );
  return field === undefined ? undefined : { field, node };
}

export function resolveGeneratedRelationshipHierarchyOperationIntent(
  runtimePlan: GeneratedRelationshipHierarchyRuntimePlan,
  intent: RelationshipHierarchyOperationIntent,
):
  | {
      node: GeneratedRelationshipHierarchyNodeRuntime;
      operation: GeneratedRelationshipHierarchyOperationRuntime;
    }
  | undefined {
  if (intent.hierarchyId !== runtimePlan.hierarchyId) {
    return undefined;
  }

  const node = runtimePlan.nodeByOccurrenceId.get(intent.occurrenceId);
  const operation = node?.operationByControlId.get(intent.controlId);
  return node !== undefined &&
    operation !== undefined &&
    intent.recordId === node.recordId &&
    operation.occurrenceId === node.occurrenceId &&
    operation.recordId === node.recordId &&
    operation.relationshipGroupId === intent.relationshipGroupId &&
    intent.intent.controlId === operation.binding.id
    ? { node, operation }
    : undefined;
}

export function resolveGeneratedRelationshipHierarchyCreateIntent(
  runtimePlan: GeneratedRelationshipHierarchyRuntimePlan,
  intent: RelationshipHierarchyCreateIntent,
): GeneratedRelationshipHierarchyCreateRuntime | undefined {
  if (intent.hierarchyId !== runtimePlan.hierarchyId) {
    return undefined;
  }

  const node = runtimePlan.nodeByOccurrenceId.get(intent.occurrenceId);
  const create = runtimePlan.createBySurfaceId.get(intent.surfaceId);
  return node !== undefined &&
    create !== undefined &&
    create.occurrenceId === node.occurrenceId &&
    node.createBySurfaceId.get(intent.surfaceId) === create &&
    create.relationshipGroupId === intent.relationshipGroupId &&
    intent.intent.surfaceId === create.surfaceId
    ? create
    : undefined;
}

export function resolveGeneratedRelationshipHierarchyCreateFieldIntent(
  runtimePlan: GeneratedRelationshipHierarchyRuntimePlan,
  intent: RelationshipHierarchyCreateFieldIntent,
):
  | {
      create: GeneratedRelationshipHierarchyCreateRuntime;
      field: FieldContract;
    }
  | undefined {
  if (intent.hierarchyId !== runtimePlan.hierarchyId) {
    return undefined;
  }

  const node = runtimePlan.nodeByOccurrenceId.get(intent.occurrenceId);
  const create = runtimePlan.createBySurfaceId.get(intent.surfaceId);
  if (
    node === undefined ||
    create === undefined ||
    create.occurrenceId !== node.occurrenceId ||
    node.createBySurfaceId.get(intent.surfaceId) !== create ||
    create.relationshipGroupId !== intent.relationshipGroupId
  ) {
    return undefined;
  }

  const field = resolveGeneratedCreateFieldIntent(create.fieldsById, intent.fieldId, intent.intent);
  return field === undefined ? undefined : { create, field };
}

function selectGeneratedRelationshipHierarchyNode({
  createActionOptions,
  createBySurfaceId,
  id,
  model,
  nodeByOccurrenceId,
  nodes,
  occurrenceId,
  recordId,
  recordResultOptions,
  recordStateByResultId,
  queryContext,
  snapshot,
}: {
  createActionOptions?: GeneratedRelationshipHierarchyFoundationInput["createActionOptions"];
  createBySurfaceId: Map<string, GeneratedRelationshipHierarchyCreateRuntime>;
  id: string;
  model: HomeSelectedRecordRelationshipHierarchyNodeConfig;
  nodeByOccurrenceId: Map<string, GeneratedRelationshipHierarchyNodeRuntime>;
  nodes: GeneratedRelationshipHierarchyNodeRuntime[];
  occurrenceId: string;
  recordId: string;
  recordResultOptions?: GeneratedRelationshipHierarchyFoundationInput["recordResultOptions"];
  recordStateByResultId: NonNullable<
    GeneratedRelationshipHierarchyFoundationInput["recordStateByResultId"]
  >;
  queryContext: QueryEvaluationContext;
  snapshot: BrowserReplicaProjectionSnapshot;
}): GeneratedRelationshipHierarchyNodeRuntime {
  const editorId = `${occurrenceId}:editor`;
  const record = snapshot.recordsById[recordId];
  const nodeRecordResultOptions = recordResultOptions?.(model);
  const recordState = rebaseGeneratedRecordResultRecordState({
    current: recordStateByResultId[editorId],
    record,
    result: model.result,
  });
  const foundation = selectGeneratedRecordResultFoundation({
    accessibilityLabel: `${model.entity.label} editor`,
    confirmationOpenByControlId: recordState?.confirmationOpenByControlId,
    entity: model.entity,
    entityName: model.entityName,
    fieldState: recordState,
    id: editorId,
    recordIds: [recordId],
    recordsById: snapshot.recordsById,
    result: model.result,
    selectedRecordId: recordId,
    ...nodeRecordResultOptions,
  });
  const recordOperations = selectGeneratedRelationshipHierarchyOperations({
    model,
    occurrenceId,
    operationConfigs: model.operations,
    options: nodeRecordResultOptions,
    record,
    recordLabel: foundation.recordResult.selectedRecord?.accessibilityLabel,
  });
  const links =
    record === undefined || record.entity !== model.entityName || record.deletedAt
      ? []
      : model.links.map((link) => ({
          kind: "linkAction" as const,
          link: projectGeneratedNativeLinkAction({
            accessibilityLabel: `${link.label} for ${foundation.recordResult.selectedRecord?.accessibilityLabel ?? record.id}`,
            id: generatedRelationshipHierarchyLinkId(occurrenceId, link.key),
            label: link.label,
            prominence: "secondary",
            resolution: resolveRecordLink(link, record, snapshot.recordsById),
            target: link.target,
          }),
        }));
  const relationshipGroups = model.relationships.map((relationship) => {
    const groupId = generatedRelationshipHierarchyGroupId(occurrenceId, relationship.id);
    const creates: GeneratedRelationshipHierarchyCreateRuntime[] = [];
    const groupOperations: GeneratedRelationshipHierarchyOperationRuntime[] = [];
    const headerItems =
      relationship.headerActions.flatMap<RelationshipHierarchyRelationshipGroupActionContract>(
        (action) => {
          if (action.kind === "create") {
            const create = selectGeneratedRelationshipHierarchyCreate({
              groupId,
              occurrenceId,
              operation: action,
              options: createActionOptions?.(relationship, action),
              parentRecord: record,
              queryContext,
              relationship,
            });
            if (create === undefined) {
              return [];
            }
            if (createBySurfaceId.has(create.surfaceId)) {
              throw new Error(
                `Duplicate relationship-hierarchy create surface "${create.surfaceId}".`,
              );
            }
            createBySurfaceId.set(create.surfaceId, create);
            creates.push(create);
            return [
              {
                kind: "createAction" as const,
                relationshipGroupId: groupId,
                surface: create.surface,
              },
            ];
          }
          const projected = selectGeneratedRelationshipHierarchyOperations({
            model,
            occurrenceId,
            operationConfigs: [action],
            options: nodeRecordResultOptions,
            record,
            recordLabel: foundation.recordResult.selectedRecord?.accessibilityLabel,
            relationshipGroupId: groupId,
          });
          groupOperations.push(...projected);
          return projected.map(({ control }) => ({ control, kind: "operationAction" as const }));
        },
      );
    const childRuntimes = selectGeneratedRelationshipHierarchyChildren({
      createActionOptions,
      createBySurfaceId,
      id,
      nodeByOccurrenceId,
      nodes,
      parentOccurrenceId: occurrenceId,
      parentRecordId: recordId,
      queryContext,
      recordResultOptions,
      recordStateByResultId,
      relationship,
      snapshot,
    });

    return {
      contract: {
        accessibilityLabel: relationship.label ?? `${relationship.entity.label} relationship group`,
        headerActions: {
          accessibilityLabel: `More ${(relationship.label ?? relationship.entity.label).toLowerCase()} actions`,
          id: `${groupId}:header-actions`,
          items: headerItems,
          kind: "relationshipHierarchyActions" as const,
        },
        id: groupId,
        kind: "relationshipHierarchyRelationshipGroup" as const,
        ...(relationship.label === undefined ? {} : { label: relationship.label }),
        nodes: childRuntimes.map((child) => child.contract),
      },
      creates,
      nodes: childRuntimes,
      operations: groupOperations,
      relationship,
    };
  });
  const creates = relationshipGroups.flatMap((group) => group.creates);
  const operations = [
    ...recordOperations,
    ...relationshipGroups.flatMap((group) => group.operations),
  ];
  const operationByControlId = new Map(
    operations.map((operation) => [operation.binding.id, operation]),
  );
  if (operationByControlId.size !== operations.length) {
    throw new Error(`Duplicate relationship-hierarchy operation in occurrence "${occurrenceId}".`);
  }
  const createByNodeSurfaceId = new Map(creates.map((create) => [create.surfaceId, create]));
  const contract: RelationshipHierarchyNodeContract = {
    accessibilityLabel: `${model.entity.label} record`,
    editor: foundation.recordResult,
    entityTypeLabel: model.entity.label,
    headerActions: {
      accessibilityLabel: `More ${model.entity.label.toLowerCase()} actions`,
      id: `${occurrenceId}:header-actions`,
      items: [
        ...links,
        ...recordOperations.map(({ control }) => ({
          control,
          kind: "operationAction" as const,
        })),
      ],
      kind: "relationshipHierarchyActions",
    },
    id: occurrenceId,
    kind: "relationshipHierarchyNode",
    recordId,
    relationshipGroups: relationshipGroups.map((group) => group.contract),
  };
  const runtime: GeneratedRelationshipHierarchyNodeRuntime = {
    contract,
    createBySurfaceId: createByNodeSurfaceId,
    creates,
    editor: {
      contract: foundation.recordResult,
      foundation,
      model: model.result,
      ...(recordState === undefined ? {} : { recordState }),
    },
    model,
    occurrenceId,
    operationByControlId,
    operations,
    recordId,
    relationshipGroups,
  };

  if (nodeByOccurrenceId.has(occurrenceId)) {
    throw new Error(`Duplicate relationship-hierarchy occurrence "${occurrenceId}".`);
  }
  nodeByOccurrenceId.set(occurrenceId, runtime);
  nodes.push(runtime);
  return runtime;
}

function selectGeneratedRelationshipHierarchyCreate({
  groupId,
  occurrenceId,
  operation,
  options,
  parentRecord,
  queryContext,
  relationship,
}: {
  groupId: string;
  occurrenceId: string;
  operation: HomeSelectedRecordRelationshipHierarchyCreateActionConfig;
  options: GeneratedRelationshipHierarchyCreateActionOptions | undefined;
  parentRecord: StoredRecord | undefined;
  queryContext: QueryEvaluationContext;
  relationship: HomeSelectedRecordRelationshipHierarchyRelationshipConfig;
}): GeneratedRelationshipHierarchyCreateRuntime | undefined {
  if (
    !operation.enabled ||
    parentRecord === undefined ||
    parentRecord.entity !== relationship.relationship.from.entity ||
    parentRecord.deletedAt
  ) {
    return undefined;
  }

  const surfaceId = generatedRelationshipHierarchyCreateSurfaceId(
    occurrenceId,
    relationship.id,
    operation.operation.canonicalKey,
  );
  const binding = projectCollectionOperationControlBinding(operation, {
    executionTargetKey: surfaceId,
    idPrefix: surfaceId,
  });
  const state =
    options?.createStateBySurfaceId?.[surfaceId] ??
    initialGeneratedCreateDraftSessionState({
      defaults: operation.defaults,
      fields: operation.fields,
      union: operation.union,
    });
  const parentQueryContext: QueryEvaluationContext = {
    today: queryContext.today,
    values: {
      ...queryContext.values,
      [operation.contextName]: parentRecord.id,
    },
  };
  const session = selectGeneratedCreateDraftSession({
    defaults: operation.defaults,
    enabled: operation.enabled,
    fields: operation.fields,
    queryContext: parentQueryContext,
    state,
    union: operation.union,
  });
  const fieldState = options?.fieldStateBySurfaceId?.[surfaceId];
  const operationState = options?.operationStateByExecutionKey?.[binding.executionKey];
  const surface = projectGeneratedCreateSurface({
    enabled: operation.enabled,
    entityLabel: operation.entity.label,
    errorsByFieldName: fieldState?.errorsByFieldName,
    ...(options?.createErrorBySurfaceId?.[surfaceId] === undefined
      ? {}
      : { formErrors: [options.createErrorBySurfaceId[surfaceId]!] }),
    id: surfaceId,
    isSubmitting: operationState?.status === "pending",
    mediaAssetOptionsByFieldName: options?.mediaAssetOptionsByFieldName,
    open: options?.createOpenBySurfaceId?.[surfaceId] ?? false,
    pendingByFieldName: fieldState?.pendingByFieldName as
      | Readonly<Record<string, boolean>>
      | undefined,
    referenceOptionsByFieldName: options?.referenceOptionsByFieldName,
    schema: options?.schema,
    session,
    state,
    submitLabel: operation.label,
    trigger: {
      content: operation.content,
      density: "compact",
      prominence: "secondary",
    },
    triggerLabel: operation.label,
  });

  return {
    binding,
    fieldsById: indexGeneratedCreateSurfaceFields(surface),
    occurrenceId,
    operation,
    parentRecordId: parentRecord.id,
    queryContext: parentQueryContext,
    relationshipGroupId: groupId,
    surface,
    surfaceId,
  };
}

function selectGeneratedRelationshipHierarchyOperations({
  model,
  occurrenceId,
  operationConfigs,
  options,
  record,
  recordLabel,
  relationshipGroupId,
}: {
  model: HomeSelectedRecordRelationshipHierarchyNodeConfig;
  occurrenceId: string;
  operationConfigs: readonly (
    | HomeSelectedRecordRelationshipHierarchyOperationConfig
    | HomeSelectedRecordRelationshipHierarchyRecordOperationActionConfig
  )[];
  options: GeneratedRelationshipHierarchyRecordResultOptions | undefined;
  record: StoredRecord | undefined;
  recordLabel: string | undefined;
  relationshipGroupId?: string;
}): GeneratedRelationshipHierarchyOperationRuntime[] {
  if (record === undefined || record.entity !== model.entityName || record.deletedAt) {
    return [];
  }

  const transitionsByOperationName = new Map(
    selectTransitionStateOperations(model.entityName, model.entity).map((transition) => [
      transition.operationName,
      transition,
    ]),
  );

  return operationConfigs.flatMap((operation): GeneratedRelationshipHierarchyOperationRuntime[] => {
    const transition = transitionsByOperationName.get(operation.operation.operationName);
    const projectionOptions = {
      executionTargetKey: relationshipGroupId ?? occurrenceId,
      id: generatedRelationshipHierarchyOperationId(
        occurrenceId,
        operation.bindingName,
        relationshipGroupId,
      ),
    };
    const binding =
      transition === undefined
        ? projectRecordOperationControlBinding({
            entityLabel: model.entity.label,
            label: operation.label,
            operation: operation.operation,
            ...(recordLabel === undefined ? {} : { recordLabel }),
            options: projectionOptions,
          })
        : projectStateTransitionOperationControlBinding({
            availability: selectTransitionStateOperationAvailability({
              currentValue: record.values[transition.fieldName],
              field: transition.field,
              operation: transition,
            }),
            operation: { ...transition, label: operation.label },
            options: projectionOptions,
          });

    if (binding.availability.state !== "enabled") {
      return [];
    }

    const state =
      options?.operationStateByExecutionKey?.[binding.executionKey] ??
      createIdleGeneratedOperationExecutionState(binding.executionKey);
    const control = projectGeneratedOperationControl({
      binding,
      confirmationOpen: options?.confirmationOpenByControlId?.[binding.id] ?? false,
      presentation: {
        accessibilityLabel: operation.label,
        content:
          "content" in operation ? operation.content : { kind: "label", label: operation.label },
        density: relationshipGroupId === undefined ? "default" : "compact",
        pendingLabel: `${operation.label}...`,
        prominence: binding.destructive ? "destructive" : "secondary",
      },
      state,
    });

    return [
      {
        binding,
        control,
        occurrenceId,
        operation,
        recordId: record.id,
        ...(relationshipGroupId === undefined ? {} : { relationshipGroupId }),
        ...(transition === undefined ? {} : { transition }),
      },
    ];
  });
}

function selectGeneratedRelationshipHierarchyChildren({
  createActionOptions,
  createBySurfaceId,
  id,
  nodeByOccurrenceId,
  nodes,
  parentOccurrenceId,
  parentRecordId,
  queryContext,
  recordResultOptions,
  recordStateByResultId,
  relationship,
  snapshot,
}: {
  createActionOptions?: GeneratedRelationshipHierarchyFoundationInput["createActionOptions"];
  createBySurfaceId: Map<string, GeneratedRelationshipHierarchyCreateRuntime>;
  id: string;
  nodeByOccurrenceId: Map<string, GeneratedRelationshipHierarchyNodeRuntime>;
  nodes: GeneratedRelationshipHierarchyNodeRuntime[];
  parentOccurrenceId: string;
  parentRecordId: string;
  queryContext: QueryEvaluationContext;
  recordResultOptions?: GeneratedRelationshipHierarchyFoundationInput["recordResultOptions"];
  recordStateByResultId: NonNullable<
    GeneratedRelationshipHierarchyFoundationInput["recordStateByResultId"]
  >;
  relationship: HomeSelectedRecordRelationshipHierarchyRelationshipConfig;
  snapshot: BrowserReplicaProjectionSnapshot;
}): GeneratedRelationshipHierarchyNodeRuntime[] {
  const childRecords = (snapshot.recordIdsByEntity[relationship.entityName] ?? [])
    .flatMap((recordId): StoredRecord[] => {
      const record = snapshot.recordsById[recordId];
      return record !== undefined &&
        record.entity === relationship.entityName &&
        !record.deletedAt &&
        record.values[relationship.relationship.to.field] === parentRecordId
        ? [record]
        : [];
    })
    .toSorted(compareGeneratedRelationshipHierarchyRecords);

  return childRecords.map((record) =>
    selectGeneratedRelationshipHierarchyNode({
      createActionOptions,
      createBySurfaceId,
      id,
      model: relationship,
      nodeByOccurrenceId,
      nodes,
      occurrenceId: generatedRelationshipHierarchyChildOccurrenceId(
        parentOccurrenceId,
        relationship.id,
        record.id,
      ),
      recordId: record.id,
      recordResultOptions,
      recordStateByResultId,
      queryContext,
      snapshot,
    }),
  );
}

function generatedRelationshipHierarchyCreateSurfaceId(
  occurrenceId: string,
  relationshipId: string,
  operationKey: string,
): string {
  return `${occurrenceId}:relationship:${encodeURIComponent(relationshipId)}:create:${encodeURIComponent(operationKey)}`;
}

function compareGeneratedRelationshipHierarchyRecords(
  left: StoredRecord,
  right: StoredRecord,
): number {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

function generatedRelationshipHierarchyRootOccurrenceId(
  hierarchyId: string,
  recordId: string,
): string {
  return `${hierarchyId}:occurrence:root:${encodeURIComponent(recordId)}`;
}

function generatedRelationshipHierarchyChildOccurrenceId(
  parentOccurrenceId: string,
  relationshipId: string,
  recordId: string,
): string {
  return `${parentOccurrenceId}:relationship:${encodeURIComponent(relationshipId)}:record:${encodeURIComponent(recordId)}`;
}

function generatedRelationshipHierarchyGroupId(
  occurrenceId: string,
  relationshipId: string,
): string {
  return `${occurrenceId}:relationship-group:${encodeURIComponent(relationshipId)}`;
}

function generatedRelationshipHierarchyOperationId(
  occurrenceId: string,
  operationKey: string,
  relationshipGroupId?: string,
): string {
  return `${relationshipGroupId ?? occurrenceId}:operation:${encodeURIComponent(operationKey)}`;
}

function generatedRelationshipHierarchyLinkId(occurrenceId: string, linkKey: string): string {
  return `${occurrenceId}:link:${encodeURIComponent(linkKey)}`;
}
