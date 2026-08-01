import {
  parseRecordInstanceDomainMappingApplyEvidenceRequest,
  listInstanceDomainMappings,
  normalizeInstanceDomainHost,
  resolveInstanceDomainMappingProfile,
  type InstanceDomainMapping,
  type InstanceDomainMappingLookupResponse,
  type RecordInstanceDomainMappingApplyEvidenceResponse,
} from "../shared/instance-domain-mappings.ts";
import { nowIsoString } from "../shared/clock.ts";
import { authorizeInstanceWrite, type AuthorityAdminGuardEnv } from "./authority-admin-guard.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import {
  recordInstanceDomainMappingApplyEvidence,
  resetInstanceDomainMappingTables,
} from "./instance-domain-mappings-state.ts";
import { readControlPlaneRecords } from "./deployment-control-plane-client.ts";
import type { StoredRecord } from "@dpeek/formless-storage";

export const INSTANCE_DOMAIN_MAPPINGS_API_PATH = "/api/formless/domain-mappings";
export const INTERNAL_RESET_INSTANCE_DOMAIN_MAPPINGS_PATH =
  "/_internal/reset-instance-domain-mappings";
const INSTANCE_DOMAIN_MAPPINGS_LOOKUP_API_PATH = `${INSTANCE_DOMAIN_MAPPINGS_API_PATH}/lookup`;
const INSTANCE_DOMAIN_MAPPINGS_APPLY_EVIDENCE_API_PATH = `${INSTANCE_DOMAIN_MAPPINGS_API_PATH}/apply-evidence`;

type InstanceDomainMappingsApiEnv = AuthorityAdminGuardEnv & {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
};

export async function handleInstanceDomainMappingsApiRequest(
  request: Request,
  env: InstanceDomainMappingsApiEnv,
): Promise<Response | undefined> {
  if (!isInstanceDomainMappingsApiPath(new URL(request.url).pathname)) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function lookupEnabledInstanceSiteDomainMappingForRequestHost(
  request: Request,
  env: InstanceDomainMappingsApiEnv,
): Promise<InstanceDomainMapping | undefined> {
  return lookupEnabledInstanceDomainMappingForRequestHost(request, env, "publicSite");
}

export async function lookupEnabledInstanceRoutableDomainMappingForRequestHost(
  request: Request,
  env: InstanceDomainMappingsApiEnv,
): Promise<InstanceDomainMapping | undefined> {
  return (
    (await lookupEnabledInstanceDomainMappingForRequestHost(request, env, "instance")) ??
    (await lookupEnabledInstanceDomainMappingForRequestHost(request, env, "publicSite"))
  );
}

async function lookupEnabledInstanceDomainMappingForRequestHost(
  request: Request,
  env: InstanceDomainMappingsApiEnv,
  profile: "instance" | "publicSite",
): Promise<InstanceDomainMapping | undefined> {
  const requestUrl = new URL(request.url);
  const lookupUrl = new URL(INSTANCE_DOMAIN_MAPPINGS_LOOKUP_API_PATH, requestUrl.origin);
  lookupUrl.searchParams.set("host", requestUrl.host);
  lookupUrl.searchParams.set("profile", profile);

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);
  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(lookupUrl, {
      headers: { Accept: "application/json" },
      method: "GET",
    }),
  );

  if (!response.ok) {
    return undefined;
  }

  const body = (await response.json()) as InstanceDomainMappingLookupResponse;

  return body.mapping ?? undefined;
}

export async function handleInstanceDomainMappingsDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceDomainMappingsApiEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (url.pathname === INTERNAL_RESET_INSTANCE_DOMAIN_MAPPINGS_PATH) {
    if (request.method !== "POST") {
      return methodNotAllowedResponse("POST");
    }

    resetInstanceDomainMappingTables(storage);

    return jsonResponse({ reset: true });
  }

  if (!isInstanceDomainMappingsApiPath(url.pathname)) {
    return undefined;
  }

  try {
    if (url.pathname === INSTANCE_DOMAIN_MAPPINGS_APPLY_EVIDENCE_API_PATH) {
      return handleApplyEvidenceRequest(request, storage, env);
    }

    if (url.pathname === INSTANCE_DOMAIN_MAPPINGS_LOOKUP_API_PATH) {
      return await handleLookupRequest(request, storage, env, url);
    }

    return jsonResponse({ error: "Not found." }, 404);
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

async function handleApplyEvidenceRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceDomainMappingsApiEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  const authorization = await authorizeInstanceWrite(request, env);

  if (!authorization.authorized) {
    return jsonResponse(
      { error: authorization.error },
      authorization.status,
      authorization.headers,
    );
  }

  const body = parseRecordInstanceDomainMappingApplyEvidenceRequest(await readJson(request));
  const existingMappings = await readControlPlaneSyncedDomainMappings(storage, env, request.url);
  const result = recordInstanceDomainMappingApplyEvidence(storage, {
    ...body,
    existingMappings,
    now: nowIsoString(),
  });

  if (!result.ok) {
    return jsonResponse(
      {
        error: result.error.message,
        code: result.error.code,
        ...(result.error.field === undefined ? {} : { field: result.error.field }),
      },
      domainMappingFailureStatus(result.error.code),
    );
  }

  const response: RecordInstanceDomainMappingApplyEvidenceResponse = {
    appliedState: result.appliedState,
    appliedStates: result.appliedStates,
    auditEvent: result.auditEvent,
    auditEvents: result.auditEvents,
  };

  return jsonResponse(response);
}

async function handleLookupRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceDomainMappingsApiEnv,
  url: URL,
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowedResponse("GET");
  }

  const host = url.searchParams.get("host");
  const profile = url.searchParams.get("profile") ?? undefined;
  const surface = url.searchParams.get("surface") ?? (profile === undefined ? "site" : undefined);

  if (host === null || host.trim() === "") {
    return jsonResponse({ error: "Domain mapping lookup requires host." }, 400);
  }

  const profileResult = resolveInstanceDomainMappingProfile(
    { profile, surface },
    { defaultProfile: "publicSite" },
  );

  if (!profileResult.ok) {
    return jsonResponse(
      {
        error: profileResult.error.message,
        code: profileResult.error.code,
        ...(profileResult.error.field === undefined ? {} : { field: profileResult.error.field }),
      },
      400,
    );
  }

  const mappings = await readControlPlaneSyncedDomainMappings(storage, env, request.url);
  const response: InstanceDomainMappingLookupResponse = {
    mapping:
      findEnabledDomainMapping(mappings, {
        host,
        profile: profileResult.profile,
      }) ?? null,
  };

  return jsonResponse(response);
}

function isInstanceDomainMappingsApiPath(pathname: string) {
  return (
    pathname === INSTANCE_DOMAIN_MAPPINGS_API_PATH ||
    pathname.startsWith(`${INSTANCE_DOMAIN_MAPPINGS_API_PATH}/`)
  );
}

async function readControlPlaneSyncedDomainMappings(
  _storage: DurableObjectStorage,
  env: InstanceDomainMappingsApiEnv,
  requestUrl: string,
): Promise<InstanceDomainMapping[]> {
  const records = await readControlPlaneRecords({ env, requestUrl });

  if (records === undefined) {
    return [];
  }

  return domainMappingsFromControlPlaneRecords(records);
}

function domainMappingsFromControlPlaneRecords(
  records: readonly StoredRecord[],
): InstanceDomainMapping[] {
  return listInstanceDomainMappings(
    records.flatMap((record) => {
      const mapping = domainMappingFromControlPlaneRecord(record);

      return mapping === undefined ? [] : [mapping];
    }),
  );
}

function domainMappingFromControlPlaneRecord(
  record: StoredRecord,
): InstanceDomainMapping | undefined {
  if (
    record.deletedAt ||
    record.entity !== "route" ||
    record.values.enabled !== true ||
    record.values.kind !== "mount" ||
    typeof record.values.matchHost !== "string" ||
    record.values.targetProfile === "app" ||
    record.values.appInstall !== undefined ||
    record.values.requiredRole !== undefined
  ) {
    return undefined;
  }

  const profile = domainMappingProfileFromRouteTarget(record.values.targetProfile);

  if (profile === undefined) {
    return undefined;
  }

  return {
    host: String(record.values.matchHost),
    profile,
    ...(profile === "publicSite" ? { surface: "site" as const } : {}),
    enabled: true,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function domainMappingProfileFromRouteTarget(
  value: unknown,
): InstanceDomainMapping["profile"] | undefined {
  if (value === "instance") {
    return value;
  }

  if (value === "public-site") {
    return "publicSite";
  }

  return undefined;
}

function findEnabledDomainMapping(
  mappings: readonly InstanceDomainMapping[],
  input: Pick<InstanceDomainMapping, "host" | "profile">,
): InstanceDomainMapping | undefined {
  const hostResult = normalizeInstanceDomainHost(input.host);

  if (!hostResult.ok) {
    throw new Error(hostResult.error.message);
  }

  return mappings.find(
    (mapping) =>
      mapping.enabled && mapping.host === hostResult.host && mapping.profile === input.profile,
  );
}

function domainMappingFailureStatus(code: string) {
  if (
    code === "domain-mapping-enabled" ||
    code === "domain-mapping-has-applied-state" ||
    code === "duplicate-domain-mapping"
  ) {
    return 409;
  }

  if (code === "domain-mapping-not-found") {
    return 404;
  }

  return 400;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function methodNotAllowedResponse(allow: string): Response {
  return jsonResponse({ error: "Method not allowed." }, 405, { Allow: allow });
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);

  if (!responseHeaders.has("Cache-Control")) {
    responseHeaders.set("Cache-Control", "no-store");
  }

  return Response.json(body, {
    status,
    headers: responseHeaders,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Bad request.";
}
