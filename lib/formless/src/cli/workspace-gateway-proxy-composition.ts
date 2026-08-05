import {
  createWorkspaceGatewayLocalProxyMiddleware,
  workspaceGatewayProxyTargetFromEnv,
  type WorkspaceGatewayLocalProxyDependencies,
  type WorkspaceGatewayLocalProxyEnv,
} from "@dpeek/formless-gateway/sidecar";
import type { WorkspaceOperationRequiredCapability } from "@dpeek/formless-workspace";

import { resolveRuntimeProfileKind } from "../shared/runtime-topology.ts";
import { validateOwnerSessionCookie } from "../worker/owner-session.ts";
import { workspaceGatewayRuntimeCapabilities } from "./workspace-gateway-operation-adapter.ts";

export type WorkspaceGatewayRuntimeEnv = WorkspaceGatewayLocalProxyEnv & {
  FORMLESS_OWNER_SESSION_SECRET?: string;
  FORMLESS_RUNTIME_PROFILE?: string;
};

export type WorkspaceGatewayRuntimeProxyDependencies = {
  fetch: typeof fetch;
  operationCapabilities?: readonly WorkspaceOperationRequiredCapability[];
  proxyFetch?: typeof fetch;
  readOwnerSetupStatus?: (request: Request) => Promise<{ setupComplete: boolean }>;
};

export function createWorkspaceGatewayProxyDependencies(
  env: WorkspaceGatewayRuntimeEnv,
  dependencies: WorkspaceGatewayRuntimeProxyDependencies,
): WorkspaceGatewayLocalProxyDependencies {
  return {
    capabilities: workspaceGatewayRuntimeCapabilities(dependencies),
    proxyFetch: dependencies.proxyFetch ?? dependencies.fetch,
    readOwnerSetupStatus:
      dependencies.readOwnerSetupStatus ??
      ((request) => readLocalRuntimeOwnerSetupStatus(request, dependencies.fetch)),
    routeAvailable: (request) => workspaceGatewayRouteAvailable(request, env),
    validateOwnerSession: (request) => validateOwnerSessionCookie(request, env),
  };
}

export function createWorkspaceGatewayRuntimeMiddleware(
  env: WorkspaceGatewayRuntimeEnv = process.env,
  dependencyOverrides: Partial<WorkspaceGatewayRuntimeProxyDependencies> = {},
) {
  const fetcher = dependencyOverrides.fetch ?? fetch;

  return createWorkspaceGatewayLocalProxyMiddleware(
    env,
    createWorkspaceGatewayProxyDependencies(env, {
      ...dependencyOverrides,
      fetch: fetcher,
      proxyFetch: dependencyOverrides.proxyFetch ?? fetcher,
    }),
  );
}

export function workspaceGatewayRouteAvailable(
  request: Request,
  env: WorkspaceGatewayRuntimeEnv,
): boolean {
  const profileKind = resolveRuntimeProfileKind({
    hostname: new URL(request.url).hostname,
    profile: env.FORMLESS_RUNTIME_PROFILE,
  });

  return (
    profileKind === "instance" && workspaceGatewayProxyTargetFromEnv(request, env) !== undefined
  );
}

async function readLocalRuntimeOwnerSetupStatus(
  request: Request,
  fetcher: typeof fetch,
): Promise<{ setupComplete: boolean }> {
  const response = await fetcher(new URL("/api/formless/setup", request.url), {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    return { setupComplete: false };
  }

  const body = (await response.json()) as Partial<{ setupComplete: boolean }>;

  return { setupComplete: body.setupComplete === true };
}
