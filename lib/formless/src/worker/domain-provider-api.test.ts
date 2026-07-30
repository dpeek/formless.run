import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  INSTANCE_DOMAIN_PROVIDER_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_DELETE_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_DELETE_JOBS_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_MANUAL_CLEANUP_API_PATH,
  type InstanceDomainProviderDeleteJobResponse,
  type InstanceDomainProviderDeleteResponse,
  type InstanceDomainProviderManualCleanupResponse,
  type InstanceDomainProviderPlanResponse,
} from "../shared/domain-provider-api.ts";
import { INTERNAL_RESET_INSTANCE_DOMAIN_PROVIDER_PATH } from "./domain-provider-api.ts";
import {
  INSTANCE_DEPLOYMENT_STATUS_API_PATH,
  type InstanceDeploymentStatusResponse,
} from "../shared/deployment-runtime.ts";
import { FORMLESS_PROGRAM_API_ROUTE_PREFIX } from "../program/target.ts";
import type { RecordInstanceDomainMappingApplyEvidenceResponse } from "../shared/instance-domain-mappings.ts";
import type { BootstrapResponse } from "../shared/protocol.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import {
  instanceControlPlaneTestStorageSnapshot,
  operationWriteRequest,
  restoreTestStorageSnapshot,
} from "../test/authority-write.ts";
import { INTERNAL_RESET_INSTANCE_DEPLOYMENT_RUNTIME_PATH } from "./deployment-runtime-api.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { INTERNAL_RESET_INSTANCE_DOMAIN_MAPPINGS_PATH } from "./instance-domain-mappings.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

type DomainProviderFailureResponse = {
  code?: string;
  error: string;
};

const adminToken = "test-admin-token";
const cloudflareToken = "secret-cloudflare-token";
const alchemyPassword = "secret-alchemy-password";
const domainMappingsApplyEvidenceApiPath = "/api/formless/domain-mappings/apply-evidence";

let harness: Harness;
let defaultHarness: Harness;
const routeRecordIds = new Map<string, string>();

beforeAll(async () => {
  defaultHarness = await createHarness(defaultProviderBindings());
});

beforeEach(async () => {
  harness = defaultHarness;
  await resetWorkerState(harness);
});

afterAll(async () => {
  await defaultHarness.dispose();
});

describe("instance domain provider API routes", () => {
  it("returns dry-run provider config and plan without exposing provider secrets", async () => {
    await createRouteRecord("disabled-provider-plan-route", {
      enabled: false,
      matchHost: "disabled.example.com",
      matchPath: "/",
      matchPrefix: "/",
      kind: "mount",
      targetProfile: "instance",
    });
    await createRouteRecord("custom-provider-plan-route", {
      enabled: true,
      matchHost: "admin.example.com",
      matchPath: "/",
      matchPrefix: "/",
      kind: "mount",
      targetProfile: "instance",
    });

    const response = await getJson<InstanceDomainProviderPlanResponse>(
      INSTANCE_DOMAIN_PROVIDER_API_PATH,
    );
    const serialized = JSON.stringify(response.body);

    expect(response.body.config).toMatchObject({
      accountId: "account-123",
      alchemyPassword: { configured: true },
      cloudflareApiToken: { configured: true },
      deleteReady: true,
      instanceId: "primary",
      issues: [],
      planReady: true,
      runnerMutation: {
        checkedBy: "node-runner",
        requiredEnvNames: expect.arrayContaining([
          "ALCHEMY_PASSWORD",
          "ALCHEMY_STATE_TOKEN",
          "CLOUDFLARE_API_TOKEN",
        ]),
      },
      workerName: "formless-primary",
    });
    expect(response.body.plan.blockers).toEqual([]);
    expect(response.body.plan.resources).toEqual([
      expect.objectContaining({
        host: "admin.example.com",
        kind: "cloudflare-worker-custom-domain",
        logicalId: "primary-custom-domain-admin-example-com-instance",
        props: expect.objectContaining({
          workerName: "formless-primary",
          zoneId: "zone-1",
        }),
      }),
    ]);
    expect(response.body.redirectIntents).toEqual([]);
    expect(serialized).not.toContain("disabled.example.com");
    expect(serialized).not.toContain(cloudflareToken);
    expect(serialized).not.toContain(alchemyPassword);
  });

  it("requires owner or admin authorization for manual provider cleanup", async () => {
    const response = await harness.fetch(INSTANCE_DOMAIN_PROVIDER_MANUAL_CLEANUP_API_PATH, {
      body: JSON.stringify({
        host: "admin.example.com",
        kind: "cloudflare-worker-custom-domain",
        logicalId: "primary-custom-domain-admin-example-com-instance",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
    expect(await response.json()).toEqual({
      error: "Owner session or admin authorization is required for this write endpoint.",
    });
  });

  it("keeps missing provider config actionable and display-safe", async () => {
    await withHarness(await createHarness({}), async () => {
      const plan = await getJson<InstanceDomainProviderPlanResponse>(
        INSTANCE_DOMAIN_PROVIDER_API_PATH,
      );

      expect(plan.body.config.deleteReady).toBe(false);
      expect(plan.body.config.issues.map((issue) => issue.code)).toEqual([
        "missing-instance-id",
        "missing-worker-name",
        "missing-account-id",
        "missing-zone-config",
      ]);
      expect(JSON.stringify(plan.body)).not.toContain(cloudflareToken);
      expect(JSON.stringify(plan.body)).not.toContain(alchemyPassword);
    });
  });

  it("creates and completes delete jobs from recorded evidence without Worker-held runner secrets", async () => {
    await withHarness(
      await createHarness({
        FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID: "account-123",
        FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID: "primary",
        FORMLESS_DOMAIN_PROVIDER_WORKER_NAME: "formless-primary",
        FORMLESS_DOMAIN_PROVIDER_ZONES: JSON.stringify([{ id: "zone-1", name: "example.com" }]),
      }),
      async () => {
        await resetWorkerState(harness);

        await createMappedCustomDomainEvidence({
          host: "admin.example.com",
          logicalId: "primary-custom-domain-admin-example-com-instance",
          runnerId: "runner-seed",
          workerDomainId: "custom-domain-123",
        });
        await patchRouteRecord("route:host:instance:admin.example.com", { enabled: false });
        const intentBeforeCleanup = await getJson<BootstrapResponse>(
          `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/bootstrap`,
        );

        const deleteJob = await postAdminJson<InstanceDomainProviderDeleteResponse>(
          INSTANCE_DOMAIN_PROVIDER_DELETE_API_PATH,
          {
            host: "admin.example.com",
            kind: "cloudflare-worker-custom-domain",
            runnerId: "runner-delete",
          },
        );

        expect(deleteJob.response.status).toBe(202);
        expect(deleteJob.body).toMatchObject({
          code: "domain-provider-delete-job-ready",
          status: "ready",
          targets: [
            expect.objectContaining({
              host: "admin.example.com",
              kind: "cloudflare-worker-custom-domain",
              resourceId: "custom-domain-123",
            }),
          ],
        });
        expect(JSON.stringify(deleteJob.body)).not.toContain("lease:");

        if (deleteJob.body.status !== "ready") {
          throw new Error("Delete did not create a job.");
        }

        const cleanupStatus = await getJson<InstanceDeploymentStatusResponse>(
          INSTANCE_DEPLOYMENT_STATUS_API_PATH,
        );
        const pendingJob = await getJson<InstanceDomainProviderDeleteJobResponse>(
          `${INSTANCE_DOMAIN_PROVIDER_DELETE_JOBS_API_PATH}/${deleteJob.body.job.jobId}`,
        );

        expect(pendingJob.body.job).toMatchObject({
          runnerId: "runner-delete",
          status: "ready",
        });
        expect(cleanupStatus.body.status).toMatchObject({ state: "no-target" });

        const completion = await postAdminJson<InstanceDomainProviderDeleteJobResponse>(
          `${INSTANCE_DOMAIN_PROVIDER_DELETE_JOBS_API_PATH}/${deleteJob.body.job.jobId}/result`,
          {
            resources: deleteJob.body.targets.map((target) => ({
              action: "deleted",
              host: target.host,
              kind: target.kind,
              logicalId: target.logicalId,
            })),
            runnerId: "runner-delete",
            status: "succeeded",
          },
        );
        const cleanupDeployed = await getJson<InstanceDeploymentStatusResponse>(
          INSTANCE_DEPLOYMENT_STATUS_API_PATH,
        );
        const intentAfterCleanup = await getJson<BootstrapResponse>(
          `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/bootstrap`,
        );

        expect(completion.body.job).toMatchObject({
          result: { evidenceCount: 1 },
          status: "succeeded",
        });
        expect(cleanupDeployed.body.status).toMatchObject({ state: "no-target" });
        expect(routeAndAppIntentSnapshot(intentAfterCleanup.body)).toEqual(
          routeAndAppIntentSnapshot(intentBeforeCleanup.body),
        );
      },
    );
  });

  it("marks manually removed CustomDomain evidence without Cloudflare credentials", async () => {
    await withHarness(
      await createHarness({
        FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID: "account-123",
        FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID: "primary",
        FORMLESS_DOMAIN_PROVIDER_WORKER_NAME: "formless-primary",
        FORMLESS_DOMAIN_PROVIDER_ZONES: JSON.stringify([{ id: "zone-1", name: "example.com" }]),
      }),
      async () => {
        await resetWorkerState(harness);

        const logicalId = "primary-custom-domain-manual-example-com-instance";

        await createMappedCustomDomainEvidence({
          host: "manual.example.com",
          logicalId,
          runnerId: "runner-1",
          workerDomainId: "custom-domain-123",
        });
        await patchRouteRecord("route:host:instance:manual.example.com", { enabled: false });
        const intentBeforeCleanup = await getJson<BootstrapResponse>(
          `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/bootstrap`,
        );

        const unrelated = await postAdminJson<DomainProviderFailureResponse>(
          INSTANCE_DOMAIN_PROVIDER_MANUAL_CLEANUP_API_PATH,
          {
            host: "manual.example.com",
            kind: "cloudflare-worker-custom-domain",
            logicalId: "unrelated-resource",
          },
        );
        expect(unrelated.response.status).toBe(404);
        expect(unrelated.body).toMatchObject({
          code: "domain-provider-manual-cleanup-not-found",
        });

        const cleanup = await postAdminJson<InstanceDomainProviderManualCleanupResponse>(
          INSTANCE_DOMAIN_PROVIDER_MANUAL_CLEANUP_API_PATH,
          {
            host: "manual.example.com",
            kind: "cloudflare-worker-custom-domain",
            logicalId,
          },
        );
        const intentAfterCleanup = await getJson<BootstrapResponse>(
          `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/bootstrap`,
        );

        expect(cleanup.response.status).toBe(200);
        expect(cleanup.body).toMatchObject({
          action: "manually-removed",
          status: "cleaned",
          target: expect.objectContaining({
            host: "manual.example.com",
            kind: "cloudflare-worker-custom-domain",
            logicalId,
          }),
        });
        expect(routeAndAppIntentSnapshot(intentAfterCleanup.body)).toEqual(
          routeAndAppIntentSnapshot(intentBeforeCleanup.body),
        );
      },
    );
  });

  it("plans redirect resources from route records without provider mutation", async () => {
    await createRouteRecord("route:redirect:disabled.example.com", {
      enabled: false,
      matchHost: "disabled.example.com",
      matchPath: "/",
      matchPrefix: "/",
      kind: "redirect",
      toHost: "example.com",
      statusCode: "301",
      preservePath: true,
      preserveQueryString: true,
    });
    await createRouteRecord("route:redirect:www.example.com", {
      enabled: true,
      matchHost: "www.example.com",
      matchPath: "/",
      matchPrefix: "/",
      kind: "redirect",
      toHost: "example.com",
      statusCode: "301",
      preservePath: true,
      preserveQueryString: true,
    });
    const plan = await getJson<InstanceDomainProviderPlanResponse>(
      INSTANCE_DOMAIN_PROVIDER_API_PATH,
    );
    const serialized = JSON.stringify(plan.body);
    const controlPlaneIntent = await getJson<BootstrapResponse>(
      `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/bootstrap`,
    );

    expect(plan.body.redirectIntents).toEqual([
      expect.objectContaining({
        enabled: true,
        fromHost: "www.example.com",
        preservePath: true,
        preserveQueryString: true,
        statusCode: 301,
        toHost: "example.com",
      }),
    ]);
    expect(plan.body.plan.resources).toEqual([
      expect.objectContaining({
        host: "www.example.com",
        kind: "cloudflare-worker-custom-domain",
        logicalId: "primary-redirect-custom-domain-www-example-com",
        routeKind: "redirect",
      }),
    ]);
    expect(serialized).not.toContain("disabled.example.com");
    expect(controlPlaneIntent.body.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: "route",
          values: expect.objectContaining({
            enabled: true,
            matchHost: "www.example.com",
            preservePath: true,
            preserveQueryString: true,
            statusCode: "301",
            toHost: "example.com",
          }),
        }),
      ]),
    );
  });
});

async function createHarness(bindings: Record<string, string>) {
  return createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        ...bindings,
      },
    },
  );
}

function defaultProviderBindings(): Record<string, string> {
  return {
    ALCHEMY_PASSWORD: alchemyPassword,
    CLOUDFLARE_API_TOKEN: cloudflareToken,
    FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID: "account-123",
    FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID: "primary",
    FORMLESS_DOMAIN_PROVIDER_WORKER_NAME: "formless-primary",
    FORMLESS_DOMAIN_PROVIDER_ZONES: JSON.stringify([{ id: "zone-1", name: "example.com" }]),
  };
}

async function withHarness<T>(target: Harness, run: () => Promise<T>): Promise<T> {
  const previous = harness;
  harness = target;

  try {
    return await run();
  } finally {
    harness = previous;
    await target.dispose();
  }
}

async function resetWorkerState(target: Harness) {
  routeRecordIds.clear();
  await restoreTestStorageSnapshot(
    target,
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/snapshot/restore`,
    instanceControlPlaneTestStorageSnapshot(),
    { Authorization: `Bearer ${adminToken}` },
  );
  await Promise.all([
    postInternalInstanceReset(target, INTERNAL_RESET_INSTANCE_DEPLOYMENT_RUNTIME_PATH),
    postInternalInstanceReset(target, INTERNAL_RESET_INSTANCE_DOMAIN_MAPPINGS_PATH),
    postInternalInstanceReset(target, INTERNAL_RESET_INSTANCE_DOMAIN_PROVIDER_PATH),
  ]);
}

async function postInternalInstanceReset(target: Harness, path: string) {
  const response = await target.durableObjectFetch(
    "FORMLESS_AUTHORITY",
    FORMLESS_INSTANCE_AUTHORITY_NAME,
    path,
    { method: "POST" },
  );

  expect(response.status).toBe(200);
}

async function createMappedCustomDomainEvidence(input: {
  host: string;
  logicalId: string;
  runnerId?: string;
  workerDomainId: string;
}) {
  await createRouteRecord(`route:host:instance:${input.host}`, {
    enabled: true,
    matchHost: input.host,
    matchPath: "/",
    matchPrefix: "/",
    kind: "mount",
    targetProfile: "instance",
  });

  return postAdminJson<RecordInstanceDomainMappingApplyEvidenceResponse>(
    domainMappingsApplyEvidenceApiPath,
    {
      accountId: "account-123",
      action: "created",
      alchemyResourceId: input.logicalId,
      host: input.host,
      profile: "instance",
      provider: "cloudflare-worker-custom-domain",
      ...(input.runnerId === undefined ? {} : { runnerId: input.runnerId }),
      workerDomainId: input.workerDomainId,
      workerName: "formless-primary",
      zoneId: "zone-1",
      zoneName: "example.com",
    },
  );
}

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

async function createRouteRecord(recordId: string, values: Record<string, unknown>) {
  const created = await postAdminJson<OperationInvocationResponse>(
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/operations/route/create`,
    {
      idempotencyKey: `route-${recordId}`,
      input: values,
    },
  );

  expect(created.response.status).toBe(200);
  routeRecordIds.set(recordId, operationRecord(created.body).id);
}

async function patchRouteRecord(recordId: string, values: Record<string, unknown>) {
  const actualRecordId = routeRecordIds.get(recordId) ?? recordId;
  const patched = await postAdminJson<OperationInvocationResponse>(
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/operations/route/update`,
    {
      idempotencyKey: `route-${actualRecordId}-patch`,
      recordId: actualRecordId,
      input: values,
    },
  );

  expect(patched.response.status).toBe(200);
}

function operationRecord(response: OperationInvocationResponse) {
  if (response.output.type !== "create" && response.output.type !== "update") {
    throw new Error(`Expected route write operation output, received "${response.output.type}".`);
  }

  return response.output.record;
}

function routeAndAppIntentSnapshot(body: BootstrapResponse) {
  return body.records
    .filter((record) => record.entity === "app-install" || record.entity === "route")
    .map((record) => ({
      deletedAt: record.deletedAt,
      entity: record.entity,
      id: record.id,
      values: record.values,
    }))
    .sort(
      (left, right) => left.entity.localeCompare(right.entity) || left.id.localeCompare(right.id),
    );
}
