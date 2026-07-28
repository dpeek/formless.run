import {
  compareOrdinalStrings,
  getAppSchemaDefinitionIndex,
  parseAppSchema,
  type AppSchema,
} from "@dpeek/formless-schema";

import {
  STORAGE_SNAPSHOT_KIND,
  STORAGE_SNAPSHOT_VERSION,
  type FieldValue,
  type RecordValues,
  type StorageSnapshot,
  type StorageSnapshotExpected,
  type StoredRecord,
} from "./types.ts";

export * from "./types.ts";

export function parseStorageSnapshot(
  value: unknown,
  expected?: StorageSnapshotExpected,
): StorageSnapshot {
  if (!isRecord(value)) {
    throw new Error("Storage snapshot must be an object.");
  }

  assertStorageSnapshotKeys(value);

  if (value.kind !== STORAGE_SNAPSHOT_KIND) {
    throw new Error(`Storage snapshot kind must be "${STORAGE_SNAPSHOT_KIND}".`);
  }

  if (value.version !== STORAGE_SNAPSHOT_VERSION) {
    throw new Error(`Storage snapshot version must be ${STORAGE_SNAPSHOT_VERSION}.`);
  }

  const storageIdentity = parseNonEmptyString(
    "Storage snapshot storageIdentity",
    value.storageIdentity,
  );
  if (expected?.storageIdentity !== undefined && storageIdentity !== expected.storageIdentity) {
    throw new Error(`Storage snapshot storageIdentity must be "${expected.storageIdentity}".`);
  }

  const schemaKey = parseNonEmptyString("Storage snapshot schemaKey", value.schemaKey);
  if (expected?.schemaKey !== undefined && schemaKey !== expected.schemaKey) {
    throw new Error(`Storage snapshot schemaKey must be "${expected.schemaKey}".`);
  }

  const records = parseStorageSnapshotRecords(value.records);

  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity,
    schemaKey,
    exportedAt: parseNonEmptyString("Storage snapshot exportedAt", value.exportedAt),
    schemaUpdatedAt: parseNonEmptyString("Storage snapshot schemaUpdatedAt", value.schemaUpdatedAt),
    sourceCursor: parseCursor("Storage snapshot sourceCursor", value.sourceCursor),
    schema: parseAppSchema(value.schema),
    records,
  };
}

export function isStoredRecord(value: unknown): value is StoredRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.entity === "string" &&
    isRecordValues(value.values) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    (!("deletedAt" in value) || typeof value.deletedAt === "string")
  );
}

export function isRecordValues(value: unknown): value is RecordValues {
  return isRecord(value) && Object.values(value).every(isFieldValue);
}

export function isFieldValue(value: unknown): value is FieldValue {
  return typeof value === "string" || typeof value === "boolean" || isFiniteNumber(value);
}

export type StoredRecordArtifact = {
  id: string;
  entity: string;
  values: Record<string, FieldValue | undefined>;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
};

export function formatStoredRecordsForArtifact<Record extends StoredRecordArtifact>(
  schema: AppSchema,
  records: readonly Record[],
): Record[] {
  const schemaIndex = getAppSchemaDefinitionIndex(schema);
  const entityOrder = new Map(
    schemaIndex.entities.ordered.map((entity, index) => [entity.key, index]),
  );

  return records
    .map((record) => formatStoredRecordForArtifact(schema, record))
    .sort((left, right) => {
      const leftEntityOrder = entityOrder.get(left.entity);
      const rightEntityOrder = entityOrder.get(right.entity);

      if (leftEntityOrder !== undefined || rightEntityOrder !== undefined) {
        if (leftEntityOrder === undefined) {
          return 1;
        }

        if (rightEntityOrder === undefined) {
          return -1;
        }

        const declaredEntityOrder = leftEntityOrder - rightEntityOrder;
        if (declaredEntityOrder !== 0) {
          return declaredEntityOrder;
        }
      } else {
        const unknownEntityOrder = compareOrdinalStrings(left.entity, right.entity);
        if (unknownEntityOrder !== 0) {
          return unknownEntityOrder;
        }
      }

      return compareOrdinalStrings(left.id, right.id);
    });
}

export function formatStoredRecordForArtifact<Record extends StoredRecordArtifact>(
  schema: AppSchema,
  record: Record,
): Record {
  const fieldIndex = getAppSchemaDefinitionIndex(schema).fieldsByEntity.get(record.entity);
  const knownValues: [string, FieldValue][] = [];
  const knownFields = new Set<string>();

  for (const field of fieldIndex?.ordered ?? []) {
    knownFields.add(field.key);

    const value = record.values[field.key];
    if (Object.hasOwn(record.values, field.key) && value !== undefined) {
      knownValues.push([field.key, value]);
    }
  }

  const unexpectedValues = Object.entries(record.values)
    .filter(
      (entry): entry is [string, FieldValue] =>
        !knownFields.has(entry[0]) && entry[1] !== undefined,
    )
    .sort(([left], [right]) => compareOrdinalStrings(left, right));

  return {
    id: record.id,
    entity: record.entity,
    values: Object.fromEntries([...knownValues, ...unexpectedValues]),
    ...("createdAt" in record ? { createdAt: record.createdAt } : {}),
    ...("updatedAt" in record ? { updatedAt: record.updatedAt } : {}),
    ...("deletedAt" in record ? { deletedAt: record.deletedAt } : {}),
  } as Record;
}

function assertStorageSnapshotKeys(value: Record<string, unknown>) {
  const requiredKeys = [
    "kind",
    "version",
    "storageIdentity",
    "schemaKey",
    "exportedAt",
    "schemaUpdatedAt",
    "sourceCursor",
    "schema",
    "records",
  ];
  const allowedKeys = new Set(requiredKeys);

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Storage snapshot has unsupported key "${key}".`);
    }
  }

  for (const key of requiredKeys) {
    if (!(key in value)) {
      throw new Error(`Storage snapshot must include "${key}".`);
    }
  }
}

function parseStorageSnapshotRecords(value: unknown): StoredRecord[] {
  if (!Array.isArray(value)) {
    throw new Error("Storage snapshot records must be an array.");
  }

  return value.map((record, index) => {
    if (!isStoredRecord(record)) {
      throw new Error(`Storage snapshot records[${index}] must be a stored record.`);
    }

    return {
      id: record.id,
      entity: record.entity,
      values: { ...record.values },
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      ...(record.deletedAt === undefined ? {} : { deletedAt: record.deletedAt }),
    };
  });
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value;
}

function parseCursor(context: string, value: unknown): number {
  if (!isCursor(value)) {
    throw new Error(`${context} must be a non-negative integer.`);
  }

  return value;
}

function isCursor(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
