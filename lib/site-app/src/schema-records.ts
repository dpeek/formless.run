import { defineAppSchemaModule } from "@dpeek/formless-schema";

export const siteRecordSchemaModule = defineAppSchemaModule({
  key: "site-records",
  entities: [
    {
      id: "entity_610ac202-b123-46ed-8bd3-5b65383e2233",
      key: "site",
      label: "Site",
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
        {
          key: "description",
          type: "text",
          required: false,
          label: "Description",
          format: "longText",
        },
        {
          key: "icon",
          type: "text",
          required: false,
          label: "Icon",
          format: "icon",
        },
        {
          key: "initialThemeMode",
          type: "enum",
          required: false,
          label: "Initial theme",
          default: "system",
          values: [
            {
              key: "system",
              label: "System",
            },
            {
              key: "light",
              label: "Light",
            },
            {
              key: "dark",
              label: "Dark",
            },
          ],
        },
        {
          key: "themeSwitchable",
          type: "boolean",
          required: false,
          label: "Allow visitors to switch theme",
          default: true,
        },
      ],
      constraints: [
        {
          key: "uniqueSiteKey",
          kind: "unique",
          fields: ["key"],
        },
      ],
      operations: [
        {
          key: "update",
          label: "Update Site",
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
              {
                key: "description",
                field: "description",
              },
              {
                key: "icon",
                field: "icon",
              },
              {
                key: "initialThemeMode",
                field: "initialThemeMode",
              },
              {
                key: "themeSwitchable",
                field: "themeSwitchable",
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
      id: "entity_8aa7cc1a-c9a7-482e-b078-6ef5478794e2",
      key: "block",
      label: "Block",
      fields: [
        {
          key: "type",
          type: "enum",
          required: true,
          label: "Type",
          values: [
            {
              key: "page",
              label: "Page",
            },
            {
              key: "post",
              label: "Post",
            },
            {
              key: "project",
              label: "Project",
            },
            {
              key: "postList",
              label: "Post list",
            },
            {
              key: "projectList",
              label: "Project list",
            },
            {
              key: "subscribeForm",
              label: "Subscribe form",
            },
            {
              key: "contactForm",
              label: "Contact form",
            },
            {
              key: "publicOperationForm",
              label: "Public operation form",
            },
            {
              key: "group",
              label: "Group",
            },
            {
              key: "section",
              label: "Section",
            },
            {
              key: "cardGrid",
              label: "Card grid",
            },
            {
              key: "card",
              label: "Card",
            },
            {
              key: "metricGrid",
              label: "Metric grid",
            },
            {
              key: "metric",
              label: "Metric",
            },
            {
              key: "header",
              label: "Header",
            },
            {
              key: "headerPrimary",
              label: "Header primary",
            },
            {
              key: "headerSecondary",
              label: "Header secondary",
            },
            {
              key: "footer",
              label: "Footer",
            },
            {
              key: "footerSection",
              label: "Footer section",
            },
            {
              key: "footerSocial",
              label: "Footer social",
            },
            {
              key: "link",
              label: "Link",
            },
            {
              key: "markdown",
              label: "Markdown",
            },
            {
              key: "hero",
              label: "Hero",
            },
            {
              key: "feature",
              label: "Feature",
            },
            {
              key: "image",
              label: "Image",
            },
          ],
        },
        {
          key: "label",
          type: "text",
          required: true,
          label: "Label",
        },
        {
          key: "body",
          type: "text",
          required: false,
          label: "Body",
          format: "markdown",
        },
        {
          key: "operationName",
          type: "text",
          required: false,
          label: "Operation",
        },
        {
          key: "operationKey",
          type: "text",
          required: false,
          label: "Operation key",
        },
        {
          key: "buttonLabel",
          type: "text",
          required: false,
          label: "Button label",
        },
        {
          key: "successLabel",
          type: "text",
          required: false,
          label: "Success label",
        },
        {
          key: "nameLabel",
          type: "text",
          required: false,
          label: "Name label",
        },
        {
          key: "emailLabel",
          type: "text",
          required: false,
          label: "Email label",
        },
        {
          key: "messageLabel",
          type: "text",
          required: false,
          label: "Message label",
        },
        {
          key: "operationNotificationMode",
          type: "enum",
          required: false,
          label: "Input notification",
          values: [
            {
              key: "none",
              label: "None",
            },
            {
              key: "email",
              label: "Email",
            },
          ],
        },
        {
          key: "operationNotificationReplyToField",
          type: "text",
          required: false,
          label: "Reply-to input field",
        },
        {
          key: "href",
          type: "text",
          required: false,
          label: "Link",
          format: "href",
        },
        {
          key: "mediaAssetId",
          type: "text",
          required: false,
          label: "Media asset",
        },
        {
          key: "date",
          type: "date",
          required: false,
          label: "Date",
        },
        {
          key: "linkTargetMode",
          type: "enum",
          required: false,
          label: "Link target",
          values: [
            {
              key: "internal",
              label: "Internal",
            },
            {
              key: "external",
              label: "External",
            },
          ],
        },
        {
          key: "linkTargetBlock",
          type: "reference",
          required: false,
          label: "Target block",
          to: "block",
          displayField: "label",
        },
        {
          key: "icon",
          type: "text",
          required: false,
          label: "Icon",
          format: "icon",
        },
        {
          key: "color",
          type: "text",
          required: false,
          label: "Color",
          format: "color",
        },
        {
          key: "alignment",
          type: "enum",
          required: false,
          label: "Media side",
          values: [
            {
              key: "left",
              label: "Left",
            },
            {
              key: "right",
              label: "Right",
            },
          ],
        },
        {
          key: "width",
          type: "number",
          required: false,
          label: "Width",
          integer: true,
          min: 0,
        },
        {
          key: "height",
          type: "number",
          required: false,
          label: "Height",
          integer: true,
          min: 0,
        },
      ],
      operations: [
        {
          key: "create",
          label: "Create Block",
          kind: "create",
          scope: "collection",
          input: {
            fields: [
              {
                key: "type",
                field: "type",
              },
              {
                key: "label",
                field: "label",
              },
              {
                key: "body",
                field: "body",
              },
              {
                key: "operationName",
                field: "operationName",
              },
              {
                key: "operationKey",
                field: "operationKey",
              },
              {
                key: "buttonLabel",
                field: "buttonLabel",
              },
              {
                key: "successLabel",
                field: "successLabel",
              },
              {
                key: "nameLabel",
                field: "nameLabel",
              },
              {
                key: "emailLabel",
                field: "emailLabel",
              },
              {
                key: "messageLabel",
                field: "messageLabel",
              },
              {
                key: "operationNotificationMode",
                field: "operationNotificationMode",
              },
              {
                key: "operationNotificationReplyToField",
                field: "operationNotificationReplyToField",
              },
              {
                key: "href",
                field: "href",
              },
              {
                key: "mediaAssetId",
                field: "mediaAssetId",
              },
              {
                key: "date",
                field: "date",
              },
              {
                key: "linkTargetMode",
                field: "linkTargetMode",
              },
              {
                key: "linkTargetBlock",
                field: "linkTargetBlock",
              },
              {
                key: "icon",
                field: "icon",
              },
              {
                key: "color",
                field: "color",
              },
              {
                key: "alignment",
                field: "alignment",
              },
              {
                key: "width",
                field: "width",
              },
              {
                key: "height",
                field: "height",
              },
            ],
          },
          effect: {
            type: "createRecord",
          },
          output: {
            type: "create",
          },
          idempotency: {
            required: true,
          },
          audit: {
            input: "summary",
          },
        },
        {
          key: "update",
          label: "Update Block",
          kind: "update",
          scope: "record",
          input: {
            fields: [
              {
                key: "type",
                field: "type",
              },
              {
                key: "label",
                field: "label",
              },
              {
                key: "body",
                field: "body",
              },
              {
                key: "operationName",
                field: "operationName",
              },
              {
                key: "operationKey",
                field: "operationKey",
              },
              {
                key: "buttonLabel",
                field: "buttonLabel",
              },
              {
                key: "successLabel",
                field: "successLabel",
              },
              {
                key: "nameLabel",
                field: "nameLabel",
              },
              {
                key: "emailLabel",
                field: "emailLabel",
              },
              {
                key: "messageLabel",
                field: "messageLabel",
              },
              {
                key: "operationNotificationMode",
                field: "operationNotificationMode",
              },
              {
                key: "operationNotificationReplyToField",
                field: "operationNotificationReplyToField",
              },
              {
                key: "href",
                field: "href",
              },
              {
                key: "mediaAssetId",
                field: "mediaAssetId",
              },
              {
                key: "date",
                field: "date",
              },
              {
                key: "linkTargetMode",
                field: "linkTargetMode",
              },
              {
                key: "linkTargetBlock",
                field: "linkTargetBlock",
              },
              {
                key: "icon",
                field: "icon",
              },
              {
                key: "color",
                field: "color",
              },
              {
                key: "alignment",
                field: "alignment",
              },
              {
                key: "width",
                field: "width",
              },
              {
                key: "height",
                field: "height",
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
          key: "delete",
          label: "Delete Block",
          kind: "delete",
          scope: "record",
          effect: {
            type: "deleteRecord",
          },
          output: {
            type: "delete",
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
      id: "entity_3d195c79-db03-4da4-95c8-433266271b21",
      key: "block-placement",
      label: "Placement",
      fields: [
        {
          key: "parent",
          type: "reference",
          required: true,
          label: "Parent block",
          to: "block",
          displayField: "label",
        },
        {
          key: "block",
          type: "reference",
          required: true,
          label: "Child block",
          to: "block",
          displayField: "label",
        },
        {
          key: "order",
          type: "number",
          required: true,
          label: "Order",
          default: 1000,
          min: 0,
        },
        {
          key: "label",
          type: "text",
          required: false,
          label: "Label",
        },
        {
          key: "slot",
          type: "text",
          required: false,
          label: "Slot",
        },
      ],
      operations: [
        {
          key: "create",
          label: "Create Placement",
          kind: "create",
          scope: "collection",
          input: {
            fields: [
              {
                key: "parent",
                field: "parent",
              },
              {
                key: "block",
                field: "block",
              },
              {
                key: "order",
                field: "order",
              },
              {
                key: "label",
                field: "label",
              },
              {
                key: "slot",
                field: "slot",
              },
            ],
          },
          effect: {
            type: "createRecord",
          },
          output: {
            type: "create",
          },
          idempotency: {
            required: true,
          },
          audit: {
            input: "summary",
          },
        },
        {
          key: "update",
          label: "Update Placement",
          kind: "update",
          scope: "record",
          input: {
            fields: [
              {
                key: "parent",
                field: "parent",
              },
              {
                key: "block",
                field: "block",
              },
              {
                key: "order",
                field: "order",
              },
              {
                key: "label",
                field: "label",
              },
              {
                key: "slot",
                field: "slot",
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
          key: "addTreeChild",
          label: "Add child",
          kind: "command",
          scope: "record",
          effect: {
            type: "operationHandler",
            handler: "create-tree-child",
            config: {
              relationship: "blockPlacements",
              childField: "block",
              orderField: "order",
            },
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
        },
        {
          key: "removeTreePlacement",
          label: "Remove child",
          kind: "command",
          scope: "record",
          effect: {
            type: "operationHandler",
            handler: "remove-tree-placement",
            config: {
              relationship: "blockPlacements",
            },
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
        },
      ],
    },
    {
      id: "entity_dd5c1285-721a-4294-8114-efd784b6a578",
      key: "contact",
      label: "Contact",
      fields: [
        {
          key: "label",
          type: "text",
          required: true,
          label: "Label",
        },
      ],
      operations: [
        {
          key: "update",
          label: "Update Contact",
          kind: "update",
          scope: "record",
          input: {
            fields: [
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
      id: "entity_5a3667a2-a5a7-46ed-b3a4-b6364bae31a0",
      key: "contact-message",
      label: "Contact message",
      fields: [
        {
          key: "name",
          type: "text",
          required: true,
          label: "Name",
        },
        {
          key: "email",
          type: "text",
          required: true,
          label: "Email",
        },
        {
          key: "message",
          type: "text",
          required: true,
          label: "Message",
          format: "longText",
        },
      ],
      operations: [
        {
          key: "submit",
          label: "Submit message",
          kind: "create",
          scope: "collection",
          input: {
            fields: [
              {
                key: "name",
                field: "name",
                required: true,
              },
              {
                key: "email",
                field: "email",
                required: true,
              },
              {
                key: "message",
                field: "message",
                required: true,
              },
            ],
          },
          effect: {
            type: "createRecord",
          },
          output: {
            type: "create",
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
    {
      id: "entity_9863574c-952d-41a9-b90e-b40f6eda5eba",
      key: "email-address",
      label: "Email address",
      fields: [
        {
          key: "contact",
          type: "reference",
          required: true,
          label: "Contact",
          to: "contact",
          displayField: "label",
        },
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
                key: "contact",
                field: "contact",
              },
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
      id: "entity_8999782d-0e12-4e4b-8830-0e60cb3f1179",
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
      id: "entity_da574ad0-f310-4542-927e-c76dd89402f0",
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
            handler: "subscribe",
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
      key: "placementParent",
      kind: "toOne",
      label: "Parent block",
      from: {
        entity: "block-placement",
        field: "parent",
      },
      to: {
        entity: "block",
      },
      inverse: "blockPlacements",
    },
    {
      key: "blockPlacements",
      kind: "toMany",
      label: "Placements",
      from: {
        entity: "block",
      },
      to: {
        entity: "block-placement",
        field: "parent",
      },
      inverse: "placementParent",
    },
    {
      key: "placementBlock",
      kind: "toOne",
      label: "Child block",
      from: {
        entity: "block-placement",
        field: "block",
      },
      to: {
        entity: "block",
      },
      inverse: "blockUsedInPlacements",
    },
    {
      key: "blockUsedInPlacements",
      kind: "toMany",
      label: "Used in placements",
      from: {
        entity: "block",
      },
      to: {
        entity: "block-placement",
        field: "block",
      },
      inverse: "placementBlock",
    },
    {
      key: "emailAddressContact",
      kind: "toOne",
      label: "Contact",
      from: {
        entity: "email-address",
        field: "contact",
      },
      to: {
        entity: "contact",
      },
      inverse: "contactEmailAddresses",
    },
    {
      key: "contactEmailAddresses",
      kind: "toMany",
      label: "Email addresses",
      from: {
        entity: "contact",
      },
      to: {
        entity: "email-address",
        field: "contact",
      },
      inverse: "emailAddressContact",
    },
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
  unions: [
    {
      key: "blockByType",
      entity: "block",
      discriminator: "type",
      variants: [
        {
          key: "page",
          label: "Page",
          fields: ["label", "href", "icon"],
          requiredFields: ["label", "href"],
        },
        {
          key: "post",
          label: "Post",
          fields: ["label", "date", "body", "href"],
          requiredFields: ["label", "href"],
        },
        {
          key: "project",
          label: "Project",
          fields: ["label", "date", "body", "href"],
          requiredFields: ["label", "href"],
        },
        {
          key: "postList",
          label: "Post list",
          fields: ["label"],
        },
        {
          key: "projectList",
          label: "Project list",
          fields: ["label"],
        },
        {
          key: "subscribeForm",
          label: "Subscribe form",
          fields: ["label", "body", "operationName", "buttonLabel"],
        },
        {
          key: "contactForm",
          label: "Contact form",
          fields: [
            "label",
            "body",
            "operationName",
            "buttonLabel",
            "successLabel",
            "nameLabel",
            "emailLabel",
            "messageLabel",
          ],
        },
        {
          key: "publicOperationForm",
          label: "Public operation form",
          fields: [
            "label",
            "body",
            "operationKey",
            "buttonLabel",
            "successLabel",
            "operationNotificationMode",
            "operationNotificationReplyToField",
          ],
        },
        {
          key: "group",
          label: "Group",
          fields: ["label"],
        },
        {
          key: "section",
          label: "Section",
          fields: ["label", "body"],
        },
        {
          key: "cardGrid",
          label: "Card grid",
          fields: ["label", "body"],
        },
        {
          key: "card",
          label: "Card",
          fields: ["label", "body", "icon", "color"],
        },
        {
          key: "metricGrid",
          label: "Metric grid",
          fields: ["label", "body"],
        },
        {
          key: "metric",
          label: "Metric",
          fields: ["label", "body", "color"],
        },
        {
          key: "header",
          label: "Header",
          fields: ["label"],
        },
        {
          key: "headerPrimary",
          label: "Header primary",
          fields: ["label"],
        },
        {
          key: "headerSecondary",
          label: "Header secondary",
          fields: ["label"],
        },
        {
          key: "footer",
          label: "Footer",
          fields: ["label"],
        },
        {
          key: "footerSection",
          label: "Footer section",
          fields: ["label"],
        },
        {
          key: "footerSocial",
          label: "Footer social",
          fields: ["label"],
        },
        {
          key: "link",
          label: "Link",
          fields: ["label", "linkTargetMode", "linkTargetBlock", "href", "icon"],
          requiredFields: ["label", "linkTargetMode"],
        },
        {
          key: "markdown",
          label: "Markdown",
          fields: ["label", "body"],
        },
        {
          key: "hero",
          label: "Hero",
          fields: ["label", "body"],
        },
        {
          key: "feature",
          label: "Feature",
          fields: ["label", "body", "alignment"],
        },
        {
          key: "image",
          label: "Image",
          fields: ["label", "mediaAssetId"],
          requiredFields: ["label"],
        },
      ],
      fallback: {
        label: "Block",
        fields: ["label", "type"],
      },
    },
  ],
  queries: [
    {
      key: "sitePrimary",
      label: "Primary",
      entity: "site",
      expression: {
        kind: "where",
        ref: {
          kind: "value",
          name: "key",
        },
        op: "eq",
        value: "primary",
      },
    },
    {
      key: "blockAll",
      label: "All",
      entity: "block",
      expression: {
        kind: "all",
      },
    },
    {
      key: "blockPages",
      label: "Pages",
      entity: "block",
      expression: {
        kind: "where",
        ref: {
          kind: "value",
          name: "type",
        },
        op: "eq",
        value: "page",
      },
    },
    {
      key: "blockNavigationRoots",
      label: "Navigation",
      entity: "block",
      expression: {
        kind: "or",
        expressions: [
          {
            kind: "where",
            ref: {
              kind: "value",
              name: "type",
            },
            op: "eq",
            value: "header",
          },
          {
            kind: "where",
            ref: {
              kind: "value",
              name: "type",
            },
            op: "eq",
            value: "footer",
          },
        ],
      },
    },
    {
      key: "blockSiteRoots",
      label: "Site roots",
      entity: "block",
      expression: {
        kind: "or",
        expressions: [
          {
            kind: "where",
            ref: {
              kind: "value",
              name: "type",
            },
            op: "eq",
            value: "page",
          },
          {
            kind: "where",
            ref: {
              kind: "value",
              name: "type",
            },
            op: "eq",
            value: "post",
          },
          {
            kind: "where",
            ref: {
              kind: "value",
              name: "type",
            },
            op: "eq",
            value: "project",
          },
          {
            kind: "where",
            ref: {
              kind: "value",
              name: "type",
            },
            op: "eq",
            value: "header",
          },
          {
            kind: "where",
            ref: {
              kind: "value",
              name: "type",
            },
            op: "eq",
            value: "footer",
          },
        ],
      },
    },
    {
      key: "blockPosts",
      label: "Posts",
      entity: "block",
      expression: {
        kind: "where",
        ref: {
          kind: "value",
          name: "type",
        },
        op: "eq",
        value: "post",
      },
    },
    {
      key: "blockProjects",
      label: "Projects",
      entity: "block",
      expression: {
        kind: "where",
        ref: {
          kind: "value",
          name: "type",
        },
        op: "eq",
        value: "project",
      },
    },
    {
      key: "blockLinks",
      label: "Links",
      entity: "block",
      expression: {
        kind: "where",
        ref: {
          kind: "value",
          name: "type",
        },
        op: "eq",
        value: "link",
      },
    },
    {
      key: "blockGroups",
      label: "Groups",
      entity: "block",
      expression: {
        kind: "where",
        ref: {
          kind: "value",
          name: "type",
        },
        op: "eq",
        value: "group",
      },
    },
    {
      key: "blockImages",
      label: "Images",
      entity: "block",
      expression: {
        kind: "where",
        ref: {
          kind: "value",
          name: "type",
        },
        op: "eq",
        value: "image",
      },
    },
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
    {
      key: "contactMessageAll",
      label: "All",
      entity: "contact-message",
      expression: {
        kind: "all",
      },
    },
    {
      key: "placementsForSelectedBlock",
      label: "Selected block",
      entity: "block-placement",
      expression: {
        kind: "where",
        ref: {
          kind: "value",
          name: "parent",
        },
        op: "eq",
        value: {
          kind: "context",
          name: "block",
        },
      },
    },
  ],
});
