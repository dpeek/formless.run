import { describe, expect, it } from "vite-plus/test";
import {
  FORMLESS_RUNTIME_PROTOCOL_VERSION,
  FORMLESS_STORAGE_MIGRATION_SET_ID,
} from "../shared/deploy-metadata.ts";
import { listInstallableAppPackages } from "@dpeek/formless-installed-apps";
import { bundledAppPackageResolver } from "../shared/app-packages.ts";
import { bundledSourceSchemaHashFixtures } from "../shared/upgrade-migrations.ts";
import {
  buildCliUpgradePlanningReport,
  formatCliUpgradePlan,
  type CliUpgradePlan,
} from "./upgrade-plan.ts";
import type { FormlessInstanceTargetUpgradeStatus } from "./instance-target-client.ts";

const checksum = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const privateSourceSchemaHash =
  "sha256:2222222222222222222222222222222222222222222222222222222222222222";

describe("CLI upgrade plan formatting", () => {
  it("formats upgrade steps with safety, evidence, identities, and pending or blocked reasons", () => {
    const plan: CliUpgradePlan = {
      target: {
        label: "Primary instance",
        targetId: "instance.primary",
        targetUrl: "https://instance.example",
      },
      steps: [
        {
          fromPackageVersion: "0.1.8",
          fromRuntimeProtocolVersion: 1,
          fromStorageMigrationSet: "storage.2026-05-28",
          id: "deploy-runtime",
          requiredEvidence: [
            {
              description: "deployed metadata reports packageVersion=0.1.9",
              kind: "deploy-metadata",
            },
          ],
          safety: "auto-safe",
          status: "ready",
          summary: "Deploy runtime package 0.1.9",
          target: {
            targetId: "instance.primary",
            targetUrl: "https://instance.example",
          },
          toPackageVersion: "0.1.9",
          toRuntimeProtocolVersion: 2,
          toStorageMigrationSet: "storage.2026-06-01",
          type: "code-deploy",
        },
        {
          checksum,
          id: "authority-sql",
          migrationId: "sql.authority.add-package-state",
          owner: "runtime",
          requiredEvidence: [
            {
              description: "applied SQL migration row",
              kind: "applied-sql-migration",
              reference: "sql.authority.add-package-state",
            },
          ],
          safety: "auto-safe",
          status: "pending",
          statusReason: "Applied-state evidence API is not available yet",
          storageFamily: "authority",
          summary: "Apply Authority SQL table migration",
          target: {
            storageIdentity: "app:site",
            targetId: "instance.primary",
          },
          type: "sql-migration",
        },
        {
          checksum,
          id: "site-package",
          migrationId: "package.site.0002",
          owner: "site",
          packageApp: {
            fromPackageRevision: 1,
            installId: "site",
            packageAppKey: "site",
            sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
            toPackageRevision: 2,
          },
          requiredEvidence: [
            {
              description: "package app migration evidence",
              kind: "applied-package-app-migration",
              reference: "package.site.0002",
            },
          ],
          safety: "auto-with-backup",
          status: "pending",
          statusReason: "Backup evidence must be recorded before user data migration",
          summary: "Migrate Site records to revision 2",
          target: {
            storageIdentity: "app:site",
            targetId: "instance.primary",
          },
          type: "package-app-migration",
        },
        {
          backupScope: "instance",
          backupTarget: "archives/backups/instance-2026-06-01",
          id: "backup-instance",
          requiredEvidence: [
            {
              description: "fresh whole-instance archive path",
              kind: "backup-archive",
            },
          ],
          safety: "auto-with-backup",
          status: "pending",
          statusReason: "User-data migrations require a fresh backup",
          summary: "Back up the target before user-data migrations",
          target: {
            targetId: "instance.primary",
            targetUrl: "https://instance.example",
          },
          type: "backup",
        },
        {
          fromRuntimeProtocolVersion: 1,
          id: "reload-browser",
          reloadReason: "runtime protocol changed",
          requiredEvidence: [
            {
              description: "runtimeProtocolVersion=2 in bootstrap metadata",
              kind: "client-reload",
            },
          ],
          safety: "auto-safe",
          status: "ready",
          summary: "Require browser reload after deploy",
          target: {
            targetId: "instance.primary",
            targetUrl: "https://instance.example",
          },
          toRuntimeProtocolVersion: 2,
          type: "browser-reload",
        },
        {
          approvalKey: "destructive-site-cleanup",
          approvalReason: "Deletes tombstoned legacy Site records",
          id: "manual-destructive-site-cleanup",
          requiredEvidence: [
            {
              description: "explicit approval token destructive-site-cleanup",
              kind: "manual-approval",
            },
          ],
          safety: "manual-approval",
          status: "blocked",
          statusReason: "Manual approval has not been provided",
          summary: "Approve destructive Site cleanup",
          target: {
            storageIdentity: "app:site",
            targetId: "instance.primary",
          },
          type: "manual-approval",
        },
      ],
    };

    expect(formatCliUpgradePlan(plan)).toBe(`Upgrade plan.
Target: label=Primary instance, targetId=instance.primary, url=https://instance.example.
Steps: 6.

1. code-deploy [ready] safety=auto-safe
   Summary: Deploy runtime package 0.1.9.
   Target: targetId=instance.primary, url=https://instance.example.
   Package app: none.
   Required evidence: deploy-metadata: deployed metadata reports packageVersion=0.1.9.
   Details: packageVersion=0.1.8->0.1.9; runtimeProtocol=1->2; storageMigrationSet=storage.2026-05-28->storage.2026-06-01.

2. sql-migration [pending] safety=auto-safe
   Summary: Apply Authority SQL table migration.
   Target: targetId=instance.primary, storageIdentity=app:site.
   Package app: none.
   Required evidence: applied-sql-migration: applied SQL migration row; reference=sql.authority.add-package-state.
   Details: migration=sql.authority.add-package-state; checksum=sha256:1111111111111111111111111111111111111111111111111111111111111111; owner=runtime; storageFamily=authority.
   Pending: Applied-state evidence API is not available yet.

3. package-app-migration [pending] safety=auto-with-backup
   Summary: Migrate Site records to revision 2.
   Target: targetId=instance.primary, storageIdentity=app:site.
   Package app: packageAppKey=site, installId=site, packageRevision=1->2, sourceSchemaHash=${bundledSourceSchemaHashFixtures.site}.
   Required evidence: applied-package-app-migration: package app migration evidence; reference=package.site.0002.
   Details: migration=package.site.0002; checksum=sha256:1111111111111111111111111111111111111111111111111111111111111111; owner=site; packageRevision=1->2.
   Pending: Backup evidence must be recorded before user data migration.

4. backup [pending] safety=auto-with-backup
   Summary: Back up the target before user-data migrations.
   Target: targetId=instance.primary, url=https://instance.example.
   Package app: none.
   Required evidence: backup-archive: fresh whole-instance archive path.
   Details: scope=instance; backupTarget=archives/backups/instance-2026-06-01.
   Pending: User-data migrations require a fresh backup.

5. browser-reload [ready] safety=auto-safe
   Summary: Require browser reload after deploy.
   Target: targetId=instance.primary, url=https://instance.example.
   Package app: none.
   Required evidence: client-reload: runtimeProtocolVersion=2 in bootstrap metadata.
   Details: reason=runtime protocol changed; runtimeProtocol=1->2.

6. manual-approval [blocked] safety=manual-approval
   Summary: Approve destructive Site cleanup.
   Target: targetId=instance.primary, storageIdentity=app:site.
   Package app: none.
   Required evidence: manual-approval: explicit approval token destructive-site-cleanup.
   Details: approval=destructive-site-cleanup; reason=Deletes tombstoned legacy Site records.
   Blocked: Manual approval has not been provided.
`);
  });

  it("formats unsupported archive input as a blocked plan step", () => {
    const plan: CliUpgradePlan = {
      target: {
        targetId: "instance.primary",
      },
      steps: [
        {
          archiveKind: "formless.instanceArchive",
          archiveStatus: "unsupported",
          archiveVersion: 0,
          expectedArchiveVersion: 2,
          id: "unsupported-archive",
          requiredEvidence: [],
          safety: "manual-approval",
          status: "blocked",
          statusReason: "Archive version 0 is unsupported; expected version 2",
          summary: "Reject unsupported archive before restore",
          target: {
            archivePath: "/workspace/archive/archive.json",
            targetId: "instance.primary",
          },
          type: "archive-input",
        },
      ],
    };

    expect(formatCliUpgradePlan(plan)).toBe(`Upgrade plan.
Target: targetId=instance.primary.
Steps: 1.

1. archive-input [blocked] safety=manual-approval
   Summary: Reject unsupported archive before restore.
   Target: targetId=instance.primary, archivePath=/workspace/archive/archive.json.
   Package app: none.
   Required evidence: none.
   Details: archiveKind=formless.instanceArchive; version=0; expectedVersion=2; support=unsupported.
   Blocked: Archive version 0 is unsupported; expected version 2.
`);
  });
});

describe("CLI upgrade planning package drift", () => {
  it("blocks installed apps missing from active local package metadata", () => {
    const report = buildCliUpgradePlanningReport({
      localPackageVersion: "0.1.9",
      status: upgradeStatus({
        installedApps: [
          {
            installId: "labs",
            packageAppKey: "private-labs",
            packageRevision: 7,
            sourceSchemaHash: privateSourceSchemaHash,
          },
        ],
      }),
      target: { targetUrl: "https://live.example" },
    });

    expect(report.blockers).toContainEqual({
      code: "installed-app-package-resolver-drift",
      message:
        'Installed app "labs" package "private-labs" is missing from active local package metadata.',
    });
    expect(report.plan.steps).toEqual([]);
  });

  it("ignores dormant Site and Tasks package metadata", () => {
    const report = buildCliUpgradePlanningReport({
      localPackageVersion: "0.1.9",
      status: upgradeStatus({
        installedApps: [
          {
            installId: "site",
            packageAppKey: "site",
            packageRevision: 2,
            sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
          },
          {
            installId: "tasks",
            packageAppKey: "tasks",
            packageRevision: 1,
            sourceSchemaHash: privateSourceSchemaHash,
          },
        ],
      }),
      target: { targetUrl: "https://live.example" },
    });

    expect(report.blockers).toEqual([]);
    expect(report.status.installedApps).toEqual([]);
  });
});

function upgradeStatus(
  overrides: Partial<FormlessInstanceTargetUpgradeStatus> = {},
): FormlessInstanceTargetUpgradeStatus {
  return {
    archiveInput: { present: false },
    deployedMetadata: {
      cacheControl: "no-store",
      metadataUrl: "https://live.example/api/formless/deploy",
      packageApps: listInstallableAppPackages(bundledAppPackageResolver).map((appPackage) => ({
        packageAppKey: appPackage.packageAppKey,
        packageRevision: appPackage.packageRevision,
        sourceSchemaHash: appPackage.sourceSchemaHash,
      })),
      packageVersion: "0.1.9",
      runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
      storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
      version: "0.1.9",
    },
    installedApps: [],
    localPackages: listInstallableAppPackages(bundledAppPackageResolver).map((appPackage) => ({
      packageAppKey: appPackage.packageAppKey,
      packageRevision: appPackage.packageRevision,
      sourceSchemaHash: appPackage.sourceSchemaHash,
    })),
    verificationFailures: [],
    ...overrides,
  };
}
