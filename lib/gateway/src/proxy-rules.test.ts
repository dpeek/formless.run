import { describe, expect, it } from "vite-plus/test";

import { workspaceOperationDefinitionForKind } from "@dpeek/formless-workspace";
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
} from "./index.ts";
import {
  adminToken,
  baseProxyRulesEnv,
  bootstrapToken,
  browserMutationHeaders,
  captureSidecarAutoSaveCalls,
  captureSidecarOperationCalls,
  csrfToken,
  expectGatewayAutoSaveResponse,
  expectGatewayError,
  expectGatewayOperationResponse,
  expectNoSidecarCalls,
  gatewayAutoSaveEnqueueRequest,
  gatewayAutoSaveStatusRequest,
  gatewayOperationReadRequest,
  gatewayOperationStartRequest,
  gatewayStatusRequest,
  ownerSessionCookie,
  proxyRulesDependencies,
  proxyRulesTarget,
  proxyToken,
  sidecarEndpoint,
  validateOwnerSession,
  workspaceGatewayAutoSaveState,
  workspaceGatewayOperation,
  type CapturedSidecarCall,
} from "./proxy-rules.contract-fixtures.ts";
import { handleWorkspaceGatewayProxyRulesRequest } from "./proxy-rules.ts";

describe("shared workspace gateway proxy rules", () => {
  it("classifies routes and rejects missing targets, disallowed methods, cross-origin callers, and invalid read ids before forwarding", async () => {
    const cases: Array<{
      expectedAllow?: string;
      expectedError?: string;
      expectedStatus?: number;
      request: Request;
      target?: boolean;
    }> = [
      {
        request: new Request("https://example.com/api/not-workspace/status"),
      },
      {
        expectedError: "Not found.",
        expectedStatus: 404,
        request: gatewayStatusRequest(),
        target: false,
      },
      {
        expectedError: "Not found.",
        expectedStatus: 404,
        request: new Request("https://example.com/api/formless/workspace/unknown"),
      },
      {
        expectedAllow: "GET",
        expectedError: "Method not allowed.",
        expectedStatus: 405,
        request: gatewayStatusRequest({ method: "POST" }),
      },
      {
        expectedAllow: "POST",
        expectedError: "Method not allowed.",
        expectedStatus: 405,
        request: new Request(`https://example.com${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}`),
      },
      {
        expectedAllow: "GET, POST",
        expectedError: "Method not allowed.",
        expectedStatus: 405,
        request: gatewayAutoSaveStatusRequest({ method: "PUT" }),
      },
      {
        expectedStatus: 403,
        request: gatewayStatusRequest({
          headers: { Origin: "https://evil.example.com" },
        }),
      },
      {
        expectedStatus: 400,
        request: gatewayOperationReadRequest("x"),
      },
    ];

    for (const testCase of cases) {
      const calls: CapturedSidecarCall[] = [];
      const response = await handleWorkspaceGatewayProxyRulesRequest(
        testCase.request,
        baseProxyRulesEnv,
        proxyRulesDependencies({
          fetch: captureSidecarOperationCalls(calls, workspaceGatewayOperation("status")),
          proxyTarget: () => (testCase.target === false ? undefined : proxyRulesTarget),
        }),
      );

      if (testCase.expectedStatus === undefined) {
        expect(response).toBeUndefined();
      } else if (testCase.expectedError !== undefined) {
        await expectGatewayError({
          error: testCase.expectedError,
          response,
          status: testCase.expectedStatus,
        });
      } else {
        expect(response?.status).toBe(testCase.expectedStatus);
      }
      if (testCase.expectedAllow !== undefined) {
        expect(response?.headers.get("Allow")).toBe(testCase.expectedAllow);
      }
      expectNoSidecarCalls(calls);
    }
  });

  it("rejects unsupported gateway operation kinds before forwarding", async () => {
    expect("gateway" in workspaceOperationDefinitionForKind("init").bindings).toBe(false);
    expect("gateway" in workspaceOperationDefinitionForKind("deploymentRefresh").bindings).toBe(
      false,
    );

    for (const bodyInput of [
      { kind: "init", name: "workspace" },
      { kind: "deploymentRefresh" },
      { kind: "deployPlan" },
      { kind: "deployApply" },
    ]) {
      const calls: CapturedSidecarCall[] = [];
      const response = await handleWorkspaceGatewayProxyRulesRequest(
        gatewayOperationStartRequest(bodyInput, {
          headers: browserMutationHeaders(),
        }),
        baseProxyRulesEnv,
        proxyRulesDependencies({
          fetch: captureSidecarOperationCalls(calls, workspaceGatewayOperation("status")),
          validateOwnerSession,
        }),
      );

      await expectGatewayError({
        error: `Workspace gateway operation "${bodyInput.kind}" is not supported.`,
        response,
        status: 400,
      });
      expectNoSidecarCalls(calls);
    }
  });

  it("proxies owner-session browser mutations with internal authorization and display-safe actor facts", async () => {
    const calls: CapturedSidecarCall[] = [];
    const response = await handleWorkspaceGatewayProxyRulesRequest(
      gatewayOperationStartRequest(
        { check: true, kind: "save" },
        {
          headers: {
            ...browserMutationHeaders(),
            Authorization: "Bearer browser-value",
            [WORKSPACE_GATEWAY_OPERATION_KIND_HEADER]: "push",
            [WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER]: "browser-proxy-token",
          },
        },
      ),
      baseProxyRulesEnv,
      proxyRulesDependencies({
        fetch: captureSidecarOperationCalls(calls, workspaceGatewayOperation("save"), {
          headers: {
            "Set-Cookie": "sidecar-secret=value",
            "X-Secret": "hidden",
          },
        }),
        validateOwnerSession,
      }),
    );

    await expectGatewayOperationResponse({
      csrfToken,
      operation: { operation: "save" },
      response,
    });
    expect(response?.headers.get("Set-Cookie")).toContain(
      `${WORKSPACE_GATEWAY_CSRF_COOKIE_NAME}=${csrfToken}`,
    );
    expect(response?.headers.get("Set-Cookie")).not.toContain("sidecar-secret");
    expect(response?.headers.get("X-Secret")).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      body: JSON.stringify({ check: true, kind: "save" }),
      method: "POST",
      url: `${sidecarEndpoint}${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}`,
    });
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER)).toBe(proxyToken);
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_ACTOR_HEADER)).toBe("browser");
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER)).toBe("owner-session");
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_OPERATION_KIND_HEADER)).toBe("save");
    expect(calls[0]?.headers.get("Authorization")).toBeNull();
    expect(calls[0]?.headers.get("Cookie")).toBeNull();
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_BOOTSTRAP_HEADER)).toBeNull();
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_CSRF_HEADER)).toBeNull();
  });

  it("proxies auto-save status and enqueue with bootstrap, owner-session, CSRF, and capability checks", async () => {
    const calls: CapturedSidecarCall[] = [];
    const status = await handleWorkspaceGatewayProxyRulesRequest(
      gatewayAutoSaveStatusRequest({
        headers: {
          [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
          Origin: "https://example.com",
        },
      }),
      baseProxyRulesEnv,
      proxyRulesDependencies({
        fetch: captureSidecarAutoSaveCalls(calls, workspaceGatewayAutoSaveState("clean"), {
          headers: {
            "Set-Cookie": "sidecar-secret=value",
            "X-Secret": "hidden",
          },
        }),
        readOwnerSetupStatus: async () => ({ setupComplete: false }),
      }),
    );
    const enqueued = await handleWorkspaceGatewayProxyRulesRequest(
      gatewayAutoSaveEnqueueRequest(
        { source: "control-plane-write" },
        {
          headers: browserMutationHeaders(),
        },
      ),
      baseProxyRulesEnv,
      proxyRulesDependencies({
        fetch: captureSidecarAutoSaveCalls(calls, workspaceGatewayAutoSaveState("queued")),
        validateOwnerSession,
      }),
    );
    const gated = await handleWorkspaceGatewayProxyRulesRequest(
      gatewayAutoSaveEnqueueRequest(
        { source: "control-plane-write" },
        {
          headers: browserMutationHeaders(),
        },
      ),
      baseProxyRulesEnv,
      proxyRulesDependencies({
        capabilities: ["workspace-read"],
        fetch: captureSidecarAutoSaveCalls(calls, workspaceGatewayAutoSaveState("queued")),
        validateOwnerSession,
      }),
    );

    await expectGatewayAutoSaveResponse({
      autoSave: { displayState: "clean" },
      response: status,
    });
    expectGatewayPassthroughResponseHeaders({ contentType: "application/json", response: status });
    await expectGatewayAutoSaveResponse({
      autoSave: { displayState: "queued" },
      csrfToken,
      response: enqueued,
    });
    await expectGatewayError({
      error: 'Workspace operation "save" requires execution capability "workspace-source-write".',
      response: gated,
      status: 403,
    });
    expect(calls.map((call) => call.url)).toEqual([
      `${sidecarEndpoint}${WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH}`,
      `${sidecarEndpoint}${WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH}`,
    ]);
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER)).toBe("bootstrap");
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_OPERATION_KIND_HEADER)).toBe("status");
    expect(calls[1]?.headers.get(WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER)).toBe("owner-session");
    expect(calls[1]?.headers.get(WORKSPACE_GATEWAY_OPERATION_KIND_HEADER)).toBe("save");
    expect(calls[1]?.body).toBe(JSON.stringify({ source: "control-plane-write" }));
  });

  it("authorizes browser mutations against the forwarded browser-facing origin", async () => {
    const calls: CapturedSidecarCall[] = [];
    const response = await handleWorkspaceGatewayProxyRulesRequest(
      new Request(`http://127.0.0.1:8787${WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH}`, {
        body: JSON.stringify({ source: "schema-save" }),
        headers: {
          ...browserMutationHeaders(),
          Origin: "https://formless.local",
          "x-forwarded-host": "formless.local",
          "x-forwarded-proto": "https",
        },
        method: "POST",
      }),
      baseProxyRulesEnv,
      proxyRulesDependencies({
        fetch: captureSidecarAutoSaveCalls(calls, workspaceGatewayAutoSaveState("queued")),
        validateOwnerSession,
      }),
    );

    await expectGatewayAutoSaveResponse({
      autoSave: { displayState: "queued" },
      csrfToken,
      response,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER)).toBe("owner-session");
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_OPERATION_KIND_HEADER)).toBe("save");
  });

  it("prefers owner-session authorization over an expired bootstrap header", async () => {
    const calls: CapturedSidecarCall[] = [];
    const response = await handleWorkspaceGatewayProxyRulesRequest(
      gatewayAutoSaveStatusRequest({
        headers: {
          Cookie: ownerSessionCookie,
          [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
          Origin: "https://example.com",
        },
      }),
      baseProxyRulesEnv,
      proxyRulesDependencies({
        fetch: captureSidecarAutoSaveCalls(calls, workspaceGatewayAutoSaveState("clean")),
        readOwnerSetupStatus: async () => ({ setupComplete: true }),
        validateOwnerSession,
      }),
    );

    await expectGatewayAutoSaveResponse({
      autoSave: { displayState: "clean" },
      csrfToken,
      response,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER)).toBe("owner-session");
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_BOOTSTRAP_HEADER)).toBeNull();
  });

  it("requires matching CSRF cookie and header before forwarding browser mutations", async () => {
    const cases: Array<{ headers: Record<string, string>; label: string }> = [
      {
        headers: {
          Cookie: ownerSessionCookie,
          [WORKSPACE_GATEWAY_CSRF_HEADER]: csrfToken,
        },
        label: "header without cookie",
      },
      {
        headers: {
          Cookie: `${ownerSessionCookie}; ${WORKSPACE_GATEWAY_CSRF_COOKIE_NAME}=${csrfToken}`,
        },
        label: "cookie without header",
      },
      {
        headers: {
          Cookie: `${ownerSessionCookie}; ${WORKSPACE_GATEWAY_CSRF_COOKIE_NAME}=wrong-token`,
          [WORKSPACE_GATEWAY_CSRF_HEADER]: csrfToken,
        },
        label: "mismatched cookie",
      },
    ];

    for (const testCase of cases) {
      const calls: CapturedSidecarCall[] = [];
      const response = await handleWorkspaceGatewayProxyRulesRequest(
        gatewayOperationStartRequest(
          { kind: "push" },
          {
            headers: {
              ...testCase.headers,
              Origin: "https://example.com",
            },
          },
        ),
        baseProxyRulesEnv,
        proxyRulesDependencies({
          fetch: captureSidecarOperationCalls(calls, workspaceGatewayOperation("push")),
          validateOwnerSession,
        }),
      );

      await expectGatewayError({
        error: "Workspace gateway browser mutations require CSRF proof.",
        label: testCase.label,
        response,
        status: 403,
      });
      expectNoSidecarCalls(calls, testCase.label);
    }
  });

  it("limits bootstrap authorization and validates read operation intent before forwarding", async () => {
    const calls: CapturedSidecarCall[] = [];
    const status = await handleWorkspaceGatewayProxyRulesRequest(
      gatewayStatusRequest({
        headers: {
          [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
          Origin: "https://example.com",
        },
      }),
      baseProxyRulesEnv,
      proxyRulesDependencies({
        fetch: captureSidecarOperationCalls(calls, workspaceGatewayOperation("status")),
        readOwnerSetupStatus: async () => ({ setupComplete: false }),
      }),
    );
    const save = await handleWorkspaceGatewayProxyRulesRequest(
      gatewayOperationStartRequest(
        { kind: "save" },
        {
          headers: {
            [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
            Origin: "https://example.com",
          },
        },
      ),
      baseProxyRulesEnv,
      proxyRulesDependencies({ readOwnerSetupStatus: async () => ({ setupComplete: false }) }),
    );
    const readWithoutIntent = await handleWorkspaceGatewayProxyRulesRequest(
      gatewayOperationReadRequest("op_status_00000001", {
        headers: { [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken },
      }),
      baseProxyRulesEnv,
      proxyRulesDependencies({ readOwnerSetupStatus: async () => ({ setupComplete: false }) }),
    );
    const readInvalidIntent = await handleWorkspaceGatewayProxyRulesRequest(
      gatewayOperationReadRequest("op_status_00000001", {
        headers: {
          [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
          [WORKSPACE_GATEWAY_OPERATION_KIND_HEADER]: "not-a-kind",
        },
      }),
      baseProxyRulesEnv,
      proxyRulesDependencies({ readOwnerSetupStatus: async () => ({ setupComplete: false }) }),
    );
    const readSaveIntent = await handleWorkspaceGatewayProxyRulesRequest(
      gatewayOperationReadRequest("op_save_00000001", {
        headers: {
          [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
          [WORKSPACE_GATEWAY_OPERATION_KIND_HEADER]: "save",
        },
      }),
      baseProxyRulesEnv,
      proxyRulesDependencies({ readOwnerSetupStatus: async () => ({ setupComplete: false }) }),
    );
    const expired = await handleWorkspaceGatewayProxyRulesRequest(
      gatewayStatusRequest({
        headers: { [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken },
      }),
      baseProxyRulesEnv,
      proxyRulesDependencies({ readOwnerSetupStatus: async () => ({ setupComplete: true }) }),
    );

    await expectGatewayOperationResponse({
      operation: { operation: "status" },
      response: status,
    });
    await expectGatewayError({
      error: "Workspace bootstrap authorization is limited to status operations.",
      response: save,
      status: 403,
    });
    await expectGatewayError({
      error: "Workspace gateway operation intent is required for bootstrap reads.",
      response: readWithoutIntent,
      status: 400,
    });
    await expectGatewayError({
      error: "Workspace gateway operation intent is invalid.",
      response: readInvalidIntent,
      status: 400,
    });
    await expectGatewayError({
      error: "Workspace bootstrap authorization is limited to status operations.",
      response: readSaveIntent,
      status: 403,
    });
    await expectGatewayError({
      error: "Workspace bootstrap authorization has expired.",
      response: expired,
      status: 403,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER)).toBe("bootstrap");
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_OPERATION_KIND_HEADER)).toBe("status");
  });

  it("proxies non-browser admin bearer automation without CSRF browser state", async () => {
    const calls: CapturedSidecarCall[] = [];
    const response = await handleWorkspaceGatewayProxyRulesRequest(
      gatewayOperationStartRequest(
        { dryRun: true, kind: "push" },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        },
      ),
      baseProxyRulesEnv,
      proxyRulesDependencies({
        fetch: captureSidecarOperationCalls(calls, workspaceGatewayOperation("push")),
      }),
    );
    const body = await expectGatewayOperationResponse({
      operation: { operation: "push" },
      response,
    });

    expect(response?.headers.get("Set-Cookie")).toBeNull();
    expect(body.csrfToken).toBeUndefined();
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_ACTOR_HEADER)).toBe("automation");
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER)).toBe("admin-bearer");
    expect(calls[0]?.headers.get("Authorization")).toBeNull();
  });

  it("rejects operations without advertised execution capabilities before forwarding", async () => {
    const cases: Array<{ expectedError: string; request: Request }> = [
      {
        expectedError:
          'Workspace operation "status" requires execution capability "workspace-read".',
        request: gatewayStatusRequest({
          headers: {
            Cookie: ownerSessionCookie,
          },
        }),
      },
      {
        expectedError:
          'Workspace operation "credentialSetup" requires execution capability "credential-setup".',
        request: gatewayOperationStartRequest(
          { kind: "credentialSetup", provider: "cloudflare" },
          {
            headers: {
              Authorization: `Bearer ${adminToken}`,
            },
          },
        ),
      },
      {
        expectedError:
          'Workspace operation "push" requires execution capability "workspace-source-sync".',
        request: gatewayOperationStartRequest(
          { kind: "push" },
          {
            headers: browserMutationHeaders(),
          },
        ),
      },
    ];

    for (const testCase of cases) {
      const calls: CapturedSidecarCall[] = [];
      const response = await handleWorkspaceGatewayProxyRulesRequest(
        testCase.request,
        baseProxyRulesEnv,
        proxyRulesDependencies({
          capabilities: [],
          fetch: captureSidecarOperationCalls(calls, workspaceGatewayOperation("status")),
          readOwnerSetupStatus: async () => ({ setupComplete: false }),
          validateOwnerSession,
        }),
      );

      await expectGatewayError({
        error: testCase.expectedError,
        response,
        status: 403,
      });
      expectNoSidecarCalls(calls);
    }
  });

  it("filters sidecar JSON error headers and returns sidecar unavailable fallback", async () => {
    const sidecarError = await handleWorkspaceGatewayProxyRulesRequest(
      gatewayStatusRequest({
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }),
      baseProxyRulesEnv,
      proxyRulesDependencies({
        fetch: async () =>
          sidecarJsonResponse(
            { error: "Sidecar refused." },
            {
              headers: {
                Allow: "GET",
                "Set-Cookie": "sidecar-secret=value",
                "X-Secret": "hidden",
              },
              status: 503,
            },
          ),
      }),
    );
    const unavailable = await handleWorkspaceGatewayProxyRulesRequest(
      gatewayStatusRequest({
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }),
      baseProxyRulesEnv,
      proxyRulesDependencies({
        fetch: async () => {
          throw new Error("sidecar down");
        },
      }),
    );

    await expectGatewayError({
      error: "Sidecar refused.",
      response: sidecarError,
      status: 503,
    });
    expectGatewayPassthroughResponseHeaders({
      allow: "GET",
      contentType: "application/json",
      response: sidecarError,
    });
    await expectGatewayError({
      error: "Workspace gateway sidecar is unavailable.",
      response: unavailable,
      status: 502,
    });
    expectGatewayPassthroughResponseHeaders({
      contentType: "application/json",
      response: unavailable,
    });
  });

  it("passes through display-safe non-JSON sidecar responses without browser CSRF wrapping", async () => {
    const response = await handleWorkspaceGatewayProxyRulesRequest(
      gatewayStatusRequest({
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }),
      baseProxyRulesEnv,
      proxyRulesDependencies({
        fetch: async () =>
          new Response("sidecar unavailable", {
            headers: {
              Allow: "GET",
              "Content-Type": "text/plain",
              "Set-Cookie": "secret=value",
              "X-Secret": "hidden",
            },
            status: 503,
          }),
      }),
    );

    expect(response?.status).toBe(503);
    expect(response).toBeDefined();
    await expect(response!.text()).resolves.toBe("sidecar unavailable");
    expectGatewayPassthroughResponseHeaders({
      allow: "GET",
      contentType: "text/plain",
      response,
    });
  });
});

function expectGatewayPassthroughResponseHeaders(input: {
  allow?: string;
  contentType?: string;
  label?: string;
  response: Response | undefined;
}): void {
  expect(input.response?.headers.get("Allow"), input.label).toBe(input.allow ?? null);
  if (input.contentType !== undefined) {
    expect(input.response?.headers.get("Content-Type"), input.label).toContain(input.contentType);
  }
  expect(input.response?.headers.get("Set-Cookie"), input.label).toBeNull();
  expect(input.response?.headers.get("X-Secret"), input.label).toBeNull();
}

function sidecarJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return new Response(JSON.stringify(body), { ...init, headers });
}
