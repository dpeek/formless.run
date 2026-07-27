import {
  APP_ARCHIVE_KIND,
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  appArchiveMediaReferences,
  formatPortableArchive,
  parseAppArchive,
  parsePortableArchive,
  type AppArchive,
  type AppArchiveMediaObject,
  type ArchiveRestorePolicy,
  type AppArchiveMediaReference,
  type InstanceArchive,
  type InstanceArchiveControlPlane,
  type PortableArchive,
} from "@dpeek/formless-archive";
import {
  readPortableArchiveDirectory,
  writePortableArchiveDirectory,
  type ArchiveDiskMediaFile,
  type ArchiveDiskWriteResult,
} from "@dpeek/formless-archive/node";
import {
  findAppInstall,
  type AppInstall,
  type InstallableAppPackage,
} from "@dpeek/formless-installed-apps";
import {
  bundledAppPackageResolver,
  findResolvedAppPackage,
  type AppPackageResolver,
} from "../shared/app-packages.ts";
import { installedAppStorageIdentity } from "../shared/app-storage-identity.ts";
import {
  INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX,
  parseInstanceControlPlaneStorageSnapshot,
  reviewableInstanceControlPlaneStorageSnapshot,
} from "@dpeek/formless-instance-control-plane";
import {
  CORE_IMAGE_KEY_PREFIX,
  MEDIA_DOCUMENT_UPLOAD_MAX_BYTES,
  MEDIA_PDF_CONTENT_TYPE,
  coreImageMediaDeliveryFactsForAssetId,
  documentMediaStorageKeyForAssetId,
  imageMediaContentTypeForKey,
  isDocumentMediaAsset,
  validatePdfDocumentMediaFile,
  type DocumentMediaAsset,
  type MediaAsset,
} from "@dpeek/formless-media";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import type { AppInstallsResponse } from "../shared/protocol.ts";
import {
  readPortableArchiveInputStatus,
  type PortableArchiveInputStatus,
} from "./archive-input-status.ts";
import {
  resolveFormlessCliAdminToken,
  formlessCliTargetFetchHeaders,
} from "./instance-target-context.ts";

export {
  PORTABLE_ARCHIVE_MANIFEST_FILE,
  readPortableArchiveInputStatus,
  type PortableArchiveInputStatus,
} from "./archive-input-status.ts";
export type { ArchiveDiskMediaFile, ArchiveDiskWriteResult } from "@dpeek/formless-archive/node";

const INSTANCE_ARCHIVE_RESTORE_API_PATH = "/api/formless/archive/restore";
const ARCHIVE_EXPORT_MEDIA_READ_HEADER = "X-Formless-Archive-Export";

export type ArchiveWorkflowDependencies = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  now: () => string;
};

export type ArchiveRestoreRemoteResult = {
  ok: boolean;
  plan?: {
    summary: ArchiveRestoreSummary;
  };
  report?: {
    applied: boolean;
    summary: ArchiveRestoreSummary;
  };
  errors?: { message: string }[];
};

export type ArchiveRestoreSummary = {
  appCount: number;
  createdInstalls: string[];
  mediaCountsByApp: Record<string, number>;
  recordCountsByApp: Record<string, { total: number }>;
  replacedInstalls: string[];
};

export type RestorePortableArchiveResult = {
  archiveInput: PortableArchiveInputStatus;
  archivePath: string;
  remote: ArchiveRestoreRemoteResult;
};

export async function exportInstanceArchive(
  input: {
    adminToken?: string | null;
    outDir: string;
    packageResolver?: AppPackageResolver;
    target: string;
  },
  dependencies: ArchiveWorkflowDependencies,
): Promise<ArchiveDiskWriteResult> {
  const target = normalizeTargetUrl(input.target);
  const exportedAt = dependencies.now();
  const auth = { adminToken: input.adminToken, env: dependencies.env };
  const packageResolver = input.packageResolver ?? bundledAppPackageResolver;
  const registry = await fetchRemoteAppRegistry(target, { ...dependencies, ...auth });
  const [controlPlane, entries] = await Promise.all([
    fetchRemoteControlPlaneArchive({
      auth,
      fetcher: dependencies.fetch,
      packageResolver,
      target,
    }),
    Promise.all(
      registry.installs.map((install) =>
        buildRemoteAppArchiveEntry({
          auth,
          exportedAt,
          fetcher: dependencies.fetch,
          install,
          packageResolver,
          packages: registry.packages,
          target,
        }),
      ),
    ),
  ]);
  const archive: InstanceArchive = {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt,
    capabilities: instanceArchiveCapabilities(controlPlane),
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    ...(controlPlane === undefined ? {} : { controlPlane }),
    apps: entries.map((entry) => entry.archive),
  };

  return writePortableArchiveDirectory(
    {
      archive,
      mediaFiles: entries.flatMap((entry) => entry.mediaFiles),
      outDir: input.outDir,
      packageResolver,
    },
    dependencies,
  );
}

async function fetchRemoteControlPlaneArchive(input: {
  auth?: ArchiveExportAuth;
  fetcher: typeof fetch;
  packageResolver?: AppPackageResolver;
  target: string;
}): Promise<InstanceArchiveControlPlane | undefined> {
  const snapshot = await fetchJson<StorageSnapshot>(
    input.fetcher,
    apiUrl(
      input.target,
      `${INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX}/snapshot?actorKind=cliDeployer`,
    ),
    { headers: archiveExportRequestHeaders(input.auth, "application/json") },
  );

  return parseInstanceControlPlaneStorageSnapshot(
    "Instance archive controlPlane",
    reviewableInstanceControlPlaneStorageSnapshot(snapshot, {
      context: "Instance archive controlPlane records",
      packageResolver: input.packageResolver,
      sourceLabel: "Instance archive controlPlane",
    }),
    { packageResolver: input.packageResolver },
  );
}

function instanceArchiveCapabilities(
  controlPlane: InstanceArchiveControlPlane | undefined,
): InstanceArchive["capabilities"] {
  return [
    "installed-app-registry",
    ...(controlPlane === undefined ? [] : ["schema-owned-control-plane" as const]),
    "app-store-snapshots",
    "core-media-assets",
  ];
}

export async function exportAppArchive(
  input: {
    adminToken?: string | null;
    installId: string;
    outDir: string;
    packageResolver?: AppPackageResolver;
    target: string;
  },
  dependencies: ArchiveWorkflowDependencies,
): Promise<ArchiveDiskWriteResult> {
  const target = normalizeTargetUrl(input.target);
  const auth = { adminToken: input.adminToken, env: dependencies.env };
  const packageResolver = input.packageResolver ?? bundledAppPackageResolver;
  const registry = await fetchRemoteAppRegistry(target, { ...dependencies, ...auth });
  const install = findAppInstall(registry.installs, input.installId);

  if (!install) {
    throw new Error(`Installed app "${input.installId}" was not found at ${target}.`);
  }

  const entry = await buildRemoteAppArchiveEntry({
    auth,
    exportedAt: dependencies.now(),
    fetcher: dependencies.fetch,
    install,
    packageResolver,
    packages: registry.packages,
    target,
  });

  return writePortableArchiveDirectory(
    {
      archive: entry.archive,
      mediaFiles: entry.mediaFiles,
      outDir: input.outDir,
      packageResolver,
    },
    dependencies,
  );
}

export async function restorePortableArchive(
  input: {
    adminToken?: string | null;
    apply: boolean;
    archiveDir: string;
    packageResolver?: AppPackageResolver;
    replace: boolean;
    target: string;
  },
  dependencies: ArchiveWorkflowDependencies,
): Promise<RestorePortableArchiveResult> {
  const archiveInput = await readPortableArchiveInputStatus({
    archiveDir: input.archiveDir,
    cwd: dependencies.cwd,
  });
  const packageResolver = input.packageResolver ?? bundledAppPackageResolver;
  const diskArchive = await readPortableArchiveDirectory(input.archiveDir, {
    ...dependencies,
    packageResolver,
  });
  const archive = withRestorePolicy(diskArchive.archive, restorePolicy(input), {
    packageResolver,
  });
  const remote = await postRemoteArchiveRestore(
    {
      adminToken: input.adminToken,
      archive,
      mediaFiles: diskArchive.mediaFiles,
      packageResolver,
      target: input.target,
    },
    dependencies,
  );

  return {
    archiveInput,
    archivePath: diskArchive.archivePath,
    remote,
  };
}

export async function restoreWorkspacePushArchive(
  input: {
    adminToken?: string | null;
    apply: boolean;
    archiveDir: string;
    packageResolver?: AppPackageResolver;
    target: string;
  },
  dependencies: ArchiveWorkflowDependencies,
): Promise<RestorePortableArchiveResult> {
  const archiveInput = await readPortableArchiveInputStatus({
    archiveDir: input.archiveDir,
    cwd: dependencies.cwd,
  });
  const packageResolver = input.packageResolver ?? bundledAppPackageResolver;
  const diskArchive = await readPortableArchiveDirectory(input.archiveDir, {
    ...dependencies,
    packageResolver,
  });

  if (diskArchive.archive.kind !== INSTANCE_ARCHIVE_KIND) {
    throw new Error("Workspace push restore requires a formless.instanceArchive archive.");
  }

  const archive = withRestorePolicy(
    diskArchive.archive,
    {
      dryRun: !input.apply,
      installCollisions: "replace",
    },
    {
      packageResolver,
    },
  );
  const remote = await postRemoteArchiveRestore(
    {
      adminToken: input.adminToken,
      archive,
      exactInstanceReplacement: true,
      mediaFiles: diskArchive.mediaFiles,
      packageResolver,
      target: input.target,
    },
    dependencies,
  );

  return {
    archiveInput,
    archivePath: diskArchive.archivePath,
    remote,
  };
}

export async function restoreAppArchive(
  input: {
    adminToken?: string | null;
    apply: boolean;
    archiveDir: string;
    installId: string;
    replace: boolean;
    target: string;
  },
  dependencies: ArchiveWorkflowDependencies,
): Promise<RestorePortableArchiveResult> {
  const archiveInput = await readPortableArchiveInputStatus({
    archiveDir: input.archiveDir,
    cwd: dependencies.cwd,
  });
  const diskArchive = await readPortableArchiveDirectory(input.archiveDir, {
    ...dependencies,
    packageResolver: bundledAppPackageResolver,
  });

  if (diskArchive.archive.kind !== APP_ARCHIVE_KIND) {
    throw new Error("App archive restore requires a formless.appArchive archive.");
  }

  const archive = withRestorePolicy(
    retargetAppArchive(diskArchive.archive, input.installId),
    restorePolicy(input),
  );
  const remote = await postRemoteArchiveRestore(
    {
      adminToken: input.adminToken,
      archive,
      mediaFiles: diskArchive.mediaFiles,
      target: input.target,
    },
    dependencies,
  );

  return {
    archiveInput,
    archivePath: diskArchive.archivePath,
    remote,
  };
}

function restorePolicy(input: { apply: boolean; replace: boolean }): ArchiveRestorePolicy {
  return {
    dryRun: !input.apply,
    installCollisions: input.replace ? "replace" : "reject",
  };
}

async function buildRemoteAppArchiveEntry(input: {
  auth?: ArchiveExportAuth;
  exportedAt: string;
  fetcher: typeof fetch;
  install: AppInstall;
  packageResolver?: AppPackageResolver;
  packages: readonly InstallableAppPackage[];
  target: string;
}): Promise<{ archive: AppArchive; mediaFiles: ArchiveDiskMediaFile[] }> {
  const registryPackage = input.packages.find(
    (candidate) => candidate.packageAppKey === input.install.packageAppKey,
  );
  const packageApp =
    registryPackage ?? findResolvedAppPackage(input.install.packageAppKey, input.packageResolver);
  const sourceSchemaKey = registryPackage?.sourceSchemaKey ?? packageApp?.sourceSchemaKey;
  const packageRevision =
    input.install.packageRevision ??
    registryPackage?.packageRevision ??
    packageApp?.packageRevision;
  const sourceSchemaHash =
    input.install.sourceSchemaHash ??
    registryPackage?.sourceSchemaHash ??
    packageApp?.sourceSchemaHash;
  const snapshot = await fetchJson<StorageSnapshot>(
    input.fetcher,
    apiUrl(input.target, appApiPath(input.install, "/snapshot")),
    { headers: archiveExportRequestHeaders(input.auth, "application/json") },
  );

  if (!sourceSchemaKey) {
    throw new Error(`Installed app "${input.install.installId}" uses unsupported package.`);
  }

  if (!packageRevision || !sourceSchemaHash) {
    throw new Error(
      `Installed app "${input.install.installId}" is missing package facts for archive export.`,
    );
  }

  const media = await exportRemoteAppMedia({
    auth: input.auth,
    fetcher: input.fetcher,
    install: input.install,
    records: snapshot.records,
    schema: snapshot.schema,
    target: input.target,
  });
  const archive: AppArchive = {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: input.exportedAt,
    capabilities: ["app-store-snapshots", "core-media-assets"],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    app: {
      installId: input.install.installId,
      packageAppKey: input.install.packageAppKey,
      packageRevision,
      sourceSchemaKey,
      sourceSchemaHash,
      label: input.install.label,
      registrationPolicy: input.install.registrationPolicy,
      ...(input.install.registrationOperation === undefined
        ? {}
        : { registrationOperation: input.install.registrationOperation }),
      status: input.install.status,
      createdAt: input.install.createdAt,
      updatedAt: input.install.updatedAt,
    },
    data: snapshot,
    media: {
      objects: media.objects,
    },
  };

  return {
    archive,
    mediaFiles: media.files,
  };
}

async function exportRemoteAppMedia(input: {
  auth?: ArchiveExportAuth;
  fetcher: typeof fetch;
  install: AppInstall;
  records: readonly StoredRecord[];
  schema: StorageSnapshot["schema"];
  target: string;
}): Promise<{ files: ArchiveDiskMediaFile[]; objects: AppArchiveMediaObject[] }> {
  const references = await resolveAppMediaReferences(input);
  const files: ArchiveDiskMediaFile[] = [];
  const objects: AppArchiveMediaObject[] = [];

  for (const reference of references) {
    const response = await input.fetcher(apiUrl(input.target, reference.deliveryHref), {
      headers: archiveExportRequestHeaders(input.auth, reference.contentType, {
        mediaRead: true,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed GET ${apiUrl(input.target, reference.deliveryHref)}: HTTP ${
          response.status
        } ${await response.text()}`,
      );
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const archivePath = `media/${input.install.installId}/${reference.storageKey}`;

    validateExportedDocumentPayload(reference, response, bytes);

    objects.push({
      archivePath,
      ...(reference.asset
        ? { asset: mediaAssetForArchiveObject(reference.asset, bytes.byteLength) }
        : {}),
      byteSize: bytes.byteLength,
      contentType: reference.contentType,
      deliveryHref: reference.deliveryHref,
      storageKey: reference.storageKey,
    });
    files.push({
      archivePath,
      byteSize: bytes.byteLength,
      bytes,
      contentType: reference.contentType,
    });
  }

  return { files, objects };
}

async function resolveAppMediaReferences(input: {
  auth?: ArchiveExportAuth;
  fetcher: typeof fetch;
  install: AppInstall;
  records: readonly StoredRecord[];
  schema: StorageSnapshot["schema"];
  target: string;
}): Promise<AppArchiveMediaObject[]> {
  const referencesByKey = new Map<string, AppArchiveMediaObject>();
  const references = appArchiveMediaReferences(input.schema, input.records);
  const documentAssetsByField = await fetchReferencedDocumentAssets(input, references);

  for (const reference of references) {
    if (reference.kind === "image") {
      const facts = coreImageMediaDeliveryFactsForAssetId(reference.assetId);

      if (!facts) {
        throw new Error(
          `Installed app "${input.install.installId}" media field "${reference.entity}.${reference.field}" references invalid image asset "${reference.assetId}".`,
        );
      }

      referencesByKey.set(facts.storageKey, coreMediaReference(facts.storageKey, facts.href));
      continue;
    }

    const asset = documentAssetsByField
      .get(documentReferenceFieldKey(reference))
      ?.get(reference.assetId);

    if (
      !asset ||
      asset.ownerAppInstallId !== input.install.installId ||
      asset.access !== reference.policy.access ||
      !reference.policy.acceptedMimeTypes.includes(asset.contentType) ||
      asset.byteSize > reference.policy.maxBytes ||
      asset.deliveryHref !== `${appApiPath(input.install, "/media/documents")}/${asset.id}`
    ) {
      throw new Error(
        `Installed app "${input.install.installId}" document field "${reference.entity}.${reference.field}" references unavailable or incompatible asset "${reference.assetId}".`,
      );
    }

    referencesByKey.set(asset.storageKey, documentMediaReference(asset));
  }

  return [...referencesByKey.values()].sort((left, right) =>
    left.storageKey.localeCompare(right.storageKey),
  );
}

async function fetchReferencedDocumentAssets(
  input: {
    auth?: ArchiveExportAuth;
    fetcher: typeof fetch;
    install: AppInstall;
    target: string;
  },
  references: readonly AppArchiveMediaReference[],
): Promise<Map<string, Map<string, DocumentMediaAsset>>> {
  const documentReferences = references.filter(
    (reference): reference is Extract<AppArchiveMediaReference, { kind: "document" }> =>
      reference.kind === "document",
  );
  const referencesByField = new Map<
    string,
    Extract<AppArchiveMediaReference, { kind: "document" }>
  >();

  for (const reference of documentReferences) {
    referencesByField.set(documentReferenceFieldKey(reference), reference);
  }

  const assetsByField = new Map<string, Map<string, DocumentMediaAsset>>();

  for (const [fieldKey, reference] of [...referencesByField.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const search = new URLSearchParams({
      entity: reference.entity,
      field: reference.field,
    });
    const response = await fetchJson<unknown>(
      input.fetcher,
      apiUrl(input.target, `${appApiPath(input.install, "/media/documents")}?${search.toString()}`),
      {
        headers: archiveExportRequestHeaders(input.auth, "application/json", {
          mediaRead: true,
        }),
      },
    );
    const assets = parseDocumentMediaList(
      `Installed app "${input.install.installId}" document list`,
      response,
    );

    assetsByField.set(fieldKey, new Map(assets.map((asset) => [asset.id, asset])));
  }

  return assetsByField;
}

function parseDocumentMediaList(context: string, value: unknown): DocumentMediaAsset[] {
  if (typeof value !== "object" || value === null || !("assets" in value)) {
    throw new Error(`${context} must include assets.`);
  }

  const assets = (value as { assets?: unknown }).assets;

  if (!Array.isArray(assets) || !assets.every(isDocumentMediaAsset)) {
    throw new Error(`${context} assets must contain valid document media.`);
  }

  return assets;
}

function documentReferenceFieldKey(
  reference: Pick<AppArchiveMediaReference, "entity" | "field">,
): string {
  return `${reference.entity}\u0000${reference.field}`;
}

function coreMediaReference(storageKey: string, deliveryHref: string): AppArchiveMediaObject {
  const contentType = imageMediaContentTypeForKey(storageKey);
  const keyPrefix = `${CORE_IMAGE_KEY_PREFIX}/`;
  const assetId = storageKey.startsWith(keyPrefix)
    ? storageKey.slice(keyPrefix.length)
    : storageKey;

  if (!contentType) {
    throw new Error(`Media key "${storageKey}" has unsupported content type.`);
  }

  return {
    archivePath: "",
    asset: {
      byteSize: 0,
      contentType,
      deliveryHref,
      id: assetId,
      kind: "image",
      label: assetId,
      provider: "r2",
      status: "ready",
      storageKey,
    },
    byteSize: 0,
    contentType,
    deliveryHref,
    storageKey,
  };
}

function documentMediaReference(asset: DocumentMediaAsset): AppArchiveMediaObject {
  return {
    archivePath: "",
    asset,
    byteSize: asset.byteSize,
    contentType: asset.contentType,
    deliveryHref: asset.deliveryHref,
    storageKey: asset.storageKey,
  };
}

function mediaAssetForArchiveObject(asset: MediaAsset, byteSize: number): MediaAsset {
  if (asset.kind === "document") {
    return asset;
  }

  return {
    ...asset,
    byteSize,
  };
}

function validateExportedDocumentPayload(
  reference: AppArchiveMediaObject,
  response: Response,
  bytes: Uint8Array,
) {
  if (reference.asset?.kind !== "document") {
    return;
  }

  const validation = validatePdfDocumentMediaFile(
    {
      bytes,
      contentType: response.headers.get("Content-Type") ?? "",
      filename: reference.asset.filename,
      size: bytes.byteLength,
    },
    {
      acceptedMimeTypes: [MEDIA_PDF_CONTENT_TYPE],
      maxBytes: MEDIA_DOCUMENT_UPLOAD_MAX_BYTES,
    },
  );

  if (!validation.ok || bytes.byteLength !== reference.asset.byteSize) {
    throw new Error(
      `Document asset "${reference.asset.id}" payload does not match its immutable metadata.`,
    );
  }
}

async function fetchRemoteAppRegistry(
  target: string,
  dependencies: ArchiveExportAuth & Pick<ArchiveWorkflowDependencies, "fetch">,
): Promise<AppInstallsResponse> {
  return fetchJson<AppInstallsResponse>(
    dependencies.fetch,
    apiUrl(target, "/api/formless/app-installs"),
    { headers: archiveExportRequestHeaders(dependencies, "application/json") },
  );
}

type ArchiveExportAuth = {
  adminToken?: string | null;
  env?: NodeJS.ProcessEnv;
};

function archiveExportRequestHeaders(
  auth: ArchiveExportAuth | undefined,
  accept: string,
  options: { mediaRead?: boolean } = {},
): Headers {
  const headers = formlessCliTargetFetchHeaders({
    accept,
    adminToken: archiveExportAdminToken(auth),
  });

  if (options.mediaRead) {
    headers.set(ARCHIVE_EXPORT_MEDIA_READ_HEADER, "1");
  }

  return headers;
}

function archiveExportAdminToken(auth: ArchiveExportAuth | undefined): string | undefined {
  return (
    resolveFormlessCliAdminToken({
      env: auth?.env,
      explicitAdminToken: auth?.adminToken,
    }).token ?? undefined
  );
}

async function postRemoteArchiveRestore(
  input: {
    adminToken?: string | null;
    archive: PortableArchive;
    exactInstanceReplacement?: boolean;
    mediaFiles: readonly ArchiveDiskMediaFile[];
    packageResolver?: AppPackageResolver;
    target: string;
  },
  dependencies: ArchiveWorkflowDependencies,
): Promise<ArchiveRestoreRemoteResult> {
  const target = normalizeTargetUrl(input.target);

  return fetchJson<ArchiveRestoreRemoteResult>(
    dependencies.fetch,
    apiUrl(target, INSTANCE_ARCHIVE_RESTORE_API_PATH),
    {
      body: JSON.stringify({
        archive: JSON.parse(
          formatPortableArchive(input.archive, { packageResolver: input.packageResolver }),
        ) as unknown,
        ...(input.exactInstanceReplacement === undefined
          ? {}
          : { exactInstanceReplacement: input.exactInstanceReplacement }),
        mediaFiles: input.mediaFiles.map(archiveRestoreRequestMediaFile),
      }),
      headers: archiveRestoreRequestHeaders(input.adminToken, dependencies.env),
      method: "POST",
    },
  );
}

function archiveRestoreRequestHeaders(
  adminToken: string | null | undefined,
  env: NodeJS.ProcessEnv | undefined,
): Headers {
  return formlessCliTargetFetchHeaders({
    accept: "application/json",
    adminToken: resolveFormlessCliAdminToken({ env, explicitAdminToken: adminToken }).token,
    contentType: "application/json",
  });
}

function archiveRestoreRequestMediaFile(file: ArchiveDiskMediaFile) {
  return {
    archivePath: file.archivePath,
    byteSize: file.byteSize,
    bytesBase64: Buffer.from(file.bytes).toString("base64"),
    contentType: file.contentType,
  };
}

function retargetAppArchive(archive: AppArchive, installId: string): AppArchive {
  const nextArchive = parseAppArchive(jsonClone(archive));

  if (nextArchive.app.installId === installId) {
    return nextArchive;
  }

  const nextIdentity = installedAppStorageIdentity({
    installId,
    packageAppKey: nextArchive.app.packageAppKey,
  });

  if (!nextIdentity) {
    throw new Error(`App archive cannot restore into install "${installId}".`);
  }

  nextArchive.app.installId = nextIdentity.installId;

  nextArchive.data.storageIdentity = nextIdentity.authorityName;
  nextArchive.media.objects = nextArchive.media.objects.map((object) => {
    if (object.asset?.kind !== "document") {
      return object;
    }

    const storageKey = documentMediaStorageKeyForAssetId(object.asset.id, {
      ownerAppInstallId: nextIdentity.installId,
    });

    if (!storageKey) {
      throw new Error(`Document asset "${object.asset.id}" cannot be retargeted.`);
    }

    const deliveryHref = `${nextIdentity.apiRoutePrefix}/media/documents/${object.asset.id}`;

    return {
      ...object,
      asset: {
        ...object.asset,
        deliveryHref,
        ownerAppInstallId: nextIdentity.installId,
        storageKey,
      },
      deliveryHref,
      storageKey,
    };
  });

  return nextArchive;
}

function withRestorePolicy(
  archive: PortableArchive,
  policy: ArchiveRestorePolicy,
  options: { packageResolver?: AppPackageResolver } = {},
): PortableArchive {
  const nextArchive = parsePortableArchive(jsonClone(archive), {
    packageResolver: options.packageResolver,
  });

  nextArchive.restorePolicy = policy;

  if (nextArchive.kind === INSTANCE_ARCHIVE_KIND) {
    nextArchive.apps = nextArchive.apps.map((app) => ({
      ...app,
      restorePolicy: policy,
    }));
  }

  return nextArchive;
}

function appApiPath(install: AppInstall, suffix: `/${string}`): string {
  return `/api/app-installs/${install.packageAppKey}/${install.installId}${suffix}`;
}

function apiUrl(target: string, pathInput: string): string {
  const pathname = pathInput.startsWith("/") ? pathInput.slice(1) : pathInput;

  return new URL(pathname, `${target}/`).toString();
}

function normalizeTargetUrl(value: string): string {
  try {
    const url = new URL(value);

    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Target URL is invalid: ${value}`);
  }
}

async function fetchJson<T>(fetcher: typeof fetch, url: string, init?: RequestInit): Promise<T> {
  const response = await fetcher(url, init);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Failed ${init?.method ?? "GET"} ${url}: HTTP ${response.status} ${text}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Failed ${init?.method ?? "GET"} ${url}: response was not JSON.`);
  }
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
