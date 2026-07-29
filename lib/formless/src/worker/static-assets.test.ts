import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import { DEFAULT_SITE_ICON_SVG, resolveSiteIconSvgSource } from "@dpeek/formless-site-app";
import {
  recordOperationRequest,
  restoreTestStorageSnapshot,
  schemaAppTestStorageSnapshot,
} from "../test/authority-write.ts";
import { testSiteRecords } from "../test/site-records.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { PUBLIC_SITE_ICON_CACHE_CONTROL } from "@dpeek/formless-site-app/worker";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";
const publishedPackageAppKey = "site";
const publishedInstallId = "site";
const iconPaths = ["/favicon.svg", "/favicon.ico", "/apple-touch-icon.png"] as const;

let harness: Harness;
let assetRequests: string[] = [];

beforeAll(async () => {
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        FORMLESS_RUNTIME_PROFILE: "publishedSite",
        FORMLESS_RUNTIME_APP_INSTALL_ID: publishedInstallId,
        FORMLESS_RUNTIME_PACKAGE_APP_KEY: publishedPackageAppKey,
      },
      compatibilityDate: "2026-04-28",
      serviceBindings: {
        ASSETS: packagePublicAssetResponse,
      },
    },
  );
});

beforeEach(async () => {
  assetRequests = [];
  await restoreSiteState();
});

afterAll(async () => {
  await harness.dispose();
});

describe("published Site launch assets", () => {
  it("serves dynamic favicon and touch icon assets from Site settings", async () => {
    const svg = await assetBytes("/favicon.svg");
    const ico = await assetBytes("/favicon.ico");
    const appleTouchIcon = await assetBytes("/apple-touch-icon.png");

    expect(svg.contentType).toBe("image/svg+xml; charset=utf-8");
    expect(svg.cacheControl).toBe(PUBLIC_SITE_ICON_CACHE_CONTROL);
    expect(svg.etag).toMatch(/^"site-icon:favicon-svg:/);
    expect(svg.bytesAsText()).toBe(resolveSiteIconSvgSource(testSiteIconSource()));
    expect(ico.contentType).not.toContain("text/html");
    expect(ico.cacheControl).toBe(PUBLIC_SITE_ICON_CACHE_CONTROL);
    expect(ico.etag).toMatch(/^"site-icon:favicon-ico:/);
    expect(ico.bytes.subarray(0, 4)).toEqual(new Uint8Array([0, 0, 1, 0]));
    expect(appleTouchIcon.contentType).toBe("image/png");
    expect(appleTouchIcon.cacheControl).toBe(PUBLIC_SITE_ICON_CACHE_CONTROL);
    expect(appleTouchIcon.etag).toMatch(/^"site-icon:apple-touch-png:/);
    expect(appleTouchIcon.bytes.subarray(0, 8)).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(assetRequests).toEqual([]);
  });

  it("matches HEAD status and headers without sending a body", async () => {
    for (const path of iconPaths) {
      const get = await harness.fetch(path, { method: "GET" });
      const head = await harness.fetch(path, { method: "HEAD" });

      expect(head.status).toBe(get.status);
      expect(head.headers.get("Cache-Control")).toBe(get.headers.get("Cache-Control"));
      expect(head.headers.get("Content-Type")).toBe(get.headers.get("Content-Type"));
      expect(head.headers.get("ETag")).toBe(get.headers.get("ETag"));
      expect(await head.text()).toBe("");
    }
  });

  it("serves updated authored SVG source and changes the generated ETag", async () => {
    const before = await assetBytes("/favicon.svg");
    const authored =
      '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="28" fill="#ef4444"/></svg>';

    await patchSiteIcon("write-site-icon-authored", authored);

    const after = await assetBytes("/favicon.svg");

    expect(after.bytesAsText()).toContain("#ef4444");
    expect(after.etag).not.toBe(before.etag);
  });

  it("falls back to the default icon when the authored Site icon is unsafe", async () => {
    await patchSiteIcon(
      "write-site-icon-unsafe",
      '<svg viewBox="0 0 64 64"><script>alert(1)</script></svg>',
    );

    const svg = await assetBytes("/favicon.svg");
    const png = await assetBytes("/apple-touch-icon.png");
    const ico = await assetBytes("/favicon.ico");

    expect(svg.bytesAsText()).toBe(resolveSiteIconSvgSource(DEFAULT_SITE_ICON_SVG));
    expect(svg.bytesAsText()).not.toContain("<script");
    expect(png.bytes.subarray(0, 8)).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(ico.bytes.subarray(0, 4)).toEqual(new Uint8Array([0, 0, 1, 0]));
  });

  it("returns 304 when the request ETag matches the generated icon", async () => {
    const first = await assetBytes("/favicon.svg");
    const response = await harness.fetch("/favicon.svg", {
      headers: {
        "If-None-Match": first.etag ?? "",
      },
    });

    expect(response.status).toBe(304);
    expect(response.headers.get("ETag")).toBe(first.etag);
    expect(await response.text()).toBe("");
  });
});

async function assetBytes(path: string) {
  const response = await harness.fetch(path, {
    headers: { Accept: "text/html" },
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get("Content-Type") ?? "";

  expect(response.status).toBe(200);
  expect(contentType).not.toContain("text/html");

  return {
    bytes,
    bytesAsText: () => new TextDecoder().decode(bytes),
    cacheControl: response.headers.get("Cache-Control"),
    contentType,
    etag: response.headers.get("ETag"),
  };
}

async function restoreSiteState() {
  await restoreTestStorageSnapshot(
    harness,
    `/api/app-installs/${publishedPackageAppKey}/${publishedInstallId}/snapshot/restore`,
    schemaAppTestStorageSnapshot("site", `app:${publishedInstallId}`),
    adminHeaders(),
  );
}

function testSiteIconSource(): string {
  const icon = testSiteRecords.find((record) => record.entity === "site")?.values.icon;

  if (typeof icon !== "string") {
    throw new Error("Site test records must include an SVG icon.");
  }

  return icon;
}

async function patchSiteIcon(idempotencyKey: string, icon: string) {
  const request = recordOperationRequest({
    idempotencyKey,
    entity: "site",
    operationName: "update",
    recordId: "rec_site_settings_primary",
    input: { icon },
  });
  const response = await harness.fetch(
    `/api/app-installs/${publishedPackageAppKey}/${publishedInstallId}${request.path.slice("/api".length)}`,
    {
      body: JSON.stringify(request.body),
      headers: adminHeaders(),
      method: "POST",
    },
  );

  expect(response.status).toBe(200);
}

function adminHeaders() {
  return {
    Authorization: `Bearer ${adminToken}`,
    "Content-Type": "application/json",
  };
}

function packagePublicAssetResponse(request: Request): Response {
  assetRequests.push(new URL(request.url).pathname);

  return new Response("static asset fallback", {
    headers: { "Content-Type": "text/plain" },
    status: 200,
  });
}
