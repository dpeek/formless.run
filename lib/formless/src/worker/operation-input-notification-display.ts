import type {
  AppSchema,
  EntityOperationInputFieldSchema,
  PublicSafeOperationInputField,
} from "@dpeek/formless-schema";
import { projectPublicSafeOperationInputFields } from "@dpeek/formless-schema";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";

export type OperationInputNotificationDisplayRow = {
  label: string;
  value: string;
};

export function operationInputNotificationDisplayRows(input: {
  response: OperationInvocationResponse;
  schema: AppSchema;
}): OperationInputNotificationDisplayRow[] {
  const entity = input.schema.entities.find(
    (definition) => definition.key === input.response.invocation.operation.entityName,
  )!;
  if (!entity) {
    return [];
  }

  const submittedInput = operationInputNotificationSubmittedInput(input.response);
  const projection = projectPublicSafeOperationInputFields({
    entity,
    operation: input.response.invocation.schemaOperation,
  });
  const operationFields = input.response.invocation.schemaOperation.input?.fields ?? [];
  return projection.fields.flatMap((field) => {
    const value = submittedInputFieldValue(
      submittedInput,
      field.name,
      operationFields.find((definition) => definition.key === field.name),
    );
    if (value === undefined) {
      return [];
    }

    return [
      {
        label: field.label,
        value: displayOperationInputValue(field, value),
      },
    ];
  });
}

export function operationInputNotificationOutputDisplayRows(input: {
  response: OperationInvocationResponse;
  schema: AppSchema;
}): OperationInputNotificationDisplayRow[] {
  if (input.response.output.type !== "command") {
    return [];
  }
  const rows = input.response.output.changes.flatMap((change) => {
    const entity = input.schema.entities.find((definition) => definition.key === change.entity)!;
    if (!entity) {
      return [];
    }
    return Object.entries(change.payload.values).flatMap(([fieldName, value]) => {
      const field = entity.fields.find((definition) => definition.key === fieldName)!;
      if (!field) {
        return [];
      }

      return [
        {
          entityLabel: entity.label ?? change.entity,
          label: field.label ?? fieldName,
          value: displayFieldValue(field, value),
        },
      ];
    });
  });

  return disambiguateDuplicateOutputLabels(rows);
}

export function operationInputNotificationSubmittedInput(
  response: OperationInvocationResponse,
): Record<string, unknown> {
  const invocationInput = response.invocation.input;

  if (invocationInput.type === "create") {
    return recordValue(invocationInput.values);
  }

  if (invocationInput.type !== "command") {
    return {};
  }

  if (response.invocation.operation.effect?.type === "recordPlan") {
    return recordValue(invocationInput.input);
  }

  return recordValue(recordValue(invocationInput.input).input);
}

function submittedInputFieldValue(
  input: Record<string, unknown>,
  inputName: string,
  field: EntityOperationInputFieldSchema | undefined,
): unknown {
  if (Object.hasOwn(input, inputName)) {
    return input[inputName];
  }

  if (field && "field" in field && Object.hasOwn(input, field.field)) {
    return input[field.field];
  }

  return undefined;
}

function displayOperationInputValue(field: PublicSafeOperationInputField, value: unknown): string {
  if (field.control === "boolean") {
    return value === true ? "Yes" : value === false ? "No" : String(value);
  }

  if (field.control === "enum" && typeof value === "string") {
    return field.options?.find((option) => option.value === value)?.label ?? value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  return String(value);
}
function displayFieldValue(
  field: AppSchema["entities"][number]["fields"][number],
  value: unknown,
): string {
  if (field.type === "boolean") {
    return value === true ? "Yes" : value === false ? "No" : String(value);
  }
  if (field.type === "enum" && typeof value === "string") {
    return field.values.find((definition) => definition.key === value)?.label ?? value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  return String(value);
}
function disambiguateDuplicateOutputLabels(
  rows: Array<
    OperationInputNotificationDisplayRow & {
      entityLabel: string;
    }
  >,
): OperationInputNotificationDisplayRow[] {
  const labelCounts = new Map<string, number>();
  for (const row of rows) {
    labelCounts.set(row.label, (labelCounts.get(row.label) ?? 0) + 1);
  }

  return rows.map((row) => ({
    label: labelCounts.get(row.label) === 1 ? row.label : `${row.entityLabel} ${row.label}`,
    value: row.value,
  }));
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
