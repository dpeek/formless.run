/**
 * Versioned public Program archive contract declarations, parsers, and formatters.
 */
import type { StorageSnapshot } from "@dpeek/formless-storage";
import {
  MEDIA_PDF_CONTENT_TYPE,
  isDocumentMediaAsset,
  isImageMediaAsset,
  safeDocumentMediaFilename,
  type MediaAsset,
} from "@dpeek/formless-media";

export const INSTANCE_ARCHIVE_KIND = "formless.instanceArchive";
export const ARCHIVE_VERSION = 2;

export const archiveCapabilities = ["core-media-assets"] as const;

export type ArchiveCapability = (typeof archiveCapabilities)[number];

export type ArchiveRestorePolicy = {
  dryRun: boolean;
};

export type ArchiveSourceSchemaHash = `sha256:${string}`;

export type ArchiveProgramSchemaProvenance = {
  kind: "program";
  sourceSchemaHash: ArchiveSourceSchemaHash;
};

export type ArchiveMediaObject = {
  asset?: MediaAsset;
  storageKey: string;
  archivePath: string;
  contentType: string;
  byteSize: number;
  deliveryHref: string;
};

export type ArchiveMediaManifest = {
  objects: ArchiveMediaObject[];
};

export type ArchiveProgram = {
  schemaProvenance: ArchiveProgramSchemaProvenance;
  snapshot: StorageSnapshot;
};

export type InstanceArchive = {
  kind: typeof INSTANCE_ARCHIVE_KIND;
  version: typeof ARCHIVE_VERSION;
  exportedAt: string;
  capabilities: ArchiveCapability[];
  restorePolicy: ArchiveRestorePolicy;
  program: ArchiveProgram;
  media: ArchiveMediaManifest;
};

export class InstanceArchiveValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstanceArchiveValidationError";
  }
}

export type ArchiveProgramValidationOptions = {
  programSnapshotContract?: ArchiveProgramSnapshotContract;
};

export type ArchiveProgramSnapshotContract = {
  canonicalize: (snapshot: StorageSnapshot) => StorageSnapshot;
  parse: (context: string, value: unknown) => StorageSnapshot;
  schemaProvenance?: ArchiveProgramSchemaProvenance;
};

const archiveCapabilitySet = new Set<string>(archiveCapabilities);
const sourceSchemaHashPattern = /^sha256:[a-f0-9]{64}$/;

export function parseInstanceArchive(
  value: unknown,
  options: ArchiveProgramValidationOptions = {},
): InstanceArchive {
  try {
    return parseInstanceArchiveValue(value, options);
  } catch (error) {
    if (error instanceof InstanceArchiveValidationError) {
      throw error;
    }

    throw new InstanceArchiveValidationError(
      error instanceof Error ? error.message : "Instance archive is invalid.",
    );
  }
}

function parseInstanceArchiveValue(
  value: unknown,
  options: ArchiveProgramValidationOptions = {},
): InstanceArchive {
  const object = parseObject("Instance archive", value);

  assertExactKeys("Instance archive", object, [
    "kind",
    "version",
    "exportedAt",
    "capabilities",
    "restorePolicy",
    "program",
    "media",
  ]);

  if (object.kind !== INSTANCE_ARCHIVE_KIND) {
    throw new Error(`Instance archive kind must be "${INSTANCE_ARCHIVE_KIND}".`);
  }

  if (object.version !== ARCHIVE_VERSION) {
    throw new Error(`Instance archive version must be ${ARCHIVE_VERSION}.`);
  }

  return {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: parseIsoTimestamp("Instance archive exportedAt", object.exportedAt),
    capabilities: parseCapabilities("Instance archive capabilities", object.capabilities),
    restorePolicy: parseRestorePolicy("Instance archive restorePolicy", object.restorePolicy),
    program: parseArchiveProgram("Instance archive program", object.program, options),
    media: parseMediaManifest("Instance archive media", object.media),
  };
}

export function formatInstanceArchive(
  archive: InstanceArchive,
  options: ArchiveProgramValidationOptions = {},
): string {
  const canonical = canonicalInstanceArchive(archive, options);

  return `${JSON.stringify(
    canonicalInstanceArchive(parseInstanceArchive(canonical, options), options),
    null,
    2,
  )}\n`;
}

function parseArchiveProgram(
  context: string,
  value: unknown,
  options: ArchiveProgramValidationOptions,
): ArchiveProgram {
  const object = parseObject(context, value);

  assertExactKeys(context, object, ["schemaProvenance", "snapshot"]);

  const schemaProvenance = parseProgramSchemaProvenance(
    `${context} schemaProvenance`,
    object.schemaProvenance,
  );
  const expectedProvenance = options.programSnapshotContract?.schemaProvenance;

  if (
    expectedProvenance !== undefined &&
    (schemaProvenance.kind !== expectedProvenance.kind ||
      schemaProvenance.sourceSchemaHash !== expectedProvenance.sourceSchemaHash)
  ) {
    throw new Error(
      `${context} schemaProvenance sourceSchemaHash must be "${expectedProvenance.sourceSchemaHash}".`,
    );
  }

  if (options.programSnapshotContract === undefined) {
    throw new Error(`${context} snapshot requires an injected Program snapshot contract.`);
  }

  return {
    schemaProvenance,
    snapshot: options.programSnapshotContract.parse(`${context} snapshot`, object.snapshot),
  };
}

function parseProgramSchemaProvenance(
  context: string,
  value: unknown,
): ArchiveProgramSchemaProvenance {
  const object = parseObject(context, value);

  assertExactKeys(context, object, ["kind", "sourceSchemaHash"]);

  if (object.kind !== "program") {
    throw new Error(`${context} kind must be "program".`);
  }

  if (
    typeof object.sourceSchemaHash !== "string" ||
    !sourceSchemaHashPattern.test(object.sourceSchemaHash)
  ) {
    throw new Error(`${context} sourceSchemaHash must be a sha256 source schema hash.`);
  }

  return {
    kind: "program",
    sourceSchemaHash: object.sourceSchemaHash as ArchiveSourceSchemaHash,
  };
}

function parseMediaManifest(context: string, value: unknown): ArchiveMediaManifest {
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

function parseMediaObject(context: string, value: unknown): ArchiveMediaObject {
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
    assertExactKeys(context, object, [...baseKeys, "access", "filename"]);

    const asset = {
      access: parseDocumentAccess(`${context} access`, object.access),
      byteSize: parseNonNegativeInteger(`${context} byteSize`, object.byteSize),
      contentType: parseContentType(`${context} contentType`, object.contentType),
      deliveryHref: parseDeliveryHref(`${context} deliveryHref`, object.deliveryHref),
      filename: parseTrimmedNonEmptyString(`${context} filename`, object.filename),
      id: parseTrimmedNonEmptyString(`${context} id`, object.id),
      kind: "document" as const,
      label: parseTrimmedNonEmptyString(`${context} label`, object.label),
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

  assertExactKeys(context, object, ["dryRun"]);

  if (typeof object.dryRun !== "boolean") {
    throw new Error(`${context} dryRun must be a boolean.`);
  }

  return { dryRun: object.dryRun };
}

function parseCapabilities(context: string, value: unknown): ArchiveCapability[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  const seen = new Set<string>();

  return value.map((capability, index) => {
    if (typeof capability !== "string" || !archiveCapabilitySet.has(capability)) {
      throw new Error(`${context}[${index}] "${String(capability)}" is unsupported.`);
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
  options: ArchiveProgramValidationOptions = {},
): InstanceArchive {
  return {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: archive.exportedAt,
    capabilities: canonicalCapabilities(archive.capabilities),
    restorePolicy: { dryRun: archive.restorePolicy.dryRun },
    program: canonicalArchiveProgram(archive.program, options),
    media: canonicalMediaManifest(archive.media),
  };
}

function canonicalArchiveProgram(
  program: ArchiveProgram,
  options: ArchiveProgramValidationOptions,
): ArchiveProgram {
  if (options.programSnapshotContract === undefined) {
    throw new Error(
      "Instance archive program snapshot requires an injected Program snapshot contract.",
    );
  }

  return {
    schemaProvenance: {
      kind: "program",
      sourceSchemaHash: program.schemaProvenance.sourceSchemaHash,
    },
    snapshot: options.programSnapshotContract.canonicalize(program.snapshot),
  };
}

function canonicalCapabilities(capabilities: ArchiveCapability[]): ArchiveCapability[] {
  return [...capabilities].sort(
    (left, right) => archiveCapabilities.indexOf(left) - archiveCapabilities.indexOf(right),
  );
}

function canonicalMediaManifest(manifest: ArchiveMediaManifest): ArchiveMediaManifest {
  return {
    objects: [...manifest.objects].map(canonicalMediaObject).sort((left, right) => {
      const storageKeyOrder = compareOrdinal(left.storageKey, right.storageKey);

      return storageKeyOrder === 0
        ? compareOrdinal(left.archivePath, right.archivePath)
        : storageKeyOrder;
    }),
  };
}

function canonicalMediaObject(media: ArchiveMediaObject): ArchiveMediaObject {
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

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
