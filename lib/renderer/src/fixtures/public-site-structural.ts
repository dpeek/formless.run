import type {
  SiteBlockNode,
  SitePlacementNode,
  SitePublicBlockType,
  SitePublicRendererProps,
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
  createUnknownSiteBlockFixture,
} from "./public-site.ts";

export type PublicSiteStructuralLayoutFixtureId =
  | "deeply-nested"
  | "dense"
  | "empty"
  | "minimal"
  | "unknown-block";

export type PublicSiteStructuralLayoutFixture = {
  id: PublicSiteStructuralLayoutFixtureId;
  label: string;
  rendererProps: SitePublicRendererProps;
};

const compassIconSource = `<svg viewBox="0 0 24 24" role="img" aria-label="Compass"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9 4.9-2.1Z" fill="currentColor"/></svg>`;
const layersIconSource = `<svg viewBox="0 0 24 24" role="img" aria-label="Layers"><path d="m12 3 9 5-9 5-9-5 9-5Zm-7.5 9L12 16l7.5-4M4.5 16 12 20l7.5-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;

const emptyLayout = structuralLayout("empty", "Empty page", page("empty", "Open studio archive"));

const minimalLayout = structuralLayout(
  "minimal",
  "Minimal page",
  page("minimal", "Field notes", {
    body: "Short observations from a team working through product change.",
    placements: [
      placement(
        "minimal",
        "hero",
        1000,
        block("minimal", "hero", "hero", "Make the next decision visible", {
          body: "Start with the smallest shared picture of the work.",
        }),
      ),
    ],
  }),
);

const denseLayout = structuralLayout(
  "dense",
  "Dense page",
  page("dense", "A practical product programme", {
    body: "A working programme for teams aligning research, design, and delivery.",
    placements: [
      placement(
        "dense",
        "hero",
        1000,
        block("dense", "hero", "hero", "Turn scattered signals into a clear direction", {
          body: "Bring customer evidence and delivery constraints into one useful narrative.",
          placements: [
            placement(
              "dense",
              "hero-image",
              1000,
              block("dense", "hero-image", "image", "Workshop notes arranged on a wall", {
                height: 900,
                media: createSiteMediaFixture(
                  "structural-dense-media-hero",
                  "/media/structural-dense/public/workshop.webp",
                ),
                width: 1440,
              }),
              { slot: "media" },
            ),
          ],
        }),
      ),
      placement(
        "dense",
        "feature-left",
        2000,
        block("dense", "feature-left", "feature", "Discover the shape of the problem", {
          alignment: "left",
          body: "## Work from evidence\n\nMap decisions to the observations that support them.",
          placements: [
            placement(
              "dense",
              "feature-left-media",
              1000,
              block("dense", "feature-left-image", "image", "A research synthesis in progress", {
                height: 800,
                media: createSiteMediaFixture(
                  "structural-dense-media-research",
                  "/media/structural-dense/public/research.webp",
                ),
                width: 1200,
              }),
              { slot: "media" },
            ),
            placement(
              "dense",
              "feature-left-action",
              2000,
              block("dense", "feature-left-action", "link", "Read the discovery approach", {
                href: "/discovery",
              }),
              { slot: "actions" },
            ),
          ],
        }),
      ),
      placement(
        "dense",
        "feature-right",
        3000,
        block("dense", "feature-right", "feature", "Carry direction into delivery", {
          alignment: "right",
          body: "Keep the intent legible while the implementation changes.",
          placements: [
            placement(
              "dense",
              "feature-right-action",
              1000,
              block("dense", "feature-right-action", "link", "See the delivery practice", {
                href: "/delivery",
              }),
              { slot: "actions" },
            ),
            placement(
              "dense",
              "feature-right-media",
              2000,
              block(
                "dense",
                "feature-right-image",
                "image",
                "A release plan beside a working interface",
                {
                  height: 800,
                  media: createSiteMediaFixture(
                    "structural-dense-media-delivery",
                    "/media/structural-dense/public/delivery.webp",
                  ),
                  width: 1200,
                },
              ),
              { slot: "media" },
            ),
          ],
        }),
      ),
      placement(
        "dense",
        "programme-section",
        4000,
        block("dense", "programme-section", "section", "How the programme holds together", {
          body: "Each stage leaves behind a useful artefact and a smaller set of open questions.",
          placements: [
            placement(
              "dense",
              "practice-section",
              1000,
              block("dense", "practice-section", "section", "Practices", {
                body: "Choose the practices that remove uncertainty from the current decision.",
                placements: [
                  placement(
                    "dense",
                    "card-grid",
                    1000,
                    block("dense", "card-grid", "cardGrid", "Ways of working", {
                      body: "A compact set of repeatable practices.",
                      placements: [
                        placement(
                          "dense",
                          "card-framing",
                          1000,
                          block("dense", "card-framing", "card", "Decision framing", {
                            body: "Name the decision, its owner, and the evidence that would change it.",
                            color: "#7c3aed",
                            icon: compassIconSource,
                          }),
                        ),
                        placement(
                          "dense",
                          "card-prototype",
                          2000,
                          block("dense", "card-prototype", "card", "Working prototypes", {
                            body: "Test the risky interaction before polishing the surrounding surface.",
                          }),
                        ),
                        placement(
                          "dense",
                          "card-system",
                          3000,
                          block("dense", "card-system", "card", "System mapping", {
                            body: "Keep dependencies visible as product and platform work converge.",
                            color: "#0369a1",
                            icon: layersIconSource,
                          }),
                        ),
                      ],
                    }),
                  ),
                  placement(
                    "dense",
                    "metric-grid",
                    2000,
                    block("dense", "metric-grid", "metricGrid", "Programme signals", {
                      body: "Signals from the last three delivery cycles.",
                      placements: [
                        placement(
                          "dense",
                          "metric-decisions",
                          1000,
                          block("dense", "metric-decisions", "metric", "18", {
                            body: "Decisions traced to evidence",
                            color: "#7c3aed",
                          }),
                        ),
                        placement(
                          "dense",
                          "metric-cycle",
                          2000,
                          block("dense", "metric-cycle", "metric", "9 days", {
                            body: "Median learning cycle",
                            color: "#0369a1",
                          }),
                        ),
                        placement(
                          "dense",
                          "metric-confidence",
                          3000,
                          block("dense", "metric-confidence", "metric", "82%", {
                            body: "Team confidence in the next release",
                          }),
                        ),
                      ],
                    }),
                  ),
                ],
              }),
            ),
          ],
        }),
      ),
      placement(
        "dense",
        "markdown",
        5000,
        block("dense", "markdown", "markdown", "Working principles", {
          body: "## Prefer useful evidence\n\nKeep source material close to the decision it informs.\n\n## Reduce hand-offs\n\nLet the people shaping the work stay connected to delivery.",
        }),
      ),
    ],
  }),
);

const deeplyNestedLayout = structuralLayout(
  "deeply-nested",
  "Deeply nested page",
  page("deeply-nested", "Inside the service", {
    body: "A layered view of one service improvement programme.",
    placements: [
      placement(
        "deeply-nested",
        "programme-group",
        1000,
        block("deeply-nested", "programme-group", "group", "Programme", {
          placements: [
            placement(
              "deeply-nested",
              "stream-group",
              1000,
              block("deeply-nested", "stream-group", "group", "Customer support stream", {
                placements: [
                  placement(
                    "deeply-nested",
                    "service-section",
                    1000,
                    block("deeply-nested", "service-section", "section", "Service model", {
                      placements: [
                        placement(
                          "deeply-nested",
                          "workflow-section",
                          1000,
                          block(
                            "deeply-nested",
                            "workflow-section",
                            "section",
                            "Escalation workflow",
                            {
                              placements: [
                                placement(
                                  "deeply-nested",
                                  "team-group",
                                  1000,
                                  block("deeply-nested", "team-group", "group", "Specialist team", {
                                    body: "The team reviews unresolved cases together each morning.",
                                    placements: [
                                      placement(
                                        "deeply-nested",
                                        "notes-markdown",
                                        1000,
                                        block(
                                          "deeply-nested",
                                          "notes-markdown",
                                          "markdown",
                                          "Review notes",
                                          {
                                            body: "## What changed\n\nCases now retain their original customer context through escalation.",
                                          },
                                        ),
                                      ),
                                    ],
                                  }),
                                ),
                              ],
                            },
                          ),
                        ),
                      ],
                    }),
                  ),
                ],
              }),
            ),
          ],
        }),
      ),
    ],
  }),
);

const unknownBlockLayout = structuralLayout(
  "unknown-block",
  "Unknown block page",
  page("unknown-block", "Community workshop", {
    body: "Published content remains useful when a future block type is not understood.",
    placements: [
      placement(
        "unknown-block",
        "introduction",
        1000,
        block("unknown-block", "introduction", "markdown", "Before the session", {
          body: "Bring one question that the group can investigate together.",
        }),
      ),
      placement(
        "unknown-block",
        "future-agenda",
        2000,
        createUnknownSiteBlockFixture(
          "structural-unknown-block-block-future-agenda",
          "interactiveAgenda",
          "Interactive agenda",
          {
            body: "This projected block type is not shipped by the current renderer.",
          },
        ),
      ),
      placement(
        "unknown-block",
        "follow-up",
        3000,
        block("unknown-block", "follow-up", "group", "After the session", {
          placements: [
            placement(
              "unknown-block",
              "follow-up-notes",
              1000,
              block("unknown-block", "follow-up-notes", "markdown", "Shared notes", {
                body: "Summarise the decisions, owners, and unresolved questions.",
              }),
            ),
          ],
        }),
      ),
    ],
  }),
);

export const publicSiteStructuralLayoutFixtures = [
  emptyLayout,
  minimalLayout,
  denseLayout,
  deeplyNestedLayout,
  unknownBlockLayout,
] satisfies readonly PublicSiteStructuralLayoutFixture[];

function structuralLayout(
  id: PublicSiteStructuralLayoutFixtureId,
  label: string,
  pageBlock: SiteBlockNode,
): PublicSiteStructuralLayoutFixture {
  const tree = createSitePageTreeFixture({
    site: createSiteSettingsFixture(`structural-${id}-settings`, "Common Ground Studio", {
      description: "Product and service design for teams improving public-facing systems.",
    }),
    frame: createSiteFrameFixture(),
    page: pageBlock,
    meta: {
      slug: `structural-${id}`,
      generatedAt: "2026-07-17T00:00:00.000Z",
      warnings: [],
    },
    route: createSiteRouteFixture({ kind: "page", slug: `structural-${id}` }),
  });

  return {
    id,
    label,
    rendererProps: createSitePublicRendererPropsFixture({
      tree,
      linkMode: "published",
      routeBase: "/campaign",
    }),
  };
}

function page(
  layoutId: PublicSiteStructuralLayoutFixtureId,
  label: string,
  options: Parameters<typeof createSiteBlockFixture>[3] = {},
): SiteBlockNode {
  return block(layoutId, "page", "page", label, options);
}

function block(
  layoutId: PublicSiteStructuralLayoutFixtureId,
  id: string,
  type: SitePublicBlockType,
  label: string,
  options: Parameters<typeof createSiteBlockFixture>[3] = {},
): SiteBlockNode {
  return createSiteBlockFixture(`structural-${layoutId}-block-${id}`, type, label, options);
}

function placement(
  layoutId: PublicSiteStructuralLayoutFixtureId,
  id: string,
  order: number,
  child: SiteBlockNode,
  options: Parameters<typeof createSitePlacementFixture>[3] = {},
): SitePlacementNode {
  return createSitePlacementFixture(
    `structural-${layoutId}-placement-${id}`,
    order,
    child,
    options,
  );
}
