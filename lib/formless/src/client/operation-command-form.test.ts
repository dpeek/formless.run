import { describe, expect, it } from "vite-plus/test";
import {
  initialGeneratedCommandDraftSessionState,
  markGeneratedCommandDraftSessionSubmitted,
  nextGeneratedCommandDraftSessionState,
  selectGeneratedCommandDraftSession,
} from "./operation-command-form.ts";
import type { GeneratedCommandInputForm } from "./operation-control-model.ts";

describe("generated command form", () => {
  it("defers required input errors until submit and resolves valid operation input", () => {
    const form = commandForm();
    const initial = initialGeneratedCommandDraftSessionState(form);

    expect(selectGeneratedCommandDraftSession({ form, state: initial })).toMatchObject({
      canSubmit: true,
      fieldErrors: {},
      input: {},
      valid: false,
    });

    const submitted = markGeneratedCommandDraftSessionSubmitted(initial);
    expect(selectGeneratedCommandDraftSession({ form, state: submitted })).toMatchObject({
      canSubmit: false,
      fieldErrors: {
        assayRole: { message: 'Field "assayRole" cannot be empty.' },
      },
      input: {},
      valid: false,
    });

    const selected = nextGeneratedCommandDraftSessionState({
      inputName: "assayRole",
      inputValue: { kind: "input", value: "sterility" },
      state: submitted,
    });
    expect(selectGeneratedCommandDraftSession({ form, state: selected })).toMatchObject({
      canSubmit: true,
      fieldErrors: {},
      input: { assayRole: "sterility" },
      valid: true,
    });
    expect(selected.submitAttempted).toBe(true);
  });

  it("uses declared field format validation and rejects unknown enum values", () => {
    const form = commandForm();
    const invalid = {
      draft: {
        values: {
          assayRole: { kind: "input" as const, value: "unknown" },
          email: { kind: "input" as const, value: "not-an-email" },
        },
      },
      submitAttempted: false,
    };

    expect(selectGeneratedCommandDraftSession({ form, state: invalid })).toMatchObject({
      canSubmit: false,
      fieldErrors: {
        assayRole: { message: 'Field "assayRole" must be a known enum value.' },
        email: { message: "Enter an email address like name@example.com." },
      },
      input: {},
      valid: false,
    });
  });

  it("enforces mustBeTrue command input", () => {
    const form = {
      fields: [
        {
          editor: "boolean" as const,
          field: { label: "Accept", required: true, type: "boolean" as const },
          fieldName: "accepted",
          inputName: "accepted",
          label: "Accept",
          mustBeTrue: true as const,
        },
      ],
    };
    const initial = initialGeneratedCommandDraftSessionState(form);

    expect(selectGeneratedCommandDraftSession({ form, state: initial })).toMatchObject({
      canSubmit: false,
      fieldErrors: {
        accepted: { message: 'Field "accepted" must be accepted.' },
      },
      valid: false,
    });

    expect(
      selectGeneratedCommandDraftSession({
        form,
        state: nextGeneratedCommandDraftSessionState({
          inputName: "accepted",
          inputValue: { kind: "value", value: true },
          state: initial,
        }),
      }),
    ).toMatchObject({ canSubmit: true, fieldErrors: {}, input: { accepted: true }, valid: true });
  });
});

function commandForm(): GeneratedCommandInputForm {
  return {
    fields: [
      {
        editor: "enum",
        field: {
          type: "enum",
          required: true,
          label: "Assay",
          values: [
            { key: "sterility", label: "Sterility" },
            { key: "analytical", label: "Analytical" },
          ],
        },
        fieldName: "assayRole",
        inputName: "assayRole",
        label: "Assay",
      },
      {
        editor: "text",
        entityFieldName: "operatorEmail",
        field: {
          type: "text",
          required: false,
          label: "Operator email",
          format: "email",
        },
        fieldName: "email",
        inputName: "email",
        label: "Operator email",
      },
    ],
  };
}
