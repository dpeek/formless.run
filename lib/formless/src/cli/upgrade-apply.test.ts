import { describe, expect, it } from "vite-plus/test";

import packageJson from "../../package.json";
import {
  FORMLESS_RUNTIME_PROTOCOL_VERSION,
  FORMLESS_STORAGE_MIGRATION_SET_ID,
} from "../shared/deploy-metadata.ts";
import { bundledSourceSchemaHashFixtures } from "../shared/upgrade-migrations.ts";
import {
  applyCliAutoSafeUpgradeMigrations,
  assertCliUpgradeApplyGateEvidence,
  formatCliAutoSafeUpgradeApplyEvidence,
  type CliAutoSafeUpgradeApplyResult,
} from "./upgrade-apply.ts";
import type { CliUpgradePlanStep, CliUpgradePlanningReport } from "./upgrade-plan.ts";
import { listInstallableAppPackages } from "@dpeek/formless-installed-apps";
import { bundledAppPackageResolver } from "../shared/app-packages.ts";

const checksum = "sha256:1111111111111111111111111111111111111111111111111111111111111111";

describe("CLI upgrade apply evidence gates", () => {
  it("does not apply package migrations to dormant Tasks installs", async () => {
    const requests: string[] = [];
    const result = await applyCliAutoSafeUpgradeMigrations(
      {
        adminToken: "upgrade-token",
        targetUrl: "https://live.example",
      },
      {
        fetch: async (url, init) => {
          const requestUrl =
            typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
          const parsedUrl = new URL(requestUrl);
          const method = init?.method ?? "GET";

          requests.push(`${method} ${parsedUrl.pathname}`);

          if (parsedUrl.pathname === "/api/formless/deploy") {
            return Response.json(
              {
                packageApps: listInstallableAppPackages(bundledAppPackageResolver).map(
                  (appPackage) => ({
                    packageAppKey: appPackage.packageAppKey,
                    packageRevision: appPackage.packageRevision,
                    sourceSchemaHash: appPackage.sourceSchemaHash,
                  }),
                ),
                packageVersion: packageJson.version,
                runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
                storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
                version: packageJson.version,
              },
              { headers: { "Cache-Control": "no-store" } },
            );
          }

          if (parsedUrl.pathname === "/api/formless/setup") {
            return Response.json({ setupComplete: true });
          }

          if (parsedUrl.pathname === "/api/formless/app-installs") {
            return Response.json({
              installs: [
                {
                  adminRoute: "/apps/legacy-tasks",
                  createdAt: "2026-05-28T00:00:00.000Z",
                  installId: "legacy-tasks",
                  label: "Legacy Tasks",
                  packageAppKey: "tasks",
                  packageRevision: 1,
                  registrationPolicy: "closed",
                  sourceSchemaHash: bundledSourceSchemaHashFixtures.tasks,
                  status: "installed",
                  updatedAt: "2026-05-28T00:00:00.000Z",
                },
              ],
              packages: [],
            });
          }

          if (
            parsedUrl.pathname === "/api/formless/upgrade/apply" ||
            parsedUrl.pathname === "/api/formless/upgrade/status"
          ) {
            return Response.json({ storageIdentities: [] });
          }

          return Response.json({ error: "not found" }, { status: 404 });
        },
        log: () => undefined,
      },
    );

    expect(result.packageApps).toEqual([]);
    expect(result.planning.status.installedApps).toEqual([]);
    expect(requests).not.toContain(
      "POST /api/formless/app-installs/tasks/legacy-tasks/package-migrations/apply",
    );
  });

  it("requires backup evidence before auto-with-backup migration steps", () => {
    const report = planningReport([
      {
        checksum,
        id: "site-package",
        migrationId: "package.site.0002",
        packageApp: {
          fromPackageRevision: 1,
          installId: "site",
          packageAppKey: "site",
          sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
          toPackageRevision: 2,
        },
        requiredEvidence: [
          {
            description: "fresh Site app backup path",
            kind: "backup-archive",
          },
        ],
        safety: "auto-with-backup",
        status: "pending",
        statusReason: "Backup evidence must be recorded before user data migration",
        summary: "Migrate Site records to revision 2",
        target: {
          storageIdentity: "app:site",
          targetUrl: "https://live.example",
        },
        type: "package-app-migration",
      },
    ]);

    expect(() => assertCliUpgradeApplyGateEvidence({ planning: report })).toThrow(
      "Upgrade apply blocked: backup-evidence-missing:site-package.",
    );

    expect(
      assertCliUpgradeApplyGateEvidence({
        evidence: {
          backups: [
            {
              artifactPath: "archives/backups/site.snapshot.json",
              completedAt: "2026-06-01T00:00:00.000Z",
              kind: "backup",
              scope: "app",
              target: "https://live.example",
            },
          ],
        },
        planning: report,
      }),
    ).toEqual({
      backups: [
        {
          artifactPath: "archives/backups/site.snapshot.json",
          completedAt: "2026-06-01T00:00:00.000Z",
          kind: "backup",
          scope: "app",
          target: "https://live.example",
        },
      ],
      manualApprovals: [],
    });
  });

  it("requires explicit manual approval evidence for manual-approval steps", () => {
    const report = planningReport(
      [
        {
          approvalKey: "destructive-site-cleanup",
          approvalReason: "Deletes legacy Site records",
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
            targetUrl: "https://live.example",
          },
          type: "manual-approval",
        },
      ],
      [
        {
          code: "manual-destructive-site-cleanup",
          message: "Manual approval has not been provided",
        },
      ],
    );

    expect(() => assertCliUpgradeApplyGateEvidence({ planning: report })).toThrow(
      "Upgrade apply blocked: manual-approval-missing:destructive-site-cleanup.",
    );

    expect(
      assertCliUpgradeApplyGateEvidence({
        evidence: {
          manualApprovals: [
            {
              approvalKey: "destructive-site-cleanup",
              approvedAt: "2026-06-01T00:00:00.000Z",
              kind: "manual-approval",
            },
          ],
        },
        planning: report,
      }),
    ).toEqual({
      backups: [],
      manualApprovals: [
        {
          approvalKey: "destructive-site-cleanup",
          approvedAt: "2026-06-01T00:00:00.000Z",
          kind: "manual-approval",
        },
      ],
    });
  });

  it("includes backup and manual approval evidence in apply output", () => {
    const output = formatCliAutoSafeUpgradeApplyEvidence({
      gateEvidence: {
        backups: [
          {
            artifactPath: "archives/backups/site.snapshot.json",
            completedAt: "2026-06-01T00:00:00.000Z",
            kind: "backup",
            scope: "app",
            target: "https://live.example",
          },
        ],
        manualApprovals: [
          {
            approvalKey: "destructive-site-cleanup",
            approvedAt: "2026-06-01T00:00:00.000Z",
            kind: "manual-approval",
          },
        ],
      },
      packageApps: [],
      planning: planningReport([]),
      sql: { storageIdentities: [] },
      verifiedSqlStatus: { storageIdentities: [] },
    } satisfies CliAutoSafeUpgradeApplyResult);

    expect(output).toContain("Backup evidence: 1.");
    expect(output).toContain(
      "Backup scope=app artifact=archives/backups/site.snapshot.json completedAt=2026-06-01T00:00:00.000Z target=https://live.example.",
    );
    expect(output).toContain("Manual approvals: 1.");
    expect(output).toContain(
      "Manual approval destructive-site-cleanup approvedAt=2026-06-01T00:00:00.000Z.",
    );
  });
});

function planningReport(
  steps: readonly CliUpgradePlanStep[],
  blockers: CliUpgradePlanningReport["blockers"] = [],
): CliUpgradePlanningReport {
  return {
    blockers,
    plan: {
      steps,
      target: {
        targetUrl: "https://live.example",
      },
    },
    status: {
      archiveInput: { present: false },
      deployedMetadata: {
        cacheControl: "no-store",
        metadataUrl: "https://live.example/api/formless/deploy",
        packageApps: [],
        packageVersion: packageJson.version,
        runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
        storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
        version: packageJson.version,
      },
      installedApps: [],
      localPackages: [],
      verificationFailures: [],
    },
  };
}
