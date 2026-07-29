import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
import type { OperationInvocationEnvelope } from "../shared/operation-invocation.ts";
import { BadRequestError } from "./errors.ts";
import { getStoredRecord } from "./storage.ts";

export function requireActiveOperationTargetRecord(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
): StoredRecord {
  const recordId = envelope.input.type === "command" ? envelope.input.recordId : undefined;

  if (recordId === undefined) {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" requires a target record id.`,
    );
  }

  const record = getStoredRecord(storage, recordId);

  if (!record) {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" references unknown ${envelope.operation.entityName} record "${recordId}".`,
    );
  }

  if (record.entity !== envelope.operation.entityName) {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" target record "${recordId}" must belong to entity "${envelope.operation.entityName}".`,
    );
  }

  if (record.deletedAt) {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" cannot use tombstoned ${envelope.operation.entityName} record "${recordId}".`,
    );
  }

  return immutableOperationTargetSnapshot(record);
}

export function immutableOperationTargetSnapshot(record: StoredRecord): StoredRecord {
  return Object.freeze({
    ...record,
    values: Object.freeze({ ...record.values }),
  }) as StoredRecord;
}

export function assertActiveOperationTargetSnapshot(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
  snapshot: StoredRecord,
): StoredRecord {
  const record = getStoredRecord(storage, snapshot.id);

  if (
    !record ||
    record.deletedAt ||
    record.entity !== envelope.operation.entityName ||
    !storedRecordsEqual(record, snapshot)
  ) {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" target record "${snapshot.id}" changed before commit.`,
    );
  }

  return record;
}

function storedRecordsEqual(left: StoredRecord, right: StoredRecord) {
  return (
    left.id === right.id &&
    left.entity === right.entity &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.deletedAt === right.deletedAt &&
    recordValuesEqual(left.values, right.values)
  );
}

function recordValuesEqual(left: RecordValues, right: RecordValues) {
  const leftEntries = Object.entries(left);
  const rightKeys = new Set(Object.keys(right));

  return (
    leftEntries.length === rightKeys.size &&
    leftEntries.every(
      ([fieldName, fieldValue]) => rightKeys.has(fieldName) && right[fieldName] === fieldValue,
    )
  );
}
