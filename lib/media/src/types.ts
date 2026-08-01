/**
 * Public Media contract version.
 *
 * Version 1 covers first-party image and Program document media assets,
 * transfer shapes, delivery facts, storage keys, object metadata, and the
 * provider store seam. App-specific usage metadata remains owned by app schemas
 * and runtimes.
 *
 * This file is intentionally import-free so runtime-neutral, client, and Worker
 * entrypoints can share the same documented contract without pulling in adapter
 * code.
 */
export const MEDIA_PUBLIC_CONTRACT_VERSION = 1;

/** Maximum accepted image upload size for the core media API. */
export const MEDIA_IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

/** Runtime ceiling available to Program document upload policy. */
export const MEDIA_DOCUMENT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

/** Document content type currently accepted by Media adapters. */
export const MEDIA_PDF_CONTENT_TYPE = "application/pdf";

/** Cache policy applied to immutable stored media object responses. */
export const MEDIA_OBJECT_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** Cache policy applied to private Program document responses. */
export const MEDIA_PRIVATE_DOCUMENT_CACHE_CONTROL = "private, no-store";

/** Provider object-key prefix for owned core image media. */
export const CORE_IMAGE_KEY_PREFIX = "media/images";

/** Provider object-key prefix for global Program document media. */
export const PROGRAM_DOCUMENT_MEDIA_KEY_PREFIX = "media/program/documents";

/** Core image upload endpoint owned by the Media API. */
export const CORE_IMAGE_UPLOAD_PATH = "/api/formless/media/images";

/** Public route prefix for serving core media objects by storage key. */
export const CORE_MEDIA_ROUTE_PREFIX = "/api/formless/media/";

/** String metadata keys stored beside provider objects for media asset facts. */
export const MEDIA_ASSET_METADATA_KEYS = {
  assetId: "formless-media-asset-id",
  byteSize: "formless-media-byte-size",
  contentType: "formless-media-content-type",
  deliveryHref: "formless-media-delivery-href",
  documentAccess: "formless-media-document-access",
  filename: "formless-media-filename",
  height: "formless-media-height",
  kind: "formless-media-kind",
  label: "formless-media-label",
  provider: "formless-media-provider",
  status: "formless-media-status",
  storageKey: "formless-media-storage-key",
  width: "formless-media-width",
} as const;

/**
 * Provider storage key for a media object.
 *
 * Current core image keys are immutable and live under `media/images/`.
 */
export type MediaStorageKey = string;

/** String-only custom metadata persisted with a media object. */
export type MediaObjectMetadata = Record<string, string>;

/**
 * Metadata required to reconstruct a ready image media asset from provider
 * object metadata.
 */
export type ImageMediaAssetMetadata = MediaObjectMetadata & {
  "formless-media-asset-id": string;
  "formless-media-byte-size": string;
  "formless-media-content-type": string;
  "formless-media-delivery-href": string;
  "formless-media-filename"?: string;
  "formless-media-height"?: string;
  "formless-media-kind": "image";
  "formless-media-label": string;
  "formless-media-provider": string;
  "formless-media-status": "ready";
  "formless-media-storage-key": MediaStorageKey;
  "formless-media-width"?: string;
};

/** Metadata required to reconstruct one ready document asset. */
export type DocumentMediaAssetMetadata = MediaObjectMetadata & {
  "formless-media-asset-id": string;
  "formless-media-byte-size": string;
  "formless-media-content-type": string;
  "formless-media-delivery-href": string;
  "formless-media-document-access": DocumentMediaAccess;
  "formless-media-filename": string;
  "formless-media-kind": "document";
  "formless-media-label": string;
  "formless-media-provider": string;
  "formless-media-status": "ready";
  "formless-media-storage-key": MediaStorageKey;
};

/** Metadata for any ready Media-owned asset. */
export type MediaAssetMetadata = ImageMediaAssetMetadata | DocumentMediaAssetMetadata;

/** Normalized image file payload accepted by media upload and restore helpers. */
export type MediaImageFile = {
  bytes: Uint8Array;
  contentType: string;
  filename?: string;
  size: number;
};

/** Normalized document file payload accepted by media validation helpers. */
export type MediaDocumentFile = {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
  size: number;
};

export type DocumentMediaAccess = "public" | "private";

export type DocumentMediaFileValidationError =
  | "empty"
  | "invalid-pdf"
  | "invalid-size"
  | "too-large"
  | "unsupported-content-type";

export type DocumentMediaFileValidationResult =
  | {
      ok: true;
      contentType: typeof MEDIA_PDF_CONTENT_TYPE;
    }
  | {
      ok: false;
      error: DocumentMediaFileValidationError;
    };

/** Object-store write request used by provider adapters. */
export type MediaObjectWrite = {
  bytes: Uint8Array;
  cacheControl: string;
  contentType: string;
  customMetadata?: MediaObjectMetadata;
  key: MediaStorageKey;
};

/** Stored object facts returned by provider adapters for delivery. */
export type MediaStoredObject = {
  body: BodyInit | null;
  customMetadata?: MediaObjectMetadata;
  httpEtag: string;
  writeHttpMetadata: (headers: Headers) => void;
};

/** Listed object facts returned by provider adapters. */
export type MediaStoredObjectListing = {
  contentType?: string;
  customMetadata?: MediaObjectMetadata;
  key: MediaStorageKey;
  size?: number;
};

/** Provider object listing result. */
export type MediaObjectList = {
  objects: MediaStoredObjectListing[];
} & (
  | {
      cursor: string;
      truncated: true;
    }
  | {
      truncated?: false;
    }
);

/**
 * Minimal provider object-store seam used by the Worker adapter.
 *
 * `listObjects` is optional so providers without list support can still serve
 * and write objects.
 */
export type MediaObjectStore = {
  getObject: (key: MediaStorageKey) => Promise<MediaStoredObject | undefined>;
  listObjects?: (options: {
    cursor?: string;
    limit?: number;
    prefix: string;
  }) => Promise<MediaObjectList>;
  putObject: (write: MediaObjectWrite) => Promise<void>;
};

/**
 * Public first-party image media asset.
 *
 * App records should store flat asset ids or usage fields. Provider storage
 * facts stay in Media-owned metadata and adapter contracts.
 */
export type ImageMediaAsset = {
  byteSize: number;
  contentType: string;
  deliveryHref: string;
  filename?: string;
  height?: number;
  id: string;
  kind: "image";
  label: string;
  provider: string;
  status: "ready";
  storageKey: MediaStorageKey;
  width?: number;
};

/** Immutable Program-global document media asset. */
export type DocumentMediaAsset = {
  access: DocumentMediaAccess;
  byteSize: number;
  contentType: typeof MEDIA_PDF_CONTENT_TYPE;
  deliveryHref: string;
  filename: string;
  id: string;
  kind: "document";
  label: string;
  provider: string;
  status: "ready";
  storageKey: MediaStorageKey;
};

/** Public discriminated union for all Media-owned assets. */
export type MediaAsset = ImageMediaAsset | DocumentMediaAsset;

/** Response shape returned when an image upload creates or restores an asset. */
export type ImageMediaUploadResponse = {
  asset?: ImageMediaAsset;
  assetId?: string;
  contentType: string;
  href: string;
  key: MediaStorageKey;
  size: number;
};

/** Restore response matches upload response for restored image media objects. */
export type ImageMediaRestoreResponse = ImageMediaUploadResponse;

/** Response shape for listing ready image media assets. */
export type ImageMediaListResponse = {
  assets: ImageMediaAsset[];
};

/** Response shape returned when a document upload creates or restores an asset. */
export type DocumentMediaUploadResponse = {
  asset?: DocumentMediaAsset;
  assetId?: string;
  contentType: typeof MEDIA_PDF_CONTENT_TYPE;
  href: string;
  key: MediaStorageKey;
  size: number;
};

/** Restore response matches upload response for restored document objects. */
export type DocumentMediaRestoreResponse = DocumentMediaUploadResponse;

/** Response shape for listing compatible ready document assets. */
export type DocumentMediaListResponse = {
  assets: DocumentMediaAsset[];
};

/** Successful media write response for image or document uploads. */
export type MediaWriteResponse = ImageMediaUploadResponse | DocumentMediaUploadResponse;

/** Result union returned by write helpers before Worker response mapping. */
export type MediaWriteResult =
  | {
      ok: true;
      upload: MediaWriteResponse;
    }
  | {
      error: string;
      ok: false;
      status: number;
    };

/** Delivery payload and headers for serving a stored media object. */
export type MediaDeliveryFacts = {
  body: BodyInit | null;
  headers: Headers;
};

/** Routeable delivery facts derived from an image media asset id. */
export type ImageMediaAssetDeliveryFacts = {
  assetId: string;
  href: string;
  kind: "image";
  storageKey: MediaStorageKey;
};

/** Routeable delivery facts derived from a Program document asset id. */
export type DocumentMediaAssetDeliveryFacts = {
  assetId: string;
  href: string;
  kind: "document";
  storageKey: MediaStorageKey;
};

export type MediaAssetDeliveryFacts =
  | ImageMediaAssetDeliveryFacts
  | DocumentMediaAssetDeliveryFacts;

/** Header facts for inline or downloaded document delivery. */
export type DocumentMediaResponseFacts = {
  cacheControl: string;
  contentDisposition: string;
  contentType: typeof MEDIA_PDF_CONTENT_TYPE;
  xContentTypeOptions: "nosniff";
};

/** Compatibility facts supplied by a trusted Program runtime. */
export type DocumentMediaCompatibility = {
  acceptedMimeTypes: readonly string[];
  access: DocumentMediaAccess;
  maxBytes: number;
};
