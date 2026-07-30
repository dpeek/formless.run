import { writeFile } from "node:fs/promises";
import { formatAppSchemaSource, parseAppSchema } from "@dpeek/formless-schema";
import { formlessProgramSourceSchema } from "../src/program/schema.ts";

parseAppSchema(formlessProgramSourceSchema);

await writeFile(
  new URL("../src/program/schema.json", import.meta.url),
  formatAppSchemaSource(formlessProgramSourceSchema),
  "utf8",
);
