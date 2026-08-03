/**
 * Versioned public workspace gateway wire contract.
 *
 * Keep route strings, environment variable names, header names, gateway
 * authorization facts, and transport response wrappers here. Semantic
 * operation contracts come from the Workspace package.
 */
import {
  WORKSPACE_BOOTSTRAP_OPERATION_KINDS,
  WORKSPACE_GATEWAY_OPERATION_KINDS as WORKSPACE_DEFINITION_GATEWAY_OPERATION_KINDS,
} from "@dpeek/formless-workspace";
import type {
  WorkspaceAutoSaveEnqueueInput,
  WorkspaceAutoSaveWriteSource,
  WorkspaceGatewayOperationKind as WorkspaceDefinitionGatewayOperationKind,
  WorkspaceOperationCheckOrPullStartInput,
  WorkspaceOperationCredentialSetupStartInput,
  WorkspaceOperationDisplayObject,
  WorkspaceOperationDisplayValue,
  WorkspaceOperationError,
  WorkspaceOperationEvent,
  WorkspaceOperationExecutionRequirement,
  WorkspaceOperationExternalAuthorizationEvent,
  WorkspaceOperationIdParseResult,
  WorkspaceOperationLog,
  WorkspaceOperationPushStartInput,
  WorkspaceOperationResult,
  WorkspaceOperationSaveStartInput,
  WorkspaceOperationStartInput,
  WorkspaceOperationState,
  WorkspaceOperationStatus,
  WorkspaceOperationRequiredCapability,
  WorkspaceOperationStep,
  WorkspaceOperationStepStatus,
  WorkspaceOperationSummary,
  WorkspaceOperationStatusStartInput,
} from "@dpeek/formless-workspace";

export const WORKSPACE_GATEWAY_API_ROUTE_PREFIX = "/api/formless/workspace";
export const WORKSPACE_GATEWAY_STATUS_API_PATH = `${WORKSPACE_GATEWAY_API_ROUTE_PREFIX}/status`;
export const WORKSPACE_GATEWAY_OPERATIONS_API_PATH = `${WORKSPACE_GATEWAY_API_ROUTE_PREFIX}/operations`;
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
export const WORKSPACE_GATEWAY_OPERATION_KIND_HEADER = "x-formless-workspace-operation-kind";

/**
 * Browser-safe operation allowlist from the Workspace package. Gateway uses
 * these wire strings for transport intent classification only.
 */
export const WORKSPACE_GATEWAY_OPERATION_KINDS = WORKSPACE_DEFINITION_GATEWAY_OPERATION_KINDS;

/**
 * Operations allowed before owner setup through the local bootstrap capability.
 */
export const WORKSPACE_GATEWAY_BOOTSTRAP_OPERATION_KINDS = WORKSPACE_BOOTSTRAP_OPERATION_KINDS;

export type WorkspaceGatewayOperationKind = WorkspaceDefinitionGatewayOperationKind;

export type WorkspaceGatewayOperationStatus = WorkspaceOperationStatus;

export type WorkspaceGatewayOperationStepStatus = WorkspaceOperationStepStatus;

export type WorkspaceGatewayActor = "automation" | "browser" | "cli" | "system";

export type WorkspaceGatewayAuthorizationVia = "admin-bearer" | "bootstrap" | "owner-session";

export type WorkspaceGatewayActorFacts = {
  actor: WorkspaceGatewayActor;
  via: WorkspaceGatewayAuthorizationVia;
};

export type WorkspaceGatewayDisplayValue = WorkspaceOperationDisplayValue;

export type WorkspaceGatewayDisplayObject = WorkspaceOperationDisplayObject;

export type WorkspaceGatewayOperationSummary = WorkspaceOperationSummary;

export type WorkspaceGatewayOperationLog = WorkspaceOperationLog;

export type WorkspaceGatewayOperationError = WorkspaceOperationError;

export type WorkspaceGatewayExternalAuthorizationEvent =
  WorkspaceOperationExternalAuthorizationEvent;

export type WorkspaceGatewayOperationEvent = WorkspaceOperationEvent;

export type WorkspaceGatewayOperationResult = WorkspaceOperationResult;

export type WorkspaceGatewayOperationStep = WorkspaceOperationStep;

export type WorkspaceGatewayAutoSaveWriteSource = WorkspaceAutoSaveWriteSource;

export type WorkspaceGatewayAutoSaveEnqueueInput = WorkspaceAutoSaveEnqueueInput;

/**
 * Gateway transport alias for Workspace-owned display-safe operation state.
 */
export type WorkspaceGatewayOperation = Omit<WorkspaceOperationState, "operation"> & {
  operation: WorkspaceGatewayOperationKind;
};

export type WorkspaceGatewaySaveStartInput = WorkspaceOperationSaveStartInput;

export type WorkspaceGatewayStatusStartInput = WorkspaceOperationStatusStartInput;

export type WorkspaceGatewayCheckOrPullStartInput = WorkspaceOperationCheckOrPullStartInput;

export type WorkspaceGatewayPushStartInput = WorkspaceOperationPushStartInput;

export type WorkspaceGatewayCredentialSetupStartInput = WorkspaceOperationCredentialSetupStartInput;

export type WorkspaceGatewayStartInput = WorkspaceOperationStartInput;

export type WorkspaceGatewayResponse = {
  csrfToken?: string;
  operation: WorkspaceGatewayOperation;
};

export type WorkspaceGatewayApiErrorBody = {
  error: string;
};

export type WorkspaceGatewayOperationIntent = {
  bootstrapAllowed: boolean;
  executionRequirements: readonly WorkspaceOperationExecutionRequirement[];
  mutating: boolean;
  operation: WorkspaceGatewayOperationKind;
  requiredCapability: WorkspaceOperationRequiredCapability;
};

export type WorkspaceGatewayOperationPath = {
  operationId: string;
  progress: boolean;
};

export type WorkspaceGatewayOperationIdParseResult = WorkspaceOperationIdParseResult;

export type WorkspaceGatewayStartInputParseResult =
  | { input: WorkspaceGatewayStartInput; ok: true }
  | { error: string; ok: false };

export type WorkspaceGatewayAutoSaveEnqueueInputParseResult =
  | { input: WorkspaceGatewayAutoSaveEnqueueInput; ok: true }
  | { error: string; ok: false };
