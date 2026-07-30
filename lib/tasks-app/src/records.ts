import { parseAppSchema } from "@dpeek/formless-schema";
import { formatStoredRecordsForArtifact, type StoredRecord } from "@dpeek/formless-storage";
import { tasksSchemaSource } from "./schema.ts";
import { TASK_ENTITY_ID } from "./types.ts";

const TASK_ENTITY_KEY = "task";
const tasksSchema = parseAppSchema(tasksSchemaSource);

export const tasksEntityIds = [TASK_ENTITY_ID] as const;

export function validateTaskRecords(context: string, records: readonly StoredRecord[]): void {
  for (const record of records) {
    if (record.entity !== TASK_ENTITY_KEY) {
      throw new Error(
        `${context} does not support entity "${record.entity}" for record "${record.id}".`,
      );
    }
  }
}

export function reviewableTaskRecords(
  records: readonly StoredRecord[],
  context = "Tasks reviewable records",
): StoredRecord[] {
  validateTaskRecords(context, records);

  return formatStoredRecordsForArtifact(tasksSchema, records);
}
