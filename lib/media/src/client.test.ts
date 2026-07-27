import { describe, expect, it } from "vite-plus/test";
import {
  appDocumentMediaCollectionHref,
  coreImageMediaAssetOptionForId,
  DOCUMENT_UPLOAD_ACCEPT,
  documentMediaDownloadHref,
  IMAGE_UPLOAD_ACCEPT,
  listAppDocumentMediaAssets,
  listCoreImageMediaAssets,
  parseDocumentMediaListResponse,
  parseDocumentMediaUploadResponse,
  parseImageMediaListResponse,
  parseImageMediaUploadResponse,
  uploadAppDocumentMediaFile,
  uploadCoreImageMediaFile,
} from "./client.ts";
import type { DocumentMediaAsset } from "./types.ts";

describe("Media client adapter", () => {
  it("exposes client adapter behavior through the public package subpath", async () => {
    const mediaClient = await import("@dpeek/formless-media/client");

    expect(mediaClient.DOCUMENT_UPLOAD_ACCEPT).toBe(DOCUMENT_UPLOAD_ACCEPT);
    expect(mediaClient.IMAGE_UPLOAD_ACCEPT).toBe(IMAGE_UPLOAD_ACCEPT);
    expect(mediaClient.coreImageMediaAssetOptionForId("hero.webp")).toEqual({
      href: "/api/formless/media/media/images/hero.webp",
      id: "hero.webp",
      label: "hero.webp",
    });
  });

  it("preserves core image upload request and response behavior", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "hero.png", { type: "image/png" });
    const upload = {
      asset: {
        byteSize: 3,
        contentType: "image/png",
        deliveryHref: "/api/formless/media/media/images/uploaded.png",
        filename: "hero.png",
        id: "uploaded.png",
        kind: "image" as const,
        label: "hero.png",
        provider: "r2",
        status: "ready" as const,
        storageKey: "media/images/uploaded.png",
      },
      assetId: "uploaded.png",
      contentType: "image/png",
      href: "/api/formless/media/media/images/uploaded.png",
      key: "media/images/uploaded.png",
      size: 3,
    };

    await expect(
      uploadCoreImageMediaFile(file, {
        fetcher: async (input, init) => {
          expect(input).toBe("/api/formless/media/images");
          expect(init?.method).toBe("POST");
          expect(init?.headers).toEqual({ Accept: "application/json" });
          expect(init?.body).toBeInstanceOf(FormData);

          if (!(init?.body instanceof FormData)) {
            throw new Error("Expected multipart form data.");
          }

          expect(init.body.get("file")).toBe(file);

          return Response.json(upload);
        },
        readDimensions: async (uploadedFile) => {
          expect(uploadedFile).toBe(file);

          return { height: 630, width: 1200 };
        },
      }),
    ).resolves.toEqual({
      ...upload,
      dimensions: { height: 630, width: 1200 },
    });
  });

  it("preserves upload parser errors", async () => {
    await expect(
      parseImageMediaUploadResponse(
        Response.json({ error: "Unsupported image type." }, { status: 415 }),
      ),
    ).rejects.toThrow("Unsupported image type.");
    await expect(parseImageMediaUploadResponse(Response.json({}, { status: 500 }))).rejects.toThrow(
      "Image upload failed with status 500.",
    );
    await expect(
      parseImageMediaUploadResponse(Response.json({ href: "/missing" })),
    ).rejects.toThrow("Image upload returned an invalid response.");
  });

  it("preserves core image list request, response, and option mapping behavior", async () => {
    await expect(
      listCoreImageMediaAssets({
        fetcher: async (input, init) => {
          expect(input).toBe("/api/formless/media/images");
          expect(init?.headers).toEqual({ Accept: "application/json" });

          return Response.json({
            assets: [
              {
                byteSize: 4,
                contentType: "image/webp",
                deliveryHref: "/api/formless/media/media/images/cover.webp",
                filename: "cover.webp",
                height: 640,
                id: "cover.webp",
                kind: "image",
                label: "Cover",
                provider: "r2",
                status: "ready",
                storageKey: "media/images/cover.webp",
                width: 960,
              },
            ],
          });
        },
      }),
    ).resolves.toEqual([
      {
        height: 640,
        href: "/api/formless/media/media/images/cover.webp",
        id: "cover.webp",
        label: "Cover",
        width: 960,
      },
    ]);
    expect(coreImageMediaAssetOptionForId("cover.webp")).toEqual({
      href: "/api/formless/media/media/images/cover.webp",
      id: "cover.webp",
      label: "cover.webp",
    });
    expect(coreImageMediaAssetOptionForId("../cover.webp")).toBeUndefined();
  });

  it("preserves list parser errors", async () => {
    await expect(
      parseImageMediaListResponse(Response.json({ error: "List failed." }, { status: 500 })),
    ).rejects.toThrow("List failed.");
    await expect(parseImageMediaListResponse(Response.json({}, { status: 503 }))).rejects.toThrow(
      "Media asset list failed with status 503.",
    );
    await expect(parseImageMediaListResponse(Response.json({ assets: [{}] }))).rejects.toThrow(
      "Media asset list returned an invalid response.",
    );
  });

  it("uploads app-scoped documents with field identity but no caller-owned policy", async () => {
    const file = new File([new TextEncoder().encode("%PDF-1.7\nbody")], "unsafe/report.pdf", {
      type: " APPLICATION/PDF ; charset=binary ",
    });
    const target = {
      documentsPath: "/api/app-installs/verifi/verifi-prod/media/documents" as const,
      field: {
        entityName: "certificate",
        fieldName: "report asset",
      },
    };
    const asset = documentMediaAsset();

    expect(DOCUMENT_UPLOAD_ACCEPT).toBe("application/pdf");
    expect(appDocumentMediaCollectionHref(target)).toBe(
      "/api/app-installs/verifi/verifi-prod/media/documents?entity=certificate&field=report+asset",
    );

    await expect(
      uploadAppDocumentMediaFile(file, target, {
        fetcher: async (input, init) => {
          expect(input).toBe(appDocumentMediaCollectionHref(target));
          expect(init?.method).toBe("POST");
          expect(init?.headers).toEqual({ Accept: "application/json" });
          expect(init?.body).toBeInstanceOf(FormData);

          if (!(init?.body instanceof FormData)) {
            throw new Error("Expected multipart form data.");
          }

          expect([...init.body.keys()]).toEqual(["file"]);
          expect(init.body.get("file")).toBe(file);

          return Response.json({
            asset,
            assetId: asset.id,
            contentType: asset.contentType,
            href: asset.deliveryHref,
            key: asset.storageKey,
            size: asset.byteSize,
          });
        },
      }),
    ).resolves.toEqual({
      asset,
      assetId: asset.id,
      contentType: asset.contentType,
      href: asset.deliveryHref,
      key: asset.storageKey,
      size: asset.byteSize,
    });
  });

  it("lists compatible documents and projects open and download intents", async () => {
    const target = {
      documentsPath: "/api/app-installs/verifi/verifi-prod/media/documents" as const,
      field: {
        entityName: "certificate",
        fieldName: "report",
      },
    };
    const asset = documentMediaAsset();

    await expect(
      listAppDocumentMediaAssets(target, {
        fetcher: async (input, init) => {
          expect(input).toBe(
            "/api/app-installs/verifi/verifi-prod/media/documents?entity=certificate&field=report",
          );
          expect(init?.headers).toEqual({ Accept: "application/json" });

          return Response.json({ assets: [asset] });
        },
      }),
    ).resolves.toEqual([
      {
        access: "private",
        byteSize: 13,
        contentType: "application/pdf",
        downloadHref:
          "/api/app-installs/verifi/verifi-prod/media/documents/coa-fixed.pdf?download=1",
        filename: "coa.pdf",
        href: "/api/app-installs/verifi/verifi-prod/media/documents/coa-fixed.pdf",
        id: "coa-fixed.pdf",
        label: "Certificate of analysis",
      },
    ]);
    expect(documentMediaDownloadHref(`${asset.deliveryHref}?source=record#page=2`)).toBe(
      `${asset.deliveryHref}?source=record&download=1#page=2`,
    );
  });

  it("rejects invalid document upload and list responses", async () => {
    await expect(
      parseDocumentMediaUploadResponse(
        Response.json({ error: "Document denied." }, { status: 403 }),
      ),
    ).rejects.toThrow("Document denied.");
    await expect(
      parseDocumentMediaUploadResponse(
        Response.json({
          contentType: "text/plain",
          href: "/document",
          key: "document",
          size: 1,
        }),
      ),
    ).rejects.toThrow("Document upload returned an invalid response.");
    await expect(parseDocumentMediaListResponse(Response.json({ assets: [{}] }))).rejects.toThrow(
      "Document asset list returned an invalid response.",
    );
  });
});

function documentMediaAsset(): DocumentMediaAsset {
  return {
    access: "private",
    byteSize: 13,
    contentType: "application/pdf",
    deliveryHref: "/api/app-installs/verifi/verifi-prod/media/documents/coa-fixed.pdf",
    filename: "coa.pdf",
    id: "coa-fixed.pdf",
    kind: "document",
    label: "Certificate of analysis",
    ownerAppInstallId: "verifi-prod",
    provider: "r2",
    status: "ready",
    storageKey: "media/app-installs/verifi-prod/documents/coa-fixed.pdf",
  };
}
