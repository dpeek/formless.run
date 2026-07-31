/**
 * Runtime-neutral Archive package entrypoint.
 */
export * from "./types.ts";
export * from "./media-references.ts";
export * from "./restore-plan.ts";

import {
  INSTANCE_ARCHIVE_KIND,
  formatAppArchive,
  formatInstanceArchive,
  type ArchiveControlPlaneValidationOptions,
  type AppArchive,
  type PortableArchive,
} from "./types.ts";

export const PORTABLE_ARCHIVE_MANIFEST_FILE = "archive.json";

export function formatPortableArchive(
  archive: PortableArchive,
  options: ArchiveControlPlaneValidationOptions = {},
): string {
  return archive.kind === INSTANCE_ARCHIVE_KIND
    ? formatInstanceArchive(archive, options)
    : formatAppArchive(archive);
}

export function archiveApps(archive: PortableArchive): AppArchive[] {
  return archive.kind === INSTANCE_ARCHIVE_KIND ? archive.apps : [archive];
}

export function archiveMediaObjects(archive: PortableArchive) {
  return archive.kind === INSTANCE_ARCHIVE_KIND
    ? [...archive.media.objects, ...archive.apps.flatMap((app) => app.media.objects)]
    : archive.media.objects;
}

export function archiveRecordCount(archive: PortableArchive): number {
  return archiveApps(archive).reduce((count, app) => count + appRecordCount(app), 0);
}

function appRecordCount(app: AppArchive): number {
  return app.data.records.length;
}
