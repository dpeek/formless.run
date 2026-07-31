import { composeAppSchema } from "@dpeek/formless-schema";
import { crmPresentationSchemaModule } from "./schema-presentation.ts";
import { crmRecordSchemaModule } from "./schema-records.ts";

export { crmPresentationSchemaModule, crmRecordSchemaModule };

export const crmSchemaSource = composeAppSchema({
  version: 1,
  modules: [crmRecordSchemaModule, crmPresentationSchemaModule],
});
