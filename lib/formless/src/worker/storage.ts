import { createRecordId } from "../shared/ids.ts";
import {
  isSupportedIdentityReferenceTarget,
  validateAuthorityFieldValue,
} from "@dpeek/formless-schema";
import {
  STORAGE_SNAPSHOT_KIND,
  STORAGE_SNAPSHOT_VERSION,
  formatStoredRecordsForArtifact,
} from "@dpeek/formless-storage";
import type { RecordValues, StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import type { BootstrapResponse, ChangeRow } from "../shared/protocol.ts";
import type {
  CreateRecordWriteRequest,
  DeleteRecordWriteRequest,
  PatchRecordWriteRequest,
} from "./record-write-requests.ts";
import type {
  OperationCommandOutput,
  OperationInvocationEnvelope,
  OperationInvocationInput,
  OperationInvocationOutput,
  OperationInvocationStatus,
} from "../shared/operation-invocation.ts";
import type { AppSchema, EntitySchema, UniqueConstraintSchema } from "@dpeek/formless-schema";
import {
  getAppSchemaDefinitionIndex,
  parseAppSchema,
  stringifySchema,
} from "@dpeek/formless-schema";
import { nowIsoString } from "../shared/clock.ts";
import { isSourceSchemaHash, type SourceSchemaHash } from "@dpeek/formless-schema";
import {
  appendCommandWriteLogChange,
  appendRecordWriteLogChange,
  appendWriteLogChange,
  commitCommandWriteLog,
  readCommandWriteReplayResponse,
  readCommittedRecordWriteResponse,
  readCurrentWriteLogCursor,
  readRecordWriteReplayResponse,
  readWriteLogChangesAfter,
  readWriteLogChangesByWriteId,
  type CommandWriteResponse,
  type RecordWriteResponse,
} from "./storage-write-log.ts";

export type {
  CommandWriteResponse,
  OperationRecordPlanResponse,
  OperationRecordPlanStepResponse,
  RecordWriteResponse,
} from "./storage-write-log.ts";
import {
  createSqlStorageMigrationRegistry,
  runSqlStorageMigrations,
  storageSqlMigrationFamily,
} from "./sql-migrations.ts";
import { assertEntityIdentityContinuity } from "./entity-identity-continuity.ts";
import {
  FORMLESS_PROGRAM_SCHEMA_KEY,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
} from "../program/target.ts";
import { ArchiveRestoreGuardConflictError } from "./errors.ts";

type RecordRow = {
  id: string;
  entity: string;
  values_json: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type SchemaRow = {
  schema_json: string;
  schema_provenance_json: string | null;
  updated_at: string;
};

type TableInfoRow = {
  name: string;
};

type ArchiveRestoreGuardRow = {
  acquired_at: string;
  source_cursor: number;
  token: string;
};

type OperationInvocationRow = {
  invocation_id: string;
  operation_key: string;
  operation_kind: string;
  entity: string;
  operation_name: string;
  actor_kind: string;
  auth_decision: OperationInvocationAuthDecision;
  source_protocol: string;
  source_json: string;
  input_hash: string;
  input_audit_json: string;
  affected_change_ids_json: string;
  idempotency_json: string;
  output_json: string | null;
  status: OperationInvocationStatus;
  status_history_json: string;
  error_message: string | null;
  received_at: string;
  updated_at: string;
  completed_at: string | null;
};

const authoritySqlMigrationFamily = storageSqlMigrationFamily("authority-storage");
const archiveRestoreGuardTableName = "archive_restore_guard";
const operationInvocationsTableName = "operation_invocations";
const authoritySqlMigrations = createSqlStorageMigrationRegistry([
  {
    id: "2026-06-11-authority-operation-invocations",
    owner: "formless",
    family: authoritySqlMigrationFamily,
    checksum: "sha256:3e5f55d719d3d8fd4d99902632e1f9f2c3e9f948a954f0d4dbbb2c0f6c8bc111",
    safety: "auto-safe",
    summary: "Create Authority operation invocation audit rows.",
    apply(storage) {
      ensureOperationInvocationTables(storage);
    },
  },
]);
export type StoredSchema = {
  schema: AppSchema;
  schemaProvenance?: ProgramSchemaProvenance;
  updatedAt: string;
};

export type ProgramSchemaProvenance = {
  kind: "program";
  sourceSchemaHash: SourceSchemaHash;
};

export type StorageSnapshotSource = {
  schemaProvenance?: ProgramSchemaProvenance;
  snapshot: StorageSnapshot;
};

export type ActiveSchemaRefreshBlocker = {
  currentSchemaProvenance?: ProgramSchemaProvenance;
  reason: string;
  schemaKey?: string;
  storageIdentity?: string;
  targetSchemaProvenance: ProgramSchemaProvenance;
};

export class ActiveSchemaRefreshBlockedError extends Error {
  readonly blocker: ActiveSchemaRefreshBlocker;

  constructor(blocker: ActiveSchemaRefreshBlocker) {
    super(activeSchemaRefreshBlockedMessage(blocker));
    this.name = "ActiveSchemaRefreshBlockedError";
    this.blocker = blocker;
  }
}

export type ArchiveRestoreGuardBeginResult = {
  guardToken: string;
  snapshot: StorageSnapshot;
};

export type WriteOutcome<T> =
  | {
      kind: "committed";
      response: T;
    }
  | {
      kind: "replay";
      response: T;
    };

export type OperationInvocationAuthDecision = "allowed" | "denied";

export type OperationInvocationAuditInput =
  | {
      kind: "none";
    }
  | {
      kind: "hash";
    }
  | {
      kind: "summary";
      summary: OperationInvocationInputSummary;
    }
  | {
      kind: "snapshot";
      snapshot: unknown;
    };

export type OperationInvocationInputSummary = {
  type: OperationInvocationInput["type"];
  fieldNames?: string[];
  inputFields?: string[];
  inputType?: string;
  recordId?: string;
  valuesType?: string;
};

export type OperationInvocationStatusHistoryEntry = {
  status: OperationInvocationStatus;
  at: string;
};

export type StoredOperationInvocation = {
  invocationId: string;
  operationKey: string;
  operationKind: string;
  entity: string;
  operationName: string;
  actorKind: string;
  authDecision: OperationInvocationAuthDecision;
  sourceProtocol: string;
  source: OperationInvocationEnvelope["source"];
  inputHash: string;
  auditInput: OperationInvocationAuditInput;
  affectedChangeIds: string[];
  idempotency: OperationInvocationEnvelope["idempotency"];
  output?: OperationInvocationOutput;
  status: OperationInvocationStatus;
  statusHistory: OperationInvocationStatusHistoryEntry[];
  errorMessage?: string;
  receivedAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type StorageSource = {
  schema: AppSchema;
  schemaProvenance?: ProgramSchemaProvenance;
};

export type StorageSchemaResetValidator = (
  currentSchema: AppSchema,
  sourceSchema: AppSchema,
  records: StoredRecord[],
) => void;

export type CreateRecordWriteSideEffectRecordCreator = (
  entity: string,
  recordValuesToCreate: RecordValues[],
) => void;

export type RecordConstraintValidator = (
  entity: string,
  values: RecordValues,
  options?: {
    additionalRecords?: readonly StoredRecord[];
    candidateRecordId?: string;
    ignoreRecordId?: string;
  },
) => void;
export type OperationRecordCreatePlan = {
  entity: string;
  id?: string;
  values: RecordValues | ((createdRecords: StoredRecord[]) => RecordValues);
};

export type OperationRecordWriteValues =
  | RecordValues
  | ((writtenRecords: StoredRecord[]) => RecordValues);

export type OperationRecordWriteTarget =
  | StoredRecord
  | ((writtenRecords: StoredRecord[]) => StoredRecord);

export type OperationRecordWritePlan =
  | {
      kind: "create";
      entity: string;
      id?: string;
      values: OperationRecordWriteValues;
    }
  | {
      kind: "patch";
      record: OperationRecordWriteTarget;
      values: OperationRecordWriteValues;
    }
  | {
      kind: "delete" | "tombstone";
      record: OperationRecordWriteTarget;
    };

type SourceSchemaResetPlan = {
  schema: AppSchema;
  changedAt: string;
  prunedRecords: StoredRecord[];
};

type SnapshotRestorePlan = {
  restoredAt: string;
  restoreWriteId: string;
  recordsToRestore: StoredRecord[];
  recordsToTombstone: StoredRecord[];
  changedRecords: StoredRecord[];
};

type ApplyCreateRecordWriteSideEffects = (context: {
  storage: DurableObjectStorage;
  request: CreateRecordWriteRequest;
  record: StoredRecord;
  createRecords: CreateRecordWriteSideEffectRecordCreator;
}) => void;

type RecordWriteMaterializationOptions = {
  allowStoredReplay?: boolean;
  now?: string;
};

type OperationMaterializationOptions = {
  allowStoredReplay?: boolean;
  assertPreconditions?: () => void;
  now?: string;
};

export function committedWrite<T>(response: T): WriteOutcome<T> {
  return { kind: "committed", response };
}

export function replayedWrite<T>(response: T): WriteOutcome<T> {
  return { kind: "replay", response };
}

export function mapWriteOutcome<T, U>(
  outcome: WriteOutcome<T>,
  mapResponse: (response: T) => U,
): WriteOutcome<U> {
  return {
    kind: outcome.kind,
    response: mapResponse(outcome.response),
  };
}

export function ensureStorageTables(storage: DurableObjectStorage) {
  runSqlStorageMigrations(storage, {
    family: authoritySqlMigrationFamily,
    migrations: authoritySqlMigrations,
  });
  ensureOperationInvocationTables(storage);

  storage.sql.exec(`
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      entity TEXT NOT NULL,
      values_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS changes (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      write_id TEXT NOT NULL,
      operation_kind TEXT NOT NULL,
      entity TEXT NOT NULL,
      record_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_schema (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      schema_json TEXT NOT NULL,
      schema_provenance_json TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS command_executions (
      write_id TEXT PRIMARY KEY,
      entity TEXT NOT NULL,
      operation TEXT NOT NULL,
      cursor INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ${archiveRestoreGuardTableName} (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      token TEXT NOT NULL,
      source_cursor INTEGER NOT NULL,
      acquired_at TEXT NOT NULL
    );

  `);
  ensureRecordUpdatedAtColumn(storage);
  ensureAppSchemaProvenanceColumn(storage);
}

function ensureRecordUpdatedAtColumn(storage: DurableObjectStorage) {
  const columns = storage.sql.exec<TableInfoRow>("PRAGMA table_info(records)").toArray();

  if (columns.some((column) => column.name === "updated_at")) {
    return;
  }

  storage.sql.exec("ALTER TABLE records ADD COLUMN updated_at TEXT");
  storage.sql.exec("UPDATE records SET updated_at = COALESCE(deleted_at, created_at)");
}

function ensureAppSchemaProvenanceColumn(storage: DurableObjectStorage) {
  const columns = storage.sql.exec<TableInfoRow>("PRAGMA table_info(app_schema)").toArray();

  if (columns.some((column) => column.name === "schema_provenance_json")) {
    return;
  }

  storage.sql.exec("ALTER TABLE app_schema ADD COLUMN schema_provenance_json TEXT");
}

export function ensureOperationInvocationTables(storage: DurableObjectStorage) {
  storage.sql.exec(`
    CREATE TABLE IF NOT EXISTS ${operationInvocationsTableName} (
      invocation_id TEXT PRIMARY KEY,
      operation_key TEXT NOT NULL,
      operation_kind TEXT NOT NULL,
      entity TEXT NOT NULL,
      operation_name TEXT NOT NULL,
      actor_kind TEXT NOT NULL,
      auth_decision TEXT NOT NULL CHECK (auth_decision IN ('allowed', 'denied')),
      source_protocol TEXT NOT NULL,
      source_json TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      input_audit_json TEXT NOT NULL,
      affected_change_ids_json TEXT NOT NULL,
      idempotency_json TEXT NOT NULL,
      output_json TEXT,
      status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected', 'committed', 'replayed', 'failed', 'resumed')),
      status_history_json TEXT NOT NULL,
      error_message TEXT,
      received_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_operation_invocations_operation_key
      ON ${operationInvocationsTableName} (operation_key, updated_at);

    CREATE INDEX IF NOT EXISTS idx_operation_invocations_status
      ON ${operationInvocationsTableName} (status, updated_at);
  `);
}

export function getActiveSchema(
  storage: DurableObjectStorage,
  seedSchema: AppSchema,
): StoredSchema {
  return storage.transactionSync(() => {
    const existing = readStoredSchema(storage);

    if (existing) {
      return existing;
    }

    return writeActiveSchema(storage, seedSchema);
  });
}

export function readCurrentStoredSchema(storage: DurableObjectStorage): StoredSchema | undefined {
  return readStoredSchema(storage);
}

export function isArchiveRestoreGuardHeld(storage: DurableObjectStorage): boolean {
  return readArchiveRestoreGuard(storage) !== undefined;
}

export function beginArchiveRestoreGuard(
  storage: DurableObjectStorage,
  input: {
    expectedSourceCursor?: number;
    guardToken: string;
    schemaKey: string;
    storageIdentity: string;
  },
): ArchiveRestoreGuardBeginResult {
  return storage.transactionSync(() => {
    const currentSourceCursor = getCurrentCursor(storage);
    const existing = readArchiveRestoreGuard(storage);

    if (existing) {
      throw new ArchiveRestoreGuardConflictError({
        currentSourceCursor,
        ...(input.expectedSourceCursor === undefined
          ? {}
          : { expectedSourceCursor: input.expectedSourceCursor }),
        reason: "guard-held",
      });
    }

    if (
      input.expectedSourceCursor !== undefined &&
      currentSourceCursor !== input.expectedSourceCursor
    ) {
      throw new ArchiveRestoreGuardConflictError({
        currentSourceCursor,
        expectedSourceCursor: input.expectedSourceCursor,
        reason: "source-cursor-changed",
      });
    }

    const storedSchema = readStoredSchema(storage);
    if (!storedSchema) {
      throw new Error("Archive restore guard requires initialized Program storage.");
    }

    storage.sql.exec(
      `
        INSERT INTO ${archiveRestoreGuardTableName} (id, token, source_cursor, acquired_at)
        VALUES (1, ?, ?, ?)
      `,
      input.guardToken,
      currentSourceCursor,
      nowIsoString(),
    );

    return {
      guardToken: input.guardToken,
      snapshot: storageSnapshotFromCurrentState(
        storage,
        storedSchema,
        input.storageIdentity,
        input.schemaKey,
      ),
    };
  });
}

export function assertArchiveRestoreGuardAllowsWrite(
  storage: DurableObjectStorage,
  guardToken?: string,
): void {
  const currentSourceCursor = getCurrentCursor(storage);
  const guard = readArchiveRestoreGuard(storage);

  if (!guard) {
    if (guardToken !== undefined) {
      throw new ArchiveRestoreGuardConflictError({
        currentSourceCursor,
        reason: "guard-token-invalid",
      });
    }

    return;
  }

  if (guardToken !== guard.token) {
    throw new ArchiveRestoreGuardConflictError({
      currentSourceCursor,
      expectedSourceCursor: guard.source_cursor,
      reason: guardToken === undefined ? "guard-held" : "guard-token-invalid",
    });
  }
}

export function releaseArchiveRestoreGuard(
  storage: DurableObjectStorage,
  guardToken: string,
): void {
  storage.transactionSync(() => {
    assertArchiveRestoreGuardAllowsWrite(storage, guardToken);
    storage.sql.exec(`DELETE FROM ${archiveRestoreGuardTableName} WHERE id = 1`);
  });
}

export function initializeStorageFromSource(
  storage: DurableObjectStorage,
  source: StorageSource,
  options: {
    refreshActiveSchema?: boolean;
    selectRecordsForSchemaRefresh?: (records: StoredRecord[]) => StoredRecord[];
  } = {},
): StoredSchema {
  return storage.transactionSync(() => {
    const existing = readStoredSchema(storage);

    if (existing) {
      if (options.refreshActiveSchema === false) {
        return existing;
      }

      return refreshActiveSchemaFromSource(
        storage,
        existing,
        source,
        options.selectRecordsForSchemaRefresh,
      );
    }

    return writeSourceSchema(storage, source);
  });
}

function refreshActiveSchemaFromSource(
  storage: DurableObjectStorage,
  existing: StoredSchema,
  source: StorageSource,
  selectRecords: ((records: StoredRecord[]) => StoredRecord[]) | undefined,
): StoredSchema {
  if (!source.schemaProvenance) {
    return existing;
  }

  const schemaChanged = !schemasEqual(existing.schema, source.schema);
  const trackedSchemaProvenance = existing.schemaProvenance;

  if (!trackedSchemaProvenance && schemaChanged) {
    return existing;
  }

  const provenanceChanged = !schemaProvenancesEqual(
    existing.schemaProvenance,
    source.schemaProvenance,
  );

  if (!schemaChanged && !provenanceChanged) {
    return existing;
  }

  try {
    assertEntityIdentityContinuity(existing.schema, source.schema);
    const records = getBootstrapRecords(storage);
    validateActiveRecordsAgainstSchema(source.schema, selectRecords?.(records) ?? records);
  } catch (error) {
    throw activeSchemaRefreshBlocked(existing, source, errorMessage(error));
  }

  return writeActiveSchemaAt(storage, source.schema, nowIsoString(), source.schemaProvenance);
}

function activeSchemaRefreshBlocked(existing: StoredSchema, source: StorageSource, reason: string) {
  if (!source.schemaProvenance) {
    throw new Error("Cannot create an active schema refresh blocker without target provenance.");
  }

  return new ActiveSchemaRefreshBlockedError({
    ...(existing.schemaProvenance === undefined
      ? {}
      : { currentSchemaProvenance: existing.schemaProvenance }),
    reason,
    schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
    storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
    targetSchemaProvenance: source.schemaProvenance,
  });
}

export function writeActiveSchema(storage: DurableObjectStorage, schema: AppSchema): StoredSchema {
  return writeOutcomeResponse(writeActiveSchemaOutcome(storage, schema));
}

export function writeActiveSchemaOutcome(
  storage: DurableObjectStorage,
  schema: AppSchema,
): WriteOutcome<StoredSchema> {
  const existing = readStoredSchema(storage);

  if (existing) {
    assertEntityIdentityContinuity(existing.schema, schema);
  }

  return committedWrite(writeActiveSchemaAt(storage, schema, nowIsoString()));
}

function writeActiveSchemaAt(
  storage: DurableObjectStorage,
  schema: AppSchema,
  updatedAt: string,
  schemaProvenance?: ProgramSchemaProvenance,
): StoredSchema {
  getAppSchemaDefinitionIndex(schema);
  storage.sql.exec(
    `
      INSERT INTO app_schema (id, schema_json, schema_provenance_json, updated_at)
      VALUES (1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        schema_json = excluded.schema_json,
        schema_provenance_json = excluded.schema_provenance_json,
        updated_at = excluded.updated_at
    `,
    stringifySchema(schema),
    schemaProvenance ? JSON.stringify(schemaProvenance) : null,
    updatedAt,
  );

  return {
    schema,
    ...(schemaProvenance === undefined ? {} : { schemaProvenance }),
    updatedAt,
  };
}

export function resetStorageSchemaToSource(
  storage: DurableObjectStorage,
  source: StorageSource,
  validate: StorageSchemaResetValidator,
): StoredSchema {
  return writeOutcomeResponse(resetStorageSchemaToSourceOutcome(storage, source, validate));
}

export function resetStorageSchemaToSourceOutcome(
  storage: DurableObjectStorage,
  source: StorageSource,
  validate: StorageSchemaResetValidator,
): WriteOutcome<StoredSchema> {
  return storage.transactionSync(() => {
    const current = readStoredSchema(storage);

    if (!current) {
      return committedWrite(writeSourceSchema(storage, source));
    }

    const records = getBootstrapRecords(storage);
    assertEntityIdentityContinuity(current.schema, source.schema);
    validate(current.schema, source.schema, records);
    const plan = planSourceSchemaReset(records, source.schema, nowIsoString());
    materializeSourceSchemaResetRecordPrunes(storage, plan.prunedRecords);
    appendSourceSchemaResetChanges(storage, plan);

    return committedWrite(
      writeActiveSchemaAt(storage, plan.schema, plan.changedAt, source.schemaProvenance),
    );
  });
}

export function resetStorageToEmpty(storage: DurableObjectStorage) {
  ensureStorageTables(storage);
  storage.transactionSync(() => {
    clearStorageForReplacement(storage);
  });
}

export function reconcileRuntimeInvariantRecords(
  storage: DurableObjectStorage,
  requiredRecords: readonly StoredRecord[],
  input: {
    validate: (records: StoredRecord[]) => void;
    writeIdPrefix: string;
  },
): StoredRecord[] {
  return storage.transactionSync(() => {
    const records = getBootstrapRecords(storage);
    const recordsById = new Map(records.map((record) => [record.id, record]));
    const requiredIds = new Set<string>();
    const changedAt = nowIsoString();
    const changedRecords: StoredRecord[] = [];

    for (const required of requiredRecords) {
      if (requiredIds.has(required.id)) {
        throw new Error(`Runtime invariant records include duplicate id "${required.id}".`);
      }
      requiredIds.add(required.id);

      const existing = recordsById.get(required.id);
      if (existing && existing.entity !== required.entity) {
        throw new Error(
          `Runtime invariant record "${required.id}" belongs to entity "${existing.entity}", expected "${required.entity}".`,
        );
      }

      if (existing && !existing.deletedAt && recordValuesEqual(existing.values, required.values)) {
        continue;
      }

      changedRecords.push(
        existing
          ? {
              ...existing,
              values: required.values,
              updatedAt: changedAt,
              deletedAt: undefined,
            }
          : required,
      );
    }

    if (changedRecords.length === 0) {
      return [];
    }

    const changedById = new Map(changedRecords.map((record) => [record.id, record]));
    input.validate([
      ...records.filter((record) => !changedById.has(record.id)).map((record) => ({ ...record })),
      ...changedRecords,
    ]);

    for (const record of changedRecords) {
      const existing = recordsById.get(record.id);

      if (existing) {
        storage.sql.exec(
          `
            UPDATE records
            SET values_json = ?,
                updated_at = ?,
                deleted_at = NULL
            WHERE id = ?
          `,
          JSON.stringify(record.values),
          record.updatedAt,
          record.id,
        );
      } else {
        storage.sql.exec(
          `
            INSERT INTO records (id, entity, values_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
          `,
          record.id,
          record.entity,
          JSON.stringify(record.values),
          record.createdAt,
          record.updatedAt,
        );
      }

      appendWriteLogChange(storage, {
        writeId: `${input.writeIdPrefix}:${changedAt}:${record.id}`,
        operationKind: existing ? "update" : "create",
        entity: record.entity,
        record,
        createdAt: record.updatedAt,
      });
    }

    return changedRecords;
  });
}

export function removeStorageRecords(
  storage: DurableObjectStorage,
  records: readonly StoredRecord[],
  input: {
    validate: (records: readonly StoredRecord[]) => void;
    writeId: string;
  },
): StoredRecord[] {
  return storage.transactionSync(() => {
    const activeRecords = records.filter((record) => record.deletedAt === undefined);

    if (activeRecords.length === 0) {
      return [];
    }

    const deletedAt = nowIsoString();
    const tombstones = activeRecords.map((record) => ({
      ...record,
      deletedAt,
      updatedAt: deletedAt,
    }));
    const removedIds = new Set(tombstones.map((record) => record.id));
    const candidateRecords = getBootstrapRecords(storage).filter(
      (record) => !removedIds.has(record.id),
    );

    input.validate(candidateRecords);

    for (const record of tombstones) {
      storage.sql.exec("DELETE FROM records WHERE id = ?", record.id);
      appendWriteLogChange(storage, {
        writeId: input.writeId,
        operationKind: "delete",
        entity: record.entity,
        record,
        createdAt: deletedAt,
      });
    }

    return tombstones;
  });
}

export function exportStorageSnapshot(
  storage: DurableObjectStorage,
  storageIdentity: string,
  schemaKey: string,
): StorageSnapshot {
  return storage.transactionSync(() => {
    const storedSchema = readStoredSchema(storage);

    if (!storedSchema) {
      throw new Error("Cannot export storage snapshot before storage is initialized.");
    }

    return storageSnapshotFromCurrentState(storage, storedSchema, storageIdentity, schemaKey);
  });
}

export function exportStorageSnapshotSource(
  storage: DurableObjectStorage,
  storageIdentity: string,
  schemaKey: string,
): StorageSnapshotSource {
  return storage.transactionSync(() => {
    const storedSchema = readStoredSchema(storage);

    if (!storedSchema) {
      throw new Error("Cannot export storage snapshot source before storage is initialized.");
    }

    return {
      ...(storedSchema.schemaProvenance?.kind !== "program"
        ? {}
        : { schemaProvenance: storedSchema.schemaProvenance }),
      snapshot: storageSnapshotFromCurrentState(storage, storedSchema, storageIdentity, schemaKey),
    };
  });
}

function storageSnapshotFromCurrentState(
  storage: DurableObjectStorage,
  storedSchema: StoredSchema,
  storageIdentity: string,
  schemaKey: string,
): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity,
    schemaKey,
    exportedAt: nowIsoString(),
    schemaUpdatedAt: storedSchema.updatedAt,
    sourceCursor: getCurrentCursor(storage),
    schema: storedSchema.schema,
    records: formatStoredRecordsForArtifact(storedSchema.schema, getBootstrapRecords(storage)),
  };
}

export function restoreStorageSnapshot(
  storage: DurableObjectStorage,
  snapshot: StorageSnapshot,
): BootstrapResponse {
  return writeOutcomeResponse(restoreStorageSnapshotOutcome(storage, snapshot));
}

export function restoreStorageSnapshotOutcome(
  storage: DurableObjectStorage,
  snapshot: StorageSnapshot,
  source?: Pick<StorageSource, "schema" | "schemaProvenance">,
): WriteOutcome<BootstrapResponse> {
  return storage.transactionSync(() => {
    assertSnapshotRecordIdsAreUnique(snapshot.records);

    const restoredAt = nowIsoString();
    const currentRecords = getBootstrapRecords(storage);
    const plan = planSnapshotRestore(snapshot.records, currentRecords, restoredAt);
    const schemaProvenance =
      source?.schemaProvenance && schemasEqual(snapshot.schema, source.schema)
        ? source.schemaProvenance
        : undefined;
    const storedSchema = writeActiveSchemaAt(
      storage,
      snapshot.schema,
      restoredAt,
      schemaProvenance,
    );

    materializeSnapshotRestoreRecords(storage, plan);
    appendSnapshotRestoreChanges(storage, plan);
    storage.sql.exec("DELETE FROM command_executions");
    storage.sql.exec(`DELETE FROM ${operationInvocationsTableName}`);

    return committedWrite({
      schema: storedSchema.schema,
      ...(storedSchema.schemaProvenance?.kind !== "program"
        ? {}
        : { schemaProvenance: storedSchema.schemaProvenance }),
      schemaUpdatedAt: storedSchema.updatedAt,
      records: getBootstrapRecords(storage),
      cursor: getCurrentCursor(storage),
    });
  });
}

function clearStorageForReplacement(storage: DurableObjectStorage) {
  storage.sql.exec("DELETE FROM changes");
  storage.sql.exec("DELETE FROM records");
  storage.sql.exec("DELETE FROM command_executions");
  storage.sql.exec(`DELETE FROM ${operationInvocationsTableName}`);
  storage.sql.exec(`DELETE FROM ${archiveRestoreGuardTableName}`);
  storage.sql.exec("DELETE FROM app_schema");
  storage.sql.exec("DELETE FROM sqlite_sequence WHERE name = 'changes'");
}

function writeSourceSchema(storage: DurableObjectStorage, source: StorageSource): StoredSchema {
  return writeActiveSchemaAt(storage, source.schema, nowIsoString(), source.schemaProvenance);
}

function planSourceSchemaReset(
  records: StoredRecord[],
  schema: AppSchema,
  changedAt: string,
): SourceSchemaResetPlan {
  const prunedRecords: StoredRecord[] = [];
  for (const record of records) {
    const entity = schema.entities.find((definition) => definition.key === record.entity)!;
    if (!entity) {
      continue;
    }

    const values = pruneRecordValuesToEntity(record.values, entity);

    if (recordValuesEqual(record.values, values)) {
      continue;
    }

    prunedRecords.push({ ...record, values, updatedAt: changedAt });
  }

  return { schema, changedAt, prunedRecords };
}

function materializeSourceSchemaResetRecordPrunes(
  storage: DurableObjectStorage,
  records: StoredRecord[],
) {
  for (const record of records) {
    storage.sql.exec(
      `
        UPDATE records
        SET values_json = ?,
            updated_at = ?
        WHERE id = ?
      `,
      JSON.stringify(record.values),
      record.updatedAt,
      record.id,
    );
  }
}

function appendSourceSchemaResetChanges(
  storage: DurableObjectStorage,
  plan: SourceSchemaResetPlan,
) {
  for (const record of plan.prunedRecords) {
    appendWriteLogChange(storage, {
      writeId: `schema-reset:${plan.changedAt}:${record.id}`,
      operationKind: "update",
      entity: record.entity,
      record,
      createdAt: plan.changedAt,
    });
  }
}
function pruneRecordValuesToEntity(values: RecordValues, entity: EntitySchema): RecordValues {
  const pruned: RecordValues = {};
  for (const [fieldName, fieldValue] of Object.entries(values)) {
    if (entity.fields.some((field) => field.key === fieldName)) {
      pruned[fieldName] = fieldValue;
    }
  }

  return pruned;
}

function planSnapshotRestore(
  snapshotRecords: StoredRecord[],
  currentRecords: StoredRecord[],
  restoredAt: string,
): SnapshotRestorePlan {
  const currentRecordsById = new Map(currentRecords.map((record) => [record.id, record]));
  const snapshotRecordIds = new Set(snapshotRecords.map((record) => record.id));
  const recordsToTombstone: StoredRecord[] = [];
  const changedRecords: StoredRecord[] = [];

  for (const record of snapshotRecords) {
    if (!storedRecordsEqual(currentRecordsById.get(record.id), record)) {
      changedRecords.push(record);
    }
  }

  for (const record of currentRecords) {
    if (snapshotRecordIds.has(record.id) || record.deletedAt) {
      continue;
    }

    const tombstonedRecord = { ...record, updatedAt: restoredAt, deletedAt: restoredAt };
    recordsToTombstone.push(tombstonedRecord);
    changedRecords.push(tombstonedRecord);
  }

  return {
    restoredAt,
    restoreWriteId: `snapshot-restore:${restoredAt}`,
    recordsToRestore: snapshotRecords,
    recordsToTombstone,
    changedRecords,
  };
}

function upsertSnapshotRecord(storage: DurableObjectStorage, record: StoredRecord) {
  storage.sql.exec(
    `
      INSERT INTO records (id, entity, values_json, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        entity = excluded.entity,
        values_json = excluded.values_json,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    `,
    record.id,
    record.entity,
    JSON.stringify(record.values),
    record.createdAt,
    record.updatedAt,
    record.deletedAt ?? null,
  );
}

function materializeSnapshotRestoreRecords(
  storage: DurableObjectStorage,
  plan: SnapshotRestorePlan,
) {
  for (const record of plan.recordsToRestore) {
    upsertSnapshotRecord(storage, record);
  }

  for (const record of plan.recordsToTombstone) {
    upsertSnapshotRecord(storage, record);
  }
}

function appendSnapshotRestoreChanges(storage: DurableObjectStorage, plan: SnapshotRestorePlan) {
  for (const record of plan.changedRecords) {
    appendWriteLogChange(storage, {
      writeId: plan.restoreWriteId,
      operationKind: "command",
      entity: record.entity,
      record,
      createdAt: plan.restoredAt,
    });
  }
}

function validateActiveRecordsAgainstSchema(schema: AppSchema, records: StoredRecord[]) {
  const activeRecords = records.filter((record) => !record.deletedAt);
  const recordsById = new Map<string, StoredRecord>();

  for (const record of activeRecords) {
    if (recordsById.has(record.id)) {
      throw new Error(`Active schema refresh found duplicate record id "${record.id}".`);
    }

    recordsById.set(record.id, record);
  }

  for (const record of activeRecords) {
    validateActiveSchemaRefreshRecord(schema, record, recordsById);
  }

  assertActiveSchemaRefreshUniqueConstraints(schema, activeRecords);
}

function validateActiveSchemaRefreshRecord(
  schema: AppSchema,
  record: StoredRecord,
  recordsById: Map<string, StoredRecord>,
) {
  const entity = schema.entities.find((definition) => definition.key === record.entity)!;
  if (!entity) {
    throw new Error(`record "${record.id}" references unknown entity "${record.entity}"`);
  }
  for (const fieldName of Object.keys(record.values)) {
    if (!entity.fields.some((field) => field.key === fieldName)) {
      throw new Error(
        `record "${record.id}" would require value pruning for unknown field "${record.entity}.${fieldName}"`,
      );
    }
  }
  for (const field of entity.fields) {
    const fieldName = field.key;
    const fieldValue = record.values[fieldName];
    const fieldWasProvided = fieldName in record.values;
    const result = validateAuthorityFieldValue(fieldName, field, fieldValue, fieldWasProvided);

    if (result.kind === "omit") {
      continue;
    }

    if (field.type !== "reference") {
      continue;
    }

    if (typeof result.value !== "string") {
      throw new Error("reference field validation returned a non-string value");
    }

    if (isSupportedIdentityReferenceTarget(field.to)) {
      continue;
    }

    const targetRecord = recordsById.get(result.value);

    if (!targetRecord) {
      throw new Error(
        `field "${record.entity}.${fieldName}" references unknown ${field.to} record "${result.value}"`,
      );
    }

    if (targetRecord.entity !== field.to) {
      throw new Error(`field "${record.entity}.${fieldName}" must reference a ${field.to} record`);
    }
  }
}
function assertActiveSchemaRefreshUniqueConstraints(schema: AppSchema, records: StoredRecord[]) {
  for (const entity of schema.entities) {
    const entityName = entity.key;
    const entityRecords = records.filter((record) => record.entity === entityName);
    for (const constraint of entity.constraints ?? []) {
      if (constraint.kind !== "unique") {
        continue;
      }
      const constraintName = constraint.key;
      assertActiveSchemaRefreshUniqueConstraint(
        entityName,
        constraintName,
        constraint,
        entityRecords,
      );
    }
  }
}

function assertActiveSchemaRefreshUniqueConstraint(
  entityName: string,
  constraintName: string,
  constraint: UniqueConstraintSchema,
  records: StoredRecord[],
) {
  const seen = new Set<string>();

  for (const record of records) {
    const key = JSON.stringify(
      constraint.fields.map((fieldName) => record.values[fieldName] ?? null),
    );

    if (seen.has(key)) {
      throw new Error(`unique constraint "${entityName}.${constraintName}" would be violated`);
    }

    seen.add(key);
  }
}

export function getBootstrapRecords(storage: DurableObjectStorage): StoredRecord[] {
  const rows = storage.sql
    .exec<RecordRow>(
      "SELECT id, entity, values_json, created_at, updated_at, deleted_at FROM records ORDER BY created_at ASC",
    )
    .toArray();

  return rows.map(recordFromRow);
}

export function getActiveRecordsByEntity(
  storage: DurableObjectStorage,
  entity: string,
): StoredRecord[] {
  const rows = storage.sql
    .exec<RecordRow>(
      `
        SELECT id, entity, values_json, created_at, updated_at, deleted_at
        FROM records
        WHERE entity = ? AND deleted_at IS NULL
        ORDER BY created_at ASC
      `,
      entity,
    )
    .toArray();

  return rows.map(recordFromRow);
}

export function getCurrentCursor(storage: DurableObjectStorage) {
  return readCurrentWriteLogCursor(storage);
}

export function getChangesAfter(storage: DurableObjectStorage, after: number): ChangeRow[] {
  return readWriteLogChangesAfter(storage, after);
}

export function readOperationInvocations(
  storage: DurableObjectStorage,
): StoredOperationInvocation[] {
  ensureOperationInvocationTables(storage);
  return storage.sql
    .exec<OperationInvocationRow>(`
        SELECT
          invocation_id,
          operation_key,
          operation_kind,
          entity,
          operation_name,
          actor_kind,
          auth_decision,
          source_protocol,
          source_json,
          input_hash,
          input_audit_json,
          affected_change_ids_json,
          idempotency_json,
          output_json,
          status,
          status_history_json,
          error_message,
          received_at,
          updated_at,
          completed_at
        FROM ${operationInvocationsTableName}
        ORDER BY received_at ASC, invocation_id ASC
      `)
    .toArray()
    .map(operationInvocationFromRow);
}

export function getOperationInvocationById(
  storage: DurableObjectStorage,
  invocationId: string,
): StoredOperationInvocation | undefined {
  ensureOperationInvocationTables(storage);

  const row = storage.sql
    .exec<OperationInvocationRow>(
      `
        SELECT
          invocation_id,
          operation_key,
          operation_kind,
          entity,
          operation_name,
          actor_kind,
          auth_decision,
          source_protocol,
          source_json,
          input_hash,
          input_audit_json,
          affected_change_ids_json,
          idempotency_json,
          output_json,
          status,
          status_history_json,
          error_message,
          received_at,
          updated_at,
          completed_at
        FROM ${operationInvocationsTableName}
        WHERE invocation_id = ?
      `,
      invocationId,
    )
    .next();

  return row.done ? undefined : operationInvocationFromRow(row.value);
}

export function recordOperationInvocationAccepted(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
) {
  const existing = getOperationInvocationById(storage, envelope.invocationId);

  if (!existing) {
    upsertOperationInvocation(storage, {
      authDecision: "allowed",
      envelope,
      status: "accepted",
    });
    return;
  }

  if (existing.status === "accepted") {
    return;
  }

  if (existing.status === "failed") {
    upsertOperationInvocation(storage, {
      authDecision: existing.authDecision,
      envelope,
      status: "resumed",
    });
  }
}

export function recordOperationInvocationRejected(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
  error: unknown,
) {
  upsertOperationInvocation(storage, {
    authDecision: "denied",
    envelope,
    errorMessage: errorMessage(error),
    status: "rejected",
  });
}

export function recordOperationInvocationFailed(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
  error: unknown,
) {
  upsertOperationInvocation(storage, {
    authDecision: "allowed",
    envelope,
    errorMessage: errorMessage(error),
    status: "failed",
  });
}

export function recordOperationInvocationOutcome(
  storage: DurableObjectStorage,
  input: {
    envelope: OperationInvocationEnvelope;
    output?: OperationInvocationOutput;
    status: OperationInvocationStatus;
  },
) {
  upsertOperationInvocation(storage, {
    authDecision: "allowed",
    envelope: input.envelope,
    output: input.output,
    status: input.status,
  });
}

export function createStoredRecord(
  storage: DurableObjectStorage,
  request: CreateRecordWriteRequest,
  applySideEffects?: ApplyCreateRecordWriteSideEffects,
  validateConstraints?: RecordConstraintValidator,
): RecordWriteResponse {
  return writeOutcomeResponse(
    createStoredRecordOutcome(storage, request, applySideEffects, validateConstraints),
  );
}

export function createStoredRecordOutcome(
  storage: DurableObjectStorage,
  request: CreateRecordWriteRequest,
  applySideEffects?: ApplyCreateRecordWriteSideEffects,
  validateConstraints?: RecordConstraintValidator,
  options: RecordWriteMaterializationOptions = {},
): WriteOutcome<RecordWriteResponse> {
  return storage.transactionSync(() => {
    const existingResponse =
      options.allowStoredReplay === false
        ? undefined
        : readRecordWriteReplayResponse(storage, request.writeId);

    if (existingResponse) {
      return replayedWrite(existingResponse);
    }

    const createdAt = options.now ?? nowIsoString();
    const record = materializeCreatedRecordWriteRecord(
      storage,
      {
        entity: request.entity,
        id: request.id,
        values: request.values,
        createdAt,
      },
      validateConstraints,
    );

    appendRecordWriteLogChange(storage, {
      writeId: request.writeId,
      operationKind: "create",
      entity: request.entity,
      record,
      createdAt,
    });

    applySideEffects?.({
      storage,
      request,
      record,
      createRecords: (entity, recordValuesToCreate) => {
        const sideEffectCreatedAt = options.now ?? nowIsoString();
        const records = materializeCreatedRecordWriteRecords(
          storage,
          entity,
          recordValuesToCreate,
          sideEffectCreatedAt,
          validateConstraints,
        );

        appendRecordWriteChanges(storage, {
          writeId: request.writeId,
          operationKind: "command",
          entity,
          records,
          createdAt: sideEffectCreatedAt,
        });
      },
    });

    return committedWrite(
      readCommittedRecordWriteResponse(storage, {
        writeId: request.writeId,
        record,
      }),
    );
  });
}

export function patchStoredRecord(
  storage: DurableObjectStorage,
  request: PatchRecordWriteRequest,
  values?: RecordValues,
  validateConstraints?: RecordConstraintValidator,
): RecordWriteResponse {
  return writeOutcomeResponse(
    patchStoredRecordOutcome(storage, request, values, validateConstraints),
  );
}

export function patchStoredRecordOutcome(
  storage: DurableObjectStorage,
  request: PatchRecordWriteRequest,
  values?: RecordValues,
  validateConstraints?: RecordConstraintValidator,
  options: RecordWriteMaterializationOptions = {},
): WriteOutcome<RecordWriteResponse> {
  return storage.transactionSync(() => {
    const existingResponse =
      options.allowStoredReplay === false
        ? undefined
        : readRecordWriteReplayResponse(storage, request.writeId);

    if (existingResponse) {
      return replayedWrite(existingResponse);
    }

    const existingRecord = getStoredRecord(storage, request.recordId);

    if (!existingRecord) {
      throw new Error(`Record "${request.recordId}" does not exist.`);
    }

    const changedAt = options.now ?? nowIsoString();
    const record = materializePatchedRecordWriteRecord(
      storage,
      {
        changedAt,
        entity: request.entity,
        existingRecord,
        values: values ?? mergeRecordValues(existingRecord.values, request.values),
      },
      validateConstraints,
    );

    appendRecordWriteLogChange(storage, {
      writeId: request.writeId,
      operationKind: "update",
      entity: request.entity,
      record,
      createdAt: changedAt,
    });

    return committedWrite(
      readCommittedRecordWriteResponse(storage, {
        writeId: request.writeId,
        record,
      }),
    );
  });
}

export function deleteStoredRecord(
  storage: DurableObjectStorage,
  request: DeleteRecordWriteRequest,
): RecordWriteResponse {
  return writeOutcomeResponse(deleteStoredRecordOutcome(storage, request));
}

export function deleteStoredRecordOutcome(
  storage: DurableObjectStorage,
  request: DeleteRecordWriteRequest,
  options: RecordWriteMaterializationOptions = {},
): WriteOutcome<RecordWriteResponse> {
  return storage.transactionSync(() => {
    const existingResponse =
      options.allowStoredReplay === false
        ? undefined
        : readRecordWriteReplayResponse(storage, request.writeId);

    if (existingResponse) {
      return replayedWrite(existingResponse);
    }

    const existingRecord = getStoredRecord(storage, request.recordId);

    if (!existingRecord) {
      throw new Error(`Record "${request.recordId}" does not exist.`);
    }

    const deletedAt = options.now ?? nowIsoString();
    assertDeleteRecordWriteRequestCanMaterialize(request, existingRecord);
    const record = materializeDeletedRecordWriteRecord(storage, existingRecord, deletedAt);

    appendRecordWriteLogChange(storage, {
      writeId: request.writeId,
      operationKind: "delete",
      entity: request.entity,
      record,
      createdAt: deletedAt,
    });

    return committedWrite(
      readCommittedRecordWriteResponse(storage, {
        writeId: request.writeId,
        record,
      }),
    );
  });
}

export function tombstoneRecordsForOperation(
  storage: DurableObjectStorage,
  writeId: string,
  entity: string,
  operationName: string,
  recordsToTombstone: StoredRecord[],
  options: OperationMaterializationOptions = {},
): CommandWriteResponse {
  return writeOutcomeResponse(
    tombstoneRecordsForOperationOutcome(
      storage,
      writeId,
      entity,
      operationName,
      recordsToTombstone,
      options,
    ),
  );
}

export function tombstoneRecordsForOperationOutcome(
  storage: DurableObjectStorage,
  writeId: string,
  entity: string,
  operationName: string,
  recordsToTombstone: StoredRecord[],
  options: OperationMaterializationOptions = {},
): WriteOutcome<CommandWriteResponse> {
  return storage.transactionSync(() => {
    const existingResponse = getCommandWriteResponseById(storage, writeId);

    if (existingResponse) {
      return replayedWrite(existingResponse);
    }

    const deletedAt = options.now ?? nowIsoString();
    const records = materializeOperationTombstoneRecords(storage, recordsToTombstone, deletedAt);

    appendOperationRecordChanges(storage, {
      writeId,
      entity,
      records,
      createdAt: deletedAt,
    });

    return committedWrite(
      commitCommandWriteLog(storage, {
        writeId,
        entity,
        operationName,
        createdAt: deletedAt,
      }),
    );
  });
}

export function createRecordsForOperation(
  storage: DurableObjectStorage,
  writeId: string,
  entity: string,
  operationName: string,
  recordValuesToCreate: RecordValues[],
  validateConstraints?: RecordConstraintValidator,
  options: OperationMaterializationOptions = {},
): CommandWriteResponse {
  return writeOutcomeResponse(
    createRecordsForOperationOutcome(
      storage,
      writeId,
      entity,
      operationName,
      recordValuesToCreate,
      validateConstraints,
      options,
    ),
  );
}

export function createRecordsForOperationOutcome(
  storage: DurableObjectStorage,
  writeId: string,
  entity: string,
  operationName: string,
  recordValuesToCreate: RecordValues[],
  validateConstraints?: RecordConstraintValidator,
  options: OperationMaterializationOptions = {},
): WriteOutcome<CommandWriteResponse> {
  return storage.transactionSync(() => {
    const existingResponse = getCommandWriteResponseById(storage, writeId);

    if (existingResponse) {
      return replayedWrite(existingResponse);
    }

    const createdAt = options.now ?? nowIsoString();
    const records = materializeCreatedOperationRecords(
      storage,
      entity,
      recordValuesToCreate,
      createdAt,
      validateConstraints,
    );

    appendOperationRecordChanges(storage, {
      writeId,
      entity,
      records,
      createdAt,
    });

    return committedWrite(
      commitCommandWriteLog(storage, {
        writeId,
        entity,
        operationName,
        createdAt,
      }),
    );
  });
}

export function createRecordSetForOperationOutcome(
  storage: DurableObjectStorage,
  writeId: string,
  entity: string,
  operationName: string,
  plans: OperationRecordCreatePlan[],
  validateConstraints?: RecordConstraintValidator,
  options: OperationMaterializationOptions = {},
): WriteOutcome<CommandWriteResponse> {
  return storage.transactionSync(() => {
    const existingResponse = getCommandWriteResponseById(storage, writeId);

    if (existingResponse) {
      return replayedWrite(existingResponse);
    }

    const createdAt = options.now ?? nowIsoString();
    const records = materializeCreatedOperationRecordSet(
      storage,
      plans,
      createdAt,
      validateConstraints,
    );

    appendOperationRecordChanges(storage, {
      writeId,
      records,
      createdAt,
    });

    return committedWrite(
      commitCommandWriteLog(storage, {
        writeId,
        entity,
        operationName,
        createdAt,
      }),
    );
  });
}

export function writeRecordSetForOperationOutcome(
  storage: DurableObjectStorage,
  writeId: string,
  entity: string,
  operationName: string,
  plans: OperationRecordWritePlan[],
  validateConstraints?: RecordConstraintValidator,
  options: OperationMaterializationOptions = {},
): WriteOutcome<CommandWriteResponse> {
  return storage.transactionSync(() => {
    const existingResponse = getCommandWriteResponseById(storage, writeId);

    if (existingResponse) {
      return replayedWrite(existingResponse);
    }

    const changedAt = options.now ?? nowIsoString();
    const records = materializeOperationRecordWrites(
      storage,
      plans,
      changedAt,
      validateConstraints,
    );

    appendOperationRecordChanges(storage, {
      writeId,
      records,
      createdAt: changedAt,
    });

    return committedWrite(
      commitCommandWriteLog(storage, {
        writeId,
        entity,
        operationName,
        createdAt: changedAt,
      }),
    );
  });
}

export function writeRecordSetForCommandOperationOutcome(
  storage: DurableObjectStorage,
  operationId: string,
  plans: OperationRecordWritePlan[],
  validateConstraints?: RecordConstraintValidator,
  options: OperationMaterializationOptions = {},
): WriteOutcome<OperationCommandOutput> {
  return storage.transactionSync(() => {
    const existingChanges =
      options.allowStoredReplay === false ? [] : readWriteLogChangesByWriteId(storage, operationId);

    if (existingChanges.length > 0) {
      return replayedWrite(operationCommandOutputFromChanges(storage, existingChanges));
    }

    options.assertPreconditions?.();

    const changedAt = options.now ?? nowIsoString();
    const records = materializeOperationRecordWrites(
      storage,
      plans,
      changedAt,
      validateConstraints,
    );

    appendOperationCommandRecordChanges(storage, {
      operationId,
      records,
      createdAt: changedAt,
    });

    const changes = readWriteLogChangesByWriteId(storage, operationId);

    return committedWrite(operationCommandOutputFromChanges(storage, changes));
  });
}

function operationCommandOutputFromChanges(
  storage: DurableObjectStorage,
  changes: ChangeRow[],
): OperationCommandOutput {
  return {
    type: "command",
    affectedChangeIds: changes.map((change) => String(change.seq)),
    changes,
    cursor: changes.at(-1)?.seq ?? readCurrentWriteLogCursor(storage),
  };
}

function materializeOperationTombstoneRecords(
  storage: DurableObjectStorage,
  recordsToTombstone: StoredRecord[],
  deletedAt: string,
): StoredRecord[] {
  return recordsToTombstone.map((record) =>
    materializeOperationTombstoneRecord(storage, record, deletedAt),
  );
}

function materializeOperationTombstoneRecord(
  storage: DurableObjectStorage,
  existingRecord: StoredRecord,
  deletedAt: string,
): StoredRecord {
  const record: StoredRecord = {
    ...existingRecord,
    updatedAt: deletedAt,
    deletedAt,
  };

  storage.sql.exec(
    `
      UPDATE records
      SET updated_at = ?,
          deleted_at = ?
      WHERE id = ?
    `,
    deletedAt,
    deletedAt,
    record.id,
  );

  return record;
}

function materializeCreatedOperationRecords(
  storage: DurableObjectStorage,
  entity: string,
  recordValuesToCreate: RecordValues[],
  createdAt: string,
  validateConstraints?: RecordConstraintValidator,
): StoredRecord[] {
  return recordValuesToCreate.map((values) =>
    materializeCreatedOperationRecord(
      storage,
      {
        entity,
        values,
        createdAt,
      },
      validateConstraints,
    ),
  );
}

function materializeCreatedOperationRecordSet(
  storage: DurableObjectStorage,
  plans: OperationRecordCreatePlan[],
  createdAt: string,
  validateConstraints?: RecordConstraintValidator,
): StoredRecord[] {
  const createdRecords: StoredRecord[] = [];

  for (const plan of plans) {
    const values =
      typeof plan.values === "function" ? plan.values([...createdRecords]) : plan.values;
    const record = materializeCreatedOperationRecord(
      storage,
      {
        entity: plan.entity,
        id: plan.id,
        values,
        createdAt,
      },
      validateConstraints,
      createdRecords,
    );

    createdRecords.push(record);
  }

  return createdRecords;
}

function materializeOperationRecordWrites(
  storage: DurableObjectStorage,
  plans: OperationRecordWritePlan[],
  changedAt: string,
  validateConstraints?: RecordConstraintValidator,
): StoredRecord[] {
  const writtenRecords: StoredRecord[] = [];

  for (const plan of plans) {
    if (plan.kind === "create") {
      const values =
        typeof plan.values === "function" ? plan.values([...writtenRecords]) : plan.values;
      const record = materializeCreatedOperationRecord(
        storage,
        {
          entity: plan.entity,
          id: plan.id,
          values,
          createdAt: changedAt,
        },
        validateConstraints,
        writtenRecords,
      );

      writtenRecords.push(record);
      continue;
    }

    const record = resolveOperationRecordWriteTarget(plan.record, writtenRecords);

    if (plan.kind === "patch") {
      const values =
        typeof plan.values === "function" ? plan.values([...writtenRecords]) : plan.values;

      writtenRecords.push(
        materializePatchedOperationRecord(
          storage,
          record,
          values,
          changedAt,
          validateConstraints,
          writtenRecords,
        ),
      );
      continue;
    }

    writtenRecords.push(materializeOperationTombstoneRecord(storage, record, changedAt));
  }

  return writtenRecords;
}

function resolveOperationRecordWriteTarget(
  target: OperationRecordWriteTarget,
  writtenRecords: StoredRecord[],
) {
  return typeof target === "function" ? target([...writtenRecords]) : target;
}

function materializePatchedOperationRecord(
  storage: DurableObjectStorage,
  existingRecord: StoredRecord,
  values: RecordValues,
  changedAt: string,
  validateConstraints?: RecordConstraintValidator,
  additionalRecords: readonly StoredRecord[] = [],
): StoredRecord {
  const record: StoredRecord = {
    ...existingRecord,
    values,
    updatedAt: changedAt,
  };

  validateConstraints?.(record.entity, record.values, {
    additionalRecords,
    ignoreRecordId: record.id,
  });

  storage.sql.exec(
    `
      UPDATE records
      SET values_json = ?,
          updated_at = ?
      WHERE id = ?
    `,
    JSON.stringify(record.values),
    record.updatedAt,
    record.id,
  );

  return record;
}

function materializeCreatedOperationRecord(
  storage: DurableObjectStorage,
  input: {
    entity: string;
    id?: string;
    values: RecordValues;
    createdAt: string;
  },
  validateConstraints?: RecordConstraintValidator,
  additionalRecords: readonly StoredRecord[] = [],
): StoredRecord {
  validateConstraints?.(input.entity, input.values, {
    additionalRecords,
    ...(input.id === undefined ? {} : { candidateRecordId: input.id }),
  });

  return insertCreatedRecord(storage, input.entity, input.values, input.createdAt, input.id);
}

function materializeCreatedRecordWriteRecords(
  storage: DurableObjectStorage,
  entity: string,
  recordValuesToCreate: RecordValues[],
  createdAt: string,
  validateConstraints?: RecordConstraintValidator,
): StoredRecord[] {
  return recordValuesToCreate.map((values) =>
    materializeCreatedRecordWriteRecord(
      storage,
      {
        entity,
        values,
        createdAt,
      },
      validateConstraints,
    ),
  );
}

function materializeCreatedRecordWriteRecord(
  storage: DurableObjectStorage,
  input: {
    entity: string;
    id?: string;
    values: RecordValues;
    createdAt: string;
  },
  validateConstraints?: RecordConstraintValidator,
): StoredRecord {
  validateConstraints?.(
    input.entity,
    input.values,
    input.id === undefined ? {} : { candidateRecordId: input.id },
  );

  return insertCreatedRecord(storage, input.entity, input.values, input.createdAt, input.id);
}

function materializePatchedRecordWriteRecord(
  storage: DurableObjectStorage,
  input: {
    changedAt: string;
    entity: string;
    existingRecord: StoredRecord;
    values: RecordValues;
  },
  validateConstraints?: RecordConstraintValidator,
): StoredRecord {
  const record: StoredRecord = {
    ...input.existingRecord,
    values: input.values,
    updatedAt: input.changedAt,
  };

  validateConstraints?.(input.entity, record.values, { ignoreRecordId: record.id });

  storage.sql.exec(
    `
      UPDATE records
      SET values_json = ?,
          updated_at = ?
      WHERE id = ?
    `,
    JSON.stringify(record.values),
    record.updatedAt,
    record.id,
  );

  return record;
}

function assertDeleteRecordWriteRequestCanMaterialize(
  request: DeleteRecordWriteRequest,
  existingRecord: StoredRecord,
) {
  if (existingRecord.entity !== request.entity) {
    throw new Error("Delete entity must match the stored record entity.");
  }

  if (existingRecord.deletedAt) {
    throw new Error(`Record "${request.recordId}" is already tombstoned.`);
  }
}

function materializeDeletedRecordWriteRecord(
  storage: DurableObjectStorage,
  existingRecord: StoredRecord,
  deletedAt: string,
): StoredRecord {
  const record: StoredRecord = {
    ...existingRecord,
    updatedAt: deletedAt,
    deletedAt,
  };

  storage.sql.exec(
    `
      UPDATE records
      SET updated_at = ?,
          deleted_at = ?
      WHERE id = ?
    `,
    deletedAt,
    deletedAt,
    record.id,
  );

  return record;
}

function appendRecordWriteChanges(
  storage: DurableObjectStorage,
  input: {
    writeId: string;
    operationKind: ChangeRow["operationKind"];
    entity: string;
    records: StoredRecord[];
    createdAt: string;
  },
) {
  for (const record of input.records) {
    appendRecordWriteLogChange(storage, {
      writeId: input.writeId,
      operationKind: input.operationKind,
      entity: input.entity,
      record,
      createdAt: input.createdAt,
    });
  }
}

function appendOperationRecordChanges(
  storage: DurableObjectStorage,
  input: {
    writeId: string;
    entity?: string;
    records: StoredRecord[];
    createdAt: string;
  },
) {
  for (const record of input.records) {
    appendCommandWriteLogChange(storage, {
      writeId: input.writeId,
      entity: input.entity ?? record.entity,
      record,
      createdAt: input.createdAt,
    });
  }
}

function appendOperationCommandRecordChanges(
  storage: DurableObjectStorage,
  input: {
    operationId: string;
    records: StoredRecord[];
    createdAt: string;
  },
) {
  for (const record of input.records) {
    appendWriteLogChange(storage, {
      writeId: input.operationId,
      operationKind: "command",
      entity: record.entity,
      record,
      createdAt: input.createdAt,
    });
  }
}

function insertCreatedRecord(
  storage: DurableObjectStorage,
  entity: string,
  values: RecordValues,
  createdAt: string,
  id = createRecordId(),
): StoredRecord {
  const record: StoredRecord = {
    id,
    entity,
    values,
    createdAt,
    updatedAt: createdAt,
  };

  storage.sql.exec(
    `
      INSERT INTO records (id, entity, values_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    record.id,
    record.entity,
    JSON.stringify(record.values),
    record.createdAt,
    record.updatedAt,
  );

  return record;
}

export function getCommandWriteResponseById(
  storage: DurableObjectStorage,
  writeId: string,
): CommandWriteResponse | undefined {
  return readCommandWriteReplayResponse(storage, writeId);
}

function mergeRecordValues(values: RecordValues, patch: Partial<RecordValues>): RecordValues {
  const merged: RecordValues = { ...values };

  for (const [fieldName, fieldValue] of Object.entries(patch)) {
    if (fieldValue !== undefined) {
      merged[fieldName] = fieldValue;
    }
  }

  return merged;
}

function assertSnapshotRecordIdsAreUnique(records: StoredRecord[]) {
  const seen = new Set<string>();

  for (const record of records) {
    if (seen.has(record.id)) {
      throw new Error(`Storage snapshot includes duplicate record id "${record.id}".`);
    }

    seen.add(record.id);
  }
}

function storedRecordsEqual(left: StoredRecord | undefined, right: StoredRecord) {
  return (
    left !== undefined &&
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

  if (leftEntries.length !== rightKeys.size) {
    return false;
  }

  return leftEntries.every(
    ([fieldName, fieldValue]) => rightKeys.has(fieldName) && right[fieldName] === fieldValue,
  );
}

export function getStoredRecord(
  storage: DurableObjectStorage,
  recordId: string,
): StoredRecord | undefined {
  const row = storage.sql
    .exec<RecordRow>(
      "SELECT id, entity, values_json, created_at, updated_at, deleted_at FROM records WHERE id = ?",
      recordId,
    )
    .next();

  return row.done ? undefined : recordFromRow(row.value);
}

export function getRecordWriteResponseById(
  storage: DurableObjectStorage,
  writeId: string,
): RecordWriteResponse | undefined {
  return readRecordWriteReplayResponse(storage, writeId);
}

function upsertOperationInvocation(
  storage: DurableObjectStorage,
  input: {
    authDecision: OperationInvocationAuthDecision;
    envelope: OperationInvocationEnvelope;
    errorMessage?: string;
    output?: OperationInvocationOutput;
    status: OperationInvocationStatus;
  },
) {
  ensureOperationInvocationTables(storage);

  const existing = getOperationInvocationById(storage, input.envelope.invocationId);
  const updatedAt = nowIsoString();
  const completedAt = operationInvocationStatusIsTerminal(input.status) ? updatedAt : undefined;
  const affectedChangeIds = input.output ? operationInvocationAffectedChangeIds(input.output) : [];
  const statusHistory = appendOperationInvocationStatusHistory(
    existing?.statusHistory ?? [],
    input.status,
    updatedAt,
  );
  const auditInput = operationInvocationAuditInput(input.envelope);

  storage.sql.exec(
    `
      INSERT INTO ${operationInvocationsTableName} (
        invocation_id,
        operation_key,
        operation_kind,
        entity,
        operation_name,
        actor_kind,
        auth_decision,
        source_protocol,
        source_json,
        input_hash,
        input_audit_json,
        affected_change_ids_json,
        idempotency_json,
        output_json,
        status,
        status_history_json,
        error_message,
        received_at,
        updated_at,
        completed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(invocation_id) DO UPDATE SET
        operation_key = excluded.operation_key,
        operation_kind = excluded.operation_kind,
        entity = excluded.entity,
        operation_name = excluded.operation_name,
        actor_kind = excluded.actor_kind,
        auth_decision = excluded.auth_decision,
        source_protocol = excluded.source_protocol,
        source_json = excluded.source_json,
        input_hash = excluded.input_hash,
        input_audit_json = excluded.input_audit_json,
        affected_change_ids_json = excluded.affected_change_ids_json,
        idempotency_json = excluded.idempotency_json,
        output_json = COALESCE(excluded.output_json, ${operationInvocationsTableName}.output_json),
        status = excluded.status,
        status_history_json = excluded.status_history_json,
        error_message = excluded.error_message,
        updated_at = excluded.updated_at,
        completed_at = COALESCE(excluded.completed_at, ${operationInvocationsTableName}.completed_at)
    `,
    input.envelope.invocationId,
    input.envelope.operation.canonicalKey,
    input.envelope.operation.kind,
    input.envelope.operation.entityName,
    input.envelope.operation.operationName,
    input.envelope.actor.kind,
    input.authDecision,
    input.envelope.source.protocol,
    JSON.stringify(input.envelope.source),
    hashOperationInvocationInput(input.envelope.input),
    JSON.stringify(auditInput),
    JSON.stringify(affectedChangeIds),
    JSON.stringify(input.envelope.idempotency),
    input.output === undefined ? null : JSON.stringify(input.output),
    input.status,
    JSON.stringify(statusHistory),
    input.errorMessage ?? null,
    input.envelope.receivedAt,
    updatedAt,
    completedAt ?? null,
  );
}

function operationInvocationFromRow(row: OperationInvocationRow): StoredOperationInvocation {
  return {
    invocationId: row.invocation_id,
    operationKey: row.operation_key,
    operationKind: row.operation_kind,
    entity: row.entity,
    operationName: row.operation_name,
    actorKind: row.actor_kind,
    authDecision: row.auth_decision,
    sourceProtocol: row.source_protocol,
    source: JSON.parse(row.source_json) as OperationInvocationEnvelope["source"],
    inputHash: row.input_hash,
    auditInput: JSON.parse(row.input_audit_json) as OperationInvocationAuditInput,
    affectedChangeIds: JSON.parse(row.affected_change_ids_json) as string[],
    idempotency: JSON.parse(row.idempotency_json) as OperationInvocationEnvelope["idempotency"],
    ...(row.output_json === null
      ? {}
      : { output: JSON.parse(row.output_json) as OperationInvocationOutput }),
    status: row.status,
    statusHistory: JSON.parse(row.status_history_json) as OperationInvocationStatusHistoryEntry[],
    ...(row.error_message === null ? {} : { errorMessage: row.error_message }),
    receivedAt: row.received_at,
    updatedAt: row.updated_at,
    ...(row.completed_at === null ? {} : { completedAt: row.completed_at }),
  };
}

function appendOperationInvocationStatusHistory(
  history: OperationInvocationStatusHistoryEntry[],
  status: OperationInvocationStatus,
  at: string,
): OperationInvocationStatusHistoryEntry[] {
  if (history.at(-1)?.status === status) {
    return history;
  }

  return [...history, { status, at }];
}

function operationInvocationStatusIsTerminal(status: OperationInvocationStatus) {
  return (
    status === "rejected" || status === "committed" || status === "replayed" || status === "failed"
  );
}

function operationInvocationAffectedChangeIds(output: OperationInvocationOutput): string[] {
  if (output.type === "list" || output.type === "get") {
    return [];
  }

  return output.affectedChangeIds;
}

function operationInvocationAuditInput(
  envelope: OperationInvocationEnvelope,
): OperationInvocationAuditInput {
  const policy = envelope.schemaOperation.audit.input;
  const auditInput = operationInvocationAuditEnvelopeInput(envelope);

  if (policy === "none") {
    return { kind: "none" };
  }

  if (policy === "hash") {
    return { kind: "hash" };
  }

  if (policy === "snapshot") {
    return {
      kind: "snapshot",
      snapshot: redactUnsafeAuditValue(auditInput),
    };
  }

  return {
    kind: "summary",
    summary: summarizeOperationInvocationInput(auditInput),
  };
}

function operationInvocationAuditEnvelopeInput(
  envelope: OperationInvocationEnvelope,
): OperationInvocationInput {
  if (
    envelope.input.type !== "command" ||
    envelope.source.protocol !== "public" ||
    envelope.operation.effect?.type !== "operationHandler"
  ) {
    return envelope.input;
  }

  if (!isJsonObject(envelope.input.input) || !Object.hasOwn(envelope.input.input, "input")) {
    return envelope.input;
  }

  return {
    ...envelope.input,
    input: envelope.input.input.input,
  };
}

function summarizeOperationInvocationInput(
  input: OperationInvocationInput,
): OperationInvocationInputSummary {
  if (input.type === "list") {
    return {
      type: "list",
      ...(input.input === undefined
        ? {}
        : {
            inputFields: recordFieldNames(input.input),
            inputType: auditValueType(input.input),
          }),
    };
  }

  if (input.type === "get" || input.type === "delete") {
    return { type: input.type, recordId: input.recordId };
  }

  if (input.type === "create") {
    return {
      type: "create",
      fieldNames: recordFieldNames(input.values),
      valuesType: auditValueType(input.values),
    };
  }

  if (input.type === "update") {
    return {
      type: "update",
      fieldNames: recordFieldNames(input.values),
      recordId: input.recordId,
      valuesType: auditValueType(input.values),
    };
  }

  return {
    type: "command",
    inputFields: recordFieldNames(input.input),
    inputType: auditValueType(input.input),
    ...(input.recordId === undefined ? {} : { recordId: input.recordId }),
  };
}

function recordFieldNames(value: unknown): string[] | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }

  return Object.keys(value)
    .filter((key) => !isUnsafeAuditInputKey(key))
    .sort();
}

function auditValueType(value: unknown): string {
  if (Array.isArray(value)) {
    return "array";
  }

  if (value === null) {
    return "null";
  }

  return typeof value;
}

function redactUnsafeAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactUnsafeAuditValue);
  }

  if (!isJsonObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      isUnsafeAuditInputKey(key) ? "[redacted]" : redactUnsafeAuditValue(nestedValue),
    ]),
  );
}

function isUnsafeAuditInputKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");

  return (
    normalized.includes("secret") ||
    normalized.includes("token") ||
    normalized.includes("password") ||
    normalized.includes("proof") ||
    normalized.includes("challenge") ||
    normalized.includes("credential") ||
    normalized.includes("apikey")
  );
}

function hashOperationInvocationInput(input: OperationInvocationInput) {
  return `fnv1a64:${fnv1a64(stableJsonStringify(input))}`;
}

function fnv1a64(value: string) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * prime) & mask;
  }

  return hash.toString(16).padStart(16, "0");
}

function stableJsonStringify(value: unknown) {
  return JSON.stringify(stableJsonValue(value));
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableJsonValue);
  }

  if (!isJsonObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => [key, stableJsonValue(nestedValue)]),
  );
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown operation invocation error.";

  return message.replace(/"([^"]+)"/g, (match, key: string) =>
    isUnsafeAuditInputKey(key) ? '"[redacted]"' : match,
  );
}

function schemasEqual(left: AppSchema, right: AppSchema) {
  return stringifySchema(left) === stringifySchema(right);
}

function schemaProvenancesEqual(
  left: ProgramSchemaProvenance | undefined,
  right: ProgramSchemaProvenance | undefined,
) {
  if (left === undefined || right === undefined) {
    return left === right;
  }

  if (left.kind !== right.kind || left.sourceSchemaHash !== right.sourceSchemaHash) {
    return false;
  }

  return true;
}

function writeOutcomeResponse<T>(outcome: WriteOutcome<T>): T {
  return outcome.response;
}

function readStoredSchema(storage: DurableObjectStorage): StoredSchema | undefined {
  const row = storage.sql
    .exec<SchemaRow>(
      "SELECT schema_json, schema_provenance_json, updated_at FROM app_schema WHERE id = 1",
    )
    .next();

  if (row.done) {
    return undefined;
  }

  const schemaProvenance = parseStoredSchemaProvenance(row.value.schema_provenance_json);

  return {
    schema: parseStoredSchema(row.value.schema_json),
    ...(schemaProvenance === undefined ? {} : { schemaProvenance }),
    updatedAt: row.value.updated_at,
  };
}

function readArchiveRestoreGuard(
  storage: DurableObjectStorage,
): ArchiveRestoreGuardRow | undefined {
  return storage.sql
    .exec<ArchiveRestoreGuardRow>(
      `
        SELECT token, source_cursor, acquired_at
        FROM ${archiveRestoreGuardTableName}
        WHERE id = 1
      `,
    )
    .toArray()[0];
}

function parseStoredSchemaProvenance(value: string | null): ProgramSchemaProvenance | undefined {
  if (value === null) {
    return undefined;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }

  if (!isJsonObject(parsed) || !isSourceSchemaHash(parsed.sourceSchemaHash)) {
    return undefined;
  }

  if (parsed.kind === "program") {
    return {
      kind: "program",
      sourceSchemaHash: parsed.sourceSchemaHash,
    };
  }

  return undefined;
}

function activeSchemaRefreshBlockedMessage(blocker: ActiveSchemaRefreshBlocker) {
  const storage = blocker.storageIdentity
    ? `storage "${blocker.storageIdentity}"`
    : "unknown storage";
  const schema = blocker.schemaKey ? ` schema "${blocker.schemaKey}"` : "";
  const current = blocker.currentSchemaProvenance
    ? formatSchemaProvenance(blocker.currentSchemaProvenance)
    : "untracked";
  const target = formatSchemaProvenance(blocker.targetSchemaProvenance);

  return [
    `Active schema refresh blocked for ${storage}${schema}.`,
    `Current provenance: ${current}.`,
    `Target provenance: ${target}.`,
    `Current records require an explicit Program reset, restore, or value change: ${blocker.reason}.`,
  ].join(" ");
}

function formatSchemaProvenance(provenance: ProgramSchemaProvenance) {
  return `kind=program sourceSchemaHash=${provenance.sourceSchemaHash}`;
}

function recordFromRow(row: RecordRow): StoredRecord {
  const record: StoredRecord = {
    id: row.id,
    entity: row.entity,
    values: parseJsonRecord(row.values_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.deleted_at !== null) {
    record.deletedAt = row.deleted_at;
  }

  return record;
}

function parseJsonRecord(value: string): RecordValues {
  const parsed = JSON.parse(value) as unknown;

  if (!isRecordValues(parsed)) {
    throw new Error("Stored record values are invalid.");
  }

  return parsed;
}

function parseStoredSchema(value: string): AppSchema {
  return parseAppSchema(JSON.parse(value) as unknown);
}

function isRecordValues(value: unknown): value is RecordValues {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (fieldValue) =>
        typeof fieldValue === "string" ||
        typeof fieldValue === "boolean" ||
        (typeof fieldValue === "number" && Number.isFinite(fieldValue)),
    )
  );
}
