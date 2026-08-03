import { DEPLOY_CONTROL_PLANE_ACTION_IDS } from "./types.ts";
import type {
  DeployActorKind,
  DeployControlPlaneActionId,
  DeployDeploymentObservationPatch,
  DeployDeploymentObservationPatchRequest,
  DeployDeploymentObservationFailureCode,
  DeployDesiredStateHash,
  DeployDesiredStateResponse,
  DeployDesiredStateVersionId,
  DeployDesiredStateVersionRef,
  DeployLatestStatus,
  DeployLatestStatusResponse,
  DeployTargetRef,
  DeployTargetId,
} from "./types.ts";

export {
  DEPLOY_CONTROL_PLANE_ACTION_IDS,
  DEPLOY_DEPLOYMENT_OBSERVATION_FAILURE_CODES,
  DEPLOY_PUBLIC_CONTRACT_VERSION,
} from "./types.ts";
export type {
  DeployActor,
  DeployActorKind,
  DeployAttemptSummary,
  DeployControlPlaneActionId,
  DeployDeploymentObservationFailureCode,
  DeployDeploymentObservationPatch,
  DeployDeploymentObservationPatchRequest,
  DeployDesiredStateProjection,
  DeployDesiredStateResponse,
  DeployDesiredStateVersion,
  DeployDesiredStateVersionRef,
  DeployDriftSummary,
  DeployEvidenceSummary,
  DeployLatestStatus,
  DeployLatestStatusResponse,
  DeploySecretReference,
  DeployTargetRef,
} from "./types.ts";

export const DEPLOY_CONTROL_PLANE_API_ROUTE_PREFIX = "/api/formless/control-plane";
export const DEPLOY_CONTROL_PLANE_ACTOR_HEADER = "X-Formless-Control-Plane-Actor";
export const DEPLOYMENT_API_ROUTE_PREFIX = "/api/formless/deployments";
export const DEPLOYMENT_DESIRED_STATE_API_PATH = `${DEPLOYMENT_API_ROUTE_PREFIX}/desired-state`;
export const DEPLOYMENT_STATUS_API_PATH = `${DEPLOYMENT_API_ROUTE_PREFIX}/status`;

const deployIdMaxLength = 128;
const deployIdPattern = /^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$/;
const deployDesiredStateHashPattern = /^sha256:[a-f0-9]{64}$/;
const deployDesiredStateVersionRefKeys = new Set<keyof DeployDesiredStateVersionRef>([
  "hash",
  "revision",
  "targetId",
  "versionId",
]);
const deployDeploymentObservationPatchKeys = new Set([
  "observedAt",
  "observedDesiredStateHash",
  "observedFailureCode",
  "observedStatus",
]);

export type DeployControlPlaneProtocolActorKind = Extract<
  DeployActorKind,
  "admin" | "cliDeployer" | "owner" | "runner"
>;

export type DeployControlPlaneRecord = {
  createdAt?: string;
  deletedAt?: string;
  entity: string;
  id: string;
  updatedAt?: string;
  values: Record<string, unknown>;
};

export type DeployControlPlaneBootstrapResponse = {
  cursor?: number;
  records: DeployControlPlaneRecord[];
  schema?: unknown;
};

export type DeployDesiredStateVersionLike = DeployDesiredStateVersionRef & {
  [key: string]: unknown;
};

export type DeployDeploymentObservationPatchValues = Record<string, string>;

export type DeployControlPlaneActionRequest = {
  actionId: DeployControlPlaneActionId;
  idempotencyKey?: string;
  input: Record<string, unknown>;
};

export type DeployControlPlaneActionResponse = {
  actionId: DeployControlPlaneActionId;
  recordIds: string[];
};

export function deployControlPlaneActionPath(actionId: DeployControlPlaneActionId): string {
  return `${DEPLOY_CONTROL_PLANE_API_ROUTE_PREFIX}/actions/${actionId}`;
}

export function deployControlPlaneBootstrapPath(
  actorKind?: DeployControlPlaneProtocolActorKind,
  apiRoutePrefix = DEPLOY_CONTROL_PLANE_API_ROUTE_PREFIX,
): string {
  if (actorKind === undefined) {
    return `${apiRoutePrefix}/bootstrap`;
  }

  const searchParams = new URLSearchParams({ actorKind });

  return `${apiRoutePrefix}/bootstrap?${searchParams.toString()}`;
}

export function deployControlPlaneActorHeaders(
  actorKind: DeployControlPlaneProtocolActorKind,
): Record<string, string> {
  return { [DEPLOY_CONTROL_PLANE_ACTOR_HEADER]: actorKind };
}

export function deployControlPlaneRecordsByEntity(
  records: readonly DeployControlPlaneRecord[],
  entity: string,
): DeployControlPlaneRecord[] {
  return records.filter((record) => record.entity === entity && record.deletedAt === undefined);
}

export function deployDesiredStateVersionRef(
  desiredState: DeployDesiredStateVersionLike,
): DeployDesiredStateVersionRef {
  return {
    hash: desiredState.hash,
    revision: desiredState.revision,
    targetId: desiredState.targetId,
    versionId: desiredState.versionId,
  };
}

export function parseDeployDesiredStateVersionRef(
  context: string,
  value: unknown,
): DeployDesiredStateVersionRef {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  for (const key of Object.keys(value)) {
    if (!deployDesiredStateVersionRefKeys.has(key as keyof DeployDesiredStateVersionRef)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }

  for (const key of deployDesiredStateVersionRefKeys) {
    if (!(key in value)) {
      throw new Error(`${context} must include "${key}".`);
    }
  }

  return {
    hash: parseDeployDesiredStateHash(`${context}.hash`, value.hash),
    revision: parseDeployRevision(`${context}.revision`, value.revision),
    targetId: parseDeployTargetId(`${context}.targetId`, value.targetId),
    versionId: parseDeployDesiredStateVersionId(`${context}.versionId`, value.versionId),
  };
}

export function parseDeployDesiredStateResponse(
  value: unknown,
  context: string,
): DeployDesiredStateResponse {
  if (!isRecord(value) || !isRecord(value.desiredState) || !isRecord(value.target)) {
    throw new Error(`${context} failed: deployment desired-state response is invalid.`);
  }

  return value as DeployDesiredStateResponse;
}

export function parseDeployLatestStatusResponse(
  value: unknown,
  context: string,
): DeployLatestStatusResponse {
  if (!isRecord(value)) {
    throw new Error(`${context} failed: deployment status response is invalid.`);
  }

  assertExactKeys(context, value, new Set(["status", "target"]));

  return {
    status: parseDeployLatestStatus(`${context}.status`, value.status),
    target: parseDeployTargetRef(`${context}.target`, value.target),
  };
}

export function parseDeployDeploymentObservationPatch(
  value: unknown,
  context: string,
): DeployDeploymentObservationPatch {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, deployDeploymentObservationPatchKeys, {
    optional: ["observedFailureCode"],
  });
  const observedAt = parseDeployText(`${context}.observedAt`, value.observedAt);
  const observedDesiredStateHash = parseDeployDesiredStateHash(
    `${context}.observedDesiredStateHash`,
    value.observedDesiredStateHash,
  );
  const observedStatus = parseDeployObservedStatus(
    `${context}.observedStatus`,
    value.observedStatus,
  );

  if (observedStatus === "failed") {
    return {
      observedAt,
      observedDesiredStateHash,
      observedFailureCode: parseDeployDeploymentObservationFailureCode(
        `${context}.observedFailureCode`,
        value.observedFailureCode,
      ),
      observedStatus,
    };
  }

  if (value.observedFailureCode !== undefined) {
    throw new Error(`${context}.observedFailureCode is only valid for failed observations.`);
  }

  return {
    observedAt,
    observedDesiredStateHash,
    observedStatus,
  };
}

export function deployDeploymentObservationPatchValues(
  observation: DeployDeploymentObservationPatch,
): DeployDeploymentObservationPatchValues {
  const parsed = parseDeployDeploymentObservationPatch(observation, "Deployment observation");

  return {
    observedAt: parsed.observedAt,
    observedDesiredStateHash: parsed.observedDesiredStateHash,
    observedFailureCode: parsed.observedStatus === "failed" ? parsed.observedFailureCode : "",
    observedStatus: parsed.observedStatus,
  };
}

export function deployDeploymentObservationPatchIdempotencyKey(
  input: Pick<DeployDeploymentObservationPatchRequest, "observation" | "targetId">,
): string {
  return `deployment-observation:${input.targetId}:${input.observation.observedDesiredStateHash}:${input.observation.observedStatus}:${input.observation.observedAt}`;
}

export function isDeployControlPlaneActionId(value: string): value is DeployControlPlaneActionId {
  return Object.values(DEPLOY_CONTROL_PLANE_ACTION_IDS).includes(
    value as DeployControlPlaneActionId,
  );
}

function parseDeployTargetId(context: string, value: unknown): DeployTargetId {
  return parseDeployIdentifier(context, value);
}

function parseDeployLatestStatus(context: string, value: unknown): DeployLatestStatus {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const checkedAt = parseDeployText(`${context}.checkedAt`, value.checkedAt);

  switch (value.state) {
    case "no-target":
      assertExactKeys(context, value, new Set(["checkedAt", "state"]));
      return { checkedAt, state: value.state };
    case "pending-changes": {
      assertExactKeys(
        context,
        value,
        new Set([
          "checkedAt",
          "latestDesiredState",
          "latestSuccessfulDesiredState",
          "state",
          "targetId",
        ]),
        { optional: ["latestSuccessfulDesiredState"] },
      );
      const latestSuccessfulDesiredState =
        value.latestSuccessfulDesiredState === undefined
          ? undefined
          : parseDeployDesiredStateVersionRef(
              `${context}.latestSuccessfulDesiredState`,
              value.latestSuccessfulDesiredState,
            );

      return {
        checkedAt,
        latestDesiredState: parseDeployDesiredStateVersionRef(
          `${context}.latestDesiredState`,
          value.latestDesiredState,
        ),
        ...(latestSuccessfulDesiredState === undefined ? {} : { latestSuccessfulDesiredState }),
        state: value.state,
        targetId: parseDeployTargetId(`${context}.targetId`, value.targetId),
      };
    }
    case "deployed":
      assertExactKeys(
        context,
        value,
        new Set(["checkedAt", "deployedAt", "latestDesiredState", "state", "targetId"]),
      );
      return {
        checkedAt,
        deployedAt: parseDeployText(`${context}.deployedAt`, value.deployedAt),
        latestDesiredState: parseDeployDesiredStateVersionRef(
          `${context}.latestDesiredState`,
          value.latestDesiredState,
        ),
        state: value.state,
        targetId: parseDeployTargetId(`${context}.targetId`, value.targetId),
      };
    case "failed-current-version":
      assertExactKeys(
        context,
        value,
        new Set([
          "checkedAt",
          "failedAt",
          "failureCode",
          "latestDesiredState",
          "state",
          "targetId",
        ]),
      );
      return {
        checkedAt,
        failedAt: parseDeployText(`${context}.failedAt`, value.failedAt),
        failureCode: parseDeployDeploymentObservationFailureCode(
          `${context}.failureCode`,
          value.failureCode,
        ),
        latestDesiredState: parseDeployDesiredStateVersionRef(
          `${context}.latestDesiredState`,
          value.latestDesiredState,
        ),
        state: value.state,
        targetId: parseDeployTargetId(`${context}.targetId`, value.targetId),
      };
    case "drift": {
      assertExactKeys(
        context,
        value,
        new Set([
          "checkedAt",
          "latestDesiredState",
          "latestSuccessfulDesiredState",
          "state",
          "targetId",
        ]),
        { optional: ["latestSuccessfulDesiredState"] },
      );
      const latestSuccessfulDesiredState =
        value.latestSuccessfulDesiredState === undefined
          ? undefined
          : parseDeployDesiredStateVersionRef(
              `${context}.latestSuccessfulDesiredState`,
              value.latestSuccessfulDesiredState,
            );

      return {
        checkedAt,
        latestDesiredState: parseDeployDesiredStateVersionRef(
          `${context}.latestDesiredState`,
          value.latestDesiredState,
        ),
        ...(latestSuccessfulDesiredState === undefined ? {} : { latestSuccessfulDesiredState }),
        state: value.state,
        targetId: parseDeployTargetId(`${context}.targetId`, value.targetId),
      };
    }
    default:
      throw new Error(`${context}.state is invalid.`);
  }
}

function parseDeployTargetRef(context: string, value: unknown): DeployTargetRef {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, new Set(["label", "targetId"]), { optional: ["label"] });
  const label =
    value.label === undefined ? undefined : parseDeployText(`${context}.label`, value.label);

  return {
    ...(label === undefined ? {} : { label }),
    targetId: parseDeployTargetId(`${context}.targetId`, value.targetId),
  };
}

function parseDeployObservedStatus(
  context: string,
  value: unknown,
): DeployDeploymentObservationPatch["observedStatus"] {
  if (
    value !== "deployed" &&
    value !== "drifted" &&
    value !== "failed" &&
    value !== "in-sync" &&
    value !== "unknown"
  ) {
    throw new Error(`${context} is invalid.`);
  }

  return value;
}

function parseDeployDeploymentObservationFailureCode(
  context: string,
  value: unknown,
): DeployDeploymentObservationFailureCode {
  if (value !== "provider-reconciliation-failed") {
    throw new Error(`${context} must be "provider-reconciliation-failed".`);
  }

  return value;
}

function parseDeployText(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value;
}

function assertExactKeys(
  context: string,
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  options: { optional?: readonly string[] } = {},
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }

  const optional = new Set(options.optional ?? []);

  for (const key of allowed) {
    if (!optional.has(key) && !(key in value)) {
      throw new Error(`${context} must include "${key}".`);
    }
  }
}

function parseDeployDesiredStateVersionId(
  context: string,
  value: unknown,
): DeployDesiredStateVersionId {
  return parseDeployIdentifier(context, value);
}

function parseDeployIdentifier(context: string, value: unknown): string {
  if (typeof value !== "string") {
    throw new Error(`${context} must be a string.`);
  }

  const identifier = value.trim();

  if (identifier === "") {
    throw new Error(`${context} is required.`);
  }

  if (identifier.length > deployIdMaxLength) {
    throw new Error(`${context} must be ${deployIdMaxLength} characters or fewer.`);
  }

  if (!deployIdPattern.test(identifier)) {
    throw new Error(
      `${context} must start with a lowercase letter and use lowercase letters, numbers, dots, underscores, colons, and single hyphens as separators.`,
    );
  }

  return identifier;
}

function parseDeployDesiredStateHash(context: string, value: unknown): DeployDesiredStateHash {
  if (typeof value !== "string") {
    throw new Error(`${context} must be a string.`);
  }

  const hash = value.trim();

  if (!deployDesiredStateHashPattern.test(hash)) {
    throw new Error(`${context} must be a sha256 hash.`);
  }

  return hash;
}

function parseDeployRevision(context: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${context} must be a non-negative safe integer.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
