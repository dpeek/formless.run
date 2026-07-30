import {
  identityControlPlaneEntityIds,
  reviewableIdentityControlPlaneRecords,
  validateIdentityControlPlaneRecords,
} from "@dpeek/formless-identity-control-plane";
import type { AppPackageResolver } from "@dpeek/formless-installed-apps";
import {
  instanceControlPlaneEntityIds,
  parseInstanceControlPlaneEntityName,
  reviewableInstanceControlPlaneRecordValues,
  reviewableInstanceControlPlaneRecords,
  validateInstanceControlPlaneRecords,
} from "@dpeek/formless-instance-control-plane";
import {
  isValidStoredFieldValue,
  parseAppSchema,
  stringifySchema,
  type AccessRequirement,
  type AppSchema,
  type EntitySchema,
  type ScreenAccessRequirement,
} from "@dpeek/formless-schema";
import {
  reviewableTaskRecords,
  tasksEntityIds,
  validateTaskRecords,
} from "@dpeek/formless-tasks-app";
import {
  formatStoredRecordsForArtifact,
  parseStorageSnapshot,
  type StorageSnapshot,
  type StoredRecord,
} from "@dpeek/formless-storage";
import rawFormlessProgramSchema from "./schema.json";
import type { WorkspaceControlPlaneSnapshotContract } from "@dpeek/formless-workspace/node";
import {
  FORMLESS_PROGRAM_SCHEMA_KEY,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
  formlessProgramSchemaProvenance,
} from "./target.ts";
import { rootKnownPackageFactsResolver } from "../shared/app-packages.ts";

export * from "./target.ts";

export type FormlessProgramScreenRouteTarget = {
  access: ScreenAccessRequirement;
  key: string;
  label: string;
  path: `/${string}`;
};

export const formlessProgramSchema = parseFormlessProgramSchemaArtifact(rawFormlessProgramSchema);
export const FORMLESS_PROGRAM_REPLICA_ACCESS_REQUIREMENT = {
  anyOf: [{ role: "member" }, { actor: "adminBearer" }],
} as const satisfies AccessRequirement;
export const FORMLESS_PROGRAM_MANAGEMENT_ACCESS_REQUIREMENT = {
  anyOf: [{ role: "administrator" }, { actor: "adminBearer" }],
} as const satisfies AccessRequirement;
export const FORMLESS_PROGRAM_SCREEN_PATHS: readonly string[] = formlessProgramSchema.screens
  .map((screen) => screen.path)
  .filter((path): path is `/${string}` => path !== undefined);

export function parseFormlessProgramSchemaArtifact(value: unknown): AppSchema {
  const schema = parseAppSchema(value);

  assertExplicitFormlessProgramScreenAccess("Formless Program schema", schema);

  return schema;
}

export function resolveFormlessProgramScreenRouteTarget(
  pathname: string,
  schema: AppSchema = formlessProgramSchema,
): FormlessProgramScreenRouteTarget | undefined {
  const screen = schema.screens.find((candidate) => candidate.path === pathname);

  if (screen === undefined) {
    return undefined;
  }

  assertExplicitFormlessProgramScreenAccess("Formless Program schema", schema);

  if (screen.access === undefined || screen.path === undefined) {
    throw new Error(`Formless Program schema screen "${screen.key}" is unavailable.`);
  }

  return {
    access: screen.access,
    key: screen.key,
    label: screen.label,
    path: screen.path as `/${string}`,
  };
}

export type FormlessProgramValidationOptions = {
  allowDormantPackageFacts?: boolean;
  packageResolver?: AppPackageResolver;
};

export function formlessProgramArchiveSnapshotContract(
  options: FormlessProgramValidationOptions = {},
) {
  return {
    canonicalize: (snapshot: StorageSnapshot) =>
      canonicalizeFormlessProgramStorageSnapshot(snapshot, options),
    parse: (context: string, value: unknown) =>
      parseFormlessProgramStorageSnapshot(context, value, options),
  };
}

export function formlessProgramWorkspaceSnapshotContract(
  options: FormlessProgramValidationOptions = {},
): WorkspaceControlPlaneSnapshotContract {
  return {
    canonicalize: (snapshot) => canonicalizeFormlessProgramStorageSnapshot(snapshot, options),
    parse: (context, value) => parseFormlessProgramStorageSnapshot(context, value, options),
    schema: formlessProgramSchema,
    schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
    schemaProvenance: formlessProgramSchemaProvenance,
    storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
  };
}

type FormlessProgramConstraintAdapter = {
  entityIds: ReadonlySet<string>;
  label: string;
  reviewable: (
    records: readonly StoredRecord[],
    candidateRecords: readonly StoredRecord[],
    options: FormlessProgramValidationOptions,
  ) => StoredRecord[];
  validate: (
    context: string,
    records: readonly StoredRecord[],
    candidateRecords: readonly StoredRecord[],
    options: FormlessProgramValidationOptions,
  ) => void;
};

const formlessProgramConstraintAdapters: readonly FormlessProgramConstraintAdapter[] = [
  {
    label: "instance control plane",
    entityIds: new Set(instanceControlPlaneEntityIds),
    reviewable: (records, candidateRecords, options) =>
      reviewableInstanceControlPlaneRecords(records, {
        candidateRecords,
        packageResolver: options.allowDormantPackageFacts
          ? rootKnownPackageFactsResolver(options.packageResolver)
          : options.packageResolver,
      }),
    validate: (context, records, candidateRecords, options) =>
      validateInstanceControlPlaneRecords(context, reviewableActiveInstanceRecords(records), {
        candidateRecords: candidateRecords.map(reviewableInstanceCandidateRecord),
        packageResolver: options.allowDormantPackageFacts
          ? rootKnownPackageFactsResolver(options.packageResolver)
          : options.packageResolver,
      }),
  },
  {
    label: "identity control plane",
    entityIds: new Set(identityControlPlaneEntityIds),
    reviewable: (records, candidateRecords) =>
      reviewableIdentityControlPlaneRecords(records, {
        authorizationRoles: formlessProgramSchema.authorization?.roles,
        candidateRecords,
      }),
    validate: (context, records, candidateRecords) =>
      validateIdentityControlPlaneRecords(
        context,
        records.filter((record) => record.deletedAt === undefined),
        {
          authorizationRoles: formlessProgramSchema.authorization?.roles,
          candidateRecords,
        },
      ),
  },
  {
    label: "tasks",
    entityIds: new Set(tasksEntityIds),
    reviewable: (records) => reviewableTaskRecords(records),
    validate: (context, records) => validateTaskRecords(context, records),
  },
];

function reviewableActiveInstanceRecords(records: readonly StoredRecord[]): StoredRecord[] {
  return records
    .filter((record) => record.deletedAt === undefined)
    .map(reviewableInstanceCandidateRecord);
}

function reviewableInstanceCandidateRecord(record: StoredRecord): StoredRecord {
  const entity = formlessProgramSchema.entities.find(
    (candidate) => candidate.key === record.entity,
  );

  if (!entity || !instanceControlPlaneEntityIds.includes(entity.id)) {
    return record;
  }

  const entityName = parseInstanceControlPlaneEntityName(
    `Formless Program record "${record.id}" entity`,
    record.entity,
  );

  return {
    ...record,
    values: reviewableInstanceControlPlaneRecordValues(entityName, record.values),
  };
}

export function validateFormlessProgramRecords(
  context: string,
  records: readonly StoredRecord[],
  options: FormlessProgramValidationOptions = {},
): void {
  assertFormlessProgramConstraintOwnership(context);
  validateRecordsAgainstSchema(context, formlessProgramSchema, records);

  const recordsByAdapter = new Map(
    formlessProgramConstraintAdapters.map((adapter) => [adapter, [] as StoredRecord[]]),
  );
  const entityIdsByKey = new Map(
    formlessProgramSchema.entities.map((entity) => [entity.key, entity.id]),
  );

  for (const record of records) {
    const entityId = entityIdsByKey.get(record.entity)!;
    const owners = formlessProgramConstraintAdapters.filter((adapter) =>
      adapter.entityIds.has(entityId),
    );

    if (owners.length !== 1) {
      throw new Error(
        `${context} entity "${record.entity}" must have exactly one stable-entity-id constraint owner.`,
      );
    }

    recordsByAdapter.get(owners[0])!.push(record);
  }

  for (const adapter of formlessProgramConstraintAdapters) {
    adapter.validate(
      `${context} ${adapter.label} constraints`,
      recordsByAdapter.get(adapter)!,
      records,
      options,
    );
  }
}

export function parseFormlessProgramStorageSnapshot(
  context: string,
  value: unknown,
  options: FormlessProgramValidationOptions = {},
): StorageSnapshot {
  const snapshot = parseStorageSnapshot(value, {
    schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
    storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
  });

  assertFormlessProgramSchema(context, snapshot.schema);
  validateFormlessProgramRecords(`${context} records`, snapshot.records, {
    ...options,
    allowDormantPackageFacts: true,
  });

  return snapshot;
}

export function canonicalizeFormlessProgramStorageSnapshot(
  snapshot: StorageSnapshot,
  options: FormlessProgramValidationOptions = {},
): StorageSnapshot {
  const validationOptions = {
    ...options,
    allowDormantPackageFacts: true,
  };
  const parsed = parseFormlessProgramStorageSnapshot(
    "Formless Program storage snapshot",
    snapshot,
    validationOptions,
  );
  const recordsByAdapter = recordsByFormlessProgramConstraintAdapter(parsed.records);
  const records = formlessProgramConstraintAdapters.flatMap((adapter) =>
    adapter.reviewable(recordsByAdapter.get(adapter)!, parsed.records, validationOptions),
  );

  validateFormlessProgramRecords("Formless Program reviewable records", records, validationOptions);

  return {
    ...parsed,
    schema: formlessProgramSchema,
    records: formatStoredRecordsForArtifact(formlessProgramSchema, records),
  };
}

function recordsByFormlessProgramConstraintAdapter(
  records: readonly StoredRecord[],
): Map<FormlessProgramConstraintAdapter, StoredRecord[]> {
  const entityIdsByKey = new Map(
    formlessProgramSchema.entities.map((entity) => [entity.key, entity.id]),
  );
  const recordsByAdapter = new Map(
    formlessProgramConstraintAdapters.map((adapter) => [adapter, [] as StoredRecord[]]),
  );

  for (const record of records) {
    const entityId = entityIdsByKey.get(record.entity);
    const adapter = formlessProgramConstraintAdapters.find((candidate) =>
      candidate.entityIds.has(entityId ?? ""),
    );

    if (adapter !== undefined) {
      recordsByAdapter.get(adapter)!.push(record);
    }
  }

  return recordsByAdapter;
}

function validateRecordsAgainstSchema(
  context: string,
  schema: AppSchema,
  records: readonly StoredRecord[],
): void {
  const entitiesByKey = new Map(schema.entities.map((entity) => [entity.key, entity]));
  const recordsById = new Map<string, StoredRecord>();

  for (const record of records) {
    if (record.id.trim() === "") {
      throw new Error(`${context} record id must be non-empty.`);
    }

    if (recordsById.has(record.id)) {
      throw new Error(`${context} includes duplicate record id "${record.id}".`);
    }

    assertIsoTimestamp(`${context} record "${record.id}" createdAt`, record.createdAt);
    assertIsoTimestamp(`${context} record "${record.id}" updatedAt`, record.updatedAt);
    if (record.deletedAt !== undefined) {
      assertIsoTimestamp(`${context} record "${record.id}" deletedAt`, record.deletedAt);
    }

    recordsById.set(record.id, record);
  }

  for (const record of records) {
    const entity = entitiesByKey.get(record.entity);
    if (entity === undefined) {
      throw new Error(
        `${context} record "${record.id}" references unknown entity "${record.entity}".`,
      );
    }

    validateRecord(context, record, entity, recordsById);
  }

  validateUniqueConstraints(context, schema, records);
}

function validateRecord(
  context: string,
  record: StoredRecord,
  entity: EntitySchema,
  recordsById: ReadonlyMap<string, StoredRecord>,
): void {
  const fieldsByKey = new Map(entity.fields.map((field) => [field.key, field]));

  for (const fieldName of Object.keys(record.values)) {
    if (!fieldsByKey.has(fieldName)) {
      throw new Error(
        `${context} record "${record.id}" includes unknown field "${record.entity}.${fieldName}".`,
      );
    }
  }

  for (const field of entity.fields) {
    const value = record.values[field.key];
    if (!isValidStoredFieldValue(value, field)) {
      throw new Error(
        `${context} record "${record.id}" has invalid field "${record.entity}.${field.key}".`,
      );
    }

    if (field.type !== "reference" || typeof value !== "string") {
      continue;
    }

    if (record.deletedAt !== undefined) {
      continue;
    }

    const target = recordsById.get(value);
    if (target === undefined || target.entity !== field.to) {
      throw new Error(
        `${context} record "${record.id}" field "${record.entity}.${field.key}" references unknown ${field.to} record "${value}".`,
      );
    }

    if (target.deletedAt !== undefined) {
      throw new Error(
        `${context} record "${record.id}" field "${record.entity}.${field.key}" cannot reference tombstoned record "${value}".`,
      );
    }
  }
}

function validateUniqueConstraints(
  context: string,
  schema: AppSchema,
  records: readonly StoredRecord[],
): void {
  for (const entity of schema.entities) {
    const activeRecords = records.filter(
      (record) => record.entity === entity.key && record.deletedAt === undefined,
    );

    for (const constraint of entity.constraints ?? []) {
      const seen = new Set<string>();

      for (const record of activeRecords) {
        const key = JSON.stringify(
          constraint.fields.map((fieldName) => record.values[fieldName] ?? null),
        );
        if (seen.has(key)) {
          throw new Error(
            `${context} violates unique constraint "${entity.key}.${constraint.key}".`,
          );
        }
        seen.add(key);
      }
    }
  }
}

function assertFormlessProgramSchema(context: string, schema: AppSchema): void {
  if (stringifySchema(schema) !== stringifySchema(formlessProgramSchema)) {
    throw new Error(`${context} schema must match the current Formless Program artifact.`);
  }
}

function assertExplicitFormlessProgramScreenAccess(context: string, schema: AppSchema): void {
  for (const screen of schema.screens) {
    if (screen.access === undefined) {
      throw new Error(`${context} screen "${screen.key}" must declare explicit access.`);
    }
  }
}

function assertFormlessProgramConstraintOwnership(context: string): void {
  const declaredEntityIds = new Set<string>(formlessProgramSchema.entities.map(({ id }) => id));

  for (const entity of formlessProgramSchema.entities) {
    const ownerCount = formlessProgramConstraintAdapters.filter((adapter) =>
      adapter.entityIds.has(entity.id),
    ).length;
    if (ownerCount !== 1) {
      throw new Error(
        `${context} entity "${entity.key}" must have exactly one stable-entity-id constraint owner.`,
      );
    }
  }

  for (const adapter of formlessProgramConstraintAdapters) {
    for (const entityId of adapter.entityIds) {
      if (!declaredEntityIds.has(entityId)) {
        throw new Error(
          `${context} ${adapter.label} constraint owner declares unknown stable entity id "${entityId}".`,
        );
      }
    }
  }
}

function assertIsoTimestamp(context: string, value: string): void {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.valueOf()) || timestamp.toISOString() !== value) {
    throw new Error(`${context} must be an ISO timestamp.`);
  }
}
