import { writeFile } from "node:fs/promises";
import { formatAppSchemaSource, parseAppSchema } from "@dpeek/formless-schema";
import { standardSchemaSource } from "../src/schema.ts";

parseAppSchema(standardSchemaSource);

await writeFile(
  new URL("../schema.json", import.meta.url),
  formatAppSchemaSource(standardSchemaSource),
  "utf8",
);
