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
        expectedHome: "/pages/home",
        expectedPost: "/pages/blog/post?draft=1#top",
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
        expectedHome: "/campaign",
        expectedPost: "/campaign/blog/post?draft=1#top",
        linkMode: "published",
        routeBase: "/campaign",
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

  it("renders published and authoring links at top-level paths", () => {
    expect(sitePagePathForSlug("home", "published")).toBe("/");
    expect(profileAwareSiteHref("/pages/blog", "published")).toBe("/blog");
    expect(sitePagePathForSlug("home", "authoring")).toBe("/");
    expect(profileAwareSiteHref("/pages/blog", "authoring")).toBe("/blog");
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
    expect(siteHrefMatchesRoute("/pages/home", "home")).toBe(true);
    expect(siteHrefMatchesRoute("/", "blog")).toBe(false);
    expect(siteHrefMatchesRoute("/pages/blog", "blog/shipping-schema-backed-authoring")).toBe(true);
    expect(siteHrefMatchesRoute("/projects", "projects/future-detail")).toBe(true);
    expect(siteHrefMatchesRoute("/campaign/blog", "blog/post", "/campaign")).toBe(true);
    expect(siteHrefMatchesRoute("/docs/blog", "blog/post", "/campaign")).toBe(false);
    expect(siteHrefMatchesRoute("https://example.com/page", "home")).toBe(false);
  });
});
