import {
  formlessCliWorkspaceOperationBindingForKind,
  type FormlessCliCommand,
} from "./cli-command.ts";
import {
  formatCliWorkspacePullOutput,
  formatCliWorkspacePushOutput,
} from "./cli-direct-workspace-command-formatter.ts";
import {
  pushFormlessInstanceWorkspace,
  type PushFormlessInstanceWorkspaceDependencies,
  type PushFormlessInstanceWorkspaceDryRunDependencies,
  type PushFormlessInstanceWorkspaceExecutionDependencies,
  type PushFormlessInstanceWorkspaceInput,
  type PushFormlessInstanceWorkspaceResult,
} from "./instance-workspace-deployment.ts";
import {
  pullFormlessInstanceWorkspace,
  type PullFormlessInstanceWorkspaceDependencies,
  type PullFormlessInstanceWorkspaceInput,
  type PullFormlessInstanceWorkspaceResult,
} from "./instance-workspace-source-sync.ts";

export type FormlessCliParsedWorkspacePullCommand = Extract<
  FormlessCliCommand,
  { kind: "workspacePull" }
>;

export type FormlessCliParsedWorkspacePushCommand = Extract<
  FormlessCliCommand,
  { kind: "workspacePush" }
>;

export type FormlessCliParsedWorkspaceSourceSyncCommand =
  | FormlessCliParsedWorkspacePullCommand
  | FormlessCliParsedWorkspacePushCommand;

export type FormlessCliWorkspaceSourceSyncAdapterResult =
  | {
      commandName: "formless pull";
      input: PullFormlessInstanceWorkspaceInput;
      operationKind: "pull";
    }
  | {
      commandName: "formless push";
      input: PushFormlessInstanceWorkspaceInput;
      operationKind: "push";
    };

type FormlessCliWorkspacePullRunner = (
  input: PullFormlessInstanceWorkspaceInput,
  dependencies: PullFormlessInstanceWorkspaceDependencies,
) => Promise<PullFormlessInstanceWorkspaceResult>;

type FormlessCliWorkspacePushRunner = (
  input: PushFormlessInstanceWorkspaceInput,
  dependencies: PushFormlessInstanceWorkspaceExecutionDependencies,
) => Promise<PushFormlessInstanceWorkspaceResult>;

export type FormlessCliWorkspacePullExecutionDependencies =
  PullFormlessInstanceWorkspaceDependencies & {
    pullWorkspace?: FormlessCliWorkspacePullRunner;
  };

type FormlessCliWorkspacePushApplyDependencyKey = Exclude<
  keyof PushFormlessInstanceWorkspaceDependencies,
  keyof PushFormlessInstanceWorkspaceDryRunDependencies
>;

export type FormlessCliWorkspacePushExecutionDependencies =
  PushFormlessInstanceWorkspaceDryRunDependencies &
    Partial<
      Pick<PushFormlessInstanceWorkspaceDependencies, FormlessCliWorkspacePushApplyDependencyKey>
    > & {
      pushWorkspace?: FormlessCliWorkspacePushRunner;
    };

export function formlessCliWorkspaceSourceSyncInputForParsedCommand(
  command: FormlessCliParsedWorkspaceSourceSyncCommand,
): FormlessCliWorkspaceSourceSyncAdapterResult {
  switch (command.kind) {
    case "workspacePull": {
      const binding = formlessCliWorkspaceOperationBindingForKind("pull");

      return {
        commandName: binding.command,
        input: binding.translateInput(command),
        operationKind: binding.operationKind,
      };
    }
    case "workspacePush": {
      const binding = formlessCliWorkspaceOperationBindingForKind("push");

      return {
        commandName: binding.command,
        input: binding.translateInput(command),
        operationKind: binding.operationKind,
      };
    }
  }
}

export async function runFormlessCliWorkspacePullCommand(
  command: FormlessCliParsedWorkspacePullCommand,
  dependencies: FormlessCliWorkspacePullExecutionDependencies,
): Promise<string> {
  const binding = formlessCliWorkspaceOperationBindingForKind("pull");
  const { pullWorkspace = pullFormlessInstanceWorkspace } = dependencies;
  const result = await pullWorkspace(binding.translateInput(command), {
    cwd: dependencies.cwd,
    ...(dependencies.env === undefined ? {} : { env: dependencies.env }),
    fetch: dependencies.fetch,
    now: dependencies.now,
  });

  return formatCliWorkspacePullOutput(result, dependencies.cwd);
}

export async function runFormlessCliWorkspacePushCommand(
  command: FormlessCliParsedWorkspacePushCommand,
  dependencies: FormlessCliWorkspacePushExecutionDependencies,
): Promise<string> {
  const binding = formlessCliWorkspaceOperationBindingForKind("push");
  const { pushWorkspace = pushFormlessInstanceWorkspace } = dependencies;
  const result = await pushWorkspace(
    binding.translateInput(command),
    command.dryRun
      ? pushDryRunDependencies(dependencies)
      : requirePushApplyDependencies(dependencies),
  );

  return formatCliWorkspacePushOutput(result);
}

function pushDryRunDependencies(
  dependencies: FormlessCliWorkspacePushExecutionDependencies,
): PushFormlessInstanceWorkspaceDryRunDependencies {
  return {
    accountDiscovery: dependencies.accountDiscovery,
    cwd: dependencies.cwd,
    ...(dependencies.env === undefined ? {} : { env: dependencies.env }),
    fetch: dependencies.fetch,
    now: dependencies.now,
    packageVersion: dependencies.packageVersion,
  };
}

function requirePushApplyDependencies(
  dependencies: FormlessCliWorkspacePushExecutionDependencies,
): PushFormlessInstanceWorkspaceDependencies {
  const {
    deploymentAdapter,
    healthCheck,
    localSecretEnv,
    packageRoot,
    randomToken,
    setupCapability,
  } = dependencies;
  const missing: string[] = [];

  if (deploymentAdapter === undefined) missing.push("deploymentAdapter");
  if (healthCheck === undefined) missing.push("healthCheck");
  if (localSecretEnv === undefined) missing.push("localSecretEnv");
  if (packageRoot === undefined) missing.push("packageRoot");
  if (randomToken === undefined) missing.push("randomToken");
  if (setupCapability === undefined) missing.push("setupCapability");

  if (missing.length > 0) {
    throw new Error(`Formless CLI push requires dependencies: ${missing.join(", ")}.`);
  }

  if (
    deploymentAdapter === undefined ||
    healthCheck === undefined ||
    localSecretEnv === undefined ||
    packageRoot === undefined ||
    randomToken === undefined ||
    setupCapability === undefined
  ) {
    throw new Error("Formless CLI push dependencies are incomplete.");
  }

  return {
    accountDiscovery: dependencies.accountDiscovery,
    cwd: dependencies.cwd,
    deploymentAdapter,
    ...(dependencies.env === undefined ? {} : { env: dependencies.env }),
    fetch: dependencies.fetch,
    healthCheck,
    localSecretEnv,
    now: dependencies.now,
    packageRoot,
    packageVersion: dependencies.packageVersion,
    randomToken,
    setupCapability,
  };
}
