import * as stylex from "@stylexjs/stylex";
import type { KeyboardEvent, ReactNode } from "react";
import { Field, type FieldStatusInput } from "@astryxdesign/core/Field";
import type { FieldValue, GeneratedFieldDraftInput } from "@dpeek/formless-schema";
import type {
  FieldContract,
  FieldIntentHandler,
  RecordFieldContract,
} from "@dpeek/formless-presentation/contract";
import type { AstryxInputDensity } from "../input-density.ts";
export type EditorField = Extract<
  FieldContract,
  {
    mode: "editor";
  }
>;
export type FieldInputSize = "sm" | "md" | "lg";
export type ISODateInputValue =
  `${number}${number}${number}${number}-${number}${number}-${number}${number}`;

export function FieldChrome({
  children,
  field,
  inputId,
}: {
  children: ReactNode;
  field: FieldContract;
  inputId: string;
}) {
  return (
    <Field
      label={field.label}
      inputID={inputId}
      isLabelHidden={fieldLabelIsHidden(field)}
      isDisabled={field.access.kind === "disabled"}
      isRequired={fieldRequiredMarkerIsVisible(field)}
      status={fieldStatus(field)}
      width="100%"
    >
      {children}
    </Field>
  );
}

export function fieldChromeProps(field: EditorField) {
  return {
    label: field.label,
    isLabelHidden: fieldLabelIsHidden(field),
    description: fieldDescription(field),
    isRequired: fieldRequiredMarkerIsVisible(field),
    isDisabled: fieldInteractionIsDisabled(field),
    placeholder: field.control.label,
    status: fieldStatus(field),
    width: "100%",
  };
}

export function fieldStatus(field: FieldContract): FieldStatusInput | undefined {
  const error = field.errors?.[0];

  if (!error) {
    return undefined;
  }

  return {
    type: "error",
    ...(field.surface === "table-cell" ? {} : { message: error.message }),
  };
}

export function fieldDescription(field: FieldContract) {
  return field.access.kind === "disabled" ? field.access.disabledReason : undefined;
}

export function fieldInteractionIsDisabled(field: FieldContract) {
  return (
    field.access.kind === "disabled" ||
    field.access.kind === "readOnly" ||
    field.access.kind === "system" ||
    field.access.kind === "stateMachine" ||
    Boolean(field.pending?.isPending)
  );
}

export function fieldIsReadOnly(field: EditorField) {
  return field.access.kind !== "editable";
}

export function fieldLabelIsHidden(field: FieldContract) {
  return field.labelVisibility === "hidden";
}

function fieldRequiredMarkerIsVisible(field: FieldContract) {
  return field.mode === "editor" && field.required && field.access.kind !== "stateMachine";
}

export function inputSize(field: FieldContract): FieldInputSize {
  const density = astryxDensity(field);

  if (density === "compact") {
    return "sm";
  }

  if (density === "comfortable") {
    return "lg";
  }

  return "md";
}

export function astryxDensity(field: FieldContract): AstryxInputDensity {
  return field.density === "compact" ? "compact" : "balanced";
}

export function editorFieldValue(field: EditorField): FieldValue | string {
  if (isRecordEditorField(field)) {
    if (field.rendererKind === "checkbox" || field.rendererKind === "completion-checkbox") {
      if (field.drafts.draftInput?.kind === "value") {
        return field.drafts.draftInput.value;
      }

      return field.drafts.draft === "true";
    }

    return field.drafts.draft;
  }

  if (field.draftInput !== undefined) {
    return field.draftInput.value;
  }

  if (field.control.controlKind === "checkbox") {
    return field.control.createDefaultChecked;
  }

  return field.value ?? field.control.createDefaultValue ?? "";
}

export function emitFieldDraftChange(
  field: EditorField,
  value: FieldValue | string,
  onIntent: FieldIntentHandler | undefined,
) {
  if (field.surface === "create") {
    void onIntent?.({
      type: "createDraftChange",
      fieldName: field.fieldName,
      fieldValue: draftInputFromValue(value),
    });
    return;
  }

  if (field.surface === "operation") {
    void onIntent?.({
      type: "operationDraftChange",
      inputName: field.inputName,
      inputValue: draftInputFromValue(value),
    });
    return;
  }

  if (typeof value === "string") {
    void onIntent?.({
      type: "recordEditorDraftChange",
      fieldName: field.fieldName,
      value,
    });
    return;
  }

  void onIntent?.({
    type: "recordDraftChange",
    fieldName: field.fieldName,
    fieldValue: draftInputFromValue(value),
  });
}

export function emitRecordUnitDraftChange(
  field: RecordFieldContract,
  unit: string,
  onIntent: FieldIntentHandler | undefined,
) {
  if (!field.valueUnit) {
    return;
  }

  void onIntent?.({
    type: "recordDraftChange",
    fieldName: field.valueUnit.unitFieldName,
    fieldValue: { kind: "input", value: unit },
  });
}

export function emitRecordDraftCommit(
  field: EditorField,
  onIntent: FieldIntentHandler | undefined,
) {
  if (!isRecordEditorField(field)) {
    return;
  }

  void onIntent?.({
    type: "recordDraftCommit",
    fieldName: field.fieldName,
    fieldValue: field.drafts.draftInput ?? draftInputFromValue(field.drafts.draft),
  });
}

export function emitRecordDraftValueCommit(
  field: EditorField,
  value: FieldValue | string,
  onIntent: FieldIntentHandler | undefined,
) {
  if (!isRecordEditorField(field) || field.commit !== "field-commit") {
    return;
  }

  void onIntent?.({
    type: "recordDraftCommit",
    fieldName: field.fieldName,
    fieldValue: draftInputFromValue(value),
  });
}

export function emitRecordDraftRevert(
  field: RecordFieldContract,
  onIntent: FieldIntentHandler | undefined,
) {
  void onIntent?.({
    type: "recordDraftRevert",
    fieldName: field.fieldName,
  });
}

export function recordCommitHandlers(field: EditorField, onIntent: FieldIntentHandler | undefined) {
  return {
    commitImmediate: (value: FieldValue | string) =>
      emitImmediateRecordFieldCommit(field, value, onIntent),
    commitInput: (value: FieldValue | string) => emitRecordFieldCommit(field, value, onIntent),
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>, value: FieldValue | string) => {
      if (event.key === "Enter") {
        event.preventDefault();
        emitRecordFieldCommit(field, value, onIntent);
      }
    },
  };
}

export function valueUnitCommitHandlers(
  field: RecordFieldContract,
  onIntent: FieldIntentHandler | undefined,
) {
  return {
    commitImmediate: (value: FieldValue | string) =>
      emitImmediateValueUnitCommit(field, draftInputFromValue(value), onIntent),
    commitInput: (value: FieldValue | string) =>
      emitValueUnitCommit(field, draftInputFromValue(value), field.drafts.unitDraftInput, onIntent),
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>, value: FieldValue | string) => {
      if (event.key === "Enter") {
        event.preventDefault();
        emitValueUnitCommit(
          field,
          draftInputFromValue(value),
          field.drafts.unitDraftInput,
          onIntent,
        );
      }
    },
  };
}

export function emitImmediateRecordFieldCommit(
  field: EditorField,
  value: FieldValue | string,
  onIntent: FieldIntentHandler | undefined,
) {
  if (!isRecordEditorField(field) || field.commit !== "immediate") {
    return;
  }

  emitRecordFieldCommit(field, value, onIntent);
}

export function emitRecordFieldCommit(
  field: EditorField,
  value: FieldValue | string,
  onIntent: FieldIntentHandler | undefined,
) {
  if (!isRecordEditorField(field)) {
    return;
  }

  void onIntent?.({
    type: "recordValueCommit",
    fieldName: field.fieldName,
    value: fieldValueFromDraftValue(field, value),
  });
}

export function emitRecordFieldRevert(
  field: EditorField,
  onIntent: FieldIntentHandler | undefined,
) {
  if (!isRecordEditorField(field)) {
    return;
  }

  void onIntent?.({
    type: "recordDraftRevert",
    fieldName: field.fieldName,
  });
}

export function emitImmediateValueUnitCommit(
  field: RecordFieldContract,
  fieldDraftInput: GeneratedFieldDraftInput,
  onIntent: FieldIntentHandler | undefined,
) {
  if (field.commit !== "immediate") {
    return;
  }

  emitValueUnitCommit(field, fieldDraftInput, field.drafts.unitDraftInput, onIntent);
}

export function emitValueUnitCommit(
  field: RecordFieldContract,
  fieldDraftInput: GeneratedFieldDraftInput,
  unitDraftInput: GeneratedFieldDraftInput | undefined,
  onIntent: FieldIntentHandler | undefined,
) {
  if (!field.valueUnit) {
    return;
  }

  void onIntent?.({
    type: "recordValueUnitCommit",
    fieldName: field.fieldName,
    unitFieldName: field.valueUnit.unitFieldName,
    commit: {
      fieldDraftInput,
      unitDraftInput: unitDraftInput ?? {
        kind: "input",
        value: field.drafts.unitDraft ?? "",
      },
    },
  });
}

export function emitMediaAssetSelect(
  field: EditorField,
  assetId: string,
  onIntent: FieldIntentHandler | undefined,
) {
  if (isRecordEditorField(field)) {
    void onIntent?.({
      type: "mediaAssetSelect",
      assetId,
      fieldName: field.fieldName,
    });
    return;
  }

  emitFieldDraftChange(field, assetId, onIntent);
}

export function draftInputFromValue(value: FieldValue | string): GeneratedFieldDraftInput {
  if (typeof value === "boolean" || typeof value === "number") {
    return { kind: "value", value };
  }

  return { kind: "input", value };
}

export function fieldValueFromDraftValue(
  field: RecordFieldContract,
  value: FieldValue | string,
): FieldValue {
  if (field.field.type === "boolean") {
    return value === true || value === "true";
  }

  if (field.field.type === "number") {
    if (typeof value === "number") {
      return value;
    }

    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }

  return String(value);
}

export function numberDraftIsInvalid(field: EditorField) {
  if (field.control.controlKind !== "number") {
    return false;
  }

  const value = formatInputValue(editorFieldValue(field)).trim();

  return value !== "" && !Number.isFinite(Number(value));
}

export function dateInputValue(value: string): ISODateInputValue | undefined {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? (value as ISODateInputValue) : undefined;
}

export function numberInputValue(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

export function defaultFieldInputId(field: FieldContract) {
  return `formless-ui-field-${field.recordId ? `${field.recordId}-` : ""}${field.inputName ?? field.fieldName}`;
}

export function formatInputValue(value: FieldValue | string | undefined) {
  return value === undefined ? "" : String(value);
}

export function isRecordEditorField(field: FieldContract): field is RecordFieldContract {
  return field.mode === "editor" && field.surface !== "create" && field.surface !== "operation";
}

export const fieldChromeStyles = stylex.create({
  displayValue: {
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    minWidth: 0,
  },
});
