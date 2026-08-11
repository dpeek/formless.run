// @vitest-environment jsdom

import { fireEvent, render, within, type RenderResult } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type {
  SiteBlockNode,
  SitePageFrame,
  SitePlacementNode,
  SitePublicFormIntent,
  SitePublicFormSession,
  SitePublicFormSessionController,
  SitePublicBlockType,
  SitePublicOperationInputFieldNode,
  SitePublicRendererProps,
} from "@dpeek/formless-site-app";
import { projectSitePublicFormSession } from "@dpeek/formless-site-app";
import { PublicSiteThemeProvider } from "@dpeek/formless-site-app/public/react";

import {
  createSiteBlockFixture,
  createSiteMediaFixture,
  createSitePlacementFixture,
  createUnknownSiteBlockFixture,
  publicSiteRendererPropsFixture,
} from "../fixtures/public-site.ts";
import { AstryxSitePresentation, FormlessSitePageRenderer } from "./site.tsx";
import { FormlessSiteSystemStateRenderer } from "./site-system-state.tsx";
const viewport = { isMobile: false };
(
  globalThis as {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => {
  viewport.isMobile = false;
  vi.stubGlobal("matchMedia", (query: string) => ({
    addEventListener: () => undefined,
    addListener: () => undefined,
    dispatchEvent: () => true,
    matches: viewport.isMobile,
    media: query,
    onchange: null,
    removeEventListener: () => undefined,
    removeListener: () => undefined,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Astryx public Site page shell", () => {
  it("renders ordered desktop primary and secondary navigation with route-aware active links", async () => {
    viewport.isMobile = false;
    const renderer = await renderPage(shellRendererProps());

    expect(componentLabels(renderer, "TopNavItem")).toEqual(["Home", "Work", "Journal", "Contact"]);
    expect(componentByLabel(renderer, "TopNavItem", "Home").getAttribute("href")).toBe("/");
    expect(componentByLabel(renderer, "TopNavItem", "Home").getAttribute("aria-current")).toBe(
      "page",
    );
    expect(componentByLabel(renderer, "TopNavItem", "Work").getAttribute("href")).toBe("/work");
    expect(componentByLabel(renderer, "TopNavItem", "Contact").getAttribute("href")).toBe(
      "#contact",
    );
    expect(renderer.container.querySelector('a[href="/"]')).not.toBeNull();

    await unmount(renderer);
  });

  it("renders footer sections and social links with resolved external behavior", async () => {
    viewport.isMobile = false;
    const renderer = await renderPage(shellRendererProps());

    expect(renderer.container.querySelector('nav[aria-label="Pages"]')).not.toBeNull();
    expect(renderer.container.querySelector('nav[aria-label="Social"]')).not.toBeNull();
    const github = required(
      renderer.container.querySelector<HTMLAnchorElement>('a[href="https://github.com/dpeek"]'),
    );
    expect(github.href).toBe("https://github.com/dpeek");
    expect(github.target).toBe("_blank");
    expect(new Set(github.rel.split(" "))).toEqual(new Set(["noreferrer", "noopener"]));
    expect(rendererText(renderer)).not.toContain(
      "Product design and engineering for teams building ambitious software.",
    );

    await unmount(renderer);
  });

  it("renders mobile primary and secondary groups and closes over external target rules", async () => {
    viewport.isMobile = true;
    const renderer = await renderPage(withExternalHeaderLink(shellRendererProps()));

    const mobileNav = required(renderer.container.querySelector('dialog[aria-label="Header"]'));
    expect(groupLabels(mobileNav)).toEqual(["Primary navigation", "Secondary navigation"]);
    expect(componentLabels(renderer, "SideNavItem")).toEqual([
      "Home",
      "Work",
      "Journal",
      "Contact",
      "Documentation",
    ]);
    const documentation = componentByLabel(renderer, "SideNavItem", "Documentation");
    expect(documentation.getAttribute("href")).toBe("https://example.com/docs");
    expect(documentation.getAttribute("target")).toBe("_blank");
    expect(documentation.getAttribute("rel")).toBe("noreferrer");
    expect(componentByLabel(renderer, "SideNavItem", "Home").getAttribute("aria-current")).toBe(
      "page",
    );

    expect(mobileNav).toHaveProperty("open", false);
    fireEvent.click(required(renderer.container.querySelector('[aria-label="Open navigation"]')));
    expect(mobileNav).toHaveProperty("open", true);

    await unmount(renderer);
  });

  it("applies its local theme control without adding theme facts to renderer props", async () => {
    viewport.isMobile = false;
    const renderer = await renderPage(shellRendererProps());

    expect(
      renderer.container.querySelector("[data-site-theme]")?.getAttribute("data-site-theme"),
    ).toBe("light");
    const toggle = required(
      renderer.container.querySelector<HTMLButtonElement>('[aria-label="Switch to dark mode"]'),
    );
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggle);

    expect(
      renderer.container.querySelector("[data-site-theme]")?.getAttribute("data-site-theme"),
    ).toBe("dark");
    expect(
      renderer.container
        .querySelector('[aria-label="Switch to light mode"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");

    await unmount(renderer);
  });

  it("renders no theme toggle when Site settings disable switching", async () => {
    viewport.isMobile = false;
    const props = shellRendererProps();
    const renderer = await renderPage({
      ...props,
      tree: {
        ...props.tree,
        site: {
          ...required(props.tree.site),
          initialThemeMode: "light",
          themeSwitchable: false,
        },
      },
    });

    expect(renderer.container.querySelector("[data-site-theme-control]")).toBeNull();
    expect(renderer.container.querySelector('[aria-label^="Switch to "]')).toBeNull();
    expect(
      renderer.container.querySelector("[data-site-theme]")?.getAttribute("data-site-theme"),
    ).toBe("light");

    await unmount(renderer);
  });

  it.each([
    ["header only", { header: publicSiteRendererPropsFixture.tree.frame.header }, true, false],
    ["footer only", { footer: publicSiteRendererPropsFixture.tree.frame.footer }, false, true],
    ["no frame roots", {}, false, false],
  ] as const)("renders the page shell with %s", async (_name, frame, hasHeader, hasFooter) => {
    viewport.isMobile = false;
    const renderer = await renderPage(shellRendererProps(frame));

    expect(renderer.container.querySelector('[data-site-block-type="page"]')).not.toBeNull();
    expect(renderer.container.querySelector('nav[aria-label="Header"]') !== null).toBe(hasHeader);
    expect(renderer.container.querySelector('nav[aria-label="Pages"]') !== null).toBe(hasFooter);

    await unmount(renderer);
  });
});

describe("Astryx public Site structural blocks", () => {
  it("renders ordered nested page flow with a contiguous heading hierarchy", async () => {
    viewport.isMobile = false;
    const renderer = await renderPage(
      structuralRendererProps([
        placement(
          "markdown-last",
          3000,
          block("markdown-last", "markdown", "Closing notes", {
            body: "# Closing detail",
          }),
        ),
        placement(
          "hero-first",
          1000,
          block("hero-first", "hero", "A clear opening", {
            body: "First paragraph.\n\nSecond paragraph.",
          }),
        ),
        placement(
          "group-middle",
          2000,
          block("group-middle", "group", "Stored group label", {
            body: "Group context.",
            placements: [
              placement(
                "section-nested",
                1000,
                block("section-nested", "section", "Nested section", {
                  body: "## Section detail",
                  placements: [
                    placement(
                      "metrics-second",
                      2000,
                      block("metrics-second", "metricGrid", "Outcomes", {
                        body: "Measured results.",
                        placements: [
                          placement(
                            "metric-second",
                            2000,
                            block("metric-second", "metric", "24h", {
                              body: "Response time",
                              color: "#0f766e",
                            }),
                          ),
                          placement(
                            "metric-first",
                            1000,
                            block("metric-first", "metric", "98%", {
                              color: "#0369a1",
                            }),
                          ),
                        ],
                      }),
                    ),
                    placement(
                      "cards-first",
                      1000,
                      block("cards-first", "cardGrid", "Capabilities", {
                        body: "A compact set.",
                        placements: [
                          placement("card-second", 2000, block("card-second", "card", "Delivery")),
                          placement(
                            "card-first",
                            1000,
                            block("card-first", "card", "Direction", {
                              body: "# Card detail",
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
          { label: "Placed group label" },
        ),
      ]),
    );

    expect(headingOutline(renderer)).toEqual([
      [1, "A clear opening"],
      [1, "Placed group label"],
      [2, "Nested section"],
      [4, "Section detail"],
      [3, "Capabilities"],
      [4, "Direction"],
      [5, "Card detail"],
      [4, "Delivery"],
      [3, "Outcomes"],
      [1, "Closing notes"],
      [2, "Closing detail"],
    ]);
    expect(rendererText(renderer)).toContain("First paragraph.");
    expect(rendererText(renderer)).toContain("Second paragraph.");

    await unmount(renderer);
  });

  it("uses valid feature slots and ignores invalid or unknown blocks", async () => {
    viewport.isMobile = false;
    const renderer = await renderPage(
      structuralRendererProps([
        placement(
          "feature",
          1000,
          block("feature", "feature", "Feature story", {
            alignment: "right",
            body: "# Feature detail",
            placements: [
              placement(
                "feature-default",
                5000,
                block("feature-default", "group", "Follow-up", {
                  placements: [],
                }),
              ),
              placement(
                "feature-media",
                3000,
                block("feature-image", "image", "Feature image", {
                  media: createSiteMediaFixture("feature-asset", "/media/feature.webp"),
                }),
                { slot: "media" },
              ),
              placement(
                "feature-action",
                2000,
                block("feature-action", "link", "Read more", {
                  href: "/work",
                }),
                { slot: "actions" },
              ),
              placement(
                "feature-wrong-slot",
                1000,
                block("feature-wrong-slot", "link", "Wrong media type", {
                  href: "/wrong",
                }),
                { slot: "media" },
              ),
              placement(
                "feature-unknown",
                4000,
                createUnknownSiteBlockFixture(
                  "block-feature-unknown",
                  "futureBlock",
                  "Internal projection warning",
                  { body: "Do not expose this fallback." },
                ),
              ),
            ],
          }),
        ),
      ]),
    );

    expect(renderer.container.querySelector('[src="/media/feature.webp"]')).not.toBeNull();
    expect(renderer.container.querySelector('a[href="/work"]')).not.toBeNull();
    expect(rendererText(renderer)).toContain("Follow-up");
    expect(rendererText(renderer)).not.toContain("Wrong media type");
    expect(rendererText(renderer)).not.toContain("Internal projection warning");
    expect(rendererText(renderer)).not.toContain("Do not expose this fallback.");

    await unmount(renderer);
  });
});

describe("Astryx public Site links, source icons, and media", () => {
  it("uses Site href and target rules for navigation, inline, action, footer, and social links", async () => {
    viewport.isMobile = false;
    const safeIcon = '<svg viewBox="0 0 24 24"><path d="M4 12h16" /></svg>';
    const pageProps = structuralRendererProps([
      placement(
        "inline-internal",
        1000,
        block("inline-internal", "link", "Stored link label", {
          href: "/work#details",
          icon: safeIcon,
        }),
        { label: "Placed link label" },
      ),
      placement(
        "inline-external",
        2000,
        block("inline-external", "link", "External reference", {
          href: "https://example.com/reference",
        }),
      ),
      placement(
        "feature",
        3000,
        block("feature", "feature", "Act now", {
          placements: [
            placement(
              "feature-action",
              1000,
              block("feature-action", "link", "Stored action label", {
                href: "/contact",
                icon: safeIcon,
              }),
              { label: "Start now", slot: "actions" },
            ),
          ],
        }),
      ),
    ]);
    const renderer = await renderPage({
      ...pageProps,
      tree: {
        ...pageProps.tree,
        frame: publicSiteRendererPropsFixture.tree.frame,
      },
    });

    expect(componentByLabel(renderer, "TopNavItem", "Work").getAttribute("href")).toBe("/work");
    const inlineInternal = required(renderer.container.querySelector('a[href="/work#details"]'));
    expect(rendererText(renderer)).toContain("Placed link label");
    expect(inlineInternal.getAttribute("target")).toBeNull();
    expect(inlineInternal.getAttribute("rel")).toBeNull();
    const inlineExternal = required(
      renderer.container.querySelector('a[href="https://example.com/reference"]'),
    );
    expect(inlineExternal.getAttribute("target")).toBe("_blank");
    expect(new Set(inlineExternal.getAttribute("rel")?.split(" "))).toEqual(
      new Set(["noreferrer", "noopener"]),
    );

    const action = required(
      renderer.container.querySelector<HTMLAnchorElement>('a[href="/contact"]'),
    );
    expect(action.getAttribute("href")).toBe("/contact");
    expect(action.textContent).toBe("Start now");
    expect(action.querySelector('path[d="M4 12h16"]')).not.toBeNull();

    const social = required(
      renderer.container.querySelector<HTMLAnchorElement>('a[href="https://github.com/dpeek"]'),
    );
    expect(social.getAttribute("aria-label")).toBe("GitHub");
    expect(social.target).toBe("_blank");
    expect(new Set(social.rel.split(" "))).toEqual(new Set(["noreferrer", "noopener"]));

    await unmount(renderer);
  });

  it("renders projected media with dimensions, semantic slots, and missing states", async () => {
    viewport.isMobile = false;
    const renderer = await renderPage(
      structuralRendererProps([
        placement(
          "delivered-image",
          1000,
          block("delivered-image", "image", "Delivered image", {
            height: 900,
            href: "https://example.com/manual-image.jpg",
            media: createSiteMediaFixture("asset-delivered", "/media/delivered.webp"),
            width: 1600,
          }),
        ),
        placement(
          "missing-image",
          2000,
          block("missing-image", "image", "Missing image", {
            href: "https://example.com/manual-missing.jpg",
          }),
        ),
        placement(
          "feature",
          3000,
          block("feature-media", "feature", "Feature media", {
            placements: [
              placement(
                "feature-image",
                1000,
                block("feature-image", "image", "Feature delivery", {
                  media: createSiteMediaFixture("asset-feature", "/media/feature.webp"),
                }),
                { slot: "media" },
              ),
            ],
          }),
        ),
        placement(
          "summary",
          4000,
          block("summary", "post", "Summary with missing primary image", {
            placements: [
              placement(
                "summary-primary",
                1000,
                block("summary-primary", "image", "Missing summary image"),
                { slot: "primaryImage" },
              ),
            ],
          }),
        ),
      ]),
    );

    const delivered = required(
      renderer.container.querySelector<HTMLImageElement>('img[src="/media/delivered.webp"]'),
    );
    expect(delivered.width).toBe(1600);
    expect(delivered.height).toBe(900);
    expect(
      renderer.container.querySelector('[src="https://example.com/manual-image.jpg"]'),
    ).toBeNull();
    expect(
      renderer.container.querySelector('[src="https://example.com/manual-missing.jpg"]'),
    ).toBeNull();
    expect(renderer.container.querySelector('[aria-label="Missing image"]')).not.toBeNull();
    expect(renderer.container.querySelector('[src="/media/feature.webp"]')).not.toBeNull();
    expect(renderer.container.querySelector('[aria-label="Missing summary image"]')).not.toBeNull();

    await unmount(renderer);
  });

  it("renders post-detail primary media once and excludes it from normal body flow", async () => {
    viewport.isMobile = false;
    const base = shellRendererProps({});
    const renderer = await renderPage({
      ...base,
      tree: {
        ...base.tree,
        frame: {},
        page: block("post-detail", "post", "A detailed post", {
          placements: [
            placement(
              "post-primary",
              1000,
              block("post-primary", "image", "Post cover", {
                height: 1200,
                media: createSiteMediaFixture("asset-post", "/media/post.webp"),
                width: 1800,
              }),
              { slot: "primaryImage" },
            ),
            placement(
              "post-body",
              2000,
              block("post-body", "markdown", "Body", { body: "Post body." }),
            ),
          ],
        }),
        route: { kind: "post", slug: "journal/detailed-post" },
      },
    });

    expect(renderer.container.querySelectorAll('[src="/media/post.webp"]')).toHaveLength(1);
    expect(rendererText(renderer)).toContain("Post body.");

    await unmount(renderer);
  });
});

describe("Astryx public Site lists, summaries, and post detail", () => {
  it("renders ordered query summaries, empty states, dates, media, and published links", async () => {
    viewport.isMobile = false;
    const firstPost = block("first-post", "post", "First projected post", {
      body: "First post summary.",
      date: "2026-07-12",
      href: "/blog/first-post",
      placements: [
        placement(
          "first-post-primary",
          1000,
          block("first-post-image", "image", "First post cover", {
            media: createSiteMediaFixture("asset-first-post", "/media/first-post.webp"),
          }),
          { slot: "primaryImage" },
        ),
      ],
    });
    const secondPost = block("second-post", "post", "Second projected post", {
      body: "Second post summary.",
      date: "2026-07-05",
      href: "/blog/second-post",
    });
    const project = block("project", "project", "Projected project", {
      body: "Project body with a [nested reference](https://example.com/reference).",
      date: "2026-07-01",
      href: "/projects/projected-project",
    });
    const renderer = await renderPage(
      structuralRendererProps([
        placement(
          "posts",
          1000,
          block("posts", "postList", "Latest posts", {
            query: { key: "postList", items: [firstPost, secondPost] },
          }),
        ),
        placement(
          "projects",
          2000,
          block("projects", "projectList", "Projects", {
            query: { key: "projectList", items: [project] },
          }),
        ),
        placement(
          "empty-posts",
          3000,
          block("empty-posts", "postList", "Post archive", {
            query: { key: "postList", items: [] },
          }),
        ),
        placement("empty-projects", 4000, block("empty-projects", "projectList", "Archive")),
      ]),
    );

    expectTextOrder(renderer, [
      "First projected post",
      "Second projected post",
      "Projected project",
    ]);
    expect(renderer.container.querySelector('a[href="/blog/first-post"]')).not.toBeNull();
    expect(
      renderer.container.querySelector('a[href="/projects/projected-project"]'),
    ).not.toBeNull();
    expect(
      Array.from(renderer.container.querySelectorAll("time"), (node) =>
        node.getAttribute("datetime"),
      ),
    ).toEqual(["2026-07-12", "2026-07-05"]);
    expect(renderer.container.querySelector('time[datetime="2026-07-01"]')).toBeNull();
    expect(renderer.container.querySelector('[src="/media/first-post.webp"]')).not.toBeNull();
    const nestedReference = required(
      renderer.container.querySelector<HTMLAnchorElement>(
        'a[href="https://example.com/reference"]',
      ),
    );
    expect(nestedReference.target).toBe("_blank");
    expect(new Set(nestedReference.rel.split(" "))).toEqual(new Set(["noreferrer", "noopener"]));
    expect(
      Array.from(renderer.container.querySelectorAll("p"), (node) => node.textContent),
    ).toEqual(expect.arrayContaining(["No published posts yet.", "No published projects yet."]));

    await unmount(renderer);
  });

  it("keeps summary copy out of post detail and renders ordered default body placements", async () => {
    viewport.isMobile = false;
    const base = shellRendererProps({});
    const renderer = await renderPage({
      ...base,
      tree: {
        ...base.tree,
        frame: {},
        page: block("post-detail-flow", "post", "Post detail flow", {
          body: "Summary-only copy must stay out of the detail body.",
          placements: [
            placement(
              "feature-last",
              3000,
              block("feature-last", "feature", "Author note", {
                body: "Author note body.",
              }),
            ),
            placement(
              "detail-first",
              1000,
              block("detail-first", "markdown", "Body", {
                body: "Detail body with a [nested link](https://example.com/detail).",
              }),
            ),
            placement(
              "post-primary",
              500,
              block("post-primary", "image", "Post cover", {
                media: createSiteMediaFixture("asset-detail-post", "/media/detail-post.webp"),
              }),
              { slot: "primaryImage" },
            ),
            placement("group-middle", 2000, block("group-middle", "group", "Middle section")),
            placement(
              "unused-slot",
              1500,
              block("unused-slot", "group", "Slotted summary content"),
              { slot: "summary" },
            ),
          ],
        }),
        route: { kind: "post", slug: "blog/post-detail-flow" },
      },
    });

    expect(headingOutline(renderer)[0]).toEqual([1, "Middle section"]);
    expect(rendererText(renderer)).not.toContain("Summary-only copy must stay out");
    expect(rendererText(renderer)).not.toContain("Slotted summary content");
    expect(rendererText(renderer)).toContain("Detail body with a");
    expectTextOrder(renderer, ["Detail body with a", "Middle section", "Author note"]);
    expect(renderer.container.querySelector('[href="https://example.com/detail"]')).not.toBeNull();
    expect(renderer.container.querySelectorAll('[src="/media/detail-post.webp"]')).toHaveLength(1);

    await unmount(renderer);
  });
});

describe("Astryx public Site form contract mapping", () => {
  it("maps a projected fixed form to accessible controlled fields and exact field intents", async () => {
    const formBlock = block("contact-contract", "contactForm", "Start a conversation", {
      body: "Tell us what you need.",
      buttonLabel: "Send enquiry",
      emailLabel: "Reply email",
      messageLabel: "Enquiry",
      nameLabel: "Your name",
      publicOperation: fixedPublicOperation("contact"),
    });
    const projectedSession = projectSitePublicFormSession(formBlock, {
      challengeReady: true,
      fieldErrors: { email: "Use a valid reply email." },
      status: "ready",
      values: {
        email: "not-an-email",
        message: "Please send the details.",
        name: "Ada Lovelace",
      },
    });
    const session = { ...projectedSession, challenge: undefined };
    const { intents, renderer } = renderProjectedFormSession(formBlock, session);
    const queries = within(renderer.container);
    const form = queries.getByRole("form", { name: "Start a conversation" });
    const name = queries.getByRole<HTMLInputElement>("textbox", { name: /^Your name/ });
    const email = queries.getByRole<HTMLInputElement>("textbox", { name: /^Reply email/ });
    const message = queries.getByRole<HTMLTextAreaElement>("textbox", { name: /^Enquiry/ });

    expect(name.value).toBe("Ada Lovelace");
    expect(email.value).toBe("not-an-email");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(message.value).toBe("Please send the details.");
    expect(form.textContent).toContain("Use a valid reply email.");
    expect(queries.getByRole<HTMLButtonElement>("button", { name: "Send enquiry" }).disabled).toBe(
      true,
    );

    fireEvent.change(name, { target: { value: "Grace Hopper" } });

    expect(intents).toEqual([
      {
        ...required(session.fields.find((field) => field.name === "name")).changeIntent,
        value: "Grace Hopper",
      },
    ]);
    expect(name.value).toBe("Ada Lovelace");

    await unmount(renderer);
  });

  it("maps projected generic controls to DOM and forwards exact controlled intents", async () => {
    const formBlock = block("generic-contract", "publicOperationForm", "Request a review", {
      body: "Share the request details.",
      buttonLabel: "Send request",
      publicOperation: genericPublicOperation(genericOperationFields()),
    });
    const projectedSession = projectSitePublicFormSession(formBlock, {
      challengeReady: true,
      status: "ready",
      values: {
        approved: false,
        details: "Review the public page.",
        email: "ada@example.com",
        tier: "enterprise",
        topic: "Custom research",
      },
    });
    const session = { ...projectedSession, challenge: undefined };
    const { intents, renderer } = renderProjectedFormSession(formBlock, session);
    const queries = within(renderer.container);
    const form = queries.getByRole("form", { name: "Request a review" });
    const details = queries.getByRole<HTMLTextAreaElement>("textbox", { name: /^Details/ });
    const approved = queries.getByRole<HTMLInputElement>("checkbox", { name: /^Approved/ });
    const tier = queries.getByRole("combobox", { name: /^Tier/ });
    const email = queries.getByRole<HTMLInputElement>("textbox", { name: /^Email/ });
    const topic = queries.getByRole("combobox", { name: /^Topic/ });

    expect(details.value).toBe("Review the public page.");
    expect(approved.checked).toBe(false);
    expect(tier.textContent).toContain("Enterprise");
    expect(email.value).toBe("ada@example.com");
    expect(email.type).toBe("email");
    expect(topic.parentElement?.textContent).toContain("Custom research");
    expect(
      required(form.querySelector<HTMLInputElement>('input[type="hidden"][name="topic"]')).value,
    ).toBe("Custom research");
    expect(queries.getByRole<HTMLButtonElement>("button", { name: "Send request" }).disabled).toBe(
      false,
    );

    fireEvent.click(approved);
    fireEvent.submit(form);

    expect(intents).toEqual([
      {
        ...required(session.fields.find((field) => field.name === "approved")).changeIntent,
        value: true,
      },
      session.submit.intent,
    ]);
    expect(approved.checked).toBe(false);

    await unmount(renderer);
  });

  it("maps affirmative checkbox acceptance to native required and projected invalid state", async () => {
    const fields: SitePublicOperationInputFieldNode[] = [
      {
        name: "ordinaryBoolean",
        label: "Ordinary boolean",
        required: true,
        control: "boolean",
      },
      {
        name: "contactConsent",
        label: "I agree to be contacted",
        required: true,
        mustBeTrue: true,
        control: "boolean",
      },
    ];
    const formBlock = block("affirmative-consent", "publicOperationForm", "Send enquiry", {
      buttonLabel: "Send enquiry",
      publicOperation: genericPublicOperation(fields),
    });
    const projectedSession = projectSitePublicFormSession(formBlock, {
      challengeReady: true,
      fieldErrors: {
        contactConsent: 'Field "contactConsent" must be accepted.',
      },
      status: "ready",
      values: {
        ordinaryBoolean: false,
        contactConsent: false,
      },
    });
    const session = { ...projectedSession, challenge: undefined };
    const { renderer } = renderProjectedFormSession(formBlock, session);
    const queries = within(renderer.container);
    const ordinaryBoolean = queries.getByRole<HTMLInputElement>("checkbox", {
      name: /^Ordinary boolean/,
    });
    const contactConsent = queries.getByRole<HTMLInputElement>("checkbox", {
      name: /^I agree to be contacted/,
    });

    expect(ordinaryBoolean.required).toBe(false);
    expect(ordinaryBoolean.getAttribute("aria-invalid")).toBeNull();
    expect(contactConsent.required).toBe(true);
    expect(contactConsent.getAttribute("aria-invalid")).toBe("true");
    expect(queries.getByRole<HTMLButtonElement>("button", { name: "Send enquiry" }).disabled).toBe(
      true,
    );

    await unmount(renderer);
  });
});

describe("Astryx public Site system states", () => {
  it.each([
    ["loading", { kind: "loading", slug: "home" }, "Loading site page...", "Loading home."],
    [
      "not-found",
      { kind: "not-found", slug: "missing", homeHref: "/campaign" },
      "Page not found",
      "No site page exists for missing.",
    ],
    [
      "failure",
      { kind: "failure", slug: "journal", message: "Tree unavailable" },
      "Site page failed to load",
      "journal: Tree unavailable",
    ],
  ] as const)("renders the browser %s state", async (kind, props, title, detail) => {
    const mounted = render(<FormlessSiteSystemStateRenderer {...props} />);

    expect(rendererText(mounted)).toContain(title);
    expect(rendererText(mounted)).toContain(detail);
    if (kind === "not-found") {
      expect(mounted.container.querySelector('[href="/campaign"]')).not.toBeNull();
    }
    if (kind === "failure") {
      expect(mounted.container.querySelector('[role="alert"]')).not.toBeNull();
    }

    await unmount(mounted);
  });

  it.each([
    ["not-found", { kind: "not-found", slug: "worker-missing", homeHref: "/" }, "Page not found"],
    [
      "failure",
      { kind: "failure", slug: "worker-error", message: "Projection failed" },
      "Site page failed to load",
    ],
  ] as const)("renders the Worker %s body without owning its document", (_kind, props, title) => {
    const html = renderToStaticMarkup(<FormlessSiteSystemStateRenderer {...props} />);

    expect(html).toContain(title);
    expect(html).not.toContain("<html");
  });
});

function shellRendererProps(
  frame: SitePageFrame = publicSiteRendererPropsFixture.tree.frame,
): SitePublicRendererProps {
  return {
    ...publicSiteRendererPropsFixture,
    tree: {
      ...publicSiteRendererPropsFixture.tree,
      frame,
      page: {
        ...publicSiteRendererPropsFixture.tree.page,
        body: undefined,
        placements: [],
      },
    },
  };
}

function structuralRendererProps(placements: SitePlacementNode[]): SitePublicRendererProps {
  return {
    ...shellRendererProps({}),
    tree: {
      ...publicSiteRendererPropsFixture.tree,
      frame: {},
      page: block("structural-page", "page", "Structural page", {
        body: "Page introduction.",
        placements,
      }),
    },
  };
}

function fixedFormRendererProps(formBlock: SiteBlockNode): SitePublicRendererProps {
  const props = shellRendererProps({});

  return {
    ...props,
    tree: {
      ...props.tree,
      page: block("fixed-form-page", "page", "Contact", {
        placements: [placement("fixed-form", 1000, formBlock)],
      }),
    },
  };
}

function genericOperationFields(): SitePublicOperationInputFieldNode[] {
  return [
    { name: "details", label: "Details", required: false, control: "longText" },
    { name: "approved", label: "Approved", required: false, control: "boolean" },
    {
      name: "tier",
      label: "Tier",
      required: true,
      control: "enum",
      options: [
        { value: "standard", label: "Standard" },
        { value: "enterprise", label: "Enterprise" },
      ],
    },
    { name: "email", label: "Email", required: true, control: "text", format: "email" },
    {
      name: "topic",
      label: "Topic",
      required: false,
      control: "text",
      suggestions: ["Research", "Delivery"],
    },
  ];
}

function genericPublicOperation(
  fields: SitePublicOperationInputFieldNode[],
): NonNullable<SiteBlockNode["publicOperation"]> {
  return {
    entityName: "request",
    operationName: "submit",
    canonicalKey: "request.submit",
    kind: "command",
    route: "/api/formless/program/public/operations/request/submit",
    challenge: {
      kind: "turnstile",
      siteKey: "public-site-key",
    },
    fields,
  };
}

function fixedPublicOperation(
  kind: "contact" | "subscribe",
): NonNullable<SiteBlockNode["publicOperation"]> {
  const entityName = kind === "subscribe" ? "subscription" : "contactMessage";
  const operationName = kind === "subscribe" ? "subscribe" : "send";

  return {
    entityName,
    operationName,
    canonicalKey: `${entityName}.${operationName}`,
    kind: kind === "subscribe" ? "command" : "create",
    route: `/api/formless/program/public/operations/${entityName}/${operationName}`,
    challenge: {
      kind: "turnstile",
      siteKey: "public-site-key",
    },
  };
}

function renderProjectedFormSession(formBlock: SiteBlockNode, session: SitePublicFormSession) {
  const intents: SitePublicFormIntent[] = [];
  const controller: SitePublicFormSessionController = {
    dispatch: async (intent) => {
      intents.push(intent);
    },
    getSnapshot: () => session,
    subscribe: () => () => undefined,
  };
  const renderer = render(
    <PublicSiteThemeProvider site={fixedFormRendererProps(formBlock).tree.site}>
      <AstryxSitePresentation
        formSessionControllers={new Map([[formBlock.id, controller]])}
        rendererProps={fixedFormRendererProps(formBlock)}
      />
    </PublicSiteThemeProvider>,
  );

  return { intents, renderer };
}

function block(
  id: string,
  type: SitePublicBlockType,
  label: string,
  options: Parameters<typeof createSiteBlockFixture>[3] = {},
): SiteBlockNode {
  return createSiteBlockFixture(`block-${id}`, type, label, options);
}

function placement(
  id: string,
  order: number,
  child: SiteBlockNode,
  options: Parameters<typeof createSitePlacementFixture>[3] = {},
): SitePlacementNode {
  return createSitePlacementFixture(`placement-${id}`, order, child, options);
}

function withExternalHeaderLink(props: SitePublicRendererProps): SitePublicRendererProps {
  const header = props.tree.frame.header;
  if (!header) {
    throw new Error("Expected header fixture");
  }
  const secondaryIndex = header.placements.findIndex(
    (placement) => placement.block.type === "headerSecondary",
  );
  const secondary = header.placements[secondaryIndex];
  if (!secondary) {
    throw new Error("Expected secondary header group fixture");
  }

  const externalPlacement = {
    id: "placement-header-documentation",
    order: 2000,
    block: {
      id: "block-link-documentation",
      type: "link",
      label: "Documentation",
      href: "https://example.com/docs",
      placements: [],
    },
  };
  const headerPlacements = [...header.placements];
  headerPlacements[secondaryIndex] = {
    ...secondary,
    block: {
      ...secondary.block,
      placements: [...secondary.block.placements, externalPlacement],
    },
  };

  return {
    ...props,
    tree: {
      ...props.tree,
      frame: {
        ...props.tree.frame,
        header: { ...header, placements: headerPlacements },
      },
    },
  };
}

async function renderPage(props: SitePublicRendererProps) {
  return render(
    <PublicSiteThemeProvider site={props.tree.site}>
      <FormlessSitePageRenderer {...props} />
    </PublicSiteThemeProvider>,
  );
}

function componentLabels(renderer: RenderResult, component: string): string[] {
  return componentElements(renderer, component).map(accessibleLabel);
}

function componentByLabel(renderer: RenderResult, component: string, label: string): HTMLElement {
  return required(
    componentElements(renderer, component).find((node) => accessibleLabel(node) === label),
  );
}

function componentElements(renderer: RenderResult, component: string): HTMLElement[] {
  const selector =
    component === "TopNavItem"
      ? "[data-site-navigation-group] a"
      : component === "SideNavItem"
        ? "dialog a"
        : "button, a[data-site-action-link]";

  return Array.from(renderer.container.querySelectorAll<HTMLElement>(selector));
}

function accessibleLabel(node: HTMLElement): string {
  return node.getAttribute("aria-label") ?? node.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function groupLabels(root: Element): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[role="group"][aria-labelledby]')).map(
    (group) => {
      const id = group.getAttribute("aria-labelledby");
      return id ? (root.ownerDocument.getElementById(id)?.textContent ?? "") : "";
    },
  );
}

function rendererText(renderer: RenderResult) {
  return renderer.container.textContent ?? "";
}

function expectTextOrder(renderer: RenderResult, labels: readonly string[]) {
  const text = rendererText(renderer);
  let previousIndex = -1;

  for (const label of labels) {
    const index = text.indexOf(label, previousIndex + 1);
    expect(index >= 0).toBe(true);
    expect(index > previousIndex).toBe(true);
    previousIndex = index;
  }
}

function headingOutline(renderer: RenderResult): Array<[number, string]> {
  return Array.from(
    renderer.container.querySelectorAll<HTMLHeadingElement>("h1,h2,h3,h4,h5,h6"),
  ).map((node) => {
    const type = node.tagName.toLowerCase();
    const text = node.textContent ?? "";

    return [Number(type.slice(1)), text] as [number, string];
  });
}

async function unmount(renderer: RenderResult) {
  renderer.unmount();
}

function required<T>(value: T): NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error("Expected rendered value");
  }
  return value as NonNullable<T>;
}
