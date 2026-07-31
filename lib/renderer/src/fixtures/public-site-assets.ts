import type {
  SiteBlockNode,
  SitePageLinkMode,
  SitePlacementNode,
  SitePublicBlockType,
  SitePublicRendererProps,
  SitePublicRouteBase,
  SiteTreeRoute,
} from "@dpeek/formless-site-app";

import {
  createSiteBlockFixture,
  createSiteFrameFixture,
  createSiteMediaFixture,
  createSitePageTreeFixture,
  createSitePlacementFixture,
  createSitePublicRendererPropsFixture,
  createSiteRouteFixture,
  createSiteSettingsFixture,
} from "./public-site.ts";

export type PublicSiteLinkIconLayoutFixtureId =
  | "authoring"
  | "preview"
  | "published"
  | "published-mounted";

export type PublicSiteLinkIconLayoutFixture = {
  id: PublicSiteLinkIconLayoutFixtureId;
  label: string;
  rendererProps: SitePublicRendererProps;
};

export type PublicSiteMediaLayoutFixtureId =
  | "default-ratio"
  | "delivered"
  | "feature"
  | "missing"
  | "post-detail"
  | "sized"
  | "summary";

export type PublicSiteMediaLayoutFixture = {
  id: PublicSiteMediaLayoutFixtureId;
  label: string;
  rendererProps: SitePublicRendererProps;
};

const validIconSource = `<svg viewBox="0 0 24 24" role="img" aria-label="Wayfinder"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15 9-2 4-4 2 2-4 4-2Z" fill="currentColor"/></svg>`;
const invalidIconSource = `<svg viewBox="0 0 24 24"><path`;
const unsafeIconSource = `<svg viewBox="0 0 24 24"><foreignObject><div>Unsafe fixture</div></foreignObject></svg>`;

export const publicSiteLinkIconLayoutFixtures = [
  linkIconLayout("preview", "Preview links", "preview"),
  linkIconLayout("authoring", "Authoring links", "authoring"),
  linkIconLayout("published", "Published links", "published"),
  linkIconLayout("published-mounted", "Mounted published links", "published", "/campaign"),
] satisfies readonly PublicSiteLinkIconLayoutFixture[];

export const publicSiteMediaLayoutFixtures = [
  mediaLayout(
    "delivered",
    "Delivered image",
    mediaPage("delivered", [
      mediaPlacement(
        "delivered",
        "image",
        1000,
        mediaBlock("delivered", "image", "image", "A workshop plan ready for review", {
          media: createSiteMediaFixture(
            "asset-fixture-delivered",
            "/media/fixtures/delivered/public/workshop.webp",
          ),
        }),
      ),
    ]),
  ),
  mediaLayout(
    "missing",
    "Missing image",
    mediaPage("missing", [
      mediaPlacement(
        "missing",
        "image",
        1000,
        mediaBlock("missing", "image", "image", "A missing workshop photograph"),
      ),
    ]),
  ),
  mediaLayout(
    "sized",
    "Sized image",
    mediaPage("sized", [
      mediaPlacement(
        "sized",
        "image",
        1000,
        mediaBlock("sized", "image", "image", "A wide service map", {
          height: 900,
          media: createSiteMediaFixture(
            "asset-fixture-sized",
            "/media/fixtures/sized/public/service-map.webp",
          ),
          width: 1600,
        }),
      ),
    ]),
  ),
  mediaLayout(
    "default-ratio",
    "Default-ratio image",
    mediaPage("default-ratio", [
      mediaPlacement(
        "default-ratio",
        "image",
        1000,
        mediaBlock("default-ratio", "image", "image", "Notes without projected dimensions", {
          media: createSiteMediaFixture(
            "asset-fixture-default-ratio",
            "/media/fixtures/default-ratio/public/notes.webp",
          ),
        }),
      ),
    ]),
  ),
  mediaLayout(
    "feature",
    "Feature media",
    mediaPage("feature", [
      mediaPlacement(
        "feature",
        "feature",
        1000,
        mediaBlock("feature", "feature", "feature", "See the service from both sides", {
          alignment: "right",
          body: "Pair the current journey with the operational work behind it.",
          placements: [
            mediaPlacement(
              "feature",
              "primary-image",
              1000,
              mediaBlock(
                "feature",
                "primary-image",
                "image",
                "A service journey beside an operating model",
                {
                  height: 800,
                  media: createSiteMediaFixture(
                    "asset-fixture-feature",
                    "/media/fixtures/feature/public/journey.webp",
                  ),
                  width: 1200,
                },
              ),
              { slot: "media" },
            ),
          ],
        }),
      ),
    ]),
  ),
  mediaLayout(
    "summary",
    "Summary primary media",
    mediaPage("summary", [
      mediaPlacement(
        "summary",
        "post-list",
        1000,
        mediaBlock("summary", "post-list", "postList", "Field notes", {
          query: {
            key: "postList",
            items: [
              mediaBlock("summary", "post", "post", "Making service constraints visible", {
                body: "A short account of joining customer and operational evidence.",
                date: "2026-07-14",
                href: "/pages/notes/service-constraints",
                placements: [
                  mediaPlacement(
                    "summary",
                    "primary-image",
                    1000,
                    mediaBlock(
                      "summary",
                      "primary-image",
                      "image",
                      "A wall of connected service observations",
                      {
                        media: createSiteMediaFixture(
                          "asset-fixture-summary",
                          "/media/fixtures/summary/public/observations.webp",
                        ),
                      },
                    ),
                    { slot: "primaryImage" },
                  ),
                ],
              }),
            ],
          },
        }),
      ),
    ]),
  ),
  mediaLayout(
    "post-detail",
    "Post-detail primary media",
    mediaBlock("post-detail", "post", "post", "Learning from the hand-off", {
      body: "A field note from a team making delivery decisions together.",
      date: "2026-07-16",
      placements: [
        mediaPlacement(
          "post-detail",
          "primary-image",
          1000,
          mediaBlock(
            "post-detail",
            "primary-image",
            "image",
            "A product team reviewing a release plan",
            {
              height: 1200,
              media: createSiteMediaFixture(
                "asset-fixture-post-detail",
                "/media/fixtures/post-detail/public/release-plan.webp",
              ),
              width: 1800,
            },
          ),
          { slot: "primaryImage" },
        ),
        mediaPlacement(
          "post-detail",
          "body",
          2000,
          mediaBlock("post-detail", "body", "markdown", "Article body", {
            body: "## Keep the decision close\n\nReview the evidence while the implementation is still easy to change.",
          }),
        ),
      ],
    }),
    { kind: "post", slug: "notes/learning-from-the-hand-off" },
  ),
] satisfies readonly PublicSiteMediaLayoutFixture[];

function linkIconLayout(
  id: PublicSiteLinkIconLayoutFixtureId,
  label: string,
  linkMode: SitePageLinkMode,
  routeBase?: SitePublicRouteBase,
): PublicSiteLinkIconLayoutFixture {
  const header = linkBlock(id, "header", "header", "Header", {
    placements: [
      linkPlacement(
        id,
        "primary",
        1000,
        linkBlock(id, "primary", "headerPrimary", "Primary navigation", {
          placements: [
            linkPlacement(
              id,
              "active-internal",
              1000,
              linkBlock(id, "active-internal", "link", "Work", { href: "/pages/work" }),
            ),
            linkPlacement(
              id,
              "inactive-internal",
              2000,
              linkBlock(id, "inactive-internal", "link", "Contact", {
                href: "/pages/contact",
              }),
            ),
            linkPlacement(
              id,
              "fragment",
              3000,
              linkBlock(id, "fragment", "link", "Approach", { href: "#approach" }),
            ),
            linkPlacement(
              id,
              "external",
              4000,
              linkBlock(id, "external", "link", "Reference library", {
                href: "https://example.com/reference-library",
              }),
            ),
            linkPlacement(
              id,
              "missing-target",
              5000,
              linkBlock(id, "missing-target", "link", "Unscheduled event"),
            ),
          ],
        }),
      ),
    ],
  });
  const page = linkBlock(id, "page", "page", "Practice notes", {
    body: "Current work and the wayfinding details around it.",
    placements: [
      linkPlacement(
        id,
        "icons",
        1000,
        linkBlock(id, "icons", "cardGrid", "Source icon states", {
          placements: [
            linkPlacement(
              id,
              "valid-icon",
              1000,
              linkBlock(id, "valid-icon", "card", "Valid source icon", {
                icon: validIconSource,
              }),
            ),
            linkPlacement(
              id,
              "missing-icon",
              2000,
              linkBlock(id, "missing-icon", "card", "Missing source icon"),
            ),
            linkPlacement(
              id,
              "invalid-icon",
              3000,
              linkBlock(id, "invalid-icon", "card", "Invalid source icon", {
                icon: invalidIconSource,
              }),
            ),
            linkPlacement(
              id,
              "unsafe-icon",
              4000,
              linkBlock(id, "unsafe-icon", "card", "Unsafe source icon", {
                icon: unsafeIconSource,
              }),
            ),
          ],
        }),
      ),
    ],
  });
  const tree = createSitePageTreeFixture({
    site: createSiteSettingsFixture(`link-icon-${id}-settings`, "Field Notes Cooperative", {
      description: "A shared collection of practical service design notes.",
    }),
    frame: createSiteFrameFixture(header),
    page,
    meta: {
      slug: "work/case-study",
      generatedAt: "2026-07-17T00:00:00.000Z",
      warnings: [],
    },
    route: createSiteRouteFixture({ kind: "page", slug: "work/case-study" }),
  });

  return {
    id,
    label,
    rendererProps: createSitePublicRendererPropsFixture(
      routeBase ? { tree, linkMode, routeBase } : { tree, linkMode },
    ),
  };
}

function mediaLayout(
  id: PublicSiteMediaLayoutFixtureId,
  label: string,
  page: SiteBlockNode,
  route: SiteTreeRoute = { kind: "page", slug: `media-${id}` },
): PublicSiteMediaLayoutFixture {
  const tree = createSitePageTreeFixture({
    site: createSiteSettingsFixture(`media-${id}-settings`, "Field Notes Cooperative", {
      description: "A shared collection of practical service design notes.",
    }),
    frame: createSiteFrameFixture(),
    page,
    meta: {
      slug: route.slug,
      generatedAt: "2026-07-17T00:00:00.000Z",
      warnings: [],
    },
    route: createSiteRouteFixture(route),
  });

  return {
    id,
    label,
    rendererProps: createSitePublicRendererPropsFixture({
      tree,
      linkMode: "published",
    }),
  };
}

function mediaPage(
  layoutId: PublicSiteMediaLayoutFixtureId,
  placements: SitePlacementNode[],
): SiteBlockNode {
  return mediaBlock(layoutId, "page", "page", `Media example: ${layoutId}`, { placements });
}

function linkBlock(
  layoutId: PublicSiteLinkIconLayoutFixtureId,
  id: string,
  type: SitePublicBlockType,
  label: string,
  options: Parameters<typeof createSiteBlockFixture>[3] = {},
): SiteBlockNode {
  return createSiteBlockFixture(`link-icon-${layoutId}-block-${id}`, type, label, options);
}

function linkPlacement(
  layoutId: PublicSiteLinkIconLayoutFixtureId,
  id: string,
  order: number,
  child: SiteBlockNode,
  options: Parameters<typeof createSitePlacementFixture>[3] = {},
): SitePlacementNode {
  return createSitePlacementFixture(`link-icon-${layoutId}-placement-${id}`, order, child, options);
}

function mediaBlock(
  layoutId: PublicSiteMediaLayoutFixtureId,
  id: string,
  type: SitePublicBlockType,
  label: string,
  options: Parameters<typeof createSiteBlockFixture>[3] = {},
): SiteBlockNode {
  return createSiteBlockFixture(`media-${layoutId}-block-${id}`, type, label, options);
}

function mediaPlacement(
  layoutId: PublicSiteMediaLayoutFixtureId,
  id: string,
  order: number,
  child: SiteBlockNode,
  options: Parameters<typeof createSitePlacementFixture>[3] = {},
): SitePlacementNode {
  return createSitePlacementFixture(`media-${layoutId}-placement-${id}`, order, child, options);
}
