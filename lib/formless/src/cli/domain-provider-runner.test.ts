import { describe, expect, it } from "vite-plus/test";

import { planDomainProviderResources } from "../shared/domain-provider-planner.ts";
import {
  runFormlessInstanceDomainProviderDelete,
  type DomainProviderAlchemyRuntime,
} from "./domain-provider-runner.ts";

describe("domain provider Alchemy runner", () => {
  it("requests a Worker delete job, runs Alchemy destroy, and posts delete evidence", async () => {
    const plan = planDomainProviderResources({
      instanceId: "primary",
      mappings: [
        {
          enabled: true,
          host: "admin.example.com",
          profile: "instance",
        },
      ],
      workerName: "formless-primary",
      zones: [{ id: "zone-1", name: "example.com" }],
    });
    const target = {
      accountId: "account-123",
      action: "created" as const,
      alchemyResourceId: "primary-custom-domain-admin-example-com-instance",
      host: "admin.example.com",
      kind: "cloudflare-worker-custom-domain" as const,
      logicalId: "primary-custom-domain-admin-example-com-instance",
      profile: "instance" as const,
      resourceId: "custom-domain-123",
      resourceJson: "{}",
      workerName: "formless-primary",
      zoneId: "zone-1",
      zoneName: "example.com",
    };
    const requests: Array<{
      body: unknown;
      url: string;
    }> = [];
    const runnerCalls: Array<{
      appName: string;
      options: unknown;
    }> = [];
    const runtime: DomainProviderAlchemyRuntime = {
      factories: {
        CustomDomain: async (_id, props) => ({
          ...props,
          createdAt: 1,
          id: "custom-domain-123",
          updatedAt: 2,
        }),
        DnsRecords: async () => {
          throw new Error("DNS records are outside this test.");
        },
      },
      password: "alchemy-password",
      runner: async (appName, options, apply) => {
        runnerCalls.push({ appName, options });

        return apply();
      },
      stateStore: () => {
        throw new Error("state store is passed to Alchemy, not called by this test");
      },
    };
    const result = await runFormlessInstanceDomainProviderDelete(
      {
        adminToken: "admin-token",
        host: "admin.example.com",
        kind: "cloudflare-worker-custom-domain",
        runnerId: "runner-delete",
        targetUrl: "https://instance.example",
      },
      {
        createRunnerId: () => "unused-runner",
        env: {},
        fetch: async (input, init) => {
          const url =
            typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;

          requests.push({ body, url });

          if (url === "https://instance.example/api/formless/domain-provider/delete") {
            return Response.json(
              {
                code: "domain-provider-delete-job-ready",
                config: {
                  accountId: "account-123",
                  alchemyPassword: { configured: true, envNames: ["ALCHEMY_PASSWORD"] },
                  cloudflareApiToken: {
                    configured: true,
                    envNames: ["CLOUDFLARE_API_TOKEN"],
                  },
                  deleteReady: true,
                  instanceId: "primary",
                  issues: [],
                  planReady: true,
                  workerName: "formless-primary",
                  zones: [{ id: "zone-1", name: "example.com" }],
                },
                job: {
                  createdAt: "2026-05-27T00:00:00.000Z",
                  jobId: "delete-job-1",
                  plan,
                  runnerId: "runner-delete",
                  status: "ready",
                  targets: [target],
                  updatedAt: "2026-05-27T00:00:00.000Z",
                },
                plan,
                status: "ready",
                targets: [target],
              },
              { status: 202 },
            );
          }

          if (
            url ===
            "https://instance.example/api/formless/domain-provider/delete-jobs/delete-job-1/result"
          ) {
            return Response.json({
              job: {
                createdAt: "2026-05-27T00:00:00.000Z",
                jobId: "delete-job-1",
                plan,
                result: { evidenceCount: 1 },
                runnerId: "runner-delete",
                status: "succeeded",
                targets: [target],
                updatedAt: "2026-05-27T00:00:01.000Z",
              },
            });
          }

          return Response.json({ error: "Unexpected request." }, { status: 404 });
        },
        runtime: async () => runtime,
      },
    );

    expect(result.evidenceCount).toBe(1);
    expect(runnerCalls).toEqual([
      expect.objectContaining({
        options: expect.objectContaining({ noTrack: true, phase: "destroy" }),
      }),
    ]);
    expect(requests[0]?.body).toEqual({
      host: "admin.example.com",
      kind: "cloudflare-worker-custom-domain",
      runnerId: "runner-delete",
    });
    expect(requests[1]?.body).toEqual({
      resources: [
        {
          action: "deleted",
          host: "admin.example.com",
          kind: "cloudflare-worker-custom-domain",
          logicalId: "primary-custom-domain-admin-example-com-instance",
        },
      ],
      runnerId: "runner-delete",
      status: "succeeded",
    });
  });

  it("treats already-missing provider resources as successful delete evidence", async () => {
    const plan = planDomainProviderResources({
      instanceId: "primary",
      mappings: [
        {
          enabled: true,
          host: "gone.example.com",
          profile: "instance",
        },
      ],
      workerName: "formless-primary",
      zones: [{ id: "zone-1", name: "example.com" }],
    });
    const target = {
      accountId: "account-123",
      action: "created" as const,
      alchemyResourceId: "primary-custom-domain-gone-example-com-instance",
      host: "gone.example.com",
      kind: "cloudflare-worker-custom-domain" as const,
      logicalId: "primary-custom-domain-gone-example-com-instance",
      profile: "instance" as const,
      resourceId: "custom-domain-gone",
      resourceJson: "{}",
      workerName: "formless-primary",
      zoneId: "zone-1",
      zoneName: "example.com",
    };
    const requests: Array<{
      body: unknown;
      url: string;
    }> = [];
    const runtime: DomainProviderAlchemyRuntime = {
      factories: {
        CustomDomain: async (id) => {
          throw new Error(`Cloudflare CustomDomain ${id} returned 404 not found.`);
        },
        DnsRecords: async () => {
          throw new Error("DNS records are outside this test.");
        },
      },
      password: "alchemy-password",
      runner: async (_appName, _options, apply) => apply(),
      stateStore: () => {
        throw new Error("state store is passed to Alchemy, not called by this test");
      },
    };
    const result = await runFormlessInstanceDomainProviderDelete(
      {
        adminToken: "admin-token",
        host: "gone.example.com",
        kind: "cloudflare-worker-custom-domain",
        runnerId: "runner-delete",
        targetUrl: "https://instance.example",
      },
      {
        createRunnerId: () => "unused-runner",
        env: {},
        fetch: async (input, init) => {
          const url =
            typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;

          requests.push({ body, url });

          if (url === "https://instance.example/api/formless/domain-provider/delete") {
            return Response.json(
              {
                code: "domain-provider-delete-job-ready",
                config: {
                  accountId: "account-123",
                  alchemyPassword: { configured: true, envNames: ["ALCHEMY_PASSWORD"] },
                  cloudflareApiToken: {
                    configured: true,
                    envNames: ["CLOUDFLARE_API_TOKEN"],
                  },
                  deleteReady: true,
                  instanceId: "primary",
                  issues: [],
                  planReady: true,
                  workerName: "formless-primary",
                  zones: [{ id: "zone-1", name: "example.com" }],
                },
                job: {
                  createdAt: "2026-05-27T00:00:00.000Z",
                  jobId: "delete-job-missing",
                  plan,
                  runnerId: "runner-delete",
                  status: "ready",
                  targets: [target],
                  updatedAt: "2026-05-27T00:00:00.000Z",
                },
                plan,
                status: "ready",
                targets: [target],
              },
              { status: 202 },
            );
          }

          if (
            url ===
            "https://instance.example/api/formless/domain-provider/delete-jobs/delete-job-missing/result"
          ) {
            return Response.json({
              job: {
                createdAt: "2026-05-27T00:00:00.000Z",
                jobId: "delete-job-missing",
                plan,
                result: { evidenceCount: 1 },
                runnerId: "runner-delete",
                status: "succeeded",
                targets: [target],
                updatedAt: "2026-05-27T00:00:01.000Z",
              },
            });
          }

          return Response.json({ error: "Unexpected request." }, { status: 404 });
        },
        runtime: async () => runtime,
      },
    );

    expect(result.evidenceCount).toBe(1);
    expect(requests[1]?.body).toEqual({
      resources: [
        {
          action: "deleted",
          host: "gone.example.com",
          kind: "cloudflare-worker-custom-domain",
          logicalId: "primary-custom-domain-gone-example-com-instance",
        },
      ],
      runnerId: "runner-delete",
      status: "succeeded",
    });
  });
});
