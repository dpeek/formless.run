import { MEDIA_IMAGE_UPLOAD_MAX_BYTES } from "@dpeek/formless-media";
import {
  coreImageMediaAssetOptionForId,
  IMAGE_UPLOAD_ACCEPT,
  type MediaAssetOption as ClientMediaAssetOption,
} from "@dpeek/formless-media/client";
import { parseSourceSvg } from "@dpeek/formless-source-svg";
import type {
  AppSchema,
  FieldSchema,
  FieldValue,
  GeneratedFieldDraftError,
  GeneratedFieldDraftInput,
  IconValueMode,
  QueryEvaluationContext,
} from "@dpeek/formless-schema";
import type {
  BaseFieldContract,
  ColorFacts,
  CreateDefault,
  CreateFieldContract,
  CreateSurfaceContract,
  ButtonContent,
  DisplayFieldContract,
  EnumFacts,
  EnumOption,
  EnumValuePresentation,
  FieldContract,
  FieldAccess,
  FieldControl,
  FieldDensity,
  FieldError,
  FieldFormatting,
  FieldOptions,
  FieldPending,
  FieldSession,
  FieldSurface,
  IconOption,
  IconPickerFacts,
  IconPickerSelection,
  MediaAssetOption,
  MediaAuthoring,
  MediaPresentation,
  OperationInputFieldContract,
  RecordFieldContract,
  RecordFieldPresentation,
  RecordFieldRendererKind,
  ReferenceFacts,
  ReferenceOption,
  ReferenceValueStatus,
  StateMachineFacts,
  StateTransitionOperation,
  ValueUnitCommit,
  ValueUnitField,
} from "@dpeek/formless-presentation/contract";
import {
  fieldLabel,
  recordFieldIsWritable,
  recordFieldRef,
  type CreateDefaultConfig,
  type CreateFieldConfig,
  type GeneratedCommandDraftSessionFacts,
  type GeneratedCommandDraftSessionState,
  type GeneratedCommandInputFieldConfig,
  type RecordFieldConfig,
} from "../../client/views.ts";
import {
  selectTransitionStateOperationAvailability,
  stateMachineStateIsTerminal,
  type TransitionStateOperationConfig,
} from "../../client/state-machine-model.ts";
import {
  listAppIconCatalogEntries,
  resolveIconCatalogSvg,
  type AppIconCatalogEntry,
} from "../../shared/icon-catalog.ts";
import type {
  GeneratedCreateDraftSessionFacts,
  GeneratedCreateDraftSessionState,
} from "./create-field-authoring.ts";
import { selectGeneratedFieldControl, type GeneratedFieldControl } from "./field-controls.ts";
import { fieldValueToInputValue, formatFieldDisplayValue } from "./format.ts";
import type {
  GeneratedOperationDraftSessionFacts,
  GeneratedOperationDraftSessionState,
  GeneratedOperationInputConfigurationError,
  GeneratedOperationInputFieldConfig,
} from "./operation-field-authoring.ts";
import { generatedReferenceDisplayLabel } from "./reference-field-options.ts";
import { toOpaquePickerHexColor } from "./color-utils.ts";
import {
  generatedRecordFieldEditorDraftFromUpdateDraftInput,
  selectGeneratedRecordFieldMediaAuthoring,
  type GeneratedUpdateDraftSessionFacts,
  type GeneratedUpdateDraftSessionState,
} from "./record-field-authoring.ts";
import { selectGeneratedRecordFieldRendererKind } from "./record-field-renderer-model.ts";

export type GeneratedReferenceOption = {
  id: string;
  label: string;
};

export type GeneratedFieldErrorInput =
  | string
  | null
  | undefined
  | GeneratedFieldDraftError
  | readonly GeneratedFieldDraftError[];

export type GeneratedRecordFieldConfig = RecordFieldConfig & {
  suffix?: string;
};

export type GeneratedFieldOwner =
  | {
      kind: "createSurface";
      surfaceId: string;
    }
  | {
      kind: "listItem";
      listId: string;
      recordId: string;
    }
  | {
      formId: string;
      kind: "operationForm";
    }
  | {
      kind: "recordResult";
      recordId: string;
      resultId: string;
    }
  | {
      kind: "standalone";
      ownerId: string;
    }
  | {
      fieldSetId: string;
      kind: "tableEditFieldSet";
      tableId: string;
    };

export type GeneratedFieldOccurrence = {
  owner: GeneratedFieldOwner;
  placementId: string;
};
type GeneratedCreateFieldOwner = Extract<
  GeneratedFieldOwner,
  {
    kind: "createSurface";
  }
>;
type GeneratedOperationFieldOwner = Extract<
  GeneratedFieldOwner,
  {
    kind: "operationForm";
  }
>;
export type GeneratedRecordFieldOwner = Exclude<
  GeneratedFieldOwner,
  GeneratedCreateFieldOwner | GeneratedOperationFieldOwner
>;

export type ProjectGeneratedCreateSessionOptions = {
  defaults?: readonly CreateDefaultConfig[];
  queryContext?: QueryEvaluationContext;
  session: Pick<
    GeneratedCreateDraftSessionFacts,
    "canSubmit" | "defaultsResolved" | "fieldErrors" | "values" | "visibleFields"
  >;
  state: GeneratedCreateDraftSessionState;
};

export type ProjectGeneratedCreateFieldsOptions = ProjectGeneratedCreateSessionOptions & {
  errorsByFieldName?: Readonly<Record<string, GeneratedFieldErrorInput>>;
  iconDialogDraftByFieldName?: Readonly<Record<string, string | undefined>>;
  iconDialogOpenByFieldName?: Readonly<Record<string, boolean | undefined>>;
  iconParseErrorByFieldName?: Readonly<Record<string, string | undefined>>;
  pendingByFieldName?: Readonly<Record<string, boolean>>;
  pendingLabelByFieldName?: Readonly<Record<string, string | undefined>>;
  mediaAssetOptionsByFieldName?: Readonly<Record<string, readonly ClientMediaAssetOption[]>>;
  referenceOptionsByFieldName?: Readonly<Record<string, readonly GeneratedReferenceOption[]>>;
  schema?: AppSchema | null;
  owner: GeneratedCreateFieldOwner;
};

export type ProjectGeneratedCreateSurfaceOptions = Omit<
  ProjectGeneratedCreateFieldsOptions,
  "owner"
> & {
  enabled: boolean;
  entityLabel: string;
  formErrors?: readonly string[];
  id: string;
  isSubmitting: boolean;
  open: boolean;
  submitLabel: string;
  trigger: {
    content: ButtonContent;
    density: "default" | "compact";
    prominence: "primary" | "secondary" | "quiet";
  };
  triggerLabel: string;
};

export type ProjectGeneratedCreateFieldOptions = {
  error?: GeneratedFieldErrorInput;
  fieldConfig: CreateFieldConfig;
  iconDialogDraft?: string;
  iconDialogOpen?: boolean;
  iconParseError?: string;
  isPending?: boolean;
  mediaAssetOptions?: readonly ClientMediaAssetOption[];
  occurrence: GeneratedFieldOccurrence & {
    owner: GeneratedCreateFieldOwner;
  };
  pendingLabel?: string;
  recordId?: string;
  referenceOptions?: readonly GeneratedReferenceOption[];
  schema?: AppSchema | null;
  state?: GeneratedCreateDraftSessionState;
  value?: FieldValue;
};

export type ProjectGeneratedRecordSessionOptions = {
  session: Pick<GeneratedUpdateDraftSessionFacts, "fieldErrors" | "patchValues" | "visibleFields">;
  state: GeneratedUpdateDraftSessionState;
};

export type ProjectGeneratedRecordFieldsOptions = ProjectGeneratedRecordSessionOptions & {
  canPatch: boolean;
  density?: FieldDensity;
  densityByFieldName?: Readonly<Record<string, FieldDensity | undefined>>;
  disabledReasonByFieldName?: Readonly<Record<string, string | undefined>>;
  editorDraftByFieldName?: Readonly<Record<string, string | undefined>>;
  entityName?: string;
  errorsByFieldName?: Readonly<Record<string, GeneratedFieldErrorInput>>;
  iconDialogDraftByFieldName?: Readonly<Record<string, string | undefined>>;
  iconDialogOpenByFieldName?: Readonly<Record<string, boolean | undefined>>;
  iconParseErrorByFieldName?: Readonly<Record<string, string | undefined>>;
  mediaAssetOptionsByFieldName?: Readonly<Record<string, readonly ClientMediaAssetOption[]>>;
  owner: GeneratedRecordFieldOwner;
  pendingByFieldName?: Readonly<Record<string, boolean>>;
  pendingLabelByFieldName?: Readonly<Record<string, string | undefined>>;
  presentation?: RecordFieldPresentation;
  presentationByFieldName?: Readonly<Record<string, RecordFieldPresentation | undefined>>;
  recordId?: string;
  referenceOptionsByFieldName?: Readonly<Record<string, readonly GeneratedReferenceOption[]>>;
  schema?: AppSchema | null;
  showLabel?: boolean;
  showLabelByFieldName?: Readonly<Record<string, boolean | undefined>>;
  surface?: Extract<FieldSurface, "detail" | "record">;
  transitionOperationsByFieldName?: Readonly<
    Record<string, readonly TransitionStateOperationConfig[]>
  >;
  unitDraftByFieldName?: Readonly<Record<string, string | undefined>>;
  unitDraftInputByFieldName?: Readonly<Record<string, GeneratedFieldDraftInput | undefined>>;
};

export type ProjectGeneratedRecordFieldOptions = {
  canPatch: boolean;
  density?: FieldDensity;
  disabledReason?: string;
  draftInput?: GeneratedFieldDraftInput;
  editorDraft?: string;
  entityName?: string;
  error?: GeneratedFieldErrorInput;
  fieldConfig: GeneratedRecordFieldConfig;
  iconDialogDraft?: string;
  iconDialogOpen?: boolean;
  iconParseError?: string;
  isPending?: boolean;
  mediaAssetOptions?: readonly ClientMediaAssetOption[];
  occurrence: GeneratedFieldOccurrence & {
    owner: GeneratedRecordFieldOwner;
  };
  pendingLabel?: string;
  presentation?: RecordFieldPresentation;
  recordId?: string;
  recordValue: FieldValue | undefined;
  referenceOptions?: readonly GeneratedReferenceOption[];
  schema?: AppSchema | null;
  showLabel?: boolean;
  surface?: Extract<FieldSurface, "detail" | "record">;
  transitionOperations?: readonly TransitionStateOperationConfig[];
  unitDraft?: string;
  unitDraftInput?: GeneratedFieldDraftInput;
  unitRecordValue?: FieldValue;
};

export type ProjectGeneratedDisplayFieldOptions = {
  density?: FieldDensity;
  fieldConfig: GeneratedRecordFieldConfig;
  mediaAssetOptions?: readonly ClientMediaAssetOption[];
  occurrence: GeneratedFieldOccurrence & {
    owner: GeneratedRecordFieldOwner;
  };
  recordId?: string;
  recordValue: FieldValue | undefined;
  referenceOptions?: readonly GeneratedReferenceOption[];
  schema?: AppSchema | null;
  showLabel?: boolean;
  surface?: Exclude<FieldSurface, "create" | "operation">;
  transitionOperations?: readonly TransitionStateOperationConfig[];
};

export type ProjectGeneratedOperationSessionOptions = {
  session: Pick<
    GeneratedOperationDraftSessionFacts,
    "canSubmit" | "configurationErrors" | "fieldErrors" | "input" | "visibleFields"
  >;
  state: GeneratedOperationDraftSessionState;
};

export type ProjectGeneratedOperationFieldsOptions = ProjectGeneratedOperationSessionOptions & {
  errorsByFieldName?: Readonly<Record<string, GeneratedFieldErrorInput>>;
  iconDialogDraftByFieldName?: Readonly<Record<string, string | undefined>>;
  iconDialogOpenByFieldName?: Readonly<Record<string, boolean | undefined>>;
  iconParseErrorByFieldName?: Readonly<Record<string, string | undefined>>;
  pendingByFieldName?: Readonly<Record<string, boolean>>;
  pendingLabelByFieldName?: Readonly<Record<string, string | undefined>>;
  schema?: AppSchema | null;
  owner: GeneratedOperationFieldOwner;
};

export type ProjectGeneratedOperationFieldOptions = {
  error?: GeneratedFieldErrorInput;
  fieldConfig: GeneratedOperationInputFieldConfig | GeneratedCommandInputFieldConfig;
  iconDialogDraft?: string;
  iconDialogOpen?: boolean;
  iconParseError?: string;
  isPending?: boolean;
  occurrence: GeneratedFieldOccurrence & {
    owner: GeneratedOperationFieldOwner;
  };
  pendingLabel?: string;
  schema?: AppSchema | null;
  state?: GeneratedOperationDraftSessionState;
  value?: FieldValue;
};

export type ProjectGeneratedCommandFieldsOptions = {
  owner: GeneratedOperationFieldOwner;
  schema?: AppSchema | null;
  session: GeneratedCommandDraftSessionFacts;
  state: GeneratedCommandDraftSessionState;
};

export function projectGeneratedFieldId({ owner, placementId }: GeneratedFieldOccurrence): string {
  const ownerParts = (() => {
    switch (owner.kind) {
      case "createSurface":
        return [owner.surfaceId];
      case "listItem":
        return [owner.listId, owner.recordId];
      case "operationForm":
        return [owner.formId];
      case "recordResult":
        return [owner.resultId, owner.recordId];
      case "standalone":
        return [owner.ownerId];
      case "tableEditFieldSet":
        return [owner.tableId, owner.fieldSetId];
    }
  })();

  return ["field", owner.kind, ...ownerParts, placementId]
    .map((part) => encodeURIComponent(part))
    .join(":");
}

export function projectGeneratedCreateSession({
  defaults = [],
  queryContext,
  session,
  state,
}: ProjectGeneratedCreateSessionOptions): FieldSession {
  return {
    canSubmit: session.canSubmit,
    defaults: projectGeneratedCreateDefaults(defaults),
    defaultsResolved: session.defaultsResolved,
    draft: state.draft,
    fieldErrors: projectFieldErrorMap(session.fieldErrors),
    ...(queryContext === undefined ? {} : { queryContext }),
    values: session.values,
    visibleFieldNames: session.visibleFields.map((field) => field.fieldName),
  };
}

export function projectGeneratedCreateDefaults(
  defaults: readonly CreateDefaultConfig[],
): CreateDefault[] {
  return defaults.map((defaultConfig) => ({
    field: defaultConfig.field,
    fieldName: defaultConfig.fieldName,
    value: defaultConfig.value,
  }));
}

export function projectGeneratedCreateFields({
  errorsByFieldName,
  iconDialogDraftByFieldName,
  iconDialogOpenByFieldName,
  iconParseErrorByFieldName,
  mediaAssetOptionsByFieldName,
  pendingByFieldName,
  pendingLabelByFieldName,
  referenceOptionsByFieldName,
  schema = null,
  owner,
  session,
  state,
}: ProjectGeneratedCreateFieldsOptions): CreateFieldContract[] {
  return session.visibleFields.map((fieldConfig) =>
    projectGeneratedCreateField({
      error:
        errorsByFieldName?.[fieldConfig.fieldName] ?? session.fieldErrors[fieldConfig.fieldName],
      fieldConfig,
      iconDialogDraft: iconDialogDraftByFieldName?.[fieldConfig.fieldName],
      iconDialogOpen: iconDialogOpenByFieldName?.[fieldConfig.fieldName],
      iconParseError: iconParseErrorByFieldName?.[fieldConfig.fieldName],
      isPending: pendingByFieldName?.[fieldConfig.fieldName],
      mediaAssetOptions: mediaAssetOptionsByFieldName?.[fieldConfig.fieldName],
      occurrence: { owner, placementId: fieldConfig.fieldName },
      pendingLabel: pendingLabelByFieldName?.[fieldConfig.fieldName],
      referenceOptions: referenceOptionsByFieldName?.[fieldConfig.fieldName],
      schema,
      state,
      value: session.values[fieldConfig.fieldName],
    }),
  );
}

export function projectGeneratedCreateSurface({
  enabled,
  entityLabel,
  errorsByFieldName,
  formErrors: runtimeFormErrors = [],
  iconDialogDraftByFieldName,
  iconDialogOpenByFieldName,
  iconParseErrorByFieldName,
  id,
  isSubmitting,
  mediaAssetOptionsByFieldName,
  open,
  pendingByFieldName,
  pendingLabelByFieldName,
  referenceOptionsByFieldName,
  schema = null,
  session,
  state,
  submitLabel,
  trigger,
  triggerLabel,
}: ProjectGeneratedCreateSurfaceOptions): CreateSurfaceContract {
  const disabledReason = !enabled
    ? `Create is disabled for ${entityLabel}.`
    : !session.defaultsResolved
      ? `Create ${entityLabel.toLowerCase()} requires a selected context.`
      : undefined;
  const fieldsDisabled = disabledReason !== undefined || isSubmitting;
  const visibleFieldNames = new Set(session.visibleFields.map((field) => field.fieldName));
  const formErrors = [
    ...runtimeFormErrors,
    ...Object.values(session.fieldErrors)
      .filter((error) => !visibleFieldNames.has(error.fieldName))
      .map((error) => error.message),
  ];
  const fields = projectGeneratedCreateFields({
    errorsByFieldName,
    iconDialogDraftByFieldName,
    iconDialogOpenByFieldName,
    iconParseErrorByFieldName,
    mediaAssetOptionsByFieldName,
    owner: { kind: "createSurface", surfaceId: id },
    pendingByFieldName,
    pendingLabelByFieldName,
    referenceOptionsByFieldName,
    schema,
    session,
    state,
  });

  return {
    dialog: {
      form: {
        cancel: {
          accessibilityLabel: "Cancel",
          content: { kind: "label", label: "Cancel" },
          density: "default",
          id: `${id}:cancel`,
          kind: "button",
          prominence: "secondary",
          type: "button",
        },
        errors: formErrors,
        fieldSet: {
          disabled: fieldsDisabled,
          ...(fieldsDisabled
            ? {
                disabledReason:
                  disabledReason ?? `Create ${entityLabel.toLowerCase()} is being submitted.`,
              }
            : {}),
          errors: formErrors,
          fields,
          id: `${id}:fields`,
          kind: "fieldSet",
        },
        id: `${id}:form`,
        kind: "createForm",
        submit: {
          accessibilityLabel: submitLabel,
          content: {
            kind: "label",
            label: isSubmitting ? "Saving..." : enabled ? submitLabel : "Create disabled",
          },
          density: "default",
          disabled: !session.canSubmit || isSubmitting,
          id: `${id}:submit`,
          kind: "button",
          pending: isSubmitting ? { isPending: true, label: "Saving" } : undefined,
          prominence: "primary",
          type: "submit",
        },
      },
      id: `${id}:dialog`,
      kind: "createDialog",
      open,
      title: submitLabel,
    },
    id,
    kind: "createSurface",
    trigger: {
      accessibilityLabel: triggerLabel,
      content: trigger.content,
      density: trigger.density,
      disabled: disabledReason !== undefined,
      ...(disabledReason === undefined ? {} : { disabledReason }),
      id: `${id}:trigger`,
      kind: "button",
      prominence: trigger.prominence,
      type: "button",
    },
  };
}

export function projectGeneratedCreateField({
  error,
  fieldConfig,
  iconDialogDraft,
  iconDialogOpen,
  iconParseError,
  isPending = false,
  mediaAssetOptions = [],
  occurrence,
  pendingLabel,
  recordId,
  referenceOptions = [],
  schema = null,
  state,
  value,
}: ProjectGeneratedCreateFieldOptions): CreateFieldContract {
  const { editor, field, fieldName } = fieldConfig;
  const label = fieldLabel(fieldName, field);
  const control = selectGeneratedFieldControl({ editor, field, label });
  const draftInput = state?.draft.values[fieldName];
  const referenceDefault =
    field.type === "reference" &&
    field.required &&
    draftInput === undefined &&
    (value === undefined || value === "")
      ? referenceOptions[0]?.id
      : undefined;
  const projectedDraftInput =
    referenceDefault === undefined
      ? draftInput
      : ({ kind: "input", value: referenceDefault } as const);
  const typedDraftValue =
    projectedDraftInput?.kind === "value" ? projectedDraftInput.value : undefined;
  const resolvedValue =
    referenceDefault ??
    value ??
    typedDraftValue ??
    stateMachineCreateValue(fieldConfig, projectedDraftInput);
  const editorValue = projectedDraftInput?.value ?? resolvedValue;
  const media = projectCreateMediaAuthoring({
    control,
    fieldName,
    mediaAssetOptions,
    value: editorValue,
  });
  const icon = selectProjectedIconAuthoring({
    dialogDraft: iconDialogDraft,
    dialogOpen: iconDialogOpen,
    draft: typeof editorValue === "string" ? editorValue : "",
    field,
    isIcon: control.controlKind === "icon",
    isPending,
    parseError: iconParseError,
    required: field.required,
    schema,
  });

  return {
    ...projectBaseField({
      access: fieldConfig.stateMachine === undefined ? editableAccess() : stateMachineAccess(),
      commit: "submit",
      control,
      error,
      fieldConfig: {
        editor,
        field,
        fieldName,
        ...(fieldConfig.presentation === undefined
          ? {}
          : { presentation: fieldConfig.presentation }),
        ...(fieldConfig.stateMachine === undefined
          ? {}
          : { stateMachine: fieldConfig.stateMachine }),
        ...(fieldConfig.visibleWhen === undefined ? {} : { visibleWhen: fieldConfig.visibleWhen }),
      },
      fieldId: projectGeneratedFieldId(occurrence),
      label,
      labelVisibility: "visible",
      options: projectFieldOptions({
        field,
        includeIconOptions: control.controlKind === "icon",
        mediaAssetOptions: control.controlKind === "media" ? mediaAssetOptions : undefined,
        referenceOptions,
        schema,
      }),
      pending: projectPending(isPending, pendingLabel),
      recordId,
      stateMachineFacts: projectStateMachineFacts({
        currentValue: resolvedValue,
        field,
        stateMachine: fieldConfig.stateMachine,
      }),
      surface: "create",
    }),
    color: projectColorFacts(control, editorValue),
    commit: "submit",
    density: "default",
    draftInput: projectedDraftInput,
    enum:
      fieldConfig.stateMachine === undefined
        ? projectEnumEditorFacts({
            field,
            style: "plain",
            surface: "create",
            value: editorValue,
          })
        : undefined,
    ...(icon === undefined ? {} : { icon }),
    mode: "editor",
    ...(media === undefined ? {} : { media }),
    reference: projectReferenceEditorFacts(field, editorValue, referenceOptions),
    surface: "create",
    value: resolvedValue,
  };
}

export function projectGeneratedRecordSession({
  session,
  state,
}: ProjectGeneratedRecordSessionOptions): FieldSession {
  return {
    draft: state.draft,
    fieldErrors: projectFieldErrorMap(session.fieldErrors),
    values: session.patchValues,
    visibleFieldNames: session.visibleFields.map((field) => field.fieldName),
  };
}

export function projectGeneratedRecordFields({
  canPatch,
  density = "default",
  densityByFieldName,
  disabledReasonByFieldName,
  editorDraftByFieldName,
  entityName,
  errorsByFieldName,
  iconDialogDraftByFieldName,
  iconDialogOpenByFieldName,
  iconParseErrorByFieldName,
  mediaAssetOptionsByFieldName,
  owner,
  pendingByFieldName,
  pendingLabelByFieldName,
  presentation = "default",
  presentationByFieldName,
  recordId,
  referenceOptionsByFieldName,
  schema = null,
  session,
  showLabel = false,
  showLabelByFieldName,
  state,
  surface = "record",
  transitionOperationsByFieldName,
  unitDraftByFieldName,
  unitDraftInputByFieldName,
}: ProjectGeneratedRecordFieldsOptions): FieldContract[] {
  return session.visibleFields.map((fieldConfig) => {
    const valueUnit = fieldConfig.valueUnit;
    const unitFieldName = valueUnit?.unitFieldName;

    return projectGeneratedRecordField({
      canPatch,
      density: densityByFieldName?.[fieldConfig.fieldName] ?? density,
      disabledReason: disabledReasonByFieldName?.[fieldConfig.fieldName],
      draftInput: state.draft.values[fieldConfig.fieldName],
      editorDraft: editorDraftByFieldName?.[fieldConfig.fieldName],
      entityName,
      error:
        errorsByFieldName?.[fieldConfig.fieldName] ?? session.fieldErrors[fieldConfig.fieldName],
      fieldConfig,
      iconDialogDraft: iconDialogDraftByFieldName?.[fieldConfig.fieldName],
      iconDialogOpen: iconDialogOpenByFieldName?.[fieldConfig.fieldName],
      iconParseError: iconParseErrorByFieldName?.[fieldConfig.fieldName],
      isPending: pendingByFieldName?.[fieldConfig.fieldName],
      mediaAssetOptions: mediaAssetOptionsByFieldName?.[fieldConfig.fieldName],
      occurrence: { owner, placementId: fieldConfig.fieldName },
      pendingLabel: pendingLabelByFieldName?.[fieldConfig.fieldName],
      presentation: presentationByFieldName?.[fieldConfig.fieldName] ?? presentation,
      recordId,
      recordValue: state.baselineValues[fieldConfig.fieldName],
      referenceOptions: referenceOptionsByFieldName?.[fieldConfig.fieldName],
      schema,
      showLabel: showLabelByFieldName?.[fieldConfig.fieldName] ?? showLabel,
      surface,
      transitionOperations: transitionOperationsByFieldName?.[fieldConfig.fieldName],
      unitDraft: unitDraftByFieldName?.[fieldConfig.fieldName],
      unitDraftInput:
        unitDraftInputByFieldName?.[fieldConfig.fieldName] ??
        (unitFieldName === undefined ? undefined : state.draft.values[unitFieldName]),
      unitRecordValue:
        unitFieldName === undefined ? undefined : state.baselineValues[unitFieldName],
    });
  });
}

export function projectGeneratedRecordField({
  canPatch,
  density = "default",
  disabledReason,
  draftInput,
  editorDraft,
  entityName = "",
  error,
  fieldConfig,
  iconDialogDraft,
  iconDialogOpen,
  iconParseError,
  isPending = false,
  mediaAssetOptions = [],
  occurrence,
  pendingLabel,
  presentation = "default",
  recordId,
  recordValue,
  referenceOptions = [],
  schema = null,
  showLabel = false,
  surface = "record",
  transitionOperations,
  unitDraft,
  unitDraftInput,
  unitRecordValue,
}: ProjectGeneratedRecordFieldOptions): RecordFieldContract | DisplayFieldContract {
  const { field, fieldName } = fieldConfig;
  const label = fieldConfig.label ?? fieldLabel(fieldName, field);
  const control = selectGeneratedFieldControl({ editor: fieldConfig.editor, field, label });
  const access = selectRecordAccess(fieldConfig, canPatch, disabledReason);
  const displayField = projectGeneratedDisplayField({
    density,
    fieldConfig,
    mediaAssetOptions,
    occurrence,
    recordId,
    recordValue,
    referenceOptions,
    schema,
    showLabel,
    surface,
    transitionOperations,
  });

  if (access.kind === "system" || access.kind === "readOnly" || access.kind === "stateMachine") {
    return {
      ...displayField,
      access,
      control,
      errors: projectFieldErrors(fieldName, error),
      pending: projectPending(isPending, pendingLabel),
    };
  }

  const rendererKind = selectGeneratedRecordFieldRendererKind({
    density,
    fieldConfig,
    fieldControl: control,
    presentation,
    showLabel,
  });
  const numberFormat = fieldConfig.format ?? "plain";
  const draft =
    editorDraft ??
    generatedRecordFieldEditorDraftFromUpdateDraftInput({
      draftInput,
      fieldConfig,
      numberFormat,
      recordValue,
    });
  const projectedUnitDraft = projectUnitDraft({
    fieldConfig,
    unitDraft,
    unitDraftInput,
    unitRecordValue,
  });
  const mediaAuthoring = selectProjectedMediaAuthoring({
    draft,
    entityName,
    fieldConfig,
    mediaAssetOptions,
    rendererKind,
    schema,
  });
  const iconAuthoring = selectProjectedIconAuthoring({
    dialogDraft: iconDialogDraft,
    dialogOpen: iconDialogOpen,
    draft,
    field,
    isIcon: rendererKind === "icon",
    isPending,
    parseError: iconParseError,
    required: field.required,
    schema,
  });

  return {
    ...projectBaseField({
      access,
      commit: fieldConfig.commit,
      control,
      error,
      fieldConfig,
      fieldId: projectGeneratedFieldId(occurrence),
      label,
      labelVisibility: showLabel ? "visible" : "hidden",
      options: projectFieldOptions({
        field,
        includeIconOptions: control.controlKind === "icon",
        mediaAssetOptions,
        referenceOptions,
        schema,
      }),
      pending: projectPending(isPending, pendingLabel),
      recordId,
      stateMachineFacts: projectStateMachineFacts({
        currentValue: recordValue,
        field,
        stateMachine: fieldConfig.stateMachine,
        transitionOperations,
      }),
      surface,
    }),
    color: projectColorFacts(control, draft),
    commit: fieldConfig.commit,
    density,
    drafts: {
      draft,
      draftInput,
      recordValue,
      unitDraft: projectedUnitDraft.unitDraft,
      unitDraftInput: projectedUnitDraft.unitDraftInput,
      unitRecordValue,
    },
    formatting: displayField.formatting,
    enum: projectEnumEditorFacts({
      field,
      presentation: fieldConfig.presentation,
      style: rendererKind === "enum-icon" ? "rich" : "plain",
      surface,
      value: draft,
    }),
    ...(iconAuthoring === undefined ? {} : { icon: iconAuthoring }),
    ...(mediaAuthoring === undefined ? {} : { media: mediaAuthoring }),
    mode: "editor",
    presentationMode: presentation,
    reference: projectReferenceEditorFacts(field, draft, referenceOptions),
    rendererKind,
    surface,
    value: recordValue,
    valueUnit: projectValueUnitField(fieldConfig.valueUnit, projectedUnitDraft.unitDraft),
  };
}

export function projectGeneratedDisplayField({
  density = "default",
  fieldConfig,
  mediaAssetOptions = [],
  occurrence,
  recordId,
  recordValue,
  referenceOptions = [],
  schema = null,
  showLabel,
  surface = "detail",
  transitionOperations,
}: ProjectGeneratedDisplayFieldOptions): DisplayFieldContract {
  const label = fieldConfig.label ?? fieldLabel(fieldConfig.fieldName, fieldConfig.field);
  const control = selectGeneratedFieldControl({
    editor: fieldConfig.editor,
    field: fieldConfig.field,
    label,
  });
  const media = projectMediaPresentation({
    control,
    mediaAssetOptions,
    value: recordValue,
  });
  const icon = selectProjectedIconAuthoring({
    draft: typeof recordValue === "string" ? recordValue : "",
    field: fieldConfig.field,
    isIcon: control.controlKind === "icon",
    isPending: false,
    required: fieldConfig.field.required,
    schema,
  });

  return {
    ...projectBaseField({
      access: selectDisplayAccess(fieldConfig),
      commit: "submit",
      control,
      fieldConfig,
      fieldId: projectGeneratedFieldId(occurrence),
      label,
      labelVisibility: surface === "record" && showLabel !== true ? "hidden" : "visible",
      options: projectFieldOptions({
        field: fieldConfig.field,
        includeIconOptions: control.controlKind === "icon",
        mediaAssetOptions: control.controlKind === "media" ? mediaAssetOptions : undefined,
        referenceOptions,
        schema,
      }),
      recordId,
      stateMachineFacts: projectStateMachineFacts({
        currentValue: recordValue,
        field: fieldConfig.field,
        stateMachine: fieldConfig.stateMachine,
        transitionOperations,
      }),
      surface,
    }),
    color: projectColorFacts(control, recordValue),
    density,
    enum: projectEnumDisplayFacts({
      field: fieldConfig.field,
      presentation: fieldConfig.presentation,
      value: recordValue,
    }),
    formatting: projectDisplayFormatting({ fieldConfig, recordValue, referenceOptions }),
    ...(icon === undefined ? {} : { icon }),
    ...(media === undefined ? {} : { media }),
    mode: "display",
    reference: projectReferenceDisplayFacts(fieldConfig.field, recordValue, referenceOptions),
    value: recordValue,
  };
}

export function projectGeneratedOperationSession({
  session,
  state,
}: ProjectGeneratedOperationSessionOptions): FieldSession {
  return {
    canSubmit: session.canSubmit,
    configurationErrors: projectOperationConfigurationErrors(session.configurationErrors),
    draft: state.draft,
    fieldErrors: projectFieldErrorMap(session.fieldErrors),
    values: session.input,
    visibleFieldNames: session.visibleFields.map((field) => field.inputName),
  };
}

export function projectGeneratedOperationFields({
  errorsByFieldName,
  iconDialogDraftByFieldName,
  iconDialogOpenByFieldName,
  iconParseErrorByFieldName,
  pendingByFieldName,
  pendingLabelByFieldName,
  schema = null,
  owner,
  session,
  state,
}: ProjectGeneratedOperationFieldsOptions): OperationInputFieldContract[] {
  return session.visibleFields.map((fieldConfig) =>
    projectGeneratedOperationField({
      error:
        errorsByFieldName?.[fieldConfig.inputName] ?? session.fieldErrors[fieldConfig.inputName],
      fieldConfig,
      iconDialogDraft: iconDialogDraftByFieldName?.[fieldConfig.inputName],
      iconDialogOpen: iconDialogOpenByFieldName?.[fieldConfig.inputName],
      iconParseError: iconParseErrorByFieldName?.[fieldConfig.inputName],
      isPending: pendingByFieldName?.[fieldConfig.inputName],
      occurrence: { owner, placementId: fieldConfig.inputName },
      pendingLabel: pendingLabelByFieldName?.[fieldConfig.inputName],
      schema,
      state,
      value: session.input[fieldConfig.inputName],
    }),
  );
}

export function projectGeneratedCommandFields({
  owner,
  schema = null,
  session,
  state,
}: ProjectGeneratedCommandFieldsOptions): OperationInputFieldContract[] {
  return session.visibleFields.map((fieldConfig) =>
    projectGeneratedOperationField({
      error: session.fieldErrors[fieldConfig.inputName],
      fieldConfig,
      occurrence: { owner, placementId: fieldConfig.inputName },
      schema,
      state,
      value: session.input[fieldConfig.inputName],
    }),
  );
}

export function projectGeneratedOperationField({
  error,
  fieldConfig,
  iconDialogDraft,
  iconDialogOpen,
  iconParseError,
  isPending = false,
  occurrence,
  pendingLabel,
  schema = null,
  state,
  value,
}: ProjectGeneratedOperationFieldOptions): OperationInputFieldContract {
  const { editor, field, inputName, label } = fieldConfig;
  const control = selectGeneratedFieldControl({ editor, field, label });
  const draftInput = state?.draft.values[inputName];
  const editorValue = draftInput?.value ?? value;
  const icon = selectProjectedIconAuthoring({
    dialogDraft: iconDialogDraft,
    dialogOpen: iconDialogOpen,
    draft: typeof editorValue === "string" ? editorValue : "",
    field,
    isIcon: control.controlKind === "icon",
    isPending,
    parseError: iconParseError,
    required: field.required,
    schema,
  });

  return {
    ...projectBaseField({
      access: editableAccess(),
      commit: "submit",
      control,
      error,
      fieldConfig,
      fieldId: projectGeneratedFieldId(occurrence),
      inputName,
      label,
      labelVisibility: "visible",
      options: projectFieldOptions({
        field,
        includeIconOptions: control.controlKind === "icon",
        schema,
      }),
      pending: projectPending(isPending, pendingLabel),
      surface: "operation",
    }),
    color: projectColorFacts(control, draftInput?.value ?? value),
    commit: "submit",
    density: "default",
    draftInput,
    enum: projectEnumEditorFacts({
      field,
      style: "plain",
      surface: "operation",
      value: draftInput?.value ?? value,
    }),
    ...(icon === undefined ? {} : { icon }),
    ...("control" in fieldConfig ? { input: fieldConfig } : {}),
    inputName,
    mode: "editor",
    surface: "operation",
    value,
  };
}

export function selectValueUnitCommit(field: RecordFieldContract): ValueUnitCommit | undefined {
  if (field.valueUnit === undefined) {
    return undefined;
  }

  const { draftInput, unitDraftInput } = field.drafts;

  if (draftInput === undefined || unitDraftInput === undefined) {
    return undefined;
  }

  return {
    fieldDraftInput: draftInput,
    unitDraftInput,
  };
}

function projectBaseField({
  access,
  commit,
  control,
  error,
  fieldConfig,
  fieldId,
  inputName,
  label,
  labelVisibility,
  options,
  pending,
  recordId,
  stateMachineFacts,
  surface,
}: {
  access: FieldAccess;
  commit: FieldContract["commit"];
  control: GeneratedFieldControl;
  error?: GeneratedFieldErrorInput;
  fieldConfig:
    | CreateFieldConfig
    | GeneratedCommandInputFieldConfig
    | GeneratedRecordFieldConfig
    | GeneratedOperationInputFieldConfig;
  fieldId: string;
  inputName?: string;
  label: string;
  labelVisibility: BaseFieldContract["labelVisibility"];
  options?: FieldOptions;
  pending?: FieldPending;
  recordId?: string;
  stateMachineFacts?: StateMachineFacts;
  surface: FieldSurface;
}): BaseFieldContract {
  return {
    access,
    commit,
    control: control as FieldControl,
    editor: fieldConfig.editor,
    errors: projectFieldErrors(fieldConfig.fieldName, error),
    field: fieldConfig.field,
    fieldId,
    fieldName: fieldConfig.fieldName,
    ...(recordFieldConfigHasFieldRef(fieldConfig) && fieldConfig.fieldRef !== undefined
      ? { fieldRef: fieldConfig.fieldRef }
      : {}),
    ...(inputName === undefined ? {} : { inputName }),
    label,
    labelVisibility,
    options,
    pending,
    presentation: fieldConfigPresentation(fieldConfig),
    recordId,
    required: fieldConfig.field.required,
    stateMachine: fieldConfigStateMachine(fieldConfig),
    stateMachineFacts,
    surface,
    suffix: "suffix" in fieldConfig ? fieldConfig.suffix : undefined,
    valueUnit:
      "valueUnit" in fieldConfig ? projectValueUnitField(fieldConfig.valueUnit) : undefined,
    visibleWhen: fieldConfigVisibleWhen(fieldConfig),
    writable: "writable" in fieldConfig ? fieldConfig.writable : undefined,
  };
}

function projectColorFacts(
  control: FieldControl,
  value: FieldValue | undefined,
): ColorFacts | undefined {
  if (control.controlKind !== "color") {
    return undefined;
  }

  const text = typeof value === "string" ? value : "";
  const colorValue = toOpaquePickerHexColor(text);

  return {
    picker: colorValue === undefined ? { kind: "unavailable" } : { kind: "hex", value: colorValue },
    swatch: colorValue === undefined ? { kind: "unavailable" } : { kind: "hex", value: colorValue },
  };
}

function projectValueUnitField(
  valueUnit: GeneratedRecordFieldConfig["valueUnit"] | undefined,
  currentValue = "",
): ValueUnitField | undefined {
  if (valueUnit === undefined) {
    return undefined;
  }
  const declaredOptions = valueUnit.unitField.values.map((option) => ({
    label: option.label,
    status: "declared" as const,
    value: option.key,
  }));
  const options =
    currentValue !== "" && !valueUnit.unitField.values.some((option) => option.key === currentValue)
      ? [
          {
            label: currentValue,
            status: "undeclaredCurrent" as const,
            value: currentValue,
          },
          ...declaredOptions,
        ]
      : declaredOptions;

  return {
    clearable: !valueUnit.unitField.required,
    options,
    required: valueUnit.unitField.required,
    unitField: valueUnit.unitField,
    unitFieldName: valueUnit.unitFieldName,
  };
}

function projectFieldOptions({
  field,
  includeIconOptions = false,
  mediaAssetOptions,
  referenceOptions = [],
  schema = null,
}: {
  field: FieldSchema;
  includeIconOptions?: boolean;
  mediaAssetOptions?: readonly ClientMediaAssetOption[];
  referenceOptions?: readonly GeneratedReferenceOption[];
  schema?: AppSchema | null;
}): FieldOptions | undefined {
  if (field.type === "enum") {
    return {
      enumOptions: projectEnumOptions(field),
    };
  }

  if (field.type === "reference") {
    return {
      referenceOptions: projectReferenceOptions(referenceOptions),
    };
  }

  if (includeIconOptions) {
    return {
      iconOptions: projectIconOptions(schema),
      ...(field.type === "text" && field.suggestions !== undefined
        ? { textSuggestions: [...field.suggestions] }
        : {}),
    };
  }

  if (mediaAssetOptions !== undefined) {
    return {
      mediaAssetOptions: mediaAssetOptions.map(projectMediaAssetOption),
      ...(field.type === "text" && field.suggestions !== undefined
        ? { textSuggestions: [...field.suggestions] }
        : {}),
    };
  }

  if (field.type === "text" && field.suggestions !== undefined) {
    return {
      textSuggestions: [...field.suggestions],
    };
  }

  return undefined;
}

function projectDisplayFormatting({
  fieldConfig,
  recordValue,
  referenceOptions,
}: {
  fieldConfig: GeneratedRecordFieldConfig;
  recordValue: FieldValue | undefined;
  referenceOptions: readonly GeneratedReferenceOption[];
}): FieldFormatting & {
  displayValue: string;
} {
  const displayValue =
    fieldConfig.field.type === "reference"
      ? generatedReferenceDisplayLabel(recordValue, referenceOptions)
      : fieldConfig.stateMachine !== undefined
        ? stateMachineDisplayValue(fieldConfig.field, recordValue)
        : formatFieldDisplayValue(fieldConfig, recordValue);
  const temporal = projectTemporalDisplay(fieldConfig, recordValue);

  return {
    displayValue,
    ...(fieldConfig.field.type === "enum" && typeof recordValue === "string"
      ? { enumValuePresentation: projectEnumValuePresentation(fieldConfig.field, recordValue) }
      : {}),
    format: fieldConfig.format,
    suffix: fieldConfig.suffix,
    ...(temporal === undefined ? {} : { temporal }),
  };
}

function projectTemporalDisplay(
  fieldConfig: GeneratedRecordFieldConfig,
  recordValue: FieldValue | undefined,
): FieldFormatting["temporal"] {
  if (typeof recordValue !== "string" || recordValue === "") {
    return undefined;
  }

  if (fieldConfig.field.type === "date") {
    return /^\d{4}-\d{2}-\d{2}$/.test(recordValue)
      ? { kind: "date", value: recordValue }
      : undefined;
  }

  const fieldRef = recordFieldRef(fieldConfig);

  if (
    fieldRef.kind === "system" &&
    fieldRef.name !== "id" &&
    Number.isFinite(Date.parse(recordValue))
  ) {
    return { kind: "dateTime", value: recordValue };
  }

  return undefined;
}

function projectStateMachineFacts({
  currentValue,
  field,
  stateMachine,
  transitionOperations = [],
}: {
  currentValue: FieldValue | undefined;
  field: FieldSchema;
  stateMachine: RecordFieldConfig["stateMachine"];
  transitionOperations?: readonly TransitionStateOperationConfig[];
}): StateMachineFacts | undefined {
  if (stateMachine === undefined) {
    return undefined;
  }

  return {
    currentValue,
    initialState: stateMachine.initialState,
    interaction:
      transitionOperations.length === 0
        ? { kind: "display" }
        : {
            invocationSource: "menuItem",
            kind: "transitions",
            transitions: transitionOperations.map(
              (operation): StateTransitionOperation => ({
                ...operation,
                availability: selectTransitionStateOperationAvailability({
                  currentValue,
                  field: operation.field,
                  operation,
                }),
              }),
            ),
          },
    stateMachine,
    terminal: stateMachineStateIsTerminal(stateMachine, currentValue),
    valueStatus: stateMachineValueStatus(field, currentValue),
  };
}

function stateMachineValueStatus(
  field: FieldSchema,
  currentValue: FieldValue | undefined,
): StateMachineFacts["valueStatus"] {
  if (typeof currentValue !== "string" || currentValue.trim() === "") {
    return { kind: "unset", message: "Current state is missing." };
  }
  if (field.type !== "enum" || !field.values.some((option) => option.key === currentValue)) {
    return {
      kind: "undeclared",
      message: `Current state "${currentValue}" is not declared.`,
      value: currentValue,
    };
  }

  return { kind: "declared", value: currentValue };
}

function projectCreateMediaAuthoring({
  control,
  fieldName,
  mediaAssetOptions,
  value,
}: {
  control: FieldControl;
  fieldName: string;
  mediaAssetOptions: readonly ClientMediaAssetOption[];
  value: FieldValue | undefined;
}): MediaAuthoring | undefined {
  if (control.controlKind !== "media") {
    return undefined;
  }

  const constraints = mediaUploadConstraints(control);

  return {
    ...projectMediaPresentation({ control, mediaAssetOptions, value }),
    accept: constraints.accept,
    fileSelectEnabled: true,
    maxSize: constraints.maxSize,
    removalEnabled: !control.required,
    uploadEnabled: true,
    uploadPatchFields: { mediaAssetFieldName: fieldName },
  };
}

function projectMediaPresentation({
  control,
  mediaAssetOptions,
  value,
}: {
  control: FieldControl;
  mediaAssetOptions: readonly ClientMediaAssetOption[];
  value: FieldValue | undefined;
}): MediaPresentation | undefined {
  if (control.controlKind !== "media") {
    return undefined;
  }

  const selectedValue = typeof value === "string" ? value : "";

  if (selectedValue === "") {
    return {};
  }

  const documentPolicy = control.field.type === "text" ? control.field.asset : undefined;
  const selectedAsset =
    mediaAssetOptions.find((asset) => asset.id === selectedValue) ??
    (documentPolicy?.kind === "document"
      ? undefined
      : coreImageMediaAssetOptionForId(selectedValue));

  return {
    ...(selectedAsset === undefined
      ? {
          missingSelectedAsset: {
            assetId: selectedValue,
            reason: "Selected media asset is unavailable.",
          },
        }
      : projectSelectedMediaAsset(selectedAsset)),
    selectedAssetId: selectedValue,
  };
}

function selectProjectedMediaAuthoring({
  draft,
  entityName,
  fieldConfig,
  mediaAssetOptions,
  rendererKind,
  schema,
}: {
  draft: string;
  entityName: string;
  fieldConfig: GeneratedRecordFieldConfig;
  mediaAssetOptions: readonly ClientMediaAssetOption[];
  rendererKind: RecordFieldRendererKind;
  schema: AppSchema | null;
}): MediaAuthoring | undefined {
  if (rendererKind !== "media") {
    return undefined;
  }

  const mediaAuthoring = selectGeneratedRecordFieldMediaAuthoring({
    draft,
    entityName,
    fieldConfig,
    mediaAssetOptions: Array.from(mediaAssetOptions),
    schema,
  });
  const selectedAssetId = draft !== "" ? draft : undefined;
  const constraints = mediaUploadConstraints({
    field: fieldConfig.field,
    required: fieldConfig.field.required,
  });
  const missingSelectedAsset =
    selectedAssetId !== undefined && mediaAuthoring.selectedAsset === undefined
      ? {
          assetId: selectedAssetId,
          reason: "Selected media asset is unavailable.",
        }
      : undefined;

  return {
    ...(mediaAuthoring.selectedAsset === undefined
      ? {}
      : projectSelectedMediaAsset(mediaAuthoring.selectedAsset)),
    ...(mediaAuthoring.mediaPreviewHref === undefined
      ? {}
      : { mediaPreviewHref: mediaAuthoring.mediaPreviewHref }),
    accept: constraints.accept,
    fileSelectEnabled: mediaAuthoring.uploadEnabled,
    maxSize: constraints.maxSize,
    removalEnabled: !fieldConfig.field.required,
    uploadEnabled: mediaAuthoring.uploadEnabled,
    uploadPatchFields: mediaAuthoring.uploadPatchFields,
    ...(missingSelectedAsset === undefined ? {} : { missingSelectedAsset }),
    ...(selectedAssetId === undefined ? {} : { selectedAssetId }),
  };
}

function mediaUploadConstraints({ field }: Pick<FieldControl, "field" | "required">): {
  accept: string;
  maxSize: number;
} {
  const documentPolicy = field.type === "text" ? field.asset : undefined;

  return documentPolicy?.kind === "document"
    ? {
        accept: documentPolicy.acceptedMimeTypes.join(","),
        maxSize: documentPolicy.maxBytes,
      }
    : {
        accept: IMAGE_UPLOAD_ACCEPT,
        maxSize: MEDIA_IMAGE_UPLOAD_MAX_BYTES,
      };
}

function projectSelectedMediaAsset(
  asset: ClientMediaAssetOption,
): Pick<MediaPresentation, "document" | "previewHref"> {
  if (!("downloadHref" in asset)) {
    return { previewHref: asset.href };
  }

  return {
    document: {
      byteSize: asset.byteSize,
      contentType: asset.contentType,
      downloadIntent: {
        href: asset.downloadHref,
        type: "mediaDocumentDownload",
      },
      filename: asset.filename,
      openIntent: {
        href: asset.href,
        target: "newTab",
        type: "mediaDocumentOpen",
      },
    },
  };
}

function selectProjectedIconAuthoring({
  dialogDraft,
  dialogOpen = false,
  draft,
  field,
  isIcon,
  isPending,
  parseError,
  required,
  schema,
}: {
  dialogDraft?: string;
  dialogOpen?: boolean;
  draft: string;
  field: FieldSchema;
  isIcon: boolean;
  isPending: boolean;
  parseError?: string;
  required: boolean;
  schema: AppSchema | null;
}): IconPickerFacts | undefined {
  const valueMode = iconValueMode(field);

  if (!isIcon || valueMode === undefined) {
    return undefined;
  }

  const projectedDialogDraft = dialogDraft ?? draft;
  const iconOptions = projectIconOptions(schema);
  const selection = selectIconPickerSelection(projectedDialogDraft, valueMode, iconOptions);
  const savedSelection = selectIconPickerSelection(draft, valueMode, iconOptions);
  const effectiveParseError = valueMode === "svgSource" ? parseError : undefined;
  const previewSelection = effectiveParseError === undefined ? selection : savedSelection;
  const emptyValue = projectedDialogDraft.trim() === "";
  const validSelection =
    valueMode === "svgSource"
      ? effectiveParseError === undefined && (!required || !emptyValue)
      : selection.kind === "option" || (!required && selection.kind === "empty");

  return {
    canCancel: dialogOpen,
    canSave: dialogOpen && !isPending && validSelection,
    ...(effectiveParseError === undefined ? {} : { customParseError: effectiveParseError }),
    dialogDraft: projectedDialogDraft,
    dialogOpen,
    emptyValue,
    previewSource: iconPickerSelectionSource(previewSelection),
    savePending: isPending,
    selection,
    valueMode,
  };
}

function iconValueMode(field: FieldSchema): IconValueMode | undefined {
  return field.type === "text" && field.format === "icon"
    ? (field.icon?.valueMode ?? "svgSource")
    : undefined;
}

function selectRecordAccess(
  fieldConfig: GeneratedRecordFieldConfig,
  canPatch: boolean,
  disabledReason: string | undefined,
): FieldAccess {
  const fieldRef = recordFieldRef(fieldConfig);

  if (fieldRef.kind === "system") {
    return { kind: "system", fieldRef };
  }

  if (fieldConfig.stateMachine !== undefined) {
    return stateMachineAccess();
  }

  if (!recordFieldIsWritable(fieldConfig)) {
    return { kind: "readOnly", writable: false };
  }

  if (!canPatch) {
    return {
      kind: "disabled",
      canPatch: false,
      disabledReason,
      writable: true,
    };
  }

  return editableAccess();
}

function selectDisplayAccess(fieldConfig: GeneratedRecordFieldConfig): FieldAccess {
  const fieldRef = recordFieldRef(fieldConfig);

  if (fieldRef.kind === "system") {
    return { kind: "system", fieldRef };
  }

  if (fieldConfig.stateMachine !== undefined) {
    return stateMachineAccess();
  }

  return { kind: "readOnly", writable: false };
}

function editableAccess(): FieldAccess {
  return {
    kind: "editable",
    canPatch: true,
    writable: true,
  };
}

function stateMachineAccess(): FieldAccess {
  return {
    kind: "stateMachine",
    writable: false,
  };
}

function projectPending(isPending: boolean, label: string | undefined): FieldPending | undefined {
  if (!isPending) {
    return undefined;
  }

  return {
    isPending,
    ...(label === undefined ? {} : { label }),
  };
}

function projectFieldErrors(
  fieldName: string,
  error: GeneratedFieldErrorInput,
): readonly FieldError[] | undefined {
  if (error === undefined || error === null) {
    return undefined;
  }

  if (typeof error === "string") {
    return error === "" ? undefined : [{ fieldName, message: error }];
  }

  if (isFieldErrorList(error)) {
    return error.length === 0 ? undefined : error;
  }

  return [error];
}

function projectFieldErrorMap(
  fieldErrors: Record<string, GeneratedFieldDraftError>,
): Record<string, FieldError> {
  return { ...fieldErrors };
}

function projectOperationConfigurationErrors(
  errors: readonly GeneratedOperationInputConfigurationError[],
) {
  return errors.map((error) => ({
    inputName: error.inputName,
    message: error.message,
  }));
}

function projectReferenceOptions(
  options: readonly GeneratedReferenceOption[],
): readonly ReferenceOption[] {
  return options.map((option) => ({
    id: option.id,
    label: option.label,
  }));
}

function projectReferenceEditorFacts(
  field: FieldSchema,
  value: FieldValue | undefined,
  options: readonly GeneratedReferenceOption[],
): ReferenceFacts | undefined {
  if (field.type !== "reference") {
    return undefined;
  }

  return {
    clearable: !field.required,
    kind: "editor",
    valueStatus: referenceValueStatus(value, options),
  };
}

function projectReferenceDisplayFacts(
  field: FieldSchema,
  value: FieldValue | undefined,
  options: readonly GeneratedReferenceOption[],
): ReferenceFacts | undefined {
  if (field.type !== "reference") {
    return undefined;
  }

  return {
    kind: "display",
    valueStatus: referenceValueStatus(value, options),
  };
}

function referenceValueStatus(
  value: FieldValue | undefined,
  options: readonly GeneratedReferenceOption[],
): ReferenceValueStatus {
  if (typeof value !== "string" || value === "") {
    return { kind: "unset" };
  }

  return options.some((option) => option.id === value)
    ? { kind: "resolved", value }
    : { kind: "missing", value };
}

function projectMediaAssetOption(option: ClientMediaAssetOption): MediaAssetOption {
  return {
    ...("byteSize" in option ? { byteSize: option.byteSize } : {}),
    ...("contentType" in option ? { contentType: option.contentType } : {}),
    ...("downloadHref" in option ? { downloadHref: option.downloadHref } : {}),
    ...("filename" in option ? { filename: option.filename } : {}),
    ...(!("height" in option) || option.height === undefined ? {} : { height: option.height }),
    href: option.href,
    id: option.id,
    label: option.label,
    ...(!("width" in option) || option.width === undefined ? {} : { width: option.width }),
  };
}

function projectIconOptions(schema: AppSchema | null): readonly IconOption[] {
  return listAppIconCatalogEntries(schema).map(projectIconOption);
}

function projectIconOption(entry: AppIconCatalogEntry): IconOption {
  return {
    ...(entry.group === undefined ? {} : { group: entry.group }),
    id: entry.key,
    label: entry.label,
    source: entry.source,
  };
}

function selectIconPickerSelection(
  value: string,
  valueMode: IconValueMode,
  options: readonly IconOption[],
): IconPickerSelection {
  if (value.trim() === "") {
    return { kind: "empty" };
  }

  if (valueMode === "iconIdWithSvgFallback" && parseSourceSvg(value) !== null) {
    return { kind: "legacySource", source: value };
  }

  const option = options.find((entry) =>
    valueMode === "svgSource" ? entry.source === value : entry.id === value,
  );

  if (option !== undefined) {
    return {
      kind: "option",
      optionId: option.id,
      source: option.source,
    };
  }

  return valueMode === "svgSource"
    ? { kind: "customSource", source: value }
    : { id: value, kind: "missingId" };
}

function iconPickerSelectionSource(selection: IconPickerSelection): string {
  return selection.kind === "option" ||
    selection.kind === "customSource" ||
    selection.kind === "legacySource"
    ? selection.source
    : "";
}
function projectEnumOptions(
  field: Extract<
    FieldSchema,
    {
      type: "enum";
    }
  >,
): readonly EnumOption[] {
  return field.values.map((option) => ({
    label: option.label,
    presentation: projectEnumValuePresentation(field, option.key),
    status: "declared",
    value: option.key,
  }));
}
function projectEnumValuePresentation(
  field: Extract<
    FieldSchema,
    {
      type: "enum";
    }
  >,
  value: string,
): EnumValuePresentation {
  const option = field.values.find((definition) => definition.key === value);
  const iconToken = option?.presentation?.icon;
  const icon = resolvePresentationIcon(option?.presentation?.icon);
  return {
    color: resolvePresentationColor(option?.presentation?.color),
    ...(icon === undefined ? {} : { icon }),
    iconKnown: iconToken === undefined || icon !== undefined,
    ...(iconToken === undefined ? {} : { iconToken }),
    label: option?.label ?? value,
  };
}

function projectEnumEditorFacts({
  field,
  presentation,
  style,
  surface,
  value,
}: {
  field: FieldSchema;
  presentation?: FieldContract["presentation"];
  style: "plain" | "rich";
  surface: "create" | "detail" | "operation" | "record";
  value: FieldValue | undefined;
}): EnumFacts | undefined {
  if (field.type !== "enum") {
    return undefined;
  }

  const valueStatus = enumValueStatus(field, value);
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

function projectEnumDisplayFacts({
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
    valueStatus: enumValueStatus(field, value),
  };
}
function enumValueStatus(
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

function resolvePresentationIcon(token: string | undefined) {
  const source = resolveIconCatalogSvg(token);

  return source === undefined ? undefined : { kind: "svg" as const, source };
}

function resolvePresentationColor(token: string | undefined) {
  const intent = token === undefined ? undefined : presentationColorIntents[token];

  return {
    intent: intent ?? "neutral",
    known: token === undefined || intent !== undefined,
    ...(token === undefined ? {} : { token }),
  };
}

function stateMachineDisplayValue(field: FieldSchema, value: FieldValue | undefined) {
  if (field.type !== "enum") {
    return "";
  }

  const stateValue = typeof value === "string" ? value : "";

  if (stateValue === "") {
    return "Unset";
  }

  return projectEnumValuePresentation(field, stateValue).label;
}

function stateMachineCreateValue(
  fieldConfig: CreateFieldConfig,
  draftInput: GeneratedFieldDraftInput | undefined,
): FieldValue | undefined {
  if (fieldConfig.stateMachine === undefined) {
    return undefined;
  }

  if (draftInput !== undefined) {
    return draftInput.value;
  }

  return fieldConfig.stateMachine?.initialState;
}

function projectUnitDraft({
  fieldConfig,
  unitDraft,
  unitDraftInput,
  unitRecordValue,
}: {
  fieldConfig: GeneratedRecordFieldConfig;
  unitDraft: string | undefined;
  unitDraftInput: GeneratedFieldDraftInput | undefined;
  unitRecordValue: FieldValue | undefined;
}) {
  if (fieldConfig.valueUnit === undefined) {
    return {
      unitDraft: undefined,
      unitDraftInput: undefined,
    };
  }

  if (unitDraft !== undefined) {
    return {
      unitDraft,
      unitDraftInput: unitDraftInput ?? { kind: "input" as const, value: unitDraft },
    };
  }

  if (unitDraftInput?.kind === "input") {
    return {
      unitDraft: unitDraftInput.value,
      unitDraftInput,
    };
  }

  if (unitDraftInput?.kind === "value") {
    return {
      unitDraft: fieldValueToInputValue(fieldConfig.valueUnit.unitField, unitDraftInput.value),
      unitDraftInput,
    };
  }

  return {
    unitDraft: fieldValueToInputValue(fieldConfig.valueUnit.unitField, unitRecordValue),
    unitDraftInput,
  };
}

function recordFieldConfigHasFieldRef(
  fieldConfig: CreateFieldConfig | GeneratedRecordFieldConfig | GeneratedOperationInputFieldConfig,
): fieldConfig is GeneratedRecordFieldConfig {
  return "fieldRef" in fieldConfig;
}

function fieldConfigPresentation(
  fieldConfig: CreateFieldConfig | GeneratedRecordFieldConfig | GeneratedOperationInputFieldConfig,
) {
  return "presentation" in fieldConfig ? fieldConfig.presentation : undefined;
}

function fieldConfigStateMachine(
  fieldConfig: CreateFieldConfig | GeneratedRecordFieldConfig | GeneratedOperationInputFieldConfig,
) {
  return "stateMachine" in fieldConfig ? fieldConfig.stateMachine : undefined;
}

function fieldConfigVisibleWhen(
  fieldConfig: CreateFieldConfig | GeneratedRecordFieldConfig | GeneratedOperationInputFieldConfig,
) {
  return "visibleWhen" in fieldConfig ? fieldConfig.visibleWhen : undefined;
}

function isFieldErrorList(
  error: GeneratedFieldDraftError | readonly GeneratedFieldDraftError[],
): error is readonly GeneratedFieldDraftError[] {
  return Array.isArray(error);
}

const presentationColorIntents: Record<string, EnumValuePresentation["color"]["intent"]> = {
  danger: "danger",
  error: "danger",
  "priority.high": "danger",
  "priority.low": "success",
  "priority.normal": "warning",
  success: "success",
  warning: "warning",
};
