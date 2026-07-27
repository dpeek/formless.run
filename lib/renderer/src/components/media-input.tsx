import { useId, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { FileInput } from "@astryxdesign/core";
import { Field, type FieldStatusInput } from "@astryxdesign/core/Field";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Popover } from "@astryxdesign/core/Popover";
import { SelectableCard } from "@astryxdesign/core/SelectableCard";
import { Text } from "@astryxdesign/core/Text";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import { VStack } from "@astryxdesign/core/VStack";
import { borderVars, radiusVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import type {
  MediaDocumentPresentation,
  MissingMediaAsset,
} from "@dpeek/formless-presentation/contract";
import type { AstryxInputDensity } from "./input-density.ts";

export type MediaInputOption = {
  isDisabled?: boolean;
  label: string;
  previewUrl: string;
  value: string;
};

export type MediaInputProps = {
  label: string;
  value: string;
  accept?: string;
  density?: AstryxInputDensity;
  description?: string;
  id?: string;
  isDisabled?: boolean;
  isLabelHidden?: boolean;
  isLoading?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  labelTooltip?: string;
  maxSize?: number;
  options?: readonly MediaInputOption[];
  previewUrl?: string;
  status?: FieldStatusInput;
  width?: number | string;
  onSelectOption?: (value: string) => void;
  onUploadFile?: (file: File) => void;
};

export type DocumentMediaInputOption = {
  byteSize: number;
  contentType: string;
  filename: string;
  label: string;
  value: string;
};

export type DocumentMediaInputProps = {
  accept?: string;
  description?: string;
  document?: MediaDocumentPresentation;
  id?: string;
  isDisabled?: boolean;
  isLabelHidden?: boolean;
  isLoading?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  label: string;
  labelTooltip?: string;
  maxSize?: number;
  missingDocument?: MissingMediaAsset;
  options?: readonly DocumentMediaInputOption[];
  removalEnabled?: boolean;
  selectedValue: string;
  status?: FieldStatusInput;
  width?: number | string;
  onRemove?: () => void;
  onSelectOption?: (value: string) => void;
  onUploadFile?: (file: File) => void;
};

export function MediaInput({
  accept = "image/*",
  density = "balanced",
  description,
  id,
  isDisabled = false,
  isLabelHidden = false,
  isLoading = false,
  isReadOnly = false,
  isRequired = false,
  label,
  labelTooltip,
  maxSize,
  onSelectOption,
  onUploadFile,
  options = [],
  previewUrl,
  status,
  value,
  width,
}: MediaInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [isOpen, setIsOpen] = useState(false);
  const isPickerDisabled = isDisabled || isReadOnly || isLoading;
  const hasValue = value.trim() !== "";
  const hasPreview = hasValue && previewUrl?.trim() !== "";
  const canUpload = Boolean(onUploadFile) && !isPickerDisabled;
  const canPick = options.length > 0 && Boolean(onSelectOption) && !isPickerDisabled;
  const canOpen = canUpload || canPick;
  const trigger = (
    <Thumbnail
      id={inputId}
      alt={label}
      src={hasPreview ? previewUrl : undefined}
      isDisabled={isPickerDisabled}
      isLoading={isLoading}
      onClick={canOpen ? () => undefined : undefined}
      onRemove={
        hasValue && !isRequired && !isPickerDisabled && onSelectOption
          ? () => onSelectOption("")
          : undefined
      }
      xstyle={thumbnailSizeStyle(density)}
    />
  );

  return (
    <Field
      label={label}
      isLabelHidden={isLabelHidden}
      description={description}
      inputID={inputId}
      isRequired={isRequired}
      isDisabled={isDisabled || isReadOnly}
      labelTooltip={labelTooltip}
      status={status}
      width={width}
    >
      {canOpen ? (
        <Popover
          label={`${label} media library`}
          placement="below"
          alignment="start"
          width="min(360px, calc(100vw - 64px))"
          xstyle={styles.libraryPopover}
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          content={
            <MediaLibrary
              accept={accept}
              fieldLabel={label}
              isRequired={isRequired}
              maxSize={maxSize}
              options={canPick ? options : []}
              selectedValue={value}
              onSelect={(nextValue) => {
                onSelectOption?.(nextValue);
                setIsOpen(false);
              }}
              onUpload={
                canUpload
                  ? (file) => {
                      onUploadFile?.(file);
                      setIsOpen(false);
                    }
                  : undefined
              }
            />
          }
        >
          {trigger}
        </Popover>
      ) : (
        trigger
      )}
    </Field>
  );
}

export function MediaValueDisplay({
  density = "balanced",
  label,
  previewUrl,
  value,
}: {
  density?: AstryxInputDensity;
  label: string;
  previewUrl?: string;
  value: string;
}) {
  const hasPreview = value.trim() !== "" && previewUrl?.trim() !== "";

  return (
    <Thumbnail
      alt={label}
      src={hasPreview ? previewUrl : undefined}
      xstyle={thumbnailSizeStyle(density)}
    />
  );
}

export function DocumentMediaInput({
  accept = "application/pdf",
  description,
  document,
  id,
  isDisabled = false,
  isLabelHidden = false,
  isLoading = false,
  isReadOnly = false,
  isRequired = false,
  label,
  labelTooltip,
  maxSize,
  missingDocument,
  onRemove,
  onSelectOption,
  onUploadFile,
  options = [],
  removalEnabled = false,
  selectedValue,
  status,
  width,
}: DocumentMediaInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [isOpen, setIsOpen] = useState(false);
  const interactionDisabled = isDisabled || isReadOnly || isLoading;
  const hasValue = selectedValue.trim() !== "";
  const showsPicker = options.length > 0 && Boolean(onSelectOption);
  const showsUpload = Boolean(onUploadFile);
  const showsRemove = hasValue && removalEnabled && Boolean(onRemove) && !isRequired;
  const canPick = showsPicker && !interactionDisabled;

  return (
    <Field
      description={description}
      inputID={inputId}
      isDisabled={isDisabled || isReadOnly}
      isLabelHidden={isLabelHidden}
      isRequired={isRequired}
      label={label}
      labelTooltip={labelTooltip}
      status={status}
      width={width}
    >
      <VStack gap={2} width="100%">
        <DocumentMediaValue
          document={document}
          missingDocument={missingDocument}
          selectedValue={selectedValue}
        />
        {showsPicker || showsUpload || showsRemove ? (
          <HStack gap={2} wrap="wrap" vAlign="center">
            {showsPicker ? (
              canPick ? (
                <Popover
                  alignment="start"
                  content={
                    <DocumentMediaLibrary
                      options={options}
                      selectedValue={selectedValue}
                      onSelect={(nextValue) => {
                        onSelectOption?.(nextValue);
                        setIsOpen(false);
                      }}
                    />
                  }
                  isOpen={isOpen}
                  label={`${label} document library`}
                  onOpenChange={setIsOpen}
                  placement="below"
                  width="min(420px, calc(100vw - 64px))"
                  xstyle={styles.libraryPopover}
                >
                  <Button
                    id={inputId}
                    label={hasValue ? `Choose another ${label}` : `Choose ${label}`}
                    size="sm"
                    variant="secondary"
                  />
                </Popover>
              ) : (
                <Button
                  id={inputId}
                  isDisabled
                  label={hasValue ? `Choose another ${label}` : `Choose ${label}`}
                  size="sm"
                  variant="secondary"
                />
              )
            ) : null}
            {showsUpload ? (
              <FileInput
                accept={accept}
                isDisabled={interactionDisabled}
                isLabelHidden
                isLoading={isLoading}
                label={hasValue ? `Replace ${label}` : `Upload ${label}`}
                maxSize={maxSize}
                mode="input"
                placeholder={hasValue ? "Replace file" : "Upload file"}
                value={null}
                width="auto"
                onChange={(file) => {
                  if (file instanceof File) {
                    onUploadFile?.(file);
                  }
                }}
              />
            ) : null}
            {showsRemove ? (
              <Button
                isDisabled={interactionDisabled}
                label={`Remove ${label}`}
                onClick={onRemove}
                size="sm"
                variant="ghost"
              />
            ) : null}
          </HStack>
        ) : null}
      </VStack>
    </Field>
  );
}

export function DocumentMediaValueDisplay({
  document,
  missingDocument,
  selectedValue,
}: Pick<DocumentMediaInputProps, "document" | "missingDocument" | "selectedValue">) {
  return (
    <DocumentMediaValue
      document={document}
      missingDocument={missingDocument}
      selectedValue={selectedValue}
    />
  );
}

function DocumentMediaValue({
  document,
  missingDocument,
  selectedValue,
}: Pick<DocumentMediaInputProps, "document" | "missingDocument" | "selectedValue">) {
  if (document) {
    return (
      <Card padding={3} variant="muted" width="100%">
        <VStack gap={1} width="100%">
          <Text maxLines={2} type="body" weight="medium">
            {document.filename}
          </Text>
          <Text color="secondary" type="label">
            {document.contentType} · {formatByteSize(document.byteSize)}
          </Text>
          <HStack gap={3} wrap="wrap">
            <Link
              href={document.openIntent.href}
              isStandalone
              rel="noopener noreferrer"
              target={document.openIntent.target === "newTab" ? "_blank" : undefined}
            >
              Open
            </Link>
            <Link download={document.filename} href={document.downloadIntent.href} isStandalone>
              Download
            </Link>
          </HStack>
        </VStack>
      </Card>
    );
  }

  if (missingDocument) {
    return (
      <Card padding={3} variant="muted" width="100%">
        <VStack gap={1} width="100%">
          <Text type="body" weight="medium">
            Document unavailable
          </Text>
          <Text color="secondary" type="label">
            {missingDocument.reason ?? "The selected document could not be loaded."}
          </Text>
        </VStack>
      </Card>
    );
  }

  return (
    <Card padding={3} variant="muted" width="100%">
      <Text color="secondary" type="body">
        {selectedValue.trim() === "" ? "No document selected" : "Document unavailable"}
      </Text>
    </Card>
  );
}

function DocumentMediaLibrary({
  onSelect,
  options,
  selectedValue,
}: {
  onSelect: (value: string) => void;
  options: readonly DocumentMediaInputOption[];
  selectedValue: string;
}) {
  return (
    <VStack gap={1} padding={2} width="100%" xstyle={styles.documentLibrary}>
      {options.map((option) => (
        <SelectableCard
          key={option.value}
          isSelected={option.value === selectedValue}
          label={option.label}
          onChange={(selected) => {
            if (selected) {
              onSelect(option.value);
            }
          }}
          padding={2}
          variant="transparent"
        >
          <VStack gap={0.5} width="100%">
            <Text maxLines={2} type="body" weight="medium">
              {option.filename}
            </Text>
            <Text color="secondary" type="label">
              {option.contentType} · {formatByteSize(option.byteSize)}
            </Text>
          </VStack>
        </SelectableCard>
      ))}
    </VStack>
  );
}

function formatByteSize(byteSize: number) {
  if (byteSize < 1024) {
    return `${byteSize} B`;
  }

  const kibibytes = byteSize / 1024;
  if (kibibytes < 1024) {
    return `${formatByteUnit(kibibytes)} KiB`;
  }

  return `${formatByteUnit(kibibytes / 1024)} MiB`;
}

function formatByteUnit(value: number) {
  return value >= 10 ? Math.round(value).toString() : value.toFixed(1);
}

function MediaLibrary({
  accept,
  fieldLabel,
  isRequired,
  maxSize,
  onSelect,
  onUpload,
  options,
  selectedValue,
}: {
  accept: string;
  fieldLabel: string;
  isRequired: boolean;
  maxSize?: number;
  options: readonly MediaInputOption[];
  selectedValue: string;
  onSelect: (value: string) => void;
  onUpload?: (file: File) => void;
}) {
  return (
    <Grid columns={{ minWidth: 72, max: 4, repeat: "fit" }} gap={2} xstyle={styles.libraryGrid}>
      {onUpload === undefined ? null : (
        <FileInput
          accept={accept}
          isLabelHidden
          label={`Upload ${fieldLabel}`}
          maxSize={maxSize}
          mode="dropzone"
          placeholder="Upload"
          value={null}
          width="100%"
          xstyle={styles.uploadTile}
          onChange={(file) => {
            if (file instanceof File) {
              onUpload(file);
            }
          }}
        />
      )}
      {options.map((option) => {
        const isSelected = option.value === selectedValue;
        const accessibilityLabel = option.label;

        return (
          <SelectableCard
            key={option.value}
            label={accessibilityLabel}
            isDisabled={option.isDisabled}
            isSelected={isSelected}
            padding={0.5}
            variant="transparent"
            xstyle={styles.libraryCard}
            onChange={(nextSelected) => {
              if (nextSelected) {
                onSelect(option.value);
              } else if (!isRequired) {
                onSelect("");
              }
            }}
          >
            <Thumbnail
              alt={accessibilityLabel}
              isDisabled={option.isDisabled}
              src={option.previewUrl}
              xstyle={styles.libraryThumbnail}
            />
          </SelectableCard>
        );
      })}
    </Grid>
  );
}

function thumbnailSizeStyle(density: AstryxInputDensity) {
  if (density === "compact") {
    return styles.compactThumbnail;
  }

  if (density === "comfortable") {
    return styles.comfortableThumbnail;
  }

  return undefined;
}

const styles = stylex.create({
  compactThumbnail: {
    width: 48,
  },
  comfortableThumbnail: {
    width: 96,
  },
  libraryThumbnail: {
    display: "flex",
    width: "100%",
  },
  libraryCard: {
    borderRadius: `calc(${radiusVars["--radius-element"]} + ${spacingVars["--spacing-0-5"]} + ${borderVars["--border-width"]})`,
  },
  libraryPopover: {
    borderRadius: radiusVars["--radius-container"],
    overflow: "hidden",
    padding: 0,
  },
  libraryGrid: {
    boxSizing: "border-box",
    maxHeight: "min(300px, 50dvh)",
    overflowY: "auto",
    overscrollBehavior: "contain",
    padding: spacingVars["--spacing-3"],
    scrollbarGutter: "stable",
    width: "100%",
  },
  documentLibrary: {
    boxSizing: "border-box",
    maxHeight: "min(320px, 50dvh)",
    overflowY: "auto",
    overscrollBehavior: "contain",
    scrollbarGutter: "stable",
  },
  uploadTile: {
    aspectRatio: "1",
    backgroundColor: "transparent",
    borderRadius: `calc(${radiusVars["--radius-element"]} + ${spacingVars["--spacing-0-5"]} + ${borderVars["--border-width"]})`,
    gap: spacingVars["--spacing-1"],
    paddingBlock: spacingVars["--spacing-1"],
    paddingInline: spacingVars["--spacing-1"],
    width: "100%",
  },
});
