import { writeFile } from "node:fs/promises";
import { formatAppSchemaSource, parseAppSchema } from "@dpeek/formless-schema";
import { tasksSchemaSource } from "../src/schema.ts";

parseAppSchema(tasksSchemaSource);

await writeFile(
  new URL("../schema.json", import.meta.url),
  formatAppSchemaSource(tasksSchemaSource),
  "utf8",
);
