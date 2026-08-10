import { describe, expect, it } from "vite-plus/test";
import type { BrowserReplicaProjectionSnapshot } from "../../client/projections.ts";
import type { RecordFieldConfig } from "../../client/views.ts";
import { selectWorkspaceContextDetailReferenceOptions } from "./generated-workspace-runtime.tsx";

describe("generated workspace runtime", () => {
  it("provides replica reference options to list-detail context details", () => {
    const fields = [
      {
        commit: "immediate",
        editor: "reference",
        field: {
          displayField: "name",
          required: true,
          to: "intake-enquiry",
          type: "reference",
        },
        fieldName: "intakeEnquiry",
        label: "Intake enquiry",
        writable: true,
      },
    ] satisfies readonly RecordFieldConfig[];
    const snapshot = {
      recordIdsByEntity: { "intake-enquiry": ["intake-1"] },
      recordsById: {
        "intake-1": {
          createdAt: "2026-08-10T00:00:00.000Z",
          entity: "intake-enquiry",
          id: "intake-1",
          updatedAt: "2026-08-10T00:00:00.000Z",
          values: { name: "Patrick" },
        },
      },
    } satisfies BrowserReplicaProjectionSnapshot;

    expect(
      selectWorkspaceContextDetailReferenceOptions({ recordFields: fields }, snapshot),
    ).toEqual({ intakeEnquiry: [{ id: "intake-1", label: "Patrick" }] });
  });
});
