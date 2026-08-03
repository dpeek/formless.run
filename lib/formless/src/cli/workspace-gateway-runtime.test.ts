import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  WORKSPACE_GATEWAY_ACTOR_HEADER,
  WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER,
  WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH,
  WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  WORKSPACE_GATEWAY_CSRF_COOKIE_NAME,
  WORKSPACE_GATEWAY_CSRF_HEADER,
  WORKSPACE_GATEWAY_OPERATION_KIND_HEADER,
  WORKSPACE_GATEWAY_OPERATIONS_API_PATH,
  WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
  WORKSPACE_GATEWAY_STATUS_API_PATH,
  handleWorkspaceGatewayLocalProxyRequest,
  startWorkspaceGatewaySidecar,
  type WorkspaceGatewaySidecar,
  type WorkspaceGatewaySidecarExecutionEnv,
} from "@dpeek/formless-gateway/sidecar";
import { FORMLESS_CONFIG_FILE, resolveFormlessConfig } from "@dpeek/formless-workspace";
import { formatTestFormlessConfigModule } from "./instance-workspace-config-test.ts";
import { createOwnerSessionCookie } from "../worker/owner-session.ts";
import {
  createWorkspaceAutoSaveScheduler,
  createWorkspaceGatewayOperationHandlers,
  createWorkspaceGatewayProxyDependencies,
  type WorkspaceAutoSaveScheduler,
  type WorkspaceGatewayRuntimeDependencies,
  type WorkspaceGatewayRuntimeEnv,
} from "./workspace-gateway-runtime.ts";

const tempDirs: string[] = [];
const sidecars: WorkspaceGatewaySidecar[] = [];
const bootstrapToken = "bootstrap-local-token";
const csrfToken = "csrf-local-token";
const ownerSecret = "owner-session-secret";
const adminToken = "admin-local-token";
const proxyToken = "proxy-local-token";

afterEach(async () => {
  await Promise.all(sidecars.splice(0).map((sidecar) => sidecar.close()));
  await Promise.all(
    tempDirs
      .splice(0)
      .map((tempDir) =>
        rm(tempDir, { force: true, maxRetries: 10, recursive: true, retryDelay: 25 }),
      ),
  );
});

describe("local workspace gateway", () => {
  it("is available only for local workspace runtime env and not Worker runtime profiles", async () => {
    const workspaceRoot = await makeTempDir();

    await expect(
      gatewayJson(
        new Request(`http://local.test${WORKSPACE_GATEWAY_STATUS_API_PATH}`, {
          headers: bootstrapHeaders(),
        }),
        { env: { FORMLESS_RUNTIME_PROFILE: "instance" } },
      ),
    ).resolves.toMatchObject({ response: { status: 404 } });

    const blocked = await gatewayJson(
      new Request(`http://local.test${WORKSPACE_GATEWAY_STATUS_API_PATH}`, {
        headers: bootstrapHeaders(),
      }),
      {
        env: gatewayEnv(workspaceRoot, {
          FORMLESS_RUNTIME_PROFILE: "publishedSite",
        }),
      },
    );

    expect(blocked.response.status).toBe(404);
  });

  it("persists sidecar operation progress and keeps direct sidecar responses display-safe", async () => {
    const workspaceRoot = await makeTempDir();
    const sidecar = await startGatewaySidecar(
      workspaceRoot,
      gatewayDeps(workspaceRoot, {
        credentialSetup: async () => ({
          account: {
            id: "account-123",
            name: "CF_API_TOKEN=secret-token",
            workersDevSubdomain: "dpeek",
          },
          accountCount: 1,
          credentialRef: "formless-cloudflare-oauth:default",
          deploymentConfig: {
            accountId: "account-123",
            targetId: "instance.primary",
            targetUrl: "https://project.dpeek.workers.dev",
            workerName: "project",
          },
          kind: "ready",
          provider: "cloudflare",
          source: "stored-credential",
        }),
        operationIds: ["op_sidecar_progress_00000001"],
      }),
    );
    const started = await fetch(sidecarPath(sidecar, WORKSPACE_GATEWAY_OPERATIONS_API_PATH), {
      body: JSON.stringify({ kind: "credentialSetup", provider: "cloudflare" }),
      headers: {
        "Content-Type": "application/json",
        ...sidecarProxyHeaders({
          operation: "credentialSetup",
          via: "owner-session",
        }),
      },
      method: "POST",
    });
    const startedBody = (await started.json()) as Record<string, unknown>;
    const serializedStarted = JSON.stringify(startedBody);

    expect(started.status).toBe(200);
    expect(serializedStarted).not.toContain("secret-token");
    expect(serializedStarted).not.toContain("raw adapter");

    const read = await fetch(
      sidecarPath(sidecar, `${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/op_sidecar_progress_00000001`),
      {
        headers: sidecarProxyHeaders({ via: "owner-session" }),
      },
    );
    const readBody = (await read.json()) as Record<string, unknown>;

    expect(read.status).toBe(200);
    expect(readBody).toMatchObject({
      operation: {
        id: "op_sidecar_progress_00000001",
        logs: [{ message: "credentialSetup started." }, { message: "credentialSetup completed." }],
        operation: "credentialSetup",
        status: "succeeded",
      },
    });
    expect(JSON.stringify(readBody)).not.toContain("secret-token");
    expect(JSON.stringify(readBody)).not.toContain("raw adapter");
  });

  it("reads runtime workspace status through the local gateway", async () => {
    const workspaceRoot = await makeTempDir();

    await writeWorkspaceConfig(workspaceRoot);

    const status = await gatewayJson(
      new Request(`http://local.test${WORKSPACE_GATEWAY_STATUS_API_PATH}`, {
        headers: bootstrapHeaders(),
      }),
      { deps: gatewayDeps(workspaceRoot, { operationIds: ["op_status_00000001"] }) },
    );

    expect(status.response.status).toBe(200);
    expect(status.body.operation).toMatchObject({
      actor: "browser",
      id: "op_status_00000001",
      operation: "status",
      status: "succeeded",
      summary: {
        fields: { initialized: true },
        title: "Workspace status",
      },
    });

    await expect(stat(path.join(workspaceRoot, FORMLESS_CONFIG_FILE))).resolves.toMatchObject({});
    await expect(stat(path.join(workspaceRoot, "archives"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(path.join(workspaceRoot, "records"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(path.join(workspaceRoot, "media"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("runs browser credential setup through the local gateway without exposing secrets", async () => {
    const workspaceRoot = await makeTempDir();
    const cookie = await ownerCookie();
    const deps = gatewayDeps(workspaceRoot, {
      credentialSetupUrl: "https://dash.cloudflare.com/oauth2/authorize?client_id=formless",
      operationIds: ["op_credential_00000001"],
    });

    const accepted = await gatewayJson(
      operationRequest(
        { kind: "credentialSetup", profileLabel: "Default", provider: "cloudflare" },
        browserHeaders({ cookie, csrf: true }),
      ),
      { deps },
    );

    expect(accepted.response.status).toBe(200);
    expect(accepted.body.operation).toMatchObject({
      actor: "browser",
      id: "op_credential_00000001",
      operation: "credentialSetup",
      status: "running",
      summary: {
        fields: {
          credentialRef: "formless-cloudflare-oauth:default",
          status: "waiting-for-authorization",
        },
        title: "Cloudflare authorization required",
      },
    });
    expect(JSON.stringify(accepted.body)).not.toContain("secret-token");
    expect(JSON.stringify(accepted.body)).not.toContain("raw adapter");
  });

  it("exposes enqueue-only auto-save with an empty response", async () => {
    const workspaceRoot = await makeTempDir();
    const cookie = await ownerCookie();
    const scheduled: Array<{
      callback: () => void;
      delayMs: number;
    }> = [];
    const scheduler = createWorkspaceAutoSaveScheduler({
      clearTimeout: () => undefined,
      debounceMs: 25,
      reportFailure: () => undefined,
      save: async () => undefined,
      setTimeout: (callback, delayMs) => {
        scheduled.push({ callback, delayMs });
        return callback;
      },
    });
    const deps = gatewayDeps(workspaceRoot, { autoSaveScheduler: scheduler });
    const status = await gatewayJson(
      new Request(`http://local.test${WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH}`, {
        headers: bootstrapHeaders(),
      }),
      { deps },
    );
    const enqueued = await gatewayJson(
      new Request(`http://local.test${WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH}`, {
        body: JSON.stringify({ source: "schema-save" }),
        headers: {
          "Content-Type": "application/json",
          ...browserHeaders({ cookie, csrf: true }),
        },
        method: "POST",
      }),
      { deps },
    );
    expect(status.response.status).toBe(405);
    expect(status.response.headers.get("Allow")).toBe("POST");
    expect(status.body).toEqual({ error: "Method not allowed." });
    expect(enqueued.response.status).toBe(204);
    expect(enqueued.body).toEqual({});
    expect(scheduled.map((entry) => entry.delayMs)).toEqual([25]);
    await expect(
      stat(path.join(workspaceRoot, ".formless/local/auto-save.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("proxies Cloudflare credential setup through the sidecar without exposing local secrets", async () => {
    const workspaceRoot = await makeTempDir();
    const cookie = await ownerCookie();
    const accepted = await gatewayJson(
      operationRequest(
        {
          kind: "credentialSetup",
          profileLabel: "personal",
          provider: "cloudflare",
        },
        browserHeaders({ cookie, csrf: true }),
      ),
      {
        deps: gatewayDeps(workspaceRoot, {
          credentialSetup: async (input) => {
            return {
              at: "2026-06-02T01:00:02.000Z",
              authorizationUrl: "https://dash.cloudflare.com/oauth2/authorize?client_id=formless",
              clientId: "formless-client-id",
              continue: () => new Promise<never>(() => {}),
              credentialRef: "formless-cloudflare-oauth:personal",
              kind: "authorization-waiting",
              profileLabel: input.profileLabel ?? "Default",
              provider: input.provider,
              requestedScopes: ["account.read"],
              scopeSet: "formless-cloudflare-deploy-oauth",
            };
          },
          operationIds: ["op_credential_sidecar_00000001"],
        }),
      },
    );
    const serialized = JSON.stringify(accepted.body);

    expect(accepted.response.status).toBe(200);
    expect(accepted.body.operation).toMatchObject({
      actor: "browser",
      id: "op_credential_sidecar_00000001",
      operation: "credentialSetup",
      status: "running",
    });
    expect(serialized).not.toContain("cloudflare-provider-token");
    expect(serialized).not.toContain("alchemy-password");
    expect(serialized).not.toContain("local-secret-value");
    expect(serialized).not.toContain(workspaceRoot);
    expect(serialized).not.toContain(accepted.sidecar.endpoint);
    expect(serialized).not.toContain(proxyToken);
  });

  it("scopes operation ids to the configured workspace root", async () => {
    const workspaceRoot = await makeTempDir();
    const otherWorkspaceRoot = await makeTempDir();
    const started = await gatewayJson(
      new Request(`http://local.test${WORKSPACE_GATEWAY_STATUS_API_PATH}`, {
        headers: bootstrapHeaders(),
      }),
      { deps: gatewayDeps(workspaceRoot, { operationIds: ["op_status_scoped"] }) },
    );

    expect(started.response.status).toBe(200);

    const otherRead = await gatewayJson(
      new Request(`http://local.test${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/op_status_scoped`, {
        headers: {
          ...bootstrapHeaders(),
          [WORKSPACE_GATEWAY_OPERATION_KIND_HEADER]: "status",
        },
      }),
      {
        deps: gatewayDeps(otherWorkspaceRoot),
        env: gatewayEnv(otherWorkspaceRoot),
      },
    );

    expect(otherRead.response.status).toBe(404);
  });

  it("redacts invalid authorization handoff output from trusted adapters", async () => {
    const workspaceRoot = await makeTempDir();
    const cookie = await ownerCookie();
    const rejected = await gatewayJson(
      operationRequest(
        { kind: "credentialSetup", provider: "cloudflare" },
        browserHeaders({ cookie, csrf: true }),
      ),
      {
        deps: gatewayDeps(workspaceRoot, {
          credentialSetupUrl: "https://example.com/oauth/token?token=secret",
          operationIds: ["op_bad_auth_url"],
        }),
      },
    );

    expect(rejected.response.status).toBe(200);
    expect(rejected.body.operation).toMatchObject({
      operation: "credentialSetup",
      status: "failed",
      summary: {
        title: "Operation failed",
      },
    });
    expect(JSON.stringify(rejected.body)).not.toContain("https://example.com");
    expect(JSON.stringify(rejected.body)).not.toContain("token=secret");
  });
});

async function gatewayJson(
  request: Request,
  options: {
    deps?: WorkspaceGatewayRuntimeDependencies;
    env?: WorkspaceGatewayRuntimeEnv;
  } = {},
) {
  const workspaceRoot = options.deps?.cwd ?? (await makeTempDir());
  const deps = options.deps ?? gatewayDeps(workspaceRoot);
  const sidecar = await startGatewaySidecar(
    workspaceRoot,
    deps,
    gatewayEnv(workspaceRoot, options.env),
  );
  const proxyEnv = proxyGatewayEnv(options.env ?? gatewayEnv(workspaceRoot), sidecar);
  const proxyDeps = { ...deps, proxyFetch: fetch };
  const response = await handleWorkspaceGatewayLocalProxyRequest(
    request,
    proxyEnv,
    createWorkspaceGatewayProxyDependencies(proxyEnv, proxyDeps),
  );

  if (!response) {
    throw new Error("Expected local workspace gateway response.");
  }

  const text = await response.text();

  return {
    body: text === "" ? {} : (JSON.parse(text) as Record<string, unknown>),
    response,
    sidecar,
  };
}

async function startGatewaySidecar(
  workspaceRoot: string,
  deps: WorkspaceGatewayRuntimeDependencies,
  env: WorkspaceGatewaySidecarExecutionEnv = sidecarExecutionEnv(workspaceRoot),
): Promise<WorkspaceGatewaySidecar> {
  const sidecar = await startWorkspaceGatewaySidecar(
    {
      env,
      workspaceRoot,
    },
    {
      createProxyToken: () => proxyToken,
      operations: createWorkspaceGatewayOperationHandlers(deps),
    },
  );

  sidecars.push(sidecar);
  return sidecar;
}

function proxyGatewayEnv(
  env: WorkspaceGatewayRuntimeEnv,
  sidecar: WorkspaceGatewaySidecar,
): WorkspaceGatewayRuntimeEnv {
  return {
    ...env,
    [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: sidecar.proxyToken,
    [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]: sidecar.endpoint,
  };
}

function sidecarPath(sidecar: WorkspaceGatewaySidecar, pathname: string): string {
  return new URL(pathname, sidecar.endpoint).toString();
}

function sidecarProxyHeaders(input: {
  operation?: string;
  token?: string;
  via: "admin-bearer" | "bootstrap" | "owner-session";
}): Record<string, string> {
  return {
    [WORKSPACE_GATEWAY_ACTOR_HEADER]: input.via === "admin-bearer" ? "automation" : "browser",
    [WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER]: input.via,
    ...(input.operation === undefined
      ? {}
      : { [WORKSPACE_GATEWAY_OPERATION_KIND_HEADER]: input.operation }),
    [WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER]: input.token ?? proxyToken,
  };
}

function operationRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://local.test${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}`, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    method: "POST",
  });
}

function gatewayEnv(
  _workspaceRoot: string,
  overrides: Partial<WorkspaceGatewayRuntimeEnv> = {},
): WorkspaceGatewayRuntimeEnv {
  return {
    FORMLESS_ADMIN_TOKEN: adminToken,
    FORMLESS_LOCAL_WORKSPACE_GATEWAY: "1",
    FORMLESS_OWNER_SESSION_SECRET: ownerSecret,
    FORMLESS_RUNTIME_PROFILE: "instance",
    FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN: bootstrapToken,
    FORMLESS_WORKSPACE_GATEWAY_CSRF_TOKEN: csrfToken,
    ...overrides,
  };
}

function sidecarExecutionEnv(
  workspaceRoot: string,
  overrides: Partial<WorkspaceGatewaySidecarExecutionEnv> = {},
): WorkspaceGatewaySidecarExecutionEnv {
  return {
    FORMLESS_ADMIN_TOKEN: adminToken,
    FORMLESS_LOCAL_WORKSPACE_GATEWAY: "1",
    FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN: proxyToken,
    FORMLESS_WORKSPACE_GATEWAY_ROOT: workspaceRoot,
    ...overrides,
  };
}

function gatewayDeps(
  workspaceRoot: string,
  options: {
    autoSaveDebounceMs?: number;
    autoSaveScheduler?: WorkspaceAutoSaveScheduler;
    credentialSetup?: WorkspaceGatewayRuntimeDependencies["credentialSetup"];
    credentialSetupUrl?: string;
    operationIds?: string[];
    operationCapabilities?: WorkspaceGatewayRuntimeDependencies["operationCapabilities"];
    timestamps?: string[];
  } = {},
): WorkspaceGatewayRuntimeDependencies {
  const operationIds = [...(options.operationIds ?? [])];

  return {
    ...(options.autoSaveDebounceMs === undefined
      ? {}
      : { autoSaveDebounceMs: options.autoSaveDebounceMs }),
    ...(options.autoSaveScheduler === undefined
      ? {}
      : { autoSaveScheduler: options.autoSaveScheduler }),
    createOperationId: () => operationIds.shift() ?? "op_test_00000001",
    credentialSetup:
      options.credentialSetup ??
      (options.credentialSetupUrl === undefined
        ? undefined
        : async (input) => ({
            at: "2026-06-02T01:00:02.000Z",
            authorizationUrl: options.credentialSetupUrl ?? "",
            clientId: "formless-client-id",
            continue: () => new Promise<never>(() => {}),
            credentialRef: "formless-cloudflare-oauth:default",
            kind: "authorization-waiting",
            profileLabel: input.profileLabel ?? "Default",
            provider: "cloudflare",
            requestedScopes: ["account.read"],
            scopeSet: "formless-cloudflare-deploy-oauth",
          })),
    cwd: workspaceRoot,
    fetch: async () => Response.json({ setupComplete: false }),
    now: timestampSequence(...(options.timestamps ?? ["2026-06-02T01:00:00.000Z"])),
    ...(options.operationCapabilities === undefined
      ? {}
      : { operationCapabilities: options.operationCapabilities }),
    readOwnerSetupStatus: async () => ({ setupComplete: false }),
  };
}

function bootstrapHeaders(): Record<string, string> {
  return {
    [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
    Origin: "http://local.test",
  };
}

function browserHeaders(input: {
  cookie: string;
  csrf?: boolean;
  origin?: string;
}): Record<string, string> {
  return {
    Cookie: [
      input.cookie,
      ...(input.csrf ? [`${WORKSPACE_GATEWAY_CSRF_COOKIE_NAME}=${csrfToken}`] : []),
    ].join("; "),
    ...(input.csrf ? { [WORKSPACE_GATEWAY_CSRF_HEADER]: csrfToken } : {}),
    Origin: input.origin ?? "http://local.test",
  };
}

async function ownerCookie(): Promise<string> {
  const created = await createOwnerSessionCookie({
    env: { FORMLESS_OWNER_SESSION_SECRET: ownerSecret },
    now: "2999-01-01T00:00:00.000Z",
    owner: { createdAt: "2026-06-02T01:00:00.000Z", id: "owner-1", name: "Ada Owner" },
    request: new Request("http://local.test/"),
  });

  return created.cookie.split(";")[0] ?? created.cookie;
}

function timestampSequence(...timestamps: string[]): () => string {
  let index = 0;

  return () =>
    timestamps[index++ % timestamps.length] ?? timestamps.at(-1) ?? new Date(0).toISOString();
}

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "formless-workspace-gateway-test-"));

  tempDirs.push(tempDir);
  return tempDir;
}

async function writeWorkspaceConfig(workspaceRoot: string) {
  const manifest = resolveFormlessConfig({ name: "personal-sites" });

  await mkdir(workspaceRoot, { recursive: true });
  await writeFile(
    path.join(workspaceRoot, FORMLESS_CONFIG_FILE),
    formatTestFormlessConfigModule(manifest),
  );
}
