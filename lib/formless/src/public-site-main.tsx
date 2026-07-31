import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { SitePageRoute } from "@dpeek/formless-site-app/public/react";
import {
  FormlessSitePageRenderer,
  FormlessSiteSystemStateRenderer,
} from "@dpeek/formless-renderer/site/renderer";
import { FORMLESS_SITE_RENDERER_DOCUMENT_THEME } from "@dpeek/formless-renderer/site/provider";
import { sitePublicRenderer as workspaceSitePublicRenderer } from "virtual:formless/site-public-renderer/browser";
import { FORMLESS_PROGRAM_API_ROUTE_PREFIX } from "./program/target.ts";
import "@dpeek/formless-renderer/site/global.css";

const app = document.getElementById("app");

if (!app) {
  throw new Error("App root not found.");
}

document.documentElement.setAttribute(
  FORMLESS_SITE_RENDERER_DOCUMENT_THEME.attribute,
  FORMLESS_SITE_RENDERER_DOCUMENT_THEME.value,
);

const appTree = (
  <StrictMode>
    <SitePageRoute
      apiRoutePrefix={FORMLESS_PROGRAM_API_ROUTE_PREFIX}
      builtInRenderer={FormlessSitePageRenderer}
      builtInSystemStateRenderer={FormlessSiteSystemStateRenderer}
      linkMode="published"
      slug={normalizeSiteRoutePath(window.location.pathname)}
      workspaceRenderer={workspaceSitePublicRenderer}
    />
  </StrictMode>
);

if (app.hasChildNodes()) {
  hydrateRoot(app, appTree);
} else {
  createRoot(app).render(appTree);
}

function normalizeSiteRoutePath(slug: string): string {
  const trimmed = slug.trim().replace(/^\/+/, "").replace(/\/+$/, "");

  return trimmed === "" ? "home" : trimmed;
}
