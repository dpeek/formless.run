import { applyBootstrapResponse } from "../client/store.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import { siteSourceSchema } from "./schema-apps.ts";
import { requiredCollectionModel, requiredTableModel } from "./generated-table.tsx";
import { bootstrapResponse } from "./protocol-builders.ts";
import { testSiteRecords } from "./site-records.ts";

export function bootstrapSiteEditor(records: StoredRecord[] = testSiteRecords) {
  applyBootstrapResponse(bootstrapResponse(siteSourceSchema, records));
}

export function requiredSiteCollectionModel(viewName: string) {
  return requiredCollectionModel(siteSourceSchema, viewName);
}

export function requiredSiteTableModel(viewName = "pageCompositionHome") {
  return requiredTableModel(siteSourceSchema, viewName);
}

export function siteBlockRecord(id: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity: "block",
    values,
    createdAt: "2026-05-05T00:00:40.000Z",
    updatedAt: "2026-05-05T00:00:40.000Z",
  };
}

export function sitePlacementRecord(id: string, label: string, order: number): StoredRecord {
  return {
    id,
    entity: "block-placement",
    values: {
      parent: "page-1",
      block: "block-1",
      label,
      order,
    },
    createdAt: "2026-05-05T00:00:40.000Z",
    updatedAt: "2026-05-05T00:00:40.000Z",
  };
}
