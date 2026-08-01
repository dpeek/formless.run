/**
 * Runtime-neutral Archive package entrypoint.
 */
export * from "./types.ts";
export * from "./media-references.ts";
export * from "./restore-plan.ts";

import type { InstanceArchive } from "./types.ts";

export const INSTANCE_ARCHIVE_MANIFEST_FILE = "archive.json";

export function archiveMediaObjects(archive: InstanceArchive) {
  return archive.media.objects;
}

export function archiveRecordCount(archive: InstanceArchive): number {
  return archive.program.snapshot.records.length;
}
