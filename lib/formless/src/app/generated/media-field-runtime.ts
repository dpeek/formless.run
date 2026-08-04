import {
  documentMediaAssetOptionFromAsset,
  listProgramDocumentMediaAssets,
  listCoreImageMediaAssets,
  uploadProgramDocumentMediaFile,
  uploadCoreImageMediaFile,
  type DocumentMediaUploadResponse,
  type MediaAssetOption,
  type UploadedImageMedia,
} from "@dpeek/formless-media/client";
import { imageMediaAssetOptionFromUpload } from "./record-field-authoring.ts";
import {
  generatedDocumentMediaTarget,
  generatedMediaFieldKey,
  type GeneratedMediaField,
} from "./media-field-model.ts";

export type GeneratedMediaFileUpload = {
  option: MediaAssetOption;
  upload: DocumentMediaUploadResponse | UploadedImageMedia;
};

export type GeneratedMediaUploadFailure = { code: "upload-failed" };

export function generatedMediaUploadFailure(_error: unknown): GeneratedMediaUploadFailure {
  return { code: "upload-failed" };
}

export function generatedMediaUploadFailureMessage(failure: GeneratedMediaUploadFailure): string {
  switch (failure.code) {
    case "upload-failed":
      return "Media upload failed. Try again.";
  }
}

export async function loadGeneratedMediaAssetOptions(
  fields: readonly GeneratedMediaField[],
): Promise<Record<string, MediaAssetOption[]>> {
  const imageFields = fields.filter((field) => field.field.asset === undefined);
  const imageOptions =
    imageFields.length === 0 ? [] : await listCoreImageMediaAssets().catch(() => []);
  const entries = await Promise.all(
    fields.map(async (field) => {
      const key = generatedMediaFieldKey(field.entityName, field.fieldName);
      if (field.field.asset?.kind !== "document") {
        return [key, imageOptions] as const;
      }
      const target = generatedDocumentMediaTarget(field.entityName, field.fieldName);
      const options = await listProgramDocumentMediaAssets(target).catch(() => []);
      return [key, options] as const;
    }),
  );

  return Object.fromEntries(entries);
}

export async function uploadGeneratedMediaFile({
  entityName,
  field,
  fieldName,
  file,
}: GeneratedMediaField & {
  file: File;
}): Promise<GeneratedMediaFileUpload> {
  if (field.asset?.kind === "document") {
    const target = generatedDocumentMediaTarget(entityName, fieldName);
    const upload = await uploadProgramDocumentMediaFile(file, target);
    if (!upload.asset) {
      throw new Error("Document upload did not return a media asset.");
    }
    return {
      option: documentMediaAssetOptionFromAsset(upload.asset),
      upload,
    };
  }

  const upload = await uploadCoreImageMediaFile(file);
  const option = imageMediaAssetOptionFromUpload(upload);
  if (!option) {
    throw new Error("Image upload did not return a media asset id.");
  }
  return { option, upload };
}
