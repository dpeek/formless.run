import { describe, expect, it } from "vite-plus/test";
import type { CreateFieldConfig } from "../../client/views.ts";
import {
  initialGeneratedCreateDraftSessionState,
  markGeneratedCreateDraftSessionSubmitted,
  nextGeneratedCreateDraftSessionState,
  selectGeneratedCreateDraftSession,
} from "./create-field-authoring.ts";
import { executeGeneratedCreateSubmission } from "./generated-create-runtime.ts";
import { projectGeneratedCreateSurface } from "./field-projection.ts";
import {
  indexGeneratedCreateSurfaceFields,
  resolveGeneratedCreateFieldIntent,
} from "./generated-create-field-index.ts";

const fields = [
  {
    editor: "text",
    field: { label: "Title", required: true, type: "text" },
    fieldName: "title",
  },
] satisfies CreateFieldConfig[];

describe("generated create surface submission", () => {
  it("indexes exact create occurrences and rejects duplicate, stale, and mismatched identity", () => {
    const state = initialGeneratedCreateDraftSessionState({ fields });
    const session = selectGeneratedCreateDraftSession({ enabled: true, fields, state });
    const surface = projectGeneratedCreateSurface({
      enabled: true,
      entityLabel: "Task",
      id: "create:task",
      isSubmitting: false,
      open: true,
      referenceOptionsByFieldName: {},
      session,
      state,
      submitLabel: "Create task",
      trigger: {
        content: { kind: "label", label: "Create task" },
        density: "default",
        prominence: "primary",
      },
      triggerLabel: "Create task",
    });
    const field = surface.dialog.form.fieldSet.fields[0]!;
    const intent = {
      fieldName: field.fieldName,
      fieldValue: { kind: "input", value: "Prepare launch" },
      type: "createDraftChange",
    } as const;
    const index = indexGeneratedCreateSurfaceFields(surface);

    expect(resolveGeneratedCreateFieldIntent(index, field.fieldId, intent)).toBe(field);
    expect(
      resolveGeneratedCreateFieldIntent(index, `${field.fieldId}:stale`, intent),
    ).toBeUndefined();
    expect(
      resolveGeneratedCreateFieldIntent(index, field.fieldId, {
        ...intent,
        fieldName: "other",
      }),
    ).toBeUndefined();
    expect(() =>
      indexGeneratedCreateSurfaceFields({
        ...surface,
        dialog: {
          ...surface.dialog,
          form: {
            ...surface.dialog.form,
            fieldSet: { ...surface.dialog.form.fieldSet, fields: [field, { ...field }] },
          },
        },
      }),
    ).toThrow(`duplicate field occurrence "${field.fieldId}"`);
  });

  it("returns the created record id and resets the controlled draft after success", async () => {
    const resetState = initialGeneratedCreateDraftSessionState({ fields });
    const state = markGeneratedCreateDraftSessionSubmitted(
      nextGeneratedCreateDraftSessionState({
        fieldName: "title",
        fieldValue: { kind: "input", value: "Prepare launch" },
        state: resetState,
      }),
    );
    const session = selectGeneratedCreateDraftSession({ enabled: true, fields, state });
    let selectedRecordId: string | undefined;
    const result = await executeGeneratedCreateSubmission({
      resetState,
      state,
      submitValues: async (values) => {
        expect(values).toEqual({ title: "Prepare launch" });
        return { recordId: "task-42" };
      },
      values: session.values,
    });

    if (result.type === "created") {
      selectedRecordId = result.recordId;
    }

    expect(selectedRecordId).toBe("task-42");
    expect(result.state).toEqual(resetState);
  });

  it("retains the submitted draft when create execution fails", async () => {
    const resetState = initialGeneratedCreateDraftSessionState({ fields });
    const state = markGeneratedCreateDraftSessionSubmitted(
      nextGeneratedCreateDraftSessionState({
        fieldName: "title",
        fieldValue: { kind: "input", value: "Retry this" },
        state: resetState,
      }),
    );
    const session = selectGeneratedCreateDraftSession({ enabled: true, fields, state });
    const result = await executeGeneratedCreateSubmission({
      resetState,
      state,
      submitValues: async () => {
        throw new Error("storage diagnostic alchemy-secret-value");
      },
      values: session.values,
    });

    expect(result).toMatchObject({
      code: "submission-failed",
      state: {
        draft: { values: { title: { kind: "input", value: "Retry this" } } },
        submitAttempted: true,
      },
      type: "failed",
    });
    expect(result.state).toBe(state);
    expect(JSON.stringify(result)).not.toContain("alchemy-secret-value");
  });
});
