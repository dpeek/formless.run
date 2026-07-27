import type {
  DisplayFieldContract,
  FieldIntentHandler,
  MediaAuthoring,
} from "@dpeek/formless-presentation/contract";
import {
  DocumentMediaInput,
  DocumentMediaValueDisplay,
  MediaInput,
  MediaValueDisplay,
} from "../media-input.tsx";
import {
  astryxDensity,
  editorFieldValue,
  emitMediaAssetSelect,
  fieldChromeProps,
  fieldIsReadOnly,
  formatInputValue,
  type EditorField,
} from "./field-chrome.tsx";
import {
  documentMediaPickerOptions,
  fieldPresentsDocumentMedia,
  mediaPickerOptions,
  mediaPreviewHref,
} from "./field-options.tsx";

export function MediaFieldEditor({
  field,
  inputId,
  onIntent,
}: {
  field: EditorField;
  inputId: string;
  onIntent: FieldIntentHandler | undefined;
}) {
  const value = formatInputValue(editorFieldValue(field));
  const media = mediaAuthoring(field);
  const fileSelectEnabled = media?.fileSelectEnabled === true;

  if (fieldPresentsDocumentMedia(field)) {
    return (
      <DocumentMediaInput
        id={inputId}
        {...fieldChromeProps(field)}
        accept={media?.accept}
        document={field.media?.document}
        isLoading={Boolean(field.pending?.isPending)}
        isReadOnly={fieldIsReadOnly(field)}
        maxSize={media?.maxSize}
        missingDocument={field.media?.missingSelectedAsset}
        options={documentMediaPickerOptions(field.options)}
        removalEnabled={media?.removalEnabled === true}
        selectedValue={value}
        onRemove={() => emitMediaAssetSelect(field, "", onIntent)}
        onSelectOption={(assetId) => emitMediaAssetSelect(field, assetId, onIntent)}
        onUploadFile={
          !fileSelectEnabled || media?.uploadEnabled !== true
            ? undefined
            : (file) =>
                void onIntent?.({
                  type: "mediaFileSelect",
                  fieldName: field.fieldName,
                  file,
                })
        }
      />
    );
  }

  return (
    <MediaInput
      id={inputId}
      {...fieldChromeProps(field)}
      accept={media?.accept ?? "image/*"}
      density={astryxDensity(field)}
      isLoading={Boolean(field.pending?.isPending)}
      isReadOnly={fieldIsReadOnly(field)}
      maxSize={media?.maxSize}
      options={mediaPickerOptions(field.options)}
      previewUrl={mediaPreviewHref(field)}
      value={value}
      onSelectOption={(assetId) => emitMediaAssetSelect(field, assetId, onIntent)}
      onUploadFile={
        !fileSelectEnabled
          ? undefined
          : (file) =>
              void onIntent?.({
                type: "mediaFileSelect",
                fieldName: field.fieldName,
                file,
              })
      }
    />
  );
}

export function MediaFieldDisplay({ field }: { field: DisplayFieldContract }) {
  if (fieldPresentsDocumentMedia(field)) {
    return (
      <DocumentMediaValueDisplay
        document={field.media?.document}
        missingDocument={field.media?.missingSelectedAsset}
        selectedValue={formatInputValue(field.value)}
      />
    );
  }

  return (
    <MediaValueDisplay
      density={astryxDensity(field)}
      label={field.label}
      previewUrl={mediaPreviewHref(field)}
      value={formatInputValue(field.value)}
    />
  );
}

function mediaAuthoring(field: EditorField): MediaAuthoring | undefined {
  return field.media && "fileSelectEnabled" in field.media ? field.media : undefined;
}
