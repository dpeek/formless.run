import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  deployDeploymentAppliedSummary,
  deployDeploymentObservationPatch,
  deployDeploymentObservationPatchFromLatestStatus,
  deployDesiredStateProjectionInputFromControlPlaneRecords,
  deployDisplaySafeFailureSummary,
  deployLatestStatusDisplaySummary,
  deployResourceCountsByKind,
  materializeDeployDesiredStateVersion,
  projectDeployControlPlaneDesiredState,
  type DeployDesiredStateProjectionInput,
  type DeployDesiredStateResponse,
  type DeployDesiredStateVersionRef,
  type DeployEvidenceSummary,
  type DeployFailureSummary,
  type DeployLatestStatus,
  type DeployLatestStatusDisplaySummary,
  type DeployResourceGraph,
  type DeployResourceKind,
} from "@dpeek/formless-deploy";
import { type ArchiveDiskWriteResult } from "../program/archive-node.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import {
  normalizeInstanceWorkspaceTargetUrl as normalizeFormlessInstanceWorkspaceTargetUrl,
  type ResolvedFormlessConfig as FormlessResolvedConfig,
  type InstanceWorkspaceTarget as FormlessInstanceWorkspaceTarget,
} from "@dpeek/formless-workspace";
import {
  INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME as FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME,
  ensureInstanceWorkspaceSecretStateIgnored as ensureFormlessInstanceWorkspaceSecretStateIgnored,
  formatWorkspaceDotEnv as formatDotEnv,
  instanceWorkspaceSecretStatePath as formlessInstanceWorkspaceSecretStatePath,
  readInstanceWorkspaceProgramStorageSnapshot,
  readInstanceWorkspaceSecretState as readFormlessInstanceWorkspaceSecretState,
  resolveInstanceWorkspaceAdminToken as resolveFormlessInstanceWorkspaceAdminToken,
  writeInstanceWorkspaceProgramStorageSnapshot,
  writeInstanceWorkspaceSecretState as writeFormlessInstanceWorkspaceSecretState,
  parseWorkspaceDotEnv as parseDotEnv,
} from "../program/workspace.ts";
import {
  deployDesiredStateVersionRef,
  type DeployDesiredStateVersionLike,
} from "@dpeek/formless-deploy/client";
import { parseOwnerSetupToken } from "../shared/protocol.ts";
import { runtimeWorkspaceExtensionsEnvValue } from "../shared/workspace-runtime-extensions.ts";
import type { DomainProviderPlan } from "../shared/domain-provider-protocol.ts";
import { exportInstanceArchive, type RestorePortableArchiveResult } from "./archive-workflows.ts";
import {
  ALCHEMY_PASSWORD_ENV_NAME,
  FORMLESS_INSTANCE_LOCAL_ENV_FILE,
  FORMLESS_INSTANCE_STATE_FILE,
  createFormlessInstanceState,
  formatFormlessInstanceState,
  formatFormlessOwnerSetupUrl,
  parseFormlessInstanceStateJson,
  planFormlessInstanceDeployment,
  type CheckFormlessInstanceDeployMetadataResult,
  type CreateFormlessInstanceOwnerSetupCapabilityResult,
  type DeployFormlessInstanceResult,
  type DestroyFormlessInstanceResult,
  type EnsureFormlessInstanceLocalSecretEnvResult,
  type FormlessInstanceAccountDiscoveryAdapter,
  type FormlessInstanceDeploymentAccount,
  type FormlessInstanceDeploymentAdapter,
  type FormlessInstanceDeploymentHealthCheckAdapter,
  type FormlessInstanceDeploymentPlan,
  type FormlessInstanceLocalSecretEnvStore,
  type FormlessInstanceOwnerSetupCapabilityAdapter,
} from "./instance-onboarding.ts";
import {
  patchFormlessInstanceDeploymentConfigObservation,
  readFormlessInstanceDeploymentDesiredState,
  readFormlessInstanceDeploymentStatus,
  type FormlessInstanceDeploymentObservationPatch,
} from "./instance-target-client.ts";
import {
  formlessCliDeploymentWorkerNameFromConfig,
  formlessCliPrimaryTargetId,
  formlessCliTargetFromDeploymentConfig,
  formlessCliWorkersDevTargetFacts,
  requireFormlessCliWorkspaceTarget,
} from "./instance-target-context.ts";
import {
  hasLocalWorkspaceFormlessCloudflareOAuthCredential,
  resolveLocalWorkspaceDeploymentCredentialContext,
  type FormlessCliDeploymentCredentialReference,
  type FormlessCliProviderBearerMaterial,
  selectLocalWorkspaceDeploymentSource,
  type LocalWorkspaceDeploymentCredential,
} from "./instance-provider-credentials.ts";
import {
  createWorkspaceTempRoot,
  materializeActiveWorkspaceProgramArtifact,
  readWorkspaceConfig,
  resolveFormlessInstanceWorkspaceRoot,
  workspaceRootForInput,
} from "./instance-workspace-foundation.ts";
import {
  checkFormlessInstanceWorkspace,
  prepareWorkspacePushSourceSync,
  restoreWorkspacePushSourceArchive,
  workspacePushBackupPath,
  type CheckFormlessInstanceWorkspaceResult,
  type FormlessInstanceWorkspaceSyncPlan,
} from "./instance-workspace-source-sync.ts";
import {
  stringRecordValue,
  withoutControlPlaneLifecycleValues,
  workspaceControlPlaneSnapshotFromRecords,
  type WorkspaceControlPlaneRecords,
} from "./instance-workspace-control-plane.ts";

export type PushFormlessInstanceWorkspaceInput = {
  apply?: boolean;
  force?: boolean;
  targetAlias?: string | null;
  targetOverride?: FormlessInstanceWorkspaceTarget;
  workspacePath?: string;
};

export type PushFormlessInstanceWorkspaceDependencies = {
  accountDiscovery: FormlessInstanceAccountDiscoveryAdapter;
  cwd: string;
  deploymentAdapter: FormlessInstanceDeploymentAdapter;
  env?: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  healthCheck: FormlessInstanceDeploymentHealthCheckAdapter;
  localSecretEnv: FormlessInstanceLocalSecretEnvStore;
  now: () => string;
  packageRoot: string;
  packageVersion: string;
  randomToken: () => string;
  setupCapability: FormlessInstanceOwnerSetupCapabilityAdapter;
};

export type PushFormlessInstanceWorkspaceDryRunDependencies =
  PlanDeployLocalFormlessWorkspaceDependencies &
    Pick<PushFormlessInstanceWorkspaceDependencies, "cwd" | "env" | "fetch" | "now">;

export type PushFormlessInstanceWorkspaceExecutionDependencies =
  | PushFormlessInstanceWorkspaceDryRunDependencies
  | PushFormlessInstanceWorkspaceDependencies;

export type PushFormlessInstanceWorkspaceSource = {
  archivePath: string;
  mediaCount: number;
  recordCount: number;
};

export type PushFormlessInstanceWorkspaceRuntimeRebuild = {
  reason: "force" | "program-artifact-configured" | "runtime-extensions-configured";
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

export type PushFormlessInstanceWorkspaceResult = {
  applyResult?: RestorePortableArchiveResult;
  backup?: ArchiveDiskWriteResult;
  deployment?: DeployFormlessInstanceResult;
  deploymentDisplay: LocalWorkspaceDeploymentDisplayFacts;
  deploymentObservation?: DeployLocalFormlessWorkspaceObservation;
  deploymentStatePath?: string;
  deploymentStateRoot?: string;
  dryRun?: RestorePortableArchiveResult;
  healthCheck?: CheckFormlessInstanceDeployMetadataResult;
  localSecretEnv?: EnsureFormlessInstanceLocalSecretEnvResult;
  mode: "apply" | "dry-run";
  noop: boolean;
  forcedRecovery?: PushFormlessInstanceWorkspaceForcedRecoveryPlan;
  ownerSetup?: DeployLocalFormlessWorkspaceOwnerSetup;
  plan?: FormlessInstanceDeploymentPlan;
  runtimeRebuild?: PushFormlessInstanceWorkspaceRuntimeRebuild;
  secretPath?: string;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  source: PushFormlessInstanceWorkspaceSource;
  syncPlan: FormlessInstanceWorkspaceSyncPlan;
  workspaceRoot: string;
};

export type PushFormlessInstanceWorkspaceCloudflareOAuthPreflightReason =
  | "alchemy-credential-ref"
  | "missing-credential-ref"
  | "missing-local-oauth-secret";

export type PushFormlessInstanceWorkspaceCloudflareOAuthPreflightResult = {
  credentialId?: string;
  credentialRef?: string;
  deploymentConfigId: string;
  needsSetup: boolean;
  reason?: PushFormlessInstanceWorkspaceCloudflareOAuthPreflightReason;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type RefreshFormlessInstanceDeploymentObservationInput = {
  targetAlias?: string | null;
  workspacePath?: string | null;
};

export type RefreshFormlessInstanceDeploymentObservationDependencies = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  now: () => string;
};

export type RefreshFormlessInstanceDeploymentObservationResult = {
  deploymentStatus: DeployLatestStatusDisplaySummary;
  observation: DeployLocalFormlessWorkspaceObservation;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type DeployFormlessInstanceWorkspaceInput = {
  targetAlias?: string | null;
  workspacePath?: string;
};

export type DeployFormlessInstanceWorkspaceDependencies = {
  cwd: string;
  deploymentAdapter: FormlessInstanceDeploymentAdapter;
  env?: NodeJS.ProcessEnv;
  healthCheck: FormlessInstanceDeploymentHealthCheckAdapter;
  localSecretEnv: FormlessInstanceLocalSecretEnvStore;
  packageRoot: string;
  packageVersion: string;
  randomToken: () => string;
};

export type DeployLocalFormlessWorkspaceInput = {
  targetAlias?: string | null;
  workspacePath?: string;
};

export type PlanDeployLocalFormlessWorkspaceInput = DeployLocalFormlessWorkspaceInput & {
  allowUnreadableTargetRecovery?: boolean;
  credentialAccess?: "mutable" | "read-only";
};

export type DeployLocalFormlessWorkspaceDependencies =
  DeployFormlessInstanceWorkspaceDependencies & {
    accountDiscovery: FormlessInstanceAccountDiscoveryAdapter;
    fetch: typeof fetch;
    now: () => string;
    setupCapability: FormlessInstanceOwnerSetupCapabilityAdapter;
  };

export type PlanDeployLocalFormlessWorkspaceDependencies = Pick<
  DeployLocalFormlessWorkspaceDependencies,
  "accountDiscovery" | "cwd" | "env" | "fetch" | "now" | "packageVersion"
>;

export type PlanDeployLocalFormlessWorkspaceResult = LocalWorkspaceDeploymentPlanResult & {
  desiredState: LocalWorkspaceDeploymentDesiredState;
  existingSelectedTarget?: FormlessInstanceWorkspaceTarget;
  configPath: string;
  preflight?: CheckFormlessInstanceWorkspaceResult;
  workspaceProgramArtifact: string;
  workspaceProgramArtifactPath: string;
  workspaceRuntimeExtensions?: string;
  workspaceRoot: string;
};

export type PlanDeployFormlessInstanceWorkspaceDependencies = Pick<
  DeployFormlessInstanceWorkspaceDependencies,
  "cwd" | "env" | "packageVersion"
>;

export type PlanDeployFormlessInstanceWorkspaceResult = {
  credential: LocalWorkspaceDeploymentCredential;
  credentialProfile: string | null;
  plan: FormlessInstanceDeploymentPlan;
  providerBearer?: FormlessCliProviderBearerMaterial;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceProgramArtifact: string;
  workspaceProgramArtifactPath: string;
  workspaceRuntimeExtensions?: string;
  workspaceRoot: string;
};

export type DestroyFormlessInstanceWorkspaceInput = {
  confirm: string;
  targetAlias?: string | null;
  workspacePath?: string;
};

export type DestroyFormlessInstanceWorkspaceDependencies = {
  cwd: string;
  deploymentAdapter: FormlessInstanceDeploymentAdapter;
  env?: NodeJS.ProcessEnv;
  packageRoot: string;
  packageVersion: string;
};

export type DestroyLocalFormlessWorkspaceInput = DestroyFormlessInstanceWorkspaceInput;

export type DestroyLocalFormlessWorkspaceDependencies =
  DestroyFormlessInstanceWorkspaceDependencies;

export type DeployLocalFormlessWorkspaceOwnerSetup = {
  capability: CreateFormlessInstanceOwnerSetupCapabilityResult;
  url: string;
};

export type DeployLocalFormlessWorkspaceEvidenceSummary = {
  actionsByKind: Record<string, number>;
  count: number;
  logicalIds: string[];
  resourcesByKind: Record<string, number>;
};

export type DeployLocalFormlessWorkspaceObservation = {
  desiredState: DeployDesiredStateVersionRef;
  evidence: DeployLocalFormlessWorkspaceEvidenceSummary;
  evidenceCount: number;
  observedAt: string;
  observedError?: string;
  observedStatus: FormlessInstanceDeploymentObservationPatch["observedStatus"];
  observedSummary: string;
  resourceCount: number;
  resourcesByKind: Record<DeployResourceKind, number>;
  runnerId: string;
  targetId: string;
};

export type DeployFormlessInstanceWorkspaceResult = {
  deployment: DeployFormlessInstanceResult;
  deploymentObservation?: DeployLocalFormlessWorkspaceObservation;
  deploymentStateRoot: string;
  deploymentStatePath?: string;
  healthCheck: CheckFormlessInstanceDeployMetadataResult;
  localSecretEnv: EnsureFormlessInstanceLocalSecretEnvResult;
  ownerSetup?: DeployLocalFormlessWorkspaceOwnerSetup;
  plan: FormlessInstanceDeploymentPlan;
  push?: PushFormlessInstanceWorkspaceResult;
  secretPath: string;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type DeployLocalFormlessWorkspaceFailureStepId = "health-check";

export class DeployLocalFormlessWorkspaceStepError extends Error {
  readonly evidence: Record<string, boolean | number | string | null>;
  readonly expectedUrl: string;
  readonly retryGuidance: string;
  readonly stepId: DeployLocalFormlessWorkspaceFailureStepId;
  readonly stepLabel: string;

  constructor(input: {
    evidence: Record<string, boolean | number | string | null>;
    expectedUrl: string;
    retryGuidance: string;
    stepId: DeployLocalFormlessWorkspaceFailureStepId;
    stepLabel: string;
  }) {
    super(`${input.stepLabel} failed for ${input.expectedUrl}.`);
    this.name = "DeployLocalFormlessWorkspaceStepError";
    this.evidence = input.evidence;
    this.expectedUrl = input.expectedUrl;
    this.retryGuidance = input.retryGuidance;
    this.stepId = input.stepId;
    this.stepLabel = input.stepLabel;
  }
}

export type DestroyFormlessInstanceWorkspaceRouteProviderResources = {
  enabledHosts: string[];
  resourceGraph: DeployResourceGraph;
  resourceCount: number;
  routeCount: number;
  source: "instance:route";
};

export type DestroyFormlessInstanceWorkspaceResult = {
  deploymentStatePath: string;
  deploymentStateRoot: string;
  destroy: DestroyFormlessInstanceResult;
  localSecretPath: string;
  plan: FormlessInstanceDeploymentPlan;
  routeProviderResources: DestroyFormlessInstanceWorkspaceRouteProviderResources;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type FormlessInstanceWorkspaceProviderContext = {
  config: FormlessResolvedConfig;
  credential: LocalWorkspaceDeploymentCredential;
  credentialProfile: string | null;
  deploymentStatePath: string;
  deploymentStateRoot: string;
  localSecretPath: string;
  plan: FormlessInstanceDeploymentPlan;
  providerBearer?: FormlessCliProviderBearerMaterial;
  secrets: {
    ALCHEMY_PASSWORD: string;
    CLOUDFLARE_API_TOKEN?: string;
  };
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export async function pushFormlessInstanceWorkspace(
  input: PushFormlessInstanceWorkspaceInput,
  dependencies: PushFormlessInstanceWorkspaceExecutionDependencies,
): Promise<PushFormlessInstanceWorkspaceResult> {
  const planned = await planDeployLocalFormlessWorkspace(
    {
      allowUnreadableTargetRecovery: input.force === true,
      credentialAccess: input.apply ? "mutable" : "read-only",
      targetAlias: input.targetOverride?.alias ?? input.targetAlias,
      workspacePath: input.workspacePath,
    },
    dependencies,
  );
  const workspaceRoot = planned.workspaceRoot;
  const selectedTarget = input.targetOverride ?? planned.selectedTarget;
  const tempRoot = await createWorkspaceTempRoot(workspaceRoot, "push");
  const composedArchiveRoot = path.join(tempRoot, "archive");
  const applyDependencies =
    input.apply === true ? requireWorkspacePushApplyDependencies(dependencies) : undefined;

  try {
    const providerApply =
      input.apply && planned.existingSelectedTarget === undefined
        ? await applyWorkspacePushProviderReconciliation(planned, applyDependencies!)
        : undefined;
    const adminToken =
      providerApply?.adminToken ?? (await readWorkspaceAdminToken(workspaceRoot, dependencies));

    if (providerApply?.ownerSetup !== undefined) {
      await writeLocalWorkspaceDeploymentConfigSource({
        config: planned.config,
        now: dependencies.now(),
        plan: planned.plan,
        selectedTarget,
        workspaceRoot,
      });
    }

    const sourceSync = await prepareWorkspacePushSourceSync(
      {
        adminToken,
        archiveRoot: composedArchiveRoot,
        ...(planned.existingSelectedTarget === undefined
          ? {}
          : { existingSelectedTarget: planned.existingSelectedTarget }),
        force: input.force,
        forcedRecoveryStatus: input.apply ? "applied" : "planned",
        manifest: planned.config,
        selectedTarget,
        tempRoot,
        workspaceRoot,
      },
      dependencies,
    );
    const { forcedRecovery, hasDataChanges, programArtifact, source, syncPlan } = sourceSync;
    const runtimeRebuild =
      planned.config.programSource === undefined &&
      planned.workspaceRuntimeExtensions === undefined &&
      input.force !== true
        ? undefined
        : {
            reason:
              planned.config.programSource !== undefined
                ? ("program-artifact-configured" as const)
                : planned.workspaceRuntimeExtensions === undefined
                  ? ("force" as const)
                  : ("runtime-extensions-configured" as const),
            status: (input.apply ? "applied" : "available") as "applied" | "available",
          };
    const forcedRecoveryActive = forcedRecovery !== undefined;

    if (forcedRecovery !== undefined && !input.apply) {
      return {
        deploymentDisplay: planned.deploymentDisplay,
        forcedRecovery,
        mode: "dry-run",
        noop: false,
        ...(runtimeRebuild === undefined ? {} : { runtimeRebuild }),
        selectedTarget,
        source,
        syncPlan,
        workspaceRoot,
      };
    }

    if (!hasDataChanges && runtimeRebuild === undefined) {
      return {
        deploymentDisplay: planned.deploymentDisplay,
        mode: input.apply ? "apply" : "dry-run",
        noop: true,
        selectedTarget,
        source,
        syncPlan,
        workspaceRoot,
      };
    }

    if (!hasDataChanges && !input.apply) {
      return {
        deploymentDisplay: planned.deploymentDisplay,
        mode: "dry-run",
        noop: true,
        ...(runtimeRebuild === undefined ? {} : { runtimeRebuild }),
        selectedTarget,
        source,
        syncPlan,
        workspaceRoot,
      };
    }

    const backup =
      input.apply && hasDataChanges && !forcedRecoveryActive
        ? planned.existingSelectedTarget === undefined
          ? undefined
          : await exportInstanceArchive(
              {
                adminToken: providerApply?.adminToken ?? adminToken,
                outDir: workspacePushBackupPath(workspaceRoot, dependencies.now()),
                programArtifact,
                target: selectedTarget.url,
              },
              dependencies,
            )
        : undefined;
    const dryRun =
      hasDataChanges &&
      planned.existingSelectedTarget !== undefined &&
      !input.apply &&
      !forcedRecoveryActive
        ? await restoreWorkspacePushSourceArchive(
            {
              adminToken: providerApply?.adminToken ?? adminToken,
              apply: false,
              archiveRoot: composedArchiveRoot,
              programArtifact,
              selectedTarget,
            },
            dependencies,
          )
        : undefined;

    const provider =
      input.apply && providerApply === undefined
        ? await applyWorkspacePushProviderReconciliation(planned, applyDependencies!)
        : providerApply;
    const applyDryRun =
      hasDataChanges && input.apply && !forcedRecoveryActive
        ? await restoreWorkspacePushSourceArchive(
            {
              adminToken: provider?.adminToken ?? adminToken,
              apply: false,
              archiveRoot: composedArchiveRoot,
              programArtifact,
              selectedTarget,
            },
            dependencies,
          )
        : undefined;
    const restoreDryRun = dryRun ?? applyDryRun;

    if (input.apply && restoreDryRun && !restoreDryRun.remote.ok) {
      throw new Error("Formless instance push apply stopped because dry-run restore failed.");
    }

    const applyResult =
      input.apply && hasDataChanges
        ? await restoreWorkspacePushSourceArchive(
            {
              adminToken: provider?.adminToken ?? adminToken,
              apply: true,
              archiveRoot: composedArchiveRoot,
              programArtifact,
              selectedTarget,
            },
            dependencies,
          )
        : undefined;
    const deploymentObservation =
      provider === undefined
        ? undefined
        : await writeLocalWorkspaceDeploymentObservation(
            {
              adminToken: provider.adminToken,
              desiredState: planned.desiredState,
              observedStatus: "deployed",
              resourceEvidence: provider.deployment.resourceEvidence ?? [],
              summary: deployDeploymentAppliedSummary({
                resourceCount: planned.desiredState.resourceCount,
                sourceLabel: "workspace source",
              }),
              targetUrl: provider.deployment.url,
            },
            dependencies,
          );

    return {
      ...(applyResult === undefined ? {} : { applyResult }),
      ...(backup === undefined ? {} : { backup }),
      ...(provider === undefined
        ? {}
        : {
            deployment: provider.deployment,
            ...(deploymentObservation === undefined ? {} : { deploymentObservation }),
            deploymentStatePath: provider.deploymentStatePath,
            deploymentStateRoot: provider.deploymentStateRoot,
            healthCheck: provider.healthCheck,
            localSecretEnv: provider.localSecretEnv,
            ...(provider.ownerSetup === undefined ? {} : { ownerSetup: provider.ownerSetup }),
            plan: planned.plan,
            secretPath: provider.secretPath,
          }),
      ...(restoreDryRun === undefined ? {} : { dryRun: restoreDryRun }),
      ...(forcedRecovery === undefined ? {} : { forcedRecovery }),
      deploymentDisplay: planned.deploymentDisplay,
      mode: input.apply ? "apply" : "dry-run",
      noop: !hasDataChanges && provider === undefined,
      ...(runtimeRebuild === undefined ? {} : { runtimeRebuild }),
      selectedTarget,
      source,
      syncPlan,
      workspaceRoot,
    };
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

function requireWorkspacePushApplyDependencies(
  dependencies: PushFormlessInstanceWorkspaceDryRunDependencies,
): PushFormlessInstanceWorkspaceDependencies {
  const {
    deploymentAdapter,
    healthCheck,
    localSecretEnv,
    packageRoot,
    randomToken,
    setupCapability,
  } = dependencies as Partial<PushFormlessInstanceWorkspaceDependencies>;
  const missing: string[] = [];

  if (deploymentAdapter === undefined) missing.push("deploymentAdapter");
  if (healthCheck === undefined) missing.push("healthCheck");
  if (localSecretEnv === undefined) missing.push("localSecretEnv");
  if (packageRoot === undefined) missing.push("packageRoot");
  if (randomToken === undefined) missing.push("randomToken");
  if (setupCapability === undefined) missing.push("setupCapability");

  if (missing.length > 0) {
    throw new Error(`Workspace push apply requires operation dependencies: ${missing.join(", ")}.`);
  }

  if (
    deploymentAdapter === undefined ||
    healthCheck === undefined ||
    localSecretEnv === undefined ||
    packageRoot === undefined ||
    randomToken === undefined ||
    setupCapability === undefined
  ) {
    throw new Error("Workspace push apply dependencies are incomplete.");
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

type WorkspacePushProviderReconciliationResult = {
  adminToken: string;
  deployment: DeployFormlessInstanceResult;
  deploymentStatePath: string;
  deploymentStateRoot: string;
  healthCheck: CheckFormlessInstanceDeployMetadataResult;
  localSecretEnv: EnsureFormlessInstanceLocalSecretEnvResult;
  ownerSetup?: DeployLocalFormlessWorkspaceOwnerSetup;
  secretPath: string;
};

async function applyWorkspacePushProviderReconciliation(
  planned: PlanDeployLocalFormlessWorkspaceResult,
  dependencies: PushFormlessInstanceWorkspaceDependencies,
): Promise<WorkspacePushProviderReconciliationResult> {
  const workspaceRoot = planned.workspaceRoot;
  const secretState = await readFormlessInstanceWorkspaceSecretState(workspaceRoot);
  let adminToken = resolveFormlessInstanceWorkspaceAdminToken({
    env: dependencies.env,
    secretState,
  });

  await ensureFormlessInstanceWorkspaceSecretStateIgnored(workspaceRoot);

  if (!adminToken) {
    if (planned.existingSelectedTarget !== undefined) {
      throw new Error(missingAdminTokenMessage("push"));
    }

    adminToken = requiredGeneratedToken(dependencies.randomToken());
    await writeFormlessInstanceWorkspaceSecretState(workspaceRoot, { adminToken });
  }

  const deploymentStateRoot = formlessInstanceWorkspaceDeployStateRoot(workspaceRoot, planned.plan);
  const localSecretEnv = await dependencies.localSecretEnv.ensure({
    createSecret: dependencies.randomToken,
    root: deploymentStateRoot,
  });

  await copyLocalWorkspaceDeploySecretEnv({
    adminToken,
    credentialProfile: planned.credentialProfile,
    credentialProfileFromConfig: planned.credentialProfileFromConfig,
    env: dependencies.env,
    localSecretEnv,
    plan: planned.plan,
  });

  const deploymentSecrets = await readDestroyLocalDeploySecretEnv({
    deploymentStateRoot,
    env: dependencies.env,
  });
  const cloudflareApiToken = providerBearerCloudflareApiToken(planned.providerBearer);
  const deploymentStatePath = await writeLocalWorkspaceDeploymentState({
    credentialProfile: planned.credentialProfile,
    deploymentStateRoot,
    plan: planned.plan,
  });

  try {
    const deploymentResult = await dependencies.deploymentAdapter.deploy({
      credentialProfile: planned.credentialProfile,
      deploymentResourceGraph: planned.desiredState.resourceGraph,
      packageRoot: dependencies.packageRoot,
      plan: planned.plan,
      ...(planned.providerBearer === undefined ? {} : { providerBearer: planned.providerBearer }),
      secrets: {
        ALCHEMY_PASSWORD: deploymentSecrets.secrets.ALCHEMY_PASSWORD,
        ...(cloudflareApiToken === undefined ? {} : { CLOUDFLARE_API_TOKEN: cloudflareApiToken }),
        FORMLESS_ADMIN_TOKEN: adminToken,
      },
      stateRoot: deploymentStateRoot,
      workspaceRoot,
      workspaceProgramArtifact: planned.workspaceProgramArtifact,
      workspaceProgramArtifactPath: planned.workspaceProgramArtifactPath,
      ...(planned.workspaceRuntimeExtensions === undefined
        ? {}
        : { workspaceRuntimeExtensions: planned.workspaceRuntimeExtensions }),
    });
    const deploymentUrl = normalizeFormlessInstanceWorkspaceTargetUrl(deploymentResult.url);

    if (deploymentUrl !== planned.plan.expectedUrl.url) {
      throw new Error(
        `Formless push provider reconciliation returned ${deploymentUrl}, expected target ${planned.plan.expectedUrl.url}.`,
      );
    }

    const healthCheck = await checkLocalWorkspaceDeploymentHealth({
      dependencies,
      deploymentUrl,
      plan: planned.plan,
      providerBearer: planned.providerBearer,
      selectedTarget: planned.selectedTarget,
    });
    const ownerSetup =
      planned.existingSelectedTarget === undefined
        ? await createLocalWorkspaceOwnerSetup({
            adminToken,
            deploymentUrl,
            randomToken: dependencies.randomToken,
            setupCapability: dependencies.setupCapability,
          })
        : undefined;

    return {
      adminToken,
      deployment: {
        ...deploymentResult,
        url: deploymentUrl,
      },
      deploymentStatePath,
      deploymentStateRoot,
      healthCheck,
      localSecretEnv,
      ...(ownerSetup === undefined ? {} : { ownerSetup }),
      secretPath: formlessInstanceWorkspaceSecretStatePath(workspaceRoot),
    };
  } catch (error) {
    await tryWriteLocalWorkspaceDeploymentFailureObservation(
      {
        adminToken,
        desiredState: planned.desiredState,
        error,
        targetUrl: planned.selectedTarget.url,
      },
      dependencies,
    );

    throw error;
  }
}

export async function refreshFormlessInstanceDeploymentObservation(
  input: RefreshFormlessInstanceDeploymentObservationInput,
  dependencies: RefreshFormlessInstanceDeploymentObservationDependencies,
): Promise<RefreshFormlessInstanceDeploymentObservationResult> {
  const workspaceRoot = await resolveFormlessInstanceWorkspaceRoot({
    cwd: dependencies.cwd,
    workspacePath: input.workspacePath,
  });
  const { config } = await readWorkspaceConfig(workspaceRoot);
  const selectedTarget = await requireFormlessCliWorkspaceTarget({
    commandName: "deployment refresh",
    config,
    targetAlias: input.targetAlias,
    workspaceRoot,
  });
  const controlPlane = await readInstanceWorkspaceProgramStorageSnapshot({
    manifest: config,
    workspaceRoot,
  });
  const deploymentSource = selectLocalWorkspaceDeploymentSource(controlPlane, input.targetAlias, {
    commandName: "deployment refresh",
  });

  await resolveLocalWorkspaceDeploymentCredentialContext({
    credential: deploymentSource.credential,
    credentialAccess: "read-only",
    deploymentConfig: deploymentSource.deploymentConfig,
    workspaceRoot,
  });

  const adminToken = await readWorkspaceAdminToken(workspaceRoot, dependencies);

  if (!adminToken) {
    throw new Error(
      "Formless instance deployment refresh requires an admin token; run `formless instance token adopt` or pass FORMLESS_ADMIN_TOKEN.",
    );
  }

  const desiredStateResponse = await readFormlessInstanceDeploymentDesiredState(
    {
      adminToken,
      targetId: selectedTarget.alias,
      targetUrl: selectedTarget.url,
    },
    dependencies,
  );
  const statusResponse = await readFormlessInstanceDeploymentStatus(
    {
      adminToken,
      targetId: selectedTarget.alias,
      targetUrl: selectedTarget.url,
    },
    dependencies,
  );
  const observation = await patchDeploymentStatusObservation(
    {
      adminToken,
      desiredState: desiredStateResponse.desiredState,
      status: statusResponse.status,
      targetUrl: selectedTarget.url,
    },
    dependencies,
  );

  return {
    deploymentStatus: deployLatestStatusDisplaySummary(statusResponse.status),
    observation,
    selectedTarget,
    workspaceRoot,
  };
}

export async function deployLocalFormlessWorkspace(
  input: DeployLocalFormlessWorkspaceInput,
  dependencies: DeployLocalFormlessWorkspaceDependencies,
): Promise<DeployFormlessInstanceWorkspaceResult> {
  const planned = await planDeployLocalFormlessWorkspace(input, dependencies);
  const workspaceRoot = planned.workspaceRoot;
  const secretState = await readFormlessInstanceWorkspaceSecretState(workspaceRoot);
  let adminToken = resolveFormlessInstanceWorkspaceAdminToken({
    env: dependencies.env,
    secretState,
  });

  await ensureFormlessInstanceWorkspaceSecretStateIgnored(workspaceRoot);

  if (!adminToken) {
    adminToken = requiredGeneratedToken(dependencies.randomToken());
    await writeFormlessInstanceWorkspaceSecretState(workspaceRoot, { adminToken });
  }

  const deploymentStateRoot = formlessInstanceWorkspaceDeployStateRoot(workspaceRoot, planned.plan);
  const localSecretEnv = await dependencies.localSecretEnv.ensure({
    createSecret: dependencies.randomToken,
    root: deploymentStateRoot,
  });

  await copyLocalWorkspaceDeploySecretEnv({
    adminToken,
    credentialProfile: planned.credentialProfile,
    credentialProfileFromConfig: planned.credentialProfileFromConfig,
    env: dependencies.env,
    localSecretEnv,
    plan: planned.plan,
  });

  const deploymentSecrets = await readDestroyLocalDeploySecretEnv({
    deploymentStateRoot,
    env: dependencies.env,
  });
  const cloudflareApiToken = providerBearerCloudflareApiToken(planned.providerBearer);

  const deploymentStatePath = await writeLocalWorkspaceDeploymentState({
    credentialProfile: planned.credentialProfile,
    deploymentStateRoot,
    plan: planned.plan,
  });
  try {
    const deployment = await dependencies.deploymentAdapter.deploy({
      credentialProfile: planned.credentialProfile,
      deploymentResourceGraph: planned.desiredState.resourceGraph,
      packageRoot: dependencies.packageRoot,
      plan: planned.plan,
      ...(planned.providerBearer === undefined ? {} : { providerBearer: planned.providerBearer }),
      secrets: {
        ALCHEMY_PASSWORD: deploymentSecrets.secrets.ALCHEMY_PASSWORD,
        ...(cloudflareApiToken === undefined ? {} : { CLOUDFLARE_API_TOKEN: cloudflareApiToken }),
        FORMLESS_ADMIN_TOKEN: adminToken,
      },
      stateRoot: deploymentStateRoot,
      workspaceRoot,
      workspaceProgramArtifact: planned.workspaceProgramArtifact,
      workspaceProgramArtifactPath: planned.workspaceProgramArtifactPath,
      ...(planned.workspaceRuntimeExtensions === undefined
        ? {}
        : { workspaceRuntimeExtensions: planned.workspaceRuntimeExtensions }),
    });
    const deploymentUrl = normalizeFormlessInstanceWorkspaceTargetUrl(deployment.url);

    if (deploymentUrl !== planned.plan.expectedUrl.url) {
      throw new Error(
        `Formless provider reconciliation returned ${deploymentUrl}, expected target ${planned.plan.expectedUrl.url}.`,
      );
    }

    const healthCheck = await checkLocalWorkspaceDeploymentHealth({
      dependencies,
      deploymentUrl,
      plan: planned.plan,
      providerBearer: planned.providerBearer,
      selectedTarget: planned.selectedTarget,
    });

    await writeLocalWorkspaceDeploymentConfigSource({
      config: planned.config,
      now: dependencies.now(),
      plan: planned.plan,
      selectedTarget: planned.selectedTarget,
      workspaceRoot,
    });

    const ownerSetup =
      planned.existingSelectedTarget === undefined
        ? await createLocalWorkspaceOwnerSetup({
            adminToken,
            deploymentUrl,
            randomToken: dependencies.randomToken,
            setupCapability: dependencies.setupCapability,
          })
        : undefined;
    const deploymentObservation = await writeLocalWorkspaceDeploymentObservation(
      {
        adminToken,
        desiredState: planned.desiredState,
        observedStatus: "deployed",
        resourceEvidence: deployment.resourceEvidence ?? [],
        summary: deployDeploymentAppliedSummary({
          resourceCount: planned.desiredState.resourceCount,
          sourceLabel: "workspace source",
        }),
        targetUrl: deploymentUrl,
      },
      dependencies,
    );

    return {
      deployment: {
        url: deploymentUrl,
      },
      deploymentObservation,
      deploymentStatePath,
      deploymentStateRoot,
      healthCheck,
      localSecretEnv,
      ...(ownerSetup === undefined ? {} : { ownerSetup }),
      plan: planned.plan,
      secretPath: formlessInstanceWorkspaceSecretStatePath(workspaceRoot),
      selectedTarget: planned.selectedTarget,
      workspaceRoot,
    };
  } catch (error) {
    await tryWriteLocalWorkspaceDeploymentFailureObservation(
      {
        adminToken,
        desiredState: planned.desiredState,
        error,
        targetUrl: planned.selectedTarget.url,
      },
      dependencies,
    );

    throw error;
  }
}

async function writeLocalWorkspaceDeploymentObservation(
  input: {
    adminToken: string;
    desiredState: LocalWorkspaceDeploymentDesiredState;
    observedError?: string;
    observedStatus: FormlessInstanceDeploymentObservationPatch["observedStatus"];
    resourceEvidence: DeployEvidenceSummary[];
    summary: string;
    targetUrl: string;
  },
  dependencies: Pick<DeployLocalFormlessWorkspaceDependencies, "fetch" | "now">,
): Promise<DeployLocalFormlessWorkspaceObservation> {
  const observedAt = dependencies.now();
  const desiredStateVersion = await materializeDeployDesiredStateVersion({
    now: observedAt,
    resourceGraph: input.desiredState.resourceGraph,
    source: {
      fingerprint: input.desiredState.sourceFingerprint,
      intentRevision: input.desiredState.resourceGraph.resources.length,
    },
    targetId: input.desiredState.targetId,
  });
  const desiredState = deployDesiredStateVersionRef(desiredStateVersion);
  const runnerId = "local-gateway";
  const observation = deployDeploymentObservationPatch({
    desiredState,
    observedAt,
    observedError: input.observedError,
    observedStatus: input.observedStatus,
    observedSummary: input.summary,
    runnerId,
  });
  const observedError =
    typeof observation.observedError === "string" ? observation.observedError : undefined;

  await patchFormlessInstanceDeploymentConfigObservation(
    {
      adminToken: input.adminToken,
      observation,
      targetId: desiredState.targetId,
      targetUrl: input.targetUrl,
    },
    dependencies,
  );

  return {
    desiredState,
    evidence: summarizeLocalWorkspaceDeploymentEvidence(input.resourceEvidence),
    evidenceCount: input.resourceEvidence.length,
    observedAt: observation.observedAt,
    ...(observedError === undefined ? {} : { observedError }),
    observedStatus: observation.observedStatus,
    observedSummary: observation.observedSummary ?? "",
    resourceCount: desiredStateVersion.display.resourceCount,
    resourcesByKind: desiredStateVersion.display.resourcesByKind,
    runnerId,
    targetId: desiredState.targetId,
  };
}

async function tryWriteLocalWorkspaceDeploymentFailureObservation(
  input: {
    adminToken: string;
    desiredState: LocalWorkspaceDeploymentDesiredState;
    error: unknown;
    targetUrl: string;
  },
  dependencies: Pick<DeployLocalFormlessWorkspaceDependencies, "fetch" | "now">,
): Promise<void> {
  const failure = localWorkspaceDeployFailureSummary(input.error);

  try {
    await writeLocalWorkspaceDeploymentObservation(
      {
        adminToken: input.adminToken,
        desiredState: input.desiredState,
        observedError: failure.displayMessage,
        observedStatus: "failed",
        resourceEvidence: [],
        summary: failure.displayMessage,
        targetUrl: input.targetUrl,
      },
      dependencies,
    );
  } catch {
    // Preserve the original deploy failure; observation writes are best effort on failure paths.
  }
}

async function checkLocalWorkspaceDeploymentHealth(input: {
  dependencies: Pick<DeployLocalFormlessWorkspaceDependencies, "healthCheck">;
  deploymentUrl: string;
  plan: FormlessInstanceDeploymentPlan;
  providerBearer?: FormlessCliProviderBearerMaterial;
  selectedTarget: FormlessInstanceWorkspaceTarget;
}): Promise<CheckFormlessInstanceDeployMetadataResult> {
  try {
    return await input.dependencies.healthCheck.check({
      expectedVersion: input.plan.packageVersion,
      ...(input.providerBearer === undefined ? {} : { providerBearer: input.providerBearer }),
      url: input.deploymentUrl,
    });
  } catch {
    throw new DeployLocalFormlessWorkspaceStepError({
      evidence: {
        deploymentUrl: input.deploymentUrl,
        expectedVersion: input.plan.packageVersion,
        expectedUrl: input.plan.expectedUrl.url,
        providerFamily: "cloudflare",
        targetAlias: input.selectedTarget.alias,
        targetKind: "workers.dev",
        workerName: input.plan.resources.worker.name,
      },
      expectedUrl: input.plan.expectedUrl.url,
      retryGuidance:
        "Retry push after provider propagation, then check the Worker runtime and deploy metadata endpoint if the health check still fails.",
      stepId: "health-check",
      stepLabel: "Health check",
    });
  }
}

async function patchDeploymentStatusObservation(
  input: {
    adminToken: string;
    desiredState: DeployDesiredStateResponse["desiredState"];
    status: DeployLatestStatus;
    targetUrl: string;
  },
  dependencies: Pick<RefreshFormlessInstanceDeploymentObservationDependencies, "fetch" | "now">,
): Promise<DeployLocalFormlessWorkspaceObservation> {
  const desiredState = deployDesiredStateVersionRef(
    input.desiredState as DeployDesiredStateVersionLike,
  );
  const observation = deployDeploymentObservationPatchFromLatestStatus({
    desiredState,
    fallbackRunnerId: "local-gateway",
    status: input.status,
  });
  const observedError =
    typeof observation.observedError === "string" ? observation.observedError : undefined;
  const runnerId = observation.observedRunnerId ?? "local-gateway";

  await patchFormlessInstanceDeploymentConfigObservation(
    {
      adminToken: input.adminToken,
      observation,
      targetId: desiredState.targetId,
      targetUrl: input.targetUrl,
    },
    dependencies,
  );

  return {
    desiredState,
    evidence: summarizeLocalWorkspaceDeploymentEvidence([]),
    evidenceCount: 0,
    observedAt: observation.observedAt,
    ...(observedError === undefined ? {} : { observedError }),
    observedStatus: observation.observedStatus,
    observedSummary: observation.observedSummary ?? "",
    resourceCount: input.desiredState.display.resourceCount,
    resourcesByKind: input.desiredState.display.resourcesByKind,
    runnerId,
    targetId: desiredState.targetId,
  };
}

function summarizeLocalWorkspaceDeploymentEvidence(
  evidence: readonly DeployEvidenceSummary[],
): DeployLocalFormlessWorkspaceEvidenceSummary {
  return {
    actionsByKind: countBy(evidence, (entry) => entry.action),
    count: evidence.length,
    logicalIds: evidence.map((entry) => entry.logicalId),
    resourcesByKind: countBy(evidence, (entry) => entry.kind),
  };
}

function countBy<T>(items: readonly T[], selectKey: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const item of items) {
    const key = selectKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return counts;
}

function localWorkspaceDeployFailureSummary(_error: unknown): DeployFailureSummary {
  return deployDisplaySafeFailureSummary({
    code: "local-gateway-deploy-apply-failed",
    displayMessage: "Local workspace push provider reconciliation failed.",
  });
}

export async function planDeployLocalFormlessWorkspace(
  input: PlanDeployLocalFormlessWorkspaceInput,
  dependencies: PlanDeployLocalFormlessWorkspaceDependencies,
): Promise<PlanDeployLocalFormlessWorkspaceResult> {
  const workspaceRoot = await resolveFormlessInstanceWorkspaceRoot({
    cwd: dependencies.cwd,
    workspacePath: input.workspacePath,
  });
  const { config, configPath } = await readWorkspaceConfig(workspaceRoot);
  const controlPlane = await readInstanceWorkspaceProgramStorageSnapshot({
    manifest: config,
    workspaceRoot,
  });
  const deploymentSource = selectLocalWorkspaceDeploymentSource(controlPlane, input.targetAlias, {
    commandName: "push",
  });

  if (deploymentSource.deploymentConfig === undefined) {
    throw new Error(
      "Formless instance push requires an enabled instance deployment-config record.",
    );
  }

  const configuredSelectedTarget =
    deploymentSource.deploymentConfig === undefined
      ? undefined
      : formlessCliTargetFromDeploymentConfig(deploymentSource.deploymentConfig, "push");
  let existingSelectedTarget = configuredSelectedTarget;
  let preflight: CheckFormlessInstanceWorkspaceResult | undefined;

  if (configuredSelectedTarget && input.allowUnreadableTargetRecovery !== true) {
    try {
      preflight = await checkFormlessInstanceWorkspace(
        {
          targetAlias: configuredSelectedTarget.alias,
          workspacePath: workspaceRoot,
        },
        dependencies,
      );
    } catch (error) {
      if (!isMissingWorkersDevScriptError(error)) {
        throw error;
      }

      existingSelectedTarget = undefined;
    }
  }

  const credentialContext = await resolveLocalWorkspaceDeploymentCredentialContext({
    accountDiscovery: dependencies.accountDiscovery,
    credential: deploymentSource.credential,
    credentialAccess: input.credentialAccess ?? "mutable",
    deploymentConfig: deploymentSource.deploymentConfig,
    env: dependencies.env,
    fetch: dependencies.fetch,
    now: dependencies.now,
    workspaceRoot,
  });
  const planned = planLocalWorkspaceDeployment({
    account: credentialContext.account,
    adoptExistingDeployment: existingSelectedTarget !== undefined,
    config,
    credential: credentialContext.credential,
    credentialReference: credentialContext.credentialReference,
    credentialProfile: credentialContext.credentialProfile,
    deploymentConfig: deploymentSource.deploymentConfig,
    packageVersion: dependencies.packageVersion,
    providerBearer: credentialContext.providerBearer,
    targetAlias: input.targetAlias,
  });
  const desiredState = projectLocalWorkspaceDeploymentDesiredState({
    controlPlane,
    plan: planned.plan,
    targetId: planned.selectedTarget.alias,
  });
  const activeProgram = await materializeActiveWorkspaceProgramArtifact(workspaceRoot, config);
  const workspaceRuntimeExtensions = runtimeWorkspaceExtensionsEnvValue(config);

  return {
    ...planned,
    desiredState,
    ...(existingSelectedTarget === undefined ? {} : { existingSelectedTarget }),
    configPath,
    ...(preflight === undefined ? {} : { preflight }),
    workspaceProgramArtifact: activeProgram.contents,
    workspaceProgramArtifactPath: activeProgram.path,
    ...(workspaceRuntimeExtensions === undefined ? {} : { workspaceRuntimeExtensions }),
    workspaceRoot,
  };
}

export async function preflightPushFormlessCloudflareOAuthCredential(
  input: Pick<PushFormlessInstanceWorkspaceInput, "targetAlias" | "workspacePath">,
  dependencies: Pick<PushFormlessInstanceWorkspaceDependencies, "cwd">,
): Promise<PushFormlessInstanceWorkspaceCloudflareOAuthPreflightResult> {
  const workspaceRoot = await resolveFormlessInstanceWorkspaceRoot({
    cwd: dependencies.cwd,
    workspacePath: input.workspacePath,
  });
  const { config } = await readWorkspaceConfig(workspaceRoot);
  const controlPlane = await readInstanceWorkspaceProgramStorageSnapshot({
    manifest: config,
    workspaceRoot,
  });
  const deploymentSource = selectLocalWorkspaceDeploymentSource(controlPlane, input.targetAlias, {
    commandName: "push",
  });

  if (deploymentSource.deploymentConfig === undefined) {
    throw new Error(
      "Formless instance push requires an enabled instance deployment-config record.",
    );
  }

  const selectedTarget = formlessCliTargetFromDeploymentConfig(
    deploymentSource.deploymentConfig,
    "push",
  );
  const deploymentConfigId = deploymentSource.deploymentConfig.id;

  if (deploymentSource.credential === undefined) {
    return {
      deploymentConfigId,
      needsSetup: true,
      reason: "missing-credential-ref",
      selectedTarget,
      workspaceRoot,
    };
  }

  if (deploymentSource.credential.kind === "alchemy-profile") {
    return {
      deploymentConfigId,
      needsSetup: true,
      reason: "alchemy-credential-ref",
      selectedTarget,
      workspaceRoot,
    };
  }

  const credentialExists = await hasLocalWorkspaceFormlessCloudflareOAuthCredential({
    credential: deploymentSource.credential,
    workspaceRoot,
  });

  if (!credentialExists) {
    return {
      credentialId: deploymentSource.credential.credentialId,
      credentialRef: deploymentSource.credential.credentialRef,
      deploymentConfigId,
      needsSetup: true,
      reason: "missing-local-oauth-secret",
      selectedTarget,
      workspaceRoot,
    };
  }

  return {
    credentialId: deploymentSource.credential.credentialId,
    credentialRef: deploymentSource.credential.credentialRef,
    deploymentConfigId,
    needsSetup: false,
    selectedTarget,
    workspaceRoot,
  };
}

function isMissingWorkersDevScriptError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();

  return (
    message.includes("worker_script_not_found") ||
    message.includes("workers_dev_script_not_found") ||
    (message.includes("error 1042") && message.includes("no workers script")) ||
    (message.includes("error 1104") && message.includes("script not found"))
  );
}

export async function deployFormlessInstanceWorkspace(
  input: DeployFormlessInstanceWorkspaceInput,
  dependencies: DeployFormlessInstanceWorkspaceDependencies,
): Promise<DeployFormlessInstanceWorkspaceResult> {
  const planned = await planDeployFormlessInstanceWorkspace(input, dependencies);
  const { plan, selectedTarget, workspaceRoot } = planned;
  const secretState = await readFormlessInstanceWorkspaceSecretState(workspaceRoot);
  const adminToken = resolveFormlessInstanceWorkspaceAdminToken({
    env: dependencies.env,
    secretState,
  });

  if (!adminToken) {
    throw new Error(missingAdminTokenMessage("deploy"));
  }

  await ensureFormlessInstanceWorkspaceSecretStateIgnored(workspaceRoot);

  const deploymentStateRoot = formlessInstanceWorkspaceDeployStateRoot(workspaceRoot, plan);
  const localSecretEnv = await dependencies.localSecretEnv.ensure({
    createSecret: dependencies.randomToken,
    root: deploymentStateRoot,
  });
  const cloudflareApiToken = providerBearerCloudflareApiToken(planned.providerBearer);
  const deployment = await dependencies.deploymentAdapter.deploy({
    credentialProfile: planned.credentialProfile,
    packageRoot: dependencies.packageRoot,
    plan,
    ...(planned.providerBearer === undefined ? {} : { providerBearer: planned.providerBearer }),
    secrets: {
      ALCHEMY_PASSWORD: localSecretEnv.secrets.ALCHEMY_PASSWORD,
      ...(cloudflareApiToken === undefined ? {} : { CLOUDFLARE_API_TOKEN: cloudflareApiToken }),
      FORMLESS_ADMIN_TOKEN: adminToken,
    },
    stateRoot: deploymentStateRoot,
    workspaceRoot,
    workspaceProgramArtifact: planned.workspaceProgramArtifact,
    workspaceProgramArtifactPath: planned.workspaceProgramArtifactPath,
    ...(planned.workspaceRuntimeExtensions === undefined
      ? {}
      : { workspaceRuntimeExtensions: planned.workspaceRuntimeExtensions }),
  });
  const deploymentUrl = normalizeFormlessInstanceWorkspaceTargetUrl(deployment.url);

  if (deploymentUrl !== plan.expectedUrl.url) {
    throw new Error(
      `Formless instance deploy returned ${deploymentUrl}, expected claimed target ${plan.expectedUrl.url}.`,
    );
  }

  const healthCheck = await dependencies.healthCheck.check({
    expectedVersion: plan.packageVersion,
    ...(planned.providerBearer === undefined ? {} : { providerBearer: planned.providerBearer }),
    url: deploymentUrl,
  });

  return {
    deployment: {
      url: deploymentUrl,
    },
    deploymentStateRoot,
    healthCheck,
    localSecretEnv,
    plan,
    secretPath: formlessInstanceWorkspaceSecretStatePath(workspaceRoot),
    selectedTarget,
    workspaceRoot,
  };
}

export async function planDeployFormlessInstanceWorkspace(
  input: DeployFormlessInstanceWorkspaceInput,
  dependencies: PlanDeployFormlessInstanceWorkspaceDependencies,
): Promise<PlanDeployFormlessInstanceWorkspaceResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const { config } = await readWorkspaceConfig(workspaceRoot);
  const controlPlane = await readInstanceWorkspaceProgramStorageSnapshot({
    manifest: config,
    workspaceRoot,
  });
  const deploymentSource = selectLocalWorkspaceDeploymentSource(controlPlane, input.targetAlias, {
    commandName: "deploy",
  });
  const selectedTarget =
    deploymentSource.deploymentConfig === undefined
      ? undefined
      : formlessCliTargetFromDeploymentConfig(deploymentSource.deploymentConfig, "deploy");

  if (selectedTarget === undefined) {
    throw new Error(
      "Formless instance deploy requires an enabled instance deployment-config record.",
    );
  }

  const plan = formlessInstanceWorkspaceDeploymentPlan({
    config,
    deploymentConfig: deploymentSource.deploymentConfig,
    packageVersion: dependencies.packageVersion,
    selectedTarget,
  });
  const activeProgram = await materializeActiveWorkspaceProgramArtifact(workspaceRoot, config);
  const workspaceRuntimeExtensions = runtimeWorkspaceExtensionsEnvValue(config);
  const credentialContext = await resolveLocalWorkspaceDeploymentCredentialContext({
    credential: deploymentSource.credential,
    credentialAccess: "mutable",
    deploymentConfig: deploymentSource.deploymentConfig,
    env: dependencies.env,
    workspaceRoot,
  });

  return {
    credential: credentialContext.credential,
    credentialProfile: credentialContext.credentialProfile,
    plan,
    ...(credentialContext.providerBearer === undefined
      ? {}
      : { providerBearer: credentialContext.providerBearer }),
    selectedTarget,
    workspaceProgramArtifact: activeProgram.contents,
    workspaceProgramArtifactPath: activeProgram.path,
    ...(workspaceRuntimeExtensions === undefined ? {} : { workspaceRuntimeExtensions }),
    workspaceRoot,
  };
}

export async function destroyLocalFormlessWorkspace(
  input: DestroyLocalFormlessWorkspaceInput,
  dependencies: DestroyLocalFormlessWorkspaceDependencies,
): Promise<DestroyFormlessInstanceWorkspaceResult> {
  const workspaceRoot = await resolveFormlessInstanceWorkspaceRoot({
    cwd: dependencies.cwd,
    workspacePath: input.workspacePath,
  });

  return destroyFormlessInstanceWorkspace(
    {
      confirm: input.confirm,
      targetAlias: input.targetAlias,
      workspacePath: workspaceRoot,
    },
    dependencies,
  );
}

export async function destroyFormlessInstanceWorkspace(
  input: DestroyFormlessInstanceWorkspaceInput,
  dependencies: DestroyFormlessInstanceWorkspaceDependencies,
): Promise<DestroyFormlessInstanceWorkspaceResult> {
  const destroy = dependencies.deploymentAdapter.destroy;

  if (!destroy) {
    throw new Error(
      "Formless instance destroy requires a deployment adapter with destroy support.",
    );
  }

  const providerContext = await resolveFormlessInstanceWorkspaceProviderContext(
    {
      commandName: "destroy",
      targetAlias: input.targetAlias,
      workspacePath: input.workspacePath,
    },
    dependencies,
  );
  const plan = providerContext.plan;

  if (input.confirm !== plan.resources.worker.name) {
    throw new Error(
      `Formless instance destroy confirmation must match Worker name "${plan.resources.worker.name}".`,
    );
  }

  const routeProviderResources =
    await destroyRouteProviderResourcesFromWorkspaceSource(providerContext);
  const result = await destroy({
    credentialProfile: providerContext.credentialProfile,
    domainProviderPlan: domainProviderPlanFromDeploymentPlan(plan),
    domainProviderResources: routeProviderResources.resourceGraph,
    packageRoot: dependencies.packageRoot,
    plan,
    ...(providerContext.providerBearer === undefined
      ? {}
      : { providerBearer: providerContext.providerBearer }),
    secrets: providerContext.secrets,
    stateRoot: providerContext.deploymentStateRoot,
  });

  await removeLocalWorkspaceDeployState(providerContext.deploymentStateRoot);

  return {
    deploymentStatePath: providerContext.deploymentStatePath,
    deploymentStateRoot: providerContext.deploymentStateRoot,
    destroy: result,
    localSecretPath: providerContext.localSecretPath,
    plan,
    routeProviderResources,
    selectedTarget: providerContext.selectedTarget,
    workspaceRoot: providerContext.workspaceRoot,
  };
}

export async function resolveFormlessInstanceWorkspaceProviderContext(
  input: {
    commandName: "destroy" | "domains run";
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    packageVersion: string;
  },
): Promise<FormlessInstanceWorkspaceProviderContext> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const { config } = await readWorkspaceConfig(workspaceRoot);
  const controlPlane = await readInstanceWorkspaceProgramStorageSnapshot({
    manifest: config,
    workspaceRoot,
  });
  const deploymentSource = selectLocalWorkspaceDeploymentSource(controlPlane, input.targetAlias, {
    commandName: input.commandName,
  });
  const selectedTarget =
    deploymentSource.deploymentConfig === undefined
      ? undefined
      : formlessCliTargetFromDeploymentConfig(deploymentSource.deploymentConfig, input.commandName);

  if (selectedTarget === undefined) {
    throw new Error(
      `Formless instance ${input.commandName} requires an enabled instance deployment-config record.`,
    );
  }

  const plan = formlessInstanceWorkspaceDeploymentPlan({
    commandName: input.commandName,
    config,
    deploymentConfig: deploymentSource.deploymentConfig,
    packageVersion: dependencies.packageVersion,
    selectedTarget,
  });
  const deploymentStateRoot = formlessInstanceWorkspaceDeployStateRoot(workspaceRoot, plan);
  const deploymentStatePath = await readRequiredLocalWorkspaceDeploymentState({
    deploymentStateRoot,
    plan,
  });
  const localSecretEnv = await readDestroyLocalDeploySecretEnv({
    deploymentStateRoot,
    env: dependencies.env,
  });
  const credentialContext = await resolveLocalWorkspaceDeploymentCredentialContext({
    credential: deploymentSource.credential,
    credentialAccess: "mutable",
    credentialProfileFallback: localSecretEnv.credentialProfile,
    deploymentConfig: deploymentSource.deploymentConfig,
    env: providerCredentialEnvWithDeploySecrets({
      env: dependencies.env,
      values: localSecretEnv.values,
    }),
    workspaceRoot,
  });
  const cloudflareApiToken = providerBearerCloudflareApiToken(credentialContext.providerBearer);

  return {
    config,
    credential: credentialContext.credential,
    credentialProfile: credentialContext.credentialProfile,
    deploymentStatePath,
    deploymentStateRoot,
    localSecretPath: localSecretEnv.path,
    plan,
    ...(credentialContext.providerBearer === undefined
      ? {}
      : { providerBearer: credentialContext.providerBearer }),
    secrets: {
      ALCHEMY_PASSWORD: localSecretEnv.secrets.ALCHEMY_PASSWORD,
      ...(cloudflareApiToken === undefined ? {} : { CLOUDFLARE_API_TOKEN: cloudflareApiToken }),
    },
    selectedTarget,
    workspaceRoot,
  };
}

type LocalWorkspaceDeploymentPlanResult = {
  config: FormlessResolvedConfig;
  credential: LocalWorkspaceDeploymentCredential;
  credentialProfile: string | null;
  credentialProfileFromConfig: boolean;
  deploymentDisplay: LocalWorkspaceDeploymentDisplayFacts;
  plan: FormlessInstanceDeploymentPlan;
  providerBearer?: FormlessCliProviderBearerMaterial;
  selectedTarget: FormlessInstanceWorkspaceTarget;
};

export type LocalWorkspaceDeploymentDisplayFacts = {
  accountId: string;
  accountName?: string;
  credentialRef?: string;
  profile?: string;
  profileRef?: string;
  providerFamily: "cloudflare";
  target: string;
  targetUrl: string;
  workerName: string;
  workersDevSubdomain: string;
};

type LocalWorkspaceDeploymentDesiredState = {
  logicalIds: string[];
  resourceCount: number;
  resourceGraph: DeployResourceGraph;
  resourcesByKind: Record<DeployResourceKind, number>;
  sourceFingerprint: string;
  targetId: string;
};

function planLocalWorkspaceDeployment(input: {
  account: FormlessInstanceDeploymentAccount;
  adoptExistingDeployment: boolean;
  config: FormlessResolvedConfig;
  credential: LocalWorkspaceDeploymentCredential;
  credentialReference: FormlessCliDeploymentCredentialReference;
  credentialProfile: string | null;
  deploymentConfig?: StoredRecord;
  packageVersion: string;
  providerBearer?: FormlessCliProviderBearerMaterial;
  targetAlias?: string | null;
}): LocalWorkspaceDeploymentPlanResult {
  const credential = input.credential;
  const credentialProfile = input.credentialProfile;
  const credentialProfileFromConfig = input.credential?.kind === "alchemy-profile";
  const workerName = formlessCliDeploymentWorkerNameFromConfig({
    config: input.config,
    deploymentConfig: input.deploymentConfig,
  });
  const plan = planFormlessInstanceDeployment({
    account: input.account,
    adoptExistingDeployment: input.adoptExistingDeployment,
    instanceName: workerName,
    packageVersion: input.packageVersion,
  });

  const targetAlias =
    input.targetAlias ??
    stringRecordValue(input.deploymentConfig, "targetId") ??
    input.deploymentConfig?.id ??
    formlessCliPrimaryTargetId();
  const targetUrl = stringRecordValue(input.deploymentConfig, "targetUrl");
  const selectedTarget = {
    alias: targetAlias,
    url:
      targetUrl === undefined
        ? plan.expectedUrl.url
        : normalizeFormlessInstanceWorkspaceTargetUrl(targetUrl),
  };

  if (selectedTarget.url !== plan.expectedUrl.url) {
    throw new Error(
      `Formless push target "${targetAlias}" targetUrl ${selectedTarget.url} does not match planned URL ${plan.expectedUrl.url}.`,
    );
  }

  return {
    config: input.config,
    credential,
    credentialProfile,
    credentialProfileFromConfig,
    deploymentDisplay: localWorkspaceDeploymentDisplayFacts({
      account: input.account,
      credentialReference: input.credentialReference,
      plan,
      providerFamily: "cloudflare",
      selectedTarget,
    }),
    plan,
    ...(input.providerBearer === undefined ? {} : { providerBearer: input.providerBearer }),
    selectedTarget,
  };
}

function localWorkspaceDeploymentDisplayFacts(input: {
  account: FormlessInstanceDeploymentAccount;
  credentialReference: FormlessCliDeploymentCredentialReference;
  plan: FormlessInstanceDeploymentPlan;
  providerFamily: "cloudflare";
  selectedTarget: FormlessInstanceWorkspaceTarget;
}): LocalWorkspaceDeploymentDisplayFacts {
  const credentialFacts =
    input.credentialReference.kind === "formless-cloudflare-oauth"
      ? { credentialRef: input.credentialReference.credentialRef }
      : {
          profile: input.credentialReference.profile,
          profileRef: input.credentialReference.profileRef,
        };

  return {
    accountId: input.account.id,
    ...(input.account.name === undefined ? {} : { accountName: input.account.name }),
    ...credentialFacts,
    providerFamily: input.providerFamily,
    target: input.selectedTarget.alias,
    targetUrl: input.selectedTarget.url,
    workerName: input.plan.resources.worker.name,
    workersDevSubdomain: input.account.workersDevSubdomain,
  };
}

function projectLocalWorkspaceDeploymentDesiredState(input: {
  controlPlane: WorkspaceControlPlaneRecords | undefined;
  plan: FormlessInstanceDeploymentPlan;
  targetId: string;
}): LocalWorkspaceDeploymentDesiredState {
  const routeProjection = projectDeployControlPlaneDesiredState(
    deployDesiredStateProjectionInputFromControlPlaneRecords({
      records: input.controlPlane?.records ?? [],
      instanceId: input.plan.runtimeVars.FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID,
      targetId: input.targetId,
      workerName: input.plan.resources.worker.name,
    }),
  );
  const resourceGraph = routeProjection.resourceGraph;

  return {
    logicalIds: resourceGraph.resources.map((resource) => resource.logicalId),
    resourceCount: resourceGraph.resources.length,
    resourceGraph,
    resourcesByKind: deployResourceCountsByKind(resourceGraph),
    sourceFingerprint: routeProjection.sourceFingerprint,
    targetId: input.targetId,
  };
}

function formlessInstanceWorkspaceDeploymentPlan(input: {
  commandName?: "deploy" | "destroy" | "domains run";
  config: FormlessResolvedConfig;
  deploymentConfig?: StoredRecord;
  packageVersion: string;
  selectedTarget: FormlessInstanceWorkspaceTarget;
}): FormlessInstanceDeploymentPlan {
  const commandName = input.commandName ?? "deploy";
  const targetUrl = input.selectedTarget.url;
  const workerName = formlessCliDeploymentWorkerNameFromConfig({
    config: input.config,
    deploymentConfig: input.deploymentConfig,
  });
  const facts = formlessCliWorkersDevTargetFacts(targetUrl, workerName);
  const accountId = stringRecordValue(input.deploymentConfig, "accountId")?.trim();

  if (!accountId) {
    throw new Error(`Formless instance ${commandName} requires deployment-config.accountId.`);
  }

  return planFormlessInstanceDeployment({
    account: {
      id: accountId,
      workersDevSubdomain: facts.workersDevSubdomain,
    },
    adoptExistingDeployment: true,
    instanceName: facts.workerName,
    packageVersion: input.packageVersion,
  });
}

function formlessInstanceWorkspaceDeployStateRoot(
  workspaceRoot: string,
  plan: FormlessInstanceDeploymentPlan,
): string {
  return path.join(workspaceRoot, ".formless/deploy", plan.resources.worker.name);
}
async function readWorkspaceAdminToken(
  workspaceRoot: string,
  dependencies: {
    env?: NodeJS.ProcessEnv;
  },
): Promise<string | null> {
  const secretState = await readFormlessInstanceWorkspaceSecretState(workspaceRoot);
  return resolveFormlessInstanceWorkspaceAdminToken({
    env: dependencies.env,
    secretState,
  });
}

async function readRequiredLocalWorkspaceDeploymentState(input: {
  deploymentStateRoot: string;
  plan: FormlessInstanceDeploymentPlan;
}): Promise<string> {
  const statePath = path.join(input.deploymentStateRoot, FORMLESS_INSTANCE_STATE_FILE);
  const contents = await readTextFileIfExists(statePath);

  if (contents === null) {
    throw new Error(`Formless instance destroy requires ignored deploy state ${statePath}.`);
  }

  const state = parseFormlessInstanceStateJson(contents);

  assertDeploymentStateMatchesPlan({
    plan: input.plan,
    state,
    statePath,
  });

  return statePath;
}

function assertDeploymentStateMatchesPlan(input: {
  plan: FormlessInstanceDeploymentPlan;
  state: {
    accountId: string;
    authorityNamespaceName: string;
    mediaBucketName: string;
    workerName: string;
    workersDevUrl: string;
  };
  statePath: string;
}): void {
  assertMatchingDeploymentStateField({
    actual: input.state.accountId,
    expected: input.plan.account.id,
    field: "accountId",
    statePath: input.statePath,
  });
  assertMatchingDeploymentStateField({
    actual: input.state.workerName,
    expected: input.plan.resources.worker.name,
    field: "workerName",
    statePath: input.statePath,
  });
  assertMatchingDeploymentStateField({
    actual: input.state.workersDevUrl,
    expected: input.plan.expectedUrl.url,
    field: "workersDevUrl",
    statePath: input.statePath,
  });
  assertMatchingDeploymentStateField({
    actual: input.state.mediaBucketName,
    expected: input.plan.resources.mediaBucket.name,
    field: "mediaBucketName",
    statePath: input.statePath,
  });
  assertMatchingDeploymentStateField({
    actual: input.state.authorityNamespaceName,
    expected: input.plan.resources.authority.namespaceName,
    field: "authorityNamespaceName",
    statePath: input.statePath,
  });
}

function assertMatchingDeploymentStateField(input: {
  actual: string;
  expected: string;
  field: string;
  statePath: string;
}): void {
  if (input.actual !== input.expected) {
    throw new Error(
      `Formless instance destroy deploy state ${input.statePath} field "${input.field}" is "${input.actual}", expected "${input.expected}".`,
    );
  }
}

async function readDestroyLocalDeploySecretEnv(input: {
  deploymentStateRoot: string;
  env: NodeJS.ProcessEnv | undefined;
}): Promise<{
  credentialProfile: string | null;
  path: string;
  secrets: {
    ALCHEMY_PASSWORD: string;
  };
  values: Record<string, string>;
}> {
  const secretPath = path.join(input.deploymentStateRoot, FORMLESS_INSTANCE_LOCAL_ENV_FILE);
  const contents = await readTextFileIfExists(secretPath);

  if (contents === null) {
    throw new Error(`Formless instance destroy requires ignored deploy secrets ${secretPath}.`);
  }

  const values = parseDotEnv(contents);
  const alchemyPassword = requiredDeploySecretValue(
    values[ALCHEMY_PASSWORD_ENV_NAME],
    ALCHEMY_PASSWORD_ENV_NAME,
    secretPath,
  );
  const credentialProfile =
    optionalDeploySecretValue(input.env?.ALCHEMY_PROFILE) ??
    optionalDeploySecretValue(values.ALCHEMY_PROFILE) ??
    null;

  return {
    credentialProfile,
    path: secretPath,
    secrets: {
      ALCHEMY_PASSWORD: alchemyPassword,
    },
    values,
  };
}

function requiredDeploySecretValue(
  value: string | undefined,
  key: string,
  secretPath: string,
): string {
  const normalized = optionalDeploySecretValue(value);

  if (normalized === undefined) {
    throw new Error(
      `Formless instance destroy requires ${key} in ignored deploy secrets ${secretPath}.`,
    );
  }

  return normalized;
}

function optionalDeploySecretValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();

  return normalized ? normalized : undefined;
}

function providerCredentialEnvWithDeploySecrets(input: {
  env: NodeJS.ProcessEnv | undefined;
  values: Record<string, string>;
}): NodeJS.ProcessEnv {
  return {
    ...input.values,
    ...input.env,
  };
}

function providerBearerCloudflareApiToken(
  providerBearer: FormlessCliProviderBearerMaterial | undefined,
): string | undefined {
  return providerBearer?.kind === "cloudflare-api-token" ? providerBearer.token : undefined;
}

function domainProviderPlanFromDeploymentPlan(
  plan: FormlessInstanceDeploymentPlan,
): DomainProviderPlan {
  return {
    blockers: [],
    instanceId: plan.runtimeVars.FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID,
    policy: "create-only",
    resources: [],
    workerName: plan.runtimeVars.FORMLESS_DOMAIN_PROVIDER_WORKER_NAME,
  };
}

async function destroyRouteProviderResourcesFromWorkspaceSource(
  context: FormlessInstanceWorkspaceProviderContext,
): Promise<DestroyFormlessInstanceWorkspaceRouteProviderResources> {
  const source = await readDestroyRouteProjectionSource(context);
  const projection = projectDeployControlPlaneDesiredState(source.projectionInput);
  const resourceGraph = projection.resourceGraph;
  const enabledHosts = destroyRouteProviderResourceHosts(resourceGraph);

  return {
    enabledHosts,
    resourceGraph,
    resourceCount: resourceGraph.resources.length,
    routeCount: enabledHosts.length,
    source: source.source,
  };
}

async function readDestroyRouteProjectionSource(
  context: FormlessInstanceWorkspaceProviderContext,
): Promise<{
  projectionInput: DeployDesiredStateProjectionInput;
  source: DestroyFormlessInstanceWorkspaceRouteProviderResources["source"];
}> {
  const controlPlane = await readInstanceWorkspaceProgramStorageSnapshot({
    manifest: context.config,
    workspaceRoot: context.workspaceRoot,
  });

  return {
    projectionInput: deployDesiredStateProjectionInputFromControlPlaneRecords({
      records: controlPlane?.records ?? [],
      instanceId: context.plan.runtimeVars.FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID,
      targetId: formlessCliPrimaryTargetId(),
      workerName: context.plan.runtimeVars.FORMLESS_DOMAIN_PROVIDER_WORKER_NAME,
    }),
    source: "instance:route",
  };
}

function destroyRouteProviderResourceHosts(resourceGraph: DeployResourceGraph): string[] {
  return [
    ...new Set(
      resourceGraph.resources
        .map((resource) => {
          const host = resource.inputs.host ?? resource.inputs.fromHost;

          return typeof host === "string" ? host : undefined;
        })
        .filter((host): host is string => host !== undefined),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

async function removeLocalWorkspaceDeployState(deploymentStateRoot: string): Promise<void> {
  await rm(deploymentStateRoot, { force: true, recursive: true });
}

async function copyLocalWorkspaceDeploySecretEnv(input: {
  adminToken: string;
  credentialProfile: string | null;
  credentialProfileFromConfig: boolean;
  env: NodeJS.ProcessEnv | undefined;
  localSecretEnv: EnsureFormlessInstanceLocalSecretEnvResult;
  plan: FormlessInstanceDeploymentPlan;
}): Promise<void> {
  const current = await readTextFileIfExists(input.localSecretEnv.path);
  const values = parseDotEnv(current ?? "");

  values[ALCHEMY_PASSWORD_ENV_NAME] = input.localSecretEnv.secrets.ALCHEMY_PASSWORD;
  values[FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME] = input.adminToken;
  values.CLOUDFLARE_ACCOUNT_ID = input.plan.account.id;
  delete values.CLOUDFLARE_API_TOKEN;
  delete values.CF_API_TOKEN;

  const alchemyProfile = input.credentialProfileFromConfig
    ? input.credentialProfile
    : (input.credentialProfile ?? input.env?.ALCHEMY_PROFILE?.trim());
  const alchemyStateToken = input.env?.ALCHEMY_STATE_TOKEN?.trim();

  if (alchemyProfile) {
    values.ALCHEMY_PROFILE = alchemyProfile;
  } else {
    delete values.ALCHEMY_PROFILE;
  }

  if (alchemyStateToken) {
    values.ALCHEMY_STATE_TOKEN = alchemyStateToken;
  }

  await mkdir(path.dirname(input.localSecretEnv.path), { recursive: true });
  await writeFile(input.localSecretEnv.path, formatDotEnv(values));
}

async function writeLocalWorkspaceDeploymentState(input: {
  credentialProfile: string | null;
  deploymentStateRoot: string;
  plan: FormlessInstanceDeploymentPlan;
}): Promise<string> {
  const statePath = path.join(input.deploymentStateRoot, FORMLESS_INSTANCE_STATE_FILE);

  await mkdir(input.deploymentStateRoot, { recursive: true });
  await writeFile(
    statePath,
    formatFormlessInstanceState(
      createFormlessInstanceState({
        credentialProfile: input.credentialProfile,
        plan: input.plan,
      }),
    ),
  );

  return statePath;
}

async function writeLocalWorkspaceDeploymentConfigSource(input: {
  config: FormlessResolvedConfig;
  now: string;
  plan: FormlessInstanceDeploymentPlan;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
}) {
  const current = await readInstanceWorkspaceProgramStorageSnapshot({
    manifest: input.config,
    workspaceRoot: input.workspaceRoot,
  });
  const targetId = input.selectedTarget.alias;
  const existing = current?.records.find(
    (record) =>
      record.entity === "deployment-config" &&
      (record.id === targetId || stringRecordValue(record, "targetId") === targetId),
  );
  const deploymentConfigRecord: StoredRecord = {
    id: targetId,
    entity: "deployment-config",
    values: {
      ...withoutControlPlaneLifecycleValues(existing?.values ?? {}),
      targetId,
      targetKind: "instance",
      label: stringRecordValue(existing, "label") ?? targetId,
      enabled: true,
      targetUrl: input.selectedTarget.url,
      providerFamily: "cloudflare",
      accountId: input.plan.account.id,
      workerName: input.plan.resources.worker.name,
    },
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
  };
  const records = [
    ...(current?.records.filter(
      (record) =>
        !(
          record.entity === "deployment-config" &&
          (record.id === targetId || stringRecordValue(record, "targetId") === targetId)
        ),
    ) ?? []),
    deploymentConfigRecord,
  ];

  await writeInstanceWorkspaceProgramStorageSnapshot({
    manifest: input.config,
    snapshot: workspaceControlPlaneSnapshotFromRecords({
      current,
      exportedAt: input.now,
      records,
      schemaUpdatedAt: input.now,
    }),
    workspaceRoot: input.workspaceRoot,
  });
}

async function createLocalWorkspaceOwnerSetup(input: {
  adminToken: string;
  deploymentUrl: string;
  randomToken: () => string;
  setupCapability: FormlessInstanceOwnerSetupCapabilityAdapter;
}): Promise<DeployLocalFormlessWorkspaceOwnerSetup> {
  const setupToken = generatedOwnerSetupToken(input.randomToken);
  const capability = await input.setupCapability.create({
    adminToken: input.adminToken,
    deploymentUrl: input.deploymentUrl,
    setupToken,
  });

  return {
    capability,
    url: formatFormlessOwnerSetupUrl({
      deploymentUrl: input.deploymentUrl,
      setupToken,
    }),
  };
}

function generatedOwnerSetupToken(randomToken: () => string): string {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return parseOwnerSetupToken(randomToken());
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function requiredGeneratedToken(value: string): string {
  const token = value.trim();

  if (token === "") {
    throw new Error("Generated Formless admin token must be a non-empty string.");
  }

  return token;
}

function missingAdminTokenMessage(action: "adopt" | "deploy" | "push"): string {
  return [
    action === "adopt"
      ? "Formless instance token adopt requires an admin token."
      : action === "push"
        ? "Formless push requires an admin token."
        : "Formless instance deploy requires an admin token.",
    action === "adopt"
      ? `Cloudflare Worker secrets cannot be read back; pass --admin-token or set ${FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME}.`
      : `Cloudflare Worker secrets cannot be read back; run \`formless token adopt\`, run \`formless token rotate\`, or set ${FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME}.`,
  ].join(" ");
}

async function readTextFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
