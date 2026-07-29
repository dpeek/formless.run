import {
  handleDocumentMediaRequest,
  mediaObjectStoreFromR2Bucket,
} from "@dpeek/formless-media/worker";

const documentsPath = "/api/app-installs/site/reports/media/documents";

export default {
  async fetch(request: Request, env: { FORMLESS_MEDIA: R2Bucket }) {
    return (
      (await handleDocumentMediaRequest(request, {
        authorizeRequest: () => ({ authorized: true }),
        compatibility: {
          acceptedMimeTypes: ["application/pdf"],
          access: "private",
          maxBytes: 1024 * 1024,
          ownerAppInstallId: "reports",
        },
        media: {
          documentsPath,
          ownerAppInstallId: "reports",
        },
        provider: "r2",
        store: mediaObjectStoreFromR2Bucket(env.FORMLESS_MEDIA),
      })) ?? Response.json({ error: "not found" }, { status: 404 })
    );
  },
};
