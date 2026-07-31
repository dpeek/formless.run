import { writeFile } from "node:fs/promises";
import { formatAppSchemaSource, parseAppSchema } from "@dpeek/formless-schema";
import { crmSchemaSource } from "../src/schema.ts";

parseAppSchema(crmSchemaSource);

await writeFile(
  new URL("../schema.json", import.meta.url),
  formatAppSchemaSource(crmSchemaSource),
  "utf8",
);
