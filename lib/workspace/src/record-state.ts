import type { AppSchema } from "@dpeek/formless-schema";
import { formatStoredRecordsForArtifact } from "@dpeek/formless-storage";
import {
  INSTANCE_WORKSPACE_PROGRAM_SCHEMA_KEY,
  WORKSPACE_RECORD_STATE_FILE_KIND,
  WORKSPACE_RECORD_STATE_FILE_VERSION,
} from "./types.ts";
import type {
  InstanceWorkspaceRecordValues,
  InstanceWorkspaceStoredRecord,
  WorkspaceProgramRecordStateFile,
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

export type FormatWorkspaceRecordStateFileOptions = {
  formatRecordEntity?: (entity: string) => string;
  normalizeRecordEntity?: (entity: string) => string;
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
const programSchemaProvenanceKeys = ["kind", "sourceSchemaHash"] as const;
const sha256DigestPattern = /^sha256:[a-f0-9]{64}$/;

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

  if (parsed.storageIdentity !== "instance:control-plane") {
    throw new Error(`${context} storageIdentity must be "instance:control-plane".`);
  }

  if (parsed.schemaKey !== INSTANCE_WORKSPACE_PROGRAM_SCHEMA_KEY) {
    throw new Error(`${context} schemaKey must be "${INSTANCE_WORKSPACE_PROGRAM_SCHEMA_KEY}".`);
  }

  return parsed as WorkspaceProgramRecordStateFile;
}

export function formatWorkspaceRecordStateFile(
  state: WorkspaceRecordStateFile,
  schema: AppSchema,
  options: FormatWorkspaceRecordStateFileOptions = {},
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
    records: formatWorkspaceStoredRecords(parsed, schema, options),
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

  if (value.kind === "program") {
    assertExactKeys(context, value, programSchemaProvenanceKeys);

    return {
      kind: "program",
      sourceSchemaHash: parseSourceSchemaHash(
        `${context} sourceSchemaHash`,
        value.sourceSchemaHash,
      ),
    };
  }

  throw new Error(`${context} kind must be "program".`);
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
  _state: WorkspaceRecordStateFile,
  schema: AppSchema,
  options: FormatWorkspaceRecordStateFileOptions,
): InstanceWorkspaceStoredRecord[] {
  const records = _state.records.map((record) => ({
    ...record,
    entity: options.normalizeRecordEntity?.(record.entity) ?? record.entity,
  }));

  return formatStoredRecordsForArtifact(schema, records).map((record) => ({
    ...record,
    entity: options.formatRecordEntity?.(record.entity) ?? record.entity,
  }));
}

function recordStateContext(options: ParseWorkspaceRecordStateFileOptions): string {
  return options.context ?? "Workspace record state file";
}

function parseSourceSchemaHash(context: string, value: unknown): WorkspaceSourceSchemaHash {
  if (typeof value !== "string" || !sha256DigestPattern.test(value)) {
    throw new Error(`${context} must be a sha256 source schema hash.`);
  }

  return value as WorkspaceSourceSchemaHash;
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
