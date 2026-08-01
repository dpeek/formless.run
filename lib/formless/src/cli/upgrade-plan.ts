import type { PackageAppKey } from "@dpeek/formless-installed-apps";
import { ARCHIVE_VERSION, INSTANCE_ARCHIVE_KIND } from "../program/archive.ts";
import {
  FORMLESS_RUNTIME_PROTOCOL_VERSION,
  FORMLESS_STORAGE_MIGRATION_SET_ID,
} from "../shared/deploy-metadata.ts";
import { isRuntimeInstallableAppPackageKey } from "../shared/app-packages.ts";
import type {
  PackageAppRevision,
  SourceSchemaHash,
  UpgradeMigrationChecksum,
  UpgradeMigrationId,
  UpgradeMigrationSafetyClass,
} from "../shared/upgrade-migrations.ts";
import type {
  FormlessInstanceTargetInstalledAppUpgradeFacts,
  FormlessInstanceTargetLocalPackageUpgradeFacts,
  FormlessInstanceTargetUpgradeStatus,
  FormlessInstanceTargetUpgradeVerificationFailure,
} from "./instance-target-client.ts";

export type CliUpgradePlanStepType =
  | "archive-input"
  | "backup"
  | "browser-reload"
  | "code-deploy"
  | "manual-approval"
  | "package-app-migration"
  | "sql-migration";

export type CliUpgradePlanStepStatus = "blocked" | "pending" | "ready";

export type CliUpgradePlanTargetIdentity = {
  archivePath?: string;
  label?: string;
  storageIdentity?: string;
  targetId?: string;
  targetUrl?: string;
};

export type CliUpgradePlanPackageAppIdentity = {
  fromPackageRevision?: PackageAppRevision;
  installId?: string;
  packageAppKey: PackageAppKey;
  sourceSchemaHash?: SourceSchemaHash;
  toPackageRevision?: PackageAppRevision;
};

export type CliUpgradePlanEvidenceRequirement = {
  description: string;
  kind: string;
  reference?: string;
};

type CliUpgradePlanStepStatusFields =
  | {
      status: "blocked";
      statusReason: string;
    }
  | {
      status: "pending";
      statusReason: string;
    }
  | {
      status: "ready";
      statusReason?: never;
    };

type CliUpgradePlanStepBase = CliUpgradePlanStepStatusFields & {
  id: string;
  packageApp?: CliUpgradePlanPackageAppIdentity;
  requiredEvidence: readonly CliUpgradePlanEvidenceRequirement[];
  safety: UpgradeMigrationSafetyClass;
  summary: string;
  target: CliUpgradePlanTargetIdentity;
  type: CliUpgradePlanStepType;
};

export type CliUpgradeCodeDeployStep = CliUpgradePlanStepBase & {
  fromPackageVersion?: string | null;
  fromRuntimeProtocolVersion?: number | null;
  fromStorageMigrationSet?: string | null;
  toPackageVersion: string;
  toRuntimeProtocolVersion?: number;
  toStorageMigrationSet?: string;
  type: "code-deploy";
};

export type CliUpgradeSqlMigrationStep = CliUpgradePlanStepBase & {
  checksum: UpgradeMigrationChecksum;
  migrationId: UpgradeMigrationId;
  owner?: string;
  storageFamily: string;
  type: "sql-migration";
};

export type CliUpgradePackageAppMigrationStep = CliUpgradePlanStepBase & {
  checksum: UpgradeMigrationChecksum;
  migrationId: UpgradeMigrationId;
  owner?: string;
  packageApp: CliUpgradePlanPackageAppIdentity & {
    fromPackageRevision: PackageAppRevision;
    toPackageRevision: PackageAppRevision;
  };
  type: "package-app-migration";
};

export type CliUpgradeBackupStep = CliUpgradePlanStepBase & {
  backupScope: "app" | "instance" | "storage-identity";
  backupTarget?: string;
  type: "backup";
};

export type CliUpgradeBrowserReloadStep = CliUpgradePlanStepBase & {
  fromRuntimeProtocolVersion?: number | null;
  reloadReason: string;
  toRuntimeProtocolVersion?: number;
  type: "browser-reload";
};

export type CliUpgradeManualApprovalStep = CliUpgradePlanStepBase & {
  approvalKey: string;
  approvalReason: string;
  type: "manual-approval";
};

export type CliUpgradeArchiveInputStep = CliUpgradePlanStepBase & {
  archiveKind?: string | null;
  archiveStatus: "unsupported";
  archiveVersion?: number | string | null;
  expectedArchiveVersion?: number;
  type: "archive-input";
};

export type CliUpgradePlanStep =
  | CliUpgradeArchiveInputStep
  | CliUpgradeBackupStep
  | CliUpgradeBrowserReloadStep
  | CliUpgradeCodeDeployStep
  | CliUpgradeManualApprovalStep
  | CliUpgradePackageAppMigrationStep
  | CliUpgradeSqlMigrationStep;

export type CliUpgradePlan = {
  steps: readonly CliUpgradePlanStep[];
  target: CliUpgradePlanTargetIdentity;
};

export type CliUpgradePlanningBlocker = {
  code: string;
  message: string;
};

export type CliUpgradePlanningReport = {
  blockers: readonly CliUpgradePlanningBlocker[];
  plan: CliUpgradePlan;
  status: FormlessInstanceTargetUpgradeStatus;
};

export function buildCliUpgradePlanningReport(input: {
  localPackageVersion: string;
  status: FormlessInstanceTargetUpgradeStatus;
  target: CliUpgradePlanTargetIdentity;
}): CliUpgradePlanningReport {
  const target = input.target;
  const status = runtimeInstallableUpgradeStatus(input.status);
  const verificationBlockers = [
    ...status.verificationFailures.map(blockerFromVerificationFailure),
    ...packageDriftBlockers(status),
  ];
  const steps =
    verificationBlockers.length === 0
      ? plannedUpgradeSteps({
          localPackageVersion: input.localPackageVersion,
          status,
          target,
        })
      : [];
  const blockers = [...verificationBlockers, ...blockedStepBlockers(steps)];

  return {
    blockers,
    plan: {
      steps,
      target,
    },
    status,
  };
}

function runtimeInstallableUpgradeStatus(
  status: FormlessInstanceTargetUpgradeStatus,
): FormlessInstanceTargetUpgradeStatus {
  return {
    ...status,
    deployedMetadata: {
      ...status.deployedMetadata,
      packageApps: status.deployedMetadata.packageApps.filter((appPackage) =>
        isRuntimeInstallableAppPackageKey(appPackage.packageAppKey),
      ),
    },
    installedApps: status.installedApps.filter((install) =>
      isRuntimeInstallableAppPackageKey(install.packageAppKey),
    ),
    localPackages: status.localPackages.filter((appPackage) =>
      isRuntimeInstallableAppPackageKey(appPackage.packageAppKey),
    ),
  };
}

export function assertCliUpgradePlanningReady(report: CliUpgradePlanningReport): void {
  if (report.blockers.length === 0) {
    return;
  }

  throw new Error(
    `Upgrade planning blocked: ${report.blockers.map((blocker) => blocker.code).join(", ")}.`,
  );
}

export function formatCliUpgradePlanningReport(report: CliUpgradePlanningReport): string {
  const status = report.status;
  const deploymentTarget = status.deployment?.target;
  const lines = [
    "Upgrade target facts.",
    `Deployed metadata: ${formatDeployedMetadata(status.deployedMetadata)}.`,
    deploymentTarget
      ? `Deployment target: ${formatDeploymentTarget(deploymentTarget)}.`
      : "Deployment target: not requested.",
    `Archive input: ${formatArchiveInputStatus(status.archiveInput)}.`,
    `Local package facts: ${formatLocalPackageFacts(status.localPackages)}.`,
    `Installed app facts: ${formatInstalledAppFacts(status.installedApps)}.`,
    `Blockers: ${formatPlanningBlockers(report.blockers)}.`,
    "",
    formatCliUpgradePlan(report.plan).trimEnd(),
  ];

  return `${lines.join("\n")}\n`;
}

export function formatCliUpgradePlan(plan: CliUpgradePlan): string {
  const lines = [
    "Upgrade plan.",
    `Target: ${formatTargetIdentity(plan.target)}.`,
    `Steps: ${plan.steps.length}.`,
  ];

  if (plan.steps.length === 0) {
    return `${[...lines, "No steps."].join("\n")}\n`;
  }

  return `${[
    ...lines,
    "",
    ...plan.steps.flatMap((step, index) => formatPlanStep(step, index)),
  ].join("\n")}\n`;
}

function formatPlanStep(step: CliUpgradePlanStep, index: number): string[] {
  const lines = [
    `${index + 1}. ${step.type} [${step.status}] safety=${step.safety}`,
    `   Summary: ${formatSentence(step.summary)}`,
    `   Target: ${formatTargetIdentity(step.target)}.`,
    `   Package app: ${formatPackageAppIdentity(step.packageApp)}.`,
    `   Required evidence: ${formatEvidenceRequirements(step.requiredEvidence)}.`,
    `   Details: ${formatStepDetails(step)}.`,
  ];

  if (step.status === "blocked") {
    lines.push(`   Blocked: ${formatSentence(step.statusReason)}`);
  } else if (step.status === "pending") {
    lines.push(`   Pending: ${formatSentence(step.statusReason)}`);
  }

  return index === 0 ? lines : ["", ...lines];
}

function formatStepDetails(step: CliUpgradePlanStep): string {
  switch (step.type) {
    case "archive-input":
      return compactJoin([
        formatValue("archiveKind", step.archiveKind ?? "unknown"),
        formatValue("version", step.archiveVersion ?? "unknown"),
        step.expectedArchiveVersion === undefined
          ? null
          : formatValue("expectedVersion", step.expectedArchiveVersion),
        formatValue("support", step.archiveStatus),
      ]);
    case "backup":
      return compactJoin([
        formatValue("scope", step.backupScope),
        step.backupTarget === undefined ? null : formatValue("backupTarget", step.backupTarget),
      ]);
    case "browser-reload":
      return compactJoin([
        formatValue("reason", step.reloadReason),
        formatTransition(
          "runtimeProtocol",
          step.fromRuntimeProtocolVersion,
          step.toRuntimeProtocolVersion,
        ),
      ]);
    case "code-deploy":
      return compactJoin([
        formatTransition("packageVersion", step.fromPackageVersion, step.toPackageVersion),
        formatTransition(
          "runtimeProtocol",
          step.fromRuntimeProtocolVersion,
          step.toRuntimeProtocolVersion,
        ),
        formatTransition(
          "storageMigrationSet",
          step.fromStorageMigrationSet,
          step.toStorageMigrationSet,
        ),
      ]);
    case "manual-approval":
      return compactJoin([
        formatValue("approval", step.approvalKey),
        formatValue("reason", step.approvalReason),
      ]);
    case "package-app-migration":
      return compactJoin([
        formatValue("migration", step.migrationId),
        formatValue("checksum", step.checksum),
        step.owner === undefined ? null : formatValue("owner", step.owner),
        formatTransition(
          "packageRevision",
          step.packageApp.fromPackageRevision,
          step.packageApp.toPackageRevision,
        ),
      ]);
    case "sql-migration":
      return compactJoin([
        formatValue("migration", step.migrationId),
        formatValue("checksum", step.checksum),
        step.owner === undefined ? null : formatValue("owner", step.owner),
        formatValue("storageFamily", step.storageFamily),
      ]);
    default:
      return assertNever(step);
  }
}

function formatTargetIdentity(target: CliUpgradePlanTargetIdentity): string {
  return compactJoin(
    [
      target.label === undefined ? null : formatValue("label", target.label),
      target.targetId === undefined ? null : formatValue("targetId", target.targetId),
      target.targetUrl === undefined ? null : formatValue("url", target.targetUrl),
      target.storageIdentity === undefined
        ? null
        : formatValue("storageIdentity", target.storageIdentity),
      target.archivePath === undefined ? null : formatValue("archivePath", target.archivePath),
    ],
    ", ",
    "unspecified",
  );
}

function plannedUpgradeSteps(input: {
  localPackageVersion: string;
  status: FormlessInstanceTargetUpgradeStatus;
  target: CliUpgradePlanTargetIdentity;
}): CliUpgradePlanStep[] {
  const steps: CliUpgradePlanStep[] = [];
  const deployed = input.status.deployedMetadata;
  const needsCodeDeploy =
    deployed.packageVersion !== input.localPackageVersion ||
    deployed.runtimeProtocolVersion !== FORMLESS_RUNTIME_PROTOCOL_VERSION ||
    deployed.storageMigrationSet !== FORMLESS_STORAGE_MIGRATION_SET_ID;

  if (needsCodeDeploy) {
    steps.push({
      fromPackageVersion: deployed.packageVersion,
      fromRuntimeProtocolVersion: deployed.runtimeProtocolVersion,
      fromStorageMigrationSet: deployed.storageMigrationSet,
      id: "deploy-runtime",
      requiredEvidence: [
        {
          description: `deployed metadata reports packageVersion=${input.localPackageVersion}`,
          kind: "deploy-metadata",
          reference: deployed.metadataUrl,
        },
        {
          description: `deployed metadata reports runtimeProtocolVersion=${FORMLESS_RUNTIME_PROTOCOL_VERSION}`,
          kind: "deploy-metadata",
          reference: deployed.metadataUrl,
        },
        {
          description: `deployed metadata reports storageMigrationSet=${FORMLESS_STORAGE_MIGRATION_SET_ID}`,
          kind: "deploy-metadata",
          reference: deployed.metadataUrl,
        },
      ],
      safety: "auto-safe",
      status: "ready",
      summary: `Deploy runtime package ${input.localPackageVersion}`,
      target: input.target,
      toPackageVersion: input.localPackageVersion,
      toRuntimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
      toStorageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
      type: "code-deploy",
    });
  }

  if (deployed.runtimeProtocolVersion !== FORMLESS_RUNTIME_PROTOCOL_VERSION) {
    steps.push({
      fromRuntimeProtocolVersion: deployed.runtimeProtocolVersion,
      id: "browser-reload",
      reloadReason: "runtime protocol changed",
      requiredEvidence: [
        {
          description: `browser observes runtimeProtocolVersion=${FORMLESS_RUNTIME_PROTOCOL_VERSION}`,
          kind: "client-reload",
        },
      ],
      safety: "auto-safe",
      status: "ready",
      summary: "Require browser reload after runtime deploy",
      target: input.target,
      toRuntimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
      type: "browser-reload",
    });
  }

  steps.push(...archiveInputSteps(input.status, input.target));

  return steps;
}

function archiveInputSteps(
  status: FormlessInstanceTargetUpgradeStatus,
  target: CliUpgradePlanTargetIdentity,
): CliUpgradePlanStep[] {
  const archiveInput = status.archiveInput;

  if (!archiveInput.present) {
    return [];
  }

  const stepTarget = {
    ...target,
    archivePath: archiveInput.archivePath,
  };

  if (!archiveInput.readable) {
    return [
      {
        archiveKind: archiveInput.kind,
        archiveStatus: "unsupported",
        archiveVersion: archiveInput.version,
        id: "unsupported-archive-input",
        requiredEvidence: [],
        safety: "manual-approval",
        status: "blocked",
        statusReason: `Archive manifest is not readable: ${archiveInput.error ?? "unknown error"}`,
        summary: "Reject unreadable archive before restore",
        target: stepTarget,
        type: "archive-input",
      },
    ];
  }

  if (archiveInput.kind !== INSTANCE_ARCHIVE_KIND) {
    return [
      {
        archiveKind: archiveInput.kind,
        archiveStatus: "unsupported",
        archiveVersion: archiveInput.version,
        id: "unsupported-archive-kind",
        requiredEvidence: [],
        safety: "manual-approval",
        status: "blocked",
        statusReason: `Archive kind ${archiveInput.kind ?? "unknown"} is unsupported`,
        summary: "Reject unsupported archive before restore",
        target: stepTarget,
        type: "archive-input",
      },
    ];
  }

  if (archiveInput.version === ARCHIVE_VERSION) {
    return [];
  }

  return [
    {
      archiveKind: archiveInput.kind,
      archiveStatus: "unsupported",
      archiveVersion: archiveInput.version,
      expectedArchiveVersion: ARCHIVE_VERSION,
      id: "unsupported-archive-version",
      requiredEvidence: [],
      safety: "manual-approval",
      status: "blocked",
      statusReason: `Archive version ${archiveInput.version ?? "unknown"} is unsupported; expected version ${ARCHIVE_VERSION}`,
      summary: "Reject unsupported archive before restore",
      target: stepTarget,
      type: "archive-input",
    },
  ];
}

function blockerFromVerificationFailure(
  failure: FormlessInstanceTargetUpgradeVerificationFailure,
): CliUpgradePlanningBlocker {
  return {
    code: failure.code,
    message: failure.message,
  };
}

function packageDriftBlockers(
  status: FormlessInstanceTargetUpgradeStatus,
): CliUpgradePlanningBlocker[] {
  const blockers: CliUpgradePlanningBlocker[] = [];
  const localPackages = new Map(
    status.localPackages.map((appPackage) => [appPackage.packageAppKey, appPackage]),
  );

  for (const install of status.installedApps) {
    const localPackage = localPackages.get(install.packageAppKey);

    if (!localPackage) {
      blockers.push({
        code: "installed-app-package-resolver-drift",
        message: `Installed app "${install.installId}" package "${install.packageAppKey}" is missing from active local package metadata.`,
      });
      continue;
    }

    if (install.packageRevision > localPackage.packageRevision) {
      blockers.push({
        code: "installed-app-package-revision-ahead",
        message: `Installed app "${install.installId}" package revision ${install.packageRevision} is ahead of local package revision ${localPackage.packageRevision}.`,
      });
      continue;
    }

    if (
      install.packageRevision === localPackage.packageRevision &&
      install.sourceSchemaHash !== localPackage.sourceSchemaHash
    ) {
      blockers.push({
        code: "installed-app-source-schema-hash-drift",
        message: `Installed app "${install.installId}" source schema hash differs from local package facts at revision ${install.packageRevision}.`,
      });
    }
  }

  return blockers;
}

function blockedStepBlockers(steps: readonly CliUpgradePlanStep[]): CliUpgradePlanningBlocker[] {
  return steps
    .filter((step): step is CliUpgradePlanStep & { status: "blocked"; statusReason: string } => {
      return step.status === "blocked";
    })
    .map((step) => ({
      code: step.id,
      message: step.statusReason,
    }));
}

function formatDeployedMetadata(
  metadata: FormlessInstanceTargetUpgradeStatus["deployedMetadata"],
): string {
  return compactJoin([
    formatValue("packageVersion", metadata.packageVersion ?? "unknown"),
    formatValue("runtimeProtocol", metadata.runtimeProtocolVersion),
    formatValue("storageMigrationSet", metadata.storageMigrationSet),
    formatValue("metadata", metadata.metadataUrl),
  ]);
}

function formatDeploymentTarget(
  target: NonNullable<FormlessInstanceTargetUpgradeStatus["deployment"]>["target"],
): string {
  return compactJoin(
    [
      formatValue("targetId", target.targetId),
      target.label === undefined ? null : formatValue("label", target.label),
    ],
    ", ",
  );
}

function formatArchiveInputStatus(
  archiveInput: FormlessInstanceTargetUpgradeStatus["archiveInput"],
): string {
  if (!archiveInput.present) {
    return "none";
  }

  return compactJoin([
    formatValue("kind", archiveInput.kind ?? "unknown"),
    formatValue("version", archiveInput.version ?? "unknown"),
    formatValue("readable", archiveInput.readable ? "yes" : "no"),
    formatValue("archivePath", archiveInput.archivePath),
    archiveInput.error === undefined ? null : formatValue("error", archiveInput.error),
  ]);
}

function formatLocalPackageFacts(
  packages: readonly FormlessInstanceTargetLocalPackageUpgradeFacts[],
): string {
  if (packages.length === 0) {
    return "none";
  }

  return packages.map(formatPackageFacts).join("; ");
}

function formatInstalledAppFacts(
  installs: readonly FormlessInstanceTargetInstalledAppUpgradeFacts[],
): string {
  if (installs.length === 0) {
    return "none";
  }

  return installs
    .map(
      (install) =>
        `${install.installId} (${formatPackageFacts({
          packageAppKey: install.packageAppKey,
          packageRevision: install.packageRevision,
          sourceSchemaHash: install.sourceSchemaHash,
        })})`,
    )
    .join("; ");
}

function formatPackageFacts(input: {
  packageAppKey: PackageAppKey;
  packageRevision: PackageAppRevision;
  sourceSchemaHash: SourceSchemaHash;
}): string {
  return compactJoin([
    formatValue("packageAppKey", input.packageAppKey),
    formatValue("packageRevision", input.packageRevision),
    formatValue("sourceSchemaHash", input.sourceSchemaHash),
  ]);
}

function formatPlanningBlockers(blockers: readonly CliUpgradePlanningBlocker[]): string {
  if (blockers.length === 0) {
    return "none";
  }

  return blockers.map((blocker) => `${blocker.code}: ${blocker.message}`).join("; ");
}

function formatPackageAppIdentity(
  packageApp: CliUpgradePlanPackageAppIdentity | undefined,
): string {
  if (packageApp === undefined) {
    return "none";
  }

  return compactJoin(
    [
      formatValue("packageAppKey", packageApp.packageAppKey),
      packageApp.installId === undefined ? null : formatValue("installId", packageApp.installId),
      formatTransition(
        "packageRevision",
        packageApp.fromPackageRevision,
        packageApp.toPackageRevision,
      ),
      packageApp.sourceSchemaHash === undefined
        ? null
        : formatValue("sourceSchemaHash", packageApp.sourceSchemaHash),
    ],
    ", ",
  );
}

function formatEvidenceRequirements(
  evidence: readonly CliUpgradePlanEvidenceRequirement[],
): string {
  if (evidence.length === 0) {
    return "none";
  }

  return evidence
    .map((requirement) =>
      compactJoin([
        `${requirement.kind}: ${requirement.description}`,
        requirement.reference === undefined ? null : `reference=${requirement.reference}`,
      ]),
    )
    .join("; ");
}

function formatTransition(
  label: string,
  from: number | string | null | undefined,
  to: number | string | null | undefined,
): string | null {
  if (from === undefined && to === undefined) {
    return null;
  }

  return `${label}=${formatNullable(from)}->${formatNullable(to)}`;
}

function formatValue(label: string, value: number | string): string {
  return `${label}=${value}`;
}

function formatNullable(value: number | string | null | undefined): string {
  return value === null || value === undefined ? "unknown" : String(value);
}

function compactJoin(
  values: readonly (string | null)[],
  separator = "; ",
  emptyValue = "none",
): string {
  const presentValues = values.filter((value): value is string => value !== null);

  return presentValues.length === 0 ? emptyValue : presentValues.join(separator);
}

function formatSentence(value: string): string {
  return value.endsWith(".") ? value : `${value}.`;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled upgrade plan step: ${JSON.stringify(value)}`);
}
