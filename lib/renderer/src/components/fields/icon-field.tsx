import { useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Popover } from "@astryxdesign/core/Popover";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { SelectableCard } from "@astryxdesign/core/SelectableCard";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { borderVars, radiusVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import type {
  DisplayFieldContract,
  FieldIntentHandler,
  IconPickerFacts,
  IconPickerSelection,
} from "@dpeek/formless-presentation/contract";
import { MonospaceTextArea } from "../field-primitives.tsx";
import { IconPreview } from "../icon-preview.tsx";
import {
  astryxDensity,
  editorFieldValue,
  fieldDescription,
  fieldInteractionIsDisabled,
  FieldChrome,
  formatInputValue,
  type EditorField,
} from "./field-chrome.tsx";

type IconPickerMode = "catalog" | "custom";

export function IconFieldEditor({
  field,
  inputId,
  onIntent,
}: {
  field: EditorField;
  inputId: string;
  onIntent: FieldIntentHandler | undefined;
}) {
  const icon = field.icon;
  const savedValue = formatInputValue(editorFieldValue(field));
  const disabled = fieldInteractionIsDisabled(field);
  const [isOpen, setIsOpen] = useState(false);

  if (icon === undefined) {
    return (
      <FieldChrome field={field} inputId={inputId}>
        <HStack>
          <IconPreview id={inputId} isDisabled label={`Edit ${field.label}`} source={savedValue} />
        </HStack>
      </FieldChrome>
    );
  }

  const triggerLabel = `${icon.emptyValue ? "Choose" : "Edit"} ${field.label}`;
  const missingId = icon.selection.kind === "missingId" ? icon.selection.id : undefined;

  return (
    <FieldChrome field={field} inputId={inputId}>
      <HStack gap={2} vAlign="center">
        <Popover
          alignment="start"
          hasCloseButton={false}
          isEnabled={!disabled}
          isOpen={isOpen}
          label={`${field.label} icon picker`}
          onOpenChange={(open) => {
            setIsOpen(open);

            if (open) {
              emitIconDraftChange(field, savedValue, onIntent);
            } else {
              void closeIconPopover(field, icon, savedValue, onIntent);
            }
          }}
          placement="below"
          width="min(520px, calc(100vw - 64px))"
          content={
            <IconPickerPopover
              field={field}
              icon={icon}
              isOpen={isOpen}
              onSelect={() => setIsOpen(false)}
              onIntent={onIntent}
            />
          }
        >
          <IconPreview
            id={inputId}
            isDisabled={disabled}
            isLoading={Boolean(field.pending?.isPending)}
            label={triggerLabel}
            onClick={() => undefined}
            source={icon.previewSource}
            tooltip={fieldDescription(field) ?? triggerLabel}
          />
        </Popover>
        {missingId === undefined ? null : (
          <VStack gap={1}>
            <Text type="supporting">Missing icon: {missingId}</Text>
            {field.required ? null : (
              <Button
                isDisabled={disabled}
                label={`Remove ${field.label}`}
                onClick={() => void selectIconValue(field, "", () => setIsOpen(false), onIntent)}
                size="sm"
                variant="ghost"
              />
            )}
          </VStack>
        )}
      </HStack>
    </FieldChrome>
  );
}

function IconPickerPopover({
  field,
  icon,
  isOpen,
  onSelect,
  onIntent,
}: {
  field: EditorField;
  icon: IconPickerFacts;
  isOpen: boolean;
  onSelect: () => void;
  onIntent: FieldIntentHandler | undefined;
}) {
  const selectionMode = iconPickerMode(icon.selection.kind);
  const [mode, setMode] = useState<IconPickerMode>(selectionMode);
  const wasOpen = useRef(false);
  const catalogOptions =
    field.options?.iconOptions?.filter((option) => !option.custom && !option.missing) ?? [];
  const customSourceEnabled = icon.valueMode === "svgSource";

  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      setMode(selectionMode);
    }

    wasOpen.current = isOpen;
  }, [isOpen, selectionMode]);

  return (
    <VStack gap={3} width="100%">
      {customSourceEnabled ? (
        <SegmentedControl
          label={`${field.label} source`}
          layout="fill"
          onChange={(value) => setMode(value as IconPickerMode)}
          value={mode}
        >
          <SegmentedControlItem label="Catalog" value="catalog" />
          <SegmentedControlItem label="Custom" value="custom" />
        </SegmentedControl>
      ) : null}
      {!customSourceEnabled || mode === "catalog" ? (
        <Grid
          columns={{ minWidth: 88, max: 5, repeat: "fit" }}
          gap={2}
          width="100%"
          xstyle={styles.catalogGrid}
        >
          {catalogOptions.map((option) => {
            const isSelected =
              icon.selection.kind === "option" && icon.selection.optionId === option.id;

            return (
              <SelectableCard
                key={option.id}
                isSelected={isSelected}
                label={option.label}
                onChange={(nextSelected) => {
                  if (nextSelected) {
                    void selectIconValue(
                      field,
                      icon.valueMode === "svgSource" ? option.source : option.id,
                      onSelect,
                      onIntent,
                    );
                  } else if (!field.required) {
                    void selectIconValue(field, "", onSelect, onIntent);
                  }
                }}
                padding={1}
                variant="transparent"
                xstyle={styles.catalogCard}
              >
                <VStack align="center" gap={1} height="100%" justify="center" width="100%">
                  <IconPreview
                    isDecorative
                    label={option.label}
                    size="compact"
                    source={option.source}
                  />
                  <Text justify="center" maxLines={2} type="supporting">
                    {option.label}
                  </Text>
                </VStack>
              </SelectableCard>
            );
          })}
        </Grid>
      ) : (
        <Grid columns={{ minWidth: 200, max: 2, repeat: "fit" }} gap={3} width="100%">
          <MonospaceTextArea
            hasSpellCheck={false}
            isLabelHidden
            label={`${field.label} custom source`}
            onChange={(value) => emitIconDraftChange(field, value, onIntent)}
            placeholder='<svg viewBox="0 0 24 24">…</svg>'
            rows={8}
            status={
              icon.customParseError === undefined
                ? undefined
                : { message: icon.customParseError, type: "error" }
            }
            value={icon.dialogDraft}
            width="100%"
          />
          <VStack align="center" height="100%" justify="center" width="100%">
            <IconPreview label={`${field.label} preview`} size="large" source={icon.dialogDraft} />
          </VStack>
        </Grid>
      )}
    </VStack>
  );
}

export function IconFieldDisplay({ field }: { field: DisplayFieldContract }) {
  const missingId =
    field.icon?.selection.kind === "missingId" ? field.icon.selection.id : undefined;

  return (
    <HStack gap={2} vAlign="center">
      <IconPreview
        label={field.label}
        size={astryxDensity(field) === "compact" ? "compact" : "default"}
        source={field.icon?.previewSource ?? formatInputValue(field.value)}
      />
      {missingId === undefined ? null : <Text type="supporting">Missing icon: {missingId}</Text>}
    </HStack>
  );
}

function iconPickerMode(selectionKind: IconPickerSelection["kind"]): IconPickerMode {
  return selectionKind === "customSource" ? "custom" : "catalog";
}

async function closeIconPopover(
  field: EditorField,
  icon: IconPickerFacts,
  savedSource: string,
  onIntent: FieldIntentHandler | undefined,
) {
  if (icon.valueMode !== "svgSource") {
    return;
  }

  const draftIsValid =
    icon.customParseError === undefined && (!field.required || icon.dialogDraft.trim() !== "");

  if (draftIsValid && icon.dialogDraft !== savedSource) {
    await commitIconValue(field, icon.dialogDraft, onIntent);
  } else if (!draftIsValid) {
    emitIconDraftChange(field, savedSource, onIntent);
  }
}

function emitIconDraftChange(
  field: EditorField,
  value: string,
  onIntent: FieldIntentHandler | undefined,
) {
  if (field.surface === "create") {
    void onIntent?.({
      type: "createDraftChange",
      fieldName: field.fieldName,
      fieldValue: { kind: "input", value },
    });
    return;
  }

  if (field.surface === "operation") {
    void onIntent?.({
      type: "operationDraftChange",
      inputName: field.inputName,
      inputValue: { kind: "input", value },
    });
    return;
  }

  void onIntent?.({ type: "iconDialogDraftChange", fieldName: field.fieldName, value });
}

async function selectIconValue(
  field: EditorField,
  value: string,
  onSelect: () => void,
  onIntent: FieldIntentHandler | undefined,
) {
  await onIntent?.({ type: "iconDialogDraftChange", fieldName: field.fieldName, value });
  await commitIconValue(field, value, onIntent);
  onSelect();
}

async function commitIconValue(
  field: EditorField,
  value: string,
  onIntent: FieldIntentHandler | undefined,
) {
  if (field.surface === "create") {
    await onIntent?.({
      type: "createDraftChange",
      fieldName: field.fieldName,
      fieldValue: { kind: "input", value },
    });
    return;
  }

  if (field.surface === "operation") {
    await onIntent?.({
      type: "operationDraftChange",
      inputName: field.inputName,
      inputValue: { kind: "input", value },
    });
    return;
  }

  await onIntent?.({ type: "recordValueCommit", fieldName: field.fieldName, value });
}

const styles = stylex.create({
  catalogCard: {
    aspectRatio: "1 / 1",
    borderRadius: `calc(${radiusVars["--radius-element"]} + ${spacingVars["--spacing-0-5"]} + ${borderVars["--border-width"]})`,
    minHeight: 88,
    minWidth: 0,
  },
  catalogGrid: {
    boxSizing: "border-box",
    maxHeight: "min(360px, 50dvh)",
    overflowY: "auto",
    overscrollBehavior: "contain",
    padding: spacingVars["--spacing-1"],
    scrollbarGutter: "stable",
  },
});
