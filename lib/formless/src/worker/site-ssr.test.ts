import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  FORMLESS_RUNTIME_APP_INSTALL_ID_META_NAME,
  FORMLESS_RUNTIME_PACKAGE_APP_KEY_META_NAME,
  FORMLESS_RUNTIME_PROFILE_META_NAME,
} from "../app/runtime-profile.ts";
import { INITIAL_SITE_PAGE_TREE_SCRIPT_ID } from "@dpeek/formless-site-app/react";
import { installedAppStorageIdentity } from "../shared/app-storage-identity.ts";
import type { SchemaKey } from "../shared/schema-apps.ts";
import type { SitePageTreeResponse } from "@dpeek/formless-site-app";
import {
  recordOperationRequest,
  restoreTestStorageSnapshot,
  schemaAppTestStorageSnapshot,
} from "../test/authority-write.ts";
import type { Env } from "./index.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { handlePublicSiteDocumentRequest } from "./public-site-worker-runtime.ts";
import {
  PUBLISHED_SITE_ERROR_CACHE_CONTROL,
  PUBLISHED_SITE_HTML_CACHE_CONTROL,
  PUBLISHED_SITE_NOT_FOUND_CACHE_CONTROL,
} from "@dpeek/formless-site-app/worker";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";
const publishedPackageAppKey = "site";
const publishedInstallId = "site";

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
        FORMLESS_RUNTIME_APP_INSTALL_ID: publishedInstallId,
        FORMLESS_RUNTIME_PACKAGE_APP_KEY: publishedPackageAppKey,
        FORMLESS_ADMIN_TOKEN: adminToken,
      },
      compatibilityDate: "2026-04-28",
    },
  );
});

beforeEach(async () => {
  await resetSchemaApp("site");
  await resetInstalledApp(publishedPackageAppKey, publishedInstallId);
});

afterAll(async () => {
  await harness.dispose();
});

describe("published Site Worker SSR", () => {
  it("does not render published Site documents outside the published runtime profile", async () => {
    const response = await handlePublicSiteDocumentRequest(
      new Request("https://example.com/", {
        headers: { Accept: "text/html" },
      }),
      envWithTreeResponse(Response.json(testSitePageTree("home")), undefined, "dev"),
    );

    expect(response).toBeUndefined();
  });

  it("returns server-rendered HTML for the published home route", async () => {
    const response = await getDocument("/");
    const html = await response.text();
    const payload = initialTreePayload(html);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(PUBLISHED_SITE_HTML_CACHE_CONTROL);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("Vary")).toBe("Accept");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain(
      '<html lang="en" data-astryx-theme="neutral" data-theme="light" data-site-theme="light" style="color-scheme: light;">',
    );
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
    expect(html).toContain('<link rel="icon" sizes="any" href="/favicon.ico" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    expect(html).toContain('<div id="app">');
    expect(html).toContain("data-astryx-public-site-provider");
    expect(html).toContain('role="main"');
    expect(html).toContain("@layer reset, astryx-base, astryx-theme, product;");
    expect(html).toContain('<link rel="stylesheet" href="/virtual:stylex.css" />');
    expect(html).toContain('<script type="module" src="/@id/virtual:stylex:runtime"></script>');
    expect(html).toContain('data-site-theme="light"');
    expect(html).toContain('<script id="formless-public-site-theme">');
    expect(html).toContain('const storageKey = "formless:public-site:theme";');
    expect(html).toContain("(prefers-color-scheme: dark)");
    expect(html).toContain("root.dataset.theme = theme;");
    expect(html).toContain("<title>Example Site</title>");
    expect(html).toContain('<meta name="description" content="A public test site." />');
    expect(html).toContain('<meta property="og:title" content="Example Site" />');
    expect(html).toContain('<meta property="og:description" content="A public test site." />');
    expect(html).toContain('<meta property="og:type" content="website" />');
    expect(html).toContain('<meta property="og:site_name" content="Example Site" />');
    expect(html).toContain('<meta name="twitter:card" content="summary" />');
    expect(html).not.toContain("og:image");
    expect(html).toContain("Home");
    expect(html).toContain("data-astryx-public-site-provider");
    expect(html).toContain('role="navigation"');
    expect(html).toContain("data-site-footer-group");
    expect(html).toContain(
      `<meta name="${FORMLESS_RUNTIME_PROFILE_META_NAME}" content="publishedSite" />`,
    );
    expect(html).toContain(
      `<script id="${INITIAL_SITE_PAGE_TREE_SCRIPT_ID}" type="application/json">`,
    );
    expect(payload.kind).toBe("formless.sitePageTree");
    expect(payload.version).toBe(1);
    expect(payload.tree.meta.slug).toBe("home");
    expect(html).toContain('import RefreshRuntime from "/@react-refresh";');
    expect(html).toContain("window.__vite_plugin_react_preamble_installed__ = true;");
    expect(html).toContain('<script type="module" src="/src/public-site-main.tsx"></script>');
    expect(html).not.toContain("Loading site page...");
  });

  it("reads published Site documents from the configured installed target", async () => {
    const authorityRequests: string[] = [];
    const response = await handlePublicSiteDocumentRequest(
      new Request("https://example.com/", {
        headers: { Accept: "text/html" },
      }),
      envWithTreeResponse(Response.json(testSitePageTree("home")), undefined, "publishedSite", {
        authorityRequests,
        installId: "personal",
        packageAppKey: "site",
      }),
    );

    if (!response) {
      throw new Error("Expected a published Site document response.");
    }

    expect(response.status).toBe(200);
    expect(authorityRequests).toEqual(["/api/app-installs/site/personal/tree/home"]);
  });

  it("returns HEAD headers for public documents without a response body", async () => {
    const getResponse = await getDocument("/");
    const headResponse = await headDocument("/");

    expect(headResponse.status).toBe(getResponse.status);
    expect(headResponse.headers.get("Cache-Control")).toBe(
      getResponse.headers.get("Cache-Control"),
    );
    expect(headResponse.headers.get("Content-Type")).toBe(getResponse.headers.get("Content-Type"));
    expect(headResponse.headers.get("Vary")).toBe(getResponse.headers.get("Vary"));
    expect(await headResponse.text()).toBe("");
  });

  it("loads development StyleX CSS for public documents without hydration", async () => {
    const response = await handlePublicSiteDocumentRequest(
      new Request("https://example.com/static", {
        headers: { Accept: "text/html" },
      }),
      envWithTreeResponse(
        Response.json(
          testSitePageTree("static", {
            frame: {},
            label: "Static page",
          }),
        ),
      ),
    );

    if (!response) {
      throw new Error("Expected a published Site document response.");
    }

    const html = await response.text();

    expect(html).toContain("@layer reset, astryx-base, astryx-theme, product;");
    expect(html).toContain('<link rel="stylesheet" href="/virtual:stylex.css" />');
    expect(html).not.toContain("virtual:stylex:runtime");
    expect(html).not.toContain("/src/public-site-main.tsx");
  });

  it("injects production client assets from the public Site manifest", async () => {
    const assetRequests: string[] = [];
    const response = await handlePublicSiteDocumentRequest(
      new Request("https://example.com/projects", {
        headers: { Accept: "text/html" },
      }),
      envWithTreeResponse(Response.json(testSitePageTree("projects")), builtClientManifestJson(), {
        assetRequests,
      }),
    );

    if (!response) {
      throw new Error("Expected a published Site document response.");
    }

    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Projects");
    expect(html).toContain("<title>Projects | Example Site</title>");
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
    expect(html).toContain('<link rel="icon" sizes="any" href="/favicon.ico" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    expect(html).toContain(
      '<link rel="modulepreload" crossorigin href="/assets/public-site-vendor-test.js">',
    );
    expect(html).toContain(
      '<link rel="stylesheet" crossorigin href="/assets/public-site-vendor-test.css">',
    );
    expect(html).toContain(
      '<link rel="stylesheet" crossorigin href="/assets/public-site-test.css">',
    );
    expect(html).toContain("@layer reset, astryx-base, astryx-theme, product;");
    expect(html).toContain(
      '<script type="module" crossorigin src="/assets/public-site-test.js"></script>',
    );
    expect(html.indexOf('<script id="formless-public-site-theme">')).toBeLessThan(
      html.indexOf('<link rel="stylesheet" crossorigin href="/assets/public-site-test.css">'),
    );
    expect(assetRequests).toEqual(["/assets/formless-client-manifest.json"]);
    expect(html).not.toContain("/@react-refresh");
    expect(html).not.toContain("/src/main.tsx");
    expect(html).not.toContain("/assets/index-test.js");
    expect(html).not.toContain("/assets/index-test.css");
    expect(html).not.toContain("/assets/generated-admin-test.js");
    expect(html).not.toContain("/assets/generated-admin-test.css");
    expect(html).not.toContain("/favicon-32x32.png");
  });

  it("omits production public Site scripts when the document has no hydratable behavior", async () => {
    const response = await handlePublicSiteDocumentRequest(
      new Request("https://example.com/static", {
        headers: { Accept: "text/html" },
      }),
      envWithTreeResponse(
        Response.json(
          testSitePageTree("static", {
            frame: {},
            label: "Static page",
          }),
        ),
        builtClientManifestJson(),
      ),
    );

    if (!response) {
      throw new Error("Expected a published Site document response.");
    }

    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Static page");
    expect(html).toContain(
      '<link rel="stylesheet" crossorigin href="/assets/public-site-test.css">',
    );
    expect(html).not.toContain(
      '<script type="module" crossorigin src="/assets/public-site-test.js"></script>',
    );
    expect(html).not.toContain(
      '<link rel="modulepreload" crossorigin href="/assets/public-site-vendor-test.js">',
    );
    expect(html).not.toContain("/src/public-site-main.tsx");
  });

  it("emits runtime target hints for mapped installed public Site documents", async () => {
    const target = installedAppStorageIdentity({
      installId: "personal",
      packageAppKey: "site",
    });

    if (!target) {
      throw new Error("Missing installed Site target.");
    }

    const response = await handlePublicSiteDocumentRequest(
      new Request("https://example.com/projects", {
        headers: { Accept: "text/html" },
      }),
      envWithTreeResponse(Response.json(testSitePageTree("projects"))),
      {
        mappedSiteHost: {
          host: "example.com",
          installId: "personal",
          target,
        },
      },
    );

    if (!response) {
      throw new Error("Expected a mapped public Site document response.");
    }

    const html = await response.text();

    expect(html).toContain('data-site-theme="light"');
    expect(html).toContain(
      `<meta name="${FORMLESS_RUNTIME_PROFILE_META_NAME}" content="publishedSite" />`,
    );
    expect(html).toContain(
      `<meta name="${FORMLESS_RUNTIME_APP_INSTALL_ID_META_NAME}" content="personal" />`,
    );
    expect(html).toContain(
      `<meta name="${FORMLESS_RUNTIME_PACKAGE_APP_KEY_META_NAME}" content="site" />`,
    );
  });

  it("returns server-rendered HTML for nested published Site slugs", async () => {
    const response = await getDocument("/blog/shipping-schema-backed-authoring");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Shipping schema-backed authoring");
    expect(html).toContain("<title>Shipping schema-backed authoring | Example Site</title>");
    expect(html).toContain('<meta property="og:type" content="article" />');
    expect(html).toContain("data-astryx-public-site-provider");
    expect(html).toContain('role="main"');
    expect(html).toContain('href="/blog"');
    expect(html).not.toContain('href="/pages/blog"');
    expect(html).not.toContain("Loading site page...");
  });

  it("renders escaped clean metadata from public tree facts", async () => {
    const response = await handlePublicSiteDocumentRequest(
      new Request("https://example.com/projects?preview=1", {
        headers: { Accept: "text/html" },
      }),
      envWithTreeResponse(
        Response.json(
          testSitePageTree("projects", {
            body: "# Launch **clean** [public routes](https://example.com)\n\nwith    spacing",
            label: "Projects & plans",
            siteName: "Example & <Site>",
          }),
        ),
      ),
    );

    if (!response) {
      throw new Error("Expected a published Site document response.");
    }

    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("<title>Projects &amp; plans | Example &amp; &lt;Site&gt;</title>");
    expect(html).toContain(
      '<meta name="description" content="Launch clean public routes with spacing" />',
    );
    expect(html).toContain('<link rel="canonical" href="https://example.com/projects" />');
    expect(html).toContain(
      '<meta property="og:title" content="Projects &amp; plans | Example &amp; &lt;Site&gt;" />',
    );
    expect(html).toContain('<meta property="og:site_name" content="Example &amp; &lt;Site&gt;" />');
    expect(html).toContain('<meta property="og:url" content="https://example.com/projects" />');
    expect(html).toContain('<meta property="og:type" content="website" />');
    expect(html).toContain('<meta name="twitter:card" content="summary" />');
    expect(html).not.toContain("og:image");
  });

  it("returns an explicitly cached not-found document for missing published Site slugs", async () => {
    const response = await getDocument("/missing-page");
    const html = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe(PUBLISHED_SITE_NOT_FOUND_CACHE_CONTROL);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("Vary")).toBe("Accept");
    expect(html).toContain("<title>Page not found | Site</title>");
    expect(html).toContain("Page not found");
    expect(html).toContain("No site page exists for");
    expect(html).toContain("No site page exists for missing-page.");
    expect(html).toContain('data-site-system-state="not-found"');
    expect(html).not.toContain(INITIAL_SITE_PAGE_TREE_SCRIPT_ID);
  });

  it("returns HEAD not-found document headers without a response body", async () => {
    const response = await headDocument("/missing-page");

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe(PUBLISHED_SITE_NOT_FOUND_CACHE_CONTROL);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("Vary")).toBe("Accept");
    expect(await response.text()).toBe("");
  });

  it("returns a no-store error document when the public tree read fails", async () => {
    const response = await handlePublicSiteDocumentRequest(
      new Request("https://example.com/broken-page", {
        headers: { Accept: "text/html" },
      }),
      envWithTreeResponse(Response.json({ error: "Upstream failed." }, { status: 503 })),
    );

    if (!response) {
      throw new Error("Expected a published Site document response.");
    }

    const html = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe(PUBLISHED_SITE_ERROR_CACHE_CONTROL);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("Vary")).toBe("Accept");
    expect(html).toContain("<title>Site page failed to load | Site</title>");
    expect(html).toContain('<link rel="canonical" href="https://example.com/broken-page" />');
    expect(html).toContain("Site page failed to load");
    expect(html).toContain("broken-page");
    expect(html).toContain("Site page failed to render.");
    expect(html).not.toContain("Upstream failed.");
    expect(html).not.toContain(INITIAL_SITE_PAGE_TREE_SCRIPT_ID);
  });

  it("uses the current public tree from the Site authority", async () => {
    await postAdminRecordOperation({
      idempotencyKey: "write-site-ssr-extra-page",
      entity: "block",
      operationName: "create",
      input: {
        type: "page",
        label: "Server rendered extra page",
        href: "/extra-page",
      },
    });

    const response = await getDocument("/extra-page");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Server rendered extra page");
    expect(html).not.toContain("Loading site page...");
  });

  it("escapes embedded initial tree data for hostile Site content", async () => {
    const hostileLabel = 'Hostile </script><script type="module">alert(1)</script> & text';

    await postAdminRecordOperation({
      idempotencyKey: "write-site-ssr-hostile-home-label",
      entity: "block",
      operationName: "update",
      recordId: "rec_site_content_home",
      input: {
        label: hostileLabel,
      },
    });

    const response = await getDocument("/");
    const html = await response.text();
    const scriptText = initialTreeScriptText(html);

    expect(response.status).toBe(200);
    expect(scriptText).not.toContain("</script");
    expect(scriptText).not.toContain("<script");
    expect(scriptText).toContain("\\u003C/script\\u003E\\u003Cscript");
    expect(scriptText).toContain("\\u0026 text");
    expect(initialTreePayload(html).tree.page.label).toBe(hostileLabel);
  });

  it("keeps API requests dispatched as API responses instead of Site documents", async () => {
    const response = await harness.fetch("/api/site/tree/home", {
      headers: {
        Accept: "text/html",
      },
    });
    const body = (await response.json()) as {
      meta: {
        slug: string;
      };
    };
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(body.meta.slug).toBe("home");
  });

  it("redirects old preview routes before public document rendering", async () => {
    const responses = await Promise.all([
      getDocumentWithoutFollowingRedirect("/pages/home"),
      getDocumentWithoutFollowingRedirect("/pages/projects"),
      getDocumentWithoutFollowingRedirect("/pages/blog/agents-are-enablers?ref=preview"),
    ]);

    expect(responses.map((response) => response.status)).toEqual([308, 308, 308]);
    expect(responses.map((response) => response.headers.get("Location"))).toEqual([
      "/",
      "/projects",
      "/blog/agents-are-enablers?ref=preview",
    ]);
  });

  it("returns HEAD redirects without a response body", async () => {
    const response = await headDocumentWithoutFollowingRedirect("/pages/home");

    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe("/");
    expect(await response.text()).toBe("");
  });

  it("returns 404 responses for generated admin routes in the published profile", async () => {
    const responses = await Promise.all([
      getDocument("/site"),
      getDocument("/tasks"),
      getDocument("/crm/audiences"),
      getDocument("/schema"),
    ]);
    const bodies = await Promise.all(responses.map((response) => response.text()));

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404]);
    expect(bodies.join("\n")).not.toContain("data-site-header");
    expect(bodies.join("\n")).not.toContain("Loading site page...");
  });

  it("returns empty HEAD responses for generated admin routes in the published profile", async () => {
    const response = await headDocument("/site");

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });

  it("keeps API and asset-like routes outside the SSR document path", async () => {
    const responses = await Promise.all([
      getDocument("/assets/index.js"),
      getDocument("/favicon.svg"),
      getDocument("/favicon.ico"),
      getDocument("/apple-touch-icon.png"),
    ]);
    const bodies = await Promise.all(responses.map((response) => response.text()));

    expect(responses.map((response) => response.status)).toEqual([404, 200, 200, 200]);
    expect(responses.map((response) => response.headers.get("Content-Type"))).toEqual([
      null,
      "image/svg+xml; charset=utf-8",
      "image/x-icon",
      "image/png",
    ]);
    expect(bodies.join("\n")).not.toContain("data-site-header");
    expect(bodies.join("\n")).not.toContain("Loading site page...");
  });
});

async function resetSchemaApp(schemaKey: SchemaKey) {
  await restoreTestStorageSnapshot(
    harness,
    `/api/${schemaKey}/snapshot/restore`,
    schemaAppTestStorageSnapshot(schemaKey),
    adminHeaders(),
  );
}

async function resetInstalledApp(packageAppKey: string, installId: string) {
  await restoreTestStorageSnapshot(
    harness,
    `/api/app-installs/${packageAppKey}/${installId}/snapshot/restore`,
    schemaAppTestStorageSnapshot(packageAppKey as SchemaKey, `app:${installId}`),
    adminHeaders(),
  );
}

async function getDocument(path: string) {
  return harness.fetch(path, {
    headers: {
      Accept: "text/html",
    },
  });
}

async function getDocumentWithoutFollowingRedirect(path: string) {
  return harness.fetch(path, {
    headers: {
      Accept: "text/html",
    },
    redirect: "manual",
  });
}

async function headDocument(path: string) {
  return harness.fetch(path, {
    headers: {
      Accept: "text/html",
    },
    method: "HEAD",
  });
}

async function headDocumentWithoutFollowingRedirect(path: string) {
  return harness.fetch(path, {
    headers: {
      Accept: "text/html",
    },
    method: "HEAD",
    redirect: "manual",
  });
}

async function postAdminRecordOperation(body: Parameters<typeof recordOperationRequest>[0]) {
  const request = recordOperationRequest(body);
  const response = await harness.fetch(
    `/api/app-installs/${publishedPackageAppKey}/${publishedInstallId}${request.path.slice("/api".length)}`,
    {
      body: JSON.stringify(request.body),
      headers: adminHeaders(),
      method: "POST",
    },
  );

  expect(response.status).toBe(200);

  return response;
}

function adminHeaders() {
  return {
    Authorization: `Bearer ${adminToken}`,
    "Content-Type": "application/json",
  };
}

function initialTreePayload(html: string) {
  return JSON.parse(initialTreeScriptText(html)) as {
    kind: string;
    version: number;
    tree: {
      meta: {
        slug: string;
      };
      page: {
        label: string;
      };
    };
  };
}

function initialTreeScriptText(html: string): string {
  const startMarker = `<script id="${INITIAL_SITE_PAGE_TREE_SCRIPT_ID}" type="application/json">`;
  const start = html.indexOf(startMarker);

  expect(start).toBeGreaterThan(-1);

  const contentStart = start + startMarker.length;
  const end = html.indexOf("</script>", contentStart);

  expect(end).toBeGreaterThan(contentStart);

  return html.slice(contentStart, end);
}

function envWithTreeResponse(
  response: Response,
  clientAssetManifest?: string,
  runtimeProfileOrOptions:
    | string
    | {
        assetRequests?: string[];
        runtimeProfile?: string;
      } = "publishedSite",
  options: {
    authorityRequests?: string[];
    installId?: string;
    packageAppKey?: string;
  } = {},
): Env {
  const runtimeProfile =
    typeof runtimeProfileOrOptions === "string"
      ? runtimeProfileOrOptions
      : (runtimeProfileOrOptions.runtimeProfile ?? "publishedSite");
  const assetRequests =
    typeof runtimeProfileOrOptions === "string" ? undefined : runtimeProfileOrOptions.assetRequests;
  const installId = options.installId ?? publishedInstallId;
  const packageAppKey = options.packageAppKey ?? publishedPackageAppKey;

  return {
    ASSETS: clientAssetManifest
      ? {
          fetch: async (assetRequest: Request) => {
            assetRequests?.push(new URL(assetRequest.url).pathname);

            return new Response(clientAssetManifest, {
              headers: { "Content-Type": "application/json; charset=utf-8" },
            });
          },
        }
      : undefined,
    FORMLESS_AUTHORITY: {
      get: () => ({
        fetch: async (request: Request) => {
          options.authorityRequests?.push(new URL(request.url).pathname);

          return response;
        },
      }),
      idFromName: () => "site-id",
    },
    FORMLESS_RUNTIME_PROFILE: runtimeProfile,
    ...(runtimeProfile === "publishedSite"
      ? {
          FORMLESS_RUNTIME_APP_INSTALL_ID: installId,
          FORMLESS_RUNTIME_PACKAGE_APP_KEY: packageAppKey,
        }
      : {}),
  } as unknown as Env;
}

function builtClientManifestJson(): string {
  return JSON.stringify({
    "assets/public-site-vendor-test.js": {
      css: ["assets/public-site-vendor-test.css"],
      file: "assets/public-site-vendor-test.js",
    },
    "assets/generated-admin-test.js": {
      css: ["assets/generated-admin-test.css"],
      file: "assets/generated-admin-test.js",
    },
    "src/main.tsx": {
      css: ["assets/index-test.css"],
      file: "assets/index-test.js",
      imports: ["assets/generated-admin-test.js"],
      isEntry: true,
      src: "src/main.tsx",
    },
    "src/public-site-main.tsx": {
      css: ["assets/public-site-test.css"],
      file: "assets/public-site-test.js",
      imports: ["assets/public-site-vendor-test.js"],
      isEntry: true,
      src: "src/public-site-main.tsx",
    },
  });
}

function testSitePageTree(
  slug: string,
  options: {
    body?: string;
    frame?: SitePageTreeResponse["frame"];
    label?: string;
    routeKind?: "page" | "post";
    siteName?: string;
  } = {},
): SitePageTreeResponse {
  return {
    site: {
      id: "rec_site_settings_primary",
      label: options.siteName ?? "Example Site",
    },
    page: {
      id: `rec_site_page_${slug}`,
      type: "page",
      label: options.label ?? "Projects",
      ...(options.body ? { body: options.body } : {}),
      placements: [],
    },
    frame: options.frame ?? siteFrame(options.siteName ?? "Example Site"),
    meta: {
      slug,
      generatedAt: "2026-05-13T00:00:00.000Z",
      warnings: [],
    },
    route: {
      kind: options.routeKind ?? "page",
      slug,
    },
  };
}

function siteFrame(siteName: string): SitePageTreeResponse["frame"] {
  return {
    header: {
      id: "rec_site_content_group_header",
      type: "header",
      label: "Header",
      placements: [
        {
          id: "rec_site_place_header_primary",
          order: 1000,
          block: {
            id: "rec_site_content_group_header_primary",
            type: "headerPrimary",
            label: "Primary",
            placements: [
              {
                id: "rec_site_place_header_home",
                order: 1000,
                block: {
                  id: "rec_site_content_link_home",
                  type: "link",
                  label: siteName,
                  href: "/",
                  placements: [],
                },
              },
            ],
          },
        },
      ],
    },
  };
}
