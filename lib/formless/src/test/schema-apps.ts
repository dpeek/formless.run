import { getWorkerSchemaAppDefinition } from "../worker/schema-apps.ts";
import rawRateCardSeedRecords from "./fixtures/rate-card-seed-records.json";
import rawRateCardSourceSchema from "./fixtures/rate-card-schema.json";
import { parseAppSchema } from "@dpeek/formless-schema";
import { parseWorkerSeedRecords } from "../worker/schema-apps.ts";

export const taskSourceApp = getWorkerSchemaAppDefinition("tasks");
export const siteSourceApp = getWorkerSchemaAppDefinition("site");
export const crmSourceApp = getWorkerSchemaAppDefinition("crm");

export const taskSourceSchema = taskSourceApp.sourceSchema;
export const rateSourceSchema = parseAppSchema(rawRateCardSourceSchema);
export const siteSourceSchema = siteSourceApp.sourceSchema;
export const crmSourceSchema = crmSourceApp.sourceSchema;

export const taskSourceSeedRecords = taskSourceApp.seedRecords;
export const taskSeedRecords = [...taskSourceSeedRecords].sort(compareRecordsByCreatedAt);
export const rateSeedRecords = parseWorkerSeedRecords(
  rawRateCardSeedRecords,
  rateSourceSchema,
  "rate-card seed records",
);
export const siteSourceSeedRecords = siteSourceApp.seedRecords;
export const siteSeedRecords = [...siteSourceSeedRecords].sort(compareRecordsByCreatedAt);
export const crmSeedRecords = crmSourceApp.seedRecords;

function compareRecordsByCreatedAt(
  left: { createdAt: string; id: string },
  right: { createdAt: string; id: string },
): number {
  const createdAtOrder =
    left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : 0;

  return createdAtOrder !== 0
    ? createdAtOrder
    : left.id < right.id
      ? -1
      : left.id > right.id
        ? 1
        : 0;
}
