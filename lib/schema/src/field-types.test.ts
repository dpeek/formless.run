import { describe, expect, it } from "vite-plus/test";
import {
  createInputValueToFieldValue,
  fieldEditorControl,
  fieldInputAttributes,
  fieldCreateDefaultValue,
  fieldHasCreateDefault,
  fieldSupportsEditor,
  fieldValueToInputValue,
  formatFieldDisplayPrimitive,
  getFieldTypeBehavior,
  inputValueToFieldValue,
  isValidStoredFieldValue,
  numberInputValueToFieldValue,
  shouldValidateExistingFieldValue,
  TEXT_EMAIL_FORMAT_INVALID_MESSAGE,
  TEXT_PHONE_FORMAT_INVALID_MESSAGE,
  validateAuthorityFieldValue,
} from "./index.ts";
import type { FieldSchema } from "./index.ts";

describe("field type behavior", () => {
  it("defines query operators, editors, and default commits for built-in field types", () => {
    expect(
      Object.fromEntries(
        Object.entries(fields).map(([name, field]) => {
          const behavior = getFieldTypeBehavior(field);

          return [
            name,
            {
              filterOps: behavior.filterOps,
              editors: behavior.editors,
              defaultEditor: behavior.defaultEditor,
              defaultCommit: behavior.defaultCommit,
            },
          ];
        }),
      ),
    ).toEqual({
      title: {
        filterOps: ["eq"],
        editors: ["text", "textarea", "markdown", "href", "slug", "color", "icon", "media"],
        defaultEditor: "text",
        defaultCommit: "field-commit",
      },
      body: {
        filterOps: ["eq"],
        editors: ["text", "textarea", "markdown", "href", "slug", "color", "icon", "media"],
        defaultEditor: "text",
        defaultCommit: "field-commit",
      },
      icon: {
        filterOps: ["eq"],
        editors: ["text", "textarea", "markdown", "href", "slug", "color", "icon", "media"],
        defaultEditor: "text",
        defaultCommit: "field-commit",
      },
      iconFallback: {
        filterOps: ["eq"],
        editors: ["text", "textarea", "markdown", "href", "slug", "color", "icon", "media"],
        defaultEditor: "text",
        defaultCommit: "field-commit",
      },
      iconId: {
        filterOps: ["eq"],
        editors: ["text", "textarea", "markdown", "href", "slug", "color", "icon", "media"],
        defaultEditor: "text",
        defaultCommit: "field-commit",
      },
      email: {
        filterOps: ["eq"],
        editors: ["text", "textarea", "markdown", "href", "slug", "color", "icon", "media"],
        defaultEditor: "text",
        defaultCommit: "field-commit",
      },
      phone: {
        filterOps: ["eq"],
        editors: ["text", "textarea", "markdown", "href", "slug", "color", "icon", "media"],
        defaultEditor: "text",
        defaultCommit: "field-commit",
      },
      inquiryType: {
        filterOps: ["eq"],
        editors: ["text", "textarea", "markdown", "href", "slug", "color", "icon", "media"],
        defaultEditor: "text",
        defaultCommit: "field-commit",
      },
      done: {
        filterOps: ["eq"],
        editors: ["boolean"],
        defaultEditor: "boolean",
        defaultCommit: "immediate",
      },
      dueDate: {
        filterOps: ["eq", "before"],
        editors: ["date"],
        defaultEditor: "date",
        defaultCommit: "field-commit",
      },
      estimate: {
        filterOps: ["eq"],
        editors: ["number"],
        defaultEditor: "number",
        defaultCommit: "field-commit",
      },
      priority: {
        filterOps: ["eq"],
        editors: ["enum"],
        defaultEditor: "enum",
        defaultCommit: "immediate",
      },
      resource: {
        filterOps: ["eq"],
        editors: ["reference"],
        defaultEditor: "reference",
        defaultCommit: "immediate",
      },
    });
  });

  it("centralizes built-in create defaults", () => {
    expect(fieldHasCreateDefault(fields.done)).toBe(true);
    expect(fieldCreateDefaultValue(fields.done)).toBe(false);
    expect(fieldHasCreateDefault(fields.estimate)).toBe(true);
    expect(fieldCreateDefaultValue(fields.estimate)).toBe(0);
    expect(fieldHasCreateDefault(fields.priority)).toBe(true);
    expect(fieldCreateDefaultValue(fields.priority)).toBe("normal");
    expect(fieldHasCreateDefault(fields.title)).toBe(false);
    expect(fieldHasCreateDefault(fields.resource)).toBe(false);
  });

  it("formats display primitives without React", () => {
    expect(formatFieldDisplayPrimitive(fields.title, "Task")).toBe("Task");
    expect(formatFieldDisplayPrimitive(fields.icon, '<svg viewBox="0 0 24 24"></svg>')).toBe(
      '<svg viewBox="0 0 24 24"></svg>',
    );
    expect(formatFieldDisplayPrimitive(fields.done, true)).toBe("Yes");
    expect(formatFieldDisplayPrimitive(fields.done, false)).toBe("No");
    expect(formatFieldDisplayPrimitive(fields.estimate, 1.5)).toBe("1.5");
    expect(formatFieldDisplayPrimitive(fields.estimate, 1.5, { format: "number" })).toBe("1.5");
    expect(formatFieldDisplayPrimitive(fields.estimate, 1.5, { format: "currency" })).toBe("$1.50");
    expect(formatFieldDisplayPrimitive(fields.estimate, 0.125, { format: "percent" })).toBe(
      "12.5%",
    );
    expect(formatFieldDisplayPrimitive(fields.priority, "high")).toBe("High");
    expect(formatFieldDisplayPrimitive(fields.priority, "stale")).toBe("stale");
    expect(formatFieldDisplayPrimitive(fields.resource, "rec_resource_1")).toBe("rec_resource_1");
  });

  it("centralizes scalar input conversion without React", () => {
    expect(fieldValueToInputValue(fields.title, "Task")).toBe("Task");
    expect(fieldValueToInputValue(fields.icon, '<svg viewBox="0 0 24 24"></svg>')).toBe(
      '<svg viewBox="0 0 24 24"></svg>',
    );
    expect(fieldValueToInputValue(fields.estimate, 1.5)).toBe("1.5");
    expect(fieldValueToInputValue(fields.done, true)).toBe("");
    expect(fieldValueToInputValue(fields.title, undefined)).toBe("");
    expect(inputValueToFieldValue(fields.title, "Task")).toBe("Task");
    expect(inputValueToFieldValue(fields.icon, '<svg viewBox="0 0 24 24"></svg>')).toBe(
      '<svg viewBox="0 0 24 24"></svg>',
    );
    expect(inputValueToFieldValue(fields.dueDate, "2026-05-06")).toBe("2026-05-06");
    expect(createInputValueToFieldValue(fields.dueDate, "May 06, 2026", true)).toBe("May 06, 2026");
    expect(inputValueToFieldValue(fields.estimate, "")).toBe("");
    expect(inputValueToFieldValue(fields.estimate, "1.5")).toBe(1.5);
    expect(inputValueToFieldValue(fields.estimate, "1.2k")).toBe(1200);
    expect(inputValueToFieldValue(fields.priority, "high")).toBe("high");
    expect(inputValueToFieldValue(fields.resource, "rec_resource_1")).toBe("rec_resource_1");
    expect(createInputValueToFieldValue(fields.done, undefined, false)).toBe(false);
    expect(createInputValueToFieldValue(fields.done, "on", true)).toBe(true);
    expect(createInputValueToFieldValue(fields.estimate, "", true)).toBe("");
    expect(createInputValueToFieldValue(fields.estimate, "1.5", true)).toBe(1.5);
    expect(createInputValueToFieldValue(fields.estimate, "1.2k", true)).toBe(1200);
    expect(createInputValueToFieldValue(fields.title, undefined, false)).toBe("");
    expect(numberInputValueToFieldValue("0")).toBe(0);
    expect(numberInputValueToFieldValue("1.2k")).toBe(1200);
    expect(numberInputValueToFieldValue("1.5m")).toBe(1500000);
    expect(Number.isNaN(numberInputValueToFieldValue("not numeric"))).toBe(true);
  });

  it("centralizes generated editor control metadata without React", () => {
    expect(fieldSupportsEditor(fields.title, "text")).toBe(true);
    expect(fieldSupportsEditor(fields.title, "markdown")).toBe(true);
    expect(fieldSupportsEditor(fields.title, "media")).toBe(true);
    expect(fieldSupportsEditor(fields.estimate, "text")).toBe(false);
    expect(fieldSupportsEditor(fields.estimate, "number")).toBe(true);
    expect(fieldEditorControl(fields.title, "text")).toEqual({ kind: "input", inputType: "text" });
    expect(fieldEditorControl(fields.title, "markdown")).toEqual({ kind: "textarea" });
    expect(fieldEditorControl(fields.icon, "icon")).toEqual({ kind: "icon" });
    expect(fieldEditorControl(fields.title, "media")).toEqual({ kind: "mediaUpload" });
    expect(fieldEditorControl(fields.done, "boolean")).toEqual({ kind: "checkbox" });
    expect(fieldEditorControl(fields.dueDate, "date")).toEqual({
      kind: "input",
      inputType: "date",
    });
    expect(fieldEditorControl(fields.estimate, "number")).toEqual({
      kind: "formattedNumber",
    });
    expect(fieldEditorControl(fields.priority, "enum")).toEqual({ kind: "select" });
    expect(fieldEditorControl(fields.resource, "reference")).toEqual({ kind: "reference" });
    expect(() => fieldEditorControl(fields.estimate, "text")).toThrow(
      'Editor "text" is not valid for field type "number".',
    );
  });

  it("centralizes scalar input attributes without React", () => {
    expect(fieldInputAttributes(fields.estimate)).toEqual({
      max: undefined,
      min: 0,
      step: "1",
    });
    expect(fieldInputAttributes({ type: "number", required: false })).toEqual({
      max: undefined,
      min: undefined,
      step: "any",
    });
    expect(fieldInputAttributes(fields.title)).toEqual({});
  });

  it("validates authority values while preserving current empty and default semantics", () => {
    expect(validateAuthorityFieldValue("done", fields.done, undefined, false)).toEqual({
      kind: "set",
      value: false,
    });
    expect(validateAuthorityFieldValue("estimate", fields.estimate, "", true)).toEqual({
      kind: "omit",
    });
    expect(validateAuthorityFieldValue("estimate", fields.estimate, 0, true)).toEqual({
      kind: "set",
      value: 0,
    });
    expect(validateAuthorityFieldValue("dueDate", fields.dueDate, "2026-05-06", true)).toEqual({
      kind: "set",
      value: "2026-05-06",
    });
    expect(validateAuthorityFieldValue("dueDate", fields.dueDate, "", true)).toEqual({
      kind: "omit",
    });
    expect(validateAuthorityFieldValue("priority", fields.priority, "", true)).toEqual({
      kind: "omit",
    });
    expect(
      validateAuthorityFieldValue("resource", fields.resource, "rec_resource_1", true),
    ).toEqual({
      kind: "set",
      value: "rec_resource_1",
    });
    expect(validateAuthorityFieldValue("body", fields.body, "## Heading\n\nBody", true)).toEqual({
      kind: "set",
      value: "## Heading\n\nBody",
    });
    expect(validateAuthorityFieldValue("icon", fields.icon, "<svg></svg>", true)).toEqual({
      kind: "set",
      value: "<svg></svg>",
    });
    expect(
      validateAuthorityFieldValue("iconFallback", fields.iconFallback, "catalog-key", true),
    ).toEqual({
      kind: "set",
      value: "catalog-key",
    });
    expect(
      validateAuthorityFieldValue("iconFallback", fields.iconFallback, "<svg></svg>", true),
    ).toEqual({
      kind: "set",
      value: "<svg></svg>",
    });
    expect(validateAuthorityFieldValue("iconId", fields.iconId, "missing-key", true)).toEqual({
      kind: "set",
      value: "missing-key",
    });
    expect(
      validateAuthorityFieldValue("email", fields.email, "  name@example.com  ", true),
    ).toEqual({
      kind: "set",
      value: "name@example.com",
    });
    expect(validateAuthorityFieldValue("phone", fields.phone, "", true)).toEqual({
      kind: "omit",
    });
    expect(validateAuthorityFieldValue("phone", fields.phone, " +1 (555) 123-4567 ", true)).toEqual(
      {
        kind: "set",
        value: "+1 (555) 123-4567",
      },
    );
    expect(validateAuthorityFieldValue("inquiryType", fields.inquiryType, "Custom", true)).toEqual({
      kind: "set",
      value: "Custom",
    });

    expect(() => validateAuthorityFieldValue("estimate", fields.estimate, Infinity, true)).toThrow(
      'Field "estimate" must be a finite number.',
    );
    expect(() => validateAuthorityFieldValue("estimate", fields.estimate, NaN, true)).toThrow(
      'Field "estimate" must be a finite number.',
    );
    expect(() =>
      validateAuthorityFieldValue("dueDate", fields.dueDate, "May 06, 2026", true),
    ).toThrow('Field "dueDate" must be a YYYY-MM-DD date.');
    expect(() => validateAuthorityFieldValue("priority", fields.priority, "missing", true)).toThrow(
      'Field "priority" must be a known enum value.',
    );
    expect(() => validateAuthorityFieldValue("resource", fields.resource, 1, true)).toThrow(
      'Field "resource" must be a reference ID.',
    );
    expect(() => validateAuthorityFieldValue("email", fields.email, "not an email", true)).toThrow(
      TEXT_EMAIL_FORMAT_INVALID_MESSAGE,
    );
    expect(() => validateAuthorityFieldValue("phone", fields.phone, "555-abc", true)).toThrow(
      TEXT_PHONE_FORMAT_INVALID_MESSAGE,
    );
    expect(validateAuthorityFieldValue("icon", fields.icon, "custom source", true)).toEqual({
      kind: "set",
      value: "custom source",
    });
    expect(() =>
      validateAuthorityFieldValue(
        "iconFallback",
        fields.iconFallback,
        "<svg><script>unsafe</script></svg>",
        true,
      ),
    ).toThrow("Enter an icon id instead of SVG source.");
    expect(() => validateAuthorityFieldValue("iconId", fields.iconId, "<svg></svg>", true)).toThrow(
      "Enter an icon id instead of SVG source.",
    );
  });

  it("validates stored values for schema compatibility checks", () => {
    expect(shouldValidateExistingFieldValue(fields.dueDate)).toBe(false);
    expect(shouldValidateExistingFieldValue(fields.estimate)).toBe(true);
    expect(shouldValidateExistingFieldValue(fields.resource)).toBe(true);
    expect(shouldValidateExistingFieldValue(fields.email)).toBe(true);
    expect(shouldValidateExistingFieldValue(fields.phone)).toBe(true);
    expect(shouldValidateExistingFieldValue(fields.icon)).toBe(false);
    expect(shouldValidateExistingFieldValue(fields.iconFallback)).toBe(true);
    expect(shouldValidateExistingFieldValue(fields.iconId)).toBe(true);
    expect(shouldValidateExistingFieldValue(fields.inquiryType)).toBe(false);
    expect(isValidStoredFieldValue(undefined, fields.done)).toBe(true);
    expect(isValidStoredFieldValue(undefined, fields.title)).toBe(false);
    expect(isValidStoredFieldValue(undefined, fields.email)).toBe(true);
    expect(isValidStoredFieldValue(0, fields.estimate)).toBe(true);
    expect(isValidStoredFieldValue(1.5, fields.estimate)).toBe(false);
    expect(isValidStoredFieldValue("high", fields.priority)).toBe(true);
    expect(isValidStoredFieldValue("", fields.resource)).toBe(false);
    expect(isValidStoredFieldValue("name@example.com", fields.email)).toBe(true);
    expect(isValidStoredFieldValue(" name@example.com ", fields.email)).toBe(false);
    expect(isValidStoredFieldValue("name@example", fields.email)).toBe(false);
    expect(isValidStoredFieldValue("+1 (555) 123-4567", fields.phone)).toBe(true);
    expect(isValidStoredFieldValue("", fields.phone)).toBe(false);
    expect(isValidStoredFieldValue("anything custom", fields.inquiryType)).toBe(true);
    expect(isValidStoredFieldValue("<svg></svg>", fields.icon)).toBe(true);
    expect(isValidStoredFieldValue("custom source", fields.icon)).toBe(true);
    expect(isValidStoredFieldValue("<svg></svg>", fields.iconFallback)).toBe(true);
    expect(isValidStoredFieldValue("catalog-key", fields.iconFallback)).toBe(true);
    expect(isValidStoredFieldValue("missing-key", fields.iconId)).toBe(true);
    expect(isValidStoredFieldValue("<svg></svg>", fields.iconId)).toBe(false);
  });
});

const fields = {
  title: { type: "text", required: true },
  body: { type: "text", required: false, format: "markdown" },
  icon: { type: "text", required: false, format: "icon" },
  iconFallback: {
    type: "text",
    required: false,
    format: "icon",
    icon: { valueMode: "iconIdWithSvgFallback" },
  },
  iconId: {
    type: "text",
    required: false,
    format: "icon",
    icon: { valueMode: "iconId" },
  },
  email: { type: "text", required: false, format: "email" },
  phone: { type: "text", required: false, format: "phone" },
  inquiryType: { type: "text", required: false, suggestions: ["Support", "Sales"] },
  done: { type: "boolean", required: true, default: false },
  dueDate: { type: "date", required: false },
  estimate: { type: "number", required: false, default: 0, min: 0, integer: true },
  priority: {
    type: "enum",
    required: false,
    default: "normal",
    values: [
      { key: "normal", label: "Normal" },
      { key: "high", label: "High" },
    ],
  },
  resource: { type: "reference", required: true, to: "resource", displayField: "name" },
} satisfies Record<string, FieldSchema>;
