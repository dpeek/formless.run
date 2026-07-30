import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID } from "@dpeek/formless-instance-control-plane";
import { FORMLESS_PROGRAM_API_ROUTE_PREFIX } from "../program/target.ts";

import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import type { OwnerSetupStatusResponse } from "../shared/protocol.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { INTERNAL_RESET_OWNER_SETUP_PATH } from "./owner-setup.ts";
import {
  instanceControlPlaneTestStorageSnapshot,
  restoreTestStorageSnapshot,
} from "../test/authority-write.ts";
import { resetTestIdentityStorage } from "../test/identity-owner.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

type OwnerSetupCapabilityResponse =
  | {
      capabilityCreated: true;
      expiresAt?: string;
      setupComplete: false;
    }
  | {
      error: string;
      reason: "already-complete";
      setupComplete: true;
    };

const adminToken = "test-admin-token";
const setupToken = "abcDEF0123456789_-abcDEF0123456789_-";
const futureExpiresAt = "2999-01-01T00:00:00.000Z";

let harness: Harness;
let controlPlaneOperationCounter = 0;

beforeAll(async () => {
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: { FORMLESS_ADMIN_TOKEN: adminToken },
    },
  );
});

beforeEach(async () => {
  controlPlaneOperationCounter = 0;
  await restoreTestStorageSnapshot(
    harness,
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/snapshot/restore`,
    instanceControlPlaneTestStorageSnapshot(),
    { Authorization: `Bearer ${adminToken}` },
  );
  await resetTestIdentityStorage(harness, adminToken);
  await postInternalInstanceReset(INTERNAL_RESET_OWNER_SETUP_PATH);
});

afterAll(async () => {
  await harness.dispose();
});

describe("owner setup status and capability API routes", () => {
  it("reads public setup status without exposing stored setup capability details", async () => {
    const before = await getJson<OwnerSetupStatusResponse>("/api/formless/setup");

    expect(before.response.headers.get("Cache-Control")).toBe("no-store");
    expect(before.body).toEqual({ setupComplete: false });

    const created = await createSetupCapability();
    const after = await getJson<OwnerSetupStatusResponse>("/api/formless/setup");

    expect(created.body).toEqual({
      capabilityCreated: true,
      expiresAt: futureExpiresAt,
      setupComplete: false,
    });
    expect(JSON.stringify(created.body)).not.toContain(setupToken);
    expect(after.body).toEqual({ setupComplete: false });
  });

  it("reports configured auth and preferred admin origins in setup status", async () => {
    const route = await createControlPlaneRecord("route", {
      enabled: true,
      matchHost: "www.example.com",
      matchPath: "/",
      matchPrefix: "/",
      kind: "mount",
      targetProfile: "instance",
      surface: "admin",
      access: "owner",
    });

    await createControlPlaneRecord("instance-settings", {
      settingsId: INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
      primaryRoute: route.id,
      authOrigin: "https://auth.example.com",
      authRelyingPartyId: "auth.example.com",
      productionIdentityStatus: "configured",
    });

    const nonAuthOrigin = await harness.fetch("/api/formless/setup", {
      headers: { Authorization: `Bearer ${adminToken}` },
      redirect: "manual",
    });
    const after = await getJsonFromUrl<OwnerSetupStatusResponse>(
      "https://auth.example.com/api/formless/setup",
    );

    expect(nonAuthOrigin.status).toBe(404);
    expect(after.body).toEqual({
      adminOrigin: "https://www.example.com",
      authOrigin: "https://auth.example.com",
      setupComplete: false,
    });
  });

  it("uses workers.dev as the admin fallback only without custom admin routes", async () => {
    const fallback = await getJsonFromUrl<OwnerSetupStatusResponse>(
      "https://personal.dpeek.workers.dev/api/formless/setup",
    );

    expect(fallback.body).toEqual({
      adminOrigin: "https://personal.dpeek.workers.dev",
      setupComplete: false,
    });

    const firstAdmin = await createAdminRoute("admin.example.com");
    const singleCustom = await getJsonFromUrl<OwnerSetupStatusResponse>(
      "https://personal.dpeek.workers.dev/api/formless/setup",
    );

    expect(singleCustom.body).toEqual({
      adminOrigin: "https://admin.example.com",
      setupComplete: false,
    });

    const selectedAdmin = await createAdminRoute("control.example.com");
    const ambiguous = await getJsonFromUrl<OwnerSetupStatusResponse>(
      "https://personal.dpeek.workers.dev/api/formless/setup",
    );

    expect(ambiguous.body).toEqual({ setupComplete: false });

    await createControlPlaneRecord("instance-settings", {
      settingsId: INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
      adminRoute: selectedAdmin.id,
    });

    const explicit = await getJsonFromUrl<OwnerSetupStatusResponse>(
      "https://personal.dpeek.workers.dev/api/formless/setup",
    );

    expect(explicit.body).toEqual({
      adminOrigin: "https://control.example.com",
      setupComplete: false,
    });
    expect(firstAdmin.id).not.toBe(selectedAdmin.id);
  });

  it("requires the admin bearer token before creating setup capabilities", async () => {
    const rejected = await harness.fetch("/api/formless/setup/capability", {
      body: "not-json",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const accepted = await createSetupCapability();

    expect(rejected.status).toBe(401);
    expect(rejected.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
    expect(await rejected.json()).toEqual({
      error: "Admin authorization is required for this write endpoint.",
    });
    expect(accepted.response.status).toBe(200);
  });

  it("requires owner setup before account login", async () => {
    const rejected = await harness.fetch("/api/formless/session", {
      headers: { Authorization: `Bearer ${adminToken}` },
      method: "POST",
    });

    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toEqual({
      authenticated: false,
      error: "Owner setup must be complete before login.",
    });
  });

  it("returns method errors for retained setup API paths", async () => {
    const status = await harness.fetch("/api/formless/setup", { method: "POST" });
    const session = await harness.fetch("/api/formless/session", { method: "PUT" });
    const logout = await harness.fetch("/api/formless/session/logout", { method: "GET" });

    expect(status.status).toBe(405);
    expect(status.headers.get("Allow")).toBe("GET");
    expect(session.status).toBe(405);
    expect(session.headers.get("Allow")).toBe("GET, POST");
    expect(logout.status).toBe(405);
    expect(logout.headers.get("Allow")).toBe("POST");
  });
});

async function createSetupCapability() {
  return postAdminJson<OwnerSetupCapabilityResponse>("/api/formless/setup/capability", {
    setupToken,
    expiresAt: futureExpiresAt,
  });
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

async function getJsonFromUrl<T>(url: string) {
  const response = await harness.mf.dispatchFetch(url, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  expect(response.status).toBe(200);

  return {
    body: (await response.json()) as T,
    response,
  };
}

async function postAdminJson<T>(path: string, body: unknown) {
  const response = await harness.fetch(path, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  return {
    body: (await response.json()) as T,
    response,
  };
}

async function createControlPlaneRecord(entity: string, values: Record<string, unknown>) {
  const created = await postAdminJson<OperationInvocationResponse>(
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/operations/${entity}/create`,
    {
      idempotencyKey: `owner-setup-${entity}-${++controlPlaneOperationCounter}`,
      input: values,
    },
  );

  expect(created.response.status).toBe(200);

  if (created.body.output.type !== "create" && created.body.output.type !== "update") {
    throw new Error(`Expected control-plane write output, received "${created.body.output.type}".`);
  }

  return created.body.output.record;
}

function createAdminRoute(matchHost: string) {
  return createControlPlaneRecord("route", {
    enabled: true,
    matchHost,
    matchPath: "/",
    matchPrefix: "/",
    kind: "mount",
    targetProfile: "instance",
    surface: "admin",
    access: "owner",
  });
}
