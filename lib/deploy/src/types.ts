/**
 * Public Deploy contract version.
 *
 * Version 1 covers schema-owned control-plane deployment intent, actor-scoped
 * action ids, display-safe evidence, secret references, and deterministic
 * projection inputs. Provider execution, credentials, and canonical provider
 * resource truth stay outside this package contract.
 *
 * This file is intentionally import-free so runtime-neutral, client, React, and
 * Worker entrypoints can share declarations without adapter dependencies.
 */
export const DEPLOY_PUBLIC_CONTRACT_VERSION = 1;

export const DEPLOY_CONTROL_PLANE_ACTION_IDS = {
  materializeDesiredState: "materializeDesiredState",
  recordDeploymentDrift: "recordDeploymentDrift",
  recordDeploymentFailure: "recordDeploymentFailure",
  recordDeploymentPlan: "recordDeploymentPlan",
  recordDeploymentSuccess: "recordDeploymentSuccess",
  setRouteEnabled: "setRouteEnabled",
  startDeploymentAttempt: "startDeploymentAttempt",
} as const;

export type DeployControlPlaneActionId =
  (typeof DEPLOY_CONTROL_PLANE_ACTION_IDS)[keyof typeof DEPLOY_CONTROL_PLANE_ACTION_IDS];

export const DEPLOY_ACTOR_KINDS = ["owner", "admin", "cliDeployer", "runner", "system"] as const;

export type DeployActorKind = (typeof DEPLOY_ACTOR_KINDS)[number];

export type DeployActor = {
  actorId: string;
  displayName?: string;
  kind: DeployActorKind;
  runnerId?: string;
};

export type DeploySecretReference = {
  configured: boolean;
  envNames?: string[];
  label?: string;
  providerFamily?: DeployProviderFamily;
  ref: string;
};

export type DeployProviderFamily = "cloudflare";

export type DeployRunnerId = string;
export type DeployTargetId = string;

export type DeployTargetRef = {
  label?: string;
  targetId: DeployTargetId;
};

export type DeployResourceKind =
  | "cloudflare-dns-records"
  | "cloudflare-email-sending-domain"
  | "cloudflare-worker-custom-domain"
  | "cloudflare-worker-send-email-binding";

export type DeployJsonPrimitive = boolean | number | string | null;

export type DeployJsonValue =
  | DeployJsonPrimitive
  | DeployJsonValue[]
  | { [key: string]: DeployJsonValue };

export type DeployResourceDependency = {
  logicalId: string;
  reason?: string;
};

export type DeployResource = {
  dependencies: DeployResourceDependency[];
  inputs: Record<string, DeployJsonValue>;
  kind: DeployResourceKind;
  logicalId: string;
  providerFamily: DeployProviderFamily;
  targetId: string;
};

export type DeployResourceGraph = {
  resources: DeployResource[];
  targetId: DeployTargetId;
};

export type DeployDesiredStateHash = string;
export type DeployDesiredStateVersionId = string;
export type DeployDesiredStateSchemaVersion = typeof DEPLOY_PUBLIC_CONTRACT_VERSION;

export type DeployDesiredStateSource = {
  fingerprint: string;
  intentRevision: number;
};

export type DeployDesiredStateVersionRef = {
  hash: DeployDesiredStateHash;
  revision: number;
  targetId: DeployTargetId;
  versionId: DeployDesiredStateVersionId;
};

export type DeployDesiredStateDisplaySummary = {
  resourceCount: number;
  resourcesByKind: Record<DeployResourceKind, number>;
  title?: string;
};

export type DeployDesiredStateVersion = DeployDesiredStateVersionRef & {
  createdAt: string;
  display: DeployDesiredStateDisplaySummary;
  resourceGraph: DeployResourceGraph;
  schemaVersion: DeployDesiredStateSchemaVersion;
  source: DeployDesiredStateSource;
};

export type DeployDesiredStateHashInput = {
  resourceGraph: DeployResourceGraph;
  schemaVersion: DeployDesiredStateSchemaVersion;
  targetId: DeployTargetId;
};

export type MaterializeDeployDesiredStateVersionInput = {
  now: string;
  resourceGraph: DeployResourceGraph;
  source: DeployDesiredStateSource;
  targetId: DeployTargetId;
  title?: string;
};

export type DeployDesiredStateResponse = {
  desiredState: DeployDesiredStateVersion;
  target: DeployTargetRef;
};

export type DeployDesiredStateProjection = {
  resourceGraph: DeployResourceGraph;
  sourceFingerprint: string;
  targetId: string;
};

export type DeployDesiredStateProjectionInput = {
  emailDomains?: readonly ControlPlaneEmailDomainProjectionRecord[];
  emailSenders?: readonly ControlPlaneEmailSenderProjectionRecord[];
  instanceId: string;
  providerConfigs?: readonly ControlPlaneProviderConfigProjectionRecord[];
  routes?: readonly ControlPlaneRouteProjectionRecord[];
  targetId: string;
  workerName?: string;
};

export type ControlPlaneProjectionSourceRecord = {
  createdAt?: string;
  deletedAt?: string;
  entity: string;
  id: string;
  values: Readonly<Record<string, unknown>>;
};

export type DeployControlPlaneRecordsProjectionInput = {
  instanceId: string;
  records: readonly ControlPlaneProjectionSourceRecord[];
  targetId: string;
  workerName?: string;
};

export type ControlPlaneDomainMappingProfile = "instance" | "publicSite";

export type ControlPlaneRouteKind = "mount" | "redirect";
export type ControlPlaneRouteSurface = "admin" | "public-site";
export type ControlPlaneRouteTargetProfile = "instance" | "public-site";

export type ControlPlaneRouteProjectionRecord = {
  enabled: boolean;
  id: string;
  kind: ControlPlaneRouteKind;
  matchHost?: string;
  matchPath: string;
  matchPrefix?: string;
  preservePath?: boolean;
  preserveQueryString?: boolean;
  providerConfig?: string;
  statusCode?: ControlPlaneRedirectStatusCode | `${ControlPlaneRedirectStatusCode}`;
  surface?: ControlPlaneRouteSurface;
  targetProfile?: ControlPlaneRouteTargetProfile;
  toHost?: string;
  toUrl?: string;
};

export type ControlPlaneProviderConfigProjectionRecord = {
  id: string;
  providerFamily: DeployProviderFamily;
  workerName?: string;
};

export type ControlPlaneEmailDomainProjectionRecord = {
  deploymentConfig?: string;
  domain: string;
  enabled: boolean;
  id: string;
  providerFamily: DeployProviderFamily;
};

export type ControlPlaneEmailSenderPurpose = "auth" | "contact-notification" | "system";

export type ControlPlaneEmailSenderProjectionRecord = {
  address: string;
  displayName?: string;
  emailDomain: string;
  enabled: boolean;
  id: string;
  purpose: ControlPlaneEmailSenderPurpose;
};

export type ControlPlaneDeploymentConfigObservedStatus =
  | "deployed"
  | "drifted"
  | "failed"
  | "in-sync"
  | "unknown";

export const CONTROL_PLANE_DEPLOYMENT_CONFIG_OBSERVED_FIELDS = [
  "observedStatus",
  "observedAt",
  "observedDesiredStateHash",
  "observedSummary",
  "observedError",
  "observedRunnerId",
] as const;

export type ControlPlaneDeploymentConfigObservedField =
  (typeof CONTROL_PLANE_DEPLOYMENT_CONFIG_OBSERVED_FIELDS)[number];

export type ControlPlaneRedirectStatusCode = 301 | 302 | 303 | 307 | 308;

export type ControlPlaneDeploymentConfigObservationRecord = {
  createdAt?: string;
  deletedAt?: string;
  entity: string;
  id: string;
  updatedAt?: string;
  values: Readonly<Record<string, unknown>>;
};

export type DeployDeploymentObservationPatch = {
  observedAt: string;
  observedDesiredStateHash: DeployDesiredStateHash;
  observedError?: string | null;
  observedRunnerId?: DeployRunnerId | null;
  observedStatus: ControlPlaneDeploymentConfigObservedStatus;
  observedSummary?: string | null;
};

export type DeployDeploymentObservationPatchRequest = {
  desiredState?: DeployDesiredStateVersionRef;
  observation: DeployDeploymentObservationPatch;
  targetId: DeployTargetId;
};

export type DeployEvidenceAction = "adopted" | "created" | "deleted" | "no-change" | "updated";

export type DeployEvidenceSummary = {
  action: DeployEvidenceAction;
  alchemyResourceId?: string;
  displayName?: string;
  kind: DeployResourceKind;
  logicalId: string;
  providerFamily: DeployProviderFamily;
  providerResourceIds: string[];
  recordedAt?: string;
  targetId: string;
};

export type DeployAttemptMode = "apply" | "destroy" | "plan";
export type DeployAttemptStatus = "failed" | "planned" | "started" | "succeeded";

export type DeployAttemptSummary = {
  actor: DeployActor;
  attemptId: string;
  desiredStateHash: string;
  mode: DeployAttemptMode;
  status: DeployAttemptStatus;
  targetId: string;
  updatedAt: string;
  versionId: string;
};

export type DeployDriftStatus = "drifted" | "in-sync" | "unknown";

export type DeployDriftSummary = {
  affectedLogicalIds: string[];
  create: number;
  delete: number;
  status: DeployDriftStatus;
  targetId: DeployTargetId;
  update: number;
};

export type DeployFailureSummary = {
  code: string;
  details?: string;
  displayMessage: string;
};

export type DeployLatestStatus =
  | DeployDeployedStatus
  | DeployDriftedStatus
  | DeployFailedCurrentVersionStatus
  | DeployNoTargetStatus
  | DeployPendingChangesStatus;

export type DeriveDeployLatestStatusInput = {
  deploymentConfig?: ControlPlaneDeploymentConfigObservationRecord;
  desiredState?: DeployDesiredStateVersion;
  now: string;
  targetId: DeployTargetId;
};

export type DeployNoTargetStatus = {
  checkedAt: string;
  state: "no-target";
};

export type DeployPendingChangesStatus = {
  checkedAt: string;
  latestDesiredState: DeployDesiredStateVersionRef;
  latestSuccessfulDesiredState?: DeployDesiredStateVersionRef;
  state: "pending-changes";
  targetId: DeployTargetId;
};

export type DeployDeployedStatus = {
  checkedAt: string;
  deployedAt: string;
  latestDesiredState: DeployDesiredStateVersionRef;
  runnerId?: DeployRunnerId;
  state: "deployed";
  summary?: string;
  targetId: DeployTargetId;
};

export type DeployFailedCurrentVersionStatus = {
  checkedAt: string;
  failedAt: string;
  latestDesiredState: DeployDesiredStateVersionRef;
  runnerId?: DeployRunnerId;
  state: "failed-current-version";
  summary: DeployFailureSummary;
  targetId: DeployTargetId;
};

export type DeployDriftedStatus = {
  checkedAt: string;
  latestDesiredState: DeployDesiredStateVersionRef;
  latestSuccessfulDesiredState?: DeployDesiredStateVersionRef;
  runnerId?: DeployRunnerId;
  state: "drift";
  summary?: string;
  targetId: DeployTargetId;
};

export type DeployLatestStatusResponse = {
  status: DeployLatestStatus;
  target: DeployTargetRef;
};

export type DeployLatestStatusDisplayTone =
  | "danger"
  | "neutral"
  | "progress"
  | "success"
  | "warning";

export type DeployLatestStatusDisplaySummary = {
  detail: string;
  label: string;
  state: DeployLatestStatus["state"];
  tone: DeployLatestStatusDisplayTone;
};

export type DeployProjectionHashInput = {
  projection: DeployDesiredStateProjection;
  schemaVersion: typeof DEPLOY_PUBLIC_CONTRACT_VERSION;
};
