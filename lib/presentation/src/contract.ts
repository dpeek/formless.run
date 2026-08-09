import type {
  CreateDefaultValueSchema,
  FieldCommitPolicy as SchemaFieldCommitPolicy,
  FieldEditor,
  FieldEditorControl,
  FieldInputAttributes,
  FieldPresentationSchema,
  FieldRef,
  FieldSchema,
  FieldValue,
  FieldVisibilityConditionSchema,
  GeneratedFieldDraft,
  GeneratedFieldDraftError,
  GeneratedFieldDraftInput,
  PublicSafeOperationInputField,
  QueryEvaluationContext,
  RecordValues,
  StateMachineSchema,
  StateMachineTransitionSchema,
  TableColumnFormat,
} from "@dpeek/formless-schema";

export type FieldSurface = "create" | "record" | "table-cell" | "detail" | "operation";

export type FieldMode = "display" | "editor";

export type FieldDensity = "default" | "compact";

export type RecordFieldPresentation = "default" | "heading";

export type FieldAccess =
  | {
      kind: "editable";
      canPatch: true;
      writable: true;
    }
  | {
      kind: "disabled";
      canPatch: false;
      writable: true;
      disabledReason?: string;
    }
  | {
      kind: "readOnly";
      writable: false;
    }
  | {
      kind: "system";
      fieldRef: Extract<FieldRef, { kind: "system" }>;
    }
  | {
      kind: "stateMachine";
      writable: false;
    };

export type FieldCommitPolicy = SchemaFieldCommitPolicy | "submit";

export type FieldIdentity = {
  fieldId: string;
  fieldName: string;
  fieldRef?: FieldRef;
  inputName?: string;
  recordId?: string;
};

export type FieldMetadata = {
  editor: FieldEditor;
  field: FieldSchema;
  label: string;
  required: boolean;
  visibleWhen?: FieldVisibilityConditionSchema;
  presentation?: FieldPresentationSchema;
};

export type ValueUnitField = {
  clearable: boolean;
  options: readonly ValueUnitOption[];
  required: boolean;
  unitFieldName: string;
  unitField: Extract<FieldSchema, { type: "enum" }>;
};

export type ValueUnitOption = {
  label: string;
  status: "declared" | "undeclaredCurrent";
  value: string;
};

export type StateMachineField = {
  fieldName: string;
  machineName: string;
  machine: StateMachineSchema;
  initialState: string;
  terminalStates: string[];
};

export type FieldConfig = FieldIdentity &
  FieldMetadata & {
    commit: FieldCommitPolicy;
    format?: TableColumnFormat;
    stateMachine?: StateMachineField;
    suffix?: string;
    valueUnit?: ValueUnitField;
    writable?: boolean;
  };

export type CreateDefault = {
  fieldName: string;
  field: FieldSchema;
  value: CreateDefaultValueSchema;
};

export type FieldControlKind =
  | "checkbox"
  | "color"
  | "date"
  | "icon"
  | "markdown"
  | "media"
  | "number"
  | "reference"
  | "select"
  | "text"
  | "textarea";

export type TextFieldEditor = Extract<
  FieldEditor,
  "color" | "href" | "icon" | "markdown" | "media" | "slug" | "text" | "textarea"
>;

export type FieldControlFacts = {
  control: FieldEditorControl;
  controlKind: FieldControlKind;
  createDefaultChecked: boolean;
  createDefaultValue: string | undefined;
  editor: FieldEditor;
  inputAttributes: FieldInputAttributes;
  label: string;
  required: boolean;
};

export type FieldControl =
  | ({
      kind: "text";
      field: Extract<FieldSchema, { type: "text" }>;
      editor: TextFieldEditor;
    } & FieldControlFacts)
  | ({
      kind: "boolean";
      field: Extract<FieldSchema, { type: "boolean" }>;
    } & FieldControlFacts)
  | ({
      kind: "date";
      field: Extract<FieldSchema, { type: "date" }>;
    } & FieldControlFacts)
  | ({
      kind: "number";
      field: Extract<FieldSchema, { type: "number" }>;
    } & FieldControlFacts)
  | ({
      kind: "enum";
      field: Extract<FieldSchema, { type: "enum" }>;
    } & FieldControlFacts)
  | ({
      kind: "reference";
      field: Extract<FieldSchema, { type: "reference" }>;
    } & FieldControlFacts);

export type RecordFieldRendererKind =
  | "autosize-text"
  | "checkbox"
  | "completion-checkbox"
  | "color"
  | "date"
  | "enum"
  | "enum-icon"
  | "icon"
  | "markdown"
  | "media"
  | "number"
  | "quiet-date"
  | "reference"
  | "text"
  | "textarea"
  | "value-unit";

export type FieldError = GeneratedFieldDraftError & {
  message: string;
};

export type FieldPending = {
  isPending: boolean;
  label?: string;
};

export type ReferenceOption = {
  id: string;
  label: string;
};

export type ReferenceValueStatus =
  | {
      kind: "resolved";
      value: string;
    }
  | {
      kind: "unset";
    }
  | {
      kind: "missing";
      value: string;
    };

export type ReferenceFacts =
  | {
      clearable: boolean;
      kind: "editor";
      valueStatus: ReferenceValueStatus;
    }
  | {
      kind: "display";
      valueStatus: ReferenceValueStatus;
    };

export type MediaAssetOption = {
  byteSize?: number;
  contentType?: string;
  downloadHref?: string;
  filename?: string;
  height?: number;
  href: string;
  id: string;
  label: string;
  missing?: boolean;
  width?: number;
};

export type MediaUploadPatchFields = {
  heightFieldName?: string;
  mediaAssetFieldName?: string;
  widthFieldName?: string;
};

export type MissingMediaAsset = {
  assetId: string;
  reason?: string;
};

export type MediaDocumentOpenIntent = {
  href: string;
  target: "newTab";
  type: "mediaDocumentOpen";
};

export type MediaDocumentDownloadIntent = {
  href: string;
  type: "mediaDocumentDownload";
};

export type MediaDocumentPresentation = {
  byteSize: number;
  contentType: string;
  downloadIntent: MediaDocumentDownloadIntent;
  filename: string;
  openIntent: MediaDocumentOpenIntent;
};

export type MediaPresentation = {
  document?: MediaDocumentPresentation;
  missingSelectedAsset?: MissingMediaAsset;
  previewHref?: string;
  selectedAssetId?: string;
};

export type MediaPickerFacts = MediaPresentation & {
  fileSelectEnabled: boolean;
  removalEnabled?: boolean;
  uploadEnabled: boolean;
  uploadPatchFields: MediaUploadPatchFields;
};

export type MediaAuthoring = MediaPickerFacts & {
  accept?: string;
  maxSize?: number;
  mediaPreviewHref?: string;
};

export type IconOption = {
  custom?: boolean;
  group?: string;
  id: string;
  label: string;
  missing?: boolean;
  source: string;
};

export type IconPickerSelection =
  | {
      kind: "empty";
    }
  | {
      kind: "option";
      optionId: string;
      source: string;
    }
  | {
      kind: "customSource";
      source: string;
    };

export type IconPickerFacts = {
  canCancel: boolean;
  canSave: boolean;
  customParseError?: string;
  dialogDraft: string;
  dialogOpen: boolean;
  emptyValue: boolean;
  previewSource: string;
  savePending?: boolean;
  selection: IconPickerSelection;
  valueMode: "svgSource";
};

export type FieldPresentationColorIntent = "neutral" | "success" | "warning" | "danger";

export type FieldPresentationColor = {
  intent: FieldPresentationColorIntent;
  known: boolean;
  token?: string;
};

export type FieldPresentationIcon = {
  kind: "svg";
  source: string;
};

export type EnumValuePresentation = {
  color: FieldPresentationColor;
  icon?: FieldPresentationIcon;
  iconKnown: boolean;
  iconToken?: string;
  label: string;
};

export type EnumOption = {
  label: string;
  presentation: EnumValuePresentation;
  status: "declared";
  value: string;
};

export type EnumValueStatus =
  | {
      kind: "declared";
      value: string;
    }
  | {
      kind: "unset";
    }
  | {
      kind: "undeclared";
      value: string;
    };

export type EnumFacts =
  | {
      clearable: boolean;
      kind: "editor";
      listContent: "icon" | "label" | "both";
      placeholder?: string;
      style: "plain" | "rich";
      triggerContent: "label" | "both";
      valueStatus: EnumValueStatus;
    }
  | {
      content: "icon" | "label";
      kind: "display";
      valueStatus: EnumValueStatus;
    };

export type FieldOptions = {
  enumOptions?: readonly EnumOption[];
  iconOptions?: readonly IconOption[];
  referenceOptions?: readonly ReferenceOption[];
  mediaAssetOptions?: readonly MediaAssetOption[];
};

export type TemporalDisplay =
  | {
      kind: "date";
      value: string;
    }
  | {
      kind: "dateTime";
      value: string;
    };

export type FieldFormatting = {
  displayValue?: string;
  enumValuePresentation?: EnumValuePresentation;
  format?: TableColumnFormat;
  suffix?: string;
  temporal?: TemporalDisplay;
};

export type StateTransitionAvailability = {
  valid: boolean;
  disabledReason?: string;
};

export type StateTransitionOperation = {
  operationName: string;
  label: string;
  machineName: string;
  machine: StateMachineSchema;
  transitionName: string;
  transition: StateMachineTransitionSchema;
  fieldName: string;
  field: Extract<FieldSchema, { type: "enum" }>;
  availability?: StateTransitionAvailability;
  pending?: FieldPending;
};

export type StateMachineInteraction =
  | {
      kind: "display";
    }
  | {
      kind: "transitions";
      invocationSource: Extract<OperationInvocationSource, "menuItem">;
      transitions: readonly StateTransitionOperation[];
    };

export type StateMachineValueStatus =
  | {
      kind: "declared";
      value: string;
    }
  | {
      kind: "unset";
      message: string;
    }
  | {
      kind: "undeclared";
      message: string;
      value: string;
    };

export type StateMachineFacts = {
  currentValue: FieldValue | undefined;
  initialState: string;
  interaction: StateMachineInteraction;
  stateMachine: StateMachineField;
  terminal: boolean;
  valueStatus: StateMachineValueStatus;
};

export type ColorValue =
  | {
      kind: "hex";
      value: string;
    }
  | {
      kind: "unavailable";
    };

export type ColorFacts = {
  picker: ColorValue;
  swatch: ColorValue;
};

export type BaseFieldContract = FieldConfig & {
  access: FieldAccess;
  color?: ColorFacts;
  control: FieldControl;
  enum?: EnumFacts;
  errors?: readonly FieldError[];
  icon?: IconPickerFacts;
  labelVisibility: "hidden" | "visible";
  options?: FieldOptions;
  pending?: FieldPending;
  reference?: ReferenceFacts;
  stateMachineFacts?: StateMachineFacts;
  surface: FieldSurface;
};

export type DisplayFieldContract = BaseFieldContract & {
  density: FieldDensity;
  mode: "display";
  media?: MediaPresentation;
  value: FieldValue | undefined;
  formatting: FieldFormatting & {
    displayValue: string;
  };
};

export type CreateFieldContract = BaseFieldContract & {
  surface: "create";
  mode: "editor";
  commit: "submit";
  density: FieldDensity;
  draftInput?: GeneratedFieldDraftInput;
  media?: MediaAuthoring;
  value: FieldValue | undefined;
};

export type OperationInputFieldContract = BaseFieldContract & {
  surface: "operation";
  mode: "editor";
  commit: "submit";
  density: FieldDensity;
  input: PublicSafeOperationInputField;
  inputName: string;
  draftInput?: GeneratedFieldDraftInput;
  media?: MediaAuthoring;
  value: FieldValue | undefined;
};

export type RecordFieldDrafts = {
  draft: string;
  draftInput?: GeneratedFieldDraftInput;
  recordValue: FieldValue | undefined;
  unitDraft?: string;
  unitDraftInput?: GeneratedFieldDraftInput;
  unitRecordValue?: FieldValue | undefined;
};

export type RecordFieldContract = BaseFieldContract & {
  surface: "detail" | "record" | "table-cell";
  mode: "editor";
  commit: FieldCommitPolicy;
  density: FieldDensity;
  drafts: RecordFieldDrafts;
  formatting: FieldFormatting;
  media?: MediaAuthoring;
  presentationMode: RecordFieldPresentation;
  rendererKind: RecordFieldRendererKind;
  value: FieldValue | undefined;
};

export type FieldContract =
  | CreateFieldContract
  | DisplayFieldContract
  | OperationInputFieldContract
  | RecordFieldContract;

export type FieldSession = {
  canSubmit?: boolean;
  configurationErrors?: readonly { inputName: string; message: string }[];
  defaults?: readonly CreateDefault[];
  defaultsResolved?: boolean;
  draft: GeneratedFieldDraft;
  fieldErrors: Record<string, FieldError>;
  queryContext?: QueryEvaluationContext;
  values: Partial<RecordValues>;
  visibleFieldNames: readonly string[];
};

export type ValueUnitCommit = {
  fieldDraftInput: GeneratedFieldDraftInput;
  unitDraftInput: GeneratedFieldDraftInput;
};

export type OperationInvocationSource =
  | "button"
  | "confirmationDialog"
  | "menuItem"
  | "submitButton";

export type SemanticIconId =
  | "add"
  | "archive"
  | "calendar"
  | "close"
  | "confirm"
  | "copy"
  | "delete"
  | "disclosure"
  | "disclosureDown"
  | "dragHandle"
  | "edit"
  | "indeterminate"
  | "loading"
  | "menu"
  | "next"
  | "previous"
  | "publish"
  | "remove"
  | "select"
  | "selectDown"
  | "sort"
  | "sync"
  | "treeDisclosure"
  | "upload";

export type ActionIntent = "neutral" | "primary" | "success" | "warning" | "danger";

export type ActionControlState = {
  disabled?: boolean;
  disabledReason?: string;
  errors?: readonly string[];
  pending?: FieldPending;
  selected?: boolean;
};

export type ActionControlBase = ActionControlState & {
  accessibilityLabel?: string;
  icon?: SemanticIconId;
  id: string;
  intent?: ActionIntent;
  label: string;
};

export type ActionTriggerIntent = {
  controlId: string;
  invocationSource: OperationInvocationSource;
  operationName?: string;
};

export type ActionIntentHandler = (intent: ActionTriggerIntent) => Promise<void> | void;

export type ButtonContent =
  | {
      kind: "label";
      label: string;
    }
  | {
      icon: SemanticIconId;
      kind: "iconAndLabel";
      label: string;
    }
  | {
      icon: SemanticIconId;
      kind: "iconOnly";
    };

export type ButtonContract = ActionControlState & {
  accessibilityLabel: string;
  content: ButtonContent;
  density: "default" | "compact";
  id: string;
  kind: "button";
  prominence: "primary" | "secondary" | "quiet";
  type: "button" | "submit";
};

export type ActionTriggerContract = ActionControlBase & {
  invocationSource: OperationInvocationSource;
  invoke: ActionTriggerIntent;
  kind: "actionTrigger";
  operationName?: string;
};

type NativeLinkActionBaseContract = {
  accessibilityLabel: string;
  id: string;
  kind: "nativeLinkAction";
  label: string;
  prominence: "primary" | "secondary";
  target: "newTab" | "sameTab";
};

export type NativeLinkActionContract = NativeLinkActionBaseContract &
  (
    | {
        availability: "available";
        href: string;
        unavailableReason?: never;
      }
    | {
        availability: "unavailable";
        href?: never;
        unavailableReason: string;
      }
  );

export type MenuItemContract = ActionControlBase & {
  invoke: ActionTriggerIntent;
  invocationSource: Extract<OperationInvocationSource, "menuItem">;
  kind: "menuItem";
  operationName?: string;
};

export type MenuContract = {
  accessibilityLabel?: string;
  id: string;
  items: readonly MenuItemContract[];
  label?: string;
  trigger: ButtonContract;
};

export type ConfirmationPromptContract = {
  action: ActionTriggerContract;
  cancel: ButtonContract;
  description?: string;
  id: string;
  title: string;
};

export type CompactStatusIntent = "neutral" | "success" | "warning" | "danger" | "info";

export type OperationExecutionStatus = "committed" | "failed" | "idle" | "pending" | "replayed";

export type CompactStatusContract = {
  accessibilityLabel: string;
  detail: string;
  id: string;
  intent: CompactStatusIntent;
  kind: "compactStatus";
  label: string;
  pending?: FieldPending;
  status: OperationExecutionStatus;
};

export type OperationCountBadgeContract = {
  accessibilityLabel: string;
  count: number;
  id: string;
  kind: "countBadge";
};

export type OperationInvokeIntent = {
  controlId: string;
  invocationSource: Extract<OperationInvocationSource, "button" | "confirmationDialog">;
  type: "operationInvoke";
};

export type OperationConfirmationOpenChangeIntent = {
  controlId: string;
  open: boolean;
  type: "operationConfirmationOpenChange";
};

export type OperationPresentationIntent =
  | OperationConfirmationOpenChangeIntent
  | OperationInvokeIntent;

export type OperationPresentationIntentHandler = (
  intent: OperationPresentationIntent,
) => Promise<void> | void;

export type OperationButtonContract = Omit<ButtonContract, "prominence"> & {
  countBadge?: OperationCountBadgeContract;
  intent: OperationPresentationIntent;
  prominence: "destructive" | "primary" | "quiet" | "secondary";
};

export type OperationDestructiveConfirmationContract = {
  action: OperationButtonContract;
  cancel: OperationButtonContract;
  closeIntent: OperationConfirmationOpenChangeIntent;
  description: string;
  id: string;
  kind: "destructiveConfirmation";
  open: boolean;
  title: string;
};

export type OperationProgressStepStatus =
  | "failed"
  | "pending"
  | "running"
  | "skipped"
  | "succeeded";

export type OperationProgressStepContract = {
  detail?: string;
  id: string;
  label: string;
  status: OperationProgressStepStatus;
};

export type OperationProgressContract = {
  detail?: string;
  id: string;
  kind: "operationProgress";
  steps: readonly OperationProgressStepContract[];
  title: string;
  updatedAt: number;
};

export type OperationActiveProgressContract = {
  detail?: string;
  label: string;
  stepId?: string;
};

export type OperationFeedbackEventContract = {
  activeProgress?: OperationActiveProgressContract;
  detail?: string;
  id: string;
  intent: CompactStatusIntent;
  kind: "operationFeedbackEvent";
  progress?: OperationProgressContract;
  status: Exclude<OperationExecutionStatus, "idle">;
  title: string;
};

export type SubmitHiddenInput = {
  disabled?: boolean;
  name: string;
  value: string;
};

export type SubmitBoundaryAdapter = {
  hiddenInputs: readonly SubmitHiddenInput[];
  id: string;
  kind: "submitBoundary";
};

export type FieldIntent =
  | {
      type: "createDraftChange";
      fieldName: string;
      fieldValue: GeneratedFieldDraftInput;
    }
  | {
      type: "operationDraftChange";
      inputName: string;
      inputValue: GeneratedFieldDraftInput | undefined;
    }
  | {
      type: "recordDraftChange";
      fieldName: string;
      fieldValue: GeneratedFieldDraftInput | undefined;
    }
  | {
      type: "recordEditorDraftChange";
      fieldName: string;
      value: string;
    }
  | {
      type: "recordDraftRevert";
      fieldName: string;
    }
  | {
      type: "recordDraftCommit";
      fieldName: string;
      fieldValue: GeneratedFieldDraftInput;
    }
  | {
      type: "recordValueCommit";
      fieldName: string;
      value: FieldValue;
    }
  | {
      type: "recordValueUnitCommit";
      fieldName: string;
      unitFieldName: string;
      commit: ValueUnitCommit;
    }
  | {
      type: "fieldErrorChange";
      fieldName: string;
      message: string | null;
    }
  | {
      type: "iconDialogDraftChange";
      fieldName: string;
      value: string;
    }
  | {
      type: "iconDialogOpenChange";
      fieldName: string;
      open: boolean;
    }
  | {
      type: "iconDialogCancel";
      fieldName: string;
    }
  | {
      type: "iconDialogSave";
      fieldName: string;
    }
  | {
      type: "mediaAssetSelect";
      assetId: string;
      fieldName: string;
    }
  | {
      type: "mediaFileSelect";
      fieldName: string;
      file: File | undefined;
    }
  | {
      type: "stateTransitionInvoke";
      fieldName: string;
      operationName: string;
      recordId: string;
      source: Extract<OperationInvocationSource, "menuItem">;
      transitionName: string;
    };

export type FieldIntentHandler = (intent: FieldIntent) => Promise<void> | void;

export type CreateFieldIntentHandler = (
  fieldId: string,
  intent: FieldIntent,
) => Promise<void> | void;

export type OperationControlContract = {
  confirmation?: OperationDestructiveConfirmationContract;
  feedback?: OperationFeedbackEventContract;
  id: string;
  kind: "operationControl";
  progress?: OperationProgressContract;
  status: CompactStatusContract;
  trigger: OperationButtonContract;
};

export type CollectionEmptyStatePrimaryActionContract =
  | {
      kind: "createAction";
      surface: CreateSurfaceContract;
    }
  | {
      control: OperationControlContract;
      kind: "operationAction";
      role: "command";
    };

export type FieldSetContract = {
  disabled: boolean;
  disabledReason?: string;
  kind: "fieldSet";
  errors?: readonly string[];
  fields: readonly FieldContract[];
  id: string;
  label?: string;
};

export type ListDensity = "compact" | "default";

export type SemanticOrderingDirection = "bottom" | "down" | "top" | "up";

export type ListReorderIntent = {
  actionId: string;
  direction: SemanticOrderingDirection;
  itemId: string;
  listId: string;
  type: "listReorder";
};

export type ListIntent = ListReorderIntent;

export type ListIntentHandler = (intent: ListIntent) => Promise<void> | void;

export type ListOperationActionContract = {
  control: OperationControlContract;
  kind: "operationAction";
  role: "command" | "delete" | "transition";
};

export type ListActionContract = ListOperationActionContract;

export type ListActionGroupContract = {
  id: string;
  kind: "actionGroup";
  primary: readonly ListActionContract[];
  secondary: readonly ListActionContract[];
  secondaryAccessibilityLabel: string;
};

export type ListOrderingActionContract = ActionControlState & {
  direction: ListReorderIntent["direction"];
  id: string;
  intent: ListReorderIntent;
  label: string;
  structurallyAvailable: boolean;
};

export type ListOrderingContract = {
  accessibilityLabel: string;
  actions: readonly ListOrderingActionContract[];
  affordance: "reorder";
  kind: "ordering";
  pending: boolean;
};

export type ListWarningContract = {
  id: string;
  items: readonly {
    code: string;
    message: string;
  }[];
  kind: "listWarning";
  title: string;
};

export type ListItemAvailability =
  | {
      available: true;
    }
  | {
      available: false;
      message: string;
    };

export type ListItemContract = {
  accessibilityLabel: string;
  actions: ListActionGroupContract;
  availability: ListItemAvailability;
  fields: readonly FieldContract[];
  id: string;
  kind: "listItem";
  ordering?: ListOrderingContract;
  warnings: readonly ListWarningContract[];
};

export type ListEmptyStateContract = {
  action?: CollectionEmptyStatePrimaryActionContract;
  description?: string;
  id: string;
  kind: "listEmptyState";
  title: string;
};

export type ListEditingAvailability =
  | {
      enabled: true;
    }
  | {
      disabledReason: string;
      enabled: false;
    };

export type ListContract = {
  accessibilityLabel: string;
  density: ListDensity;
  editing: ListEditingAvailability;
  emptyState?: ListEmptyStateContract;
  id: string;
  items: readonly ListItemContract[];
  kind: "list";
};

export type RecordResultDensity = "compact" | "default";

export type RecordResultAvailability =
  | {
      state: "ready";
    }
  | {
      state: "empty";
    }
  | {
      message: string;
      state: "unavailable";
    };

export type RecordResultEditingAvailability =
  | {
      enabled: true;
    }
  | {
      disabledReason: string;
      enabled: false;
    };

export type RecordResultSelectedRecordContract = {
  accessibilityLabel: string;
  id: string;
  kind: "recordResultRecord";
};

export type RecordResultOperationActionContract = {
  control: OperationControlContract;
  kind: "operationAction";
  role: "command" | "delete" | "transition";
};

export type RecordResultActionContract = RecordResultOperationActionContract;

export type RecordResultActionGroupContract = {
  id: string;
  kind: "actionGroup";
  primary: readonly RecordResultActionContract[];
  secondary: readonly RecordResultActionContract[];
  secondaryAccessibilityLabel: string;
};

export type RecordResultWarningContract = {
  id: string;
  items: readonly {
    code: string;
    message: string;
  }[];
  kind: "recordResultWarning";
  title: string;
};

export type RecordResultEmptyStateContract = {
  action?: CollectionEmptyStatePrimaryActionContract;
  description?: string;
  id: string;
  kind: "recordResultEmptyState";
  title: string;
};

export type RecordResultFieldIntent = {
  fieldId: string;
  intent: FieldIntent;
  recordId: string;
  resultId: string;
  type: "recordResultFieldIntent";
};

export type RecordResultOperationIntent = {
  controlId: string;
  intent: OperationPresentationIntent;
  recordId?: string;
  resultId: string;
  type: "recordResultOperationIntent";
};

export type RecordResultIntent = RecordResultFieldIntent | RecordResultOperationIntent;

export type RecordResultIntentHandler = (intent: RecordResultIntent) => Promise<void> | void;

export type RecordResultContract = {
  accessibilityLabel: string;
  actions: RecordResultActionGroupContract;
  availability: RecordResultAvailability;
  density: RecordResultDensity;
  editing: RecordResultEditingAvailability;
  emptyState?: RecordResultEmptyStateContract;
  fields: readonly FieldContract[];
  id: string;
  kind: "recordResult";
  selectedRecord?: RecordResultSelectedRecordContract;
  warnings: readonly RecordResultWarningContract[];
};

export type TableDensity = "compact" | "default";

export type TableColumnAlignment = "center" | "end" | "start";

export type TableColumnWidth = "auto" | "lg" | "md" | "sm" | "xs";

export type TableColumnContentRole =
  | "actions"
  | "computed"
  | "delete"
  | "field"
  | "ordering"
  | "reference";

export type TableColumnContract = {
  accessibilityLabel: string;
  alignment: TableColumnAlignment;
  contentRole: TableColumnContentRole;
  id: string;
  isRowHeader: boolean;
  kind: "tableColumn";
  label: string;
  labelVisibility: "hidden" | "visible";
  width: TableColumnWidth;
};

export type TableValueStatus =
  | {
      kind: "ready";
    }
  | {
      kind: "pending";
      label?: string;
    }
  | {
      kind: "invalid" | "unavailable";
      message: string;
    };

export type TableDisplayValueContract = {
  accessibilityLabel: string;
  displayValue: string;
  kind: "displayValue";
  status: TableValueStatus;
  suffix?: string;
  valueKind: "computed" | "reference" | "text";
};

export type TableFieldContentContract = {
  field: FieldContract;
  kind: "field";
  source: "record" | "referencedRecord";
};

export type TableUnavailableContentContract = {
  accessibilityLabel: string;
  kind: "unavailable";
  message: string;
};

export type TableActionInvokeIntent = {
  actionId: string;
  invocationSource: Extract<OperationInvocationSource, "button" | "menuItem">;
  operationName?: string;
  rowId: string;
  tableId: string;
  type: "tableActionInvoke";
};

export type TableEditDialogOpenChangeIntent = {
  dialogId: string;
  open: boolean;
  rowId: string;
  tableId: string;
  type: "tableEditDialogOpenChange";
};

export type TableReorderIntent = {
  actionId: string;
  direction: SemanticOrderingDirection;
  rowId: string;
  tableId: string;
  type: "tableReorder";
};

export type TableIntent =
  | TableActionInvokeIntent
  | TableEditDialogOpenChangeIntent
  | TableReorderIntent;

export type TableIntentHandler = (intent: TableIntent) => Promise<void> | void;

export type TableInvokeActionContract = {
  intent: TableActionInvokeIntent;
  kind: "invokeAction";
  role: "command" | "transition";
  trigger: ButtonContract;
};

export type TableOperationActionContract = {
  control: OperationControlContract;
  kind: "operationAction";
  role: "command" | "delete" | "transition";
};

export type TableEditDialogAvailableTargetContract = {
  actionGroup?: TableActionGroupContract;
  fieldSet: FieldSetContract;
  kind: "available";
};

export type TableEditDialogUnavailableTargetContract = {
  kind: "unavailable";
  message: string;
};

export type TableEditDialogContract = {
  close: ButtonContract;
  description?: string;
  id: string;
  kind: "tableEditDialog";
  open: boolean;
  openChangeIntent: TableEditDialogOpenChangeIntent;
  target: TableEditDialogAvailableTargetContract | TableEditDialogUnavailableTargetContract;
  targetKind: "reference" | "row";
  title: string;
};

export type TableEditActionContract = {
  dialog: TableEditDialogContract;
  kind: "editAction";
  openIntent: TableEditDialogOpenChangeIntent;
  trigger: ButtonContract;
};

export type TableActionContract =
  | TableEditActionContract
  | TableInvokeActionContract
  | NativeLinkActionContract
  | TableOperationActionContract;

export type TableActionGroupContract = {
  id: string;
  kind: "actionGroup";
  primary: readonly TableActionContract[];
  secondary: readonly TableActionContract[];
  secondaryAccessibilityLabel: string;
};

export type TableOrderingActionContract = ActionControlState & {
  direction: TableReorderIntent["direction"];
  id: string;
  intent: TableReorderIntent;
  label: string;
};

export type TableOrderingContract = {
  accessibilityLabel: string;
  actions: readonly TableOrderingActionContract[];
  affordance: "reorder";
  kind: "ordering";
  pending: boolean;
};

export type TableCellContentContract =
  | TableActionGroupContract
  | TableDisplayValueContract
  | TableFieldContentContract
  | TableOrderingContract
  | TableUnavailableContentContract;

export type TableCellContract = {
  columnId: string;
  contents: readonly TableCellContentContract[];
  id: string;
  kind: "tableCell";
};

export type TableWarningContract = {
  id: string;
  items: readonly {
    code: string;
    message: string;
  }[];
  kind: "tableWarning";
  title: string;
};

export type TableRowContract = {
  accessibilityLabel: string;
  cells: readonly TableCellContract[];
  id: string;
  kind: "tableRow";
  warnings: readonly TableWarningContract[];
};

export type TableFooterCellContract =
  | {
      columnId: string;
      id: string;
      kind: "emptyFooterCell";
    }
  | {
      accessibilityLabel: string;
      columnId: string;
      displayValue: string;
      id: string;
      kind: "aggregateFooterCell";
      status: TableValueStatus;
      suffix?: string;
    };

export type TableFooterContract = {
  accessibilityLabel: string;
  cells: readonly TableFooterCellContract[];
  id: string;
  kind: "tableFooter";
};

export type TableEmptyStateContract = {
  action?: CollectionEmptyStatePrimaryActionContract;
  description?: string;
  id: string;
  kind: "tableEmptyState";
  title: string;
};

export type TableEditingAvailability =
  | {
      enabled: true;
    }
  | {
      disabledReason: string;
      enabled: false;
    };

export type TableContract = {
  accessibilityLabel: string;
  columns: readonly TableColumnContract[];
  density: TableDensity;
  editing: TableEditingAvailability;
  emptyState?: TableEmptyStateContract;
  footer?: TableFooterContract;
  id: string;
  kind: "table";
  rows: readonly TableRowContract[];
};

export type CreateOpenIntent = {
  open: boolean;
  surfaceId: string;
  type: "createOpenChange";
};

export type CreateSubmitIntent = {
  surfaceId: string;
  type: "createSubmit";
};

export type CreateIntent = CreateOpenIntent | CreateSubmitIntent;

export type CreateIntentHandler = (intent: CreateIntent) => Promise<void> | void;

export type CreateFormContract = {
  cancel: ButtonContract;
  errors: readonly string[];
  fieldSet: Omit<FieldSetContract, "fields"> & {
    fields: readonly CreateFieldContract[];
  };
  id: string;
  kind: "createForm";
  submit: ButtonContract;
};

export type CreateDialogContract = {
  form: CreateFormContract;
  id: string;
  kind: "createDialog";
  open: boolean;
  title: string;
};

export type CreateSurfaceContract = {
  dialog: CreateDialogContract;
  id: string;
  kind: "createSurface";
  trigger: ButtonContract;
};

export type TreeDensity = "compact" | "default";

export type TreeEditingAvailability =
  | {
      enabled: true;
    }
  | {
      disabledReason: string;
      enabled: false;
    };

export type TreeEmptyStateContract = {
  action?: CollectionEmptyStatePrimaryActionContract;
  description?: string;
  id: string;
  kind: "treeEmptyState";
  title: string;
};

export type TreeAvailability =
  | {
      state: "ready";
    }
  | {
      emptyState: TreeEmptyStateContract;
      state: "empty";
    }
  | {
      message: string;
      state: "unavailable";
    };

export type TreeParentIdentity =
  | {
      kind: "root";
    }
  | {
      itemId: string;
      kind: "item";
    };

export type TreeItemSelectionIntent = {
  itemId: string;
  resultId: string;
  type: "treeItemSelection";
};

export type TreeDisclosureOpenChangeIntent = {
  itemId: string;
  open: boolean;
  resultId: string;
  type: "treeDisclosureOpenChange";
};

export type TreeContextActionIntent = {
  actionId: string;
  itemId: string;
  resultId: string;
  type: "treeContextAction";
};

export type TreeChildVariantSelectionIntent = {
  parent: TreeParentIdentity;
  resultId: string;
  variantId: string;
  type: "treeChildVariantSelection";
};

export type TreeCreateIntent = {
  intent: CreateIntent;
  parent: TreeParentIdentity;
  resultId: string;
  surfaceId: string;
  type: "treeCreate";
};

export type TreeFieldTarget =
  | {
      fieldSetId: string;
      itemId: string;
      kind: "child" | "placement";
    }
  | {
      kind: "create";
      parent: TreeParentIdentity;
      surfaceId: string;
    };

export type TreeFieldIntent = {
  fieldId: string;
  intent: FieldIntent;
  resultId: string;
  target: TreeFieldTarget;
  type: "treeField";
};

export type TreeOperationIntent = {
  controlId: string;
  intent: OperationPresentationIntent;
  itemId?: string;
  resultId: string;
  type: "treeOperation";
};

export type TreeReorderIntent = {
  actionId: string;
  direction: SemanticOrderingDirection;
  itemId: string;
  resultId: string;
  type: "treeReorder";
};

export type TreeIntent =
  | TreeChildVariantSelectionIntent
  | TreeContextActionIntent
  | TreeCreateIntent
  | TreeDisclosureOpenChangeIntent
  | TreeFieldIntent
  | TreeItemSelectionIntent
  | TreeOperationIntent
  | TreeReorderIntent;

export type TreeIntentHandler = (intent: TreeIntent) => Promise<void> | void;

export type TreeWarningContract = {
  id: string;
  items: readonly {
    code: string;
    message: string;
  }[];
  kind: "treeWarning";
  source: "child" | "placement" | "tree";
  title: string;
};

export type TreeItemAvailability =
  | {
      available: true;
    }
  | {
      available: false;
      message: string;
    };

export type TreeItemVariantContract = {
  id: string;
  kind: "treeItemVariant";
  label: string;
};

export type TreeItemSlotContract = {
  id: string;
  kind: "treeItemSlot";
  label: string;
};

export type TreeItemStructureContract =
  | {
      state: "branch" | "leaf";
    }
  | {
      message: string;
      state: "cycleStopped" | "depthStopped" | "missingChild";
    };

export type TreeItemDisclosureContract = {
  accessibilityLabel: string;
  id: string;
  intent: TreeDisclosureOpenChangeIntent;
  kind: "treeItemDisclosure";
  open: boolean;
};

export type TreeContextActionContract = {
  availability: TreeItemAvailability;
  control: ButtonContract;
  id: string;
  intent: TreeContextActionIntent;
  kind: "treeContextAction";
};

export type TreeOrderingActionContract = ActionControlState & {
  direction: TreeReorderIntent["direction"];
  id: string;
  intent: TreeReorderIntent;
  label: string;
  structurallyAvailable: boolean;
};

export type TreeOrderingContract = {
  accessibilityLabel: string;
  actions: readonly TreeOrderingActionContract[];
  affordance: "reorder";
  id: string;
  kind: "treeOrdering";
  pending: boolean;
};

export type TreeChildVariantContract = {
  availability: TreeItemAvailability;
  id: string;
  kind: "treeChildVariant";
  label: string;
  selected: boolean;
  selectionIntent: TreeChildVariantSelectionIntent;
  slot?: TreeItemSlotContract;
};

export type TreeChildCreationContract = {
  accessibilityLabel: string;
  activeCreateSurface?: CreateSurfaceContract;
  activeVariantId?: string;
  id: string;
  kind: "treeChildCreation";
  variants: readonly TreeChildVariantContract[];
};

export type TreeItemContract = {
  accessibilityLabel: string;
  availability: TreeItemAvailability;
  childRecordId?: string;
  children: readonly TreeItemContract[];
  contextActions: readonly TreeContextActionContract[];
  disclosure?: TreeItemDisclosureContract;
  editor?: TreeSelectedEditorContract;
  id: string;
  kind: "treeItem";
  label: string;
  ordering?: TreeOrderingContract;
  placementId: string;
  selected: boolean;
  selectionIntent: TreeItemSelectionIntent;
  slot?: TreeItemSlotContract;
  structure: TreeItemStructureContract;
  variant?: TreeItemVariantContract;
  warnings: readonly TreeWarningContract[];
};

export type TreeSelectedEditorContract = {
  accessibilityLabel: string;
  availability: TreeItemAvailability;
  childCreation?: TreeChildCreationContract;
  childFields?: FieldSetContract;
  childRecordId?: string;
  editing: TreeEditingAvailability;
  id: string;
  itemId: string;
  kind: "treeSelectedEditor";
  placementFields: FieldSetContract;
  placementId: string;
  removePlacement?: OperationControlContract;
  warnings: readonly TreeWarningContract[];
};

export type TreeRootContract = {
  accessibilityLabel: string;
  childCreation?: TreeChildCreationContract;
  childFields?: FieldSetContract;
  deleteRecord?: OperationControlContract;
  id: string;
  kind: "treeRoot";
  label: string;
  typeLabel?: string;
};

export type TreeResultContract = {
  accessibilityLabel: string;
  availability: TreeAvailability;
  density: TreeDensity;
  editing: TreeEditingAvailability;
  feedback: readonly OperationFeedbackEventContract[];
  id: string;
  items: readonly TreeItemContract[];
  kind: "treeResult";
  presentation?: "inlineEditor" | "outlineDetail";
  root: TreeRootContract;
  rootChildCreation?: TreeChildCreationContract;
  selectedEditor?: TreeSelectedEditorContract;
  status?: CompactStatusContract;
  warnings: readonly TreeWarningContract[];
};

export type ItemDetailContract = {
  kind: "itemDetail";
  fields: readonly FieldContract[];
  operationControls?: readonly OperationControlContract[];
};

export type WorkspaceItemAvailability =
  | {
      available: true;
    }
  | {
      available: false;
      message: string;
    };

export type WorkspaceEmptyStateContract = {
  action?: CollectionEmptyStatePrimaryActionContract;
  description?: string;
  id: string;
  kind: "workspaceEmptyState";
  title: string;
};

export type WorkspaceAvailability =
  | {
      state: "ready";
    }
  | {
      emptyState: WorkspaceEmptyStateContract;
      state: "empty";
    }
  | {
      message: string;
      state: "unavailable";
    };

export type WorkspaceQuerySelectionIntent = {
  collectionId: string;
  queryId: string;
  screenId: string;
  sectionId: string;
  type: "workspaceQuerySelection";
};

export type WorkspaceQueryContract = {
  availability: WorkspaceItemAvailability;
  countText?: string;
  id: string;
  kind: "workspaceQuery";
  label: string;
  selected: boolean;
  selectionIntent: WorkspaceQuerySelectionIntent;
};

export type WorkspaceQueryNavigationContract = {
  accessibilityLabel: string;
  id: string;
  items: readonly WorkspaceQueryContract[];
  kind: "workspaceQueryNavigation";
};

export type WorkspaceContextSelectionIntent = {
  collectionId: string;
  contextId: string;
  contextOptionId: string;
  screenId: string;
  sectionId: string;
  type: "workspaceContextSelection";
};

export type WorkspaceContextOptionContract = {
  availability: WorkspaceItemAvailability;
  countText?: string;
  id: string;
  kind: "workspaceContextOption";
  label: string;
  selected: boolean;
  selectionIntent: WorkspaceContextSelectionIntent;
};

export type WorkspaceCreateActionContract = {
  kind: "createAction";
  surface: CreateSurfaceContract;
};

export type WorkspaceOperationActionContract = {
  control: OperationControlContract;
  kind: "operationAction";
};

export type WorkspaceCollectionActionContract =
  | WorkspaceCreateActionContract
  | WorkspaceOperationActionContract;

export type WorkspaceCollectionActionGroupContract = {
  id: string;
  kind: "workspaceCollectionActions";
  primary: readonly WorkspaceCollectionActionContract[];
  secondary: readonly WorkspaceCollectionActionContract[];
  secondaryAccessibilityLabel: string;
};

export type WorkspaceContextPresentation =
  | "externalNavigation"
  | "localListDetail"
  | "localTabs"
  | "singletonDetail";

export type WorkspaceContextContract = {
  accessibilityLabel: string;
  availability: WorkspaceAvailability;
  createAction?: WorkspaceCreateActionContract;
  id: string;
  kind: "workspaceContext";
  label: string;
  options: readonly WorkspaceContextOptionContract[];
  presentation: WorkspaceContextPresentation;
  selectedOptionId?: string;
};

export type WorkspaceSummaryContract = {
  availability: WorkspaceItemAvailability;
  displayValue: string;
  id: string;
  kind: "workspaceSummary";
  label: string;
  suffix?: string;
};

export type WorkspaceResultContract =
  | ListContract
  | RecordResultContract
  | TableContract
  | TreeResultContract;

export type WorkspaceOrdinaryCollectionContract = {
  actions: WorkspaceCollectionActionGroupContract;
  context?: WorkspaceContextContract;
  contextDetail?: RecordResultContract;
  kind: "ordinary";
  queryNavigation?: WorkspaceQueryNavigationContract;
  result: WorkspaceResultContract;
  summaries: readonly WorkspaceSummaryContract[];
};

export type WorkspaceListDetailContract = {
  accessibilityLabel: string;
  actions: WorkspaceCollectionActionGroupContract;
  contextDetail?: RecordResultContract;
  id: string;
  kind: "listDetail";
  queryNavigation?: WorkspaceQueryNavigationContract;
  result: WorkspaceResultContract;
  selector: WorkspaceContextContract & {
    presentation: "localListDetail";
  };
  summaries: readonly WorkspaceSummaryContract[];
};

export type WorkspaceCollectionPresentationContract =
  | WorkspaceListDetailContract
  | WorkspaceOrdinaryCollectionContract;

export type WorkspaceCollectionContract = {
  accessibilityLabel: string;
  availability: WorkspaceAvailability;
  id: string;
  kind: "workspaceCollection";
  label: string;
  presentation: WorkspaceCollectionPresentationContract;
  selectedQueryId: string | null;
};

export type WorkspaceExternalActionContract = {
  action: ActionTriggerContract;
  id: string;
  kind: "workspaceExternalAction";
};

export type WorkspaceLinkActionContract = {
  accessibilityLabel: string;
  href: string;
  id: string;
  kind: "workspaceLinkAction";
  label: string;
  prominence: "primary" | "secondary";
  target: "newTab" | "sameTab";
};

export type WorkspaceSectionContract = {
  accessibilityLabel: string;
  actions: readonly WorkspaceExternalActionContract[];
  collection: WorkspaceCollectionContract;
  headingVisibility: "hidden" | "visible";
  id: string;
  kind: "workspaceSection";
  label: string;
};

export type WorkspaceWidth = "narrow" | "standard" | "wide";

export type WorkspaceContract = {
  accessibilityLabel: string;
  actions: readonly WorkspaceLinkActionContract[];
  id: string;
  kind: "workspace";
  label: string;
  sections: readonly WorkspaceSectionContract[];
  width: WorkspaceWidth;
};

export type ShellNavigationSectionRole =
  | "program"
  | "rootRecords"
  | "session"
  | "status"
  | "workspaceSwitcher";

export type ShellDestinationAvailability =
  | {
      available: true;
    }
  | {
      available: false;
      message: string;
    };

export type ShellDestinationBaseContract = {
  accessibilityLabel: string;
  availability: ShellDestinationAvailability;
  countText?: string;
  description?: string;
  icon?: string;
  id: string;
  label: string;
  selected: boolean;
};

export type ShellLinkDestinationContract = ShellDestinationBaseContract & {
  href: string;
  kind: "shellLinkDestination";
};

export type ShellRootRecordSelectionIntent = {
  destinationId: string;
  recordId: string;
  sectionId: string;
  shellId: string;
  type: "shellRootRecordSelection";
};

export type ShellRootRecordDestinationContract = ShellDestinationBaseContract & {
  kind: "shellRootRecordDestination";
  recordId: string;
  selectionIntent: ShellRootRecordSelectionIntent;
};

export type ShellDestinationContract =
  | ShellLinkDestinationContract
  | ShellRootRecordDestinationContract;

export type ShellSyncStatusDetailContract = {
  label: string;
  presentation: "text" | "timestamp";
  value: string;
};

export type ShellSyncStatusContract = {
  details?: readonly ShellSyncStatusDetailContract[];
  id: string;
  kind: "shellSyncStatus";
  label: string;
  message: string;
  state: "error" | "idle" | "syncing";
};

export type ShellWorkspaceSaveStatusContract = {
  id: string;
  kind: "shellWorkspaceSaveStatus";
  label: string;
  message: string;
  state: "clean" | "dirty" | "failed" | "queued" | "saved" | "saving";
};

export type ShellStatusContract = {
  id: string;
  kind: "shellStatus";
  sync?: ShellSyncStatusContract;
  workspaceSave?: ShellWorkspaceSaveStatusContract;
};

export type ShellSessionIdentityContract = {
  displayName: string;
  secondaryLabel?: string;
};

export type ShellSessionContract =
  | {
      id: string;
      kind: "shellSession";
      state: "anonymous";
    }
  | {
      id: string;
      identity: ShellSessionIdentityContract;
      kind: "shellSession";
      logout: ButtonContract;
      state: "authenticated";
    };

export type ShellNavigationSectionContract = {
  accessibilityLabel: string;
  createSurface?: CreateSurfaceContract;
  destinations: readonly ShellDestinationContract[];
  id: string;
  kind: "shellNavigationSection";
  label?: string;
  role: ShellNavigationSectionRole;
  session?: ShellSessionContract;
  status?: ShellStatusContract;
  shellId: string;
};

export type ShellDestinationIdentity = {
  destinationId: string;
  sectionId: string;
};

export type ShellManifestContract = {
  accessibilityLabel: string;
  activeDestination: ShellDestinationIdentity | null;
  id: string;
  kind: "shellManifest";
  navigationSections: readonly ShellNavigationSectionReference[];
  title: string;
  workspaceSwitcher: ShellNavigationSectionReference | null;
};

export type DocumentThemeMode = "system" | "light" | "dark";

export type DocumentThemeActiveMode = Exclude<DocumentThemeMode, "system">;

export type DocumentThemePolicy =
  | {
      kind: "fixed";
      mode: DocumentThemeActiveMode;
    }
  | {
      kind: "userControlled";
    };

export type DocumentThemeModeSelectionIntent = {
  controlId: string;
  mode: DocumentThemeMode;
  themeId: string;
  type: "documentThemeModeSelection";
};

export type DocumentThemeModeOptionContract = {
  label: string;
  mode: DocumentThemeMode;
  selectionIntent: DocumentThemeModeSelectionIntent;
};

export type DocumentThemeSelectionControlContract = {
  accessibilityLabel: string;
  id: string;
  kind: "documentThemeSelectionControl";
  options: readonly DocumentThemeModeOptionContract[];
  selectedMode: DocumentThemeMode;
};

type DocumentThemeContractBase = {
  activeMode: DocumentThemeActiveMode;
  id: string;
  kind: "documentTheme";
};

export type DocumentThemeContract = DocumentThemeContractBase &
  (
    | {
        policy: Extract<DocumentThemePolicy, { kind: "fixed" }>;
        selectionControl?: never;
      }
    | {
        policy: Extract<DocumentThemePolicy, { kind: "userControlled" }>;
        selectionControl: DocumentThemeSelectionControlContract;
      }
  );

export type AuthSurfaceKind =
  | "account-gate"
  | "collaborator-invitation-acceptance"
  | "owner-setup"
  | "account-sign-in"
  | "signup";

export type AuthMessageSeverity = "danger" | "info" | "success" | "warning";

export type AuthBrandContract = {
  kind: "authBrand";
  label: string;
};

export type AuthHeadingContract = {
  description?: string;
  kind: "authHeading";
  title: string;
};

export type AuthFrameContract = {
  accessibilityLabel: string;
  brand: AuthBrandContract;
  heading: AuthHeadingContract;
  kind: "authFrame";
};

export type AuthMessageContract = {
  detail?: string;
  id: string;
  kind: "authMessage";
  severity: AuthMessageSeverity;
  title: string;
};

export type AuthFactContract = {
  id: string;
  kind: "authFact";
  label: string;
  value: string;
};

export type AuthFieldPurpose = "display-name" | "email" | "profile-input" | "verification-token";

export type AuthFieldAutocomplete = "email" | "name" | "off" | "one-time-code";

export type AuthFieldIntentScope = {
  fieldId: string;
  surfaceId: string;
  type: "authField";
};

export type AuthFieldIntent = AuthFieldIntentScope & {
  intent: FieldIntent;
};

export type AuthFieldContract =
  | {
      autocomplete?: AuthFieldAutocomplete;
      field: CreateFieldContract;
      intent: AuthFieldIntentScope;
      kind: "authField";
      purpose: Exclude<AuthFieldPurpose, "profile-input">;
    }
  | {
      autocomplete?: AuthFieldAutocomplete;
      field: OperationInputFieldContract;
      intent: AuthFieldIntentScope;
      kind: "authField";
      purpose: "profile-input";
    };

export type AuthPolicyDestinationContract = {
  href: string;
  kind: "authPolicyDestination";
  label: string;
};

export type AuthPolicySelectionIntent = {
  accepted: boolean;
  policyId: string;
  surfaceId: string;
  type: "authPolicySelection";
};

export type AuthPolicyContract = {
  accepted: boolean;
  description?: string;
  destination?: AuthPolicyDestinationContract;
  id: string;
  kind: "authPolicy";
  label: string;
  required: boolean;
  selectionIntent?: AuthPolicySelectionIntent;
};

export type AuthActionPurpose = "logout" | "retry" | "submit";

export type AuthActionIntent = {
  actionId: string;
  controlId: string;
  surfaceId: string;
  type: "authAction";
};

export type AuthActionContract = {
  control: ButtonContract;
  id: string;
  intent: AuthActionIntent;
  kind: "authAction";
  purpose: AuthActionPurpose;
};

export type AuthPasskeyPurpose = "accept-invitation" | "create" | "sign-in";

export type AuthPasskeyIntent = {
  controlId: string;
  passkeyId: string;
  surfaceId: string;
  type: "authPasskey";
};

type AuthPasskeyBaseContract = {
  id: string;
  kind: "authPasskey";
  purpose: AuthPasskeyPurpose;
};

export type AuthPasskeyContract = AuthPasskeyBaseContract &
  (
    | {
        availability: "available";
        control: ButtonContract;
        intent: AuthPasskeyIntent;
        unavailableReason?: never;
      }
    | {
        availability: "unavailable";
        control?: never;
        intent?: never;
        unavailableReason: string;
      }
  );

export type AuthFeedbackContract = {
  detail?: string;
  id: string;
  kind: "authFeedback";
  severity: AuthMessageSeverity;
  title: string;
};

export type AuthContinuationDestinationContract = {
  detail?: string;
  id: string;
  kind: "authContinuationDestination";
  label: string;
  origin?: string;
};

export type AuthContinuationIntent = {
  controlId: string;
  destinationId: string;
  surfaceId: string;
  type: "authContinuation";
};

export type AuthContinuationContract = {
  control: ButtonContract;
  destination: AuthContinuationDestinationContract;
  intent: AuthContinuationIntent;
  kind: "authContinuation";
};

export type OwnerSetupAuthSurfaceState =
  | "already-complete"
  | "complete"
  | "continuing"
  | "failed"
  | "incomplete"
  | "invalid"
  | "loading"
  | "passkey-unavailable"
  | "ready"
  | "submitting";

export type OwnerSetupStep = "completion" | "email-verification" | "identity" | "passkey";

export type AccountSignInAuthSurfaceState =
  | "complete"
  | "continuing"
  | "failed"
  | "incomplete"
  | "loading"
  | "logout-pending"
  | "passkey-unavailable"
  | "ready"
  | "submitting";

export type AccountGateKind =
  | "credential"
  | "email-verification"
  | "invitation"
  | "profile-completion"
  | "role-review"
  | "terms-acceptance";

export type AccountGateAuthSurfaceState =
  | "blocked"
  | "complete"
  | "continuing"
  | "failed"
  | "forbidden"
  | "loading"
  | "passkey-unavailable"
  | "ready"
  | "submitting"
  | "unavailable";

export type SignupStep = "email-verification" | "identity" | "passkey";

export type SignupAuthSurfaceState =
  | "complete"
  | "continuing"
  | "failed"
  | "loading"
  | "passkey-unavailable"
  | "ready"
  | "submitting";

export type CollaboratorInvitationAuthSurfaceState =
  | "accepted"
  | "continuing"
  | "eligible"
  | "failed"
  | "invalid-link"
  | "loading"
  | "passkey-unavailable"
  | "submitting"
  | "unavailable";

export type AuthSurfaceState =
  | AccountGateAuthSurfaceState
  | CollaboratorInvitationAuthSurfaceState
  | OwnerSetupAuthSurfaceState
  | AccountSignInAuthSurfaceState
  | SignupAuthSurfaceState;

export type AuthSurfaceBaseContract = {
  actions: readonly AuthActionContract[];
  continuation?: AuthContinuationContract;
  facts: readonly AuthFactContract[];
  feedback?: AuthFeedbackContract;
  fields: readonly AuthFieldContract[];
  frame: AuthFrameContract;
  id: string;
  kind: "authSurface";
  message?: AuthMessageContract;
  passkey?: AuthPasskeyContract;
  pending: boolean;
  policies: readonly AuthPolicyContract[];
};

export type OwnerSetupAuthSurfaceContract = AuthSurfaceBaseContract & {
  state: OwnerSetupAuthSurfaceState;
  step?: OwnerSetupStep;
  surfaceKind: "owner-setup";
};

export type AccountSignInAuthSurfaceContract = AuthSurfaceBaseContract & {
  state: AccountSignInAuthSurfaceState;
  surfaceKind: "account-sign-in";
};

export type AccountGateAuthSurfaceContract = AuthSurfaceBaseContract &
  (
    | {
        gateKind?: never;
        state: "complete" | "continuing" | "failed" | "forbidden" | "loading";
        surfaceKind: "account-gate";
      }
    | {
        gateKind: AccountGateKind;
        state: Exclude<
          AccountGateAuthSurfaceState,
          "complete" | "continuing" | "failed" | "loading"
        >;
        surfaceKind: "account-gate";
      }
  );

export type SignupAuthSurfaceContract = AuthSurfaceBaseContract &
  (
    | {
        state: "loading";
        step?: never;
        surfaceKind: "signup";
      }
    | {
        state: Exclude<SignupAuthSurfaceState, "loading">;
        step: SignupStep;
        surfaceKind: "signup";
      }
  );

export type CollaboratorInvitationAuthSurfaceContract = AuthSurfaceBaseContract & {
  state: CollaboratorInvitationAuthSurfaceState;
  surfaceKind: "collaborator-invitation-acceptance";
};

export type AuthSurfaceContract =
  | AccountGateAuthSurfaceContract
  | CollaboratorInvitationAuthSurfaceContract
  | OwnerSetupAuthSurfaceContract
  | AccountSignInAuthSurfaceContract
  | SignupAuthSurfaceContract;

export type AuthIntent =
  | AuthActionIntent
  | AuthContinuationIntent
  | AuthFieldIntent
  | AuthPasskeyIntent
  | AuthPolicySelectionIntent;

export type AuthIntentHandler = (intent: AuthIntent) => Promise<void> | void;

export type AccessFeedbackContract = {
  detail?: string;
  id: string;
  intent: CompactStatusIntent;
  kind: "accessFeedback";
  title: string;
};

export type AccessDisplayFactContract = {
  id: string;
  intent?: CompactStatusIntent;
  kind: "accessDisplayFact";
  label: string;
  presentation: "status" | "text" | "timestamp";
  value: string;
};

export type AccessRoleContract = {
  id: string;
  kind: "accessRole";
  label: string;
  scope?: AccessDisplayFactContract;
};

export type AccessSurfaceKind = "instance" | "organization" | "program";

export type AccessRoleOptionContract = {
  disabledReason?: string;
  id: string;
  label: string;
  selected: boolean;
  surfaceId: string;
  surfaceKind: AccessSurfaceKind;
};

export type AccessPersonContract = {
  displayName: string;
  id: string;
  kind: "accessPerson";
  primaryEmail?: string;
  removal:
    | {
        action: AccessActionContract<AccessPersonRemovalConfirmationOpenChangeIntent>;
        availability: "available";
      }
    | {
        availability: "unavailable";
        control: ButtonContract;
        disabledReason: string;
      };
  roleAuthoring:
    | {
        action: AccessActionContract<AccessPersonRoleAuthoringOpenChangeIntent>;
        availability: "available";
        reference: AccessPersonRoleAuthoringReference;
      }
    | {
        availability: "unavailable";
        disabledReason?: string;
      };
  roles: readonly AccessRoleContract[];
  status: AccessDisplayFactContract;
};

export type AccessInvitationAuthoringOpenChangeIntent = {
  accessId: string;
  actionId: string;
  authoringId: string;
  controlId: string;
  open: boolean;
  type: "accessInvitationAuthoringOpenChange";
};

export type AccessInvitationFieldChangeIntent = {
  accessId: string;
  authoringId: string;
  fieldId: string;
  type: "accessInvitationFieldChange";
  value: string;
};

export type AccessInvitationRoleSelectionChangeIntent = {
  accessId: string;
  authoringId: string;
  controlId: string;
  selectedOptionIds: readonly string[];
  type: "accessInvitationRoleSelectionChange";
};

export type AccessInvitationMembershipSelectionChangeIntent = {
  accessId: string;
  authoringId: string;
  controlId: string;
  selectedOptionIds: readonly string[];
  type: "accessInvitationMembershipSelectionChange";
};

export type AccessInvitationSubmitIntent = {
  accessId: string;
  actionId: string;
  authoringId: string;
  controlId: string;
  type: "accessInvitationSubmit";
};

export type AccessPersonRoleAuthoringOpenChangeIntent = {
  accessId: string;
  actionId: string;
  authoringId: string;
  controlId: string;
  open: boolean;
  personId: string;
  type: "accessPersonRoleAuthoringOpenChange";
};

export type AccessPersonRoleSelectionChangeIntent = {
  accessId: string;
  authoringId: string;
  controlId: string;
  personId: string;
  selectedOptionIds: readonly string[];
  type: "accessPersonRoleSelectionChange";
};

export type AccessPersonRoleSubmitIntent = {
  accessId: string;
  actionId: string;
  authoringId: string;
  controlId: string;
  personId: string;
  type: "accessPersonRoleSubmit";
};

export type AccessInvitationDeletionConfirmationOpenChangeIntent = {
  accessId: string;
  actionId: string;
  confirmationId: string;
  controlId: string;
  invitationId: string;
  open: boolean;
  type: "accessInvitationDeletionConfirmationOpenChange";
};

export type AccessInvitationDeleteIntent = {
  accessId: string;
  actionId: string;
  confirmationId: string;
  controlId: string;
  invitationId: string;
  type: "accessInvitationDelete";
};

export type AccessPersonRemovalConfirmationOpenChangeIntent = {
  accessId: string;
  actionId: string;
  confirmationId: string;
  controlId: string;
  open: boolean;
  personId: string;
  type: "accessPersonRemovalConfirmationOpenChange";
};

export type AccessPersonRemoveIntent = {
  accessId: string;
  actionId: string;
  confirmationId: string;
  controlId: string;
  personId: string;
  type: "accessPersonRemove";
};

export type AccessIntent =
  | AccessInvitationDeleteIntent
  | AccessInvitationDeletionConfirmationOpenChangeIntent
  | AccessInvitationAuthoringOpenChangeIntent
  | AccessInvitationFieldChangeIntent
  | AccessInvitationMembershipSelectionChangeIntent
  | AccessInvitationRoleSelectionChangeIntent
  | AccessInvitationSubmitIntent
  | AccessPersonRemoveIntent
  | AccessPersonRemovalConfirmationOpenChangeIntent
  | AccessPersonRoleAuthoringOpenChangeIntent
  | AccessPersonRoleSelectionChangeIntent
  | AccessPersonRoleSubmitIntent;

export type AccessIntentHandler = (intent: AccessIntent) => Promise<void> | void;

export type AccessActionIntent = Extract<AccessIntent, { actionId: string }>;

export type AccessActionPurpose =
  | "authoring-cancel"
  | "authoring-open"
  | "invitation-submit"
  | "invitation-delete"
  | "invitation-deletion-cancel"
  | "invitation-deletion-open"
  | "person-removal-cancel"
  | "person-removal-open"
  | "person-remove"
  | "person-role-authoring-cancel"
  | "person-role-authoring-open"
  | "person-role-save";

export type AccessActionContract<Intent extends AccessActionIntent = AccessActionIntent> = {
  control: ButtonContract;
  id: string;
  intent: Intent;
  kind: "accessAction";
  purpose: AccessActionPurpose;
};

export type AccessInvitationDeletionContract =
  | {
      action: AccessActionContract<AccessInvitationDeletionConfirmationOpenChangeIntent>;
      availability: "available";
    }
  | {
      availability: "unavailable";
      disabledReason?: string;
    };

export type AccessInvitationContract = {
  expiresAt: AccessDisplayFactContract;
  id: string;
  inviter?: AccessDisplayFactContract;
  kind: "accessInvitation";
  deletion: AccessInvitationDeletionContract;
  scope?: AccessDisplayFactContract;
  status: AccessDisplayFactContract;
  target: AccessDisplayFactContract;
  targetEmail: string;
};

export type AccessInvitationFieldPurpose = "acceptance-target" | "display-name" | "target-email";

export type AccessInvitationFieldChangeIntentScope = Omit<
  AccessInvitationFieldChangeIntent,
  "value"
>;

export type AccessControlledFieldOptionContract = {
  disabledReason?: string;
  id: string;
  label: string;
  selected: boolean;
  value: string;
};

export type AccessControlledFieldContract = {
  changeIntent: AccessInvitationFieldChangeIntentScope;
  disabledReason?: string;
  errors: readonly string[];
  id: string;
  inputKind: "datetime" | "email" | "select" | "text";
  kind: "accessControlledField";
  label: string;
  options?: readonly AccessControlledFieldOptionContract[];
  purpose: AccessInvitationFieldPurpose;
  required: boolean;
  value: string;
};

export type AccessMembershipOptionContract = {
  disabledReason?: string;
  id: string;
  label: string;
  selected: boolean;
};

export type AccessMembershipOptionGroupContract = {
  id: string;
  kind: "accessMembershipOptionGroup";
  label: string;
  options: readonly AccessMembershipOptionContract[];
};

export type AccessMembershipSelectionContract = {
  changeIntent: Omit<AccessInvitationMembershipSelectionChangeIntent, "selectedOptionIds">;
  disabledReason?: string;
  errors: readonly string[];
  groups: readonly AccessMembershipOptionGroupContract[];
  id: string;
  kind: "accessMembershipSelection";
  label: string;
  selectedOptionIds: readonly string[];
};

export type AccessRoleSelectionChangeIntentScope =
  | Omit<AccessInvitationRoleSelectionChangeIntent, "selectedOptionIds">
  | Omit<AccessPersonRoleSelectionChangeIntent, "selectedOptionIds">;

export type AccessRoleSelectionContract = {
  changeIntent: AccessRoleSelectionChangeIntentScope;
  disabledReason?: string;
  errors: readonly string[];
  id: string;
  kind: "accessRoleSelection";
  label: string;
  options: readonly AccessRoleOptionContract[];
  selectedOptionIds: readonly string[];
};

export type AccessInvitationAuthoringFieldsContract = {
  acceptanceTarget?: AccessControlledFieldContract;
  displayName: AccessControlledFieldContract;
  targetEmail: AccessControlledFieldContract;
};

export type AccessInvitationAuthoringReference = {
  accessId: string;
  authoringId: string;
  kind: "accessInvitationAuthoringReference";
  role: "accessInvitationAuthoring";
};

export type AccessInvitationAuthoringContract = {
  accessId: string;
  cancel: AccessActionContract<AccessInvitationAuthoringOpenChangeIntent>;
  description: string;
  errors: readonly string[];
  feedback?: AccessFeedbackContract;
  fields: AccessInvitationAuthoringFieldsContract;
  id: string;
  kind: "accessInvitationAuthoring";
  membershipSelection: AccessMembershipSelectionContract;
  open: boolean;
  pending?: FieldPending;
  roleSelection: AccessRoleSelectionContract;
  submit: AccessActionContract<AccessInvitationSubmitIntent>;
  title: string;
};

export type AccessPersonRoleAuthoringReference = {
  accessId: string;
  authoringId: string;
  kind: "accessPersonRoleAuthoringReference";
  personId: string;
  role: "accessPersonRoleAuthoring";
};

export type AccessPersonRoleAuthoringContract = {
  accessId: string;
  cancel: AccessActionContract<AccessPersonRoleAuthoringOpenChangeIntent>;
  description: string;
  displayName: string;
  errors: readonly string[];
  feedback?: AccessFeedbackContract;
  id: string;
  kind: "accessPersonRoleAuthoring";
  open: boolean;
  pending?: FieldPending;
  personId: string;
  roleSelection: AccessRoleSelectionContract;
  save: AccessActionContract<AccessPersonRoleSubmitIntent>;
  title: string;
};

type AccessConfirmationBaseContract = {
  description: string;
  id: string;
  kind: "accessConfirmation";
  open: boolean;
  title: string;
};

export type AccessInvitationDeletionConfirmationContract = AccessConfirmationBaseContract & {
  action: AccessActionContract<AccessInvitationDeleteIntent>;
  cancel: AccessActionContract<AccessInvitationDeletionConfirmationOpenChangeIntent>;
  invitationId: string;
  purpose: "invitation-deletion";
};

export type AccessPersonRemovalConfirmationContract = AccessConfirmationBaseContract & {
  action: AccessActionContract<AccessPersonRemoveIntent>;
  cancel: AccessActionContract<AccessPersonRemovalConfirmationOpenChangeIntent>;
  personId: string;
  purpose: "person-removal";
};

export type AccessConfirmationContract =
  | AccessInvitationDeletionConfirmationContract
  | AccessPersonRemovalConfirmationContract;

export type AccessManifestReference = {
  accessId: string;
  kind: "accessManifestReference";
  role: "access";
};

type AccessManifestBaseContract = {
  accessibilityLabel: string;
  id: string;
  kind: "accessManifest";
  title: string;
};

export type AccessLoadingContract = AccessManifestBaseContract & {
  message: string;
  state: "loading";
};

export type AccessUnauthorizedContract = AccessManifestBaseContract & {
  feedback: AccessFeedbackContract;
  state: "unauthorized";
};

export type AccessFailureContract = AccessManifestBaseContract & {
  feedback: AccessFeedbackContract;
  state: "failed";
};

export type AccessEmptyStateContract = {
  description: string;
  id: string;
  kind: "accessEmptyState";
  title: string;
};

export type AccessReadyContract = AccessManifestBaseContract & {
  authoring: AccessInvitationAuthoringReference;
  confirmation?: AccessConfirmationContract;
  feedback?: AccessFeedbackContract;
  invitations: readonly AccessInvitationContract[];
  invitationsEmptyState?: AccessEmptyStateContract;
  invite: AccessActionContract<AccessInvitationAuthoringOpenChangeIntent>;
  people: readonly AccessPersonContract[];
  peopleEmptyState?: AccessEmptyStateContract;
  personAuthoring?: AccessPersonRoleAuthoringReference;
  state: "ready";
};

export type AccessManifestContract =
  | AccessFailureContract
  | AccessLoadingContract
  | AccessReadyContract
  | AccessUnauthorizedContract;

export type ManagementFeedbackContract = {
  detail?: string;
  id: string;
  intent: CompactStatusIntent;
  kind: "managementFeedback";
  title: string;
};

export type ManagementWorkspaceOperationIntent = {
  controlId: string;
  intent: OperationPresentationIntent;
  managementId: string;
  operationId: string;
  type: "managementWorkspaceOperation";
};

export type ManagementAuthorizationOpenIntent = {
  controlId: string;
  managementId: string;
  operationId: string;
  promptId: string;
  type: "managementAuthorizationOpen";
};

export type ManagementAccountSelectionIntent = {
  accountId: string;
  controlId: string;
  interactionId: string;
  managementId: string;
  operationId: string;
  promptId: string;
  pushId: string;
  type: "managementAccountSelection";
};

export type ManagementIntent =
  | ManagementAccountSelectionIntent
  | ManagementAuthorizationOpenIntent
  | ManagementWorkspaceOperationIntent;

export type ManagementIntentHandler = (intent: ManagementIntent) => Promise<void> | void;

export type ManagementAuthorizationPromptContract = {
  action: ButtonContract;
  detail?: string;
  id: string;
  intent: ManagementAuthorizationOpenIntent;
  kind: "managementAuthorizationPrompt";
  title: string;
};

export type ManagementAccountSelectionPromptContract = {
  choices: readonly {
    action: ButtonContract;
    accountId: string;
    id: string;
    intent: ManagementAccountSelectionIntent;
    label: string;
  }[];
  detail?: string;
  id: string;
  kind: "managementAccountSelectionPrompt";
  title: string;
};

export type ManagementWorkspaceOperationContract = {
  accountSelectionPrompt?: ManagementAccountSelectionPromptContract;
  authorizationPrompt?: ManagementAuthorizationPromptContract;
  control: OperationControlContract;
  id: string;
  kind: "managementWorkspaceOperation";
};

export type ManagementManifestReference = {
  kind: "managementManifestReference";
  managementId: string;
  role: "management";
};

export type ManagementWorkspaceReferenceContract = {
  reference: WorkspaceManifestReference;
  role: "routes";
};

type ManagementManifestBaseContract = {
  accessibilityLabel: string;
  id: string;
  kind: "managementManifest";
  title: string;
};

export type ManagementLoadingContract = ManagementManifestBaseContract & {
  message: string;
  state: "loading";
};

export type ManagementFailureContract = ManagementManifestBaseContract & {
  feedback: ManagementFeedbackContract;
  state: "failed";
};

export type ManagementReadyContract = ManagementManifestBaseContract & {
  state: "ready";
  workspaceFeedback?: ManagementFeedbackContract;
  workspaceOperation?: ManagementWorkspaceOperationContract;
  workspaces: readonly [
    ManagementWorkspaceReferenceContract,
    ...ManagementWorkspaceReferenceContract[],
  ];
};

export type ManagementManifestContract =
  | ManagementFailureContract
  | ManagementLoadingContract
  | ManagementReadyContract;

export type ApplicationSystemStateKind =
  | "blocked"
  | "empty"
  | "failure"
  | "loading"
  | "missing"
  | "unavailable";

export type ApplicationSystemStateActionPurpose = "continue" | "navigate" | "retry";

export type ApplicationSystemStateIntent = {
  actionId: string;
  controlId: string;
  stateId: string;
  type: "applicationSystemStateAction";
};

export type ApplicationSystemStateIntentHandler = (
  intent: ApplicationSystemStateIntent,
) => Promise<void> | void;

export type ApplicationSystemStateActionContract = {
  control: ButtonContract;
  id: string;
  intent: ApplicationSystemStateIntent;
  kind: "applicationSystemStateAction";
  purpose: ApplicationSystemStateActionPurpose;
};

export type ApplicationSystemStateFactContract = {
  id: string;
  kind: "applicationSystemStateFact";
  label: string;
  value: string;
};

export type ApplicationSystemStateFeedbackContract = {
  detail?: string;
  id: string;
  intent: CompactStatusIntent;
  kind: "applicationSystemStateFeedback";
  title: string;
};

export type ApplicationSystemStateContract = {
  accessibilityLabel: string;
  actions: readonly ApplicationSystemStateActionContract[];
  facts: readonly ApplicationSystemStateFactContract[];
  feedback?: ApplicationSystemStateFeedbackContract;
  heading: string;
  id: string;
  kind: "applicationSystemState";
  message: string;
  state: ApplicationSystemStateKind;
};

export type ApplicationSystemStateReference = {
  kind: "applicationSystemStateReference";
  role: "applicationSystemState";
  stateId: string;
};

export type DocumentThemeReference = {
  kind: "documentThemeReference";
  role: "documentTheme";
  themeId: string;
};

export type AuthSurfaceReference<SurfaceKind extends AuthSurfaceKind = AuthSurfaceKind> = {
  kind: "authSurfaceReference";
  role: "authSurface";
  surfaceId: string;
  surfaceKind: SurfaceKind;
};

export type WorkspaceManifestReference = {
  kind: "workspaceManifestReference";
  role: "workspace";
  workspaceId: string;
};

export type WorkspaceSectionShellReference = {
  kind: "workspaceSectionShellReference";
  role: "section";
  sectionId: string;
  workspaceId: string;
};

export type ShellManifestReference = {
  kind: "shellManifestReference";
  role: "shell";
  shellId: string;
};

export type ShellNavigationSectionReference = {
  kind: "shellNavigationSectionReference";
  role: "shellNavigationSection";
  sectionId: string;
  shellId: string;
};

export type ResultReferenceRole = "contextResult" | "mainResult";

export type ListResultReference = {
  kind: "listResultReference";
  resultId: string;
  role: "mainResult";
  sectionId: string;
  workspaceId: string;
};

export type TableResultReference = {
  kind: "tableResultReference";
  resultId: string;
  role: "mainResult";
  sectionId: string;
  workspaceId: string;
};

export type TreeResultReference = {
  kind: "treeResultReference";
  resultId: string;
  role: "mainResult";
  sectionId: string;
  workspaceId: string;
};

export type RecordResultReference<Role extends ResultReferenceRole = ResultReferenceRole> = {
  kind: "recordResultReference";
  resultId: string;
  role: Role;
  sectionId: string;
  workspaceId: string;
};

export type MainResultReference =
  | ListResultReference
  | RecordResultReference<"mainResult">
  | TableResultReference
  | TreeResultReference;

export type ContextResultReference = RecordResultReference<"contextResult">;

export type ResultReference = MainResultReference | ContextResultReference;

export type WorkspaceManifestContract = Omit<WorkspaceContract, "kind" | "sections"> & {
  kind: "workspaceManifest";
  sections: readonly WorkspaceSectionShellReference[];
};

export type WorkspaceOrdinaryCollectionShellContract = Omit<
  WorkspaceOrdinaryCollectionContract,
  "contextDetail" | "result"
> & {
  contextDetail?: ContextResultReference;
  result: MainResultReference;
};

export type WorkspaceListDetailShellContract = Omit<
  WorkspaceListDetailContract,
  "contextDetail" | "result"
> & {
  contextDetail?: ContextResultReference;
  result: MainResultReference;
};

export type WorkspaceCollectionShellContract = Omit<WorkspaceCollectionContract, "presentation"> & {
  presentation: WorkspaceListDetailShellContract | WorkspaceOrdinaryCollectionShellContract;
};

export type WorkspaceSectionShellContract = Omit<
  WorkspaceSectionContract,
  "collection" | "kind"
> & {
  collection: WorkspaceCollectionShellContract;
  kind: "workspaceSectionShell";
};

export type PresentationReference =
  | AccessInvitationAuthoringReference
  | AccessManifestReference
  | AccessPersonRoleAuthoringReference
  | ApplicationSystemStateReference
  | AuthSurfaceReference
  | DocumentThemeReference
  | ListResultReference
  | ManagementManifestReference
  | RecordResultReference
  | ShellManifestReference
  | ShellNavigationSectionReference
  | TableResultReference
  | TreeResultReference
  | WorkspaceManifestReference
  | WorkspaceSectionShellReference;

type ShellCreateIntentScope = {
  destinationId?: string;
  sectionId: string;
  shellId: string;
  surfaceId: string;
  type: "shellCreate";
};

export type ShellCreateIntent = ShellCreateIntentScope &
  (
    | {
        intent: CreateIntent;
      }
    | {
        fieldId: string;
        intent: FieldIntent;
      }
  );

export type ShellLogoutIntent = {
  controlId: string;
  sectionId: string;
  shellId: string;
  type: "shellLogout";
};

export type ShellIntent = ShellCreateIntent | ShellLogoutIntent | ShellRootRecordSelectionIntent;

export type ShellIntentHandler = (intent: ShellIntent) => Promise<void> | void;

export type DocumentThemeIntent = DocumentThemeModeSelectionIntent;

export type DocumentThemeIntentHandler = (intent: DocumentThemeIntent) => Promise<void> | void;

export type WorkspaceIntentScope = {
  collectionId: string;
  screenId: string;
  sectionId: string;
};

export type WorkspaceExternalActionIntent = WorkspaceIntentScope & {
  actionId: string;
  controlId: string;
  intent: ActionTriggerIntent;
  type: "workspaceExternalAction";
};

export type WorkspaceCreateIntent = WorkspaceIntentScope & {
  contextId?: string;
  intent: CreateIntent;
  surfaceId: string;
  type: "workspaceCreate";
};

export type WorkspaceOperationIntent = WorkspaceIntentScope & {
  contextId?: string;
  controlId: string;
  intent: OperationPresentationIntent;
  recordId?: string;
  resultId?: string;
  type: "workspaceOperation";
};

export type WorkspaceFieldIntent = WorkspaceIntentScope & {
  contextId?: string;
  fieldId: string;
  intent: FieldIntent;
  recordId?: string;
  resultId?: string;
  surfaceId?: string;
  type: "workspaceField";
};

export type WorkspaceListIntent = WorkspaceIntentScope & {
  intent: ListIntent;
  resultId: string;
  type: "workspaceList";
};

export type WorkspaceTableIntent = WorkspaceIntentScope & {
  intent: TableIntent;
  resultId: string;
  type: "workspaceTable";
};

export type WorkspaceRecordResultIntent = WorkspaceIntentScope & {
  contextId?: string;
  intent: RecordResultIntent;
  resultId: string;
  type: "workspaceRecordResult";
};

export type WorkspaceTreeIntent = WorkspaceIntentScope & {
  intent: TreeIntent;
  resultId: string;
  type: "workspaceTree";
};

export type WorkspaceIntent =
  | WorkspaceContextSelectionIntent
  | WorkspaceCreateIntent
  | WorkspaceExternalActionIntent
  | WorkspaceFieldIntent
  | WorkspaceListIntent
  | WorkspaceOperationIntent
  | WorkspaceQuerySelectionIntent
  | WorkspaceRecordResultIntent
  | WorkspaceTableIntent
  | WorkspaceTreeIntent;

export type WorkspaceIntentHandler = (intent: WorkspaceIntent) => Promise<void> | void;

export type PresentationIntent =
  | AccessIntent
  | ApplicationSystemStateIntent
  | AuthIntent
  | DocumentThemeIntent
  | ManagementIntent
  | ShellIntent
  | WorkspaceIntent;

export type PresentationIntentHandler = (intent: PresentationIntent) => Promise<void> | void;
