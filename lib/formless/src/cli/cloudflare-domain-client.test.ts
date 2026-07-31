import { describe, expect, it } from "vite-plus/test";

import {
  createFetchCloudflareDomainClient,
  planCloudflareWorkerDomainPreflight,
  workerRoutePatternMatchesHost,
  type CloudflareDomainClient,
} from "./cloudflare-domain-client.ts";

type CapturedCloudflareRequest = {
  headers: Record<string, string>;
  method: string;
  url: string;
};

describe("Cloudflare domain API client", () => {
  it("uses GET-only Cloudflare endpoints for zones, Worker Domains, Worker Routes, and DNS records", async () => {
    const requests: CapturedCloudflareRequest[] = [];
    const fetcher: typeof fetch = async (url, init) => {
      const requestUrl =
        typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      const parsedUrl = new URL(requestUrl);

      requests.push({
        headers: normalizeHeaders(init?.headers),
        method: init?.method ?? "GET",
        url: requestUrl,
      });

      if (parsedUrl.pathname === "/client/v4/zones") {
        return cloudflareResponse([
          {
            id: "zone-1",
            name: parsedUrl.searchParams.get("name"),
            status: "active",
          },
        ]);
      }

      if (parsedUrl.pathname === "/client/v4/accounts/account-123/workers/domains") {
        return cloudflareResponse([
          {
            hostname: "www.dpeek.com",
            id: "domain-1",
            service: "personal",
            zone_id: "zone-1",
            zone_name: "dpeek.com",
          },
        ]);
      }

      if (parsedUrl.pathname === "/client/v4/zones/zone-1/workers/routes") {
        return cloudflareResponse([
          {
            id: "route-1",
            pattern: "dpeek.com/*",
            script: "old-worker",
          },
        ]);
      }

      if (parsedUrl.pathname === "/client/v4/zones/zone-1/dns_records") {
        return cloudflareResponse([
          {
            content: "192.0.2.10",
            id: "dns-1",
            name: parsedUrl.searchParams.get("name"),
            proxied: true,
            type: "A",
          },
        ]);
      }

      return cloudflareResponse([], false);
    };
    const client = createFetchCloudflareDomainClient({
      apiToken: "token-123",
      baseUrl: "https://api.cloudflare.test/client/v4",
      fetch: fetcher,
    });

    await expect(
      client.listActiveZonesForName({ accountId: "account-123", name: "dpeek.com" }),
    ).resolves.toEqual([{ id: "zone-1", name: "dpeek.com", status: "active" }]);
    await expect(client.listWorkerDomains({ accountId: "account-123" })).resolves.toEqual([
      {
        hostname: "www.dpeek.com",
        id: "domain-1",
        service: "personal",
        zoneId: "zone-1",
        zoneName: "dpeek.com",
      },
    ]);
    await expect(client.listWorkerRoutes({ zoneId: "zone-1" })).resolves.toEqual([
      {
        id: "route-1",
        pattern: "dpeek.com/*",
        script: "old-worker",
      },
    ]);
    await expect(client.listDnsRecords({ name: "dpeek.com", zoneId: "zone-1" })).resolves.toEqual([
      {
        content: "192.0.2.10",
        id: "dns-1",
        name: "dpeek.com",
        proxied: true,
        type: "A",
      },
    ]);

    expect(requests.map((request) => request.method)).toEqual(["GET", "GET", "GET", "GET"]);
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer token-123",
      "Bearer token-123",
      "Bearer token-123",
      "Bearer token-123",
    ]);
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/client/v4/zones",
      "/client/v4/accounts/account-123/workers/domains",
      "/client/v4/zones/zone-1/workers/routes",
      "/client/v4/zones/zone-1/dns_records",
    ]);
  });

  it("builds a dry-run preflight plan with domain, route, DNS, and apex findings", async () => {
    const plan = await planCloudflareWorkerDomainPreflight({
      accountId: "account-123",
      client: fakeCloudflareDomainClient(),
      intents: [
        { host: "dpeek.com", profile: "publicSite" },
        { host: "www.dpeek.com", profile: "publicSite" },
      ],
      policy: "create-only",
      workerName: "personal",
    });

    expect(plan.hosts.map((host) => host.host)).toEqual(["dpeek.com", "www.dpeek.com"]);
    expect(plan.hosts[0]).toMatchObject({
      actions: [],
      apex: true,
      status: "blocked",
      zone: { id: "zone-1", name: "dpeek.com", status: "active" },
    });
    expect(plan.hosts[0]?.blockers.map((issue) => issue.code)).toEqual([
      "worker-route-conflict",
      "dns-record-conflict",
    ]);
    expect(plan.hosts[0]?.warnings.map((issue) => issue.code)).toEqual(["apex-domain"]);
    expect(plan.hosts[1]).toMatchObject({
      actions: ["adopt-existing-worker-custom-domain"],
      apex: false,
      status: "ready",
      workerDomains: [{ hostname: "www.dpeek.com", service: "personal" }],
    });
    expect(plan.hosts[1]?.blockers.map((issue) => issue.code)).toEqual([]);
  });

  it("allows apex Worker Custom Domains to coexist with mail and verification DNS records", async () => {
    const plan = await planCloudflareWorkerDomainPreflight({
      accountId: "account-123",
      client: {
        ...fakeCloudflareDomainClient(),
        listDnsRecords: async ({ name }) =>
          name === "dpeek.com"
            ? [
                {
                  content: "mx01.mail.icloud.com",
                  id: "dns-mx-1",
                  name: "dpeek.com",
                  type: "MX",
                },
                {
                  content: '"apple-domain=sZpGHsJrm1GKJi0w"',
                  id: "dns-txt-1",
                  name: "dpeek.com",
                  type: "TXT",
                },
                {
                  content: '"google-site-verification=example"',
                  id: "dns-txt-2",
                  name: "dpeek.com",
                  type: "TXT",
                },
              ]
            : [],
        listWorkerRoutes: async () => [],
      },
      intents: [{ host: "dpeek.com", profile: "publicSite" }],
      policy: "create-only",
      workerName: "personal",
    });

    expect(plan.hosts[0]).toMatchObject({
      actions: ["create-worker-custom-domain"],
      apex: true,
      dnsRecords: [
        { type: "MX", content: "mx01.mail.icloud.com" },
        { type: "TXT", content: '"apple-domain=sZpGHsJrm1GKJi0w"' },
        { type: "TXT", content: '"google-site-verification=example"' },
      ],
      status: "warning",
    });
    expect(plan.hosts[0]?.blockers.map((issue) => issue.code)).toEqual([]);
    expect(plan.hosts[0]?.warnings.map((issue) => issue.code)).toEqual(["apex-domain"]);
  });

  it("plans explicit override host actions without mutating Cloudflare", async () => {
    const plan = await planCloudflareWorkerDomainPreflight({
      accountId: "account-123",
      client: {
        ...fakeCloudflareDomainClient(),
        listDnsRecords: async () => [],
        listWorkerDomains: async () => [
          {
            hostname: "old.dpeek.com",
            id: "domain-old",
            service: "old-worker",
            zoneId: "zone-1",
            zoneName: "dpeek.com",
          },
        ],
        listWorkerRoutes: async () => [],
      },
      intents: [{ host: "old.dpeek.com", profile: "publicSite" }],
      policy: "override",
      workerName: "personal",
    });

    expect(plan.hosts[0]).toMatchObject({
      actions: ["override-existing-worker-custom-domain"],
      status: "warning",
      warnings: [{ code: "override-worker-domain" }],
    });
  });

  it("matches exact and wildcard Worker Route host patterns conservatively", () => {
    expect(workerRoutePatternMatchesHost("dpeek.com/*", "dpeek.com")).toBe(true);
    expect(workerRoutePatternMatchesHost("https://dpeek.com/blog/*", "dpeek.com")).toBe(true);
    expect(workerRoutePatternMatchesHost("*.dpeek.com/*", "www.dpeek.com")).toBe(true);
    expect(workerRoutePatternMatchesHost("*.dpeek.com/*", "dpeek.com")).toBe(false);
    expect(workerRoutePatternMatchesHost("api.dpeek.com/*", "www.dpeek.com")).toBe(false);
  });
});

function fakeCloudflareDomainClient(): CloudflareDomainClient {
  return {
    listActiveZonesForName: async ({ name }) =>
      name === "dpeek.com" ? [{ id: "zone-1", name: "dpeek.com", status: "active" }] : [],
    listDnsRecords: async ({ name }) =>
      name === "dpeek.com"
        ? [
            {
              content: "192.0.2.10",
              id: "dns-1",
              name: "dpeek.com",
              type: "A",
            },
          ]
        : [],
    listWorkerDomains: async () => [
      {
        hostname: "www.dpeek.com",
        id: "domain-1",
        service: "personal",
        zoneId: "zone-1",
        zoneName: "dpeek.com",
      },
    ],
    listWorkerRoutes: async ({ zoneId }) =>
      zoneId === "zone-1"
        ? [
            {
              id: "route-1",
              pattern: "dpeek.com/*",
              script: "old-worker",
            },
          ]
        : [],
  };
}

function cloudflareResponse(result: unknown, success = true): Response {
  return Response.json({
    errors: success ? [] : [{ message: "not found" }],
    result,
    success,
  });
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return headers;
}
