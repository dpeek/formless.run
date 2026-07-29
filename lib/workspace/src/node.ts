/**
 * Local Node Workspace package adapter entrypoint.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseAppSchema, type AppSchema } from "@dpeek/formless-schema";

import {
  computeSourceSchemaHash,
  createAppPackageResolver,
  parseAppPackageManifest,
  type AppPackageManifest,
  type AppPackageResolver,
  type ResolvedAppPackage,
  type SourceSchemaHash,
} from "@dpeek/formless-installed-apps";
import {
  STORAGE_SNAPSHOT_KIND,
  STORAGE_SNAPSHOT_VERSION,
  parseStorageSnapshot,
} from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import {
  DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT,
  WORKSPACE_AUTO_SAVE_STATE_FILE,
  WORKSPACE_MEDIA_MANIFEST_FILE,
  WORKSPACE_MEDIA_MANIFEST_KIND,
  WORKSPACE_MEDIA_MANIFEST_VERSION,
  WORKSPACE_RECORD_STATE_FILE_KIND,
  WORKSPACE_RECORD_STATE_FILE_VERSION,
  WORKSPACE_OPERATION_STATE_ROOT,
  formatWorkspaceAutoSaveState,
  formatWorkspaceRecordStateFile,
  formatWorkspaceOperationState,
  initialWorkspaceOperationState,
  nextWorkspaceOperationState,
  parseWorkspaceAutoSaveStateJson,
  parseInstanceWorkspaceRelativePath,
  parseInstanceWorkspaceResourceSlug,
  parseWorkspaceRecordStateFile,
  parseWorkspaceOperationStateJson,
  workspaceOperationStateFileName,
} from "./index.ts";
import {
  INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  formatInstanceControlPlaneBoundaryEntityName,
  instanceControlPlaneRecordSourceEntityName,
  instanceControlPlaneSchema,
  instanceControlPlaneSchemaProvenance,
  reviewableInstanceControlPlaneStorageSnapshot,
} from "@dpeek/formless-instance-control-plane";
import type {
  InitialWorkspaceOperationStateInput,
  InstanceWorkspaceManifest,
  UpdateWorkspaceOperationStateInput,
  WorkspacePackageLink,
  WorkspaceAutoSaveState,
  WorkspaceOperationState,
  WorkspacePackageAppSchemaProvenance,
  WorkspaceRecordStateFile,
  WorkspaceSchemaProvenance,
} from "./index.ts";

export * from "./index.ts";

export const INSTANCE_WORKSPACE_SECRET_STATE_DIRECTORY = ".formless";
export const INSTANCE_WORKSPACE_SECRET_STATE_FILE = "instance.env";
export const INSTANCE_WORKSPACE_SECRET_STATE_PATH = ".formless/instance.env";
export const INSTANCE_WORKSPACE_LOCAL_DEV_SECRET_STATE_FILE = "dev.env";
export const INSTANCE_WORKSPACE_LOCAL_DEV_SECRET_STATE_PATH = ".formless/local/dev.env";
export const INSTANCE_WORKSPACE_AUTO_SAVE_STATE_FILE = WORKSPACE_AUTO_SAVE_STATE_FILE;
export const INSTANCE_WORKSPACE_AUTO_SAVE_STATE_PATH = `${DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT}/${WORKSPACE_AUTO_SAVE_STATE_FILE}`;
export const INSTANCE_WORKSPACE_GITIGNORE_ENTRY = ".formless/";
export const INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME = "FORMLESS_ADMIN_TOKEN";
export const INSTANCE_WORKSPACE_OWNER_SESSION_SECRET_ENV_NAME = "FORMLESS_OWNER_SESSION_SECRET";

export type InstanceWorkspaceSecretState = {
  adminToken?: string;
};

export type InstanceWorkspaceLocalDevSecretState = {
  adminToken: string;
  ownerSessionSecret: string;
};

export type WriteInstanceWorkspaceSecretStateResult = {
  path: string;
  state: InstanceWorkspaceSecretState;
};

export type WriteInstanceWorkspaceLocalDevSecretStateResult = {
  path: string;
  state: InstanceWorkspaceLocalDevSecretState;
};

export type WriteInstanceWorkspaceAutoSaveStateResult = {
  path: string;
  state: WorkspaceAutoSaveState;
};

export type CreateWorkspaceOperationStateInput = Omit<
  InitialWorkspaceOperationStateInput,
  "id" | "workspaceLabel"
> & {
  id?: string;
  workspaceLabel?: string;
};

export type WorkspaceAppPackageSource = {
  appPackage: ResolvedAppPackage;
  manifest: AppPackageManifest;
  manifestPath: string;
  packageRoot: string;
  sourceSchema: AppSchema;
  sourceSchemaHash: SourceSchemaHash;
  sourceSchemaPath: string;
};

export type CreateWorkspaceAppPackageResolverInput = {
  bundledManifests: readonly unknown[];
  manifest: Pick<InstanceWorkspaceManifest, "packages">;
  workspaceRoot: string;
};

export type WorkspaceAppPackageResolverResult = {
  linkedPackages: WorkspaceAppPackageSource[];
  packageLinks: WorkspacePackageLink[];
  resolver: AppPackageResolver;
};

export type InstanceWorkspaceMediaFile = {
  archivePath: string;
  byteSize: number;
  bytes: Uint8Array;
  contentType: string;
  object: unknown;
};

export type ReadInstanceWorkspaceMediaFilesResult = {
  mediaFiles: InstanceWorkspaceMediaFile[];
  missingMediaFiles: string[];
};

export function instanceWorkspaceSecretStatePath(workspaceRoot: string): string {
  return path.join(
    workspaceRoot,
    INSTANCE_WORKSPACE_SECRET_STATE_DIRECTORY,
    INSTANCE_WORKSPACE_SECRET_STATE_FILE,
  );
}

export function instanceWorkspaceLocalDevSecretStatePath(localStateRoot: string): string {
  return path.join(localStateRoot, INSTANCE_WORKSPACE_LOCAL_DEV_SECRET_STATE_FILE);
}

export function instanceWorkspaceAutoSaveStatePath(localStateRoot: string): string {
  return path.join(localStateRoot, INSTANCE_WORKSPACE_AUTO_SAVE_STATE_FILE);
}

export function workspaceOperationStateRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, WORKSPACE_OPERATION_STATE_ROOT);
}

export function workspaceOperationStatePath(workspaceRoot: string, operationId: string): string {
  return path.join(
    workspaceOperationStateRoot(workspaceRoot),
    `${workspaceOperationStateFileName(operationId)}.json`,
  );
}

export function instanceWorkspaceStateRootPath(
  workspaceRoot: string,
  manifest: InstanceWorkspaceManifest,
): string {
  return path.join(workspaceRoot, manifest.state.root);
}

export function instanceWorkspaceInstanceStateRelativePath(
  manifest: InstanceWorkspaceManifest,
): string {
  return `${manifest.state.root}/instance.json`;
}

export function instanceWorkspaceInstanceStatePath(
  workspaceRoot: string,
  manifest: InstanceWorkspaceManifest,
): string {
  return path.join(workspaceRoot, instanceWorkspaceInstanceStateRelativePath(manifest));
}

export function instanceWorkspaceAppStateRootPath(
  workspaceRoot: string,
  manifest: InstanceWorkspaceManifest,
): string {
  return path.join(workspaceRoot, manifest.state.root, "apps");
}

export function instanceWorkspaceAppStateRelativePath(
  manifest: InstanceWorkspaceManifest,
  installId: string,
): string {
  return `${manifest.state.root}/apps/${parseWorkspaceStateInstallId(installId)}.json`;
}

export function instanceWorkspaceAppStatePath(
  workspaceRoot: string,
  manifest: InstanceWorkspaceManifest,
  installId: string,
): string {
  return path.join(workspaceRoot, instanceWorkspaceAppStateRelativePath(manifest, installId));
}

export function instanceWorkspaceMediaRootPath(
  workspaceRoot: string,
  manifest: InstanceWorkspaceManifest,
): string {
  return path.join(workspaceRoot, manifest.media.root);
}

export function instanceWorkspaceMediaFilePath(
  workspaceRoot: string,
  manifest: InstanceWorkspaceManifest,
  archivePath: string,
): string {
  return path.join(
    instanceWorkspaceMediaRootPath(workspaceRoot, manifest),
    parseWorkspaceMediaArchivePath(archivePath),
  );
}

export function instanceWorkspaceMediaManifestPath(
  workspaceRoot: string,
  manifest: InstanceWorkspaceManifest,
): string {
  return path.join(
    instanceWorkspaceMediaRootPath(workspaceRoot, manifest),
    WORKSPACE_MEDIA_MANIFEST_FILE,
  );
}

export async function readInstanceWorkspaceControlPlaneStorageSnapshot(input: {
  manifest: InstanceWorkspaceManifest;
  packageResolver?: AppPackageResolver;
  workspaceRoot: string;
}): Promise<StorageSnapshot | undefined> {
  const filePath = instanceWorkspaceInstanceStatePath(input.workspaceRoot, input.manifest);

  try {
    return await parseInstanceWorkspaceControlPlaneStorageSnapshot(
      await readFile(filePath, "utf8"),
      `Workspace instance state ${instanceWorkspaceInstanceStateRelativePath(input.manifest)}`,
      { packageResolver: input.packageResolver },
    );
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

export async function writeInstanceWorkspaceControlPlaneStorageSnapshot(input: {
  manifest: InstanceWorkspaceManifest;
  packageResolver?: AppPackageResolver;
  snapshot: StorageSnapshot | undefined;
  sourceLabel?: string;
  validationContext?: string;
  workspaceRoot: string;
}): Promise<void> {
  const filePath = instanceWorkspaceInstanceStatePath(input.workspaceRoot, input.manifest);

  await rm(filePath, { force: true });

  if (input.snapshot === undefined) {
    return;
  }

  const snapshot = reviewableControlPlaneStorageSnapshot(input.snapshot, {
    context: input.validationContext,
    packageResolver: input.packageResolver,
    sourceLabel: input.sourceLabel,
  });
  const state = await workspaceRecordStateFileFromStorageSnapshot(snapshot, {
    formatRecordEntity: formatInstanceControlPlaneRecordStateEntity,
    schemaProvenance: instanceControlPlaneSchemaProvenance,
  });

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, formatWorkspaceRecordStateFile(state, snapshot.schema));
}

export async function readInstanceWorkspaceAppStorageSnapshot(input: {
  installId: string;
  manifest: InstanceWorkspaceManifest;
  schemaKey?: string;
  schemaProvenance?: WorkspacePackageAppSchemaProvenance;
  sourceSchema?: AppSchema;
  workspaceRoot: string;
}): Promise<StorageSnapshot | undefined> {
  const filePath = instanceWorkspaceAppStatePath(
    input.workspaceRoot,
    input.manifest,
    input.installId,
  );

  try {
    return parseInstanceWorkspaceAppStorageStateFile(
      await readFile(filePath, "utf8"),
      `Workspace app state ${instanceWorkspaceAppStateRelativePath(input.manifest, input.installId)}`,
      {
        schemaKey: input.schemaKey,
        schemaProvenance: input.schemaProvenance,
        sourceSchema: input.sourceSchema,
        storageIdentity: `app:${input.installId}`,
      },
    );
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

export async function writeInstanceWorkspaceAppStorageSnapshot(input: {
  installId: string;
  manifest: InstanceWorkspaceManifest;
  schemaProvenance: WorkspacePackageAppSchemaProvenance;
  snapshot: StorageSnapshot;
  workspaceRoot: string;
}): Promise<void> {
  const snapshot = parseStorageSnapshot(input.snapshot, {
    storageIdentity: `app:${parseWorkspaceStateInstallId(input.installId)}`,
  });
  const state = await workspaceRecordStateFileFromStorageSnapshot(snapshot, {
    schemaProvenance: input.schemaProvenance,
  });
  const filePath = instanceWorkspaceAppStatePath(
    input.workspaceRoot,
    input.manifest,
    input.installId,
  );

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, formatWorkspaceRecordStateFile(state, snapshot.schema));
}

export async function replaceInstanceWorkspaceAppStorageSnapshots(input: {
  manifest: InstanceWorkspaceManifest;
  snapshots: readonly {
    installId: string;
    schemaProvenance: WorkspacePackageAppSchemaProvenance;
    snapshot: StorageSnapshot;
  }[];
  workspaceRoot: string;
}): Promise<void> {
  const appStateRoot = instanceWorkspaceAppStateRootPath(input.workspaceRoot, input.manifest);

  await rm(appStateRoot, { force: true, recursive: true });

  for (const app of input.snapshots) {
    await writeInstanceWorkspaceAppStorageSnapshot({
      installId: app.installId,
      manifest: input.manifest,
      schemaProvenance: app.schemaProvenance,
      snapshot: app.snapshot,
      workspaceRoot: input.workspaceRoot,
    });
  }
}

export async function readInstanceWorkspaceMediaFiles(input: {
  archivePaths: readonly string[];
  manifest: InstanceWorkspaceManifest;
  workspaceRoot: string;
}): Promise<ReadInstanceWorkspaceMediaFilesResult> {
  const mediaFiles: InstanceWorkspaceMediaFile[] = [];
  const missingMediaFiles: string[] = [];
  const archivePaths = [...new Set(input.archivePaths)].sort((left, right) =>
    left.localeCompare(right),
  );

  if (archivePaths.length === 0) {
    return { mediaFiles, missingMediaFiles };
  }

  const objectsByArchivePath = await readWorkspaceMediaObjects(input);

  for (const archivePath of archivePaths) {
    const object = objectsByArchivePath.get(archivePath);

    if (object === undefined) {
      missingMediaFiles.push(archivePath);
      continue;
    }

    try {
      const bytes = new Uint8Array(
        await readFile(
          instanceWorkspaceMediaFilePath(input.workspaceRoot, input.manifest, archivePath),
        ),
      );

      mediaFiles.push({
        archivePath,
        byteSize: bytes.byteLength,
        bytes,
        contentType: workspaceMediaObjectContentType(object),
        object,
      });
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        missingMediaFiles.push(archivePath);
        continue;
      }

      throw error;
    }
  }

  return {
    mediaFiles,
    missingMediaFiles,
  };
}

export async function replaceInstanceWorkspaceMediaFiles(input: {
  manifest: InstanceWorkspaceManifest;
  mediaFiles: readonly InstanceWorkspaceMediaFile[];
  workspaceRoot: string;
}): Promise<void> {
  const mediaRoot = instanceWorkspaceMediaRootPath(input.workspaceRoot, input.manifest);
  const mediaFiles = [...input.mediaFiles].sort((left, right) =>
    left.archivePath.localeCompare(right.archivePath),
  );
  const seenArchivePaths = new Set<string>();

  for (const file of mediaFiles) {
    const object = parseWorkspaceMediaObject(
      file.object,
      `Workspace media object "${file.archivePath}"`,
    );

    if (object.archivePath !== file.archivePath) {
      throw new Error(
        `Workspace media object "${file.archivePath}" archivePath must match its payload path.`,
      );
    }

    if (object.contentType !== file.contentType) {
      throw new Error(
        `Workspace media object "${file.archivePath}" contentType must match its payload content type.`,
      );
    }

    if (file.byteSize !== file.bytes.byteLength || object.byteSize !== file.byteSize) {
      throw new Error(
        `Workspace media object "${file.archivePath}" byteSize must match its payload bytes.`,
      );
    }

    if (seenArchivePaths.has(file.archivePath)) {
      throw new Error(`Workspace media includes duplicate payload "${file.archivePath}".`);
    }

    seenArchivePaths.add(file.archivePath);
  }

  await rm(mediaRoot, { force: true, recursive: true });

  for (const file of mediaFiles) {
    const filePath = instanceWorkspaceMediaFilePath(
      input.workspaceRoot,
      input.manifest,
      file.archivePath,
    );

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, file.bytes);
  }

  if (mediaFiles.length > 0) {
    await writeFile(
      instanceWorkspaceMediaManifestPath(input.workspaceRoot, input.manifest),
      formatWorkspaceMediaManifest(mediaFiles.map((file) => file.object)),
    );
  }
}

export async function createWorkspaceAppPackageResolver(
  input: CreateWorkspaceAppPackageResolverInput,
): Promise<WorkspaceAppPackageResolverResult> {
  const packageLinks = input.manifest.packages.links;
  const linkedPackages: WorkspaceAppPackageSource[] = [];

  for (const link of packageLinks) {
    linkedPackages.push(
      await readLinkedWorkspaceAppPackage({
        context: `Workspace package link "${link.manifest}"`,
        link,
        workspaceRoot: input.workspaceRoot,
      }),
    );
  }

  return {
    linkedPackages,
    packageLinks,
    resolver: createAppPackageResolver([
      ...input.bundledManifests,
      ...linkedPackages.map((appPackage) => appPackage.manifest),
    ]),
  };
}

export function parseWorkspaceDotEnv(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");

    if (equalsIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex);
    const value = trimmed.slice(equalsIndex + 1);

    values[key] = parseWorkspaceDotEnvValue(value);
  }

  return values;
}

export function formatWorkspaceDotEnv(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([key, value]) => `${key}=${formatWorkspaceDotEnvValue(value)}`)
    .join("\n")
    .concat("\n");
}

export function parseInstanceWorkspaceSecretState(contents: string): InstanceWorkspaceSecretState {
  const values = parseWorkspaceDotEnv(contents);
  const adminToken = parseOptionalEnvValue(values[INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME]);

  return adminToken === undefined ? {} : { adminToken };
}

export function formatInstanceWorkspaceSecretState(state: InstanceWorkspaceSecretState): string {
  const adminToken = parseOptionalEnvValue(state.adminToken);

  return adminToken === undefined
    ? ""
    : formatWorkspaceDotEnv({ [INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME]: adminToken });
}

export function parseInstanceWorkspaceLocalDevSecretState(
  contents: string,
): Partial<InstanceWorkspaceLocalDevSecretState> {
  const values = parseWorkspaceDotEnv(contents);
  const adminToken = parseOptionalEnvValue(values[INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME]);
  const ownerSessionSecret = parseOptionalEnvValue(
    values[INSTANCE_WORKSPACE_OWNER_SESSION_SECRET_ENV_NAME],
  );

  return {
    ...(adminToken === undefined ? {} : { adminToken }),
    ...(ownerSessionSecret === undefined ? {} : { ownerSessionSecret }),
  };
}

export function formatInstanceWorkspaceLocalDevSecretState(
  state: InstanceWorkspaceLocalDevSecretState,
): string {
  return formatWorkspaceDotEnv({
    [INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME]: state.adminToken,
    [INSTANCE_WORKSPACE_OWNER_SESSION_SECRET_ENV_NAME]: state.ownerSessionSecret,
  });
}

export function resolveInstanceWorkspaceAdminToken(input: {
  env?: NodeJS.ProcessEnv;
  explicitAdminToken?: string | null;
  secretState?: InstanceWorkspaceSecretState;
}): string | null {
  return (
    parseOptionalEnvValue(input.explicitAdminToken) ??
    parseOptionalEnvValue(input.env?.[INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME]) ??
    parseOptionalEnvValue(input.secretState?.adminToken) ??
    null
  );
}

export async function readInstanceWorkspaceSecretState(
  workspaceRoot: string,
): Promise<InstanceWorkspaceSecretState> {
  const filePath = instanceWorkspaceSecretStatePath(workspaceRoot);

  try {
    return parseInstanceWorkspaceSecretState(await readFile(filePath, "utf8"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

export async function writeInstanceWorkspaceSecretState(
  workspaceRoot: string,
  state: InstanceWorkspaceSecretState,
): Promise<WriteInstanceWorkspaceSecretStateResult> {
  const parsed = parseInstanceWorkspaceSecretState(formatInstanceWorkspaceSecretState(state));
  const filePath = instanceWorkspaceSecretStatePath(workspaceRoot);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, formatInstanceWorkspaceSecretState(parsed));

  return {
    path: filePath,
    state: parsed,
  };
}

export async function readInstanceWorkspaceLocalDevSecretState(
  localStateRoot: string,
): Promise<Partial<InstanceWorkspaceLocalDevSecretState>> {
  const filePath = instanceWorkspaceLocalDevSecretStatePath(localStateRoot);

  try {
    return parseInstanceWorkspaceLocalDevSecretState(await readFile(filePath, "utf8"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

export async function writeInstanceWorkspaceLocalDevSecretState(
  localStateRoot: string,
  state: InstanceWorkspaceLocalDevSecretState,
): Promise<WriteInstanceWorkspaceLocalDevSecretStateResult> {
  const filePath = instanceWorkspaceLocalDevSecretStatePath(localStateRoot);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, formatInstanceWorkspaceLocalDevSecretState(state));

  return {
    path: filePath,
    state,
  };
}

export async function ensureInstanceWorkspaceLocalDevSecretState(
  workspaceRoot: string,
  localStateRoot: string,
  createSecret: () => string,
): Promise<WriteInstanceWorkspaceLocalDevSecretStateResult> {
  const existing = await readInstanceWorkspaceLocalDevSecretState(localStateRoot);
  const state: InstanceWorkspaceLocalDevSecretState = {
    adminToken: existing.adminToken ?? createSecret(),
    ownerSessionSecret: existing.ownerSessionSecret ?? createSecret(),
  };
  const write = await writeInstanceWorkspaceLocalDevSecretState(localStateRoot, state);

  await ensureInstanceWorkspaceSecretStateIgnored(workspaceRoot);

  return write;
}

export async function readInstanceWorkspaceAutoSaveState(
  localStateRoot: string,
): Promise<WorkspaceAutoSaveState | undefined> {
  const filePath = instanceWorkspaceAutoSaveStatePath(localStateRoot);

  try {
    return parseWorkspaceAutoSaveStateJson(await readFile(filePath, "utf8"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

export async function writeInstanceWorkspaceAutoSaveState(input: {
  localStateRoot: string;
  state: WorkspaceAutoSaveState;
  workspaceRoot: string;
}): Promise<WriteInstanceWorkspaceAutoSaveStateResult> {
  const filePath = instanceWorkspaceAutoSaveStatePath(input.localStateRoot);

  await ensureInstanceWorkspaceSecretStateIgnored(input.workspaceRoot);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFileAtomically(filePath, formatWorkspaceAutoSaveState(input.state));

  return {
    path: filePath,
    state: input.state,
  };
}

async function writeFileAtomically(filePath: string, contents: string): Promise<void> {
  const tempPath = `${filePath}.${randomUUID()}.tmp`;

  try {
    await writeFile(tempPath, contents);
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function ensureInstanceWorkspaceSecretStateIgnored(
  workspaceRoot: string,
): Promise<string> {
  const gitignorePath = path.join(workspaceRoot, ".gitignore");
  const current = await readTextFileIfExists(gitignorePath);
  const lines = (current ?? "").split(/\r?\n/);

  if (lines.some((line) => isSecretStateIgnoreLine(line))) {
    return gitignorePath;
  }

  const prefix = !current || current.endsWith("\n") ? (current ?? "") : `${current}\n`;

  await writeFile(gitignorePath, `${prefix}${INSTANCE_WORKSPACE_GITIGNORE_ENTRY}\n`);

  return gitignorePath;
}

export async function createWorkspaceOperationState(
  input: CreateWorkspaceOperationStateInput,
): Promise<WorkspaceOperationState> {
  const state = initialWorkspaceOperationState({
    ...input,
    id: input.id ?? `op_${randomUUID()}`,
    workspaceLabel: input.workspaceLabel ?? (path.basename(input.workspaceRoot) || "."),
  });

  await writeWorkspaceOperationState(input.workspaceRoot, state);

  return state;
}

export async function readWorkspaceOperationState(input: {
  operationId: string;
  workspaceRoot: string;
}): Promise<WorkspaceOperationState> {
  return parseWorkspaceOperationStateJson(
    await readFile(workspaceOperationStatePath(input.workspaceRoot, input.operationId), "utf8"),
  );
}

export async function listWorkspaceOperationStates(
  workspaceRoot: string,
): Promise<WorkspaceOperationState[]> {
  let entries: Array<{ isFile(): boolean; name: string }>;

  try {
    entries = await readdir(workspaceOperationStateRoot(workspaceRoot), {
      withFileTypes: true,
    });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const states = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) =>
        readFile(path.join(workspaceOperationStateRoot(workspaceRoot), entry.name), "utf8"),
      ),
  );

  return states
    .map(parseWorkspaceOperationStateJson)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function updateWorkspaceOperationState(
  operationId: string,
  input: UpdateWorkspaceOperationStateInput,
): Promise<WorkspaceOperationState> {
  const current = await readWorkspaceOperationState({
    operationId,
    workspaceRoot: input.workspaceRoot,
  });
  const next = nextWorkspaceOperationState(current, input);

  await writeWorkspaceOperationState(input.workspaceRoot, next);

  return next;
}

export async function writeWorkspaceOperationState(
  workspaceRoot: string,
  state: WorkspaceOperationState,
): Promise<void> {
  await mkdir(workspaceRoot, { recursive: true });
  await ensureInstanceWorkspaceSecretStateIgnored(workspaceRoot);
  await mkdir(workspaceOperationStateRoot(workspaceRoot), { recursive: true });
  await writeFileAtomically(
    workspaceOperationStatePath(workspaceRoot, state.id),
    formatWorkspaceOperationState(state),
  );
}

async function parseInstanceWorkspaceControlPlaneStorageSnapshot(
  contents: string,
  context: string,
  options: { packageResolver?: AppPackageResolver } = {},
): Promise<StorageSnapshot> {
  const parsed = parseWorkspaceStateJson(contents, context);

  if (isWorkspaceRecordStateFile(parsed)) {
    const state = parseWorkspaceRecordStateFile(parsed, {
      context,
      expected: {
        schemaKey: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
        schemaProvenanceKind: "instance-control-plane",
        storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
      },
    });
    const expectedProvenance: WorkspaceSchemaProvenance = instanceControlPlaneSchemaProvenance;

    if (!workspaceSchemaProvenanceEqual(state.schemaProvenance, expectedProvenance)) {
      throw new Error(
        `${context} schemaProvenance does not match resolved instance control-plane source.`,
      );
    }

    return reviewableControlPlaneStorageSnapshot(
      storageSnapshotFromWorkspaceRecordState(state, instanceControlPlaneSchema),
      { packageResolver: options.packageResolver },
    );
  }

  return reviewableControlPlaneStorageSnapshot(
    parseInstanceWorkspaceStorageSnapshotValue(parsed, {
      schemaKey: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
      storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
    }),
    { packageResolver: options.packageResolver },
  );
}

function parseInstanceWorkspaceAppStorageStateFile(
  contents: string,
  context: string,
  expected: {
    schemaKey?: string;
    schemaProvenance?: WorkspacePackageAppSchemaProvenance;
    sourceSchema?: AppSchema;
    storageIdentity: string;
  },
): StorageSnapshot {
  const parsed = parseWorkspaceStateJson(contents, context);

  if (!isWorkspaceRecordStateFile(parsed)) {
    return parseInstanceWorkspaceStorageSnapshotValue(parsed, {
      schemaKey: expected.schemaKey,
      storageIdentity: expected.storageIdentity,
    });
  }

  if (expected.sourceSchema === undefined) {
    throw new Error(`${context} requires a resolved source schema.`);
  }

  const state = parseWorkspaceRecordStateFile(parsed, {
    context,
    expected: {
      schemaKey: expected.schemaKey,
      schemaProvenanceKind: "package-app",
      storageIdentity: expected.storageIdentity,
    },
  });

  if (
    expected.schemaProvenance !== undefined &&
    !workspaceSchemaProvenanceEqual(state.schemaProvenance, expected.schemaProvenance)
  ) {
    throw new Error(`${context} schemaProvenance does not match resolved package source.`);
  }

  return storageSnapshotFromWorkspaceRecordState(state, expected.sourceSchema);
}

function parseWorkspaceStateJson(contents: string, context: string): unknown {
  try {
    return JSON.parse(contents) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${context} must be valid JSON.`);
    }

    throw error;
  }
}

function parseInstanceWorkspaceStorageSnapshotValue(
  value: unknown,
  expected?: { schemaKey?: string; storageIdentity?: string },
): StorageSnapshot {
  return parseStorageSnapshot(value, expected);
}

function reviewableControlPlaneStorageSnapshot(
  snapshot: StorageSnapshot,
  options: { context?: string; packageResolver?: AppPackageResolver; sourceLabel?: string } = {},
): StorageSnapshot {
  const parsed = parseStorageSnapshot(snapshot, {
    schemaKey: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
    storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  });

  return reviewableInstanceControlPlaneStorageSnapshot(parsed, {
    context: options.context ?? "Workspace control-plane storage snapshot records",
    packageResolver: options.packageResolver,
    sourceLabel: options.sourceLabel ?? "Workspace control-plane storage snapshot",
  });
}

async function workspaceRecordStateFileFromStorageSnapshot(
  snapshot: StorageSnapshot,
  input: {
    formatRecordEntity?: (entity: string) => string;
    schemaProvenance: WorkspaceSchemaProvenance;
  },
): Promise<WorkspaceRecordStateFile> {
  const parsed = parseStorageSnapshot(snapshot);
  const formatted = {
    kind: WORKSPACE_RECORD_STATE_FILE_KIND,
    version: WORKSPACE_RECORD_STATE_FILE_VERSION,
    storageIdentity: parsed.storageIdentity,
    schemaKey: parsed.schemaKey,
    exportedAt: parsed.exportedAt,
    schemaUpdatedAt: parsed.schemaUpdatedAt,
    sourceCursor: parsed.sourceCursor,
    schemaProvenance: input.schemaProvenance,
    records: parsed.records.map((record) => workspaceStoredRecord(record, input)),
  };

  return parseWorkspaceRecordStateFile(formatted);
}

function storageSnapshotFromWorkspaceRecordState(
  state: WorkspaceRecordStateFile,
  schema: AppSchema,
): StorageSnapshot {
  return parseStorageSnapshot({
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: state.storageIdentity,
    schemaKey: state.schemaKey,
    exportedAt: state.exportedAt,
    schemaUpdatedAt: state.schemaUpdatedAt,
    sourceCursor: state.sourceCursor,
    schema,
    records: state.records,
  });
}

function workspaceSchemaProvenanceEqual(
  left: WorkspaceSchemaProvenance,
  right: WorkspaceSchemaProvenance,
): boolean {
  if (left.kind !== right.kind || left.sourceSchemaHash !== right.sourceSchemaHash) {
    return false;
  }

  if (left.kind === "instance-control-plane") {
    return true;
  }

  return (
    right.kind === "package-app" &&
    left.packageAppKey === right.packageAppKey &&
    left.packageRevision === right.packageRevision
  );
}

function isWorkspaceRecordStateFile(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "kind" in value &&
    value.kind === WORKSPACE_RECORD_STATE_FILE_KIND
  );
}

function workspaceStoredRecord(
  record: StoredRecord,
  input: { formatRecordEntity?: (entity: string) => string } = {},
): StoredRecord {
  return {
    id: record.id,
    entity: input.formatRecordEntity?.(record.entity) ?? record.entity,
    values: record.values,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.deletedAt === undefined ? {} : { deletedAt: record.deletedAt }),
  };
}

function formatInstanceControlPlaneRecordStateEntity(entity: string): string {
  const sourceEntity = instanceControlPlaneRecordSourceEntityName(entity);

  return sourceEntity === undefined
    ? entity
    : formatInstanceControlPlaneBoundaryEntityName(sourceEntity);
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableJsonValue);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableJsonValue(child)]),
  );
}

async function readLinkedWorkspaceAppPackage(input: {
  context: string;
  link: WorkspacePackageLink;
  workspaceRoot: string;
}): Promise<WorkspaceAppPackageSource> {
  const manifestPath = path.resolve(input.workspaceRoot, input.link.manifest);
  const packageRoot = path.dirname(manifestPath);
  const manifestValue = await readJsonFile(manifestPath, `${input.context} manifest`);
  const manifest = parseAppPackageManifest(manifestValue, `${input.context} manifest`);

  assertWorkspaceLinkedPackageManifest(manifest, input.context);

  const sourceSchemaPath = path.resolve(packageRoot, manifest.sourceSchema.path);
  const rawSourceSchema = await readJsonFile(
    sourceSchemaPath,
    `${input.context} source schema "${manifest.sourceSchema.path}"`,
  );
  const sourceSchema = parseAppSchema(rawSourceSchema);
  const sourceSchemaHash = await computeSourceSchemaHash(rawSourceSchema);

  if (sourceSchemaHash !== manifest.sourceSchemaHash) {
    throw new Error(
      `${input.context} source schema hash "${sourceSchemaHash}" does not match manifest sourceSchemaHash "${manifest.sourceSchemaHash}".`,
    );
  }

  const appPackage = createAppPackageResolver([manifest]).findPackage(manifest.packageAppKey);

  if (!appPackage) {
    throw new Error(`${input.context} package "${manifest.packageAppKey}" did not resolve.`);
  }

  return {
    appPackage,
    manifest,
    manifestPath,
    packageRoot,
    sourceSchema,
    sourceSchemaHash,
    sourceSchemaPath,
  };
}

async function readJsonFile(filePath: string, context: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${context} must be valid JSON.`);
    }

    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(`${context} file is missing.`);
    }

    throw error;
  }
}

function assertWorkspaceLinkedPackageManifest(manifest: AppPackageManifest, context: string) {
  if (manifest.sourceSchema.kind !== "workspace") {
    throw new Error(`${context} manifest sourceSchema kind must be "workspace".`);
  }
}

function parseWorkspaceStateInstallId(value: string): string {
  return parseInstanceWorkspaceResourceSlug("workspace app state install id", value);
}

function parseWorkspaceMediaArchivePath(value: string): string {
  return parseInstanceWorkspaceRelativePath("workspace media archive path", value);
}

async function readWorkspaceMediaObjects(input: {
  manifest: InstanceWorkspaceManifest;
  workspaceRoot: string;
}): Promise<Map<string, Record<string, unknown>>> {
  const manifestPath = instanceWorkspaceMediaManifestPath(input.workspaceRoot, input.manifest);
  let value: unknown;

  try {
    value = parseWorkspaceStateJson(
      await readFile(manifestPath, "utf8"),
      "Workspace media manifest",
    );
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return new Map();
    }

    throw error;
  }

  if (
    !isRecord(value) ||
    value.kind !== WORKSPACE_MEDIA_MANIFEST_KIND ||
    value.version !== WORKSPACE_MEDIA_MANIFEST_VERSION ||
    !Array.isArray(value.objects) ||
    Object.keys(value).some((key) => !["kind", "version", "objects"].includes(key))
  ) {
    throw new Error("Workspace media manifest is invalid.");
  }

  const objects = new Map<string, Record<string, unknown>>();

  for (const [index, candidate] of value.objects.entries()) {
    const object = parseWorkspaceMediaObject(
      candidate,
      `Workspace media manifest objects[${index}]`,
    );

    if (objects.has(object.archivePath)) {
      throw new Error(
        `Workspace media manifest includes duplicate object "${object.archivePath}".`,
      );
    }

    objects.set(object.archivePath, object);
  }

  return objects;
}

function formatWorkspaceMediaManifest(objects: readonly unknown[]): string {
  const sortedObjects = objects
    .map((object, index) => parseWorkspaceMediaObject(object, `Workspace media object ${index}`))
    .sort((left, right) => left.archivePath.localeCompare(right.archivePath));

  return `${JSON.stringify(
    stableJsonValue({
      kind: WORKSPACE_MEDIA_MANIFEST_KIND,
      version: WORKSPACE_MEDIA_MANIFEST_VERSION,
      objects: sortedObjects,
    }),
    null,
    2,
  )}\n`;
}

function parseWorkspaceMediaObject(
  value: unknown,
  context: string,
): Record<string, unknown> & {
  archivePath: string;
  byteSize: number;
  contentType: string;
} {
  if (
    !isRecord(value) ||
    typeof value.archivePath !== "string" ||
    typeof value.contentType !== "string" ||
    value.contentType.trim() === "" ||
    typeof value.byteSize !== "number" ||
    !Number.isSafeInteger(value.byteSize) ||
    value.byteSize < 0
  ) {
    throw new Error(`${context} is invalid.`);
  }

  parseWorkspaceMediaArchivePath(value.archivePath);

  return value as Record<string, unknown> & {
    archivePath: string;
    byteSize: number;
    contentType: string;
  };
}

function workspaceMediaObjectContentType(object: Record<string, unknown>): string {
  if (typeof object.contentType !== "string" || object.contentType.trim() === "") {
    throw new Error("Workspace media object contentType is invalid.");
  }

  return object.contentType;
}

function parseOptionalEnvValue(value: string | null | undefined): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed === "" ? undefined : trimmed;
}

function isSecretStateIgnoreLine(line: string): boolean {
  const value = line.trim();

  return (
    value === INSTANCE_WORKSPACE_SECRET_STATE_DIRECTORY ||
    value === INSTANCE_WORKSPACE_GITIGNORE_ENTRY
  );
}

function formatWorkspaceDotEnvValue(value: string): string {
  return /^[A-Za-z0-9_./:@-]+$/.test(value) ? value : JSON.stringify(value);
}

function parseWorkspaceDotEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }

  return value;
}

async function readTextFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
