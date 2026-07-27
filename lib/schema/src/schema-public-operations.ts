import {
  getOperationHandlerCapabilities,
  isOperationHandlerEffect,
} from "./schema-operation-execution.ts";
import { formatEntityOperationKey, parseEntityOperationKey } from "./schema-operations.ts";
import type {
  AppSchema,
  EntityOperationInputFieldSchema,
  EntityOperationSchema,
  EntitySchema,
  ContactTextFieldFormat,
  FieldSchema,
  TextFieldFormat,
} from "./types.ts";

export type AnonymousPublicOperationExecutionKind =
  | "create"
  | "recordPlanCommand"
  | "handlerCommand";

export type AnonymousPublicOperationFacts = {
  canonicalKey: string;
  entity: EntitySchema;
  entityName: string;
  executionKind: AnonymousPublicOperationExecutionKind;
  operation: EntityOperationSchema;
  operationName: string;
};

export type AnonymousPublicOperationUnavailableReason =
  | "invalid-key"
  | "missing-operation"
  | "unsupported-effect"
  | "unsupported-policy"
  | "missing-input";

export type AnonymousPublicOperationSelection =
  | ({ kind: "available" } & AnonymousPublicOperationFacts)
  | {
      kind: "unavailable";
      reason: AnonymousPublicOperationUnavailableReason;
      message: string;
    };

export type PublicSafeOperationInputControl =
  | "text"
  | "longText"
  | "boolean"
  | "date"
  | "number"
  | "enum";

export type PublicSafeOperationInputFieldOption = {
  value: string;
  label: string;
};

export type PublicSafeOperationInputField = {
  name: string;
  label: string;
  required: boolean;
  mustBeTrue?: true;
  control: PublicSafeOperationInputControl;
  format?: ContactTextFieldFormat;
  suggestions?: string[];
  options?: PublicSafeOperationInputFieldOption[];
};

export type PublicSafeOperationInputProjection = {
  fields: PublicSafeOperationInputField[];
  unsupportedRequiredFields: string[];
};

export function selectAnonymousPublicOperationByKey(
  schema: AppSchema,
  operationKey: string,
): AnonymousPublicOperationSelection {
  let parsed: ReturnType<typeof parseEntityOperationKey>;

  try {
    parsed = parseEntityOperationKey("Public operation key", operationKey);
  } catch (error) {
    return {
      kind: "unavailable",
      reason: "invalid-key",
      message: error instanceof Error ? error.message : "Public operation key is invalid.",
    };
  }

  return selectAnonymousPublicOperation(schema, {
    entityName: parsed.entityKey,
    operationName: parsed.operationKey,
  });
}

export function selectAnonymousPublicOperation(
  schema: AppSchema,
  input: { entityName: string; operationName: string },
): AnonymousPublicOperationSelection {
  const entity = schema.entities[input.entityName];
  const operation = entity?.operations?.[input.operationName];
  const fallbackKey = `${input.entityName}.${input.operationName}`;

  if (!entity || !operation) {
    return {
      kind: "unavailable",
      reason: "missing-operation",
      message: `Public operation "${fallbackKey}" does not exist.`,
    };
  }

  const canonicalKey = formatEntityOperationKey({
    entityKey: input.entityName,
    operationKey: input.operationName,
  });

  const executionKind = anonymousPublicOperationExecutionKind(operation);

  if (!executionKind) {
    return {
      kind: "unavailable",
      reason: "unsupported-effect",
      message: `Public operation "${canonicalKey}" is not publicly executable.`,
    };
  }

  if (!hasAnonymousTurnstileSameOriginAccess(operation)) {
    return {
      kind: "unavailable",
      reason: "unsupported-policy",
      message: `Public operation "${canonicalKey}" is not available to anonymous same-origin Turnstile callers.`,
    };
  }

  if (!operation.input) {
    return {
      kind: "unavailable",
      reason: "missing-input",
      message: `Public operation "${canonicalKey}" does not declare input fields.`,
    };
  }

  return {
    kind: "available",
    canonicalKey,
    entity,
    entityName: input.entityName,
    executionKind,
    operation,
    operationName: input.operationName,
  };
}

export function hasAnonymousTurnstileSameOriginAccess(operation: EntityOperationSchema): boolean {
  const access = operation.policy?.access;

  return (
    operation.policy?.actors.includes("anonymous") === true &&
    access !== undefined &&
    access.actor === "anonymous" &&
    access.challenge.kind === "turnstile" &&
    access.origin.kind === "same-origin"
  );
}

export function isAnonymousPublicOperationExecutable(operation: EntityOperationSchema): boolean {
  return anonymousPublicOperationExecutionKind(operation) !== undefined;
}

export function anonymousPublicOperationExecutionKind(
  operation: EntityOperationSchema,
): AnonymousPublicOperationExecutionKind | undefined {
  if (
    operation.kind === "create" &&
    operation.scope === "collection" &&
    operation.effect?.type === "createRecord" &&
    operation.output.type === "create"
  ) {
    return "create";
  }

  if (operation.kind !== "command" || operation.output.type !== "command") {
    return undefined;
  }

  if (operation.effect?.type === "recordPlan") {
    return "recordPlanCommand";
  }

  if (
    isOperationHandlerEffect(operation.effect) &&
    getOperationHandlerCapabilities(operation.effect.handler).publicExecution
  ) {
    return "handlerCommand";
  }

  return undefined;
}

export function projectPublicSafeOperationInputFields(input: {
  entity: EntitySchema;
  operation: EntityOperationSchema;
}): PublicSafeOperationInputProjection {
  const fields: PublicSafeOperationInputField[] = [];
  const unsupportedRequiredFields: string[] = [];

  for (const [inputName, field] of Object.entries(input.operation.input?.fields ?? {})) {
    const projected = projectPublicSafeOperationInputField(inputName, field, input.entity.fields);

    if (projected) {
      fields.push(projected);
      continue;
    }

    if (isOperationInputFieldRequired(field)) {
      unsupportedRequiredFields.push(inputName);
    }
  }

  return { fields, unsupportedRequiredFields };
}

export function projectPublicSafeOperationInputField(
  inputName: string,
  field: EntityOperationInputFieldSchema,
  entityFields: Record<string, FieldSchema>,
): PublicSafeOperationInputField | undefined {
  if ("field" in field) {
    const entityField = entityFields[field.field];

    if (!entityField) {
      return undefined;
    }

    return projectScalarPublicSafeOperationInputField(
      inputName,
      field.label,
      field.required ?? false,
      entityField,
      field.mustBeTrue,
    );
  }

  return projectScalarPublicSafeOperationInputField(inputName, field.label, field.required, field);
}

function projectScalarPublicSafeOperationInputField(
  inputName: string,
  label: string | undefined,
  required: boolean,
  field: FieldSchema,
  mustBeTrue?: true,
): PublicSafeOperationInputField | undefined {
  const fieldLabel = label ?? field.label ?? inputName;

  if (field.type === "text") {
    const format = publicSafeTextFormat(field.format);
    const suggestions = field.suggestions;

    return {
      name: inputName,
      label: fieldLabel,
      required,
      control: field.format === "longText" || field.format === "markdown" ? "longText" : "text",
      ...(format === undefined ? {} : { format }),
      ...(suggestions === undefined ? {} : { suggestions }),
    };
  }

  if (field.type === "boolean" || field.type === "date" || field.type === "number") {
    return {
      name: inputName,
      label: fieldLabel,
      required,
      ...(field.type === "boolean" && mustBeTrue ? { mustBeTrue } : {}),
      control: field.type,
    };
  }

  if (field.type === "enum") {
    return {
      name: inputName,
      label: fieldLabel,
      required,
      control: "enum",
      options: Object.entries(field.values).map(([value, option]) => ({
        value,
        label: option.label,
      })),
    };
  }

  return undefined;
}

function isOperationInputFieldRequired(field: EntityOperationInputFieldSchema): boolean {
  return "field" in field ? field.required === true : field.required;
}

function publicSafeTextFormat(
  format: TextFieldFormat | undefined,
): ContactTextFieldFormat | undefined {
  return format === "email" || format === "phone" ? format : undefined;
}
