import {
  standardContactSubscriptionRecordSchemaModule,
  standardInquiryRecordSchemaModule,
} from "@dpeek/formless-standard/schema";
import { composeAppSchema } from "@dpeek/formless-schema";
import { siteContactIntakePresentationSchemaModule } from "./schema-contact-intake-presentation.ts";
import { sitePresentationSchemaModule } from "./schema-presentation.ts";
import { siteRecordSchemaModule } from "./schema-records.ts";
import {
  SITE_PREVIEW_BROWSER_MOUNT_KEY,
  SITE_PREVIEW_WORKER_MOUNT_KEY,
} from "./schema-surface-mounts.ts";

export {
  siteContactIntakePresentationSchemaModule,
  sitePresentationSchemaModule,
  siteRecordSchemaModule,
  SITE_PREVIEW_BROWSER_MOUNT_KEY,
  SITE_PREVIEW_WORKER_MOUNT_KEY,
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
