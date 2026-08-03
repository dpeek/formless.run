import { type WorkspaceGatewaySidecarOperationHandlers } from "@dpeek/formless-gateway/sidecar";
import type { WorkspaceOperationRequiredCapability } from "@dpeek/formless-workspace";

import type { RunFormlessWorkspaceOperationDependencies } from "./instance-workspace-operations.ts";
import {
  createDefaultWorkspaceAutoSaveScheduler,
  type WorkspaceAutoSaveScheduler,
} from "./workspace-gateway-auto-save.ts";
import { createWorkspaceGatewayOperationHandlers as createWorkspaceGatewayRuntimeOperationHandlers } from "./workspace-gateway-operation-adapter.ts";
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
  type WorkspaceGatewayOperationAutoSaveScheduler,
} from "./workspace-gateway-auto-save.ts";

export type {
  WorkspaceGatewayCredentialSetupAdapterInput,
  WorkspaceGatewayCredentialSetupAdapterResult,
} from "./workspace-gateway-operation-adapter.ts";

export type { WorkspaceGatewayRuntimeEnv } from "./workspace-gateway-proxy-composition.ts";

export type WorkspaceGatewayRuntimeDependencies = RunFormlessWorkspaceOperationDependencies & {
  autoSaveDebounceMs?: number;
  autoSaveMaxRetries?: number;
  autoSaveRetryBackoffMs?: (retryCount: number) => number;
  autoSaveScheduler?: WorkspaceAutoSaveScheduler;
  createOperationId?: () => string;
  credentialSetup?: RunFormlessWorkspaceOperationDependencies["credentialSetup"];
  cwd: string;
  fetch: typeof fetch;
  now: () => string;
  operationCapabilities?: readonly WorkspaceOperationRequiredCapability[];
  proxyFetch?: typeof fetch;
  readOwnerSetupStatus?: (request: Request) => Promise<{ setupComplete: boolean }>;
};

export type StartWorkspaceGatewaySidecarDependencies = WorkspaceGatewayRuntimeDependencies & {
  createProxyToken?: () => string;
};

export function createWorkspaceGatewayOperationHandlers(
  dependencies: WorkspaceGatewayRuntimeDependencies,
): WorkspaceGatewaySidecarOperationHandlers {
  const autoSaveScheduler =
    dependencies.autoSaveScheduler ?? createDefaultWorkspaceAutoSaveScheduler(dependencies);

  return createWorkspaceGatewayRuntimeOperationHandlers({
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
