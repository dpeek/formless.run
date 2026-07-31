import { useEffect, useMemo, useState } from "react";
import { SitePublicRenderer, type SitePublicRendererComponent } from "./renderer.tsx";
import { readInitialSitePageTree } from "./initial-tree.ts";
import { sitePagePathForSlug, type SitePageLinkMode } from "../public-links.ts";
import type { SitePublicSystemStateRendererComponent } from "../public-system-state.ts";
import type { SitePageTree, SitePageTreeResponse } from "../types.ts";
import { normalizeSitePageSlug } from "./slug.ts";
import { PublicSiteThemeProvider } from "./theme.ts";

export { normalizeSitePageSlug } from "./slug.ts";

const DEFAULT_SITE_API_ROUTE_PREFIX = "/api/formless/program";

export type SitePageRouteState =
  | {
      status: "loading";
      slug: string;
    }
  | {
      status: "ready";
      tree: SitePageTree;
    }
  | {
      status: "not-found";
      slug: string;
    }
  | {
      status: "error";
      message: string;
      slug: string;
    };

type SitePageRouteSessionOptions = {
  apiRoutePrefix?: `/${string}`;
  fetcher?: typeof fetch;
  initialTree?: SitePageTree;
  linkMode: SitePageLinkMode;
  listenForPreviewChanges?: (onChanged: () => void) => () => void;
  onState: (state: SitePageRouteState) => void;
  slug: string;
  startPreviewSync?: (onSynced: () => void) => () => void;
};

export function SitePageRoute({
  apiRoutePrefix = DEFAULT_SITE_API_ROUTE_PREFIX,
  builtInRenderer,
  builtInSystemStateRenderer,
  linkMode = "preview",
  listenForPreviewChanges,
  routeBase,
  slug,
  startPreviewSync,
  workspaceRenderer,
}: {
  apiRoutePrefix?: `/${string}`;
  builtInRenderer: SitePublicRendererComponent;
  builtInSystemStateRenderer: SitePublicSystemStateRendererComponent;
  linkMode?: SitePageLinkMode;
  listenForPreviewChanges?: (onChanged: () => void) => () => void;
  routeBase?: `/${string}`;
  slug: string;
  startPreviewSync?: (onSynced: () => void) => () => void;
  workspaceRenderer?: SitePublicRendererComponent;
}) {
  const normalizedSlug = normalizeSitePageSlug(slug);
  const initialTree = useMemo(
    () => (linkMode === "published" ? readInitialSitePageTree(normalizedSlug) : undefined),
    [linkMode, normalizedSlug],
  );
  const [state, setState] = useState<SitePageRouteState>(() =>
    sitePageRouteInitialState({ initialTree, linkMode, slug: normalizedSlug }),
  );

  useEffect(() => {
    return startSitePageRouteSession({
      apiRoutePrefix,
      initialTree,
      linkMode,
      listenForPreviewChanges,
      onState: setState,
      slug: normalizedSlug,
      startPreviewSync,
    });
  }, [
    apiRoutePrefix,
    initialTree,
    linkMode,
    listenForPreviewChanges,
    normalizedSlug,
    startPreviewSync,
  ]);

  return (
    <SitePageRouteView
      builtInRenderer={builtInRenderer}
      builtInSystemStateRenderer={builtInSystemStateRenderer}
      linkMode={linkMode}
      routeBase={routeBase}
      state={state}
      workspaceRenderer={workspaceRenderer}
    />
  );
}

export function startSitePageRouteSession({
  apiRoutePrefix = DEFAULT_SITE_API_ROUTE_PREFIX,
  fetcher,
  initialTree,
  linkMode,
  listenForPreviewChanges,
  onState,
  slug,
  startPreviewSync,
}: SitePageRouteSessionOptions) {
  const normalizedSlug = normalizeSitePageSlug(slug);
  let stopped = false;
  let activeController: AbortController | undefined;
  let stopPreviewChanges = () => {};
  let stopPreviewSync = () => {};

  function loadTree(showLoading: boolean) {
    activeController?.abort();

    const controller = new AbortController();
    activeController = controller;

    if (showLoading) {
      onState({ status: "loading", slug: normalizedSlug });
    }

    void fetchSitePageTree(normalizedSlug, {
      apiRoutePrefix,
      fetcher,
      signal: controller.signal,
    })
      .then((tree) => {
        if (!stopped && activeController === controller && !controller.signal.aborted) {
          onState({ status: "ready", tree });
        }
      })
      .catch((error: unknown) => {
        if (stopped || activeController !== controller || controller.signal.aborted) {
          return;
        }

        if (error instanceof SitePageNotFoundError) {
          onState({ status: "not-found", slug: normalizedSlug });
          return;
        }

        onState({
          status: "error",
          message: error instanceof Error ? error.message : "Site page failed to load.",
          slug: normalizedSlug,
        });
      });
  }

  function refetchActiveTree() {
    loadTree(false);
  }

  if (usesPreviewSync(linkMode)) {
    loadTree(true);
    stopPreviewSync = startPreviewSync?.(refetchActiveTree) ?? (() => {});
    stopPreviewChanges = listenForPreviewChanges?.(refetchActiveTree) ?? (() => {});
  } else if (initialTreeMatchesSlug(initialTree, normalizedSlug)) {
    onState({ status: "ready", tree: initialTree });
  } else {
    loadTree(true);
  }

  return () => {
    stopped = true;
    activeController?.abort();
    stopPreviewChanges();
    stopPreviewSync();
  };
}

function usesPreviewSync(linkMode: SitePageLinkMode): boolean {
  return linkMode === "preview" || linkMode === "authoring" || linkMode === "installed";
}

function sitePageRouteInitialState({
  initialTree,
  linkMode,
  slug,
}: {
  initialTree: SitePageTree | undefined;
  linkMode: SitePageLinkMode;
  slug: string;
}): SitePageRouteState {
  if (linkMode === "published" && initialTreeMatchesSlug(initialTree, slug)) {
    return { status: "ready", tree: initialTree };
  }

  return { status: "loading", slug };
}

function initialTreeMatchesSlug(
  tree: SitePageTree | undefined,
  slug: string,
): tree is SitePageTree {
  return Boolean(tree && normalizeSitePageSlug(tree.meta.slug) === normalizeSitePageSlug(slug));
}

export function SitePageRouteView({
  builtInRenderer,
  builtInSystemStateRenderer: SystemStateRenderer,
  linkMode = "preview",
  routeBase,
  state,
  workspaceRenderer,
}: {
  builtInRenderer: SitePublicRendererComponent;
  builtInSystemStateRenderer: SitePublicSystemStateRendererComponent;
  linkMode?: SitePageLinkMode;
  routeBase?: `/${string}`;
  state: SitePageRouteState;
  workspaceRenderer?: SitePublicRendererComponent;
}) {
  switch (state.status) {
    case "ready":
      return (
        <PublicSiteThemeProvider site={state.tree.site}>
          <SitePublicRenderer
            builtInRenderer={builtInRenderer}
            linkMode={linkMode}
            routeBase={routeBase}
            tree={state.tree}
            workspaceRenderer={workspaceRenderer}
          />
        </PublicSiteThemeProvider>
      );
    case "not-found":
      return (
        <SystemStateRenderer
          homeHref={sitePagePathForSlug("home", linkMode, routeBase)}
          kind="not-found"
          slug={state.slug}
        />
      );
    case "error":
      return <SystemStateRenderer kind="failure" message={state.message} slug={state.slug} />;
    case "loading":
      return <SystemStateRenderer kind="loading" slug={state.slug} />;
  }
}

export async function fetchSitePageTree(
  slug: string,
  options: {
    apiRoutePrefix?: `/${string}`;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
  } = {},
): Promise<SitePageTree> {
  const fetcher = options.fetcher ?? fetch;
  const apiRoutePrefix = options.apiRoutePrefix ?? DEFAULT_SITE_API_ROUTE_PREFIX;
  const response = await fetcher(`${apiRoutePrefix}/tree/${encodeURIComponent(slug)}`, {
    headers: { Accept: "application/json" },
    signal: options.signal,
  });

  if (response.status === 404) {
    throw new SitePageNotFoundError(slug);
  }

  const body = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(
      errorMessage(body) ?? `Site page request failed with status ${response.status}.`,
    );
  }

  return body as SitePageTreeResponse;
}

class SitePageNotFoundError extends Error {
  constructor(slug: string) {
    super(`No site page found for "${slug}".`);
  }
}

function errorMessage(body: unknown): string | undefined {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }

  return undefined;
}
