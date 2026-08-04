import {
  standardContactSubscriptionRecordSchemaModule,
  standardInquiryRecordSchemaModule,
} from "@dpeek/formless-standard/schema";
import { composeAppSchema } from "@dpeek/formless-schema";
import { siteContactIntakePresentationSchemaModule } from "./schema-contact-intake-presentation.ts";
import { sitePresentationSchemaModule } from "./schema-presentation.ts";
import { siteRecordSchemaModule } from "./schema-records.ts";

export {
  siteContactIntakePresentationSchemaModule,
  sitePresentationSchemaModule,
  siteRecordSchemaModule,
};

export const siteSchemaSource = composeAppSchema({
  version: 1,
  modules: [
    standardInquiryRecordSchemaModule,
    standardContactSubscriptionRecordSchemaModule,
    siteRecordSchemaModule,
    sitePresentationSchemaModule,
    siteContactIntakePresentationSchemaModule,
  ],
});
