import {
  FORMLESS_RUNTIME_PROFILE_META_NAME,
  FORMLESS_SITE_ROUTE_BASE_META_NAME,
  FORMLESS_SITE_ROUTE_SLUG_META_NAME,
  FORMLESS_SITE_ROUTE_STATE_META_NAME,
  runtimeTopologyRoutes,
} from "../shared/runtime-topology.ts";
import {
  type PublicSiteDocumentClientAssets,
  type PublicSiteDocumentRuntimeHint,
  type PublicSiteDocumentTreeResult,
  type PublicSiteIndexingResource,
  type SitePublicRendererComponent,
} from "@dpeek/formless-site-app/worker";
import {
  SITE_PUBLIC_WORKER_READ_KEY,
  SITE_PUBLIC_WORKER_SURFACE_KEY,
  type SitePublicWorkerAdapter,
  type SitePublicWorkerReadDefinition,
  type SitePublicWorkerRuntimeSurface,
  type SitePublicWorkerTreeInput,
} from "@dpeek/formless-site-app/runtime/worker";
import {
  FormlessSitePageRenderer,
  FormlessSiteSystemStateRenderer,
} from "@dpeek/formless-renderer/site/renderer";
import { FORMLESS_SITE_RENDERER_DOCUMENT_THEME } from "@dpeek/formless-renderer/site/provider";
import {
  selectSoleActiveSite,
  type SitePageTree,
  type SitePageTreeProjection,
} from "@dpeek/formless-site-app";
import type { Env } from "./index.ts";
import type { InstanceRuntimeRouteResolution } from "./instance-runtime-routes.ts";
import { getEquivalentRequestForHead, responseWithoutBodyForHead } from "./head-response.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { BootstrapResponse } from "../shared/protocol.ts";
import type {
  ProgramWorkerPublicReadDefinition,
  ProgramWorkerRuntimeDefinition,
} from "../program/composition.ts";
import { programWorkerRuntime } from "../program/compiled/worker.ts";
import {
  FORMLESS_PROGRAM_SCREEN_PATHS,
  isFormlessProgramSurfaceMountRouteTarget,
} from "../program/runtime.ts";
import { SITE_PREVIEW_WORKER_MOUNT_KEY } from "@dpeek/formless-site-app/schema";
import {
  FORMLESS_PROGRAM_API_ROUTE_PREFIX,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
} from "../program/target.ts";
import {
  shouldBlockMappedSiteHostBrowserRoute,
  shouldHandleMappedSiteHostDocument,
  shouldHandleMappedSiteHostIndexingResource,
  shouldHandlePublishedSiteDocument,
  shouldHandlePublishedSiteIndexingResource,
  resolveProgramRouteTargetFromFacts,
  resolveWorkerRuntimeRequestTopology,
  type WorkerRuntimeProfileInput,
  type WorkerRuntimeRequestTopology,
  workerRuntimeProfileInput,
} from "./routing.ts";

export const INTERNAL_PUBLIC_SITE_BOOTSTRAP_PATH = "/_internal/public-site/bootstrap";

export type PublicSiteWorkerRequestOptions = {
  mappedSiteHost?: MappedSiteHost;
  runtimeProfile?: WorkerRuntimeProfileInput;
  runtimeRoute?: InstanceRuntimeRouteResolution;
  runtimeTopology?: WorkerRuntimeRequestTopology;
  workerRuntime?: ProgramWorkerRuntimeDefinition;
  workspaceRenderer?: SitePublicRendererComponent;
};

export type MappedSiteHost = {
  host: string;
};

const viteReactRefreshPreamble = `<script type="module">
import RefreshRuntime from "/@react-refresh";
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
</script>`;
const viteStylexLayerOrderTag = "<style>@layer reset, astryx-base, astryx-theme, product;</style>";
const viteStylexDevelopmentHead = `${viteStylexLayerOrderTag}
    <link rel="stylesheet" href="/virtual:stylex.css" />`;
const developmentClientAssets: PublicSiteDocumentClientAssets = {
  body: `${viteReactRefreshPreamble}
    <script type="module" src="/@id/virtual:stylex:runtime"></script>
    <script type="module" src="${runtimeTopologyRoutes.publicSiteClientModulePath}"></script>`,
  head: viteStylexDevelopmentHead,
};
const developmentStyleAssets: PublicSiteDocumentClientAssets = {
  body: "",
  head: viteStylexDevelopmentHead,
};
const emptyClientAssets: PublicSiteDocumentClientAssets = { body: "", head: "" };

export function programPublicSiteWorkerAdapter(
  runtime: ProgramWorkerRuntimeDefinition = programWorkerRuntime,
  workspaceRenderer?: SitePublicRendererComponent,
): SitePublicWorkerAdapter | undefined {
  return resolveSitePublicWorkerRuntimeSurface(runtime)?.createAdapter({
    builtInRenderer: FormlessSitePageRenderer,
    builtInSystemStateRenderer: FormlessSiteSystemStateRenderer,
    rendererDocumentTheme: FORMLESS_SITE_RENDERER_DOCUMENT_THEME,
    workspaceRenderer,
  });
}

export function readProgramPublicSiteTree(
  input: SitePublicWorkerTreeInput,
  publicReads: readonly ProgramWorkerPublicReadDefinition[],
): SitePageTreeProjection | undefined {
  const definition = publicReads.find(({ key }) => key === SITE_PUBLIC_WORKER_READ_KEY) as
    | SitePublicWorkerReadDefinition
    | undefined;

  return definition?.read(input);
}

export function resolveSitePublicWorkerRuntimeSurface(
  runtime: ProgramWorkerRuntimeDefinition,
  mountKey?: string,
): SitePublicWorkerRuntimeSurface | undefined {
  const surfaceKey =
    mountKey === undefined
      ? SITE_PUBLIC_WORKER_SURFACE_KEY
      : runtime.mounts.find((binding) => binding.mountKey === mountKey)?.surfaceKey;

  if (surfaceKey !== SITE_PUBLIC_WORKER_SURFACE_KEY) {
    return undefined;
  }

  return runtime.surfaces.find(({ key }) => key === surfaceKey)?.surface as
    | SitePublicWorkerRuntimeSurface
    | undefined;
}

export async function handleProgramSitePreviewRequest(
  request: Request,
  env: Env,
  options: PublicSiteWorkerRequestOptions = {},
): Promise<Response | undefined> {
  const topology =
    options.runtimeTopology ??
    resolveWorkerRuntimeRequestTopology(
      request,
      options.runtimeProfile ?? workerRuntimeProfileInput(env.FORMLESS_RUNTIME_PROFILE),
    );

  if (
    !topology.readMethod ||
    !topology.acceptsHtml ||
    topology.apiPath ||
    topology.staticAssetPath
  ) {
    return undefined;
  }

  const route = resolveProgramRouteTargetFromFacts({
    runtimeRoute: options.runtimeRoute,
    topology,
  });

  if (
    !route ||
    !isFormlessProgramSurfaceMountRouteTarget(route) ||
    route.target !== "worker" ||
    route.key !== SITE_PREVIEW_WORKER_MOUNT_KEY
  ) {
    return undefined;
  }

  const runtime = options.workerRuntime ?? programWorkerRuntime;
  const surface = resolveSitePublicWorkerRuntimeSurface(runtime, route.key);
  const adapter = programPublicSiteWorkerAdapter(runtime, options.workspaceRenderer);

  if (!surface || !adapter) {
    return undefined;
  }

  const getRequest = getEquivalentRequestForHead(request);
  const requestUrl = new URL(getRequest.url);
  const slug = surface.normalizeRoutePath(route.pathSuffix);
  const treeResult = await fetchSitePageTreeResult(getRequest, env, slug);
  const response = await adapter.renderDocument({
    clientAssets: await loadClientDocumentAssets(getRequest, env, {
      includeScripts: publicSiteDocumentNeedsClientScripts(treeResult, {
        rendererConfigured: options.workspaceRenderer !== undefined,
      }),
    }),
    documentKind: "preview",
    requestUrl,
    routeBase: route.path,
    runtimeHints: previewSiteRuntimeHints(route.path, slug, treeResult.kind),
    slug,
    treeResult,
  });

  return responseWithoutBodyForHead(request, response);
}

export async function handlePublicSiteIconRequest(
  request: Request,
  env: Env,
  options: PublicSiteWorkerRequestOptions = {},
): Promise<Response | undefined> {
  if (!publicSiteIconRequest(options.runtimeTopology)) {
    return undefined;
  }

  const runtime = options.workerRuntime ?? programWorkerRuntime;
  const surface = resolveSitePublicWorkerRuntimeSurface(runtime);
  const adapter = programPublicSiteWorkerAdapter(runtime, options.workspaceRenderer);

  if (!surface || !adapter) {
    return undefined;
  }

  const getRequest = getEquivalentRequestForHead(request);
  const route = surface.siteIconRouteForPathname(
    options.runtimeTopology?.pathname ?? new URL(request.url).pathname,
  );

  if (!route) {
    return undefined;
  }

  const records = await fetchSiteBootstrapRecords(getRequest, env);
  const selection = records ? selectSoleActiveSite(records) : undefined;

  if (!selection || selection.kind === "unavailable") {
    return responseWithoutBodyForHead(request, publicSiteUnavailableResponse());
  }

  const icon = selection.site.values.icon;

  const response = await adapter.renderIcon({
    request: getRequest,
    route,
    svg: typeof icon === "string" ? icon : undefined,
  });

  return responseWithoutBodyForHead(request, response);
}

export async function handlePublicSiteIndexingRequest(
  request: Request,
  env: Env,
  options: PublicSiteWorkerRequestOptions = {},
): Promise<Response | undefined> {
  if (!publicSiteIndexingRequest(request, env, options)) {
    return undefined;
  }

  const adapter = programPublicSiteWorkerAdapter(
    options.workerRuntime ?? programWorkerRuntime,
    options.workspaceRenderer,
  );

  if (!adapter) {
    return undefined;
  }

  const getRequest = getEquivalentRequestForHead(request);
  const url = new URL(getRequest.url);
  const resource = publicSiteIndexingResourceForPathname(
    options.runtimeTopology?.pathname ?? url.pathname,
  );

  if (!resource) {
    return undefined;
  }

  const records = await fetchSiteBootstrapRecords(getRequest, env);
  const response = adapter.renderIndexing(
    resource === "robots"
      ? {
          origin: url.origin,
          records,
          resource,
        }
      : {
          clientRoutePrefixes: [
            "/schema",
            ...FORMLESS_PROGRAM_SCREEN_PATHS.filter((path) => path !== "/"),
          ] as `/${string}`[],
          origin: url.origin,
          records,
          resource,
        },
  );

  return responseWithoutBodyForHead(request, response);
}

export async function handlePublicSiteDocumentRequest(
  request: Request,
  env: Env,
  options: PublicSiteWorkerRequestOptions = {},
): Promise<Response | undefined> {
  if (options.mappedSiteHost) {
    if (shouldBlockMappedSiteHostBrowserRoute(request, options.runtimeTopology)) {
      return new Response(null, { status: 404 });
    }

    if (!shouldHandleMappedSiteHostDocument(request, options.runtimeTopology)) {
      return undefined;
    }
  } else if (
    !shouldHandlePublishedSiteDocument(
      request,
      options.runtimeTopology ??
        options.runtimeProfile ??
        workerRuntimeProfileInput(env.FORMLESS_RUNTIME_PROFILE),
    )
  ) {
    return undefined;
  }

  const runtime = options.workerRuntime ?? programWorkerRuntime;
  const surface = resolveSitePublicWorkerRuntimeSurface(runtime);
  const adapter = programPublicSiteWorkerAdapter(runtime, options.workspaceRenderer);

  if (!surface || !adapter) {
    return undefined;
  }

  const getRequest = getEquivalentRequestForHead(request);
  const requestUrl = new URL(getRequest.url);
  const slug = surface.normalizeRoutePath(requestUrl.pathname);
  const treeResult = await fetchSitePageTreeResult(getRequest, env, slug);
  const response = await adapter.renderDocument({
    clientAssets: await loadClientDocumentAssets(getRequest, env, {
      includeScripts: publicSiteDocumentNeedsClientScripts(treeResult, {
        rendererConfigured: options.workspaceRenderer !== undefined,
      }),
    }),
    requestUrl,
    runtimeHints: publicSiteRuntimeHints(),
    slug,
    treeResult,
  });

  return responseWithoutBodyForHead(request, response);
}

export function mappedPublicSiteHostFromRuntimeRoute(
  route: InstanceRuntimeRouteResolution | undefined,
): MappedSiteHost | undefined {
  if (
    !route ||
    route.kind !== "mount" ||
    route.targetProfile !== "public-site" ||
    route.surface !== "public-site" ||
    !route.matchHost
  ) {
    return undefined;
  }

  return {
    host: route.matchHost,
  };
}

function publicSiteIconRequest(runtimeTopology?: WorkerRuntimeRequestTopology): boolean {
  return Boolean(runtimeTopology?.readMethod && runtimeTopology.dynamicSiteIconPath);
}

function publicSiteIndexingRequest(
  request: Request,
  env: Env,
  options: PublicSiteWorkerRequestOptions,
): boolean {
  if (options.mappedSiteHost) {
    return shouldHandleMappedSiteHostIndexingResource(request, options.runtimeTopology);
  }

  return shouldHandlePublishedSiteIndexingResource(
    request,
    options.runtimeTopology ??
      options.runtimeProfile ??
      workerRuntimeProfileInput(env.FORMLESS_RUNTIME_PROFILE),
  );
}

async function fetchSitePageTreeResult(
  request: Request,
  env: Env,
  slug: string,
): Promise<PublicSiteDocumentTreeResult> {
  try {
    const response = await fetchAuthorityJson(request, env, `/tree/${encodeURIComponent(slug)}`);

    if (response.status === 404) {
      return { kind: "not-found" };
    }

    if (!response.ok) {
      return { kind: "error" };
    }

    return { kind: "found", tree: (await response.json()) as SitePageTree };
  } catch {
    return { kind: "error" };
  }
}

async function fetchSiteBootstrapRecords(
  request: Request,
  env: Env,
): Promise<StoredRecord[] | undefined> {
  try {
    const authorityId = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_PROGRAM_STORAGE_IDENTITY);
    const authority = env.FORMLESS_AUTHORITY.get(authorityId);
    const url = new URL(INTERNAL_PUBLIC_SITE_BOOTSTRAP_PATH, request.url);

    url.searchParams.set("apiRoutePrefix", FORMLESS_PROGRAM_API_ROUTE_PREFIX);

    const response = await authority.fetch(
      new Request(url, {
        headers: { Accept: "application/json" },
        method: "GET",
      }),
    );

    if (!response.ok) {
      return undefined;
    }

    return ((await response.json()) as BootstrapResponse).records;
  } catch {
    return undefined;
  }
}

async function fetchAuthorityJson(
  request: Request,
  env: Env,
  path: `/${string}`,
): Promise<Response> {
  const authorityId = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_PROGRAM_STORAGE_IDENTITY);
  const authority = env.FORMLESS_AUTHORITY.get(authorityId);
  const url = new URL(`${FORMLESS_PROGRAM_API_ROUTE_PREFIX}${path}`, request.url);

  return authority.fetch(
    new Request(url, {
      headers: { Accept: "application/json" },
      method: "GET",
    }),
  );
}

function publicSiteUnavailableResponse(): Response {
  return new Response("Site unavailable.\n", {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
    status: 503,
  });
}

async function loadClientDocumentAssets(
  request: Request,
  env: Env,
  options: { includeScripts: boolean },
): Promise<PublicSiteDocumentClientAssets> {
  if (!env.ASSETS) {
    return options.includeScripts ? developmentClientAssets : developmentStyleAssets;
  }

  try {
    const manifest = await fetchClientAssetManifest(request, env);

    if (!manifest) {
      return emptyClientAssets;
    }

    return publicSiteClientAssetsFromManifest(manifest, options);
  } catch {
    return emptyClientAssets;
  }
}

type ClientAssetManifest = Record<string, ClientAssetManifestChunk>;

type ClientAssetManifestChunk = {
  css?: string[];
  file: string;
  imports?: string[];
  isEntry?: boolean;
  src?: string;
};

async function fetchClientAssetManifest(
  request: Request,
  env: Env,
): Promise<ClientAssetManifest | undefined> {
  if (!env.ASSETS) {
    return undefined;
  }

  const manifestUrl = new URL(runtimeTopologyRoutes.publicSiteClientAssetManifestPath, request.url);
  const response = await env.ASSETS.fetch(
    new Request(manifestUrl, {
      headers: { Accept: "application/json" },
      method: "GET",
    }),
  );

  if (!response.ok) {
    return undefined;
  }

  return parseClientAssetManifest(await response.json());
}

function parseClientAssetManifest(value: unknown): ClientAssetManifest | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const manifest: ClientAssetManifest = {};

  for (const [key, chunk] of Object.entries(value)) {
    if (!isRecord(chunk) || typeof chunk.file !== "string") {
      continue;
    }

    manifest[key] = {
      file: chunk.file,
      ...(arrayOfStrings(chunk.css) ? { css: chunk.css } : {}),
      ...(arrayOfStrings(chunk.imports) ? { imports: chunk.imports } : {}),
      ...(typeof chunk.isEntry === "boolean" ? { isEntry: chunk.isEntry } : {}),
      ...(typeof chunk.src === "string" ? { src: chunk.src } : {}),
    };
  }

  return manifest;
}

function publicSiteClientAssetsFromManifest(
  manifest: ClientAssetManifest,
  options: { includeScripts: boolean },
): PublicSiteDocumentClientAssets {
  const entry = publicSiteClientManifestEntry(manifest);

  if (!entry) {
    return emptyClientAssets;
  }

  const importedChunks = [...publicSiteClientImportedChunks(entry, manifest)];
  const cssFiles = uniqueStrings([
    ...importedChunks.flatMap((chunk) => chunk.css ?? []),
    ...(entry.css ?? []),
  ]);
  const headTags = [
    ...(cssFiles.length > 0 ? [viteStylexLayerOrderTag] : []),
    ...(options.includeScripts
      ? importedChunks.map((chunk) => modulePreloadTag(assetPath(chunk.file)))
      : []),
    ...cssFiles.map((file) => stylesheetTag(assetPath(file))),
    ...(options.includeScripts ? [moduleScriptTag(assetPath(entry.file))] : []),
  ];

  return headTags.length > 0 ? { body: "", head: headTags.join("\n    ") } : emptyClientAssets;
}

function publicSiteClientManifestEntry(
  manifest: ClientAssetManifest,
): ClientAssetManifestChunk | undefined {
  return (
    manifest[runtimeTopologyRoutes.publicSiteClientManifestEntryKey] ??
    Object.values(manifest).find(
      (chunk) =>
        chunk.isEntry && chunk.src === runtimeTopologyRoutes.publicSiteClientManifestEntryKey,
    )
  );
}

function* publicSiteClientImportedChunks(
  chunk: ClientAssetManifestChunk,
  manifest: ClientAssetManifest,
  seen: Set<string> = new Set(),
): Generator<ClientAssetManifestChunk> {
  for (const key of chunk.imports ?? []) {
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    const imported = manifest[key];

    if (!imported) {
      continue;
    }

    yield* publicSiteClientImportedChunks(imported, manifest, seen);
    yield imported;
  }
}

function publicSiteDocumentNeedsClientScripts(
  treeResult: PublicSiteDocumentTreeResult,
  options: { rendererConfigured: boolean },
): boolean {
  if (options.rendererConfigured || treeResult.kind !== "found") {
    return options.rendererConfigured;
  }

  return (
    siteBlockTreeNeedsClientScripts(treeResult.tree.page) ||
    siteFrameNeedsClientScripts(treeResult.tree)
  );
}

function siteFrameNeedsClientScripts(tree: SitePageTree): boolean {
  return Boolean(tree.frame.header || tree.frame.footer);
}

function siteBlockTreeNeedsClientScripts(block: SitePageTree["page"]): boolean {
  if (block.publicOperation) {
    return true;
  }

  if (block.query?.items.some(siteBlockTreeNeedsClientScripts)) {
    return true;
  }

  return block.placements.some((placement) => siteBlockTreeNeedsClientScripts(placement.block));
}

function modulePreloadTag(href: string): string {
  return `<link rel="modulepreload" crossorigin href="${escapeHtmlAttribute(href)}">`;
}

function stylesheetTag(href: string): string {
  return `<link rel="stylesheet" crossorigin href="${escapeHtmlAttribute(href)}">`;
}

function moduleScriptTag(src: string): string {
  return `<script type="module" crossorigin src="${escapeHtmlAttribute(src)}"></script>`;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function assetPath(file: string): string {
  return `/${file.replace(/^\/+/, "")}`;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrayOfStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function publicSiteRuntimeHints(): PublicSiteDocumentRuntimeHint[] {
  return [
    {
      name: FORMLESS_RUNTIME_PROFILE_META_NAME,
      content: "publishedSite",
    },
  ];
}

function previewSiteRuntimeHints(
  routeBase: `/${string}`,
  slug: string,
  state: PublicSiteDocumentTreeResult["kind"],
): PublicSiteDocumentRuntimeHint[] {
  return [
    {
      name: FORMLESS_RUNTIME_PROFILE_META_NAME,
      content: "instance",
    },
    {
      name: FORMLESS_SITE_ROUTE_BASE_META_NAME,
      content: routeBase,
    },
    {
      name: FORMLESS_SITE_ROUTE_SLUG_META_NAME,
      content: slug,
    },
    {
      name: FORMLESS_SITE_ROUTE_STATE_META_NAME,
      content: state,
    },
  ];
}

function publicSiteIndexingResourceForPathname(
  pathname: string,
): PublicSiteIndexingResource | undefined {
  if (pathname === runtimeTopologyRoutes.publicSiteIndexingResourcePaths[0]) {
    return "robots";
  }

  if (pathname === runtimeTopologyRoutes.publicSiteIndexingResourcePaths[1]) {
    return "sitemap";
  }

  return undefined;
}
