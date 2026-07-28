/**
 * Versioned public archive contract declarations, parsers, and formatters.
 */
import {
  defaultAppInstallRegistrationPolicy,
  isSourceSchemaHash,
  parseAppInstallRegistrationOperation,
  parseAppInstallRegistrationPolicy,
  validateAppInstallId,
  type AppPackageResolver,
  type AppInstallRegistrationOperation,
  type AppInstallRegistrationPolicy,
  type PackageAppRevision,
  type SourceSchemaHash,
} from "@dpeek/formless-installed-apps";
import {
  canonicalizeInstanceControlPlaneStorageSnapshot,
  parseInstanceControlPlaneStorageSnapshot,
} from "@dpeek/formless-instance-control-plane";
import {
  STORAGE_SNAPSHOT_KIND,
  formatStoredRecordsForArtifact,
  parseStorageSnapshot,
} from "@dpeek/formless-storage";
import type { StorageSnapshot } from "@dpeek/formless-storage";
import type { AppSchema } from "@dpeek/formless-schema";
import {
  MEDIA_PDF_CONTENT_TYPE,
  isDocumentMediaAsset,
  isImageMediaAsset,
  safeDocumentMediaFilename,
  type MediaAsset,
} from "@dpeek/formless-media";

export const INSTANCE_ARCHIVE_KIND = "formless.instanceArchive";
export const APP_ARCHIVE_KIND = "formless.appArchive";
export const ARCHIVE_VERSION = 2;

export const archiveCapabilities = [
  "installed-app-registry",
  "schema-owned-control-plane",
  "app-store-snapshots",
  "core-media-assets",
] as const;

export type ArchiveCapability = (typeof archiveCapabilities)[number];

export type RestorePolicyInstallCollisions = "reject" | "replace";

export type ArchiveRestorePolicy = {
  dryRun: boolean;
  installCollisions: RestorePolicyInstallCollisions;
};

export type ArchivedAppInstall = {
  installId: string;
  packageAppKey: string;
  packageRevision: PackageAppRevision;
  sourceSchemaKey: string;
  sourceSchemaHash: SourceSchemaHash;
  label: string;
  registrationPolicy: AppInstallRegistrationPolicy;
  registrationOperation?: AppInstallRegistrationOperation;
  status: "installed";
  createdAt: string;
  updatedAt: string;
};

export type AppArchiveStorageSnapshotData = StorageSnapshot;

export type AppArchiveData = AppArchiveStorageSnapshotData;

export type AppArchiveMediaObject = {
  asset?: MediaAsset;
  storageKey: string;
  archivePath: string;
  contentType: string;
  byteSize: number;
  deliveryHref: string;
};

export type AppArchiveMediaManifest = {
  objects: AppArchiveMediaObject[];
};

export type AppArchive = {
  kind: typeof APP_ARCHIVE_KIND;
  version: typeof ARCHIVE_VERSION;
  exportedAt: string;
  capabilities: ArchiveCapability[];
  restorePolicy: ArchiveRestorePolicy;
  app: ArchivedAppInstall;
  data: AppArchiveData;
  media: AppArchiveMediaManifest;
};

export type InstanceArchiveControlPlane = StorageSnapshot;

export type InstanceArchive = {
  kind: typeof INSTANCE_ARCHIVE_KIND;
  version: typeof ARCHIVE_VERSION;
  exportedAt: string;
  capabilities: ArchiveCapability[];
  restorePolicy: ArchiveRestorePolicy;
  controlPlane?: InstanceArchiveControlPlane;
  apps: AppArchive[];
};

export type PortableArchive = InstanceArchive | AppArchive;

export type ArchiveControlPlaneValidationOptions = {
  packageResolver?: AppPackageResolver;
};

const archiveCapabilitySet = new Set<string>(archiveCapabilities);

export function parsePortableArchive(
  value: unknown,
  options: ArchiveControlPlaneValidationOptions = {},
): PortableArchive {
  const object = parseObject("Archive", value);

  if (typeof object.kind !== "string" || object.kind.trim() === "") {
    throw new Error('Archive must include "kind".');
  }

  if (object.kind === INSTANCE_ARCHIVE_KIND) {
    return parseInstanceArchive(object, options);
  }

  if (object.kind === APP_ARCHIVE_KIND) {
    return parseAppArchive(object);
  }

  throw new Error(`Archive kind "${object.kind}" is unsupported.`);
}

export function parseInstanceArchive(
  value: unknown,
  options: ArchiveControlPlaneValidationOptions = {},
): InstanceArchive {
  const object = parseObject("Instance archive", value);

  assertExactKeys("Instance archive", object, [
    "kind",
    "version",
    "exportedAt",
    "capabilities",
    "restorePolicy",
    ...("controlPlane" in object ? ["controlPlane"] : []),
    "apps",
  ]);

  if (object.kind !== INSTANCE_ARCHIVE_KIND) {
    throw new Error(`Instance archive kind must be "${INSTANCE_ARCHIVE_KIND}".`);
  }

  if (object.version !== ARCHIVE_VERSION) {
    throw new Error(`Instance archive version must be ${ARCHIVE_VERSION}.`);
  }

  if (!Array.isArray(object.apps)) {
    throw new Error("Instance archive apps must be an array.");
  }

  return {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: parseIsoTimestamp("Instance archive exportedAt", object.exportedAt),
    capabilities: parseCapabilities("Instance archive capabilities", object.capabilities),
    restorePolicy: parseRestorePolicy("Instance archive restorePolicy", object.restorePolicy),
    ...(object.controlPlane === undefined
      ? {}
      : {
          controlPlane: parseInstanceArchiveControlPlane(
            "Instance archive controlPlane",
            object.controlPlane,
            options,
          ),
        }),
    apps: object.apps.map((app, index) =>
      parseAppArchiveAt(`Instance archive apps[${index}]`, app),
    ),
  };
}

export function parseAppArchive(value: unknown): AppArchive {
  return parseAppArchiveAt("App archive", value);
}

export function formatInstanceArchive(
  archive: InstanceArchive,
  options: ArchiveControlPlaneValidationOptions = {},
): string {
  const strippedArchive = canonicalInstanceArchive(archive, options);

  return `${JSON.stringify(
    canonicalInstanceArchive(parseInstanceArchive(strippedArchive, options), options),
    null,
    2,
  )}\n`;
}

export function formatAppArchive(archive: AppArchive): string {
  return `${JSON.stringify(canonicalAppArchive(parseAppArchive(archive)), null, 2)}\n`;
}

function parseAppArchiveAt(context: string, value: unknown): AppArchive {
  const object = parseObject(context, value);

  assertExactKeys(context, object, [
    "kind",
    "version",
    "exportedAt",
    "capabilities",
    "restorePolicy",
    "app",
    "data",
    "media",
  ]);

  if (object.kind !== APP_ARCHIVE_KIND) {
    throw new Error(`${context} kind must be "${APP_ARCHIVE_KIND}".`);
  }

  if (object.version !== ARCHIVE_VERSION) {
    throw new Error(`${context} version must be ${ARCHIVE_VERSION}.`);
  }

  const app = parseArchivedAppInstall(`${context} app`, object.app);

  return {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: parseIsoTimestamp(`${context} exportedAt`, object.exportedAt),
    capabilities: parseCapabilities(`${context} capabilities`, object.capabilities),
    restorePolicy: parseRestorePolicy(`${context} restorePolicy`, object.restorePolicy),
    app,
    data: parseAppArchiveData(`${context} data`, object.data, {
      schemaKey: app.sourceSchemaKey,
      storageIdentity: `app:${app.installId}`,
    }),
    media: parseMediaManifest(`${context} media`, object.media),
  };
}

function parseArchivedAppInstall(context: string, value: unknown): ArchivedAppInstall {
  const object = parseObject(context, value);

  assertExactKeys(context, object, [
    "installId",
    "packageAppKey",
    "packageRevision",
    "sourceSchemaKey",
    "sourceSchemaHash",
    "label",
    ...("registrationPolicy" in object ? ["registrationPolicy"] : []),
    ...("registrationOperation" in object ? ["registrationOperation"] : []),
    "status",
    "createdAt",
    "updatedAt",
  ]);

  const installId = parseTrimmedNonEmptyString(`${context} installId`, object.installId);
  const installIdResult = validateAppInstallId(installId);

  if (!installIdResult.ok) {
    throw new Error(`${context} installId is invalid: ${installIdResult.error.message}`);
  }

  if (object.status !== "installed") {
    throw new Error(`${context} status must be "installed".`);
  }

  const registrationPolicy =
    object.registrationPolicy === undefined
      ? defaultAppInstallRegistrationPolicy()
      : parseAppInstallRegistrationPolicy(
          object.registrationPolicy,
          `${context} registrationPolicy`,
        );
  const registrationOperation = parseArchivedAppInstallRegistrationOperation(
    context,
    object.registrationOperation,
    registrationPolicy,
  );

  return {
    installId: installIdResult.installId,
    packageAppKey: parseTrimmedNonEmptyString(`${context} packageAppKey`, object.packageAppKey),
    packageRevision: parsePositiveInteger(`${context} packageRevision`, object.packageRevision),
    sourceSchemaKey: parseTrimmedNonEmptyString(
      `${context} sourceSchemaKey`,
      object.sourceSchemaKey,
    ),
    sourceSchemaHash: parseSourceSchemaHash(`${context} sourceSchemaHash`, object.sourceSchemaHash),
    label: parseTrimmedNonEmptyString(`${context} label`, object.label),
    registrationPolicy,
    ...(registrationOperation === undefined ? {} : { registrationOperation }),
    status: "installed",
    createdAt: parseIsoTimestamp(`${context} createdAt`, object.createdAt),
    updatedAt: parseIsoTimestamp(`${context} updatedAt`, object.updatedAt),
  };
}

function parseArchivedAppInstallRegistrationOperation(
  context: string,
  value: unknown,
  registrationPolicy: AppInstallRegistrationPolicy,
): AppInstallRegistrationOperation | undefined {
  if (registrationPolicy === "custom-operation") {
    if (value === undefined) {
      throw new Error(
        `${context} registrationOperation is required when registrationPolicy is "custom-operation".`,
      );
    }

    return parseAppInstallRegistrationOperation(value, `${context} registrationOperation`);
  }

  if (value !== undefined) {
    throw new Error(
      `${context} registrationOperation must be omitted unless registrationPolicy is "custom-operation".`,
    );
  }

  return undefined;
}

export function parseAppArchiveData(
  context: string,
  value: unknown,
  expected: { schemaKey: string; storageIdentity?: string },
): AppArchiveData {
  const object = parseObject(context, value);

  if (object.kind === STORAGE_SNAPSHOT_KIND) {
    return parseStorageSnapshot(object, expected);
  }

  throw new Error(`${context} kind must be "${STORAGE_SNAPSHOT_KIND}".`);
}

function parseMediaManifest(context: string, value: unknown): AppArchiveMediaManifest {
  const object = parseObject(context, value);

  assertExactKeys(context, object, ["objects"]);

  if (!Array.isArray(object.objects)) {
    throw new Error(`${context} objects must be an array.`);
  }

  return {
    objects: object.objects.map((media, index) =>
      parseMediaObject(`${context} objects[${index}]`, media),
    ),
  };
}

function parseMediaObject(context: string, value: unknown): AppArchiveMediaObject {
  const object = parseObject(context, value);
  const requiredKeys = ["storageKey", "archivePath", "contentType", "byteSize", "deliveryHref"];

  assertExactKeys(context, object, "asset" in object ? [...requiredKeys, "asset"] : requiredKeys);

  return {
    storageKey: parseRelativeKey(`${context} storageKey`, object.storageKey),
    archivePath: parseRelativeKey(`${context} archivePath`, object.archivePath),
    contentType: parseContentType(`${context} contentType`, object.contentType),
    byteSize: parseNonNegativeInteger(`${context} byteSize`, object.byteSize),
    deliveryHref: parseDeliveryHref(`${context} deliveryHref`, object.deliveryHref),
    ...("asset" in object ? { asset: parseMediaAsset(`${context} asset`, object.asset) } : {}),
  };
}

function parseInstanceArchiveControlPlane(
  context: string,
  value: unknown,
  options: ArchiveControlPlaneValidationOptions,
): InstanceArchiveControlPlane {
  return parseInstanceControlPlaneStorageSnapshot(context, value, {
    packageResolver: options.packageResolver,
  });
}

function parseMediaAsset(context: string, value: unknown): MediaAsset {
  const object = parseObject(context, value);
  const baseKeys = [
    "byteSize",
    "contentType",
    "deliveryHref",
    "id",
    "kind",
    "label",
    "provider",
    "status",
    "storageKey",
  ];

  if (object.status !== "ready") {
    throw new Error(`${context} status must be "ready".`);
  }

  if (object.kind === "document") {
    assertExactKeys(context, object, [...baseKeys, "access", "filename", "ownerAppInstallId"]);

    const asset = {
      access: parseDocumentAccess(`${context} access`, object.access),
      byteSize: parseNonNegativeInteger(`${context} byteSize`, object.byteSize),
      contentType: parseContentType(`${context} contentType`, object.contentType),
      deliveryHref: parseDeliveryHref(`${context} deliveryHref`, object.deliveryHref),
      filename: parseTrimmedNonEmptyString(`${context} filename`, object.filename),
      id: parseTrimmedNonEmptyString(`${context} id`, object.id),
      kind: "document" as const,
      label: parseTrimmedNonEmptyString(`${context} label`, object.label),
      ownerAppInstallId: parseTrimmedNonEmptyString(
        `${context} ownerAppInstallId`,
        object.ownerAppInstallId,
      ),
      provider: parseTrimmedNonEmptyString(`${context} provider`, object.provider),
      status: "ready" as const,
      storageKey: parseRelativeKey(`${context} storageKey`, object.storageKey),
    };

    if (
      asset.contentType !== MEDIA_PDF_CONTENT_TYPE ||
      safeDocumentMediaFilename(asset.filename) !== asset.filename ||
      !isDocumentMediaAsset(asset)
    ) {
      throw new Error(`${context} must be valid document media metadata.`);
    }

    return asset;
  }

  if (object.kind === "image") {
    const optionalKeys = ["filename", "height", "width"];

    assertExactKeys(context, object, [...baseKeys, ...optionalKeys.filter((key) => key in object)]);

    const asset = {
      byteSize: parseNonNegativeInteger(`${context} byteSize`, object.byteSize),
      contentType: parseContentType(`${context} contentType`, object.contentType),
      deliveryHref: parseDeliveryHref(`${context} deliveryHref`, object.deliveryHref),
      ...("filename" in object
        ? { filename: parseTrimmedNonEmptyString(`${context} filename`, object.filename) }
        : {}),
      ...("height" in object
        ? { height: parseNonNegativeInteger(`${context} height`, object.height) }
        : {}),
      id: parseTrimmedNonEmptyString(`${context} id`, object.id),
      kind: "image" as const,
      label: parseTrimmedNonEmptyString(`${context} label`, object.label),
      provider: parseTrimmedNonEmptyString(`${context} provider`, object.provider),
      status: "ready" as const,
      storageKey: parseRelativeKey(`${context} storageKey`, object.storageKey),
      ...("width" in object
        ? { width: parseNonNegativeInteger(`${context} width`, object.width) }
        : {}),
    };

    if (!isImageMediaAsset(asset)) {
      throw new Error(`${context} must be valid image media metadata.`);
    }

    return asset;
  }

  throw new Error(`${context} kind must be "image" or "document".`);
}

function parseDocumentAccess(context: string, value: unknown): "public" | "private" {
  if (value !== "public" && value !== "private") {
    throw new Error(`${context} must be "public" or "private".`);
  }

  return value;
}

function parseRestorePolicy(context: string, value: unknown): ArchiveRestorePolicy {
  const object = parseObject(context, value);

  assertExactKeys(context, object, ["dryRun", "installCollisions"]);

  if (typeof object.dryRun !== "boolean") {
    throw new Error(`${context} dryRun must be a boolean.`);
  }

  if (object.installCollisions !== "reject" && object.installCollisions !== "replace") {
    throw new Error(`${context} installCollisions must be "reject" or "replace".`);
  }

  return {
    dryRun: object.dryRun,
    installCollisions: object.installCollisions,
  };
}

function parseCapabilities(context: string, value: unknown): ArchiveCapability[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  const seen = new Set<string>();

  return value.map((capability, index) => {
    if (typeof capability !== "string") {
      throw new Error(`${context}[${index}] must be a supported capability.`);
    }

    if (!archiveCapabilitySet.has(capability)) {
      throw new Error(`${context}[${index}] "${capability}" is unsupported.`);
    }

    if (seen.has(capability)) {
      throw new Error(`${context} includes duplicate "${capability}".`);
    }

    seen.add(capability);

    return capability as ArchiveCapability;
  });
}

function parseObject(context: string, value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function assertExactKeys(context: string, value: Record<string, unknown>, requiredKeys: string[]) {
  const allowedKeys = new Set(requiredKeys);

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }

  for (const key of requiredKeys) {
    if (!(key in value)) {
      throw new Error(`${context} must include "${key}".`);
    }
  }
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value;
}

function parseTrimmedNonEmptyString(context: string, value: unknown): string {
  return parseNonEmptyString(context, value).trim();
}

function parseIsoTimestamp(context: string, value: unknown): string {
  const timestamp = parseNonEmptyString(context, value);
  const date = new Date(timestamp);

  if (Number.isNaN(date.valueOf()) || date.toISOString() !== timestamp) {
    throw new Error(`${context} must be an ISO timestamp.`);
  }

  return timestamp;
}

function parseNonNegativeInteger(context: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${context} must be a non-negative integer.`);
  }

  return value;
}

function parsePositiveInteger(context: string, value: unknown): PackageAppRevision {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${context} must be a positive integer.`);
  }

  return value;
}

function parseSourceSchemaHash(context: string, value: unknown): SourceSchemaHash {
  if (!isSourceSchemaHash(value)) {
    throw new Error(`${context} must be a sha256 source schema hash.`);
  }

  return value;
}

function parseContentType(context: string, value: unknown): string {
  const contentType = parseTrimmedNonEmptyString(context, value);

  if (!/^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/.test(contentType)) {
    throw new Error(`${context} must be a media content type.`);
  }

  return contentType;
}

function parseDeliveryHref(context: string, value: unknown): string {
  const href = parseNonEmptyString(context, value);

  if (!href.startsWith("/") || href.includes(" ")) {
    throw new Error(`${context} must be an absolute API path.`);
  }

  return href;
}

function parseRelativeKey(context: string, value: unknown): string {
  const key = parseNonEmptyString(context, value);
  const segments = key.split("/");

  if (
    key !== key.trim() ||
    key.startsWith("/") ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`${context} must be a relative path without dot segments.`);
  }

  return key;
}

function canonicalInstanceArchive(
  archive: InstanceArchive,
  options: ArchiveControlPlaneValidationOptions = {},
): InstanceArchive {
  return {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: archive.exportedAt,
    capabilities: canonicalCapabilities(archive.capabilities),
    restorePolicy: canonicalRestorePolicy(archive.restorePolicy),
    ...(archive.controlPlane === undefined
      ? {}
      : { controlPlane: canonicalInstanceArchiveControlPlane(archive.controlPlane, options) }),
    apps: archive.apps
      .map(canonicalAppArchive)
      .sort((left, right) => left.app.installId.localeCompare(right.app.installId)),
  };
}

function canonicalInstanceArchiveControlPlane(
  controlPlane: InstanceArchiveControlPlane,
  options: ArchiveControlPlaneValidationOptions,
): InstanceArchiveControlPlane {
  return canonicalizeInstanceControlPlaneStorageSnapshot(controlPlane, {
    packageResolver: options.packageResolver,
  });
}

function canonicalAppArchive(archive: AppArchive): AppArchive {
  return {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: archive.exportedAt,
    capabilities: canonicalCapabilities(archive.capabilities),
    restorePolicy: canonicalRestorePolicy(archive.restorePolicy),
    app: canonicalArchivedAppInstall(archive.app),
    data: canonicalAppArchiveData(archive.data),
    media: canonicalMediaManifest(archive.media),
  };
}

function canonicalCapabilities(capabilities: ArchiveCapability[]): ArchiveCapability[] {
  return [...capabilities].sort(
    (left, right) => archiveCapabilities.indexOf(left) - archiveCapabilities.indexOf(right),
  );
}

function canonicalRestorePolicy(policy: ArchiveRestorePolicy): ArchiveRestorePolicy {
  return {
    dryRun: policy.dryRun,
    installCollisions: policy.installCollisions,
  };
}

function canonicalArchivedAppInstall(app: ArchivedAppInstall): ArchivedAppInstall {
  return {
    installId: app.installId,
    packageAppKey: app.packageAppKey,
    packageRevision: app.packageRevision,
    sourceSchemaKey: app.sourceSchemaKey,
    sourceSchemaHash: app.sourceSchemaHash,
    label: app.label,
    registrationPolicy: app.registrationPolicy,
    ...(app.registrationOperation === undefined
      ? {}
      : { registrationOperation: app.registrationOperation }),
    status: "installed",
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  };
}

function canonicalAppArchiveData(data: AppArchiveData): AppArchiveData {
  return canonicalStorageSnapshot(data);
}

function canonicalStorageSnapshot(snapshot: StorageSnapshot): StorageSnapshot {
  return {
    kind: snapshot.kind,
    version: snapshot.version,
    storageIdentity: snapshot.storageIdentity,
    schemaKey: snapshot.schemaKey,
    exportedAt: snapshot.exportedAt,
    schemaUpdatedAt: snapshot.schemaUpdatedAt,
    sourceCursor: snapshot.sourceCursor,
    schema: stableValue(snapshot.schema) as AppSchema,
    records: formatStoredRecordsForArtifact(snapshot.schema, snapshot.records),
  };
}

function canonicalMediaManifest(manifest: AppArchiveMediaManifest): AppArchiveMediaManifest {
  return {
    objects: [...manifest.objects].map(canonicalMediaObject).sort((left, right) => {
      const storageKeyOrder = left.storageKey.localeCompare(right.storageKey);

      return storageKeyOrder === 0
        ? left.archivePath.localeCompare(right.archivePath)
        : storageKeyOrder;
    }),
  };
}

function canonicalMediaObject(media: AppArchiveMediaObject): AppArchiveMediaObject {
  return {
    storageKey: media.storageKey,
    archivePath: media.archivePath,
    contentType: media.contentType,
    byteSize: media.byteSize,
    deliveryHref: media.deliveryHref,
    ...(media.asset === undefined ? {} : { asset: canonicalMediaAsset(media.asset) }),
  };
}

function canonicalMediaAsset(asset: MediaAsset): MediaAsset {
  if (asset.kind === "document") {
    return {
      access: asset.access,
      byteSize: asset.byteSize,
      contentType: asset.contentType,
      deliveryHref: asset.deliveryHref,
      filename: asset.filename,
      id: asset.id,
      kind: asset.kind,
      label: asset.label,
      ownerAppInstallId: asset.ownerAppInstallId,
      provider: asset.provider,
      status: asset.status,
      storageKey: asset.storageKey,
    };
  }

  return {
    byteSize: asset.byteSize,
    contentType: asset.contentType,
    deliveryHref: asset.deliveryHref,
    ...(asset.filename === undefined ? {} : { filename: asset.filename }),
    ...(asset.height === undefined ? {} : { height: asset.height }),
    id: asset.id,
    kind: asset.kind,
    label: asset.label,
    provider: asset.provider,
    status: asset.status,
    storageKey: asset.storageKey,
    ...(asset.width === undefined ? {} : { width: asset.width }),
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]),
  );
}
