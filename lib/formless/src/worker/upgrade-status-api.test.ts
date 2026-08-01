import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  INSTANCE_UPGRADE_APPLY_API_PATH,
  INSTANCE_UPGRADE_STATUS_API_PATH,
  type InstanceUpgradeStatusResponse,
} from "../shared/upgrade-status.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";
let harness: Harness;

beforeEach(async () => {
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    { FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true } },
    { bindings: { FORMLESS_ADMIN_TOKEN: adminToken } },
  );
});

afterEach(async () => {
  await harness.dispose();
});

describe("runtime upgrade status API", () => {
  it("requires instance write authorization for status reads", async () => {
    const response = await harness.fetch(INSTANCE_UPGRADE_STATUS_API_PATH);

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
  });

  it("reports and applies migration evidence for the instance only", async () => {
    const status = await getAdminJson(INSTANCE_UPGRADE_STATUS_API_PATH);
    const applied = await harness.fetch(INSTANCE_UPGRADE_APPLY_API_PATH, {
      body: JSON.stringify({ safety: "auto-safe" }),
      headers: adminHeaders(),
      method: "POST",
    });
    const appliedBody = (await applied.json()) as InstanceUpgradeStatusResponse;

    expect(status.storageIdentity).toEqual(
      expect.objectContaining({
        identity: { authorityName: "__formless_instance__", kind: "instance" },
      }),
    );
    expect(applied.status).toBe(200);
    expect(appliedBody.storageIdentity.identity.kind).toBe("instance");
  });
});

async function getAdminJson(path: string): Promise<InstanceUpgradeStatusResponse> {
  const response = await harness.fetch(path, { headers: adminHeaders() });

  expect(response.status).toBe(200);
  return (await response.json()) as InstanceUpgradeStatusResponse;
}

function adminHeaders() {
  return {
    Authorization: `Bearer ${adminToken}`,
    "Content-Type": "application/json",
  };
}
