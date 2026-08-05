import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import {
  SitePageRoute,
  readInitialSitePageTree,
  type SitePageRouteState,
} from "@dpeek/formless-site-app/public/react";
import {
  FormlessSitePageRenderer,
  FormlessSiteSystemStateRenderer,
} from "@dpeek/formless-renderer/site/renderer";
import { FORMLESS_SITE_RENDERER_DOCUMENT_THEME } from "@dpeek/formless-renderer/site/provider";
import { sitePublicRenderer as workspaceSitePublicRenderer } from "virtual:formless/site-public-renderer/browser";
import { FORMLESS_PROGRAM_API_ROUTE_PREFIX } from "./program/target.ts";
import {
  FORMLESS_RUNTIME_PROFILE_META_NAME,
  FORMLESS_SITE_ROUTE_BASE_META_NAME,
  FORMLESS_SITE_ROUTE_SLUG_META_NAME,
  FORMLESS_SITE_ROUTE_STATE_META_NAME,
} from "./shared/runtime-topology.ts";
import "@dpeek/formless-renderer/site/global.css";

const app = document.getElementById("app");

if (!app) {
  throw new Error("App root not found.");
}

document.documentElement.setAttribute(
  FORMLESS_SITE_RENDERER_DOCUMENT_THEME.attribute,
  FORMLESS_SITE_RENDERER_DOCUMENT_THEME.value,
);

const runtimeProfile = documentMetaContent(FORMLESS_RUNTIME_PROFILE_META_NAME);
const routeBase = runtimeProfile === "instance" ? previewRouteBase() : undefined;
const slug =
  (routeBase ? documentMetaContent(FORMLESS_SITE_ROUTE_SLUG_META_NAME) : undefined) ??
  normalizeSiteRoutePath(window.location.pathname);
const initialPreviewState = routeBase ? readInitialPreviewState(slug) : undefined;

const appTree = (
  <StrictMode>
    <SitePageRoute
      apiRoutePrefix={FORMLESS_PROGRAM_API_ROUTE_PREFIX}
      builtInRenderer={FormlessSitePageRenderer}
      builtInSystemStateRenderer={FormlessSiteSystemStateRenderer}
      linkMode={routeBase ? "preview" : "published"}
      routeBase={routeBase}
      slug={slug}
      state={initialPreviewState}
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

function previewRouteBase(): `/${string}` | undefined {
  const value = documentMetaContent(FORMLESS_SITE_ROUTE_BASE_META_NAME);

  return value?.startsWith("/") ? (value as `/${string}`) : undefined;
}

function readInitialPreviewState(slug: string): SitePageRouteState | undefined {
  switch (documentMetaContent(FORMLESS_SITE_ROUTE_STATE_META_NAME)) {
    case "found": {
      const tree = readInitialSitePageTree(slug);

      return tree ? { status: "ready", tree } : undefined;
    }
    case "not-found":
      return { status: "not-found", slug };
    case "error":
      return { status: "error", message: "Site page failed to render.", slug };
    default:
      return undefined;
  }
}

function documentMetaContent(name: string): string | undefined {
  const value = document.querySelector(`meta[name="${name}"]`)?.getAttribute("content")?.trim();

  return value || undefined;
}
