import packageJson from "../../package.json";
import type { PackageAppKey } from "@dpeek/formless-installed-apps";
import type {
  InstanceUpgradeApplyResponse,
  InstanceUpgradeStatusResponse,
  UpgradePackageAppMigrationAppliedState,
  UpgradeStorageIdentity,
  UpgradeStorageIdentityStatus,
} from "../shared/upgrade-status.ts";
import {
  applyFormlessInstalledAppAutoSafePackageMigrations,
  applyFormlessInstanceAutoSafeSqlMigrations,
  readFormlessInstanceTargetStatus,
  readFormlessInstanceUpgradeStatus,
  type FormlessInstancePackageMigrationApplyResponse,
  type FormlessInstanceTargetClientDependencies,
} from "./instance-target-client.ts";
import {
  assertCliUpgradePlanningReady,
  buildCliUpgradePlanningReport,
  formatCliUpgradePlanningReport,
  type CliUpgradeManualApprovalStep,
  type CliUpgradePlanStep,
  type CliUpgradePlanningReport,
} from "./upgrade-plan.ts";

export type CliUpgradeBackupEvidenceInput = {
  artifactPath: string;
  completedAt: string;
  kind: "backup";
  scope: "app" | "instance" | "storage-identity";
  target?: string;
};

export type CliUpgradeManualApprovalEvidenceInput = {
  approvalKey: string;
  approvedAt: string;
  approvedBy?: string;
  kind: "manual-approval";
  reason?: string;
};

export type CliUpgradeApplyEvidenceInput = {
  backups?: readonly CliUpgradeBackupEvidenceInput[];
  manualApprovals?: readonly CliUpgradeManualApprovalEvidenceInput[];
};

export type CliUpgradeApplyGateEvidence = {
  backups: readonly CliUpgradeBackupEvidenceInput[];
  manualApprovals: readonly CliUpgradeManualApprovalEvidenceInput[];
};

export type CliAutoSafePackageAppApplyEvidence = {
  installId: string;
  packageAppKey: PackageAppKey;
  response: FormlessInstancePackageMigrationApplyResponse;
  verifiedStatus: InstanceUpgradeStatusResponse;
};

export type CliAutoSafeUpgradeApplyResult = {
  gateEvidence: CliUpgradeApplyGateEvidence;
  packageApps: CliAutoSafePackageAppApplyEvidence[];
  planning: CliUpgradePlanningReport;
  sql: InstanceUpgradeApplyResponse;
  verifiedSqlStatus: InstanceUpgradeStatusResponse;
};

export type CliAutoSafeUpgradeApplyDependencies = FormlessInstanceTargetClientDependencies & {
  log: (message: string) => void;
};

export async function applyCliAutoSafeUpgradeMigrations(
  input: {
    adminToken?: string | null;
    evidence?: CliUpgradeApplyEvidenceInput;
    targetUrl: string;
  },
  dependencies: CliAutoSafeUpgradeApplyDependencies,
): Promise<CliAutoSafeUpgradeApplyResult> {
  const targetStatus = await readFormlessInstanceTargetStatus(
    {
      targetUrl: input.targetUrl,
    },
    dependencies,
  );
  const deploymentTarget = targetStatus.upgradeStatus.deployment?.target;
  const planning = buildCliUpgradePlanningReport({
    localPackageVersion: packageJson.version,
    status: targetStatus.upgradeStatus,
    target: {
      ...(deploymentTarget?.label === undefined ? {} : { label: deploymentTarget.label }),
      ...(deploymentTarget?.targetId === undefined ? {} : { targetId: deploymentTarget.targetId }),
      targetUrl: input.targetUrl,
    },
  });

  if (planning.blockers.length > 0) {
    dependencies.log(formatCliUpgradePlanningReport(planning).trimEnd());
  }

  let gateEvidence: CliUpgradeApplyGateEvidence;

  try {
    gateEvidence = assertCliUpgradeApplyGateEvidence({
      evidence: input.evidence,
      planning,
    });
  } catch (error) {
    if (planning.blockers.length === 0) {
      dependencies.log(formatCliUpgradePlanningReport(planning).trimEnd());
    }

    throw error;
  }

  const sql = await applyFormlessInstanceAutoSafeSqlMigrations(
    {
      adminToken: input.adminToken,
      targetUrl: input.targetUrl,
    },
    dependencies,
  );
  const verifiedSqlStatus = await readFormlessInstanceUpgradeStatus(
    {
      adminToken: input.adminToken,
      targetUrl: input.targetUrl,
    },
    dependencies,
  );
  const packageApps: CliAutoSafePackageAppApplyEvidence[] = [];

  verifySqlApplyEvidence(sql, verifiedSqlStatus);

  for (const install of planning.status.installedApps) {
    const response = await applyFormlessInstalledAppAutoSafePackageMigrations(
      {
        adminToken: input.adminToken,
        installId: install.installId,
        packageAppKey: install.packageAppKey,
        targetUrl: input.targetUrl,
      },
      dependencies,
    );
    const verifiedStatus = await readFormlessInstanceUpgradeStatus(
      {
        adminToken: input.adminToken,
        targetUrl: input.targetUrl,
      },
      dependencies,
    );

    verifyPackageAppApplyEvidence({
      installId: install.installId,
      packageAppKey: install.packageAppKey,
      response,
      status: verifiedStatus,
    });
    packageApps.push({
      installId: install.installId,
      packageAppKey: install.packageAppKey,
      response,
      verifiedStatus,
    });
  }

  const result = {
    gateEvidence,
    packageApps,
    planning,
    sql,
    verifiedSqlStatus,
  };

  dependencies.log(formatCliAutoSafeUpgradeApplyEvidence(result).trimEnd());

  return result;
}

export function assertCliUpgradeApplyGateEvidence(input: {
  evidence?: CliUpgradeApplyEvidenceInput;
  planning: CliUpgradePlanningReport;
}): CliUpgradeApplyGateEvidence {
  const gateEvidence = normalizeCliUpgradeGateEvidence(input.evidence);
  const manualApprovalSteps = input.planning.plan.steps.filter(
    (step): step is CliUpgradeManualApprovalStep => step.type === "manual-approval",
  );
  const manualApprovalStepIds = new Set(manualApprovalSteps.map((step) => step.id));
  const planningBlockers = input.planning.blockers.filter(
    (blocker) => !manualApprovalStepIds.has(blocker.code),
  );

  if (planningBlockers.length > 0) {
    throw new Error(
      `Upgrade planning blocked: ${planningBlockers.map((blocker) => blocker.code).join(", ")}.`,
    );
  }

  const missingEvidence = [
    ...missingBackupEvidence(input.planning.plan.steps, gateEvidence.backups),
    ...missingManualApprovalEvidence(manualApprovalSteps, gateEvidence.manualApprovals),
  ];

  if (missingEvidence.length > 0) {
    throw new Error(`Upgrade apply blocked: ${missingEvidence.join(", ")}.`);
  }

  assertCliUpgradePlanningReady({
    ...input.planning,
    blockers: planningBlockers,
  });

  return gateEvidence;
}

export function formatCliAutoSafeUpgradeApplyEvidence(
  result: CliAutoSafeUpgradeApplyResult,
): string {
  const sqlRows = result.sql.storageIdentities.flatMap((storage) =>
    storage.sqlMigrations.map((migration) => ({
      identity: formatUpgradeStorageIdentity(storage.identity),
      migration,
    })),
  );
  const lines = [
    "Upgrade apply evidence.",
    `Backup evidence: ${result.gateEvidence.backups.length}.`,
    ...result.gateEvidence.backups.map(formatBackupEvidence),
    `Manual approvals: ${result.gateEvidence.manualApprovals.length}.`,
    ...result.gateEvidence.manualApprovals.map(formatManualApprovalEvidence),
    `SQL storage identities: ${result.sql.storageIdentities.length}.`,
    `SQL migrations: ${sqlRows.length}.`,
    ...sqlRows.map(
      ({ identity, migration }) =>
        `SQL migration: ${identity} ${migration.storageFamily}/${migration.migrationId} checksum=${migration.checksum}.`,
    ),
    `Package app applies: ${result.packageApps.length}.`,
    ...result.packageApps.map(
      (app) =>
        `Package app: ${app.packageAppKey}/${app.installId} revision=${app.response.packageRevision} sourceSchemaHash=${app.response.sourceSchemaHash} applied=${app.response.applied.length} skipped=${app.response.skipped.length}.`,
    ),
  ];

  return `${lines.join("\n")}\n`;
}

function normalizeCliUpgradeGateEvidence(
  evidence: CliUpgradeApplyEvidenceInput | undefined,
): CliUpgradeApplyGateEvidence {
  return {
    backups: evidence?.backups ?? [],
    manualApprovals: evidence?.manualApprovals ?? [],
  };
}

function missingBackupEvidence(
  steps: readonly CliUpgradePlanStep[],
  backups: readonly CliUpgradeBackupEvidenceInput[],
): string[] {
  const requiredSteps = steps.filter((step) => step.safety === "auto-with-backup");

  return requiredSteps
    .filter((step) => !backups.some((backup) => backupMatchesStep(backup, step)))
    .map((step) => `backup-evidence-missing:${step.id}`);
}

function backupMatchesStep(
  backup: CliUpgradeBackupEvidenceInput,
  step: CliUpgradePlanStep,
): boolean {
  if (!backup.artifactPath || !backup.completedAt) {
    return false;
  }

  if (step.type === "backup") {
    return backup.scope === step.backupScope;
  }

  return true;
}

function missingManualApprovalEvidence(
  steps: readonly CliUpgradeManualApprovalStep[],
  approvals: readonly CliUpgradeManualApprovalEvidenceInput[],
): string[] {
  return steps
    .filter(
      (step) =>
        !approvals.some(
          (approval) => approval.approvalKey === step.approvalKey && approval.approvedAt,
        ),
    )
    .map((step) => `manual-approval-missing:${step.approvalKey}`);
}

function formatBackupEvidence(evidence: CliUpgradeBackupEvidenceInput): string {
  return compactEvidenceLine([
    "Backup",
    `scope=${evidence.scope}`,
    `artifact=${evidence.artifactPath}`,
    `completedAt=${evidence.completedAt}`,
    evidence.target === undefined ? null : `target=${evidence.target}`,
  ]);
}

function formatManualApprovalEvidence(evidence: CliUpgradeManualApprovalEvidenceInput): string {
  return compactEvidenceLine([
    "Manual approval",
    evidence.approvalKey,
    `approvedAt=${evidence.approvedAt}`,
    evidence.approvedBy === undefined ? null : `approvedBy=${evidence.approvedBy}`,
    evidence.reason === undefined ? null : `reason=${evidence.reason}`,
  ]);
}

function verifyPackageAppApplyEvidence(input: {
  installId: string;
  packageAppKey: PackageAppKey;
  response: FormlessInstancePackageMigrationApplyResponse;
  status: InstanceUpgradeStatusResponse;
}) {
  const storage = findAppInstallStorageStatus(input.status, input.installId, input.packageAppKey);

  if (!storage?.packageAppMigrations?.state) {
    throw new Error(
      `Upgrade apply evidence missing package app state for "${input.packageAppKey}/${input.installId}".`,
    );
  }

  const state = storage.packageAppMigrations.state;

  if (
    state.packageRevision !== input.response.packageRevision ||
    state.sourceSchemaHash !== input.response.sourceSchemaHash
  ) {
    throw new Error(
      `Upgrade apply evidence for "${input.packageAppKey}/${input.installId}" did not match applied package facts.`,
    );
  }

  const appliedById = new Map(
    storage.packageAppMigrations.applied.map((migration) => [migration.migrationId, migration]),
  );

  for (const migration of [...input.response.applied, ...input.response.skipped]) {
    verifyAppliedPackageMigrationEvidence(input, appliedById, migration);
  }
}

function verifySqlApplyEvidence(
  response: InstanceUpgradeApplyResponse,
  status: InstanceUpgradeStatusResponse,
) {
  const statusRows = new Set(
    status.storageIdentities.flatMap((storage) =>
      storage.sqlMigrations.map(
        (migration) =>
          `${formatUpgradeStorageIdentity(storage.identity)}:${migration.storageFamily}:${migration.migrationId}:${migration.checksum}`,
      ),
    ),
  );

  for (const storage of response.storageIdentities) {
    const identity = formatUpgradeStorageIdentity(storage.identity);

    for (const migration of storage.sqlMigrations) {
      const key = `${identity}:${migration.storageFamily}:${migration.migrationId}:${migration.checksum}`;

      if (!statusRows.has(key)) {
        throw new Error(
          `Upgrade apply evidence missing SQL migration "${migration.migrationId}" for "${identity}".`,
        );
      }
    }
  }
}

function verifyAppliedPackageMigrationEvidence(
  input: {
    installId: string;
    packageAppKey: PackageAppKey;
  },
  appliedById: ReadonlyMap<string, UpgradePackageAppMigrationAppliedState>,
  migration: UpgradePackageAppMigrationAppliedState,
) {
  const applied = appliedById.get(migration.migrationId);

  if (!applied || applied.checksum !== migration.checksum) {
    throw new Error(
      `Upgrade apply evidence missing package app migration "${migration.migrationId}" for "${input.packageAppKey}/${input.installId}".`,
    );
  }
}

function findAppInstallStorageStatus(
  status: InstanceUpgradeStatusResponse,
  installId: string,
  packageAppKey: PackageAppKey,
): UpgradeStorageIdentityStatus | undefined {
  return status.storageIdentities.find(
    (storage) =>
      storage.identity.kind === "appInstall" &&
      storage.identity.installId === installId &&
      storage.identity.packageAppKey === packageAppKey,
  );
}

function formatUpgradeStorageIdentity(identity: UpgradeStorageIdentity): string {
  if (identity.kind === "instance") {
    return identity.authorityName;
  }

  if (identity.kind === "appInstall") {
    return `${identity.packageAppKey}/${identity.installId}`;
  }

  return identity.sourceSchemaKey;
}

function compactEvidenceLine(parts: readonly (string | null)[]): string {
  return `${parts.filter((part): part is string => part !== null && part.length > 0).join(" ")}.`;
}
