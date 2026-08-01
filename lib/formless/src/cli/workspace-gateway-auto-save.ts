import path from "node:path";

import type { WorkspaceGatewayStartInput } from "@dpeek/formless-gateway";
import {
  DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT,
  initialWorkspaceAutoSaveState,
  nextWorkspaceAutoSaveEnqueuedState,
  nextWorkspaceAutoSaveFailedState,
  nextWorkspaceAutoSaveSavedState,
  nextWorkspaceAutoSaveSavingState,
  nextWorkspaceAutoSaveSuppressedState,
  type WorkspaceAutoSaveEnqueueInput,
  type WorkspaceAutoSaveState,
  type WorkspaceAutoSaveSuppressionReason,
  type WorkspaceAutoSaveWriteSource,
  type WorkspaceOperationRequiredCapability,
} from "@dpeek/formless-workspace";
import {
  readInstanceWorkspaceAutoSaveState,
  writeInstanceWorkspaceAutoSaveState,
} from "@dpeek/formless-workspace/node";

import {
  runFormlessWorkspaceOperation,
  type RunFormlessWorkspaceOperationDependencies,
} from "./instance-workspace-operations.ts";
import {
  projectWorkspaceGatewayOperationDependencies,
  workspaceGatewayRuntimeCapabilities,
} from "./workspace-gateway-operation-adapter.ts";

export type WorkspaceGatewayOperationAutoSaveScheduler = {
  enqueue: (
    input: WorkspaceAutoSaveEnqueueInput & { workspaceRoot: string },
  ) => Promise<WorkspaceAutoSaveState>;
  recordGatewayOperationStateSuppressed: (input: {
    workspaceRoot: string;
  }) => Promise<WorkspaceAutoSaveState>;
  recordWorkspaceOperationSuppressed: (input: {
    operationInput: WorkspaceGatewayStartInput;
    workspaceRoot: string;
  }) => Promise<WorkspaceAutoSaveState | undefined>;
  status: (input: { workspaceRoot: string }) => Promise<WorkspaceAutoSaveState>;
};

export type WorkspaceAutoSaveSchedulerSaveInput = {
  dirtyGeneration: number;
  workspaceRoot: string;
  writeSources: readonly WorkspaceAutoSaveWriteSource[];
};

export type WorkspaceAutoSaveScheduler = {
  recordSuppressed: (input: {
    reason: WorkspaceAutoSaveSuppressionReason;
    workspaceRoot: string;
  }) => Promise<WorkspaceAutoSaveState>;
  runNow: (workspaceRoot: string) => Promise<WorkspaceAutoSaveState>;
} & WorkspaceGatewayOperationAutoSaveScheduler;

export type WorkspaceAutoSaveSchedulerDependencies = {
  clearTimeout?: (timer: WorkspaceAutoSaveTimer) => void;
  debounceMs?: number;
  maxRetries?: number;
  now: () => string;
  retryBackoffMs?: (retryCount: number) => number;
  save: (input: WorkspaceAutoSaveSchedulerSaveInput) => Promise<void>;
  setTimeout?: (callback: () => void, delayMs: number) => WorkspaceAutoSaveTimer;
};

export type WorkspaceDefaultAutoSaveSchedulerDependencies =
  RunFormlessWorkspaceOperationDependencies & {
    autoSaveDebounceMs?: number;
    autoSaveMaxRetries?: number;
    autoSaveRetryBackoffMs?: (retryCount: number) => number;
    operationCapabilities?: readonly WorkspaceOperationRequiredCapability[];
  };

type WorkspaceAutoSaveTimer = unknown;

export function createWorkspaceAutoSaveScheduler(
  dependencies: WorkspaceAutoSaveSchedulerDependencies,
): WorkspaceAutoSaveScheduler {
  const entries = new Map<
    string,
    { running?: Promise<void>; runAfterCurrent?: boolean; timer?: WorkspaceAutoSaveTimer }
  >();
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

  const status = async (input: { workspaceRoot: string }) => readAutoSaveState(input.workspaceRoot);

  const writeState = (workspaceRoot: string, state: WorkspaceAutoSaveState) =>
    writeInstanceWorkspaceAutoSaveState({
      localStateRoot: workspaceAutoSaveLocalStateRoot(workspaceRoot),
      state,
      workspaceRoot,
    });

  const recordSuppressed = async (input: {
    reason: WorkspaceAutoSaveSuppressionReason;
    workspaceRoot: string;
  }) => {
    const state = nextWorkspaceAutoSaveSuppressedState(
      await readAutoSaveState(input.workspaceRoot),
      {
        now: dependencies.now,
        reason: input.reason,
      },
    );

    await writeState(input.workspaceRoot, state);

    return state;
  };

  const schedule = (workspaceRoot: string, delayMs: number) => {
    const entry = schedulerEntry(entries, workspaceRoot);

    if (entry.timer !== undefined) {
      clearTimer(entry.timer);
    }

    entry.timer = setTimer(() => {
      entry.timer = undefined;
      void runAutoSave(workspaceRoot).catch(() => undefined);
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

  const runAutoSaveOnce = async (workspaceRoot: string) => {
    let state = await readAutoSaveState(workspaceRoot);

    if (state.dirtyGeneration <= state.savedGeneration) {
      return;
    }

    state = nextWorkspaceAutoSaveSuppressedState(
      nextWorkspaceAutoSaveSavingState(state, dependencies),
      {
        now: dependencies.now,
        reason: "auto-save",
      },
    );
    await writeState(workspaceRoot, state);

    try {
      await dependencies.save({
        dirtyGeneration: state.inFlightGeneration ?? state.dirtyGeneration,
        workspaceRoot,
        writeSources: state.writeSources,
      });

      state = nextWorkspaceAutoSaveSavedState(await readAutoSaveState(workspaceRoot), dependencies);
      await writeState(workspaceRoot, state);
    } catch (error) {
      state = nextWorkspaceAutoSaveFailedState(await readAutoSaveState(workspaceRoot), {
        error,
        now: dependencies.now,
        workspaceRoot,
      });
      await writeState(workspaceRoot, state);

      if (state.retryCount <= maxRetries) {
        schedule(workspaceRoot, retryBackoffMs(state.retryCount));
      }
    }
  };

  const readAutoSaveState = async (workspaceRoot: string): Promise<WorkspaceAutoSaveState> =>
    (await readInstanceWorkspaceAutoSaveState(workspaceAutoSaveLocalStateRoot(workspaceRoot))) ??
    initialWorkspaceAutoSaveState(dependencies);

  return {
    enqueue: async (input) => {
      const state = nextWorkspaceAutoSaveEnqueuedState(
        await readAutoSaveState(input.workspaceRoot),
        {
          now: dependencies.now,
          source: input.source,
        },
      );

      await writeState(input.workspaceRoot, state);
      schedule(input.workspaceRoot, debounceMs);

      return state;
    },
    recordGatewayOperationStateSuppressed: async (input) =>
      recordSuppressed({
        reason: "gateway-operation-state",
        workspaceRoot: input.workspaceRoot,
      }),
    recordSuppressed,
    recordWorkspaceOperationSuppressed: async (input) => {
      const reason = autoSaveSuppressionReasonForWorkspaceOperation(input.operationInput);

      if (reason === undefined) {
        return undefined;
      }

      return recordSuppressed({
        reason,
        workspaceRoot: input.workspaceRoot,
      });
    },
    runNow: async (workspaceRoot) => {
      await runAutoSave(workspaceRoot);

      return readAutoSaveState(workspaceRoot);
    },
    status,
  };
}

export function createDefaultWorkspaceAutoSaveScheduler(
  dependencies: WorkspaceDefaultAutoSaveSchedulerDependencies,
): WorkspaceAutoSaveScheduler {
  return createWorkspaceAutoSaveScheduler({
    debounceMs: dependencies.autoSaveDebounceMs,
    maxRetries: dependencies.autoSaveMaxRetries,
    now: dependencies.now,
    retryBackoffMs: dependencies.autoSaveRetryBackoffMs,
    save: async ({ workspaceRoot }) => {
      const operationInput = {
        kind: "save",
        workspacePath: workspaceRoot,
      } as const;
      const operation = await runFormlessWorkspaceOperation(
        operationInput,
        projectWorkspaceGatewayOperationDependencies(dependencies, operationInput, workspaceRoot),
        {
          actor: "system",
          capabilities: workspaceGatewayRuntimeCapabilities(dependencies),
        },
      );

      if (operation.status === "failed") {
        throw new Error(operation.errors[0]?.message ?? "Workspace auto-save failed.");
      }
    },
  });
}

export function workspaceAutoSaveLocalStateRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT);
}

function schedulerEntry(
  entries: Map<
    string,
    { running?: Promise<void>; runAfterCurrent?: boolean; timer?: WorkspaceAutoSaveTimer }
  >,
  workspaceRoot: string,
) {
  let entry = entries.get(workspaceRoot);

  if (!entry) {
    entry = {};
    entries.set(workspaceRoot, entry);
  }

  return entry;
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
