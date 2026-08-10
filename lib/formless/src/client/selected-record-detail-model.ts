import { parseEntityOperationKey } from "@dpeek/formless-schema";
import type {
  AppSchema,
  EntitySchema,
  QueryExpression,
  SelectedRecordDetailSchema,
  ToManyRelationshipSchema,
} from "@dpeek/formless-schema";
import { selectRecordResultModel, type RecordResultModel } from "./list-result-model.ts";
import {
  selectAvailableEntityOperations,
  type EntityOperationPresentationConfig,
} from "./operation-presentation-model.ts";
import { selectTableResultModel } from "./table-model.ts";
import type { TableCollectionResultModel } from "./collection-result-model.ts";

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
  operations: HomeSelectedRecordDetailOperationConfig[];
};

export type HomeSelectedRecordDetailSectionConfig =
  | HomeSelectedRecordDetailRecordSectionConfig
  | HomeSelectedRecordDetailRelationshipSectionConfig;

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
          ...(tableResult.deleteOperation === undefined
            ? {}
            : { deleteOperation: tableResult.deleteOperation }),
          transitionOperations: tableResult.transitionOperations,
          ...(tableResult.ordering === undefined ? {} : { ordering: tableResult.ordering }),
        },
        operations: (section.operations ?? []).map((binding) =>
          selectHomeSelectedRecordDetailOperation(schema, binding, entityName),
        ),
      };
    }),
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
