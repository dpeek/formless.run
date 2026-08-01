import {
  SitePageRoute as PackageSitePageRoute,
  type SitePublicRendererComponent,
  type SitePublicSystemStateRendererComponent,
  type SitePageLinkMode,
} from "@dpeek/formless-site-app/public/react";
import {
  programStorageIdentityForClientTarget,
  programClientTarget,
  type ProgramClientTarget,
} from "../client/program-target.ts";
import { listenForClientEvents } from "../client/broadcast.ts";
import { startPushSync } from "../client/sync.ts";

export type PublicSiteRouteInputProps = {
  linkMode?: SitePageLinkMode;
  routeBase?: `/${string}`;
  slug: string;
  target?: ProgramClientTarget;
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
  target = programClientTarget(),
  workspaceRenderer,
}: PublicSiteRouteProps) {
  const identity = programStorageIdentityForClientTarget(target);

  return (
    <PackageSitePageRoute
      apiRoutePrefix={identity.apiRoutePrefix}
      builtInRenderer={builtInRenderer}
      builtInSystemStateRenderer={builtInSystemStateRenderer}
      linkMode={linkMode}
      listenForPreviewChanges={(onChanged) => listenForSitePreviewChanges(target, onChanged)}
      routeBase={routeBase}
      slug={slug}
      startPreviewSync={(onSynced) => startSitePreviewSync(target, onSynced)}
      workspaceRenderer={workspaceRenderer}
    />
  );
}

function startSitePreviewSync(target: ProgramClientTarget, onSynced: () => void) {
  return startPushSync(target, { onSynced });
}

function listenForSitePreviewChanges(target: ProgramClientTarget, onChanged: () => void) {
  return listenForClientEvents(target, (event) => {
    if (event.type === "records-updated" || event.type === "schema-updated") {
      onChanged();
    }
  });
}
