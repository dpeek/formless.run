import { describe, expect, it } from "vite-plus/test";
import type { FieldSchema } from "@dpeek/formless-schema";
import { selectGeneratedFieldControl } from "./field-controls.ts";

describe("generated field controls", () => {
  it("exposes field behavior facts for generated create and inline editors", () => {
    expect(
      Object.fromEntries(
        textEditors.map((editor) => [
          editor,
          selectGeneratedFieldControl({
            editor,
            field: fields.title,
            label: labels.title,
          }).control,
        ]),
      ),
    ).toEqual({
      text: { kind: "input", inputType: "text" },
      textarea: { kind: "textarea" },
      markdown: { kind: "textarea" },
      href: { kind: "input", inputType: "text" },
      slug: { kind: "input", inputType: "text" },
      color: { kind: "input", inputType: "text" },
      icon: { kind: "icon" },
      media: { kind: "mediaUpload" },
    });
    expect(
      selectGeneratedFieldControl({
        editor: "text",
        field: fields.title,
        label: labels.title,
      }),
    ).toMatchObject({
      kind: "text",
      control: { kind: "input", inputType: "text" },
      controlKind: "text",
      createDefaultChecked: false,
      createDefaultValue: undefined,
      inputAttributes: {},
      label: "Title",
      required: true,
    });
    expect(
      selectGeneratedFieldControl({
        editor: "markdown",
        field: fields.title,
        label: labels.title,
      }),
    ).toMatchObject({
      kind: "text",
      control: { kind: "textarea" },
      controlKind: "markdown",
    });
    expect(
      selectGeneratedFieldControl({
        editor: "icon",
        field: fields.icon,
        label: labels.icon,
      }),
    ).toMatchObject({
      kind: "text",
      editor: "icon",
      control: { kind: "icon" },
      controlKind: "icon",
      createDefaultValue: undefined,
      label: "Icon",
      required: false,
    });
    expect(
      selectGeneratedFieldControl({
        editor: "media",
        field: fields.image,
        label: labels.image,
      }),
    ).toMatchObject({
      kind: "text",
      editor: "media",
      control: { kind: "mediaUpload" },
      controlKind: "media",
      createDefaultValue: undefined,
      label: "Image",
      required: false,
    });
    expect(
      selectGeneratedFieldControl({
        editor: "date",
        field: fields.dueDate,
        label: labels.dueDate,
      }),
    ).toMatchObject({
      kind: "date",
      control: { kind: "input", inputType: "date" },
      controlKind: "date",
      createDefaultValue: undefined,
      editor: "date",
      required: false,
    });
    expect(
      selectGeneratedFieldControl({
        editor: "boolean",
        field: fields.done,
        label: labels.done,
      }),
    ).toMatchObject({
      kind: "boolean",
      control: { kind: "checkbox" },
      controlKind: "checkbox",
      createDefaultChecked: true,
      editor: "boolean",
      required: true,
    });
    expect(
      selectGeneratedFieldControl({
        editor: "number",
        field: fields.estimate,
        label: labels.estimate,
      }),
    ).toMatchObject({
      kind: "number",
      control: { kind: "formattedNumber" },
      controlKind: "number",
      createDefaultValue: "2",
      editor: "number",
      inputAttributes: { max: 10, min: 0, step: "1" },
    });
    expect(
      selectGeneratedFieldControl({
        editor: "enum",
        field: fields.priority,
        label: labels.priority,
      }),
    ).toMatchObject({
      kind: "enum",
      control: { kind: "select" },
      controlKind: "select",
      createDefaultValue: "normal",
      editor: "enum",
    });
    expect(
      selectGeneratedFieldControl({
        editor: "enum",
        field: fields.optionalPriority,
        label: labels.optionalPriority,
      }),
    ).toMatchObject({
      kind: "enum",
      control: { kind: "select" },
      controlKind: "select",
      createDefaultValue: "",
      required: false,
    });
    expect(
      selectGeneratedFieldControl({
        editor: "reference",
        field: fields.resource,
        label: labels.resource,
      }),
    ).toMatchObject({
      kind: "reference",
      control: { kind: "reference" },
      controlKind: "reference",
      createDefaultValue: undefined,
      editor: "reference",
      required: true,
    });
  });

  it("selects icon controls from text fields with icon format", () => {
    expect(
      selectGeneratedFieldControl({
        editor: "text",
        field: fields.icon,
        label: labels.icon,
      }),
    ).toMatchObject({
      kind: "text",
      editor: "text",
      control: { kind: "input", inputType: "text" },
      controlKind: "icon",
    });
  });
});

const fields = {
  title: { type: "text", required: true },
  body: { type: "text", required: false },
  icon: { type: "text", required: false, format: "icon" },
  image: { type: "text", required: false, format: "href" },
  color: { type: "text", required: false },
  done: { type: "boolean", required: true, default: true },
  dueDate: { type: "date", required: false },
  estimate: { type: "number", required: false, default: 2, min: 0, max: 10, integer: true },
  priority: {
    type: "enum",
    required: false,
    default: "normal",
    values: [
      { key: "normal", label: "Normal" },
      { key: "high", label: "High" },
    ],
  },
  optionalPriority: {
    type: "enum",
    required: false,
    values: [
      { key: "low", label: "Low" },
      { key: "high", label: "High" },
    ],
  },
  resource: { type: "reference", required: true, to: "resource", displayField: "name" },
} satisfies Record<string, FieldSchema>;

const textEditors = [
  "text",
  "textarea",
  "markdown",
  "href",
  "slug",
  "color",
  "icon",
  "media",
] as const;

const labels = {
  title: "Title",
  body: "Body",
  icon: "Icon",
  image: "Image",
  color: "Color",
  done: "Done",
  dueDate: "Due date",
  estimate: "Estimate",
  priority: "Priority",
  optionalPriority: "Optional priority",
  resource: "Resource",
} satisfies Record<keyof typeof fields, string>;
