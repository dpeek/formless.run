import { defineAppSchemaModule } from "@dpeek/formless-schema";

export const crmRecordSchemaModule = defineAppSchemaModule({
  key: "crm-records",
  entities: [
    {
      id: "entity_e40c8914-c095-4483-b372-90f1c28f6cf4",
      key: "company",
      label: "Company",
      fields: [
        {
          key: "name",
          type: "text",
          required: true,
          label: "Name",
        },
        {
          key: "website",
          type: "text",
          required: false,
          label: "Website",
          format: "href",
        },
        {
          key: "status",
          type: "enum",
          required: true,
          label: "Status",
          default: "prospect",
          values: [
            {
              key: "prospect",
              label: "Prospect",
            },
            {
              key: "customer",
              label: "Customer",
            },
            {
              key: "partner",
              label: "Partner",
            },
            {
              key: "archived",
              label: "Archived",
            },
          ],
        },
        {
          key: "notes",
          type: "text",
          required: false,
          label: "Notes",
          format: "longText",
        },
      ],
      constraints: [
        {
          key: "uniqueCompanyName",
          kind: "unique",
          fields: ["name"],
        },
      ],
      operations: [
        {
          key: "create",
          label: "Create Company",
          kind: "create",
          scope: "collection",
          input: {
            fields: [
              {
                key: "name",
                field: "name",
              },
              {
                key: "website",
                field: "website",
              },
              {
                key: "status",
                field: "status",
              },
              {
                key: "notes",
                field: "notes",
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
          label: "Update Company",
          kind: "update",
          scope: "record",
          input: {
            fields: [
              {
                key: "name",
                field: "name",
              },
              {
                key: "website",
                field: "website",
              },
              {
                key: "status",
                field: "status",
              },
              {
                key: "notes",
                field: "notes",
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
      id: "entity_429d42b9-0765-4351-86a3-24a3e31ccb05",
      key: "contact",
      label: "Contact",
      fields: [
        {
          key: "label",
          type: "text",
          required: true,
          label: "Name",
        },
        {
          key: "company",
          type: "reference",
          required: false,
          label: "Company",
          to: "company",
          displayField: "name",
        },
        {
          key: "role",
          type: "text",
          required: false,
          label: "Role",
        },
        {
          key: "lifecycle",
          type: "enum",
          required: true,
          label: "Lifecycle",
          default: "lead",
          values: [
            {
              key: "lead",
              label: "Lead",
            },
            {
              key: "customer",
              label: "Customer",
            },
            {
              key: "advocate",
              label: "Advocate",
            },
            {
              key: "archived",
              label: "Archived",
            },
          ],
        },
        {
          key: "source",
          type: "enum",
          required: true,
          label: "Source",
          default: "owner",
          values: [
            {
              key: "owner",
              label: "Owner",
            },
            {
              key: "import",
              label: "Import",
            },
            {
              key: "site",
              label: "Site",
            },
            {
              key: "event",
              label: "Event",
            },
            {
              key: "publicOperation",
              label: "Public operation",
            },
          ],
        },
        {
          key: "notes",
          type: "text",
          required: false,
          label: "Notes",
          format: "longText",
        },
      ],
      operations: [
        {
          key: "create",
          label: "Create Contact",
          kind: "create",
          scope: "collection",
          input: {
            fields: [
              {
                key: "label",
                field: "label",
              },
              {
                key: "company",
                field: "company",
              },
              {
                key: "role",
                field: "role",
              },
              {
                key: "lifecycle",
                field: "lifecycle",
              },
              {
                key: "source",
                field: "source",
              },
              {
                key: "notes",
                field: "notes",
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
          label: "Update Contact",
          kind: "update",
          scope: "record",
          input: {
            fields: [
              {
                key: "label",
                field: "label",
              },
              {
                key: "company",
                field: "company",
              },
              {
                key: "role",
                field: "role",
              },
              {
                key: "lifecycle",
                field: "lifecycle",
              },
              {
                key: "source",
                field: "source",
              },
              {
                key: "notes",
                field: "notes",
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
      id: "entity_5bff2f07-24e4-4343-80ed-245c3e5498f9",
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
        {
          key: "status",
          type: "enum",
          required: true,
          label: "Status",
          default: "active",
          values: [
            {
              key: "active",
              label: "Active",
            },
            {
              key: "bounced",
              label: "Bounced",
            },
            {
              key: "suppressed",
              label: "Suppressed",
            },
          ],
        },
        {
          key: "primary",
          type: "boolean",
          required: true,
          label: "Primary",
          default: true,
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
          key: "create",
          label: "Create Email address",
          kind: "create",
          scope: "collection",
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
              {
                key: "status",
                field: "status",
              },
              {
                key: "primary",
                field: "primary",
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
              {
                key: "status",
                field: "status",
              },
              {
                key: "primary",
                field: "primary",
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
      id: "entity_b8bcdb7d-bc88-4d56-8b6a-ad19c528261e",
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
        {
          key: "description",
          type: "text",
          required: false,
          label: "Description",
          format: "longText",
        },
        {
          key: "status",
          type: "enum",
          required: true,
          label: "Status",
          default: "active",
          values: [
            {
              key: "active",
              label: "Active",
            },
            {
              key: "archived",
              label: "Archived",
            },
          ],
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
          key: "create",
          label: "Create Audience",
          kind: "create",
          scope: "collection",
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
                key: "status",
                field: "status",
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
              {
                key: "description",
                field: "description",
              },
              {
                key: "status",
                field: "status",
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
      id: "entity_86f066c0-929c-41e3-a52c-516aab023e96",
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
            {
              key: "pending",
              label: "Pending",
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
          default: "owner",
          values: [
            {
              key: "owner",
              label: "Owner",
            },
            {
              key: "import",
              label: "Import",
            },
            {
              key: "site",
              label: "Site",
            },
            {
              key: "event",
              label: "Event",
            },
            {
              key: "publicOperation",
              label: "Public operation",
            },
          ],
        },
        {
          key: "sourceLabel",
          type: "text",
          required: false,
          label: "Source",
        },
        {
          key: "sourceTargetKind",
          type: "enum",
          required: false,
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
          required: false,
          label: "Source schema key",
        },
        {
          key: "sourceApiRoutePrefix",
          type: "text",
          required: false,
          label: "API route prefix",
        },
        {
          key: "sourceOperationKey",
          type: "text",
          required: false,
          label: "Operation key",
        },
        {
          key: "sourceHost",
          type: "text",
          required: false,
          label: "Host",
        },
        {
          key: "sourcePath",
          type: "text",
          required: false,
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
          key: "create",
          label: "Create Subscription",
          kind: "create",
          scope: "collection",
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
                key: "sourceLabel",
                field: "sourceLabel",
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
                key: "sourceLabel",
                field: "sourceLabel",
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
    {
      id: "entity_83c65a85-3c84-4248-8836-edb9dffe19ab",
      key: "campaign",
      label: "Campaign",
      fields: [
        {
          key: "name",
          type: "text",
          required: true,
          label: "Name",
        },
        {
          key: "status",
          type: "enum",
          required: true,
          label: "Status",
          default: "draft",
          values: [
            {
              key: "draft",
              label: "Draft",
            },
            {
              key: "active",
              label: "Active",
            },
            {
              key: "archived",
              label: "Archived",
            },
          ],
        },
        {
          key: "objective",
          type: "text",
          required: false,
          label: "Objective",
          format: "longText",
        },
        {
          key: "startsOn",
          type: "date",
          required: false,
          label: "Starts on",
        },
      ],
      operations: [
        {
          key: "create",
          label: "Create Campaign",
          kind: "create",
          scope: "collection",
          input: {
            fields: [
              {
                key: "name",
                field: "name",
              },
              {
                key: "status",
                field: "status",
              },
              {
                key: "objective",
                field: "objective",
              },
              {
                key: "startsOn",
                field: "startsOn",
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
          label: "Update Campaign",
          kind: "update",
          scope: "record",
          input: {
            fields: [
              {
                key: "name",
                field: "name",
              },
              {
                key: "status",
                field: "status",
              },
              {
                key: "objective",
                field: "objective",
              },
              {
                key: "startsOn",
                field: "startsOn",
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
      id: "entity_618efec7-409f-4d43-9785-f1d60d9101ff",
      key: "campaign-message",
      label: "Campaign message",
      fields: [
        {
          key: "campaign",
          type: "reference",
          required: true,
          label: "Campaign",
          to: "campaign",
          displayField: "name",
        },
        {
          key: "subject",
          type: "text",
          required: true,
          label: "Subject",
        },
        {
          key: "preview",
          type: "text",
          required: false,
          label: "Preview",
        },
        {
          key: "body",
          type: "text",
          required: false,
          label: "Body",
          format: "markdown",
        },
        {
          key: "status",
          type: "enum",
          required: true,
          label: "Status",
          default: "draft",
          values: [
            {
              key: "draft",
              label: "Draft",
            },
            {
              key: "ready",
              label: "Ready",
            },
            {
              key: "archived",
              label: "Archived",
            },
          ],
        },
      ],
      operations: [
        {
          key: "create",
          label: "Create Campaign message",
          kind: "create",
          scope: "collection",
          input: {
            fields: [
              {
                key: "campaign",
                field: "campaign",
              },
              {
                key: "subject",
                field: "subject",
              },
              {
                key: "preview",
                field: "preview",
              },
              {
                key: "body",
                field: "body",
              },
              {
                key: "status",
                field: "status",
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
          label: "Update Campaign message",
          kind: "update",
          scope: "record",
          input: {
            fields: [
              {
                key: "campaign",
                field: "campaign",
              },
              {
                key: "subject",
                field: "subject",
              },
              {
                key: "preview",
                field: "preview",
              },
              {
                key: "body",
                field: "body",
              },
              {
                key: "status",
                field: "status",
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
      id: "entity_b80330bf-5f64-4460-8b4e-8f43fa150001",
      key: "broadcast",
      label: "Broadcast",
      fields: [
        {
          key: "label",
          type: "text",
          required: true,
          label: "Label",
        },
        {
          key: "campaign",
          type: "reference",
          required: true,
          label: "Campaign",
          to: "campaign",
          displayField: "name",
        },
        {
          key: "message",
          type: "reference",
          required: true,
          label: "Message",
          to: "campaign-message",
          displayField: "subject",
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
          default: "draft",
          values: [
            {
              key: "draft",
              label: "Draft",
            },
            {
              key: "scheduled",
              label: "Scheduled",
            },
            {
              key: "sent",
              label: "Sent",
            },
            {
              key: "paused",
              label: "Paused",
            },
            {
              key: "canceled",
              label: "Canceled",
            },
          ],
        },
        {
          key: "scheduledDate",
          type: "date",
          required: false,
          label: "Scheduled date",
        },
        {
          key: "sentAt",
          type: "text",
          required: false,
          label: "Sent at",
        },
      ],
      operations: [
        {
          key: "create",
          label: "Create Broadcast",
          kind: "create",
          scope: "collection",
          input: {
            fields: [
              {
                key: "label",
                field: "label",
              },
              {
                key: "campaign",
                field: "campaign",
              },
              {
                key: "message",
                field: "message",
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
                key: "scheduledDate",
                field: "scheduledDate",
              },
              {
                key: "sentAt",
                field: "sentAt",
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
          label: "Update Broadcast",
          kind: "update",
          scope: "record",
          input: {
            fields: [
              {
                key: "label",
                field: "label",
              },
              {
                key: "campaign",
                field: "campaign",
              },
              {
                key: "message",
                field: "message",
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
                key: "scheduledDate",
                field: "scheduledDate",
              },
              {
                key: "sentAt",
                field: "sentAt",
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
      id: "entity_441f44bb-63e0-4f45-a775-4ddfdd5fed4f",
      key: "broadcast-recipient",
      label: "Broadcast recipient",
      fields: [
        {
          key: "label",
          type: "text",
          required: true,
          label: "Label",
        },
        {
          key: "broadcast",
          type: "reference",
          required: true,
          label: "Broadcast",
          to: "broadcast",
          displayField: "label",
        },
        {
          key: "emailAddress",
          type: "reference",
          required: true,
          label: "Email address",
          to: "email-address",
          displayField: "address",
        },
        {
          key: "subscription",
          type: "reference",
          required: true,
          label: "Subscription",
          to: "subscription",
        },
        {
          key: "status",
          type: "enum",
          required: true,
          label: "Status",
          default: "queued",
          values: [
            {
              key: "queued",
              label: "Queued",
            },
            {
              key: "sent",
              label: "Sent",
            },
            {
              key: "skipped",
              label: "Skipped",
            },
            {
              key: "bounced",
              label: "Bounced",
            },
            {
              key: "failed",
              label: "Failed",
            },
          ],
        },
        {
          key: "lastEventAt",
          type: "text",
          required: false,
          label: "Last event at",
        },
      ],
      constraints: [
        {
          key: "uniqueBroadcastEmail",
          kind: "unique",
          fields: ["broadcast", "emailAddress"],
        },
      ],
      operations: [
        {
          key: "create",
          label: "Create Broadcast recipient",
          kind: "create",
          scope: "collection",
          input: {
            fields: [
              {
                key: "label",
                field: "label",
              },
              {
                key: "broadcast",
                field: "broadcast",
              },
              {
                key: "emailAddress",
                field: "emailAddress",
              },
              {
                key: "subscription",
                field: "subscription",
              },
              {
                key: "status",
                field: "status",
              },
              {
                key: "lastEventAt",
                field: "lastEventAt",
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
          label: "Update Broadcast recipient",
          kind: "update",
          scope: "record",
          input: {
            fields: [
              {
                key: "label",
                field: "label",
              },
              {
                key: "broadcast",
                field: "broadcast",
              },
              {
                key: "emailAddress",
                field: "emailAddress",
              },
              {
                key: "subscription",
                field: "subscription",
              },
              {
                key: "status",
                field: "status",
              },
              {
                key: "lastEventAt",
                field: "lastEventAt",
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
      id: "entity_ba93df3a-ac4e-4466-96d0-64dc50eedb10",
      key: "delivery-event",
      label: "Delivery event",
      fields: [
        {
          key: "broadcastRecipient",
          type: "reference",
          required: true,
          label: "Recipient",
          to: "broadcast-recipient",
          displayField: "label",
        },
        {
          key: "eventType",
          type: "enum",
          required: true,
          label: "Event",
          default: "queued",
          values: [
            {
              key: "queued",
              label: "Queued",
            },
            {
              key: "sent",
              label: "Sent",
            },
            {
              key: "delivered",
              label: "Delivered",
            },
            {
              key: "opened",
              label: "Opened",
            },
            {
              key: "clicked",
              label: "Clicked",
            },
            {
              key: "bounced",
              label: "Bounced",
            },
            {
              key: "failed",
              label: "Failed",
            },
          ],
        },
        {
          key: "occurredAt",
          type: "text",
          required: true,
          label: "Occurred at",
        },
        {
          key: "detail",
          type: "text",
          required: false,
          label: "Detail",
          format: "longText",
        },
      ],
    },
  ],
  relationships: [
    {
      key: "contactCompany",
      kind: "toOne",
      label: "Company",
      from: {
        entity: "contact",
        field: "company",
      },
      to: {
        entity: "company",
      },
      inverse: "companyContacts",
    },
    {
      key: "companyContacts",
      kind: "toMany",
      label: "Contacts",
      from: {
        entity: "company",
      },
      to: {
        entity: "contact",
        field: "company",
      },
      inverse: "contactCompany",
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
    {
      key: "emailAddressAudiences",
      kind: "manyToMany",
      label: "Audiences",
      from: {
        entity: "email-address",
      },
      to: {
        entity: "audience",
      },
      through: {
        entity: "subscription",
        fromField: "emailAddress",
        toField: "audience",
        uniqueConstraint: "uniqueEmailAudience",
      },
      inverse: "audienceEmailAddresses",
    },
    {
      key: "audienceEmailAddresses",
      kind: "manyToMany",
      label: "Email addresses",
      from: {
        entity: "audience",
      },
      to: {
        entity: "email-address",
      },
      through: {
        entity: "subscription",
        fromField: "audience",
        toField: "emailAddress",
        uniqueConstraint: "uniqueEmailAudience",
      },
      inverse: "emailAddressAudiences",
    },
    {
      key: "campaignMessageCampaign",
      kind: "toOne",
      label: "Campaign",
      from: {
        entity: "campaign-message",
        field: "campaign",
      },
      to: {
        entity: "campaign",
      },
      inverse: "campaignMessages",
    },
    {
      key: "campaignMessages",
      kind: "toMany",
      label: "Messages",
      from: {
        entity: "campaign",
      },
      to: {
        entity: "campaign-message",
        field: "campaign",
      },
      inverse: "campaignMessageCampaign",
    },
    {
      key: "broadcastCampaign",
      kind: "toOne",
      label: "Campaign",
      from: {
        entity: "broadcast",
        field: "campaign",
      },
      to: {
        entity: "campaign",
      },
      inverse: "campaignBroadcasts",
    },
    {
      key: "campaignBroadcasts",
      kind: "toMany",
      label: "Broadcasts",
      from: {
        entity: "campaign",
      },
      to: {
        entity: "broadcast",
        field: "campaign",
      },
      inverse: "broadcastCampaign",
    },
    {
      key: "broadcastMessage",
      kind: "toOne",
      label: "Message",
      from: {
        entity: "broadcast",
        field: "message",
      },
      to: {
        entity: "campaign-message",
      },
      inverse: "messageBroadcasts",
    },
    {
      key: "messageBroadcasts",
      kind: "toMany",
      label: "Broadcasts",
      from: {
        entity: "campaign-message",
      },
      to: {
        entity: "broadcast",
        field: "message",
      },
      inverse: "broadcastMessage",
    },
    {
      key: "broadcastAudience",
      kind: "toOne",
      label: "Audience",
      from: {
        entity: "broadcast",
        field: "audience",
      },
      to: {
        entity: "audience",
      },
      inverse: "audienceBroadcasts",
    },
    {
      key: "audienceBroadcasts",
      kind: "toMany",
      label: "Broadcasts",
      from: {
        entity: "audience",
      },
      to: {
        entity: "broadcast",
        field: "audience",
      },
      inverse: "broadcastAudience",
    },
    {
      key: "recipientBroadcast",
      kind: "toOne",
      label: "Broadcast",
      from: {
        entity: "broadcast-recipient",
        field: "broadcast",
      },
      to: {
        entity: "broadcast",
      },
      inverse: "broadcastRecipients",
    },
    {
      key: "broadcastRecipients",
      kind: "toMany",
      label: "Recipients",
      from: {
        entity: "broadcast",
      },
      to: {
        entity: "broadcast-recipient",
        field: "broadcast",
      },
      inverse: "recipientBroadcast",
    },
    {
      key: "recipientEmailAddress",
      kind: "toOne",
      label: "Email address",
      from: {
        entity: "broadcast-recipient",
        field: "emailAddress",
      },
      to: {
        entity: "email-address",
      },
      inverse: "emailAddressBroadcastRecipients",
    },
    {
      key: "emailAddressBroadcastRecipients",
      kind: "toMany",
      label: "Broadcast recipients",
      from: {
        entity: "email-address",
      },
      to: {
        entity: "broadcast-recipient",
        field: "emailAddress",
      },
      inverse: "recipientEmailAddress",
    },
    {
      key: "recipientSubscription",
      kind: "toOne",
      label: "Subscription",
      from: {
        entity: "broadcast-recipient",
        field: "subscription",
      },
      to: {
        entity: "subscription",
      },
      inverse: "subscriptionBroadcastRecipients",
    },
    {
      key: "subscriptionBroadcastRecipients",
      kind: "toMany",
      label: "Broadcast recipients",
      from: {
        entity: "subscription",
      },
      to: {
        entity: "broadcast-recipient",
        field: "subscription",
      },
      inverse: "recipientSubscription",
    },
    {
      key: "deliveryEventRecipient",
      kind: "toOne",
      label: "Recipient",
      from: {
        entity: "delivery-event",
        field: "broadcastRecipient",
      },
      to: {
        entity: "broadcast-recipient",
      },
      inverse: "broadcastRecipientDeliveryEvents",
    },
    {
      key: "broadcastRecipientDeliveryEvents",
      kind: "toMany",
      label: "Delivery events",
      from: {
        entity: "broadcast-recipient",
      },
      to: {
        entity: "delivery-event",
        field: "broadcastRecipient",
      },
      inverse: "deliveryEventRecipient",
    },
  ],
  queries: [
    {
      key: "companyAll",
      label: "All",
      entity: "company",
      expression: {
        kind: "all",
      },
    },
    {
      key: "companyCustomers",
      label: "Customers",
      entity: "company",
      expression: {
        kind: "where",
        ref: {
          kind: "value",
          name: "status",
        },
        op: "eq",
        value: "customer",
      },
    },
    {
      key: "contactAll",
      label: "All",
      entity: "contact",
      expression: {
        kind: "all",
      },
    },
    {
      key: "contactLeads",
      label: "Leads",
      entity: "contact",
      expression: {
        kind: "where",
        ref: {
          kind: "value",
          name: "lifecycle",
        },
        op: "eq",
        value: "lead",
      },
    },
    {
      key: "contactCustomers",
      label: "Customers",
      entity: "contact",
      expression: {
        kind: "where",
        ref: {
          kind: "value",
          name: "lifecycle",
        },
        op: "eq",
        value: "customer",
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
      key: "emailAddressActive",
      label: "Active",
      entity: "email-address",
      expression: {
        kind: "where",
        ref: {
          kind: "value",
          name: "status",
        },
        op: "eq",
        value: "active",
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
      key: "audienceActive",
      label: "Active",
      entity: "audience",
      expression: {
        kind: "where",
        ref: {
          kind: "value",
          name: "status",
        },
        op: "eq",
        value: "active",
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
      key: "subscriptionSubscribed",
      label: "Subscribed",
      entity: "subscription",
      expression: {
        kind: "where",
        ref: {
          kind: "value",
          name: "status",
        },
        op: "eq",
        value: "subscribed",
      },
    },
    {
      key: "subscriptionUnsubscribed",
      label: "Unsubscribed",
      entity: "subscription",
      expression: {
        kind: "where",
        ref: {
          kind: "value",
          name: "status",
        },
        op: "eq",
        value: "unsubscribed",
      },
    },
    {
      key: "campaignAll",
      label: "All",
      entity: "campaign",
      expression: {
        kind: "all",
      },
    },
    {
      key: "campaignDraft",
      label: "Draft",
      entity: "campaign",
      expression: {
        kind: "where",
        ref: {
          kind: "value",
          name: "status",
        },
        op: "eq",
        value: "draft",
      },
    },
    {
      key: "campaignActive",
      label: "Active",
      entity: "campaign",
      expression: {
        kind: "where",
        ref: {
          kind: "value",
          name: "status",
        },
        op: "eq",
        value: "active",
      },
    },
    {
      key: "campaignMessageAll",
      label: "All",
      entity: "campaign-message",
      expression: {
        kind: "all",
      },
    },
    {
      key: "campaignMessageReady",
      label: "Ready",
      entity: "campaign-message",
      expression: {
        kind: "where",
        ref: {
          kind: "value",
          name: "status",
        },
        op: "eq",
        value: "ready",
      },
    },
    {
      key: "broadcastAll",
      label: "All",
      entity: "broadcast",
      expression: {
        kind: "all",
      },
    },
    {
      key: "broadcastDraft",
      label: "Draft",
      entity: "broadcast",
      expression: {
        kind: "where",
        ref: {
          kind: "value",
          name: "status",
        },
        op: "eq",
        value: "draft",
      },
    },
    {
      key: "broadcastScheduled",
      label: "Scheduled",
      entity: "broadcast",
      expression: {
        kind: "where",
        ref: {
          kind: "value",
          name: "status",
        },
        op: "eq",
        value: "scheduled",
      },
    },
    {
      key: "broadcastSent",
      label: "Sent",
      entity: "broadcast",
      expression: {
        kind: "where",
        ref: {
          kind: "value",
          name: "status",
        },
        op: "eq",
        value: "sent",
      },
    },
    {
      key: "broadcastRecipientAll",
      label: "All",
      entity: "broadcast-recipient",
      expression: {
        kind: "all",
      },
    },
    {
      key: "broadcastRecipientQueued",
      label: "Queued",
      entity: "broadcast-recipient",
      expression: {
        kind: "where",
        ref: {
          kind: "value",
          name: "status",
        },
        op: "eq",
        value: "queued",
      },
    },
    {
      key: "broadcastRecipientSent",
      label: "Sent",
      entity: "broadcast-recipient",
      expression: {
        kind: "where",
        ref: {
          kind: "value",
          name: "status",
        },
        op: "eq",
        value: "sent",
      },
    },
    {
      key: "broadcastRecipientNeedsReview",
      label: "Needs review",
      entity: "broadcast-recipient",
      expression: {
        kind: "or",
        expressions: [
          {
            kind: "where",
            ref: {
              kind: "value",
              name: "status",
            },
            op: "eq",
            value: "bounced",
          },
          {
            kind: "where",
            ref: {
              kind: "value",
              name: "status",
            },
            op: "eq",
            value: "failed",
          },
        ],
      },
    },
    {
      key: "deliveryEventAll",
      label: "All",
      entity: "delivery-event",
      expression: {
        kind: "all",
      },
    },
    {
      key: "deliveryEventBounces",
      label: "Bounces",
      entity: "delivery-event",
      expression: {
        kind: "where",
        ref: {
          kind: "value",
          name: "eventType",
        },
        op: "eq",
        value: "bounced",
      },
    },
  ],
});
