import type { AppSchema, CollectionViewSchema, EntitySchema } from "@dpeek/formless-schema";
import { selectRecordFields } from "./collection-shell-model.ts";
import { selectEntityOperationByKind } from "./operation-presentation-model.ts";
import { selectResultOrderingConfig } from "./result-ordering-model.ts";
import { selectTransitionStateOperations } from "./state-machine-model.ts";
import { selectRecordUnionPresentation } from "./union-presentation-model.ts";
import type { HomeResultConfig } from "./views.ts";
export type ListResultModel = Extract<
  HomeResultConfig,
  {
    type: "list";
  }
>;
export type RecordResultModel = Extract<
  HomeResultConfig,
  {
    type: "record";
  }
>;
export function selectListResultModel(
  schema: AppSchema,
  result: Extract<
    CollectionViewSchema["result"],
    {
      type: "list";
    }
  >,
  entityName: string,
  entity: EntitySchema,
): ListResultModel {
  const itemView = schema.itemViews.find((definition) => definition.key === result.itemView)!;
  if (!itemView) {
    throw new Error(`Missing item view "${result.itemView}".`);
  }
  const recordUnion = selectRecordUnionPresentation(schema, itemView, entity);
  const ordering = selectResultOrderingConfig(result.ordering, entity);
  const updateOperation = selectEntityOperationByKind(entityName, entity, "update", "record");
  const deleteOperation = selectEntityOperationByKind(entityName, entity, "delete", "record");

  return {
    type: "list",
    itemViewName: result.itemView,
    recordFields: selectRecordFields(itemView, entity),
    ...(updateOperation === undefined ? {} : { updateOperation }),
    ...(deleteOperation === undefined ? {} : { deleteOperation }),
    transitionOperations: selectTransitionStateOperations(entityName, entity),
    ...(recordUnion === undefined ? {} : { recordUnion }),
    ...(ordering === undefined ? {} : { ordering }),
  };
}
export function selectRecordResultModel(
  schema: AppSchema,
  result: Extract<
    CollectionViewSchema["result"],
    {
      type: "record";
    }
  >,
  entityName: string,
  entity: EntitySchema,
): RecordResultModel {
  const itemView = schema.itemViews.find((definition) => definition.key === result.itemView)!;
  if (!itemView) {
    throw new Error(`Missing item view "${result.itemView}".`);
  }
  const recordUnion = selectRecordUnionPresentation(schema, itemView, entity);
  const updateOperation = selectEntityOperationByKind(entityName, entity, "update", "record");
  const deleteOperation = selectEntityOperationByKind(entityName, entity, "delete", "record");

  return {
    type: "record",
    itemViewName: result.itemView,
    recordFields: selectRecordFields(itemView, entity),
    ...(updateOperation === undefined ? {} : { updateOperation }),
    ...(deleteOperation === undefined ? {} : { deleteOperation }),
    transitionOperations: selectTransitionStateOperations(entityName, entity),
    ...(recordUnion === undefined ? {} : { recordUnion }),
  };
}
