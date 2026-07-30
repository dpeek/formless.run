import { describe, expect, it } from "vite-plus/test";

import type { SitePublicRendererProps } from "../public-renderer.ts";
import type { SitePublicSystemStateRendererProps } from "../public-system-state.ts";
import type { SiteBlockNode, SitePageTree } from "../types.ts";
import { createSitePublicWorkerAdapter } from "./adapter.ts";

const rendererDocumentTheme = {
  attribute: "data-test-renderer-theme",
  value: "test-renderer",
} as const;

describe("Site public Worker presentation assembly", () => {
  it("selects the workspace page renderer ahead of the required built-in renderer", async () => {
    const adapter = createSitePublicWorkerAdapter({
      builtInRenderer: () => <article data-built-in-renderer="unused" />,
      builtInSystemStateRenderer: SystemStateRenderer,
      rendererDocumentTheme,
      workspaceRenderer: ({ tree }: SitePublicRendererProps) => (
        <article data-workspace-renderer={tree.meta.slug} />
      ),
    });
    const response = await adapter.renderDocument({
      clientAssets: { body: "", head: "" },
      requestUrl: new URL("https://example.com/projects"),
      treeResult: { kind: "found", tree: sitePageTree("projects") },
    });
    const html = await response.text();

    expect(html).toContain('data-workspace-renderer="projects"');
    expect(html).toContain('data-test-renderer-theme="test-renderer"');
    expect(html).not.toContain("data-built-in-renderer");
  });

  it("keeps Worker not-found and error documents on the built-in system-state renderer", async () => {
    const adapter = createSitePublicWorkerAdapter({
      builtInRenderer: () => <article data-built-in-renderer="page" />,
      builtInSystemStateRenderer: SystemStateRenderer,
      rendererDocumentTheme,
      workspaceRenderer: () => <article data-workspace-renderer="page-only" />,
    });
    const notFoundResponse = await adapter.renderDocument({
      clientAssets: { body: "", head: "" },
      requestUrl: new URL("https://example.com/missing"),
      treeResult: { kind: "not-found" },
    });
    const errorResponse = await adapter.renderDocument({
      clientAssets: { body: "", head: "" },
      requestUrl: new URL("https://example.com/broken"),
      treeResult: { kind: "error" },
    });
    const notFoundHtml = await notFoundResponse.text();
    const errorHtml = await errorResponse.text();

    expect(notFoundHtml).toContain('data-system-state="not-found"');
    expect(notFoundHtml).toContain('data-home-href="/"');
    expect(errorHtml).toContain('data-system-state="failure"');
    expect(errorHtml).toContain('data-message="Site page failed to render."');
    expect(`${notFoundHtml}${errorHtml}`).not.toContain("data-workspace-renderer");
  });
});

function SystemStateRenderer(props: SitePublicSystemStateRendererProps) {
  return (
    <section
      data-home-href={props.kind === "not-found" ? props.homeHref : undefined}
      data-message={props.kind === "failure" ? props.message : undefined}
      data-system-state={props.kind}
    >
      {props.slug}
    </section>
  );
}

function sitePageTree(slug: string): SitePageTree {
  return {
    site: {
      id: "site",
      label: "Example Site",
      description: "Example public site.",
    },
    page: pageNode(slug),
    frame: {},
    meta: {
      slug,
      generatedAt: "2026-07-17T00:00:00.000Z",
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
    label: slug,
    placements: [],
  };
}
