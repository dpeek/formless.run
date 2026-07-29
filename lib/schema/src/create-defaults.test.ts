import { describe, expect, it } from "vite-plus/test";
import {
  createDefaultsAreResolved,
  generatedFieldDraftInputFromNativeFormData,
  parseCreateViewDefaults,
  resolveCreateDraftValues,
  resolveCreateValues,
  type CreateDraftInput,
  type CreateDefaultConfig,
  type CreateDefaultFieldConfig,
  type CreateDefaultUnionConfig,
} from "./index.ts";
import type { CreateViewFieldBindingSchema, EntitySchema, EnumFieldSchema } from "./index.ts";
describe("create defaults primitive", () => {
  it("parses context and literal defaults behind one boundary", () => {
    expect(
      parseCreateViewDefaults(
        "rateCreateForCard",
        "rate",
        {
          card: { kind: "context", name: "card" },
          costUnit: { kind: "literal", value: "day" },
        },
        rateEntity,
        rateCreateFields,
      ),
    ).toEqual({
      card: { kind: "context", name: "card" },
      costUnit: { kind: "literal", value: "day" },
    });
  });

  it("keeps unsupported create default errors source-faithful", () => {
    expect(() =>
      parseCreateViewDefaults(
        "rateCreateForCard",
        "rate",
        { card: { kind: "literal", value: "card-1" } },
        rateEntity,
        rateCreateFields,
      ),
    ).toThrow('Create view "rateCreateForCard" default "card" requires a scalar field.');

    expect(() =>
      parseCreateViewDefaults(
        "rateCreateForCard",
        "rate",
        { costUnit: { kind: "context", name: "card" } },
        rateEntity,
        rateCreateFields,
      ),
    ).toThrow('Create view "rateCreateForCard" default "costUnit" requires a reference field.');
  });

  it("resolves visible values, context defaults, and literal defaults for submit", () => {
    const formData = new FormData();
    formData.set("resource", "resource-1");
    formData.set("cost", "325");
    formData.set("price", "475");

    expect(
      resolveCreateValues({
        formData,
        fields: [
          {
            fieldName: "resource",
            field: rateEntity.fields.find((definition) => definition.key === "resource")!,
          },
          {
            fieldName: "cost",
            field: rateEntity.fields.find((definition) => definition.key === "cost")!,
          },
          {
            fieldName: "price",
            field: rateEntity.fields.find((definition) => definition.key === "price")!,
          },
        ],
        defaults: rateCreateDefaults,
        queryContext: { today: "2026-05-12", values: { card: "card-1" } },
      }),
    ).toEqual({
      resource: "resource-1",
      cost: 325,
      price: 475,
      card: "card-1",
      costUnit: "day",
    });
  });

  it("uses literal defaults when choosing fixed-discriminator create fields", () => {
    const formData = new FormData();
    formData.set("label", "A post");
    formData.set("body", "Post body");

    expect(
      resolveCreateValues({
        formData,
        fields: [
          {
            fieldName: "label",
            field: blockEntity.fields.find((definition) => definition.key === "label")!,
          },
        ],
        union: {
          discriminatorFieldName: "type",
          discriminatorField: enumField(blockEntity, "type"),
          variants: [
            {
              variantValue: "post",
              presentation: {
                fields: [
                  {
                    fieldName: "body",
                    field: blockEntity.fields.find((definition) => definition.key === "body")!,
                  },
                ],
              },
            },
          ],
        },
        defaults: [
          {
            fieldName: "type",
            field: blockEntity.fields.find((definition) => definition.key === "type")!,
            value: { kind: "literal", value: "post" },
          },
        ],
      }),
    ).toEqual({
      label: "A post",
      body: "Post body",
      type: "post",
    });
  });

  it("resolves typed draft values through union fields, visibility, and defaults", () => {
    const result = resolveCreateDraftValues<CreateDefaultFieldConfig>({
      draft: {
        values: {
          type: { kind: "value", value: "link" },
          label: { kind: "value", value: "Internal docs" },
          body: { kind: "input", value: "## Draft\n\nBody copy." },
          featured: { kind: "value", value: true },
          resource: { kind: "value", value: "resource-1" },
          estimate: { kind: "input", value: "1.2k" },
          linkTargetMode: { kind: "value", value: "internal" },
          linkTargetBlock: { kind: "value", value: "docs" },
          href: { kind: "value", value: "/stale-docs" },
        },
      },
      fields: [
        {
          fieldName: "type",
          field: blockEntity.fields.find((definition) => definition.key === "type")!,
        },
        {
          fieldName: "label",
          field: blockEntity.fields.find((definition) => definition.key === "label")!,
        },
        {
          fieldName: "body",
          field: blockEntity.fields.find((definition) => definition.key === "body")!,
        },
        {
          fieldName: "featured",
          field: blockEntity.fields.find((definition) => definition.key === "featured")!,
        },
        {
          fieldName: "resource",
          field: blockEntity.fields.find((definition) => definition.key === "resource")!,
        },
        {
          fieldName: "estimate",
          field: blockEntity.fields.find((definition) => definition.key === "estimate")!,
        },
      ],
      union: blockUnion,
      defaults: [
        {
          fieldName: "visibility",
          field: blockEntity.fields.find((definition) => definition.key === "visibility")!,
          value: { kind: "literal", value: "public" },
        },
        {
          fieldName: "parent",
          field: blockEntity.fields.find((definition) => definition.key === "parent")!,
          value: { kind: "context", name: "block" },
        },
      ],
      queryContext: { today: "2026-05-12", values: { block: "home" } },
    });

    expect(result).toEqual({
      values: {
        type: "link",
        label: "Internal docs",
        body: "## Draft\n\nBody copy.",
        featured: true,
        resource: "resource-1",
        estimate: 1200,
        linkTargetMode: "internal",
        linkTargetBlock: "docs",
        visibility: "public",
        parent: "home",
      },
      fieldErrors: {},
      visibleFields: [
        "type",
        "label",
        "body",
        "featured",
        "resource",
        "estimate",
        "linkTargetMode",
        "linkTargetBlock",
      ],
    });
  });

  it("adapts native FormData values into shared typed draft input before resolving", () => {
    const formData = new FormData();
    formData.set("resource", "resource-1");
    formData.set("cost", "325");
    formData.set("price", "475");

    const draft = generatedFieldDraftInputFromNativeFormData(formData);

    expect(draft).toEqual({
      values: {
        resource: { kind: "input", value: "resource-1" },
        cost: { kind: "input", value: "325" },
        price: { kind: "input", value: "475" },
      },
    });
    expect(
      resolveCreateDraftValues({
        draft,
        fields: [
          {
            fieldName: "resource",
            field: rateEntity.fields.find((definition) => definition.key === "resource")!,
          },
          {
            fieldName: "cost",
            field: rateEntity.fields.find((definition) => definition.key === "cost")!,
          },
          {
            fieldName: "price",
            field: rateEntity.fields.find((definition) => definition.key === "price")!,
          },
        ],
        defaults: rateCreateDefaults,
        queryContext: { today: "2026-05-12", values: { card: "card-1" } },
      }).values,
    ).toEqual(
      resolveCreateValues({
        formData,
        fields: [
          {
            fieldName: "resource",
            field: rateEntity.fields.find((definition) => definition.key === "resource")!,
          },
          {
            fieldName: "cost",
            field: rateEntity.fields.find((definition) => definition.key === "cost")!,
          },
          {
            fieldName: "price",
            field: rateEntity.fields.find((definition) => definition.key === "price")!,
          },
        ],
        defaults: rateCreateDefaults,
        queryContext: { today: "2026-05-12", values: { card: "card-1" } },
      }),
    );
  });

  it("adapts boolean native FormData values with field-aware typed drafts", () => {
    const formData = new FormData();
    formData.append("featured", "false");
    formData.append("featured", "on");
    expect(
      generatedFieldDraftInputFromNativeFormData(formData, [
        {
          fieldName: "featured",
          field: blockEntity.fields.find((definition) => definition.key === "featured")!,
        },
      ]),
    ).toEqual({
      values: {
        featured: { kind: "value", value: true },
      },
    });

    const falseFormData = new FormData();
    falseFormData.set("featured", "false");

    expect(
      resolveCreateValues({
        formData: falseFormData,
        fields: [
          {
            fieldName: "featured",
            field: blockEntity.fields.find((definition) => definition.key === "featured")!,
          },
        ],
      }),
    ).toEqual({
      featured: false,
    });
  });

  it("preserves invalid number drafts as field errors instead of operation input", () => {
    const draft = {
      values: {
        estimate: { kind: "input", value: "many" },
        label: { kind: "value", value: "Sizing" },
      },
    } satisfies CreateDraftInput;

    const result = resolveCreateDraftValues({
      draft,
      fields: [
        {
          fieldName: "estimate",
          field: blockEntity.fields.find((definition) => definition.key === "estimate")!,
        },
        {
          fieldName: "label",
          field: blockEntity.fields.find((definition) => definition.key === "label")!,
        },
      ],
    });
    expect(result.values).toEqual({ label: "Sizing" });
    expect(result.fieldErrors).toEqual({
      estimate: {
        fieldName: "estimate",
        message: "Enter a finite number.",
        draftValue: { kind: "input", value: "many" },
      },
    });

    const formData = new FormData();
    formData.set("estimate", "many");
    expect(() =>
      resolveCreateValues({
        formData,
        fields: [
          {
            fieldName: "estimate",
            field: blockEntity.fields.find((definition) => definition.key === "estimate")!,
          },
        ],
      }),
    ).toThrow("Enter a finite number.");
  });

  it("reports missing context defaults before and during submit shaping", () => {
    const formData = new FormData();
    formData.set("resource", "resource-1");
    formData.set("cost", "325");
    formData.set("price", "475");

    expect(createDefaultsAreResolved(rateCreateDefaults, { today: "2026-05-12" })).toBe(false);
    expect(
      resolveCreateDraftValues({
        draft: generatedFieldDraftInputFromNativeFormData(formData),
        fields: [
          {
            fieldName: "resource",
            field: rateEntity.fields.find((definition) => definition.key === "resource")!,
          },
          {
            fieldName: "cost",
            field: rateEntity.fields.find((definition) => definition.key === "cost")!,
          },
          {
            fieldName: "price",
            field: rateEntity.fields.find((definition) => definition.key === "price")!,
          },
        ],
        defaults: rateCreateDefaults,
        queryContext: { today: "2026-05-12" },
      }).fieldErrors,
    ).toEqual({
      card: {
        fieldName: "card",
        message: 'Create default for "card" requires selected context "card".',
      },
    });
    expect(() =>
      resolveCreateValues({
        formData,
        fields: [
          {
            fieldName: "resource",
            field: rateEntity.fields.find((definition) => definition.key === "resource")!,
          },
          {
            fieldName: "cost",
            field: rateEntity.fields.find((definition) => definition.key === "cost")!,
          },
          {
            fieldName: "price",
            field: rateEntity.fields.find((definition) => definition.key === "price")!,
          },
        ],
        defaults: rateCreateDefaults,
        queryContext: { today: "2026-05-12" },
      }),
    ).toThrow('Create default for "card" requires selected context "card".');
  });
});
const rateEntity = {
  id: "entity_03932047-ac75-4c24-b602-a3c3cd3faaec",
  label: "Rate",
  fields: [
    { key: "resource", type: "reference", required: true, to: "resource" },
    { key: "card", type: "reference", required: true, to: "card" },
    { key: "cost", type: "number", required: true, min: 0 },
    {
      key: "costUnit",
      type: "enum",
      required: true,
      values: [
        { key: "hour", label: "Hour" },
        { key: "day", label: "Day" },
      ],
    },
    { key: "price", type: "number", required: true, min: 0 },
  ],
} satisfies EntitySchema;
const rateCreateFields = [
  { field: "resource", editor: "reference" },
  { field: "cost", editor: "number" },
  { field: "price", editor: "number" },
] satisfies CreateViewFieldBindingSchema[];
const rateCreateDefaults = [
  {
    fieldName: "card",
    field: rateEntity.fields.find((definition) => definition.key === "card")!,
    value: { kind: "context", name: "card" },
  },
  {
    fieldName: "costUnit",
    field: rateEntity.fields.find((definition) => definition.key === "costUnit")!,
    value: { kind: "literal", value: "day" },
  },
] satisfies CreateDefaultConfig[];
const blockEntity = {
  id: "entity_bd4d51f2-becb-4676-8231-91d9c9f96d14",
  label: "Block",
  fields: [
    {
      key: "type",
      type: "enum",
      required: true,
      values: [
        { key: "post", label: "Post" },
        { key: "image", label: "Image" },
        { key: "link", label: "Link" },
      ],
    },
    { key: "label", type: "text", required: true },
    { key: "body", type: "text", required: false },
    { key: "featured", type: "boolean", required: true, default: false },
    { key: "resource", type: "reference", required: true, to: "resource" },
    { key: "estimate", type: "number", required: false, min: 0 },
    {
      key: "linkTargetMode",
      type: "enum",
      required: false,
      values: [
        { key: "internal", label: "Internal" },
        { key: "external", label: "External" },
      ],
    },
    { key: "linkTargetBlock", type: "reference", required: false, to: "block" },
    { key: "href", type: "text", required: false, format: "href" },
    {
      key: "visibility",
      type: "enum",
      required: true,
      values: [
        { key: "public", label: "Public" },
        { key: "private", label: "Private" },
      ],
    },
    { key: "parent", type: "reference", required: false, to: "block" },
  ],
} satisfies EntitySchema;
const blockUnion: CreateDefaultUnionConfig<CreateDefaultFieldConfig> = {
  discriminatorFieldName: "type",
  discriminatorField: enumField(blockEntity, "type"),
  variants: [
    {
      variantValue: "link",
      presentation: {
        fields: [
          {
            fieldName: "linkTargetMode",
            field: blockEntity.fields.find((definition) => definition.key === "linkTargetMode")!,
          },
          {
            fieldName: "linkTargetBlock",
            field: blockEntity.fields.find((definition) => definition.key === "linkTargetBlock")!,
            visibleWhen: { field: "linkTargetMode", values: ["internal"] },
          },
          {
            fieldName: "href",
            field: blockEntity.fields.find((definition) => definition.key === "href")!,
            visibleWhen: { field: "linkTargetMode", values: ["", "external"] },
          },
        ],
      },
    },
  ],
};
function enumField(entity: EntitySchema, key: string): EnumFieldSchema {
  const field = entity.fields.find((definition) => definition.key === key);
  if (field?.type !== "enum") {
    throw new Error(`Missing enum field "${key}".`);
  }
  return field;
}
