import { describe, expect, it } from "vite-plus/test";
import type {
  CreateDefaultConfig,
  CreateFieldConfig,
  CreateUnionPresentationConfig,
} from "../../client/views.ts";
import type { EntityUnionVariantSchema, FieldSchema } from "@dpeek/formless-schema";
import { generatedFieldDraftInput } from "@dpeek/formless-schema";
import {
  initialGeneratedCreateDraftSessionState,
  markGeneratedCreateDraftSessionSubmitted,
  nextGeneratedCreateDraftSessionState,
  resolveGeneratedCreateValues,
  selectGeneratedCreateDraftSession,
} from "./create-field-authoring.ts";

describe("generated create draft session", () => {
  it("selects visible create fields from fixed discriminator defaults and draft values", () => {
    const defaults = [literalTypeDefault("link")];
    const fields = [createField("label", "text")];
    const state = initialGeneratedCreateDraftSessionState({
      defaults,
      fields,
      union: blockUnion,
    });

    expect(
      fieldNames(
        selectGeneratedCreateDraftSession({
          defaults,
          enabled: true,
          fields,
          state,
          union: blockUnion,
        }).visibleFields,
      ),
    ).toEqual(["label", "linkTargetMode", "href", "icon"]);

    const internalLinkState = nextSessionValue(state, "linkTargetMode", "internal");

    expect(
      fieldNames(
        selectGeneratedCreateDraftSession({
          defaults,
          enabled: true,
          fields,
          state: internalLinkState,
          union: blockUnion,
        }).visibleFields,
      ),
    ).toEqual(["label", "linkTargetMode", "linkTargetBlock", "icon"]);
  });

  it("updates active union fields when the discriminator draft changes", () => {
    const fields = [createField("type", "enum"), createField("label", "text")];
    const state = initialGeneratedCreateDraftSessionState({ fields, union: blockUnion });
    const linkState = nextSessionValue(state, "type", "link");

    expect(
      fieldNames(
        selectGeneratedCreateDraftSession({
          enabled: true,
          fields,
          state,
          union: blockUnion,
        }).visibleFields,
      ),
    ).toEqual(["type", "label", "href", "icon"]);
    expect(
      fieldNames(
        selectGeneratedCreateDraftSession({
          enabled: true,
          fields,
          state: linkState,
          union: blockUnion,
        }).visibleFields,
      ),
    ).toEqual(["type", "label", "linkTargetMode", "href", "icon"]);
  });

  it("preserves hidden draft values when visibleWhen hides and reveals fields", () => {
    const defaults = [literalTypeDefault("link")];
    const fields = [createField("label", "text")];
    const state = initialGeneratedCreateDraftSessionState({
      defaults,
      fields,
      union: blockUnion,
    });
    const internalState = nextSessionValue(
      nextSessionValue(state, "linkTargetMode", "internal"),
      "linkTargetBlock",
      "docs",
    );
    const externalState = nextSessionValue(internalState, "linkTargetMode", "external");
    const revealedState = nextSessionValue(externalState, "linkTargetMode", "internal");

    expect(
      fieldNames(
        selectGeneratedCreateDraftSession({
          defaults,
          enabled: true,
          fields,
          state: externalState,
          union: blockUnion,
        }).visibleFields,
      ),
    ).toEqual(["label", "linkTargetMode", "href", "icon"]);
    expect(externalState.draft.values.linkTargetBlock).toEqual({
      kind: "input",
      value: "docs",
    });
    expect(
      selectGeneratedCreateDraftSession({
        defaults,
        enabled: true,
        fields,
        state: revealedState,
        union: blockUnion,
      }).values,
    ).toMatchObject({
      linkTargetBlock: "docs",
    });
  });

  it("exposes submit readiness and hidden field errors for context defaults", () => {
    const defaults = [
      {
        fieldName: "parent",
        field: schemaFields.parent,
        value: { kind: "context", name: "block" },
      },
    ] satisfies CreateDefaultConfig[];
    const fields = [createField("block", "reference"), createField("label", "text")];
    const state = initialGeneratedCreateDraftSessionState({ defaults, fields });

    expect(
      selectGeneratedCreateDraftSession({
        defaults,
        enabled: true,
        fields,
        queryContext: { today: "2026-05-27" },
        state,
      }),
    ).toMatchObject({
      canSubmit: false,
      defaultsResolved: false,
      fieldErrors: {
        parent: {
          message: 'Create default for "parent" requires selected context "block".',
        },
      },
    });
    expect(
      selectGeneratedCreateDraftSession({
        defaults,
        enabled: true,
        fields,
        queryContext: { today: "2026-05-27", values: { block: "home" } },
        state,
      }),
    ).toMatchObject({ canSubmit: true, defaultsResolved: true, fieldErrors: {} });
  });

  it("surfaces required field errors after submit before operation values are used", () => {
    const fields = [createField("label", "text")];
    const state = initialGeneratedCreateDraftSessionState({ fields });

    expect(
      selectGeneratedCreateDraftSession({
        enabled: true,
        fields,
        state,
      }),
    ).toMatchObject({ canSubmit: true, fieldErrors: {} });

    const submittedSession = selectGeneratedCreateDraftSession({
      enabled: true,
      fields,
      state: markGeneratedCreateDraftSessionSubmitted(state),
    });

    expect(submittedSession).toMatchObject({
      canSubmit: false,
      fieldErrors: {
        label: {
          fieldName: "label",
          message: 'Field "label" cannot be empty.',
        },
      },
    });

    expect(
      selectGeneratedCreateDraftSession({
        enabled: true,
        fields,
        state: nextSessionValue(markGeneratedCreateDraftSessionSubmitted(state), "label", "Docs"),
      }),
    ).toMatchObject({
      canSubmit: true,
      fieldErrors: {},
      values: { label: "Docs" },
    });
  });

  it("uses schema text formats to reject invalid create drafts", () => {
    const fields = [
      {
        editor: "text",
        field: { format: "email", required: false, type: "text" },
        fieldName: "email",
      },
    ] satisfies CreateFieldConfig[];
    const state = initialGeneratedCreateDraftSessionState({ fields });
    const invalid = nextSessionValue(state, "email", "not-an-email");
    const empty = nextSessionValue(state, "email", "");

    expect(
      selectGeneratedCreateDraftSession({ enabled: true, fields, state: invalid }),
    ).toMatchObject({
      canSubmit: false,
      fieldErrors: {
        email: {
          fieldName: "email",
          message: "Enter an email address like name@example.com.",
        },
      },
    });
    expect(
      selectGeneratedCreateDraftSession({ enabled: true, fields, state: empty }),
    ).toMatchObject({
      canSubmit: true,
      fieldErrors: {},
    });
  });

  it("keeps invalid number drafts as field errors without operation input", () => {
    const fields = [createField("estimate", "number"), createField("label", "text")];
    const state = nextSessionValue(
      nextSessionValue(initialGeneratedCreateDraftSessionState({ fields }), "label", "Sizing"),
      "estimate",
      "many",
    );

    expect(
      selectGeneratedCreateDraftSession({
        enabled: true,
        fields,
        state,
      }),
    ).toMatchObject({
      canSubmit: false,
      fieldErrors: {
        estimate: {
          fieldName: "estimate",
          message: "Enter a finite number.",
          draftValue: { kind: "input", value: "many" },
        },
      },
      values: { label: "Sizing" },
    });
  });

  it("keeps state-machine initial state in the typed draft session", () => {
    const statusField = {
      ...createField("status", "enum"),
      stateMachine: {
        fieldName: "status",
        initialState: "new",
        machine: {
          field: "status",
          initial: "new",
          transitions: [],
        },
        machineName: "statusFlow",
        terminalStates: ["archived"],
      },
    } satisfies CreateFieldConfig;
    const fields = [statusField];
    const state = initialGeneratedCreateDraftSessionState({ fields });

    expect(state.draft.values.status).toEqual({ kind: "value", value: "new" });
    expect(
      selectGeneratedCreateDraftSession({
        enabled: true,
        fields,
        state,
      }).values,
    ).toEqual({ status: "new" });
  });

  it("resolves submitted values from active visible fields and create defaults", () => {
    const linkFormData = new FormData();
    linkFormData.set("label", "Internal docs");
    linkFormData.set("linkTargetMode", "internal");
    linkFormData.set("linkTargetBlock", "docs");
    linkFormData.set("href", "/stale-docs");
    linkFormData.set("icon", "book");

    expect(
      resolveGeneratedCreateValues({
        defaults: [literalTypeDefault("link")],
        fields: [createField("label", "text")],
        formData: linkFormData,
        union: blockUnion,
      }),
    ).toEqual({
      label: "Internal docs",
      linkTargetMode: "internal",
      linkTargetBlock: "docs",
      icon: "book",
      type: "link",
    });

    const placementFormData = new FormData();
    placementFormData.set("block", "hero");
    placementFormData.set("label", "Hero");

    expect(
      resolveGeneratedCreateValues({
        defaults: [
          {
            fieldName: "parent",
            field: schemaFields.parent,
            value: { kind: "context", name: "block" },
          },
        ],
        fields: [createField("block", "reference"), createField("label", "text")],
        formData: placementFormData,
        queryContext: { today: "2026-05-27", values: { block: "home" } },
      }),
    ).toEqual({
      block: "hero",
      label: "Hero",
      parent: "home",
    });
  });
});

function nextSessionValue(
  state: ReturnType<typeof initialGeneratedCreateDraftSessionState>,
  fieldName: string,
  value: string | boolean | number,
) {
  return nextGeneratedCreateDraftSessionState({
    fieldName,
    fieldValue: generatedFieldDraftInput(value),
    state,
  });
}

function fieldNames(fields: CreateFieldConfig[]) {
  return fields.map((field) => field.fieldName);
}

function createField(fieldName: keyof typeof schemaFields, editor: CreateFieldConfig["editor"]) {
  return {
    fieldName,
    field: schemaFields[fieldName],
    editor,
  } satisfies CreateFieldConfig;
}

function literalTypeDefault(value: "page" | "link") {
  return {
    fieldName: "type",
    field: schemaFields.type,
    value: { kind: "literal", value },
  } satisfies CreateDefaultConfig;
}

const schemaFields = {
  type: {
    type: "enum",
    required: true,
    values: [
      { key: "page", label: "Page" },
      { key: "link", label: "Link" },
    ],
  },
  label: { type: "text", required: true },
  href: { type: "text", required: false, format: "href" },
  icon: { type: "text", required: false, format: "icon" },
  estimate: { type: "number", required: false },
  status: {
    type: "enum",
    required: true,
    values: [
      { key: "archived", label: "Archived" },
      { key: "new", label: "New" },
    ],
  },
  linkTargetMode: {
    type: "enum",
    required: false,
    values: [
      { key: "internal", label: "Internal" },
      { key: "external", label: "External" },
    ],
  },
  linkTargetBlock: {
    type: "reference",
    required: false,
    to: "block",
    displayField: "label",
  },
  parent: {
    type: "reference",
    required: true,
    to: "block",
  },
  block: {
    type: "reference",
    required: true,
    to: "block",
  },
} satisfies Record<string, FieldSchema>;

const pageVariant = {
  label: "Page",
  fields: ["href", "icon"],
} satisfies EntityUnionVariantSchema;

const linkVariant = {
  label: "Link",
  fields: ["linkTargetMode", "linkTargetBlock", "href", "icon"],
} satisfies EntityUnionVariantSchema;

const blockUnion = {
  unionName: "blockByType",
  union: {
    entity: "block",
    discriminator: "type",
    variants: [
      {
        key: "page",
        ...pageVariant,
      },
      {
        key: "link",
        ...linkVariant,
      },
    ],
  },
  discriminatorFieldName: "type",
  discriminatorField: schemaFields.type,
  variants: [
    {
      variantValue: "page",
      label: "Page",
      unionVariant: pageVariant,
      presentation: {
        type: "fields",
        fields: [createField("href", "href"), createField("icon", "icon")],
      },
    },
    {
      variantValue: "link",
      label: "Link",
      unionVariant: linkVariant,
      presentation: {
        type: "fields",
        fields: [
          createField("linkTargetMode", "enum"),
          {
            ...createField("linkTargetBlock", "reference"),
            visibleWhen: { field: "linkTargetMode", values: ["internal"] },
          },
          {
            ...createField("href", "href"),
            visibleWhen: { field: "linkTargetMode", values: ["", "external"] },
          },
          createField("icon", "icon"),
        ],
      },
    },
  ],
} satisfies CreateUnionPresentationConfig;
