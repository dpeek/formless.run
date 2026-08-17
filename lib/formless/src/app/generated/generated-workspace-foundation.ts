import type {
  ActionTriggerContract,
  CollectionEmptyStatePrimaryActionContract,
  CreateSurfaceContract,
  FieldContract,
  OperationControlContract,
  TableContract,
  TreeResultContract,
  WorkspaceCollectionActionContract,
  WorkspaceContract,
  WorkspaceIntent,
  WorkspaceLinkActionContract,
} from "@dpeek/formless-presentation/contract";
import type { QueryEvaluationContext } from "@dpeek/formless-schema";
import {
  createAggregateValueMatchingQuerySelector,
  createEntityRecordCountMatchingQuerySelector,
  createEntityRecordCountReferencingFieldSelector,
  createEntityRecordIdsMatchingQuerySelector,
  createEntityRecordOptionsMatchingQuerySelector,
  type BrowserReplicaProjectionSnapshot,
  type ReferenceOption,
} from "../../client/projections.ts";
import {
  selectGeneratedContextSelectionFacts,
  type GeneratedContextSelectionFacts,
  selectGeneratedSingletonScopeSelectionFacts,
  type GeneratedSingletonScopeSelectionFacts,
} from "../../client/generated-authoring.ts";
import type { RecordResultModel } from "../../client/list-result-model.ts";
import type {
  HomeQueryTabConfig,
  HomeSelectedRecordDetailRecordSectionConfig,
  HomeSelectedRecordDetailRelationshipHierarchySectionConfig,
  HomeSelectedRecordDetailRelationshipSectionConfig,
  HomeScreenCollectionSectionModel,
  HomeScreenModel,
} from "../../client/views.ts";
import { formatAggregateDisplayValue } from "./format.ts";
import {
  indexGeneratedCreateSurfaceFields,
  resolveGeneratedCreateFieldIntent,
  type GeneratedCreateFieldIndex,
} from "./generated-create-field-index.ts";
import {
  generatedWorkspaceCollectionId,
  generatedWorkspaceScopedId,
  generatedWorkspaceScreenId,
  generatedWorkspaceSectionId,
  projectGeneratedWorkspaceContract,
  type GeneratedWorkspaceAvailabilityProjection,
  type GeneratedWorkspaceContextProjectionFacts,
  type GeneratedWorkspaceIdentityScope,
  type GeneratedWorkspaceSelectedRecordProjectionFacts,
  type GeneratedWorkspaceSelectedRecordSectionProjectionFacts,
  type GeneratedWorkspaceSectionProjectionFacts,
} from "./workspace-projection.ts";
import {
  resolveGeneratedListFieldIntent,
  selectGeneratedListFoundation,
  selectGeneratedListRuntimeForIntent,
  type GeneratedListFoundation,
  type SelectGeneratedListFoundationOptions,
} from "./generated-list-foundation.ts";
import {
  rebaseGeneratedRecordResultRecordState,
  resolveGeneratedRecordResultFieldIntent,
  selectGeneratedRecordResultFoundation,
  selectGeneratedRecordResultRuntimeForIntent,
  type GeneratedRecordResultFoundation,
  type GeneratedRecordResultRecordState,
  type SelectGeneratedRecordResultFoundationOptions,
} from "./generated-record-result-foundation.ts";
import {
  resolveGeneratedTableEditFieldIntent,
  type GeneratedTableEditFieldIndex,
} from "./generated-table-foundation.tsx";
import {
  resolveGeneratedTreeChildVariantSelectionIntent,
  resolveGeneratedTreeContextActionIntent,
  resolveGeneratedTreeCreateFieldIntent,
  resolveGeneratedTreeCreateIntent,
  resolveGeneratedTreeOperationIntent,
  resolveGeneratedTreeRecordResultIntent,
  resolveGeneratedTreeReorderIntent,
  selectGeneratedTreeFoundation,
  type GeneratedTreeFoundation,
  type GeneratedTreeOperationRuntime,
  type GeneratedTreeOrderingRuntime,
  type GeneratedTreeRecordResultIntentRuntime,
  type GeneratedTreeContextNavigationRuntime,
  type SelectGeneratedTreeFoundationOptions,
} from "./generated-tree-foundation.ts";
import type {
  GeneratedTreeChildCreateRuntime,
  GeneratedTreeChildVariantRuntime,
} from "./generated-tree-create-foundation.ts";
import {
  resolveGeneratedRelationshipHierarchyCreateFieldIntent,
  resolveGeneratedRelationshipHierarchyCreateIntent,
  resolveGeneratedRelationshipHierarchyOperationIntent,
  resolveGeneratedRelationshipHierarchyRecordFieldIntent,
  selectGeneratedRelationshipHierarchyFoundation,
  type GeneratedRelationshipHierarchyFoundation,
  type GeneratedRelationshipHierarchyFoundationInput,
  type GeneratedRelationshipHierarchyCreateRuntime,
  type GeneratedRelationshipHierarchyNodeRuntime,
  type GeneratedRelationshipHierarchyOperationRuntime,
} from "./generated-relationship-hierarchy-foundation.ts";

export type GeneratedWorkspaceSectionSelection = {
  selectedContextRecordId?: string | null;
  selectedQueryName?: string | null;
  selectedRecordId?: string | null;
};

export type GeneratedWorkspaceExternalActionFoundation = {
  action: ActionTriggerContract;
  id: string;
  runtime: unknown;
};

export type GeneratedWorkspaceCollectionActionFoundation = {
  action: WorkspaceCollectionActionContract;
  placement: "primary" | "secondary";
  runtime: unknown;
};

export type GeneratedWorkspaceEmptyStatePrimaryActionFoundation = {
  action: CollectionEmptyStatePrimaryActionContract;
  runtime: unknown;
};

export type GeneratedWorkspaceContextCreateFoundation = {
  action: Extract<WorkspaceCollectionActionContract, { kind: "createAction" }>;
  runtime: unknown;
};

export type GeneratedWorkspaceTableFoundation = {
  editFieldsById: GeneratedTableEditFieldIndex;
  runtime: unknown;
  table: TableContract;
};

export type GeneratedWorkspaceSelectedRecordDetailHeadingOperationFoundation = {
  control: OperationControlContract;
  runtime: unknown;
};

export type GeneratedWorkspaceSelectedRecordDetailRelationshipFoundation = {
  headingCreate?: GeneratedWorkspaceContextCreateFoundation;
  headingOperations?: readonly GeneratedWorkspaceSelectedRecordDetailHeadingOperationFoundation[];
  table: GeneratedWorkspaceTableFoundation;
};

export type GeneratedWorkspaceSelectedRecordDetailRelationshipFacts = {
  queryContext: QueryEvaluationContext;
  recordIds: readonly string[];
  resultId: string;
  section: HomeSelectedRecordDetailRelationshipSectionConfig;
  selectedRecordId: string;
};

type GeneratedWorkspaceListFoundationOptions = Partial<
  Pick<
    SelectGeneratedListFoundationOptions,
    | "confirmationOpenByControlId"
    | "fieldStateByRecordId"
    | "mediaAssetOptionsByRecordId"
    | "operationStateByExecutionKey"
    | "referenceOptionsByRecordId"
    | "schema"
  >
>;

type GeneratedWorkspaceRecordResultFoundationOptions = Partial<
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

type GeneratedWorkspaceTreeFoundationOptions = Omit<
  SelectGeneratedTreeFoundationOptions,
  | "context"
  | "emptyStateAction"
  | "id"
  | "recordsById"
  | "result"
  | "rootRecordId"
  | "selectableContextRecordIds"
>;

export type GeneratedWorkspaceSectionFoundationInput = {
  collectionAvailability?: GeneratedWorkspaceAvailabilityProjection;
  collectionActions?: readonly GeneratedWorkspaceCollectionActionFoundation[];
  contextCreate?: GeneratedWorkspaceContextCreateFoundation;
  contextDetail?: GeneratedWorkspaceRecordResultFoundationOptions & {
    recordState?: GeneratedRecordResultRecordState;
  };
  externalActions?: readonly GeneratedWorkspaceExternalActionFoundation[];
  emptyStatePrimaryAction?: GeneratedWorkspaceEmptyStatePrimaryActionFoundation;
  list?: GeneratedWorkspaceListFoundationOptions;
  recordResult?: GeneratedWorkspaceRecordResultFoundationOptions & {
    recordState?: GeneratedRecordResultRecordState;
  };
  selectedRecordDetailRecords?: Readonly<
    Record<
      string,
      | (GeneratedWorkspaceRecordResultFoundationOptions & {
          recordState?: GeneratedRecordResultRecordState;
        })
      | undefined
    >
  >;
  selectedRecordDetailRelationships?: Readonly<
    Record<string, GeneratedWorkspaceSelectedRecordDetailRelationshipFoundation | undefined>
  >;
  selectedRecordDetailRelationshipHierarchies?: Readonly<
    Record<string, GeneratedRelationshipHierarchyFoundationInput | undefined>
  >;
  table?: GeneratedWorkspaceTableFoundation;
  tree?: GeneratedWorkspaceTreeFoundationOptions;
};

export type GeneratedWorkspaceSectionSelectionFacts = {
  actionQueryContext: QueryEvaluationContext;
  contextOptions: readonly ReferenceOption[];
  contextSelection?: GeneratedContextSelectionFacts;
  queryContext?: QueryEvaluationContext;
  recordIds: readonly string[];
  resultId: string;
  scope: GeneratedWorkspaceIdentityScope;
  scopeSelection?: GeneratedSingletonScopeSelectionFacts;
  screen: HomeScreenModel;
  section: HomeScreenCollectionSectionModel;
  selectedQuery: HomeQueryTabConfig;
  selectedRecordId: string | null;
  selectedRecordDetailRelationships: readonly GeneratedWorkspaceSelectedRecordDetailRelationshipFacts[];
  snapshot: BrowserReplicaProjectionSnapshot;
  today: string;
};

export type SelectGeneratedWorkspaceFoundationOptions = {
  screen: HomeScreenModel;
  sectionSelection?: Readonly<Record<string, GeneratedWorkspaceSectionSelection | undefined>>;
  selectSectionFoundation?: (
    facts: GeneratedWorkspaceSectionSelectionFacts,
  ) => GeneratedWorkspaceSectionFoundationInput | undefined;
  snapshot: BrowserReplicaProjectionSnapshot;
  today: string;
  workspaceActions?: readonly WorkspaceLinkActionContract[];
};

type GeneratedWorkspaceNestedResultRuntime =
  | {
      contract: GeneratedListFoundation["list"];
      foundation: GeneratedListFoundation;
      kind: "list";
    }
  | {
      contract: GeneratedRecordResultFoundation["recordResult"];
      foundation: GeneratedRecordResultFoundation;
      kind: "recordResult";
      model: RecordResultModel;
      recordState?: GeneratedRecordResultRecordState;
    }
  | {
      contract: TableContract;
      editFieldsById: GeneratedTableEditFieldIndex;
      kind: "table";
      runtime: unknown;
    }
  | {
      contract: TreeResultContract;
      foundation: GeneratedTreeFoundation;
      kind: "treeResult";
    };

type GeneratedWorkspaceCreateControlRuntime = {
  contextId?: string;
  contract: CreateSurfaceContract;
  fieldsById: GeneratedCreateFieldIndex;
  kind: "create";
  runtime: unknown;
};

type GeneratedWorkspaceControlRuntime =
  | GeneratedWorkspaceCreateControlRuntime
  | {
      contract: ActionTriggerContract;
      kind: "externalAction";
      runtime: unknown;
    }
  | {
      contextId?: string;
      contract: OperationControlContract;
      kind: "operation";
      runtime: unknown;
    };

export type GeneratedWorkspaceSectionRuntimePlan = {
  actionQueryContext: QueryEvaluationContext;
  collection: HomeScreenCollectionSectionModel["collection"];
  contextId?: string;
  contextOptionById: ReadonlyMap<string, ReferenceOption>;
  contextRecordState?: GeneratedRecordResultRecordState;
  contextResult?: GeneratedWorkspaceNestedResultRuntime & { kind: "recordResult" };
  controlsById: ReadonlyMap<string, GeneratedWorkspaceControlRuntime>;
  queryById: ReadonlyMap<string, HomeQueryTabConfig>;
  queryContext?: QueryEvaluationContext;
  recordIds: readonly string[];
  result: GeneratedWorkspaceNestedResultRuntime;
  scope: GeneratedWorkspaceIdentityScope;
  scopeSelection?: GeneratedSingletonScopeSelectionFacts;
  section: HomeScreenCollectionSectionModel;
  selectedRecordDetailRecordResults: readonly GeneratedWorkspaceSelectedRecordDetailRecordRuntime[];
  selectedRecordDetailRelationshipHierarchies: readonly GeneratedWorkspaceSelectedRecordDetailRelationshipHierarchyRuntime[];
  selectedRecordDetailRelationshipResults: readonly GeneratedWorkspaceSelectedRecordDetailRelationshipRuntime[];
  selectedContextRecordId: string | null;
  selectedQuery: HomeQueryTabConfig;
  selectedRecordId: string | null;
};

export type GeneratedWorkspaceSelectedRecordDetailRecordRuntime = {
  id: string;
  label?: string;
  result: GeneratedWorkspaceNestedResultRuntime & { kind: "recordResult" };
  section: HomeSelectedRecordDetailRecordSectionConfig;
};

export type GeneratedWorkspaceSelectedRecordDetailHeadingOperationRuntime = {
  control: OperationControlContract;
  runtime: unknown;
};

export type GeneratedWorkspaceSelectedRecordDetailRelationshipRuntime = {
  headingCreate?: GeneratedWorkspaceContextCreateFoundation;
  headingOperations: readonly GeneratedWorkspaceSelectedRecordDetailHeadingOperationRuntime[];
  id: string;
  label?: string;
  queryContext: QueryEvaluationContext;
  recordIds: readonly string[];
  result: GeneratedWorkspaceNestedResultRuntime & { kind: "table" };
  section: HomeSelectedRecordDetailRelationshipSectionConfig;
  selectedRecordId: string;
};

export type GeneratedWorkspaceSelectedRecordDetailRelationshipHierarchyRuntime = {
  foundation: GeneratedRelationshipHierarchyFoundation;
  id: string;
  label?: string;
  section: HomeSelectedRecordDetailRelationshipHierarchySectionConfig;
};

export type GeneratedWorkspaceRuntimePlan = {
  screen: HomeScreenModel;
  screenId: string;
  sectionByCollectionId: ReadonlyMap<string, GeneratedWorkspaceSectionRuntimePlan>;
  sections: readonly GeneratedWorkspaceSectionRuntimePlan[];
};

export type GeneratedWorkspaceFoundation = {
  runtimePlan: GeneratedWorkspaceRuntimePlan;
  workspace: WorkspaceContract;
};

export type GeneratedWorkspaceResolvedIntent =
  | {
      kind: "contextSelection";
      option: ReferenceOption;
      section: GeneratedWorkspaceSectionRuntimePlan;
    }
  | {
      kind: "control";
      runtime: GeneratedWorkspaceControlRuntime;
      section: GeneratedWorkspaceSectionRuntimePlan;
    }
  | {
      field?: FieldContract;
      kind: "field";
      result?: GeneratedWorkspaceNestedResultRuntime;
      runtime?: GeneratedWorkspaceControlRuntime;
      section: GeneratedWorkspaceSectionRuntimePlan;
    }
  | {
      create: GeneratedRelationshipHierarchyCreateRuntime;
      hierarchy: GeneratedWorkspaceSelectedRecordDetailRelationshipHierarchyRuntime;
      kind: "relationshipHierarchyCreate";
      section: GeneratedWorkspaceSectionRuntimePlan;
    }
  | {
      create: GeneratedRelationshipHierarchyCreateRuntime;
      field: FieldContract;
      hierarchy: GeneratedWorkspaceSelectedRecordDetailRelationshipHierarchyRuntime;
      kind: "relationshipHierarchyCreateField";
      section: GeneratedWorkspaceSectionRuntimePlan;
    }
  | {
      field: FieldContract;
      hierarchy: GeneratedWorkspaceSelectedRecordDetailRelationshipHierarchyRuntime;
      kind: "relationshipHierarchyField";
      node: GeneratedRelationshipHierarchyNodeRuntime;
      section: GeneratedWorkspaceSectionRuntimePlan;
    }
  | {
      hierarchy: GeneratedWorkspaceSelectedRecordDetailRelationshipHierarchyRuntime;
      kind: "relationshipHierarchyOperation";
      node: GeneratedRelationshipHierarchyNodeRuntime;
      operation: GeneratedRelationshipHierarchyOperationRuntime;
      section: GeneratedWorkspaceSectionRuntimePlan;
    }
  | {
      kind: "querySelection";
      query: HomeQueryTabConfig;
      section: GeneratedWorkspaceSectionRuntimePlan;
    }
  | {
      kind: "result";
      result: GeneratedWorkspaceNestedResultRuntime;
      section: GeneratedWorkspaceSectionRuntimePlan;
    }
  | {
      kind: "selectedRecordHeadingOperation";
      operation: GeneratedWorkspaceSelectedRecordDetailHeadingOperationRuntime;
      relationship: GeneratedWorkspaceSelectedRecordDetailRelationshipRuntime;
      section: GeneratedWorkspaceSectionRuntimePlan;
    }
  | {
      kind: "selectedRecordSelection";
      recordId: string | null;
      section: GeneratedWorkspaceSectionRuntimePlan;
    }
  | {
      kind: "treeChildVariant";
      result: GeneratedWorkspaceNestedResultRuntime & { kind: "treeResult" };
      runtime: GeneratedTreeChildVariantRuntime;
      section: GeneratedWorkspaceSectionRuntimePlan;
    }
  | {
      kind: "treeCreate";
      result: GeneratedWorkspaceNestedResultRuntime & { kind: "treeResult" };
      runtime: GeneratedTreeChildCreateRuntime;
      section: GeneratedWorkspaceSectionRuntimePlan;
    }
  | {
      field: FieldContract;
      kind: "treeCreateField";
      result: GeneratedWorkspaceNestedResultRuntime & { kind: "treeResult" };
      runtime: GeneratedTreeChildCreateRuntime;
      section: GeneratedWorkspaceSectionRuntimePlan;
    }
  | {
      kind: "treeContextNavigation";
      navigation: GeneratedTreeContextNavigationRuntime;
      result: GeneratedWorkspaceNestedResultRuntime & { kind: "treeResult" };
      section: GeneratedWorkspaceSectionRuntimePlan;
    }
  | {
      kind: "treeRecordResult";
      result: GeneratedWorkspaceNestedResultRuntime & { kind: "treeResult" };
      runtime: GeneratedTreeRecordResultIntentRuntime;
      section: GeneratedWorkspaceSectionRuntimePlan;
    }
  | {
      kind: "treeOperation";
      result: GeneratedWorkspaceNestedResultRuntime & { kind: "treeResult" };
      runtime: GeneratedTreeOperationRuntime;
      section: GeneratedWorkspaceSectionRuntimePlan;
    }
  | {
      kind: "treeOrdering";
      result: GeneratedWorkspaceNestedResultRuntime & { kind: "treeResult" };
      runtime: GeneratedTreeOrderingRuntime;
      section: GeneratedWorkspaceSectionRuntimePlan;
    };

export function selectGeneratedWorkspaceFoundation(
  options: SelectGeneratedWorkspaceFoundationOptions,
): GeneratedWorkspaceFoundation | undefined {
  const {
    screen,
    sectionSelection = {},
    selectSectionFoundation,
    snapshot,
    today,
    workspaceActions = [],
  } = options;

  const screenId = generatedWorkspaceScreenId(screen.screenName);
  const sectionPlans: GeneratedWorkspaceSectionRuntimePlan[] = [];
  const projectedSections: GeneratedWorkspaceSectionProjectionFacts[] = [];

  for (const section of screen.layout.sections) {
    const selection = sectionSelection[section.id] ?? {};
    const selectedQuery = selectGeneratedWorkspaceQuery(section, selection.selectedQueryName);
    const scope = generatedWorkspaceScope(screenId, section);
    const scopeSelection = selectGeneratedWorkspaceSingletonScope(section, snapshot, today);
    const baseQueryContext =
      section.collection.scope === undefined ? { today } : scopeSelection?.queryContext;
    const contextOptions = selectGeneratedWorkspaceContextOptions(
      section,
      snapshot,
      baseQueryContext,
    );
    const contextSelection = selectGeneratedWorkspaceContext(
      section,
      contextOptions,
      selection.selectedContextRecordId ?? null,
      today,
      baseQueryContext,
    );
    const queryContext =
      contextSelection?.queryContext ??
      (section.collection.context === undefined ? baseQueryContext : undefined);
    const actionQueryContext = contextSelection?.actionQueryContext ??
      scopeSelection?.actionQueryContext ?? { today };
    const matchingRecordIds =
      queryContext === undefined
        ? []
        : createEntityRecordIdsMatchingQuerySelector(
            section.collection.entityName,
            selectedQuery.query,
            queryContext,
          )(snapshot);
    const recordIds =
      scopeSelection?.state === "ready" &&
      section.collection.entityName === section.collection.scope?.entityName
        ? matchingRecordIds.filter((recordId) => recordId === scopeSelection.activeRecordId)
        : matchingRecordIds;
    const selectedRecordId = selectGeneratedWorkspaceSelectedRecordId(
      section,
      recordIds,
      selection.selectedRecordId,
    );
    const selectedRecordDetailRelationships =
      selectGeneratedWorkspaceSelectedRecordDetailRelationshipFacts({
        baseQueryContext: actionQueryContext,
        section,
        selectedRecordId,
        snapshot,
        scope,
      });
    const resultId = generatedWorkspaceScopedId(
      scope,
      "result",
      generatedWorkspaceResultLocalId(section),
    );
    const facts: GeneratedWorkspaceSectionSelectionFacts = {
      actionQueryContext,
      contextOptions,
      ...(contextSelection === undefined ? {} : { contextSelection }),
      ...(queryContext === undefined ? {} : { queryContext }),
      recordIds,
      resultId,
      scope,
      ...(scopeSelection === undefined ? {} : { scopeSelection }),
      screen,
      section,
      selectedQuery,
      selectedRecordId,
      selectedRecordDetailRelationships,
      snapshot,
      today,
    };
    const sectionFoundation = selectSectionFoundation?.(facts) ?? {};
    const collectionAvailability =
      sectionFoundation.collectionAvailability ??
      projectGeneratedSingletonScopeAvailability(section, scopeSelection);
    const result = selectGeneratedWorkspaceResult(facts, sectionFoundation);
    const context = projectGeneratedWorkspaceContextFacts(facts, sectionFoundation);
    const contextResult = selectGeneratedWorkspaceContextResult(facts, sectionFoundation);
    const selectedRecordDetailRecordResults =
      selectGeneratedWorkspaceSelectedRecordDetailRecordResults(facts, sectionFoundation);
    const selectedRecordDetailRelationshipHierarchies =
      selectGeneratedWorkspaceSelectedRecordDetailRelationshipHierarchies(facts, sectionFoundation);
    const selectedRecordDetailRelationshipResults =
      selectGeneratedWorkspaceSelectedRecordDetailRelationshipResults(facts, sectionFoundation);
    const selectedRecord = projectGeneratedWorkspaceSelectedRecordFacts({
      hierarchyResults: selectedRecordDetailRelationshipHierarchies,
      recordResults: selectedRecordDetailRecordResults,
      relationshipResults: selectedRecordDetailRelationshipResults,
      section,
      selectedRecordId,
      recordIds,
    });
    const projectedContextId =
      context === undefined ? undefined : generatedWorkspaceScopedId(scope, "context", context.id);
    const controlsById = selectGeneratedWorkspaceControlRuntimePlan(
      scope,
      projectedContextId,
      sectionFoundation,
    );
    const queryById = new Map(
      section.collection.queries.tabs.map((query) => [
        generatedWorkspaceScopedId(scope, "query", query.queryName),
        query,
      ]),
    );
    const contextOptionById = new Map(
      contextOptions.map((option) => [
        generatedWorkspaceScopedId(
          scope,
          "contextOption",
          `${section.collection.context?.name ?? "context"}:${option.id}`,
        ),
        option,
      ]),
    );
    const selectedContextRecordId = contextSelection?.activeRecordId ?? null;
    const sectionPlan: GeneratedWorkspaceSectionRuntimePlan = {
      actionQueryContext,
      collection: section.collection,
      ...(projectedContextId === undefined ? {} : { contextId: projectedContextId }),
      contextOptionById,
      ...(contextResult?.recordState === undefined
        ? {}
        : { contextRecordState: contextResult.recordState }),
      ...(contextResult === undefined ? {} : { contextResult }),
      controlsById,
      queryById,
      ...(queryContext === undefined ? {} : { queryContext }),
      recordIds,
      result,
      scope,
      ...(scopeSelection === undefined ? {} : { scopeSelection }),
      section,
      selectedRecordDetailRecordResults,
      selectedRecordDetailRelationshipHierarchies,
      selectedRecordDetailRelationshipResults,
      selectedContextRecordId,
      selectedQuery,
      selectedRecordId,
    };

    sectionPlans.push(sectionPlan);
    projectedSections.push({
      actions: (sectionFoundation.externalActions ?? []).map(({ action, id }) => ({ action, id })),
      collection: {
        actions: (sectionFoundation.collectionActions ?? []).map(({ action, placement }) => ({
          action,
          placement,
        })),
        ...(collectionAvailability === undefined ? {} : { availability: collectionAvailability }),
        ...(context === undefined
          ? {}
          : {
              context: {
                ...context,
                ...(contextResult === undefined ? {} : { detail: contextResult.contract }),
              },
            }),
        id: section.viewName,
        label: section.collection.entity.label,
        ...(sectionFoundation.emptyStatePrimaryAction === undefined
          ? {}
          : { emptyStatePrimaryAction: sectionFoundation.emptyStatePrimaryAction.action }),
        layout:
          context?.presentation === "localListDetail"
            ? ("listDetail" as const)
            : ("ordinary" as const),
        queries: projectGeneratedWorkspaceQueries(facts),
        result: result.contract,
        ...(selectedRecord === undefined ? {} : { selectedRecord }),
        selectedQueryId: selectedQuery.queryName,
        summaries: projectGeneratedWorkspaceSummaries(facts),
      },
      id: section.id,
      label: section.label,
    });
  }

  return {
    runtimePlan: {
      screen,
      screenId,
      sectionByCollectionId: new Map(
        sectionPlans.map((section) => [section.scope.collectionId, section]),
      ),
      sections: sectionPlans,
    },
    workspace: projectGeneratedWorkspaceContract({
      actions: workspaceActions,
      id: screen.screenName,
      label: screen.label,
      sections: projectedSections,
      ...(screen.layout.surface === "full"
        ? { surface: screen.layout.surface }
        : { surface: screen.layout.surface, width: screen.layout.width }),
    }),
  };
}

function projectGeneratedSingletonScopeAvailability(
  section: HomeScreenCollectionSectionModel,
  selection: GeneratedSingletonScopeSelectionFacts | undefined,
): GeneratedWorkspaceAvailabilityProjection | undefined {
  const entityLabel = section.collection.scope?.entity.label;
  if (selection === undefined || selection.state === "ready" || entityLabel === undefined) {
    return undefined;
  }
  if (selection.state === "empty") {
    return {
      description: `Create a ${entityLabel.toLowerCase()} to begin.`,
      state: "empty",
      title: `No ${entityLabel} configured`,
    };
  }
  return {
    message: `${entityLabel} authoring is unavailable because more than one active record exists.`,
    state: "unavailable",
  };
}

export function resolveGeneratedWorkspaceIntent(
  runtimePlan: GeneratedWorkspaceRuntimePlan,
  intent: WorkspaceIntent,
): GeneratedWorkspaceResolvedIntent | undefined {
  const section = runtimePlan.sectionByCollectionId.get(intent.collectionId);

  if (
    section === undefined ||
    intent.screenId !== runtimePlan.screenId ||
    intent.sectionId !== section.scope.sectionId
  ) {
    return undefined;
  }

  if (intent.type === "workspaceQuerySelection") {
    const query = section.queryById.get(intent.queryId);
    return query === undefined ? undefined : { kind: "querySelection", query, section };
  }

  if (intent.type === "workspaceContextSelection") {
    if (intent.contextId !== section.contextId) {
      return undefined;
    }
    const option = section.contextOptionById.get(intent.contextOptionId);
    return option === undefined ? undefined : { kind: "contextSelection", option, section };
  }

  if (intent.type === "workspaceSelectedRecordSelection") {
    return section.collection.detail !== undefined && section.recordIds.includes(intent.recordId)
      ? { kind: "selectedRecordSelection", recordId: intent.recordId, section }
      : undefined;
  }

  if (intent.type === "workspaceSelectedRecordBack") {
    return section.collection.detail !== undefined &&
      section.selectedRecordId !== null &&
      intent.recordId === section.selectedRecordId
      ? { kind: "selectedRecordSelection", recordId: null, section }
      : undefined;
  }

  if (intent.type === "workspaceExternalAction") {
    const runtime = section.controlsById.get(intent.actionId);
    return runtime?.kind === "externalAction" &&
      intent.controlId === runtime.contract.id &&
      intent.intent.controlId === runtime.contract.id
      ? { kind: "control", runtime, section }
      : undefined;
  }

  if (intent.type === "workspaceCreate") {
    const runtime = section.controlsById.get(intent.surfaceId);
    return runtime?.kind === "create" &&
      intent.intent.surfaceId === runtime.contract.id &&
      intent.contextId === runtime.contextId
      ? { kind: "control", runtime, section }
      : undefined;
  }

  if (intent.type === "workspaceOperation") {
    const runtime = section.controlsById.get(intent.controlId);
    if (
      runtime?.kind === "operation" &&
      intent.intent.controlId === runtime.contract.id &&
      intent.contextId === runtime.contextId &&
      intent.resultId === undefined &&
      intent.recordId === undefined
    ) {
      return { kind: "control", runtime, section };
    }

    const headingOperation = section.selectedRecordDetailRelationshipResults
      .flatMap((relationship) =>
        relationship.headingOperations.map((operation) => ({ operation, relationship })),
      )
      .find(
        ({ operation, relationship }) =>
          operation.control.id === intent.controlId &&
          relationship.result.contract.id === intent.resultId &&
          relationship.selectedRecordId === intent.recordId,
      );
    if (
      headingOperation !== undefined &&
      intent.contextId === undefined &&
      intent.intent.controlId === headingOperation.operation.control.id
    ) {
      return { kind: "selectedRecordHeadingOperation", section, ...headingOperation };
    }

    const result = selectGeneratedWorkspaceIntentResult(section, intent.resultId, intent.contextId);
    return result !== undefined &&
      intent.intent.controlId === intent.controlId &&
      contractContainsId(result.contract, intent.controlId) &&
      (intent.recordId === undefined || contractContainsId(result.contract, intent.recordId))
      ? { kind: "result", result, section }
      : undefined;
  }

  if (intent.type === "workspaceField") {
    const controlRuntime =
      intent.surfaceId === undefined ? undefined : section.controlsById.get(intent.surfaceId);
    const createField =
      controlRuntime?.kind === "create"
        ? resolveGeneratedCreateFieldIntent(
            controlRuntime.fieldsById,
            intent.fieldId,
            intent.intent,
          )
        : undefined;
    if (
      controlRuntime?.kind === "create" &&
      createField !== undefined &&
      intent.resultId === undefined &&
      intent.contextId === controlRuntime.contextId
    ) {
      return { field: createField, kind: "field", runtime: controlRuntime, section };
    }

    const result =
      section.result.kind === "table" && section.result.contract.id === intent.resultId
        ? section.result
        : selectGeneratedWorkspaceIntentResult(section, intent.resultId, intent.contextId);
    if (result?.kind === "list") {
      const field = resolveGeneratedListFieldIntent(result.foundation.runtimePlan, intent);
      return field === undefined
        ? undefined
        : { field: field.field, kind: "field", result, section };
    }
    if (result?.kind === "recordResult") {
      const field = resolveGeneratedRecordResultFieldIntent(result.foundation.runtimePlan, intent);
      return field === undefined
        ? undefined
        : { field: field.field, kind: "field", result, section };
    }
    if (result?.kind === "table" && intent.contextId !== undefined) {
      const field = resolveGeneratedTableEditFieldIntent(result.editFieldsById, {
        contextId: intent.contextId,
        fieldId: intent.fieldId,
        intent: intent.intent,
        recordId: intent.recordId,
        tableId: result.contract.id,
      });
      return field === undefined
        ? undefined
        : { field: field.field, kind: "field", result, section };
    }

    return undefined;
  }

  if (intent.type === "workspaceRelationshipHierarchy") {
    const hierarchy = section.selectedRecordDetailRelationshipHierarchies.find(
      ({ foundation }) => foundation.hierarchy.id === intent.hierarchyId,
    );
    if (hierarchy === undefined) {
      return undefined;
    }
    if (intent.intent.type === "relationshipHierarchyRecordResult") {
      const resolved = resolveGeneratedRelationshipHierarchyRecordFieldIntent(
        hierarchy.foundation.runtimePlan,
        intent.intent,
      );
      return resolved === undefined
        ? undefined
        : {
            field: resolved.field.field,
            hierarchy,
            kind: "relationshipHierarchyField",
            node: resolved.node,
            section,
          };
    }
    if (intent.intent.type === "relationshipHierarchyCreate") {
      const create = resolveGeneratedRelationshipHierarchyCreateIntent(
        hierarchy.foundation.runtimePlan,
        intent.intent,
      );
      return create === undefined
        ? undefined
        : { create, hierarchy, kind: "relationshipHierarchyCreate", section };
    }
    if (intent.intent.type === "relationshipHierarchyCreateField") {
      const resolved = resolveGeneratedRelationshipHierarchyCreateFieldIntent(
        hierarchy.foundation.runtimePlan,
        intent.intent,
      );
      return resolved === undefined
        ? undefined
        : {
            create: resolved.create,
            field: resolved.field,
            hierarchy,
            kind: "relationshipHierarchyCreateField",
            section,
          };
    }
    if (intent.intent.type === "relationshipHierarchyOperation") {
      const resolved = resolveGeneratedRelationshipHierarchyOperationIntent(
        hierarchy.foundation.runtimePlan,
        intent.intent,
      );
      return resolved === undefined
        ? undefined
        : {
            hierarchy,
            kind: "relationshipHierarchyOperation",
            node: resolved.node,
            operation: resolved.operation,
            section,
          };
    }
    return undefined;
  }

  const result = selectGeneratedWorkspaceIntentResult(
    section,
    intent.resultId,
    "contextId" in intent ? intent.contextId : undefined,
  );

  if (result === undefined) {
    return undefined;
  }

  if (intent.type === "workspaceList") {
    return result.kind === "list" &&
      intent.intent.listId === result.contract.id &&
      contractContainsId(result.contract, intent.intent.itemId) &&
      contractContainsId(result.contract, intent.intent.actionId) &&
      selectGeneratedListRuntimeForIntent(result.foundation.runtimePlan, intent.intent) !==
        undefined
      ? { kind: "result", result, section }
      : undefined;
  }

  if (intent.type === "workspaceTable") {
    return result.kind === "table" &&
      intent.intent.tableId === result.contract.id &&
      generatedWorkspaceTableIntentMatchesContract(result.contract, intent.intent)
      ? { kind: "result", result, section }
      : undefined;
  }

  if (intent.type === "workspaceTree") {
    if (result.kind !== "treeResult") {
      return undefined;
    }
    if (intent.intent.type === "treeContextAction") {
      const navigation = resolveGeneratedTreeContextActionIntent(
        result.foundation.runtimePlan,
        intent.intent,
      );
      return navigation === undefined
        ? undefined
        : { kind: "treeContextNavigation", navigation, result, section };
    }
    if (intent.intent.type === "treeChildVariantSelection") {
      const runtime = resolveGeneratedTreeChildVariantSelectionIntent(
        result.foundation.runtimePlan,
        intent.intent,
      );
      return runtime === undefined
        ? undefined
        : { kind: "treeChildVariant", result, runtime, section };
    }
    if (intent.intent.type === "treeCreate") {
      const runtime = resolveGeneratedTreeCreateIntent(
        result.foundation.runtimePlan,
        intent.intent,
      );
      return runtime === undefined ? undefined : { kind: "treeCreate", result, runtime, section };
    }
    if (intent.intent.type === "treeCreateField") {
      const create = resolveGeneratedTreeCreateFieldIntent(
        result.foundation.runtimePlan,
        intent.intent,
      );
      return create === undefined
        ? undefined
        : {
            field: create.field,
            kind: "treeCreateField",
            result,
            runtime: create.runtime,
            section,
          };
    }
    if (intent.intent.type === "treeRecordResult") {
      const runtime = resolveGeneratedTreeRecordResultIntent(
        result.foundation.runtimePlan,
        intent.intent,
      );
      return runtime === undefined
        ? undefined
        : { kind: "treeRecordResult", result, runtime, section };
    }
    if (intent.intent.type === "treeOperation") {
      const runtime = resolveGeneratedTreeOperationIntent(
        result.foundation.runtimePlan,
        intent.intent,
      );
      return runtime === undefined
        ? undefined
        : { kind: "treeOperation", result, runtime, section };
    }
    if (intent.intent.type === "treeReorder") {
      const runtime = resolveGeneratedTreeReorderIntent(
        result.foundation.runtimePlan,
        intent.intent,
      );
      return runtime === undefined ? undefined : { kind: "treeOrdering", result, runtime, section };
    }
    return undefined;
  }

  if (intent.type !== "workspaceRecordResult") {
    return undefined;
  }

  return result.kind === "recordResult" &&
    intent.intent.resultId === result.contract.id &&
    selectGeneratedRecordResultRuntimeForIntent(result.foundation.runtimePlan, intent.intent) !==
      undefined
    ? { kind: "result", result, section }
    : undefined;
}

function selectGeneratedWorkspaceQuery(
  section: HomeScreenCollectionSectionModel,
  selectedQueryName: string | null | undefined,
): HomeQueryTabConfig {
  const selected = section.collection.queries.tabs.find(
    (query) => query.queryName === selectedQueryName,
  );
  return selected ?? section.collection.queries.defaultTab;
}

export function selectGeneratedWorkspaceSelectedRecordId(
  section: HomeScreenCollectionSectionModel,
  recordIds: readonly string[],
  selectedRecordId: string | null | undefined,
): string | null {
  if (section.collection.detail === undefined || selectedRecordId === null) {
    return null;
  }

  return selectedRecordId !== undefined && recordIds.includes(selectedRecordId)
    ? selectedRecordId
    : (recordIds[0] ?? null);
}

function selectGeneratedWorkspaceSelectedRecordDetailRelationshipFacts({
  baseQueryContext,
  section,
  selectedRecordId,
  snapshot,
  scope,
}: {
  baseQueryContext: QueryEvaluationContext;
  section: HomeScreenCollectionSectionModel;
  selectedRecordId: string | null;
  snapshot: BrowserReplicaProjectionSnapshot;
  scope: GeneratedWorkspaceIdentityScope;
}): GeneratedWorkspaceSelectedRecordDetailRelationshipFacts[] {
  const detail = section.collection.detail;
  if (detail === undefined || selectedRecordId === null) {
    return [];
  }

  const queryContext: QueryEvaluationContext = {
    today: baseQueryContext.today,
    values: {
      ...baseQueryContext.values,
      [detail.contextName]: selectedRecordId,
    },
  };

  return detail.sections.flatMap((detailSection) =>
    detailSection.type !== "relationship"
      ? []
      : [
          {
            queryContext,
            recordIds: createEntityRecordIdsMatchingQuerySelector(
              detailSection.entityName,
              detailSection.query,
              queryContext,
            )(snapshot),
            resultId: generatedWorkspaceSelectedRecordDetailResultId(scope, detailSection.id),
            section: detailSection,
            selectedRecordId,
          },
        ],
  );
}

function selectGeneratedWorkspaceContextOptions(
  section: HomeScreenCollectionSectionModel,
  snapshot: BrowserReplicaProjectionSnapshot,
  queryContext: QueryEvaluationContext | undefined,
): readonly ReferenceOption[] {
  const context = section.collection.context;
  return context === undefined || queryContext === undefined
    ? []
    : createEntityRecordOptionsMatchingQuerySelector(
        context.entityName,
        context.query,
        context.labelField,
        queryContext,
      )(snapshot);
}

function selectGeneratedWorkspaceSingletonScope(
  section: HomeScreenCollectionSectionModel,
  snapshot: BrowserReplicaProjectionSnapshot,
  today: string,
): GeneratedSingletonScopeSelectionFacts | undefined {
  const scope = section.collection.scope;
  if (scope === undefined) {
    return undefined;
  }
  const recordIds = createEntityRecordIdsMatchingQuerySelector(scope.entityName, scope.query, {
    today,
  })(snapshot);

  return selectGeneratedSingletonScopeSelectionFacts({ recordIds, scope, today });
}

function selectGeneratedWorkspaceContext(
  section: HomeScreenCollectionSectionModel,
  options: readonly ReferenceOption[],
  selectedRecordId: string | null,
  today: string,
  queryContext: QueryEvaluationContext | undefined,
): GeneratedContextSelectionFacts | undefined {
  const context = section.collection.context;
  return context === undefined
    ? undefined
    : selectGeneratedContextSelectionFacts({
        context,
        options: [...options],
        ...(queryContext === undefined ? {} : { queryContext }),
        selectedRecordId,
        today,
      });
}

function generatedWorkspaceScope(
  screenId: string,
  section: HomeScreenCollectionSectionModel,
): GeneratedWorkspaceIdentityScope {
  const sectionId = generatedWorkspaceSectionId(screenId, section.id);
  return {
    collectionId: generatedWorkspaceCollectionId(sectionId, section.viewName),
    screenId,
    sectionId,
  };
}

function generatedWorkspaceResultLocalId(section: HomeScreenCollectionSectionModel): string {
  const result = section.collection.result;
  if (result.type === "table") {
    return result.tableViewName;
  }
  if (result.type === "tree") {
    return result.childItemViewName;
  }
  return result.itemViewName;
}

function selectGeneratedWorkspaceResult(
  facts: GeneratedWorkspaceSectionSelectionFacts,
  input: GeneratedWorkspaceSectionFoundationInput,
): GeneratedWorkspaceNestedResultRuntime {
  const { collection } = facts.section;
  const result = collection.result;

  if (result.type === "list") {
    const emptyStateAction = input.emptyStatePrimaryAction?.action;
    const foundation = selectGeneratedListFoundation({
      entity: collection.entity,
      entityName: collection.entityName,
      id: facts.resultId,
      recordIds: facts.recordIds,
      recordsById: facts.snapshot.recordsById,
      result,
      ...(emptyStateAction === undefined ? {} : { emptyStateAction }),
      ...input.list,
    });
    return { contract: foundation.list, foundation, kind: "list" };
  }

  if (result.type === "record") {
    const emptyStateAction = input.emptyStatePrimaryAction?.action;
    const record = facts.snapshot.recordsById[facts.recordIds[0] ?? ""];
    const recordState = rebaseGeneratedRecordResultRecordState({
      current: input.recordResult?.recordState,
      record,
      result,
    });
    const foundation = selectGeneratedRecordResultFoundation({
      confirmationOpenByControlId: recordState?.confirmationOpenByControlId,
      entity: collection.entity,
      entityName: collection.entityName,
      fieldState: recordState,
      id: facts.resultId,
      recordIds: facts.recordIds,
      recordsById: facts.snapshot.recordsById,
      result,
      ...(emptyStateAction === undefined ? {} : { emptyStateAction }),
      ...input.recordResult,
    });
    return {
      contract: foundation.recordResult,
      foundation,
      kind: "recordResult",
      model: result,
      ...(recordState === undefined ? {} : { recordState }),
    };
  }

  if (result.type === "tree") {
    const emptyStateAction = input.emptyStatePrimaryAction?.action;
    const foundation = selectGeneratedTreeFoundation({
      context: collection.context,
      id: facts.resultId,
      recordsById: facts.snapshot.recordsById,
      result,
      rootRecordId: facts.contextSelection?.activeRecordId,
      selectableContextRecordIds: facts.contextSelection?.selectableRecordIds,
      ...(emptyStateAction === undefined ? {} : { emptyStateAction }),
      ...input.tree,
    });
    return { contract: foundation.tree, foundation, kind: "treeResult" };
  }

  if (input.table === undefined) {
    throw new Error(`Missing table foundation for workspace section "${facts.section.id}".`);
  }
  if (input.table.table.id !== facts.resultId) {
    throw new Error("Workspace table foundations must use the scoped result id.");
  }

  return {
    contract: input.table.table,
    editFieldsById: input.table.editFieldsById,
    kind: "table",
    runtime: input.table.runtime,
  };
}

function projectGeneratedWorkspaceContextFacts(
  facts: GeneratedWorkspaceSectionSelectionFacts,
  input: GeneratedWorkspaceSectionFoundationInput,
): GeneratedWorkspaceContextProjectionFacts | undefined {
  const context = facts.section.collection.context;
  const selection = facts.contextSelection;

  if (context === undefined || selection === undefined) {
    return undefined;
  }

  const presentation = selection.hasSidebarNavigation
    ? ("externalNavigation" as const)
    : selection.isSingleton
      ? ("singletonDetail" as const)
      : context.presentation === "listDetail"
        ? ("localListDetail" as const)
        : ("localTabs" as const);
  const options = facts.contextOptions.map((option) => {
    const count =
      context.relatedCollection === undefined
        ? undefined
        : createEntityRecordCountReferencingFieldSelector(
            context.relatedCollection.entityName,
            context.relatedCollection.referenceFieldName,
            option.id,
          )(facts.snapshot);

    return {
      ...(count === undefined ? {} : { count }),
      id: option.id,
      label: option.label,
    };
  });

  return {
    availability:
      options.length === 0
        ? { state: "empty", title: `No ${context.label.toLowerCase()} records yet.` }
        : { state: "ready" },
    ...(input.contextCreate === undefined ? {} : { createAction: input.contextCreate.action }),
    id: context.name,
    label: context.label,
    options,
    presentation,
    ...(selection.activeRecordId === null ? {} : { selectedOptionId: selection.activeRecordId }),
  };
}

function selectGeneratedWorkspaceContextResult(
  facts: GeneratedWorkspaceSectionSelectionFacts,
  input: GeneratedWorkspaceSectionFoundationInput,
): (GeneratedWorkspaceNestedResultRuntime & { kind: "recordResult" }) | undefined {
  const context = facts.section.collection.context;
  const selection = facts.contextSelection;
  const recordId = selection?.activeRecordId ?? null;

  if (context === undefined || selection === undefined || recordId === null) {
    return undefined;
  }

  const result: RecordResultModel = {
    ...(context.deleteOperation === undefined ? {} : { deleteOperation: context.deleteOperation }),
    itemViewName: context.itemViewName ?? `${context.name}:detail`,
    recordFields: context.recordFields ?? [],
    ...(context.recordUnion === undefined ? {} : { recordUnion: context.recordUnion }),
    transitionOperations: context.transitionOperations,
    type: "record",
    ...(context.updateOperation === undefined ? {} : { updateOperation: context.updateOperation }),
  };
  const resultId = generatedWorkspaceScopedId(
    facts.scope,
    "result",
    `${result.itemViewName}:context`,
  );
  const record = facts.snapshot.recordsById[recordId];
  const recordState = rebaseGeneratedRecordResultRecordState({
    current: input.contextDetail?.recordState,
    record,
    result,
  });
  const foundation = selectGeneratedRecordResultFoundation({
    accessibilityLabel: `${selection.detailLabel} detail`,
    confirmationOpenByControlId: recordState?.confirmationOpenByControlId,
    density: context.presentation === "listDetail" ? "compact" : "default",
    entity: context.entity,
    entityName: context.entityName,
    fieldPresentation: "contextDetail",
    fieldState: recordState,
    id: resultId,
    recordIds: [recordId],
    recordsById: facts.snapshot.recordsById,
    result,
    selectedRecordId: recordId,
    ...input.contextDetail,
  });

  return {
    contract: foundation.recordResult,
    foundation,
    kind: "recordResult",
    model: result,
    ...(recordState === undefined ? {} : { recordState }),
  };
}

function selectGeneratedWorkspaceSelectedRecordDetailRecordResults(
  facts: GeneratedWorkspaceSectionSelectionFacts,
  input: GeneratedWorkspaceSectionFoundationInput,
): GeneratedWorkspaceSelectedRecordDetailRecordRuntime[] {
  const detail = facts.section.collection.detail;
  const recordId = facts.selectedRecordId;
  if (detail === undefined || recordId === null) {
    return [];
  }

  return detail.sections.flatMap((section) => {
    if (section.type !== "record") {
      return [];
    }
    const id = generatedWorkspaceSelectedRecordDetailResultId(facts.scope, section.id);
    const record = facts.snapshot.recordsById[recordId];
    const sectionInput = input.selectedRecordDetailRecords?.[section.id] ?? {};
    const { recordState: currentRecordState, ...foundationInput } = sectionInput;
    const recordState = rebaseGeneratedRecordResultRecordState({
      current: currentRecordState,
      record,
      result: section.result,
    });
    const foundation = selectGeneratedRecordResultFoundation({
      accessibilityLabel: section.label ?? `${detail.entity.label} detail`,
      confirmationOpenByControlId: recordState?.confirmationOpenByControlId,
      entity: detail.entity,
      entityName: detail.entityName,
      fieldState: recordState,
      id,
      recordIds: [recordId],
      recordsById: facts.snapshot.recordsById,
      result: section.result,
      selectedRecordId: recordId,
      ...foundationInput,
    });
    const result: GeneratedWorkspaceNestedResultRuntime & { kind: "recordResult" } = {
      contract: foundation.recordResult,
      foundation,
      kind: "recordResult",
      model: section.result,
      ...(recordState === undefined ? {} : { recordState }),
    };

    return [
      {
        id: section.id,
        ...(section.label === undefined ? {} : { label: section.label }),
        result,
        section,
      },
    ];
  });
}

function selectGeneratedWorkspaceSelectedRecordDetailRelationshipResults(
  facts: GeneratedWorkspaceSectionSelectionFacts,
  input: GeneratedWorkspaceSectionFoundationInput,
): GeneratedWorkspaceSelectedRecordDetailRelationshipRuntime[] {
  return facts.selectedRecordDetailRelationships.map((relationshipFacts) => {
    const sectionInput = input.selectedRecordDetailRelationships?.[relationshipFacts.section.id];
    if (sectionInput === undefined) {
      throw new Error(
        `Missing selected-record relationship foundation for section "${relationshipFacts.section.id}".`,
      );
    }
    if (sectionInput.table.table.id !== relationshipFacts.resultId) {
      throw new Error("Selected-record relationship tables must use the scoped result id.");
    }

    return {
      ...(sectionInput.headingCreate === undefined
        ? {}
        : { headingCreate: sectionInput.headingCreate }),
      headingOperations: sectionInput.headingOperations ?? [],
      id: relationshipFacts.section.id,
      ...(relationshipFacts.section.label === undefined
        ? {}
        : { label: relationshipFacts.section.label }),
      queryContext: relationshipFacts.queryContext,
      recordIds: relationshipFacts.recordIds,
      result: {
        contract: sectionInput.table.table,
        editFieldsById: sectionInput.table.editFieldsById,
        kind: "table" as const,
        runtime: sectionInput.table.runtime,
      },
      section: relationshipFacts.section,
      selectedRecordId: relationshipFacts.selectedRecordId,
    };
  });
}

function selectGeneratedWorkspaceSelectedRecordDetailRelationshipHierarchies(
  facts: GeneratedWorkspaceSectionSelectionFacts,
  input: GeneratedWorkspaceSectionFoundationInput,
): GeneratedWorkspaceSelectedRecordDetailRelationshipHierarchyRuntime[] {
  const detail = facts.section.collection.detail;
  const selectedRecordId = facts.selectedRecordId;
  if (detail === undefined || selectedRecordId === null) {
    return [];
  }

  return detail.sections.flatMap((section) => {
    if (section.type !== "relationshipHierarchy") {
      return [];
    }
    const foundation = selectGeneratedRelationshipHierarchyFoundation({
      id: generatedWorkspaceSelectedRecordDetailHierarchyId(facts.scope, section.id),
      model: section,
      queryContext: facts.actionQueryContext,
      selectedRecordId,
      snapshot: facts.snapshot,
      ...input.selectedRecordDetailRelationshipHierarchies?.[section.id],
    });

    return [
      {
        foundation,
        id: section.id,
        ...(section.label === undefined ? {} : { label: section.label }),
        section,
      },
    ];
  });
}

function projectGeneratedWorkspaceSelectedRecordFacts({
  hierarchyResults,
  recordIds,
  recordResults,
  relationshipResults,
  section,
  selectedRecordId,
}: {
  hierarchyResults: readonly GeneratedWorkspaceSelectedRecordDetailRelationshipHierarchyRuntime[];
  recordIds: readonly string[];
  recordResults: readonly GeneratedWorkspaceSelectedRecordDetailRecordRuntime[];
  relationshipResults: readonly GeneratedWorkspaceSelectedRecordDetailRelationshipRuntime[];
  section: HomeScreenCollectionSectionModel;
  selectedRecordId: string | null;
}): GeneratedWorkspaceSelectedRecordProjectionFacts | undefined {
  const detail = section.collection.detail;
  if (detail === undefined) {
    return undefined;
  }

  const sections =
    selectedRecordId === null
      ? []
      : detail.sections.flatMap<GeneratedWorkspaceSelectedRecordSectionProjectionFacts>(
          (detailSection) => {
            if (detailSection.type === "record") {
              const projected = recordResults.find(({ id }) => id === detailSection.id);
              if (projected === undefined) {
                throw new Error(
                  `Missing selected-record detail result for section "${detailSection.id}".`,
                );
              }
              return [
                {
                  id: projected.id,
                  ...(projected.label === undefined ? {} : { label: projected.label }),
                  result: projected.result.contract,
                  type: "record" as const,
                },
              ];
            }
            if (detailSection.type === "relationshipHierarchy") {
              const projected = hierarchyResults.find(({ id }) => id === detailSection.id);
              if (projected === undefined) {
                throw new Error(
                  `Missing selected-record detail hierarchy for section "${detailSection.id}".`,
                );
              }
              return [
                {
                  hierarchy: projected.foundation.hierarchy,
                  id: projected.id,
                  ...(projected.label === undefined ? {} : { label: projected.label }),
                  type: "relationshipHierarchy" as const,
                },
              ];
            }
            if (detailSection.type !== "relationship") {
              return [];
            }

            const projected = relationshipResults.find(({ id }) => id === detailSection.id);
            if (projected === undefined) {
              throw new Error(
                `Missing selected-record detail result for section "${detailSection.id}".`,
              );
            }
            return [
              {
                ...(projected.headingCreate === undefined
                  ? {}
                  : { headingCreate: projected.headingCreate.action }),
                headingOperations: projected.headingOperations.map(({ control }) => control),
                id: projected.id,
                ...(projected.label === undefined ? {} : { label: projected.label }),
                result: projected.result.contract,
                type: "relationship" as const,
              },
            ];
          },
        );

  return { recordIds, sections, selectedRecordId };
}

export function generatedWorkspaceSelectedRecordDetailResultId(
  scope: GeneratedWorkspaceIdentityScope,
  detailSectionId: string,
): string {
  return generatedWorkspaceScopedId(scope, "result", `selectedRecord:${detailSectionId}`);
}

export function generatedWorkspaceSelectedRecordDetailHierarchyId(
  scope: GeneratedWorkspaceIdentityScope,
  detailSectionId: string,
): string {
  return generatedWorkspaceScopedId(scope, "hierarchy", `selectedRecord:${detailSectionId}`);
}

export function generatedWorkspaceSelectedRecordDetailHeadingOperationId(
  scope: GeneratedWorkspaceIdentityScope,
  detailSectionId: string,
  selectedRecordId: string,
  operationKey: string,
): string {
  return generatedWorkspaceScopedId(
    scope,
    "control",
    `selectedRecord:${detailSectionId}:${selectedRecordId}:heading:${operationKey}`,
  );
}

function projectGeneratedWorkspaceQueries(facts: GeneratedWorkspaceSectionSelectionFacts) {
  return facts.section.collection.queries.tabs.map((query) => {
    const count =
      query.count?.type === "count" && facts.queryContext !== undefined
        ? createEntityRecordCountMatchingQuerySelector(
            facts.section.collection.entityName,
            query.query,
            facts.queryContext,
          )(facts.snapshot)
        : undefined;

    return {
      ...(count === undefined ? {} : { count }),
      id: query.queryName,
      label: query.label,
    };
  });
}

function projectGeneratedWorkspaceSummaries(facts: GeneratedWorkspaceSectionSelectionFacts) {
  if (facts.queryContext === undefined) {
    return [];
  }

  return (facts.section.collection.summary ?? [])
    .filter((slot) => slot.aggregate.query === facts.selectedQuery.queryName)
    .map((slot) => {
      const value = createAggregateValueMatchingQuerySelector(
        facts.section.collection.entityName,
        facts.selectedQuery.query,
        slot.aggregate,
        slot.computedValues,
        facts.queryContext,
      )(facts.snapshot);

      return {
        displayValue: formatAggregateDisplayValue(slot, value),
        id: slot.key,
        label: slot.label,
        ...(slot.suffix === undefined ? {} : { suffix: slot.suffix }),
      };
    });
}

function selectGeneratedWorkspaceControlRuntimePlan(
  scope: GeneratedWorkspaceIdentityScope,
  contextId: string | undefined,
  input: GeneratedWorkspaceSectionFoundationInput,
): ReadonlyMap<string, GeneratedWorkspaceControlRuntime> {
  const controls = new Map<string, GeneratedWorkspaceControlRuntime>();

  for (const external of input.externalActions ?? []) {
    controls.set(generatedWorkspaceScopedId(scope, "externalAction", external.id), {
      contract: external.action,
      kind: "externalAction",
      runtime: external.runtime,
    });
  }

  for (const action of input.collectionActions ?? []) {
    const contract = action.action;
    if (contract.kind === "createAction") {
      controls.set(contract.surface.id, {
        contract: contract.surface,
        fieldsById: indexGeneratedCreateSurfaceFields(contract.surface),
        kind: "create",
        runtime: action.runtime,
      });
    } else {
      controls.set(contract.control.id, {
        contract: contract.control,
        kind: "operation",
        runtime: action.runtime,
      });
    }
  }

  if (input.emptyStatePrimaryAction !== undefined) {
    const action = input.emptyStatePrimaryAction;
    if (action.action.kind === "createAction") {
      controls.set(action.action.surface.id, {
        contract: action.action.surface,
        fieldsById: indexGeneratedCreateSurfaceFields(action.action.surface),
        kind: "create",
        runtime: action.runtime,
      });
    } else {
      controls.set(action.action.control.id, {
        contract: action.action.control,
        kind: "operation",
        runtime: action.runtime,
      });
    }
  }

  if (input.contextCreate !== undefined) {
    controls.set(input.contextCreate.action.surface.id, {
      contextId,
      contract: input.contextCreate.action.surface,
      fieldsById: indexGeneratedCreateSurfaceFields(input.contextCreate.action.surface),
      kind: "create",
      runtime: input.contextCreate.runtime,
    });
  }

  for (const relationship of Object.values(input.selectedRecordDetailRelationships ?? {})) {
    if (relationship?.headingCreate === undefined) {
      continue;
    }
    const create = relationship.headingCreate;
    controls.set(create.action.surface.id, {
      contract: create.action.surface,
      fieldsById: indexGeneratedCreateSurfaceFields(create.action.surface),
      kind: "create",
      runtime: create.runtime,
    });
  }

  return controls;
}

function selectGeneratedWorkspaceIntentResult(
  section: GeneratedWorkspaceSectionRuntimePlan,
  resultId: string | undefined,
  contextId: string | undefined,
): GeneratedWorkspaceNestedResultRuntime | undefined {
  if (resultId === undefined) {
    return undefined;
  }

  if (section.result.contract.id === resultId && contextId === undefined) {
    return section.result;
  }

  if (contextId === undefined) {
    const selectedRecordResult = section.selectedRecordDetailRecordResults.find(
      ({ result }) => result.contract.id === resultId,
    );
    if (selectedRecordResult !== undefined) {
      return selectedRecordResult.result;
    }
  }

  const selectedRelationshipResult = section.selectedRecordDetailRelationshipResults.find(
    ({ result }) => result.contract.id === resultId,
  );
  if (selectedRelationshipResult !== undefined) {
    return selectedRelationshipResult.result;
  }

  return section.contextResult?.contract.id === resultId && contextId === section.contextId
    ? section.contextResult
    : undefined;
}

function contractContainsId(contract: unknown, id: string): boolean {
  return contractObjects(contract).some(
    (value) => value.id === id || value.actionId === id || value.recordId === id,
  );
}

function generatedWorkspaceTableIntentMatchesContract(
  table: TableContract,
  intent: Extract<WorkspaceIntent, { type: "workspaceTable" }>["intent"],
): boolean {
  if (intent.type === "tableEditDialogOpenChange") {
    return contractContainsId(table, intent.dialogId) && contractContainsId(table, intent.rowId);
  }

  return contractContainsId(table, intent.actionId) && contractContainsId(table, intent.rowId);
}

function contractObjects(value: unknown): Record<string, unknown>[] {
  const objects: Record<string, unknown>[] = [];
  const pending: unknown[] = [value];

  while (pending.length > 0) {
    const next = pending.pop();
    if (next === null || typeof next !== "object") {
      continue;
    }
    if (Array.isArray(next)) {
      pending.push(...next);
      continue;
    }

    const object = next as Record<string, unknown>;
    objects.push(object);
    pending.push(...Object.values(object));
  }

  return objects;
}
