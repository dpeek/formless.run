import { describe, expect, it } from "vite-plus/test";
import {
  createGeneratedTableEditContextState,
  rebaseGeneratedTableEditContextState,
  type GeneratedTableEditContext,
} from "./generated-table-foundation.tsx";
import { mergeGeneratedWorkspaceRecordFieldState } from "./generated-workspace-field-state.ts";

describe("generated workspace field state", () => {
  it("preserves a queued draft when a same-interaction commit has no local state change", () => {
    const baseline = { draft: "low", pending: false };
    const queuedDraft = { draft: "high", pending: false };

    expect(mergeGeneratedWorkspaceRecordFieldState(queuedDraft, baseline, baseline)).toBe(
      queuedDraft,
    );
  });

  it("applies a field intent that changes local authoring state", () => {
    const baseline = { draft: "low", pending: false };
    const applied = { draft: "high", pending: false };

    expect(mergeGeneratedWorkspaceRecordFieldState(baseline, baseline, applied)).toBe(applied);
  });

  it("rebases stale table authoring state from the latest replica record", () => {
    const original = taskContext("2026-07-15T00:00:00.000Z", false);
    const stale = createGeneratedTableEditContextState(original);
    const updated = taskContext("2026-07-16T00:00:00.000Z", true);
    const rebased = rebaseGeneratedTableEditContextState(updated, stale);

    expect(rebased).not.toBe(stale);
    expect(rebased.baselineUpdatedAt).toBe(updated.record.updatedAt);
    expect(rebased.session.baselineValues).toEqual(updated.record.values);
  });
});

function taskContext(updatedAt: string, done: boolean): GeneratedTableEditContext {
  return {
    entityName: "task",
    fields: [],
    id: "task:done",
    record: {
      createdAt: "2026-07-15T00:00:00.000Z",
      entity: "task",
      id: "task-1",
      updatedAt,
      values: { done },
    },
    recordId: "task-1",
  };
}
