import {
  workspaceOperationDefinitionForKind,
  type CheckWorkspaceOperationInput,
  type CredentialSetupWorkspaceOperationInput,
  type DeploymentRefreshWorkspaceOperationInput,
  type InitWorkspaceOperationInput,
  type PullWorkspaceOperationInput,
  type PushWorkspaceOperationInput,
  type SaveWorkspaceOperationInput,
  type StatusWorkspaceOperationInput,
  type WorkspaceOperationEvent,
  type WorkspaceOperationHandlerKey,
  type WorkspaceOperationInput,
  type WorkspaceOperationResult,
  type WorkspaceOperationStatus,
} from "@dpeek/formless-workspace";

import {
  getFormlessInstanceWorkspaceStatus,
  initLocalFormlessWorkspaceOnboarding,
  type FormlessInstanceWorkspaceStatusResult,
  type InitFormlessInstanceWorkspaceResult,
} from "./instance-workspace-lifecycle.ts";
import {
  saveLocalFormlessWorkspace,
  type SaveLocalFormlessWorkspaceResult,
} from "./instance-workspace-source-sync.ts";
import { runDeploymentRefreshWorkspaceOperation } from "./instance-workspace-deployment-operation.ts";
import {
  setupCloudflareCredentialsWithFormlessOAuth,
  type FormlessCloudflareCredentialSetupResult,
} from "./instance-workspace-credential-setup.ts";
import type { RunFormlessWorkspaceOperationDependencies } from "./instance-workspace-operations.ts";
import {
  runCheckWorkspaceSourceOperation,
  runPullWorkspaceSourceOperation,
  runPushWorkspaceSourceOperation,
} from "./instance-workspace-source-sync-operation.ts";
import { workspaceRuntimeExtensionKeys } from "../shared/workspace-runtime-extensions.ts";

export type WorkspaceOperationDomainExecutionResult = {
  continue?: () => Promise<WorkspaceOperationDomainHandlerResult>;
  events?: readonly Omit<WorkspaceOperationEvent, "id">[];
  logMessage?: string;
  result: WorkspaceOperationResult;
  status?: WorkspaceOperationStatus;
};

export type WorkspaceOperationDomainHandlerResult =
  | WorkspaceOperationDomainExecutionResult
  | WorkspaceOperationResult;

type WorkspaceOperationDomainHandlerContext = {
  workspaceRoot: string;
};

type WorkspaceOperationDomainHandler = (
  input: WorkspaceOperationInput,
  dependencies: RunFormlessWorkspaceOperationDependencies,
  context: WorkspaceOperationDomainHandlerContext,
) => Promise<WorkspaceOperationDomainHandlerResult>;

const workspaceOperationDomainHandlers = {
  "workspace.credentials.setup":
    workspaceOperationDomainHandler<CredentialSetupWorkspaceOperationInput>(
      "credentialSetup",
      async (input, dependencies, context) =>
        credentialSetupOperationHandlerResult(
          await runCredentialSetupWorkspaceOperation(input, dependencies, context),
        ),
    ),
  "deployment.refresh": workspaceOperationDomainHandler<DeploymentRefreshWorkspaceOperationInput>(
    "deploymentRefresh",
    runDeploymentRefreshWorkspaceOperation,
  ),
  "workspace.init": workspaceOperationDomainHandler<InitWorkspaceOperationInput>(
    "init",
    async (input, dependencies) =>
      summarizeInitResult(
        await initLocalFormlessWorkspaceOnboarding(
          {
            name: input.name,
            workspacePath: input.workspacePath ?? undefined,
          },
          dependencies,
        ),
      ),
  ),
  "workspace.source.check": workspaceOperationDomainHandler<CheckWorkspaceOperationInput>(
    "check",
    runCheckWorkspaceSourceOperation,
  ),
  "workspace.source.pull": workspaceOperationDomainHandler<PullWorkspaceOperationInput>(
    "pull",
    runPullWorkspaceSourceOperation,
  ),
  "workspace.source.push": workspaceOperationDomainHandler<PushWorkspaceOperationInput>(
    "push",
    runPushWorkspaceSourceOperation,
  ),
  "workspace.source.save": workspaceOperationDomainHandler<SaveWorkspaceOperationInput>(
    "save",
    async (input, dependencies) =>
      summarizeSaveResult(
        await saveLocalFormlessWorkspace(
          {
            check: input.check,
            source: input.source,
            workspacePath: input.workspacePath ?? undefined,
          },
          dependencies,
        ),
      ),
  ),
  "workspace.status": workspaceOperationDomainHandler<StatusWorkspaceOperationInput>(
    "status",
    async (input, dependencies) =>
      summarizeStatusResult(await readWorkspaceStatus(input, dependencies)),
  ),
} satisfies Record<WorkspaceOperationHandlerKey, WorkspaceOperationDomainHandler>;

export async function runWorkspaceOperationDomainHandler(
  input: WorkspaceOperationInput,
  dependencies: RunFormlessWorkspaceOperationDependencies,
  context: WorkspaceOperationDomainHandlerContext,
): Promise<WorkspaceOperationDomainHandlerResult> {
  const handlerKey = workspaceOperationDefinitionForKind(input.kind).handlerKey;

  if (!isWorkspaceOperationHandlerKey(handlerKey)) {
    throw new Error("Workspace operation handler is not registered.");
  }

  return workspaceOperationDomainHandlers[handlerKey](input, dependencies, context);
}

function workspaceOperationDomainHandler<TInput extends WorkspaceOperationInput>(
  kind: TInput["kind"],
  handler: (
    input: TInput,
    dependencies: RunFormlessWorkspaceOperationDependencies,
    context: WorkspaceOperationDomainHandlerContext,
  ) => Promise<WorkspaceOperationDomainHandlerResult>,
): WorkspaceOperationDomainHandler {
  return (input, dependencies, context) => {
    if (input.kind !== kind) {
      throw new Error(`Workspace operation handler for "${kind}" received "${input.kind}".`);
    }

    return handler(input as TInput, dependencies, context);
  };
}

function isWorkspaceOperationHandlerKey(
  value: WorkspaceOperationHandlerKey,
): value is WorkspaceOperationHandlerKey {
  return Object.prototype.hasOwnProperty.call(workspaceOperationDomainHandlers, value);
}

async function runCredentialSetupWorkspaceOperation(
  input: CredentialSetupWorkspaceOperationInput,
  dependencies: RunFormlessWorkspaceOperationDependencies,
  context: WorkspaceOperationDomainHandlerContext,
): Promise<FormlessCloudflareCredentialSetupResult> {
  const adapter =
    dependencies.credentialSetup ??
    ((setupInput) =>
      setupCloudflareCredentialsWithFormlessOAuth(
        {
          accountId: setupInput.accountId,
          env: dependencies.env,
          profileLabel: setupInput.profileLabel,
          provider: setupInput.provider,
          workspaceRoot: setupInput.workspaceRoot,
        },
        { now: dependencies.now },
      ));

  return adapter({
    accountId: input.accountId ?? undefined,
    profileLabel: input.profileLabel ?? undefined,
    provider: input.provider,
    workspaceRoot: context.workspaceRoot,
  });
}

function credentialSetupOperationHandlerResult(
  setup: FormlessCloudflareCredentialSetupResult,
): WorkspaceOperationDomainExecutionResult {
  switch (setup.kind) {
    case "authorization-waiting":
      return {
        continue: async () => credentialSetupOperationHandlerResult(await setup.continue()),
        events: [
          {
            at: setup.at,
            profileLabel: setup.profileLabel,
            provider: setup.provider,
            status: "waiting",
            type: "externalAuthorizationUrl",
            url: setup.authorizationUrl,
          },
        ],
        logMessage: "credentialSetup awaiting authorization.",
        result: {
          details: {
            clientId: setup.clientId,
            credentialRef: setup.credentialRef,
            requestedScopes: [...setup.requestedScopes],
            scopeSet: setup.scopeSet,
          },
          summary: {
            fields: {
              credentialRef: setup.credentialRef,
              provider: setup.provider,
              status: "waiting-for-authorization",
            },
            title: "Cloudflare authorization required",
          },
        },
        status: "running",
      };
    case "account-selection-required":
      return {
        logMessage: "credentialSetup completed.",
        result: {
          details: {
            accounts: setup.accounts.map((account) => ({ ...account })),
            credentialRef: setup.credentialRef,
          },
          summary: {
            fields: {
              accountCount: setup.accounts.length,
              credentialRef: setup.credentialRef,
              provider: setup.provider,
              status: "account-selection-required",
            },
            title: "Cloudflare account selection required",
          },
        },
        status: "succeeded",
      };
    case "ready":
      return {
        logMessage: "credentialSetup completed.",
        result: {
          details: {
            account: { ...setup.account },
            accountCount: setup.accountCount,
            credentialRef: setup.credentialRef,
            deploymentConfig: setup.deploymentConfig,
            source: setup.source,
          },
          summary: {
            fields: {
              accountCount: setup.accountCount,
              credentialRef: setup.credentialRef,
              provider: setup.provider,
              selectedAccountId: setup.account.id,
              status: "validated",
              targetUrl: setup.deploymentConfig.targetUrl,
              workerName: setup.deploymentConfig.workerName,
            },
            title: "Cloudflare credentials ready",
          },
        },
        status: "succeeded",
      };
  }
}

async function readWorkspaceStatus(
  input: StatusWorkspaceOperationInput,
  dependencies: RunFormlessWorkspaceOperationDependencies,
): Promise<FormlessInstanceWorkspaceStatusResult | { initialized: false }> {
  try {
    return await getFormlessInstanceWorkspaceStatus(
      {
        includeDeploymentStatus: input.includeDeploymentStatus,
        targetAlias: input.targetAlias,
        workspacePath: input.workspacePath ?? undefined,
      },
      dependencies,
    );
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { initialized: false };
    }

    throw error;
  }
}

function summarizeInitResult(
  result: InitFormlessInstanceWorkspaceResult,
): WorkspaceOperationResult {
  return {
    details: {
      state: {
        instance: `${result.config.state.root}/instance.json`,
        media: result.config.media.root,
      },
      config: "formless.ts",
    },
    summary: {
      fields: {
        initialized: true,
        workspace: result.config.name,
      },
      title: "Workspace initialized",
    },
  };
}

function summarizeStatusResult(
  result: FormlessInstanceWorkspaceStatusResult | { initialized: false },
): WorkspaceOperationResult {
  if ("initialized" in result) {
    return {
      summary: {
        fields: { initialized: false },
        title: "Workspace not initialized",
      },
    };
  }

  const runtimeExtensions = workspaceRuntimeExtensionKeys(result.config);

  return {
    details: {
      runtimeExtensions,
      selectedTarget: result.selectedTarget?.alias ?? null,
      targetUrl: result.selectedTarget?.url ?? null,
    },
    summary: {
      fields: {
        automationToken: result.secretState,
        initialized: true,
        remoteStatus: result.remoteStatus ? "available" : "skipped",
      },
      title: "Workspace status",
    },
  };
}

function summarizeSaveResult(result: SaveLocalFormlessWorkspaceResult): WorkspaceOperationResult {
  return {
    details: {
      source: result.source,
      statePath: result.instanceState.statePath,
    },
    summary: {
      fields: {
        mediaCount: result.instanceState.mediaCount,
        mode: result.mode,
        recordCount: result.instanceState.recordCount,
      },
      title: result.mode === "check" ? "Workspace source current" : "Workspace saved",
    },
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
