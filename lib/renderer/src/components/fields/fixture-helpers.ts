import type {
  FieldEditor,
  FieldEditorControl,
  FieldInputAttributes,
  FieldRef,
  FieldSchema,
  FieldValue,
  GeneratedFieldDraftInput,
  PublicSafeOperationInputField,
  StateMachineSchema,
} from "@dpeek/formless-schema";
import {
  parseNumberInputValue,
  resolveGeneratedFieldDraftValue,
  validateAuthorityFieldValue,
} from "@dpeek/formless-schema";
import type {
  CreateFieldContract,
  ColorFacts,
  DisplayFieldContract,
  EnumFacts,
  EnumOption,
  FieldContract,
  FieldAccess,
  FieldControl,
  FieldError,
  FieldIntent,
  FieldOptions,
  FieldPending,
  IconPickerSelection,
  MediaAssetOption,
  MediaAuthoring,
  MediaPresentation,
  OperationInputFieldContract,
  RecordFieldContract,
  RecordFieldRendererKind,
  ReferenceFacts,
  ReferenceOption,
  ReferenceValueStatus,
  StateMachineFacts,
  StateMachineField,
  StateTransitionOperation,
  ValueUnitField,
} from "@dpeek/formless-presentation/contract";
import { sourceIconIsRenderable } from "../field-primitives.tsx";
import type { EditorField } from "./field-chrome.tsx";

export type FixtureFieldOccurrence = {
  ownerId: string;
  placementId: string;
};

type CommonFieldInput<TControl extends FieldControl> = {
  access?: FieldAccess;
  color?: ColorFacts;
  control: TControl;
  editor: TControl["editor"];
  enum?: EnumFacts;
  errors?: readonly FieldError[];
  field: TControl["field"];
  fieldName: string;
  fieldRef?: FieldRef;
  icon?: FieldContract["icon"];
  label?: string;
  labelVisibility: "hidden" | "visible";
  media?: MediaPresentation;
  options?: FieldOptions;
  occurrence: FixtureFieldOccurrence;
  pending?: FieldPending;
  presentation?: FieldContract["presentation"];
  reference?: ReferenceFacts;
  recordId?: string;
  stateMachine?: StateMachineField;
  stateMachineFacts?: StateMachineFacts;
  suffix?: string;
  visibleWhen?: FieldContract["visibleWhen"];
  writable?: boolean;
};

type CreateFixtureInput<TControl extends FieldControl> = CommonFieldInput<TControl> & {
  draftInput?: GeneratedFieldDraftInput;
  media?: MediaAuthoring;
  value?: FieldValue;
};

type OperationFixtureInput<TControl extends FieldControl> = CommonFieldInput<TControl> & {
  draftInput?: GeneratedFieldDraftInput;
  input?: PublicSafeOperationInputField;
  inputName?: string;
  media?: MediaAuthoring;
  value?: FieldValue;
};

type RecordFixtureInput<TControl extends FieldControl> = CommonFieldInput<TControl> & {
  commit: RecordFieldContract["commit"];
  density?: RecordFieldContract["density"];
  drafts: RecordFieldContract["drafts"];
  formatting?: RecordFieldContract["formatting"];
  media?: MediaAuthoring;
  presentationMode?: RecordFieldContract["presentationMode"];
  rendererKind: RecordFieldRendererKind;
  surface?: RecordFieldContract["surface"];
  valueUnit?: ValueUnitField;
};

type DisplayFixtureInput<TControl extends FieldControl> = CommonFieldInput<TControl> & {
  commit?: DisplayFieldContract["commit"];
  density?: DisplayFieldContract["density"];
  formatting: DisplayFieldContract["formatting"];
  surface?: DisplayFieldContract["surface"];
  value?: FieldValue;
};

type BaseFieldFacts = {
  color?: ColorFacts;
  control: FieldControl;
  editor: FieldEditor;
  enum?: EnumFacts;
  errors?: readonly FieldError[];
  field: FieldSchema;
  fieldId: string;
  fieldName: string;
  fieldRef?: FieldRef;
  icon?: FieldContract["icon"];
  inputName?: string;
  label: string;
  labelVisibility: "hidden" | "visible";
  media?: MediaPresentation;
  options?: FieldOptions;
  pending?: FieldPending;
  presentation?: FieldContract["presentation"];
  reference?: ReferenceFacts;
  recordId?: string;
  required: boolean;
  stateMachine?: StateMachineField;
  stateMachineFacts?: StateMachineFacts;
  suffix?: string;
  surface: FieldContract["surface"];
  visibleWhen?: FieldContract["visibleWhen"];
  writable?: boolean;
};

export function createField<TControl extends FieldControl>({
  draftInput,
  value,
  ...input
}: CreateFixtureInput<TControl>): CreateFieldContract {
  return {
    ...baseField(input, "create"),
    access: input.access ?? editableAccess(),
    color: input.color ?? fixtureColorFacts(input.control, draftInput?.value ?? value),
    commit: "submit",
    density: "default",
    draftInput,
    enum:
      input.enum ??
      fixtureEnumEditorFacts({
        field: input.field,
        style: "plain",
        surface: "create",
        value: draftInput?.value ?? value,
      }),
    media: input.media,
    mode: "editor",
    surface: "create",
    value,
  };
}

export function fixtureFieldId({ ownerId, placementId }: FixtureFieldOccurrence): string {
  return ["fixture-field", ownerId, placementId].map((part) => encodeURIComponent(part)).join(":");
}

export function withFixtureFieldOccurrence<TField extends FieldContract>(
  field: TField,
  occurrence: FixtureFieldOccurrence,
): TField {
  return { ...field, fieldId: fixtureFieldId(occurrence) };
}

export function operationField<TControl extends FieldControl>({
  draftInput,
  input,
  inputName,
  value,
  ...fieldInput
}: OperationFixtureInput<TControl>): OperationInputFieldContract {
  const resolvedInputName = inputName ?? fieldInput.fieldName;

  return {
    ...baseField({ ...fieldInput, inputName: resolvedInputName }, "operation"),
    access: fieldInput.access ?? editableAccess(),
    color: fieldInput.color ?? fixtureColorFacts(fieldInput.control, draftInput?.value ?? value),
    commit: "submit",
    density: "default",
    draftInput,
    enum:
      fieldInput.enum ??
      fixtureEnumEditorFacts({
        field: fieldInput.field,
        style: "plain",
        surface: "operation",
        value: draftInput?.value ?? value,
      }),
    input:
      input ??
      publicSafeOperationInputField({
        controlKind: fieldInput.control.controlKind,
        field: fieldInput.field,
        inputName: resolvedInputName,
        label: fieldInput.label ?? fieldInput.control.label,
        options: fieldInput.options,
      }),
    inputName: resolvedInputName,
    media: fieldInput.media,
    mode: "editor",
    surface: "operation",
    value,
  };
}

export function recordField<TControl extends FieldControl>({
  commit,
  density = "default",
  drafts,
  formatting,
  media,
  presentationMode = "default",
  rendererKind,
  surface = "record",
  valueUnit,
  ...input
}: RecordFixtureInput<TControl>): RecordFieldContract {
  return {
    ...baseField(input, surface),
    access: input.access ?? editableAccess(),
    color: input.color ?? fixtureColorFacts(input.control, drafts.draft),
    commit,
    density,
    drafts,
    formatting: formatting ?? { displayValue: displayFieldValue(input.field, drafts.recordValue) },
    enum:
      input.enum ??
      fixtureEnumEditorFacts({
        field: input.field,
        presentation: input.presentation,
        style: rendererKind === "enum-icon" ? "rich" : "plain",
        surface,
        value: drafts.draft,
      }),
    media,
    mode: "editor",
    presentationMode,
    rendererKind,
    surface,
    value: drafts.recordValue,
    valueUnit,
  };
}

export function displayField<TControl extends FieldControl>({
  commit = "submit",
  density = "default",
  formatting,
  surface = "detail",
  value,
  ...input
}: DisplayFixtureInput<TControl>): DisplayFieldContract {
  return {
    ...baseField(input, surface),
    access: input.access ?? { kind: "readOnly", writable: false },
    color: input.color ?? fixtureColorFacts(input.control, value),
    commit,
    density,
    enum:
      input.enum ??
      fixtureEnumDisplayFacts({
        field: input.field,
        presentation: input.presentation,
        value,
      }),
    formatting,
    mode: "display",
    surface,
    value,
  };
}
export function textControl(
  field: Extract<
    FieldSchema,
    {
      type: "text";
    }
  >,
  input: {
    controlKind?: Extract<
      FieldControl["controlKind"],
      "color" | "icon" | "markdown" | "media" | "text" | "textarea"
    >;
    editor?: Extract<
      FieldEditor,
      "color" | "href" | "icon" | "markdown" | "media" | "slug" | "text" | "textarea"
    >;
    label?: string;
    control?: FieldEditorControl;
  } = {},
): Extract<
  FieldControl,
  {
    kind: "text";
  }
> {
  const editor = input.editor ?? textEditorFromField(field);
  const controlKind = input.controlKind ?? textControlKind(editor);
  return controlFacts({
    control: input.control ?? textEditorControl(editor),
    controlKind,
    editor,
    field,
    kind: "text",
    label: input.label ?? field.label ?? "Text",
  });
}
export function booleanControl(
  field: Extract<
    FieldSchema,
    {
      type: "boolean";
    }
  >,
  label = field.label ?? "Boolean",
): Extract<
  FieldControl,
  {
    kind: "boolean";
  }
> {
  return controlFacts({
    control: { kind: "checkbox" },
    controlKind: "checkbox",
    editor: "boolean",
    field,
    kind: "boolean",
    label,
  });
}
export function dateControl(
  field: Extract<
    FieldSchema,
    {
      type: "date";
    }
  >,
  label = field.label ?? "Date",
): Extract<
  FieldControl,
  {
    kind: "date";
  }
> {
  return controlFacts({
    control: { kind: "input", inputType: "date" },
    controlKind: "date",
    editor: "date",
    field,
    kind: "date",
    label,
  });
}
export function numberControl(
  field: Extract<
    FieldSchema,
    {
      type: "number";
    }
  >,
  label = field.label ?? "Number",
): Extract<
  FieldControl,
  {
    kind: "number";
  }
> {
  return controlFacts({
    control: { kind: "formattedNumber" },
    controlKind: "number",
    editor: "number",
    field,
    inputAttributes: {
      max: field.max,
      min: field.min,
      step: field.integer ? "1" : "any",
    },
    kind: "number",
    label,
  });
}
export function enumControl(
  field: Extract<
    FieldSchema,
    {
      type: "enum";
    }
  >,
  label = field.label ?? "Enum",
): Extract<
  FieldControl,
  {
    kind: "enum";
  }
> {
  return controlFacts({
    control: { kind: "select" },
    controlKind: "select",
    createDefaultValue: field.default,
    editor: "enum",
    field,
    kind: "enum",
    label,
  });
}
export function referenceControl(
  field: Extract<
    FieldSchema,
    {
      type: "reference";
    }
  >,
  label = field.label ?? "Reference",
): Extract<
  FieldControl,
  {
    kind: "reference";
  }
> {
  return controlFacts({
    control: { kind: "reference" },
    controlKind: "reference",
    editor: "reference",
    field,
    kind: "reference",
    label,
  });
}
export function enumOptions(
  field: Extract<
    FieldSchema,
    {
      type: "enum";
    }
  >,
  input: Partial<
    Record<
      string,
      {
        iconSource?: string;
      }
    >
  > = {},
): EnumOption[] {
  return field.values.map((option) => ({
    label: option.label,
    presentation: enumValuePresentation(field, option.key, input[option.key]?.iconSource),
    status: "declared",
    value: option.key,
  }));
}
export function enumValuePresentation(
  field: Extract<
    FieldSchema,
    {
      type: "enum";
    }
  >,
  value: string,
  iconSource?: string,
): EnumOption["presentation"] {
  const option = field.values.find((definition) => definition.key === value);
  const color = option?.presentation?.color;
  const colorIntent = fixturePresentationColorIntent(color);
  const iconToken = option?.presentation?.icon;

  return {
    color: {
      intent: colorIntent,
      known: color === undefined || colorIntent !== "neutral",
      ...(color === undefined ? {} : { token: color }),
    },
    ...(iconSource ? { icon: { kind: "svg", source: iconSource } } : {}),
    iconKnown: iconToken === undefined || iconSource !== undefined,
    ...(iconToken === undefined ? {} : { iconToken }),
    label: option?.label ?? value,
  };
}

export function referenceOptions(options: readonly ReferenceOption[]) {
  return options;
}
export function referenceEditorFacts(
  field: Extract<
    FieldSchema,
    {
      type: "reference";
    }
  >,
  value: FieldValue | undefined,
  options: readonly ReferenceOption[],
): ReferenceFacts {
  return {
    clearable: !field.required,
    kind: "editor",
    valueStatus: fixtureReferenceValueStatus(value, options),
  };
}

export function referenceDisplayFacts(
  value: FieldValue | undefined,
  options: readonly ReferenceOption[],
): ReferenceFacts {
  return {
    kind: "display",
    valueStatus: fixtureReferenceValueStatus(value, options),
  };
}

function fixtureReferenceValueStatus(
  value: FieldValue | undefined,
  options: readonly ReferenceOption[],
): ReferenceValueStatus {
  if (typeof value !== "string" || value === "") {
    return { kind: "unset" };
  }

  return options.some((option) => option.id === value)
    ? { kind: "resolved", value }
    : { kind: "missing", value };
}

export function mediaAssetOptions(
  options: readonly MediaAssetOption[],
): readonly MediaAssetOption[] {
  return options;
}

export function stateMachineField(input: {
  fieldName: string;
  machineName: string;
  machine: StateMachineSchema;
}): StateMachineField {
  return {
    fieldName: input.fieldName,
    initialState: input.machine.initial,
    machine: input.machine,
    machineName: input.machineName,
    terminalStates: input.machine.terminal ?? [],
  };
}
export function stateMachineFacts(input: {
  currentValue: FieldValue | undefined;
  field: Extract<
    FieldSchema,
    {
      type: "enum";
    }
  >;
  interaction?: "display" | "transitions";
  operationNames: Record<string, string>;
  stateMachine: StateMachineField;
  transitionPatches?: Partial<Record<string, Partial<StateTransitionOperation>>>;
  transitions?: StateMachineSchema["transitions"];
}): StateMachineFacts {
  const transitions = input.transitions ?? input.stateMachine.machine.transitions;
  const currentValue = typeof input.currentValue === "string" ? input.currentValue : "";
  const transitionFacts = transitions.map((transition) => {
    const transitionName = transition.key;
    const undeclared =
      currentValue.trim() !== "" &&
      input.field.values.find((definition) => definition.key === currentValue) === undefined;
    const valid =
      transition.from.includes(currentValue) ||
      (undeclared && transition.to === input.stateMachine.initialState);
    const baseTransition = {
      operationName: input.operationNames[transitionName] ?? transitionName,
      label: transition.label,
      machineName: input.stateMachine.machineName,
      machine: input.stateMachine.machine,
      transitionName,
      transition,
      fieldName: input.stateMachine.fieldName,
      field: input.field,
      availability: valid
        ? { valid: true }
        : {
            valid: false,
            disabledReason: undeclared
              ? `Current state "${currentValue}" is not declared.`
              : `Requires ${transition.from
                  .map(
                    (value) =>
                      input.field.values.find((definition) => definition.key === value)?.label ??
                      value,
                  )
                  .join(", ")}.`,
          },
    } satisfies StateTransitionOperation;

    return {
      ...baseTransition,
      ...input.transitionPatches?.[transitionName],
    };
  });

  return {
    currentValue: input.currentValue,
    initialState: input.stateMachine.initialState,
    interaction:
      input.interaction === "display"
        ? { kind: "display" }
        : {
            invocationSource: "menuItem",
            kind: "transitions",
            transitions: transitionFacts,
          },
    stateMachine: input.stateMachine,
    terminal: input.stateMachine.terminalStates.includes(currentValue),
    valueStatus:
      currentValue.trim() === ""
        ? { kind: "unset", message: "Current state is missing." }
        : input.field.values.find((definition) => definition.key === currentValue) === undefined
          ? {
              kind: "undeclared",
              message: `Current state "${currentValue}" is not declared.`,
              value: currentValue,
            }
          : { kind: "declared", value: currentValue },
  };
}

export function draftInput(value: FieldValue | string | undefined): GeneratedFieldDraftInput {
  if (typeof value === "boolean" || typeof value === "number") {
    return { kind: "value", value };
  }

  return { kind: "input", value: value === undefined ? "" : String(value) };
}

export function recordDrafts(input: {
  draft?: string;
  draftInput?: GeneratedFieldDraftInput;
  recordValue?: FieldValue;
  unitDraft?: string;
  unitDraftInput?: GeneratedFieldDraftInput;
  unitRecordValue?: FieldValue;
}): RecordFieldContract["drafts"] {
  return {
    draft: input.draft ?? String(input.recordValue ?? ""),
    draftInput: input.draftInput ?? draftInput(input.recordValue),
    recordValue: input.recordValue,
    unitDraft: input.unitDraft,
    unitDraftInput: input.unitDraftInput,
    unitRecordValue: input.unitRecordValue,
  };
}

export function fieldError(fieldName: string, message: string, draftValue = ""): FieldError {
  return {
    fieldName,
    message,
    draftValue: { kind: "input", value: draftValue },
  };
}

export function scenarioFieldKey(field: FieldContract) {
  return `${field.surface}:${field.recordId ?? "record"}:${field.inputName ?? field.fieldName}`;
}

export function applyScenarioFieldIntent(field: FieldContract, intent: FieldIntent): FieldContract {
  return withFixtureCurrentColorFacts(applyScenarioFieldIntentResult(field, intent));
}

function applyScenarioFieldIntentResult(field: FieldContract, intent: FieldIntent): FieldContract {
  if (intent.type === "createDraftChange") {
    if (!isCreateField(field) || field.fieldName !== intent.fieldName) {
      return field;
    }

    return validateScenarioDraftChange(
      withFixtureReferenceValue(
        withFixtureEnumEditorValue(
          { ...field, draftInput: intent.fieldValue, value: intent.fieldValue.value },
          intent.fieldValue.value,
        ),
        intent.fieldValue.value,
      ),
      intent.fieldValue,
    );
  }

  if (intent.type === "operationDraftChange") {
    if (!isOperationField(field) || field.inputName !== intent.inputName) {
      return field;
    }

    return validateScenarioDraftChange(
      withFixtureEnumEditorValue(
        { ...field, draftInput: intent.inputValue, value: intent.inputValue?.value },
        intent.inputValue?.value,
      ),
      intent.inputValue ?? { kind: "value", value: "" },
    );
  }

  if (intent.type === "recordEditorDraftChange") {
    if (!isRecordField(field) || field.fieldName !== intent.fieldName) {
      return field;
    }

    const draftInput = scenarioRecordEditorDraftInput(field, intent.value);

    return withFixtureReferenceValue(
      withFixtureEnumEditorValue(
        {
          ...field,
          drafts: {
            ...field.drafts,
            draft: intent.value,
            draftInput,
          },
        },
        intent.value,
      ),
      intent.value,
    );
  }

  if (intent.type === "recordDraftChange") {
    return applyRecordDraftChange(field, intent.fieldName, intent.fieldValue);
  }

  if (intent.type === "recordDraftRevert") {
    if (!isRecordField(field) || field.fieldName !== intent.fieldName) {
      return field;
    }

    return withFixtureReferenceValue(
      withFixtureEnumEditorValue(
        {
          ...field,
          drafts: {
            ...field.drafts,
            draft: scenarioRecordEditorText(field, field.drafts.recordValue),
            draftInput: undefined,
            unitDraft: String(field.drafts.unitRecordValue ?? ""),
            unitDraftInput: undefined,
          },
          errors: removeFieldErrors(
            removeFieldErrors(field.errors, field.fieldName),
            field.valueUnit?.unitFieldName ?? "",
          ),
        },
        field.drafts.recordValue,
      ),
      field.drafts.recordValue,
    );
  }

  if (intent.type === "recordDraftCommit") {
    return applyRecordDraftCommit(field, intent.fieldName, intent.fieldValue);
  }

  if (intent.type === "iconDialogDraftChange") {
    return applyIconDialogDraftChange(field, intent.fieldName, intent.value);
  }

  if (intent.type === "iconDialogOpenChange") {
    return applyIconDialogOpenChange(field, intent.fieldName, intent.open);
  }

  if (intent.type === "iconDialogCancel") {
    return applyIconDialogCancel(field, intent.fieldName);
  }

  if (intent.type === "iconDialogSave") {
    return applyIconDialogSave(field, intent.fieldName);
  }

  if (intent.type === "mediaAssetSelect") {
    return applyMediaAssetSelect(field, intent.fieldName, intent.assetId);
  }

  if (intent.type === "mediaFileSelect") {
    return applyMediaFileSelect(field, intent.fieldName, intent.file);
  }

  if (intent.type === "recordValueCommit") {
    return applyRecordValueCommit(field, intent.fieldName, intent.value);
  }

  if (intent.type === "recordValueUnitCommit") {
    return applyRecordValueUnitCommit(field, intent.fieldName, intent.commit);
  }

  if (intent.type === "fieldErrorChange") {
    return field.fieldName === intent.fieldName
      ? {
          ...field,
          errors:
            intent.message === null
              ? removeFieldErrors(field.errors, intent.fieldName)
              : [
                  ...removeFieldErrors(field.errors, intent.fieldName),
                  fieldError(intent.fieldName, intent.message),
                ],
        }
      : field;
  }

  if (intent.type === "stateTransitionInvoke") {
    return applyStateTransition(field, intent.fieldName, intent.transitionName);
  }

  return field;
}

export function displayFieldValue(field: FieldSchema, value: FieldValue | undefined): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (field.type === "boolean") {
    return value === true ? "Yes" : "No";
  }
  if (field.type === "enum" && typeof value === "string") {
    return field.values.find((definition) => definition.key === value)?.label ?? value;
  }
  return String(value);
}
export function applyScenarioFieldSubmit(field: FieldContract): FieldContract {
  if (!isCreateField(field) && !isOperationField(field)) {
    return field;
  }

  const fieldName = field.surface === "operation" ? field.inputName : field.fieldName;
  const draftValue =
    field.draftInput ?? (field.value === undefined ? undefined : draftInput(field.value));
  const value =
    draftValue === undefined ? undefined : fieldValueFromDraftInput(field.field, draftValue);
  const validation = validateScenarioFieldValue(
    fieldName,
    field.field,
    value,
    draftValue !== undefined,
    draftValue,
  );

  if (validation.kind === "error") {
    return {
      ...field,
      errors: [
        ...removeFieldErrors(field.errors, fieldName),
        fieldError(fieldName, validation.message, String(draftValue?.value ?? "")),
      ],
    };
  }

  return {
    ...field,
    errors: removeFieldErrors(field.errors, fieldName),
    value: validation.kind === "set" ? validation.value : undefined,
  };
}
function baseField<TControl extends FieldControl>(
  input: CommonFieldInput<TControl> & {
    inputName?: string;
  },
  surface: FieldContract["surface"],
): BaseFieldFacts {
  return {
    control: input.control,
    color: input.color,
    editor: input.editor,
    enum: input.enum,
    errors: input.errors,
    field: input.field,
    fieldId: fixtureFieldId(input.occurrence),
    fieldName: input.fieldName,
    fieldRef: input.fieldRef,
    icon: input.icon,
    inputName: input.inputName,
    label: input.label ?? input.control.label,
    labelVisibility: input.labelVisibility,
    media: input.media,
    options: input.options,
    pending: input.pending,
    presentation: input.presentation,
    reference: input.reference,
    recordId: input.recordId,
    required: input.field.required,
    stateMachine: input.stateMachine,
    stateMachineFacts: input.stateMachineFacts,
    suffix: input.suffix,
    surface,
    visibleWhen: input.visibleWhen,
    writable: input.writable,
  };
}

function fixtureEnumEditorFacts({
  field,
  presentation,
  style,
  surface,
  value,
}: {
  field: FieldSchema;
  presentation?: FieldContract["presentation"];
  style: "plain" | "rich";
  surface: "create" | "detail" | "operation" | "record" | "table-cell";
  value: FieldValue | undefined;
}): EnumFacts | undefined {
  if (field.type !== "enum") {
    return undefined;
  }

  const valueStatus = fixtureEnumValueStatus(field, value);
  const placeholder =
    surface === "operation"
      ? "Select"
      : style === "rich" && valueStatus.kind === "unset"
        ? "None"
        : valueStatus.kind === "unset"
          ? ""
          : undefined;

  return {
    clearable: surface === "operation" || !field.required,
    kind: "editor",
    listContent: style === "rich" ? (presentation?.list ?? "both") : "label",
    ...(placeholder === undefined ? {} : { placeholder }),
    style,
    triggerContent: style === "rich" && presentation?.trigger !== "label" ? "both" : "label",
    valueStatus,
  };
}

function fixtureEnumDisplayFacts({
  field,
  presentation,
  value,
}: {
  field: FieldSchema;
  presentation?: FieldContract["presentation"];
  value: FieldValue | undefined;
}): EnumFacts | undefined {
  if (field.type !== "enum") {
    return undefined;
  }

  return {
    content: presentation?.mode === "iconOnly" ? "icon" : "label",
    kind: "display",
    valueStatus: fixtureEnumValueStatus(field, value),
  };
}
function fixtureEnumValueStatus(
  field: Extract<
    FieldSchema,
    {
      type: "enum";
    }
  >,
  value: FieldValue | undefined,
): EnumFacts["valueStatus"] {
  if (typeof value !== "string" || value === "") {
    return { kind: "unset" };
  }
  return field.values.some((definition) => definition.key === value)
    ? { kind: "declared", value }
    : { kind: "undeclared", value };
}

function fixturePresentationColorIntent(
  token: string | undefined,
): EnumOption["presentation"]["color"]["intent"] {
  if (token === "success" || token === "priority.low") {
    return "success";
  }

  if (token === "warning" || token === "priority.normal") {
    return "warning";
  }

  if (token === "danger" || token === "error" || token === "priority.high") {
    return "danger";
  }

  return "neutral";
}

function controlFacts<TControl extends FieldControl>({
  control,
  controlKind,
  createDefaultValue,
  editor,
  field,
  inputAttributes = {},
  kind,
  label,
}: {
  control: FieldEditorControl;
  controlKind: TControl["controlKind"];
  createDefaultValue?: string;
  editor: TControl["editor"];
  field: TControl["field"];
  inputAttributes?: FieldInputAttributes;
  kind: TControl["kind"];
  label: string;
}): TControl {
  return {
    control,
    controlKind,
    createDefaultChecked: field.type === "boolean" && field.default === true,
    createDefaultValue,
    editor,
    field,
    inputAttributes,
    kind,
    label,
    required: field.required,
  } as TControl;
}
function textEditorFromField(
  field: Extract<
    FieldSchema,
    {
      type: "text";
    }
  >,
) {
  if (field.format === "longText") {
    return "textarea";
  }

  if (field.format === "markdown") {
    return "markdown";
  }

  if (
    field.format === "color" ||
    field.format === "href" ||
    field.format === "icon" ||
    field.format === "slug"
  ) {
    return field.format;
  }

  return "text";
}

function textControlKind(
  editor: Extract<
    FieldEditor,
    "color" | "href" | "icon" | "markdown" | "media" | "slug" | "text" | "textarea"
  >,
) {
  if (editor === "href" || editor === "slug") {
    return "text";
  }

  return editor;
}

function textEditorControl(editor: FieldEditor): FieldEditorControl {
  if (editor === "icon") {
    return { kind: "icon" };
  }

  if (editor === "media") {
    return { kind: "mediaUpload" };
  }

  if (editor === "textarea" || editor === "markdown") {
    return { kind: "textarea" };
  }
  return { kind: "input", inputType: "text" };
}
function editableAccess(): Extract<
  FieldAccess,
  {
    kind: "editable";
  }
> {
  return { kind: "editable", canPatch: true, writable: true };
}
function publicSafeOperationInputField({
  controlKind,
  field,
  inputName,
  label,
  options,
}: {
  controlKind: FieldControl["controlKind"];
  field: FieldSchema;
  inputName: string;
  label: string;
  options: FieldOptions | undefined;
}): PublicSafeOperationInputField {
  return {
    name: inputName,
    label,
    required: field.required,
    control:
      field.type === "boolean"
        ? "boolean"
        : field.type === "date"
          ? "date"
          : field.type === "number"
            ? "number"
            : field.type === "enum"
              ? "enum"
              : controlKind === "textarea"
                ? "longText"
                : "text",
    options:
      field.type === "enum"
        ? options?.enumOptions?.map((option) => ({ value: option.value, label: option.label }))
        : undefined,
  };
}

function applyRecordDraftChange(
  field: FieldContract,
  fieldName: string,
  fieldValue: GeneratedFieldDraftInput | undefined,
): FieldContract {
  if (!isRecordField(field)) {
    return field;
  }

  if (field.valueUnit?.unitFieldName === fieldName) {
    return {
      ...field,
      drafts: {
        ...field.drafts,
        unitDraft: String(fieldValue?.value ?? ""),
        unitDraftInput: fieldValue,
      },
    };
  }

  if (field.fieldName !== fieldName) {
    return field;
  }

  return withFixtureEnumEditorValue(
    {
      ...field,
      drafts: {
        ...field.drafts,
        draft: String(fieldValue?.value ?? ""),
        draftInput: fieldValue,
      },
    },
    fieldValue?.value,
  );
}

function applyMediaAssetSelect(
  field: FieldContract,
  fieldName: string,
  assetId: string,
): FieldContract {
  if (!isRecordField(field) || field.fieldName !== fieldName) {
    return field;
  }

  const asset = field.options?.mediaAssetOptions?.find((option) => option.id === assetId);
  const committedField = applyRecordValueCommit(field, fieldName, assetId);

  if (!isRecordField(committedField) || committedField.errors?.length) {
    return committedField;
  }

  return {
    ...committedField,
    media:
      committedField.media === undefined
        ? undefined
        : {
            ...committedField.media,
            mediaPreviewHref: asset?.href,
            previewHref: asset?.href,
            selectedAssetId: assetId || undefined,
          },
  };
}

function applyMediaFileSelect(
  field: FieldContract,
  fieldName: string,
  file: File | undefined,
): FieldContract {
  if (
    file === undefined ||
    field.mode !== "editor" ||
    field.fieldName !== fieldName ||
    field.control.controlKind !== "media"
  ) {
    return field;
  }

  const fileName = file.name || `${fieldName}.png`;
  const assetId = `media-upload-${fixtureMediaFileSlug(fileName)}`;
  const previewHref = URL.createObjectURL(file);
  const mediaAssetOptions = [
    { href: previewHref, id: assetId, label: fileName },
    ...(field.options?.mediaAssetOptions ?? []).filter((option) => option.id !== assetId),
  ];

  if (isRecordField(field)) {
    const committedField = applyRecordValueCommit(
      {
        ...field,
        options: { ...field.options, mediaAssetOptions },
      },
      fieldName,
      assetId,
    );

    return isRecordField(committedField)
      ? {
          ...committedField,
          media:
            committedField.media === undefined
              ? undefined
              : {
                  ...committedField.media,
                  mediaPreviewHref: previewHref,
                  previewHref,
                  selectedAssetId: assetId,
                },
        }
      : committedField;
  }

  return {
    ...field,
    draftInput: draftInput(assetId),
    media:
      field.media && "fileSelectEnabled" in field.media
        ? {
            ...field.media,
            mediaPreviewHref: previewHref,
            previewHref,
            selectedAssetId: assetId,
          }
        : field.media,
    options: { ...field.options, mediaAssetOptions },
    value: assetId,
  };
}

function fixtureMediaFileSlug(fileName: string) {
  const slug = fileName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "image";
}

function applyRecordDraftCommit(
  field: FieldContract,
  fieldName: string,
  fieldValue: GeneratedFieldDraftInput,
) {
  if (!isRecordField(field) || field.fieldName !== fieldName) {
    return field;
  }

  const value = fieldValueFromDraftInput(field.field, fieldValue);
  const validation = validateScenarioFieldValue(fieldName, field.field, value, true, fieldValue);

  if (validation.kind === "error") {
    return {
      ...field,
      drafts: {
        ...field.drafts,
        draftInput: fieldValue,
      },
      errors: [
        ...removeFieldErrors(field.errors, fieldName),
        fieldError(fieldName, validation.message, field.drafts.draft),
      ],
    };
  }

  const committedValue = validation.kind === "set" ? validation.value : undefined;

  return {
    ...field,
    drafts: {
      ...field.drafts,
      draft: scenarioRecordEditorText(field, committedValue),
      draftInput: draftInput(committedValue),
      recordValue: committedValue,
    },
    errors: removeFieldErrors(field.errors, fieldName),
    formatting: {
      ...field.formatting,
      displayValue: scenarioNumberDisplayValue(field, committedValue),
    },
  };
}

function applyIconDialogDraftChange(
  field: FieldContract,
  fieldName: string,
  value: string,
): FieldContract {
  if (field.mode !== "editor" || field.fieldName !== fieldName || field.icon === undefined) {
    return field;
  }

  return withFixtureIconDialogDraft(field, value, field.icon.dialogOpen);
}

function applyIconDialogOpenChange(
  field: FieldContract,
  fieldName: string,
  open: boolean,
): FieldContract {
  if (field.mode !== "editor" || field.fieldName !== fieldName || field.icon === undefined) {
    return field;
  }

  return withFixtureIconDialogDraft(
    field,
    open ? fixtureIconSavedSource(field) : field.icon.dialogDraft,
    open,
  );
}

function applyIconDialogCancel(field: FieldContract, fieldName: string): FieldContract {
  if (field.mode !== "editor" || field.fieldName !== fieldName || field.icon === undefined) {
    return field;
  }

  return withFixtureIconDialogDraft(field, fixtureIconSavedSource(field), false);
}

function applyIconDialogSave(field: FieldContract, fieldName: string): FieldContract {
  if (
    !isRecordField(field) ||
    field.fieldName !== fieldName ||
    field.icon === undefined ||
    !field.icon.canSave
  ) {
    return field;
  }

  const committed = applyRecordValueCommit(field, fieldName, field.icon.dialogDraft);

  return committed.mode === "editor" && committed.icon !== undefined
    ? withFixtureIconDialogDraft(committed, committed.icon.dialogDraft, false)
    : committed;
}

function withFixtureIconDialogDraft(
  field: EditorField,
  dialogDraft: string,
  dialogOpen: boolean,
): EditorField {
  const trimmedDraft = dialogDraft.trim();
  const emptyValue = trimmedDraft === "";
  const customParseError =
    emptyValue || sourceIconIsRenderable(dialogDraft)
      ? undefined
      : "SVG source could not be parsed.";
  const selection = fixtureIconSelection(field, dialogDraft);
  const savedSource = fixtureIconSavedSource(field);

  return {
    ...field,
    icon: {
      canCancel: dialogOpen,
      canSave:
        dialogOpen &&
        !field.pending?.isPending &&
        customParseError === undefined &&
        (!field.required || !emptyValue),
      ...(customParseError === undefined ? {} : { customParseError }),
      dialogDraft,
      dialogOpen,
      emptyValue,
      previewSource: customParseError === undefined ? dialogDraft : savedSource,
      savePending: field.pending?.isPending,
      selection,
      valueMode: "svgSource",
    },
  };
}

function fixtureIconSelection(field: EditorField, source: string): IconPickerSelection {
  if (source.trim() === "") {
    return { kind: "empty" };
  }

  const option = field.options?.iconOptions?.find((candidate) => candidate.source === source);

  return option === undefined || option.custom
    ? { kind: "customSource", source }
    : { kind: "option", optionId: option.id, source };
}

function fixtureIconSavedSource(field: EditorField) {
  if (isRecordField(field)) {
    return field.drafts.draft;
  }

  return typeof field.draftInput?.value === "string"
    ? field.draftInput.value
    : typeof field.value === "string"
      ? field.value
      : "";
}

function applyRecordValueCommit(field: FieldContract, fieldName: string, value: FieldValue) {
  if (!isRecordField(field) || field.fieldName !== fieldName) {
    return field;
  }

  const validation = validateScenarioFieldValue(
    fieldName,
    field.field,
    value,
    true,
    draftInput(value),
  );

  if (validation.kind === "error") {
    return {
      ...field,
      errors: [
        ...removeFieldErrors(field.errors, fieldName),
        fieldError(fieldName, validation.message, field.drafts.draft),
      ],
    };
  }

  const committedValue = validation.kind === "set" ? validation.value : undefined;

  return withFixtureReferenceValue(
    withFixtureEnumEditorValue(
      {
        ...field,
        drafts: {
          ...field.drafts,
          draft: String(committedValue ?? ""),
          draftInput: draftInput(committedValue),
          recordValue: committedValue,
        },
        errors: removeFieldErrors(field.errors, field.fieldName),
        formatting: {
          ...field.formatting,
          displayValue: displayFieldValue(field.field, committedValue),
          enumValuePresentation:
            field.field.type === "enum" &&
            typeof committedValue === "string" &&
            committedValue !== ""
              ? enumValuePresentation(field.field, committedValue)
              : undefined,
        },
      },
      committedValue,
    ),
    committedValue,
    { updateFormatting: true },
  );
}

function validateScenarioDraftChange<TField extends FieldContract>(
  field: TField,
  fieldValue: GeneratedFieldDraftInput,
): TField {
  if (field.field.type !== "number") {
    return field;
  }

  const rawValue = String(fieldValue.value ?? "");

  if (rawValue.trim() === "") {
    return {
      ...field,
      errors: removeFieldErrors(field.errors, field.fieldName),
    };
  }

  const value = fieldValueFromDraftInput(field.field, fieldValue);
  const validation = validateScenarioFieldValue(
    field.fieldName,
    field.field,
    value,
    true,
    fieldValue,
  );

  return validation.kind === "error"
    ? {
        ...field,
        errors: [
          ...removeFieldErrors(field.errors, field.fieldName),
          fieldError(field.fieldName, validation.message, rawValue),
        ],
      }
    : {
        ...field,
        errors: removeFieldErrors(field.errors, field.fieldName),
      };
}

function scenarioRecordEditorDraftInput(
  field: RecordFieldContract,
  value: string,
): GeneratedFieldDraftInput {
  if (field.field.type !== "number") {
    return { kind: "input", value };
  }

  const format = field.formatting.format ?? field.format ?? "plain";
  const normalized =
    format === "currency"
      ? value.replace(/[$]/g, "")
      : format === "percent"
        ? value.replace(/%$/, "")
        : value;
  const result = parseNumberInputValue(normalized.trim());

  if (result.kind === "empty") {
    return { kind: "value", value: "" };
  }

  if (result.kind === "valid") {
    return {
      kind: "value",
      value: format === "percent" ? result.value / 100 : result.value,
    };
  }

  return { kind: "input", value };
}

function scenarioRecordEditorText(field: RecordFieldContract, value: FieldValue | undefined) {
  if (field.field.type !== "number" || typeof value !== "number") {
    return String(value ?? "");
  }

  const format = field.formatting.format ?? field.format ?? "plain";

  if (format === "currency") {
    return `$${value.toFixed(2)}`;
  }

  if (format === "percent") {
    return `${scenarioPlainNumber(value * 100)}%`;
  }

  return format === "number" ? scenarioPlainNumber(value) : String(value);
}

function scenarioNumberDisplayValue(field: RecordFieldContract, value: FieldValue | undefined) {
  return scenarioRecordEditorText(field, value);
}

function scenarioPlainNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function applyRecordValueUnitCommit(
  field: FieldContract,
  fieldName: string,
  commit: {
    fieldDraftInput: GeneratedFieldDraftInput;
    unitDraftInput: GeneratedFieldDraftInput;
  },
) {
  if (!isRecordField(field) || field.fieldName !== fieldName || !field.valueUnit) {
    return field;
  }

  const fieldValue = fieldValueFromDraftInput(field.field, commit.fieldDraftInput);
  const unitValue = fieldValueFromDraftInput(field.valueUnit.unitField, commit.unitDraftInput);
  const fieldValidation = validateScenarioFieldValue(
    field.fieldName,
    field.field,
    fieldValue,
    true,
    commit.fieldDraftInput,
  );
  const unitValidation = validateScenarioFieldValue(
    field.valueUnit.unitFieldName,
    field.valueUnit.unitField,
    unitValue,
    true,
    commit.unitDraftInput,
  );
  const validationError =
    fieldValidation.kind === "error"
      ? { fieldName: field.fieldName, message: fieldValidation.message }
      : unitValidation.kind === "error"
        ? { fieldName: field.valueUnit.unitFieldName, message: unitValidation.message }
        : undefined;

  if (validationError) {
    return {
      ...field,
      errors: [
        ...removeFieldErrors(field.errors, validationError.fieldName),
        fieldError(validationError.fieldName, validationError.message),
      ],
    };
  }

  const committedFieldValue = fieldValidation.kind === "set" ? fieldValidation.value : undefined;
  const committedUnitValue = unitValidation.kind === "set" ? unitValidation.value : undefined;

  return {
    ...field,
    drafts: {
      ...field.drafts,
      draft: scenarioRecordEditorText(field, committedFieldValue),
      draftInput: commit.fieldDraftInput,
      recordValue: committedFieldValue,
      unitDraft: String(committedUnitValue ?? ""),
      unitDraftInput: commit.unitDraftInput,
      unitRecordValue: committedUnitValue,
    },
    errors: removeFieldErrors(
      removeFieldErrors(field.errors, field.fieldName),
      field.valueUnit.unitFieldName,
    ),
    formatting: {
      ...field.formatting,
      displayValue: scenarioNumberDisplayValue(field, committedFieldValue),
    },
  };
}

function applyStateTransition(
  field: FieldContract,
  fieldName: string,
  transitionName: string,
): FieldContract {
  if (field.fieldName !== fieldName || field.stateMachineFacts === undefined) {
    return field;
  }

  if (field.stateMachineFacts.interaction.kind !== "transitions") {
    return field;
  }

  const transition = field.stateMachineFacts.interaction.transitions.find(
    (candidate) => candidate.transitionName === transitionName,
  );

  if (!transition || transition.availability?.valid === false) {
    return field;
  }

  const nextValue = transition.transition.to;

  const nextFacts = stateMachineFacts({
    currentValue: nextValue,
    field: transition.field,
    operationNames: Object.fromEntries(
      field.stateMachineFacts.interaction.transitions.map((candidate) => [
        candidate.transitionName,
        candidate.operationName,
      ]),
    ),
    stateMachine: field.stateMachineFacts.stateMachine,
  });

  if (field.mode === "display") {
    return {
      ...field,
      formatting: {
        ...field.formatting,
        displayValue: displayFieldValue(transition.field, nextValue),
        enumValuePresentation: enumValuePresentation(transition.field, nextValue),
      },
      stateMachineFacts: nextFacts,
      value: nextValue,
    };
  }

  if (isRecordField(field)) {
    return {
      ...field,
      drafts: {
        ...field.drafts,
        draft: nextValue,
        draftInput: { kind: "input", value: nextValue },
        recordValue: nextValue,
      },
      formatting: {
        ...field.formatting,
        displayValue: displayFieldValue(transition.field, nextValue),
        enumValuePresentation: enumValuePresentation(transition.field, nextValue),
      },
      stateMachineFacts: nextFacts,
    };
  }

  return { ...field, stateMachineFacts: nextFacts, value: nextValue };
}

function fieldValueFromDraftInput(field: FieldSchema, input: GeneratedFieldDraftInput): FieldValue {
  if (input.kind === "value") {
    return input.value;
  }

  if (field.type === "number") {
    const value = Number(input.value);

    return Number.isFinite(value) ? value : input.value;
  }

  return input.value;
}

function validateScenarioFieldValue(
  fieldName: string,
  field: FieldSchema,
  value: FieldValue | undefined,
  provided: boolean,
  draftValue?: GeneratedFieldDraftInput,
):
  | {
      kind: "error";
      message: string;
    }
  | {
      kind: "omit";
    }
  | {
      kind: "set";
      value: FieldValue;
    } {
  try {
    const draftResolution =
      draftValue === undefined
        ? undefined
        : resolveGeneratedFieldDraftValue({ draftValue, field, fieldName });

    if (draftResolution?.kind === "error") {
      return { kind: "error", message: draftResolution.error.message };
    }

    const resolvedValue = draftResolution?.kind === "value" ? draftResolution.value : value;

    return validateAuthorityFieldValue(fieldName, field, resolvedValue, provided);
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : `Field "${fieldName}" is invalid.`,
    };
  }
}

function fixtureColorFacts(
  control: FieldControl,
  value: FieldValue | undefined,
): ColorFacts | undefined {
  if (control.controlKind !== "color") {
    return undefined;
  }

  const expanded = fixtureExpandedHexColor(typeof value === "string" ? value : "");

  return {
    picker: expanded?.length === 7 ? { kind: "hex", value: expanded } : { kind: "unavailable" },
    swatch: expanded === undefined ? { kind: "unavailable" } : { kind: "hex", value: expanded },
  };
}

function fixtureExpandedHexColor(value: string): string | undefined {
  const clean = value.trim().replace(/^#/, "");

  if (!/^(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(clean)) {
    return undefined;
  }

  const expanded =
    clean.length === 3
      ? clean
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : clean;

  return `#${expanded.toUpperCase()}`;
}

function withFixtureCurrentColorFacts(field: FieldContract): FieldContract {
  if (field.control.controlKind !== "color") {
    return field;
  }

  const value =
    field.mode === "display"
      ? field.value
      : isRecordField(field)
        ? field.drafts.draft
        : (field.draftInput?.value ?? field.value);

  return {
    ...field,
    color: fixtureColorFacts(field.control, value),
  };
}

function withFixtureEnumEditorValue(
  field: FieldContract,
  value: FieldValue | undefined,
): FieldContract {
  if (field.mode !== "editor" || field.field.type !== "enum") {
    return field;
  }

  const style = field.enum?.kind === "editor" ? field.enum.style : "plain";
  const enumOptions = field.options?.enumOptions ?? [];

  return {
    ...field,
    enum: fixtureEnumEditorFacts({
      field: field.field,
      presentation: field.presentation,
      style,
      surface: field.surface,
      value,
    }),
    options: { ...field.options, enumOptions },
  };
}

function withFixtureReferenceValue(
  field: FieldContract,
  value: FieldValue | undefined,
  {
    updateFormatting = false,
  }: {
    updateFormatting?: boolean;
  } = {},
): FieldContract {
  if (field.field.type !== "reference") {
    return field;
  }

  const referenceValue = typeof value === "string" ? value : "";
  const referenceOptions = field.options?.referenceOptions ?? [];
  const selectedOption = referenceOptions.find((option) => option.id === referenceValue);
  const nextField = {
    ...field,
    reference: {
      clearable: !field.required,
      kind: "editor" as const,
      valueStatus: fixtureReferenceValueStatus(value, referenceOptions),
    },
  };

  if (!updateFormatting || !isRecordField(nextField)) {
    return nextField;
  }

  return {
    ...nextField,
    formatting: {
      ...nextField.formatting,
      displayValue: selectedOption?.label ?? referenceValue,
    },
  };
}

function removeFieldErrors(errors: readonly FieldError[] | undefined, fieldName: string) {
  return (errors ?? []).filter((error) => error.fieldName !== fieldName);
}

function isRecordField(field: FieldContract): field is RecordFieldContract {
  return field.mode === "editor" && field.surface !== "create" && field.surface !== "operation";
}

function isCreateField(field: FieldContract): field is CreateFieldContract {
  return field.mode === "editor" && field.surface === "create";
}

function isOperationField(field: FieldContract): field is OperationInputFieldContract {
  return field.mode === "editor" && field.surface === "operation";
}
