import { SitePageRoute } from "../react/route.tsx";
import { buildSitePageTree } from "../tree.ts";
import { SITE_RUNTIME_ENTITY_IDS } from "./entity-ids.ts";
import { SITE_PUBLIC_SURFACE_KEY } from "./index.ts";

export const SITE_PUBLIC_BROWSER_SURFACE_KEY = SITE_PUBLIC_SURFACE_KEY;

export type SitePublicBrowserRuntimeSurface = {
  buildPageTree: typeof buildSitePageTree;
  Route: typeof SitePageRoute;
};

export const sitePublicBrowserSurfaceDefinition = {
  target: "browser",
  kind: "surface",
  key: SITE_PUBLIC_BROWSER_SURFACE_KEY,
  entityIds: SITE_RUNTIME_ENTITY_IDS,
  surface: {
    buildPageTree: buildSitePageTree,
    Route: SitePageRoute,
  } satisfies SitePublicBrowserRuntimeSurface,
} as const;
