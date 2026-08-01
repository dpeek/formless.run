import { describe, expect, it } from "vite-plus/test";
import type { RecordFieldConfig, RecordUnionPresentationConfig } from "../../client/views.ts";
import type { AppSchema, FieldSchema } from "@dpeek/formless-schema";
import {
  fieldValueToRecordFieldEditorInputValue,
  generatedRecordFieldUsesUpdateDraftResolver,
  initialGeneratedUpdateDraftSessionState,
  imageMediaAssetOptionFromUpload,
  nextGeneratedUpdateDraftSessionState,
  resolveGeneratedMediaUploadUpdateDraftPatchValues,
  resolveGeneratedUpdateDraftPatchValues,
  resolveGeneratedValueUnitUpdateDraftPatchValues,
  selectGeneratedUpdateDraftSession,
  selectGeneratedIconDialogDraft,
  selectGeneratedRecordFieldDraftValues,
  selectGeneratedRecordFieldEditability,
  selectGeneratedRecordFieldMediaAuthoring,
  selectGeneratedRecordFieldPatchValues,
  upsertMediaAssetOption,
} from "./record-field-authoring.ts";

describe("generated record field authoring", () => {
  it("selects inline draft values from record fields and value/unit companion fields", () => {
    expect(
      selectGeneratedRecordFieldDraftValues({
        fieldConfig: costFieldConfig,
        numberFormat: "currency",
        recordValue: 12.5,
        unitRecordValue: "hour",
      }),
    ).toEqual({
      draft: "$12.50",
      unitDraft: "hour",
    });
    expect(fieldValueToRecordFieldEditorInputValue(numberField, 0.25, "percent")).toBe("25%");
    expect(fieldValueToRecordFieldEditorInputValue(textField, undefined, "plain")).toBe("");
  });

  it("diffs commit patch values without writing unchanged or blank absent values", () => {
    expect(
      selectGeneratedRecordFieldPatchValues({
        currentValues: {
          done: true,
          title: "Existing",
        },
        values: {
          done: false,
          missingText: "",
          title: "Existing",
        },
      }),
    ).toEqual({
      done: false,
    });
  });

  it("resolves update draft patches through visibility and protected field filters", () => {
    const resolution = resolveGeneratedUpdateDraftPatchValues({
      baselineValues: {
        createdAt: "2026-07-01T00:00:00.000Z",
        done: true,
        dueDate: "2026-07-10",
        estimate: 2,
        href: "https://old.example",
        linkTargetBlock: "block-old",
        linkTargetMode: "external",
        owner: "principal-1",
        readOnlySummary: "Locked",
        status: "todo",
        title: "Existing",
      },
      draft: {
        values: {
          createdAt: { kind: "input", value: "2026-08-01T00:00:00.000Z" },
          done: { kind: "value", value: false },
          dueDate: { kind: "input", value: "2026-07-11" },
          estimate: { kind: "input", value: "many" },
          href: { kind: "input", value: "https://hidden.example" },
          linkTargetBlock: { kind: "value", value: "block-new" },
          linkTargetMode: { kind: "input", value: "internal" },
          owner: { kind: "value", value: "principal-2" },
          readOnlySummary: { kind: "input", value: "Edited" },
          status: { kind: "input", value: "done" },
          title: { kind: "input", value: "Existing" },
        },
      },
      fields: updatePatchFields,
    });

    expect(resolution.visibleFields).toEqual([
      "linkTargetMode",
      "title",
      "done",
      "estimate",
      "dueDate",
      "owner",
      "linkTargetBlock",
      "createdAt",
      "readOnlySummary",
      "status",
    ]);
    expect(resolution.patchValues).toEqual({
      done: false,
      dueDate: "2026-07-11",
      linkTargetBlock: "block-new",
      linkTargetMode: "internal",
      owner: "principal-2",
    });
    expect(resolution.fieldErrors).toEqual({
      estimate: {
        fieldName: "estimate",
        message: "Enter a finite number.",
        draftValue: { kind: "input", value: "many" },
      },
    });
  });

  it("keeps hidden update drafts in the local session until visible again", () => {
    const initial = initialGeneratedUpdateDraftSessionState({
      baselineValues: {
        href: "https://old.example",
        linkTargetBlock: "block-old",
        linkTargetMode: "external",
      },
      fields: updatePatchFields,
    });
    const withHiddenHrefDraft = nextGeneratedUpdateDraftSessionState({
      fieldName: "href",
      fieldValue: { kind: "input", value: "https://draft.example" },
      state: initial,
    });
    const hidden = nextGeneratedUpdateDraftSessionState({
      fieldName: "linkTargetMode",
      fieldValue: { kind: "input", value: "internal" },
      state: withHiddenHrefDraft,
    });
    const hiddenFacts = selectGeneratedUpdateDraftSession({
      fields: updatePatchFields,
      state: hidden,
    });

    expect(hidden.draft.values.href).toEqual({
      kind: "input",
      value: "https://draft.example",
    });
    expect(hiddenFacts.visibleFields.map((field) => field.fieldName)).toContain("linkTargetBlock");
    expect(hiddenFacts.visibleFields.map((field) => field.fieldName)).not.toContain("href");
    expect(hiddenFacts.patchValues).toEqual({
      linkTargetMode: "internal",
    });

    const revealed = nextGeneratedUpdateDraftSessionState({
      fieldName: "linkTargetMode",
      fieldValue: { kind: "input", value: "external" },
      state: hidden,
    });
    const revealedFacts = selectGeneratedUpdateDraftSession({
      fields: updatePatchFields,
      state: revealed,
    });

    expect(revealedFacts.visibleFields.map((field) => field.fieldName)).toContain("href");
    expect(revealedFacts.patchValues).toEqual({
      href: "https://draft.example",
    });
  });

  it("selects active union variant fields from update drafts", () => {
    const resolution = resolveGeneratedUpdateDraftPatchValues({
      baselineValues: {
        body: "Old body",
        kind: "article",
        title: "Existing",
      },
      draft: {
        values: {
          body: { kind: "input", value: "Hidden body draft" },
          kind: { kind: "input", value: "link" },
          title: { kind: "input", value: "Existing" },
          url: { kind: "input", value: "https://example.com" },
        },
      },
      fields: unionBaseFields,
      union: updateUnion,
    });

    expect(resolution.visibleFields).toEqual(["kind", "title", "url"]);
    expect(resolution.patchValues).toEqual({
      kind: "link",
      url: "https://example.com",
    });
  });

  it("keeps icon dialog draft transitions explicit", () => {
    expect(
      selectGeneratedIconDialogDraft({
        draft: "<svg />",
        open: true,
        recordDraft: "",
      }),
    ).toBe("<svg />");
    expect(
      selectGeneratedIconDialogDraft({
        draft: "<svg />",
        open: false,
        recordDraft: "<svg data-record />",
      }),
    ).toBe("<svg data-record />");
  });

  it("selects media asset authoring facts and flat upload patch fields", () => {
    const authoring = selectGeneratedRecordFieldMediaAuthoring({
      draft: "hero.webp",
      entityName: "block",
      fieldConfig: mediaAssetFieldConfig,
      mediaAssetOptions: [{ href: "/media/hero.webp", id: "hero.webp", label: "Hero" }],
      schema: blockSchema,
    });

    expect(authoring).toEqual({
      mediaPreviewHref: "/media/hero.webp",
      selectedAsset: {
        href: "/media/hero.webp",
        id: "hero.webp",
        label: "Hero",
      },
      uploadEnabled: true,
      uploadPatchFields: {
        heightFieldName: "height",
        mediaAssetFieldName: "mediaAsset",
        widthFieldName: "width",
      },
    });
    const uploadResolution = resolveGeneratedMediaUploadUpdateDraftPatchValues({
      baselineValues: {
        height: 200,
        mediaAsset: "hero.webp",
        width: 300,
      },
      draft: { values: {} },
      entityName: "block",
      fieldConfig: mediaAssetFieldConfig,
      fields: [mediaAssetFieldConfig],
      schema: blockSchema,
      upload: {
        assetId: "uploaded.webp",
        contentType: "image/webp",
        dimensions: { height: 300, width: 400 },
        href: "/api/formless/media/media/images/uploaded.webp",
        key: "media/images/uploaded.webp",
        size: 10,
      },
      uploadPatchFields: authoring.uploadPatchFields,
    });

    expect(uploadResolution.fieldErrors).toEqual({});
    expect(uploadResolution.patchValues).toEqual({
      height: 300,
      mediaAsset: "uploaded.webp",
      width: 400,
    });
  });

  it("keeps document replacement immutable and patches only the flat asset id", () => {
    const option = {
      access: "private",
      byteSize: 1200,
      contentType: "application/pdf",
      downloadHref: "/api/formless/program/media/documents/report.pdf?download=1",
      filename: "Report.pdf",
      href: "/api/formless/program/media/documents/report.pdf",
      id: "report.pdf",
      label: "Report.pdf",
    } as const;
    const authoring = selectGeneratedRecordFieldMediaAuthoring({
      draft: option.id,
      entityName: "block",
      fieldConfig: documentAssetFieldConfig,
      mediaAssetOptions: [option],
      schema: documentBlockSchema,
    });

    expect(authoring).toEqual({
      selectedAsset: option,
      uploadEnabled: true,
      uploadPatchFields: { mediaAssetFieldName: "mediaAsset" },
    });

    const replacementId = "replacement.pdf";
    const resolution = resolveGeneratedMediaUploadUpdateDraftPatchValues({
      baselineValues: {
        height: 200,
        mediaAsset: option.id,
        width: 300,
      },
      draft: { values: {} },
      entityName: "block",
      fieldConfig: documentAssetFieldConfig,
      fields: [documentAssetFieldConfig],
      schema: documentBlockSchema,
      upload: {
        asset: {
          access: "private",
          byteSize: 1500,
          contentType: "application/pdf",
          deliveryHref: `/api/formless/program/media/documents/${replacementId}`,
          filename: "Replacement.pdf",
          id: replacementId,
          kind: "document",
          label: "Replacement.pdf",
          provider: "r2",
          status: "ready",
          storageKey: `media/program/documents/${replacementId}`,
        },
        assetId: replacementId,
        contentType: "application/pdf",
        href: `/api/formless/program/media/documents/${replacementId}`,
        key: `media/program/documents/${replacementId}`,
        size: 1500,
      },
      uploadPatchFields: authoring.uploadPatchFields,
    });

    expect(resolution.fieldErrors).toEqual({});
    expect(resolution.patchValues).toEqual({ mediaAsset: replacementId });
  });

  it("builds uploaded media asset options and keeps selector options sorted", () => {
    const uploadedOption = imageMediaAssetOptionFromUpload({
      asset: {
        byteSize: 10,
        contentType: "image/webp",
        deliveryHref: "/api/formless/media/media/images/uploaded.webp",
        height: 350,
        id: "uploaded.webp",
        kind: "image",
        label: "Uploaded",
        provider: "r2",
        status: "ready",
        storageKey: "media/images/uploaded.webp",
      },
      assetId: "uploaded.webp",
      contentType: "image/webp",
      dimensions: { height: 300, width: 400 },
      href: "/fallback.webp",
      key: "media/images/uploaded.webp",
      size: 10,
    });

    expect(uploadedOption).toEqual({
      height: 350,
      href: "/api/formless/media/media/images/uploaded.webp",
      id: "uploaded.webp",
      label: "Uploaded",
      width: 400,
    });
    expect(
      upsertMediaAssetOption(
        [
          { href: "/z.webp", id: "z.webp", label: "Zed" },
          { href: "/uploaded-old.webp", id: "uploaded.webp", label: "Old" },
        ],
        uploadedOption!,
      ),
    ).toEqual([uploadedOption, { href: "/z.webp", id: "z.webp", label: "Zed" }]);
  });

  it("resolves value/unit update drafts through the patch resolver", () => {
    const resolution = resolveGeneratedValueUnitUpdateDraftPatchValues({
      baselineValues: {
        cost: 10,
        costUnit: "day",
      },
      draft: { values: {} },
      fieldConfig: costFieldConfig,
      fieldDraftInput: { kind: "value", value: 12.5 },
      fields: [costFieldConfig],
      unitDraftInput: { kind: "input", value: "hour" },
    });

    expect(resolution.fieldErrors).toEqual({});
    expect(resolution.patchValues).toEqual({
      cost: 12.5,
      costUnit: "hour",
    });

    const invalidAmount = resolveGeneratedValueUnitUpdateDraftPatchValues({
      baselineValues: {
        cost: 10,
        costUnit: "hour",
      },
      draft: { values: {} },
      fieldConfig: costFieldConfig,
      fieldDraftInput: { kind: "input", value: "not a number" },
      fields: [costFieldConfig],
      unitDraftInput: { kind: "input", value: "day" },
    });

    expect(invalidAmount.patchValues).toEqual({
      costUnit: "day",
    });
    expect(invalidAmount.fieldErrors).toEqual({
      cost: {
        fieldName: "cost",
        message: "Enter a finite number.",
        draftValue: { kind: "input", value: "not a number" },
      },
    });
  });

  it("resolves specialized text-backed editor drafts through the update patch resolver", () => {
    const fields = [markdownFieldConfig, colorFieldConfig, iconFieldConfig, mediaAssetFieldConfig];
    const resolution = resolveGeneratedUpdateDraftPatchValues({
      baselineValues: {
        body: "Old body",
        color: "#000000",
        icon: "old-icon",
        mediaAsset: "old.webp",
      },
      draft: {
        values: {
          body: { kind: "input", value: "New **body**" },
          color: { kind: "input", value: "#ffffff" },
          icon: { kind: "input", value: "<svg />" },
          mediaAsset: { kind: "input", value: "new.webp" },
        },
      },
      fields,
    });

    expect(fields.map(generatedRecordFieldUsesUpdateDraftResolver)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(resolution.fieldErrors).toEqual({});
    expect(resolution.patchValues).toEqual({
      body: "New **body**",
      color: "#ffffff",
      icon: "<svg />",
      mediaAsset: "new.webp",
    });
  });

  it("selects editability from patch and pending state", () => {
    expect(
      selectGeneratedRecordFieldEditability({
        canPatch: true,
        isPending: false,
        uploadEnabled: false,
      }),
    ).toEqual({
      canEdit: true,
      controlDisabled: false,
      uploadDisabled: true,
    });
    expect(
      selectGeneratedRecordFieldEditability({
        canPatch: false,
        isPending: false,
        uploadEnabled: true,
      }),
    ).toEqual({
      canEdit: false,
      controlDisabled: true,
      uploadDisabled: true,
    });
  });
});

const numberField = { type: "number", required: false } satisfies FieldSchema;
const textField = { type: "text", required: false } satisfies FieldSchema;
const imageTextField = { type: "text", required: false, format: "href" } satisfies FieldSchema;
const dateField = { type: "date", required: false } satisfies FieldSchema;
const booleanField = { type: "boolean", required: false } satisfies FieldSchema;
const linkTargetModeField = {
  type: "enum",
  required: false,
  values: [
    { key: "external", label: "External" },
    { key: "internal", label: "Internal" },
  ],
} satisfies FieldSchema;
const ownerField = { type: "reference", required: false, to: "principal" } satisfies FieldSchema;
const costUnitField = {
  type: "enum",
  required: false,
  values: [
    { key: "day", label: "Day" },
    { key: "hour", label: "Hour" },
  ],
} satisfies FieldSchema;
const costFieldConfig = {
  fieldName: "cost",
  field: numberField,
  editor: "number",
  commit: "field-commit",
  format: "currency",
  valueUnit: {
    unitFieldName: "costUnit",
    unitField: costUnitField,
  },
} satisfies RecordFieldConfig;

const updatePatchFields = [
  {
    fieldName: "linkTargetMode",
    field: linkTargetModeField,
    editor: "enum",
    commit: "immediate",
  },
  {
    fieldName: "title",
    field: textField,
    editor: "text",
    commit: "field-commit",
  },
  {
    fieldName: "done",
    field: booleanField,
    editor: "boolean",
    commit: "immediate",
  },
  {
    fieldName: "estimate",
    field: numberField,
    editor: "number",
    commit: "field-commit",
  },
  {
    fieldName: "dueDate",
    field: dateField,
    editor: "date",
    commit: "field-commit",
  },
  {
    fieldName: "owner",
    field: ownerField,
    editor: "reference",
    commit: "immediate",
  },
  {
    fieldName: "href",
    field: imageTextField,
    editor: "href",
    commit: "field-commit",
    visibleWhen: { field: "linkTargetMode", values: ["external"] },
  },
  {
    fieldName: "linkTargetBlock",
    field: { type: "reference", required: false, to: "block" },
    editor: "reference",
    commit: "immediate",
    visibleWhen: { field: "linkTargetMode", values: ["internal"] },
  },
  {
    fieldName: "createdAt",
    field: { type: "date", required: false },
    fieldRef: { kind: "system", name: "createdAt" },
    editor: "date",
    commit: "field-commit",
    writable: false,
  },
  {
    fieldName: "readOnlySummary",
    field: textField,
    editor: "text",
    commit: "field-commit",
    writable: false,
  },
  {
    fieldName: "status",
    field: {
      type: "enum",
      required: true,
      values: [
        { key: "done", label: "Done" },
        { key: "todo", label: "Todo" },
      ],
    },
    editor: "enum",
    commit: "immediate",
    stateMachine: {
      fieldName: "status",
      machineName: "statusFlow",
      machine: {
        field: "status",
        initial: "todo",
        transitions: [],
      },
      initialState: "todo",
      terminalStates: ["done"],
    },
  },
] satisfies RecordFieldConfig[];

const kindField = {
  type: "enum",
  required: true,
  values: [
    { key: "article", label: "Article" },
    { key: "link", label: "Link" },
  ],
} satisfies FieldSchema;
const unionBaseFields = [
  {
    fieldName: "kind",
    field: kindField,
    editor: "enum",
    commit: "immediate",
  },
  {
    fieldName: "title",
    field: textField,
    editor: "text",
    commit: "field-commit",
  },
] satisfies RecordFieldConfig[];

const updateUnion = {
  unionName: "contentByKind",
  union: {
    entity: "content",
    discriminator: "kind",
    variants: [
      { key: "article", label: "Article", fields: ["body"] },
      { key: "link", label: "Link", fields: ["url"] },
    ],
  },
  discriminatorFieldName: "kind",
  discriminatorField: kindField,
  variants: [
    {
      variantValue: "article",
      label: "Article",
      unionVariant: { label: "Article", fields: ["body"] },
      presentation: {
        type: "fields",
        fields: [
          {
            fieldName: "body",
            field: textField,
            editor: "textarea",
            commit: "field-commit",
          },
        ],
      },
    },
    {
      variantValue: "link",
      label: "Link",
      unionVariant: { label: "Link", fields: ["url"] },
      presentation: {
        type: "fields",
        fields: [
          {
            fieldName: "url",
            field: imageTextField,
            editor: "href",
            commit: "field-commit",
          },
        ],
      },
    },
  ],
} satisfies RecordUnionPresentationConfig;

const mediaAssetFieldConfig = {
  fieldName: "mediaAsset",
  field: imageTextField,
  editor: "media",
  commit: "field-commit",
} satisfies RecordFieldConfig;
const documentAssetField: Extract<
  FieldSchema,
  {
    type: "text";
  }
> = {
  asset: {
    acceptedMimeTypes: ["application/pdf"],
    access: "private",
    kind: "document",
    maxBytes: 4 * 1024 * 1024,
  },
  required: false,
  type: "text",
};

const documentAssetFieldConfig = {
  fieldName: "mediaAsset",
  field: documentAssetField,
  editor: "media",
  commit: "field-commit",
} satisfies RecordFieldConfig;

const markdownFieldConfig = {
  fieldName: "body",
  field: { type: "text", required: false, format: "markdown" },
  editor: "markdown",
  commit: "field-commit",
} satisfies RecordFieldConfig;

const colorFieldConfig = {
  fieldName: "color",
  field: { type: "text", required: false, format: "color" },
  editor: "color",
  commit: "field-commit",
} satisfies RecordFieldConfig;

const iconFieldConfig = {
  fieldName: "icon",
  field: { type: "text", required: false, format: "icon" },
  editor: "icon",
  commit: "field-commit",
} satisfies RecordFieldConfig;
const blockSchema = {
  version: 1,
  entities: [
    {
      id: "entity_1738228a-6b12-44fe-8933-16b917c0baf3",
      key: "block",
      fields: [
        { key: "height", type: "number", required: false },
        {
          ...imageTextField,
          key: "href",
        },
        {
          ...imageTextField,
          key: "mediaAsset",
        },
        { key: "width", type: "number", required: false },
      ],
    },
  ],
  queries: [],
  itemViews: [],
  tableViews: [],
  views: [],
} as unknown as AppSchema;
const documentBlockSchema = {
  ...blockSchema,
  entities: blockSchema.entities.map((entity) =>
    entity.key === "block"
      ? {
          ...entity,
          fields: entity.fields.map((field) =>
            field.key === "mediaAsset"
              ? {
                  ...documentAssetField,
                  key: "mediaAsset",
                }
              : field,
          ),
        }
      : entity,
  ),
} as unknown as AppSchema;
