import {
  assertExactKeys,
  definitionsToRecord,
  isRecord,
  parseKeyedDefinitionArray,
  parseOptionalNonEmptyString,
  parseRequiredNonEmptyString,
} from "./schema-parse-helpers.ts";
import { parseOptionalResultOrdering } from "./schema-ordering.ts";
import { isSystemFieldName } from "./fields.ts";
import { isFieldCommitPolicy, isFieldEditor } from "./field-types.ts";
import { formatEntityOperationKey, parseEntityOperationKey } from "./schema-operations.ts";
import type {
  ComputedValueSchema,
  EntitySchema,
  FieldSchema,
  ItemViewSchema,
  KeyedDefinition,
  ReadModelSchema,
  TableColumnAlign,
  TableColumnDisplay,
  TableColumnFormat,
  TableColumnSchema,
  TableColumnWidth,
  TableEditRecordTargetSchema,
  TableOperationControlAvailabilitySchema,
  TableOperationControlPresentation,
  TableOperationControlVariant,
  TableOperationBindingSchema,
  ResultOrderingSchema,
  TableViewSchema,
  ViewSchema,
} from "./types.ts";
import { parseFieldCommitPolicy, parseFieldEditor } from "./schema-view-field-parser.ts";
import { parseOptionalFieldPresentation } from "./schema-view-fields.ts";

const systemDisplayField = {
  type: "text",
  required: false,
} satisfies FieldSchema;
export function parseTableViews(
  value: unknown,
  entities: readonly KeyedDefinition<EntitySchema>[],
  itemViews: readonly KeyedDefinition<ItemViewSchema>[],
  readModels?: ReadModelSchema,
): KeyedDefinition<TableViewSchema>[] {
  const entitiesByKey = definitionsToRecord(entities);
  const itemViewsByKey = definitionsToRecord(itemViews);
  return parseKeyedDefinitionArray("Schema tableViews", value, (tableViewName, tableView) =>
    parseTableView(tableViewName, tableView, entitiesByKey, itemViewsByKey, readModels),
  );
}
function parseTableView(
  tableViewName: string,
  value: unknown,
  entities: Record<string, EntitySchema>,
  itemViews: Record<string, ItemViewSchema>,
  readModels?: ReadModelSchema,
): TableViewSchema {
  if (!isRecord(value)) {
    throw new Error(`Table view "${tableViewName}" must be an object.`);
  }

  assertExactKeys(
    `Table view "${tableViewName}"`,
    value,
    ["key", "entity", "columns"],
    ["operations", "ordering"],
  );
  const entityName = parseRequiredNonEmptyString(
    `Table view "${tableViewName}" entity`,
    value.entity,
  );
  const entity = entities[entityName];

  if (!entity) {
    throw new Error(`Table view "${tableViewName}" references unknown entity "${entityName}".`);
  }

  const operations = parseOptionalTableOperations(
    tableViewName,
    value.operations,
    entityName,
    entity,
    entities,
  );
  const ordering = parseOptionalResultOrdering(
    `Table view "${tableViewName}" ordering`,
    value.ordering,
    entityName,
    entity,
  );
  const columns = parseTableColumns(
    tableViewName,
    entityName,
    value.columns,
    entity,
    itemViews,
    entities,
    definitionsToRecord(readModels?.computedValues),
    operations,
    ordering,
  );

  return {
    entity: entityName,
    ...(operations === undefined ? {} : { operations }),
    ...(ordering === undefined ? {} : { ordering }),
    columns,
  };
}

function parseOptionalTableOperations(
  tableViewName: string,
  value: unknown,
  entityName: string,
  entity: EntitySchema,
  entities: Record<string, EntitySchema>,
): TableOperationBindingSchema[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`Table view "${tableViewName}" operations must be an array.`);
  }

  const bindings = value.map((binding, index) =>
    parseTableOperationBinding(tableViewName, index, binding, entityName, entity, entities),
  );
  const duplicate = bindings
    .map((binding) => binding.operation)
    .find((operation, index, operations) => operations.indexOf(operation) !== index);

  if (duplicate) {
    throw new Error(`Table view "${tableViewName}" operations reference duplicate "${duplicate}".`);
  }

  return bindings.length > 0 ? bindings : undefined;
}

function parseTableOperationBinding(
  tableViewName: string,
  index: number,
  value: unknown,
  entityName: string,
  entity: EntitySchema,
  entities: Record<string, EntitySchema>,
): TableOperationBindingSchema {
  const context = `Table view "${tableViewName}" operation binding ${index}`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(
    context,
    value,
    ["operation"],
    ["label", "variant", "availability", "target", "editView"],
  );
  const parsedOperationKey = parseEntityOperationKey(`${context} operation`, value.operation);
  const operationEntity = entities[parsedOperationKey.entityKey];
  const operation = definitionsToRecord(operationEntity?.operations)[
    parsedOperationKey.operationKey
  ];
  if (!operationEntity || !operation) {
    throw new Error(`${context} references unknown operation "${String(value.operation)}".`);
  }

  if (operation.scope !== "record") {
    throw new Error(`${context} operation must use record scope.`);
  }

  const target =
    value.target === undefined
      ? undefined
      : parseTableEditRecordTarget(`${context} target`, value.target, entityName, entity);
  const targetEntityName = selectTableOperationTargetEntityName(entityName, entity, target);

  if (parsedOperationKey.entityKey !== targetEntityName) {
    throw new Error(`${context} operation must target entity "${targetEntityName}".`);
  }

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const variant = parseOptionalTableOperationControlVariant(`${context} variant`, value.variant);
  const availability = parseOptionalTableOperationControlAvailability(
    `${context} availability`,
    value.availability,
  );
  const editView = parseOptionalNonEmptyString(`${context} editView`, value.editView);

  if (editView !== undefined && operation.kind !== "update") {
    throw new Error(`${context} editView is only valid for update operations.`);
  }

  return {
    operation: formatEntityOperationKey(parsedOperationKey),
    ...(label === undefined ? {} : { label }),
    ...(variant === undefined ? {} : { variant }),
    ...(availability === undefined ? {} : { availability }),
    ...(target === undefined ? {} : { target }),
    ...(editView === undefined ? {} : { editView }),
  };
}

function selectTableOperationTargetEntityName(
  entityName: string,
  entity: EntitySchema,
  target: TableEditRecordTargetSchema | undefined,
): string {
  if (target === undefined || target.kind === "row") {
    return entityName;
  }
  const field = definitionsToRecord(entity.fields)[target.field];
  if (field?.type !== "reference") {
    throw new Error(`Missing reference field "${entityName}.${target.field}".`);
  }

  return field.to;
}

function parseTableEditRecordTarget(
  context: string,
  value: unknown,
  entityName: string,
  entity: EntitySchema,
): TableEditRecordTargetSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }
  if (value.kind === "row") {
    assertExactKeys(context, value, ["kind"]);
    return { kind: "row" };
  }
  if (value.kind === "reference") {
    assertExactKeys(context, value, ["kind", "field"]);
    const fieldName = parseRequiredNonEmptyString(`${context} field`, value.field);
    const field = definitionsToRecord(entity.fields)[fieldName];
    if (!field) {
      throw new Error(`${context} references unknown field "${entityName}.${fieldName}".`);
    }

    if (field.type !== "reference") {
      throw new Error(`${context} field "${entityName}.${fieldName}" must be a reference field.`);
    }

    return { kind: "reference", field: fieldName };
  }

  throw new Error(`${context} kind must be "row" or "reference".`);
}

function parseTableColumns(
  tableViewName: string,
  entityName: string,
  value: unknown,
  entity: EntitySchema,
  itemViews: Record<string, ItemViewSchema>,
  entities: Record<string, EntitySchema>,
  computedValues: Record<string, ComputedValueSchema>,
  operations: TableOperationBindingSchema[] | undefined,
  ordering: ResultOrderingSchema | undefined,
): TableColumnSchema[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Table view "${tableViewName}" columns must be a non-empty array.`);
  }

  return value.map((column, index) =>
    parseTableColumn(
      tableViewName,
      entityName,
      index,
      column,
      entity,
      itemViews,
      entities,
      computedValues,
      operations,
      ordering,
    ),
  );
}

function parseTableColumn(
  tableViewName: string,
  entityName: string,
  index: number,
  value: unknown,
  entity: EntitySchema,
  itemViews: Record<string, ItemViewSchema>,
  entities: Record<string, EntitySchema>,
  computedValues: Record<string, ComputedValueSchema>,
  operations: TableOperationBindingSchema[] | undefined,
  ordering: ResultOrderingSchema | undefined,
): TableColumnSchema {
  const context = `Table view "${tableViewName}" column ${index}`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.type === "referenceField") {
    return parseReferenceFieldTableColumn(context, value, entityName, entity, entities);
  }

  if (value.type === "computed") {
    return parseComputedTableColumn(context, value, entityName, computedValues);
  }

  if (value.type === "operationControl") {
    return parseOperationControlTableColumn(context, value, operations, ordering);
  }

  if (value.type === "orderingHandle") {
    return parseOrderingHandleTableColumn(context, value, ordering);
  }

  if (value.type !== undefined && value.type !== "field") {
    throw new Error(
      `${context} type must be "field", "referenceField", "computed", "operationControl", or "orderingHandle".`,
    );
  }

  return parseFieldTableColumn(context, value, entityName, entity, itemViews);
}

function parseFieldTableColumn(
  context: string,
  value: Record<string, unknown>,
  entityName: string,
  entity: EntitySchema,
  itemViews: Record<string, ItemViewSchema>,
): TableColumnSchema {
  assertExactKeys(
    context,
    value,
    ["type", "field"],
    [
      "label",
      "editor",
      "commit",
      "align",
      "width",
      "display",
      "suffix",
      "format",
      "referenceItemView",
      "valueUnit",
      "presentation",
    ],
  );

  if (value.type !== "field") {
    throw new Error(`${context} type must be "field".`);
  }
  const fieldName = parseRequiredNonEmptyString(`${context} field`, value.field);
  const field = definitionsToRecord(entity.fields)[fieldName];
  const systemField = field === undefined && isSystemFieldName(fieldName);
  if (!field && !systemField) {
    throw new Error(`${context} references unknown field "${entityName}.${fieldName}".`);
  }

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const editor =
    value.editor === undefined
      ? undefined
      : field === undefined
        ? parseSystemFieldEditor(`${context} field "${fieldName}"`, value.editor)
        : parseFieldEditor(`${context} field "${fieldName}"`, value.editor, field);
  const commit =
    value.commit === undefined
      ? undefined
      : field === undefined
        ? parseSystemFieldCommitPolicy(`${context} field "${fieldName}"`, value.commit)
        : parseFieldCommitPolicy(`${context} field "${fieldName}"`, value.commit, field);
  const align = parseOptionalTableColumnAlign(`${context} align`, value.align);
  const width = parseOptionalTableColumnWidth(`${context} width`, value.width);
  const display = parseOptionalTableColumnDisplay(`${context} display`, value.display);
  const suffix = parseOptionalNonEmptyString(`${context} suffix`, value.suffix);
  const format = parseOptionalTableColumnFormat(`${context} format`, value.format);
  const referenceItemView =
    field === undefined
      ? undefined
      : parseOptionalReferenceItemView(
          `${context} referenceItemView`,
          value.referenceItemView,
          field,
          itemViews,
        );
  const valueUnit =
    field === undefined
      ? undefined
      : parseOptionalValueUnitEditor(
          `${context} valueUnit`,
          value.valueUnit,
          entityName,
          fieldName,
          field,
          entity,
        );
  const presentation = parseOptionalFieldPresentation(
    `${context} field "${fieldName}"`,
    value.presentation,
    field ?? systemDisplayField,
  );

  return {
    type: "field",
    field: fieldName,
    ...(label === undefined ? {} : { label }),
    ...(editor === undefined ? {} : { editor }),
    ...(commit === undefined ? {} : { commit }),
    ...(align === undefined ? {} : { align }),
    ...(width === undefined ? {} : { width }),
    ...(display === undefined ? {} : { display }),
    ...(suffix === undefined ? {} : { suffix }),
    ...(format === undefined ? {} : { format }),
    ...(referenceItemView === undefined ? {} : { referenceItemView }),
    ...(valueUnit === undefined ? {} : { valueUnit }),
    ...(presentation === undefined ? {} : { presentation }),
  };
}

function parseReferenceFieldTableColumn(
  context: string,
  value: Record<string, unknown>,
  entityName: string,
  entity: EntitySchema,
  entities: Record<string, EntitySchema>,
): TableColumnSchema {
  assertExactKeys(
    context,
    value,
    ["type", "referenceField", "field"],
    ["label", "editor", "commit", "align", "width", "display", "suffix", "format", "presentation"],
  );

  const referenceFieldName = parseRequiredNonEmptyString(
    `${context} referenceField`,
    value.referenceField,
  );
  const sourceField = definitionsToRecord(entity.fields)[referenceFieldName];
  if (!sourceField) {
    throw new Error(
      `${context} references unknown referenceField "${entityName}.${referenceFieldName}".`,
    );
  }

  if (sourceField.type !== "reference") {
    throw new Error(
      `${context} referenceField "${entityName}.${referenceFieldName}" must be a reference field.`,
    );
  }

  const referencedEntity = entities[sourceField.to];
  if (!referencedEntity) {
    throw new Error(
      `${context} referenceField "${entityName}.${referenceFieldName}" targets unknown entity "${sourceField.to}".`,
    );
  }
  const fieldName = parseRequiredNonEmptyString(`${context} field`, value.field);
  const field = definitionsToRecord(referencedEntity.fields)[fieldName];
  const systemField = field === undefined && isSystemFieldName(fieldName);
  if (!field && !systemField) {
    throw new Error(`${context} references unknown field "${sourceField.to}.${fieldName}".`);
  }

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const editor =
    value.editor === undefined
      ? undefined
      : field === undefined
        ? parseSystemFieldEditor(`${context} field "${sourceField.to}.${fieldName}"`, value.editor)
        : parseFieldEditor(
            `${context} field "${sourceField.to}.${fieldName}"`,
            value.editor,
            field,
          );
  const commit =
    value.commit === undefined
      ? undefined
      : field === undefined
        ? parseSystemFieldCommitPolicy(
            `${context} field "${sourceField.to}.${fieldName}"`,
            value.commit,
          )
        : parseFieldCommitPolicy(
            `${context} field "${sourceField.to}.${fieldName}"`,
            value.commit,
            field,
          );
  const align = parseOptionalTableColumnAlign(`${context} align`, value.align);
  const width = parseOptionalTableColumnWidth(`${context} width`, value.width);
  const display = parseOptionalTableColumnDisplay(`${context} display`, value.display);
  const suffix = parseOptionalNonEmptyString(`${context} suffix`, value.suffix);
  const format = parseOptionalTableColumnFormat(`${context} format`, value.format);
  const presentation = parseOptionalFieldPresentation(
    `${context} field "${sourceField.to}.${fieldName}"`,
    value.presentation,
    field ?? systemDisplayField,
  );

  return {
    type: "referenceField",
    referenceField: referenceFieldName,
    field: fieldName,
    ...(label === undefined ? {} : { label }),
    ...(editor === undefined ? {} : { editor }),
    ...(commit === undefined ? {} : { commit }),
    ...(align === undefined ? {} : { align }),
    ...(width === undefined ? {} : { width }),
    ...(display === undefined ? {} : { display }),
    ...(suffix === undefined ? {} : { suffix }),
    ...(format === undefined ? {} : { format }),
    ...(presentation === undefined ? {} : { presentation }),
  };
}

function parseSystemFieldEditor(context: string, value: unknown): undefined {
  if (!isFieldEditor(value)) {
    throw new Error(`${context} has unsupported editor "${formatUnknownValue(value)}".`);
  }

  return undefined;
}

function parseSystemFieldCommitPolicy(context: string, value: unknown): undefined {
  if (!isFieldCommitPolicy(value)) {
    throw new Error(`${context} has unsupported commit policy "${formatUnknownValue(value)}".`);
  }

  return undefined;
}

function formatUnknownValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return `${value}`;
  }

  if (value === undefined) {
    return "undefined";
  }

  if (value === null) {
    return "null";
  }

  if (typeof value === "symbol") {
    return value.description === undefined ? "Symbol()" : `Symbol(${value.description})`;
  }

  if (typeof value === "function") {
    return "[function]";
  }

  return JSON.stringify(value) ?? "[object]";
}

function parseComputedTableColumn(
  context: string,
  value: Record<string, unknown>,
  entityName: string,
  computedValues: Record<string, ComputedValueSchema>,
): TableColumnSchema {
  assertExactKeys(
    context,
    value,
    ["type", "computedValue"],
    ["label", "align", "width", "display", "suffix", "format"],
  );

  const computedValueName = parseRequiredNonEmptyString(
    `${context} computedValue`,
    value.computedValue,
  );
  const computedValue = computedValues[computedValueName];

  if (!computedValue) {
    throw new Error(`${context} references unknown computed value "${computedValueName}".`);
  }

  if (computedValue.entity !== entityName) {
    throw new Error(
      `${context} computed value "${computedValueName}" must use entity "${entityName}".`,
    );
  }

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const align = parseOptionalTableColumnAlign(`${context} align`, value.align);
  const width = parseOptionalTableColumnWidth(`${context} width`, value.width);
  const display = parseOptionalTableColumnDisplay(`${context} display`, value.display);

  if (display === "editor") {
    throw new Error(`${context} computed columns must be read-only or hidden.`);
  }

  const suffix = parseOptionalNonEmptyString(`${context} suffix`, value.suffix);
  const format = parseOptionalTableColumnFormat(`${context} format`, value.format);

  return {
    type: "computed",
    computedValue: computedValueName,
    ...(label === undefined ? {} : { label }),
    ...(align === undefined ? {} : { align }),
    ...(width === undefined ? {} : { width }),
    ...(display === undefined ? {} : { display }),
    ...(suffix === undefined ? {} : { suffix }),
    ...(format === undefined ? {} : { format }),
  };
}

function parseOperationControlTableColumn(
  context: string,
  value: Record<string, unknown>,
  operations: TableOperationBindingSchema[] | undefined,
  ordering: ResultOrderingSchema | undefined,
): TableColumnSchema {
  assertExactKeys(
    context,
    value,
    ["type"],
    [
      "operation",
      "operations",
      "includeOrdering",
      "label",
      "align",
      "width",
      "display",
      "presentation",
    ],
  );

  const parsedIncludeOrdering = parseOptionalBoolean(
    `${context} includeOrdering`,
    value.includeOrdering,
  );
  const includeOrdering =
    parsedIncludeOrdering ??
    (value.operation === undefined && value.operations === undefined && ordering !== undefined
      ? true
      : undefined);

  if (includeOrdering && !ordering) {
    throw new Error(`${context} includeOrdering requires table ordering.`);
  }

  const referencedOperations = parseOperationControlReferences(
    context,
    value.operation,
    value.operations,
    includeOrdering,
  );

  for (const operationKey of referencedOperations) {
    if (!operations?.some((binding) => binding.operation === operationKey)) {
      throw new Error(`${context} references unknown table operation "${operationKey}".`);
    }
  }

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const align = parseOptionalTableColumnAlign(`${context} align`, value.align);
  const width = parseOptionalTableColumnWidth(`${context} width`, value.width);
  const display = parseOptionalTableColumnDisplay(`${context} display`, value.display);

  if (display === "editor") {
    throw new Error(`${context} operationControl columns must be read-only or hidden.`);
  }

  const presentation = parseOptionalTableOperationControlPresentation(
    `${context} presentation`,
    value.presentation,
  );

  if (presentation === "button" && referencedOperations.length > 1) {
    throw new Error(`${context} button presentation requires exactly one operation.`);
  }

  if (presentation === "button" && includeOrdering) {
    throw new Error(`${context} button presentation cannot include ordering controls.`);
  }

  return {
    type: "operationControl",
    ...(value.operation === undefined
      ? { operations: referencedOperations }
      : { operation: referencedOperations[0] }),
    ...(includeOrdering === undefined ? {} : { includeOrdering }),
    ...(label === undefined ? {} : { label }),
    ...(align === undefined ? {} : { align }),
    ...(width === undefined ? {} : { width }),
    ...(display === undefined ? {} : { display }),
    ...(presentation === undefined ? {} : { presentation }),
  };
}

function parseOrderingHandleTableColumn(
  context: string,
  value: Record<string, unknown>,
  ordering: ResultOrderingSchema | undefined,
): TableColumnSchema {
  assertExactKeys(context, value, ["type"], ["label", "align", "width", "display"]);

  if (!ordering) {
    throw new Error(`${context} orderingHandle requires table ordering.`);
  }

  if (!ordering.presentations?.includes("dragHandle")) {
    throw new Error(`${context} orderingHandle requires dragHandle ordering presentation.`);
  }

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const align = parseOptionalTableColumnAlign(`${context} align`, value.align);
  const width = parseOptionalTableColumnWidth(`${context} width`, value.width);
  const display = parseOptionalTableColumnDisplay(`${context} display`, value.display);

  if (display === "editor") {
    throw new Error(`${context} orderingHandle columns must be read-only or hidden.`);
  }

  return {
    type: "orderingHandle",
    ...(label === undefined ? {} : { label }),
    ...(align === undefined ? {} : { align }),
    ...(width === undefined ? {} : { width }),
    ...(display === undefined ? {} : { display }),
  };
}

function parseOperationControlReferences(
  context: string,
  operation: unknown,
  operations: unknown,
  allowEmpty: boolean | undefined,
): string[] {
  if (operation !== undefined && operations !== undefined) {
    throw new Error(`${context} must use either operation or operations, not both.`);
  }

  if (operation !== undefined) {
    return [formatEntityOperationKey(parseEntityOperationKey(`${context} operation`, operation))];
  }

  if (
    (operations === undefined || (Array.isArray(operations) && operations.length === 0)) &&
    allowEmpty
  ) {
    return [];
  }

  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error(`${context} must reference at least one table operation.`);
  }

  const operationKeys = operations.map((candidate, index) =>
    formatEntityOperationKey(parseEntityOperationKey(`${context} operations ${index}`, candidate)),
  );
  const duplicate = operationKeys.find(
    (candidate, index) => operationKeys.indexOf(candidate) !== index,
  );

  if (duplicate) {
    throw new Error(`${context} references duplicate table operation "${duplicate}".`);
  }

  return operationKeys;
}

export function assertTableOperationEditViews(
  views: Record<string, ViewSchema>,
  tableViews: Record<string, TableViewSchema>,
  entities: Record<string, EntitySchema>,
) {
  for (const [tableViewName, tableView] of Object.entries(tableViews)) {
    const tableEntity = entities[tableView.entity];

    if (!tableEntity) {
      continue;
    }

    for (const [index, binding] of (tableView.operations ?? []).entries()) {
      if (binding.editView === undefined) {
        continue;
      }

      const context = `Table view "${tableViewName}" operation binding ${index}`;
      const editView = views[binding.editView];

      if (!editView) {
        throw new Error(`${context} references unknown edit view "${binding.editView}".`);
      }

      if (editView.type !== "edit") {
        throw new Error(`${context} must reference an edit view.`);
      }

      const targetEntityName = selectTableOperationTargetEntityName(
        tableView.entity,
        tableEntity,
        binding.target,
      );

      if (editView.entity !== targetEntityName) {
        throw new Error(
          `${context} edit view "${binding.editView}" must use entity "${targetEntityName}".`,
        );
      }
    }
  }
}

function parseOptionalTableColumnAlign(
  context: string,
  value: unknown,
): TableColumnAlign | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "start" && value !== "center" && value !== "end") {
    throw new Error(`${context} must be "start", "center", or "end".`);
  }

  return value;
}

function parseOptionalTableColumnWidth(
  context: string,
  value: unknown,
): TableColumnWidth | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "xs" && value !== "sm" && value !== "md" && value !== "lg") {
    throw new Error(`${context} must be "xs", "sm", "md", or "lg".`);
  }

  return value;
}

function parseOptionalTableColumnDisplay(
  context: string,
  value: unknown,
): TableColumnDisplay | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "editor" && value !== "readOnly" && value !== "hidden") {
    throw new Error(`${context} must be "editor", "readOnly", or "hidden".`);
  }

  return value;
}

export function parseOptionalTableColumnFormat(
  context: string,
  value: unknown,
): TableColumnFormat | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "plain" && value !== "number" && value !== "currency" && value !== "percent") {
    throw new Error(`${context} must be "plain", "number", "currency", or "percent".`);
  }

  return value;
}

function parseOptionalTableOperationControlVariant(
  context: string,
  value: unknown,
): TableOperationControlVariant | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "default" && value !== "destructive") {
    throw new Error(`${context} must be "default" or "destructive".`);
  }

  return value;
}

function parseOptionalTableOperationControlPresentation(
  context: string,
  value: unknown,
): TableOperationControlPresentation | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "button" && value !== "dropdown") {
    throw new Error(`${context} must be "button" or "dropdown".`);
  }

  return value;
}

function parseOptionalBoolean(context: string, value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`${context} must be a boolean.`);
  }

  return value;
}

function parseOptionalTableOperationControlAvailability(
  context: string,
  value: unknown,
): TableOperationControlAvailabilitySchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["state"], ["reason"]);

  const state = parseTableOperationControlAvailabilityState(`${context} state`, value.state);
  const reason = parseOptionalNonEmptyString(`${context} reason`, value.reason);

  return {
    state,
    ...(reason === undefined ? {} : { reason }),
  };
}

function parseTableOperationControlAvailabilityState(
  context: string,
  value: unknown,
): TableOperationControlAvailabilitySchema["state"] {
  if (value !== "visible" && value !== "hidden" && value !== "disabled") {
    throw new Error(`${context} must be "visible", "hidden", or "disabled".`);
  }

  return value;
}

function parseOptionalReferenceItemView(
  context: string,
  value: unknown,
  field: FieldSchema,
  itemViews: Record<string, ItemViewSchema>,
): string | undefined {
  const itemViewName = parseOptionalNonEmptyString(context, value);

  if (itemViewName === undefined) {
    return undefined;
  }

  if (field.type !== "reference") {
    throw new Error(`${context} requires a reference field.`);
  }

  const itemView = itemViews[itemViewName];
  if (!itemView) {
    throw new Error(`${context} references unknown item view "${itemViewName}".`);
  }

  if (itemView.entity !== field.to) {
    throw new Error(`${context} "${itemViewName}" must use entity "${field.to}".`);
  }

  return itemViewName;
}

function parseOptionalValueUnitEditor(
  context: string,
  value: unknown,
  entityName: string,
  valueFieldName: string,
  valueField: FieldSchema,
  entity: EntitySchema,
) {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["unitField"]);

  if (valueField.type !== "number") {
    throw new Error(`${context} requires a number field.`);
  }

  const unitFieldName = parseRequiredNonEmptyString(`${context} unitField`, value.unitField);

  if (unitFieldName === valueFieldName) {
    throw new Error(`${context} unitField must reference a different field.`);
  }
  const unitField = definitionsToRecord(entity.fields)[unitFieldName];
  if (!unitField) {
    throw new Error(`${context} references unknown unitField "${entityName}.${unitFieldName}".`);
  }

  if (unitField.type !== "enum") {
    throw new Error(`${context} unitField "${entityName}.${unitFieldName}" must be an enum field.`);
  }

  return { unitField: unitFieldName };
}

export function tableFooterColumnName(column: TableColumnSchema) {
  if (column.type === "field") {
    return column.field;
  }

  if (column.type === "computed") {
    return column.computedValue;
  }

  if (column.type === "operationControl" || column.type === "orderingHandle") {
    return undefined;
  }

  return `${column.referenceField}.${column.field}`;
}
