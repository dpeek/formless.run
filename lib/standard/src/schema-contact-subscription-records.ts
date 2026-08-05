import { defineAppSchemaModule } from "@dpeek/formless-schema";
import {
  STANDARD_AUDIENCE_ENTITY_ID,
  STANDARD_EMAIL_ADDRESS_ENTITY_ID,
  STANDARD_SUBSCRIPTION_ENTITY_ID,
} from "./types.ts";

export const standardContactSubscriptionRecordSchemaModule = defineAppSchemaModule({
  key: "standard-contact-subscription-records",
  runtimeRequirements: {
    shared: {
      operationAdapters: ["contact-subscription.subscribe"],
    },
  },
  entities: [
    {
      id: STANDARD_EMAIL_ADDRESS_ENTITY_ID,
      key: "email-address",
      label: "Email address",
      fields: [
        {
          key: "address",
          type: "text",
          required: true,
          label: "Address",
        },
        {
          key: "normalizedAddress",
          type: "text",
          required: true,
          label: "Normalized address",
        },
      ],
      constraints: [
        {
          key: "uniqueNormalizedAddress",
          kind: "unique",
          fields: ["normalizedAddress"],
        },
      ],
      operations: [
        {
          key: "update",
          label: "Update Email address",
          kind: "update",
          scope: "record",
          input: {
            fields: [
              {
                key: "address",
                field: "address",
              },
              {
                key: "normalizedAddress",
                field: "normalizedAddress",
              },
            ],
          },
          effect: {
            type: "patchRecord",
          },
          output: {
            type: "update",
          },
          idempotency: {
            required: true,
          },
          audit: {
            input: "summary",
          },
        },
      ],
    },
    {
      id: STANDARD_AUDIENCE_ENTITY_ID,
      key: "audience",
      label: "Audience",
      fields: [
        {
          key: "key",
          type: "text",
          required: true,
          label: "Key",
        },
        {
          key: "label",
          type: "text",
          required: true,
          label: "Label",
        },
      ],
      constraints: [
        {
          key: "uniqueAudienceKey",
          kind: "unique",
          fields: ["key"],
        },
      ],
      operations: [
        {
          key: "update",
          label: "Update Audience",
          kind: "update",
          scope: "record",
          input: {
            fields: [
              {
                key: "key",
                field: "key",
              },
              {
                key: "label",
                field: "label",
              },
            ],
          },
          effect: {
            type: "patchRecord",
          },
          output: {
            type: "update",
          },
          idempotency: {
            required: true,
          },
          audit: {
            input: "summary",
          },
        },
      ],
    },
    {
      id: STANDARD_SUBSCRIPTION_ENTITY_ID,
      key: "subscription",
      label: "Subscription",
      fields: [
        {
          key: "emailAddress",
          type: "reference",
          required: true,
          label: "Email address",
          to: "email-address",
          displayField: "address",
        },
        {
          key: "audience",
          type: "reference",
          required: true,
          label: "Audience",
          to: "audience",
          displayField: "label",
        },
        {
          key: "status",
          type: "enum",
          required: true,
          label: "Status",
          default: "subscribed",
          values: [
            {
              key: "subscribed",
              label: "Subscribed",
            },
            {
              key: "unsubscribed",
              label: "Unsubscribed",
            },
          ],
        },
        {
          key: "consentedAt",
          type: "text",
          required: true,
          label: "Consented at",
        },
        {
          key: "sourceKind",
          type: "enum",
          required: true,
          label: "Source kind",
          default: "publicOperation",
          values: [
            {
              key: "publicOperation",
              label: "Public operation",
            },
          ],
        },
        {
          key: "sourceTargetKind",
          type: "enum",
          required: true,
          label: "Target kind",
          values: [
            {
              key: "program",
              label: "Program",
            },
          ],
        },
        {
          key: "sourceSchemaKey",
          type: "text",
          required: true,
          label: "Source schema key",
        },
        {
          key: "sourceApiRoutePrefix",
          type: "text",
          required: true,
          label: "API route prefix",
        },
        {
          key: "sourceOperationKey",
          type: "text",
          required: true,
          label: "Operation key",
        },
        {
          key: "sourceHost",
          type: "text",
          required: true,
          label: "Host",
        },
        {
          key: "sourcePath",
          type: "text",
          required: true,
          label: "Path",
        },
        {
          key: "sourceSiteBlockId",
          type: "text",
          required: false,
          label: "Site block",
        },
      ],
      constraints: [
        {
          key: "uniqueEmailAudience",
          kind: "unique",
          fields: ["emailAddress", "audience"],
        },
      ],
      operations: [
        {
          key: "update",
          label: "Update Subscription",
          kind: "update",
          scope: "record",
          input: {
            fields: [
              {
                key: "emailAddress",
                field: "emailAddress",
              },
              {
                key: "audience",
                field: "audience",
              },
              {
                key: "status",
                field: "status",
              },
              {
                key: "consentedAt",
                field: "consentedAt",
              },
              {
                key: "sourceKind",
                field: "sourceKind",
              },
              {
                key: "sourceTargetKind",
                field: "sourceTargetKind",
              },
              {
                key: "sourceSchemaKey",
                field: "sourceSchemaKey",
              },
              {
                key: "sourceApiRoutePrefix",
                field: "sourceApiRoutePrefix",
              },
              {
                key: "sourceOperationKey",
                field: "sourceOperationKey",
              },
              {
                key: "sourceHost",
                field: "sourceHost",
              },
              {
                key: "sourcePath",
                field: "sourcePath",
              },
              {
                key: "sourceSiteBlockId",
                field: "sourceSiteBlockId",
              },
            ],
          },
          effect: {
            type: "patchRecord",
          },
          output: {
            type: "update",
          },
          idempotency: {
            required: true,
          },
          audit: {
            input: "summary",
          },
        },
        {
          key: "subscribe",
          label: "Subscribe",
          kind: "command",
          scope: "collection",
          input: {
            fields: [
              {
                key: "email",
                type: "text",
                required: true,
                label: "Email",
              },
            ],
          },
          effect: {
            type: "operationHandler",
            handler: "contact-subscription.subscribe",
            config: {},
          },
          output: {
            type: "command",
          },
          idempotency: {
            required: true,
          },
          audit: {
            input: "summary",
          },
          policy: {
            actors: ["anonymous"],
            access: {
              actor: "anonymous",
              challenge: {
                kind: "turnstile",
              },
              origin: {
                kind: "same-origin",
              },
            },
          },
        },
      ],
    },
  ],
  relationships: [
    {
      key: "subscriptionEmailAddress",
      kind: "toOne",
      label: "Email address",
      from: {
        entity: "subscription",
        field: "emailAddress",
      },
      to: {
        entity: "email-address",
      },
      inverse: "emailAddressSubscriptions",
    },
    {
      key: "emailAddressSubscriptions",
      kind: "toMany",
      label: "Subscriptions",
      from: {
        entity: "email-address",
      },
      to: {
        entity: "subscription",
        field: "emailAddress",
      },
      inverse: "subscriptionEmailAddress",
    },
    {
      key: "subscriptionAudience",
      kind: "toOne",
      label: "Audience",
      from: {
        entity: "subscription",
        field: "audience",
      },
      to: {
        entity: "audience",
      },
      inverse: "audienceSubscriptions",
    },
    {
      key: "audienceSubscriptions",
      kind: "toMany",
      label: "Subscriptions",
      from: {
        entity: "audience",
      },
      to: {
        entity: "subscription",
        field: "audience",
      },
      inverse: "subscriptionAudience",
    },
  ],
  queries: [
    {
      key: "emailAddressAll",
      label: "All",
      entity: "email-address",
      expression: {
        kind: "all",
      },
    },
    {
      key: "audienceAll",
      label: "All",
      entity: "audience",
      expression: {
        kind: "all",
      },
    },
    {
      key: "subscriptionAll",
      label: "All",
      entity: "subscription",
      expression: {
        kind: "all",
      },
    },
  ],
});
