import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  createAuthorityWriteHelpers,
  type AuthorityWriteHelpers,
} from "../test/authority-write.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";
let harness: Harness;
let authority: AuthorityWriteHelpers;

beforeAll(async () => {
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    { FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true } },
    { bindings: { FORMLESS_ADMIN_TOKEN: adminToken } },
  );
  authority = createAuthorityWriteHelpers(harness, "site", adminHeaders(), adminHeaders());
});

beforeEach(async () => {
  authority.useSchemaApp("site");
  await authority.resetSchemaApp("site");
});

afterAll(async () => {
  await harness.dispose();
});

describe("control-plane schema runtime validation", () => {
  it("accepts current instance and public Site route records", async () => {
    const deployment = await authority.postRecordOperationRequest({
      idempotencyKey: "current-deployment-config",
      entity: "deployment-config",
      operationName: "create",
      input: {
        targetId: "instance.primary",
        targetKind: "instance",
        label: "Primary Cloudflare",
        enabled: true,
        targetUrl: "https://personal.example.workers.dev",
        providerFamily: "cloudflare",
      },
    });
    const instanceRoute = await authority.postRecordOperationRequest({
      idempotencyKey: "current-instance-route",
      entity: "route",
      operationName: "create",
      input: {
        enabled: true,
        matchHost: "admin.example.com",
        matchPath: "/",
        matchPrefix: "/",
        kind: "mount",
        targetProfile: "instance",
        surface: "admin",
        access: "owner",
        deploymentConfig: deployment.record.id,
      },
    });
    const siteRoute = await authority.postRecordOperationRequest({
      idempotencyKey: "current-public-site-route",
      entity: "route",
      operationName: "create",
      input: {
        enabled: true,
        matchHost: "www.example.com",
        matchPath: "/",
        matchPrefix: "/",
        kind: "mount",
        targetProfile: "public-site",
        surface: "public-site",
        access: "anonymous",
        deploymentConfig: deployment.record.id,
      },
    });

    expect(instanceRoute.record.values).toMatchObject({
      matchHost: "admin.example.com",
      targetProfile: "instance",
    });
    expect(siteRoute.record.values).toMatchObject({
      matchHost: "www.example.com",
      targetProfile: "public-site",
    });
  });

  it("rejects malformed current route facts", async () => {
    await authority.expectRecordOperationError(
      {
        idempotencyKey: "unnormalized-current-route",
        entity: "route",
        operationName: "create",
        input: {
          enabled: true,
          matchHost: "WWW.Example.COM.",
          matchPath: "/",
          matchPrefix: "/",
          kind: "mount",
          targetProfile: "public-site",
          surface: "public-site",
          access: "anonymous",
        },
      },
      "must be a normalized exact host.",
    );
  });
});

function adminHeaders() {
  return { Authorization: `Bearer ${adminToken}` };
}
