import path from "node:path";

import {
  WORKSPACE_OPERATION_CAPABILITIES,
  assertWorkspaceOperationExecutionAllowed,
  assertWorkspaceOperationExecutionRequirements,
  workspaceOperationInputDisplay,
  type WorkspaceOperationEvent,
  type WorkspaceOperationActor,
  type WorkspaceOperationDisplayObject,
  type WorkspaceOperationInput,
  type WorkspaceOperationRequiredCapability,
  type WorkspaceOperationResult,
  type WorkspaceOperationState,
  type WorkspaceOperationStatus,
  type WorkspaceOperationStep,
} from "@dpeek/formless-workspace";
import {
  createWorkspaceOperationState,
  updateWorkspaceOperationState,
} from "@dpeek/formless-workspace/node";

import type { DeployLocalFormlessWorkspaceDependencies } from "./instance-workspace-deployment.ts";
import { resolveFormlessInstanceWorkspaceRoot } from "./instance-workspace-foundation.ts";
import {
  runWorkspaceOperationDomainHandler,
  type WorkspaceOperationDomainHandlerResult,
} from "./instance-workspace-operation-handlers.ts";

export type WorkspaceCredentialSetupOperationAdapterInput = {
  accountId?: string | undefined;
  profileLabel?: string | undefined;
  provider: "cloudflare";
  workspaceRoot: string;
};

export type WorkspaceCredentialSetupOperationAdapterResult = {
  continue?: () => Promise<WorkspaceCredentialSetupOperationAdapterResult>;
  events?: readonly Omit<WorkspaceOperationEvent, "id">[];
  result?: WorkspaceOperationResult;
  status?: WorkspaceOperationStatus;
};

export type RunFormlessWorkspaceOperationDependencies = Pick<
  DeployLocalFormlessWorkspaceDependencies,
  "cwd" | "fetch" | "now"
> &
  Partial<Omit<DeployLocalFormlessWorkspaceDependencies, "cwd" | "fetch" | "now">> & {
    createOperationId?: () => string;
    credentialSetup?: (
      input: WorkspaceCredentialSetupOperationAdapterInput,
    ) => Promise<WorkspaceCredentialSetupOperationAdapterResult>;
  };

export async function runFormlessWorkspaceOperation(
  input: WorkspaceOperationInput,
  dependencies: RunFormlessWorkspaceOperationDependencies,
  options: {
    actor?: WorkspaceOperationActor;
    capabilities?: readonly WorkspaceOperationRequiredCapability[];
  } = {},
): Promise<WorkspaceOperationState> {
  const actor = options.actor ?? "system";

  assertWorkspaceOperationExecutionRequirements(input);
  assertWorkspaceOperationExecutionAllowed({
    actor,
    capabilities: options.capabilities ?? WORKSPACE_OPERATION_CAPABILITIES,
    kind: input.kind,
  });

  const workspaceRoot = await resolveWorkspaceOperationRoot(input, dependencies);
  let state = await createWorkspaceOperationState({
    actor,
    id: dependencies.createOperationId?.(),
    input: workspaceOperationInputDisplay(input),
    now: dependencies.now,
    operation: input.kind,
    workspaceRoot,
  });

  state = await updateWorkspaceOperationState(state.id, {
    logs: [{ at: dependencies.now(), level: "info", message: `${input.kind} started.` }],
    status: "running",
    workspaceRoot,
  });

  try {
    const execution = await runWorkspaceOperationDomainHandler(input, dependencies, {
      workspaceRoot,
    });

    return await completeWorkspaceOperationExecution({
      dependencies,
      execution,
      operation: input.kind,
      operationId: state.id,
      workspaceRoot,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failureSteps = failureWorkspaceOperationSteps(input, error);

    return updateWorkspaceOperationState(state.id, {
      errors: [{ message }],
      logs: [{ at: dependencies.now(), level: "error", message }],
      status: "failed",
      ...(failureSteps === undefined ? {} : { steps: failureSteps }),
      summary: {
        fields: failureWorkspaceOperationSummaryFields(message, error),
        title: "Operation failed",
      },
      workspaceRoot,
    });
  }
}

async function completeWorkspaceOperationExecution(input: {
  dependencies: Pick<RunFormlessWorkspaceOperationDependencies, "now">;
  execution: WorkspaceOperationDomainHandlerResult;
  operation: WorkspaceOperationInput["kind"];
  operationId: string;
  workspaceRoot: string;
}): Promise<WorkspaceOperationState> {
  const execution = normalizeWorkspaceOperationDomainResult(input.execution);
  const state = await updateWorkspaceOperationState(input.operationId, {
    ...(execution.events === undefined ? {} : { events: execution.events }),
    logs: [
      {
        at: input.dependencies.now(),
        level: "info",
        message:
          execution.logMessage ??
          workspaceOperationCompletionLogMessage(input.operation, execution.status),
      },
    ],
    result: execution.result,
    ...(execution.result.steps === undefined ? {} : { steps: execution.result.steps }),
    status: execution.status,
    summary: execution.result.summary,
    workspaceRoot: input.workspaceRoot,
  });

  if (execution.status === "running" && execution.continue) {
    void continueWorkspaceOperationExecution({
      continueExecution: execution.continue,
      dependencies: input.dependencies,
      operation: input.operation,
      operationId: input.operationId,
      workspaceRoot: input.workspaceRoot,
    });
  }

  return state;
}

async function continueWorkspaceOperationExecution(input: {
  continueExecution: () => Promise<WorkspaceOperationDomainHandlerResult>;
  dependencies: Pick<RunFormlessWorkspaceOperationDependencies, "now">;
  operation: WorkspaceOperationInput["kind"];
  operationId: string;
  workspaceRoot: string;
}): Promise<WorkspaceOperationState> {
  try {
    const execution = await input.continueExecution();

    return await completeWorkspaceOperationExecution({
      dependencies: input.dependencies,
      execution,
      operation: input.operation,
      operationId: input.operationId,
      workspaceRoot: input.workspaceRoot,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return updateWorkspaceOperationState(input.operationId, {
      errors: [{ message }],
      logs: [{ at: input.dependencies.now(), level: "error", message }],
      status: "failed",
      summary: {
        fields: { error: message },
        title: "Operation failed",
      },
      workspaceRoot: input.workspaceRoot,
    });
  }
}

type NormalizedWorkspaceOperationDomainResult = {
  continue?: () => Promise<WorkspaceOperationDomainHandlerResult>;
  events?: readonly Omit<WorkspaceOperationEvent, "id">[];
  logMessage?: string;
  result: WorkspaceOperationResult;
  status: WorkspaceOperationStatus;
};

function normalizeWorkspaceOperationDomainResult(
  execution: WorkspaceOperationDomainHandlerResult,
): NormalizedWorkspaceOperationDomainResult {
  if ("result" in execution) {
    return {
      ...execution,
      status: execution.status ?? "succeeded",
    };
  }

  return {
    result: execution,
    status: "succeeded",
  };
}

function workspaceOperationCompletionLogMessage(
  operation: WorkspaceOperationInput["kind"],
  status: WorkspaceOperationStatus,
): string {
  switch (status) {
    case "failed":
      return `${operation} failed.`;
    case "queued":
      return `${operation} queued.`;
    case "running":
      return `${operation} awaiting continuation.`;
    case "succeeded":
      return `${operation} completed.`;
  }
}

async function resolveWorkspaceOperationRoot(
  input: WorkspaceOperationInput,
  dependencies: Pick<RunFormlessWorkspaceOperationDependencies, "cwd">,
): Promise<string> {
  if (input.kind === "init") {
    return path.resolve(dependencies.cwd, input.workspacePath ?? ".");
  }

  if (input.kind === "status") {
    try {
      return await resolveFormlessInstanceWorkspaceRoot({
        cwd: dependencies.cwd,
        workspacePath: input.workspacePath,
      });
    } catch (error) {
      if (input.workspacePath !== undefined && input.workspacePath !== null) {
        return path.resolve(dependencies.cwd, input.workspacePath);
      }

      if (error instanceof Error && error.message.includes("Could not find formless.ts")) {
        return path.resolve(dependencies.cwd);
      }

      throw error;
    }
  }

  return resolveFormlessInstanceWorkspaceRoot({
    cwd: dependencies.cwd,
    workspacePath: input.workspacePath,
  });
}

function failureWorkspaceOperationSteps(
  input: WorkspaceOperationInput,
  error: unknown,
): WorkspaceOperationStep[] | undefined {
  void input;
  void error;

  return undefined;
}

function failureWorkspaceOperationSummaryFields(
  message: string,
  error: unknown,
): WorkspaceOperationDisplayObject {
  void error;

  return { error: message };
}
