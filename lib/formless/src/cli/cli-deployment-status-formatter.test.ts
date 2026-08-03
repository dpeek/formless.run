import { describe, expect, it } from "vite-plus/test";

import type { DeployDesiredStateVersionRef, DeployLatestStatus } from "@dpeek/formless-deploy";
import { formatCliDeploymentStatus } from "./cli-deployment-status-formatter.ts";

describe("deployment-status CLI formatter", () => {
  it("maps every semantic latest status to fixed CLI copy and tone", () => {
    const statuses: Array<{
      expected: ReturnType<typeof formatCliDeploymentStatus>;
      status: DeployLatestStatus;
    }> = [
      {
        expected: {
          detail: "No desired-state version has been recorded",
          label: "No deployment state",
          state: "no-target",
          tone: "neutral",
        },
        status: {
          checkedAt: "2026-08-03T00:00:00.000Z",
          state: "no-target",
        },
      },
      {
        expected: {
          detail: "Desired revision 3 pending",
          label: "Pending changes",
          state: "pending-changes",
          tone: "warning",
        },
        status: {
          checkedAt: "2026-08-03T00:00:00.000Z",
          latestDesiredState: desiredState(3),
          state: "pending-changes",
          targetId: "instance.primary",
        },
      },
      {
        expected: {
          detail: "Desired revision 3 pending; deployed revision 2",
          label: "Pending changes",
          state: "pending-changes",
          tone: "warning",
        },
        status: {
          checkedAt: "2026-08-03T00:00:00.000Z",
          latestDesiredState: desiredState(3),
          latestSuccessfulDesiredState: desiredState(2),
          state: "pending-changes",
          targetId: "instance.primary",
        },
      },
      {
        expected: {
          detail: "Revision 3 deployed at 2026-08-03T00:01:00.000Z",
          label: "Deployed",
          state: "deployed",
          tone: "success",
        },
        status: {
          checkedAt: "2026-08-03T00:02:00.000Z",
          deployedAt: "2026-08-03T00:01:00.000Z",
          latestDesiredState: desiredState(3),
          state: "deployed",
          targetId: "instance.primary",
        },
      },
      {
        expected: {
          detail: "Revision 3: Provider reconciliation failed",
          label: "Failed current version",
          state: "failed-current-version",
          tone: "danger",
        },
        status: {
          checkedAt: "2026-08-03T00:02:00.000Z",
          failedAt: "2026-08-03T00:01:00.000Z",
          failureCode: "provider-reconciliation-failed",
          latestDesiredState: desiredState(3),
          state: "failed-current-version",
          targetId: "instance.primary",
        },
      },
      {
        expected: {
          detail: "Latest observation reports drift",
          label: "Drift detected",
          state: "drift",
          tone: "warning",
        },
        status: {
          checkedAt: "2026-08-03T00:02:00.000Z",
          latestDesiredState: desiredState(3),
          state: "drift",
          targetId: "instance.primary",
        },
      },
    ];

    for (const { expected, status } of statuses) {
      expect(formatCliDeploymentStatus(status)).toEqual(expected);
    }
  });
});

function desiredState(revision: number): DeployDesiredStateVersionRef {
  return {
    hash: `sha256:${revision}`,
    revision,
    targetId: "instance.primary",
    versionId: `instance.primary@${revision}`,
  };
}
