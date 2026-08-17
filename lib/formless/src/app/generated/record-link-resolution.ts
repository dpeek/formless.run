import { coreImageMediaDeliveryHrefForAssetId } from "@dpeek/formless-media";
import type { RecordLinkResolutionOptions } from "@dpeek/formless-schema";

export function generatedRecordLinkResolutionOptions(
  instanceOrigin: string | undefined,
): RecordLinkResolutionOptions {
  return {
    mediaHrefForAssetId: (assetId) =>
      instanceOrigin === undefined
        ? undefined
        : coreImageMediaDeliveryHrefForAssetId(assetId, instanceOrigin),
  };
}
