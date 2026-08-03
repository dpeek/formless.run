import {
  type DeploymentRefreshWorkspaceOperationInput,
  type WorkspaceOperationResult,
  type WorkspaceOperationStep,
} from "@dpeek/formless-workspace";

import {
  refreshFormlessInstanceDeploymentObservation,
  type RefreshFormlessInstanceDeploymentObservationResult,
} from "./instance-workspace-deployment.ts";
import type { RunFormlessWorkspaceOperationDependencies } from "./instance-workspace-operations.ts";

export async function runDeploymentRefreshWorkspaceOperation(
  input: DeploymentRefreshWorkspaceOperationInput,
  dependencies: RunFormlessWorkspaceOperationDependencies,
): Promise<WorkspaceOperationResult> {
  return summarizeDeploymentRefreshResult(
    await refreshFormlessInstanceDeploymentObservation(
      {
        targetAlias: input.targetAlias,
        workspacePath: input.workspacePath ?? undefined,
      },
      dependencies,
    ),
  );
}

function summarizeDeploymentRefreshResult(
  result: RefreshFormlessInstanceDeploymentObservationResult,
): WorkspaceOperationResult {
  return {
    deployment: {
      observation: {
        desiredState: result.observation.desiredState,
        observedAt: result.observation.observedAt,
        ...(result.observation.observedFailureCode === undefined
          ? {}
          : { observedFailureCode: result.observation.observedFailureCode }),
        observedStatus: result.observation.observedStatus,
        resourceCount: result.observation.resourceCount,
        resourcesByKind: result.observation.resourcesByKind,
        targetId: result.observation.targetId,
      },
      status: result.deploymentStatus,
      targetAlias: result.selectedTarget.alias,
    },
    summary: {
      fields: {
        desiredStateVersion: result.observation.desiredState.versionId,
        observedStatus: result.observation.observedStatus,
        status: result.deploymentStatus.state,
        target: result.selectedTarget.alias,
      },
      title: "Deployment observation refreshed",
    },
    steps: deploymentRefreshOperationSteps(result),
  };
}

type DeploymentOperationStepId =
  | "account-selection"
  | "credentials"
  | "desired-state-plan"
  | "health-check"
  | "observation-refresh"
  | "owner-setup"
  | "provider-reconciliation"
  | "workspace-push-writeback";

type DeploymentOperationStepInput = Omit<WorkspaceOperationStep, "id" | "label">;

const deploymentOperationStepLabels = {
  "account-selection": "Account selection",
  credentials: "Credentials",
  "desired-state-plan": "Desired-state plan",
  "health-check": "Health check",
  "observation-refresh": "Observation refresh",
  "owner-setup": "Owner setup",
  "provider-reconciliation": "Provider reconciliation",
  "workspace-push-writeback": "Workspace push/writeback",
} satisfies Record<DeploymentOperationStepId, string>;

const deploymentOperationStepOrder = [
  "credentials",
  "account-selection",
  "desired-state-plan",
  "provider-reconciliation",
  "health-check",
  "owner-setup",
  "workspace-push-writeback",
  "observation-refresh",
] satisfies DeploymentOperationStepId[];

function deploymentRefreshOperationSteps(
  result: RefreshFormlessInstanceDeploymentObservationResult,
): WorkspaceOperationStep[] {
  return deploymentOperationSteps({
    "account-selection": {
      detail: "Account selection is not required for observation refresh.",
      status: "skipped",
    },
    credentials: {
      detail: "Credentials were resolved from local workspace state.",
      status: "succeeded",
    },
    "desired-state-plan": {
      fields: {
        desiredStateVersion: result.observation.desiredState.versionId,
        target: result.selectedTarget.alias,
      },
      status: "succeeded",
    },
    "health-check": {
      detail: "Health check is not required for observation refresh.",
      status: "skipped",
    },
    "observation-refresh": {
      fields: {
        observedAt: result.observation.observedAt,
        observedStatus: result.observation.observedStatus,
        status: result.deploymentStatus.state,
      },
      status: "succeeded",
    },
    "owner-setup": {
      detail: "Owner setup is not required for observation refresh.",
      status: "skipped",
    },
    "provider-reconciliation": {
      detail: "Provider reconciliation is not required for observation refresh.",
      status: "skipped",
    },
    "workspace-push-writeback": {
      detail: "Workspace push/writeback is not required for observation refresh.",
      status: "skipped",
    },
  });
}

function deploymentOperationSteps(
  steps: Record<DeploymentOperationStepId, DeploymentOperationStepInput>,
): WorkspaceOperationStep[] {
  return deploymentOperationStepOrder.map((id) => ({
    id,
    label: deploymentOperationStepLabels[id],
    ...steps[id],
  }));
}
