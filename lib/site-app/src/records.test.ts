import { parseAppSchema } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import { describe, expect, it } from "vite-plus/test";

import { siteRecordAdapter } from "./records.ts";
import { siteSchemaSource } from "./schema.ts";

const schema = parseAppSchema(siteSchemaSource);
const now = "2026-08-06T00:00:00.000Z";

describe("Site record adapter", () => {
  it("accepts owned roots, placements, and internal targets", () => {
    const records = validSiteRecords();

    expect(() => validate(records)).not.toThrow();
    expect(siteRecordAdapter).toMatchObject({
      key: "site.records",
      kind: "record-adapter",
      target: "shared",
    });
    expect(siteRecordAdapter.entityIds).toEqual([
      "entity_610ac202-b123-46ed-8bd3-5b65383e2233",
      "entity_8aa7cc1a-c9a7-482e-b078-6ef5478794e2",
      "entity_3d195c79-db03-4da4-95c8-433266271b21",
    ]);
  });

  it("rejects wrong-type roots and cross-Site aggregate edges", () => {
    const cases = [
      {
        message: 'Site "site:a" home must reference an owned page block',
        records: replace(validSiteRecords(), "site:a", (record) => ({
          ...record,
          values: { ...record.values, home: "block:header" },
        })),
      },
      {
        message: 'placement "placement:home-child" parent and child must belong to the same Site',
        records: replace(validSiteRecords(), "placement:home-child", (record) => ({
          ...record,
          values: { ...record.values, block: "block:other" },
        })),
      },
      {
        message: 'internal target for block "block:link" must belong to the same Site',
        records: replace(validSiteRecords(), "block:link", (record) => ({
          ...record,
          values: { ...record.values, linkTargetBlock: "block:other" },
        })),
      },
    ];

    for (const invalid of cases) {
      expect(() => validate(invalid.records)).toThrow(invalid.message);
    }
  });
});

function validate(records: StoredRecord[]) {
  siteRecordAdapter.adapter.validate("Site records", {
    allRecords: records,
    records,
    schema,
  });
}

function validSiteRecords(): StoredRecord[] {
  return [
    record("site:a", "site", {
      key: "a",
      label: "A",
      home: "block:home",
      header: "block:header",
      footer: "block:footer",
    }),
    record("site:b", "site", { key: "b", label: "B" }),
    block("block:home", "site:a", "page"),
    block("block:header", "site:a", "header"),
    block("block:footer", "site:a", "footer"),
    block("block:child", "site:a", "markdown"),
    block("block:other", "site:b", "page"),
    record("block:link", "block", {
      site: "site:a",
      type: "link",
      label: "Home",
      linkTargetMode: "internal",
      linkTargetBlock: "block:home",
    }),
    record("placement:home-child", "block-placement", {
      parent: "block:home",
      block: "block:child",
      order: 1000,
    }),
  ];
}

function block(id: string, site: string, type: string): StoredRecord {
  return record(id, "block", { site, type, label: id });
}

function record(id: string, entity: string, values: StoredRecord["values"]): StoredRecord {
  return { id, entity, values, createdAt: now, updatedAt: now };
}

function replace(
  records: StoredRecord[],
  recordId: string,
  update: (record: StoredRecord) => StoredRecord,
): StoredRecord[] {
  return records.map((record) => (record.id === recordId ? update(record) : record));
}
