import { parseAppSchema } from "@dpeek/formless-schema";
import { formatStoredRecordsForArtifact, type StoredRecord } from "@dpeek/formless-storage";
import { siteRecordSchemaModule, siteSchemaSource } from "./schema.ts";

const siteEntityKeys = new Set<string>(siteRecordSchemaModule.entities.map(({ key }) => key));
const siteSchema = parseAppSchema(siteSchemaSource);

export const siteEntityIds = siteRecordSchemaModule.entities.map(({ id }) => id);

export function validateSiteRecords(context: string, records: readonly StoredRecord[]): void {
  for (const record of records) {
    if (!siteEntityKeys.has(record.entity)) {
      throw new Error(
        `${context} does not support entity "${record.entity}" for record "${record.id}".`,
      );
    }
  }
}

export function reviewableSiteRecords(
  records: readonly StoredRecord[],
  context = "Site reviewable records",
): StoredRecord[] {
  validateSiteRecords(context, records);

  return formatStoredRecordsForArtifact(siteSchema, records);
}
