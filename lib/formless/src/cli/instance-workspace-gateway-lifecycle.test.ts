import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
  LOCAL_SESSION_BOOTSTRAP_API_PATH,
  LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_CSRF_TOKEN_ENV,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_ROOT_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
} from "@dpeek/formless-gateway";
import type { WorkspaceGatewaySidecar } from "@dpeek/formless-gateway/sidecar";
import { defaultInstanceWorkspaceManifest as defaultFormlessInstanceWorkspaceManifest } from "@dpeek/formless-workspace";
import {
  FORMLESS_TURNSTILE_ALWAYS_PASS_SECRET_KEY,
  FORMLESS_TURNSTILE_ALWAYS_PASS_SITE_KEY,
  FORMLESS_TURNSTILE_SECRET_KEY_ENV_NAME,
  FORMLESS_TURNSTILE_SITE_KEY_ENV_NAME,
} from "../shared/turnstile-config.ts";
import { FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME } from "../shared/workspace-runtime-packages.ts";
import {
  FORMLESS_SITE_PROJECT_ROOT_ENV_NAME,
  FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME,
} from "../shared/workspace-runtime-extensions.ts";
import {
  browserFacingFormlessInstanceWorkspaceLocalDevOrigin,
  formlessInstanceWorkspaceDevEnv,
  formlessInstanceWorkspaceGatewaySessionEntry,
  startFormlessInstanceWorkspaceGatewayLifecycle,
  type FormlessInstanceWorkspaceGatewayLifecycleDependencies,
} from "./instance-workspace-gateway-lifecycle.ts";
import type { StartWorkspaceGatewaySidecarDependencies } from "./workspace-gateway-runtime.ts";

describe("local gateway lifecycle child runtime env", () => {
  it("keeps gateway secrets server-only and scrubs browser-visible Vite env", () => {
    const workspaceRoot = path.join("/tmp", "formless-local-gateway-lifecycle");
    const env = formlessInstanceWorkspaceDevEnv(
      {
        FORMLESS_ADMIN_TOKEN: "ambient-admin-token",
        FORMLESS_LOCAL_WORKSPACE_GATEWAY: "1",
        FORMLESS_OWNER_SESSION_SECRET: "ambient-owner-session-secret",
        [FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME]: "stale-package-payload",
        [FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME]: "stale-runtime-extension-payload",
        [LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV]: "old-session-bootstrap-token",
        [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: "old-proxy-token",
        [WORKSPACE_GATEWAY_ROOT_ENV]: "/old/root",
        [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]: "http://127.0.0.1:1/",
        VITE_FORMLESS_ADMIN_TOKEN: "vite-admin-token",
        VITE_FORMLESS_LOCAL_PUBLISH_BROKER_TOKEN: "vite-publish-token",
        VITE_FORMLESS_LOCAL_PUBLISH_BROKER_URL: "http://127.0.0.1:2/",
        VITE_FORMLESS_LOCAL_SESSION_BOOTSTRAP_TOKEN: "vite-local-session-bootstrap-token",
        VITE_FORMLESS_OWNER_SESSION_SECRET: "vite-owner-session-secret",
        VITE_FORMLESS_WORKSPACE_GATEWAY_ROOT: "/vite/root",
        VITE_FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN: "browser-proxy-token",
        VITE_FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL: "http://127.0.0.1:1/",
      },
      workspaceRoot,
      defaultFormlessInstanceWorkspaceManifest({ name: "local-workspace" }),
      {
        endpoint: "http://127.0.0.1:4321/",
        proxyToken: "sidecar-proxy-token",
      },
    );
    const browserVisibleEnv = Object.fromEntries(
      Object.entries(env).filter(([key]) => key.startsWith("VITE_")),
    );
    const serializedBrowserVisibleEnv = JSON.stringify(browserVisibleEnv);

    expect(env).toMatchObject({
      FORMLESS_ADMIN_TOKEN: "ambient-admin-token",
      FORMLESS_OWNER_SESSION_SECRET: "ambient-owner-session-secret",
      [FORMLESS_SITE_PROJECT_ROOT_ENV_NAME]: workspaceRoot,
      [FORMLESS_TURNSTILE_SECRET_KEY_ENV_NAME]: FORMLESS_TURNSTILE_ALWAYS_PASS_SECRET_KEY,
      [FORMLESS_TURNSTILE_SITE_KEY_ENV_NAME]: FORMLESS_TURNSTILE_ALWAYS_PASS_SITE_KEY,
      [LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV]: expect.any(String),
      [WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV]: expect.any(String),
      [WORKSPACE_GATEWAY_CSRF_TOKEN_ENV]: expect.any(String),
      [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: "sidecar-proxy-token",
      [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]: "http://127.0.0.1:4321/",
      FORMLESS_RUNTIME_PROFILE: "instance",
      FORMLESS_WRANGLER_PERSIST: path.join(workspaceRoot, ".formless/local/wrangler"),
      VITE_FORMLESS_WORKSPACE_GATEWAY_API: "/api/formless/workspace",
      VITE_FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN: env[WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV],
      VITE_FORMLESS_RUNTIME_PROFILE: "instance",
    });
    expect(env[LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV]).not.toBe("old-session-bootstrap-token");
    expect(env).not.toHaveProperty("FORMLESS_LOCAL_WORKSPACE_GATEWAY");
    expect(env).not.toHaveProperty(WORKSPACE_GATEWAY_ROOT_ENV);
    expect(env).not.toHaveProperty(FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME);
    expect(env).not.toHaveProperty(FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME);
    expect(browserVisibleEnv).not.toHaveProperty("VITE_FORMLESS_ADMIN_TOKEN");
    expect(browserVisibleEnv).not.toHaveProperty("VITE_FORMLESS_LOCAL_PUBLISH_BROKER_TOKEN");
    expect(browserVisibleEnv).not.toHaveProperty("VITE_FORMLESS_LOCAL_PUBLISH_BROKER_URL");
    expect(browserVisibleEnv).not.toHaveProperty("VITE_FORMLESS_LOCAL_SESSION_BOOTSTRAP_TOKEN");
    expect(browserVisibleEnv).not.toHaveProperty("VITE_FORMLESS_OWNER_SESSION_SECRET");
    expect(browserVisibleEnv).not.toHaveProperty("VITE_FORMLESS_WORKSPACE_GATEWAY_ROOT");
    expect(env).not.toHaveProperty("VITE_FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN");
    expect(env).not.toHaveProperty("VITE_FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL");
    expect(serializedBrowserVisibleEnv).not.toContain("ambient-admin-token");
    expect(serializedBrowserVisibleEnv).not.toContain("ambient-owner-session-secret");
    expect(serializedBrowserVisibleEnv).not.toContain("old-session-bootstrap-token");
    expect(serializedBrowserVisibleEnv).not.toContain("sidecar-proxy-token");
    expect(serializedBrowserVisibleEnv).not.toContain("http://127.0.0.1:4321");
    expect(serializedBrowserVisibleEnv).not.toContain(workspaceRoot);
  });

  it("keeps explicit workspace dev Turnstile keys when provided", () => {
    const env = formlessInstanceWorkspaceDevEnv(
      {
        [FORMLESS_TURNSTILE_SECRET_KEY_ENV_NAME]: "explicit-turnstile-secret",
        [FORMLESS_TURNSTILE_SITE_KEY_ENV_NAME]: "explicit-turnstile-site-key",
      },
      path.join("/tmp", "formless-turnstile-workspace"),
      defaultFormlessInstanceWorkspaceManifest({ name: "local-workspace" }),
      null,
    );

    expect(env[FORMLESS_TURNSTILE_SECRET_KEY_ENV_NAME]).toBe("explicit-turnstile-secret");
    expect(env[FORMLESS_TURNSTILE_SITE_KEY_ENV_NAME]).toBe("explicit-turnstile-site-key");
  });

  it("places supplied local session, workspace package, and runtime extension env", () => {
    const workspaceRoot = path.join("/tmp", "formless-runtime-package-workspace");
    const env = formlessInstanceWorkspaceDevEnv(
      {
        FORMLESS_ADMIN_TOKEN: "ambient-admin-token",
        FORMLESS_OWNER_SESSION_SECRET: "ambient-owner-session-secret",
      },
      workspaceRoot,
      defaultFormlessInstanceWorkspaceManifest({ name: "local-workspace" }),
      null,
      {
        localDevSecrets: {
          adminToken: "local-dev-admin-token",
          ownerSessionSecret: "local-dev-owner-session-secret",
        },
        localSessionBootstrapToken: "local-session-token",
        workspaceAppPackages: "workspace-package-links-payload",
        workspaceRuntimeExtensions: "runtime-extension-payload",
      },
    );

    expect(env).toMatchObject({
      FORMLESS_ADMIN_TOKEN: "local-dev-admin-token",
      FORMLESS_OWNER_SESSION_SECRET: "local-dev-owner-session-secret",
      [LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV]: "local-session-token",
      [FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME]: "workspace-package-links-payload",
      [FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME]: "runtime-extension-payload",
    });
    expect(env).not.toHaveProperty(WORKSPACE_GATEWAY_PROXY_TOKEN_ENV);
    expect(env).not.toHaveProperty(WORKSPACE_GATEWAY_SIDECAR_URL_ENV);
  });
});

describe("local gateway lifecycle sidecar and session entry", () => {
  it("starts the sidecar with runtime dependencies, generated proxy token, and close behavior", async () => {
    const workspaceRoot = path.join("/tmp", "formless-sidecar-lifecycle");
    const env = {
      CLOUDFLARE_API_TOKEN: "cf-token",
      FORMLESS_ADMIN_TOKEN: "admin-token",
    };
    const fetcher: typeof fetch = async () => Response.json({ ok: true });
    const randomToken = tokenSequence("local-session-token", "sidecar-proxy-token");
    const startInputs: Array<{
      env?: NodeJS.ProcessEnv;
      workspaceRoot: string;
    }> = [];
    let capturedDependencies: StartWorkspaceGatewaySidecarDependencies | undefined;
    let closed = false;
    const lifecycle = await startFormlessInstanceWorkspaceGatewayLifecycle(
      { workspaceRoot },
      lifecycleDependencies({
        cwd: "/workspace",
        env,
        fetch: fetcher,
        now: () => "2026-06-26T01:00:00.000Z",
        packageRoot: "/package",
        packageVersion: "1.2.3",
        randomToken,
        startWorkspaceGatewaySidecar: async (input, dependencies) => {
          startInputs.push(input);
          capturedDependencies = dependencies;

          return fakeSidecar({
            close: async () => {
              closed = true;
            },
            proxyToken: dependencies.createProxyToken?.() ?? "missing-proxy-token",
          });
        },
      }),
    );

    expect(lifecycle.localSessionBootstrapToken).toBe("local-session-token");
    expect(lifecycle.sidecar.proxyToken).toBe("sidecar-proxy-token");
    expect(startInputs).toEqual([{ env, workspaceRoot }]);
    expect(capturedDependencies).toMatchObject({
      cwd: "/workspace",
      env,
      fetch: fetcher,
      packageRoot: "/package",
      packageVersion: "1.2.3",
      randomToken,
    });
    expect(capturedDependencies?.createProxyToken?.()).toBe("sidecar-proxy-token");

    await lifecycle.close();

    expect(closed).toBe(true);
  });

  it("creates safe local session entry URLs from child or Portless origins", () => {
    const childEntry = formlessInstanceWorkspaceGatewaySessionEntry({
      childOrigin: "http://localhost:5174",
      env: {},
      reset: false,
      token: "local-session-token",
    });
    const childUrl = new URL(childEntry.localSessionBootstrapUrl);

    expect(childUrl.origin).toBe("http://localhost:5174");
    expect(childUrl.pathname).toBe(LOCAL_SESSION_BOOTSTRAP_API_PATH);
    expect(childUrl.searchParams.get("token")).toBe("local-session-token");
    expect(childUrl.searchParams.get("redirectTo")).toBeNull();
    expect(childUrl.searchParams.get("reset")).toBeNull();

    const portlessEntry = formlessInstanceWorkspaceGatewaySessionEntry({
      childOrigin: "http://127.0.0.1:5174",
      env: {
        ALCHEMY_PASSWORD: "alchemy-secret",
        CLOUDFLARE_API_TOKEN: "cf-secret",
        FORMLESS_ADMIN_TOKEN: "admin-secret",
        FORMLESS_OWNER_SESSION_SECRET: "owner-secret",
        PORTLESS_URL: "https://lurg.formless.local/shell?ignored=1",
        [WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV]: "bootstrap-secret",
        [WORKSPACE_GATEWAY_CSRF_TOKEN_ENV]: "csrf-secret",
        [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: "proxy-secret",
      },
      reset: true,
      token: "local-session-token",
    });
    const portlessUrl = new URL(portlessEntry.localSessionBootstrapUrl);
    const forbiddenValues = [
      "admin-secret",
      "owner-secret",
      "bootstrap-secret",
      "csrf-secret",
      "proxy-secret",
      "alchemy-secret",
      "cf-secret",
      "http://127.0.0.1:5174",
    ];

    expect(portlessUrl.origin).toBe("https://lurg.formless.local");
    expect(portlessUrl.pathname).toBe(LOCAL_SESSION_BOOTSTRAP_API_PATH);
    expect(portlessUrl.searchParams.get("token")).toBe("local-session-token");
    expect(portlessUrl.searchParams.get("redirectTo")).toBeNull();
    expect(portlessUrl.searchParams.get("reset")).toBe("1");
    for (const value of forbiddenValues) {
      expect(portlessEntry.localSessionBootstrapUrl).not.toContain(value);
    }
  });

  it("rejects invalid Portless browser origins", () => {
    expect(() =>
      browserFacingFormlessInstanceWorkspaceLocalDevOrigin("http://localhost:5173", {
        PORTLESS_URL: "file:///tmp/formless",
      }),
    ).toThrow("PORTLESS_URL is invalid: file:///tmp/formless");
  });
});

function lifecycleDependencies(
  overrides: Partial<FormlessInstanceWorkspaceGatewayLifecycleDependencies> = {},
): FormlessInstanceWorkspaceGatewayLifecycleDependencies {
  return {
    cwd: "/workspace",
    fetch: async () => Response.json({ ok: true }),
    now: () => "2026-06-26T01:00:00.000Z",
    packageRoot: "/package",
    ...overrides,
  };
}

function fakeSidecar(input: Partial<WorkspaceGatewaySidecar> = {}): WorkspaceGatewaySidecar {
  return {
    close: async () => {},
    endpoint: "http://127.0.0.1:4321/",
    proxyToken: "sidecar-proxy-token",
    ...input,
  };
}

function tokenSequence(...tokens: string[]): () => string {
  let index = 0;

  return () => tokens[index++ % tokens.length] ?? "fallback-token";
}
