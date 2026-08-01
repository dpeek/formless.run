import {
  identityControlPlaneRoleKeys,
  identityControlPlaneSchema,
  type IdentityControlPlaneRoleKey,
} from "@dpeek/formless-identity-control-plane";
import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
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
  reconcileRuntimeInvariantRecords,
  type RecordConstraintValidator,
  type StorageSource,
} from "./storage.ts";

const builtInRoleCreatedAt = "2026-06-26T00:00:00.000Z";
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
  const source = formlessProgramSource();

  initializeStorageFromSource(storage, source, {
    selectRecordsForSchemaRefresh: selectCurrentFormlessProgramRecords,
  });
  reconcileRuntimeInvariantRecords(storage, builtInRoleRecords(), {
    validate: (records) =>
      validateFormlessProgramRecords(
        "Formless Program records",
        selectCurrentFormlessProgramRecords(records),
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
      ...replaced.filter((record) => !additionalIds.has(record.id)),
      ...additionalRecords,
    ];

    validateFormlessProgramRecords(
      "Formless Program records",
      selectCurrentFormlessProgramRecords(candidateRecords),
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
): string | undefined {
  const id = values.targetId;

  return entity === "deployment-config" && typeof id === "string" ? id : undefined;
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
      updatedAt: builtInRoleCreatedAt,
    };
  }

  return {
    id: candidateRecordId ?? pendingRecordId(records, entity),
    entity,
    values,
    createdAt: builtInRoleCreatedAt,
    updatedAt: builtInRoleCreatedAt,
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

function builtInRoleRecords(): StoredRecord[] {
  return identityControlPlaneRoleKeys.map(builtInRoleRecord);
}

function builtInRoleRecord(roleKey: IdentityControlPlaneRoleKey): StoredRecord {
  return {
    id: `role:${roleKey}`,
    entity: "role",
    values: {
      key: roleKey,
      displayLabel: roleKey,
      status: "active",
    },
    createdAt: builtInRoleCreatedAt,
    updatedAt: builtInRoleCreatedAt,
  };
}
