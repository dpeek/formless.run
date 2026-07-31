import type { AppSchema } from "@dpeek/formless-schema";

import { installedAppStorageIdentity } from "../shared/app-storage-identity.ts";
import {
  installedPublicSiteRuntimeTarget,
  programPublicSiteRuntimeTarget,
  type PublicSiteRuntimeTarget,
} from "../shared/public-site-runtime-target.ts";
import {
  findResolvedAppPackage,
  rootKnownPackageFactsResolver,
  type AppPackageResolver,
} from "../shared/app-packages.ts";
import {
  FORMLESS_RUNTIME_APP_INSTALL_ID_META_NAME,
  FORMLESS_RUNTIME_PACKAGE_APP_KEY_META_NAME,
  FORMLESS_RUNTIME_PROFILE_META_NAME,
  runtimeTopologyRoutes,
} from "../shared/runtime-topology.ts";
import {
  createSitePublicWorkerAdapter,
  siteIconRouteForPathname,
  type PublicSiteDocumentClientAssets,
  type PublicSiteDocumentRuntimeHint,
  type PublicSiteDocumentTreeResult,
  type PublicSiteIndexingResource,
  type SiteIconRoute,
  type SitePublicOperationTargetResolver,
} from "@dpeek/formless-site-app/worker";
import {
  FormlessSitePageRenderer,
  FormlessSiteSystemStateRenderer,
} from "@dpeek/formless-renderer/site/renderer";
import { FORMLESS_SITE_RENDERER_DOCUMENT_THEME } from "@dpeek/formless-renderer/site/provider";
import { sitePublicRenderer as workspaceSitePublicRenderer } from "virtual:formless/site-public-renderer/worker";
import { normalizeSiteRoutePath, type SitePageTree } from "@dpeek/formless-site-app";
import { BadRequestError } from "./errors.ts";
import type { Env } from "./index.ts";
import type { InstanceRuntimeRouteResolution } from "./instance-runtime-routes.ts";
import { getEquivalentRequestForHead, responseWithoutBodyForHead } from "./head-response.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { BootstrapResponse } from "../shared/protocol.ts";
import { schemaApps } from "../shared/schema-apps.ts";
import {
  shouldBlockMappedSiteHostBrowserRoute,
  shouldHandleMappedSiteHostDocument,
  shouldHandleMappedSiteHostIndexingResource,
  shouldHandlePublishedSiteDocument,
  shouldHandlePublishedSiteIndexingResource,
  type WorkerRuntimeProfileInput,
  type WorkerRuntimeRequestTopology,
  workerRuntimeProfileInput,
} from "./routing.ts";

export const INTERNAL_PUBLIC_SITE_BOOTSTRAP_PATH = "/_internal/public-site/bootstrap";

export type PublicSiteWorkerTreeInput = {
  records: StoredRecord[];
  schema: AppSchema;
  slug: string;
  publicOperationTargetResolver?: SitePublicOperationTargetResolver;
  target?: { apiRoutePrefix: `/${string}` };
  turnstileSiteKey?: string;
};

export type PublicSiteWorkerRequestOptions = {
  mappedSiteHost?: MappedSiteHost;
  publishedSiteTarget?: PublicSiteRuntimeTarget;
  runtimeProfile?: WorkerRuntimeProfileInput;
  runtimeTopology?: WorkerRuntimeRequestTopology;
};

export type MappedSiteHost = {
  host: string;
  target: PublicSiteRuntimeTarget;
};

export type PublicSiteWorkerAdapter = {
  buildPublicTree(input: PublicSiteWorkerTreeInput): { tree: SitePageTree | null };
  renderDocument(input: {
    clientAssets: PublicSiteDocumentClientAssets;
    requestUrl: URL;
    runtimeHints?: readonly PublicSiteDocumentRuntimeHint[];
    slug: string;
    treeResult: PublicSiteDocumentTreeResult;
  }): Promise<Response>;
  renderIcon(input: { request: Request; route: SiteIconRoute; svg?: string }): Promise<Response>;
  renderIndexing(
    input:
      | {
          origin: string;
          resource: "robots";
        }
      | {
          clientRoutePrefixes: readonly `/${string}`[];
          origin: string;
          records?: StoredRecord[];
          resource: "sitemap";
        },
  ): Response;
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

const sitePublicWorkerAdapter = createSitePublicWorkerAdapter({
  builtInRenderer: FormlessSitePageRenderer,
  builtInSystemStateRenderer: FormlessSiteSystemStateRenderer,
  rendererDocumentTheme: FORMLESS_SITE_RENDERER_DOCUMENT_THEME,
  workspaceRenderer: workspaceSitePublicRenderer,
});
const publicSiteWorkerAdapters = new Map<string, PublicSiteWorkerAdapter>([
  [runtimeTopologyRoutes.publicSitePackageAppKey, sitePublicWorkerAdapter],
]);

export function publicSiteWorkerAdapterForPackageAppKey(
  packageAppKey: string,
  resolver?: AppPackageResolver,
): PublicSiteWorkerAdapter {
  const appPackage = findResolvedAppPackage(packageAppKey, resolver);

  if (!appPackage) {
    throw new UnsupportedPackageCapabilityError(
      `Package app "${packageAppKey}" is not resolved for public Site runtime support.`,
    );
  }

  if (!appPackage.publicRouteBase) {
    throw new UnsupportedPackageCapabilityError(
      `Package app "${packageAppKey}" does not declare public Site runtime support.`,
    );
  }

  const adapter = publicSiteWorkerAdapters.get(appPackage.packageAppKey);

  if (!adapter) {
    throw new UnsupportedPackageCapabilityError(
      `Package app "${packageAppKey}" declares public Site runtime support, but no public Site Worker adapter is registered.`,
    );
  }

  return adapter;
}

export async function handlePublicSiteIconRequest(
  request: Request,
  env: Env,
  options: PublicSiteWorkerRequestOptions & { packageResolver?: AppPackageResolver } = {},
): Promise<Response | undefined> {
  if (!publicSiteIconRequest(options.runtimeTopology)) {
    return undefined;
  }

  const requestTarget = publicSiteRequestTarget(env, options);

  if (requestTarget instanceof Response) {
    return requestTarget;
  }

  const adapter = publicSiteWorkerAdapterForRequestResponse(requestTarget, options);

  if (adapter instanceof Response) {
    return adapter;
  }

  const getRequest = getEquivalentRequestForHead(request);
  const route = siteIconRouteForPathname(
    options.runtimeTopology?.pathname ?? new URL(request.url).pathname,
  );

  if (!route) {
    return undefined;
  }

  const response = await adapter.renderIcon({
    request: getRequest,
    route,
    svg: await fetchAuthoredSiteIconSource(getRequest, env, requestTarget.storageIdentity),
  });

  return responseWithoutBodyForHead(request, response);
}

export async function handlePublicSiteIndexingRequest(
  request: Request,
  env: Env,
  options: PublicSiteWorkerRequestOptions & { packageResolver?: AppPackageResolver } = {},
): Promise<Response | undefined> {
  if (!publicSiteIndexingRequest(request, env, options)) {
    return undefined;
  }

  const requestTarget = publicSiteRequestTarget(env, options);

  if (requestTarget instanceof Response) {
    return requestTarget;
  }

  const adapter = publicSiteWorkerAdapterForRequestResponse(requestTarget, options);

  if (adapter instanceof Response) {
    return adapter;
  }

  const getRequest = getEquivalentRequestForHead(request);
  const url = new URL(getRequest.url);
  const resource = publicSiteIndexingResourceForPathname(
    options.runtimeTopology?.pathname ?? url.pathname,
  );

  if (!resource) {
    return undefined;
  }

  const response = adapter.renderIndexing(
    resource === "robots"
      ? {
          origin: url.origin,
          resource,
        }
      : {
          clientRoutePrefixes: [
            runtimeTopologyRoutes.publicSitePreviewRouteBase,
            "/schema",
            ...schemaApps.map((app) => app.route),
          ],
          origin: url.origin,
          records: await fetchSiteBootstrapRecords(getRequest, env, requestTarget.storageIdentity),
          resource,
        },
  );

  return responseWithoutBodyForHead(request, response);
}

export async function handlePublicSiteDocumentRequest(
  request: Request,
  env: Env,
  options: PublicSiteWorkerRequestOptions & { packageResolver?: AppPackageResolver } = {},
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

  const requestTarget = publicSiteRequestTarget(env, options);

  if (requestTarget instanceof Response) {
    return requestTarget;
  }

  const adapter = publicSiteWorkerAdapterForRequestResponse(requestTarget, options);

  if (adapter instanceof Response) {
    return adapter;
  }

  const getRequest = getEquivalentRequestForHead(request);
  const requestUrl = new URL(getRequest.url);
  const slug = normalizeSiteRoutePath(requestUrl.pathname);
  const treeResult = await fetchSitePageTreeResult(
    getRequest,
    env,
    slug,
    requestTarget.storageIdentity,
  );
  const response = await adapter.renderDocument({
    clientAssets: await loadClientDocumentAssets(getRequest, env, {
      includeScripts: publicSiteDocumentNeedsClientScripts(treeResult, {
        rendererConfigured: workspaceSitePublicRenderer !== undefined,
      }),
    }),
    requestUrl,
    runtimeHints: publicSiteRuntimeHints(requestTarget),
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
    target: route.target
      ? installedPublicSiteRuntimeTarget(route.target)
      : programPublicSiteRuntimeTarget(),
  };
}

export class UnsupportedPackageCapabilityError extends BadRequestError {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedPackageCapabilityError";
  }
}

function publicSiteRequestTarget(
  env: Env,
  options: PublicSiteWorkerRequestOptions & { packageResolver?: AppPackageResolver },
): PublicSiteRuntimeTarget | Response {
  try {
    const target =
      options.mappedSiteHost?.target ??
      options.publishedSiteTarget ??
      publishedSiteTargetFromRuntimeEnv(env, options.packageResolver);

    return target ?? programPublicSiteRuntimeTarget();
  } catch (error) {
    if (error instanceof UnsupportedPackageCapabilityError) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    throw error;
  }
}

function publicSiteWorkerAdapterForRequest(
  target: PublicSiteRuntimeTarget,
  options: PublicSiteWorkerRequestOptions & { packageResolver?: AppPackageResolver },
): PublicSiteWorkerAdapter {
  return publicSiteWorkerAdapterForPackageAppKey(
    target.packageAppKey,
    target.storageIdentity.kind === "program"
      ? rootKnownPackageFactsResolver(options.packageResolver)
      : options.packageResolver,
  );
}

function publicSiteWorkerAdapterForRequestResponse(
  target: PublicSiteRuntimeTarget,
  options: PublicSiteWorkerRequestOptions & { packageResolver?: AppPackageResolver },
): PublicSiteWorkerAdapter | Response {
  try {
    return publicSiteWorkerAdapterForRequest(target, options);
  } catch (error) {
    if (error instanceof UnsupportedPackageCapabilityError) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    throw error;
  }
}

function publishedSiteTargetFromRuntimeEnv(
  env: Env,
  resolver?: AppPackageResolver,
): PublicSiteRuntimeTarget | undefined {
  const installId = stringConfigValue(env.FORMLESS_RUNTIME_APP_INSTALL_ID);
  const packageAppKey = stringConfigValue(env.FORMLESS_RUNTIME_PACKAGE_APP_KEY);

  if (!installId && !packageAppKey) {
    return undefined;
  }

  if (!installId || !packageAppKey) {
    throw new UnsupportedPackageCapabilityError(
      "Published Site runtime target requires both FORMLESS_RUNTIME_APP_INSTALL_ID and FORMLESS_RUNTIME_PACKAGE_APP_KEY.",
    );
  }

  const target = installedAppStorageIdentity({ installId, packageAppKey }, resolver);

  if (!target) {
    throw new UnsupportedPackageCapabilityError(
      `Published Site runtime target "${packageAppKey}/${installId}" is not resolved.`,
    );
  }

  return installedPublicSiteRuntimeTarget(target);
}

function stringConfigValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
  target: PublicSiteRuntimeTarget["storageIdentity"],
): Promise<PublicSiteDocumentTreeResult> {
  try {
    const response = await fetchAuthorityJson(
      request,
      env,
      target,
      `/tree/${encodeURIComponent(slug)}`,
    );

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
  target: PublicSiteRuntimeTarget["storageIdentity"],
): Promise<StoredRecord[] | undefined> {
  try {
    const authorityId = env.FORMLESS_AUTHORITY.idFromName(target.authorityName);
    const authority = env.FORMLESS_AUTHORITY.get(authorityId);
    const url = new URL(INTERNAL_PUBLIC_SITE_BOOTSTRAP_PATH, request.url);

    url.searchParams.set("apiRoutePrefix", target.apiRoutePrefix);

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
  target: PublicSiteRuntimeTarget["storageIdentity"],
  path: `/${string}`,
): Promise<Response> {
  const authorityId = env.FORMLESS_AUTHORITY.idFromName(target.authorityName);
  const authority = env.FORMLESS_AUTHORITY.get(authorityId);
  const url = new URL(`${target.apiRoutePrefix}${path}`, request.url);

  return authority.fetch(
    new Request(url, {
      headers: { Accept: "application/json" },
      method: "GET",
    }),
  );
}

async function fetchAuthoredSiteIconSource(
  request: Request,
  env: Env,
  target: PublicSiteRuntimeTarget["storageIdentity"],
): Promise<string | undefined> {
  const records = await fetchSiteBootstrapRecords(request, env, target);
  const settings = records ? primarySiteSettingsRecord(records) : undefined;
  const icon = settings?.values.icon;

  return typeof icon === "string" ? icon : undefined;
}

function primarySiteSettingsRecord(records: StoredRecord[]): StoredRecord | undefined {
  return records
    .filter(
      (record) => record.entity === "site" && !record.deletedAt && record.values.key === "primary",
    )
    .sort(compareRecords)[0];
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

function publicSiteRuntimeHints(target: PublicSiteRuntimeTarget): PublicSiteDocumentRuntimeHint[] {
  return [
    {
      name: FORMLESS_RUNTIME_PROFILE_META_NAME,
      content: "publishedSite",
    },
    ...(target.storageIdentity.kind === "appInstall"
      ? [
          {
            name: FORMLESS_RUNTIME_APP_INSTALL_ID_META_NAME,
            content: target.storageIdentity.installId,
          },
          {
            name: FORMLESS_RUNTIME_PACKAGE_APP_KEY_META_NAME,
            content: target.packageAppKey,
          },
        ]
      : []),
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

function compareRecords(left: StoredRecord, right: StoredRecord): number {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}
