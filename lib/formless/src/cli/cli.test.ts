import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import packageJson from "../../package.json";
import {
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  INSTANCE_ARCHIVE_MANIFEST_FILE,
  type ArchiveMediaObject,
  type InstanceArchive,
} from "../program/archive.ts";
import {
  writeInstanceArchiveDirectory,
  type ArchiveDiskMediaFile,
} from "../program/archive-node.ts";
import type {
  CloudflareDnsRecord,
  CloudflareDomainClient,
  CloudflareWorkerDomain,
  CloudflareWorkerRoute,
  CloudflareZone,
} from "./cloudflare-domain-client.ts";
import {
  FORMLESS_RUNTIME_PROTOCOL_VERSION,
  FORMLESS_STORAGE_MIGRATION_SET_ID,
} from "../shared/deploy-metadata.ts";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import { formatInstanceControlPlaneBoundaryEntityName } from "@dpeek/formless-instance-control-plane";
import { formlessProgramSchema, formlessProgramSchemaProvenance } from "../program/runtime.ts";
import {
  FORMLESS_PROGRAM_SCHEMA_KEY,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
} from "../program/target.ts";
import { SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY } from "../shared/workspace-runtime-extensions.ts";
import {
  LOCAL_SESSION_BOOTSTRAP_API_PATH,
  LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
} from "@dpeek/formless-gateway";
import {
  FORMLESS_CONFIG_FILE,
  WORKSPACE_OPERATION_KINDS,
  resolveFormlessConfig,
  type ResolvedFormlessConfig,
  workspaceOperationDefinitionForKind,
} from "@dpeek/formless-workspace";
import {
  formatFormlessConfigModule,
  readWorkspaceConfig,
} from "./instance-workspace-foundation.ts";
import { formatTestFormlessConfigModule } from "./instance-workspace-config-test.ts";
import {
  FORMLESS_CLI_WORKSPACE_OPERATION_BINDINGS,
  formlessCliUsage,
  normalizeSourceUrl,
  parseFormlessCliArgs,
  formlessCliWorkspaceOperationCommandNameForKind,
} from "./cli-command.ts";
import {
  instanceWorkspaceInstanceStatePath,
  readInstanceWorkspaceProgramStorageSnapshot,
  writeInstanceWorkspaceProgramStorageSnapshot,
} from "../program/workspace.ts";
import {
  FORMLESS_ALCHEMY_APP_NAME,
  discoverFormlessInstanceWorkspaceRoot,
  initFormlessInstanceWorkspace,
  planFormlessInstanceDeployment,
  resolveFormlessInstanceWorkspaceRoot,
  restoreInstanceArchive,
  runFormlessCli,
  workspaceDomainProviderAlchemyRuntime,
  type CheckFormlessInstanceDeployMetadataInput,
  type CreateFormlessInstanceOwnerSetupCapabilityInput,
  type DeployFormlessInstanceInput,
  type DestroyFormlessInstanceInput,
  type DestroyFormlessInstanceResult,
  type DomainProviderAlchemyRuntime,
  type FormlessCliCloudflareOAuthAccountSelectionInput,
  type FormlessCliDependencies,
  type FormlessCliRunCommandOptions,
  type FormlessInstanceWorkspaceProviderContext,
  type WriteFormlessInstanceStateInput,
} from "./cli.ts";
import {
  FORMLESS_CLOUDFLARE_OAUTH_DEPLOY_SCOPES,
  createFormlessCloudflareOAuthCredential,
  writeFormlessCloudflareOAuthCredential,
  type FormlessCloudflareOAuthAccount,
  type FormlessCloudflareOAuthAdapter,
  type FormlessCloudflareOAuthTokenSet,
} from "./cloudflare-oauth.ts";

const tempDirs: string[] = [];
const setupToken = "abcDEF0123456789_-abcDEF0123456789_-";

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

describe("Formless CLI", () => {
  it("keeps top-level help aliases and usage output stable", async () => {
    const usage = [
      "Usage: formless <command>",
      "",
      "Commands:",
      "  dev [--workspace <path>] [--open] [--reset]",
      "                                      Run local workspace and print browser session URL",
      "  pull [--workspace <path>] [--target <alias>] [--dry-run]",
      "                                      Workspace source pull",
      "  push [--workspace <path>] [--target <alias>] [--dry-run] [--force]",
      "                                      Workspace source push",
      "  destroy [--workspace <path>] [--target <alias>] --confirm <workerName>",
      "  owner setup [--workspace <path>] [--target <alias>]",
      "       [--open] [--admin-token <token>]",
      "  token <adopt|rotate> [--workspace <path>] [--target <alias>]",
      "       [--admin-token <token>]",
    ].join("\n");
    const logs: string[] = [];

    expect(formlessCliUsage()).toBe(usage);
    expect(parseFormlessCliArgs([])).toEqual({ kind: "help" });
    expect(parseFormlessCliArgs(["help"])).toEqual({ kind: "help" });
    expect(parseFormlessCliArgs(["--help"])).toEqual({ kind: "help" });
    expect(parseFormlessCliArgs(["-h"])).toEqual({ kind: "help" });

    await runFormlessCli(["help"], cliDeps(process.cwd(), { logs }));

    expect(logs).toEqual([usage]);
  });

  it("owns public workspace operation command bindings in Formless CLI", () => {
    expect(
      FORMLESS_CLI_WORKSPACE_OPERATION_BINDINGS.map((binding) => ({
        command: binding.command,
        dispatchKind: binding.dispatchKind,
        operationKind: binding.operationKind,
        optionFields: binding.options.map((option) => option.fieldKey),
        optionSyntax: binding.options.map((option) => option.syntax),
        terminalDescription: binding.terminalDescription,
        terminalLabel: binding.terminalLabel,
      })),
    ).toEqual([
      {
        command: "formless pull",
        dispatchKind: "workspacePull",
        operationKind: "pull",
        optionFields: ["workspacePath", "targetAlias", "dryRun"],
        optionSyntax: ["[--workspace <path>]", "[--target <alias>]", "[--dry-run]"],
        terminalDescription: "Workspace source pull",
        terminalLabel: "pull",
      },
      {
        command: "formless push",
        dispatchKind: "workspacePush",
        operationKind: "push",
        optionFields: ["workspacePath", "targetAlias", "dryRun", "force"],
        optionSyntax: ["[--workspace <path>]", "[--target <alias>]", "[--dry-run]", "[--force]"],
        terminalDescription: "Workspace source push",
        terminalLabel: "push",
      },
    ]);
    expect(formlessCliWorkspaceOperationCommandNameForKind("pull")).toBe("formless pull");
    expect(formlessCliWorkspaceOperationCommandNameForKind("push")).toBe("formless push");
    expect(
      FORMLESS_CLI_WORKSPACE_OPERATION_BINDINGS.map((binding) => binding.operationKind),
    ).toEqual(["pull", "push"]);
    expect(
      FORMLESS_CLI_WORKSPACE_OPERATION_BINDINGS.every((binding) =>
        WORKSPACE_OPERATION_KINDS.includes(binding.operationKind),
      ),
    ).toBe(true);

    for (const binding of FORMLESS_CLI_WORKSPACE_OPERATION_BINDINGS) {
      const definition = workspaceOperationDefinitionForKind(binding.operationKind);
      const definitionFieldKeys = new Set(definition.input.fields.map((field) => field.key));

      expect(binding.options.map((option) => option.fieldKey)).toEqual(
        binding.operationKind === "push"
          ? ["workspacePath", "targetAlias", "dryRun", "force"]
          : ["workspacePath", "targetAlias", "dryRun"],
      );
      expect(binding.options.every((option) => definitionFieldKeys.has(option.fieldKey))).toBe(
        true,
      );
    }

    expect(
      FORMLESS_CLI_WORKSPACE_OPERATION_BINDINGS.map((binding) => binding.command),
    ).not.toContain("formless save");
    expect(
      FORMLESS_CLI_WORKSPACE_OPERATION_BINDINGS.map((binding) => binding.operationKind),
    ).not.toContain("save");
    expect(
      FORMLESS_CLI_WORKSPACE_OPERATION_BINDINGS.map((binding) => binding.operationKind),
    ).not.toContain("deploymentRefresh");
  });

  it("parses top-level workspace command shortcuts", () => {
    expect(parseFormlessCliArgs(["dev"])).toEqual({
      kind: "workspaceDev",
      open: false,
      reset: false,
      workspacePath: null,
    });
    expect(parseFormlessCliArgs(["dev", "--workspace", "../personal"])).toEqual({
      kind: "workspaceDev",
      open: false,
      reset: false,
      workspacePath: "../personal",
    });
    expect(parseFormlessCliArgs(["dev", "--workspace", "../personal", "--open"])).toEqual({
      kind: "workspaceDev",
      open: true,
      reset: false,
      workspacePath: "../personal",
    });
    expect(parseFormlessCliArgs(["dev", "--workspace", "../personal", "--reset"])).toEqual({
      kind: "workspaceDev",
      open: false,
      reset: true,
      workspacePath: "../personal",
    });
    expect(parseFormlessCliArgs(["pull", "--workspace", "../personal"])).toEqual({
      dryRun: false,
      kind: "workspacePull",
      targetAlias: null,
      workspacePath: "../personal",
    });
    expect(
      parseFormlessCliArgs(["pull", "--workspace", "../personal", "--target", "remote"]),
    ).toEqual({
      dryRun: false,
      kind: "workspacePull",
      targetAlias: "remote",
      workspacePath: "../personal",
    });
    expect(
      parseFormlessCliArgs([
        "pull",
        "--workspace",
        "../personal",
        "--target",
        "remote",
        "--dry-run",
      ]),
    ).toEqual({
      dryRun: true,
      kind: "workspacePull",
      targetAlias: "remote",
      workspacePath: "../personal",
    });
    expect(parseFormlessCliArgs(["push", "--workspace", "../personal"])).toEqual({
      dryRun: false,
      force: false,
      kind: "workspacePush",
      targetAlias: null,
      workspacePath: "../personal",
    });
    expect(
      parseFormlessCliArgs(["push", "--workspace", "../personal", "--target", "remote"]),
    ).toEqual({
      dryRun: false,
      force: false,
      kind: "workspacePush",
      targetAlias: "remote",
      workspacePath: "../personal",
    });
    expect(
      parseFormlessCliArgs([
        "push",
        "--workspace",
        "../personal",
        "--target",
        "remote",
        "--dry-run",
      ]),
    ).toEqual({
      dryRun: true,
      force: false,
      kind: "workspacePush",
      targetAlias: "remote",
      workspacePath: "../personal",
    });
    expect(
      parseFormlessCliArgs(["push", "--workspace", "../personal", "--target", "remote", "--force"]),
    ).toEqual({
      dryRun: false,
      force: true,
      kind: "workspacePush",
      targetAlias: "remote",
      workspacePath: "../personal",
    });
    expect(
      parseFormlessCliArgs([
        "destroy",
        "--workspace",
        "../personal",
        "--target",
        "remote",
        "--confirm",
        "personal",
      ]),
    ).toEqual({
      confirm: "personal",
      kind: "workspaceDestroy",
      targetAlias: "remote",
      workspacePath: "../personal",
    });
    expect(
      parseFormlessCliArgs([
        "owner",
        "setup",
        "--workspace",
        "../personal",
        "--target",
        "remote",
        "--open",
        "--admin-token",
        "secret",
      ]),
    ).toEqual({
      adminToken: "secret",
      kind: "workspaceOwnerSetup",
      open: true,
      targetAlias: "remote",
      workspacePath: "../personal",
    });
    expect(parseFormlessCliArgs(["token", "adopt", "--admin-token", "secret"])).toEqual({
      adminToken: "secret",
      kind: "workspaceTokenAdopt",
      targetAlias: null,
      workspacePath: null,
    });
    expect(parseFormlessCliArgs(["token", "rotate"])).toEqual({
      adminToken: null,
      kind: "workspaceTokenRotate",
      targetAlias: null,
      workspacePath: null,
    });
    expect(parseFormlessCliArgs([])).toEqual({ kind: "help" });
  });

  it("keeps CLI parse error messages stable", () => {
    expect(() => parseFormlessCliArgs(["unknown"])).toThrow("Unknown command: unknown");
    expect(() => parseFormlessCliArgs(["dev", "--help"])).toThrow(
      "Usage: formless dev [--workspace <path>] [--open] [--reset]",
    );
    expect(() => parseFormlessCliArgs(["dev", "--print-session"])).toThrow(
      "Unknown option for formless dev: --print-session",
    );
    expect(() => parseFormlessCliArgs(["dev", "--verbose"])).toThrow(
      "Unknown option for formless dev: --verbose",
    );
    expect(() => parseFormlessCliArgs(["save"])).toThrow("Unknown command: save");
    expect(() => parseFormlessCliArgs(["save", "--workspace", "../personal"])).toThrow(
      "Unknown command: save",
    );
    expect(() => parseFormlessCliArgs(["pull", "--target", "Remote"])).toThrow(
      "Formless instance workspace target alias must start with a lowercase letter",
    );
    expect(() => parseFormlessCliArgs(["pull", "--force"])).toThrow(
      "Unknown option for formless pull: --force",
    );
    expect(() => parseFormlessCliArgs(["destroy"])).toThrow(
      "Missing required option for formless destroy: --confirm.",
    );
    expect(() => parseFormlessCliArgs(["destroy", "--confirm"])).toThrow(
      "Missing value for --confirm.",
    );
    expect(() => parseFormlessCliArgs(["destroy", "--confirm", "personal", "--force"])).toThrow(
      "Unknown option for formless destroy: --force",
    );
    expect(() => parseFormlessCliArgs(["owner"])).toThrow("Usage: formless owner <setup>");
    expect(() => parseFormlessCliArgs(["owner", "setup", "--force"])).toThrow(
      "Unknown option for formless owner setup: --force",
    );
    expect(() => parseFormlessCliArgs(["token", "forget"])).toThrow(
      "Usage: formless token <adopt|rotate>",
    );
  });

  it("parses local-first command defaults", () => {
    expect(parseFormlessCliArgs(["pull"])).toEqual({
      dryRun: false,
      kind: "workspacePull",
      targetAlias: null,
      workspacePath: null,
    });
    expect(parseFormlessCliArgs(["push"])).toEqual({
      dryRun: false,
      force: false,
      kind: "workspacePush",
      targetAlias: null,
      workspacePath: null,
    });
    expect(parseFormlessCliArgs(["destroy", "--confirm", "personal"])).toEqual({
      confirm: "personal",
      kind: "workspaceDestroy",
      targetAlias: null,
      workspacePath: null,
    });
  });

  it("initializes an instance workspace from remote target status", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();

    responses.queueJson({
      packageVersion: packageJson.version,
      runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
      schemaProvenance: formlessProgramSchemaProvenance,
      storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
      version: packageJson.version,
    });
    responses.queueJson({
      setupComplete: true,
      owner: {
        createdAt: "2026-05-01T00:00:00.000Z",
        email: "david@example.com",
        id: "owner-1",
        name: "David Peek",
      },
    });
    const result = await initFormlessInstanceWorkspace(
      {
        fromRemote: true,
        name: "personal-sites",
        targetAlias: "prod",
        targetUrl: "https://personal.dpeek.workers.dev/formless/auth/setup?token=ignored",
        workspacePath: workspaceRoot,
      },
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
      }),
    );

    expect(result.config).toEqual(resolvedWorkspaceConfig("personal-sites"));
    await expect(readFile(path.join(workspaceRoot, FORMLESS_CONFIG_FILE), "utf8")).resolves.toBe(
      formatFormlessConfigModule({ name: "personal-sites" }),
    );
    expect(result.remoteStatus?.deployMetadata.version).toBe(packageJson.version);
    await expect(readFile(path.join(workspaceRoot, ".gitignore"), "utf8")).resolves.toBe(
      ".formless/\n",
    );
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://personal.dpeek.workers.dev/api/formless/deploy",
      "GET https://personal.dpeek.workers.dev/api/formless/setup",
    ]);
  });

  it("initializes a fresh instance workspace from a local instance archive", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const archiveRoot = path.join(workspaceRoot, "archives/instance");

    await mkdir(archiveRoot, { recursive: true });
    await writeFile(
      path.join(archiveRoot, INSTANCE_ARCHIVE_MANIFEST_FILE),
      JSON.stringify(instanceArchive([programArchive()]), null, 2),
    );

    const result = await initFormlessInstanceWorkspace(
      {
        fromArchive: archiveRoot,
        name: "personal-sites",
        workspacePath: workspaceRoot,
      },
      cliDeps(tempDir),
    );

    expect(result.config).toEqual(resolvedWorkspaceConfig("personal-sites"));
    await expect(readFile(path.join(workspaceRoot, FORMLESS_CONFIG_FILE), "utf8")).resolves.toBe(
      formatFormlessConfigModule({ name: "personal-sites" }),
    );
    expect(result.archiveSourcePath).toBe("archives/instance");
  });

  it("discovers nearest exact Formless workspace configuration", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const nestedRoot = path.join(workspaceRoot, "app", "site");

    await writeWorkspaceConfig(workspaceRoot);
    await mkdir(nestedRoot, { recursive: true });

    await expect(discoverFormlessInstanceWorkspaceRoot(nestedRoot)).resolves.toEqual({
      configPath: path.join(workspaceRoot, FORMLESS_CONFIG_FILE),
      workspaceRoot,
    });
    await expect(resolveFormlessInstanceWorkspaceRoot({ cwd: nestedRoot })).resolves.toBe(
      workspaceRoot,
    );
  });

  it("creates one owner setup URL with focused bootstrap reads and no secret logging", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const logs: string[] = [];
    const setupInputs: CreateFormlessInstanceOwnerSetupCapabilityInput[] = [];

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);

    responses.queueJson({ setupComplete: false });

    await runFormlessCli(
      ["owner", "setup", "--workspace", workspaceRoot, "--admin-token", "explicit-admin-token"],
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
        logs,
        setupInputs,
      }),
    );

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://personal.dpeek.workers.dev/api/formless/setup",
    ]);
    expectNoOwnerSetupProtectedBootstrapReads(requests);
    expect(setupInputs).toEqual([
      {
        adminToken: "explicit-admin-token",
        deploymentUrl: "https://personal.dpeek.workers.dev",
        setupToken,
      },
    ]);
    expect(logs).toHaveLength(1);
    expect(logs.join("\n")).not.toContain("explicit-admin-token");
    expect(logs.join("\n")).not.toContain("/setup/capability");
    expect(logs.join("\n")).not.toContain("capabilityCreated");
  });

  it("creates owner setup capability and URL on the reported auth origin", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const openedUrls: string[] = [];
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const logs: string[] = [];
    const setupInputs: CreateFormlessInstanceOwnerSetupCapabilityInput[] = [];
    const authOrigin = "https://auth.example.com";
    const setupUrl = `${authOrigin}/formless/auth/setup?token=${setupToken}`;

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);

    responses.queueJson({ authOrigin, setupComplete: false });

    await runFormlessCli(
      [
        "owner",
        "setup",
        "--workspace",
        workspaceRoot,
        "--admin-token",
        "explicit-admin-token",
        "--open",
      ],
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
        logs,
        openedUrls,
        setupInputs,
      }),
    );

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://personal.dpeek.workers.dev/api/formless/setup",
    ]);
    expectNoOwnerSetupProtectedBootstrapReads(requests);
    expect(setupInputs).toEqual([
      {
        adminToken: "explicit-admin-token",
        deploymentUrl: authOrigin,
        setupToken,
      },
    ]);
    expect(openedUrls).toEqual([setupUrl]);
    expect(logs.join("\n")).toContain(`Setup URL: ${setupUrl}.`);
    expect(logs.join("\n")).not.toContain("explicit-admin-token");
  });

  it("keeps owner setup transport on the selected target while output links the reported admin origin", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const openedUrls: string[] = [];
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const logs: string[] = [];
    const setupInputs: CreateFormlessInstanceOwnerSetupCapabilityInput[] = [];
    const adminOrigin = "https://admin.example.com";
    const authOrigin = "https://auth.example.com";
    const setupUrl = `${authOrigin}/formless/auth/setup?token=${setupToken}`;

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);

    responses.queueJson({ adminOrigin, authOrigin, setupComplete: false });

    await runFormlessCli(
      [
        "owner",
        "setup",
        "--workspace",
        workspaceRoot,
        "--admin-token",
        "explicit-admin-token",
        "--open",
      ],
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
        logs,
        openedUrls,
        setupInputs,
      }),
    );

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://personal.dpeek.workers.dev/api/formless/setup",
    ]);
    expectNoOwnerSetupProtectedBootstrapReads(requests);
    expect(setupInputs).toEqual([
      {
        adminToken: "explicit-admin-token",
        deploymentUrl: authOrigin,
        setupToken,
      },
    ]);
    expect(openedUrls).toEqual([setupUrl]);
    expect(logs.join("\n")).toContain(
      "Target: instance.primary (https://personal.dpeek.workers.dev).",
    );
    expect(logs.join("\n")).toContain(`Admin URL: ${adminOrigin}/.`);
    expect(logs.join("\n")).toContain(`Setup URL: ${setupUrl}.`);
    expect(logs.join("\n")).not.toContain("explicit-admin-token");
  });

  it("does not invent a workers.dev admin continuation when setup status omits admin origin", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const logs: string[] = [];
    const setupInputs: CreateFormlessInstanceOwnerSetupCapabilityInput[] = [];
    const authOrigin = "https://auth.example.com";
    const setupUrl = `${authOrigin}/formless/auth/setup?token=${setupToken}`;

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);

    responses.queueJson({ authOrigin, setupComplete: false });

    await runFormlessCli(
      ["owner", "setup", "--workspace", workspaceRoot, "--admin-token", "explicit-admin-token"],
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
        logs,
        setupInputs,
      }),
    );

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://personal.dpeek.workers.dev/api/formless/setup",
    ]);
    expectNoOwnerSetupProtectedBootstrapReads(requests);
    expect(setupInputs).toEqual([
      {
        adminToken: "explicit-admin-token",
        deploymentUrl: authOrigin,
        setupToken,
      },
    ]);
    expect(logs.join("\n")).toContain(`Setup URL: ${setupUrl}.`);
    expect(logs.join("\n")).not.toContain("Admin URL:");
    expect(logs.join("\n")).not.toContain("Admin URL: https://personal.dpeek.workers.dev/.");
    expect(logs.join("\n")).not.toContain("explicit-admin-token");
  });

  it("does not retry owner setup capability creation on workers.dev when auth origin fails", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const setupInputs: CreateFormlessInstanceOwnerSetupCapabilityInput[] = [];
    const authOrigin = "https://auth.example.com";

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);

    responses.queueJson({ authOrigin, setupComplete: false });

    await expect(
      runFormlessCli(
        ["owner", "setup", "--workspace", workspaceRoot, "--admin-token", "explicit-admin-token"],
        cliDeps(tempDir, {
          fetch: responses.fetcher(requests),
          setupCapability: {
            create: async (input) => {
              setupInputs.push(input);

              throw new Error("configured auth origin is missing the setup endpoint");
            },
          },
        }),
      ),
    ).rejects.toThrow("configured auth origin is missing the setup endpoint");

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://personal.dpeek.workers.dev/api/formless/setup",
    ]);
    expect(setupInputs).toEqual([
      {
        adminToken: "explicit-admin-token",
        deploymentUrl: authOrigin,
        setupToken,
      },
    ]);
  });

  it("reports complete owner setup without creating a capability or opening a browser", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const openedUrls: string[] = [];
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const logs: string[] = [];
    const setupInputs: CreateFormlessInstanceOwnerSetupCapabilityInput[] = [];

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);

    responses.queueJson({
      setupComplete: true,
      owner: {
        createdAt: "2026-05-01T00:00:00.000Z",
        email: "david@example.com",
        id: "owner-1",
        name: "David Peek",
      },
    });

    await runFormlessCli(
      ["owner", "setup", "--workspace", workspaceRoot, "--open"],
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
        logs,
        openedUrls,
        setupInputs,
      }),
    );

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://personal.dpeek.workers.dev/api/formless/setup",
    ]);
    expectNoOwnerSetupProtectedBootstrapReads(requests);
    expect(setupInputs).toEqual([]);
    expect(openedUrls).toEqual([]);
    expect(logs).toHaveLength(1);
  });

  it("requires an admin token after reading incomplete owner setup status", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const openedUrls: string[] = [];
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const setupInputs: CreateFormlessInstanceOwnerSetupCapabilityInput[] = [];

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);

    responses.queueJson({ setupComplete: false });

    await expect(
      runFormlessCli(
        ["owner", "setup", "--workspace", workspaceRoot],
        cliDeps(tempDir, {
          fetch: responses.fetcher(requests),
          openedUrls,
          setupInputs,
        }),
      ),
    ).rejects.toThrow(
      "Formless owner setup requires an admin token; run `formless token adopt` or pass --admin-token.",
    );

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://personal.dpeek.workers.dev/api/formless/setup",
    ]);
    expectNoOwnerSetupProtectedBootstrapReads(requests);
    expect(setupInputs).toEqual([]);
    expect(openedUrls).toEqual([]);
  });

  it("opens owner setup URL from ignored secret state without logging the admin token", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const openedUrls: string[] = [];
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const logs: string[] = [];
    const setupInputs: CreateFormlessInstanceOwnerSetupCapabilityInput[] = [];
    const setupUrl = `https://personal.dpeek.workers.dev/formless/auth/setup?token=${setupToken}`;

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-admin-token\n",
    );

    responses.queueJson({ setupComplete: false });

    await runFormlessCli(
      ["owner", "setup", "--workspace", workspaceRoot, "--open"],
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
        logs,
        openedUrls,
        setupInputs,
      }),
    );

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://personal.dpeek.workers.dev/api/formless/setup",
    ]);
    expectNoOwnerSetupProtectedBootstrapReads(requests);
    expect(setupInputs).toEqual([
      {
        adminToken: "local-admin-token",
        deploymentUrl: "https://personal.dpeek.workers.dev",
        setupToken,
      },
    ]);
    expect(openedUrls).toEqual([setupUrl]);
    expect(logs).toHaveLength(1);
    expect(logs.join("\n")).not.toContain("local-admin-token");
    expect(logs.join("\n")).not.toContain("generated-token");
    expect(logs.join("\n")).not.toContain("/setup/capability");
  });

  it("pulls instance workspace state from the control-plane target URL", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const targetUrl = "https://source-owned.dpeek.workers.dev";
    const programs: unknown[] = [];
    const fetcher = archiveFetch(
      requests,
      programs,
      {
        david: { mediaBytes: Buffer.from([4, 5, 6]), records: mediaRecords() },
        james: { records: [] },
      },
      [],
      controlPlaneRecordsWithProviderObservation({ targetUrl }),
    );

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ targetUrl }),
    );
    await mkdir(path.join(workspaceRoot, "state/media/media/orphan/media/images"), {
      recursive: true,
    });
    await writeFile(
      path.join(workspaceRoot, "state/media/media/orphan/media/images/old.png"),
      Buffer.from([8, 8, 8]),
    );
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=stored-archive-token\n",
    );

    await runFormlessCli(
      ["pull", "--workspace", workspaceRoot],
      cliDeps(tempDir, { fetch: fetcher, logs }),
    );

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://source-owned.dpeek.workers.dev/api/formless/program/snapshot?actorKind=cliDeployer",
      "GET https://source-owned.dpeek.workers.dev/api/formless/program/bootstrap?actorKind=cliDeployer",
    ]);
    expect(requests.map((request) => request.headers.authorization)).toEqual(
      requests.map(() => "Bearer stored-archive-token"),
    );
    expect(logs).toHaveLength(1);
    expect(logs.join("\n")).not.toContain("stored-archive-token");
  });

  it("emits output for repeat pull without mutation", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const fetcher = archiveFetch(
      requests,
      [],
      { david: { records: [] } },
      [],
      controlPlaneRecords({ credentialRef: "formless-cloudflare-oauth:default" }),
    );

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ credentialRef: "formless-cloudflare-oauth:default" }),
    );
    await writeTestFormlessCloudflareOAuthCredential(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=stored-archive-token\n",
    );

    await runFormlessCli(
      ["pull", "--workspace", workspaceRoot],
      cliDeps(tempDir, { fetch: fetcher, logs }),
    );

    expect(logs).toHaveLength(1);
    expect(requests.some((request) => request.method === "POST")).toBe(false);
  });

  it("binds workspace domain provider cleanup to the instance Alchemy app and deploy state root", async () => {
    const selectedTarget = {
      alias: "remote",
      url: "https://personal.dpeek.workers.dev",
    };
    const deploymentStateRoot = "/workspace/.formless/deploy/personal";
    const context: FormlessInstanceWorkspaceProviderContext = {
      credential: {
        credentialProfile: "personal-profile",
        kind: "alchemy-profile",
      },
      credentialProfile: "personal-profile",
      deploymentStatePath: path.join(deploymentStateRoot, "formless.instance.json"),
      deploymentStateRoot,
      localSecretPath: path.join(deploymentStateRoot, "deploy.env"),
      config: resolvedWorkspaceConfig("personal-sites"),
      plan: planFormlessInstanceDeployment({
        account: {
          id: "account-123",
          workersDevSubdomain: "dpeek",
        },
        adoptExistingDeployment: true,
        instanceName: "personal",
        mediaBucketName: "personal-media",
        packageVersion: packageJson.version,
      }),
      secrets: {
        ALCHEMY_PASSWORD: "alchemy-password",
        CLOUDFLARE_API_TOKEN: "state-cf-token",
      },
      selectedTarget,
      workspaceRoot: "/workspace",
    };
    const runtimeInputs: unknown[] = [];
    const fakeRuntime: DomainProviderAlchemyRuntime = {
      factories: {} as DomainProviderAlchemyRuntime["factories"],
      password: "alchemy-password",
      runner: async (_appName, _options, apply) => apply(),
    };

    const runtime = workspaceDomainProviderAlchemyRuntime(context, async (input) => {
      runtimeInputs.push(input);

      return fakeRuntime;
    });
    if (!runtime) {
      throw new Error("Expected workspace domain provider runtime.");
    }
    const result = await runtime({
      accountId: "account-123",
      env: {
        ALCHEMY_PASSWORD: "ambient-password",
        CLOUDFLARE_API_TOKEN: "ambient-token",
        UNRELATED: "kept",
      },
    });

    expect(result).toBe(fakeRuntime);
    expect(runtimeInputs).toEqual([
      {
        accountId: "account-123",
        appName: FORMLESS_ALCHEMY_APP_NAME,
        apiToken: "state-cf-token",
        env: {
          ALCHEMY_PASSWORD: "alchemy-password",
          ALCHEMY_PROFILE: "personal-profile",
          UNRELATED: "kept",
        },
        rootDir: deploymentStateRoot,
        stage: "personal",
      },
    ]);
  });

  it("pushes workspace app state to the control-plane target URL as an explicit dry-run", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const fetcher = pushArchiveFetch(
      requests,
      [],
      {
        david: { records: [] },
        extra: { records: [] },
      },
      [
        {
          ok: false,
          errors: [{ message: "Program restore conflict." }],
        },
      ],
      [],
      controlPlaneRecords(),
    );

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    await runFormlessCli(
      ["push", "--workspace", workspaceRoot, "--dry-run"],
      cliDeps(tempDir, {
        deploy: async (input) => {
          deployInputs.push(input);

          return { url: input.plan.expectedUrl.url };
        },
        fetch: fetcher,
        logs,
      }),
    );

    expect(
      requests.some(
        (request) =>
          request.method === "POST" &&
          new URL(request.url).pathname === "/api/formless/archive/restore",
      ),
    ).toBe(false);
    expect(deployInputs).toEqual([]);
    expect(logs).toHaveLength(1);
  });

  it("performs first push with provider reconciliation before exact restore", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const setupInputs: CreateFormlessInstanceOwnerSetupCapabilityInput[] = [];
    const readFetch = pushArchiveFetch(requests, [], {}, [restorePlan(), restoreReport()]);
    let missingTargetReads = 0;
    const firstPushFetch: typeof fetch = async (url, init) => {
      const requestUrl =
        typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      const parsedUrl = new URL(requestUrl);
      const method = init?.method ?? "GET";

      if (
        method === "GET" &&
        parsedUrl.pathname === "/api/formless/program/snapshot" &&
        missingTargetReads === 0
      ) {
        missingTargetReads += 1;
        requests.push({
          body: init?.body,
          headers: normalizeHeaders(init?.headers),
          method,
          url: requestUrl,
        });

        return missingWorkersDevScriptResponse();
      }

      if (method === "GET" && parsedUrl.pathname === "/api/formless/deployments/desired-state") {
        requests.push({
          body: init?.body,
          headers: normalizeHeaders(init?.headers),
          method,
          url: requestUrl,
        });

        return Response.json(
          { error: 'Deployment target "instance.primary" was not found.' },
          { status: 404 },
        );
      }

      return readFetch(url, init);
    };

    await writeWorkspaceConfig(workspaceRoot, {
      runtime: {
        extensions: {
          [SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY]: {
            browser: "renderers/site-public.browser.tsx",
            worker: "renderers/site-public.worker.tsx",
          },
        },
      },
    });
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ credentialRef: "formless-cloudflare-oauth:default" }),
    );
    await writeTestFormlessCloudflareOAuthCredential(workspaceRoot);

    await runFormlessCli(
      ["push", "--workspace", workspaceRoot],
      cliDeps(tempDir, {
        deploy: async (input) => {
          deployInputs.push(input);

          return {
            resourceEvidence: [],
            url: input.plan.expectedUrl.url,
          };
        },
        fetch: firstPushFetch,
        logs,
        setupInputs,
      }),
    );

    const restoreRequests = requests.filter(
      (request) =>
        request.method === "POST" &&
        new URL(request.url).pathname === "/api/formless/archive/restore",
    );

    expect(missingTargetReads).toBe(1);
    expect(deployInputs).toHaveLength(1);
    expect(deployInputs[0]?.workspaceRoot).toBe(workspaceRoot);
    expect(setupInputs).toHaveLength(1);
    expect(restoreRequests).toHaveLength(2);
    expect(restoreRequests.map((request) => request.headers.authorization)).toEqual([
      "Bearer generated-token",
      "Bearer generated-token",
    ]);
    await expect(
      readFile(path.join(workspaceRoot, ".formless/instance.env"), "utf8"),
    ).resolves.toBe("FORMLESS_ADMIN_TOKEN=generated-token\n");
    expect(logs).toHaveLength(1);
  });

  it("keeps first push dry-run read-only when the target Worker has not been deployed", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    let missingTargetReads = 0;
    const firstPushFetch: typeof fetch = async (url, init) => {
      const requestUrl =
        typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      const parsedUrl = new URL(requestUrl);
      const method = init?.method ?? "GET";

      requests.push({
        body: init?.body,
        headers: normalizeHeaders(init?.headers),
        method,
        url: requestUrl,
      });

      if (
        method === "GET" &&
        parsedUrl.pathname === "/api/formless/program/snapshot" &&
        missingTargetReads === 0
      ) {
        missingTargetReads += 1;

        return missingWorkersDevScriptResponse();
      }

      throw new Error(`Unexpected request in missing target dry-run: ${method} ${requestUrl}`);
    };

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ credentialRef: "formless-cloudflare-oauth:default" }),
    );
    await writeTestFormlessCloudflareOAuthCredential(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    await runFormlessCli(
      ["push", "--workspace", workspaceRoot, "--dry-run"],
      cliDeps(tempDir, {
        deploy: async (input) => {
          deployInputs.push(input);

          return { url: input.plan.expectedUrl.url };
        },
        fetch: firstPushFetch,
        logs,
      }),
    );

    expect(missingTargetReads).toBe(1);
    expect(deployInputs).toEqual([]);
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://personal.dpeek.workers.dev/api/formless/program/snapshot?actorKind=cliDeployer",
    ]);
    expect(logs).toHaveLength(1);
  });

  it("runs Cloudflare OAuth preflight before non-dry-run push with an Alchemy credential ref", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const openedUrls: string[] = [];
    const accountDiscoveryInputs: Array<{
      credentialProfile: string | null;
    }> = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const localDavid = programArchive();
    const cloudflareAccount = {
      id: "account-123",
      name: "Personal",
      workersDevSubdomain: "dpeek",
    };
    const authorizationUrl = "https://dash.cloudflare.com/oauth2/auth?client_id=formless";
    const fetcher = cloudflareOAuthAccountFetch(
      pushArchiveFetch(
        requests,
        [],
        {
          david: { mediaBytes: Buffer.from([1]), records: publishRecords() },
        },
        [restorePlan(), restoreReport()],
      ),
      cloudflareAccount,
    );

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ credentialRef: "alchemy-profile:default" }),
    );
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid]),
    );
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    await runFormlessCli(
      ["push", "--workspace", workspaceRoot],
      cliDeps(tempDir, {
        accountDiscoveryInputs,
        cloudflareOAuth: fakeFormlessCloudflareOAuthAdapter({
          account: cloudflareAccount,
          authorizationUrl,
        }),
        deploy: async (input) => {
          deployInputs.push(input);

          return { url: input.plan.expectedUrl.url };
        },
        fetch: fetcher,
        logs,
        openedUrls,
        selectCloudflareAccount: async () => {
          throw new Error("Single account OAuth preflight should not prompt.");
        },
      }),
    );

    const snapshot = await readInstanceWorkspaceProgramStorageSnapshot({
      manifest: (await readWorkspaceConfig(workspaceRoot)).config,
      workspaceRoot,
    });
    const deploymentConfig = snapshot?.records.find(
      (record) => record.entity === "deployment-config",
    );

    expect(logs[0]).toBe(`Cloudflare authorization URL: ${authorizationUrl}`);
    expect(openedUrls).toEqual([authorizationUrl]);
    expect(accountDiscoveryInputs).toEqual([]);
    expect(deployInputs).toHaveLength(1);
    expect(deployInputs[0]?.secrets.CLOUDFLARE_API_TOKEN).toBe("formless-access-token");
    expect(deploymentConfig?.values).toMatchObject({
      accountId: "account-123",
      credentialRef: "formless-cloudflare-oauth:default",
      providerFamily: "cloudflare",
      targetUrl: "https://personal.dpeek.workers.dev",
      workerName: "personal",
    });
    expect(JSON.stringify(snapshot)).not.toContain("formless-access-token");
    expect(JSON.stringify(snapshot)).not.toContain("formless-refresh-token");
    expect(logs).toHaveLength(2);
  });

  it("onboards a missing local Formless OAuth secret for the selected push target", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const openedUrls: string[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const localDavid = programArchive();
    const cloudflareAccount = {
      id: "acct_team",
      name: "Team",
      workersDevSubdomain: "team",
    };
    const authorizationUrl = "https://dash.cloudflare.com/oauth2/auth?client_id=formless";
    const now = "2026-05-26T00:00:00.000Z";
    const stagingControlPlane = [
      ...controlPlaneRecords({ credentialRef: "formless-cloudflare-oauth:default" }),
      {
        createdAt: now,
        updatedAt: now,
        entity: "deployment-config",
        id: "staging",
        values: {
          accountId: "old-account",
          credentialRef: "formless-cloudflare-oauth:staging",
          enabled: true,
          label: "Staging",
          providerFamily: "cloudflare",
          targetId: "staging",
          targetUrl: "https://staging-sites.old.workers.dev",
          workerName: "staging-sites",
        },
      },
    ] satisfies StoredRecord[];
    const delegate = cloudflareOAuthAccountFetch(
      pushArchiveFetch(
        requests,
        [],
        {
          david: { mediaBytes: Buffer.from([1]), records: publishRecords() },
        },
        [restorePlan(), restoreReport()],
        [],
        stagingControlPlane,
      ),
      cloudflareAccount,
    );
    const fetcher: typeof fetch = async (url, init) => {
      const requestUrl =
        typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      const parsedUrl = new URL(requestUrl);

      if (
        parsedUrl.pathname === "/api/formless/deployments/status" ||
        parsedUrl.pathname === "/api/formless/deployments/desired-state"
      ) {
        requests.push({
          body: init?.body,
          headers: normalizeHeaders(init?.headers),
          method: init?.method ?? "GET",
          url: requestUrl,
        });
        const desiredState = {
          ...deploymentDesiredStateRef(),
          targetId: "staging",
          versionId: "desired.staging.3",
        };

        if (parsedUrl.pathname === "/api/formless/deployments/status") {
          return Response.json({
            status: {
              checkedAt: "2026-05-12T02:00:00.000Z",
              latestDesiredState: desiredState,
              state: "pending-changes",
              targetId: "staging",
            },
            target: { targetId: "staging" },
          });
        }

        const resourcesByKind = deploymentDesiredResourcesByKind(stagingControlPlane);
        const resourceCount = Object.values(resourcesByKind).reduce((sum, count) => sum + count, 0);

        return Response.json({
          desiredState: {
            ...desiredState,
            createdAt: "2026-05-12T02:00:00.000Z",
            display: {
              resourceCount,
              resourcesByKind,
              title: "Staging instance target",
            },
            resourceGraph: { resources: [], targetId: "staging" },
            schemaVersion: 1,
            source: { fingerprint: "source-1", intentRevision: 1 },
          },
          target: { targetId: "staging" },
        });
      }

      return delegate(url, init);
    };

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot, stagingControlPlane);
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid]),
    );
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    await runFormlessCli(
      ["push", "--workspace", workspaceRoot, "--target", "staging"],
      cliDeps(tempDir, {
        cloudflareOAuth: fakeFormlessCloudflareOAuthAdapter({
          account: cloudflareAccount,
          authorizationUrl,
        }),
        deploy: async (input) => {
          deployInputs.push(input);

          return { url: input.plan.expectedUrl.url };
        },
        fetch: fetcher,
        logs,
        openedUrls,
        selectCloudflareAccount: async () => {
          throw new Error("Single account OAuth preflight should not prompt.");
        },
      }),
    );

    const snapshot = await readInstanceWorkspaceProgramStorageSnapshot({
      manifest: (await readWorkspaceConfig(workspaceRoot)).config,
      workspaceRoot,
    });
    const production = snapshot?.records.find((record) => record.id === "instance.primary");
    const staging = snapshot?.records.find((record) => record.id === "staging");

    expect(logs[0]).toBe(`Cloudflare authorization URL: ${authorizationUrl}`);
    expect(openedUrls).toEqual([authorizationUrl]);
    expect(deployInputs).toHaveLength(1);
    expect(deployInputs[0]?.plan.account.id).toBe("acct_team");
    expect(deployInputs[0]?.plan.expectedUrl.url).toBe("https://staging-sites.team.workers.dev");
    expect(deployInputs[0]?.secrets.CLOUDFLARE_API_TOKEN).toBe("formless-access-token");
    expect(production?.values).toMatchObject({
      accountId: "account-123",
      credentialRef: "formless-cloudflare-oauth:default",
      targetId: "instance.primary",
      targetUrl: "https://personal.dpeek.workers.dev",
      workerName: "personal",
    });
    expect(staging?.values).toMatchObject({
      accountId: "acct_team",
      credentialRef: "formless-cloudflare-oauth:staging",
      providerFamily: "cloudflare",
      targetId: "staging",
      targetUrl: "https://staging-sites.team.workers.dev",
      workerName: "staging-sites",
    });
    await expect(
      readFile(path.join(workspaceRoot, ".formless/cloudflare-oauth/staging.json"), "utf8"),
    ).resolves.toContain("formless-access-token");
    expect(
      requests.some(
        (request) => new URL(request.url).hostname === "staging-sites.team.workers.dev",
      ),
    ).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain("formless-access-token");
    expect(JSON.stringify(snapshot)).not.toContain("formless-refresh-token");
    expect(logs).toHaveLength(2);
  });

  it("prompts for display-safe account selection when OAuth sees multiple accounts", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const openedUrls: string[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const selectionInputs: FormlessCliCloudflareOAuthAccountSelectionInput[] = [];
    const localDavid = programArchive();
    const personalAccount = {
      id: "acct_personal",
      name: "Personal",
      workersDevSubdomain: "personal",
    };
    const teamAccount = {
      id: "acct_team",
      name: "Team",
      workersDevSubdomain: "team",
    };
    const authorizationUrl = "https://dash.cloudflare.com/oauth2/auth?client_id=formless";
    const fetcher = pushArchiveFetch(
      requests,
      [],
      {
        david: { mediaBytes: Buffer.from([1]), records: publishRecords() },
      },
      [restorePlan(), restoreReport()],
    );

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ credentialRef: "alchemy-profile:default" }),
    );
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid]),
    );
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    await runFormlessCli(
      ["push", "--workspace", workspaceRoot],
      cliDeps(tempDir, {
        cloudflareOAuth: fakeFormlessCloudflareOAuthAdapter({
          account: personalAccount,
          accounts: [personalAccount, teamAccount],
          authorizationUrl,
        }),
        deploy: async (input) => {
          deployInputs.push(input);

          return { url: input.plan.expectedUrl.url };
        },
        fetch: fetcher,
        logs,
        openedUrls,
        selectCloudflareAccount: async (input) => {
          selectionInputs.push(input);

          return "acct_team";
        },
      }),
    );

    const snapshot = await readInstanceWorkspaceProgramStorageSnapshot({
      manifest: (await readWorkspaceConfig(workspaceRoot)).config,
      workspaceRoot,
    });
    const deploymentConfig = snapshot?.records.find(
      (record) => record.entity === "deployment-config",
    );

    expect(openedUrls).toEqual([authorizationUrl]);
    expect(selectionInputs).toEqual([
      {
        accounts: [
          {
            id: "acct_personal",
            name: "Personal",
            workersDevSubdomain: "personal",
          },
          {
            id: "acct_team",
            name: "Team",
            workersDevSubdomain: "team",
          },
        ],
        credentialRef: "formless-cloudflare-oauth:default",
        targetAlias: "instance.primary",
      },
    ]);
    expect(logs).toContain("Cloudflare account selection required:");
    expect(logs).toContain("  1. id=acct_personal name=Personal workers.dev=personal.workers.dev");
    expect(logs).toContain("  2. id=acct_team name=Team workers.dev=team.workers.dev");
    expect(deployInputs).toHaveLength(1);
    expect(deployInputs[0]?.plan.account.id).toBe("acct_team");
    expect(deploymentConfig?.values).toMatchObject({
      accountId: "acct_team",
      credentialRef: "formless-cloudflare-oauth:default",
      providerFamily: "cloudflare",
      targetUrl: "https://personal.team.workers.dev",
      workerName: "personal",
    });
    expect(
      requests.some((request) => new URL(request.url).hostname === "personal.team.workers.dev"),
    ).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain("formless-access-token");
    expect(JSON.stringify(snapshot)).not.toContain("formless-refresh-token");
  });

  it("fails with display-safe account instructions for non-interactive multiple-account OAuth preflight", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const openedUrls: string[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const localDavid = programArchive();
    const personalAccount = {
      id: "acct_personal",
      name: "Personal",
      workersDevSubdomain: "personal",
    };
    const teamAccount = {
      id: "acct_team",
      name: "Team",
      workersDevSubdomain: "team",
    };
    const authorizationUrl = "https://dash.cloudflare.com/oauth2/auth?client_id=formless";
    const fetcher = pushArchiveFetch(
      requests,
      [],
      {
        david: { mediaBytes: Buffer.from([1]), records: publishRecords() },
      },
      [restorePlan(), restoreReport()],
    );

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ credentialRef: "alchemy-profile:default" }),
    );
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid]),
    );
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    await expect(
      runFormlessCli(
        ["push", "--workspace", workspaceRoot],
        cliDeps(tempDir, {
          cloudflareOAuth: fakeFormlessCloudflareOAuthAdapter({
            account: personalAccount,
            accounts: [personalAccount, teamAccount],
            authorizationUrl,
          }),
          deploy: async (input) => {
            deployInputs.push(input);

            return { url: input.plan.expectedUrl.url };
          },
          fetch: fetcher,
          logs,
          openedUrls,
          selectCloudflareAccount: async () => null,
        }),
      ),
    ).rejects.toThrow(
      [
        "Multiple Cloudflare accounts were found for the Formless OAuth credential.",
        "Run `formless push` from an interactive terminal and select one account before provider mutation.",
      ].join("\n"),
    );

    const snapshot = await readInstanceWorkspaceProgramStorageSnapshot({
      manifest: (await readWorkspaceConfig(workspaceRoot)).config,
      workspaceRoot,
    });
    const deploymentConfig = snapshot?.records.find(
      (record) => record.entity === "deployment-config",
    );
    const output = logs.join("\n");

    expect(openedUrls).toEqual([authorizationUrl]);
    expect(logs).toContain("Cloudflare account selection required:");
    expect(output).toContain(
      "  1. id=acct_personal name=Personal workers.dev=personal.workers.dev",
    );
    expect(output).toContain("  2. id=acct_team name=Team workers.dev=team.workers.dev");
    expect(output).not.toContain("formless-access-token");
    expect(output).not.toContain("formless-refresh-token");
    expect(deployInputs).toEqual([]);
    expect(requests).toEqual([]);
    expect(deploymentConfig?.values).toMatchObject({
      accountId: "account-123",
      credentialRef: "alchemy-profile:default",
      targetUrl: "https://personal.dpeek.workers.dev",
    });
  });

  it("does not start Cloudflare OAuth preflight for push dry-run with an Alchemy credential ref", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const openedUrls: string[] = [];
    const localDavid = programArchive();
    const fetcher = pushArchiveFetch(
      requests,
      [],
      {
        david: { mediaBytes: Buffer.from([1]), records: publishRecords() },
      },
      [restorePlan()],
    );

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ credentialRef: "alchemy-profile:default" }),
    );
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid]),
    );
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    await runFormlessCli(
      ["push", "--workspace", workspaceRoot, "--dry-run"],
      cliDeps(tempDir, {
        cloudflareOAuth: throwingFormlessCloudflareOAuthAdapter(),
        fetch: fetcher,
        logs,
        openedUrls,
      }),
    );

    await expect(
      stat(path.join(workspaceRoot, ".formless/cloudflare-oauth/default.json")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(openedUrls).toEqual([]);
    expect(logs).toHaveLength(1);
  });

  it("does not refresh existing Formless OAuth credentials during push dry-run", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const localDavid = programArchive();
    const fetcher = pushArchiveFetch(
      requests,
      [],
      {
        david: { mediaBytes: Buffer.from([1]), records: publishRecords() },
      },
      [restorePlan()],
    );

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ credentialRef: "formless-cloudflare-oauth:default" }),
    );
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid]),
    );
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );
    await writeFormlessCloudflareOAuthCredential({
      credential: createFormlessCloudflareOAuthCredential({
        id: "default",
        selectedAccount: {
          id: "account-123",
          name: "Personal",
          workersDevSubdomain: "dpeek",
        },
        token: formlessCloudflareOAuthToken({
          accessToken: "expired-access-token",
          expiresAt: "2026-05-12T01:00:00.000Z",
          refreshToken: "expired-refresh-token",
        }),
        updatedAt: "2026-05-12T01:00:00.000Z",
      }),
      workspaceRoot,
    });

    await runFormlessCli(
      ["push", "--workspace", workspaceRoot, "--dry-run"],
      cliDeps(tempDir, {
        fetch: fetcher,
        logs,
      }),
    );

    await expect(
      readFile(path.join(workspaceRoot, ".formless/cloudflare-oauth/default.json"), "utf8"),
    ).resolves.toContain("expired-access-token");
    expect(requests.some((request) => new URL(request.url).hostname === "api.cloudflare.com")).toBe(
      false,
    );
    expect(logs).toHaveLength(1);
  });

  it("refreshes Formless OAuth credentials before ambient Cloudflare token fallback during push", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const refreshRequests: CapturedFetchRequest[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const localDavid = programArchive();
    const delegate = pushArchiveFetch(
      requests,
      [],
      {
        david: { mediaBytes: Buffer.from([1]), records: publishRecords() },
      },
      [restorePlan(), restoreReport()],
    );
    const fetcher: typeof fetch = async (url, init) => {
      const requestUrl =
        typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      const parsedUrl = new URL(requestUrl);

      if (parsedUrl.hostname === "dash.cloudflare.com" && parsedUrl.pathname === "/oauth2/token") {
        refreshRequests.push({
          body: init?.body,
          headers: normalizeHeaders(init?.headers),
          method: init?.method ?? "GET",
          url: requestUrl,
        });

        return Response.json({
          access_token: "refreshed-access-token",
          expires_in: 3600,
          refresh_token: "refreshed-refresh-token",
          scope: FORMLESS_CLOUDFLARE_OAUTH_DEPLOY_SCOPES.join(" "),
        });
      }

      return delegate(url, init);
    };

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ credentialRef: "formless-cloudflare-oauth:default" }),
    );
    await writeFormlessCloudflareOAuthCredential({
      credential: createFormlessCloudflareOAuthCredential({
        id: "default",
        selectedAccount: {
          id: "account-123",
          name: "Personal",
          workersDevSubdomain: "dpeek",
        },
        token: formlessCloudflareOAuthToken({
          accessToken: "expired-access-token",
          expiresAt: "2026-05-12T01:00:00.000Z",
          refreshToken: "expired-refresh-token",
        }),
        updatedAt: "2026-05-12T01:00:00.000Z",
      }),
      workspaceRoot,
    });
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid]),
    );
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    await runFormlessCli(
      ["push", "--workspace", workspaceRoot],
      cliDeps(tempDir, {
        deploy: async (input) => {
          deployInputs.push(input);

          return {
            resourceEvidence: [],
            url: input.plan.expectedUrl.url,
          };
        },
        env: {
          CF_API_TOKEN: "fallback-token",
          CLOUDFLARE_API_TOKEN: "ambient-token",
        },
        fetch: fetcher,
      }),
    );

    expect(refreshRequests).toHaveLength(1);
    const refreshBody = refreshRequests[0]?.body;
    const refreshBodyText =
      refreshBody instanceof URLSearchParams
        ? refreshBody.toString()
        : typeof refreshBody === "string"
          ? refreshBody
          : "";
    expect(refreshBodyText).toContain("grant_type=refresh_token");
    expect(refreshBodyText).toContain("refresh_token=expired-refresh-token");
    expect(deployInputs).toHaveLength(1);
    expect(deployInputs[0]?.secrets.CLOUDFLARE_API_TOKEN).toBe("refreshed-access-token");

    const oauthSecret = await readFile(
      path.join(workspaceRoot, ".formless/cloudflare-oauth/default.json"),
      "utf8",
    );
    expect(oauthSecret).toContain("refreshed-access-token");
    expect(oauthSecret).toContain("refreshed-refresh-token");
    expect(oauthSecret).not.toContain("ambient-token");
    expect(oauthSecret).not.toContain("fallback-token");

    const deploymentSecret = await readFile(
      path.join(workspaceRoot, ".formless/deploy/personal/deploy.env"),
      "utf8",
    );
    const deploymentState = await readFile(
      path.join(workspaceRoot, ".formless/deploy/personal/formless.instance.json"),
      "utf8",
    );
    const controlPlane = await readInstanceWorkspaceProgramStorageSnapshot({
      manifest: (await readWorkspaceConfig(workspaceRoot)).config,
      workspaceRoot,
    });
    const reviewableControlPlaneSource = JSON.stringify(controlPlane ?? {});

    for (const source of [deploymentSecret, deploymentState, reviewableControlPlaneSource]) {
      expect(source).not.toContain("refreshed-access-token");
      expect(source).not.toContain("refreshed-refresh-token");
      expect(source).not.toContain("expired-access-token");
      expect(source).not.toContain("expired-refresh-token");
      expect(source).not.toContain("ambient-token");
      expect(source).not.toContain("fallback-token");
    }
  });

  it("emits output for repeat push without mutation", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const fetcher = pushArchiveFetch(
      requests,
      [],
      { david: { records: [] } },
      [],
      [],
      controlPlaneRecords({ credentialRef: "formless-cloudflare-oauth:default" }),
    );

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ credentialRef: "formless-cloudflare-oauth:default" }),
    );
    await writeTestFormlessCloudflareOAuthCredential(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    await runFormlessCli(
      ["push", "--workspace", workspaceRoot],
      cliDeps(tempDir, { fetch: fetcher, logs }),
    );

    expect(logs).toHaveLength(1);
    expect(requests.some((request) => request.method === "POST")).toBe(false);
  });

  it("forces provider reconciliation on repeat push without restoring archive data", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const fetcher = pushArchiveFetch(
      requests,
      [],
      { david: { records: [] } },
      [],
      [],
      controlPlaneRecords({ credentialRef: "formless-cloudflare-oauth:default" }),
    );

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ credentialRef: "formless-cloudflare-oauth:default" }),
    );
    await writeTestFormlessCloudflareOAuthCredential(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    await runFormlessCli(
      ["push", "--workspace", workspaceRoot, "--force"],
      cliDeps(tempDir, {
        deploy: async (input) => {
          deployInputs.push(input);

          return { resourceEvidence: [], url: input.plan.expectedUrl.url };
        },
        fetch: fetcher,
        logs,
      }),
    );

    expect(deployInputs).toHaveLength(1);
    expect(deployInputs[0]?.workspaceRoot).toBe(workspaceRoot);
    expect(logs).toHaveLength(1);
  });

  it("pushes redirect route storage snapshot records through the composed instance archive restore payload", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const localDavid = programArchive();
    const fetcher = pushArchiveFetch(
      requests,
      [],
      {
        david: { mediaBytes: Buffer.from([1]), records: publishRecords() },
      },
      [restorePlan()],
    );

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot, [
      ...controlPlaneRecords(),
      redirectRouteRecord("old.dpeek.com", "dpeek.com"),
    ]);
    await writeArchiveDirectory(path.join(workspaceRoot, "archives/instance"), {
      ...instanceArchive([localDavid]),
      program: {
        schemaProvenance: formlessProgramSchemaProvenance,
        snapshot: controlPlaneSnapshot([redirectRouteRecord("old.dpeek.com", "dpeek.com")]),
      },
    });
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    await runFormlessCli(
      ["push", "--workspace", workspaceRoot, "--dry-run"],
      cliDeps(tempDir, { fetch: fetcher, logs }),
    );

    const restoreRequest = requests.find(
      (request) =>
        request.method === "POST" &&
        request.url === "https://personal.dpeek.workers.dev/api/formless/archive/restore",
    );
    const restoreBody = capturedRequestJson<{
      archive: InstanceArchive;
    }>(restoreRequest);
    expect(
      restoreBody.archive.program.snapshot.records.map((record) => `${record.entity}:${record.id}`),
    ).toContain("route:route:redirect:old.dpeek.com");
    expect(
      restoreBody.archive.program.snapshot.records.find(
        (record) => record.id === "route:redirect:old.dpeek.com",
      )?.values,
    ).toMatchObject({
      kind: "redirect",
      matchHost: "old.dpeek.com",
      preservePath: true,
      preserveQueryString: true,
      statusCode: "308",
      toHost: "dpeek.com",
    });
    expect(JSON.stringify(restoreBody.archive.program)).not.toContain("redirect-intent");
    expect(logs).toHaveLength(1);
  });

  it("backs up, dry-runs, and applies instance workspace push by default", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const localDavid = programArchive();
    const fetcher = pushArchiveFetch(
      requests,
      [],
      {
        david: { mediaBytes: Buffer.from([1]), records: publishRecords() },
      },
      [restorePlan(), restoreReport()],
    );

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ credentialRef: "formless-cloudflare-oauth:default" }),
    );
    await writeTestFormlessCloudflareOAuthCredential(workspaceRoot);
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid]),
    );
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    await runFormlessCli(
      ["push", "--workspace", workspaceRoot],
      cliDeps(tempDir, {
        deploy: async (deployInput) => {
          deployInputs.push(deployInput);

          return {
            resourceEvidence: [],
            url: deployInput.plan.expectedUrl.url,
          };
        },
        fetch: fetcher,
        logs,
      }),
    );

    const restoreRequests = requests.filter(
      (request) =>
        request.method === "POST" &&
        new URL(request.url).pathname === "/api/formless/archive/restore",
    );

    expect(restoreRequests).toHaveLength(2);
    expect(deployInputs).toHaveLength(1);
    expect(deployInputs[0]?.workspaceRoot).toBe(workspaceRoot);
    await expect(
      readFile(
        path.join(workspaceRoot, ".formless/backups/push-2026-05-12T02-00-00-000Z/archive.json"),
        "utf8",
      ),
    ).resolves.toContain('"kind": "formless.instanceArchive"');
    expect(logs).toHaveLength(1);
  });

  it("applies push when target data differs without a public stale acknowledgement flag", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const localDavid = programArchive();
    const fetcher = pushArchiveFetch(
      requests,
      [],
      {
        david: { mediaBytes: Buffer.from([9]), records: publishRecords() },
      },
      [restorePlan(), restoreReport()],
    );

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ credentialRef: "formless-cloudflare-oauth:default" }),
    );
    await writeTestFormlessCloudflareOAuthCredential(workspaceRoot);
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid]),
    );
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    await runFormlessCli(
      ["push", "--workspace", workspaceRoot],
      cliDeps(tempDir, { fetch: fetcher }),
    );
    expect(requests.some((request) => request.method === "POST")).toBe(true);
    await expect(
      readFile(
        path.join(workspaceRoot, ".formless/backups/push-2026-05-12T02-00-00-000Z/archive.json"),
        "utf8",
      ),
    ).resolves.toContain('"kind": "formless.instanceArchive"');
  });

  it("adopts and rotates instance workspace admin tokens explicitly", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const commands: CapturedCommand[] = [];
    const logs: string[] = [];

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);

    await expect(
      runFormlessCli(["token", "adopt", "--workspace", workspaceRoot], cliDeps(tempDir)),
    ).rejects.toThrow(
      "Cloudflare Worker secrets cannot be read back; pass --admin-token or set FORMLESS_ADMIN_TOKEN.",
    );

    await runFormlessCli(
      ["token", "adopt", "--workspace", workspaceRoot, "--admin-token", "local-secret"],
      cliDeps(tempDir, { logs }),
    );

    await expect(
      readFile(path.join(workspaceRoot, ".formless/instance.env"), "utf8"),
    ).resolves.toBe("FORMLESS_ADMIN_TOKEN=local-secret\n");

    await runFormlessCli(
      ["token", "rotate", "--workspace", workspaceRoot],
      cliDeps(tempDir, {
        commands,
        logs,
        packageRoot: "/package",
      }),
    );

    expect(commands).toEqual([
      {
        args: [
          "exec",
          "--",
          "wrangler",
          "secret",
          "bulk",
          path.join(workspaceRoot, ".formless/instance.env.next"),
          "--name",
          "personal",
        ],
        command: "npm",
        cwd: "/package",
        env: { CLOUDFLARE_ACCOUNT_ID: "account-123" },
      },
    ]);
    await expect(
      readFile(path.join(workspaceRoot, ".formless/instance.env"), "utf8"),
    ).resolves.toBe("FORMLESS_ADMIN_TOKEN=generated-token\n");
    expect(logs).toHaveLength(2);
  });

  it("starts instance workspace dev from an empty workspace after selecting a workspace name", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "empty-workspace");
    const child = new FakeCliDevChild();
    const logs: string[] = [];
    const nameSelections: Array<{
      defaultName: string;
      workspaceRoot: string;
    }> = [];
    const openedUrls: string[] = [];
    const requests: CapturedFetchRequest[] = [];
    const sidecars: CapturedWorkspaceGatewaySidecar[] = [];
    const spawnCalls: CapturedSpawn[] = [];

    const run = runFormlessCli(
      ["dev", "--workspace", workspaceRoot],
      cliDeps(tempDir, {
        env: { PORT: "4443" },
        fetch: localInstanceDevFetch(requests, []),
        logs,
        openedUrls,
        packageRoot: "/package",
        selectWorkspaceName: async (input) => {
          nameSelections.push(input);

          return "confirmed-workspace";
        },
        spawn: ((command: string, args: string[], options: CapturedSpawnOptions) => {
          spawnCalls.push({
            args,
            command,
            cwd: options.cwd,
            env: options.env,
          });
          announceFakeCliDevServer(child, options.env);

          return child as unknown as ReturnType<typeof spawn>;
        }) as typeof spawn,
        startWorkspaceGatewaySidecar: fakeWorkspaceGatewaySidecar(sidecars),
      }),
    );

    await waitUntil(() => logs.some((line) => line.includes(LOCAL_SESSION_BOOTSTRAP_API_PATH)));
    child.close(0);
    await run;

    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]).toMatchObject({
      args: ["run", "vp", "dev", "--port", "4443", "--strictPort"],
      command: "bun",
      cwd: "/package",
    });
    expect(spawnCalls[0]?.env).toMatchObject({
      FORMLESS_ADMIN_TOKEN: "generated-token",
      FORMLESS_OWNER_SESSION_SECRET: setupToken,
      [LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV]: "local-session-token",
      [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: "sidecar-proxy-token",
      [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]: "http://127.0.0.1:1",
      FORMLESS_RUNTIME_PROFILE: "instance",
      FORMLESS_WRANGLER_PERSIST: path.join(workspaceRoot, ".formless/local/wrangler"),
      PORT: "4443",
      VITE_FORMLESS_WORKSPACE_GATEWAY_API: "/api/formless/workspace",
      VITE_FORMLESS_RUNTIME_PROFILE: "instance",
    });
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET http://localhost:4443/api/formless/program/bootstrap",
    ]);
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer generated-token",
    ]);
    expect(openedUrls).toEqual([]);
    await expect(readFile(path.join(workspaceRoot, FORMLESS_CONFIG_FILE), "utf8")).resolves.toBe(
      formatFormlessConfigModule({ name: "confirmed-workspace" }),
    );
    expect(nameSelections).toEqual([{ defaultName: "empty-workspace", workspaceRoot }]);
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
    expect((await stat(path.join(workspaceRoot, ".formless/local"))).isDirectory()).toBe(true);
    await expect(
      readFile(path.join(workspaceRoot, ".formless/local/dev.env"), "utf8"),
    ).resolves.toBe(
      `FORMLESS_ADMIN_TOKEN=generated-token\nFORMLESS_OWNER_SESSION_SECRET=${setupToken}\n`,
    );
    expect(logs).toEqual([devSessionBootstrapUrlLogLine(logs)]);
    expect(child.killed).toBe(false);
    expect(sidecars).toMatchObject([
      {
        closed: true,
        endpoint: spawnCalls[0]?.env?.[WORKSPACE_GATEWAY_SIDECAR_URL_ENV],
        proxyToken: spawnCalls[0]?.env?.[WORKSPACE_GATEWAY_PROXY_TOKEN_ENV],
        workspaceRoot,
      },
    ]);
  });

  it("opens a local session bootstrap URL only for top-level workspace dev --open", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "open-workspace");
    const child = new FakeCliDevChild();
    const logs: string[] = [];
    const openedUrls: string[] = [];
    const requests: CapturedFetchRequest[] = [];
    const spawnCalls: CapturedSpawn[] = [];

    const run = runFormlessCli(
      ["dev", "--workspace", workspaceRoot, "--open"],
      cliDeps(tempDir, {
        env: { PORT: "4443" },
        fetch: localInstanceDevFetch(requests, []),
        logs,
        openedUrls,
        packageRoot: "/package",
        spawn: ((command: string, args: string[], options: CapturedSpawnOptions) => {
          spawnCalls.push({
            args,
            command,
            cwd: options.cwd,
            env: options.env,
          });
          announceFakeCliDevServer(child, options.env);

          return child as unknown as ReturnType<typeof spawn>;
        }) as typeof spawn,
      }),
    );

    await waitUntil(() => logs.some((line) => line.includes(LOCAL_SESSION_BOOTSTRAP_API_PATH)));
    child.close(0);
    await run;

    const sessionUrl = devSessionBootstrapUrlLogLine(logs);
    const openedUrl = new URL(openedUrls[0] ?? "");

    expect(logs).toEqual([sessionUrl]);
    expect(openedUrls).toEqual([sessionUrl]);
    expect(openedUrl.origin).toBe("http://localhost:4443");
    expect(openedUrl.pathname).toBe(LOCAL_SESSION_BOOTSTRAP_API_PATH);
    expect(openedUrl.searchParams.get("token")).toEqual(expect.any(String));
    expect(openedUrl.searchParams.get("redirectTo")).toBeNull();
    expect(openedUrl.searchParams.get("reset")).toBeNull();
    expect(spawnCalls[0]?.env?.FORMLESS_ADMIN_TOKEN).toBe("generated-token");
    expect(openedUrls[0]).not.toContain("generated-token");
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer generated-token",
    ]);
  });

  it("prints only the local session bootstrap URL without opening a browser", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "session-workspace");
    const child = new FakeCliDevChild();
    const logs: string[] = [];
    const openedUrls: string[] = [];
    const requests: CapturedFetchRequest[] = [];

    const run = runFormlessCli(
      ["dev", "--workspace", workspaceRoot],
      cliDeps(tempDir, {
        env: { PORT: "4443" },
        fetch: localInstanceDevFetch(requests, []),
        logs,
        openedUrls,
        packageRoot: "/package",
        spawn: ((_command: string, _args: string[], options: CapturedSpawnOptions) => {
          announceFakeCliDevServer(child, options.env);

          return child as unknown as ReturnType<typeof spawn>;
        }) as typeof spawn,
      }),
    );

    await waitUntil(() => logs.some((line) => line.includes(LOCAL_SESSION_BOOTSTRAP_API_PATH)));
    child.close(0);
    await run;

    const bootstrapUrl = readDevSessionBootstrapUrl(logs);

    expect(openedUrls).toEqual([]);
    expect(logs).toEqual([devSessionBootstrapUrlLogLine(logs)]);
    expect(bootstrapUrl.origin).toBe("http://localhost:4443");
    expect(bootstrapUrl.pathname).toBe(LOCAL_SESSION_BOOTSTRAP_API_PATH);
    expect(bootstrapUrl.searchParams.get("token")).toEqual(expect.any(String));
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET http://localhost:4443/api/formless/program/bootstrap",
    ]);
  });

  it("opens the local session bootstrap URL on the child-advertised dev origin", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "open-workspace");
    const child = new FakeCliDevChild();
    const logs: string[] = [];
    const openedUrls: string[] = [];
    const requests: CapturedFetchRequest[] = [];

    const run = runFormlessCli(
      ["dev", "--workspace", workspaceRoot, "--open"],
      cliDeps(tempDir, {
        env: { PORT: "5173" },
        fetch: localInstanceDevFetch(requests, []),
        logs,
        openedUrls,
        packageRoot: "/package",
        spawn: ((_command: string, _args: string[], _options: CapturedSpawnOptions) => {
          child.announceReady("http://localhost:5174");

          return child as unknown as ReturnType<typeof spawn>;
        }) as typeof spawn,
      }),
    );

    await waitUntil(() => logs.some((line) => line.includes(LOCAL_SESSION_BOOTSTRAP_API_PATH)));
    child.close(0);
    await run;

    const openedUrl = new URL(openedUrls[0] ?? "");

    expect(logs).toEqual([devSessionBootstrapUrlLogLine(logs)]);
    expect(openedUrls).toEqual([devSessionBootstrapUrlLogLine(logs)]);
    expect(openedUrl.origin).toBe("http://localhost:5174");
    expect(openedUrl.pathname).toBe(LOCAL_SESSION_BOOTSTRAP_API_PATH);
    expect(openedUrl.searchParams.get("token")).toEqual(expect.any(String));
    expect(openedUrl.searchParams.get("redirectTo")).toBeNull();
    expect(openedUrl.searchParams.get("reset")).toBeNull();
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET http://localhost:5174/api/formless/program/bootstrap",
    ]);
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer generated-token",
    ]);
  });

  it("prints and opens local session URLs on the Portless origin while probing the child origin", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "portless-workspace");
    const child = new FakeCliDevChild();
    const logs: string[] = [];
    const openedUrls: string[] = [];
    const requests: CapturedFetchRequest[] = [];
    const spawnCalls: CapturedSpawn[] = [];

    const run = runFormlessCli(
      ["dev", "--workspace", workspaceRoot, "--open"],
      cliDeps(tempDir, {
        env: {
          ALCHEMY_PASSWORD: "alchemy-secret",
          CLOUDFLARE_API_TOKEN: "cf-secret",
          HOST: "127.0.0.1",
          PORT: "5174",
          PORTLESS_URL: "https://ooga.formless.local",
        },
        fetch: localInstanceDevFetch(requests, []),
        logs,
        openedUrls,
        packageRoot: "/package",
        spawn: ((command: string, args: string[], options: CapturedSpawnOptions) => {
          spawnCalls.push({
            args,
            command,
            cwd: options.cwd,
            env: options.env,
          });
          child.announceReady("http://127.0.0.1:5174");

          return child as unknown as ReturnType<typeof spawn>;
        }) as typeof spawn,
      }),
    );

    await waitUntil(() => logs.some((line) => line.includes(LOCAL_SESSION_BOOTSTRAP_API_PATH)));
    child.close(0);
    await run;

    const sessionUrl = devSessionBootstrapUrlLogLine(logs);
    const openedUrl = new URL(openedUrls[0] ?? "");

    expect(logs).toEqual([sessionUrl]);
    expect(openedUrls).toEqual([sessionUrl]);
    expect(openedUrl.origin).toBe("https://ooga.formless.local");
    expect(openedUrl.pathname).toBe(LOCAL_SESSION_BOOTSTRAP_API_PATH);
    expect(openedUrl.searchParams.get("token")).toEqual(expect.any(String));
    expect(openedUrl.searchParams.get("redirectTo")).toBeNull();
    expect(openedUrl.searchParams.get("reset")).toBeNull();
    expect(spawnCalls[0]).toMatchObject({
      args: ["run", "vp", "dev", "--port", "5174", "--strictPort", "--host", "127.0.0.1"],
      command: "bun",
      cwd: "/package",
    });
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET http://127.0.0.1:5174/api/formless/program/bootstrap",
    ]);
  });

  it("starts workspace dev from an empty current directory for browser onboarding", async () => {
    const workspaceRoot = await makeTempDir();
    const child = new FakeCliDevChild();
    const logs: string[] = [];
    const requests: CapturedFetchRequest[] = [];
    const spawnCalls: CapturedSpawn[] = [];

    const run = runFormlessCli(
      ["dev"],
      cliDeps(workspaceRoot, {
        env: { PORT: "4443" },
        fetch: localInstanceDevFetch(requests, []),
        logs,
        packageRoot: "/package",
        spawn: ((command: string, args: string[], options: CapturedSpawnOptions) => {
          spawnCalls.push({
            args,
            command,
            cwd: options.cwd,
            env: options.env,
          });
          announceFakeCliDevServer(child, options.env);

          return child as unknown as ReturnType<typeof spawn>;
        }) as typeof spawn,
      }),
    );

    await waitUntil(() => logs.some((line) => line.includes(LOCAL_SESSION_BOOTSTRAP_API_PATH)));
    child.close(0);
    await run;

    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]?.env).toMatchObject({
      FORMLESS_RUNTIME_PROFILE: "instance",
      FORMLESS_WRANGLER_PERSIST: path.join(workspaceRoot, ".formless/local/wrangler"),
      PORT: "4443",
      VITE_FORMLESS_RUNTIME_PROFILE: "instance",
    });
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer generated-token",
    ]);
    await expect(readFile(path.join(workspaceRoot, FORMLESS_CONFIG_FILE), "utf8")).resolves.toBe(
      formatFormlessConfigModule({ name: expectedWorkspaceName(workspaceRoot) }),
    );
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
    await expect(
      readFile(path.join(workspaceRoot, ".formless/local/dev.env"), "utf8"),
    ).resolves.toBe(
      `FORMLESS_ADMIN_TOKEN=generated-token\nFORMLESS_OWNER_SESSION_SECRET=${setupToken}\n`,
    );
    expect(logs).toEqual([devSessionBootstrapUrlLogLine(logs)]);
    expect(child.killed).toBe(false);
  });

  it("rejects fresh workspace dev bootstrap when local onboarding source conflicts exist", async () => {
    const conflicts: Array<{
      expected: string;
      path: string;
      write: "dir" | "file";
    }> = [
      {
        expected: "portable archive source exists",
        path: INSTANCE_ARCHIVE_MANIFEST_FILE,
        write: "file",
      },
      {
        expected: "reviewable archive root exists",
        path: "archives",
        write: "dir",
      },
      {
        expected: "ignored .formless state exists",
        path: ".formless/deploy",
        write: "dir",
      },
    ];

    for (const conflict of conflicts) {
      const tempDir = await makeTempDir();
      const workspaceRoot = path.join(tempDir, "conflict-workspace");
      const conflictPath = path.join(workspaceRoot, conflict.path);
      const spawnCalls: CapturedSpawn[] = [];

      await mkdir(path.dirname(conflictPath), { recursive: true });

      if (conflict.write === "dir") {
        await mkdir(conflictPath, { recursive: true });
      } else {
        await writeFile(conflictPath, "{}\n");
      }

      await expect(
        runFormlessCli(
          ["dev", "--workspace", workspaceRoot],
          cliDeps(tempDir, {
            spawn: ((command: string, args: string[], options: CapturedSpawnOptions) => {
              spawnCalls.push({
                args,
                command,
                cwd: options.cwd,
                env: options.env,
              });

              return new FakeCliDevChild() as unknown as ReturnType<typeof spawn>;
            }) as typeof spawn,
          }),
        ),
      ).rejects.toThrow(conflict.expected);
      expect(spawnCalls).toEqual([]);
    }
  });

  it("rejects secret-looking control-plane storage state before local dev restore", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const child = new FakeCliDevChild();

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecordsWithDisabledDeployTarget(),
    );

    const manifest = (await readWorkspaceConfig(workspaceRoot)).config;
    const deploymentConfigSourcePath = instanceWorkspaceInstanceStatePath(workspaceRoot, manifest);
    const deploymentConfigSource = JSON.parse(
      await readFile(deploymentConfigSourcePath, "utf8"),
    ) as {
      records: StoredRecord[];
    };
    const deploymentConfigEntity =
      formatInstanceControlPlaneBoundaryEntityName("deployment-config");
    deploymentConfigSource.records = deploymentConfigSource.records.map((record) =>
      record.entity === "deployment-config" || record.entity === deploymentConfigEntity
        ? {
            ...record,
            values: {
              ...record.values,
              targetUrl: "https://CF_API_TOKEN_secret.example",
            },
          }
        : record,
    );
    await writeFile(
      deploymentConfigSourcePath,
      `${JSON.stringify(deploymentConfigSource, null, 2)}\n`,
    );

    await expect(
      runFormlessCli(
        ["dev", "--workspace", workspaceRoot],
        cliDeps(tempDir, {
          env: { PORT: "4451" },
          fetch: localInstanceDevFetch([], []),
          spawn: ((_command: string, _args: string[], options: CapturedSpawnOptions) => {
            announceFakeCliDevServer(child, options.env);

            return child as unknown as ReturnType<typeof spawn>;
          }) as typeof spawn,
        }),
      ),
    ).rejects.toThrow("cannot store control-plane secret values");
  });

  it("runs top-level workspace dev from the nearest manifest with empty local state", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const nestedRoot = path.join(workspaceRoot, "src", "site");
    const child = new FakeCliDevChild();
    const logs: string[] = [];
    const requests: CapturedFetchRequest[] = [];
    const spawnCalls: CapturedSpawn[] = [];

    await writeWorkspaceConfig(workspaceRoot);
    await mkdir(nestedRoot, { recursive: true });

    const run = runFormlessCli(
      ["dev"],
      cliDeps(nestedRoot, {
        env: { PORT: "4446" },
        fetch: localInstanceDevFetch(requests, []),
        logs,
        packageRoot: "/package",
        spawn: ((command: string, args: string[], options: CapturedSpawnOptions) => {
          spawnCalls.push({
            args,
            command,
            cwd: options.cwd,
            env: options.env,
          });
          announceFakeCliDevServer(child, options.env);

          return child as unknown as ReturnType<typeof spawn>;
        }) as typeof spawn,
      }),
    );

    await waitUntil(() => logs.some((line) => line.includes(LOCAL_SESSION_BOOTSTRAP_API_PATH)));
    child.close(0);
    await run;

    expect(spawnCalls[0]?.env).toMatchObject({
      FORMLESS_RUNTIME_PROFILE: "instance",
      FORMLESS_WRANGLER_PERSIST: path.join(workspaceRoot, ".formless/local/wrangler"),
      PORT: "4446",
      VITE_FORMLESS_RUNTIME_PROFILE: "instance",
    });
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET http://localhost:4446/api/formless/program/bootstrap",
    ]);
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer generated-token",
    ]);
    expect(logs).toEqual([devSessionBootstrapUrlLogLine(logs)]);
  });

  it("reuses current Program bootstrap on instance dev rerun", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const child = new FakeCliDevChild();
    const logs: string[] = [];
    const requests: CapturedFetchRequest[] = [];

    await writeWorkspaceConfig(workspaceRoot);

    const run = runFormlessCli(
      ["dev", "--workspace", workspaceRoot],
      cliDeps(tempDir, {
        env: { PORT: "4445" },
        fetch: localInstanceDevFetch(requests, []),
        logs,
        spawn: ((_command: string, _args: string[], options: CapturedSpawnOptions) => {
          announceFakeCliDevServer(child, options.env);

          return child as unknown as ReturnType<typeof spawn>;
        }) as typeof spawn,
      }),
    );

    await waitUntil(() => logs.some((line) => line.includes(LOCAL_SESSION_BOOTSTRAP_API_PATH)));
    child.close(0);
    await run;

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET http://localhost:4445/api/formless/program/bootstrap",
    ]);
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer generated-token",
    ]);
    expect(logs).toEqual([devSessionBootstrapUrlLogLine(logs)]);
  });

  it("rejects public save before workspace, Authority, provider, or state work", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const commands: CapturedCommand[] = [];
    const logs: string[] = [];
    const stateWrites: WriteFormlessInstanceStateInput[] = [];

    await expect(
      runFormlessCli(
        ["save", "--workspace", workspaceRoot],
        cliDeps(tempDir, {
          commands,
          deploy: async () => {
            throw new Error("deploy should not run");
          },
          fetch: async () => {
            throw new Error("fetch should not run");
          },
          logs,
          stateWrites,
        }),
      ),
    ).rejects.toThrow("Unknown command: save");

    await expect(stat(workspaceRoot)).rejects.toMatchObject({ code: "ENOENT" });
    expect(commands).toEqual([]);
    expect(logs).toEqual([]);
    expect(stateWrites).toEqual([]);
  });

  it("resets only instance workspace local state through dev --reset", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const child = new FakeCliDevChild();
    const logs: string[] = [];
    const openedUrls: string[] = [];
    const requests: CapturedFetchRequest[] = [];

    await writeWorkspaceConfig(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless/local/wrangler"), { recursive: true });
    await mkdir(path.join(workspaceRoot, ".formless/backups"), { recursive: true });
    await writeFile(path.join(workspaceRoot, ".formless/local/wrangler/state.txt"), "state");
    await writeFile(path.join(workspaceRoot, ".formless/backups/keep.txt"), "backup");
    await writeFile(path.join(workspaceRoot, ".formless/instance.env"), "FORMLESS_ADMIN_TOKEN=x\n");

    const run = runFormlessCli(
      ["dev", "--workspace", workspaceRoot, "--reset"],
      cliDeps(tempDir, {
        env: { PORT: "4451" },
        fetch: localInstanceDevFetch(requests, []),
        logs,
        openedUrls,
        spawn: ((_command: string, _args: string[], options: CapturedSpawnOptions) => {
          announceFakeCliDevServer(child, options.env);

          return child as unknown as ReturnType<typeof spawn>;
        }) as typeof spawn,
      }),
    );

    await waitUntil(() => logs.some((line) => line.includes(LOCAL_SESSION_BOOTSTRAP_API_PATH)));
    child.close(0);
    await run;

    const bootstrapUrl = readDevSessionBootstrapUrl(logs);

    await expect(
      stat(path.join(workspaceRoot, ".formless/local/wrangler/state.txt")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(path.join(workspaceRoot, ".formless/backups/keep.txt"), "utf8"),
    ).resolves.toBe("backup");
    await expect(
      readFile(path.join(workspaceRoot, ".formless/instance.env"), "utf8"),
    ).resolves.toBe("FORMLESS_ADMIN_TOKEN=x\n");
    expect(openedUrls).toEqual([]);
    expect(bootstrapUrl.pathname).toBe(LOCAL_SESSION_BOOTSTRAP_API_PATH);
    expect(bootstrapUrl.searchParams.get("token")).toEqual(expect.any(String));
    expect(bootstrapUrl.searchParams.get("reset")).toBe("1");
    expect(bootstrapUrl.searchParams.get("redirectTo")).toBeNull();
    expect(logs).toEqual([devSessionBootstrapUrlLogLine(logs)]);
  });

  it("rebuilds local Authority state from workspace source after dev --reset", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const child = new FakeCliDevChild();
    const logs: string[] = [];
    const requests: CapturedFetchRequest[] = [];

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot, localOnlyControlPlaneRecords());
    await mkdir(path.join(workspaceRoot, ".formless/local/wrangler"), { recursive: true });
    await writeFile(path.join(workspaceRoot, ".formless/local/wrangler/state.txt"), "state");

    const run = runFormlessCli(
      ["dev", "--workspace", workspaceRoot, "--reset"],
      cliDeps(tempDir, {
        env: { PORT: "4450" },
        fetch: localInstanceDevFetch(requests, []),
        logs,
        spawn: ((_command: string, _args: string[], options: CapturedSpawnOptions) => {
          announceFakeCliDevServer(child, options.env);

          return child as unknown as ReturnType<typeof spawn>;
        }) as typeof spawn,
      }),
    );

    await waitUntil(() => logs.some((line) => line.includes(LOCAL_SESSION_BOOTSTRAP_API_PATH)));
    child.close(0);
    await run;

    expect(logs).toEqual([devSessionBootstrapUrlLogLine(logs)]);
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET http://localhost:4450/api/formless/program/bootstrap",
      "POST http://localhost:4450/api/formless/archive/restore",
    ]);
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer generated-token",
      "Bearer generated-token",
    ]);
    await expect(
      stat(path.join(workspaceRoot, ".formless/local/wrangler/state.txt")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(path.join(workspaceRoot, ".formless/local/dev.json"), "utf8"),
    ).resolves.toContain('"sourceUrl": "http://localhost:4450"');
    expect(child.killed).toBe(false);
  });

  it("destroys a claimed instance workspace after confirmation", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const destroyInputs: DestroyFormlessInstanceInput[] = [];
    const logs: string[] = [];

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(path.join(workspaceRoot, ".formless/instance.env"), "FORMLESS_ADMIN_TOKEN=x\n");
    await writeWorkspaceDeployState(workspaceRoot);

    await runFormlessCli(
      ["destroy", "--workspace", workspaceRoot, "--confirm", "personal"],
      cliDeps(tempDir, {
        destroy: async (input) => {
          destroyInputs.push(input);

          return { resources: destroyedResourceSummary(input) };
        },
        logs,
        packageRoot: "/package",
      }),
    );

    expect(destroyInputs).toHaveLength(1);
    expect(destroyInputs[0]).toMatchObject({
      packageRoot: "/package",
      stateRoot: path.join(workspaceRoot, ".formless/deploy/personal"),
    });
    expect(logs).toHaveLength(1);
    expect(logs.join("\n")).not.toContain("state-cf-token");
    expect(logs.join("\n")).not.toContain("alchemy-password");
  });

  it("destroys a local-first workspace through the top-level command", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const destroyInputs: DestroyFormlessInstanceInput[] = [];

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);
    await writeWorkspaceDeployState(workspaceRoot);

    await runFormlessCli(
      [
        "destroy",
        "--workspace",
        workspaceRoot,
        "--target",
        "instance.primary",
        "--confirm",
        "personal",
      ],
      cliDeps(tempDir, {
        destroy: async (input) => {
          destroyInputs.push(input);

          return { resources: destroyedResourceSummary() };
        },
      }),
    );

    expect(destroyInputs).toHaveLength(1);
    expect(destroyInputs[0]?.stateRoot).toBe(path.join(workspaceRoot, ".formless/deploy/personal"));
  });

  it("reports Turnstile widget handling in destroy summaries without leaking secrets", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const destroyInputs: DestroyFormlessInstanceInput[] = [];
    const logs: string[] = [];

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);
    await writeWorkspaceDeployState(workspaceRoot);

    await runFormlessCli(
      ["destroy", "--workspace", workspaceRoot, "--confirm", "personal"],
      cliDeps(tempDir, {
        destroy: async (input) => {
          destroyInputs.push(input);

          return { resources: destroyedResourceSummary(input) };
        },
        logs,
        packageRoot: "/package",
      }),
    );

    expect(destroyInputs).toHaveLength(1);
    expect(logs).toHaveLength(1);
    expect(logs.join("\n")).not.toContain("state-cf-token");
    expect(logs.join("\n")).not.toContain("alchemy-password");
    expect(logs.join("\n")).not.toContain("FORMLESS_TURNSTILE_SECRET_KEY");
  });

  it("refuses destroy before provider mutation when no workspace target is selected", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const destroyInputs: DestroyFormlessInstanceInput[] = [];

    await mkdir(workspaceRoot, { recursive: true });
    await writeFile(
      path.join(workspaceRoot, FORMLESS_CONFIG_FILE),
      formatTestFormlessConfigModule({
        name: "personal-sites",
      }),
    );

    await expect(
      runFormlessCli(
        ["destroy", "--workspace", workspaceRoot, "--confirm", "personal"],
        cliDeps(tempDir, {
          destroy: async (input) => {
            destroyInputs.push(input);

            return { resources: destroyedResourceSummary() };
          },
        }),
      ),
    ).rejects.toThrow(
      "Formless instance destroy requires an enabled instance deployment-config record.",
    );
    expect(destroyInputs).toEqual([]);
  });

  it("refuses destroy before provider mutation when confirmation or deploy state is invalid", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const destroyInputs: DestroyFormlessInstanceInput[] = [];

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);
    await writeWorkspaceDeployState(workspaceRoot);

    await expect(
      runFormlessCli(
        ["destroy", "--workspace", workspaceRoot, "--confirm", "wrong"],
        cliDeps(tempDir, {
          destroy: async (input) => {
            destroyInputs.push(input);

            return { resources: destroyedResourceSummary() };
          },
        }),
      ),
    ).rejects.toThrow('Formless instance destroy confirmation must match Worker name "personal".');
    await expect(
      runFormlessCli(
        ["destroy", "--workspace", workspaceRoot, "--confirm", "wrong"],
        cliDeps(tempDir, {
          destroy: async (input) => {
            destroyInputs.push(input);

            return { resources: destroyedResourceSummary() };
          },
        }),
      ),
    ).rejects.toThrow('Formless instance destroy confirmation must match Worker name "personal".');

    await rm(path.join(workspaceRoot, ".formless/deploy/personal/formless.instance.json"));

    await expect(
      runFormlessCli(
        ["destroy", "--workspace", workspaceRoot, "--confirm", "personal"],
        cliDeps(tempDir, {
          destroy: async (input) => {
            destroyInputs.push(input);

            return { resources: destroyedResourceSummary() };
          },
        }),
      ),
    ).rejects.toThrow("Formless instance destroy requires ignored deploy state");

    expect(destroyInputs).toEqual([]);
  });

  it("refuses destroy before provider mutation when ignored deploy secrets are incomplete", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const destroyInputs: DestroyFormlessInstanceInput[] = [];

    await writeWorkspaceConfig(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);
    await writeWorkspaceDeployState(workspaceRoot, { deployEnv: "CLOUDFLARE_API_TOKEN=token\n" });

    await expect(
      runFormlessCli(
        ["destroy", "--workspace", workspaceRoot, "--confirm", "personal"],
        cliDeps(tempDir, {
          destroy: async (input) => {
            destroyInputs.push(input);

            return { resources: destroyedResourceSummary() };
          },
        }),
      ),
    ).rejects.toThrow(
      "Formless instance destroy requires ALCHEMY_PASSWORD in ignored deploy secrets",
    );
    expect(destroyInputs).toEqual([]);
  });

  it("omits upgrade planning from archive restore dry-run without mutating target", async () => {
    const tempDir = await makeTempDir();
    const outDir = path.join(tempDir, "instance-restore");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();

    await writeArchiveDirectory(outDir, instanceArchive([programArchive()]));
    responses.queueJson({ setupComplete: true });
    responses.queueJson(restorePlan());

    const result = await restoreInstanceArchive(
      {
        adminToken: null,
        apply: false,
        archiveDir: outDir,
        target: "https://instance.example",
      },
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
      }),
    );
    const restoreRequest = requests.at(-1);
    const restoreBody = capturedRequestJson<{
      archive: InstanceArchive;
    }>(restoreRequest);
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "POST https://instance.example/api/formless/archive/restore",
    ]);
    expect(restoreBody.archive.restorePolicy).toEqual({
      dryRun: true,
    });
    expect(result.archivePath).toBe(path.join(outDir, INSTANCE_ARCHIVE_MANIFEST_FILE));
    expect(result).not.toHaveProperty("upgradePlanning");
  });

  it("rejects unsupported archive versions before restore mutation", async () => {
    const tempDir = await makeTempDir();
    const outDir = path.join(tempDir, "unsupported-instance-restore");
    const requests: CapturedFetchRequest[] = [];

    await mkdir(outDir, { recursive: true });
    await writeFile(
      path.join(outDir, INSTANCE_ARCHIVE_MANIFEST_FILE),
      `${JSON.stringify(
        {
          ...instanceArchive([programArchive()]),
          version: 0,
        },
        null,
        2,
      )}\n`,
    );

    await expect(
      restoreInstanceArchive(
        {
          adminToken: null,
          apply: true,
          archiveDir: outDir,
          target: "https://instance.example",
        },
        cliDeps(tempDir, {
          fetch: responseQueue().fetcher(requests),
        }),
      ),
    ).rejects.toThrow("Instance archive version must be 2.");
    expect(requests).toEqual([]);
  });

  it("normalizes local source URLs", () => {
    expect(normalizeSourceUrl("http://localhost:5173/pages/home?x=1#top")).toBe(
      "http://localhost:5173/pages/home",
    );
    expect(() => normalizeSourceUrl("not a url")).toThrow("Source URL is invalid: not a url");
  });
});

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "formless-cli-test-"));

  tempDirs.push(tempDir);
  return tempDir;
}

type CapturedCommand = {
  args: string[];
  command: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
};

type CapturedSpawnOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

type CapturedSpawn = {
  args: string[];
  command: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

type CapturedFetchRequest = {
  body: BodyInit | null | undefined;
  headers: Record<string, string>;
  method: string;
  url: string;
};

type CapturedWorkspaceGatewaySidecar = {
  closed: boolean;
  endpoint: string;
  proxyToken: string;
  workspaceRoot: string;
};

function capturedRequestJson<T>(request: CapturedFetchRequest | undefined): T {
  if (!request || typeof request.body !== "string") {
    throw new Error("Expected captured request body to be a JSON string.");
  }

  return JSON.parse(request.body) as T;
}

function expectNoOwnerSetupProtectedBootstrapReads(requests: CapturedFetchRequest[]) {
  const forbiddenPrefixes = [
    "/api/formless/archive",
    "/api/formless/program",
    "/api/formless/deploy",
    "/api/formless/deployments",
    "/api/formless/session",
  ];

  expect(
    requests
      .map((request) => new URL(request.url).pathname)
      .filter((pathname) => forbiddenPrefixes.some((prefix) => pathname.startsWith(prefix))),
  ).toEqual([]);
}

class FakeCliDevChild extends EventEmitter {
  exitCode: number | null = null;
  killed = false;
  stderr = new EventEmitter();
  stdout = new EventEmitter();

  announceReady(origin: string) {
    queueMicrotask(() => {
      this.stdout.emit("data", Buffer.from(`${fakeCliDevReadyLog(origin)}\n`));
    });
  }

  kill() {
    this.killed = true;
    return true;
  }

  close(code: number, signal: NodeJS.Signals | null = null) {
    this.exitCode = code;
    this.emit("close", code, signal);
  }
}

function announceFakeCliDevServer(child: FakeCliDevChild, env: NodeJS.ProcessEnv | undefined) {
  child.announceReady(fakeCliDevOriginFromEnv(env));
}

function fakeCliDevOriginFromEnv(env: NodeJS.ProcessEnv | undefined): string {
  const port = env?.PORT && /^\d+$/.test(env.PORT) ? env.PORT : "5173";

  return `http://localhost:${port}`;
}

function fakeCliDevReadyLog(origin: string): string {
  return `Fake Vite ready: ${origin}/`;
}

function devSessionBootstrapUrlLogLine(logs: readonly string[]): string {
  const line = logs.find((entry) => entry.includes(LOCAL_SESSION_BOOTSTRAP_API_PATH));

  if (!line) {
    throw new Error("Expected formless dev bootstrap URL log.");
  }

  return line;
}

function readDevSessionBootstrapUrl(logs: readonly string[]): URL {
  return new URL(devSessionBootstrapUrlLogLine(logs));
}

async function writeWorkspaceConfig(
  workspaceRoot: string,
  options: {
    runtime?: ResolvedFormlessConfig["runtime"];
  } = {},
) {
  await mkdir(workspaceRoot, { recursive: true });
  await writeFile(
    path.join(workspaceRoot, FORMLESS_CONFIG_FILE),
    formatTestFormlessConfigModule({
      name: "personal-sites",
      ...(options.runtime === undefined ? {} : { runtime: options.runtime }),
    }),
  );
}

async function writeWorkspaceControlPlaneStorageSnapshot(
  workspaceRoot: string,
  records: StoredRecord[] = controlPlaneRecords(),
) {
  const manifest = (await readWorkspaceConfig(workspaceRoot)).config;

  await writeInstanceWorkspaceProgramStorageSnapshot({
    manifest,
    snapshot: controlPlaneSnapshot(records),
    workspaceRoot,
  });
}

async function writeWorkspaceDeployState(
  workspaceRoot: string,
  options: {
    deployEnv?: string;
    mediaBucketName?: string;
    workerName?: string;
  } = {},
) {
  const workerName = options.workerName ?? "personal";
  const deployRoot = path.join(workspaceRoot, ".formless/deploy", workerName);

  await mkdir(deployRoot, { recursive: true });
  await writeFile(
    path.join(deployRoot, "formless.instance.json"),
    `${JSON.stringify(
      {
        version: 1,
        kind: "formless-instance",
        instanceName: workerName,
        accountId: "account-123",
        workerName,
        workersDevUrl: `https://${workerName}.dpeek.workers.dev`,
        mediaBucketName: options.mediaBucketName ?? `${workerName}-media`,
        authorityNamespaceName: `${workerName}-authority`,
        deploymentTarget: "workers.dev",
        deployedPackageVersion: packageJson.version,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(deployRoot, "deploy.env"),
    options.deployEnv ??
      [
        "ALCHEMY_PASSWORD=alchemy-password",
        "ALCHEMY_PROFILE=personal-profile",
        "CLOUDFLARE_API_TOKEN=state-cf-token",
        "",
      ].join("\n"),
  );
}

function resolvedWorkspaceConfig(name: string) {
  return resolveFormlessConfig({ name });
}

function expectedWorkspaceName(workspaceRoot: string): string {
  const basename = path.basename(workspaceRoot);
  const normalized = basename
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "formless-instance";
}

type WorkspaceProgramArchiveFixture = {
  records: StoredRecord[];
  media: { objects: ArchiveMediaObject[] };
};

function instanceArchive(programs: WorkspaceProgramArchiveFixture[] = []): InstanceArchive {
  return {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: "2026-05-12T00:00:00.000Z",
    capabilities: ["core-media-assets"],
    restorePolicy: { dryRun: true },
    program: {
      schemaProvenance: formlessProgramSchemaProvenance,
      snapshot: controlPlaneSnapshot(programs.flatMap((program) => program.records)),
    },
    media: {
      objects: programs.flatMap((program) =>
        program.media.objects.map((object) => ({
          ...object,
          archivePath: `media/program/${object.storageKey}`,
        })),
      ),
    },
  };
}

function programArchive(): WorkspaceProgramArchiveFixture {
  return {
    records: [],
    media: { objects: [] },
  };
}

async function writeArchiveDirectory(
  archiveRoot: string,
  archive: InstanceArchive,
  mediaByKey: Record<string, Uint8Array> = {},
) {
  const mediaFiles: ArchiveDiskMediaFile[] = [];
  const mediaBytes = Object.values(mediaByKey)[0];

  for (const object of archive.media.objects) {
    if (!mediaBytes) {
      continue;
    }

    mediaFiles.push({
      archivePath: object.archivePath,
      byteSize: mediaBytes.byteLength,
      bytes: mediaBytes,
      contentType: object.contentType,
    });
  }

  await writeInstanceArchiveDirectory(
    {
      archive,
      mediaFiles,
      outDir: archiveRoot,
    },
    { cwd: "/" },
  );
}

function archiveFetch(
  requests: CapturedFetchRequest[],
  _programs: unknown[],
  programData: Record<
    string,
    {
      mediaBytes?: Uint8Array;
      records: StoredRecord[];
    }
  >,
  _extensions: unknown[] = [],
  controlPlaneRecords?: StoredRecord[],
): typeof fetch {
  return async (url, init) => {
    const requestUrl =
      typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const parsedUrl = new URL(requestUrl);

    requests.push({
      body: init?.body,
      headers: normalizeHeaders(init?.headers),
      method: init?.method ?? "GET",
      url: requestUrl,
    });

    if (parsedUrl.pathname === "/api/formless/deploy") {
      return Response.json(
        {
          packageVersion: packageJson.version,
          runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
          schemaProvenance: formlessProgramSchemaProvenance,
          storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
          version: packageJson.version,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (parsedUrl.pathname === "/api/formless/setup") {
      return Response.json({ setupComplete: true });
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
          checkedAt: "2026-05-12T02:00:00.000Z",
          latestDesiredState: desiredState,
          state: "pending-changes",
          targetId: desiredState.targetId,
        },
        target: { targetId: desiredState.targetId },
      });
    }

    if (parsedUrl.pathname === "/api/formless/deployments/desired-state") {
      const desiredState = deploymentDesiredStateRef();
      const resourcesByKind = deploymentDesiredResourcesByKind(controlPlaneRecords ?? []);
      const resourceCount = Object.values(resourcesByKind).reduce((sum, count) => sum + count, 0);

      return Response.json({
        desiredState: {
          ...desiredState,
          createdAt: "2026-05-12T02:00:00.000Z",
          display: {
            resourceCount,
            resourcesByKind,
            title: "Primary instance target",
          },
          resourceGraph: { resources: [], targetId: desiredState.targetId },
          schemaVersion: 1,
          source: { fingerprint: "source-1", intentRevision: 1 },
        },
        target: { targetId: desiredState.targetId },
      });
    }

    if (parsedUrl.pathname === "/api/formless/program/operations/deployment-config/update") {
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as {
        input: Record<string, unknown>;
        recordId: string;
      };

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

    if (parsedUrl.pathname === "/api/formless/program/bootstrap") {
      if (controlPlaneRecords === undefined) {
        return Response.json({ error: "not found" }, { status: 404 });
      }

      return Response.json({
        cursor: 1,
        records: controlPlaneRecords,
        schema: {},
      });
    }

    if (parsedUrl.pathname === "/api/formless/program/snapshot") {
      if (controlPlaneRecords === undefined) {
        return Response.json({ error: "not found" }, { status: 404 });
      }

      return Response.json(controlPlaneSnapshot(controlPlaneRecords));
    }

    if (parsedUrl.pathname === "/api/formless/media/media/images/cover.png") {
      const mediaBytes = Object.values(programData).find((data) => data.mediaBytes)?.mediaBytes;

      if (mediaBytes) {
        return new Response(Buffer.from(mediaBytes), {
          headers: { "content-type": "image/png" },
        });
      }
    }

    return Response.json({ error: "not found" }, { status: 404 });
  };
}

function controlPlaneRecords(
  options: {
    credentialRef?: string;
    driftStatus?: "drifted" | "in-sync" | "unknown";
    host?: string;
    targetUrl?: string;
  } = {},
): StoredRecord[] {
  const host = options.host ?? "dpeek.com";
  const adminRouteId = "route:instance:admin";
  const publicRouteId = "route:site:public-site";
  const domainRouteId = `route:host:publicSite:${host}`;
  const deployTargetId = "instance.primary";
  const targetUrl = options.targetUrl ?? "https://personal.dpeek.workers.dev";
  const now = "2026-05-26T00:00:00.000Z";

  return [
    {
      id: adminRouteId,
      entity: "route",
      values: {
        enabled: true,
        matchPath: "/",
        kind: "mount",
        targetProfile: "instance",
        surface: "admin",
      },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: publicRouteId,
      entity: "route",
      values: {
        enabled: true,
        matchPath: "/pages",
        matchPrefix: "/pages/",
        kind: "mount",
        targetProfile: "public-site",
        surface: "public-site",
      },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: domainRouteId,
      entity: "route",
      values: {
        enabled: true,
        matchHost: host,
        matchPath: "/",
        matchPrefix: "/",
        kind: "mount",
        targetProfile: "public-site",
        surface: "public-site",
      },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: deployTargetId,
      entity: "deployment-config",
      values: {
        targetId: deployTargetId,
        label: deployTargetId,
        enabled: true,
        targetUrl,
        providerFamily: "cloudflare",
        accountId: "account-123",
        workerName: "personal",
        ...(options.credentialRef === undefined ? {} : { credentialRef: options.credentialRef }),
      },
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function missingWorkersDevScriptResponse(): Response {
  return Response.json(
    {
      detail: "The Worker script required to render this page could not be found.",
      error_category: "worker",
      error_code: 1104,
      error_name: "worker_script_not_found",
      status: 500,
      title: "Error 1104: Script not found",
    },
    { status: 500 },
  );
}

function controlPlaneRecordsWithProviderObservation(
  options: Parameters<typeof controlPlaneRecords>[0] = {},
): StoredRecord[] {
  return controlPlaneRecords(options);
}

function localOnlyControlPlaneRecords(): StoredRecord[] {
  return controlPlaneRecords().filter(
    (record) =>
      record.entity !== "deployment-config" && record.id !== "route:host:publicSite:dpeek.com",
  );
}

function controlPlaneRecordsWithDisabledDeployTarget(): StoredRecord[] {
  return controlPlaneRecords().map((record) => {
    if (record.entity !== "deployment-config") {
      return record;
    }

    return {
      ...record,
      values: {
        ...record.values,
        enabled: false,
      },
    };
  });
}

function redirectRouteRecord(fromHost: string, toHost: string): StoredRecord {
  const now = "2026-05-26T00:00:00.000Z";

  return {
    id: `route:redirect:${fromHost}`,
    entity: "route",
    values: {
      enabled: true,
      matchHost: fromHost,
      matchPath: "/",
      matchPrefix: "/",
      kind: "redirect",
      toHost: toHost,
      statusCode: "308",
      preservePath: true,
      preserveQueryString: true,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function pushArchiveFetch(
  requests: CapturedFetchRequest[],
  programs: unknown[],
  programData: Record<
    string,
    {
      mediaBytes?: Uint8Array;
      records: StoredRecord[];
    }
  >,
  restoreResponses: unknown[],
  extensions: unknown[] = [],
  remoteControlPlaneRecords?: StoredRecord[],
): typeof fetch {
  const readFetch = archiveFetch(
    requests,
    programs,
    programData,
    extensions,
    remoteControlPlaneRecords ?? controlPlaneRecords(),
  );

  return async (url, init) => {
    const requestUrl =
      typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const parsedUrl = new URL(requestUrl);
    const method = init?.method ?? "GET";

    if (method === "POST" && parsedUrl.pathname === "/api/formless/archive/restore") {
      requests.push({
        body: init?.body,
        headers: normalizeHeaders(init?.headers),
        method,
        url: requestUrl,
      });

      const response = restoreResponses.shift();

      if (!response) {
        throw new Error(`Unexpected archive restore request: ${requestUrl}`);
      }

      return Response.json(response);
    }

    return readFetch(url, init);
  };
}

function cloudflareOAuthAccountFetch(
  delegate: typeof fetch,
  account: FormlessCloudflareOAuthAccount,
): typeof fetch {
  return async (url, init) => {
    const requestUrl =
      typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const parsedUrl = new URL(requestUrl);

    if (
      parsedUrl.hostname === "api.cloudflare.com" &&
      parsedUrl.pathname === "/client/v4/accounts"
    ) {
      return Response.json({
        result: [{ id: account.id, ...(account.name === undefined ? {} : { name: account.name }) }],
        success: true,
      });
    }

    if (
      parsedUrl.hostname === "api.cloudflare.com" &&
      parsedUrl.pathname === `/client/v4/accounts/${account.id}/workers/subdomain`
    ) {
      return Response.json({
        result: { subdomain: account.workersDevSubdomain },
        success: true,
      });
    }

    return delegate(url, init);
  };
}

function fakeFormlessCloudflareOAuthAdapter(input: {
  account: FormlessCloudflareOAuthAccount;
  accounts?: readonly FormlessCloudflareOAuthAccount[];
  authorizationUrl: string;
  token?: FormlessCloudflareOAuthTokenSet;
}): FormlessCloudflareOAuthAdapter {
  const token = input.token ?? formlessCloudflareOAuthToken();

  return {
    createAuthorization: () => ({
      requestedScopes: FORMLESS_CLOUDFLARE_OAUTH_DEPLOY_SCOPES,
      state: "oauth-state",
      url: input.authorizationUrl,
      verifier: "oauth-verifier",
    }),
    exchangeCode: async () => token,
    listAccounts: async () => [...(input.accounts ?? [input.account])],
    refresh: async () => token,
    waitForToken: async () => token,
  };
}

function throwingFormlessCloudflareOAuthAdapter(): FormlessCloudflareOAuthAdapter {
  return {
    createAuthorization: () => {
      throw new Error("Cloudflare OAuth preflight should not start.");
    },
    exchangeCode: async () => {
      throw new Error("Cloudflare OAuth preflight should not exchange codes.");
    },
    listAccounts: async () => {
      throw new Error("Cloudflare OAuth preflight should not list accounts.");
    },
    refresh: async () => {
      throw new Error("Cloudflare OAuth preflight should not refresh tokens.");
    },
    waitForToken: async () => {
      throw new Error("Cloudflare OAuth preflight should not wait for tokens.");
    },
  };
}

async function writeTestFormlessCloudflareOAuthCredential(workspaceRoot: string): Promise<void> {
  await writeFormlessCloudflareOAuthCredential({
    credential: createFormlessCloudflareOAuthCredential({
      id: "default",
      selectedAccount: {
        id: "account-123",
        name: "Personal",
        workersDevSubdomain: "dpeek",
      },
      token: formlessCloudflareOAuthToken(),
      updatedAt: "2026-05-12T02:00:00.000Z",
    }),
    workspaceRoot,
  });
}

function formlessCloudflareOAuthToken(
  overrides: Partial<FormlessCloudflareOAuthTokenSet> = {},
): FormlessCloudflareOAuthTokenSet {
  return {
    accessToken: "formless-access-token",
    expiresAt: "2026-05-12T03:00:00.000Z",
    grantedScopes: [...FORMLESS_CLOUDFLARE_OAUTH_DEPLOY_SCOPES],
    refreshToken: "formless-refresh-token",
    ...overrides,
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

function deploymentDesiredResourcesByKind(
  records: readonly StoredRecord[],
): Record<string, number> {
  const customDomains = records.filter(
    (record) =>
      record.entity === "route" &&
      record.values.enabled !== false &&
      typeof record.values.matchHost === "string",
  ).length;

  return customDomains === 0 ? {} : { "cloudflare-worker-custom-domain": customDomains };
}

function localInstanceDevFetch(
  requests: CapturedFetchRequest[],
  _programs: unknown[],
): typeof fetch {
  return async (url, init) => {
    const requestUrl =
      typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const parsedUrl = new URL(requestUrl);
    const method = init?.method ?? "GET";

    requests.push({
      body: init?.body,
      headers: normalizeHeaders(init?.headers),
      method,
      url: requestUrl,
    });

    if (method === "GET" && parsedUrl.pathname === "/api/formless/program/bootstrap") {
      return Response.json({ records: [], cursor: 0 });
    }

    if (method === "POST" && parsedUrl.pathname === "/api/formless/archive/restore") {
      return Response.json(restoreReport());
    }

    return Response.json({ error: "not found" }, { status: 404 });
  };
}

function restorePlan() {
  return {
    ok: true,
    plan: {
      summary: restoreSummary(),
    },
  };
}

function restoreReport() {
  return {
    ok: true,
    report: {
      applied: true,
      summary: restoreSummary(),
    },
  };
}

function restoreSummary() {
  return {
    mediaCount: 0,
    recordCounts: { active: 0, byEntity: {}, tombstoned: 0, total: 0 },
  };
}

function fakeCloudflareDomainClient(input: {
  dnsRecords: Record<string, CloudflareDnsRecord[]>;
  workerDomains: CloudflareWorkerDomain[];
  workerRoutes: Record<string, CloudflareWorkerRoute[]>;
  zonesByName: Record<string, CloudflareZone[]>;
}): CloudflareDomainClient {
  return {
    listActiveZonesForName: async ({ name }) => input.zonesByName[name] ?? [],
    listDnsRecords: async ({ name }) => input.dnsRecords[name] ?? [],
    listWorkerDomains: async () => input.workerDomains,
    listWorkerRoutes: async ({ zoneId }) => input.workerRoutes[zoneId] ?? [],
  };
}

function destroyedResourceSummary(
  input?: DestroyFormlessInstanceInput,
): DestroyFormlessInstanceResult["resources"] {
  if (input !== undefined) {
    const resources =
      input.domainProviderResources?.resources ?? input.domainProviderPlan.resources;

    return {
      alchemyState: "destroyed",
      customDomains: resources.filter(
        (resource) => resource.kind === "cloudflare-worker-custom-domain",
      ).length,
      dnsRecords: resources.filter((resource) => resource.kind === "cloudflare-dns-records").length,
      durableObjectNamespace: "destroyed",
      mediaBucket: "destroyed",
      turnstileWidget: "destroyed",
      worker: "destroyed",
      workerAssets: "destroyed",
      workerSecrets: "destroyed",
    };
  }

  return {
    alchemyState: "destroyed",
    customDomains: 1,
    dnsRecords: 1,
    durableObjectNamespace: "destroyed",
    mediaBucket: "destroyed",
    turnstileWidget: "destroyed",
    worker: "destroyed",
    workerAssets: "destroyed",
    workerSecrets: "destroyed",
  };
}

function cliDeps(
  cwd: string,
  options: {
    accounts?: Array<{
      id: string;
      name?: string;
      workersDevSubdomain: string;
    }>;
    accountDiscoveryInputs?: Array<{
      credentialProfile: string | null;
    }>;
    cloudflareDomainClient?: CloudflareDomainClient;
    cloudflareOAuth?: FormlessCloudflareOAuthAdapter;
    commands?: CapturedCommand[];
    deploy?: (input: DeployFormlessInstanceInput) => Promise<{
      url: string;
    }>;
    destroy?: (input: DestroyFormlessInstanceInput) => Promise<DestroyFormlessInstanceResult>;
    domainProviderDeleteRuntime?: FormlessCliDependencies["domainProviderDeleteRuntime"];
    env?: NodeJS.ProcessEnv;
    fetch?: typeof fetch;
    healthInputs?: CheckFormlessInstanceDeployMetadataInput[];
    logs?: string[];
    openedUrls?: string[];
    packageRoot?: string;
    selectCloudflareAccount?: FormlessCliDependencies["selectCloudflareAccount"];
    selectWorkspaceName?: FormlessCliDependencies["selectWorkspaceName"];
    setupCapability?: FormlessCliDependencies["setupCapability"];
    setupInputs?: CreateFormlessInstanceOwnerSetupCapabilityInput[];
    spawn?: typeof spawn;
    startWorkspaceGatewaySidecar?: FormlessCliDependencies["startWorkspaceGatewaySidecar"];
    stateRoot?: string;
    stateWrites?: WriteFormlessInstanceStateInput[];
  } = {},
): FormlessCliDependencies {
  const randomToken = randomTokenSequence(
    "generated-token",
    setupToken,
    "local-session-token",
    "sidecar-proxy-token",
  );

  return {
    accountDiscovery: {
      listAccounts: async (input) => {
        options.accountDiscoveryInputs?.push(input);

        return (
          options.accounts ?? [
            {
              id: "account-123",
              name: "Personal",
              workersDevSubdomain: "dpeek",
            },
          ]
        );
      },
    },
    cloudflareDomainClient: () =>
      options.cloudflareDomainClient ??
      fakeCloudflareDomainClient({
        dnsRecords: {},
        workerDomains: [],
        workerRoutes: {},
        zonesByName: {},
      }),
    ...(options.cloudflareOAuth === undefined ? {} : { cloudflareOAuth: options.cloudflareOAuth }),
    cwd,
    deploymentAdapter: {
      deploy:
        options.deploy ??
        (async (input) => ({
          url: input.plan.expectedUrl.url,
        })),
      destroy: options.destroy ?? (async () => ({ resources: destroyedResourceSummary() })),
    },
    ...(options.domainProviderDeleteRuntime === undefined
      ? {}
      : { domainProviderDeleteRuntime: options.domainProviderDeleteRuntime }),
    env: options.env ?? {},
    fetch: options.fetch ?? fetch,
    healthCheck: {
      check: async (input) => {
        options.healthInputs?.push(input);

        return {
          cacheControl: "no-store",
          metadataUrl: new URL("/api/formless/deploy", `${input.url}/`).toString(),
          packageVersion: input.expectedVersion,
          runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
          schemaProvenance: formlessProgramSchemaProvenance,
          storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
          url: input.url,
          version: input.expectedVersion,
        };
      },
    },
    localSecretEnv: {
      ensure: async (input) => ({
        created: false,
        path: path.join(input.root, "deploy.env"),
        secrets: {
          ALCHEMY_PASSWORD: "alchemy-password",
        },
      }),
    },
    log: (message) => {
      options.logs?.push(message);
    },
    now: () => "2026-05-12T02:00:00.000Z",
    openBrowser: async (url) => {
      options.openedUrls?.push(url);
    },
    packageRoot: options.packageRoot ?? process.cwd(),
    randomToken,
    runCommand: async (
      command: string,
      args: string[],
      commandOptions: FormlessCliRunCommandOptions,
    ) => {
      options.commands?.push({
        args,
        command,
        cwd: commandOptions.cwd,
        env: commandOptions.env,
      });
    },
    ...(options.selectCloudflareAccount === undefined
      ? {}
      : { selectCloudflareAccount: options.selectCloudflareAccount }),
    ...(options.selectWorkspaceName === undefined
      ? {}
      : { selectWorkspaceName: options.selectWorkspaceName }),
    spawn: options.spawn ?? spawn,
    startWorkspaceGatewaySidecar:
      options.startWorkspaceGatewaySidecar ?? fakeWorkspaceGatewaySidecar(),
    stateRoot: options.stateRoot ?? path.join(cwd, ".formless"),
    stateWriter: {
      write: async (input) => {
        options.stateWrites?.push(input);

        return {
          path: path.join(input.root, "formless.instance.json"),
          state: input.state,
        };
      },
    },
    setupCapability: options.setupCapability ?? {
      create: async (input) => {
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
  };
}

function fakeWorkspaceGatewaySidecar(
  captures: CapturedWorkspaceGatewaySidecar[] = [],
): NonNullable<FormlessCliDependencies["startWorkspaceGatewaySidecar"]> {
  return async (input, dependencies) => {
    const sidecar = {
      closed: false,
      endpoint: "http://127.0.0.1:1",
      proxyToken: dependencies.createProxyToken?.() ?? "generated-token",
      workspaceRoot: input.workspaceRoot,
    };
    captures.push(sidecar);

    return {
      close: async () => {
        sidecar.closed = true;
      },
      endpoint: sidecar.endpoint,
      proxyToken: sidecar.proxyToken,
    };
  };
}

function randomTokenSequence(...tokens: string[]): () => string {
  let index = 0;

  return () => tokens[index++ % tokens.length] ?? setupToken;
}

function responseQueue() {
  const responses: Response[] = [];

  return {
    fetcher:
      (requests: CapturedFetchRequest[]): typeof fetch =>
      async (url, init) => {
        const requestUrl =
          typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

        requests.push({
          body: init?.body,
          headers: normalizeHeaders(init?.headers),
          method: init?.method ?? "GET",
          url: requestUrl,
        });

        const response = responses.shift();

        if (!response) {
          throw new Error(`Unexpected request: ${requestUrl}`);
        }

        return response;
      },
    queueBinary: (value: Uint8Array, contentType: string, status = 200) =>
      responses.push(
        new Response(Buffer.from(value), {
          headers: { "content-type": contentType },
          status,
        }),
      ),
    queueJson: (value: unknown, status = 200, headers?: HeadersInit) =>
      responses.push(Response.json(value, { headers, status })),
    queueText: (value: string, status = 200) => responses.push(new Response(value, { status })),
  };
}

function controlPlaneSnapshot(records: StoredRecord[]): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
    schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
    exportedAt: "2026-05-12T00:00:00.000Z",
    schemaUpdatedAt: "2026-05-26T00:00:00.000Z",
    sourceCursor: records.length,
    schema: formlessProgramSchema,
    records,
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

function publishRecords(): StoredRecord[] {
  return [
    ...mediaRecords(),
    block("block-about", "2026-05-05T00:00:03.000Z", {
      type: "page",
      label: "About",
      href: "/about",
    }),
  ];
}

function block(id: string, createdAt: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    createdAt,
    updatedAt: createdAt,
    entity: "block",
    values,
  };
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return headers;
}

async function waitUntil(predicate: () => boolean, timeoutMs = 1000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  throw new Error("Timed out waiting for predicate.");
}
