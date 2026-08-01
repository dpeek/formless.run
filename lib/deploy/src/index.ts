import {
  DEPLOY_PUBLIC_CONTRACT_VERSION,
  type ControlPlaneDeploymentConfigObservationRecord,
  type ControlPlaneDeploymentConfigObservedStatus,
  type ControlPlaneDomainMappingProfile,
  type ControlPlaneEmailDomainProjectionRecord,
  type ControlPlaneEmailSenderProjectionRecord,
  type ControlPlaneProviderConfigProjectionRecord,
  type ControlPlaneProjectionSourceRecord,
  type ControlPlaneRedirectStatusCode,
  type ControlPlaneRouteProjectionRecord,
  type DeriveDeployLatestStatusInput,
  type DeployControlPlaneRecordsProjectionInput,
  type DeployDeploymentObservationPatch,
  type DeployDesiredStateDisplaySummary,
  type DeployDesiredStateHash,
  type DeployDesiredStateHashInput,
  type DeployDesiredStateProjection,
  type DeployDesiredStateProjectionInput,
  type DeployDesiredStateSchemaVersion,
  type DeployDesiredStateSource,
  type DeployDesiredStateVersion,
  type DeployDesiredStateVersionId,
  type DeployDesiredStateVersionRef,
  type DeployFailureSummary,
  type DeployJsonValue,
  type DeployLatestStatus,
  type DeployLatestStatusDisplaySummary,
  type DeployProjectionHashInput,
  type DeployResource,
  type DeployResourceGraph,
  type DeployResourceKind,
  type DeployRunnerId,
  type DeployTargetId,
  type MaterializeDeployDesiredStateVersionInput,
} from "./types.ts";

export {
  CONTROL_PLANE_DEPLOYMENT_CONFIG_OBSERVED_FIELDS,
  DEPLOY_ACTOR_KINDS,
  DEPLOY_CONTROL_PLANE_ACTION_IDS,
  DEPLOY_PUBLIC_CONTRACT_VERSION,
} from "./types.ts";
export type {
  ControlPlaneDeploymentConfigObservationRecord,
  ControlPlaneDeploymentConfigObservedField,
  ControlPlaneDeploymentConfigObservedStatus,
  ControlPlaneDomainMappingProfile,
  ControlPlaneEmailDomainProjectionRecord,
  ControlPlaneEmailSenderProjectionRecord,
  ControlPlaneEmailSenderPurpose,
  ControlPlaneProviderConfigProjectionRecord,
  ControlPlaneProjectionSourceRecord,
  ControlPlaneRedirectStatusCode,
  ControlPlaneRouteKind,
  ControlPlaneRouteProjectionRecord,
  ControlPlaneRouteSurface,
  ControlPlaneRouteTargetProfile,
  DeriveDeployLatestStatusInput,
  DeployActor,
  DeployActorKind,
  DeployAttemptMode,
  DeployAttemptStatus,
  DeployAttemptSummary,
  DeployControlPlaneRecordsProjectionInput,
  DeployControlPlaneActionId,
  DeployDeployedStatus,
  DeployDeploymentObservationPatch,
  DeployDeploymentObservationPatchRequest,
  DeployDesiredStateDisplaySummary,
  DeployDesiredStateHash,
  DeployDesiredStateHashInput,
  DeployDesiredStateProjection,
  DeployDesiredStateProjectionInput,
  DeployDesiredStateResponse,
  DeployDesiredStateSchemaVersion,
  DeployDesiredStateSource,
  DeployDesiredStateVersion,
  DeployDesiredStateVersionId,
  DeployDesiredStateVersionRef,
  DeployDriftedStatus,
  DeployDriftStatus,
  DeployDriftSummary,
  DeployEvidenceAction,
  DeployEvidenceSummary,
  DeployFailureSummary,
  DeployFailedCurrentVersionStatus,
  DeployJsonPrimitive,
  DeployJsonValue,
  DeployLatestStatus,
  DeployLatestStatusDisplaySummary,
  DeployLatestStatusDisplayTone,
  DeployLatestStatusResponse,
  DeployNoTargetStatus,
  DeployPendingChangesStatus,
  DeployProjectionHashInput,
  DeployProviderFamily,
  DeployResource,
  DeployResourceDependency,
  DeployResourceGraph,
  DeployResourceKind,
  DeployRunnerId,
  DeploySecretReference,
  DeployTargetId,
  DeployTargetKind,
  DeployTargetRef,
  MaterializeDeployDesiredStateVersionInput,
} from "./types.ts";

type DeploymentConfigProjectionRecord = ControlPlaneProviderConfigProjectionRecord & {
  targetId: string;
};

export function deployDesiredStateProjectionInputFromControlPlaneRecords(
  input: DeployControlPlaneRecordsProjectionInput,
): DeployDesiredStateProjectionInput {
  const activeRecords = input.records.filter((record) => record.deletedAt === undefined);
  const providerConfigs = providerConfigProjectionRecordsFromControlPlaneRecords(activeRecords);
  const providerConfigsById = new Map(providerConfigs.map((config) => [config.id, config]));
  const primaryProviderConfig = primaryProviderConfigForTarget(providerConfigs, input.targetId);
  const emailDomains = emailDomainProjectionRecordsFromControlPlaneRecords(activeRecords).filter(
    (emailDomain) =>
      emailDomainMatchesProjectionTarget(emailDomain, {
        primaryProviderConfig,
        providerConfigs: providerConfigsById,
        targetId: input.targetId,
      }),
  );
  const emailDomainIds = new Set(emailDomains.map((emailDomain) => emailDomain.id));
  const emailSenders = emailSenderProjectionRecordsFromControlPlaneRecords(activeRecords).filter(
    (sender) => emailDomainIds.has(sender.emailDomain),
  );
  const routes = routeProjectionRecordsFromControlPlaneRecords(activeRecords).filter((route) =>
    routeMatchesProjectionTarget(route, {
      primaryProviderConfig,
      providerConfigs: providerConfigsById,
      targetId: input.targetId,
    }),
  );
  const workerName = primaryProviderConfig?.workerName ?? input.workerName;

  return {
    emailDomains,
    emailSenders,
    instanceId: input.instanceId,
    providerConfigs: providerConfigProjectionInputRecords(providerConfigs),
    routes,
    targetId: input.targetId,
    ...(workerName === undefined ? {} : { workerName }),
  };
}

export function projectDeployControlPlaneDesiredState(
  input: DeployDesiredStateProjectionInput,
): DeployDesiredStateProjection {
  const routes = (input.routes ?? []).filter(isCurrentProgramPublicSiteRoute);
  const providerConfigs = input.providerConfigs ?? [];
  const emailDomains = input.emailDomains ?? [];
  const emailSenders = input.emailSenders ?? [];
  const providerConfigsById = providerConfigRecordsById(providerConfigs);
  const resources = [
    ...projectRouteProviderResources(routes, {
      instanceId: input.instanceId,
      providerConfigs: providerConfigsById,
      targetId: input.targetId,
      workerName: input.workerName,
    }),
    ...projectEmailProviderResources(emailDomains, emailSenders, {
      instanceId: input.instanceId,
      targetId: input.targetId,
      workerName: input.workerName,
    }),
  ].sort(compareDeployResources);
  const projectionIntent = {
    ...(emailDomains.length === 0
      ? {}
      : { emailDomains: normalizeEmailDomainInputs(emailDomains) }),
    ...(emailSenders.length === 0
      ? {}
      : { emailSenders: normalizeEmailSenderInputs(emailSenders) }),
    providerConfigs: normalizeProviderConfigInputs(providerConfigs, routes),
    routes: normalizeRouteInputs(routes),
    targetId: input.targetId,
  };
  const sourceFingerprint = `control-plane:${stableDeployJsonStringify(projectionIntent)}`;

  return {
    resourceGraph: {
      resources,
      targetId: input.targetId,
    },
    sourceFingerprint,
    targetId: input.targetId,
  };
}

export async function materializeDeployDesiredStateVersion(
  input: MaterializeDeployDesiredStateVersionInput,
): Promise<DeployDesiredStateVersion> {
  assertDeployGraphTarget(input);

  const resourceGraph = canonicalizeDeployResourceGraph(input.resourceGraph);
  const hash = await computeDeployDesiredStateHash({
    resourceGraph,
    schemaVersion: DEPLOY_PUBLIC_CONTRACT_VERSION,
    targetId: input.targetId,
  });
  const revision = deployDesiredStateSourceRevision(input.source);

  return {
    createdAt: input.now,
    display: deployDesiredStateDisplaySummary(resourceGraph, input.title),
    hash,
    resourceGraph,
    revision,
    schemaVersion: DEPLOY_PUBLIC_CONTRACT_VERSION,
    source: input.source,
    targetId: input.targetId,
    versionId: deployDesiredStateVersionId(input.targetId, hash),
  };
}

export function canonicalizeDeployResourceGraph(graph: DeployResourceGraph): DeployResourceGraph {
  return {
    resources: graph.resources
      .map(canonicalizeDeployResourceGraphResource)
      .sort(compareDeployResourceGraphResources),
    targetId: graph.targetId,
  };
}

export function deployResourceGraphCanonicalJson(graph: DeployResourceGraph): string {
  return stableDeployJsonStringify(canonicalizeDeployResourceGraph(graph));
}

export function deployDesiredStateHashInputCanonicalJson(
  input: DeployDesiredStateHashInput,
): string {
  return stableDeployJsonStringify({
    resourceGraph: canonicalizeDeployResourceGraph(input.resourceGraph),
    schemaVersion: input.schemaVersion,
    targetId: input.targetId,
  });
}

export async function computeDeployDesiredStateHash(
  input: DeployDesiredStateHashInput,
): Promise<DeployDesiredStateHash> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(deployDesiredStateHashInputCanonicalJson(input)),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `sha256:${hex}`;
}

export function deployDesiredStateVersionId(
  targetId: DeployTargetId,
  hash: DeployDesiredStateHash,
): DeployDesiredStateVersionId {
  return `desired.${targetId}.${hash}`;
}

export function deployDesiredStateVersionRef(
  version: DeployDesiredStateVersion,
): DeployDesiredStateVersionRef {
  return {
    hash: version.hash,
    revision: version.revision,
    targetId: version.targetId,
    versionId: version.versionId,
  };
}

export function deployDesiredStateSchemaVersion(): DeployDesiredStateSchemaVersion {
  return DEPLOY_PUBLIC_CONTRACT_VERSION;
}

export function deployDesiredStateSourceRevision(source: DeployDesiredStateSource): number {
  return Number.isSafeInteger(source.intentRevision) && source.intentRevision >= 0
    ? source.intentRevision
    : 0;
}

export function deployDesiredStateDisplaySummary(
  resourceGraph: DeployResourceGraph,
  title?: string,
): DeployDesiredStateDisplaySummary {
  return {
    resourceCount: resourceGraph.resources.length,
    resourcesByKind: deployResourceCountsByKind(resourceGraph),
    ...(title === undefined ? {} : { title }),
  };
}

export function deployResourceCountsByKind(
  resourceGraph: DeployResourceGraph,
): Record<DeployResourceKind, number> {
  const resourcesByKind: Partial<Record<DeployResourceKind, number>> = {};

  for (const resource of resourceGraph.resources) {
    resourcesByKind[resource.kind] = (resourcesByKind[resource.kind] ?? 0) + 1;
  }

  return resourcesByKind as Record<DeployResourceKind, number>;
}

export function deployDeploymentAppliedSummary(input: {
  resourceCount: number;
  sourceLabel: string;
}): string {
  return `${input.resourceCount} deployment resource${
    input.resourceCount === 1 ? "" : "s"
  } applied from ${input.sourceLabel}.`;
}

export function deployDisplaySafeFailureSummary(input: {
  code: string;
  details?: string | null;
  displayMessage: string;
}): DeployFailureSummary {
  const details = textRecordValue(input.details);

  return {
    code: input.code,
    ...(details === undefined ? {} : { details }),
    displayMessage: input.displayMessage,
  };
}

export function deployDeploymentObservationPatch(input: {
  desiredState: DeployDesiredStateVersionRef;
  observedAt: string;
  observedError?: string | null;
  observedStatus: ControlPlaneDeploymentConfigObservedStatus;
  observedSummary?: string | null;
  runnerId?: DeployRunnerId | null;
}): DeployDeploymentObservationPatch {
  const observedError = textRecordValue(input.observedError);
  const observedSummary = textRecordValue(input.observedSummary);
  const observedRunnerId = deployRunnerId(input.runnerId);

  return {
    observedAt: input.observedAt,
    observedDesiredStateHash: input.desiredState.hash,
    ...(observedError === undefined ? {} : { observedError }),
    ...(observedRunnerId === undefined ? {} : { observedRunnerId }),
    observedStatus: input.observedStatus,
    ...(observedSummary === undefined ? {} : { observedSummary }),
  };
}

export function deployDeploymentObservationPatchFromLatestStatus(input: {
  desiredState: DeployDesiredStateVersionRef;
  fallbackRunnerId?: DeployRunnerId;
  status: DeployLatestStatus;
  summary?: DeployLatestStatusDisplaySummary;
}): DeployDeploymentObservationPatch {
  const summary = input.summary ?? deployLatestStatusDisplaySummary(input.status);

  switch (input.status.state) {
    case "deployed":
      if (deployStatusDesiredStateMatches(input.status.latestDesiredState, input.desiredState)) {
        return deployDeploymentObservationPatch({
          desiredState: input.desiredState,
          observedAt: input.status.deployedAt,
          observedStatus: "deployed",
          observedSummary: input.status.summary ?? summary.detail,
          runnerId: input.status.runnerId ?? input.fallbackRunnerId,
        });
      }
      break;
    case "failed-current-version":
      if (deployStatusDesiredStateMatches(input.status.latestDesiredState, input.desiredState)) {
        return deployDeploymentObservationPatch({
          desiredState: input.desiredState,
          observedAt: input.status.failedAt,
          observedError: input.status.summary.displayMessage,
          observedStatus: "failed",
          observedSummary: input.status.summary.displayMessage,
          runnerId: input.status.runnerId ?? input.fallbackRunnerId,
        });
      }
      break;
    case "drift":
      if (deployStatusDesiredStateMatches(input.status.latestDesiredState, input.desiredState)) {
        return deployDeploymentObservationPatch({
          desiredState: input.desiredState,
          observedAt: input.status.checkedAt,
          observedStatus: "drifted",
          observedSummary: input.status.summary ?? summary.detail,
          runnerId: input.status.runnerId ?? input.fallbackRunnerId,
        });
      }
      break;
    case "no-target":
    case "pending-changes":
      break;
  }

  return deployDeploymentObservationPatch({
    desiredState: input.desiredState,
    observedAt: input.status.checkedAt,
    observedStatus: "unknown",
    observedSummary: summary.detail,
    runnerId: input.fallbackRunnerId,
  });
}

export function deriveDeployLatestStatus(input: DeriveDeployLatestStatusInput): DeployLatestStatus {
  if (
    input.deploymentConfig === undefined ||
    !deployDeploymentConfigMatchesTarget(input.deploymentConfig, input.targetId)
  ) {
    return {
      checkedAt: input.now,
      state: "no-target",
    };
  }

  if (input.desiredState === undefined) {
    return {
      checkedAt: input.now,
      state: "no-target",
    };
  }

  const latestDesiredState = deployDesiredStateVersionRef(input.desiredState);
  const observedStatus = deployObservedDeploymentStatus(
    input.deploymentConfig.values.observedStatus,
  );
  const observedHash = deployObservedDesiredStateHash(
    input.deploymentConfig.values.observedDesiredStateHash,
  );

  if (observedStatus === undefined || observedHash !== input.desiredState.hash) {
    return {
      checkedAt: input.now,
      latestDesiredState,
      state: "pending-changes",
      targetId: input.targetId,
    };
  }

  const observedAt = textRecordValue(input.deploymentConfig.values.observedAt) ?? input.now;
  const runnerId = deployRunnerId(input.deploymentConfig.values.observedRunnerId);
  const summary = textRecordValue(input.deploymentConfig.values.observedSummary);

  if (observedStatus === "deployed" || observedStatus === "in-sync") {
    return {
      checkedAt: input.now,
      deployedAt: observedAt,
      latestDesiredState,
      ...(runnerId === undefined ? {} : { runnerId }),
      state: "deployed",
      ...(summary === undefined ? {} : { summary }),
      targetId: input.targetId,
    };
  }

  if (observedStatus === "failed") {
    return {
      checkedAt: input.now,
      failedAt: observedAt,
      latestDesiredState,
      ...(runnerId === undefined ? {} : { runnerId }),
      state: "failed-current-version",
      summary: deployObservedFailureSummary(input.deploymentConfig),
      targetId: input.targetId,
    };
  }

  if (observedStatus === "drifted") {
    return {
      checkedAt: input.now,
      latestDesiredState,
      ...(runnerId === undefined ? {} : { runnerId }),
      state: "drift",
      ...(summary === undefined ? {} : { summary }),
      targetId: input.targetId,
    };
  }

  return {
    checkedAt: input.now,
    latestDesiredState,
    state: "pending-changes",
    targetId: input.targetId,
  };
}

export function deployLatestStatusDisplaySummary(
  status: DeployLatestStatus,
): DeployLatestStatusDisplaySummary {
  switch (status.state) {
    case "no-target":
      return {
        detail: "No desired-state version has been recorded",
        label: "No deployment state",
        state: status.state,
        tone: "neutral",
      };
    case "pending-changes":
      return {
        detail: status.latestSuccessfulDesiredState
          ? `Desired revision ${status.latestDesiredState.revision} pending; deployed revision ${status.latestSuccessfulDesiredState.revision}`
          : `Desired revision ${status.latestDesiredState.revision} pending`,
        label: "Pending changes",
        state: status.state,
        tone: "warning",
      };
    case "deployed":
      return {
        detail: `Revision ${status.latestDesiredState.revision} deployed at ${status.deployedAt}`,
        label: "Deployed",
        state: status.state,
        tone: "success",
      };
    case "failed-current-version":
      return {
        detail: `Revision ${status.latestDesiredState.revision}: ${deployFailureLabel(status.summary)}`,
        label: "Failed current version",
        state: status.state,
        tone: "danger",
      };
    case "drift":
      return {
        detail: status.summary ?? "Latest observation reports drift",
        label: "Drift detected",
        state: status.state,
        tone: "warning",
      };
  }
}

export function deployProjectionCanonicalJson(projection: DeployDesiredStateProjection): string {
  return stableDeployJsonStringify(canonicalizeDeployProjection(projection));
}

export function deployProjectionHashInputCanonicalJson(input: DeployProjectionHashInput): string {
  return stableDeployJsonStringify({
    projection: canonicalizeDeployProjection(input.projection),
    schemaVersion: input.schemaVersion,
  });
}

export async function computeDeployProjectionHash(
  projection: DeployDesiredStateProjection,
): Promise<string> {
  const input: DeployProjectionHashInput = {
    projection,
    schemaVersion: DEPLOY_PUBLIC_CONTRACT_VERSION,
  };
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(deployProjectionHashInputCanonicalJson(input)),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `sha256:${hex}`;
}

export function stableDeployJsonStringify(value: DeployJsonValue): string {
  return JSON.stringify(canonicalizeDeployJsonValue(value));
}

export function normalizeDeployLogicalIdPart(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized === "" ? fallback : normalized;
}

export function deployLogicalResourceId(
  instanceId: string,
  kind: string,
  host: string,
  ...parts: readonly (string | undefined)[]
): string {
  return [instanceId, kind, host, ...parts]
    .filter((part): part is string => part !== undefined && part !== "")
    .map((part) => normalizeDeployLogicalIdPart(part, "value"))
    .join("-");
}

function routeProjectionRecordsFromControlPlaneRecords(
  records: readonly ControlPlaneProjectionSourceRecord[],
): ControlPlaneRouteProjectionRecord[] {
  return records
    .filter(
      (record) =>
        record.deletedAt === undefined &&
        record.entity === "route" &&
        booleanRecordValue(record, "enabled") === true,
    )
    .map(routeProjectionRecordFromControlPlaneRecord)
    .filter((record): record is ControlPlaneRouteProjectionRecord => record !== undefined)
    .filter(isCurrentProgramPublicSiteRoute)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function routeProjectionRecordFromControlPlaneRecord(
  record: ControlPlaneProjectionSourceRecord,
): ControlPlaneRouteProjectionRecord | undefined {
  const kind = stringRecordValue(record, "kind");
  const matchPath = stringRecordValue(record, "matchPath");

  if (
    (kind !== "mount" && kind !== "redirect") ||
    matchPath === undefined ||
    record.values.targetProfile === "app" ||
    record.values.appInstall !== undefined ||
    record.values.requiredRole !== undefined
  ) {
    return undefined;
  }

  const deploymentConfig = stringRecordValue(record, "deploymentConfig");
  const matchHost = stringRecordValue(record, "matchHost");
  const matchPrefix = stringRecordValue(record, "matchPrefix");
  const preservePath = booleanRecordValue(record, "preservePath");
  const preserveQueryString = booleanRecordValue(record, "preserveQueryString");
  const statusCode = redirectStatusCodeRecordValue(record, "statusCode");
  const surface = routeSurfaceRecordValue(record, "surface");
  const targetProfile = routeTargetProfileRecordValue(record, "targetProfile");
  const toHost = stringRecordValue(record, "toHost");
  const toUrl = stringRecordValue(record, "toUrl");

  return {
    enabled: true,
    id: record.id,
    kind,
    matchPath,
    ...(deploymentConfig === undefined ? {} : { providerConfig: deploymentConfig }),
    ...(matchHost === undefined ? {} : { matchHost }),
    ...(matchPrefix === undefined ? {} : { matchPrefix }),
    ...(preservePath === undefined ? {} : { preservePath }),
    ...(preserveQueryString === undefined ? {} : { preserveQueryString }),
    ...(statusCode === undefined ? {} : { statusCode }),
    ...(surface === undefined ? {} : { surface }),
    ...(targetProfile === undefined ? {} : { targetProfile }),
    ...(toHost === undefined ? {} : { toHost }),
    ...(toUrl === undefined ? {} : { toUrl }),
  };
}

function emailDomainProjectionRecordsFromControlPlaneRecords(
  records: readonly ControlPlaneProjectionSourceRecord[],
): ControlPlaneEmailDomainProjectionRecord[] {
  return records
    .filter(
      (record) =>
        record.deletedAt === undefined &&
        record.entity === "email-domain" &&
        booleanRecordValue(record, "enabled") === true &&
        stringRecordValue(record, "providerFamily") === "cloudflare",
    )
    .map(emailDomainProjectionRecordFromControlPlaneRecord)
    .filter((record): record is ControlPlaneEmailDomainProjectionRecord => record !== undefined)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function emailDomainProjectionRecordFromControlPlaneRecord(
  record: ControlPlaneProjectionSourceRecord,
): ControlPlaneEmailDomainProjectionRecord | undefined {
  const domain = normalizeOptionalHost(stringRecordValue(record, "domain"));

  if (domain === undefined) {
    return undefined;
  }

  const deploymentConfig = stringRecordValue(record, "deploymentConfig");

  return {
    domain,
    enabled: true,
    id: record.id,
    providerFamily: "cloudflare",
    ...(deploymentConfig === undefined ? {} : { deploymentConfig }),
  };
}

function emailSenderProjectionRecordsFromControlPlaneRecords(
  records: readonly ControlPlaneProjectionSourceRecord[],
): ControlPlaneEmailSenderProjectionRecord[] {
  return records
    .filter(
      (record) =>
        record.deletedAt === undefined &&
        record.entity === "email-sender" &&
        booleanRecordValue(record, "enabled") === true,
    )
    .map(emailSenderProjectionRecordFromControlPlaneRecord)
    .filter((record): record is ControlPlaneEmailSenderProjectionRecord => record !== undefined)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function emailSenderProjectionRecordFromControlPlaneRecord(
  record: ControlPlaneProjectionSourceRecord,
): ControlPlaneEmailSenderProjectionRecord | undefined {
  const address = normalizedEmailAddress(stringRecordValue(record, "address"));
  const emailDomain = stringRecordValue(record, "emailDomain");
  const purpose = stringRecordValue(record, "purpose");

  if (
    address === undefined ||
    emailDomain === undefined ||
    (purpose !== "auth" && purpose !== "contact-notification" && purpose !== "system")
  ) {
    return undefined;
  }

  const displayName = stringRecordValue(record, "displayName");

  return {
    address,
    emailDomain,
    enabled: true,
    id: record.id,
    purpose,
    ...(displayName === undefined ? {} : { displayName }),
  };
}

function providerConfigProjectionRecordsFromControlPlaneRecords(
  records: readonly ControlPlaneProjectionSourceRecord[],
): DeploymentConfigProjectionRecord[] {
  return records
    .filter(
      (record) =>
        record.entity === "deployment-config" &&
        booleanRecordValue(record, "enabled") !== false &&
        stringRecordValue(record, "providerFamily") === "cloudflare",
    )
    .map((record) => {
      const targetId = stringRecordValue(record, "targetId") ?? record.id;
      const workerName = stringRecordValue(record, "workerName");

      return {
        id: record.id,
        providerFamily: "cloudflare" as const,
        targetId,
        ...(workerName === undefined ? {} : { workerName }),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function primaryProviderConfigForTarget(
  providerConfigs: readonly DeploymentConfigProjectionRecord[],
  targetId: string,
): DeploymentConfigProjectionRecord | undefined {
  const matchingPrimary = providerConfigs.find((config) => config.targetId === targetId);

  return matchingPrimary ?? (providerConfigs.length === 1 ? providerConfigs[0] : undefined);
}

function providerConfigProjectionInputRecords(
  providerConfigs: readonly DeploymentConfigProjectionRecord[],
): ControlPlaneProviderConfigProjectionRecord[] {
  return providerConfigs.map((providerConfig) => ({
    id: providerConfig.id,
    providerFamily: providerConfig.providerFamily,
    ...(providerConfig.workerName === undefined ? {} : { workerName: providerConfig.workerName }),
  }));
}

function routeMatchesProjectionTarget(
  route: ControlPlaneRouteProjectionRecord,
  input: {
    primaryProviderConfig?: DeploymentConfigProjectionRecord;
    providerConfigs: ReadonlyMap<string, DeploymentConfigProjectionRecord>;
    targetId: string;
  },
): boolean {
  const providerConfig =
    route.providerConfig === undefined
      ? input.primaryProviderConfig
      : input.providerConfigs.get(route.providerConfig);

  return providerConfig === undefined || providerConfig.targetId === input.targetId;
}

function emailDomainMatchesProjectionTarget(
  emailDomain: ControlPlaneEmailDomainProjectionRecord,
  input: {
    primaryProviderConfig?: DeploymentConfigProjectionRecord;
    providerConfigs: ReadonlyMap<string, DeploymentConfigProjectionRecord>;
    targetId: string;
  },
): boolean {
  const providerConfig =
    emailDomain.deploymentConfig === undefined
      ? input.primaryProviderConfig
      : input.providerConfigs.get(emailDomain.deploymentConfig);

  return providerConfig === undefined || providerConfig.targetId === input.targetId;
}

function stringRecordValue(
  record: ControlPlaneProjectionSourceRecord,
  fieldName: string,
): string | undefined {
  const value = record.values[fieldName];

  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function booleanRecordValue(
  record: ControlPlaneProjectionSourceRecord,
  fieldName: string,
): boolean | undefined {
  const value = record.values[fieldName];

  return typeof value === "boolean" ? value : undefined;
}

function redirectStatusCodeRecordValue(
  record: ControlPlaneProjectionSourceRecord,
  fieldName: string,
): ControlPlaneRouteProjectionRecord["statusCode"] | undefined {
  const value = record.values[fieldName];

  if (
    value === 301 ||
    value === 302 ||
    value === 303 ||
    value === 307 ||
    value === 308 ||
    value === "301" ||
    value === "302" ||
    value === "303" ||
    value === "307" ||
    value === "308"
  ) {
    return value;
  }

  return undefined;
}

function routeSurfaceRecordValue(
  record: ControlPlaneProjectionSourceRecord,
  fieldName: string,
): ControlPlaneRouteProjectionRecord["surface"] | undefined {
  const value = stringRecordValue(record, fieldName);

  if (value === "admin" || value === "public-site") {
    return value;
  }

  return undefined;
}

function routeTargetProfileRecordValue(
  record: ControlPlaneProjectionSourceRecord,
  fieldName: string,
): ControlPlaneRouteProjectionRecord["targetProfile"] | undefined {
  const value = stringRecordValue(record, fieldName);

  if (value === "instance" || value === "public-site") {
    return value;
  }

  return undefined;
}

function projectRouteProviderResources(
  routes: readonly ControlPlaneRouteProjectionRecord[],
  input: {
    instanceId: string;
    providerConfigs: ReadonlyMap<string, ProviderConfigProjection>;
    targetId: string;
    workerName?: string;
  },
): DeployResource[] {
  return routes
    .filter((route) => route.enabled && typeof route.matchHost === "string")
    .flatMap((route) => {
      if (route.kind === "mount") {
        const resource = projectRouteCustomDomainResource(route, input);

        return resource === undefined ? [] : [resource];
      }

      if (route.kind === "redirect") {
        const resource = projectRouteRedirectCustomDomainResource(route, input);

        return resource === undefined ? [] : [resource];
      }

      return [];
    })
    .sort(compareDeployResources);
}

type ProviderConfigProjection = {
  workerName?: string;
};

function providerConfigRecordsById(
  providerConfigs: readonly ControlPlaneProviderConfigProjectionRecord[],
): ReadonlyMap<string, ProviderConfigProjection> {
  const records = new Map<string, ProviderConfigProjection>();

  for (const providerConfig of providerConfigs) {
    if (providerConfig.providerFamily !== "cloudflare") {
      continue;
    }

    records.set(
      providerConfig.id,
      providerConfig.workerName === undefined ? {} : { workerName: providerConfig.workerName },
    );
  }

  return records;
}

function projectRouteCustomDomainResource(
  route: ControlPlaneRouteProjectionRecord,
  input: {
    instanceId: string;
    providerConfigs: ReadonlyMap<string, ProviderConfigProjection>;
    targetId: string;
    workerName?: string;
  },
): DeployResource | undefined {
  const host = normalizeOptionalHost(route.matchHost);
  const profile = domainMappingProfileFromRouteTarget(route.targetProfile);

  if (host === undefined || profile === undefined) {
    return undefined;
  }

  const workerName = routeWorkerName(route.providerConfig, input);

  return {
    dependencies: [],
    inputs: {
      adopt: false,
      host,
      name: host,
      overrideExistingOrigin: false,
      profile,
      ...(workerName === undefined ? {} : { workerName }),
    },
    kind: "cloudflare-worker-custom-domain",
    logicalId: deployLogicalResourceId(input.instanceId, "custom-domain", host, profile),
    providerFamily: "cloudflare",
    targetId: input.targetId,
  };
}

function projectRouteRedirectCustomDomainResource(
  route: ControlPlaneRouteProjectionRecord,
  input: {
    instanceId: string;
    providerConfigs: ReadonlyMap<string, ProviderConfigProjection>;
    targetId: string;
    workerName?: string;
  },
): DeployResource | undefined {
  const redirect = redirectRouteIntent(route);

  if (redirect === undefined) {
    return undefined;
  }

  const workerName = routeWorkerName(route.providerConfig, input);

  return {
    dependencies: [],
    inputs: {
      adopt: false,
      host: redirect.fromHost,
      name: redirect.fromHost,
      overrideExistingOrigin: false,
      ...(workerName === undefined ? {} : { workerName }),
    },
    kind: "cloudflare-worker-custom-domain",
    logicalId: deployLogicalResourceId(
      input.instanceId,
      "redirect-custom-domain",
      redirect.fromHost,
    ),
    providerFamily: "cloudflare",
    targetId: input.targetId,
  };
}

function projectEmailProviderResources(
  emailDomains: readonly ControlPlaneEmailDomainProjectionRecord[],
  emailSenders: readonly ControlPlaneEmailSenderProjectionRecord[],
  input: {
    instanceId: string;
    targetId: string;
    workerName?: string;
  },
): DeployResource[] {
  const sendersByDomainId = new Map<string, ControlPlaneEmailSenderProjectionRecord[]>();

  for (const sender of emailSenders) {
    if (sender.enabled !== true) {
      continue;
    }

    const current = sendersByDomainId.get(sender.emailDomain) ?? [];

    current.push(sender);
    sendersByDomainId.set(sender.emailDomain, current);
  }

  return emailDomains
    .filter((emailDomain) => emailDomain.enabled && emailDomain.providerFamily === "cloudflare")
    .flatMap((emailDomain) => {
      const domain = normalizeOptionalHost(emailDomain.domain);

      if (domain === undefined) {
        return [];
      }

      const logicalIds = emailDomainLogicalIds(input.instanceId, domain);
      const senderAddresses = uniqueSorted(
        (sendersByDomainId.get(emailDomain.id) ?? [])
          .map((sender) => normalizedEmailAddress(sender.address))
          .filter((address): address is string => address !== undefined),
      );
      const domainResource: DeployResource = {
        dependencies: [],
        inputs: {
          domain,
          name: domain,
        },
        kind: "cloudflare-email-sending-domain",
        logicalId: logicalIds.domain,
        providerFamily: "cloudflare",
        targetId: input.targetId,
      };
      const resources = [domainResource];

      if (senderAddresses.length > 0) {
        resources.push({
          dependencies: [{ logicalId: logicalIds.domain, reason: "configured senders" }],
          inputs: {
            allowedSenderAddresses: senderAddresses,
            bindingName: "FORMLESS_EMAIL",
            domain,
            ...(input.workerName === undefined ? {} : { workerName: input.workerName }),
          },
          kind: "cloudflare-worker-send-email-binding",
          logicalId: logicalIds.binding,
          providerFamily: "cloudflare",
          targetId: input.targetId,
        });
      }

      return resources;
    })
    .sort(compareDeployResources);
}

function emailDomainLogicalIds(instanceId: string, domain: string) {
  return {
    binding: deployLogicalResourceId(instanceId, "worker-send-email", domain),
    domain: deployLogicalResourceId(instanceId, "email-sending-domain", domain),
  };
}

type RedirectRouteIntent = {
  fromHost: string;
};

function redirectRouteIntent(
  route: ControlPlaneRouteProjectionRecord,
): RedirectRouteIntent | undefined {
  const fromHost = normalizeOptionalHost(route.matchHost);

  if (fromHost === undefined) {
    return undefined;
  }

  return {
    fromHost,
  };
}

function isCurrentProgramPublicSiteRoute(route: ControlPlaneRouteProjectionRecord): boolean {
  const publicSiteShaped = route.targetProfile === "public-site" || route.surface === "public-site";

  return (
    !publicSiteShaped || (route.targetProfile === "public-site" && route.surface === "public-site")
  );
}

function domainMappingProfileFromRouteTarget(
  value: ControlPlaneRouteProjectionRecord["targetProfile"],
): ControlPlaneDomainMappingProfile | undefined {
  if (value === "instance") {
    return value;
  }

  if (value === "public-site") {
    return "publicSite";
  }

  return undefined;
}

function routeWorkerName(
  providerConfigId: string | undefined,
  input: {
    providerConfigs: ReadonlyMap<string, ProviderConfigProjection>;
    workerName?: string;
  },
): string | undefined {
  if (providerConfigId === undefined) {
    return input.workerName;
  }

  return input.providerConfigs.get(providerConfigId)?.workerName ?? input.workerName;
}

function redirectStatusCode(
  value: ControlPlaneRouteProjectionRecord["statusCode"],
): ControlPlaneRedirectStatusCode {
  switch (value) {
    case 302:
    case "302":
      return 302;
    case 303:
    case "303":
      return 303;
    case 307:
    case "307":
      return 307;
    case 308:
    case "308":
      return 308;
    default:
      return 301;
  }
}

function assertDeployGraphTarget(input: MaterializeDeployDesiredStateVersionInput) {
  if (input.resourceGraph.targetId !== input.targetId) {
    throw new Error(
      `Deploy resource graph target "${input.resourceGraph.targetId}" does not match target "${input.targetId}".`,
    );
  }

  for (const resource of input.resourceGraph.resources) {
    if (resource.targetId !== input.targetId) {
      throw new Error(
        `Deploy resource "${resource.logicalId}" target "${resource.targetId}" does not match target "${input.targetId}".`,
      );
    }
  }
}

function canonicalizeDeployResourceGraphResource(resource: DeployResource): DeployResource {
  return {
    dependencies: resource.dependencies
      .map((dependency) => ({
        logicalId: dependency.logicalId,
        ...(dependency.reason === undefined ? {} : { reason: dependency.reason }),
      }))
      .sort(compareDeployResourceGraphDependencies),
    inputs: canonicalizeDeployResourceGraphJsonObject(resource.inputs),
    kind: resource.kind,
    logicalId: resource.logicalId,
    providerFamily: resource.providerFamily,
    targetId: resource.targetId,
  };
}

function canonicalizeDeployResourceGraphJsonValue(value: DeployJsonValue): DeployJsonValue {
  if (Array.isArray(value)) {
    return value.map(canonicalizeDeployResourceGraphJsonValue);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  return canonicalizeDeployResourceGraphJsonObject(value);
}

function canonicalizeDeployResourceGraphJsonObject(
  value: Record<string, DeployJsonValue>,
): Record<string, DeployJsonValue> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, entryValue]) => entryValue !== undefined && !isDeploySecretInputKey(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, canonicalizeDeployResourceGraphJsonValue(entryValue)]),
  );
}

function isDeploySecretInputKey(key: string): boolean {
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, "");

  return (
    normalizedKey.includes("apikey") ||
    normalizedKey.includes("authorization") ||
    normalizedKey.includes("clientsecret") ||
    normalizedKey.includes("credential") ||
    normalizedKey.includes("password") ||
    normalizedKey.includes("privatekey") ||
    normalizedKey.includes("secret") ||
    normalizedKey.includes("statetoken") ||
    normalizedKey.endsWith("token")
  );
}

function compareDeployResourceGraphResources(left: DeployResource, right: DeployResource): number {
  return (
    left.targetId.localeCompare(right.targetId) ||
    left.logicalId.localeCompare(right.logicalId) ||
    left.kind.localeCompare(right.kind) ||
    left.providerFamily.localeCompare(right.providerFamily) ||
    deployResourceGraphCanonicalTieBreaker(left).localeCompare(
      deployResourceGraphCanonicalTieBreaker(right),
    )
  );
}

function compareDeployResourceGraphDependencies(
  left: DeployResource["dependencies"][number],
  right: DeployResource["dependencies"][number],
): number {
  return (
    left.logicalId.localeCompare(right.logicalId) ||
    (left.reason ?? "").localeCompare(right.reason ?? "")
  );
}

function deployResourceGraphCanonicalTieBreaker(resource: DeployResource): string {
  const canonical = canonicalizeDeployResourceGraphResource(resource);

  return stableDeployJsonStringify({
    dependencies: canonical.dependencies,
    inputs: canonical.inputs,
  });
}

function deployDeploymentConfigMatchesTarget(
  record: ControlPlaneDeploymentConfigObservationRecord,
  targetId: DeployTargetId,
): boolean {
  return (
    record.deletedAt === undefined &&
    record.entity === "deployment-config" &&
    record.values.enabled === true &&
    textRecordValue(record.values.targetId) === targetId
  );
}

function deployStatusDesiredStateMatches(
  observed: DeployDesiredStateVersionRef,
  desiredState: DeployDesiredStateVersionRef,
): boolean {
  return (
    observed.hash === desiredState.hash &&
    observed.targetId === desiredState.targetId &&
    observed.versionId === desiredState.versionId
  );
}

function deployObservedDeploymentStatus(
  value: unknown,
): ControlPlaneDeploymentConfigObservedStatus | undefined {
  return value === "deployed" ||
    value === "drifted" ||
    value === "failed" ||
    value === "in-sync" ||
    value === "unknown"
    ? value
    : undefined;
}

function deployObservedDesiredStateHash(value: unknown): DeployDesiredStateHash | undefined {
  const hash = textRecordValue(value);

  return hash?.startsWith("sha256:") ? hash : undefined;
}

function deployObservedFailureSummary(
  record: ControlPlaneDeploymentConfigObservationRecord,
): DeployFailureSummary {
  const displayMessage =
    textRecordValue(record.values.observedError) ??
    textRecordValue(record.values.observedSummary) ??
    "Deployment failed.";

  return {
    code: "observed-failure",
    displayMessage,
  };
}

function deployRunnerId(value: unknown): DeployRunnerId | undefined {
  return textRecordValue(value);
}

function textRecordValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function deployFailureLabel(summary: DeployFailureSummary): string {
  return summary.code ? `${summary.displayMessage} (${summary.code})` : summary.displayMessage;
}

function canonicalizeDeployProjection(
  projection: DeployDesiredStateProjection,
): DeployDesiredStateProjection {
  return {
    resourceGraph: {
      resources: projection.resourceGraph.resources
        .map(canonicalizeDeployResource)
        .sort(compareDeployResources),
      targetId: projection.resourceGraph.targetId,
    },
    sourceFingerprint: projection.sourceFingerprint,
    targetId: projection.targetId,
  };
}

function canonicalizeDeployResource(resource: DeployResource): DeployResource {
  return {
    dependencies: resource.dependencies
      .map((dependency) => ({
        logicalId: dependency.logicalId,
        ...(dependency.reason === undefined ? {} : { reason: dependency.reason }),
      }))
      .sort((left, right) => left.logicalId.localeCompare(right.logicalId)),
    inputs: canonicalizeDeployJsonObject(resource.inputs),
    kind: resource.kind,
    logicalId: resource.logicalId,
    providerFamily: resource.providerFamily,
    targetId: resource.targetId,
  };
}

function canonicalizeDeployJsonValue(value: DeployJsonValue): DeployJsonValue {
  if (Array.isArray(value)) {
    return value.map(canonicalizeDeployJsonValue);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  return canonicalizeDeployJsonObject(value);
}

function canonicalizeDeployJsonObject(value: Record<string, DeployJsonValue>) {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, canonicalizeDeployJsonValue(entryValue)]),
  );
}

function normalizeProviderConfigInputs(
  providerConfigs: readonly ControlPlaneProviderConfigProjectionRecord[],
  routes: readonly ControlPlaneRouteProjectionRecord[],
): DeployJsonValue[] {
  const referencedConfigIds = new Set(
    routes
      .filter((route) => route.enabled && route.providerConfig !== undefined)
      .map((route) => route.providerConfig ?? ""),
  );

  return providerConfigs
    .filter((providerConfig) => referencedConfigIds.has(providerConfig.id))
    .map((providerConfig) => ({
      id: providerConfig.id,
      providerFamily: providerConfig.providerFamily,
      workerName: providerConfig.workerName ?? null,
    }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function normalizeRouteInputs(
  routes: readonly ControlPlaneRouteProjectionRecord[],
): DeployJsonValue[] {
  return routes
    .filter((route) => route.enabled)
    .map((route) => ({
      id: route.id,
      kind: route.kind,
      matchHost: normalizeOptionalHost(route.matchHost) ?? null,
      matchPath: route.matchPath,
      matchPrefix: route.matchPrefix ?? null,
      preservePath: route.kind === "redirect" ? route.preservePath !== false : null,
      preserveQueryString: route.kind === "redirect" ? route.preserveQueryString !== false : null,
      providerConfig: route.providerConfig ?? null,
      statusCode: route.kind === "redirect" ? redirectStatusCode(route.statusCode) : null,
      surface: route.surface ?? null,
      targetProfile: route.targetProfile ?? null,
      toHost: normalizeOptionalHost(route.toHost) ?? null,
      toUrl: route.toUrl ?? null,
    }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function normalizeEmailDomainInputs(
  emailDomains: readonly ControlPlaneEmailDomainProjectionRecord[],
): DeployJsonValue[] {
  return emailDomains
    .filter((emailDomain) => emailDomain.enabled)
    .map((emailDomain) => ({
      deploymentConfig: emailDomain.deploymentConfig ?? null,
      domain: normalizeOptionalHost(emailDomain.domain) ?? null,
      id: emailDomain.id,
      providerFamily: emailDomain.providerFamily,
    }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function normalizeEmailSenderInputs(
  emailSenders: readonly ControlPlaneEmailSenderProjectionRecord[],
): DeployJsonValue[] {
  return emailSenders
    .filter((sender) => sender.enabled)
    .map((sender) => ({
      address: normalizedEmailAddress(sender.address) ?? null,
      displayName: sender.displayName ?? null,
      emailDomain: sender.emailDomain,
      id: sender.id,
      purpose: sender.purpose,
    }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function normalizeOptionalHost(value: string | undefined): string | undefined {
  const normalized = optionalText(value);

  return normalized === undefined ? undefined : normalizeHost(normalized);
}

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();

  return normalized ? normalized : undefined;
}

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/\.+$/, "");
}

function normalizedEmailAddress(value: string | undefined): string | undefined {
  const text = optionalText(value)?.toLowerCase();

  if (text === undefined || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    return undefined;
  }

  return text;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function compareDeployResources(left: DeployResource, right: DeployResource): number {
  return `${left.kind}\u0000${left.logicalId}`.localeCompare(
    `${right.kind}\u0000${right.logicalId}`,
  );
}
