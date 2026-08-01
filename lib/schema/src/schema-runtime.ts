import {
  assertExactKeys,
  definitionsToRecord,
  isRecord,
  parseRequiredNonEmptyString,
} from "./schema-parse-helpers.ts";
import type {
  AppSchema,
  EntityOperationKind,
  EntitySchema,
  RuntimeSchemaControlPlaneEntitySchema,
  RuntimeSchemaControlPlaneSchema,
  RuntimeSchemaHistorySchema,
  RuntimeSchemaMetadata,
} from "./types.ts";

const runtimeSchemaHistoryKinds = [
  "appendOnly",
  "operationCreated",
] as const satisfies readonly RuntimeSchemaHistorySchema["kind"][];

function isRuntimeSchemaHistoryKind(value: unknown): value is RuntimeSchemaHistorySchema["kind"] {
  return runtimeSchemaHistoryKinds.includes(value as RuntimeSchemaHistorySchema["kind"]);
}

export function parseRuntimeMetadata(
  value: unknown,
  entities: Record<string, EntitySchema>,
): RuntimeSchemaMetadata | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error("Schema runtime metadata must be an object.");
  }

  assertExactKeys("Schema runtime metadata", value, ["owner"], ["controlPlane"]);

  if (value.owner !== "runtime") {
    throw new Error('Schema runtime metadata owner must be "runtime".');
  }

  return {
    owner: "runtime",
    ...(value.controlPlane === undefined
      ? {}
      : { controlPlane: parseControlPlaneMetadata(value.controlPlane, entities) }),
  };
}

export function runtimeControlPlaneEntityMetadata(
  schema: AppSchema,
  entityName: string,
): RuntimeSchemaControlPlaneEntitySchema | undefined {
  return schema.runtime?.controlPlane?.entities[entityName];
}

export function isRuntimeControlPlaneImmutableField(
  schema: AppSchema,
  entityName: string,
  fieldName: string,
) {
  return (
    runtimeControlPlaneEntityMetadata(schema, entityName)?.immutableFields?.includes(fieldName) ??
    false
  );
}

export function isRuntimeControlPlaneSecretReferenceField(
  schema: AppSchema,
  entityName: string,
  fieldName: string,
) {
  return (
    runtimeControlPlaneEntityMetadata(schema, entityName)?.secretReferenceFields?.includes(
      fieldName,
    ) ?? false
  );
}

export function isRuntimeControlPlaneObservedField(
  schema: AppSchema,
  entityName: string,
  fieldName: string,
) {
  return (
    runtimeControlPlaneEntityMetadata(schema, entityName)?.observedFields?.includes(fieldName) ??
    false
  );
}

function parseControlPlaneMetadata(
  value: unknown,
  entities: Record<string, EntitySchema>,
): RuntimeSchemaControlPlaneSchema {
  if (!isRecord(value)) {
    throw new Error("Schema runtime controlPlane metadata must be an object.");
  }

  assertExactKeys("Schema runtime controlPlane metadata", value, ["entities"]);

  if (!isRecord(value.entities)) {
    throw new Error("Schema runtime controlPlane entities must be an object.");
  }

  const entries = Object.entries(value.entities);
  if (entries.length === 0) {
    throw new Error("Schema runtime controlPlane entities must not be empty.");
  }

  return {
    entities: Object.fromEntries(
      entries.map(([entityName, entityMetadata]) => {
        const entity = entities[entityName];
        if (!entity) {
          throw new Error(
            `Schema runtime controlPlane entity "${entityName}" references unknown entity.`,
          );
        }

        return [entityName, parseControlPlaneEntityMetadata(entityName, entityMetadata, entity)];
      }),
    ),
  };
}

function parseControlPlaneEntityMetadata(
  entityName: string,
  value: unknown,
  entity: EntitySchema,
): RuntimeSchemaControlPlaneEntitySchema {
  const context = `Schema runtime controlPlane entity "${entityName}"`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(
    context,
    value,
    [],
    ["history", "immutableFields", "observedFields", "secretReferenceFields"],
  );

  const immutableFields = parseKnownFieldNames(
    `${context} immutableFields`,
    value.immutableFields,
    entity,
  );
  const observedFields = parseKnownFieldNames(
    `${context} observedFields`,
    value.observedFields,
    entity,
  );
  const secretReferenceFields = parseSecretReferenceFieldNames(
    `${context} secretReferenceFields`,
    value.secretReferenceFields,
    entity,
  );
  const history = parseHistory(`${context} history`, value.history, entity);

  if (
    immutableFields === undefined &&
    observedFields === undefined &&
    secretReferenceFields === undefined &&
    history === undefined
  ) {
    throw new Error(`${context} must declare at least one runtime policy.`);
  }

  return {
    ...(immutableFields === undefined ? {} : { immutableFields }),
    ...(observedFields === undefined ? {} : { observedFields }),
    ...(secretReferenceFields === undefined ? {} : { secretReferenceFields }),
    ...(history === undefined ? {} : { history }),
  };
}

function parseKnownFieldNames(
  context: string,
  value: unknown,
  entity: EntitySchema,
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context} must be a non-empty array.`);
  }

  const names = value.map((fieldName, index) => {
    const name = parseRequiredNonEmptyString(`${context}[${index}]`, fieldName);
    assertKnownField(context, entity, name);
    return name;
  });

  assertUniqueStrings(context, names);

  return names;
}

function parseSecretReferenceFieldNames(
  context: string,
  value: unknown,
  entity: EntitySchema,
): string[] | undefined {
  const names = parseKnownFieldNames(context, value, entity);

  if (names === undefined) {
    return undefined;
  }
  for (const fieldName of names) {
    const field = definitionsToRecord(entity.fields)[fieldName];
    if (field?.type !== "text" && field?.type !== "reference") {
      throw new Error(`${context} field "${fieldName}" must be text or reference.`);
    }
  }

  return names;
}

function parseHistory(
  context: string,
  value: unknown,
  entity: EntitySchema,
): RuntimeSchemaHistorySchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["kind"]);

  if (!isRuntimeSchemaHistoryKind(value.kind)) {
    throw new Error(`${context} kind must be "appendOnly" or "operationCreated".`);
  }

  if (value.kind === "appendOnly") {
    if (entityHasOperationKind(entity, "update") || entityHasOperationKind(entity, "delete")) {
      throw new Error(
        `${context} appendOnly entities must not declare update or delete operations.`,
      );
    }
  } else if (entityHasOperationKind(entity, "create", "update", "delete")) {
    throw new Error(
      `${context} operationCreated entities must not declare create, update, or delete operations.`,
    );
  }
  return { kind: value.kind };
}
function entityHasOperationKind(entity: EntitySchema, ...kinds: EntityOperationKind[]): boolean {
  return (entity.operations ?? []).some((operation) => kinds.includes(operation.kind));
}
function assertKnownField(context: string, entity: EntitySchema, fieldName: string) {
  if (!definitionsToRecord(entity.fields)[fieldName]) {
    throw new Error(`${context} references unknown field "${fieldName}".`);
  }
}

function assertUniqueStrings(context: string, values: string[]) {
  if (new Set(values).size !== values.length) {
    throw new Error(`${context} must be unique.`);
  }
}
