import {
  standardContactSubscriptionRecordSchemaModule,
  standardInquiryRecordSchemaModule,
} from "@dpeek/formless-standard/schema";
import { defineAppSchemaModule } from "@dpeek/formless-schema";

export const siteContactIntakePresentationSchemaModule = defineAppSchemaModule({
  key: "site-contact-intake-presentation",
  requires: [
    standardInquiryRecordSchemaModule.key,
    standardContactSubscriptionRecordSchemaModule.key,
  ],
  tableViews: [
    {
      key: "emailAddressTable",
      entity: "email-address",
      columns: [
        {
          type: "field",
          field: "address",
          width: "lg",
        },
        {
          type: "field",
          field: "normalizedAddress",
          width: "lg",
        },
      ],
    },
    {
      key: "audienceTable",
      entity: "audience",
      columns: [
        {
          type: "field",
          field: "label",
          width: "lg",
        },
        {
          type: "field",
          field: "key",
          width: "md",
        },
      ],
    },
    {
      key: "subscriptionTable",
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
        {
          type: "field",
          field: "sourceHost",
          width: "md",
        },
        {
          type: "field",
          field: "sourcePath",
          width: "md",
        },
        {
          type: "field",
          field: "sourceSiteBlockId",
          width: "md",
        },
      ],
    },
    {
      key: "contactMessageTable",
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
  ],
  views: [
    {
      key: "emailAddressHome",
      type: "collection",
      label: "Email addresses",
      entity: "email-address",
      navigation: {
        primary: false,
      },
      queries: [
        {
          query: "emailAddressAll",
          count: {
            type: "count",
          },
        },
      ],
      defaultQuery: "emailAddressAll",
      result: {
        type: "table",
        tableView: "emailAddressTable",
      },
    },
    {
      key: "audienceHome",
      type: "collection",
      label: "Audiences",
      entity: "audience",
      navigation: {
        primary: false,
      },
      queries: [
        {
          query: "audienceAll",
          count: {
            type: "count",
          },
        },
      ],
      defaultQuery: "audienceAll",
      result: {
        type: "table",
        tableView: "audienceTable",
      },
    },
    {
      key: "subscriptionHome",
      type: "collection",
      label: "Subscriptions",
      entity: "subscription",
      navigation: {
        primary: false,
      },
      queries: [
        {
          query: "subscriptionAll",
          count: {
            type: "count",
          },
        },
      ],
      defaultQuery: "subscriptionAll",
      result: {
        type: "table",
        tableView: "subscriptionTable",
      },
    },
    {
      key: "contactMessageHome",
      type: "collection",
      label: "Contact messages",
      entity: "contact-message",
      navigation: {
        primary: false,
      },
      queries: [
        {
          query: "contactMessageAll",
          count: {
            type: "count",
          },
        },
      ],
      defaultQuery: "contactMessageAll",
      result: {
        type: "table",
        tableView: "contactMessageTable",
      },
    },
  ],
  screens: [
    {
      key: "siteSubscribers",
      type: "workspace",
      label: "Subscribers",
      path: "/subscribers",
      layout: {
        type: "stack",
        width: "wide",
        sections: [
          {
            id: "subscriptions",
            type: "collection",
            view: "subscriptionHome",
          },
          {
            id: "emailAddresses",
            type: "collection",
            view: "emailAddressHome",
          },
          {
            id: "audiences",
            type: "collection",
            view: "audienceHome",
          },
        ],
      },
    },
    {
      key: "siteContacts",
      type: "workspace",
      label: "Contacts",
      path: "/contacts",
      layout: {
        type: "stack",
        width: "wide",
        sections: [
          {
            id: "messages",
            type: "collection",
            view: "contactMessageHome",
          },
        ],
      },
    },
  ],
});
