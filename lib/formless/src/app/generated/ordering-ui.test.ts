import { describe, expect, it } from "vite-plus/test";

import type { EntityOperationPresentationConfig } from "../../client/operation-presentation-model.ts";
import type { ResultOrderingConfig } from "../../client/result-ordering-model.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import {
  ORDERING_DND_TYPE,
  calculateOrderingDragMovePlanForContext,
  parseOrderingDragData,
  selectOrderingDragFacts,
  selectOrderingMoveMenuItems,
  selectResultOrderingContext,
} from "./ordering-ui.ts";

describe("generated result ordering helpers", () => {
  it("builds ordered context, scoped drag facts, move items, and drag plans", () => {
    const recordsById = recordsByIdFrom([
      placementRecord("a", { parent: "page-1", order: 2000 }),
      placementRecord("b", { parent: "page-1", order: 1000 }),
      placementRecord("c", { parent: "page-2", order: 1000 }),
      placementRecord("d", { parent: "page-1", order: 3000 }),
    ]);
    const context = selectResultOrderingContext({
      entityName: "block-placement",
      ordering: placementOrdering,
      recordIds: ["a", "b", "c", "d"],
      recordsById,
      updateOperation: placementUpdateOperation,
    });

    if (!context) {
      throw new Error("Expected ordering context.");
    }

    expect(context.orderedRecordIds).toEqual(["b", "a", "d", "c"]);

    const dragFacts = selectOrderingDragFacts(context);

    expect(dragFacts?.get("b")).toMatchObject({ index: 0 });
    expect(dragFacts?.get("a")).toMatchObject({ index: 1 });
    expect(dragFacts?.get("d")).toMatchObject({ index: 2 });
    expect(dragFacts?.get("c")).toMatchObject({ index: 0 });
    expect(dragFacts?.get("b")?.scopeKey).toBe(dragFacts?.get("a")?.scopeKey);
    expect(dragFacts?.get("b")?.scopeKey).not.toBe(dragFacts?.get("c")?.scopeKey);

    expect(
      selectOrderingMoveMenuItems({
        includeOrdering: true,
        orderingContext: context,
        sourceRecordId: "a",
      }).map((item) => ({ direction: item.direction, disabled: item.disabled })),
    ).toEqual([
      { direction: "top", disabled: false },
      { direction: "up", disabled: false },
      { direction: "down", disabled: false },
      { direction: "bottom", disabled: false },
    ]);
    expect(
      calculateOrderingDragMovePlanForContext({
        orderingContext: context,
        recordId: "b",
        targetIndex: 2,
      }),
    ).toEqual({ kind: "patch", recordId: "b", rank: 4000 });
  });

  it("keeps drag data parsing generic and rejects disabled move menus", () => {
    expect(
      parseOrderingDragData({
        type: ORDERING_DND_TYPE,
        recordId: "placement-1",
        scopeKey: 'blockPlacement:order:["page-1"]',
      }),
    ).toEqual({
      type: ORDERING_DND_TYPE,
      recordId: "placement-1",
      scopeKey: 'blockPlacement:order:["page-1"]',
    });
    expect(parseOrderingDragData({ type: "other" })).toBeUndefined();

    const recordsById = recordsByIdFrom([
      placementRecord("a", { parent: "page-1", order: 1000 }),
      placementRecord("b", { parent: "page-1", order: 2000 }),
    ]);
    const context = selectResultOrderingContext({
      entityName: "block-placement",
      ordering: placementOrdering,
      recordIds: ["a", "b"],
      recordsById,
    });

    expect(
      selectOrderingMoveMenuItems({
        includeOrdering: true,
        orderingContext: context,
        sourceRecordId: "a",
      }).map((item) => item.disabledReason),
    ).toEqual([
      "Editing is disabled",
      "Editing is disabled",
      "Editing is disabled",
      "Editing is disabled",
    ]);
    expect(
      selectOrderingMoveMenuItems({
        includeOrdering: false,
        orderingContext: context,
        sourceRecordId: "a",
      }),
    ).toEqual([]);
  });
});

const placementOrdering: ResultOrderingConfig = {
  fieldName: "order",
  field: { type: "number", required: true, min: 0 },
  scope: [
    {
      kind: "field",
      fieldName: "parent",
      field: { type: "reference", required: false, to: "block" },
    },
  ],
  presentations: ["dragHandle", "moveMenu"],
};

const placementUpdateOperation: EntityOperationPresentationConfig = {
  entityName: "block-placement",
  operationName: "update",
  canonicalKey: "block-placement.update",
  label: "Update",
  operation: {
    kind: "update",
    scope: "record",
    input: { fields: [] },
    effect: { type: "patchRecord" },
    output: { type: "update" },
    idempotency: { required: true },
    audit: { input: "summary" },
  },
};

function recordsByIdFrom(records: StoredRecord[]) {
  return Object.fromEntries(records.map((record) => [record.id, record]));
}

function placementRecord(id: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity: "block-placement",
    values,
    createdAt: `2026-05-11T00:00:00.000Z`,
    updatedAt: `2026-05-11T00:00:00.000Z`,
  };
}
