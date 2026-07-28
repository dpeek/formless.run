import { writeFile } from "node:fs/promises";
import { formatAppSchemaSource, parseAppSchema } from "@dpeek/formless-schema";
import { formatStoredRecordsForArtifact } from "@dpeek/formless-storage";
import rawSeedRecords from "../seed-records.json";
import { tasksSchemaSource } from "../src/schema.ts";

const tasksSchema = parseAppSchema(tasksSchemaSource);

await Promise.all([
  writeFile(
    new URL("../schema.json", import.meta.url),
    formatAppSchemaSource(tasksSchemaSource),
    "utf8",
  ),
  writeFile(
    new URL("../seed-records.json", import.meta.url),
    `${JSON.stringify(formatStoredRecordsForArtifact(tasksSchema, rawSeedRecords), null, 2)}\n`,
    "utf8",
  ),
]);
