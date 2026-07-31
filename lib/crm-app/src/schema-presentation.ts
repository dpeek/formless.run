import { defineAppSchemaModule } from "@dpeek/formless-schema";

export const crmPresentationSchemaModule = defineAppSchemaModule({
  key: "crm-presentation",
  requires: ["crm-records"],
  itemViews: [
    {
      key: "companyListItem",
      entity: "company",
      fields: [
        {
          field: "name",
          editor: "text",
          commit: "field-commit",
        },
        {
          field: "status",
          editor: "enum",
          commit: "immediate",
        },
      ],
    },
    {
      key: "contactListItem",
      entity: "contact",
      fields: [
        {
          field: "label",
          editor: "text",
          commit: "field-commit",
        },
        {
          field: "company",
          editor: "reference",
          commit: "immediate",
        },
        {
          field: "lifecycle",
          editor: "enum",
          commit: "immediate",
        },
      ],
    },
    {
      key: "audienceListItem",
      entity: "audience",
      fields: [
        {
          field: "label",
          editor: "text",
          commit: "field-commit",
        },
        {
          field: "status",
          editor: "enum",
          commit: "immediate",
        },
      ],
    },
    {
      key: "campaignListItem",
      entity: "campaign",
      fields: [
        {
          field: "name",
          editor: "text",
          commit: "field-commit",
        },
        {
          field: "status",
          editor: "enum",
          commit: "immediate",
        },
        {
          field: "startsOn",
          editor: "date",
          commit: "field-commit",
        },
      ],
    },
    {
      key: "broadcastListItem",
      entity: "broadcast",
      fields: [
        {
          field: "label",
          editor: "text",
          commit: "field-commit",
        },
        {
          field: "audience",
          editor: "reference",
          commit: "immediate",
        },
        {
          field: "status",
          editor: "enum",
          commit: "immediate",
        },
      ],
    },
  ],
  tableViews: [
    {
      key: "companyTable",
      entity: "company",
      columns: [
        {
          type: "field",
          field: "name",
          editor: "text",
          commit: "field-commit",
          width: "lg",
        },
        {
          type: "field",
          field: "status",
          editor: "enum",
          commit: "immediate",
          width: "sm",
        },
        {
          type: "field",
          field: "website",
          editor: "href",
          commit: "field-commit",
          width: "md",
        },
      ],
    },
    {
      key: "contactTable",
      entity: "contact",
      columns: [
        {
          type: "field",
          field: "label",
          editor: "text",
          commit: "field-commit",
          width: "lg",
        },
        {
          type: "referenceField",
          referenceField: "company",
          field: "name",
          label: "Company",
          editor: "text",
          commit: "field-commit",
          width: "md",
        },
        {
          type: "field",
          field: "role",
          editor: "text",
          commit: "field-commit",
          width: "md",
        },
        {
          type: "field",
          field: "lifecycle",
          editor: "enum",
          commit: "immediate",
          width: "sm",
        },
        {
          type: "field",
          field: "source",
          editor: "enum",
          commit: "immediate",
          width: "sm",
        },
      ],
    },
    {
      key: "emailAddressTable",
      entity: "email-address",
      columns: [
        {
          type: "field",
          field: "address",
          editor: "text",
          commit: "field-commit",
          width: "lg",
        },
        {
          type: "referenceField",
          referenceField: "contact",
          field: "label",
          label: "Contact",
          editor: "text",
          commit: "field-commit",
          width: "md",
        },
        {
          type: "field",
          field: "status",
          editor: "enum",
          commit: "immediate",
          width: "sm",
        },
        {
          type: "field",
          field: "primary",
          editor: "boolean",
          commit: "immediate",
          width: "xs",
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
          editor: "text",
          commit: "field-commit",
          width: "lg",
        },
        {
          type: "field",
          field: "key",
          editor: "slug",
          commit: "field-commit",
          width: "md",
        },
        {
          type: "field",
          field: "status",
          editor: "enum",
          commit: "immediate",
          width: "sm",
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
          editor: "text",
          commit: "field-commit",
          width: "lg",
        },
        {
          type: "referenceField",
          referenceField: "audience",
          field: "label",
          label: "Audience",
          editor: "text",
          commit: "field-commit",
          width: "md",
        },
        {
          type: "field",
          field: "status",
          editor: "enum",
          commit: "immediate",
          width: "sm",
        },
        {
          type: "field",
          field: "sourceKind",
          editor: "enum",
          commit: "immediate",
          width: "sm",
        },
        {
          type: "field",
          field: "consentedAt",
          editor: "text",
          commit: "field-commit",
          width: "md",
        },
      ],
    },
    {
      key: "campaignTable",
      entity: "campaign",
      columns: [
        {
          type: "field",
          field: "name",
          editor: "text",
          commit: "field-commit",
          width: "lg",
        },
        {
          type: "field",
          field: "status",
          editor: "enum",
          commit: "immediate",
          width: "sm",
        },
        {
          type: "field",
          field: "startsOn",
          editor: "date",
          commit: "field-commit",
          width: "sm",
        },
      ],
    },
    {
      key: "campaignMessageTable",
      entity: "campaign-message",
      columns: [
        {
          type: "referenceField",
          referenceField: "campaign",
          field: "name",
          label: "Campaign",
          editor: "text",
          commit: "field-commit",
          width: "md",
        },
        {
          type: "field",
          field: "subject",
          editor: "text",
          commit: "field-commit",
          width: "lg",
        },
        {
          type: "field",
          field: "status",
          editor: "enum",
          commit: "immediate",
          width: "sm",
        },
        {
          type: "field",
          field: "preview",
          editor: "text",
          commit: "field-commit",
          width: "md",
        },
      ],
    },
    {
      key: "broadcastTable",
      entity: "broadcast",
      columns: [
        {
          type: "field",
          field: "label",
          editor: "text",
          commit: "field-commit",
          width: "lg",
        },
        {
          type: "referenceField",
          referenceField: "audience",
          field: "label",
          label: "Audience",
          editor: "text",
          commit: "field-commit",
          width: "md",
        },
        {
          type: "referenceField",
          referenceField: "message",
          field: "subject",
          label: "Message",
          editor: "text",
          commit: "field-commit",
          width: "md",
        },
        {
          type: "field",
          field: "status",
          editor: "enum",
          commit: "immediate",
          width: "sm",
        },
        {
          type: "field",
          field: "scheduledDate",
          editor: "date",
          commit: "field-commit",
          width: "sm",
        },
      ],
    },
    {
      key: "broadcastRecipientTable",
      entity: "broadcast-recipient",
      columns: [
        {
          type: "field",
          field: "label",
          editor: "text",
          commit: "field-commit",
          width: "lg",
        },
        {
          type: "referenceField",
          referenceField: "broadcast",
          field: "label",
          label: "Broadcast",
          editor: "text",
          commit: "field-commit",
          width: "md",
        },
        {
          type: "referenceField",
          referenceField: "emailAddress",
          field: "address",
          label: "Email",
          editor: "text",
          commit: "field-commit",
          width: "lg",
        },
        {
          type: "field",
          field: "status",
          editor: "enum",
          commit: "immediate",
          width: "sm",
        },
        {
          type: "field",
          field: "lastEventAt",
          editor: "text",
          commit: "field-commit",
          width: "md",
        },
      ],
    },
    {
      key: "deliveryEventTable",
      entity: "delivery-event",
      columns: [
        {
          type: "referenceField",
          referenceField: "broadcastRecipient",
          field: "label",
          label: "Recipient",
          width: "lg",
        },
        {
          type: "field",
          field: "eventType",
          width: "sm",
          display: "readOnly",
        },
        {
          type: "field",
          field: "occurredAt",
          width: "md",
          display: "readOnly",
        },
        {
          type: "field",
          field: "detail",
          width: "lg",
          display: "readOnly",
        },
      ],
    },
  ],
  views: [
    {
      key: "companyHome",
      type: "collection",
      label: "Companies",
      entity: "company",
      queries: [
        {
          query: "companyAll",
          count: {
            type: "count",
          },
        },
        {
          query: "companyCustomers",
          count: {
            type: "count",
          },
        },
      ],
      defaultQuery: "companyAll",
      result: {
        type: "table",
        tableView: "companyTable",
      },
      operations: [
        {
          operation: "company.create",
          createView: "companyCreate",
        },
      ],
    },
    {
      key: "contactHome",
      type: "collection",
      label: "Contacts",
      entity: "contact",
      queries: [
        {
          query: "contactAll",
          count: {
            type: "count",
          },
        },
        {
          query: "contactLeads",
          count: {
            type: "count",
          },
        },
        {
          query: "contactCustomers",
          count: {
            type: "count",
          },
        },
      ],
      defaultQuery: "contactAll",
      result: {
        type: "table",
        tableView: "contactTable",
      },
      operations: [
        {
          operation: "contact.create",
          createView: "contactCreate",
        },
      ],
    },
    {
      key: "emailAddressHome",
      type: "collection",
      label: "Email addresses",
      entity: "email-address",
      queries: [
        {
          query: "emailAddressAll",
          count: {
            type: "count",
          },
        },
        {
          query: "emailAddressActive",
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
      operations: [
        {
          operation: "email-address.create",
          createView: "emailAddressCreate",
        },
      ],
    },
    {
      key: "audienceHome",
      type: "collection",
      label: "Audiences",
      entity: "audience",
      queries: [
        {
          query: "audienceAll",
          count: {
            type: "count",
          },
        },
        {
          query: "audienceActive",
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
      operations: [
        {
          operation: "audience.create",
          createView: "audienceCreate",
        },
      ],
    },
    {
      key: "subscriptionHome",
      type: "collection",
      label: "Subscriptions",
      entity: "subscription",
      queries: [
        {
          query: "subscriptionAll",
          count: {
            type: "count",
          },
        },
        {
          query: "subscriptionSubscribed",
          count: {
            type: "count",
          },
        },
        {
          query: "subscriptionUnsubscribed",
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
      operations: [
        {
          operation: "subscription.create",
          createView: "subscriptionCreate",
        },
      ],
    },
    {
      key: "campaignHome",
      type: "collection",
      label: "Campaigns",
      entity: "campaign",
      queries: [
        {
          query: "campaignAll",
          count: {
            type: "count",
          },
        },
        {
          query: "campaignDraft",
          count: {
            type: "count",
          },
        },
        {
          query: "campaignActive",
          count: {
            type: "count",
          },
        },
      ],
      defaultQuery: "campaignAll",
      result: {
        type: "table",
        tableView: "campaignTable",
      },
      operations: [
        {
          operation: "campaign.create",
          createView: "campaignCreate",
        },
      ],
    },
    {
      key: "campaignMessageHome",
      type: "collection",
      label: "Messages",
      entity: "campaign-message",
      queries: [
        {
          query: "campaignMessageAll",
          count: {
            type: "count",
          },
        },
        {
          query: "campaignMessageReady",
          count: {
            type: "count",
          },
        },
      ],
      defaultQuery: "campaignMessageAll",
      result: {
        type: "table",
        tableView: "campaignMessageTable",
      },
      operations: [
        {
          operation: "campaign-message.create",
          createView: "campaignMessageCreate",
        },
      ],
    },
    {
      key: "broadcastHome",
      type: "collection",
      label: "Broadcasts",
      entity: "broadcast",
      queries: [
        {
          query: "broadcastAll",
          count: {
            type: "count",
          },
        },
        {
          query: "broadcastDraft",
          count: {
            type: "count",
          },
        },
        {
          query: "broadcastScheduled",
          count: {
            type: "count",
          },
        },
        {
          query: "broadcastSent",
          count: {
            type: "count",
          },
        },
      ],
      defaultQuery: "broadcastAll",
      result: {
        type: "table",
        tableView: "broadcastTable",
      },
      operations: [
        {
          operation: "broadcast.create",
          createView: "broadcastCreate",
        },
      ],
    },
    {
      key: "broadcastRecipientHome",
      type: "collection",
      label: "Recipients",
      entity: "broadcast-recipient",
      queries: [
        {
          query: "broadcastRecipientAll",
          count: {
            type: "count",
          },
        },
        {
          query: "broadcastRecipientQueued",
          count: {
            type: "count",
          },
        },
        {
          query: "broadcastRecipientSent",
          count: {
            type: "count",
          },
        },
        {
          query: "broadcastRecipientNeedsReview",
          count: {
            type: "count",
          },
        },
      ],
      defaultQuery: "broadcastRecipientAll",
      result: {
        type: "table",
        tableView: "broadcastRecipientTable",
      },
      operations: [
        {
          operation: "broadcast-recipient.create",
          createView: "broadcastRecipientCreate",
        },
      ],
    },
    {
      key: "deliveryEventHome",
      type: "collection",
      label: "Delivery events",
      entity: "delivery-event",
      queries: [
        {
          query: "deliveryEventAll",
          count: {
            type: "count",
          },
        },
        {
          query: "deliveryEventBounces",
          count: {
            type: "count",
          },
        },
      ],
      defaultQuery: "deliveryEventAll",
      result: {
        type: "table",
        tableView: "deliveryEventTable",
      },
    },
    {
      key: "companyCreate",
      type: "create",
      entity: "company",
      fields: [
        {
          field: "name",
          editor: "text",
        },
        {
          field: "website",
          editor: "href",
        },
        {
          field: "status",
          editor: "enum",
        },
        {
          field: "notes",
          editor: "textarea",
        },
      ],
    },
    {
      key: "contactCreate",
      type: "create",
      entity: "contact",
      fields: [
        {
          field: "label",
          editor: "text",
        },
        {
          field: "company",
          editor: "reference",
        },
        {
          field: "role",
          editor: "text",
        },
        {
          field: "lifecycle",
          editor: "enum",
        },
        {
          field: "source",
          editor: "enum",
        },
        {
          field: "notes",
          editor: "textarea",
        },
      ],
    },
    {
      key: "emailAddressCreate",
      type: "create",
      entity: "email-address",
      fields: [
        {
          field: "contact",
          editor: "reference",
        },
        {
          field: "address",
          editor: "text",
        },
        {
          field: "normalizedAddress",
          editor: "text",
        },
        {
          field: "status",
          editor: "enum",
        },
        {
          field: "primary",
          editor: "boolean",
        },
      ],
    },
    {
      key: "audienceCreate",
      type: "create",
      entity: "audience",
      fields: [
        {
          field: "key",
          editor: "slug",
        },
        {
          field: "label",
          editor: "text",
        },
        {
          field: "description",
          editor: "textarea",
        },
        {
          field: "status",
          editor: "enum",
        },
      ],
    },
    {
      key: "subscriptionCreate",
      type: "create",
      entity: "subscription",
      fields: [
        {
          field: "emailAddress",
          editor: "reference",
        },
        {
          field: "audience",
          editor: "reference",
        },
        {
          field: "status",
          editor: "enum",
        },
        {
          field: "consentedAt",
          editor: "text",
        },
        {
          field: "sourceKind",
          editor: "enum",
        },
        {
          field: "sourceLabel",
          editor: "text",
        },
      ],
    },
    {
      key: "campaignCreate",
      type: "create",
      entity: "campaign",
      fields: [
        {
          field: "name",
          editor: "text",
        },
        {
          field: "status",
          editor: "enum",
        },
        {
          field: "objective",
          editor: "textarea",
        },
        {
          field: "startsOn",
          editor: "date",
        },
      ],
    },
    {
      key: "campaignMessageCreate",
      type: "create",
      entity: "campaign-message",
      fields: [
        {
          field: "campaign",
          editor: "reference",
        },
        {
          field: "subject",
          editor: "text",
        },
        {
          field: "preview",
          editor: "text",
        },
        {
          field: "body",
          editor: "markdown",
        },
        {
          field: "status",
          editor: "enum",
        },
      ],
    },
    {
      key: "broadcastCreate",
      type: "create",
      entity: "broadcast",
      fields: [
        {
          field: "label",
          editor: "text",
        },
        {
          field: "campaign",
          editor: "reference",
        },
        {
          field: "message",
          editor: "reference",
        },
        {
          field: "audience",
          editor: "reference",
        },
        {
          field: "status",
          editor: "enum",
        },
        {
          field: "scheduledDate",
          editor: "date",
        },
        {
          field: "sentAt",
          editor: "text",
        },
      ],
    },
    {
      key: "broadcastRecipientCreate",
      type: "create",
      entity: "broadcast-recipient",
      fields: [
        {
          field: "label",
          editor: "text",
        },
        {
          field: "broadcast",
          editor: "reference",
        },
        {
          field: "emailAddress",
          editor: "reference",
        },
        {
          field: "subscription",
          editor: "reference",
        },
        {
          field: "status",
          editor: "enum",
        },
        {
          field: "lastEventAt",
          editor: "text",
        },
      ],
    },
  ],
  screens: [
    {
      key: "contacts",
      type: "workspace",
      label: "Contacts",
      path: "/",
      layout: {
        type: "stack",
        width: "wide",
        sections: [
          {
            id: "contacts",
            type: "collection",
            view: "contactHome",
          },
          {
            id: "email-addresses",
            type: "collection",
            view: "emailAddressHome",
          },
          {
            id: "companies",
            type: "collection",
            view: "companyHome",
          },
        ],
      },
    },
    {
      key: "audiences",
      type: "workspace",
      label: "Audiences",
      path: "/audiences",
      layout: {
        type: "stack",
        width: "wide",
        sections: [
          {
            id: "audiences",
            type: "collection",
            view: "audienceHome",
          },
          {
            id: "subscriptions",
            type: "collection",
            view: "subscriptionHome",
          },
        ],
      },
    },
    {
      key: "campaigns",
      type: "workspace",
      label: "Campaigns",
      path: "/campaigns",
      layout: {
        type: "stack",
        width: "wide",
        sections: [
          {
            id: "campaigns",
            type: "collection",
            view: "campaignHome",
          },
          {
            id: "messages",
            type: "collection",
            view: "campaignMessageHome",
          },
        ],
      },
    },
    {
      key: "broadcasts",
      type: "workspace",
      label: "Broadcasts",
      path: "/broadcasts",
      layout: {
        type: "stack",
        width: "wide",
        sections: [
          {
            id: "broadcasts",
            type: "collection",
            view: "broadcastHome",
          },
          {
            id: "recipients",
            type: "collection",
            view: "broadcastRecipientHome",
          },
          {
            id: "delivery-events",
            type: "collection",
            view: "deliveryEventHome",
          },
        ],
      },
    },
  ],
});
