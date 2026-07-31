import { describe, expect, it } from "vite-plus/test";

import type {
  DomainProviderProfileMappingIntent,
  DomainProviderRedirectIntent,
} from "./domain-provider-protocol.ts";
import { planDomainProviderResources } from "./domain-provider-planner.ts";

describe("domain provider planner", () => {
  it("turns enabled profile mappings into deterministic Alchemy CustomDomain resources", () => {
    const mappings: DomainProviderProfileMappingIntent[] = [
      {
        enabled: true,
        host: "App.Example.COM.",
        profile: "app",
        targetInstallId: "tasks",
      },
      {
        enabled: false,
        host: "disabled.example.com",
        profile: "instance",
      },
      {
        enabled: true,
        host: "example.com",
        profile: "instance",
      },
      {
        enabled: true,
        host: "www.example.com",
        profile: "publicSite",
      },
      {
        enabled: true,
        host: "legacy.example.com",
        profile: "publicSite",
        targetInstallId: "site",
      },
    ];

    const plan = planDomainProviderResources({
      instanceId: "Primary Instance",
      mappings,
      policy: "override",
      workerName: "formless-prod",
      zones: [{ id: "zone-example", name: "example.com" }],
    });

    expect(plan.blockers).toEqual([]);
    expect(
      plan.resources.map((resource) => ({
        kind: resource.kind,
        logicalId: resource.logicalId,
      })),
    ).toEqual([
      {
        kind: "cloudflare-worker-custom-domain",
        logicalId: "primary-instance-custom-domain-app-example-com-app-tasks",
      },
      {
        kind: "cloudflare-worker-custom-domain",
        logicalId: "primary-instance-custom-domain-example-com-instance",
      },
      {
        kind: "cloudflare-worker-custom-domain",
        logicalId: "primary-instance-custom-domain-www-example-com-publicsite",
      },
    ]);
    expect(plan.resources[0]).toMatchObject({
      host: "app.example.com",
      props: {
        adopt: true,
        name: "app.example.com",
        overrideExistingOrigin: true,
        workerName: "formless-prod",
        zoneId: "zone-example",
      },
    });
  });

  it("turns redirect intents into Worker Custom Domain resources", () => {
    const redirects: DomainProviderRedirectIntent[] = [
      {
        fromHost: "www.example.com",
        toHost: "example.com",
      },
    ];

    const plan = planDomainProviderResources({
      instanceId: "primary",
      mappings: [
        {
          enabled: true,
          host: "example.com",
          profile: "publicSite",
        },
      ],
      redirectIntents: redirects,
      workerName: "formless-prod",
      zones: [{ id: "zone-example", name: "example.com" }],
    });

    expect(plan.blockers).toEqual([]);
    expect(plan.resources).toEqual([
      expect.objectContaining({
        kind: "cloudflare-worker-custom-domain",
        logicalId: "primary-custom-domain-example-com-publicsite",
      }),
      expect.objectContaining({
        host: "www.example.com",
        kind: "cloudflare-worker-custom-domain",
        logicalId: "primary-redirect-custom-domain-www-example-com",
        props: {
          adopt: false,
          name: "www.example.com",
          overrideExistingOrigin: false,
          workerName: "formless-prod",
          zoneId: "zone-example",
        },
        routeKind: "redirect",
      }),
    ]);
  });

  it("reports blockers for redirect conflicts and loops", () => {
    const plan = planDomainProviderResources({
      instanceId: "primary",
      mappings: [
        {
          enabled: true,
          host: "app.example.com",
          profile: "app",
          targetInstallId: "tasks",
        },
      ],
      redirectIntents: [
        {
          fromHost: "app.example.com",
          toHost: "example.com",
        },
        {
          fromHost: "one.example.com",
          toHost: "two.example.com",
        },
        {
          fromHost: "two.example.com",
          toHost: "one.example.com",
        },
      ],
      workerName: "formless-prod",
      zones: [{ id: "zone-example", name: "example.com" }],
    });

    expect(plan.blockers.map((blocker) => [blocker.host, blocker.code])).toEqual([
      ["app.example.com", "redirect-from-profile-host"],
      ["one.example.com", "redirect-loop"],
      ["two.example.com", "redirect-loop"],
    ]);
  });

  it("reports missing zone blockers without discarding other resource intent", () => {
    const plan = planDomainProviderResources({
      instanceId: "primary",
      mappings: [
        {
          enabled: true,
          host: "known.example.com",
          profile: "instance",
        },
        {
          enabled: true,
          host: "unknown.invalid",
          profile: "instance",
        },
      ],
      redirectIntents: [
        {
          fromHost: "redirect.invalid",
          toUrl: "https://known.example.com",
        },
      ],
      workerName: "formless-prod",
      zones: [{ id: "zone-example", name: "example.com" }],
    });

    expect(plan.blockers.map((blocker) => [blocker.host, blocker.code])).toEqual([
      ["redirect.invalid", "missing-zone"],
      ["unknown.invalid", "missing-zone"],
    ]);
    expect(plan.resources).toEqual([
      expect.objectContaining({
        kind: "cloudflare-worker-custom-domain",
        logicalId: "primary-custom-domain-known-example-com-instance",
      }),
    ]);
  });
});
