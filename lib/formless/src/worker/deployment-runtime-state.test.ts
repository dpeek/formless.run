import { describe, expect, it } from "vite-plus/test";
import {
  deriveDeployLatestStatus,
  materializeDeployDesiredStateVersion,
} from "@dpeek/formless-deploy";
import type { StoredRecord } from "@dpeek/formless-storage";
import {
  buildDeploymentDesiredStateVersion,
  INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
  readLatestDeploymentStatus,
} from "./deployment-runtime-state.ts";

describe("instance deployment runtime state", () => {
  it("builds deterministic desired-state versions without SQL storage tables", async () => {
    const targetId = INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID;
    const first = await buildDeploymentDesiredStateVersion({
      now: "2026-05-28T00:00:00.000Z",
      resourceGraph: {
        resources: [
          {
            dependencies: [],
            inputs: {
              apiToken: "secret-token",
              name: "app.example.com",
              zoneId: "zone-example",
            },
            kind: "cloudflare-worker-custom-domain",
            logicalId: "custom-domain:app.example.com",
            providerFamily: "cloudflare",
            targetId,
          },
          {
            dependencies: [],
            inputs: { name: "app.example.com", zoneId: "zone-example" },
            kind: "cloudflare-dns-records",
            logicalId: "dns:app.example.com",
            providerFamily: "cloudflare",
            targetId,
          },
        ],
        targetId,
      },
      source: { fingerprint: "intent:domain-app-example", intentRevision: 2 },
      targetId,
      title: "Primary instance target",
    });
    const second = await buildDeploymentDesiredStateVersion({
      now: "2026-05-28T00:05:00.000Z",
      resourceGraph: first.resourceGraph,
      source: first.source,
      targetId,
      title: "Primary instance target",
    });

    expect(first.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.versionId).toBe(`desired.${targetId}.${first.hash}`);
    expect(first.revision).toBe(2);
    expect(first.display).toEqual({
      resourceCount: 2,
      resourcesByKind: {
        "cloudflare-dns-records": 1,
        "cloudflare-worker-custom-domain": 1,
      },
      title: "Primary instance target",
    });
    expect(first.resourceGraph.resources.map((resource) => resource.logicalId)).toEqual([
      "custom-domain:app.example.com",
      "dns:app.example.com",
    ]);
    expect(JSON.stringify(first.resourceGraph)).not.toContain("secret-token");
    await expect(
      materializeDeployDesiredStateVersion({
        now: "2026-05-28T00:00:00.000Z",
        resourceGraph: first.resourceGraph,
        source: first.source,
        targetId,
        title: "Primary instance target",
      }),
    ).resolves.toMatchObject({
      display: first.display,
      hash: first.hash,
      revision: first.revision,
      versionId: first.versionId,
    });
    expect(second.hash).toBe(first.hash);
    expect(second.versionId).toBe(first.versionId);
  });

  it("derives latest deployment status from deployment-config observation fields", async () => {
    const targetId = INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID;
    const desiredState = await buildDeploymentDesiredStateVersion({
      now: "2026-05-28T00:00:00.000Z",
      resourceGraph: { resources: [], targetId },
      source: { fingerprint: "intent:empty", intentRevision: 0 },
      targetId,
    });
    const baseConfig = deploymentConfigRecord({
      observedDesiredStateHash: desiredState.hash,
    });

    expect(
      readLatestDeploymentStatus({
        desiredState,
        now: "2026-05-28T00:01:00.000Z",
        targetId,
      }),
    ).toEqual({
      checkedAt: "2026-05-28T00:01:00.000Z",
      state: "no-target",
    });
    expect(
      readLatestDeploymentStatus({
        deploymentConfig: deploymentConfigRecord(),
        desiredState,
        now: "2026-05-28T00:01:00.000Z",
        targetId,
      }),
    ).toMatchObject({
      latestDesiredState: {
        hash: desiredState.hash,
        revision: 0,
        targetId,
        versionId: desiredState.versionId,
      },
      state: "pending-changes",
      targetId,
    });
    expect(
      readLatestDeploymentStatus({
        deploymentConfig: deploymentConfigRecord({
          observedDesiredStateHash: `sha256:${"b".repeat(64)}`,
          observedStatus: "failed",
        }),
        desiredState,
        now: "2026-05-28T00:01:00.000Z",
        targetId,
      }),
    ).toMatchObject({
      state: "pending-changes",
      targetId,
    });
    const deployedInput = {
      deploymentConfig: deploymentConfigRecord({
        ...baseConfig.values,
        observedAt: "2026-05-28T00:02:00.000Z",
        observedStatus: "deployed",
      }),
      desiredState,
      now: "2026-05-28T00:03:00.000Z",
      targetId,
    };
    expect(readLatestDeploymentStatus(deployedInput)).toEqual(
      deriveDeployLatestStatus(deployedInput),
    );
    expect(readLatestDeploymentStatus(deployedInput)).toMatchObject({
      deployedAt: "2026-05-28T00:02:00.000Z",
      state: "deployed",
      targetId,
    });
    expect(
      readLatestDeploymentStatus({
        deploymentConfig: deploymentConfigRecord({
          ...baseConfig.values,
          observedAt: "2026-05-28T00:04:00.000Z",
          observedFailureCode: "provider-reconciliation-failed",
          observedStatus: "failed",
        }),
        desiredState,
        now: "2026-05-28T00:05:00.000Z",
        targetId,
      }),
    ).toMatchObject({
      failedAt: "2026-05-28T00:04:00.000Z",
      failureCode: "provider-reconciliation-failed",
      state: "failed-current-version",
      targetId,
    });
    expect(
      readLatestDeploymentStatus({
        deploymentConfig: deploymentConfigRecord({
          ...baseConfig.values,
          observedStatus: "drifted",
        }),
        desiredState,
        now: "2026-05-28T00:05:00.000Z",
        targetId,
      }),
    ).toMatchObject({
      state: "drift",
      targetId,
    });
  });
});

function deploymentConfigRecord(values: Record<string, unknown> = {}): StoredRecord {
  return {
    createdAt: "2026-05-28T00:00:00.000Z",
    updatedAt: "2026-05-28T00:00:00.000Z",
    entity: "deployment-config",
    id: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
    values: {
      enabled: true,
      label: "Primary",
      providerFamily: "cloudflare",
      targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
      targetUrl: "https://primary.example.workers.dev",
      ...values,
    },
  };
}
