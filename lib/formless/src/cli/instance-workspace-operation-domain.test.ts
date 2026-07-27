import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";
import { listInstallableAppPackages, packageAppFactsForKey } from "@dpeek/formless-installed-apps";
import {
  INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  instanceControlPlaneSchema,
} from "@dpeek/formless-instance-control-plane";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import {
  INSTANCE_WORKSPACE_MANIFEST_FILE as FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE,
  defaultInstanceWorkspaceManifest as defaultFormlessInstanceWorkspaceManifest,
  formatInstanceWorkspaceManifest as formatFormlessInstanceWorkspaceManifest,
  type InstanceWorkspaceManifest as FormlessInstanceWorkspaceManifest,
} from "@dpeek/formless-workspace";
import {
  readInstanceWorkspaceControlPlaneStorageSnapshot,
  replaceInstanceWorkspaceMediaFiles,
  writeInstanceWorkspaceAppStorageSnapshot,
  writeInstanceWorkspaceControlPlaneStorageSnapshot,
} from "@dpeek/formless-workspace/node";

import packageJson from "../../package.json";
import {
  FORMLESS_RUNTIME_PROTOCOL_VERSION,
  FORMLESS_STORAGE_MIGRATION_SET_ID,
} from "../shared/deploy-metadata.ts";
import { bundledAppPackageResolver } from "../shared/app-packages.ts";
import { SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY } from "../shared/workspace-runtime-extensions.ts";
import { siteSourceSchema } from "../test/schema-apps.ts";
import {
  ALCHEMY_PASSWORD_ENV_NAME,
  FORMLESS_INSTANCE_LOCAL_ENV_FILE,
  FORMLESS_INSTANCE_STATE_FILE,
  createFormlessInstanceState,
  formatFormlessInstanceState,
  planFormlessInstanceDeployment,
  type DeployFormlessInstanceInput,
  type DestroyFormlessInstanceInput,
} from "./instance-onboarding.ts";
import {
  destroyFormlessInstanceWorkspace,
  pushFormlessInstanceWorkspace,
  type PushFormlessInstanceWorkspaceDependencies,
} from "./instance-workspace-deployment.ts";
import { runDeploymentRefreshWorkspaceOperation } from "./instance-workspace-deployment-operation.ts";
import {
  runWorkspaceOperationDomainHandler,
  type WorkspaceOperationDomainExecutionResult,
} from "./instance-workspace-operation-handlers.ts";
import type { RunFormlessWorkspaceOperationDependencies } from "./instance-workspace-operations.ts";
import {
  runPullWorkspaceSourceOperation,
  runPushWorkspaceSourceOperation,
} from "./instance-workspace-source-sync-operation.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

describe("workspace source sync operation domain", () => {
  it("pulls remote source into workspace with display-safe writeback results", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const targetUrl = "https://source-owned.dpeek.workers.dev";
    const fetcher = sourceSyncFetch(requests, {
      appData: {
        david: { mediaBytes: Buffer.from([4, 5, 6]), records: mediaRecords() },
        james: { records: [] },
      },
      controlPlaneRecords: deployControlPlaneRecordsWithProviderObservation({ targetUrl }),
      installs: [installedSite("david", "David Peek"), installedSite("james", "James Peek")],
    });

    await writeWorkspaceManifest(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot, { targetUrl });
    await writeWorkspaceAppStorageSnapshot(workspaceRoot, "stale", []);
    await mkdir(path.join(workspaceRoot, "state/media/media/stale/media/images"), {
      recursive: true,
    });
    await writeFile(
      path.join(workspaceRoot, "state/media/media/stale/media/images/cover.png"),
      Buffer.from([9, 9, 9]),
    );
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=stored-archive-token\n",
    );

    const result = await runPullWorkspaceSourceOperation(
      {
        dryRun: false,
        kind: "pull",
        workspacePath: workspaceRoot,
      },
      operationDeps(tempDir, { fetch: fetcher }),
    );
    const pulledControlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
      manifest: defaultFormlessInstanceWorkspaceManifest({ name: "personal-sites" }),
      packageResolver: bundledAppPackageResolver,
      workspaceRoot,
    });
    const pulledControlPlaneRecords = pulledControlPlane?.records ?? [];

    expect(result).toMatchObject({
      details: {
        appState: ["david", "james"],
        domainCount: 1,
        syncPlan: {
          changedStatePathCount: expect.any(Number),
          status: "changes",
          target: "workspace",
        },
        target: "instance.primary",
      },
      summary: {
        fields: {
          appCount: 2,
          mediaCount: 1,
          mode: "apply",
          noop: false,
          recordCount: 2,
        },
        title: "Workspace pulled",
      },
    });
    expect(
      (result.details?.syncPlan as { changedStatePathCount?: number } | undefined)
        ?.changedStatePathCount,
    ).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain("stored-archive-token");
    expect(JSON.stringify(pulledControlPlaneRecords)).not.toContain("observedStatus");
    expect(JSON.stringify(pulledControlPlaneRecords)).not.toContain("deploy-evidence-summary");
    expect(JSON.stringify(pulledControlPlaneRecords)).not.toContain("raw-provider-evidence");
    await expect(
      readFile(path.join(workspaceRoot, "state/media/media/david/media/images/cover.png")),
    ).resolves.toEqual(Buffer.from([4, 5, 6]));
    await expect(
      readFile(path.join(workspaceRoot, "state/apps/james.json"), "utf8"),
    ).resolves.toContain('"storageIdentity": "app:james"');
    await expect(stat(path.join(workspaceRoot, "state/apps/stale.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(requests.map((request) => request.headers.authorization)).toEqual(
      requests.map(() => "Bearer stored-archive-token"),
    );
  });

  it("plans pull replacement without mutating workspace source during dry-run", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const fetcher = sourceSyncFetch(requests, {
      appData: {
        david: { mediaBytes: Buffer.from([4, 5, 6]), records: mediaRecords() },
      },
      installs: [installedSite("david", "David Peek")],
    });

    await writeWorkspaceManifest(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
    await writeWorkspaceAppStorageSnapshot(workspaceRoot, "david", []);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=stored-archive-token\n",
    );
    const appStateBefore = await readFile(
      path.join(workspaceRoot, "state/apps/david.json"),
      "utf8",
    );

    const result = await runPullWorkspaceSourceOperation(
      {
        dryRun: true,
        kind: "pull",
        workspacePath: workspaceRoot,
      },
      operationDeps(tempDir, { fetch: fetcher }),
    );

    expect(result).toMatchObject({
      details: {
        changedStatePaths: expect.arrayContaining(["state/apps/david.json"]),
        prunedStatePaths: [],
        syncPlan: {
          changedRecordCount: 1,
          status: "changes",
        },
      },
      summary: {
        fields: {
          mode: "dry-run",
          noop: false,
        },
        title: "Workspace pulled",
      },
    });
    await expect(readFile(path.join(workspaceRoot, "state/apps/david.json"), "utf8")).resolves.toBe(
      appStateBefore,
    );
    await expect(
      stat(path.join(workspaceRoot, "state/media/media/david/media/images/cover.png")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(requests.some((request) => request.method === "POST")).toBe(false);
  });

  it("returns repeat pull no-op results without rewriting matching source", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const fetcher = sourceSyncFetch(requests, {
      appData: { david: { records: [] } },
      installs: [installedSite("david", "David Peek")],
    });

    await writeWorkspaceManifest(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
    await writeWorkspaceAppStorageSnapshot(workspaceRoot, "david", []);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=stored-archive-token\n",
    );
    const appStateBefore = await readFile(
      path.join(workspaceRoot, "state/apps/david.json"),
      "utf8",
    );

    const result = await runPullWorkspaceSourceOperation(
      {
        dryRun: false,
        kind: "pull",
        workspacePath: workspaceRoot,
      },
      operationDeps(tempDir, { fetch: fetcher }),
    );

    expect(result).toMatchObject({
      details: {
        syncPlan: {
          changedStatePathCount: 0,
          status: "up-to-date",
        },
      },
      summary: {
        fields: {
          mode: "apply",
          noop: true,
        },
        title: "Workspace pulled",
      },
    });
    await expect(readFile(path.join(workspaceRoot, "state/apps/david.json"), "utf8")).resolves.toBe(
      appStateBefore,
    );
    expect(requests.some((request) => request.method === "POST")).toBe(false);
  });

  it("summarizes push dry-run plans without provider mutation dependencies", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];

    await writeWorkspaceManifest(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
    await writeWorkspaceAppStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    const result = await runPushWorkspaceSourceOperation(
      {
        dryRun: true,
        kind: "push",
        workspacePath: workspaceRoot,
      },
      operationDepsWithAccessGuards(
        operationDeps(tempDir, {
          accountDiscovery: {
            listAccounts: async () => [{ id: "account-123", workersDevSubdomain: "dpeek" }],
          },
          fetch: deployFetch(requests),
          packageVersion: packageJson.version,
        }),
        [
          "credentialSetup",
          "deploymentAdapter",
          "healthCheck",
          "localSecretEnv",
          "packageRoot",
          "randomToken",
          "setupCapability",
        ],
      ),
    );

    expect(result).toMatchObject({
      details: {
        applyRestore: null,
        dryRunRestore: null,
        syncPlan: {
          changedRecordCount: 0,
          changedStatePathCount: 0,
          status: "up-to-date",
        },
        target: "instance.primary",
      },
      summary: {
        fields: {
          mode: "dry-run",
          noop: true,
          sourceApps: 1,
          sourceRecords: 0,
          sync: "up-to-date",
        },
        title: "Workspace push planned",
      },
    });

    const requestPaths = requests.map(
      (request) => `${request.method} ${new URL(request.url).pathname}`,
    );

    expect(requests.every((request) => request.method === "GET")).toBe(true);
    expect(requestPaths).toContain("GET /api/formless/control-plane/snapshot");
    expect(requestPaths).toContain("GET /api/app-installs/site/david/snapshot");
    expect(requestPaths).not.toContain("POST /api/formless/archive/restore");
    expect(requestPaths).not.toContain("GET /api/formless/deployments/desired-state");
  });

  it("plans push dry-run restore payloads from local source without provider mutation", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const fetcher = sourceSyncFetch(requests, {
      appData: { david: { records: [] } },
      installs: [installedSite("david", "David Peek")],
      restoreResponses: [restorePlan({ replacedInstalls: ["david"] })],
    });

    await writeWorkspaceManifest(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
    await writeWorkspaceAppStorageSnapshot(workspaceRoot, "david", mediaRecords());
    await writeWorkspaceMediaFile(workspaceRoot, "david", Buffer.from([4, 5, 6]));
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    const result = await runPushWorkspaceSourceOperation(
      {
        dryRun: true,
        kind: "push",
        workspacePath: workspaceRoot,
      },
      operationDepsWithAccessGuards(
        operationDeps(tempDir, {
          accountDiscovery: {
            listAccounts: async () => [{ id: "account-123", workersDevSubdomain: "dpeek" }],
          },
          fetch: fetcher,
          packageVersion: packageJson.version,
        }),
        [
          "credentialSetup",
          "deploymentAdapter",
          "healthCheck",
          "localSecretEnv",
          "packageRoot",
          "randomToken",
          "setupCapability",
        ],
      ),
    );
    const restoreRequest = requestByPath(requests, "/api/formless/archive/restore");
    const restoreBody = capturedRequestJson<{
      archive: { apps: Array<{ app: { installId: string } }>; restorePolicy: unknown };
      exactInstanceReplacement: boolean;
    }>(restoreRequest);

    expect(result).toMatchObject({
      details: {
        dryRunRestore: {
          ok: true,
          replacedInstalls: ["david"],
        },
        syncPlan: {
          changedRecordCount: 1,
          changedStatePathCount: 1,
          status: "changes",
        },
        target: "instance.primary",
      },
      summary: {
        fields: {
          mode: "dry-run",
          noop: false,
          sourceApps: 1,
          sourceMedia: 1,
          sourceRecords: 2,
          sync: "changes",
        },
        title: "Workspace push planned",
      },
    });
    expect(restoreRequest.headers.authorization).toBe("Bearer local-token");
    expect(restoreBody.archive.restorePolicy).toEqual({
      dryRun: true,
      installCollisions: "replace",
    });
    expect(restoreBody.archive.apps.map((app) => app.app.installId)).toEqual(["david"]);
    expect(restoreBody.exactInstanceReplacement).toBe(true);
    expect(
      requests.map((request) => `${request.method} ${new URL(request.url).pathname}`),
    ).not.toContain("POST /api/formless/control-plane/operations/deployment-config/update");
    expect(JSON.stringify(result)).not.toContain("local-token");
  });

  it("treats matching records and schema provenance as repeat push no-op", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const changedRemoteSchema = JSON.parse(
      JSON.stringify(siteSourceSchema),
    ) as typeof siteSourceSchema;

    changedRemoteSchema.entities.site = {
      ...changedRemoteSchema.entities.site!,
      label: "Changed remote schema body",
    };

    const fetcher = sourceSyncFetch(requests, {
      appData: { david: { records: [], schema: changedRemoteSchema } },
      installs: [installedSite("david", "David Peek")],
    });

    await writeWorkspaceManifest(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
    await writeWorkspaceAppStorageSnapshot(workspaceRoot, "david", []);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    const result = await runPushWorkspaceSourceOperation(
      {
        dryRun: false,
        kind: "push",
        workspacePath: workspaceRoot,
      },
      pushApplyOperationDeps(tempDir, { fetch: fetcher }),
    );

    expect(result).toMatchObject({
      details: {
        applyRestore: null,
        dryRunRestore: null,
        syncPlan: {
          changedRecordCount: 0,
          status: "up-to-date",
        },
      },
      summary: {
        fields: {
          mode: "apply",
          noop: true,
          sync: "up-to-date",
        },
        title: "Workspace push applied",
      },
    });
    expect(requests.some((request) => request.method === "POST")).toBe(false);
    expect(JSON.stringify(result)).not.toContain("local-token");
  });
});

describe("deployment refresh operation domain", () => {
  it("emits deployment summary and ordered step vocabulary from the domain module", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];

    await writeWorkspaceManifest(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    const result = await runDeploymentRefreshWorkspaceOperation(
      {
        kind: "deploymentRefresh",
        workspacePath: workspaceRoot,
      },
      operationDeps(tempDir, {
        fetch: deployFetch(requests),
      }),
    );
    const desiredState = deploymentDesiredStateRef();
    const observation = capturedRequestJson<{
      input: {
        observedDesiredStateHash: string;
        observedStatus: string;
      };
      recordId: string;
    }>(requestByPath(requests, "/api/formless/control-plane/operations/deployment-config/update"));

    expect(result).toMatchObject({
      deployment: {
        observation: {
          desiredState,
          observedStatus: "unknown",
          targetId: "instance.primary",
        },
        status: {
          state: "pending-changes",
        },
        targetAlias: "instance.primary",
      },
      summary: {
        fields: {
          desiredStateVersion: "desired.instance.primary.3",
          observedStatus: "unknown",
          status: "pending-changes",
          target: "instance.primary",
        },
        title: "Deployment observation refreshed",
      },
    });
    expect(
      result.steps?.map((step) => ({ id: step.id, label: step.label, status: step.status })),
    ).toEqual([
      { id: "credentials", label: "Credentials", status: "succeeded" },
      { id: "account-selection", label: "Account selection", status: "skipped" },
      { id: "desired-state-plan", label: "Desired-state plan", status: "succeeded" },
      {
        id: "provider-reconciliation",
        label: "Provider reconciliation",
        status: "skipped",
      },
      { id: "health-check", label: "Health check", status: "skipped" },
      { id: "owner-setup", label: "Owner setup", status: "skipped" },
      {
        id: "workspace-push-writeback",
        label: "Workspace push/writeback",
        status: "skipped",
      },
      { id: "observation-refresh", label: "Observation refresh", status: "succeeded" },
    ]);
    expect(observation).toMatchObject({
      input: {
        observedDesiredStateHash: desiredState.hash,
        observedStatus: "unknown",
      },
      recordId: "instance.primary",
    });
  });
});

describe("deployment runtime domain", () => {
  it("applies provider reconciliation, writes deploy state, and returns display-safe deployment summary", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];

    await writeWorkspaceManifest(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
    await writeWorkspaceAppStorageSnapshot(workspaceRoot, "david", mediaRecords());
    await writeWorkspaceMediaFile(workspaceRoot, "david", Buffer.from([4, 5, 6]));
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    const result = await runPushWorkspaceSourceOperation(
      {
        dryRun: false,
        force: false,
        kind: "push",
        workspacePath: workspaceRoot,
      },
      deploymentApplyOperationDeps(tempDir, {
        deployInputs,
        env: { CLOUDFLARE_API_TOKEN: "manual-provider-token" },
        fetch: deployFetch(requests),
      }),
    );
    const observation = capturedRequestJson<{
      input: {
        observedDesiredStateHash: string;
        observedStatus: string;
      };
      recordId: string;
    }>(requestByPath(requests, "/api/formless/control-plane/operations/deployment-config/update"));
    const deploymentStateRoot = path.join(workspaceRoot, ".formless/deploy/personal");

    expect(deployInputs).toHaveLength(1);
    expect(deployInputs[0]).toMatchObject({
      credentialProfile: null,
      packageRoot: tempDir,
      secrets: {
        ALCHEMY_PASSWORD: "generated-secret",
        CLOUDFLARE_API_TOKEN: "manual-provider-token",
        FORMLESS_ADMIN_TOKEN: "local-token",
      },
      stateRoot: deploymentStateRoot,
      workspaceRoot,
    });
    expect(
      deployInputs[0]?.deploymentResourceGraph?.resources.map((resource) => resource.kind),
    ).toEqual(["cloudflare-worker-custom-domain"]);
    expect(result).toMatchObject({
      deployment: {
        accountId: "account-123",
        deploymentUrl: "https://personal.dpeek.workers.dev",
        desiredStateVersion: expect.stringMatching(/^desired\.instance\.primary\./),
        healthCheckVersion: packageJson.version,
        observedStatus: "deployed",
        providerFamily: "cloudflare",
        target: "instance.primary",
        workerName: "personal",
      },
      details: {
        applyRestore: {
          ok: true,
          replacedInstalls: ["david"],
        },
        dryRunRestore: {
          ok: true,
          replacedInstalls: ["david"],
        },
        syncPlan: {
          status: "changes",
        },
      },
      summary: {
        fields: {
          applyRestoreOk: true,
          dryRunRestoreOk: true,
          mode: "apply",
          noop: false,
          sync: "changes",
        },
        title: "Workspace push applied",
      },
    });
    expect(observation).toMatchObject({
      input: {
        observedDesiredStateHash: expect.stringMatching(/^sha256:/),
        observedStatus: "deployed",
      },
      recordId: "instance.primary",
    });
    await expect(
      readFile(path.join(deploymentStateRoot, FORMLESS_INSTANCE_STATE_FILE), "utf8"),
    ).resolves.toContain("personal-authority");
    expect(JSON.stringify(result)).not.toContain("manual-provider-token");
    expect(JSON.stringify(result)).not.toContain("local-token");
  });

  it("reconciles readable package fact drift before final push restore validation", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const restoreEvents: string[] = [];
    const localPackageFacts = packageAppFactsForKey("site", bundledAppPackageResolver);

    if (!localPackageFacts) {
      throw new Error("Missing bundled package facts for site.");
    }

    const staleRemoteInstall = {
      ...installedSite("david", "David Peek"),
      packageRevision: localPackageFacts.packageRevision + 1,
      sourceSchemaHash: `sha256:${"a".repeat(64)}` as `sha256:${string}`,
    };

    await writeWorkspaceManifest(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
    await writeWorkspaceAppStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    const result = await runPushWorkspaceSourceOperation(
      {
        dryRun: false,
        force: false,
        kind: "push",
        workspacePath: workspaceRoot,
      },
      deploymentApplyOperationDeps(tempDir, {
        deployInputs,
        env: { CLOUDFLARE_API_TOKEN: "manual-provider-token" },
        fetch: deployFetch(requests, {
          installs: [staleRemoteInstall],
          restoreResponse: ({ dryRun }) => {
            if (deployInputs.length === 0) {
              restoreEvents.push(dryRun ? "predeploy:dry-run" : "predeploy:apply");

              return {
                ok: false,
                errors: [{ message: "stale runtime rejected source schema facts" }],
              };
            }

            restoreEvents.push(dryRun ? "postdeploy:dry-run" : "postdeploy:apply");

            return dryRun
              ? restorePlan({ replacedInstalls: ["david"] })
              : { ok: true, report: { applied: true, summary: restoreSummary() } };
          },
        }),
      }),
    );
    const restoreRequests = requests.filter(
      (request) =>
        request.method === "POST" &&
        new URL(request.url).pathname === "/api/formless/archive/restore",
    );
    const restoreBodies = restoreRequests.map((request) =>
      capturedRequestJson<{
        archive: {
          apps: Array<{
            app: {
              packageRevision: number;
              sourceSchemaHash: string;
            };
          }>;
          restorePolicy: unknown;
        };
        exactInstanceReplacement: boolean;
      }>(request),
    );

    expect(deployInputs).toHaveLength(1);
    expect(restoreEvents).toEqual(["postdeploy:dry-run", "postdeploy:apply"]);
    expect(result).toMatchObject({
      details: {
        applyRestore: {
          ok: true,
          replacedInstalls: ["david"],
        },
        dryRunRestore: {
          ok: true,
          replacedInstalls: ["david"],
        },
        syncPlan: {
          changedAreas: expect.arrayContaining(["packages"]),
          status: "changes",
        },
      },
      summary: {
        fields: {
          applyRestoreOk: true,
          dryRunRestoreOk: true,
          mode: "apply",
          noop: false,
          sync: "changes",
        },
        title: "Workspace push applied",
      },
    });
    expect(restoreRequests).toHaveLength(2);
    expect(restoreBodies.map((body) => body.archive.restorePolicy)).toEqual([
      { dryRun: true, installCollisions: "replace" },
      { dryRun: false, installCollisions: "replace" },
    ]);
    expect(restoreBodies.every((body) => body.exactInstanceReplacement)).toBe(true);
    expect(restoreBodies[1]?.archive.apps[0]?.app).toMatchObject({
      packageRevision: localPackageFacts.packageRevision,
      sourceSchemaHash: localPackageFacts.sourceSchemaHash,
    });
  });

  it("rebuilds runtime extensions on repeat push apply without restoring archive data", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const runtimeExtensions = {
      [SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY]: {
        browser: "renderers/site-public.browser.tsx",
        worker: "renderers/site-public.worker.tsx",
      },
    };

    await writeWorkspaceManifest(workspaceRoot, {
      runtime: { extensions: runtimeExtensions },
    });
    await writeDeployStorageSnapshot(workspaceRoot);
    await writeWorkspaceAppStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    const result = await runPushWorkspaceSourceOperation(
      {
        dryRun: false,
        force: false,
        kind: "push",
        workspacePath: workspaceRoot,
      },
      deploymentApplyOperationDeps(tempDir, {
        deployInputs,
        env: { CLOUDFLARE_API_TOKEN: "manual-provider-token" },
        fetch: deployFetch(requests),
      }),
    );

    expect(deployInputs).toHaveLength(1);
    expect(JSON.parse(deployInputs[0]?.workspaceRuntimeExtensions ?? "{}")).toEqual(
      runtimeExtensions,
    );
    expect(
      requests.filter(
        (request) =>
          request.method === "POST" &&
          new URL(request.url).pathname === "/api/formless/archive/restore",
      ),
    ).toEqual([]);
    expect(result).toMatchObject({
      details: {
        runtimeRebuild: {
          reason: "runtime-extensions-configured",
          status: "applied",
        },
      },
      summary: {
        fields: {
          runtimeRebuild: "applied",
          sync: "up-to-date",
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("manual-provider-token");
  });

  it("forces unreadable target replacement and omits invalid remote control-plane records", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];

    await writeWorkspaceManifest(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
    await writeWorkspaceAppStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    const result = await pushFormlessInstanceWorkspace(
      {
        apply: true,
        force: true,
        workspacePath: workspaceRoot,
      },
      deploymentApplyOperationDeps(tempDir, {
        deployInputs,
        env: { CLOUDFLARE_API_TOKEN: "manual-provider-token" },
        fetch: deployFetch(requests, {
          controlPlaneRecords: invalidRemoteControlPlaneRecords(),
        }),
      }),
    );
    const restoreRequests = requests.filter(
      (request) =>
        request.method === "POST" &&
        new URL(request.url).pathname === "/api/formless/archive/restore",
    );
    const restoreBody = capturedRequestJson<{
      archive: { controlPlane?: { records: StoredRecord[] }; restorePolicy: unknown };
      exactInstanceReplacement: boolean;
    }>(restoreRequests[0]!);

    expect(deployInputs).toHaveLength(1);
    expect(result.forcedRecovery).toMatchObject({
      action: "replace-unreadable-target",
      status: "applied",
    });
    expect(restoreRequests).toHaveLength(1);
    expect(restoreBody.exactInstanceReplacement).toBe(true);
    expect(restoreBody.archive.restorePolicy).toEqual({
      dryRun: false,
      installCollisions: "replace",
    });
    expect(restoreBody.archive.controlPlane?.records.map((record) => record.id)).not.toContain(
      "remote-invalid-control-plane-record",
    );
    expect(JSON.stringify(restoreBody.archive)).not.toContain("legacy-control-plane-record");
  });

  it("rejects invalid local push source before provider or restore mutation", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];

    await writeWorkspaceManifest(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    await expect(
      pushFormlessInstanceWorkspace(
        {
          apply: true,
          force: false,
          workspacePath: workspaceRoot,
        },
        deploymentApplyOperationDeps(tempDir, {
          deployInputs,
          env: { CLOUDFLARE_API_TOKEN: "manual-provider-token" },
          fetch: deployFetch(requests),
        }),
      ),
    ).rejects.toThrow("Formless instance push requires local app state state/apps/david.json.");
    expect(deployInputs).toHaveLength(0);
    expect(
      requests.filter(
        (request) =>
          request.method === "POST" &&
          new URL(request.url).pathname === "/api/formless/archive/restore",
      ),
    ).toEqual([]);
    expect(
      requests.filter(
        (request) =>
          request.method === "POST" &&
          new URL(request.url).pathname ===
            "/api/formless/control-plane/operations/deployment-config/update",
      ),
    ).toEqual([]);
  });

  it("omits removed host routes from the provider graph while replacing target source", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const localControlPlaneRecords = deployControlPlaneRecords().filter(
      (record) => record.id !== "route:host:public-site:www.example.com",
    );

    await writeWorkspaceManifest(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot, { records: localControlPlaneRecords });
    await writeWorkspaceAppStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    await pushFormlessInstanceWorkspace(
      {
        apply: true,
        force: false,
        workspacePath: workspaceRoot,
      },
      deploymentApplyOperationDeps(tempDir, {
        deployInputs,
        env: { CLOUDFLARE_API_TOKEN: "manual-provider-token" },
        fetch: deployFetch(requests),
      }),
    );
    const restoreRequest = requestByPath(requests, "/api/formless/archive/restore");
    const restoreBody = capturedRequestJson<{
      archive: { controlPlane?: { records: StoredRecord[] } };
    }>(restoreRequest);

    expect(deployInputs).toHaveLength(1);
    expect(deployInputs[0]?.deploymentResourceGraph?.resources).toEqual([]);
    expect(restoreBody.archive.controlPlane?.records.map((record) => record.id)).not.toContain(
      "route:host:public-site:www.example.com",
    );
  });

  it("records display-safe failure observations when provider reconciliation fails", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];

    await writeWorkspaceManifest(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
    await writeWorkspaceAppStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    await expect(
      pushFormlessInstanceWorkspace(
        {
          apply: true,
          force: true,
          workspacePath: workspaceRoot,
        },
        {
          accountDiscovery: {
            listAccounts: async () => [{ id: "account-123", workersDevSubdomain: "dpeek" }],
          },
          cwd: tempDir,
          deploymentAdapter: {
            deploy: async (input) => {
              deployInputs.push(input);
              throw new Error("provider outage CF_API_TOKEN=raw-token");
            },
          },
          fetch: deployFetch(requests),
          healthCheck: {
            check: async () => {
              throw new Error("Health check should not run after deploy failure.");
            },
          },
          localSecretEnv: localSecretEnvStore(),
          now: timestampSequence("2026-06-02T00:08:00.000Z", "2026-06-02T00:08:01.000Z"),
          packageRoot: tempDir,
          packageVersion: packageJson.version,
          randomToken: () => "generated-secret",
          setupCapability: {
            create: async () => {
              throw new Error("Owner setup should not run after deploy failure.");
            },
          },
        },
      ),
    ).rejects.toThrow("provider outage");

    const observation = capturedRequestJson<{
      input: {
        observedError: string;
        observedStatus: string;
        observedSummary: string;
      };
      recordId: string;
    }>(requestByPath(requests, "/api/formless/control-plane/operations/deployment-config/update"));

    expect(deployInputs).toHaveLength(1);
    expect(deployInputs[0]).toMatchObject({
      credentialProfile: null,
      packageRoot: tempDir,
      secrets: {
        ALCHEMY_PASSWORD: "generated-secret",
        FORMLESS_ADMIN_TOKEN: "local-token",
      },
    });
    expect(observation).toMatchObject({
      input: {
        observedError: "Local workspace push provider reconciliation failed.",
        observedStatus: "failed",
        observedSummary: "Local workspace push provider reconciliation failed.",
      },
      recordId: "instance.primary",
    });
    expect(JSON.stringify(observation.input)).not.toContain("raw-token");
  });

  it("tears down selected provider state and removes ignored deploy state", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const destroyInputs: DestroyFormlessInstanceInput[] = [];
    const plan = deploymentPlan();
    const deploymentStateRoot = path.join(workspaceRoot, ".formless/deploy/personal");

    await writeWorkspaceManifest(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
    await writeDeploymentLocalState(deploymentStateRoot, plan);

    const result = await destroyFormlessInstanceWorkspace(
      {
        confirm: "personal",
        workspacePath: workspaceRoot,
      },
      {
        cwd: tempDir,
        deploymentAdapter: {
          deploy: async () => {
            throw new Error("Deploy should not run during destroy.");
          },
          destroy: async (input) => {
            destroyInputs.push(input);

            return {
              resources: {
                alchemyState: "destroyed",
                customDomains: 1,
                dnsRecords: 1,
                durableObjectNamespace: "destroyed",
                mediaBucket: "destroyed",
                turnstileWidget: "skipped",
                worker: "destroyed",
                workerAssets: "destroyed",
                workerSecrets: "destroyed",
              },
            };
          },
        },
        env: {},
        packageRoot: tempDir,
        packageVersion: packageJson.version,
      },
    );

    expect(destroyInputs).toHaveLength(1);
    expect(destroyInputs[0]).toMatchObject({
      credentialProfile: null,
      packageRoot: tempDir,
      secrets: {
        ALCHEMY_PASSWORD: "alchemy-secret",
        CLOUDFLARE_API_TOKEN: "cf-token",
      },
      stateRoot: deploymentStateRoot,
    });
    expect(destroyInputs[0].domainProviderResources?.resources.length).toBeGreaterThan(0);
    expect(result.routeProviderResources).toMatchObject({
      enabledHosts: ["www.example.com"],
      routeCount: 1,
      source: "instance:route",
    });
    expect(result.destroy.resources).toMatchObject({
      customDomains: 1,
      dnsRecords: 1,
      turnstileWidget: "skipped",
      worker: "destroyed",
    });
    expect(JSON.stringify(result)).not.toContain("cf-token");
    expect(JSON.stringify(result)).not.toContain("alchemy-secret");
    await expect(
      readFile(path.join(deploymentStateRoot, FORMLESS_INSTANCE_STATE_FILE), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("credential setup operation domain", () => {
  it("forwards display-safe authorization events and continuation results", async () => {
    const workspaceRoot = "/workspace/personal-sites";
    const setupInputs: unknown[] = [];

    const start = (await runWorkspaceOperationDomainHandler(
      {
        accountId: "account-123",
        kind: "credentialSetup",
        profileLabel: "Default",
        provider: "cloudflare",
      },
      operationDeps("/workspace", {
        credentialSetup: async (input) => {
          setupInputs.push(input);

          return {
            continue: async () => ({
              result: {
                details: {
                  accountId: "account-123",
                  credentialRef: "formless-cloudflare-oauth:default",
                },
                summary: {
                  fields: {
                    credentialRef: "formless-cloudflare-oauth:default",
                    provider: "cloudflare",
                    status: "ready",
                  },
                  title: "Cloudflare credentials ready",
                },
              },
              status: "succeeded",
            }),
            events: [
              {
                at: "2026-06-02T00:07:00.000Z",
                profileLabel: "Default",
                provider: "cloudflare",
                status: "waiting",
                type: "externalAuthorizationUrl",
                url: "https://dash.cloudflare.com/oauth2/authorize?client_id=formless",
              },
            ],
            result: {
              details: {
                credentialRef: "formless-cloudflare-oauth:default",
              },
              summary: {
                fields: {
                  provider: "cloudflare",
                  status: "waiting-for-authorization",
                },
                title: "Cloudflare authorization required",
              },
            },
            status: "running",
          };
        },
      }),
      { workspaceRoot },
    )) as WorkspaceOperationDomainExecutionResult;

    expect(setupInputs).toEqual([
      {
        accountId: "account-123",
        profileLabel: "Default",
        provider: "cloudflare",
        workspaceRoot,
      },
    ]);
    expect(start).toMatchObject({
      events: [
        {
          profileLabel: "Default",
          provider: "cloudflare",
          status: "waiting",
          type: "externalAuthorizationUrl",
          url: "https://dash.cloudflare.com/oauth2/authorize?client_id=formless",
        },
      ],
      logMessage: "credentialSetup awaiting authorization.",
      result: {
        summary: {
          fields: {
            provider: "cloudflare",
            status: "waiting-for-authorization",
          },
          title: "Cloudflare authorization required",
        },
      },
      status: "running",
    });

    const continued = (await start.continue?.()) as WorkspaceOperationDomainExecutionResult;

    expect(continued).toMatchObject({
      logMessage: "credentialSetup completed.",
      result: {
        details: {
          accountId: "account-123",
          credentialRef: "formless-cloudflare-oauth:default",
        },
        summary: {
          fields: {
            credentialRef: "formless-cloudflare-oauth:default",
            provider: "cloudflare",
            status: "ready",
          },
          title: "Cloudflare credentials ready",
        },
      },
      status: "succeeded",
    });
  });
});

function localSecretEnvStore() {
  return {
    ensure: async (input: { createSecret: () => string; root: string }) => {
      const secret = input.createSecret();
      const secretPath = path.join(input.root, FORMLESS_INSTANCE_LOCAL_ENV_FILE);

      await mkdir(input.root, { recursive: true });
      await writeFile(secretPath, `${ALCHEMY_PASSWORD_ENV_NAME}=${secret}\n`);

      return {
        created: true,
        path: secretPath,
        secrets: { ALCHEMY_PASSWORD: secret },
      };
    },
  };
}

function deploymentPlan() {
  return planFormlessInstanceDeployment({
    account: { id: "account-123", workersDevSubdomain: "dpeek" },
    adoptExistingDeployment: true,
    instanceName: "personal",
    packageVersion: packageJson.version,
  });
}

async function writeDeploymentLocalState(
  deploymentStateRoot: string,
  plan: ReturnType<typeof deploymentPlan>,
) {
  await mkdir(deploymentStateRoot, { recursive: true });
  await writeFile(
    path.join(deploymentStateRoot, FORMLESS_INSTANCE_STATE_FILE),
    formatFormlessInstanceState(createFormlessInstanceState({ credentialProfile: null, plan })),
  );
  await writeFile(
    path.join(deploymentStateRoot, FORMLESS_INSTANCE_LOCAL_ENV_FILE),
    `${ALCHEMY_PASSWORD_ENV_NAME}=alchemy-secret\nCLOUDFLARE_API_TOKEN=cf-token\n`,
  );
}

function operationDeps(
  cwd: string,
  options: {
    accountDiscovery?: RunFormlessWorkspaceOperationDependencies["accountDiscovery"];
    credentialSetup?: RunFormlessWorkspaceOperationDependencies["credentialSetup"];
    env?: NodeJS.ProcessEnv;
    fetch?: typeof fetch;
    packageVersion?: string;
  } = {},
): RunFormlessWorkspaceOperationDependencies {
  return {
    ...(options.accountDiscovery === undefined
      ? {}
      : { accountDiscovery: options.accountDiscovery }),
    ...(options.credentialSetup === undefined ? {} : { credentialSetup: options.credentialSetup }),
    cwd,
    ...(options.env === undefined ? {} : { env: options.env }),
    fetch: options.fetch ?? fetch,
    now: timestampSequence("2026-06-02T00:07:00.000Z", "2026-06-02T00:07:01.000Z"),
    ...(options.packageVersion === undefined ? {} : { packageVersion: options.packageVersion }),
  };
}

function pushApplyOperationDeps(
  cwd: string,
  options: {
    accountDiscovery?: RunFormlessWorkspaceOperationDependencies["accountDiscovery"];
    env?: NodeJS.ProcessEnv;
    fetch?: typeof fetch;
  } = {},
): RunFormlessWorkspaceOperationDependencies {
  return {
    ...operationDeps(cwd, {
      accountDiscovery: options.accountDiscovery ?? {
        listAccounts: async () => [{ id: "account-123", workersDevSubdomain: "dpeek" }],
      },
      env: options.env,
      fetch: options.fetch,
      packageVersion: packageJson.version,
    }),
    deploymentAdapter: {
      deploy: async () => {
        throw new Error("Provider reconciliation should not run for no-op source sync.");
      },
    },
    healthCheck: {
      check: async () => {
        throw new Error("Health check should not run for no-op source sync.");
      },
    },
    localSecretEnv: {
      ensure: async () => {
        throw new Error("Local secret env should not be written for no-op source sync.");
      },
    },
    packageRoot: cwd,
    randomToken: () => "generated-secret",
    setupCapability: {
      create: async () => {
        throw new Error("Owner setup should not run for no-op source sync.");
      },
    },
  };
}

function operationDepsWithAccessGuards(
  dependencies: RunFormlessWorkspaceOperationDependencies,
  guardedKeys: readonly string[],
): RunFormlessWorkspaceOperationDependencies {
  for (const key of guardedKeys) {
    Object.defineProperty(dependencies, key, {
      configurable: true,
      get() {
        throw new Error(`Unexpected dependency access: ${key}`);
      },
    });
  }

  return dependencies;
}

function deploymentApplyOperationDeps(
  cwd: string,
  options: {
    deployInputs?: DeployFormlessInstanceInput[];
    env?: NodeJS.ProcessEnv;
    fetch?: typeof fetch;
    packageRoot?: string;
  } = {},
): PushFormlessInstanceWorkspaceDependencies {
  return {
    accountDiscovery: {
      listAccounts: async () => [{ id: "account-123", workersDevSubdomain: "dpeek" }],
    },
    cwd,
    deploymentAdapter: {
      deploy: async (input) => {
        options.deployInputs?.push(input);

        return { resourceEvidence: [], url: input.plan.expectedUrl.url };
      },
    },
    ...(options.env === undefined ? {} : { env: options.env }),
    fetch: options.fetch ?? fetch,
    healthCheck: {
      check: async (input) => ({
        cacheControl: "no-store",
        metadataUrl: new URL("/api/formless/deploy", `${input.url}/`).toString(),
        packageVersion: input.expectedVersion,
        runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
        storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
        url: input.url,
        version: input.expectedVersion,
      }),
    },
    localSecretEnv: localSecretEnvStore(),
    now: timestampSequence("2026-06-02T00:07:00.000Z", "2026-06-02T00:07:01.000Z"),
    packageRoot: options.packageRoot ?? cwd,
    packageVersion: packageJson.version,
    randomToken: () => "generated-secret",
    setupCapability: {
      create: async (input) => ({
        capabilityCreated: true,
        endpointUrl: `${input.deploymentUrl}/api/formless/setup`,
        setupComplete: false,
      }),
    },
  };
}

function timestampSequence(...timestamps: string[]): () => string {
  let index = 0;

  return () =>
    timestamps[index++ % timestamps.length] ?? timestamps.at(-1) ?? new Date(0).toISOString();
}

async function writeWorkspaceManifest(
  workspaceRoot: string,
  options: { runtime?: FormlessInstanceWorkspaceManifest["runtime"] } = {},
) {
  const manifest = {
    version: 1 as const,
    kind: "formless-instance-workspace" as const,
    name: "personal-sites",
    local: { stateRoot: ".formless/local", secretStateRoot: ".formless" },
    ...(options.runtime === undefined ? {} : { runtime: options.runtime }),
  };

  await mkdir(workspaceRoot, { recursive: true });
  await writeFile(
    path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE),
    formatFormlessInstanceWorkspaceManifest(manifest),
  );
}

async function writeDeployStorageSnapshot(
  workspaceRoot: string,
  options: {
    credentialRef?: string;
    records?: StoredRecord[];
    targetUrl?: string;
    workerName?: string | null;
  } = {},
) {
  await writeInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest: defaultFormlessInstanceWorkspaceManifest({ name: "personal-sites" }),
    packageResolver: bundledAppPackageResolver,
    snapshot: controlPlaneSnapshot(options.records ?? deployControlPlaneRecords(options)),
    workspaceRoot,
  });
}

async function writeWorkspaceAppStorageSnapshot(
  workspaceRoot: string,
  installId: string = "david",
  records: StoredRecord[] = [],
) {
  const facts = packageAppFactsForKey("site", bundledAppPackageResolver);

  if (!facts) {
    throw new Error("Missing bundled package facts for site.");
  }

  await writeInstanceWorkspaceAppStorageSnapshot({
    installId,
    manifest: defaultFormlessInstanceWorkspaceManifest({ name: "personal-sites" }),
    schemaProvenance: {
      kind: "package-app",
      packageAppKey: "site",
      packageRevision: facts.packageRevision,
      sourceSchemaHash: facts.sourceSchemaHash,
    },
    snapshot: snapshot(records, `app:${installId}`),
    workspaceRoot,
  });
}

async function writeWorkspaceMediaFile(
  workspaceRoot: string,
  installId: string,
  bytes: Uint8Array,
) {
  const manifest = defaultFormlessInstanceWorkspaceManifest({ name: "personal-sites" });
  const storageKey = "media/images/cover.png";
  const archivePath = `media/${installId}/${storageKey}`;
  const deliveryHref = "/api/formless/media/media/images/cover.png";
  const object = {
    archivePath,
    asset: {
      byteSize: bytes.byteLength,
      contentType: "image/png",
      deliveryHref,
      id: "cover.png",
      kind: "image",
      label: "cover.png",
      provider: "r2",
      status: "ready",
      storageKey,
    },
    byteSize: bytes.byteLength,
    contentType: "image/png",
    deliveryHref,
    storageKey,
  };

  await replaceInstanceWorkspaceMediaFiles({
    manifest,
    mediaFiles: [
      {
        archivePath,
        byteSize: bytes.byteLength,
        bytes,
        contentType: "image/png",
        object,
      },
    ],
    workspaceRoot,
  });
}

type CapturedRequest = {
  body?: string;
  headers: Record<string, string>;
  method: string;
  url: string;
};

function sourceSyncFetch(
  requests: CapturedRequest[],
  options: {
    appData?: Record<
      string,
      { mediaBytes?: Uint8Array; records?: StoredRecord[]; schema?: typeof siteSourceSchema }
    >;
    controlPlaneRecords?: StoredRecord[];
    installs?: ReturnType<typeof installedSite>[];
    restoreResponses?: unknown[];
  } = {},
): typeof fetch {
  const restoreResponses = [...(options.restoreResponses ?? [])];

  return async (url, init) => {
    const requestUrl =
      typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const parsedUrl = new URL(requestUrl);
    const method = init?.method ?? "GET";

    requests.push({
      body: typeof init?.body === "string" ? init.body : undefined,
      headers: normalizeHeaders(init?.headers),
      method,
      url: requestUrl,
    });

    if (parsedUrl.pathname === "/api/formless/deploy") {
      return Response.json({
        packageApps: listInstallableAppPackages(bundledAppPackageResolver).map((appPackage) => ({
          packageAppKey: appPackage.packageAppKey,
          packageRevision: appPackage.packageRevision,
          sourceSchemaHash: appPackage.sourceSchemaHash,
        })),
        packageVersion: packageJson.version,
        runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
        storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
        version: packageJson.version,
      });
    }

    if (parsedUrl.pathname === "/api/formless/app-installs") {
      return Response.json({
        installs: options.installs ?? [installedSite("david", "David Peek")],
        packages: listInstallableAppPackages(bundledAppPackageResolver),
      });
    }

    if (parsedUrl.pathname === "/api/formless/control-plane/bootstrap") {
      return Response.json({
        cursor: 1,
        records: options.controlPlaneRecords ?? deployControlPlaneRecords(),
        schema: {},
      });
    }

    if (parsedUrl.pathname === "/api/formless/control-plane/snapshot") {
      return Response.json(
        controlPlaneSnapshot(options.controlPlaneRecords ?? deployControlPlaneRecords()),
      );
    }

    const snapshotMatch = parsedUrl.pathname.match(
      /^\/api\/app-installs\/site\/([^/]+)\/snapshot$/,
    );

    if (snapshotMatch) {
      const installId = snapshotMatch[1] ?? "";
      const data = options.appData?.[installId] ?? { records: [] };

      return Response.json({
        ...snapshot(data.records ?? [], `app:${installId}`),
        ...(data.schema === undefined ? {} : { schema: data.schema }),
      });
    }

    const mediaMatch = parsedUrl.pathname.match(
      /^\/api\/app-installs\/site\/([^/]+)\/media\/media\/images\/cover\.png$/,
    );

    if (mediaMatch) {
      const installId = mediaMatch[1] ?? "";
      const mediaBytes = options.appData?.[installId]?.mediaBytes;

      if (mediaBytes) {
        return new Response(Buffer.from(mediaBytes), {
          headers: { "content-type": "image/png" },
        });
      }
    }

    if (parsedUrl.pathname === "/api/formless/media/media/images/cover.png") {
      const mediaBytes = Object.values(options.appData ?? {}).find(
        (data) => data.mediaBytes !== undefined,
      )?.mediaBytes;

      if (mediaBytes) {
        return new Response(Buffer.from(mediaBytes), {
          headers: { "content-type": "image/png" },
        });
      }
    }

    if (parsedUrl.pathname === "/api/formless/archive/restore" && method === "POST") {
      const response = restoreResponses.shift();

      if (!response) {
        throw new Error(`Unexpected archive restore request: ${requestUrl}`);
      }

      return Response.json(response);
    }

    if (parsedUrl.pathname === "/api/formless/deployments/desired-state") {
      const desiredState = deploymentDesiredStateRef();

      return Response.json({
        desiredState: {
          ...desiredState,
          createdAt: "2026-06-02T00:04:02.000Z",
          display: {
            resourceCount: 0,
            resourcesByKind: {},
            title: "Primary instance target",
          },
          resourceGraph: { resources: [], targetId: desiredState.targetId },
          schemaVersion: 1,
          source: { fingerprint: "source-1", intentRevision: 1 },
        },
        target: { kind: "instance", targetId: desiredState.targetId },
      });
    }

    if (parsedUrl.pathname === "/api/formless/deployments/status") {
      const desiredState = deploymentDesiredStateRef();

      return Response.json({
        status: {
          checkedAt: "2026-06-02T00:04:02.000Z",
          latestDesiredState: desiredState,
          state: "pending-changes",
          targetId: desiredState.targetId,
        },
        target: { kind: "instance", targetId: desiredState.targetId },
      });
    }

    return Response.json({ error: "not found" }, { status: 404 });
  };
}

function deployFetch(
  requests: CapturedRequest[],
  options: {
    appData?: Record<
      string,
      { mediaBytes?: Uint8Array; records?: StoredRecord[]; schema?: typeof siteSourceSchema }
    >;
    controlPlaneRecords?: StoredRecord[];
    installs?: ReturnType<typeof installedSite>[];
    restoreResponse?: (input: { dryRun: boolean; request: CapturedRequest }) => unknown;
  } = {},
): typeof fetch {
  return async (url, init) => {
    const requestUrl =
      typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const parsedUrl = new URL(requestUrl);
    const method = init?.method ?? "GET";

    requests.push({
      body: typeof init?.body === "string" ? init.body : undefined,
      headers: normalizeHeaders(init?.headers),
      method,
      url: requestUrl,
    });

    if (parsedUrl.pathname === "/api/formless/deploy") {
      return Response.json({
        packageApps: listInstallableAppPackages(bundledAppPackageResolver).map((appPackage) => ({
          packageAppKey: appPackage.packageAppKey,
          packageRevision: appPackage.packageRevision,
          sourceSchemaHash: appPackage.sourceSchemaHash,
        })),
        packageVersion: packageJson.version,
        runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
        storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
        version: packageJson.version,
      });
    }

    if (parsedUrl.pathname === "/api/formless/app-installs") {
      return Response.json({
        installs: options.installs ?? [installedSite("david", "David Peek")],
        packages: listInstallableAppPackages(bundledAppPackageResolver),
      });
    }

    if (parsedUrl.pathname === "/api/formless/control-plane/bootstrap") {
      return Response.json({
        cursor: 1,
        records: options.controlPlaneRecords ?? deployControlPlaneRecords(),
        schema: {},
      });
    }

    if (parsedUrl.pathname === "/api/formless/control-plane/snapshot") {
      return Response.json(
        controlPlaneSnapshot(options.controlPlaneRecords ?? deployControlPlaneRecords()),
      );
    }

    const snapshotMatch = parsedUrl.pathname.match(
      /^\/api\/app-installs\/site\/([^/]+)\/snapshot$/,
    );

    if (snapshotMatch) {
      const installId = snapshotMatch[1] ?? "";
      const data = options.appData?.[installId] ?? { records: [] };

      return Response.json({
        ...snapshot(data.records ?? [], `app:${installId}`),
        ...(data.schema === undefined ? {} : { schema: data.schema }),
      });
    }

    if (parsedUrl.pathname === "/api/formless/domain-mappings") {
      return Response.json(
        { error: "legacy domain mapping API should not be called" },
        { status: 500 },
      );
    }

    if (parsedUrl.pathname === "/api/formless/archive/restore") {
      const body = parseCapturedBody<{ archive?: { restorePolicy?: { dryRun?: boolean } } }>(init);
      const dryRun = body.archive?.restorePolicy?.dryRun !== false;
      const response = options.restoreResponse?.({ dryRun, request: requests.at(-1)! });

      return Response.json(
        response ??
          (dryRun
            ? { ok: true, plan: { summary: restoreSummary() } }
            : { ok: true, report: { applied: true, summary: restoreSummary() } }),
      );
    }

    if (parsedUrl.pathname === "/api/formless/deployments/desired-state") {
      const desiredState = deploymentDesiredStateRef();

      return Response.json({
        desiredState: {
          ...desiredState,
          createdAt: "2026-06-02T00:04:02.000Z",
          display: {
            resourceCount: 2,
            resourcesByKind: {
              "cloudflare-worker-custom-domain": 2,
            },
            title: "Primary instance target",
          },
          resourceGraph: { resources: [], targetId: desiredState.targetId },
          schemaVersion: 1,
          source: { fingerprint: "source-1", intentRevision: 1 },
        },
        target: { kind: "instance", targetId: desiredState.targetId },
      });
    }

    if (parsedUrl.pathname === "/api/formless/deployments/status") {
      const desiredState = deploymentDesiredStateRef();

      return Response.json({
        status: {
          checkedAt: "2026-06-02T00:04:02.000Z",
          latestDesiredState: desiredState,
          state: "pending-changes",
          targetId: desiredState.targetId,
        },
        target: { kind: "instance", targetId: desiredState.targetId },
      });
    }

    if (parsedUrl.pathname === "/api/formless/control-plane/operations/deployment-config/update") {
      const body = parseCapturedBody<{
        idempotencyKey: string;
        input: Record<string, unknown>;
        recordId: string;
      }>(init);
      const record = {
        createdAt: "2026-05-26T00:00:00.000Z",
        entity: "deployment-config",
        id: body.recordId,
        values: {
          accountId: "account-123",
          createdAt: "2026-05-26T00:00:00.000Z",
          enabled: true,
          label: "Primary instance",
          providerFamily: "cloudflare",
          targetId: "instance.primary",
          targetKind: "instance",
          targetUrl: "https://personal.dpeek.workers.dev",
          updatedAt: "2026-05-26T00:00:00.000Z",
          workerName: "personal",
          ...body.input,
        },
      };

      return Response.json({
        invocation: {},
        output: {
          affectedChangeIds: [],
          changes: [],
          cursor: 2,
          record,
          type: "update",
        },
        status: "committed",
      });
    }

    return Response.json({ error: "not found" }, { status: 404 });
  };
}

function installedSite(installId: string, label: string) {
  const facts = packageAppFactsForKey("site", bundledAppPackageResolver);

  if (!facts) {
    throw new Error("Missing bundled package facts for site.");
  }

  return {
    adminRoute: `/apps/${installId}` as `/apps/${string}`,
    createdAt: "2026-05-01T00:00:00.000Z",
    installId,
    label,
    packageAppKey: "site" as const,
    packageRevision: facts.packageRevision,
    publicRoute: `/sites/${installId}` as `/sites/${string}`,
    publicRoutePrefix: `/sites/${installId}/` as `/sites/${string}/`,
    registrationPolicy: "closed" as const,
    sourceSchemaHash: facts.sourceSchemaHash,
    status: "installed" as const,
    updatedAt: "2026-05-01T00:00:00.000Z",
  };
}

function snapshot(
  records: StoredRecord[],
  storageIdentity: `app:${string}` = "app:david",
): StorageSnapshot {
  return {
    exportedAt: "2026-05-12T02:00:00.000Z",
    kind: STORAGE_SNAPSHOT_KIND,
    records,
    schema: siteSourceSchema,
    schemaKey: "site",
    schemaUpdatedAt: "2026-05-01T00:00:00.000Z",
    sourceCursor: 1,
    storageIdentity,
    version: STORAGE_SNAPSHOT_VERSION,
  };
}

function controlPlaneSnapshot(records: StoredRecord[]): StorageSnapshot {
  return {
    exportedAt: "2026-05-12T02:00:00.000Z",
    kind: STORAGE_SNAPSHOT_KIND,
    records,
    schema: instanceControlPlaneSchema,
    schemaKey: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
    schemaUpdatedAt: "2026-05-01T00:00:00.000Z",
    sourceCursor: records.length,
    storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
    version: STORAGE_SNAPSHOT_VERSION,
  };
}

function controlPlaneRecords(): StoredRecord[] {
  const installId = "david";
  const now = "2026-05-26T00:00:00.000Z";

  return [
    {
      createdAt: now,
      updatedAt: now,
      entity: "app-install",
      id: installId,
      values: {
        createdAt: now,
        installId,
        label: "David Peek",
        packageAppKey: "site",
        registrationPolicy: "closed",
        status: "installed",
        storageIdentity: `app:${installId}`,
        updatedAt: now,
      },
    },
    {
      createdAt: now,
      updatedAt: now,
      entity: "route",
      id: `route:${installId}:admin`,
      values: {
        appInstall: installId,
        createdAt: now,
        enabled: true,
        kind: "mount",
        matchPath: `/apps/${installId}`,
        surface: "admin",
        targetProfile: "app",
        updatedAt: now,
      },
    },
  ];
}

function deployControlPlaneRecords(
  options: {
    credentialRef?: string;
    targetUrl?: string;
    workerName?: string | null;
  } = {},
): StoredRecord[] {
  const now = "2026-05-26T00:00:00.000Z";
  const workerName = options.workerName === undefined ? "personal" : options.workerName;

  return [
    ...controlPlaneRecords(),
    {
      createdAt: now,
      updatedAt: now,
      entity: "route",
      id: "route:site:public-site",
      values: {
        appInstall: "david",
        createdAt: now,
        enabled: true,
        kind: "mount",
        matchPath: "/sites/david",
        matchPrefix: "/sites/david/",
        surface: "public-site",
        targetProfile: "public-site",
        updatedAt: now,
      },
    },
    {
      createdAt: now,
      updatedAt: now,
      entity: "route",
      id: "route:host:public-site:www.example.com",
      values: {
        appInstall: "david",
        createdAt: now,
        enabled: true,
        kind: "mount",
        matchHost: "www.example.com",
        matchPath: "/",
        matchPrefix: "/",
        deploymentConfig: "instance.primary",
        surface: "public-site",
        targetProfile: "public-site",
        updatedAt: now,
      },
    },
    {
      createdAt: now,
      updatedAt: now,
      entity: "deployment-config",
      id: "instance.primary",
      values: {
        accountId: "account-123",
        createdAt: now,
        enabled: true,
        label: "Primary instance",
        providerFamily: "cloudflare",
        targetId: "instance.primary",
        targetKind: "instance",
        targetUrl: options.targetUrl ?? "https://personal.dpeek.workers.dev",
        updatedAt: now,
        ...(options.credentialRef === undefined ? {} : { credentialRef: options.credentialRef }),
        ...(workerName === null ? {} : { workerName }),
      },
    },
  ];
}

function deployControlPlaneRecordsWithProviderObservation(
  options: Parameters<typeof deployControlPlaneRecords>[0] = {},
): StoredRecord[] {
  const now = "2026-05-26T00:00:00.000Z";

  return [
    ...deployControlPlaneRecords(options).map((record) =>
      record.entity === "deployment-config"
        ? {
            ...record,
            values: {
              ...record.values,
              observedAt: "2026-05-26T00:01:00.000Z",
              observedStatus: "applied",
              observedSummary: "raw-provider-evidence",
            },
          }
        : record,
    ),
    {
      createdAt: now,
      updatedAt: now,
      entity: "deploy-evidence-summary",
      id: "provider-evidence",
      values: {
        providerState: "raw-provider-evidence",
      },
    },
  ];
}

function invalidRemoteControlPlaneRecords(
  options: Parameters<typeof deployControlPlaneRecords>[0] = {},
): StoredRecord[] {
  const now = "2026-05-26T00:00:00.000Z";

  return [
    ...deployControlPlaneRecords(options),
    {
      createdAt: now,
      entity: "legacy-control-plane-record",
      id: "remote-invalid-control-plane-record",
      updatedAt: now,
      values: {},
    },
  ];
}

function deploymentDesiredStateRef() {
  return {
    hash: `sha256:${"b".repeat(64)}`,
    revision: 3,
    targetId: "instance.primary",
    versionId: "desired.instance.primary.3",
  };
}

function restoreSummary() {
  return {
    appCount: 1,
    createdInstalls: [],
    mediaCountsByApp: { david: 0 },
    recordCountsByApp: { david: { total: 0 } },
    replacedInstalls: ["david"],
  };
}

function restorePlan(
  summary: Partial<{
    createdInstalls: string[];
    replacedInstalls: string[];
  }> = {},
) {
  return {
    ok: true,
    plan: {
      summary: {
        ...restoreSummary(),
        createdInstalls: summary.createdInstalls ?? [],
        replacedInstalls: summary.replacedInstalls ?? [],
      },
    },
  };
}

function mediaRecords(): StoredRecord[] {
  return [
    block("block-home", "2026-05-05T00:00:01.000Z", {
      type: "page",
      label: "Home",
      href: "/",
    }),
    block("block-cover", "2026-05-05T00:00:02.000Z", {
      type: "image",
      label: "Cover",
      mediaAssetId: "cover.png",
    }),
  ];
}

function block(id: string, createdAt: string, values: StoredRecord["values"]): StoredRecord {
  return {
    createdAt,
    updatedAt: createdAt,
    entity: "block",
    id,
    values,
  };
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  return Object.fromEntries(new Headers(headers).entries());
}

function requestByPath(requests: readonly CapturedRequest[], pathname: string): CapturedRequest {
  const request = requests.find((candidate) => new URL(candidate.url).pathname === pathname);

  if (!request) {
    throw new Error(`Expected request to ${pathname}.`);
  }

  return request;
}

function capturedRequestJson<T>(request: CapturedRequest): T {
  return JSON.parse(request.body ?? "{}") as T;
}

function parseCapturedBody<T>(init: RequestInit | undefined): T {
  return JSON.parse(typeof init?.body === "string" ? init.body : "{}") as T;
}

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "formless-workspace-domain-test-"));

  tempDirs.push(tempDir);
  return tempDir;
}
