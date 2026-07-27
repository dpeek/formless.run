import {
  documentMediaAssetOptionFromAsset,
  listAppDocumentMediaAssets,
  listCoreImageMediaAssets,
  uploadAppDocumentMediaFile,
  uploadCoreImageMediaFile,
  type DocumentMediaUploadResponse,
  type MediaAssetOption,
  type UploadedImageMedia,
} from "@dpeek/formless-media/client";
import type { ClientAppTarget } from "../../client/app-target.ts";
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

export async function loadGeneratedMediaAssetOptions(
  fields: readonly GeneratedMediaField[],
  appTarget: ClientAppTarget,
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
      const target = generatedDocumentMediaTarget(appTarget, field.entityName, field.fieldName);
      const options =
        target === undefined ? [] : await listAppDocumentMediaAssets(target).catch(() => []);
      return [key, options] as const;
    }),
  );

  return Object.fromEntries(entries);
}

export async function uploadGeneratedMediaFile({
  appTarget,
  entityName,
  field,
  fieldName,
  file,
}: GeneratedMediaField & {
  appTarget: ClientAppTarget;
  file: File;
}): Promise<GeneratedMediaFileUpload> {
  if (field.asset?.kind === "document") {
    const target = generatedDocumentMediaTarget(appTarget, entityName, fieldName);
    if (!target) {
      throw new Error("Document media is available only for an installed app.");
    }
    const upload = await uploadAppDocumentMediaFile(file, target);
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
