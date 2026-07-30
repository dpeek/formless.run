import { describe, expect, it } from "vite-plus/test";

import { INITIAL_SITE_PAGE_TREE_SCRIPT_ID } from "../react/initial-tree.ts";
import type { SitePublicRendererProps } from "../public-renderer.ts";
import type { SitePublicSystemStateRendererProps } from "../public-system-state.ts";
import type { SiteBlockNode, SitePageTree } from "../types.ts";
import {
  PUBLISHED_SITE_HTML_CACHE_CONTROL,
  PUBLISHED_SITE_NOT_FOUND_CACHE_CONTROL,
} from "./site-cache.ts";
import { renderPublishedSiteDocumentResponse } from "./site-ssr.tsx";

const rendererDocumentTheme = {
  attribute: "data-test-renderer-theme",
  value: "test-renderer",
} as const;

describe("published Site document rendering", () => {
  it("selects a workspace page renderer ahead of the required built-in renderer", async () => {
    const BuiltInRenderer = () => <article data-built-in-public-site-renderer="unused" />;
    const CustomRenderer = ({ linkMode, routeBase, tree }: SitePublicRendererProps) => (
      <article
        data-custom-public-site-renderer={tree.meta.slug}
        data-link-mode={linkMode}
        data-route-base={routeBase}
      >
        Custom document {tree.page.label}
      </article>
    );
    const response = await renderPublishedSiteDocumentResponse({
      builtInRenderer: BuiltInRenderer,
      builtInSystemStateRenderer: SystemStateRendererProbe,
      clientAssets: {
        body: '<script type="module" src="/assets/custom-client.js"></script>',
        head: '<link rel="stylesheet" href="/assets/custom-client.css">',
      },
      rendererDocumentTheme,
      requestUrl: new URL("https://example.com/projects"),
      routeBase: "/campaign",
      runtimeHints: [{ name: "formless-runtime-profile", content: "publishedSite" }],
      treeResult: { kind: "found", tree: sitePageTree("projects") },
      workspaceRenderer: CustomRenderer,
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(PUBLISHED_SITE_HTML_CACHE_CONTROL);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('<div id="app"><main style="min-height:100dvh"><article');
    expect(html).toContain('data-custom-public-site-renderer="projects"');
    expect(html).toContain('data-link-mode="published"');
    expect(html).toContain('data-route-base="/campaign"');
    expect(html).toContain("Custom document");
    expect(html).toContain("Projects");
    expect(html).toContain("<title>Projects | Example Site</title>");
    expect(html).toContain('<link rel="canonical" href="https://example.com/projects" />');
    expect(html).toContain('<meta name="formless-runtime-profile" content="publishedSite" />');
    expect(html).toContain(`<script id="${INITIAL_SITE_PAGE_TREE_SCRIPT_ID}"`);
    expect(html).toContain('<link rel="stylesheet" href="/assets/custom-client.css">');
    expect(html).toContain('<script type="module" src="/assets/custom-client.js"></script>');
    expect(html).not.toContain("data-site-theme-toggle");
    expect(html).not.toContain("data-built-in-public-site-renderer");
  });

  it("selects the explicitly supplied built-in page renderer without a workspace override", async () => {
    const response = await renderPublishedSiteDocumentResponse({
      builtInRenderer: PageRendererProbe,
      builtInSystemStateRenderer: SystemStateRendererProbe,
      clientAssets: { body: "", head: "" },
      rendererDocumentTheme,
      requestUrl: new URL("https://example.com/"),
      treeResult: { kind: "found", tree: sitePageTree("home") },
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(
      '<html lang="en" data-test-renderer-theme="test-renderer" data-theme="light" data-site-theme="light" style="color-scheme: light;">',
    );
    expect(html).toContain('<main style="min-height:100dvh"><article');
    expect(html).toContain('data-built-in-public-site-renderer="home"');
    expect(html).toContain('data-link-mode="published"');
    expect(html).toContain('<script id="formless-public-site-theme">');
    expect(html).toContain('const storageKey = "formless:public-site:theme";');
    expect(html).toContain("(prefers-color-scheme: dark)");
    expect(html).toContain("<title>Example Site</title>");
    expect(html).not.toContain("data-custom-public-site-renderer");
  });

  it.each([
    ["light", false, "light"],
    ["dark", false, "dark"],
    ["system", true, "light"],
  ] as const)(
    "derives the SSR document theme from %s Site settings",
    async (initialThemeMode, themeSwitchable, serverMode) => {
      const response = await renderPublishedSiteDocumentResponse({
        builtInRenderer: PageRendererProbe,
        builtInSystemStateRenderer: SystemStateRendererProbe,
        clientAssets: { body: "", head: "" },
        rendererDocumentTheme,
        requestUrl: new URL("https://example.com/"),
        treeResult: {
          kind: "found",
          tree: sitePageTree("home", { initialThemeMode, themeSwitchable }),
        },
      });
      const html = await response.text();

      expect(html).toContain(
        `<html lang="en" data-test-renderer-theme="test-renderer" data-theme="${serverMode}" data-site-theme="${serverMode}" style="color-scheme: ${serverMode};">`,
      );
      expect(html).toContain(`<meta name="color-scheme" content="${serverMode}" />`);
      expect(html).toContain(`const switchable = ${String(themeSwitchable)};`);
      expect(html).toContain(`let preference = "${initialThemeMode}";`);
    },
  );

  it("uses the built-in system-state renderer for not-found documents", async () => {
    const CustomRenderer = () => <article data-custom-public-site-renderer="should-not-render" />;
    const SystemStateRenderer = (props: SitePublicSystemStateRendererProps) => (
      <section
        data-home-href={props.kind === "not-found" ? props.homeHref : undefined}
        data-system-state={props.kind}
      >
        System state {props.slug}
      </section>
    );
    const response = await renderPublishedSiteDocumentResponse({
      builtInRenderer: PageRendererProbe,
      builtInSystemStateRenderer: SystemStateRenderer,
      clientAssets: { body: "", head: "" },
      rendererDocumentTheme,
      requestUrl: new URL("https://example.com/missing"),
      treeResult: { kind: "not-found" },
      workspaceRenderer: CustomRenderer,
    });
    const html = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe(PUBLISHED_SITE_NOT_FOUND_CACHE_CONTROL);
    expect(html).toContain('data-system-state="not-found"');
    expect(html).toContain('data-home-href="/"');
    expect(html).toContain("<title>Page not found | Site</title>");
    expect(html).not.toContain("data-custom-public-site-renderer");
    expect(html).not.toContain(INITIAL_SITE_PAGE_TREE_SCRIPT_ID);
  });

  it("uses the built-in system-state renderer for display-safe error documents", async () => {
    const SystemStateRenderer = (props: SitePublicSystemStateRendererProps) => (
      <section
        data-message={props.kind === "failure" ? props.message : undefined}
        data-system-state={props.kind}
      >
        System state {props.slug}
      </section>
    );
    const response = await renderPublishedSiteDocumentResponse({
      builtInRenderer: PageRendererProbe,
      builtInSystemStateRenderer: SystemStateRenderer,
      clientAssets: { body: "", head: "" },
      rendererDocumentTheme,
      requestUrl: new URL("https://example.com/broken"),
      treeResult: { kind: "error" },
      workspaceRenderer: () => <article data-workspace-renderer="page-only" />,
    });
    const html = await response.text();

    expect(response.status).toBe(500);
    expect(html).toContain('data-system-state="failure"');
    expect(html).toContain('data-message="Site page failed to render."');
    expect(html).not.toContain("data-workspace-renderer");
  });
});

function PageRendererProbe({ linkMode, routeBase, tree }: SitePublicRendererProps) {
  return (
    <article
      data-built-in-public-site-renderer={tree.meta.slug}
      data-link-mode={linkMode}
      data-route-base={routeBase}
    >
      Built-in document {tree.page.label}
    </article>
  );
}

function SystemStateRendererProbe(props: SitePublicSystemStateRendererProps) {
  return <section data-system-state={props.kind}>{props.slug}</section>;
}

function sitePageTree(
  slug: string,
  theme: Pick<NonNullable<SitePageTree["site"]>, "initialThemeMode" | "themeSwitchable"> = {},
): SitePageTree {
  return {
    site: {
      id: "site",
      label: "Example Site",
      description: "Example public site.",
      ...theme,
    },
    page: pageNode(slug),
    frame: {},
    meta: {
      slug,
      generatedAt: "2026-06-22T00:00:00.000Z",
      warnings: [],
    },
    route: {
      kind: "page",
      slug,
    },
  };
}

function pageNode(slug: string): SiteBlockNode {
  return {
    id: `page-${slug}`,
    type: "page",
    label: slug === "home" ? "Home" : "Projects",
    placements: [],
  };
}
