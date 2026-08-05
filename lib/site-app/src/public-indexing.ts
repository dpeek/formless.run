import type { FieldValue, StoredRecord } from "./types.ts";
import { resolveSiteRoute } from "./route-resolver.ts";

export type PublicSiteRouteEntry = {
  kind: "page" | "post";
  path: string;
  recordId: string;
};

export type BuildPublicSiteRouteEntriesOptions = {
  clientRoutePrefixes?: readonly `/${string}`[];
};

const defaultClientRoutePrefixes = ["/schema"] as const;
const staticAssetPathPrefixes = ["/@fs/", "/@id/", "/@vite/", "/@react-refresh"] as const;

export function buildPublicSiteRouteEntries(
  records: StoredRecord[],
  options: BuildPublicSiteRouteEntriesOptions = {},
): PublicSiteRouteEntry[] {
  const clientRoutePrefixes = options.clientRoutePrefixes ?? defaultClientRoutePrefixes;
  const blocks = records.filter(isLiveBlock).sort(compareRecords);
  const entries: PublicSiteRouteEntry[] = [];

  for (const block of blocks) {
    const kind = sitemapRouteKindForBlock(block);

    if (!kind) {
      continue;
    }

    const path = canonicalPublicPathFromHref(stringValue(block.values.href));

    if (!path || !isPublicSiteDocumentPath(path, clientRoutePrefixes)) {
      continue;
    }

    const slug = slugFromPublicPath(path);
    const route = resolveSiteRoute(blocks, slug, []);

    if (!route || route.kind !== kind || routeRecord(route) !== block) {
      continue;
    }

    entries.push({
      kind,
      path,
      recordId: block.id,
    });
  }

  return dedupeAndSortPublicRoutes(entries);
}

export function renderPublicRobotsTxt(origin: string): string {
  return `User-agent: *
Allow: /

Sitemap: ${canonicalUrlForPath("/sitemap.xml", origin)}
`;
}

export function buildPublicSitemapXml(entries: PublicSiteRouteEntry[], origin: string): string {
  const urlEntries = entries
    .map(
      (entry) =>
        `  <url>\n    <loc>${escapeXmlText(canonicalUrlForPath(entry.path, origin))}</loc>\n  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>
`;
}

function sitemapRouteKindForBlock(block: StoredRecord): "page" | "post" | undefined {
  const type = stringValue(block.values.type);

  if (type === "page") {
    return "page";
  }

  if (type === "post" && stringValue(block.values.date) !== undefined) {
    return "post";
  }

  return undefined;
}

function canonicalPublicPathFromHref(href: string | undefined): string | undefined {
  const pathname = internalPathnameFromHref(href);

  if (!pathname) {
    return undefined;
  }

  const path = trimTrailingSlash(pathname);

  if (path === "/") {
    return "/";
  }

  return path;
}

function internalPathnameFromHref(href: string | undefined): string | undefined {
  if (!href) {
    return undefined;
  }

  if (href.startsWith("?") || href.startsWith("#")) {
    return undefined;
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href)) {
    return undefined;
  }

  const path = href.split(/[?#]/, 1)[0]?.trim() ?? "";

  if (!path) {
    return undefined;
  }

  return path.startsWith("/") ? path : `/${path}`;
}

function isPublicSiteDocumentPath(
  pathname: string,
  clientRoutePrefixes: readonly `/${string}`[],
): boolean {
  return (
    !isApiPath(pathname) &&
    !isClientShellRoute(pathname, clientRoutePrefixes) &&
    !looksLikeStaticAssetPath(pathname)
  );
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function isClientShellRoute(pathname: string, clientRoutePrefixes: readonly `/${string}`[]) {
  return clientRoutePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function looksLikeStaticAssetPath(pathname: string): boolean {
  const lastSegment = pathname.split("/").at(-1) ?? "";

  return (
    staticAssetPathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix)) ||
    /\.[a-zA-Z0-9]+$/.test(lastSegment)
  );
}

function slugFromPublicPath(pathname: string): string {
  const trimmed = pathname.trim().replace(/^\/+/, "").replace(/\/+$/, "");

  return trimmed === "" ? "home" : trimmed;
}

function routeRecord(route: ReturnType<typeof resolveSiteRoute>): StoredRecord | undefined {
  if (!route) {
    return undefined;
  }

  switch (route.kind) {
    case "page":
      return route.page;
    case "post":
      return route.post;
  }
}

function dedupeAndSortPublicRoutes(entries: PublicSiteRouteEntry[]): PublicSiteRouteEntry[] {
  const byPath = new Map<string, PublicSiteRouteEntry>();

  for (const entry of entries) {
    if (!byPath.has(entry.path)) {
      byPath.set(entry.path, entry);
    }
  }

  return [...byPath.values()].sort(comparePublicRouteEntries);
}

function comparePublicRouteEntries(a: PublicSiteRouteEntry, b: PublicSiteRouteEntry): number {
  if (a.path === "/" && b.path !== "/") {
    return -1;
  }

  if (a.path !== "/" && b.path === "/") {
    return 1;
  }

  return compareStrings(a.path, b.path) || compareStrings(a.recordId, b.recordId);
}

function canonicalUrlForPath(pathname: string, origin: string): string {
  return new URL(pathname, new URL(origin).origin).href;
}

function isLiveBlock(record: StoredRecord): boolean {
  return record.entity === "block" && !record.deletedAt;
}

function trimTrailingSlash(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");

  return trimmed === "" ? "/" : trimmed;
}

function stringValue(value: FieldValue | undefined): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function compareRecords(a: StoredRecord, b: StoredRecord): number {
  return compareStrings(a.createdAt, b.createdAt) || compareStrings(a.id, b.id);
}

function compareStrings(a: string, b: string): number {
  if (a < b) {
    return -1;
  }

  if (a > b) {
    return 1;
  }

  return 0;
}

function escapeXmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
