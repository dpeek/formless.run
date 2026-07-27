import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import packageJson from "../../package.json";
import {
  APP_ARCHIVE_KIND,
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  PORTABLE_ARCHIVE_MANIFEST_FILE,
  archiveApps,
  parsePortableArchive,
  type AppArchive,
  type InstanceArchive,
} from "@dpeek/formless-archive";
import {
  writePortableArchiveDirectory,
  type ArchiveDiskMediaFile,
} from "@dpeek/formless-archive/node";
import type {
  CloudflareDnsRecord,
  CloudflareDomainClient,
  CloudflareWorkerDomain,
  CloudflareWorkerRoute,
  CloudflareZone,
} from "./cloudflare-domain-client.ts";
import {
  listInstallableAppPackages,
  packageAppFactsForKey,
  type InstallableAppPackage,
} from "@dpeek/formless-installed-apps";
import {
  appPackageManifestKind,
  appPackageManifestVersion,
  bundledAppPackageManifests,
  bundledAppPackageResolver,
} from "../shared/app-packages.ts";
import {
  FORMLESS_RUNTIME_PROTOCOL_VERSION,
  FORMLESS_STORAGE_MIGRATION_SET_ID,
} from "../shared/deploy-metadata.ts";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import {
  INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  formatInstanceControlPlaneBoundaryEntityName,
  instanceControlPlaneSchema,
} from "@dpeek/formless-instance-control-plane";
import { computeSourceSchemaHash, type SourceSchemaHash } from "../shared/upgrade-migrations.ts";
import { FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME } from "../shared/workspace-runtime-packages.ts";
import {
  FORMLESS_SITE_PROJECT_ROOT_ENV_NAME,
  FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME,
  SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY,
} from "../shared/workspace-runtime-extensions.ts";
import {
  LOCAL_SESSION_BOOTSTRAP_API_PATH,
  LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
} from "@dpeek/formless-gateway";
import {
  INSTANCE_WORKSPACE_MANIFEST_FILE as FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE,
  WORKSPACE_OPERATION_KINDS,
  formatInstanceWorkspaceManifest as formatFormlessInstanceWorkspaceManifest,
  type InstanceWorkspaceManifest,
  parseInstanceWorkspaceManifestJson as parseFormlessInstanceWorkspaceManifestJson,
  workspaceOperationDefinitionForKind,
} from "@dpeek/formless-workspace";
import {
  crmSeedRecords,
  crmSourceSchema,
  siteSourceSchema,
  taskSeedRecords,
  taskSourceSchema,
} from "../test/schema-apps.ts";
import {
  FORMLESS_CLI_WORKSPACE_OPERATION_BINDINGS,
  formlessCliUsage,
  normalizeSourceUrl,
  parseFormlessCliArgs,
  formlessCliWorkspaceOperationCommandNameForKind,
} from "./cli-command.ts";
import {
  instanceWorkspaceInstanceStatePath,
  instanceWorkspaceMediaFilePath,
  createWorkspaceAppPackageResolver,
  readInstanceWorkspaceControlPlaneStorageSnapshot,
  writeInstanceWorkspaceAppStorageSnapshot,
  writeInstanceWorkspaceControlPlaneStorageSnapshot,
} from "@dpeek/formless-workspace/node";
import {
  FORMLESS_ALCHEMY_APP_NAME,
  discoverFormlessInstanceWorkspaceRoot,
  exportAppArchive,
  exportInstanceArchive,
  initFormlessInstanceWorkspace,
  planFormlessInstanceDeployment,
  resolveFormlessInstanceWorkspaceRoot,
  restoreAppArchive,
  restorePortableArchive,
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
import { appArchiveControlPlaneRecords } from "./instance-workspace-control-plane.ts";

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

    responses.queueJson({ version: packageJson.version });
    responses.queueJson({
      setupComplete: true,
      owner: {
        createdAt: "2026-05-01T00:00:00.000Z",
        email: "david@example.com",
        id: "owner-1",
        name: "David Peek",
      },
    });
    responses.queueJson({
      packages: listInstallableAppPackages(bundledAppPackageResolver),
      installs: [installedSite("david", "David Peek"), installedSite("james", "James Peek")],
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

    const manifest = parseFormlessInstanceWorkspaceManifestJson(
      await readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
    );

    expect(manifest).toEqual(layoutWorkspaceManifest("personal-sites"));
    expect(result.remoteStatus?.deployMetadata.version).toBe(packageJson.version);
    await expect(readFile(path.join(workspaceRoot, ".gitignore"), "utf8")).resolves.toBe(
      ".formless/\n",
    );
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://personal.dpeek.workers.dev/api/formless/deploy",
      "GET https://personal.dpeek.workers.dev/api/formless/setup",
      "GET https://personal.dpeek.workers.dev/api/formless/app-installs",
    ]);
  });

  it("initializes a fresh instance workspace from a local instance archive", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const archiveRoot = path.join(workspaceRoot, "archives/instance");

    await mkdir(archiveRoot, { recursive: true });
    await writeFile(
      path.join(archiveRoot, PORTABLE_ARCHIVE_MANIFEST_FILE),
      JSON.stringify(instanceArchive([appArchive("david", "David Peek")]), null, 2),
    );

    const result = await initFormlessInstanceWorkspace(
      {
        fromArchive: archiveRoot,
        name: "personal-sites",
        workspacePath: workspaceRoot,
      },
      cliDeps(tempDir),
    );

    const manifest = parseFormlessInstanceWorkspaceManifestJson(
      await readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
    );

    expect(manifest).toEqual(layoutWorkspaceManifest("personal-sites"));
    expect(result.archiveSourcePath).toBe("archives/instance");
  });

  it("projects archive app admin routes over generated nested screens", () => {
    expect(
      appArchiveControlPlaneRecords(appArchive("david", "David Peek")).find(
        (record) => record.id === "route:david:admin",
      )?.values,
    ).toMatchObject({
      matchPath: "/apps/david",
      matchPrefix: "/apps/david/",
    });
  });

  it("discovers nearest Formless workspace manifest", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const nestedRoot = path.join(workspaceRoot, "app", "site");

    await writeWorkspaceManifest(workspaceRoot);
    await mkdir(nestedRoot, { recursive: true });

    await expect(discoverFormlessInstanceWorkspaceRoot(nestedRoot)).resolves.toEqual({
      manifestPath: path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE),
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

    await writeWorkspaceManifest(workspaceRoot);
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

    await writeWorkspaceManifest(workspaceRoot);
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

    await writeWorkspaceManifest(workspaceRoot);
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

    await writeWorkspaceManifest(workspaceRoot);
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

    await writeWorkspaceManifest(workspaceRoot);
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

    await writeWorkspaceManifest(workspaceRoot);
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

    await writeWorkspaceManifest(workspaceRoot);
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

    await writeWorkspaceManifest(workspaceRoot);
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
    const installs = [installedSite("david", "David Peek"), installedSite("james", "James Peek")];
    const fetcher = archiveFetch(
      requests,
      installs,
      {
        david: { mediaBytes: Buffer.from([4, 5, 6]), records: mediaRecords() },
        james: { records: [] },
      },
      [],
      controlPlaneRecordsWithProviderObservation({ targetUrl }),
    );

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ targetUrl }),
    );
    await writeWorkspaceAppStateFromArchive(
      workspaceRoot,
      appArchive("stale", "Stale Local", { mediaBytes: Buffer.from([9, 9, 9]), records: [] }),
      Buffer.from([9, 9, 9]),
      "stale",
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

    await expect(
      readFile(path.join(workspaceRoot, "state/apps/david.json"), "utf8"),
    ).resolves.toContain('"storageIdentity": "app:david"');
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://source-owned.dpeek.workers.dev/api/formless/app-installs",
      "GET https://source-owned.dpeek.workers.dev/api/formless/control-plane/snapshot?actorKind=cliDeployer",
      "GET https://source-owned.dpeek.workers.dev/api/app-installs/site/david/snapshot",
      "GET https://source-owned.dpeek.workers.dev/api/app-installs/site/james/snapshot",
      "GET https://source-owned.dpeek.workers.dev/api/formless/media/media/images/cover.png",
      "GET https://source-owned.dpeek.workers.dev/api/formless/control-plane/bootstrap?actorKind=cliDeployer",
    ]);
    expect(requests.map((request) => request.headers.authorization)).toEqual(
      requests.map(() => "Bearer stored-archive-token"),
    );
    expect(logs).toHaveLength(1);
    expect(logs.join("\n")).not.toContain("stored-archive-token");
    await expect(
      readFile(path.join(workspaceRoot, "state/apps/david.json")),
    ).resolves.not.toContain("stored-archive-token");
  });

  it("emits output for repeat pull without mutation", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const localDavid = appArchive("david", "David Peek", { records: [] });
    const fetcher = archiveFetch(
      requests,
      [installedSite("david", "David Peek")],
      { david: { records: [] } },
      [],
      controlPlaneRecords({ credentialRef: "formless-cloudflare-oauth:default" }),
    );

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ credentialRef: "formless-cloudflare-oauth:default" }),
    );
    await writeTestFormlessCloudflareOAuthCredential(workspaceRoot);
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);
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
      activePackages: {
        linkedPackages: [],
        packageLinks: [],
        resolver: bundledAppPackageResolver,
      },
      credential: {
        credentialProfile: "personal-profile",
        kind: "alchemy-profile",
      },
      credentialProfile: "personal-profile",
      deploymentStatePath: path.join(deploymentStateRoot, "formless.instance.json"),
      deploymentStateRoot,
      localSecretPath: path.join(deploymentStateRoot, "deploy.env"),
      manifest: {
        version: 1,
        kind: "formless-instance-workspace",
        name: "personal-sites",
        state: { root: "state" },
        defaultTarget: "remote",
        targets: [selectedTarget],
        media: { root: "media" },
        local: { stateRoot: ".formless/local", secretStateRoot: ".formless" },
        packages: { links: [] },
        defaultAppPolicy: "declared-installs",
        apps: [workspaceApp("david", "David Peek")],
      },
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
    const localDavid = appArchive("david", "David Peek", {
      mediaBytes: Buffer.from([4, 5, 6]),
      records: mediaRecords(),
    });
    const fetcher = pushArchiveFetch(
      requests,
      [installedSite("david", "David Peek"), installedSite("extra", "Extra")],
      {
        david: { records: [] },
        extra: { records: [] },
      },
      [
        {
          ok: false,
          errors: [{ message: 'Installed app "david" already exists.' }],
        },
      ],
      [],
      controlPlaneRecords(),
    );

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid, Buffer.from([4, 5, 6]));
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

    const restoreRequest = requests.at(-1);
    const restoreBody = capturedRequestJson<{
      archive: {
        restorePolicy: unknown;
      };
      exactInstanceReplacement: boolean;
    }>(restoreRequest);

    expect(`${restoreRequest?.method} ${restoreRequest?.url}`).toBe(
      "POST https://personal.dpeek.workers.dev/api/formless/archive/restore",
    );
    expect(restoreRequest?.headers.authorization).toBe("Bearer local-token");
    expect(restoreBody.archive.restorePolicy).toEqual({
      dryRun: true,
      installCollisions: "replace",
    });
    expect(restoreBody.exactInstanceReplacement).toBe(true);
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
    const localDavid = appArchive("david", "David Peek");
    const readFetch = pushArchiveFetch(requests, [], {}, [
      restorePlan({ createdInstalls: ["david"] }),
      restoreReport({ createdInstalls: ["david"] }),
    ]);
    let missingTargetReads = 0;
    const firstPushFetch: typeof fetch = async (url, init) => {
      const requestUrl =
        typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      const parsedUrl = new URL(requestUrl);
      const method = init?.method ?? "GET";

      if (
        method === "GET" &&
        parsedUrl.pathname === "/api/formless/app-installs" &&
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
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ credentialRef: "formless-cloudflare-oauth:default" }),
    );
    await writeTestFormlessCloudflareOAuthCredential(workspaceRoot);
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);

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
    const localDavid = appArchive("david", "David Peek");
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
        parsedUrl.pathname === "/api/formless/app-installs" &&
        missingTargetReads === 0
      ) {
        missingTargetReads += 1;

        return missingWorkersDevScriptResponse();
      }

      throw new Error(`Unexpected request in missing target dry-run: ${method} ${requestUrl}`);
    };

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ credentialRef: "formless-cloudflare-oauth:default" }),
    );
    await writeTestFormlessCloudflareOAuthCredential(workspaceRoot);
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);
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
      "GET https://personal.dpeek.workers.dev/api/formless/app-installs",
    ]);
    expect(logs).toHaveLength(1);
  });

  it("runs Cloudflare OAuth preflight before non-dry-run push with an Alchemy credential ref", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const openedUrls: string[] = [];
    const accountDiscoveryInputs: Array<{ credentialProfile: string | null }> = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const localDavid = appArchive("david", "David Peek");
    const cloudflareAccount = {
      id: "account-123",
      name: "Personal",
      workersDevSubdomain: "dpeek",
    };
    const authorizationUrl = "https://dash.cloudflare.com/oauth2/auth?client_id=formless";
    const fetcher = cloudflareOAuthAccountFetch(
      pushArchiveFetch(
        requests,
        [installedSite("david", "David Peek")],
        {
          david: { mediaBytes: Buffer.from([1]), records: publishRecords() },
        },
        [
          restorePlan({ replacedInstalls: ["david"] }),
          restoreReport({ replacedInstalls: ["david"] }),
        ],
      ),
      cloudflareAccount,
    );

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ credentialRef: "alchemy-profile:default" }),
    );
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid]),
    );
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);
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

    const snapshot = await readInstanceWorkspaceControlPlaneStorageSnapshot({
      manifest: parseFormlessInstanceWorkspaceManifestJson(
        await readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
      ),
      packageResolver: bundledAppPackageResolver,
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
    const localDavid = appArchive("david", "David Peek");
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
          createdAt: now,
          credentialRef: "formless-cloudflare-oauth:staging",
          enabled: true,
          label: "Staging",
          providerFamily: "cloudflare",
          targetId: "staging",
          targetKind: "instance",
          targetUrl: "https://staging-sites.old.workers.dev",
          updatedAt: now,
          workerName: "staging-sites",
        },
      },
    ] satisfies StoredRecord[];
    const delegate = cloudflareOAuthAccountFetch(
      pushArchiveFetch(
        requests,
        [installedSite("david", "David Peek")],
        {
          david: { mediaBytes: Buffer.from([1]), records: publishRecords() },
        },
        [
          restorePlan({ replacedInstalls: ["david"] }),
          restoreReport({ replacedInstalls: ["david"] }),
        ],
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
            target: { kind: "instance", targetId: "staging" },
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
          target: { kind: "instance", targetId: "staging" },
        });
      }

      return delegate(url, init);
    };

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot, stagingControlPlane);
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid]),
    );
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);
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

    const snapshot = await readInstanceWorkspaceControlPlaneStorageSnapshot({
      manifest: parseFormlessInstanceWorkspaceManifestJson(
        await readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
      ),
      packageResolver: bundledAppPackageResolver,
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
    const localDavid = appArchive("david", "David Peek");
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
      [installedSite("david", "David Peek")],
      {
        david: { mediaBytes: Buffer.from([1]), records: publishRecords() },
      },
      [
        restorePlan({ replacedInstalls: ["david"] }),
        restoreReport({ replacedInstalls: ["david"] }),
      ],
    );

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ credentialRef: "alchemy-profile:default" }),
    );
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid]),
    );
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);
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

    const snapshot = await readInstanceWorkspaceControlPlaneStorageSnapshot({
      manifest: parseFormlessInstanceWorkspaceManifestJson(
        await readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
      ),
      packageResolver: bundledAppPackageResolver,
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
    const localDavid = appArchive("david", "David Peek");
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
      [installedSite("david", "David Peek")],
      {
        david: { mediaBytes: Buffer.from([1]), records: publishRecords() },
      },
      [
        restorePlan({ replacedInstalls: ["david"] }),
        restoreReport({ replacedInstalls: ["david"] }),
      ],
    );

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ credentialRef: "alchemy-profile:default" }),
    );
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid]),
    );
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);
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

    const snapshot = await readInstanceWorkspaceControlPlaneStorageSnapshot({
      manifest: parseFormlessInstanceWorkspaceManifestJson(
        await readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
      ),
      packageResolver: bundledAppPackageResolver,
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
    const localDavid = appArchive("david", "David Peek");
    const fetcher = pushArchiveFetch(
      requests,
      [installedSite("david", "David Peek")],
      {
        david: { mediaBytes: Buffer.from([1]), records: publishRecords() },
      },
      [restorePlan({ replacedInstalls: ["david"] })],
    );

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ credentialRef: "alchemy-profile:default" }),
    );
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid]),
    );
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);
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
    const localDavid = appArchive("david", "David Peek");
    const fetcher = pushArchiveFetch(
      requests,
      [installedSite("david", "David Peek")],
      {
        david: { mediaBytes: Buffer.from([1]), records: publishRecords() },
      },
      [restorePlan({ replacedInstalls: ["david"] })],
    );

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ credentialRef: "formless-cloudflare-oauth:default" }),
    );
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid]),
    );
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);
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
    const localDavid = appArchive("david", "David Peek");
    const delegate = pushArchiveFetch(
      requests,
      [installedSite("david", "David Peek")],
      {
        david: { mediaBytes: Buffer.from([1]), records: publishRecords() },
      },
      [
        restorePlan({ replacedInstalls: ["david"] }),
        restoreReport({ replacedInstalls: ["david"] }),
      ],
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

    await writeWorkspaceManifest(workspaceRoot);
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
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);
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
    const controlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
      manifest: parseFormlessInstanceWorkspaceManifestJson(
        await readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
      ),
      packageResolver: bundledAppPackageResolver,
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
    const localDavid = appArchive("david", "David Peek", { records: [] });
    const fetcher = pushArchiveFetch(
      requests,
      [installedSite("david", "David Peek")],
      { david: { records: [] } },
      [],
      [],
      controlPlaneRecords({ credentialRef: "formless-cloudflare-oauth:default" }),
    );

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ credentialRef: "formless-cloudflare-oauth:default" }),
    );
    await writeTestFormlessCloudflareOAuthCredential(workspaceRoot);
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);
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
    const localDavid = appArchive("david", "David Peek", { records: [] });
    const fetcher = pushArchiveFetch(
      requests,
      [installedSite("david", "David Peek")],
      { david: { records: [] } },
      [],
      [],
      controlPlaneRecords({ credentialRef: "formless-cloudflare-oauth:default" }),
    );

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ credentialRef: "formless-cloudflare-oauth:default" }),
    );
    await writeTestFormlessCloudflareOAuthCredential(workspaceRoot);
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);
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
    const localDavid = appArchive("david", "David Peek");
    const fetcher = pushArchiveFetch(
      requests,
      [installedSite("david", "David Peek")],
      {
        david: { mediaBytes: Buffer.from([1]), records: publishRecords() },
      },
      [restorePlan({ replacedInstalls: ["david"] })],
    );

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot, [
      ...controlPlaneRecords(),
      redirectRouteRecord("old.dpeek.com", "dpeek.com"),
    ]);
    await writeArchiveDirectory(path.join(workspaceRoot, "archives/instance"), {
      ...instanceArchive([localDavid]),
      capabilities: [
        "installed-app-registry",
        "schema-owned-control-plane",
        "app-store-snapshots",
        "core-media-assets",
      ],
      controlPlane: controlPlaneSnapshot([redirectRouteRecord("old.dpeek.com", "dpeek.com")]),
    });
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);
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
    const restoreBody = capturedRequestJson<{ archive: InstanceArchive }>(restoreRequest);

    expect(
      restoreBody.archive.controlPlane?.records.map((record) => `${record.entity}:${record.id}`),
    ).toContain("route:route:redirect:old.dpeek.com");
    expect(
      restoreBody.archive.controlPlane?.records.find(
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
    expect(JSON.stringify(restoreBody.archive.controlPlane)).not.toContain("redirect-intent");
    expect(logs).toHaveLength(1);
  });

  it("backs up, dry-runs, and applies instance workspace push by default", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const localDavid = appArchive("david", "David Peek");
    const fetcher = pushArchiveFetch(
      requests,
      [installedSite("david", "David Peek")],
      {
        david: { mediaBytes: Buffer.from([1]), records: publishRecords() },
      },
      [
        restorePlan({ replacedInstalls: ["david"] }),
        restoreReport({ replacedInstalls: ["david"] }),
      ],
    );

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ credentialRef: "formless-cloudflare-oauth:default" }),
    );
    await writeTestFormlessCloudflareOAuthCredential(workspaceRoot);
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid]),
    );
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);
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
    const localDavid = appArchive("david", "David Peek");
    const fetcher = pushArchiveFetch(
      requests,
      [installedSite("david", "David Peek")],
      {
        david: { mediaBytes: Buffer.from([9]), records: publishRecords() },
      },
      [
        restorePlan({ replacedInstalls: ["david"] }),
        restoreReport({ replacedInstalls: ["david"] }),
      ],
    );

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ credentialRef: "formless-cloudflare-oauth:default" }),
    );
    await writeTestFormlessCloudflareOAuthCredential(workspaceRoot);
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid]),
    );
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);
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

    await writeWorkspaceManifest(workspaceRoot);
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
    const nameSelections: Array<{ defaultName: string; workspaceRoot: string }> = [];
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
      FORMLESS_LAUNCH_FIXTURE: "empty",
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
      "GET http://localhost:4443/api/formless/app-installs",
      "GET http://localhost:4443/api/formless/app-installs",
    ]);
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer generated-token",
      "Bearer generated-token",
    ]);
    expect(openedUrls).toEqual([]);
    expect(
      parseFormlessInstanceWorkspaceManifestJson(
        await readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
      ),
    ).toEqual(layoutWorkspaceManifest("confirmed-workspace"));
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
      "GET http://localhost:4443/api/formless/app-installs",
      "GET http://localhost:4443/api/formless/app-installs",
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
      "GET http://localhost:5174/api/formless/app-installs",
      "GET http://localhost:5174/api/formless/app-installs",
    ]);
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer generated-token",
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
      "GET http://127.0.0.1:5174/api/formless/app-installs",
      "GET http://127.0.0.1:5174/api/formless/app-installs",
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
      FORMLESS_LAUNCH_FIXTURE: "empty",
      FORMLESS_RUNTIME_PROFILE: "instance",
      FORMLESS_WRANGLER_PERSIST: path.join(workspaceRoot, ".formless/local/wrangler"),
      PORT: "4443",
      VITE_FORMLESS_RUNTIME_PROFILE: "instance",
    });
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer generated-token",
      "Bearer generated-token",
    ]);
    expect(
      parseFormlessInstanceWorkspaceManifestJson(
        await readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
      ),
    ).toEqual(layoutWorkspaceManifest(expectedWorkspaceName(workspaceRoot)));
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
        path: PORTABLE_ARCHIVE_MANIFEST_FILE,
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

  it("runs instance workspace dev with product profile, isolated persistence, and first-run archive restore from storage state", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const child = new FakeCliDevChild();
    const logs: string[] = [];
    const requests: CapturedFetchRequest[] = [];
    const spawnCalls: CapturedSpawn[] = [];
    const localDavid = appArchive("david", "David Peek", {
      mediaBytes: Buffer.from([4, 5, 6]),
      records: mediaRecords(),
    });

    await writeWorkspaceManifest(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless/local"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/local/dev.env"),
      "FORMLESS_ADMIN_TOKEN=persisted-local-admin\nFORMLESS_OWNER_SESSION_SECRET=persisted-owner-session\n",
    );
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot, localOnlyControlPlaneRecords());
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid, Buffer.from([4, 5, 6]));

    const run = runFormlessCli(
      ["dev", "--workspace", workspaceRoot],
      cliDeps(tempDir, {
        env: {
          FORMLESS_ADMIN_TOKEN: "remote-token",
          KEEP: "value",
          PORT: "4444",
        },
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
    expect(spawnCalls[0]).toMatchObject({
      args: ["run", "vp", "dev", "--port", "4444", "--strictPort"],
      command: "bun",
      cwd: "/package",
    });
    expect(spawnCalls[0]?.env).toMatchObject({
      FORMLESS_ADMIN_TOKEN: "persisted-local-admin",
      FORMLESS_LAUNCH_FIXTURE: "empty",
      FORMLESS_OWNER_SESSION_SECRET: "persisted-owner-session",
      [LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV]: expect.any(String),
      FORMLESS_RUNTIME_PROFILE: "instance",
      FORMLESS_WRANGLER_PERSIST: path.join(workspaceRoot, ".formless/local/wrangler"),
      KEEP: "value",
      PORT: "4444",
      VITE_FORMLESS_RUNTIME_PROFILE: "instance",
    });
    expect(spawnCalls[0]?.env?.[LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV]).not.toBe(
      "persisted-local-admin",
    );
    await expect(
      readFile(path.join(workspaceRoot, ".formless/local/dev.env"), "utf8"),
    ).resolves.toBe(
      "FORMLESS_ADMIN_TOKEN=persisted-local-admin\nFORMLESS_OWNER_SESSION_SECRET=persisted-owner-session\n",
    );
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET http://localhost:4444/api/formless/app-installs",
      "GET http://localhost:4444/api/formless/app-installs",
      "POST http://localhost:4444/api/formless/archive/restore",
    ]);
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer persisted-local-admin",
      "Bearer persisted-local-admin",
      "Bearer persisted-local-admin",
    ]);

    const restoreRequest = requests.at(-1);
    const restoreBody = capturedRequestJson<{
      archive: InstanceArchive;
      mediaFiles: { bytesBase64: string }[];
    }>(restoreRequest);

    expect(restoreRequest?.headers.authorization).toBe("Bearer persisted-local-admin");
    expect(restoreBody.archive.restorePolicy).toEqual({
      dryRun: false,
      installCollisions: "reject",
    });
    expect(restoreBody.archive.controlPlane?.records.map((record) => record.entity)).toEqual([
      "app-install",
      "route",
      "route",
    ]);
    expect(restoreBody.archive.apps.map((app) => app.app.installId)).toEqual(["david"]);
    expect(restoreBody.archive.apps[0]?.data.kind).toBe(STORAGE_SNAPSHOT_KIND);
    expect(JSON.stringify(restoreBody.archive.controlPlane)).not.toContain(
      "media/images/cover.png",
    );
    expect(restoreBody.mediaFiles[0]?.bytesBase64).toBe(Buffer.from([4, 5, 6]).toString("base64"));
    expect(logs).toEqual([devSessionBootstrapUrlLogLine(logs)]);
    expect(child.killed).toBe(false);
  });

  it("starts workspace dev with a linked private app package and clean install records", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "instance");
    const packageRoot = path.join(tempDir, "app");
    const child = new FakeCliDevChild();
    const logs: string[] = [];
    const requests: CapturedFetchRequest[] = [];
    const spawnCalls: CapturedSpawn[] = [];
    const sourceSchemaHash = await computeSourceSchemaHash(taskSourceSchema);

    await writeWorkspaceManifest(workspaceRoot, {
      apps: [],
      runtime: {
        extensions: {
          [SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY]: {
            browser: "renderers/site-public.browser.tsx",
            worker: "renderers/site-public.worker.tsx",
          },
        },
      },
    });
    await writeWorkspacePackageLinks(workspaceRoot, "../app/formless.app.json");
    await writePrivatePackageFixture(packageRoot, sourceSchemaHash);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      privateControlPlaneRecords(sourceSchemaHash),
    );
    await writeWorkspaceAppStateFromArchive(workspaceRoot, privateAppArchive(sourceSchemaHash));

    const run = runFormlessCli(
      ["dev", "--workspace", workspaceRoot],
      cliDeps(tempDir, {
        env: { PORT: "4451" },
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

    const runtimePackages = spawnCalls[0]?.env?.[FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME];
    const runtimeExtensions = spawnCalls[0]?.env?.[FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME];

    expect(spawnCalls[0]?.env?.[FORMLESS_SITE_PROJECT_ROOT_ENV_NAME]).toBe(workspaceRoot);
    expect(runtimePackages).toContain('"packageAppKey": "private-labs"');
    expect(runtimePackages).toContain('"sourceSchema"');
    expect(runtimePackages).not.toContain("../app/formless.app.json");
    expect(runtimePackages).not.toContain(packageRoot);
    expect(runtimePackages).not.toContain("public-renderer");
    expect(JSON.parse(runtimeExtensions ?? "")).toEqual({
      [SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY]: {
        browser: "renderers/site-public.browser.tsx",
        worker: "renderers/site-public.worker.tsx",
      },
    });

    const restoreBody = capturedRequestJson<{
      archive: InstanceArchive;
      mediaFiles: { bytesBase64: string }[];
    }>(requests.at(-1));
    const controlPlaneJson = JSON.stringify(restoreBody.archive.controlPlane);
    const appInstall = restoreBody.archive.controlPlane?.records.find(
      (record) => record.entity === "app-install",
    );
    const routes = restoreBody.archive.controlPlane?.records.filter(
      (record) => record.entity === "route",
    );

    expect(appInstall?.values).toMatchObject({
      installId: "labs",
      packageAppKey: "private-labs",
      sourceSchemaHash,
    });
    expect(
      routes
        ?.map((record) => record.values.matchPath)
        .sort((left, right) => String(left).localeCompare(String(right))),
    ).toEqual(["/apps/labs"]);
    expect(restoreBody.archive.apps[0]?.app).toMatchObject({
      installId: "labs",
      packageAppKey: "private-labs",
      sourceSchemaHash,
      sourceSchemaKey: "private-labs",
    });
    expect(controlPlaneJson).toContain("private-labs");
    expect(controlPlaneJson).not.toContain("../app");
    expect(controlPlaneJson).not.toContain("formless.app.json");
    expect(controlPlaneJson).not.toContain(packageRoot);
    expect(restoreBody.mediaFiles).toEqual([]);
    expect(logs).toEqual([devSessionBootstrapUrlLogLine(logs)]);
  });

  it("rejects missing local app state before local dev restore", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const child = new FakeCliDevChild();
    const requests: CapturedFetchRequest[] = [];

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot, localOnlyControlPlaneRecords());

    await expect(
      runFormlessCli(
        ["dev", "--workspace", workspaceRoot],
        cliDeps(tempDir, {
          env: { PORT: "4447" },
          fetch: localInstanceDevFetch(requests, []),
          spawn: ((_command: string, _args: string[], options: CapturedSpawnOptions) => {
            announceFakeCliDevServer(child, options.env);

            return child as unknown as ReturnType<typeof spawn>;
          }) as typeof spawn,
        }),
      ),
    ).rejects.toThrow(
      "Formless instance local dev requires local app state state/apps/david.json.",
    );

    expect(child.killed).toBe(false);
    expect(requests).toEqual([]);
  });

  it("rejects mismatched app state identity and package facts before local dev restore", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const child = new FakeCliDevChild();

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot, localOnlyControlPlaneRecords());
    await writeWorkspaceAppStateFromArchive(
      workspaceRoot,
      appArchive("james", "James Peek"),
      undefined,
      "david",
    );

    await expect(
      runFormlessCli(
        ["dev", "--workspace", workspaceRoot],
        cliDeps(tempDir, {
          env: { PORT: "4448" },
          fetch: localInstanceDevFetch([], []),
          spawn: ((_command: string, _args: string[], options: CapturedSpawnOptions) => {
            announceFakeCliDevServer(child, options.env);

            return child as unknown as ReturnType<typeof spawn>;
          }) as typeof spawn,
        }),
      ),
    ).rejects.toThrow('Storage snapshot storageIdentity must be "app:david".');

    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      localOnlyControlPlaneRecords().map((record) =>
        record.entity === "app-install"
          ? {
              ...record,
              values: {
                ...record.values,
                packageRevision: 999,
              },
            }
          : record,
      ),
    );
    await writeWorkspaceAppStateFromArchive(workspaceRoot, appArchive("david", "David Peek"));

    await expect(
      runFormlessCli(
        ["dev", "--workspace", workspaceRoot],
        cliDeps(tempDir, {
          env: { PORT: "4449" },
          fetch: localInstanceDevFetch([], []),
          spawn: ((_command: string, _args: string[], _options: CapturedSpawnOptions) =>
            child as unknown as ReturnType<typeof spawn>) as typeof spawn,
        }),
      ),
    ).rejects.toThrow(
      'Formless instance local dev app install "david" has package revision 999, expected 1.',
    );
  });

  it("rejects missing media payloads before local dev restore", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const child = new FakeCliDevChild();
    const localDavid = appArchive("david", "David Peek", {
      mediaBytes: Buffer.from([4, 5, 6]),
      records: mediaRecords(),
    });

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot, localOnlyControlPlaneRecords());
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);

    await expect(
      runFormlessCli(
        ["dev", "--workspace", workspaceRoot],
        cliDeps(tempDir, {
          env: { PORT: "4450" },
          fetch: localInstanceDevFetch([], []),
          spawn: ((_command: string, _args: string[], options: CapturedSpawnOptions) => {
            announceFakeCliDevServer(child, options.env);

            return child as unknown as ReturnType<typeof spawn>;
          }) as typeof spawn,
        }),
      ),
    ).rejects.toThrow(
      "Formless instance local dev app state state/apps/david.json is missing media files: media/david/media/images/cover.png.",
    );
  });

  it("rejects secret-looking control-plane storage state before local dev restore", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const child = new FakeCliDevChild();
    const manifestPath = path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE);

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecordsWithDisabledDeployTarget(),
    );

    const manifest = parseFormlessInstanceWorkspaceManifestJson(
      await readFile(manifestPath, "utf8"),
    );
    const deploymentConfigSourcePath = instanceWorkspaceInstanceStatePath(workspaceRoot, manifest);
    const deploymentConfigSource = JSON.parse(
      await readFile(deploymentConfigSourcePath, "utf8"),
    ) as { records: StoredRecord[] };

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

    await writeWorkspaceManifest(workspaceRoot);
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
      FORMLESS_LAUNCH_FIXTURE: "empty",
      FORMLESS_RUNTIME_PROFILE: "instance",
      FORMLESS_WRANGLER_PERSIST: path.join(workspaceRoot, ".formless/local/wrangler"),
      PORT: "4446",
      VITE_FORMLESS_RUNTIME_PROFILE: "instance",
    });
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET http://localhost:4446/api/formless/app-installs",
      "GET http://localhost:4446/api/formless/app-installs",
    ]);
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer generated-token",
      "Bearer generated-token",
    ]);
    expect(logs).toEqual([devSessionBootstrapUrlLogLine(logs)]);
  });

  it("keeps existing workspace-local installs on instance dev rerun", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const child = new FakeCliDevChild();
    const logs: string[] = [];
    const requests: CapturedFetchRequest[] = [];

    await writeWorkspaceManifest(workspaceRoot);

    const run = runFormlessCli(
      ["dev", "--workspace", workspaceRoot],
      cliDeps(tempDir, {
        env: { PORT: "4445" },
        fetch: localInstanceDevFetch(requests, [installedSite("david", "David Peek")]),
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
      "GET http://localhost:4445/api/formless/app-installs",
      "GET http://localhost:4445/api/formless/app-installs",
    ]);
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer generated-token",
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

    await writeWorkspaceManifest(workspaceRoot);
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

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot, localOnlyControlPlaneRecords());
    await writeWorkspaceAppStateFromArchive(workspaceRoot, appArchive("david", "David Peek"));
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
      "GET http://localhost:4450/api/formless/app-installs",
      "GET http://localhost:4450/api/formless/app-installs",
      "POST http://localhost:4450/api/formless/archive/restore",
    ]);
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer generated-token",
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

    await writeWorkspaceManifest(workspaceRoot);
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

    await writeWorkspaceManifest(workspaceRoot);
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

    await writeWorkspaceManifest(workspaceRoot);
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
      path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE),
      formatFormlessInstanceWorkspaceManifest({
        version: 1,
        kind: "formless-instance-workspace",
        name: "personal-sites",
        targets: [],
        local: { stateRoot: ".formless/local", secretStateRoot: ".formless" },
        defaultAppPolicy: "declared-installs",
        apps: [workspaceApp("david", "David Peek")],
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

    await writeWorkspaceManifest(workspaceRoot);
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

    await writeWorkspaceManifest(workspaceRoot);
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

  it("exports app archives and restores them through the archive API", async () => {
    const tempDir = await makeTempDir();
    const outDir = path.join(tempDir, "personal-backup");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const sourceSnapshotRecords = mediaRecords();

    responses.queueJson({
      packages: listInstallableAppPackages(bundledAppPackageResolver),
      installs: [
        {
          adminRoute: "/apps/personal",
          createdAt: "2026-05-01T00:00:00.000Z",
          installId: "personal",
          label: "Personal",
          packageAppKey: "site",
          publicRoute: "/sites/personal",
          publicRoutePrefix: "/sites/personal/",
          registrationPolicy: "closed",
          status: "installed",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });
    responses.queueJson(snapshot(sourceSnapshotRecords));
    responses.queueBinary(Buffer.from([4, 5, 6]), "image/png");

    await exportAppArchive(
      {
        installId: "personal",
        outDir,
        target: "https://instance.example",
      },
      cliDeps(tempDir, {
        env: { FORMLESS_ADMIN_TOKEN: "export-token" },
        fetch: responses.fetcher(requests),
      }),
    );

    const archivePath = path.join(outDir, PORTABLE_ARCHIVE_MANIFEST_FILE);
    const archive = parsePortableArchive(
      JSON.parse(await readFile(archivePath, "utf8")) as unknown,
      { packageResolver: bundledAppPackageResolver },
    );

    if (archive.kind !== APP_ARCHIVE_KIND) {
      throw new Error("Expected app archive.");
    }

    expect(archive.app.installId).toBe("personal");
    expect(archive.capabilities).toEqual(["app-store-snapshots", "core-media-assets"]);
    expectPortableArchiveExcludesRuntimeExtensions(archive);
    expect(archive.media.objects).toEqual([
      expect.objectContaining({
        archivePath: "media/personal/media/images/cover.png",
        deliveryHref: "/api/formless/media/media/images/cover.png",
        storageKey: "media/images/cover.png",
      }),
    ]);
    await expect(
      readFile(path.join(outDir, "media/personal/media/images/cover.png")),
    ).resolves.toEqual(Buffer.from([4, 5, 6]));
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://instance.example/api/formless/app-installs",
      "GET https://instance.example/api/app-installs/site/personal/snapshot",
      "GET https://instance.example/api/formless/media/media/images/cover.png",
    ]);
    expect(requests.slice(0, 3).map((request) => request.headers.authorization)).toEqual([
      "Bearer export-token",
      "Bearer export-token",
      "Bearer export-token",
    ]);

    responses.queueJson({
      ok: true,
      report: {
        applied: true,
        summary: {
          appCount: 1,
          createdInstalls: ["personal-copy"],
          mediaCountsByApp: { "personal-copy": 1 },
          recordCountsByApp: { "personal-copy": { total: sourceSnapshotRecords.length } },
          replacedInstalls: [],
        },
      },
    });

    await restoreAppArchive(
      {
        adminToken: "secret",
        apply: true,
        archiveDir: outDir,
        installId: "personal-copy",
        replace: false,
        target: "https://instance.example",
      },
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
      }),
    );

    const restoreRequest = requests.at(-1);
    const restoreBody = capturedRequestJson<{
      archive: AppArchive;
      mediaFiles: { bytesBase64: string }[];
    }>(restoreRequest);

    expect(`${restoreRequest?.method} ${restoreRequest?.url}`).toBe(
      "POST https://instance.example/api/formless/archive/restore",
    );
    expect(restoreRequest?.headers.authorization).toBe("Bearer secret");
    expect(restoreBody.archive.app.installId).toBe("personal-copy");
    expect(restoreBody.archive.restorePolicy).toEqual({
      dryRun: false,
      installCollisions: "reject",
    });
    expect(restoreBody.archive.media.objects[0]).toMatchObject({
      deliveryHref: "/api/formless/media/media/images/cover.png",
      storageKey: "media/images/cover.png",
    });
    expect(restoreBody.mediaFiles[0]?.bytesBase64).toBe(Buffer.from([4, 5, 6]).toString("base64"));
  });

  it("exports installed Tasks app archives without media requests", async () => {
    const tempDir = await makeTempDir();
    const outDir = path.join(tempDir, "tasks-backup");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();

    responses.queueJson({
      packages: listInstallableAppPackages(bundledAppPackageResolver),
      installs: [
        {
          adminRoute: "/apps/work",
          createdAt: "2026-05-01T00:00:00.000Z",
          installId: "work",
          label: "Work Tasks",
          packageAppKey: "tasks",
          ...packageAppFactsForKey("tasks", bundledAppPackageResolver)!,
          registrationPolicy: "closed",
          status: "installed",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });
    responses.queueJson(taskSnapshot(taskSeedRecords));

    await exportAppArchive(
      {
        installId: "work",
        outDir,
        target: "https://instance.example",
      },
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
      }),
    );

    const archivePath = path.join(outDir, PORTABLE_ARCHIVE_MANIFEST_FILE);
    const archive = parsePortableArchive(
      JSON.parse(await readFile(archivePath, "utf8")) as unknown,
      { packageResolver: bundledAppPackageResolver },
    );

    if (archive.kind !== APP_ARCHIVE_KIND) {
      throw new Error("Expected app archive.");
    }

    expect(archive.app).toMatchObject({
      installId: "work",
      packageAppKey: "tasks",
      packageRevision: packageAppFactsForKey("tasks", bundledAppPackageResolver)!.packageRevision,
      sourceSchemaKey: "tasks",
      sourceSchemaHash: packageAppFactsForKey("tasks", bundledAppPackageResolver)!.sourceSchemaHash,
    });
    expect(archive.data).toEqual(taskSnapshot(taskSeedRecords));
    expect(archive.media.objects).toEqual([]);
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://instance.example/api/formless/app-installs",
      "GET https://instance.example/api/app-installs/tasks/work/snapshot",
    ]);
  });

  it("exports and restores mixed instance archives without non-Site media requests", async () => {
    const tempDir = await makeTempDir();
    const outDir = path.join(tempDir, "instance-backup");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const sourceSnapshotRecords = mediaRecords();

    responses.queueJson({
      packages: listInstallableAppPackages(bundledAppPackageResolver),
      installs: [
        {
          adminRoute: "/apps/personal",
          createdAt: "2026-05-01T00:00:00.000Z",
          installId: "personal",
          label: "Personal",
          packageAppKey: "site",
          ...packageAppFactsForKey("site", bundledAppPackageResolver)!,
          publicRoute: "/sites/personal",
          publicRoutePrefix: "/sites/personal/",
          registrationPolicy: "closed",
          status: "installed",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
        {
          adminRoute: "/apps/work",
          createdAt: "2026-05-01T00:00:00.000Z",
          installId: "work",
          label: "Work Tasks",
          packageAppKey: "tasks",
          ...packageAppFactsForKey("tasks", bundledAppPackageResolver)!,
          registrationPolicy: "closed",
          status: "installed",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
        {
          adminRoute: "/apps/sales",
          createdAt: "2026-05-01T00:00:00.000Z",
          installId: "sales",
          label: "Sales CRM",
          packageAppKey: "crm",
          ...packageAppFactsForKey("crm", bundledAppPackageResolver)!,
          registrationPolicy: "closed",
          status: "installed",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });
    responses.queueJson(controlPlaneSnapshot(controlPlaneRecords()));
    responses.queueJson(snapshot(sourceSnapshotRecords));
    responses.queueJson(taskSnapshot(taskSeedRecords));
    responses.queueJson(crmSnapshot(crmSeedRecords, "app:sales"));
    responses.queueBinary(Buffer.from([4, 5, 6]), "image/png");

    await exportInstanceArchive(
      {
        outDir,
        target: "https://instance.example",
      },
      cliDeps(tempDir, {
        env: { FORMLESS_ADMIN_TOKEN: "export-token" },
        fetch: responses.fetcher(requests),
      }),
    );

    const archivePath = path.join(outDir, PORTABLE_ARCHIVE_MANIFEST_FILE);
    const archive = parsePortableArchive(
      JSON.parse(await readFile(archivePath, "utf8")) as unknown,
      { packageResolver: bundledAppPackageResolver },
    );

    if (archive.kind !== INSTANCE_ARCHIVE_KIND) {
      throw new Error("Expected instance archive.");
    }

    const personal = archive.apps.find((app) => app.app.installId === "personal");
    const sales = archive.apps.find((app) => app.app.installId === "sales");
    const work = archive.apps.find((app) => app.app.installId === "work");

    expect(
      archive.apps.map((app) => [
        app.app.installId,
        app.app.packageAppKey,
        app.app.packageRevision,
        app.app.sourceSchemaHash,
      ]),
    ).toEqual([
      [
        "personal",
        "site",
        packageAppFactsForKey("site", bundledAppPackageResolver)!.packageRevision,
        packageAppFactsForKey("site", bundledAppPackageResolver)!.sourceSchemaHash,
      ],
      [
        "sales",
        "crm",
        packageAppFactsForKey("crm", bundledAppPackageResolver)!.packageRevision,
        packageAppFactsForKey("crm", bundledAppPackageResolver)!.sourceSchemaHash,
      ],
      [
        "work",
        "tasks",
        packageAppFactsForKey("tasks", bundledAppPackageResolver)!.packageRevision,
        packageAppFactsForKey("tasks", bundledAppPackageResolver)!.sourceSchemaHash,
      ],
    ]);
    expect(archive.capabilities).toEqual([
      "installed-app-registry",
      "schema-owned-control-plane",
      "app-store-snapshots",
      "core-media-assets",
    ]);
    expectPortableArchiveExcludesRuntimeExtensions(archive);
    for (const app of archive.apps) {
      expectPortableArchiveExcludesRuntimeExtensions(app);
    }
    expect(personal?.media.objects).toEqual([
      expect.objectContaining({
        archivePath: "media/personal/media/images/cover.png",
        storageKey: "media/images/cover.png",
      }),
    ]);
    expect(sales?.media.objects).toEqual([]);
    expect(work?.media.objects).toEqual([]);
    await expect(
      readFile(path.join(outDir, "media/personal/media/images/cover.png")),
    ).resolves.toEqual(Buffer.from([4, 5, 6]));
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://instance.example/api/formless/app-installs",
      "GET https://instance.example/api/formless/control-plane/snapshot?actorKind=cliDeployer",
      "GET https://instance.example/api/app-installs/site/personal/snapshot",
      "GET https://instance.example/api/app-installs/tasks/work/snapshot",
      "GET https://instance.example/api/app-installs/crm/sales/snapshot",
      "GET https://instance.example/api/formless/media/media/images/cover.png",
    ]);
    expect(requests.slice(0, 6).map((request) => request.headers.authorization)).toEqual([
      "Bearer export-token",
      "Bearer export-token",
      "Bearer export-token",
      "Bearer export-token",
      "Bearer export-token",
      "Bearer export-token",
    ]);

    responses.queueJson({
      ok: true,
      report: {
        applied: true,
        summary: {
          appCount: 3,
          createdInstalls: ["personal", "sales", "work"],
          mediaCountsByApp: { personal: 1, sales: 0, work: 0 },
          recordCountsByApp: {
            personal: { total: sourceSnapshotRecords.length },
            sales: { total: crmSeedRecords.length },
            work: { total: taskSeedRecords.length },
          },
          replacedInstalls: [],
        },
      },
    });

    await restorePortableArchive(
      {
        adminToken: "secret",
        apply: true,
        archiveDir: outDir,
        replace: false,
        target: "https://instance.example",
      },
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
      }),
    );

    const restoreRequest = requests.at(-1);
    const restoreBody = capturedRequestJson<{
      archive: InstanceArchive;
      mediaFiles: { bytesBase64: string }[];
    }>(restoreRequest);

    expect(`${restoreRequest?.method} ${restoreRequest?.url}`).toBe(
      "POST https://instance.example/api/formless/archive/restore",
    );
    expect(restoreRequest?.headers.authorization).toBe("Bearer secret");
    expect(restoreBody.archive.kind).toBe(INSTANCE_ARCHIVE_KIND);
    expect(restoreBody.archive.restorePolicy).toEqual({
      dryRun: false,
      installCollisions: "reject",
    });
    expect(
      restoreBody.archive.apps.find((app) => app.app.installId === "sales")?.media.objects,
    ).toEqual([]);
    expect(
      restoreBody.archive.apps.find((app) => app.app.installId === "work")?.media.objects,
    ).toEqual([]);
    expect(restoreBody.mediaFiles).toHaveLength(1);
    expect(restoreBody.mediaFiles[0]?.bytesBase64).toBe(Buffer.from([4, 5, 6]).toString("base64"));
  });

  it("omits upgrade planning from archive restore dry-run without mutating target", async () => {
    const tempDir = await makeTempDir();
    const outDir = path.join(tempDir, "instance-restore");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();

    await writeArchiveDirectory(outDir, instanceArchive([appArchive("david", "David Peek")]));
    responses.queueJson({ setupComplete: true });
    responses.queueJson({
      packages: listInstallableAppPackages(bundledAppPackageResolver),
      installs: [installedSite("david", "David Peek")],
    });
    responses.queueJson(restorePlan({ replacedInstalls: ["david"] }));

    const result = await restorePortableArchive(
      {
        adminToken: null,
        apply: false,
        archiveDir: outDir,
        replace: false,
        target: "https://instance.example",
      },
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
      }),
    );

    const restoreRequest = requests.at(-1);
    const restoreBody = capturedRequestJson<{ archive: InstanceArchive }>(restoreRequest);

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "POST https://instance.example/api/formless/archive/restore",
    ]);
    expect(restoreBody.archive.restorePolicy).toEqual({
      dryRun: true,
      installCollisions: "reject",
    });
    expect(result.archivePath).toBe(path.join(outDir, PORTABLE_ARCHIVE_MANIFEST_FILE));
    expect(result).not.toHaveProperty("upgradePlanning");
  });

  it("rejects unsupported archive versions before restore mutation", async () => {
    const tempDir = await makeTempDir();
    const outDir = path.join(tempDir, "unsupported-instance-restore");
    const requests: CapturedFetchRequest[] = [];

    await mkdir(outDir, { recursive: true });
    await writeFile(
      path.join(outDir, PORTABLE_ARCHIVE_MANIFEST_FILE),
      `${JSON.stringify(
        {
          ...instanceArchive([appArchive("david", "David Peek")]),
          version: 0,
        },
        null,
        2,
      )}\n`,
    );

    await expect(
      restorePortableArchive(
        {
          adminToken: null,
          apply: true,
          archiveDir: outDir,
          replace: false,
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

function expectPortableArchiveExcludesRuntimeExtensions(archive: AppArchive | InstanceArchive) {
  const serialized = JSON.stringify(archive);

  expect(serialized).not.toContain("site.publicRenderer");
  expect(serialized).not.toContain("runtime.extensions");
  expect(serialized).not.toContain("FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS");
  expect(serialized).not.toContain("virtual:formless/site-public-renderer");
  expect(serialized).not.toContain("site-public-renderer");
  expect(serialized).not.toContain("public-renderer.browser.tsx");
  expect(serialized).not.toContain("public-renderer.worker.tsx");
  expect(serialized).not.toContain("extensionDigest");
  expect(serialized).not.toContain("runtimeExtensionDigest");
}

function expectNoOwnerSetupProtectedBootstrapReads(requests: CapturedFetchRequest[]) {
  const forbiddenPrefixes = [
    "/api/formless/app-installs",
    "/api/formless/archive",
    "/api/formless/control-plane",
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

async function writeWorkspaceManifest(
  workspaceRoot: string,
  options: {
    apps?: TestWorkspaceApp[];
    domains?: Array<{
      enabled: boolean;
      host: string;
      profile: "app" | "instance" | "publicSite";
      targetInstallId?: string;
    }>;
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
      defaultTarget: "remote",
      targets: [{ alias: "remote", url: "https://personal.dpeek.workers.dev" }],
      local: { stateRoot: ".formless/local", secretStateRoot: ".formless" },
      defaultAppPolicy: "declared-installs",
      apps: options.apps ?? [workspaceApp("david", "David Peek")],
      ...(options.domains === undefined ? {} : { domains: options.domains }),
      ...(options.runtime === undefined ? {} : { runtime: options.runtime }),
    }),
  );
}

async function writeWorkspacePackageLinks(workspaceRoot: string, manifest: string) {
  const manifestPath = path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE);
  const workspaceManifest = parseFormlessInstanceWorkspaceManifestJson(
    await readFile(manifestPath, "utf8"),
  );

  await writeFile(
    manifestPath,
    formatFormlessInstanceWorkspaceManifest({
      ...workspaceManifest,
      packages: {
        links: [{ manifest }],
      },
    }),
  );
}

async function writePrivatePackageFixture(packageRoot: string, sourceSchemaHash: SourceSchemaHash) {
  const sourceRoot = path.join(packageRoot, "source");

  await mkdir(sourceRoot, { recursive: true });
  await writeJsonFile(path.join(sourceRoot, "schema.json"), taskSourceSchema);
  await writeJsonFile(path.join(sourceRoot, "seed-records.json"), []);
  await writeJsonFile(
    path.join(packageRoot, "formless.app.json"),
    privatePackageManifest(sourceSchemaHash),
  );
}

function privatePackageManifest(sourceSchemaHash: SourceSchemaHash): Record<string, unknown> {
  return {
    kind: appPackageManifestKind,
    version: appPackageManifestVersion,
    packageAppKey: "private-labs",
    label: "Private Labs",
    description: "Private lab package fixture.",
    defaultInstallId: "labs",
    supportsMultipleInstalls: false,
    packageRevision: 7,
    sourceSchema: {
      kind: "workspace",
      key: "private-labs",
      path: "source/schema.json",
    },
    seedRecords: {
      kind: "workspace",
      key: "private-labs",
      path: "source/seed-records.json",
    },
    sourceSchemaHash,
    capabilities: [{ kind: "generatedAdmin", routeBase: "/apps" }],
  };
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeWorkspaceControlPlaneStorageSnapshot(
  workspaceRoot: string,
  records: StoredRecord[] = controlPlaneRecords(),
) {
  const manifest = parseFormlessInstanceWorkspaceManifestJson(
    await readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
  );
  const activePackages = await createWorkspaceAppPackageResolver({
    bundledManifests: bundledAppPackageManifests,
    manifest,
    workspaceRoot,
  });

  await writeInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest,
    packageResolver: activePackages.resolver,
    snapshot: controlPlaneSnapshot(records),
    workspaceRoot,
  });
}

type TestWorkspaceApp = ReturnType<typeof workspaceApp> & {
  routes?: {
    admin?: `/apps/${string}`;
    public?: `/sites/${string}`;
  };
};

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

function workspaceApp(installId: string, label: string) {
  return {
    installId,
    packageAppKey: "site",
    label,
    statePath: `state/apps/${installId}.json`,
  };
}

function layoutWorkspaceManifest(name: string) {
  return {
    version: 1,
    kind: "formless-instance-workspace",
    name,
    state: { root: "state" },
    targets: [],
    media: { root: "state/media" },
    local: {
      stateRoot: ".formless/local",
      secretStateRoot: ".formless",
    },
    packages: { links: [] },
    defaultAppPolicy: "none",
    apps: [],
  };
}

function expectedWorkspaceName(workspaceRoot: string): string {
  const basename = path.basename(workspaceRoot);
  const normalized = basename
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "formless-instance";
}

function installedSite(installId: string, label: string) {
  return installedApp(installId, label, "site");
}

function installedApp(installId: string, label: string, packageAppKey: "site" | "tasks") {
  const facts = packageAppFactsForKey(packageAppKey, bundledAppPackageResolver);

  if (!facts) {
    throw new Error(`Missing bundled package facts for ${packageAppKey}.`);
  }

  return {
    adminRoute: `/apps/${installId}` as `/apps/${string}`,
    createdAt: "2026-05-01T00:00:00.000Z",
    installId,
    label,
    packageAppKey,
    packageRevision: facts.packageRevision,
    ...(packageAppKey === "site"
      ? {
          publicRoute: `/sites/${installId}` as `/sites/${string}`,
          publicRoutePrefix: `/sites/${installId}/` as `/sites/${string}/`,
        }
      : {}),
    registrationPolicy: "closed" as const,
    sourceSchemaHash: facts.sourceSchemaHash,
    status: "installed" as const,
    updatedAt: "2026-05-01T00:00:00.000Z",
  };
}

function privateControlPlaneRecords(sourceSchemaHash: SourceSchemaHash): StoredRecord[] {
  const now = "2026-05-26T00:00:00.000Z";

  return [
    {
      id: "labs",
      entity: "app-install",
      values: {
        installId: "labs",
        packageAppKey: "private-labs",
        packageRevision: 7,
        sourceSchemaHash,
        label: "Private Labs",
        registrationPolicy: "closed",
        status: "installed",
        storageIdentity: "app:labs",
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "route:labs:admin",
      entity: "route",
      values: {
        enabled: true,
        matchPath: "/apps/labs",
        kind: "mount",
        targetProfile: "app",
        appInstall: "labs",
        surface: "admin",
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function instanceArchive(apps: AppArchive[]): InstanceArchive {
  return {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: "2026-05-12T00:00:00.000Z",
    capabilities: ["installed-app-registry", "app-store-snapshots", "core-media-assets"],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    apps,
  };
}

function appArchive(
  installId: string,
  label: string,
  options: {
    mediaBytes?: Uint8Array;
    packageAppKey?: string;
    records?: StoredRecord[];
  } = {},
): AppArchive {
  const packageAppKey = options.packageAppKey ?? "site";
  const packageFacts = packageAppFactsForKey(packageAppKey, bundledAppPackageResolver);

  if (!packageFacts) {
    throw new Error(`Missing bundled package facts for ${packageAppKey}.`);
  }

  return {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: "2026-05-12T00:00:00.000Z",
    capabilities: ["app-store-snapshots", "core-media-assets"],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    app: {
      installId,
      packageAppKey,
      packageRevision: packageFacts.packageRevision,
      sourceSchemaKey: "site",
      sourceSchemaHash: packageFacts.sourceSchemaHash,
      label,
      registrationPolicy: "closed",
      status: "installed",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
    data: snapshot(options.records ?? [], `app:${installId}`),
    media: {
      objects: options.mediaBytes
        ? [
            {
              archivePath: `media/${installId}/media/images/cover.png`,
              asset: {
                byteSize: options.mediaBytes.byteLength,
                contentType: "image/png",
                deliveryHref: "/api/formless/media/media/images/cover.png",
                id: "cover.png",
                kind: "image",
                label: "cover.png",
                provider: "r2",
                status: "ready",
                storageKey: "media/images/cover.png",
              },
              byteSize: options.mediaBytes.byteLength,
              contentType: "image/png",
              deliveryHref: "/api/formless/media/media/images/cover.png",
              storageKey: "media/images/cover.png",
            },
          ]
        : [],
    },
  };
}

function privateAppArchive(sourceSchemaHash: SourceSchemaHash): AppArchive {
  return {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: "2026-05-12T00:00:00.000Z",
    capabilities: ["app-store-snapshots", "core-media-assets"],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    app: {
      installId: "labs",
      packageAppKey: "private-labs",
      packageRevision: 7,
      sourceSchemaKey: "private-labs",
      sourceSchemaHash,
      label: "Private Labs",
      registrationPolicy: "closed",
      status: "installed",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
    data: {
      kind: STORAGE_SNAPSHOT_KIND,
      version: STORAGE_SNAPSHOT_VERSION,
      storageIdentity: "app:labs",
      schemaKey: "private-labs",
      exportedAt: "2026-05-12T00:00:00.000Z",
      schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
      sourceCursor: 0,
      schema: taskSourceSchema,
      records: [],
    },
    media: {
      objects: [],
    },
  };
}

async function writeArchiveDirectory(
  archiveRoot: string,
  archive: InstanceArchive | AppArchive,
  mediaByInstall: Record<string, Uint8Array> = {},
) {
  if (archive.kind === APP_ARCHIVE_KIND) {
    const workspaceRoot = workspaceRootFromLegacyAppArchiveRoot(archiveRoot);

    if (workspaceRoot !== undefined) {
      await writeWorkspaceAppStateFromArchive(
        workspaceRoot,
        archive,
        mediaByInstall[archive.app.installId],
        path.basename(archiveRoot),
      );
      return;
    }
  }

  const mediaFiles: ArchiveDiskMediaFile[] = [];

  for (const app of archiveApps(archive)) {
    const bytes = mediaByInstall[app.app.installId];

    if (!bytes) {
      continue;
    }

    const object = app.media.objects[0];

    if (!object) {
      throw new Error(`Expected media object for ${app.app.installId}.`);
    }

    mediaFiles.push({
      archivePath: object.archivePath,
      byteSize: bytes.byteLength,
      bytes,
      contentType: object.contentType,
    });
  }

  await writePortableArchiveDirectory(
    {
      archive,
      mediaFiles,
      outDir: archiveRoot,
      packageResolver: bundledAppPackageResolver,
    },
    { cwd: "/" },
  );
}

function workspaceRootFromLegacyAppArchiveRoot(archiveRoot: string): string | undefined {
  const marker = `${path.sep}archives${path.sep}apps${path.sep}`;
  const index = archiveRoot.lastIndexOf(marker);

  return index < 0 ? undefined : archiveRoot.slice(0, index);
}

async function writeWorkspaceAppStateFromArchive(
  workspaceRoot: string,
  archive: AppArchive,
  mediaBytes?: Uint8Array,
  installId: string = archive.app.installId,
) {
  const manifest = parseFormlessInstanceWorkspaceManifestJson(
    await readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
  );

  if (archive.data.kind !== STORAGE_SNAPSHOT_KIND) {
    throw new Error(
      `Workspace app state for "${archive.app.installId}" must be a storage snapshot.`,
    );
  }

  if (installId === archive.app.installId) {
    await writeInstanceWorkspaceAppStorageSnapshot({
      installId,
      manifest,
      schemaProvenance: {
        kind: "package-app",
        packageAppKey: archive.app.packageAppKey,
        packageRevision: archive.app.packageRevision,
        sourceSchemaHash: archive.app.sourceSchemaHash,
      },
      snapshot: archive.data,
      workspaceRoot,
    });
  } else {
    const statePath = path.join(workspaceRoot, manifest.state.root, "apps", `${installId}.json`);

    await mkdir(path.dirname(statePath), { recursive: true });
    await writeFile(statePath, `${JSON.stringify(archive.data, null, 2)}\n`);
  }

  if (mediaBytes === undefined) {
    return;
  }

  const object = archive.media.objects[0];

  if (!object) {
    throw new Error(`Expected media object for ${archive.app.installId}.`);
  }

  const mediaPath = instanceWorkspaceMediaFilePath(workspaceRoot, manifest, object.archivePath);

  await mkdir(path.dirname(mediaPath), { recursive: true });
  await writeFile(mediaPath, mediaBytes);
}

function archiveFetch(
  requests: CapturedFetchRequest[],
  installs: ReturnType<typeof installedApp>[],
  dataByInstall: Record<string, { mediaBytes?: Uint8Array; records: StoredRecord[] }>,
  extraPackages: InstallableAppPackage[] = [],
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

    if (parsedUrl.pathname === "/api/formless/setup") {
      return Response.json({ setupComplete: true });
    }

    if (parsedUrl.pathname === "/api/formless/app-installs") {
      return Response.json({
        packages: [...listInstallableAppPackages(bundledAppPackageResolver), ...extraPackages],
        installs,
      });
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
        target: { kind: "instance", targetId: desiredState.targetId },
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
        target: { kind: "instance", targetId: desiredState.targetId },
      });
    }

    if (parsedUrl.pathname === "/api/formless/control-plane/operations/deployment-config/update") {
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
              targetKind: "instance",
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

    if (parsedUrl.pathname === "/api/formless/control-plane/bootstrap") {
      if (controlPlaneRecords === undefined) {
        return Response.json({ error: "not found" }, { status: 404 });
      }

      return Response.json({
        cursor: 1,
        records: controlPlaneRecords,
        schema: {},
      });
    }

    if (parsedUrl.pathname === "/api/formless/control-plane/snapshot") {
      if (controlPlaneRecords === undefined) {
        return Response.json({ error: "not found" }, { status: 404 });
      }

      return Response.json(controlPlaneSnapshot(controlPlaneRecords));
    }

    const snapshotMatch = parsedUrl.pathname.match(
      /^\/api\/app-installs\/([^/]+)\/([^/]+)\/snapshot$/,
    );

    if (snapshotMatch) {
      const packageAppKey = snapshotMatch[1] ?? "";
      const installId = snapshotMatch[2] ?? "";

      return Response.json(
        snapshotForPackage(packageAppKey, installId, dataByInstall[installId]?.records ?? []),
      );
    }

    if (parsedUrl.pathname === "/api/formless/media/media/images/cover.png") {
      const mediaBytes = Object.values(dataByInstall).find((data) => data.mediaBytes)?.mediaBytes;

      if (mediaBytes) {
        return new Response(Buffer.from(mediaBytes), {
          headers: { "content-type": "image/png" },
        });
      }
    }

    const mediaMatch = parsedUrl.pathname.match(/^\/api\/app-installs\/site\/([^/]+)\/media\//);

    if (mediaMatch) {
      const installId = mediaMatch[1] ?? "";
      const mediaBytes = dataByInstall[installId]?.mediaBytes;

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
    installId?: string;
    targetUrl?: string;
  } = {},
): StoredRecord[] {
  const host = options.host ?? "dpeek.com";
  const installId = options.installId ?? "david";
  const adminRouteId = `route:${installId}:admin`;
  const publicRouteId = `route:${installId}:public-site`;
  const domainRouteId = `route:host:publicSite:${host}`;
  const deployTargetId = "instance.primary";
  const targetUrl = options.targetUrl ?? "https://personal.dpeek.workers.dev";
  const now = "2026-05-26T00:00:00.000Z";

  return [
    {
      id: installId,
      entity: "app-install",
      values: {
        installId,
        packageAppKey: "site",
        label: "David Peek",
        registrationPolicy: "closed",
        status: "installed",
        storageIdentity: `app:${installId}`,
      },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: adminRouteId,
      entity: "route",
      values: {
        enabled: true,
        matchPath: `/apps/${installId}`,
        kind: "mount",
        targetProfile: "app",
        appInstall: installId,
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
        matchPath: `/sites/${installId}`,
        matchPrefix: `/sites/${installId}/`,
        kind: "mount",
        targetProfile: "public-site",
        appInstall: installId,
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
        appInstall: installId,
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
        targetKind: "instance",
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
  const now = "2026-05-26T00:00:00.000Z";

  return [
    ...controlPlaneRecords(options).map((record) =>
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
      id: "provider-evidence",
      entity: "deploy-evidence-summary",
      values: {
        providerState: "raw-provider-evidence",
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    },
  ];
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
  installs: ReturnType<typeof installedApp>[],
  dataByInstall: Record<string, { mediaBytes?: Uint8Array; records: StoredRecord[] }>,
  restoreResponses: unknown[],
  extraPackages: InstallableAppPackage[] = [],
  remoteControlPlaneRecords?: StoredRecord[],
): typeof fetch {
  const readFetch = archiveFetch(
    requests,
    installs,
    dataByInstall,
    extraPackages,
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
  installs: ReturnType<typeof installedApp>[],
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

    if (method === "GET" && parsedUrl.pathname === "/api/formless/app-installs") {
      return Response.json({
        packages: listInstallableAppPackages(bundledAppPackageResolver),
        installs,
      });
    }

    if (method === "POST" && parsedUrl.pathname === "/api/formless/archive/restore") {
      return Response.json(restoreReport({ createdInstalls: ["david"] }));
    }

    return Response.json({ error: "not found" }, { status: 404 });
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
      summary: restoreSummary(summary),
    },
  };
}

function restoreReport(
  summary: Partial<{
    createdInstalls: string[];
    replacedInstalls: string[];
  }> = {},
) {
  return {
    ok: true,
    report: {
      applied: true,
      summary: restoreSummary(summary),
    },
  };
}

function restoreSummary(
  summary: Partial<{
    createdInstalls: string[];
    replacedInstalls: string[];
  }>,
) {
  return {
    appCount: 1,
    createdInstalls: summary.createdInstalls ?? [],
    mediaCountsByApp: { david: 0 },
    recordCountsByApp: { david: { total: 0 } },
    replacedInstalls: summary.replacedInstalls ?? [],
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
    accounts?: Array<{ id: string; name?: string; workersDevSubdomain: string }>;
    accountDiscoveryInputs?: Array<{ credentialProfile: string | null }>;
    cloudflareDomainClient?: CloudflareDomainClient;
    cloudflareOAuth?: FormlessCloudflareOAuthAdapter;
    commands?: CapturedCommand[];
    deploy?: (input: DeployFormlessInstanceInput) => Promise<{ url: string }>;
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

function snapshot(
  records: StoredRecord[],
  storageIdentity: `app:${string}` = "app:personal",
): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity,
    schemaKey: "site",
    exportedAt: "2026-05-12T00:00:00.000Z",
    schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
    sourceCursor: 1,
    schema: siteSourceSchema,
    records,
  };
}

function controlPlaneSnapshot(records: StoredRecord[]): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
    schemaKey: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
    exportedAt: "2026-05-12T00:00:00.000Z",
    schemaUpdatedAt: "2026-05-26T00:00:00.000Z",
    sourceCursor: records.length,
    schema: instanceControlPlaneSchema,
    records,
  };
}

function taskSnapshot(
  records: StoredRecord[],
  storageIdentity: `app:${string}` = "app:work",
): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity,
    schemaKey: "tasks",
    exportedAt: "2026-05-12T00:00:00.000Z",
    schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
    sourceCursor: records.length,
    schema: taskSourceSchema,
    records,
  };
}

function crmSnapshot(
  records: StoredRecord[],
  storageIdentity: `app:${string}` = "app:rates",
): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity,
    schemaKey: "crm",
    exportedAt: "2026-05-12T00:00:00.000Z",
    schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
    sourceCursor: records.length,
    schema: crmSourceSchema,
    records,
  };
}

function snapshotForPackage(
  packageAppKey: string,
  installId: string,
  records: StoredRecord[],
): StorageSnapshot {
  if (packageAppKey === "site") {
    return snapshot(records, `app:${installId}`);
  }

  if (packageAppKey === "tasks") {
    return taskSnapshot(records, `app:${installId}`);
  }

  if (packageAppKey === "crm") {
    return crmSnapshot(records, `app:${installId}`);
  }

  throw new Error(`Unsupported test package "${packageAppKey}".`);
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
