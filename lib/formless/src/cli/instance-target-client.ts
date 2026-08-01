import {
  DEPLOYMENT_DESIRED_STATE_API_PATH,
  DEPLOYMENT_STATUS_API_PATH,
  deployDeploymentObservationPatchIdempotencyKey,
  deployDeploymentObservationPatchValues,
  deployControlPlaneActorHeaders,
  deployControlPlaneBootstrapPath,
  deployControlPlaneRecordsByEntity,
  deployDesiredStateVersionRef,
  parseDeployDesiredStateResponse,
  parseDeployLatestStatusResponse,
  type DeployDeploymentObservationPatch,
  type DeployControlPlaneProtocolActorKind,
  type DeployControlPlaneRecord,
  type DeployDesiredStateResponse,
  type DeployDesiredStateVersionRef,
  type DeployControlPlaneBootstrapResponse,
  type DeployLatestStatusResponse,
} from "@dpeek/formless-deploy/client";
import {
  FORMLESS_DEPLOY_METADATA_PATH,
  parseFormlessBundleDigest,
  type FormlessDeployMetadata,
} from "../shared/deploy-metadata.ts";
import { parseSourceSchemaHash } from "@dpeek/formless-schema";
import {
  INSTANCE_DEPLOYMENT_ATTEMPT_FAILURE_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_HEARTBEAT_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_PLAN_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_START_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_SUCCESS_API_PATH,
  INSTANCE_DEPLOYMENT_DRIFT_API_PATH,
  type InstanceDeploymentAttemptFailureWritebackRequest,
  type InstanceDeploymentAttemptFailureWritebackResponse,
  type InstanceDeploymentAttemptHeartbeatRequest,
  type InstanceDeploymentAttemptHeartbeatResponse,
  type InstanceDeploymentAttemptPlanWritebackRequest,
  type InstanceDeploymentAttemptPlanWritebackResponse,
  type InstanceDeploymentAttemptStartRequest,
  type InstanceDeploymentAttemptStartResponse,
  type InstanceDeploymentAttemptSuccessWritebackRequest,
  type InstanceDeploymentAttemptSuccessWritebackResponse,
  type InstanceDeploymentDriftWritebackRequest,
  type InstanceDeploymentDriftWritebackResponse,
} from "../shared/deployment-runtime.ts";
import {
  INSTANCE_DOMAIN_PROVIDER_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_DELETE_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_DELETE_JOBS_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_MANUAL_CLEANUP_API_PATH,
  type InstanceDomainProviderDeleteJobResultRequest,
  type InstanceDomainProviderDeleteJobResponse,
  type InstanceDomainProviderDeleteRequest,
  type InstanceDomainProviderDeleteResponse,
  type InstanceDomainProviderManualCleanupRequest,
  type InstanceDomainProviderManualCleanupResponse,
  type InstanceDomainProviderPlanResponse,
} from "../shared/domain-provider-api.ts";
import { type InstanceControlPlaneRouteTargetProfile } from "@dpeek/formless-instance-control-plane";
import { FORMLESS_PROGRAM_API_ROUTE_PREFIX } from "../program/target.ts";
import type { DomainProviderPlanPolicy } from "../shared/domain-provider-protocol.ts";
import type {
  InstanceDomainMappingProfile,
  RecordInstanceDomainMappingApplyEvidenceRequest,
  RecordInstanceDomainMappingApplyEvidenceResponse,
} from "../shared/instance-domain-mappings.ts";
import { normalizeInstanceDomainHost } from "../shared/instance-domain-mappings.ts";
import type { OwnerSetupStatusResponse } from "../shared/protocol.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import { createOperationId } from "../shared/ids.ts";
import {
  INSTANCE_UPGRADE_APPLY_API_PATH,
  INSTANCE_UPGRADE_STATUS_API_PATH,
  type InstanceUpgradeApplyResponse,
  type InstanceUpgradeStatusResponse,
} from "../shared/upgrade-status.ts";
import { normalizeInstanceWorkspaceTargetUrl } from "@dpeek/formless-workspace";
import {
  formlessCliTargetAcceptHeaders,
  formlessCliTargetJsonHeaders,
} from "./instance-target-context.ts";

const OWNER_SETUP_STATUS_API_PATH = "/api/formless/setup";
const DOMAIN_MAPPINGS_API_PATH = "/api/formless/domain-mappings";
const DOMAIN_MAPPINGS_APPLY_EVIDENCE_API_PATH = `${DOMAIN_MAPPINGS_API_PATH}/apply-evidence`;

export type InstanceDeploymentDesiredStateResponse = DeployDesiredStateResponse;
export type InstanceDeploymentStatusResponse = DeployLatestStatusResponse;

export type FormlessInstanceTargetStatus = {
  deployMetadata: FormlessInstanceTargetDeployMetadata;
  deployment?: InstanceDeploymentStatusResponse;
  ownerSetup: OwnerSetupStatusResponse;
  targetUrl: string;
};

export type FormlessInstanceControlPlaneRecords = {
  actorKind: DeployControlPlaneProtocolActorKind;
  deploymentConfigs: DeployControlPlaneRecord[];
  domainMappings: DeployControlPlaneRecord[];
  records: DeployControlPlaneRecord[];
  redirectIntents: DeployControlPlaneRecord[];
};

export type FormlessInstanceDeploymentCommandContext = {
  controlPlane?: FormlessInstanceControlPlaneRecords;
  desiredState: InstanceDeploymentDesiredStateResponse;
  desiredStateRef: DeployDesiredStateVersionRef;
  status: InstanceDeploymentStatusResponse;
};

export type FormlessInstanceDeploymentObservationPatch = DeployDeploymentObservationPatch;

export type FormlessInstanceTargetDeployMetadata = FormlessDeployMetadata & {
  cacheControl: string;
  metadataUrl: string;
};

export type FormlessInstanceTargetClientDependencies = {
  fetch: typeof fetch;
};

export type DisableFormlessInstanceDomainRouteRequest = {
  host: string;
  profile?: InstanceDomainMappingProfile;
};

export type DisableFormlessInstanceDomainRedirectRequest = {
  fromHost: string;
};

export class FormlessInstanceTargetRequestError extends Error {
  readonly responseBody: string;
  readonly status: number;
  constructor(
    message: string,
    input: {
      responseBody: string;
      status: number;
    },
  ) {
    super(message);
    this.name = "FormlessInstanceTargetRequestError";
    this.responseBody = input.responseBody;
    this.status = input.status;
  }
}

export async function readFormlessInstanceTargetStatus(
  input: {
    adminToken?: string | null;
    includeDeploymentStatus?: boolean;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<FormlessInstanceTargetStatus> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const [deployMetadata, ownerSetup, deployment] = await Promise.all([
    readFormlessInstanceDeployMetadata({ targetUrl }, dependencies),
    readFormlessInstanceOwnerSetupStatus({ targetUrl }, dependencies),
    input.includeDeploymentStatus
      ? readOptionalFormlessInstanceDeploymentStatus(
          { adminToken: input.adminToken, targetUrl },
          dependencies,
        )
      : undefined,
  ]);
  return {
    deployMetadata,
    ...(deployment === undefined ? {} : { deployment }),
    ownerSetup,
    targetUrl,
  };
}
export async function readFormlessInstanceDeployMetadata(
  input: {
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<FormlessInstanceTargetDeployMetadata> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const metadataUrl = apiUrl(targetUrl, FORMLESS_DEPLOY_METADATA_PATH);
  const response = await dependencies.fetch(metadataUrl, {
    headers: { accept: "application/json" },
  });
  const value = await readJsonResponse(response, `GET ${metadataUrl}`);
  const metadata = parseDeployMetadata(value, metadataUrl);
  return {
    cacheControl: response.headers.get("Cache-Control") ?? "",
    metadataUrl,
    ...metadata,
  };
}
export async function readFormlessInstanceOwnerSetupStatus(
  input: {
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<OwnerSetupStatusResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const statusUrl = apiUrl(targetUrl, OWNER_SETUP_STATUS_API_PATH);

  return parseOwnerSetupStatus(
    await fetchJson(dependencies.fetch, statusUrl, { headers: { accept: "application/json" } }),
    statusUrl,
  );
}
export async function applyFormlessInstanceAutoSafeSqlMigrations(
  input: {
    adminToken?: string | null;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceUpgradeApplyResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const applyUrl = apiUrl(targetUrl, INSTANCE_UPGRADE_APPLY_API_PATH);

  return parseInstanceUpgradeStatusResponse(
    await postJson(dependencies.fetch, applyUrl, {
      body: JSON.stringify({ safety: "auto-safe" }),
      headers: adminJsonHeaders(input.adminToken),
      method: "POST",
    }),
    applyUrl,
  );
}

export async function readFormlessInstanceUpgradeStatus(
  input: {
    adminToken?: string | null;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceUpgradeStatusResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const statusUrl = apiUrl(targetUrl, INSTANCE_UPGRADE_STATUS_API_PATH);

  return parseInstanceUpgradeStatusResponse(
    await fetchJson(dependencies.fetch, statusUrl, {
      headers: adminJsonHeaders(input.adminToken),
    }),
    statusUrl,
  );
}

export async function readFormlessInstanceDomainProviderPlan(
  input: {
    adminToken?: string | null;
    host?: string | null;
    policy?: DomainProviderPlanPolicy;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDomainProviderPlanResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const providerUrl = new URL(apiUrl(targetUrl, INSTANCE_DOMAIN_PROVIDER_API_PATH));

  if (input.host && input.host.trim() !== "") {
    providerUrl.searchParams.set("host", input.host);
  }

  if (input.policy) {
    providerUrl.searchParams.set("policy", input.policy);
  }

  return parseDomainProviderPlan(
    await fetchJson(dependencies.fetch, providerUrl.toString(), {
      headers: formlessCliTargetAcceptHeaders({ adminToken: input.adminToken }),
    }),
    providerUrl.toString(),
  );
}
export async function readFormlessInstanceDeploymentDesiredState(
  input: {
    adminToken?: string | null;
    targetId?: string | null;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDeploymentDesiredStateResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const desiredStateUrl = deploymentReadUrl(
    targetUrl,
    DEPLOYMENT_DESIRED_STATE_API_PATH,
    input.targetId,
  );

  return parseDeployDesiredStateResponse(
    await fetchJson(dependencies.fetch, desiredStateUrl, {
      headers: formlessCliTargetAcceptHeaders({ adminToken: input.adminToken }),
    }),
    desiredStateUrl,
  );
}
export async function readFormlessInstanceDeploymentStatus(
  input: {
    adminToken?: string | null;
    targetId?: string | null;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDeploymentStatusResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const statusUrl = deploymentReadUrl(targetUrl, DEPLOYMENT_STATUS_API_PATH, input.targetId);

  return parseDeployLatestStatusResponse(
    await fetchJson(dependencies.fetch, statusUrl, {
      headers: formlessCliTargetAcceptHeaders({ adminToken: input.adminToken }),
    }),
    statusUrl,
  );
}

export async function readFormlessInstanceControlPlaneRecords(
  input: {
    adminToken?: string | null;
    actorKind?: DeployControlPlaneProtocolActorKind;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<FormlessInstanceControlPlaneRecords> {
  const actorKind = input.actorKind ?? "cliDeployer";
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const controlPlaneUrl = apiUrl(
    targetUrl,
    deployControlPlaneBootstrapPath(actorKind, FORMLESS_PROGRAM_API_ROUTE_PREFIX),
  );

  const bootstrap = parseControlPlaneBootstrapResponse(
    await fetchJson(dependencies.fetch, controlPlaneUrl, {
      headers: formlessCliTargetAcceptHeaders({
        adminToken: input.adminToken,
        headers: deployControlPlaneActorHeaders(actorKind),
      }),
    }),
    controlPlaneUrl,
  );

  return controlPlaneRecordsByEntity(actorKind, bootstrap.records);
}

export async function disableFormlessInstanceDomainRoute(
  input: {
    adminToken?: string | null;
    mutationId?: string;
    request: DisableFormlessInstanceDomainRouteRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<OperationInvocationResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const host = normalizeTargetDomainHost(input.request.host);
  const targetProfile = routeTargetProfileFromDomainProfile(input.request.profile ?? "publicSite");
  const controlPlane = await readFormlessInstanceControlPlaneRecords(
    {
      adminToken: input.adminToken,
      actorKind: "cliDeployer",
      targetUrl,
    },
    dependencies,
  );
  const route = controlPlane.domainMappings.find(
    (record) =>
      !record.deletedAt &&
      record.values.matchHost === host &&
      record.values.targetProfile === targetProfile,
  );

  if (!route) {
    throw new Error(`No desired domain route found for host "${host}".`);
  }

  return updateFormlessInstanceRouteRecord(
    {
      adminToken: input.adminToken,
      mutationId: input.mutationId,
      recordId: route.id,
      targetUrl,
      values: { enabled: false },
    },
    dependencies,
  );
}

export async function disableFormlessInstanceDomainRedirect(
  input: {
    adminToken?: string | null;
    mutationId?: string;
    request: DisableFormlessInstanceDomainRedirectRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<OperationInvocationResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const fromHost = normalizeTargetDomainHost(input.request.fromHost);
  const controlPlane = await readFormlessInstanceControlPlaneRecords(
    {
      adminToken: input.adminToken,
      actorKind: "cliDeployer",
      targetUrl,
    },
    dependencies,
  );
  const route = controlPlane.redirectIntents.find(
    (record) => !record.deletedAt && record.values.matchHost === fromHost,
  );

  if (!route) {
    throw new Error(`No desired redirect route found for host "${fromHost}".`);
  }

  return updateFormlessInstanceRouteRecord(
    {
      adminToken: input.adminToken,
      mutationId: input.mutationId,
      recordId: route.id,
      targetUrl,
      values: { enabled: false },
    },
    dependencies,
  );
}

export async function readOptionalFormlessInstanceControlPlaneRecords(
  input: {
    adminToken?: string | null;
    actorKind?: DeployControlPlaneProtocolActorKind;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<FormlessInstanceControlPlaneRecords | undefined> {
  try {
    return await readFormlessInstanceControlPlaneRecords(input, dependencies);
  } catch (error) {
    if (error instanceof FormlessInstanceTargetRequestError && error.status === 404) {
      return undefined;
    }

    throw error;
  }
}

export async function readFormlessInstanceDeploymentCommandContext(
  input: {
    adminToken?: string | null;
    actorKind?: DeployControlPlaneProtocolActorKind;
    targetId?: string | null;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<FormlessInstanceDeploymentCommandContext> {
  const [controlPlane, desiredState, status] = await Promise.all([
    readOptionalFormlessInstanceControlPlaneRecords(
      {
        adminToken: input.adminToken,
        actorKind: input.actorKind ?? "runner",
        targetUrl: input.targetUrl,
      },
      dependencies,
    ),
    readFormlessInstanceDeploymentDesiredState(input, dependencies),
    readFormlessInstanceDeploymentStatus(input, dependencies),
  ]);

  return {
    ...(controlPlane === undefined ? {} : { controlPlane }),
    desiredState,
    desiredStateRef: deployDesiredStateVersionRef(desiredState.desiredState),
    status,
  };
}

export async function patchFormlessInstanceDeploymentConfigObservation(
  input: {
    adminToken?: string | null;
    mutationId?: string;
    observation: FormlessInstanceDeploymentObservationPatch;
    targetId: string;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<OperationInvocationResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const operationUrl = apiUrl(
    targetUrl,
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/operations/deployment-config/update`,
  );
  const values = deployDeploymentObservationPatchValues(input.observation);
  const idempotencyKey =
    input.mutationId ??
    deployDeploymentObservationPatchIdempotencyKey({
      observation: input.observation,
      targetId: input.targetId,
    });

  return parseOperationInvocationResponse(
    await postJson(dependencies.fetch, operationUrl, {
      body: JSON.stringify({
        idempotencyKey,
        input: values,
        recordId: input.targetId,
      }),
      headers: formlessCliTargetJsonHeaders({ adminToken: input.adminToken }),
      method: "POST",
    }),
    operationUrl,
  );
}

async function updateFormlessInstanceRouteRecord(
  input: {
    adminToken?: string | null;
    mutationId?: string;
    recordId: string;
    targetUrl: string;
    values: Record<string, unknown>;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<OperationInvocationResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const operationUrl = apiUrl(
    targetUrl,
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/operations/route/update`,
  );

  return parseOperationInvocationResponse(
    await postJson(dependencies.fetch, operationUrl, {
      body: JSON.stringify({
        idempotencyKey: input.mutationId ?? createOperationId(),
        input: input.values,
        recordId: input.recordId,
        source: { protocol: "cli" },
      }),
      headers: formlessCliTargetJsonHeaders({ adminToken: input.adminToken }),
      method: "POST",
    }),
    operationUrl,
  );
}
async function readOptionalFormlessInstanceDeploymentStatus(
  input: {
    adminToken?: string | null;
    targetId?: string | null;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDeploymentStatusResponse | undefined> {
  try {
    return await readFormlessInstanceDeploymentStatus(input, dependencies);
  } catch (error) {
    if (error instanceof FormlessInstanceTargetRequestError && error.status === 404) {
      return undefined;
    }

    throw error;
  }
}

export async function startFormlessInstanceDeploymentAttempt(
  input: {
    adminToken?: string | null;
    request: InstanceDeploymentAttemptStartRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDeploymentAttemptStartResponse> {
  return parseDeploymentAttemptStartResponse(
    await postDeploymentJson(dependencies, {
      adminToken: input.adminToken,
      body: input.request,
      path: INSTANCE_DEPLOYMENT_ATTEMPT_START_API_PATH,
      targetUrl: input.targetUrl,
    }),
    INSTANCE_DEPLOYMENT_ATTEMPT_START_API_PATH,
  );
}

export async function heartbeatFormlessInstanceDeploymentAttempt(
  input: {
    adminToken?: string | null;
    request: InstanceDeploymentAttemptHeartbeatRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDeploymentAttemptHeartbeatResponse> {
  return parseDeploymentAttemptHeartbeatResponse(
    await postDeploymentJson(dependencies, {
      adminToken: input.adminToken,
      body: input.request,
      path: INSTANCE_DEPLOYMENT_ATTEMPT_HEARTBEAT_API_PATH,
      targetUrl: input.targetUrl,
    }),
    INSTANCE_DEPLOYMENT_ATTEMPT_HEARTBEAT_API_PATH,
  );
}

export async function writeFormlessInstanceDeploymentAttemptPlan(
  input: {
    adminToken?: string | null;
    request: InstanceDeploymentAttemptPlanWritebackRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDeploymentAttemptPlanWritebackResponse> {
  return parseDeploymentAttemptPlanWritebackResponse(
    await postDeploymentJson(dependencies, {
      adminToken: input.adminToken,
      body: input.request,
      path: INSTANCE_DEPLOYMENT_ATTEMPT_PLAN_API_PATH,
      targetUrl: input.targetUrl,
    }),
    INSTANCE_DEPLOYMENT_ATTEMPT_PLAN_API_PATH,
  );
}

export async function writeFormlessInstanceDeploymentAttemptSuccess(
  input: {
    adminToken?: string | null;
    request: InstanceDeploymentAttemptSuccessWritebackRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDeploymentAttemptSuccessWritebackResponse> {
  return parseDeploymentAttemptSuccessWritebackResponse(
    await postDeploymentJson(dependencies, {
      adminToken: input.adminToken,
      body: input.request,
      path: INSTANCE_DEPLOYMENT_ATTEMPT_SUCCESS_API_PATH,
      targetUrl: input.targetUrl,
    }),
    INSTANCE_DEPLOYMENT_ATTEMPT_SUCCESS_API_PATH,
  );
}

export async function writeFormlessInstanceDeploymentAttemptFailure(
  input: {
    adminToken?: string | null;
    request: InstanceDeploymentAttemptFailureWritebackRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDeploymentAttemptFailureWritebackResponse> {
  return parseDeploymentAttemptFailureWritebackResponse(
    await postDeploymentJson(dependencies, {
      adminToken: input.adminToken,
      body: input.request,
      path: INSTANCE_DEPLOYMENT_ATTEMPT_FAILURE_API_PATH,
      targetUrl: input.targetUrl,
    }),
    INSTANCE_DEPLOYMENT_ATTEMPT_FAILURE_API_PATH,
  );
}

export async function writeFormlessInstanceDeploymentDrift(
  input: {
    adminToken?: string | null;
    request: InstanceDeploymentDriftWritebackRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDeploymentDriftWritebackResponse> {
  return parseDeploymentDriftWritebackResponse(
    await postDeploymentJson(dependencies, {
      adminToken: input.adminToken,
      body: input.request,
      path: INSTANCE_DEPLOYMENT_DRIFT_API_PATH,
      targetUrl: input.targetUrl,
    }),
    INSTANCE_DEPLOYMENT_DRIFT_API_PATH,
  );
}

export async function requestFormlessInstanceDomainProviderDelete(
  input: {
    adminToken?: string | null;
    request?: InstanceDomainProviderDeleteRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDomainProviderDeleteResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const deleteUrl = apiUrl(targetUrl, INSTANCE_DOMAIN_PROVIDER_DELETE_API_PATH);

  return parseDomainProviderDeleteResponse(
    await postJson(dependencies.fetch, deleteUrl, {
      body: JSON.stringify(input.request ?? {}),
      headers: formlessCliTargetJsonHeaders({ adminToken: input.adminToken }),
      method: "POST",
    }),
    deleteUrl,
  );
}

export async function markFormlessInstanceDomainProviderResourceManuallyRemoved(
  input: {
    adminToken?: string | null;
    request: InstanceDomainProviderManualCleanupRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDomainProviderManualCleanupResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const cleanupUrl = apiUrl(targetUrl, INSTANCE_DOMAIN_PROVIDER_MANUAL_CLEANUP_API_PATH);

  return parseDomainProviderManualCleanupResponse(
    await postJson(dependencies.fetch, cleanupUrl, {
      body: JSON.stringify(input.request),
      headers: formlessCliTargetJsonHeaders({ adminToken: input.adminToken }),
      method: "POST",
    }),
    cleanupUrl,
  );
}

export async function completeFormlessInstanceDomainProviderDeleteJob(
  input: {
    adminToken?: string | null;
    jobId: string;
    result: InstanceDomainProviderDeleteJobResultRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDomainProviderDeleteJobResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const resultUrl = apiUrl(
    targetUrl,
    `${INSTANCE_DOMAIN_PROVIDER_DELETE_JOBS_API_PATH}/${encodeURIComponent(input.jobId)}/result`,
  );

  return parseDomainProviderDeleteJobResponse(
    await postJson(dependencies.fetch, resultUrl, {
      body: JSON.stringify(input.result),
      headers: formlessCliTargetJsonHeaders({ adminToken: input.adminToken }),
      method: "POST",
    }),
    resultUrl,
  );
}

export async function recordFormlessInstanceDomainMappingApplyEvidence(
  input: {
    adminToken?: string | null;
    evidence: RecordInstanceDomainMappingApplyEvidenceRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<RecordInstanceDomainMappingApplyEvidenceResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const evidenceUrl = apiUrl(targetUrl, DOMAIN_MAPPINGS_APPLY_EVIDENCE_API_PATH);

  return parseApplyEvidenceResponse(
    await postJson(dependencies.fetch, evidenceUrl, {
      body: JSON.stringify(input.evidence),
      headers: formlessCliTargetJsonHeaders({ adminToken: input.adminToken }),
      method: "POST",
    }),
    evidenceUrl,
  );
}

async function fetchJson(fetcher: typeof fetch, url: string, init: RequestInit): Promise<unknown> {
  const response = await fetcher(url, init);

  return readJsonResponse(response, `GET ${url}`);
}

async function postJson(fetcher: typeof fetch, url: string, init: RequestInit): Promise<unknown> {
  const response = await fetcher(url, init);

  return readJsonResponse(response, `POST ${url}`);
}

async function readJsonResponse(response: Response, context: string): Promise<unknown> {
  const text = await response.text();

  if (!response.ok) {
    throw new FormlessInstanceTargetRequestError(
      `${context} failed: HTTP ${response.status} ${text}`,
      {
        responseBody: text,
        status: response.status,
      },
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${context} failed: response was not JSON.`);
  }
}

function parseDeployMetadata(value: unknown, context: string): FormlessDeployMetadata {
  if (!isRecord(value)) {
    throw new Error(`${context} failed: deploy metadata must be an object.`);
  }

  if (value.version !== null && typeof value.version !== "string") {
    throw new Error(`${context} failed: deploy metadata version must be a string or null.`);
  }

  if (value.packageVersion !== null && typeof value.packageVersion !== "string") {
    throw new Error(`${context} failed: deploy metadata packageVersion must be a string or null.`);
  }

  if (
    !Number.isInteger(value.runtimeProtocolVersion) ||
    Number(value.runtimeProtocolVersion) <= 0
  ) {
    throw new Error(`${context} failed: deploy metadata runtimeProtocolVersion must be positive.`);
  }

  if (typeof value.storageMigrationSet !== "string" || value.storageMigrationSet.trim() === "") {
    throw new Error(`${context} failed: deploy metadata storageMigrationSet must be a string.`);
  }

  if (!isRecord(value.schemaProvenance) || value.schemaProvenance.kind !== "program") {
    throw new Error(`${context} failed: deploy metadata schemaProvenance must identify Program.`);
  }

  return {
    ...(value.bundleDigest === undefined
      ? {}
      : {
          bundleDigest: parseFormlessBundleDigest(
            `${context} deploy metadata bundleDigest`,
            value.bundleDigest,
          ),
        }),
    packageVersion: value.packageVersion as string | null,
    runtimeProtocolVersion: value.runtimeProtocolVersion as number,
    schemaProvenance: {
      kind: "program",
      sourceSchemaHash: parseSourceSchemaHash(
        value.schemaProvenance.sourceSchemaHash,
        `${context} deploy metadata schemaProvenance sourceSchemaHash`,
      ),
    },
    storageMigrationSet: value.storageMigrationSet,
    version: value.version as string | null,
  };
}

function parseOwnerSetupStatus(value: unknown, context: string): OwnerSetupStatusResponse {
  if (!isRecord(value) || typeof value.setupComplete !== "boolean") {
    throw new Error(`${context} failed: setup status must include setupComplete.`);
  }

  return {
    ...(typeof value.adminOrigin === "string" ? { adminOrigin: value.adminOrigin } : {}),
    ...(typeof value.authOrigin === "string" ? { authOrigin: value.authOrigin } : {}),
    setupComplete: value.setupComplete,
    ...(isRecord(value.owner) ? { owner: value.owner as OwnerSetupStatusResponse["owner"] } : {}),
  };
}

function parseInstanceUpgradeStatusResponse(
  value: unknown,
  context: string,
): InstanceUpgradeStatusResponse {
  if (!isRecord(value) || !isRecord(value.storageIdentity)) {
    throw new Error(`${context} failed: upgrade status must include storageIdentity.`);
  }

  return value as InstanceUpgradeStatusResponse;
}

function adminJsonHeaders(adminToken: string | null | undefined): Record<string, string> {
  return formlessCliTargetJsonHeaders({ adminToken });
}

function parseDomainProviderPlan(
  value: unknown,
  context: string,
): InstanceDomainProviderPlanResponse {
  if (!isRecord(value) || !isRecord(value.config) || !isRecord(value.plan)) {
    throw new Error(`${context} failed: domain provider plan response is invalid.`);
  }

  return value as InstanceDomainProviderPlanResponse;
}

function parseControlPlaneBootstrapResponse(
  value: unknown,
  context: string,
): DeployControlPlaneBootstrapResponse {
  if (!isRecord(value) || !Array.isArray(value.records)) {
    throw new Error(`${context} failed: control-plane bootstrap response is invalid.`);
  }

  return {
    ...(typeof value.cursor === "number" ? { cursor: value.cursor } : {}),
    records: value.records.map((record, index) =>
      parseControlPlaneRecord(record, `${context} records[${index}]`),
    ),
    ...(value.schema === undefined ? {} : { schema: value.schema }),
  };
}

function parseControlPlaneRecord(value: unknown, context: string): DeployControlPlaneRecord {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.entity !== "string" ||
    !isRecord(value.values)
  ) {
    throw new Error(`${context} failed: control-plane record is invalid.`);
  }

  return {
    ...(typeof value.createdAt === "string" ? { createdAt: value.createdAt } : {}),
    ...(typeof value.deletedAt === "string" ? { deletedAt: value.deletedAt } : {}),
    entity: value.entity,
    id: value.id,
    ...(typeof value.updatedAt === "string" ? { updatedAt: value.updatedAt } : {}),
    values: value.values,
  };
}

function parseOperationInvocationResponse(
  value: unknown,
  context: string,
): OperationInvocationResponse {
  if (
    !isRecord(value) ||
    !isRecord(value.invocation) ||
    !isRecord(value.output) ||
    typeof value.status !== "string"
  ) {
    throw new Error(`${context} failed: operation response is invalid.`);
  }

  return value as OperationInvocationResponse;
}

function controlPlaneRecordsByEntity(
  actorKind: DeployControlPlaneProtocolActorKind,
  records: DeployControlPlaneRecord[],
): FormlessInstanceControlPlaneRecords {
  return {
    actorKind,
    deploymentConfigs: deployControlPlaneRecordsByEntity(records, "deployment-config"),
    domainMappings: controlPlaneDomainRouteRecords(records),
    records,
    redirectIntents: controlPlaneRedirectRouteRecords(records),
  };
}

function controlPlaneDomainRouteRecords(
  records: DeployControlPlaneRecord[],
): DeployControlPlaneRecord[] {
  return deployControlPlaneRecordsByEntity(records, "route").filter(
    (record) =>
      record.values.kind === "mount" &&
      typeof record.values.matchHost === "string" &&
      isCurrentProgramPublicSiteDomainRoute(record),
  );
}

function isCurrentProgramPublicSiteDomainRoute(record: DeployControlPlaneRecord): boolean {
  return (
    record.values.targetProfile === "instance" ||
    (record.values.targetProfile === "public-site" && record.values.surface === "public-site")
  );
}

function controlPlaneRedirectRouteRecords(
  records: DeployControlPlaneRecord[],
): DeployControlPlaneRecord[] {
  return deployControlPlaneRecordsByEntity(records, "route").filter(
    (record) => record.values.kind === "redirect",
  );
}

function parseDeploymentAttemptStartResponse(
  value: unknown,
  context: string,
): InstanceDeploymentAttemptStartResponse {
  if (!isRecord(value) || !isRecord(value.attempt) || typeof value.replayed !== "boolean") {
    throw new Error(`${context} failed: deployment attempt start response is invalid.`);
  }

  return value as InstanceDeploymentAttemptStartResponse;
}

function parseDeploymentAttemptHeartbeatResponse(
  value: unknown,
  context: string,
): InstanceDeploymentAttemptHeartbeatResponse {
  if (!isRecord(value) || !isRecord(value.attempt) || !isRecord(value.lease)) {
    throw new Error(`${context} failed: deployment attempt heartbeat response is invalid.`);
  }

  return value as InstanceDeploymentAttemptHeartbeatResponse;
}

function parseDeploymentAttemptPlanWritebackResponse(
  value: unknown,
  context: string,
): InstanceDeploymentAttemptPlanWritebackResponse {
  if (!isRecord(value) || !isRecord(value.attempt) || !isRecord(value.plan)) {
    throw new Error(`${context} failed: deployment attempt plan writeback response is invalid.`);
  }

  return value as InstanceDeploymentAttemptPlanWritebackResponse;
}

function parseDeploymentAttemptSuccessWritebackResponse(
  value: unknown,
  context: string,
): InstanceDeploymentAttemptSuccessWritebackResponse {
  if (
    !isRecord(value) ||
    !isRecord(value.attempt) ||
    !isRecord(value.lease) ||
    !isRecord(value.result)
  ) {
    throw new Error(`${context} failed: deployment attempt success writeback response is invalid.`);
  }

  return value as InstanceDeploymentAttemptSuccessWritebackResponse;
}

function parseDeploymentAttemptFailureWritebackResponse(
  value: unknown,
  context: string,
): InstanceDeploymentAttemptFailureWritebackResponse {
  if (!isRecord(value) || !isRecord(value.attempt) || !isRecord(value.result)) {
    throw new Error(`${context} failed: deployment attempt failure writeback response is invalid.`);
  }

  return value as InstanceDeploymentAttemptFailureWritebackResponse;
}

function parseDeploymentDriftWritebackResponse(
  value: unknown,
  context: string,
): InstanceDeploymentDriftWritebackResponse {
  if (!isRecord(value) || !isRecord(value.report)) {
    throw new Error(`${context} failed: deployment drift writeback response is invalid.`);
  }

  return value as InstanceDeploymentDriftWritebackResponse;
}

function parseDomainProviderDeleteResponse(
  value: unknown,
  context: string,
): InstanceDomainProviderDeleteResponse {
  if (!isRecord(value) || typeof value.status !== "string") {
    throw new Error(`${context} failed: domain provider delete response is invalid.`);
  }

  return value as InstanceDomainProviderDeleteResponse;
}

function parseDomainProviderDeleteJobResponse(
  value: unknown,
  context: string,
): InstanceDomainProviderDeleteJobResponse {
  if (!isRecord(value) || !isRecord(value.job)) {
    throw new Error(`${context} failed: domain provider delete job response is invalid.`);
  }

  return value as InstanceDomainProviderDeleteJobResponse;
}

function parseDomainProviderManualCleanupResponse(
  value: unknown,
  context: string,
): InstanceDomainProviderManualCleanupResponse {
  if (!isRecord(value) || value.status !== "cleaned" || !isRecord(value.target)) {
    throw new Error(`${context} failed: domain provider manual cleanup response is invalid.`);
  }

  return value as InstanceDomainProviderManualCleanupResponse;
}

function parseApplyEvidenceResponse(
  value: unknown,
  context: string,
): RecordInstanceDomainMappingApplyEvidenceResponse {
  if (
    !isRecord(value) ||
    !isRecord(value.appliedState) ||
    !Array.isArray(value.appliedStates) ||
    !isRecord(value.auditEvent) ||
    !Array.isArray(value.auditEvents)
  ) {
    throw new Error(`${context} failed: apply evidence response is invalid.`);
  }

  return value as RecordInstanceDomainMappingApplyEvidenceResponse;
}

function normalizeTargetDomainHost(value: string): string {
  const host = normalizeInstanceDomainHost(value);

  if (!host.ok) {
    throw new Error(host.error.message);
  }

  return host.host;
}

function routeTargetProfileFromDomainProfile(
  profile: InstanceDomainMappingProfile,
): InstanceControlPlaneRouteTargetProfile {
  return profile === "publicSite" ? "public-site" : profile;
}

function apiUrl(targetUrl: string, apiPath: string): string {
  return new URL(apiPath, `${targetUrl}/`).toString();
}

function deploymentReadUrl(targetUrl: string, apiPath: string, targetId?: string | null): string {
  const url = new URL(apiUrl(targetUrl, apiPath));

  if (targetId && targetId.trim() !== "") {
    url.searchParams.set("targetId", targetId);
  }

  return url.toString();
}

async function postDeploymentJson(
  dependencies: FormlessInstanceTargetClientDependencies,
  input: {
    adminToken?: string | null;
    body: unknown;
    path: string;
    targetUrl: string;
  },
): Promise<unknown> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const url = apiUrl(targetUrl, input.path);

  return postJson(dependencies.fetch, url, {
    body: JSON.stringify(input.body),
    headers: formlessCliTargetJsonHeaders({ adminToken: input.adminToken }),
    method: "POST",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
