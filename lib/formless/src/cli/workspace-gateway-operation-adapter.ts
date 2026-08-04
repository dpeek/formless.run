import {
  WORKSPACE_GATEWAY_PUSH_PHASE_IDS,
  type WorkspaceGatewayPushFailureCode,
  type WorkspaceGatewayPushHandler,
  type WorkspaceGatewayPushPhaseId,
  type WorkspaceGatewayPushPhaseObserver,
} from "@dpeek/formless-gateway";
import {
  WorkspaceGatewayPushExecutionError,
  type WorkspaceGatewaySidecarHandlers,
} from "@dpeek/formless-gateway/sidecar";
import {
  WORKSPACE_OPERATION_CAPABILITIES,
  assertWorkspaceOperationExecutionAllowed,
  assertWorkspaceOperationExecutionRequirements,
  type WorkspaceOperationRequiredCapability,
} from "@dpeek/formless-workspace";

import {
  pushFormlessInstanceWorkspace,
  preflightPushFormlessCloudflareOAuthCredential,
  type PushFormlessInstanceWorkspaceDependencies,
  type PushFormlessInstanceWorkspaceDryRunDependencies,
  type PushFormlessInstanceWorkspaceResult,
} from "./instance-workspace-deployment.ts";
import {
  assertFormlessCloudflareCredentialAuthorization,
  setupCloudflareCredentialsWithFormlessOAuth,
  type AlchemyCloudflareCredentialSetupInput,
  type FormlessCloudflareCredentialSetupResult,
} from "./instance-workspace-credential-setup.ts";
import type { WorkspaceGatewayAutoSaveScheduler } from "./workspace-gateway-auto-save.ts";

export type WorkspaceGatewayCredentialSetupAdapterInput = AlchemyCloudflareCredentialSetupInput;
export type WorkspaceGatewayCredentialSetupAdapterResult = FormlessCloudflareCredentialSetupResult;

type WorkspaceGatewayPushApplyDependencyKey = Exclude<
  keyof PushFormlessInstanceWorkspaceDependencies,
  keyof PushFormlessInstanceWorkspaceDryRunDependencies
>;

export type WorkspaceGatewayPushExecutionDependencies =
  PushFormlessInstanceWorkspaceDryRunDependencies &
    Partial<
      Pick<PushFormlessInstanceWorkspaceDependencies, WorkspaceGatewayPushApplyDependencyKey>
    >;

export type WorkspaceGatewayPushAdapterDependencies = WorkspaceGatewayPushExecutionDependencies & {
  autoSaveScheduler: WorkspaceGatewayAutoSaveScheduler;
  operationCapabilities?: readonly WorkspaceOperationRequiredCapability[];
  preflightPushCredential?: typeof preflightPushFormlessCloudflareOAuthCredential;
  push?: typeof pushFormlessInstanceWorkspace;
  pushCredentialSetup?: (
    input: WorkspaceGatewayCredentialSetupAdapterInput,
  ) => Promise<WorkspaceGatewayCredentialSetupAdapterResult>;
};

export function createWorkspaceGatewayHandlers(
  dependencies: WorkspaceGatewayPushAdapterDependencies,
): WorkspaceGatewaySidecarHandlers {
  return {
    enqueueAutoSave: async ({ enqueue, workspaceRoot }) => {
      await dependencies.autoSaveScheduler.enqueue({ ...enqueue, workspaceRoot });
    },
    push: createWorkspaceGatewayPushHandler(dependencies),
  };
}

export function createWorkspaceGatewayPushHandler(
  dependencies: WorkspaceGatewayPushAdapterDependencies,
): WorkspaceGatewayPushHandler {
  return async ({ authorization, observer, push, workspaceRoot }) => {
    const semanticInput = {
      dryRun: push.mode === "dry-run",
      kind: "push" as const,
      ...(push.targetAlias === undefined ? {} : { targetAlias: push.targetAlias }),
    };
    assertWorkspaceOperationExecutionRequirements(semanticInput);
    assertWorkspaceOperationExecutionAllowed({
      actor: authorization.actor,
      capabilities: workspaceGatewayRuntimeCapabilities(dependencies),
      kind: "push",
    });
    await ensurePushCredential({
      dependencies,
      observer,
      targetAlias: push.targetAlias,
      workspaceRoot,
    });

    observer.start("desired-state-plan");
    let result: PushFormlessInstanceWorkspaceResult;
    try {
      result = await (dependencies.push ?? pushFormlessInstanceWorkspace)(
        {
          apply: push.mode === "apply",
          targetAlias: push.targetAlias,
          workspacePath: workspaceRoot,
        },
        pushDependencies(dependencies, push.mode),
      );
    } catch (error) {
      const failure = classifyPushFailure(error);
      advanceToFailurePhase(observer, failure.phase);
      throw new WorkspaceGatewayPushExecutionError(failure.code, failure.phase, { cause: error });
    }

    observer.succeed("desired-state-plan");
    completePushExecutionPhases(observer, result);
    return {
      outcome:
        result.noop && result.runtimeRebuild === undefined
          ? "up-to-date"
          : push.mode === "dry-run"
            ? "planned"
            : "applied",
    };
  };
}

export function workspaceGatewayRuntimeCapabilities(
  dependencies: Pick<WorkspaceGatewayPushAdapterDependencies, "operationCapabilities">,
): readonly WorkspaceOperationRequiredCapability[] {
  return dependencies.operationCapabilities ?? WORKSPACE_OPERATION_CAPABILITIES;
}

async function ensurePushCredential(input: {
  dependencies: WorkspaceGatewayPushAdapterDependencies;
  observer: WorkspaceGatewayPushPhaseObserver;
  targetAlias?: string;
  workspaceRoot: string;
}): Promise<void> {
  input.observer.start("credentials");
  let preflight: Awaited<ReturnType<typeof preflightPushFormlessCloudflareOAuthCredential>>;
  try {
    preflight = await (
      input.dependencies.preflightPushCredential ?? preflightPushFormlessCloudflareOAuthCredential
    )(
      { targetAlias: input.targetAlias, workspacePath: input.workspaceRoot },
      { cwd: input.workspaceRoot },
    );
  } catch (error) {
    throw new WorkspaceGatewayPushExecutionError("source-invalid", "credentials", {
      cause: error,
    });
  }

  if (!preflight.needsSetup) {
    input.observer.succeed("credentials");
    input.observer.skip("account-selection");
    return;
  }

  const setup =
    input.dependencies.pushCredentialSetup ??
    ((setupInput) =>
      setupCloudflareCredentialsWithFormlessOAuth(setupInput, { now: input.dependencies.now }));
  let result: WorkspaceGatewayCredentialSetupAdapterResult;
  try {
    result = await setup({
      deploymentConfigId: preflight.deploymentConfigId,
      profileLabel: preflight.credentialId,
      provider: "cloudflare",
      targetAlias: input.targetAlias,
      workspaceRoot: input.workspaceRoot,
    });
    if (result.kind === "authorization-waiting") {
      assertFormlessCloudflareCredentialAuthorization(result);
      input.observer.setExternalAuthorization(result.authorizationUrl);
      result = await result.continue();
    }
  } catch (error) {
    const code = credentialFailureCode(error);
    throw new WorkspaceGatewayPushExecutionError(code, "credentials", { cause: error });
  }

  if (result.kind !== "account-selection-required") {
    input.observer.succeed("credentials");
    input.observer.skip("account-selection");
    return;
  }

  input.observer.succeed("credentials");
  input.observer.start("account-selection");
  const accountId = await input.observer.requestAccountSelection(
    result.accounts.map((account) => ({
      id: account.id,
      ...(account.name === undefined ? {} : { name: account.name }),
    })),
  );
  try {
    const selected = await setup({
      accountId,
      deploymentConfigId: preflight.deploymentConfigId,
      profileLabel: preflight.credentialId,
      provider: "cloudflare",
      targetAlias: input.targetAlias,
      workspaceRoot: input.workspaceRoot,
    });
    if (selected.kind !== "ready") {
      throw new Error("Cloudflare account selection did not complete credential setup.");
    }
    input.observer.succeed("account-selection");
  } catch (error) {
    throw new WorkspaceGatewayPushExecutionError("account-discovery-failed", "account-selection", {
      cause: error,
    });
  }
}

function pushDependencies(
  dependencies: WorkspaceGatewayPushAdapterDependencies,
  mode: "apply" | "dry-run",
): PushFormlessInstanceWorkspaceDependencies | PushFormlessInstanceWorkspaceDryRunDependencies {
  const accountDiscovery = requiredDependency(dependencies.accountDiscovery, "accountDiscovery");
  const packageVersion = requiredDependency(dependencies.packageVersion, "packageVersion");
  const base = {
    accountDiscovery,
    cwd: dependencies.cwd,
    ...(dependencies.env === undefined ? {} : { env: dependencies.env }),
    fetch: dependencies.fetch,
    now: dependencies.now,
    packageVersion,
  };
  if (mode === "dry-run") return base;
  return {
    ...base,
    deploymentAdapter: requiredDependency(dependencies.deploymentAdapter, "deploymentAdapter"),
    healthCheck: requiredDependency(dependencies.healthCheck, "healthCheck"),
    localSecretEnv: requiredDependency(dependencies.localSecretEnv, "localSecretEnv"),
    packageRoot: requiredDependency(dependencies.packageRoot, "packageRoot"),
    randomToken: requiredDependency(dependencies.randomToken, "randomToken"),
    setupCapability: requiredDependency(dependencies.setupCapability, "setupCapability"),
  };
}

function completePushExecutionPhases(
  observer: WorkspaceGatewayPushPhaseObserver,
  result: PushFormlessInstanceWorkspaceResult,
): void {
  completeOptionalPhase(observer, "provider-reconciliation", result.deployment !== undefined);
  completeOptionalPhase(observer, "health-check", result.healthCheck !== undefined);
  completeOptionalPhase(observer, "owner-setup", result.ownerSetup !== undefined);
  observer.start("workspace-push-writeback");
  observer.succeed("workspace-push-writeback");
  completeOptionalPhase(
    observer,
    "observation-refresh",
    result.deploymentObservation !== undefined,
  );
}

function completeOptionalPhase(
  observer: WorkspaceGatewayPushPhaseObserver,
  phase: WorkspaceGatewayPushPhaseId,
  ran: boolean,
): void {
  if (!ran) return observer.skip(phase);
  observer.start(phase);
  observer.succeed(phase);
}

function advanceToFailurePhase(
  observer: WorkspaceGatewayPushPhaseObserver,
  failurePhase: WorkspaceGatewayPushPhaseId,
): void {
  if (failurePhase === "desired-state-plan") return;
  observer.succeed("desired-state-plan");
  const firstExecutionPhase = WORKSPACE_GATEWAY_PUSH_PHASE_IDS.indexOf("provider-reconciliation");
  const failureIndex = WORKSPACE_GATEWAY_PUSH_PHASE_IDS.indexOf(failurePhase);
  for (let index = firstExecutionPhase; index < failureIndex; index += 1) {
    observer.skip(WORKSPACE_GATEWAY_PUSH_PHASE_IDS[index]!);
  }
  observer.start(failurePhase);
}

function classifyPushFailure(error: unknown): {
  code: WorkspaceGatewayPushFailureCode;
  phase: WorkspaceGatewayPushPhaseId;
} {
  if (error instanceof WorkspaceGatewayPushExecutionError) {
    return { code: error.code, phase: error.phase };
  }
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (message.includes("schema") || message.includes("migration")) {
    return { code: "schema-incompatible", phase: "workspace-push-writeback" };
  }
  if (message.includes("backup")) {
    return { code: "backup-failed", phase: "workspace-push-writeback" };
  }
  if (message.includes("health")) {
    return { code: "health-check-failed", phase: "health-check" };
  }
  if (message.includes("owner setup")) {
    return { code: "owner-setup-failed", phase: "owner-setup" };
  }
  if (message.includes("observation")) {
    return { code: "observation-write-failed", phase: "observation-refresh" };
  }
  if (message.includes("cursor") || message.includes("conflict")) {
    return { code: "target-conflict", phase: "workspace-push-writeback" };
  }
  if (message.includes("restore") && message.includes("validation")) {
    return { code: "restore-validation-failed", phase: "workspace-push-writeback" };
  }
  if (message.includes("restore")) {
    return { code: "restore-apply-failed", phase: "workspace-push-writeback" };
  }
  if (
    message.includes("deploy") ||
    message.includes("provider") ||
    message.includes("alchemy") ||
    message.includes("cloudflare")
  ) {
    return { code: "provider-reconciliation-failed", phase: "provider-reconciliation" };
  }
  if (message.includes("target") || message.includes("404") || message.includes("unavailable")) {
    return { code: "target-unavailable", phase: "desired-state-plan" };
  }
  if (message.includes("source") || message.includes("archive") || message.includes("config")) {
    return { code: "source-invalid", phase: "desired-state-plan" };
  }
  return { code: "internal-failure", phase: "desired-state-plan" };
}

function credentialFailureCode(error: unknown): WorkspaceGatewayPushFailureCode {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (message.includes("timed out") || message.includes("expired")) return "authorization-expired";
  if (message.includes("account")) return "account-discovery-failed";
  return "credential-unavailable";
}

function requiredDependency<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`Workspace Gateway Push requires ${name}.`);
  return value;
}
