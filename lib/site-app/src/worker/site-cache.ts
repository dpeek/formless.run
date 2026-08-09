export const PUBLISHED_SITE_HTML_CACHE_CONTROL = "public, max-age=0, must-revalidate";
export const PUBLISHED_SITE_NOT_FOUND_CACHE_CONTROL = "public, max-age=0, must-revalidate";
export const PUBLISHED_SITE_ERROR_CACHE_CONTROL = "no-store";
export const PUBLIC_SITE_TREE_CACHE_CONTROL = "no-store";
export const PUBLIC_SITE_INDEXING_CACHE_CONTROL =
  "public, max-age=300, stale-while-revalidate=3600";
export const PUBLIC_SITE_INDEXING_ERROR_CACHE_CONTROL = "no-store";
export const PUBLIC_SITE_ICON_CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=86400";

export type PublishedSiteDocumentCacheKind = "success" | "not-found" | "error";

export function publishedSiteDocumentCacheControl(kind: PublishedSiteDocumentCacheKind): string {
  switch (kind) {
    case "success":
      return PUBLISHED_SITE_HTML_CACHE_CONTROL;
    case "not-found":
      return PUBLISHED_SITE_NOT_FOUND_CACHE_CONTROL;
    case "error":
      return PUBLISHED_SITE_ERROR_CACHE_CONTROL;
  }
}
