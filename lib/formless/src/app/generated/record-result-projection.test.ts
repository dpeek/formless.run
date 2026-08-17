import { describe, expect, it } from "vite-plus/test";
import type {
  AppSchema,
  EntityOperationSchema,
  EntitySchema,
  FieldSchema,
} from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { OperationControlContract } from "@dpeek/formless-presentation/contract";
import type { EntityOperationPresentationConfig } from "../../client/operation-presentation-model.ts";
import type { RecordResultModel } from "../../client/list-result-model.ts";
import type {
  RecordFieldConfig,
  RecordUnionPresentationConfig,
  TransitionStateOperationConfig,
} from "../../client/views.ts";
import { resolveIconCatalogSvg } from "../../shared/icon-catalog.ts";
import { nextGeneratedUpdateDraftSessionState } from "./record-field-authoring.ts";
import {
  createGeneratedRecordResultFieldAuthoringState,
  rebaseGeneratedRecordResultRecordState,
  resolveGeneratedRecordResultFieldIntent,
  selectGeneratedRecordResultFoundation,
  selectGeneratedRecordResultRuntimeForIntent,
} from "./generated-record-result-foundation.ts";

describe("generated Formless UI record-result projection", () => {
  it("projects a complete ready result with specialized fields, actions, warnings, and safe feedback", () => {
    const result = completeRecordResult();
    const record = blockRecord("block-1", {
      accent: "not-a-color",
      cost: 12.5,
      costUnit: "day",
      dueDate: "2026-07-20",
      hero: "missing-hero",
      icon: requiredIconSource("add"),
      priority: "urgent",
      status: "draft",
      title: "Launch post",
      type: "post",
    });
    const fieldState = {
      ...createGeneratedRecordResultFieldAuthoringState(record, result),
      iconDialogDraftByFieldName: { icon: "<svg>broken" },
      iconDialogOpenByFieldName: { icon: true },
      iconParseErrorByFieldName: { icon: "Enter valid SVG." },
      pendingByFieldName: { hero: true },
      pendingLabelByFieldName: { hero: "Uploading media" },
    };
    const base = selectGeneratedRecordResultFoundation({
      entity: blockEntity,
      entityName: "block",
      fieldState,
      id: "blocks:featured",
      mediaAssetOptionsByFieldName: { hero: [] },
      recordIds: [record.id],
      recordsById: { [record.id]: record },
      result,
      schema: mediaSchema,
    });
    const transition = requiredOperation(base, "transition");
    const deletion = requiredOperation(base, "delete");
    const projected = selectGeneratedRecordResultFoundation({
      confirmationOpenByControlId: { [deletion.binding.id]: true },
      entity: blockEntity,
      entityName: "block",
      fieldState,
      id: "blocks:featured",
      mediaAssetOptionsByFieldName: { hero: [] },
      operationStateByExecutionKey: {
        [deletion.binding.executionKey]: {
          completedAt: 10,
          executionKey: deletion.binding.executionKey,
          result: { displayError: "Deletion blocked by an active reference.", type: "failed" },
          status: "failed",
        },
        [transition.binding.executionKey]: {
          executionKey: transition.binding.executionKey,
          startedAt: 9,
          status: "pending",
        },
      },
      recordIds: [record.id],
      recordsById: { [record.id]: record },
      result,
      schema: mediaSchema,
    });
    const fields = Object.fromEntries(
      projected.recordResult.fields.map((field) => [field.fieldName, field]),
    );

    expect(projected.recordResult).toMatchObject({
      accessibilityLabel: "Block record",
      actions: {
        kind: "actionGroup",
        primary: [],
        secondary: [
          {
            control: {
              confirmation: { open: true },
              feedback: {
                detail: "Deletion blocked by an active reference.",
                status: "failed",
              },
            },
            role: "delete",
          },
        ],
      },
      availability: { state: "ready" },
      editing: { enabled: true },
      kind: "recordResult",
      selectedRecord: {
        accessibilityLabel: "Launch post",
        id: "block-1",
        kind: "recordResultRecord",
      },
      warnings: [
        {
          items: [
            { code: "block-route", message: "Post block should have a link." },
            { code: "post-body", message: "Post block should include body content." },
          ],
          kind: "recordResultWarning",
        },
      ],
    });
    expect(projected.recordResult.fields.map((field) => field.fieldName)).toEqual([
      "type",
      "title",
      "body",
      "icon",
      "hero",
      "accent",
      "cost",
      "dueDate",
      "priority",
      "status",
      "updatedAt",
    ]);
    expect(fields.title).toMatchObject({
      access: { kind: "readOnly" },
      labelVisibility: "visible",
      mode: "display",
    });
    expect(fields.body).toMatchObject({ rendererKind: "markdown" });
    expect(fields.icon).toMatchObject({
      icon: {
        canSave: false,
        customParseError: "Enter valid SVG.",
        dialogOpen: true,
      },
      rendererKind: "icon",
    });
    expect(fields.hero).toMatchObject({
      media: {
        missingSelectedAsset: { assetId: "missing-hero" },
        uploadPatchFields: {
          heightFieldName: "height",
          mediaAssetFieldName: "hero",
          widthFieldName: "width",
        },
      },
      pending: { isPending: true, label: "Uploading media" },
      rendererKind: "media",
    });
    expect(fields.accent).toMatchObject({
      color: { picker: { kind: "unavailable" }, swatch: { kind: "unavailable" } },
      rendererKind: "color",
    });
    expect(fields.cost).toMatchObject({
      rendererKind: "value-unit",
      valueUnit: { unitFieldName: "costUnit" },
    });
    expect(fields.dueDate).toMatchObject({ rendererKind: "quiet-date" });
    expect(fields.priority).toMatchObject({
      enum: { style: "rich", valueStatus: { kind: "undeclared", value: "urgent" } },
      rendererKind: "enum-icon",
    });
    expect(fields.status).toMatchObject({
      access: { kind: "stateMachine" },
      mode: "display",
      pending: { isPending: true, label: "Publish..." },
      stateMachineFacts: {
        interaction: {
          kind: "transitions",
          transitions: [
            {
              availability: { valid: true },
              control: {
                status: { status: "pending" },
                trigger: { pending: { isPending: true }, prominence: "primary" },
              },
              operationName: "publish",
            },
          ],
        },
        valueStatus: { kind: "declared", value: "draft" },
      },
    });
    expect(fields.updatedAt).toMatchObject({
      access: { fieldRef: { kind: "system", name: "updatedAt" }, kind: "system" },
      formatting: { displayValue: "2026-07-15T00:00:00.000Z" },
      mode: "display",
    });
    expect(JSON.stringify(projected.recordResult)).not.toContain("executionKey");
    expect(JSON.stringify(projected.recordResult)).not.toContain("canonicalOperationKey");
    expect(JSON.stringify(projected.recordResult)).not.toContain(
      '"createdAt":"2026-07-15T00:00:00.000Z"',
    );
    expect(JSON.stringify(projected.recordResult)).not.toContain(
      '"updatedAt":"2026-07-15T00:00:00.000Z"',
    );
  });

  it("selects the first record and draft-active union and visibleWhen fields", () => {
    const result = unionRecordResult();
    const first = blockRecord("article-1", {
      articleIcon: requiredIconSource("add"),
      kind: "article",
      summary: "Article summary",
      title: "Article",
    });
    const second = blockRecord("link-1", {
      kind: "link",
      title: "Link",
      url: "https://example.com",
    });
    const state = createGeneratedRecordResultFieldAuthoringState(first, result);
    const drafted = {
      ...state,
      session: nextGeneratedUpdateDraftSessionState({
        fieldName: "kind",
        fieldValue: { kind: "value", value: "link" },
        state: state.session,
      }),
    };
    const projected = selectGeneratedRecordResultFoundation({
      entity: unionEntity,
      entityName: "block",
      fieldState: drafted,
      id: "blocks:selected",
      recordIds: [first.id, second.id],
      recordsById: { [first.id]: first, [second.id]: second },
      result,
    });

    expect(projected.recordResult.selectedRecord?.id).toBe("article-1");
    expect(projected.recordResult.fields.map((field) => field.fieldName)).toEqual([
      "kind",
      "title",
      "url",
    ]);
    expect(projected.runtimePlan.fields.map(({ fieldConfig }) => fieldConfig.fieldName)).toEqual([
      "kind",
      "title",
      "url",
    ]);
  });

  it("selects explicit context records and synchronously rebases context presentation state", () => {
    const result = completeRecordResult();
    const first = blockRecord("block-1", {
      body: "First body",
      status: "draft",
      title: "First",
      type: "page",
    });
    const second = blockRecord("block-2", {
      body: "Second body",
      status: "draft",
      title: "Second",
      type: "page",
    });
    const stale = {
      ...createGeneratedRecordResultFieldAuthoringState(first, result),
      baselineRecordId: first.id,
      baselineUpdatedAt: first.updatedAt,
      confirmationOpenByControlId: { stale: true },
      errorsByFieldName: { body: "Stale error" },
      iconDialogOpenByFieldName: { icon: true },
      pendingByFieldName: { body: true },
    };
    const state = rebaseGeneratedRecordResultRecordState({
      current: stale,
      record: second,
      result,
    });
    const projected = selectGeneratedRecordResultFoundation({
      accessibilityLabel: "Second detail",
      confirmationOpenByControlId: state?.confirmationOpenByControlId,
      density: "compact",
      entity: blockEntity,
      entityName: "block",
      fieldPresentation: "contextDetail",
      fieldState: state,
      id: "workspace:blocks:result:detail",
      recordIds: [first.id, second.id],
      recordsById: { [first.id]: first, [second.id]: second },
      result,
      selectedRecordId: second.id,
    });
    const fields = Object.fromEntries(
      projected.recordResult.fields.map((field) => [field.fieldName, field]),
    );

    expect(state).toMatchObject({
      baselineRecordId: second.id,
      confirmationOpenByControlId: {},
      errorsByFieldName: {},
      iconDialogOpenByFieldName: {},
      pendingByFieldName: {},
    });
    expect(projected.recordResult).toMatchObject({
      accessibilityLabel: "Second detail",
      density: "compact",
      id: "workspace:blocks:result:detail",
      selectedRecord: { id: second.id },
    });
    expect(fields.title).toMatchObject({ density: "default", labelVisibility: "hidden" });
    expect(fields.body).toMatchObject({ density: "compact", labelVisibility: "visible" });
    expect(fields.body?.errors).toBeUndefined();
    expect(fields.body?.pending).toBeUndefined();
  });

  it("projects editing-disabled fields without changing read-only or lifecycle access", () => {
    const result = { ...completeRecordResult(), updateOperation: undefined };
    const record = blockRecord("block-1", {
      body: "Body",
      status: "draft",
      title: "Read only",
      type: "page",
    });
    const projected = selectGeneratedRecordResultFoundation({
      editingDisabledReason: "Updates are temporarily unavailable.",
      entity: blockEntity,
      entityName: "block",
      id: "blocks:readonly",
      recordIds: [record.id],
      recordsById: { [record.id]: record },
      result,
    });
    const fields = Object.fromEntries(
      projected.recordResult.fields.map((field) => [field.fieldName, field]),
    );

    expect(projected.recordResult.editing).toEqual({
      disabledReason: "Updates are temporarily unavailable.",
      enabled: false,
    });
    expect(fields.body).toMatchObject({
      access: {
        canPatch: false,
        disabledReason: "Updates are temporarily unavailable.",
        kind: "disabled",
      },
      mode: "editor",
    });
    expect(fields.title).toMatchObject({ access: { kind: "readOnly" }, mode: "display" });
    expect(fields.status).toMatchObject({ access: { kind: "stateMachine" }, mode: "display" });
  });

  it("keeps invalid visible transitions out of fields and hidden transitions as record actions", () => {
    const record = blockRecord("block-1", {
      status: "published",
      title: "Published",
      type: "page",
    });
    const visible = selectGeneratedRecordResultFoundation({
      entity: blockEntity,
      entityName: "block",
      id: "blocks:visible-status",
      recordIds: [record.id],
      recordsById: { [record.id]: record },
      result: completeRecordResult(),
    });
    const visibleStatus = requiredProjectedField(visible, "status");

    expect(visibleStatus.stateMachineFacts?.interaction).toEqual({ kind: "display" });
    expect(visible.recordResult.actions.primary).toEqual([]);
    expect(requiredOperation(visible, "transition").binding.availability).toEqual({
      reason: "Requires Draft.",
      state: "disabled",
    });

    const hidden = selectGeneratedRecordResultFoundation({
      entity: blockEntity,
      entityName: "block",
      id: "blocks:hidden-status",
      recordIds: [record.id],
      recordsById: { [record.id]: record },
      result: {
        ...completeRecordResult(),
        recordFields: completeFields.filter((field) => field.fieldName !== "status"),
      },
    });

    expect(hidden.recordResult.fields.some((field) => field.fieldName === "status")).toBe(false);
    expect(hidden.recordResult.actions.primary).toMatchObject([
      {
        control: {
          trigger: { disabled: true, disabledReason: "Requires Draft." },
        },
        role: "transition",
      },
    ]);
  });

  it("projects visible transition result feedback on the owning state-machine field", () => {
    const result = completeRecordResult();
    const record = blockRecord("block-1", {
      status: "draft",
      title: "Draft",
      type: "page",
    });
    const base = selectGeneratedRecordResultFoundation({
      entity: blockEntity,
      entityName: "block",
      id: "blocks:transition-feedback",
      recordIds: [record.id],
      recordsById: { [record.id]: record },
      result,
    });
    const transition = requiredOperation(base, "transition");
    const projected = selectGeneratedRecordResultFoundation({
      entity: blockEntity,
      entityName: "block",
      id: "blocks:transition-feedback",
      operationStateByExecutionKey: {
        [transition.binding.executionKey]: {
          completedAt: 12,
          executionKey: transition.binding.executionKey,
          result: { affectedCount: 2, createdRecordIds: ["audit-1"], type: "committed" },
          status: "committed",
        },
      },
      recordIds: [record.id],
      recordsById: { [record.id]: record },
      result,
    });
    const status = requiredProjectedField(projected, "status");
    const interaction = status.stateMachineFacts?.interaction;

    expect(interaction?.kind).toBe("transitions");
    if (interaction?.kind !== "transitions") {
      throw new Error("Missing record-result transition controls.");
    }
    expect(interaction.transitions[0]?.control).toMatchObject({
      feedback: { status: "committed" },
      status: { status: "committed" },
    });
    expect(projected.recordResult.actions.primary).toEqual([]);
  });

  it("resolves only matching record field, operation, and confirmation intents", () => {
    const result = completeRecordResult();
    const record = blockRecord("block-1", {
      body: "Body",
      status: "draft",
      title: "Launch post",
      type: "post",
    });
    const projected = selectGeneratedRecordResultFoundation({
      entity: blockEntity,
      entityName: "block",
      id: "blocks:featured",
      recordIds: [record.id],
      recordsById: { [record.id]: record },
      result,
    });
    const body = requiredProjectedField(projected, "body");
    const title = requiredProjectedField(projected, "title");
    const status = requiredProjectedField(projected, "status");
    const deletion = requiredOperation(projected, "delete");

    expect(
      selectGeneratedRecordResultRuntimeForIntent(projected.runtimePlan, {
        fieldId: body.fieldId,
        intent: { fieldName: "body", type: "recordEditorDraftChange", value: "Next" },
        recordId: record.id,
        resultId: "blocks:featured",
        type: "recordResultFieldIntent",
      }),
    ).toMatchObject({
      field: { fieldId: body.fieldId },
      fieldConfig: { fieldName: "body" },
      kind: "field",
      resultId: "blocks:featured",
    });
    expect(
      resolveGeneratedRecordResultFieldIntent(projected.runtimePlan, {
        fieldId: title.fieldId,
        intent: {
          fieldName: title.fieldName,
          fieldValue: { kind: "input", value: "Changed" },
          type: "recordDraftCommit",
        },
        recordId: record.id,
        resultId: "blocks:featured",
      }),
    ).toBeUndefined();
    for (const mismatch of [
      { fieldId: `${body.fieldId}:stale` },
      { intent: { fieldName: "title", type: "recordDraftRevert" as const } },
      { recordId: "other-record" },
      { resultId: "blocks:other" },
    ]) {
      expect(
        resolveGeneratedRecordResultFieldIntent(projected.runtimePlan, {
          fieldId: body.fieldId,
          intent: { fieldName: "body", type: "recordDraftRevert" },
          recordId: record.id,
          resultId: "blocks:featured",
          ...mismatch,
        }),
      ).toBeUndefined();
    }
    expect(
      selectGeneratedRecordResultRuntimeForIntent(projected.runtimePlan, {
        fieldId: status.fieldId,
        intent: {
          fieldName: "status",
          operationName: "publish",
          recordId: record.id,
          source: "menuItem",
          transitionName: "publish",
          type: "stateTransitionInvoke",
        },
        recordId: record.id,
        resultId: "blocks:featured",
        type: "recordResultFieldIntent",
      }),
    ).toMatchObject({
      field: { fieldId: status.fieldId },
      fieldConfig: { fieldName: "status" },
      kind: "field",
    });
    expect(
      selectGeneratedRecordResultRuntimeForIntent(projected.runtimePlan, {
        fieldId: status.fieldId,
        intent: {
          fieldName: "status",
          operationName: "archive",
          recordId: record.id,
          source: "menuItem",
          transitionName: "archive",
          type: "stateTransitionInvoke",
        },
        recordId: record.id,
        resultId: "blocks:featured",
        type: "recordResultFieldIntent",
      }),
    ).toBeUndefined();
    expect(
      selectGeneratedRecordResultRuntimeForIntent(projected.runtimePlan, {
        fieldId: body.fieldId,
        intent: { fieldName: "title", type: "recordDraftRevert" },
        recordId: record.id,
        resultId: "blocks:featured",
        type: "recordResultFieldIntent",
      }),
    ).toBeUndefined();
    expect(
      selectGeneratedRecordResultRuntimeForIntent(projected.runtimePlan, {
        controlId: deletion.binding.id,
        intent: {
          controlId: deletion.binding.id,
          open: true,
          type: "operationConfirmationOpenChange",
        },
        recordId: record.id,
        resultId: "blocks:featured",
        type: "recordResultOperationIntent",
      }),
    ).toMatchObject({ kind: "delete" });
    expect(
      selectGeneratedRecordResultRuntimeForIntent(projected.runtimePlan, {
        controlId: deletion.binding.id,
        intent: {
          controlId: deletion.binding.id,
          invocationSource: "confirmationDialog",
          type: "operationInvoke",
        },
        recordId: "other-record",
        resultId: "blocks:featured",
        type: "recordResultOperationIntent",
      }),
    ).toBeUndefined();
  });

  it("projects display-safe empty and unavailable states", () => {
    const result = completeRecordResult();
    const emptyStateAction = {
      control: emptyOperationControl("blocks:create-starter"),
      kind: "operationAction" as const,
      role: "command" as const,
    };
    const empty = selectGeneratedRecordResultFoundation({
      emptyStateAction,
      emptyStateDescription: "Create a block to get started.",
      entity: blockEntity,
      entityName: "block",
      id: "blocks:empty",
      recordIds: [],
      recordsById: {},
      result,
    });
    const unavailable = selectGeneratedRecordResultFoundation({
      entity: blockEntity,
      entityName: "block",
      id: "blocks:missing",
      recordIds: ["missing"],
      recordsById: {},
      result,
    });

    expect(empty.recordResult).toMatchObject({
      actions: { primary: [], secondary: [] },
      availability: { state: "empty" },
      emptyState: {
        action: { control: { id: "blocks:create-starter" }, role: "command" },
        description: "Create a block to get started.",
        kind: "recordResultEmptyState",
        title: "No block record found.",
      },
      fields: [],
      warnings: [],
    });
    expect(empty.recordResult.selectedRecord).toBeUndefined();
    expect(unavailable.recordResult).toMatchObject({
      actions: { primary: [], secondary: [] },
      availability: { message: "Record unavailable.", state: "unavailable" },
      fields: [],
      selectedRecord: {
        accessibilityLabel: "Block missing",
        id: "missing",
      },
      warnings: [],
    });
    expect(unavailable.runtimePlan.operations).toEqual([]);
  });

  it("rejects duplicate projected record-result field occurrences", () => {
    const result = completeRecordResult();
    const record = blockRecord("block-1", {
      status: "draft",
      title: "Launch post",
      type: "post",
    });
    const duplicate = result.recordFields[0]!;

    expect(() =>
      selectGeneratedRecordResultFoundation({
        entity: blockEntity,
        entityName: "block",
        id: "blocks:duplicate",
        recordIds: [record.id],
        recordsById: { [record.id]: record },
        result: { ...result, recordFields: [duplicate, duplicate] },
      }),
    ).toThrow('Generated record result "blocks:duplicate" contains duplicate field occurrence');
  });
});

function requiredProjectedField(
  foundation: ReturnType<typeof selectGeneratedRecordResultFoundation>,
  fieldName: string,
) {
  const field = foundation.recordResult.fields.find((field) => field.fieldName === fieldName);

  if (!field) {
    throw new Error(`Missing projected field ${fieldName}.`);
  }

  return field;
}

function requiredOperation(
  foundation: ReturnType<typeof selectGeneratedRecordResultFoundation>,
  kind: "delete" | "transition",
) {
  const operation = foundation.runtimePlan.operations!.find((candidate) => candidate.kind === kind);
  if (!operation) {
    throw new Error(`Missing ${kind} operation.`);
  }

  return operation;
}

function completeRecordResult(): RecordResultModel {
  return {
    deleteOperation: operationPresentation("delete", "Delete", "delete"),
    itemViewName: "blockDetail",
    recordFields: completeFields,
    transitionOperations: [transitionOperation()],
    type: "record",
    updateOperation: operationPresentation("update", "Update", "update"),
  };
}

function unionRecordResult(): RecordResultModel {
  return {
    itemViewName: "blockDetail",
    recordFields: unionBaseFields,
    recordUnion: contentUnion,
    transitionOperations: [],
    type: "record",
    updateOperation: operationPresentation("update", "Update", "update"),
  };
}

function operationPresentation(
  operationName: "delete" | "update",
  label: string,
  kind: "delete" | "update",
): EntityOperationPresentationConfig {
  return {
    canonicalKey: `block.${operationName}`,
    entityName: "block",
    label,
    operation: {
      audit: { input: "summary" },
      effect: kind === "delete" ? { type: "deleteRecord" } : { type: "patchRecord" },
      idempotency: { required: true },
      input: { fields: [] },
      kind,
      output: { type: kind },
      scope: "record",
    },
    operationName,
  };
}
function transitionOperation(): TransitionStateOperationConfig {
  const transitionName = "publish";
  const transition = statusMachine.machine.transitions.find(
    (definition) => definition.key === transitionName,
  )!;
  const operation = {
    audit: { input: "none" },
    effect: {
      config: { machine: statusMachine.machineName, transition: transitionName },
      handler: "transition-state",
      type: "operationHandler",
    },
    idempotency: { required: true },
    kind: "command",
    output: { type: "command" },
    scope: "record",
  } satisfies EntityOperationSchema;

  return {
    entity: blockEntity,
    field: fieldSchemas.status,
    fieldName: "status",
    label: "Publish",
    machine: statusMachine.machine,
    machineName: statusMachine.machineName,
    operation: {
      canonicalKey: "block.publish",
      entityName: "block",
      label: "Publish",
      operation,
      operationName: "publish",
    },
    operationName: "publish",
    transition,
    transitionName,
  };
}

function blockRecord(id: string, values: StoredRecord["values"]): StoredRecord {
  return {
    createdAt: "2026-07-15T00:00:00.000Z",
    entity: "block",
    id,
    updatedAt: "2026-07-15T00:00:00.000Z",
    values,
  };
}

function recordField(
  fieldName: string,
  field: FieldSchema,
  editor: RecordFieldConfig["editor"],
  options: Partial<
    Pick<
      RecordFieldConfig,
      "fieldRef" | "presentation" | "stateMachine" | "valueUnit" | "visibleWhen" | "writable"
    >
  > = {},
): RecordFieldConfig {
  return {
    commit: "field-commit",
    editor,
    field,
    fieldName,
    ...options,
  };
}

const fieldSchemas = {
  accent: { format: "color", required: false, type: "text" },
  body: { required: false, type: "text" },
  cost: { required: false, type: "number" },
  costUnit: {
    required: false,
    type: "enum",
    values: [
      { key: "day", label: "Day" },
      { key: "hour", label: "Hour" },
    ],
  },
  dueDate: { required: false, type: "date" },
  hero: { format: "href", required: false, type: "text" },
  icon: { format: "icon", required: false, type: "text" },
  kind: {
    required: true,
    type: "enum",
    values: [
      { key: "article", label: "Article" },
      { key: "link", label: "Link" },
    ],
  },
  priority: {
    required: false,
    type: "enum",
    values: [
      { key: "high", label: "High", presentation: { color: "danger", icon: "warning" } },
      { key: "normal", label: "Normal", presentation: { color: "neutral" } },
    ],
  },
  status: {
    required: true,
    type: "enum",
    values: [
      { key: "draft", label: "Draft", presentation: { color: "warning" } },
      { key: "published", label: "Published", presentation: { color: "success" } },
    ],
  },
  text: { required: false, type: "text" },
  title: { label: "Title", required: true, type: "text" },
  type: {
    required: true,
    type: "enum",
    values: [
      { key: "page", label: "Page" },
      { key: "post", label: "Post" },
    ],
  },
} satisfies Record<string, FieldSchema>;
const statusMachine = {
  fieldName: "status",
  initialState: "draft",
  machine: {
    field: "status",
    initial: "draft",
    terminal: ["published"],
    transitions: [{ key: "publish", from: ["draft"], label: "Publish", to: "published" }],
  },
  machineName: "publication",
  terminalStates: ["published"],
} satisfies NonNullable<RecordFieldConfig["stateMachine"]>;

const completeFields = [
  recordField("type", fieldSchemas.type, "enum"),
  recordField("title", fieldSchemas.title, "text", { writable: false }),
  recordField("body", fieldSchemas.body, "markdown"),
  recordField("icon", fieldSchemas.icon, "icon"),
  recordField("hero", fieldSchemas.hero, "media"),
  recordField("accent", fieldSchemas.accent, "color"),
  recordField("cost", fieldSchemas.cost, "number", {
    valueUnit: { unitField: fieldSchemas.costUnit, unitFieldName: "costUnit" },
  }),
  recordField("dueDate", fieldSchemas.dueDate, "date", {
    presentation: { visibility: "valueOrInteraction" },
  }),
  recordField("priority", fieldSchemas.priority, "enum", {
    presentation: { list: "icon" },
  }),
  recordField("status", fieldSchemas.status, "enum", { stateMachine: statusMachine }),
  recordField("updatedAt", fieldSchemas.text, "text", {
    fieldRef: { kind: "system", name: "updatedAt" },
    writable: false,
  }),
] satisfies RecordFieldConfig[];

const unionBaseFields = [
  recordField("kind", fieldSchemas.kind, "enum"),
  recordField("title", fieldSchemas.title, "text"),
  recordField("summary", fieldSchemas.text, "text", {
    visibleWhen: { field: "kind", values: ["article"] },
  }),
] satisfies RecordFieldConfig[];

const contentUnion = {
  discriminatorField: fieldSchemas.kind,
  discriminatorFieldName: "kind",
  union: {
    discriminator: "kind",
    entity: "block",
    variants: [
      { key: "article", fields: ["articleIcon"], label: "Article" },
      { key: "link", fields: ["url"], label: "Link" },
    ],
  },
  unionName: "blockByKind",
  variants: [
    {
      label: "Article",
      presentation: {
        fields: [recordField("articleIcon", fieldSchemas.icon, "icon")],
        type: "fields",
      },
      unionVariant: { fields: ["articleIcon"], label: "Article" },
      variantValue: "article",
    },
    {
      label: "Link",
      presentation: {
        fields: [recordField("url", fieldSchemas.text, "href")],
        type: "fields",
      },
      unionVariant: { fields: ["url"], label: "Link" },
      variantValue: "link",
    },
  ],
} satisfies RecordUnionPresentationConfig;
const blockEntity = {
  id: "entity_001b2bc6-c295-4273-86cd-a55fe4f3883a",
  fields: [
    ...Object.entries(fieldSchemas).map(([key, field]) => ({ key, ...field })),
    { key: "height", required: false, type: "number" },
    { key: "width", required: false, type: "number" },
  ],
  label: "Block",
  stateMachines: [
    {
      key: "publication",
      ...statusMachine.machine,
    },
  ],
} as EntitySchema;
const unionEntity = {
  id: "entity_a9035fd6-1a49-4106-8902-db1f670586dc",
  fields: [
    { key: "articleIcon", ...fieldSchemas.icon },
    { key: "kind", ...fieldSchemas.kind },
    { key: "summary", ...fieldSchemas.text },
    { key: "title", ...fieldSchemas.title },
    { key: "url", ...fieldSchemas.text },
  ],
  label: "Block",
} as EntitySchema;
const mediaSchema = {
  entities: [
    {
      key: "block",
      ...blockEntity,
    },
  ],
  itemViews: [],
  queries: [],
  tableViews: [],
  version: 1,
  views: [],
} as unknown as AppSchema;

function emptyOperationControl(id: string): OperationControlContract {
  return {
    id,
    kind: "operationControl",
    status: {
      accessibilityLabel: "Ready",
      detail: "Ready",
      id: `${id}:status`,
      intent: "neutral",
      kind: "compactStatus",
      label: "Ready",
      status: "idle",
    },
    trigger: {
      accessibilityLabel: "Create starter",
      content: { kind: "label", label: "Create starter" },
      density: "default",
      id: `${id}:trigger`,
      intent: { controlId: id, invocationSource: "button", type: "operationInvoke" },
      kind: "button",
      prominence: "primary",
      type: "button",
    },
  };
}

function requiredIconSource(id: string): string {
  const source = resolveIconCatalogSvg(id);
  if (!source) {
    throw new Error(`Missing icon ${id}.`);
  }

  return source;
}
