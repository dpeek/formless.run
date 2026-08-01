import { setKeyedDefinition } from "../test/schema-definition-test-helpers.ts";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";
import { listInstallableAppPackages, packageAppFactsForKey } from "@dpeek/formless-installed-apps";
import type { DocumentMediaAsset } from "@dpeek/formless-media";
import { defineAppSchemaModule, type AppSchema } from "@dpeek/formless-schema";
import { formlessProgramSchema, parseFormlessProgramSchemaArtifact } from "../program/runtime.ts";
import {
  formlessProgramDefaultComposition,
  formlessProgramSchemaModules,
} from "../program/schema.ts";
import {
  materializeFormlessProgramSourceArtifact,
  parseFormlessProgramArtifact,
} from "../program/artifact.ts";
import {
  FORMLESS_PROGRAM_SCHEMA_KEY,
  FORMLESS_PROGRAM_SOURCE_SCHEMA_HASH,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
} from "../program/target.ts";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import {
  FORMLESS_CONFIG_FILE,
  resolveFormlessConfig,
  type ResolvedFormlessConfig as FormlessResolvedConfig,
} from "@dpeek/formless-workspace";
import { formatTestFormlessConfigModule } from "./instance-workspace-config-test.ts";
import {
  readInstanceWorkspaceProgramStorageSnapshot,
  replaceInstanceWorkspaceMediaFiles,
  writeInstanceWorkspaceProgramStorageSnapshot,
} from "../program/workspace.ts";

import packageJson from "../../package.json";
import {
  FORMLESS_RUNTIME_PROTOCOL_VERSION,
  FORMLESS_STORAGE_MIGRATION_SET_ID,
} from "../shared/deploy-metadata.ts";
import { rootKnownPackageFactsResolver } from "../shared/app-packages.ts";
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
const privateSitePackageAppKey = "private-site";
const programDocumentBytes = new TextEncoder().encode("%PDF-1.7\nProgram private document");
const programDocumentSchemaModule = defineAppSchemaModule({
  key: "program-document-records",
  entities: [
    {
      id: "entity_fba44b11-4ea4-4e34-b71e-217a20e8d940",
      key: "program-report",
      label: "Program report",
      fields: [
        {
          asset: {
            acceptedMimeTypes: ["application/pdf"],
            access: "private",
            kind: "document",
            maxBytes: 1024,
          },
          key: "documentAssetId",
          label: "Document",
          required: false,
          type: "text",
        },
      ],
    },
  ],
});
const rootKnownSitePackage = rootKnownPackageFactsResolver().findPackage("site")!;
const privateSiteSourceSchemaHash =
  "sha256:06789270061b43a2a0e4709f96e8aac35514e0f61bf15a29f234ca253d021c25" as typeof rootKnownSitePackage.sourceSchemaHash;
const privateSitePackage = {
  ...rootKnownSitePackage,
  defaultInstallId: "personal",
  packageAppKey: privateSitePackageAppKey,
  sourceOrigin: "workspace" as const,
  sourceSchemaHash: privateSiteSourceSchemaHash,
  sourceSchemaKey: privateSitePackageAppKey,
  sourceSchemaLocation: {
    kind: "workspace" as const,
    key: privateSitePackageAppKey,
    path: "packages/private-site/schema.json",
  },
};
const privateSitePackageResolver = {
  findPackage: (packageAppKey: string) =>
    packageAppKey === privateSitePackageAppKey ? privateSitePackage : undefined,
  listPackages: () => [privateSitePackage],
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

describe("workspace source sync operation domain", () => {
  it("round-trips Program Task, Site, and CRM records with Program media", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const pullRequests: CapturedRequest[] = [];
    const targetUrl = "https://personal.dpeek.workers.dev";
    const program = programDocumentComposition();
    const resolvedProgram = resolveFormlessConfig({ name: "personal-sites", program });
    if (!resolvedProgram.programSource) {
      throw new Error("Expected resolved Program source.");
    }
    const programSchema = parseFormlessProgramSchemaArtifact(resolvedProgram.programSource);
    const programArtifact = await materializeFormlessProgramSourceArtifact(
      resolvedProgram.programSource,
    );
    const programDocument = programDocumentAsset();
    const programRecords = [
      ...deployControlPlaneRecords({ targetUrl }),
      ...dormantBuiltInProgramRecords(),
      ...programSiteMediaRecords(),
      programDocumentRecord(programDocument.id),
    ];
    const pullFetch = sourceSyncFetch(pullRequests, {
      appData: { david: { records: [] } },
      controlPlaneRecords: programRecords,
      controlPlaneSchema: programSchema,
      installs: [
        installedSite("david", "David Peek"),
        installedDormantPackage("legacy-tasks", "tasks"),
        installedDormantPackage("legacy-site", "site"),
        installedDormantPackage("legacy-crm", "crm"),
      ],
      programDocument: {
        asset: programDocument,
        bytes: programDocumentBytes,
      },
      programMediaBytes: Buffer.from([7, 8, 9]),
    });

    await writeWorkspaceConfig(workspaceRoot, { program });
    await writeDeployStorageSnapshot(workspaceRoot, { program, targetUrl });
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=source-token\n",
    );

    await runPullWorkspaceSourceOperation(
      {
        dryRun: false,
        kind: "pull",
        workspacePath: workspaceRoot,
      },
      operationDeps(tempDir, { fetch: pullFetch }),
    );

    const instanceState = JSON.parse(
      await readFile(path.join(workspaceRoot, "state/instance.json"), "utf8"),
    ) as {
      records: StoredRecord[];
      schemaProvenance: unknown;
    };

    expect(instanceState.schemaProvenance).toEqual({
      kind: "program",
      sourceSchemaHash: programArtifact.schemaProvenance.sourceSchemaHash,
    });
    expect(instanceState.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity: "task", id: "task:program-native" }),
        expect.objectContaining({ entity: "block", id: "block:program-cover" }),
        expect.objectContaining({ entity: "company", id: "company:program-native" }),
        expect.objectContaining({ entity: "company", id: "company:program-native-deleted" }),
        expect.objectContaining({
          entity: "program-report",
          id: "program-report:private",
        }),
      ]),
    );
    expect(instanceState.records.map((record) => record.entity)).not.toContain("app-install");
    expect(instanceState).not.toHaveProperty("media");
    await expect(
      readFile(
        path.join(workspaceRoot, "state/media/media/program/media/images/program-cover.png"),
      ),
    ).resolves.toEqual(Buffer.from([7, 8, 9]));
    await expect(
      readFile(
        path.join(
          workspaceRoot,
          "state/media/media/program/media/program/documents/program-private.pdf",
        ),
      ),
    ).resolves.toEqual(Buffer.from(programDocumentBytes));

    const pushRequests: CapturedRequest[] = [];
    const pushFetch = sourceSyncFetch(pushRequests, {
      appData: { david: { records: [] } },
      controlPlaneRecords: deployControlPlaneRecords({ targetUrl }),
      controlPlaneSchema: programSchema,
      installs: [installedSite("david", "David Peek")],
      restoreResponses: [restorePlan({ replacedInstalls: ["david"] })],
    });

    await runPushWorkspaceSourceOperation(
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
          fetch: pushFetch,
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

    const restoreBody = capturedRequestJson<{
      archive: {
        media: { objects: Array<{ archivePath: string; storageKey: string }> };
        program: { snapshot: { records: StoredRecord[] } };
      };
      mediaFiles: Array<{ archivePath: string }>;
    }>(requestByPath(pushRequests, "/api/formless/archive/restore"));

    expect(restoreBody.archive.program.snapshot.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity: "task", id: "task:program-native" }),
        expect.objectContaining({ entity: "block", id: "block:program-cover" }),
        expect.objectContaining({ entity: "company", id: "company:program-native" }),
        expect.objectContaining({ entity: "company", id: "company:program-native-deleted" }),
        expect.objectContaining({
          entity: "program-report",
          id: "program-report:private",
        }),
      ]),
    );
    expect(
      restoreBody.archive.program.snapshot.records.map((record) => record.entity),
    ).not.toContain("app-install");
    expect(restoreBody.archive.media.objects).toEqual([
      expect.objectContaining({
        archivePath: "media/program/media/images/program-cover.png",
        storageKey: "media/images/program-cover.png",
      }),
      expect.objectContaining({
        archivePath: "media/program/media/program/documents/program-private.pdf",
        asset: expect.not.objectContaining({
          ownerAppInstallId: expect.anything(),
        }),
        storageKey: "media/program/documents/program-private.pdf",
      }),
    ]);
    expect(restoreBody.mediaFiles).toEqual([
      expect.objectContaining({
        archivePath: "media/program/media/images/program-cover.png",
      }),
      expect.objectContaining({
        archivePath: "media/program/media/program/documents/program-private.pdf",
      }),
    ]);
    expect(pushRequests.map((request) => new URL(request.url).pathname)).not.toEqual(
      expect.arrayContaining([
        "/api/app-installs/tasks/legacy-tasks/snapshot",
        "/api/app-installs/site/legacy-site/snapshot",
        "/api/app-installs/crm/legacy-crm/snapshot",
      ]),
    );
  });

  it("plans CRM-only Program record drift through the Program snapshot", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const localProgramRecords = [...deployControlPlaneRecords(), ...programCrmRecords()];
    const fetcher = sourceSyncFetch(requests, {
      appData: { david: { records: [] } },
      controlPlaneRecords: deployControlPlaneRecords(),
      installs: [installedSite("david", "David Peek")],
      restoreResponses: [restorePlan({ replacedInstalls: ["david"] })],
    });

    await writeWorkspaceConfig(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot, { records: localProgramRecords });
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
    const restoreBody = capturedRequestJson<{
      archive: {
        program: { snapshot: { records: StoredRecord[] } };
      };
    }>(requestByPath(requests, "/api/formless/archive/restore"));

    expect(result).toMatchObject({
      details: {
        syncPlan: {
          status: "changes",
        },
      },
      summary: {
        fields: {
          noop: false,
          sync: "changes",
        },
      },
    });
    expect(restoreBody.archive.program.snapshot.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity: "company", id: "company:program-native" }),
        expect.objectContaining({ entity: "company", id: "company:program-native-deleted" }),
      ]),
    );
    expect(requests.map(({ url }) => new URL(url).pathname)).not.toContain(
      "/api/app-installs/crm/legacy-crm/snapshot",
    );
  });

  it("uses only Program state and referenced media for workspace pull", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const targetUrl = "https://source-owned.dpeek.workers.dev";
    const fetcher = sourceSyncFetch(requests, {
      controlPlaneRecords: deployControlPlaneRecordsWithProviderObservation({ targetUrl }),
    });

    await writeWorkspaceConfig(workspaceRoot, {
      runtime: {
        extensions: {
          "site.publicRenderer": {
            browser: "renderers/site.browser.tsx",
            worker: "renderers/site.worker.tsx",
          },
        },
      },
    });
    const configBytes = await readFile(path.join(workspaceRoot, FORMLESS_CONFIG_FILE), "utf8");
    await writeDeployStorageSnapshot(workspaceRoot, { targetUrl });
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
    const pulledControlPlane = await readInstanceWorkspaceProgramStorageSnapshot({
      manifest: resolveFormlessConfig({ name: "personal-sites" }),
      workspaceRoot,
    });
    const pulledControlPlaneRecords = pulledControlPlane?.records ?? [];

    expect(result).toMatchObject({
      details: {
        domainCount: 1,
        syncPlan: {
          changedStatePathCount: 0,
          status: "up-to-date",
          target: "workspace",
        },
        target: "instance.primary",
      },
      summary: {
        fields: {
          mediaCount: 0,
          mode: "apply",
          noop: true,
          recordCount: 3,
        },
        title: "Workspace pulled",
      },
    });
    expect(JSON.stringify(result)).not.toContain("stored-archive-token");
    expect(JSON.stringify(pulledControlPlaneRecords)).not.toContain("observedStatus");
    expect(JSON.stringify(pulledControlPlaneRecords)).not.toContain("deploy-evidence-summary");
    expect(JSON.stringify(pulledControlPlaneRecords)).not.toContain("raw-provider-evidence");
    await expect(
      stat(path.join(workspaceRoot, "state/media/media/david/media/images/cover.png")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(path.join(workspaceRoot, FORMLESS_CONFIG_FILE), "utf8")).resolves.toBe(
      configBytes,
    );
    expect(requests.map((request) => request.headers.authorization)).toEqual(
      requests.map(() => "Bearer stored-archive-token"),
    );
  });

  it("keeps Program workspace state unchanged during pull dry-run", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const fetcher = sourceSyncFetch(requests, {});

    await writeWorkspaceConfig(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=stored-archive-token\n",
    );
    const programStateBefore = await readFile(
      path.join(workspaceRoot, "state/instance.json"),
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
        changedStatePaths: [],
        prunedStatePaths: [],
        syncPlan: {
          changedRecordCount: 0,
          status: "up-to-date",
        },
      },
      summary: {
        fields: {
          mode: "dry-run",
          noop: true,
        },
        title: "Workspace pulled",
      },
    });
    await expect(readFile(path.join(workspaceRoot, "state/instance.json"), "utf8")).resolves.toBe(
      programStateBefore,
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
    const fetcher = sourceSyncFetch(requests, {});

    await writeWorkspaceConfig(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=stored-archive-token\n",
    );
    const programStateBefore = await readFile(
      path.join(workspaceRoot, "state/instance.json"),
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
    await expect(readFile(path.join(workspaceRoot, "state/instance.json"), "utf8")).resolves.toBe(
      programStateBefore,
    );
    expect(requests.some((request) => request.method === "POST")).toBe(false);
  });

  it("summarizes push dry-run plans without provider mutation dependencies", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];

    await writeWorkspaceConfig(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
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
          sourceRecords: 3,
          sync: "up-to-date",
        },
        title: "Workspace push planned",
      },
    });

    const requestPaths = requests.map(
      (request) => `${request.method} ${new URL(request.url).pathname}`,
    );

    expect(requests.every((request) => request.method === "GET")).toBe(true);
    expect(requestPaths).toContain("GET /api/formless/program/snapshot");
    expect(requestPaths).not.toContain("POST /api/formless/archive/restore");
    expect(requestPaths).not.toContain("GET /api/formless/deployments/desired-state");
  });

  it("composes push dry-run from Program state and referenced media", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const fetcher = sourceSyncFetch(requests, {});

    await writeWorkspaceConfig(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
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
    expect(result).toMatchObject({
      details: {
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
          sourceMedia: 0,
          sourceRecords: 3,
          sync: "up-to-date",
        },
        title: "Workspace push planned",
      },
    });
    expect(requests.map((request) => new URL(request.url).pathname)).not.toContain(
      "/api/formless/archive/restore",
    );
    expect(
      requests.map((request) => `${request.method} ${new URL(request.url).pathname}`),
    ).not.toContain("POST /api/formless/program/operations/deployment-config/update");
    expect(JSON.stringify(result)).not.toContain("local-token");
  });

  it("treats matching records and schema provenance as repeat push no-op", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const changedRemoteSchema = JSON.parse(
      JSON.stringify(siteSourceSchema),
    ) as typeof siteSourceSchema;
    setKeyedDefinition(changedRemoteSchema.entities, "site", {
      ...changedRemoteSchema.entities.find((definition) => definition.key === "site")!,
      label: "Changed remote schema body",
    });
    const fetcher = sourceSyncFetch(requests, {
      appData: { david: { records: [], schema: changedRemoteSchema } },
      installs: [installedSite("david", "David Peek")],
    });

    await writeWorkspaceConfig(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
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

    await writeWorkspaceConfig(workspaceRoot);
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
    }>(requestByPath(requests, "/api/formless/program/operations/deployment-config/update"));

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
  it("does not deploy when only dormant installed-app source differs", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];

    await writeWorkspaceConfig(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
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
    expect(deployInputs).toEqual([]);
    expect(result).toMatchObject({
      details: {
        applyRestore: null,
        dryRunRestore: null,
        syncPlan: {
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
    expect(requests.map((request) => new URL(request.url).pathname)).not.toContain(
      "/api/formless/archive/restore",
    );
    expect(JSON.stringify(result)).not.toContain("manual-provider-token");
    expect(JSON.stringify(result)).not.toContain("local-token");
  });

  it("ignores dormant installed package fact drift", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const restoreEvents: string[] = [];
    const localPackageFacts = packageAppFactsForKey(
      privateSitePackageAppKey,
      privateSitePackageResolver,
    );

    if (!localPackageFacts) {
      throw new Error("Missing bundled package facts for site.");
    }

    const staleRemoteInstall = {
      ...installedSite("david", "David Peek"),
      packageRevision: localPackageFacts.packageRevision + 1,
      sourceSchemaHash: `sha256:${"a".repeat(64)}` as `sha256:${string}`,
    };

    await writeWorkspaceConfig(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
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
    expect(deployInputs).toEqual([]);
    expect(restoreEvents).toEqual([]);
    expect(result).toMatchObject({
      details: {
        applyRestore: null,
        dryRunRestore: null,
        syncPlan: {
          changedAreas: [],
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
    expect(restoreRequests).toEqual([]);
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

    await writeWorkspaceConfig(workspaceRoot, {
      runtime: { extensions: runtimeExtensions },
    });
    await writeDeployStorageSnapshot(workspaceRoot);
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

  it("selects an explicit Program artifact for repeat push runtime builds", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];

    await writeWorkspaceConfig(workspaceRoot, {
      program: formlessProgramDefaultComposition,
    });
    await writeDeployStorageSnapshot(workspaceRoot);
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
    const deployInput = deployInputs[0];

    expect(deployInput).toBeDefined();
    await expect(
      parseFormlessProgramArtifact(
        JSON.parse(deployInput?.workspaceProgramArtifact ?? "") as unknown,
      ),
    ).resolves.toMatchObject({
      schemaProvenance: {
        kind: "program",
        sourceSchemaHash: FORMLESS_PROGRAM_SOURCE_SCHEMA_HASH,
      },
    });
    expect(deployInput?.workspaceProgramArtifactPath).toBe(
      path.join(workspaceRoot, ".formless/local/formless-program.json"),
    );
    expect(result).toMatchObject({
      details: {
        runtimeRebuild: {
          reason: "program-artifact-configured",
          status: "applied",
        },
      },
    });
  });

  it("forces unreadable target replacement and omits invalid remote control-plane records", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];

    await writeWorkspaceConfig(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
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
      archive: {
        program: { snapshot: { records: StoredRecord[] } };
        restorePolicy: unknown;
      };
    }>(restoreRequests[0]!);
    expect(deployInputs).toHaveLength(1);
    expect(result.forcedRecovery).toMatchObject({
      action: "replace-unreadable-target",
      status: "applied",
    });
    expect(restoreRequests).toHaveLength(1);
    expect(restoreBody.archive.restorePolicy).toEqual({
      dryRun: false,
    });
    expect(restoreBody.archive.program.snapshot.records.map((record) => record.id)).not.toContain(
      "remote-invalid-control-plane-record",
    );
    expect(JSON.stringify(restoreBody.archive)).not.toContain("legacy-control-plane-record");
  });

  it("accepts current Program-only workspace source", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];

    await writeWorkspaceConfig(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    const result = await pushFormlessInstanceWorkspace(
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
    expect(result).toMatchObject({
      noop: true,
      source: {
        mediaCount: 0,
        recordCount: 3,
      },
      syncPlan: {
        status: "up-to-date",
      },
    });
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
            "/api/formless/program/operations/deployment-config/update",
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

    await writeWorkspaceConfig(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot, { records: localControlPlaneRecords });
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
      archive: {
        program: { snapshot: { records: StoredRecord[] } };
      };
    }>(restoreRequest);
    expect(deployInputs).toHaveLength(1);
    expect(deployInputs[0]?.deploymentResourceGraph?.resources).toEqual([]);
    expect(restoreBody.archive.program.snapshot.records.map((record) => record.id)).not.toContain(
      "route:host:public-site:www.example.com",
    );
  });

  it("records display-safe failure observations when provider reconciliation fails", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];

    await writeWorkspaceConfig(workspaceRoot);
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
    }>(requestByPath(requests, "/api/formless/program/operations/deployment-config/update"));

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

    await writeWorkspaceConfig(workspaceRoot);
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
async function writeWorkspaceConfig(
  workspaceRoot: string,
  options: {
    program?: Parameters<typeof resolveFormlessConfig>[0]["program"];
    runtime?: FormlessResolvedConfig["runtime"];
  } = {},
) {
  const manifest = {
    version: 1 as const,
    kind: "formless-instance-workspace" as const,
    name: "personal-sites",
    local: { stateRoot: ".formless/local", secretStateRoot: ".formless" },
    packages: {
      links: [{ manifest: "packages/private-site/formless.app.json" }],
    },
    ...(options.program === undefined ? {} : { program: options.program }),
    ...(options.runtime === undefined ? {} : { runtime: options.runtime }),
  };

  await writePrivateSitePackage(workspaceRoot);
  await writeFile(
    path.join(workspaceRoot, FORMLESS_CONFIG_FILE),
    formatTestFormlessConfigModule(manifest),
  );
}

async function writePrivateSitePackage(workspaceRoot: string) {
  const packageRoot = path.join(workspaceRoot, "packages/private-site");

  await mkdir(packageRoot, { recursive: true });
  await writeFile(path.join(packageRoot, "schema.json"), JSON.stringify(siteSourceSchema));
  await writeFile(
    path.join(packageRoot, "formless.app.json"),
    JSON.stringify({
      kind: "formless.appPackage",
      version: 1,
      packageAppKey: privateSitePackageAppKey,
      label: "Private Site",
      description: "Private Site test package.",
      defaultInstallId: "personal",
      supportsMultipleInstalls: true,
      packageRevision: rootKnownSitePackage.packageRevision,
      sourceSchema: {
        kind: "workspace",
        key: privateSitePackageAppKey,
        path: "schema.json",
      },
      sourceSchemaHash: privateSiteSourceSchemaHash,
      capabilities: [{ kind: "generatedAdmin", routeBase: "/apps" }],
    }),
  );
}

async function writeDeployStorageSnapshot(
  workspaceRoot: string,
  options: {
    credentialRef?: string;
    program?: Parameters<typeof resolveFormlessConfig>[0]["program"];
    records?: StoredRecord[];
    targetUrl?: string;
    workerName?: string | null;
  } = {},
) {
  const manifest = resolveFormlessConfig({
    name: "personal-sites",
    ...(options.program === undefined ? {} : { program: options.program }),
  });

  await writeInstanceWorkspaceProgramStorageSnapshot({
    manifest,
    snapshot: controlPlaneSnapshot(
      options.records ?? deployControlPlaneRecords(options),
      parseFormlessProgramSchemaArtifact(manifest.programSource ?? formlessProgramSchema),
    ),
    workspaceRoot,
  });
}

async function writeWorkspaceMediaFile(
  workspaceRoot: string,
  installId: string,
  bytes: Uint8Array,
) {
  const manifest = resolveFormlessConfig({ name: "personal-sites" });
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
      {
        mediaBytes?: Uint8Array;
        records?: StoredRecord[];
        schema?: typeof siteSourceSchema;
      }
    >;
    controlPlaneRecords?: StoredRecord[];
    controlPlaneSchema?: AppSchema;
    installs?: Array<ReturnType<typeof installedSite> | ReturnType<typeof installedDormantPackage>>;
    programDocument?: {
      asset: DocumentMediaAsset;
      bytes: Uint8Array;
    };
    programMediaBytes?: Uint8Array;
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
        packageApps: listInstallableAppPackages(privateSitePackageResolver).map((appPackage) => ({
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
        packages: listInstallableAppPackages(privateSitePackageResolver),
      });
    }

    if (parsedUrl.pathname === "/api/formless/program/bootstrap") {
      return Response.json({
        cursor: 1,
        records: options.controlPlaneRecords ?? deployControlPlaneRecords(),
        schema: {},
      });
    }

    if (parsedUrl.pathname === "/api/formless/program/snapshot") {
      return Response.json(
        controlPlaneSnapshot(
          options.controlPlaneRecords ?? deployControlPlaneRecords(),
          options.controlPlaneSchema,
        ),
      );
    }

    if (parsedUrl.pathname === "/api/formless/program/media/documents") {
      return Response.json({
        assets: options.programDocument ? [options.programDocument.asset] : [],
      });
    }

    if (
      options.programDocument &&
      parsedUrl.pathname === options.programDocument.asset.deliveryHref
    ) {
      return new Response(Buffer.from(options.programDocument.bytes), {
        headers: { "content-type": options.programDocument.asset.contentType },
      });
    }

    const snapshotMatch = parsedUrl.pathname.match(
      /^\/api\/app-installs\/private-site\/([^/]+)\/snapshot$/,
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
      /^\/api\/app-installs\/private-site\/([^/]+)\/media\/media\/images\/cover\.png$/,
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

    if (
      parsedUrl.pathname === "/api/formless/media/media/images/cover.png" ||
      parsedUrl.pathname === "/api/formless/media/media/images/program-cover.png"
    ) {
      const mediaBytes =
        options.programMediaBytes ??
        Object.values(options.appData ?? {}).find((data) => data.mediaBytes !== undefined)
          ?.mediaBytes;

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
      {
        mediaBytes?: Uint8Array;
        records?: StoredRecord[];
        schema?: typeof siteSourceSchema;
      }
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
        packageApps: listInstallableAppPackages(privateSitePackageResolver).map((appPackage) => ({
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
        packages: listInstallableAppPackages(privateSitePackageResolver),
      });
    }

    if (parsedUrl.pathname === "/api/formless/program/bootstrap") {
      return Response.json({
        cursor: 1,
        records: options.controlPlaneRecords ?? deployControlPlaneRecords(),
        schema: {},
      });
    }

    if (parsedUrl.pathname === "/api/formless/program/snapshot") {
      return Response.json(
        controlPlaneSnapshot(options.controlPlaneRecords ?? deployControlPlaneRecords()),
      );
    }

    const snapshotMatch = parsedUrl.pathname.match(
      /^\/api\/app-installs\/private-site\/([^/]+)\/snapshot$/,
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
      const body = parseCapturedBody<{
        archive?: {
          restorePolicy?: {
            dryRun?: boolean;
          };
        };
      }>(init);
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

    if (parsedUrl.pathname === "/api/formless/program/operations/deployment-config/update") {
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
  const facts = packageAppFactsForKey(privateSitePackageAppKey, privateSitePackageResolver);

  if (!facts) {
    throw new Error("Missing bundled package facts for site.");
  }

  return {
    adminRoute: `/apps/${installId}` as `/apps/${string}`,
    createdAt: "2026-05-01T00:00:00.000Z",
    installId,
    label,
    packageAppKey: privateSitePackageAppKey,
    packageRevision: facts.packageRevision,
    sourceSchemaHash: facts.sourceSchemaHash,
    status: "installed" as const,
    updatedAt: "2026-05-01T00:00:00.000Z",
  };
}

function installedDormantPackage(installId: string, packageAppKey: "crm" | "site" | "tasks") {
  const facts = packageAppFactsForKey(packageAppKey, rootKnownPackageFactsResolver());

  if (!facts) {
    throw new Error(`Missing root-known package facts for ${packageAppKey}.`);
  }

  return {
    adminRoute: `/apps/${installId}` as `/apps/${string}`,
    createdAt: "2026-05-01T00:00:00.000Z",
    installId,
    label: `Legacy ${packageAppKey === "site" ? "Site" : packageAppKey === "crm" ? "CRM" : "Tasks"}`,
    packageAppKey,
    packageRevision: facts.packageRevision,
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
    schemaKey: privateSitePackageAppKey,
    schemaUpdatedAt: "2026-05-01T00:00:00.000Z",
    sourceCursor: 1,
    storageIdentity,
    version: STORAGE_SNAPSHOT_VERSION,
  };
}

function controlPlaneSnapshot(
  records: StoredRecord[],
  schema: AppSchema = formlessProgramSchema,
): StorageSnapshot {
  return {
    exportedAt: "2026-05-12T02:00:00.000Z",
    kind: STORAGE_SNAPSHOT_KIND,
    records,
    schema,
    schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
    schemaUpdatedAt: "2026-05-01T00:00:00.000Z",
    sourceCursor: records.length,
    storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
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
        installId,
        label: "David Peek",
        packageAppKey: privateSitePackageAppKey,
        status: "installed",
        storageIdentity: `app:${installId}`,
      },
    },
    {
      createdAt: now,
      updatedAt: now,
      entity: "route",
      id: `route:${installId}:admin`,
      values: {
        appInstall: installId,
        enabled: true,
        kind: "mount",
        matchPath: `/apps/${installId}`,
        surface: "admin",
        targetProfile: "app",
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
        enabled: true,
        kind: "mount",
        matchPath: "/pages",
        matchPrefix: "/pages/",
        surface: "public-site",
        targetProfile: "public-site",
      },
    },
    {
      createdAt: now,
      updatedAt: now,
      entity: "route",
      id: "route:host:public-site:www.example.com",
      values: {
        enabled: true,
        kind: "mount",
        matchHost: "www.example.com",
        matchPath: "/",
        matchPrefix: "/",
        deploymentConfig: "instance.primary",
        surface: "public-site",
        targetProfile: "public-site",
      },
    },
    {
      createdAt: now,
      updatedAt: now,
      entity: "deployment-config",
      id: "instance.primary",
      values: {
        accountId: "account-123",
        enabled: true,
        label: "Primary instance",
        providerFamily: "cloudflare",
        targetId: "instance.primary",
        targetKind: "instance",
        targetUrl: options.targetUrl ?? "https://personal.dpeek.workers.dev",
        ...(options.credentialRef === undefined ? {} : { credentialRef: options.credentialRef }),
        ...(workerName === null ? {} : { workerName }),
      },
    },
  ];
}

function dormantBuiltInProgramRecords(): StoredRecord[] {
  const installs = [
    installedDormantPackage("legacy-tasks", "tasks"),
    installedDormantPackage("legacy-site", "site"),
    installedDormantPackage("legacy-crm", "crm"),
  ];
  const records: StoredRecord[] = [];

  for (const install of installs) {
    records.push({
      createdAt: install.createdAt,
      updatedAt: install.updatedAt,
      entity: "app-install",
      id: install.installId,
      values: {
        installId: install.installId,
        label: install.label,
        packageAppKey: install.packageAppKey,
        packageRevision: install.packageRevision,
        sourceSchemaHash: install.sourceSchemaHash,
        status: install.status,
        storageIdentity: `app:${install.installId}`,
      },
    });
    records.push({
      createdAt: install.createdAt,
      updatedAt: install.updatedAt,
      entity: "route",
      id: `route:${install.installId}:admin`,
      values: {
        appInstall: install.installId,
        enabled: true,
        kind: "mount",
        matchPath: install.adminRoute,
        matchPrefix: `${install.adminRoute}/`,
        surface: "admin",
        targetProfile: "app",
      },
    });
  }

  return [
    ...records,
    {
      createdAt: installs[0]!.createdAt,
      updatedAt: installs[0]!.updatedAt,
      entity: "task",
      id: "task:program-native",
      values: {
        done: false,
        priority: "normal",
        title: "Program-native task",
      },
    },
    ...programCrmRecords(),
  ];
}

function programCrmRecords(): StoredRecord[] {
  const createdAt = "2026-05-26T00:00:00.000Z";

  return [
    {
      createdAt,
      entity: "company",
      id: "company:program-native",
      updatedAt: createdAt,
      values: {
        name: "Program Native",
        status: "prospect",
      },
    },
    {
      createdAt,
      deletedAt: "2026-05-27T00:00:00.000Z",
      entity: "company",
      id: "company:program-native-deleted",
      updatedAt: "2026-05-27T00:00:00.000Z",
      values: {
        name: "Program Native Deleted",
        status: "archived",
      },
    },
  ];
}

function deployControlPlaneRecordsWithProviderObservation(
  options: Parameters<typeof deployControlPlaneRecords>[0] = {},
): StoredRecord[] {
  return deployControlPlaneRecords(options);
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
    mediaCount: 0,
    recordCounts: { active: 0, byEntity: {}, tombstoned: 0, total: 0 },
  };
}

function restorePlan(
  _summary: Partial<{
    createdInstalls: string[];
    replacedInstalls: string[];
  }> = {},
) {
  return {
    ok: true,
    plan: {
      summary: {
        ...restoreSummary(),
      },
    },
  };
}

function programSiteMediaRecords(): StoredRecord[] {
  return [
    block("block:program-cover", "2026-05-05T00:00:02.000Z", {
      type: "image",
      label: "Program cover",
      mediaAssetId: "program-cover.png",
    }),
  ];
}

function programDocumentComposition() {
  return {
    ...formlessProgramDefaultComposition,
    modules: [...formlessProgramSchemaModules, programDocumentSchemaModule],
  };
}

function programDocumentAsset(): DocumentMediaAsset {
  const id = "program-private.pdf";
  const storageKey = `media/program/documents/${id}`;

  return {
    access: "private",
    byteSize: programDocumentBytes.byteLength,
    contentType: "application/pdf",
    deliveryHref: `/api/formless/program/media/documents/${id}`,
    filename: id,
    id,
    kind: "document",
    label: "Program private document",
    provider: "r2",
    status: "ready",
    storageKey,
  };
}

function programDocumentRecord(assetId: string): StoredRecord {
  const createdAt = "2026-05-05T00:00:03.000Z";

  return {
    createdAt,
    updatedAt: createdAt,
    entity: "program-report",
    id: "program-report:private",
    values: {
      documentAssetId: assetId,
    },
  };
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
