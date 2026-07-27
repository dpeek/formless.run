import {
  appDocumentMediaKeyPrefixForOwner,
  documentMediaAssetIsCompatible,
  documentMediaAssetMatchesOwner,
  documentMediaDeliveryFactsForAssetId,
  documentMediaResponseFacts,
  documentMediaStorageKeyForAssetId,
  imageMediaContentTypeForKey,
  imageMediaExtensionForContentType,
  isDocumentMediaAsset,
  isRestorableImageMediaKey,
  isValidDocumentMediaAssetId,
  isValidImageMediaAssetId,
  isValidMediaStorageKey,
  mediaAssetFromObjectMetadata,
  mediaObjectMetadataForAsset,
  normalizeMediaContentType,
  safeDocumentMediaFilename,
  validatePdfDocumentMediaFile,
} from "./index.ts";
import {
  CORE_IMAGE_KEY_PREFIX,
  CORE_IMAGE_UPLOAD_PATH,
  CORE_MEDIA_ROUTE_PREFIX,
  MEDIA_DOCUMENT_UPLOAD_MAX_BYTES,
  MEDIA_IMAGE_UPLOAD_MAX_BYTES,
  MEDIA_OBJECT_CACHE_CONTROL,
  MEDIA_PRIVATE_DOCUMENT_CACHE_CONTROL,
} from "./types.ts";
import type {
  DocumentMediaAsset,
  DocumentMediaCompatibility,
  DocumentMediaFileValidationError,
  ImageMediaAsset,
  MediaDeliveryFacts,
  MediaDocumentFile,
  MediaImageFile,
  MediaObjectMetadata,
  MediaObjectStore,
  MediaStoredObjectListing,
  MediaWriteResult,
} from "./types.ts";

export {
  APP_DOCUMENT_MEDIA_KEY_PREFIX,
  CORE_IMAGE_KEY_PREFIX,
  CORE_IMAGE_UPLOAD_PATH,
  CORE_MEDIA_ROUTE_PREFIX,
  MEDIA_DOCUMENT_UPLOAD_MAX_BYTES,
  MEDIA_IMAGE_UPLOAD_MAX_BYTES,
  MEDIA_OBJECT_CACHE_CONTROL,
  MEDIA_PDF_CONTENT_TYPE,
  MEDIA_PRIVATE_DOCUMENT_CACHE_CONTROL,
} from "./types.ts";
export type {
  DocumentMediaAsset,
  DocumentMediaCompatibility,
  ImageMediaAsset,
  MediaAsset,
  MediaDeliveryFacts,
  MediaDocumentFile,
  MediaImageFile,
  MediaObjectStore,
  MediaWriteResponse,
  MediaWriteResult,
} from "./types.ts";

export type MediaWriteAuthorizationResult =
  | { authorized: true }
  | {
      authorized: false;
      error: string;
      headers: HeadersInit;
      status: number;
    };

export type DocumentMediaRequestOperation = "delivery" | "list" | "restore" | "upload";

export type DocumentMediaAuthorizationInput = {
  asset?: DocumentMediaAsset;
  operation: DocumentMediaRequestOperation;
  request: Request;
};

export type DocumentMediaStorageIdentity = {
  documentsPath: `/api/${string}/media/documents`;
  ownerAppInstallId: string;
};

export type DocumentMediaRoute = {
  assetId?: string;
  media: DocumentMediaStorageIdentity;
};

export type DocumentMediaDelivery = MediaDeliveryFacts & {
  asset: DocumentMediaAsset;
};

export type HandleDocumentMediaRequestOptions = {
  authorizeRequest: (
    input: DocumentMediaAuthorizationInput,
  ) => MediaWriteAuthorizationResult | Promise<MediaWriteAuthorizationResult>;
  compatibility?: DocumentMediaCompatibility;
  maxBytes?: number;
  media: DocumentMediaStorageIdentity;
  pathname?: string;
  provider?: string;
  randomId?: () => string;
  resolveRestoreAsset?: (input: {
    assetId: string;
    request: Request;
  }) => DocumentMediaAsset | Promise<DocumentMediaAsset | undefined> | undefined;
  store: MediaObjectStore;
};

export type ImageMediaStorageIdentity = {
  imageKeyPrefix: string;
  imageUploadPath: `/api/${string}/media/images`;
  routePrefix: `/api/${string}/media`;
};

export type ImageMediaRoute = {
  media: ImageMediaStorageIdentity;
  path: string;
};

export type HandleMediaRequestOptions = {
  authorizeWrite: (
    request: Request,
  ) => MediaWriteAuthorizationResult | Promise<MediaWriteAuthorizationResult>;
  pathname?: string;
  provider?: string;
  randomId?: () => string;
  store: MediaObjectStore;
};

export const CORE_IMAGE_MEDIA_STORAGE_IDENTITY = {
  imageKeyPrefix: CORE_IMAGE_KEY_PREFIX,
  imageUploadPath: CORE_IMAGE_UPLOAD_PATH,
  routePrefix: "/api/formless/media",
} satisfies ImageMediaStorageIdentity;

type MultipartPart = {
  body: Uint8Array;
  contentType: string;
  filename: string | undefined;
  name: string | undefined;
};

export async function handleMediaRequest(
  request: Request,
  options: HandleMediaRequestOptions,
): Promise<Response | undefined> {
  const route = imageMediaRouteFromPathname(options.pathname ?? new URL(request.url).pathname);

  if (!route) {
    return undefined;
  }

  if (request.method === "POST" && route.path === "/media/images") {
    return uploadImage(request, route.media, options);
  }

  if (request.method === "GET" && route.path === "/media/images") {
    return listImages(route.media, options);
  }

  if (request.method === "PUT") {
    return restoreImage(request, route, options);
  }

  if (request.method === "GET" || request.method === "HEAD") {
    const response = await serveImage(route, options, {
      includeBody: request.method === "GET",
    });

    return responseWithoutBodyForHead(request, response);
  }

  return jsonResponse({ error: "Not found." }, 404);
}

export async function handleDocumentMediaRequest(
  request: Request,
  options: HandleDocumentMediaRequestOptions,
): Promise<Response | undefined> {
  const route = documentMediaRouteFromPathname(
    options.pathname ?? new URL(request.url).pathname,
    options.media,
  );

  if (!route) {
    return undefined;
  }

  let response: Response;

  if (!route.assetId && request.method === "GET") {
    response = await listDocuments(request, options);
  } else if (!route.assetId && request.method === "POST") {
    response = await uploadDocument(request, options);
  } else if (route.assetId && request.method === "PUT") {
    response = await restoreDocument(request, route.assetId, options);
  } else if (route.assetId && (request.method === "GET" || request.method === "HEAD")) {
    response = await serveDocument(request, route.assetId, options);
  } else {
    response = jsonResponse({ error: "Not found." }, 404);
  }

  return responseWithoutBodyForHead(request, response);
}

export function imageMediaRouteFromPathname(pathname: string): ImageMediaRoute | undefined {
  if (pathname.startsWith(CORE_MEDIA_ROUTE_PREFIX)) {
    const key = mediaKeyFromPathname(pathname, CORE_MEDIA_ROUTE_PREFIX);

    return {
      media: CORE_IMAGE_MEDIA_STORAGE_IDENTITY,
      path: key ? `/media/${key}` : "/media",
    };
  }

  return undefined;
}

export function documentMediaRouteFromPathname(
  pathname: string,
  media: DocumentMediaStorageIdentity,
): DocumentMediaRoute | undefined {
  if (pathname === media.documentsPath) {
    return { media };
  }

  const assetPrefix = `${media.documentsPath}/`;

  if (!pathname.startsWith(assetPrefix)) {
    return undefined;
  }

  const assetId = pathname.slice(assetPrefix.length);

  return isValidDocumentMediaAssetId(assetId) ? { assetId, media } : undefined;
}

export async function listImageMediaAssets({
  hrefForKey,
  keyPrefix,
  limit = 50,
  provider,
  store,
}: {
  hrefForKey?: (key: string) => string;
  keyPrefix: string;
  limit?: number;
  provider?: string;
  store: MediaObjectStore;
}): Promise<ImageMediaAsset[]> {
  if (!store.listObjects) {
    return [];
  }

  const listing = await store.listObjects({ limit, prefix: keyPrefix });

  return listing.objects
    .map((object) => ({
      asset:
        mediaAssetFromObjectMetadata(object.customMetadata) ??
        mediaAssetFromListingObject(object, { hrefForKey, keyPrefix, provider }),
      key: object.key,
    }))
    .filter(
      (entry): entry is { asset: ImageMediaAsset; key: string } =>
        entry.asset !== undefined &&
        entry.asset.kind === "image" &&
        entry.asset.storageKey === entry.key &&
        entry.asset.storageKey.startsWith(keyPrefix),
    )
    .map((entry) => entry.asset)
    .sort(
      (left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id),
    );
}

export async function listDocumentMediaAssets({
  compatibility,
  hrefForAssetId,
  limit = 50,
  store,
}: {
  compatibility: DocumentMediaCompatibility;
  hrefForAssetId: (assetId: string) => string;
  limit?: number;
  store: MediaObjectStore;
}): Promise<DocumentMediaAsset[]> {
  const keyPrefix = appDocumentMediaKeyPrefixForOwner(compatibility.ownerAppInstallId);

  if (!keyPrefix || !store.listObjects) {
    return [];
  }

  const listing = await store.listObjects({ limit, prefix: keyPrefix });

  return listing.objects
    .map((object) => ({
      asset: mediaAssetFromObjectMetadata(object.customMetadata),
      key: object.key,
    }))
    .filter(
      (entry): entry is { asset: DocumentMediaAsset; key: string } =>
        entry.asset !== undefined &&
        entry.asset.kind === "document" &&
        entry.asset.storageKey === entry.key &&
        entry.asset.deliveryHref === hrefForAssetId(entry.asset.id) &&
        documentMediaAssetIsCompatible(entry.asset, compatibility),
    )
    .map((entry) => entry.asset)
    .sort(
      (left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id),
    );
}

export async function uploadImageMedia({
  file,
  hrefForKey,
  keyPrefix,
  maxBytes = MEDIA_IMAGE_UPLOAD_MAX_BYTES,
  provider,
  randomId = () => crypto.randomUUID(),
  store,
}: {
  file: MediaImageFile;
  hrefForKey: (key: string) => string;
  keyPrefix: string;
  maxBytes?: number;
  provider: string;
  randomId?: () => string;
  store: MediaObjectStore;
}): Promise<MediaWriteResult> {
  const contentType = normalizeMediaContentType(file.contentType);
  const extension = imageMediaExtensionForContentType(contentType);

  if (!extension) {
    return { error: "Unsupported image type.", ok: false, status: 415 };
  }

  if (file.size > maxBytes) {
    return { error: "Image file is larger than the 5 MB limit.", ok: false, status: 413 };
  }

  const assetId = `${randomId()}.${extension}`;
  const key = `${keyPrefix}${assetId}`;
  const href = hrefForKey(key);
  const asset: ImageMediaAsset = {
    byteSize: file.size,
    contentType,
    deliveryHref: href,
    ...mediaAssetFilenameFields(file.filename),
    id: assetId,
    kind: "image",
    provider,
    status: "ready",
    storageKey: key,
  };

  await writeMediaObject(store, key, file.bytes, contentType, {
    customMetadata: mediaObjectMetadataForAsset(asset),
  });

  return {
    ok: true,
    upload: {
      asset,
      assetId: asset.id,
      contentType,
      href,
      key,
      size: file.size,
    },
  };
}

export async function uploadDocumentMedia({
  compatibility,
  file,
  hrefForAssetId,
  maxBytes = MEDIA_DOCUMENT_UPLOAD_MAX_BYTES,
  provider,
  randomId = () => crypto.randomUUID(),
  store,
}: {
  compatibility: DocumentMediaCompatibility;
  file: MediaDocumentFile;
  hrefForAssetId: (assetId: string) => string;
  maxBytes?: number;
  provider: string;
  randomId?: () => string;
  store: MediaObjectStore;
}): Promise<MediaWriteResult> {
  const effectiveMaxBytes = effectiveDocumentMediaMaxBytes(compatibility.maxBytes, maxBytes);
  const validation = validatePdfDocumentMediaFile(file, {
    acceptedMimeTypes: compatibility.acceptedMimeTypes,
    maxBytes: effectiveMaxBytes,
  });

  if (!validation.ok) {
    return documentMediaValidationError(validation.error, effectiveMaxBytes);
  }

  const assetId = `${randomId()}.pdf`;
  const key = documentMediaStorageKeyForAssetId(assetId, {
    ownerAppInstallId: compatibility.ownerAppInstallId,
  });

  if (!key) {
    return { error: "Document media storage identity is invalid.", ok: false, status: 400 };
  }

  const filename = safeDocumentMediaFilename(file.filename);
  const asset: DocumentMediaAsset = {
    access: compatibility.access,
    byteSize: file.size,
    contentType: validation.contentType,
    deliveryHref: hrefForAssetId(assetId),
    filename,
    id: assetId,
    kind: "document",
    label: filename,
    ownerAppInstallId: compatibility.ownerAppInstallId,
    provider,
    status: "ready",
    storageKey: key,
  };

  if (!isDocumentMediaAsset(asset)) {
    return { error: "Document media metadata is invalid.", ok: false, status: 400 };
  }

  await writeMediaObject(store, key, file.bytes, asset.contentType, {
    cacheControl:
      asset.access === "public" ? MEDIA_OBJECT_CACHE_CONTROL : MEDIA_PRIVATE_DOCUMENT_CACHE_CONTROL,
    customMetadata: mediaObjectMetadataForAsset(asset),
  });

  return {
    ok: true,
    upload: {
      asset,
      assetId,
      contentType: asset.contentType,
      href: asset.deliveryHref,
      key,
      size: file.size,
    },
  };
}

export async function restoreImageMedia({
  asset,
  bytes,
  contentType,
  hrefForKey,
  key,
  keyPrefix,
  maxBytes = MEDIA_IMAGE_UPLOAD_MAX_BYTES,
  store,
}: {
  asset?: ImageMediaAsset;
  bytes: Uint8Array;
  contentType: string;
  hrefForKey: (key: string) => string;
  key: string;
  keyPrefix: string;
  maxBytes?: number;
  store: MediaObjectStore;
}): Promise<MediaWriteResult> {
  if (!isRestorableImageMediaKey(key, { keyPrefix })) {
    return { error: "Unsupported media restore key.", ok: false, status: 400 };
  }

  const expectedContentType = imageMediaContentTypeForKey(key);

  if (!expectedContentType) {
    return { error: "Unsupported media restore key.", ok: false, status: 400 };
  }

  const normalizedContentType = normalizeMediaContentType(contentType);

  if (normalizedContentType && normalizedContentType !== expectedContentType) {
    return {
      error: "Media restore content type must match the media key.",
      ok: false,
      status: 415,
    };
  }

  if (bytes.byteLength === 0) {
    return { error: "Media restore body must not be empty.", ok: false, status: 400 };
  }

  if (bytes.byteLength > maxBytes) {
    return { error: "Image file is larger than the 5 MB limit.", ok: false, status: 413 };
  }

  const href = hrefForKey(key);
  const metadataAsset =
    asset &&
    asset.kind === "image" &&
    asset.storageKey === key &&
    normalizeMediaContentType(asset.contentType) === expectedContentType &&
    asset.byteSize === bytes.byteLength &&
    asset.deliveryHref === href &&
    asset.status === "ready"
      ? asset
      : undefined;

  await writeMediaObject(
    store,
    key,
    bytes,
    expectedContentType,
    metadataAsset ? { customMetadata: mediaObjectMetadataForAsset(metadataAsset) } : {},
  );

  return {
    ok: true,
    upload: {
      contentType: expectedContentType,
      href,
      key,
      size: bytes.byteLength,
    },
  };
}

export async function restoreDocumentMedia({
  asset,
  bytes,
  compatibility,
  contentType,
  hrefForAssetId,
  maxBytes = MEDIA_DOCUMENT_UPLOAD_MAX_BYTES,
  store,
}: {
  asset: DocumentMediaAsset;
  bytes: Uint8Array;
  compatibility: DocumentMediaCompatibility;
  contentType: string;
  hrefForAssetId: (assetId: string) => string;
  maxBytes?: number;
  store: MediaObjectStore;
}): Promise<MediaWriteResult> {
  const effectiveMaxBytes = effectiveDocumentMediaMaxBytes(compatibility.maxBytes, maxBytes);
  const expectedKey = documentMediaStorageKeyForAssetId(asset.id, {
    ownerAppInstallId: compatibility.ownerAppInstallId,
  });
  const expectedHref = hrefForAssetId(asset.id);

  if (
    !expectedKey ||
    !isDocumentMediaAsset(asset) ||
    !documentMediaAssetIsCompatible(asset, compatibility) ||
    asset.storageKey !== expectedKey ||
    asset.deliveryHref !== expectedHref
  ) {
    return { error: "Document restore metadata is incompatible.", ok: false, status: 400 };
  }

  const validation = validatePdfDocumentMediaFile(
    {
      bytes,
      contentType,
      filename: asset.filename,
      size: bytes.byteLength,
    },
    {
      acceptedMimeTypes: compatibility.acceptedMimeTypes,
      maxBytes: effectiveMaxBytes,
    },
  );

  if (!validation.ok) {
    return documentMediaValidationError(validation.error, effectiveMaxBytes, "restore");
  }

  if (asset.byteSize !== bytes.byteLength || asset.contentType !== validation.contentType) {
    return {
      error: "Document restore payload does not match its metadata.",
      ok: false,
      status: 400,
    };
  }

  await writeMediaObject(store, expectedKey, bytes, validation.contentType, {
    cacheControl:
      asset.access === "public" ? MEDIA_OBJECT_CACHE_CONTROL : MEDIA_PRIVATE_DOCUMENT_CACHE_CONTROL,
    customMetadata: mediaObjectMetadataForAsset(asset),
  });

  return {
    ok: true,
    upload: {
      asset,
      assetId: asset.id,
      contentType: validation.contentType,
      href: expectedHref,
      key: expectedKey,
      size: bytes.byteLength,
    },
  };
}

export async function deliveryFactsForMediaObject({
  includeBody = true,
  key,
  store,
}: {
  includeBody?: boolean;
  key: string;
  store: MediaObjectStore;
}): Promise<MediaDeliveryFacts | undefined> {
  const object = await store.getObject(key);

  if (!object) {
    return undefined;
  }

  const headers = new Headers({
    "Cache-Control": MEDIA_OBJECT_CACHE_CONTROL,
  });

  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", MEDIA_OBJECT_CACHE_CONTROL);
  headers.set("ETag", object.httpEtag);

  return {
    body: includeBody ? object.body : null,
    headers,
  };
}

export async function deliveryFactsForDocumentMediaObject({
  assetId,
  download = false,
  hrefForAssetId,
  includeBody = true,
  ownerAppInstallId,
  store,
}: {
  assetId: string;
  download?: boolean;
  hrefForAssetId: (assetId: string) => string;
  includeBody?: boolean;
  ownerAppInstallId: string;
  store: MediaObjectStore;
}): Promise<DocumentMediaDelivery | undefined> {
  const routeFacts = documentMediaDeliveryFactsForAssetId(assetId, {
    hrefForAssetId,
    ownerAppInstallId,
  });

  if (!routeFacts) {
    return undefined;
  }

  const object = await store.getObject(routeFacts.storageKey);
  const asset = mediaAssetFromObjectMetadata(object?.customMetadata);

  if (
    !object ||
    !asset ||
    asset.kind !== "document" ||
    !documentMediaAssetMatchesOwner(asset, ownerAppInstallId) ||
    asset.id !== routeFacts.assetId ||
    asset.storageKey !== routeFacts.storageKey ||
    asset.deliveryHref !== routeFacts.href
  ) {
    return undefined;
  }

  const responseFacts = documentMediaResponseFacts(asset, { download });
  const headers = new Headers();

  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", responseFacts.cacheControl);
  headers.set("Content-Disposition", responseFacts.contentDisposition);
  headers.set("Content-Type", responseFacts.contentType);
  headers.set("ETag", object.httpEtag);
  headers.set("X-Content-Type-Options", responseFacts.xContentTypeOptions);

  return {
    asset,
    body: includeBody ? object.body : null,
    headers,
  };
}

export function mediaObjectStoreFromR2Bucket(bucket: R2Bucket): MediaObjectStore {
  return {
    async getObject(key) {
      const object = await bucket.get(key);

      if (!object) {
        return undefined;
      }

      return {
        body: object.body,
        customMetadata: object.customMetadata,
        httpEtag: object.httpEtag,
        writeHttpMetadata(headers) {
          object.writeHttpMetadata(headers);
        },
      };
    },
    async listObjects(options) {
      const listing = await bucket.list({
        limit: options.limit,
        prefix: options.prefix,
      });
      const objects = await Promise.all(
        listing.objects.map(async (object) => {
          const metadataObject =
            object.customMetadata === undefined || object.httpMetadata === undefined
              ? await bucket.head(object.key)
              : object;

          return {
            contentType: metadataObject?.httpMetadata?.contentType,
            customMetadata: metadataObject?.customMetadata,
            key: object.key,
            size: object.size,
          };
        }),
      );

      return {
        objects,
      };
    },
    async putObject(write) {
      await bucket.put(write.key, write.bytes, {
        httpMetadata: {
          cacheControl: write.cacheControl,
          contentType: write.contentType,
        },
        ...(write.customMetadata ? { customMetadata: write.customMetadata } : {}),
      });
    },
  };
}

async function listDocuments(
  request: Request,
  options: HandleDocumentMediaRequestOptions,
): Promise<Response> {
  const authorization = await options.authorizeRequest({
    operation: "list",
    request,
  });

  if (!authorization.authorized) {
    return authorizationErrorResponse(authorization);
  }

  const compatibility = documentMediaCompatibilityForRoute(options);

  if (!compatibility) {
    return jsonResponse({ error: "Document media compatibility is required." }, 400);
  }

  const assets = await listDocumentMediaAssets({
    compatibility,
    hrefForAssetId: (assetId) => documentMediaHrefForAssetId(assetId, options.media),
    store: options.store,
  });

  return jsonResponse({ assets }, 200, {
    "Cache-Control": "no-store",
  });
}

async function uploadDocument(
  request: Request,
  options: HandleDocumentMediaRequestOptions,
): Promise<Response> {
  const authorization = await options.authorizeRequest({
    operation: "upload",
    request,
  });

  if (!authorization.authorized) {
    return authorizationErrorResponse(authorization);
  }

  const compatibility = documentMediaCompatibilityForRoute(options);

  if (!compatibility) {
    return jsonResponse({ error: "Document media compatibility is required." }, 400);
  }

  const fileResult = await readMultipartDocumentFile(request);

  if (!fileResult.ok) {
    return jsonResponse({ error: fileResult.error }, 400);
  }

  const upload = await uploadDocumentMedia({
    compatibility,
    file: fileResult.file,
    hrefForAssetId: (assetId) => documentMediaHrefForAssetId(assetId, options.media),
    ...(options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes }),
    provider: options.provider ?? "r2",
    ...(options.randomId ? { randomId: options.randomId } : {}),
    store: options.store,
  });

  return upload.ok
    ? jsonResponse(upload.upload)
    : jsonResponse({ error: upload.error }, upload.status);
}

async function restoreDocument(
  request: Request,
  assetId: string,
  options: HandleDocumentMediaRequestOptions,
): Promise<Response> {
  const authorization = await options.authorizeRequest({
    operation: "restore",
    request,
  });

  if (!authorization.authorized) {
    return authorizationErrorResponse(authorization);
  }

  const compatibility = documentMediaCompatibilityForRoute(options);
  const asset = await options.resolveRestoreAsset?.({ assetId, request });

  if (!compatibility || !asset || asset.id !== assetId) {
    return jsonResponse({ error: "Document restore metadata is required." }, 400);
  }

  const restore = await restoreDocumentMedia({
    asset,
    bytes: new Uint8Array(await request.arrayBuffer()),
    compatibility,
    contentType: request.headers.get("Content-Type") ?? "",
    hrefForAssetId: (restoredAssetId) =>
      documentMediaHrefForAssetId(restoredAssetId, options.media),
    ...(options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes }),
    store: options.store,
  });

  return restore.ok
    ? jsonResponse(restore.upload)
    : jsonResponse({ error: restore.error }, restore.status);
}

async function serveDocument(
  request: Request,
  assetId: string,
  options: HandleDocumentMediaRequestOptions,
): Promise<Response> {
  const delivery = await deliveryFactsForDocumentMediaObject({
    assetId,
    download: new URL(request.url).searchParams.get("download") === "1",
    hrefForAssetId: (deliveredAssetId) =>
      documentMediaHrefForAssetId(deliveredAssetId, options.media),
    includeBody: request.method === "GET",
    ownerAppInstallId: options.media.ownerAppInstallId,
    store: options.store,
  });

  if (!delivery) {
    return jsonResponse({ error: "Document media object not found." }, 404);
  }

  const authorization = await options.authorizeRequest({
    asset: delivery.asset,
    operation: "delivery",
    request,
  });

  if (!authorization.authorized) {
    return authorizationErrorResponse(authorization);
  }

  return new Response(delivery.body, { headers: delivery.headers });
}

async function uploadImage(
  request: Request,
  media: ImageMediaStorageIdentity,
  options: HandleMediaRequestOptions,
) {
  const authorization = await options.authorizeWrite(request);

  if (!authorization.authorized) {
    return jsonResponse(
      { error: authorization.error },
      authorization.status,
      authorization.headers,
    );
  }

  const fileResult = await readMultipartFile(request);

  if (!fileResult.ok) {
    return jsonResponse({ error: fileResult.error }, 400);
  }

  const upload = await uploadImageMedia({
    file: fileResult.file,
    hrefForKey: (key) => mediaHrefForStorageKey(key, media),
    keyPrefix: mediaImageKeyPrefix(media),
    provider: options.provider ?? "r2",
    ...(options.randomId ? { randomId: options.randomId } : {}),
    store: options.store,
  });

  if (!upload.ok) {
    return jsonResponse({ error: upload.error }, upload.status);
  }

  return jsonResponse(upload.upload);
}

async function listImages(media: ImageMediaStorageIdentity, options: HandleMediaRequestOptions) {
  const assets = await listImageMediaAssets({
    hrefForKey: (key) => mediaHrefForStorageKey(key, media),
    keyPrefix: mediaImageKeyPrefix(media),
    provider: options.provider ?? "r2",
    store: options.store,
  });

  return jsonResponse({ assets }, 200, {
    "Cache-Control": "no-store",
  });
}

async function restoreImage(
  request: Request,
  route: ImageMediaRoute,
  options: HandleMediaRequestOptions,
) {
  const authorization = await options.authorizeWrite(request);

  if (!authorization.authorized) {
    return jsonResponse(
      { error: authorization.error },
      authorization.status,
      authorization.headers,
    );
  }

  const key = mediaKeyFromRoutePath(route);

  if (!key) {
    return jsonResponse({ error: "Unsupported media restore key." }, 400);
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  const restore = await restoreImageMedia({
    bytes,
    contentType: request.headers.get("Content-Type") ?? "",
    hrefForKey: (storageKey) => mediaHrefForStorageKey(storageKey, route.media),
    key,
    keyPrefix: mediaImageKeyPrefix(route.media),
    store: options.store,
  });

  if (!restore.ok) {
    return jsonResponse({ error: restore.error }, restore.status);
  }

  return jsonResponse(restore.upload);
}

async function serveImage(
  route: ImageMediaRoute,
  options: HandleMediaRequestOptions,
  deliveryOptions: { includeBody?: boolean } = {},
) {
  const key = mediaKeyFromRoutePath(route);

  if (!key) {
    return jsonResponse({ error: "Not found." }, 404);
  }

  const delivery = await deliveryFactsForMediaObject({
    includeBody: deliveryOptions.includeBody ?? true,
    key,
    store: options.store,
  });

  if (!delivery) {
    return jsonResponse({ error: "Media object not found." }, 404);
  }

  return new Response(delivery.body, { headers: delivery.headers });
}

function mediaAssetFromListingObject(
  object: MediaStoredObjectListing,
  options: {
    hrefForKey?: (key: string) => string;
    keyPrefix: string;
    provider?: string;
  },
): ImageMediaAsset | undefined {
  if (!options.hrefForKey || !options.provider) {
    return undefined;
  }

  if (!isRestorableImageMediaKey(object.key, { keyPrefix: options.keyPrefix })) {
    return undefined;
  }

  const assetId = object.key.slice(options.keyPrefix.length);
  const contentType =
    normalizeMediaContentType(object.contentType ?? "") || imageMediaContentTypeForKey(object.key);

  if (
    !isValidImageMediaAssetId(assetId) ||
    !contentType ||
    imageMediaExtensionForContentType(contentType) === undefined ||
    object.size === undefined ||
    object.size < 0
  ) {
    return undefined;
  }

  return {
    byteSize: object.size,
    contentType,
    deliveryHref: options.hrefForKey(object.key),
    id: assetId,
    kind: "image",
    label: assetId,
    provider: options.provider,
    status: "ready",
    storageKey: object.key,
  };
}

function writeMediaObject(
  store: MediaObjectStore,
  key: string,
  bytes: Uint8Array,
  contentType: string,
  options: {
    cacheControl?: string;
    customMetadata?: MediaObjectMetadata;
  } = {},
) {
  return store.putObject({
    bytes,
    cacheControl: options.cacheControl ?? MEDIA_OBJECT_CACHE_CONTROL,
    contentType,
    ...(options.customMetadata ? { customMetadata: options.customMetadata } : {}),
    key,
  });
}

function effectiveDocumentMediaMaxBytes(policyMaxBytes: number, adapterMaxBytes: number): number {
  if (
    !Number.isSafeInteger(policyMaxBytes) ||
    policyMaxBytes <= 0 ||
    !Number.isSafeInteger(adapterMaxBytes) ||
    adapterMaxBytes <= 0
  ) {
    return 0;
  }

  return Math.min(policyMaxBytes, adapterMaxBytes, MEDIA_DOCUMENT_UPLOAD_MAX_BYTES);
}

function documentMediaValidationError(
  error: DocumentMediaFileValidationError,
  maxBytes: number,
  operation: "restore" | "upload" = "upload",
): MediaWriteResult {
  const subject = operation === "restore" ? "Document restore payload" : "Document file";

  switch (error) {
    case "empty":
      return { error: `${subject} must not be empty.`, ok: false, status: 400 };
    case "invalid-pdf":
      return { error: `${subject} is not a valid PDF.`, ok: false, status: 415 };
    case "invalid-size":
      return { error: `${subject} size is invalid.`, ok: false, status: 400 };
    case "too-large":
      return {
        error: `${subject} is larger than the ${maxBytes} byte limit.`,
        ok: false,
        status: 413,
      };
    case "unsupported-content-type":
      return { error: "Unsupported document type.", ok: false, status: 415 };
  }
}

function documentMediaCompatibilityForRoute(
  options: HandleDocumentMediaRequestOptions,
): DocumentMediaCompatibility | undefined {
  return options.compatibility?.ownerAppInstallId === options.media.ownerAppInstallId
    ? options.compatibility
    : undefined;
}

function documentMediaHrefForAssetId(assetId: string, media: DocumentMediaStorageIdentity): string {
  return `${media.documentsPath}/${assetId}`;
}

function authorizationErrorResponse(
  authorization: Exclude<MediaWriteAuthorizationResult, { authorized: true }>,
): Response {
  return jsonResponse({ error: authorization.error }, authorization.status, authorization.headers);
}

function mediaAssetFilenameFields(filename: string | undefined): {
  filename?: string;
  label: string;
} {
  const normalized = normalizeMediaFilename(filename);

  return normalized ? { filename: normalized, label: normalized } : { label: "Uploaded image" };
}

function normalizeMediaFilename(filename: string | undefined): string | undefined {
  const cleaned = filename
    ?.split(/[\\/]/)
    .pop()
    ?.split("")
    .filter(isMediaFilenameCharacter)
    .join("")
    .trim();

  return cleaned === undefined || cleaned === "" ? undefined : cleaned.slice(0, 200);
}

function isMediaFilenameCharacter(value: string): boolean {
  const code = value.charCodeAt(0);

  return (code >= 0x20 && code !== 0x7f) || code > 0x7f;
}

function mediaKeyFromRoutePath(route: ImageMediaRoute): string | undefined {
  if (!route.path.startsWith("/media/")) {
    return undefined;
  }

  const key = route.path.slice("/media/".length);

  if (!isValidMediaStorageKey(key) || !key.startsWith(mediaImageKeyPrefix(route.media))) {
    return undefined;
  }

  return key;
}

function mediaKeyFromPathname(pathname: string, routePrefix: string): string | undefined {
  const key = pathname.startsWith(routePrefix) ? pathname.slice(routePrefix.length) : "";

  return isValidMediaStorageKey(key) ? key : undefined;
}

function mediaImageKeyPrefix(media: ImageMediaStorageIdentity): string {
  return media.imageKeyPrefix.endsWith("/") ? media.imageKeyPrefix : `${media.imageKeyPrefix}/`;
}

function mediaHrefForStorageKey(key: string, media: ImageMediaStorageIdentity): string {
  return `${media.routePrefix}/${key}`;
}

async function readMultipartFile(
  request: Request,
): Promise<{ file: MediaImageFile; ok: true } | { error: string; ok: false }> {
  const boundary = multipartBoundary(request.headers.get("Content-Type"));

  if (!boundary) {
    return { error: "Expected multipart form data.", ok: false };
  }

  const parts = parseMultipartParts(new Uint8Array(await request.arrayBuffer()), boundary);
  const fileParts = parts.filter((part) => part.name === "file" && part.filename !== undefined);

  if (fileParts.length === 0) {
    return { error: 'Expected multipart file field "file".', ok: false };
  }

  if (fileParts.length > 1) {
    return { error: "Only one image file can be uploaded at a time.", ok: false };
  }

  const file = fileParts[0];

  return {
    file: {
      bytes: file.body,
      contentType: file.contentType,
      filename: file.filename,
      size: file.body.byteLength,
    },
    ok: true,
  };
}

async function readMultipartDocumentFile(
  request: Request,
): Promise<{ file: MediaDocumentFile; ok: true } | { error: string; ok: false }> {
  const boundary = multipartBoundary(request.headers.get("Content-Type"));

  if (!boundary) {
    return { error: "Expected multipart form data.", ok: false };
  }

  const parts = parseMultipartParts(new Uint8Array(await request.arrayBuffer()), boundary);
  const fileParts = parts.filter((part) => part.name === "file" && part.filename !== undefined);

  if (fileParts.length === 0) {
    return { error: 'Expected multipart file field "file".', ok: false };
  }

  if (fileParts.length > 1) {
    return { error: "Only one document file can be uploaded at a time.", ok: false };
  }

  const file = fileParts[0];

  return {
    file: {
      bytes: file.body,
      contentType: file.contentType,
      filename: file.filename ?? "",
      size: file.body.byteLength,
    },
    ok: true,
  };
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, {
    headers,
    status,
  });
}

function responseWithoutBodyForHead(request: Request, response: Response): Response {
  if (request.method !== "HEAD") {
    return response;
  }

  return new Response(null, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function multipartBoundary(contentType: string | null) {
  const match = /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType ?? "");

  return match?.[1] ?? match?.[2]?.trim();
}

function parseMultipartParts(body: Uint8Array, boundary: string): MultipartPart[] {
  const delimiter = encodeAscii(`--${boundary}`);
  const lineBreak = encodeAscii("\r\n");
  const headerSeparator = encodeAscii("\r\n\r\n");
  const closeDelimiter = encodeAscii("--");
  const parts: MultipartPart[] = [];
  let delimiterIndex = indexOfBytes(body, delimiter, 0);

  while (delimiterIndex >= 0) {
    let partStart = delimiterIndex + delimiter.byteLength;

    if (startsWithBytes(body, closeDelimiter, partStart)) {
      break;
    }

    if (!startsWithBytes(body, lineBreak, partStart)) {
      break;
    }

    partStart += lineBreak.byteLength;

    const nextDelimiterIndex = indexOfBytes(body, delimiter, partStart);

    if (nextDelimiterIndex < 0) {
      break;
    }

    const partEnd = endsWithBytes(body, lineBreak, nextDelimiterIndex)
      ? nextDelimiterIndex - lineBreak.byteLength
      : nextDelimiterIndex;
    const partBytes = body.slice(partStart, partEnd);
    const headerEnd = indexOfBytes(partBytes, headerSeparator, 0);

    if (headerEnd >= 0) {
      const headers = parsePartHeaders(partBytes.slice(0, headerEnd));
      const disposition = parseContentDisposition(headers.get("content-disposition"));

      parts.push({
        body: partBytes.slice(headerEnd + headerSeparator.byteLength),
        contentType: headers.get("content-type") ?? "",
        filename: disposition.filename,
        name: disposition.name,
      });
    }

    delimiterIndex = nextDelimiterIndex;
  }

  return parts;
}

function parsePartHeaders(value: Uint8Array) {
  const headers = new Map<string, string>();
  const text = new TextDecoder().decode(value);

  for (const line of text.split("\r\n")) {
    const separator = line.indexOf(":");

    if (separator > 0) {
      headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
    }
  }

  return headers;
}

function parseContentDisposition(value: string | undefined) {
  const params = new Map<string, string>();

  for (const part of value?.split(";").slice(1) ?? []) {
    const separator = part.indexOf("=");

    if (separator > 0) {
      params.set(part.slice(0, separator).trim().toLowerCase(), unquote(part.slice(separator + 1)));
    }
  }

  return {
    filename: params.get("filename"),
    name: params.get("name"),
  };
}

function unquote(value: string) {
  const trimmed = value.trim();

  return trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed;
}

function encodeAscii(value: string) {
  return new TextEncoder().encode(value);
}

function indexOfBytes(source: Uint8Array, target: Uint8Array, fromIndex: number) {
  for (let index = fromIndex; index <= source.byteLength - target.byteLength; index += 1) {
    if (startsWithBytes(source, target, index)) {
      return index;
    }
  }

  return -1;
}

function startsWithBytes(source: Uint8Array, target: Uint8Array, offset: number) {
  if (offset < 0 || offset + target.byteLength > source.byteLength) {
    return false;
  }

  for (let index = 0; index < target.byteLength; index += 1) {
    if (source[offset + index] !== target[index]) {
      return false;
    }
  }

  return true;
}

function endsWithBytes(source: Uint8Array, target: Uint8Array, endIndex: number) {
  return startsWithBytes(source, target, endIndex - target.byteLength);
}
