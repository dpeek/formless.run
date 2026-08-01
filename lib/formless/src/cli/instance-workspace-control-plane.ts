import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  archiveMediaObjects,
  parsePortableArchive,
  PORTABLE_ARCHIVE_MANIFEST_FILE,
  type AppArchive,
  type AppArchiveMediaObject,
  type InstanceArchive,
  type InstanceArchiveControlPlane as ArchiveControlPlaneSnapshot,
  type PortableArchive,
} from "../program/archive.ts";
import type { ArchiveDiskMediaFile } from "../program/archive-node.ts";
import { formlessProgramSchema } from "../program/runtime.ts";
import {
  FORMLESS_PROGRAM_SCHEMA_KEY,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
} from "../program/target.ts";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { RecordValues, StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import { bundledAppPackageResolver, type AppPackageResolver } from "../shared/app-packages.ts";
export type WorkspaceControlPlaneRecords = StorageSnapshot;
export type WorkspaceRecordValueSource = {
  values: Record<string, unknown>;
};
export type WorkspaceArchiveDirectory = {
  archive: PortableArchive;
  archivePath: string;
  mediaFiles: ArchiveDiskMediaFile[];
  missingMediaFiles: string[];
};

export type WorkspaceInstanceArchiveDirectory = WorkspaceArchiveDirectory & {
  archive: InstanceArchive;
};

export type WorkspaceAppStateArchive = {
  appArchive: AppArchive;
  mediaFiles: ArchiveDiskMediaFile[];
  missingMediaFiles: string[];
  statePath: string;
};

export type WorkspaceArchiveMediaComparisonSource = {
  mediaFiles: ArchiveDiskMediaFile[];
  missingMediaFiles: string[];
};

export type WorkspaceControlPlaneAppInstallRecord = {
  createdAt: string;
  installId: string;
  label: string;
  packageAppKey: string;
  packageRevision?: number;
  sourceSchemaHash?: AppArchive["app"]["sourceSchemaHash"];
  status: "installed";
  updatedAt: string;
};

export function stringRecordValue(
  record: WorkspaceRecordValueSource | undefined,
  fieldName: string,
): string | undefined {
  const value = record?.values[fieldName];

  return typeof value === "string" ? value : undefined;
}

export function booleanRecordValue(
  record: WorkspaceRecordValueSource | undefined,
  fieldName: string,
): boolean | undefined {
  const value = record?.values[fieldName];

  return typeof value === "boolean" ? value : undefined;
}

export function numberRecordValue(
  record: WorkspaceRecordValueSource | undefined,
  fieldName: string,
): number | undefined {
  const value = record?.values[fieldName];

  return typeof value === "number" ? value : undefined;
}

export function sourceSchemaHashRecordValue(
  record: StoredRecord | undefined,
): AppArchive["app"]["sourceSchemaHash"] | undefined {
  const value = stringRecordValue(record, "sourceSchemaHash");

  return value?.startsWith("sha256:")
    ? (value as AppArchive["app"]["sourceSchemaHash"])
    : undefined;
}

export function withoutControlPlaneLifecycleValues(values: RecordValues): RecordValues {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([fieldName]) => fieldName !== "createdAt" && fieldName !== "updatedAt",
    ),
  ) as RecordValues;
}

export async function readArchiveDirectoryForCheck(
  archiveRoot: string,
  options: {
    packageResolver?: AppPackageResolver;
  } = {},
): Promise<WorkspaceArchiveDirectory | undefined> {
  const archivePath = path.join(archiveRoot, PORTABLE_ARCHIVE_MANIFEST_FILE);
  let contents: string;

  try {
    contents = await readFile(archivePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }

  const archive = parsePortableArchive(JSON.parse(contents) as unknown, {
    packageResolver: options.packageResolver,
  });
  const mediaFiles: ArchiveDiskMediaFile[] = [];
  const missingMediaFiles: string[] = [];

  for (const object of archiveMediaObjects(archive)) {
    try {
      const bytes = new Uint8Array(await readFile(path.join(archiveRoot, object.archivePath)));

      mediaFiles.push({
        archivePath: object.archivePath,
        byteSize: bytes.byteLength,
        bytes,
        contentType: object.contentType,
      });
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        missingMediaFiles.push(object.archivePath);
        continue;
      }

      throw error;
    }
  }

  return {
    archive,
    archivePath,
    mediaFiles,
    missingMediaFiles: missingMediaFiles.sort((left, right) => left.localeCompare(right)),
  };
}

export async function readArchiveMediaFiles(
  archiveDir: string,
  archive: PortableArchive,
): Promise<
  Array<
    ArchiveDiskMediaFile & {
      object: AppArchiveMediaObject;
    }
  >
> {
  const files: Array<
    ArchiveDiskMediaFile & {
      object: AppArchiveMediaObject;
    }
  > = [];
  for (const object of archiveMediaObjects(archive)) {
    const filePath = path.join(archiveDir, object.archivePath);

    try {
      const bytes = await readFile(filePath);

      files.push({
        archivePath: object.archivePath,
        byteSize: bytes.byteLength,
        bytes,
        contentType: object.contentType,
        object,
      });
    } catch (error) {
      if (!isNodeError(error) || error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  return files;
}

export async function readWorkspaceArchive(archiveDir: string): Promise<PortableArchive> {
  return parsePortableArchive(
    JSON.parse(
      await readFile(path.join(archiveDir, PORTABLE_ARCHIVE_MANIFEST_FILE), "utf8"),
    ) as unknown,
    { packageResolver: bundledAppPackageResolver },
  );
}

export function controlPlaneSnapshotForArchive(
  controlPlane: WorkspaceControlPlaneRecords,
  exportedAt: string,
): ArchiveControlPlaneSnapshot {
  return workspaceControlPlaneSnapshotFromRecords({
    current: controlPlane,
    exportedAt,
    records: controlPlane.records,
    schemaUpdatedAt: controlPlane.schemaUpdatedAt,
  });
}

export function workspaceControlPlaneSnapshotFromRecords(input: {
  current: WorkspaceControlPlaneRecords | undefined;
  exportedAt: string;
  records: StoredRecord[];
  schemaUpdatedAt: string;
}): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
    schemaKey: input.current?.schemaKey ?? FORMLESS_PROGRAM_SCHEMA_KEY,
    exportedAt: input.exportedAt,
    schemaUpdatedAt: input.schemaUpdatedAt,
    sourceCursor: input.records.length,
    schema: input.current?.schema ?? formlessProgramSchema,
    records: input.records,
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
