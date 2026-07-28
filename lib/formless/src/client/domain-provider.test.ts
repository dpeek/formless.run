import { describe, expect, it } from "vite-plus/test";
import {
  deleteInstanceDomainProviderResource,
  markInstanceDomainProviderResourceManuallyRemoved,
} from "./domain-provider.ts";
import {
  INSTANCE_DOMAIN_PROVIDER_DELETE_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_MANUAL_CLEANUP_API_PATH,
} from "../shared/domain-provider-api.ts";

describe("client domain provider API helpers", () => {
  it("marks a recorded provider resource manually removed", async () => {
    const cleaned = await markInstanceDomainProviderResourceManuallyRemoved(
      {
        host: "www.example.com",
        kind: "cloudflare-worker-custom-domain",
        logicalId: "primary-custom-domain-www-example-com-publicsite-site",
      },
      {
        fetcher: jsonFetcher(
          INSTANCE_DOMAIN_PROVIDER_MANUAL_CLEANUP_API_PATH,
          {
            action: "manually-removed",
            status: "cleaned",
            target: {
              host: "www.example.com",
              kind: "cloudflare-worker-custom-domain",
              logicalId: "primary-custom-domain-www-example-com-publicsite-site",
            },
          },
          {
            expectedBody: {
              host: "www.example.com",
              kind: "cloudflare-worker-custom-domain",
              logicalId: "primary-custom-domain-www-example-com-publicsite-site",
            },
            expectedMethod: "POST",
          },
        ),
      },
    );

    expect(cleaned).toMatchObject({
      action: "manually-removed",
      status: "cleaned",
      target: {
        host: "www.example.com",
        kind: "cloudflare-worker-custom-domain",
        logicalId: "primary-custom-domain-www-example-com-publicsite-site",
      },
    });
  });

  it("posts exact provider delete targets", async () => {
    const deleted = await deleteInstanceDomainProviderResource(
      {
        host: "www.example.com",
        kind: "cloudflare-worker-custom-domain",
        logicalId: "primary-redirect-custom-domain-www-example-com",
      },
      {
        fetcher: jsonFetcher(
          INSTANCE_DOMAIN_PROVIDER_DELETE_API_PATH,
          {
            code: "domain-provider-delete-job-ready",
            config: {},
            job: { jobId: "delete-job-1" },
            plan: { blockers: [], resources: [] },
            status: "ready",
            targets: [],
          },
          {
            expectedBody: {
              host: "www.example.com",
              kind: "cloudflare-worker-custom-domain",
              logicalId: "primary-redirect-custom-domain-www-example-com",
            },
            expectedMethod: "POST",
          },
        ),
      },
    );

    expect(deleted.status).toBe("ready");
  });
});

function jsonFetcher(
  expectedPath: string,
  body: unknown,
  options: {
    expectedBody?: unknown;
    expectedMethod?: string;
    status?: number;
  } = {},
): typeof fetch {
  return async (input, init) => {
    expect(requestUrl(input)).toBe(expectedPath);
    expect(init?.method ?? "GET").toBe(options.expectedMethod ?? "GET");

    if (options.expectedBody !== undefined) {
      if (typeof init?.body !== "string") {
        throw new Error("Expected JSON request body.");
      }

      expect(JSON.parse(init.body)).toEqual(options.expectedBody);
    }

    return Response.json(body, { status: options.status ?? 200 });
  };
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.href : input.url;
}
