import packageJson from "../../package.json";
import type {
  InstanceUpgradeApplyResponse,
  InstanceUpgradeStatusResponse,
  UpgradeStorageIdentity,
} from "../shared/upgrade-status.ts";
import {
  applyFormlessInstanceAutoSafeSqlMigrations,
  readFormlessInstanceTargetStatus,
  readFormlessInstanceUpgradeStatus,
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

export type CliAutoSafeUpgradeApplyResult = {
  gateEvidence: CliUpgradeApplyGateEvidence;
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
  verifySqlApplyEvidence(sql, verifiedSqlStatus);

  const result = {
    gateEvidence,
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

function formatUpgradeStorageIdentity(identity: UpgradeStorageIdentity): string {
  return identity.authorityName;
}

function compactEvidenceLine(parts: readonly (string | null)[]): string {
  return `${parts.filter((part): part is string => part !== null && part.length > 0).join(" ")}.`;
}
