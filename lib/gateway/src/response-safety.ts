import {
  WORKSPACE_GATEWAY_CSRF_COOKIE_NAME,
  type WorkspaceGatewayActor,
  type WorkspaceGatewayAuthorizationVia,
} from "./types.ts";

export const WORKSPACE_GATEWAY_SAFE_RESPONSE_HEADERS = ["Allow", "Content-Type"] as const;

export type WorkspaceGatewayResponseSafetyAuthorization = {
  actor: WorkspaceGatewayActor;
  via: WorkspaceGatewayAuthorizationVia;
};

export type WorkspaceGatewayResponseSafetyEnv = {
  csrfToken?: string;
};

export function workspaceGatewayJsonResponse(
  body: unknown,
  status: number,
  headers: HeadersInit = new Headers(),
): Response {
  const responseHeaders = new Headers(headers);

  responseHeaders.set("Content-Type", "application/json");

  return new Response(JSON.stringify(body), { headers: responseHeaders, status });
}

export function workspaceGatewayErrorResponse(
  error: string,
  status: number,
  headers?: HeadersInit,
): Response {
  return workspaceGatewayJsonResponse({ error }, status, headers);
}

export function workspaceGatewayNotFoundResponse(): Response {
  return workspaceGatewayErrorResponse("Not found.", 404);
}

export function workspaceGatewayMethodNotAllowedResponse(methods: readonly string[]): Response {
  return workspaceGatewayErrorResponse(
    "Method not allowed.",
    405,
    new Headers({ Allow: methods.join(", ") }),
  );
}

export function workspaceGatewaySidecarUnavailableResponse(): Response {
  return workspaceGatewayErrorResponse("Workspace gateway sidecar is unavailable.", 502);
}

export async function workspaceGatewaySafeSidecarResponse(input: {
  authorization: WorkspaceGatewayResponseSafetyAuthorization;
  env: WorkspaceGatewayResponseSafetyEnv;
  request: Request;
  response: Response;
}): Promise<Response> {
  const contentType = input.response.headers.get("Content-Type") ?? "";

  if (!contentType.includes("application/json")) {
    return workspaceGatewayNonJsonSidecarPassthroughResponse(input.response);
  }

  const body = (await input.response.json()) as unknown;

  if (input.response.status === 200 && responseObjectHas(body, "operation")) {
    return workspaceGatewayOperationResponse({
      authorization: input.authorization,
      env: input.env,
      operation: body.operation,
      request: input.request,
    });
  }

  return workspaceGatewayJsonResponse(
    body,
    input.response.status,
    workspaceGatewayAllowedPassthroughResponseHeaders(input.response.headers),
  );
}

export function workspaceGatewayOperationResponse(input: {
  authorization: WorkspaceGatewayResponseSafetyAuthorization;
  env: WorkspaceGatewayResponseSafetyEnv;
  operation: unknown;
  request: Request;
}): Response {
  const browserResponse = workspaceGatewayBrowserResponseHeaders(input);

  return workspaceGatewayJsonResponse(
    {
      ...(browserResponse.csrfToken === undefined ? {} : { csrfToken: browserResponse.csrfToken }),
      operation: input.operation,
    },
    200,
    browserResponse.headers,
  );
}

export function workspaceGatewayEmptySuccessResponse(): Response {
  return new Response(null, { status: 204 });
}

export function workspaceGatewayAllowedPassthroughResponseHeaders(headers: Headers): Headers {
  const next = new Headers();

  for (const key of WORKSPACE_GATEWAY_SAFE_RESPONSE_HEADERS) {
    const value = headers.get(key);

    if (value) {
      next.set(key, value);
    }
  }

  return next;
}

async function workspaceGatewayNonJsonSidecarPassthroughResponse(response: Response) {
  if (response.status === 204) {
    return new Response(null, {
      headers: workspaceGatewayAllowedPassthroughResponseHeaders(response.headers),
      status: response.status,
    });
  }

  return new Response(await response.arrayBuffer(), {
    headers: workspaceGatewayAllowedPassthroughResponseHeaders(response.headers),
    status: response.status,
  });
}

function workspaceGatewayBrowserResponseHeaders(input: {
  authorization: WorkspaceGatewayResponseSafetyAuthorization;
  env: WorkspaceGatewayResponseSafetyEnv;
  request: Request;
}): { csrfToken?: string; headers: Headers } {
  const headers = new Headers();
  const csrfToken = input.env.csrfToken?.trim();
  const includeCsrfToken =
    input.authorization.via === "owner-session" && input.authorization.actor === "browser";

  if (includeCsrfToken && csrfToken) {
    headers.set(
      "Set-Cookie",
      `${WORKSPACE_GATEWAY_CSRF_COOKIE_NAME}=${csrfToken}; Path=/; SameSite=Lax${new URL(input.request.url).protocol === "https:" ? "; Secure" : ""}`,
    );
  }

  return {
    ...(includeCsrfToken && csrfToken ? { csrfToken } : {}),
    headers,
  };
}

function responseObjectHas(value: unknown, key: string): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && key in value;
}
