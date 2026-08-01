import {
  WORKSPACE_GATEWAY_API_ROUTE_PREFIX,
  WORKSPACE_GATEWAY_OPERATIONS_API_PATH,
} from "./types.ts";
import {
  isWorkspaceAutoSaveWriteSource,
  isWorkspaceGatewayOperationKind as isWorkspaceDefinitionGatewayOperationKind,
  parseWorkspaceOperationId,
  workspaceOperationExecutionDecision,
  workspaceOperationBootstrapAllowed,
  workspaceOperationBaseExecutionRequirements,
  workspaceOperationDefinitionForGatewayRequestKind,
  workspaceOperationEffectiveExecutionRequirements,
  workspaceOperationGatewayAllowedRequestFields,
  workspaceOperationGatewayInputFields,
  workspaceOperationInputFieldDefinition,
  workspaceOperationMode,
  workspaceOperationRequiredCapability,
} from "@dpeek/formless-workspace";
import type {
  WorkspaceOperationActor,
  WorkspaceOperationExecutionDecision,
  WorkspaceGatewayOperationDefinition,
  WorkspaceOperationInputFieldDefinition,
  WorkspaceOperationRequiredCapability,
} from "@dpeek/formless-workspace";
import type {
  WorkspaceGatewayAutoSaveEnqueueInputParseResult,
  WorkspaceGatewayOperationIdParseResult,
  WorkspaceGatewayOperationIntent,
  WorkspaceGatewayOperationKind,
  WorkspaceGatewayOperationPath,
  WorkspaceGatewayStartInput,
  WorkspaceGatewayStartInputParseResult,
} from "./types.ts";

export {
  LOCAL_SESSION_BOOTSTRAP_API_PATH,
  LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_ACTOR_HEADER,
  WORKSPACE_GATEWAY_API_ROUTE_PREFIX,
  WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH,
  WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER,
  WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  WORKSPACE_GATEWAY_BOOTSTRAP_OPERATION_KINDS,
  WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_CSRF_COOKIE_NAME,
  WORKSPACE_GATEWAY_CSRF_HEADER,
  WORKSPACE_GATEWAY_CSRF_TOKEN_ENV,
  WORKSPACE_GATEWAY_ENABLED_ENV,
  WORKSPACE_GATEWAY_OPERATION_KIND_HEADER,
  WORKSPACE_GATEWAY_OPERATION_KINDS,
  WORKSPACE_GATEWAY_OPERATIONS_API_PATH,
  WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_ROOT_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
  WORKSPACE_GATEWAY_STATUS_API_PATH,
} from "./types.ts";
export type {
  WorkspaceGatewayActor,
  WorkspaceGatewayActorFacts,
  WorkspaceGatewayApiErrorBody,
  WorkspaceGatewayAutoSaveEnqueueInput,
  WorkspaceGatewayAutoSaveEnqueueInputParseResult,
  WorkspaceGatewayAutoSaveResponse,
  WorkspaceGatewayAutoSaveState,
  WorkspaceGatewayAutoSaveWriteSource,
  WorkspaceGatewayAuthorizationVia,
  WorkspaceGatewayCheckOrPullStartInput,
  WorkspaceGatewayCredentialSetupStartInput,
  WorkspaceGatewayDisplayObject,
  WorkspaceGatewayDisplayValue,
  WorkspaceGatewayExternalAuthorizationEvent,
  WorkspaceGatewayOperation,
  WorkspaceGatewayOperationError,
  WorkspaceGatewayOperationEvent,
  WorkspaceGatewayOperationIdParseResult,
  WorkspaceGatewayOperationIntent,
  WorkspaceGatewayOperationKind,
  WorkspaceGatewayOperationLog,
  WorkspaceGatewayOperationPath,
  WorkspaceGatewayOperationResult,
  WorkspaceGatewayOperationStep,
  WorkspaceGatewayOperationStepStatus,
  WorkspaceGatewayOperationStatus,
  WorkspaceGatewayOperationSummary,
  WorkspaceGatewayPushStartInput,
  WorkspaceGatewayResponse,
  WorkspaceGatewaySaveStartInput,
  WorkspaceGatewayStartInput,
  WorkspaceGatewayStartInputParseResult,
  WorkspaceGatewayStatusStartInput,
} from "./types.ts";

export function isWorkspaceGatewayPath(pathname: string): boolean {
  return (
    pathname === WORKSPACE_GATEWAY_API_ROUTE_PREFIX ||
    pathname.startsWith(`${WORKSPACE_GATEWAY_API_ROUTE_PREFIX}/`)
  );
}

export function workspaceGatewayStatusApiPath(
  apiBasePath = WORKSPACE_GATEWAY_API_ROUTE_PREFIX,
): string {
  return `${trimWorkspaceGatewayApiBasePath(apiBasePath)}/status`;
}

export function workspaceGatewayOperationsApiPath(
  apiBasePath = WORKSPACE_GATEWAY_API_ROUTE_PREFIX,
): string {
  return `${trimWorkspaceGatewayApiBasePath(apiBasePath)}/operations`;
}

export function workspaceGatewayAutoSaveApiPath(
  apiBasePath = WORKSPACE_GATEWAY_API_ROUTE_PREFIX,
): string {
  return `${trimWorkspaceGatewayApiBasePath(apiBasePath)}/auto-save`;
}

export function workspaceGatewayOperationApiPath(
  operationId: string,
  apiBasePath = WORKSPACE_GATEWAY_API_ROUTE_PREFIX,
): string {
  return `${workspaceGatewayOperationsApiPath(apiBasePath)}/${encodeURIComponent(operationId)}`;
}

export function workspaceGatewayOperationPath(
  pathname: string,
): WorkspaceGatewayOperationPath | undefined {
  const suffix = pathname.slice(`${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/`.length);

  if (pathname === WORKSPACE_GATEWAY_OPERATIONS_API_PATH || suffix === pathname) {
    return undefined;
  }

  const parts = suffix.split("/").filter(Boolean);

  if (parts.length === 1) {
    return { operationId: parts[0] ?? "", progress: false };
  }

  if (parts.length === 2 && parts[1] === "progress") {
    return { operationId: parts[0] ?? "", progress: true };
  }

  return undefined;
}

export function parseWorkspaceGatewayOperationId(
  value: unknown,
): WorkspaceGatewayOperationIdParseResult {
  return parseWorkspaceOperationId(value);
}

export function isWorkspaceGatewayOperationKind(
  value: unknown,
): value is WorkspaceGatewayOperationKind {
  return isWorkspaceDefinitionGatewayOperationKind(value);
}

export function isWorkspaceGatewayBootstrapOperationKind(
  operation: WorkspaceGatewayOperationKind,
): boolean {
  return workspaceOperationBootstrapAllowed(operation);
}

export function isWorkspaceGatewayMutatingStartOperationKind(
  operation: WorkspaceGatewayOperationKind,
): boolean {
  return workspaceOperationMode(operation) === "write";
}

export function workspaceGatewayStatusIntent(): WorkspaceGatewayOperationIntent {
  return workspaceGatewayReadOperationIntent("status");
}

export function workspaceGatewayStartOperationIntent(
  input: WorkspaceGatewayOperationKind | WorkspaceGatewayStartInput,
): WorkspaceGatewayOperationIntent {
  const operation = typeof input === "string" ? input : input.kind;

  return {
    bootstrapAllowed: workspaceOperationBootstrapAllowed(operation),
    executionRequirements:
      typeof input === "string"
        ? workspaceOperationBaseExecutionRequirements(operation)
        : workspaceOperationEffectiveExecutionRequirements(input),
    mutating: workspaceOperationMode(operation) === "write",
    operation,
    requiredCapability: workspaceOperationRequiredCapability(operation),
  };
}

export function workspaceGatewayReadOperationIntent(
  operation: WorkspaceGatewayOperationKind,
): WorkspaceGatewayOperationIntent {
  return {
    bootstrapAllowed: workspaceOperationBootstrapAllowed(operation),
    executionRequirements: workspaceOperationBaseExecutionRequirements(operation),
    mutating: false,
    operation,
    requiredCapability: workspaceOperationRequiredCapability(operation),
  };
}

export function workspaceGatewayAutoSaveStatusIntent(): WorkspaceGatewayOperationIntent {
  return workspaceGatewayReadOperationIntent("status");
}

export function workspaceGatewayAutoSaveEnqueueIntent(): WorkspaceGatewayOperationIntent {
  return workspaceGatewayStartOperationIntent("save");
}

export function workspaceGatewayOperationExecutionDecision(input: {
  actor: WorkspaceOperationActor;
  capabilities: readonly WorkspaceOperationRequiredCapability[];
  intent: WorkspaceGatewayOperationIntent;
  mutating?: boolean;
  operationInput?: WorkspaceGatewayStartInput;
}): WorkspaceOperationExecutionDecision {
  const intentDecision = workspaceGatewayOperationIntentDecision(input);

  if (!intentDecision.ok) {
    return intentDecision;
  }

  return workspaceOperationExecutionDecision({
    actor: input.actor,
    capabilities: input.capabilities,
    kind: input.intent.operation,
  });
}

function workspaceGatewayOperationIntentDecision(input: {
  intent: WorkspaceGatewayOperationIntent;
  mutating?: boolean;
  operationInput?: WorkspaceGatewayStartInput;
}): WorkspaceOperationExecutionDecision {
  const operation = input.intent.operation;

  if (input.operationInput !== undefined && input.operationInput.kind !== operation) {
    return { error: "Workspace gateway operation intent is invalid.", ok: false };
  }

  const expectedMutating =
    input.operationInput === undefined
      ? input.mutating
      : workspaceOperationMode(input.operationInput.kind) === "write";

  if (expectedMutating !== undefined && input.intent.mutating !== expectedMutating) {
    return { error: "Workspace gateway operation intent is invalid.", ok: false };
  }

  if (input.intent.bootstrapAllowed !== workspaceOperationBootstrapAllowed(operation)) {
    return { error: "Workspace gateway operation intent is invalid.", ok: false };
  }

  if (input.intent.requiredCapability !== workspaceOperationRequiredCapability(operation)) {
    return { error: "Workspace gateway operation intent is invalid.", ok: false };
  }

  const expectedRequirements =
    input.operationInput === undefined
      ? workspaceOperationBaseExecutionRequirements(operation)
      : workspaceOperationEffectiveExecutionRequirements(input.operationInput);

  if (
    !sameWorkspaceGatewayExecutionRequirements(
      input.intent.executionRequirements,
      expectedRequirements,
    )
  ) {
    return { error: "Workspace gateway operation intent is invalid.", ok: false };
  }

  return { ok: true };
}

export function parseWorkspaceGatewayAutoSaveEnqueueInput(
  body: unknown,
): WorkspaceGatewayAutoSaveEnqueueInputParseResult {
  const forbidden = forbiddenWorkspaceGatewayInput(body);

  if (forbidden) {
    return { error: forbidden, ok: false };
  }

  if (!isRecord(body)) {
    return { error: "Workspace auto-save enqueue request must be an object.", ok: false };
  }

  const unsupportedField = Object.keys(body).find((field) => field !== "source");

  if (unsupportedField) {
    return {
      error: `Workspace auto-save enqueue does not allow field "${unsupportedField}".`,
      ok: false,
    };
  }

  if (!isWorkspaceAutoSaveWriteSource(body.source)) {
    return { error: "Workspace auto-save write source is invalid.", ok: false };
  }

  return {
    input: { source: body.source },
    ok: true,
  };
}

export function parseWorkspaceGatewayStartInput(
  body: unknown,
): WorkspaceGatewayStartInputParseResult {
  const forbidden = forbiddenWorkspaceGatewayInput(body);

  if (forbidden) {
    return { error: forbidden, ok: false };
  }

  if (!isRecord(body)) {
    return { error: "Workspace gateway operation request must be an object.", ok: false };
  }

  const kind = typeof body.kind === "string" ? body.kind : body.operation;

  if (typeof kind !== "string") {
    return { error: 'Workspace gateway operation request must include "kind".', ok: false };
  }

  const definition = workspaceGatewayOperationDefinitionForRequestKind(kind);

  if (!definition) {
    return { error: `Workspace gateway operation "${kind}" is not supported.`, ok: false };
  }

  const unsupportedField = unsupportedWorkspaceGatewayRequestField(body, definition);

  if (unsupportedField) {
    return {
      error: `Workspace gateway operation "${kind}" does not allow field "${unsupportedField}".`,
      ok: false,
    };
  }

  try {
    const input: Record<string, unknown> = { kind: definition.kind };

    for (const fieldKey of workspaceOperationGatewayInputFields(definition.kind)) {
      const field = workspaceOperationInputFieldDefinition(definition.kind, fieldKey);
      input[field.key] = parseWorkspaceGatewayInputField(field, body[field.key]);
    }

    return { input: input as WorkspaceGatewayStartInput, ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  }
}

export function forbiddenWorkspaceGatewayInput(
  value: unknown,
  label = "request",
): string | undefined {
  if (typeof value === "string") {
    if (secretLookingText(value)) {
      return `Workspace gateway ${label} includes secret-looking text.`;
    }

    if (pathTraversalText(value) || shellCommandText(value)) {
      return `Workspace gateway ${label} includes forbidden path or shell text.`;
    }

    return undefined;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const forbidden = forbiddenWorkspaceGatewayInput(item, `${label}[${index}]`);

      if (forbidden) {
        return forbidden;
      }
    }

    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  for (const [key, child] of Object.entries(value)) {
    if (forbiddenWorkspaceGatewayInputKey(key)) {
      return `Workspace gateway request includes forbidden key "${key}".`;
    }

    const forbidden = forbiddenWorkspaceGatewayInput(child, `${label}.${key}`);

    if (forbidden) {
      return forbidden;
    }
  }

  return undefined;
}

function workspaceGatewayOperationDefinitionForRequestKind(
  requestKind: string,
): WorkspaceGatewayOperationDefinition | undefined {
  try {
    return workspaceOperationDefinitionForGatewayRequestKind(requestKind);
  } catch {
    return undefined;
  }
}

function unsupportedWorkspaceGatewayRequestField(
  body: Record<string, unknown>,
  definition: WorkspaceGatewayOperationDefinition,
): string | undefined {
  const allowedFields = new Set<string>(
    workspaceOperationGatewayAllowedRequestFields(definition.kind),
  );

  return Object.keys(body).find((field) => !allowedFields.has(field));
}

function parseWorkspaceGatewayInputField(
  field: WorkspaceOperationInputFieldDefinition,
  value: unknown,
): boolean | null | string | undefined {
  if (value === undefined && "defaultValue" in field) {
    return field.defaultValue;
  }

  switch (field.valueType) {
    case "boolean":
      return optionalBoolean(value);
    case "enum": {
      const parsed = optionalString(value);

      if (parsed === undefined || parsed === null) {
        if (field.required) {
          throw new Error(invalidWorkspaceGatewayEnumFieldError(field));
        }

        return parsed;
      }

      if (field.allowedValues !== undefined && !field.allowedValues.includes(parsed)) {
        throw new Error(invalidWorkspaceGatewayEnumFieldError(field));
      }

      return parsed;
    }
    case "string":
      return optionalString(value);
  }
}

function invalidWorkspaceGatewayEnumFieldError(
  field: WorkspaceOperationInputFieldDefinition,
): string {
  if (field.key === "provider" && field.allowedValues?.length === 1) {
    return `Workspace credential setup provider must be "${field.allowedValues[0]}".`;
  }

  return `Workspace gateway ${field.key} is invalid.`;
}

function trimWorkspaceGatewayApiBasePath(apiBasePath: string): string {
  return apiBasePath.replace(/\/+$/, "");
}

function forbiddenWorkspaceGatewayInputKey(key: string): boolean {
  const normalized = key.toLowerCase().replaceAll(/[-_]/g, "");

  return (
    normalized === "path" ||
    normalized === "workspacepath" ||
    normalized === "filepath" ||
    normalized === "filesystem" ||
    normalized === "command" ||
    normalized === "shell" ||
    normalized.startsWith("raw") ||
    normalized.includes("providerstate") ||
    normalized.endsWith("token") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("password") ||
    normalized.includes("apikey")
  );
}

function secretLookingText(value: string): boolean {
  return /(?:TOKEN|PASSWORD|SECRET|API[_-]?KEY)\s*=/i.test(value) || /^Bearer\s+/i.test(value);
}

function pathTraversalText(value: string): boolean {
  return (
    value.includes("../") ||
    value.includes("..\\") ||
    /^\/(?:etc|tmp|Users|var|home)\//.test(value) ||
    /^[A-Za-z]:\\/.test(value)
  );
}

function shellCommandText(value: string): boolean {
  return /(?:^|[;&|]\s*)(?:bash|curl|rm|sh|zsh)(?:\s|$)/.test(value);
}

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value !== "string") {
    throw new Error("Workspace gateway string field must be a string.");
  }

  return value;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error("Workspace gateway boolean field must be a boolean.");
  }

  return value;
}

function sameWorkspaceGatewayExecutionRequirements(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length && left.every((requirement, index) => right[index] === requirement)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
