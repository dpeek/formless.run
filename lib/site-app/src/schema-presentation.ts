import { defineAppSchemaModule } from "@dpeek/formless-schema";

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
          commit: "field-commit",
        },
        {
          field: "description",
          editor: "textarea",
          commit: "field-commit",
        },
        {
          field: "icon",
          editor: "icon",
          commit: "field-commit",
        },
        {
          field: "initialThemeMode",
          editor: "enum",
          commit: "immediate",
        },
        {
          field: "themeSwitchable",
          editor: "boolean",
          commit: "immediate",
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
          commit: "field-commit",
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
          commit: "field-commit",
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
          commit: "field-commit",
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
              commit: "field-commit",
            },
            {
              field: "icon",
              editor: "icon",
              commit: "field-commit",
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
              commit: "field-commit",
            },
            {
              field: "body",
              editor: "markdown",
              commit: "field-commit",
            },
            {
              field: "href",
              editor: "href",
              commit: "field-commit",
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
              commit: "field-commit",
            },
            {
              field: "body",
              editor: "markdown",
              commit: "field-commit",
            },
            {
              field: "href",
              editor: "href",
              commit: "field-commit",
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
              commit: "immediate",
            },
            {
              field: "linkTargetBlock",
              editor: "reference",
              commit: "immediate",
              visibleWhen: {
                field: "linkTargetMode",
                values: ["internal"],
              },
            },
            {
              field: "href",
              editor: "href",
              commit: "field-commit",
              visibleWhen: {
                field: "linkTargetMode",
                values: ["", "external"],
              },
            },
            {
              field: "icon",
              editor: "icon",
              commit: "field-commit",
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
              commit: "field-commit",
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
              commit: "field-commit",
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
              commit: "field-commit",
            },
            {
              field: "alignment",
              editor: "enum",
              commit: "immediate",
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
              commit: "field-commit",
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
              commit: "field-commit",
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
              commit: "field-commit",
            },
            {
              field: "icon",
              editor: "icon",
              commit: "field-commit",
            },
            {
              field: "color",
              editor: "color",
              commit: "field-commit",
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
              commit: "field-commit",
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
              commit: "field-commit",
            },
            {
              field: "color",
              editor: "color",
              commit: "field-commit",
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
              commit: "field-commit",
            },
            {
              field: "operationName",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "buttonLabel",
              editor: "text",
              commit: "field-commit",
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
              commit: "field-commit",
            },
            {
              field: "operationName",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "buttonLabel",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "successLabel",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "nameLabel",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "emailLabel",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "messageLabel",
              editor: "text",
              commit: "field-commit",
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
              commit: "field-commit",
            },
            {
              field: "operationKey",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "buttonLabel",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "successLabel",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "operationNotificationMode",
              editor: "enum",
              commit: "immediate",
            },
            {
              field: "operationNotificationReplyToField",
              editor: "text",
              commit: "field-commit",
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
              commit: "field-commit",
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
            commit: "field-commit",
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
          commit: "field-commit",
        },
      ],
      union: "blockByType",
      variants: [
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
              commit: "field-commit",
            },
            {
              field: "body",
              editor: "markdown",
              commit: "field-commit",
            },
            {
              field: "href",
              editor: "href",
              commit: "field-commit",
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
              commit: "immediate",
            },
            {
              field: "linkTargetBlock",
              editor: "reference",
              commit: "immediate",
              visibleWhen: {
                field: "linkTargetMode",
                values: ["internal"],
              },
            },
            {
              field: "href",
              editor: "href",
              commit: "field-commit",
              visibleWhen: {
                field: "linkTargetMode",
                values: ["", "external"],
              },
            },
            {
              field: "icon",
              editor: "icon",
              commit: "field-commit",
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
              commit: "field-commit",
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
              commit: "field-commit",
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
              commit: "field-commit",
            },
            {
              field: "alignment",
              editor: "enum",
              commit: "immediate",
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
              commit: "field-commit",
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
              commit: "field-commit",
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
              commit: "field-commit",
            },
            {
              field: "icon",
              editor: "icon",
              commit: "field-commit",
            },
            {
              field: "color",
              editor: "color",
              commit: "field-commit",
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
              commit: "field-commit",
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
              commit: "field-commit",
            },
            {
              field: "color",
              editor: "color",
              commit: "field-commit",
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
              commit: "field-commit",
            },
            {
              field: "operationName",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "buttonLabel",
              editor: "text",
              commit: "field-commit",
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
              commit: "field-commit",
            },
            {
              field: "operationName",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "buttonLabel",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "successLabel",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "nameLabel",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "emailLabel",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "messageLabel",
              editor: "text",
              commit: "field-commit",
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
              commit: "field-commit",
            },
            {
              field: "operationKey",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "buttonLabel",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "successLabel",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "operationNotificationMode",
              editor: "enum",
              commit: "immediate",
            },
            {
              field: "operationNotificationReplyToField",
              editor: "text",
              commit: "field-commit",
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
              commit: "field-commit",
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
            commit: "field-commit",
          },
        ],
      },
    },
    {
      key: "blockPlacementTreeItem",
      entity: "block-placement",
      fields: [
        {
          field: "label",
          editor: "text",
          commit: "field-commit",
        },
      ],
    },
  ],
  tableViews: [
    {
      key: "blockTable",
      entity: "block",
      columns: [
        {
          type: "field",
          field: "type",
          editor: "enum",
          commit: "immediate",
          width: "sm",
        },
        {
          type: "field",
          field: "label",
          editor: "text",
          commit: "field-commit",
          width: "lg",
        },
        {
          type: "field",
          field: "body",
          editor: "markdown",
          commit: "field-commit",
          width: "lg",
        },
        {
          type: "field",
          field: "href",
          editor: "href",
          commit: "field-commit",
          width: "md",
        },
        {
          type: "field",
          field: "mediaAssetId",
          editor: "media",
          commit: "field-commit",
          width: "md",
        },
        {
          type: "field",
          field: "date",
          editor: "date",
          commit: "field-commit",
          width: "sm",
        },
        {
          type: "field",
          field: "icon",
          editor: "icon",
          commit: "field-commit",
          width: "sm",
        },
        {
          type: "field",
          field: "color",
          editor: "color",
          commit: "field-commit",
          width: "sm",
        },
        {
          type: "field",
          field: "alignment",
          editor: "enum",
          commit: "immediate",
          width: "sm",
        },
        {
          type: "field",
          field: "width",
          editor: "number",
          commit: "field-commit",
          align: "end",
          width: "xs",
          format: "number",
        },
        {
          type: "field",
          field: "height",
          editor: "number",
          commit: "field-commit",
          align: "end",
          width: "xs",
          format: "number",
        },
      ],
    },
    {
      key: "blockPlacementTable",
      entity: "block-placement",
      operations: [
        {
          operation: "block.update",
          label: "Edit block",
          target: {
            kind: "reference",
            field: "block",
          },
          editView: "blockEdit",
        },
      ],
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
        presentations: ["dragHandle", "moveMenu"],
      },
      columns: [
        {
          type: "orderingHandle",
          width: "xs",
        },
        {
          type: "field",
          field: "block",
          editor: "reference",
          commit: "immediate",
          width: "lg",
        },
        {
          type: "field",
          field: "label",
          editor: "text",
          commit: "field-commit",
          width: "md",
        },
        {
          type: "field",
          field: "slot",
          editor: "text",
          commit: "field-commit",
          width: "sm",
        },
        {
          type: "operationControl",
          operation: "block.update",
          includeOrdering: true,
          width: "xs",
          align: "end",
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
          width: "lg",
        },
        {
          type: "field",
          field: "normalizedAddress",
          width: "lg",
        },
        {
          type: "field",
          field: "contact",
          width: "md",
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
      key: "siteSettingsHome",
      type: "collection",
      label: "Settings",
      entity: "site",
      navigation: {
        primary: false,
      },
      queries: [
        {
          query: "sitePrimary",
        },
      ],
      defaultQuery: "sitePrimary",
      result: {
        type: "record",
        itemView: "siteSettingsForm",
      },
    },
    {
      key: "blockHome",
      type: "collection",
      label: "Blocks",
      entity: "block",
      navigation: {
        primary: false,
      },
      queries: [
        {
          query: "blockAll",
          count: {
            type: "count",
          },
        },
        {
          query: "blockPages",
          count: {
            type: "count",
          },
        },
        {
          query: "blockPosts",
          count: {
            type: "count",
          },
        },
        {
          query: "blockProjects",
          count: {
            type: "count",
          },
        },
        {
          query: "blockLinks",
          count: {
            type: "count",
          },
        },
        {
          query: "blockGroups",
          count: {
            type: "count",
          },
        },
        {
          query: "blockImages",
          count: {
            type: "count",
          },
        },
      ],
      defaultQuery: "blockAll",
      result: {
        type: "table",
        tableView: "blockTable",
      },
      operations: [
        {
          operation: "block.create",
          createView: "blockCreate",
        },
      ],
    },
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
    {
      key: "siteCompositionHome",
      type: "collection",
      label: "Site",
      entity: "block-placement",
      navigation: {
        primary: true,
      },
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
          presentations: ["dragHandle"],
        },
        maxDepth: 8,
      },
    },
    {
      key: "pageCompositionHome",
      type: "collection",
      label: "Pages",
      entity: "block-placement",
      navigation: {
        primary: false,
      },
      context: {
        name: "block",
        entity: "block",
        query: "blockPages",
        labelField: "label",
        relationship: "blockPlacements",
        itemView: "blockRootDetail",
        presentation: "listDetail",
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
        type: "table",
        tableView: "blockPlacementTable",
      },
      operations: [
        {
          operation: "block-placement.create",
          createView: "blockPlacementCreate",
          label: "Add placement",
        },
      ],
    },
    {
      key: "navigationCompositionHome",
      type: "collection",
      label: "Navigation",
      entity: "block-placement",
      navigation: {
        primary: false,
      },
      context: {
        name: "block",
        entity: "block",
        query: "blockNavigationRoots",
        labelField: "label",
        relationship: "blockPlacements",
        itemView: "blockRootDetail",
        presentation: "listDetail",
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
        type: "table",
        tableView: "blockPlacementTable",
      },
      operations: [
        {
          operation: "block-placement.create",
          createView: "blockPlacementCreate",
          label: "Add placement",
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
          commit: "field-commit",
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
              commit: "field-commit",
            },
            {
              field: "icon",
              editor: "icon",
              commit: "field-commit",
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
              commit: "field-commit",
            },
            {
              field: "body",
              editor: "markdown",
              commit: "field-commit",
            },
            {
              field: "href",
              editor: "href",
              commit: "field-commit",
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
              commit: "field-commit",
            },
            {
              field: "body",
              editor: "markdown",
              commit: "field-commit",
            },
            {
              field: "href",
              editor: "href",
              commit: "field-commit",
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
              commit: "immediate",
            },
            {
              field: "linkTargetBlock",
              editor: "reference",
              commit: "immediate",
              visibleWhen: {
                field: "linkTargetMode",
                values: ["internal"],
              },
            },
            {
              field: "href",
              editor: "href",
              commit: "field-commit",
              visibleWhen: {
                field: "linkTargetMode",
                values: ["", "external"],
              },
            },
            {
              field: "icon",
              editor: "icon",
              commit: "field-commit",
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
              commit: "field-commit",
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
              commit: "field-commit",
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
              commit: "field-commit",
            },
            {
              field: "alignment",
              editor: "enum",
              commit: "immediate",
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
              commit: "field-commit",
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
              commit: "field-commit",
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
              commit: "field-commit",
            },
            {
              field: "icon",
              editor: "icon",
              commit: "field-commit",
            },
            {
              field: "color",
              editor: "color",
              commit: "field-commit",
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
              commit: "field-commit",
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
              commit: "field-commit",
            },
            {
              field: "color",
              editor: "color",
              commit: "field-commit",
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
              commit: "field-commit",
            },
            {
              field: "operationName",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "buttonLabel",
              editor: "text",
              commit: "field-commit",
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
              commit: "field-commit",
            },
            {
              field: "operationName",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "buttonLabel",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "successLabel",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "nameLabel",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "emailLabel",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "messageLabel",
              editor: "text",
              commit: "field-commit",
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
              commit: "field-commit",
            },
            {
              field: "operationKey",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "buttonLabel",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "successLabel",
              editor: "text",
              commit: "field-commit",
            },
            {
              field: "operationNotificationMode",
              editor: "enum",
              commit: "immediate",
            },
            {
              field: "operationNotificationReplyToField",
              editor: "text",
              commit: "field-commit",
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
              commit: "field-commit",
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
            commit: "field-commit",
          },
        ],
      },
    },
    {
      key: "blockCompositionHome",
      type: "collection",
      label: "Placements",
      entity: "block-placement",
      navigation: {
        primary: false,
      },
      context: {
        name: "block",
        entity: "block",
        query: "blockAll",
        labelField: "label",
        relationship: "blockPlacements",
        itemView: "blockContextItem",
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
        type: "table",
        tableView: "blockPlacementTable",
      },
      operations: [
        {
          operation: "block-placement.create",
          createView: "blockPlacementCreate",
          label: "Add placement",
        },
      ],
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
