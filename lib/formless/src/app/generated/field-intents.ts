import { generatedFieldDraftInput as schemaGeneratedFieldDraftInput } from "@dpeek/formless-schema";
import type { GeneratedFieldDraftInput, TableColumnFormat } from "@dpeek/formless-schema";
import type { FieldValue, RecordValues } from "@dpeek/formless-storage";
import type { FieldIntent, FieldIntentHandler } from "@dpeek/formless-presentation/contract";
import type { RecordFieldConfig, RecordUnionPresentationConfig } from "../../client/views.ts";
import {
  nextGeneratedCreateDraftSessionState,
  type GeneratedCreateDraftSessionState,
} from "./create-field-authoring.ts";
import {
  nextGeneratedOperationDraftSessionState,
  type GeneratedOperationDraftSessionState,
} from "./operation-field-authoring.ts";
import {
  fieldValueToRecordFieldEditorInputValue,
  generatedRecordFieldEditorDraftFromUpdateDraftInput,
  generatedRecordFieldUsesUpdateDraftResolver,
  generatedUpdateDraftInputFromEditorDraft,
  generatedUpdateDraftInputFromFieldValue,
  nextGeneratedUpdateDraftSessionState,
  resolveGeneratedUpdateDraftPatchValues,
  resolveGeneratedValueUnitUpdateDraftPatchValues,
  selectGeneratedRecordFieldPatchValues,
  type GeneratedUpdateDraftFieldInput,
  type GeneratedUpdateDraftResolution,
  type GeneratedUpdateDraftSessionState,
} from "./record-field-authoring.ts";
import { inputValueToFieldValue } from "./format.ts";
import { selectRecordFieldsForActiveUnionValues } from "./union-presentation.ts";
type CreateDraftChangeIntent = Extract<
  FieldIntent,
  {
    type: "createDraftChange";
  }
>;
type OperationDraftChangeIntent = Extract<
  FieldIntent,
  {
    type: "operationDraftChange";
  }
>;
type RecordDraftChangeIntent = Extract<
  FieldIntent,
  {
    type: "recordDraftChange";
  }
>;
type RecordEditorDraftChangeIntent = Extract<
  FieldIntent,
  {
    type: "recordEditorDraftChange";
  }
>;
type RecordDraftRevertIntent = Extract<
  FieldIntent,
  {
    type: "recordDraftRevert";
  }
>;
type RecordDraftCommitIntent = Extract<
  FieldIntent,
  {
    type: "recordDraftCommit";
  }
>;
type RecordValueCommitIntent = Extract<
  FieldIntent,
  {
    type: "recordValueCommit";
  }
>;
type RecordValueUnitCommitIntent = Extract<
  FieldIntent,
  {
    type: "recordValueUnitCommit";
  }
>;
type FieldErrorChangeIntent = Extract<
  FieldIntent,
  {
    type: "fieldErrorChange";
  }
>;
type IconDialogDraftChangeIntent = Extract<
  FieldIntent,
  {
    type: "iconDialogDraftChange";
  }
>;
type IconDialogOpenChangeIntent = Extract<
  FieldIntent,
  {
    type: "iconDialogOpenChange";
  }
>;
type IconDialogCancelIntent = Extract<
  FieldIntent,
  {
    type: "iconDialogCancel";
  }
>;
type IconDialogSaveIntent = Extract<
  FieldIntent,
  {
    type: "iconDialogSave";
  }
>;
type MediaAssetSelectIntent = Extract<
  FieldIntent,
  {
    type: "mediaAssetSelect";
  }
>;
type MediaFileSelectIntent = Extract<
  FieldIntent,
  {
    type: "mediaFileSelect";
  }
>;
type StateTransitionInvokeIntent = Extract<
  FieldIntent,
  {
    type: "stateTransitionInvoke";
  }
>;
export type GeneratedFieldErrorChange = {
  fieldName: string;
  message: string | null;
};

export type GeneratedCreateDraftChange = {
  fieldName: string;
  fieldValue: GeneratedFieldDraftInput;
};

export type GeneratedOperationDraftChange = {
  inputName: string;
  inputValue: GeneratedFieldDraftInput | undefined;
};

export type GeneratedRecordDraftChange = {
  fieldName: string;
  fieldValue: GeneratedUpdateDraftFieldInput | undefined;
};

export type GeneratedEditorDraftChange = {
  fieldName: string;
  value: string;
};

export type GeneratedIconDialogDraftChange = {
  fieldName: string;
  value: string;
};

export type GeneratedIconDialogOpenChange = {
  fieldName: string;
  open: boolean;
};

export type GeneratedMediaFileSelect = {
  fieldName: string;
  file: File | undefined;
};

export type GeneratedCreateDraftChangeResult = {
  kind: "createDraftChange";
  draftChange: GeneratedCreateDraftChange;
  fieldErrorChange: GeneratedFieldErrorChange | undefined;
  state: GeneratedCreateDraftSessionState | undefined;
};

export type GeneratedOperationDraftChangeResult = {
  kind: "operationDraftChange";
  draftChange: GeneratedOperationDraftChange;
  fieldErrorChange: GeneratedFieldErrorChange | undefined;
  state: GeneratedOperationDraftSessionState | undefined;
};

export type GeneratedRecordDraftChangeResult = {
  additionalDraftChanges?: readonly GeneratedRecordDraftChange[];
  kind: "recordDraftChange" | "recordEditorDraftChange" | "recordDraftRevert";
  draftChange: GeneratedRecordDraftChange;
  editorDraftChange: GeneratedEditorDraftChange | undefined;
  fieldErrorChange: GeneratedFieldErrorChange | undefined;
  state: GeneratedUpdateDraftSessionState | undefined;
};

export type GeneratedRecordValueCommitResult = {
  kind: "recordValueCommit";
  draftChange: GeneratedRecordDraftChange | undefined;
  fieldName: string;
  fieldErrorChange: GeneratedFieldErrorChange | undefined;
  noop: boolean;
  patchValues: Partial<RecordValues>;
  resolution: GeneratedUpdateDraftResolution | undefined;
};

export type GeneratedRecordValueUnitCommitResult = {
  kind: "recordValueUnitCommit";
  draftChange: GeneratedRecordDraftChange;
  fieldName: string;
  fieldErrorChange: GeneratedFieldErrorChange | undefined;
  noop: boolean;
  patchValues: Partial<RecordValues>;
  resolution: GeneratedUpdateDraftResolution;
};

export type GeneratedFieldErrorChangeResult = {
  kind: "fieldErrorChange";
  fieldErrorChange: GeneratedFieldErrorChange;
};

export type GeneratedIconDialogDraftChangeResult = {
  kind: "iconDialogDraftChange";
  iconDialogDraftChange: GeneratedIconDialogDraftChange;
};

export type GeneratedIconDialogOpenChangeResult = {
  kind: "iconDialogOpenChange";
  iconDialogOpenChange: GeneratedIconDialogOpenChange;
};

export type GeneratedIconDialogCancelResult = {
  kind: "iconDialogCancel";
  iconDialogDraftChange: GeneratedIconDialogDraftChange;
  iconDialogOpenChange: GeneratedIconDialogOpenChange;
};

export type GeneratedIconDialogSaveResult = {
  kind: "iconDialogSave";
  commit: GeneratedRecordValueCommitResult;
  onCommitSuccess:
    | {
        editorDraftChange: GeneratedEditorDraftChange;
        iconDialogOpenChange: GeneratedIconDialogOpenChange;
      }
    | undefined;
};

export type GeneratedMediaAssetSelectResult = {
  kind: "mediaAssetSelect";
  commit: GeneratedRecordValueCommitResult | undefined;
  editorDraftChange: GeneratedEditorDraftChange | undefined;
  reason: string | undefined;
};

export type GeneratedMediaFileSelectResult = {
  kind: "mediaFileSelect";
  fileSelect: GeneratedMediaFileSelect;
};

export type GeneratedStateTransitionDeferredResult = {
  kind: "stateTransitionDeferred";
  intent: StateTransitionInvokeIntent;
  reason: string;
};

export type GeneratedUnsupportedIntentResult = {
  kind: "unsupported";
  intentType: FieldIntent["type"];
  reason: string;
};

export type GeneratedFieldIntentResult =
  | GeneratedCreateDraftChangeResult
  | GeneratedFieldErrorChangeResult
  | GeneratedIconDialogCancelResult
  | GeneratedIconDialogDraftChangeResult
  | GeneratedIconDialogOpenChangeResult
  | GeneratedIconDialogSaveResult
  | GeneratedMediaAssetSelectResult
  | GeneratedMediaFileSelectResult
  | GeneratedOperationDraftChangeResult
  | GeneratedRecordDraftChangeResult
  | GeneratedRecordValueCommitResult
  | GeneratedRecordValueUnitCommitResult
  | GeneratedStateTransitionDeferredResult
  | GeneratedUnsupportedIntentResult;

export type AdaptGeneratedCreateDraftChangeOptions = {
  clearFieldError?: boolean;
  state?: GeneratedCreateDraftSessionState;
};

export type AdaptGeneratedOperationDraftChangeOptions = {
  clearFieldError?: boolean;
  state?: GeneratedOperationDraftSessionState;
};

export type AdaptGeneratedRecordIntentOptions = {
  editorDraftByFieldName?: Readonly<Record<string, string | undefined>>;
  fields: readonly RecordFieldConfig[];
  iconDialogDraftByFieldName?: Readonly<Record<string, string | undefined>>;
  numberFormatByFieldName?: Readonly<Record<string, TableColumnFormat | undefined>>;
  recordDraftByFieldName?: Readonly<Record<string, string | undefined>>;
  state: GeneratedUpdateDraftSessionState;
  union?: RecordUnionPresentationConfig;
};

export type AdaptGeneratedFieldIntentOptions = {
  create?: AdaptGeneratedCreateDraftChangeOptions;
  operation?: AdaptGeneratedOperationDraftChangeOptions;
  record?: AdaptGeneratedRecordIntentOptions;
};

export type GeneratedFieldIntentCallbacks = {
  onCreateDraftChange?: (
    change: GeneratedCreateDraftChange,
    state: GeneratedCreateDraftSessionState | undefined,
  ) => void;
  onFieldErrorChange?: (change: GeneratedFieldErrorChange) => void;
  onIconDialogDraftChange?: (change: GeneratedIconDialogDraftChange) => void;
  onIconDialogOpenChange?: (change: GeneratedIconDialogOpenChange) => void;
  onMediaFileSelect?: (select: GeneratedMediaFileSelect) => void;
  onOperationDraftChange?: (
    change: GeneratedOperationDraftChange,
    state: GeneratedOperationDraftSessionState | undefined,
  ) => void;
  onRecordDraftChange?: (
    change: GeneratedRecordDraftChange,
    state: GeneratedUpdateDraftSessionState | undefined,
  ) => void;
  onRecordEditorDraftChange?: (change: GeneratedEditorDraftChange) => void;
  onRecordPatchResolve?: (
    fieldName: string,
    result: GeneratedRecordValueCommitResult | GeneratedRecordValueUnitCommitResult,
  ) => void;
  onUnsupportedIntent?: (
    result: GeneratedStateTransitionDeferredResult | GeneratedUnsupportedIntentResult,
  ) => void;
};

export function adaptGeneratedCreateDraftChange(
  intent: CreateDraftChangeIntent,
  options: AdaptGeneratedCreateDraftChangeOptions = {},
): GeneratedCreateDraftChangeResult {
  const draftChange = {
    fieldName: intent.fieldName,
    fieldValue: intent.fieldValue,
  };

  return {
    kind: "createDraftChange",
    draftChange,
    fieldErrorChange:
      options.clearFieldError === false ? undefined : clearFieldError(intent.fieldName),
    state:
      options.state === undefined
        ? undefined
        : nextGeneratedCreateDraftSessionState({
            fieldName: intent.fieldName,
            fieldValue: intent.fieldValue,
            state: options.state,
          }),
  };
}

export function adaptGeneratedOperationDraftChange(
  intent: OperationDraftChangeIntent,
  options: AdaptGeneratedOperationDraftChangeOptions = {},
): GeneratedOperationDraftChangeResult {
  const draftChange = {
    inputName: intent.inputName,
    inputValue: intent.inputValue,
  };

  return {
    kind: "operationDraftChange",
    draftChange,
    fieldErrorChange:
      options.clearFieldError === false ? undefined : clearFieldError(intent.inputName),
    state:
      options.state === undefined
        ? undefined
        : nextGeneratedOperationDraftSessionState({
            inputName: intent.inputName,
            inputValue: intent.inputValue,
            state: options.state,
          }),
  };
}

export function adaptGeneratedRecordDraftChange(
  intent: RecordDraftChangeIntent,
  options: AdaptGeneratedRecordIntentOptions,
): GeneratedRecordDraftChangeResult {
  return recordDraftChangeResult({
    draftChange: {
      fieldName: intent.fieldName,
      fieldValue: intent.fieldValue,
    },
    editorDraftChange: undefined,
    fieldErrorChange: undefined,
    kind: "recordDraftChange",
    state: options.state,
  });
}

export function adaptGeneratedRecordEditorDraftChange(
  intent: RecordEditorDraftChangeIntent,
  options: AdaptGeneratedRecordIntentOptions,
): GeneratedFieldIntentResult {
  const fieldConfig = findRecordFieldConfig(options, intent.fieldName);

  if (fieldConfig === undefined) {
    return unsupportedIntent(intent, `Record field "${intent.fieldName}" is not available.`);
  }

  const fieldValue = generatedUpdateDraftInputFromEditorDraft({
    fieldConfig,
    numberFormat: numberFormatForField(fieldConfig, options),
    value: intent.value,
  });

  return recordDraftChangeResult({
    draftChange: {
      fieldName: intent.fieldName,
      fieldValue,
    },
    editorDraftChange: {
      fieldName: intent.fieldName,
      value: intent.value,
    },
    fieldErrorChange: undefined,
    kind: "recordEditorDraftChange",
    state: options.state,
  });
}

export function adaptGeneratedRecordDraftRevert(
  intent: RecordDraftRevertIntent,
  options: AdaptGeneratedRecordIntentOptions,
): GeneratedFieldIntentResult {
  const fieldConfig = findRecordFieldConfig(options, intent.fieldName);

  if (fieldConfig === undefined) {
    return unsupportedIntent(intent, `Record field "${intent.fieldName}" is not available.`);
  }

  const additionalDraftChanges = fieldConfig.valueUnit
    ? [{ fieldName: fieldConfig.valueUnit.unitFieldName, fieldValue: undefined }]
    : [];
  const state = additionalDraftChanges.reduce(
    (nextState, change) =>
      nextGeneratedUpdateDraftSessionState({
        fieldName: change.fieldName,
        fieldValue: change.fieldValue,
        state: nextState,
      }),
    options.state,
  );

  return recordDraftChangeResult({
    additionalDraftChanges,
    draftChange: {
      fieldName: intent.fieldName,
      fieldValue: undefined,
    },
    editorDraftChange: {
      fieldName: intent.fieldName,
      value: recordDraftForField(fieldConfig, options),
    },
    fieldErrorChange: undefined,
    kind: "recordDraftRevert",
    state,
  });
}

export function adaptGeneratedRecordDraftCommit(
  intent: RecordDraftCommitIntent,
  options: AdaptGeneratedRecordIntentOptions,
): GeneratedRecordValueCommitResult | GeneratedUnsupportedIntentResult {
  const fieldConfig = findRecordFieldConfig(options, intent.fieldName);

  if (fieldConfig === undefined) {
    return unsupportedIntent(intent, `Record field "${intent.fieldName}" is not available.`);
  }

  if (!generatedRecordFieldUsesUpdateDraftResolver(fieldConfig)) {
    return recordValueCommitResult({
      fieldConfig,
      options,
      value: intent.fieldValue.value,
    });
  }

  return recordDraftCommitResult({ fieldConfig, fieldValue: intent.fieldValue, options });
}

export function adaptGeneratedRecordValueCommit(
  intent: RecordValueCommitIntent,
  options: AdaptGeneratedRecordIntentOptions,
): GeneratedFieldIntentResult {
  const fieldConfig = findRecordFieldConfig(options, intent.fieldName);

  if (fieldConfig === undefined) {
    return unsupportedIntent(intent, `Record field "${intent.fieldName}" is not available.`);
  }

  return recordValueCommitResult({
    fieldConfig,
    options,
    value: intent.value,
  });
}

export function adaptGeneratedRecordValueUnitCommit(
  intent: RecordValueUnitCommitIntent,
  options: AdaptGeneratedRecordIntentOptions,
): GeneratedFieldIntentResult {
  const fieldConfig = findRecordFieldConfig(options, intent.fieldName);

  if (fieldConfig === undefined) {
    return unsupportedIntent(intent, `Record field "${intent.fieldName}" is not available.`);
  }

  if (fieldConfig.valueUnit === undefined) {
    return unsupportedIntent(intent, `Record field "${intent.fieldName}" has no value unit.`);
  }

  if (fieldConfig.valueUnit.unitFieldName !== intent.unitFieldName) {
    return unsupportedIntent(
      intent,
      `Record field "${intent.fieldName}" uses unit field "${fieldConfig.valueUnit.unitFieldName}".`,
    );
  }

  const resolution = resolveGeneratedValueUnitUpdateDraftPatchValues({
    baselineValues: options.state.baselineValues,
    draft: { values: { ...options.state.draft.values } },
    fieldConfig: {
      ...fieldConfig,
      valueUnit: fieldConfig.valueUnit,
    },
    fieldDraftInput: intent.commit.fieldDraftInput,
    fields: recordFields(options),
    union: options.union,
    unitDraftInput: intent.commit.unitDraftInput,
  });
  const fieldError = selectFieldError(resolution, intent.fieldName);

  return {
    kind: "recordValueUnitCommit",
    draftChange: {
      fieldName: intent.fieldName,
      fieldValue: intent.commit.fieldDraftInput,
    },
    fieldName: intent.fieldName,
    fieldErrorChange:
      fieldError === undefined ? undefined : fieldErrorChange(intent.fieldName, fieldError.message),
    noop: fieldError === undefined && Object.keys(resolution.patchValues).length === 0,
    patchValues: fieldError === undefined ? resolution.patchValues : {},
    resolution,
  };
}

export function adaptGeneratedFieldErrorChange(
  intent: FieldErrorChangeIntent,
): GeneratedFieldErrorChangeResult {
  return {
    kind: "fieldErrorChange",
    fieldErrorChange: fieldErrorChange(intent.fieldName, intent.message),
  };
}

export function adaptGeneratedIconDialogDraftChange(
  intent: IconDialogDraftChangeIntent,
): GeneratedIconDialogDraftChangeResult {
  return {
    kind: "iconDialogDraftChange",
    iconDialogDraftChange: {
      fieldName: intent.fieldName,
      value: intent.value,
    },
  };
}

export function adaptGeneratedIconDialogOpenChange(
  intent: IconDialogOpenChangeIntent,
): GeneratedIconDialogOpenChangeResult {
  return {
    kind: "iconDialogOpenChange",
    iconDialogOpenChange: {
      fieldName: intent.fieldName,
      open: intent.open,
    },
  };
}

export function adaptGeneratedIconDialogCancel(
  intent: IconDialogCancelIntent,
  options: AdaptGeneratedRecordIntentOptions,
): GeneratedFieldIntentResult {
  const fieldConfig = findRecordFieldConfig(options, intent.fieldName);

  if (fieldConfig === undefined) {
    return unsupportedIntent(intent, `Record field "${intent.fieldName}" is not available.`);
  }

  return {
    kind: "iconDialogCancel",
    iconDialogDraftChange: {
      fieldName: intent.fieldName,
      value: recordDraftForField(fieldConfig, options),
    },
    iconDialogOpenChange: {
      fieldName: intent.fieldName,
      open: false,
    },
  };
}

export function adaptGeneratedIconDialogSave(
  intent: IconDialogSaveIntent,
  options: AdaptGeneratedRecordIntentOptions,
): GeneratedFieldIntentResult {
  const fieldConfig = findRecordFieldConfig(options, intent.fieldName);

  if (fieldConfig === undefined) {
    return unsupportedIntent(intent, `Record field "${intent.fieldName}" is not available.`);
  }

  const dialogDraft = iconDialogDraftForField(fieldConfig, options);
  const commit = recordValueCommitResult({
    fieldConfig,
    options,
    value: inputValueToFieldValue(fieldConfig.field, dialogDraft),
  });

  return {
    kind: "iconDialogSave",
    commit,
    onCommitSuccess:
      commit.fieldErrorChange === undefined
        ? {
            editorDraftChange: {
              fieldName: intent.fieldName,
              value: dialogDraft,
            },
            iconDialogOpenChange: {
              fieldName: intent.fieldName,
              open: false,
            },
          }
        : undefined,
  };
}

export function adaptGeneratedMediaAssetSelect(
  intent: MediaAssetSelectIntent,
  options: AdaptGeneratedRecordIntentOptions,
): GeneratedFieldIntentResult {
  const fieldConfig = findRecordFieldConfig(options, intent.fieldName);

  if (fieldConfig === undefined) {
    return unsupportedIntent(intent, `Record field "${intent.fieldName}" is not available.`);
  }

  return {
    kind: "mediaAssetSelect",
    commit: recordValueCommitResult({
      fieldConfig,
      options,
      value: intent.assetId,
    }),
    editorDraftChange: {
      fieldName: intent.fieldName,
      value: intent.assetId,
    },
    reason: undefined,
  };
}

export function adaptGeneratedMediaFileSelect(
  intent: MediaFileSelectIntent,
): GeneratedMediaFileSelectResult {
  return {
    kind: "mediaFileSelect",
    fileSelect: {
      fieldName: intent.fieldName,
      file: intent.file,
    },
  };
}

export function adaptGeneratedStateTransitionInvoke(
  intent: StateTransitionInvokeIntent,
): GeneratedStateTransitionDeferredResult {
  return {
    kind: "stateTransitionDeferred",
    intent,
    reason:
      "State transition execution requires the generated operation-control binding; the field intent contract carries field intent facts only.",
  };
}

export function adaptGeneratedFieldIntent(
  intent: FieldIntent,
  options: AdaptGeneratedFieldIntentOptions = {},
): GeneratedFieldIntentResult {
  switch (intent.type) {
    case "createDraftChange":
      return adaptGeneratedCreateDraftChange(intent, options.create);
    case "operationDraftChange":
      return adaptGeneratedOperationDraftChange(intent, options.operation);
    case "recordDraftChange":
      return options.record === undefined
        ? missingRecordContext(intent)
        : adaptGeneratedRecordDraftChange(intent, options.record);
    case "recordEditorDraftChange":
      return options.record === undefined
        ? missingRecordContext(intent)
        : adaptGeneratedRecordEditorDraftChange(intent, options.record);
    case "recordDraftRevert":
      return options.record === undefined
        ? missingRecordContext(intent)
        : adaptGeneratedRecordDraftRevert(intent, options.record);
    case "recordDraftCommit":
      return options.record === undefined
        ? missingRecordContext(intent)
        : adaptGeneratedRecordDraftCommit(intent, options.record);
    case "recordValueCommit":
      return options.record === undefined
        ? missingRecordContext(intent)
        : adaptGeneratedRecordValueCommit(intent, options.record);
    case "recordValueUnitCommit":
      return options.record === undefined
        ? missingRecordContext(intent)
        : adaptGeneratedRecordValueUnitCommit(intent, options.record);
    case "fieldErrorChange":
      return adaptGeneratedFieldErrorChange(intent);
    case "iconDialogDraftChange":
      return adaptGeneratedIconDialogDraftChange(intent);
    case "iconDialogOpenChange":
      return adaptGeneratedIconDialogOpenChange(intent);
    case "iconDialogCancel":
      return options.record === undefined
        ? missingRecordContext(intent)
        : adaptGeneratedIconDialogCancel(intent, options.record);
    case "iconDialogSave":
      return options.record === undefined
        ? missingRecordContext(intent)
        : adaptGeneratedIconDialogSave(intent, options.record);
    case "mediaAssetSelect":
      return options.record === undefined
        ? missingRecordContext(intent)
        : adaptGeneratedMediaAssetSelect(intent, options.record);
    case "mediaFileSelect":
      return adaptGeneratedMediaFileSelect(intent);
    case "stateTransitionInvoke":
      return adaptGeneratedStateTransitionInvoke(intent);
  }
}

export function createGeneratedFieldIntentHandler({
  callbacks,
  options,
}: {
  callbacks: GeneratedFieldIntentCallbacks;
  options?: AdaptGeneratedFieldIntentOptions;
}): FieldIntentHandler {
  return (intent) => {
    applyGeneratedFieldIntentResult(adaptGeneratedFieldIntent(intent, options), callbacks);
  };
}

export function applyGeneratedFieldIntentResult(
  result: GeneratedFieldIntentResult,
  callbacks: GeneratedFieldIntentCallbacks,
) {
  switch (result.kind) {
    case "createDraftChange":
      callbacks.onCreateDraftChange?.(result.draftChange, result.state);
      applyFieldErrorChange(result.fieldErrorChange, callbacks);
      return;
    case "operationDraftChange":
      callbacks.onOperationDraftChange?.(result.draftChange, result.state);
      applyFieldErrorChange(result.fieldErrorChange, callbacks);
      return;
    case "recordDraftChange":
    case "recordEditorDraftChange":
    case "recordDraftRevert":
      callbacks.onRecordDraftChange?.(result.draftChange, result.state);
      for (const change of result.additionalDraftChanges ?? []) {
        callbacks.onRecordDraftChange?.(change, result.state);
      }
      if (result.editorDraftChange) {
        callbacks.onRecordEditorDraftChange?.(result.editorDraftChange);
      }
      applyFieldErrorChange(result.fieldErrorChange, callbacks);
      return;
    case "recordValueCommit":
    case "recordValueUnitCommit":
      applyFieldErrorChange(result.fieldErrorChange, callbacks);
      callbacks.onRecordPatchResolve?.(result.fieldName, result);
      return;
    case "fieldErrorChange":
      callbacks.onFieldErrorChange?.(result.fieldErrorChange);
      return;
    case "iconDialogDraftChange":
      callbacks.onIconDialogDraftChange?.(result.iconDialogDraftChange);
      return;
    case "iconDialogOpenChange":
      callbacks.onIconDialogOpenChange?.(result.iconDialogOpenChange);
      return;
    case "iconDialogCancel":
      callbacks.onIconDialogDraftChange?.(result.iconDialogDraftChange);
      callbacks.onIconDialogOpenChange?.(result.iconDialogOpenChange);
      return;
    case "iconDialogSave":
      applyGeneratedFieldIntentResult(result.commit, callbacks);
      return;
    case "mediaAssetSelect":
      if (result.commit !== undefined) {
        applyGeneratedFieldIntentResult(result.commit, callbacks);
      }
      return;
    case "mediaFileSelect":
      callbacks.onMediaFileSelect?.(result.fileSelect);
      return;
    case "stateTransitionDeferred":
    case "unsupported":
      callbacks.onUnsupportedIntent?.(result);
      return;
  }
}

function recordDraftChangeResult({
  additionalDraftChanges,
  draftChange,
  editorDraftChange,
  fieldErrorChange,
  kind,
  state,
}: {
  additionalDraftChanges?: readonly GeneratedRecordDraftChange[];
  draftChange: GeneratedRecordDraftChange;
  editorDraftChange: GeneratedEditorDraftChange | undefined;
  fieldErrorChange: GeneratedFieldErrorChange | undefined;
  kind: GeneratedRecordDraftChangeResult["kind"];
  state: GeneratedUpdateDraftSessionState;
}): GeneratedRecordDraftChangeResult {
  return {
    additionalDraftChanges,
    kind,
    draftChange,
    editorDraftChange,
    fieldErrorChange,
    state: nextGeneratedUpdateDraftSessionState({
      fieldName: draftChange.fieldName,
      fieldValue: draftChange.fieldValue,
      state,
    }),
  };
}

function recordValueCommitResult({
  fieldConfig,
  options,
  value,
}: {
  fieldConfig: RecordFieldConfig;
  options: AdaptGeneratedRecordIntentOptions;
  value: FieldValue;
}): GeneratedRecordValueCommitResult {
  if (!generatedRecordFieldUsesUpdateDraftResolver(fieldConfig)) {
    const patchValues = selectGeneratedRecordFieldPatchValues({
      currentValues: options.state.baselineValues,
      values: { [fieldConfig.fieldName]: value },
    });

    return {
      kind: "recordValueCommit",
      draftChange: undefined,
      fieldName: fieldConfig.fieldName,
      fieldErrorChange: undefined,
      noop: Object.keys(patchValues).length === 0,
      patchValues,
      resolution: undefined,
    };
  }

  const fieldValue = generatedUpdateDraftInputFromFieldValue(value);
  const resolution = resolveGeneratedUpdateDraftPatchValues({
    baselineValues: options.state.baselineValues,
    draft: {
      values: {
        ...options.state.draft.values,
        [fieldConfig.fieldName]: fieldValue,
      },
    },
    fieldNames: [fieldConfig.fieldName],
    fields: recordFields(options),
    union: options.union,
  });
  const fieldError = selectFieldError(resolution, fieldConfig.fieldName);
  const patchValues = fieldError === undefined ? resolution.patchValues : {};

  return {
    kind: "recordValueCommit",
    draftChange: {
      fieldName: fieldConfig.fieldName,
      fieldValue,
    },
    fieldName: fieldConfig.fieldName,
    fieldErrorChange:
      fieldError === undefined
        ? undefined
        : fieldErrorChange(fieldConfig.fieldName, fieldError.message),
    noop: fieldError === undefined && Object.keys(patchValues).length === 0,
    patchValues,
    resolution,
  };
}

function recordDraftCommitResult({
  fieldConfig,
  fieldValue,
  options,
}: {
  fieldConfig: RecordFieldConfig;
  fieldValue: GeneratedUpdateDraftFieldInput;
  options: AdaptGeneratedRecordIntentOptions;
}): GeneratedRecordValueCommitResult {
  const resolution = resolveGeneratedUpdateDraftPatchValues({
    baselineValues: options.state.baselineValues,
    draft: {
      values: {
        ...options.state.draft.values,
        [fieldConfig.fieldName]: fieldValue,
      },
    },
    fieldNames: [fieldConfig.fieldName],
    fields: recordFields(options),
    union: options.union,
  });
  const fieldError = selectFieldError(resolution, fieldConfig.fieldName);
  const patchValues = fieldError === undefined ? resolution.patchValues : {};

  return {
    kind: "recordValueCommit",
    draftChange: {
      fieldName: fieldConfig.fieldName,
      fieldValue,
    },
    fieldName: fieldConfig.fieldName,
    fieldErrorChange:
      fieldError === undefined
        ? undefined
        : fieldErrorChange(fieldConfig.fieldName, fieldError.message),
    noop: fieldError === undefined && Object.keys(patchValues).length === 0,
    patchValues,
    resolution,
  };
}

function findRecordFieldConfig(
  options: AdaptGeneratedRecordIntentOptions,
  fieldName: string,
): RecordFieldConfig | undefined {
  return recordFields(options).find((fieldConfig) => fieldConfig.fieldName === fieldName);
}

function recordFields(options: AdaptGeneratedRecordIntentOptions): RecordFieldConfig[] {
  return selectRecordFieldsForActiveUnionValues(
    Array.from(options.fields),
    options.union,
    options.state.baselineValues,
  );
}

function numberFormatForField(
  fieldConfig: RecordFieldConfig,
  options: AdaptGeneratedRecordIntentOptions,
): TableColumnFormat {
  return options.numberFormatByFieldName?.[fieldConfig.fieldName] ?? fieldConfig.format ?? "plain";
}

function editorDraftForField(
  fieldConfig: RecordFieldConfig,
  options: AdaptGeneratedRecordIntentOptions,
): string {
  const provided = options.editorDraftByFieldName?.[fieldConfig.fieldName];

  if (provided !== undefined) {
    return provided;
  }

  return generatedRecordFieldEditorDraftFromUpdateDraftInput({
    draftInput: options.state.draft.values[fieldConfig.fieldName],
    fieldConfig,
    numberFormat: numberFormatForField(fieldConfig, options),
    recordValue: options.state.baselineValues[fieldConfig.fieldName],
  });
}

function iconDialogDraftForField(
  fieldConfig: RecordFieldConfig,
  options: AdaptGeneratedRecordIntentOptions,
): string {
  return (
    options.iconDialogDraftByFieldName?.[fieldConfig.fieldName] ??
    editorDraftForField(fieldConfig, options)
  );
}

function recordDraftForField(
  fieldConfig: RecordFieldConfig,
  options: AdaptGeneratedRecordIntentOptions,
): string {
  const provided = options.recordDraftByFieldName?.[fieldConfig.fieldName];

  if (provided !== undefined) {
    return provided;
  }

  return fieldValueToRecordFieldEditorInputValue(
    fieldConfig.field,
    options.state.baselineValues[fieldConfig.fieldName],
    numberFormatForField(fieldConfig, options),
  );
}

function selectFieldError(resolution: GeneratedUpdateDraftResolution, fieldName: string) {
  return resolution.fieldErrors[fieldName] ?? Object.values(resolution.fieldErrors)[0];
}

function clearFieldError(fieldName: string): GeneratedFieldErrorChange {
  return fieldErrorChange(fieldName, null);
}

function fieldErrorChange(fieldName: string, message: string | null): GeneratedFieldErrorChange {
  return { fieldName, message };
}

function applyFieldErrorChange(
  change: GeneratedFieldErrorChange | undefined,
  callbacks: GeneratedFieldIntentCallbacks,
) {
  if (change !== undefined) {
    callbacks.onFieldErrorChange?.(change);
  }
}

function missingRecordContext(intent: FieldIntent): GeneratedUnsupportedIntentResult {
  return unsupportedIntent(intent, "Record intent adaptation requires generated record context.");
}

function unsupportedIntent(intent: FieldIntent, reason: string): GeneratedUnsupportedIntentResult {
  return {
    kind: "unsupported",
    intentType: intent.type,
    reason,
  };
}

export function generatedFieldDraftInput(
  value: Parameters<typeof schemaGeneratedFieldDraftInput>[0],
): GeneratedFieldDraftInput {
  return schemaGeneratedFieldDraftInput(value);
}
