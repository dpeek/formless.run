import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type {
  DisplayFieldContract,
  FieldContract,
  FieldIntentHandler,
  RecordFieldRendererKind,
} from "@dpeek/formless-presentation/contract";
import { BooleanFieldDisplay, BooleanFieldEditor } from "./boolean-field.tsx";
import { AutosizeTextFieldEditor } from "./autosize-text-field.tsx";
import { ColorFieldDisplay, ColorFieldEditor } from "./color-field.tsx";
import { DateFieldDisplay, DateFieldEditor } from "./date-field.tsx";
import { EnumFieldDisplay, EnumFieldEditor } from "./enum-field.tsx";
import {
  defaultFieldInputId,
  editorFieldValue,
  fieldLabelIsHidden,
  formatInputValue,
  isRecordEditorField,
  type EditorField,
} from "./field-chrome.tsx";
import { IconFieldDisplay, IconFieldEditor } from "./icon-field.tsx";
import { MediaFieldDisplay, MediaFieldEditor } from "./media-field.tsx";
import { NumberFieldDisplay, NumberFieldEditor } from "./number-field.tsx";
import { ReferenceFieldDisplay, ReferenceFieldEditor } from "./reference-field.tsx";
import { StateMachineField } from "./state-machine-field.tsx";
import {
  MarkdownFieldDisplayValue,
  MarkdownFieldEditor,
  TextareaFieldEditor,
  TextFieldDisplay,
  TextFieldEditor,
} from "./text-field.tsx";

type FieldRendererProps = {
  field: FieldContract;
  inputId?: string;
  onIntent?: FieldIntentHandler;
};

export function FieldRenderer({
  field,
  inputId = defaultFieldInputId(field),
  onIntent,
}: FieldRendererProps) {
  let renderer;

  if (field.stateMachineFacts !== undefined) {
    renderer = <StateMachineField field={field} inputId={inputId} onIntent={onIntent} />;
  } else if (field.mode === "display") {
    renderer = <DisplayField field={field} />;
  } else {
    renderer = <FieldEditor field={field} inputId={inputId} onIntent={onIntent} />;
  }

  return renderer;
}

export function FieldSubmitFormAdapter({ field }: { field: FieldContract }) {
  if (field.mode !== "editor" || field.commit !== "submit") {
    return null;
  }

  return (
    <input
      name={field.inputName ?? field.fieldName}
      readOnly
      type="hidden"
      value={formatInputValue(editorFieldValue(field))}
    />
  );
}

function DisplayField({ field }: { field: DisplayFieldContract }) {
  return (
    <VStack gap={fieldLabelIsHidden(field) ? 0 : 1} width="100%">
      {fieldLabelIsHidden(field) ? null : (
        <Text color="secondary" display="block" type="label" weight="medium">
          {field.label}
        </Text>
      )}
      <FieldDisplay field={field} />
    </VStack>
  );
}

function FieldEditor({
  field,
  inputId,
  onIntent,
}: {
  field: EditorField;
  inputId: string;
  onIntent: FieldIntentHandler | undefined;
}) {
  const route = editorRoute(field);

  if (route === "markdown") {
    return <MarkdownFieldEditor field={field} onIntent={onIntent} />;
  }

  if (route === "autosize-text") {
    return <AutosizeTextFieldEditor field={field} inputId={inputId} onIntent={onIntent} />;
  }

  if (route === "textarea") {
    return <TextareaFieldEditor field={field} onIntent={onIntent} />;
  }

  if (route === "color") {
    return <ColorFieldEditor field={field} inputId={inputId} onIntent={onIntent} />;
  }

  if (route === "media") {
    return <MediaFieldEditor field={field} inputId={inputId} onIntent={onIntent} />;
  }

  if (route === "checkbox" || route === "completion-checkbox") {
    return <BooleanFieldEditor field={field} onIntent={onIntent} />;
  }

  if (route === "enum" || route === "enum-icon") {
    return <EnumFieldEditor field={field} onIntent={onIntent} />;
  }

  if (route === "reference") {
    return <ReferenceFieldEditor field={field} onIntent={onIntent} />;
  }

  if (route === "date" || route === "quiet-date") {
    return <DateFieldEditor field={field} isQuiet={route === "quiet-date"} onIntent={onIntent} />;
  }

  if (route === "number" || route === "value-unit") {
    return (
      <NumberFieldEditor field={field} showUnit={route === "value-unit"} onIntent={onIntent} />
    );
  }

  if (route === "icon") {
    return <IconFieldEditor field={field} inputId={inputId} onIntent={onIntent} />;
  }

  return <TextFieldEditor field={field} onIntent={onIntent} />;
}

function FieldDisplay({ field }: { field: DisplayFieldContract }) {
  if (!fieldHasDisplayValue(field)) {
    return (
      <Text color="secondary" type="body">
        —
      </Text>
    );
  }

  if (field.control.kind === "date" || field.formatting.temporal !== undefined) {
    return <DateFieldDisplay field={field} />;
  }

  if (field.control.kind === "number") {
    return <NumberFieldDisplay field={field} />;
  }

  if (field.control.controlKind === "checkbox") {
    return <BooleanFieldDisplay field={field} />;
  }

  if (field.control.kind === "enum") {
    return <EnumFieldDisplay field={field} />;
  }

  if (field.control.kind === "reference") {
    return <ReferenceFieldDisplay field={field} />;
  }

  if (field.control.controlKind === "color") {
    return <ColorFieldDisplay field={field} />;
  }

  if (field.control.controlKind === "media") {
    return <MediaFieldDisplay field={field} />;
  }

  if (field.control.controlKind === "markdown") {
    return <MarkdownFieldDisplayValue field={field} />;
  }

  if (field.control.controlKind === "icon") {
    return <IconFieldDisplay field={field} />;
  }

  return <TextFieldDisplay field={field} />;
}

function fieldHasDisplayValue(field: DisplayFieldContract) {
  if (field.value !== undefined && (typeof field.value !== "string" || field.value.trim() !== "")) {
    return true;
  }

  return field.formatting.displayValue !== undefined && field.formatting.displayValue.trim() !== "";
}

function editorRoute(
  field: EditorField,
): RecordFieldRendererKind | EditorField["control"]["controlKind"] {
  if (isRecordEditorField(field)) {
    return field.rendererKind;
  }

  if (field.editor === "enum") {
    return "enum";
  }

  return field.control.controlKind;
}
