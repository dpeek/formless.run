import { useState } from "react";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type {
  FieldEditor,
  FieldEditorControl,
  FieldInputAttributes,
  FieldSchema,
  FieldValue,
  GeneratedFieldDraftInput,
} from "@dpeek/formless-schema";
import type {
  DisplayFieldContract,
  EnumOption,
  FieldContract,
  FieldAccess,
  FieldControl,
  FieldIntent,
  MediaAssetOption,
  RecordFieldContract,
  StateMachineFacts,
  StateMachineField,
} from "@dpeek/formless-presentation/contract";
import { AstryxApplicationSurfaceFrame } from "./application-surface-frame.tsx";
import { fixtureFieldId } from "./fields/fixture-helpers.ts";
import { FieldRenderer, FieldSubmitFormAdapter } from "./fields/field-renderer.tsx";
import { FormlessFixtureFrame } from "./fixture-layout.tsx";

const pageIconSource = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="M5 19.25h14" />',
  '<path d="M7.25 19.25V5.75a1 1 0 0 1 1-1h7.5a1 1 0 0 1 1 1v13.5" />',
  '<path d="M9.75 8.75h4.5" />',
  '<path d="M9.75 12h4.5" />',
  '<path d="M9.75 15.25h2.5" />',
  "</svg>",
].join("");

const textField = {
  type: "text",
  required: true,
  label: "Title",
} satisfies Extract<
  FieldSchema,
  {
    type: "text";
  }
>;
const textareaField = {
  type: "text",
  required: false,
  label: "Summary",
  format: "longText",
} satisfies Extract<
  FieldSchema,
  {
    type: "text";
  }
>;
const iconField = {
  type: "text",
  required: false,
  label: "Icon",
  format: "icon",
} satisfies Extract<
  FieldSchema,
  {
    type: "text";
  }
>;
const imageMediaField = {
  type: "text",
  required: false,
  label: "Hero image",
} satisfies Extract<
  FieldSchema,
  {
    type: "text";
  }
>;
const completedField = {
  type: "boolean",
  required: false,
  label: "Completed",
  default: false,
} satisfies Extract<
  FieldSchema,
  {
    type: "boolean";
  }
>;
const estimateField = {
  type: "number",
  required: false,
  label: "Estimate",
  min: 0,
  integer: false,
} satisfies Extract<
  FieldSchema,
  {
    type: "number";
  }
>;
const statusField = {
  type: "enum",
  required: true,
  label: "Status",
  values: [
    { key: "draft", label: "Draft", presentation: { color: "neutral" } },
    { key: "review", label: "Review", presentation: { color: "warning" } },
    { key: "published", label: "Published", presentation: { color: "success" } },
    { key: "archived", label: "Archived", presentation: { color: "danger" } },
  ],
  default: "draft",
} satisfies Extract<
  FieldSchema,
  {
    type: "enum";
  }
>;
const ownerField = {
  type: "reference",
  required: true,
  label: "Owner",
  to: "principal",
} satisfies Extract<
  FieldSchema,
  {
    type: "reference";
  }
>;
const unitField = {
  type: "enum",
  required: true,
  label: "Unit",
  values: [
    { key: "h", label: "h" },
    { key: "d", label: "d" },
  ],
  default: "h",
} satisfies Extract<
  FieldSchema,
  {
    type: "enum";
  }
>;
const statusMachine = {
  field: "status",
  initial: "draft",
  terminal: ["published", "archived"],
  transitions: [
    { key: "submit", label: "Submit", from: ["draft"], to: "review" },
    { key: "publish", label: "Publish", from: ["review"], to: "published" },
    { key: "archive", label: "Archive", from: ["draft", "review"], to: "archived" },
  ],
} satisfies StateMachineField["machine"];
const statusStateMachine = {
  fieldName: "status",
  machineName: "publishing",
  machine: statusMachine,
  initialState: statusMachine.initial,
  terminalStates: statusMachine.terminal,
} satisfies StateMachineField;

const statusTransitionOperationNames = {
  archive: "archivePage",
  publish: "publishPage",
  submit: "submitPage",
} satisfies Record<(typeof statusMachine.transitions)[number]["key"], string>;
const mediaAssetOptions = [
  {
    id: "asset-hero",
    label: "Hero",
    href: "https://picsum.photos/seed/formless-canonical-hero/960/540",
    width: 960,
    height: 540,
  },
  {
    id: "asset-detail",
    label: "Detail",
    href: "https://picsum.photos/seed/formless-canonical-detail/960/540",
    width: 960,
    height: 540,
  },
] satisfies readonly MediaAssetOption[];

const statusOptions = enumOptions(statusField);

export function FormlessCanonicalFieldsLayout() {
  const [fields, setFields] = useState(createCanonicalFields);

  function handleIntent(intent: FieldIntent) {
    setFields((currentFields) => applyCanonicalFixtureIntent(currentFields, intent));
  }

  return (
    <FormlessFixtureFrame ariaLabel="Canonical field fixtures">
      <main>
        <AstryxApplicationSurfaceFrame width="standard">
          <VStack gap={4} width="100%">
            <Heading level={1}>Canonical Fields</Heading>
            <Grid columns={{ minWidth: 280, max: 3 }} gap={3} width="100%">
              {fields.map((field) => (
                <Card
                  key={`${field.surface}:${field.recordId ?? "new"}:${field.fieldName}`}
                  padding={4}
                  variant="muted"
                >
                  <VStack gap={3}>
                    <Text type="label" color="secondary" maxLines={1}>
                      {field.label}
                    </Text>
                    <FieldRenderer field={field} onIntent={handleIntent} />
                    <FieldSubmitFormAdapter field={field} />
                  </VStack>
                </Card>
              ))}
            </Grid>
          </VStack>
        </AstryxApplicationSurfaceFrame>
      </main>
    </FormlessFixtureFrame>
  );
}

function createCanonicalFields(): FieldContract[] {
  return [
    createField({
      fieldName: "title",
      field: textField,
      editor: "text",
      control: textControl(textField, "Title", "text", "text", {
        kind: "input",
        inputType: "text",
      }),
      draftInput: { kind: "input", value: "Review public route changes" },
      value: "Review public route changes",
    }),
    createField({
      fieldName: "summary",
      field: textareaField,
      editor: "textarea",
      control: textControl(textareaField, "Summary", "textarea", "textarea", { kind: "textarea" }),
      draftInput: {
        kind: "input",
        value: "Confirm generated fields, public contact copy, and publish readiness.",
      },
      value: "Confirm generated fields, public contact copy, and publish readiness.",
    }),
    recordField({
      fieldName: "completed",
      field: completedField,
      editor: "boolean",
      control: booleanControl(completedField, "Completed"),
      commit: "immediate",
      drafts: { draft: "false", draftInput: { kind: "value", value: false }, recordValue: false },
      formatting: { displayValue: "No" },
      rendererKind: "checkbox",
    }),
    recordField({
      fieldName: "ready",
      field: { ...completedField, label: "Ready" },
      editor: "boolean",
      control: booleanControl({ ...completedField, label: "Ready" }, "Ready"),
      commit: "immediate",
      drafts: { draft: "true", draftInput: { kind: "value", value: true }, recordValue: true },
      formatting: { displayValue: "Yes" },
      presentation: { mode: "completion" },
      rendererKind: "completion-checkbox",
    }),
    recordField({
      fieldName: "estimate",
      field: estimateField,
      editor: "number",
      control: numberControl(estimateField, "Estimate"),
      commit: "field-commit",
      drafts: {
        draft: "four-ish",
        draftInput: { kind: "input", value: "four-ish" },
        recordValue: 4,
      },
      errors: [
        {
          fieldName: "estimate",
          message: "Estimate keeps invalid text until it is numeric.",
          draftValue: { kind: "input", value: "four-ish" },
        },
      ],
      formatting: { displayValue: "4" },
      rendererKind: "number",
      suffix: "h",
      valueUnit: {
        clearable: false,
        options: [
          { label: "h", status: "declared", value: "h" },
          { label: "d", status: "declared", value: "d" },
        ],
        required: true,
        unitFieldName: "estimateUnit",
        unitField,
      },
    }),
    recordField({
      fieldName: "budget",
      field: { ...estimateField, label: "Budget" },
      editor: "number",
      control: numberControl({ ...estimateField, label: "Budget" }, "Budget"),
      commit: "field-commit",
      drafts: {
        draft: "8",
        draftInput: { kind: "value", value: 8 },
        recordValue: 8,
        unitDraft: "h",
        unitDraftInput: { kind: "input", value: "h" },
        unitRecordValue: "h",
      },
      formatting: { displayValue: "8" },
      rendererKind: "value-unit",
      valueUnit: {
        clearable: false,
        options: [
          { label: "h", status: "declared", value: "h" },
          { label: "d", status: "declared", value: "d" },
        ],
        required: true,
        unitFieldName: "estimateUnit",
        unitField,
      },
    }),
    recordField({
      fieldName: "status",
      field: statusField,
      editor: "enum",
      control: enumControl(statusField, "Status"),
      commit: "immediate",
      drafts: {
        draft: "review",
        draftInput: { kind: "input", value: "review" },
        recordValue: "review",
      },
      formatting: { displayValue: "Review", enumValuePresentation: statusOptions[1]?.presentation },
      options: { enumOptions: statusOptions },
      presentation: { mode: "iconOnly", trigger: "both", list: "both" },
      rendererKind: "enum-icon",
    }),
    recordField({
      fieldName: "ownerId",
      field: ownerField,
      editor: "reference",
      control: referenceControl(ownerField, "Owner"),
      commit: "immediate",
      drafts: {
        draft: "principal-archived",
        draftInput: { kind: "input", value: "principal-archived" },
        recordValue: "principal-archived",
      },
      formatting: { displayValue: "principal-archived" },
      options: {
        referenceOptions: [
          { id: "principal-dana", label: "Dana Peek" },
          { id: "principal-jordan", label: "Jordan Lee" },
        ],
      },
      reference: {
        clearable: false,
        kind: "editor",
        valueStatus: { kind: "missing", value: "principal-archived" },
      },
      rendererKind: "reference",
    }),
    recordField({
      fieldName: "heroImageId",
      field: imageMediaField,
      editor: "media",
      control: textControl(imageMediaField, "Hero image", "media", "media", {
        kind: "mediaUpload",
      }),
      commit: "field-commit",
      drafts: {
        draft: "asset-hero",
        draftInput: { kind: "input", value: "asset-hero" },
        recordValue: "asset-hero",
      },
      formatting: { displayValue: "asset-hero" },
      media: {
        fileSelectEnabled: true,
        mediaPreviewHref: mediaAssetOptions[0]?.href,
        previewHref: mediaAssetOptions[0]?.href,
        selectedAssetId: "asset-hero",
        uploadEnabled: true,
        uploadPatchFields: { mediaAssetFieldName: "heroImageId" },
      },
      options: { mediaAssetOptions },
      rendererKind: "media",
    }),
    recordField({
      fieldName: "heroMediaId",
      field: { ...imageMediaField, label: "Hero media" },
      editor: "media",
      control: textControl(
        { ...imageMediaField, label: "Hero media" },
        "Hero media",
        "media",
        "media",
        { kind: "mediaUpload" },
      ),
      commit: "field-commit",
      drafts: {
        draft: "asset-detail",
        draftInput: { kind: "input", value: "asset-detail" },
        recordValue: "asset-detail",
      },
      formatting: { displayValue: "asset-detail" },
      media: {
        fileSelectEnabled: true,
        mediaPreviewHref: mediaAssetOptions[1]?.href,
        previewHref: mediaAssetOptions[1]?.href,
        selectedAssetId: "asset-detail",
        uploadEnabled: true,
        uploadPatchFields: { mediaAssetFieldName: "heroMediaId" },
      },
      options: { mediaAssetOptions },
      rendererKind: "media",
    }),
    displayField({
      fieldName: "pageIcon",
      field: iconField,
      editor: "icon",
      control: textControl(iconField, "Icon", "icon", "icon", { kind: "icon" }),
      value: pageIconSource,
      formatting: { displayValue: "Published page" },
    }),
    displayField({
      fieldName: "status",
      field: statusField,
      editor: "enum",
      control: enumControl(statusField, "State"),
      value: "review",
      access: { kind: "stateMachine", writable: false },
      formatting: { displayValue: "Review", enumValuePresentation: statusOptions[1]?.presentation },
      options: { enumOptions: statusOptions },
      recordId: "page-home",
      stateMachine: statusStateMachine,
      stateMachineFacts: statusStateMachineFacts("review"),
    }),
    displayField({
      fieldName: "status",
      field: statusField,
      editor: "enum",
      control: enumControl(statusField, "Published state"),
      value: "published",
      access: { kind: "stateMachine", writable: false },
      formatting: {
        displayValue: "Published",
        enumValuePresentation: statusOptions[2]?.presentation,
      },
      options: { enumOptions: statusOptions },
      recordId: "page-published",
      stateMachine: statusStateMachine,
      stateMachineFacts: statusStateMachineFacts("published"),
    }),
  ];
}

function createField({
  control,
  draftInput,
  editor,
  field,
  fieldName,
  value,
}: {
  control: FieldControl;
  draftInput: GeneratedFieldDraftInput;
  editor: FieldEditor;
  field: FieldSchema;
  fieldName: string;
  value: FieldValue;
}): FieldContract {
  return {
    ...baseField({
      control,
      editor,
      field,
      fieldName,
      label: control.label,
      ownerId: "formless-ui-fields:create",
      surface: "create",
    }),
    access: { kind: "editable", canPatch: true, writable: true },
    commit: "submit",
    density: "default",
    draftInput,
    mode: "editor",
    surface: "create",
    value,
  };
}

function recordField({
  commit,
  control,
  drafts,
  editor,
  errors,
  field,
  fieldName,
  formatting,
  media,
  options,
  presentation,
  reference,
  rendererKind,
  suffix,
  valueUnit,
}: Pick<
  RecordFieldContract,
  "commit" | "control" | "drafts" | "editor" | "field" | "fieldName" | "formatting" | "rendererKind"
> &
  Partial<
    Pick<
      RecordFieldContract,
      "errors" | "media" | "options" | "presentation" | "reference" | "suffix" | "valueUnit"
    >
  >): RecordFieldContract {
  return {
    ...baseField({
      control,
      editor,
      field,
      fieldName,
      label: control.label,
      ownerId: "formless-ui-fields:record",
      surface: "record",
    }),
    access: { kind: "editable", canPatch: true, writable: true },
    commit,
    density: "default",
    drafts,
    errors,
    formatting,
    media,
    mode: "editor",
    options,
    presentation,
    reference,
    presentationMode: "default",
    rendererKind,
    suffix,
    surface: "record",
    value: drafts.recordValue,
    valueUnit,
  };
}

function displayField({
  access = { kind: "readOnly", writable: false },
  control,
  editor,
  field,
  fieldName,
  formatting,
  options,
  recordId,
  stateMachine,
  stateMachineFacts,
  value,
}: Pick<
  DisplayFieldContract,
  "control" | "editor" | "field" | "fieldName" | "formatting" | "value"
> &
  Partial<
    Pick<DisplayFieldContract, "options" | "recordId" | "stateMachine" | "stateMachineFacts">
  > & {
    access?: FieldAccess;
  }): DisplayFieldContract {
  return {
    ...baseField({
      control,
      editor,
      field,
      fieldName,
      label: control.label,
      ownerId: `formless-ui-fields:detail:${recordId ?? "standalone"}`,
      surface: "detail",
    }),
    access,
    commit: "submit",
    density: "default",
    formatting,
    mode: "display",
    options,
    recordId,
    stateMachine,
    stateMachineFacts,
    value,
  };
}

function baseField({
  control,
  editor,
  field,
  fieldName,
  label,
  ownerId,
  surface,
}: {
  control: FieldControl;
  editor: FieldEditor;
  field: FieldSchema;
  fieldName: string;
  label: string;
  ownerId: string;
  surface: FieldContract["surface"];
}) {
  return {
    control,
    editor,
    field,
    fieldId: fixtureFieldId({ ownerId, placementId: fieldName }),
    fieldName,
    label,
    labelVisibility: surface === "record" ? ("hidden" as const) : ("visible" as const),
    required: field.required,
    surface,
  };
}
function textControl(
  field: Extract<
    FieldSchema,
    {
      type: "text";
    }
  >,
  label: string,
  editor: Extract<FieldEditor, "text" | "textarea" | "icon" | "media">,
  controlKind: Extract<FieldControl["controlKind"], "text" | "textarea" | "icon" | "media">,
  control: FieldEditorControl,
): Extract<
  FieldControl,
  {
    kind: "text";
  }
> {
  return controlFacts({ control, controlKind, editor, field, kind: "text", label });
}
function booleanControl(
  field: Extract<
    FieldSchema,
    {
      type: "boolean";
    }
  >,
  label: string,
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
function numberControl(
  field: Extract<
    FieldSchema,
    {
      type: "number";
    }
  >,
  label: string,
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
function enumControl(
  field: Extract<
    FieldSchema,
    {
      type: "enum";
    }
  >,
  label: string,
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
function referenceControl(
  field: Extract<
    FieldSchema,
    {
      type: "reference";
    }
  >,
  label: string,
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
function enumOptions(
  field: Extract<
    FieldSchema,
    {
      type: "enum";
    }
  >,
): EnumOption[] {
  return field.values.map((option) => ({
    label: option.label,
    presentation: {
      color: {
        intent:
          option.presentation?.color === "success"
            ? "success"
            : option.presentation?.color === "warning"
              ? "warning"
              : option.presentation?.color === "danger"
                ? "danger"
                : "neutral",
        known: true,
        token: option.presentation?.color,
      },
      iconKnown: true,
      label: option.label,
    },
    status: "declared",
    value: option.key,
  }));
}
function applyCanonicalFixtureIntent(
  fields: readonly FieldContract[],
  intent: FieldIntent,
): FieldContract[] {
  if (intent.type === "createDraftChange") {
    return fields.map((field) =>
      field.mode === "editor" && field.surface === "create" && field.fieldName === intent.fieldName
        ? { ...field, draftInput: intent.fieldValue, value: intent.fieldValue.value }
        : field,
    );
  }

  if (intent.type === "recordEditorDraftChange") {
    return fields.map((field) =>
      isRecordField(field) && field.fieldName === intent.fieldName
        ? {
            ...field,
            drafts: {
              ...field.drafts,
              draft: intent.value,
              draftInput: { kind: "input", value: intent.value },
            },
          }
        : field,
    );
  }

  if (intent.type === "recordDraftChange") {
    return fields.map((field) => {
      if (!isRecordField(field)) {
        return field;
      }

      if (field.valueUnit?.unitFieldName === intent.fieldName) {
        return {
          ...field,
          drafts: {
            ...field.drafts,
            unitDraft: String(intent.fieldValue?.value ?? ""),
            unitDraftInput: intent.fieldValue,
          },
        };
      }

      if (field.fieldName !== intent.fieldName) {
        return field;
      }

      return {
        ...field,
        drafts: {
          ...field.drafts,
          draft: String(intent.fieldValue?.value ?? ""),
          draftInput: intent.fieldValue,
        },
      };
    });
  }

  if (intent.type === "recordDraftCommit") {
    return fields.map((field) => {
      if (!isRecordField(field) || field.fieldName !== intent.fieldName) {
        return field;
      }

      const value = fieldValueFromDraftInput(field.field, intent.fieldValue);

      return {
        ...field,
        drafts: {
          ...field.drafts,
          draftInput: intent.fieldValue,
          recordValue: value,
        },
        errors: removeFieldErrors(field.errors, field.fieldName),
        formatting: {
          ...field.formatting,
          displayValue: displayFieldValue(field.field, value),
        },
      };
    });
  }

  if (intent.type === "recordDraftRevert") {
    return fields.map((field) =>
      isRecordField(field) && field.fieldName === intent.fieldName
        ? {
            ...field,
            drafts: {
              ...field.drafts,
              draft: String(field.drafts.recordValue ?? ""),
              draftInput: undefined,
              unitDraft: String(field.drafts.unitRecordValue ?? ""),
              unitDraftInput: undefined,
            },
            errors: removeFieldErrors(field.errors, field.fieldName),
          }
        : field,
    );
  }

  if (intent.type === "mediaAssetSelect") {
    return fields.map((field) => {
      if (!isRecordField(field) || field.fieldName !== intent.fieldName) {
        return field;
      }

      const asset = field.options?.mediaAssetOptions?.find(
        (option) => option.id === intent.assetId,
      );

      return {
        ...field,
        drafts: {
          ...field.drafts,
          draft: intent.assetId,
          draftInput: { kind: "input", value: intent.assetId },
          recordValue: intent.assetId,
        },
        formatting: { ...field.formatting, displayValue: intent.assetId },
        media:
          field.media === undefined
            ? undefined
            : {
                ...field.media,
                mediaPreviewHref: asset?.href ?? field.media.mediaPreviewHref,
                previewHref: asset?.href ?? field.media.previewHref,
                selectedAssetId: intent.assetId,
              },
      };
    });
  }

  if (intent.type === "recordValueCommit") {
    return fields.map((field) => {
      if (!isRecordField(field) || field.fieldName !== intent.fieldName) {
        return field;
      }

      const draftInput = generatedDraftInputFromValue(intent.value);

      return {
        ...field,
        drafts: {
          ...field.drafts,
          draft: String(intent.value),
          draftInput,
          recordValue: intent.value,
        },
        errors: removeFieldErrors(field.errors, field.fieldName),
        formatting: {
          ...field.formatting,
          displayValue: displayFieldValue(field.field, intent.value),
        },
      };
    });
  }

  if (intent.type === "recordValueUnitCommit") {
    return fields.map((field) => {
      if (!isRecordField(field) || field.fieldName !== intent.fieldName) {
        return field;
      }

      if (!field.valueUnit) {
        return field;
      }

      const fieldValue = fieldValueFromDraftInput(field.field, intent.commit.fieldDraftInput);
      const unitValue = fieldValueFromDraftInput(
        field.valueUnit.unitField,
        intent.commit.unitDraftInput,
      );

      return {
        ...field,
        drafts: {
          ...field.drafts,
          draft: String(fieldValue ?? ""),
          draftInput: intent.commit.fieldDraftInput,
          recordValue: fieldValue,
          unitDraft: String(unitValue ?? ""),
          unitDraftInput: intent.commit.unitDraftInput,
          unitRecordValue: unitValue,
        },
        errors: removeFieldErrors(field.errors, field.fieldName),
        formatting: {
          ...field.formatting,
          displayValue: displayFieldValue(field.field, fieldValue),
        },
      };
    });
  }

  if (intent.type === "fieldErrorChange") {
    return fields.map((field) => {
      if (field.fieldName !== intent.fieldName) {
        return field;
      }

      const errors = removeFieldErrors(field.errors, intent.fieldName);

      return {
        ...field,
        errors:
          intent.message === null
            ? errors
            : [
                ...errors,
                {
                  fieldName: intent.fieldName,
                  message: intent.message,
                  draftValue: { kind: "input", value: "" },
                },
              ],
      };
    });
  }

  if (intent.type === "stateTransitionInvoke") {
    return fields.map((field) => {
      if (field.fieldName !== intent.fieldName || field.stateMachineFacts === undefined) {
        return field;
      }

      if (field.stateMachineFacts.interaction.kind !== "transitions") {
        return field;
      }

      const transition = field.stateMachineFacts.interaction.transitions.find(
        (candidate) => candidate.transitionName === intent.transitionName,
      );
      const nextValue = transition?.transition.to;

      if (nextValue === undefined || transition?.availability?.valid === false) {
        return field;
      }

      const stateMachineFacts = statusStateMachineFacts(nextValue);

      if (field.mode !== "display") {
        return {
          ...field,
          stateMachineFacts,
        };
      }

      return {
        ...field,
        formatting: { ...field.formatting, displayValue: displayEnumValue(statusField, nextValue) },
        stateMachineFacts,
        value: nextValue,
      };
    });
  }
  return Array.from(fields);
}
function displayEnumValue(
  field: Extract<
    FieldSchema,
    {
      type: "enum";
    }
  >,
  value: string,
) {
  return field.values.find((definition) => definition.key === value)?.label ?? value;
}
function statusStateMachineFacts(currentValue: string): StateMachineFacts {
  return {
    currentValue,
    initialState: statusMachine.initial,
    interaction: {
      invocationSource: "menuItem",
      kind: "transitions",
      transitions: statusMachine.transitions.map((transition) => {
        const transitionName = transition.key;
        const valid =
          transition.from.includes(currentValue) ||
          (currentValue.trim() !== "" &&
            statusField.values.every((definition) => definition.key !== currentValue) &&
            transition.to === statusStateMachine.initialState);
        return {
          operationName:
            statusTransitionOperationNames[
              transitionName as keyof typeof statusTransitionOperationNames
            ],
          label: transition.label,
          machineName: statusStateMachine.machineName,
          machine: statusMachine,
          transitionName,
          transition,
          fieldName: "status",
          field: statusField,
          availability: valid
            ? { valid: true }
            : {
                valid: false,
                disabledReason: `Requires ${transition.from
                  .map((value) => displayEnumValue(statusField, value))
                  .join(", ")}.`,
              },
        };
      }),
    },
    stateMachine: statusStateMachine,
    terminal: statusStateMachine.terminalStates.includes(currentValue),
    valueStatus:
      currentValue.trim() === ""
        ? { kind: "unset", message: "Current state is missing." }
        : statusField.values.some((definition) => definition.key === currentValue)
          ? { kind: "declared", value: currentValue }
          : {
              kind: "undeclared",
              message: `Current state "${currentValue}" is not declared.`,
              value: currentValue,
            },
  };
}

function generatedDraftInputFromValue(value: FieldValue): GeneratedFieldDraftInput {
  return typeof value === "boolean" || typeof value === "number"
    ? { kind: "value", value }
    : { kind: "input", value };
}

function fieldValueFromDraftInput(field: FieldSchema, input: GeneratedFieldDraftInput): FieldValue {
  if (input.kind === "value") {
    return input.value;
  }

  if (field.type === "number") {
    const number = Number(input.value);

    return Number.isFinite(number) ? number : input.value;
  }

  return input.value;
}

function displayFieldValue(field: FieldSchema, value: FieldValue | undefined) {
  if (value === undefined) {
    return "";
  }

  if (field.type === "boolean") {
    return value === true ? "Yes" : "No";
  }

  if (field.type === "enum" && typeof value === "string") {
    return displayEnumValue(field, value);
  }

  return String(value);
}

function removeFieldErrors(
  errors: readonly NonNullable<FieldContract["errors"]>[number][] | undefined,
  fieldName: string,
) {
  return (errors ?? []).filter((error) => error.fieldName !== fieldName);
}

function isRecordField(field: FieldContract): field is RecordFieldContract {
  return field.mode === "editor" && field.surface !== "create" && field.surface !== "operation";
}
