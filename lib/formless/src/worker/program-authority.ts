import {
  identityControlPlaneRoleKeys,
  identityControlPlaneSchema,
  type IdentityControlPlaneRoleKey,
} from "@dpeek/formless-identity-control-plane";
import type { AppPackageResolver } from "@dpeek/formless-installed-apps";
import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
import { formlessProgramSchema, validateFormlessProgramRecords } from "../program/runtime.ts";
import {
  FORMLESS_PROGRAM_SCHEMA_KEY,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
  formlessProgramSchemaProvenance,
} from "../program/target.ts";
import {
  convergeProgramStorage,
  ensureStorageTables,
  getBootstrapRecords,
  initializeStorageFromSource,
  reconcileRuntimeInvariantRecords,
  type InitializedStorageState,
  type RecordConstraintValidator,
  type StorageSource,
} from "./storage.ts";
import type { WorkerAppDefinition } from "./runtime-app-packages.ts";

export const INTERNAL_PROGRAM_CONVERGENCE_SOURCE_PATH = "/_internal/program-convergence/source";

const builtInRoleCreatedAt = "2026-06-26T00:00:00.000Z";
const identityEntityNames = new Set(
  identityControlPlaneSchema.entities.map((entity) => entity.key),
);

export const formlessProgramApp = {
  key: FORMLESS_PROGRAM_SCHEMA_KEY,
  label: "Formless Program",
  route: "/",
  sourceSchema: formlessProgramSchema,
} satisfies WorkerAppDefinition;

export function formlessProgramSource(): StorageSource {
  return {
    schema: formlessProgramSchema,
    schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
    schemaProvenance: formlessProgramSchemaProvenance,
    storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
  };
}

export function ensureFormlessProgramStorage(
  storage: DurableObjectStorage,
  legacyIdentityState: InitializedStorageState | undefined,
  packageResolver?: AppPackageResolver,
) {
  ensureStorageTables(storage);
  const source = formlessProgramSource();
  const convergence = convergeProgramStorage(storage, {
    importedRecords: legacyIdentityState?.records ?? [],
    source,
    sourceCursor: legacyIdentityState?.cursor ?? 0,
    ...(legacyIdentityState === undefined
      ? {}
      : { sourceSchemaUpdatedAt: legacyIdentityState.schemaUpdatedAt }),
    validate: (records) =>
      validateFormlessProgramRecords("Program convergence records", records, {
        allowDormantPackageFacts: true,
        packageResolver,
      }),
  });

  initializeStorageFromSource(storage, source);
  reconcileRuntimeInvariantRecords(storage, builtInRoleRecords(), {
    validate: (records) =>
      validateFormlessProgramRecords("Formless Program records", records, {
        allowDormantPackageFacts: true,
        packageResolver,
      }),
    writeIdPrefix: "identity-role-reconcile",
  });

  return convergence;
}

export function validateFormlessProgramRecordConstraint(
  storage: DurableObjectStorage,
  packageResolver?: AppPackageResolver,
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

    validateFormlessProgramRecords("Formless Program records", candidateRecords, {
      packageResolver,
    });
  };
}

export function isIdentityProgramRecord(record: StoredRecord): boolean {
  return identityEntityNames.has(record.entity);
}

export function formlessProgramCreatedRecordId(
  entity: string,
  values: RecordValues,
): string | undefined {
  const id = entity === "app-install" ? values.installId : values.targetId;

  return (entity === "app-install" || entity === "deployment-config") && typeof id === "string"
    ? id
    : undefined;
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
