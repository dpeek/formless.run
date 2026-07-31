import { composeAppSchema } from "@dpeek/formless-schema";
import { sitePresentationSchemaModule } from "./schema-presentation.ts";
import { siteRecordSchemaModule } from "./schema-records.ts";

export { sitePresentationSchemaModule, siteRecordSchemaModule };

export const siteSchemaSource = composeAppSchema({
  version: 1,
  modules: [siteRecordSchemaModule, sitePresentationSchemaModule],
});
