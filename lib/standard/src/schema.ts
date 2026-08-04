import { composeAppSchema } from "@dpeek/formless-schema";
import { standardContactSubscriptionRecordSchemaModule } from "./schema-contact-subscription-records.ts";
import { standardInquiryRecordSchemaModule } from "./schema-inquiry-records.ts";
import { standardStandalonePresentationSchemaModule } from "./schema-standalone-presentation.ts";

export { standardContactSubscriptionRecordSchemaModule, standardInquiryRecordSchemaModule };

export const standardSchemaSource = composeAppSchema({
  version: 1,
  modules: [
    standardInquiryRecordSchemaModule,
    standardContactSubscriptionRecordSchemaModule,
    standardStandalonePresentationSchemaModule,
  ],
});
