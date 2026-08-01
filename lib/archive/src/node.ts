/**
 * Local Node Archive package adapter entrypoint.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  PORTABLE_ARCHIVE_MANIFEST_FILE,
  archiveMediaObjects,
  archiveRecordCount,
  formatPortableArchive,
  parsePortableArchive,
  type ArchiveProgramValidationOptions,
  type PortableArchive,
} from "./index.ts";

export * from "./index.ts";

export type ArchiveDiskMediaFile = {
  archivePath: string;
  byteSize: number;
  bytes: Uint8Array;
  contentType: string;
};

export type ArchiveDiskWriteResult = {
  archivePath: string;
  mediaCount: number;
  recordCount: number;
};

export type ReadPortableArchiveDirectoryResult = {
  archive: PortableArchive;
  archivePath: string;
  mediaFiles: ArchiveDiskMediaFile[];
};

export async function writePortableArchiveDirectory(
  input: {
    archive: PortableArchive;
    mediaFiles: readonly ArchiveDiskMediaFile[];
    outDir: string;
  } & ArchiveProgramValidationOptions,
  dependencies: { cwd: string },
): Promise<ArchiveDiskWriteResult> {
  const archiveDir = path.resolve(dependencies.cwd, input.outDir);
  const archivePath = path.join(archiveDir, PORTABLE_ARCHIVE_MANIFEST_FILE);

  await mkdir(archiveDir, { recursive: true });
  await writeFile(
    archivePath,
    formatPortableArchive(input.archive, {
      programSnapshotContract: input.programSnapshotContract,
    }),
  );

  for (const file of input.mediaFiles) {
    const filePath = path.join(archiveDir, assertArchiveRelativePath(file.archivePath));

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, file.bytes);
  }

  return {
    archivePath,
    mediaCount: input.mediaFiles.length,
    recordCount: archiveRecordCount(input.archive),
  };
}

export async function readPortableArchiveDirectory(
  archiveDirInput: string,
  dependencies: { cwd: string } & ArchiveProgramValidationOptions,
): Promise<ReadPortableArchiveDirectoryResult> {
  const archiveDir = path.resolve(dependencies.cwd, archiveDirInput);
  const archivePath = path.join(archiveDir, PORTABLE_ARCHIVE_MANIFEST_FILE);
  const archive = parsePortableArchive(JSON.parse(await readFile(archivePath, "utf8")) as unknown, {
    programSnapshotContract: dependencies.programSnapshotContract,
  });
  const mediaFiles = await Promise.all(
    archiveMediaObjects(archive).map(async (object) => {
      const bytes = new Uint8Array(
        await readFile(path.join(archiveDir, assertArchiveRelativePath(object.archivePath))),
      );

      return {
        archivePath: object.archivePath,
        byteSize: bytes.byteLength,
        bytes,
        contentType: object.contentType,
      };
    }),
  );

  return {
    archive,
    archivePath,
    mediaFiles,
  };
}

function assertArchiveRelativePath(value: string): string {
  const segments = value.split("/");

  if (
    value.trim() === "" ||
    value !== value.trim() ||
    value.startsWith("/") ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`Archive path is not safe: ${value}`);
  }

  return value;
}
