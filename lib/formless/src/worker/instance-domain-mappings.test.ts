import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { CreateAppInstallResponse } from "../shared/protocol.ts";
import type {
  InstanceDomainMappingLookupResponse,
  RecordInstanceDomainMappingApplyEvidenceResponse,
} from "../shared/instance-domain-mappings.ts";
import {
  instanceControlPlaneTestStorageSnapshot,
  operationWriteRequest,
  restoreTestStorageSnapshot,
} from "../test/authority-write.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { INTERNAL_RESET_INSTANCE_DOMAIN_MAPPINGS_PATH } from "./instance-domain-mappings.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
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
      bindings: { FORMLESS_ADMIN_TOKEN: adminToken },
    },
  );
}

describe("instance domain mapping route boundary", () => {
  it("looks up enabled route-backed Site domain mappings", async () => {
    await createAppInstall({ packageAppKey: "site", installId: "personal", label: "Personal" });
    await createDomainRoute("route:host:publicSite:www.example.com", {
      enabled: true,
      matchHost: "www.example.com",
      matchPath: "/",
      matchPrefix: "/",
      kind: "mount",
      targetProfile: "public-site",
      appInstall: "personal",
      surface: "public-site",
    });

    const lookup = await getJson<InstanceDomainMappingLookupResponse>(
      "/api/formless/domain-mappings/lookup?host=WWW.Example.COM.:443&surface=site",
    );

    expect(lookup.body.mapping).toMatchObject({
      enabled: true,
      host: "www.example.com",
      installId: "personal",
      profile: "publicSite",
      surface: "site",
      targetInstallId: "personal",
    });
  });

  it("keeps disabled route-backed mappings out of enabled host lookup", async () => {
    await createAppInstall({ packageAppKey: "site", installId: "personal", label: "Personal" });
    await createDomainRoute("route:host:publicSite:disabled.example.com", {
      enabled: false,
      matchHost: "disabled.example.com",
      matchPath: "/",
      matchPrefix: "/",
      kind: "mount",
      targetProfile: "public-site",
      appInstall: "personal",
      surface: "public-site",
    });

    const lookup = await getJson<InstanceDomainMappingLookupResponse>(
      "/api/formless/domain-mappings/lookup?host=disabled.example.com&surface=site",
    );

    expect(lookup.body.mapping).toBeNull();
  });

  it("records provider apply evidence against route-backed domain mappings", async () => {
    await createAppInstall({ packageAppKey: "site", installId: "personal", label: "Personal" });
    await createDomainRoute("route:host:publicSite:applied.example.com", {
      enabled: true,
      matchHost: "applied.example.com",
      matchPath: "/",
      matchPrefix: "/",
      kind: "mount",
      targetProfile: "public-site",
      appInstall: "personal",
      surface: "public-site",
    });

    const applied = await postAdminJson<RecordInstanceDomainMappingApplyEvidenceResponse>(
      "/api/formless/domain-mappings/apply-evidence",
      {
        host: "applied.example.com",
        surface: "site",
        installId: "personal",
        provider: "cloudflare-worker-custom-domain",
        accountId: "account-123",
        zoneId: "zone-1",
        zoneName: "example.com",
        workerName: "personal-worker",
        workerDomainId: "domain-1",
        action: "created",
      },
    );

    expect(applied.response.status).toBe(200);
    expect(applied.body.appliedState).toMatchObject({
      action: "created",
      host: "applied.example.com",
      profile: "publicSite",
      targetInstallId: "personal",
    });
    expect(applied.body.auditEvent).toMatchObject({
      action: "created",
      host: "applied.example.com",
    });
  });

  it("requires instance write authorization for apply evidence", async () => {
    const rejected = await harness.fetch("/api/formless/domain-mappings/apply-evidence", {
      body: JSON.stringify({
        host: "example.com",
        surface: "site",
        installId: "personal",
        provider: "cloudflare-worker-custom-domain",
        accountId: "account-123",
        zoneId: "zone-1",
        zoneName: "example.com",
        workerName: "personal-worker",
        workerDomainId: "domain-1",
        action: "created",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(rejected.status).toBe(401);
    expect(await rejected.json()).toEqual({
      error: "Owner session or admin authorization is required for this write endpoint.",
    });
  });
});

async function createAppInstall(input: {
  packageAppKey: string;
  installId: string;
  label: string;
}) {
  return postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", input);
}

async function createDomainRoute(recordId: string, values: Record<string, unknown>) {
  const created = await postAdminJson("/api/formless/program/operations/route/create", {
    idempotencyKey: `route-${recordId}`,
    input: values,
  });

  expect(created.response.status).toBe(200);
}

async function resetWorkerState() {
  await restoreTestStorageSnapshot(
    harness,
    "/api/formless/program/snapshot/restore",
    instanceControlPlaneTestStorageSnapshot(),
    { Authorization: `Bearer ${adminToken}` },
  );
  await postInternalInstanceReset(INTERNAL_RESET_INSTANCE_DOMAIN_MAPPINGS_PATH);
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

async function postAdminJson<T = unknown>(path: string, body: unknown) {
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
