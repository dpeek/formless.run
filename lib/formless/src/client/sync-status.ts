import { useSyncExternalStore } from "react";

export type SyncStatus =
  | {
      code:
        | "local-cache-ready"
        | "media-uploaded"
        | "media-uploaded-and-synced"
        | "program-changes-caught-up"
        | "program-synced"
        | "record-saved"
        | "record-updated";
      state: "idle";
    }
  | {
      code: "operation-committed" | "operation-replayed";
      label: string;
      state: "idle";
    }
  | {
      code:
        | "media-uploading"
        | "program-catching-up"
        | "program-syncing"
        | "push-connecting"
        | "push-connection-issue"
        | "push-reconnecting"
        | "push-renewing";
      state: "syncing";
    }
  | {
      code: "operation-running" | "record-saving" | "record-updating";
      label: string;
      state: "syncing";
    }
  | {
      code:
        | "media-upload-failed"
        | "program-sync-failed"
        | "push-authorization-changed"
        | "push-connection-failed"
        | "push-invalid-message"
        | "record-save-failed"
        | "record-update-failed";
      state: "error";
    }
  | {
      code: "operation-failed";
      label: string;
      state: "error";
    };

export type SyncStatusErrorCode = Extract<SyncStatus, { state: "error" }>["code"];

type SyncStatusListener = () => void;

const listeners = new Set<SyncStatusListener>();

let status: SyncStatus = {
  code: "local-cache-ready",
  state: "idle",
};

export function setSyncStatus(nextStatus: SyncStatus) {
  if (
    status.state === nextStatus.state &&
    status.code === nextStatus.code &&
    ("label" in status ? status.label : undefined) ===
      ("label" in nextStatus ? nextStatus.label : undefined)
  ) {
    return;
  }

  status = nextStatus;
  for (const listener of listeners) {
    listener();
  }
}

export function resetSyncStatus() {
  setSyncStatus({
    code: "local-cache-ready",
    state: "idle",
  });
}

export function useSyncStatus() {
  return useSyncExternalStore(subscribeToSyncStatus, getSyncStatus, getSyncStatus);
}

function getSyncStatus() {
  return status;
}

function subscribeToSyncStatus(listener: SyncStatusListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
