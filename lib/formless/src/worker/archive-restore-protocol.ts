import type { StorageSnapshot } from "@dpeek/formless-storage";

export const ARCHIVE_RESTORE_GUARD_PATH = "/snapshot/restore/guard";
export const ARCHIVE_RESTORE_GUARD_RELEASE_PATH = "/snapshot/restore/guard/release";
export const ARCHIVE_RESTORE_CONFLICT_CODE = "archive-restore-conflict";

export type ArchiveRestoreGuardRequest = {
  expectedSourceCursor?: number;
  guardToken: string;
};

export type ArchiveRestoreGuardResponse = {
  guardToken: string;
  snapshot: StorageSnapshot;
};

export type ArchiveRestoreGuardReleaseRequest = {
  guardToken: string;
};

export type ArchiveRestoreGuardReleaseResponse = {
  released: true;
};

export type ArchiveRestoreGuardedSnapshotRequest = {
  guardToken: string;
  snapshot: unknown;
};

export type ArchiveRestoreConflictResponse = {
  code: typeof ARCHIVE_RESTORE_CONFLICT_CODE;
  currentSourceCursor: number;
  error: string;
  expectedSourceCursor?: number;
  reason: "guard-held" | "guard-token-invalid" | "source-cursor-changed";
};
