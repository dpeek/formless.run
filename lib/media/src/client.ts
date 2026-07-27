import {
  CORE_IMAGE_UPLOAD_PATH,
  coreImageMediaDeliveryFactsForAssetId,
  isDocumentMediaAsset,
} from "./index.ts";
import {
  MEDIA_PDF_CONTENT_TYPE,
  type DocumentMediaAsset,
  type DocumentMediaListResponse,
  type DocumentMediaUploadResponse,
  type ImageMediaAsset,
  type ImageMediaListResponse,
  type ImageMediaUploadResponse,
} from "./types.ts";

export type {
  DocumentMediaAsset,
  DocumentMediaListResponse,
  DocumentMediaUploadResponse,
  ImageMediaAsset,
  ImageMediaListResponse,
  ImageMediaUploadResponse,
  MediaAsset,
} from "./types.ts";

export const IMAGE_UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
export const DOCUMENT_UPLOAD_ACCEPT = MEDIA_PDF_CONTENT_TYPE;

export type ImageDimensions = {
  height: number;
  width: number;
};

export type UploadedImageMedia = ImageMediaUploadResponse & {
  dimensions?: ImageDimensions;
};

export type ImageMediaAssetOption = {
  height?: number;
  href: string;
  id: string;
  label: string;
  width?: number;
};

export type DocumentMediaFieldIdentity = {
  entityName: string;
  fieldName: string;
};

export type AppDocumentMediaTarget = {
  documentsPath: `/api/${string}/media/documents`;
  field: DocumentMediaFieldIdentity;
};

export type DocumentMediaAssetOption = {
  access: DocumentMediaAsset["access"];
  byteSize: number;
  contentType: typeof MEDIA_PDF_CONTENT_TYPE;
  downloadHref: string;
  filename: string;
  href: string;
  id: string;
  label: string;
};

export type MediaAssetOption = ImageMediaAssetOption | DocumentMediaAssetOption;

export type UploadImageMediaFileOptions = {
  fetcher?: typeof fetch;
  readDimensions?: (file: File) => Promise<ImageDimensions | undefined>;
};

export type ListCoreImageMediaAssetsOptions = {
  fetcher?: typeof fetch;
};

export type AppDocumentMediaClientOptions = {
  fetcher?: typeof fetch;
};

export async function uploadCoreImageMediaFile(
  file: File,
  options: UploadImageMediaFileOptions = {},
): Promise<UploadedImageMedia> {
  return uploadImageMediaFile(file, CORE_IMAGE_UPLOAD_PATH, options);
}

export function coreImageMediaAssetOptionForId(assetId: string): ImageMediaAssetOption | undefined {
  const delivery = coreImageMediaDeliveryFactsForAssetId(assetId);

  if (!delivery) {
    return undefined;
  }

  return {
    href: delivery.href,
    id: delivery.assetId,
    label: delivery.assetId,
  };
}

export async function listCoreImageMediaAssets(
  options: ListCoreImageMediaAssetsOptions = {},
): Promise<ImageMediaAssetOption[]> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(CORE_IMAGE_UPLOAD_PATH, {
    headers: {
      Accept: "application/json",
    },
  });
  const body = await parseImageMediaListResponse(response);

  return body.assets.map(mediaAssetOptionFromAsset);
}

export async function uploadAppDocumentMediaFile(
  file: File,
  target: AppDocumentMediaTarget,
  options: AppDocumentMediaClientOptions = {},
): Promise<DocumentMediaUploadResponse> {
  const fetcher = options.fetcher ?? fetch;
  const formData = new FormData();

  formData.set("file", file);

  const response = await fetcher(appDocumentMediaCollectionHref(target), {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
    body: formData,
  });

  return parseDocumentMediaUploadResponse(response);
}

export async function listAppDocumentMediaAssets(
  target: AppDocumentMediaTarget,
  options: AppDocumentMediaClientOptions = {},
): Promise<DocumentMediaAssetOption[]> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(appDocumentMediaCollectionHref(target), {
    headers: {
      Accept: "application/json",
    },
  });
  const body = await parseDocumentMediaListResponse(response);

  return body.assets.map(documentMediaAssetOptionFromAsset);
}

export function appDocumentMediaCollectionHref(target: AppDocumentMediaTarget): string {
  const query = new URLSearchParams({
    entity: target.field.entityName,
    field: target.field.fieldName,
  });

  return `${target.documentsPath}?${query.toString()}`;
}

export function documentMediaDownloadHref(href: string): string {
  const url = new URL(href, "https://formless.local");

  url.searchParams.set("download", "1");

  return `${url.pathname}${url.search}${url.hash}`;
}

export async function readImageDimensions(file: File): Promise<ImageDimensions | undefined> {
  if (
    typeof Image === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function" ||
    typeof URL.revokeObjectURL !== "function"
  ) {
    return undefined;
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise<ImageDimensions | undefined>((resolve) => {
      const image = new Image();

      image.onload = () => {
        const width = image.naturalWidth;
        const height = image.naturalHeight;

        resolve(
          Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
            ? { height, width }
            : undefined,
        );
      };
      image.onerror = () => resolve(undefined);
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function parseImageMediaUploadResponse(
  response: Response,
): Promise<ImageMediaUploadResponse> {
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    const message = isErrorResponse(body)
      ? body.error
      : `Image upload failed with status ${response.status}.`;

    throw new Error(message);
  }

  if (!isImageMediaUploadResponse(body)) {
    throw new Error("Image upload returned an invalid response.");
  }

  return body;
}

export async function parseImageMediaListResponse(
  response: Response,
): Promise<ImageMediaListResponse> {
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    const message = isErrorResponse(body)
      ? body.error
      : `Media asset list failed with status ${response.status}.`;

    throw new Error(message);
  }

  if (!isImageMediaAssetListResponse(body)) {
    throw new Error("Media asset list returned an invalid response.");
  }

  return body;
}

export async function parseDocumentMediaUploadResponse(
  response: Response,
): Promise<DocumentMediaUploadResponse> {
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    const message = isErrorResponse(body)
      ? body.error
      : `Document upload failed with status ${response.status}.`;

    throw new Error(message);
  }

  if (!isDocumentMediaUploadResponse(body)) {
    throw new Error("Document upload returned an invalid response.");
  }

  return body;
}

export async function parseDocumentMediaListResponse(
  response: Response,
): Promise<DocumentMediaListResponse> {
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    const message = isErrorResponse(body)
      ? body.error
      : `Document asset list failed with status ${response.status}.`;

    throw new Error(message);
  }

  if (!isDocumentMediaAssetListResponse(body)) {
    throw new Error("Document asset list returned an invalid response.");
  }

  return body;
}

export function mediaAssetOptionFromAsset(asset: ImageMediaAsset): ImageMediaAssetOption {
  return {
    ...(asset.height === undefined ? {} : { height: asset.height }),
    href: asset.deliveryHref,
    id: asset.id,
    label: asset.label,
    ...(asset.width === undefined ? {} : { width: asset.width }),
  };
}

export function documentMediaAssetOptionFromAsset(
  asset: DocumentMediaAsset,
): DocumentMediaAssetOption {
  return {
    access: asset.access,
    byteSize: asset.byteSize,
    contentType: asset.contentType,
    downloadHref: documentMediaDownloadHref(asset.deliveryHref),
    filename: asset.filename,
    href: asset.deliveryHref,
    id: asset.id,
    label: asset.label,
  };
}

async function uploadImageMediaFile(
  file: File,
  uploadPath: string,
  options: UploadImageMediaFileOptions,
): Promise<UploadedImageMedia> {
  const fetcher = options.fetcher ?? fetch;
  const formData = new FormData();

  formData.set("file", file);

  const response = await fetcher(uploadPath, {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
    body: formData,
  });
  const upload = await parseImageMediaUploadResponse(response);
  const readDimensions = options.readDimensions ?? readImageDimensions;
  let dimensions: ImageDimensions | undefined;

  try {
    dimensions = await readDimensions(file);
  } catch {
    dimensions = undefined;
  }

  return dimensions === undefined ? upload : { ...upload, dimensions };
}

function isImageMediaUploadResponse(value: unknown): value is ImageMediaUploadResponse {
  return (
    isRecord(value) &&
    typeof value.contentType === "string" &&
    typeof value.href === "string" &&
    typeof value.key === "string" &&
    typeof value.size === "number" &&
    (!("assetId" in value) || typeof value.assetId === "string") &&
    (!("asset" in value) || isImageMediaAsset(value.asset))
  );
}

function isImageMediaAssetListResponse(value: unknown): value is ImageMediaListResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.assets) &&
    value.assets.every((asset) => isImageMediaAsset(asset))
  );
}

function isDocumentMediaUploadResponse(value: unknown): value is DocumentMediaUploadResponse {
  if (
    !isRecord(value) ||
    value.contentType !== MEDIA_PDF_CONTENT_TYPE ||
    typeof value.href !== "string" ||
    typeof value.key !== "string" ||
    typeof value.size !== "number" ||
    ("assetId" in value && typeof value.assetId !== "string")
  ) {
    return false;
  }

  const asset = value.asset;

  if (asset !== undefined && !isDocumentMediaAsset(asset)) {
    return false;
  }

  return (
    asset === undefined ||
    (asset.contentType === value.contentType &&
      asset.deliveryHref === value.href &&
      asset.storageKey === value.key &&
      asset.byteSize === value.size &&
      (value.assetId === undefined || asset.id === value.assetId))
  );
}

function isDocumentMediaAssetListResponse(value: unknown): value is DocumentMediaListResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.assets) &&
    value.assets.every((asset) => isDocumentMediaAsset(asset))
  );
}

function isImageMediaAsset(value: unknown): value is ImageMediaAsset {
  return (
    isRecord(value) &&
    typeof value.byteSize === "number" &&
    typeof value.contentType === "string" &&
    typeof value.deliveryHref === "string" &&
    (!("filename" in value) || typeof value.filename === "string") &&
    (!("height" in value) || typeof value.height === "number") &&
    typeof value.id === "string" &&
    value.kind === "image" &&
    typeof value.label === "string" &&
    typeof value.provider === "string" &&
    value.status === "ready" &&
    typeof value.storageKey === "string" &&
    (!("width" in value) || typeof value.width === "number")
  );
}

function isErrorResponse(value: unknown): value is { error: string } {
  return isRecord(value) && typeof value.error === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
