import {
  isSystemFieldName,
  isSupportedIdentityReferenceTarget,
  isValidStoredFieldValue as isValidStoredFieldValueForType,
  parseAppSchema,
  runtimeControlPlaneEntityMetadata,
  shouldValidateExistingFieldValue,
  validateAuthorityFieldValue,
} from "@dpeek/formless-schema";
import type { AppSchema, EntityOperationKind, EntitySchema } from "@dpeek/formless-schema";
import { parseStorageSnapshot } from "@dpeek/formless-storage";
import type { RecordValues, StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import type {
  CreateRecordWriteRequest,
  DeleteRecordWriteRequest,
  PatchRecordWriteRequest,
  RecordWriteKind,
  RecordWriteRequest,
} from "./record-write-requests.ts";
import {
  assertExistingRecordsSatisfyUniqueConstraints,
  assertUniqueConstraintsForActiveRecords,
} from "./constraints.ts";
import { BadRequestError } from "./errors.ts";
import type {
  IdentityReferenceTargetResolution,
  IdentityReferenceTargetResolver,
} from "./identity-reference-targets.ts";
import type { AuthorityRecordValidationReader } from "./authority-record-validation-reader.ts";
import type { WriteOutcome } from "./storage.ts";
import type { RecordWriteResponse } from "./storage-write-log.ts";
import { assertEntityIdentityContinuity } from "./entity-identity-continuity.ts";
export type ValidatedRecordWrite =
  | {
      recordWrite:
        | RecordWriteRequest
        | (PatchRecordWriteRequest & {
            recordValues: RecordValues;
          });
    }
  | {
      outcome: WriteOutcome<RecordWriteResponse>;
    };

type RecordWriteValidationOptions = {
  additionalRecords?: StoredRecord[];
  allowStoredReplay?: boolean;
  enforceGenericRecordWritePolicy?: boolean;
  identityReferenceResolver?: IdentityReferenceTargetResolver;
};

export function validateRecordWriteRequest(
  value: unknown,
  schema: AppSchema,
  reader: AuthorityRecordValidationReader,
  options: RecordWriteValidationOptions = {},
): ValidatedRecordWrite {
  const prepared = prepareRecordWriteValidation(value, schema, reader, options);

  if (prepared.kind === "complete") {
    return prepared.result;
  }

  const recordValues = validateRecordValues(
    prepared.values,
    prepared.entitySchema,
    reader,
    recordValueValidationOptions(prepared, schema, options),
  );
  assertRecordWriteUniqueConstraints(prepared, recordValues, schema, reader, options);

  return buildValidatedRecordWrite(prepared, recordValues);
}

export async function validateRecordWriteRequestAsync(
  value: unknown,
  schema: AppSchema,
  reader: AuthorityRecordValidationReader,
  options: RecordWriteValidationOptions = {},
): Promise<ValidatedRecordWrite> {
  const prepared = prepareRecordWriteValidation(value, schema, reader, options);

  if (prepared.kind === "complete") {
    return prepared.result;
  }

  const recordValues = await validateRecordValuesAsync(
    prepared.values,
    prepared.entitySchema,
    reader,
    recordValueValidationOptions(prepared, schema, options),
  );
  assertRecordWriteUniqueConstraints(prepared, recordValues, schema, reader, options);
  return buildValidatedRecordWrite(prepared, recordValues);
}
function assertRecordWriteUniqueConstraints(
  prepared: Exclude<
    PreparedRecordWriteValidation,
    {
      kind: "complete";
    }
  >,
  recordValues: RecordValues,
  schema: AppSchema,
  reader: AuthorityRecordValidationReader,
  options: RecordWriteValidationOptions,
) {
  assertUniqueConstraintsForActiveRecords(
    schema,
    prepared.entityName,
    recordValues,
    getActiveRecordsForValidation(reader, options.additionalRecords),
    prepared.kind === "patch" ? { ignoreRecordId: prepared.recordId } : {},
  );
}
type PreparedRecordWriteValidation =
  | {
      kind: "complete";
      result: ValidatedRecordWrite;
    }
  | {
      entityName: string;
      entitySchema: EntitySchema;
      kind: "create";
      recordId?: string;
      values: Record<string, unknown>;
      writeId: string;
    }
  | {
      entityName: string;
      entitySchema: EntitySchema;
      kind: "patch";
      patchValues: Partial<RecordValues>;
      recordId: string;
      values: Record<string, unknown>;
      writeId: string;
    };

function prepareRecordWriteValidation(
  value: unknown,
  schema: AppSchema,
  reader: AuthorityRecordValidationReader,
  options: RecordWriteValidationOptions,
): PreparedRecordWriteValidation {
  if (!isRecord(value)) {
    throw new BadRequestError("Record write request must be an object.");
  }

  if (typeof value.writeId !== "string" || value.writeId.trim() === "") {
    throw new BadRequestError("Record write request must include a non-empty writeId.");
  }

  if (value.kind !== "create" && value.kind !== "patch" && value.kind !== "delete") {
    throw new BadRequestError('Only "create", "patch", and "delete" record writes are supported.');
  }

  if (typeof value.entity !== "string") {
    throw new BadRequestError("Record write request must include an entity.");
  }
  const entity = schema.entities.find((definition) => definition.key === value.entity)!;
  if (!entity) {
    throw new BadRequestError(`Unknown entity "${value.entity}".`);
  }

  if (options.allowStoredReplay !== false) {
    const replay = reader.readStoredReplay(value.writeId);
    if (replay) {
      return { kind: "complete", result: { outcome: { kind: "replay", response: replay } } };
    }
  }

  if (options.enforceGenericRecordWritePolicy !== false) {
    assertRuntimeHistoryAllowsGenericRecordWrite(schema, value.entity, value.kind);

    if (value.kind === "create" && !entityHasOperationKind(entity, "create")) {
      throw new BadRequestError(`Create record writes are disabled for entity "${value.entity}".`);
    }

    if (value.kind === "patch" && !entityHasOperationKind(entity, "update")) {
      throw new BadRequestError(`Patch record writes are disabled for entity "${value.entity}".`);
    }

    if (value.kind === "delete" && !entityHasOperationKind(entity, "delete")) {
      throw new BadRequestError(`Delete record writes are disabled for entity "${value.entity}".`);
    }
  }

  if (value.kind === "delete") {
    if ("values" in value) {
      throw new BadRequestError("Delete record write must not include values.");
    }

    if (typeof value.recordId !== "string" || value.recordId.trim() === "") {
      throw new BadRequestError("Delete record write must include a recordId.");
    }

    const existingRecord = getStoredRecordForValidation(
      reader,
      value.recordId,
      options.additionalRecords,
    );
    if (!existingRecord) {
      throw new BadRequestError(`Unknown record "${value.recordId}".`);
    }

    if (existingRecord.entity !== value.entity) {
      throw new BadRequestError("Delete entity must match the stored record entity.");
    }

    if (existingRecord.deletedAt) {
      throw new BadRequestError(`Cannot delete tombstoned record "${value.recordId}".`);
    }

    assertNoActiveInboundReferences(existingRecord, schema, reader, options.additionalRecords);

    return {
      kind: "complete",
      result: {
        recordWrite: {
          writeId: value.writeId,
          entity: value.entity,
          kind: "delete",
          recordId: value.recordId,
        } satisfies DeleteRecordWriteRequest,
      },
    };
  }

  if (!isRecord(value.values)) {
    throw new BadRequestError("Record write request values must be an object.");
  }

  if (
    value.kind === "create" &&
    value.id !== undefined &&
    (typeof value.id !== "string" || value.id.trim() === "")
  ) {
    throw new BadRequestError("Create record write id must be a non-empty string.");
  }

  if (value.kind === "patch") {
    if (typeof value.recordId !== "string" || value.recordId.trim() === "") {
      throw new BadRequestError("Patch record write must include a recordId.");
    }

    const existingRecord = getStoredRecordForValidation(
      reader,
      value.recordId,
      options.additionalRecords,
    );
    if (!existingRecord) {
      throw new BadRequestError(`Unknown record "${value.recordId}".`);
    }

    if (existingRecord.entity !== value.entity) {
      throw new BadRequestError("Patch entity must match the stored record entity.");
    }

    if (existingRecord.deletedAt) {
      throw new BadRequestError(`Cannot patch tombstoned record "${value.recordId}".`);
    }

    const patchValues = validatePatchValues(value.values, entity);
    assertImmutableFieldsNotPatched(schema, value.entity, patchValues);
    assertStateMachineFieldsNotPatched(value.entity, entity, existingRecord, patchValues);

    return {
      kind: "patch",
      entityName: value.entity,
      entitySchema: entity,
      patchValues,
      recordId: value.recordId,
      values: { ...existingRecord.values, ...patchValues },
      writeId: value.writeId,
    };
  }

  return {
    kind: "create",
    entityName: value.entity,
    entitySchema: entity,
    ...(typeof value.id === "string" ? { recordId: value.id } : {}),
    values: normalizeStateMachineCreateValues(value.entity, entity, value.values),
    writeId: value.writeId,
  };
}
function recordValueValidationOptions(
  prepared: Exclude<
    PreparedRecordWriteValidation,
    {
      kind: "complete";
    }
  >,
  schema: AppSchema,
  options: RecordWriteValidationOptions,
): RuntimeRecordValueValidationOptions {
  return {
    additionalRecords: options.additionalRecords,
    entityName: prepared.entityName,
    identityReferenceResolver: options.identityReferenceResolver,
    schema,
  };
}
function buildValidatedRecordWrite(
  prepared: Exclude<
    PreparedRecordWriteValidation,
    {
      kind: "complete";
    }
  >,
  recordValues: RecordValues,
): ValidatedRecordWrite {
  if (prepared.kind === "patch") {
    return {
      recordWrite: {
        writeId: prepared.writeId,
        entity: prepared.entityName,
        kind: "patch",
        recordId: prepared.recordId,
        values: prepared.patchValues,
        recordValues,
      },
    };
  }

  return {
    recordWrite: {
      writeId: prepared.writeId,
      entity: prepared.entityName,
      ...("recordId" in prepared ? { id: prepared.recordId } : {}),
      kind: "create",
      values: recordValues,
    } satisfies CreateRecordWriteRequest,
  };
}

export function validateSchemaUpdateRequest(
  value: unknown,
  currentSchema: AppSchema,
  records: StoredRecord[],
): AppSchema {
  if (!isRecord(value)) {
    throw new BadRequestError("Schema update must be an object.");
  }

  let nextSchema: AppSchema;
  try {
    nextSchema = parseAppSchema(value.schema);
  } catch (error) {
    throw new BadRequestError(error instanceof Error ? error.message : "Schema is invalid.");
  }

  validateCompatibleSchemaChange(currentSchema, nextSchema, records);
  assertExistingRecordsSatisfyUniqueConstraints(nextSchema, records);

  return nextSchema;
}

export function validateSourceSchemaReset(
  currentSchema: AppSchema,
  sourceSchema: AppSchema,
  records: StoredRecord[],
) {
  validateCompatibleSchemaChange(currentSchema, sourceSchema, records, {
    allowFieldRemoval: true,
  });
  assertExistingRecordsSatisfyUniqueConstraints(sourceSchema, records);
}
export async function validateStorageSnapshotRestore(
  value: unknown,
  expected: {
    schemaKey: string;
    storageIdentity: string;
  },
  options: {
    identityReferenceResolver?: IdentityReferenceTargetResolver;
  } = {},
): Promise<StorageSnapshot> {
  let snapshot: StorageSnapshot;
  try {
    snapshot = parseStorageSnapshot(value, expected);
  } catch (error) {
    throw new BadRequestError(
      error instanceof Error ? error.message : "Storage snapshot is invalid.",
    );
  }

  await validateSnapshotRecords(snapshot, options);
  assertIsoTimestamp("Storage snapshot exportedAt", snapshot.exportedAt);
  assertIsoTimestamp("Storage snapshot schemaUpdatedAt", snapshot.schemaUpdatedAt);
  assertExistingRecordsSatisfyUniqueConstraints(snapshot.schema, snapshot.records);
  return snapshot;
}
async function validateSnapshotRecords(
  snapshot: StorageSnapshot,
  options: {
    identityReferenceResolver?: IdentityReferenceTargetResolver;
  },
) {
  const recordsById = new Map<string, StoredRecord>();
  for (const record of snapshot.records) {
    if (record.id.trim() === "") {
      throw new BadRequestError("Storage snapshot record id must be non-empty.");
    }

    if (recordsById.has(record.id)) {
      throw new BadRequestError(`Storage snapshot includes duplicate record id "${record.id}".`);
    }

    assertIsoTimestamp(`Storage snapshot record "${record.id}" createdAt`, record.createdAt);
    assertIsoTimestamp(`Storage snapshot record "${record.id}" updatedAt`, record.updatedAt);

    if (record.deletedAt !== undefined) {
      assertIsoTimestamp(`Storage snapshot record "${record.id}" deletedAt`, record.deletedAt);
    }

    recordsById.set(record.id, record);
  }

  for (const record of snapshot.records) {
    await validateSnapshotRecord(record, snapshot.schema, recordsById, options);
    assertControlPlaneRecordValuesAreDisplaySafe(record.values, snapshot.schema, record.entity);
  }
}

async function validateSnapshotRecord(
  record: StoredRecord,
  schema: AppSchema,
  recordsById: Map<string, StoredRecord>,
  options: {
    identityReferenceResolver?: IdentityReferenceTargetResolver;
  },
) {
  const entity = schema.entities.find((definition) => definition.key === record.entity)!;
  if (!entity) {
    throw new BadRequestError(
      `Storage snapshot record "${record.id}" references unknown entity "${record.entity}".`,
    );
  }
  for (const fieldName of Object.keys(record.values)) {
    if (!entity.fields.find((definition) => definition.key === fieldName)!) {
      throw new BadRequestError(
        `Storage snapshot record "${record.id}" includes unknown field "${record.entity}.${fieldName}".`,
      );
    }
  }
  for (const field of entity.fields) {
    const fieldName = field.key;
    const fieldValue = record.values[fieldName];
    if (!isValidStoredFieldValue(fieldValue, field, recordsById)) {
      throw new BadRequestError(
        `Storage snapshot record "${record.id}" has invalid field "${record.entity}.${fieldName}".`,
      );
    }

    if (
      field.type === "reference" &&
      fieldValue !== undefined &&
      isSupportedIdentityReferenceTarget(field.to)
    ) {
      if (typeof fieldValue !== "string") {
        throw new Error("Identity reference field validation returned a non-string value.");
      }

      if (!options.identityReferenceResolver) {
        throw new BadRequestError(
          `Identity reference validation is unavailable for field "${fieldName}".`,
        );
      }

      assertIdentityReferenceTargetResolution(
        { fieldName, target: field.to, value: fieldValue },
        await options.identityReferenceResolver({ id: fieldValue, target: field.to }),
      );
    }
  }
}

function assertIsoTimestamp(context: string, value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.valueOf()) || date.toISOString() !== value) {
    throw new BadRequestError(`${context} must be an ISO timestamp.`);
  }
}

export function validateCompatibleSchemaChange(
  currentSchema: AppSchema,
  nextSchema: AppSchema,
  records: StoredRecord[],
  options: {
    allowFieldRemoval?: boolean;
  } = {},
) {
  try {
    assertEntityIdentityContinuity(currentSchema, nextSchema);
  } catch (error) {
    throw new BadRequestError(
      error instanceof Error ? error.message : "Entity identity continuity is invalid.",
    );
  }

  const recordsById = new Map(records.map((record) => [record.id, record]));
  for (const currentEntity of currentSchema.entities) {
    const entityName = currentEntity.key;
    const nextEntity = nextSchema.entities.find((definition) => definition.key === entityName)!;
    const entityRecords = records.filter((record) => record.entity === entityName);
    if (!nextEntity) {
      throw new BadRequestError(`Cannot remove entity "${entityName}".`);
    }
    for (const currentField of currentEntity.fields) {
      const fieldName = currentField.key;
      const nextField = nextEntity.fields.find((definition) => definition.key === fieldName)!;
      if (!nextField) {
        if (options.allowFieldRemoval) {
          continue;
        }

        throw new BadRequestError(`Cannot remove or rename field "${entityName}.${fieldName}".`);
      }

      if (nextField.type !== currentField.type) {
        throw new BadRequestError(`Cannot change field type for "${entityName}.${fieldName}".`);
      }

      if (
        currentField.type === "reference" &&
        nextField.type === "reference" &&
        currentField.to !== nextField.to
      ) {
        throw new BadRequestError(
          `Cannot change reference target for "${entityName}.${fieldName}".`,
        );
      }
    }
    for (const nextField of nextEntity.fields) {
      const fieldName = nextField.key;
      if (!shouldValidateExistingValues(nextField)) {
        continue;
      }
      const currentField = currentEntity.fields.find((definition) => definition.key === fieldName)!;
      const hasInvalidStoredValue = entityRecords.some((record) => {
        return !isValidStoredFieldValue(record.values[fieldName], nextField, recordsById);
      });

      if (!hasInvalidStoredValue) {
        continue;
      }

      if (nextField.type === "number" && currentField) {
        throw new BadRequestError(
          `Cannot change number constraints for "${entityName}.${fieldName}" because existing records contain invalid values.`,
        );
      }

      if (nextField.type === "reference" && currentField) {
        throw new BadRequestError(
          `Cannot change reference constraints for "${entityName}.${fieldName}" because existing records contain invalid values.`,
        );
      }

      throw new BadRequestError(
        `Cannot require field "${entityName}.${fieldName}" because existing records are missing it.`,
      );
    }
  }
}
function validatePatchValues(values: Record<string, unknown>, entity: EntitySchema) {
  assertNoSystemRecordValues("Record write request values", values, entity);
  const patchValues: Partial<RecordValues> = {};
  for (const [fieldName, fieldValue] of Object.entries(values)) {
    if (!entity.fields.find((definition) => definition.key === fieldName)!) {
      throw new BadRequestError(`Unknown field "${fieldName}".`);
    }
    patchValues[fieldName] = fieldValue as RecordValues[string];
  }
  return patchValues;
}
export function validateRecordValues(
  values: Record<string, unknown>,
  entity: EntitySchema,
  reader: AuthorityRecordValidationReader,
  runtimeOptions?: RuntimeRecordValueValidationOptions,
): RecordValues {
  const { references, validated } = validateRecordValuesBase(values, entity);

  for (const reference of references) {
    validateLocalReferenceFieldValue(reference, reader, runtimeOptions?.additionalRecords);
  }

  validateRuntimeRecordValues(validated, runtimeOptions);

  return validated;
}

async function validateRecordValuesAsync(
  values: Record<string, unknown>,
  entity: EntitySchema,
  reader: AuthorityRecordValidationReader,
  runtimeOptions: RuntimeRecordValueValidationOptions,
): Promise<RecordValues> {
  const { references, validated } = validateRecordValuesBase(values, entity);

  for (const reference of references) {
    await validateReferenceFieldValueAsync(reference, reader, runtimeOptions);
  }

  validateRuntimeRecordValues(validated, runtimeOptions);

  return validated;
}

type RuntimeRecordValueValidationOptions = {
  additionalRecords?: StoredRecord[];
  entityName: string;
  identityReferenceResolver?: IdentityReferenceTargetResolver;
  schema: AppSchema;
};

type ReferenceFieldValidation = {
  fieldName: string;
  target: string;
  value: string;
};

function validateRecordValuesBase(
  values: Record<string, unknown>,
  entity: EntitySchema,
): {
  references: ReferenceFieldValidation[];
  validated: RecordValues;
} {
  assertNoSystemRecordValues("Record values", values, entity);
  for (const fieldName of Object.keys(values)) {
    if (!entity.fields.find((definition) => definition.key === fieldName)!) {
      throw new BadRequestError(`Unknown field "${fieldName}".`);
    }
  }
  const validated: RecordValues = {};
  const references: ReferenceFieldValidation[] = [];
  for (const field of entity.fields) {
    const fieldName = field.key;
    const fieldValue = values[fieldName];
    const fieldWasProvided = fieldName in values;
    const result = validateAuthorityRecordFieldValue(
      fieldName,
      field,
      fieldValue,
      fieldWasProvided,
    );

    if (result.kind === "omit") {
      continue;
    }

    if (field.type === "reference") {
      if (typeof result.value !== "string") {
        throw new Error("Reference field validation returned a non-string value.");
      }

      references.push({ fieldName, target: field.to, value: result.value });
    }

    validated[fieldName] = result.value;
  }

  return { references, validated };
}

function validateLocalReferenceFieldValue(
  reference: ReferenceFieldValidation,
  reader: AuthorityRecordValidationReader,
  additionalRecords: StoredRecord[] | undefined,
) {
  const targetRecord = getStoredRecordForValidation(reader, reference.value, additionalRecords);
  if (!targetRecord) {
    throw new BadRequestError(
      `Field "${reference.fieldName}" references unknown ${reference.target} record "${reference.value}".`,
    );
  }

  if (targetRecord.entity !== reference.target) {
    throw new BadRequestError(
      `Field "${reference.fieldName}" must reference a ${reference.target} record.`,
    );
  }

  if (targetRecord.deletedAt) {
    throw new BadRequestError(
      `Field "${reference.fieldName}" cannot reference tombstoned record "${reference.value}".`,
    );
  }
}

async function validateReferenceFieldValueAsync(
  reference: ReferenceFieldValidation,
  reader: AuthorityRecordValidationReader,
  runtimeOptions: RuntimeRecordValueValidationOptions,
) {
  if (isSupportedIdentityReferenceTarget(reference.target)) {
    if (!runtimeOptions.identityReferenceResolver) {
      throw new BadRequestError(
        `Identity reference validation is unavailable for field "${reference.fieldName}".`,
      );
    }

    assertIdentityReferenceTargetResolution(
      reference,
      await runtimeOptions.identityReferenceResolver({
        id: reference.value,
        target: reference.target,
      }),
    );
    return;
  }

  validateLocalReferenceFieldValue(reference, reader, runtimeOptions.additionalRecords);
}

function assertIdentityReferenceTargetResolution(
  reference: ReferenceFieldValidation,
  resolution: IdentityReferenceTargetResolution,
) {
  if (resolution.kind === "active") {
    return;
  }

  if (resolution.kind === "missing") {
    throw new BadRequestError(
      `Field "${reference.fieldName}" references unknown ${reference.target} record "${reference.value}".`,
    );
  }

  if (resolution.kind === "wrong-entity") {
    throw new BadRequestError(
      `Field "${reference.fieldName}" must reference a ${reference.target} record.`,
    );
  }

  if (resolution.kind === "tombstoned") {
    throw new BadRequestError(
      `Field "${reference.fieldName}" cannot reference tombstoned record "${reference.value}".`,
    );
  }

  if (resolution.kind === "unsupported") {
    throw new BadRequestError(
      `Field "${reference.fieldName}" references unsupported identity target "${reference.target}".`,
    );
  }

  throw new BadRequestError(
    `Identity reference validation is unavailable for field "${reference.fieldName}".`,
  );
}

function validateRuntimeRecordValues(
  validated: RecordValues,
  runtimeOptions: RuntimeRecordValueValidationOptions | undefined,
) {
  if (runtimeOptions) {
    assertControlPlaneRecordValuesAreDisplaySafe(
      validated,
      runtimeOptions.schema,
      runtimeOptions.entityName,
    );
  }
}

function assertNoSystemRecordValues(
  context: string,
  values: Record<string, unknown>,
  entity: EntitySchema,
) {
  for (const fieldName of Object.keys(values)) {
    if (
      !entity.fields.find((definition) => definition.key === fieldName)! &&
      isSystemFieldName(fieldName)
    ) {
      throw new BadRequestError(`${context} must not include system field "${fieldName}".`);
    }
  }
}

function getStoredRecordForValidation(
  reader: AuthorityRecordValidationReader,
  recordId: string,
  additionalRecords: StoredRecord[] | undefined,
) {
  const additionalRecord = additionalRecords?.find((record) => record.id === recordId);

  return additionalRecord ?? reader.readStoredRecord(recordId);
}

function getActiveRecordsForValidation(
  reader: AuthorityRecordValidationReader,
  additionalRecords: StoredRecord[] | undefined,
) {
  const recordsById = new Map(reader.readActiveRecords().map((record) => [record.id, record]));

  for (const record of additionalRecords ?? []) {
    if (record.deletedAt) {
      recordsById.delete(record.id);
    } else {
      recordsById.set(record.id, record);
    }
  }

  return [...recordsById.values()];
}

function assertRuntimeHistoryAllowsGenericRecordWrite(
  schema: AppSchema,
  entityName: string,
  kind: RecordWriteKind,
) {
  const history = runtimeControlPlaneEntityMetadata(schema, entityName)?.history;

  if (!history) {
    return;
  }

  if (history.kind === "operationCreated") {
    throw new BadRequestError(
      `Entity "${entityName}" operation-created history records must be created through schema operations.`,
    );
  }

  if (kind !== "create") {
    throw new BadRequestError(`Entity "${entityName}" history records are append-only.`);
  }
}

function assertImmutableFieldsNotPatched(
  schema: AppSchema,
  entityName: string,
  patchValues: Partial<RecordValues>,
) {
  const immutableFields = runtimeControlPlaneEntityMetadata(schema, entityName)?.immutableFields;

  if (!immutableFields) {
    return;
  }

  for (const fieldName of Object.keys(patchValues)) {
    if (immutableFields.includes(fieldName)) {
      throw new BadRequestError(`Field "${entityName}.${fieldName}" is immutable.`);
    }
  }
}

function normalizeStateMachineCreateValues(
  entityName: string,
  entity: EntitySchema,
  values: Record<string, unknown>,
) {
  const normalized = { ...values };
  for (const machine of entity.stateMachines ?? []) {
    const machineName = machine.key;
    const currentValue = normalized[machine.field];
    if (currentValue === undefined) {
      normalized[machine.field] = machine.initial;
      continue;
    }

    if (currentValue !== machine.initial) {
      throw new BadRequestError(
        `Field "${entityName}.${machine.field}" is owned by state machine "${machineName}" and new records must start at initial state "${machine.initial}".`,
      );
    }
  }

  return normalized;
}

function assertStateMachineFieldsNotPatched(
  entityName: string,
  entity: EntitySchema,
  existingRecord: StoredRecord,
  patchValues: Partial<RecordValues>,
) {
  for (const machine of entity.stateMachines ?? []) {
    const machineName = machine.key;
    if (!(machine.field in patchValues)) {
      continue;
    }

    if (patchValues[machine.field] === existingRecord.values[machine.field]) {
      continue;
    }

    throw new BadRequestError(
      `Field "${entityName}.${machine.field}" is owned by state machine "${machineName}" and must change through transition operations.`,
    );
  }
}

function assertControlPlaneRecordValuesAreDisplaySafe(
  values: RecordValues,
  schema: AppSchema,
  entityName: string,
) {
  const metadata = runtimeControlPlaneEntityMetadata(schema, entityName);

  if (!metadata) {
    return;
  }

  for (const [fieldName, value] of Object.entries(values)) {
    const isSecretReferenceField = metadata.secretReferenceFields?.includes(fieldName) ?? false;

    if (!isSecretReferenceField && isForbiddenControlPlaneFieldName(fieldName)) {
      throw new BadRequestError(
        `Field "${entityName}.${fieldName}" cannot store control-plane secrets or provider truth.`,
      );
    }

    if (typeof value === "string") {
      assertControlPlaneStringValueIsDisplaySafe(entityName, fieldName, value);
    }
  }
}

function assertControlPlaneStringValueIsDisplaySafe(
  entityName: string,
  fieldName: string,
  value: string,
) {
  if (containsForbiddenControlPlaneSecretValue(value)) {
    throw new BadRequestError(
      `Field "${entityName}.${fieldName}" cannot store control-plane secret values.`,
    );
  }

  const parsed = parseMaybeJson(value);

  if (parsed !== undefined) {
    assertControlPlaneJsonValueIsDisplaySafe(entityName, fieldName, parsed);
  }
}

function assertControlPlaneJsonValueIsDisplaySafe(
  entityName: string,
  fieldName: string,
  value: unknown,
) {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertControlPlaneJsonValueIsDisplaySafe(entityName, fieldName, item);
    }

    return;
  }

  if (typeof value === "string") {
    assertControlPlaneStringValueIsDisplaySafe(entityName, fieldName, value);
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    if (isForbiddenControlPlaneFieldName(key)) {
      throw new BadRequestError(
        `Field "${entityName}.${fieldName}" cannot store control-plane secrets or provider truth.`,
      );
    }

    assertControlPlaneJsonValueIsDisplaySafe(entityName, fieldName, item);
  }
}

function parseMaybeJson(value: string): Record<string, unknown> | unknown[] | undefined {
  const trimmed = value.trim();

  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;

    return Array.isArray(parsed) || isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isForbiddenControlPlaneFieldName(fieldName: string) {
  const normalized = normalizeControlPlaneSecretText(fieldName);

  return (
    normalized.includes("api_token") ||
    normalized.includes("access_token") ||
    normalized.includes("auth_token") ||
    normalized.includes("password") ||
    normalized.includes("secret_value") ||
    normalized.includes("raw_lease_token") ||
    normalized.includes("lease_token") ||
    normalized.includes("alchemy_state_token") ||
    normalized.includes("provider_truth") ||
    normalized.includes("provider_state") ||
    normalized.includes("provider_resource_json") ||
    normalized.includes("provider_resources_json")
  );
}

function containsForbiddenControlPlaneSecretValue(value: string) {
  const normalized = normalizeControlPlaneSecretText(value);

  return (
    normalized.includes("cf_api_token") ||
    normalized.includes("cloudflare_api_token") ||
    normalized.includes("alchemy_password") ||
    normalized.includes("alchemy_state_token") ||
    normalized.includes("raw_lease_token") ||
    normalized.includes("lease_token") ||
    value.includes("-----BEGIN PRIVATE KEY-----")
  );
}

function normalizeControlPlaneSecretText(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function assertNoActiveInboundReferences(
  targetRecord: StoredRecord,
  schema: AppSchema,
  reader: AuthorityRecordValidationReader,
  additionalRecords: StoredRecord[] | undefined,
) {
  for (const record of getActiveRecordsForValidation(reader, additionalRecords)) {
    if (record.deletedAt) {
      continue;
    }
    const entity = schema.entities.find((definition) => definition.key === record.entity)!;
    if (!entity) {
      continue;
    }
    for (const field of entity.fields) {
      if (
        field.type === "reference" &&
        field.to === targetRecord.entity &&
        record.values[field.key] === targetRecord.id
      ) {
        throw new BadRequestError(
          `Cannot delete record "${targetRecord.id}" because active ${record.entity} record "${record.id}" references it through field "${record.entity}.${field.key}".`,
        );
      }
    }
  }
}
function validateAuthorityRecordFieldValue(
  fieldName: string,
  field: EntitySchema["fields"][number],
  fieldValue: unknown,
  fieldWasProvided: boolean,
) {
  try {
    return validateAuthorityFieldValue(fieldName, field, fieldValue, fieldWasProvided);
  } catch (error) {
    throw new BadRequestError(error instanceof Error ? error.message : "Field value is invalid.");
  }
}
function shouldValidateExistingValues(field: EntitySchema["fields"][number]) {
  return shouldValidateExistingFieldValue(field);
}
function isValidStoredFieldValue(
  value: RecordValues[string] | undefined,
  field: EntitySchema["fields"][number],
  recordsById: Map<string, StoredRecord>,
) {
  if (!isValidStoredFieldValueForType(value, field)) {
    return false;
  }

  if (field.type === "reference" && value !== undefined) {
    if (typeof value !== "string") {
      return false;
    }

    if (isSupportedIdentityReferenceTarget(field.to)) {
      return true;
    }
    const targetRecord = recordsById.get(value);
    return !!targetRecord && targetRecord.entity === field.to && !targetRecord.deletedAt;
  }
  return true;
}
function entityHasOperationKind(entity: EntitySchema, kind: EntityOperationKind): boolean {
  return (entity.operations ?? []).some((operation) => operation.kind === kind);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
