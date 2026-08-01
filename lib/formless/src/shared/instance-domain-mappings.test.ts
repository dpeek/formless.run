import { describe, expect, it } from "vite-plus/test";
import {
  buildInstanceDomainMappingAppliedState,
  listInstanceDomainMappings,
  normalizeInstanceDomainHost,
  parseRecordInstanceDomainMappingApplyEvidenceRequest,
  resolveInstanceDomainMappingProfile,
  type InstanceDomainMapping,
} from "./instance-domain-mappings.ts";

const now = "2026-05-26T01:00:00.000Z";

describe("instance domain mapping evidence contracts", () => {
  it("normalizes exact hostnames for route-backed lookup keys", () => {
    expect(normalizeInstanceDomainHost("WWW.Example.COM.:443")).toEqual({
      ok: true,
      host: "www.example.com",
    });
    expect(normalizeInstanceDomainHost("dpeek.com.")).toEqual({
      ok: true,
      host: "dpeek.com",
    });
  });

  it("rejects URLs and invalid hostnames", () => {
    expect(normalizeInstanceDomainHost("https://example.com")).toMatchObject({
      ok: false,
      error: { code: "invalid-host", field: "host" },
    });
    expect(normalizeInstanceDomainHost("bad_host.example.com")).toMatchObject({
      ok: false,
      error: { code: "invalid-host", field: "host" },
    });
  });

  it("keeps legacy Site surface aliases limited to public Site profile resolution", () => {
    expect(resolveInstanceDomainMappingProfile({ surface: "site" })).toEqual({
      ok: true,
      profile: "publicSite",
    });
    expect(resolveInstanceDomainMappingProfile({ profile: "instance", surface: "site" })).toEqual({
      ok: false,
      error: {
        code: "invalid-surface",
        field: "surface",
        message: 'Domain mapping surface compatibility is only valid with profile "publicSite".',
      },
    });
  });

  it("sorts route-derived mappings deterministically", () => {
    const mappings: InstanceDomainMapping[] = [
      mapping({ host: "www.example.com", profile: "publicSite" }),
      mapping({ host: "admin.example.com", profile: "instance" }),
    ];

    expect(listInstanceDomainMappings(mappings)).toEqual([
      mapping({ host: "admin.example.com", profile: "instance" }),
      mapping({ host: "www.example.com", profile: "publicSite" }),
    ]);
  });

  it("builds Cloudflare applied state only for an existing route-derived mapping", () => {
    const result = buildInstanceDomainMappingAppliedState({
      existingMappings: [mapping({ host: "www.example.com", profile: "publicSite" })],
      host: "WWW.Example.COM.",
      profile: "publicSite",
      provider: "cloudflare-worker-custom-domain",
      accountId: "account-123",
      zoneId: "zone-1",
      zoneName: "example.com",
      workerName: "personal-worker",
      workerDomainId: "domain-1",
      action: "created",
      now,
    });

    expect(result).toEqual({
      ok: true,
      appliedState: {
        host: "www.example.com",
        profile: "publicSite",
        surface: "site",
        provider: "cloudflare-worker-custom-domain",
        accountId: "account-123",
        zoneId: "zone-1",
        zoneName: "example.com",
        workerName: "personal-worker",
        workerDomainId: "domain-1",
        action: "created",
        appliedAt: now,
        updatedAt: now,
      },
    });

    expect(
      buildInstanceDomainMappingAppliedState({
        existingMappings: [],
        host: "missing.example.com",
        surface: "site",
        provider: "cloudflare-worker-custom-domain",
        accountId: "account-123",
        zoneId: "zone-1",
        zoneName: "example.com",
        workerName: "personal-worker",
        workerDomainId: "domain-1",
        action: "created",
        now,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "domain-mapping-not-found", field: "host" },
    });
  });

  it("records instance profile applied evidence without a fake install id", () => {
    const result = buildInstanceDomainMappingAppliedState({
      existingMappings: [mapping({ host: "admin.example.com", profile: "instance" })],
      host: "admin.example.com",
      profile: "instance",
      provider: "cloudflare-worker-custom-domain",
      accountId: "account-123",
      zoneId: "zone-1",
      zoneName: "example.com",
      workerName: "personal-worker",
      workerDomainId: "domain-1",
      action: "created",
      now,
    });

    expect(result).toMatchObject({
      ok: true,
      appliedState: {
        host: "admin.example.com",
        profile: "instance",
      },
    });
  });

  it("parses the apply evidence request shape", () => {
    expect(
      parseRecordInstanceDomainMappingApplyEvidenceRequest({
        host: "example.com",
        surface: "site",
        provider: "cloudflare-worker-custom-domain",
        accountId: "account-123",
        zoneId: "zone-1",
        zoneName: "example.com",
        workerName: "personal-worker",
        workerDomainId: "domain-1",
        action: "adopted",
      }),
    ).toEqual({
      host: "example.com",
      surface: "site",
      provider: "cloudflare-worker-custom-domain",
      accountId: "account-123",
      zoneId: "zone-1",
      zoneName: "example.com",
      workerName: "personal-worker",
      workerDomainId: "domain-1",
      action: "adopted",
    });

    expect(() =>
      parseRecordInstanceDomainMappingApplyEvidenceRequest({
        host: "example.com",
      }),
    ).toThrow('Domain mapping apply evidence request must include "provider".');
  });
});

function mapping(input: {
  host: string;
  profile: InstanceDomainMapping["profile"];
}): InstanceDomainMapping {
  return {
    host: input.host,
    profile: input.profile,
    ...(input.profile === "publicSite" ? { surface: "site" as const } : {}),
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}
