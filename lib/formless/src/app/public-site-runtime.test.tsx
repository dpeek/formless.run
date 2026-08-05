import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import type {
  SitePublicRendererProps,
  SitePublicSystemStateRendererProps,
} from "@dpeek/formless-site-app/public/react";
import { applyBootstrapResponse, applyRecordMerge, resetClientStore } from "../client/store.ts";
import { formlessProgramDefaultBrowserRuntime } from "../program/default/browser.ts";
import { formlessProgramSchema } from "../program/runtime.ts";
import { bootstrapResponse } from "../test/protocol-builders.ts";
import { testSiteRecords } from "../test/site-records.ts";
import { CoreSitePageRoute } from "./public-site-runtime.tsx";

beforeEach(() => {
  resetClientStore();
});

describe("Program replica Site preview", () => {
  it("projects the selected mount slug from live Program replica records", () => {
    applyBootstrapResponse(bootstrapResponse(formlessProgramSchema, testSiteRecords));

    const initial = renderPreview("blog");
    const blog = testSiteRecords.find((record) => record.id === "rec_site_content_blog");

    if (!blog) {
      throw new Error("Expected the Site test records to include the Blog page.");
    }

    applyRecordMerge([
      {
        ...blog,
        updatedAt: "2026-08-05T00:00:00.000Z",
        values: { ...blog.values, label: "Notes" },
      },
    ]);

    const updated = renderPreview("blog");

    expect(initial).toContain('data-page-label="Blog"');
    expect(initial).toContain('data-route-base="/site/preview"');
    expect(updated).toContain('data-page-label="Notes"');
  });
});

function renderPreview(slug: string): string {
  return renderToStaticMarkup(
    <CoreSitePageRoute
      browserRuntime={formlessProgramDefaultBrowserRuntime}
      builtInRenderer={PageRendererProbe}
      builtInSystemStateRenderer={SystemStateRendererProbe}
      linkMode="preview"
      programReplica
      routeBase="/site/preview"
      slug={slug}
      surfaceMountKey="site.preview.browser"
      workspaceRenderer={PageRendererProbe}
    />,
  );
}

function PageRendererProbe({ routeBase, tree }: SitePublicRendererProps) {
  return <output data-page-label={tree.page.label} data-route-base={routeBase} />;
}

function SystemStateRendererProbe({ kind, slug }: SitePublicSystemStateRendererProps) {
  return <output data-kind={kind} data-slug={slug} />;
}
