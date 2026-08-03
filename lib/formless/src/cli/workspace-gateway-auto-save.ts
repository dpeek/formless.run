import type { WorkspaceGatewayStartInput } from "@dpeek/formless-gateway";
import type {
  WorkspaceAutoSaveEnqueueInput,
  WorkspaceAutoSaveWriteSource,
} from "@dpeek/formless-workspace";

import {
  saveLocalFormlessWorkspace,
  type SaveLocalFormlessWorkspaceDependencies,
} from "./instance-workspace-source-sync.ts";

export type WorkspaceAutoSaveSuppressionReason =
  | "auto-save"
  | "gateway-operation-state"
  | "manual-save"
  | "push-deploy-remote-apply"
  | "workspace-check-status"
  | "workspace-pull";

export type WorkspaceGatewayOperationAutoSaveScheduler = {
  enqueue: (input: WorkspaceAutoSaveEnqueueInput & { workspaceRoot: string }) => Promise<void>;
  recordGatewayOperationStateSuppressed: (input: { workspaceRoot: string }) => Promise<void>;
  recordSaved: (input: { throughGeneration: number; workspaceRoot: string }) => Promise<void>;
  recordWorkspaceOperationSuppressed: (input: {
    operationInput: WorkspaceGatewayStartInput;
    workspaceRoot: string;
  }) => Promise<number | undefined>;
};

export type WorkspaceAutoSaveSchedulerSaveInput = {
  dirtyGeneration: number;
  workspaceRoot: string;
  writeSources: readonly WorkspaceAutoSaveWriteSource[];
};

export type WorkspaceAutoSaveSchedulerFailure = WorkspaceAutoSaveSchedulerSaveInput & {
  retryCount: number;
};

export type WorkspaceAutoSaveScheduler = {
  runNow: (workspaceRoot: string) => Promise<void>;
} & WorkspaceGatewayOperationAutoSaveScheduler;

export type WorkspaceAutoSaveSchedulerDependencies = {
  clearTimeout?: (timer: WorkspaceAutoSaveTimer) => void;
  debounceMs?: number;
  maxRetries?: number;
  reportFailure: (error: unknown, input: WorkspaceAutoSaveSchedulerFailure) => void;
  retryBackoffMs?: (retryCount: number) => number;
  save: (input: WorkspaceAutoSaveSchedulerSaveInput) => Promise<void>;
  setTimeout?: (callback: () => void, delayMs: number) => WorkspaceAutoSaveTimer;
};

export type WorkspaceDefaultAutoSaveSchedulerDependencies =
  SaveLocalFormlessWorkspaceDependencies & {
    autoSaveDebounceMs?: number;
    autoSaveMaxRetries?: number;
    autoSaveReportFailure?: WorkspaceAutoSaveSchedulerDependencies["reportFailure"];
    autoSaveRetryBackoffMs?: (retryCount: number) => number;
  };

type WorkspaceAutoSaveTimer = unknown;

type WorkspaceAutoSavePendingWrite = {
  generation: number;
  source: WorkspaceAutoSaveWriteSource;
};

type WorkspaceAutoSaveSchedulerEntry = {
  dirtyGeneration: number;
  inFlightGeneration?: number;
  lastSuppression?: WorkspaceAutoSaveSuppressionReason;
  pendingWrites: WorkspaceAutoSavePendingWrite[];
  retryCount: number;
  runAfterCurrent?: boolean;
  running?: Promise<void>;
  savedGeneration: number;
  timer?: WorkspaceAutoSaveTimer;
};

export function createWorkspaceAutoSaveScheduler(
  dependencies: WorkspaceAutoSaveSchedulerDependencies,
): WorkspaceAutoSaveScheduler {
  const entries = new Map<string, WorkspaceAutoSaveSchedulerEntry>();
  const debounceMs = dependencies.debounceMs ?? 250;
  const maxRetries = dependencies.maxRetries ?? 2;
  const retryBackoffMs = dependencies.retryBackoffMs ?? ((retryCount: number) => retryCount * 1000);
  const setTimer =
    dependencies.setTimeout ??
    ((callback: () => void, delayMs: number): WorkspaceAutoSaveTimer =>
      setTimeout(callback, delayMs));
  const clearTimer =
    dependencies.clearTimeout ??
    ((timer: WorkspaceAutoSaveTimer) => {
      clearTimeout(timer as ReturnType<typeof setTimeout>);
    });

  const recordSuppressed = (workspaceRoot: string, reason: WorkspaceAutoSaveSuppressionReason) => {
    schedulerEntry(entries, workspaceRoot).lastSuppression = reason;
  };

  const schedule = (workspaceRoot: string, delayMs: number) => {
    const entry = schedulerEntry(entries, workspaceRoot);

    if (entry.timer !== undefined) {
      clearTimer(entry.timer);
    }

    entry.timer = setTimer(() => {
      entry.timer = undefined;
      void runAutoSave(workspaceRoot);
    }, delayMs);
  };

  const runAutoSave = async (workspaceRoot: string): Promise<void> => {
    const entry = schedulerEntry(entries, workspaceRoot);

    if (entry.running) {
      entry.runAfterCurrent = true;
      await entry.running;
      return;
    }

    const running = runAutoSaveOnce(workspaceRoot).finally(() => {
      entry.running = undefined;

      if (entry.runAfterCurrent) {
        entry.runAfterCurrent = false;
        schedule(workspaceRoot, 0);
      }
    });

    entry.running = running;
    await running;
  };

  const runAutoSaveOnce = async (workspaceRoot: string): Promise<void> => {
    const entry = schedulerEntry(entries, workspaceRoot);

    if (entry.dirtyGeneration <= entry.savedGeneration) {
      return;
    }

    const dirtyGeneration = entry.dirtyGeneration;
    const saveInput: WorkspaceAutoSaveSchedulerSaveInput = {
      dirtyGeneration,
      workspaceRoot,
      writeSources: sortedUnique(
        entry.pendingWrites
          .filter((write) => write.generation <= dirtyGeneration)
          .map((write) => write.source),
      ),
    };

    entry.inFlightGeneration = dirtyGeneration;
    recordSuppressed(workspaceRoot, "auto-save");

    try {
      await dependencies.save(saveInput);
      recordSavedThrough(entry, dirtyGeneration);
    } catch (error) {
      entry.inFlightGeneration = undefined;
      entry.retryCount += 1;
      reportFailure(dependencies.reportFailure, error, {
        ...saveInput,
        retryCount: entry.retryCount,
      });

      if (entry.retryCount <= maxRetries) {
        schedule(workspaceRoot, retryBackoffMs(entry.retryCount));
      }
    }
  };

  return {
    enqueue: async (input) => {
      const entry = schedulerEntry(entries, input.workspaceRoot);

      entry.dirtyGeneration += 1;
      entry.pendingWrites.push({ generation: entry.dirtyGeneration, source: input.source });
      entry.retryCount = 0;
      schedule(input.workspaceRoot, debounceMs);
    },
    recordGatewayOperationStateSuppressed: async ({ workspaceRoot }) => {
      recordSuppressed(workspaceRoot, "gateway-operation-state");
    },
    recordSaved: async ({ throughGeneration, workspaceRoot }) => {
      recordSavedThrough(schedulerEntry(entries, workspaceRoot), throughGeneration);
    },
    recordWorkspaceOperationSuppressed: async ({ operationInput, workspaceRoot }) => {
      const reason = autoSaveSuppressionReasonForWorkspaceOperation(operationInput);

      if (reason === undefined) {
        return undefined;
      }

      const entry = schedulerEntry(entries, workspaceRoot);

      recordSuppressed(workspaceRoot, reason);
      return reason === "manual-save" ? entry.dirtyGeneration : undefined;
    },
    runNow: async (workspaceRoot) => {
      const entry = schedulerEntry(entries, workspaceRoot);

      if (!entry.running && entry.timer !== undefined) {
        clearTimer(entry.timer);
        entry.timer = undefined;
      }

      await runAutoSave(workspaceRoot);
    },
  };
}

export function createDefaultWorkspaceAutoSaveScheduler(
  dependencies: WorkspaceDefaultAutoSaveSchedulerDependencies,
): WorkspaceAutoSaveScheduler {
  return createWorkspaceAutoSaveScheduler({
    debounceMs: dependencies.autoSaveDebounceMs,
    maxRetries: dependencies.autoSaveMaxRetries,
    reportFailure:
      dependencies.autoSaveReportFailure ??
      ((error) => {
        console.error("Workspace auto-save failed.", error);
      }),
    retryBackoffMs: dependencies.autoSaveRetryBackoffMs,
    save: async ({ workspaceRoot }) => {
      await saveLocalFormlessWorkspace(
        { workspacePath: workspaceRoot },
        {
          cwd: workspaceRoot,
          ...(dependencies.env === undefined ? {} : { env: dependencies.env }),
          fetch: dependencies.fetch,
          now: dependencies.now,
        },
      );
    },
  });
}

function schedulerEntry(
  entries: Map<string, WorkspaceAutoSaveSchedulerEntry>,
  workspaceRoot: string,
): WorkspaceAutoSaveSchedulerEntry {
  let entry = entries.get(workspaceRoot);

  if (!entry) {
    entry = {
      dirtyGeneration: 0,
      pendingWrites: [],
      retryCount: 0,
      savedGeneration: 0,
    };
    entries.set(workspaceRoot, entry);
  }

  return entry;
}

function recordSavedThrough(
  entry: WorkspaceAutoSaveSchedulerEntry,
  throughGeneration: number,
): void {
  const savedGeneration = Math.min(throughGeneration, entry.dirtyGeneration);

  entry.savedGeneration = Math.max(entry.savedGeneration, savedGeneration);
  entry.pendingWrites = entry.pendingWrites.filter(
    (write) => write.generation > entry.savedGeneration,
  );
  entry.inFlightGeneration = undefined;
  entry.retryCount = 0;
}

function reportFailure(
  report: WorkspaceAutoSaveSchedulerDependencies["reportFailure"],
  error: unknown,
  input: WorkspaceAutoSaveSchedulerFailure,
): void {
  try {
    report(error, input);
  } catch {
    // Diagnostics must not change scheduler behavior.
  }
}

function autoSaveSuppressionReasonForWorkspaceOperation(
  operationInput: WorkspaceGatewayStartInput,
): WorkspaceAutoSaveSuppressionReason | undefined {
  switch (operationInput.kind) {
    case "check":
    case "status":
      return "workspace-check-status";
    case "push":
      return "push-deploy-remote-apply";
    case "pull":
      return "workspace-pull";
    case "save":
      return operationInput.check ? "workspace-check-status" : "manual-save";
    case "credentialSetup":
      return undefined;
  }
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
