import {
  isValidStoredFieldValue,
  stringifySchema,
  type AccessRequirement,
  type AppSchema,
  type EntitySchema,
  type ScreenAccessRequirement,
  type ScreenSchema,
} from "@dpeek/formless-schema";
import {
  formatStoredRecordsForArtifact,
  parseStorageSnapshot,
  type StorageSnapshot,
  type StoredRecord,
} from "@dpeek/formless-storage";
import rawFormlessProgramSchema from "./schema.json";
import type { WorkspaceProgramSnapshotContract } from "@dpeek/formless-workspace/node";
import {
  FORMLESS_PROGRAM_SOURCE_SCHEMA_HASH,
  FORMLESS_PROGRAM_SCHEMA_KEY,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
} from "./target.ts";
import {
  FORMLESS_PROGRAM_ARTIFACT_KIND,
  FORMLESS_PROGRAM_ARTIFACT_VERSION,
  parseFormlessProgramArtifactData,
  parseFormlessProgramSourceSchema,
  type FormlessProgramArtifact,
} from "./artifact.ts";
import {
  validateProgramSharedRuntimeDefinition,
  type ProgramSharedRecordAdapterDefinition,
  type ProgramSharedRuntimeDefinition,
} from "./composition.ts";
import { formlessProgramDefaultSharedRuntime } from "./default/shared.ts";

export * from "./target.ts";

declare const __FORMLESS_PROGRAM_ARTIFACT_JSON__: string | undefined;

export type FormlessProgramScreenRouteTarget = {
  access: ScreenAccessRequirement;
  key: string;
  label: string;
  path: `/${string}`;
  type: ScreenSchema["type"];
};

export const formlessProgramArtifact = activeFormlessProgramArtifact();
export const formlessProgramSchema = parseFormlessProgramSchemaArtifact(
  formlessProgramArtifact.sourceSchema,
);
export const formlessProgramSchemaProvenance = formlessProgramArtifact.schemaProvenance;
export const FORMLESS_PROGRAM_REPLICA_ACCESS_REQUIREMENT = {
  anyOf: [
    formlessProgramSchema.authorization?.roles[0] === undefined
      ? { actor: "owner" as const }
      : { role: formlessProgramSchema.authorization.roles[0].key },
    { actor: "adminBearer" as const },
  ],
} satisfies AccessRequirement;
export const FORMLESS_PROGRAM_EDITOR_ACCESS_REQUIREMENT = {
  anyOf: [{ role: "editor" }, { actor: "adminBearer" }],
} as const satisfies AccessRequirement;
export const FORMLESS_PROGRAM_MANAGEMENT_ACCESS_REQUIREMENT = {
  anyOf: [{ role: "administrator" }, { actor: "adminBearer" }],
} as const satisfies AccessRequirement;
export const FORMLESS_PROGRAM_SCREEN_PATHS: readonly string[] =
  formlessProgramScreenRouteTargets().map((screen) => screen.path);

export function parseFormlessProgramSchemaArtifact(value: unknown): AppSchema {
  return parseFormlessProgramSourceSchema(value);
}

export function parseRuntimeFormlessProgramArtifactJson(contents: string): FormlessProgramArtifact {
  return parseFormlessProgramArtifactData(JSON.parse(contents) as unknown);
}

function activeFormlessProgramArtifact(): FormlessProgramArtifact {
  const contents =
    typeof __FORMLESS_PROGRAM_ARTIFACT_JSON__ === "string"
      ? __FORMLESS_PROGRAM_ARTIFACT_JSON__.trim()
      : "";

  if (contents) {
    return parseRuntimeFormlessProgramArtifactJson(contents);
  }

  return parseFormlessProgramArtifactData({
    kind: FORMLESS_PROGRAM_ARTIFACT_KIND,
    version: FORMLESS_PROGRAM_ARTIFACT_VERSION,
    sourceSchema: rawFormlessProgramSchema,
    schemaProvenance: {
      kind: "program",
      sourceSchemaHash: FORMLESS_PROGRAM_SOURCE_SCHEMA_HASH,
    },
  });
}

export function resolveFormlessProgramScreenRouteTarget(
  pathname: string,
  schema: AppSchema = formlessProgramSchema,
): FormlessProgramScreenRouteTarget | undefined {
  const screen = schema.screens.find(
    (candidate) => resolveFormlessProgramScreenPath(candidate.key, schema) === pathname,
  );

  if (screen === undefined) {
    return undefined;
  }

  const path = resolveFormlessProgramScreenPath(screen.key, schema);
  if (screen.access === undefined || path === undefined) {
    throw new Error(`Formless Program schema screen "${screen.key}" is unavailable.`);
  }

  return {
    access: screen.access,
    key: screen.key,
    label: screen.label,
    path,
    type: screen.type,
  };
}

export function resolveFormlessProgramScreenRouteTargetByKey(
  screenKey: string,
  schema: AppSchema = formlessProgramSchema,
): FormlessProgramScreenRouteTarget | undefined {
  const path = resolveFormlessProgramScreenPath(screenKey, schema);

  return path === undefined ? undefined : resolveFormlessProgramScreenRouteTarget(path, schema);
}

export function formlessProgramScreenRouteTargets(
  schema: AppSchema = formlessProgramSchema,
): readonly FormlessProgramScreenRouteTarget[] {
  return schema.screens.flatMap((screen) => {
    const path = resolveFormlessProgramScreenPath(screen.key, schema);
    if (path === undefined) {
      return [];
    }

    const target = resolveFormlessProgramScreenRouteTarget(path, schema);
    return target === undefined ? [] : [target];
  });
}

function resolveFormlessProgramScreenPath(
  screenKey: string,
  schema: AppSchema,
): `/${string}` | undefined {
  const screen = schema.screens.find((candidate) => candidate.key === screenKey);
  if (screen?.path !== undefined) {
    return screen.path as `/${string}`;
  }
  if (screen === undefined || schema.screens.some((candidate) => candidate.path === "/")) {
    return undefined;
  }

  const primaryScreenKeys =
    schema.navigation?.groups?.flatMap((group) => group.screens) ??
    schema.navigation?.primaryScreens ??
    schema.screens.map((candidate) => candidate.key);
  const firstPathlessScreenKey = primaryScreenKeys.find(
    (candidateKey) =>
      schema.screens.find((candidate) => candidate.key === candidateKey)?.path === undefined,
  );

  return firstPathlessScreenKey === screenKey ? "/" : undefined;
}

export type FormlessProgramValidationOptions = {
  artifact?: FormlessProgramArtifact;
  candidateRecord?: StoredRecord;
  schema?: AppSchema;
  sharedRuntime?: ProgramSharedRuntimeDefinition;
};

export function formlessProgramArchiveSnapshotContract(
  options: FormlessProgramValidationOptions = {},
) {
  const artifact =
    options.artifact ?? (options.schema === undefined ? formlessProgramArtifact : undefined);

  return {
    canonicalize: (snapshot: StorageSnapshot) =>
      canonicalizeFormlessProgramStorageSnapshot(snapshot, options),
    parse: (context: string, value: unknown) =>
      parseFormlessProgramStorageSnapshot(context, value, options),
    ...(artifact === undefined ? {} : { schemaProvenance: artifact.schemaProvenance }),
  };
}

export function formlessProgramWorkspaceSnapshotContract(
  options: FormlessProgramValidationOptions = {},
): WorkspaceProgramSnapshotContract {
  const artifact = options.artifact ?? formlessProgramArtifact;
  const schema = parseFormlessProgramSchemaArtifact(artifact.sourceSchema);

  return {
    canonicalize: (snapshot) => canonicalizeFormlessProgramStorageSnapshot(snapshot, options),
    schema,
    schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
    schemaProvenance: artifact.schemaProvenance,
    storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
  };
}

export function validateFormlessProgramRecords(
  context: string,
  records: readonly StoredRecord[],
  options: FormlessProgramValidationOptions = {},
): void {
  const schema = formlessProgramSchemaForOptions(options);
  const adapters = formlessProgramRecordAdapters(schema, options);

  validateRecordsAgainstSchema(context, schema, records);

  const recordsByAdapter = new Map(adapters.map((adapter) => [adapter, [] as StoredRecord[]]));
  const entityIdsByKey = new Map(schema.entities.map((entity) => [entity.key, entity.id]));

  for (const record of records) {
    const entityId = entityIdsByKey.get(record.entity)!;
    const owners = adapters.filter((adapter) => adapter.entityIds.includes(entityId));

    if (owners.length > 1) {
      throw new Error(
        `${context} entity "${record.entity}" must have at most one stable-entity-id constraint owner.`,
      );
    }

    if (owners[0] !== undefined) {
      recordsByAdapter.get(owners[0])!.push(record);
    }
  }

  for (const definition of adapters) {
    const input = {
      allRecords: records,
      records: recordsByAdapter.get(definition)!,
      schema,
    };
    definition.adapter.validate(`${context} ${definition.key} constraints`, input);

    if (
      options.candidateRecord !== undefined &&
      definition.entityIds.includes(entityIdsByKey.get(options.candidateRecord.entity) ?? "")
    ) {
      definition.adapter.validateCandidate(`${context} ${definition.key} candidate`, {
        ...input,
        candidate: options.candidateRecord,
      });
    }
  }
}

export function isFormlessProgramSchemaRecord(
  record: StoredRecord,
  schema: AppSchema = formlessProgramSchema,
): boolean {
  return schema.entities.some((entity) => entity.key === record.entity);
}

export function parseFormlessProgramStorageSnapshot(
  context: string,
  value: unknown,
  options: FormlessProgramValidationOptions = {},
): StorageSnapshot {
  const schema = formlessProgramSchemaForOptions(options);
  const snapshot = parseStorageSnapshot(value, {
    schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
    storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
  });
  const records = snapshot.records.filter((record) =>
    isFormlessProgramSchemaRecord(record, schema),
  );

  assertFormlessProgramSchema(context, snapshot.schema, schema);
  validateFormlessProgramRecords(`${context} records`, records, options);

  return { ...snapshot, records };
}

export function canonicalizeFormlessProgramStorageSnapshot(
  snapshot: StorageSnapshot,
  options: FormlessProgramValidationOptions = {},
): StorageSnapshot {
  const validationOptions = options;
  const parsed = parseFormlessProgramStorageSnapshot(
    "Formless Program storage snapshot",
    snapshot,
    validationOptions,
  );
  const schema = formlessProgramSchemaForOptions(validationOptions);
  const adapters = formlessProgramRecordAdapters(schema, validationOptions);
  const recordsByAdapter = recordsByFormlessProgramRecordAdapter(parsed.records, schema, adapters);
  const ownedEntityIds = new Set(adapters.flatMap((adapter) => adapter.entityIds));
  const entityIdsByKey = new Map(schema.entities.map((entity) => [entity.key, entity.id]));
  const extensionRecords = parsed.records.filter(
    (record) => !ownedEntityIds.has(entityIdsByKey.get(record.entity) ?? ""),
  );
  const records = [
    ...adapters.flatMap((definition) =>
      definition.adapter.canonicalize({
        allRecords: parsed.records,
        records: recordsByAdapter.get(definition)!,
        schema,
      }),
    ),
    ...extensionRecords,
  ];

  validateFormlessProgramRecords("Formless Program reviewable records", records, validationOptions);

  return {
    ...parsed,
    schema,
    records: formatStoredRecordsForArtifact(schema, records),
  };
}

function recordsByFormlessProgramRecordAdapter(
  records: readonly StoredRecord[],
  schema: AppSchema,
  adapters: readonly ProgramSharedRecordAdapterDefinition[],
): Map<ProgramSharedRecordAdapterDefinition, StoredRecord[]> {
  const entityIdsByKey = new Map(schema.entities.map((entity) => [entity.key, entity.id]));
  const recordsByAdapter = new Map(adapters.map((adapter) => [adapter, [] as StoredRecord[]]));

  for (const record of records) {
    const entityId = entityIdsByKey.get(record.entity);
    const adapter = adapters.find((candidate) => candidate.entityIds.includes(entityId ?? ""));

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

function assertFormlessProgramSchema(
  context: string,
  schema: AppSchema,
  activeSchema: AppSchema,
): void {
  if (stringifySchema(schema) !== stringifySchema(activeSchema)) {
    throw new Error(`${context} schema must match the current Formless Program artifact.`);
  }
}

function formlessProgramSchemaForOptions(options: FormlessProgramValidationOptions): AppSchema {
  if (options.artifact !== undefined) {
    return parseFormlessProgramSchemaArtifact(options.artifact.sourceSchema);
  }

  return options.schema ?? formlessProgramSchema;
}

function formlessProgramRecordAdapters(
  schema: AppSchema,
  options: FormlessProgramValidationOptions,
): readonly ProgramSharedRecordAdapterDefinition[] {
  const sharedRuntime = options.sharedRuntime ?? formlessProgramDefaultSharedRuntime;

  validateProgramSharedRuntimeDefinition(schema, sharedRuntime);
  return sharedRuntime.recordAdapters;
}

function assertIsoTimestamp(context: string, value: string): void {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.valueOf()) || timestamp.toISOString() !== value) {
    throw new Error(`${context} must be an ISO timestamp.`);
  }
}
