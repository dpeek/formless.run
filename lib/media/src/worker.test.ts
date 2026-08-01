import { describe, expect, it } from "vite-plus/test";
import {
  CORE_MEDIA_ROUTE_PREFIX,
  MEDIA_OBJECT_CACHE_CONTROL,
  MEDIA_PRIVATE_DOCUMENT_CACHE_CONTROL,
  deliveryFactsForDocumentMediaObject,
  deliveryFactsForMediaObject,
  documentMediaRouteFromPathname,
  handleDocumentMediaRequest,
  handleMediaRequest,
  imageMediaRouteFromPathname,
  listDocumentMediaAssets,
  listImageMediaAssets,
  mediaObjectStoreFromR2Bucket,
  restoreDocumentMedia,
  restoreImageMedia,
  uploadDocumentMedia,
  uploadImageMedia,
} from "./worker.ts";
import type {
  DocumentMediaAsset,
  DocumentMediaCompatibility,
  MediaAsset,
  MediaObjectMetadata,
  MediaObjectStore,
} from "./types.ts";

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const pdfBytes = new TextEncoder().encode("%PDF-1.7\nbody");
const documentCompatibility = {
  acceptedMimeTypes: ["application/pdf"],
  access: "private",
  maxBytes: 1024,
} satisfies DocumentMediaCompatibility;
const documentMedia = {
  documentsPath: "/api/formless/program/media/documents",
} as const;

describe("Media Worker adapter", () => {
  it("exposes Worker adapter route behavior through the public package subpath", async () => {
    const mediaWorker = await import("@dpeek/formless-media/worker");

    expect(mediaWorker.CORE_MEDIA_ROUTE_PREFIX).toBe(CORE_MEDIA_ROUTE_PREFIX);
    expect(mediaWorker.handleDocumentMediaRequest).toBe(handleDocumentMediaRequest);
    expect(mediaWorker.imageMediaRouteFromPathname("/api/formless/media/images")).toEqual({
      media: {
        imageKeyPrefix: "media/images",
        imageUploadPath: "/api/formless/media/images",
        routePrefix: "/api/formless/media",
      },
      path: "/media/images",
    });
  });

  it("preserves core media route matching", () => {
    expect(imageMediaRouteFromPathname("/api/formless/media/images")).toEqual({
      media: {
        imageKeyPrefix: "media/images",
        imageUploadPath: "/api/formless/media/images",
        routePrefix: "/api/formless/media",
      },
      path: "/media/images",
    });
    expect(imageMediaRouteFromPathname(`${CORE_MEDIA_ROUTE_PREFIX}media/images/hero.png`)).toEqual({
      media: {
        imageKeyPrefix: "media/images",
        imageUploadPath: "/api/formless/media/images",
        routePrefix: "/api/formless/media",
      },
      path: "/media/media/images/hero.png",
    });
  });

  it("preserves list, read, and HEAD behavior for /api/formless/media", async () => {
    const harness = createMediaRequestHarness();
    const key = "media/images/hero.png";

    harness.putObject(key, pngBytes, "image/png");

    const list = await harness.dispatch("/api/formless/media/images");
    const getResponse = await harness.dispatch(`${CORE_MEDIA_ROUTE_PREFIX}${key}`);
    const headResponse = await harness.dispatch(`${CORE_MEDIA_ROUTE_PREFIX}${key}`, {
      method: "HEAD",
    });

    expect(list.status).toBe(200);
    expect(list.headers.get("Cache-Control")).toBe("no-store");
    expect((await list.json()) as unknown).toEqual({
      assets: [
        {
          byteSize: pngBytes.byteLength,
          contentType: "image/png",
          deliveryHref: `${CORE_MEDIA_ROUTE_PREFIX}${key}`,
          id: "hero.png",
          kind: "image",
          label: "hero.png",
          provider: "r2",
          status: "ready",
          storageKey: key,
        },
      ],
    });

    expect(getResponse.status).toBe(200);
    expect(getResponse.headers.get("Content-Type")).toBe("image/png");
    expect(getResponse.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(new Uint8Array(await getResponse.arrayBuffer())).toEqual(pngBytes);

    expect(headResponse.status).toBe(200);
    expect(headResponse.headers.get("Content-Type")).toBe("image/png");
    expect(headResponse.headers.get("Cache-Control")).toBe(
      getResponse.headers.get("Cache-Control"),
    );
    expect((await headResponse.arrayBuffer()).byteLength).toBe(0);
  });

  it("preserves upload and restore behavior for /api/formless/media", async () => {
    const harness = createMediaRequestHarness();

    const upload = await harness.dispatch("/api/formless/media/images", {
      body: multipartFormData([{ body: pngBytes, contentType: "image/png", filename: "hero.png" }]),
      headers: { "Content-Type": "multipart/form-data; boundary=formless-media-test" },
      method: "POST",
    });
    const uploaded = (await upload.json()) as {
      asset: { filename?: string; label: string; storageKey: string };
      assetId: string;
      contentType: string;
      href: string;
      key: string;
      size: number;
    };

    expect(upload.status).toBe(200);
    expect(uploaded).toEqual({
      asset: {
        byteSize: pngBytes.byteLength,
        contentType: "image/png",
        deliveryHref: uploaded.href,
        filename: "hero.png",
        id: uploaded.assetId,
        kind: "image",
        label: "hero.png",
        provider: "r2",
        status: "ready",
        storageKey: uploaded.key,
      },
      assetId: "asset-fixed.png",
      contentType: "image/png",
      href: `${CORE_MEDIA_ROUTE_PREFIX}media/images/asset-fixed.png`,
      key: "media/images/asset-fixed.png",
      size: pngBytes.byteLength,
    });
    expect(harness.objects.get(uploaded.key)?.customMetadata).toMatchObject({
      "formless-media-asset-id": uploaded.assetId,
      "formless-media-storage-key": uploaded.key,
    });

    const restoreKey = "media/images/restored.png";
    const restore = await harness.dispatch(`${CORE_MEDIA_ROUTE_PREFIX}${restoreKey}`, {
      body: pngBytes,
      headers: { "Content-Type": "image/png" },
      method: "PUT",
    });

    expect(restore.status).toBe(200);
    expect((await restore.json()) as unknown).toEqual({
      contentType: "image/png",
      href: `${CORE_MEDIA_ROUTE_PREFIX}${restoreKey}`,
      key: restoreKey,
      size: pngBytes.byteLength,
    });
    expect(harness.objects.has(restoreKey)).toBe(true);
  });

  it("uses fake stores and fixed ids for upload, list, restore, and delivery contracts", async () => {
    const memory = createMemoryStore();
    const upload = await uploadImageMedia({
      file: {
        bytes: pngBytes,
        contentType: "image/png; charset=binary",
        filename: "hero.png",
        size: pngBytes.byteLength,
      },
      hrefForKey: (key) => `${CORE_MEDIA_ROUTE_PREFIX}${key}`,
      keyPrefix: "media/images/",
      provider: "fake-r2",
      randomId: () => "asset-fixed",
      store: memory.store,
    });

    expect(upload).toEqual({
      ok: true,
      upload: {
        asset: {
          byteSize: pngBytes.byteLength,
          contentType: "image/png",
          deliveryHref: `${CORE_MEDIA_ROUTE_PREFIX}media/images/asset-fixed.png`,
          filename: "hero.png",
          id: "asset-fixed.png",
          kind: "image",
          label: "hero.png",
          provider: "fake-r2",
          status: "ready",
          storageKey: "media/images/asset-fixed.png",
        },
        assetId: "asset-fixed.png",
        contentType: "image/png",
        href: `${CORE_MEDIA_ROUTE_PREFIX}media/images/asset-fixed.png`,
        key: "media/images/asset-fixed.png",
        size: pngBytes.byteLength,
      },
    });
    expect(memory.objects.get("media/images/asset-fixed.png")?.customMetadata).toEqual({
      "formless-media-asset-id": "asset-fixed.png",
      "formless-media-byte-size": String(pngBytes.byteLength),
      "formless-media-content-type": "image/png",
      "formless-media-delivery-href": `${CORE_MEDIA_ROUTE_PREFIX}media/images/asset-fixed.png`,
      "formless-media-filename": "hero.png",
      "formless-media-kind": "image",
      "formless-media-label": "hero.png",
      "formless-media-provider": "fake-r2",
      "formless-media-status": "ready",
      "formless-media-storage-key": "media/images/asset-fixed.png",
    });

    await memory.store.putObject({
      bytes: pngBytes,
      cacheControl: MEDIA_OBJECT_CACHE_CONTROL,
      contentType: "image/webp",
      key: "media/images/fallback.webp",
    });

    await expect(
      listImageMediaAssets({
        hrefForKey: (key) => `${CORE_MEDIA_ROUTE_PREFIX}${key}`,
        keyPrefix: "media/images/",
        provider: "fake-r2",
        store: memory.store,
      }),
    ).resolves.toEqual([
      {
        byteSize: pngBytes.byteLength,
        contentType: "image/webp",
        deliveryHref: `${CORE_MEDIA_ROUTE_PREFIX}media/images/fallback.webp`,
        id: "fallback.webp",
        kind: "image",
        label: "fallback.webp",
        provider: "fake-r2",
        status: "ready",
        storageKey: "media/images/fallback.webp",
      },
      upload.ok ? upload.upload.asset : undefined,
    ]);

    const restoreAsset: MediaAsset = {
      byteSize: pngBytes.byteLength,
      contentType: "image/webp",
      deliveryHref: `${CORE_MEDIA_ROUTE_PREFIX}media/images/restored.webp`,
      id: "restored.webp",
      kind: "image",
      label: "Restored",
      provider: "fake-r2",
      status: "ready",
      storageKey: "media/images/restored.webp",
    };
    const restore = await restoreImageMedia({
      asset: restoreAsset,
      bytes: pngBytes,
      contentType: "image/webp",
      hrefForKey: (key) => `${CORE_MEDIA_ROUTE_PREFIX}${key}`,
      key: "media/images/restored.webp",
      keyPrefix: "media/images/",
      store: memory.store,
    });

    expect(restore).toEqual({
      ok: true,
      upload: {
        contentType: "image/webp",
        href: `${CORE_MEDIA_ROUTE_PREFIX}media/images/restored.webp`,
        key: "media/images/restored.webp",
        size: pngBytes.byteLength,
      },
    });
    expect(memory.objects.get("media/images/restored.webp")?.customMetadata).toMatchObject({
      "formless-media-asset-id": "restored.webp",
      "formless-media-label": "Restored",
      "formless-media-storage-key": "media/images/restored.webp",
    });

    const delivery = await deliveryFactsForMediaObject({
      includeBody: false,
      key: "media/images/restored.webp",
      store: memory.store,
    });

    expect(delivery?.body).toBeNull();
    expect(delivery?.headers.get("Content-Type")).toBe("image/webp");
    expect(delivery?.headers.get("Cache-Control")).toBe(MEDIA_OBJECT_CACHE_CONTROL);
    expect(delivery?.headers.get("ETag")).toBe('"media/images/restored.webp"');
  });

  it("returns deterministic write errors without provider writes", async () => {
    const memory = createMemoryStore();

    await expect(
      uploadImageMedia({
        file: {
          bytes: pngBytes,
          contentType: "image/svg+xml",
          filename: "hero.svg",
          size: pngBytes.byteLength,
        },
        hrefForKey: (key) => `${CORE_MEDIA_ROUTE_PREFIX}${key}`,
        keyPrefix: "media/images/",
        provider: "fake-r2",
        randomId: () => "asset-fixed",
        store: memory.store,
      }),
    ).resolves.toEqual({ error: "Unsupported image type.", ok: false, status: 415 });
    await expect(
      restoreImageMedia({
        bytes: new Uint8Array(),
        contentType: "image/png",
        hrefForKey: (key) => `${CORE_MEDIA_ROUTE_PREFIX}${key}`,
        key: "media/images/empty.png",
        keyPrefix: "media/images/",
        store: memory.store,
      }),
    ).resolves.toEqual({ error: "Media restore body must not be empty.", ok: false, status: 400 });
    expect(memory.objects.size).toBe(0);
  });

  it("uploads, compatibly lists, restores, and delivers app-scoped PDF documents", async () => {
    const memory = createMemoryStore();
    const upload = await uploadDocumentMedia({
      compatibility: documentCompatibility,
      file: {
        bytes: pdfBytes,
        contentType: " APPLICATION/PDF ; charset=binary ",
        filename: '../../bad"\r\nname',
        size: pdfBytes.byteLength,
      },
      hrefForAssetId: documentHref,
      provider: "fake-r2",
      randomId: () => "coa-fixed",
      store: memory.store,
    });

    expect(upload).toEqual({
      ok: true,
      upload: {
        asset: {
          access: "private",
          byteSize: pdfBytes.byteLength,
          contentType: "application/pdf",
          deliveryHref: documentHref("coa-fixed.pdf"),
          filename: "bad___name.pdf",
          id: "coa-fixed.pdf",
          kind: "document",
          label: "bad___name.pdf",
          provider: "fake-r2",
          status: "ready",
          storageKey: "media/program/documents/coa-fixed.pdf",
        },
        assetId: "coa-fixed.pdf",
        contentType: "application/pdf",
        href: documentHref("coa-fixed.pdf"),
        key: "media/program/documents/coa-fixed.pdf",
        size: pdfBytes.byteLength,
      },
    });
    const stored = memory.objects.get("media/program/documents/coa-fixed.pdf");

    expect(stored?.cacheControl).toBe(MEDIA_PRIVATE_DOCUMENT_CACHE_CONTROL);
    expect(stored?.customMetadata).toMatchObject({
      "formless-media-asset-id": "coa-fixed.pdf",
      "formless-media-content-type": "application/pdf",
      "formless-media-document-access": "private",
      "formless-media-filename": "bad___name.pdf",
      "formless-media-kind": "document",
      "formless-media-provider": "fake-r2",
      "formless-media-storage-key": "media/program/documents/coa-fixed.pdf",
    });

    await expect(
      listDocumentMediaAssets({
        compatibility: documentCompatibility,
        hrefForAssetId: documentHref,
        store: memory.store,
      }),
    ).resolves.toEqual([upload.ok ? upload.upload.asset : undefined]);
    await expect(
      listDocumentMediaAssets({
        compatibility: { ...documentCompatibility, access: "public" },
        hrefForAssetId: documentHref,
        store: memory.store,
      }),
    ).resolves.toEqual([]);

    const delivery = await deliveryFactsForDocumentMediaObject({
      assetId: "coa-fixed.pdf",
      hrefForAssetId: documentHref,
      store: memory.store,
    });

    expect(delivery?.asset).toEqual(upload.ok ? upload.upload.asset : undefined);
    expect(delivery?.headers.get("Cache-Control")).toBe(MEDIA_PRIVATE_DOCUMENT_CACHE_CONTROL);
    expect(delivery?.headers.get("Content-Disposition")).toBe('inline; filename="bad___name.pdf"');
    expect(delivery?.headers.get("Content-Type")).toBe("application/pdf");
    expect(delivery?.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await new Response(delivery?.body).arrayBuffer())).toEqual(pdfBytes);
    if (!upload.ok || upload.upload.asset?.kind !== "document") {
      throw new Error("Expected document upload.");
    }

    await expect(
      restoreDocumentMedia({
        asset: upload.upload.asset,
        bytes: pdfBytes,
        compatibility: documentCompatibility,
        contentType: "application/pdf; charset=binary",
        hrefForAssetId: documentHref,
        store: memory.store,
      }),
    ).resolves.toMatchObject({
      ok: true,
      upload: {
        assetId: "coa-fixed.pdf",
        contentType: "application/pdf",
      },
    });
  });

  it("requests R2 list metadata and falls back to head for empty provider metadata", async () => {
    const memory = createMemoryStore();
    const upload = await uploadDocumentMedia({
      compatibility: documentCompatibility,
      file: {
        bytes: pdfBytes,
        contentType: "application/pdf",
        filename: "fallback.pdf",
        size: pdfBytes.byteLength,
      },
      hrefForAssetId: documentHref,
      provider: "fake-r2",
      randomId: () => "fallback",
      store: memory.store,
    });

    if (!upload.ok) {
      throw new Error("Expected document upload.");
    }

    const key = upload.upload.key;
    const stored = memory.objects.get(key);
    const listOptions: unknown[] = [];
    const headKeys: string[] = [];
    const bucket = {
      async head(headKey: string) {
        headKeys.push(headKey);

        return {
          customMetadata: stored?.customMetadata,
          httpMetadata: {
            cacheControl: stored?.cacheControl,
            contentType: stored?.contentType,
          },
        };
      },
      async list(options: unknown) {
        listOptions.push(options);

        return {
          delimitedPrefixes: [],
          objects: [
            {
              customMetadata: {},
              httpMetadata: {},
              key,
              size: pdfBytes.byteLength,
            },
          ],
          truncated: false,
        };
      },
    } as unknown as R2Bucket;
    const store = mediaObjectStoreFromR2Bucket(bucket);

    await expect(
      listDocumentMediaAssets({
        compatibility: documentCompatibility,
        hrefForAssetId: documentHref,
        store,
      }),
    ).resolves.toEqual([upload.upload.asset]);
    expect(listOptions).toEqual([
      {
        include: ["customMetadata", "httpMetadata"],
        limit: 50,
        prefix: "media/program/documents/",
      },
    ]);
    expect(headKeys).toEqual([key]);
  });

  it("lists compatible documents across every provider page", async () => {
    const memory = createMemoryStore();
    const uploads = await Promise.all(
      ["first", "second"].map((id) =>
        uploadDocumentMedia({
          compatibility: documentCompatibility,
          file: {
            bytes: pdfBytes,
            contentType: "application/pdf",
            filename: `${id}.pdf`,
            size: pdfBytes.byteLength,
          },
          hrefForAssetId: documentHref,
          provider: "fake-r2",
          randomId: () => id,
          store: memory.store,
        }),
      ),
    );

    if (uploads.some((upload) => !upload.ok)) {
      throw new Error("Expected document uploads.");
    }

    const allObjects = await memory.store.listObjects!({
      limit: 50,
      prefix: "media/program/documents",
    });
    const cursors: Array<string | undefined> = [];
    const store: MediaObjectStore = {
      ...memory.store,
      async listObjects(options) {
        cursors.push(options.cursor);

        return options.cursor
          ? {
              objects: allObjects.objects.slice(1),
              truncated: false,
            }
          : {
              cursor: "next-page",
              objects: allObjects.objects.slice(0, 1),
              truncated: true,
            };
      },
    };

    await expect(
      listDocumentMediaAssets({
        compatibility: documentCompatibility,
        hrefForAssetId: documentHref,
        limit: 1,
        store,
      }),
    ).resolves.toEqual(
      uploads
        .map((upload) => (upload.ok ? upload.upload.asset : undefined))
        .toSorted((left, right) => (left?.label ?? "").localeCompare(right?.label ?? "")),
    );
    expect(cursors).toEqual([undefined, "next-page"]);
  });

  it("applies the effective document limit and validates PDF bytes before provider writes", async () => {
    const memory = createMemoryStore();

    await expect(
      uploadDocumentMedia({
        compatibility: documentCompatibility,
        file: {
          bytes: pdfBytes,
          contentType: "application/pdf",
          filename: "report.pdf",
          size: pdfBytes.byteLength,
        },
        hrefForAssetId: documentHref,
        maxBytes: pdfBytes.byteLength - 1,
        provider: "fake-r2",
        randomId: () => "too-large",
        store: memory.store,
      }),
    ).resolves.toEqual({
      error: `Document file is larger than the ${pdfBytes.byteLength - 1} byte limit.`,
      ok: false,
      status: 413,
    });
    await expect(
      uploadDocumentMedia({
        compatibility: documentCompatibility,
        file: {
          bytes: new TextEncoder().encode("not a pdf"),
          contentType: "application/pdf",
          filename: "report.pdf",
          size: 9,
        },
        hrefForAssetId: documentHref,
        provider: "fake-r2",
        randomId: () => "invalid",
        store: memory.store,
      }),
    ).resolves.toEqual({
      error: "Document file is not a valid PDF.",
      ok: false,
      status: 415,
    });
    expect(memory.objects.size).toBe(0);
  });

  it("uses immutable public cache and attachment headers for public document delivery", async () => {
    const memory = createMemoryStore();
    const upload = await uploadDocumentMedia({
      compatibility: { ...documentCompatibility, access: "public" },
      file: {
        bytes: pdfBytes,
        contentType: "application/pdf",
        filename: "public-coa.pdf",
        size: pdfBytes.byteLength,
      },
      hrefForAssetId: documentHref,
      provider: "fake-r2",
      randomId: () => "public-coa",
      store: memory.store,
    });

    expect(upload.ok).toBe(true);
    expect(memory.objects.get("media/program/documents/public-coa.pdf")?.cacheControl).toBe(
      MEDIA_OBJECT_CACHE_CONTROL,
    );

    const delivery = await deliveryFactsForDocumentMediaObject({
      assetId: "public-coa.pdf",
      download: true,
      hrefForAssetId: documentHref,
      includeBody: false,
      store: memory.store,
    });

    expect(delivery?.body).toBeNull();
    expect(delivery?.headers.get("Cache-Control")).toBe(MEDIA_OBJECT_CACHE_CONTROL);
    expect(delivery?.headers.get("Content-Disposition")).toBe(
      'attachment; filename="public-coa.pdf"',
    );
  });

  it("handles route-neutral document upload, list, GET, HEAD, download, and restore requests", async () => {
    const memory = createMemoryStore();
    const authorizations: Array<{
      assetId?: string;
      operation: string;
    }> = [];
    let restoredAsset: DocumentMediaAsset | undefined;
    const dispatch = async (path: string, init: RequestInit = {}) => {
      const response = await handleDocumentMediaRequest(
        new Request(`https://example.test${path}`, init),
        {
          authorizeRequest({ asset, operation }) {
            authorizations.push({
              ...(asset ? { assetId: asset.id } : {}),
              operation,
            });

            return { authorized: true };
          },
          compatibility: documentCompatibility,
          media: documentMedia,
          provider: "fake-r2",
          randomId: () => "route-fixed",
          resolveRestoreAsset: () => restoredAsset,
          store: memory.store,
        },
      );

      if (!response) {
        throw new Error(`Expected document media response for ${path}.`);
      }

      return response;
    };

    expect(documentMediaRouteFromPathname(documentMedia.documentsPath, documentMedia)).toEqual({
      media: documentMedia,
    });
    expect(
      documentMediaRouteFromPathname(
        `${documentMedia.documentsPath}/route-fixed.pdf`,
        documentMedia,
      ),
    ).toEqual({
      assetId: "route-fixed.pdf",
      media: documentMedia,
    });
    expect(
      documentMediaRouteFromPathname(`${documentMedia.documentsPath}/../other.pdf`, documentMedia),
    ).toBeUndefined();

    const uploadResponse = await dispatch(
      `${documentMedia.documentsPath}?entity=coa&field=report`,
      {
        body: multipartFormData([
          { body: pdfBytes, contentType: "application/pdf", filename: "issued.pdf" },
        ]),
        headers: { "Content-Type": "multipart/form-data; boundary=formless-media-test" },
        method: "POST",
      },
    );
    const uploaded = (await uploadResponse.json()) as { asset: DocumentMediaAsset };

    expect(uploadResponse.status).toBe(200);
    expect(uploaded.asset).not.toHaveProperty("ownerAppInstallId");

    const listResponse = await dispatch(documentMedia.documentsPath);

    expect(listResponse.headers.get("Cache-Control")).toBe("no-store");
    expect((await listResponse.json()) as unknown).toEqual({ assets: [uploaded.asset] });

    const getResponse = await dispatch(`${documentMedia.documentsPath}/${uploaded.asset.id}`);
    const headResponse = await dispatch(
      `${documentMedia.documentsPath}/${uploaded.asset.id}?download=1`,
      { method: "HEAD" },
    );

    expect(getResponse.headers.get("Content-Disposition")).toBe('inline; filename="issued.pdf"');
    expect(new Uint8Array(await getResponse.arrayBuffer())).toEqual(pdfBytes);
    expect(headResponse.headers.get("Content-Disposition")).toBe(
      'attachment; filename="issued.pdf"',
    );
    expect(headResponse.headers.get("Cache-Control")).toBe(MEDIA_PRIVATE_DOCUMENT_CACHE_CONTROL);
    expect((await headResponse.arrayBuffer()).byteLength).toBe(0);

    restoredAsset = uploaded.asset;
    const restoreResponse = await dispatch(`${documentMedia.documentsPath}/${uploaded.asset.id}`, {
      body: pdfBytes,
      headers: { "Content-Type": "application/pdf" },
      method: "PUT",
    });

    expect(restoreResponse.status).toBe(200);
    expect(authorizations).toEqual([
      { operation: "upload" },
      { operation: "list" },
      { assetId: "route-fixed.pdf", operation: "delivery" },
      { assetId: "route-fixed.pdf", operation: "delivery" },
      { operation: "restore" },
    ]);
  });

  it("preserves media miss and authorization response behavior", async () => {
    const harness = createMediaRequestHarness({
      authorizeWrite: () => ({
        authorized: false,
        error: "Write denied.",
        headers: { "WWW-Authenticate": "Bearer" },
        status: 401,
      }),
    });

    const rejected = await harness.dispatch("/api/formless/media/images", {
      body: multipartFormData([{ body: pngBytes, contentType: "image/png", filename: "hero.png" }]),
      headers: { "Content-Type": "multipart/form-data; boundary=formless-media-test" },
      method: "POST",
    });

    expect(rejected.status).toBe(401);
    expect(rejected.headers.get("WWW-Authenticate")).toBe("Bearer");
    expect((await rejected.json()) as unknown).toEqual({ error: "Write denied." });
  });
});

type StoredMediaObject = {
  cacheControl: string;
  contentType: string;
  customMetadata?: MediaObjectMetadata;
  bytes: Uint8Array;
};

type MediaRequestHarnessOptions = {
  authorizeWrite?: Parameters<typeof handleMediaRequest>[1]["authorizeWrite"];
};

function createMediaRequestHarness(options: MediaRequestHarnessOptions = {}) {
  const memory = createMemoryStore();

  return {
    ...memory,
    async dispatch(path: string, init: RequestInit = {}) {
      const response = await handleMediaRequest(new Request(`https://example.test${path}`, init), {
        authorizeWrite: options.authorizeWrite ?? (() => ({ authorized: true })),
        provider: "r2",
        randomId: () => "asset-fixed",
        store: memory.store,
      });

      if (!response) {
        throw new Error(`Expected media response for ${path}.`);
      }

      return response;
    },
  };
}

function createMemoryStore() {
  const objects = new Map<string, StoredMediaObject>();
  const store: MediaObjectStore = {
    async getObject(key) {
      const object = objects.get(key);

      if (!object) {
        return undefined;
      }

      return {
        body: bodyInitFromBytes(object.bytes),
        customMetadata: object.customMetadata,
        httpEtag: `"${key}"`,
        writeHttpMetadata(headers) {
          headers.set("Content-Type", object.contentType);
          headers.set("Cache-Control", object.cacheControl);
        },
      };
    },
    async listObjects(options) {
      return {
        objects: [...objects.entries()]
          .filter(([key]) => key.startsWith(options.prefix))
          .slice(0, options.limit)
          .map(([key, object]) => ({
            contentType: object.contentType,
            customMetadata: object.customMetadata,
            key,
            size: object.bytes.byteLength,
          })),
      };
    },
    async putObject(write) {
      objects.set(write.key, {
        bytes: copyBytes(write.bytes),
        cacheControl: write.cacheControl,
        contentType: write.contentType,
        customMetadata: write.customMetadata,
      });
    },
  };

  return {
    objects,
    putObject(key: string, body: Uint8Array, contentType: string) {
      objects.set(key, {
        bytes: copyBytes(body),
        cacheControl: "public, max-age=31536000, immutable",
        contentType,
      });
    },
    store,
  };
}

function multipartFormData(
  files: Array<{ body: Uint8Array; contentType: string; filename: string }>,
) {
  const chunks: Uint8Array[] = [];

  for (const file of files) {
    chunks.push(
      textBytes(
        `--formless-media-test\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      ),
      file.body,
      textBytes("\r\n"),
    );
  }

  chunks.push(textBytes("--formless-media-test--\r\n"));

  return concatBytes(chunks);
}

function textBytes(value: string) {
  return new TextEncoder().encode(value);
}

function bodyInitFromBytes(bytes: Uint8Array): BodyInit {
  return copyBytes(bytes).buffer as ArrayBuffer;
}

function copyBytes(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);

  copy.set(bytes);

  return copy;
}

function concatBytes(chunks: Uint8Array[]) {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

function documentHref(assetId: string) {
  return `${documentMedia.documentsPath}/${assetId}`;
}
