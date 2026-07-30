import type { ComponentType } from "react";

import type { SitePageLinkMode, SitePublicRouteBase } from "./public-links.ts";
import type { SitePageTree } from "./types.ts";

export type SitePublicRendererRouteFacts = {
  linkMode: SitePageLinkMode;
  routeBase?: SitePublicRouteBase;
};

export type SitePublicRendererProps = SitePublicRendererRouteFacts & {
  tree: SitePageTree;
};

export type SitePublicRendererComponent = ComponentType<SitePublicRendererProps>;

export type SitePublicRendererDocumentTheme = {
  attribute: `data-${string}`;
  value: string;
};

export type SitePublicRendererSelection = {
  builtInRenderer: SitePublicRendererComponent;
  workspaceRenderer?: SitePublicRendererComponent;
};

export function resolveSitePublicRendererComponent({
  builtInRenderer,
  workspaceRenderer,
}: SitePublicRendererSelection): SitePublicRendererComponent {
  return workspaceRenderer ?? builtInRenderer;
}
