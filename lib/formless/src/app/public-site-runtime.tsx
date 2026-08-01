import {
  type SitePublicRendererComponent,
  type SitePublicSystemStateRendererComponent,
  type SitePageLinkMode,
} from "@dpeek/formless-site-app/public/react";
import {
  SITE_PUBLIC_BROWSER_SURFACE_KEY,
  type SitePublicBrowserRuntimeSurface,
} from "@dpeek/formless-site-app/runtime/browser";
import { listenForClientEvents } from "../client/broadcast.ts";
import { startPushSync } from "../client/sync.ts";
import type { ProgramBrowserRuntimeDefinition } from "../program/composition.ts";
import { programBrowserRuntime } from "../program/compiled/browser.ts";
import { FORMLESS_PROGRAM_API_ROUTE_PREFIX } from "../program/target.ts";

export type PublicSiteRouteInputProps = {
  browserRuntime?: ProgramBrowserRuntimeDefinition;
  linkMode?: SitePageLinkMode;
  routeBase?: `/${string}`;
  slug: string;
  workspaceRenderer?: SitePublicRendererComponent;
};

export type PublicSiteRouteProps = PublicSiteRouteInputProps & {
  builtInRenderer: SitePublicRendererComponent;
  builtInSystemStateRenderer: SitePublicSystemStateRendererComponent;
};

export function CoreSitePageRoute({
  builtInRenderer,
  builtInSystemStateRenderer,
  browserRuntime = programBrowserRuntime,
  linkMode = "preview",
  routeBase,
  slug,
  workspaceRenderer,
}: PublicSiteRouteProps) {
  const surface = resolveSitePublicBrowserRuntimeSurface(browserRuntime);

  if (!surface) {
    return null;
  }

  const PackageSitePageRoute = surface.Route;

  return (
    <PackageSitePageRoute
      apiRoutePrefix={FORMLESS_PROGRAM_API_ROUTE_PREFIX}
      builtInRenderer={builtInRenderer}
      builtInSystemStateRenderer={builtInSystemStateRenderer}
      linkMode={linkMode}
      listenForPreviewChanges={listenForSitePreviewChanges}
      routeBase={routeBase}
      slug={slug}
      startPreviewSync={startSitePreviewSync}
      workspaceRenderer={workspaceRenderer}
    />
  );
}

export function resolveSitePublicBrowserRuntimeSurface(
  runtime: ProgramBrowserRuntimeDefinition,
): SitePublicBrowserRuntimeSurface | undefined {
  return runtime.surfaces.find(({ key }) => key === SITE_PUBLIC_BROWSER_SURFACE_KEY)?.surface as
    | SitePublicBrowserRuntimeSurface
    | undefined;
}

function startSitePreviewSync(onSynced: () => void) {
  return startPushSync({ onSynced });
}

function listenForSitePreviewChanges(onChanged: () => void) {
  return listenForClientEvents((event) => {
    if (event.type === "records-updated" || event.type === "schema-updated") {
      onChanged();
    }
  });
}
