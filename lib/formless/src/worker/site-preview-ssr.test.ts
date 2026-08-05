import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import { INITIAL_SITE_PAGE_TREE_SCRIPT_ID } from "@dpeek/formless-site-app/react";
import {
  FORMLESS_SITE_ROUTE_BASE_META_NAME,
  FORMLESS_SITE_ROUTE_SLUG_META_NAME,
  FORMLESS_SITE_ROUTE_STATE_META_NAME,
} from "../shared/runtime-topology.ts";
import {
  instanceControlPlaneTestStorageSnapshot,
  restoreTestStorageSnapshot,
} from "../test/authority-write.ts";
import { testIdentityOwnerSessionHeaders } from "../test/identity-owner.ts";
import { testSiteRecords } from "../test/site-records.ts";
import { FORMLESS_PROGRAM_API_ROUTE_PREFIX } from "../program/target.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "site-preview-admin-token";
let harness: Harness;

beforeAll(async () => {
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        FORMLESS_LOCAL_SESSION_BOOTSTRAP_TOKEN: "site-preview-bootstrap-token",
        FORMLESS_RUNTIME_PROFILE: "instance",
        FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN: "site-preview-proxy-token",
        FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL: "http://127.0.0.1:8788",
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

describe("Program-owned Worker Site preview", () => {
  it("authorizes before rendering current Program records at the materialized mount", async () => {
    const anonymous = await previewRequest("/site/public", { redirect: "manual" });
    const headers = await testIdentityOwnerSessionHeaders(harness, adminToken, {
      name: "Site Preview Owner",
    });
    const response = await previewRequest("/site/public/blog/shipping-schema-backed-authoring", {
      headers,
    });
    const html = await response.text();

    expect(anonymous.status).toBe(302);
    expect(anonymous.headers.get("Location")).toContain("/formless/auth");
    expect(anonymous.headers.get("Cache-Control")).not.toBe("private, no-store");
    expect(await anonymous.text()).not.toContain("Example Site");

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Accept, Cookie");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
    expect(html).toContain("Shipping schema-backed authoring");
    expect(html).toContain('href="/site/public"');
    expect(html).toContain(
      `<meta name="${FORMLESS_SITE_ROUTE_BASE_META_NAME}" content="/site/public" />`,
    );
    expect(html).toContain(
      `<meta name="${FORMLESS_SITE_ROUTE_SLUG_META_NAME}" content="blog/shipping-schema-backed-authoring" />`,
    );
    expect(html).toContain(
      `<meta name="${FORMLESS_SITE_ROUTE_STATE_META_NAME}" content="found" />`,
    );
    expect(html).toContain(`<script id="${INITIAL_SITE_PAGE_TREE_SCRIPT_ID}"`);
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain('property="og:url"');
    expect(html).not.toContain('rel="icon"');
  });

  it("preserves HEAD policy without admitting mutating, non-HTML, indexing, or icon requests", async () => {
    const headers = await testIdentityOwnerSessionHeaders(harness, adminToken, {
      name: "Site Preview Owner",
    });
    const head = await previewRequest("/site/public", { headers, method: "HEAD" });
    const excluded = await Promise.all([
      previewRequest("/site/public", { accept: "application/json", headers }),
      previewRequest("/site/public", { headers, method: "POST" }),
      previewRequest("/site/public/robots.txt", { headers }),
      previewRequest("/site/public/sitemap.xml", { headers }),
      previewRequest("/site/public/favicon.svg", { headers }),
    ]);

    expect(head.status).toBe(200);
    expect(head.headers.get("Cache-Control")).toBe("private, no-store");
    expect(head.headers.get("Vary")).toBe("Accept, Cookie");
    expect(head.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
    expect(await head.text()).toBe("");
    expect(excluded.map((response) => response.status)).toEqual([404, 404, 404, 404, 404]);
  });
});

async function previewRequest(
  path: string,
  options: {
    accept?: string;
    headers?: Record<string, string>;
    method?: string;
    redirect?: RequestRedirect;
  } = {},
) {
  return harness.fetch(path, {
    headers: {
      Accept: options.accept ?? "text/html",
      ...options.headers,
    },
    method: options.method,
    redirect: options.redirect,
  });
}

function adminHeaders() {
  return {
    Authorization: `Bearer ${adminToken}`,
    "Content-Type": "application/json",
  };
}
