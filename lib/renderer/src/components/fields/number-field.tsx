import * as stylex from "@stylexjs/stylex";
import { InputGroup, InputGroupText } from "@astryxdesign/core/InputGroup";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { KeyboardEvent } from "react";
import type {
  DisplayFieldContract,
  FieldIntentHandler,
} from "@dpeek/formless-presentation/contract";
import {
  draftInputFromValue,
  editorFieldValue,
  emitFieldDraftChange,
  emitRecordDraftCommit,
  emitRecordDraftRevert,
  emitRecordUnitDraftChange,
  emitValueUnitCommit,
  fieldChromeProps,
  fieldChromeStyles,
  fieldDescription,
  fieldInteractionIsDisabled,
  fieldLabelIsHidden,
  fieldStatus,
  formatInputValue,
  inputSize,
  isRecordEditorField,
  type EditorField,
} from "./field-chrome.tsx";

export function NumberFieldEditor({
  field,
  showUnit,
  onIntent,
}: {
  field: EditorField;
  showUnit: boolean;
  onIntent: FieldIntentHandler | undefined;
}) {
  const recordField = isRecordEditorField(field) ? field : undefined;
  const valueUnit = showUnit ? recordField?.valueUnit : undefined;
  const draft = formatInputValue(editorFieldValue(field));
  const format = recordField?.formatting.format ?? field.format ?? "plain";
  const inputValue = numberInputText(draft, format);
  const prefix = format === "currency" ? "$" : undefined;
  const formatSuffix = format === "percent" ? "%" : undefined;
  const suffix = recordField?.formatting.suffix ?? field.suffix;
  const disabled = fieldInteractionIsDisabled(field);
  const grouped =
    valueUnit !== undefined ||
    prefix !== undefined ||
    formatSuffix !== undefined ||
    suffix !== undefined;

  function commitDraft() {
    if (recordField && valueUnit) {
      emitValueUnitCommit(
        recordField,
        recordField.drafts.draftInput ?? draftInputFromValue(inputValue),
        recordField.drafts.unitDraftInput,
        onIntent,
      );
      return;
    }

    emitRecordDraftCommit(field, onIntent);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitDraft();
      return;
    }

    if (event.key === "Escape" && recordField) {
      event.preventDefault();
      emitRecordDraftRevert(recordField, onIntent);
    }
  }

  const input = (
    <TextInput
      {...fieldChromeProps(field)}
      hasClear={false}
      isLabelHidden={grouped || fieldLabelIsHidden(field)}
      label={grouped ? "Value" : field.label}
      placeholder={undefined}
      size={inputSize(field)}
      value={inputValue}
      onBlur={commitDraft}
      onChange={(value) => emitFieldDraftChange(field, value, onIntent)}
      onKeyDown={handleKeyDown}
    />
  );

  if (!grouped) {
    return input;
  }

  return (
    <InputGroup
      description={fieldDescription(field)}
      isDisabled={disabled}
      isLabelHidden={fieldLabelIsHidden(field)}
      isRequired={field.required}
      label={field.label}
      size={inputSize(field)}
      status={fieldStatus(field)}
      xstyle={styles.inputGroup}
    >
      {prefix ? <InputGroupText>{prefix}</InputGroupText> : null}
      {input}
      {formatSuffix ? <InputGroupText>{formatSuffix}</InputGroupText> : null}
      {suffix ? <InputGroupText>{suffix}</InputGroupText> : null}
      {recordField && valueUnit ? (
        <ValueUnitSelector field={recordField} onIntent={onIntent} />
      ) : null}
    </InputGroup>
  );
}

function ValueUnitSelector({
  field,
  onIntent,
}: {
  field: Extract<
    EditorField,
    {
      surface: "detail" | "record";
    }
  >;
  onIntent: FieldIntentHandler | undefined;
}) {
  const valueUnit = field.valueUnit;

  if (!valueUnit) {
    return null;
  }

  const options = valueUnit.options.map((option) => ({
    label: option.label,
    value: option.value,
  }));
  const unitDraft = field.drafts.unitDraft ?? "";
  const commonProps = {
    isDisabled: fieldInteractionIsDisabled(field),
    isLabelHidden: true,
    isRequired: valueUnit.required,
    label: "Unit",
    options,
    placeholder: "",
    size: inputSize(field),
    value: unitDraft || undefined,
    xstyle: styles.unitSelector,
  } as const;
  const onChange = (unit: string) => {
    emitRecordUnitDraftChange(field, unit, onIntent);
    emitValueUnitCommit(
      field,
      field.drafts.draftInput ?? draftInputFromValue(field.drafts.draft),
      { kind: "input", value: unit },
      onIntent,
    );
  };

  return valueUnit.clearable ? (
    <Selector
      {...commonProps}
      hasClear
      value={unitDraft || null}
      onChange={(unit) => onChange(unit ?? "")}
    />
  ) : (
    <Selector {...commonProps} onChange={onChange} />
  );
}

export function NumberFieldDisplay({ field }: { field: DisplayFieldContract }) {
  const suffix = field.formatting.suffix ?? field.suffix;
  return (
    <div {...stylex.props(fieldChromeStyles.displayValue, styles.displayValue)}>
      <Text type="body" maxLines={2}>
        {field.formatting.displayValue}
      </Text>
      {suffix && field.formatting.displayValue ? (
        <Text type="body" color="secondary">
          {suffix}
        </Text>
      ) : null}
    </div>
  );
}

function numberInputText(value: string, format: DisplayFieldContract["formatting"]["format"]) {
  const trimmed = value.trim();

  if (format === "currency") {
    return trimmed.replace(/^\$/, "");
  }

  if (format === "percent") {
    return trimmed.replace(/%$/, "");
  }

  return value;
}

const styles = stylex.create({
  inputGroup: {
    width: "100%",
  },
  unitSelector: {
    flexBasis: "5rem",
    flexGrow: 0,
  },
  displayValue: {
    gap: 4,
  },
});
