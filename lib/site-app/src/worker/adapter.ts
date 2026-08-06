import type { AppSchema } from "@dpeek/formless-schema";

import type {
  SitePublicRendererComponent,
  SitePublicRendererDocumentTheme,
} from "../public-renderer.ts";
import type { SitePublicSystemStateRendererComponent } from "../public-system-state.ts";
import { buildSitePageTree } from "../tree.ts";
import type { SitePageTreeProjection, StoredRecord } from "../types.ts";
import {
  renderPublishedSiteDocumentResponse,
  type PublicSiteDocumentRenderInput,
  type PublicSiteDocumentRenderResponse,
} from "./site-ssr.tsx";
import { renderSiteIconResponse, type PublicSiteIconRenderInput } from "./site-icons.ts";
import {
  renderPublishedSiteIndexingResponse,
  type PublicSiteIndexingRenderInput,
} from "./public-indexing.ts";

type PublicSiteWorkerTreeInput = {
  records: StoredRecord[];
  schema: AppSchema;
  slug: string;
  turnstileSiteKey?: string;
};

export type SitePublicWorkerAdapter = {
  buildPublicTree(input: PublicSiteWorkerTreeInput): SitePageTreeProjection;
  renderDocument(
    input: SitePublicWorkerDocumentRenderInput,
  ): Promise<PublicSiteDocumentRenderResponse>;
  renderIcon(input: PublicSiteIconRenderInput): Promise<Response>;
  renderIndexing(input: PublicSiteIndexingRenderInput): Response;
};

export type SitePublicWorkerDocumentRenderInput = Omit<
  PublicSiteDocumentRenderInput,
  "builtInRenderer" | "builtInSystemStateRenderer" | "rendererDocumentTheme" | "workspaceRenderer"
>;

export type SitePublicWorkerAdapterOptions = {
  builtInRenderer: SitePublicRendererComponent;
  builtInSystemStateRenderer: SitePublicSystemStateRendererComponent;
  rendererDocumentTheme: SitePublicRendererDocumentTheme;
  workspaceRenderer?: SitePublicRendererComponent;
};

export function createSitePublicWorkerAdapter(
  options: SitePublicWorkerAdapterOptions,
): SitePublicWorkerAdapter {
  return {
    buildPublicTree(input) {
      return buildSitePageTree(input.schema, input.records, input.slug, {
        turnstileSiteKey: input.turnstileSiteKey,
      });
    },
    async renderDocument(input) {
      return renderPublishedSiteDocumentResponse({
        ...input,
        builtInRenderer: options.builtInRenderer,
        builtInSystemStateRenderer: options.builtInSystemStateRenderer,
        rendererDocumentTheme: options.rendererDocumentTheme,
        workspaceRenderer: options.workspaceRenderer,
      });
    },
    async renderIcon(input) {
      return renderSiteIconResponse(input);
    },
    renderIndexing(input) {
      return renderPublishedSiteIndexingResponse(input);
    },
  };
}
