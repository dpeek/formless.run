import { describe, expect, it } from "vite-plus/test";

import type { StoredRecord } from "./types.ts";
import { testSiteRecords } from "./test-records.ts";
import {
  buildPublicSitemapXml,
  buildPublicSiteRouteEntries,
  renderPublicRobotsTxt,
} from "./public-indexing.ts";

describe("public Site indexing", () => {
  it("builds deterministic public routes from live pages and dated posts", () => {
    const routes = buildPublicSiteRouteEntries(
      [
        ...testSiteRecords,
        siteRecord("rec_site_settings_route_shaped", {
          key: "secondary",
          label: "Route-shaped settings",
          href: "/settings-owned-route",
        }),
        blockRecord("rec_site_content_preview_page", {
          type: "page",
          label: "Preview page",
          href: "/preview-page?draft=1#top",
        }),
        blockRecord("rec_site_content_icon_path_page", {
          type: "page",
          label: "Icon route",
          href: "/favicon.svg",
        }),
        blockRecord("rec_site_content_former_rates_page", {
          type: "page",
          label: "Former rates route",
          href: "/rates",
        }),
        blockRecord("rec_site_content_preview_post", {
          type: "post",
          label: "Preview post",
          href: "/blog/preview-post?draft=1#top",
          date: "2026-05-15",
        }),
        blockRecord("rec_site_content_undated_post", {
          type: "post",
          label: "Undated post",
          href: "/blog/undated-post",
        }),
        blockRecord(
          "rec_site_content_deleted_page",
          {
            type: "page",
            label: "Deleted page",
            href: "/deleted",
          },
          "2026-05-15T00:00:00.000Z",
        ),
        blockRecord("rec_site_content_blocked_site", {
          type: "page",
          label: "Blocked app route",
          href: "/site",
        }),
        blockRecord("rec_site_content_blocked_asset", {
          type: "page",
          label: "Blocked asset route",
          href: "/downloads/resume.pdf",
        }),
        blockRecord("rec_site_content_duplicate_blog", {
          type: "page",
          label: "Duplicate blog",
          href: "/blog",
        }),
      ],
      { clientRoutePrefixes: ["/admin", "/schema", "/site"] },
    );
    const paths = routes.map((route) => route.path);

    expect(paths[0]).toBe("/");
    expect(paths).toEqual([...paths].sort(homeFirstPathCompare));
    expect(paths).toEqual(
      expect.arrayContaining([
        "/",
        "/blog",
        "/blog/generated-editorial-tools",
        "/blog/preview-post",
        "/blog/shipping-schema-backed-authoring",
        "/preview-page",
        "/projects",
        "/rates",
        "/resume",
      ]),
    );
    for (const excludedPath of [
      "/api/report",
      "/deleted",
      "/downloads/resume.pdf",
      "/favicon.svg",
      "/settings-owned-route",
      "/site",
      "/blog/undated-post",
    ]) {
      expect(paths).not.toContain(excludedPath);
    }
    expect(paths.filter((path) => path === "/blog")).toHaveLength(1);
    expect(routes.find((route) => route.path === "/blog")?.recordId).toBe("rec_site_content_blog");
  });

  it("renders robots text with a canonical sitemap URL", () => {
    expect(renderPublicRobotsTxt("https://example.com/path?preview=1")).toBe(`User-agent: *
Allow: /

Sitemap: https://example.com/sitemap.xml
`);
  });

  it("renders sitemap XML with canonical escaped URLs", () => {
    const xml = buildPublicSitemapXml(
      [
        { kind: "page", path: "/", recordId: "home" },
        { kind: "post", path: "/blog/a&b", recordId: "post" },
      ],
      "https://example.com/base?preview=1",
    );

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain("<loc>https://example.com/</loc>");
    expect(xml).toContain("<loc>https://example.com/blog/a&amp;b</loc>");
    expect(xml).not.toContain("<html");
  });
});

function blockRecord(id: string, values: StoredRecord["values"], deletedAt?: string): StoredRecord {
  return {
    id,
    entity: "block",
    values,
    createdAt: "2026-05-15T00:00:00.000Z",
    ...(deletedAt === undefined ? {} : { deletedAt }),
  };
}

function siteRecord(id: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity: "site",
    values,
    createdAt: "2026-05-15T00:00:00.000Z",
  };
}

function homeFirstPathCompare(a: string, b: string): number {
  if (a === "/" && b !== "/") {
    return -1;
  }

  if (a !== "/" && b === "/") {
    return 1;
  }

  return a.localeCompare(b);
}
