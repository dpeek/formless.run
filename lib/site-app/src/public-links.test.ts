import { describe, expect, it } from "vite-plus/test";
import {
  isExternalSiteHref,
  profileAwareSiteHref,
  siteHrefMatchesRoute,
  siteLinkRel,
  siteLinkTarget,
  sitePagePathForSlug,
  type SitePageLinkMode,
  type SitePublicRouteBase,
} from "@dpeek/formless-site-app";

describe("site renderer links", () => {
  it("resolves every public profile through renderer-neutral package exports", () => {
    const cases = [
      {
        expectedHome: "/",
        expectedPost: "/blog/post?draft=1#top",
        linkMode: "preview",
        routeBase: undefined,
      },
      {
        expectedHome: "/",
        expectedPost: "/blog/post?draft=1#top",
        linkMode: "authoring",
        routeBase: undefined,
      },
      {
        expectedHome: "/",
        expectedPost: "/blog/post?draft=1#top",
        linkMode: "published",
        routeBase: undefined,
      },
      {
        expectedHome: "/site/preview",
        expectedPost: "/site/preview/blog/post?draft=1#top",
        linkMode: "preview",
        routeBase: "/site/preview",
      },
    ] as const satisfies readonly {
      expectedHome: string;
      expectedPost: string;
      linkMode: SitePageLinkMode;
      routeBase?: SitePublicRouteBase;
    }[];

    for (const { expectedHome, expectedPost, linkMode, routeBase } of cases) {
      expect(profileAwareSiteHref("/", linkMode, routeBase)).toBe(expectedHome);
      expect(profileAwareSiteHref("/blog/post?draft=1#top", linkMode, routeBase)).toBe(
        expectedPost,
      );
    }
  });

  it("renders stored root-relative links at the selected route base", () => {
    expect(sitePagePathForSlug("home", "published")).toBe("/");
    expect(sitePagePathForSlug("home", "authoring")).toBe("/");
    expect(profileAwareSiteHref("/blog", "published", "/campaign")).toBe("/campaign/blog");
    expect(profileAwareSiteHref("/campaign/blog", "published", "/campaign")).toBe("/campaign/blog");
  });

  it("leaves external links unchanged and projects browser target facts", () => {
    const href = "https://example.com/page";

    expect(profileAwareSiteHref(href, "preview")).toBe(href);
    expect(profileAwareSiteHref(href, "authoring")).toBe(href);
    expect(profileAwareSiteHref(href, "published")).toBe(href);
    expect(isExternalSiteHref(href)).toBe(true);
    expect(siteLinkRel(href)).toBe("noreferrer");
    expect(siteLinkTarget(href)).toBe("_blank");
    expect(siteLinkRel("/blog")).toBeUndefined();
    expect(siteLinkTarget("/blog")).toBeUndefined();
  });

  it("matches projected route state for active navigation", () => {
    expect(siteHrefMatchesRoute("/", "home")).toBe(true);
    expect(siteHrefMatchesRoute("/", "blog")).toBe(false);
    expect(siteHrefMatchesRoute("/blog", "blog/shipping-schema-backed-authoring")).toBe(true);
    expect(siteHrefMatchesRoute("/projects", "projects/future-detail")).toBe(true);
    expect(siteHrefMatchesRoute("/campaign/blog", "blog/post", "/campaign")).toBe(true);
    expect(siteHrefMatchesRoute("/docs/blog", "blog/post", "/campaign")).toBe(false);
    expect(siteHrefMatchesRoute("https://example.com/page", "home")).toBe(false);
  });
});
