import { writeFile } from "node:fs/promises";
import { formatAppSchemaSource, parseAppSchema } from "@dpeek/formless-schema";
import { siteSchemaSource } from "../src/schema.ts";

parseAppSchema(siteSchemaSource);

await writeFile(
  new URL("../schema.json", import.meta.url),
  formatAppSchemaSource(siteSchemaSource),
  "utf8",
);
