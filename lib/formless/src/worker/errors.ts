import {
  FORMLESS_RELOAD_REQUIRED_ERROR_CODE,
  type BrowserReplicaUpgradeFacts,
  type ReloadRequiredErrorResponse,
} from "../shared/protocol.ts";

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

export type ArchiveRestoreGuardConflictReason =
  | "guard-held"
  | "guard-token-invalid"
  | "source-cursor-changed";

export class ArchiveRestoreGuardConflictError extends Error {
  readonly currentSourceCursor: number;
  readonly expectedSourceCursor?: number;
  readonly reason: ArchiveRestoreGuardConflictReason;

  constructor(input: {
    currentSourceCursor: number;
    expectedSourceCursor?: number;
    reason: ArchiveRestoreGuardConflictReason;
  }) {
    super(archiveRestoreGuardConflictMessage(input));
    this.name = "ArchiveRestoreGuardConflictError";
    this.currentSourceCursor = input.currentSourceCursor;
    this.expectedSourceCursor = input.expectedSourceCursor;
    this.reason = input.reason;
  }
}

export class ReloadRequiredError extends Error {
  readonly body: ReloadRequiredErrorResponse;
  readonly status = 409;

  constructor(message: string, upgrade: BrowserReplicaUpgradeFacts) {
    super(message);
    this.name = "ReloadRequiredError";
    this.body = {
      error: message,
      code: FORMLESS_RELOAD_REQUIRED_ERROR_CODE,
      reloadRequired: true,
      upgrade,
    };
  }
}

function archiveRestoreGuardConflictMessage(input: {
  currentSourceCursor: number;
  expectedSourceCursor?: number;
  reason: ArchiveRestoreGuardConflictReason;
}): string {
  if (input.reason === "source-cursor-changed") {
    return `Archive restore expected Program source cursor ${input.expectedSourceCursor}, but current cursor is ${input.currentSourceCursor}.`;
  }

  if (input.reason === "guard-held") {
    return "Program writes are blocked while an archive restore guard is held.";
  }

  return "Archive restore guard token is invalid or no longer active.";
}
