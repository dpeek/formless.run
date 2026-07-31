import { parseAppSchema } from "@dpeek/formless-schema";
import { formatStoredRecordsForArtifact, type StoredRecord } from "@dpeek/formless-storage";
import { crmRecordSchemaModule, crmSchemaSource } from "./schema.ts";

const crmEntityKeys = new Set<string>(crmRecordSchemaModule.entities.map(({ key }) => key));
const crmSharedProgramEntityKeys = new Set([
  "contact",
  "email-address",
  "audience",
  "subscription",
]);
const crmSchema = parseAppSchema(crmSchemaSource);

export const crmEntityIds = crmRecordSchemaModule.entities.map(({ id }) => id);
export const crmOwnedProgramEntityIds = crmRecordSchemaModule.entities
  .filter(({ key }) => !crmSharedProgramEntityKeys.has(key))
  .map(({ id }) => id);

export function validateCrmRecords(context: string, records: readonly StoredRecord[]): void {
  for (const record of records) {
    if (!crmEntityKeys.has(record.entity)) {
      throw new Error(
        `${context} does not support entity "${record.entity}" for record "${record.id}".`,
      );
    }
  }
}

export function reviewableCrmRecords(
  records: readonly StoredRecord[],
  context = "CRM reviewable records",
): StoredRecord[] {
  validateCrmRecords(context, records);

  return formatStoredRecordsForArtifact(crmSchema, records);
}
