// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import type { FieldSchema } from "@dpeek/formless-schema";
import type {
  ButtonContract,
  CreateSurfaceContract,
  FieldAccess,
  FieldIntent,
  RecordFieldContract,
} from "@dpeek/formless-presentation/contract";
import { AstryxCreateSurfaceRenderer } from "../create-renderer.tsx";
import { FieldRenderer } from "./field-renderer.tsx";
import {
  createField,
  fieldError,
  recordDrafts,
  recordField,
  textControl,
} from "./fixture-helpers.ts";

const suggestions = ["Research", "Delivery"] as const;

afterEach(cleanup);

describe("suggested text fields", () => {
  it("disables autofill only for existing-record email fields", () => {
    const renderer = render(<FieldRenderer field={emailRecordField()} />);
    const recordEmail = renderer.getByRole("textbox", { name: /^Email/ });

    expect(recordEmail.getAttribute("autocomplete")).toBe("off");
    expect(recordEmail.getAttribute("data-1p-ignore")).toBe("true");

    renderer.rerender(<FieldRenderer field={emailCreateField()} />);

    expect(renderer.getByRole("textbox", { name: /^Email/ }).hasAttribute("autocomplete")).toBe(
      false,
    );
    expect(renderer.getByRole("textbox", { name: /^Email/ }).hasAttribute("data-1p-ignore")).toBe(
      false,
    );
  });

  it("uses open Typeahead chrome only for suggested text", () => {
    const renderer = render(
      <FieldRenderer
        field={suggestedRecordField({
          errors: [fieldError("title", "Choose a useful title.", "Custom wording")],
          pending: true,
          required: true,
          value: "Custom wording",
        })}
      />,
    );
    const combobox = renderer.getByRole("combobox", { name: /^Title/ }) as HTMLInputElement;

    expect(renderer.getByText("Custom wording")).toBeTruthy();
    expect(renderer.getByText(/Required/)).toBeTruthy();
    expect(renderer.getByText("Choose a useful title.")).toBeTruthy();
    expect(combobox.disabled).toBe(true);
    expect(combobox.closest('[aria-busy="true"]')).not.toBeNull();

    renderer.rerender(
      <FieldRenderer
        field={suggestedRecordField({
          access: {
            canPatch: false,
            disabledReason: "Title editing is unavailable.",
            kind: "disabled",
            writable: true,
          },
          value: "Research",
        })}
      />,
    );

    expect((renderer.getByRole("combobox", { name: /^Title/ }) as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(renderer.getByText("Title editing is unavailable.")).toBeTruthy();

    renderer.rerender(<FieldRenderer field={ordinaryRecordField("Ordinary text")} />);

    expect(renderer.queryByRole("combobox")).toBeNull();
    expect((renderer.getByRole("textbox", { name: /^Title/ }) as HTMLInputElement).value).toBe(
      "Ordinary text",
    );
    expect(renderer.container.querySelector("datalist")).toBeNull();
  });

  it("dispatches ordered selection, optional clearing, and controlled draft intents", async () => {
    const intents: FieldIntent[] = [];
    const renderer = render(
      <FieldRenderer
        field={suggestedRecordField({ value: "" })}
        onIntent={(intent) => {
          intents.push(intent);
        }}
      />,
    );
    const combobox = renderer.getByRole("combobox", { name: /^Title/ }) as HTMLInputElement;

    fireEvent.focus(combobox);
    await waitFor(() => expect(combobox.getAttribute("aria-expanded")).toBe("true"));
    const options = within(renderer.getByRole("listbox", { hidden: true })).getAllByRole("option", {
      hidden: true,
    });
    expect(options.map((option) => option.textContent)).toEqual(suggestions);

    fireEvent.keyDown(combobox, { key: "Enter" });
    expect(intents).toEqual([
      { fieldName: "title", type: "recordEditorDraftChange", value: "Research" },
    ]);
    expect(intents).not.toContainEqual(expect.objectContaining({ type: "recordValueCommit" }));

    renderer.rerender(
      <FieldRenderer
        field={suggestedRecordField({ value: "Research" })}
        onIntent={(intent) => {
          intents.push(intent);
        }}
      />,
    );
    fireEvent.click(renderer.getByRole("button", { name: "Clear selection" }));

    expect(intents.at(-1)).toEqual({
      fieldName: "title",
      type: "recordEditorDraftChange",
      value: "",
    });
  });

  it("commits arbitrary text on genuine blur and Enter while preserving list focus and Escape", async () => {
    const intents: FieldIntent[] = [];
    const renderer = render(
      <>
        <FieldRenderer
          field={suggestedRecordField({ value: "" })}
          onIntent={(intent) => {
            intents.push(intent);
          }}
        />
        <button type="button">Outside</button>
      </>,
    );
    const combobox = renderer.getByRole("combobox", { name: /^Title/ }) as HTMLInputElement;
    const outside = renderer.getByRole("button", { name: "Outside" });

    fireEvent.change(combobox, { target: { value: "Original wording" } });
    fireEvent.blur(combobox, { relatedTarget: outside });
    expect(intents).toEqual([
      {
        fieldName: "title",
        type: "recordEditorDraftChange",
        value: "Original wording",
      },
      { fieldName: "title", type: "recordValueCommit", value: "Original wording" },
    ]);

    intents.length = 0;
    fireEvent.change(combobox, { target: { value: "Bespoke" } });
    await waitFor(() => expect(combobox.getAttribute("aria-expanded")).toBe("true"));
    fireEvent.keyDown(combobox, { key: "Enter" });
    expect(intents).toEqual([
      { fieldName: "title", type: "recordEditorDraftChange", value: "Bespoke" },
      { fieldName: "title", type: "recordValueCommit", value: "Bespoke" },
    ]);

    intents.length = 0;
    fireEvent.change(combobox, { target: { value: "Res" } });
    await waitFor(() => expect(combobox.hasAttribute("aria-activedescendant")).toBe(true));
    const option = renderer.getByRole("option", { name: "Research", hidden: true });
    fireEvent.blur(combobox, { relatedTarget: option });
    expect(intents).toEqual([
      { fieldName: "title", type: "recordEditorDraftChange", value: "Res" },
    ]);

    fireEvent.keyDown(combobox, { key: "Escape" });
    expect(intents).not.toContainEqual(expect.objectContaining({ type: "recordDraftRevert" }));
    await waitFor(() => expect(combobox.getAttribute("aria-expanded")).toBe("false"));
    fireEvent.keyDown(combobox, { key: "Escape" });
    expect(intents.at(-1)).toEqual({ fieldName: "title", type: "recordDraftRevert" });
  });

  it("renders and dispatches suggested generated create fields through the create surface", async () => {
    const intents: Array<{ fieldId: string; intent: FieldIntent }> = [];
    const surface = suggestedCreateSurface();
    const field = surface.dialog.form.fieldSet.fields[0]!;
    const renderer = render(
      <AstryxCreateSurfaceRenderer
        onFieldIntent={(fieldId, intent) => {
          intents.push({ fieldId, intent });
        }}
        onIntent={() => undefined}
        surface={surface}
      />,
    );
    const combobox = renderer.getByRole("combobox", { name: /^Title/ }) as HTMLInputElement;

    fireEvent.focus(combobox);
    await waitFor(() => expect(combobox.hasAttribute("aria-activedescendant")).toBe(true));
    fireEvent.keyDown(combobox, { key: "Enter" });

    expect(intents).toEqual([
      {
        fieldId: field.fieldId,
        intent: {
          fieldName: "title",
          fieldValue: { kind: "input", value: "Research" },
          type: "createDraftChange",
        },
      },
    ]);
  });
});

function suggestedRecordField({
  access,
  errors,
  pending = false,
  required = false,
  value,
}: {
  access?: FieldAccess;
  errors?: RecordFieldContract["errors"];
  pending?: boolean;
  required?: boolean;
  value: string;
}) {
  const field = titleSchema(required);
  const control = textControl(field);

  return recordField({
    access,
    commit: "field-commit",
    control,
    drafts: recordDrafts({ recordValue: value }),
    editor: control.editor,
    errors,
    field,
    fieldName: "title",
    labelVisibility: "visible",
    occurrence: { ownerId: "suggested-record", placementId: "title" },
    options: { textSuggestions: suggestions },
    pending: pending ? { isPending: true, label: "Saving title" } : undefined,
    recordId: "record-1",
    rendererKind: "text",
  });
}

function ordinaryRecordField(value: string) {
  const field = titleSchema(false);
  const control = textControl(field);

  return recordField({
    commit: "field-commit",
    control,
    drafts: recordDrafts({ recordValue: value }),
    editor: control.editor,
    field,
    fieldName: "title",
    labelVisibility: "visible",
    occurrence: { ownerId: "ordinary-record", placementId: "title" },
    recordId: "record-1",
    rendererKind: "text",
  });
}

function emailRecordField() {
  const field = emailSchema();
  const control = textControl(field);

  return recordField({
    commit: "field-commit",
    control,
    drafts: recordDrafts({ recordValue: "ada@example.com" }),
    editor: control.editor,
    field,
    fieldName: "email",
    labelVisibility: "visible",
    occurrence: { ownerId: "contact-record", placementId: "email" },
    recordId: "contact-1",
    rendererKind: "text",
  });
}

function emailCreateField() {
  const field = emailSchema();
  const control = textControl(field);

  return createField({
    control,
    draftInput: { kind: "input", value: "ada@example.com" },
    editor: control.editor,
    field,
    fieldName: "email",
    labelVisibility: "visible",
    occurrence: { ownerId: "create-contact", placementId: "email" },
    value: "ada@example.com",
  });
}

function suggestedCreateSurface(): CreateSurfaceContract {
  const field = titleSchema(false);
  const control = textControl(field);
  const createTitle = createField({
    control,
    draftInput: { kind: "input", value: "" },
    editor: control.editor,
    field,
    fieldName: "title",
    labelVisibility: "visible",
    occurrence: { ownerId: "create-task", placementId: "title" },
    options: { textSuggestions: suggestions },
    value: "",
  });

  return {
    dialog: {
      form: {
        cancel: button("create-task:cancel", "Cancel"),
        errors: [],
        fieldSet: {
          disabled: false,
          fields: [createTitle],
          id: "create-task:fields",
          kind: "fieldSet",
        },
        id: "create-task:form",
        kind: "createForm",
        submit: button("create-task:submit", "Create task", "submit"),
      },
      id: "create-task:dialog",
      kind: "createDialog",
      open: true,
      title: "Create task",
    },
    id: "create-task",
    kind: "createSurface",
    trigger: button("create-task:trigger", "Create task"),
  };
}

function titleSchema(required: boolean) {
  return {
    label: "Title",
    required,
    type: "text",
  } satisfies Extract<FieldSchema, { type: "text" }>;
}

function emailSchema() {
  return {
    format: "email",
    label: "Email",
    required: true,
    type: "text",
  } satisfies Extract<FieldSchema, { type: "text" }>;
}

function button(id: string, label: string, type: ButtonContract["type"] = "button") {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "compact",
    id,
    kind: "button",
    prominence: "secondary",
    type,
  } satisfies ButtonContract;
}
