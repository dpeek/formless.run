import * as stylex from "@stylexjs/stylex";
import { colorVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import type {
  EnumOption,
  EnumValuePresentation,
  FieldContract,
  FieldPresentationColorIntent,
  FieldOptions,
  MediaAssetOption,
} from "@dpeek/formless-presentation/contract";
import { SourceIcon } from "../field-primitives.tsx";
import { editorFieldValue, formatInputValue, type EditorField } from "./field-chrome.tsx";

export type SelectorVisualOption = {
  color?: string;
  colorIntent?: FieldPresentationColorIntent;
  colorToken?: string;
  detail?: string;
  label: string;
  source?: string;
  value: string;
};

export function selectorVisualOptions(field: EditorField): SelectorVisualOption[] {
  if (field.control.kind === "enum") {
    return (field.options?.enumOptions ?? []).map(enumOptionToSelectorVisualOption);
  }

  return [];
}

export function enumOptionForValue(
  options: FieldOptions | undefined,
  value: string,
): SelectorVisualOption | undefined {
  return options?.enumOptions
    ?.map(enumOptionToSelectorVisualOption)
    .find((option) => option.value === value);
}

export function enumOptionToSelectorVisualOption(option: EnumOption): SelectorVisualOption {
  return enumValuePresentationToSelectorVisualOption(option.presentation, option.value);
}

export function enumValuePresentationToSelectorVisualOption(
  presentation: EnumValuePresentation,
  value: string,
): SelectorVisualOption {
  return {
    color: enumPresentationColor(presentation.color.intent),
    colorIntent: presentation.color.intent,
    colorToken: presentation.color.token,
    label: presentation.label,
    source: presentation.icon?.source,
    value,
  };
}

export function mediaPickerOptions(options: FieldOptions | undefined) {
  return (options?.mediaAssetOptions ?? [])
    .filter((option) => option.missing !== true && option.href.trim() !== "")
    .map((option) => ({
      label: option.label,
      previewUrl: option.href,
      value: option.id,
    }));
}

export function documentMediaPickerOptions(options: FieldOptions | undefined) {
  return (options?.mediaAssetOptions ?? [])
    .filter(
      (
        option,
      ): option is MediaAssetOption & {
        byteSize: number;
        contentType: string;
        filename: string;
      } =>
        option.missing !== true &&
        typeof option.byteSize === "number" &&
        typeof option.contentType === "string" &&
        typeof option.filename === "string",
    )
    .map((option) => ({
      byteSize: option.byteSize,
      contentType: option.contentType,
      filename: option.filename,
      label: option.label,
      value: option.id,
    }));
}

export function fieldPresentsDocumentMedia(field: FieldContract) {
  if (field.media?.document !== undefined) {
    return true;
  }

  if (
    field.options?.mediaAssetOptions?.some(
      (option) =>
        option.filename !== undefined ||
        option.contentType !== undefined ||
        option.downloadHref !== undefined,
    )
  ) {
    return true;
  }

  return (
    field.mode === "editor" &&
    field.media?.accept !== undefined &&
    field.media.accept
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .every((value) => value !== "" && !value.startsWith("image/"))
  );
}

export function selectedMediaAsset(field: FieldContract): MediaAssetOption | undefined {
  const value =
    field.mode === "display"
      ? formatInputValue(field.value)
      : formatInputValue(editorFieldValue(field));

  return field.options?.mediaAssetOptions?.find((option) => option.id === value);
}

export function mediaPreviewHref(field: FieldContract) {
  const value =
    field.mode === "display"
      ? formatInputValue(field.value)
      : formatInputValue(editorFieldValue(field));

  if (value === "") {
    return undefined;
  }

  const selectedAsset = selectedMediaAsset(field);

  if (selectedAsset?.href) {
    return selectedAsset.href;
  }

  if (field.media?.selectedAssetId === value) {
    return field.media.previewHref;
  }

  return undefined;
}

function enumPresentationColor(intent: FieldPresentationColorIntent) {
  if (intent === "success") {
    return colorVars["--color-success"];
  }

  if (intent === "warning") {
    return colorVars["--color-warning"];
  }

  if (intent === "danger") {
    return colorVars["--color-error"];
  }

  return undefined;
}

export function enumPresentationTriggerContent(field: FieldContract): "label" | "both" {
  return field.enum?.kind === "editor" ? field.enum.triggerContent : "label";
}

export function enumPresentationListContent(field: FieldContract): "icon" | "label" | "both" {
  return field.enum?.kind === "editor" ? field.enum.listContent : "label";
}
export function selectorOptionVisual(
  option: SelectorVisualOption | undefined,
  {
    reserveSpace = false,
  }: {
    reserveSpace?: boolean;
  } = {},
) {
  if (!option) {
    return reserveSpace ? (
      <span aria-hidden="true" {...stylex.props(styles.optionVisualSpacer)} />
    ) : undefined;
  }

  if (option.source) {
    return option.color ? (
      <span {...stylex.props(dynamicStyles.color(option.color))}>
        <SourceIcon source={option.source} size="sm" color="inherit" aria-hidden />
      </span>
    ) : (
      <SourceIcon source={option.source} size="sm" color="secondary" aria-hidden />
    );
  }

  return reserveSpace ? (
    <span aria-hidden="true" {...stylex.props(styles.optionVisualSpacer)} />
  ) : undefined;
}

export function hasSelectorOptionVisual(option: SelectorVisualOption) {
  return Boolean(option.source);
}

const styles = stylex.create({
  optionVisualSpacer: {
    flexShrink: 0,
    width: spacingVars["--spacing-4"],
    height: spacingVars["--spacing-4"],
  },
});

const dynamicStyles = stylex.create({
  color: (color: string) => ({
    color,
  }),
});
