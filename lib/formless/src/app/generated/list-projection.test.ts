import { describe, expect, it } from "vite-plus/test";
import type { EntitySchema, FieldSchema } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import type {
  ListOperationActionContract,
  OperationControlContract,
} from "@dpeek/formless-presentation/contract";
import type { EntityOperationPresentationConfig } from "../../client/operation-presentation-model.ts";
import type { ResultOrderingConfig } from "../../client/result-ordering-model.ts";
import type { ListResultModel } from "../../client/list-result-model.ts";
import type {
  GeneratedOperationControlBinding,
  RecordFieldConfig,
  RecordUnionPresentationConfig,
} from "../../client/views.ts";
import { nextGeneratedUpdateDraftSessionState } from "./record-field-authoring.ts";
import { projectGeneratedOperationControl } from "./operation-projection.ts";
import { projectGeneratedRecordField } from "./field-projection.ts";
import {
  projectGeneratedListContract,
  projectGeneratedListOperationAction,
} from "./list-projection.ts";
import {
  createGeneratedListFieldAuthoringState,
  rebaseGeneratedListFieldAuthoringState,
  resolveGeneratedListFieldIntent,
  selectGeneratedListFoundation,
  selectGeneratedListRuntimeForIntent,
} from "./generated-list-foundation.ts";

describe("generated Formless UI list projection", () => {
  it("projects ordered fields, action hierarchy, warnings, and semantic ordering intents", () => {
    const transition = operationControl(transitionBinding(), false);
    const deletion = operationControl(deleteBinding(), true);
    const fields = [
      recordField("title", textField(), "text", "Review launch"),
      recordField("icon", iconField(), "icon", iconSource),
    ];
    const contract = projectGeneratedListContract({
      accessibilityLabel: "Task records",
      editingEnabled: true,
      id: "tasks:active",
      itemsByRecordId: {
        "task-1": {
          accessibilityLabel: "Review launch",
          actions: [
            {
              action: projectGeneratedListOperationAction(transition, "transition"),
              placement: "primary",
            },
            {
              action: projectGeneratedListOperationAction(deletion, "delete"),
              placement: "secondary",
            },
          ],
          fields,
          ordering: {
            accessibilityLabel: "Reorder Review launch",
            items: orderingItems("task-1"),
            pending: true,
          },
          readinessWarnings: [{ code: "owner", message: "Assign an owner." }],
        },
      },
      orderedRecordIds: ["task-1"],
    });

    expect(contract).toMatchObject({
      accessibilityLabel: "Task records",
      density: "compact",
      editing: { enabled: true },
      id: "tasks:active",
      items: [
        {
          accessibilityLabel: "Review launch",
          actions: {
            kind: "actionGroup",
            primary: [{ kind: "operationAction", role: "transition" }],
            secondary: [{ kind: "operationAction", role: "delete" }],
          },
          availability: { available: true },
          fields: [
            { mode: "editor", rendererKind: "text", surface: "record" },
            { icon: { valueMode: "svgSource" }, rendererKind: "icon" },
          ],
          kind: "listItem",
          warnings: [
            {
              items: [{ code: "owner", message: "Assign an owner." }],
              kind: "listWarning",
              title: "Readiness warnings",
            },
          ],
        },
      ],
      kind: "list",
    });
    expect(contract.items[0]?.ordering).toMatchObject({
      actions: [
        {
          direction: "top",
          disabled: true,
          intent: { direction: "top", type: "listReorder" },
          structurallyAvailable: false,
        },
        {
          direction: "down",
          disabled: true,
          intent: { direction: "down", type: "listReorder" },
          pending: { isPending: true },
          structurallyAvailable: true,
        },
      ],
      kind: "ordering",
      pending: true,
    });
    const deleteAction = contract.items[0]?.actions.secondary[0] as ListOperationActionContract;
    expect(deleteAction.control.confirmation).toMatchObject({
      closeIntent: { open: false, type: "operationConfirmationOpenChange" },
      open: true,
    });
    expect(JSON.stringify(contract)).not.toContain('"plan"');
    expect(JSON.stringify(contract)).not.toContain('"rank"');
    expect(JSON.stringify(contract)).not.toContain("canonicalOperationKey");
  });

  it("projects editing-disabled, empty, unavailable, and display-safe fallback states", () => {
    const empty = projectGeneratedListContract({
      accessibilityLabel: "Task records",
      editingDisabledReason: "Task updates are unavailable.",
      editingEnabled: false,
      emptyStateDescription: "Create a task to get started.",
      id: "tasks:empty",
      itemsByRecordId: {},
      orderedRecordIds: [],
    });
    const unavailable = projectGeneratedListContract({
      accessibilityLabel: "Task records",
      editingEnabled: false,
      id: "tasks:missing",
      itemsByRecordId: {
        missing: { unavailableMessage: "Record unavailable." },
      },
      orderedRecordIds: ["missing"],
    });

    expect(empty).toMatchObject({
      editing: { disabledReason: "Task updates are unavailable.", enabled: false },
      emptyState: {
        description: "Create a task to get started.",
        kind: "listEmptyState",
        title: "No records yet.",
      },
      items: [],
    });
    expect(unavailable.items[0]).toMatchObject({
      accessibilityLabel: "missing",
      actions: { primary: [], secondary: [] },
      availability: { available: false, message: "Record unavailable." },
      fields: [],
      warnings: [],
    });
  });

  it("selects ordered records, draft-active union and visibleWhen fields, actions, and private runtime plans", () => {
    const result = listResult();
    const recordsById = recordsByIdFrom([
      taskRecord("article-1", {
        bodyIcon: iconSource,
        kind: "article",
        order: 2000,
        summary: "Article summary",
        title: "Article",
      }),
      taskRecord("link-1", {
        kind: "link",
        order: 1000,
        title: "Link",
        url: "https://example.com",
      }),
    ]);
    const articleState = createGeneratedListFieldAuthoringState(recordsById["article-1"]!, result);
    const draftLinkState = {
      ...articleState,
      session: nextGeneratedUpdateDraftSessionState({
        fieldName: "kind",
        fieldValue: { kind: "value", value: "link" },
        state: articleState.session,
      }),
    };
    const base = selectGeneratedListFoundation({
      entity: taskEntity,
      entityName: "task",
      fieldStateByRecordId: { "article-1": draftLinkState },
      id: "tasks:active",
      recordIds: ["article-1", "link-1"],
      recordsById,
      result,
    });
    const deleteRuntime = base.runtimePlan.operations!.find(
      (operation) => operation.kind === "delete" && operation.recordId === "article-1",
    );
    const orderingRuntime = base.runtimePlan.operations!.find(
      (operation) => operation.kind === "ordering" && operation.recordId === "article-1",
    );
    const projected = selectGeneratedListFoundation({
      confirmationOpenByControlId:
        deleteRuntime === undefined ? {} : { [deleteRuntime.binding.id]: true },
      entity: taskEntity,
      entityName: "task",
      fieldStateByRecordId: { "article-1": draftLinkState },
      id: "tasks:active",
      operationStateByExecutionKey:
        orderingRuntime === undefined
          ? {}
          : {
              [orderingRuntime.binding.executionKey]: {
                executionKey: orderingRuntime.binding.executionKey,
                status: "pending",
              },
            },
      recordIds: ["article-1", "link-1"],
      recordsById,
      result,
    });

    expect(projected.list.items.map((item) => item.id)).toEqual(["link-1", "article-1"]);
    expect(projected.list.items[0]?.fields.map((field) => field.fieldName)).toEqual([
      "kind",
      "title",
      "url",
    ]);
    expect(projected.list.items[1]?.fields.map((field) => field.fieldName)).toEqual([
      "kind",
      "title",
      "url",
    ]);
    expect(
      projected.list.items[1]?.fields.find((field) => field.fieldName === "url"),
    ).toMatchObject({ control: { editor: "href" }, rendererKind: "text" });
    expect(projected.list.items[1]?.actions.secondary[0]).toMatchObject({
      control: { confirmation: { open: true } },
      role: "delete",
    });
    expect(projected.list.items[1]?.ordering?.pending).toBe(true);

    const titleField = projected.list.items[1]?.fields.find((field) => field.fieldName === "title");
    expect(titleField).toBeDefined();
    if (titleField === undefined) {
      throw new Error("Missing projected title field.");
    }
    const fieldIntent = {
      fieldName: "title",
      type: "recordEditorDraftChange" as const,
      value: "Next article",
    };
    expect(
      resolveGeneratedListFieldIntent(projected.runtimePlan, {
        fieldId: titleField.fieldId,
        intent: fieldIntent,
        recordId: "article-1",
        resultId: projected.list.id,
      }),
    ).toMatchObject({
      field: { fieldId: titleField.fieldId },
      fieldConfig: { fieldName: "title" },
      record: { id: "article-1" },
      recordId: "article-1",
      result: { type: "list" },
      resultId: projected.list.id,
    });
    for (const mismatch of [
      { fieldId: `${titleField.fieldId}:stale` },
      { intent: { ...fieldIntent, fieldName: "url" } },
      { recordId: "link-1" },
      { resultId: "tasks:other" },
    ]) {
      expect(
        resolveGeneratedListFieldIntent(projected.runtimePlan, {
          fieldId: titleField.fieldId,
          intent: fieldIntent,
          recordId: "article-1",
          resultId: projected.list.id,
          ...mismatch,
        }),
      ).toBeUndefined();
    }

    const downAction = projected.list.items[1]?.ordering?.actions.find(
      (action) => action.direction === "down",
    );
    const runtime = downAction
      ? selectGeneratedListRuntimeForIntent(projected.runtimePlan, downAction.intent)
      : undefined;

    expect(runtime?.item.plan).toMatchObject({ kind: "unavailable" });
    expect(JSON.stringify(projected.list)).not.toContain("updatedAt");
    expect(JSON.stringify(projected.list)).not.toContain('"plan"');
    expect(JSON.stringify(projected.list)).not.toContain("executionKey");
  });

  it("rebases stale list authoring state from the latest replica record", () => {
    const result = listResult();
    const original = taskRecord("article-1", { kind: "article", title: "Article" });
    const stale = createGeneratedListFieldAuthoringState(original, result);
    const updated = {
      ...original,
      updatedAt: "2026-07-16T00:00:00.000Z",
      values: { kind: "link", title: "Link", url: "https://example.com" },
    };
    const rebased = rebaseGeneratedListFieldAuthoringState(updated, result, stale);

    expect(rebased).not.toBe(stale);
    expect(rebased.baselineUpdatedAt).toBe(updated.updatedAt);
    expect(rebased.session.baselineValues).toEqual(updated.values);
  });

  it("rejects duplicate projected list field occurrences", () => {
    const result = listResult();
    const record = taskRecord("article-1", {
      kind: "article",
      order: 1000,
      title: "Article",
    });
    const duplicate = result.recordFields[0]!;

    expect(() =>
      selectGeneratedListFoundation({
        entity: taskEntity,
        entityName: "task",
        id: "tasks:duplicate",
        recordIds: [record.id],
        recordsById: { [record.id]: record },
        result: { ...result, recordFields: [duplicate, duplicate] },
      }),
    ).toThrow('Generated list "tasks:duplicate" contains duplicate field occurrence');
  });

  it("keeps the active specialized union field when the authoring discriminator is unchanged", () => {
    const result = listResult();
    const record = taskRecord("article-1", {
      bodyIcon: iconSource,
      kind: "article",
      order: 1000,
      summary: "Article summary",
      title: "Article",
    });
    const projected = selectGeneratedListFoundation({
      entity: taskEntity,
      entityName: "task",
      id: "tasks:active",
      recordIds: [record.id],
      recordsById: { [record.id]: record },
      result,
    });

    expect(projected.list.items[0]?.fields.map((field) => field.fieldName)).toEqual([
      "kind",
      "title",
      "summary",
      "bodyIcon",
    ]);
    expect(
      projected.list.items[0]?.fields.find((field) => field.fieldName === "bodyIcon"),
    ).toMatchObject({ icon: { valueMode: "svgSource" }, rendererKind: "icon" });
  });
});

function recordField(
  fieldName: string,
  field: FieldSchema,
  editor: "icon" | "text",
  value: string,
) {
  return projectGeneratedRecordField({
    canPatch: true,
    density: "compact",
    fieldConfig: { commit: "field-commit", editor, field, fieldName },
    occurrence: {
      owner: { kind: "listItem", listId: "list-test", recordId: "task-1" },
      placementId: fieldName,
    },
    recordId: "task-1",
    recordValue: value,
    surface: "record",
  });
}

function operationControl(
  binding: GeneratedOperationControlBinding,
  confirmationOpen: boolean,
): OperationControlContract {
  return projectGeneratedOperationControl({
    binding,
    confirmationOpen,
    presentation: {
      accessibilityLabel: binding.label,
      content: { kind: "label", label: binding.label },
      density: "compact",
      prominence: binding.destructive ? "destructive" : "primary",
    },
    state: { executionKey: binding.executionKey, status: "idle" },
  });
}

function transitionBinding(): GeneratedOperationControlBinding {
  return {
    availability: { state: "enabled" },
    canonicalOperationKey: "task.complete",
    entityName: "task",
    executionKey: "task.complete:task-1",
    id: "task-1:complete",
    input: {
      fieldName: "status",
      kind: "stateTransition",
      machineName: "taskStatus",
      targetState: "done",
      transitionName: "complete",
    },
    kind: "stateTransition",
    label: "Complete",
    operationKind: "command",
    operationName: "complete",
    scope: "record",
    visualIntent: "primary",
  };
}

function deleteBinding(): GeneratedOperationControlBinding {
  return {
    availability: { state: "enabled" },
    canonicalOperationKey: "task.delete",
    confirmation: {
      actionLabel: "Delete",
      description: "The task will be hidden from active views.",
      title: "Delete Review launch?",
    },
    destructive: true,
    entityName: "task",
    executionKey: "task.delete:task-1",
    id: "record-delete:task-1",
    input: { entityLabel: "Task", kind: "recordDelete", recordLabel: "Review launch" },
    kind: "delete",
    label: "Delete",
    operationKind: "delete",
    operationName: "delete",
    scope: "record",
    visualIntent: "destructive",
  };
}

function orderingItems(recordId: string) {
  return [
    {
      direction: "top" as const,
      disabled: true,
      disabledReason: "Already first",
      label: "Move to top",
      plan: { kind: "unavailable" as const, reason: "already-at-boundary" as const },
    },
    {
      direction: "down" as const,
      disabled: false,
      label: "Move down",
      plan: { kind: "patch" as const, rank: 3000, recordId },
    },
  ];
}

function listResult(): ListResultModel {
  return {
    deleteOperation: testOperation("task", "delete"),
    itemViewName: "taskListItem",
    ordering: taskOrdering,
    recordFields: baseFields,
    recordUnion: contentUnion,
    transitionOperations: [],
    type: "list",
    updateOperation: testOperation("task", "update"),
  };
}

function testOperation(
  entityName: string,
  kind: "delete" | "update",
): EntityOperationPresentationConfig {
  return {
    canonicalKey: `${entityName}.${kind}`,
    entityName,
    label: kind === "delete" ? "Delete" : "Update",
    operation: {
      audit: { input: "summary" },
      effect: kind === "delete" ? { type: "deleteRecord" } : { type: "patchRecord" },
      idempotency: { required: true },
      input: { fields: [] },
      kind,
      output: { type: kind },
      scope: "record",
    },
    operationName: kind,
  };
}

function recordsByIdFrom(records: readonly StoredRecord[]) {
  return Object.fromEntries(records.map((record) => [record.id, record]));
}

function taskRecord(id: string, values: StoredRecord["values"]): StoredRecord {
  return {
    createdAt: "2026-07-15T00:00:00.000Z",
    entity: "task",
    id,
    updatedAt: "2026-07-15T00:00:00.000Z",
    values,
  };
}

function textField(): FieldSchema {
  return { required: false, type: "text" };
}

function iconField(): FieldSchema {
  return { format: "icon", required: false, type: "text" };
}

const kindField = {
  required: true,
  type: "enum",
  values: [
    { key: "article", label: "Article" },
    { key: "link", label: "Link" },
  ],
} satisfies FieldSchema;
const baseFields = [
  { commit: "immediate", editor: "enum", field: kindField, fieldName: "kind" },
  { commit: "field-commit", editor: "text", field: textField(), fieldName: "title" },
  {
    commit: "field-commit",
    editor: "text",
    field: textField(),
    fieldName: "summary",
    visibleWhen: { field: "kind", values: ["article"] },
  },
] satisfies RecordFieldConfig[];

const contentUnion = {
  discriminatorField: kindField,
  discriminatorFieldName: "kind",
  union: {
    discriminator: "kind",
    entity: "task",
    variants: [
      { key: "article", fields: ["bodyIcon"], label: "Article" },
      { key: "link", fields: ["url"], label: "Link" },
    ],
  },
  unionName: "taskByKind",
  variants: [
    {
      label: "Article",
      presentation: {
        fields: [
          {
            commit: "field-commit",
            editor: "icon",
            field: iconField(),
            fieldName: "bodyIcon",
          },
        ],
        type: "fields",
      },
      unionVariant: { fields: ["bodyIcon"], label: "Article" },
      variantValue: "article",
    },
    {
      label: "Link",
      presentation: {
        fields: [{ commit: "field-commit", editor: "href", field: textField(), fieldName: "url" }],
        type: "fields",
      },
      unionVariant: { fields: ["url"], label: "Link" },
      variantValue: "link",
    },
  ],
} satisfies RecordUnionPresentationConfig;

const taskOrdering = {
  field: { min: 0, required: true, type: "number" },
  fieldName: "order",
  presentations: ["dragHandle"],
  scope: [],
} satisfies ResultOrderingConfig;
const taskEntity = {
  fields: [
    { key: "bodyIcon", ...iconField() },
    { key: "kind", ...kindField },
    { key: "order", ...taskOrdering.field },
    { key: "summary", ...textField() },
    { key: "title", ...textField() },
    { key: "url", ...textField() },
  ],
  label: "Task",
} as EntitySchema;
const iconSource = '<svg viewBox="0 0 24 24"><path d="M12 2v20" /></svg>';
