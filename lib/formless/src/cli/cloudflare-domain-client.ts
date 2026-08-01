import {
  normalizeInstanceDomainHost,
  type InstanceDomainMappingProfile,
} from "../shared/instance-domain-mappings.ts";

export const CLOUDFLARE_API_TOKEN_ENV_NAME = "CLOUDFLARE_API_TOKEN";
export const CF_API_TOKEN_ENV_NAME = "CF_API_TOKEN";

export type CloudflareDomainPreflightPolicy = "adopt" | "create-only" | "override";

export type CloudflareDomainIntent = {
  host: string;
  profile: InstanceDomainMappingProfile;
};

export type CloudflareZone = {
  id: string;
  name: string;
  status: string;
};

export type CloudflareWorkerDomain = {
  hostname: string;
  id: string;
  service: string;
  zoneId: string;
  zoneName: string;
};

export type CloudflareWorkerRoute = {
  id: string;
  pattern: string;
  script?: string;
};

export type CloudflareDnsRecord = {
  content: string;
  id: string;
  name: string;
  proxied?: boolean;
  type: string;
};

export type CloudflareDomainClient = {
  listActiveZonesForName: (input: { accountId: string; name: string }) => Promise<CloudflareZone[]>;
  listDnsRecords: (input: { name: string; zoneId: string }) => Promise<CloudflareDnsRecord[]>;
  listWorkerDomains: (input: { accountId: string }) => Promise<CloudflareWorkerDomain[]>;
  listWorkerRoutes: (input: { zoneId: string }) => Promise<CloudflareWorkerRoute[]>;
};

export type CloudflareDomainPreflightIssueCode =
  | "apex-domain"
  | "dns-record-conflict"
  | "existing-worker-domain"
  | "missing-zone"
  | "override-worker-domain"
  | "worker-domain-owned-by-other-worker"
  | "worker-route-conflict";

export type CloudflareDomainPreflightIssue = {
  code: CloudflareDomainPreflightIssueCode;
  message: string;
};

export type CloudflareDomainPreflightHostPlan = {
  actions: string[];
  apex: boolean;
  blockers: CloudflareDomainPreflightIssue[];
  dnsRecords: CloudflareDnsRecord[];
  host: string;
  profile: InstanceDomainMappingProfile;
  status: "blocked" | "ready" | "warning";
  warnings: CloudflareDomainPreflightIssue[];
  workerDomains: CloudflareWorkerDomain[];
  workerRoutes: CloudflareWorkerRoute[];
  zone?: CloudflareZone;
};

export type CloudflareDomainPreflightPlan = {
  accountId: string;
  hosts: CloudflareDomainPreflightHostPlan[];
  policy: CloudflareDomainPreflightPolicy;
  workerName: string;
};

const workerCustomDomainDnsConflictTypes = new Set(["A", "AAAA", "CNAME"]);

export type CreateFetchCloudflareDomainClientInput = {
  apiToken: string;
  baseUrl?: string;
  fetch: typeof fetch;
};

export function cloudflareDomainClientFromEnv(input: {
  baseUrl?: string;
  env?: NodeJS.ProcessEnv;
  fetch: typeof fetch;
}): CloudflareDomainClient {
  const apiToken =
    input.env?.[CLOUDFLARE_API_TOKEN_ENV_NAME]?.trim() ??
    input.env?.[CF_API_TOKEN_ENV_NAME]?.trim() ??
    "";

  if (apiToken === "") {
    throw new Error(
      `Formless instance domain plan requires ${CLOUDFLARE_API_TOKEN_ENV_NAME} or ${CF_API_TOKEN_ENV_NAME}.`,
    );
  }

  return createFetchCloudflareDomainClient({
    apiToken,
    ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
    fetch: input.fetch,
  });
}

export function createFetchCloudflareDomainClient(
  input: CreateFetchCloudflareDomainClientInput,
): CloudflareDomainClient {
  const baseUrl = input.baseUrl ?? "https://api.cloudflare.com/client/v4";

  return {
    listActiveZonesForName: ({ accountId, name }) =>
      fetchCloudflareList(input.fetch, baseUrl, input.apiToken, "/zones", {
        "account.id": accountId,
        name,
        status: "active",
      }).then((values) => values.map(parseCloudflareZone)),
    listDnsRecords: ({ name, zoneId }) =>
      fetchCloudflareList(input.fetch, baseUrl, input.apiToken, `/zones/${zoneId}/dns_records`, {
        name,
      }).then((values) => values.map(parseCloudflareDnsRecord)),
    listWorkerDomains: ({ accountId }) =>
      fetchCloudflareList(
        input.fetch,
        baseUrl,
        input.apiToken,
        `/accounts/${accountId}/workers/domains`,
      ).then((values) => values.map(parseCloudflareWorkerDomain)),
    listWorkerRoutes: ({ zoneId }) =>
      fetchCloudflareList(
        input.fetch,
        baseUrl,
        input.apiToken,
        `/zones/${zoneId}/workers/routes`,
      ).then((values) => values.map(parseCloudflareWorkerRoute)),
  };
}

export async function planCloudflareWorkerDomainPreflight(input: {
  accountId: string;
  client: CloudflareDomainClient;
  intents: readonly CloudflareDomainIntent[];
  policy: CloudflareDomainPreflightPolicy;
  workerName: string;
}): Promise<CloudflareDomainPreflightPlan> {
  const intents = normalizeDomainIntents(input.intents);
  const workerDomains =
    intents.length === 0
      ? []
      : await input.client.listWorkerDomains({ accountId: input.accountId });
  const hosts: CloudflareDomainPreflightHostPlan[] = [];
  const routesByZoneId = new Map<string, CloudflareWorkerRoute[]>();

  for (const intent of intents) {
    const zone = await discoverActiveZoneForHost({
      accountId: input.accountId,
      client: input.client,
      host: intent.host,
    });
    const workerDomainsForHost = workerDomains.filter(
      (domain) => normalizeHost(domain.hostname) === intent.host,
    );
    let dnsRecords: CloudflareDnsRecord[] = [];
    let workerRoutes: CloudflareWorkerRoute[] = [];

    if (zone) {
      const cachedRoutes =
        routesByZoneId.get(zone.id) ?? (await input.client.listWorkerRoutes({ zoneId: zone.id }));

      routesByZoneId.set(zone.id, cachedRoutes);
      workerRoutes = cachedRoutes.filter((route) =>
        workerRoutePatternMatchesHost(route.pattern, intent.host),
      );
      dnsRecords = await input.client.listDnsRecords({ name: intent.host, zoneId: zone.id });
    }

    hosts.push(
      buildHostPlan({
        dnsRecords,
        intent,
        policy: input.policy,
        workerDomains: workerDomainsForHost,
        workerName: input.workerName,
        workerRoutes,
        ...(zone === undefined ? {} : { zone }),
      }),
    );
  }

  return {
    accountId: input.accountId,
    hosts,
    policy: input.policy,
    workerName: input.workerName,
  };
}

export function workerRoutePatternMatchesHost(pattern: string, host: string): boolean {
  const normalizedHost = normalizeHost(host);
  const hostPattern = routePatternHost(pattern);

  if (!hostPattern) {
    return false;
  }

  if (hostPattern === normalizedHost) {
    return true;
  }

  if (!hostPattern.includes("*")) {
    return false;
  }

  const matcher = new RegExp(`^${hostPattern.split("*").map(escapeRegExp).join("[^.]*")}$`);

  return matcher.test(normalizedHost);
}

async function discoverActiveZoneForHost(input: {
  accountId: string;
  client: CloudflareDomainClient;
  host: string;
}): Promise<CloudflareZone | undefined> {
  for (const candidate of zoneNameCandidates(input.host)) {
    const zones = await input.client.listActiveZonesForName({
      accountId: input.accountId,
      name: candidate,
    });
    const activeZone = zones.find((zone) => zone.name === candidate && zone.status === "active");

    if (activeZone) {
      return activeZone;
    }
  }

  return undefined;
}

function buildHostPlan(input: {
  dnsRecords: CloudflareDnsRecord[];
  intent: CloudflareDomainIntent;
  policy: CloudflareDomainPreflightPolicy;
  workerDomains: CloudflareWorkerDomain[];
  workerName: string;
  workerRoutes: CloudflareWorkerRoute[];
  zone?: CloudflareZone;
}): CloudflareDomainPreflightHostPlan {
  const blockers: CloudflareDomainPreflightIssue[] = [];
  const warnings: CloudflareDomainPreflightIssue[] = [];
  const actions: string[] = [];
  const apex = input.zone?.name === input.intent.host;

  if (!input.zone) {
    blockers.push({
      code: "missing-zone",
      message: `No active Cloudflare zone was found for ${input.intent.host}.`,
    });
  }

  if (apex) {
    warnings.push({
      code: "apex-domain",
      message: `${input.intent.host} is the zone apex.`,
    });
  }

  addWorkerDomainPolicy({
    actions,
    blockers,
    policy: input.policy,
    warnings,
    workerDomains: input.workerDomains,
    workerName: input.workerName,
  });

  if (input.workerRoutes.length > 0) {
    blockers.push({
      code: "worker-route-conflict",
      message: `${input.intent.host} has matching Worker Routes.`,
    });
  }

  const blockingDnsRecords = input.dnsRecords.filter((record) =>
    workerCustomDomainDnsConflictTypes.has(record.type.toUpperCase()),
  );

  if (blockingDnsRecords.length > 0) {
    blockers.push({
      code: "dns-record-conflict",
      message: `${input.intent.host} has existing DNS records that can conflict with Worker Custom Domain routing.`,
    });
  }

  return {
    actions: blockers.length > 0 ? [] : actions,
    apex,
    blockers,
    dnsRecords: input.dnsRecords,
    host: input.intent.host,
    profile: input.intent.profile,
    status: blockers.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "ready",
    warnings,
    workerDomains: input.workerDomains,
    workerRoutes: input.workerRoutes,
    ...(input.zone === undefined ? {} : { zone: input.zone }),
  };
}

function addWorkerDomainPolicy(input: {
  actions: string[];
  blockers: CloudflareDomainPreflightIssue[];
  policy: CloudflareDomainPreflightPolicy;
  warnings: CloudflareDomainPreflightIssue[];
  workerDomains: CloudflareWorkerDomain[];
  workerName: string;
}) {
  if (input.workerDomains.length === 0) {
    input.actions.push("create-worker-custom-domain");
    return;
  }

  const sameWorker = input.workerDomains.filter((domain) => domain.service === input.workerName);
  const otherWorker = input.workerDomains.filter((domain) => domain.service !== input.workerName);

  if (sameWorker.length > 0 && otherWorker.length === 0) {
    input.actions.push("adopt-existing-worker-custom-domain");
    return;
  }

  if (input.policy === "create-only") {
    input.blockers.push({
      code: "existing-worker-domain",
      message: "Existing Worker Custom Domain blocks create-only policy.",
    });
    return;
  }

  if (otherWorker.length > 0 && input.policy !== "override") {
    input.blockers.push({
      code: "worker-domain-owned-by-other-worker",
      message: "Existing Worker Custom Domain belongs to another Worker.",
    });
    return;
  }

  if (otherWorker.length > 0) {
    input.warnings.push({
      code: "override-worker-domain",
      message: "Existing Worker Custom Domain would be replaced by explicit override.",
    });
    input.actions.push("override-existing-worker-custom-domain");
    return;
  }

  if (sameWorker.length > 0) {
    input.actions.push("adopt-existing-worker-custom-domain");
  }
}

function normalizeDomainIntents(
  intents: readonly CloudflareDomainIntent[],
): CloudflareDomainIntent[] {
  const normalized = intents.map((intent) => {
    const host = normalizeInstanceDomainHost(intent.host);

    if (!host.ok) {
      throw new Error(host.error.message);
    }

    return {
      host: host.host,
      profile: intent.profile,
    };
  });

  return normalized.sort((left, right) => {
    const hostOrder = left.host.localeCompare(right.host);
    const profileOrder = left.profile.localeCompare(right.profile);

    return hostOrder === 0 ? profileOrder : hostOrder;
  });
}

function zoneNameCandidates(host: string): string[] {
  const labels = normalizeHost(host).split(".");
  const candidates: string[] = [];

  for (let index = 0; index <= labels.length - 2; index += 1) {
    candidates.push(labels.slice(index).join("."));
  }

  return candidates;
}

function routePatternHost(pattern: string): string | undefined {
  const withoutScheme = pattern.toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  const [hostPattern] = withoutScheme.split("/");

  if (!hostPattern) {
    return undefined;
  }

  return stripTrailingDots(hostPattern);
}

function normalizeHost(host: string): string {
  return stripTrailingDots(host.trim().toLowerCase());
}

function stripTrailingDots(value: string): string {
  return value.replace(/\.+$/, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fetchCloudflareList(
  fetcher: typeof fetch,
  baseUrl: string,
  apiToken: string,
  pathname: string,
  params: Record<string, string> = {},
): Promise<unknown[]> {
  const result = await fetchCloudflareValue(fetcher, baseUrl, apiToken, "GET", pathname, {
    per_page: "100",
    ...params,
  });

  if (!Array.isArray(result)) {
    throw new Error(`Cloudflare API GET ${pathname} failed: result must be an array.`);
  }

  return result;
}

async function fetchCloudflareValue(
  fetcher: typeof fetch,
  baseUrl: string,
  apiToken: string,
  method: "GET" | "PUT",
  pathname: string,
  params: Record<string, string> = {},
  body?: Record<string, unknown>,
): Promise<unknown> {
  const url = new URL(pathname.replace(/^\/+/, ""), normalizedBaseUrl(baseUrl));

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiToken}`,
  };

  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await fetcher(url.toString(), {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers,
    method,
  });

  return readCloudflareResult(response, `${method} ${url.pathname}`);
}

async function readCloudflareResult(response: Response, context: string): Promise<unknown> {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${context} failed: HTTP ${response.status} ${text}`);
  }

  let value: unknown;

  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${context} failed: response was not JSON.`);
  }

  if (!isRecord(value) || value.success !== true) {
    throw new Error(`${context} failed: ${formatCloudflareErrors(value)}.`);
  }

  return value.result;
}

function formatCloudflareErrors(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.errors) || value.errors.length === 0) {
    return "Cloudflare API returned an unsuccessful response";
  }

  return value.errors
    .map((error) =>
      isRecord(error) && typeof error.message === "string" ? error.message : "unknown error",
    )
    .join(", ");
}

function parseCloudflareZone(value: unknown): CloudflareZone {
  if (!isRecord(value)) {
    throw new Error("Cloudflare zone response is invalid.");
  }

  return {
    id: parseRequiredString(value.id, "Cloudflare zone id"),
    name: parseRequiredString(value.name, "Cloudflare zone name"),
    status: parseRequiredString(value.status, "Cloudflare zone status"),
  };
}

function parseCloudflareWorkerDomain(value: unknown): CloudflareWorkerDomain {
  if (!isRecord(value)) {
    throw new Error("Cloudflare Worker Domain response is invalid.");
  }

  return {
    hostname: parseRequiredString(value.hostname, "Cloudflare Worker Domain hostname"),
    id: parseRequiredString(value.id, "Cloudflare Worker Domain id"),
    service: parseRequiredString(value.service, "Cloudflare Worker Domain service"),
    zoneId: parseRequiredString(value.zone_id, "Cloudflare Worker Domain zone_id"),
    zoneName: parseRequiredString(value.zone_name, "Cloudflare Worker Domain zone_name"),
  };
}

function parseCloudflareWorkerRoute(value: unknown): CloudflareWorkerRoute {
  if (!isRecord(value)) {
    throw new Error("Cloudflare Worker Route response is invalid.");
  }

  const script = parseOptionalString(value.script, "Cloudflare Worker Route script");

  return {
    id: parseRequiredString(value.id, "Cloudflare Worker Route id"),
    pattern: parseRequiredString(value.pattern, "Cloudflare Worker Route pattern"),
    ...(script === undefined ? {} : { script }),
  };
}

function parseCloudflareDnsRecord(value: unknown): CloudflareDnsRecord {
  if (!isRecord(value)) {
    throw new Error("Cloudflare DNS record response is invalid.");
  }

  const proxied = parseOptionalBoolean(value.proxied, "Cloudflare DNS record proxied");

  return {
    content: parseRequiredString(value.content, "Cloudflare DNS record content"),
    id: parseRequiredString(value.id, "Cloudflare DNS record id"),
    name: parseRequiredString(value.name, "Cloudflare DNS record name"),
    ...(proxied === undefined ? {} : { proxied }),
    type: parseRequiredString(value.type, "Cloudflare DNS record type"),
  };
}

function parseRequiredString(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value;
}

function parseOptionalString(value: unknown, context: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return parseRequiredString(value, context);
}

function parseOptionalBoolean(value: unknown, context: string): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`${context} must be a boolean.`);
  }

  return value;
}

function normalizedBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
