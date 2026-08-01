import type {
  DomainProviderCustomDomainResource,
  DomainProviderPlan,
  DomainProviderPlanInput,
  DomainProviderPlanIssue,
  DomainProviderPlanPolicy,
  DomainProviderProfileMappingIntent,
  DomainProviderRedirectIntent,
  DomainProviderRedirectStatusCode,
  DomainProviderResource,
  DomainProviderZone,
} from "./domain-provider-protocol.ts";
import { normalizeInstanceDomainHost } from "./instance-domain-mappings.ts";

export function planDomainProviderResources(input: DomainProviderPlanInput): DomainProviderPlan {
  const instanceId = normalizeDomainProviderLogicalIdPart(input.instanceId, "instance");
  const policy = input.policy ?? "create-only";
  const zones = normalizeZones(input.zones);
  const blockers: DomainProviderPlanIssue[] = [];
  const resources: DomainProviderResource[] = [];
  const profileMappings = enabledProfileMappings(input.mappings);
  const profileHosts = new Set(profileMappings.map((mapping) => mapping.host));
  const redirectIntents = enabledRedirectIntents(input.redirectIntents ?? [], blockers);

  blockers.push(...redirectBlockers(redirectIntents, profileHosts));

  for (const mapping of profileMappings) {
    const zone = findZoneForHost(mapping.host, zones);

    if (!zone) {
      blockers.push({
        code: "missing-zone",
        host: mapping.host,
        message: `No Cloudflare zone was configured for profile host "${mapping.host}".`,
      });
      continue;
    }

    resources.push(
      customDomainResource({
        instanceId,
        mapping,
        policy,
        workerName: input.workerName,
        zone,
      }),
    );
  }

  for (const redirect of redirectIntents) {
    const zone = findZoneForHost(redirect.fromHost, zones);

    if (!zone) {
      blockers.push({
        code: "missing-zone",
        host: redirect.fromHost,
        message: `No Cloudflare zone was configured for redirect host "${redirect.fromHost}".`,
      });
      continue;
    }

    resources.push(
      redirectCustomDomainResource({
        instanceId,
        policy,
        redirect,
        workerName: input.workerName,
        zone,
      }),
    );
  }

  return {
    blockers: sortIssues(blockers),
    instanceId,
    policy,
    resources: resources.sort(compareResources),
    workerName: input.workerName,
  };
}

function enabledProfileMappings(
  mappings: readonly DomainProviderProfileMappingIntent[],
): DomainProviderProfileMappingIntent[] {
  return mappings
    .filter((mapping) => mapping.enabled)
    .map((mapping) => ({
      enabled: true,
      host: normalizeHostOrThrow(mapping.host),
      profile: mapping.profile,
    }))
    .sort((left, right) => compareText(profileMappingSortKey(left), profileMappingSortKey(right)));
}

function enabledRedirectIntents(
  intents: readonly DomainProviderRedirectIntent[],
  blockers: DomainProviderPlanIssue[],
): NormalizedDomainProviderRedirectIntent[] {
  const redirects: NormalizedDomainProviderRedirectIntent[] = [];

  for (const intent of intents) {
    if (intent.enabled === false) {
      continue;
    }

    const normalized = normalizeDomainProviderRedirectIntent(intent);

    if (!normalized.ok) {
      blockers.push(normalized.blocker);
      continue;
    }

    redirects.push(normalized.redirect);
  }

  return redirects.sort((left, right) => compareText(left.fromHost, right.fromHost));
}

export function normalizeDomainProviderRedirectIntent(intent: DomainProviderRedirectIntent):
  | {
      ok: true;
      redirect: NormalizedDomainProviderRedirectIntent;
    }
  | {
      ok: false;
      blocker: DomainProviderPlanIssue;
    } {
  const target = normalizeRedirectTarget(intent);

  if (!target.ok) {
    return target;
  }

  return {
    ok: true,
    redirect: {
      fromHost: normalizeHostOrThrow(intent.fromHost),
      preservePath: intent.preservePath ?? true,
      preserveQueryString: intent.preserveQueryString ?? true,
      statusCode: intent.statusCode ?? 301,
      targetHost: target.host,
      targetUrlBase: target.urlBase,
    },
  };
}

function redirectBlockers(
  redirects: readonly NormalizedDomainProviderRedirectIntent[],
  profileHosts: ReadonlySet<string>,
): DomainProviderPlanIssue[] {
  const blockers: DomainProviderPlanIssue[] = [];
  const seenFromHosts = new Set<string>();
  const edges = new Map<string, string>();

  for (const redirect of redirects) {
    if (profileHosts.has(redirect.fromHost)) {
      blockers.push({
        code: "redirect-from-profile-host",
        host: redirect.fromHost,
        message: `Redirect host "${redirect.fromHost}" is also an enabled profile host.`,
      });
    }

    if (seenFromHosts.has(redirect.fromHost)) {
      blockers.push({
        code: "duplicate-redirect-from-host",
        host: redirect.fromHost,
        message: `Redirect host "${redirect.fromHost}" has more than one redirect intent.`,
      });
    }

    seenFromHosts.add(redirect.fromHost);
    edges.set(redirect.fromHost, redirect.targetHost);
  }

  for (const redirect of redirects) {
    if (redirectCreatesLoop(redirect.fromHost, edges)) {
      blockers.push({
        code: "redirect-loop",
        host: redirect.fromHost,
        message: `Redirect host "${redirect.fromHost}" would create a redirect loop.`,
      });
    }
  }

  return blockers;
}

function customDomainResource(input: {
  instanceId: string;
  mapping: DomainProviderProfileMappingIntent;
  policy: DomainProviderPlanPolicy;
  workerName: string;
  zone: DomainProviderZone;
}): DomainProviderCustomDomainResource {
  const logicalId = domainProviderLogicalResourceId(
    input.instanceId,
    "custom-domain",
    input.mapping.host,
    input.mapping.profile,
  );

  return {
    kind: "cloudflare-worker-custom-domain",
    logicalId,
    host: input.mapping.host,
    profile: input.mapping.profile,
    zone: input.zone,
    props: {
      adopt: input.policy === "adopt" || input.policy === "override",
      name: input.mapping.host,
      overrideExistingOrigin: input.policy === "override",
      workerName: input.workerName,
      zoneId: input.zone.id,
    },
  };
}

function redirectCustomDomainResource(input: {
  instanceId: string;
  policy: DomainProviderPlanPolicy;
  redirect: NormalizedDomainProviderRedirectIntent;
  workerName: string;
  zone: DomainProviderZone;
}): DomainProviderCustomDomainResource {
  const logicalId = domainProviderLogicalResourceId(
    input.instanceId,
    "redirect-custom-domain",
    input.redirect.fromHost,
  );

  return {
    kind: "cloudflare-worker-custom-domain",
    logicalId,
    host: input.redirect.fromHost,
    routeKind: "redirect",
    zone: input.zone,
    props: {
      adopt: input.policy === "adopt" || input.policy === "override",
      name: input.redirect.fromHost,
      overrideExistingOrigin: input.policy === "override",
      workerName: input.workerName,
      zoneId: input.zone.id,
    },
  };
}

function normalizeRedirectTarget(intent: DomainProviderRedirectIntent):
  | {
      ok: true;
      host: string;
      urlBase: string;
    }
  | {
      ok: false;
      blocker: DomainProviderPlanIssue;
    } {
  if (intent.toHost !== undefined && intent.toUrl !== undefined) {
    return invalidRedirectTarget(
      intent.fromHost,
      "Redirect intent must set toHost or toUrl, not both.",
    );
  }

  if (intent.toHost !== undefined) {
    const host = normalizeHostOrThrow(intent.toHost);

    return { ok: true, host, urlBase: `https://${host}` };
  }

  if (intent.toUrl === undefined) {
    return invalidRedirectTarget(intent.fromHost, "Redirect intent must set toHost or toUrl.");
  }

  try {
    const url = new URL(intent.toUrl);

    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.hash !== "" ||
      !normalizeHost(url.hostname)
    ) {
      return invalidRedirectTarget(
        intent.fromHost,
        "Redirect target URL must be an absolute HTTPS URL without credentials or fragment.",
      );
    }

    url.pathname = stripTrailingSlash(url.pathname);
    url.search = "";

    return {
      ok: true,
      host: normalizeHostOrThrow(url.hostname),
      urlBase: url.toString().replace(/\/$/, ""),
    };
  } catch {
    return invalidRedirectTarget(intent.fromHost, "Redirect target URL must be valid.");
  }
}

function invalidRedirectTarget(
  fromHost: string,
  message: string,
): {
  ok: false;
  blocker: DomainProviderPlanIssue;
} {
  return {
    ok: false,
    blocker: {
      code: "invalid-redirect-target",
      host: normalizeHostOrThrow(fromHost),
      message,
    },
  };
}

function redirectCreatesLoop(start: string, edges: ReadonlyMap<string, string>): boolean {
  const seen = new Set<string>();
  let current: string | undefined = start;

  while (current !== undefined) {
    if (seen.has(current)) {
      return current === start;
    }

    seen.add(current);
    current = edges.get(current);
  }

  return false;
}

function findZoneForHost(
  host: string,
  zones: readonly DomainProviderZone[],
): DomainProviderZone | undefined {
  return zones
    .filter((zone) => host === zone.name || host.endsWith(`.${zone.name}`))
    .sort((left, right) => right.name.length - left.name.length)[0];
}

function normalizeZones(zones: readonly DomainProviderZone[]): DomainProviderZone[] {
  return zones
    .map((zone) => ({
      id: zone.id,
      name: normalizeHostOrThrow(zone.name),
    }))
    .sort((left, right) => compareText(left.name, right.name));
}

function normalizeHostOrThrow(value: string): string {
  const result = normalizeInstanceDomainHost(value);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.host;
}

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/\.+$/, "");
}

export function domainProviderLogicalResourceId(
  instanceId: string,
  kind: string,
  host: string,
  ...parts: readonly (string | undefined)[]
): string {
  return [instanceId, kind, host, ...parts]
    .filter((part): part is string => part !== undefined && part !== "")
    .map((part) => normalizeDomainProviderLogicalIdPart(part, "value"))
    .join("-");
}

export function normalizeDomainProviderLogicalIdPart(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized === "" ? fallback : normalized;
}

function profileMappingSortKey(mapping: DomainProviderProfileMappingIntent): string {
  return [mapping.host, mapping.profile].join("\u0000");
}

function compareResources(left: DomainProviderResource, right: DomainProviderResource): number {
  return compareText(
    `${left.kind}\u0000${left.logicalId}`,
    `${right.kind}\u0000${right.logicalId}`,
  );
}

function sortIssues(issues: readonly DomainProviderPlanIssue[]): DomainProviderPlanIssue[] {
  return [...issues].sort((left, right) =>
    compareText(`${left.host ?? ""}\u0000${left.code}`, `${right.host ?? ""}\u0000${right.code}`),
  );
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}

function stripTrailingSlash(value: string): string {
  if (value === "/") {
    return "";
  }

  return value.replace(/\/+$/, "");
}

export type NormalizedDomainProviderRedirectIntent = {
  fromHost: string;
  preservePath: boolean;
  preserveQueryString: boolean;
  statusCode: DomainProviderRedirectStatusCode;
  targetHost: string;
  targetUrlBase: string;
};
