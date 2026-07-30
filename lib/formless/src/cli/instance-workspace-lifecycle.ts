import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  APP_ARCHIVE_KIND,
  INSTANCE_ARCHIVE_KIND,
  PORTABLE_ARCHIVE_MANIFEST_FILE,
  archiveApps,
  type AppArchive,
  type PortableArchive,
} from "../program/archive.ts";
import type { AppInstall } from "@dpeek/formless-installed-apps";
import type { AppInstallsResponse } from "../shared/protocol.ts";
import { runtimeWorkspaceExtensionsEnvValue } from "../shared/workspace-runtime-extensions.ts";
import {
  DEFAULT_INSTANCE_WORKSPACE_ARCHIVE_ROOT as DEFAULT_FORMLESS_INSTANCE_WORKSPACE_ARCHIVE_ROOT,
  DEFAULT_INSTANCE_WORKSPACE_APP_STATE_ROOT as DEFAULT_FORMLESS_INSTANCE_WORKSPACE_APP_STATE_ROOT,
  defaultInstanceWorkspaceManifest as defaultFormlessInstanceWorkspaceManifest,
  formatInstanceWorkspaceManifest as formatFormlessInstanceWorkspaceManifest,
  normalizeInstanceWorkspaceTargetUrl as normalizeFormlessInstanceWorkspaceTargetUrl,
  parseInstanceWorkspaceManifestJson as parseFormlessInstanceWorkspaceManifestJson,
  type InstanceWorkspaceApp as FormlessInstanceWorkspaceApp,
  type InstanceWorkspaceDefaultAppPolicy as FormlessInstanceWorkspaceDefaultAppPolicy,
  type InstanceWorkspaceManifest as FormlessInstanceWorkspaceManifest,
  type InstanceWorkspaceTarget as FormlessInstanceWorkspaceTarget,
} from "@dpeek/formless-workspace";
import {
  ensureInstanceWorkspaceLocalDevSecretState as ensureFormlessInstanceWorkspaceLocalDevSecretState,
  ensureInstanceWorkspaceSecretStateIgnored as ensureFormlessInstanceWorkspaceSecretStateIgnored,
  readInstanceWorkspaceControlPlaneStorageSnapshot,
  replaceInstanceWorkspaceAppStorageSnapshots,
  replaceInstanceWorkspaceMediaFiles,
  writeInstanceWorkspaceControlPlaneStorageSnapshot,
  type InstanceWorkspaceLocalDevSecretState as FormlessInstanceWorkspaceLocalDevSecretState,
} from "../program/workspace.ts";
import {
  readFormlessInstanceTargetStatus,
  type FormlessInstanceTargetStatus,
} from "./instance-target-client.ts";
import {
  formlessCliDeploymentConfigRecordFromTarget,
  formlessCliTargetFetchHeaders,
  resolveFormlessCliTargetContext,
  formlessCliWorkspaceStatusSecretStateLabel,
} from "./instance-target-context.ts";
import { restorePortableArchive, type RestorePortableArchiveResult } from "./archive-workflows.ts";
import type { StartWorkspaceGatewaySidecarDependencies } from "./workspace-gateway-runtime.ts";
import {
  createActiveWorkspaceAppPackages,
  createWorkspaceTempRoot,
  formlessInstanceWorkspaceLocalStateRoot,
  readWorkspaceManifest,
  runtimeWorkspaceAppPackagesEnvValue,
  workspaceManifestPath,
  workspaceRootForInput,
  type ActiveWorkspaceAppPackages,
} from "./instance-workspace-foundation.ts";
import {
  appStorageSnapshotFromArchive,
  readCompleteWorkspaceAppState,
  workspaceLocalRestoreArchiveSource,
  workspaceSchemaProvenanceForAppArchive,
  writeWorkspaceLocalDevState,
} from "./instance-workspace-source-sync.ts";
import {
  appArchiveControlPlaneRecords,
  appInstallControlPlaneRecords,
  readArchiveMediaFiles,
  readWorkspaceArchive,
  workspaceControlPlaneSnapshotFromRecords,
} from "./instance-workspace-control-plane.ts";
import {
  startFormlessInstanceWorkspaceGatewayLifecycle,
  type FormlessInstanceWorkspaceGatewayLifecycleSidecarStarter,
} from "./instance-workspace-gateway-lifecycle.ts";

export {
  formlessInstanceWorkspaceDevEnv,
  formlessInstanceWorkspaceGatewaySessionEntry,
  startFormlessInstanceWorkspaceGatewayLifecycle,
} from "./instance-workspace-gateway-lifecycle.ts";
export type {
  FormlessInstanceWorkspaceDevSessionEntry,
  FormlessInstanceWorkspaceGatewayLifecycle,
  FormlessInstanceWorkspaceGatewayLifecycleDependencies,
  FormlessInstanceWorkspaceGatewayLifecycleSidecarStarter,
} from "./instance-workspace-gateway-lifecycle.ts";

export type InitFormlessInstanceWorkspaceInput = {
  defaultAppPolicy?: FormlessInstanceWorkspaceDefaultAppPolicy;
  fromArchive?: string | null;
  fromRemote?: boolean;
  name?: string | null;
  targetAlias?: string;
  targetUrl?: string | null;
  workspacePath?: string;
};

export type InitLocalFormlessWorkspaceOnboardingInput = {
  name?: string | null;
  workspacePath?: string;
};

export type InitFormlessInstanceWorkspaceDependencies = {
  cwd: string;
  fetch: typeof fetch;
};

export type InitFormlessInstanceWorkspaceResult = {
  archiveSourcePath?: string;
  gitignorePath: string;
  manifest: FormlessInstanceWorkspaceManifest;
  manifestPath: string;
  remoteStatus?: FormlessInstanceTargetStatus;
  workspaceRoot: string;
};

export type FormlessInstanceWorkspaceStatusInput = {
  adminToken?: string | null;
  includeDeploymentStatus?: boolean;
  targetAlias?: string | null;
  workspacePath?: string;
};

export type FormlessInstanceWorkspaceStatusDependencies = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  fetch: typeof fetch;
};

export type FormlessInstanceWorkspaceStatusResult = {
  manifest: FormlessInstanceWorkspaceManifest;
  manifestPath: string;
  remoteStatus?: FormlessInstanceTargetStatus;
  secretState: "env" | "missing" | "stored";
  selectedTarget?: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type FormlessInstanceWorkspaceDevCommand = {
  args: string[];
  command: string;
  label: string;
};

export type DevFormlessInstanceWorkspaceInput = {
  name?: string | null;
  open?: boolean;
  reset?: boolean;
  workspacePath?: string;
};

export type EnsureFormlessInstanceWorkspaceDevBootstrapInput = {
  name?: string | null;
  reset?: boolean;
  workspacePath?: string;
};

export type EnsureFormlessInstanceWorkspaceDevBootstrapDependencies = {
  cwd: string;
  randomToken?: () => string;
  selectWorkspaceName?: (
    input: FormlessInstanceWorkspaceDevNameSelectionInput,
  ) => Promise<string | null | undefined>;
};

export type EnsureFormlessInstanceWorkspaceDevBootstrapResult = {
  gitignorePath: string;
  localDevSecretStatePath: string;
  localDevSecrets: FormlessInstanceWorkspaceLocalDevSecretState;
  localStateRoot: string;
  manifest: FormlessInstanceWorkspaceManifest;
  manifestPath: string;
  workspaceRoot: string;
};

export type FormlessInstanceWorkspaceDevNameSelectionInput = {
  defaultName: string;
  workspaceRoot: string;
};

export type DevFormlessInstanceWorkspaceDependencies = {
  cwd: string;
  devCommand: FormlessInstanceWorkspaceDevCommand;
  env?: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  log: (message: string) => void;
  now: () => string;
  openBrowser?: (url: string) => Promise<void>;
  packageRoot: string;
  selectWorkspaceName?: EnsureFormlessInstanceWorkspaceDevBootstrapDependencies["selectWorkspaceName"];
  spawn: typeof nodeSpawn;
  startWorkspaceGatewaySidecar?: FormlessInstanceWorkspaceGatewayLifecycleSidecarStarter;
} & Partial<
  Pick<
    StartWorkspaceGatewaySidecarDependencies,
    | "accountDiscovery"
    | "deploymentAdapter"
    | "healthCheck"
    | "localSecretEnv"
    | "packageVersion"
    | "randomToken"
    | "setupCapability"
  >
>;

export type ResetFormlessInstanceWorkspaceLocalStateInput = {
  workspacePath?: string;
};

export type ResetFormlessInstanceWorkspaceLocalStateDependencies = {
  cwd: string;
};

export type ResetFormlessInstanceWorkspaceLocalStateResult = {
  localStateRoot: string;
  manifestPath: string;
  workspaceRoot: string;
};

export async function initFormlessInstanceWorkspace(
  input: InitFormlessInstanceWorkspaceInput,
  dependencies: InitFormlessInstanceWorkspaceDependencies,
): Promise<InitFormlessInstanceWorkspaceResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const manifestPath = workspaceManifestPath(workspaceRoot);

  await assertNoExistingWorkspaceManifest(workspaceRoot);
  await mkdir(workspaceRoot, { recursive: true });

  const name = input.name ?? defaultWorkspaceName(workspaceRoot);
  const targetUrl =
    input.targetUrl === undefined || input.targetUrl === null
      ? null
      : normalizeFormlessInstanceWorkspaceTargetUrl(input.targetUrl);
  const targetAlias = input.targetAlias ?? "remote";
  let manifest = {
    ...defaultFormlessInstanceWorkspaceManifest({ name, targetUrl }),
    ...(input.defaultAppPolicy === undefined ? {} : { defaultAppPolicy: input.defaultAppPolicy }),
  };
  let remoteStatus: FormlessInstanceTargetStatus | undefined;
  let archive: PortableArchive | undefined;
  let archiveDir: string | undefined;
  let archiveSourcePath: string | undefined;

  if (targetUrl) {
    manifest = withSingleTarget(manifest, { alias: targetAlias, url: targetUrl });
  }

  if (input.fromRemote) {
    if (!targetUrl) {
      throw new Error("Formless instance workspace remote init requires --target-url.");
    }

    remoteStatus = await readFormlessInstanceTargetStatus(
      {
        packageResolver: (await createActiveWorkspaceAppPackages(workspaceRoot, manifest)).resolver,
        targetUrl,
      },
      dependencies,
    );
    manifest = withRemoteStatus(manifest, remoteStatus);
  }

  if (input.fromArchive) {
    archiveDir = path.resolve(dependencies.cwd, input.fromArchive);
    archive = await readWorkspaceArchive(archiveDir);

    archiveSourcePath = relativeWorkspacePath(workspaceRoot, archiveDir);
    manifest = withArchiveSource(manifest, archive, archiveSourcePath);
  }

  await prepareWorkspaceDirectories(workspaceRoot, manifest);
  await writeFile(manifestPath, formatFormlessInstanceWorkspaceManifest(manifest));
  await writeInitialInstanceWorkspaceState({
    archive,
    archiveDir,
    manifest,
    remoteStatus,
    targetAlias,
    targetUrl,
    workspaceRoot,
  });
  const gitignorePath = await ensureFormlessInstanceWorkspaceSecretStateIgnored(workspaceRoot);

  return {
    ...(archiveSourcePath === undefined ? {} : { archiveSourcePath }),
    gitignorePath,
    manifest,
    manifestPath,
    ...(remoteStatus === undefined ? {} : { remoteStatus }),
    workspaceRoot,
  };
}

export async function initLocalFormlessWorkspaceOnboarding(
  input: InitLocalFormlessWorkspaceOnboardingInput,
  dependencies: InitFormlessInstanceWorkspaceDependencies,
): Promise<InitFormlessInstanceWorkspaceResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);

  await assertLocalOnboardingWorkspaceReady(workspaceRoot);

  return initFormlessInstanceWorkspace(
    {
      defaultAppPolicy: "none",
      name: input.name,
      targetUrl: null,
      workspacePath: input.workspacePath,
    },
    dependencies,
  );
}

export async function getFormlessInstanceWorkspaceStatus(
  input: FormlessInstanceWorkspaceStatusInput,
  dependencies: FormlessInstanceWorkspaceStatusDependencies,
): Promise<FormlessInstanceWorkspaceStatusResult> {
  const context = await resolveFormlessCliTargetContext(
    {
      commandName: "status",
      cwd: dependencies.cwd,
      explicitAdminToken: input.adminToken,
      requireTarget: false,
      targetAlias: input.targetAlias,
      workspacePath: input.workspacePath,
    },
    { env: dependencies.env },
  );
  const activePackages = context.selectedTarget
    ? await createActiveWorkspaceAppPackages(context.workspaceRoot)
    : undefined;
  const remoteStatus = context.selectedTarget
    ? await readFormlessInstanceTargetStatus(
        {
          adminToken: context.adminToken,
          includeDeploymentStatus: input.includeDeploymentStatus,
          packageResolver: activePackages?.resolver,
          targetUrl: context.selectedTarget.url,
        },
        dependencies,
      )
    : undefined;

  return {
    manifest: context.manifest,
    manifestPath: context.manifestPath,
    ...(remoteStatus === undefined ? {} : { remoteStatus }),
    secretState: formlessCliWorkspaceStatusSecretStateLabel(context),
    ...(context.selectedTarget === undefined ? {} : { selectedTarget: context.selectedTarget }),
    workspaceRoot: context.workspaceRoot,
  };
}

export async function runFormlessInstanceWorkspaceDev(
  input: DevFormlessInstanceWorkspaceInput,
  dependencies: DevFormlessInstanceWorkspaceDependencies,
): Promise<void> {
  const devBootstrap = await ensureFormlessInstanceWorkspaceDevBootstrap(input, dependencies);
  const { localDevSecrets, manifest, workspaceRoot } = devBootstrap;

  const activePackages = await createActiveWorkspaceAppPackages(workspaceRoot);
  const controlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest,
    packageResolver: activePackages.resolver,
    workspaceRoot,
  });

  if (controlPlane !== undefined) {
    await readCompleteWorkspaceAppState(workspaceRoot, manifest, controlPlane, activePackages);
  }

  const candidateOrigins = new Set<string>();

  const gatewayLifecycle = await startFormlessInstanceWorkspaceGatewayLifecycle(
    { workspaceRoot },
    dependencies,
  );
  let child: ChildProcessWithoutNullStreams | undefined;

  try {
    child = dependencies.spawn(dependencies.devCommand.command, dependencies.devCommand.args, {
      cwd: dependencies.packageRoot,
      env: gatewayLifecycle.childRuntimeEnv({
        env: dependencies.env,
        localDevSecrets,
        manifest,
        workspaceRoot,
        workspaceAppPackages: runtimeWorkspaceAppPackagesEnvValue(activePackages),
        workspaceRuntimeExtensions: runtimeWorkspaceExtensionsEnvValue(manifest),
      }),
      stdio: "pipe",
    });

    collectDevOutputOrigins(child, candidateOrigins);

    const source = await waitForInstanceDevServer(
      child,
      dependencies.fetch,
      candidateOrigins,
      localDevSecrets.adminToken,
    );
    await bootstrapWorkspaceLocalInstance(
      {
        adminToken: localDevSecrets.adminToken,
        activePackages,
        manifest,
        source,
        workspaceRoot,
      },
      dependencies,
    );

    await writeWorkspaceLocalDevState({
      manifest,
      source,
      startedAt: dependencies.now(),
      workspaceRoot,
    });

    const sessionEntry = gatewayLifecycle.sessionEntry({
      childOrigin: source,
      env: dependencies.env,
      reset: input.reset === true,
    });

    dependencies.log(sessionEntry.localSessionBootstrapUrl);

    if (input.open) {
      if (!dependencies.openBrowser) {
        throw new Error("Formless instance dev --open requires a browser opener.");
      }

      await dependencies.openBrowser(sessionEntry.localSessionBootstrapUrl);
    }

    await waitForChildExit(child);
  } catch (error) {
    child?.kill();
    throw error;
  } finally {
    await gatewayLifecycle.close();
  }
}

export async function ensureFormlessInstanceWorkspaceDevBootstrap(
  input: EnsureFormlessInstanceWorkspaceDevBootstrapInput,
  dependencies: EnsureFormlessInstanceWorkspaceDevBootstrapDependencies,
): Promise<EnsureFormlessInstanceWorkspaceDevBootstrapResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const manifestPath = workspaceManifestPath(workspaceRoot);
  let manifest: FormlessInstanceWorkspaceManifest;

  if (await pathExists(manifestPath)) {
    manifest = parseFormlessInstanceWorkspaceManifestJson(await readFile(manifestPath, "utf8"));
  } else {
    await assertLocalOnboardingWorkspaceReady(workspaceRoot);
    await mkdir(workspaceRoot, { recursive: true });

    const defaultName = input.name ?? defaultWorkspaceName(workspaceRoot);
    manifest = defaultFormlessInstanceWorkspaceManifest({
      name:
        input.name ??
        (await selectFormlessInstanceWorkspaceDevName(
          { defaultName, workspaceRoot },
          dependencies,
        )),
    });
    await writeFile(manifestPath, formatFormlessInstanceWorkspaceManifest(manifest));
  }

  const localStateRoot = formlessInstanceWorkspaceLocalStateRoot(workspaceRoot, manifest);

  if (input.reset) {
    await rm(localStateRoot, { force: true, recursive: true });
    await mkdir(localStateRoot, { recursive: true });
  }

  const localDevSecrets = await ensureFormlessInstanceWorkspaceLocalDevSecretState(
    workspaceRoot,
    localStateRoot,
    () => requiredGeneratedToken(dependencies.randomToken?.() ?? randomWorkspaceGatewayToken()),
  );
  const gitignorePath = await ensureFormlessInstanceWorkspaceSecretStateIgnored(workspaceRoot);

  return {
    gitignorePath,
    localDevSecretStatePath: localDevSecrets.path,
    localDevSecrets: localDevSecrets.state,
    localStateRoot,
    manifest,
    manifestPath,
    workspaceRoot,
  };
}

async function selectFormlessInstanceWorkspaceDevName(
  input: FormlessInstanceWorkspaceDevNameSelectionInput,
  dependencies: Pick<
    EnsureFormlessInstanceWorkspaceDevBootstrapDependencies,
    "selectWorkspaceName"
  >,
): Promise<string> {
  const selected = await dependencies.selectWorkspaceName?.(input);
  const trimmed = selected?.trim();

  return trimmed ? trimmed : input.defaultName;
}

export async function resetFormlessInstanceWorkspaceLocalState(
  input: ResetFormlessInstanceWorkspaceLocalStateInput,
  dependencies: ResetFormlessInstanceWorkspaceLocalStateDependencies,
): Promise<ResetFormlessInstanceWorkspaceLocalStateResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const { manifest, manifestPath } = await readWorkspaceManifest(workspaceRoot);
  const localStateRoot = formlessInstanceWorkspaceLocalStateRoot(workspaceRoot, manifest);

  await rm(localStateRoot, { force: true, recursive: true });
  await mkdir(localStateRoot, { recursive: true });

  return {
    localStateRoot,
    manifestPath,
    workspaceRoot,
  };
}

function randomWorkspaceGatewayToken(): string {
  return randomBytes(32).toString("base64url");
}

type WorkspaceLocalBootstrapResult =
  | {
      appCount: number;
      mediaCount: number;
      recordCount: number;
      sourceKind: "storage state";
      status: "restored";
    }
  | {
      status: "empty";
    }
  | {
      installIds: string[];
      status: "existing";
    };

async function bootstrapWorkspaceLocalInstance(
  input: {
    adminToken: string;
    activePackages: ActiveWorkspaceAppPackages;
    manifest: FormlessInstanceWorkspaceManifest;
    source: string;
    workspaceRoot: string;
  },
  dependencies: Pick<DevFormlessInstanceWorkspaceDependencies, "cwd" | "env" | "fetch" | "now">,
): Promise<WorkspaceLocalBootstrapResult> {
  const registry = await fetchWorkspaceJson<AppInstallsResponse>(
    dependencies.fetch,
    instanceAppInstallsUrl(input.source),
    { adminToken: input.adminToken },
  );
  const installIds = registry.installs
    .map((install) => install.installId)
    .sort((left, right) => left.localeCompare(right));

  if (installIds.length > 0) {
    return {
      installIds,
      status: "existing",
    };
  }

  const tempRoot = await createWorkspaceTempRoot(input.workspaceRoot, "local-dev");

  try {
    const sourceArchive = await workspaceLocalRestoreArchiveSource({
      activePackages: input.activePackages,
      exportedAt: dependencies.now(),
      manifest: input.manifest,
      tempRoot,
      workspaceRoot: input.workspaceRoot,
    });

    if (!sourceArchive) {
      return { status: "empty" };
    }

    const restore = await restorePortableArchive(
      {
        adminToken: input.adminToken,
        apply: true,
        archiveDir: sourceArchive.archiveRoot,
        packageResolver: input.activePackages.resolver,
        replace: false,
        target: input.source,
      },
      {
        cwd: dependencies.cwd,
        env: dependencies.env,
        fetch: dependencies.fetch,
        now: dependencies.now,
      },
    );

    if (!restore.remote.ok) {
      throw new Error(
        `Formless instance local dev archive restore failed: ${restoreErrors(restore)}.`,
      );
    }

    return {
      appCount: sourceArchive.appCount,
      mediaCount: sourceArchive.mediaCount,
      recordCount: sourceArchive.recordCount,
      sourceKind: sourceArchive.sourceKind,
      status: "restored",
    };
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

function withSingleTarget(
  manifest: FormlessInstanceWorkspaceManifest,
  target: FormlessInstanceWorkspaceTarget,
): FormlessInstanceWorkspaceManifest {
  return {
    ...manifest,
    defaultTarget: target.alias,
    targets: [target],
  };
}

function withRemoteStatus(
  manifest: FormlessInstanceWorkspaceManifest,
  status: FormlessInstanceTargetStatus,
): FormlessInstanceWorkspaceManifest {
  const appDeclarations = status.appRegistry.installs.map(appDeclarationFromInstall);

  return {
    ...manifest,
    apps: appDeclarations,
    defaultAppPolicy: appDeclarations.length === 0 ? "none" : "declared-installs",
  };
}

function withArchiveSource(
  manifest: FormlessInstanceWorkspaceManifest,
  archive: PortableArchive,
  archiveSourcePath: string,
): FormlessInstanceWorkspaceManifest {
  const apps = archiveApps(archive);

  return {
    ...manifest,
    apps: apps.map((app) =>
      appDeclarationFromArchive(
        app,
        archive.kind === APP_ARCHIVE_KIND
          ? archiveSourcePath
          : `${DEFAULT_FORMLESS_INSTANCE_WORKSPACE_APP_STATE_ROOT}/${app.app.installId}.json`,
      ),
    ),
    defaultAppPolicy: "declared-installs",
  };
}

async function writeInitialInstanceWorkspaceState(input: {
  archive: PortableArchive | undefined;
  archiveDir: string | undefined;
  manifest: FormlessInstanceWorkspaceManifest;
  remoteStatus: FormlessInstanceTargetStatus | undefined;
  targetAlias: string;
  targetUrl: string | null;
  workspaceRoot: string;
}) {
  const records = [
    ...(input.targetUrl === null
      ? []
      : [
          formlessCliDeploymentConfigRecordFromTarget({
            targetAlias: input.targetAlias,
            targetUrl: input.targetUrl,
          }),
        ]),
    ...(input.remoteStatus?.appRegistry.installs.flatMap(appInstallControlPlaneRecords) ?? []),
  ];
  const archiveControlPlane =
    input.archive?.kind === INSTANCE_ARCHIVE_KIND ? input.archive.controlPlane : undefined;
  const archiveRecords =
    archiveControlPlane?.records ??
    (input.archive === undefined
      ? []
      : archiveApps(input.archive).flatMap((app) => appArchiveControlPlaneRecords(app)));
  const controlPlaneRecords =
    archiveRecords.length === 0 ? records : [...records, ...archiveRecords];

  if (controlPlaneRecords.length > 0) {
    const activePackages = await createActiveWorkspaceAppPackages(input.workspaceRoot);

    await writeInstanceWorkspaceControlPlaneStorageSnapshot({
      manifest: input.manifest,
      packageResolver: activePackages.resolver,
      snapshot: workspaceControlPlaneSnapshotFromRecords({
        current: archiveControlPlane,
        exportedAt: archiveControlPlane?.exportedAt ?? "1970-01-01T00:00:00.000Z",
        records: controlPlaneRecords,
        schemaUpdatedAt: archiveControlPlane?.schemaUpdatedAt ?? "1970-01-01T00:00:00.000Z",
      }),
      ...(archiveRecords.length === 0
        ? {}
        : {
            sourceLabel: "Instance archive controlPlane",
            validationContext: "Instance archive controlPlane records",
          }),
      workspaceRoot: input.workspaceRoot,
    });
  }

  if (input.archive) {
    await replaceInstanceWorkspaceAppStorageSnapshots({
      manifest: input.manifest,
      snapshots: archiveApps(input.archive).map((app) => ({
        installId: app.app.installId,
        schemaProvenance: workspaceSchemaProvenanceForAppArchive(app),
        snapshot: appStorageSnapshotFromArchive(app),
      })),
      workspaceRoot: input.workspaceRoot,
    });

    if (input.archiveDir) {
      await replaceInstanceWorkspaceMediaFiles({
        manifest: input.manifest,
        mediaFiles: await readArchiveMediaFiles(input.archiveDir, input.archive),
        workspaceRoot: input.workspaceRoot,
      });
    }
  }
}

function appDeclarationFromInstall(install: AppInstall): FormlessInstanceWorkspaceApp {
  return {
    installId: install.installId,
    packageAppKey: install.packageAppKey,
    label: install.label,
    statePath: `${DEFAULT_FORMLESS_INSTANCE_WORKSPACE_APP_STATE_ROOT}/${install.installId}.json`,
    routes: {
      admin: install.adminRoute as `/apps/${string}`,
      ...(install.publicRoute === undefined
        ? {}
        : { public: install.publicRoute as `/sites/${string}` }),
    },
  };
}

function appDeclarationFromArchive(
  archive: AppArchive,
  statePath: string,
): FormlessInstanceWorkspaceApp {
  const installId = archive.app.installId;

  return {
    installId,
    packageAppKey: archive.app.packageAppKey,
    label: archive.app.label,
    statePath,
    routes: {
      admin: `/apps/${installId}`,
      ...(archive.app.packageAppKey === "site" ? { public: `/sites/${installId}` } : {}),
    },
  };
}

async function assertNoExistingWorkspaceManifest(workspaceRoot: string) {
  const manifestPath = workspaceManifestPath(workspaceRoot);

  if (await pathExists(manifestPath)) {
    throw new Error(`Formless instance workspace already exists at ${manifestPath}.`);
  }
}

async function assertLocalOnboardingWorkspaceReady(workspaceRoot: string) {
  await assertNoExistingWorkspaceManifest(workspaceRoot);
  await assertNoLocalOnboardingConflict(
    workspaceRoot,
    PORTABLE_ARCHIVE_MANIFEST_FILE,
    "portable archive source",
    "Import or move existing archive source before browser setup.",
  );
  await assertNoLocalOnboardingConflict(
    workspaceRoot,
    DEFAULT_FORMLESS_INSTANCE_WORKSPACE_ARCHIVE_ROOT,
    "reviewable archive root",
    "Move existing archive source before browser setup.",
  );
  await assertNoLocalOnboardingIgnoredStateConflict(workspaceRoot);
}

async function assertNoLocalOnboardingConflict(
  workspaceRoot: string,
  relativePath: string,
  label: string,
  guidance: string,
) {
  const filePath = path.join(workspaceRoot, relativePath);

  if (await fileSystemPathExists(filePath)) {
    throw new Error(
      `Workspace browser setup cannot initialize because ${label} exists at ${filePath}. ${guidance}`,
    );
  }
}

async function assertNoLocalOnboardingIgnoredStateConflict(workspaceRoot: string) {
  const stateRoot = path.join(workspaceRoot, ".formless");
  let entries: Array<{ isDirectory(): boolean; name: string }>;

  try {
    entries = await readdir(stateRoot, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }

    throw error;
  }

  const hasOnlyIgnoredState = entries.every(
    (entry) => entry.isDirectory() && (entry.name === "local" || entry.name === "operations"),
  );

  if (hasOnlyIgnoredState) {
    return;
  }

  throw new Error(
    `Workspace browser setup cannot initialize because ignored .formless state exists at ${stateRoot}. Remove or move existing local state before browser setup.`,
  );
}

async function fileSystemPathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath, "utf8");
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function prepareWorkspaceDirectories(
  workspaceRoot: string,
  manifest: FormlessInstanceWorkspaceManifest,
  _options: { appArchiveRoot?: boolean } = {},
) {
  await mkdir(path.join(workspaceRoot, manifest.local.stateRoot), { recursive: true });
}

function requiredGeneratedToken(value: string): string {
  const token = value.trim();

  if (token === "") {
    throw new Error("Generated Formless admin token must be a non-empty string.");
  }

  return token;
}

function defaultWorkspaceName(workspaceRoot: string): string {
  const basename = path.basename(workspaceRoot);
  const normalized = basename
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "formless-instance";
}

function relativeWorkspacePath(workspaceRoot: string, filePath: string): string {
  const relativePath = path.relative(workspaceRoot, filePath).split(path.sep).join("/");

  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith("../") ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Workspace path must be inside ${workspaceRoot}.`);
  }

  return relativePath;
}

function collectDevOutputOrigins(
  child: ChildProcessWithoutNullStreams,
  candidateOrigins: Set<string>,
) {
  const handleOutput = (chunk: Buffer) => {
    const text = chunk.toString();

    for (const origin of httpOriginsFromText(text)) {
      candidateOrigins.add(origin);
    }
  };

  child.stdout.on("data", handleOutput);
  child.stderr.on("data", handleOutput);
}

async function waitForInstanceDevServer(
  child: ChildProcessWithoutNullStreams,
  fetcher: typeof fetch,
  candidateOrigins: Set<string>,
  adminToken: string,
): Promise<string> {
  const startedAt = Date.now();
  let spawnError: Error | null = null;

  child.once("error", (error) => {
    spawnError = error;
  });

  while (Date.now() - startedAt < 30_000) {
    if (spawnError) {
      throw spawnError;
    }

    if (child.exitCode !== null) {
      throw new Error(`Formless instance dev server exited with code ${child.exitCode}.`);
    }

    for (const origin of candidateOrigins) {
      if (await isInstanceDevServerReady(fetcher, origin, adminToken)) {
        return origin;
      }
    }

    await delay(250);
  }

  throw new Error("Timed out waiting for the Formless instance dev server.");
}

async function isInstanceDevServerReady(
  fetcher: typeof fetch,
  origin: string,
  adminToken: string,
): Promise<boolean> {
  try {
    const response = await fetcher(instanceAppInstallsUrl(origin), {
      headers: formlessCliTargetFetchHeaders({ accept: "application/json", adminToken }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

function httpOriginsFromText(text: string): string[] {
  const origins = new Set<string>();

  for (const match of text.matchAll(/https?:\/\/[^\s),]+/g)) {
    try {
      origins.add(new URL(match[0]).origin);
    } catch {
      // Ignore non-URL terminal fragments.
    }
  }

  return [...origins];
}

function waitForChildExit(child: ChildProcessWithoutNullStreams): Promise<void> {
  const signalCode = child.signalCode ?? null;

  if (child.exitCode !== null || signalCode !== null) {
    return settleChildExit(child.exitCode, signalCode);
  }

  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      settleChildExit(code, signal).then(resolve, reject);
    });
  });
}

function settleChildExit(code: number | null, signal: NodeJS.Signals | null): Promise<void> {
  if (code === 0) {
    return Promise.resolve();
  }

  return Promise.reject(
    new Error(
      signal
        ? `Formless instance dev server exited with signal ${signal}.`
        : `Formless instance dev server exited with code ${code ?? "unknown"}.`,
    ),
  );
}

async function fetchWorkspaceJson<T>(
  fetcher: typeof fetch,
  url: string,
  options: { adminToken?: string | null } = {},
): Promise<T> {
  const response = await fetcher(url, {
    headers: formlessCliTargetFetchHeaders({
      accept: "application/json",
      adminToken: options.adminToken,
    }),
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Failed GET ${url}: HTTP ${response.status} ${text}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Failed GET ${url}: response was not JSON.`);
  }
}

function instanceAppInstallsUrl(origin: string): string {
  return new URL("/api/formless/app-installs", `${origin}/`).toString();
}

function restoreErrors(restore: RestorePortableArchiveResult): string {
  return restore.remote.errors?.map((error) => error.message).join("; ") || "unknown error";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
