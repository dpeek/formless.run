import { describe, expect, it } from "vite-plus/test";
import {
  resolveSitePublicRendererComponent,
  type SitePageTree,
  type SitePublicRendererComponent,
  type SitePublicRendererProps,
  type SitePublicRendererRouteFacts,
  type SitePublicRendererSelection,
  type SitePublicSystemStateRendererProps,
} from "@dpeek/formless-site-app";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;

type RequiredKeys<Value> = {
  [Key in keyof Value]-?: object extends Pick<Value, Key> ? never : Key;
}[keyof Value];

const rendererKeysAreExact: Equal<
  keyof SitePublicRendererProps,
  "linkMode" | "routeBase" | "tree"
> = true;
const rendererRequiredKeysAreExact: Equal<
  RequiredKeys<SitePublicRendererProps>,
  "linkMode" | "tree"
> = true;

const tree: SitePageTree = {
  frame: {},
  meta: {
    generatedAt: "2026-07-17T00:00:00.000Z",
    slug: "home",
    warnings: [],
  },
  page: {
    id: "page-home",
    label: "Home",
    placements: [],
    type: "page",
  },
  route: {
    kind: "page",
    slug: "home",
  },
};

const renderSitePage = ({ linkMode, routeBase, tree: pageTree }: SitePublicRendererProps) =>
  `${pageTree.meta.slug}:${linkMode}:${routeBase ?? "root"}`;
const renderer: SitePublicRendererComponent = renderSitePage;
const systemStateContractIsExact: Equal<
  SitePublicSystemStateRendererProps,
  | { kind: "loading"; slug: string }
  | { homeHref: string; kind: "not-found"; slug: string }
  | { kind: "failure"; message: string; slug: string }
> = true;

describe("canonical Site public renderer contract", () => {
  it("is component-shaped with only projection and public route facts", () => {
    expect(rendererKeysAreExact).toBe(true);
    expect(rendererRequiredKeysAreExact).toBe(true);
    expect(renderSitePage({ linkMode: "published", tree })).toBe("home:published:root");
    expect(renderer).toBe(renderSitePage);
    expect(systemStateContractIsExact).toBe(true);
  });

  it("covers preview, authoring, mapped-host, published, and workspace paths", () => {
    const routeFacts = [
      { linkMode: "preview" },
      { linkMode: "authoring" },
      { linkMode: "published" },
      { linkMode: "published", routeBase: "/campaign" },
    ] as const satisfies readonly SitePublicRendererRouteFacts[];
    const workspaceProps = {
      ...routeFacts[3],
      tree,
    } satisfies SitePublicRendererProps;

    expect(routeFacts.map(({ linkMode }) => linkMode)).toEqual([
      "preview",
      "authoring",
      "published",
      "published",
    ]);
    expect(workspaceProps).toEqual({
      linkMode: "published",
      routeBase: "/campaign",
      tree,
    });
  });

  it("requires a built-in page renderer and gives an optional workspace renderer precedence", () => {
    const workspaceRenderer: SitePublicRendererComponent = () => "workspace";
    const builtInSelection = { builtInRenderer: renderer } satisfies SitePublicRendererSelection;
    const workspaceSelection = {
      builtInRenderer: renderer,
      workspaceRenderer,
    } satisfies SitePublicRendererSelection;

    expect(resolveSitePublicRendererComponent(builtInSelection)).toBe(renderer);
    expect(resolveSitePublicRendererComponent(workspaceSelection)).toBe(workspaceRenderer);
  });
});
