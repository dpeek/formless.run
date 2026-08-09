// @vitest-environment jsdom

import { act } from "@testing-library/react";
import { hydrateRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";

import type { SitePublicRendererProps } from "../public-renderer.ts";
import type { SitePublicSystemStateRendererProps } from "../public-system-state.ts";
import type { SiteBlockNode, SitePageTree } from "../types.ts";
import { renderPublishedSiteDocumentResponse } from "../worker/site-ssr.tsx";
import { PublicSiteDocumentShell } from "./document-shell.tsx";
import { SitePageRouteView } from "./route.tsx";

describe("public Site document shell", () => {
  it("hydrates Worker-rendered markup without a recoverable root mismatch", async () => {
    const tree = sitePageTree();
    const response = await renderPublishedSiteDocumentResponse({
      builtInRenderer: PageRendererProbe,
      builtInSystemStateRenderer: SystemStateRendererProbe,
      clientAssets: { body: "", head: "" },
      rendererDocumentTheme: {
        attribute: "data-test-renderer-theme",
        value: "test-renderer",
      },
      requestUrl: new URL("https://example.com/"),
      treeResult: { kind: "found", tree },
    });
    const serverDocument = new DOMParser().parseFromString(await response.text(), "text/html");
    const serverApp = serverDocument.getElementById("app");

    if (!serverApp) {
      throw new Error("Expected Worker-rendered app root.");
    }

    document.body.innerHTML = `<div id="app">${serverApp.innerHTML}</div>`;

    const app = document.getElementById("app");
    const recoverableErrors: unknown[] = [];
    let root: Root | undefined;

    if (!app) {
      throw new Error("Expected browser app root.");
    }

    await act(async () => {
      root = hydrateRoot(
        app,
        <PublicSiteDocumentShell>
          <SitePageRouteView
            builtInRenderer={PageRendererProbe}
            builtInSystemStateRenderer={SystemStateRendererProbe}
            linkMode="published"
            state={{ status: "ready", tree }}
          />
        </PublicSiteDocumentShell>,
        {
          onRecoverableError: (error) => recoverableErrors.push(error),
        },
      );
    });

    expect(recoverableErrors).toEqual([]);
    expect(app.firstElementChild?.tagName).toBe("MAIN");

    await act(async () => root?.unmount());
  });
});

function PageRendererProbe({ tree }: SitePublicRendererProps) {
  return <article>{tree.page.label}</article>;
}

function SystemStateRendererProbe(props: SitePublicSystemStateRendererProps) {
  return <section>{props.kind}</section>;
}

function sitePageTree(): SitePageTree {
  return {
    site: {
      id: "site",
      label: "Example Site",
    },
    page: pageNode(),
    frame: {},
    meta: {
      generatedAt: "2026-08-09T00:00:00.000Z",
      slug: "home",
      warnings: [],
    },
    route: {
      kind: "page",
      slug: "home",
    },
  };
}

function pageNode(): SiteBlockNode {
  return {
    id: "page-home",
    label: "Home",
    placements: [],
    type: "page",
  };
}
