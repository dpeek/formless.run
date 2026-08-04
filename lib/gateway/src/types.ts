import type {
  WorkspaceAutoSaveEnqueueInput,
  WorkspaceAutoSaveWriteSource,
  WorkspaceOperationActor,
  WorkspaceOperationExecutionRequirement,
  WorkspaceOperationRequiredCapability,
} from "@dpeek/formless-workspace";

export const WORKSPACE_GATEWAY_API_ROUTE_PREFIX = "/api/formless/workspace";
export const WORKSPACE_GATEWAY_STATUS_API_PATH = `${WORKSPACE_GATEWAY_API_ROUTE_PREFIX}/status`;
export const WORKSPACE_GATEWAY_PUSHES_API_PATH = `${WORKSPACE_GATEWAY_API_ROUTE_PREFIX}/pushes`;
export const WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH = `${WORKSPACE_GATEWAY_API_ROUTE_PREFIX}/auto-save`;
export const LOCAL_SESSION_BOOTSTRAP_API_PATH = "/api/formless/local-session/bootstrap";

export const WORKSPACE_GATEWAY_ENABLED_ENV = "FORMLESS_LOCAL_WORKSPACE_GATEWAY";
export const WORKSPACE_GATEWAY_ROOT_ENV = "FORMLESS_WORKSPACE_GATEWAY_ROOT";
export const WORKSPACE_GATEWAY_SIDECAR_URL_ENV = "FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL";
export const WORKSPACE_GATEWAY_PROXY_TOKEN_ENV = "FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN";
export const WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV = "FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN";
export const WORKSPACE_GATEWAY_CSRF_TOKEN_ENV = "FORMLESS_WORKSPACE_GATEWAY_CSRF_TOKEN";
export const LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV = "FORMLESS_LOCAL_SESSION_BOOTSTRAP_TOKEN";

export const WORKSPACE_GATEWAY_BOOTSTRAP_HEADER = "x-formless-workspace-bootstrap";
export const WORKSPACE_GATEWAY_CSRF_HEADER = "x-formless-csrf";
export const WORKSPACE_GATEWAY_CSRF_COOKIE_NAME = "formless_workspace_csrf";
export const WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER = "x-formless-workspace-proxy-token";
export const WORKSPACE_GATEWAY_ACTOR_HEADER = "x-formless-workspace-actor";
export const WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER = "x-formless-workspace-authorization-via";
export const WORKSPACE_GATEWAY_INTENT_HEADER = "x-formless-workspace-gateway-intent";

export const WORKSPACE_GATEWAY_PUSH_PHASE_IDS = [
  "credentials",
  "account-selection",
  "desired-state-plan",
  "provider-reconciliation",
  "health-check",
  "owner-setup",
  "workspace-push-writeback",
  "observation-refresh",
] as const;

export const WORKSPACE_GATEWAY_PUSH_FAILURE_CODES = [
  "source-invalid",
  "credential-unavailable",
  "authorization-expired",
  "account-discovery-failed",
  "interaction-expired",
  "target-unavailable",
  "target-conflict",
  "schema-incompatible",
  "backup-failed",
  "provider-reconciliation-failed",
  "health-check-failed",
  "owner-setup-failed",
  "restore-validation-failed",
  "restore-apply-failed",
  "observation-write-failed",
  "internal-failure",
] as const;

export const WORKSPACE_GATEWAY_ERROR_CODES = [
  "invalid-request",
  "unauthorized",
  "forbidden",
  "bootstrap-expired",
  "csrf-invalid",
  "gateway-unavailable",
  "push-active",
  "push-not-found",
  "interaction-not-found",
  "interaction-invalid",
  "interaction-expired",
  "invalid-sidecar-response",
  "method-not-allowed",
  "not-found",
] as const;

export type WorkspaceGatewayActor = WorkspaceOperationActor;
export type WorkspaceGatewayAuthorizationVia = "admin-bearer" | "bootstrap" | "owner-session";
export type WorkspaceGatewayActorFacts = {
  actor: WorkspaceGatewayActor;
  via: WorkspaceGatewayAuthorizationVia;
};

export type WorkspaceGatewayPushMode = "dry-run" | "apply";
export type WorkspaceGatewayPushLifecycle =
  | "queued"
  | "running"
  | "waiting-for-interaction"
  | "succeeded"
  | "failed";
export type WorkspaceGatewayPushPhaseId = (typeof WORKSPACE_GATEWAY_PUSH_PHASE_IDS)[number];
export type WorkspaceGatewayPushPhaseStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "skipped"
  | "failed";
export type WorkspaceGatewayPushPhase = {
  id: WorkspaceGatewayPushPhaseId;
  status: WorkspaceGatewayPushPhaseStatus;
};
export type WorkspaceGatewayPushOutcome = "up-to-date" | "planned" | "applied";
export type WorkspaceGatewayPushFailureCode = (typeof WORKSPACE_GATEWAY_PUSH_FAILURE_CODES)[number];

export type WorkspaceGatewayAccountChoice = {
  id: string;
  name?: string;
};

export type WorkspaceGatewayExternalAuthorizationInteraction = {
  expiresAt: string;
  id: string;
  kind: "external-authorization";
  provider: "cloudflare";
  url: string;
};

export type WorkspaceGatewayAccountSelectionInteraction = {
  choices: readonly WorkspaceGatewayAccountChoice[];
  expiresAt: string;
  id: string;
  kind: "account-selection";
  provider: "cloudflare";
};

export type WorkspaceGatewayPushInteraction =
  | WorkspaceGatewayExternalAuthorizationInteraction
  | WorkspaceGatewayAccountSelectionInteraction;

type WorkspaceGatewayPushBase = {
  createdAt: string;
  id: string;
  mode: WorkspaceGatewayPushMode;
  phases: readonly WorkspaceGatewayPushPhase[];
  targetAlias?: string;
  updatedAt: string;
};

export type WorkspaceGatewayPush =
  | (WorkspaceGatewayPushBase & { lifecycle: "queued" | "running" })
  | (WorkspaceGatewayPushBase & {
      interaction: WorkspaceGatewayPushInteraction;
      lifecycle: "waiting-for-interaction";
    })
  | (WorkspaceGatewayPushBase & {
      lifecycle: "succeeded";
      outcome: WorkspaceGatewayPushOutcome;
    })
  | (WorkspaceGatewayPushBase & {
      failedPhase: WorkspaceGatewayPushPhaseId;
      failureCode: WorkspaceGatewayPushFailureCode;
      lifecycle: "failed";
    });

export type WorkspaceGatewayPushStartInput = {
  mode: WorkspaceGatewayPushMode;
  targetAlias?: string;
};

export type WorkspaceGatewayAccountSelectionInput = {
  accountId: string;
  kind: "account-selection";
};

export type WorkspaceGatewayStatusResponse = {
  csrfToken?: string;
  currentPush: WorkspaceGatewayPush | null;
  gateway: "available";
  latestPush: WorkspaceGatewayPush | null;
};

export type WorkspaceGatewayPushResponse = {
  push: WorkspaceGatewayPush;
};

export type WorkspaceGatewayErrorCode = (typeof WORKSPACE_GATEWAY_ERROR_CODES)[number];
export type WorkspaceGatewayApiErrorBody = { code: WorkspaceGatewayErrorCode };

export type WorkspaceGatewayAutoSaveWriteSource = WorkspaceAutoSaveWriteSource;
export type WorkspaceGatewayAutoSaveEnqueueInput = WorkspaceAutoSaveEnqueueInput;

export type WorkspaceGatewayIntent = {
  bootstrapAllowed: boolean;
  executionRequirements: readonly WorkspaceOperationExecutionRequirement[];
  kind: "auto-save" | "interaction-submit" | "push-read" | "push-start" | "status";
  mutating: boolean;
  requiredCapability?: WorkspaceOperationRequiredCapability;
};

export type WorkspaceGatewayPushPath =
  | { kind: "push"; pushId: string }
  | { interactionId: string; kind: "interaction"; pushId: string };

export type WorkspaceGatewayParseResult<T> =
  | { input: T; ok: true }
  | { code: "invalid-request"; ok: false };

export type WorkspaceGatewayPushExecutionResult = {
  outcome: WorkspaceGatewayPushOutcome;
};

export type WorkspaceGatewayPushPhaseObserver = {
  fail(phase: WorkspaceGatewayPushPhaseId, code: WorkspaceGatewayPushFailureCode): never;
  requestAccountSelection(choices: readonly WorkspaceGatewayAccountChoice[]): Promise<string>;
  setExternalAuthorization(url: string): string;
  skip(phase: WorkspaceGatewayPushPhaseId): void;
  start(phase: WorkspaceGatewayPushPhaseId): void;
  succeed(phase: WorkspaceGatewayPushPhaseId): void;
};

export type WorkspaceGatewayPushHandler = (input: {
  authorization: WorkspaceGatewayActorFacts;
  observer: WorkspaceGatewayPushPhaseObserver;
  push: WorkspaceGatewayPushStartInput;
  workspaceRoot: string;
}) => Promise<WorkspaceGatewayPushExecutionResult>;
