import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  ARCHIVE_VERSION,
  InstanceArchiveValidationError,
  INSTANCE_ARCHIVE_KIND,
  archiveMediaReferences,
  instanceArchiveMediaPath,
  type ArchiveMediaObject,
  type ArchiveMediaReference,
  type InstanceArchive,
} from "../program/archive.ts";
import {
  writeInstanceArchiveDirectory,
  type ArchiveDiskWriteResult,
} from "../program/archive-node.ts";
import {
  coreImageMediaDeliveryFactsForAssetId,
  documentMediaAssetIsCompatible,
  documentMediaDeliveryFactsForAssetId,
  isDocumentMediaAsset,
  validatePdfDocumentMediaFile,
} from "@dpeek/formless-media";
import { normalizeInstanceDomainHost } from "../shared/instance-domain-mappings.ts";
import {
  formatInstanceControlPlaneBoundaryEntityName,
  instanceControlPlaneDeploymentConfigObservedFields,
  isInstanceControlPlaneEntityName,
} from "@dpeek/formless-instance-control-plane";
import {
  canonicalizeFormlessProgramStorageSnapshot,
  formlessProgramSchemaProvenance,
  parseFormlessProgramSchemaArtifact,
} from "../program/runtime.ts";
import type { FormlessProgramArtifact } from "../program/artifact.ts";
import { canonicalJsonStringify, type AppSchema, type FieldSchema } from "@dpeek/formless-schema";
import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
import {
  WORKSPACE_MEDIA_MANIFEST_FILE,
  normalizeInstanceWorkspaceTargetUrl as normalizeFormlessInstanceWorkspaceTargetUrl,
  type InstanceWorkspaceDomainIntent as FormlessInstanceWorkspaceDomainIntent,
  type ResolvedFormlessConfig as FormlessResolvedConfig,
  type InstanceWorkspaceTarget as FormlessInstanceWorkspaceTarget,
} from "@dpeek/formless-workspace";
import {
  instanceWorkspaceInstanceStateRelativePath,
  readInstanceWorkspaceProgramStorageSnapshot,
  readInstanceWorkspaceLocalDevSecretState as readFormlessInstanceWorkspaceLocalDevSecretState,
  readInstanceWorkspaceMediaFiles,
  readInstanceWorkspaceSecretState as readFormlessInstanceWorkspaceSecretState,
  replaceInstanceWorkspaceMediaFiles,
  resolveInstanceWorkspaceAdminToken as resolveFormlessInstanceWorkspaceAdminToken,
  workspaceMediaPayloadPathForArchivePath,
  writeInstanceWorkspaceProgramStorageSnapshot,
} from "../program/workspace.ts";
import {
  formatCliDeploymentStatus,
  type CliDeploymentStatusDisplay,
} from "./cli-deployment-status-formatter.ts";
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
  CurrentTargetArchiveSourceValidationError,
  exportCurrentTargetInstanceArchive,
  restoreWorkspacePushArchive,
  type RestoreInstanceArchiveResult,
} from "./archive-workflows.ts";
import {
  activeWorkspaceProgramArtifact,
  createWorkspaceTempRoot,
  formlessInstanceWorkspaceLocalStateRoot,
  readWorkspaceConfig,
  resolveFormlessInstanceWorkspaceRoot,
} from "./instance-workspace-foundation.ts";
import {
  booleanRecordValue,
  controlPlaneSnapshotForArchive,
  readArchiveDirectoryForCheck,
  stringRecordValue,
  workspaceControlPlaneSnapshotFromRecords,
  type WorkspaceArchiveDirectory,
  type WorkspaceArchiveMediaComparisonSource,
  type WorkspaceControlPlaneRecords,
} from "./instance-workspace-control-plane.ts";

const deploymentConfigObservedFieldSet = new Set<string>(
  instanceControlPlaneDeploymentConfigObservedFields,
);

type WorkspaceLocalDevState = {
  sourceUrl: string;
  startedAt: string;
};

type WorkspaceLocalRestoreArchiveSource = {
  archiveRoot: string;
  mediaCount: number;
  recordCount: number;
  sourceKind: "storage state";
};

type WorkspaceProgramMediaSource = WorkspaceArchiveMediaComparisonSource & {
  manifestPayloadPaths: string[];
  objects: ArchiveMediaObject[];
  requiresLayoutAdoption: boolean;
  unreferencedManifestPayloadPaths: string[];
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

export type PullFormlessInstanceWorkspaceReplacementPlan = {
  changedStatePaths: string[];
  prunedStatePaths: string[];
  status: "changes" | "no-changes";
};

export type PullFormlessInstanceWorkspaceResult = {
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

export type FormlessInstanceWorkspaceSyncPlanChangedArea = "domains" | "media" | "records";

export type FormlessInstanceWorkspaceSyncPlanEndpoint = {
  domainCount: number;
  fingerprint: string;
  label: string;
  mediaCount: number;
  programProvenance?: FormlessProgramArtifact["schemaProvenance"];
  recordCount: number;
};

export type FormlessInstanceWorkspaceSyncPlan = {
  changedAreas: FormlessInstanceWorkspaceSyncPlanChangedArea[];
  changedStatePaths: string[];
  changedDomainCount: number;
  domainDesiredDrift: FormlessInstanceWorkspaceDomainDesiredDrift[];
  changedMedia: string[];
  changedRecords: string[];
  source: FormlessInstanceWorkspaceSyncPlanEndpoint;
  target: FormlessInstanceWorkspaceSyncPlanEndpoint;
  status: "changes" | "up-to-date";
};

export type CheckFormlessInstanceWorkspaceResult = {
  deploymentStatus?: CliDeploymentStatusDisplay;
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
  mediaCount: number;
  recordCount: number;
  statePath: string;
};

export type SaveLocalFormlessWorkspaceResult = {
  config: FormlessResolvedConfig;
  configPath: string;
  instanceState: FormlessInstanceWorkspaceStateSummary;
  mode: "check" | "write";
  source: string;
  workspaceRoot: string;
};

export type PushFormlessInstanceWorkspaceSource = {
  archivePath: string;
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

export type WorkspacePushSchemaCompatibilityIssue = {
  code:
    | "current-record-materialization-required"
    | "entity-identity-changed"
    | "entity-set-changed"
    | "field-set-changed"
    | "field-storage-contract-changed"
    | "stored-constraint-changed";
  message: string;
};

export type WorkspacePushSchemaCompatibilityDecision =
  | {
      issues: [];
      status: "storage-compatible" | "unchanged";
    }
  | {
      issues: WorkspacePushSchemaCompatibilityIssue[];
      status: "migration-required";
    };

export class WorkspacePushSchemaCompatibilityError extends Error {
  readonly decision: Extract<
    WorkspacePushSchemaCompatibilityDecision,
    { status: "migration-required" }
  >;

  constructor(
    decision: Extract<WorkspacePushSchemaCompatibilityDecision, { status: "migration-required" }>,
  ) {
    super(
      `Formless instance push requires explicit schema evolution: ${decision.issues
        .map((issue) => issue.message)
        .join("; ")}.`,
    );
    this.name = "WorkspacePushSchemaCompatibilityError";
    this.decision = decision;
  }
}

export class WorkspacePushRemoteRestoreError extends Error {
  readonly apply: boolean;
  readonly remote: RestoreInstanceArchiveResult["remote"];
  readonly target: string;

  constructor(input: {
    apply: boolean;
    remote: RestoreInstanceArchiveResult["remote"];
    target: string;
  }) {
    const details =
      input.remote.errors?.map((error) => error.message).join("; ") ?? "unknown remote error";
    super(
      `Formless instance push remote restore ${input.apply ? "apply" : "dry-run"} failed: ${details}.`,
    );
    this.name = "WorkspacePushRemoteRestoreError";
    this.apply = input.apply;
    this.remote = input.remote;
    this.target = input.target;
  }
}

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
  const programArtifact = await activeWorkspaceProgramArtifact(config);
  const tempRoot = await createWorkspaceTempRoot(workspaceRoot, "pull");

  try {
    const instanceArchiveRoot = path.join(tempRoot, "instance");

    const exportedTarget = await exportCurrentTargetInstanceArchive(
      {
        adminToken,
        outDir: instanceArchiveRoot,
        target: selectedTarget.url,
      },
      dependencies,
    );
    const pulledInstanceArchive = await readArchiveDirectoryForCheck(instanceArchiveRoot, {
      programSchema: exportedTarget.programSchema,
      programSchemaProvenance: exportedTarget.programSchemaProvenance,
    });

    if (!pulledInstanceArchive || pulledInstanceArchive.archive.kind !== INSTANCE_ARCHIVE_KIND) {
      throw new Error("Formless instance pull did not write an instance archive.");
    }

    const pulledInstanceDirectory: WorkspaceArchiveDirectory = {
      ...pulledInstanceArchive,
      archive: pulledInstanceArchive.archive,
    };

    const localControlPlane = await readInstanceWorkspaceProgramStorageSnapshot({
      manifest: config,
      workspaceRoot,
    });
    const localDomainIntents = workspaceDomainIntentsFromSource(localControlPlane);
    const domains = await readLiveWorkspaceDomainIntents(
      { adminToken, target: selectedTarget },
      dependencies,
    );
    const domainDesiredDrift = shouldCompareWorkspaceDomainIntents(localDomainIntents, domains)
      ? compareWorkspaceDomainIntentToLive(localDomainIntents, domains)
      : [];
    const localProgramMedia = await workspaceProgramMediaFromSnapshot({
      controlPlane: localControlPlane,
      manifest: config,
      workspaceRoot,
    });
    const syncPlan = createWorkspaceSyncPlan({
      domainDesiredDrift,
      localControlPlane,
      localProgramProvenance: programArtifact.schemaProvenance,
      localProgramMedia,
      localDomains: localDomainIntents,
      manifest: config,
      remoteArchive: pulledInstanceDirectory,
      remoteDomains: domains,
      sourceLabel: selectedTarget.alias,
      sourceSide: "remote",
      targetLabel: "workspace",
    });
    const replacement = await pullWorkspaceReplacementPlan({
      localControlPlane,
      localProgramMedia,
      manifest: config,
      remoteArchive: pulledInstanceDirectory,
      syncPlan,
      workspaceRoot,
    });
    const instanceState: FormlessInstanceWorkspaceStateSummary = {
      mediaCount: pulledInstanceArchive.archive.media.objects.length,
      recordCount: pulledInstanceArchive.archive.program.snapshot.records.length,
      statePath: path.join(workspaceRoot, instanceWorkspaceInstanceStateRelativePath(config)),
    };
    const noop = replacement.status === "no-changes";

    if (input.dryRun || noop) {
      return {
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
    await writeInstanceWorkspaceProgramStorageSnapshot({
      manifest: config,
      snapshot: pulledInstanceArchive.archive.program.snapshot,
      sourceLabel: "Instance archive Program",
      validationContext: "Instance archive Program records",
      workspaceRoot,
    });

    const programMedia = programMediaFromInstanceArchive(pulledInstanceDirectory);
    await replaceInstanceWorkspaceMediaFiles({
      manifest: config,
      mediaFiles: workspaceProgramMediaFiles(programMedia),
      workspaceRoot,
    });

    return {
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
  const programArtifact = await activeWorkspaceProgramArtifact(config);
  const tempRoot = await createWorkspaceTempRoot(workspaceRoot, "check");

  try {
    const remoteArchiveRoot = path.join(tempRoot, "instance");

    const exportedTarget = await exportCurrentTargetInstanceArchive(
      {
        adminToken,
        outDir: remoteArchiveRoot,
        target: selectedTarget.url,
      },
      dependencies,
    );

    const remoteArchive = await readArchiveDirectoryForCheck(remoteArchiveRoot, {
      programSchema: exportedTarget.programSchema,
      programSchemaProvenance: exportedTarget.programSchemaProvenance,
    });

    if (!remoteArchive || remoteArchive.archive.kind !== INSTANCE_ARCHIVE_KIND) {
      throw new Error("Formless instance check did not write a remote instance archive.");
    }

    const localControlPlane = await readInstanceWorkspaceProgramStorageSnapshot({
      manifest: config,
      workspaceRoot,
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
    const localProgramMedia = await workspaceProgramMediaFromSnapshot({
      controlPlane: localControlPlane,
      manifest: config,
      workspaceRoot,
    });

    return {
      deploymentStatus: formatCliDeploymentStatus(deploymentStatus.status),
      syncPlan: createWorkspaceSyncPlan({
        domainDesiredDrift,
        localControlPlane,
        localProgramProvenance: programArtifact.schemaProvenance,
        localProgramMedia,
        localDomains: localDomainIntents,
        manifest: config,
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
        source,
        tempRoot,
      },
      dependencies,
    );
    const currentControlPlane = await readInstanceWorkspaceProgramStorageSnapshot({
      manifest: config,
      workspaceRoot,
    });
    const sourceControlPlane = savedAuthorityControlPlaneForWorkspaceSource({
      current: currentControlPlane,
      exported: exported.archive.program.snapshot,
    });
    const instanceStatePath = path.join(
      workspaceRoot,
      instanceWorkspaceInstanceStateRelativePath(config),
    );
    const result: SaveLocalFormlessWorkspaceResult = {
      config,
      configPath,
      instanceState: {
        mediaCount: exported.archive.media.objects.length,
        recordCount: sourceControlPlane?.records.length ?? 0,
        statePath: instanceStatePath,
      },
      mode: input.check ? "check" : "write",
      source,
      workspaceRoot,
    };

    if (input.check) {
      const stalePaths = await staleSavedWorkspaceSourcePaths({
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
      config,
      exported,
      sourceControlPlane,
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
    remoteArchiveRoot: string;
    selectedTarget: FormlessInstanceWorkspaceTarget;
  },
  dependencies: WorkspacePushSourceSyncDependencies,
): Promise<WorkspacePushRemoteArchiveReadResult> {
  try {
    const exportedTarget = await exportCurrentTargetInstanceArchive(
      {
        adminToken: input.adminToken,
        outDir: input.remoteArchiveRoot,
        target: input.selectedTarget.url,
      },
      dependencies,
    );

    const remoteArchive = await readArchiveDirectoryForCheck(input.remoteArchiveRoot, {
      programSchema: exportedTarget.programSchema,
      programSchemaProvenance: exportedTarget.programSchemaProvenance,
    });

    if (!remoteArchive || remoteArchive.archive.kind !== INSTANCE_ARCHIVE_KIND) {
      throw new Error("Formless instance push could not read remote archive state.");
    }

    return {
      archive: remoteArchive,
      programSchema: exportedTarget.programSchema,
      programSchemaProvenance: exportedTarget.programSchemaProvenance,
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
  programArtifact: FormlessProgramArtifact;
}): Promise<void> {
  const archive = await readArchiveDirectoryForCheck(input.archiveRoot, {
    programArtifact: input.programArtifact,
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
      programSchema?: AppSchema;
      programSchemaProvenance?: FormlessProgramArtifact["schemaProvenance"];
      status: "readable";
    }
  | {
      failure: WorkspacePushRemoteArchiveReadFailure;
      status: "unreadable";
    };

function classifyForcedPushRemoteArchiveReadFailure(
  error: unknown,
): WorkspacePushRemoteArchiveReadFailure | undefined {
  if (error instanceof CurrentTargetArchiveSourceValidationError) {
    return {
      message: error.message,
      type: error.failureType,
    };
  }

  if (error instanceof SyntaxError) {
    return {
      message: error.message,
      type: "parse",
    };
  }

  if (!(error instanceof Error)) {
    return undefined;
  }

  if (error instanceof InstanceArchiveValidationError) {
    return {
      message: error.message,
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
      capabilities: ["core-media-assets"],
      restorePolicy: { dryRun: true },
      program: {
        schemaProvenance: formlessProgramSchemaProvenance,
        snapshot: controlPlane,
      },
      media: { objects: [] },
    },
    archivePath: "",
    mediaFiles: [],
    missingMediaFiles: [],
  };
}

export async function workspaceLocalRestoreArchiveSource(input: {
  config: FormlessResolvedConfig;
  exportedAt: string;
  programArtifact: FormlessProgramArtifact;
  tempRoot: string;
  workspaceRoot: string;
}): Promise<WorkspaceLocalRestoreArchiveSource | undefined> {
  const controlPlane = await readInstanceWorkspaceProgramStorageSnapshot({
    manifest: input.config,
    workspaceRoot: input.workspaceRoot,
  });

  if (!controlPlane) {
    return undefined;
  }

  const reviewableControlPlane = canonicalizeFormlessProgramStorageSnapshot(controlPlane, {
    artifact: input.programArtifact,
  });
  const programMedia = await workspaceProgramMediaFromSnapshot({
    controlPlane: reviewableControlPlane,
    manifest: input.config,
    workspaceRoot: input.workspaceRoot,
  });
  assertWorkspaceProgramMediaComplete(programMedia, "local dev");
  const write = await writeComposedWorkspacePushArchive({
    archiveRoot: path.join(input.tempRoot, "archive"),
    exportedAt: input.exportedAt,
    programArtifact: input.programArtifact,
    programMedia,
    programSnapshot: reviewableControlPlane,
  });

  return {
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

async function exportWorkspaceSourceFromLocalAuthority(
  input: {
    adminToken?: string | null;
    source: string;
    tempRoot: string;
  },
  dependencies: SaveLocalFormlessWorkspaceDependencies,
): Promise<WorkspaceArchiveDirectory> {
  const archiveRoot = path.join(input.tempRoot, "authority");

  const exportedSource = await exportCurrentTargetInstanceArchive(
    {
      adminToken: input.adminToken,
      outDir: archiveRoot,
      target: input.source,
    },
    dependencies,
  );

  const directory = await readArchiveDirectoryForCheck(archiveRoot, {
    programSchema: exportedSource.programSchema,
    programSchemaProvenance: exportedSource.programSchemaProvenance,
  });

  if (!directory || directory.archive.kind !== INSTANCE_ARCHIVE_KIND) {
    throw new Error("Formless workspace save did not export an instance archive.");
  }

  return {
    ...directory,
    archive: directory.archive,
  };
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
  config: FormlessResolvedConfig;
  exported: WorkspaceArchiveDirectory;
  sourceControlPlane: WorkspaceControlPlaneRecords | undefined;
  workspaceRoot: string;
}): Promise<string[]> {
  const stalePaths = new Set<string>();

  const localControlPlane = await readInstanceWorkspaceProgramStorageSnapshot({
    manifest: input.config,
    workspaceRoot: input.workspaceRoot,
  });

  if (
    comparableProgramRecordsJson(localControlPlane) !==
    comparableProgramRecordsJson(input.sourceControlPlane)
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
    localProgramMedia.requiresLayoutAdoption ||
    localProgramMedia.unreferencedManifestPayloadPaths.length > 0 ||
    comparableMediaJson(localProgramMedia, localProgramMedia.objects) !==
      comparableMediaJson(expectedProgramMedia, expectedProgramMedia.objects)
  ) {
    stalePaths.add(path.posix.join(input.config.media.root, WORKSPACE_MEDIA_MANIFEST_FILE));

    for (const archivePath of new Set([
      ...localProgramMedia.objects.map((object) => object.archivePath),
      ...expectedProgramMedia.objects.map((object) => object.archivePath),
    ])) {
      stalePaths.add(workspaceMediaStatePath(input.config, archivePath));
    }

    for (const payloadPath of localProgramMedia.manifestPayloadPaths) {
      stalePaths.add(path.posix.join(input.config.media.root, payloadPath));
    }
  }

  return [...stalePaths].sort((left, right) => left.localeCompare(right));
}

async function writeSavedWorkspaceSource(input: {
  config: FormlessResolvedConfig;
  exported: WorkspaceArchiveDirectory;
  sourceControlPlane: WorkspaceControlPlaneRecords | undefined;
  workspaceRoot: string;
}) {
  await prepareWorkspaceDirectories(input.workspaceRoot, input.config);
  await writeInstanceWorkspaceProgramStorageSnapshot({
    manifest: input.config,
    snapshot: input.sourceControlPlane,
    workspaceRoot: input.workspaceRoot,
  });
  const programMedia = programMediaFromInstanceArchive(input.exported);
  await replaceInstanceWorkspaceMediaFiles({
    manifest: input.config,
    mediaFiles: workspaceProgramMediaFiles(programMedia),
    workspaceRoot: input.workspaceRoot,
  });
}

async function workspaceProgramMediaFromSnapshot(input: {
  controlPlane: WorkspaceControlPlaneRecords | undefined;
  manifest: FormlessResolvedConfig;
  workspaceRoot: string;
}): Promise<WorkspaceProgramMediaSource> {
  if (input.controlPlane === undefined) {
    return {
      manifestPayloadPaths: [],
      mediaFiles: [],
      missingMediaFiles: [],
      objects: [],
      requiresLayoutAdoption: false,
      unreferencedManifestPayloadPaths: [],
    };
  }

  const references = programMediaReferences(input.controlPlane);
  const diskMedia = await readInstanceWorkspaceMediaFiles({
    archivePaths: references.map((reference) => reference.archivePath),
    manifest: input.manifest,
    workspaceRoot: input.workspaceRoot,
  });
  const objects = diskMedia.mediaFiles.map((file) => file.object as ArchiveMediaObject);

  validateWorkspaceMediaObjects({
    files: diskMedia.mediaFiles,
    objects,
    references,
  });

  return {
    manifestPayloadPaths: diskMedia.manifestPayloadPaths,
    mediaFiles: diskMedia.mediaFiles.map(({ object: _, ...file }) => file),
    missingMediaFiles: diskMedia.missingMediaFiles,
    objects,
    requiresLayoutAdoption: diskMedia.requiresLayoutAdoption,
    unreferencedManifestPayloadPaths: diskMedia.unreferencedManifestPayloadPaths,
  };
}

function programMediaFromInstanceArchive(
  directory: WorkspaceArchiveDirectory,
): WorkspaceProgramMediaSource {
  const archivePaths = new Set(directory.archive.media.objects.map((object) => object.archivePath));

  return {
    manifestPayloadPaths: directory.mediaFiles
      .filter((file) => archivePaths.has(file.archivePath))
      .map((file) => workspaceMediaPayloadPathForArchivePath(file.archivePath)),
    mediaFiles: directory.mediaFiles.filter((file) => archivePaths.has(file.archivePath)),
    missingMediaFiles: directory.missingMediaFiles.filter((archivePath) =>
      archivePaths.has(archivePath),
    ),
    objects: directory.archive.media.objects,
    requiresLayoutAdoption: false,
    unreferencedManifestPayloadPaths: [],
  };
}

function workspaceProgramMediaFiles(media: WorkspaceProgramMediaSource) {
  const objectsByPath = new Map(media.objects.map((object) => [object.archivePath, object]));
  return media.mediaFiles.map((file) => ({
    ...file,
    object: objectsByPath.get(file.archivePath),
    payloadPath: workspaceMediaPayloadPathForArchivePath(file.archivePath),
  }));
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

async function pullWorkspaceReplacementPlan(input: {
  localControlPlane: WorkspaceControlPlaneRecords | undefined;
  localProgramMedia: WorkspaceProgramMediaSource;
  manifest: FormlessResolvedConfig;
  remoteArchive: WorkspaceArchiveDirectory;
  syncPlan: FormlessInstanceWorkspaceSyncPlan;
  workspaceRoot: string;
}): Promise<PullFormlessInstanceWorkspaceReplacementPlan> {
  const changedStatePaths = new Set(input.syncPlan.changedStatePaths);
  const prunedStatePaths = new Set<string>();
  const remoteProgramMedia = programMediaFromInstanceArchive(input.remoteArchive);
  const remoteMediaPaths = new Set(
    remoteProgramMedia.mediaFiles.map((file) =>
      workspaceMediaStatePath(input.manifest, file.archivePath),
    ),
  );
  if (remoteProgramMedia.mediaFiles.length > 0) {
    remoteMediaPaths.add(path.posix.join(input.manifest.media.root, WORKSPACE_MEDIA_MANIFEST_FILE));
  }
  if (input.syncPlan.changedMedia.includes("program")) {
    for (const mediaPath of remoteMediaPaths) {
      changedStatePaths.add(mediaPath);
    }
  }

  const localMediaPaths = new Set(
    input.localProgramMedia.manifestPayloadPaths.map((payloadPath) =>
      path.posix.join(input.manifest.media.root, payloadPath),
    ),
  );

  if (
    input.syncPlan.changedMedia.includes("program") ||
    input.localProgramMedia.requiresLayoutAdoption ||
    input.localProgramMedia.unreferencedManifestPayloadPaths.length > 0
  ) {
    for (const mediaPath of localMediaPaths) {
      if (!remoteMediaPaths.has(mediaPath)) {
        prunedStatePaths.add(mediaPath);
      }
    }

    for (const payloadPath of input.localProgramMedia.unreferencedManifestPayloadPaths) {
      prunedStatePaths.add(path.posix.join(input.manifest.media.root, payloadPath));
    }

    const manifestPath = path.posix.join(input.manifest.media.root, WORKSPACE_MEDIA_MANIFEST_FILE);

    if (remoteProgramMedia.mediaFiles.length === 0) {
      if (input.localProgramMedia.manifestPayloadPaths.length > 0) {
        prunedStatePaths.add(manifestPath);
      }
    } else if (input.localProgramMedia.requiresLayoutAdoption) {
      changedStatePaths.add(manifestPath);
      for (const mediaPath of remoteMediaPaths) {
        changedStatePaths.add(mediaPath);
      }
    }
  }

  for (const prunedStatePath of prunedStatePaths) {
    changedStatePaths.delete(prunedStatePath);
  }

  const sortedChangedStatePaths = [...changedStatePaths].sort((left, right) =>
    left.localeCompare(right),
  );
  const sortedPrunedStatePaths = [...prunedStatePaths].sort((left, right) =>
    left.localeCompare(right),
  );

  return {
    changedStatePaths: sortedChangedStatePaths,
    prunedStatePaths: sortedPrunedStatePaths,
    status:
      sortedChangedStatePaths.length === 0 && sortedPrunedStatePaths.length === 0
        ? "no-changes"
        : "changes",
  };
}

type WorkspaceMediaReference = {
  archivePath: string;
  reference: ArchiveMediaReference;
  storageKey: string;
};

function programMediaReferences(
  controlPlane: WorkspaceControlPlaneRecords,
): WorkspaceMediaReference[] {
  const references: WorkspaceMediaReference[] = [];

  for (const reference of archiveMediaReferences(controlPlane.schema, controlPlane.records)) {
    const facts =
      reference.kind === "image"
        ? coreImageMediaDeliveryFactsForAssetId(reference.assetId)
        : documentMediaDeliveryFactsForAssetId(reference.assetId, {
            hrefForAssetId: (assetId) => `/api/formless/program/media/documents/${assetId}`,
          });

    if (!facts) {
      throw new Error(
        `Workspace Program state references invalid ${reference.kind} asset "${reference.assetId}".`,
      );
    }

    const archivePath = instanceArchiveMediaPath(reference);

    if (!archivePath) {
      throw new Error(
        `Workspace Program state references invalid ${reference.kind} asset "${reference.assetId}".`,
      );
    }

    references.push({
      archivePath,
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
  objects: ArchiveMediaObject[];
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
      })
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

function createWorkspaceSyncPlan(input: {
  domainDesiredDrift: FormlessInstanceWorkspaceDomainDesiredDrift[];
  localControlPlane: WorkspaceControlPlaneRecords | undefined;
  localDomains: readonly FormlessInstanceWorkspaceDomainIntent[];
  localProgramProvenance: FormlessProgramArtifact["schemaProvenance"];
  localProgramMedia: WorkspaceProgramMediaSource;
  manifest: FormlessResolvedConfig;
  remoteArchive: WorkspaceArchiveDirectory;
  remoteDomains: readonly FormlessInstanceWorkspaceDomainIntent[];
  sourceLabel: string;
  sourceSide: "local" | "remote";
  targetLabel: string;
}): FormlessInstanceWorkspaceSyncPlan {
  const changedStatePaths = new Set<string>();
  const changedMedia = new Set<string>();
  const changedRecords = new Set<string>();
  const remoteControlPlane = input.remoteArchive.archive.program.snapshot;
  const remoteProgramMedia = programMediaFromInstanceArchive({
    ...input.remoteArchive,
    archive: input.remoteArchive.archive,
  });

  for (const recordKey of changedProgramRecordKeys(input.localControlPlane, remoteControlPlane)) {
    changedRecords.add(recordKey);
    changedStatePaths.add(instanceWorkspaceInstanceStateRelativePath(input.manifest));
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
      changedStatePaths.add(workspaceMediaStatePath(input.manifest, archivePath));
    }
  }

  const changedDomainCount =
    input.domainDesiredDrift.length > 0
      ? input.domainDesiredDrift.length
      : comparableWorkspaceDomainIntentsJson(input.localDomains) ===
          comparableWorkspaceDomainIntentsJson(input.remoteDomains)
        ? 0
        : Math.max(input.localDomains.length, input.remoteDomains.length);
  const changedAreas = workspaceSyncPlanChangedAreas({
    changedDomainCount,
    changedMediaCount: changedMedia.size,
    changedRecordCount: changedRecords.size,
  });
  const localEndpoint = workspaceSyncPlanEndpoint({
    controlPlane: input.localControlPlane,
    domains: input.localDomains,
    label: input.sourceSide === "local" ? input.sourceLabel : input.targetLabel,
    mediaCount: input.localProgramMedia.objects.length,
    programProvenance: input.localProgramProvenance,
    programMediaJson: comparableMediaJson(input.localProgramMedia, input.localProgramMedia.objects),
    recordCount: input.localControlPlane?.records.length ?? 0,
  });
  const remoteEndpoint = workspaceSyncPlanEndpoint({
    controlPlane: remoteControlPlane,
    domains: input.remoteDomains,
    label: input.sourceSide === "remote" ? input.sourceLabel : input.targetLabel,
    mediaCount: remoteProgramMedia.objects.length,
    programProvenance: input.remoteArchive.archive.program.schemaProvenance,
    programMediaJson: comparableMediaJson(remoteProgramMedia, remoteProgramMedia.objects),
    recordCount: remoteControlPlane.records.length,
  });
  const source = input.sourceSide === "local" ? localEndpoint : remoteEndpoint;
  const target = input.sourceSide === "local" ? remoteEndpoint : localEndpoint;

  return {
    changedAreas,
    changedStatePaths: [...changedStatePaths].sort((left, right) => left.localeCompare(right)),
    changedDomainCount,
    domainDesiredDrift: input.domainDesiredDrift,
    changedMedia: [...changedMedia].sort((left, right) => left.localeCompare(right)),
    changedRecords: [...changedRecords].sort((left, right) => left.localeCompare(right)),
    source,
    target,
    status: source.fingerprint === target.fingerprint ? "up-to-date" : "changes",
  };
}

function createWorkspaceForcedRecoverySyncPlan(input: {
  domainDesiredDrift: FormlessInstanceWorkspaceDomainDesiredDrift[];
  failure: WorkspacePushRemoteArchiveReadFailure;
  localControlPlane: WorkspaceControlPlaneRecords | undefined;
  localDomains: readonly FormlessInstanceWorkspaceDomainIntent[];
  localProgramProvenance: FormlessProgramArtifact["schemaProvenance"];
  localProgramMedia: WorkspaceProgramMediaSource;
  manifest: FormlessResolvedConfig;
  targetLabel: string;
}): FormlessInstanceWorkspaceSyncPlan {
  const changedStatePaths = new Set<string>();
  const changedRecords = new Set<string>(comparableProgramRecords(input.localControlPlane).keys());
  const changedMedia = new Set<string>();

  if (changedRecords.size > 0) {
    changedStatePaths.add(instanceWorkspaceInstanceStateRelativePath(input.manifest));
  }

  if (input.localProgramMedia.objects.length > 0) {
    changedMedia.add("program");
    changedStatePaths.add(
      path.posix.join(input.manifest.media.root, WORKSPACE_MEDIA_MANIFEST_FILE),
    );
    for (const object of input.localProgramMedia.objects) {
      changedStatePaths.add(workspaceMediaStatePath(input.manifest, object.archivePath));
    }
  }

  const changedDomainCount =
    input.domainDesiredDrift.length > 0
      ? input.domainDesiredDrift.length
      : input.localDomains.length;
  const changedAreas = workspaceSyncPlanChangedAreas({
    changedDomainCount,
    changedMediaCount: changedMedia.size,
    changedRecordCount: changedRecords.size,
  });
  const source = workspaceSyncPlanEndpoint({
    controlPlane: input.localControlPlane,
    domains: input.localDomains,
    label: "workspace",
    mediaCount: input.localProgramMedia.objects.length,
    programProvenance: input.localProgramProvenance,
    programMediaJson: comparableMediaJson(input.localProgramMedia, input.localProgramMedia.objects),
    recordCount: input.localControlPlane?.records.length ?? 0,
  });
  const target: FormlessInstanceWorkspaceSyncPlanEndpoint = {
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
    changedDomainCount,
    changedMedia: [...changedMedia].sort((left, right) => left.localeCompare(right)),
    changedRecords: [...changedRecords].sort((left, right) => left.localeCompare(right)),
    changedStatePaths: [...changedStatePaths].sort((left, right) => left.localeCompare(right)),
    domainDesiredDrift: input.domainDesiredDrift,
    source,
    status: "changes",
    target,
  };
}

function workspaceSyncPlanChangedAreas(input: {
  changedDomainCount: number;
  changedMediaCount: number;
  changedRecordCount: number;
}): FormlessInstanceWorkspaceSyncPlanChangedArea[] {
  const areas: FormlessInstanceWorkspaceSyncPlanChangedArea[] = [];

  if (input.changedDomainCount > 0) {
    areas.push("domains");
  }

  if (input.changedMediaCount > 0) {
    areas.push("media");
  }

  if (input.changedRecordCount > 0) {
    areas.push("records");
  }

  return areas;
}

function workspaceSyncPlanEndpoint(input: {
  controlPlane: WorkspaceControlPlaneRecords | undefined;
  domains: readonly FormlessInstanceWorkspaceDomainIntent[];
  label: string;
  mediaCount: number;
  programProvenance: FormlessProgramArtifact["schemaProvenance"];
  programMediaJson: string;
  recordCount: number;
}): FormlessInstanceWorkspaceSyncPlanEndpoint {
  return {
    domainCount: input.domains.length,
    fingerprint: workspaceSyncFingerprint({
      program: comparableProgramRecordsJson(input.controlPlane),
      programProvenance: input.programProvenance,
      domains: comparableWorkspaceDomainIntentsJson(input.domains),
      programMedia: input.programMediaJson,
    }),
    label: input.label,
    mediaCount: input.mediaCount,
    programProvenance: input.programProvenance,
    recordCount: input.recordCount,
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
      })),
    ),
  );
}

function workspaceSyncFingerprint(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex")}`;
}

function changedProgramRecordKeys(
  local: WorkspaceControlPlaneRecords | undefined,
  remote: WorkspaceControlPlaneRecords,
): string[] {
  const localRecords = comparableProgramRecords(local);
  const remoteRecords = comparableProgramRecords(remote);
  const keys = new Set([...localRecords.keys(), ...remoteRecords.keys()]);
  const changed: string[] = [];

  for (const key of keys) {
    if (localRecords.get(key) !== remoteRecords.get(key)) {
      changed.push(key);
    }
  }

  return changed.sort((left, right) => left.localeCompare(right));
}

function comparableProgramRecords(
  controlPlane: WorkspaceControlPlaneRecords | undefined,
): Map<string, string> {
  const records = new Map<string, string>();

  for (const record of controlPlane?.records ?? []) {
    records.set(
      programRecordKey(record),
      JSON.stringify(
        stableValue({
          deleted: record.deletedAt !== undefined,
          entity: record.entity,
          id: record.id,
          values: comparableProgramRecordValues(record),
        }),
      ),
    );
  }

  return records;
}

function comparableProgramRecordsJson(
  controlPlane: WorkspaceControlPlaneRecords | undefined,
): string {
  return JSON.stringify(
    [...comparableProgramRecords(controlPlane).entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

function comparableProgramRecordValues(record: StoredRecord): RecordValues {
  return Object.fromEntries(
    Object.entries(record.values).filter(
      ([fieldName]) =>
        fieldName !== "createdAt" &&
        fieldName !== "updatedAt" &&
        (controlPlaneRecordEntity(record) !== "deployment-config" ||
          !deploymentConfigObservedFieldSet.has(fieldName)),
    ),
  ) as RecordValues;
}

function programRecordKey(record: Pick<StoredRecord, "entity" | "id">) {
  const entityName = isInstanceControlPlaneEntityName(record.entity)
    ? formatInstanceControlPlaneBoundaryEntityName(record.entity)
    : record.entity;

  return `${entityName}:${record.id}`;
}

function comparableMediaJson(
  source: WorkspaceArchiveMediaComparisonSource,
  objects: readonly ArchiveMediaObject[],
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

function workspaceMediaStatePath(manifest: FormlessResolvedConfig, archivePath: string): string {
  return path.posix.join(manifest.media.root, workspaceMediaPayloadPathForArchivePath(archivePath));
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
  currentTargetSource?: WorkspacePushCurrentTargetSource;
  forcedRecovery?: PushFormlessInstanceWorkspaceForcedRecoveryPlan;
  hasDataChanges: boolean;
  programArtifact: FormlessProgramArtifact;
  schemaCompatibility?: Exclude<
    WorkspacePushSchemaCompatibilityDecision,
    { status: "migration-required" }
  >;
  source: PushFormlessInstanceWorkspaceSource;
  syncPlan: FormlessInstanceWorkspaceSyncPlan;
};

export type WorkspacePushCurrentTargetSource = {
  archive: WorkspaceArchiveDirectory;
  programSchema: AppSchema;
  programSchemaProvenance: FormlessProgramArtifact["schemaProvenance"];
};

export async function prepareWorkspacePushSourceSync(
  input: PrepareWorkspacePushSourceSyncInput,
  dependencies: WorkspacePushSourceSyncDependencies,
): Promise<PrepareWorkspacePushSourceSyncResult> {
  const programArtifact = await activeWorkspaceProgramArtifact(input.manifest);
  const localControlPlane = await readInstanceWorkspaceProgramStorageSnapshot({
    manifest: input.manifest,
    workspaceRoot: input.workspaceRoot,
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
  const localProgramMedia = await workspaceProgramMediaFromSnapshot({
    controlPlane: localControlPlane,
    manifest: input.manifest,
    workspaceRoot: input.workspaceRoot,
  });
  assertWorkspaceProgramMediaComplete(localProgramMedia, "push");
  const source = await writeComposedWorkspacePushArchive({
    archiveRoot: input.archiveRoot,
    programSnapshot: localControlPlane,
    exportedAt: dependencies.now(),
    programArtifact,
    programMedia: localProgramMedia,
  });

  await assertWorkspacePushArchiveReadable({
    archiveRoot: input.archiveRoot,
    programArtifact,
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
            remoteArchiveRoot: path.join(input.tempRoot, "remote-check"),
            selectedTarget: input.selectedTarget,
          },
          dependencies,
        );
  const syncPlan =
    remoteRead.status === "readable"
      ? createWorkspaceSyncPlan({
          domainDesiredDrift,
          localControlPlane,
          localProgramProvenance: programArtifact.schemaProvenance,
          localProgramMedia,
          localDomains: localDomainIntents,
          manifest: input.manifest,
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
          localDomains: localDomainIntents,
          localProgramProvenance: programArtifact.schemaProvenance,
          localProgramMedia,
          manifest: input.manifest,
          targetLabel: input.selectedTarget.alias,
        });
  const forcedRecovery =
    remoteRead.status === "unreadable"
      ? forcedRecoveryPlanFromRemoteReadFailure(remoteRead.failure, {
          status: input.forcedRecoveryStatus,
        })
      : undefined;
  const schemaCompatibility =
    remoteRead.status === "readable" &&
    remoteRead.programSchema !== undefined &&
    remoteRead.programSchemaProvenance !== undefined
      ? requireWorkspacePushSchemaCompatibility({
          currentArchive: remoteRead.archive.archive,
          currentSchema: remoteRead.programSchema,
          currentSchemaProvenance: remoteRead.programSchemaProvenance,
          desiredProgramArtifact: programArtifact,
        })
      : undefined;

  return {
    archiveRoot: input.archiveRoot,
    ...(remoteRead.status !== "readable" ||
    remoteRead.programSchema === undefined ||
    remoteRead.programSchemaProvenance === undefined
      ? {}
      : {
          currentTargetSource: {
            archive: remoteRead.archive,
            programSchema: remoteRead.programSchema,
            programSchemaProvenance: remoteRead.programSchemaProvenance,
          },
        }),
    ...(forcedRecovery === undefined ? {} : { forcedRecovery }),
    hasDataChanges: syncPlan.status !== "up-to-date",
    programArtifact,
    ...(schemaCompatibility === undefined ? {} : { schemaCompatibility }),
    source,
    syncPlan,
  };
}

export async function restoreWorkspacePushSourceArchive(
  input: {
    adminToken: string | null;
    apply: boolean;
    archiveRoot: string;
    expectedSourceCursor?: number;
    programArtifact: FormlessProgramArtifact;
    selectedTarget: FormlessInstanceWorkspaceTarget;
  },
  dependencies: WorkspacePushSourceSyncDependencies,
): Promise<RestoreInstanceArchiveResult> {
  const result = await restoreWorkspacePushArchive(
    {
      adminToken: input.adminToken,
      apply: input.apply,
      archiveDir: input.archiveRoot,
      ...(input.expectedSourceCursor === undefined
        ? {}
        : { expectedSourceCursor: input.expectedSourceCursor }),
      programArtifact: input.programArtifact,
      target: input.selectedTarget.url,
    },
    dependencies,
  );

  if (!result.remote.ok) {
    throw new WorkspacePushRemoteRestoreError({
      apply: input.apply,
      remote: result.remote,
      target: input.selectedTarget.url,
    });
  }

  return result;
}

function requireWorkspacePushSchemaCompatibility(input: {
  currentArchive: InstanceArchive;
  currentSchema: AppSchema;
  currentSchemaProvenance: FormlessProgramArtifact["schemaProvenance"];
  desiredProgramArtifact: FormlessProgramArtifact;
}): Exclude<WorkspacePushSchemaCompatibilityDecision, { status: "migration-required" }> {
  if (
    input.currentSchemaProvenance.sourceSchemaHash ===
    input.desiredProgramArtifact.schemaProvenance.sourceSchemaHash
  ) {
    return { issues: [], status: "unchanged" };
  }

  const desiredSchema = parseFormlessProgramSchemaArtifact(
    input.desiredProgramArtifact.sourceSchema,
  );
  const issues = compareWorkspacePushStoredSchemaContract(input.currentSchema, desiredSchema);

  if (issues.length === 0) {
    try {
      const canonical = canonicalizeFormlessProgramStorageSnapshot(
        {
          ...input.currentArchive.program.snapshot,
          schema: desiredSchema,
        },
        { artifact: input.desiredProgramArtifact },
      );

      if (
        comparableStoredRecordsJson(canonical.records) !==
        comparableStoredRecordsJson(input.currentArchive.program.snapshot.records)
      ) {
        issues.push({
          code: "current-record-materialization-required",
          message: "current target records require materialization under the desired schema",
        });
      }
    } catch (error) {
      issues.push({
        code: "current-record-materialization-required",
        message: `current target records do not validate unchanged under the desired schema (${error instanceof Error ? error.message : "unknown validation error"})`,
      });
    }
  }

  if (issues.length > 0) {
    throw new WorkspacePushSchemaCompatibilityError({
      issues,
      status: "migration-required",
    });
  }

  return { issues: [], status: "storage-compatible" };
}

function compareWorkspacePushStoredSchemaContract(
  current: AppSchema,
  desired: AppSchema,
): WorkspacePushSchemaCompatibilityIssue[] {
  const issues: WorkspacePushSchemaCompatibilityIssue[] = [];
  const currentEntities = new Map(current.entities.map((entity) => [entity.key, entity]));
  const desiredEntities = new Map(desired.entities.map((entity) => [entity.key, entity]));
  const currentEntityKeys = [...currentEntities.keys()].sort();
  const desiredEntityKeys = [...desiredEntities.keys()].sort();

  if (canonicalJsonStringify(currentEntityKeys) !== canonicalJsonStringify(desiredEntityKeys)) {
    issues.push({
      code: "entity-set-changed",
      message: "stored entity keys were added or removed",
    });
  }

  for (const entityKey of currentEntityKeys.filter((key) => desiredEntities.has(key))) {
    const currentEntity = currentEntities.get(entityKey)!;
    const desiredEntity = desiredEntities.get(entityKey)!;

    if (currentEntity.id !== desiredEntity.id) {
      issues.push({
        code: "entity-identity-changed",
        message: `entity "${entityKey}" was rebound from "${currentEntity.id}" to "${desiredEntity.id}"`,
      });
    }

    const currentFields = new Map(currentEntity.fields.map((field) => [field.key, field]));
    const desiredFields = new Map(desiredEntity.fields.map((field) => [field.key, field]));
    const currentFieldKeys = [...currentFields.keys()].sort();
    const desiredFieldKeys = [...desiredFields.keys()].sort();

    if (canonicalJsonStringify(currentFieldKeys) !== canonicalJsonStringify(desiredFieldKeys)) {
      issues.push({
        code: "field-set-changed",
        message: `entity "${entityKey}" stored fields were added or removed`,
      });
    }

    for (const fieldKey of currentFieldKeys.filter((key) => desiredFields.has(key))) {
      if (
        canonicalJsonStringify(storedFieldContract(currentFields.get(fieldKey)!)) !==
        canonicalJsonStringify(storedFieldContract(desiredFields.get(fieldKey)!))
      ) {
        issues.push({
          code: "field-storage-contract-changed",
          message: `field "${entityKey}.${fieldKey}" changed stored value shape or constraints`,
        });
      }
    }

    if (
      comparableConstraintsJson(currentEntity.constraints ?? []) !==
      comparableConstraintsJson(desiredEntity.constraints ?? [])
    ) {
      issues.push({
        code: "stored-constraint-changed",
        message: `entity "${entityKey}" changed stored constraints`,
      });
    }
  }

  return issues;
}

function storedFieldContract(field: FieldSchema & { key: string }): unknown {
  const base = { key: field.key, required: field.required, type: field.type };

  switch (field.type) {
    case "text":
      return {
        ...base,
        asset: field.asset ?? null,
        format: field.format ?? null,
      };
    case "boolean":
      return { ...base, default: field.default ?? null };
    case "date":
      return base;
    case "number":
      return {
        ...base,
        default: field.default ?? null,
        integer: field.integer ?? null,
        max: field.max ?? null,
        min: field.min ?? null,
      };
    case "enum":
      return {
        ...base,
        default: field.default ?? null,
        values: field.values.map((value) => value.key).sort(),
      };
    case "reference":
      return { ...base, to: field.to };
  }
}

function comparableConstraintsJson(constraints: readonly unknown[]): string {
  return canonicalJsonStringify(
    [...constraints].sort((left, right) => constraintKey(left).localeCompare(constraintKey(right))),
  );
}

function constraintKey(value: unknown): string {
  return typeof value === "object" && value !== null && "key" in value
    ? String(value.key)
    : canonicalJsonStringify(value);
}

function comparableStoredRecordsJson(records: readonly StoredRecord[]): string {
  return canonicalJsonStringify(
    [...records].sort((left, right) => left.id.localeCompare(right.id)),
  );
}

export async function writeWorkspacePushTargetBackup(input: {
  outDir: string;
  source: WorkspacePushCurrentTargetSource;
}): Promise<ArchiveDiskWriteResult> {
  if (input.source.archive.missingMediaFiles.length > 0) {
    throw new CurrentTargetArchiveSourceValidationError(
      "validation",
      `Current target archive is missing media: ${input.source.archive.missingMediaFiles.join(", ")}.`,
    );
  }

  return writeInstanceArchiveDirectory(
    {
      archive: input.source.archive.archive,
      mediaFiles: input.source.archive.mediaFiles,
      outDir: input.outDir,
      programSchema: input.source.programSchema,
      programSchemaProvenance: input.source.programSchemaProvenance,
    },
    { cwd: "/" },
  );
}

async function writeComposedWorkspacePushArchive(input: {
  archiveRoot: string;
  exportedAt: string;
  programArtifact: FormlessProgramArtifact;
  programMedia: WorkspaceProgramMediaSource;
  programSnapshot?: WorkspaceControlPlaneRecords;
}): Promise<PushFormlessInstanceWorkspaceSource> {
  const snapshot = controlPlaneSnapshotForArchive(
    input.programSnapshot ??
      workspaceControlPlaneSnapshotFromRecords({
        current: undefined,
        exportedAt: input.exportedAt,
        records: [],
        schemaUpdatedAt: input.exportedAt,
      }),
    input.exportedAt,
  );
  const instanceArchive: InstanceArchive = {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: input.exportedAt,
    capabilities: ["core-media-assets"],
    restorePolicy: { dryRun: true },
    program: {
      schemaProvenance: input.programArtifact.schemaProvenance,
      snapshot,
    },
    media: { objects: input.programMedia.objects },
  };
  const write = await writeInstanceArchiveDirectory(
    {
      archive: instanceArchive,
      mediaFiles: input.programMedia.mediaFiles,
      outDir: input.archiveRoot,
      programArtifact: input.programArtifact,
    },
    { cwd: "/" },
  );

  return write;
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
  if (host === undefined) {
    throw new Error(`Workspace route "${record.id}" is missing matchHost.`);
  }

  return {
    enabled: booleanRecordValue(record, "enabled") ?? true,
    host,
    profile,
  };
}

function workspaceDomainProfileFromRouteTargetProfile(
  targetProfile: string | undefined,
): FormlessInstanceWorkspaceDomainIntent["profile"] {
  switch (targetProfile) {
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
  return left.host.localeCompare(right.host) || left.profile.localeCompare(right.profile);
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
    left.enabled === right.enabled && left.host === right.host && left.profile === right.profile
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
