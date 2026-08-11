import { parseOptionalResultOrdering, resultOrderingsAreEquivalent } from "./schema-ordering.ts";
import {
  assertExactKeys,
  definitionsToRecord,
  isRecord,
  parseOptionalNonEmptyString,
  parseRequiredNonEmptyString,
} from "./schema-parse-helpers.ts";
import { isOperationHandlerEffectForKind } from "./schema-operation-execution.ts";
import { parseEntityOperationKey } from "./schema-operations.ts";
import { parseOptionalTableColumnFormat, tableFooterColumnName } from "./schema-table-views.ts";
import { parseFieldVisibilityValue } from "./schema-view-fields.ts";
import type {
  AggregateSchema,
  CollectionContextSchema,
  CollectionResultSchema,
  CollectionTableFooterSlotSchema,
  CollectionViewQuerySlotSchema,
  EntitySchema,
  EntityUnionSchema,
  FieldVisibilityValue,
  ItemViewSchema,
  RelationshipSchema,
  TableViewSchema,
  TreeBranchActionSchema,
  TreeBranchChildVariantSchema,
  TreeBranchPolicySchema,
  TreeBranchVariantPolicySchema,
  TreeCompositionOperationSchema,
} from "./types.ts";

export function parseCollectionResult(
  viewName: string,
  entityName: string,
  entity: EntitySchema,
  value: unknown,
  entities: Record<string, EntitySchema>,
  itemViews: Record<string, ItemViewSchema>,
  tableViews: Record<string, TableViewSchema>,
  querySlots: CollectionViewQuerySlotSchema[],
  collectionContext: CollectionContextSchema | undefined,
  relationships: Record<string, RelationshipSchema> | undefined,
  aggregates: Record<string, AggregateSchema>,
  unions: Record<string, EntityUnionSchema> | undefined,
): CollectionResultSchema {
  if (!isRecord(value)) {
    throw new Error(`Collection view "${viewName}" result must be an object.`);
  }

  if (value.type === "list") {
    assertExactKeys(
      `Collection view "${viewName}" result`,
      value,
      ["type", "itemView"],
      ["ordering"],
    );

    if (typeof value.itemView !== "string" || value.itemView.trim() === "") {
      throw new Error(`Collection view "${viewName}" result itemView must be a non-empty string.`);
    }

    const itemView = itemViews[value.itemView];
    if (!itemView) {
      throw new Error(
        `Collection view "${viewName}" result references unknown item view "${value.itemView}".`,
      );
    }

    if (itemView.entity !== entityName) {
      throw new Error(
        `Collection view "${viewName}" result item view "${value.itemView}" must use entity "${entityName}".`,
      );
    }

    const ordering = parseOptionalResultOrdering(
      `Collection view "${viewName}" result ordering`,
      value.ordering,
      entityName,
      entity,
    );

    return {
      type: "list",
      itemView: value.itemView,
      ...(ordering === undefined ? {} : { ordering }),
    };
  }

  if (value.type === "record") {
    assertExactKeys(`Collection view "${viewName}" result`, value, ["type", "itemView"]);

    if (typeof value.itemView !== "string" || value.itemView.trim() === "") {
      throw new Error(`Collection view "${viewName}" result itemView must be a non-empty string.`);
    }

    const itemView = itemViews[value.itemView];
    if (!itemView) {
      throw new Error(
        `Collection view "${viewName}" result references unknown item view "${value.itemView}".`,
      );
    }

    if (itemView.entity !== entityName) {
      throw new Error(
        `Collection view "${viewName}" result item view "${value.itemView}" must use entity "${entityName}".`,
      );
    }

    return {
      type: "record",
      itemView: value.itemView,
    };
  }

  if (value.type === "table") {
    assertExactKeys(
      `Collection view "${viewName}" result`,
      value,
      ["type", "tableView"],
      ["footer", "ordering"],
    );

    if (typeof value.tableView !== "string" || value.tableView.trim() === "") {
      throw new Error(`Collection view "${viewName}" result tableView must be a non-empty string.`);
    }

    const tableView = tableViews[value.tableView];
    if (!tableView) {
      throw new Error(
        `Collection view "${viewName}" result references unknown table view "${value.tableView}".`,
      );
    }

    if (tableView.entity !== entityName) {
      throw new Error(
        `Collection view "${viewName}" result table view "${value.tableView}" must use entity "${entityName}".`,
      );
    }

    const ordering = parseOptionalResultOrdering(
      `Collection view "${viewName}" result ordering`,
      value.ordering,
      entityName,
      entity,
    );

    if (
      ordering !== undefined &&
      tableView.ordering !== undefined &&
      !resultOrderingsAreEquivalent(ordering, tableView.ordering)
    ) {
      throw new Error(
        `Collection view "${viewName}" result ordering conflicts with table view "${value.tableView}" ordering.`,
      );
    }

    const footer = parseCollectionTableFooterSlots(
      viewName,
      entityName,
      value.footer,
      tableView,
      querySlots,
      aggregates,
    );

    return {
      type: "table",
      tableView: value.tableView,
      ...(ordering === undefined ? {} : { ordering }),
      ...(footer === undefined ? {} : { footer }),
    };
  }

  if (value.type === "tree") {
    assertExactKeys(
      `Collection view "${viewName}" result`,
      value,
      ["type", "relationship", "childField", "childItemView"],
      ["ordering", "branches", "composition", "maxDepth"],
    );

    if (!collectionContext) {
      throw new Error(`Collection view "${viewName}" result tree requires a collection context.`);
    }

    const relationshipName = parseRequiredNonEmptyString(
      `Collection view "${viewName}" result relationship`,
      value.relationship,
    );
    const relationship = relationships?.[relationshipName];

    if (!relationship) {
      throw new Error(
        `Collection view "${viewName}" result references unknown relationship "${relationshipName}".`,
      );
    }

    if (relationship.kind !== "toMany") {
      throw new Error(
        `Collection view "${viewName}" result relationship "${relationshipName}" must be a toMany relationship.`,
      );
    }

    if (relationship.from.entity !== collectionContext.entity) {
      throw new Error(
        `Collection view "${viewName}" result relationship "${relationshipName}" must start from context entity "${collectionContext.entity}".`,
      );
    }

    if (relationship.to.entity !== entityName) {
      throw new Error(
        `Collection view "${viewName}" result relationship "${relationshipName}" must target collection entity "${entityName}".`,
      );
    }

    const childFieldName = parseRequiredNonEmptyString(
      `Collection view "${viewName}" result childField`,
      value.childField,
    );
    const childField = definitionsToRecord(entity.fields)[childFieldName];
    if (!childField) {
      throw new Error(
        `Collection view "${viewName}" result childField references unknown field "${entityName}.${childFieldName}".`,
      );
    }

    if (childField.type !== "reference") {
      throw new Error(`Collection view "${viewName}" result childField must be a reference field.`);
    }

    if (childField.to !== collectionContext.entity) {
      throw new Error(
        `Collection view "${viewName}" result childField must reference context entity "${collectionContext.entity}".`,
      );
    }

    const childItemViewName = parseRequiredNonEmptyString(
      `Collection view "${viewName}" result childItemView`,
      value.childItemView,
    );
    const childItemView = itemViews[childItemViewName];

    if (!childItemView) {
      throw new Error(
        `Collection view "${viewName}" result references unknown child item view "${childItemViewName}".`,
      );
    }

    if (!entities[childField.to]) {
      throw new Error(`Missing child entity "${childField.to}".`);
    }

    if (childItemView.entity !== childField.to) {
      throw new Error(
        `Collection view "${viewName}" result child item view "${childItemViewName}" must use entity "${childField.to}".`,
      );
    }

    const maxDepth = parseOptionalTreeMaxDepth(
      `Collection view "${viewName}" result maxDepth`,
      value.maxDepth,
    );
    const ordering = parseOptionalResultOrdering(
      `Collection view "${viewName}" result ordering`,
      value.ordering,
      entityName,
      entity,
    );
    const branches = parseOptionalTreeBranchPolicy(
      `Collection view "${viewName}" result branches`,
      value.branches,
      childItemViewName,
      childItemView,
      unions,
      entity,
      new Set([
        relationship.to.field,
        childFieldName,
        ...(ordering === undefined ? [] : [ordering.field]),
      ]),
    );
    const composition = parseOptionalTreeCompositionActions(
      `Collection view "${viewName}" result composition`,
      value.composition,
      entityName,
      entity,
      relationshipName,
      childFieldName,
    );

    return {
      type: "tree",
      relationship: relationshipName,
      childField: childFieldName,
      childItemView: childItemViewName,
      ...(ordering === undefined ? {} : { ordering }),
      ...(branches === undefined ? {} : { branches }),
      ...(composition === undefined ? {} : { composition }),
      ...(maxDepth === undefined ? {} : { maxDepth }),
    };
  }

  throw new Error(
    `Collection view "${viewName}" result type must be "list", "record", "table", or "tree".`,
  );
}

function parseOptionalTreeMaxDepth(context: string, value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${context} must be a non-negative integer.`);
  }

  return value;
}

function parseOptionalTreeBranchPolicy(
  context: string,
  value: unknown,
  childItemViewName: string,
  childItemView: ItemViewSchema,
  unions: Record<string, EntityUnionSchema> | undefined,
  placementEntity: EntitySchema,
  reservedPlacementFieldNames: Set<string>,
): TreeBranchPolicySchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["variants"]);

  if (childItemView.union === undefined) {
    throw new Error(
      `${context} requires child item view "${childItemViewName}" to define a union.`,
    );
  }

  const union = unions?.[childItemView.union];

  if (!union) {
    throw new Error(
      `${context} references missing child item view union "${childItemView.union}".`,
    );
  }

  return {
    variants: parseTreeBranchVariantPolicy(
      `${context} variants`,
      value.variants,
      union,
      placementEntity,
      reservedPlacementFieldNames,
    ),
  };
}

function parseTreeBranchVariantPolicy(
  context: string,
  value: unknown,
  union: EntityUnionSchema,
  placementEntity: EntitySchema,
  reservedPlacementFieldNames: Set<string>,
): Record<string, TreeBranchVariantPolicySchema> {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const entries = Object.entries(value);

  if (entries.length === 0) {
    throw new Error(`${context} must not be empty.`);
  }

  return Object.fromEntries(
    entries.map(([variantName, policy]) => {
      if (variantName.trim() === "") {
        throw new Error(`${context} variant keys must be non-empty strings.`);
      }
      if (definitionsToRecord(union.variants)[variantName] === undefined) {
        throw new Error(
          `${context} variant "${variantName}" must match a variant in union "${union.entity}.${union.discriminator}".`,
        );
      }

      return [
        variantName,
        parseTreeBranchVariantPolicyValue(
          `${context} variant "${variantName}"`,
          policy,
          union,
          placementEntity,
          reservedPlacementFieldNames,
        ),
      ];
    }),
  );
}

function parseTreeBranchVariantPolicyValue(
  context: string,
  value: unknown,
  union: EntityUnionSchema,
  placementEntity: EntitySchema,
  reservedPlacementFieldNames: Set<string>,
): TreeBranchVariantPolicySchema {
  if (value === "leaf") {
    return value;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} action must be "leaf" or an object.`);
  }

  assertExactKeys(context, value, [], ["action", "children"]);

  if (value.action === undefined && value.children === undefined) {
    throw new Error(`${context} must include "action" or "children".`);
  }

  const action = parseOptionalTreeBranchAction(`${context} action`, value.action);
  const children = parseOptionalTreeBranchChildren(
    `${context} children`,
    value.children,
    union,
    placementEntity,
    reservedPlacementFieldNames,
  );

  return {
    ...(action === undefined ? {} : { action }),
    ...(children === undefined ? {} : { children }),
  };
}

function parseOptionalTreeBranchAction(
  context: string,
  value: unknown,
): TreeBranchActionSchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "leaf") {
    throw new Error(`${context} must be "leaf".`);
  }

  return value;
}

function parseOptionalTreeBranchChildren(
  context: string,
  value: unknown,
  union: EntityUnionSchema,
  placementEntity: EntitySchema,
  reservedPlacementFieldNames: Set<string>,
): TreeBranchChildVariantSchema[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  if (value.length === 0) {
    throw new Error(`${context} must not be empty.`);
  }

  const seen = new Set<string>();

  return value.map((childVariant, index) => {
    const childContext =
      typeof childVariant === "string" ? context : `${context} item ${index + 1}`;
    const parsed = parseTreeBranchChildVariant(
      childContext,
      childVariant,
      union,
      placementEntity,
      reservedPlacementFieldNames,
    );
    const childVariantName = typeof parsed === "string" ? parsed : parsed.variant;

    if (seen.has(childVariantName)) {
      throw new Error(`${context} variant "${childVariantName}" must be unique.`);
    }

    seen.add(childVariantName);

    return parsed;
  });
}

function parseTreeBranchChildVariant(
  context: string,
  value: unknown,
  union: EntityUnionSchema,
  placementEntity: EntitySchema,
  reservedPlacementFieldNames: Set<string>,
): TreeBranchChildVariantSchema {
  if (typeof value === "string") {
    return parseTreeBranchChildVariantName(context, value, union);
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be a non-empty string or an object.`);
  }

  assertExactKeys(context, value, ["variant"], ["label", "placementValues"]);

  const variant = parseTreeBranchChildVariantName(`${context} variant`, value.variant, union);
  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const placementValues = parseOptionalTreeBranchChildPlacementValues(
    `${context} placementValues`,
    value.placementValues,
    placementEntity,
    reservedPlacementFieldNames,
  );

  return {
    variant,
    ...(label === undefined ? {} : { label }),
    ...(placementValues === undefined ? {} : { placementValues }),
  };
}

function parseTreeBranchChildVariantName(
  context: string,
  value: unknown,
  union: EntityUnionSchema,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }
  if (definitionsToRecord(union.variants)[value] === undefined) {
    throw new Error(
      `${context} variant "${value}" must match a variant in union "${union.entity}.${union.discriminator}".`,
    );
  }

  return value;
}

function parseOptionalTreeBranchChildPlacementValues(
  context: string,
  value: unknown,
  placementEntity: EntitySchema,
  reservedPlacementFieldNames: Set<string>,
): Record<string, FieldVisibilityValue> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const entries = Object.entries(value);

  if (entries.length === 0) {
    throw new Error(`${context} must not be empty.`);
  }
  return Object.fromEntries(
    entries.map(([fieldName, fieldValue]) => {
      const field = definitionsToRecord(placementEntity.fields)[fieldName];
      if (!field) {
        throw new Error(`${context} field "${fieldName}" must reference a placement field.`);
      }

      if (reservedPlacementFieldNames.has(fieldName)) {
        throw new Error(`${context} field "${fieldName}" is controlled by tree creation.`);
      }

      return [
        fieldName,
        parseFieldVisibilityValue(`${context} field "${fieldName}"`, fieldValue, field),
      ];
    }),
  );
}

function parseOptionalTreeCompositionActions(
  context: string,
  value: unknown,
  entityName: string,
  entity: EntitySchema,
  relationshipName: string,
  childFieldName: string,
): TreeCompositionOperationSchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, [], ["createOperation", "removeOperation"]);

  const createOperationName = parseOptionalNonEmptyString(
    `${context} createOperation`,
    value.createOperation,
  );
  const removeOperationName = parseOptionalNonEmptyString(
    `${context} removeOperation`,
    value.removeOperation,
  );

  if (createOperationName === undefined && removeOperationName === undefined) {
    throw new Error(`${context} must include createOperation or removeOperation.`);
  }

  if (createOperationName !== undefined) {
    const operationKey = parseEntityOperationKey(`${context} createOperation`, createOperationName);
    if (operationKey.entityKey !== entityName) {
      throw new Error(`${context} createOperation must use entity "${entityName}".`);
    }
    const operation = definitionsToRecord(entity.operations)[operationKey.operationKey];
    const effect = operation?.effect;
    if (
      !operation ||
      operation.scope !== "record" ||
      operation.kind !== "command" ||
      !isOperationHandlerEffectForKind(effect, "create-tree-child")
    ) {
      throw new Error(`${context} createOperation must use a record command operation.`);
    }

    if (effect.config.relationship !== relationshipName) {
      throw new Error(`${context} createOperation must use relationship "${relationshipName}".`);
    }

    if (effect.config.childField !== childFieldName) {
      throw new Error(`${context} createOperation must use childField "${childFieldName}".`);
    }
  }

  if (removeOperationName !== undefined) {
    const operationKey = parseEntityOperationKey(`${context} removeOperation`, removeOperationName);
    if (operationKey.entityKey !== entityName) {
      throw new Error(`${context} removeOperation must use entity "${entityName}".`);
    }
    const operation = definitionsToRecord(entity.operations)[operationKey.operationKey];
    const effect = operation?.effect;
    if (
      !operation ||
      operation.scope !== "record" ||
      operation.kind !== "command" ||
      !isOperationHandlerEffectForKind(effect, "remove-tree-placement")
    ) {
      throw new Error(`${context} removeOperation must use a record command operation.`);
    }

    if (effect.config.relationship !== relationshipName) {
      throw new Error(`${context} removeOperation must use relationship "${relationshipName}".`);
    }
  }

  return {
    ...(createOperationName === undefined ? {} : { createOperation: createOperationName }),
    ...(removeOperationName === undefined ? {} : { removeOperation: removeOperationName }),
  };
}

function parseCollectionTableFooterSlots(
  viewName: string,
  entityName: string,
  value: unknown,
  tableView: TableViewSchema,
  querySlots: CollectionViewQuerySlotSchema[],
  aggregates: Record<string, AggregateSchema>,
): CollectionTableFooterSlotSchema[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`Collection view "${viewName}" result footer must be an array.`);
  }

  const slots = value.map((slot, index) =>
    parseCollectionTableFooterSlot(
      viewName,
      entityName,
      index,
      slot,
      tableView,
      querySlots,
      aggregates,
    ),
  );
  const seenColumns = new Set<string>();

  for (const slot of slots) {
    if (seenColumns.has(slot.column)) {
      throw new Error(
        `Collection view "${viewName}" result footer column "${slot.column}" must be unique.`,
      );
    }

    seenColumns.add(slot.column);
  }

  return slots.length > 0 ? slots : undefined;
}

function parseCollectionTableFooterSlot(
  viewName: string,
  entityName: string,
  index: number,
  value: unknown,
  tableView: TableViewSchema,
  querySlots: CollectionViewQuerySlotSchema[],
  aggregates: Record<string, AggregateSchema>,
): CollectionTableFooterSlotSchema {
  const context = `Collection view "${viewName}" result footer slot ${index}`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["type", "column", "aggregate"], ["label", "suffix", "format"]);

  if (value.type !== "aggregate") {
    throw new Error(`${context} type must be "aggregate".`);
  }

  const column = parseRequiredNonEmptyString(`${context} column`, value.column);
  const tableColumn = tableView.columns.find(
    (candidate) => tableFooterColumnName(candidate) === column,
  );

  if (!tableColumn) {
    throw new Error(`${context} references unknown table column "${column}".`);
  }

  const aggregateName = parseRequiredNonEmptyString(`${context} aggregate`, value.aggregate);
  const aggregate = aggregates[aggregateName];

  if (!aggregate) {
    throw new Error(`${context} references unknown aggregate "${aggregateName}".`);
  }

  if (!querySlots.some((slot) => slot.query === aggregate.query)) {
    throw new Error(
      `${context} aggregate "${aggregateName}" query "${aggregate.query}" must be one of its query slots for entity "${entityName}".`,
    );
  }

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const suffix = parseOptionalNonEmptyString(`${context} suffix`, value.suffix);
  const format = parseOptionalTableColumnFormat(`${context} format`, value.format);

  return {
    type: "aggregate",
    column,
    aggregate: aggregateName,
    ...(label === undefined ? {} : { label }),
    ...(suffix === undefined ? {} : { suffix }),
    ...(format === undefined ? {} : { format }),
  };
}
