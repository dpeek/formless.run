import type { NumericExpression, NumericExpressionOperator } from "./types.ts";
import {
  assertExactKeys,
  definitionsToRecord,
  isFiniteNumber,
  isRecord,
  parseKeyedDefinitionArray,
  parseRequiredNonEmptyString,
} from "./schema-parse-helpers.ts";
import type {
  AggregateFunction,
  AggregateSchema,
  AggregateValueSchema,
  CollectionQuerySchema,
  ComputedValueSchema,
  EntitySchema,
  FieldSchema,
  KeyedDefinition,
  ReadModelSchema,
} from "./types.ts";
const numericExpressionOperators = [
  "add",
  "subtract",
  "multiply",
  "divide",
] satisfies NumericExpressionOperator[];

const aggregateFunctions = ["count", "sum", "average", "min", "max"] satisfies AggregateFunction[];

export function parseReadModels(
  value: unknown,
  entities: Record<string, EntitySchema>,
  queries: Record<string, CollectionQuerySchema>,
): ReadModelSchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error("Schema readModels must be an object.");
  }
  assertExactKeys("Schema readModels", value, [], ["computedValues", "aggregates"]);
  const computedValues = parseComputedValues(value.computedValues, entities);
  const aggregates = parseAggregates(
    value.aggregates,
    entities,
    queries,
    definitionsToRecord(computedValues),
  );
  return {
    ...(computedValues === undefined ? {} : { computedValues }),
    ...(aggregates === undefined ? {} : { aggregates }),
  };
}

function parseComputedValues(
  value: unknown,
  entities: Record<string, EntitySchema>,
): KeyedDefinition<ComputedValueSchema>[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return parseKeyedDefinitionArray(
    "Schema readModels.computedValues",
    value,
    (computedValueName, computedValue) =>
      parseComputedValue(computedValueName, computedValue, entities),
  );
}
function parseComputedValue(
  computedValueName: string,
  value: unknown,
  entities: Record<string, EntitySchema>,
): ComputedValueSchema {
  const context = `Computed value "${computedValueName}"`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }
  assertExactKeys(context, value, ["key", "entity", "type", "expression"]);
  const entityName = parseRequiredNonEmptyString(`${context} entity`, value.entity);
  const entity = entities[entityName];
  if (!entity) {
    throw new Error(`${context} references unknown entity "${entityName}".`);
  }

  if (value.type !== "number") {
    throw new Error(`${context} type must be "number".`);
  }

  return {
    entity: entityName,
    type: "number",
    expression: parseNumericExpression(
      `${context} expression`,
      value.expression,
      entityName,
      definitionsToRecord(entity.fields),
    ),
  };
}

function parseNumericExpression(
  context: string,
  value: unknown,
  entityName: string,
  fields: Record<string, FieldSchema>,
): NumericExpression {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.kind === "field") {
    assertExactKeys(context, value, ["kind", "field"]);

    const fieldName = parseRequiredNonEmptyString(`${context} field`, value.field);
    const field = fields[fieldName];

    assertNumberFieldReference(context, entityName, fieldName, field);

    return { kind: "field", field: fieldName };
  }

  if (value.kind === "literal") {
    assertExactKeys(context, value, ["kind", "value"]);

    if (!isFiniteNumber(value.value)) {
      throw new Error(`${context} literal value must be finite.`);
    }

    return { kind: "literal", value: value.value };
  }

  if (value.kind === "binary") {
    assertExactKeys(context, value, ["kind", "op", "left", "right"]);

    return {
      kind: "binary",
      op: parseNumericExpressionOperator(`${context} op`, value.op),
      left: parseNumericExpression(`${context}.left`, value.left, entityName, fields),
      right: parseNumericExpression(`${context}.right`, value.right, entityName, fields),
    };
  }

  throw new Error(`${context} kind must be "field", "literal", or "binary".`);
}

function parseNumericExpressionOperator(
  context: string,
  value: unknown,
): NumericExpressionOperator {
  if (
    typeof value !== "string" ||
    !numericExpressionOperators.includes(value as NumericExpressionOperator)
  ) {
    throw new Error(`${context} must be "add", "subtract", "multiply", or "divide".`);
  }

  return value as NumericExpressionOperator;
}

function parseAggregates(
  value: unknown,
  entities: Record<string, EntitySchema>,
  queries: Record<string, CollectionQuerySchema>,
  computedValues: Record<string, ComputedValueSchema>,
): KeyedDefinition<AggregateSchema>[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return parseKeyedDefinitionArray(
    "Schema readModels.aggregates",
    value,
    (aggregateName, aggregate) =>
      parseAggregate(aggregateName, aggregate, entities, queries, computedValues),
  );
}
function parseAggregate(
  aggregateName: string,
  value: unknown,
  entities: Record<string, EntitySchema>,
  queries: Record<string, CollectionQuerySchema>,
  computedValues: Record<string, ComputedValueSchema>,
): AggregateSchema {
  const context = `Aggregate "${aggregateName}"`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }
  assertExactKeys(context, value, ["key", "query", "function"], ["value"]);
  const queryName = parseRequiredNonEmptyString(`${context} query`, value.query);
  const query = queries[queryName];
  if (!query) {
    throw new Error(`${context} references unknown query "${queryName}".`);
  }

  const aggregateFunction = parseAggregateFunction(`${context} function`, value.function);

  if (aggregateFunction === "count") {
    if (value.value !== undefined) {
      throw new Error(`${context} count must not include value.`);
    }

    return {
      query: queryName,
      function: aggregateFunction,
    };
  }

  if (value.value === undefined) {
    throw new Error(`${context} ${aggregateFunction} must include value.`);
  }

  const entity = entities[query.entity];
  if (!entity) {
    throw new Error(`${context} query "${queryName}" references unknown entity "${query.entity}".`);
  }

  return {
    query: queryName,
    function: aggregateFunction,
    value: parseAggregateValue(
      `${context} value`,
      value.value,
      query.entity,
      definitionsToRecord(entity.fields),
      computedValues,
    ),
  };
}

function parseAggregateFunction(context: string, value: unknown): AggregateFunction {
  if (typeof value !== "string" || !aggregateFunctions.includes(value as AggregateFunction)) {
    throw new Error(`${context} must be "count", "sum", "average", "min", or "max".`);
  }

  return value as AggregateFunction;
}

function parseAggregateValue(
  context: string,
  value: unknown,
  entityName: string,
  fields: Record<string, FieldSchema>,
  computedValues: Record<string, ComputedValueSchema>,
): AggregateValueSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.kind === "field") {
    assertExactKeys(context, value, ["kind", "field"]);

    const fieldName = parseRequiredNonEmptyString(`${context} field`, value.field);
    const field = fields[fieldName];

    assertNumberFieldReference(context, entityName, fieldName, field);

    return { kind: "field", field: fieldName };
  }

  if (value.kind === "computed") {
    assertExactKeys(context, value, ["kind", "computedValue"]);

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

    return { kind: "computed", computedValue: computedValueName };
  }

  throw new Error(`${context} kind must be "field" or "computed".`);
}

function assertNumberFieldReference(
  context: string,
  entityName: string,
  fieldName: string,
  field: FieldSchema | undefined,
) {
  if (!field) {
    throw new Error(`${context} references unknown field "${entityName}.${fieldName}".`);
  }

  if (field.type !== "number") {
    throw new Error(`${context} field "${entityName}.${fieldName}" must be a number field.`);
  }
}
