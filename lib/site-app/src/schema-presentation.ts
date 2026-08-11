import { defineAppSchemaModule } from "@dpeek/formless-schema";

const singletonSiteScope = {
  name: "site",
  entity: "site",
  query: "siteAll",
  selection: "singleton",
} as const;

export const sitePresentationSchemaModule = defineAppSchemaModule({
  key: "site-presentation",
  requires: ["site-records"],
  itemViews: [
    {
      key: "siteSettingsForm",
      entity: "site",
      fields: [
        {
          field: "label",
          editor: "text",
        },
        {
          field: "description",
          editor: "textarea",
        },
        {
          field: "icon",
          editor: "icon",
        },
        {
          field: "initialThemeMode",
          editor: "enum",
        },
        {
          field: "themeSwitchable",
          editor: "boolean",
        },
      ],
    },
    {
      key: "blockListItem",
      entity: "block",
      fields: [
        {
          field: "label",
          editor: "text",
        },
      ],
    },
    {
      key: "blockContextItem",
      entity: "block",
      fields: [
        {
          field: "label",
          editor: "text",
        },
      ],
    },
    {
      key: "blockRootDetail",
      entity: "block",
      fields: [
        {
          field: "label",
          editor: "text",
        },
      ],
      union: "blockByType",
      variants: [
        {
          variant: "page",
          presentation: "fields",
          fields: [
            {
              field: "href",
              editor: "href",
            },
            {
              field: "icon",
              editor: "icon",
            },
          ],
        },
        {
          variant: "post",
          presentation: "fields",
          fields: [
            {
              field: "date",
              editor: "date",
            },
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "href",
              editor: "href",
            },
          ],
        },
        {
          variant: "project",
          presentation: "fields",
          fields: [
            {
              field: "date",
              editor: "date",
            },
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "href",
              editor: "href",
            },
          ],
        },
        {
          variant: "link",
          presentation: "fields",
          fields: [
            {
              field: "linkTargetMode",
              editor: "enum",
            },
            {
              field: "linkTargetBlock",
              editor: "reference",
              visibleWhen: {
                field: "linkTargetMode",
                values: ["internal"],
              },
            },
            {
              field: "href",
              editor: "href",
              visibleWhen: {
                field: "linkTargetMode",
                values: ["", "external"],
              },
            },
            {
              field: "icon",
              editor: "icon",
            },
          ],
        },
        {
          variant: "markdown",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
          ],
        },
        {
          variant: "hero",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
          ],
        },
        {
          variant: "feature",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "alignment",
              editor: "enum",
            },
          ],
        },
        {
          variant: "section",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
          ],
        },
        {
          variant: "cardGrid",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
          ],
        },
        {
          variant: "card",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "icon",
              editor: "icon",
            },
            {
              field: "color",
              editor: "color",
            },
          ],
        },
        {
          variant: "metricGrid",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
          ],
        },
        {
          variant: "metric",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "color",
              editor: "color",
            },
          ],
        },
        {
          variant: "subscribeForm",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "operationName",
              editor: "text",
            },
            {
              field: "buttonLabel",
              editor: "text",
            },
          ],
        },
        {
          variant: "contactForm",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "operationName",
              editor: "text",
            },
            {
              field: "buttonLabel",
              editor: "text",
            },
            {
              field: "successLabel",
              editor: "text",
            },
            {
              field: "nameLabel",
              editor: "text",
            },
            {
              field: "emailLabel",
              editor: "text",
            },
            {
              field: "messageLabel",
              editor: "text",
            },
          ],
        },
        {
          variant: "publicOperationForm",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "operationKey",
              editor: "text",
            },
            {
              field: "buttonLabel",
              editor: "text",
            },
            {
              field: "successLabel",
              editor: "text",
            },
            {
              field: "operationNotificationMode",
              editor: "enum",
            },
            {
              field: "operationNotificationReplyToField",
              editor: "text",
              visibleWhen: {
                field: "operationNotificationMode",
                values: ["email"],
              },
            },
          ],
        },
        {
          variant: "image",
          presentation: "fields",
          fields: [
            {
              field: "mediaAssetId",
              editor: "media",
            },
          ],
        },
      ],
      fallback: {
        presentation: "fields",
        fields: [
          {
            field: "label",
            editor: "text",
          },
        ],
      },
    },
    {
      key: "blockTreeNode",
      entity: "block",
      fields: [
        {
          field: "label",
          editor: "text",
        },
      ],
      union: "blockByType",
      variants: [
        {
          variant: "page",
          presentation: "fields",
          fields: [
            {
              field: "href",
              editor: "href",
            },
            {
              field: "icon",
              editor: "icon",
            },
          ],
        },
        {
          variant: "header",
          presentation: "contextLink",
          labelField: "label",
          target: {
            kind: "selectContext",
            context: "block",
            record: "self",
          },
        },
        {
          variant: "footer",
          presentation: "contextLink",
          labelField: "label",
          target: {
            kind: "selectContext",
            context: "block",
            record: "self",
          },
        },
        {
          variant: "project",
          presentation: "fields",
          fields: [
            {
              field: "date",
              editor: "date",
            },
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "href",
              editor: "href",
            },
          ],
        },
        {
          variant: "link",
          presentation: "fields",
          fields: [
            {
              field: "linkTargetMode",
              editor: "enum",
            },
            {
              field: "linkTargetBlock",
              editor: "reference",
              visibleWhen: {
                field: "linkTargetMode",
                values: ["internal"],
              },
            },
            {
              field: "href",
              editor: "href",
              visibleWhen: {
                field: "linkTargetMode",
                values: ["", "external"],
              },
            },
            {
              field: "icon",
              editor: "icon",
            },
          ],
        },
        {
          variant: "markdown",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
          ],
        },
        {
          variant: "hero",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
          ],
        },
        {
          variant: "feature",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "alignment",
              editor: "enum",
            },
          ],
        },
        {
          variant: "section",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
          ],
        },
        {
          variant: "cardGrid",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
          ],
        },
        {
          variant: "card",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "icon",
              editor: "icon",
            },
            {
              field: "color",
              editor: "color",
            },
          ],
        },
        {
          variant: "metricGrid",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
          ],
        },
        {
          variant: "metric",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "color",
              editor: "color",
            },
          ],
        },
        {
          variant: "subscribeForm",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "operationName",
              editor: "text",
            },
            {
              field: "buttonLabel",
              editor: "text",
            },
          ],
        },
        {
          variant: "contactForm",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "operationName",
              editor: "text",
            },
            {
              field: "buttonLabel",
              editor: "text",
            },
            {
              field: "successLabel",
              editor: "text",
            },
            {
              field: "nameLabel",
              editor: "text",
            },
            {
              field: "emailLabel",
              editor: "text",
            },
            {
              field: "messageLabel",
              editor: "text",
            },
          ],
        },
        {
          variant: "publicOperationForm",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "operationKey",
              editor: "text",
            },
            {
              field: "buttonLabel",
              editor: "text",
            },
            {
              field: "successLabel",
              editor: "text",
            },
            {
              field: "operationNotificationMode",
              editor: "enum",
            },
            {
              field: "operationNotificationReplyToField",
              editor: "text",
              visibleWhen: {
                field: "operationNotificationMode",
                values: ["email"],
              },
            },
          ],
        },
        {
          variant: "image",
          presentation: "fields",
          fields: [
            {
              field: "mediaAssetId",
              editor: "media",
            },
          ],
        },
      ],
      fallback: {
        presentation: "fields",
        fields: [
          {
            field: "label",
            editor: "text",
          },
        ],
      },
    },
  ],
  views: [
    {
      key: "siteSettingsHome",
      type: "collection",
      label: "Settings",
      entity: "site",
      navigation: {
        primary: false,
      },
      scope: singletonSiteScope,
      queries: [
        {
          query: "siteAll",
        },
      ],
      defaultQuery: "siteAll",
      result: {
        type: "record",
        itemView: "siteSettingsForm",
      },
      operations: [
        {
          operation: "site.createStarter",
          placement: "emptyStatePrimary",
          label: "Create your first site",
        },
      ],
    },
    {
      key: "siteCompositionHome",
      type: "collection",
      label: "Site",
      entity: "block-placement",
      navigation: {
        primary: true,
      },
      scope: singletonSiteScope,
      context: {
        name: "block",
        entity: "block",
        query: "blockSiteRoots",
        labelField: "label",
        relationship: "blockPlacements",
        itemView: "blockRootDetail",
        presentation: "listDetail",
        navigation: {
          placement: "sidebar",
          groups: [
            {
              label: "Pages",
              query: "blockPages",
              createView: "blockPageCreate",
            },
            {
              label: "Posts",
              query: "blockPosts",
              createView: "blockPostCreate",
            },
            {
              label: "Projects",
              query: "blockProjects",
              createView: "blockProjectCreate",
            },
            {
              label: "Navigation",
              query: "blockNavigationRoots",
            },
          ],
        },
      },
      queries: [
        {
          query: "placementsForSelectedBlock",
          count: {
            type: "count",
          },
        },
      ],
      defaultQuery: "placementsForSelectedBlock",
      result: {
        type: "tree",
        relationship: "blockPlacements",
        childField: "block",
        childItemView: "blockTreeNode",
        branches: {
          variants: {
            page: {
              children: [
                "group",
                "section",
                "hero",
                "feature",
                "cardGrid",
                "metricGrid",
                "markdown",
                "image",
                "link",
                "project",
                "postList",
                "projectList",
                "subscribeForm",
                "contactForm",
                "publicOperationForm",
              ],
            },
            group: {
              children: [
                "group",
                "section",
                "hero",
                "feature",
                "cardGrid",
                "metricGrid",
                "markdown",
                "image",
                "link",
                "project",
                "postList",
                "projectList",
                "subscribeForm",
                "contactForm",
                "publicOperationForm",
              ],
            },
            section: {
              children: [
                "group",
                "section",
                "hero",
                "feature",
                "cardGrid",
                "metricGrid",
                "markdown",
                "image",
                "link",
                "project",
                "postList",
                "projectList",
                "subscribeForm",
                "contactForm",
                "publicOperationForm",
              ],
            },
            cardGrid: {
              children: ["card"],
            },
            card: "leaf",
            metricGrid: {
              children: ["metric"],
            },
            metric: "leaf",
            post: {
              children: [
                "markdown",
                {
                  variant: "image",
                  label: "Primary image",
                  placementValues: {
                    slot: "primaryImage",
                  },
                },
              ],
            },
            project: {
              children: [
                {
                  variant: "image",
                  label: "Primary image",
                  placementValues: {
                    slot: "primaryImage",
                  },
                },
              ],
            },
            feature: {
              children: [
                {
                  variant: "image",
                  label: "Feature image",
                  placementValues: {
                    slot: "media",
                  },
                },
                {
                  variant: "link",
                  label: "Action link",
                  placementValues: {
                    slot: "actions",
                  },
                },
              ],
            },
            postList: "leaf",
            projectList: "leaf",
            subscribeForm: "leaf",
            contactForm: "leaf",
            publicOperationForm: "leaf",
            header: {
              action: "leaf",
              children: ["headerPrimary", "headerSecondary"],
            },
            headerPrimary: {
              children: ["link"],
            },
            headerSecondary: {
              children: ["link"],
            },
            footer: {
              action: "leaf",
              children: ["footerSection", "footerSocial", "link"],
            },
            footerSection: {
              children: ["link"],
            },
            footerSocial: {
              children: ["link"],
            },
          },
        },
        composition: {
          createOperation: "block-placement.addTreeChild",
          removeOperation: "block-placement.removeTreePlacement",
        },
        ordering: {
          field: "order",
          scope: [
            {
              kind: "field",
              field: "parent",
            },
            {
              kind: "field",
              field: "slot",
            },
          ],
        },
        maxDepth: 8,
      },
      operations: [
        {
          operation: "site.createStarter",
          placement: "emptyStatePrimary",
          label: "Create your first site",
        },
      ],
    },
    {
      key: "blockCreate",
      type: "create",
      entity: "block",
      fields: [
        {
          field: "type",
          editor: "enum",
        },
        {
          field: "label",
          editor: "text",
        },
      ],
      union: "blockByType",
      variants: [
        {
          variant: "page",
          presentation: "fields",
          fields: [
            {
              field: "href",
              editor: "href",
            },
            {
              field: "icon",
              editor: "icon",
            },
          ],
        },
        {
          variant: "post",
          presentation: "fields",
          fields: [
            {
              field: "date",
              editor: "date",
            },
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "href",
              editor: "href",
            },
          ],
        },
        {
          variant: "project",
          presentation: "fields",
          fields: [
            {
              field: "date",
              editor: "date",
            },
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "href",
              editor: "href",
            },
          ],
        },
        {
          variant: "link",
          presentation: "fields",
          fields: [
            {
              field: "linkTargetMode",
              editor: "enum",
            },
            {
              field: "linkTargetBlock",
              editor: "reference",
              visibleWhen: {
                field: "linkTargetMode",
                values: ["internal"],
              },
            },
            {
              field: "href",
              editor: "href",
              visibleWhen: {
                field: "linkTargetMode",
                values: ["", "external"],
              },
            },
            {
              field: "icon",
              editor: "icon",
            },
          ],
        },
        {
          variant: "markdown",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
          ],
        },
        {
          variant: "hero",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
          ],
        },
        {
          variant: "feature",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "alignment",
              editor: "enum",
            },
          ],
        },
        {
          variant: "section",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
          ],
        },
        {
          variant: "cardGrid",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
          ],
        },
        {
          variant: "card",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "icon",
              editor: "icon",
            },
            {
              field: "color",
              editor: "color",
            },
          ],
        },
        {
          variant: "metricGrid",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
          ],
        },
        {
          variant: "metric",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "color",
              editor: "color",
            },
          ],
        },
        {
          variant: "subscribeForm",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "operationName",
              editor: "text",
            },
            {
              field: "buttonLabel",
              editor: "text",
            },
          ],
        },
        {
          variant: "contactForm",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "operationName",
              editor: "text",
            },
            {
              field: "buttonLabel",
              editor: "text",
            },
            {
              field: "successLabel",
              editor: "text",
            },
            {
              field: "nameLabel",
              editor: "text",
            },
            {
              field: "emailLabel",
              editor: "text",
            },
            {
              field: "messageLabel",
              editor: "text",
            },
          ],
        },
        {
          variant: "publicOperationForm",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "operationKey",
              editor: "text",
            },
            {
              field: "buttonLabel",
              editor: "text",
            },
            {
              field: "successLabel",
              editor: "text",
            },
            {
              field: "operationNotificationMode",
              editor: "enum",
            },
            {
              field: "operationNotificationReplyToField",
              editor: "text",
              visibleWhen: {
                field: "operationNotificationMode",
                values: ["email"],
              },
            },
          ],
        },
        {
          variant: "image",
          presentation: "fields",
          fields: [
            {
              field: "mediaAssetId",
              editor: "media",
            },
          ],
        },
      ],
      fallback: {
        presentation: "fields",
        fields: [
          {
            field: "label",
            editor: "text",
          },
        ],
      },
      defaults: {
        site: {
          kind: "context",
          name: "site",
        },
      },
    },
    {
      key: "blockPageCreate",
      type: "create",
      entity: "block",
      fields: [
        {
          field: "label",
          editor: "text",
        },
        {
          field: "href",
          editor: "href",
        },
        {
          field: "icon",
          editor: "icon",
        },
      ],
      defaults: {
        site: {
          kind: "context",
          name: "site",
        },
        type: {
          kind: "literal",
          value: "page",
        },
      },
    },
    {
      key: "blockPostCreate",
      type: "create",
      entity: "block",
      fields: [
        {
          field: "label",
          editor: "text",
        },
        {
          field: "href",
          editor: "href",
        },
        {
          field: "date",
          editor: "date",
        },
        {
          field: "body",
          editor: "markdown",
        },
      ],
      defaults: {
        site: {
          kind: "context",
          name: "site",
        },
        type: {
          kind: "literal",
          value: "post",
        },
      },
    },
    {
      key: "blockProjectCreate",
      type: "create",
      entity: "block",
      fields: [
        {
          field: "label",
          editor: "text",
        },
        {
          field: "href",
          editor: "href",
        },
        {
          field: "date",
          editor: "date",
        },
        {
          field: "body",
          editor: "markdown",
        },
      ],
      defaults: {
        site: {
          kind: "context",
          name: "site",
        },
        type: {
          kind: "literal",
          value: "project",
        },
      },
    },
    {
      key: "blockEdit",
      type: "edit",
      entity: "block",
      fields: [
        {
          field: "label",
          editor: "text",
        },
      ],
      union: "blockByType",
      variants: [
        {
          variant: "page",
          presentation: "fields",
          fields: [
            {
              field: "href",
              editor: "href",
            },
            {
              field: "icon",
              editor: "icon",
            },
          ],
        },
        {
          variant: "post",
          presentation: "fields",
          fields: [
            {
              field: "date",
              editor: "date",
            },
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "href",
              editor: "href",
            },
          ],
        },
        {
          variant: "project",
          presentation: "fields",
          fields: [
            {
              field: "date",
              editor: "date",
            },
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "href",
              editor: "href",
            },
          ],
        },
        {
          variant: "link",
          presentation: "fields",
          fields: [
            {
              field: "linkTargetMode",
              editor: "enum",
            },
            {
              field: "linkTargetBlock",
              editor: "reference",
              visibleWhen: {
                field: "linkTargetMode",
                values: ["internal"],
              },
            },
            {
              field: "href",
              editor: "href",
              visibleWhen: {
                field: "linkTargetMode",
                values: ["", "external"],
              },
            },
            {
              field: "icon",
              editor: "icon",
            },
          ],
        },
        {
          variant: "markdown",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
          ],
        },
        {
          variant: "hero",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
          ],
        },
        {
          variant: "feature",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "alignment",
              editor: "enum",
            },
          ],
        },
        {
          variant: "section",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
          ],
        },
        {
          variant: "cardGrid",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
          ],
        },
        {
          variant: "card",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "icon",
              editor: "icon",
            },
            {
              field: "color",
              editor: "color",
            },
          ],
        },
        {
          variant: "metricGrid",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
          ],
        },
        {
          variant: "metric",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "color",
              editor: "color",
            },
          ],
        },
        {
          variant: "subscribeForm",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "operationName",
              editor: "text",
            },
            {
              field: "buttonLabel",
              editor: "text",
            },
          ],
        },
        {
          variant: "contactForm",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "operationName",
              editor: "text",
            },
            {
              field: "buttonLabel",
              editor: "text",
            },
            {
              field: "successLabel",
              editor: "text",
            },
            {
              field: "nameLabel",
              editor: "text",
            },
            {
              field: "emailLabel",
              editor: "text",
            },
            {
              field: "messageLabel",
              editor: "text",
            },
          ],
        },
        {
          variant: "publicOperationForm",
          presentation: "fields",
          fields: [
            {
              field: "body",
              editor: "markdown",
            },
            {
              field: "operationKey",
              editor: "text",
            },
            {
              field: "buttonLabel",
              editor: "text",
            },
            {
              field: "successLabel",
              editor: "text",
            },
            {
              field: "operationNotificationMode",
              editor: "enum",
            },
            {
              field: "operationNotificationReplyToField",
              editor: "text",
              visibleWhen: {
                field: "operationNotificationMode",
                values: ["email"],
              },
            },
          ],
        },
        {
          variant: "image",
          presentation: "fields",
          fields: [
            {
              field: "mediaAssetId",
              editor: "media",
            },
          ],
        },
      ],
      fallback: {
        presentation: "fields",
        fields: [
          {
            field: "label",
            editor: "text",
          },
        ],
      },
    },
    {
      key: "blockPlacementCreate",
      type: "create",
      entity: "block-placement",
      fields: [
        {
          field: "block",
          editor: "reference",
        },
        {
          field: "label",
          editor: "text",
        },
      ],
      defaults: {
        parent: {
          kind: "context",
          name: "block",
        },
      },
    },
  ],
  screens: [
    {
      key: "siteSettings",
      type: "workspace",
      label: "Settings",
      path: "/settings",
      layout: {
        type: "stack",
        width: "narrow",
        sections: [
          {
            id: "settings",
            type: "collection",
            view: "siteSettingsHome",
          },
        ],
      },
    },
    {
      key: "siteEditor",
      type: "workspace",
      label: "Blocks",
      path: "/",
      layout: {
        type: "stack",
        width: "wide",
        sections: [
          {
            id: "site",
            type: "collection",
            view: "siteCompositionHome",
          },
        ],
      },
    },
  ],
});
