import {
  DEPLOYMENT_API_ROUTE_PREFIX,
  DEPLOYMENT_DESIRED_STATE_API_PATH,
  DEPLOYMENT_STATUS_API_PATH,
} from "@dpeek/formless-deploy/client";
import type {
  DeployJsonPrimitive,
  DeployJsonValue,
  DeployProviderFamily,
  DeployResource,
  DeployResourceDependency,
  DeployResourceGraph,
  DeployResourceKind,
} from "@dpeek/formless-deploy";

export type DeploymentActorId = string;
export type DeploymentAttemptId = string;
export type DeploymentDesiredStateHash = string;
export type DeploymentDesiredStateVersionId = string;
export type DeploymentIdempotencyKey = string;
export type DeploymentLeaseId = string;
export type DeploymentLeaseToken = string;
export type DeploymentRunnerId = string;
export type DeploymentTargetId = string;

export const INSTANCE_DEPLOYMENT_API_PATH = DEPLOYMENT_API_ROUTE_PREFIX;
export const INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH = DEPLOYMENT_DESIRED_STATE_API_PATH;
export const INSTANCE_DEPLOYMENT_ATTEMPT_START_API_PATH = `${INSTANCE_DEPLOYMENT_API_PATH}/attempts/start`;
export const INSTANCE_DEPLOYMENT_ATTEMPT_HEARTBEAT_API_PATH = `${INSTANCE_DEPLOYMENT_API_PATH}/attempts/heartbeat`;
export const INSTANCE_DEPLOYMENT_ATTEMPT_PLAN_API_PATH = `${INSTANCE_DEPLOYMENT_API_PATH}/attempts/plan`;
export const INSTANCE_DEPLOYMENT_ATTEMPT_SUCCESS_API_PATH = `${INSTANCE_DEPLOYMENT_API_PATH}/attempts/success`;
export const INSTANCE_DEPLOYMENT_ATTEMPT_FAILURE_API_PATH = `${INSTANCE_DEPLOYMENT_API_PATH}/attempts/failure`;
export const INSTANCE_DEPLOYMENT_DRIFT_API_PATH = `${INSTANCE_DEPLOYMENT_API_PATH}/drift`;
export const INSTANCE_DEPLOYMENT_STATUS_API_PATH = DEPLOYMENT_STATUS_API_PATH;

export type DeploymentRuntimeValidationErrorCode =
  | "invalid-actor-id"
  | "invalid-attempt-id"
  | "invalid-attempt-mode"
  | "invalid-attempt-status"
  | "invalid-desired-state-hash"
  | "invalid-desired-state-version-id"
  | "invalid-desired-state-version-ref"
  | "invalid-idempotency-key"
  | "invalid-lease-token"
  | "invalid-target-id";

export type DeploymentRuntimeValidationField =
  | "actorId"
  | "attemptId"
  | "hash"
  | "idempotencyKey"
  | "leaseToken"
  | "mode"
  | "revision"
  | "status"
  | "targetId"
  | "versionId";

export type DeploymentRuntimeValidationError = {
  code: DeploymentRuntimeValidationErrorCode;
  field?: DeploymentRuntimeValidationField;
  message: string;
};

export type DeploymentActorKind = "ci" | "cli" | "runner" | "system";

export type DeploymentActor = {
  actorId: DeploymentActorId;
  displayName?: string;
  kind: DeploymentActorKind;
  runnerId?: DeploymentRunnerId;
};

export type DeploymentTarget = {
  targetId: DeploymentTargetId;
  label?: string;
};

export type DeploymentDesiredStateSchemaVersion = 1;

export type DeploymentDesiredStateSource = {
  fingerprint: string;
  intentRevision: number;
};

export type DeploymentDesiredStateVersionRef = {
  hash: DeploymentDesiredStateHash;
  revision: number;
  targetId: DeploymentTargetId;
  versionId: DeploymentDesiredStateVersionId;
};

export type DeploymentDesiredStateDisplaySummary = {
  resourceCount: number;
  resourcesByKind: Record<DeploymentResourceKind, number>;
  title?: string;
};

export type DeploymentDesiredStateVersion = DeploymentDesiredStateVersionRef & {
  createdAt: string;
  display: DeploymentDesiredStateDisplaySummary;
  resourceGraph: DeploymentResourceGraph;
  schemaVersion: DeploymentDesiredStateSchemaVersion;
  source: DeploymentDesiredStateSource;
};

export type InstanceDeploymentDesiredStateResponse = {
  desiredState: DeploymentDesiredStateVersion;
  target: DeploymentTarget;
};

export type DeploymentProviderFamily = DeployProviderFamily;

export type DeploymentResourceKind = DeployResourceKind;

export type DeploymentJsonPrimitive = DeployJsonPrimitive;

export type DeploymentJsonValue = DeployJsonValue;

export type DeploymentResourceDependency = DeployResourceDependency;

export type DeploymentResource = DeployResource;

export type DeploymentResourceGraph = DeployResourceGraph;

export type DeploymentDesiredStateHashInput = {
  resourceGraph: DeploymentResourceGraph;
  schemaVersion: DeploymentDesiredStateSchemaVersion;
  targetId: DeploymentTargetId;
};

export type DeploymentAttemptMode = "apply" | "destroy" | "plan";

export type DeploymentAttemptStatus = "failed" | "planned" | "started" | "succeeded";

export type DeploymentTargetIdValidationResult =
  | {
      ok: true;
      targetId: DeploymentTargetId;
    }
  | {
      ok: false;
      error: DeploymentRuntimeValidationError;
    };

export type DeploymentActorIdValidationResult =
  | {
      ok: true;
      actorId: DeploymentActorId;
    }
  | {
      ok: false;
      error: DeploymentRuntimeValidationError;
    };

export type DeploymentAttemptIdValidationResult =
  | {
      ok: true;
      attemptId: DeploymentAttemptId;
    }
  | {
      ok: false;
      error: DeploymentRuntimeValidationError;
    };

export type DeploymentDesiredStateVersionIdValidationResult =
  | {
      ok: true;
      versionId: DeploymentDesiredStateVersionId;
    }
  | {
      ok: false;
      error: DeploymentRuntimeValidationError;
    };

export type DeploymentDesiredStateHashValidationResult =
  | {
      ok: true;
      hash: DeploymentDesiredStateHash;
    }
  | {
      ok: false;
      error: DeploymentRuntimeValidationError;
    };

export type DeploymentLeaseTokenValidationResult =
  | {
      ok: true;
      leaseToken: DeploymentLeaseToken;
    }
  | {
      ok: false;
      error: DeploymentRuntimeValidationError;
    };

export type DeploymentIdempotencyKeyValidationResult =
  | {
      ok: true;
      idempotencyKey: DeploymentIdempotencyKey;
    }
  | {
      ok: false;
      error: DeploymentRuntimeValidationError;
    };

export type DeploymentAttemptModeValidationResult =
  | {
      ok: true;
      mode: DeploymentAttemptMode;
    }
  | {
      ok: false;
      error: DeploymentRuntimeValidationError;
    };

export type DeploymentAttemptStatusValidationResult =
  | {
      ok: true;
      status: DeploymentAttemptStatus;
    }
  | {
      ok: false;
      error: DeploymentRuntimeValidationError;
    };

export type DeploymentDesiredStateVersionRefValidationResult =
  | {
      ok: true;
      versionRef: DeploymentDesiredStateVersionRef;
    }
  | {
      ok: false;
      error: DeploymentRuntimeValidationError;
    };

export const deploymentAttemptModes = [
  "apply",
  "destroy",
  "plan",
] as const satisfies readonly DeploymentAttemptMode[];

export const deploymentAttemptStatuses = [
  "failed",
  "planned",
  "started",
  "succeeded",
] as const satisfies readonly DeploymentAttemptStatus[];

export const deploymentEvidenceActions = [
  "adopted",
  "created",
  "deleted",
  "no-change",
  "updated",
] as const satisfies readonly DeploymentEvidenceAction[];

export const deploymentDriftStatuses = [
  "drifted",
  "in-sync",
  "unknown",
] as const satisfies readonly DeploymentDriftStatus[];

const deploymentIdMaxLength = 128;
const deploymentOpaqueTokenMaxLength = 256;
const deploymentIdPattern = /^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$/;
const deploymentOpaqueTokenPattern = /^[A-Za-z0-9._:-]+$/;
const deploymentDesiredStateHashPattern = /^sha256:[a-f0-9]{64}$/;
const desiredStateVersionRefKeys = new Set(["hash", "revision", "targetId", "versionId"]);

export function validateDeploymentTargetId(value: string): DeploymentTargetIdValidationResult {
  return validateDeploymentTargetIdValue(value, "Deployment target id");
}

export function parseDeploymentTargetId(context: string, value: unknown): DeploymentTargetId {
  const result = validateDeploymentTargetIdValue(value, context);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.targetId;
}

export function validateDeploymentActorId(value: string): DeploymentActorIdValidationResult {
  return validateDeploymentActorIdValue(value, "Deployment actor id");
}

export function parseDeploymentActorId(context: string, value: unknown): DeploymentActorId {
  const result = validateDeploymentActorIdValue(value, context);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.actorId;
}

export function validateDeploymentAttemptId(value: string): DeploymentAttemptIdValidationResult {
  return validateDeploymentAttemptIdValue(value, "Deployment attempt id");
}

export function parseDeploymentAttemptId(context: string, value: unknown): DeploymentAttemptId {
  const result = validateDeploymentAttemptIdValue(value, context);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.attemptId;
}

export function validateDeploymentDesiredStateVersionId(
  value: string,
): DeploymentDesiredStateVersionIdValidationResult {
  return validateDeploymentDesiredStateVersionIdValue(value, "Deployment desired-state version id");
}

export function parseDeploymentDesiredStateVersionId(
  context: string,
  value: unknown,
): DeploymentDesiredStateVersionId {
  const result = validateDeploymentDesiredStateVersionIdValue(value, context);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.versionId;
}

export function validateDeploymentDesiredStateHash(
  value: string,
): DeploymentDesiredStateHashValidationResult {
  return validateDeploymentDesiredStateHashValue(value, "Deployment desired-state hash");
}

export function parseDeploymentDesiredStateHash(
  context: string,
  value: unknown,
): DeploymentDesiredStateHash {
  const result = validateDeploymentDesiredStateHashValue(value, context);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.hash;
}

export function validateDeploymentLeaseToken(value: string): DeploymentLeaseTokenValidationResult {
  return validateDeploymentLeaseTokenValue(value, "Deployment lease token");
}

export function parseDeploymentLeaseToken(context: string, value: unknown): DeploymentLeaseToken {
  const result = validateDeploymentLeaseTokenValue(value, context);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.leaseToken;
}

export function validateDeploymentIdempotencyKey(
  value: string,
): DeploymentIdempotencyKeyValidationResult {
  return validateDeploymentIdempotencyKeyValue(value, "Deployment idempotency key");
}

export function parseDeploymentIdempotencyKey(
  context: string,
  value: unknown,
): DeploymentIdempotencyKey {
  const result = validateDeploymentIdempotencyKeyValue(value, context);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.idempotencyKey;
}

export function isDeploymentAttemptMode(value: unknown): value is DeploymentAttemptMode {
  return (
    typeof value === "string" && deploymentAttemptModes.includes(value as DeploymentAttemptMode)
  );
}

export function validateDeploymentAttemptMode(
  value: string,
): DeploymentAttemptModeValidationResult {
  return validateDeploymentAttemptModeValue(value, "Deployment attempt mode");
}

export function parseDeploymentAttemptMode(context: string, value: unknown): DeploymentAttemptMode {
  const result = validateDeploymentAttemptModeValue(value, context);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.mode;
}

export function isDeploymentAttemptStatus(value: unknown): value is DeploymentAttemptStatus {
  return (
    typeof value === "string" &&
    deploymentAttemptStatuses.includes(value as DeploymentAttemptStatus)
  );
}

export function validateDeploymentAttemptStatus(
  value: string,
): DeploymentAttemptStatusValidationResult {
  return validateDeploymentAttemptStatusValue(value, "Deployment attempt status");
}

export function parseDeploymentAttemptStatus(
  context: string,
  value: unknown,
): DeploymentAttemptStatus {
  const result = validateDeploymentAttemptStatusValue(value, context);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.status;
}

export function validateDeploymentDesiredStateVersionRef(
  value: unknown,
): DeploymentDesiredStateVersionRefValidationResult {
  return validateDeploymentDesiredStateVersionRefValue(
    value,
    "Deployment desired-state version reference",
  );
}

export function parseDeploymentDesiredStateVersionRef(
  context: string,
  value: unknown,
): DeploymentDesiredStateVersionRef {
  const result = validateDeploymentDesiredStateVersionRefValue(value, context);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.versionRef;
}

export function canonicalizeDeploymentResourceGraph(
  graph: DeploymentResourceGraph,
): DeploymentResourceGraph {
  return {
    resources: graph.resources.map(canonicalizeDeploymentResource).sort(compareDeploymentResources),
    targetId: graph.targetId,
  };
}

export function canonicalizeDeploymentResource(resource: DeploymentResource): DeploymentResource {
  return {
    dependencies: resource.dependencies
      .map((dependency) => ({
        logicalId: dependency.logicalId,
        ...(dependency.reason === undefined ? {} : { reason: dependency.reason }),
      }))
      .sort(compareDeploymentResourceDependencies),
    inputs: canonicalizeDeploymentJsonObject(resource.inputs),
    kind: resource.kind,
    logicalId: resource.logicalId,
    providerFamily: resource.providerFamily,
    targetId: resource.targetId,
  };
}

export function canonicalizeDeploymentJsonValue(value: DeploymentJsonValue): DeploymentJsonValue {
  if (Array.isArray(value)) {
    return value.map(canonicalizeDeploymentJsonValue);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  return canonicalizeDeploymentJsonObject(value);
}

export function canonicalizeDeploymentDesiredStateHashInput(
  input: DeploymentDesiredStateHashInput,
): DeploymentDesiredStateHashInput {
  return {
    resourceGraph: canonicalizeDeploymentResourceGraph(input.resourceGraph),
    schemaVersion: input.schemaVersion,
    targetId: input.targetId,
  };
}

export function deploymentResourceGraphCanonicalJson(graph: DeploymentResourceGraph): string {
  return stableDeploymentJsonStringify(canonicalizeDeploymentResourceGraph(graph));
}

export function deploymentDesiredStateHashInputCanonicalJson(
  input: DeploymentDesiredStateHashInput,
): string {
  return stableDeploymentJsonStringify(canonicalizeDeploymentDesiredStateHashInput(input));
}

export async function computeDeploymentDesiredStateHash(
  input: DeploymentDesiredStateHashInput,
): Promise<DeploymentDesiredStateHash> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(deploymentDesiredStateHashInputCanonicalJson(input)),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `sha256:${hex}`;
}

export function deploymentDesiredStateVersionRefsEqual(
  left: DeploymentDesiredStateVersionRef,
  right: DeploymentDesiredStateVersionRef,
): boolean {
  return (
    left.hash === right.hash &&
    left.revision === right.revision &&
    left.targetId === right.targetId &&
    left.versionId === right.versionId
  );
}

export function isDeploymentDesiredStateVersionRefCurrent(
  latest: DeploymentDesiredStateVersionRef,
  requested: DeploymentDesiredStateVersionRef,
): boolean {
  return deploymentDesiredStateVersionRefsEqual(latest, requested);
}

export type DeploymentAttempt = DeploymentDesiredStateVersionRef & {
  actor: DeploymentActor;
  attemptId: DeploymentAttemptId;
  completedAt?: string;
  idempotencyKey: DeploymentIdempotencyKey;
  leaseId?: DeploymentLeaseId;
  mode: DeploymentAttemptMode;
  plan?: DeploymentPlanResult;
  result?: DeploymentTerminalResult;
  runnerId?: DeploymentRunnerId;
  startedAt: string;
  status: DeploymentAttemptStatus;
  updatedAt: string;
};

export type InstanceDeploymentAttemptStartRequest = {
  actor: DeploymentActor;
  desiredState: DeploymentDesiredStateVersionRef;
  idempotencyKey: DeploymentIdempotencyKey;
  mode: DeploymentAttemptMode;
};

export type InstanceDeploymentAttemptStartResponse = {
  attempt: DeploymentAttempt;
  lease?: DeploymentLease;
  replayed: boolean;
};

export type InstanceDeploymentAttemptHeartbeatRequest = {
  attemptId: DeploymentAttemptId;
  desiredState: DeploymentDesiredStateVersionRef;
  leaseToken: DeploymentLeaseToken;
};

export type InstanceDeploymentAttemptHeartbeatResponse = {
  attempt: DeploymentAttempt;
  lease: DeploymentLease;
};

export type DeploymentLeaseStatus = "active" | "expired" | "released";

export type DeploymentLease = {
  acquiredAt: string;
  actor: DeploymentActor;
  attemptId: DeploymentAttemptId;
  expiresAt: string;
  leaseId: DeploymentLeaseId;
  mode: Exclude<DeploymentAttemptMode, "plan">;
  releasedAt?: string;
  status: DeploymentLeaseStatus;
  targetId: DeploymentTargetId;
  token: DeploymentLeaseToken;
};

export type DeploymentPlanChangeCounts = {
  create: number;
  delete: number;
  noChange: number;
  update: number;
};

export type DeploymentPlanIssue = {
  code: string;
  logicalId?: string;
  message: string;
};

export type DeploymentPlanSummary = {
  blockers: DeploymentPlanIssue[];
  changes: DeploymentPlanChangeCounts;
  displayText?: string;
  warnings: DeploymentPlanIssue[];
};

export type DeploymentPlanResult = DeploymentDesiredStateVersionRef & {
  attemptId: DeploymentAttemptId;
  kind: "plan";
  recordedAt: string;
  runnerId?: DeploymentRunnerId;
  summary: DeploymentPlanSummary;
};

export type DeploymentEvidenceAction = "adopted" | "created" | "deleted" | "no-change" | "updated";

export type DeploymentResourceEvidenceSummary = {
  action: DeploymentEvidenceAction;
  alchemyResourceId?: string;
  displayName?: string;
  kind: DeploymentResourceKind;
  logicalId: string;
  providerFamily: DeploymentProviderFamily;
  providerResourceIds: string[];
  targetId: DeploymentTargetId;
};

export type DeploymentAlchemyStatePointer = {
  app?: string;
  scope?: string;
  stage?: string;
};

export type DeploymentSuccessResult = DeploymentDesiredStateVersionRef & {
  alchemy: DeploymentAlchemyStatePointer;
  attemptId: DeploymentAttemptId;
  completedAt: string;
  evidence: DeploymentResourceEvidenceSummary[];
  kind: "success";
  runnerId?: DeploymentRunnerId;
};

export type DeploymentFailureSummary = {
  code: string;
  details?: string;
  displayMessage: string;
};

export type DeploymentFailureResult = DeploymentDesiredStateVersionRef & {
  actor: DeploymentActor;
  attemptId: DeploymentAttemptId;
  failedAt: string;
  kind: "failure";
  runnerId?: DeploymentRunnerId;
  summary: DeploymentFailureSummary;
};

export type DeploymentTerminalResult = DeploymentFailureResult | DeploymentSuccessResult;

export type DeploymentAttemptResult =
  | DeploymentFailureResult
  | DeploymentPlanResult
  | DeploymentSuccessResult;

export type DeploymentDriftReportId = string;

export type DeploymentDriftStatus = "drifted" | "in-sync" | "unknown";

export type DeploymentDriftSummary = {
  affectedLogicalIds: string[];
  create: number;
  delete: number;
  update: number;
};

export type DeploymentDriftReport = DeploymentDesiredStateVersionRef & {
  actor: DeploymentActor;
  reportId: DeploymentDriftReportId;
  reportedAt: string;
  status: DeploymentDriftStatus;
  summary: DeploymentDriftSummary;
};

export type InstanceDeploymentAttemptPlanWritebackRequest = {
  attemptId: DeploymentAttemptId;
  desiredState: DeploymentDesiredStateVersionRef;
  runnerId?: DeploymentRunnerId;
  summary: DeploymentPlanSummary;
};

export type InstanceDeploymentAttemptPlanWritebackResponse = {
  attempt: DeploymentAttempt;
  plan: DeploymentPlanResult;
};

export type InstanceDeploymentAttemptSuccessWritebackRequest = {
  alchemy: DeploymentAlchemyStatePointer;
  attemptId: DeploymentAttemptId;
  desiredState: DeploymentDesiredStateVersionRef;
  evidence: DeploymentResourceEvidenceSummary[];
  leaseToken: DeploymentLeaseToken;
  runnerId?: DeploymentRunnerId;
};

export type InstanceDeploymentAttemptSuccessWritebackResponse = {
  attempt: DeploymentAttempt;
  lease: DeploymentLease;
  result: DeploymentSuccessResult;
};

export type InstanceDeploymentAttemptFailureWritebackRequest = {
  actor: DeploymentActor;
  attemptId: DeploymentAttemptId;
  desiredState: DeploymentDesiredStateVersionRef;
  leaseToken?: DeploymentLeaseToken;
  runnerId?: DeploymentRunnerId;
  summary: DeploymentFailureSummary;
};

export type InstanceDeploymentAttemptFailureWritebackResponse = {
  attempt: DeploymentAttempt;
  lease?: DeploymentLease;
  result: DeploymentFailureResult;
};

export type InstanceDeploymentDriftWritebackRequest = {
  actor: DeploymentActor;
  desiredState: DeploymentDesiredStateVersionRef;
  status: DeploymentDriftStatus;
  summary: DeploymentDriftSummary;
};

export type InstanceDeploymentDriftWritebackResponse = {
  report: DeploymentDriftReport;
};

export type DeploymentStatus =
  | DeploymentActiveStatus
  | DeploymentDeployedStatus
  | DeploymentDriftedStatus
  | DeploymentFailedCurrentVersionStatus
  | DeploymentFailedOlderVersionStatus
  | DeploymentNoTargetStatus
  | DeploymentPendingChangesStatus;

export type DeploymentNoTargetStatus = {
  checkedAt: string;
  state: "no-target";
};

export type DeploymentPendingChangesStatus = {
  checkedAt: string;
  latestDesiredState: DeploymentDesiredStateVersionRef;
  latestSuccessfulDesiredState?: DeploymentDesiredStateVersionRef;
  state: "pending-changes";
  targetId: DeploymentTargetId;
};

export type DeploymentActiveStatus = {
  actor: DeploymentActor;
  attemptId: DeploymentAttemptId;
  checkedAt: string;
  desiredState: DeploymentDesiredStateVersionRef;
  leaseExpiresAt?: string;
  mode: DeploymentAttemptMode;
  startedAt: string;
  state: "in-progress";
  targetId: DeploymentTargetId;
};

export type DeploymentDeployedStatus = {
  attemptId?: DeploymentAttemptId;
  checkedAt: string;
  deployedAt: string;
  latestDesiredState: DeploymentDesiredStateVersionRef;
  runnerId?: DeploymentRunnerId;
  summary?: string;
  state: "deployed";
  targetId: DeploymentTargetId;
};

export type DeploymentFailedCurrentVersionStatus = {
  attemptId?: DeploymentAttemptId;
  checkedAt: string;
  failedAt: string;
  latestDesiredState: DeploymentDesiredStateVersionRef;
  runnerId?: DeploymentRunnerId;
  state: "failed-current-version";
  summary: DeploymentFailureSummary;
  targetId: DeploymentTargetId;
};

export type DeploymentFailedOlderVersionStatus = {
  attemptId?: DeploymentAttemptId;
  checkedAt: string;
  failedAt: string;
  failedDesiredState: DeploymentDesiredStateVersionRef;
  latestDesiredState: DeploymentDesiredStateVersionRef;
  runnerId?: DeploymentRunnerId;
  state: "failed-older-version";
  summary: DeploymentFailureSummary;
  targetId: DeploymentTargetId;
};

export type DeploymentDriftedStatus = {
  checkedAt: string;
  latestDesiredState: DeploymentDesiredStateVersionRef;
  latestSuccessfulDesiredState?: DeploymentDesiredStateVersionRef;
  report?: DeploymentDriftReport;
  runnerId?: DeploymentRunnerId;
  state: "drift";
  summary?: string;
  targetId: DeploymentTargetId;
};

export type InstanceDeploymentStatusResponse = {
  status: DeploymentStatus;
  target: DeploymentTarget;
};

export type DeploymentStatusDisplayTone = "danger" | "neutral" | "progress" | "success" | "warning";

export type DeploymentStatusDisplaySummary = {
  detail: string;
  label: string;
  state: DeploymentStatus["state"];
  tone: DeploymentStatusDisplayTone;
};

export function deploymentStatusDisplaySummary(
  status: DeploymentStatus,
): DeploymentStatusDisplaySummary {
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
    case "in-progress":
      return {
        detail: `${deploymentAttemptModeLabel(status.mode)} revision ${status.desiredState.revision} by ${deploymentActorLabel(status.actor)}`,
        label: "In progress",
        state: status.state,
        tone: "progress",
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
        detail: `Revision ${status.latestDesiredState.revision}: ${deploymentFailureLabel(status.summary)}`,
        label: "Failed current version",
        state: status.state,
        tone: "danger",
      };
    case "failed-older-version":
      return {
        detail: `Revision ${status.failedDesiredState.revision}: ${deploymentFailureLabel(status.summary)}; latest revision ${status.latestDesiredState.revision}`,
        label: "Failed older version",
        state: status.state,
        tone: "warning",
      };
    case "drift":
      return {
        detail:
          status.summary ??
          (status.report === undefined
            ? "Latest observation reports drift"
            : deploymentDriftLabel(status.report.summary)),
        label: "Drift detected",
        state: status.state,
        tone: "warning",
      };
  }
}

function deploymentAttemptModeLabel(mode: DeploymentAttemptMode): string {
  switch (mode) {
    case "apply":
      return "Apply";
    case "destroy":
      return "Destroy";
    case "plan":
      return "Plan";
  }
}

function deploymentActorLabel(actor: DeploymentActor): string {
  return actor.displayName ?? actor.runnerId ?? actor.actorId;
}

function deploymentFailureLabel(summary: DeploymentFailureSummary): string {
  return summary.code ? `${summary.displayMessage} (${summary.code})` : summary.displayMessage;
}

function deploymentDriftLabel(summary: DeploymentDriftSummary): string {
  return `create ${summary.create}, update ${summary.update}, delete ${summary.delete}`;
}

function validateDeploymentTargetIdValue(
  value: unknown,
  context: string,
): DeploymentTargetIdValidationResult {
  const result = validateDeploymentIdentifier(value, context, "targetId", "invalid-target-id");

  return result.ok ? { ok: true, targetId: result.value } : result;
}

function validateDeploymentActorIdValue(
  value: unknown,
  context: string,
): DeploymentActorIdValidationResult {
  const result = validateDeploymentIdentifier(value, context, "actorId", "invalid-actor-id");

  return result.ok ? { ok: true, actorId: result.value } : result;
}

function validateDeploymentAttemptIdValue(
  value: unknown,
  context: string,
): DeploymentAttemptIdValidationResult {
  const result = validateDeploymentIdentifier(value, context, "attemptId", "invalid-attempt-id");

  return result.ok ? { ok: true, attemptId: result.value } : result;
}

function validateDeploymentDesiredStateVersionIdValue(
  value: unknown,
  context: string,
): DeploymentDesiredStateVersionIdValidationResult {
  const result = validateDeploymentIdentifier(
    value,
    context,
    "versionId",
    "invalid-desired-state-version-id",
  );

  return result.ok ? { ok: true, versionId: result.value } : result;
}

function validateDeploymentDesiredStateHashValue(
  value: unknown,
  context: string,
): DeploymentDesiredStateHashValidationResult {
  if (typeof value !== "string") {
    return {
      ok: false,
      error: deploymentRuntimeValidationError(
        "invalid-desired-state-hash",
        "hash",
        `${context} must be a string.`,
      ),
    };
  }

  const hash = value.trim();

  if (!deploymentDesiredStateHashPattern.test(hash)) {
    return {
      ok: false,
      error: deploymentRuntimeValidationError(
        "invalid-desired-state-hash",
        "hash",
        `${context} must use "sha256:" followed by 64 lowercase hex characters.`,
      ),
    };
  }

  return { ok: true, hash };
}

function validateDeploymentLeaseTokenValue(
  value: unknown,
  context: string,
): DeploymentLeaseTokenValidationResult {
  const result = validateDeploymentOpaqueToken(value, context, "leaseToken", "invalid-lease-token");

  return result.ok ? { ok: true, leaseToken: result.value } : result;
}

function validateDeploymentIdempotencyKeyValue(
  value: unknown,
  context: string,
): DeploymentIdempotencyKeyValidationResult {
  const result = validateDeploymentOpaqueToken(
    value,
    context,
    "idempotencyKey",
    "invalid-idempotency-key",
  );

  return result.ok ? { ok: true, idempotencyKey: result.value } : result;
}

function validateDeploymentAttemptModeValue(
  value: unknown,
  context: string,
): DeploymentAttemptModeValidationResult {
  if (typeof value !== "string") {
    return {
      ok: false,
      error: deploymentRuntimeValidationError(
        "invalid-attempt-mode",
        "mode",
        `${context} must be a string.`,
      ),
    };
  }

  const mode = value.trim();

  if (!isDeploymentAttemptMode(mode)) {
    return {
      ok: false,
      error: deploymentRuntimeValidationError(
        "invalid-attempt-mode",
        "mode",
        `${context} must be "apply", "destroy", or "plan".`,
      ),
    };
  }

  return { ok: true, mode };
}

function validateDeploymentAttemptStatusValue(
  value: unknown,
  context: string,
): DeploymentAttemptStatusValidationResult {
  if (typeof value !== "string") {
    return {
      ok: false,
      error: deploymentRuntimeValidationError(
        "invalid-attempt-status",
        "status",
        `${context} must be a string.`,
      ),
    };
  }

  const status = value.trim();

  if (!isDeploymentAttemptStatus(status)) {
    return {
      ok: false,
      error: deploymentRuntimeValidationError(
        "invalid-attempt-status",
        "status",
        `${context} must be "failed", "planned", "started", or "succeeded".`,
      ),
    };
  }

  return { ok: true, status };
}

function validateDeploymentDesiredStateVersionRefValue(
  value: unknown,
  context: string,
): DeploymentDesiredStateVersionRefValidationResult {
  if (!isRecord(value)) {
    return {
      ok: false,
      error: deploymentRuntimeValidationError(
        "invalid-desired-state-version-ref",
        undefined,
        `${context} must be an object.`,
      ),
    };
  }

  for (const key of Object.keys(value)) {
    if (!desiredStateVersionRefKeys.has(key)) {
      return {
        ok: false,
        error: deploymentRuntimeValidationError(
          "invalid-desired-state-version-ref",
          undefined,
          `${context} has unsupported key "${key}".`,
        ),
      };
    }
  }

  for (const key of desiredStateVersionRefKeys) {
    if (!(key in value)) {
      return {
        ok: false,
        error: deploymentRuntimeValidationError(
          "invalid-desired-state-version-ref",
          key as DeploymentRuntimeValidationField,
          `${context} must include "${key}".`,
        ),
      };
    }
  }

  const targetId = validateDeploymentTargetIdValue(value.targetId, `${context}.targetId`);

  if (!targetId.ok) {
    return targetId;
  }

  const versionId = validateDeploymentDesiredStateVersionIdValue(
    value.versionId,
    `${context}.versionId`,
  );

  if (!versionId.ok) {
    return versionId;
  }

  const revision = validateDeploymentRevision(value.revision, `${context}.revision`);

  if (!revision.ok) {
    return revision;
  }

  const hash = validateDeploymentDesiredStateHashValue(value.hash, `${context}.hash`);

  if (!hash.ok) {
    return hash;
  }

  return {
    ok: true,
    versionRef: {
      hash: hash.hash,
      revision: revision.revision,
      targetId: targetId.targetId,
      versionId: versionId.versionId,
    },
  };
}

function validateDeploymentIdentifier(
  value: unknown,
  context: string,
  field: DeploymentRuntimeValidationField,
  code: DeploymentRuntimeValidationErrorCode,
):
  | {
      ok: true;
      value: string;
    }
  | {
      ok: false;
      error: DeploymentRuntimeValidationError;
    } {
  if (typeof value !== "string") {
    return {
      ok: false,
      error: deploymentRuntimeValidationError(code, field, `${context} must be a string.`),
    };
  }

  const identifier = value.trim();

  if (identifier === "") {
    return {
      ok: false,
      error: deploymentRuntimeValidationError(code, field, `${context} is required.`),
    };
  }

  if (identifier.length > deploymentIdMaxLength) {
    return {
      ok: false,
      error: deploymentRuntimeValidationError(
        code,
        field,
        `${context} must be ${deploymentIdMaxLength} characters or fewer.`,
      ),
    };
  }

  if (!deploymentIdPattern.test(identifier)) {
    return {
      ok: false,
      error: deploymentRuntimeValidationError(
        code,
        field,
        `${context} must start with a lowercase letter and use lowercase letters, numbers, dots, underscores, colons, and single hyphens as separators.`,
      ),
    };
  }

  return { ok: true, value: identifier };
}

function validateDeploymentOpaqueToken(
  value: unknown,
  context: string,
  field: DeploymentRuntimeValidationField,
  code: DeploymentRuntimeValidationErrorCode,
):
  | {
      ok: true;
      value: string;
    }
  | {
      ok: false;
      error: DeploymentRuntimeValidationError;
    } {
  if (typeof value !== "string") {
    return {
      ok: false,
      error: deploymentRuntimeValidationError(code, field, `${context} must be a string.`),
    };
  }

  const token = value.trim();

  if (token === "") {
    return {
      ok: false,
      error: deploymentRuntimeValidationError(code, field, `${context} is required.`),
    };
  }

  if (token.length > deploymentOpaqueTokenMaxLength) {
    return {
      ok: false,
      error: deploymentRuntimeValidationError(
        code,
        field,
        `${context} must be ${deploymentOpaqueTokenMaxLength} characters or fewer.`,
      ),
    };
  }

  if (!deploymentOpaqueTokenPattern.test(token)) {
    return {
      ok: false,
      error: deploymentRuntimeValidationError(
        code,
        field,
        `${context} must use only letters, numbers, dots, underscores, colons, and hyphens.`,
      ),
    };
  }

  return { ok: true, value: token };
}

function validateDeploymentRevision(
  value: unknown,
  context: string,
):
  | {
      ok: true;
      revision: number;
    }
  | {
      ok: false;
      error: DeploymentRuntimeValidationError;
    } {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return {
      ok: false,
      error: deploymentRuntimeValidationError(
        "invalid-desired-state-version-ref",
        "revision",
        `${context} must be a non-negative safe integer.`,
      ),
    };
  }

  return { ok: true, revision: value };
}

function deploymentRuntimeValidationError(
  code: DeploymentRuntimeValidationErrorCode,
  field: DeploymentRuntimeValidationField | undefined,
  message: string,
): DeploymentRuntimeValidationError {
  return {
    code,
    ...(field === undefined ? {} : { field }),
    message,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalizeDeploymentJsonObject(
  value: Record<string, DeploymentJsonValue>,
): Record<string, DeploymentJsonValue> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isDeploymentSecretInputKey(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalizeDeploymentJsonValue(child)]),
  );
}

function isDeploymentSecretInputKey(key: string): boolean {
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

function compareDeploymentResources(left: DeploymentResource, right: DeploymentResource): number {
  return (
    left.targetId.localeCompare(right.targetId) ||
    left.logicalId.localeCompare(right.logicalId) ||
    left.kind.localeCompare(right.kind) ||
    left.providerFamily.localeCompare(right.providerFamily) ||
    deploymentResourceCanonicalTieBreaker(left).localeCompare(
      deploymentResourceCanonicalTieBreaker(right),
    )
  );
}

function deploymentResourceCanonicalTieBreaker(resource: DeploymentResource): string {
  return stableDeploymentJsonStringify({
    dependencies: resource.dependencies,
    inputs: resource.inputs,
  });
}

function compareDeploymentResourceDependencies(
  left: DeploymentResourceDependency,
  right: DeploymentResourceDependency,
): number {
  return (
    left.logicalId.localeCompare(right.logicalId) ||
    (left.reason ?? "").localeCompare(right.reason ?? "")
  );
}

function stableDeploymentJsonStringify(value: unknown): string {
  return JSON.stringify(stableDeploymentJsonValue(value));
}

function stableDeploymentJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableDeploymentJsonValue);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableDeploymentJsonValue(child)]),
  );
}
