import { describe, expect, it } from "vite-plus/test";
import {
  generatedFieldDraftInput as schemaGeneratedFieldDraftInput,
  type FieldSchema,
  type GeneratedFieldDraftInput,
} from "@dpeek/formless-schema";
import type { RecordValues } from "@dpeek/formless-storage";
import type { RecordFieldConfig, RecordUnionPresentationConfig } from "../../client/views.ts";
import { initialGeneratedCreateDraftSessionState } from "./create-field-authoring.ts";
import { initialGeneratedOperationDraftSessionState } from "./operation-field-authoring.ts";
import {
  initialGeneratedUpdateDraftSessionState,
  nextGeneratedUpdateDraftSessionState,
  resolveGeneratedUpdateDraftPatchValues,
} from "./record-field-authoring.ts";
import {
  adaptGeneratedCreateDraftChange,
  adaptGeneratedFieldErrorChange,
  adaptGeneratedIconDialogCancel,
  adaptGeneratedIconDialogDraftChange,
  adaptGeneratedIconDialogOpenChange,
  adaptGeneratedIconDialogSave,
  adaptGeneratedMediaAssetSelect,
  adaptGeneratedMediaFileSelect,
  adaptGeneratedStateTransitionInvoke,
  adaptGeneratedOperationDraftChange,
  adaptGeneratedRecordEditorDraftChange,
  adaptGeneratedRecordDraftCommit,
  adaptGeneratedRecordDraftRevert,
  adaptGeneratedRecordValueCommit,
  adaptGeneratedRecordValueUnitCommit,
  createGeneratedFieldIntentHandler,
  generatedFieldDraftInput,
  type AdaptGeneratedRecordIntentOptions,
  type GeneratedIconDialogCancelResult,
  type GeneratedIconDialogOpenChangeResult,
  type GeneratedIconDialogSaveResult,
  type GeneratedMediaAssetSelectResult,
  type GeneratedRecordDraftChangeResult,
  type GeneratedRecordValueCommitResult,
  type GeneratedRecordValueUnitCommitResult,
} from "./field-intents.ts";

describe("generated field intent adapter", () => {
  it("adapts create draft changes into generated create draft session updates", () => {
    let state = initialGeneratedCreateDraftSessionState({ fields: [] });

    for (const [fieldName, value] of [
      ["title", generatedFieldDraftInput("Launch")],
      ["done", generatedFieldDraftInput(true)],
      ["owner", generatedFieldDraftInput("principal-1")],
      ["estimate", generatedFieldDraftInput("3.5")],
    ] as const) {
      const result = adaptGeneratedCreateDraftChange(
        { type: "createDraftChange", fieldName, fieldValue: value },
        { state },
      );

      state = result.state!;
      expect(result.fieldErrorChange).toEqual({ fieldName, message: null });
    }

    expect(state.draft.values).toEqual({
      done: { kind: "value", value: true },
      estimate: { kind: "input", value: "3.5" },
      owner: { kind: "input", value: "principal-1" },
      title: { kind: "input", value: "Launch" },
    });
  });

  it("adapts operation input intents into generated operation draft session updates", () => {
    let state = initialGeneratedOperationDraftSessionState({ fields: [] });

    for (const [inputName, value] of [
      ["contactEmail", schemaGeneratedFieldDraftInput("ada@example.com")],
      ["acceptedTerms", schemaGeneratedFieldDraftInput(false)],
      ["teamSize", schemaGeneratedFieldDraftInput("4")],
      ["topic", schemaGeneratedFieldDraftInput("sales")],
    ] as const) {
      const result = adaptGeneratedOperationDraftChange(
        { type: "operationDraftChange", inputName, inputValue: value },
        { state },
      );

      state = result.state!;
      expect(result.fieldErrorChange).toEqual({ fieldName: inputName, message: null });
    }

    expect(state.draft.values).toEqual({
      acceptedTerms: { kind: "value", value: false },
      contactEmail: { kind: "input", value: "ada@example.com" },
      teamSize: { kind: "input", value: "4" },
      topic: { kind: "input", value: "sales" },
    });
  });

  it("adapts record editor draft changes with current number decoding rules", () => {
    const result = adaptGeneratedRecordEditorDraftChange(
      { type: "recordEditorDraftChange", fieldName: "cost", value: "$many" },
      recordContext([costFieldConfig], { cost: 10 }),
    ) as GeneratedRecordDraftChangeResult;

    expect(result.draftChange).toEqual({
      fieldName: "cost",
      fieldValue: { kind: "input", value: "$many" },
    });
    expect(result.editorDraftChange).toEqual({ fieldName: "cost", value: "$many" });
    expect(result.state?.draft.values.cost).toEqual({ kind: "input", value: "$many" });
  });

  it("resolves record value commits through the generated update patch resolver", () => {
    const context = recordContext([titleFieldConfig], { title: "Old" });
    const result = adaptGeneratedRecordValueCommit(
      { type: "recordValueCommit", fieldName: "title", value: "New" },
      context,
    ) as GeneratedRecordValueCommitResult;
    const expected = resolveGeneratedUpdateDraftPatchValues({
      baselineValues: context.state.baselineValues,
      draft: {
        values: {
          ...context.state.draft.values,
          title: { kind: "input", value: "New" },
        },
      },
      fieldNames: ["title"],
      fields: [titleFieldConfig],
    });

    expect(result.draftChange).toEqual({
      fieldName: "title",
      fieldValue: { kind: "input", value: "New" },
    });
    expect(result.fieldErrorChange).toBeUndefined();
    expect(result.patchValues).toEqual(expected.patchValues);
    expect(result.resolution).toEqual(expected);

    const noop = adaptGeneratedRecordValueCommit(
      { type: "recordValueCommit", fieldName: "title", value: "Old" },
      context,
    ) as GeneratedRecordValueCommitResult;

    expect(noop.noop).toBe(true);
    expect(noop.patchValues).toEqual({});
  });

  it("commits fields from the active record union variant", () => {
    const result = adaptGeneratedRecordValueCommit(
      { type: "recordValueCommit", fieldName: "icon", value: newSvg },
      recordContext([titleFieldConfig], { title: "Home", type: "page" }, {}, { union: blockUnion }),
    ) as GeneratedRecordValueCommitResult;

    expect(result.patchValues).toEqual({ icon: newSvg });
  });

  it("keeps record value commit validation errors out of patch values", () => {
    const result = adaptGeneratedRecordValueCommit(
      { type: "recordValueCommit", fieldName: "estimate", value: "many" },
      recordContext([estimateFieldConfig], { estimate: 2 }),
    ) as GeneratedRecordValueCommitResult;

    expect(result.patchValues).toEqual({});
    expect(result.fieldErrorChange).toEqual({
      fieldName: "estimate",
      message: "Enter a finite number.",
    });
    expect(result.resolution?.fieldErrors).toEqual({
      estimate: {
        draftValue: { kind: "input", value: "many" },
        fieldName: "estimate",
        message: "Enter a finite number.",
      },
    });
  });

  it("commits the foundation-owned typed number draft", () => {
    const result = adaptGeneratedRecordDraftCommit(
      { type: "recordDraftCommit", fieldName: "cost", fieldValue: { kind: "value", value: 12.5 } },
      recordContext([costFieldConfig], { cost: 10 }),
    ) as GeneratedRecordValueCommitResult;

    expect(result.patchValues).toEqual({ cost: 12.5 });
    expect(result.draftChange).toEqual({
      fieldName: "cost",
      fieldValue: { kind: "value", value: 12.5 },
    });
  });

  it("adapts record draft revert into the undefined draft input callback shape", () => {
    const state = nextGeneratedUpdateDraftSessionState({
      fieldName: "title",
      fieldValue: { kind: "input", value: "Edited" },
      state: initialGeneratedUpdateDraftSessionState({
        baselineValues: { title: "Old" },
        fields: [titleFieldConfig],
      }),
    });
    const result = adaptGeneratedRecordDraftRevert(
      { type: "recordDraftRevert", fieldName: "title" },
      { fields: [titleFieldConfig], state },
    ) as GeneratedRecordDraftChangeResult;

    expect(result.draftChange).toEqual({
      fieldName: "title",
      fieldValue: undefined,
    });
    expect(result.editorDraftChange).toEqual({ fieldName: "title", value: "Old" });
    expect(result.state?.draft.values.title).toBeUndefined();
  });

  it("resolves value-unit commits for both value and unit fields", () => {
    const result = adaptGeneratedRecordValueUnitCommit(
      {
        type: "recordValueUnitCommit",
        fieldName: "cost",
        unitFieldName: "costUnit",
        commit: {
          fieldDraftInput: { kind: "value", value: 12.5 },
          unitDraftInput: { kind: "input", value: "hour" },
        },
      },
      recordContext([costFieldConfig], { cost: 10, costUnit: "day" }),
    ) as GeneratedRecordValueUnitCommitResult;

    expect(result.draftChange).toEqual({
      fieldName: "cost",
      fieldValue: { kind: "value", value: 12.5 },
    });
    expect(result.patchValues).toEqual({
      cost: 12.5,
      costUnit: "hour",
    });
    expect(result.fieldErrorChange).toBeUndefined();
  });

  it("reverts both value and unit drafts for a value-unit field", () => {
    const state = nextGeneratedUpdateDraftSessionState({
      fieldName: "costUnit",
      fieldValue: { kind: "input", value: "hour" },
      state: nextGeneratedUpdateDraftSessionState({
        fieldName: "cost",
        fieldValue: { kind: "value", value: 12.5 },
        state: initialGeneratedUpdateDraftSessionState({
          baselineValues: { cost: 10, costUnit: "day" },
          fields: [costFieldConfig],
        }),
      }),
    });
    const result = adaptGeneratedRecordDraftRevert(
      { type: "recordDraftRevert", fieldName: "cost" },
      { fields: [costFieldConfig], state },
    ) as GeneratedRecordDraftChangeResult;

    expect(result.additionalDraftChanges).toEqual([
      { fieldName: "costUnit", fieldValue: undefined },
    ]);
    expect(result.state?.draft.values.cost).toBeUndefined();
    expect(result.state?.draft.values.costUnit).toBeUndefined();
  });

  it("adapts field error intents into current field error callback payloads", () => {
    const returned = adaptGeneratedFieldErrorChange({
      type: "fieldErrorChange",
      fieldName: "title",
      message: "Save failed.",
    });
    const calls: unknown[] = [];
    const handler = createGeneratedFieldIntentHandler({
      callbacks: {
        onFieldErrorChange(change) {
          calls.push(change);
        },
      },
    });

    void handler({ type: "fieldErrorChange", fieldName: "title", message: null });

    expect(returned.fieldErrorChange).toEqual({
      fieldName: "title",
      message: "Save failed.",
    });
    expect(calls).toEqual([{ fieldName: "title", message: null }]);
  });

  it("maps media asset and file intents without doing upload work", () => {
    const asset = adaptGeneratedMediaAssetSelect(
      { type: "mediaAssetSelect", fieldName: "hero", assetId: "hero.webp" },
      recordContext([mediaFieldConfig], { hero: "old.webp" }),
    ) as GeneratedMediaAssetSelectResult;
    const file = { name: "hero.webp" } as File;
    const fileSelect = adaptGeneratedMediaFileSelect({
      type: "mediaFileSelect",
      fieldName: "hero",
      file,
    });

    expect(asset.editorDraftChange).toEqual({ fieldName: "hero", value: "hero.webp" });
    expect(asset.commit?.draftChange).toEqual({
      fieldName: "hero",
      fieldValue: { kind: "input", value: "hero.webp" },
    });
    expect(asset.commit?.patchValues).toEqual({ hero: "hero.webp" });
    expect(fileSelect.fileSelect).toEqual({ fieldName: "hero", file });
  });

  it("maps icon dialog intents and keeps save tied to record commit success", () => {
    const iconContext = recordContext(
      [iconFieldConfig],
      { icon: oldSvg },
      { icon: { kind: "input", value: draftSvg } },
      { iconDialogDraftByFieldName: { icon: newSvg } },
    );
    const draft = adaptGeneratedIconDialogDraftChange({
      type: "iconDialogDraftChange",
      fieldName: "icon",
      value: newSvg,
    });
    const open = adaptGeneratedIconDialogOpenChange({
      type: "iconDialogOpenChange",
      fieldName: "icon",
      open: true,
    }) as GeneratedIconDialogOpenChangeResult;
    const cancel = adaptGeneratedIconDialogCancel(
      { type: "iconDialogCancel", fieldName: "icon" },
      iconContext,
    ) as GeneratedIconDialogCancelResult;
    const save = adaptGeneratedIconDialogSave(
      { type: "iconDialogSave", fieldName: "icon" },
      iconContext,
    ) as GeneratedIconDialogSaveResult;

    expect(draft.iconDialogDraftChange).toEqual({ fieldName: "icon", value: newSvg });
    expect(open.iconDialogOpenChange).toEqual({ fieldName: "icon", open: true });
    expect(cancel.iconDialogDraftChange).toEqual({ fieldName: "icon", value: oldSvg });
    expect(cancel.iconDialogOpenChange).toEqual({ fieldName: "icon", open: false });
    expect(save.commit.patchValues).toEqual({ icon: newSvg });
    expect(save.onCommitSuccess).toEqual({
      editorDraftChange: { fieldName: "icon", value: newSvg },
      iconDialogOpenChange: { fieldName: "icon", open: false },
    });
  });

  it("defers executable state-transition binding to the future operation-control contract", () => {
    const result = adaptGeneratedStateTransitionInvoke({
      type: "stateTransitionInvoke",
      fieldName: "status",
      operationName: "startTask",
      recordId: "task-1",
      source: "menuItem",
      transitionName: "start",
    });

    expect(result).toMatchObject({
      kind: "stateTransitionDeferred",
      intent: {
        fieldName: "status",
        operationName: "startTask",
        recordId: "task-1",
        transitionName: "start",
      },
    });
    expect(result.reason).toContain("operation-control binding");
  });
});

function recordContext(
  fields: readonly RecordFieldConfig[],
  baselineValues: RecordValues,
  draftValues: Record<string, GeneratedFieldDraftInput | undefined> = {},
  options: Partial<AdaptGeneratedRecordIntentOptions> = {},
): AdaptGeneratedRecordIntentOptions {
  const state = Object.entries(draftValues).reduce(
    (nextState, [fieldName, fieldValue]) =>
      nextGeneratedUpdateDraftSessionState({
        fieldName,
        fieldValue,
        state: nextState,
      }),
    initialGeneratedUpdateDraftSessionState({
      baselineValues,
      fields: Array.from(fields),
    }),
  );

  return {
    fields,
    state,
    ...options,
  };
}

const textField = { type: "text", required: false } satisfies FieldSchema;
const numberField = { type: "number", required: false } satisfies FieldSchema;
const hrefField = { type: "text", required: false, format: "href" } satisfies FieldSchema;
const costUnitField = {
  type: "enum",
  required: false,
  values: [
    { key: "day", label: "Day" },
    { key: "hour", label: "Hour" },
  ],
} satisfies FieldSchema;
const titleFieldConfig = recordField("title", textField, "text");
const estimateFieldConfig = recordField("estimate", numberField, "number");
const costFieldConfig = recordField("cost", numberField, "number", {
  format: "currency",
  valueUnit: {
    unitFieldName: "costUnit",
    unitField: costUnitField,
  },
});
const mediaFieldConfig = recordField("hero", hrefField, "media");
const iconFieldConfig = recordField("icon", textField, "icon");
const blockTypeField = {
  type: "enum",
  required: true,
  values: [{ key: "page", label: "Page" }],
} satisfies FieldSchema;
const blockUnion = {
  unionName: "blockByType",
  union: {
    entity: "block",
    discriminator: "type",
    variants: [{ key: "page", label: "Page", fields: ["icon"] }],
  },
  discriminatorFieldName: "type",
  discriminatorField: blockTypeField,
  variants: [
    {
      variantValue: "page",
      label: "Page",
      unionVariant: { label: "Page", fields: ["icon"] },
      presentation: { type: "fields", fields: [iconFieldConfig] },
    },
  ],
} satisfies RecordUnionPresentationConfig;

const oldSvg = '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z" /></svg>';
const draftSvg = '<svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z" /></svg>';
const newSvg = '<svg viewBox="0 0 24 24"><path d="M8 8h8v8H8z" /></svg>';

function recordField(
  fieldName: string,
  field: FieldSchema,
  editor: RecordFieldConfig["editor"],
  options: {
    commit?: RecordFieldConfig["commit"];
    format?: RecordFieldConfig["format"];
    valueUnit?: RecordFieldConfig["valueUnit"];
    writable?: boolean;
  } = {},
): RecordFieldConfig {
  return {
    commit: options.commit ?? "field-commit",
    editor,
    field,
    fieldName,
    ...(options.format === undefined ? {} : { format: options.format }),
    ...(options.valueUnit === undefined ? {} : { valueUnit: options.valueUnit }),
    ...(options.writable === undefined ? {} : { writable: options.writable }),
  };
}
