import { type WorkspaceGatewaySidecarHandlers } from "@dpeek/formless-gateway/sidecar";
import type { WorkspaceOperationRequiredCapability } from "@dpeek/formless-workspace";

import {
  createDefaultWorkspaceAutoSaveScheduler,
  type WorkspaceAutoSaveScheduler,
} from "./workspace-gateway-auto-save.ts";
import {
  createWorkspaceGatewayHandlers as createWorkspaceGatewayRuntimeHandlers,
  type WorkspaceGatewayPushExecutionDependencies,
} from "./workspace-gateway-operation-adapter.ts";
import {
  createWorkspaceGatewayProxyDependencies as createWorkspaceGatewayRuntimeProxyDependencies,
  createWorkspaceGatewayRuntimeMiddleware as createWorkspaceGatewayRuntimeProxyMiddleware,
  type WorkspaceGatewayRuntimeEnv,
  type WorkspaceGatewayRuntimeProxyDependencies,
} from "./workspace-gateway-proxy-composition.ts";

export {
  createWorkspaceAutoSaveScheduler,
  type WorkspaceAutoSaveScheduler,
  type WorkspaceAutoSaveSchedulerDependencies,
  type WorkspaceAutoSaveSchedulerSaveInput,
  type WorkspaceGatewayAutoSaveScheduler,
} from "./workspace-gateway-auto-save.ts";

export type {
  WorkspaceGatewayCredentialSetupAdapterInput,
  WorkspaceGatewayCredentialSetupAdapterResult,
} from "./workspace-gateway-operation-adapter.ts";

export type { WorkspaceGatewayRuntimeEnv } from "./workspace-gateway-proxy-composition.ts";

export type WorkspaceGatewayRuntimeDependencies = WorkspaceGatewayPushExecutionDependencies & {
  autoSaveDebounceMs?: number;
  autoSaveMaxRetries?: number;
  autoSaveRetryBackoffMs?: (retryCount: number) => number;
  autoSaveScheduler?: WorkspaceAutoSaveScheduler;
  operationCapabilities?: readonly WorkspaceOperationRequiredCapability[];
  preflightPushCredential?: import("./workspace-gateway-operation-adapter.ts").WorkspaceGatewayPushAdapterDependencies["preflightPushCredential"];
  proxyFetch?: typeof fetch;
  push?: import("./workspace-gateway-operation-adapter.ts").WorkspaceGatewayPushAdapterDependencies["push"];
  pushCredentialSetup?: import("./workspace-gateway-operation-adapter.ts").WorkspaceGatewayPushAdapterDependencies["pushCredentialSetup"];
  readOwnerSetupStatus?: (request: Request) => Promise<{ setupComplete: boolean }>;
};

export type StartWorkspaceGatewaySidecarDependencies = WorkspaceGatewayRuntimeDependencies & {
  createProxyToken?: () => string;
};

export function createWorkspaceGatewayHandlers(
  dependencies: WorkspaceGatewayRuntimeDependencies,
): WorkspaceGatewaySidecarHandlers {
  const autoSaveScheduler =
    dependencies.autoSaveScheduler ?? createDefaultWorkspaceAutoSaveScheduler(dependencies);

  return createWorkspaceGatewayRuntimeHandlers({
    ...dependencies,
    autoSaveScheduler,
  });
}

export function createWorkspaceGatewayProxyDependencies(
  env: WorkspaceGatewayRuntimeEnv,
  dependencies: WorkspaceGatewayRuntimeDependencies,
): ReturnType<typeof createWorkspaceGatewayRuntimeProxyDependencies> {
  return createWorkspaceGatewayRuntimeProxyDependencies(env, dependencies);
}

export function createWorkspaceGatewayRuntimeMiddleware(
  env: NodeJS.ProcessEnv = process.env,
  dependencyOverrides: Partial<WorkspaceGatewayRuntimeDependencies> = {},
) {
  return createWorkspaceGatewayRuntimeProxyMiddleware(
    env,
    dependencyOverrides as Partial<WorkspaceGatewayRuntimeProxyDependencies>,
  );
}
