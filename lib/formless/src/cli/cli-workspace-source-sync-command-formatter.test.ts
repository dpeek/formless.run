import { describe, expect, it } from "vite-plus/test";

import {
  formatCliWorkspacePullOutput,
  formatCliWorkspacePushOutput,
} from "./cli-direct-workspace-command-formatter.ts";
import type { PushFormlessInstanceWorkspaceResult } from "./instance-workspace-deployment.ts";
import type {
  FormlessInstanceWorkspaceSyncPlan,
  PullFormlessInstanceWorkspaceResult,
} from "./instance-workspace-source-sync.ts";

describe("workspace source-sync CLI formatter", () => {
  it("prints the exact no-op output for typed pull and push results", () => {
    expect(formatCliWorkspacePullOutput(pullResult({ noop: true }), "/workspace")).toBe(
      "Everything up to date.",
    );
    expect(formatCliWorkspacePushOutput(pushResult({ noop: true }))).toBe("Everything up to date.");
  });

  it("renders typed pull fields and dry-run replacement paths", () => {
    expect(
      formatCliWorkspacePullOutput(
        pullResult({
          domains: [{ enabled: true, host: "example.com", profile: "publicSite" }],
          instanceState: {
            mediaCount: 2,
            recordCount: 4,
            statePath: "/workspace/state/instance.json",
          },
          mode: "dry-run",
          replacement: {
            changedStatePaths: ["state/instance.json"],
            prunedStatePaths: [],
            status: "changes",
          },
        }),
        "/workspace",
      ),
    ).toBe(
      [
        "Workspace operation: pull (succeeded).",
        "Workspace source: layout-only manifest, storage snapshots, media payloads.",
        "Summary: Workspace pulled.",
        "mediaCount: 2.",
        "mode: dry-run.",
        "noop: false.",
        "recordCount: 4.",
        "Details:",
        "changedStatePaths: state/instance.json.",
        "domainCount: 1.",
        "prunedStatePaths: none.",
        "statePath: state/instance.json.",
        'syncPlan: {"changedAreas":[],"changedDomainCount":0,"changedMediaCount":0,"changedRecordCount":0,"changedStatePathCount":0,"source":"workspace","sourceDomainCount":0,"sourceFingerprint":"source-fingerprint","sourceMediaCount":0,"sourceRecordCount":4,"status":"up-to-date","target":"instance.primary","targetDomainCount":0,"targetFingerprint":"target-fingerprint","targetMediaCount":0,"targetRecordCount":4}.',
        "target: instance.primary.",
      ].join("\n"),
    );
  });

  it("reports a typed push runtime rebuild instead of treating it as a no-op", () => {
    expect(
      formatCliWorkspacePushOutput(
        pushResult({
          noop: true,
          runtimeRebuild: {
            reason: "force",
            status: "available",
          },
        }),
      ),
    ).toBe(
      [
        "Workspace operation: push (succeeded).",
        "Workspace source: layout-only manifest, storage snapshots, media payloads.",
        "Summary: Workspace push planned.",
        "applyRestoreOk: none.",
        "backupEvidence: none.",
        "dryRunRestoreOk: none.",
        "forcedRecovery: none.",
        "mode: dry-run.",
        "noop: true.",
        "remoteComparisonEvidence: none.",
        "restoreDryRunEvidence: none.",
        "runtimeRebuild: available.",
        "sourceMedia: 0.",
        "sourceRecords: 4.",
        "sync: up-to-date.",
        "Details:",
        "applyRestore: none.",
        "dryRunRestore: none.",
        "forcedRecovery: none.",
        'runtimeRebuild: {"reason":"force","status":"available"}.',
        'syncPlan: {"changedAreas":[],"changedDomainCount":0,"changedMediaCount":0,"changedRecordCount":0,"changedStatePathCount":0,"source":"workspace","sourceDomainCount":0,"sourceFingerprint":"source-fingerprint","sourceMediaCount":0,"sourceRecordCount":4,"status":"up-to-date","target":"instance.primary","targetDomainCount":0,"targetFingerprint":"target-fingerprint","targetMediaCount":0,"targetRecordCount":4}.',
        "target: instance.primary.",
        "Deployment execution summary:",
        "accountId: account-123.",
        "deploymentUrl: https://personal.dpeek.workers.dev.",
        "desiredStateVersion: none.",
        "evidenceCount: none.",
        "healthCheckVersion: none.",
        "observedStatus: none.",
        "providerFamily: cloudflare.",
        "resourceCount: none.",
        "target: instance.primary.",
        "targetUrl: https://personal.dpeek.workers.dev.",
        "workerName: personal.",
        "workersDevSubdomain: dpeek.",
      ].join("\n"),
    );
  });

  it("reports an ordinary push backup and schema-change validation", () => {
    const output = formatCliWorkspacePushOutput(
      pushResult({
        backup: {
          archivePath: "/workspace/.formless/backups/instance.json",
          mediaCount: 2,
          recordCount: 4,
        },
        mode: "apply",
        schemaChange: {
          currentProgramProvenance: {
            kind: "program",
            sourceSchemaHash: `sha256:${"a".repeat(64)}`,
          },
          desiredProgramProvenance: {
            kind: "program",
            sourceSchemaHash: `sha256:${"b".repeat(64)}`,
          },
          localArchiveValidation: "passed",
          runtimeReconciliation: "required",
          storageCompatibility: "storage-compatible",
          targetRuntimeValidation: "passed",
        },
      }),
    );

    expect(output).toContain("backupEvidence: written.");
    expect(output).toContain(
      'backup: {"archivePath":"/workspace/.formless/backups/instance.json","mediaCount":2,"recordCount":4}.',
    );
    expect(output).toContain("storageCompatibility: storage-compatible.");
    expect(output).toContain("targetRuntimeValidation: passed.");
  });
});

function pullResult(
  overrides: Partial<PullFormlessInstanceWorkspaceResult> = {},
): PullFormlessInstanceWorkspaceResult {
  return {
    domains: [],
    instanceState: {
      mediaCount: 0,
      recordCount: 4,
      statePath: "/workspace/state/instance.json",
    },
    mode: "apply",
    noop: false,
    replacement: {
      changedStatePaths: [],
      prunedStatePaths: [],
      status: "no-changes",
    },
    selectedTarget: {
      alias: "instance.primary",
      url: "https://personal.dpeek.workers.dev",
    },
    syncPlan: sourceSyncPlan(),
    workspaceRoot: "/workspace",
    ...overrides,
  };
}

function pushResult(
  overrides: Partial<PushFormlessInstanceWorkspaceResult> = {},
): PushFormlessInstanceWorkspaceResult {
  return {
    deploymentDisplay: {
      accountId: "account-123",
      providerFamily: "cloudflare",
      target: "instance.primary",
      targetUrl: "https://personal.dpeek.workers.dev",
      workerName: "personal",
      workersDevSubdomain: "dpeek",
    },
    mode: "dry-run",
    noop: false,
    selectedTarget: {
      alias: "instance.primary",
      url: "https://personal.dpeek.workers.dev",
    },
    source: {
      archivePath: "/workspace/.formless/tmp/archive",
      mediaCount: 0,
      recordCount: 4,
    },
    syncPlan: sourceSyncPlan(),
    workspaceRoot: "/workspace",
    ...overrides,
  };
}

function sourceSyncPlan(): FormlessInstanceWorkspaceSyncPlan {
  return {
    changedAreas: [],
    changedDomainCount: 0,
    changedMedia: [],
    changedRecords: [],
    changedStatePaths: [],
    domainDesiredDrift: [],
    source: {
      domainCount: 0,
      fingerprint: "source-fingerprint",
      label: "workspace",
      mediaCount: 0,
      recordCount: 4,
    },
    status: "up-to-date",
    target: {
      domainCount: 0,
      fingerprint: "target-fingerprint",
      label: "instance.primary",
      mediaCount: 0,
      recordCount: 4,
    },
  };
}
