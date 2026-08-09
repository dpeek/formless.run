import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.edge";

import { PublicSiteDocumentShell } from "../react/document-shell.tsx";
import { renderInitialSitePageTreeScript } from "../react/initial-tree.ts";
import { normalizeSitePageSlug } from "../react/slug.ts";
import {
  publicSiteThemeDocumentMarker,
  publicSiteThemeSsrMode,
  renderPublicSiteThemeBootScript,
} from "../public-theme.ts";
import { PublicSiteThemeProvider } from "../react/theme.ts";
import {
  buildPublicDocumentMetadata,
  type PublicDocumentMetadata,
} from "../public-document-metadata.ts";
import {
  resolveSitePublicRendererComponent,
  type SitePublicRendererComponent,
  type SitePublicRendererDocumentTheme,
} from "../public-renderer.ts";
import { sitePagePathForSlug } from "../public-links.ts";
import type { SitePublicSystemStateRendererComponent } from "../public-system-state.ts";
import type { SitePageTree, SitePageTreeResponse } from "../types.ts";
import {
  publishedSiteDocumentCacheControl,
  type PublishedSiteDocumentCacheKind,
} from "./site-cache.ts";

export type PublicSiteDocumentClientAssets = {
  body: string;
  head: string;
};

export type PublicSiteDocumentRuntimeHint = {
  content: string;
  name: string;
};

export type PublicSiteDocumentTreeResult =
  | {
      kind: "found";
      tree: SitePageTreeResponse;
    }
  | {
      kind: "not-found";
    }
  | {
      kind: "error";
    };

export type PublicSiteDocumentRenderInput = {
  builtInRenderer: SitePublicRendererComponent;
  builtInSystemStateRenderer: SitePublicSystemStateRendererComponent;
  clientAssets: PublicSiteDocumentClientAssets;
  documentKind?: "preview" | "published";
  rendererDocumentTheme: SitePublicRendererDocumentTheme;
  requestUrl: URL;
  routeBase?: `/${string}`;
  runtimeHints?: readonly PublicSiteDocumentRuntimeHint[];
  slug?: string;
  treeResult: PublicSiteDocumentTreeResult;
  workspaceRenderer?: SitePublicRendererComponent;
};

export type PublicSiteDocumentRenderResponse = Response;

export async function renderPublishedSiteDocumentResponse(
  input: PublicSiteDocumentRenderInput,
): Promise<PublicSiteDocumentRenderResponse> {
  const slug = input.slug ?? publishedSiteSlugFromUrl(input.requestUrl);
  const requestUrl = input.requestUrl;
  const documentKind = input.documentKind ?? "published";

  try {
    if (input.treeResult.kind === "not-found") {
      return htmlResponse(await renderNotFoundDocument(slug, requestUrl, input), {
        cacheKind: "not-found",
        documentKind,
        status: 404,
      });
    }

    if (input.treeResult.kind === "error") {
      return htmlResponse(await renderErrorDocument(slug, requestUrl, input), {
        cacheKind: "error",
        documentKind,
        status: 500,
      });
    }

    const tree = input.treeResult.tree;
    const Renderer = resolveSitePublicRendererComponent({
      builtInRenderer: input.builtInRenderer,
      workspaceRenderer: input.workspaceRenderer,
    });
    const appHtml = await renderReactToString(
      <PublicSiteDocumentShell>
        <PublicSiteThemeProvider site={tree.site}>
          <Renderer
            linkMode={documentKind === "preview" ? "preview" : "published"}
            routeBase={input.routeBase}
            tree={tree}
          />
        </PublicSiteThemeProvider>
      </PublicSiteDocumentShell>,
    );

    return htmlResponse(
      renderDocument(appHtml, {
        clientAssets: input.clientAssets,
        documentKind,
        initialTree: tree,
        metadata: buildPublicDocumentMetadata({
          kind: "success",
          requestUrl,
          slug,
          tree,
        }),
        runtimeHints: input.runtimeHints,
        rendererDocumentTheme: input.rendererDocumentTheme,
        site: tree.site,
      }),
      {
        documentKind,
      },
    );
  } catch {
    return htmlResponse(await renderErrorDocument(slug, requestUrl, input), {
      cacheKind: "error",
      documentKind,
      status: 500,
    });
  }
}

async function renderNotFoundDocument(
  slug: string,
  requestUrl: URL,
  input: PublicSiteDocumentRenderInput,
): Promise<string> {
  const SystemStateRenderer = input.builtInSystemStateRenderer;

  return renderDocument(
    await renderReactToString(
      <PublicSiteDocumentShell>
        <SystemStateRenderer
          homeHref={sitePagePathForSlug("home", "published", input.routeBase)}
          kind="not-found"
          slug={slug}
        />
      </PublicSiteDocumentShell>,
    ),
    {
      clientAssets: input.clientAssets,
      documentKind: input.documentKind ?? "published",
      metadata: buildPublicDocumentMetadata({
        kind: "not-found",
        requestUrl,
        slug,
      }),
      runtimeHints: input.runtimeHints,
      rendererDocumentTheme: input.rendererDocumentTheme,
    },
  );
}

async function renderErrorDocument(
  slug: string,
  requestUrl: URL,
  input: PublicSiteDocumentRenderInput,
): Promise<string> {
  const SystemStateRenderer = input.builtInSystemStateRenderer;

  return renderDocument(
    await renderReactToString(
      <PublicSiteDocumentShell>
        <SystemStateRenderer kind="failure" message="Site page failed to render." slug={slug} />
      </PublicSiteDocumentShell>,
    ),
    {
      clientAssets: input.clientAssets,
      documentKind: input.documentKind ?? "published",
      metadata: buildPublicDocumentMetadata({
        kind: "error",
        requestUrl,
        slug,
      }),
      runtimeHints: input.runtimeHints,
      rendererDocumentTheme: input.rendererDocumentTheme,
    },
  );
}

async function renderReactToString(node: ReactNode): Promise<string> {
  const stream = await renderToReadableStream(node);

  await stream.allReady;

  return new Response(stream).text();
}

function renderDocument(
  appHtml: string,
  options: {
    clientAssets: PublicSiteDocumentClientAssets;
    documentKind: "preview" | "published";
    initialTree?: SitePageTree;
    metadata: PublicDocumentMetadata;
    rendererDocumentTheme: SitePublicRendererDocumentTheme;
    runtimeHints?: readonly PublicSiteDocumentRuntimeHint[];
    site?: SitePageTree["site"];
  },
): string {
  const themeMarker = publicSiteThemeDocumentMarker(publicSiteThemeSsrMode(options.site));
  const initialTreeScript = options.initialTree
    ? `\n    ${renderInitialSitePageTreeScript(options.initialTree)}`
    : "";
  const clientAssetHeadTags = options.clientAssets.head ? `\n    ${options.clientAssets.head}` : "";
  const clientAssetBodyTags = options.clientAssets.body ? `\n    ${options.clientAssets.body}` : "";
  const metadataTags = renderMetadataTags(options.metadata, options.documentKind);
  const iconTags =
    options.documentKind === "published"
      ? `\n    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />\n    <link rel="icon" sizes="any" href="/favicon.ico" />\n    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />`
      : "";

  return `<!doctype html>
<html lang="en" ${options.rendererDocumentTheme.attribute}="${escapeHtmlAttribute(options.rendererDocumentTheme.value)}" ${themeMarker.rendererModeAttribute}="${themeMarker.rendererModeValue}" ${themeMarker.dataAttribute}="${themeMarker.dataValue}" style="${themeMarker.style}">
  <head>
	    <meta charset="UTF-8" />${iconTags}
	    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
	    <meta name="color-scheme" content="${themeMarker.colorScheme}" />
	    ${renderRuntimeHints(options.runtimeHints)}
	    ${metadataTags}
	    ${renderPublicSiteThemeBootScript(options.site)}${clientAssetHeadTags}
  </head>
  <body>
    <div id="app">${appHtml}</div>${initialTreeScript}${clientAssetBodyTags}
  </body>
</html>`;
}

function renderRuntimeHints(hints: readonly PublicSiteDocumentRuntimeHint[] | undefined): string {
  if (!hints?.length) {
    return "";
  }

  return hints
    .map(
      (hint) =>
        `<meta name="${escapeHtmlAttribute(hint.name)}" content="${escapeHtmlAttribute(hint.content)}" />`,
    )
    .join("\n    ");
}

function renderMetadataTags(
  metadata: PublicDocumentMetadata,
  documentKind: "preview" | "published",
): string {
  const title = escapeHtmlText(metadata.title);
  const description = escapeHtmlAttribute(metadata.description);
  const canonicalUrl = escapeHtmlAttribute(metadata.canonicalUrl);
  const siteName = escapeHtmlAttribute(metadata.siteName);

  const canonicalTag =
    documentKind === "published" ? `\n    <link rel="canonical" href="${canonicalUrl}" />` : "";
  const openGraphUrlTag =
    documentKind === "published"
      ? `\n    <meta property="og:url" content="${canonicalUrl}" />`
      : "";

  return `<title>${title}</title>
    <meta name="description" content="${description}" />${canonicalTag}
    <meta property="og:title" content="${escapeHtmlAttribute(metadata.title)}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:type" content="${escapeHtmlAttribute(metadata.ogType)}" />${openGraphUrlTag}
    <meta property="og:site_name" content="${siteName}" />
    <meta name="twitter:card" content="${escapeHtmlAttribute(metadata.twitterCard)}" />`;
}

function escapeHtmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replaceAll('"', "&quot;");
}

function htmlResponse(
  html: string,
  options: {
    cacheKind?: PublishedSiteDocumentCacheKind;
    documentKind?: "preview" | "published";
    status?: number;
  } = {},
): Response {
  const preview = options.documentKind === "preview";

  return new Response(html, {
    headers: {
      "Cache-Control": preview
        ? "private, no-store"
        : publishedSiteDocumentCacheControl(options.cacheKind ?? "success"),
      "Content-Type": "text/html; charset=utf-8",
      Vary: preview ? "Accept, Cookie" : "Accept",
      ...(preview ? { "X-Robots-Tag": "noindex, nofollow, noarchive" } : {}),
    },
    status: options.status ?? 200,
  });
}

function publishedSiteSlugFromUrl(url: URL): string {
  return normalizeSitePageSlug(url.pathname);
}
