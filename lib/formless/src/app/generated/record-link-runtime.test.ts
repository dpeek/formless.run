import { describe, expect, it } from "vite-plus/test";
import type {
  NativeLinkActionContract,
  TableActionGroupContract,
  TableContract,
} from "@dpeek/formless-presentation/contract";
import type { KeyedDefinition, TableViewSchema } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { TableCollectionResultModel } from "../../client/collection-result-model.ts";
import { selectTableResultModel } from "../../client/table-model.ts";
import { createGeneratedOperationController } from "../../client/views.ts";
import { sourceLikeSiteSchema } from "../../test/schema-builders.ts";
import { selectGeneratedWorkspaceTableFoundation } from "./generated-table-foundation.tsx";
import { generatedRecordLinkResolutionOptions } from "./record-link-resolution.ts";

describe("generated table record links", () => {
  it("resolves row-scoped direct and referenced values without entering operation intents", () => {
    const schema = sourceLikeSiteSchema();
    const tableView = {
      key: "blockPlacementTable",
      entity: "block-placement",
      links: [
        {
          key: "openBlock",
          label: "Open block",
          target: "newTab",
          destination: {
            type: "url",
            base: "https://example.test/open?source=table",
            query: [
              {
                name: "order",
                source: { kind: "field", field: "order" },
                missing: "disable",
              },
              {
                name: "label",
                source: { kind: "field", field: "label" },
                missing: "disable",
              },
              {
                name: "href",
                source: {
                  kind: "referenceField",
                  referenceField: "block",
                  targetEntity: "block",
                  field: "href",
                },
                missing: "disable",
              },
              {
                name: "sampleImageUrl",
                source: {
                  kind: "mediaHref",
                  value: {
                    kind: "referenceField",
                    referenceField: "block",
                    targetEntity: "block",
                    field: "mediaAssetId",
                  },
                },
                missing: "disable",
              },
            ],
          },
        },
      ],
      operations: [
        {
          operation: "block.update",
          label: "Edit block",
          target: { kind: "reference", field: "block" },
          editView: "blockEdit",
        },
      ],
      ordering: {
        field: "order",
        scope: [
          { kind: "field", field: "parent" },
          { kind: "field", field: "slot" },
        ],
      },
      columns: [
        { type: "orderingHandle" },
        { type: "field", field: "block" },
        { type: "field", field: "label" },
        { type: "field", field: "slot" },
        { type: "linkControl", link: "openBlock", label: "Destination" },
        { type: "operationControl", includeOrdering: true },
      ],
    } satisfies KeyedDefinition<TableViewSchema>;

    const entityName = "block-placement";
    const entity = schema.entities.find((definition) => definition.key === entityName)!;
    const selected = selectTableResultModel(schema, tableView, entityName, entity);
    const result = {
      ...selected,
      tableViewName: tableView.key,
      type: "table",
    } satisfies TableCollectionResultModel;
    const block = storedRecord("block-1", "block", {
      href: "/hello?x=1",
      label: "Hello",
      mediaAssetId: "vial-image.webp",
      type: "page",
    });
    const availablePlacement = storedRecord("placement-1", entityName, {
      block: block.id,
      label: "Hero & main",
      order: 0,
      parent: block.id,
      slot: "body",
    });
    const unavailablePlacement = storedRecord("placement-2", entityName, {
      block: "missing-block",
      label: "Missing target",
      order: 1,
      parent: block.id,
      slot: "body",
    });
    const recordsById = {
      [availablePlacement.id]: availablePlacement,
      [block.id]: block,
      [unavailablePlacement.id]: unavailablePlacement,
    };
    const foundation = selectGeneratedWorkspaceTableFoundation({
      controller: createGeneratedOperationController({ bindings: [] }),
      entity,
      entityName,
      id: "placements:table",
      query: { kind: "all" },
      queryName: "placements",
      recordLinkOptions: generatedRecordLinkResolutionOptions("https://instance.example"),
      recordIds: [availablePlacement.id, unavailablePlacement.id],
      recordsById,
      result,
      schema,
    });
    const table = foundation.table;
    const available = recordLinkAction(table, availablePlacement.id);
    const unavailable = recordLinkAction(table, unavailablePlacement.id);

    expect(table.columns.map((column) => column.id)).toEqual([
      "orderingHandle",
      "field:block",
      "field:label",
      "field:slot",
      "linkControl:openBlock",
      "operationControl:block.update,ordering",
    ]);
    expect(table.columns.find((column) => column.id === "linkControl:openBlock")).toMatchObject({
      accessibilityLabel: "Destination",
      contentRole: "actions",
      isRowHeader: false,
    });
    expect(available).toEqual({
      accessibilityLabel: "Open block for Hero & main",
      availability: "available",
      href: "https://example.test/open?source=table&order=0&label=Hero+%26+main&href=%2Fhello%3Fx%3D1&sampleImageUrl=https%3A%2F%2Finstance.example%2Fapi%2Fformless%2Fmedia%2Fmedia%2Fimages%2Fvial-image.webp",
      id: "placement-1:linkControl:openBlock:link",
      kind: "nativeLinkAction",
      label: "Open block",
      prominence: "primary",
      target: "newTab",
    });
    expect(available).not.toHaveProperty("intent");
    expect(available).not.toHaveProperty("trigger");
    expect(unavailable).toEqual({
      accessibilityLabel: "Open block for Missing target",
      availability: "unavailable",
      id: "placement-2:linkControl:openBlock:link",
      kind: "nativeLinkAction",
      label: "Open block",
      prominence: "primary",
      target: "newTab",
      unavailableReason: "Link destination is unavailable.",
    });
    expect(unavailable).not.toHaveProperty("href");
    expect(tableCellContent(table, availablePlacement.id, "field:block")).toMatchObject({
      kind: "cellValue",
      presentation: { kind: "reference" },
    });
    expect(tableCellContent(table, unavailablePlacement.id, "field:block")).toEqual({
      accessibilityLabel: "Child block value is invalid or unavailable.",
      kind: "invalidValue",
    });
    expect(
      [...foundation.editFieldsById.values()].every(({ field }) => field.surface === "record"),
    ).toBe(true);
    expect(operationActions(table, availablePlacement.id)).toMatchObject({
      accessibilityLabel: "More options for Hero & main",
      actions: [
        {
          dialog: {
            targetKind: "reference",
            warning: "Updating this shared record may affect other records.",
          },
          kind: "editAction",
        },
        { direction: "top", kind: "orderingAction" },
        { direction: "up", kind: "orderingAction" },
        { direction: "down", kind: "orderingAction" },
        { direction: "bottom", kind: "orderingAction" },
      ],
    });
  });
});

function recordLinkAction(table: TableContract, rowId: string): NativeLinkActionContract {
  const content = table.rows
    .find((row) => row.id === rowId)
    ?.cells.find((cell) => cell.columnId === "linkControl:openBlock")?.contents[0];

  if (content?.kind !== "nativeLinkAction") {
    throw new Error(`Missing record link action for row "${rowId}".`);
  }

  return content;
}

function tableCellContent(table: TableContract, rowId: string, columnId: string) {
  return table.rows
    .find((row) => row.id === rowId)
    ?.cells.find((cell) => cell.columnId === columnId)?.contents[0];
}

function operationActions(table: TableContract, rowId: string): TableActionGroupContract {
  const content = table.rows
    .find((row) => row.id === rowId)
    ?.cells.find((cell) => cell.columnId === "operationControl:block.update,ordering")?.contents[0];

  if (content?.kind !== "actionGroup") {
    throw new Error(`Missing operation actions for row "${rowId}".`);
  }

  return content;
}

function storedRecord(id: string, entity: string, values: StoredRecord["values"]): StoredRecord {
  return {
    createdAt: "2026-08-03T00:00:00.000Z",
    entity,
    id,
    updatedAt: "2026-08-03T00:00:00.000Z",
    values,
  };
}
