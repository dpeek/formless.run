import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  fetchSitePageTree,
  normalizeSitePageSlug,
  SitePageRouteView,
  startSitePageRouteSession,
  type SitePageRouteState,
} from "./route.tsx";
import type { SitePublicRendererProps } from "./renderer.tsx";
import type { SitePublicSystemStateRendererProps } from "../public-system-state.ts";
import {
  INITIAL_SITE_PAGE_TREE_SCRIPT_ID,
  readInitialSitePageTree,
  renderInitialSitePageTreeScript,
} from "./initial-tree.ts";
import type { SitePageTreeResponse } from "../types.ts";

describe("public Site page route data loading", () => {
  it("fetches the current tree through the read-only Site tree endpoint", async () => {
    const tree = sitePageTree("blog/shipping-schema-backed-authoring");
    const calls: Array<{
      body: BodyInit | null | undefined;
      input: RequestInfo | URL;
      method: string | undefined;
      accept: string | null;
      signal: AbortSignal | null | undefined;
    }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({
        body: init?.body,
        input,
        method: init?.method,
        accept: new Headers(init?.headers).get("Accept"),
        signal: init?.signal,
      });

      return Response.json(tree);
    };

    const response = await fetchSitePageTree("blog/shipping-schema-backed-authoring", {
      fetcher,
    });

    expect(response).toEqual(tree);
    expect(calls).toEqual([
      {
        body: undefined,
        input: "/api/formless/program/tree/blog%2Fshipping-schema-backed-authoring",
        method: undefined,
        accept: "application/json",
        signal: undefined,
      },
    ]);
  });

  it("fetches Site trees through the selected Program endpoint", async () => {
    const tree = sitePageTree("home");
    const fetcher: typeof fetch = async (input) => {
      expect(input).toBe("/api/formless/program/tree/home");

      return Response.json(tree);
    };

    await expect(
      fetchSitePageTree("home", {
        apiRoutePrefix: "/api/formless/program",
        fetcher,
      }),
    ).resolves.toEqual(tree);
  });

  it("passes abort signals to tree fetches for stale route cleanup", async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | null | undefined;
    const fetcher: typeof fetch = async (_input, init) => {
      receivedSignal = init?.signal;

      return Response.json(sitePageTree("home"));
    };

    await fetchSitePageTree("home", { fetcher, signal: controller.signal });

    expect(receivedSignal).toBe(controller.signal);
  });

  it("maps missing tree reads to the public not-found state", async () => {
    const fetcher: typeof fetch = async () =>
      Response.json({ error: "Site page not found." }, { status: 404 });

    await expect(fetchSitePageTree("missing", { fetcher })).rejects.toThrow(
      'No site page found for "missing".',
    );
  });

  it("normalizes empty and encoded public page slugs", () => {
    expect(normalizeSitePageSlug(undefined)).toBe("home");
    expect(normalizeSitePageSlug("/blog%2Fshipping-schema-backed-authoring")).toBe(
      "blog/shipping-schema-backed-authoring",
    );
  });

  it("reads matching embedded initial tree data", () => {
    const tree = sitePageTree("blog/shipping-schema-backed-authoring");
    const scriptText = initialTreeScriptText(tree);

    expect(
      readInitialSitePageTree("blog/shipping-schema-backed-authoring", fakeDocument(scriptText)),
    ).toEqual(tree);
    expect(readInitialSitePageTree("blog/other", fakeDocument(scriptText))).toBeUndefined();
  });

  it("escapes embedded initial tree data so content cannot close the script", () => {
    const homeTree = sitePageTree("home");
    const tree = {
      ...homeTree,
      page: {
        ...homeTree.page,
        label: 'Hostile </script><script type="module">alert(1)</script> & text',
      },
    };
    const scriptText = initialTreeScriptText(tree);

    expect(scriptText).not.toContain("</script");
    expect(scriptText).not.toContain("<script");
    expect(scriptText).toContain("\\u003C/script\\u003E\\u003Cscript");
    expect(scriptText).toContain("\\u0026 text");
    expect(readInitialSitePageTree("home", fakeDocument(scriptText))).toEqual(tree);
  });

  it("starts published Site sessions from embedded tree data without a duplicate fetch", () => {
    const tree = sitePageTree("home");
    const states: SitePageRouteState[] = [];
    let fetched = false;
    let startedPreviewSync = false;
    let listenedForPreviewChanges = false;

    const stop = startSitePageRouteSession({
      fetcher: async () => {
        fetched = true;
        return Response.json(tree);
      },
      initialTree: tree,
      linkMode: "published",
      listenForPreviewChanges: () => {
        listenedForPreviewChanges = true;
        return () => {};
      },
      onState: (state) => states.push(state),
      slug: "home",
      startPreviewSync: () => {
        startedPreviewSync = true;
        return () => {};
      },
    });

    stop();

    expect(states).toEqual([{ status: "ready", tree }]);
    expect(fetched).toBe(false);
    expect(startedPreviewSync).toBe(false);
    expect(listenedForPreviewChanges).toBe(false);
  });

  it.each(["preview", "authoring"] as const)(
    "refreshes %s sessions after sync and same-profile changes",
    async (linkMode) => {
      const tree = sitePageTree("home");
      const fetchPaths: string[] = [];
      const states: SitePageRouteState[] = [];
      let notifyChanged: (() => void) | undefined;
      let notifySynced: (() => void) | undefined;
      const stop = startSitePageRouteSession({
        fetcher: async (input) => {
          fetchPaths.push(requestUrl(input));
          return Response.json(tree);
        },
        linkMode,
        listenForPreviewChanges: (onChanged) => {
          notifyChanged = onChanged;
          return () => {};
        },
        onState: (state) => states.push(state),
        slug: "home",
        startPreviewSync: (onSynced) => {
          notifySynced = onSynced;
          return () => {};
        },
      });

      try {
        await waitFor(() => readyStateCount(states) === 1);
        notifySynced?.();
        await waitFor(() => readyStateCount(states) === 2);
        notifyChanged?.();
        await waitFor(() => readyStateCount(states) === 3);
      } finally {
        stop();
      }

      expect(fetchPaths).toEqual([
        "/api/formless/program/tree/home",
        "/api/formless/program/tree/home",
        "/api/formless/program/tree/home",
      ]);
    },
  );

  it("aborts the active preview read and removes both subscriptions on cleanup", () => {
    let activeSignal: AbortSignal | undefined;
    let stoppedChanges = false;
    let stoppedSync = false;
    const stop = startSitePageRouteSession({
      fetcher: (_input, init) => {
        activeSignal = init?.signal ?? undefined;
        return new Promise<Response>(() => {});
      },
      linkMode: "preview",
      listenForPreviewChanges: () => () => {
        stoppedChanges = true;
      },
      onState: () => {},
      slug: "home",
      startPreviewSync: () => () => {
        stoppedSync = true;
      },
    });

    expect(activeSignal?.aborted).toBe(false);
    stop();
    expect(activeSignal?.aborted).toBe(true);
    expect(stoppedChanges).toBe(true);
    expect(stoppedSync).toBe(true);
  });
});

describe("public Site page route rendering", () => {
  it("selects a workspace page renderer ahead of the required built-in renderer", () => {
    const CustomRenderer = ({ linkMode, routeBase, tree }: SitePublicRendererProps) => (
      <article
        data-custom-public-site-renderer={tree.meta.slug}
        data-link-mode={linkMode}
        data-route-base={routeBase}
      >
        Custom page {tree.page.label}
      </article>
    );
    const html = renderToStaticMarkup(
      <SitePageRouteView
        builtInRenderer={PageRendererProbe}
        builtInSystemStateRenderer={SystemStateRendererProbe}
        linkMode="preview"
        routeBase="/pages"
        state={{ status: "ready", tree: sitePageTree("home") }}
        workspaceRenderer={CustomRenderer}
      />,
    );

    expect(html).toContain('data-custom-public-site-renderer="home"');
    expect(html).toContain('data-link-mode="preview"');
    expect(html).toContain('data-route-base="/pages"');
    expect(html).toContain("Custom page home");
    expect(html).not.toContain("data-built-in-public-site-renderer");
  });

  it("selects the explicitly supplied built-in page renderer without a workspace override", () => {
    const html = renderToStaticMarkup(
      <SitePageRouteView
        builtInRenderer={PageRendererProbe}
        builtInSystemStateRenderer={SystemStateRendererProbe}
        state={{ status: "ready", tree: sitePageTree("home") }}
      />,
    );

    expect(html).toContain('data-built-in-public-site-renderer="home"');
    expect(html).toContain('data-link-mode="preview"');
    expect(html).toContain("Built-in page home");
    expect(html).not.toContain("data-custom-public-site-renderer");
  });

  it("keeps loading, not-found, and failure states on the built-in system-state renderer", () => {
    const SystemStateProbe = (props: SitePublicSystemStateRendererProps) => (
      <output
        data-home-href={props.kind === "not-found" ? props.homeHref : undefined}
        data-kind={props.kind}
        data-message={props.kind === "failure" ? props.message : undefined}
        data-slug={props.slug}
      />
    );
    const WorkspaceRenderer = () => <article data-workspace-renderer="page-only" />;

    const loading = renderToStaticMarkup(
      <SitePageRouteView
        builtInRenderer={PageRendererProbe}
        builtInSystemStateRenderer={SystemStateProbe}
        state={{ status: "loading", slug: "home" }}
        workspaceRenderer={WorkspaceRenderer}
      />,
    );
    const notFound = renderToStaticMarkup(
      <SitePageRouteView
        builtInRenderer={PageRendererProbe}
        builtInSystemStateRenderer={SystemStateProbe}
        linkMode="published"
        routeBase="/campaign"
        state={{ status: "not-found", slug: "missing" }}
        workspaceRenderer={WorkspaceRenderer}
      />,
    );
    const failure = renderToStaticMarkup(
      <SitePageRouteView
        builtInRenderer={PageRendererProbe}
        builtInSystemStateRenderer={SystemStateProbe}
        state={{ status: "error", message: "Display-safe failure.", slug: "broken" }}
        workspaceRenderer={WorkspaceRenderer}
      />,
    );

    expect(loading).toContain('data-kind="loading"');
    expect(loading).toContain('data-slug="home"');
    expect(notFound).toContain('data-kind="not-found"');
    expect(notFound).toContain('data-home-href="/campaign"');
    expect(failure).toContain('data-kind="failure"');
    expect(failure).toContain('data-message="Display-safe failure."');
    expect(`${loading}${notFound}${failure}`).not.toContain("data-workspace-renderer");
  });
});

function PageRendererProbe({ linkMode, routeBase, tree }: SitePublicRendererProps) {
  return (
    <article
      data-built-in-public-site-renderer={tree.meta.slug}
      data-link-mode={linkMode}
      data-route-base={routeBase}
    >
      Built-in page {tree.page.label}
    </article>
  );
}

function SystemStateRendererProbe(props: SitePublicSystemStateRendererProps) {
  return <output data-system-state={props.kind} data-slug={props.slug} />;
}

function initialTreeScriptText(tree: SitePageTreeResponse): string {
  const script = renderInitialSitePageTreeScript(tree);
  const start = script.indexOf(">") + 1;
  const end = script.lastIndexOf("</script>");

  return script.slice(start, end);
}

function fakeDocument(textContent: string) {
  return {
    getElementById: (id: string) =>
      id === INITIAL_SITE_PAGE_TREE_SCRIPT_ID ? { textContent } : null,
  };
}

function sitePageTree(slug: string): SitePageTreeResponse {
  return {
    page: {
      id: `rec_site_page_${slug.replaceAll("/", "_")}`,
      type: "page",
      label: slug,
      placements: [],
    },
    frame: {},
    meta: {
      slug,
      generatedAt: "2026-05-12T00:00:00.000Z",
      warnings: [],
    },
    route: {
      kind: "page",
      slug,
    },
  };
}

function readyStateCount(states: readonly SitePageRouteState[]) {
  return states.filter((state) => state.status === "ready").length;
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.href : input.url;
}

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 1000;

  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  throw new Error("Timed out waiting for condition.");
}
