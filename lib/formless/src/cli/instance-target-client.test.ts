import { describe, expect, it } from "vite-plus/test";

import {
  FORMLESS_RUNTIME_PROTOCOL_VERSION,
  FORMLESS_STORAGE_MIGRATION_SET_ID,
} from "../shared/deploy-metadata.ts";
import { formlessProgramSchemaProvenance } from "../program/runtime.ts";
import {
  patchFormlessInstanceDeploymentConfigObservation,
  readFormlessInstanceControlPlaneRecords,
  readFormlessInstanceDeploymentCommandContext,
  readFormlessInstanceDeployMetadata,
  readFormlessInstanceTargetStatus,
} from "./instance-target-client.ts";

type CapturedTargetRequest = {
  headers: Record<string, string>;
  url: string;
};

describe("Formless instance target client", () => {
  it("parses display-safe runtime metadata with complete Program provenance", async () => {
    const result = await readFormlessInstanceDeployMetadata(
      { targetUrl: "https://instance.example" },
      {
        fetch: async () =>
          Response.json(
            {
              packageVersion: "0.1.8",
              runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
              schemaProvenance: formlessProgramSchemaProvenance,
              storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
              version: "0.1.8",
            },
            { headers: { "Cache-Control": "no-store" } },
          ),
      },
    );

    expect(result).toEqual({
      cacheControl: "no-store",
      metadataUrl: "https://instance.example/api/formless/deploy",
      packageVersion: "0.1.8",
      runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
      schemaProvenance: formlessProgramSchemaProvenance,
      storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
      version: "0.1.8",
    });
  });

  it("reads current target, owner, and deployment status without package facts", async () => {
    const requests: string[] = [];
    const result = await readFormlessInstanceTargetStatus(
      {
        includeDeploymentStatus: true,
        adminToken: "status-token",
        targetUrl: "https://instance.example",
      },
      {
        fetch: async (url) => {
          const requestUrl =
            typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
          const pathname = new URL(requestUrl).pathname;

          requests.push(`GET ${requestUrl}`);

          if (pathname === "/api/formless/deploy") {
            return Response.json(
              {
                packageVersion: "0.1.8",
                runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
                schemaProvenance: formlessProgramSchemaProvenance,
                storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
                version: "0.1.8",
              },
              { headers: { "Cache-Control": "no-store" } },
            );
          }

          if (pathname === "/api/formless/setup") {
            return Response.json({
              adminOrigin: "https://admin.example.com",
              authOrigin: "https://auth.example.com",
              setupComplete: true,
            });
          }

          if (pathname === "/api/formless/deployments/status") {
            return Response.json({
              status: {
                attemptId: "attempt.11111111-1111-4111-8111-111111111111",
                checkedAt: "2026-05-28T00:00:00.000Z",
                deployedAt: "2026-05-28T00:00:00.000Z",
                latestDesiredState: {
                  hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                  revision: 2,
                  targetId: "instance.primary",
                  versionId: "desired-state.instance.primary.2",
                },
                state: "deployed",
                targetId: "instance.primary",
              },
              target: {
                kind: "instance",
                label: "Primary instance target",
                targetId: "instance.primary",
              },
            });
          }

          return Response.json({ error: "not found" }, { status: 404 });
        },
      },
    );

    expect(requests).toEqual([
      "GET https://instance.example/api/formless/deploy",
      "GET https://instance.example/api/formless/setup",
      "GET https://instance.example/api/formless/deployments/status",
    ]);
    expect(result.ownerSetup).toEqual({
      adminOrigin: "https://admin.example.com",
      authOrigin: "https://auth.example.com",
      setupComplete: true,
    });
    expect(result.deployMetadata.schemaProvenance).toEqual(formlessProgramSchemaProvenance);
    expect(result.deployment?.status.state).toBe("deployed");
  });
});

describe("Formless instance target control-plane client", () => {
  it("reads current route, domain, and deployment records with a CLI deployer actor", async () => {
    const requests: CapturedTargetRequest[] = [];

    const records = await readFormlessInstanceControlPlaneRecords(
      {
        actorKind: "cliDeployer",
        targetUrl: "https://instance.example",
      },
      {
        fetch: controlPlaneFetch(requests),
      },
    );

    expect(requests).toEqual([
      {
        headers: {
          "X-Formless-Control-Plane-Actor": "cliDeployer",
          accept: "application/json",
        },
        url: "https://instance.example/api/formless/program/bootstrap?actorKind=cliDeployer",
      },
    ]);
    expect(records.domainMappings.map((record) => record.id)).toEqual([
      "route:host:publicSite:www.example.com",
    ]);
    expect(records.deploymentConfigs.map((record) => record.id)).toEqual(["instance.primary"]);
  });

  it("reads runner control-plane context before binding an exact desired-state version", async () => {
    const requests: CapturedTargetRequest[] = [];
    const desiredStateRef = {
      hash: `sha256:${"a".repeat(64)}`,
      revision: 11,
      targetId: "instance.primary",
      versionId: "desired.instance.primary.11",
    };
    const context = await readFormlessInstanceDeploymentCommandContext(
      {
        adminToken: "runner-token",
        actorKind: "runner",
        targetUrl: "https://instance.example",
      },
      {
        fetch: async (input, init) => {
          const request = capturedRequest(input, init);

          requests.push(request);

          if (request.url.endsWith("/api/formless/deployments/desired-state")) {
            return Response.json({
              desiredState: {
                ...desiredStateRef,
                createdAt: "2026-06-01T00:00:00.000Z",
                display: {
                  resourceCount: 1,
                  resourcesByKind: { "cloudflare-worker-custom-domain": 1 },
                  title: "Primary instance target",
                },
                resourceGraph: { resources: [], targetId: desiredStateRef.targetId },
                schemaVersion: 1,
                source: { fingerprint: "control-plane:abc", intentRevision: 5 },
              },
              target: { kind: "instance", targetId: desiredStateRef.targetId },
            });
          }

          if (request.url.endsWith("/api/formless/deployments/status")) {
            return Response.json({
              status: {
                checkedAt: "2026-06-01T00:00:00.000Z",
                state: "no-target",
                targetId: desiredStateRef.targetId,
              },
              target: { kind: "instance", targetId: desiredStateRef.targetId },
            });
          }

          return controlPlaneBootstrapResponse();
        },
      },
    );

    expect(context.controlPlane?.actorKind).toBe("runner");
    expect(context.controlPlane?.domainMappings).toHaveLength(1);
    expect(context.desiredStateRef).toEqual(desiredStateRef);
    expect(requests.map((request) => request.url)).toEqual([
      "https://instance.example/api/formless/program/bootstrap?actorKind=runner",
      "https://instance.example/api/formless/deployments/desired-state",
      "https://instance.example/api/formless/deployments/status",
    ]);
    expect(requests[0]?.headers["X-Formless-Control-Plane-Actor"]).toBe("runner");
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer runner-token",
      "Bearer runner-token",
      "Bearer runner-token",
    ]);
  });

  it("patches deployment-config observed fields through the control-plane operation API", async () => {
    const requests: Array<{
      body: BodyInit | null | undefined;
      headers: Record<string, string>;
      method: string;
      url: string;
    }> = [];

    const patched = await patchFormlessInstanceDeploymentConfigObservation(
      {
        adminToken: "admin-token",
        mutationId: "observe:instance.primary",
        observation: {
          observedAt: "2026-06-11T01:00:00.000Z",
          observedDesiredStateHash: `sha256:${"b".repeat(64)}`,
          observedError: "",
          observedRunnerId: "local-gateway",
          observedStatus: "deployed",
          observedSummary: "1 deployment resource applied from workspace source.",
        },
        targetId: "instance.primary",
        targetUrl: "https://instance.example",
      },
      {
        fetch: async (input, init) => {
          const request = {
            body: init?.body,
            headers: normalizeHeaders(init?.headers),
            method: init?.method ?? "GET",
            url:
              typeof input === "string"
                ? input
                : input instanceof URL
                  ? input.toString()
                  : input.url,
          };

          requests.push(request);

          if (typeof request.body !== "string") {
            throw new Error("Expected observation patch request body.");
          }

          return Response.json({
            invocation: {
              operation: { canonicalKey: "deployment-config.update" },
            },
            output: {
              affectedChangeIds: [],
              changes: [],
              cursor: 4,
              record: {
                entity: "deployment-config",
                id: "instance.primary",
                values: JSON.parse(request.body).input,
              },
              type: "update",
            },
            status: "committed",
          });
        },
      },
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      headers: {
        accept: "application/json",
        authorization: "Bearer admin-token",
        "content-type": "application/json",
      },
      method: "POST",
      url: "https://instance.example/api/formless/program/operations/deployment-config/update",
    });
    const requestBody = requests[0]?.body;

    expect(typeof requestBody).toBe("string");
    expect(JSON.parse(requestBody as string)).toEqual({
      idempotencyKey: "observe:instance.primary",
      recordId: "instance.primary",
      input: {
        observedAt: "2026-06-11T01:00:00.000Z",
        observedDesiredStateHash: `sha256:${"b".repeat(64)}`,
        observedError: "",
        observedRunnerId: "local-gateway",
        observedStatus: "deployed",
        observedSummary: "1 deployment resource applied from workspace source.",
      },
    });
    expect(patched.output.type).toBe("update");
    expect(patched.output.type === "update" ? patched.output.record.id : undefined).toBe(
      "instance.primary",
    );
    expect(
      patched.output.type === "update" ? patched.output.record.values.observedStatus : undefined,
    ).toBe("deployed");
  });
});

function controlPlaneFetch(requests: CapturedTargetRequest[]): typeof fetch {
  return async (input, init) => {
    requests.push(capturedRequest(input, init));

    return controlPlaneBootstrapResponse();
  };
}

function controlPlaneBootstrapResponse(): Response {
  return Response.json({
    cursor: 3,
    records: [
      {
        entity: "route",
        id: "route:site:public-site",
        values: {
          kind: "mount",
          matchPath: "/pages",
          matchPrefix: "/pages/",
          surface: "public-site",
          targetProfile: "public-site",
        },
      },
      {
        entity: "route",
        id: "route:host:publicSite:www.example.com",
        values: {
          kind: "mount",
          matchHost: "www.example.com",
          matchPath: "/",
          matchPrefix: "/",
          surface: "public-site",
          targetProfile: "public-site",
        },
      },
      {
        entity: "deployment-config",
        id: "instance.primary",
        values: {
          enabled: true,
          providerFamily: "cloudflare",
          targetId: "instance.primary",
          targetKind: "instance",
          targetUrl: "https://instance.example",
        },
      },
    ],
    schema: {},
  });
}

function capturedRequest(input: RequestInfo | URL, init: RequestInit | undefined) {
  return {
    headers: normalizeHeaders(init?.headers),
    url: typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url,
  };
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
