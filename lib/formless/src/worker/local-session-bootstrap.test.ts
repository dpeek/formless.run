import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import type {
  AppInstallsResponse,
  BootstrapResponse,
  CreateAppInstallResponse,
  OwnerSetupStatusResponse,
} from "../shared/protocol.ts";
import type { AccountSessionStatusResponse } from "../shared/instance-auth.ts";
import {
  LOCAL_SESSION_BOOTSTRAP_API_PATH,
  LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
} from "@dpeek/formless-gateway";
import { INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID } from "@dpeek/formless-instance-control-plane";
import { createWorkerHarness } from "./miniflare-test.ts";
import { OWNER_SESSION_COOKIE_NAME } from "./owner-session.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;
type HarnessFetchInit = NonNullable<Parameters<Harness["fetch"]>[1]>;

const adminToken = "test-admin-token";
const ownerSessionSecret = "test-owner-session-secret";
const localSessionBootstrapToken = "test-local-session-bootstrap-token";

let harness: Harness;

beforeEach(async () => {
  harness = await createLocalBootstrapHarness();
});

afterEach(async () => {
  await harness.dispose();
});

describe("local session bootstrap API routes", () => {
  it("mints a local owner session that authorizes app install writes without exposing admin tokens", async () => {
    const rejectedBefore = await createSiteInstall({ cookie: null });
    const rejectedBeforeBody = await rejectedBefore.json();
    const bootstrap = await bootstrapLocalSession({
      init: { headers: { Origin: "http://example.com" } },
      redirectTo: "/apps/site",
      reset: true,
    });
    const cookie = cookiePair(bootstrap.headers.get("Set-Cookie"));
    const session = await getJson<AccountSessionStatusResponse>("/api/formless/session", {
      headers: { Cookie: cookie },
    });
    const installsBefore = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const controlPlaneBefore = await getJson<BootstrapResponse>("/api/formless/program/bootstrap");
    const created = await createSiteInstall({ cookie });
    const installsAfter = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    expect(rejectedBefore.status).toBe(401);
    expect(rejectedBeforeBody).toEqual({
      error:
        "Owner session, Program administrator session, or admin authorization is required for this write endpoint.",
    });
    expect(bootstrap.status).toBe(302);
    expect(bootstrap.headers.get("Location")).toBe(
      "http://example.com/local-session?reset=1&redirectTo=%2Fapps%2Fsite",
    );
    expect(bootstrap.headers.get("Location")).not.toContain(localSessionBootstrapToken);
    expect(bootstrap.headers.get("Set-Cookie")).toContain(`${OWNER_SESSION_COOKIE_NAME}=`);
    expect(bootstrap.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(bootstrap.headers.get("Set-Cookie")).toContain("SameSite=Lax");
    expect(bootstrap.headers.get("Set-Cookie")).not.toContain(adminToken);
    expect(bootstrap.headers.get("Set-Cookie")).not.toContain(localSessionBootstrapToken);
    expect(session.body).toEqual({
      authenticated: true,
      principal: {
        displayName: "Local Dev Owner",
        principalId: "local-dev-owner",
      },
      session: { expiresAt: expect.any(String) },
      setupComplete: true,
    });
    expect(JSON.stringify(session.body)).not.toContain(adminToken);
    expect(JSON.stringify(session.body)).not.toContain(localSessionBootstrapToken);
    expect(controlPlaneBefore.body.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "local-dev-owner",
          entity: "principal",
          values: {
            displayName: "Local Dev Owner",
            kind: "human",
            status: "active",
          },
        }),
        expect.objectContaining({
          entity: "role-assignment",
          values: {
            role: "role:instance.owner",
            targetKind: "principal",
            targetPrincipal: "local-dev-owner",
            scopeKind: "instance",
            status: "active",
          },
        }),
      ]),
    );
    expect(
      controlPlaneBefore.body.records.filter((record) => record.entity === "principal-email"),
    ).toEqual([]);
    expect(installsBefore.body.installs).toEqual([]);
    for (const entity of [
      "app-install",
      "route",
      "deploy-target",
      "provider-config-ref",
      "deploy-desired-resource",
    ]) {
      expect(controlPlaneBefore.body.records.filter((record) => record.entity === entity)).toEqual(
        [],
      );
    }
    expect(created.status).toBe(201);
    expect((await created.json()) as CreateAppInstallResponse).toMatchObject({
      install: {
        installId: "crm",
        label: "CRM",
        packageAppKey: "test-crm",
      },
    });
    expect(installsAfter.body.installs.map((install) => install.installId)).toEqual(["crm"]);
  });

  it("redirects same-origin local bootstrap requests back to the original named proxy origin", async () => {
    const bootstrap = await bootstrapLocalSession({
      init: {
        headers: {
          "x-forwarded-host": "ooga.formless.local",
          "x-forwarded-proto": "https",
        },
      },
      origin: "http://127.0.0.1:4334",
      reset: true,
    });

    expect(bootstrap.status).toBe(302);
    expect(bootstrap.headers.get("Location")).toBe(
      "https://ooga.formless.local/local-session?reset=1&redirectTo=%2F",
    );
    expect(bootstrap.headers.get("Location")).not.toContain(localSessionBootstrapToken);
    expect(bootstrap.headers.get("Set-Cookie")).toContain(`${OWNER_SESSION_COOKIE_NAME}=`);
  });

  it("keeps deployed production identity out of dynamic-port and named-proxy local auth", async () => {
    const productionOrigin = "https://verifi-staging.verifi-labs.workers.dev";
    const dynamicOrigin = "http://localhost:43127";

    await configureProductionIdentity(harness, productionOrigin);

    const dynamicBootstrap = await bootstrapLocalSession({
      origin: dynamicOrigin,
      reset: true,
    });
    const dynamicCookie = cookiePair(dynamicBootstrap.headers.get("Set-Cookie"));
    const dynamicSession = await harness.mf.dispatchFetch(`${dynamicOrigin}/api/formless/session`, {
      headers: { Cookie: dynamicCookie },
    });
    const dynamicSetup = await harness.mf.dispatchFetch(`${dynamicOrigin}/api/formless/setup`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dynamicSetupBody = (await dynamicSetup.json()) as OwnerSetupStatusResponse;
    const dynamicAuth = await harness.mf.dispatchFetch(`${dynamicOrigin}/formless/auth`, {
      headers: { Cookie: dynamicCookie },
      redirect: "manual",
    });

    expect(dynamicBootstrap.status).toBe(302);
    expect(dynamicBootstrap.headers.get("Location")).toBe(
      `${dynamicOrigin}/local-session?reset=1&redirectTo=%2F`,
    );
    expect(dynamicBootstrap.headers.get("Set-Cookie")).toContain(`${OWNER_SESSION_COOKIE_NAME}=`);
    expect(dynamicSession.status).toBe(200);
    expect(dynamicSetup.status).toBe(200);
    expect(dynamicSetupBody.authOrigin).toBe(dynamicOrigin);
    expect(dynamicAuth.status).toBe(200);
    expect(await dynamicAuth.text()).not.toContain(productionOrigin);
    expect(dynamicBootstrap.headers.get("Location")).not.toContain(productionOrigin);
    expect(dynamicAuth.headers.get("Location")).toBeNull();

    const proxyHarness = await createLocalBootstrapHarness();
    const childOrigin = "http://127.0.0.1:43128";
    const proxyOrigin = "https://ooga.formless.local";
    const forwardedHeaders = {
      "x-forwarded-host": "ooga.formless.local",
      "x-forwarded-proto": "https",
    };

    try {
      await configureProductionIdentity(proxyHarness, productionOrigin);

      const proxyBootstrap = await bootstrapLocalSession({
        init: { headers: forwardedHeaders },
        origin: childOrigin,
        reset: true,
        target: proxyHarness,
      });
      const proxyCookie = cookiePair(proxyBootstrap.headers.get("Set-Cookie"));
      const proxySession = await proxyHarness.mf.dispatchFetch(
        `${childOrigin}/api/formless/session`,
        {
          headers: { Cookie: proxyCookie, ...forwardedHeaders },
        },
      );
      const proxySetup = await proxyHarness.mf.dispatchFetch(`${childOrigin}/api/formless/setup`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          ...forwardedHeaders,
        },
      });
      const proxySetupBody = (await proxySetup.json()) as OwnerSetupStatusResponse;
      const proxyAuth = await proxyHarness.mf.dispatchFetch(`${childOrigin}/formless/auth`, {
        headers: { Cookie: proxyCookie, ...forwardedHeaders },
        redirect: "manual",
      });

      expect(proxyBootstrap.status).toBe(302);
      expect(proxyBootstrap.headers.get("Location")).toBe(
        `${proxyOrigin}/local-session?reset=1&redirectTo=%2F`,
      );
      expect(proxyBootstrap.headers.get("Set-Cookie")).toContain(`${OWNER_SESSION_COOKIE_NAME}=`);
      expect(proxySession.status).toBe(200);
      expect(proxySetup.status).toBe(200);
      expect(proxySetupBody.authOrigin).toBe(proxyOrigin);
      expect(proxyAuth.status).toBe(200);
      expect(await proxyAuth.text()).not.toContain(productionOrigin);
      expect(proxyBootstrap.headers.get("Location")).not.toContain(productionOrigin);
      expect(proxyAuth.headers.get("Location")).toBeNull();
    } finally {
      await proxyHarness.dispose();
    }
  });

  it("rejects invalid, replayed, cross-origin, and non-local bootstrap requests", async () => {
    const invalid = await harness.fetch(`${LOCAL_SESSION_BOOTSTRAP_API_PATH}?token=wrong`, {
      redirect: "manual",
    });
    const invalidBody = await invalid.json();
    const crossOrigin = await bootstrapLocalSession({
      init: { headers: { Origin: "http://evil.example.com" } },
    });
    const crossOriginBody = await crossOrigin.json();
    const setupAfterRejected = await getJson<OwnerSetupStatusResponse>("/api/formless/setup");
    const accepted = await bootstrapLocalSession();
    const replay = await bootstrapLocalSession();
    const replayBody = await replay.json();
    const nonLocalHarness = await createLocalBootstrapHarness({
      FORMLESS_RUNTIME_PROFILE: "publishedSite",
    });

    try {
      const nonLocal = await nonLocalHarness.fetch(
        `${LOCAL_SESSION_BOOTSTRAP_API_PATH}?token=${localSessionBootstrapToken}`,
        { redirect: "manual" },
      );
      const nonLocalBody = await nonLocal.json();

      expect(invalid.status).toBe(401);
      expect(invalidBody).toEqual({
        error: "Local session bootstrap token is invalid.",
      });
      expect(crossOrigin.status).toBe(403);
      expect(crossOriginBody).toEqual({
        error: "Local session bootstrap requests must be same-origin.",
      });
      expect(setupAfterRejected.body).toEqual({
        authOrigin: "https://example.com",
        setupComplete: false,
      });
      expect(accepted.status).toBe(302);
      expect(accepted.headers.get("Location")).toBe("http://example.com/");
      expect(replay.status).toBe(401);
      expect(replayBody).toEqual({
        error: "Local session bootstrap token is invalid.",
      });
      expect(nonLocal.status).toBe(404);
      expect(nonLocalBody).toEqual({ error: "Not found." });
      expect(nonLocal.headers.get("Set-Cookie")).toBeNull();
    } finally {
      await nonLocalHarness.dispose();
    }
  });
});

async function bootstrapLocalSession({
  init = {},
  origin = "http://example.com",
  redirectTo,
  reset = false,
  target = harness,
}: {
  init?: HarnessFetchInit;
  origin?: string;
  redirectTo?: string;
  reset?: boolean;
  target?: Harness;
} = {}) {
  const url = new URL(
    `${LOCAL_SESSION_BOOTSTRAP_API_PATH}?token=${localSessionBootstrapToken}`,
    origin,
  );

  if (redirectTo !== undefined) {
    url.searchParams.set("redirectTo", redirectTo);
  }
  if (reset) {
    url.searchParams.set("reset", "1");
  }

  const requestTarget =
    origin === "http://example.com" ? `${url.pathname}${url.search}` : url.toString();

  if (origin !== "http://example.com") {
    return target.mf.dispatchFetch(requestTarget, {
      ...init,
      redirect: "manual",
    });
  }

  return target.fetch(requestTarget, {
    ...init,
    redirect: "manual",
  });
}

async function configureProductionIdentity(target: Harness, productionOrigin: string) {
  const response = await target.fetch("/api/formless/program/operations/instance-settings/create", {
    body: JSON.stringify({
      idempotencyKey: "configure-deployed-production-identity",
      input: {
        authOrigin: productionOrigin,
        canonicalOrigin: productionOrigin,
        productionIdentityStatus: "configured",
        settingsId: INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
      },
    }),
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  expect(response.status).toBe(200);
}

async function createSiteInstall(input: { cookie: string | null }) {
  return harness.fetch("/api/formless/app-installs", {
    body: JSON.stringify({
      packageAppKey: "test-crm",
      installId: "crm",
      label: "CRM",
    }),
    headers: {
      "Content-Type": "application/json",
      ...(input.cookie === null ? {} : { Cookie: input.cookie }),
    },
    method: "POST",
  });
}

async function getJson<T>(path: string, init?: HarnessFetchInit) {
  const response = await harness.fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${adminToken}`,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });

  expect(response.status).toBe(200);

  return {
    body: (await response.json()) as T,
    response,
  };
}

function cookiePair(cookie: string | null) {
  if (!cookie) {
    throw new Error("Missing Set-Cookie header.");
  }

  return cookie.split(";")[0] ?? cookie;
}

function createLocalBootstrapHarness(bindings: Record<string, string> = {}) {
  return createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        FORMLESS_OWNER_SESSION_SECRET: ownerSessionSecret,
        FORMLESS_RUNTIME_PROFILE: "instance",
        [LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV]: localSessionBootstrapToken,
        [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: "local-gateway-proxy-token",
        [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]: "http://127.0.0.1:1",
        ...bindings,
      },
    },
  );
}
