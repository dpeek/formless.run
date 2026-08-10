import {
  defineAppSchemaModule,
  type QueryExpression,
  type RecordPlanStepSchema,
} from "@dpeek/formless-schema";

function starterLiteral(value: string | number | boolean) {
  return { kind: "literal", value } as const;
}

function starterStepId(step: string) {
  return { kind: "stepOutput", step, output: "id" } as const;
}

function starterReference(entity: string, step: string) {
  return { kind: "reference", entity, id: starterStepId(step) } as const;
}

const SITE_PRODUCT_ICON_KEY = "formless";

const siteScopePredicate: QueryExpression = {
  kind: "where",
  ref: { kind: "value", name: "site" },
  op: "eq",
  value: { kind: "context", name: "site" },
};

function siteScopedBlockQuery(expression?: QueryExpression): QueryExpression {
  return expression === undefined
    ? siteScopePredicate
    : { kind: "and", expressions: [siteScopePredicate, expression] };
}

const siteStarterRecordPlan: RecordPlanStepSchema[] = [
  {
    name: "createSite",
    kind: "create",
    entity: "site",
    values: {
      key: {
        kind: "generatedCode",
        alphabet: "upperAlphaNumericNoConfusables",
        length: 10,
        prefix: "site-",
      },
      label: starterLiteral("Formless"),
      description: starterLiteral(
        "Formless is a schema-as-data runtime for building custom software on Cloudflare",
      ),
      icon: starterLiteral(SITE_PRODUCT_ICON_KEY),
    },
  },
  {
    name: "createHomePage",
    kind: "create",
    entity: "block",
    values: {
      site: starterReference("site", "createSite"),
      type: starterLiteral("page"),
      label: starterLiteral("Home"),
      href: starterLiteral("/"),
    },
  },
  {
    name: "createContactPage",
    kind: "create",
    entity: "block",
    values: {
      site: starterReference("site", "createSite"),
      type: starterLiteral("page"),
      label: starterLiteral("Contact"),
      href: starterLiteral("/contact"),
    },
  },
  {
    name: "createHeader",
    kind: "create",
    entity: "block",
    values: {
      site: starterReference("site", "createSite"),
      type: starterLiteral("header"),
      label: starterLiteral("Header"),
    },
  },
  {
    name: "createFooter",
    kind: "create",
    entity: "block",
    values: {
      site: starterReference("site", "createSite"),
      type: starterLiteral("footer"),
      label: starterLiteral("Footer"),
    },
  },
  {
    name: "createFooterSection",
    kind: "create",
    entity: "block",
    values: {
      site: starterReference("site", "createSite"),
      type: starterLiteral("footerSection"),
      label: starterLiteral("Sitemap"),
    },
  },
  {
    name: "createFooterContactLink",
    kind: "create",
    entity: "block",
    values: {
      site: starterReference("site", "createSite"),
      type: starterLiteral("link"),
      label: starterLiteral("Contact"),
      linkTargetMode: starterLiteral("internal"),
      linkTargetBlock: starterReference("block", "createContactPage"),
    },
  },
  {
    name: "createContactForm",
    kind: "create",
    entity: "block",
    values: {
      site: starterReference("site", "createSite"),
      type: starterLiteral("contactForm"),
      label: starterLiteral("Contact"),
      operationName: starterLiteral("submit"),
    },
  },
  {
    name: "createFooterHomeLink",
    kind: "create",
    entity: "block",
    values: {
      site: starterReference("site", "createSite"),
      type: starterLiteral("link"),
      label: starterLiteral("Home"),
      linkTargetMode: starterLiteral("internal"),
      linkTargetBlock: starterReference("block", "createHomePage"),
    },
  },
  {
    name: "createWelcomeMarkdown",
    kind: "create",
    entity: "block",
    values: {
      site: starterReference("site", "createSite"),
      type: starterLiteral("markdown"),
      label: starterLiteral("Welcome to Formless"),
      body: starterLiteral(`Formless is a schema-as-data app runtime for building custom software on Cloudflare.

One app definition describes records, fields, relationships, queries, read
models, views, screens, actions, public output, and deploy behavior. The runtime
turns that definition into storage, sync, generated UI, media, public pages,
archives, and deploy paths.

## Web CMS

One of the things you can build on Formless is this simple Web CMS. It supports posts, projects, markdown rendering and syntax highlighted code blocks so you can stop procrastinating and finally start that blog.

\`\`\`ts
type Formless = {
  field: string;
}
\`\`\`

## Conclusion

Formless does very little out of the box. It's a set of powerful building blocks for building exactly the software you want.`),
    },
  },
  {
    name: "placeFooterContactLink",
    kind: "create",
    entity: "block-placement",
    values: {
      parent: starterReference("block", "createFooterSection"),
      block: starterReference("block", "createFooterContactLink"),
      order: starterLiteral(2000),
    },
  },
  {
    name: "placeContactForm",
    kind: "create",
    entity: "block-placement",
    values: {
      parent: starterReference("block", "createContactPage"),
      block: starterReference("block", "createContactForm"),
      order: starterLiteral(1000),
    },
  },
  {
    name: "placeFooterSection",
    kind: "create",
    entity: "block-placement",
    values: {
      parent: starterReference("block", "createFooter"),
      block: starterReference("block", "createFooterSection"),
      order: starterLiteral(1000),
    },
  },
  {
    name: "placeFooterHomeLink",
    kind: "create",
    entity: "block-placement",
    values: {
      parent: starterReference("block", "createFooterSection"),
      block: starterReference("block", "createFooterHomeLink"),
      order: starterLiteral(1000),
    },
  },
  {
    name: "placeWelcomeMarkdown",
    kind: "create",
    entity: "block-placement",
    values: {
      parent: starterReference("block", "createHomePage"),
      block: starterReference("block", "createWelcomeMarkdown"),
      order: starterLiteral(1000),
    },
  },
  {
    name: "assignSiteRoots",
    kind: "patch",
    entity: "site",
    recordId: starterStepId("createSite"),
    values: {
      home: starterReference("block", "createHomePage"),
      header: starterReference("block", "createHeader"),
      footer: starterReference("block", "createFooter"),
    },
  },
];

export const siteRecordSchemaModule = defineAppSchemaModule({
  key: "site-records",
  runtimeRequirements: {
    shared: {
      recordAdapters: ["site.records"],
    },
    browser: {
      surfaces: ["site.public"],
    },
    worker: {
      publicReads: ["site.public-tree"],
      surfaces: ["site.public"],
      afterCommit: ["site.contact-notification", "site.operation-input-notification"],
    },
  },
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
          icon: { valueMode: "iconIdWithSvgFallback" },
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
        {
          key: "home",
          type: "reference",
          required: false,
          label: "Home page",
          to: "block",
          displayField: "label",
        },
        {
          key: "header",
          type: "reference",
          required: false,
          label: "Header",
          to: "block",
          displayField: "label",
        },
        {
          key: "footer",
          type: "reference",
          required: false,
          label: "Footer",
          to: "block",
          displayField: "label",
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
          key: "createStarter",
          label: "Create Site Starter",
          kind: "command",
          scope: "collection",
          effect: {
            type: "recordPlan",
            steps: siteStarterRecordPlan,
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
              {
                key: "home",
                field: "home",
              },
              {
                key: "header",
                field: "header",
              },
              {
                key: "footer",
                field: "footer",
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
          key: "site",
          type: "reference",
          required: true,
          label: "Site",
          to: "site",
          displayField: "label",
        },
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
          icon: { valueMode: "iconIdWithSvgFallback" },
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
                key: "site",
                field: "site",
              },
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
              inheritFields: ["site"],
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
  ],
  relationships: [
    {
      key: "siteHome",
      kind: "toOne",
      label: "Home page",
      from: {
        entity: "site",
        field: "home",
      },
      to: {
        entity: "block",
      },
      inverse: "blockHomeForSites",
    },
    {
      key: "blockHomeForSites",
      kind: "toMany",
      label: "Home for Sites",
      from: {
        entity: "block",
      },
      to: {
        entity: "site",
        field: "home",
      },
      inverse: "siteHome",
    },
    {
      key: "siteHeader",
      kind: "toOne",
      label: "Header",
      from: {
        entity: "site",
        field: "header",
      },
      to: {
        entity: "block",
      },
      inverse: "blockHeaderForSites",
    },
    {
      key: "blockHeaderForSites",
      kind: "toMany",
      label: "Header for Sites",
      from: {
        entity: "block",
      },
      to: {
        entity: "site",
        field: "header",
      },
      inverse: "siteHeader",
    },
    {
      key: "siteFooter",
      kind: "toOne",
      label: "Footer",
      from: {
        entity: "site",
        field: "footer",
      },
      to: {
        entity: "block",
      },
      inverse: "blockFooterForSites",
    },
    {
      key: "blockFooterForSites",
      kind: "toMany",
      label: "Footer for Sites",
      from: {
        entity: "block",
      },
      to: {
        entity: "site",
        field: "footer",
      },
      inverse: "siteFooter",
    },
    {
      key: "blockSite",
      kind: "toOne",
      label: "Site",
      from: {
        entity: "block",
        field: "site",
      },
      to: {
        entity: "site",
      },
      inverse: "siteBlocks",
    },
    {
      key: "siteBlocks",
      kind: "toMany",
      label: "Blocks",
      from: {
        entity: "site",
      },
      to: {
        entity: "block",
        field: "site",
      },
      inverse: "blockSite",
    },
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
      key: "siteAll",
      label: "Sites",
      entity: "site",
      expression: {
        kind: "all",
      },
    },
    {
      key: "blockAll",
      label: "All",
      entity: "block",
      expression: siteScopedBlockQuery(),
    },
    {
      key: "blockPages",
      label: "Pages",
      entity: "block",
      expression: siteScopedBlockQuery({
        kind: "where",
        ref: {
          kind: "value",
          name: "type",
        },
        op: "eq",
        value: "page",
      }),
    },
    {
      key: "blockNavigationRoots",
      label: "Navigation",
      entity: "block",
      expression: siteScopedBlockQuery({
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
      }),
    },
    {
      key: "blockSiteRoots",
      label: "Site roots",
      entity: "block",
      expression: siteScopedBlockQuery({
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
      }),
    },
    {
      key: "blockPosts",
      label: "Posts",
      entity: "block",
      expression: siteScopedBlockQuery({
        kind: "where",
        ref: {
          kind: "value",
          name: "type",
        },
        op: "eq",
        value: "post",
      }),
    },
    {
      key: "blockProjects",
      label: "Projects",
      entity: "block",
      expression: siteScopedBlockQuery({
        kind: "where",
        ref: {
          kind: "value",
          name: "type",
        },
        op: "eq",
        value: "project",
      }),
    },
    {
      key: "blockLinks",
      label: "Links",
      entity: "block",
      expression: siteScopedBlockQuery({
        kind: "where",
        ref: {
          kind: "value",
          name: "type",
        },
        op: "eq",
        value: "link",
      }),
    },
    {
      key: "blockGroups",
      label: "Groups",
      entity: "block",
      expression: siteScopedBlockQuery({
        kind: "where",
        ref: {
          kind: "value",
          name: "type",
        },
        op: "eq",
        value: "group",
      }),
    },
    {
      key: "blockImages",
      label: "Images",
      entity: "block",
      expression: siteScopedBlockQuery({
        kind: "where",
        ref: {
          kind: "value",
          name: "type",
        },
        op: "eq",
        value: "image",
      }),
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
