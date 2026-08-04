import { defineAppSchemaModule } from "@dpeek/formless-schema";
import { standardContactSubscriptionRecordSchemaModule } from "./schema-contact-subscription-records.ts";
import { standardInquiryRecordSchemaModule } from "./schema-inquiry-records.ts";

export const standardStandalonePresentationSchemaModule = defineAppSchemaModule({
  key: "standard-standalone-presentation",
  requires: [
    standardInquiryRecordSchemaModule.key,
    standardContactSubscriptionRecordSchemaModule.key,
  ],
  tableViews: [
    {
      key: "standardContactMessageTable",
      entity: "contact-message",
      columns: [
        {
          type: "field",
          field: "name",
          width: "md",
        },
        {
          type: "field",
          field: "email",
          width: "lg",
        },
        {
          type: "field",
          field: "message",
          width: "lg",
        },
      ],
    },
    {
      key: "standardSubscriptionTable",
      entity: "subscription",
      columns: [
        {
          type: "referenceField",
          referenceField: "emailAddress",
          field: "address",
          label: "Email",
          width: "lg",
        },
        {
          type: "referenceField",
          referenceField: "audience",
          field: "label",
          label: "Audience",
          width: "md",
        },
        {
          type: "field",
          field: "status",
          width: "sm",
        },
        {
          type: "field",
          field: "consentedAt",
          width: "md",
        },
      ],
    },
  ],
  views: [
    {
      key: "standardContactMessageHome",
      type: "collection",
      label: "Contact messages",
      entity: "contact-message",
      queries: [
        {
          query: "contactMessageAll",
        },
      ],
      defaultQuery: "contactMessageAll",
      result: {
        type: "table",
        tableView: "standardContactMessageTable",
      },
    },
    {
      key: "standardSubscriptionHome",
      type: "collection",
      label: "Subscriptions",
      entity: "subscription",
      queries: [
        {
          query: "subscriptionAll",
        },
      ],
      defaultQuery: "subscriptionAll",
      result: {
        type: "table",
        tableView: "standardSubscriptionTable",
      },
    },
  ],
  screens: [
    {
      key: "standardContactIntake",
      type: "workspace",
      label: "Contact intake",
      layout: {
        type: "stack",
        width: "wide",
        sections: [
          {
            id: "messages",
            type: "collection",
            view: "standardContactMessageHome",
          },
          {
            id: "subscriptions",
            type: "collection",
            view: "standardSubscriptionHome",
          },
        ],
      },
    },
  ],
});
