import {
  assertExactKeys,
  definitionsToRecord,
  isRecord,
  parseKeyedDefinitionArray,
  parseOptionalNonEmptyString,
  parseRequiredNonEmptyString,
} from "./schema-parse-helpers.ts";
import { parseOptionalResultOrdering } from "./schema-ordering.ts";
import { parseRecordLinks } from "./schema-record-links.ts";
import { isSystemFieldName } from "./fields.ts";
import { formatEntityOperationKey, parseEntityOperationKey } from "./schema-operations.ts";
import type {
  ComputedValueSchema,
  EntitySchema,
  FieldSchema,
  KeyedDefinition,
  LinkControlTableColumnSchema,
  RecordLinkSchema,
  ReadModelSchema,
  TableColumnAlign,
  TableColumnFormat,
  TableColumnSchema,
  TableColumnWidth,
  TableEditRecordTargetSchema,
  TableOperationControlAvailabilitySchema,
  TableOperationControlVariant,
  TableOperationBindingSchema,
  ResultOrderingSchema,
  TableViewSchema,
  ViewSchema,
} from "./types.ts";
export function parseTableViews(
  value: unknown,
  entities: readonly KeyedDefinition<EntitySchema>[],
  readModels?: ReadModelSchema,
): KeyedDefinition<TableViewSchema>[] {
  const entitiesByKey = definitionsToRecord(entities);
  return parseKeyedDefinitionArray("Schema tableViews", value, (tableViewName, tableView) =>
    parseTableView(tableViewName, tableView, entitiesByKey, readModels),
  );
}
function parseTableView(
  tableViewName: string,
  value: unknown,
  entities: Record<string, EntitySchema>,
  readModels?: ReadModelSchema,
): TableViewSchema {
  if (!isRecord(value)) {
    throw new Error(`Table view "${tableViewName}" must be an object.`);
  }

  assertExactKeys(
    `Table view "${tableViewName}"`,
    value,
    ["key", "entity", "columns"],
    ["links", "operations", "ordering"],
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
  const links = parseRecordLinks(
    `Table view "${tableViewName}" links`,
    value.links,
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
    entities,
    definitionsToRecord(readModels?.computedValues),
    links,
    operations,
    ordering,
  );

  return {
    entity: entityName,
    ...(links === undefined ? {} : { links }),
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
  entities: Record<string, EntitySchema>,
  computedValues: Record<string, ComputedValueSchema>,
  links: KeyedDefinition<RecordLinkSchema>[] | undefined,
  operations: TableOperationBindingSchema[] | undefined,
  ordering: ResultOrderingSchema | undefined,
): TableColumnSchema[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Table view "${tableViewName}" columns must be a non-empty array.`);
  }

  const columns = value.map((column, index) =>
    parseTableColumn(
      tableViewName,
      entityName,
      index,
      column,
      entity,
      entities,
      computedValues,
      links,
      operations,
      ordering,
    ),
  );

  const operationControls = columns.filter((column) => column.type === "operationControl");
  if (operationControls.length > 1) {
    throw new Error(
      `Table view "${tableViewName}" must declare at most one operationControl column.`,
    );
  }
  if (operations !== undefined && operationControls.length === 0) {
    throw new Error(
      `Table view "${tableViewName}" operations require one operationControl column.`,
    );
  }

  const orderingHandles = columns.filter((column) => column.type === "orderingHandle");
  if (orderingHandles.length > 1) {
    throw new Error(
      `Table view "${tableViewName}" must declare at most one orderingHandle column.`,
    );
  }

  return columns;
}

function parseTableColumn(
  tableViewName: string,
  entityName: string,
  index: number,
  value: unknown,
  entity: EntitySchema,
  entities: Record<string, EntitySchema>,
  computedValues: Record<string, ComputedValueSchema>,
  links: KeyedDefinition<RecordLinkSchema>[] | undefined,
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

  if (value.type === "linkControl") {
    return parseLinkControlTableColumn(context, value, links);
  }

  if (value.type === "orderingHandle") {
    return parseOrderingHandleTableColumn(context, value, ordering);
  }

  if (value.type !== undefined && value.type !== "field") {
    throw new Error(
      `${context} type must be "field", "referenceField", "computed", "linkControl", "operationControl", or "orderingHandle".`,
    );
  }

  return parseFieldTableColumn(context, value, entityName, entity);
}

function parseLinkControlTableColumn(
  context: string,
  value: Record<string, unknown>,
  links: KeyedDefinition<RecordLinkSchema>[] | undefined,
): LinkControlTableColumnSchema {
  assertExactKeys(context, value, ["type", "link"], ["label", "align", "width"]);
  const link = parseRequiredNonEmptyString(`${context} link`, value.link);
  if (!links?.some((definition) => definition.key === link)) {
    throw new Error(`${context} references unknown table link "${link}".`);
  }

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const align = parseOptionalTableColumnAlign(`${context} align`, value.align);
  const width = parseOptionalTableColumnWidth(`${context} width`, value.width);

  return {
    type: "linkControl",
    link,
    ...(label === undefined ? {} : { label }),
    ...(align === undefined ? {} : { align }),
    ...(width === undefined ? {} : { width }),
  };
}

function parseFieldTableColumn(
  context: string,
  value: Record<string, unknown>,
  entityName: string,
  entity: EntitySchema,
): TableColumnSchema {
  assertExactKeys(
    context,
    value,
    ["type", "field"],
    ["label", "align", "width", "suffix", "format", "valueUnit"],
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
  const align = parseOptionalTableColumnAlign(`${context} align`, value.align);
  const width = parseOptionalTableColumnWidth(`${context} width`, value.width);
  const suffix = parseOptionalNonEmptyString(`${context} suffix`, value.suffix);
  const format = parseOptionalTableColumnFormat(`${context} format`, value.format);
  const valueUnit =
    field === undefined
      ? undefined
      : parseOptionalTableColumnValueUnit(
          `${context} valueUnit`,
          value.valueUnit,
          entityName,
          fieldName,
          field,
          entity,
        );

  return {
    type: "field",
    field: fieldName,
    ...(label === undefined ? {} : { label }),
    ...(align === undefined ? {} : { align }),
    ...(width === undefined ? {} : { width }),
    ...(suffix === undefined ? {} : { suffix }),
    ...(format === undefined ? {} : { format }),
    ...(valueUnit === undefined ? {} : { valueUnit }),
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
    ["label", "align", "width", "suffix", "format"],
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
  const align = parseOptionalTableColumnAlign(`${context} align`, value.align);
  const width = parseOptionalTableColumnWidth(`${context} width`, value.width);
  const suffix = parseOptionalNonEmptyString(`${context} suffix`, value.suffix);
  const format = parseOptionalTableColumnFormat(`${context} format`, value.format);

  return {
    type: "referenceField",
    referenceField: referenceFieldName,
    field: fieldName,
    ...(label === undefined ? {} : { label }),
    ...(align === undefined ? {} : { align }),
    ...(width === undefined ? {} : { width }),
    ...(suffix === undefined ? {} : { suffix }),
    ...(format === undefined ? {} : { format }),
  };
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
    ["label", "align", "width", "suffix", "format"],
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
  const suffix = parseOptionalNonEmptyString(`${context} suffix`, value.suffix);
  const format = parseOptionalTableColumnFormat(`${context} format`, value.format);

  return {
    type: "computed",
    computedValue: computedValueName,
    ...(label === undefined ? {} : { label }),
    ...(align === undefined ? {} : { align }),
    ...(width === undefined ? {} : { width }),
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
  assertExactKeys(context, value, ["type"], ["includeOrdering"]);

  const includeOrdering = parseOptionalBoolean(`${context} includeOrdering`, value.includeOrdering);

  if (includeOrdering && !ordering) {
    throw new Error(`${context} includeOrdering requires table ordering.`);
  }

  if (operations === undefined && includeOrdering !== true) {
    throw new Error(`${context} requires table operations or includeOrdering.`);
  }

  return {
    type: "operationControl",
    ...(includeOrdering === undefined ? {} : { includeOrdering }),
  };
}

function parseOrderingHandleTableColumn(
  context: string,
  value: Record<string, unknown>,
  ordering: ResultOrderingSchema | undefined,
): TableColumnSchema {
  assertExactKeys(context, value, ["type"]);

  if (!ordering) {
    throw new Error(`${context} orderingHandle requires table ordering.`);
  }

  return { type: "orderingHandle" };
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

function parseOptionalTableColumnValueUnit(
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

  if (
    column.type === "linkControl" ||
    column.type === "operationControl" ||
    column.type === "orderingHandle"
  ) {
    return undefined;
  }

  return `${column.referenceField}.${column.field}`;
}
