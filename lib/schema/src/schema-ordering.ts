import {
  assertExactKeys,
  definitionsToRecord,
  isRecord,
  parseRequiredNonEmptyString,
} from "./schema-parse-helpers.ts";
import type { EntitySchema, ResultOrderingSchema, ResultOrderingScopeSchema } from "./types.ts";

export function parseOptionalResultOrdering(
  context: string,
  value: unknown,
  entityName: string,
  entity: EntitySchema,
): ResultOrderingSchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }
  assertExactKeys(context, value, ["field"], ["scope"]);
  const fieldName = parseRequiredNonEmptyString(`${context} field`, value.field);
  const field = definitionsToRecord(entity.fields)[fieldName];
  if (!field) {
    throw new Error(`${context} references unknown field "${entityName}.${fieldName}".`);
  }

  if (field.type !== "number") {
    throw new Error(`${context} field "${entityName}.${fieldName}" must be a number field.`);
  }

  if (field.integer === true) {
    throw new Error(`${context} field "${entityName}.${fieldName}" must not be integer.`);
  }

  const scope = parseOptionalResultOrderingScope(context, value.scope, entityName, entity);

  return {
    field: fieldName,
    ...(scope === undefined ? {} : { scope }),
  };
}

export function resultOrderingsAreEquivalent(
  left: ResultOrderingSchema,
  right: ResultOrderingSchema,
) {
  return (
    left.field === right.field && resultOrderingScopeKey(left) === resultOrderingScopeKey(right)
  );
}

function parseOptionalResultOrderingScope(
  context: string,
  value: unknown,
  entityName: string,
  entity: EntitySchema,
): ResultOrderingScopeSchema[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context} scope must be a non-empty array.`);
  }

  const scope = value.map((candidate, index) =>
    parseResultOrderingScopeField(`${context} scope ${index}`, candidate, entityName, entity),
  );
  const duplicate = scope.find(
    (candidate, index) => scope.findIndex((item) => item.field === candidate.field) !== index,
  );

  if (duplicate) {
    throw new Error(`${context} scope references duplicate field "${duplicate.field}".`);
  }

  return scope;
}

function parseResultOrderingScopeField(
  context: string,
  value: unknown,
  entityName: string,
  entity: EntitySchema,
): ResultOrderingScopeSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["kind", "field"]);

  if (value.kind !== "field") {
    throw new Error(`${context} kind must be "field".`);
  }
  const fieldName = parseRequiredNonEmptyString(`${context} field`, value.field);
  if (!definitionsToRecord(entity.fields)[fieldName]) {
    throw new Error(`${context} references unknown field "${entityName}.${fieldName}".`);
  }
  return { kind: "field", field: fieldName };
}
function resultOrderingScopeKey(ordering: ResultOrderingSchema) {
  return JSON.stringify((ordering.scope ?? []).map((scope) => scope.field));
}
