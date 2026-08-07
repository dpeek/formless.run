import { identityControlPlaneSchema } from "@dpeek/formless-identity-control-plane";
import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
import {
  validateProgramSharedRuntimeDefinition,
  type ProgramSharedRuntimeDefinition,
} from "../program/composition.ts";
import { programSharedRuntime } from "../program/compiled/shared.ts";
import {
  formlessProgramSchema,
  formlessProgramSchemaProvenance,
  isFormlessProgramSchemaRecord,
  validateFormlessProgramRecords,
} from "../program/runtime.ts";
import {
  ensureStorageTables,
  getBootstrapRecords,
  initializeStorageFromSource,
  isArchiveRestoreGuardHeld,
  reconcileRuntimeInvariantRecords,
  type RecordConstraintValidator,
  type StorageSource,
} from "./storage.ts";

const candidateRecordUpdatedAt = "2026-06-26T00:00:00.000Z";
const identityEntityNames = new Set(
  identityControlPlaneSchema.entities.map((entity) => entity.key),
);

export function formlessProgramSource(): StorageSource {
  return {
    schema: formlessProgramSchema,
    schemaProvenance: formlessProgramSchemaProvenance,
  };
}

export function ensureFormlessProgramStorage(storage: DurableObjectStorage) {
  ensureStorageTables(storage);

  if (isArchiveRestoreGuardHeld(storage)) {
    return;
  }

  const source = formlessProgramSource();

  initializeStorageFromSource(storage, source, {
    selectRecordsForSchemaRefresh: selectCurrentFormlessProgramRecords,
  });
  reconcileRuntimeInvariantRecords(storage, defaultBootstrapRecords(), {
    validate: (records) =>
      validateFormlessProgramRecords(
        "Formless Program records",
        selectCurrentFormlessProgramRecords(records).filter((record) => !record.deletedAt),
        { sharedRuntime: programSharedRuntime },
      ),
    writeIdPrefix: "identity-role-reconcile",
  });
}

export function validateFormlessProgramRecordConstraint(
  storage: DurableObjectStorage,
): RecordConstraintValidator {
  return (entityName, values, options) => {
    const records = getBootstrapRecords(storage);
    const candidate = candidateProgramRecord(
      records,
      entityName,
      values,
      options?.ignoreRecordId,
      options?.candidateRecordId,
    );
    const replaced = options?.ignoreRecordId
      ? records.map((record) => (record.id === options.ignoreRecordId ? candidate : record))
      : [...records, candidate];
    const additionalRecords = options?.additionalRecords ?? [];
    const additionalIds = new Set(additionalRecords.map((record) => record.id));
    const candidateRecords = [
      ...replaced.filter((record) => record.id === candidate.id || !additionalIds.has(record.id)),
      ...additionalRecords.filter((record) => record.id !== candidate.id),
    ];

    validateFormlessProgramRecords(
      "Formless Program records",
      selectCurrentFormlessProgramRecords(candidateRecords),
      {
        candidateRecord: candidate,
        sharedRuntime: programSharedRuntime,
      },
    );
  };
}

export function isIdentityProgramRecord(record: StoredRecord): boolean {
  return identityEntityNames.has(record.entity);
}

export function isCurrentFormlessProgramRecord(record: StoredRecord): boolean {
  return isFormlessProgramSchemaRecord(record);
}

export function selectCurrentFormlessProgramRecords(
  records: readonly StoredRecord[],
): StoredRecord[] {
  return records.filter(isCurrentFormlessProgramRecord);
}

export function selectCurrentFormlessProgramChanges<Change extends { payload: StoredRecord }>(
  changes: readonly Change[],
): Change[] {
  return changes.filter((change) => isCurrentFormlessProgramRecord(change.payload));
}

export function formlessProgramCreatedRecordId(
  entity: string,
  values: RecordValues,
  sharedRuntime: ProgramSharedRuntimeDefinition = programSharedRuntime,
): string | undefined {
  validateProgramSharedRuntimeDefinition(formlessProgramSchema, sharedRuntime);
  const entityId = formlessProgramSchema.entities.find((candidate) => candidate.key === entity)?.id;

  if (entityId === undefined) {
    return undefined;
  }

  const contribution = sharedRuntime.createIdContributions.find(({ entityIds }) =>
    entityIds.includes(entityId),
  );

  return contribution?.createId(entity, values);
}

function candidateProgramRecord(
  records: readonly StoredRecord[],
  entity: string,
  values: RecordValues,
  existingRecordId: string | undefined,
  candidateRecordId: string | undefined,
): StoredRecord {
  const existing = existingRecordId
    ? records.find((record) => record.id === existingRecordId)
    : undefined;

  if (existing) {
    return {
      ...existing,
      values,
      updatedAt: candidateRecordUpdatedAt,
    };
  }

  return {
    id: candidateRecordId ?? pendingRecordId(records, entity),
    entity,
    values,
    createdAt: candidateRecordUpdatedAt,
    updatedAt: candidateRecordUpdatedAt,
  };
}

function pendingRecordId(records: readonly StoredRecord[], entity: string) {
  const existingIds = new Set(records.map((record) => record.id));
  let id = `pending:${entity}`;

  while (existingIds.has(id)) {
    id = `${id}:next`;
  }

  return id;
}

function defaultBootstrapRecords(): StoredRecord[] {
  validateProgramSharedRuntimeDefinition(formlessProgramSchema, programSharedRuntime);

  return programSharedRuntime.bootstrapContributions.flatMap((contribution) =>
    contribution.contribute(),
  );
}
