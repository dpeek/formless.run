import {
  SitePageRoute as PackageSitePageRoute,
  type SitePublicRendererComponent,
  type SitePublicSystemStateRendererComponent,
  type SitePageLinkMode,
} from "@dpeek/formless-site-app/public/react";
import { listenForClientEvents } from "../client/broadcast.ts";
import { startPushSync } from "../client/sync.ts";
import { FORMLESS_PROGRAM_API_ROUTE_PREFIX } from "../program/target.ts";

export type PublicSiteRouteInputProps = {
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
  linkMode = "preview",
  routeBase,
  slug,
  workspaceRenderer,
}: PublicSiteRouteProps) {
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
