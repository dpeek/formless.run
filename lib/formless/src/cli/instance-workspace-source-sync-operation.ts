import {
  workspaceOperationEffectiveExecutionRequirements,
  type CheckWorkspaceOperationInput,
  type PullWorkspaceOperationInput,
  type PushWorkspaceOperationInput,
  type WorkspaceOperationDisplayObject,
  type WorkspaceOperationResult,
} from "@dpeek/formless-workspace";

import type { RestoreInstanceArchiveResult } from "./archive-workflows.ts";
import {
  pushFormlessInstanceWorkspace,
  type LocalWorkspaceDeploymentDisplayFacts,
  type PushFormlessInstanceWorkspaceDependencies,
  type PushFormlessInstanceWorkspaceDryRunDependencies,
  type PushFormlessInstanceWorkspaceResult,
} from "./instance-workspace-deployment.ts";
import {
  checkLocalFormlessWorkspace,
  pullFormlessInstanceWorkspace,
  type CheckLocalFormlessWorkspaceResult,
  type FormlessInstanceWorkspaceSyncPlan,
  type PullFormlessInstanceWorkspaceResult,
} from "./instance-workspace-source-sync.ts";
import type { RunFormlessWorkspaceOperationDependencies } from "./instance-workspace-operations.ts";

export async function runCheckWorkspaceSourceOperation(
  input: CheckWorkspaceOperationInput,
  dependencies: RunFormlessWorkspaceOperationDependencies,
): Promise<WorkspaceOperationResult> {
  return summarizeCheckResult(
    await checkLocalFormlessWorkspace(
      {
        targetAlias: input.targetAlias,
        workspacePath: input.workspacePath ?? undefined,
      },
      dependencies,
    ),
  );
}

export async function runPullWorkspaceSourceOperation(
  input: PullWorkspaceOperationInput,
  dependencies: RunFormlessWorkspaceOperationDependencies,
): Promise<WorkspaceOperationResult> {
  return summarizePullResult(
    await pullFormlessInstanceWorkspace(
      {
        dryRun: input.dryRun,
        targetAlias: input.targetAlias,
        workspacePath: input.workspacePath ?? undefined,
      },
      dependencies,
    ),
  );
}

export async function runPushWorkspaceSourceOperation(
  input: PushWorkspaceOperationInput,
  dependencies: RunFormlessWorkspaceOperationDependencies,
): Promise<WorkspaceOperationResult> {
  return summarizePushResult(
    await pushFormlessInstanceWorkspace(
      {
        apply: !input.dryRun,
        force: input.force,
        targetAlias: input.targetAlias,
        workspacePath: input.workspacePath ?? undefined,
      },
      requirePushWorkspaceOperationDependencies(input, dependencies),
    ),
  );
}

function requirePushWorkspaceOperationDependencies(
  input: PushWorkspaceOperationInput,
  dependencies: RunFormlessWorkspaceOperationDependencies,
): PushFormlessInstanceWorkspaceDryRunDependencies {
  const requirements = workspaceOperationEffectiveExecutionRequirements(input);

  if (
    requirements.includes("provider-credentials") ||
    requirements.includes("workspace-source-write")
  ) {
    return requirePushApplyWorkspaceOperationDependencies(dependencies);
  }

  return requirePushDryRunWorkspaceOperationDependencies(dependencies);
}

function requirePushDryRunWorkspaceOperationDependencies(
  dependencies: RunFormlessWorkspaceOperationDependencies,
): PushFormlessInstanceWorkspaceDryRunDependencies {
  const { accountDiscovery, packageVersion } = dependencies;
  const missing: string[] = [];

  if (accountDiscovery === undefined) missing.push("accountDiscovery");
  if (packageVersion === undefined) missing.push("packageVersion");

  if (missing.length > 0) {
    throw new Error(
      `Workspace push dry-run requires operation dependencies: ${missing.join(", ")}.`,
    );
  }

  if (accountDiscovery === undefined || packageVersion === undefined) {
    throw new Error("Workspace push dry-run dependencies are incomplete.");
  }

  return {
    accountDiscovery,
    cwd: dependencies.cwd,
    ...(dependencies.env === undefined ? {} : { env: dependencies.env }),
    fetch: dependencies.fetch,
    now: dependencies.now,
    packageVersion,
  };
}

function requirePushApplyWorkspaceOperationDependencies(
  dependencies: RunFormlessWorkspaceOperationDependencies,
): PushFormlessInstanceWorkspaceDependencies {
  const {
    accountDiscovery,
    deploymentAdapter,
    healthCheck,
    localSecretEnv,
    packageRoot,
    packageVersion,
    randomToken,
    setupCapability,
  } = dependencies;
  const missing: string[] = [];

  if (accountDiscovery === undefined) missing.push("accountDiscovery");
  if (deploymentAdapter === undefined) missing.push("deploymentAdapter");
  if (healthCheck === undefined) missing.push("healthCheck");
  if (localSecretEnv === undefined) missing.push("localSecretEnv");
  if (packageRoot === undefined) missing.push("packageRoot");
  if (packageVersion === undefined) missing.push("packageVersion");
  if (randomToken === undefined) missing.push("randomToken");
  if (setupCapability === undefined) missing.push("setupCapability");

  if (missing.length > 0) {
    throw new Error(`Workspace push requires operation dependencies: ${missing.join(", ")}.`);
  }

  if (
    accountDiscovery === undefined ||
    deploymentAdapter === undefined ||
    healthCheck === undefined ||
    localSecretEnv === undefined ||
    packageRoot === undefined ||
    packageVersion === undefined ||
    randomToken === undefined ||
    setupCapability === undefined
  ) {
    throw new Error("Workspace push dependencies are incomplete.");
  }

  return {
    accountDiscovery,
    cwd: dependencies.cwd,
    deploymentAdapter,
    ...(dependencies.env === undefined ? {} : { env: dependencies.env }),
    fetch: dependencies.fetch,
    healthCheck,
    localSecretEnv,
    now: dependencies.now,
    packageRoot,
    packageVersion,
    randomToken,
    setupCapability,
  };
}

function summarizeCheckResult(result: CheckLocalFormlessWorkspaceResult): WorkspaceOperationResult {
  if (result.mode === "local") {
    return {
      details: {
        target: null,
      },
      summary: {
        fields: {
          initialized: true,
          mode: "local",
          remoteSync: "skipped",
        },
        title: "Workspace check",
      },
    };
  }

  return {
    details: {
      deploymentStatus: result.remote.deploymentStatus ?? null,
      syncPlan: summarizeSyncPlan(result.remote.syncPlan),
      target: result.remote.selectedTarget.alias,
    },
    summary: {
      fields: {
        deployment:
          result.remote.deploymentStatus === undefined
            ? "unavailable"
            : result.remote.deploymentStatus.state,
        mode: "remote",
        sync: result.remote.syncPlan.status,
      },
      title: "Workspace check",
    },
  };
}

function summarizePullResult(
  result: PullFormlessInstanceWorkspaceResult,
): WorkspaceOperationResult {
  const details: WorkspaceOperationDisplayObject = {
    domainCount: result.domains.length,
    statePath: result.instanceState.statePath,
    syncPlan: summarizeSyncPlan(result.syncPlan),
    target: result.selectedTarget.alias,
  };

  if (result.mode === "dry-run") {
    details.changedStatePaths = result.replacement.changedStatePaths;
    details.prunedStatePaths = result.replacement.prunedStatePaths;
  }

  return {
    details,
    summary: {
      fields: {
        mediaCount: result.instanceState.mediaCount,
        mode: result.mode,
        noop: result.noop,
        recordCount: result.instanceState.recordCount,
      },
      title: "Workspace pulled",
    },
  };
}

function summarizePushResult(
  result: PushFormlessInstanceWorkspaceResult,
): WorkspaceOperationResult {
  const details: WorkspaceOperationDisplayObject = {
    applyRestore: result.applyResult ? summarizeRestore(result.applyResult) : null,
    ...(result.backup === undefined
      ? {}
      : {
          backup: {
            archivePath: result.backup.archivePath,
            mediaCount: result.backup.mediaCount,
            recordCount: result.backup.recordCount,
          },
        }),
    dryRunRestore: result.dryRun ? summarizeRestore(result.dryRun) : null,
    forcedRecovery: result.forcedRecovery ?? null,
    syncPlan: summarizeSyncPlan(result.syncPlan),
    target: result.selectedTarget.alias,
  };
  const fields: WorkspaceOperationDisplayObject = {
    applyRestoreOk: result.applyResult?.remote.ok ?? null,
    backupEvidence:
      result.backup === undefined
        ? (result.forcedRecovery?.evidence.backup.status ?? null)
        : "written",
    dryRunRestoreOk: result.dryRun?.remote.ok ?? null,
    forcedRecovery: result.forcedRecovery?.status ?? null,
    mode: result.mode,
    noop: result.noop,
    remoteComparisonEvidence: result.forcedRecovery?.evidence.remoteComparison.status ?? null,
    restoreDryRunEvidence: result.forcedRecovery?.evidence.restoreDryRun.status ?? null,
    sourceMedia: result.source.mediaCount,
    sourceRecords: result.source.recordCount,
    sync: result.syncPlan.status,
  };

  if (result.runtimeRebuild !== undefined) {
    details.runtimeRebuild = result.runtimeRebuild;
    fields.runtimeRebuild = result.runtimeRebuild.status;
  }

  if (result.schemaChange !== undefined) {
    details.schemaChange = result.schemaChange;
    fields.localArchiveValidation = result.schemaChange.localArchiveValidation;
    fields.runtimeReconciliation = result.schemaChange.runtimeReconciliation;
    fields.storageCompatibility = result.schemaChange.storageCompatibility;
    fields.targetRuntimeValidation = result.schemaChange.targetRuntimeValidation;
  }

  const deployment = summarizePushDeployment(result);

  return {
    ...(deployment === undefined ? {} : { deployment }),
    details,
    summary: {
      fields,
      title: result.mode === "apply" ? "Workspace push applied" : "Workspace push planned",
    },
  };
}

function summarizePushDeployment(
  result: PushFormlessInstanceWorkspaceResult,
): WorkspaceOperationDisplayObject | undefined {
  const display: LocalWorkspaceDeploymentDisplayFacts | undefined = result.deploymentDisplay;

  if (display === undefined) {
    return undefined;
  }

  return {
    ...deploymentDisplayFields(display),
    deploymentUrl: result.deployment?.url ?? display.targetUrl,
    desiredStateVersion: result.deploymentObservation?.desiredState.versionId ?? null,
    evidenceCount: result.deploymentObservation?.evidenceCount ?? null,
    healthCheckVersion: result.healthCheck?.version ?? null,
    observedStatus: result.deploymentObservation?.observedStatus ?? null,
    resourceCount: result.deploymentObservation?.resourceCount ?? null,
  };
}

function deploymentDisplayFields(
  display: LocalWorkspaceDeploymentDisplayFacts,
): WorkspaceOperationDisplayObject {
  return {
    accountId: display.accountId,
    ...(display.accountName === undefined ? {} : { accountName: display.accountName }),
    ...(display.credentialRef === undefined ? {} : { credentialRef: display.credentialRef }),
    ...(display.profile === undefined ? {} : { profile: display.profile }),
    ...(display.profileRef === undefined ? {} : { profileRef: display.profileRef }),
    providerFamily: display.providerFamily,
    target: display.target,
    targetUrl: display.targetUrl,
    workerName: display.workerName,
    workersDevSubdomain: display.workersDevSubdomain,
  };
}

function summarizeRestore(result: RestoreInstanceArchiveResult): WorkspaceOperationDisplayObject {
  const summary = result.remote.report?.summary ?? result.remote.plan?.summary;

  return {
    errorCount: result.remote.errors?.length ?? 0,
    mediaCount: summary?.mediaCount ?? 0,
    ok: result.remote.ok,
    recordCount: summary?.recordCounts.total ?? 0,
  };
}

function summarizeSyncPlan(
  plan: FormlessInstanceWorkspaceSyncPlan,
): WorkspaceOperationDisplayObject {
  return {
    changedAreas: plan.changedAreas,
    changedDomainCount: plan.changedDomainCount,
    changedMediaCount: plan.changedMedia.length,
    changedRecordCount: plan.changedRecords.length,
    changedStatePathCount: plan.changedStatePaths.length,
    source: plan.source.label,
    sourceDomainCount: plan.source.domainCount,
    sourceFingerprint: plan.source.fingerprint,
    sourceMediaCount: plan.source.mediaCount,
    sourceRecordCount: plan.source.recordCount,
    status: plan.status,
    target: plan.target.label,
    targetDomainCount: plan.target.domainCount,
    targetFingerprint: plan.target.fingerprint,
    targetMediaCount: plan.target.mediaCount,
    targetRecordCount: plan.target.recordCount,
  };
}
