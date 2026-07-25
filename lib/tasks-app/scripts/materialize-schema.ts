import { writeFile } from "node:fs/promises";
import { formatAppSchemaSource } from "@dpeek/formless-schema";
import { tasksSchemaSource } from "../src/schema.ts";

await writeFile(
  new URL("../schema.json", import.meta.url),
  formatAppSchemaSource(tasksSchemaSource),
  "utf8",
);
