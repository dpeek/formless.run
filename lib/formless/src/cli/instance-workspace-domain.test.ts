import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";
import type { DocumentMediaAsset } from "@dpeek/formless-media";
import { composeAppSchema, defineAppSchemaModule, type AppSchema } from "@dpeek/formless-schema";
import {
  formlessProgramSchema,
  formlessProgramSchemaProvenance,
  parseFormlessProgramSchemaArtifact,
} from "../program/runtime.ts";
import {
  formlessProgramDefaultComposition,
  formlessProgramSchemaModules,
} from "../program/schema.ts";
import {
  materializeFormlessProgramSourceArtifact,
  parseFormlessProgramArtifact,
  type FormlessProgramArtifact,
} from "../program/artifact.ts";
import {
  FORMLESS_PROGRAM_SCHEMA_KEY,
  FORMLESS_PROGRAM_SOURCE_SCHEMA_HASH,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
} from "../program/target.ts";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import {
  DEFAULT_FORMLESS_PROGRAM_BROWSER_RUNTIME_MODULE,
  DEFAULT_FORMLESS_PROGRAM_SHARED_RUNTIME_MODULE,
  DEFAULT_FORMLESS_PROGRAM_WORKER_RUNTIME_MODULE,
  FORMLESS_CONFIG_FILE,
  WORKSPACE_MEDIA_LEGACY_MANIFEST_VERSION,
  WORKSPACE_MEDIA_MANIFEST_VERSION,
  resolveFormlessConfig,
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
import { FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER } from "../shared/protocol.ts";
import { SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY } from "../shared/workspace-runtime-extensions.ts";
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
  refreshFormlessInstanceDeploymentObservation,
  type PushFormlessInstanceWorkspaceDependencies,
  type PushFormlessInstanceWorkspaceDryRunDependencies,
} from "./instance-workspace-deployment.ts";
import {
  pullFormlessInstanceWorkspace,
  WorkspacePushRemoteRestoreError,
  WorkspacePushSchemaCompatibilityError,
  type PullFormlessInstanceWorkspaceDependencies,
} from "./instance-workspace-source-sync.ts";

const tempDirs: string[] = [];
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

function schemaSafePushProgram(linked: boolean) {
  const presentation = defineAppSchemaModule({
    key: "schema-safe-push-presentation",
    tableViews: [
      {
        key: "schemaSafePushBlockTable",
        entity: "block",
        links: linked
          ? [
              {
                key: "openPublishedBlock",
                label: "Open published block",
                target: "newTab" as const,
                destination: {
                  type: "url" as const,
                  base: "https://example.com/published",
                  query: [],
                },
              },
            ]
          : [],
        columns: [
          { type: "field" as const, field: "label" },
          ...(linked
            ? [
                {
                  type: "linkControl" as const,
                  link: "openPublishedBlock",
                  label: "Open",
                },
              ]
            : []),
        ],
      },
    ],
  });

  return {
    ...formlessProgramDefaultComposition,
    modules: [...formlessProgramSchemaModules, presentation],
  };
}

function schemaFieldRemovalProgram(includeLegacyField: boolean) {
  const records = defineAppSchemaModule({
    key: "schema-safe-push-records",
    entities: [
      {
        id: "entity_5f23c709-aa23-4094-a9ff-47d4fce7d66f",
        key: "schema-safe-record",
        label: "Schema-safe record",
        fields: [
          {
            key: "label",
            required: true,
            type: "text" as const,
          },
          ...(includeLegacyField
            ? [
                {
                  key: "legacyNote",
                  required: false,
                  type: "text" as const,
                },
              ]
            : []),
        ],
      },
    ],
  });

  return {
    ...formlessProgramDefaultComposition,
    modules: [...formlessProgramSchemaModules, records],
  };
}
afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

describe("workspace source sync domain", () => {
  it("round-trips Program standard, Task, and Site records with Program media", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const pullRequests: CapturedRequest[] = [];
    const targetUrl = "https://personal.dpeek.workers.dev";
    const program = programDocumentComposition();
    const resolvedProgram = resolveFormlessConfig({
      name: "personal-sites",
      program,
      runtime: {
        composition: {
          shared: DEFAULT_FORMLESS_PROGRAM_SHARED_RUNTIME_MODULE,
          browser: DEFAULT_FORMLESS_PROGRAM_BROWSER_RUNTIME_MODULE,
          worker: DEFAULT_FORMLESS_PROGRAM_WORKER_RUNTIME_MODULE,
        },
      },
    });
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
      ...programNativeRecords(),
      ...programSiteMediaRecords(),
      programDocumentRecord(programDocument.id),
    ];
    const pullFetch = sourceSyncFetch(pullRequests, {
      controlPlaneRecords: programRecords,
      controlPlaneSchema: programSchema,
      controlPlaneSchemaProvenance: programArtifact.schemaProvenance,
      programDocument: {
        asset: programDocument,
        bytes: programDocumentBytes,
      },
      programMediaBytes: Buffer.from([7, 8, 9]),
    });

    await writeWorkspaceConfig(workspaceRoot, {
      program,
      runtime: {
        composition: {
          shared: DEFAULT_FORMLESS_PROGRAM_SHARED_RUNTIME_MODULE,
          browser: DEFAULT_FORMLESS_PROGRAM_BROWSER_RUNTIME_MODULE,
          worker: DEFAULT_FORMLESS_PROGRAM_WORKER_RUNTIME_MODULE,
        },
      },
    });
    await writeDeployStorageSnapshot(workspaceRoot, { program, targetUrl });
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=source-token\n",
    );

    await pullFormlessInstanceWorkspace(
      {
        dryRun: false,
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
        expect.objectContaining({
          entity: "contact-message",
          id: "contact-message:program-native",
        }),
        expect.objectContaining({
          entity: "contact-message",
          id: "contact-message:program-native-deleted",
        }),
        expect.objectContaining({
          entity: "program-report",
          id: "program-report:private",
        }),
      ]),
    );
    expect(instanceState).not.toHaveProperty("media");
    await expect(
      readFile(path.join(workspaceRoot, "state/media/images/program-cover.png")),
    ).resolves.toEqual(Buffer.from([7, 8, 9]));
    await expect(
      readFile(path.join(workspaceRoot, "state/media/documents/program-private.pdf")),
    ).resolves.toEqual(Buffer.from(programDocumentBytes));
    const workspaceMediaManifest = JSON.parse(
      await readFile(path.join(workspaceRoot, "state/media/manifest.json"), "utf8"),
    ) as { objects: Array<{ payloadPath: string }>; version: number };

    expect(workspaceMediaManifest).toMatchObject({
      objects: [
        { payloadPath: "documents/program-private.pdf" },
        { payloadPath: "images/program-cover.png" },
      ],
      version: WORKSPACE_MEDIA_MANIFEST_VERSION,
    });

    await rewriteWorkspaceMediaManifestAsVersion1(workspaceRoot);

    const adoptionDryRun = await pullFormlessInstanceWorkspace(
      {
        dryRun: true,
        workspacePath: workspaceRoot,
      },
      operationDeps(tempDir, { fetch: pullFetch }),
    );

    expect(adoptionDryRun).toMatchObject({
      mode: "dry-run",
      noop: false,
      replacement: {
        changedStatePaths: [
          "state/media/documents/program-private.pdf",
          "state/media/images/program-cover.png",
          "state/media/manifest.json",
        ],
        prunedStatePaths: [
          "state/media/media/documents/program-private.pdf",
          "state/media/media/images/program-cover.png",
        ],
        status: "changes",
      },
    });
    await expect(
      readFile(path.join(workspaceRoot, "state/media/media/images/program-cover.png")),
    ).resolves.toEqual(Buffer.from([7, 8, 9]));
    await expect(
      readFile(path.join(workspaceRoot, "state/media/images/program-cover.png")),
    ).rejects.toMatchObject({ code: "ENOENT" });

    await pullFormlessInstanceWorkspace(
      {
        dryRun: false,
        workspacePath: workspaceRoot,
      },
      operationDeps(tempDir, { fetch: pullFetch }),
    );

    await expect(
      readFile(path.join(workspaceRoot, "state/media/images/program-cover.png")),
    ).resolves.toEqual(Buffer.from([7, 8, 9]));
    await expect(
      readFile(path.join(workspaceRoot, "state/media/media/images/program-cover.png")),
    ).rejects.toMatchObject({ code: "ENOENT" });

    const pushRequests: CapturedRequest[] = [];
    const pushFetch = sourceSyncFetch(pushRequests, {
      controlPlaneRecords: deployControlPlaneRecords({ targetUrl }),
      controlPlaneSchema: programSchema,
      controlPlaneSchemaProvenance: programArtifact.schemaProvenance,
      restoreResponses: [restorePlan()],
    });

    await pushFormlessInstanceWorkspace(
      {
        apply: false,

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
        expect.objectContaining({
          entity: "contact-message",
          id: "contact-message:program-native",
        }),
        expect.objectContaining({
          entity: "contact-message",
          id: "contact-message:program-native-deleted",
        }),
        expect.objectContaining({
          entity: "program-report",
          id: "program-report:private",
        }),
      ]),
    );
    expect(restoreBody.archive.media.objects).toEqual([
      expect.objectContaining({
        archivePath: "media/documents/program-private.pdf",
        storageKey: "media/documents/program-private.pdf",
      }),
      expect.objectContaining({
        archivePath: "media/images/program-cover.png",
        storageKey: "media/images/program-cover.png",
      }),
    ]);
    expect(restoreBody.mediaFiles).toEqual([
      expect.objectContaining({
        archivePath: "media/documents/program-private.pdf",
      }),
      expect.objectContaining({
        archivePath: "media/images/program-cover.png",
      }),
    ]);
  });

  it("plans standard inquiry record drift through the Program snapshot", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const localProgramRecords = [...deployControlPlaneRecords(), ...programInquiryRecords()];
    const fetcher = sourceSyncFetch(requests, {
      controlPlaneRecords: deployControlPlaneRecords(),
      restoreResponses: [restorePlan()],
    });

    await writeWorkspaceConfig(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot, { records: localProgramRecords });
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    const result = await pushFormlessInstanceWorkspace(
      {
        apply: false,

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
      mode: "dry-run",
      noop: false,
      syncPlan: { status: "changes" },
    });
    expect(restoreBody.archive.program.snapshot.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: "contact-message",
          id: "contact-message:program-native",
        }),
        expect.objectContaining({
          entity: "contact-message",
          id: "contact-message:program-native-deleted",
        }),
      ]),
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

    const result = await pullFormlessInstanceWorkspace(
      {
        dryRun: false,
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
      domains: [{ host: "www.example.com" }],
      instanceState: { mediaCount: 0, recordCount: 4 },
      mode: "apply",
      noop: true,
      selectedTarget: { alias: "instance.primary" },
      syncPlan: {
        changedStatePaths: [],
        status: "up-to-date",
        target: { label: "workspace" },
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

    const result = await pullFormlessInstanceWorkspace(
      {
        dryRun: true,
        workspacePath: workspaceRoot,
      },
      operationDeps(tempDir, { fetch: fetcher }),
    );

    expect(result).toMatchObject({
      mode: "dry-run",
      noop: true,
      replacement: {
        changedStatePaths: [],
        prunedStatePaths: [],
        status: "no-changes",
      },
      syncPlan: { changedRecords: [], status: "up-to-date" },
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

    const result = await pullFormlessInstanceWorkspace(
      {
        dryRun: false,
        workspacePath: workspaceRoot,
      },
      operationDeps(tempDir, { fetch: fetcher }),
    );

    expect(result).toMatchObject({
      mode: "apply",
      noop: true,
      replacement: { changedStatePaths: [], status: "no-changes" },
      syncPlan: { status: "up-to-date" },
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

    const result = await pushFormlessInstanceWorkspace(
      {
        apply: false,

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
      mode: "dry-run",
      noop: true,
      selectedTarget: { alias: "instance.primary" },
      source: { recordCount: 4 },
      syncPlan: { changedRecords: [], changedStatePaths: [], status: "up-to-date" },
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

    const result = await pushFormlessInstanceWorkspace(
      {
        apply: false,

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
      mode: "dry-run",
      noop: true,
      selectedTarget: { alias: "instance.primary" },
      source: { mediaCount: 0, recordCount: 4 },
      syncPlan: { changedRecords: [], changedStatePaths: [], status: "up-to-date" },
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
    const fetcher = sourceSyncFetch(requests);

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

        workspacePath: workspaceRoot,
      },
      pushApplyOperationDeps(tempDir, { fetch: fetcher }),
    );

    expect(result).toMatchObject({
      mode: "apply",
      noop: true,
      syncPlan: { changedRecords: [], status: "up-to-date" },
    });
    expect(requests.some((request) => request.method === "POST")).toBe(false);
    expect(JSON.stringify(result)).not.toContain("local-token");
  });
});

describe("deployment refresh domain", () => {
  it("refreshes typed deployment observation facts", async () => {
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

    const result = await refreshFormlessInstanceDeploymentObservation(
      {
        workspacePath: workspaceRoot,
      },
      operationDeps(tempDir, {
        fetch: deployFetch(requests, {
          deploymentStatus: {
            checkedAt: "2026-06-02T00:04:02.000Z",
            failedAt: "2026-06-02T00:04:01.000Z",
            failureCode: "provider-reconciliation-failed",
            latestDesiredState: deploymentDesiredStateRef(),
            state: "failed-current-version",
            targetId: "instance.primary",
          },
        }),
      }),
    );
    const desiredState = deploymentDesiredStateRef();
    const observation = capturedRequestJson<{
      input: {
        observedDesiredStateHash: string;
        observedFailureCode: string;
        observedStatus: string;
      };
      recordId: string;
    }>(requestByPath(requests, "/api/formless/program/operations/deployment-config/update"));

    expect(result).toMatchObject({
      deploymentStatus: {
        state: "failed-current-version",
      },
      observation: {
        desiredState,
        observedFailureCode: "provider-reconciliation-failed",
        observedStatus: "failed",
        targetId: "instance.primary",
      },
      selectedTarget: { alias: "instance.primary" },
      workspaceRoot,
    });
    expect(observation).toMatchObject({
      input: {
        observedDesiredStateHash: desiredState.hash,
        observedFailureCode: "provider-reconciliation-failed",
        observedStatus: "failed",
      },
      recordId: "instance.primary",
    });
  });
});

describe("deployment runtime domain", () => {
  it("does not deploy when Program source is unchanged", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];

    await writeWorkspaceConfig(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
    await writeWorkspaceMediaFile(workspaceRoot, Buffer.from([4, 5, 6]));
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
    expect(deployInputs).toEqual([]);
    expect(result).toMatchObject({
      mode: "apply",
      noop: true,
      syncPlan: { status: "up-to-date" },
    });
    expect(requests.map((request) => new URL(request.url).pathname)).not.toContain(
      "/api/formless/archive/restore",
    );
    expect(JSON.stringify(result)).not.toContain("manual-provider-token");
    expect(JSON.stringify(result)).not.toContain("local-token");
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
      runtimeRebuild: {
        reason: "runtime-extensions-configured",
        status: "applied",
      },
      syncPlan: { status: "up-to-date" },
    });
    expect(JSON.stringify(result)).not.toContain("manual-provider-token");
  });

  it("selects an explicit Program artifact for repeat push runtime builds", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];

    await mkdir(path.join(workspaceRoot, "runtime"), { recursive: true });
    await Promise.all(
      (["shared", "browser", "worker"] as const).map((target) =>
        writeFile(
          path.join(workspaceRoot, `runtime/${target}.ts`),
          `export { default } from ${JSON.stringify(new URL(`../program/default/${target}.ts`, import.meta.url).href)};\n`,
        ),
      ),
    );
    await writeWorkspaceConfig(workspaceRoot, {
      program: formlessProgramDefaultComposition,
      runtime: {
        composition: {
          shared: "runtime/shared.ts",
          browser: "runtime/browser.ts",
          worker: "runtime/worker.ts",
        },
      },
    });
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
    expect(JSON.parse(deployInput?.workspaceProgramRuntime ?? "{}")).toEqual({
      browserPublicSite: true,
      composition: {
        shared: "runtime/shared.ts",
        browser: "runtime/browser.ts",
        worker: "runtime/worker.ts",
      },
    });
    expect(result).toMatchObject({
      runtimeRebuild: {
        reason: "program-artifact-configured",
        status: "applied",
      },
    });
  });

  it("defers target-runtime validation for storage-compatible schema push dry-run", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const targetProgram = schemaSafePushProgram(false);
    const desiredProgram = schemaSafePushProgram(true);
    const targetArtifact = await materializeFormlessProgramSourceArtifact(
      composeAppSchema(targetProgram),
    );
    const desiredArtifact = await materializeFormlessProgramSourceArtifact(
      composeAppSchema(desiredProgram),
    );
    const targetSchema = parseFormlessProgramSchemaArtifact(targetArtifact.sourceSchema);
    const fetcher = sourceSyncFetch(requests, {
      controlPlaneSchema: targetSchema,
      controlPlaneSchemaProvenance: targetArtifact.schemaProvenance,
    });

    await writeWorkspaceConfig(workspaceRoot, {
      program: desiredProgram,
      runtime: {
        composition: {
          shared: DEFAULT_FORMLESS_PROGRAM_SHARED_RUNTIME_MODULE,
          browser: DEFAULT_FORMLESS_PROGRAM_BROWSER_RUNTIME_MODULE,
          worker: DEFAULT_FORMLESS_PROGRAM_WORKER_RUNTIME_MODULE,
        },
      },
    });
    await writeDeployStorageSnapshot(workspaceRoot, { program: desiredProgram });
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    const result = await pushFormlessInstanceWorkspace(
      {
        apply: false,
        force: false,

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
      schemaChange: {
        currentProgramProvenance: targetArtifact.schemaProvenance,
        desiredProgramProvenance: desiredArtifact.schemaProvenance,
        localArchiveValidation: "passed",
        runtimeReconciliation: "required",
        storageCompatibility: "storage-compatible",
        targetRuntimeValidation: "deferred",
      },
    });
    expect(
      requests.filter(
        (request) => new URL(request.url).pathname === "/api/formless/archive/restore",
      ),
    ).toEqual([]);
    expect(requests.every((request) => request.method === "GET")).toBe(true);
  });

  it.each([false, true])(
    "pushes target-owned schema drift without changing records, cursors, or media (force=%s)",
    async (force) => {
      const tempDir = await makeTempDir();
      const workspaceRoot = path.join(tempDir, "personal-sites");
      const requests: CapturedRequest[] = [];
      const deployInputs: DeployFormlessInstanceInput[] = [];
      let healthCheckCount = 0;
      const targetProgram = schemaSafePushProgram(false);
      const desiredProgram = schemaSafePushProgram(true);
      const targetArtifact = await materializeFormlessProgramSourceArtifact(
        composeAppSchema(targetProgram),
      );
      const desiredArtifact = await materializeFormlessProgramSourceArtifact(
        composeAppSchema(desiredProgram),
      );
      const targetSchema = parseFormlessProgramSchemaArtifact(targetArtifact.sourceSchema);
      const records = [...deployControlPlaneRecords(), ...programSiteMediaRecords()];
      const mediaBytes = Buffer.from([7, 8, 9]);
      const fetcher = sourceSyncFetch(requests, {
        controlPlaneRecords: records,
        controlPlaneSchema: targetSchema,
        controlPlaneSchemaProvenance: targetArtifact.schemaProvenance,
        programMediaBytes: mediaBytes,
        restoreResponses: [
          restorePlan(),
          { ok: true, report: { applied: true, summary: restoreSummary() } },
        ],
      });

      await writeWorkspaceConfig(workspaceRoot, {
        program: desiredProgram,
        runtime: {
          composition: {
            shared: DEFAULT_FORMLESS_PROGRAM_SHARED_RUNTIME_MODULE,
            browser: DEFAULT_FORMLESS_PROGRAM_BROWSER_RUNTIME_MODULE,
            worker: DEFAULT_FORMLESS_PROGRAM_WORKER_RUNTIME_MODULE,
          },
        },
      });
      await writeDeployStorageSnapshot(workspaceRoot, {
        program: desiredProgram,
        records,
      });
      await writeWorkspaceMediaFile(workspaceRoot, mediaBytes, {
        assetId: "program-cover.png",
        program: desiredProgram,
      });
      await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
      await writeFile(
        path.join(workspaceRoot, ".formless/instance.env"),
        "FORMLESS_ADMIN_TOKEN=local-token\n",
      );

      const result = await pushFormlessInstanceWorkspace(
        {
          apply: true,
          force,
          workspacePath: workspaceRoot,
        },
        deploymentApplyOperationDeps(tempDir, {
          deployInputs,
          env: { CLOUDFLARE_API_TOKEN: "manual-provider-token" },
          fetch: fetcher,
          healthCheck: {
            check: async (input) => ({
              cacheControl: "no-store",
              metadataUrl: new URL("/api/formless/deploy", `${input.url}/`).toString(),
              packageVersion: input.expectedVersion,
              runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
              schemaProvenance:
                healthCheckCount++ === 0
                  ? targetArtifact.schemaProvenance
                  : desiredArtifact.schemaProvenance,
              storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
              url: input.url,
              version: input.expectedVersion,
            }),
          },
        }),
      );
      const restoreRequests = requests.filter(
        (request) => new URL(request.url).pathname === "/api/formless/archive/restore",
      );
      const restoreBody = capturedRequestJson<{
        archive: {
          media: { objects: Array<{ archivePath: string; storageKey: string }> };
          program: {
            schemaProvenance: { sourceSchemaHash: string };
            snapshot: { records: StoredRecord[]; sourceCursor: number };
          };
        };
        mediaFiles: Array<{ archivePath: string; bytesBase64: string }>;
      }>(restoreRequests.at(-1)!);
      const backup = JSON.parse(await readFile(result.backup!.archivePath, "utf8")) as {
        media: { objects: Array<{ archivePath: string; storageKey: string }> };
        program: {
          schemaProvenance: { sourceSchemaHash: string };
          snapshot: { records: StoredRecord[]; sourceCursor: number };
        };
      };
      const comparableRecords = (source: readonly StoredRecord[]) =>
        source
          .map((record) => ({
            entity: record.entity,
            id: record.id,
            values: record.values,
          }))
          .sort((left, right) =>
            `${left.entity}:${left.id}`.localeCompare(`${right.entity}:${right.id}`),
          );

      expect(result.forcedRecovery).toBeUndefined();
      expect(result.syncPlan).toMatchObject({
        status: "changes",
        source: { programProvenance: desiredArtifact.schemaProvenance },
        target: { programProvenance: targetArtifact.schemaProvenance },
      });
      expect(result.schemaChange).toEqual({
        currentProgramProvenance: targetArtifact.schemaProvenance,
        desiredProgramProvenance: desiredArtifact.schemaProvenance,
        localArchiveValidation: "passed",
        runtimeReconciliation: "required",
        storageCompatibility: "storage-compatible",
        targetRuntimeValidation: "passed",
      });
      expect(healthCheckCount).toBe(2);
      expect(deployInputs).toHaveLength(1);
      expect(restoreRequests).toHaveLength(2);
      expect(restoreBody.archive.program.schemaProvenance).toEqual(
        desiredArtifact.schemaProvenance,
      );
      expect(comparableRecords(restoreBody.archive.program.snapshot.records)).toEqual(
        comparableRecords(records),
      );
      expect(restoreBody.archive.program.snapshot.sourceCursor).toBe(records.length);
      expect(restoreBody.archive.media.objects).toEqual([
        expect.objectContaining({
          archivePath: "media/images/program-cover.png",
          storageKey: "media/images/program-cover.png",
        }),
      ]);
      expect(restoreBody.mediaFiles).toEqual([
        expect.objectContaining({
          archivePath: "media/images/program-cover.png",
        }),
      ]);
      expect(backup.program.schemaProvenance).toEqual(targetArtifact.schemaProvenance);
      expect(comparableRecords(backup.program.snapshot.records)).toEqual(
        comparableRecords(records),
      );
      expect(backup.program.snapshot.sourceCursor).toBe(records.length);
      expect(backup.media.objects).toEqual(restoreBody.archive.media.objects);
    },
  );

  it("requires a fresh target read and backup after guarded apply detects concurrent change", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const targetProgram = schemaSafePushProgram(false);
    const desiredProgram = schemaSafePushProgram(true);
    const targetArtifact = await materializeFormlessProgramSourceArtifact(
      composeAppSchema(targetProgram),
    );
    const targetSchema = parseFormlessProgramSchemaArtifact(targetArtifact.sourceSchema);
    const desiredRecords = [...deployControlPlaneRecords(), ...programSiteMediaRecords()];
    const initialMediaBytes = new Uint8Array([7, 8, 9]);
    const concurrentMediaBytes = new Uint8Array([10, 11, 12]);
    const concurrentRecord = programNativeRecords()[0]!;
    let remoteRecords = [...desiredRecords];
    let remoteMediaBytes = initialMediaBytes;
    let mutateBeforeFirstApply = true;
    const fetcher = sourceSyncFetch(requests, {
      controlPlaneSchema: targetSchema,
      controlPlaneSchemaProvenance: targetArtifact.schemaProvenance,
      programMediaBytes: () => remoteMediaBytes,
      restoreResponse: ({ body, request }) => {
        const dryRun = body.archive?.restorePolicy?.dryRun !== false;

        if (dryRun) {
          if (mutateBeforeFirstApply) {
            remoteRecords = [...remoteRecords, concurrentRecord];
            remoteMediaBytes = concurrentMediaBytes;
            mutateBeforeFirstApply = false;
          }

          return restorePlan();
        }

        const currentSourceCursor = remoteRecords.length;
        if (body.expectedSourceCursor !== currentSourceCursor) {
          return Response.json(
            {
              errors: [
                {
                  code: "target-source-conflict",
                  currentSourceCursor,
                  expectedSourceCursor: body.expectedSourceCursor,
                  message: "Target changed after backup.",
                },
              ],
              ok: false,
            },
            { status: 409 },
          );
        }

        const restore = capturedRequestJson<{
          archive: { program: { snapshot: { records: StoredRecord[] } } };
          mediaFiles: Array<{ bytesBase64: string }>;
        }>(request);
        remoteRecords = restore.archive.program.snapshot.records;
        remoteMediaBytes = new Uint8Array(
          Buffer.from(restore.mediaFiles[0]!.bytesBase64, "base64"),
        );

        return { ok: true, report: { applied: true, summary: restoreSummary() } };
      },
      snapshotResponseFactory: () => controlPlaneSnapshot(remoteRecords, targetSchema),
    });

    await writeWorkspaceConfig(workspaceRoot, {
      program: desiredProgram,
      runtime: {
        composition: {
          shared: DEFAULT_FORMLESS_PROGRAM_SHARED_RUNTIME_MODULE,
          browser: DEFAULT_FORMLESS_PROGRAM_BROWSER_RUNTIME_MODULE,
          worker: DEFAULT_FORMLESS_PROGRAM_WORKER_RUNTIME_MODULE,
        },
      },
    });
    await writeDeployStorageSnapshot(workspaceRoot, {
      program: desiredProgram,
      records: desiredRecords,
    });
    await writeWorkspaceMediaFile(workspaceRoot, initialMediaBytes, {
      assetId: "program-cover.png",
      program: desiredProgram,
    });
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );
    const dependencies = deploymentApplyOperationDeps(tempDir, {
      deployInputs,
      env: { CLOUDFLARE_API_TOKEN: "manual-provider-token" },
      fetch: fetcher,
    });
    let clock = Date.parse("2026-08-03T00:00:00.000Z");
    dependencies.now = () => new Date(clock++).toISOString();

    let conflict: unknown;
    try {
      await pushFormlessInstanceWorkspace(
        { apply: true, force: false, workspacePath: workspaceRoot },
        dependencies,
      );
    } catch (error) {
      conflict = error;
    }

    expect(conflict).toBeInstanceOf(WorkspacePushRemoteRestoreError);
    expect(conflict).toMatchObject({
      apply: true,
      remote: {
        errors: [
          {
            code: "target-source-conflict",
            currentSourceCursor: desiredRecords.length + 1,
            expectedSourceCursor: desiredRecords.length,
          },
        ],
        ok: false,
      },
    });
    expect(remoteRecords.map((record) => record.id)).toContain(concurrentRecord.id);
    expect(remoteMediaBytes).toEqual(concurrentMediaBytes);
    expect(
      requests.filter(
        (request) => new URL(request.url).pathname === "/api/formless/program/snapshot",
      ),
    ).toHaveLength(2);

    const retry = await pushFormlessInstanceWorkspace(
      { apply: true, force: false, workspacePath: workspaceRoot },
      dependencies,
    );
    const applyRequests = requests.filter((request) => {
      if (new URL(request.url).pathname !== "/api/formless/archive/restore") return false;
      return (
        capturedRequestJson<{ archive: { restorePolicy: { dryRun: boolean } } }>(request).archive
          .restorePolicy.dryRun === false
      );
    });
    const expectedCursors = applyRequests.map(
      (request) =>
        capturedRequestJson<{ expectedSourceCursor: number }>(request).expectedSourceCursor,
    );
    const retryBackup = JSON.parse(await readFile(retry.backup!.archivePath, "utf8")) as {
      program: { snapshot: { records: StoredRecord[] } };
    };
    const retryBackupMedia = await readFile(
      path.join(path.dirname(retry.backup!.archivePath), "media/images/program-cover.png"),
    );

    expect(
      requests.filter(
        (request) => new URL(request.url).pathname === "/api/formless/program/snapshot",
      ),
    ).toHaveLength(4);
    expect(expectedCursors).toEqual([desiredRecords.length, desiredRecords.length + 1]);
    expect(retryBackup.program.snapshot.records.map((record) => record.id)).toContain(
      concurrentRecord.id,
    );
    expect(new Uint8Array(retryBackupMedia)).toEqual(concurrentMediaBytes);
    expect(remoteRecords.map((record) => record.id)).not.toContain(concurrentRecord.id);
    expect(remoteMediaBytes).toEqual(initialMediaBytes);
  });

  it("backs up remote data drift before reconciling the workspace source", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const remoteOnlyRecord = programNativeRecords()[0]!;
    const remoteRecords = [...deployControlPlaneRecords(), remoteOnlyRecord];
    const fetcher = sourceSyncFetch(requests, {
      controlPlaneRecords: remoteRecords,
      restoreResponses: [
        restorePlan(),
        { ok: true, report: { applied: true, summary: restoreSummary() } },
      ],
    });

    await writeWorkspaceConfig(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    const result = await pushFormlessInstanceWorkspace(
      { apply: true, force: false, workspacePath: workspaceRoot },
      deploymentApplyOperationDeps(tempDir, {
        deployInputs,
        env: { CLOUDFLARE_API_TOKEN: "manual-provider-token" },
        fetch: fetcher,
      }),
    );
    const backup = JSON.parse(await readFile(result.backup!.archivePath, "utf8")) as {
      program: { snapshot: { records: StoredRecord[] } };
    };
    const restoreRequests = requests.filter(
      (request) => new URL(request.url).pathname === "/api/formless/archive/restore",
    );
    const applied = capturedRequestJson<{
      archive: { program: { snapshot: { records: StoredRecord[] } } };
    }>(restoreRequests.at(-1)!);

    expect(result.syncPlan.changedRecords).toContain(
      `${remoteOnlyRecord.entity}:${remoteOnlyRecord.id}`,
    );
    expect(backup.program.snapshot.records.map((record) => record.id)).toContain(
      remoteOnlyRecord.id,
    );
    expect(applied.archive.program.snapshot.records.map((record) => record.id)).not.toContain(
      remoteOnlyRecord.id,
    );
    expect(deployInputs).toHaveLength(1);
    expect(restoreRequests).toHaveLength(2);
  });

  it("rejects destructive field removal before backup or remote mutation", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const targetProgram = schemaFieldRemovalProgram(true);
    const desiredProgram = schemaFieldRemovalProgram(false);
    const targetArtifact = await materializeFormlessProgramSourceArtifact(
      composeAppSchema(targetProgram),
    );
    const targetSchema = parseFormlessProgramSchemaArtifact(targetArtifact.sourceSchema);
    const fetcher = sourceSyncFetch(requests, {
      controlPlaneSchema: targetSchema,
      controlPlaneSchemaProvenance: targetArtifact.schemaProvenance,
    });

    await writeWorkspaceConfig(workspaceRoot, {
      program: desiredProgram,
      runtime: {
        composition: {
          shared: DEFAULT_FORMLESS_PROGRAM_SHARED_RUNTIME_MODULE,
          browser: DEFAULT_FORMLESS_PROGRAM_BROWSER_RUNTIME_MODULE,
          worker: DEFAULT_FORMLESS_PROGRAM_WORKER_RUNTIME_MODULE,
        },
      },
    });
    await writeDeployStorageSnapshot(workspaceRoot, { program: desiredProgram });
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    let thrown: unknown;
    try {
      await pushFormlessInstanceWorkspace(
        { apply: true, force: false, workspacePath: workspaceRoot },
        deploymentApplyOperationDeps(tempDir, {
          deployInputs,
          env: { CLOUDFLARE_API_TOKEN: "manual-provider-token" },
          fetch: fetcher,
        }),
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(WorkspacePushSchemaCompatibilityError);
    expect(thrown).toMatchObject({
      decision: {
        issues: [
          expect.objectContaining({
            code: "field-set-changed",
            message: 'entity "schema-safe-record" stored fields were added or removed',
          }),
        ],
        status: "migration-required",
      },
    });
    expect(deployInputs).toEqual([]);
    expect(
      requests.filter(
        (request) => new URL(request.url).pathname === "/api/formless/archive/restore",
      ),
    ).toEqual([]);
    await expect(stat(path.join(workspaceRoot, ".formless/backups"))).rejects.toThrow();
  });

  it("forces unreadable target recovery through desired-runtime validation", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const fetcher = sourceSyncFetch(requests, {
      restoreResponses: [
        restorePlan(),
        { ok: true, report: { applied: true, summary: restoreSummary() } },
      ],
      snapshotResponse: {},
    });

    await writeWorkspaceConfig(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    const result = await pushFormlessInstanceWorkspace(
      { apply: true, force: true, workspacePath: workspaceRoot },
      deploymentApplyOperationDeps(tempDir, {
        deployInputs,
        env: { CLOUDFLARE_API_TOKEN: "manual-provider-token" },
        fetch: fetcher,
      }),
    );
    const restoreRequests = requests.filter(
      (request) => new URL(request.url).pathname === "/api/formless/archive/restore",
    );
    const restorePolicies = restoreRequests.map(
      (request) =>
        capturedRequestJson<{ archive: { restorePolicy: { dryRun: boolean } } }>(request).archive
          .restorePolicy.dryRun,
    );

    expect(result).toMatchObject({
      forcedRecovery: {
        remoteReadFailureType: "validation",
        status: "applied",
      },
    });
    expect(result.backup).toBeUndefined();
    expect(deployInputs).toHaveLength(1);
    expect(restorePolicies).toEqual([true, false]);
  });

  it("stops at backup failure before provider or restore mutation", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const remoteRecords = [...deployControlPlaneRecords(), programNativeRecords()[0]!];
    const fetcher = sourceSyncFetch(requests, { controlPlaneRecords: remoteRecords });

    await writeWorkspaceConfig(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );
    await writeFile(path.join(workspaceRoot, ".formless/backups"), "blocked\n");

    await expect(
      pushFormlessInstanceWorkspace(
        { apply: true, force: false, workspacePath: workspaceRoot },
        deploymentApplyOperationDeps(tempDir, {
          deployInputs,
          env: { CLOUDFLARE_API_TOKEN: "manual-provider-token" },
          fetch: fetcher,
        }),
      ),
    ).rejects.toThrow();

    expect(deployInputs).toEqual([]);
    expect(
      requests.filter(
        (request) => new URL(request.url).pathname === "/api/formless/archive/restore",
      ),
    ).toEqual([]);
    await expect(readFile(path.join(workspaceRoot, ".formless/backups"), "utf8")).resolves.toBe(
      "blocked\n",
    );
  });

  it("keeps the durable backup when desired-runtime restore dry-run fails", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const remoteRecords = [...deployControlPlaneRecords(), programNativeRecords()[0]!];
    const fetcher = sourceSyncFetch(requests, {
      controlPlaneRecords: remoteRecords,
      restoreResponses: [
        {
          errors: [{ code: "invalid-record", message: "desired runtime rejected archive" }],
          ok: false,
        },
      ],
    });

    await writeWorkspaceConfig(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    let thrown: unknown;
    try {
      await pushFormlessInstanceWorkspace(
        { apply: true, force: false, workspacePath: workspaceRoot },
        deploymentApplyOperationDeps(tempDir, {
          deployInputs,
          env: { CLOUDFLARE_API_TOKEN: "manual-provider-token" },
          fetch: fetcher,
        }),
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(WorkspacePushRemoteRestoreError);
    expect(thrown).toMatchObject({
      apply: false,
      remote: {
        errors: [expect.objectContaining({ message: "desired runtime rejected archive" })],
        ok: false,
      },
    });
    const backups = await readdir(path.join(workspaceRoot, ".formless/backups"));
    expect(backups).toHaveLength(1);
    await expect(
      stat(path.join(workspaceRoot, ".formless/backups", backups[0]!, "archive.json")),
    ).resolves.toMatchObject({ isFile: expect.any(Function) });
    expect(deployInputs).toHaveLength(1);
    const restoreRequests = requests.filter(
      (request) => new URL(request.url).pathname === "/api/formless/archive/restore",
    );
    expect(restoreRequests).toHaveLength(1);
    expect(
      capturedRequestJson<{ archive: { restorePolicy: { dryRun: boolean } } }>(restoreRequests[0]!)
        .archive.restorePolicy.dryRun,
    ).toBe(true);
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
        recordCount: 4,
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
        observedFailureCode: string;
        observedStatus: string;
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
        observedFailureCode: "provider-reconciliation-failed",
        observedStatus: "failed",
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

type WorkspaceDomainTestApplyDependencyKey = Exclude<
  keyof PushFormlessInstanceWorkspaceDependencies,
  keyof PushFormlessInstanceWorkspaceDryRunDependencies
>;

type WorkspaceDomainTestDependencies = PullFormlessInstanceWorkspaceDependencies &
  PushFormlessInstanceWorkspaceDryRunDependencies &
  Partial<Pick<PushFormlessInstanceWorkspaceDependencies, WorkspaceDomainTestApplyDependencyKey>>;

function operationDeps(
  cwd: string,
  options: {
    accountDiscovery?: PushFormlessInstanceWorkspaceDryRunDependencies["accountDiscovery"];
    env?: NodeJS.ProcessEnv;
    fetch?: typeof fetch;
    packageVersion?: string;
  } = {},
): WorkspaceDomainTestDependencies {
  return {
    accountDiscovery: options.accountDiscovery ?? { listAccounts: async () => [] },
    cwd,
    ...(options.env === undefined ? {} : { env: options.env }),
    fetch: options.fetch ?? fetch,
    now: timestampSequence("2026-06-02T00:07:00.000Z", "2026-06-02T00:07:01.000Z"),
    packageVersion: options.packageVersion ?? packageJson.version,
  };
}

function pushApplyOperationDeps(
  cwd: string,
  options: {
    accountDiscovery?: PushFormlessInstanceWorkspaceDependencies["accountDiscovery"];
    env?: NodeJS.ProcessEnv;
    fetch?: typeof fetch;
  } = {},
): PushFormlessInstanceWorkspaceDependencies {
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
  dependencies: WorkspaceDomainTestDependencies,
  guardedKeys: readonly string[],
): PushFormlessInstanceWorkspaceDryRunDependencies {
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
    healthCheck?: PushFormlessInstanceWorkspaceDependencies["healthCheck"];
    packageRoot?: string;
  } = {},
): PushFormlessInstanceWorkspaceDependencies {
  let deployedProgramProvenance = formlessProgramSchemaProvenance;

  return {
    accountDiscovery: {
      listAccounts: async () => [{ id: "account-123", workersDevSubdomain: "dpeek" }],
    },
    cwd,
    deploymentAdapter: {
      deploy: async (input) => {
        options.deployInputs?.push(input);
        if (input.workspaceProgramArtifact === undefined) {
          throw new Error("Push deployment requires a Program artifact.");
        }
        deployedProgramProvenance = (
          await parseFormlessProgramArtifact(JSON.parse(input.workspaceProgramArtifact) as unknown)
        ).schemaProvenance;

        return { resourceEvidence: [], url: input.plan.expectedUrl.url };
      },
    },
    ...(options.env === undefined ? {} : { env: options.env }),
    fetch: options.fetch ?? fetch,
    healthCheck: options.healthCheck ?? {
      check: async (input) => ({
        cacheControl: "no-store",
        metadataUrl: new URL("/api/formless/deploy", `${input.url}/`).toString(),
        packageVersion: input.expectedVersion,
        runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
        schemaProvenance: deployedProgramProvenance,
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
    runtime?: Parameters<typeof resolveFormlessConfig>[0]["runtime"];
  } = {},
) {
  const manifest = {
    version: 1 as const,
    kind: "formless-instance-workspace" as const,
    name: "personal-sites",
    local: { stateRoot: ".formless/local", secretStateRoot: ".formless" },
    ...(options.program === undefined ? {} : { program: options.program }),
    ...(options.runtime === undefined ? {} : { runtime: options.runtime }),
  };

  await mkdir(workspaceRoot, { recursive: true });
  await writeFile(
    path.join(workspaceRoot, FORMLESS_CONFIG_FILE),
    formatTestFormlessConfigModule(manifest),
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
    ...(options.program === undefined
      ? {}
      : {
          runtime: {
            composition: {
              shared: DEFAULT_FORMLESS_PROGRAM_SHARED_RUNTIME_MODULE,
              browser: DEFAULT_FORMLESS_PROGRAM_BROWSER_RUNTIME_MODULE,
              worker: DEFAULT_FORMLESS_PROGRAM_WORKER_RUNTIME_MODULE,
            },
          },
        }),
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
  bytes: Uint8Array,
  options: {
    assetId?: string;
    program?: Parameters<typeof resolveFormlessConfig>[0]["program"];
  } = {},
) {
  const manifest = resolveFormlessConfig({
    name: "personal-sites",
    ...(options.program === undefined
      ? {}
      : {
          program: options.program,
          runtime: {
            composition: {
              shared: DEFAULT_FORMLESS_PROGRAM_SHARED_RUNTIME_MODULE,
              browser: DEFAULT_FORMLESS_PROGRAM_BROWSER_RUNTIME_MODULE,
              worker: DEFAULT_FORMLESS_PROGRAM_WORKER_RUNTIME_MODULE,
            },
          },
        }),
  });
  const assetId = options.assetId ?? "cover.png";
  const storageKey = `media/images/${assetId}`;
  const archivePath = `media/images/${assetId}`;
  const deliveryHref = `/api/formless/media/${storageKey}`;
  const object = {
    archivePath,
    asset: {
      byteSize: bytes.byteLength,
      contentType: "image/png",
      deliveryHref,
      id: assetId,
      kind: "image",
      label: assetId,
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

async function rewriteWorkspaceMediaManifestAsVersion1(workspaceRoot: string) {
  const mediaRoot = path.join(workspaceRoot, "state/media");
  const manifestPath = path.join(mediaRoot, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    kind: string;
    objects: Array<Record<string, unknown> & { archivePath: string; payloadPath: string }>;
  };
  const payloads = await Promise.all(
    manifest.objects.map(async (object) => ({
      archivePath: object.archivePath,
      bytes: await readFile(path.join(mediaRoot, object.payloadPath)),
      object: Object.fromEntries(Object.entries(object).filter(([key]) => key !== "payloadPath")),
    })),
  );

  await rm(mediaRoot, { force: true, recursive: true });

  for (const payload of payloads) {
    const filePath = path.join(mediaRoot, payload.archivePath);

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, payload.bytes);
  }

  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        kind: manifest.kind,
        version: WORKSPACE_MEDIA_LEGACY_MANIFEST_VERSION,
        objects: payloads.map((payload) => payload.object),
      },
      null,
      2,
    )}\n`,
  );
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
    controlPlaneRecords?: StoredRecord[];
    controlPlaneSchema?: AppSchema;
    controlPlaneSchemaProvenance?: FormlessProgramArtifact["schemaProvenance"];
    programDocument?: {
      asset: DocumentMediaAsset;
      bytes: Uint8Array;
    };
    programMediaBytes?: Uint8Array | (() => Uint8Array | undefined);
    restoreResponse?: (input: {
      body: {
        archive?: { restorePolicy?: { dryRun?: boolean } };
        expectedSourceCursor?: number;
      };
      request: CapturedRequest;
    }) => Response | Record<string, unknown>;
    restoreResponses?: unknown[];
    snapshotResponse?: unknown;
    snapshotResponseFactory?: () => unknown;
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
        packageVersion: packageJson.version,
        runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
        schemaProvenance: formlessProgramSchemaProvenance,
        storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
        version: packageJson.version,
      });
    }

    if (parsedUrl.pathname === "/api/formless/program/bootstrap") {
      return Response.json({
        cursor: 1,
        records: options.controlPlaneRecords ?? deployControlPlaneRecords(),
        schema: {},
      });
    }

    if (parsedUrl.pathname === "/api/formless/program/operations/deployment-config/update") {
      const body = parseCapturedBody<{
        input: Record<string, unknown>;
        recordId: string;
      }>(init);

      return Response.json({
        invocation: {},
        output: {
          affectedChangeIds: [],
          changes: [],
          cursor: 2,
          record: {
            createdAt: "2026-05-26T00:00:00.000Z",
            entity: "deployment-config",
            id: body.recordId,
            updatedAt: "2026-05-26T00:00:00.000Z",
            values: {
              targetId: body.recordId,
              enabled: true,
              providerFamily: "cloudflare",
              targetUrl: "https://personal.dpeek.workers.dev",
              ...body.input,
            },
          },
          type: "update",
        },
        status: "committed",
      });
    }

    if (parsedUrl.pathname === "/api/formless/program/snapshot") {
      const schema = options.controlPlaneSchema ?? formlessProgramSchema;
      const schemaProvenance =
        options.controlPlaneSchemaProvenance ?? formlessProgramSchemaProvenance;

      return Response.json(
        options.snapshotResponseFactory?.() ??
          options.snapshotResponse ??
          controlPlaneSnapshot(options.controlPlaneRecords ?? deployControlPlaneRecords(), schema),
        {
          headers: {
            [FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER]: schemaProvenance.sourceSchemaHash,
          },
        },
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

    if (
      parsedUrl.pathname === "/api/formless/media/media/images/cover.png" ||
      parsedUrl.pathname === "/api/formless/media/media/images/program-cover.png"
    ) {
      const mediaBytes =
        typeof options.programMediaBytes === "function"
          ? options.programMediaBytes()
          : options.programMediaBytes;

      if (mediaBytes) {
        return new Response(Buffer.from(mediaBytes), {
          headers: { "content-type": "image/png" },
        });
      }
    }

    if (parsedUrl.pathname === "/api/formless/archive/restore" && method === "POST") {
      if (options.restoreResponse) {
        const body = parseCapturedBody<{
          archive?: { restorePolicy?: { dryRun?: boolean } };
          expectedSourceCursor?: number;
        }>(init);
        const response = options.restoreResponse({ body, request: requests.at(-1)! });

        return response instanceof Response ? response : Response.json(response);
      }

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
        target: { targetId: desiredState.targetId },
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
        target: { targetId: desiredState.targetId },
      });
    }

    return Response.json({ error: "not found" }, { status: 404 });
  };
}

function deployFetch(
  requests: CapturedRequest[],
  options: {
    controlPlaneRecords?: StoredRecord[];
    controlPlaneSchema?: AppSchema;
    controlPlaneSchemaProvenance?: FormlessProgramArtifact["schemaProvenance"];
    deploymentStatus?: Record<string, unknown>;
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
        packageVersion: packageJson.version,
        runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
        schemaProvenance: formlessProgramSchemaProvenance,
        storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
        version: packageJson.version,
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
      const schema = options.controlPlaneSchema ?? formlessProgramSchema;
      const schemaProvenance =
        options.controlPlaneSchemaProvenance ?? formlessProgramSchemaProvenance;

      return Response.json(
        controlPlaneSnapshot(options.controlPlaneRecords ?? deployControlPlaneRecords(), schema),
        {
          headers: {
            [FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER]: schemaProvenance.sourceSchemaHash,
          },
        },
      );
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
        target: { targetId: desiredState.targetId },
      });
    }

    if (parsedUrl.pathname === "/api/formless/deployments/status") {
      const desiredState = deploymentDesiredStateRef();

      return Response.json({
        status: options.deploymentStatus ?? {
          checkedAt: "2026-06-02T00:04:02.000Z",
          latestDesiredState: desiredState,
          state: "pending-changes",
          targetId: desiredState.targetId,
        },
        target: { targetId: desiredState.targetId },
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
  const now = "2026-05-26T00:00:00.000Z";

  return [
    {
      createdAt: now,
      updatedAt: now,
      entity: "route",
      id: "route:instance:admin",
      values: {
        enabled: true,
        kind: "mount",
        matchPath: "/",
        surface: "admin",
        targetProfile: "instance",
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
        targetUrl: options.targetUrl ?? "https://personal.dpeek.workers.dev",
        ...(options.credentialRef === undefined ? {} : { credentialRef: options.credentialRef }),
        ...(workerName === null ? {} : { workerName }),
      },
    },
  ];
}

function programNativeRecords(): StoredRecord[] {
  const createdAt = "2026-05-01T00:00:00.000Z";

  return [
    {
      createdAt,
      updatedAt: createdAt,
      entity: "task",
      id: "task:program-native",
      values: {
        done: false,
        priority: "normal",
        title: "Program-native task",
      },
    },
    ...programInquiryRecords(),
  ];
}

function programInquiryRecords(): StoredRecord[] {
  const createdAt = "2026-05-26T00:00:00.000Z";

  return [
    {
      createdAt,
      entity: "contact-message",
      id: "contact-message:program-native",
      updatedAt: createdAt,
      values: {
        name: "Ada",
        email: "ada@example.com",
        message: "Program Native",
      },
    },
    {
      createdAt,
      deletedAt: "2026-05-27T00:00:00.000Z",
      entity: "contact-message",
      id: "contact-message:program-native-deleted",
      updatedAt: "2026-05-27T00:00:00.000Z",
      values: {
        name: "Grace",
        email: "grace@example.com",
        message: "Program Native Deleted",
      },
    },
  ];
}

function deployControlPlaneRecordsWithProviderObservation(
  options: Parameters<typeof deployControlPlaneRecords>[0] = {},
): StoredRecord[] {
  return deployControlPlaneRecords(options);
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

function restorePlan() {
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
    {
      id: "site:program-media",
      entity: "site",
      values: { key: "program-media", label: "Program media" },
      createdAt: "2026-05-05T00:00:01.000Z",
      updatedAt: "2026-05-05T00:00:01.000Z",
    },
    block("block:program-cover", "2026-05-05T00:00:02.000Z", {
      site: "site:program-media",
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
  const storageKey = `media/documents/${id}`;

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
