import type {
  DomainProviderPlan,
  DomainProviderRedirectStatusCode,
  DomainProviderResourceKind,
  DomainProviderZone,
} from "./domain-provider-protocol.ts";
import type {
  InstanceDomainMappingAppliedAction,
  InstanceDomainMappingProfile,
} from "./instance-domain-mappings.ts";

export const INSTANCE_DOMAIN_PROVIDER_API_PATH = "/api/formless/domain-provider";
export const INSTANCE_DOMAIN_PROVIDER_PLAN_API_PATH = `${INSTANCE_DOMAIN_PROVIDER_API_PATH}/plan`;
export const INSTANCE_DOMAIN_PROVIDER_DELETE_API_PATH = `${INSTANCE_DOMAIN_PROVIDER_API_PATH}/delete`;
export const INSTANCE_DOMAIN_PROVIDER_DELETE_JOBS_API_PATH = `${INSTANCE_DOMAIN_PROVIDER_API_PATH}/delete-jobs`;
export const INSTANCE_DOMAIN_PROVIDER_MANUAL_CLEANUP_API_PATH = `${INSTANCE_DOMAIN_PROVIDER_API_PATH}/manual-cleanup`;
export const DOMAIN_PROVIDER_RUNNER_MUTATION_ENV_NAMES = [
  "CLOUDFLARE_API_TOKEN",
  "CF_API_TOKEN",
  "ALCHEMY_PASSWORD",
  "ALCHEMY_STATE_TOKEN",
];

export type DomainProviderConfigIssueCode =
  | "invalid-zone-config"
  | "missing-account-id"
  | "missing-alchemy-password"
  | "missing-cloudflare-api-token"
  | "missing-instance-id"
  | "missing-worker-name"
  | "missing-zone-config";

export type DomainProviderConfigIssue = {
  code: DomainProviderConfigIssueCode;
  envNames: string[];
  message: string;
};

export type DomainProviderSecretStatus = {
  configured: boolean;
  envNames: string[];
};

export type DomainProviderRunnerMutationStatus = {
  checkedBy: "node-runner";
  requiredEnvNames: string[];
};

export type DomainProviderConfigStatus = {
  accountId?: string;
  alchemyPassword: DomainProviderSecretStatus;
  cloudflareApiToken: DomainProviderSecretStatus;
  deleteReady: boolean;
  instanceId?: string;
  issues: DomainProviderConfigIssue[];
  planReady: boolean;
  runnerMutation: DomainProviderRunnerMutationStatus;
  workerName?: string;
  zones: DomainProviderZone[];
};

export type InstanceDomainProviderPlanResponse = {
  config: DomainProviderConfigStatus;
  plan: DomainProviderPlan;
  redirectIntents: InstanceDomainProviderRedirectIntent[];
};

export type InstanceDomainProviderRedirectIntent = {
  createdAt: string;
  enabled: boolean;
  fromHost: string;
  preservePath: boolean;
  preserveQueryString: boolean;
  statusCode: DomainProviderRedirectStatusCode;
  toHost?: string;
  toUrl?: string;
  updatedAt: string;
};

export type InstanceDomainProviderAppliedResourceAction = InstanceDomainMappingAppliedAction;
export type InstanceDomainProviderActiveResourceAction = Exclude<
  InstanceDomainProviderAppliedResourceAction,
  "deleted" | "manually-removed"
>;

export type InstanceDomainProviderAppliedResourceState = {
  accountId: string;
  action: InstanceDomainProviderAppliedResourceAction;
  alchemyResourceId: string;
  appliedAt: string;
  host: string;
  kind: DomainProviderResourceKind;
  logicalId: string;
  resourceId: string;
  resourceJson: string;
  runnerId?: string;
  updatedAt: string;
  zoneId: string;
  zoneName: string;
};

export type InstanceDomainProviderAuditEvent = InstanceDomainProviderAppliedResourceState & {
  eventId: number;
};

export type InstanceDomainProviderDeleteRequest = {
  host?: string;
  kind?: DomainProviderResourceKind;
  logicalId?: string;
  runnerId?: string;
};

export type InstanceDomainProviderJobStatus = "failed" | "ready" | "running" | "succeeded";

export type InstanceDomainProviderJobResultSummary = {
  error?: string;
  evidenceCount: number;
};

export type InstanceDomainProviderDeleteTarget = {
  accountId: string;
  action: InstanceDomainProviderActiveResourceAction;
  alchemyResourceId?: string;
  host: string;
  kind: DomainProviderResourceKind;
  logicalId: string;
  profile?: InstanceDomainMappingProfile;
  resourceId: string;
  resourceJson: string;
  runnerId?: string;
  workerName?: string;
  zoneId: string;
  zoneName: string;
};

export type InstanceDomainProviderManualCleanupRequest = {
  host: string;
  kind: DomainProviderResourceKind;
  logicalId: string;
};

export type InstanceDomainProviderManualCleanupResponse = {
  action: "manually-removed";
  status: "cleaned";
  target: InstanceDomainProviderDeleteTarget;
};

export type InstanceDomainProviderDeleteBlockedCode =
  | "domain-provider-delete-empty"
  | "domain-provider-delete-not-configured"
  | "domain-provider-delete-running";

export type InstanceDomainProviderDeleteBlockedResponse = {
  code: InstanceDomainProviderDeleteBlockedCode;
  config: DomainProviderConfigStatus;
  error: string;
  plan: DomainProviderPlan;
  status: "blocked";
  targets: InstanceDomainProviderDeleteTarget[];
};

export type InstanceDomainProviderDeleteJobStatus = InstanceDomainProviderJobStatus;

export type InstanceDomainProviderDeleteJob = {
  createdAt: string;
  jobId: string;
  plan: DomainProviderPlan;
  result?: InstanceDomainProviderJobResultSummary;
  runnerId?: string;
  status: InstanceDomainProviderDeleteJobStatus;
  targets: InstanceDomainProviderDeleteTarget[];
  updatedAt: string;
};

export type InstanceDomainProviderDeleteReadyResponse = {
  code: "domain-provider-delete-job-ready";
  config: DomainProviderConfigStatus;
  job: InstanceDomainProviderDeleteJob;
  plan: DomainProviderPlan;
  status: "ready";
  targets: InstanceDomainProviderDeleteTarget[];
};

export type InstanceDomainProviderDeleteJobResourceEvidence = {
  action: "deleted";
  host: string;
  kind: DomainProviderResourceKind;
  logicalId: string;
};

export type InstanceDomainProviderDeleteJobResultRequest =
  | {
      error: string;
      runnerId?: string;
      status: "failed";
    }
  | {
      resources: InstanceDomainProviderDeleteJobResourceEvidence[];
      runnerId?: string;
      status: "succeeded";
    };

export type InstanceDomainProviderDeleteJobResponse = {
  job: InstanceDomainProviderDeleteJob;
};

export type InstanceDomainProviderDeleteResponse =
  | InstanceDomainProviderDeleteBlockedResponse
  | InstanceDomainProviderDeleteReadyResponse;
