import { describe, expect, it } from "vite-plus/test";
import {
  CONTROL_PLANE_DEPLOYMENT_CONFIG_OBSERVED_FIELDS,
  canonicalizeDeployResourceGraph,
  computeDeployDesiredStateHash,
  computeDeployProjectionHash,
  deployDeploymentAppliedSummary,
  deployDeploymentObservationPatch,
  deployDeploymentObservationPatchFromLatestStatus,
  deployDesiredStateHashInputCanonicalJson,
  deployDesiredStateSchemaVersion,
  deployDesiredStateSourceRevision,
  deployDisplaySafeFailureSummary,
  deployDesiredStateProjectionInputFromControlPlaneRecords,
  deployLatestStatusDisplaySummary,
  deployProjectionCanonicalJson,
  deployResourceCountsByKind,
  deriveDeployLatestStatus,
  materializeDeployDesiredStateVersion,
  projectDeployControlPlaneDesiredState,
} from "./index.ts";
import type {
  ControlPlaneDeploymentConfigObservationRecord,
  ControlPlaneEmailDomainProjectionRecord,
  ControlPlaneEmailSenderProjectionRecord,
  ControlPlaneProviderConfigProjectionRecord,
  ControlPlaneProjectionSourceRecord,
  ControlPlaneRouteProjectionRecord,
  DeployDesiredStateHashInput,
  DeployResourceGraph,
  DeployTargetId,
} from "./types.ts";

describe("Deploy control-plane projection helpers", () => {
  it("declares display-safe deployment-config observation fields", () => {
    expect(CONTROL_PLANE_DEPLOYMENT_CONFIG_OBSERVED_FIELDS).toEqual([
      "observedStatus",
      "observedAt",
      "observedDesiredStateHash",
      "observedSummary",
      "observedError",
      "observedRunnerId",
    ]);
  });

  it("adapts active control-plane records into deploy projection input", () => {
    expect(
      deployDesiredStateProjectionInputFromControlPlaneRecords({
        instanceId: "demo-instance",
        records: sourceRecords,
        targetId: "instance.primary",
        workerName: "fallback-worker",
      }),
    ).toEqual({
      emailDomains: [],
      emailSenders: [],
      instanceId: "demo-instance",
      providerConfigs: [
        {
          id: "cloudflare-primary",
          providerFamily: "cloudflare",
          workerName: "primary-worker",
        },
        {
          id: "cloudflare-secondary",
          providerFamily: "cloudflare",
          workerName: "secondary-worker",
        },
      ],
      routes: [
        {
          enabled: true,
          id: "route:site:public",
          kind: "mount",
          matchHost: "www.example.com",
          matchPath: "/",
          providerConfig: "cloudflare-primary",
          surface: "public-site",
          targetProfile: "public-site",
        },
      ],
      targetId: "instance.primary",
      workerName: "primary-worker",
    });
  });

  it("adapts only active route records into deploy projection input", () => {
    const projectionInput = deployDesiredStateProjectionInputFromControlPlaneRecords({
      instanceId: "demo-instance",
      records: [
        ...sourceRecords,
        {
          id: "route:disabled:disabled.example.com",
          entity: "route",
          createdAt: "2026-06-14T00:00:00.000Z",
          values: {
            enabled: false,
            kind: "mount",
            matchHost: "disabled.example.com",
            matchPath: "/",
            targetProfile: "instance",
          },
        },
        {
          id: "route:deleted:gone.example.com",
          entity: "route",
          createdAt: "2026-06-14T00:00:00.000Z",
          deletedAt: "2026-06-14T00:00:01.000Z",
          values: {
            enabled: true,
            kind: "mount",
            matchHost: "gone.example.com",
            matchPath: "/",
            targetProfile: "instance",
          },
        },
      ],
      targetId: "instance.primary",
      workerName: "fallback-worker",
    });
    const serialized = JSON.stringify(projectionInput);

    expect(projectionInput.routes?.map((route) => route.id)).toEqual(["route:site:public"]);
    expect(serialized).not.toContain("disabled.example.com");
    expect(serialized).not.toContain("gone.example.com");
  });

  it("omits route-derived resources when route records are absent", async () => {
    const projection = projectDeployControlPlaneDesiredState(
      deployDesiredStateProjectionInputFromControlPlaneRecords({
        instanceId: "demo-instance",
        records: sourceRecords.filter((record) => record.entity !== "route"),
        targetId: "instance.primary",
        workerName: "fallback-worker",
      }),
    );
    const reorderedProjection = projectDeployControlPlaneDesiredState(
      deployDesiredStateProjectionInputFromControlPlaneRecords({
        instanceId: "demo-instance",
        records: sourceRecords.filter((record) => record.entity !== "route").reverse(),
        targetId: "instance.primary",
        workerName: "fallback-worker",
      }),
    );

    expect(projection.resourceGraph.resources).toEqual([]);
    expect(projection.sourceFingerprint).toMatch(/^control-plane:/);
    expect(await computeDeployProjectionHash(reorderedProjection)).toBe(
      await computeDeployProjectionHash(projection),
    );
  });

  it("keeps route-derived custom-domain projection stable and display-safe", async () => {
    const projection = projectDeployControlPlaneDesiredState({
      instanceId: "demo-instance",
      providerConfigs,
      routes: domainRoutes,
      targetId: "instance.primary",
    });

    expect(projection.resourceGraph.resources).toEqual([
      {
        dependencies: [],
        inputs: {
          adopt: false,
          host: "www.example.com",
          name: "www.example.com",
          overrideExistingOrigin: false,
          profile: "publicSite",
          workerName: "demo-worker",
        },
        kind: "cloudflare-worker-custom-domain",
        logicalId: "demo-instance-custom-domain-www-example-com-publicsite",
        providerFamily: "cloudflare",
        targetId: "instance.primary",
      },
    ]);
    expect(deployProjectionCanonicalJson(projection)).not.toContain("secret");
    expect(await computeDeployProjectionHash(projection)).toBe(
      "sha256:226a4eecb7b456fe8544802fab61d4917d97bb25b38cefa991535ea07e65e049",
    );
  });

  it("uses deployment-config worker names without hashing observation or secret fields", async () => {
    const projection = projectDeployControlPlaneDesiredState(
      deployDesiredStateProjectionInputFromControlPlaneRecords({
        instanceId: "demo-instance",
        records: sourceRecords,
        targetId: "instance.primary",
        workerName: "fallback-worker",
      }),
    );
    const changedNonIntentRecords = sourceRecords.map((record) => {
      if (record.id === "cloudflare-primary") {
        return {
          ...record,
          values: {
            ...record.values,
            credentialRef: "secret:cloudflare:rotated",
            observedAt: "2026-06-14T00:05:00.000Z",
            observedDesiredStateHash: "sha256:changed",
            observedError: "secret-cloudflare-token",
            observedStatus: "failed",
          },
        } satisfies ControlPlaneProjectionSourceRecord;
      }

      if (record.id === "route:site:public") {
        return {
          ...record,
          values: {
            ...record.values,
            updatedAt: "2026-06-14T00:05:00.000Z",
          },
        } satisfies ControlPlaneProjectionSourceRecord;
      }

      return record;
    });
    const changedProjection = projectDeployControlPlaneDesiredState(
      deployDesiredStateProjectionInputFromControlPlaneRecords({
        instanceId: "demo-instance",
        records: changedNonIntentRecords,
        targetId: "instance.primary",
        workerName: "fallback-worker",
      }),
    );
    const serialized = deployProjectionCanonicalJson(changedProjection);

    expect(projection.resourceGraph.resources).toEqual([
      expect.objectContaining({
        inputs: expect.objectContaining({
          host: "www.example.com",
          profile: "publicSite",
          workerName: "primary-worker",
        }),
        logicalId: "demo-instance-custom-domain-www-example-com-publicsite",
      }),
    ]);
    expect(changedProjection).toEqual(projection);
    expect(await computeDeployProjectionHash(changedProjection)).toBe(
      await computeDeployProjectionHash(projection),
    );
    expect(serialized).not.toContain("secret");
    expect(changedProjection.sourceFingerprint).not.toContain("secret");
  });

  it("adapts email domain and sender records into target-scoped deploy projection input", () => {
    const projectionInput = deployDesiredStateProjectionInputFromControlPlaneRecords({
      instanceId: "demo-instance",
      records: [
        ...sourceRecords,
        ...emailSourceRecords,
        {
          id: "email-domain:secondary.example.com",
          entity: "email-domain",
          createdAt: "2026-06-14T00:00:00.000Z",
          values: {
            deploymentConfig: "cloudflare-secondary",
            domain: "secondary.example.com",
            enabled: true,
            providerFamily: "cloudflare",
          },
        },
      ],
      targetId: "instance.primary",
      workerName: "fallback-worker",
    });

    expect(projectionInput.emailDomains).toEqual([
      {
        deploymentConfig: "cloudflare-primary",
        domain: "mail.example.com",
        enabled: true,
        id: "email-domain:mail.example.com",
        providerFamily: "cloudflare",
      },
    ]);
    expect(projectionInput.emailSenders).toEqual([
      {
        address: "auth@mail.example.com",
        displayName: "Auth",
        emailDomain: "email-domain:mail.example.com",
        enabled: true,
        id: "email-sender:auth@mail.example.com",
        purpose: "auth",
      },
      {
        address: "contact@mail.example.com",
        displayName: "Contact",
        emailDomain: "email-domain:mail.example.com",
        enabled: true,
        id: "email-sender:contact@mail.example.com",
        purpose: "contact-notification",
      },
      {
        address: "pending@mail.example.com",
        emailDomain: "email-domain:mail.example.com",
        enabled: true,
        id: "email-sender:pending@mail.example.com",
        purpose: "system",
      },
    ]);
    expect(JSON.stringify(projectionInput)).not.toContain("email-domain:secondary.example.com");
  });

  it("projects Cloudflare email domain and constrained send-email binding resources", async () => {
    const projection = projectDeployControlPlaneDesiredState({
      emailDomains,
      emailSenders,
      instanceId: "demo-instance",
      targetId: "instance.primary",
      workerName: "demo-worker",
    });

    expect(projection.resourceGraph.resources).toEqual([
      {
        dependencies: [],
        inputs: {
          domain: "mail.example.com",
          name: "mail.example.com",
        },
        kind: "cloudflare-email-sending-domain",
        logicalId: "demo-instance-email-sending-domain-mail-example-com",
        providerFamily: "cloudflare",
        targetId: "instance.primary",
      },
      {
        dependencies: [
          {
            logicalId: "demo-instance-email-sending-domain-mail-example-com",
            reason: "configured senders",
          },
        ],
        inputs: {
          allowedSenderAddresses: [
            "auth@mail.example.com",
            "contact@mail.example.com",
            "pending@mail.example.com",
            "system@mail.example.com",
          ],
          bindingName: "FORMLESS_EMAIL",
          domain: "mail.example.com",
          workerName: "demo-worker",
        },
        kind: "cloudflare-worker-send-email-binding",
        logicalId: "demo-instance-worker-send-email-mail-example-com",
        providerFamily: "cloudflare",
        targetId: "instance.primary",
      },
    ]);
    expect(deployResourceCountsByKind(projection.resourceGraph)).toEqual({
      "cloudflare-email-sending-domain": 1,
      "cloudflare-worker-send-email-binding": 1,
    });
    expect(JSON.stringify(projection.resourceGraph)).not.toContain("cloudflare-email-dns-records");
    expect(JSON.stringify(projection.resourceGraph)).not.toContain("FORMLESS_EMAIL_DELIVERY_QUEUE");
    expect(JSON.stringify(projection.resourceGraph)).not.toContain("email-delivery");
    expect(deployProjectionCanonicalJson(projection)).toContain("pending@mail.example.com");
    expect(deployProjectionCanonicalJson(projection)).not.toContain("disabled@mail.example.com");
    expect(await computeDeployProjectionHash(projection)).toBe(
      await computeDeployProjectionHash(
        projectDeployControlPlaneDesiredState({
          emailDomains: [...emailDomains].reverse(),
          emailSenders: [...emailSenders].reverse(),
          instanceId: "demo-instance",
          targetId: "instance.primary",
          workerName: "demo-worker",
        }),
      ),
    );
  });

  it("keeps route-derived redirect projection stable and display-safe", async () => {
    const projection = projectDeployControlPlaneDesiredState({
      instanceId: "demo-instance",
      providerConfigs,
      routes: redirectRoutes,
      targetId: "instance.primary",
    });

    expect(projection.resourceGraph.resources).toEqual([
      {
        dependencies: [],
        inputs: {
          adopt: false,
          host: "old.example.com",
          name: "old.example.com",
          overrideExistingOrigin: false,
          workerName: "demo-worker",
        },
        kind: "cloudflare-worker-custom-domain",
        logicalId: "demo-instance-redirect-custom-domain-old-example-com",
        providerFamily: "cloudflare",
        targetId: "instance.primary",
      },
    ]);
    expect(await computeDeployProjectionHash(projection)).toBe(
      "sha256:b00b8b191043b7dc6dbdbe8cbc2d7ca34257052e31763c19e077d81885fdfdb3",
    );
  });

  it("projects URL-target redirects as custom domains without legacy redirect inputs", () => {
    const projection = projectDeployControlPlaneDesiredState({
      instanceId: "demo-instance",
      routes: [
        {
          enabled: true,
          id: "route:redirect:docs.example.com",
          kind: "redirect",
          matchHost: "docs.example.com",
          matchPath: "/",
          preservePath: false,
          preserveQueryString: false,
          statusCode: 302,
          toUrl: "https://example.com/docs/?utm=ignored",
        },
      ],
      targetId: "instance.primary",
      workerName: "fallback-worker",
    });

    expect(projection.resourceGraph.resources).toEqual([
      expect.objectContaining({
        inputs: {
          adopt: false,
          host: "docs.example.com",
          name: "docs.example.com",
          overrideExistingOrigin: false,
          workerName: "fallback-worker",
        },
        kind: "cloudflare-worker-custom-domain",
        logicalId: "demo-instance-redirect-custom-domain-docs-example-com",
      }),
    ]);
  });
});

describe("Deploy desired-state version helpers", () => {
  it("materializes deterministic desired-state versions from canonical resource graphs", async () => {
    const targetId = "instance.primary" as DeployTargetId;
    const first = await materializeDeployDesiredStateVersion({
      now: "2026-06-14T00:00:00.000Z",
      resourceGraph: deployResourceGraph([
        customDomainResource({
          dependencies: [{ logicalId: "zone:example" }],
          inputs: {
            apiToken: "secret-token",
            host: "app.example.com",
            workerName: "formless-prod",
            zoneId: "zone-example",
          },
          logicalId: "custom-domain:app.example.com",
          targetId,
        }),
        dnsRecordsResource({
          dependencies: [],
          inputs: { name: "app.example.com", zoneId: "zone-example" },
          logicalId: "dns:app.example.com",
          targetId,
        }),
      ]),
      source: { fingerprint: "control-plane:primary", intentRevision: 4 },
      targetId,
      title: "Primary instance target",
    });
    const second = await materializeDeployDesiredStateVersion({
      now: "2026-06-14T00:05:00.000Z",
      resourceGraph: first.resourceGraph,
      source: first.source,
      targetId,
      title: "Primary instance target",
    });

    expect(first.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(deployDesiredStateSchemaVersion()).toBe(1);
    expect(first.versionId).toBe(`desired.${targetId}.${first.hash}`);
    expect(first.revision).toBe(4);
    expect(first.display).toEqual({
      resourceCount: 2,
      resourcesByKind: {
        "cloudflare-dns-records": 1,
        "cloudflare-worker-custom-domain": 1,
      },
      title: "Primary instance target",
    });
    expect(first.resourceGraph.resources.map((resource) => resource.logicalId)).toEqual([
      "custom-domain:app.example.com",
      "dns:app.example.com",
    ]);
    expect(JSON.stringify(first.resourceGraph)).not.toContain("secret-token");
    expect(second.hash).toBe(first.hash);
    expect(second.versionId).toBe(first.versionId);
  });

  it("hashes equivalent resource graphs the same way and omits secret-like inputs", async () => {
    const first = deployHashInput([
      dnsRecordsResource({
        dependencies: [
          { reason: "host placeholder", logicalId: "dns:www.example.com" },
          { logicalId: "zone:example", reason: "zone lookup" },
        ],
        inputs: {
          statusCode: 301,
          targetUrl: "https://example.com/${1}",
          zoneId: "zone-example",
        },
        logicalId: "dns:www.example.com",
      }),
      customDomainResource({
        dependencies: [{ logicalId: "zone:example" }],
        inputs: {
          headers: {
            authorizationHeader: "Bearer token",
            publicHeader: "cache",
          },
          privateKey: "secret-key",
          publicSetting: "kept",
          zoneId: "zone-example",
        },
        logicalId: "custom-domain:app.example.com",
      }),
    ]);
    const second = deployHashInput([
      customDomainResource({
        dependencies: [{ logicalId: "zone:example" }],
        inputs: {
          headers: {
            publicHeader: "cache",
          },
          publicSetting: "kept",
          zoneId: "zone-example",
        },
        logicalId: "custom-domain:app.example.com",
      }),
      dnsRecordsResource({
        dependencies: [
          { logicalId: "zone:example", reason: "zone lookup" },
          { logicalId: "dns:www.example.com", reason: "host placeholder" },
        ],
        inputs: {
          targetUrl: "https://example.com/${1}",
          zoneId: "zone-example",
          statusCode: 301,
        },
        logicalId: "dns:www.example.com",
      }),
    ]);

    expect(deployDesiredStateHashInputCanonicalJson(first)).toBe(
      deployDesiredStateHashInputCanonicalJson(second),
    );
    expect(deployDesiredStateHashInputCanonicalJson(first)).not.toContain("token");
    expect(deployDesiredStateHashInputCanonicalJson(first)).not.toContain("secret-key");
    expect(await computeDeployDesiredStateHash(first)).toBe(
      await computeDeployDesiredStateHash(second),
    );
    expect(canonicalizeDeployResourceGraph(first.resourceGraph).resources[0]?.logicalId).toBe(
      "custom-domain:app.example.com",
    );
    expect(deployDesiredStateSourceRevision({ fingerprint: "bad", intentRevision: -1 })).toBe(0);
  });

  it("derives latest deployment status from display-safe observation fields", async () => {
    const targetId = "instance.primary" as DeployTargetId;
    const desiredState = await materializeDeployDesiredStateVersion({
      now: "2026-06-14T00:00:00.000Z",
      resourceGraph: deployResourceGraph([], targetId),
      source: { fingerprint: "control-plane:empty", intentRevision: 0 },
      targetId,
    });
    const baseConfig = deploymentConfigRecord({
      observedDesiredStateHash: desiredState.hash,
    });
    const pending = deriveDeployLatestStatus({
      deploymentConfig: deploymentConfigRecord(),
      desiredState,
      now: "2026-06-14T00:01:00.000Z",
      targetId,
    });
    const drift = deriveDeployLatestStatus({
      deploymentConfig: deploymentConfigRecord({
        ...baseConfig.values,
        observedStatus: "drifted",
        observedSummary: "1 resource drifted.",
      }),
      desiredState,
      now: "2026-06-14T00:05:00.000Z",
      targetId,
    });

    expect(
      deriveDeployLatestStatus({
        desiredState,
        now: "2026-06-14T00:01:00.000Z",
        targetId,
      }),
    ).toEqual({
      checkedAt: "2026-06-14T00:01:00.000Z",
      state: "no-target",
    });
    expect(pending).toMatchObject({
      latestDesiredState: {
        hash: desiredState.hash,
        revision: 0,
        targetId,
        versionId: desiredState.versionId,
      },
      state: "pending-changes",
      targetId,
    });
    expect(
      deriveDeployLatestStatus({
        deploymentConfig: deploymentConfigRecord({
          observedDesiredStateHash: `sha256:${"b".repeat(64)}`,
          observedError: "Old deploy failed.",
          observedStatus: "failed",
        }),
        desiredState,
        now: "2026-06-14T00:01:00.000Z",
        targetId,
      }),
    ).toMatchObject({
      state: "pending-changes",
      targetId,
    });
    expect(
      deriveDeployLatestStatus({
        deploymentConfig: deploymentConfigRecord({
          ...baseConfig.values,
          observedAt: "2026-06-14T00:02:00.000Z",
          observedRunnerId: "runner.primary",
          observedStatus: "deployed",
          observedSummary: "Deployed 2 resources.",
        }),
        desiredState,
        now: "2026-06-14T00:03:00.000Z",
        targetId,
      }),
    ).toMatchObject({
      deployedAt: "2026-06-14T00:02:00.000Z",
      runnerId: "runner.primary",
      state: "deployed",
      summary: "Deployed 2 resources.",
      targetId,
    });
    expect(
      deriveDeployLatestStatus({
        deploymentConfig: deploymentConfigRecord({
          ...baseConfig.values,
          observedAt: "2026-06-14T00:04:00.000Z",
          observedError: "Provider apply failed.",
          observedStatus: "failed",
        }),
        desiredState,
        now: "2026-06-14T00:05:00.000Z",
        targetId,
      }),
    ).toMatchObject({
      failedAt: "2026-06-14T00:04:00.000Z",
      state: "failed-current-version",
      summary: {
        code: "observed-failure",
        displayMessage: "Provider apply failed.",
      },
      targetId,
    });
    expect(drift).toMatchObject({
      state: "drift",
      summary: "1 resource drifted.",
      targetId,
    });
    expect(deployLatestStatusDisplaySummary(pending)).toEqual({
      detail: "Desired revision 0 pending",
      label: "Pending changes",
      state: "pending-changes",
      tone: "warning",
    });
    expect(deployLatestStatusDisplaySummary(drift)).toEqual({
      detail: "1 resource drifted.",
      label: "Drift detected",
      state: "drift",
      tone: "warning",
    });
  });

  it("composes display-safe observation patches and summaries", async () => {
    const targetId = "instance.primary" as DeployTargetId;
    const desiredState = await materializeDeployDesiredStateVersion({
      now: "2026-06-14T00:00:00.000Z",
      resourceGraph: deployResourceGraph([
        customDomainResource({
          inputs: {
            apiToken: "secret-token",
            host: "app.example.com",
            workerName: "formless-prod",
          },
          logicalId: "custom-domain:app.example.com",
          targetId,
        }),
      ]),
      source: { fingerprint: "control-plane:primary", intentRevision: 4 },
      targetId,
    });
    const deployed = deriveDeployLatestStatus({
      deploymentConfig: deploymentConfigRecord({
        observedAt: "2026-06-14T00:02:00.000Z",
        observedDesiredStateHash: desiredState.hash,
        observedRunnerId: "runner.primary",
        observedStatus: "deployed",
        observedSummary: "Deployed 1 resource.",
      }),
      desiredState,
      now: "2026-06-14T00:03:00.000Z",
      targetId,
    });
    const pending = deriveDeployLatestStatus({
      deploymentConfig: deploymentConfigRecord(),
      desiredState,
      now: "2026-06-14T00:04:00.000Z",
      targetId,
    });

    expect(deployResourceCountsByKind(desiredState.resourceGraph)).toEqual({
      "cloudflare-worker-custom-domain": 1,
    });
    expect(
      deployDeploymentObservationPatchFromLatestStatus({
        desiredState,
        fallbackRunnerId: "local-gateway",
        status: deployed,
      }),
    ).toEqual({
      observedAt: "2026-06-14T00:02:00.000Z",
      observedDesiredStateHash: desiredState.hash,
      observedRunnerId: "runner.primary",
      observedStatus: "deployed",
      observedSummary: "Deployed 1 resource.",
    });
    expect(
      deployDeploymentObservationPatchFromLatestStatus({
        desiredState,
        fallbackRunnerId: "local-gateway",
        status: pending,
      }),
    ).toEqual({
      observedAt: "2026-06-14T00:04:00.000Z",
      observedDesiredStateHash: desiredState.hash,
      observedRunnerId: "local-gateway",
      observedStatus: "unknown",
      observedSummary: "Desired revision 4 pending",
    });
    expect(
      deployDeploymentObservationPatch({
        desiredState,
        observedAt: "2026-06-14T00:05:00.000Z",
        observedError: "Provider failed.",
        observedStatus: "failed",
        observedSummary: "Provider failed.",
        runnerId: "local-gateway",
      }),
    ).toEqual({
      observedAt: "2026-06-14T00:05:00.000Z",
      observedDesiredStateHash: desiredState.hash,
      observedError: "Provider failed.",
      observedRunnerId: "local-gateway",
      observedStatus: "failed",
      observedSummary: "Provider failed.",
    });
    expect(
      deployDisplaySafeFailureSummary({
        code: "local-gateway-deploy-apply-failed",
        details: "  ",
        displayMessage: "Local workspace deploy apply failed.",
      }),
    ).toEqual({
      code: "local-gateway-deploy-apply-failed",
      displayMessage: "Local workspace deploy apply failed.",
    });
    expect(
      deployDeploymentAppliedSummary({
        resourceCount: desiredState.display.resourceCount,
        sourceLabel: "workspace source",
      }),
    ).toBe("1 deployment resource applied from workspace source.");
    expect(JSON.stringify(desiredState)).not.toContain("secret-token");
    expect(
      JSON.stringify(
        deployDeploymentObservationPatchFromLatestStatus({
          desiredState,
          status: deployed,
        }),
      ),
    ).not.toContain("secret-token");
  });
});

const domainRoutes = [
  {
    enabled: true,
    id: "route:host:publicSite:www.example.com",
    kind: "mount",
    matchHost: "WWW.Example.com.",
    matchPath: "/",
    matchPrefix: "/",
    providerConfig: "cloudflare-primary",
    surface: "public-site",
    targetProfile: "public-site",
  },
  {
    enabled: false,
    id: "route:host:publicSite:disabled.example.com",
    kind: "mount",
    matchHost: "disabled.example.com",
    matchPath: "/",
    matchPrefix: "/",
    surface: "public-site",
    targetProfile: "public-site",
  },
] satisfies ControlPlaneRouteProjectionRecord[];

const redirectRoutes = [
  {
    enabled: true,
    id: "route:redirect:old.example.com",
    kind: "redirect",
    matchHost: "Old.Example.com.",
    matchPath: "/",
    matchPrefix: "/",
    preservePath: true,
    preserveQueryString: true,
    providerConfig: "cloudflare-primary",
    statusCode: "308",
    toHost: "www.example.com",
  },
] satisfies ControlPlaneRouteProjectionRecord[];

const providerConfigs = [
  {
    id: "cloudflare-primary",
    providerFamily: "cloudflare",
    workerName: "demo-worker",
  },
] satisfies ControlPlaneProviderConfigProjectionRecord[];

const emailDomains = [
  {
    deploymentConfig: "cloudflare-primary",
    domain: "Mail.Example.com.",
    enabled: true,
    id: "email-domain:mail.example.com",
    providerFamily: "cloudflare",
  },
] satisfies ControlPlaneEmailDomainProjectionRecord[];

const emailSenders = [
  {
    address: "auth@mail.example.com",
    displayName: "Auth",
    emailDomain: "email-domain:mail.example.com",
    enabled: true,
    id: "email-sender:auth@mail.example.com",
    purpose: "auth",
  },
  {
    address: "System@Mail.Example.com",
    emailDomain: "email-domain:mail.example.com",
    enabled: true,
    id: "email-sender:system@mail.example.com",
    purpose: "system",
  },
  {
    address: "contact@mail.example.com",
    displayName: "Contact",
    emailDomain: "email-domain:mail.example.com",
    enabled: true,
    id: "email-sender:contact@mail.example.com",
    purpose: "contact-notification",
  },
  {
    address: "pending@mail.example.com",
    emailDomain: "email-domain:mail.example.com",
    enabled: true,
    id: "email-sender:pending@mail.example.com",
    purpose: "system",
  },
] satisfies ControlPlaneEmailSenderProjectionRecord[];

const sourceRecords = [
  {
    id: "app-install:site",
    entity: "app-install",
    createdAt: "2026-06-14T00:00:00.000Z",
    values: {
      installId: "site",
      packageAppKey: "site",
      registrationPolicy: "closed",
      status: "installed",
    },
  },
  {
    id: "app-install:deleted",
    entity: "app-install",
    createdAt: "2026-06-14T00:00:00.000Z",
    deletedAt: "2026-06-14T00:00:01.000Z",
    values: {
      installId: "deleted",
      packageAppKey: "site",
      registrationPolicy: "closed",
      status: "installed",
    },
  },
  {
    id: "cloudflare-primary",
    entity: "deployment-config",
    createdAt: "2026-06-14T00:00:00.000Z",
    values: {
      credentialRef: "secret:cloudflare:primary",
      enabled: true,
      observedDesiredStateHash: "sha256:ignored",
      providerFamily: "cloudflare",
      targetId: "instance.primary",
      targetKind: "instance",
      workerName: "primary-worker",
    },
  },
  {
    id: "cloudflare-secondary",
    entity: "deployment-config",
    createdAt: "2026-06-14T00:00:00.000Z",
    values: {
      enabled: true,
      providerFamily: "cloudflare",
      targetId: "instance.secondary",
      targetKind: "instance",
      workerName: "secondary-worker",
    },
  },
  {
    id: "route:site:public",
    entity: "route",
    createdAt: "2026-06-14T00:00:00.000Z",
    values: {
      deploymentConfig: "cloudflare-primary",
      enabled: true,
      kind: "mount",
      matchHost: "www.example.com",
      matchPath: "/",
      surface: "public-site",
      targetProfile: "public-site",
    },
  },
  {
    id: "route:site:secondary",
    entity: "route",
    createdAt: "2026-06-14T00:00:00.000Z",
    values: {
      deploymentConfig: "cloudflare-secondary",
      enabled: true,
      kind: "mount",
      matchHost: "secondary.example.com",
      matchPath: "/",
      surface: "public-site",
      targetProfile: "public-site",
    },
  },
  {
    id: "route:legacy-installed-public-site",
    entity: "route",
    createdAt: "2026-06-14T00:00:00.000Z",
    values: {
      appInstall: "site",
      deploymentConfig: "cloudflare-primary",
      enabled: true,
      kind: "mount",
      matchHost: "legacy.example.com",
      matchPath: "/",
      surface: "public-site",
      targetProfile: "public-site",
    },
  },
] satisfies ControlPlaneProjectionSourceRecord[];

const emailSourceRecords = [
  {
    id: "email-domain:mail.example.com",
    entity: "email-domain",
    createdAt: "2026-06-14T00:00:00.000Z",
    values: {
      deploymentConfig: "cloudflare-primary",
      domain: "Mail.Example.com.",
      enabled: true,
      providerFamily: "cloudflare",
    },
  },
  {
    id: "email-sender:auth@mail.example.com",
    entity: "email-sender",
    createdAt: "2026-06-14T00:00:00.000Z",
    values: {
      address: "Auth@Mail.Example.com",
      displayName: "Auth",
      emailDomain: "email-domain:mail.example.com",
      enabled: true,
      purpose: "auth",
    },
  },
  {
    id: "email-sender:contact@mail.example.com",
    entity: "email-sender",
    createdAt: "2026-06-14T00:00:00.000Z",
    values: {
      address: "Contact@Mail.Example.com",
      displayName: "Contact",
      emailDomain: "email-domain:mail.example.com",
      enabled: true,
      purpose: "contact-notification",
    },
  },
  {
    id: "email-sender:pending@mail.example.com",
    entity: "email-sender",
    createdAt: "2026-06-14T00:00:00.000Z",
    values: {
      address: "pending@mail.example.com",
      emailDomain: "email-domain:mail.example.com",
      enabled: true,
      purpose: "system",
    },
  },
  {
    id: "email-sender:disabled@mail.example.com",
    entity: "email-sender",
    createdAt: "2026-06-14T00:00:00.000Z",
    values: {
      address: "disabled@mail.example.com",
      emailDomain: "email-domain:mail.example.com",
      enabled: false,
      purpose: "system",
    },
  },
] satisfies ControlPlaneProjectionSourceRecord[];

function deployHashInput(resources: DeployResourceGraph["resources"]): DeployDesiredStateHashInput {
  const targetId = "instance.primary" as DeployTargetId;

  return {
    resourceGraph: deployResourceGraph(resources, targetId),
    schemaVersion: 1,
    targetId,
  };
}

function deployResourceGraph(
  resources: DeployResourceGraph["resources"],
  targetId: DeployTargetId = "instance.primary",
): DeployResourceGraph {
  return {
    resources,
    targetId,
  };
}

function customDomainResource(
  input: Partial<DeployResourceGraph["resources"][number]> & {
    logicalId: string;
  },
): DeployResourceGraph["resources"][number] {
  const { logicalId, ...overrides } = input;

  return {
    dependencies: [],
    inputs: {},
    kind: "cloudflare-worker-custom-domain",
    logicalId,
    providerFamily: "cloudflare",
    targetId: "instance.primary",
    ...overrides,
  };
}

function dnsRecordsResource(
  input: Partial<DeployResourceGraph["resources"][number]> & {
    logicalId: string;
  },
): DeployResourceGraph["resources"][number] {
  const { logicalId, ...overrides } = input;

  return {
    dependencies: [],
    inputs: {},
    kind: "cloudflare-dns-records",
    logicalId,
    providerFamily: "cloudflare",
    targetId: "instance.primary",
    ...overrides,
  };
}

function deploymentConfigRecord(
  values: Record<string, unknown> = {},
): ControlPlaneDeploymentConfigObservationRecord {
  return {
    createdAt: "2026-06-14T00:00:00.000Z",
    entity: "deployment-config",
    id: "instance.primary",
    values: {
      enabled: true,
      label: "Primary",
      providerFamily: "cloudflare",
      targetId: "instance.primary",
      targetKind: "instance",
      targetUrl: "https://primary.example.workers.dev",
      ...values,
    },
  };
}
