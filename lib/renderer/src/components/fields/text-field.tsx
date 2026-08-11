import * as stylex from "@stylexjs/stylex";
import type { KeyboardEvent } from "react";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import type {
  DisplayFieldContract,
  FieldIntentHandler,
} from "@dpeek/formless-presentation/contract";
import {
  editorFieldValue,
  emitFieldDraftChange,
  emitRecordFieldCommit,
  emitRecordFieldRevert,
  fieldChromeProps,
  fieldChromeStyles,
  fieldIsReadOnly,
  formatInputValue,
  inputSize,
  type EditorField,
} from "./field-chrome.tsx";
import { MarkdownFieldDisplay, MarkdownInput } from "../field-primitives.tsx";
import { OpenTextTypeahead } from "../open-text-typeahead.tsx";

export function TextFieldEditor({
  field,
  onIntent,
}: {
  field: EditorField;
  onIntent: FieldIntentHandler | undefined;
}) {
  const suggestions = field.options?.textSuggestions;

  if (suggestions?.length) {
    return (
      <OpenTextTypeahead
        {...fieldChromeProps(field)}
        hasClear={!field.required}
        isLoading={Boolean(field.pending?.isPending)}
        size={inputSize(field)}
        suggestions={suggestions}
        value={formatInputValue(editorFieldValue(field))}
        onBlur={(value) => emitRecordFieldCommit(field, value, onIntent)}
        onEnter={(value) => emitRecordFieldCommit(field, value, onIntent)}
        onEscape={() => emitRecordFieldRevert(field, onIntent)}
        onValueChange={(value) => emitFieldDraftChange(field, value, onIntent)}
      />
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      emitRecordFieldCommit(field, event.currentTarget.value, onIntent);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      emitRecordFieldRevert(field, onIntent);
    }
  }

  return (
    <TextInput
      {...fieldChromeProps(field)}
      hasClear={!field.required}
      isLoading={Boolean(field.pending?.isPending)}
      size={inputSize(field)}
      value={formatInputValue(editorFieldValue(field))}
      onBlur={(event) =>
        emitRecordFieldCommit(field, (event.currentTarget as HTMLInputElement).value, onIntent)
      }
      onChange={(value) => emitFieldDraftChange(field, value, onIntent)}
      onKeyDown={handleKeyDown}
    />
  );
}

export function TextareaFieldEditor({
  field,
  onIntent,
}: {
  field: EditorField;
  onIntent: FieldIntentHandler | undefined;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      emitRecordFieldRevert(field, onIntent);
    }
  }

  return (
    <TextArea
      {...fieldChromeProps(field)}
      isLoading={Boolean(field.pending?.isPending)}
      placeholder={undefined}
      size={inputSize(field)}
      rows={field.surface === "operation" ? 4 : undefined}
      value={formatInputValue(editorFieldValue(field))}
      onBlur={(event) => emitRecordFieldCommit(field, event.currentTarget.value, onIntent)}
      onChange={(value) => emitFieldDraftChange(field, value, onIntent)}
      onKeyDown={handleKeyDown}
    />
  );
}

export function MarkdownFieldEditor({
  field,
  onIntent,
}: {
  field: EditorField;
  onIntent: FieldIntentHandler | undefined;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      emitRecordFieldRevert(field, onIntent);
    }
  }

  return (
    <MarkdownInput
      {...fieldChromeProps(field)}
      isLoading={Boolean(field.pending?.isPending)}
      isReadOnly={fieldIsReadOnly(field)}
      rows={6}
      size={inputSize(field)}
      value={formatInputValue(editorFieldValue(field))}
      onBlur={() => emitRecordFieldCommit(field, editorFieldValue(field), onIntent)}
      onChange={(value) => emitFieldDraftChange(field, value, onIntent)}
      onKeyDown={handleKeyDown}
    />
  );
}

export function TextFieldDisplay({ field }: { field: DisplayFieldContract }) {
  const suffix = field.formatting.suffix ?? field.suffix;

  return (
    <div {...stylex.props(fieldChromeStyles.displayValue, styles.displayValue)}>
      <Text type="body" maxLines={field.control.controlKind === "textarea" ? undefined : 2}>
        {field.formatting.displayValue}
      </Text>
      {suffix && field.formatting.displayValue ? (
        <Text color="secondary" type="body">
          {suffix}
        </Text>
      ) : null}
    </div>
  );
}

export function MarkdownFieldDisplayValue({ field }: { field: DisplayFieldContract }) {
  return <MarkdownFieldDisplay value={field.formatting.displayValue} />;
}

const styles = stylex.create({
  displayValue: {
    gap: 4,
  },
});
