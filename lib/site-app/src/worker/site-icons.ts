import { encodeIcoFromPngs } from "../ico.ts";
import { DEFAULT_SITE_ICON_SVG, resolveSiteIconSvgSource } from "../site-icon-source.ts";
import { PUBLIC_SITE_ICON_CACHE_CONTROL } from "./site-cache.ts";

export type SiteIconRouteKind = "apple-touch-png" | "favicon-ico" | "favicon-svg";

export type SiteIconRoute = {
  contentType: string;
  kind: SiteIconRouteKind;
};

export type PublicSiteIconRenderInput = {
  request: Request;
  route: SiteIconRoute;
  svg?: string;
};

const SITE_ICON_CACHE_HOST = "site-icon-cache.formless.internal";
const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const defaultSiteIconSvg = resolveSiteIconSvgSource(DEFAULT_SITE_ICON_SVG);
const siteIconRoutes = new Map<string, SiteIconRoute>([
  [
    "/favicon.svg",
    {
      contentType: "image/svg+xml; charset=utf-8",
      kind: "favicon-svg",
    },
  ],
  [
    "/favicon.ico",
    {
      contentType: "image/x-icon",
      kind: "favicon-ico",
    },
  ],
  [
    "/apple-touch-icon.png",
    {
      contentType: "image/png",
      kind: "apple-touch-png",
    },
  ],
]);

export async function renderSiteIconResponse(input: PublicSiteIconRenderInput): Promise<Response> {
  const svg = resolveSiteIconSvgSource(input.svg);

  return buildCachedSiteIconResponse(input.request, input.route, svg);
}

export function isSiteIconPath(pathname: string): boolean {
  return siteIconRoutes.has(pathname);
}

export function siteIconRouteForPathname(pathname: string): SiteIconRoute | undefined {
  return siteIconRoutes.get(pathname);
}

async function buildCachedSiteIconResponse(
  request: Request,
  route: SiteIconRoute,
  svg: string,
): Promise<Response> {
  const contentHash = await sha256Hex(`${route.kind}\n${svg}`);
  const headers = siteIconHeaders(route, contentHash);

  if (requestMatchesEtag(request, headers.get("ETag"))) {
    return new Response(null, {
      headers,
      status: 304,
    });
  }

  const cache = await siteIconCache();
  const cacheKey = cacheRequest(route.kind, contentHash);
  const cached = await cache?.match(cacheKey);

  if (cached) {
    return cached;
  }

  let body: BodyInit;

  try {
    body = await siteIconBody(route.kind, svg);
  } catch (error) {
    if (svg !== defaultSiteIconSvg && route.kind !== "favicon-svg") {
      return buildCachedSiteIconResponse(request, route, defaultSiteIconSvg);
    }

    throw error;
  }

  const response = new Response(body, { headers });

  await cache?.put(cacheKey, response.clone());

  return response;
}

async function siteIconBody(kind: SiteIconRouteKind, svg: string): Promise<BodyInit> {
  const faviconSvg = whiteCurrentColorSvg(svg);

  switch (kind) {
    case "favicon-svg":
      return faviconSvg;
    case "apple-touch-png":
      return byteBody(await renderSvgToPng(faviconSvg, 180));
    case "favicon-ico": {
      const entries = await Promise.all([
        renderSvgToPng(faviconSvg, 16).then((png) => ({ height: 16, png, width: 16 })),
        renderSvgToPng(faviconSvg, 32).then((png) => ({ height: 32, png, width: 32 })),
      ]);

      return byteBody(encodeIcoFromPngs(entries));
    }
  }
}

function whiteCurrentColorSvg(svg: string): string {
  return svg.replace(/^<svg\b/, '<svg color="#fff"');
}

async function renderSvgToPng(svg: string, size: number): Promise<Uint8Array> {
  const { Resvg, initResvg } = await import("@cf-wasm/resvg/workerd");

  await initResvg.ensure();

  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng();

  if (!hasPngSignature(png)) {
    throw new Error("Site icon renderer did not return PNG bytes.");
  }

  return png;
}

function siteIconHeaders(route: SiteIconRoute, contentHash: string): Headers {
  return new Headers({
    "Cache-Control": PUBLIC_SITE_ICON_CACHE_CONTROL,
    "Content-Type": route.contentType,
    ETag: `"site-icon:${route.kind}:${contentHash}"`,
  });
}

function requestMatchesEtag(request: Request, etag: string | null): boolean {
  const ifNoneMatch = request.headers.get("If-None-Match");

  return Boolean(
    etag &&
    ifNoneMatch
      ?.split(",")
      .map((value) => value.trim())
      .includes(etag),
  );
}

async function siteIconCache(): Promise<Cache | undefined> {
  if (typeof caches === "undefined") {
    return undefined;
  }

  return (caches as CacheStorage & { default?: Cache }).default ?? caches.open("site-icons");
}

function cacheRequest(kind: SiteIconRouteKind, contentHash: string): Request {
  return new Request(`https://${SITE_ICON_CACHE_HOST}/${kind}/${contentHash}`);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return pngSignature.every((byte, index) => bytes[index] === byte);
}

function byteBody(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
