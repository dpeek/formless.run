import { describe, expect, it } from "vite-plus/test";
import type {
  AppSchema,
  EntityOperationSchema,
  FieldSchema,
  GeneratedFieldDraftInput,
  PublicSafeOperationInputField,
  StateMachineTransitionSchema,
} from "@dpeek/formless-schema";
import { generatedFieldDraftInput } from "@dpeek/formless-schema";
import type {
  CreateDefaultConfig,
  CreateFieldConfig,
  RecordFieldConfig,
} from "../../client/views.ts";
import type { EntityOperationPresentationConfig } from "../../client/operation-presentation-model.ts";
import type { TransitionStateOperationConfig } from "../../client/state-machine-model.ts";
import type {
  DisplayFieldContract,
  RecordFieldContract,
} from "@dpeek/formless-presentation/contract";
import { resolveIconCatalogSvg } from "../../shared/icon-catalog.ts";
import {
  initialGeneratedCreateDraftSessionState,
  markGeneratedCreateDraftSessionSubmitted,
  nextGeneratedCreateDraftSessionState,
  selectGeneratedCreateDraftSession,
} from "./create-field-authoring.ts";
import {
  initialGeneratedOperationDraftSessionState,
  nextGeneratedOperationDraftSessionState,
  selectGeneratedOperationDraftSession,
} from "./operation-field-authoring.ts";
import {
  initialGeneratedUpdateDraftSessionState,
  nextGeneratedUpdateDraftSessionState,
  selectGeneratedUpdateDraftSession,
} from "./record-field-authoring.ts";
import {
  projectGeneratedCreateFields,
  projectGeneratedCreateField,
  projectGeneratedCreateSession,
  projectGeneratedCreateSurface,
  projectGeneratedDisplayField,
  projectGeneratedFieldId,
  projectGeneratedOperationFields,
  projectGeneratedOperationSession,
  projectGeneratedRecordField,
  projectGeneratedRecordFields,
  projectGeneratedRecordSession,
  selectValueUnitCommit,
} from "./field-projection.ts";

function createOccurrence(placementId: string, surfaceId = "projection-test:create") {
  return { owner: { kind: "createSurface" as const, surfaceId }, placementId };
}

function recordOccurrence(placementId: string, ownerId = "projection-test:record") {
  return { owner: { kind: "standalone" as const, ownerId }, placementId };
}

describe("generated field projection", () => {
  it("keeps occurrence ids stable across value changes and distinct across owners", () => {
    const fieldConfig = createField("title", fields.title, "text");
    const occurrence = createOccurrence("title", "create-a");
    const first = projectGeneratedCreateField({
      fieldConfig,
      occurrence,
      value: "First",
    });
    const updated = projectGeneratedCreateField({
      fieldConfig,
      occurrence,
      value: "Updated",
    });
    const otherSurface = projectGeneratedCreateField({
      fieldConfig,
      occurrence: createOccurrence("title", "create-b"),
      value: "First",
    });

    expect(first).not.toBe(updated);
    expect(first.fieldId).toBe(updated.fieldId);
    expect(otherSurface.fieldId).not.toBe(first.fieldId);
  });

  it("distinguishes the same semantic field across projected owner and placement scopes", () => {
    const occurrences = [
      createOccurrence("title", "create-a"),
      {
        owner: { kind: "listItem" as const, listId: "list-a", recordId: "record-a" },
        placementId: "title",
      },
      {
        owner: { kind: "recordResult" as const, resultId: "result-a", recordId: "record-a" },
        placementId: "title",
      },
      {
        owner: { kind: "tableCell" as const, tableId: "table-a", cellId: "cell-a" },
        placementId: "title",
      },
      {
        owner: { kind: "tableEditFieldSet" as const, tableId: "table-a", fieldSetId: "dialog-a" },
        placementId: "title",
      },
      { owner: { kind: "operationForm" as const, formId: "form-a" }, placementId: "title" },
      recordOccurrence("title", "standalone-a"),
      recordOccurrence("secondary-title", "standalone-a"),
    ];
    const ids = occurrences.map(projectGeneratedFieldId);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("projects opaque picker and swatch facts for color fields", () => {
    const colorField = {
      type: "text",
      required: false,
      label: "Accent",
      format: "color",
    } satisfies FieldSchema;
    const createColor = projectGeneratedCreateField({
      fieldConfig: createField("accent", colorField, "color"),
      occurrence: createOccurrence("accent"),
      value: "#abc",
    });
    const unsupportedAlphaDisplay = projectGeneratedDisplayField({
      fieldConfig: recordField("accent", colorField, "color"),
      occurrence: recordOccurrence("accent", "unsupported-alpha"),
      recordValue: "#2563eb80",
    });
    const invalidDisplay = projectGeneratedDisplayField({
      fieldConfig: recordField("accent", colorField, "color"),
      occurrence: recordOccurrence("accent", "invalid-color"),
      recordValue: "not-a-color",
    });

    expect(createColor.color).toEqual({
      picker: { kind: "hex", value: "#AABBCC" },
      swatch: { kind: "hex", value: "#AABBCC" },
    });
    expect(unsupportedAlphaDisplay.color).toEqual({
      picker: { kind: "unavailable" },
      swatch: { kind: "unavailable" },
    });
    expect(invalidDisplay.color).toEqual({
      picker: { kind: "unavailable" },
      swatch: { kind: "unavailable" },
    });
  });

  it("projects create sessions and field configs into submit-bound create fields", () => {
    const createFields = [
      createField("title", fields.title, "text"),
      createField("estimate", fields.estimate, "number"),
      createField("owner", fields.owner, "reference"),
      {
        ...createField("status", fields.status, "enum"),
        stateMachine,
      },
    ];
    const defaults = [
      {
        fieldName: "owner",
        field: fields.owner,
        value: { kind: "literal", value: "principal-1" },
      },
    ] satisfies CreateDefaultConfig[];
    const state = nextGeneratedCreateDraftSessionState({
      fieldName: "estimate",
      fieldValue: { kind: "input", value: "many" },
      state: nextGeneratedCreateDraftSessionState({
        fieldName: "title",
        fieldValue: { kind: "input", value: "Prepare launch" },
        state: initialGeneratedCreateDraftSessionState({ defaults, fields: createFields }),
      }),
    });
    const session = selectGeneratedCreateDraftSession({
      defaults,
      enabled: true,
      fields: createFields,
      state: markGeneratedCreateDraftSessionSubmitted(state),
    });
    const projectedSession = projectGeneratedCreateSession({
      defaults,
      session,
      state,
    });
    const projected = projectGeneratedCreateFields({
      owner: { kind: "createSurface", surfaceId: "create-reference-test" },
      pendingByFieldName: { owner: true },
      pendingLabelByFieldName: { owner: "Loading people" },
      referenceOptionsByFieldName: {
        owner: [{ id: "principal-1", label: "Dana" }],
      },
      session,
      state,
    });

    expect(projectedSession).toMatchObject({
      canSubmit: false,
      defaults: [{ fieldName: "owner", value: { kind: "literal", value: "principal-1" } }],
      defaultsResolved: true,
      fieldErrors: {
        estimate: {
          draftValue: { kind: "input", value: "many" },
          fieldName: "estimate",
          message: "Enter a finite number.",
        },
      },
      values: {
        owner: "",
        status: "new",
        title: "Prepare launch",
      },
      visibleFieldNames: ["title", "estimate", "owner", "status"],
    });
    expect(projected).toMatchObject([
      {
        access: { kind: "editable" },
        commit: "submit",
        control: { controlKind: "text", label: "Title" },
        draftInput: { kind: "input", value: "Prepare launch" },
        fieldName: "title",
        mode: "editor",
        surface: "create",
        value: "Prepare launch",
      },
      {
        commit: "submit",
        draftInput: { kind: "input", value: "many" },
        errors: [{ fieldName: "estimate", message: "Enter a finite number." }],
        value: undefined,
      },
      {
        commit: "submit",
        options: {
          referenceOptions: [{ id: "principal-1", label: "Dana" }],
        },
        pending: { isPending: true, label: "Loading people" },
        reference: {
          clearable: true,
          kind: "editor",
          valueStatus: { kind: "unset" },
        },
        value: "",
      },
      {
        access: { kind: "stateMachine" },
        commit: "submit",
        draftInput: { kind: "value", value: "new" },
        labelVisibility: "visible",
        stateMachineFacts: {
          currentValue: "new",
          initialState: "new",
          interaction: { kind: "display" },
          terminal: false,
          valueStatus: { kind: "declared", value: "new" },
        },
        value: "new",
      },
    ]);
  });

  it("projects controlled create trigger, dialog, form, and pending control facts", () => {
    const createFields = [createField("title", fields.title, "text")];
    const state = nextGeneratedCreateDraftSessionState({
      fieldName: "title",
      fieldValue: { kind: "input", value: "Prepare launch" },
      state: initialGeneratedCreateDraftSessionState({ fields: createFields }),
    });
    const session = selectGeneratedCreateDraftSession({
      enabled: true,
      fields: createFields,
      state,
    });
    const surface = projectGeneratedCreateSurface({
      enabled: true,
      entityLabel: "Task",
      id: "task:create",
      isSubmitting: true,
      open: true,
      session,
      state,
      submitLabel: "Create Task",
      trigger: {
        content: { icon: "add", kind: "iconAndLabel", label: "Create Task" },
        density: "default",
        prominence: "primary",
      },
      triggerLabel: "Create Task",
    });

    expect(surface).toMatchObject({
      dialog: {
        form: {
          cancel: { content: { kind: "label", label: "Cancel" } },
          fieldSet: {
            disabled: true,
            fields: [{ fieldName: "title", value: "Prepare launch" }],
          },
          submit: {
            content: { kind: "label", label: "Saving..." },
            disabled: true,
            pending: { isPending: true, label: "Saving" },
            type: "submit",
          },
        },
        open: true,
        title: "Create Task",
      },
      id: "task:create",
      kind: "createSurface",
      trigger: {
        accessibilityLabel: "Create Task",
        content: { icon: "add", kind: "iconAndLabel", label: "Create Task" },
        disabled: false,
      },
    });
  });

  it("disables create opening when context defaults are unresolved", () => {
    const createFields = [createField("owner", fields.owner, "reference")];
    const defaults = [
      {
        fieldName: "owner",
        field: fields.owner,
        value: { kind: "context", name: "principal" },
      },
    ] satisfies CreateDefaultConfig[];
    const state = initialGeneratedCreateDraftSessionState({ defaults, fields: createFields });
    const session = selectGeneratedCreateDraftSession({
      defaults,
      enabled: true,
      fields: createFields,
      state,
    });
    const surface = projectGeneratedCreateSurface({
      defaults,
      enabled: true,
      entityLabel: "Task",
      id: "task:create:scoped",
      isSubmitting: false,
      open: false,
      session,
      state,
      submitLabel: "Create Task",
      trigger: {
        content: { icon: "add", kind: "iconOnly" },
        density: "compact",
        prominence: "quiet",
      },
      triggerLabel: "Create Task",
    });

    expect(surface.trigger).toMatchObject({
      disabled: true,
      disabledReason: "Create task requires a selected context.",
    });
    expect(surface.dialog.form.fieldSet).toMatchObject({
      disabled: true,
      disabledReason: "Create task requires a selected context.",
    });
  });

  it("projects required reference defaults from loaded options", () => {
    const requiredOwner = {
      ...fields.owner,
      required: true,
    } satisfies Extract<
      FieldSchema,
      {
        type: "reference";
      }
    >;
    const requiredField = createField("owner", requiredOwner, "reference");
    const requiredState = initialGeneratedCreateDraftSessionState({ fields: [requiredField] });
    const projectedDefault = projectGeneratedCreateField({
      fieldConfig: requiredField,
      occurrence: createOccurrence("owner", "required-with-options"),
      referenceOptions: [
        { id: "principal-1", label: "Dana" },
        { id: "principal-2", label: "Jordan" },
      ],
      state: requiredState,
    });
    const projectedWithoutOptions = projectGeneratedCreateField({
      fieldConfig: requiredField,
      occurrence: createOccurrence("owner", "required-without-options"),
      state: requiredState,
    });
    const optionalField = createField("owner", fields.owner, "reference");
    const optionalState = initialGeneratedCreateDraftSessionState({ fields: [optionalField] });
    const projectedOptional = projectGeneratedCreateField({
      fieldConfig: optionalField,
      occurrence: createOccurrence("owner", "optional"),
      referenceOptions: [{ id: "principal-1", label: "Dana" }],
      state: optionalState,
    });

    expect(projectedDefault).toMatchObject({
      draftInput: { kind: "input", value: "principal-1" },
      reference: {
        clearable: false,
        kind: "editor",
        valueStatus: { kind: "resolved", value: "principal-1" },
      },
      value: "principal-1",
    });
    expect(projectedWithoutOptions).toMatchObject({
      draftInput: undefined,
      reference: {
        clearable: false,
        kind: "editor",
        valueStatus: { kind: "unset" },
      },
      value: undefined,
    });
    expect(projectedOptional).toMatchObject({
      draftInput: { kind: "value", value: "" },
      reference: {
        clearable: true,
        kind: "editor",
        valueStatus: { kind: "unset" },
      },
      value: "",
    });
  });

  it("projects update fields without flattening draft, renderer, option, media, or access facts", () => {
    const recordFields = [
      recordField("title", fields.title, "text"),
      recordField("cost", fields.cost, "number", {
        format: "currency",
        valueUnit: {
          unitFieldName: "costUnit",
          unitField: fields.costUnit,
        },
      }),
      recordField("owner", fields.owner, "reference", { commit: "immediate" }),
      recordField("hero", fields.image, "media"),
      recordField("priority", fields.priority, "enum", { commit: "immediate" }),
      {
        ...recordField("status", fields.status, "enum", { commit: "immediate" }),
        stateMachine,
      },
      recordField("updatedAt", fields.systemText, "text", {
        fieldRef: { kind: "system", name: "updatedAt" },
        writable: false,
      }),
      recordField("summary", fields.systemText, "text", { writable: false }),
    ];
    const draftValues: Array<[string, GeneratedFieldDraftInput]> = [
      ["title", { kind: "input", value: "Edited title" }],
      ["cost", { kind: "value", value: 13 }],
      ["priority", { kind: "input", value: "urgent" }],
    ];
    const state = draftValues.reduce(
      (nextState, [fieldName, fieldValue]) =>
        nextGeneratedUpdateDraftSessionState({
          fieldName: String(fieldName),
          fieldValue,
          state: nextState,
        }),
      initialGeneratedUpdateDraftSessionState({
        baselineValues: recordValues,
        fields: recordFields,
      }),
    );
    const session = selectGeneratedUpdateDraftSession({ fields: recordFields, state });
    const projectedSession = projectGeneratedRecordSession({ session, state });
    const projected = projectGeneratedRecordFields({
      canPatch: true,
      density: "compact",
      entityName: "task",
      editorDraftByFieldName: { cost: "$13." },
      errorsByFieldName: { title: "Save failed." },
      mediaAssetOptionsByFieldName: {
        hero: [
          { height: 360, href: "/media/hero.webp", id: "hero.webp", label: "Hero", width: 640 },
        ],
      },
      owner: { kind: "tableCell", tableId: "projection-test", cellId: "task-1" },
      pendingByFieldName: { hero: true },
      pendingLabelByFieldName: { hero: "Uploading" },
      recordId: "task-1",
      referenceOptionsByFieldName: { owner: [] },
      schema: blockSchema,
      session,
      state,
      surface: "table-cell",
      transitionOperationsByFieldName: { status: transitionOperations },
      unitDraftInputByFieldName: { cost: { kind: "input", value: "hour" } },
    });
    const byName = Object.fromEntries(projected.map((field) => [field.fieldName, field]));
    const title = asRecordField(byName.title);
    const cost = asRecordField(byName.cost);
    const owner = asRecordField(byName.owner);
    const hero = asRecordField(byName.hero);
    const priority = asRecordField(byName.priority);
    const status = asDisplayField(byName.status);
    const updatedAt = asDisplayField(byName.updatedAt);
    const summary = asDisplayField(byName.summary);

    expect(projectedSession).toMatchObject({
      values: {
        cost: 13,
        priority: "urgent",
        title: "Edited title",
      },
      visibleFieldNames: [
        "title",
        "cost",
        "owner",
        "hero",
        "priority",
        "status",
        "updatedAt",
        "summary",
      ],
    });
    expect(title).toMatchObject({
      access: { kind: "editable", canPatch: true },
      commit: "field-commit",
      control: { controlKind: "text" },
      density: "compact",
      drafts: {
        draft: "Edited title",
        draftInput: { kind: "input", value: "Edited title" },
        recordValue: "Committed title",
      },
      errors: [{ fieldName: "title", message: "Save failed." }],
      formatting: { displayValue: "Committed title" },
      mode: "editor",
      rendererKind: "text",
      surface: "table-cell",
      value: "Committed title",
    });
    expect(cost).toMatchObject({
      control: { controlKind: "number" },
      drafts: {
        draft: "$13.",
        draftInput: { kind: "value", value: 13 },
        recordValue: 12.5,
        unitDraft: "hour",
        unitDraftInput: { kind: "input", value: "hour" },
        unitRecordValue: "day",
      },
      rendererKind: "value-unit",
      valueUnit: {
        clearable: true,
        options: [
          { label: "Day", status: "declared", value: "day" },
          { label: "Hour", status: "declared", value: "hour" },
        ],
        required: false,
        unitFieldName: "costUnit",
      },
    });
    expect(selectValueUnitCommit(cost)).toEqual({
      fieldDraftInput: { kind: "value", value: 13 },
      unitDraftInput: { kind: "input", value: "hour" },
    });
    expect(owner).toMatchObject({
      commit: "immediate",
      options: {
        referenceOptions: [],
      },
      reference: {
        clearable: true,
        kind: "editor",
        valueStatus: { kind: "missing", value: "missing-owner" },
      },
      rendererKind: "reference",
    });
    expect(hero).toMatchObject({
      media: {
        accept: "image/jpeg,image/png,image/webp,image/gif",
        fileSelectEnabled: true,
        maxSize: 5 * 1024 * 1024,
        previewHref: "/media/hero.webp",
        selectedAssetId: "hero.webp",
        mediaPreviewHref: "/media/hero.webp",
        uploadEnabled: true,
        uploadPatchFields: {
          heightFieldName: "height",
          mediaAssetFieldName: "hero",
          widthFieldName: "width",
        },
      },
      options: {
        mediaAssetOptions: [
          { height: 360, href: "/media/hero.webp", id: "hero.webp", label: "Hero", width: 640 },
        ],
      },
      pending: { isPending: true, label: "Uploading" },
      rendererKind: "media",
    });
    expect(priority).toMatchObject({
      enum: {
        clearable: true,
        kind: "editor",
        listContent: "label",
        style: "plain",
        triggerContent: "label",
        valueStatus: { kind: "undeclared", value: "urgent" },
      },
      options: {
        enumOptions: [
          {
            label: "High",
            presentation: {
              color: { intent: "danger", known: true, token: "priority.high" },
              icon: { kind: "svg" },
              iconKnown: true,
              iconToken: "priority-marker",
            },
            status: "declared",
            value: "high",
          },
          {
            label: "Low",
            presentation: {
              color: { intent: "success", known: true, token: "priority.low" },
            },
            status: "declared",
            value: "low",
          },
        ],
      },
    });
    expect(status).toMatchObject({
      access: { kind: "stateMachine" },
      density: "compact",
      formatting: {
        displayValue: "Archived",
        enumValuePresentation: { label: "Archived" },
      },
      mode: "display",
      labelVisibility: "hidden",
      stateMachineFacts: {
        currentValue: "archived",
        interaction: {
          invocationSource: "menuItem",
          kind: "transitions",
          transitions: [
            { availability: { valid: false, disabledReason: "Requires New." } },
            { availability: { valid: false, disabledReason: "Requires New." } },
          ],
        },
        terminal: true,
        valueStatus: { kind: "declared", value: "archived" },
      },
      value: "archived",
    });
    expect(updatedAt).toMatchObject({
      access: { kind: "system", fieldRef: { kind: "system", name: "updatedAt" } },
      density: "compact",
      mode: "display",
      value: "2026-07-09T00:00:00.000Z",
    });
    expect(summary).toMatchObject({
      access: { kind: "readOnly" },
      density: "compact",
      formatting: { displayValue: "Locked" },
      mode: "display",
      value: "Locked",
    });
  });

  it("keeps invalid record drafts separate from committed heading display facts", () => {
    const field = asRecordField(
      projectGeneratedRecordField({
        canPatch: false,
        density: "compact",
        disabledReason: "Finish syncing before editing.",
        draftInput: { kind: "input", value: "many" },
        editorDraft: "many",
        error: {
          draftValue: { kind: "input", value: "many" },
          fieldName: "estimate",
          message: "Enter a finite number.",
        },
        fieldConfig: recordField("estimate", fields.estimate, "number"),
        occurrence: recordOccurrence("estimate", "invalid-heading"),
        presentation: "heading",
        recordId: "task-1",
        recordValue: 2,
        showLabel: true,
        surface: "detail",
      }),
    );

    expect(field).toMatchObject({
      access: {
        canPatch: false,
        disabledReason: "Finish syncing before editing.",
        kind: "disabled",
        writable: true,
      },
      commit: "field-commit",
      density: "compact",
      drafts: {
        draft: "many",
        draftInput: { kind: "input", value: "many" },
        recordValue: 2,
      },
      errors: [{ fieldName: "estimate", message: "Enter a finite number." }],
      formatting: { displayValue: "2" },
      labelVisibility: "visible",
      presentationMode: "heading",
      recordId: "task-1",
      value: 2,
    });
  });

  it("projects source-backed icon picker options and dialog state", () => {
    const addIconSource = requiredIconSource("add");
    const customIconSource = '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z" /></svg>';
    const catalogField = asRecordField(
      projectGeneratedRecordField({
        canPatch: true,
        fieldConfig: recordField("icon", fields.icon, "icon", { commit: "immediate" }),
        iconDialogDraft: addIconSource,
        iconDialogOpen: true,
        occurrence: recordOccurrence("icon", "catalog"),
        recordValue: customIconSource,
      }),
    );
    const customField = asRecordField(
      projectGeneratedRecordField({
        canPatch: true,
        fieldConfig: recordField("icon", fields.icon, "icon", { commit: "immediate" }),
        iconDialogDraft: customIconSource,
        iconDialogOpen: true,
        iconParseError: "Enter valid SVG.",
        occurrence: recordOccurrence("icon", "custom"),
        recordValue: addIconSource,
      }),
    );
    const createIconField = projectGeneratedCreateField({
      fieldConfig: createField("icon", fields.icon, "icon"),
      iconDialogDraft: addIconSource,
      iconDialogOpen: true,
      occurrence: createOccurrence("icon", "icon-picker"),
      value: customIconSource,
    });

    expect(catalogField.options?.iconOptions?.find((option) => option.id === "add")).toEqual({
      group: "ui",
      id: "add",
      label: "Add",
      source: addIconSource,
    });
    expect(catalogField.icon).toMatchObject({
      dialogDraft: addIconSource,
      dialogOpen: true,
      emptyValue: false,
      previewSource: addIconSource,
      selection: { kind: "option", optionId: "add", source: addIconSource },
      valueMode: "svgSource",
    });
    expect(customField.icon).toMatchObject({
      canCancel: true,
      canSave: false,
      customParseError: "Enter valid SVG.",
      dialogDraft: customIconSource,
      dialogOpen: true,
      emptyValue: false,
      previewSource: addIconSource,
      selection: { kind: "customSource", source: customIconSource },
      valueMode: "svgSource",
    });
    expect(createIconField.icon).toMatchObject({
      canCancel: true,
      canSave: true,
      dialogDraft: addIconSource,
      dialogOpen: true,
      previewSource: addIconSource,
      selection: { kind: "option", optionId: "add", source: addIconSource },
      valueMode: "svgSource",
    });
  });

  it("projects media assets as thumbnail presentation facts for create and display", () => {
    const mediaAssetOptions = [
      { height: 360, href: "/media/hero.webp", id: "hero.webp", label: "Hero", width: 640 },
    ];
    const createMediaField = projectGeneratedCreateField({
      fieldConfig: createField("hero", fields.image, "media"),
      mediaAssetOptions,
      occurrence: createOccurrence("hero", "media"),
      value: "hero.webp",
    });
    const displayMediaField = projectGeneratedDisplayField({
      fieldConfig: recordField("hero", fields.image, "media"),
      mediaAssetOptions,
      occurrence: recordOccurrence("hero", "media-display"),
      recordValue: "hero.webp",
    });

    expect(createMediaField).toMatchObject({
      control: { controlKind: "media" },
      media: {
        fileSelectEnabled: true,
        previewHref: "/media/hero.webp",
        selectedAssetId: "hero.webp",
        uploadEnabled: true,
      },
      options: { mediaAssetOptions },
    });
    expect(displayMediaField).toMatchObject({
      control: { controlKind: "media" },
      media: {
        previewHref: "/media/hero.webp",
        selectedAssetId: "hero.webp",
      },
      options: { mediaAssetOptions },
    });
  });

  it("projects missing media asset picker facts without changing stored asset ids", () => {
    const missingMediaField = asRecordField(
      projectGeneratedRecordField({
        canPatch: true,
        entityName: "task",
        fieldConfig: recordField("hero", fields.image, "media"),
        mediaAssetOptions: [],
        occurrence: recordOccurrence("hero", "missing-media"),
        recordValue: "not/a-core-asset",
        schema: blockSchema,
      }),
    );

    expect(missingMediaField.media).toMatchObject({
      fileSelectEnabled: true,
      missingSelectedAsset: {
        assetId: "not/a-core-asset",
        reason: "Selected media asset is unavailable.",
      },
      selectedAssetId: "not/a-core-asset",
      uploadEnabled: true,
    });
    expect(missingMediaField.drafts.recordValue).toBe("not/a-core-asset");
  });

  it("projects display fields with formatted values, suffixes, references, and badges", () => {
    const referenceDisplay = projectGeneratedDisplayField({
      fieldConfig: {
        ...recordField("owner", fields.owner, "reference"),
        suffix: "assigned",
      },
      occurrence: recordOccurrence("owner", "reference"),
      recordValue: "principal-1",
      referenceOptions: [{ id: "principal-1", label: "Dana" }],
    });
    const missingReferenceDisplay = projectGeneratedDisplayField({
      fieldConfig: recordField("owner", fields.owner, "reference"),
      occurrence: recordOccurrence("owner", "missing-reference"),
      recordValue: "principal-missing",
      referenceOptions: [{ id: "principal-1", label: "Dana" }],
    });
    const stateDisplay = projectGeneratedDisplayField({
      fieldConfig: {
        ...recordField("status", fields.status, "enum"),
        stateMachine,
        suffix: "current",
      },
      occurrence: recordOccurrence("status", "state-empty"),
      recordValue: "",
      transitionOperations,
    });
    const unknownStateDisplay = projectGeneratedDisplayField({
      fieldConfig: {
        ...recordField("status", fields.status, "enum"),
        stateMachine,
      },
      occurrence: recordOccurrence("status", "state-unknown"),
      recordValue: "paused",
      transitionOperations,
    });
    const recordStateDisplay = projectGeneratedDisplayField({
      fieldConfig: {
        ...recordField("status", fields.status, "enum"),
        stateMachine,
      },
      occurrence: recordOccurrence("status", "state-record"),
      recordValue: "new",
      showLabel: false,
      surface: "record",
      transitionOperations,
    });
    const tableStateDisplay = projectGeneratedDisplayField({
      density: "compact",
      fieldConfig: {
        ...recordField("status", fields.status, "enum"),
        stateMachine,
      },
      occurrence: recordOccurrence("status", "state-table"),
      recordValue: "new",
      surface: "table-cell",
      transitionOperations,
    });
    const dateDisplay = projectGeneratedDisplayField({
      fieldConfig: recordField("dueDate", fields.dueDate, "date"),
      occurrence: recordOccurrence("dueDate", "date"),
      recordValue: "2026-07-08",
      surface: "detail",
    });
    const timestampDisplay = projectGeneratedDisplayField({
      fieldConfig: recordField("updatedAt", fields.systemText, "text", {
        fieldRef: { kind: "system", name: "updatedAt" },
        writable: false,
      }),
      occurrence: recordOccurrence("updatedAt", "timestamp"),
      recordValue: "2026-07-09T00:00:00.000Z",
      surface: "detail",
    });

    expect(referenceDisplay).toMatchObject({
      formatting: { displayValue: "Dana", suffix: "assigned" },
      options: {
        referenceOptions: [{ id: "principal-1", label: "Dana" }],
      },
      reference: {
        kind: "display",
        valueStatus: { kind: "resolved", value: "principal-1" },
      },
    });
    expect(missingReferenceDisplay).toMatchObject({
      formatting: { displayValue: "principal-missing" },
      options: {
        referenceOptions: [{ id: "principal-1", label: "Dana" }],
      },
      reference: {
        kind: "display",
        valueStatus: { kind: "missing", value: "principal-missing" },
      },
    });
    expect(dateDisplay.formatting.temporal).toEqual({
      kind: "date",
      value: "2026-07-08",
    });
    expect(timestampDisplay.formatting.temporal).toEqual({
      kind: "dateTime",
      value: "2026-07-09T00:00:00.000Z",
    });
    expect(stateDisplay).toMatchObject({
      density: "default",
      formatting: { displayValue: "Unset", suffix: "current" },
      labelVisibility: "visible",
      stateMachineFacts: {
        currentValue: "",
        interaction: {
          invocationSource: "menuItem",
          kind: "transitions",
          transitions: [
            { availability: { valid: false, disabledReason: "Requires New." } },
            { availability: { valid: false, disabledReason: "Requires New." } },
          ],
        },
        terminal: false,
        valueStatus: { kind: "unset", message: "Current state is missing." },
      },
    });
    expect(unknownStateDisplay).toMatchObject({
      stateMachineFacts: {
        currentValue: "paused",
        valueStatus: {
          kind: "undeclared",
          message: 'Current state "paused" is not declared.',
          value: "paused",
        },
      },
    });
    expect(recordStateDisplay).toMatchObject({
      density: "default",
      labelVisibility: "hidden",
      stateMachineFacts: {
        interaction: {
          invocationSource: "menuItem",
          kind: "transitions",
          transitions: [{ availability: { valid: true } }, { availability: { valid: true } }],
        },
      },
      surface: "record",
    });
    expect(tableStateDisplay).toMatchObject({
      density: "compact",
      labelVisibility: "hidden",
      stateMachineFacts: {
        interaction: {
          invocationSource: "menuItem",
          kind: "transitions",
          transitions: [{ availability: { valid: true } }, { availability: { valid: true } }],
        },
      },
      surface: "table-cell",
    });
  });

  it("projects explicit enum presentation, label visibility, and undeclared value facts", () => {
    const field = {
      type: "enum",
      required: true,
      label: "Status",
      values: [
        {
          key: "fallback",
          label: "Legacy fallback",
          presentation: { color: "priority.unknown", icon: "missing-icon" },
        },
        {
          key: "open",
          label: "Open",
          presentation: { color: "priority.normal", icon: "priority-marker" },
        },
      ],
    } satisfies Extract<
      FieldSchema,
      {
        type: "enum";
      }
    >;
    const fieldConfig = {
      ...recordField("status", field, "enum", { commit: "immediate" }),
      presentation: { mode: "iconOnly", trigger: "label", list: "icon" } as const,
    };
    const editor = projectGeneratedRecordField({
      canPatch: true,
      draftInput: { kind: "input", value: "paused" },
      fieldConfig,
      occurrence: recordOccurrence("status", "enum-editor"),
      recordValue: "paused",
      showLabel: false,
      surface: "record",
    });
    const iconTriggerEditor = projectGeneratedRecordField({
      canPatch: true,
      fieldConfig: {
        ...fieldConfig,
        presentation: { mode: "iconOnly", trigger: "icon", list: "both" },
      },
      occurrence: recordOccurrence("status", "enum-icon-trigger"),
      recordValue: "open",
      surface: "record",
    });
    const display = projectGeneratedDisplayField({
      fieldConfig,
      occurrence: recordOccurrence("status", "enum-display"),
      recordValue: "fallback",
      showLabel: true,
      surface: "detail",
    });

    expect(editor).toMatchObject({
      enum: {
        clearable: false,
        kind: "editor",
        listContent: "icon",
        style: "rich",
        triggerContent: "label",
        valueStatus: { kind: "undeclared", value: "paused" },
      },
      labelVisibility: "hidden",
      options: {
        enumOptions: [
          {
            presentation: {
              color: { intent: "neutral", known: false, token: "priority.unknown" },
              iconKnown: false,
              iconToken: "missing-icon",
            },
            status: "declared",
            value: "fallback",
          },
          {
            presentation: {
              color: { intent: "warning", known: true, token: "priority.normal" },
              iconKnown: true,
              iconToken: "priority-marker",
            },
            status: "declared",
            value: "open",
          },
        ],
      },
      rendererKind: "enum-icon",
    });
    expect(iconTriggerEditor).toMatchObject({
      enum: {
        listContent: "both",
        style: "rich",
        triggerContent: "both",
      },
    });
    expect(display).toMatchObject({
      enum: {
        content: "icon",
        kind: "display",
        valueStatus: { kind: "declared", value: "fallback" },
      },
      labelVisibility: "visible",
    });
  });

  it("projects operation sessions and public input fields into submit-bound operation fields", () => {
    const operationFields = [
      operationInputField("contactEmail", "Email", "text", true, { format: "email" }),
      operationInputField("message", "Message", "longText", false),
      operationInputField("acceptedTerms", "Accepted terms", "boolean", true),
      operationInputField("teamSize", "Team size", "number", false),
      operationInputField("topic", "Topic", "enum", true, {
        options: [
          { label: "Sales", value: "sales" },
          { label: "Support", value: "support" },
        ],
      }),
    ];
    const draftValues: Array<[string, GeneratedFieldDraftInput]> = [
      ["contactEmail", { kind: "input", value: "ada@example.com" }],
      ["message", { kind: "input", value: "Hello" }],
      ["acceptedTerms", generatedFieldDraftInput(false)],
      ["teamSize", { kind: "input", value: "many" }],
      ["topic", { kind: "input", value: "sales" }],
    ];
    const state = draftValues.reduce(
      (nextState, [inputName, inputValue]) =>
        nextGeneratedOperationDraftSessionState({
          inputName: String(inputName),
          inputValue,
          state: nextState,
        }),
      initialGeneratedOperationDraftSessionState({ fields: operationFields }),
    );
    const session = selectGeneratedOperationDraftSession({
      fields: operationFields,
      state,
      unsupportedRequiredInputNames: ["attachment"],
    });
    const projectedSession = projectGeneratedOperationSession({ session, state });
    const projected = projectGeneratedOperationFields({
      owner: { formId: "public-operation-test", kind: "operationForm" },
      pendingByFieldName: { contactEmail: true },
      pendingLabelByFieldName: { contactEmail: "Submitting" },
      session,
      state,
    });

    expect(projectedSession).toMatchObject({
      canSubmit: false,
      configurationErrors: [
        {
          inputName: "attachment",
          message:
            'Public operation input field "attachment" is required but is not supported by generated public forms.',
        },
      ],
      fieldErrors: {
        teamSize: {
          draftValue: { kind: "input", value: "many" },
          fieldName: "teamSize",
          message: "Enter a finite number.",
        },
      },
      values: {
        acceptedTerms: false,
        contactEmail: "ada@example.com",
        message: "Hello",
        topic: "sales",
      },
      visibleFieldNames: ["contactEmail", "message", "acceptedTerms", "teamSize", "topic"],
    });
    expect(projected).toMatchObject([
      {
        access: { kind: "editable" },
        commit: "submit",
        control: { controlKind: "text", label: "Email" },
        draftInput: { kind: "input", value: "ada@example.com" },
        input: { format: "email" },
        inputName: "contactEmail",
        mode: "editor",
        pending: { isPending: true, label: "Submitting" },
        surface: "operation",
        value: "ada@example.com",
      },
      {
        commit: "submit",
        control: { controlKind: "textarea" },
        draftInput: { kind: "input", value: "Hello" },
      },
      {
        control: { controlKind: "checkbox" },
        draftInput: { kind: "value", value: false },
        value: false,
      },
      {
        control: { controlKind: "number" },
        draftInput: { kind: "input", value: "many" },
        errors: [{ fieldName: "teamSize", message: "Enter a finite number." }],
        value: undefined,
      },
      {
        control: { controlKind: "select" },
        enum: {
          clearable: true,
          kind: "editor",
          placeholder: "Select",
          style: "plain",
          valueStatus: { kind: "declared", value: "sales" },
        },
        options: {
          enumOptions: [
            { label: "Sales", status: "declared", value: "sales" },
            { label: "Support", status: "declared", value: "support" },
          ],
        },
        value: "sales",
      },
    ]);
    expect(projected.map((field) => field.fieldId)).toEqual([
      "field:operationForm:public-operation-test:contactEmail",
      "field:operationForm:public-operation-test:message",
      "field:operationForm:public-operation-test:acceptedTerms",
      "field:operationForm:public-operation-test:teamSize",
      "field:operationForm:public-operation-test:topic",
    ]);
    expect(
      projectGeneratedOperationFields({
        owner: { formId: "public-operation-test", kind: "operationForm" },
        session,
        state,
      }).map((field) => field.fieldId),
    ).toEqual(projected.map((field) => field.fieldId));
    expect(
      projectGeneratedOperationFields({
        owner: { formId: "public-operation-other-block", kind: "operationForm" },
        session,
        state,
      }).map((field) => field.fieldId),
    ).not.toEqual(projected.map((field) => field.fieldId));

    const undeclaredTopicState = nextGeneratedOperationDraftSessionState({
      inputName: "topic",
      inputValue: { kind: "input", value: "enterprise" },
      state: initialGeneratedOperationDraftSessionState({ fields: operationFields }),
    });
    const undeclaredTopicSession = selectGeneratedOperationDraftSession({
      fields: operationFields,
      state: undeclaredTopicState,
    });
    const undeclaredTopic = projectGeneratedOperationFields({
      owner: { formId: "public-operation-undeclared-test", kind: "operationForm" },
      session: undeclaredTopicSession,
      state: undeclaredTopicState,
    }).find((field) => field.inputName === "topic");

    expect(undeclaredTopic).toMatchObject({
      enum: {
        clearable: true,
        valueStatus: { kind: "undeclared", value: "enterprise" },
      },
      errors: [{ message: 'Field "topic" must be a known enum value.' }],
      options: {
        enumOptions: [
          { label: "Sales", status: "declared", value: "sales" },
          { label: "Support", status: "declared", value: "support" },
        ],
      },
    });
  });
});

function asRecordField(field: unknown): RecordFieldContract {
  if (field === undefined || (field as RecordFieldContract).mode !== "editor") {
    throw new Error("Expected record editor field.");
  }

  return field as RecordFieldContract;
}

function asDisplayField(field: unknown): DisplayFieldContract {
  if (field === undefined || (field as DisplayFieldContract).mode !== "display") {
    throw new Error("Expected display field.");
  }

  return field as DisplayFieldContract;
}

function createField(
  fieldName: string,
  field: FieldSchema,
  editor: CreateFieldConfig["editor"],
): CreateFieldConfig {
  return {
    editor,
    field,
    fieldName,
  };
}

function recordField(
  fieldName: string,
  field: FieldSchema,
  editor: RecordFieldConfig["editor"],
  options: {
    commit?: RecordFieldConfig["commit"];
    fieldRef?: RecordFieldConfig["fieldRef"];
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
    ...(options.fieldRef === undefined ? {} : { fieldRef: options.fieldRef }),
    ...(options.format === undefined ? {} : { format: options.format }),
    ...(options.valueUnit === undefined ? {} : { valueUnit: options.valueUnit }),
    ...(options.writable === undefined ? {} : { writable: options.writable }),
  };
}

function operationInputField(
  name: string,
  label: string,
  control: PublicSafeOperationInputField["control"],
  required: boolean,
  options: Partial<PublicSafeOperationInputField> = {},
): PublicSafeOperationInputField {
  return {
    control,
    label,
    name,
    required,
    ...options,
  } as PublicSafeOperationInputField;
}

function transitionOperation(
  operationName: string,
  label: string,
  transitionName: string,
  transition: StateMachineTransitionSchema,
): TransitionStateOperationConfig {
  const operation = {
    audit: { input: "none" },
    effect: {
      type: "operationHandler",
      handler: "transition-state",
      config: { machine: stateMachine.machineName, transition: transitionName },
    },
    idempotency: { required: true },
    kind: "command",
    output: { type: "command" },
    scope: "record",
  } satisfies EntityOperationSchema;

  return {
    field: fields.status,
    fieldName: "status",
    label,
    machine: stateMachine.machine,
    machineName: stateMachine.machineName,
    operation: {
      canonicalKey: `task.${operationName}`,
      entityName: "task",
      label,
      operation,
      operationName,
    } satisfies EntityOperationPresentationConfig,
    operationName,
    transition,
    transitionName,
  };
}

const fields = {
  cost: { type: "number", required: false },
  costUnit: {
    type: "enum",
    required: false,
    values: [
      { key: "day", label: "Day" },
      { key: "hour", label: "Hour" },
    ],
  },
  dueDate: { type: "date", required: false },
  estimate: { type: "number", required: false },
  image: { type: "text", required: false, format: "href" },
  icon: { type: "text", required: false, format: "icon" },
  owner: { type: "reference", required: false, to: "auth:principal", displayField: "name" },
  priority: {
    type: "enum",
    required: false,
    values: [
      {
        key: "high",
        label: "High",
        presentation: { color: "priority.high", icon: "priority-marker" },
      },
      { key: "low", label: "Low", presentation: { color: "priority.low" } },
    ],
  },
  status: {
    type: "enum",
    required: true,
    values: [
      { key: "archived", label: "Archived", presentation: { color: "success", icon: "confirm" } },
      { key: "new", label: "New", presentation: { color: "warning" } },
    ],
  },
  systemText: { type: "text", required: false },
  title: { type: "text", required: true, label: "Title" },
} satisfies Record<string, FieldSchema>;

const stateMachine = {
  fieldName: "status",
  initialState: "new",
  machine: {
    field: "status",
    initial: "new",
    terminal: ["archived"],
    transitions: [
      { key: "archive", label: "Archive", from: ["new"], to: "archived" },
      { key: "reopen", label: "Reopen", from: ["new"], to: "new" },
    ],
  },
  machineName: "statusFlow",
  terminalStates: ["archived"],
} satisfies NonNullable<RecordFieldConfig["stateMachine"]>;

const transitionOperations = [
  transitionOperation(
    "archiveTask",
    "Archive",
    "archive",
    stateMachine.machine.transitions.find((definition) => definition.key === "archive")!,
  ),
  transitionOperation(
    "reopenTask",
    "Reopen",
    "reopen",
    stateMachine.machine.transitions.find((definition) => definition.key === "reopen")!,
  ),
];
const recordValues = {
  cost: 12.5,
  costUnit: "day",
  hero: "hero.webp",
  owner: "missing-owner",
  priority: "normal",
  status: "archived",
  summary: "Locked",
  title: "Committed title",
  updatedAt: "2026-07-09T00:00:00.000Z",
};
const blockSchema = {
  version: 1,
  entities: [
    {
      id: "entity_7725df8a-c3e9-4ce4-9b02-6112a171a218",
      key: "task",
      fields: [
        { key: "height", type: "number", required: false },
        {
          key: "hero",
          ...fields.image,
        },
        { key: "width", type: "number", required: false },
      ],
    },
  ],
  itemViews: [],
  queries: [],
  tableViews: [],
  views: [],
} as unknown as AppSchema;
function requiredIconSource(key: string): string {
  const source = resolveIconCatalogSvg(key);
  if (source === undefined) {
    throw new Error(`Missing test icon ${key}.`);
  }

  return source;
}
