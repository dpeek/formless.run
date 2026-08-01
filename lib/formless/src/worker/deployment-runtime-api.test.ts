import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { BootstrapResponse } from "../shared/protocol.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import { FORMLESS_PROGRAM_API_ROUTE_PREFIX } from "../program/target.ts";
import {
  INSTANCE_DEPLOYMENT_ATTEMPT_FAILURE_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_HEARTBEAT_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_PLAN_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_SUCCESS_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_START_API_PATH,
  INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH,
  INSTANCE_DEPLOYMENT_DRIFT_API_PATH,
  INSTANCE_DEPLOYMENT_STATUS_API_PATH,
  type InstanceDeploymentDesiredStateResponse,
  type InstanceDeploymentStatusResponse,
} from "../shared/deployment-runtime.ts";
import { INTERNAL_RESET_INSTANCE_DEPLOYMENT_RUNTIME_PATH } from "./deployment-runtime-api.ts";
import { INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID } from "./deployment-runtime-state.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import {
  instanceControlPlaneTestStorageSnapshot,
  operationWriteRequest,
  restoreTestStorageSnapshot,
} from "../test/authority-write.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";

let harness: Harness;
let controlPlaneOperationCounter = 0;

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  controlPlaneOperationCounter = 0;
  await resetWorkerState();
});

afterAll(async () => {
  await harness.dispose();
});

function createHarness() {
  return createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: {
        ALCHEMY_PASSWORD: "secret-alchemy-password",
        CLOUDFLARE_API_TOKEN: "secret-cloudflare-token",
        FORMLESS_ADMIN_TOKEN: adminToken,
        FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID: "primary",
        FORMLESS_DOMAIN_PROVIDER_WORKER_NAME: "formless-primary",
      },
    },
  );
}

describe("instance deployment runtime API routes", () => {
  it("reads the primary desired-state projection without provider secrets", async () => {
    const first = await getJson<InstanceDeploymentDesiredStateResponse>(
      INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH,
    );
    const second = await getJson<InstanceDeploymentDesiredStateResponse>(
      INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH,
    );
    const serialized = JSON.stringify(first.body);

    expect(first.response.headers.get("Cache-Control")).toBe("no-store");
    expect(first.body.target).toEqual({
      label: "Primary instance target",
      targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
    });
    expect(first.body.desiredState).toMatchObject({
      display: {
        resourceCount: 0,
        resourcesByKind: {},
        title: "Primary instance target",
      },
      resourceGraph: {
        resources: [],
        targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
      },
      revision: 0,
      schemaVersion: 1,
      source: {
        fingerprint: expect.stringMatching(/^control-plane:/),
        intentRevision: 0,
      },
      targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
    });
    expect(first.body.desiredState.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.body.desiredState.versionId).toBe(
      `desired.${INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID}.${first.body.desiredState.hash}`,
    );
    expect(first.body.desiredState.createdAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(second.body.desiredState).toMatchObject({
      display: first.body.desiredState.display,
      hash: first.body.desiredState.hash,
      resourceGraph: first.body.desiredState.resourceGraph,
      revision: first.body.desiredState.revision,
      source: first.body.desiredState.source,
      versionId: first.body.desiredState.versionId,
    });
    expect(serialized).not.toContain("secret-cloudflare-token");
    expect(serialized).not.toContain("secret-alchemy-password");
  });

  it("projects enabled custom-domain mappings into desired-state resources", async () => {
    await createControlPlaneRecord("route", {
      enabled: false,
      kind: "mount",
      matchHost: "disabled.example.com",
      matchPath: "/",
      matchPrefix: "/",
      targetProfile: "instance",
    });
    await createControlPlaneRecord("route", {
      enabled: true,
      kind: "mount",
      matchHost: "admin.example.com",
      matchPath: "/",
      matchPrefix: "/",
      targetProfile: "instance",
    });
    await createControlPlaneRecord("route", {
      enabled: true,
      kind: "mount",
      matchHost: "www.example.com",
      matchPath: "/",
      matchPrefix: "/",
      surface: "public-site",
      targetProfile: "public-site",
    });

    const desired = await getJson<InstanceDeploymentDesiredStateResponse>(
      INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH,
    );
    const serialized = JSON.stringify(desired.body);

    expect(desired.body.desiredState.display).toEqual({
      resourceCount: 2,
      resourcesByKind: { "cloudflare-worker-custom-domain": 2 },
      title: "Primary instance target",
    });
    expect(
      desired.body.desiredState.resourceGraph.resources.map((resource) => ({
        inputs: resource.inputs,
        kind: resource.kind,
        logicalId: resource.logicalId,
        providerFamily: resource.providerFamily,
        targetId: resource.targetId,
      })),
    ).toEqual([
      {
        inputs: {
          adopt: false,
          host: "admin.example.com",
          name: "admin.example.com",
          overrideExistingOrigin: false,
          profile: "instance",
          workerName: "formless-primary",
        },
        kind: "cloudflare-worker-custom-domain",
        logicalId: "primary-custom-domain-admin-example-com-instance",
        providerFamily: "cloudflare",
        targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
      },
      {
        inputs: {
          adopt: false,
          host: "www.example.com",
          name: "www.example.com",
          overrideExistingOrigin: false,
          profile: "publicSite",
          workerName: "formless-primary",
        },
        kind: "cloudflare-worker-custom-domain",
        logicalId: "primary-custom-domain-www-example-com-publicsite",
        providerFamily: "cloudflare",
        targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
      },
    ]);
    expect(desired.body.desiredState.source).toMatchObject({
      fingerprint: expect.stringMatching(/^control-plane:/),
      intentRevision: 2,
    });
    expect(serialized).not.toContain("disabled.example.com");
    expect(serialized).not.toContain("secret-cloudflare-token");
    expect(serialized).not.toContain("secret-alchemy-password");
  });

  it("projects enabled redirect intent into desired-state resources", async () => {
    await createRedirectRoute({
      enabled: false,
      fromHost: "disabled.example.com",
      toHost: "example.com",
    });
    await createRedirectRoute({
      fromHost: "www.example.com",
      toHost: "example.com",
    });
    await createRedirectRoute({
      fromHost: "docs.example.com",
      preservePath: false,
      preserveQueryString: false,
      statusCode: 302,
      toUrl: "https://example.com/docs/?utm=ignored",
    });

    const desired = await getJson<InstanceDeploymentDesiredStateResponse>(
      INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH,
    );
    const serialized = JSON.stringify(desired.body);

    expect(desired.body.desiredState.display).toEqual({
      resourceCount: 2,
      resourcesByKind: {
        "cloudflare-worker-custom-domain": 2,
      },
      title: "Primary instance target",
    });
    expect(
      desired.body.desiredState.resourceGraph.resources.map((resource) => ({
        dependencies: resource.dependencies,
        inputs: resource.inputs,
        kind: resource.kind,
        logicalId: resource.logicalId,
        providerFamily: resource.providerFamily,
        targetId: resource.targetId,
      })),
    ).toEqual([
      {
        dependencies: [],
        inputs: {
          adopt: false,
          host: "docs.example.com",
          name: "docs.example.com",
          overrideExistingOrigin: false,
          workerName: "formless-primary",
        },
        kind: "cloudflare-worker-custom-domain",
        logicalId: "primary-redirect-custom-domain-docs-example-com",
        providerFamily: "cloudflare",
        targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
      },
      {
        dependencies: [],
        inputs: {
          adopt: false,
          host: "www.example.com",
          name: "www.example.com",
          overrideExistingOrigin: false,
          workerName: "formless-primary",
        },
        kind: "cloudflare-worker-custom-domain",
        logicalId: "primary-redirect-custom-domain-www-example-com",
        providerFamily: "cloudflare",
        targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
      },
    ]);
    expect(desired.body.desiredState.source).toMatchObject({
      fingerprint: expect.stringMatching(/^control-plane:/),
      intentRevision: 2,
    });
    expect(serialized).not.toContain("disabled.example.com");
    expect(serialized).not.toContain("secret-cloudflare-token");
    expect(serialized).not.toContain("secret-alchemy-password");
  });

  it("does not materialize projected desired resources as control-plane records", async () => {
    await createControlPlaneRecord("route", {
      enabled: true,
      kind: "mount",
      matchHost: "admin.example.com",
      matchPath: "/",
      matchPrefix: "/",
      surface: "admin",
      targetProfile: "instance",
    });
    await createRedirectRoute({
      fromHost: "www.example.com",
      toHost: "example.com",
    });

    const desired = await getJson<InstanceDeploymentDesiredStateResponse>(
      INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH,
    );
    const controlPlane = await getJson<BootstrapResponse>(
      `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/bootstrap?actorKind=runner`,
    );
    const serializedControlPlane = JSON.stringify(controlPlane.body.records);

    expect(desired.body.desiredState.resourceGraph.resources).toHaveLength(2);
    expect(serializedControlPlane).not.toContain("deploy-desired-resource");
    expect(JSON.stringify(controlPlane.body.records)).not.toContain("secret-cloudflare-token");
    expect(JSON.stringify(controlPlane.body.records)).not.toContain("secret-alchemy-password");
  });

  it("projects provider resources directly from route records without route timestamps or secrets", async () => {
    const deploymentConfig = await createControlPlaneRecord("deployment-config", {
      targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
      label: "Cloudflare primary",
      enabled: true,
      targetUrl: "https://direct.example.workers.dev",
      providerFamily: "cloudflare",
      credentialRef: "secret:cloudflare:primary",
      workerName: "config-worker",
    });
    expect(deploymentConfig.response.status).toBe(200);

    const enabledRoute = await createControlPlaneRecord("route", {
      enabled: true,
      kind: "mount",
      matchHost: "direct.example.com",
      matchPath: "/",
      matchPrefix: "/",
      deploymentConfig: deploymentConfig.body.record.id,
      targetProfile: "instance",
    });
    expect(enabledRoute.response.status).toBe(200);

    await createControlPlaneRecord("route", {
      enabled: false,
      kind: "mount",
      matchHost: "disabled.example.com",
      matchPath: "/",
      matchPrefix: "/",
      targetProfile: "instance",
    });

    const first = await getJson<InstanceDeploymentDesiredStateResponse>(
      INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH,
    );

    await patchControlPlaneRecord("route", enabledRoute.body.record.id, {
      access: "owner",
    });
    const second = await getJson<InstanceDeploymentDesiredStateResponse>(
      INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH,
    );
    const serialized = JSON.stringify(second.body);

    expect(first.body.desiredState.resourceGraph.resources).toEqual([
      expect.objectContaining({
        inputs: {
          adopt: false,
          host: "direct.example.com",
          name: "direct.example.com",
          overrideExistingOrigin: false,
          profile: "instance",
          workerName: "config-worker",
        },
        kind: "cloudflare-worker-custom-domain",
        logicalId: "primary-custom-domain-direct-example-com-instance",
      }),
    ]);
    expect(second.body.desiredState.hash).toBe(first.body.desiredState.hash);
    expect(second.body.desiredState.versionId).toBe(first.body.desiredState.versionId);
    expect(serialized).not.toContain("disabled.example.com");
    expect(serialized).not.toContain("secret:cloudflare:primary");
    expect(serialized).not.toContain("secret-cloudflare-token");
    expect(serialized).not.toContain("secret-alchemy-password");
  });

  it("omits disabled route resources from desired-state projection", async () => {
    const created = await createControlPlaneRecord("route", {
      enabled: true,
      kind: "mount",
      matchHost: "remove.example.com",
      matchPath: "/",
      matchPrefix: "/",
      targetProfile: "instance",
    });
    const before = await getJson<InstanceDeploymentDesiredStateResponse>(
      INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH,
    );

    await patchControlPlaneRecord("route", created.body.record.id, { enabled: false });

    const after = await getJson<InstanceDeploymentDesiredStateResponse>(
      INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH,
    );

    expect(before.body.desiredState.resourceGraph.resources).toEqual([
      expect.objectContaining({
        logicalId: "primary-custom-domain-remove-example-com-instance",
      }),
    ]);
    expect(after.body.desiredState.resourceGraph.resources).toEqual([]);
    expect(after.body.desiredState.hash).not.toBe(before.body.desiredState.hash);
  });

  it("uses no-store cache policy for method and target errors", async () => {
    const methodRejected = await harness.fetch(INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH, {
      method: "POST",
    });
    const targetRejected = await harness.fetch(
      `${INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH}?targetId=instance.secondary`,
    );
    const invalidTargetRejected = await harness.fetch(
      `${INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH}?targetId=Primary`,
    );

    expect(methodRejected.status).toBe(405);
    expect(methodRejected.headers.get("Allow")).toBe("GET");
    expect(methodRejected.headers.get("Cache-Control")).toBe("no-store");
    expect(await methodRejected.json()).toEqual({ error: "Method not allowed." });

    expect(targetRejected.status).toBe(404);
    expect(targetRejected.headers.get("Cache-Control")).toBe("no-store");
    expect(await targetRejected.json()).toEqual({
      error: 'Deployment target "instance.secondary" was not found.',
    });

    expect(invalidTargetRejected.status).toBe(400);
    expect(invalidTargetRejected.headers.get("Cache-Control")).toBe("no-store");
    expect(await invalidTargetRejected.json()).toMatchObject({
      code: "invalid-target-id",
      field: "targetId",
    });
  });

  it("derives deployment status from deployment-config observation fields", async () => {
    const empty = await getJson<InstanceDeploymentStatusResponse>(
      INSTANCE_DEPLOYMENT_STATUS_API_PATH,
    );
    const deploymentConfig = await createControlPlaneRecord("deployment-config", {
      targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
      label: "Cloudflare primary",
      enabled: true,
      targetUrl: "https://direct.example.workers.dev",
      providerFamily: "cloudflare",
    });
    const desired = await getJson<InstanceDeploymentDesiredStateResponse>(
      INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH,
    );
    const pending = await getJson<InstanceDeploymentStatusResponse>(
      INSTANCE_DEPLOYMENT_STATUS_API_PATH,
    );

    expect(empty.body.status).toMatchObject({ state: "no-target" });
    expect(pending.body.status).toMatchObject({
      latestDesiredState: {
        hash: desired.body.desiredState.hash,
        revision: desired.body.desiredState.revision,
        targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
        versionId: desired.body.desiredState.versionId,
      },
      state: "pending-changes",
    });

    await patchControlPlaneRecord("deployment-config", deploymentConfig.body.record.id, {
      observedAt: "2026-05-28T00:01:00.000Z",
      observedDesiredStateHash: desired.body.desiredState.hash,
      observedRunnerId: "runner.primary",
      observedStatus: "deployed",
      observedSummary: "Deployed current state.",
    });
    const deployed = await getJson<InstanceDeploymentStatusResponse>(
      INSTANCE_DEPLOYMENT_STATUS_API_PATH,
    );

    expect(deployed.body.status).toMatchObject({
      deployedAt: "2026-05-28T00:01:00.000Z",
      runnerId: "runner.primary",
      state: "deployed",
      summary: "Deployed current state.",
    });

    await patchControlPlaneRecord("deployment-config", deploymentConfig.body.record.id, {
      observedAt: "2026-05-28T00:02:00.000Z",
      observedDesiredStateHash: desired.body.desiredState.hash,
      observedError: "Provider apply failed.",
      observedStatus: "failed",
    });
    const failed = await getJson<InstanceDeploymentStatusResponse>(
      INSTANCE_DEPLOYMENT_STATUS_API_PATH,
    );

    expect(failed.body.status).toMatchObject({
      failedAt: "2026-05-28T00:02:00.000Z",
      state: "failed-current-version",
      summary: {
        code: "observed-failure",
        displayMessage: "Provider apply failed.",
      },
    });

    await patchControlPlaneRecord("deployment-config", deploymentConfig.body.record.id, {
      observedDesiredStateHash: `sha256:${"b".repeat(64)}`,
      observedStatus: "failed",
    });
    const staleObserved = await getJson<InstanceDeploymentStatusResponse>(
      INSTANCE_DEPLOYMENT_STATUS_API_PATH,
    );

    expect(staleObserved.body.status).toMatchObject({ state: "pending-changes" });
  });

  it("rejects mutation requests through the read-only deployment runtime API", async () => {
    for (const path of [
      INSTANCE_DEPLOYMENT_ATTEMPT_START_API_PATH,
      INSTANCE_DEPLOYMENT_ATTEMPT_HEARTBEAT_API_PATH,
      INSTANCE_DEPLOYMENT_ATTEMPT_PLAN_API_PATH,
      INSTANCE_DEPLOYMENT_ATTEMPT_SUCCESS_API_PATH,
      INSTANCE_DEPLOYMENT_ATTEMPT_FAILURE_API_PATH,
      INSTANCE_DEPLOYMENT_DRIFT_API_PATH,
    ]) {
      const response = await harness.fetch(path, {
        body: "{}",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toEqual({
        error: "Deployment runtime API is read-only.",
      });
    }
  });
});

async function getJson<T>(path: string) {
  const response = await harness.fetch(path, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  expect(response.status).toBe(200);

  return {
    body: (await response.json()) as T,
    response,
  };
}

async function resetWorkerState() {
  await restoreTestStorageSnapshot(
    harness,
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/snapshot/restore`,
    instanceControlPlaneTestStorageSnapshot(),
    { Authorization: `Bearer ${adminToken}` },
  );
  await postInternalInstanceReset(INTERNAL_RESET_INSTANCE_DEPLOYMENT_RUNTIME_PATH);
}
async function postInternalInstanceReset(path: string) {
  const response = await harness.durableObjectFetch(
    "FORMLESS_AUTHORITY",
    FORMLESS_INSTANCE_AUTHORITY_NAME,
    path,
    { method: "POST" },
  );

  expect(response.status).toBe(200);
}

async function createRedirectRoute(input: {
  enabled?: boolean;
  fromHost: string;
  preservePath?: boolean;
  preserveQueryString?: boolean;
  statusCode?: number;
  toHost?: string;
  toUrl?: string;
}) {
  return createControlPlaneRecord("route", {
    enabled: input.enabled ?? true,
    kind: "redirect",
    matchHost: input.fromHost,
    matchPath: "/",
    matchPrefix: "/",
    ...(input.toHost === undefined ? {} : { toHost: input.toHost }),
    ...(input.toUrl === undefined ? {} : { toUrl: input.toUrl }),
    statusCode: String(input.statusCode ?? 301),
    preservePath: input.preservePath ?? true,
    preserveQueryString: input.preserveQueryString ?? true,
  });
}

async function createControlPlaneRecord(entity: string, values: Record<string, unknown>) {
  const created = await postAdminJson<OperationInvocationResponse>(
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/operations/${entity}/create`,
    {
      idempotencyKey: `${entity}-${++controlPlaneOperationCounter}`,
      input: withoutLifecycleValues(values),
    },
  );

  return {
    body: { record: operationRecord(created.body) },
    response: created.response,
  };
}

async function patchControlPlaneRecord(
  entity: string,
  recordId: string,
  values: Record<string, unknown>,
) {
  const patched = await postAdminJson<OperationInvocationResponse>(
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/operations/${entity}/update`,
    {
      idempotencyKey: `${recordId}:patch:${Object.keys(values).join("-")}`,
      recordId,
      input: values,
    },
  );
  expect(patched.response.status, JSON.stringify(patched.body)).toBe(200);

  return {
    body: { record: operationRecord(patched.body) },
    response: patched.response,
  };
}

function operationRecord(response: OperationInvocationResponse): StoredRecord {
  if (response.output.type !== "create" && response.output.type !== "update") {
    throw new Error(
      `Expected control-plane write operation output, received "${response.output.type}".`,
    );
  }

  return response.output.record;
}

function withoutLifecycleValues(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([fieldName]) => fieldName !== "createdAt" && fieldName !== "updatedAt",
    ),
  );
}

async function postAdminJson<T>(path: string, body: unknown) {
  const request = operationWriteRequest(path, body);
  const response = await harness.fetch(request.path, {
    body: JSON.stringify(request.body),
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  return {
    body: request.response(await response.json()) as T,
    response,
  };
}
