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
  createSiteQueryFixture,
  createSiteRouteFixture,
  createSiteSettingsFixture,
} from "./public-site.ts";

export type PublicSiteContentLayoutFixtureId =
  | "home"
  | "normal-page"
  | "post-detail"
  | "post-index-empty"
  | "post-index-populated"
  | "project-index-empty"
  | "project-index-populated";

export type PublicSiteContentLayoutFixture = {
  id: PublicSiteContentLayoutFixtureId;
  label: string;
  rendererProps: SitePublicRendererProps;
};

const mappedRouteBase = "/campaign" as const;

export const publicSiteContentLayoutFixtures = [
  contentLayout(
    "home",
    "Home page",
    contentBlock("home", "page", "page", "Field Notes Cooperative", {
      body: "Practical notes for teams improving services together.",
      href: "/",
      placements: [
        contentPlacement(
          "home",
          "hero",
          1000,
          contentBlock("home", "hero", "hero", "Make the next decision visible", {
            body: "Bring evidence, constraints, and open questions into one shared view.",
          }),
        ),
      ],
    }),
    { kind: "page", slug: "home" },
    "published",
  ),
  contentLayout(
    "normal-page",
    "Normal page",
    contentBlock("normal-page", "page", "page", "Our practice", {
      body: "A small set of methods for keeping product intent connected to delivery.",
      href: "/practice",
      placements: [
        contentPlacement(
          "normal-page",
          "section",
          1000,
          contentBlock("normal-page", "section", "section", "Work from the current decision", {
            body: "Start with the decision that the team needs to make next.",
            placements: [
              contentPlacement(
                "normal-page",
                "journal-link",
                1000,
                contentBlock("normal-page", "journal-link", "link", "Read the journal", {
                  href: "/blog",
                }),
              ),
            ],
          }),
        ),
      ],
    }),
    { kind: "page", slug: "practice" },
    "published",
    mappedRouteBase,
  ),
  contentLayout(
    "post-index-populated",
    "Populated post index",
    contentPage("post-index-populated", "Journal", [
      contentPlacement(
        "post-index-populated",
        "list",
        1000,
        contentBlock("post-index-populated", "list", "postList", "Latest notes", {
          query: createSiteQueryFixture("postList", [
            postSummary("post-index-populated", "smallest-test", {
              label: "Choose the smallest useful test",
              body: "A short note on learning before the surrounding system hardens.",
              date: "2026-07-16",
              href: "/blog/smallest-useful-test",
              media: {
                assetId: "content-post-index-populated-smallest-test",
                href: "/media/fixtures/content/public/smallest-test.webp",
              },
            }),
            postSummary("post-index-populated", "decision-trail", {
              label: "Keep a decision trail",
              body: "Leave the evidence close enough for the next person to follow.",
              date: "2026-07-09",
              href: "/blog/decision-trail",
            }),
          ]),
        }),
      ),
    ]),
    { kind: "post-index", slug: "blog", postCount: 2 },
    "published",
    mappedRouteBase,
  ),
  contentLayout(
    "post-index-empty",
    "Empty post index",
    contentPage("post-index-empty", "Journal", [
      contentPlacement(
        "post-index-empty",
        "list",
        1000,
        contentBlock("post-index-empty", "list", "postList", "Latest notes", {
          query: createSiteQueryFixture("postList", []),
        }),
      ),
    ]),
    { kind: "post-index", slug: "blog", postCount: 0 },
    "published",
  ),
  contentLayout(
    "post-detail",
    "Post detail",
    contentBlock("post-detail", "post", "post", "Choose the smallest useful test", {
      body: "A summary shown in lists but omitted from the article body.",
      date: "2026-07-16",
      href: "/blog/smallest-useful-test",
      placements: [
        contentPlacement(
          "post-detail",
          "primary-image",
          1000,
          contentBlock(
            "post-detail",
            "primary-image",
            "image",
            "A paper prototype beside a decision map",
            {
              height: 900,
              media: createSiteMediaFixture(
                "content-post-detail-primary-image",
                "/media/fixtures/content/public/paper-prototype.webp",
              ),
              width: 1440,
            },
          ),
          { slot: "primaryImage" },
        ),
        contentPlacement(
          "post-detail",
          "article-body",
          2000,
          contentBlock("post-detail", "article-body", "markdown", "Article body", {
            body: "## Test the risky assumption\n\nUse the [practice notes](/practice) to keep the decision and its evidence together.",
          }),
        ),
      ],
    }),
    { kind: "post", slug: "blog/smallest-useful-test" },
    "published",
    mappedRouteBase,
  ),
  contentLayout(
    "project-index-populated",
    "Populated project index",
    contentPage("project-index-populated", "Projects", [
      contentPlacement(
        "project-index-populated",
        "list",
        1000,
        contentBlock("project-index-populated", "list", "projectList", "Selected work", {
          query: createSiteQueryFixture("projectList", [
            projectSummary("project-index-populated", "service-library", {
              label: "Shared service library",
              body: "A reusable service map with a [public reference](https://example.com/reference/service-map) for partner teams.",
              date: "2026-06-28",
              href: "https://example.com/case-studies/service-library",
              media: {
                assetId: "content-project-index-populated-service-library",
                href: "/media/fixtures/content/public/service-library.webp",
              },
            }),
            projectSummary("project-index-populated", "release-practice", {
              label: "Release decision practice",
              body: "A lightweight review rhythm connected to the [practice notes](/practice).",
              date: "2026-05-14",
              href: "https://example.com/case-studies/release-practice",
            }),
          ]),
        }),
      ),
    ]),
    { kind: "page", slug: "projects" },
    "published",
    mappedRouteBase,
  ),
  contentLayout(
    "project-index-empty",
    "Empty project index",
    contentPage("project-index-empty", "Projects", [
      contentPlacement(
        "project-index-empty",
        "list",
        1000,
        contentBlock("project-index-empty", "list", "projectList", "Selected work", {
          query: createSiteQueryFixture("projectList", []),
        }),
      ),
    ]),
    { kind: "page", slug: "projects" },
    "published",
  ),
] satisfies readonly PublicSiteContentLayoutFixture[];

function contentLayout(
  id: PublicSiteContentLayoutFixtureId,
  label: string,
  page: SiteBlockNode,
  route: SiteTreeRoute,
  linkMode: SitePageLinkMode,
  routeBase?: SitePublicRouteBase,
): PublicSiteContentLayoutFixture {
  const tree = createSitePageTreeFixture({
    site: createSiteSettingsFixture(`content-${id}-settings`, "Field Notes Cooperative", {
      description: "Practical notes for teams improving services together.",
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
    rendererProps: createSitePublicRendererPropsFixture(
      routeBase ? { tree, linkMode, routeBase } : { tree, linkMode },
    ),
  };
}

function contentPage(
  layoutId: PublicSiteContentLayoutFixtureId,
  label: string,
  placements: SitePlacementNode[],
): SiteBlockNode {
  return contentBlock(layoutId, "page", "page", label, {
    href: label === "Projects" ? "/projects" : "/blog",
    placements,
  });
}

function postSummary(
  layoutId: PublicSiteContentLayoutFixtureId,
  id: string,
  facts: SummaryFixtureFacts,
): SiteBlockNode {
  return contentSummary(layoutId, id, "post", facts);
}

function projectSummary(
  layoutId: PublicSiteContentLayoutFixtureId,
  id: string,
  facts: SummaryFixtureFacts,
): SiteBlockNode {
  return contentSummary(layoutId, id, "project", facts);
}

function contentSummary(
  layoutId: PublicSiteContentLayoutFixtureId,
  id: string,
  type: "post" | "project",
  facts: SummaryFixtureFacts,
): SiteBlockNode {
  return contentBlock(layoutId, id, type, facts.label, {
    body: facts.body,
    date: facts.date,
    href: facts.href,
    placements: facts.media
      ? [
          contentPlacement(
            layoutId,
            `${id}-primary-image`,
            1000,
            contentBlock(layoutId, `${id}-primary-image`, "image", `${facts.label} image`, {
              media: createSiteMediaFixture(facts.media.assetId, facts.media.href),
            }),
            { slot: "primaryImage" },
          ),
        ]
      : [],
  });
}

function contentBlock(
  layoutId: PublicSiteContentLayoutFixtureId,
  id: string,
  type: SitePublicBlockType,
  label: string,
  options: Parameters<typeof createSiteBlockFixture>[3] = {},
): SiteBlockNode {
  return createSiteBlockFixture(`content-${layoutId}-block-${id}`, type, label, options);
}

function contentPlacement(
  layoutId: PublicSiteContentLayoutFixtureId,
  id: string,
  order: number,
  child: SiteBlockNode,
  options: Parameters<typeof createSitePlacementFixture>[3] = {},
): SitePlacementNode {
  return createSitePlacementFixture(`content-${layoutId}-placement-${id}`, order, child, options);
}

type SummaryFixtureFacts = {
  label: string;
  body: string;
  date: string;
  href: string;
  media?: {
    assetId: string;
    href: string;
  };
};
