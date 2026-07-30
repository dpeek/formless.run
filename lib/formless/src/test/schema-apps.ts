import { getWorkerSchemaAppDefinition } from "../worker/schema-apps.ts";
import rawTaskSourceSchema from "@dpeek/formless-tasks-app/schema.json";
import rawRateCardRecords from "./fixtures/rate-card-records.json";
import rawRateCardSourceSchema from "./fixtures/rate-card-schema.json";
import { parseAppSchema } from "@dpeek/formless-schema";
import {
  formatStoredRecordsForArtifact,
  type StoredRecord,
  type StoredRecordArtifact,
} from "@dpeek/formless-storage";

export {
  crmTestRecords,
  taskStorageSnapshotRecords,
  taskTestRecords,
} from "./schema-app-records.ts";

export const siteSourceApp = getWorkerSchemaAppDefinition("site");
export const crmSourceApp = getWorkerSchemaAppDefinition("crm");

export const taskSourceSchema = parseAppSchema(rawTaskSourceSchema);
export const rateSourceSchema = parseAppSchema(rawRateCardSourceSchema);
export const siteSourceSchema = siteSourceApp.sourceSchema;
export const crmSourceSchema = crmSourceApp.sourceSchema;

export const rateCardTestRecords: StoredRecord[] = formatStoredRecordsForArtifact(
  rateSourceSchema,
  rawRateCardRecords as readonly StoredRecordArtifact[],
).map((record) => {
  if (!record.createdAt) {
    throw new Error(`Rate-card test record "${record.id}" must include createdAt.`);
  }
  const values: StoredRecord["values"] = {};

  for (const [fieldName, value] of Object.entries(record.values)) {
    if (value !== undefined) {
      values[fieldName] = value;
    }
  }

  return {
    ...record,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt ?? record.createdAt,
    values,
  };
});
