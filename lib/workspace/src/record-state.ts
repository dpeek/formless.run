import {
  formatInstanceControlPlaneBoundaryEntityName,
  instanceControlPlaneRecordSourceEntityName,
} from "@dpeek/formless-instance-control-plane";
import type { AppSchema } from "@dpeek/formless-schema";
import { formatStoredRecordsForArtifact } from "@dpeek/formless-storage";
import {
  INSTANCE_WORKSPACE_CONTROL_PLANE_SCHEMA_KEY,
  WORKSPACE_RECORD_STATE_FILE_KIND,
  WORKSPACE_RECORD_STATE_FILE_VERSION,
} from "./types.ts";
import type {
  InstanceWorkspaceRecordValues,
  InstanceWorkspaceStoredRecord,
  WorkspaceControlPlaneRecordStateFile,
  WorkspacePackageAppRecordStateFile,
  WorkspaceRecordStateFile,
  WorkspaceSchemaProvenance,
  WorkspaceSourceSchemaHash,
} from "./types.ts";

export type WorkspaceRecordStateFileExpected = {
  schemaKey?: string;
  schemaProvenanceKind?: WorkspaceSchemaProvenance["kind"];
  storageIdentity?: string;
};

export type ParseWorkspaceRecordStateFileOptions = {
  context?: string;
  expected?: WorkspaceRecordStateFileExpected;
};

const recordStateKeys = [
  "kind",
  "version",
  "storageIdentity",
  "schemaKey",
  "exportedAt",
  "schemaUpdatedAt",
  "sourceCursor",
  "schemaProvenance",
  "records",
] as const;
const packageAppSchemaProvenanceKeys = [
  "kind",
  "packageAppKey",
  "packageRevision",
  "sourceSchemaHash",
] as const;
const controlPlaneSchemaProvenanceKeys = ["kind", "sourceSchemaHash"] as const;
const routeSafeIdPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const sha256DigestPattern = /^sha256:[a-f0-9]{64}$/;
const appStorageIdentityPattern = /^app:([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/;
const appInstallIdMaxLength = 48;
const routeSafeIdMaxLength = 64;

export function parseWorkspaceRecordStateFileJson(
  contents: string,
  options: ParseWorkspaceRecordStateFileOptions = {},
): WorkspaceRecordStateFile {
  try {
    return parseWorkspaceRecordStateFile(JSON.parse(contents) as unknown, options);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${recordStateContext(options)} must be valid JSON.`);
    }

    throw error;
  }
}

export function parseWorkspaceRecordStateFile(
  value: unknown,
  options: ParseWorkspaceRecordStateFileOptions = {},
): WorkspaceRecordStateFile {
  const context = recordStateContext(options);

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, recordStateKeys);

  if (value.kind !== WORKSPACE_RECORD_STATE_FILE_KIND) {
    throw new Error(`${context} kind must be "${WORKSPACE_RECORD_STATE_FILE_KIND}".`);
  }

  if (value.version !== WORKSPACE_RECORD_STATE_FILE_VERSION) {
    throw new Error(`${context} version must be ${WORKSPACE_RECORD_STATE_FILE_VERSION}.`);
  }

  const storageIdentity = parseNonEmptyString(`${context} storageIdentity`, value.storageIdentity);
  if (options.expected?.storageIdentity !== undefined) {
    assertExpectedValue(
      `${context} storageIdentity`,
      storageIdentity,
      options.expected.storageIdentity,
    );
  }

  const schemaKey = parseNonEmptyString(`${context} schemaKey`, value.schemaKey);
  if (options.expected?.schemaKey !== undefined) {
    assertExpectedValue(`${context} schemaKey`, schemaKey, options.expected.schemaKey);
  }

  const schemaProvenance = parseWorkspaceSchemaProvenance(
    `${context} schemaProvenance`,
    value.schemaProvenance,
  );
  if (options.expected?.schemaProvenanceKind !== undefined) {
    assertExpectedValue(
      `${context} schemaProvenance.kind`,
      schemaProvenance.kind,
      options.expected.schemaProvenanceKind,
    );
  }

  const parsed = {
    kind: WORKSPACE_RECORD_STATE_FILE_KIND,
    version: WORKSPACE_RECORD_STATE_FILE_VERSION,
    storageIdentity,
    schemaKey,
    exportedAt: parseIsoTimestamp(`${context} exportedAt`, value.exportedAt),
    schemaUpdatedAt: parseIsoTimestamp(`${context} schemaUpdatedAt`, value.schemaUpdatedAt),
    sourceCursor: parseCursor(`${context} sourceCursor`, value.sourceCursor),
    schemaProvenance,
    records: parseWorkspaceStoredRecords(`${context} records`, value.records),
  };

  if (schemaProvenance.kind === "instance-control-plane") {
    if (parsed.storageIdentity !== "instance:control-plane") {
      throw new Error(`${context} storageIdentity must be "instance:control-plane".`);
    }

    if (parsed.schemaKey !== INSTANCE_WORKSPACE_CONTROL_PLANE_SCHEMA_KEY) {
      throw new Error(
        `${context} schemaKey must be "${INSTANCE_WORKSPACE_CONTROL_PLANE_SCHEMA_KEY}".`,
      );
    }

    return parsed as WorkspaceControlPlaneRecordStateFile;
  }

  parseAppStorageIdentity(`${context} storageIdentity`, parsed.storageIdentity);

  return parsed as WorkspacePackageAppRecordStateFile;
}

export function formatWorkspaceRecordStateFile(
  state: WorkspaceRecordStateFile,
  schema: AppSchema,
): string {
  const parsed = parseWorkspaceRecordStateFile(state);
  const formatted = {
    kind: parsed.kind,
    version: parsed.version,
    storageIdentity: parsed.storageIdentity,
    schemaKey: parsed.schemaKey,
    exportedAt: parsed.exportedAt,
    schemaUpdatedAt: parsed.schemaUpdatedAt,
    sourceCursor: parsed.sourceCursor,
    schemaProvenance: parsed.schemaProvenance,
    records: formatWorkspaceStoredRecords(parsed, schema),
  };

  return `${JSON.stringify(formatted, null, 2)}\n`;
}

function parseWorkspaceSchemaProvenance(
  context: string,
  value: unknown,
): WorkspaceSchemaProvenance {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.kind === "package-app") {
    assertExactKeys(context, value, packageAppSchemaProvenanceKeys);

    return {
      kind: "package-app",
      packageAppKey: parseRouteSafeId(`${context} packageAppKey`, value.packageAppKey),
      packageRevision: parsePositiveInteger(`${context} packageRevision`, value.packageRevision),
      sourceSchemaHash: parseSourceSchemaHash(
        `${context} sourceSchemaHash`,
        value.sourceSchemaHash,
      ),
    };
  }

  if (value.kind === "instance-control-plane") {
    assertExactKeys(context, value, controlPlaneSchemaProvenanceKeys);

    return {
      kind: "instance-control-plane",
      sourceSchemaHash: parseSourceSchemaHash(
        `${context} sourceSchemaHash`,
        value.sourceSchemaHash,
      ),
    };
  }

  throw new Error(`${context} kind must be "package-app" or "instance-control-plane".`);
}

function parseWorkspaceStoredRecords(
  context: string,
  value: unknown,
): InstanceWorkspaceStoredRecord[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  return value.map((record, index) => parseWorkspaceStoredRecord(`${context}[${index}]`, record));
}

function parseWorkspaceStoredRecord(
  context: string,
  value: unknown,
): InstanceWorkspaceStoredRecord {
  if (!isRecord(value)) {
    throw new Error(`${context} must be a stored record.`);
  }

  assertExactKeys(
    context,
    value,
    ["id", "entity", "values", "createdAt", "updatedAt"],
    ["deletedAt"],
  );

  const deletedAt =
    value.deletedAt === undefined
      ? undefined
      : parseIsoTimestamp(`${context} deletedAt`, value.deletedAt);

  return {
    id: parseNonEmptyString(`${context} id`, value.id),
    entity: parseNonEmptyString(`${context} entity`, value.entity),
    values: parseRecordValues(`${context} values`, value.values),
    createdAt: parseIsoTimestamp(`${context} createdAt`, value.createdAt),
    updatedAt: parseIsoTimestamp(`${context} updatedAt`, value.updatedAt),
    ...(deletedAt === undefined ? {} : { deletedAt }),
  };
}

function parseRecordValues(context: string, value: unknown): InstanceWorkspaceRecordValues {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const values: InstanceWorkspaceRecordValues = {};

  for (const [fieldName, fieldValue] of Object.entries(value)) {
    if (
      typeof fieldValue !== "string" &&
      typeof fieldValue !== "boolean" &&
      !isFiniteNumber(fieldValue)
    ) {
      throw new Error(`${context} field "${fieldName}" must be a scalar value.`);
    }

    values[fieldName] = fieldValue;
  }

  return values;
}

function formatWorkspaceStoredRecords(
  state: WorkspaceRecordStateFile,
  schema: AppSchema,
): InstanceWorkspaceStoredRecord[] {
  const controlPlane = state.schemaProvenance.kind === "instance-control-plane";
  const records = state.records.map((record) => ({
    ...record,
    entity: controlPlane
      ? (instanceControlPlaneRecordSourceEntityName(record.entity) ?? record.entity)
      : record.entity,
  }));

  return formatStoredRecordsForArtifact(schema, records).map((record) => {
    const entity = controlPlane
      ? instanceControlPlaneRecordSourceEntityName(record.entity)
      : undefined;

    return {
      ...record,
      entity:
        entity === undefined ? record.entity : formatInstanceControlPlaneBoundaryEntityName(entity),
    };
  });
}

function recordStateContext(options: ParseWorkspaceRecordStateFileOptions): string {
  return options.context ?? "Workspace record state file";
}

function parseAppStorageIdentity(context: string, value: string): string {
  const match = appStorageIdentityPattern.exec(value);

  if (!match || match[1].length > appInstallIdMaxLength) {
    throw new Error(
      `${context} must be an app storage identity with an app install id, such as "app:site".`,
    );
  }

  return value;
}

function parseRouteSafeId(context: string, value: unknown): string {
  const id = parseNonEmptyString(context, value);

  if (id.length > routeSafeIdMaxLength || !routeSafeIdPattern.test(id)) {
    throw new Error(
      `${context} must start with a lowercase letter and use lowercase letters, numbers, and single hyphens.`,
    );
  }

  return id;
}

function parseSourceSchemaHash(context: string, value: unknown): WorkspaceSourceSchemaHash {
  if (typeof value !== "string" || !sha256DigestPattern.test(value)) {
    throw new Error(`${context} must be a sha256 source schema hash.`);
  }

  return value as WorkspaceSourceSchemaHash;
}

function parsePositiveInteger(context: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${context} must be a positive integer.`);
  }

  return value;
}

function parseCursor(context: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${context} must be a non-negative integer.`);
  }

  return value;
}

function parseIsoTimestamp(context: string, value: unknown): string {
  const timestamp = parseNonEmptyString(context, value);
  const date = new Date(timestamp);

  if (Number.isNaN(date.valueOf()) || date.toISOString() !== timestamp) {
    throw new Error(`${context} must be an ISO timestamp.`);
  }

  return timestamp;
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value;
}

function assertExpectedValue(context: string, value: string, expected: string) {
  if (value !== expected) {
    throw new Error(`${context} must be "${expected}".`);
  }
}

function assertExactKeys(
  context: string,
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
) {
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }

  for (const key of requiredKeys) {
    if (!(key in value)) {
      throw new Error(`${context} must include "${key}".`);
    }
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
