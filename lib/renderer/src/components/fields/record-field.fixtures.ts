import type {
  DisplayFieldContract,
  FieldContract,
  RecordFieldContract,
} from "@dpeek/formless-presentation/contract";
import {
  booleanControl,
  dateControl,
  displayField,
  draftInput,
  enumControl,
  enumOptions,
  fieldError,
  numberControl,
  recordDrafts,
  recordField,
  referenceControl,
  referenceDisplayFacts,
  referenceEditorFacts,
  referenceOptions,
  textControl,
} from "./fixture-helpers.ts";

export type RecordFieldSurfaceFixture = {
  id: "detail" | "record" | "table-cell";
  label: string;
  records: readonly RecordFieldRecordFixture[];
};

export type RecordFieldRecordFixture = {
  fields: readonly FieldContract[];
  id: string;
};

const recordId = "task-launch-checklist";
const titleField = { type: "text", required: true, label: "Title" } as const;
const summaryField = {
  type: "text",
  required: false,
  label: "Summary",
  format: "longText",
} as const;
const estimateField = {
  type: "number",
  required: false,
  label: "Estimate",
  min: 0,
} as const;
const dueDateField = { type: "date", required: false, label: "Due date" } as const;
const completedField = { type: "boolean", required: false, label: "Completed" } as const;
const priorityField = {
  type: "enum",
  required: true,
  label: "Priority",
  values: [
    { key: "low", label: "Low", presentation: { color: "priority.low" } },
    { key: "normal", label: "Normal", presentation: { color: "priority.normal" } },
    { key: "high", label: "High", presentation: { color: "priority.high" } },
  ],
} as const;
const ownerField = {
  type: "reference",
  required: false,
  label: "Owner",
  to: "principal",
} as const;
const notesField = {
  type: "text",
  required: false,
  label: "Notes",
  format: "markdown",
} as const;
const accentField = {
  type: "text",
  required: false,
  label: "Accent",
  format: "color",
} as const;

const titleControl = textControl(titleField);
const summaryControl = textControl(summaryField);
const estimateControl = numberControl(estimateField);
const dueDateControl = dateControl(dueDateField);
const completedControl = booleanControl(completedField);
const priorityControl = enumControl(priorityField);
const ownerControl = referenceControl(ownerField);
const notesControl = textControl(notesField);
const accentControl = textControl(accentField);
const owners = [
  { id: "principal-dana", label: "Dana Peek" },
  { id: "principal-jordan", label: "Jordan Lee" },
] as const;

export function createRecordFieldSurfaceFixtures(): readonly RecordFieldSurfaceFixture[] {
  return [
    {
      id: "record",
      label: "Record",
      records: [{ id: recordId, fields: createRecordEditorFields() }],
    },
    {
      id: "table-cell",
      label: "Table cells",
      records: [
        {
          id: recordId,
          fields: createTableCellFields({
            completed: false,
            dueDate: "2026-07-24",
            dueDateDisplay: "24 Jul 2026",
            ownerId: "principal-dana",
            priority: "high",
            recordId,
            title: "Prepare launch checklist",
          }),
        },
        {
          id: "task-review-domains",
          fields: createTableCellFields({
            completed: true,
            dueDate: "2026-08-03",
            dueDateDisplay: "3 Aug 2026",
            ownerId: "principal-jordan",
            priority: "normal",
            recordId: "task-review-domains",
            title: "Review custom domain mappings",
          }),
        },
        {
          id: "task-publish-contact-form",
          fields: createTableCellFields({
            completed: false,
            dueDate: undefined,
            dueDateDisplay: "—",
            ownerId: "principal-archived",
            priority: "low",
            recordId: "task-publish-contact-form",
            title: "Publish the contact form and subscription workflow",
          }),
        },
      ],
    },
    {
      id: "detail",
      label: "Detail",
      records: [{ id: recordId, fields: createDetailFields() }],
    },
  ];
}

function createRecordEditorFields(): readonly RecordFieldContract[] {
  return [
    recordField({
      fieldName: "title",
      field: titleField,
      editor: titleControl.editor,
      control: titleControl,
      commit: "field-commit",
      drafts: recordDrafts({
        draftInput: draftInput("Publish launch checklist"),
        recordValue: "Prepare launch checklist",
      }),
      labelVisibility: "hidden",
      occurrence: recordFieldOccurrence("record", recordId, "title"),
      presentationMode: "heading",
      recordId,
      rendererKind: "autosize-text",
    }),
    recordField({
      fieldName: "summary",
      field: summaryField,
      editor: summaryControl.editor,
      control: summaryControl,
      commit: "field-commit",
      drafts: recordDrafts({
        recordValue: "Review the public launch checklist with the product team.",
      }),
      labelVisibility: "visible",
      occurrence: recordFieldOccurrence("record", recordId, "summary"),
      recordId,
      rendererKind: "textarea",
    }),
    recordField({
      fieldName: "estimate",
      field: estimateField,
      editor: estimateControl.editor,
      control: estimateControl,
      commit: "field-commit",
      drafts: recordDrafts({ draftInput: draftInput("many"), recordValue: 4 }),
      errors: [fieldError("estimate", "Enter a finite number.", "many")],
      labelVisibility: "visible",
      occurrence: recordFieldOccurrence("record", recordId, "estimate"),
      recordId,
      rendererKind: "number",
    }),
    recordField({
      fieldName: "dueDate",
      field: dueDateField,
      editor: dueDateControl.editor,
      control: dueDateControl,
      commit: "field-commit",
      drafts: recordDrafts({ recordValue: "2026-07-24" }),
      labelVisibility: "visible",
      occurrence: recordFieldOccurrence("record", recordId, "dueDate"),
      pending: { isPending: true, label: "Saving due date" },
      recordId,
      rendererKind: "date",
    }),
    recordField({
      fieldName: "priority",
      field: priorityField,
      editor: priorityControl.editor,
      control: priorityControl,
      commit: "immediate",
      drafts: recordDrafts({ recordValue: "high" }),
      labelVisibility: "visible",
      occurrence: recordFieldOccurrence("record", recordId, "priority"),
      options: { enumOptions: enumOptions(priorityField) },
      recordId,
      rendererKind: "enum",
    }),
    recordField({
      fieldName: "ownerId",
      field: ownerField,
      editor: ownerControl.editor,
      control: ownerControl,
      commit: "immediate",
      drafts: recordDrafts({ recordValue: "principal-dana" }),
      labelVisibility: "visible",
      occurrence: recordFieldOccurrence("record", recordId, "ownerId"),
      options: { referenceOptions: referenceOptions(owners) },
      recordId,
      reference: referenceEditorFacts(ownerField, "principal-dana", owners),
      rendererKind: "reference",
    }),
    recordField({
      fieldName: "completed",
      field: completedField,
      editor: completedControl.editor,
      control: completedControl,
      commit: "immediate",
      drafts: recordDrafts({ recordValue: false }),
      labelVisibility: "visible",
      occurrence: recordFieldOccurrence("record", recordId, "completed"),
      recordId,
      rendererKind: "checkbox",
    }),
    recordField({
      fieldName: "notes",
      field: notesField,
      editor: notesControl.editor,
      control: notesControl,
      commit: "field-commit",
      drafts: recordDrafts({ recordValue: "### Launch note\n\nConfirm publish readiness." }),
      labelVisibility: "visible",
      occurrence: recordFieldOccurrence("record", recordId, "notes"),
      recordId,
      rendererKind: "markdown",
    }),
    recordField({
      fieldName: "accent",
      field: accentField,
      editor: accentControl.editor,
      control: accentControl,
      commit: "field-commit",
      drafts: recordDrafts({ recordValue: "#2563eb" }),
      labelVisibility: "visible",
      occurrence: recordFieldOccurrence("record", recordId, "accent"),
      recordId,
      rendererKind: "color",
    }),
  ];
}

function createTableCellFields({
  completed,
  dueDate,
  dueDateDisplay,
  ownerId,
  priority,
  recordId,
  title,
}: {
  completed: boolean;
  dueDate: string | undefined;
  dueDateDisplay: string;
  ownerId: string;
  priority: (typeof priorityField.values)[number]["key"];
  recordId: string;
  title: string;
}): readonly (RecordFieldContract | DisplayFieldContract)[] {
  return [
    displayField({
      fieldName: "title",
      field: titleField,
      editor: titleControl.editor,
      control: titleControl,
      density: "compact",
      formatting: { displayValue: title },
      labelVisibility: "hidden",
      occurrence: recordFieldOccurrence("table-cell", recordId, "title"),
      recordId,
      surface: "table-cell",
      value: title,
    }),
    recordField({
      fieldName: "priority",
      field: priorityField,
      editor: priorityControl.editor,
      control: priorityControl,
      commit: "immediate",
      density: "compact",
      drafts: recordDrafts({ recordValue: priority }),
      labelVisibility: "hidden",
      occurrence: recordFieldOccurrence("table-cell", recordId, "priority"),
      options: { enumOptions: enumOptions(priorityField) },
      recordId,
      rendererKind: "enum",
      surface: "table-cell",
    }),
    recordField({
      fieldName: "ownerId",
      field: ownerField,
      editor: ownerControl.editor,
      control: ownerControl,
      commit: "immediate",
      density: "compact",
      drafts: recordDrafts({ recordValue: ownerId }),
      labelVisibility: "hidden",
      occurrence: recordFieldOccurrence("table-cell", recordId, "ownerId"),
      options: { referenceOptions: referenceOptions(owners) },
      recordId,
      reference: referenceEditorFacts(ownerField, ownerId, owners),
      rendererKind: "reference",
      surface: "table-cell",
    }),
    recordField({
      fieldName: "completed",
      field: completedField,
      editor: completedControl.editor,
      control: completedControl,
      commit: "immediate",
      density: "compact",
      drafts: recordDrafts({ recordValue: completed }),
      labelVisibility: "hidden",
      occurrence: recordFieldOccurrence("table-cell", recordId, "completed"),
      recordId,
      rendererKind: "checkbox",
      surface: "table-cell",
    }),
    displayField({
      fieldName: "dueDate",
      field: dueDateField,
      editor: dueDateControl.editor,
      control: dueDateControl,
      density: "compact",
      formatting: { displayValue: dueDateDisplay },
      labelVisibility: "hidden",
      occurrence: recordFieldOccurrence("table-cell", recordId, "dueDate"),
      recordId,
      surface: "table-cell",
      value: dueDate,
    }),
  ];
}

function createDetailFields(): readonly DisplayFieldContract[] {
  return [
    displayField({
      fieldName: "title",
      field: titleField,
      editor: titleControl.editor,
      control: titleControl,
      formatting: { displayValue: "Prepare launch checklist" },
      labelVisibility: "visible",
      occurrence: recordFieldOccurrence("detail", recordId, "title"),
      recordId,
      surface: "detail",
      value: "Prepare launch checklist",
    }),
    displayField({
      fieldName: "summary",
      field: summaryField,
      editor: summaryControl.editor,
      control: summaryControl,
      formatting: { displayValue: "Review the public launch checklist with the product team." },
      labelVisibility: "visible",
      occurrence: recordFieldOccurrence("detail", recordId, "summary"),
      recordId,
      surface: "detail",
      value: "Review the public launch checklist with the product team.",
    }),
    displayField({
      fieldName: "ownerId",
      field: ownerField,
      editor: ownerControl.editor,
      control: ownerControl,
      formatting: { displayValue: "principal-archived" },
      labelVisibility: "visible",
      occurrence: recordFieldOccurrence("detail", recordId, "ownerId"),
      options: { referenceOptions: referenceOptions(owners) },
      recordId,
      reference: referenceDisplayFacts("principal-archived", owners),
      surface: "detail",
      value: "principal-archived",
    }),
    displayField({
      fieldName: "estimate",
      field: estimateField,
      editor: estimateControl.editor,
      control: estimateControl,
      formatting: { displayValue: "4" },
      labelVisibility: "visible",
      occurrence: recordFieldOccurrence("detail", recordId, "estimate"),
      recordId,
      suffix: "hours",
      surface: "detail",
      value: 4,
    }),
    displayField({
      fieldName: "dueDate",
      field: dueDateField,
      editor: dueDateControl.editor,
      control: dueDateControl,
      formatting: { displayValue: "24 July 2026" },
      labelVisibility: "visible",
      occurrence: recordFieldOccurrence("detail", recordId, "dueDate"),
      recordId,
      surface: "detail",
      value: "2026-07-24",
    }),
    displayField({
      fieldName: "notes",
      field: notesField,
      editor: notesControl.editor,
      control: notesControl,
      formatting: { displayValue: "Launch note" },
      labelVisibility: "visible",
      occurrence: recordFieldOccurrence("detail", recordId, "notes"),
      recordId,
      surface: "detail",
      value: "### Launch note\n\nConfirm publish readiness.",
    }),
    displayField({
      fieldName: "accent",
      field: accentField,
      editor: accentControl.editor,
      control: accentControl,
      formatting: { displayValue: "#2563eb" },
      labelVisibility: "visible",
      occurrence: recordFieldOccurrence("detail", recordId, "accent"),
      recordId,
      surface: "detail",
      value: "#2563eb",
    }),
    displayField({
      fieldName: "fallback",
      field: summaryField,
      editor: summaryControl.editor,
      control: summaryControl,
      formatting: { displayValue: "—" },
      label: "Outcome",
      labelVisibility: "visible",
      occurrence: recordFieldOccurrence("detail", recordId, "fallback"),
      recordId,
      surface: "detail",
    }),
  ];
}

function recordFieldOccurrence(surface: string, ownerId: string, placementId: string) {
  return { ownerId: `record-fields:${surface}:${ownerId}`, placementId };
}
