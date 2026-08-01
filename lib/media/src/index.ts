import {
  CORE_IMAGE_KEY_PREFIX,
  CORE_MEDIA_ROUTE_PREFIX,
  MEDIA_ASSET_METADATA_KEYS,
  MEDIA_OBJECT_CACHE_CONTROL,
  MEDIA_PDF_CONTENT_TYPE,
  MEDIA_PRIVATE_DOCUMENT_CACHE_CONTROL,
  PROGRAM_DOCUMENT_MEDIA_KEY_PREFIX,
} from "./types.ts";
import type {
  DocumentMediaAccess,
  DocumentMediaAsset,
  DocumentMediaAssetDeliveryFacts,
  DocumentMediaCompatibility,
  DocumentMediaFileValidationResult,
  DocumentMediaResponseFacts,
  ImageMediaAsset,
  ImageMediaAssetDeliveryFacts,
  MediaAsset,
  MediaAssetMetadata,
  MediaDocumentFile,
  MediaObjectMetadata,
} from "./types.ts";

export {
  CORE_IMAGE_KEY_PREFIX,
  CORE_IMAGE_UPLOAD_PATH,
  CORE_MEDIA_ROUTE_PREFIX,
  MEDIA_ASSET_METADATA_KEYS,
  MEDIA_DOCUMENT_UPLOAD_MAX_BYTES,
  MEDIA_IMAGE_UPLOAD_MAX_BYTES,
  MEDIA_OBJECT_CACHE_CONTROL,
  MEDIA_PDF_CONTENT_TYPE,
  MEDIA_PRIVATE_DOCUMENT_CACHE_CONTROL,
  MEDIA_PUBLIC_CONTRACT_VERSION,
  PROGRAM_DOCUMENT_MEDIA_KEY_PREFIX,
} from "./types.ts";
export type {
  DocumentMediaAccess,
  DocumentMediaAsset,
  DocumentMediaAssetDeliveryFacts,
  DocumentMediaAssetMetadata,
  DocumentMediaCompatibility,
  DocumentMediaFileValidationError,
  DocumentMediaFileValidationResult,
  DocumentMediaListResponse,
  DocumentMediaResponseFacts,
  DocumentMediaRestoreResponse,
  DocumentMediaUploadResponse,
  ImageMediaAsset,
  ImageMediaAssetDeliveryFacts,
  ImageMediaAssetMetadata,
  ImageMediaListResponse,
  ImageMediaRestoreResponse,
  ImageMediaUploadResponse,
  MediaAsset,
  MediaAssetDeliveryFacts,
  MediaAssetMetadata,
  MediaDeliveryFacts,
  MediaDocumentFile,
  MediaImageFile,
  MediaObjectList,
  MediaObjectMetadata,
  MediaObjectStore,
  MediaObjectWrite,
  MediaStorageKey,
  MediaStoredObject,
  MediaStoredObjectListing,
  MediaWriteResponse,
  MediaWriteResult,
} from "./types.ts";

const imageExtensionsByContentType = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

const imageContentTypesByExtension = new Map([
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["gif", "image/gif"],
]);

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;

export function normalizeMediaContentType(value: string): string {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function imageMediaExtensionForContentType(contentType: string): string | undefined {
  return imageExtensionsByContentType.get(normalizeMediaContentType(contentType));
}

export function imageMediaContentTypeForKey(key: string): string | undefined {
  const extension = key.split(".").pop()?.toLowerCase();

  return extension ? imageContentTypesByExtension.get(extension) : undefined;
}

export function documentMediaExtensionForContentType(contentType: string): string | undefined {
  return normalizeMediaContentType(contentType) === MEDIA_PDF_CONTENT_TYPE ? "pdf" : undefined;
}

export function documentMediaContentTypeForKey(key: string): string | undefined {
  return key.split(".").pop()?.toLowerCase() === "pdf" ? MEDIA_PDF_CONTENT_TYPE : undefined;
}

export function isValidMediaStorageKey(key: string): boolean {
  if (key === "" || key.startsWith("/") || key.includes("\\") || key.includes("%")) {
    return false;
  }

  const segments = key.split("/");

  return segments.every(
    (segment) =>
      segment !== "" &&
      segment !== "." &&
      segment !== ".." &&
      /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment),
  );
}

export function isValidImageMediaAssetId(assetId: string): boolean {
  return !assetId.includes("/") && isValidMediaStorageKey(assetId);
}

export function isValidDocumentMediaAssetId(assetId: string): boolean {
  return (
    !assetId.includes("/") &&
    isValidMediaStorageKey(assetId) &&
    documentMediaContentTypeForKey(assetId) === MEDIA_PDF_CONTENT_TYPE
  );
}

export function isDocumentMediaAccess(value: unknown): value is DocumentMediaAccess {
  return value === "public" || value === "private";
}

export function documentMediaKeyPrefix(): string {
  return `${PROGRAM_DOCUMENT_MEDIA_KEY_PREFIX}/`;
}

export function documentMediaStorageKeyForAssetId(assetId: string): string | undefined {
  const keyPrefix = documentMediaKeyPrefix();

  if (!keyPrefix || !isValidDocumentMediaAssetId(assetId)) {
    return undefined;
  }

  return `${keyPrefix}${assetId}`;
}

export function isRestorableDocumentMediaKey(key: string): boolean {
  const keyPrefix = documentMediaKeyPrefix();

  return (
    isValidMediaStorageKey(key) &&
    key.startsWith(keyPrefix) &&
    isValidDocumentMediaAssetId(key.slice(keyPrefix.length))
  );
}

export function isRestorableImageMediaKey(key: string, options: { keyPrefix: string }): boolean {
  return (
    isValidMediaStorageKey(key) &&
    key.startsWith(options.keyPrefix) &&
    imageMediaContentTypeForKey(key) !== undefined
  );
}

export function isImageMediaAsset(value: unknown): value is ImageMediaAsset {
  if (!isMediaAssetBase(value) || value.kind !== "image") {
    return false;
  }

  return (
    (!("filename" in value) || typeof value.filename === "string") &&
    (!("height" in value) ||
      (typeof value.height === "number" && Number.isInteger(value.height) && value.height >= 0)) &&
    (!("width" in value) ||
      (typeof value.width === "number" && Number.isInteger(value.width) && value.width >= 0))
  );
}

export function isDocumentMediaAsset(value: unknown): value is DocumentMediaAsset {
  if (
    !isMediaAssetBase(value) ||
    value.kind !== "document" ||
    value.contentType !== MEDIA_PDF_CONTENT_TYPE ||
    typeof value.filename !== "string" ||
    value.filename.trim() === "" ||
    !isDocumentMediaAccess(value.access) ||
    value.byteSize === 0
  ) {
    return false;
  }

  return (
    isValidDocumentMediaAssetId(value.id) &&
    documentMediaStorageKeyForAssetId(value.id) === value.storageKey
  );
}

export function documentMediaAssetMatchesAccess(
  asset: DocumentMediaAsset,
  access: DocumentMediaAccess,
): boolean {
  return isDocumentMediaAccess(access) && asset.access === access;
}

export function documentMediaAssetIsCompatible(
  asset: DocumentMediaAsset,
  compatibility: DocumentMediaCompatibility,
): boolean {
  return (
    isDocumentMediaAsset(asset) &&
    documentMediaAssetMatchesAccess(asset, compatibility.access) &&
    compatibility.acceptedMimeTypes.some(
      (mimeType) => normalizeMediaContentType(mimeType) === asset.contentType,
    ) &&
    Number.isSafeInteger(compatibility.maxBytes) &&
    compatibility.maxBytes > 0 &&
    asset.byteSize <= compatibility.maxBytes
  );
}

export function mediaAssetFromObjectMetadata(
  metadata: MediaObjectMetadata | undefined,
): MediaAsset | undefined {
  if (!metadata) {
    return undefined;
  }

  const {
    [MEDIA_ASSET_METADATA_KEYS.assetId]: id,
    [MEDIA_ASSET_METADATA_KEYS.byteSize]: byteSizeValue,
    [MEDIA_ASSET_METADATA_KEYS.contentType]: contentType,
    [MEDIA_ASSET_METADATA_KEYS.deliveryHref]: deliveryHref,
    [MEDIA_ASSET_METADATA_KEYS.documentAccess]: documentAccess,
    [MEDIA_ASSET_METADATA_KEYS.filename]: filename,
    [MEDIA_ASSET_METADATA_KEYS.height]: heightValue,
    [MEDIA_ASSET_METADATA_KEYS.kind]: kind,
    [MEDIA_ASSET_METADATA_KEYS.label]: label,
    [MEDIA_ASSET_METADATA_KEYS.provider]: provider,
    [MEDIA_ASSET_METADATA_KEYS.status]: status,
    [MEDIA_ASSET_METADATA_KEYS.storageKey]: storageKey,
    [MEDIA_ASSET_METADATA_KEYS.width]: widthValue,
  } = metadata;
  const byteSize = parseOptionalMediaInteger(byteSizeValue);
  const width = parseOptionalMediaInteger(widthValue);
  const height = parseOptionalMediaInteger(heightValue);

  if (
    !id ||
    !label ||
    !contentType ||
    byteSize === undefined ||
    !provider ||
    !storageKey ||
    status !== "ready" ||
    !deliveryHref
  ) {
    return undefined;
  }

  if (kind === "image") {
    const asset: ImageMediaAsset = {
      byteSize,
      contentType,
      deliveryHref,
      ...(filename ? { filename } : {}),
      ...(height === undefined ? {} : { height }),
      id,
      kind,
      label,
      provider,
      status,
      storageKey,
      ...(width === undefined ? {} : { width }),
    };

    return isImageMediaAsset(asset) ? asset : undefined;
  }

  if (
    kind !== "document" ||
    !filename ||
    byteSize === 0 ||
    !isDocumentMediaAccess(documentAccess)
  ) {
    return undefined;
  }

  const asset: DocumentMediaAsset = {
    access: documentAccess,
    byteSize,
    contentType: MEDIA_PDF_CONTENT_TYPE,
    deliveryHref,
    filename,
    id,
    kind,
    label,
    provider,
    status,
    storageKey,
  };

  return contentType === MEDIA_PDF_CONTENT_TYPE && isDocumentMediaAsset(asset) ? asset : undefined;
}

export function mediaObjectMetadataForAsset(asset: MediaAsset): MediaAssetMetadata {
  if (asset.kind === "document") {
    return {
      [MEDIA_ASSET_METADATA_KEYS.assetId]: asset.id,
      [MEDIA_ASSET_METADATA_KEYS.byteSize]: String(asset.byteSize),
      [MEDIA_ASSET_METADATA_KEYS.contentType]: asset.contentType,
      [MEDIA_ASSET_METADATA_KEYS.deliveryHref]: asset.deliveryHref,
      [MEDIA_ASSET_METADATA_KEYS.documentAccess]: asset.access,
      [MEDIA_ASSET_METADATA_KEYS.filename]: asset.filename,
      [MEDIA_ASSET_METADATA_KEYS.kind]: asset.kind,
      [MEDIA_ASSET_METADATA_KEYS.label]: asset.label,
      [MEDIA_ASSET_METADATA_KEYS.provider]: asset.provider,
      [MEDIA_ASSET_METADATA_KEYS.status]: asset.status,
      [MEDIA_ASSET_METADATA_KEYS.storageKey]: asset.storageKey,
    };
  }

  return {
    [MEDIA_ASSET_METADATA_KEYS.assetId]: asset.id,
    [MEDIA_ASSET_METADATA_KEYS.byteSize]: String(asset.byteSize),
    [MEDIA_ASSET_METADATA_KEYS.contentType]: asset.contentType,
    [MEDIA_ASSET_METADATA_KEYS.deliveryHref]: asset.deliveryHref,
    ...(asset.filename ? { [MEDIA_ASSET_METADATA_KEYS.filename]: asset.filename } : {}),
    ...(asset.height === undefined
      ? {}
      : { [MEDIA_ASSET_METADATA_KEYS.height]: String(asset.height) }),
    [MEDIA_ASSET_METADATA_KEYS.kind]: asset.kind,
    [MEDIA_ASSET_METADATA_KEYS.label]: asset.label,
    [MEDIA_ASSET_METADATA_KEYS.provider]: asset.provider,
    [MEDIA_ASSET_METADATA_KEYS.status]: asset.status,
    [MEDIA_ASSET_METADATA_KEYS.storageKey]: asset.storageKey,
    ...(asset.width === undefined
      ? {}
      : { [MEDIA_ASSET_METADATA_KEYS.width]: String(asset.width) }),
  };
}

export function imageMediaDeliveryFactsForAssetId(
  assetId: string,
  options: { hrefForKey: (key: string) => string; keyPrefix: string },
): ImageMediaAssetDeliveryFacts | undefined {
  if (!isValidImageMediaAssetId(assetId)) {
    return undefined;
  }

  const storageKey = `${options.keyPrefix}${assetId}`;

  if (!isRestorableImageMediaKey(storageKey, { keyPrefix: options.keyPrefix })) {
    return undefined;
  }

  return {
    assetId,
    href: options.hrefForKey(storageKey),
    kind: "image",
    storageKey,
  };
}

export function coreImageMediaDeliveryFactsForAssetId(
  assetId: string,
): ImageMediaAssetDeliveryFacts | undefined {
  return imageMediaDeliveryFactsForAssetId(assetId, {
    hrefForKey: coreMediaHrefForKey,
    keyPrefix: `${CORE_IMAGE_KEY_PREFIX}/`,
  });
}

export function documentMediaDeliveryFactsForAssetId(
  assetId: string,
  options: {
    hrefForAssetId: (assetId: string) => string;
  },
): DocumentMediaAssetDeliveryFacts | undefined {
  const storageKey = documentMediaStorageKeyForAssetId(assetId);

  if (!storageKey) {
    return undefined;
  }

  return {
    assetId,
    href: options.hrefForAssetId(assetId),
    kind: "document",
    storageKey,
  };
}

export function validatePdfDocumentMediaFile(
  file: MediaDocumentFile,
  options: {
    acceptedMimeTypes: readonly string[];
    maxBytes: number;
  },
): DocumentMediaFileValidationResult {
  const contentType = normalizeMediaContentType(file.contentType);
  const acceptedMimeTypes = options.acceptedMimeTypes.map(normalizeMediaContentType);

  if (
    contentType !== MEDIA_PDF_CONTENT_TYPE ||
    !acceptedMimeTypes.includes(MEDIA_PDF_CONTENT_TYPE)
  ) {
    return { ok: false, error: "unsupported-content-type" };
  }

  if (
    !Number.isSafeInteger(file.size) ||
    file.size < 0 ||
    file.size !== file.bytes.byteLength ||
    !Number.isSafeInteger(options.maxBytes) ||
    options.maxBytes <= 0
  ) {
    return { ok: false, error: "invalid-size" };
  }

  if (file.size === 0) {
    return { ok: false, error: "empty" };
  }

  if (file.size > options.maxBytes) {
    return { ok: false, error: "too-large" };
  }

  if (!hasPdfDocumentSignature(file.bytes)) {
    return { ok: false, error: "invalid-pdf" };
  }

  return { ok: true, contentType: MEDIA_PDF_CONTENT_TYPE };
}

export function hasPdfDocumentSignature(bytes: Uint8Array): boolean {
  const searchLength = Math.min(bytes.byteLength, 1024);

  for (let offset = 0; offset <= searchLength - PDF_SIGNATURE.length; offset += 1) {
    if (PDF_SIGNATURE.every((byte, index) => bytes[offset + index] === byte)) {
      return true;
    }
  }

  return false;
}

export function safeDocumentMediaFilename(filename: string): string {
  const basename = filename.split(/[\\/]/).pop() ?? "";
  const ascii = basename
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/[";\r\n]/g, "_")
    .trim();
  const withExtension =
    ascii === "" ? "document.pdf" : ascii.toLowerCase().endsWith(".pdf") ? ascii : `${ascii}.pdf`;

  if (withExtension.length <= 180) {
    return withExtension;
  }

  return `${withExtension.slice(0, 176)}.pdf`;
}

export function documentMediaResponseFacts(
  asset: DocumentMediaAsset,
  options: { download?: boolean } = {},
): DocumentMediaResponseFacts {
  const disposition = options.download ? "attachment" : "inline";
  const filename = safeDocumentMediaFilename(asset.filename);

  return {
    cacheControl:
      asset.access === "public" ? MEDIA_OBJECT_CACHE_CONTROL : MEDIA_PRIVATE_DOCUMENT_CACHE_CONTROL,
    contentDisposition: `${disposition}; filename="${filename}"`,
    contentType: MEDIA_PDF_CONTENT_TYPE,
    xContentTypeOptions: "nosniff",
  };
}

export function coreMediaHrefForKey(key: string): string {
  return `${CORE_MEDIA_ROUTE_PREFIX}${key}`;
}

export function coreMediaKeyFromHref(href: string): string | undefined {
  if (!href.startsWith(CORE_MEDIA_ROUTE_PREFIX)) {
    return undefined;
  }

  const url = new URL(href, "https://formless.local");
  const key = url.pathname.startsWith(CORE_MEDIA_ROUTE_PREFIX)
    ? url.pathname.slice(CORE_MEDIA_ROUTE_PREFIX.length)
    : "";

  return isValidMediaStorageKey(key) ? key : undefined;
}

export function coreMediaKeyFromAssetId(assetId: string): string | undefined {
  return coreImageMediaDeliveryFactsForAssetId(assetId)?.storageKey;
}

function isMediaAssetBase(value: unknown): value is Record<string, unknown> & {
  byteSize: number;
  contentType: string;
  deliveryHref: string;
  id: string;
  kind: unknown;
  label: string;
  provider: string;
  status: "ready";
  storageKey: string;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).byteSize === "number" &&
    Number.isInteger((value as Record<string, unknown>).byteSize) &&
    ((value as Record<string, unknown>).byteSize as number) >= 0 &&
    typeof (value as Record<string, unknown>).contentType === "string" &&
    typeof (value as Record<string, unknown>).deliveryHref === "string" &&
    typeof (value as Record<string, unknown>).id === "string" &&
    typeof (value as Record<string, unknown>).label === "string" &&
    typeof (value as Record<string, unknown>).provider === "string" &&
    (value as Record<string, unknown>).status === "ready" &&
    typeof (value as Record<string, unknown>).storageKey === "string"
  );
}

function parseOptionalMediaInteger(value: string | undefined): number | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}
