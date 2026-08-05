import { createHash, generateKeyPairSync, type KeyObject } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID } from "@dpeek/formless-instance-control-plane";
import {
  FORMLESS_PROGRAM_API_ROUTE_PREFIX,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
} from "../program/target.ts";
import {
  IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_PATH,
  IDENTITY_COLLABORATOR_INVITATIONS_API_PATH,
  IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX,
} from "@dpeek/formless-identity-control-plane";
import { runtimeTopologyRoutes, type RuntimeProfileKind } from "../shared/runtime-topology.ts";
import {
  COLLABORATOR_INVITATION_ACCEPT_PATH,
  accountRedirectLocationForRoute,
} from "../shared/instance-auth.ts";
import type { EmailDeliveryRenderedMessage } from "../shared/email-runtime.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { INTERNAL_RESET_INSTANCE_DOMAIN_MAPPINGS_PATH } from "./instance-domain-mappings.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { INTERNAL_RESET_OWNER_SETUP_PATH } from "./owner-setup.ts";
import { createOwnerSessionCookie, OWNER_SESSION_COOKIE_NAME } from "./owner-session.ts";
import { CENTRAL_AUTH_SESSION_COOKIE_NAME } from "./central-auth-session.ts";
import { PROGRAM_SESSION_API_PATH } from "./program-session.ts";
import {
  HOST_AUTH_NONCE_COOKIE_NAME,
  HOST_AUTH_SESSION_COOKIE_NAME,
  INSTANCE_AUTH_HANDOFF_CALLBACK_PATH,
  INSTANCE_AUTH_HANDOFF_START_PATH,
} from "./instance-auth-handoff.ts";
import {
  instanceControlPlaneTestStorageSnapshot,
  operationWriteRequest,
  restoreTestStorageSnapshot,
} from "../test/authority-write.ts";
import { ensureTestIdentityOwner } from "../test/identity-owner.ts";
import { identityControlPlaneEntityNames } from "@dpeek/formless-identity-control-plane";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { StoredRecord } from "@dpeek/formless-storage";
import { testSiteRecords } from "../test/site-records.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;
type DispatchFetchInit = Parameters<Harness["mf"]["dispatchFetch"]>[1];

const adminToken = "test-admin-token";
const controlPlaneApi = "/api/formless/program";
const programAdministratorRoleId = "role_04144de6-7927-49f2-826a-cdcc70c47357";
const mappedHost = "www.example.com";
const mappedInstanceHost = "admin.example.com";
const setupToken = "abcDEF0123456789_-abcDEF0123456789_-";

let harness: Harness;
let defaultHarness: Harness;
let harnessDir: string;
let harnessPath: string;
let assetRequests: string[];
let activeAuthOrigin = "https://www.example.com";
const routeRecordIds = new Map<string, string>();

beforeAll(async () => {
  harnessPath = await writeCustomDomainHarness();
  defaultHarness = await createCustomDomainHarness("instance");
});

beforeEach(() => {
  harness = defaultHarness;
  assetRequests = [];
  routeRecordIds.clear();
});

afterAll(async () => {
  await defaultHarness.dispose();
  await rm(harnessDir, { force: true, recursive: true });
});

describe("instance custom-domain Worker routing", () => {
  it("seeds passkey auth config from the configured production origin", async () => {
    await resetWorkerState(harness, ["controlPlane", "auth"]);
    await setupPrimaryProductionIdentity();
    await expectAuthConfigMissing(harness);
    await expectAuthConfigRp(harness, "www.example.com", "example.com");
  });

  it("redirects an anonymous instance profile custom host instead of public Site SSR", async () => {
    await withHarness(await createCustomDomainHarness("publishedSite"), async () => {
      await createRouteRecord("route:host:instance:admin.example.com", {
        enabled: true,
        matchHost: "admin.example.com",
        matchPath: "/",
        matchPrefix: "/",
        kind: "mount",
        targetProfile: "instance",
      });
      assetRequests = [];

      const home = await fetchHost("admin.example.com", "/", {
        headers: { Accept: "text/html" },
        redirect: "manual",
      });
      const publicSitePage = await fetchHost(
        "admin.example.com",
        "/blog/shipping-schema-backed-authoring",
        {
          headers: { Accept: "text/html" },
          redirect: "manual",
        },
      );
      const staleOwnerSession = await createOwnerSessionCookie({
        env: { FORMLESS_ADMIN_TOKEN: adminToken },
        maxAgeSeconds: 60,
        now: "2999-01-01T00:00:00.000Z",
        owner: {
          id: "stale-owner",
          name: "Stale Owner",
          createdAt: "2999-01-01T00:00:00.000Z",
        },
        request: new Request("http://admin.example.com/"),
      });
      const staleCookieHome = await fetchHost("admin.example.com", "/", {
        headers: {
          Accept: "text/html",
          Cookie: cookiePair(staleOwnerSession.cookie),
        },
        redirect: "manual",
      });
      const mappingLookup = await fetchHost(
        "admin.example.com",
        "/api/formless/domain-mappings/lookup?host=admin.example.com&profile=instance",
        { headers: adminHeaders() },
      );
      const schemaKeyApi = await fetchHost("admin.example.com", "/api/site/bootstrap");

      expect(home.status).toBe(302);
      expect(home.headers.get("Location")).toBe(accountRedirectLocationForRoute("/"));
      expect(publicSitePage.status).toBe(302);
      expect(publicSitePage.headers.get("Location")).toBe(
        accountRedirectLocationForRoute("/blog/shipping-schema-backed-authoring"),
      );
      expect(staleCookieHome.status).toBe(302);
      expect(staleCookieHome.headers.get("Location")).toBe(accountRedirectLocationForRoute("/"));
      expect(mappingLookup.status).toBe(200);
      expect(schemaKeyApi.status).toBe(404);
      expect(assetRequests).toEqual([]);
    });
  });

  it("continues same-origin Workers.dev instance targets without exact-host routes", async () => {
    await withWorkersDevAuthHarness(async (deploymentOrigin) => {
      await resetWorkerState(harness, ["controlPlane", "auth"]);

      await configureHarnessAuth(deploymentOrigin);
      const owner = await ensureTestIdentityOwner(harness, adminToken, {
        name: "Workers Dev Owner",
        email: "owner@example.com",
      });
      const centralCookie = await createCentralAuthSessionCookieForPrincipal(
        owner.id,
        deploymentOrigin,
      );
      const accountPath = `${runtimeTopologyRoutes.authAccountRoute}?returnTo=%2Fsettings%2Faccess`;

      expect(accountPath).toBe(
        `${runtimeTopologyRoutes.authAccountRoute}?returnTo=%2Fsettings%2Faccess`,
      );

      const unauthenticated = await harness.mf.dispatchFetch(`${deploymentOrigin}${accountPath}`, {
        headers: { Accept: "text/html" },
        redirect: "manual",
      });
      const authenticated = await harness.mf.dispatchFetch(`${deploymentOrigin}${accountPath}`, {
        headers: { Accept: "text/html", Cookie: centralCookie },
        redirect: "manual",
      });

      expect(unauthenticated.status).toBe(302);
      expect(unauthenticated.headers.get("Location")).toBe(
        accountRedirectLocationForRoute(accountPath),
      );
      expect(authenticated.status).toBe(302);
      expect(authenticated.headers.get("Location")).toBe("/settings/access");
    });
  });

  it("returns owners and Program administrators through account continuation to instance management", async () => {
    await resetWorkerState(harness, ["controlPlane", "auth"]);
    await setupPrimaryProductionIdentity();
    await patchRouteRecord("route:primary-production", { access: "management" });

    const owner = await ensureTestIdentityOwner(harness, adminToken, {
      name: "Management Journey Owner",
    });
    const ownerCookie = await createCentralAuthSessionCookieForPrincipal(owner.id);
    const programAdministrator = await createInstanceAdminPrincipalSessionCookie(
      "Management Journey Admin",
    );
    const ordinary = await createActivePrincipalSessionCookie("Management Journey App User");
    const accountPath = `${runtimeTopologyRoutes.authAccountRoute}?returnTo=%2Fsettings%2Faccess`;

    for (const cookie of [ownerCookie, programAdministrator.cookie]) {
      const status = await fetchAuth(accountPath, {
        headers: { Accept: "application/json", Cookie: cookie },
        redirect: "manual",
      });
      const statusBody = (await status.json()) as {
        continueTo?: string;
        status?: string;
      };
      const browser = await fetchAuth(accountPath, {
        headers: { Accept: "text/html", Cookie: cookie },
        redirect: "manual",
      });

      expect(status.status, JSON.stringify(statusBody)).toBe(200);
      expect(statusBody).toMatchObject({
        continueTo: "/settings/access",
        status: "complete",
      });
      expect(browser.status).toBe(302);
      expect(browser.headers.get("Location")).toBe("/settings/access");
    }

    const forbiddenStatus = await fetchAuth(accountPath, {
      headers: { Accept: "application/json", Cookie: ordinary.cookie },
      redirect: "manual",
    });
    const forbiddenBody = (await forbiddenStatus.json()) as {
      principal?: {
        displayName?: string;
        principalId?: string;
      };
      status?: string;
    };
    const forbiddenBrowser = await fetchAuth(accountPath, {
      headers: { Accept: "text/html", Cookie: ordinary.cookie },
      redirect: "manual",
    });

    expect(forbiddenStatus.status).toBe(403);
    expect(forbiddenBody).toMatchObject({
      principal: {
        displayName: "Management Journey App User",
        principalId: ordinary.principalId,
      },
      status: "forbidden",
    });
    expect(forbiddenBrowser.status).toBe(200);
    expect(forbiddenBrowser.headers.get("Location")).toBeNull();
    expect(JSON.stringify(forbiddenBody)).not.toContain("/settings/access");
    expect(JSON.stringify(forbiddenBody)).not.toContain("routeId");
  });

  it("reports, revokes, and clears central auth-origin sessions", async () => {
    await resetWorkerState(harness, ["controlPlane", "auth"]);
    await setupPrimaryProductionIdentity();

    const owner = await ensureTestIdentityOwner(harness, adminToken, {
      name: "Central Session Owner",
    });
    const centralCookie = await createCentralAuthSessionCookieForPrincipal(owner.id);
    const deployedOwnerSession = await createOwnerSessionCookie({
      env: { FORMLESS_ADMIN_TOKEN: adminToken },
      maxAgeSeconds: 60,
      now: "2999-01-01T00:00:00.000Z",
      owner,
      request: new Request("https://www.example.com/"),
    });
    const centralStatus = await fetchHost("www.example.com", "/api/formless/session", {
      headers: { Cookie: centralCookie },
    });
    const centralStatusBody = (await centralStatus.json()) as {
      authenticated?: boolean;
      principal?: {
        principalId?: string;
      };
      session?: {
        expiresAt?: string;
      };
      setupComplete?: boolean;
    };
    const deployedOwnerStatus = await fetchHost("www.example.com", "/api/formless/session", {
      headers: { Cookie: cookiePair(deployedOwnerSession.cookie) },
    });
    const deployedOwnerStatusBody = (await deployedOwnerStatus.json()) as {
      authenticated?: boolean;
      principal?: {
        principalId?: string;
      };
      setupComplete?: boolean;
    };
    const logout = await fetchHost("www.example.com", "/api/formless/session/logout", {
      headers: { Cookie: centralCookie },
      method: "POST",
    });
    const logoutBody = (await logout.json()) as {
      authenticated?: boolean;
    };
    const afterLogout = await fetchHost("www.example.com", "/api/formless/session", {
      headers: { Cookie: centralCookie },
    });
    const afterLogoutBody = (await afterLogout.json()) as {
      authenticated?: boolean;
      principal?: {
        principalId?: string;
      };
      setupComplete?: boolean;
    };
    const logoutSetCookie = requiredHeader(logout, "Set-Cookie");

    expect(centralStatus.status).toBe(200);
    expect(centralStatusBody).toMatchObject({
      authenticated: true,
      principal: { principalId: owner.id },
      setupComplete: true,
    });
    expect(Date.parse(centralStatusBody.session?.expiresAt ?? "")).toBeGreaterThan(0);
    expect(deployedOwnerStatus.status).toBe(200);
    expect(deployedOwnerStatusBody).toMatchObject({
      authenticated: false,
      setupComplete: true,
    });
    expect(deployedOwnerStatusBody).not.toHaveProperty("principal");
    expect(logout.status).toBe(200);
    expect(logoutBody.authenticated).toBe(false);
    expect(logoutSetCookie).toContain(`${CENTRAL_AUTH_SESSION_COOKIE_NAME}=;`);
    expect(logoutSetCookie).not.toContain(`${OWNER_SESSION_COOKIE_NAME}=`);
    expect(afterLogout.status).toBe(200);
    expect(afterLogoutBody).toMatchObject({
      authenticated: false,
      setupComplete: true,
    });
    expect(afterLogoutBody).not.toHaveProperty("principal");
  });

  it("returns strict Program session states while direct deep links remain server-authorized", async () => {
    await resetWorkerState(harness, ["controlPlane", "auth"]);
    await setupPrimaryProductionIdentity();
    await patchRouteRecord("route:primary-production", { access: "authenticated" });

    const owner = await ensureTestIdentityOwner(harness, adminToken, {
      name: "Program Session Owner",
    });
    const ownerCookie = await createCentralAuthSessionCookieForPrincipal(owner.id);
    const incompleteAdministrator = await createInstanceAdminPrincipalSessionCookie(
      "Program Session Incomplete Administrator",
    );
    const ordinary = await createActivePrincipalSessionCookie("Program Session Ordinary User");
    const path = `${PROGRAM_SESSION_API_PATH}?returnTo=%2Ftasks`;
    const anonymous = await fetchHost("www.example.com", path);
    const blocked = await fetchHost("www.example.com", path, {
      headers: { Cookie: incompleteAdministrator.cookie },
    });
    const forbidden = await fetchHost("www.example.com", path, {
      headers: { Cookie: ordinary.cookie },
    });
    const ready = await fetchHost("www.example.com", path, {
      headers: { Cookie: ownerCookie },
    });
    const unsafe = await fetchHost(
      "www.example.com",
      `${PROGRAM_SESSION_API_PATH}?returnTo=${encodeURIComponent("https://evil.example.com/tasks")}`,
    );
    const directForbidden = await fetchHost("www.example.com", "/tasks", {
      headers: { Accept: "text/html", Cookie: ordinary.cookie },
      redirect: "manual",
    });
    const directReady = await fetchHost("www.example.com", "/tasks", {
      headers: { Accept: "text/html", Cookie: ownerCookie },
      redirect: "manual",
    });
    const anonymousBody = (await anonymous.json()) as Record<string, unknown>;
    const blockedBody = (await blocked.json()) as Record<string, unknown>;
    const forbiddenBody = (await forbidden.json()) as Record<string, unknown>;
    const readyBody = (await ready.json()) as Record<string, unknown>;
    const unsafeBody = (await unsafe.json()) as Record<string, unknown>;
    const routeId = routeRecordIds.get("route:primary-production");

    expect(anonymous.status).toBe(200);
    expect(anonymousBody).toEqual({ setupComplete: true, status: "anonymous" });
    expect(blocked.status).toBe(200);
    expect(blockedBody).toMatchObject({
      accountCompletion: {
        status: "blocked",
        target: {
          access: "authenticated",
          returnTo: "/tasks",
          routeId,
          targetOrigin: "https://www.example.com",
          targetProfile: "instance",
        },
      },
      principal: { principalId: incompleteAdministrator.principalId },
      status: "blocked",
      target: {
        routeAccess: "authenticated",
        routeId,
        storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
        targetOrigin: "https://www.example.com",
        targetProfile: "instance",
      },
    });
    expect(forbidden.status).toBe(200);
    expect(forbiddenBody).toMatchObject({
      principal: { principalId: ordinary.principalId },
      status: "forbidden",
    });
    expect(forbiddenBody).not.toHaveProperty("callerFacts");
    expect(forbiddenBody).not.toHaveProperty("target");
    expect(ready.status).toBe(200);
    expect(ready.headers.get("Cache-Control")).toBe("no-store");
    expect(readyBody).toMatchObject({
      callerFacts: { active: true, kind: "principal", owner: true },
      principal: { principalId: owner.id },
      status: "ready",
      target: {
        routeAccess: "authenticated",
        routeId,
        storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
        targetOrigin: "https://www.example.com",
        targetProfile: "instance",
      },
    });
    expect(JSON.stringify(readyBody)).not.toContain("sessionId");
    expect(JSON.stringify(readyBody)).not.toContain("sessionVersion");
    expect(unsafe.status).toBe(400);
    expect(unsafeBody).toEqual({ code: "invalid-request" });
    expect(directForbidden.status).toBe(403);
    expect(directReady.status).toBe(200);
  });

  it("returns a ready Program session through the local owner-session reader", async () => {
    await withHarness(
      await createCustomDomainHarness("instance", {
        FORMLESS_LOCAL_SESSION_BOOTSTRAP_TOKEN: "local-bootstrap-token",
        FORMLESS_WORKSPACE_GATEWAY_CSRF_TOKEN: "local-csrf-token",
        FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN: "local-proxy-token",
        FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL: "http://127.0.0.1:4010",
      }),
      async () => {
        await resetWorkerState(harness, ["controlPlane", "auth"]);
        const owner = await ensureTestIdentityOwner(harness, adminToken, {
          name: "Local Program Session Owner",
        });
        const ownerSession = await createOwnerSessionCookie({
          env: { FORMLESS_ADMIN_TOKEN: adminToken },
          owner,
          request: new Request("http://localhost/"),
        });
        const response = await fetchHost(
          "localhost",
          `${PROGRAM_SESSION_API_PATH}?returnTo=%2Ftasks`,
          { headers: { Cookie: cookiePair(ownerSession.cookie) } },
        );
        const body = (await response.json()) as Record<string, unknown>;

        expect(response.status).toBe(200);
        expect(body).toMatchObject({
          callerFacts: { active: true, kind: "principal", owner: true },
          principal: { principalId: owner.id },
          status: "ready",
          target: {
            routeAccess: "anonymous",
            routeId: "runtime:instance",
            storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
            targetOrigin: "http://localhost",
            targetProfile: "instance",
          },
        });
      },
    );
  });

  it("accepts central auth-origin Program administrator sessions for management APIs", async () => {
    await resetWorkerState(harness, ["controlPlane", "auth"]);
    await setupPrimaryProductionIdentity();

    const programAdministrator = await createInstanceAdminPrincipalSessionCookie(
      "Central Program Administrator",
    );
    const ordinary = await createActivePrincipalSessionCookie("Central Ordinary Principal");
    const adminRead = await fetchHost("www.example.com", `${controlPlaneApi}/bootstrap`, {
      headers: { Cookie: programAdministrator.cookie },
    });
    const ordinaryRead = await fetchHost("www.example.com", `${controlPlaneApi}/bootstrap`, {
      headers: { Cookie: ordinary.cookie },
    });
    const adminReadBody = (await adminRead.json()) as {
      records?: unknown[];
    };
    const ordinaryReadBody = (await ordinaryRead.json()) as {
      error?: string;
    };
    expect(adminRead.status).toBe(200);
    expect(Array.isArray(adminReadBody.records)).toBe(true);
    expect(ordinaryRead.status).toBe(401);
    expect(ordinaryReadBody.error).toBe(
      "Current Program member, owner, or admin authorization is required for this read endpoint.",
    );
  });

  it("carries an accepted Program administrator invitation into Settings and Access", async () => {
    await resetWorkerState(harness, ["controlPlane", "auth"]);
    await setupPrimaryProductionIdentity();
    await patchRouteRecord("route:primary-production", { access: "management" });
    await configureAuthEmail({ settingsMode: "update", testKey: "program-administrator-journey" });

    const accepted = await inviteAndAcceptCollaborator({
      displayName: "Invited Program Administrator",
      roleAssignment: {
        roleId: programAdministratorRoleId,
        scopeKind: "program",
      },
      targetEmail: "invited-program-administrator@example.com",
      targetSurface: "instance",
      testKey: "program-administrator-journey",
    });
    const settings = await fetchAuth("/settings/access", {
      headers: { Accept: "text/html", Cookie: accepted.cookie },
      redirect: "manual",
    });
    const access = await fetchAuth("/settings/access", {
      headers: { Accept: "text/html", Cookie: accepted.cookie },
      redirect: "manual",
    });
    const accessSummary = await fetchAuth(
      `${IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX}${IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_PATH}`,
      { headers: { Cookie: accepted.cookie } },
    );
    const ownerRecovery = await fetchAuth("/api/formless/setup/capability", {
      body: "not-json",
      headers: {
        "Content-Type": "application/json",
        Cookie: accepted.cookie,
      },
      method: "POST",
    });

    expect(accepted.verify.status).toBe(200);
    expect(settings.status).toBe(200);
    expect(access.status).toBe(200);
    expect(accessSummary.status).toBe(200);
    expect(ownerRecovery.status).toBe(401);
  }, 10000);

  it("starts mapped instance handoff and redirects its sign-in gate to the auth origin", async () => {
    await resetWorkerState(harness, ["controlPlane", "auth"]);
    await setupPrimaryProductionIdentity();
    await setupMappedInstance();
    assetRequests = [];

    const mappedInstanceRouteId = routeRecordIds.get(`route:host:instance:${mappedInstanceHost}`);
    const protectedRoute = await fetchHost(mappedInstanceHost, "/settings/routes", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    const signIn = await fetchHost(
      mappedInstanceHost,
      `${runtimeTopologyRoutes.authAccountSignInRoute}?redirectTo=%2Fsettings%2Froutes`,
      {
        headers: { Accept: "text/html" },
        redirect: "manual",
      },
    );
    const protectedRouteUrl = new URL(requiredHeader(protectedRoute, "Location"));
    const protectedRouteSetCookie = requiredHeader(protectedRoute, "Set-Cookie");

    expect(protectedRoute.status).toBe(302);
    expect(protectedRouteUrl.origin).toBe("https://www.example.com");
    expect(protectedRouteUrl.pathname).toBe(runtimeTopologyRoutes.authAccountRoute);
    expect(protectedRouteUrl.searchParams.get("targetOrigin")).toBe(
      `https://${mappedInstanceHost}`,
    );
    expect(protectedRouteUrl.searchParams.get("routeId")).toBe(mappedInstanceRouteId);
    expect(protectedRouteUrl.searchParams.get("targetProfile")).toBe("instance");
    expect(protectedRouteUrl.searchParams.get("returnTo")).toBe("/settings/routes");
    expect(protectedRouteUrl.searchParams.get("nonceHash")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(protectedRouteUrl.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(protectedRouteSetCookie).toContain(`${HOST_AUTH_NONCE_COOKIE_NAME}=`);
    expect(protectedRouteSetCookie).not.toContain(`${OWNER_SESSION_COOKIE_NAME}=`);
    expect(protectedRouteSetCookie).not.toContain(`${HOST_AUTH_SESSION_COOKIE_NAME}=`);

    expect(signIn.status).toBe(302);
    expect(signIn.headers.get("Location")).toBe(
      `https://www.example.com${runtimeTopologyRoutes.authAccountSignInRoute}?redirectTo=%2Fsettings%2Froutes`,
    );
    expect(signIn.headers.get("Set-Cookie")).toBeNull();
    expect(assetRequests).toEqual([]);
  });

  it("returns auth-origin admin handoff callbacks to host-local instance sessions", async () => {
    await resetWorkerState(harness, ["controlPlane", "auth"]);
    await setupPrimaryProductionIdentity();
    await setupMappedInstance();

    const owner = await ensureTestIdentityOwner(harness, adminToken, {
      name: "Mapped Admin Callback Owner",
    });
    await createVerifiedPrimaryEmail(owner.id, "mapped-admin-callback-owner@example.com");
    await createPrivateCredentialForPrincipal(owner.id, "Mapped Admin Callback Owner");

    const sessionCookie = await createCentralAuthSessionCookieForPrincipal(owner.id);
    const start = await fetchHost(mappedInstanceHost, "/settings/routes", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    const nonceCookie = cookiePair(requiredHeader(start, "Set-Cookie"));
    const startLocation = requiredHeader(start, "Location");
    const startUrl = new URL(startLocation);
    const mappedInstanceRouteId = routeRecordIds.get(`route:host:instance:${mappedInstanceHost}`);
    const {
      account: accountContinuation,
      grant,
      handoffUrl,
    } = await issueHandoffGrantFromAuthAccount(startLocation, sessionCookie);
    const callbackUrl = new URL(requiredHeader(grant, "Location"));
    const callback = await harness.mf.dispatchFetch(callbackUrl.toString(), {
      headers: { Cookie: nonceCookie },
      redirect: "manual",
    });

    expect(start.status).toBe(302);
    expect(startUrl.origin).toBe("https://www.example.com");
    expect(startUrl.pathname).toBe(runtimeTopologyRoutes.authAccountRoute);
    expect(startUrl.searchParams.get("targetOrigin")).toBe(`https://${mappedInstanceHost}`);
    expect(startUrl.searchParams.get("routeId")).toBe(mappedInstanceRouteId);
    expect(startUrl.searchParams.get("targetProfile")).toBe("instance");
    expect(startUrl.searchParams.get("returnTo")).toBe("/settings/routes");

    expect(accountContinuation.status).toBe(302);
    expect(handoffUrl.origin).toBe("https://www.example.com");
    expect(handoffUrl.pathname).toBe(INSTANCE_AUTH_HANDOFF_START_PATH);
    expect(handoffUrl.searchParams.get("targetOrigin")).toBe(`https://${mappedInstanceHost}`);
    expect(handoffUrl.searchParams.get("routeId")).toBe(mappedInstanceRouteId);
    expect(handoffUrl.searchParams.get("targetProfile")).toBe("instance");
    expect(handoffUrl.searchParams.get("returnTo")).toBe("/settings/routes");

    expect(grant.status).toBe(302);
    expect(callbackUrl.origin).toBe(`https://${mappedInstanceHost}`);
    expect(callbackUrl.pathname).toBe(INSTANCE_AUTH_HANDOFF_CALLBACK_PATH);
    expect(callbackUrl.searchParams.get("grantId")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(callbackUrl.searchParams.get("grantSecret")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(callbackUrl.searchParams.get("state")).toBe(handoffUrl.searchParams.get("state"));
    expect(requiredHeader(grant, "Location")).not.toContain("nonceHash=");

    expect(callback.status).toBe(302);
    expect(callback.headers.get("Location")).toBe("/settings/routes");
    const setCookie = requiredHeader(callback, "Set-Cookie");
    const hostSessionPayload = signedCookiePayload(setCookie, HOST_AUTH_SESSION_COOKIE_NAME);
    const hostSessionCookie = cookiePair(setCookie);
    const sessionStatus = await fetchHost(mappedInstanceHost, "/api/formless/session", {
      headers: { Cookie: hostSessionCookie },
    });
    const sessionStatusBody = (await sessionStatus.json()) as {
      authenticated?: boolean;
      principal?: {
        principalId?: string;
      };
      session?: {
        expiresAt?: string;
      };
      setupComplete?: boolean;
    };
    const logout = await fetchHost(mappedInstanceHost, "/api/formless/session/logout", {
      headers: { Cookie: hostSessionCookie },
      method: "POST",
    });
    const logoutBody = (await logout.json()) as {
      authenticated?: boolean;
    };
    const logoutSetCookie = requiredHeader(logout, "Set-Cookie");
    expect(setCookie).toContain(`${HOST_AUTH_SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain(`${HOST_AUTH_NONCE_COOKIE_NAME}=;`);
    expect(setCookie).not.toContain(`${OWNER_SESSION_COOKIE_NAME}=`);
    expect(hostSessionPayload).toEqual(
      expect.objectContaining({
        access: "owner",
        instanceId: "www.example.com",
        principalId: owner.id,
        purpose: "host-session",
        routeId: mappedInstanceRouteId,
        sessionVersion: 0,
        targetOrigin: `https://${mappedInstanceHost}`,
        targetProfile: "instance",
        version: 1,
      }),
    );

    expect(sessionStatus.status).toBe(200);
    expect(sessionStatusBody).toMatchObject({
      authenticated: true,
      principal: { principalId: owner.id },
      setupComplete: true,
    });
    expect(Date.parse(sessionStatusBody.session?.expiresAt ?? "")).toBeGreaterThan(0);

    expect(logout.status).toBe(200);
    expect(logoutBody.authenticated).toBe(false);
    expect(logoutSetCookie).toContain(`${HOST_AUTH_SESSION_COOKIE_NAME}=;`);
    expect(logoutSetCookie).not.toContain(`${OWNER_SESSION_COOKIE_NAME}=`);
  });

  it("serves owner auth routes on mapped Program administrator hosts that are also the auth origin", async () => {
    await resetWorkerState(harness, ["controlPlane", "auth"]);
    await setupMappedInstance();

    const mappedInstanceRouteId = routeRecordIds.get(`route:host:instance:${mappedInstanceHost}`);

    expect(mappedInstanceRouteId).toBeDefined();

    await postAdminJson(`${controlPlaneApi}/operations/instance-settings/create`, {
      idempotencyKey: "instance-settings-mapped-instance-auth-origin",
      input: {
        settingsId: INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
        primaryRoute: mappedInstanceRouteId,
        authOrigin: `https://${mappedInstanceHost}`,
        productionIdentityStatus: "configured",
      },
    });
    assetRequests = [];

    const legacyLogin = await fetchHost(mappedInstanceHost, "/login", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    const signIn = await fetchHost(
      mappedInstanceHost,
      runtimeTopologyRoutes.authAccountSignInRoute,
      {
        headers: { Accept: "text/html" },
        redirect: "manual",
      },
    );
    const setup = await fetchHost(
      mappedInstanceHost,
      `${runtimeTopologyRoutes.authAccountSetupRoute}?token=${setupToken}`,
      {
        headers: { Accept: "text/html" },
        redirect: "manual",
      },
    );
    const account = await fetchHost(mappedInstanceHost, runtimeTopologyRoutes.authAccountRoute, {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    const accountReturn = await fetchHost(
      mappedInstanceHost,
      `${runtimeTopologyRoutes.authAccountRoute}?returnTo=%2Fsettings%2Froutes`,
      {
        headers: { Accept: "text/html" },
        redirect: "manual",
      },
    );
    const unsafeAccountReturn = await fetchHost(
      mappedInstanceHost,
      `${runtimeTopologyRoutes.authAccountRoute}?returnTo=${encodeURIComponent("https://evil.example.com/settings/routes")}`,
      {
        headers: { Accept: "application/json" },
        redirect: "manual",
      },
    );
    const unsafeAccountReturnBody = (await unsafeAccountReturn.json()) as {
      code?: string;
    };
    const setupCapability = await fetchHost(mappedInstanceHost, "/api/formless/setup/capability", {
      body: JSON.stringify({ setupToken }),
      headers: adminHeaders({ "Content-Type": "application/json" }),
      method: "POST",
    });
    const sessionStatus = await fetchHost(mappedInstanceHost, "/api/formless/session");
    const owner = await ensureTestIdentityOwner(harness, adminToken, {
      name: "Mapped Auth Origin Owner",
    });
    const ownerSessionCookie = await createCentralAuthSessionCookieForPrincipal(
      owner.id,
      `https://${mappedInstanceHost}`,
    );
    const authenticatedAccountReturn = await fetchHost(
      mappedInstanceHost,
      `${runtimeTopologyRoutes.authAccountRoute}?returnTo=%2Fsettings%2Froutes`,
      {
        headers: {
          Accept: "text/html",
          Cookie: ownerSessionCookie,
        },
        redirect: "manual",
      },
    );

    expect(legacyLogin.status).toBe(404);
    expect(signIn.status).toBe(200);
    expect(setup.status).toBe(200);
    expect(account.status).toBe(200);
    expect(accountReturn.status).toBe(302);
    expect(accountReturn.headers.get("Location")).toBe(
      accountRedirectLocationForRoute(
        `${runtimeTopologyRoutes.authAccountRoute}?returnTo=%2Fsettings%2Froutes`,
      ),
    );
    expect(unsafeAccountReturn.status).toBe(400);
    expect(unsafeAccountReturnBody.code).toBe("invalid-request");
    expect(authenticatedAccountReturn.status).toBe(302);
    expect(authenticatedAccountReturn.headers.get("Location")).toBe("/settings/routes");
    expect(setupCapability.status).toBe(200);
    expect(sessionStatus.status).toBe(200);
    expect(assetRequests).toEqual(["/index.html", "/index.html", "/index.html"]);
  });

  it("accepts host-local sessions for matched mapped instance control-plane APIs", async () => {
    await resetWorkerState(harness, ["controlPlane", "auth"]);
    await setupPrimaryProductionIdentity();
    await setupMappedInstance();

    const { cookie, setCookie } = await createMappedInstanceHostSession("Mapped Instance Owner");
    const staleVersionCookie = await hostSessionCookieWithPayload(setCookie, {
      sessionVersion: 1,
    });
    assetRequests = [];

    const shell = await fetchHost(mappedInstanceHost, "/settings/access", {
      headers: {
        Accept: "text/html",
        Cookie: cookie,
      },
    });
    const bootstrap = await fetchHost(mappedInstanceHost, `${controlPlaneApi}/bootstrap`, {
      headers: { Cookie: cookie },
    });
    const bootstrapBody = (await bootstrap.json()) as {
      records?: unknown[];
    };
    const routeWrite = await fetchHost(
      mappedInstanceHost,
      `${controlPlaneApi}/operations/route/create`,
      {
        body: JSON.stringify({
          idempotencyKey: "mapped-instance-host-session-route-create",
          input: {
            enabled: true,
            matchPath: "/host-session-route",
            kind: "mount",
            targetProfile: "instance",
            surface: "admin",
            access: "owner",
          },
        }),
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );
    const routeWriteBody = (await routeWrite.json()) as OperationInvocationResponse;
    const staleVersionBootstrap = await fetchHost(
      mappedInstanceHost,
      `${controlPlaneApi}/bootstrap`,
      {
        headers: { Cookie: staleVersionCookie },
      },
    );
    expect(shell.status).toBe(200);
    expect(bootstrap.status).toBe(200);
    expect(Array.isArray(bootstrapBody.records)).toBe(true);
    expect([200, 201]).toContain(routeWrite.status);
    expect(operationRecord(routeWriteBody).values).toMatchObject({
      matchPath: "/host-session-route",
      targetProfile: "instance",
    });
    expect(staleVersionBootstrap.status).toBe(401);
    expect(assetRequests).toEqual(["/index.html"]);
  });

  it("binds a ready Program session to its mapped host runtime target", async () => {
    await resetWorkerState(harness, ["controlPlane", "auth"]);
    await setupPrimaryProductionIdentity();
    await setupMappedInstance();

    const { cookie, owner } = await createMappedInstanceHostSession("Mapped Program Session Owner");
    const response = await fetchHost(
      mappedInstanceHost,
      `${PROGRAM_SESSION_API_PATH}?returnTo=%2Ftasks`,
      { headers: { Cookie: cookie } },
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      callerFacts: { active: true, kind: "principal", owner: true },
      principal: { principalId: owner.id },
      status: "ready",
      target: {
        routeAccess: "owner",
        routeId: routeRecordIds.get(`route:host:instance:${mappedInstanceHost}`),
        storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
        targetOrigin: `https://${mappedInstanceHost}`,
        targetProfile: "instance",
      },
    });
  });

  it("accepts mapped instance host-local sessions with current operational management authority", async () => {
    await resetWorkerState(harness, ["controlPlane", "auth"]);
    await setupPrimaryProductionIdentity();
    await setupMappedInstance();

    const programAdministrator = await createInstanceAdminPrincipalSessionCookie(
      "Mapped Program Administrator",
    );
    const adminCookie = await mappedInstanceHostSessionCookieForPrincipal(
      programAdministrator.principalId,
    );
    const owner = await createMappedInstanceHostSession("Mapped Instance Owner Still Works");

    const adminRead = await fetchHost(mappedInstanceHost, `${controlPlaneApi}/bootstrap`, {
      headers: { Cookie: adminCookie },
    });
    const adminReadBody = (await adminRead.json()) as {
      records?: unknown[];
    };
    const adminWrite = await fetchHost(
      mappedInstanceHost,
      `${controlPlaneApi}/operations/email-domain/create`,
      {
        body: JSON.stringify({
          idempotencyKey: "mapped-Program-administrator-email-domain",
          input: {
            enabled: true,
            providerFamily: "cloudflare",
            domain: "mapped-mail.example.com",
          },
        }),
        headers: {
          Cookie: adminCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );
    const adminWriteBody = (await adminWrite.json()) as OperationInvocationResponse;
    const ownerWrite = await fetchHost(
      mappedInstanceHost,
      `${controlPlaneApi}/operations/route/create`,
      {
        body: JSON.stringify({
          idempotencyKey: "mapped-instance-owner-route",
          input: {
            enabled: true,
            matchPath: "/owner-host-session-route",
            kind: "mount",
            targetProfile: "instance",
            surface: "admin",
            access: "owner",
          },
        }),
        headers: {
          Cookie: owner.cookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );
    const ownerWriteBody = (await ownerWrite.json()) as OperationInvocationResponse;
    expect(adminRead.status).toBe(200);
    expect(Array.isArray(adminReadBody.records)).toBe(true);
    expect(adminWrite.status).toBe(200);
    expect(operationRecord(adminWriteBody).values.domain).toBe("mapped-mail.example.com");
    expect(ownerWrite.status).toBe(200);
    expect(operationRecord(ownerWriteBody).values.matchPath).toBe("/owner-host-session-route");
  });

  it("reserves auth callbacks on mapped public Site hosts", async () => {
    await resetWorkerState(harness, ["controlPlane", "auth"]);
    await setupPrimaryProductionIdentity();
    await createRouteRecord("route:host:publicSite:site.example.com", {
      enabled: true,
      matchHost: "site.example.com",
      matchPath: "/",
      matchPrefix: "/",
      kind: "mount",
      targetProfile: "public-site",
      surface: "public-site",
    });
    assetRequests = [];

    const callback = await fetchHost("site.example.com", INSTANCE_AUTH_HANDOFF_CALLBACK_PATH, {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    const body = (await callback.json()) as {
      code: string;
    };
    expect(callback.status).toBe(400);
    expect(body.code).toBe("invalid-request");
    expect(assetRequests).toEqual([]);
  });

  it("serves mapped public Site documents and resources from Program storage", async () => {
    await restoreTestStorageSnapshot(
      harness,
      `${controlPlaneApi}/snapshot/restore`,
      instanceControlPlaneTestStorageSnapshot(testSiteRecords),
      adminHeaders(),
    );
    await setupMappedSite();
    assetRequests = [];

    const document = await fetchMappedHost("/", {
      headers: { Accept: "text/html" },
    });
    const robots = await fetchMappedHost("/robots.txt");
    const favicon = await fetchMappedHost("/favicon.svg");
    const html = await document.text();

    expect(document.status).toBe(200);
    expect(html).toContain("Home");
    expect(robots.status).toBe(200);
    expect(await robots.text()).toContain("User-agent: *");
    expect(favicon.status).toBe(200);
    expect(favicon.headers.get("Content-Type")).toBe("image/svg+xml; charset=utf-8");
    expect(assetRequests).toEqual(["/assets/formless-client-manifest.json"]);
  });

  it("resolves redirect route records with preserved path and query string", async () => {
    await resetWorkerState(harness, ["controlPlane"]);
    await createRouteRecord("route:redirect:old.example.com", {
      enabled: true,
      matchHost: "old.example.com",
      matchPath: "/",
      matchPrefix: "/",
      kind: "redirect",
      toHost: "new.example.com",
      statusCode: "308",
      preservePath: true,
      preserveQueryString: true,
    });
    const redirected = await fetchHost("old.example.com", "/docs/start?ref=old", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });

    expect(redirected.status).toBe(308);
    expect(redirected.headers.get("Location")).toBe("https://new.example.com/docs/start?ref=old");
    expect(assetRequests).toEqual([]);
  });

  it("returns not found for unmatched paths on redirect-captured hosts", async () => {
    await resetWorkerState(harness, ["controlPlane"]);
    await createRouteRecord("route:redirect:old.example.com", {
      enabled: true,
      matchHost: "old.example.com",
      matchPath: "/old",
      kind: "redirect",
      toHost: "new.example.com",
      statusCode: "308",
      preservePath: true,
      preserveQueryString: true,
    });
    assetRequests = [];

    const hostlessMount = await fetchHost("old.example.com", "/apps/site", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    const matchedRedirect = await fetchHost("old.example.com", "/old?ref=legacy", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });

    expect(hostlessMount.status).toBe(404);
    expect(matchedRedirect.status).toBe(308);
    expect(matchedRedirect.headers.get("Location")).toBe("https://new.example.com/old?ref=legacy");
    expect(assetRequests).toEqual([]);
  });

  it("stops mapped public Site routing after desired route disablement with provider evidence", async () => {
    await resetWorkerState(harness, ["controlPlane", "domainMappings"]);
    await restoreTestStorageSnapshot(
      harness,
      `${controlPlaneApi}/snapshot/restore`,
      instanceControlPlaneTestStorageSnapshot(testSiteRecords),
      adminHeaders(),
    );
    await setupMappedSite();
    await postAdminJson("/api/formless/domain-mappings/apply-evidence", {
      accountId: "account-123",
      action: "created",
      alchemyResourceId: "primary-custom-domain-www-example-com-publicsite",
      host: mappedHost,
      profile: "publicSite",
      provider: "cloudflare-worker-custom-domain",
      workerDomainId: "custom-domain-123",
      workerName: "formless-primary",
      zoneId: "zone-1",
      zoneName: "example.com",
    });
    await patchRouteRecord(`route:host:publicSite:${mappedHost}`, {
      enabled: false,
    });
    assetRequests = [];

    const home = await fetchMappedHost("/settings/access", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    const nested = await fetchMappedHost("/blog/shipping-schema-backed-authoring", {
      headers: { Accept: "text/html" },
    });

    expect(home.status).toBe(302);
    expect(home.headers.get("Location")).toBe(accountRedirectLocationForRoute("/settings/access"));
    expect(nested.status).toBe(404);
    expect(assetRequests).toEqual([]);
  });
});

async function expectAuthConfigRp(targetHarness: Harness, host: string, expectedRpId: string) {
  const origin = `https://${host}`;
  const status = await targetHarness.mf.dispatchFetch(`${origin}/api/formless/setup`);
  const configResponse = await targetHarness.durableObjectFetch(
    "FORMLESS_AUTHORITY",
    FORMLESS_INSTANCE_AUTHORITY_NAME,
    "/harness/auth/config",
  );
  const body = (await configResponse.json()) as {
    config: {
      relyingPartyId: string;
      relyingPartyName: string;
    } | null;
  };
  expect(status.status).toBe(200);
  expect(configResponse.status).toBe(200);
  expect(body.config).toMatchObject({
    relyingPartyId: expectedRpId,
    relyingPartyName: "Formless",
  });
}

async function expectAuthConfigMissing(targetHarness: Harness) {
  const response = await targetHarness.durableObjectFetch(
    "FORMLESS_AUTHORITY",
    FORMLESS_INSTANCE_AUTHORITY_NAME,
    "/harness/auth/config",
  );
  const body = (await response.json()) as {
    config: unknown;
  };
  expect(response.status).toBe(200);
  expect(body.config).toBeUndefined();
}

async function setupPrimaryProductionIdentity() {
  await createRouteRecord("route:primary-production", {
    enabled: true,
    matchHost: "www.example.com",
    matchPath: "/",
    matchPrefix: "/",
    kind: "mount",
    targetProfile: "instance",
    surface: "admin",
    access: "owner",
  });

  const primaryRoute = routeRecordIds.get("route:primary-production");

  expect(primaryRoute).toBeDefined();

  await postAdminJson(`${controlPlaneApi}/operations/instance-settings/create`, {
    idempotencyKey: "instance-settings-primary-production",
    input: {
      settingsId: INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
      primaryRoute,
      authRelyingPartyId: "example.com",
      productionIdentityStatus: "configured",
    },
  });
}

async function configureAuthEmail(input: { settingsMode: "create" | "update"; testKey: string }) {
  const emailDomain = await postAdminJson(`${controlPlaneApi}/operations/email-domain/create`, {
    idempotencyKey: `${input.testKey}-auth-email-domain`,
    input: {
      enabled: true,
      providerFamily: "cloudflare",
      domain: `${input.testKey}.mail.example.com`,
    },
  });
  const emailSender = await postAdminJson(`${controlPlaneApi}/operations/email-sender/create`, {
    idempotencyKey: `${input.testKey}-auth-email-sender`,
    input: {
      enabled: true,
      address: `auth@${input.testKey}.mail.example.com`,
      displayName: "Auth",
      purpose: "auth",
      emailDomain: operationRecord((await emailDomain.json()) as OperationInvocationResponse).id,
    },
  });
  const sender = operationRecord((await emailSender.json()) as OperationInvocationResponse);
  const domain = sender.values.emailDomain;

  if (typeof domain !== "string") {
    throw new Error("Expected auth email sender to reference an email domain.");
  }

  if (input.settingsMode === "create") {
    await postAdminJson(`${controlPlaneApi}/operations/instance-settings/create`, {
      idempotencyKey: `${input.testKey}-settings-auth-email`,
      input: {
        settingsId: INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
        defaultEmailDomain: domain,
        defaultAuthSender: sender.id,
        productionIdentityStatus: "unconfigured",
      },
    });
    return;
  }

  await postAdminJson(`${controlPlaneApi}/operations/instance-settings/update`, {
    idempotencyKey: `${input.testKey}-settings-auth-email`,
    recordId: await instanceSettingsRecordId(),
    input: {
      defaultEmailDomain: domain,
      defaultAuthSender: sender.id,
    },
  });
}

async function inviteAndAcceptCollaborator(input: {
  displayName: string;
  roleAssignment: {
    roleId: typeof programAdministratorRoleId;
    scopeKind: "program";
  };
  targetEmail: string;
  targetSurface: "instance";
  testKey: string;
}) {
  const invitationId = `invitation:${input.testKey}`;
  const principalId = `principal:${input.testKey}`;
  const roleAssignmentId = `role-assignment:${input.testKey}`;
  const invitationResponse = await postAdminJson(
    `${IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX}${IDENTITY_COLLABORATOR_INVITATIONS_API_PATH}`,
    {
      idempotencyKey: `invite-${input.testKey}`,
      invitationId,
      invitedPrincipal: {
        displayName: input.displayName,
        id: principalId,
      },
      now: new Date().toISOString(),
      principalEmail: {
        id: `principal-email:${input.testKey}`,
        primary: true,
        recovery: false,
      },
      roleAssignments: [
        {
          id: roleAssignmentId,
          ...input.roleAssignment,
        },
      ],
      targetEmail: input.targetEmail,
      targetSurface: input.targetSurface,
    },
  );
  const invitationBody = (await invitationResponse.json()) as {
    delivery?: {
      delivery?: {
        id?: string;
      };
      status?: string;
    };
  };
  const deliveryId = invitationBody.delivery?.delivery?.id;

  if (invitationBody.delivery?.status !== "scheduled" || !deliveryId) {
    throw new Error(
      `Expected collaborator invitation delivery, received ${JSON.stringify(invitationBody)}.`,
    );
  }

  const rendered = await readRenderedEmailMessage(deliveryId);
  const token = verificationTokenFromMessage(rendered.message);
  const optionsResponse = await fetchAuth(
    `${COLLABORATOR_INVITATION_ACCEPT_PATH}/passkeys/register/options`,
    {
      body: JSON.stringify({ invitationId, token }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  const optionsBody = (await optionsResponse.json()) as {
    options?: PublicKeyCredentialCreationOptionsJSON;
  };

  if (!optionsResponse.ok || !optionsBody.options) {
    throw new Error(
      `Expected invitation passkey options, received ${JSON.stringify(optionsBody)}.`,
    );
  }

  const passkey = new VirtualPasskey(
    Buffer.from(`invitation-credential:${input.testKey}`).toString("base64url"),
  );
  const verify = await fetchAuth(
    `${COLLABORATOR_INVITATION_ACCEPT_PATH}/passkeys/register/verify`,
    {
      body: JSON.stringify({
        invitationId,
        response: passkey.registrationResponse(optionsBody.options, {
          origin: "https://www.example.com",
          rpId: "example.com",
        }),
        token,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );

  if (!verify.ok) {
    throw new Error(
      `Expected collaborator invitation acceptance, received ${verify.status}: ${await verify.text()}.`,
    );
  }

  return {
    cookie: cookiePair(requiredHeader(verify, "Set-Cookie")),
    principalId,
    roleAssignmentId,
    verify,
  };
}

async function instanceSettingsRecordId(): Promise<string> {
  const response = await harness.fetch(`${controlPlaneApi}/bootstrap`, {
    headers: adminHeaders(),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    records?: StoredRecord[];
  };
  const settings = body.records?.find(
    (record) =>
      record.entity === "instance-settings" &&
      !record.deletedAt &&
      record.values.settingsId === INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
  );

  if (!settings) {
    throw new Error("Expected active instance-settings record.");
  }

  return settings.id;
}

async function setupMappedSite() {
  await setupMappedSiteRouteRecord();
}

async function setupMappedInstance(values: Record<string, unknown> = {}) {
  await createRouteRecord(`route:host:instance:${mappedInstanceHost}`, {
    enabled: true,
    matchHost: mappedInstanceHost,
    matchPath: "/",
    matchPrefix: "/",
    kind: "mount",
    targetProfile: "instance",
    surface: "admin",
    access: "owner",
    ...values,
  });
}

async function setupMappedSiteRouteRecord() {
  await createRouteRecord(`route:host:publicSite:${mappedHost}`, {
    enabled: true,
    matchHost: mappedHost,
    matchPath: "/",
    matchPrefix: "/",
    kind: "mount",
    targetProfile: "public-site",
    surface: "public-site",
  });
}

async function createRouteRecord(recordId: string, values: Record<string, unknown>) {
  const response = await harness.fetch(`${controlPlaneApi}/operations/route/create`, {
    body: JSON.stringify({
      idempotencyKey: `route-${recordId}`,
      input: withoutLifecycleValues(values),
    }),
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });

  expect([200, 201]).toContain(response.status);

  const body = (await response.json()) as OperationInvocationResponse;
  routeRecordIds.set(recordId, operationRecord(body).id);
}

async function patchRouteRecord(recordId: string, values: Record<string, unknown>) {
  const actualRecordId = routeRecordIds.get(recordId) ?? recordId;
  await postAdminJson(`${controlPlaneApi}/operations/route/update`, {
    idempotencyKey: `route-${actualRecordId}-patch`,
    recordId: actualRecordId,
    input: withoutLifecycleValues(values),
  });
}

function operationRecord(response: OperationInvocationResponse) {
  if (response.output.type !== "create" && response.output.type !== "update") {
    throw new Error(`Expected route write operation output, received "${response.output.type}".`);
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

function fetchMappedHost(path: string, init?: DispatchFetchInit) {
  return fetchHost(mappedHost, path, init);
}

function fetchHost(host: string, path: string, init?: DispatchFetchInit) {
  return fetchHarnessHost(harness, host, path, init);
}

function fetchHarnessHost(
  targetHarness: Harness,
  host: string,
  path: string,
  init?: DispatchFetchInit,
) {
  return targetHarness.mf.dispatchFetch(`http://${host}${path}`, init);
}

function cookiePair(cookie: string) {
  return cookie.split(";")[0] ?? cookie;
}

function fetchAuth(path: string, init?: DispatchFetchInit) {
  return harness.mf.dispatchFetch(`${activeAuthOrigin}${path}`, init);
}

async function readRenderedEmailMessage(deliveryId: string) {
  const response = await harness.durableObjectFetch(
    "FORMLESS_AUTHORITY",
    FORMLESS_INSTANCE_AUTHORITY_NAME,
    `/harness/internal-message/${encodeURIComponent(deliveryId)}`,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as {
    message?: EmailDeliveryRenderedMessage;
  };
}
function verificationTokenFromMessage(message: EmailDeliveryRenderedMessage | undefined): string {
  const match = message?.text.match(/[?&]token=([A-Za-z0-9_-]+)/);
  if (!match?.[1]) {
    throw new Error("Verification token was not rendered.");
  }

  return match[1];
}

async function issueHandoffGrantFromAuthAccount(startLocation: string, centralCookie: string) {
  const account = await harness.mf.dispatchFetch(startLocation, {
    headers: {
      Accept: "text/html",
      Cookie: centralCookie,
    },
    redirect: "manual",
  });
  const handoffUrl = new URL(requiredHeader(account, "Location"), startLocation);
  const grant = await harness.mf.dispatchFetch(handoffUrl.toString(), {
    headers: {
      Accept: "text/html",
      Cookie: centralCookie,
    },
    redirect: "manual",
  });

  return { account, grant, handoffUrl };
}

async function createActivePrincipalSessionCookie(
  displayName: string,
  origin = "https://www.example.com",
) {
  const response = await postAdminJson(
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/operations/principal/create`,
    {
      idempotencyKey: `active-principal-${displayName.replace(/\W+/g, "-").toLowerCase()}`,
      input: {
        displayName,
        kind: "human",
        status: "active",
      },
    },
  );
  const principal = operationRecord((await response.json()) as OperationInvocationResponse);
  const centralCookie = await createCentralAuthSessionCookieForPrincipal(principal.id, origin);

  return {
    cookie: centralCookie,
    principalId: principal.id,
  };
}

async function createVerifiedPrimaryEmail(principalId: string, email: string) {
  await postAdminJson(`${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/operations/principal-email/create`, {
    idempotencyKey: `verified-email-${principalId.replace(/\W+/g, "-")}`,
    input: {
      displayEmail: email,
      normalizedEmail: email.toLowerCase(),
      primary: true,
      principal: principalId,
      recovery: false,
      verificationStatus: "verified",
      verifiedAt: "2026-07-06T00:00:00.000Z",
    },
  });
}

async function createPrivateCredentialForPrincipal(principalId: string, label: string) {
  const response = await harness.durableObjectFetch(
    "FORMLESS_AUTHORITY",
    FORMLESS_INSTANCE_AUTHORITY_NAME,
    "/harness/auth/credential",
    {
      body: JSON.stringify({
        credentialId: Buffer.from(`credential:${principalId}:${label}`).toString("base64url"),
        principalId,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );

  expect(response.status).toBe(200);
}

async function createCentralAuthSessionCookieForPrincipal(
  principalId: string,
  origin = "https://www.example.com",
) {
  const url = new URL(origin);
  const response = await harness.durableObjectFetch(
    "FORMLESS_AUTHORITY",
    FORMLESS_INSTANCE_AUTHORITY_NAME,
    "/harness/auth/central-session",
    {
      body: JSON.stringify({ principalId }),
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-host": url.host,
        "x-forwarded-proto": url.protocol.replace(/:$/, ""),
      },
      method: "POST",
    },
  );

  expect(response.status).toBe(200);

  const setCookie = requiredHeader(response, "Set-Cookie");

  expect(setCookie).toContain(`${CENTRAL_AUTH_SESSION_COOKIE_NAME}=`);

  return cookiePair(setCookie);
}

async function configureHarnessAuth(origin: string) {
  const url = new URL(origin);
  const response = await harness.durableObjectFetch(
    "FORMLESS_AUTHORITY",
    FORMLESS_INSTANCE_AUTHORITY_NAME,
    "/harness/auth/config",
    {
      body: JSON.stringify({
        canonicalOrigin: url.origin,
        relyingPartyId: url.hostname,
        relyingPartyName: "Formless",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );

  expect(response.status).toBe(200);
}

async function createInstanceAdminPrincipalSessionCookie(displayName: string) {
  const principal = await createActivePrincipalSessionCookie(displayName);
  const response = await postAdminJson(
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/operations/program-role-assignment/create`,
    {
      idempotencyKey: `custom-domain-assign-${principal.principalId.replace(/\W+/g, "-")}-administrator`,
      input: {
        principal: principal.principalId,
        roleId: programAdministratorRoleId,
        status: "active",
      },
    },
  );
  const assignment = operationRecord((await response.json()) as OperationInvocationResponse);

  return {
    ...principal,
    assignmentId: assignment.id,
  };
}

async function mappedInstanceHostSessionCookieForPrincipal(principalId: string) {
  const routeId = routeRecordIds.get(`route:host:instance:${mappedInstanceHost}`);

  if (!routeId) {
    throw new Error("Mapped instance route must be created before host session cookies.");
  }

  return `${HOST_AUTH_SESSION_COOKIE_NAME}=${await signCookiePayload({
    access: "owner",
    expiresAt: "2999-01-01T12:00:00.000Z",
    instanceId: "www.example.com",
    issuedAt: "2999-01-01T00:00:00.000Z",
    principalId,
    purpose: "host-session",
    routeId,
    sessionVersion: 0,
    targetOrigin: `https://${mappedInstanceHost}`,
    targetProfile: "instance",
    version: 1,
  })}`;
}

async function createMappedInstanceHostSession(ownerName: string) {
  const owner = await ensureTestIdentityOwner(harness, adminToken, {
    name: ownerName,
  });
  const centralCookie = await createCentralAuthSessionCookieForPrincipal(owner.id);
  const start = await fetchHost(mappedInstanceHost, "/settings/access", {
    headers: { Accept: "text/html" },
    redirect: "manual",
  });
  const { grant } = await issueHandoffGrantFromAuthAccount(
    requiredHeader(start, "Location"),
    centralCookie,
  );
  const callback = await harness.mf.dispatchFetch(requiredHeader(grant, "Location"), {
    headers: { Cookie: cookiePair(requiredHeader(start, "Set-Cookie")) },
    redirect: "manual",
  });
  const setCookie = requiredHeader(callback, "Set-Cookie");

  expect(callback.status).toBe(302);

  return {
    cookie: cookiePair(setCookie),
    owner,
    setCookie,
  };
}

class VirtualPasskey {
  private readonly credentialId: string;
  private readonly publicKey: KeyObject;

  constructor(credentialIdValue: string) {
    const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });

    this.credentialId = credentialIdValue;
    this.publicKey = pair.publicKey;
  }
  registrationResponse(
    options: PublicKeyCredentialCreationOptionsJSON,
    input: {
      origin: string;
      rpId: string;
    },
  ): RegistrationResponseJSON {
    const clientDataJSON = clientDataJson("webauthn.create", options.challenge, input.origin);
    const authData = registrationAuthenticatorData({
      credentialId: base64UrlDecodeBytes(this.credentialId),
      credentialPublicKey: this.credentialPublicKey(),
      counter: 0,
      rpId: input.rpId,
    });
    const attestationObject = cborMap([
      ["fmt", "none"],
      ["attStmt", []],
      ["authData", authData],
    ]);

    return {
      id: this.credentialId,
      rawId: this.credentialId,
      response: {
        clientDataJSON: base64UrlEncode(clientDataJSON),
        attestationObject: base64UrlEncode(attestationObject),
        transports: ["internal"],
      },
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      type: "public-key",
    };
  }

  private credentialPublicKey(): Uint8Array {
    const jwk = this.publicKey.export({ format: "jwk" }) as JsonWebKey;

    if (!jwk.x || !jwk.y) {
      throw new Error("Virtual passkey public key export is missing coordinates.");
    }

    return cborMap([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, base64UrlDecodeBytes(jwk.x)],
      [-3, base64UrlDecodeBytes(jwk.y)],
    ]);
  }
}

function registrationAuthenticatorData(input: {
  counter: number;
  credentialId: Uint8Array;
  credentialPublicKey: Uint8Array;
  rpId: string;
}) {
  const credentialIdLength = new Uint8Array(2);
  const credentialIdLengthView = new DataView(credentialIdLength.buffer);

  credentialIdLengthView.setUint16(0, input.credentialId.byteLength, false);

  return concatBytes([
    sha256(new TextEncoder().encode(input.rpId)),
    new Uint8Array([0x45]),
    uint32(input.counter),
    new Uint8Array(16),
    credentialIdLength,
    input.credentialId,
    input.credentialPublicKey,
  ]);
}

function clientDataJson(type: "webauthn.create", challenge: string, origin: string) {
  return new TextEncoder().encode(
    JSON.stringify({
      type,
      challenge,
      origin,
      crossOrigin: false,
    }),
  );
}

type CborMapKey = number | string;
type CborMapEntry = readonly [CborMapKey, CborValue];
type CborValue = number | string | Uint8Array | readonly CborMapEntry[];

function cborMap(entries: readonly CborMapEntry[]): Uint8Array {
  return concatBytes([
    cborHeader(5, entries.length),
    ...entries.flatMap(([key, value]) => [cborEncode(key), cborEncode(value)]),
  ]);
}

function cborEncode(value: CborValue): Uint8Array {
  if (typeof value === "number") {
    return value >= 0 ? cborHeader(0, value) : cborHeader(1, -1 - value);
  }

  if (typeof value === "string") {
    const bytes = new TextEncoder().encode(value);

    return concatBytes([cborHeader(3, bytes.byteLength), bytes]);
  }

  if (value instanceof Uint8Array) {
    return concatBytes([cborHeader(2, value.byteLength), value]);
  }

  return cborMap(value);
}

function cborHeader(major: number, value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("CBOR value must be a non-negative integer.");
  }

  if (value < 24) {
    return new Uint8Array([(major << 5) | value]);
  }

  if (value <= 0xff) {
    return new Uint8Array([(major << 5) | 24, value]);
  }

  if (value <= 0xffff) {
    const bytes = new Uint8Array(3);
    const view = new DataView(bytes.buffer);

    bytes[0] = (major << 5) | 25;
    view.setUint16(1, value, false);

    return bytes;
  }

  const bytes = new Uint8Array(5);
  const view = new DataView(bytes.buffer);

  bytes[0] = (major << 5) | 26;
  view.setUint32(1, value, false);

  return bytes;
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, value, false);

  return bytes;
}

function sha256(bytes: Uint8Array): Uint8Array {
  return createHash("sha256").update(Buffer.from(bytes)).digest();
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

function base64UrlDecodeBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

function signedCookiePayload(setCookieHeader: string, cookieName: string): Record<string, unknown> {
  const value = setCookieValue(setCookieHeader, cookieName);
  const [payloadPart, signature] = value.split(".", 2);

  expect(payloadPart).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(signature).toMatch(/^[A-Za-z0-9_-]+$/);

  return JSON.parse(base64UrlDecodeUtf8(payloadPart)) as Record<string, unknown>;
}

async function hostSessionCookieWithPayload(
  setCookieHeader: string,
  overrides: Record<string, unknown>,
) {
  const payload = {
    ...signedCookiePayload(setCookieHeader, HOST_AUTH_SESSION_COOKIE_NAME),
    ...overrides,
  };

  return `${HOST_AUTH_SESSION_COOKIE_NAME}=${await signCookiePayload(payload)}`;
}

async function signCookiePayload(payload: Record<string, unknown>) {
  const payloadPart = base64UrlEncodeUtf8(JSON.stringify(payload));
  const signature = await signString(payloadPart, adminToken);

  return `${payloadPart}.${signature}`;
}

function setCookieValue(setCookieHeader: string, cookieName: string): string {
  const marker = `${cookieName}=`;
  const start = setCookieHeader.indexOf(marker);

  if (start < 0) {
    throw new Error(`Missing ${cookieName} Set-Cookie value.`);
  }

  const value = setCookieHeader.slice(start + marker.length).split(";")[0];

  if (!value) {
    throw new Error(`Empty ${cookieName} Set-Cookie value.`);
  }

  return value;
}

function base64UrlDecodeUtf8(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized + padding);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}

function base64UrlEncodeUtf8(value: string) {
  return base64UrlEncode(new TextEncoder().encode(value));
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signString(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}
function requiredHeader(
  response: {
    headers: {
      get(name: string): string | null;
    };
  },
  name: string,
): string {
  const value = response.headers.get(name);

  if (!value) {
    throw new Error(`Missing ${name} header.`);
  }

  return value;
}

async function postAdminJson(path: string, body: unknown) {
  const request = operationWriteRequest(path, body);
  const operationEntity = path.match(/^\/api\/formless\/program\/operations\/([^/]+)\//)?.[1];
  const identityOperation =
    operationEntity !== undefined &&
    identityControlPlaneEntityNames.includes(
      operationEntity as (typeof identityControlPlaneEntityNames)[number],
    );
  const init = {
    body: JSON.stringify(request.body),
    headers: {
      ...(identityOperation ? await programOwnerHeaders() : adminHeaders()),
      "Content-Type": "application/json",
    },
    method: "POST",
  } as const;
  const response = identityOperation
    ? await fetchAuth(request.path, init)
    : await harness.fetch(request.path, init);

  if (![200, 201].includes(response.status)) {
    throw new Error(
      `Expected admin POST ${request.path} to return 200/201, got ${response.status}: ${await response.text()}`,
    );
  }

  return response;
}

async function programOwnerHeaders() {
  const owner = await ensureTestIdentityOwner(harness, adminToken, {
    name: "Program Operation Owner",
  });

  return {
    Cookie: await createCentralAuthSessionCookieForPrincipal(owner.id, activeAuthOrigin),
  };
}

function adminHeaders(headers: Record<string, string> = {}) {
  return {
    ...headers,
    Authorization: `Bearer ${adminToken}`,
  };
}

function assetResponse(request: Request): Response {
  const pathname = new URL(request.url).pathname;
  assetRequests.push(pathname);

  if (pathname === "/index.html") {
    return new Response("<!doctype html><html><head></head><body></body></html>", {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new Response(`asset:${pathname}`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

type WorkerStateResource = "auth" | "controlPlane" | "domainMappings" | "media";

async function resetWorkerState(target: Harness, resources: readonly WorkerStateResource[]) {
  if (resources.includes("controlPlane")) {
    routeRecordIds.clear();
  }

  const resetters: Record<WorkerStateResource, () => Promise<void>> = {
    auth: () => postInternalInstanceReset(target, INTERNAL_RESET_OWNER_SETUP_PATH),
    controlPlane: () =>
      restoreTestStorageSnapshot(
        target,
        `${controlPlaneApi}/snapshot/restore`,
        instanceControlPlaneTestStorageSnapshot(),
        adminHeaders(),
      ),
    domainMappings: () =>
      postInternalInstanceReset(target, INTERNAL_RESET_INSTANCE_DOMAIN_MAPPINGS_PATH),
    media: () => clearMediaBucket(target),
  };

  for (const resource of resources) {
    await resetters[resource]();
  }
}

async function postInternalInstanceReset(target: Harness, path: string) {
  const response = await target.durableObjectFetch(
    "FORMLESS_AUTHORITY",
    FORMLESS_INSTANCE_AUTHORITY_NAME,
    path,
    {
      method: "POST",
    },
  );

  expect(response.status).toBe(200);
}

async function clearMediaBucket(target: Harness) {
  const bucket = await target.mf.getR2Bucket("FORMLESS_MEDIA");
  const objects = await bucket.list();

  if (objects.objects.length > 0) {
    await bucket.delete(objects.objects.map((object) => object.key));
  }
}

async function withHarness(target: Harness, run: () => Promise<void>) {
  const previousHarness = harness;

  harness = target;

  try {
    await run();
  } finally {
    harness = previousHarness;
    await target.dispose();
  }
}

async function withWorkersDevAuthHarness(run: (deploymentOrigin: string) => Promise<void>) {
  const deploymentOrigin = "https://personal.dpeek.workers.dev";
  const previousAuthOrigin = activeAuthOrigin;
  activeAuthOrigin = deploymentOrigin;

  try {
    await withHarness(
      await createCustomDomainHarness("instance", {
        FORMLESS_INSTANCE_AUTH_ORIGIN: deploymentOrigin,
      }),
      () => run(deploymentOrigin),
    );
  } finally {
    activeAuthOrigin = previousAuthOrigin;
  }
}

async function createCustomDomainHarness(
  runtimeProfile?: RuntimeProfileKind,
  bindings: Record<string, string> = {},
) {
  return createWorkerHarness(
    harnessPath,
    {
      FORMLESS_AUTHORITY: { className: "CustomDomainHarnessAuthority", useSQLite: true },
    },
    {
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        ...bindings,
        ...(runtimeProfile === undefined ? {} : { FORMLESS_RUNTIME_PROFILE: runtimeProfile }),
      },
      compatibilityDate: "2026-04-28",
      queueProducers: {
        FORMLESS_EMAIL_DELIVERY_QUEUE: "formless-email-delivery",
      },
      r2Buckets: ["FORMLESS_MEDIA"],
      serviceBindings: {
        ASSETS: assetResponse,
      },
    },
  );
}

async function writeCustomDomainHarness() {
  harnessDir = await mkdtemp(join(tmpdir(), "formless-custom-domain-harness-"));
  const path = join(harnessDir, "custom-domain-harness.ts");

  await writeFile(
    path,
    `
      import worker, { FormlessAuthority } from "${process.cwd()}/src/worker/index.ts";
      import {
        bumpHostSessionRevocationVersion,
        createPasskeyCredential,
        readInstanceAuthConfig,
        writeInstanceAuthConfig,
      } from "${process.cwd()}/src/worker/instance-auth-state.ts";
      import { createCentralAuthSessionCookie } from "${process.cwd()}/src/worker/central-auth-session.ts";
      import {
        ensureEmailDeliveryTables,
        readEmailDeliveryRenderedMessageById,
      } from "${process.cwd()}/src/worker/email-runtime-state.ts";
      import { ensureRuntimeInstanceAuthConfig } from "${process.cwd()}/src/worker/instance-auth-runtime.ts";

      export class CustomDomainHarnessAuthority extends FormlessAuthority {
        async fetch(request) {
          const url = new URL(request.url);

          if (url.pathname === "/harness/auth/config") {
            if (request.method === "GET") {
              return Response.json({ config: readInstanceAuthConfig(this.ctx.storage) });
            }

            if (request.method === "POST") {
              return Response.json({
                config: writeInstanceAuthConfig(this.ctx.storage, await request.json()),
              });
            }
          }

          if (url.pathname === "/harness/auth/credential" && request.method === "POST") {
            const body = await request.json();

            return Response.json(createPasskeyCredential(this.ctx.storage, {
              credentialBackedUp: false,
              credentialDeviceType: "singleDevice",
              credentialId: body.credentialId,
              counter: 0,
              createdAt: "2026-07-06T00:00:00.000Z",
              principalId: body.principalId,
              publicKey: new Uint8Array([1, 2, 3, 4]),
              transports: [],
              updatedAt: "2026-07-06T00:00:00.000Z",
            }));
          }

          if (url.pathname === "/harness/auth/central-session" && request.method === "POST") {
            const body = await request.json();

            await ensureRuntimeInstanceAuthConfig(this.ctx.storage, request, this.env);

            const created = await createCentralAuthSessionCookie(this.ctx.storage, {
              env: this.env,
              maxAgeSeconds: 60,
              now: "2999-01-01T00:00:00.000Z",
              principalId: body.principalId,
              request,
            });

            return Response.json(
              { session: created.session },
              { headers: { "Set-Cookie": created.cookie } },
            );
          }

          if (
            url.pathname === "/harness/auth/host-session/revoke" &&
            request.method === "POST"
          ) {
            return Response.json(
              bumpHostSessionRevocationVersion(this.ctx.storage, await request.json()),
            );
          }

          if (url.pathname.startsWith("/harness/internal-message/") && request.method === "GET") {
            const deliveryId = decodeURIComponent(url.pathname.slice("/harness/internal-message/".length));

            return Response.json({
              message: readEmailDeliveryRenderedMessageById(this.ctx.storage, deliveryId),
            });
          }

          return super.fetch(request);
        }
      }

      function customDomainHarnessEnv(env, storage) {
        return {
          ...env,
          FORMLESS_EMAIL_DELIVERY_QUEUE: emailDeliveryQueueBinding(storage),
        };
      }

      function emailDeliveryQueueBinding(storage) {
        return {
          async send(job) {
            ensureEmailDeliveryTables(storage);
            ensureQueueTable(storage);
            storage.sql.exec(
              "INSERT INTO fake_email_delivery_queue_jobs (message_json) VALUES (?)",
              JSON.stringify(job),
            );

            return {};
          },
        };
      }

      function ensureQueueTable(storage) {
        storage.sql.exec(\`
          CREATE TABLE IF NOT EXISTS fake_email_delivery_queue_jobs (
            send_id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_json TEXT NOT NULL
          )
        \`);
      }

      export default worker;
    `,
  );

  return path;
}
