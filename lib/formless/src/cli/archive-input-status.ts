import { readFile } from "node:fs/promises";
import path from "node:path";

import { PORTABLE_ARCHIVE_MANIFEST_FILE } from "../program/archive.ts";

export { PORTABLE_ARCHIVE_MANIFEST_FILE };

export type PortableArchiveInputStatus =
  | {
      present: false;
    }
  | {
      archivePath: string;
      error?: string;
      kind: string | null;
      present: true;
      readable: boolean;
      version: number | string | null;
    };

export async function readPortableArchiveInputStatus(input: {
  archiveDir: string;
  cwd: string;
}): Promise<PortableArchiveInputStatus> {
  const archiveDir = path.resolve(input.cwd, input.archiveDir);
  const archivePath = path.join(archiveDir, PORTABLE_ARCHIVE_MANIFEST_FILE);

  try {
    const value = JSON.parse(await readFile(archivePath, "utf8")) as unknown;

    if (!isRecord(value)) {
      return unreadableArchiveInputStatus(
        archivePath,
        "Portable archive manifest must be a JSON object.",
      );
    }

    return {
      archivePath,
      kind: typeof value.kind === "string" ? value.kind : null,
      present: true,
      readable: true,
      version:
        typeof value.version === "number" || typeof value.version === "string"
          ? value.version
          : null,
    };
  } catch (error) {
    return unreadableArchiveInputStatus(
      archivePath,
      error instanceof Error && error.message.trim() !== ""
        ? error.message
        : "Portable archive manifest could not be read.",
    );
  }
}

function unreadableArchiveInputStatus(
  archivePath: string,
  error: string,
): PortableArchiveInputStatus {
  return {
    archivePath,
    error,
    kind: null,
    present: true,
    readable: false,
    version: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
