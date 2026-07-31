import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  instanceControlPlaneTestStorageSnapshot,
  restoreTestStorageSnapshot,
} from "../test/authority-write.ts";
import { FORMLESS_PROGRAM_API_ROUTE_PREFIX } from "../program/target.ts";
import { testSiteRecords } from "../test/site-records.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import { createWorkerHarness } from "./miniflare-test.ts";
import { PUBLIC_SITE_INDEXING_CACHE_CONTROL } from "@dpeek/formless-site-app/worker";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";
let harness: Harness;

beforeAll(async () => {
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: {
        FORMLESS_RUNTIME_PROFILE: "publishedSite",
        FORMLESS_ADMIN_TOKEN: adminToken,
      },
      compatibilityDate: "2026-04-28",
    },
  );
});

beforeEach(async () => {
  await restoreTestStorageSnapshot(
    harness,
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/snapshot/restore`,
    instanceControlPlaneTestStorageSnapshot(testSiteRecords),
    adminHeaders(),
  );
});

afterAll(async () => {
  await harness.dispose();
});

describe("published Site indexing resources", () => {
  it("serves robots.txt as plain text instead of the client shell", async () => {
    const response = await harness.fetch("/robots.txt", {
      headers: { Accept: "text/html" },
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(PUBLIC_SITE_INDEXING_CACHE_CONTROL);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("Content-Type")).not.toContain("text/html");
    expect(body).toBe(`User-agent: *
Allow: /

Sitemap: http://example.com/sitemap.xml
`);
    expect(body).not.toContain("<html");
  });

  it("serves sitemap.xml from public Site routes instead of the client shell", async () => {
    await restoreProgramSiteRecords([
      ...testSiteRecords,
      siteBlock("rec_site_sitemap_launch_check", {
        type: "page",
        label: "Launch check",
        body: "Sitemap launch check.",
        href: "/launch-check",
      }),
      siteBlock("rec_site_sitemap_post", {
        type: "post",
        label: "Sitemap post",
        body: "Sitemap post check.",
        href: "/blog/sitemap-post",
        date: "2026-05-15",
      }),
      siteBlock("rec_site_sitemap_undated_post", {
        type: "post",
        label: "Undated draft",
        body: "Hidden until dated.",
        href: "/blog/undated-draft",
      }),
      siteBlock("rec_site_sitemap_blocked_route", {
        type: "page",
        label: "Blocked app route",
        body: "Generated app route.",
        href: "/site",
      }),
    ]);

    const response = await harness.fetch("/sitemap.xml", {
      headers: { Accept: "text/html" },
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(PUBLIC_SITE_INDEXING_CACHE_CONTROL);
    expect(response.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
    expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(body).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(body).toContain("<loc>http://example.com/launch-check</loc>");
    expect(body).toContain("<loc>http://example.com/blog/sitemap-post</loc>");
    expect(body).not.toContain("<html");
    expect(body).not.toContain("/pages/");
    expect(body).not.toContain("undated-draft");
  });

  it("keeps sitemap entries unchanged when only Site settings change", async () => {
    const beforeResponse = await harness.fetch("/sitemap.xml");
    const beforeBody = await beforeResponse.text();

    await restoreProgramSiteRecords(
      testSiteRecords.map((record) =>
        record.id === "rec_site_settings_primary"
          ? {
              ...record,
              values: {
                ...record.values,
                label: "Renamed Site",
                description: "Settings should not change sitemap routes.",
                icon: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#0f766e"/></svg>',
              },
              updatedAt: "2026-07-31T00:00:00.000Z",
            }
          : record,
      ),
    );

    const afterResponse = await harness.fetch("/sitemap.xml");
    const afterBody = await afterResponse.text();

    expect(afterResponse.status).toBe(beforeResponse.status);
    expect(afterBody).toBe(beforeBody);
    expect(afterBody).not.toContain("Renamed Site");
    expect(afterBody).not.toContain("rec_site_settings_primary");
  });

  it("returns HEAD indexing headers without response bodies", async () => {
    const robotsGet = await harness.fetch("/robots.txt");
    const robotsHead = await harness.fetch("/robots.txt", { method: "HEAD" });
    const sitemapGet = await harness.fetch("/sitemap.xml");
    const sitemapHead = await harness.fetch("/sitemap.xml", { method: "HEAD" });

    expect(robotsHead.status).toBe(robotsGet.status);
    expect(robotsHead.headers.get("Content-Type")).toBe(robotsGet.headers.get("Content-Type"));
    expect(robotsHead.headers.get("Cache-Control")).toBe(robotsGet.headers.get("Cache-Control"));
    expect(await robotsHead.text()).toBe("");

    expect(sitemapHead.status).toBe(sitemapGet.status);
    expect(sitemapHead.headers.get("Content-Type")).toBe(sitemapGet.headers.get("Content-Type"));
    expect(sitemapHead.headers.get("Cache-Control")).toBe(sitemapGet.headers.get("Cache-Control"));
    expect(await sitemapHead.text()).toBe("");
  });
});

async function restoreProgramSiteRecords(records: StoredRecord[]) {
  await restoreTestStorageSnapshot(
    harness,
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/snapshot/restore`,
    instanceControlPlaneTestStorageSnapshot(records),
    adminHeaders(),
  );
}

function siteBlock(id: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity: "block",
    values,
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
  };
}

function adminHeaders() {
  return {
    Authorization: `Bearer ${adminToken}`,
    "Content-Type": "application/json",
  };
}
