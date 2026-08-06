import {
  buildPublicSitemapXml,
  buildPublicSiteRouteEntries,
  renderPublicRobotsTxt,
} from "../public-indexing.ts";
import type { StoredRecord } from "../types.ts";
import { selectSoleActiveSite } from "../site-selection.ts";
import {
  PUBLIC_SITE_INDEXING_CACHE_CONTROL,
  PUBLIC_SITE_INDEXING_ERROR_CACHE_CONTROL,
} from "./site-cache.ts";

export type PublicSiteIndexingResource = "robots" | "sitemap";

export type PublicSiteIndexingRenderInput =
  | {
      origin: string;
      records?: StoredRecord[];
      resource: "robots";
    }
  | {
      clientRoutePrefixes: readonly `/${string}`[];
      origin: string;
      records?: StoredRecord[];
      resource: "sitemap";
    };

export function renderPublishedSiteIndexingResponse(
  input: PublicSiteIndexingRenderInput,
): Response {
  if (!input.records) {
    return textResponse("Site unavailable.\n", "text/plain; charset=utf-8", 503, {
      "Cache-Control": PUBLIC_SITE_INDEXING_ERROR_CACHE_CONTROL,
    });
  }

  if (selectSoleActiveSite(input.records).kind === "unavailable") {
    return textResponse("Site unavailable.\n", "text/plain; charset=utf-8", 503, {
      "Cache-Control": PUBLIC_SITE_INDEXING_ERROR_CACHE_CONTROL,
    });
  }

  if (input.resource === "robots") {
    return textResponse(renderPublicRobotsTxt(input.origin), "text/plain; charset=utf-8");
  }

  const routes = buildPublicSiteRouteEntries(input.records, {
    clientRoutePrefixes: input.clientRoutePrefixes,
  });

  return textResponse(
    buildPublicSitemapXml(routes, input.origin),
    "application/xml; charset=utf-8",
  );
}

function textResponse(
  body: string,
  contentType: string,
  status = 200,
  headers: HeadersInit = {},
): Response {
  const responseHeaders = new Headers(headers);

  if (!responseHeaders.has("Cache-Control")) {
    responseHeaders.set("Cache-Control", PUBLIC_SITE_INDEXING_CACHE_CONTROL);
  }

  responseHeaders.set("Content-Type", contentType);

  return new Response(body, {
    headers: responseHeaders,
    status,
  });
}
