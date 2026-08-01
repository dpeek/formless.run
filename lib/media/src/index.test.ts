import { describe, expect, it } from "vite-plus/test";
import {
  CORE_IMAGE_KEY_PREFIX,
  CORE_MEDIA_ROUTE_PREFIX,
  MEDIA_OBJECT_CACHE_CONTROL,
  MEDIA_PDF_CONTENT_TYPE,
  MEDIA_PRIVATE_DOCUMENT_CACHE_CONTROL,
  PROGRAM_DOCUMENT_MEDIA_KEY_PREFIX,
  coreImageMediaDeliveryFactsForAssetId,
  coreMediaHrefForKey,
  coreMediaKeyFromAssetId,
  coreMediaKeyFromHref,
  documentMediaAssetIsCompatible,
  documentMediaAssetMatchesAccess,
  documentMediaContentTypeForKey,
  documentMediaDeliveryFactsForAssetId,
  documentMediaExtensionForContentType,
  documentMediaResponseFacts,
  documentMediaStorageKeyForAssetId,
  hasPdfDocumentSignature,
  imageMediaContentTypeForKey,
  imageMediaDeliveryFactsForAssetId,
  imageMediaExtensionForContentType,
  isDocumentMediaAccess,
  isDocumentMediaAsset,
  isImageMediaAsset,
  isRestorableDocumentMediaKey,
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
import type { DocumentMediaAsset, ImageMediaAsset } from "./types.ts";

describe("Media runtime-neutral contract helpers", () => {
  it("normalizes image content types and file extensions", () => {
    expect(normalizeMediaContentType(" IMAGE/PNG ; charset=binary ")).toBe("image/png");
    expect(imageMediaExtensionForContentType("image/jpeg; charset=binary")).toBe("jpg");
    expect(imageMediaExtensionForContentType("image/svg+xml")).toBeUndefined();
    expect(imageMediaContentTypeForKey("media/images/photo.JPEG")).toBe("image/jpeg");
    expect(imageMediaContentTypeForKey("media/images/photo.svg")).toBeUndefined();
    expect(documentMediaExtensionForContentType(" APPLICATION/PDF ; version=1.7")).toBe("pdf");
    expect(documentMediaExtensionForContentType("text/plain")).toBeUndefined();
    expect(documentMediaContentTypeForKey("media/documents/report.PDF")).toBe(
      MEDIA_PDF_CONTENT_TYPE,
    );
    expect(documentMediaContentTypeForKey("media/documents/report.txt")).toBeUndefined();
  });

  it("validates media storage keys and image asset ids", () => {
    expect(isValidMediaStorageKey("media/images/hero_1-2.webp")).toBe(true);
    expect(isValidMediaStorageKey("")).toBe(false);
    expect(isValidMediaStorageKey("/media/images/hero.webp")).toBe(false);
    expect(isValidMediaStorageKey("media//hero.webp")).toBe(false);
    expect(isValidMediaStorageKey("media/../hero.webp")).toBe(false);
    expect(isValidMediaStorageKey("media/images/%2e%2e.webp")).toBe(false);
    expect(isValidMediaStorageKey("media\\images\\hero.webp")).toBe(false);

    expect(isValidImageMediaAssetId("hero.webp")).toBe(true);
    expect(isValidImageMediaAssetId("media/images/hero.webp")).toBe(false);
    expect(isValidImageMediaAssetId("../hero.webp")).toBe(false);
    expect(isValidDocumentMediaAssetId("coa-fixed.pdf")).toBe(true);
    expect(isValidDocumentMediaAssetId("coa-fixed.txt")).toBe(false);
    expect(isValidDocumentMediaAssetId("../coa-fixed.pdf")).toBe(false);
  });

  it("derives global Program document keys without app-install ownership", () => {
    expect(documentMediaStorageKeyForAssetId("program-report.pdf")).toBe(
      `${PROGRAM_DOCUMENT_MEDIA_KEY_PREFIX}/program-report.pdf`,
    );
    expect(
      isRestorableDocumentMediaKey(`${PROGRAM_DOCUMENT_MEDIA_KEY_PREFIX}/program-report.pdf`),
    ).toBe(true);
  });

  it("validates restorable image keys inside the configured prefix", () => {
    expect(
      isRestorableImageMediaKey("media/images/hero.webp", {
        keyPrefix: `${CORE_IMAGE_KEY_PREFIX}/`,
      }),
    ).toBe(true);
    expect(
      isRestorableImageMediaKey("media/videos/hero.webp", {
        keyPrefix: `${CORE_IMAGE_KEY_PREFIX}/`,
      }),
    ).toBe(false);
    expect(
      isRestorableImageMediaKey("media/images/hero.svg", {
        keyPrefix: `${CORE_IMAGE_KEY_PREFIX}/`,
      }),
    ).toBe(false);
    expect(
      isRestorableImageMediaKey("media/images/../hero.webp", {
        keyPrefix: `${CORE_IMAGE_KEY_PREFIX}/`,
      }),
    ).toBe(false);
  });

  it("round-trips media asset metadata and rejects incomplete metadata", () => {
    const asset = mediaAsset();
    const metadata = mediaObjectMetadataForAsset(asset);

    expect(metadata).toEqual({
      "formless-media-asset-id": "hero.webp",
      "formless-media-byte-size": "123",
      "formless-media-content-type": "image/webp",
      "formless-media-delivery-href": "/api/formless/media/media/images/hero.webp",
      "formless-media-filename": "hero.webp",
      "formless-media-height": "630",
      "formless-media-kind": "image",
      "formless-media-label": "Hero",
      "formless-media-provider": "r2",
      "formless-media-status": "ready",
      "formless-media-storage-key": "media/images/hero.webp",
      "formless-media-width": "1200",
    });
    expect(mediaAssetFromObjectMetadata(metadata)).toEqual(asset);
    expect(
      mediaAssetFromObjectMetadata({
        ...metadata,
        "formless-media-byte-size": "-1",
      }),
    ).toBeUndefined();
    expect(
      mediaAssetFromObjectMetadata({
        ...metadata,
        "formless-media-kind": "video",
      }),
    ).toBeUndefined();
    expect(mediaAssetFromObjectMetadata(undefined)).toBeUndefined();
  });

  it("round-trips Program document metadata and validates access invariants", () => {
    const asset = documentMediaAsset();
    const metadata = mediaObjectMetadataForAsset(asset);

    expect(metadata).toEqual({
      "formless-media-asset-id": "coa-fixed.pdf",
      "formless-media-byte-size": "12",
      "formless-media-content-type": "application/pdf",
      "formless-media-delivery-href": "/api/formless/program/media/documents/coa-fixed.pdf",
      "formless-media-document-access": "private",
      "formless-media-filename": "coa.pdf",
      "formless-media-kind": "document",
      "formless-media-label": "Certificate of analysis",
      "formless-media-provider": "r2",
      "formless-media-status": "ready",
      "formless-media-storage-key": "media/program/documents/coa-fixed.pdf",
    });
    expect(mediaAssetFromObjectMetadata(metadata)).toEqual(asset);
    expect(
      mediaAssetFromObjectMetadata({
        ...metadata,
        "formless-media-document-access": "authenticated",
      }),
    ).toBeUndefined();
    expect(
      mediaAssetFromObjectMetadata({
        ...metadata,
        "formless-media-content-type": "text/plain",
      }),
    ).toBeUndefined();
  });

  it("round-trips global Program document metadata without owner metadata", () => {
    const asset = programDocumentMediaAsset();
    const metadata = mediaObjectMetadataForAsset(asset);

    expect(metadata).not.toHaveProperty("formless-media-owner-app-install-id");
    expect(mediaAssetFromObjectMetadata(metadata)).toEqual(asset);
    expect(isDocumentMediaAsset(asset)).toBe(true);
    expect(
      documentMediaAssetIsCompatible(asset, {
        acceptedMimeTypes: ["application/pdf"],
        access: "public",
        maxBytes: 12,
      }),
    ).toBe(true);
  });

  it("discriminates image and document assets and checks document compatibility", () => {
    const image = mediaAsset();
    const document = documentMediaAsset();

    expect(isImageMediaAsset(image)).toBe(true);
    expect(isDocumentMediaAsset(image)).toBe(false);
    expect(isDocumentMediaAsset(document)).toBe(true);
    expect(isImageMediaAsset(document)).toBe(false);
    expect(isDocumentMediaAccess("public")).toBe(true);
    expect(isDocumentMediaAccess("authenticated")).toBe(false);
    expect(documentMediaAssetMatchesAccess(document, "private")).toBe(true);
    expect(documentMediaAssetMatchesAccess(document, "public")).toBe(false);
    expect(
      documentMediaAssetIsCompatible(document, {
        acceptedMimeTypes: ["application/pdf"],
        access: "private",
        maxBytes: 12,
      }),
    ).toBe(true);
    expect(
      documentMediaAssetIsCompatible(document, {
        acceptedMimeTypes: ["application/pdf"],
        access: "public",
        maxBytes: 12,
      }),
    ).toBe(false);
  });

  it("validates PDF content and derives safe document delivery facts", () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\nbody");
    const file = {
      bytes,
      contentType: " APPLICATION/PDF ; charset=binary ",
      filename: "coa.pdf",
      size: bytes.byteLength,
    };

    expect(hasPdfDocumentSignature(bytes)).toBe(true);
    expect(
      validatePdfDocumentMediaFile(file, {
        acceptedMimeTypes: ["application/pdf"],
        maxBytes: bytes.byteLength,
      }),
    ).toEqual({ ok: true, contentType: MEDIA_PDF_CONTENT_TYPE });
    expect(
      validatePdfDocumentMediaFile(
        { ...file, contentType: "text/plain" },
        { acceptedMimeTypes: ["application/pdf"], maxBytes: bytes.byteLength },
      ),
    ).toEqual({ ok: false, error: "unsupported-content-type" });
    expect(
      validatePdfDocumentMediaFile(
        { ...file, size: bytes.byteLength + 1 },
        { acceptedMimeTypes: ["application/pdf"], maxBytes: bytes.byteLength + 1 },
      ),
    ).toEqual({ ok: false, error: "invalid-size" });
    expect(
      validatePdfDocumentMediaFile(file, {
        acceptedMimeTypes: ["application/pdf"],
        maxBytes: bytes.byteLength - 1,
      }),
    ).toEqual({ ok: false, error: "too-large" });
    expect(
      validatePdfDocumentMediaFile(
        {
          ...file,
          bytes: new TextEncoder().encode("not a pdf!"),
          size: 10,
        },
        { acceptedMimeTypes: ["application/pdf"], maxBytes: 10 },
      ),
    ).toEqual({ ok: false, error: "invalid-pdf" });

    expect(safeDocumentMediaFilename('../../bad"\r\nname')).toBe("bad___name.pdf");
    expect(documentMediaResponseFacts(documentMediaAsset())).toEqual({
      cacheControl: MEDIA_PRIVATE_DOCUMENT_CACHE_CONTROL,
      contentDisposition: 'inline; filename="coa.pdf"',
      contentType: MEDIA_PDF_CONTENT_TYPE,
      xContentTypeOptions: "nosniff",
    });
    expect(
      documentMediaResponseFacts({ ...documentMediaAsset(), access: "public" }, { download: true }),
    ).toEqual({
      cacheControl: MEDIA_OBJECT_CACHE_CONTROL,
      contentDisposition: 'attachment; filename="coa.pdf"',
      contentType: MEDIA_PDF_CONTENT_TYPE,
      xContentTypeOptions: "nosniff",
    });
    expect(
      documentMediaDeliveryFactsForAssetId("program-report.pdf", {
        hrefForAssetId: (assetId) => `/api/formless/program/media/documents/${assetId}`,
      }),
    ).toEqual({
      assetId: "program-report.pdf",
      href: "/api/formless/program/media/documents/program-report.pdf",
      kind: "document",
      storageKey: "media/program/documents/program-report.pdf",
    });
  });

  it("derives core media delivery hrefs and storage keys from asset ids", () => {
    expect(coreMediaHrefForKey("media/images/hero.webp")).toBe(
      `${CORE_MEDIA_ROUTE_PREFIX}media/images/hero.webp`,
    );
    expect(coreMediaKeyFromHref("/api/formless/media/media/images/hero.webp?cache=1")).toBe(
      "media/images/hero.webp",
    );
    expect(coreMediaKeyFromHref("/api/formless/media/media/images/%25bad.webp")).toBeUndefined();
    expect(coreMediaKeyFromAssetId("hero.webp")).toBe("media/images/hero.webp");
    expect(coreMediaKeyFromAssetId("../hero.webp")).toBeUndefined();
    expect(coreImageMediaDeliveryFactsForAssetId("hero.webp")).toEqual({
      assetId: "hero.webp",
      href: "/api/formless/media/media/images/hero.webp",
      kind: "image",
      storageKey: "media/images/hero.webp",
    });
    expect(
      imageMediaDeliveryFactsForAssetId("hero.png", {
        hrefForKey: (key) => `/assets/${key}`,
        keyPrefix: "media/images/",
      }),
    ).toEqual({
      assetId: "hero.png",
      href: "/assets/media/images/hero.png",
      kind: "image",
      storageKey: "media/images/hero.png",
    });
  });
});

function mediaAsset(): ImageMediaAsset {
  return {
    byteSize: 123,
    contentType: "image/webp",
    deliveryHref: "/api/formless/media/media/images/hero.webp",
    filename: "hero.webp",
    height: 630,
    id: "hero.webp",
    kind: "image",
    label: "Hero",
    provider: "r2",
    status: "ready",
    storageKey: "media/images/hero.webp",
    width: 1200,
  };
}

function documentMediaAsset(): DocumentMediaAsset {
  return {
    access: "private",
    byteSize: 12,
    contentType: MEDIA_PDF_CONTENT_TYPE,
    deliveryHref: "/api/formless/program/media/documents/coa-fixed.pdf",
    filename: "coa.pdf",
    id: "coa-fixed.pdf",
    kind: "document",
    label: "Certificate of analysis",
    provider: "r2",
    status: "ready",
    storageKey: "media/program/documents/coa-fixed.pdf",
  };
}

function programDocumentMediaAsset(): DocumentMediaAsset {
  return {
    access: "public",
    byteSize: 12,
    contentType: MEDIA_PDF_CONTENT_TYPE,
    deliveryHref: "/api/formless/program/media/documents/program-report.pdf",
    filename: "program-report.pdf",
    id: "program-report.pdf",
    kind: "document",
    label: "Program report",
    provider: "r2",
    status: "ready",
    storageKey: "media/program/documents/program-report.pdf",
  };
}
