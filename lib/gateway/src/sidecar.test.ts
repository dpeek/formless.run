import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  WORKSPACE_GATEWAY_ACTOR_HEADER,
  WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER,
  WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH,
  WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_CSRF_TOKEN_ENV,
  WORKSPACE_GATEWAY_ENABLED_ENV,
  WORKSPACE_GATEWAY_OPERATION_KIND_HEADER,
  WORKSPACE_GATEWAY_OPERATIONS_API_PATH,
  WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_ROOT_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
  WORKSPACE_GATEWAY_STATUS_API_PATH,
  createWorkspaceGatewaySidecarExecutionEnv,
  handleWorkspaceGatewaySidecarRequest,
  startWorkspaceGatewaySidecar,
  workspaceGatewayProxyTargetFromEnv,
  type WorkspaceGatewayOperation,
  type WorkspaceGatewaySidecar,
  type WorkspaceGatewaySidecarOperationHandlers,
} from "./sidecar.ts";

const proxyToken = "sidecar-proxy-token";
const bootstrapToken = "workspace-bootstrap-token";
const csrfToken = "workspace-csrf-token";
const adminToken = "workspace-admin-token";
const workspaceRoot = "/workspace";
const sidecars: WorkspaceGatewaySidecar[] = [];

afterEach(async () => {
  await Promise.all(sidecars.splice(0).map((sidecar) => sidecar.close()));
});

describe("sidecar workspace gateway adapter", () => {
  it("builds sidecar startup execution env from an explicit allowlist", () => {
    const broadRuntimeEnv: Record<string, string> = {
      FORMLESS_ADMIN_TOKEN: adminToken,
      FORMLESS_LOCAL_WORKSPACE_GATEWAY: "0",
      FORMLESS_RUNTIME_PROFILE: "publishedSite",
      [WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV]: bootstrapToken,
      [WORKSPACE_GATEWAY_CSRF_TOKEN_ENV]: csrfToken,
      [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: "stale-proxy-token",
      [WORKSPACE_GATEWAY_ROOT_ENV]: "/stale/root",
      [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]: "http://127.0.0.1:1",
      VITE_FORMLESS_RUNTIME_PROFILE: "publishedSite",
      VITE_FORMLESS_WORKSPACE_GATEWAY_API: "http://127.0.0.1:1/api/formless/workspace",
      VITE_FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN: bootstrapToken,
      VITE_FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN: "browser-proxy-token",
      VITE_FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL: "http://127.0.0.1:1",
    };

    expect(
      createWorkspaceGatewaySidecarExecutionEnv({
        env: broadRuntimeEnv,
        proxyToken,
        workspaceRoot,
      }),
    ).toEqual({
      FORMLESS_ADMIN_TOKEN: adminToken,
      [WORKSPACE_GATEWAY_ENABLED_ENV]: "1",
      [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: proxyToken,
      [WORKSPACE_GATEWAY_ROOT_ENV]: workspaceRoot,
    });
  });

  it("maps local proxy env to loopback sidecar targets", () => {
    const request = new Request(`http://local.test${WORKSPACE_GATEWAY_STATUS_API_PATH}`);
    const proxyEnv = {
      ...gatewayEnv(),
      [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]: "http://127.0.0.1:9999",
    };

    expect(workspaceGatewayProxyTargetFromEnv(request, proxyEnv)).toEqual({
      endpoint: "http://127.0.0.1:9999",
      proxyToken,
    });
    expect(
      workspaceGatewayProxyTargetFromEnv(request, {
        ...proxyEnv,
        [WORKSPACE_GATEWAY_ENABLED_ENV]: "0",
      }),
    ).toBeUndefined();
    expect(
      workspaceGatewayProxyTargetFromEnv(request, proxyEnv, { routeAvailable: false }),
    ).toBeUndefined();
    expect(
      workspaceGatewayProxyTargetFromEnv(request, proxyEnv, { routeAvailable: () => false }),
    ).toBeUndefined();
    expect(
      workspaceGatewayProxyTargetFromEnv(request, {
        ...proxyEnv,
        [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: "",
      }),
    ).toBeUndefined();
    expect(
      workspaceGatewayProxyTargetFromEnv(request, {
        ...proxyEnv,
        [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]: "http://example.com:9999",
      }),
    ).toBeUndefined();
  });

  it("starts a loopback Node sidecar and routes proxied requests to operation handlers", async () => {
    let statusCall:
      | {
          actor: string;
          via: string;
          workspaceRoot: string;
        }
      | undefined;
    const sidecar = await startWorkspaceGatewaySidecar(
      { env: gatewayEnv(), workspaceRoot },
      {
        createProxyToken: () => proxyToken,
        operations: operationHandlers({
          status: async ({ authorization, workspaceRoot }) => {
            statusCall = { ...authorization, workspaceRoot };

            return operation("status", { actor: authorization.actor });
          },
        }),
      },
    );

    sidecars.push(sidecar);

    const endpoint = new URL(sidecar.endpoint);
    expect(endpoint.hostname).toBe("127.0.0.1");
    expect(endpoint.protocol).toBe("http:");
    expect(sidecar.proxyToken).toBe(proxyToken);

    const response = await fetch(new URL(WORKSPACE_GATEWAY_STATUS_API_PATH, sidecar.endpoint), {
      headers: sidecarProxyHeaders({ operation: "status", via: "bootstrap" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      operation: {
        actor: "browser",
        id: "op_status_00000001",
        operation: "status",
      },
    });
    expect(statusCall).toEqual({
      actor: "browser",
      via: "bootstrap",
      workspaceRoot,
    });

    await sidecar.close();
    await expect(
      fetch(new URL(WORKSPACE_GATEWAY_STATUS_API_PATH, sidecar.endpoint), {
        headers: sidecarProxyHeaders({ operation: "status", via: "bootstrap" }),
      }),
    ).rejects.toThrow();
  });

  it("wraps sidecar method, not-found, and error responses through response safety", async () => {
    const methodResponse = await handleWorkspaceGatewaySidecarRequest(
      new Request(`http://127.0.0.1${WORKSPACE_GATEWAY_STATUS_API_PATH}`, { method: "POST" }),
      gatewayEnv(),
      operationHandlers(),
    );
    const notFoundResponse = await handleWorkspaceGatewaySidecarRequest(
      new Request("http://127.0.0.1/api/formless/workspace/missing"),
      gatewayEnv(),
      operationHandlers(),
    );
    const parseErrorResponse = await handleWorkspaceGatewaySidecarRequest(
      new Request(`http://127.0.0.1${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}`, {
        body: "{",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      gatewayEnv(),
      operationHandlers(),
    );

    expect(methodResponse?.status).toBe(405);
    expect(methodResponse?.headers.get("Allow")).toBe("GET");
    expect(methodResponse?.headers.get("Content-Type")).toBe("application/json");
    expect(headerKeys(methodResponse)).toEqual(["allow", "content-type"]);
    await expect(methodResponse?.json()).resolves.toEqual({ error: "Method not allowed." });

    expect(notFoundResponse?.status).toBe(404);
    expect(notFoundResponse?.headers.get("Content-Type")).toBe("application/json");
    await expect(notFoundResponse?.json()).resolves.toEqual({ error: "Not found." });

    expect(parseErrorResponse?.status).toBe(400);
    expect(parseErrorResponse?.headers.get("Content-Type")).toBe("application/json");
    await expect(parseErrorResponse?.json()).resolves.toEqual({
      error: "Workspace gateway operation request must be JSON.",
    });
  });

  it("wraps operations and returns empty auto-save enqueue success", async () => {
    const autoSaveInputs: unknown[] = [];
    const handlers = operationHandlers({
      enqueueAutoSave: async (input) => {
        autoSaveInputs.push(input.enqueue);
      },
      status: async ({ authorization }) => operation("status", { actor: authorization.actor }),
    });
    const operationResponse = await handleWorkspaceGatewaySidecarRequest(
      new Request(`http://127.0.0.1${WORKSPACE_GATEWAY_STATUS_API_PATH}`, {
        headers: sidecarProxyHeaders({ operation: "status", via: "owner-session" }),
      }),
      gatewayEnv(),
      handlers,
    );
    const autoSaveStatusResponse = await handleWorkspaceGatewaySidecarRequest(
      new Request(`http://127.0.0.1${WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH}`, {
        headers: sidecarProxyHeaders({ operation: "status", via: "owner-session" }),
      }),
      gatewayEnv(),
      handlers,
    );
    const autoSaveEnqueueResponse = await handleWorkspaceGatewaySidecarRequest(
      new Request(`http://127.0.0.1${WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH}`, {
        body: JSON.stringify({ source: "schema-save" }),
        headers: {
          "Content-Type": "application/json",
          ...sidecarProxyHeaders({ operation: "save", via: "owner-session" }),
        },
        method: "POST",
      }),
      gatewayEnv(),
      handlers,
    );

    expect(operationResponse?.status).toBe(200);
    expect(operationResponse?.headers.get("Content-Type")).toBe("application/json");
    expect(operationResponse?.headers.get("Set-Cookie")).toBeNull();
    expect(operationResponse?.headers.get(WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER)).toBeNull();
    expect(headerKeys(operationResponse)).toEqual(["content-type"]);
    await expect(operationResponse?.json()).resolves.toMatchObject({
      operation: {
        actor: "browser",
        operation: "status",
      },
    });

    expect(autoSaveStatusResponse?.status).toBe(405);
    expect(autoSaveStatusResponse?.headers.get("Allow")).toBe("POST");
    expect(autoSaveStatusResponse?.headers.get("Content-Type")).toBe("application/json");
    expect(autoSaveStatusResponse?.headers.get("Set-Cookie")).toBeNull();
    await expect(autoSaveStatusResponse?.json()).resolves.toEqual({ error: "Method not allowed." });

    expect(autoSaveEnqueueResponse?.status).toBe(204);
    expect(autoSaveEnqueueResponse?.headers.get("Content-Type")).toBeNull();
    expect(autoSaveEnqueueResponse?.headers.get("Set-Cookie")).toBeNull();
    await expect(autoSaveEnqueueResponse?.text()).resolves.toBe("");
    expect(autoSaveInputs).toEqual([{ source: "schema-save" }]);
  });

  it("rejects sidecar execution authorization failures before operation handlers run", async () => {
    const calls: string[] = [];
    const handlers = operationHandlers({
      enqueueAutoSave: async () => {
        calls.push("enqueueAutoSave");
      },
      readOperation: async () => {
        calls.push("readOperation");
        return operation("status");
      },
      startOperation: async ({ authorization, operationInput }) => {
        calls.push("startOperation");
        return operation(operationInput.kind, { actor: authorization.actor });
      },
      status: async ({ authorization }) => {
        calls.push("status");
        return operation("status", { actor: authorization.actor });
      },
    });
    const missingRoot = await handleWorkspaceGatewaySidecarRequest(
      new Request(`http://127.0.0.1${WORKSPACE_GATEWAY_STATUS_API_PATH}`, {
        headers: sidecarProxyHeaders({ operation: "status", via: "bootstrap" }),
      }),
      {
        FORMLESS_LOCAL_WORKSPACE_GATEWAY: "1",
        [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: proxyToken,
      },
      handlers,
    );
    const missingProxyToken = await handleWorkspaceGatewaySidecarRequest(
      operationRequest({ kind: "save" }),
      gatewayEnv(),
      handlers,
    );
    const wrongProxyToken = await handleWorkspaceGatewaySidecarRequest(
      operationRequest(
        { kind: "save" },
        sidecarProxyHeaders({ token: "wrong", via: "owner-session" }),
      ),
      gatewayEnv(),
      handlers,
    );
    const invalidActor = await handleWorkspaceGatewaySidecarRequest(
      operationRequest(
        { kind: "save" },
        {
          ...sidecarProxyHeaders({ via: "owner-session" }),
          [WORKSPACE_GATEWAY_ACTOR_HEADER]: "automation",
        },
      ),
      gatewayEnv(),
      handlers,
    );
    const invalidOperationIntent = await handleWorkspaceGatewaySidecarRequest(
      operationRequest(
        { kind: "save" },
        sidecarProxyHeaders({ operation: "status", via: "owner-session" }),
      ),
      gatewayEnv(),
      handlers,
    );
    const browserBearer = await handleWorkspaceGatewaySidecarRequest(
      operationRequest(
        { kind: "save" },
        {
          Authorization: `Bearer ${adminToken}`,
          Origin: "http://local.test",
        },
      ),
      gatewayEnv(),
      handlers,
    );
    const bootstrapEscalation = await handleWorkspaceGatewaySidecarRequest(
      operationRequest(
        { kind: "save" },
        sidecarProxyHeaders({ operation: "save", via: "bootstrap" }),
      ),
      gatewayEnv(),
      handlers,
    );
    const directBootstrapHeader = await handleWorkspaceGatewaySidecarRequest(
      new Request(`http://127.0.0.1${WORKSPACE_GATEWAY_STATUS_API_PATH}`, {
        headers: {
          [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
        },
      }),
      gatewayEnv(),
      handlers,
    );

    expect(missingRoot?.status).toBe(404);
    expect(missingProxyToken?.status).toBe(401);
    expect(wrongProxyToken?.status).toBe(401);
    expect(invalidActor?.status).toBe(400);
    expect(invalidOperationIntent?.status).toBe(400);
    expect(browserBearer?.status).toBe(401);
    expect(bootstrapEscalation?.status).toBe(403);
    expect(directBootstrapHeader?.status).toBe(401);
    await expect(missingProxyToken?.json()).resolves.toEqual({
      error: "Workspace gateway proxy authorization is required.",
    });
    await expect(wrongProxyToken?.json()).resolves.toEqual({
      error: "Workspace gateway proxy authorization is required.",
    });
    await expect(invalidActor?.json()).resolves.toEqual({
      error: "Workspace gateway proxy actor facts are invalid.",
    });
    await expect(invalidOperationIntent?.json()).resolves.toEqual({
      error: "Workspace gateway operation intent is invalid.",
    });
    await expect(browserBearer?.json()).resolves.toEqual({
      error: "Workspace gateway proxy authorization is required.",
    });
    await expect(bootstrapEscalation?.json()).resolves.toEqual({
      error: "Workspace bootstrap authorization is limited to status operations.",
    });
    await expect(directBootstrapHeader?.json()).resolves.toEqual({
      error: "Workspace gateway proxy authorization is required.",
    });
    expect(calls).toEqual([]);
  });

  it("allows direct non-browser admin bearer automation at the sidecar", async () => {
    const response = await handleWorkspaceGatewaySidecarRequest(
      operationRequest(
        { kind: "save" },
        {
          Authorization: `Bearer ${adminToken}`,
        },
      ),
      gatewayEnv(),
      operationHandlers(),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      operation: {
        actor: "automation",
        operation: "save",
      },
    });
  });

  it("requires sidecar operation intent for bootstrap reads and validates read intent", async () => {
    let readOperations = 0;
    const mismatchedSidecarIntent = await handleWorkspaceGatewaySidecarRequest(
      new Request(`http://127.0.0.1${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/op_save_00000001`, {
        headers: sidecarProxyHeaders({ operation: "status", via: "owner-session" }),
      }),
      gatewayEnv(),
      operationHandlers({
        readOperation: async () => {
          readOperations += 1;
          return operation("save");
        },
      }),
    );
    const sidecarBootstrapWithoutIntent = await handleWorkspaceGatewaySidecarRequest(
      new Request(`http://127.0.0.1${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/op_status_00000001`, {
        headers: sidecarProxyHeaders({ via: "bootstrap" }),
      }),
      gatewayEnv(),
      operationHandlers(),
    );

    expect(sidecarBootstrapWithoutIntent?.status).toBe(400);
    await expect(sidecarBootstrapWithoutIntent?.json()).resolves.toEqual({
      error: "Workspace gateway operation intent is required for bootstrap reads.",
    });
    expect(mismatchedSidecarIntent?.status).toBe(400);
    await expect(mismatchedSidecarIntent?.json()).resolves.toEqual({
      error: "Workspace operation intent does not match operation state.",
    });
    expect(readOperations).toBe(1);
  });
});

function gatewayEnv(): Record<string, string> {
  return {
    FORMLESS_ADMIN_TOKEN: adminToken,
    FORMLESS_LOCAL_WORKSPACE_GATEWAY: "1",
    [WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV]: bootstrapToken,
    [WORKSPACE_GATEWAY_CSRF_TOKEN_ENV]: csrfToken,
    [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: proxyToken,
    [WORKSPACE_GATEWAY_ROOT_ENV]: workspaceRoot,
  };
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

function operationHandlers(
  overrides: Partial<WorkspaceGatewaySidecarOperationHandlers> = {},
): WorkspaceGatewaySidecarOperationHandlers {
  return {
    enqueueAutoSave: async () => undefined,
    readOperation: async ({ authorization }) => operation("status", { actor: authorization.actor }),
    startOperation: async ({ authorization, operationInput }) =>
      operation(operationInput.kind, { actor: authorization.actor }),
    status: async ({ authorization }) => operation("status", { actor: authorization.actor }),
    ...overrides,
  };
}

function operation(
  operationKind: WorkspaceGatewayOperation["operation"],
  overrides: Partial<WorkspaceGatewayOperation> = {},
): WorkspaceGatewayOperation {
  return {
    actor: overrides.actor ?? "browser",
    createdAt: "2026-06-02T01:00:00.000Z",
    errors: [],
    events: [],
    id: `op_${operationKind}_00000001`,
    input: {},
    kind: "formless.workspaceOperation",
    logs: [],
    operation: operationKind,
    status: "succeeded",
    summary: {
      fields: { operation: operationKind },
      title: `${operationKind} complete`,
    },
    updatedAt: "2026-06-02T01:00:00.000Z",
    version: 1,
    workspace: { label: "Workspace" },
    ...overrides,
  };
}

function headerKeys(response: Response | undefined): string[] {
  return [...(response?.headers.keys() ?? [])].sort();
}
