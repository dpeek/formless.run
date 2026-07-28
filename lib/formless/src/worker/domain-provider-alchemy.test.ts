import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { describe, expect, it } from "vite-plus/test";
import type { DeployResourceGraph } from "@dpeek/formless-deploy";

import { planDomainProviderResources } from "../shared/domain-provider-planner.ts";
import {
  type AlchemyDomainProviderFactories,
  type AlchemyDomainProviderRunner,
  runAlchemyDeployResourceGraph,
  runAlchemyDomainProviderPlan,
} from "./domain-provider-alchemy.ts";
describe("Alchemy domain provider adapter", () => {
  it("runs planned resources through injected Alchemy factories and state store", async () => {
    const calls: Array<{
      id: string;
      kind: string;
      props: unknown;
    }> = [];
    const runnerCalls: Array<{
      appName: string;
      options: unknown;
    }> = [];
    const stateStore = () => {
      throw new Error("The fake state store is only passed through.");
    };
    const runner: AlchemyDomainProviderRunner = async (appName, options, apply) => {
      runnerCalls.push({ appName, options });

      return apply();
    };
    const factories: AlchemyDomainProviderFactories = {
      CustomDomain: async (id, props) => {
        calls.push({ id, kind: "CustomDomain", props });

        return {
          ...props,
          createdAt: 1,
          environment: "production",
          id: "domain-output",
          updatedAt: 2,
        };
      },
      DnsRecords: async (id, props) => {
        calls.push({ id, kind: "DnsRecords", props });

        return { ...props, records: [] };
      },
    };
    const plan = planDomainProviderResources({
      instanceId: "primary",
      mappings: [
        {
          enabled: true,
          host: "example.com",
          profile: "instance",
        },
      ],
      redirectIntents: [{ fromHost: "www.example.com", toHost: "example.com" }],
      workerName: "formless-prod",
      zones: [{ id: "zone-example", name: "example.com" }],
    });

    const result = await runAlchemyDomainProviderPlan({
      factories,
      plan,
      runner,
      stateStore,
    });

    expect(runnerCalls).toEqual([
      {
        appName: "formless-domain-primary",
        options: {
          noTrack: true,
          phase: "up",
          quiet: true,
          stage: "production",
          stateStore,
        },
      },
    ]);
    expect(calls.map((call) => [call.kind, call.id])).toEqual([
      ["CustomDomain", "primary-custom-domain-example-com-instance"],
      ["CustomDomain", "primary-redirect-custom-domain-www-example-com"],
    ]);
    expect(result.resources.map((resource) => resource.kind)).toEqual([
      "cloudflare-worker-custom-domain",
      "cloudflare-worker-custom-domain",
    ]);
  });

  it("does not call Alchemy factories for blocked plans", async () => {
    const runner: AlchemyDomainProviderRunner = async (_appName, _options, apply) => apply();
    const factories = throwingFactories();
    const plan = planDomainProviderResources({
      instanceId: "primary",
      mappings: [
        {
          enabled: true,
          host: "unknown.invalid",
          profile: "instance",
        },
      ],
      workerName: "formless-prod",
      zones: [],
    });

    await expect(
      runAlchemyDomainProviderPlan({
        factories,
        plan,
        runner,
      }),
    ).rejects.toThrow("Domain provider plan has blockers: missing-zone.");
  });
  it("converts deployment resource graphs through tracked Alchemy declarations and evidence", async () => {
    const calls: Array<{
      id: string;
      kind: string;
      props: unknown;
    }> = [];
    const runnerCalls: Array<{
      appName: string;
      options: Record<string, unknown>;
    }> = [];
    const runner: AlchemyDomainProviderRunner = async (appName, options, apply) => {
      runnerCalls.push({ appName, options: options as Record<string, unknown> });
      return apply();
    };
    const factories: AlchemyDomainProviderFactories = {
      CustomDomain: async (id, props) => {
        calls.push({ id, kind: "CustomDomain", props });

        return {
          ...props,
          createdAt: 1,
          environment: "production",
          id: "custom-domain-output",
          updatedAt: 2,
          zoneId: props.zoneId ?? "zone-example",
        };
      },
      DnsRecords: async (id, props) => {
        calls.push({ id, kind: "DnsRecords", props });

        return {
          zoneId: props.zoneId,
          records: props.records.map((record, index) => ({
            ...record,
            id: `dns-output-${index}`,
          })),
        } as Awaited<ReturnType<AlchemyDomainProviderFactories["DnsRecords"]>>;
      },
    };
    const resourceGraph: DeployResourceGraph = {
      targetId: "instance.primary",
      resources: [
        {
          dependencies: [],
          inputs: {
            records: [
              {
                content: "192.0.2.1",
                name: "dns.example.com",
                proxied: true,
                ttl: 1,
                type: "A",
              },
            ],
          },
          kind: "cloudflare-dns-records",
          logicalId: "primary-dns-dns-example-com",
          providerFamily: "cloudflare",
          targetId: "instance.primary",
        },
        {
          dependencies: [],
          inputs: {
            adopt: false,
            host: "www.example.com",
            name: "www.example.com",
            overrideExistingOrigin: false,
            workerName: "formless-prod",
          },
          kind: "cloudflare-worker-custom-domain",
          logicalId: "primary-redirect-custom-domain-www-example-com",
          providerFamily: "cloudflare",
          targetId: "instance.primary",
        },
        {
          dependencies: [],
          inputs: {
            adopt: false,
            host: "app.example.com",
            name: "app.example.com",
            overrideExistingOrigin: false,
            profile: "publicSite",
            targetInstallId: "site",
            workerName: "formless-prod",
          },
          kind: "cloudflare-worker-custom-domain",
          logicalId: "primary-custom-domain-app-example-com-publicsite-site",
          providerFamily: "cloudflare",
          targetId: "instance.primary",
        },
      ],
    };

    const result = await runAlchemyDeployResourceGraph({
      adopt: true,
      factories,
      password: "alchemy-password",
      resolveZoneIdForHost: ({ host }) =>
        host.endsWith("example.com") ? "zone-example" : undefined,
      resourceGraph,
      rootDir: "/state",
      runner,
      stage: "personal",
    });

    expect(runnerCalls).toEqual([
      {
        appName: "formless-deployment-instance-primary",
        options: {
          adopt: true,
          password: "alchemy-password",
          phase: "up",
          quiet: true,
          rootDir: "/state",
          stage: "personal",
        },
      },
    ]);
    expect(runnerCalls[0]?.options).not.toHaveProperty("noTrack");
    expect(calls.map((call) => [call.kind, call.id])).toEqual([
      ["DnsRecords", "primary-dns-dns-example-com"],
      ["CustomDomain", "primary-redirect-custom-domain-www-example-com"],
      ["CustomDomain", "primary-custom-domain-app-example-com-publicsite-site"],
    ]);
    expect(calls[0]?.props).toMatchObject({ zoneId: "zone-example" });
    expect(calls[1]?.props).toMatchObject({
      adopt: true,
      name: "www.example.com",
      workerName: "formless-prod",
    });
    expect(calls[2]?.props).toMatchObject({
      adopt: true,
      name: "app.example.com",
      workerName: "formless-prod",
    });
    expect(result.evidence).toEqual([
      {
        action: "updated",
        alchemyResourceId: "primary-dns-dns-example-com",
        displayName: "dns.example.com",
        kind: "cloudflare-dns-records",
        logicalId: "primary-dns-dns-example-com",
        providerFamily: "cloudflare",
        providerResourceIds: ["dns-output-0"],
        targetId: "instance.primary",
      },
      {
        action: "updated",
        alchemyResourceId: "primary-redirect-custom-domain-www-example-com",
        displayName: "www.example.com",
        kind: "cloudflare-worker-custom-domain",
        logicalId: "primary-redirect-custom-domain-www-example-com",
        providerFamily: "cloudflare",
        providerResourceIds: ["custom-domain-output"],
        targetId: "instance.primary",
      },
      {
        action: "updated",
        alchemyResourceId: "primary-custom-domain-app-example-com-publicsite-site",
        displayName: "app.example.com",
        kind: "cloudflare-worker-custom-domain",
        logicalId: "primary-custom-domain-app-example-com-publicsite-site",
        providerFamily: "cloudflare",
        providerResourceIds: ["custom-domain-output"],
        targetId: "instance.primary",
      },
    ]);
  });
  it("omits removed route resources from the next tracked deploy run", async () => {
    const destroyed: Array<{
      appName: string;
      logicalId: string;
      stage: string;
    }> = [];
    const declaredByRun: string[][] = [];
    const trackedResourcesByScope = new Map<string, Set<string>>();
    let currentDeclarationIds: string[] = [];
    const declare = (id: string) => {
      currentDeclarationIds.push(id);
    };
    const runner: AlchemyDomainProviderRunner = async (appName, options, apply) => {
      currentDeclarationIds = [];
      const result = await apply();
      const stage = options.stage ?? "production";
      const scope = `${appName}:${stage}`;
      const previous = trackedResourcesByScope.get(scope) ?? new Set<string>();
      const next = new Set(currentDeclarationIds);

      for (const logicalId of previous) {
        if (!next.has(logicalId)) {
          destroyed.push({ appName, logicalId, stage });
        }
      }

      declaredByRun.push([...currentDeclarationIds]);
      trackedResourcesByScope.set(scope, next);

      return result;
    };
    const factories: AlchemyDomainProviderFactories = {
      CustomDomain: async (id, props) => {
        declare(id);

        return {
          ...props,
          createdAt: 1,
          environment: "production",
          id: `${id}-provider-id`,
          updatedAt: 2,
        };
      },
      DnsRecords: async (id, props) => {
        declare(id);

        return {
          records: props.records.map((record, index) => ({
            ...record,
            id: `${id}-record-${index}`,
          })),
          zoneId: props.zoneId,
        } as Awaited<ReturnType<AlchemyDomainProviderFactories["DnsRecords"]>>;
      },
    };
    const routeResources: DeployResourceGraph = {
      targetId: "instance.primary",
      resources: [
        {
          dependencies: [],
          inputs: {
            host: "old.example.com",
            name: "old.example.com",
            workerName: "formless-prod",
            zoneId: "zone-example",
          },
          kind: "cloudflare-worker-custom-domain",
          logicalId: "primary-redirect-custom-domain-old-example-com",
          providerFamily: "cloudflare",
          targetId: "instance.primary",
        },
        {
          dependencies: [],
          inputs: {
            host: "app.example.com",
            name: "app.example.com",
            workerName: "formless-prod",
            zoneId: "zone-example",
          },
          kind: "cloudflare-worker-custom-domain",
          logicalId: "primary-custom-domain-app-example-com-instance",
          providerFamily: "cloudflare",
          targetId: "instance.primary",
        },
      ],
    };
    const afterRouteRemoval: DeployResourceGraph = {
      ...routeResources,
      resources: routeResources.resources.filter(
        (resource) => resource.logicalId !== "primary-redirect-custom-domain-old-example-com",
      ),
    };

    await runAlchemyDeployResourceGraph({
      factories,
      resourceGraph: routeResources,
      runner,
      stage: "personal",
    });
    const result = await runAlchemyDeployResourceGraph({
      factories,
      resourceGraph: afterRouteRemoval,
      runner,
      stage: "personal",
    });

    expect(declaredByRun).toEqual([
      [
        "primary-redirect-custom-domain-old-example-com",
        "primary-custom-domain-app-example-com-instance",
      ],
      ["primary-custom-domain-app-example-com-instance"],
    ]);
    expect(destroyed).toEqual([
      {
        appName: "formless-deployment-instance-primary",
        logicalId: "primary-redirect-custom-domain-old-example-com",
        stage: "personal",
      },
    ]);
    expect(result.evidence.map((entry) => entry.logicalId)).toEqual([
      "primary-custom-domain-app-example-com-instance",
    ]);
  });
  it("applies Cloudflare email sending domain and constrained send-email bindings", async () => {
    const calls: Array<{
      id: string;
      kind: string;
      props: unknown;
    }> = [];
    const runner: AlchemyDomainProviderRunner = async (_appName, _options, apply) => apply();
    const factories: AlchemyDomainProviderFactories = {
      CustomDomain: async () => {
        throw new Error("CustomDomain should not be called.");
      },
      DnsRecords: async () => {
        throw new Error("DnsRecords should not be called.");
      },
      EmailSendingDomain: async (id, props) => {
        calls.push({ id, kind: "EmailSendingDomain", props });

        return {
          dkimSelector: "cf20260624",
          id: "email-domain-output",
          name: props.name,
          returnPathDomain: "bounce.mail.example.com",
          tag: "email-domain-tag",
          zoneId: props.zoneId,
        };
      },
      SendEmailBinding: async (id, props) => {
        calls.push({ id, kind: "SendEmailBinding", props });

        return {
          allowedSenderAddresses: props.allowedSenderAddresses,
          bindingName: props.bindingName,
          type: "send_email",
        };
      },
    };
    const resourceGraph: DeployResourceGraph = {
      targetId: "instance.primary",
      resources: [
        {
          dependencies: [],
          inputs: {
            domain: "mail.example.com",
            name: "mail.example.com",
          },
          kind: "cloudflare-email-sending-domain",
          logicalId: "primary-email-sending-domain-mail-example-com",
          providerFamily: "cloudflare",
          targetId: "instance.primary",
        },
        {
          dependencies: [
            {
              logicalId: "primary-email-sending-domain-mail-example-com",
              reason: "configured senders",
            },
          ],
          inputs: {
            allowedSenderAddresses: ["contact@mail.example.com"],
            bindingName: "FORMLESS_EMAIL",
            domain: "mail.example.com",
            workerName: "formless-prod",
          },
          kind: "cloudflare-worker-send-email-binding",
          logicalId: "primary-worker-send-email-mail-example-com",
          providerFamily: "cloudflare",
          targetId: "instance.primary",
        },
      ],
    };

    const result = await runAlchemyDeployResourceGraph({
      factories,
      resolveZoneIdForHost: ({ host }) =>
        host.endsWith("example.com") ? "zone-example" : undefined,
      resourceGraph,
      runner,
    });

    expect(calls).toEqual([
      {
        id: "primary-email-sending-domain-mail-example-com",
        kind: "EmailSendingDomain",
        props: {
          domain: "mail.example.com",
          name: "mail.example.com",
          zoneId: "zone-example",
        },
      },
      {
        id: "primary-worker-send-email-mail-example-com",
        kind: "SendEmailBinding",
        props: {
          allowedSenderAddresses: ["contact@mail.example.com"],
          bindingName: "FORMLESS_EMAIL",
          domain: "mail.example.com",
          workerName: "formless-prod",
        },
      },
    ]);
    expect(result.evidence).toEqual([
      {
        action: "updated",
        alchemyResourceId: "primary-email-sending-domain-mail-example-com",
        displayName: "mail.example.com",
        kind: "cloudflare-email-sending-domain",
        logicalId: "primary-email-sending-domain-mail-example-com",
        providerFamily: "cloudflare",
        providerResourceIds: ["email-domain-output", "email-domain-tag"],
        targetId: "instance.primary",
      },
      {
        action: "updated",
        alchemyResourceId: "primary-worker-send-email-mail-example-com",
        displayName: "mail.example.com",
        kind: "cloudflare-worker-send-email-binding",
        logicalId: "primary-worker-send-email-mail-example-com",
        providerFamily: "cloudflare",
        providerResourceIds: ["FORMLESS_EMAIL"],
        targetId: "instance.primary",
      },
    ]);
  });

  it("bundles the injected adapter path for a Worker target", async () => {
    await expect(
      build({
        bundle: true,
        format: "esm",
        platform: "browser",
        stdin: {
          contents: `
            import { runAlchemyDomainProviderPlan } from "./domain-provider-alchemy.ts";

            export default {
              async fetch() {
                return new Response(typeof runAlchemyDomainProviderPlan);
              },
            };
          `,
          loader: "ts",
          resolveDir: fileURLToPath(new URL(".", import.meta.url)),
          sourcefile: "domain-provider-worker-proof.ts",
        },
        target: "es2023",
        write: false,
      }),
    ).resolves.toMatchObject({
      outputFiles: expect.any(Array),
    });
  });
});

function throwingFactories(): AlchemyDomainProviderFactories {
  return {
    CustomDomain: async () => {
      throw new Error("CustomDomain should not be called.");
    },
    DnsRecords: async () => {
      throw new Error("DnsRecords should not be called.");
    },
  };
}
