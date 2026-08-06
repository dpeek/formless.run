import type { AppSchema } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";

import { siteRecordSchemaModule } from "./schema-records.ts";

type SiteRecordAdapterInput = {
  allRecords: readonly StoredRecord[];
  records: readonly StoredRecord[];
  schema: AppSchema;
};

const siteEntityIds = Object.fromEntries(
  siteRecordSchemaModule.entities.map(({ id, key }) => [key, id]),
) as Record<"site" | "block" | "block-placement", string>;

export const siteRecordAdapter = {
  target: "shared",
  kind: "record-adapter",
  key: "site.records",
  entityIds: Object.values(siteEntityIds),
  adapter: {
    canonicalize(input: SiteRecordAdapterInput): readonly StoredRecord[] {
      return input.records;
    },
    validate(context: string, input: SiteRecordAdapterInput): void {
      validateSiteRecords(context, input);
    },
    validateCandidate(context: string, input: SiteRecordAdapterInput): void {
      validateSiteRecords(context, input);
    },
  },
} as const;

function validateSiteRecords(context: string, input: SiteRecordAdapterInput): void {
  const entityNames = siteEntityNames(context, input.schema);
  const activeRecords = input.records.filter((record) => record.deletedAt === undefined);
  const sites = recordsById(activeRecords, entityNames.site);
  const blocks = recordsById(activeRecords, entityNames.block);
  const placements = recordsById(activeRecords, entityNames["block-placement"]);

  for (const block of blocks.values()) {
    requireBlockSite(context, block, sites);
  }

  for (const site of sites.values()) {
    validateSiteRoot(context, site, "home", "page", blocks);
    validateSiteRoot(context, site, "header", "header", blocks);
    validateSiteRoot(context, site, "footer", "footer", blocks);
  }

  for (const placement of placements.values()) {
    const parent = requireBlockReference(context, placement, "parent", blocks);
    const child = requireBlockReference(context, placement, "block", blocks);
    const parentSite = requireBlockSite(context, parent, sites);
    const childSite = requireBlockSite(context, child, sites);

    if (parentSite.id !== childSite.id) {
      throw new Error(
        `${context} placement "${placement.id}" parent and child must belong to the same Site.`,
      );
    }
  }

  for (const block of blocks.values()) {
    if (block.values.linkTargetMode !== "internal" || block.values.linkTargetBlock === undefined) {
      continue;
    }

    const sourceSite = requireBlockSite(context, block, sites);
    const target = requireBlockReference(context, block, "linkTargetBlock", blocks);
    const targetSite = requireBlockSite(context, target, sites);

    if (sourceSite.id !== targetSite.id) {
      throw new Error(
        `${context} internal target for block "${block.id}" must belong to the same Site.`,
      );
    }
  }
}

function validateSiteRoot(
  context: string,
  site: StoredRecord,
  field: "home" | "header" | "footer",
  expectedType: string,
  blocks: ReadonlyMap<string, StoredRecord>,
): void {
  if (site.values[field] === undefined) {
    return;
  }

  const block = requireBlockReference(context, site, field, blocks);
  if (block.values.site !== site.id || block.values.type !== expectedType) {
    throw new Error(
      `${context} Site "${site.id}" ${field} must reference an owned ${expectedType} block.`,
    );
  }
}

function requireBlockReference(
  context: string,
  record: StoredRecord,
  field: string,
  blocks: ReadonlyMap<string, StoredRecord>,
): StoredRecord {
  const blockId = record.values[field];
  const block = typeof blockId === "string" ? blocks.get(blockId) : undefined;

  if (block === undefined) {
    throw new Error(`${context} record "${record.id}" field "${field}" must reference a block.`);
  }

  return block;
}

function requireBlockSite(
  context: string,
  block: StoredRecord,
  sites: ReadonlyMap<string, StoredRecord>,
): StoredRecord {
  const siteId = block.values.site;
  const site = typeof siteId === "string" ? sites.get(siteId) : undefined;

  if (site === undefined) {
    throw new Error(`${context} block "${block.id}" must reference an active Site.`);
  }

  return site;
}

function recordsById(
  records: readonly StoredRecord[],
  entityName: string,
): Map<string, StoredRecord> {
  return new Map(
    records.filter((record) => record.entity === entityName).map((record) => [record.id, record]),
  );
}

function siteEntityNames(context: string, schema: AppSchema) {
  return Object.fromEntries(
    Object.entries(siteEntityIds).map(([name, id]) => {
      const entityName = schema.entities.find((entity) => entity.id === id)?.key;

      if (entityName === undefined) {
        throw new Error(`${context} schema is missing Site entity id "${id}".`);
      }

      return [name, entityName];
    }),
  ) as Record<keyof typeof siteEntityIds, string>;
}
