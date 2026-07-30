import {
  resolveSitePublicRendererComponent,
  type SitePublicRendererProps,
  type SitePublicRendererSelection,
} from "../public-renderer.ts";

export type {
  SitePublicRendererComponent,
  SitePublicRendererDocumentTheme,
  SitePublicRendererProps,
  SitePublicRendererRouteFacts,
  SitePublicRendererSelection,
} from "../public-renderer.ts";

export type SitePublicRendererHostProps = SitePublicRendererProps & SitePublicRendererSelection;

export function SitePublicRenderer({
  builtInRenderer,
  workspaceRenderer,
  ...props
}: SitePublicRendererHostProps) {
  const Renderer = resolveSitePublicRendererComponent({ builtInRenderer, workspaceRenderer });

  return <Renderer {...props} />;
}
