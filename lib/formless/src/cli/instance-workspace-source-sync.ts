import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  deployLatestStatusDisplaySummary,
  type DeployLatestStatusDisplaySummary,
} from "@dpeek/formless-deploy";
import {
  APP_ARCHIVE_KIND,
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  appArchiveMediaReferences,
  archiveApps,
  archiveMediaObjects,
  archiveRecordCount,
  parseAppArchive,
  type AppArchive,
  type AppArchiveMediaObject,
  type AppArchiveMediaReference,
  type InstanceArchive,
  type PortableArchive,
} from "../program/archive.ts";
import {
  writePortableArchiveDirectory,
  type ArchiveDiskMediaFile,
} from "../program/archive-node.ts";
import {
  coreImageMediaDeliveryFactsForAssetId,
  documentMediaAssetIsCompatible,
  documentMediaDeliveryFactsForAssetId,
  isDocumentMediaAsset,
  validatePdfDocumentMediaFile,
} from "@dpeek/formless-media";
import { siteEntityIds } from "@dpeek/formless-site-app";
import { packageAppFactsForKey } from "@dpeek/formless-installed-apps";
import {
  findResolvedAppPackage,
  isRuntimeInstallableAppPackageKey,
  type AppPackageResolver,
} from "../shared/app-packages.ts";
import { normalizeInstanceDomainHost } from "../shared/instance-domain-mappings.ts";
import {
  formatInstanceControlPlaneBoundaryEntityName,
  instanceControlPlaneDeploymentConfigObservedFields,
  isInstanceControlPlaneEntityName,
} from "@dpeek/formless-instance-control-plane";
import {
  canonicalizeFormlessProgramStorageSnapshot,
  formlessProgramSchema,
} from "../program/runtime.ts";
import { STORAGE_SNAPSHOT_KIND } from "@dpeek/formless-storage";
import type { RecordValues, StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import {
  DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT as DEFAULT_FORMLESS_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT,
  WORKSPACE_MEDIA_MANIFEST_FILE,
  nextWorkspaceAutoSaveSavedState,
  normalizeInstanceWorkspaceTargetUrl as normalizeFormlessInstanceWorkspaceTargetUrl,
  type InstanceWorkspaceDomainIntent as FormlessInstanceWorkspaceDomainIntent,
  type ResolvedFormlessConfig as FormlessResolvedConfig,
  type InstanceWorkspaceTarget as FormlessInstanceWorkspaceTarget,
  type WorkspacePackageAppSchemaProvenance,
} from "@dpeek/formless-workspace";
import {
  instanceWorkspaceAppStateRelativePath,
  instanceWorkspaceInstanceStateRelativePath,
  readInstanceWorkspaceAppStorageSnapshot,
  readInstanceWorkspaceAutoSaveState,
  readInstanceWorkspaceControlPlaneStorageSnapshot,
  readInstanceWorkspaceLocalDevSecretState as readFormlessInstanceWorkspaceLocalDevSecretState,
  readInstanceWorkspaceMediaFiles,
  readInstanceWorkspaceSecretState as readFormlessInstanceWorkspaceSecretState,
  replaceInstanceWorkspaceAppStorageSnapshots,
  replaceInstanceWorkspaceMediaFiles,
  resolveInstanceWorkspaceAdminToken as resolveFormlessInstanceWorkspaceAdminToken,
  writeInstanceWorkspaceAutoSaveState,
  writeInstanceWorkspaceControlPlaneStorageSnapshot,
} from "../program/workspace.ts";
import {
  readFormlessInstanceControlPlaneRecords,
  readFormlessInstanceDeploymentStatus,
} from "./instance-target-client.ts";
import type { CloudflareDomainIntent } from "./cloudflare-domain-client.ts";
import {
  requireFormlessCliTargetContext,
  resolveFormlessCliWorkspaceTarget,
} from "./instance-target-context.ts";
import {
  exportInstanceArchive,
  restoreWorkspacePushArchive,
  type RestorePortableArchiveResult,
} from "./archive-workflows.ts";
import {
  createActiveWorkspaceAppPackages,
  createWorkspaceTempRoot,
  formlessInstanceWorkspaceLocalStateRoot,
  readWorkspaceConfig,
  resolveFormlessInstanceWorkspaceRoot,
  workspaceSchemaProvenanceForPackageApp,
  workspaceSourceSchemaForPackageApp,
  type ActiveWorkspaceAppPackages,
} from "./instance-workspace-foundation.ts";
import {
  assertWorkspaceControlPlanePackagesAvailable,
  booleanRecordValue,
  controlPlaneAppInstallRecords,
  controlPlaneSnapshotForArchive,
  readArchiveDirectoryForCheck,
  stringRecordValue,
  withoutControlPlaneLifecycleValues,
  workspaceControlPlaneSnapshotFromRecords,
  type WorkspaceAppStateArchive,
  type WorkspaceArchiveDirectory,
  type WorkspaceArchiveMediaComparisonSource,
  type WorkspaceControlPlaneAppInstallRecord,
  type WorkspaceControlPlaneRecords,
  type WorkspaceInstanceArchiveDirectory,
} from "./instance-workspace-control-plane.ts";

const deploymentConfigObservedFieldSet = new Set<string>(
  instanceControlPlaneDeploymentConfigObservedFields,
);
const siteEntityIdSet = new Set<string>(siteEntityIds);
const programSiteEntityKeys = new Set(
  formlessProgramSchema.entities
    .filter((entity) => siteEntityIdSet.has(entity.id))
    .map((entity) => entity.key),
);

type WorkspaceLocalDevState = {
  sourceUrl: string;
  startedAt: string;
};

type WorkspaceLocalRestoreArchiveSource = {
  appCount: number;
  archiveRoot: string;
  mediaCount: number;
  recordCount: number;
  sourceKind: "storage state";
};

type WorkspaceProgramMediaSource = WorkspaceArchiveMediaComparisonSource & {
  objects: AppArchiveMediaObject[];
};

const WORKSPACE_LOCAL_DEV_STATE_FILE = "dev.json";
const WORKSPACE_DEFAULT_LOCAL_SOURCE = "http://localhost:5173";
const sourceOnlyDeploymentIntentEntities = new Set(["deployment-config"]);

export type PullFormlessInstanceWorkspaceInput = {
  dryRun?: boolean;
  targetAlias?: string | null;
  workspacePath?: string;
};

export type PullFormlessInstanceWorkspaceDependencies = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  now: () => string;
};

export type PullFormlessInstanceWorkspaceAppStateResult = {
  appCount: number;
  installId: string;
  mediaCount: number;
  recordCount: number;
  statePath: string;
  stateRoot: string;
};

export type PullFormlessInstanceWorkspaceReplacementPlan = {
  changedStatePaths: string[];
  prunedStatePaths: string[];
  status: "changes" | "no-changes";
};

export type PullFormlessInstanceWorkspaceResult = {
  appState: PullFormlessInstanceWorkspaceAppStateResult[];
  domains: FormlessInstanceWorkspaceDomainIntent[];
  instanceState: FormlessInstanceWorkspaceStateSummary;
  mode: "apply" | "dry-run";
  noop: boolean;
  replacement: PullFormlessInstanceWorkspaceReplacementPlan;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  syncPlan: FormlessInstanceWorkspaceSyncPlan;
  workspaceRoot: string;
};

export type CheckFormlessInstanceWorkspaceInput = {
  targetAlias?: string | null;
  workspacePath?: string;
};

export type CheckLocalFormlessWorkspaceInput = {
  targetAlias?: string | null;
  workspacePath?: string | null;
};

export type SaveLocalFormlessWorkspaceInput = {
  check?: boolean;
  source?: string | null;
  workspacePath?: string | null;
};

export type CheckFormlessInstanceWorkspaceDependencies = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  now: () => string;
};

export type SaveLocalFormlessWorkspaceDependencies = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  now: () => string;
};

export type FormlessInstanceWorkspacePackageMismatch = {
  installId: string;
  localPackageAppKey: string;
  localPackageRevision: number;
  localSourceSchemaHash: string;
  localSourceSchemaKey: string;
  remotePackageAppKey: string;
  remotePackageRevision: number;
  remoteSourceSchemaHash: string;
  remoteSourceSchemaKey: string;
};

export type FormlessInstanceWorkspaceSyncPlanChangedArea =
  | "apps"
  | "control-plane"
  | "domains"
  | "media"
  | "packages"
  | "records";

export type FormlessInstanceWorkspaceSyncPlanEndpoint = {
  appCount: number;
  controlPlaneRecordCount: number;
  domainCount: number;
  fingerprint: string;
  label: string;
  mediaCount: number;
  recordCount: number;
};

export type FormlessInstanceWorkspaceSyncPlan = {
  changedAreas: FormlessInstanceWorkspaceSyncPlanChangedArea[];
  changedStatePaths: string[];
  changedControlPlaneRecords: string[];
  changedDomainCount: number;
  domainDesiredDrift: FormlessInstanceWorkspaceDomainDesiredDrift[];
  changedMedia: string[];
  changedRecords: string[];
  extraInstalls: string[];
  missingInstalls: string[];
  packageMismatches: FormlessInstanceWorkspacePackageMismatch[];
  source: FormlessInstanceWorkspaceSyncPlanEndpoint;
  target: FormlessInstanceWorkspaceSyncPlanEndpoint;
  status: "changes" | "up-to-date";
};

export type CheckFormlessInstanceWorkspaceResult = {
  deploymentStatus?: DeployLatestStatusDisplaySummary;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  syncPlan: FormlessInstanceWorkspaceSyncPlan;
  workspaceRoot: string;
};

export type CheckLocalFormlessWorkspaceResult =
  | {
      config: FormlessResolvedConfig;
      configPath: string;
      mode: "local";
      workspaceRoot: string;
    }
  | {
      mode: "remote";
      remote: CheckFormlessInstanceWorkspaceResult;
    };

export type FormlessInstanceWorkspaceStateSummary = {
  appCount: number;
  mediaCount: number;
  recordCount: number;
  statePath: string;
};

export type SaveLocalFormlessWorkspaceAppStateSummary = FormlessInstanceWorkspaceStateSummary & {
  installId: string;
};

export type SaveLocalFormlessWorkspaceResult = {
  appState: SaveLocalFormlessWorkspaceAppStateSummary[];
  config: FormlessResolvedConfig;
  configPath: string;
  instanceState: FormlessInstanceWorkspaceStateSummary;
  mode: "check" | "write";
  source: string;
  workspaceRoot: string;
};

export type PushFormlessInstanceWorkspaceSource = {
  archivePath: string;
  appCount: number;
  mediaCount: number;
  recordCount: number;
};

export type PushFormlessInstanceWorkspaceRuntimeRebuild = {
  reason: "force" | "runtime-extensions-configured";
  status: "applied" | "available";
};

export type PushFormlessInstanceWorkspaceForcedRecoveryPlan = {
  action: "replace-unreadable-target";
  evidence: {
    backup: PushFormlessInstanceWorkspaceForcedRecoveryEvidence;
    remoteComparison: PushFormlessInstanceWorkspaceForcedRecoveryEvidence;
    restoreDryRun: PushFormlessInstanceWorkspaceForcedRecoveryEvidence;
  };
  remoteReadError: string;
  remoteReadFailureType: "parse" | "validation";
  reason: "remote-archive-parse-or-validation-failed";
  status: "applied" | "planned";
};

export type PushFormlessInstanceWorkspaceForcedRecoveryEvidence = {
  reason: "target-archive-unreadable";
  status: "unavailable";
};

export type FormlessInstanceWorkspaceDomainDesiredDrift = {
  host: string;
  live?: FormlessInstanceWorkspaceDomainIntent;
  local?: FormlessInstanceWorkspaceDomainIntent;
  status: "local-only" | "live-only" | "mismatch";
};

export async function pullFormlessInstanceWorkspace(
  input: PullFormlessInstanceWorkspaceInput,
  dependencies: PullFormlessInstanceWorkspaceDependencies,
): Promise<PullFormlessInstanceWorkspaceResult> {
  const context = await requireFormlessCliTargetContext(
    {
      commandName: "pull",
      cwd: dependencies.cwd,
      targetAlias: input.targetAlias,
      workspacePath: input.workspacePath,
    },
    { env: dependencies.env },
  );
  const { adminToken, config, selectedTarget, workspaceRoot } = context;
  const activePackages = await createActiveWorkspaceAppPackages(workspaceRoot, config);
  const tempRoot = await createWorkspaceTempRoot(workspaceRoot, "pull");

  try {
    const instanceArchiveRoot = path.join(tempRoot, "instance");

    await exportInstanceArchive(
      {
        adminToken,
        outDir: instanceArchiveRoot,
        packageResolver: activePackages.resolver,
        target: selectedTarget.url,
      },
      dependencies,
    );
    const pulledInstanceArchive = await readArchiveDirectoryForCheck(instanceArchiveRoot, {
      packageResolver: activePackages.resolver,
    });

    if (!pulledInstanceArchive || pulledInstanceArchive.archive.kind !== INSTANCE_ARCHIVE_KIND) {
      throw new Error("Formless instance pull did not write an instance archive.");
    }

    const pulledInstanceDirectory: WorkspaceInstanceArchiveDirectory = {
      ...pulledInstanceArchive,
      archive: pulledInstanceArchive.archive,
    };

    const localControlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
      manifest: config,
      packageResolver: activePackages.resolver,
      workspaceRoot,
    });
    assertWorkspaceControlPlanePackagesAvailable({
      controlPlane: localControlPlane,
      operation: "check",
      packageResolver: activePackages.resolver,
    });
    const localDomainIntents = workspaceDomainIntentsFromSource(localControlPlane);
    const domains = await readLiveWorkspaceDomainIntents(
      { adminToken, target: selectedTarget },
      dependencies,
    );
    const domainDesiredDrift = shouldCompareWorkspaceDomainIntents(localDomainIntents, domains)
      ? compareWorkspaceDomainIntentToLive(localDomainIntents, domains)
      : [];
    const localAppState = await readWorkspaceAppStateMapForCheck(
      workspaceRoot,
      config,
      localControlPlane,
      activePackages,
    );
    const localProgramMedia = await workspaceProgramMediaFromSnapshot({
      controlPlane: localControlPlane,
      manifest: config,
      workspaceRoot,
    });
    const syncPlan = createWorkspaceSyncPlan({
      domainDesiredDrift,
      localControlPlane,
      localAppState,
      localProgramMedia,
      localDomains: localDomainIntents,
      manifest: config,
      packageResolver: activePackages.resolver,
      remoteArchive: pulledInstanceDirectory,
      remoteDomains: domains,
      sourceLabel: selectedTarget.alias,
      sourceSide: "remote",
      targetLabel: "workspace",
    });
    const appState = pulledAppStateResults({
      archive: pulledInstanceArchive.archive,
      manifest: config,
      workspaceRoot,
    });
    const replacement = await pullWorkspaceReplacementPlan({
      localControlPlane,
      manifest: config,
      remoteArchive: pulledInstanceDirectory,
      syncPlan,
      workspaceRoot,
    });
    const instanceState: FormlessInstanceWorkspaceStateSummary = {
      appCount: pulledInstanceArchive.archive.apps.length,
      mediaCount:
        pulledInstanceArchive.archive.media.objects.length +
        pulledInstanceArchive.archive.apps.reduce(
          (count, app) => count + app.media.objects.length,
          0,
        ),
      recordCount: pulledInstanceArchive.archive.controlPlane?.records.length ?? 0,
      statePath: path.join(workspaceRoot, instanceWorkspaceInstanceStateRelativePath(config)),
    };
    const noop = replacement.status === "no-changes";

    if (input.dryRun || noop) {
      return {
        appState,
        domains,
        instanceState,
        mode: input.dryRun ? "dry-run" : "apply",
        noop,
        replacement,
        selectedTarget,
        syncPlan,
        workspaceRoot,
      };
    }

    await prepareWorkspaceDirectories(workspaceRoot, config);
    await writeInstanceWorkspaceControlPlaneStorageSnapshot({
      manifest: config,
      packageResolver: activePackages.resolver,
      snapshot: pulledInstanceArchive.archive.controlPlane,
      sourceLabel: "Instance archive controlPlane",
      validationContext: "Instance archive controlPlane records",
      workspaceRoot,
    });

    const appSnapshots = pulledInstanceArchive.archive.apps.map((app) => ({
      installId: app.app.installId,
      schemaProvenance: workspaceSchemaProvenanceForAppArchive(app),
      snapshot: appStorageSnapshotFromArchive(app),
    }));

    await replaceInstanceWorkspaceAppStorageSnapshots({
      manifest: config,
      snapshots: appSnapshots,
      workspaceRoot,
    });
    await replaceInstanceWorkspaceMediaFiles({
      manifest: config,
      mediaFiles: workspaceMediaFilesWithObjects(pulledInstanceArchive),
      workspaceRoot,
    });

    return {
      appState,
      domains,
      instanceState,
      mode: "apply",
      noop: false,
      replacement,
      selectedTarget,
      syncPlan,
      workspaceRoot,
    };
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

export async function checkFormlessInstanceWorkspace(
  input: CheckFormlessInstanceWorkspaceInput,
  dependencies: CheckFormlessInstanceWorkspaceDependencies,
): Promise<CheckFormlessInstanceWorkspaceResult> {
  const context = await requireFormlessCliTargetContext(
    {
      commandName: "check",
      cwd: dependencies.cwd,
      targetAlias: input.targetAlias,
      workspacePath: input.workspacePath,
    },
    { env: dependencies.env },
  );
  const { adminToken, config, selectedTarget, workspaceRoot } = context;
  const activePackages = await createActiveWorkspaceAppPackages(workspaceRoot, config);
  const tempRoot = await createWorkspaceTempRoot(workspaceRoot, "check");

  try {
    const remoteArchiveRoot = path.join(tempRoot, "instance");

    await exportInstanceArchive(
      {
        adminToken,
        outDir: remoteArchiveRoot,
        packageResolver: activePackages.resolver,
        target: selectedTarget.url,
      },
      dependencies,
    );

    const remoteArchive = await readArchiveDirectoryForCheck(remoteArchiveRoot, {
      packageResolver: activePackages.resolver,
    });

    if (!remoteArchive || remoteArchive.archive.kind !== INSTANCE_ARCHIVE_KIND) {
      throw new Error("Formless instance check did not write a remote instance archive.");
    }

    const localControlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
      manifest: config,
      packageResolver: activePackages.resolver,
      workspaceRoot,
    });
    assertWorkspaceControlPlanePackagesAvailable({
      controlPlane: localControlPlane,
      operation: "check",
      packageResolver: activePackages.resolver,
    });
    const localDomainIntents = workspaceDomainIntentsFromSource(localControlPlane);
    const liveDomains = await readLiveWorkspaceDomainIntents(
      { adminToken, target: selectedTarget },
      dependencies,
    );
    const deploymentStatus = await readFormlessInstanceDeploymentStatus(
      { adminToken, targetUrl: selectedTarget.url },
      dependencies,
    );
    const domainDesiredDrift = shouldCompareWorkspaceDomainIntents(localDomainIntents, liveDomains)
      ? compareWorkspaceDomainIntentToLive(localDomainIntents, liveDomains)
      : [];
    const localAppState = await readWorkspaceAppStateMapForCheck(
      workspaceRoot,
      config,
      localControlPlane,
      activePackages,
    );
    const localProgramMedia = await workspaceProgramMediaFromSnapshot({
      controlPlane: localControlPlane,
      manifest: config,
      workspaceRoot,
    });

    return {
      deploymentStatus: deployLatestStatusDisplaySummary(deploymentStatus.status),
      syncPlan: createWorkspaceSyncPlan({
        domainDesiredDrift,
        localControlPlane,
        localAppState,
        localProgramMedia,
        localDomains: localDomainIntents,
        manifest: config,
        packageResolver: activePackages.resolver,
        remoteArchive,
        remoteDomains: liveDomains,
        sourceLabel: "workspace",
        sourceSide: "local",
        targetLabel: selectedTarget.alias,
      }),
      selectedTarget,
      workspaceRoot,
    };
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

export async function checkLocalFormlessWorkspace(
  input: CheckLocalFormlessWorkspaceInput,
  dependencies: CheckFormlessInstanceWorkspaceDependencies,
): Promise<CheckLocalFormlessWorkspaceResult> {
  const workspaceRoot = await resolveFormlessInstanceWorkspaceRoot({
    cwd: dependencies.cwd,
    workspacePath: input.workspacePath,
  });
  const { config, configPath } = await readWorkspaceConfig(workspaceRoot);
  const activePackages = await createActiveWorkspaceAppPackages(workspaceRoot, config);
  const controlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest: config,
    packageResolver: activePackages.resolver,
    workspaceRoot,
  });

  assertWorkspaceControlPlanePackagesAvailable({
    controlPlane,
    operation: "check",
    packageResolver: activePackages.resolver,
  });

  const selectedTarget = await resolveFormlessCliWorkspaceTarget({
    commandName: "check",
    config,
    required: false,
    targetAlias: input.targetAlias,
    workspaceRoot,
  });

  if (!selectedTarget) {
    return {
      config,
      configPath,
      mode: "local",
      workspaceRoot,
    };
  }

  return {
    mode: "remote",
    remote: await checkFormlessInstanceWorkspace(
      {
        targetAlias: input.targetAlias,
        workspacePath: workspaceRoot,
      },
      dependencies,
    ),
  };
}

export async function saveLocalFormlessWorkspace(
  input: SaveLocalFormlessWorkspaceInput,
  dependencies: SaveLocalFormlessWorkspaceDependencies,
): Promise<SaveLocalFormlessWorkspaceResult> {
  const workspaceRoot = await resolveFormlessInstanceWorkspaceRoot({
    cwd: dependencies.cwd,
    workspacePath: input.workspacePath,
  });
  const { config, configPath } = await readWorkspaceConfig(workspaceRoot);
  const activePackages = await createActiveWorkspaceAppPackages(workspaceRoot, config);
  const source = await resolveWorkspaceLocalSource({
    config,
    explicitSource: input.source,
    workspaceRoot,
  });
  const adminToken = await readWorkspaceLocalAuthorityAdminToken(
    workspaceRoot,
    config,
    dependencies,
  );
  const tempRoot = await createWorkspaceTempRoot(workspaceRoot, "save");

  try {
    const exported = await exportWorkspaceSourceFromLocalAuthority(
      {
        adminToken,
        packageResolver: activePackages.resolver,
        source,
        tempRoot,
      },
      dependencies,
    );
    const currentControlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
      manifest: config,
      packageResolver: activePackages.resolver,
      workspaceRoot,
    });
    const sourceControlPlane = savedAuthorityControlPlaneForWorkspaceSource({
      current: currentControlPlane,
      exported: exported.archive.controlPlane,
    });
    assertWorkspaceControlPlanePackagesAvailable({
      controlPlane: sourceControlPlane,
      operation: "save",
      packageResolver: activePackages.resolver,
    });
    const instanceStatePath = path.join(
      workspaceRoot,
      instanceWorkspaceInstanceStateRelativePath(config),
    );
    const appState = savedWorkspaceAppStateSummaries(workspaceRoot, config, exported);
    const result: SaveLocalFormlessWorkspaceResult = {
      appState,
      config,
      configPath,
      instanceState: {
        appCount: exported.archive.apps.length,
        mediaCount:
          exported.archive.media.objects.length +
          exported.archive.apps.reduce((count, app) => count + app.media.objects.length, 0),
        recordCount: sourceControlPlane?.records.length ?? 0,
        statePath: instanceStatePath,
      },
      mode: input.check ? "check" : "write",
      source,
      workspaceRoot,
    };

    if (input.check) {
      const stalePaths = await staleSavedWorkspaceSourcePaths({
        activePackages,
        config,
        exported,
        sourceControlPlane,
        workspaceRoot,
      });

      if (stalePaths.length > 0) {
        throw new Error(
          `Formless workspace source is stale: ${stalePaths.join(", ")}. Run "npx formless save".`,
        );
      }

      return result;
    }

    await writeSavedWorkspaceSource({
      activePackages,
      config,
      exported,
      sourceControlPlane,
      workspaceRoot,
    });
    await markWorkspaceAutoSaveSavedAfterWorkspaceSourceWrite({
      now: dependencies.now,
      workspaceRoot,
    });

    return result;
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

async function readRemoteWorkspaceArchiveForPush(
  input: {
    allowForcedRecovery: boolean;
    adminToken: string | null;
    packageResolver: AppPackageResolver;
    remoteArchiveRoot: string;
    selectedTarget: FormlessInstanceWorkspaceTarget;
  },
  dependencies: WorkspacePushSourceSyncDependencies,
): Promise<WorkspacePushRemoteArchiveReadResult> {
  try {
    await exportInstanceArchive(
      {
        adminToken: input.adminToken,
        outDir: input.remoteArchiveRoot,
        packageResolver: input.packageResolver,
        target: input.selectedTarget.url,
      },
      dependencies,
    );

    const remoteArchive = await readArchiveDirectoryForCheck(input.remoteArchiveRoot, {
      packageResolver: input.packageResolver,
    });

    if (!remoteArchive || remoteArchive.archive.kind !== INSTANCE_ARCHIVE_KIND) {
      throw new Error("Formless instance push could not read remote archive state.");
    }

    return {
      archive: remoteArchive,
      status: "readable",
    };
  } catch (error) {
    const failure = classifyForcedPushRemoteArchiveReadFailure(error);

    if (!input.allowForcedRecovery || failure === undefined) {
      throw error;
    }

    return {
      failure,
      status: "unreadable",
    };
  }
}

async function assertWorkspacePushArchiveReadable(input: {
  archiveRoot: string;
  packageResolver: AppPackageResolver;
}): Promise<void> {
  const archive = await readArchiveDirectoryForCheck(input.archiveRoot, {
    packageResolver: input.packageResolver,
  });

  if (!archive || archive.archive.kind !== INSTANCE_ARCHIVE_KIND) {
    throw new Error("Workspace push requires a valid formless.instanceArchive archive.");
  }
}

type WorkspacePushRemoteArchiveReadFailure = {
  message: string;
  type: "parse" | "validation";
};

type WorkspacePushRemoteArchiveReadResult =
  | {
      archive: WorkspaceArchiveDirectory;
      status: "readable";
    }
  | {
      failure: WorkspacePushRemoteArchiveReadFailure;
      status: "unreadable";
    };

function classifyForcedPushRemoteArchiveReadFailure(
  error: unknown,
): WorkspacePushRemoteArchiveReadFailure | undefined {
  if (error instanceof SyntaxError) {
    return {
      message: error.message,
      type: "parse",
    };
  }

  if (!(error instanceof Error)) {
    return undefined;
  }

  const message = error.message;

  if (
    message.startsWith("Instance archive ") ||
    message.startsWith("App archive ") ||
    message.startsWith("Storage snapshot ") ||
    message.startsWith("Formless Program storage snapshot ") ||
    message.includes("Instance archive controlPlane") ||
    message.includes("Instance archive apps[") ||
    message.includes("controlPlane records")
  ) {
    return {
      message,
      type: "validation",
    };
  }

  return undefined;
}

function forcedRecoveryPlanFromRemoteReadFailure(
  failure: WorkspacePushRemoteArchiveReadFailure,
  input: {
    status: PushFormlessInstanceWorkspaceForcedRecoveryPlan["status"];
  },
): PushFormlessInstanceWorkspaceForcedRecoveryPlan {
  return {
    action: "replace-unreadable-target",
    evidence: forcedRecoveryUnavailableEvidence(),
    reason: "remote-archive-parse-or-validation-failed",
    remoteReadFailureType: failure.type,
    remoteReadError: failure.message,
    status: input.status,
  };
}

function forcedRecoveryUnavailableEvidence(): PushFormlessInstanceWorkspaceForcedRecoveryPlan["evidence"] {
  const unavailable: PushFormlessInstanceWorkspaceForcedRecoveryEvidence = {
    reason: "target-archive-unreadable",
    status: "unavailable",
  };

  return {
    backup: unavailable,
    remoteComparison: unavailable,
    restoreDryRun: unavailable,
  };
}

function emptyRemoteInstanceArchiveDirectory(exportedAt: string): WorkspaceArchiveDirectory {
  const controlPlane = workspaceControlPlaneSnapshotFromRecords({
    current: undefined,
    exportedAt,
    records: [],
    schemaUpdatedAt: exportedAt,
  });

  return {
    archive: {
      kind: INSTANCE_ARCHIVE_KIND,
      version: ARCHIVE_VERSION,
      exportedAt,
      capabilities: [
        "installed-app-registry",
        "schema-owned-control-plane",
        "app-store-snapshots",
        "core-media-assets",
      ],
      restorePolicy: { dryRun: true, installCollisions: "reject" },
      controlPlane,
      media: { objects: [] },
      apps: [],
    },
    archivePath: "",
    mediaFiles: [],
    missingMediaFiles: [],
  };
}

export async function workspaceLocalRestoreArchiveSource(input: {
  activePackages: ActiveWorkspaceAppPackages;
  config: FormlessResolvedConfig;
  exportedAt: string;
  tempRoot: string;
  workspaceRoot: string;
}): Promise<WorkspaceLocalRestoreArchiveSource | undefined> {
  const controlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest: input.config,
    packageResolver: input.activePackages.resolver,
    workspaceRoot: input.workspaceRoot,
  });

  if (!controlPlane) {
    return undefined;
  }

  const reviewableControlPlane = canonicalizeFormlessProgramStorageSnapshot(controlPlane, {
    packageResolver: input.activePackages.resolver,
  });

  assertWorkspaceControlPlanePackagesAvailable({
    controlPlane: reviewableControlPlane,
    operation: "local dev",
    packageResolver: input.activePackages.resolver,
  });

  const appState = await readCompleteWorkspaceAppState(
    input.workspaceRoot,
    input.config,
    reviewableControlPlane,
    input.activePackages,
  );
  const programMedia = await workspaceProgramMediaFromSnapshot({
    controlPlane: reviewableControlPlane,
    manifest: input.config,
    workspaceRoot: input.workspaceRoot,
  });
  assertWorkspaceProgramMediaComplete(programMedia, "local dev");
  const write = await writeComposedWorkspacePushArchive({
    archiveRoot: path.join(input.tempRoot, "archive"),
    appState,
    controlPlane: reviewableControlPlane,
    exportedAt: input.exportedAt,
    packageResolver: input.activePackages.resolver,
    programMedia,
  });

  return {
    appCount: write.appCount,
    archiveRoot: path.dirname(write.archivePath),
    mediaCount: write.mediaCount,
    recordCount: write.recordCount,
    sourceKind: "storage state",
  };
}

export async function resolveWorkspaceLocalSource(input: {
  config: FormlessResolvedConfig;
  explicitSource?: string | null;
  workspaceRoot: string;
}): Promise<string> {
  const source =
    input.explicitSource ??
    (await readWorkspaceLocalDevStateSource(input.workspaceRoot, input.config)) ??
    WORKSPACE_DEFAULT_LOCAL_SOURCE;

  return normalizeFormlessInstanceWorkspaceTargetUrl(source);
}

export async function writeWorkspaceLocalDevState(input: {
  config: FormlessResolvedConfig;
  source: string;
  startedAt: string;
  workspaceRoot: string;
}) {
  const statePath = workspaceLocalDevStatePath(input.workspaceRoot, input.config);
  const state: WorkspaceLocalDevState = {
    sourceUrl: input.source,
    startedAt: input.startedAt,
  };

  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

async function readWorkspaceLocalDevStateSource(
  workspaceRoot: string,
  manifest: FormlessResolvedConfig,
): Promise<string | null> {
  let contents: string;

  try {
    contents = await readFile(workspaceLocalDevStatePath(workspaceRoot, manifest), "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }

  try {
    const value = JSON.parse(contents) as Partial<WorkspaceLocalDevState>;

    return typeof value.sourceUrl === "string" && value.sourceUrl.trim() !== ""
      ? value.sourceUrl
      : null;
  } catch {
    return null;
  }
}

function workspaceLocalDevStatePath(
  workspaceRoot: string,
  manifest: FormlessResolvedConfig,
): string {
  return path.join(
    formlessInstanceWorkspaceLocalStateRoot(workspaceRoot, manifest),
    WORKSPACE_LOCAL_DEV_STATE_FILE,
  );
}

export async function readCompleteWorkspaceAppState(
  workspaceRoot: string,
  manifest: FormlessResolvedConfig,
  controlPlane: WorkspaceControlPlaneRecords,
  activePackages: ActiveWorkspaceAppPackages,
): Promise<WorkspaceAppStateArchive[]> {
  return readRequiredWorkspaceAppState({
    activePackages,
    controlPlane,
    manifest,
    operation: "local dev",
    workspaceRoot,
  });
}

async function readWorkspaceAppStateMapForCheck(
  workspaceRoot: string,
  manifest: FormlessResolvedConfig,
  controlPlane: WorkspaceControlPlaneRecords | undefined,
  activePackages: ActiveWorkspaceAppPackages,
): Promise<Map<string, WorkspaceAppStateArchive>> {
  const appState = new Map<string, WorkspaceAppStateArchive>();

  for (const app of controlPlaneAppInstallRecords(controlPlane)) {
    const state = await readWorkspaceAppStateForCheck({
      activePackages,
      install: app,
      manifest,
      workspaceRoot,
    });

    if (state) {
      appState.set(app.installId, state);
    }
  }

  return appState;
}

async function readWorkspaceAppStateForCheck(input: {
  activePackages: ActiveWorkspaceAppPackages;
  install: WorkspaceControlPlaneAppInstallRecord;
  manifest: FormlessResolvedConfig;
  workspaceRoot: string;
}): Promise<WorkspaceAppStateArchive | undefined> {
  const packageApp = findResolvedAppPackage(
    input.install.packageAppKey,
    input.activePackages.resolver,
  );
  const sourceSchema = workspaceSourceSchemaForPackageApp({
    activePackages: input.activePackages,
    packageAppKey: input.install.packageAppKey,
  });
  const schemaProvenance =
    packageApp === undefined ? undefined : workspaceSchemaProvenanceForPackageApp(packageApp);
  const snapshot = await readInstanceWorkspaceAppStorageSnapshot({
    installId: input.install.installId,
    manifest: input.manifest,
    schemaKey: packageApp?.sourceSchemaKey,
    schemaProvenance,
    sourceSchema,
    workspaceRoot: input.workspaceRoot,
  });

  if (snapshot === undefined) {
    return undefined;
  }

  return workspaceAppStateArchiveFromSnapshot({
    activePackages: input.activePackages,
    install: input.install,
    manifest: input.manifest,
    snapshot,
    workspaceRoot: input.workspaceRoot,
  });
}

async function exportWorkspaceSourceFromLocalAuthority(
  input: {
    adminToken?: string | null;
    packageResolver: AppPackageResolver;
    source: string;
    tempRoot: string;
  },
  dependencies: SaveLocalFormlessWorkspaceDependencies,
): Promise<WorkspaceInstanceArchiveDirectory> {
  const archiveRoot = path.join(input.tempRoot, "authority");

  await exportInstanceArchive(
    {
      adminToken: input.adminToken,
      outDir: archiveRoot,
      packageResolver: input.packageResolver,
      target: input.source,
    },
    dependencies,
  );

  const directory = await readArchiveDirectoryForCheck(archiveRoot, {
    packageResolver: input.packageResolver,
  });

  if (!directory || directory.archive.kind !== INSTANCE_ARCHIVE_KIND) {
    throw new Error("Formless workspace save did not export an instance archive.");
  }

  return {
    ...directory,
    archive: directory.archive,
  };
}

function savedWorkspaceAppStateSummaries(
  workspaceRoot: string,
  manifest: FormlessResolvedConfig,
  directory: WorkspaceInstanceArchiveDirectory,
): SaveLocalFormlessWorkspaceAppStateSummary[] {
  return directory.archive.apps.map((app) => ({
    appCount: 1,
    statePath: path.join(
      workspaceRoot,
      instanceWorkspaceAppStateRelativePath(manifest, app.app.installId),
    ),
    installId: app.app.installId,
    mediaCount: app.media.objects.length,
    recordCount: archiveRecordCount(app),
  }));
}

function savedAuthorityControlPlaneForWorkspaceSource(input: {
  current: WorkspaceControlPlaneRecords | undefined;
  exported: WorkspaceControlPlaneRecords | undefined;
}): WorkspaceControlPlaneRecords | undefined {
  if (input.exported === undefined || input.current === undefined) {
    return input.exported;
  }

  const records = [...input.exported.records];

  for (const entity of sourceOnlyDeploymentIntentEntities) {
    const exportedHasEntity = records.some((record) => controlPlaneRecordEntity(record) === entity);

    if (exportedHasEntity) {
      continue;
    }

    records.push(
      ...input.current.records.filter((record) => controlPlaneRecordEntity(record) === entity),
    );
  }

  return {
    ...input.exported,
    records,
  };
}

function controlPlaneRecordEntity(record: StoredRecord): string | undefined {
  const entity = record.entity.startsWith("instance:")
    ? record.entity.slice("instance:".length)
    : record.entity;

  return isInstanceControlPlaneEntityName(entity) ? entity : undefined;
}

async function staleSavedWorkspaceSourcePaths(input: {
  activePackages: ActiveWorkspaceAppPackages;
  config: FormlessResolvedConfig;
  exported: WorkspaceInstanceArchiveDirectory;
  sourceControlPlane: WorkspaceControlPlaneRecords | undefined;
  workspaceRoot: string;
}): Promise<string[]> {
  const stalePaths = new Set<string>();

  const localControlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest: input.config,
    packageResolver: input.activePackages.resolver,
    workspaceRoot: input.workspaceRoot,
  });

  if (
    comparableControlPlaneIntentRecordsJson(localControlPlane, input.activePackages.resolver) !==
    comparableControlPlaneIntentRecordsJson(input.sourceControlPlane, input.activePackages.resolver)
  ) {
    stalePaths.add(instanceWorkspaceInstanceStateRelativePath(input.config));
  }

  const localProgramMedia = await workspaceProgramMediaFromSnapshot({
    controlPlane: input.sourceControlPlane,
    manifest: input.config,
    workspaceRoot: input.workspaceRoot,
  });
  const expectedProgramMedia = programMediaFromInstanceArchive(input.exported);

  if (
    comparableMediaJson(localProgramMedia, localProgramMedia.objects) !==
    comparableMediaJson(expectedProgramMedia, expectedProgramMedia.objects)
  ) {
    stalePaths.add(path.posix.join(input.config.media.root, WORKSPACE_MEDIA_MANIFEST_FILE));

    for (const archivePath of new Set([
      ...localProgramMedia.objects.map((object) => object.archivePath),
      ...expectedProgramMedia.objects.map((object) => object.archivePath),
    ])) {
      stalePaths.add(path.posix.join(input.config.media.root, archivePath));
    }
  }

  for (const exportedApp of input.exported.archive.apps) {
    const appStatePath = instanceWorkspaceAppStateRelativePath(
      input.config,
      exportedApp.app.installId,
    );
    const expected = workspaceAppStateArchiveFromInstanceExport(
      input.exported,
      exportedApp,
      appStatePath,
    );
    const install = controlPlaneAppInstallRecords(input.sourceControlPlane).find(
      (candidate) => candidate.installId === exportedApp.app.installId,
    );
    const local =
      install === undefined
        ? undefined
        : await readWorkspaceAppStateForCheck({
            activePackages: input.activePackages,
            install,
            manifest: input.config,
            workspaceRoot: input.workspaceRoot,
          });

    if (!workspaceAppStateMatches(expected, local)) {
      stalePaths.add(appStatePath);
    }
  }

  return [...stalePaths].sort((left, right) => left.localeCompare(right));
}

async function writeSavedWorkspaceSource(input: {
  activePackages: ActiveWorkspaceAppPackages;
  config: FormlessResolvedConfig;
  exported: WorkspaceInstanceArchiveDirectory;
  sourceControlPlane: WorkspaceControlPlaneRecords | undefined;
  workspaceRoot: string;
}) {
  await prepareWorkspaceDirectories(input.workspaceRoot, input.config);
  await writeInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest: input.config,
    packageResolver: input.activePackages.resolver,
    snapshot: input.sourceControlPlane,
    workspaceRoot: input.workspaceRoot,
  });
  await replaceInstanceWorkspaceAppStorageSnapshots({
    manifest: input.config,
    snapshots: input.exported.archive.apps.map((app) => ({
      installId: app.app.installId,
      schemaProvenance: workspaceSchemaProvenanceForAppArchive(app),
      snapshot: appStorageSnapshotFromArchive(app),
    })),
    workspaceRoot: input.workspaceRoot,
  });
  await replaceInstanceWorkspaceMediaFiles({
    manifest: input.config,
    mediaFiles: workspaceMediaFilesWithObjects(input.exported),
    workspaceRoot: input.workspaceRoot,
  });
}

async function markWorkspaceAutoSaveSavedAfterWorkspaceSourceWrite(input: {
  now: () => string;
  workspaceRoot: string;
}) {
  const localStateRoot = path.join(
    input.workspaceRoot,
    DEFAULT_FORMLESS_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT,
  );
  const current = await readInstanceWorkspaceAutoSaveState(localStateRoot);

  if (current === undefined || current.dirtyGeneration <= current.savedGeneration) {
    return;
  }

  await writeInstanceWorkspaceAutoSaveState({
    localStateRoot,
    state: nextWorkspaceAutoSaveSavedState(current, { now: input.now }),
    workspaceRoot: input.workspaceRoot,
  });
}

function workspaceAppStateArchiveFromInstanceExport(
  directory: WorkspaceInstanceArchiveDirectory,
  app: AppArchive,
  statePath: string,
): WorkspaceAppStateArchive {
  return {
    appArchive: app,
    mediaFiles: workspaceAppArchiveMediaFiles(directory, app),
    missingMediaFiles: directory.missingMediaFiles.filter((archivePath) =>
      app.media.objects.some((object) => object.archivePath === archivePath),
    ),
    statePath,
  };
}

async function workspaceAppStateArchiveFromSnapshot(input: {
  activePackages: ActiveWorkspaceAppPackages;
  install: WorkspaceControlPlaneAppInstallRecord;
  manifest: FormlessResolvedConfig;
  snapshot: StorageSnapshot;
  workspaceRoot: string;
}): Promise<WorkspaceAppStateArchive> {
  const statePath = instanceWorkspaceAppStateRelativePath(input.manifest, input.install.installId);
  const appArchive = appArchiveFromWorkspaceSnapshot(input);
  const media = await workspaceAppArchiveMediaFromSnapshot({
    archive: appArchive,
    manifest: input.manifest,
    workspaceRoot: input.workspaceRoot,
  });

  return {
    appArchive: {
      ...appArchive,
      media: { objects: media.objects },
    },
    mediaFiles: media.mediaFiles,
    missingMediaFiles: media.missingMediaFiles,
    statePath,
  };
}

function appArchiveFromWorkspaceSnapshot(input: {
  activePackages: ActiveWorkspaceAppPackages;
  install: WorkspaceControlPlaneAppInstallRecord;
  snapshot: StorageSnapshot;
}): AppArchive {
  const packageApp = findResolvedAppPackage(
    input.install.packageAppKey,
    input.activePackages.resolver,
  );
  const packageRevision = input.install.packageRevision ?? packageApp?.packageRevision;
  const sourceSchemaHash = input.install.sourceSchemaHash ?? packageApp?.sourceSchemaHash;

  if (!packageApp || packageRevision === undefined || sourceSchemaHash === undefined) {
    throw new Error(
      `Workspace app state ${input.install.installId} references unavailable package "${input.install.packageAppKey}".`,
    );
  }

  return {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: input.snapshot.exportedAt,
    capabilities: ["app-store-snapshots", "core-media-assets"],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    app: {
      installId: input.install.installId,
      packageAppKey: input.install.packageAppKey,
      packageRevision,
      sourceSchemaKey: packageApp.sourceSchemaKey,
      sourceSchemaHash,
      label: input.install.label,
      registrationPolicy: input.install.registrationPolicy,
      ...(input.install.registrationOperation === undefined
        ? {}
        : { registrationOperation: input.install.registrationOperation }),
      status: input.install.status,
      createdAt: input.install.createdAt,
      updatedAt: input.install.updatedAt,
    },
    data: input.snapshot,
    media: { objects: [] },
  };
}

async function workspaceAppArchiveMediaFromSnapshot(input: {
  archive: AppArchive;
  manifest: FormlessResolvedConfig;
  workspaceRoot: string;
}): Promise<{
  mediaFiles: ArchiveDiskMediaFile[];
  missingMediaFiles: string[];
  objects: AppArchive["media"]["objects"];
}> {
  const references = appMediaReferences(input.archive);
  const archivePaths = references.map((reference) => reference.archivePath);
  const diskMedia = await readInstanceWorkspaceMediaFiles({
    archivePaths,
    manifest: input.manifest,
    workspaceRoot: input.workspaceRoot,
  });
  const objects = parseAppArchive({
    ...input.archive,
    media: { objects: diskMedia.mediaFiles.map((file) => file.object) },
  }).media.objects;

  validateWorkspaceMediaObjects({
    files: diskMedia.mediaFiles,
    objects,
    references,
  });

  return {
    mediaFiles: diskMedia.mediaFiles.map(({ object: _, ...file }) => file),
    missingMediaFiles: diskMedia.missingMediaFiles,
    objects,
  };
}

async function workspaceProgramMediaFromSnapshot(input: {
  controlPlane: WorkspaceControlPlaneRecords | undefined;
  manifest: FormlessResolvedConfig;
  workspaceRoot: string;
}): Promise<WorkspaceProgramMediaSource> {
  if (input.controlPlane === undefined) {
    return { mediaFiles: [], missingMediaFiles: [], objects: [] };
  }

  const references = programMediaReferences(input.controlPlane);
  const diskMedia = await readInstanceWorkspaceMediaFiles({
    archivePaths: references.map((reference) => reference.archivePath),
    manifest: input.manifest,
    workspaceRoot: input.workspaceRoot,
  });
  const objects = diskMedia.mediaFiles.map((file) => file.object as AppArchiveMediaObject);

  validateWorkspaceMediaObjects({
    files: diskMedia.mediaFiles,
    objects,
    references,
  });

  return {
    mediaFiles: diskMedia.mediaFiles.map(({ object: _, ...file }) => file),
    missingMediaFiles: diskMedia.missingMediaFiles,
    objects,
  };
}

function programMediaFromInstanceArchive(
  directory: WorkspaceInstanceArchiveDirectory,
): WorkspaceProgramMediaSource {
  const archivePaths = new Set(directory.archive.media.objects.map((object) => object.archivePath));

  return {
    mediaFiles: directory.mediaFiles.filter((file) => archivePaths.has(file.archivePath)),
    missingMediaFiles: directory.missingMediaFiles.filter((archivePath) =>
      archivePaths.has(archivePath),
    ),
    objects: directory.archive.media.objects,
  };
}

function assertWorkspaceProgramMediaComplete(
  media: WorkspaceProgramMediaSource,
  operation: "local dev" | "push",
) {
  if (media.missingMediaFiles.length > 0) {
    throw new Error(
      `Formless instance ${operation} Program state is missing media files: ${media.missingMediaFiles.join(", ")}.`,
    );
  }
}

export function appStorageSnapshotFromArchive(app: AppArchive): StorageSnapshot {
  if (app.data.kind !== STORAGE_SNAPSHOT_KIND) {
    throw new Error(`Workspace app state for "${app.app.installId}" must be a storage snapshot.`);
  }

  return app.data;
}

export function workspaceSchemaProvenanceForAppArchive(
  app: AppArchive,
): WorkspacePackageAppSchemaProvenance {
  return {
    kind: "package-app",
    packageAppKey: app.app.packageAppKey,
    packageRevision: app.app.packageRevision,
    sourceSchemaHash: app.app.sourceSchemaHash,
  };
}

function pulledAppStateResults(input: {
  archive: InstanceArchive;
  manifest: FormlessResolvedConfig;
  workspaceRoot: string;
}): PullFormlessInstanceWorkspaceAppStateResult[] {
  return archiveApps(input.archive)
    .map((app) => {
      const statePath = path.join(
        input.workspaceRoot,
        instanceWorkspaceAppStateRelativePath(input.manifest, app.app.installId),
      );

      return {
        appCount: 1,
        installId: app.app.installId,
        mediaCount: app.media.objects.length,
        recordCount: archiveRecordCount(app),
        statePath,
        stateRoot: path.dirname(statePath),
      };
    })
    .sort((left, right) => left.installId.localeCompare(right.installId));
}

async function pullWorkspaceReplacementPlan(input: {
  localControlPlane: WorkspaceControlPlaneRecords | undefined;
  manifest: FormlessResolvedConfig;
  remoteArchive: WorkspaceInstanceArchiveDirectory;
  syncPlan: FormlessInstanceWorkspaceSyncPlan;
  workspaceRoot: string;
}): Promise<PullFormlessInstanceWorkspaceReplacementPlan> {
  const changedStatePaths = new Set(input.syncPlan.changedStatePaths);
  const prunedStatePaths = new Set<string>();
  const remoteApps = archiveApps(input.remoteArchive.archive);
  const remoteAppStatePaths = new Set(
    remoteApps.map((app) =>
      instanceWorkspaceAppStateRelativePath(input.manifest, app.app.installId),
    ),
  );
  const localAppStatePaths = await listWorkspaceRelativeFiles(
    path.join(input.workspaceRoot, input.manifest.state.root, "apps"),
    path.posix.join(input.manifest.state.root, "apps"),
  );

  for (const installId of input.syncPlan.extraInstalls) {
    changedStatePaths.add(instanceWorkspaceAppStateRelativePath(input.manifest, installId));
  }

  for (const statePath of localAppStatePaths) {
    if (!remoteAppStatePaths.has(statePath)) {
      changedStatePaths.add(statePath);
      prunedStatePaths.add(statePath);
    }
  }

  const remoteMediaPaths = new Set(
    input.remoteArchive.mediaFiles.map((file) =>
      path.posix.join(input.manifest.media.root, file.archivePath),
    ),
  );
  if (input.remoteArchive.mediaFiles.length > 0) {
    remoteMediaPaths.add(path.posix.join(input.manifest.media.root, WORKSPACE_MEDIA_MANIFEST_FILE));
  }
  const localMediaPaths = await listWorkspaceRelativeFiles(
    path.join(input.workspaceRoot, input.manifest.media.root),
    input.manifest.media.root,
  );
  const changedMediaInstalls = new Set([
    ...input.syncPlan.changedMedia,
    ...input.syncPlan.extraInstalls,
  ]);

  for (const app of remoteApps) {
    if (!changedMediaInstalls.has(app.app.installId)) {
      continue;
    }

    for (const file of input.remoteArchive.mediaFiles) {
      if (app.media.objects.some((object) => object.archivePath === file.archivePath)) {
        changedStatePaths.add(path.posix.join(input.manifest.media.root, file.archivePath));
      }
    }
  }

  if (changedMediaInstalls.size > 0 && input.remoteArchive.mediaFiles.length > 0) {
    changedStatePaths.add(
      path.posix.join(input.manifest.media.root, WORKSPACE_MEDIA_MANIFEST_FILE),
    );
  }

  for (const mediaPath of localMediaPaths) {
    if (!remoteMediaPaths.has(mediaPath)) {
      changedStatePaths.add(mediaPath);
      prunedStatePaths.add(mediaPath);
    }
  }

  if (
    input.remoteArchive.archive.controlPlane === undefined &&
    input.localControlPlane !== undefined
  ) {
    const instancePath = instanceWorkspaceInstanceStateRelativePath(input.manifest);

    changedStatePaths.add(instancePath);
    prunedStatePaths.add(instancePath);
  }

  const sortedChangedStatePaths = [...changedStatePaths].sort((left, right) =>
    left.localeCompare(right),
  );

  return {
    changedStatePaths: sortedChangedStatePaths,
    prunedStatePaths: [...prunedStatePaths].sort((left, right) => left.localeCompare(right)),
    status: sortedChangedStatePaths.length === 0 ? "no-changes" : "changes",
  };
}

async function listWorkspaceRelativeFiles(root: string, relativeRoot: string): Promise<string[]> {
  let entries: Dirent[];

  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const files: string[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryRoot = path.join(root, entry.name);
    const entryRelativePath = path.posix.join(relativeRoot, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listWorkspaceRelativeFiles(entryRoot, entryRelativePath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(entryRelativePath);
    }
  }

  return files;
}

function workspaceAppArchiveMediaFiles(
  directory: WorkspaceArchiveDirectory,
  app: AppArchive,
): ArchiveDiskMediaFile[] {
  const archivePaths = new Set(app.media.objects.map((object) => object.archivePath));

  return directory.mediaFiles.filter((file) => archivePaths.has(file.archivePath));
}

type WorkspaceMediaReference = {
  archivePath: string;
  ownerAppInstallId: string;
  reference: AppArchiveMediaReference;
  storageKey: string;
};

function programMediaReferences(
  controlPlane: WorkspaceControlPlaneRecords,
): WorkspaceMediaReference[] {
  const references: WorkspaceMediaReference[] = [];

  for (const reference of appArchiveMediaReferences(controlPlane.schema, controlPlane.records)) {
    if (reference.kind !== "image") {
      throw new Error(
        `Workspace Program state references installed-app document asset "${reference.assetId}".`,
      );
    }

    const facts = coreImageMediaDeliveryFactsForAssetId(reference.assetId);

    if (!facts) {
      throw new Error(
        `Workspace Program state references invalid image asset "${reference.assetId}".`,
      );
    }

    references.push({
      archivePath: `media/program/${facts.storageKey}`,
      ownerAppInstallId: "program",
      reference,
      storageKey: facts.storageKey,
    });
  }

  return references.sort(
    (left, right) =>
      left.storageKey.localeCompare(right.storageKey) ||
      left.reference.entity.localeCompare(right.reference.entity) ||
      left.reference.field.localeCompare(right.reference.field) ||
      left.reference.recordId.localeCompare(right.reference.recordId),
  );
}

function appMediaReferences(archive: AppArchive): WorkspaceMediaReference[] {
  const references: WorkspaceMediaReference[] = [];

  for (const reference of appArchiveMediaReferences(archive.data.schema, archive.data.records)) {
    const facts =
      reference.kind === "image"
        ? coreImageMediaDeliveryFactsForAssetId(reference.assetId)
        : documentMediaDeliveryFactsForAssetId(reference.assetId, {
            hrefForAssetId: (assetId) =>
              `/api/app-installs/${archive.app.packageAppKey}/${archive.app.installId}/media/documents/${assetId}`,
            ownerAppInstallId: archive.app.installId,
          });

    if (!facts) {
      throw new Error(
        `Workspace app state ${archive.app.installId} references invalid ${reference.kind} asset "${reference.assetId}".`,
      );
    }

    references.push({
      archivePath: `media/${archive.app.installId}/${facts.storageKey}`,
      ownerAppInstallId: archive.app.installId,
      reference,
      storageKey: facts.storageKey,
    });
  }

  return references.sort(
    (left, right) =>
      left.storageKey.localeCompare(right.storageKey) ||
      left.reference.entity.localeCompare(right.reference.entity) ||
      left.reference.field.localeCompare(right.reference.field) ||
      left.reference.recordId.localeCompare(right.reference.recordId),
  );
}

function validateWorkspaceMediaObjects(input: {
  files: Awaited<ReturnType<typeof readInstanceWorkspaceMediaFiles>>["mediaFiles"];
  objects: AppArchive["media"]["objects"];
  references: WorkspaceMediaReference[];
}) {
  const objectsByArchivePath = new Map(input.objects.map((object) => [object.archivePath, object]));
  const filesByArchivePath = new Map(input.files.map((file) => [file.archivePath, file]));

  for (const reference of input.references) {
    const object = objectsByArchivePath.get(reference.archivePath);
    const file = filesByArchivePath.get(reference.archivePath);

    if (!object || !file) {
      continue;
    }

    if (object.storageKey !== reference.storageKey) {
      throw new Error(
        `Workspace media metadata for referenced asset "${reference.reference.assetId}" is unavailable or incompatible.`,
      );
    }

    if (reference.reference.kind !== "document") {
      continue;
    }

    const asset = object.asset;

    if (
      !isDocumentMediaAsset(asset) ||
      asset.id !== reference.reference.assetId ||
      asset.storageKey !== object.storageKey ||
      asset.deliveryHref !== object.deliveryHref ||
      asset.contentType !== object.contentType ||
      asset.byteSize !== object.byteSize ||
      !documentMediaAssetIsCompatible(asset, {
        acceptedMimeTypes: reference.reference.policy.acceptedMimeTypes,
        access: reference.reference.policy.access,
        maxBytes: reference.reference.policy.maxBytes,
        ownerAppInstallId: reference.ownerAppInstallId,
      }) ||
      asset.ownerAppInstallId !== reference.ownerAppInstallId
    ) {
      throw new Error(
        `Workspace document metadata for referenced asset "${reference.reference.assetId}" is incompatible with its schema field.`,
      );
    }

    const validation = validatePdfDocumentMediaFile(
      {
        bytes: file.bytes,
        contentType: file.contentType,
        filename: asset.filename,
        size: file.byteSize,
      },
      {
        acceptedMimeTypes: reference.reference.policy.acceptedMimeTypes,
        maxBytes: reference.reference.policy.maxBytes,
      },
    );

    if (!validation.ok) {
      throw new Error(
        `Workspace document payload for referenced asset "${reference.reference.assetId}" is invalid.`,
      );
    }
  }
}

function workspaceAppStateMatches(
  expected: WorkspaceAppStateArchive,
  actual: WorkspaceAppStateArchive | undefined,
): boolean {
  if (!actual) {
    return false;
  }

  return (
    comparableAppRecordStateJson(actual.appArchive) ===
      comparableAppRecordStateJson(expected.appArchive) &&
    comparableAppMediaJson(actual, actual.appArchive) ===
      comparableAppMediaJson(expected, expected.appArchive)
  );
}

function createWorkspaceSyncPlan(input: {
  domainDesiredDrift: FormlessInstanceWorkspaceDomainDesiredDrift[];
  localControlPlane: WorkspaceControlPlaneRecords | undefined;
  localAppState: ReadonlyMap<string, WorkspaceAppStateArchive>;
  localDomains: readonly FormlessInstanceWorkspaceDomainIntent[];
  localProgramMedia: WorkspaceProgramMediaSource;
  manifest: FormlessResolvedConfig;
  packageResolver: AppPackageResolver;
  remoteArchive: WorkspaceArchiveDirectory;
  remoteDomains: readonly FormlessInstanceWorkspaceDomainIntent[];
  sourceLabel: string;
  sourceSide: "local" | "remote";
  targetLabel: string;
}): FormlessInstanceWorkspaceSyncPlan {
  const remoteApps = archiveApps(input.remoteArchive.archive);
  const remoteAppsByInstall = new Map(remoteApps.map((app) => [app.app.installId, app]));
  const localApps = controlPlaneAppInstallRecords(input.localControlPlane);
  const localAppsByInstall = new Map(localApps.map((app) => [app.installId, app]));
  const changedStatePaths = new Set<string>();
  const changedControlPlaneRecords = new Set<string>();
  const changedMedia = new Set<string>();
  const changedRecords = new Set<string>();
  const packageMismatches: FormlessInstanceWorkspacePackageMismatch[] = [];
  const remoteControlPlane =
    input.remoteArchive.archive.kind === INSTANCE_ARCHIVE_KIND
      ? input.remoteArchive.archive.controlPlane
      : undefined;
  const remoteProgramMedia: WorkspaceProgramMediaSource =
    input.remoteArchive.archive.kind === INSTANCE_ARCHIVE_KIND
      ? programMediaFromInstanceArchive({
          ...input.remoteArchive,
          archive: input.remoteArchive.archive,
        })
      : { mediaFiles: [], missingMediaFiles: [], objects: [] };
  const missingInstalls = localApps
    .filter((app) => !remoteAppsByInstall.has(app.installId))
    .map((app) => app.installId)
    .sort((left, right) => left.localeCompare(right));
  const extraInstalls = remoteApps
    .filter((app) => !localAppsByInstall.has(app.app.installId))
    .map((app) => app.app.installId)
    .sort((left, right) => left.localeCompare(right));

  for (const installId of missingInstalls) {
    const app = localAppsByInstall.get(installId);

    if (app) {
      changedStatePaths.add(instanceWorkspaceAppStateRelativePath(input.manifest, app.installId));
    }
  }

  for (const remoteApp of remoteApps) {
    const localApp = localAppsByInstall.get(remoteApp.app.installId);

    if (!localApp) {
      continue;
    }

    const statePath = instanceWorkspaceAppStateRelativePath(input.manifest, localApp.installId);
    const localState = input.localAppState.get(remoteApp.app.installId);

    if (!localState) {
      changedStatePaths.add(statePath);
      continue;
    }

    if (workspaceAppPackageFactsDiffer(localState.appArchive.app, remoteApp.app)) {
      packageMismatches.push(
        workspaceAppPackageMismatch(
          remoteApp.app.installId,
          localState.appArchive.app,
          remoteApp.app,
        ),
      );
      changedStatePaths.add(statePath);
      continue;
    }

    if (
      comparableAppRecordStateJson(localState.appArchive) !==
      comparableAppRecordStateJson(remoteApp)
    ) {
      changedRecords.add(remoteApp.app.installId);
      changedStatePaths.add(statePath);
    }

    if (
      comparableAppMediaJson(localState, localState.appArchive) !==
      comparableAppMediaJson(input.remoteArchive, remoteApp)
    ) {
      changedMedia.add(remoteApp.app.installId);
      changedStatePaths.add(statePath);
    }
  }

  if (remoteControlPlane !== undefined) {
    for (const recordKey of changedControlPlaneIntentRecordKeys(
      input.localControlPlane,
      remoteControlPlane,
      input.packageResolver,
    )) {
      changedControlPlaneRecords.add(recordKey);
      changedStatePaths.add(instanceWorkspaceInstanceStateRelativePath(input.manifest));
    }
  }

  if (
    comparableMediaJson(input.localProgramMedia, input.localProgramMedia.objects) !==
    comparableMediaJson(remoteProgramMedia, remoteProgramMedia.objects)
  ) {
    changedMedia.add("program");
    changedStatePaths.add(
      path.posix.join(input.manifest.media.root, WORKSPACE_MEDIA_MANIFEST_FILE),
    );

    for (const archivePath of new Set([
      ...input.localProgramMedia.objects.map((object) => object.archivePath),
      ...remoteProgramMedia.objects.map((object) => object.archivePath),
    ])) {
      changedStatePaths.add(path.posix.join(input.manifest.media.root, archivePath));
    }
  }

  const localAppArchivePayloads = [...input.localAppState.values()].map(
    (state) => state.appArchive,
  );
  const changedDomainCount =
    input.domainDesiredDrift.length > 0
      ? input.domainDesiredDrift.length
      : comparableWorkspaceDomainIntentsJson(input.localDomains) ===
          comparableWorkspaceDomainIntentsJson(input.remoteDomains)
        ? 0
        : Math.max(input.localDomains.length, input.remoteDomains.length);
  const changedAreas = workspaceSyncPlanChangedAreas({
    changedControlPlaneRecordCount: changedControlPlaneRecords.size,
    changedDomainCount,
    changedMediaCount: changedMedia.size,
    changedRecordCount: changedRecords.size,
    extraInstallCount: extraInstalls.length,
    missingInstallCount: missingInstalls.length,
    packageMismatchCount: packageMismatches.length,
  });
  const localEndpoint = workspaceSyncPlanEndpoint({
    appCount: localApps.length,
    apps: localApps.map((app) =>
      comparableWorkspaceSyncApp(
        app.installId,
        input.localAppState.get(app.installId),
        app.packageAppKey,
      ),
    ),
    controlPlane: input.localControlPlane,
    controlPlaneRecordCount: input.localControlPlane?.records.length ?? 0,
    domains: input.localDomains,
    label: input.sourceSide === "local" ? input.sourceLabel : input.targetLabel,
    mediaCount:
      input.localProgramMedia.objects.length +
      localAppArchivePayloads.reduce((count, app) => count + app.media.objects.length, 0),
    packageResolver: input.packageResolver,
    programMediaJson: comparableMediaJson(input.localProgramMedia, input.localProgramMedia.objects),
    recordCount: localAppArchivePayloads.reduce((count, app) => count + archiveRecordCount(app), 0),
  });
  const remoteControlPlaneRecordCount = remoteControlPlane?.records.length ?? 0;
  const remoteEndpoint = workspaceSyncPlanEndpoint({
    appCount: remoteApps.length,
    apps: remoteApps.map((app) =>
      comparableWorkspaceSyncApp(
        app.app.installId,
        workspaceSyncComparableAppSource(input.remoteArchive, app),
      ),
    ),
    controlPlane: remoteControlPlane,
    controlPlaneRecordCount: remoteControlPlaneRecordCount,
    domains: input.remoteDomains,
    label: input.sourceSide === "remote" ? input.sourceLabel : input.targetLabel,
    mediaCount:
      remoteProgramMedia.objects.length +
      remoteApps.reduce((count, app) => count + app.media.objects.length, 0),
    packageResolver: input.packageResolver,
    programMediaJson: comparableMediaJson(remoteProgramMedia, remoteProgramMedia.objects),
    recordCount: remoteApps.reduce((count, app) => count + archiveRecordCount(app), 0),
  });
  const source = input.sourceSide === "local" ? localEndpoint : remoteEndpoint;
  const target = input.sourceSide === "local" ? remoteEndpoint : localEndpoint;

  return {
    changedAreas,
    changedStatePaths: [...changedStatePaths].sort((left, right) => left.localeCompare(right)),
    changedControlPlaneRecords: [...changedControlPlaneRecords].sort((left, right) =>
      left.localeCompare(right),
    ),
    changedDomainCount,
    domainDesiredDrift: input.domainDesiredDrift,
    changedMedia: [...changedMedia].sort((left, right) => left.localeCompare(right)),
    changedRecords: [...changedRecords].sort((left, right) => left.localeCompare(right)),
    extraInstalls,
    missingInstalls,
    packageMismatches: packageMismatches.sort((left, right) =>
      left.installId.localeCompare(right.installId),
    ),
    source,
    target,
    status: source.fingerprint === target.fingerprint ? "up-to-date" : "changes",
  };
}

function createWorkspaceForcedRecoverySyncPlan(input: {
  domainDesiredDrift: FormlessInstanceWorkspaceDomainDesiredDrift[];
  failure: WorkspacePushRemoteArchiveReadFailure;
  localControlPlane: WorkspaceControlPlaneRecords | undefined;
  localAppState: ReadonlyMap<string, WorkspaceAppStateArchive>;
  localDomains: readonly FormlessInstanceWorkspaceDomainIntent[];
  localProgramMedia: WorkspaceProgramMediaSource;
  manifest: FormlessResolvedConfig;
  packageResolver: AppPackageResolver;
  targetLabel: string;
}): FormlessInstanceWorkspaceSyncPlan {
  const localApps = controlPlaneAppInstallRecords(input.localControlPlane);
  const localAppArchivePayloads = [...input.localAppState.values()].map(
    (state) => state.appArchive,
  );
  const changedStatePaths = new Set<string>(
    localApps.map((app) => instanceWorkspaceAppStateRelativePath(input.manifest, app.installId)),
  );
  const changedControlPlaneRecords = new Set<string>(
    comparableControlPlaneIntentRecords(input.localControlPlane, input.packageResolver).keys(),
  );
  const changedRecords = new Set<string>();
  const changedMedia = new Set<string>();

  if (changedControlPlaneRecords.size > 0) {
    changedStatePaths.add(instanceWorkspaceInstanceStateRelativePath(input.manifest));
  }

  for (const archive of localAppArchivePayloads) {
    if (archiveRecordCount(archive) > 0) {
      changedRecords.add(archive.app.installId);
    }

    if (archive.media.objects.length > 0) {
      changedMedia.add(archive.app.installId);
    }
  }

  if (input.localProgramMedia.objects.length > 0) {
    changedMedia.add("program");
    changedStatePaths.add(
      path.posix.join(input.manifest.media.root, WORKSPACE_MEDIA_MANIFEST_FILE),
    );
    for (const object of input.localProgramMedia.objects) {
      changedStatePaths.add(path.posix.join(input.manifest.media.root, object.archivePath));
    }
  }

  const changedDomainCount =
    input.domainDesiredDrift.length > 0
      ? input.domainDesiredDrift.length
      : input.localDomains.length;
  const changedAreas = workspaceSyncPlanChangedAreas({
    changedControlPlaneRecordCount: changedControlPlaneRecords.size,
    changedDomainCount,
    changedMediaCount: changedMedia.size,
    changedRecordCount: changedRecords.size,
    extraInstallCount: 0,
    missingInstallCount: localApps.length,
    packageMismatchCount: 0,
  });
  const source = workspaceSyncPlanEndpoint({
    appCount: localApps.length,
    apps: localApps.map((app) =>
      comparableWorkspaceSyncApp(
        app.installId,
        input.localAppState.get(app.installId),
        app.packageAppKey,
      ),
    ),
    controlPlane: input.localControlPlane,
    controlPlaneRecordCount: input.localControlPlane?.records.length ?? 0,
    domains: input.localDomains,
    label: "workspace",
    mediaCount:
      input.localProgramMedia.objects.length +
      localAppArchivePayloads.reduce((count, app) => count + app.media.objects.length, 0),
    packageResolver: input.packageResolver,
    programMediaJson: comparableMediaJson(input.localProgramMedia, input.localProgramMedia.objects),
    recordCount: localAppArchivePayloads.reduce((count, app) => count + archiveRecordCount(app), 0),
  });
  const target: FormlessInstanceWorkspaceSyncPlanEndpoint = {
    appCount: 0,
    controlPlaneRecordCount: 0,
    domainCount: 0,
    fingerprint: workspaceSyncFingerprint({
      message: input.failure.message,
      reason: "remote-archive-parse-or-validation-failed",
      target: input.targetLabel,
    }),
    label: input.targetLabel,
    mediaCount: 0,
    recordCount: 0,
  };

  return {
    changedAreas,
    changedControlPlaneRecords: [...changedControlPlaneRecords].sort((left, right) =>
      left.localeCompare(right),
    ),
    changedDomainCount,
    changedMedia: [...changedMedia].sort((left, right) => left.localeCompare(right)),
    changedRecords: [...changedRecords].sort((left, right) => left.localeCompare(right)),
    changedStatePaths: [...changedStatePaths].sort((left, right) => left.localeCompare(right)),
    domainDesiredDrift: input.domainDesiredDrift,
    extraInstalls: [],
    missingInstalls: localApps
      .map((app) => app.installId)
      .sort((left, right) => left.localeCompare(right)),
    packageMismatches: [],
    source,
    status: "changes",
    target,
  };
}

function workspaceSyncPlanChangedAreas(input: {
  changedControlPlaneRecordCount: number;
  changedDomainCount: number;
  changedMediaCount: number;
  changedRecordCount: number;
  extraInstallCount: number;
  missingInstallCount: number;
  packageMismatchCount: number;
}): FormlessInstanceWorkspaceSyncPlanChangedArea[] {
  const areas: FormlessInstanceWorkspaceSyncPlanChangedArea[] = [];

  if (input.extraInstallCount > 0 || input.missingInstallCount > 0) {
    areas.push("apps");
  }

  if (input.changedControlPlaneRecordCount > 0) {
    areas.push("control-plane");
  }

  if (input.changedDomainCount > 0) {
    areas.push("domains");
  }

  if (input.changedMediaCount > 0) {
    areas.push("media");
  }

  if (input.packageMismatchCount > 0) {
    areas.push("packages");
  }

  if (input.changedRecordCount > 0) {
    areas.push("records");
  }

  return areas;
}

function workspaceSyncPlanEndpoint(input: {
  appCount: number;
  apps: WorkspaceSyncComparableApp[];
  controlPlane: WorkspaceControlPlaneRecords | undefined;
  controlPlaneRecordCount: number;
  domains: readonly FormlessInstanceWorkspaceDomainIntent[];
  label: string;
  mediaCount: number;
  packageResolver: AppPackageResolver;
  programMediaJson: string;
  recordCount: number;
}): FormlessInstanceWorkspaceSyncPlanEndpoint {
  return {
    appCount: input.appCount,
    controlPlaneRecordCount: input.controlPlaneRecordCount,
    domainCount: input.domains.length,
    fingerprint: workspaceSyncFingerprint({
      apps: [...input.apps].sort((left, right) => left.installId.localeCompare(right.installId)),
      controlPlane: comparableControlPlaneIntentRecordsJson(
        input.controlPlane,
        input.packageResolver,
      ),
      domains: comparableWorkspaceDomainIntentsJson(input.domains),
      programMedia: input.programMediaJson,
    }),
    label: input.label,
    mediaCount: input.mediaCount,
    recordCount: input.recordCount,
  };
}

type WorkspaceSyncComparableApp = {
  installId: string;
  mediaJson: string | null;
  missingState: boolean;
  packageAppKey: string;
  packageRevision: number | null;
  recordsJson: string | null;
  sourceSchemaHash: string | null;
  sourceSchemaKey: string | null;
};

type WorkspaceSyncComparableAppSource = {
  appArchive: AppArchive;
  mediaFiles: ArchiveDiskMediaFile[];
  missingMediaFiles: string[];
};

function comparableWorkspaceSyncApp(
  installId: string,
  archive: WorkspaceSyncComparableAppSource | undefined,
  packageAppKey = "missing",
): WorkspaceSyncComparableApp {
  if (archive === undefined) {
    return {
      installId,
      mediaJson: null,
      missingState: true,
      packageAppKey,
      packageRevision: null,
      recordsJson: null,
      sourceSchemaHash: null,
      sourceSchemaKey: null,
    };
  }

  return {
    installId,
    mediaJson: comparableAppMediaJson(archive, archive.appArchive),
    missingState: false,
    packageAppKey: archive.appArchive.app.packageAppKey,
    packageRevision: archive.appArchive.app.packageRevision,
    recordsJson: comparableAppRecordStateJson(archive.appArchive),
    sourceSchemaHash: archive.appArchive.app.sourceSchemaHash,
    sourceSchemaKey: archive.appArchive.app.sourceSchemaKey,
  };
}

function workspaceAppPackageFactsDiffer(
  left: AppArchive["app"],
  right: AppArchive["app"],
): boolean {
  return (
    left.packageAppKey !== right.packageAppKey ||
    left.packageRevision !== right.packageRevision ||
    left.sourceSchemaHash !== right.sourceSchemaHash ||
    left.sourceSchemaKey !== right.sourceSchemaKey
  );
}

function workspaceAppPackageMismatch(
  installId: string,
  local: AppArchive["app"],
  remote: AppArchive["app"],
): FormlessInstanceWorkspacePackageMismatch {
  return {
    installId,
    localPackageAppKey: local.packageAppKey,
    localPackageRevision: local.packageRevision,
    localSourceSchemaHash: local.sourceSchemaHash,
    localSourceSchemaKey: local.sourceSchemaKey,
    remotePackageAppKey: remote.packageAppKey,
    remotePackageRevision: remote.packageRevision,
    remoteSourceSchemaHash: remote.sourceSchemaHash,
    remoteSourceSchemaKey: remote.sourceSchemaKey,
  };
}

function workspaceSyncComparableAppSource(
  directory: WorkspaceArchiveDirectory,
  app: AppArchive,
): WorkspaceSyncComparableAppSource {
  return {
    appArchive: app,
    mediaFiles: workspaceAppArchiveMediaFiles(directory, app),
    missingMediaFiles: directory.missingMediaFiles,
  };
}

function comparableWorkspaceDomainIntentsJson(
  domains: readonly FormlessInstanceWorkspaceDomainIntent[],
): string {
  return JSON.stringify(
    stableValue(
      [...domains].sort(compareWorkspaceDomainIntents).map((domain) => ({
        enabled: domain.enabled,
        host: domain.host,
        profile: domain.profile,
        targetInstallId: domain.targetInstallId ?? null,
      })),
    ),
  );
}

function workspaceSyncFingerprint(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex")}`;
}

function changedControlPlaneIntentRecordKeys(
  local: WorkspaceControlPlaneRecords | undefined,
  remote: WorkspaceControlPlaneRecords,
  packageResolver: AppPackageResolver,
): string[] {
  const localRecords = comparableControlPlaneIntentRecords(local, packageResolver);
  const remoteRecords = comparableControlPlaneIntentRecords(remote, packageResolver);
  const keys = new Set([...localRecords.keys(), ...remoteRecords.keys()]);
  const changed: string[] = [];

  for (const key of keys) {
    if (localRecords.get(key) !== remoteRecords.get(key)) {
      changed.push(key);
    }
  }

  return changed.sort((left, right) => left.localeCompare(right));
}

function comparableControlPlaneIntentRecords(
  controlPlane: WorkspaceControlPlaneRecords | undefined,
  packageResolver: AppPackageResolver,
): Map<string, string> {
  const records = new Map<string, string>();

  for (const record of comparableProgramWorkspaceRecords(controlPlane?.records ?? [])) {
    records.set(
      controlPlaneRecordKey(record),
      JSON.stringify(
        stableValue({
          deleted: record.deletedAt !== undefined,
          entity: record.entity,
          id: record.id,
          values: comparableControlPlaneValues(record, packageResolver),
        }),
      ),
    );
  }

  return records;
}

function comparableProgramWorkspaceRecords(records: readonly StoredRecord[]): StoredRecord[] {
  const dormantInstallIds = new Set(
    records.flatMap((record) => {
      const packageAppKey =
        controlPlaneRecordEntity(record) === "app-install"
          ? stringRecordValue(record, "packageAppKey")
          : undefined;

      return packageAppKey !== undefined && !isRuntimeInstallableAppPackageKey(packageAppKey)
        ? [record.id]
        : [];
    }),
  );

  return records.filter((record) => {
    if (programSiteEntityKeys.has(record.entity)) {
      return true;
    }

    const entity = controlPlaneRecordEntity(record);

    if (record.deletedAt !== undefined || entity === undefined) {
      return false;
    }

    if (entity === "app-install") {
      return !dormantInstallIds.has(record.id);
    }

    return (
      entity !== "route" || !dormantInstallIds.has(stringRecordValue(record, "appInstall") ?? "")
    );
  });
}

function comparableControlPlaneIntentRecordsJson(
  controlPlane: WorkspaceControlPlaneRecords | undefined,
  packageResolver: AppPackageResolver,
): string {
  return JSON.stringify(
    [...comparableControlPlaneIntentRecords(controlPlane, packageResolver).entries()].sort(
      ([left], [right]) => left.localeCompare(right),
    ),
  );
}

function comparableControlPlaneValues(
  record: StoredRecord,
  packageResolver: AppPackageResolver,
): RecordValues {
  const values = Object.fromEntries(
    Object.entries(record.values).filter(
      ([fieldName]) =>
        fieldName !== "createdAt" &&
        fieldName !== "updatedAt" &&
        (controlPlaneRecordEntity(record) !== "deployment-config" ||
          !deploymentConfigObservedFieldSet.has(fieldName)),
    ),
  ) as RecordValues;

  if (record.entity === "app-install" && typeof values.packageAppKey === "string") {
    const packageFacts = packageAppFactsForKey(values.packageAppKey, packageResolver);

    if (packageFacts) {
      values.packageRevision ??= packageFacts.packageRevision;
      values.sourceSchemaHash ??= packageFacts.sourceSchemaHash;
    }
  }

  return values;
}

function controlPlaneRecordKey(record: Pick<StoredRecord, "entity" | "id">) {
  const entityName = isInstanceControlPlaneEntityName(record.entity)
    ? formatInstanceControlPlaneBoundaryEntityName(record.entity)
    : record.entity;

  return `${entityName}:${record.id}`;
}

function comparableAppRecordStateJson(archive: AppArchive): string {
  const data = normalizeGeneratedArchiveTimestamps(archive).data;

  return JSON.stringify(
    stableValue({
      schemaKey: data.schemaKey,
      schemaProvenance: workspaceSchemaProvenanceForAppArchive(archive),
      storageIdentity: data.storageIdentity,
      records: [...data.records].sort(compareRecordsByEntityAndId),
    }),
  );
}

function compareRecordsByEntityAndId(
  left: Pick<StoredRecord, "entity" | "id">,
  right: Pick<StoredRecord, "entity" | "id">,
): number {
  const entityOrder = left.entity.localeCompare(right.entity);

  return entityOrder === 0 ? left.id.localeCompare(right.id) : entityOrder;
}

function comparableAppMediaJson(
  source: WorkspaceArchiveMediaComparisonSource,
  archive: AppArchive,
): string {
  return comparableMediaJson(source, archive.media.objects);
}

function comparableMediaJson(
  source: WorkspaceArchiveMediaComparisonSource,
  objects: readonly AppArchiveMediaObject[],
): string {
  const bytesByArchivePath = new Map(
    source.mediaFiles.map((file) => [file.archivePath, Buffer.from(file.bytes).toString("base64")]),
  );
  const missing = new Set(source.missingMediaFiles);
  const media = objects
    .map((object) => ({
      archivePath: object.archivePath,
      byteSize: object.byteSize,
      bytesBase64: bytesByArchivePath.get(object.archivePath) ?? null,
      contentType: object.contentType,
      deliveryHref: object.deliveryHref,
      missing: missing.has(object.archivePath),
      ...(object.asset === undefined ? {} : { asset: object.asset }),
      storageKey: object.storageKey,
    }))
    .sort((left, right) => {
      const storageKeyOrder = left.storageKey.localeCompare(right.storageKey);

      return storageKeyOrder === 0
        ? left.archivePath.localeCompare(right.archivePath)
        : storageKeyOrder;
    });

  return JSON.stringify(stableValue(media));
}

function workspaceMediaFilesWithObjects(
  directory: WorkspaceArchiveDirectory,
): Array<ArchiveDiskMediaFile & { object: AppArchive["media"]["objects"][number] }> {
  const objectsByArchivePath = new Map(
    archiveMediaObjects(directory.archive).map((object) => [object.archivePath, object] as const),
  );

  return directory.mediaFiles.map((file) => {
    const object = objectsByArchivePath.get(file.archivePath);

    if (!object) {
      throw new Error(`Workspace media file "${file.archivePath}" is missing object metadata.`);
    }

    return { ...file, object };
  });
}

function normalizeGeneratedArchiveTimestamps<T extends PortableArchive>(archive: T): T {
  const nextArchive = jsonClone(archive);
  const generatedAt = "1970-01-01T00:00:00.000Z";

  nextArchive.exportedAt = generatedAt;

  if (nextArchive.kind === INSTANCE_ARCHIVE_KIND) {
    nextArchive.apps = nextArchive.apps.map((app) => normalizeGeneratedArchiveTimestamps(app));

    if (nextArchive.controlPlane) {
      nextArchive.controlPlane.exportedAt = generatedAt;
      nextArchive.controlPlane.schemaUpdatedAt = generatedAt;
      nextArchive.controlPlane.sourceCursor = 0;
      nextArchive.controlPlane.records = comparableProgramWorkspaceRecords(
        nextArchive.controlPlane.records,
      ).map((record) => ({
        ...record,
        ...(record.deletedAt === undefined ? {} : { deletedAt: generatedAt }),
        values: withoutControlPlaneLifecycleValues(record.values),
        createdAt: generatedAt,
        updatedAt: generatedAt,
      }));
    }

    return nextArchive;
  }

  nextArchive.data.exportedAt = generatedAt;
  nextArchive.data.schemaUpdatedAt = generatedAt;
  nextArchive.data.sourceCursor = 0;

  return nextArchive;
}

export type WorkspacePushSourceSyncDependencies = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  now: () => string;
};

export type PrepareWorkspacePushSourceSyncInput = {
  adminToken: string | null;
  archiveRoot: string;
  existingSelectedTarget?: FormlessInstanceWorkspaceTarget;
  force?: boolean;
  forcedRecoveryStatus: PushFormlessInstanceWorkspaceForcedRecoveryPlan["status"];
  manifest: FormlessResolvedConfig;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  tempRoot: string;
  workspaceRoot: string;
};

export type PrepareWorkspacePushSourceSyncResult = {
  archiveRoot: string;
  forcedRecovery?: PushFormlessInstanceWorkspaceForcedRecoveryPlan;
  hasDataChanges: boolean;
  packageResolver: AppPackageResolver;
  source: PushFormlessInstanceWorkspaceSource;
  syncPlan: FormlessInstanceWorkspaceSyncPlan;
};

export async function prepareWorkspacePushSourceSync(
  input: PrepareWorkspacePushSourceSyncInput,
  dependencies: WorkspacePushSourceSyncDependencies,
): Promise<PrepareWorkspacePushSourceSyncResult> {
  const activePackages = await createActiveWorkspaceAppPackages(
    input.workspaceRoot,
    input.manifest,
  );
  const localControlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest: input.manifest,
    packageResolver: activePackages.resolver,
    workspaceRoot: input.workspaceRoot,
  });

  assertWorkspaceControlPlanePackagesAvailable({
    controlPlane: localControlPlane,
    operation: "push",
    packageResolver: activePackages.resolver,
  });

  const localDomainIntents = workspaceDomainIntentsFromSource(localControlPlane);
  const liveDomains =
    input.existingSelectedTarget === undefined
      ? []
      : await readLiveWorkspaceDomainIntents(
          {
            adminToken: input.adminToken,
            target: input.selectedTarget,
          },
          dependencies,
        );
  const domainDesiredDrift = shouldCompareWorkspaceDomainIntents(localDomainIntents, liveDomains)
    ? compareWorkspaceDomainIntentToLive(localDomainIntents, liveDomains)
    : [];
  const localAppState = await readWorkspaceAppStateForPush(
    input.workspaceRoot,
    input.manifest,
    localControlPlane,
    activePackages,
  );
  const localProgramMedia = await workspaceProgramMediaFromSnapshot({
    controlPlane: localControlPlane,
    manifest: input.manifest,
    workspaceRoot: input.workspaceRoot,
  });
  assertWorkspaceProgramMediaComplete(localProgramMedia, "push");
  const source = await writeComposedWorkspacePushArchive({
    archiveRoot: input.archiveRoot,
    appState: localAppState,
    controlPlane: localControlPlane,
    exportedAt: dependencies.now(),
    packageResolver: activePackages.resolver,
    programMedia: localProgramMedia,
  });

  await assertWorkspacePushArchiveReadable({
    archiveRoot: input.archiveRoot,
    packageResolver: activePackages.resolver,
  });

  const remoteRead =
    input.existingSelectedTarget === undefined
      ? {
          archive: emptyRemoteInstanceArchiveDirectory(dependencies.now()),
          status: "readable" as const,
        }
      : await readRemoteWorkspaceArchiveForPush(
          {
            allowForcedRecovery: input.force === true,
            adminToken: input.adminToken,
            packageResolver: activePackages.resolver,
            remoteArchiveRoot: path.join(input.tempRoot, "remote-check"),
            selectedTarget: input.selectedTarget,
          },
          dependencies,
        );
  const localAppStateByInstall = new Map(
    localAppState.map((state) => [state.appArchive.app.installId, state]),
  );
  const syncPlan =
    remoteRead.status === "readable"
      ? createWorkspaceSyncPlan({
          domainDesiredDrift,
          localControlPlane,
          localAppState: localAppStateByInstall,
          localProgramMedia,
          localDomains: localDomainIntents,
          manifest: input.manifest,
          packageResolver: activePackages.resolver,
          remoteArchive: remoteRead.archive,
          remoteDomains: liveDomains,
          sourceLabel: "workspace",
          sourceSide: "local",
          targetLabel: input.selectedTarget.alias,
        })
      : createWorkspaceForcedRecoverySyncPlan({
          domainDesiredDrift,
          failure: remoteRead.failure,
          localControlPlane,
          localAppState: localAppStateByInstall,
          localDomains: localDomainIntents,
          localProgramMedia,
          manifest: input.manifest,
          packageResolver: activePackages.resolver,
          targetLabel: input.selectedTarget.alias,
        });
  const forcedRecovery =
    remoteRead.status === "unreadable"
      ? forcedRecoveryPlanFromRemoteReadFailure(remoteRead.failure, {
          status: input.forcedRecoveryStatus,
        })
      : undefined;

  return {
    archiveRoot: input.archiveRoot,
    ...(forcedRecovery === undefined ? {} : { forcedRecovery }),
    hasDataChanges: syncPlan.status !== "up-to-date",
    packageResolver: activePackages.resolver,
    source,
    syncPlan,
  };
}

export async function restoreWorkspacePushSourceArchive(
  input: {
    adminToken: string | null;
    apply: boolean;
    archiveRoot: string;
    packageResolver: AppPackageResolver;
    selectedTarget: FormlessInstanceWorkspaceTarget;
  },
  dependencies: WorkspacePushSourceSyncDependencies,
): Promise<RestorePortableArchiveResult> {
  return restoreWorkspacePushArchive(
    {
      adminToken: input.adminToken,
      apply: input.apply,
      archiveDir: input.archiveRoot,
      packageResolver: input.packageResolver,
      target: input.selectedTarget.url,
    },
    dependencies,
  );
}

async function readWorkspaceAppStateForPush(
  workspaceRoot: string,
  manifest: FormlessResolvedConfig,
  controlPlane: WorkspaceControlPlaneRecords | undefined,
  activePackages: ActiveWorkspaceAppPackages,
): Promise<WorkspaceAppStateArchive[]> {
  return readRequiredWorkspaceAppState({
    activePackages,
    controlPlane,
    manifest,
    operation: "push",
    workspaceRoot,
  });
}

async function readRequiredWorkspaceAppState(input: {
  activePackages: ActiveWorkspaceAppPackages;
  controlPlane: WorkspaceControlPlaneRecords | undefined;
  manifest: FormlessResolvedConfig;
  operation: "local dev" | "push";
  workspaceRoot: string;
}): Promise<WorkspaceAppStateArchive[]> {
  const appState: WorkspaceAppStateArchive[] = [];

  for (const app of controlPlaneAppInstallRecords(input.controlPlane)) {
    const statePath = instanceWorkspaceAppStateRelativePath(input.manifest, app.installId);
    const state = await readWorkspaceAppStateForCheck({
      activePackages: input.activePackages,
      install: app,
      manifest: input.manifest,
      workspaceRoot: input.workspaceRoot,
    });

    validateRequiredWorkspaceAppState({
      install: app,
      operation: input.operation,
      packageResolver: input.activePackages.resolver,
      state,
      statePath,
    });

    appState.push(state as WorkspaceAppStateArchive);
  }

  return appState.sort((left, right) =>
    left.appArchive.app.installId.localeCompare(right.appArchive.app.installId),
  );
}

function validateRequiredWorkspaceAppState(input: {
  install: WorkspaceControlPlaneAppInstallRecord;
  operation: "local dev" | "push";
  packageResolver: AppPackageResolver;
  state: WorkspaceAppStateArchive | undefined;
  statePath: string;
}): asserts input is {
  install: WorkspaceControlPlaneAppInstallRecord;
  operation: "local dev" | "push";
  packageResolver: AppPackageResolver;
  state: WorkspaceAppStateArchive;
  statePath: string;
} {
  const prefix = `Formless instance ${input.operation}`;

  if (!input.state) {
    throw new Error(`${prefix} requires local app state ${input.statePath}.`);
  }

  const archiveApp = input.state.appArchive.app;

  if (archiveApp.installId !== input.install.installId) {
    throw new Error(
      `${prefix} app state ${input.statePath} has install id "${archiveApp.installId}", expected "${input.install.installId}".`,
    );
  }

  if (archiveApp.packageAppKey !== input.install.packageAppKey) {
    throw new Error(
      `${prefix} app state ${input.statePath} has package "${archiveApp.packageAppKey}", expected "${input.install.packageAppKey}".`,
    );
  }

  const packageApp = findResolvedAppPackage(input.install.packageAppKey, input.packageResolver);

  if (!packageApp) {
    throw new Error(
      `${prefix} app install "${input.install.installId}" references unsupported package "${input.install.packageAppKey}".`,
    );
  }

  if (
    input.install.packageRevision !== undefined &&
    input.install.packageRevision !== packageApp.packageRevision
  ) {
    throw new Error(
      `${prefix} app install "${input.install.installId}" has package revision ${input.install.packageRevision}, expected ${packageApp.packageRevision}.`,
    );
  }

  if (
    input.install.sourceSchemaHash !== undefined &&
    input.install.sourceSchemaHash !== packageApp.sourceSchemaHash
  ) {
    throw new Error(
      `${prefix} app install "${input.install.installId}" has source schema hash "${input.install.sourceSchemaHash}", expected "${packageApp.sourceSchemaHash}".`,
    );
  }

  if (archiveApp.packageRevision !== packageApp.packageRevision) {
    throw new Error(
      `${prefix} app state ${input.statePath} has package revision ${archiveApp.packageRevision}, expected ${packageApp.packageRevision}.`,
    );
  }

  if (archiveApp.sourceSchemaKey !== packageApp.sourceSchemaKey) {
    throw new Error(
      `${prefix} app state ${input.statePath} has source schema key "${archiveApp.sourceSchemaKey}", expected "${packageApp.sourceSchemaKey}".`,
    );
  }

  if (archiveApp.sourceSchemaHash !== packageApp.sourceSchemaHash) {
    throw new Error(
      `${prefix} app state ${input.statePath} has source schema hash "${archiveApp.sourceSchemaHash}", expected "${packageApp.sourceSchemaHash}".`,
    );
  }

  validateWorkspaceAppStateMediaReferences({
    operation: input.operation,
    state: input.state,
    statePath: input.statePath,
  });
}

function validateWorkspaceAppStateMediaReferences(input: {
  operation: "local dev" | "push";
  state: WorkspaceAppStateArchive;
  statePath: string;
}) {
  const prefix = `Formless instance ${input.operation}`;

  if (input.state.missingMediaFiles.length > 0) {
    throw new Error(
      `${prefix} app state ${input.statePath} is missing media files: ${input.state.missingMediaFiles.join(", ")}.`,
    );
  }

  const mediaFilesByPath = new Map(input.state.mediaFiles.map((file) => [file.archivePath, file]));
  const seenArchivePaths = new Set<string>();

  for (const object of input.state.appArchive.media.objects) {
    if (seenArchivePaths.has(object.archivePath)) {
      throw new Error(
        `${prefix} app state ${input.statePath} has duplicate media file "${object.archivePath}".`,
      );
    }

    seenArchivePaths.add(object.archivePath);

    const file = mediaFilesByPath.get(object.archivePath);

    if (!file) {
      throw new Error(
        `${prefix} app state ${input.statePath} is missing media file "${object.archivePath}".`,
      );
    }

    if (file.byteSize !== object.byteSize) {
      throw new Error(
        `${prefix} app state ${input.statePath} media file "${object.archivePath}" has ${file.byteSize} bytes, expected ${object.byteSize}.`,
      );
    }
  }
}

async function writeComposedWorkspacePushArchive(input: {
  archiveRoot: string;
  appState: readonly WorkspaceAppStateArchive[];
  controlPlane?: WorkspaceControlPlaneRecords;
  exportedAt: string;
  packageResolver: AppPackageResolver;
  programMedia: WorkspaceProgramMediaSource;
}): Promise<PushFormlessInstanceWorkspaceSource> {
  const appArchives = input.appState.map((state) => state.appArchive);
  const instanceArchive: InstanceArchive = {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: input.exportedAt,
    capabilities: [
      "installed-app-registry",
      ...(input.controlPlane === undefined ? [] : ["schema-owned-control-plane" as const]),
      "app-store-snapshots",
      "core-media-assets",
    ],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    ...(input.controlPlane === undefined
      ? {}
      : { controlPlane: controlPlaneSnapshotForArchive(input.controlPlane, input.exportedAt) }),
    media: { objects: input.programMedia.objects },
    apps: appArchives,
  };
  return writePortableArchiveDirectory(
    {
      archive: instanceArchive,
      mediaFiles: [
        ...input.programMedia.mediaFiles,
        ...input.appState.flatMap((state) => state.mediaFiles),
      ],
      outDir: input.archiveRoot,
      packageResolver: input.packageResolver,
    },
    { cwd: "/" },
  );
}

export function workspacePushBackupPath(workspaceRoot: string, timestamp: string): string {
  return path.join(workspaceRoot, ".formless/backups", `push-${safeTimestamp(timestamp)}`);
}

function safeTimestamp(timestamp: string): string {
  return timestamp.replace(/[^0-9A-Za-z]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function readLiveWorkspaceDomainIntents(
  input: {
    adminToken?: string | null;
    target: FormlessInstanceWorkspaceTarget;
  },
  dependencies: { fetch: typeof fetch },
): Promise<FormlessInstanceWorkspaceDomainIntent[]> {
  const controlPlane = await readFormlessInstanceControlPlaneRecords(
    { adminToken: input.adminToken, actorKind: "cliDeployer", targetUrl: input.target.url },
    dependencies,
  );

  return controlPlane.domainMappings
    .filter((record) => !record.deletedAt)
    .map(workspaceDomainIntentFromRouteRecord)
    .sort(compareWorkspaceDomainIntents);
}

export function workspaceDomainIntentsFromSource(
  controlPlane: WorkspaceControlPlaneRecords | undefined,
): FormlessInstanceWorkspaceDomainIntent[] {
  return (controlPlane?.records ?? [])
    .filter(
      (record) =>
        !record.deletedAt &&
        record.entity === "route" &&
        stringRecordValue(record, "kind") === "mount" &&
        stringRecordValue(record, "matchHost") !== undefined,
    )
    .map(workspaceDomainIntentFromRouteRecord)
    .sort(compareWorkspaceDomainIntents);
}

function shouldCompareWorkspaceDomainIntents(
  localDomainIntents: readonly FormlessInstanceWorkspaceDomainIntent[],
  liveDomains: readonly FormlessInstanceWorkspaceDomainIntent[],
): boolean {
  return localDomainIntents.length > 0 || liveDomains.length > 0;
}

function workspaceDomainIntentFromRouteRecord(record: {
  id: string;
  values: Record<string, unknown>;
}): FormlessInstanceWorkspaceDomainIntent {
  const host = stringRecordValue(record, "matchHost");
  const profile = workspaceDomainProfileFromRouteTargetProfile(
    stringRecordValue(record, "targetProfile"),
  );
  const targetInstallId = stringRecordValue(record, "appInstall");

  if (host === undefined) {
    throw new Error(`Workspace route "${record.id}" is missing matchHost.`);
  }

  if (profile !== "instance" && targetInstallId === undefined) {
    throw new Error(`Workspace route "${record.id}" profile "${profile}" is missing appInstall.`);
  }

  return {
    enabled: booleanRecordValue(record, "enabled") ?? true,
    host,
    profile,
    ...(targetInstallId === undefined ? {} : { targetInstallId }),
  };
}

function workspaceDomainProfileFromRouteTargetProfile(
  targetProfile: string | undefined,
): FormlessInstanceWorkspaceDomainIntent["profile"] {
  switch (targetProfile) {
    case "app":
    case "instance":
      return targetProfile;
    case "public-site":
      return "publicSite";
    default:
      throw new Error(`Workspace domain route targetProfile is invalid: ${targetProfile ?? ""}`);
  }
}

function compareWorkspaceDomainIntents(
  left: FormlessInstanceWorkspaceDomainIntent,
  right: FormlessInstanceWorkspaceDomainIntent,
): number {
  return (
    left.host.localeCompare(right.host) ||
    left.profile.localeCompare(right.profile) ||
    (left.targetInstallId ?? "").localeCompare(right.targetInstallId ?? "")
  );
}

export function selectDomainIntentsForHost(input: {
  host?: string | null;
  intents: readonly CloudflareDomainIntent[];
}): CloudflareDomainIntent[] {
  if (input.host === undefined || input.host === null || input.host.trim() === "") {
    return [...input.intents];
  }

  const host = normalizeInstanceDomainHost(input.host);

  if (!host.ok) {
    throw new Error(host.error.message);
  }

  const intents = input.intents.filter((intent) => intent.host === host.host);

  if (intents.length === 0) {
    throw new Error(`No desired domain mapping found for host "${host.host}".`);
  }

  return intents;
}

export function compareWorkspaceDomainIntentToLive(
  workspaceDomains: readonly FormlessInstanceWorkspaceDomainIntent[],
  liveDomains: readonly FormlessInstanceWorkspaceDomainIntent[],
): FormlessInstanceWorkspaceDomainDesiredDrift[] {
  const workspaceByHost = new Map(workspaceDomains.map((domain) => [domain.host, domain]));
  const liveByHost = new Map(liveDomains.map((domain) => [domain.host, domain]));
  const hosts = new Set([...workspaceByHost.keys(), ...liveByHost.keys()]);
  const drift: FormlessInstanceWorkspaceDomainDesiredDrift[] = [];

  for (const host of [...hosts].sort((left, right) => left.localeCompare(right))) {
    const local = workspaceByHost.get(host);
    const live = liveByHost.get(host);

    if (local && !live) {
      drift.push({
        host,
        local,
        status: "local-only",
      });
      continue;
    }

    if (!local && live) {
      drift.push({
        host,
        live,
        status: "live-only",
      });
      continue;
    }

    if (local && live && !workspaceDomainIntentsEqual(local, live)) {
      drift.push({
        host,
        live,
        local,
        status: "mismatch",
      });
    }
  }

  return drift;
}

function workspaceDomainIntentsEqual(
  left: FormlessInstanceWorkspaceDomainIntent,
  right: FormlessInstanceWorkspaceDomainIntent,
): boolean {
  return (
    left.enabled === right.enabled &&
    left.host === right.host &&
    left.profile === right.profile &&
    left.targetInstallId === right.targetInstallId
  );
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]),
  );
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function readWorkspaceLocalAuthorityAdminToken(
  workspaceRoot: string,
  manifest: FormlessResolvedConfig,
  dependencies: { env?: NodeJS.ProcessEnv },
): Promise<string | null> {
  const envAdminToken = resolveFormlessInstanceWorkspaceAdminToken({ env: dependencies.env });

  if (envAdminToken) {
    return envAdminToken;
  }

  const localDevSecretState = await readFormlessInstanceWorkspaceLocalDevSecretState(
    formlessInstanceWorkspaceLocalStateRoot(workspaceRoot, manifest),
  );
  const localDevAdminToken = resolveFormlessInstanceWorkspaceAdminToken({
    explicitAdminToken: localDevSecretState.adminToken,
  });

  if (localDevAdminToken) {
    return localDevAdminToken;
  }

  return readWorkspaceAdminToken(workspaceRoot, dependencies);
}

async function readWorkspaceAdminToken(
  workspaceRoot: string,
  dependencies: { env?: NodeJS.ProcessEnv },
): Promise<string | null> {
  const secretState = await readFormlessInstanceWorkspaceSecretState(workspaceRoot);

  return resolveFormlessInstanceWorkspaceAdminToken({
    env: dependencies.env,
    secretState,
  });
}

async function prepareWorkspaceDirectories(
  workspaceRoot: string,
  manifest: FormlessResolvedConfig,
) {
  await mkdir(path.join(workspaceRoot, manifest.local.stateRoot), { recursive: true });
}
