import {
  INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
  formatInstanceControlPlaneBoundaryEntityName,
  instanceControlPlaneEntityNames,
  instanceControlPlaneRecordSourceEntityName,
  instanceControlPlaneSchema,
  isCurrentInstanceControlPlaneRecord,
  isInstanceControlPlaneEntityName,
  parseInstanceControlPlaneBoundaryEntityName,
  parseInstanceControlPlaneRecords,
  reviewableInstanceControlPlaneRecordValues,
  reviewableInstanceControlPlaneRecords,
  validateInstanceControlPlaneRecords,
  type InstanceControlPlaneEntityName,
} from "@dpeek/formless-instance-control-plane";
import {
  INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_FILE_KIND,
  INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_FILE_VERSION,
} from "./types.ts";
import type {
  InstanceWorkspaceControlPlaneRecordSourceControlPlane,
  InstanceWorkspaceControlPlaneRecordSourceEntity,
  InstanceWorkspaceControlPlaneRecordSourceFile,
  InstanceWorkspaceRecordValues,
  InstanceWorkspaceStoredRecord,
} from "./types.ts";
import { formatStoredRecordsForArtifact } from "@dpeek/formless-storage";
import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";

export function instanceWorkspaceControlPlaneRecordSourceFileName(
  entity: InstanceWorkspaceControlPlaneRecordSourceEntity,
): string {
  return `${entity}.json`;
}

export function formatInstanceWorkspaceControlPlaneRecordSourceFile(input: {
  entity: InstanceWorkspaceControlPlaneRecordSourceEntity;
  records: readonly InstanceWorkspaceStoredRecord[];
  schemaUpdatedAt: string;
}): string {
  const records = formatStoredRecordsForArtifact(
    instanceControlPlaneSchema,
    input.records
      .filter(
        (record) => instanceControlPlaneRecordSourceEntityName(record.entity) === input.entity,
      )
      .map((record) => reviewableRecordSourceRecord(input.entity, record)),
  ).map((record) => ({
    ...record,
    entity: formatInstanceWorkspaceControlPlaneBoundaryEntityName(input.entity),
  }));
  const file: InstanceWorkspaceControlPlaneRecordSourceFile = {
    kind: INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_FILE_KIND,
    version: INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_FILE_VERSION,
    schemaKey: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
    schemaUpdatedAt: input.schemaUpdatedAt,
    entity: formatInstanceWorkspaceControlPlaneBoundaryEntityName(input.entity),
    records,
  };

  return `${JSON.stringify(file, null, 2)}\n`;
}

export function parseInstanceWorkspaceControlPlaneRecordSourceFileJson(
  contents: string,
  options: {
    context: string;
    expectedEntity?: InstanceWorkspaceControlPlaneRecordSourceEntity;
  },
): ParsedInstanceWorkspaceControlPlaneRecordSourceFile {
  try {
    return parseInstanceWorkspaceControlPlaneRecordSourceFile(
      JSON.parse(contents) as unknown,
      options,
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${options.context} must be valid JSON.`);
    }

    throw error;
  }
}

export function parseInstanceWorkspaceControlPlaneRecordSourceFile(
  value: unknown,
  options: {
    context: string;
    expectedEntity?: InstanceWorkspaceControlPlaneRecordSourceEntity;
  },
): ParsedInstanceWorkspaceControlPlaneRecordSourceFile {
  if (!isRecord(value)) {
    throw new Error(`${options.context} must be an object.`);
  }

  assertExactKeys(options.context, value, [
    "kind",
    "version",
    "schemaKey",
    "schemaUpdatedAt",
    "entity",
    "records",
  ]);

  if (value.kind !== INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_FILE_KIND) {
    throw new Error(
      `${options.context} kind must be "${INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_FILE_KIND}".`,
    );
  }

  if (value.version !== INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_FILE_VERSION) {
    throw new Error(
      `${options.context} version must be ${INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_FILE_VERSION}.`,
    );
  }

  if (value.schemaKey !== INSTANCE_CONTROL_PLANE_SCHEMA_KEY) {
    throw new Error(`${options.context} schemaKey must be "${INSTANCE_CONTROL_PLANE_SCHEMA_KEY}".`);
  }

  if (typeof value.entity !== "string") {
    throw new Error(`${options.context} entity must be a string.`);
  }

  const entity = parseRecordSourceEntity(`${options.context} entity`, value.entity);

  if (options.expectedEntity !== undefined && entity !== options.expectedEntity) {
    throw new Error(
      `${options.context} entity must be "${formatInstanceWorkspaceControlPlaneBoundaryEntityName(options.expectedEntity)}".`,
    );
  }

  return {
    entity,
    records: parseRecordSourceFileRecords(`${options.context} records`, value.records, entity),
    schemaUpdatedAt: parseIsoTimestamp(`${options.context} schemaUpdatedAt`, value.schemaUpdatedAt),
  };
}

export function parseInstanceWorkspaceControlPlaneRecordSourceControlPlane(
  context: string,
  schemaUpdatedAt: unknown,
  records: unknown,
): InstanceWorkspaceControlPlaneRecordSourceControlPlane {
  const selectedRecords = Array.isArray(records)
    ? records.filter(isCurrentInstanceControlPlaneRecord)
    : records;
  const parsedRecords = parseInstanceControlPlaneRecords(
    `${context} records`,
    selectedRecords,
  ) as InstanceWorkspaceStoredRecord[];
  const controlPlane: InstanceWorkspaceControlPlaneRecordSourceControlPlane = {
    schemaKey: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
    schemaUpdatedAt: parseIsoTimestamp(`${context} schemaUpdatedAt`, schemaUpdatedAt),
    records: instanceWorkspaceControlPlaneRecordSourceRecords(parsedRecords),
  };

  validateInstanceWorkspaceControlPlaneRecordSource(controlPlane);

  return controlPlane;
}

export function instanceWorkspaceControlPlaneRecordSourceRecords(
  records: readonly InstanceWorkspaceStoredRecord[],
): InstanceWorkspaceStoredRecord[] {
  return reviewableInstanceControlPlaneRecords(records as readonly StoredRecord[], {
    context: "Workspace control-plane record source records",
    sourceLabel: "Workspace control-plane record source",
  }) as InstanceWorkspaceStoredRecord[];
}

export function validateInstanceWorkspaceControlPlaneRecordSource(
  controlPlane: InstanceWorkspaceControlPlaneRecordSourceControlPlane,
) {
  validateInstanceControlPlaneRecords(
    "Workspace control-plane record source records",
    controlPlane.records as readonly StoredRecord[],
  );
}

export function formatInstanceWorkspaceControlPlaneBoundaryEntityName(
  entityName: InstanceWorkspaceControlPlaneRecordSourceEntity,
): string {
  return formatInstanceControlPlaneBoundaryEntityName(entityName);
}

export function parseInstanceWorkspaceControlPlaneBoundaryEntityName(
  context: string,
  value: string,
): InstanceWorkspaceControlPlaneRecordSourceEntity {
  return parseInstanceControlPlaneBoundaryEntityName(
    context,
    value,
  ) as InstanceWorkspaceControlPlaneRecordSourceEntity;
}

export function isInstanceWorkspaceControlPlaneRecordSourceEntity(
  value: string,
): value is InstanceWorkspaceControlPlaneRecordSourceEntity {
  return isInstanceControlPlaneEntityName(value);
}

export type ParsedInstanceWorkspaceControlPlaneRecordSourceFile = {
  entity: InstanceWorkspaceControlPlaneRecordSourceEntity;
  records: InstanceWorkspaceStoredRecord[];
  schemaUpdatedAt: string;
};

function parseRecordSourceFileRecords(
  context: string,
  value: unknown,
  entity: InstanceWorkspaceControlPlaneRecordSourceEntity,
): InstanceWorkspaceStoredRecord[] {
  const records = parseInstanceControlPlaneRecords(
    context,
    value,
  ) as InstanceWorkspaceStoredRecord[];

  for (const [index, record] of records.entries()) {
    if (instanceControlPlaneRecordSourceEntityName(record.entity) !== entity) {
      throw new Error(
        `${context}[${index}] entity must be "${formatInstanceWorkspaceControlPlaneBoundaryEntityName(entity)}".`,
      );
    }
  }

  return records;
}

function parseRecordSourceEntity(
  context: string,
  value: string,
): InstanceWorkspaceControlPlaneRecordSourceEntity {
  const entity = parseInstanceWorkspaceControlPlaneBoundaryEntityName(context, value);

  if (!isInstanceWorkspaceControlPlaneRecordSourceEntity(entity)) {
    throw new Error(`${context} "${value}" is not a workspace control-plane record source entity.`);
  }

  return entity;
}

function reviewableRecordSourceRecord(
  entity: InstanceWorkspaceControlPlaneRecordSourceEntity,
  record: InstanceWorkspaceStoredRecord,
): InstanceWorkspaceStoredRecord {
  return {
    id: record.id,
    entity,
    values: reviewableInstanceControlPlaneRecordValues(
      entity as InstanceControlPlaneEntityName,
      record.values as RecordValues,
    ) as InstanceWorkspaceRecordValues,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.deletedAt === undefined ? {} : { deletedAt: record.deletedAt }),
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  context: string,
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
) {
  const allowedKeys = new Set(requiredKeys);

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

export const INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_ENTITIES =
  instanceControlPlaneEntityNames;
