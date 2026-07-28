import type {
  AggregateSchema,
  AppSchema,
  CollectionContextPresentation,
  CollectionSummarySlotSchema,
  CollectionTableFooterSlotSchema,
  CollectionViewSchema,
  ComputedValueSchema,
  CountDisplaySchema,
  CreateViewSchema,
  EntitySchema,
  FieldSchema,
  ItemViewSchema,
  TableColumnFormat,
  ToManyRelationshipSchema,
  ViewSchema,
} from "@dpeek/formless-schema";
import { parseEntityOperationKey, type QueryExpression } from "@dpeek/formless-schema";
import {
  selectCommandOperationUi,
  type CommandOperationTargetCountConfig,
  type CommandOperationUiConfig,
} from "./command-operation-ui.ts";
import {
  selectAvailableEntityOperations,
  selectEntityOperationByKind,
  type EntityOperationPresentationConfig,
} from "./operation-presentation-model.ts";
import {
  selectCreateUnionPresentation,
  selectRecordUnionPresentation,
} from "./union-presentation-model.ts";
import {
  selectStateMachineField,
  selectTransitionStateOperations,
  type TransitionStateOperationConfig,
} from "./state-machine-model.ts";
import { selectAddressableRecordFieldConfig } from "./field-configs.ts";
import { humanizeFieldName } from "./view-labels.ts";
import type {
  CreateDefaultConfig,
  CreateFieldConfig,
  CreateUnionPresentationConfig,
  RecordFieldConfig,
  RecordUnionPresentationConfig,
} from "./views.ts";

export type HomeQueryTabConfig = {
  queryName: string;
  label: string;
  query: QueryExpression;
  count?: CountDisplaySchema;
};

export type HomeQueriesConfig = {
  tabs: HomeQueryTabConfig[];
  defaultQueryName: string;
  defaultTab: HomeQueryTabConfig;
};

export type HomeSummarySlotConfig = {
  type: "aggregate";
  key: string;
  aggregateName: string;
  aggregate: AggregateSchema;
  computedValues: Record<string, ComputedValueSchema>;
  label: string;
  suffix?: string;
  format: TableColumnFormat;
};

export type HomeContextNavigationGroupConfig = {
  label: string;
  queryName: string;
  query: QueryExpression;
  createOperation?: Extract<
    HomeOperationConfig,
    {
      type: "create";
    }
  >;
};
export type HomeContextNavigationConfig = {
  placement: "sidebar";
  groups: HomeContextNavigationGroupConfig[];
};

export type RelatedCollectionConfig = {
  relationshipName: string;
  relationship: ToManyRelationshipSchema;
  label: string;
  entityName: string;
  entity: EntitySchema;
  referenceFieldName: string;
};

export type HomeContextConfig = {
  name: string;
  label: string;
  entityName: string;
  entity: EntitySchema;
  queryName: string;
  query: QueryExpression;
  labelField: string;
  presentation: CollectionContextPresentation;
  navigation?: HomeContextNavigationConfig;
  relatedCollection?: RelatedCollectionConfig;
  createOperation?: Extract<
    HomeOperationConfig,
    {
      type: "create";
    }
  >;
  itemViewName?: string;
  recordFields?: RecordFieldConfig[];
  updateOperation?: EntityOperationPresentationConfig;
  deleteOperation?: EntityOperationPresentationConfig;
  transitionOperations: TransitionStateOperationConfig[];
  recordUnion?: RecordUnionPresentationConfig;
};

export type HomeOperationConfig =
  | {
      type: "create";
      label: string;
      entityName: string;
      entity: EntitySchema;
      operationName: string;
      operation: EntityOperationPresentationConfig;
      fields: CreateFieldConfig[];
      defaults: CreateDefaultConfig[];
      union?: CreateUnionPresentationConfig;
      enabled: boolean;
    }
  | {
      type: "command";
      label: string;
      entityName: string;
      operationName: string;
      operation: EntityOperationPresentationConfig;
      ui: CommandOperationUiConfig;
    };

export type HomeCollectionShellConfig = {
  entityName: string;
  entity: EntitySchema;
  context?: HomeContextConfig;
  queries: HomeQueriesConfig;
  operations: HomeOperationConfig[];
  updateOperation?: EntityOperationPresentationConfig;
  deleteOperation?: EntityOperationPresentationConfig;
  summary?: HomeSummarySlotConfig[];
};

export type { CommandOperationTargetCountConfig, CommandOperationUiConfig };

export function selectHomeCollectionShell(
  schema: AppSchema,
  viewEntries: Array<[string, ViewSchema]>,
  collectionView: CollectionViewSchema,
  entity: EntitySchema,
): HomeCollectionShellConfig {
  const queries = selectQueries(schema, collectionView);
  const summary = selectSummarySlots(schema, collectionView);
  const updateOperation = selectEntityOperationByKind(
    collectionView.entity,
    entity,
    "update",
    "record",
  );
  const deleteOperation = selectEntityOperationByKind(
    collectionView.entity,
    entity,
    "delete",
    "record",
  );
  const operations = selectHomeOperations(schema, viewEntries, collectionView, entity);

  return {
    entityName: collectionView.entity,
    entity,
    ...(collectionView.context === undefined
      ? {}
      : { context: selectContext(schema, viewEntries, collectionView) }),
    queries,
    operations,
    ...(updateOperation === undefined ? {} : { updateOperation }),
    ...(deleteOperation === undefined ? {} : { deleteOperation }),
    ...(summary.length === 0 ? {} : { summary }),
  };
}

export function selectRelatedCollectionModels(
  schema: AppSchema,
  entityName: string,
): RelatedCollectionConfig[] {
  return (schema.relationships ?? []).flatMap((relationship) => {
    if (relationship.kind !== "toMany" || relationship.from.entity !== entityName) {
      return [];
    }
    return [selectRelatedCollection(schema, relationship.key, relationship)];
  });
}
function selectRelatedCollection(
  schema: AppSchema,
  relationshipName: string,
  relationship: ToManyRelationshipSchema,
): RelatedCollectionConfig {
  const entity = schema.entities.find((definition) => definition.key === relationship.to.entity)!;
  if (!entity) {
    throw new Error(`Missing related entity "${relationship.to.entity}".`);
  }

  return {
    relationshipName,
    relationship,
    label: relationship.label ?? entity.label,
    entityName: relationship.to.entity,
    entity,
    referenceFieldName: relationship.to.field,
  };
}

function selectContext(
  schema: AppSchema,
  viewEntries: Array<[string, ViewSchema]>,
  collectionView: CollectionViewSchema,
): HomeContextConfig | undefined {
  if (!collectionView.context) {
    return undefined;
  }
  const context = collectionView.context;
  const contextEntity = schema.entities.find((definition) => definition.key === context.entity);
  const contextQuery = schema.queries.find((definition) => definition.key === context.query);
  const relationshipName = context.relationship;
  const relationship =
    relationshipName === undefined ? undefined : selectToManyRelationship(schema, relationshipName);
  const relatedCollection =
    relationshipName === undefined || relationship === undefined
      ? undefined
      : selectRelatedCollection(schema, relationshipName, relationship);
  if (!contextEntity) {
    throw new Error(`Missing context entity "${context.entity}".`);
  }
  if (!contextQuery) {
    throw new Error(`Missing context query "${context.query}".`);
  }
  const createOperation =
    context.createView === undefined
      ? undefined
      : selectCreateOperation(
          schema,
          viewEntries,
          context.createView,
          `Create ${contextEntity.label}`,
        );
  const itemViewName = context.itemView;
  const itemView =
    itemViewName === undefined
      ? undefined
      : schema.itemViews.find((definition) => definition.key === itemViewName)!;
  if (itemViewName !== undefined && itemView === undefined) {
    throw new Error(`Missing context item view "${itemViewName}".`);
  }

  const recordFields =
    itemView === undefined ? undefined : selectRecordFields(itemView, contextEntity);
  const recordUnion =
    itemView === undefined
      ? undefined
      : selectRecordUnionPresentation(schema, itemView, contextEntity);
  const updateOperation = selectEntityOperationByKind(
    collectionView.context.entity,
    contextEntity,
    "update",
    "record",
  );
  const deleteOperation = selectEntityOperationByKind(
    collectionView.context.entity,
    contextEntity,
    "delete",
    "record",
  );

  return {
    name: collectionView.context.name,
    label: contextQuery.label === "All" ? contextEntity.label : contextQuery.label,
    entityName: collectionView.context.entity,
    entity: contextEntity,
    queryName: collectionView.context.query,
    query: contextQuery.expression,
    labelField: collectionView.context.labelField,
    presentation: collectionView.context.presentation,
    ...(collectionView.context.navigation === undefined
      ? {}
      : {
          navigation: {
            placement: collectionView.context.navigation.placement,
            groups: collectionView.context.navigation.groups.map((group) => {
              const query = schema.queries.find((definition) => definition.key === group.query)!;
              if (!query) {
                throw new Error(`Missing context navigation query "${group.query}".`);
              }
              const createOperation =
                group.createView === undefined
                  ? undefined
                  : selectCreateOperation(
                      schema,
                      viewEntries,
                      group.createView,
                      createRootNavigationLabel(group.label),
                    );

              return {
                label: group.label,
                queryName: group.query,
                query: query.expression,
                ...(createOperation === undefined ? {} : { createOperation }),
              };
            }),
          },
        }),
    ...(relatedCollection === undefined ? {} : { relatedCollection }),
    ...(createOperation === undefined ? {} : { createOperation }),
    ...(updateOperation === undefined ? {} : { updateOperation }),
    ...(deleteOperation === undefined ? {} : { deleteOperation }),
    transitionOperations: selectTransitionStateOperations(
      collectionView.context.entity,
      contextEntity,
    ),
    ...(itemViewName === undefined
      ? {}
      : {
          itemViewName,
          recordFields,
          ...(recordUnion === undefined ? {} : { recordUnion }),
        }),
  };
}

function createRootNavigationLabel(groupLabel: string) {
  return `Create ${groupLabel.endsWith("s") ? groupLabel.slice(0, -1) : groupLabel}`;
}
export function selectToManyRelationship(schema: AppSchema, relationshipName: string) {
  const relationship = schema.relationships?.find(
    (definition) => definition.key === relationshipName,
  );
  if (!relationship) {
    throw new Error(`Missing relationship "${relationshipName}".`);
  }

  if (relationship.kind !== "toMany") {
    throw new Error(`Relationship "${relationshipName}" must be a toMany relationship.`);
  }

  return relationship;
}

function selectQueryTabs(
  schema: AppSchema,
  collectionView: CollectionViewSchema,
): HomeQueryTabConfig[] {
  return collectionView.queries.map((slot) => {
    const query = schema.queries.find((definition) => definition.key === slot.query)!;
    if (!query) {
      throw new Error(`Missing query "${slot.query}".`);
    }

    return {
      queryName: slot.query,
      label: slot.label ?? query.label,
      query: query.expression,
      ...(slot.count === undefined ? {} : { count: slot.count }),
    };
  });
}

function selectQueries(schema: AppSchema, collectionView: CollectionViewSchema): HomeQueriesConfig {
  const tabs = selectQueryTabs(schema, collectionView);
  const defaultTab = tabs.find((tab) => tab.queryName === collectionView.defaultQuery);

  if (!defaultTab) {
    throw new Error(`Missing default query "${collectionView.defaultQuery}".`);
  }

  return {
    tabs,
    defaultQueryName: collectionView.defaultQuery,
    defaultTab,
  };
}

function selectHomeOperations(
  schema: AppSchema,
  viewEntries: Array<[string, ViewSchema]>,
  collectionView: CollectionViewSchema,
  _entity: EntitySchema,
): HomeOperationConfig[] {
  const operations: HomeOperationConfig[] = [];

  for (const binding of collectionView.operations ?? []) {
    const operation = selectBoundCollectionOperation(schema, binding.operation);

    if (operation === undefined) {
      continue;
    }

    if (operation.operation.kind === "create") {
      const createOperation = selectCreateOperation(
        schema,
        viewEntries,
        binding.createView,
        binding.label,
        operation,
      );

      if (createOperation !== undefined) {
        operations.push(createOperation);
      }
      continue;
    }

    if (operation.operation.kind !== "command") {
      continue;
    }

    const label = binding.label ?? operation.label;

    operations.push({
      type: "command",
      label,
      entityName: operation.entityName,
      operationName: operation.operationName,
      operation,
      ui: selectCommandOperationUi(schema, label, operation.operation, binding.count),
    });
  }

  return operations;
}

function selectSummarySlots(
  schema: AppSchema,
  collectionView: CollectionViewSchema,
): HomeSummarySlotConfig[] {
  return (collectionView.summary ?? []).map((slot) =>
    selectSummarySlot(schema, collectionView, slot),
  );
}

function selectSummarySlot(
  schema: AppSchema,
  collectionView: CollectionViewSchema,
  slot: CollectionSummarySlotSchema,
): HomeSummarySlotConfig {
  const summarySlot = selectAggregateSlot(schema, slot);

  if (
    !collectionView.queries.some((querySlot) => querySlot.query === summarySlot.aggregate.query)
  ) {
    throw new Error(
      `Aggregate "${summarySlot.aggregateName}" query "${summarySlot.aggregate.query}" must belong to collection "${collectionView.label}".`,
    );
  }

  return summarySlot;
}

export function selectAggregateSlot(
  schema: AppSchema,
  slot: CollectionSummarySlotSchema | CollectionTableFooterSlotSchema,
): HomeSummarySlotConfig {
  const aggregate = schema.readModels?.aggregates?.find(
    (definition) => definition.key === slot.aggregate,
  );
  if (!aggregate) {
    throw new Error(`Missing aggregate "${slot.aggregate}".`);
  }

  return {
    type: "aggregate",
    key: `aggregate:${slot.aggregate}`,
    aggregateName: slot.aggregate,
    aggregate,
    computedValues: Object.fromEntries(
      (schema.readModels?.computedValues ?? []).map(({ key, ...definition }) => [key, definition]),
    ),
    label: slot.label ?? humanizeFieldName(slot.aggregate),
    ...(slot.suffix === undefined ? {} : { suffix: slot.suffix }),
    format: slot.format ?? "plain",
  };
}

function selectCreateOperation(
  schema: AppSchema,
  viewEntries: Array<[string, ViewSchema]>,
  createViewName: string | undefined,
  label?: string,
  operation?: EntityOperationPresentationConfig,
):
  | Extract<
      HomeOperationConfig,
      {
        type: "create";
      }
    >
  | undefined {
  if (createViewName === undefined) {
    throw new Error(`Missing create view for operation "${operation?.canonicalKey ?? "create"}".`);
  }

  const createView = viewEntries.find(([viewName]) => viewName === createViewName)?.[1];

  if (!createView || createView.type !== "create") {
    throw new Error(`Missing create view "${createViewName}".`);
  }
  const entity = schema.entities.find((definition) => definition.key === createView.entity)!;
  if (!entity) {
    throw new Error(`Missing create view entity "${createView.entity}".`);
  }
  const union = selectCreateUnionPresentation(schema, createView, entity);
  const createOperation =
    operation ?? selectEntityOperationByKind(createView.entity, entity, "create", "collection");

  if (createOperation === undefined) {
    return undefined;
  }

  if (
    createOperation.entityName !== createView.entity ||
    createOperation.operation.kind !== "create"
  ) {
    throw new Error(
      `Create view "${createViewName}" must bind a create operation for entity "${createView.entity}".`,
    );
  }

  return {
    type: "create",
    label: label ?? createOperation.label,
    entityName: createView.entity,
    entity,
    operationName: createOperation.operationName,
    operation: createOperation,
    fields: selectCreateFields(createView, entity),
    defaults: selectCreateDefaults(createView, entity),
    ...(union === undefined ? {} : { union }),
    enabled: true,
  };
}

function selectBoundCollectionOperation(
  schema: AppSchema,
  canonicalKey: string,
): EntityOperationPresentationConfig | undefined {
  const { entityKey: entityName, operationKey: operationName } = parseEntityOperationKey(
    "Collection operation binding",
    canonicalKey,
  );
  const entity = schema.entities.find((definition) => definition.key === entityName)!;
  const operation = entity?.operations?.find((definition) => definition.key === operationName);
  if (!entity || !operation) {
    throw new Error(`Missing operation binding "${canonicalKey}".`);
  }

  return selectAvailableEntityOperations(entityName, entity, "collection").find(
    (candidate) => candidate.operationName === operationName,
  );
}
function selectCreateFields(view: CreateViewSchema, entity: EntitySchema): CreateFieldConfig[] {
  return view.fields.flatMap((viewField) => {
    const fieldName = viewField.field;
    const selectedField = selectAddressableRecordFieldConfig(entity, fieldName);
    if (!selectedField.writable) {
      return [];
    }

    const stateMachine = selectStateMachineField(entity, fieldName);

    return [
      {
        fieldName,
        field: selectedField.field,
        editor: viewField.editor,
        ...(stateMachine === undefined ? {} : { stateMachine }),
        ...(viewField.visibleWhen === undefined ? {} : { visibleWhen: viewField.visibleWhen }),
        ...(viewField.presentation === undefined ? {} : { presentation: viewField.presentation }),
      },
    ];
  });
}

function selectCreateDefaults(view: CreateViewSchema, entity: EntitySchema): CreateDefaultConfig[] {
  return Object.entries(view.defaults ?? {}).map(([fieldName, defaultValue]) => ({
    fieldName,
    field: entity.fields.find((definition) => definition.key === fieldName)! as FieldSchema,
    value: defaultValue,
  }));
}

export function selectRecordFields(
  view: ItemViewSchema,
  entity: EntitySchema,
): RecordFieldConfig[] {
  return view.fields.map((viewField) => {
    const fieldName = viewField.field;
    const selectedField = selectAddressableRecordFieldConfig(entity, fieldName);
    const stateMachine =
      selectedField.fieldRef.kind === "value"
        ? selectStateMachineField(entity, fieldName)
        : undefined;

    return {
      fieldName,
      fieldRef: selectedField.fieldRef,
      field: selectedField.field,
      editor: selectedField.writable ? viewField.editor : "text",
      commit: selectedField.writable ? viewField.commit : "field-commit",
      writable: selectedField.writable,
      label: selectedField.label,
      ...(stateMachine === undefined ? {} : { stateMachine }),
      ...(viewField.visibleWhen === undefined ? {} : { visibleWhen: viewField.visibleWhen }),
      ...(selectedField.writable && viewField.presentation !== undefined
        ? { presentation: viewField.presentation }
        : {}),
    };
  });
}
