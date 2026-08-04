import {
  WORKSPACE_GATEWAY_CSRF_COOKIE_NAME,
  isWorkspaceGatewayApiErrorBody,
  isWorkspaceGatewayPushResponse,
  isWorkspaceGatewayStatusResponse,
  type WorkspaceGatewayActorFacts,
  type WorkspaceGatewayErrorCode,
  type WorkspaceGatewayPush,
  type WorkspaceGatewayPushResponse,
  type WorkspaceGatewayStatusResponse,
} from "./index.ts";

export const WORKSPACE_GATEWAY_SAFE_RESPONSE_HEADERS = ["Allow", "Content-Type"] as const;

export type WorkspaceGatewayResponseKind = "empty" | "push" | "status";
export type WorkspaceGatewayResponseSafetyEnv = { csrfToken?: string };

export function workspaceGatewayJsonResponse(
  body: unknown,
  status = 200,
  inputHeaders: HeadersInit = new Headers(),
): Response {
  const headers = new Headers(inputHeaders);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json");
  return Response.json(body, {
    headers,
    status,
  });
}

export function workspaceGatewayErrorResponse(
  code: WorkspaceGatewayErrorCode,
  status = workspaceGatewayErrorStatus(code),
): Response {
  return workspaceGatewayJsonResponse({ code }, status);
}

export function workspaceGatewayNotFoundResponse(): Response {
  return workspaceGatewayErrorResponse("not-found");
}

export function workspaceGatewayMethodNotAllowedResponse(methods: readonly string[]): Response {
  const response = workspaceGatewayErrorResponse("method-not-allowed");
  response.headers.set("Allow", methods.join(", "));
  return response;
}

export function workspaceGatewaySidecarUnavailableResponse(): Response {
  return workspaceGatewayErrorResponse("gateway-unavailable");
}

export function workspaceGatewayInvalidSidecarResponse(): Response {
  return workspaceGatewayErrorResponse("invalid-sidecar-response");
}

export async function workspaceGatewaySafeSidecarResponse(input: {
  authorization: WorkspaceGatewayActorFacts;
  env: WorkspaceGatewayResponseSafetyEnv;
  kind: WorkspaceGatewayResponseKind;
  request: Request;
  response: Response;
}): Promise<Response> {
  const headers = workspaceGatewayAllowedPassthroughResponseHeaders(input.response.headers);
  headers.set("Cache-Control", "no-store");
  if (input.kind === "empty" && input.response.status === 204) {
    return new Response(null, { headers, status: 204 });
  }

  const body = await readJson(input.response);
  if (body === undefined) return workspaceGatewayInvalidSidecarResponse();

  if (!input.response.ok) {
    return isWorkspaceGatewayApiErrorBody(body)
      ? workspaceGatewayJsonResponse(body, input.response.status)
      : workspaceGatewayInvalidSidecarResponse();
  }

  if (input.kind === "push" && isWorkspaceGatewayPushResponse(body)) {
    return workspaceGatewayJsonResponse(body, input.response.status);
  }
  if (input.kind === "status" && isWorkspaceGatewayStatusResponse(body)) {
    const csrf = workspaceGatewayBrowserCsrf(input);
    const status: WorkspaceGatewayStatusResponse = {
      ...body,
      ...(csrf.token === undefined ? {} : { csrfToken: csrf.token }),
    };
    return workspaceGatewayJsonResponse(status, input.response.status, csrf.headers);
  }
  return workspaceGatewayInvalidSidecarResponse();
}

export function workspaceGatewayPushResponse(push: WorkspaceGatewayPush): Response {
  return workspaceGatewayJsonResponse({ push } satisfies WorkspaceGatewayPushResponse);
}

export function workspaceGatewayStatusResponse(
  body: Omit<WorkspaceGatewayStatusResponse, "csrfToken">,
): Response {
  return workspaceGatewayJsonResponse(body);
}

export function workspaceGatewayEmptySuccessResponse(): Response {
  return new Response(null, { headers: { "Cache-Control": "no-store" }, status: 204 });
}

export function workspaceGatewayAllowedPassthroughResponseHeaders(headers: Headers): Headers {
  const safe = new Headers();
  for (const name of WORKSPACE_GATEWAY_SAFE_RESPONSE_HEADERS) {
    const value = headers.get(name);
    if (value !== null) safe.set(name, value);
  }
  return safe;
}

export function workspaceGatewayErrorStatus(code: WorkspaceGatewayErrorCode): number {
  switch (code) {
    case "unauthorized":
      return 401;
    case "forbidden":
    case "bootstrap-expired":
    case "csrf-invalid":
      return 403;
    case "gateway-unavailable":
      return 503;
    case "push-active":
      return 409;
    case "push-not-found":
    case "interaction-not-found":
    case "not-found":
      return 404;
    case "interaction-expired":
      return 410;
    case "method-not-allowed":
      return 405;
    case "invalid-sidecar-response":
      return 502;
    case "interaction-invalid":
    case "invalid-request":
      return 400;
  }
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.headers.get("Content-Type")?.toLowerCase().includes("application/json")) {
    return undefined;
  }
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function workspaceGatewayBrowserCsrf(input: {
  authorization: WorkspaceGatewayActorFacts;
  env: WorkspaceGatewayResponseSafetyEnv;
  request: Request;
}): { headers: Headers; token?: string } {
  const headers = new Headers();
  const token = input.env.csrfToken?.trim();
  if (
    input.authorization.actor !== "browser" ||
    input.authorization.via !== "owner-session" ||
    !token
  ) {
    return { headers };
  }
  headers.set(
    "Set-Cookie",
    `${WORKSPACE_GATEWAY_CSRF_COOKIE_NAME}=${token}; Path=/; SameSite=Lax${
      new URL(input.request.url).protocol === "https:" ? "; Secure" : ""
    }`,
  );
  return { headers, token };
}
