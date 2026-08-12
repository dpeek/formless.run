import { flattenAppNavigationScreenKeys } from "@dpeek/formless-schema";
import type {
  AppSchema,
  CollectionNavigationSchema,
  CollectionViewSchema,
  ComputedValueSchema,
  CreateDefaultValueSchema,
  EntitySchema,
  EntityUnionSchema,
  EntityUnionVariantSchema,
  OperationHandlerEffectSchemaForKind,
  FieldCommitPolicy,
  FieldEditor,
  FieldRef,
  FieldPresentationSchema,
  FieldVisibilityConditionSchema,
  FieldVisibilityValue,
  FieldSchema,
  KeyedDefinition,
  RecordLinkSchema,
  ScreenAccessRequirement,
  ScreenLayoutWidthSchema,
  WorkspaceScreenSchema,
  ToManyRelationshipSchema,
  TableColumnAlign,
  TableColumnFormat,
  TableColumnWidth,
  TableOperationControlVariant,
  ViewSchema,
} from "@dpeek/formless-schema";
import { selectHomeCollectionShell } from "./collection-shell-model.ts";
import type {
  HomeCollectionShellConfig,
  HomeContextConfig,
  HomeOperationConfig,
  HomeQueryTabConfig,
  HomeSummarySlotConfig,
} from "./collection-shell-model.ts";
import { selectHomeResultModel } from "./collection-result-model.ts";
import {
  type ResultOrderingConfig,
  type ResultOrderingScopeConfig,
} from "./result-ordering-model.ts";
import type { EntityOperationPresentationConfig } from "./operation-presentation-model.ts";
import type {
  StateMachineFieldConfig,
  TransitionStateOperationConfig,
} from "./state-machine-model.ts";
import {
  selectHomeSelectedRecordDetail,
  type HomeSelectedRecordDetailConfig,
} from "./selected-record-detail-model.ts";

export { selectRelatedCollectionModels } from "./collection-shell-model.ts";
export {
  initialGeneratedCommandDraftSessionState,
  markGeneratedCommandDraftSessionSubmitted,
  nextGeneratedCommandDraftSessionState,
  selectGeneratedCommandDraftSession,
} from "./operation-command-form.ts";
export type {
  GeneratedCommandDraftSessionFacts,
  GeneratedCommandDraftSessionState,
} from "./operation-command-form.ts";
export {
  buildGeneratedOperationInvocationRequest,
  buildGeneratedOperationRuntimeAdapterRequest,
  createGeneratedOperationController,
  normalizeGeneratedOperationInvocationResponse,
  normalizeGeneratedOperationRuntimeAdapterResponse,
} from "./operation-control-controller.ts";
export {
  createWorkspaceGatewayGeneratedOperationRuntimeAdapter,
  executeWorkspaceGatewayGeneratedOperation,
  workspaceGatewayErrorMessage,
  workspaceGatewayPushGeneratedProgress,
  workspaceGatewayPushGeneratedProgressSteps,
  workspaceGatewayPushGeneratedRuntimeAdapterResponse,
  workspaceGatewayPushStartInputFromGeneratedOperation,
  workspaceGatewayStatusObservedPush,
} from "./workspace-operation-runtime.ts";
export {
  createIdleGeneratedOperationExecutionState,
  generatedCommandInputForm,
  generatedOperationExecutionKey,
  projectCollectionOperationControlBinding,
  projectCollectionOperationControlBindings,
  projectOrderingMoveOperationControlBinding,
  projectPublicOperationFormControlBinding,
  projectRecordDeleteOperationControlBinding,
  projectRecordOperationControlBinding,
  projectStateTransitionOperationControlBinding,
  projectTableOperationControlBinding,
  projectTableOperationControlBindings,
  projectTreeCompositionOperationControlBindings,
  projectWorkspaceOperationControlBinding,
} from "./operation-control-model.ts";
export type {
  CommandOperationTargetCountConfig,
  CommandOperationUiConfig,
  HomeCollectionShellConfig,
  HomeContextConfig,
  HomeContextNavigationConfig,
  HomeContextNavigationGroupConfig,
  HomeQueriesConfig,
  HomeQueryTabConfig,
  HomeOperationConfig,
  HomeSummarySlotConfig,
  RelatedCollectionConfig,
} from "./collection-shell-model.ts";
export type { HomeCollectionScopeConfig } from "./collection-shell-model.ts";
export type {
  GeneratedOperationAuthoritySubmitter,
  GeneratedOperationController,
  GeneratedOperationControllerListener,
  GeneratedOperationControllerOptions,
  GeneratedOperationProgressReporter,
  GeneratedOperationRuntimeAdapter,
  GeneratedOperationRuntimeAdapterKind,
  GeneratedOperationRuntimeAdapterRequest,
  GeneratedOperationRuntimeAdapterResponse,
} from "./operation-control-controller.ts";
export type { WorkspaceGatewayGeneratedOperationRuntimeAdapterOptions } from "./workspace-operation-runtime.ts";
export type {
  GeneratedCommandInputFieldConfig,
  GeneratedCommandInputForm,
  GeneratedOperationCallerInput,
  GeneratedOperationControlAvailability,
  GeneratedOperationControlBinding,
  GeneratedOperationControlConfirmation,
  GeneratedOperationControlFeedback,
  GeneratedOperationControlKind,
  GeneratedOperationControlScope,
  GeneratedOperationControlVisualIntent,
  GeneratedOperationExecutionResult,
  GeneratedOperationExecutionState,
  GeneratedOperationExecutionStatus,
  GeneratedOperationInputAdapter,
  GeneratedOperationInvocationSource,
  GeneratedOperationProjectionOptions,
  GeneratedOperationProgress,
  GeneratedOperationProgressStep,
  GeneratedOperationProgressStepStatus,
  GeneratedOrderingMoveOperationFacts,
  GeneratedPublicOperationControlFacts,
  GeneratedPublicOperationInputField,
  GeneratedWorkspaceOperationControlFacts,
} from "./operation-control-model.ts";
export type { StateMachineFieldConfig, TransitionStateOperationConfig };
export type {
  HomeSelectedRecordDetailConfig,
  HomeSelectedRecordDetailOperationConfig,
  HomeSelectedRecordDetailRecordSectionConfig,
  HomeSelectedRecordDetailRelationshipHierarchySectionConfig,
  HomeSelectedRecordDetailRelationshipSectionConfig,
  HomeSelectedRecordDetailSectionConfig,
  HomeSelectedRecordRelationshipHierarchyCreateActionConfig,
  HomeSelectedRecordRelationshipHierarchyHeaderActionConfig,
  HomeSelectedRecordRelationshipHierarchyHeaderActionContentConfig,
  HomeSelectedRecordRelationshipHierarchyNodeConfig,
  HomeSelectedRecordRelationshipHierarchyOperationConfig,
  HomeSelectedRecordRelationshipHierarchyRecordOperationActionConfig,
  HomeSelectedRecordRelationshipHierarchyRelationshipConfig,
} from "./selected-record-detail-model.ts";
export { fieldLabel } from "./view-labels.ts";

export function recordFieldRef(fieldConfig: { fieldName: string; fieldRef?: FieldRef }): FieldRef {
  return fieldConfig.fieldRef ?? { kind: "value", name: fieldConfig.fieldName };
}

export function recordFieldIsWritable(fieldConfig: { writable?: boolean }) {
  return fieldConfig.writable ?? true;
}

export type RecordFieldConfig = {
  fieldName: string;
  fieldRef?: FieldRef;
  field: FieldSchema;
  editor: FieldEditor;
  commit: FieldCommitPolicy;
  writable?: boolean;
  label?: string;
  format?: TableColumnFormat;
  stateMachine?: StateMachineFieldConfig;
  visibleWhen?: FieldVisibilityConditionSchema;
  presentation?: FieldPresentationSchema;
  valueUnit?: ValueUnitFieldConfig;
};
export type ValueUnitFieldConfig = {
  unitFieldName: string;
  unitField: Extract<
    FieldSchema,
    {
      type: "enum";
    }
  >;
};
export type ListSummaryFieldConfig = {
  fieldName: string;
  field: FieldSchema;
};
export type ListSummaryPresentationConfig = {
  type: "summary";
  slots: {
    title: ListSummaryFieldConfig;
    subtitle?: ListSummaryFieldConfig;
  };
};
export type TableColumnDisplay = "editor" | "readOnly" | "hidden";
export type TableColumnBaseConfig = {
  key: string;
  label: string;
  align?: TableColumnAlign;
  width?: TableColumnWidth;
  display: TableColumnDisplay;
  suffix?: string;
  format: TableColumnFormat;
};

export type FieldTableColumnConfig = RecordFieldConfig &
  TableColumnBaseConfig & {
    type: "field";
  };

export type ReferenceFieldTableColumnConfig = RecordFieldConfig &
  TableColumnBaseConfig & {
    type: "referenceField";
    sourceReferenceFieldName: string;
    referencedEntityName: string;
    referencedEntity: EntitySchema;
  };

export type ComputedTableColumnConfig = TableColumnBaseConfig & {
  type: "computed";
  computedValueName: string;
  computedValue: ComputedValueSchema;
};

export type LinkControlTableColumnConfig = TableColumnBaseConfig & {
  type: "linkControl";
  headerLabel: string;
  linkName: string;
  link: KeyedDefinition<RecordLinkSchema>;
};

export type TableOperationControlBaseConfig = {
  bindingName: string;
  entity?: EntitySchema;
  operation?: EntityOperationPresentationConfig;
  label: string;
  variant: TableOperationControlVariant;
  disabled: boolean;
  disabledReason?: string;
};

export type StaticTableOperationControlConfig = TableOperationControlBaseConfig & {
  type: "static";
};

export type TransitionTableOperationControlConfig = TableOperationControlBaseConfig & {
  type: "transition";
  transition: TransitionStateOperationConfig;
};

export type EditRecordTableOperationControlConfig = TableOperationControlBaseConfig & {
  type: "editRecord";
  target: TableEditRecordTargetConfig;
  editView: EditViewConfig;
};

export type TableOperationControlConfig =
  | StaticTableOperationControlConfig
  | TransitionTableOperationControlConfig
  | EditRecordTableOperationControlConfig;

export type TableEditRecordTargetConfig =
  | {
      kind: "row";
      entityName: string;
      entity: EntitySchema;
    }
  | {
      kind: "reference";
      fieldName: string;
      field: Extract<
        FieldSchema,
        {
          type: "reference";
        }
      >;
      entityName: string;
      entity: EntitySchema;
    };

export type EditViewConfig = {
  viewName: string;
  entityName: string;
  entity: EntitySchema;
  updateOperation?: EntityOperationPresentationConfig;
  fields: RecordFieldConfig[];
  union?: RecordUnionPresentationConfig;
};

export type { ResultOrderingConfig, ResultOrderingScopeConfig };

export type OperationControlTableColumnConfig = TableColumnBaseConfig & {
  type: "operationControl";
  headerLabel: string;
  controls: TableOperationControlConfig[];
  includeOrdering: boolean;
  ordering?: ResultOrderingConfig;
};

export type OrderingHandleTableColumnConfig = TableColumnBaseConfig & {
  type: "orderingHandle";
  headerLabel: string;
};

export type TableColumnConfig =
  | FieldTableColumnConfig
  | ReferenceFieldTableColumnConfig
  | ComputedTableColumnConfig
  | LinkControlTableColumnConfig
  | OperationControlTableColumnConfig
  | OrderingHandleTableColumnConfig;

export type CreateFieldConfig = {
  fieldName: string;
  field: FieldSchema;
  editor: FieldEditor;
  stateMachine?: StateMachineFieldConfig;
  visibleWhen?: FieldVisibilityConditionSchema;
  presentation?: FieldPresentationSchema;
};

export type CreateDefaultConfig = {
  fieldName: string;
  field: FieldSchema;
  value: CreateDefaultValueSchema;
};

export type ContextSelectionTargetConfig = {
  kind: "selectContext";
  contextName: string;
  record: "self";
};

export type RecordVariantFieldsPresentationConfig = {
  type: "fields";
  fields: RecordFieldConfig[];
};

export type RecordVariantContextLinkPresentationConfig = {
  type: "contextLink";
  labelFieldName: string;
  labelField: FieldSchema;
  target: ContextSelectionTargetConfig;
};

export type RecordVariantPresentationConfig = {
  variantValue: string;
  label: string;
  unionVariant: EntityUnionVariantSchema;
  presentation: RecordVariantFieldsPresentationConfig | RecordVariantContextLinkPresentationConfig;
};

export type RecordFallbackPresentationConfig = {
  label: string;
  unionVariant?: EntityUnionVariantSchema;
  presentation: RecordVariantFieldsPresentationConfig | RecordVariantContextLinkPresentationConfig;
};

export type RecordUnionPresentationConfig = {
  unionName: string;
  union: EntityUnionSchema;
  discriminatorFieldName: string;
  discriminatorField: Extract<
    FieldSchema,
    {
      type: "enum";
    }
  >;
  variants: RecordVariantPresentationConfig[];
  fallback?: RecordFallbackPresentationConfig;
};

export type CreateVariantPresentationConfig = {
  variantValue: string;
  label: string;
  unionVariant: EntityUnionVariantSchema;
  presentation: {
    type: "fields";
    fields: CreateFieldConfig[];
  };
};

export type CreateFallbackPresentationConfig = {
  label: string;
  unionVariant?: EntityUnionVariantSchema;
  presentation: {
    type: "fields";
    fields: CreateFieldConfig[];
  };
};

export type CreateUnionPresentationConfig = {
  unionName: string;
  union: EntityUnionSchema;
  discriminatorFieldName: string;
  discriminatorField: Extract<
    FieldSchema,
    {
      type: "enum";
    }
  >;
  variants: CreateVariantPresentationConfig[];
  fallback?: CreateFallbackPresentationConfig;
};

export type TableFooterSlotConfig = HomeSummarySlotConfig & {
  columnKey: string;
};

export type TreeAllowedChildVariantConfig = {
  variantValue: string;
  label: string;
  unionVariant: EntityUnionVariantSchema;
  placementValues?: Record<string, FieldVisibilityValue>;
};
export type TreeVariantBranchPolicyConfig = {
  discriminatorFieldName: string;
  discriminatorField: Extract<
    FieldSchema,
    {
      type: "enum";
    }
  >;
  leafVariantValues: string[];
  allowedChildVariantsByParentVariant: Record<string, TreeAllowedChildVariantConfig[]>;
};

export type TreeBranchPolicyConfig = {
  variants: TreeVariantBranchPolicyConfig;
};

export type TreeCompositionOperationConfig = {
  create?: {
    operationName: string;
    operation: EntityOperationPresentationConfig;
    effect: OperationHandlerEffectSchemaForKind<"create-tree-child">;
  };
  remove?: {
    operationName: string;
    operation: EntityOperationPresentationConfig;
    effect: OperationHandlerEffectSchemaForKind<"remove-tree-placement">;
  };
};

export type HomeResultConfig =
  | {
      type: "list";
      itemViewName: string;
      recordFields: RecordFieldConfig[];
      updateOperation?: EntityOperationPresentationConfig;
      deleteOperation?: EntityOperationPresentationConfig;
      transitionOperations: TransitionStateOperationConfig[];
      recordUnion?: RecordUnionPresentationConfig;
      ordering?: ResultOrderingConfig;
      presentation?: ListSummaryPresentationConfig;
    }
  | {
      type: "record";
      itemViewName: string;
      recordFields: RecordFieldConfig[];
      updateOperation?: EntityOperationPresentationConfig;
      deleteOperation?: EntityOperationPresentationConfig;
      transitionOperations: TransitionStateOperationConfig[];
      recordUnion?: RecordUnionPresentationConfig;
    }
  | {
      type: "table";
      tableViewName: string;
      columns: TableColumnConfig[];
      updateOperation?: EntityOperationPresentationConfig;
      ordering?: ResultOrderingConfig;
      footer?: TableFooterSlotConfig[];
    }
  | {
      type: "tree";
      relationshipName: string;
      relationship: ToManyRelationshipSchema;
      childFieldName: string;
      childField: Extract<
        FieldSchema,
        {
          type: "reference";
        }
      >;
      childEntityName: string;
      childEntity: EntitySchema;
      childDeleteOperation?: EntityOperationPresentationConfig;
      childUpdateOperation?: EntityOperationPresentationConfig;
      childItemViewName: string;
      childRecordFields: RecordFieldConfig[];
      childRecordUnion?: RecordUnionPresentationConfig;
      placementEntityName: string;
      placementEntity: EntitySchema;
      placementUpdateOperation?: EntityOperationPresentationConfig;
      ordering?: ResultOrderingConfig;
      branches?: TreeBranchPolicyConfig;
      composition?: TreeCompositionOperationConfig;
      maxDepth: number;
    };

export type HomeCollectionConfig = HomeCollectionShellConfig & {
  result: HomeResultConfig;
  detail?: HomeSelectedRecordDetailConfig;
};

export type HomeViewModel = {
  viewName: string;
  label: string;
  navigation: CollectionNavigationSchema;
  collection: HomeCollectionConfig;
  entityName: string;
  entity: EntitySchema;
  context?: HomeContextConfig;
  queryTabs: HomeQueryTabConfig[];
  defaultQueryName: string;
  result: HomeResultConfig;
  operations: HomeOperationConfig[];
};

export type HomeScreenCollectionSectionModel = {
  id: string;
  type: "collection";
  label: string;
  viewName: string;
  collection: HomeCollectionConfig;
};

export type HomeScreenSectionModel = HomeScreenCollectionSectionModel;

type HomeScreenLayoutModelBase = {
  type: "stack";
  sections: HomeScreenSectionModel[];
};

export type HomeScreenLayoutModel = HomeScreenLayoutModelBase &
  (
    | {
        surface: "constrained";
        width: ScreenLayoutWidthSchema;
      }
    | {
        surface: "full";
        width?: never;
      }
  );

export type HomeScreenModel = {
  screenName: string;
  type: "workspace";
  label: string;
  path?: string;
  access?: ScreenAccessRequirement;
  navigation: {
    primary: boolean;
  };
  layout: HomeScreenLayoutModel;
};
export function selectPrimaryCollectionModels(schema: AppSchema): HomeViewModel[] {
  return selectCollectionModels(schema).filter((model) => model.navigation.primary);
}

export function selectPrimaryScreenModels(schema: AppSchema): HomeScreenModel[] {
  const modelsByScreenName = new Map(
    selectScreenModels(schema).map((model) => [model.screenName, model]),
  );
  return selectPrimaryScreenNames(schema).flatMap((screenName) => {
    const model = modelsByScreenName.get(screenName);
    return model === undefined ? [] : [model];
  });
}

export function selectScreenModelByPath(
  schema: AppSchema,
  path: string,
): HomeScreenModel | undefined {
  return selectScreenModels(schema).find((model) => model.path === path);
}
export function selectScreenModels(schema: AppSchema): HomeScreenModel[] {
  const collectionModelsByViewName = new Map(
    selectCollectionModels(schema).map((model) => [model.viewName, model]),
  );
  const orderedPrimaryScreenNames = selectPrimaryScreenNames(schema);
  const primaryScreenNames = new Set(orderedPrimaryScreenNames);
  return assignScreenModelPaths(
    schema.screens.flatMap((screen) =>
      screen.type === "workspace"
        ? [
            selectScreenModel(
              schema,
              screen.key,
              screen,
              primaryScreenNames.has(screen.key),
              collectionModelsByViewName,
            ),
          ]
        : [],
    ),
    selectImplicitRootScreenName(schema, orderedPrimaryScreenNames),
  );
}

function selectPrimaryScreenNames(schema: AppSchema): string[] {
  if (schema.navigation?.groups !== undefined) {
    return schema.navigation.groups.flatMap((group) =>
      flattenAppNavigationScreenKeys(group.screens),
    );
  }
  return schema.navigation?.primaryScreens === undefined
    ? schema.screens.map(({ key }) => key)
    : flattenAppNavigationScreenKeys(schema.navigation.primaryScreens);
}
export function selectCollectionModels(schema: AppSchema): HomeViewModel[] {
  const viewEntries: Array<[string, ViewSchema]> = schema.views.map((view) => [view.key, view]);
  const collectionViewEntries = viewEntries.filter(
    (entry): entry is [string, CollectionViewSchema] => entry[1].type === "collection",
  );
  return collectionViewEntries.map(([viewName, collectionView]) => {
    const entity = schema.entities.find((definition) => definition.key === collectionView.entity)!;
    if (!entity) {
      throw new Error(`Missing entity "${collectionView.entity}".`);
    }

    const collection = selectHomeCollection(schema, viewEntries, collectionView, entity);

    return {
      viewName,
      label: collectionView.label,
      navigation: {
        primary: collectionView.navigation?.primary ?? true,
      },
      collection,
      entityName: collection.entityName,
      entity: collection.entity,
      ...(collection.context === undefined ? {} : { context: collection.context }),
      queryTabs: collection.queries.tabs,
      defaultQueryName: collection.queries.defaultQueryName,
      result: collection.result,
      operations: collection.operations,
    };
  });
}

function selectScreenModel(
  schema: AppSchema,
  screenName: string,
  screen: WorkspaceScreenSchema,
  primary: boolean,
  collectionModelsByViewName: Map<string, HomeViewModel>,
): HomeScreenModel {
  const sections = screen.layout.sections.map((section) => {
    const collectionModel = collectionModelsByViewName.get(section.view);

    if (!collectionModel) {
      throw new Error(`Missing collection view model "${section.view}".`);
    }

    const detail =
      section.detail === undefined
        ? undefined
        : selectHomeSelectedRecordDetail(
            schema,
            section.detail,
            collectionModel.entityName,
            collectionModel.entity,
          );
    const collection = selectScreenSectionCollection(
      collectionModel.collection,
      section.query,
      detail,
    );

    return {
      id: section.id,
      type: section.type,
      label: section.label ?? collectionModel.label,
      viewName: section.view,
      collection,
    };
  });

  return {
    screenName,
    type: screen.type,
    label: screen.label,
    ...(screen.path === undefined ? {} : { path: screen.path }),
    ...(screen.access === undefined ? {} : { access: screen.access }),
    navigation: {
      primary,
    },
    layout:
      screen.layout.surface === "full"
        ? { type: screen.layout.type, surface: screen.layout.surface, sections }
        : {
            type: screen.layout.type,
            surface: screen.layout.surface,
            width: screen.layout.width,
            sections,
          },
  };
}

function selectScreenSectionCollection(
  collection: HomeCollectionConfig,
  queryName: string | undefined,
  detail: HomeSelectedRecordDetailConfig | undefined,
): HomeCollectionConfig {
  if (queryName === undefined && detail === undefined) {
    return collection;
  }

  const selectedCollection =
    detail === undefined
      ? collection
      : {
          ...collection,
          detail,
        };

  if (queryName === undefined) {
    return selectedCollection;
  }

  const query = selectedCollection.queries.tabs.find((tab) => tab.queryName === queryName);
  if (!query) {
    throw new Error(`Missing screen section query "${queryName}".`);
  }

  return {
    ...selectedCollection,
    queries: {
      tabs: [query],
      defaultQueryName: queryName,
      defaultTab: query,
    },
  };
}

function assignScreenModelPaths(
  models: HomeScreenModel[],
  rootScreenName: string | undefined,
): HomeScreenModel[] {
  if (models.some((model) => model.path === "/")) {
    return models;
  }
  return models.map((model) =>
    model.screenName === rootScreenName ? { ...model, path: "/" } : model,
  );
}

function selectImplicitRootScreenName(
  schema: AppSchema,
  orderedPrimaryScreenNames: string[],
): string | undefined {
  if (schema.screens.some((screen) => screen.path === "/")) {
    return undefined;
  }

  const screensByName = new Map(schema.screens.map((screen) => [screen.key, screen]));
  return orderedPrimaryScreenNames.find(
    (screenName) => screensByName.get(screenName)?.path === undefined,
  );
}

function selectHomeCollection(
  schema: AppSchema,
  viewEntries: Array<[string, ViewSchema]>,
  collectionView: CollectionViewSchema,
  entity: EntitySchema,
): HomeCollectionConfig {
  const shell = selectHomeCollectionShell(schema, viewEntries, collectionView, entity);

  return {
    ...shell,
    result: selectHomeResultModel(schema, collectionView, entity),
  };
}
