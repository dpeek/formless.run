import { validateAuthorityFieldValue } from "./field-types.ts";
import { isSystemFieldName } from "./fields.ts";
import { definitionsToRecord } from "./schema-parse-helpers.ts";
import { validateTextValueForStorage } from "./text-values.ts";
import type {
  EntityOperationInputFieldSchema,
  EntityOperationSchema,
  EntitySchema,
  FieldValue,
  RecordValues,
} from "./types.ts";

export type OperationInputProjectionRequest = {
  canonicalOperationKey?: string;
  context?: string;
  entity: EntitySchema;
  operation: EntityOperationSchema;
  rawInput: unknown;
};

export type OperationInputValueProjection = {
  operationInputValues: RecordValues;
  recordWriteValues: RecordValues;
  recordWritePatchValues: Record<string, unknown>;
};
type OperationInputFieldProjection =
  | {
      kind: "omit";
      inputName: string;
      entityFieldName?: string;
    }
  | {
      kind: "set";
      inputName: string;
      value: FieldValue;
      entityFieldName?: string;
    };

export function projectOperationInputValues(
  input: OperationInputProjectionRequest,
): OperationInputValueProjection {
  const context = input.context ?? "Operation input";
  const inputContract = input.operation.input;

  if (!inputContract) {
    if (input.rawInput === undefined) {
      return emptyOperationInputProjection();
    }

    const values = parseOperationInputRecord(context, input.rawInput);
    if (Object.keys(values).length > 0) {
      throw new Error(`${operationLabel(input)} does not declare input fields.`);
    }
    return emptyOperationInputProjection();
  }
  const values = parseOperationInputRecord(context, input.rawInput);
  const inputFieldsByKey = definitionsToRecord(inputContract.fields);
  for (const fieldName of Object.keys(values)) {
    if (!inputFieldsByKey[fieldName]) {
      assertOperationInputDoesNotOwnSystemField(context, fieldName);
      throw new Error(`${context} includes undeclared field "${fieldName}".`);
    }
  }
  const projection = emptyOperationInputProjection();
  for (const field of inputContract.fields) {
    const inputName = field.key;
    const provided = Object.hasOwn(values, inputName);
    const fieldProjection =
      "field" in field
        ? projectEntityBackedOperationInputField({
            context,
            entity: input.entity,
            field,
            inputName,
            provided,
            value: values[inputName],
          })
        : projectInlineOperationInputField(context, inputName, field, values[inputName], provided);

    if (fieldProjection.entityFieldName && provided) {
      projection.recordWritePatchValues[fieldProjection.entityFieldName] = values[inputName];
    }

    if (fieldProjection.kind === "omit") {
      continue;
    }

    projection.operationInputValues[fieldProjection.inputName] = fieldProjection.value;

    if (fieldProjection.entityFieldName) {
      projection.recordWriteValues[fieldProjection.entityFieldName] = fieldProjection.value;
    }
  }

  return projection;
}

export function projectOperationRecordPlanInputValues(
  input: OperationInputProjectionRequest,
): RecordValues {
  return projectOperationInputValues(input).operationInputValues;
}

export function projectOperationCommandInputValues(
  input: OperationInputProjectionRequest,
): unknown {
  if (!input.operation.input) {
    return input.rawInput;
  }

  return projectOperationInputValues(input).operationInputValues;
}

export function projectOperationRecordWriteValues(
  input: OperationInputProjectionRequest,
): RecordValues {
  return projectOperationInputValues(input).recordWriteValues;
}

export function projectOperationRecordWritePatchValues(
  input: OperationInputProjectionRequest,
): Record<string, unknown> {
  return projectOperationInputValues(input).recordWritePatchValues;
}

function emptyOperationInputProjection(): OperationInputValueProjection {
  return {
    operationInputValues: {},
    recordWriteValues: {},
    recordWritePatchValues: {},
  };
}

function projectEntityBackedOperationInputField(input: {
  context: string;
  entity: EntitySchema;
  field: Extract<
    EntityOperationInputFieldSchema,
    {
      field: string;
    }
  >;
  inputName: string;
  provided: boolean;
  value: unknown;
}): OperationInputFieldProjection {
  const entityField = definitionsToRecord(input.entity.fields)[input.field.field];
  if (!entityField) {
    throw new Error(`${input.context} field "${input.inputName}" is invalid.`);
  }

  if (!input.provided) {
    if (input.field.required) {
      throw new Error(`${input.context} field "${input.inputName}" is required.`);
    }

    return { kind: "omit", inputName: input.inputName, entityFieldName: input.field.field };
  }

  const result = validateAuthorityFieldValue(
    input.field.field,
    {
      ...entityField,
      required: input.field.required ?? false,
    },
    input.value,
    input.provided,
  );

  if (result.kind === "omit") {
    return { kind: "omit", inputName: input.inputName, entityFieldName: input.field.field };
  }

  if (input.field.mustBeTrue && result.value !== true) {
    throw new Error(`${input.context} field "${input.inputName}" must be accepted.`);
  }

  return {
    kind: "set",
    inputName: input.inputName,
    entityFieldName: input.field.field,
    value: result.value,
  };
}

function projectInlineOperationInputField(
  context: string,
  inputName: string,
  field: Exclude<
    EntityOperationInputFieldSchema,
    {
      field: string;
    }
  >,
  value: unknown,
  provided: boolean,
): OperationInputFieldProjection {
  if (!provided) {
    if (field.required) {
      throw new Error(`${context} field "${inputName}" is required.`);
    }

    return { kind: "omit", inputName };
  }

  if (field.type === "text") {
    if (typeof value !== "string") {
      throw new Error(`${context} field "${inputName}" must be text.`);
    }

    if (value.trim() === "") {
      if (field.required) {
        throw new Error(`${context} field "${inputName}" cannot be empty.`);
      }

      return { kind: "omit", inputName };
    }

    const result = validateTextValueForStorage(field, value);
    if (result.kind === "omit") {
      return { kind: "omit", inputName };
    }

    return { kind: "set", inputName, value: result.value };
  }

  if (field.type === "boolean") {
    if (typeof value !== "boolean") {
      throw new Error(`${context} field "${inputName}" must be a boolean.`);
    }

    return { kind: "set", inputName, value };
  }

  if (field.type === "date") {
    if (typeof value !== "string") {
      throw new Error(`${context} field "${inputName}" must be a date.`);
    }

    if (value.trim() === "") {
      if (field.required) {
        throw new Error(`${context} field "${inputName}" cannot be empty.`);
      }

      return { kind: "omit", inputName };
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error(`${context} field "${inputName}" must be a YYYY-MM-DD date.`);
    }

    return { kind: "set", inputName, value };
  }

  if (field.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${context} field "${inputName}" must be a finite number.`);
    }
    return { kind: "set", inputName, value };
  }
  if (field.type === "enum") {
    if (typeof value !== "string" || value === "" || !definitionsToRecord(field.values)[value]) {
      throw new Error(`${context} field "${inputName}" must be a known enum value.`);
    }
    return { kind: "set", inputName, value };
  }
  return assertUnsupportedOperationInputField(field);
}
function assertOperationInputDoesNotOwnSystemField(context: string, fieldName: string) {
  if (isSystemFieldName(fieldName)) {
    throw new Error(`${context} must not include system field "${fieldName}".`);
  }
}

function operationLabel(input: OperationInputProjectionRequest) {
  if (input.canonicalOperationKey) {
    return `Operation "${input.canonicalOperationKey}"`;
  }

  return "Operation";
}

function parseOperationInputRecord(context: string, value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function assertUnsupportedOperationInputField(field: never): never {
  throw new Error(`Unsupported operation input field "${String(field)}".`);
}
