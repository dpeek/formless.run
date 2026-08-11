import {
  assertExactKeys,
  definitionsToRecord,
  isRecord,
  parseRequiredNonEmptyString,
} from "./schema-parse-helpers.ts";
import { parseFieldCommitPolicy, parseFieldEditor } from "./schema-view-field-parser.ts";
import { isSystemFieldName } from "./fields.ts";
import { getFieldTypeBehavior, isFieldCommitPolicy, isFieldEditor } from "./field-types.ts";
import type {
  CreateViewFieldSchema,
  CreateViewFieldBindingSchema,
  EntitySchema,
  FieldPresentationSchema,
  FieldSchema,
  FieldVisibilityConditionSchema,
  FieldVisibilityValue,
  ViewFieldSchema,
  ViewFieldBindingSchema,
} from "./types.ts";
export function parseListViewFields(
  viewName: string,
  entityName: string,
  value: unknown,
  entity: EntitySchema,
): ViewFieldBindingSchema[] {
  if (!Array.isArray(value)) {
    throw new Error(`View "${viewName}" fields must be an array.`);
  }
  const fields = value.map((field, index) => {
    if (!isRecord(field)) {
      throw new Error(`View "${viewName}" field ${index} must be an object.`);
    }
    const fieldName = parseRequiredNonEmptyString(
      `View "${viewName}" field ${index} field`,
      field.field,
    );
    return {
      field: fieldName,
      ...parseListViewField(viewName, entityName, fieldName, field, entity),
    };
  });
  assertUniqueViewFields(viewName, fields);
  return fields;
}
function parseListViewField(
  viewName: string,
  entityName: string,
  fieldName: string,
  value: unknown,
  entity: EntitySchema,
): ViewFieldSchema & { interaction?: "edit" | "display" } {
  if (!isRecord(value)) {
    throw new Error(`View field "${viewName}.${fieldName}" must be an object.`);
  }
  const allowedKeys = new Set([
    "field",
    "interaction",
    "editor",
    "commit",
    "visibleWhen",
    "presentation",
  ]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`View field "${viewName}.${fieldName}" has unsupported key "${key}".`);
    }
  }
  const field = definitionsToRecord(entity.fields)[fieldName];
  const systemField = field === undefined && isSystemFieldName(fieldName);
  if (!field && !systemField) {
    throw new Error(`View "${viewName}" references unknown field "${entityName}.${fieldName}".`);
  }

  const context = `View field "${viewName}.${fieldName}"`;
  const interaction = value.interaction;
  if (interaction !== undefined && interaction !== "edit" && interaction !== "display") {
    throw new Error(`${context} has unsupported interaction "${formatUnknownValue(interaction)}".`);
  }
  const visibleWhen = parseFieldVisibilityCondition(context, value.visibleWhen, entity);
  const presentation =
    field === undefined
      ? undefined
      : parseOptionalFieldPresentation(context, value.presentation, field);

  const editor =
    field === undefined
      ? parseSystemFieldEditor(context, value.editor)
      : parseFieldEditor(
          context,
          interaction === "display" && value.editor === undefined
            ? getFieldTypeBehavior(field).defaultEditor
            : value.editor,
          field,
        );
  const commit =
    field === undefined
      ? parseSystemFieldCommitPolicy(context, value.commit)
      : parseFieldCommitPolicy(
          context,
          interaction === "display" && value.commit === undefined
            ? getFieldTypeBehavior(field).defaultCommit
            : value.commit,
          field,
        );

  return {
    editor,
    commit,
    ...(interaction === undefined ? {} : { interaction }),
    ...(visibleWhen === undefined ? {} : { visibleWhen }),
    ...(presentation === undefined ? {} : { presentation }),
  };
}

export function parseCreateViewFields(
  viewName: string,
  entityName: string,
  value: unknown,
  entity: EntitySchema,
): CreateViewFieldBindingSchema[] {
  if (!Array.isArray(value)) {
    throw new Error(`View "${viewName}" fields must be an array.`);
  }
  const fields = value.map((field, index) => {
    if (!isRecord(field)) {
      throw new Error(`View "${viewName}" field ${index} must be an object.`);
    }
    const fieldName = parseRequiredNonEmptyString(
      `View "${viewName}" field ${index} field`,
      field.field,
    );
    return {
      field: fieldName,
      ...parseCreateViewField(viewName, entityName, fieldName, field, entity),
    };
  });
  assertUniqueViewFields(viewName, fields);
  return fields;
}
function parseCreateViewField(
  viewName: string,
  entityName: string,
  fieldName: string,
  value: unknown,
  entity: EntitySchema,
): CreateViewFieldSchema {
  if (!isRecord(value)) {
    throw new Error(`View field "${viewName}.${fieldName}" must be an object.`);
  }
  const allowedKeys = new Set(["field", "editor", "visibleWhen", "presentation"]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`View field "${viewName}.${fieldName}" has unsupported key "${key}".`);
    }
  }
  const field = definitionsToRecord(entity.fields)[fieldName];
  const systemField = field === undefined && isSystemFieldName(fieldName);
  if (!field && !systemField) {
    throw new Error(`View "${viewName}" references unknown field "${entityName}.${fieldName}".`);
  }

  const context = `View field "${viewName}.${fieldName}"`;
  const editor =
    field === undefined
      ? parseSystemFieldEditor(context, value.editor)
      : parseFieldEditor(context, value.editor, field);
  const visibleWhen = parseFieldVisibilityCondition(context, value.visibleWhen, entity);
  const presentation =
    field === undefined
      ? undefined
      : parseOptionalFieldPresentation(context, value.presentation, field);

  return {
    editor,
    ...(visibleWhen === undefined ? {} : { visibleWhen }),
    ...(presentation === undefined ? {} : { presentation }),
  };
}

function parseSystemFieldEditor(context: string, value: unknown): "text" {
  if (value === undefined) {
    return "text";
  }

  if (!isFieldEditor(value)) {
    throw new Error(`${context} has unsupported editor "${formatUnknownValue(value)}".`);
  }

  return "text";
}

function parseSystemFieldCommitPolicy(context: string, value: unknown): "field-commit" {
  if (value === undefined) {
    return "field-commit";
  }

  if (!isFieldCommitPolicy(value)) {
    throw new Error(`${context} has unsupported commit policy "${formatUnknownValue(value)}".`);
  }

  return "field-commit";
}

export function parseOptionalFieldPresentation(
  context: string,
  value: unknown,
  field: FieldSchema,
): FieldPresentationSchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} presentation must be an object.`);
  }

  assertExactKeys(`${context} presentation`, value, [], ["list", "mode", "trigger", "visibility"]);

  const list = parseOptionalFieldPresentationEnumContent(context, "list", value.list, field);
  const mode = parseOptionalFieldPresentationMode(context, value.mode, field);
  const trigger = parseOptionalFieldPresentationEnumContent(
    context,
    "trigger",
    value.trigger,
    field,
  );
  const visibility = parseOptionalFieldPresentationVisibility(context, value.visibility, field);

  if (
    list === undefined &&
    mode === undefined &&
    trigger === undefined &&
    visibility === undefined
  ) {
    throw new Error(
      `${context} presentation must include "list", "mode", "trigger", or "visibility".`,
    );
  }

  return {
    ...(list === undefined ? {} : { list }),
    ...(mode === undefined ? {} : { mode }),
    ...(trigger === undefined ? {} : { trigger }),
    ...(visibility === undefined ? {} : { visibility }),
  };
}

function parseOptionalFieldPresentationEnumContent(
  context: string,
  key: "list" | "trigger",
  value: unknown,
  field: FieldSchema,
): FieldPresentationSchema["list"] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "icon" && value !== "label" && value !== "both") {
    throw new Error(`${context} presentation ${key} must be "icon", "label", or "both".`);
  }

  if (field.type !== "enum") {
    throw new Error(`${context} presentation ${key} requires an enum field.`);
  }

  return value;
}

function parseOptionalFieldPresentationMode(
  context: string,
  value: unknown,
  field: FieldSchema,
): FieldPresentationSchema["mode"] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "iconOnly" && value !== "completion") {
    throw new Error(`${context} presentation mode must be "iconOnly" or "completion".`);
  }

  if (value === "iconOnly" && field.type !== "enum") {
    throw new Error(`${context} iconOnly presentation requires an enum field.`);
  }

  if (value === "completion" && field.type !== "boolean") {
    throw new Error(`${context} completion presentation requires a boolean field.`);
  }

  return value;
}

function parseOptionalFieldPresentationVisibility(
  context: string,
  value: unknown,
  field: FieldSchema,
): FieldPresentationSchema["visibility"] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "valueOrInteraction") {
    throw new Error(`${context} presentation visibility must be "valueOrInteraction".`);
  }

  if (field.type !== "date" || field.required) {
    throw new Error(`${context} valueOrInteraction visibility requires an optional date field.`);
  }

  return value;
}

function parseFieldVisibilityCondition(
  context: string,
  value: unknown,
  entity: EntitySchema,
): FieldVisibilityConditionSchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} visibleWhen must be an object.`);
  }
  assertExactKeys(`${context} visibleWhen`, value, ["field", "values"]);
  const fieldName = parseRequiredNonEmptyString(`${context} visibleWhen field`, value.field);
  const field = definitionsToRecord(entity.fields)[fieldName];
  if (!field) {
    throw new Error(`${context} visibleWhen references unknown field "${fieldName}".`);
  }

  if (!Array.isArray(value.values) || value.values.length === 0) {
    throw new Error(`${context} visibleWhen values must be a non-empty array.`);
  }

  return {
    field: fieldName,
    values: value.values.map((candidate, index) =>
      parseFieldVisibilityValue(`${context} visibleWhen values[${index}]`, candidate, field),
    ),
  };
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

export function parseFieldVisibilityValue(
  context: string,
  value: unknown,
  field: FieldSchema,
): FieldVisibilityValue {
  if (field.type === "boolean") {
    if (typeof value !== "boolean") {
      throw new Error(`${context} must be a boolean.`);
    }

    return value;
  }

  if (field.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${context} must be a finite number.`);
    }

    return value;
  }

  if (typeof value !== "string") {
    throw new Error(`${context} must be a string.`);
  }
  if (field.type === "enum" && value !== "" && !definitionsToRecord(field.values)[value]) {
    throw new Error(`${context} must be a known enum value.`);
  }
  return value;
}
export function assertViewHasFields(viewName: string, fields: readonly unknown[]) {
  if (fields.length === 0) {
    throw new Error(`View "${viewName}" must define at least one field.`);
  }
}
function assertUniqueViewFields(
  viewName: string,
  fields: readonly {
    field: string;
  }[],
): void {
  const seen = new Set<string>();
  for (const field of fields) {
    if (seen.has(field.field)) {
      throw new Error(`View "${viewName}" fields reference duplicate "${field.field}".`);
    }
    seen.add(field.field);
  }
}
