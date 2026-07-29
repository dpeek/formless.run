import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  INSTANCE_WORKSPACE_MANIFEST_FILE as FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE,
  defaultInstanceWorkspaceManifest as defaultFormlessInstanceWorkspaceManifest,
  formatInstanceWorkspaceManifest as formatFormlessInstanceWorkspaceManifest,
  parseInstanceWorkspaceManifestJson as parseFormlessInstanceWorkspaceManifestJson,
  type InstanceWorkspaceManifest,
} from "@dpeek/formless-workspace";
import { SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY } from "../shared/workspace-runtime-extensions.ts";

import packageJson from "../../package.json";
import {
  FORMLESS_RUNTIME_PROTOCOL_VERSION,
  FORMLESS_STORAGE_MIGRATION_SET_ID,
} from "../shared/deploy-metadata.ts";
import { listInstallableAppPackages, packageAppFactsForKey } from "@dpeek/formless-installed-apps";
import { bundledAppPackageResolver } from "../shared/app-packages.ts";
import { testSiteRecords } from "../test/site-records.ts";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import {
  INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  instanceControlPlaneSchema,
} from "@dpeek/formless-instance-control-plane";
import {
  createWorkspaceOperationState,
  listWorkspaceOperationStates,
  readWorkspaceOperationState,
  updateWorkspaceOperationState,
  writeInstanceWorkspaceAppStorageSnapshot,
  workspaceOperationStatePath,
  writeInstanceWorkspaceControlPlaneStorageSnapshot,
} from "@dpeek/formless-workspace/node";
import { siteSourceSchema } from "../test/schema-apps.ts";
import {
  ALCHEMY_PASSWORD_ENV_NAME,
  FORMLESS_INSTANCE_LOCAL_ENV_FILE,
  FORMLESS_INSTANCE_STATE_FILE,
  type DeployFormlessInstanceInput,
  type DeployFormlessInstanceResult,
  type FormlessInstanceAccountDiscoveryAdapter,
} from "./instance-onboarding.ts";
import {
  FORMLESS_CLOUDFLARE_OAUTH_DEPLOY_SCOPES,
  createFormlessCloudflareOAuthCredential,
  formatFormlessCloudflareOAuthCredentialRef,
  writeFormlessCloudflareOAuthCredential,
  type FormlessCloudflareOAuthTokenSet,
} from "./cloudflare-oauth.ts";
import {
  runFormlessWorkspaceOperation,
  type RunFormlessWorkspaceOperationDependencies,
} from "./instance-workspace-operations.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

describe("Formless workspace operations", () => {
  it("persists status progress for a CLI-bootstrapped layout workspace without source writes", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");

    await writeWorkspaceManifest(workspaceRoot);

    const state = await runFormlessWorkspaceOperation(
      {
        kind: "status",
        workspacePath: workspaceRoot,
      },
      operationDeps(tempDir, {
        operationIds: ["op_status_00000001"],
        timestamps: [
          "2026-06-02T00:00:00.000Z",
          "2026-06-02T00:00:01.000Z",
          "2026-06-02T00:00:02.000Z",
        ],
      }),
      { actor: "browser" },
    );

    expect(state).toMatchObject({
      actor: "browser",
      completedAt: "2026-06-02T00:00:02.000Z",
      createdAt: "2026-06-02T00:00:00.000Z",
      id: "op_status_00000001",
      input: { includeDeploymentStatus: false },
      logs: [
        {
          at: "2026-06-02T00:00:01.000Z",
          id: "op_status_00000001-log-1",
          level: "info",
          message: "status started.",
        },
        {
          at: "2026-06-02T00:00:02.000Z",
          id: "op_status_00000001-log-2",
          level: "info",
          message: "status completed.",
        },
      ],
      operation: "status",
      result: {
        details: {
          runtimeExtensions: [],
          selectedTarget: null,
          targetUrl: null,
        },
      },
      startedAt: "2026-06-02T00:00:01.000Z",
      status: "succeeded",
      summary: {
        fields: {
          automationToken: "[redacted]",
          initialized: true,
          remoteStatus: "skipped",
        },
        title: "Workspace status",
      },
      updatedAt: "2026-06-02T00:00:02.000Z",
      workspace: { label: "personal-sites" },
    });
    expect(state.input).not.toHaveProperty("workspacePath");
    await expect(
      stat(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE)),
    ).resolves.toMatchObject({});
    await expect(readFile(path.join(workspaceRoot, ".gitignore"), "utf8")).resolves.toBe(
      ".formless/\n",
    );
    await expect(stat(path.join(workspaceRoot, "archives"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(path.join(workspaceRoot, "records"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(path.join(workspaceRoot, "media"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    const persisted = await readWorkspaceOperationState({
      operationId: "op_status_00000001",
      workspaceRoot,
    });
    const persistedText = await readFile(
      workspaceOperationStatePath(workspaceRoot, "op_status_00000001"),
      "utf8",
    );

    expect(persisted.status).toBe("succeeded");
    expect(persisted).toMatchObject({
      input: { includeDeploymentStatus: false },
      logs: [
        { level: "info", message: "status started." },
        { level: "info", message: "status completed." },
      ],
      summary: {
        fields: {
          automationToken: "[redacted]",
          initialized: true,
          remoteStatus: "skipped",
        },
        title: "Workspace status",
      },
    });
    expect(persistedText).not.toContain(workspaceRoot);
    expect(persistedText).not.toContain(tempDir);
  });

  it("reports configured runtime extension keys in status without module paths", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");

    await writeWorkspaceManifest(workspaceRoot, {
      runtime: {
        extensions: {
          [SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY]: {
            browser: "renderers/site-public.browser.tsx",
            worker: "renderers/site-public.worker.tsx",
          },
        },
      },
    });

    const state = await runFormlessWorkspaceOperation(
      {
        kind: "status",
        workspacePath: workspaceRoot,
      },
      operationDeps(tempDir, {
        operationIds: ["op_status_00000002"],
        timestamps: [
          "2026-06-02T00:00:03.000Z",
          "2026-06-02T00:00:04.000Z",
          "2026-06-02T00:00:05.000Z",
        ],
      }),
      { actor: "browser" },
    );
    const persistedText = await readFile(
      workspaceOperationStatePath(workspaceRoot, "op_status_00000002"),
      "utf8",
    );

    expect(state.result?.details).toMatchObject({
      runtimeExtensions: [SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY],
    });
    expect(persistedText).toContain(SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY);
    expect(persistedText).not.toContain("public-renderer.browser.tsx");
    expect(persistedText).not.toContain("public-renderer.worker.tsx");
  });

  it("rejects unsupported standalone deploy operations before workspace access", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "missing-workspace");

    await expect(
      runFormlessWorkspaceOperation(
        {
          kind: "deployApply",
          workspacePath: workspaceRoot,
        } as never,
        operationDeps(tempDir),
        { actor: "browser" },
      ),
    ).rejects.toThrow('Workspace operation "deployApply" is not defined.');
    await expect(stat(workspaceRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects actor and capability failures before workspace root resolution", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "missing-workspace");

    await expect(
      runFormlessWorkspaceOperation(
        {
          kind: "status",
          workspacePath: workspaceRoot,
        },
        operationDeps(tempDir),
        { actor: "anonymous" as never },
      ),
    ).rejects.toThrow('Workspace operation "status" is not allowed for actor "anonymous".');
    await expect(stat(workspaceRoot)).rejects.toMatchObject({ code: "ENOENT" });

    await expect(
      runFormlessWorkspaceOperation(
        {
          kind: "status",
          workspacePath: workspaceRoot,
        },
        operationDeps(tempDir),
        { actor: "browser", capabilities: [] },
      ),
    ).rejects.toThrow(
      'Workspace operation "status" requires execution capability "workspace-read".',
    );
    await expect(stat(workspaceRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("records stale save check failure without rewriting reviewable source", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");

    await writeWorkspaceManifest(workspaceRoot);
    const manifestBefore = await readFile(
      path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE),
      "utf8",
    );

    const state = await runFormlessWorkspaceOperation(
      {
        check: true,
        kind: "save",
        workspacePath: workspaceRoot,
      },
      operationDeps(tempDir, {
        fetch: authorityExportFetch([installedSite("david", "David Peek")], {
          david: { records: [] },
        }),
        operationIds: ["op_save_00000001"],
        timestamps: [
          "2026-06-02T00:01:00.000Z",
          "2026-06-02T00:01:01.000Z",
          "2026-06-02T00:01:02.000Z",
        ],
      }),
    );

    expect(state.status).toBe("failed");
    expect(state.summary.fields.error).toBe(
      'Formless workspace source is stale: state/apps/david.json, state/instance.json. Run "npx formless save".',
    );
    const persisted = await readWorkspaceOperationState({
      operationId: "op_save_00000001",
      workspaceRoot,
    });

    expect(persisted).toMatchObject({
      errors: [
        {
          message:
            'Formless workspace source is stale: state/apps/david.json, state/instance.json. Run "npx formless save".',
        },
      ],
      logs: [
        { level: "info", message: "save started." },
        {
          level: "error",
          message:
            'Formless workspace source is stale: state/apps/david.json, state/instance.json. Run "npx formless save".',
        },
      ],
      status: "failed",
      summary: {
        fields: {
          error:
            'Formless workspace source is stale: state/apps/david.json, state/instance.json. Run "npx formless save".',
        },
        title: "Operation failed",
      },
    });
    await expect(
      readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
    ).resolves.toBe(manifestBefore);
    await expect(stat(path.join(workspaceRoot, "state/instance.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("refreshes deployment observation through an explicit write operation", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];

    await writeWorkspaceManifest(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=secret\n",
    );

    const state = await runFormlessWorkspaceOperation(
      {
        kind: "deploymentRefresh",
        workspacePath: workspaceRoot,
      },
      operationDeps(tempDir, {
        fetch: deployApplyFetch(requests),
        operationIds: ["op_deployment_refresh_00000001"],
        timestamps: ["2026-06-02T00:05:00.000Z", "2026-06-02T00:05:01.000Z"],
      }),
      { actor: "browser" },
    );
    const desiredState = deploymentDesiredStateRef();
    const observation = capturedRequestJson<{
      idempotencyKey: string;
      input: {
        observedAt: string;
        observedDesiredStateHash: string;
        observedError: string;
        observedRunnerId: string;
        observedStatus: string;
        observedSummary: string;
      };
      recordId: string;
    }>(requestByPath(requests, "/api/formless/control-plane/operations/deployment-config/update"));

    expect(state).toMatchObject({
      actor: "browser",
      operation: "deploymentRefresh",
      result: {
        deployment: {
          observation: {
            desiredState,
            observedStatus: "unknown",
            targetId: "instance.primary",
          },
          status: {
            state: "pending-changes",
          },
        },
        summary: {
          fields: {
            observedStatus: "unknown",
            status: "pending-changes",
            target: "instance.primary",
          },
          title: "Deployment observation refreshed",
        },
      },
      status: "succeeded",
    });
    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      [
        "GET /api/formless/deployments/desired-state",
        "GET /api/formless/deployments/status",
        "POST /api/formless/control-plane/operations/deployment-config/update",
      ],
    );
    expect(observation).toEqual({
      idempotencyKey: expect.any(String),
      recordId: "instance.primary",
      input: {
        observedAt: expect.any(String),
        observedDesiredStateHash: desiredState.hash,
        observedError: "",
        observedRunnerId: "local-gateway",
        observedStatus: "unknown",
        observedSummary: expect.any(String),
      },
    });
  });

  it("runs non-push status without push-only or provider mutation dependencies", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");

    await writeWorkspaceManifest(workspaceRoot);

    const state = await runFormlessWorkspaceOperation(
      {
        kind: "status",
        workspacePath: workspaceRoot,
      },
      operationDepsWithAccessGuards(
        operationDeps(tempDir, {
          operationIds: ["op_status_minimal_00000001"],
          timestamps: [
            "2026-06-02T00:05:30.000Z",
            "2026-06-02T00:05:31.000Z",
            "2026-06-02T00:05:32.000Z",
          ],
        }),
        [
          "accountDiscovery",
          "credentialSetup",
          "deploymentAdapter",
          "healthCheck",
          "localSecretEnv",
          "packageRoot",
          "packageVersion",
          "randomToken",
          "setupCapability",
        ],
      ),
      { actor: "browser", capabilities: ["workspace-read"] },
    );

    expect(state).toMatchObject({
      operation: "status",
      status: "succeeded",
      summary: {
        fields: {
          initialized: true,
          remoteStatus: "skipped",
        },
        title: "Workspace status",
      },
    });
  });

  it("continues running credential setup through runner-owned operation state", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    let continuationCalls = 0;
    const operationId = "op_credential_continue_00000001";

    await writeWorkspaceManifest(workspaceRoot);

    const state = await runFormlessWorkspaceOperation(
      {
        kind: "credentialSetup",
        provider: "cloudflare",
        workspacePath: workspaceRoot,
      },
      operationDeps(tempDir, {
        credentialSetup: async (input) => ({
          continue: async () => {
            continuationCalls += 1;

            return {
              result: {
                summary: {
                  fields: {
                    provider: input.provider,
                    status: "validated",
                  },
                  title: "Cloudflare credentials ready",
                },
              },
              status: "succeeded",
            };
          },
          events: [
            {
              at: "2026-06-02T00:06:12.000Z",
              profileLabel: "Default",
              provider: "cloudflare",
              status: "waiting",
              type: "externalAuthorizationUrl",
              url: "https://dash.cloudflare.com/oauth2/authorize?client_id=formless",
            },
          ],
          result: {
            summary: {
              fields: {
                provider: input.provider,
                status: "waiting-for-authorization",
              },
              title: "Cloudflare authorization required",
            },
          },
          status: "running",
        }),
        operationIds: [operationId],
        timestamps: [
          "2026-06-02T00:06:10.000Z",
          "2026-06-02T00:06:11.000Z",
          "2026-06-02T00:06:12.000Z",
          "2026-06-02T00:06:13.000Z",
        ],
      }),
      { actor: "browser" },
    );

    expect(state).toMatchObject({
      events: [
        {
          provider: "cloudflare",
          status: "waiting",
          type: "externalAuthorizationUrl",
          url: "https://dash.cloudflare.com/oauth2/authorize?client_id=formless",
        },
      ],
      id: operationId,
      input: { provider: "cloudflare" },
      operation: "credentialSetup",
      status: "running",
      summary: {
        fields: {
          provider: "cloudflare",
          status: "waiting-for-authorization",
        },
        title: "Cloudflare authorization required",
      },
    });
    expect(state.input).not.toHaveProperty("workspacePath");

    await waitUntil(async () => {
      const persisted = await readWorkspaceOperationState({ operationId, workspaceRoot });

      return persisted.status === "succeeded";
    });

    const persisted = await readWorkspaceOperationState({ operationId, workspaceRoot });

    expect(continuationCalls).toBe(1);
    expect(persisted).toMatchObject({
      logs: [
        { message: "credentialSetup started." },
        { message: "credentialSetup awaiting authorization." },
        { message: "credentialSetup completed." },
      ],
      operation: "credentialSetup",
      status: "succeeded",
      summary: {
        fields: {
          provider: "cloudflare",
          status: "validated",
        },
        title: "Cloudflare credentials ready",
      },
    });
    expect(JSON.stringify(persisted)).not.toContain(workspaceRoot);
  });

  it("runs push dry-run without provider mutation dependencies", async () => {
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

    const state = await runFormlessWorkspaceOperation(
      {
        dryRun: true,
        kind: "push",
        workspacePath: workspaceRoot,
      },
      operationDeps(tempDir, {
        accountDiscovery: {
          listAccounts: async () => [{ id: "account-123", workersDevSubdomain: "dpeek" }],
        },
        fetch: deployApplyFetch(requests),
        operationIds: ["op_push_dry_run_00000001"],
        packageVersion: packageJson.version,
        timestamps: [
          "2026-06-02T00:06:00.000Z",
          "2026-06-02T00:06:01.000Z",
          "2026-06-02T00:06:02.000Z",
        ],
      }),
    );

    expect(state).toMatchObject({
      operation: "push",
      result: {
        summary: {
          fields: {
            mode: "dry-run",
            noop: true,
            sync: "up-to-date",
          },
          title: "Workspace push planned",
        },
      },
      status: "succeeded",
      summary: {
        fields: {
          mode: "dry-run",
          noop: true,
          sync: "up-to-date",
        },
        title: "Workspace push planned",
      },
    });
    const requestPaths = requests.map((request) => new URL(request.url).pathname);

    expect(requests.every((request) => request.method === "GET")).toBe(true);
    expect(requestPaths).toContain("/api/formless/control-plane/snapshot");
    expect(requestPaths).toContain("/api/app-installs/site/david/snapshot");
    expect(requestPaths).not.toContain("/api/formless/archive/restore");
    expect(requestPaths).not.toContain("/api/formless/deployments/desired-state");
  });

  it("keeps OAuth credential material out of push operation state and deployment artifacts", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const credentialRef = formatFormlessCloudflareOAuthCredentialRef("deploy");
    const requests: CapturedRequest[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const healthInputs: unknown[] = [];
    const operationId = "op_push_oauth_display_safe_00000001";

    await writeWorkspaceManifest(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot, { credentialRef });
    await writeWorkspaceAppStorageSnapshot(workspaceRoot, "david", testSiteRecords.slice(0, 1));
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-admin-token\n",
    );
    await writeFormlessCloudflareOAuthCredential({
      credential: createFormlessCloudflareOAuthCredential({
        id: "deploy",
        selectedAccount: {
          id: "account-123",
          name: "Personal",
          workersDevSubdomain: "dpeek",
        },
        token: providerOAuthToken(),
        updatedAt: "2026-06-02T00:00:00.000Z",
      }),
      workspaceRoot,
    });

    const state = await runFormlessWorkspaceOperation(
      {
        force: true,
        kind: "push",
        workspacePath: workspaceRoot,
      },
      operationDeps(tempDir, {
        accountDiscovery: unusedAccountDiscovery,
        deploymentAdapter: {
          deploy: async (input) => {
            deployInputs.push(input);

            return {
              rawCredentialRecord: {
                accessToken: "oauth-access-token",
                refreshToken: "oauth-refresh-token",
              },
              resourceEvidence: [
                {
                  action: "updated",
                  kind: "cloudflare-worker-custom-domain",
                  logicalId: "custom-domain:www.example.com",
                  providerFamily: "cloudflare",
                  providerResourceIds: ["provider-resource-secret-token"],
                  targetId: "instance.primary",
                },
              ],
              url: "https://personal.dpeek.workers.dev",
            } as DeployFormlessInstanceResult;
          },
        },
        env: {
          ALCHEMY_STATE_TOKEN: "alchemy-state-token",
          CF_API_TOKEN: "cf-manual-provider-token",
          CLOUDFLARE_API_TOKEN: "manual-provider-token",
        },
        fetch: deployApplyFetch(requests),
        healthCheck: {
          check: async (input) => {
            healthInputs.push(input);
            return deployMetadata(input.url);
          },
        },
        localSecretEnv: localSecretEnvStore("alchemy-secret"),
        operationIds: [operationId],
        packageRoot: tempDir,
        packageVersion: packageJson.version,
        randomTokens: ["unused-random-token"],
        setupInputs: [],
        timestamps: [
          "2026-06-02T00:07:00.000Z",
          "2026-06-02T00:07:01.000Z",
          "2026-06-02T00:07:02.000Z",
          "2026-06-02T00:07:03.000Z",
          "2026-06-02T00:07:04.000Z",
          "2026-06-02T00:07:05.000Z",
          "2026-06-02T00:07:06.000Z",
        ],
      }),
      { actor: "browser" },
    );

    expect(deployInputs[0]).toMatchObject({
      providerBearer: {
        credentialRef,
        source: "formless-cloudflare-oauth",
        token: "oauth-access-token",
      },
      secrets: {
        ALCHEMY_PASSWORD: "alchemy-secret",
        CLOUDFLARE_API_TOKEN: "oauth-access-token",
        FORMLESS_ADMIN_TOKEN: "local-admin-token",
      },
    });
    expect(healthInputs[0]).toMatchObject({
      providerBearer: {
        credentialRef,
        source: "formless-cloudflare-oauth",
        token: "oauth-access-token",
      },
    });
    expect(state.result?.deployment).toMatchObject({
      accountId: "account-123",
      accountName: "Personal",
      credentialRef,
      deploymentUrl: "https://personal.dpeek.workers.dev",
      providerFamily: "cloudflare",
      target: "instance.primary",
      targetUrl: "https://personal.dpeek.workers.dev",
      workerName: "personal",
      workersDevSubdomain: "dpeek",
    });

    const persistedText = await readFile(
      workspaceOperationStatePath(workspaceRoot, operationId),
      "utf8",
    );
    const manifestText = await readFile(
      path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE),
      "utf8",
    );
    const deploymentStateText = await readFile(
      path.join(workspaceRoot, ".formless/deploy/personal", FORMLESS_INSTANCE_STATE_FILE),
      "utf8",
    );
    const deploySecretText = await readFile(
      path.join(workspaceRoot, ".formless/deploy/personal", FORMLESS_INSTANCE_LOCAL_ENV_FILE),
      "utf8",
    );
    const archiveRestoreBodies = requests
      .filter((request) => new URL(request.url).pathname === "/api/formless/archive/restore")
      .map((request) => request.body ?? "")
      .join("\n");
    const backupArchiveText = await readTextFilesUnder(
      path.join(workspaceRoot, ".formless/backups"),
    );
    const browserVisibleState = JSON.stringify(state);

    expect(archiveRestoreBodies).not.toBe("");
    expect(deploySecretText).not.toContain("oauth-access-token");
    expect(deploySecretText).not.toContain("oauth-refresh-token");
    expect(deploySecretText).not.toContain("manual-provider-token");
    expect(deploySecretText).not.toContain("cf-manual-provider-token");
    assertTextExcludesSecrets(
      {
        archiveRestoreBodies,
        backupArchiveText,
        browserVisibleState,
        deploymentStateText,
        manifestText,
        persistedText,
      },
      [
        "oauth-access-token",
        "oauth-refresh-token",
        "manual-provider-token",
        "cf-manual-provider-token",
        "provider-resource-secret-token",
        "local-admin-token",
        "alchemy-secret",
        "alchemy-state-token",
        '"accessToken"',
        '"refreshToken"',
        "rawCredentialRecord",
      ],
    );
  });

  it("keeps manual provider API tokens out of push operation state and terminal output", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const operationId = "op_push_manual_token_display_safe_00000001";

    await writeWorkspaceManifest(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot, { credentialRef: "alchemy-profile:team" });
    await writeWorkspaceAppStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-admin-token\n",
    );

    const state = await runFormlessWorkspaceOperation(
      {
        force: true,
        kind: "push",
        workspacePath: workspaceRoot,
      },
      operationDeps(tempDir, {
        accountDiscovery: {
          listAccounts: async () => [
            {
              id: "account-123",
              name: "Team",
              workersDevSubdomain: "dpeek",
            },
          ],
        },
        deploymentAdapter: {
          deploy: async (input) => {
            deployInputs.push(input);
            return {
              rawAdapterOutput: "CLOUDFLARE_API_TOKEN=manual-provider-token",
              url: "https://personal.dpeek.workers.dev",
            } as DeployFormlessInstanceResult;
          },
        },
        env: {
          CLOUDFLARE_API_TOKEN: "manual-provider-token",
        },
        fetch: deployApplyFetch(requests),
        healthCheck: {
          check: async (input) => deployMetadata(input.url),
        },
        localSecretEnv: localSecretEnvStore("alchemy-secret"),
        operationIds: [operationId],
        packageRoot: tempDir,
        packageVersion: packageJson.version,
        randomTokens: ["unused-random-token"],
        setupInputs: [],
        timestamps: [
          "2026-06-02T00:08:00.000Z",
          "2026-06-02T00:08:01.000Z",
          "2026-06-02T00:08:02.000Z",
          "2026-06-02T00:08:03.000Z",
          "2026-06-02T00:08:04.000Z",
        ],
      }),
      { actor: "browser" },
    );

    expect(deployInputs[0]).toMatchObject({
      credentialProfile: "team",
      providerBearer: {
        envName: "CLOUDFLARE_API_TOKEN",
        source: "manual-cloudflare-api-token",
        token: "manual-provider-token",
      },
      secrets: {
        ALCHEMY_PASSWORD: "alchemy-secret",
        CLOUDFLARE_API_TOKEN: "manual-provider-token",
        FORMLESS_ADMIN_TOKEN: "local-admin-token",
      },
    });
    expect(state.result?.deployment).toMatchObject({
      accountId: "account-123",
      accountName: "Team",
      profile: "team",
      profileRef: "alchemy-profile:team",
      providerFamily: "cloudflare",
      target: "instance.primary",
    });

    const persistedText = await readFile(
      workspaceOperationStatePath(workspaceRoot, operationId),
      "utf8",
    );

    assertTextExcludesSecrets(
      {
        persistedText,
        browserVisibleState: JSON.stringify(state),
      },
      ["manual-provider-token", "local-admin-token", "alchemy-secret", "rawAdapterOutput"],
    );
  });

  it("persists display-safe deployment observation and cleanup summaries with secret redaction", async () => {
    const workspaceRoot = await makeTempDir();
    const state = await createWorkspaceOperationState({
      id: "op_deploy_00000001",
      input: { targetAlias: "remote" },
      now: timestampSequence("2026-06-02T00:02:00.000Z"),
      operation: "push",
      workspaceRoot,
    });

    await updateWorkspaceOperationState(state.id, {
      logs: [
        {
          at: "2026-06-02T00:02:01.000Z",
          level: "info",
          message: `raw adapter output CF_API_TOKEN=secret-token lease:raw-token ${path.join(workspaceRoot, "outside.log")}`,
        },
      ],
      result: {
        deployment: {
          observation: {
            desiredState: {
              hash: `sha256:${"a".repeat(64)}`,
              revision: 4,
              targetId: "instance.primary",
              versionId: "desired.instance.primary.4",
            },
            observedSummary: "lease:raw-token",
            runnerId: "runner-local",
            observedStatus: "deployed",
          },
          cleanup: {
            customDomains: 1,
            dnsRecords: 1,
            workerSecretBindingCount: 3,
          },
          evidence: {
            count: 2,
            logicalIds: ["custom-domain:www.example.com", "dns-records:example.com"],
          },
          plan: {
            resourceCount: 2,
            resourcesByKind: {
              "cloudflare-dns-records": 1,
              "cloudflare-worker-custom-domain": 1,
            },
          },
          rawAdapterOutput: "CF_API_TOKEN=secret-token",
        },
        summary: {
          fields: {
            evidenceCount: 2,
            observedStatus: "deployed",
          },
          title: "Workspace push applied",
        },
      },
      status: "succeeded",
      summary: {
        fields: {
          cleanupCount: 2,
          evidenceCount: 2,
          observedStatus: "deployed",
        },
        title: "Workspace push applied",
      },
      workspaceRoot,
    });

    const persistedText = await readFile(
      workspaceOperationStatePath(workspaceRoot, state.id),
      "utf8",
    );
    const persisted = await readWorkspaceOperationState({
      operationId: state.id,
      workspaceRoot,
    });

    expect(persisted.result?.deployment).toMatchObject({
      observation: {
        observedStatus: "deployed",
        observedSummary: "[redacted]",
      },
      cleanup: {
        customDomains: 1,
        dnsRecords: 1,
        workerSecretBindingCount: 3,
      },
      evidence: {
        count: 2,
      },
      rawAdapterOutput: "[redacted]",
    });
    expect(persisted.logs[0]?.message).toContain("[redacted]");
    expect(persistedText).not.toContain("secret-token");
    expect(persistedText).not.toContain("lease:raw-token");
    expect(persistedText).not.toContain(workspaceRoot);
    expect(await listWorkspaceOperationStates(workspaceRoot)).toHaveLength(1);
  });
});

function operationDeps(
  cwd: string,
  options: {
    accountDiscovery?: FormlessInstanceAccountDiscoveryAdapter;
    credentialSetup?: RunFormlessWorkspaceOperationDependencies["credentialSetup"];
    deploymentAdapter?: {
      deploy: (input: DeployFormlessInstanceInput) => Promise<DeployFormlessInstanceResult>;
    };
    env?: NodeJS.ProcessEnv;
    fetch?: typeof fetch;
    healthCheck?: RunFormlessWorkspaceOperationDependencies["healthCheck"];
    localSecretEnv?: RunFormlessWorkspaceOperationDependencies["localSecretEnv"];
    packageRoot?: string;
    operationIds?: string[];
    packageVersion?: string;
    randomTokens?: string[];
    setupInputs?: Array<{
      adminToken: string;
      deploymentUrl: string;
      setupToken: string;
    }>;
    timestamps?: string[];
  } = {},
) {
  const operationIds = [...(options.operationIds ?? [])];
  const randomTokens = [...(options.randomTokens ?? [])];

  return {
    ...(options.accountDiscovery === undefined
      ? {}
      : { accountDiscovery: options.accountDiscovery }),
    createOperationId: () => operationIds.shift() ?? "op_test_00000000",
    ...(options.credentialSetup === undefined ? {} : { credentialSetup: options.credentialSetup }),
    cwd,
    ...(options.deploymentAdapter === undefined
      ? {}
      : { deploymentAdapter: options.deploymentAdapter }),
    ...(options.env === undefined ? {} : { env: options.env }),
    fetch: options.fetch ?? fetch,
    ...(options.healthCheck === undefined ? {} : { healthCheck: options.healthCheck }),
    ...(options.localSecretEnv === undefined ? {} : { localSecretEnv: options.localSecretEnv }),
    now: timestampSequence(...(options.timestamps ?? ["2026-06-02T00:00:00.000Z"])),
    ...(options.packageRoot === undefined ? {} : { packageRoot: options.packageRoot }),
    ...(options.packageVersion === undefined ? {} : { packageVersion: options.packageVersion }),
    ...(options.randomTokens === undefined
      ? {}
      : { randomToken: () => randomTokens.shift() ?? "generated-token" }),
    ...(options.setupInputs === undefined
      ? {}
      : {
          setupCapability: {
            create: async (input: {
              adminToken: string;
              deploymentUrl: string;
              setupToken: string;
            }) => {
              options.setupInputs?.push(input);

              return {
                capabilityCreated: true,
                endpointUrl: new URL(
                  "/api/formless/setup/capability",
                  `${input.deploymentUrl}/`,
                ).toString(),
                setupComplete: false,
              };
            },
          },
        }),
  } as RunFormlessWorkspaceOperationDependencies;
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

function timestampSequence(...timestamps: string[]): () => string {
  let index = 0;

  return () =>
    timestamps[index++ % timestamps.length] ?? timestamps.at(-1) ?? new Date(0).toISOString();
}

async function waitUntil(condition: () => Promise<boolean>, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await condition()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error("Timed out waiting for condition.");
}

function providerOAuthToken(): FormlessCloudflareOAuthTokenSet {
  return {
    accessToken: "oauth-access-token",
    expiresAt: "2026-06-02T01:00:00.000Z",
    grantedScopes: [...FORMLESS_CLOUDFLARE_OAUTH_DEPLOY_SCOPES],
    refreshToken: "oauth-refresh-token",
  };
}

const unusedAccountDiscovery = {
  listAccounts: async () => {
    throw new Error("Stored OAuth selected account should avoid account discovery.");
  },
} satisfies FormlessInstanceAccountDiscoveryAdapter;

function deployMetadata(url: string) {
  return {
    cacheControl: "no-store",
    metadataUrl: `${url}/api/formless/deploy`,
    packageVersion: packageJson.version,
    runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
    storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
    url,
    version: packageJson.version,
  };
}

function localSecretEnvStore(
  secret: string,
): RunFormlessWorkspaceOperationDependencies["localSecretEnv"] {
  return {
    ensure: async (input) => {
      const filePath = path.join(input.root, FORMLESS_INSTANCE_LOCAL_ENV_FILE);

      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, `${ALCHEMY_PASSWORD_ENV_NAME}=${secret}\n`);

      return {
        created: true,
        path: filePath,
        secrets: {
          ALCHEMY_PASSWORD: secret,
        },
      };
    },
  };
}

async function readTextFilesUnder(root: string): Promise<string> {
  let entries: Dirent<string>[];

  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error ? error.code : undefined;

    if (code === "ENOENT") {
      return "";
    }

    throw error;
  }

  const contents: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      contents.push(await readTextFilesUnder(entryPath));
    } else if (entry.isFile()) {
      contents.push(await readFile(entryPath, "utf8"));
    }
  }

  return contents.join("\n");
}

function assertTextExcludesSecrets(
  texts: Record<string, string>,
  secretNeedles: readonly string[],
): void {
  for (const [label, text] of Object.entries(texts)) {
    for (const secret of secretNeedles) {
      expect(text, `${label} should not include ${secret}`).not.toContain(secret);
    }
  }
}
async function writeWorkspaceManifest(
  workspaceRoot: string,
  options: {
    runtime?: InstanceWorkspaceManifest["runtime"];
  } = {},
) {
  await mkdir(workspaceRoot, { recursive: true });
  await writeFile(
    path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE),
    formatFormlessInstanceWorkspaceManifest({
      version: 1,
      kind: "formless-instance-workspace",
      name: "personal-sites",
      local: { stateRoot: ".formless/local", secretStateRoot: ".formless" },
      ...(options.runtime === undefined ? {} : { runtime: options.runtime }),
    }),
  );
}

async function writeDeployStorageSnapshot(
  workspaceRoot: string,
  options: {
    credentialRef?: string;
    includeDeployTarget?: boolean;
    targetUrl?: string;
    workerName?: string | null;
  } = {},
) {
  const manifest = defaultFormlessInstanceWorkspaceManifest({ name: "personal-sites" });

  await writeInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest,
    packageResolver: bundledAppPackageResolver,
    snapshot: controlPlaneSnapshot(deployControlPlaneRecords(options)),
    workspaceRoot,
  });
}

async function writeWorkspaceAppStorageSnapshot(
  workspaceRoot: string,
  installId: string = "david",
  records: StoredRecord[] = [],
) {
  const manifest = parseFormlessInstanceWorkspaceManifestJson(
    await readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
  );
  const facts = packageAppFactsForKey("site", bundledAppPackageResolver);

  if (!facts) {
    throw new Error("Missing bundled package facts for site.");
  }

  await writeInstanceWorkspaceAppStorageSnapshot({
    installId,
    manifest,
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
function authorityExportFetch(
  installs: ReturnType<typeof installedSite>[],
  dataByInstall: Record<
    string,
    {
      records: StoredRecord[];
    }
  >,
  options: {
    controlPlaneRecords?: StoredRecord[];
  } = {},
): typeof fetch {
  return async (url) => {
    const requestUrl =
      typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const parsedUrl = new URL(requestUrl);

    if (parsedUrl.pathname === "/api/formless/deploy") {
      return Response.json(
        {
          packageApps: listInstallableAppPackages(bundledAppPackageResolver).map((appPackage) => ({
            packageAppKey: appPackage.packageAppKey,
            packageRevision: appPackage.packageRevision,
            sourceSchemaHash: appPackage.sourceSchemaHash,
          })),
          packageVersion: packageJson.version,
          runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
          storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
          version: packageJson.version,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (parsedUrl.pathname === "/api/formless/app-installs") {
      return Response.json({
        installs,
        packages: listInstallableAppPackages(bundledAppPackageResolver),
      });
    }

    if (parsedUrl.pathname === "/api/formless/control-plane/bootstrap") {
      return Response.json({
        cursor: 1,
        records: options.controlPlaneRecords ?? controlPlaneRecords(),
        schema: {},
      });
    }

    if (parsedUrl.pathname === "/api/formless/control-plane/snapshot") {
      return Response.json(
        controlPlaneSnapshot(options.controlPlaneRecords ?? controlPlaneRecords()),
      );
    }

    if (parsedUrl.pathname === "/api/formless/domain-mappings") {
      return Response.json(
        { error: "legacy domain mapping API should not be called" },
        { status: 500 },
      );
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

    const snapshotMatch = parsedUrl.pathname.match(
      /^\/api\/app-installs\/([^/]+)\/([^/]+)\/snapshot$/,
    );

    if (snapshotMatch) {
      const installId = snapshotMatch[2] ?? "";

      return Response.json(snapshot(dataByInstall[installId]?.records ?? [], `app:${installId}`));
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

type CapturedRequest = {
  body?: string;
  headers: Record<string, string>;
  method: string;
  url: string;
};
function deployApplyFetch(
  requests: CapturedRequest[],
  options: {
    controlPlaneRecords?: StoredRecord[];
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
        installs: [installedSite("david", "David Peek")],
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

    if (parsedUrl.pathname === "/api/app-installs/site/david/snapshot") {
      return Response.json(snapshot([]));
    }

    if (parsedUrl.pathname === "/api/formless/domain-mappings") {
      return Response.json(
        { error: "legacy domain mapping API should not be called" },
        { status: 500 },
      );
    }
    if (parsedUrl.pathname === "/api/formless/archive/restore") {
      const body = parseCapturedBody<{
        archive?: {
          restorePolicy?: {
            dryRun?: boolean;
          };
        };
      }>(init);
      const dryRun = body.archive?.restorePolicy?.dryRun !== false;
      return Response.json(
        dryRun
          ? { ok: true, plan: { summary: restoreSummary() } }
          : { ok: true, report: { applied: true, summary: restoreSummary() } },
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
    includeDeployTarget?: boolean;
    targetUrl?: string;
    workerName?: string | null;
  } = {},
): StoredRecord[] {
  const now = "2026-05-26T00:00:00.000Z";
  const workerName = options.workerName === undefined ? "personal" : options.workerName;

  const records = [
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
      entity: "route",
      id: "route:redirect:old.example.com",
      values: {
        createdAt: now,
        enabled: true,
        kind: "redirect",
        matchHost: "old.example.com",
        matchPath: "/",
        matchPrefix: "/",
        preservePath: true,
        preserveQueryString: true,
        statusCode: "308",
        toHost: "www.example.com",
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

  if (options.includeDeployTarget !== false) {
    return records;
  }

  return records
    .filter((record) => record.entity !== "deployment-config")
    .map((record) => {
      if (record.id !== "route:host:public-site:www.example.com") {
        return record;
      }

      const values = { ...record.values };
      delete values.deploymentConfig;

      return {
        ...record,
        values,
      };
    });
}

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "formless-workspace-operations-test-"));

  tempDirs.push(tempDir);
  return tempDir;
}
