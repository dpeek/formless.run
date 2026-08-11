import { isFieldItemViewSchema, parseEntityOperationKey } from "@dpeek/formless-schema";
import type {
  AppSchema,
  EntitySchema,
  FieldItemViewSchema,
  KeyedDefinition,
  QueryExpression,
  RecordLinkSchema,
  SelectedRecordDetailSchema,
  SelectedRecordRelationshipHierarchyOperationBindingSchema,
  SelectedRecordRelationshipHierarchyRelationshipSchema,
  ToManyRelationshipSchema,
} from "@dpeek/formless-schema";
import { selectRecordResultModel, type RecordResultModel } from "./list-result-model.ts";
import {
  selectAvailableEntityOperations,
  type EntityOperationPresentationConfig,
} from "./operation-presentation-model.ts";
import { selectTableResultModel } from "./table-model.ts";
import type { TableCollectionResultModel } from "./collection-result-model.ts";
import { selectHomeCreateOperation, type HomeOperationConfig } from "./collection-shell-model.ts";

export type HomeSelectedRecordDetailOperationConfig = {
  bindingName: string;
  label: string;
  operation: EntityOperationPresentationConfig;
  placement: "heading";
};

export type HomeSelectedRecordDetailRecordSectionConfig = {
  id: string;
  type: "record";
  label?: string;
  result: RecordResultModel;
};

export type HomeSelectedRecordDetailRelationshipSectionConfig = {
  id: string;
  type: "relationship";
  label?: string;
  relationshipName: string;
  relationship: ToManyRelationshipSchema;
  entityName: string;
  entity: EntitySchema;
  queryName: string;
  query: QueryExpression;
  result: TableCollectionResultModel;
  createAction?: Extract<HomeOperationConfig, { type: "create" }>;
  operations: HomeSelectedRecordDetailOperationConfig[];
};

export type HomeSelectedRecordRelationshipHierarchyOperationConfig = {
  bindingName: string;
  label: string;
  operation: EntityOperationPresentationConfig;
};

export type HomeSelectedRecordRelationshipHierarchyCreateActionConfig = Extract<
  HomeOperationConfig,
  { type: "create" }
> & {
  contextName: string;
};

export type HomeSelectedRecordRelationshipHierarchyNodeConfig = {
  entityName: string;
  entity: EntitySchema;
  itemViewName: string;
  itemView: FieldItemViewSchema;
  result: RecordResultModel;
  links: KeyedDefinition<RecordLinkSchema>[];
  operations: HomeSelectedRecordRelationshipHierarchyOperationConfig[];
  relationships: HomeSelectedRecordRelationshipHierarchyRelationshipConfig[];
};

export type HomeSelectedRecordRelationshipHierarchyRelationshipConfig =
  HomeSelectedRecordRelationshipHierarchyNodeConfig & {
    id: string;
    label?: string;
    relationshipName: string;
    relationship: ToManyRelationshipSchema;
    createAction?: HomeSelectedRecordRelationshipHierarchyCreateActionConfig;
  };

export type HomeSelectedRecordDetailRelationshipHierarchySectionConfig =
  HomeSelectedRecordRelationshipHierarchyNodeConfig & {
    id: string;
    type: "relationshipHierarchy";
    label?: string;
  };

export type HomeSelectedRecordDetailSectionConfig =
  | HomeSelectedRecordDetailRecordSectionConfig
  | HomeSelectedRecordDetailRelationshipSectionConfig
  | HomeSelectedRecordDetailRelationshipHierarchySectionConfig;

export type HomeSelectedRecordDetailConfig = {
  type: "selectedRecord";
  contextName: string;
  entityName: string;
  entity: EntitySchema;
  sections: HomeSelectedRecordDetailSectionConfig[];
};

export function selectHomeSelectedRecordDetail(
  schema: AppSchema,
  detail: SelectedRecordDetailSchema,
  entityName: string,
  entity: EntitySchema,
): HomeSelectedRecordDetailConfig {
  return {
    type: detail.type,
    contextName: detail.context,
    entityName,
    entity,
    sections: detail.sections.map((section): HomeSelectedRecordDetailSectionConfig => {
      if (section.type === "record") {
        return {
          id: section.id,
          type: section.type,
          ...(section.label === undefined ? {} : { label: section.label }),
          result: selectRecordResultModel(
            schema,
            { type: "record", itemView: section.itemView },
            entityName,
            entity,
          ),
        };
      }

      if (section.type === "relationshipHierarchy") {
        return {
          id: section.id,
          type: section.type,
          ...(section.label === undefined ? {} : { label: section.label }),
          ...selectHomeSelectedRecordRelationshipHierarchyNode(schema, section, entityName, entity),
        };
      }

      const relationship = schema.relationships?.find(
        (definition) => definition.key === section.relationship,
      );
      if (relationship?.kind !== "toMany") {
        throw new Error(`Missing selected-record relationship "${section.relationship}".`);
      }
      const targetEntity = schema.entities.find(
        (definition) => definition.key === relationship.to.entity,
      );
      if (!targetEntity) {
        throw new Error(`Missing selected-record entity "${relationship.to.entity}".`);
      }
      const query = schema.queries.find((definition) => definition.key === section.query);
      if (!query) {
        throw new Error(`Missing selected-record query "${section.query}".`);
      }
      const tableView = schema.tableViews.find(
        (definition) => definition.key === section.result.tableView,
      );
      if (!tableView) {
        throw new Error(`Missing selected-record table view "${section.result.tableView}".`);
      }
      const tableResult = selectTableResultModel(
        schema,
        tableView,
        relationship.to.entity,
        targetEntity,
      );

      return {
        id: section.id,
        type: section.type,
        ...(section.label === undefined ? {} : { label: section.label }),
        relationshipName: section.relationship,
        relationship,
        entityName: relationship.to.entity,
        entity: targetEntity,
        queryName: section.query,
        query: query.expression,
        result: {
          type: "table",
          tableViewName: section.result.tableView,
          columns: tableResult.columns,
          ...(tableResult.updateOperation === undefined
            ? {}
            : { updateOperation: tableResult.updateOperation }),
          ...(tableResult.ordering === undefined ? {} : { ordering: tableResult.ordering }),
        },
        ...(section.createAction === undefined
          ? {}
          : {
              createAction: selectHomeCreateOperation(
                schema,
                section.createAction.createView,
                section.createAction.operation,
                section.createAction.label,
              ),
            }),
        operations: (section.operations ?? []).map((binding) =>
          selectHomeSelectedRecordDetailOperation(schema, binding, entityName),
        ),
      };
    }),
  };
}

function selectHomeSelectedRecordRelationshipHierarchyNode(
  schema: AppSchema,
  node: {
    itemView: string;
    links?: KeyedDefinition<RecordLinkSchema>[];
    operations?: SelectedRecordRelationshipHierarchyOperationBindingSchema[];
    relationships?: SelectedRecordRelationshipHierarchyRelationshipSchema[];
  },
  entityName: string,
  entity: EntitySchema,
): HomeSelectedRecordRelationshipHierarchyNodeConfig {
  const itemView = schema.itemViews.find((definition) => definition.key === node.itemView);
  if (!itemView) {
    throw new Error(`Missing selected-record hierarchy item view "${node.itemView}".`);
  }
  if (!isFieldItemViewSchema(itemView)) {
    throw new Error(`Selected-record hierarchy item view "${node.itemView}" must use fields.`);
  }
  if (itemView.entity !== entityName) {
    throw new Error(
      `Selected-record hierarchy item view "${node.itemView}" must use entity "${entityName}".`,
    );
  }

  return {
    entityName,
    entity,
    itemViewName: node.itemView,
    itemView,
    result: selectRecordResultModel(
      schema,
      { type: "record", itemView: node.itemView },
      entityName,
      entity,
    ),
    links: node.links ?? [],
    operations: (node.operations ?? []).map((binding) =>
      selectHomeSelectedRecordRelationshipHierarchyOperation(schema, binding, entityName),
    ),
    relationships: (node.relationships ?? []).map((relationship) =>
      selectHomeSelectedRecordRelationshipHierarchyRelationship(schema, relationship, entityName),
    ),
  };
}

function selectHomeSelectedRecordRelationshipHierarchyRelationship(
  schema: AppSchema,
  declaration: SelectedRecordRelationshipHierarchyRelationshipSchema,
  sourceEntityName: string,
): HomeSelectedRecordRelationshipHierarchyRelationshipConfig {
  const relationship = schema.relationships?.find(
    (definition) => definition.key === declaration.relationship,
  );
  if (relationship?.kind !== "toMany") {
    throw new Error(
      `Missing selected-record hierarchy relationship "${declaration.relationship}".`,
    );
  }
  if (relationship.from.entity !== sourceEntityName) {
    throw new Error(
      `Selected-record hierarchy relationship "${declaration.relationship}" must start from entity "${sourceEntityName}".`,
    );
  }

  const targetEntity = schema.entities.find(
    (definition) => definition.key === relationship.to.entity,
  );
  if (!targetEntity) {
    throw new Error(`Missing selected-record hierarchy entity "${relationship.to.entity}".`);
  }
  const node = selectHomeSelectedRecordRelationshipHierarchyNode(
    schema,
    declaration,
    relationship.to.entity,
    targetEntity,
  );
  const createAction =
    declaration.createAction === undefined
      ? undefined
      : selectHomeSelectedRecordRelationshipHierarchyCreateAction(
          schema,
          declaration.createAction,
          relationship,
        );

  return {
    id: declaration.id,
    ...(declaration.label === undefined ? {} : { label: declaration.label }),
    relationshipName: declaration.relationship,
    relationship,
    ...(createAction === undefined ? {} : { createAction }),
    ...node,
  };
}

function selectHomeSelectedRecordRelationshipHierarchyOperation(
  schema: AppSchema,
  binding: SelectedRecordRelationshipHierarchyOperationBindingSchema,
  entityName: string,
): HomeSelectedRecordRelationshipHierarchyOperationConfig {
  const { entityKey, operationKey } = parseEntityOperationKey(
    "Selected-record relationship-hierarchy operation binding",
    binding.operation,
  );
  const entity = schema.entities.find((definition) => definition.key === entityKey);
  const operation =
    entityKey === entityName && entity !== undefined
      ? selectAvailableEntityOperations(entityKey, entity, "record").find(
          (candidate) => candidate.operationName === operationKey,
        )
      : undefined;
  if (!operation) {
    throw new Error(
      `Missing selected-record relationship-hierarchy operation binding "${binding.operation}".`,
    );
  }

  return {
    bindingName: operation.canonicalKey,
    label: binding.label ?? operation.label,
    operation,
  };
}

function selectHomeSelectedRecordRelationshipHierarchyCreateAction(
  schema: AppSchema,
  binding: NonNullable<SelectedRecordRelationshipHierarchyRelationshipSchema["createAction"]>,
  relationship: ToManyRelationshipSchema,
): HomeSelectedRecordRelationshipHierarchyCreateActionConfig {
  const createAction = selectHomeCreateOperation(
    schema,
    binding.createView,
    binding.operation,
    binding.label,
  );
  if (createAction.entityName !== relationship.to.entity) {
    throw new Error(
      `Selected-record relationship-hierarchy create action must use entity "${relationship.to.entity}".`,
    );
  }
  const contextDefaults = createAction.defaults.filter(
    (defaultConfig) => defaultConfig.value.kind === "context",
  );
  const attachmentDefault = contextDefaults.find(
    (defaultConfig) => defaultConfig.fieldName === relationship.to.field,
  );
  if (attachmentDefault?.value.kind !== "context" || contextDefaults.length !== 1) {
    throw new Error(
      `Selected-record relationship-hierarchy create view "${binding.createView}" must default relationship field "${relationship.to.entity}.${relationship.to.field}" from one context.`,
    );
  }

  return {
    ...createAction,
    contextName: attachmentDefault.value.name,
  };
}

function selectHomeSelectedRecordDetailOperation(
  schema: AppSchema,
  binding: NonNullable<
    Extract<SelectedRecordDetailSchema["sections"][number], { type: "relationship" }>["operations"]
  >[number],
  sourceEntityName: string,
): HomeSelectedRecordDetailOperationConfig {
  const { entityKey, operationKey } = parseEntityOperationKey(
    "Selected-record detail operation binding",
    binding.operation,
  );
  const entity = schema.entities.find((definition) => definition.key === entityKey);
  const operation =
    entityKey === sourceEntityName && entity !== undefined
      ? selectAvailableEntityOperations(entityKey, entity, "record").find(
          (candidate) => candidate.operationName === operationKey,
        )
      : undefined;
  if (!operation) {
    throw new Error(`Missing selected-record operation binding "${binding.operation}".`);
  }

  return {
    bindingName: operation.canonicalKey,
    label: binding.label ?? operation.label,
    operation,
    placement: binding.placement,
  };
}
