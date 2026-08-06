import type { StoredRecord } from "./types.ts";

export type SoleActiveSiteSelection =
  | {
      kind: "selected";
      site: StoredRecord;
    }
  | {
      kind: "unavailable";
      reason: "ambiguous" | "missing";
      siteCount: number;
    };

export function selectSoleActiveSite(records: readonly StoredRecord[]): SoleActiveSiteSelection {
  const sites = records.filter((record) => record.entity === "site" && !record.deletedAt);

  if (sites.length !== 1) {
    return {
      kind: "unavailable",
      reason: sites.length === 0 ? "missing" : "ambiguous",
      siteCount: sites.length,
    };
  }

  return { kind: "selected", site: sites[0]! };
}

export function selectSiteOwnedBlocks(
  records: readonly StoredRecord[],
  siteId: string,
): StoredRecord[] {
  return records.filter(
    (record) => record.entity === "block" && !record.deletedAt && record.values.site === siteId,
  );
}

export function selectSiteOwnedPublicRecords(
  records: readonly StoredRecord[],
  site: StoredRecord,
): StoredRecord[] {
  const blocks = selectSiteOwnedBlocks(records, site.id);
  const blockIds = new Set(blocks.map((block) => block.id));
  const placements = records.filter(
    (record) =>
      record.entity === "block-placement" &&
      !record.deletedAt &&
      typeof record.values.parent === "string" &&
      blockIds.has(record.values.parent),
  );

  return [site, ...blocks, ...placements];
}
