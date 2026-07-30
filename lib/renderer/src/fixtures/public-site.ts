import type {
  SiteBlockNode,
  SiteMediaNode,
  SitePageFrame,
  SitePageTree,
  SitePlacementNode,
  SitePublicBlockType,
  SitePublicOperationNode,
  SitePublicRendererProps,
  SiteSettingsNode,
  SiteTreeMeta,
  SiteTreeRoute,
  SiteTreeWarning,
} from "@dpeek/formless-site-app";
import { isSitePublicBlockType } from "@dpeek/formless-site-app";

type SiteBlockFixtureOptions = Partial<
  Omit<SiteBlockNode, "id" | "label" | "placements" | "type">
> & {
  placements?: SitePlacementNode[];
};

type SitePlacementFixtureOptions = Omit<SitePlacementNode, "block" | "id" | "order">;

export function createSiteSettingsFixture(
  id: string,
  label: string,
  options: Omit<SiteSettingsNode, "id" | "label"> = {},
): SiteSettingsNode {
  return { id, label, ...options };
}

export function createSiteBlockFixture(
  id: string,
  type: SitePublicBlockType,
  label: string,
  options: SiteBlockFixtureOptions = {},
): SiteBlockNode {
  return { id, type, label, placements: [], ...options };
}

export function createUnknownSiteBlockFixture(
  id: string,
  type: string,
  label: string,
  options: SiteBlockFixtureOptions = {},
): SiteBlockNode {
  if (isSitePublicBlockType(type)) {
    throw new Error(`Site block fixture type is known: ${type}`);
  }

  return { id, type, label, placements: [], ...options };
}

export function createSitePlacementFixture(
  id: string,
  order: number,
  block: SiteBlockNode,
  options: SitePlacementFixtureOptions = {},
): SitePlacementNode {
  return { id, order, block, ...options };
}

export function createSiteQueryFixture(
  key: string,
  items: SiteBlockNode[],
): NonNullable<SiteBlockNode["query"]> {
  return { key, items };
}

export function createSiteMediaFixture(assetId: string, href: string): SiteMediaNode {
  return { assetId, href, kind: "image" };
}

export function createSiteWarningFixture(
  code: string,
  recordId: string,
  message: string,
): SiteTreeWarning {
  return { code, recordId, message };
}

export function createSiteRouteFixture(route: SiteTreeRoute): SiteTreeRoute {
  return route;
}

export function createSitePublicOperationFixture(
  operation: SitePublicOperationNode,
): SitePublicOperationNode {
  return operation;
}

export function createSiteFrameFixture(
  header?: SiteBlockNode,
  footer?: SiteBlockNode,
): SitePageFrame {
  return { header, footer };
}

export function createSitePageTreeFixture(tree: SitePageTree): SitePageTree {
  return tree;
}

export function createSitePublicRendererPropsFixture(
  rendererProps: SitePublicRendererProps,
): SitePublicRendererProps {
  return rendererProps;
}

export function collectSiteBlockFixtures(tree: SitePageTree): SiteBlockNode[] {
  return collectSiteFixtureNodes(tree).blocks;
}

export function collectSiteFixtureNodes(tree: SitePageTree): {
  blocks: SiteBlockNode[];
  placements: SitePlacementNode[];
} {
  const blocks: SiteBlockNode[] = [];
  const placements: SitePlacementNode[] = [];
  const seen = new Set<string>();
  const visit = (block: SiteBlockNode | undefined) => {
    if (!block || seen.has(block.id)) {
      return;
    }

    seen.add(block.id);
    blocks.push(block);
    block.placements.forEach((placement) => {
      placements.push(placement);
      visit(placement.block);
    });
    block.query?.items.forEach(visit);
  };

  visit(tree.frame.header);
  visit(tree.page);
  visit(tree.frame.footer);
  return { blocks, placements };
}

export function requiredSiteBlockFixture(tree: SitePageTree, blockId: string): SiteBlockNode {
  const block = collectSiteBlockFixtures(tree).find((candidate) => candidate.id === blockId);

  if (!block) {
    throw new Error(`Missing Site block fixture: ${blockId}`);
  }

  return block;
}

const siteIconSource = `<svg viewBox="0 0 32 32" role="img" aria-label="Astryx"><rect width="32" height="32" rx="7" fill="#111827"/><path d="M8 22 16 6l8 16h-4.1l-1.4-3.3h-5.1L12 22H8Zm6.6-6.4h2.8L16 12l-1.4 3.6Z" fill="#fff"/></svg>`;
const serviceIconSource = `<svg viewBox="0 0 24 24" role="img" aria-label="Spark"><path d="M12 2 9.6 9.6 2 12l7.6 2.4L12 22l2.4-7.6L22 12l-7.6-2.4L12 2Z" fill="currentColor"/></svg>`;

const publicChallenge = {
  kind: "turnstile",
  siteKey: "1x00000000000000000000AA",
} as const;

const siteTarget = {
  kind: "schemaKey",
  schemaKey: "site",
  apiRoutePrefix: "/api/site",
} as const;

const crmTarget = {
  kind: "appInstall",
  packageAppKey: "crm",
  installId: "crm",
  apiRoutePrefix: "/api/app-installs/crm/crm",
} as const;

const header = createSiteBlockFixture("block-header", "header", "Header", {
  placements: [
    createSitePlacementFixture(
      "placement-header-primary",
      1000,
      createSiteBlockFixture("block-header-primary", "headerPrimary", "Primary navigation", {
        placements: [
          createSitePlacementFixture(
            "placement-header-home",
            1000,
            createSiteBlockFixture("block-link-home", "link", "Home", {
              href: "/pages/home",
            }),
          ),
          createSitePlacementFixture(
            "placement-header-work",
            2000,
            createSiteBlockFixture("block-link-work", "link", "Work", {
              href: "/pages/work",
            }),
          ),
          createSitePlacementFixture(
            "placement-header-journal",
            3000,
            createSiteBlockFixture("block-link-journal", "link", "Journal", {
              href: "/pages/journal",
            }),
          ),
        ],
      }),
    ),
    createSitePlacementFixture(
      "placement-header-secondary",
      2000,
      createSiteBlockFixture("block-header-secondary", "headerSecondary", "Secondary navigation", {
        placements: [
          createSitePlacementFixture(
            "placement-header-contact",
            1000,
            createSiteBlockFixture("block-link-contact", "link", "Contact", {
              href: "#contact",
            }),
          ),
        ],
      }),
    ),
  ],
});

const footer = createSiteBlockFixture("block-footer", "footer", "Footer", {
  placements: [
    createSitePlacementFixture(
      "placement-footer-pages",
      1000,
      createSiteBlockFixture("block-footer-pages", "footerSection", "Pages", {
        placements: [
          createSitePlacementFixture(
            "placement-footer-home",
            1000,
            createSiteBlockFixture("block-footer-link-home", "link", "Home", {
              href: "/pages/home",
            }),
          ),
          createSitePlacementFixture(
            "placement-footer-work",
            2000,
            createSiteBlockFixture("block-footer-link-work", "link", "Work", {
              href: "/pages/work",
            }),
          ),
        ],
      }),
    ),
    createSitePlacementFixture(
      "placement-footer-social",
      2000,
      createSiteBlockFixture("block-footer-social", "footerSocial", "Social", {
        placements: [
          createSitePlacementFixture(
            "placement-footer-github",
            1000,
            createSiteBlockFixture("block-footer-link-github", "link", "GitHub", {
              href: "https://github.com/dpeek",
              icon: "github",
            }),
          ),
          createSitePlacementFixture(
            "placement-footer-linkedin",
            2000,
            createSiteBlockFixture("block-footer-link-linkedin", "link", "LinkedIn", {
              href: "https://www.linkedin.com/in/dpeek/",
              icon: "linkedin",
            }),
          ),
        ],
      }),
    ),
  ],
});

const primaryMedia = createSiteBlockFixture(
  "block-image-studio",
  "image",
  "Astryx studio workspace",
  {
    media: createSiteMediaFixture(
      "media-astryx-studio",
      "/media/media-astryx-studio/public/studio.webp",
    ),
    width: 1600,
    height: 1067,
  },
);

const journalMedia = createSiteBlockFixture(
  "block-image-journal-clarity",
  "image",
  "Notes and sketches on a studio wall",
  {
    media: createSiteMediaFixture(
      "media-journal-clarity",
      "/media/media-journal-clarity/public/notes.webp",
    ),
    width: 1200,
    height: 800,
  },
);

const journalItem = createSiteBlockFixture(
  "block-post-clarity",
  "post",
  "Finding clarity in a changing product",
  {
    body: "A practical way to make room for change without losing the thread of the product.",
    date: "2026-06-18",
    href: "/blog/finding-clarity",
    placements: [
      createSitePlacementFixture("placement-post-clarity-image", 1000, journalMedia, {
        slot: "primaryImage",
      }),
    ],
  },
);

const subscribeOperation = createSitePublicOperationFixture({
  entityName: "subscription",
  operationName: "subscribe",
  canonicalKey: "subscription.subscribe",
  kind: "command",
  target: crmTarget,
  route: "/api/app-installs/crm/crm/public/operations/subscription/subscribe",
  challenge: publicChallenge,
});

const contactOperation = createSitePublicOperationFixture({
  entityName: "contactMessage",
  operationName: "send",
  canonicalKey: "contactMessage.send",
  kind: "create",
  target: siteTarget,
  route: "/api/site/public/operations/contactMessage/send",
  challenge: publicChallenge,
});

const reviewOperation = createSitePublicOperationFixture({
  entityName: "studioReview",
  operationName: "request",
  canonicalKey: "studioReview.request",
  kind: "create",
  target: crmTarget,
  route: "/api/app-installs/crm/crm/public/operations/studioReview/request",
  challenge: publicChallenge,
  fields: [
    { name: "name", label: "Name", required: true, control: "text" },
    {
      name: "email",
      label: "Email",
      required: true,
      control: "text",
      format: "email",
    },
    {
      name: "phone",
      label: "Phone",
      required: false,
      control: "text",
      format: "phone",
    },
    {
      name: "summary",
      label: "What are you working on?",
      required: true,
      control: "longText",
    },
    {
      name: "hasExistingSite",
      label: "Existing public site",
      required: false,
      control: "boolean",
    },
    {
      name: "preferredDate",
      label: "Preferred review date",
      required: false,
      control: "date",
    },
    {
      name: "budget",
      label: "Monthly budget",
      required: false,
      control: "number",
    },
    {
      name: "timeline",
      label: "Launch timeline",
      required: true,
      control: "enum",
      options: [
        { value: "now", label: "Now" },
        { value: "quarter", label: "This quarter" },
        { value: "later", label: "Later" },
      ],
    },
    {
      name: "referral",
      label: "How did you hear about us?",
      required: false,
      control: "text",
      suggestions: ["Search", "Referral", "Conference"],
    },
  ],
});

const page = createSiteBlockFixture(
  "block-page-home",
  "page",
  "Clear digital products for ambitious teams.",
  {
    body: "Astryx Studio works with product teams to turn complex systems into useful, coherent experiences.",
    placements: [
      createSitePlacementFixture(
        "placement-page-intro",
        1000,
        createSiteBlockFixture("block-section-intro", "section", "A focused studio practice", {
          body: "We connect product direction, interface design, and delivery so that each decision supports the whole.",
          placements: [
            createSitePlacementFixture("placement-intro-media", 1000, primaryMedia, {
              slot: "media",
            }),
          ],
        }),
      ),
      createSitePlacementFixture(
        "placement-page-services",
        2000,
        createSiteBlockFixture("block-section-services", "section", "How we help", {
          placements: [
            createSitePlacementFixture(
              "placement-services-grid",
              1000,
              createSiteBlockFixture("block-card-grid-services", "cardGrid", "Studio services", {
                placements: [
                  createSitePlacementFixture(
                    "placement-service-direction",
                    1000,
                    createSiteBlockFixture("block-card-direction", "card", "Product direction", {
                      body: "Make the next product decision legible and grounded in the system around it.",
                      icon: serviceIconSource,
                      color: "#7c3aed",
                    }),
                  ),
                  createSitePlacementFixture(
                    "placement-service-systems",
                    2000,
                    createSiteBlockFixture("block-card-systems", "card", "Design systems", {
                      body: "Build shared patterns that support consistency without slowing the team down.",
                      icon: serviceIconSource,
                      color: "#0891b2",
                    }),
                  ),
                  createSitePlacementFixture(
                    "placement-service-delivery",
                    3000,
                    createSiteBlockFixture("block-card-delivery", "card", "Platform delivery", {
                      body: "Carry the design intent through implementation and into the shipped product.",
                      icon: serviceIconSource,
                      color: "#dc2626",
                    }),
                  ),
                ],
              }),
            ),
          ],
        }),
      ),
      createSitePlacementFixture(
        "placement-page-journal",
        3000,
        createSiteBlockFixture("block-post-list-journal", "postList", "From the journal", {
          query: createSiteQueryFixture("postList", [journalItem]),
        }),
      ),
      createSitePlacementFixture(
        "placement-page-contact",
        4000,
        createSiteBlockFixture("block-section-contact", "section", "Work with us", {
          body: "Tell us where the product feels stuck and what a useful next step would look like.",
          placements: [
            createSitePlacementFixture(
              "placement-contact-subscribe",
              1000,
              createSiteBlockFixture("block-form-subscribe", "subscribeForm", "Studio notes", {
                body: "Occasional notes on product direction, systems, and delivery.",
                operationName: "subscribe",
                buttonLabel: "Subscribe",
                publicOperation: subscribeOperation,
              }),
            ),
            createSitePlacementFixture(
              "placement-contact-message",
              2000,
              createSiteBlockFixture("block-form-contact", "contactForm", "Start a conversation", {
                body: "Share a little about the team and the problem you are trying to solve.",
                operationName: "send",
                buttonLabel: "Send message",
                successLabel: "Message received.",
                nameLabel: "Name",
                emailLabel: "Email",
                messageLabel: "Message",
                publicOperation: contactOperation,
              }),
            ),
            createSitePlacementFixture(
              "placement-contact-review",
              3000,
              createSiteBlockFixture(
                "block-form-review",
                "publicOperationForm",
                "Request a studio review",
                {
                  body: "Give us enough context to prepare a useful first conversation.",
                  operationKey: "studioReview.request",
                  buttonLabel: "Request review",
                  successLabel: "Review request received.",
                  publicOperation: reviewOperation,
                },
              ),
            ),
            createSitePlacementFixture(
              "placement-contact-archive",
              4000,
              createSiteBlockFixture("block-form-archive", "contactForm", "Archive enquiries", {
                body: "This enquiry route is not currently available.",
                operationName: "sendArchived",
                buttonLabel: "Send message",
                nameLabel: "Name",
                emailLabel: "Email",
                messageLabel: "Message",
              }),
            ),
          ],
        }),
      ),
    ],
  },
);

const warnings = [
  createSiteWarningFixture(
    "publicOperationUnavailable",
    "block-form-archive",
    'Contact form "Archive enquiries" does not expose a public operation route.',
  ),
];

const meta: SiteTreeMeta = {
  slug: "home",
  generatedAt: "2026-07-08T00:00:00.000Z",
  warnings,
};

export const publicSitePageTreeFixture = createSitePageTreeFixture({
  site: createSiteSettingsFixture("settings-astryx-studio", "Astryx Studio", {
    description: "Product design and engineering for teams building ambitious software.",
    icon: siteIconSource,
    initialThemeMode: "system",
    themeSwitchable: true,
  }),
  frame: createSiteFrameFixture(header, footer),
  page,
  meta,
  route: createSiteRouteFixture({ kind: "page", slug: "home" }),
});

export const publicSiteRendererPropsFixture = createSitePublicRendererPropsFixture({
  tree: publicSitePageTreeFixture,
  linkMode: "installed",
  routeBase: "/sites/astryx",
});
