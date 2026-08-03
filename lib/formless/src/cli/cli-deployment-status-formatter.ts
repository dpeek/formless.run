import type {
  DeployDeploymentObservationFailureCode,
  DeployLatestStatus,
} from "@dpeek/formless-deploy";

export type CliDeploymentStatusTone = "danger" | "neutral" | "success" | "warning";

export type CliDeploymentStatusDisplay = {
  detail: string;
  label: string;
  state: DeployLatestStatus["state"];
  tone: CliDeploymentStatusTone;
};

export function formatCliDeploymentStatus(status: DeployLatestStatus): CliDeploymentStatusDisplay {
  switch (status.state) {
    case "no-target":
      return {
        detail: "No desired-state version has been recorded",
        label: "No deployment state",
        state: status.state,
        tone: "neutral",
      };
    case "pending-changes":
      return {
        detail: status.latestSuccessfulDesiredState
          ? `Desired revision ${status.latestDesiredState.revision} pending; deployed revision ${status.latestSuccessfulDesiredState.revision}`
          : `Desired revision ${status.latestDesiredState.revision} pending`,
        label: "Pending changes",
        state: status.state,
        tone: "warning",
      };
    case "deployed":
      return {
        detail: `Revision ${status.latestDesiredState.revision} deployed at ${status.deployedAt}`,
        label: "Deployed",
        state: status.state,
        tone: "success",
      };
    case "failed-current-version":
      return {
        detail: `Revision ${status.latestDesiredState.revision}: ${formatCliDeploymentFailureCode(status.failureCode)}`,
        label: "Failed current version",
        state: status.state,
        tone: "danger",
      };
    case "drift":
      return {
        detail: "Latest observation reports drift",
        label: "Drift detected",
        state: status.state,
        tone: "warning",
      };
  }
}

function formatCliDeploymentFailureCode(
  failureCode: DeployDeploymentObservationFailureCode,
): string {
  switch (failureCode) {
    case "provider-reconciliation-failed":
      return "Provider reconciliation failed";
  }
}
