import { expect } from "vite-plus/test";

import { WORKSPACE_OPERATION_CAPABILITIES } from "@dpeek/formless-workspace";
import {
  WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH,
  WORKSPACE_GATEWAY_CSRF_COOKIE_NAME,
  WORKSPACE_GATEWAY_CSRF_HEADER,
  WORKSPACE_GATEWAY_OPERATIONS_API_PATH,
  WORKSPACE_GATEWAY_STATUS_API_PATH,
  type WorkspaceGatewayOperation,
  type WorkspaceGatewayOperationKind,
} from "./index.ts";
import type {
  WorkspaceGatewayProxyRulesDependencies,
  WorkspaceGatewayProxyRulesEnv,
  WorkspaceGatewayProxyRulesTarget,
} from "./proxy-rules.ts";

export const ownerSessionCookie = "formless_owner_session=valid";
export const csrfToken = "csrf-token";
export const bootstrapToken = "bootstrap-token";
export const adminToken = "admin-token";
export const proxyToken = "sidecar-proxy-token";
export const sidecarEndpoint = "http://127.0.0.1:9876";

export const baseProxyRulesEnv: WorkspaceGatewayProxyRulesEnv = {
  adminToken,
  bootstrapToken,
  csrfToken,
};

export const proxyRulesTarget: WorkspaceGatewayProxyRulesTarget = {
  endpoint: sidecarEndpoint,
  proxyToken,
};

export type CapturedSidecarCall = {
  body?: string;
  headers: Headers;
  method?: string;
  url: string;
};

export function proxyRulesDependencies(
  overrides: Partial<WorkspaceGatewayProxyRulesDependencies> = {},
): WorkspaceGatewayProxyRulesDependencies {
  return {
    capabilities: WORKSPACE_OPERATION_CAPABILITIES,
    fetch: async () => Response.json({ operation: workspaceGatewayOperation("status") }),
    proxyTarget: () => proxyRulesTarget,
    ...overrides,
  };
}

export function captureSidecarOperationCalls(
  calls: CapturedSidecarCall[],
  operationResponse: WorkspaceGatewayOperation,
  responseInit: ResponseInit = {},
): typeof fetch {
  return async (input, init) => {
    calls.push(await capturedSidecarCall(input, init));

    return sidecarJsonResponse({ operation: operationResponse }, responseInit);
  };
}

export function captureSidecarAutoSaveCalls(
  calls: CapturedSidecarCall[],
  responseInit: ResponseInit = { status: 204 },
): typeof fetch {
  return async (input, init) => {
    calls.push(await capturedSidecarCall(input, init));

    return new Response(null, responseInit);
  };
}

function sidecarJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return new Response(JSON.stringify(body), { ...init, headers });
}

export function gatewayStatusRequest(init: RequestInit = {}): Request {
  return new Request(`https://example.com${WORKSPACE_GATEWAY_STATUS_API_PATH}`, init);
}

export function gatewayOperationStartRequest(
  body: unknown,
  init: Omit<RequestInit, "body" | "method"> = {},
): Request {
  return new Request(`https://example.com${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}`, {
    ...init,
    body: JSON.stringify(body),
    headers: jsonHeaders(init.headers),
    method: "POST",
  });
}

export function gatewayOperationReadRequest(operationId: string, init: RequestInit = {}): Request {
  return new Request(
    `https://example.com${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/${operationId}`,
    init,
  );
}

export function gatewayAutoSaveStatusRequest(init: RequestInit = {}): Request {
  return new Request(`https://example.com${WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH}`, init);
}

export function gatewayAutoSaveEnqueueRequest(
  body: unknown,
  init: Omit<RequestInit, "body" | "method"> = {},
): Request {
  return new Request(`https://example.com${WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH}`, {
    ...init,
    body: JSON.stringify(body),
    headers: jsonHeaders(init.headers),
    method: "POST",
  });
}

export function browserMutationHeaders(): Record<string, string> {
  return {
    Cookie: `${ownerSessionCookie}; ${WORKSPACE_GATEWAY_CSRF_COOKIE_NAME}=${csrfToken}`,
    [WORKSPACE_GATEWAY_CSRF_HEADER]: csrfToken,
    "Content-Type": "application/json",
    Origin: "https://example.com",
  };
}

export function validateOwnerSession(request: Request) {
  return request.headers.get("Cookie")?.includes(ownerSessionCookie)
    ? { ok: true as const }
    : { ok: false as const, reason: "missing-cookie" };
}

export async function expectJsonBody(
  response: Response | undefined,
): Promise<Record<string, unknown>> {
  expect(response).toBeDefined();

  return (await response!.json()) as Record<string, unknown>;
}

export async function expectGatewayError(input: {
  error: string;
  label?: string;
  response: Response | undefined;
  status: number;
}): Promise<void> {
  const body = await expectJsonBody(input.response);

  expect(input.response?.status, input.label).toBe(input.status);
  expect(body.error, input.label).toBe(input.error);
}

export async function expectGatewayOperationResponse(input: {
  csrfToken?: string;
  operation?: Partial<WorkspaceGatewayOperation>;
  response: Response | undefined;
}): Promise<Record<string, unknown>> {
  const body = await expectJsonBody(input.response);

  expect(input.response?.status).toBe(200);
  if (input.csrfToken !== undefined) {
    expect(body.csrfToken).toBe(input.csrfToken);
  }
  if (input.operation !== undefined) {
    expect(body.operation).toMatchObject(input.operation);
  }

  return body;
}

export async function expectGatewayAutoSaveEnqueueResponse(input: {
  response: Response | undefined;
}): Promise<void> {
  expect(input.response?.status).toBe(204);
  await expect(input.response?.text()).resolves.toBe("");
}

export function expectNoSidecarCalls(calls: CapturedSidecarCall[], label?: string): void {
  expect(calls, label).toHaveLength(0);
}

export function workspaceGatewayOperation(
  operationKind: WorkspaceGatewayOperationKind,
  overrides: Partial<WorkspaceGatewayOperation> = {},
): WorkspaceGatewayOperation {
  return {
    actor: "browser",
    createdAt: "2026-06-03T00:00:00.000Z",
    errors: [],
    events: [],
    id: `op_${operationKind}_00000001`,
    input: { kind: operationKind },
    kind: "formless.workspaceOperation",
    logs: [],
    operation: operationKind,
    status: "succeeded",
    summary: {
      fields: {},
      title: "Workspace operation",
    },
    updatedAt: "2026-06-03T00:00:01.000Z",
    version: 1,
    workspace: { label: "workspace" },
    ...overrides,
  };
}

async function capturedSidecarCall(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
): Promise<CapturedSidecarCall> {
  return {
    ...(init?.body == null ? {} : { body: await requestBodyText(init.body) }),
    headers: new Headers(init?.headers),
    method: init?.method,
    url: requestUrl(input),
  };
}

function jsonHeaders(headers?: HeadersInit): Headers {
  const next = new Headers(headers);

  next.set("Content-Type", "application/json");

  return next;
}

async function requestBodyText(body: BodyInit): Promise<string> {
  if (typeof body === "string") {
    return body;
  }

  if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(body);
  }

  if (body instanceof Uint8Array) {
    return new TextDecoder().decode(body);
  }

  return "";
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.href : input.url;
}
