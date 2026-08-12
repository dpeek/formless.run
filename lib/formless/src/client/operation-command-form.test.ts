import { describe, expect, it } from "vite-plus/test";
import {
  initialGeneratedCommandDraftSessionState,
  nextGeneratedCommandDraftSessionState,
  selectGeneratedCommandDraftSession,
} from "./operation-command-form.ts";
import type { GeneratedCommandInputForm } from "./operation-control-model.ts";

describe("generated command form", () => {
  it("blocks required inline enum input until a declared value is selected", () => {
    const form = commandForm();
    const initial = initialGeneratedCommandDraftSessionState(form);

    expect(selectGeneratedCommandDraftSession({ form, state: initial })).toMatchObject({
      canSubmit: false,
      fieldErrors: {
        assayRole: { message: 'Field "assayRole" cannot be empty.' },
      },
      input: {},
    });

    const selected = nextGeneratedCommandDraftSessionState({
      inputName: "assayRole",
      inputValue: { kind: "input", value: "sterility" },
      state: initial,
    });
    expect(selectGeneratedCommandDraftSession({ form, state: selected })).toMatchObject({
      canSubmit: true,
      fieldErrors: {},
      input: { assayRole: "sterility" },
    });
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
    };

    expect(selectGeneratedCommandDraftSession({ form, state: invalid })).toMatchObject({
      canSubmit: false,
      fieldErrors: {
        assayRole: { message: 'Field "assayRole" must be a known enum value.' },
        email: { message: "Enter an email address like name@example.com." },
      },
      input: {},
    });
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
