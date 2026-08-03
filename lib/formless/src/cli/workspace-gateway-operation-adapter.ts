import {
  isWorkspaceGatewayOperationKind,
  type WorkspaceGatewayOperation,
  type WorkspaceGatewayStartInput,
} from "@dpeek/formless-gateway";
import type { WorkspaceGatewaySidecarOperationHandlers } from "@dpeek/formless-gateway/sidecar";
import {
  WORKSPACE_OPERATION_CAPABILITIES,
  workspaceOperationEffectiveExecutionRequirements,
  type WorkspaceOperationExecutionRequirement,
  type WorkspaceOperationInput,
  type WorkspaceOperationRequiredCapability,
  type WorkspaceOperationState,
} from "@dpeek/formless-workspace";
import { readWorkspaceOperationState } from "@dpeek/formless-workspace/node";

import {
  runFormlessWorkspaceOperation,
  type RunFormlessWorkspaceOperationDependencies,
  type WorkspaceCredentialSetupOperationAdapterInput,
} from "./instance-workspace-operations.ts";
import type { FormlessCloudflareCredentialSetupResult } from "./instance-workspace-credential-setup.ts";
import type { WorkspaceGatewayOperationAutoSaveScheduler } from "./workspace-gateway-auto-save.ts";

export type WorkspaceGatewayCredentialSetupAdapterInput =
  WorkspaceCredentialSetupOperationAdapterInput;

export type WorkspaceGatewayCredentialSetupAdapterResult = FormlessCloudflareCredentialSetupResult;

export type WorkspaceGatewayOperationAdapterDependencies =
  RunFormlessWorkspaceOperationDependencies & {
    autoSaveScheduler: WorkspaceGatewayOperationAutoSaveScheduler;
    operationCapabilities?: readonly WorkspaceOperationRequiredCapability[];
  };

export function createWorkspaceGatewayOperationHandlers(
  dependencies: WorkspaceGatewayOperationAdapterDependencies,
): WorkspaceGatewaySidecarOperationHandlers {
  const autoSaveScheduler = dependencies.autoSaveScheduler;

  return {
    enqueueAutoSave: async ({ enqueue, workspaceRoot }) => {
      await autoSaveScheduler.enqueue({ ...enqueue, workspaceRoot });
    },
    readOperation: async ({ operationId, workspaceRoot }) => {
      await autoSaveScheduler.recordGatewayOperationStateSuppressed({ workspaceRoot });

      try {
        const operation = await readWorkspaceOperationState({
          operationId,
          workspaceRoot,
        });

        return workspaceGatewayOperationFromState(operation);
      } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
          return undefined;
        }

        throw error;
      }
    },
    startOperation: async ({ authorization, operationInput, workspaceRoot }) => {
      await autoSaveScheduler.recordGatewayOperationStateSuppressed({ workspaceRoot });
      const manualSaveGeneration = await autoSaveScheduler.recordWorkspaceOperationSuppressed({
        operationInput,
        workspaceRoot,
      });

      const scopedInput = workspaceGatewayOperationInputWithWorkspaceRoot(
        operationInput,
        workspaceRoot,
      );

      const operation = requireWorkspaceGatewayOperation(
        await runFormlessWorkspaceOperation(
          scopedInput,
          projectWorkspaceGatewayOperationDependencies(dependencies, scopedInput, workspaceRoot),
          {
            actor: authorization.actor,
            capabilities: workspaceGatewayRuntimeCapabilities(dependencies),
          },
        ),
      );

      if (manualSaveGeneration !== undefined && operation.status === "succeeded") {
        await autoSaveScheduler.recordSaved({
          throughGeneration: manualSaveGeneration,
          workspaceRoot,
        });
      }

      return operation;
    },
    status: async ({ authorization, workspaceRoot }) => {
      const operationStartInput = {
        includeDeploymentStatus: false,
        kind: "status",
      } as const;

      await autoSaveScheduler.recordWorkspaceOperationSuppressed({
        operationInput: operationStartInput,
        workspaceRoot,
      });

      const operationInput = {
        ...operationStartInput,
        workspacePath: workspaceRoot,
      } as const;

      return requireWorkspaceGatewayOperation(
        await runFormlessWorkspaceOperation(
          operationInput,
          projectWorkspaceGatewayOperationDependencies(dependencies, operationInput, workspaceRoot),
          {
            actor: authorization.actor,
            capabilities: workspaceGatewayRuntimeCapabilities(dependencies),
          },
        ),
      );
    },
  };
}

export function projectWorkspaceGatewayOperationDependencies(
  dependencies: RunFormlessWorkspaceOperationDependencies,
  operationInput: WorkspaceOperationInput,
  workspaceRoot: string,
): RunFormlessWorkspaceOperationDependencies {
  const requirements = workspaceOperationEffectiveExecutionRequirements(operationInput);
  const projected: RunFormlessWorkspaceOperationDependencies = {
    cwd: workspaceRoot,
    fetch: dependencies.fetch,
    now: dependencies.now,
  };

  if (dependencies.createOperationId !== undefined) {
    projected.createOperationId = dependencies.createOperationId;
  }

  if (shouldProjectEnv(requirements) && dependencies.env !== undefined) {
    projected.env = dependencies.env;
  }

  if (operationInput.kind === "credentialSetup" && dependencies.credentialSetup !== undefined) {
    projected.credentialSetup = dependencies.credentialSetup;
  }

  if (operationInput.kind === "push" && hasRequirement(requirements, "remote-target")) {
    if (dependencies.accountDiscovery !== undefined) {
      projected.accountDiscovery = dependencies.accountDiscovery;
    }

    if (dependencies.packageVersion !== undefined) {
      projected.packageVersion = dependencies.packageVersion;
    }
  }

  if (operationInput.kind === "push" && hasRequirement(requirements, "provider-credentials")) {
    if (dependencies.deploymentAdapter !== undefined) {
      projected.deploymentAdapter = dependencies.deploymentAdapter;
    }

    if (dependencies.healthCheck !== undefined) {
      projected.healthCheck = dependencies.healthCheck;
    }

    if (dependencies.localSecretEnv !== undefined) {
      projected.localSecretEnv = dependencies.localSecretEnv;
    }

    if (dependencies.packageRoot !== undefined) {
      projected.packageRoot = dependencies.packageRoot;
    }

    if (dependencies.randomToken !== undefined) {
      projected.randomToken = dependencies.randomToken;
    }

    if (dependencies.setupCapability !== undefined) {
      projected.setupCapability = dependencies.setupCapability;
    }
  }

  return projected;
}

export function workspaceGatewayRuntimeCapabilities(
  dependencies: Pick<WorkspaceGatewayOperationAdapterDependencies, "operationCapabilities">,
): readonly WorkspaceOperationRequiredCapability[] {
  return dependencies.operationCapabilities ?? WORKSPACE_OPERATION_CAPABILITIES;
}

function workspaceGatewayOperationInputWithWorkspaceRoot(
  input: WorkspaceGatewayStartInput,
  workspaceRoot: string,
): WorkspaceOperationInput {
  return {
    ...input,
    workspacePath: workspaceRoot,
  } as WorkspaceOperationInput;
}

function workspaceGatewayOperationFromState(
  operation: WorkspaceOperationState,
): WorkspaceGatewayOperation | undefined {
  if (!isWorkspaceGatewayOperationKind(operation.operation)) {
    return undefined;
  }

  return operation as WorkspaceGatewayOperation;
}

function requireWorkspaceGatewayOperation(
  operation: WorkspaceOperationState,
): WorkspaceGatewayOperation {
  const gatewayOperation = workspaceGatewayOperationFromState(operation);

  if (!gatewayOperation) {
    throw new Error(`Workspace gateway operation "${operation.operation}" is not supported.`);
  }

  return gatewayOperation;
}

function shouldProjectEnv(
  requirements: readonly WorkspaceOperationExecutionRequirement[],
): boolean {
  return (
    hasRequirement(requirements, "admin-token") ||
    hasRequirement(requirements, "provider-credentials") ||
    hasRequirement(requirements, "remote-target") ||
    hasRequirement(requirements, "workspace-source-write")
  );
}

function hasRequirement(
  requirements: readonly WorkspaceOperationExecutionRequirement[],
  requirement: WorkspaceOperationExecutionRequirement,
): boolean {
  return requirements.includes(requirement);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
