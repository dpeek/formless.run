import { describe, expect, it } from "vite-plus/test";

import {
  DEPLOY_CONTROL_PLANE_ACTOR_HEADER,
  DEPLOYMENT_API_ROUTE_PREFIX,
  DEPLOYMENT_DESIRED_STATE_API_PATH,
  DEPLOYMENT_STATUS_API_PATH,
  deployControlPlaneActorHeaders,
  deployControlPlaneBootstrapPath,
  deployControlPlaneRecordsByEntity,
  deployDeploymentObservationPatchIdempotencyKey,
  deployDeploymentObservationPatchValues,
  deployDesiredStateVersionRef,
  parseDeployDesiredStateResponse,
  parseDeployDesiredStateVersionRef,
  parseDeployLatestStatusResponse,
  type DeployControlPlaneRecord,
  type DeployDeploymentObservationPatch,
} from "./client.ts";

describe("Deploy control-plane client helpers", () => {
  it("builds actor-scoped control-plane bootstrap requests", () => {
    expect(deployControlPlaneBootstrapPath()).toBe("/api/formless/control-plane/bootstrap");
    expect(deployControlPlaneBootstrapPath("runner")).toBe(
      "/api/formless/control-plane/bootstrap?actorKind=runner",
    );
    expect(deployControlPlaneBootstrapPath("runner", "/api/formless/program")).toBe(
      "/api/formless/program/bootstrap?actorKind=runner",
    );
    expect(deployControlPlaneActorHeaders("cliDeployer")).toEqual({
      [DEPLOY_CONTROL_PLANE_ACTOR_HEADER]: "cliDeployer",
    });
  });

  it("declares desired-state and status read paths", () => {
    expect(DEPLOYMENT_API_ROUTE_PREFIX).toBe("/api/formless/deployments");
    expect(DEPLOYMENT_DESIRED_STATE_API_PATH).toBe("/api/formless/deployments/desired-state");
    expect(DEPLOYMENT_STATUS_API_PATH).toBe("/api/formless/deployments/status");
  });

  it("filters active control-plane records by entity", () => {
    const records = [
      { entity: "appInstall", id: "site", values: {} },
      { entity: "appRoute", id: "site-admin", values: {} },
      { deletedAt: "2026-05-31T00:00:00.000Z", entity: "appRoute", id: "old", values: {} },
    ] satisfies DeployControlPlaneRecord[];

    expect(
      deployControlPlaneRecordsByEntity(records, "appRoute").map((record) => record.id),
    ).toEqual(["site-admin"]);
  });

  it("binds command inputs to an exact desired-state version reference", () => {
    expect(
      deployDesiredStateVersionRef({
        createdAt: "2026-06-01T00:00:00.000Z",
        hash: `sha256:${"a".repeat(64)}`,
        revision: 7,
        targetId: "instance.primary",
        versionId: "desired.instance.primary.7",
      }),
    ).toEqual({
      hash: `sha256:${"a".repeat(64)}`,
      revision: 7,
      targetId: "instance.primary",
      versionId: "desired.instance.primary.7",
    });
  });

  it("parses desired-state refs and deployment response envelopes", () => {
    const versionRef = {
      hash: `sha256:${"a".repeat(64)}`,
      revision: 7,
      targetId: "instance.primary",
      versionId: "desired.instance.primary.7",
    };

    expect(parseDeployDesiredStateVersionRef("Desired state", versionRef)).toEqual(versionRef);
    expect(() =>
      parseDeployDesiredStateVersionRef("Desired state", { ...versionRef, extra: true }),
    ).toThrow('Desired state has unsupported key "extra".');
    expect(
      parseDeployDesiredStateResponse(
        {
          desiredState: {
            ...versionRef,
            createdAt: "2026-06-01T00:00:00.000Z",
            display: { resourceCount: 0, resourcesByKind: {} },
            resourceGraph: { resources: [], targetId: "instance.primary" },
            schemaVersion: 1,
            source: { fingerprint: "control-plane:abc", intentRevision: 7 },
          },
          target: { targetId: "instance.primary" },
        },
        "GET /api/formless/deployments/desired-state",
      ).target.targetId,
    ).toBe("instance.primary");
    expect(
      parseDeployLatestStatusResponse(
        {
          status: { checkedAt: "2026-06-01T00:00:00.000Z", state: "no-target" },
          target: { targetId: "instance.primary" },
        },
        "GET /api/formless/deployments/status",
      ).status.state,
    ).toBe("no-target");
  });

  it("builds display-safe observation patch values", () => {
    const observation = {
      observedAt: "2026-06-11T01:00:00.000Z",
      observedDesiredStateHash: `sha256:${"b".repeat(64)}`,
      observedError: null,
      observedRunnerId: "local-gateway",
      observedStatus: "deployed",
      observedSummary: null,
    } satisfies DeployDeploymentObservationPatch;

    expect(deployDeploymentObservationPatchValues(observation)).toEqual({
      observedAt: "2026-06-11T01:00:00.000Z",
      observedDesiredStateHash: `sha256:${"b".repeat(64)}`,
      observedError: "",
      observedRunnerId: "local-gateway",
      observedStatus: "deployed",
      observedSummary: "",
    });
    expect(
      deployDeploymentObservationPatchIdempotencyKey({
        observation,
        targetId: "instance.primary",
      }),
    ).toBe(
      `deployment-observation:instance.primary:sha256:${"b".repeat(64)}:deployed:2026-06-11T01:00:00.000Z`,
    );
  });
});
