import {
  formatCliDisplayFields,
  formatCliOutputLines,
  formatCliRelativePath,
  formatCliSelectedTarget,
  type CliDisplayObject,
  type CliSelectedTargetDisplay,
} from "./cli-formatter-helpers.ts";
import type { PushFormlessInstanceWorkspaceResult } from "./instance-workspace-deployment.ts";
import type {
  FormlessInstanceWorkspaceSyncPlan,
  PullFormlessInstanceWorkspaceResult,
} from "./instance-workspace-source-sync.ts";

const CLI_WORKSPACE_SOURCE_SYNC_NOOP_OUTPUT = "Everything up to date.";

export type CliInstanceWorkspaceTokenAdoptResult = {
  secretPath: string;
  selectedTarget?: CliSelectedTargetDisplay;
  workspaceRoot: string;
};

export type CliInstanceWorkspaceTokenRotateResult = CliInstanceWorkspaceTokenAdoptResult & {
  workerName: string;
};

export type CliOwnerSetupStatus = {
  adminOrigin?: string;
  owner?: {
    email?: string;
    name: string;
  };
  setupComplete: boolean;
};

export type CliInstanceOwnerSetupResult = {
  opened: boolean;
  selectedTarget: CliSelectedTargetDisplay;
  setupStatus: CliOwnerSetupStatus;
  setupUrl?: string;
  workspaceRoot: string;
};

export type CliDestroyRouteProviderResources = {
  enabledHosts: string[];
  resourceCount: number;
  routeCount: number;
  source: string;
};

export type CliDestroyedResources = {
  alchemyState: string;
  customDomains: number;
  dnsRecords: number;
  durableObjectNamespace: string;
  mediaBucket: string;
  turnstileWidget: string;
  worker: string;
  workerAssets: string;
  workerSecrets: string;
};

export type CliInstanceWorkspaceDestroyResult = {
  deploymentStatePath: string;
  deploymentStateRoot: string;
  destroy: {
    resources: CliDestroyedResources;
  };
  localSecretPath: string;
  plan: {
    resources: {
      authority: {
        namespaceName: string;
      };
      mediaBucket: {
        name: string;
      };
      worker: {
        name: string;
      };
    };
  };
  routeProviderResources: CliDestroyRouteProviderResources;
  selectedTarget: CliSelectedTargetDisplay;
  workspaceRoot: string;
};

export function formatCliWorkspacePullOutput(
  result: PullFormlessInstanceWorkspaceResult,
  cwd: string,
): string {
  if (result.noop) {
    return CLI_WORKSPACE_SOURCE_SYNC_NOOP_OUTPUT;
  }

  const details: CliDisplayObject = {
    domainCount: result.domains.length,
    statePath: formatCliRelativePath(cwd, result.instanceState.statePath),
    syncPlan: cliWorkspaceSyncPlanDisplay(result.syncPlan),
    target: result.selectedTarget.alias,
  };

  if (result.mode === "dry-run") {
    details.changedStatePaths = result.replacement.changedStatePaths;
    details.prunedStatePaths = result.replacement.prunedStatePaths;
  }

  return formatCliWorkspaceSourceSyncOutput({
    details,
    fields: {
      mediaCount: result.instanceState.mediaCount,
      mode: result.mode,
      noop: result.noop,
      recordCount: result.instanceState.recordCount,
    },
    operation: "pull",
    title: "Workspace pulled",
  });
}

export function formatCliWorkspacePushOutput(result: PushFormlessInstanceWorkspaceResult): string {
  if (result.noop && result.runtimeRebuild === undefined) {
    return CLI_WORKSPACE_SOURCE_SYNC_NOOP_OUTPUT;
  }

  const details: CliDisplayObject = {
    applyRestore: result.applyResult ? cliWorkspaceRestoreDisplay(result.applyResult) : null,
    ...(result.backup === undefined
      ? {}
      : {
          backup: {
            archivePath: result.backup.archivePath,
            mediaCount: result.backup.mediaCount,
            recordCount: result.backup.recordCount,
          },
        }),
    dryRunRestore: result.dryRun ? cliWorkspaceRestoreDisplay(result.dryRun) : null,
    forcedRecovery: result.forcedRecovery ?? null,
    syncPlan: cliWorkspaceSyncPlanDisplay(result.syncPlan),
    target: result.selectedTarget.alias,
  };
  const fields: CliDisplayObject = {
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

  return formatCliWorkspaceSourceSyncOutput({
    deployment: cliWorkspacePushDeploymentDisplay(result),
    details,
    fields,
    operation: "push",
    title: result.mode === "apply" ? "Workspace push applied" : "Workspace push planned",
  });
}

export function formatCliInstanceWorkspaceTokenAdoptOutput(
  result: CliInstanceWorkspaceTokenAdoptResult,
  cwd: string,
): string {
  return formatCliOutputLines([
    "Instance workspace admin token adopted.",
    `Workspace: ${formatCliRelativePath(cwd, result.workspaceRoot)}.`,
    `Secret state: ${formatCliRelativePath(cwd, result.secretPath)}.`,
    `Target: ${formatCliSelectedTarget(result.selectedTarget)}.`,
  ]);
}

export function formatCliInstanceWorkspaceTokenRotateOutput(
  result: CliInstanceWorkspaceTokenRotateResult,
  cwd: string,
): string {
  return formatCliOutputLines([
    "Instance workspace admin token rotated.",
    `Workspace: ${formatCliRelativePath(cwd, result.workspaceRoot)}.`,
    `Secret state: ${formatCliRelativePath(cwd, result.secretPath)}.`,
    `Worker: ${result.workerName}.`,
    `Target: ${formatCliSelectedTarget(result.selectedTarget)}.`,
  ]);
}

export function formatCliInstanceOwnerSetupOutput(
  result: CliInstanceOwnerSetupResult,
  cwd: string,
): string {
  return formatCliOutputLines([
    result.setupUrl
      ? "Instance owner setup URL created."
      : "Instance owner setup already complete.",
    `Workspace: ${formatCliRelativePath(cwd, result.workspaceRoot)}.`,
    `Target: ${formatCliSelectedTarget(result.selectedTarget)}.`,
    `Owner setup: ${formatCliOwnerSetupStatus(result.setupStatus)}.`,
    result.setupStatus.adminOrigin
      ? `Admin URL: ${formatCliOwnerSetupAdminUrl(result.setupStatus.adminOrigin)}.`
      : null,
    result.setupUrl ? `Setup URL: ${result.setupUrl}.` : null,
    result.setupUrl ? `Browser opened: ${formatCliBrowserOpened(result.opened)}.` : null,
  ]);
}

export function formatCliInstanceWorkspaceDestroyOutput(
  result: CliInstanceWorkspaceDestroyResult,
  cwd: string,
): string {
  return formatCliOutputLines([
    "Instance workspace destroyed.",
    `Workspace: ${formatCliRelativePath(cwd, result.workspaceRoot)}.`,
    `Target: ${formatCliSelectedTarget(result.selectedTarget)}.`,
    `Worker: ${result.plan.resources.worker.name}.`,
    `Durable Object namespace: ${result.plan.resources.authority.namespaceName}.`,
    `Media bucket: ${result.plan.resources.mediaBucket.name}.`,
    `Route provider resources: ${formatCliDestroyRouteProviderResources(
      result.routeProviderResources,
    )}.`,
    `Destroyed resources: ${formatCliDestroyedResources(result.destroy.resources)}.`,
    `Ignored deploy state: ${formatCliRelativePath(cwd, result.deploymentStateRoot)}.`,
    `Deployment facts: ${formatCliRelativePath(cwd, result.deploymentStatePath)}.`,
    `Local deploy secrets: ${formatCliRelativePath(cwd, result.localSecretPath)}.`,
  ]);
}

export function formatCliDestroyRouteProviderResources(
  resources: CliDestroyRouteProviderResources,
): string {
  if (resources.resourceCount === 0) {
    return "none";
  }

  return `${resources.resourceCount} provider resource${
    resources.resourceCount === 1 ? "" : "s"
  } from ${resources.routeCount} route${resources.routeCount === 1 ? "" : "s"} (${
    resources.source
  }; ${resources.enabledHosts.length === 0 ? "no hosts" : resources.enabledHosts.join(", ")})`;
}

export function formatCliDestroyedResources(resources: CliDestroyedResources): string {
  return `Worker ${resources.worker}, Durable Object namespace ${resources.durableObjectNamespace}, R2 media bucket ${resources.mediaBucket}, Turnstile widget ${resources.turnstileWidget}, Worker assets ${resources.workerAssets}, Worker secrets ${resources.workerSecrets}, custom domains ${resources.customDomains}, DNS records ${resources.dnsRecords}, Alchemy state ${resources.alchemyState}`;
}

export function formatCliOwnerSetupStatus(status: CliOwnerSetupStatus): string {
  if (!status.setupComplete) {
    return "incomplete";
  }

  const owner = status.owner;

  if (!owner) {
    return "complete";
  }

  return owner.email ? `complete (${owner.name} <${owner.email}>)` : `complete (${owner.name})`;
}

export function formatCliBrowserOpened(opened: boolean): "no" | "yes" {
  return opened ? "yes" : "no";
}

function formatCliOwnerSetupAdminUrl(adminOrigin: string): string {
  try {
    const url = new URL(adminOrigin);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return adminOrigin;
    }

    return `${url.origin}/`;
  } catch {
    return adminOrigin;
  }
}

function formatCliWorkspaceSourceSyncOutput(input: {
  deployment?: CliDisplayObject;
  details: CliDisplayObject;
  fields: CliDisplayObject;
  operation: "pull" | "push";
  title: string;
}): string {
  return formatCliOutputLines([
    `Workspace operation: ${input.operation} (succeeded).`,
    "Workspace source: layout-only manifest, storage snapshots, media payloads.",
    `Summary: ${input.title}.`,
    ...formatCliDisplayFields(input.fields),
    "Details:",
    ...formatCliDisplayFields(input.details),
    ...(input.deployment === undefined
      ? []
      : ["Deployment execution summary:", ...formatCliDisplayFields(input.deployment)]),
  ]);
}

function cliWorkspacePushDeploymentDisplay(
  result: PushFormlessInstanceWorkspaceResult,
): CliDisplayObject {
  const display = result.deploymentDisplay;

  return {
    accountId: display.accountId,
    ...(display.accountName === undefined ? {} : { accountName: display.accountName }),
    ...(display.credentialRef === undefined ? {} : { credentialRef: display.credentialRef }),
    deploymentUrl: result.deployment?.url ?? display.targetUrl,
    desiredStateVersion: result.deploymentObservation?.desiredState.versionId ?? null,
    evidenceCount: result.deploymentObservation?.evidenceCount ?? null,
    healthCheckVersion: result.healthCheck?.version ?? null,
    observedStatus: result.deploymentObservation?.observedStatus ?? null,
    ...(display.profile === undefined ? {} : { profile: display.profile }),
    ...(display.profileRef === undefined ? {} : { profileRef: display.profileRef }),
    providerFamily: display.providerFamily,
    resourceCount: result.deploymentObservation?.resourceCount ?? null,
    target: display.target,
    targetUrl: display.targetUrl,
    workerName: display.workerName,
    workersDevSubdomain: display.workersDevSubdomain,
  };
}

function cliWorkspaceRestoreDisplay(
  result: NonNullable<PushFormlessInstanceWorkspaceResult["dryRun"]>,
): CliDisplayObject {
  const summary = result.remote.report?.summary ?? result.remote.plan?.summary;

  return {
    errorCount: result.remote.errors?.length ?? 0,
    mediaCount: summary?.mediaCount ?? 0,
    ok: result.remote.ok,
    recordCount: summary?.recordCounts.total ?? 0,
  };
}

function cliWorkspaceSyncPlanDisplay(plan: FormlessInstanceWorkspaceSyncPlan): CliDisplayObject {
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
