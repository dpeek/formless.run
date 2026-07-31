export type SitePageLinkMode = "preview" | "authoring" | "published";
export type SitePublicRouteBase = `/${string}`;

export function sitePagePathForSlug(
  slug: string,
  linkMode: SitePageLinkMode,
  routeBase?: SitePublicRouteBase,
): `/${string}` {
  const encodedSlug = encodeSiteSlugPath(slug) || "home";

  if (linkMode === "published" && routeBase && routeBase !== "/") {
    const base = normalizeRouteBase(routeBase);

    return encodedSlug === "home" ? base : joinRouteBase(base, encodedSlug);
  }

  if (usesTopLevelSitePaths(linkMode)) {
    return encodedSlug === "home" ? "/" : (`/${encodedSlug}` as const);
  }

  return `/pages/${encodedSlug}`;
}

export function profileAwareSiteHref(
  href: string,
  linkMode: SitePageLinkMode,
  routeBase?: SitePublicRouteBase,
): string {
  if (isExternalSiteHref(href)) {
    return href;
  }

  const { path, suffix } = splitHrefSuffix(href);

  if (linkMode === "published" && routeBase && routeBase !== "/") {
    const base = normalizeRouteBase(routeBase);

    if (path === base || path.startsWith(`${base}/`)) {
      return href;
    }

    if (path === "/pages" || path === "/pages/" || path === "/") {
      return `${sitePagePathForSlug("home", linkMode, base)}${suffix}`;
    }

    if (path.startsWith("/pages/")) {
      return `${sitePagePathForSlug(path.slice("/pages/".length), linkMode, base)}${suffix}`;
    }

    if (path.startsWith("/") && !path.startsWith("//")) {
      return `${sitePagePathForSlug(path.slice(1), linkMode, base)}${suffix}`;
    }

    return href;
  }

  if (!usesTopLevelSitePaths(linkMode)) {
    if (path === "/pages" || path === "/pages/") {
      return `${sitePagePathForSlug("home", linkMode)}${suffix}`;
    }

    if (path.startsWith("/pages/")) {
      return href;
    }

    if (path === "/") {
      return `${sitePagePathForSlug("home", linkMode)}${suffix}`;
    }

    if (path.startsWith("/") && !path.startsWith("//")) {
      return `${sitePagePathForSlug(path.slice(1), linkMode)}${suffix}`;
    }

    return href;
  }

  if (path === "/pages" || path === "/pages/") {
    return `${sitePagePathForSlug("home", linkMode, routeBase)}${suffix}`;
  }

  if (path.startsWith("/pages/")) {
    return `${sitePagePathForSlug(path.slice("/pages/".length), linkMode, routeBase)}${suffix}`;
  }

  return href;
}

function usesTopLevelSitePaths(linkMode: SitePageLinkMode): boolean {
  return linkMode === "authoring" || linkMode === "published";
}

export function siteHrefMatchesRoute(
  href: string,
  currentSlug: string | undefined,
  routeBase?: SitePublicRouteBase,
): boolean {
  const linkSlug = routeSlugForSiteHref(href, routeBase);

  if (!linkSlug || !currentSlug) {
    return false;
  }

  const routeSlug = normalizeSiteSlug(currentSlug);

  if (linkSlug === "home") {
    return routeSlug === "home";
  }

  return routeSlug === linkSlug || routeSlug.startsWith(`${linkSlug}/`);
}

export function isExternalSiteHref(href: string): boolean {
  return /^https?:\/\//.test(href);
}

export function siteLinkRel(href: string): "noreferrer" | undefined {
  return isExternalSiteHref(href) ? "noreferrer" : undefined;
}

export function siteLinkTarget(href: string): "_blank" | undefined {
  return isExternalSiteHref(href) ? "_blank" : undefined;
}

function splitHrefSuffix(href: string): { path: string; suffix: string } {
  const suffixStart = href.search(/[?#]/);

  if (suffixStart === -1) {
    return { path: href, suffix: "" };
  }

  return {
    path: href.slice(0, suffixStart),
    suffix: href.slice(suffixStart),
  };
}

function routeSlugForSiteHref(href: string, routeBase?: SitePublicRouteBase): string | null {
  if (isExternalSiteHref(href)) {
    return null;
  }

  const { path } = splitHrefSuffix(href);
  const base = routeBase ? normalizeRouteBase(routeBase) : undefined;

  if (base && path === base) {
    return "home";
  }

  if (base && path.startsWith(`${base}/`)) {
    return normalizeSiteSlug(path.slice(base.length));
  }

  if (path === "/" || path === "/pages" || path === "/pages/") {
    return "home";
  }

  if (path.startsWith("/pages/")) {
    return normalizeSiteSlug(path.slice("/pages/".length));
  }

  if (path.startsWith("/") && !path.startsWith("//")) {
    return normalizeSiteSlug(path.slice(1));
  }

  return null;
}

function normalizeSiteSlug(slug: string): string {
  const normalized = slug.trim().replace(/^\/+/, "").replace(/\/+$/, "");

  return normalized === "" ? "home" : normalized;
}

function normalizeRouteBase(routeBase: SitePublicRouteBase): SitePublicRouteBase {
  const normalized = routeBase.replace(/\/+$/, "");

  return normalized === "" ? "/" : (normalized as SitePublicRouteBase);
}

function joinRouteBase(routeBase: SitePublicRouteBase, encodedSlug: string): SitePublicRouteBase {
  return routeBase === "/"
    ? `/${encodedSlug}`
    : (`${routeBase}/${encodedSlug}` as SitePublicRouteBase);
}

function encodeSiteSlugPath(slug: string): string {
  return slug
    .split("/")
    .filter((segment) => segment !== "")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
