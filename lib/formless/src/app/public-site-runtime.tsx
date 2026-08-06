import {
  type SitePageRouteState,
  type SitePublicRendererComponent,
  type SitePublicSystemStateRendererComponent,
  type SitePageLinkMode,
} from "@dpeek/formless-site-app/public/react";
import { useMemo, useSyncExternalStore } from "react";
import {
  SITE_PUBLIC_BROWSER_SURFACE_KEY,
  type SitePublicBrowserRuntimeSurface,
} from "@dpeek/formless-site-app/runtime/browser";
import { listenForClientEvents } from "../client/broadcast.ts";
import { startPushSync } from "../client/sync.ts";
import type { ProgramBrowserRuntimeDefinition } from "../program/composition.ts";
import { programBrowserRuntime } from "../program/compiled/browser.ts";
import { FORMLESS_PROGRAM_API_ROUTE_PREFIX } from "../program/target.ts";
import { getClientStoreSnapshot, subscribeToClientStore } from "../client/store.ts";

export type PublicSiteRouteInputProps = {
  browserRuntime?: ProgramBrowserRuntimeDefinition;
  linkMode?: SitePageLinkMode;
  programReplica?: boolean;
  routeBase?: `/${string}`;
  slug: string;
  surfaceMountKey?: string;
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
  programReplica = false,
  routeBase,
  slug,
  surfaceMountKey,
  workspaceRenderer,
}: PublicSiteRouteProps) {
  const surface = resolveSitePublicBrowserRuntimeSurface(browserRuntime, surfaceMountKey);

  if (!surface) {
    return null;
  }

  if (programReplica) {
    return (
      <ProgramReplicaSitePageRoute
        builtInRenderer={builtInRenderer}
        builtInSystemStateRenderer={builtInSystemStateRenderer}
        linkMode={linkMode}
        routeBase={routeBase}
        slug={slug}
        surface={surface}
        workspaceRenderer={workspaceRenderer}
      />
    );
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
  mountKey?: string,
): SitePublicBrowserRuntimeSurface | undefined {
  const surfaceKey =
    mountKey === undefined
      ? SITE_PUBLIC_BROWSER_SURFACE_KEY
      : runtime.mounts.find((binding) => binding.mountKey === mountKey)?.surfaceKey;

  if (surfaceKey !== SITE_PUBLIC_BROWSER_SURFACE_KEY) {
    return undefined;
  }

  return runtime.surfaces.find(({ key }) => key === surfaceKey)?.surface as
    | SitePublicBrowserRuntimeSurface
    | undefined;
}

function ProgramReplicaSitePageRoute({
  builtInRenderer,
  builtInSystemStateRenderer,
  linkMode,
  routeBase,
  slug,
  surface,
  workspaceRenderer,
}: {
  builtInRenderer: SitePublicRendererComponent;
  builtInSystemStateRenderer: SitePublicSystemStateRendererComponent;
  linkMode: SitePageLinkMode;
  routeBase?: `/${string}`;
  slug: string;
  surface: SitePublicBrowserRuntimeSurface;
  workspaceRenderer?: SitePublicRendererComponent;
}) {
  const snapshot = useSyncExternalStore(
    subscribeToClientStore,
    getClientStoreSnapshot,
    getClientStoreSnapshot,
  );
  const state = useMemo<SitePageRouteState>(() => {
    if (!snapshot.hydrated || snapshot.schema === null) {
      return { status: "loading", slug };
    }

    const projection = surface.buildPageTree(
      snapshot.schema,
      Object.values(snapshot.recordsById),
      slug,
    );

    if (projection.status === "unavailable") {
      return { status: "error", message: "Public Site is unavailable.", slug };
    }

    return projection.tree === null
      ? { status: "not-found", slug }
      : { status: "ready", tree: projection.tree };
  }, [slug, snapshot.hydrated, snapshot.recordsById, snapshot.schema, surface]);
  const PackageSitePageRoute = surface.Route;

  return (
    <PackageSitePageRoute
      apiRoutePrefix={FORMLESS_PROGRAM_API_ROUTE_PREFIX}
      builtInRenderer={builtInRenderer}
      builtInSystemStateRenderer={builtInSystemStateRenderer}
      linkMode={linkMode}
      routeBase={routeBase}
      slug={slug}
      state={state}
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
