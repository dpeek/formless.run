import {
  DOMAIN_PROVIDER_RUNNER_MUTATION_ENV_NAMES,
  INSTANCE_DOMAIN_PROVIDER_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_DELETE_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_DELETE_JOBS_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_MANUAL_CLEANUP_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_PLAN_API_PATH,
  type DomainProviderConfigIssue,
  type DomainProviderConfigStatus,
  type InstanceDomainProviderDeleteBlockedCode,
  type InstanceDomainProviderDeleteJob,
  type InstanceDomainProviderDeleteJobResourceEvidence,
  type InstanceDomainProviderDeleteJobResponse,
  type InstanceDomainProviderDeleteJobResultRequest,
  type InstanceDomainProviderDeleteRequest,
  type InstanceDomainProviderDeleteResponse,
  type InstanceDomainProviderDeleteTarget,
  type InstanceDomainProviderJobResultSummary,
  type InstanceDomainProviderManualCleanupRequest,
  type InstanceDomainProviderManualCleanupResponse,
  type InstanceDomainProviderPlanResponse,
  type InstanceDomainProviderRedirectIntent,
} from "../shared/domain-provider-api.ts";
import { planDomainProviderResources } from "../shared/domain-provider-planner.ts";
import type {
  DomainProviderCustomDomainResource,
  DomainProviderPlan,
  DomainProviderPlanPolicy,
  DomainProviderRedirectIntent,
  DomainProviderResource,
  DomainProviderRedirectStatusCode,
  DomainProviderResourceKind,
  DomainProviderZone,
} from "../shared/domain-provider-protocol.ts";
import {
  listInstanceDomainMappings,
  normalizeInstanceDomainHost,
  type InstanceDomainMapping,
  type InstanceDomainMappingAppliedState,
} from "../shared/instance-domain-mappings.ts";
import { nowIsoString } from "../shared/clock.ts";
import { authorizeInstanceWrite, type AuthorityAdminGuardEnv } from "./authority-admin-guard.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import {
  deleteInstanceDomainMappingAppliedState,
  readInstanceDomainMappingAppliedStates,
} from "./instance-domain-mappings-state.ts";
import { readControlPlaneRecords } from "./deployment-control-plane-client.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import {
  createSqlStorageMigrationRegistry,
  runSqlStorageMigrations,
  storageSqlMigrationFamily,
} from "./sql-migrations.ts";

const providerMutationLockId = "domain-provider-mutation";
const providerMutationLockTableSql = `
  CREATE TABLE IF NOT EXISTS instance_domain_provider_mutation_lock (
    lock_id TEXT PRIMARY KEY CHECK (lock_id = '${providerMutationLockId}'),
    acquired_at TEXT NOT NULL
  )
`;
const deleteJobsTableSql = `
  CREATE TABLE IF NOT EXISTS instance_domain_provider_delete_jobs (
    job_id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('ready', 'running', 'succeeded', 'failed')),
    runner_id TEXT,
    plan_json TEXT NOT NULL,
    targets_json TEXT NOT NULL,
    deployment_attempt_id TEXT,
    deployment_target_id TEXT,
    deployment_desired_state_version_id TEXT,
    deployment_desired_state_revision INTEGER,
    deployment_desired_state_hash TEXT,
    deployment_lease_token TEXT,
    result_json TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;
const appliedResourcesTableSql = `
  CREATE TABLE IF NOT EXISTS instance_domain_provider_applied_resources (
    logical_id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    host TEXT NOT NULL,
    account_id TEXT NOT NULL,
    alchemy_resource_id TEXT NOT NULL,
    runner_id TEXT,
    zone_id TEXT NOT NULL,
    zone_name TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    resource_json TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('adopted', 'created', 'deleted', 'manually-removed', 'overridden')),
    applied_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;
const providerAuditEventsTableSql = `
  CREATE TABLE IF NOT EXISTS instance_domain_provider_audit_events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    logical_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    host TEXT NOT NULL,
    account_id TEXT NOT NULL,
    alchemy_resource_id TEXT NOT NULL,
    runner_id TEXT,
    zone_id TEXT NOT NULL,
    zone_name TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    resource_json TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('adopted', 'created', 'deleted', 'manually-removed', 'overridden')),
    applied_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

const domainProviderDeleteJobsSqlMigrationFamily = storageSqlMigrationFamily(
  "instance-domain-provider-delete-jobs",
);
const domainProviderAppliedResourcesSqlMigrationFamily = storageSqlMigrationFamily(
  "instance-domain-provider-applied-resources",
);
const domainProviderSqlMigrations = createSqlStorageMigrationRegistry([
  {
    id: "2026-05-28-domain-provider-delete-job-deployment-columns",
    owner: "formless",
    family: domainProviderDeleteJobsSqlMigrationFamily,
    checksum: "sha256:e8d9708c9716840a49b7cb9b6505712a897b8e8e03aae02121ad53709de3f468",
    safety: "auto-safe",
    summary: "Add deployment linkage columns to domain provider delete jobs.",
    apply: migrateDomainProviderDeleteJobDeploymentColumns,
  },
  {
    id: "2026-05-28-domain-provider-applied-action-checks",
    owner: "formless",
    family: domainProviderAppliedResourcesSqlMigrationFamily,
    checksum: "sha256:8c55d0aba3c55d9e0b9026382c40d66610a501fbea8faddd2bfd90d9fee37b10",
    safety: "auto-safe",
    summary: "Rewrite domain provider applied action checks to include manual removals.",
    apply: migrateDomainProviderAppliedActionChecks,
  },
]);

type InstanceDomainProviderApiEnv = AuthorityAdminGuardEnv & {
  ALCHEMY_PASSWORD?: string;
  CF_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  FORMLESS_AUTHORITY: DurableObjectNamespace;
  FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID?: string;
  FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID?: string;
  FORMLESS_DOMAIN_PROVIDER_WORKER_NAME?: string;
  FORMLESS_DOMAIN_PROVIDER_ZONE_ID?: string;
  FORMLESS_DOMAIN_PROVIDER_ZONE_NAME?: string;
  FORMLESS_DOMAIN_PROVIDER_ZONES?: string;
};

type DurableObjectDomainProviderEnv = Omit<InstanceDomainProviderApiEnv, "FORMLESS_AUTHORITY"> & {
  FORMLESS_AUTHORITY?: DurableObjectNamespace;
};

export const INTERNAL_RESET_INSTANCE_DOMAIN_PROVIDER_PATH =
  "/_internal/reset-instance-domain-provider";

type DomainProviderMutationLockResult =
  | { acquired: true }
  | {
      acquired: false;
      acquiredAt: string;
    };

type DomainProviderPlanOptions = {
  host?: string;
  policy?: DomainProviderPlanPolicy;
};

type DomainProviderDeleteOptions = {
  host?: string;
  kind?: DomainProviderResourceKind;
  logicalId?: string;
};

type DomainProviderDeleteJobRow = {
  deployment_attempt_id: string | null;
  deployment_desired_state_hash: string | null;
  deployment_desired_state_revision: number | null;
  deployment_desired_state_version_id: string | null;
  deployment_lease_token: string | null;
  deployment_target_id: string | null;
  job_id: string;
  status: InstanceDomainProviderDeleteJob["status"];
  runner_id: string | null;
  plan_json: string;
  targets_json: string;
  result_json: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export async function handleInstanceDomainProviderApiRequest(
  request: Request,
  env: InstanceDomainProviderApiEnv,
): Promise<Response | undefined> {
  if (!isInstanceDomainProviderApiPath(new URL(request.url).pathname)) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleInstanceDomainProviderDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: DurableObjectDomainProviderEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (url.pathname === INTERNAL_RESET_INSTANCE_DOMAIN_PROVIDER_PATH) {
    if (request.method !== "POST") {
      return methodNotAllowedResponse("POST");
    }

    resetInstanceDomainProviderTables(storage);

    return jsonResponse({ reset: true });
  }

  if (!isInstanceDomainProviderApiPath(url.pathname)) {
    return undefined;
  }

  const deleteJobPath = parseDeleteJobPath(url.pathname);

  if (deleteJobPath) {
    if (deleteJobPath.result) {
      return handleDeleteJobResultRequest(request, storage, env, deleteJobPath.jobId);
    }

    return handleDeleteJobStatusRequest(request, storage, deleteJobPath.jobId);
  }

  if (
    url.pathname === INSTANCE_DOMAIN_PROVIDER_API_PATH ||
    url.pathname === INSTANCE_DOMAIN_PROVIDER_PLAN_API_PATH
  ) {
    if (request.method !== "GET") {
      return methodNotAllowedResponse("GET");
    }

    const options = parsePlanOptions(url.searchParams);

    if (!options.ok) {
      return jsonResponse({ error: options.error }, 400);
    }

    return jsonResponse(
      await domainProviderPlanResponse(storage, env, options.options, request.url),
    );
  }

  if (url.pathname === INSTANCE_DOMAIN_PROVIDER_DELETE_API_PATH) {
    return handleDeleteRequest(request, storage, env);
  }

  if (url.pathname === INSTANCE_DOMAIN_PROVIDER_MANUAL_CLEANUP_API_PATH) {
    return handleManualCleanupRequest(request, storage, env);
  }

  return jsonResponse({ error: "Not found." }, 404);
}

function resetInstanceDomainProviderTables(storage: DurableObjectStorage) {
  ensureDomainProviderMutationLockTable(storage);
  ensureDomainProviderDeleteJobsTable(storage);
  ensureDomainProviderAppliedResourcesTables(storage);

  storage.transactionSync(() => {
    storage.sql.exec(`
      DELETE FROM instance_domain_provider_mutation_lock;
      DELETE FROM instance_domain_provider_delete_jobs;
      DELETE FROM instance_domain_provider_applied_resources;
      DELETE FROM instance_domain_provider_audit_events;
      DROP TABLE IF EXISTS instance_domain_provider_redirect_intents;
      DROP TABLE IF EXISTS instance_domain_provider_redirect_intent_cleanup_events;
      DELETE FROM sqlite_sequence
      WHERE name = 'instance_domain_provider_audit_events';
    `);
  });
}

function handleDeleteRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: DurableObjectDomainProviderEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return Promise.resolve(methodNotAllowedResponse("POST"));
  }

  return deleteWithAuthorization(request, storage, env);
}

function handleManualCleanupRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: DurableObjectDomainProviderEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return Promise.resolve(methodNotAllowedResponse("POST"));
  }

  return manualCleanupWithAuthorization(request, storage, env);
}

async function deleteWithAuthorization(
  request: Request,
  storage: DurableObjectStorage,
  env: DurableObjectDomainProviderEnv,
): Promise<Response> {
  const authorization = await authorizeInstanceWrite(request, env);

  if (!authorization.authorized) {
    return jsonResponse(
      { error: authorization.error },
      authorization.status,
      authorization.headers,
    );
  }

  const deleteRequest = await readDeleteRequest(request);

  if (!deleteRequest.ok) {
    return jsonResponse({ error: deleteRequest.error }, 400);
  }

  const config = domainProviderConfigStatus(env);
  const deletePlan = domainProviderDeletePlan(storage, config, deleteRequest.options);

  if (!config.deleteReady) {
    return deleteBlockedResponse(
      "domain-provider-delete-not-configured",
      "Domain provider delete is not configured. Review config issues before deleting provider resources.",
      config,
      deletePlan,
      409,
    );
  }

  if (deletePlan.targets.length === 0) {
    return deleteBlockedResponse(
      "domain-provider-delete-empty",
      "Domain provider delete found no recorded provider resources for the requested selector.",
      config,
      deletePlan,
      404,
    );
  }

  const now = nowIsoString();
  const lock = acquireDomainProviderMutationLock(storage, now);

  if (!lock.acquired) {
    return deleteBlockedResponse(
      "domain-provider-delete-running",
      `Domain provider mutation is already running since ${lock.acquiredAt}.`,
      config,
      deletePlan,
      409,
    );
  }

  const jobId = `domain-provider-delete-${crypto.randomUUID()}`;
  let job: InstanceDomainProviderDeleteJob;

  try {
    job = writeDeleteJob(storage, {
      jobId,
      now,
      plan: deletePlan.plan,
      runnerId: deleteRequest.request.runnerId,
      targets: deletePlan.targets,
    });
  } catch (error) {
    releaseDomainProviderMutationLock(storage);
    throw error;
  }

  return jsonResponse(
    {
      code: "domain-provider-delete-job-ready",
      config,
      job,
      plan: deletePlan.plan,
      status: "ready",
      targets: deletePlan.targets,
    } satisfies InstanceDomainProviderDeleteResponse,
    202,
  );
}

async function manualCleanupWithAuthorization(
  request: Request,
  storage: DurableObjectStorage,
  env: DurableObjectDomainProviderEnv,
): Promise<Response> {
  const authorization = await authorizeInstanceWrite(request, env);

  if (!authorization.authorized) {
    return jsonResponse(
      { error: authorization.error },
      authorization.status,
      authorization.headers,
    );
  }

  const cleanupRequest = await readManualCleanupRequest(request);

  if (!cleanupRequest.ok) {
    return jsonResponse({ error: cleanupRequest.error }, 400);
  }

  const result = markDomainProviderResourceManuallyRemoved(storage, {
    now: nowIsoString(),
    request: cleanupRequest.request,
    targetOptions: cleanupRequest.options,
    targetConfig: domainProviderConfigStatus(env),
  });

  if (!result.ok) {
    return jsonResponse({ code: result.code, error: result.error }, result.status);
  }

  return jsonResponse({
    action: "manually-removed",
    status: "cleaned",
    target: result.target,
  } satisfies InstanceDomainProviderManualCleanupResponse);
}

function handleDeleteJobStatusRequest(
  request: Request,
  storage: DurableObjectStorage,
  jobId: string,
): Response {
  if (request.method !== "GET") {
    return methodNotAllowedResponse("GET");
  }

  const job = readDeleteJob(storage, jobId);

  if (!job) {
    return jsonResponse({ error: "Domain provider delete job was not found." }, 404);
  }

  return jsonResponse({ job } satisfies InstanceDomainProviderDeleteJobResponse);
}

async function handleDeleteJobResultRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: DurableObjectDomainProviderEnv,
  jobId: string,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  const authorization = await authorizeInstanceWrite(request, env);

  if (!authorization.authorized) {
    return jsonResponse(
      { error: authorization.error },
      authorization.status,
      authorization.headers,
    );
  }

  const result = await readDeleteJobResultRequest(request);

  if (!result.ok) {
    return jsonResponse({ error: result.error }, 400);
  }

  const completed = await completeDeleteJob(storage, {
    env,
    jobId,
    now: nowIsoString(),
    requestUrl: request.url,
    result: result.request,
  });

  if (!completed.ok) {
    return jsonResponse({ error: completed.error }, completed.status);
  }

  return jsonResponse({ job: completed.job } satisfies InstanceDomainProviderDeleteJobResponse);
}

async function domainProviderPlanResponse(
  storage: DurableObjectStorage,
  env: DurableObjectDomainProviderEnv,
  options: DomainProviderPlanOptions = {},
  requestUrl: string,
): Promise<InstanceDomainProviderPlanResponse> {
  const config = domainProviderConfigStatus(env);
  const intent = await readControlPlaneSyncedDomainProviderIntent(storage, env, requestUrl);
  const redirectIntents = intent.redirectIntents;
  const plan = planDomainProviderResources({
    instanceId: config.instanceId ?? "unconfigured-instance",
    mappings: intent.mappings
      .filter((mapping) => options.host === undefined || mapping.host === options.host)
      .map((mapping) => ({
        enabled: mapping.enabled,
        host: mapping.host,
        profile: mapping.profile,
      })),
    policy: options.policy ?? "create-only",
    redirectIntents: redirectIntents
      .filter((intent) => options.host === undefined || intent.fromHost === options.host)
      .map((intent) => redirectIntentForPlan(intent)),
    workerName: config.workerName ?? "unconfigured-worker",
    zones: config.zones,
  });

  return {
    config,
    plan,
    redirectIntents,
  };
}

function domainProviderDeletePlan(
  storage: DurableObjectStorage,
  config: DomainProviderConfigStatus,
  options: DomainProviderDeleteOptions,
): { plan: DomainProviderPlan; targets: InstanceDomainProviderDeleteTarget[] } {
  const targets = readDomainProviderDeleteTargets(storage, config).filter((target) =>
    deleteTargetMatches(target, options),
  );
  const resources = targets.map((target) => resourceFromDeleteTarget(target, config));

  return {
    plan: {
      blockers: [],
      instanceId: normalizeLogicalIdPart(config.instanceId ?? "unconfigured-instance", "instance"),
      policy: "create-only",
      resources,
      workerName:
        config.workerName ??
        targets.find((target) => target.workerName !== undefined)?.workerName ??
        "unconfigured-worker",
    },
    targets,
  };
}

function readDomainProviderDeleteTargets(
  storage: DurableObjectStorage,
  config: DomainProviderConfigStatus,
): InstanceDomainProviderDeleteTarget[] {
  const targets: InstanceDomainProviderDeleteTarget[] = [];
  const instanceId = normalizeLogicalIdPart(
    config.instanceId ?? "unconfigured-instance",
    "instance",
  );

  for (const state of readInstanceDomainMappingAppliedStates(storage)) {
    if (state.action === "deleted" || state.action === "manually-removed") {
      continue;
    }

    const logicalId =
      state.alchemyResourceId ??
      logicalResourceId(instanceId, "custom-domain", state.host, state.profile);

    targets.push({
      accountId: state.accountId,
      action: state.action,
      ...(state.alchemyResourceId === undefined
        ? {}
        : { alchemyResourceId: state.alchemyResourceId }),
      host: state.host,
      kind: "cloudflare-worker-custom-domain",
      logicalId,
      profile: state.profile,
      resourceId: state.workerDomainId,
      resourceJson: JSON.stringify(state),
      ...(state.runnerId === undefined ? {} : { runnerId: state.runnerId }),
      workerName: state.workerName,
      zoneId: state.zoneId,
      zoneName: state.zoneName,
    });
  }

  return targets.sort((left, right) =>
    `${left.host}\u0000${left.kind}\u0000${left.logicalId}`.localeCompare(
      `${right.host}\u0000${right.kind}\u0000${right.logicalId}`,
    ),
  );
}

function deleteTargetMatches(
  target: InstanceDomainProviderDeleteTarget,
  options: DomainProviderDeleteOptions,
): boolean {
  return (
    (options.host === undefined || target.host === options.host) &&
    (options.kind === undefined || target.kind === options.kind) &&
    (options.logicalId === undefined || target.logicalId === options.logicalId)
  );
}

function resourceFromDeleteTarget(
  target: InstanceDomainProviderDeleteTarget,
  config: DomainProviderConfigStatus,
): DomainProviderResource {
  return customDomainResourceFromDeleteTarget(target, config);
}

function customDomainResourceFromDeleteTarget(
  target: InstanceDomainProviderDeleteTarget,
  config: DomainProviderConfigStatus,
): DomainProviderCustomDomainResource {
  if (!target.profile) {
    throw new Error(`Custom Domain delete target "${target.logicalId}" is missing a profile.`);
  }

  const workerName = target.workerName ?? config.workerName ?? "unconfigured-worker";

  return {
    kind: "cloudflare-worker-custom-domain",
    logicalId: target.logicalId,
    host: target.host,
    profile: target.profile,
    props: {
      adopt: target.action === "adopted" || target.action === "overridden",
      name: target.host,
      overrideExistingOrigin: target.action === "overridden",
      workerName,
      zoneId: target.zoneId,
    },
    zone: { id: target.zoneId, name: target.zoneName },
  };
}

function domainProviderConfigStatus(
  env: DurableObjectDomainProviderEnv,
): DomainProviderConfigStatus {
  const instanceId = optionalEnv(env.FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID);
  const workerName = optionalEnv(env.FORMLESS_DOMAIN_PROVIDER_WORKER_NAME);
  const accountId =
    optionalEnv(env.FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID) ??
    optionalEnv(env.CLOUDFLARE_ACCOUNT_ID);
  const cloudflareApiToken = optionalEnv(env.CLOUDFLARE_API_TOKEN) ?? optionalEnv(env.CF_API_TOKEN);
  const alchemyPassword = optionalEnv(env.ALCHEMY_PASSWORD);
  const zoneResult = parseConfiguredZones(env);
  const issues: DomainProviderConfigIssue[] = [];

  if (!instanceId) {
    issues.push(configIssue("missing-instance-id", ["FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID"]));
  }

  if (!workerName) {
    issues.push(configIssue("missing-worker-name", ["FORMLESS_DOMAIN_PROVIDER_WORKER_NAME"]));
  }

  if (!accountId) {
    issues.push(
      configIssue("missing-account-id", [
        "FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID",
        "CLOUDFLARE_ACCOUNT_ID",
      ]),
    );
  }

  if (!zoneResult.ok) {
    issues.push(zoneResult.issue);
  } else if (zoneResult.zones.length === 0) {
    issues.push(
      configIssue("missing-zone-config", [
        "FORMLESS_DOMAIN_PROVIDER_ZONES",
        "FORMLESS_DOMAIN_PROVIDER_ZONE_ID",
        "FORMLESS_DOMAIN_PROVIDER_ZONE_NAME",
      ]),
    );
  }

  const deleteReady = Boolean(
    instanceId && workerName && accountId && zoneResult.ok && zoneResult.zones.length > 0,
  );
  const planReady = deleteReady;

  return {
    ...(accountId === undefined ? {} : { accountId }),
    alchemyPassword: {
      configured: Boolean(alchemyPassword),
      envNames: ["ALCHEMY_PASSWORD"],
    },
    cloudflareApiToken: {
      configured: Boolean(cloudflareApiToken),
      envNames: ["CLOUDFLARE_API_TOKEN", "CF_API_TOKEN"],
    },
    deleteReady,
    ...(instanceId === undefined ? {} : { instanceId }),
    issues,
    planReady,
    runnerMutation: {
      checkedBy: "node-runner",
      requiredEnvNames: [...DOMAIN_PROVIDER_RUNNER_MUTATION_ENV_NAMES],
    },
    ...(workerName === undefined ? {} : { workerName }),
    zones: zoneResult.ok ? zoneResult.zones : [],
  };
}

function parseConfiguredZones(
  env: DurableObjectDomainProviderEnv,
): { ok: true; zones: DomainProviderZone[] } | { ok: false; issue: DomainProviderConfigIssue } {
  const zonesJson = optionalEnv(env.FORMLESS_DOMAIN_PROVIDER_ZONES);

  if (zonesJson !== undefined) {
    try {
      const parsed = JSON.parse(zonesJson) as unknown;

      if (!Array.isArray(parsed)) {
        return invalidZoneConfigIssue();
      }

      return { ok: true, zones: parsed.map(parseZone) };
    } catch {
      return invalidZoneConfigIssue();
    }
  }

  const zoneId = optionalEnv(env.FORMLESS_DOMAIN_PROVIDER_ZONE_ID);
  const zoneName = optionalEnv(env.FORMLESS_DOMAIN_PROVIDER_ZONE_NAME);

  if (zoneId === undefined && zoneName === undefined) {
    return { ok: true, zones: [] };
  }

  if (zoneId === undefined || zoneName === undefined) {
    return invalidZoneConfigIssue();
  }

  return { ok: true, zones: [{ id: zoneId, name: zoneName }] };
}

function parseZone(value: unknown): DomainProviderZone {
  if (!isRecord(value)) {
    throw new Error("Zone must be an object.");
  }

  const id = optionalEnv(value.id);
  const name = optionalEnv(value.name);

  if (id === undefined || name === undefined) {
    throw new Error("Zone id and name are required.");
  }

  return { id, name };
}

function invalidZoneConfigIssue(): { ok: false; issue: DomainProviderConfigIssue } {
  return {
    ok: false,
    issue: {
      code: "invalid-zone-config",
      envNames: [
        "FORMLESS_DOMAIN_PROVIDER_ZONES",
        "FORMLESS_DOMAIN_PROVIDER_ZONE_ID",
        "FORMLESS_DOMAIN_PROVIDER_ZONE_NAME",
      ],
      message:
        'Domain provider zones must be configured as JSON [{"id":"zone-id","name":"example.com"}] or as one zone id/name pair.',
    },
  };
}

async function readControlPlaneSyncedDomainProviderIntent(
  _storage: DurableObjectStorage,
  env: DurableObjectDomainProviderEnv,
  requestUrl: string,
): Promise<{
  mappings: InstanceDomainMapping[];
  redirectIntents: InstanceDomainProviderRedirectIntent[];
}> {
  const records = await readControlPlaneRecords({ env, requestUrl });

  if (records === undefined) {
    return {
      mappings: [],
      redirectIntents: [],
    };
  }

  return {
    mappings: domainMappingsFromControlPlaneRecords(records),
    redirectIntents: redirectIntentsFromControlPlaneRecords(records),
  };
}

function domainMappingsFromControlPlaneRecords(
  records: readonly StoredRecord[],
): InstanceDomainMapping[] {
  return listInstanceDomainMappings(
    records.flatMap((record) => {
      if (
        record.deletedAt ||
        record.entity !== "route" ||
        record.values.enabled !== true ||
        record.values.kind !== "mount" ||
        typeof record.values.matchHost !== "string"
      ) {
        return [];
      }

      const profile = domainMappingProfileFromRouteTarget(record.values.targetProfile);

      if (profile === undefined) {
        return [];
      }

      return [
        {
          host: String(record.values.matchHost),
          profile,
          enabled: true,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        },
      ];
    }),
  );
}

function domainMappingProfileFromRouteTarget(
  value: unknown,
): InstanceDomainMapping["profile"] | undefined {
  if (value === "instance") {
    return value;
  }

  if (value === "public-site") {
    return "publicSite";
  }

  return undefined;
}

function redirectIntentsFromControlPlaneRecords(
  records: readonly StoredRecord[],
): InstanceDomainProviderRedirectIntent[] {
  return records
    .filter(
      (record) =>
        !record.deletedAt &&
        record.entity === "route" &&
        record.values.enabled === true &&
        record.values.kind === "redirect" &&
        typeof record.values.matchHost === "string",
    )
    .map((record) => ({
      fromHost: String(record.values.matchHost),
      ...(typeof record.values.toHost === "string" ? { toHost: record.values.toHost } : {}),
      ...(typeof record.values.toUrl === "string" ? { toUrl: record.values.toUrl } : {}),
      statusCode: Number(record.values.statusCode) as DomainProviderRedirectStatusCode,
      preservePath: record.values.preservePath === true,
      preserveQueryString: record.values.preserveQueryString === true,
      enabled: record.values.enabled === true,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }))
    .sort((left, right) => left.fromHost.localeCompare(right.fromHost));
}

function redirectIntentForPlan(
  intent: InstanceDomainProviderRedirectIntent,
): DomainProviderRedirectIntent {
  return {
    enabled: intent.enabled,
    fromHost: intent.fromHost,
    preservePath: intent.preservePath,
    preserveQueryString: intent.preserveQueryString,
    statusCode: intent.statusCode,
    ...(intent.toHost === undefined ? {} : { toHost: intent.toHost }),
    ...(intent.toUrl === undefined ? {} : { toUrl: intent.toUrl }),
  };
}

function writeDeleteJob(
  storage: DurableObjectStorage,
  input: {
    jobId: string;
    now: string;
    plan: DomainProviderPlan;
    runnerId?: string;
    targets: readonly InstanceDomainProviderDeleteTarget[];
  },
): InstanceDomainProviderDeleteJob {
  ensureDomainProviderDeleteJobsTable(storage);

  storage.sql.exec(
    `
      INSERT INTO instance_domain_provider_delete_jobs (
        job_id,
        status,
        runner_id,
        plan_json,
        targets_json,
        deployment_attempt_id,
        deployment_target_id,
        deployment_desired_state_version_id,
        deployment_desired_state_revision,
        deployment_desired_state_hash,
        deployment_lease_token,
        result_json,
        error,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
    `,
    input.jobId,
    "ready",
    input.runnerId ?? null,
    JSON.stringify(input.plan),
    JSON.stringify(input.targets),
    null,
    null,
    null,
    null,
    null,
    null,
    input.now,
    input.now,
  );

  const job = readDeleteJob(storage, input.jobId);

  if (!job) {
    throw new Error("Domain provider delete job was not written.");
  }

  return job;
}

async function completeDeleteJob(
  storage: DurableObjectStorage,
  input: {
    env: DurableObjectDomainProviderEnv;
    jobId: string;
    now: string;
    requestUrl: string;
    result: InstanceDomainProviderDeleteJobResultRequest;
  },
): Promise<
  { ok: true; job: InstanceDomainProviderDeleteJob } | { ok: false; error: string; status: number }
> {
  const job = readDeleteJob(storage, input.jobId);

  if (!job) {
    return { ok: false, error: "Domain provider delete job was not found.", status: 404 };
  }

  if (job.status === "succeeded" || job.status === "failed") {
    return { ok: false, error: "Domain provider delete job is already complete.", status: 409 };
  }

  if (
    job.runnerId !== undefined &&
    input.result.runnerId !== undefined &&
    job.runnerId !== input.result.runnerId
  ) {
    return {
      ok: false,
      error: "Domain provider delete job runner id does not match.",
      status: 409,
    };
  }

  if (input.result.status === "failed") {
    return finishDeleteJob(storage, {
      error: input.result.error,
      job,
      now: input.now,
      result: { error: input.result.error, evidenceCount: 0 },
      runnerId: input.result.runnerId,
      status: "failed",
    });
  }

  const validated = validateDeleteEvidence(job, input.result.resources);

  if (!validated.ok) {
    return { ok: false, error: validated.error, status: 400 };
  }

  const targets = new Map(job.targets.map((target) => [target.logicalId, target]));

  for (const evidence of input.result.resources) {
    const target = targets.get(evidence.logicalId);

    if (!target) {
      return {
        ok: false,
        error: `Domain provider delete evidence resource "${evidence.logicalId}" was not in the job.`,
        status: 400,
      };
    }

    deleteInstanceDomainMappingAppliedState(storage, {
      now: input.now,
      runnerId: input.result.runnerId ?? job.runnerId,
      state: customDomainAppliedStateFromDeleteTarget(target, input.now),
    });
  }

  return finishDeleteJob(storage, {
    job,
    now: input.now,
    result: { evidenceCount: input.result.resources.length },
    runnerId: input.result.runnerId,
    status: "succeeded",
  });
}

function finishDeleteJob(
  storage: DurableObjectStorage,
  input: {
    error?: string;
    job: InstanceDomainProviderDeleteJob;
    now: string;
    result: InstanceDomainProviderJobResultSummary;
    runnerId?: string;
    status: "failed" | "succeeded";
  },
): { ok: true; job: InstanceDomainProviderDeleteJob } {
  ensureDomainProviderDeleteJobsTable(storage);

  storage.sql.exec(
    `
      UPDATE instance_domain_provider_delete_jobs
      SET status = ?,
          runner_id = ?,
          result_json = ?,
          error = ?,
          updated_at = ?
      WHERE job_id = ?
    `,
    input.status,
    input.runnerId ?? input.job.runnerId ?? null,
    JSON.stringify(input.result),
    input.error ?? null,
    input.now,
    input.job.jobId,
  );
  releaseDomainProviderMutationLock(storage);

  const job = readDeleteJob(storage, input.job.jobId);

  if (!job) {
    throw new Error("Domain provider delete job disappeared after completion.");
  }

  return { ok: true, job };
}

function validateDeleteEvidence(
  job: InstanceDomainProviderDeleteJob,
  resources: readonly InstanceDomainProviderDeleteJobResourceEvidence[],
): { ok: true } | { ok: false; error: string } {
  const targets = new Map(job.targets.map((target) => [target.logicalId, target]));
  const evidenceIds = new Set(resources.map((resource) => resource.logicalId));

  for (const target of job.targets) {
    if (!evidenceIds.has(target.logicalId)) {
      return {
        ok: false,
        error: `Domain provider delete evidence is missing resource "${target.logicalId}".`,
      };
    }
  }

  for (const evidence of resources) {
    const target = targets.get(evidence.logicalId);

    if (!target) {
      return {
        ok: false,
        error: `Domain provider delete evidence resource "${evidence.logicalId}" was not in the job.`,
      };
    }

    if (
      evidence.action !== "deleted" ||
      evidence.host !== target.host ||
      evidence.kind !== target.kind
    ) {
      return {
        ok: false,
        error: `Domain provider delete evidence for "${evidence.logicalId}" does not match the job target.`,
      };
    }
  }

  return { ok: true };
}

function markDomainProviderResourceManuallyRemoved(
  storage: DurableObjectStorage,
  input: {
    now: string;
    request: InstanceDomainProviderManualCleanupRequest;
    targetConfig: DomainProviderConfigStatus;
    targetOptions: Required<DomainProviderDeleteOptions>;
  },
):
  | { ok: true; target: InstanceDomainProviderDeleteTarget }
  | { ok: false; code: string; error: string; status: number } {
  ensureDomainProviderAppliedResourcesTables(storage);

  const deletePlan = domainProviderDeletePlan(storage, input.targetConfig, input.targetOptions);

  if (deletePlan.targets.length === 0) {
    return {
      ok: false,
      code: "domain-provider-manual-cleanup-not-found",
      error: `Domain provider manual cleanup found no recorded ${input.request.kind} resource "${input.request.logicalId}" for "${input.request.host}".`,
      status: 404,
    };
  }

  if (deletePlan.targets.length > 1) {
    return {
      ok: false,
      code: "domain-provider-manual-cleanup-ambiguous",
      error:
        "Domain provider manual cleanup requires one exact recorded provider resource identity.",
      status: 409,
    };
  }

  const target = deletePlan.targets[0];

  if (!target) {
    throw new Error("Domain provider manual cleanup target disappeared.");
  }

  deleteInstanceDomainMappingAppliedState(storage, {
    action: "manually-removed",
    now: input.now,
    state: customDomainAppliedStateFromDeleteTarget(target, input.now),
  });

  return { ok: true, target };
}

function customDomainAppliedStateFromDeleteTarget(
  target: InstanceDomainProviderDeleteTarget,
  now: string,
): InstanceDomainMappingAppliedState {
  if (!target.profile || !target.workerName) {
    throw new Error(`Custom Domain delete target "${target.logicalId}" is incomplete.`);
  }

  return {
    accountId: target.accountId,
    action: target.action,
    appliedAt: now,
    host: target.host,
    ...(target.alchemyResourceId === undefined
      ? {}
      : { alchemyResourceId: target.alchemyResourceId }),
    profile: target.profile,
    provider: "cloudflare-worker-custom-domain",
    ...(target.runnerId === undefined ? {} : { runnerId: target.runnerId }),
    updatedAt: now,
    workerDomainId: target.resourceId,
    workerName: target.workerName,
    zoneId: target.zoneId,
    zoneName: target.zoneName,
  };
}

function readDeleteJob(
  storage: DurableObjectStorage,
  jobId: string,
): InstanceDomainProviderDeleteJob | undefined {
  ensureDomainProviderDeleteJobsTable(storage);

  for (const row of storage.sql.exec<DomainProviderDeleteJobRow>(
    `
      SELECT
        job_id,
        status,
        runner_id,
        plan_json,
        targets_json,
        deployment_attempt_id,
        deployment_target_id,
        deployment_desired_state_version_id,
        deployment_desired_state_revision,
        deployment_desired_state_hash,
        deployment_lease_token,
        result_json,
        error,
        created_at,
        updated_at
      FROM instance_domain_provider_delete_jobs
      WHERE job_id = ?
      LIMIT 1
    `,
    jobId,
  )) {
    return deleteJobFromRow(row);
  }

  return undefined;
}

function deleteJobFromRow(row: DomainProviderDeleteJobRow): InstanceDomainProviderDeleteJob {
  const result =
    row.result_json === null
      ? undefined
      : (JSON.parse(row.result_json) as InstanceDomainProviderJobResultSummary);

  return {
    createdAt: row.created_at,
    jobId: row.job_id,
    plan: JSON.parse(row.plan_json) as DomainProviderPlan,
    ...(result === undefined ? {} : { result }),
    ...(row.runner_id === null ? {} : { runnerId: row.runner_id }),
    status: row.status,
    targets: JSON.parse(row.targets_json) as InstanceDomainProviderDeleteTarget[],
    updatedAt: row.updated_at,
  };
}

function acquireDomainProviderMutationLock(
  storage: DurableObjectStorage,
  acquiredAt: string,
): DomainProviderMutationLockResult {
  ensureDomainProviderMutationLockTable(storage);

  return storage.transactionSync(() => {
    const existing = readDomainProviderMutationLock(storage);

    if (existing) {
      return {
        acquired: false,
        acquiredAt: existing.acquiredAt,
      };
    }

    storage.sql.exec(
      `
        INSERT INTO instance_domain_provider_mutation_lock (lock_id, acquired_at)
        VALUES (?, ?)
      `,
      providerMutationLockId,
      acquiredAt,
    );

    return { acquired: true };
  });
}

function releaseDomainProviderMutationLock(storage: DurableObjectStorage) {
  ensureDomainProviderMutationLockTable(storage);
  storage.sql.exec(
    `
      DELETE FROM instance_domain_provider_mutation_lock
      WHERE lock_id = ?
    `,
    providerMutationLockId,
  );
}

function readDomainProviderMutationLock(
  storage: DurableObjectStorage,
): { acquiredAt: string } | undefined {
  for (const row of storage.sql.exec<{ acquired_at: string }>(
    `
      SELECT acquired_at
      FROM instance_domain_provider_mutation_lock
      WHERE lock_id = ?
      LIMIT 1
    `,
    providerMutationLockId,
  )) {
    return { acquiredAt: row.acquired_at };
  }

  return undefined;
}

function ensureDomainProviderMutationLockTable(storage: DurableObjectStorage) {
  storage.sql.exec(providerMutationLockTableSql);
}

function ensureDomainProviderDeleteJobsTable(storage: DurableObjectStorage) {
  storage.sql.exec(deleteJobsTableSql);
  runSqlStorageMigrations(storage, {
    family: domainProviderDeleteJobsSqlMigrationFamily,
    migrations: domainProviderSqlMigrations,
  });
}

function ensureDomainProviderAppliedResourcesTables(storage: DurableObjectStorage) {
  storage.sql.exec(`
    ${appliedResourcesTableSql};
    ${providerAuditEventsTableSql};
  `);
  runSqlStorageMigrations(storage, {
    family: domainProviderAppliedResourcesSqlMigrationFamily,
    migrations: domainProviderSqlMigrations,
  });
}

function migrateDomainProviderAppliedActionChecks(storage: DurableObjectStorage) {
  for (const table of [
    "instance_domain_provider_applied_resources",
    "instance_domain_provider_audit_events",
  ] as const) {
    const sql = providerTableDefinition(storage, table);

    if (sql !== undefined && !sql.includes("'manually-removed'")) {
      migrateDomainProviderAppliedActionCheckTable(storage, table);
    }
  }
}

function migrateDomainProviderDeleteJobDeploymentColumns(storage: DurableObjectStorage) {
  migrateDomainProviderJobDeploymentColumns(storage, "instance_domain_provider_delete_jobs");
}

function migrateDomainProviderJobDeploymentColumns(
  storage: DurableObjectStorage,
  table: "instance_domain_provider_delete_jobs",
) {
  const columns = [
    ["deployment_attempt_id", "TEXT"],
    ["deployment_target_id", "TEXT"],
    ["deployment_desired_state_version_id", "TEXT"],
    ["deployment_desired_state_revision", "INTEGER"],
    ["deployment_desired_state_hash", "TEXT"],
    ["deployment_lease_token", "TEXT"],
  ] as const;

  for (const [column, type] of columns) {
    if (!providerTableHasColumn(storage, table, column)) {
      storage.sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }
}

function migrateDomainProviderAppliedActionCheckTable(
  storage: DurableObjectStorage,
  table: "instance_domain_provider_applied_resources" | "instance_domain_provider_audit_events",
) {
  const legacyTable = `${table}_action_legacy`;
  const createSql =
    table === "instance_domain_provider_applied_resources"
      ? appliedResourcesTableSql
      : providerAuditEventsTableSql;
  const eventIdColumns =
    table === "instance_domain_provider_audit_events" ? "event_id,\n      " : "";
  const eventIdSelect =
    table === "instance_domain_provider_audit_events" ? "event_id,\n      " : "";

  storage.sql.exec(`DROP TABLE IF EXISTS ${legacyTable}`);
  storage.sql.exec(`ALTER TABLE ${table} RENAME TO ${legacyTable}`);
  storage.sql.exec(createSql);
  storage.sql.exec(`
    INSERT INTO ${table} (
      ${eventIdColumns}logical_id,
      kind,
      host,
      account_id,
      alchemy_resource_id,
      runner_id,
      zone_id,
      zone_name,
      resource_id,
      resource_json,
      action,
      applied_at,
      updated_at
    )
    SELECT
      ${eventIdSelect}logical_id,
      kind,
      host,
      account_id,
      alchemy_resource_id,
      runner_id,
      zone_id,
      zone_name,
      resource_id,
      resource_json,
      action,
      applied_at,
      updated_at
    FROM ${legacyTable}
  `);
  storage.sql.exec(`DROP TABLE ${legacyTable}`);
}

function providerTableDefinition(storage: DurableObjectStorage, table: string): string | undefined {
  return (
    storage.sql
      .exec<{ sql: string | null }>(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
        table,
      )
      .toArray()[0]?.sql ?? undefined
  );
}

function providerTableHasColumn(
  storage: DurableObjectStorage,
  table: string,
  columnName: string,
): boolean {
  return storage.sql
    .exec<{ name: string }>(`PRAGMA table_info(${table})`)
    .toArray()
    .some((row) => row.name === columnName);
}

function deleteBlockedResponse(
  code: InstanceDomainProviderDeleteBlockedCode,
  error: string,
  config: DomainProviderConfigStatus,
  deletePlan: { plan: DomainProviderPlan; targets: InstanceDomainProviderDeleteTarget[] },
  status: number,
): Response {
  return jsonResponse(
    {
      code,
      config,
      error,
      plan: deletePlan.plan,
      status: "blocked",
      targets: deletePlan.targets,
    } satisfies InstanceDomainProviderDeleteResponse,
    status,
  );
}

async function readDeleteRequest(
  request: Request,
): Promise<
  | { ok: true; options: DomainProviderDeleteOptions; request: InstanceDomainProviderDeleteRequest }
  | { ok: false; error: string }
> {
  const parsed = await readOptionalJsonObject(request, "Domain provider delete request");

  if (!parsed.ok) {
    return parsed;
  }

  const value = parsed.value;
  const host = parseOptionalHost(value.host, "Domain provider delete host");
  const kind = parseOptionalResourceKind(value.kind, "Domain provider delete resource kind");
  const logicalId = parseOptionalString(value.logicalId, "Domain provider delete logical id");
  const runnerId = parseOptionalString(value.runnerId, "Domain provider delete runner id");

  if (!host.ok) return host;
  if (!kind.ok) return kind;
  if (!logicalId.ok) return logicalId;
  if (!runnerId.ok) return runnerId;

  if (host.value === undefined && logicalId.value === undefined) {
    return {
      ok: false,
      error: "Domain provider delete requires a host or logical id selector.",
    };
  }

  return {
    ok: true,
    options: {
      ...(host.value === undefined ? {} : { host: host.value }),
      ...(kind.value === undefined ? {} : { kind: kind.value }),
      ...(logicalId.value === undefined ? {} : { logicalId: logicalId.value }),
    },
    request: {
      ...(host.value === undefined ? {} : { host: host.value }),
      ...(kind.value === undefined ? {} : { kind: kind.value }),
      ...(logicalId.value === undefined ? {} : { logicalId: logicalId.value }),
      ...(runnerId.value === undefined ? {} : { runnerId: runnerId.value }),
    },
  };
}

async function readManualCleanupRequest(request: Request): Promise<
  | {
      ok: true;
      options: Required<DomainProviderDeleteOptions>;
      request: InstanceDomainProviderManualCleanupRequest;
    }
  | { ok: false; error: string }
> {
  const parsed = await readRequiredJsonObject(request, "Domain provider manual cleanup request");

  if (!parsed.ok) {
    return parsed;
  }

  const value = parsed.value;
  const host = parseRequiredHost(value.host, "Domain provider manual cleanup host");
  const kind = parseRequiredResourceKind(
    value.kind,
    "Domain provider manual cleanup resource kind",
  );
  const logicalId = parseRequiredString(
    value.logicalId,
    "Domain provider manual cleanup logical id",
  );

  if (!host.ok) return host;
  if (!kind.ok) return kind;
  if (!logicalId.ok) return logicalId;

  return {
    ok: true,
    options: {
      host: host.value,
      kind: kind.value,
      logicalId: logicalId.value,
    },
    request: {
      host: host.value,
      kind: kind.value,
      logicalId: logicalId.value,
    },
  };
}

async function readDeleteJobResultRequest(
  request: Request,
): Promise<
  { ok: true; request: InstanceDomainProviderDeleteJobResultRequest } | { ok: false; error: string }
> {
  const parsed = await readRequiredJsonObject(request, "Domain provider delete job result request");

  if (!parsed.ok) {
    return parsed;
  }

  const value = parsed.value;

  if (value.status === "failed") {
    const error = parseOptionalString(value.error, "Domain provider delete job error");

    if (!error.ok || error.value === undefined) {
      return { ok: false, error: "Domain provider delete job error must be a non-empty string." };
    }

    const runnerId = parseOptionalString(value.runnerId, "Domain provider delete job runner id");

    if (!runnerId.ok) {
      return runnerId;
    }

    return {
      ok: true,
      request: {
        error: error.value,
        ...(runnerId.value === undefined ? {} : { runnerId: runnerId.value }),
        status: "failed",
      },
    };
  }

  if (value.status !== "succeeded") {
    return {
      ok: false,
      error: 'Domain provider delete job result status must be "succeeded" or "failed".',
    };
  }

  if (!Array.isArray(value.resources)) {
    return { ok: false, error: "Domain provider delete job result resources must be an array." };
  }

  const resources: InstanceDomainProviderDeleteJobResourceEvidence[] = [];

  for (const resource of value.resources) {
    const parsedResource = parseDeleteJobResourceEvidence(resource);

    if (!parsedResource.ok) {
      return parsedResource;
    }

    resources.push(parsedResource.resource);
  }

  const runnerId = parseOptionalString(value.runnerId, "Domain provider delete job runner id");

  if (!runnerId.ok) {
    return runnerId;
  }

  return {
    ok: true,
    request: {
      resources,
      ...(runnerId.value === undefined ? {} : { runnerId: runnerId.value }),
      status: "succeeded",
    },
  };
}

function parseDeleteJobResourceEvidence(
  value: unknown,
):
  | { ok: true; resource: InstanceDomainProviderDeleteJobResourceEvidence }
  | { ok: false; error: string } {
  if (!isRecord(value)) {
    return { ok: false, error: "Domain provider delete evidence resource must be an object." };
  }

  const action = parseRequiredString(value.action, "Domain provider delete action");
  const host = parseRequiredHost(value.host, "Domain provider delete host");
  const kind = parseRequiredResourceKind(value.kind, "Domain provider delete resource kind");
  const logicalId = parseRequiredString(value.logicalId, "Domain provider delete logical id");

  if (!action.ok) return action;
  if (!host.ok) return host;
  if (!kind.ok) return kind;
  if (!logicalId.ok) return logicalId;

  if (action.value !== "deleted") {
    return { ok: false, error: 'Domain provider delete action must be "deleted".' };
  }

  return {
    ok: true,
    resource: {
      action: "deleted",
      host: host.value,
      kind: kind.value,
      logicalId: logicalId.value,
    },
  };
}

async function readOptionalJsonObject(
  request: Request,
  context: string,
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; error: string }> {
  const text = await request.text();

  if (text.trim() === "") {
    return { ok: true, value: {} };
  }

  return parseJsonObject(text, context);
}

async function readRequiredJsonObject(
  request: Request,
  context: string,
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; error: string }> {
  return parseJsonObject(await request.text(), context);
}

function parseJsonObject(
  text: string,
  context: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const value = JSON.parse(text) as unknown;

    if (!isRecord(value)) {
      return { ok: false, error: `${context} must be a JSON object.` };
    }

    return { ok: true, value };
  } catch {
    return { ok: false, error: `${context} must be valid JSON.` };
  }
}

function parsePlanOptions(
  searchParams: URLSearchParams,
): { ok: true; options: DomainProviderPlanOptions } | { ok: false; error: string } {
  const host = parseOptionalHost(
    searchParams.get("host") ?? undefined,
    "Domain provider plan host",
  );
  const policy = parsePolicy(
    searchParams.get("policy") ?? undefined,
    "Domain provider plan policy",
  );

  if (!host.ok) {
    return host;
  }

  if (!policy.ok) {
    return policy;
  }

  return {
    ok: true,
    options: {
      ...(host.value === undefined ? {} : { host: host.value }),
      ...(policy.value === undefined ? {} : { policy: policy.value }),
    },
  };
}

function parsePolicy(
  value: unknown,
  context: string,
): { ok: true; value?: DomainProviderPlanPolicy } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true };
  }

  if (value === "adopt" || value === "create-only" || value === "override") {
    return { ok: true, value };
  }

  return { ok: false, error: `${context} must be "create-only", "adopt", or "override".` };
}

function parseOptionalResourceKind(
  value: unknown,
  context: string,
): { ok: true; value?: DomainProviderResourceKind } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true };
  }

  return parseRequiredResourceKind(value, context);
}

function parseRequiredResourceKind(
  value: unknown,
  context: string,
): { ok: true; value: DomainProviderResourceKind } | { ok: false; error: string } {
  if (value === "cloudflare-worker-custom-domain") {
    return { ok: true, value };
  }

  return {
    ok: false,
    error: `${context} must be "cloudflare-worker-custom-domain".`,
  };
}

function parseOptionalHost(
  value: unknown,
  context: string,
): { ok: true; value?: string } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true };
  }

  if (typeof value !== "string") {
    return { ok: false, error: `${context} must be a string.` };
  }

  const normalized = normalizeInstanceDomainHost(value);

  if (!normalized.ok) {
    return { ok: false, error: normalized.error.message };
  }

  return { ok: true, value: normalized.host };
}

function parseRequiredHost(
  value: unknown,
  context: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const host = parseOptionalHost(value, context);

  if (!host.ok) {
    return host;
  }

  if (host.value === undefined) {
    return { ok: false, error: `${context} must be a non-empty string.` };
  }

  return { ok: true, value: host.value };
}

function parseOptionalString(
  value: unknown,
  context: string,
): { ok: true; value?: string } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true };
  }

  return parseRequiredString(value, context);
}

function parseRequiredString(
  value: unknown,
  context: string,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, error: `${context} must be a non-empty string.` };
  }

  return { ok: true, value: value.trim() };
}

function logicalResourceId(
  instanceId: string,
  kind: string,
  host: string,
  ...parts: readonly (string | undefined)[]
): string {
  return [instanceId, kind, host, ...parts]
    .filter((part): part is string => part !== undefined && part !== "")
    .map((part) => normalizeLogicalIdPart(part, "value"))
    .join("-");
}

function normalizeLogicalIdPart(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized === "" ? fallback : normalized;
}

function configIssue(
  code: DomainProviderConfigIssue["code"],
  envNames: string[],
): DomainProviderConfigIssue {
  return {
    code,
    envNames,
    message: configIssueMessage(code, envNames),
  };
}

function configIssueMessage(code: DomainProviderConfigIssue["code"], envNames: string[]): string {
  switch (code) {
    case "invalid-zone-config":
      return "Domain provider zone config is invalid.";
    case "missing-account-id":
      return `Domain provider planning requires Cloudflare account id in ${envNames.join(" or ")}.`;
    case "missing-alchemy-password":
      return `Domain provider cleanup requires Alchemy state password secret ${envNames.join(" or ")}.`;
    case "missing-cloudflare-api-token":
      return `Domain provider cleanup requires Cloudflare API token secret ${envNames.join(" or ")}.`;
    case "missing-instance-id":
      return `Domain provider planning requires instance id in ${envNames.join(" or ")}.`;
    case "missing-worker-name":
      return `Domain provider planning requires Worker name in ${envNames.join(" or ")}.`;
    case "missing-zone-config":
      return `Domain provider planning requires Cloudflare zone config in ${envNames.join(" or ")}.`;
  }
}

function parseDeleteJobPath(pathname: string): { jobId: string; result: boolean } | undefined {
  const prefix = `${INSTANCE_DOMAIN_PROVIDER_DELETE_JOBS_API_PATH}/`;

  if (!pathname.startsWith(prefix)) {
    return undefined;
  }

  const rest = pathname.slice(prefix.length);
  const resultSuffix = "/result";
  const encodedJobId = rest.endsWith(resultSuffix) ? rest.slice(0, -resultSuffix.length) : rest;

  if (encodedJobId === "" || encodedJobId.includes("/")) {
    return undefined;
  }

  return {
    jobId: decodeURIComponent(encodedJobId),
    result: rest.endsWith(resultSuffix),
  };
}

function isInstanceDomainProviderApiPath(pathname: string) {
  return (
    pathname === INSTANCE_DOMAIN_PROVIDER_API_PATH ||
    pathname.startsWith(`${INSTANCE_DOMAIN_PROVIDER_API_PATH}/`)
  );
}

function methodNotAllowedResponse(allow: string): Response {
  return jsonResponse({ error: "Method not allowed." }, 405, { Allow: allow });
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);

  if (!responseHeaders.has("Cache-Control")) {
    responseHeaders.set("Cache-Control", "no-store");
  }

  return Response.json(body, {
    status,
    headers: responseHeaders,
  });
}

function optionalEnv(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed === "" ? undefined : trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
