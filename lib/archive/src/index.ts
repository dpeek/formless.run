/**
 * Runtime-neutral Archive package entrypoint.
 */
export * from "./types.ts";
export * from "./media-references.ts";
export * from "./restore-plan.ts";

import {
  formatInstanceArchive,
  type ArchiveProgramValidationOptions,
  type PortableArchive,
} from "./types.ts";

export const PORTABLE_ARCHIVE_MANIFEST_FILE = "archive.json";

export function formatPortableArchive(
  archive: PortableArchive,
  options: ArchiveProgramValidationOptions = {},
): string {
  return formatInstanceArchive(archive, options);
}

export function archiveMediaObjects(archive: PortableArchive) {
  return archive.media.objects;
}

export function archiveRecordCount(archive: PortableArchive): number {
  return archive.program.snapshot.records.length;
}
