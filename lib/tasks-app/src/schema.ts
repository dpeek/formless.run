import { composeAppSchema } from "@dpeek/formless-schema";
import { tasksPresentationSchemaModule } from "./schema-presentation.ts";
import { tasksRecordSchemaModule } from "./schema-records.ts";

export { tasksPresentationSchemaModule, tasksRecordSchemaModule };

export const tasksSchemaSource = composeAppSchema({
  version: 1,
  modules: [tasksRecordSchemaModule, tasksPresentationSchemaModule],
});
