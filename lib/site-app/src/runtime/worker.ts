import type { AppSchema, IconDefinitionSchema, KeyedDefinition } from "@dpeek/formless-schema";

import { normalizeSiteRoutePath } from "../route-resolver.ts";
import { buildSitePageTree } from "../tree.ts";
import type { StoredRecord } from "../types.ts";
import {
  createSitePublicWorkerAdapter,
  type SitePublicWorkerAdapter,
  type SitePublicWorkerAdapterOptions,
} from "../worker/adapter.ts";
import { siteIconRouteForPathname } from "../worker/site-icons.ts";
import { SITE_RUNTIME_ENTITY_IDS } from "./entity-ids.ts";
import { SITE_PUBLIC_SURFACE_KEY } from "./index.ts";

export const SITE_PUBLIC_WORKER_READ_KEY = "site.public-tree";
export const SITE_PUBLIC_WORKER_SURFACE_KEY = SITE_PUBLIC_SURFACE_KEY;

export type SitePublicWorkerTreeInput = {
  defaultIcons?: readonly KeyedDefinition<IconDefinitionSchema>[];
  records: StoredRecord[];
  schema: AppSchema;
  slug: string;
  turnstileSiteKey?: string;
};

export type SitePublicWorkerRuntimeSurface = {
  createAdapter(options: SitePublicWorkerAdapterOptions): SitePublicWorkerAdapter;
  normalizeRoutePath(pathname: string): string;
  siteIconRouteForPathname: typeof siteIconRouteForPathname;
};

export const sitePublicWorkerReadDefinition = {
  target: "worker",
  kind: "public-read",
  key: SITE_PUBLIC_WORKER_READ_KEY,
  entityIds: SITE_RUNTIME_ENTITY_IDS,
  read: (input: SitePublicWorkerTreeInput) =>
    buildSitePageTree(input.schema, input.records, input.slug, {
      ...(input.defaultIcons === undefined ? {} : { defaultIcons: input.defaultIcons }),
      turnstileSiteKey: input.turnstileSiteKey,
    }),
} as const;

export const sitePublicWorkerSurfaceDefinition = {
  target: "worker",
  kind: "surface",
  key: SITE_PUBLIC_WORKER_SURFACE_KEY,
  entityIds: SITE_RUNTIME_ENTITY_IDS,
  surface: {
    createAdapter: createSitePublicWorkerAdapter,
    normalizeRoutePath: normalizeSiteRoutePath,
    siteIconRouteForPathname,
  } satisfies SitePublicWorkerRuntimeSurface,
} as const;

export type SitePublicWorkerReadDefinition = typeof sitePublicWorkerReadDefinition;
export type { SitePublicWorkerAdapter, SitePublicWorkerAdapterOptions };
