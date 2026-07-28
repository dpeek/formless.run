import { describe, expect, it } from "vite-plus/test";
import type { PublicSafeOperationInputField } from "@dpeek/formless-schema";
import {
  generatedOperationDraftInput,
  initialGeneratedOperationDraftSessionState,
  nextGeneratedOperationDraftSessionState,
  resolveGeneratedOperationDraftInput,
  selectGeneratedOperationDraftSession,
  selectGeneratedOperationInputFieldConfigs,
  type GeneratedOperationDraftFieldInput,
  type GeneratedOperationDraftSessionState,
} from "./operation-field-authoring.ts";

describe("generated operation draft session", () => {
  it("resolves controlled drafts to flat input keyed by declared operation input names", () => {
    const state = withOperationDraftValues(
      initialGeneratedOperationDraftSessionState({ fields: publicFields }),
      [
        ["acceptedTerms", generatedOperationDraftInput(false)],
        ["contactEmail", { kind: "input", value: "ada@example.com" }],
        ["message", { kind: "input", value: "" }],
        ["requestedDate", { kind: "input", value: "" }],
        ["teamSize", { kind: "input", value: "4" }],
        ["topic", { kind: "input", value: "sales" }],
      ],
    );
    const session = selectGeneratedOperationDraftSession({
      fields: publicFields,
      state,
    });

    expect(session).toMatchObject({
      canSubmit: true,
      configurationErrors: [],
      fieldErrors: {},
      input: {
        acceptedTerms: false,
        contactEmail: "ada@example.com",
        teamSize: 4,
        topic: "sales",
      },
    });
    expect(session.input).not.toHaveProperty("message");
    expect(session.input).not.toHaveProperty("requestedDate");
    expect(session.visibleFields.map((field) => field.inputName)).toEqual([
      "contactEmail",
      "message",
      "acceptedTerms",
      "requestedDate",
      "teamSize",
      "topic",
    ]);
  });

  it("surfaces required, text format, enum, date, and invalid number field errors", () => {
    const state = withOperationDraftValues(
      initialGeneratedOperationDraftSessionState({ fields: publicFields }),
      [
        ["acceptedTerms", generatedOperationDraftInput(false)],
        ["contactEmail", { kind: "input", value: "not-email" }],
        ["requestedDate", { kind: "input", value: "2026-02-31" }],
        ["teamSize", { kind: "input", value: "many" }],
        ["topic", { kind: "input", value: "enterprise" }],
      ],
    );
    const resolution = resolveGeneratedOperationDraftInput({
      draft: state.draft,
      fields: publicFields,
    });

    expect(resolution.input).toEqual({
      acceptedTerms: false,
    });
    expect(resolution.fieldErrors).toMatchObject({
      contactEmail: {
        fieldName: "contactEmail",
        message: "Enter an email address like name@example.com.",
      },
      requestedDate: {
        fieldName: "requestedDate",
        message: 'Field "requestedDate" must be a YYYY-MM-DD date.',
      },
      teamSize: {
        draftValue: { kind: "input", value: "many" },
        fieldName: "teamSize",
        message: "Enter a finite number.",
      },
      topic: {
        fieldName: "topic",
        message: 'Field "topic" must be a known enum value.',
      },
    });

    const missingRequired = selectGeneratedOperationDraftSession({
      fields: publicFields,
      state: initialGeneratedOperationDraftSessionState({ fields: publicFields }),
    });

    expect(missingRequired.canSubmit).toBe(false);
    expect(missingRequired.fieldErrors).toMatchObject({
      contactEmail: {
        fieldName: "contactEmail",
        message: 'Field "contactEmail" cannot be empty.',
      },
      topic: {
        fieldName: "topic",
        message: 'Field "topic" cannot be empty.',
      },
    });
  });

  it("keeps unsupported required inputs as configuration feedback outside request facts", () => {
    const optionalOnly = [publicInputField("notes", "Notes", "longText", false)];
    const session = selectGeneratedOperationDraftSession({
      fields: optionalOnly,
      state: initialGeneratedOperationDraftSessionState({ fields: optionalOnly }),
      unsupportedRequiredInputNames: ["attachment"],
    });

    expect(session).toEqual({
      canSubmit: false,
      configurationErrors: [
        {
          inputName: "attachment",
          message:
            'Public operation input field "attachment" is required but is not supported by generated public forms.',
        },
      ],
      fieldErrors: {},
      input: {},
      visibleFields: selectGeneratedOperationInputFieldConfigs(optionalOnly),
    });
    expect(session).not.toHaveProperty("turnstileToken");
    expect(session).not.toHaveProperty("sourceBlockId");
    expect(session).not.toHaveProperty("route");
    expect(session).not.toHaveProperty("idempotencyKey");
    expect(session).not.toHaveProperty("response");
  });

  it("projects public-safe input fields to generated field configs for editor selection", () => {
    expect(selectGeneratedOperationInputFieldConfigs(publicFields)).toMatchObject([
      {
        control: "text",
        editor: "text",
        field: { format: "email", required: true, type: "text" },
        fieldName: "contactEmail",
        inputName: "contactEmail",
      },
      {
        control: "longText",
        editor: "textarea",
        field: { format: "longText", required: false, type: "text" },
      },
      {
        control: "boolean",
        editor: "boolean",
        field: { required: true, type: "boolean" },
      },
      {
        control: "date",
        editor: "date",
        field: { required: false, type: "date" },
      },
      {
        control: "number",
        editor: "number",
        field: { required: false, type: "number" },
      },
      {
        control: "enum",
        editor: "enum",
        field: {
          required: true,
          type: "enum",
          values: [
            { key: "sales", label: "Sales" },
            { key: "support", label: "Support" },
          ],
        },
      },
    ]);
  });
});

function withOperationDraftValues(
  state: GeneratedOperationDraftSessionState,
  values: Array<[string, GeneratedOperationDraftFieldInput]>,
) {
  return values.reduce(
    (nextState, [inputName, inputValue]) =>
      nextGeneratedOperationDraftSessionState({
        inputName,
        inputValue,
        state: nextState,
      }),
    state,
  );
}

function publicInputField(
  name: string,
  label: string,
  control: PublicSafeOperationInputField["control"],
  required: boolean,
  options: Partial<PublicSafeOperationInputField> = {},
): PublicSafeOperationInputField {
  return {
    name,
    label,
    required,
    control,
    ...options,
  } as PublicSafeOperationInputField;
}

const publicFields = [
  publicInputField("contactEmail", "Email", "text", true, { format: "email" }),
  publicInputField("message", "Message", "longText", false),
  publicInputField("acceptedTerms", "Accepted terms", "boolean", true),
  publicInputField("requestedDate", "Requested date", "date", false),
  publicInputField("teamSize", "Team size", "number", false),
  publicInputField("topic", "Topic", "enum", true, {
    options: [
      { value: "sales", label: "Sales" },
      { value: "support", label: "Support" },
    ],
  }),
] satisfies PublicSafeOperationInputField[];
