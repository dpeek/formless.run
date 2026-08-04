import {
  isWorkspaceAutoSaveWriteSource,
  workspaceOperationActorAllowed,
  workspaceOperationBaseExecutionRequirements,
  workspaceOperationEffectiveExecutionRequirements,
  workspaceOperationRequiredCapability,
  type WorkspaceOperationRequiredCapability,
} from "@dpeek/formless-workspace";
import {
  WORKSPACE_GATEWAY_API_ROUTE_PREFIX,
  WORKSPACE_GATEWAY_ERROR_CODES,
  WORKSPACE_GATEWAY_PUSHES_API_PATH,
  WORKSPACE_GATEWAY_PUSH_FAILURE_CODES,
  WORKSPACE_GATEWAY_PUSH_PHASE_IDS,
  type WorkspaceGatewayAccountChoice,
  type WorkspaceGatewayAccountSelectionInput,
  type WorkspaceGatewayApiErrorBody,
  type WorkspaceGatewayAutoSaveEnqueueInput,
  type WorkspaceGatewayErrorCode,
  type WorkspaceGatewayIntent,
  type WorkspaceGatewayParseResult,
  type WorkspaceGatewayPush,
  type WorkspaceGatewayPushFailureCode,
  type WorkspaceGatewayPushMode,
  type WorkspaceGatewayPushPath,
  type WorkspaceGatewayPushPhase,
  type WorkspaceGatewayPushPhaseId,
  type WorkspaceGatewayPushResponse,
  type WorkspaceGatewayPushStartInput,
  type WorkspaceGatewayStatusResponse,
} from "./types.ts";

export {
  LOCAL_SESSION_BOOTSTRAP_API_PATH,
  LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_ACTOR_HEADER,
  WORKSPACE_GATEWAY_API_ROUTE_PREFIX,
  WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER,
  WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH,
  WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_CSRF_COOKIE_NAME,
  WORKSPACE_GATEWAY_CSRF_HEADER,
  WORKSPACE_GATEWAY_CSRF_TOKEN_ENV,
  WORKSPACE_GATEWAY_ENABLED_ENV,
  WORKSPACE_GATEWAY_ERROR_CODES,
  WORKSPACE_GATEWAY_INTENT_HEADER,
  WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_PUSHES_API_PATH,
  WORKSPACE_GATEWAY_PUSH_FAILURE_CODES,
  WORKSPACE_GATEWAY_PUSH_PHASE_IDS,
  WORKSPACE_GATEWAY_ROOT_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
  WORKSPACE_GATEWAY_STATUS_API_PATH,
} from "./types.ts";
export type {
  WorkspaceGatewayAccountChoice,
  WorkspaceGatewayAccountSelectionInput,
  WorkspaceGatewayAccountSelectionInteraction,
  WorkspaceGatewayActor,
  WorkspaceGatewayActorFacts,
  WorkspaceGatewayApiErrorBody,
  WorkspaceGatewayAuthorizationVia,
  WorkspaceGatewayAutoSaveEnqueueInput,
  WorkspaceGatewayAutoSaveWriteSource,
  WorkspaceGatewayErrorCode,
  WorkspaceGatewayExternalAuthorizationInteraction,
  WorkspaceGatewayIntent,
  WorkspaceGatewayParseResult,
  WorkspaceGatewayPush,
  WorkspaceGatewayPushExecutionResult,
  WorkspaceGatewayPushFailureCode,
  WorkspaceGatewayPushHandler,
  WorkspaceGatewayPushInteraction,
  WorkspaceGatewayPushLifecycle,
  WorkspaceGatewayPushMode,
  WorkspaceGatewayPushOutcome,
  WorkspaceGatewayPushPath,
  WorkspaceGatewayPushPhase,
  WorkspaceGatewayPushPhaseId,
  WorkspaceGatewayPushPhaseObserver,
  WorkspaceGatewayPushPhaseStatus,
  WorkspaceGatewayPushResponse,
  WorkspaceGatewayPushStartInput,
  WorkspaceGatewayStatusResponse,
} from "./types.ts";

const pushIdPattern = /^push_[A-Za-z0-9_-]{16,128}$/;
const interactionIdPattern = /^interaction_[A-Za-z0-9_-]{16,128}$/;
const accountIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const targetAliasPattern = /^[a-z][a-z0-9]*(?:(?:[.-])[a-z0-9]+)*$/;

export function isWorkspaceGatewayPath(pathname: string): boolean {
  return (
    pathname === WORKSPACE_GATEWAY_API_ROUTE_PREFIX ||
    pathname.startsWith(`${WORKSPACE_GATEWAY_API_ROUTE_PREFIX}/`)
  );
}

export function workspaceGatewayStatusApiPath(
  apiBasePath = WORKSPACE_GATEWAY_API_ROUTE_PREFIX,
): string {
  return `${trimApiBasePath(apiBasePath)}/status`;
}

export function workspaceGatewayPushesApiPath(
  apiBasePath = WORKSPACE_GATEWAY_API_ROUTE_PREFIX,
): string {
  return `${trimApiBasePath(apiBasePath)}/pushes`;
}

export function workspaceGatewayPushApiPath(
  pushId: string,
  apiBasePath = WORKSPACE_GATEWAY_API_ROUTE_PREFIX,
): string {
  return `${workspaceGatewayPushesApiPath(apiBasePath)}/${encodeURIComponent(pushId)}`;
}

export function workspaceGatewayPushInteractionApiPath(
  pushId: string,
  interactionId: string,
  apiBasePath = WORKSPACE_GATEWAY_API_ROUTE_PREFIX,
): string {
  return `${workspaceGatewayPushApiPath(pushId, apiBasePath)}/interactions/${encodeURIComponent(
    interactionId,
  )}`;
}

export function workspaceGatewayAutoSaveApiPath(
  apiBasePath = WORKSPACE_GATEWAY_API_ROUTE_PREFIX,
): string {
  return `${trimApiBasePath(apiBasePath)}/auto-save`;
}

export function parseWorkspaceGatewayPushPath(
  pathname: string,
): WorkspaceGatewayPushPath | undefined {
  const prefix = `${WORKSPACE_GATEWAY_PUSHES_API_PATH}/`;
  if (!pathname.startsWith(prefix)) return undefined;
  const parts = pathname.slice(prefix.length).split("/");

  if (parts.length === 1 && isWorkspaceGatewayPushId(parts[0])) {
    return { kind: "push", pushId: parts[0] };
  }
  if (
    parts.length === 3 &&
    parts[1] === "interactions" &&
    isWorkspaceGatewayPushId(parts[0]) &&
    isWorkspaceGatewayInteractionId(parts[2])
  ) {
    return { interactionId: parts[2], kind: "interaction", pushId: parts[0] };
  }
  return undefined;
}

export function isWorkspaceGatewayPushId(value: unknown): value is string {
  return typeof value === "string" && pushIdPattern.test(value);
}

export function isWorkspaceGatewayInteractionId(value: unknown): value is string {
  return typeof value === "string" && interactionIdPattern.test(value);
}

export function isWorkspaceGatewayAccountId(value: unknown): value is string {
  return typeof value === "string" && accountIdPattern.test(value);
}

export function isWorkspaceGatewayPushMode(value: unknown): value is WorkspaceGatewayPushMode {
  return value === "dry-run" || value === "apply";
}

export function isWorkspaceGatewayPushPhaseId(
  value: unknown,
): value is WorkspaceGatewayPushPhaseId {
  return (
    typeof value === "string" &&
    (WORKSPACE_GATEWAY_PUSH_PHASE_IDS as readonly string[]).includes(value)
  );
}

export function isWorkspaceGatewayPushFailureCode(
  value: unknown,
): value is WorkspaceGatewayPushFailureCode {
  return (
    typeof value === "string" &&
    (WORKSPACE_GATEWAY_PUSH_FAILURE_CODES as readonly string[]).includes(value)
  );
}

export function isWorkspaceGatewayErrorCode(value: unknown): value is WorkspaceGatewayErrorCode {
  return (
    typeof value === "string" &&
    (WORKSPACE_GATEWAY_ERROR_CODES as readonly string[]).includes(value)
  );
}

export function parseWorkspaceGatewayPushStartInput(
  body: unknown,
): WorkspaceGatewayParseResult<WorkspaceGatewayPushStartInput> {
  if (!isExactRecord(body, ["mode", "targetAlias"]) || !isWorkspaceGatewayPushMode(body.mode)) {
    return invalidParse();
  }
  if (body.targetAlias !== undefined && !isWorkspaceGatewayTargetAlias(body.targetAlias)) {
    return invalidParse();
  }
  return {
    input: {
      mode: body.mode,
      ...(body.targetAlias === undefined ? {} : { targetAlias: body.targetAlias }),
    },
    ok: true,
  };
}

export function parseWorkspaceGatewayAccountSelectionInput(
  body: unknown,
): WorkspaceGatewayParseResult<WorkspaceGatewayAccountSelectionInput> {
  if (
    !isExactRecord(body, ["accountId", "kind"]) ||
    body.kind !== "account-selection" ||
    !isWorkspaceGatewayAccountId(body.accountId)
  ) {
    return invalidParse();
  }
  return { input: { accountId: body.accountId, kind: body.kind }, ok: true };
}

export function parseWorkspaceGatewayAutoSaveEnqueueInput(
  body: unknown,
): WorkspaceGatewayParseResult<WorkspaceGatewayAutoSaveEnqueueInput> {
  if (!isExactRecord(body, ["source"]) || !isWorkspaceAutoSaveWriteSource(body.source)) {
    return invalidParse();
  }
  return { input: { source: body.source }, ok: true };
}

export function workspaceGatewayStatusIntent(): WorkspaceGatewayIntent {
  return {
    bootstrapAllowed: true,
    executionRequirements: [],
    kind: "status",
    mutating: false,
  };
}

export function workspaceGatewayPushStartIntent(
  input: WorkspaceGatewayPushStartInput,
): WorkspaceGatewayIntent {
  return {
    bootstrapAllowed: false,
    executionRequirements: workspaceOperationEffectiveExecutionRequirements({
      dryRun: input.mode === "dry-run",
      kind: "push",
      ...(input.targetAlias === undefined ? {} : { targetAlias: input.targetAlias }),
    }),
    kind: "push-start",
    mutating: true,
    requiredCapability: workspaceOperationRequiredCapability("push"),
  };
}

export function workspaceGatewayPushReadIntent(): WorkspaceGatewayIntent {
  return {
    bootstrapAllowed: false,
    executionRequirements: workspaceOperationBaseExecutionRequirements("push"),
    kind: "push-read",
    mutating: false,
    requiredCapability: workspaceOperationRequiredCapability("push"),
  };
}

export function workspaceGatewayInteractionSubmitIntent(): WorkspaceGatewayIntent {
  return {
    bootstrapAllowed: false,
    executionRequirements: workspaceOperationEffectiveExecutionRequirements({
      dryRun: false,
      kind: "push",
    }),
    kind: "interaction-submit",
    mutating: true,
    requiredCapability: workspaceOperationRequiredCapability("push"),
  };
}

export function workspaceGatewayAutoSaveEnqueueIntent(): WorkspaceGatewayIntent {
  return {
    bootstrapAllowed: false,
    executionRequirements: workspaceOperationBaseExecutionRequirements("save"),
    kind: "auto-save",
    mutating: true,
    requiredCapability: workspaceOperationRequiredCapability("save"),
  };
}

export function workspaceGatewayIntentAllowed(input: {
  actor: "automation" | "browser" | "cli" | "system";
  capabilities: readonly WorkspaceOperationRequiredCapability[];
  intent: WorkspaceGatewayIntent;
}): boolean {
  if (input.intent.kind === "status") return true;
  const operationKind = input.intent.kind === "auto-save" ? "save" : "push";
  return (
    workspaceOperationActorAllowed(operationKind, input.actor) &&
    (input.intent.requiredCapability === undefined ||
      input.capabilities.includes(input.intent.requiredCapability))
  );
}

export function isWorkspaceGatewayAccountChoice(
  value: unknown,
): value is WorkspaceGatewayAccountChoice {
  return (
    isExactRecord(value, ["id", "name"]) &&
    isWorkspaceGatewayAccountId(value.id) &&
    (value.name === undefined ||
      (typeof value.name === "string" && value.name.length > 0 && value.name.length <= 256))
  );
}

export function isWorkspaceGatewayPush(value: unknown): value is WorkspaceGatewayPush {
  if (
    !isRecord(value) ||
    !isWorkspaceGatewayPushId(value.id) ||
    !isWorkspaceGatewayPushMode(value.mode) ||
    !isIsoTime(value.createdAt) ||
    !isIsoTime(value.updatedAt) ||
    (value.targetAlias !== undefined && !isWorkspaceGatewayTargetAlias(value.targetAlias)) ||
    !isWorkspaceGatewayPushPhases(value.phases)
  ) {
    return false;
  }

  const baseKeys = ["createdAt", "id", "lifecycle", "mode", "phases", "targetAlias", "updatedAt"];
  switch (value.lifecycle) {
    case "queued":
      return (
        isExactRecord(value, baseKeys) && value.phases.every((phase) => phase.status === "pending")
      );
    case "running":
      return (
        isExactRecord(value, baseKeys) && value.phases.every((phase) => phase.status !== "failed")
      );
    case "waiting-for-interaction":
      return (
        isExactRecord(value, [...baseKeys, "interaction"]) &&
        value.phases.filter((phase) => phase.status === "running").length === 1 &&
        isPushInteraction(value.interaction)
      );
    case "succeeded":
      return (
        isExactRecord(value, [...baseKeys, "outcome"]) &&
        value.phases.every((phase) => phase.status === "succeeded" || phase.status === "skipped") &&
        (value.outcome === "up-to-date" ||
          (value.outcome === "planned" && value.mode === "dry-run") ||
          (value.outcome === "applied" && value.mode === "apply"))
      );
    case "failed":
      return (
        isExactRecord(value, [...baseKeys, "failedPhase", "failureCode"]) &&
        isWorkspaceGatewayPushPhaseId(value.failedPhase) &&
        isWorkspaceGatewayPushFailureCode(value.failureCode) &&
        value.phases.filter((phase) => phase.status === "failed").length === 1 &&
        value.phases.some((phase) => phase.id === value.failedPhase && phase.status === "failed")
      );
    default:
      return false;
  }
}

export function isWorkspaceGatewayStatusResponse(
  value: unknown,
): value is WorkspaceGatewayStatusResponse {
  return (
    isExactRecord(value, ["csrfToken", "currentPush", "gateway", "latestPush"]) &&
    value.gateway === "available" &&
    (value.csrfToken === undefined || typeof value.csrfToken === "string") &&
    (value.currentPush === null || isWorkspaceGatewayPush(value.currentPush)) &&
    (value.latestPush === null || isWorkspaceGatewayPush(value.latestPush)) &&
    (value.currentPush === null || !isTerminalPush(value.currentPush)) &&
    (value.latestPush === null || isTerminalPush(value.latestPush))
  );
}

export function isWorkspaceGatewayPushResponse(
  value: unknown,
): value is WorkspaceGatewayPushResponse {
  return isExactRecord(value, ["push"]) && isWorkspaceGatewayPush(value.push);
}

export function isWorkspaceGatewayApiErrorBody(
  value: unknown,
): value is WorkspaceGatewayApiErrorBody {
  return isExactRecord(value, ["code"]) && isWorkspaceGatewayErrorCode(value.code);
}

export function isTerminalWorkspaceGatewayPush(push: WorkspaceGatewayPush): boolean {
  return isTerminalPush(push);
}

export function assertWorkspaceGatewayAuthorizationUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Gateway authorization URL is invalid.");
  }
  if (
    url.protocol !== "https:" ||
    url.origin !== "https://dash.cloudflare.com" ||
    url.pathname !== "/oauth2/auth" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== ""
  ) {
    throw new Error("Gateway authorization URL is invalid.");
  }
}

function isWorkspaceGatewayPushPhases(
  value: unknown,
): value is readonly WorkspaceGatewayPushPhase[] {
  if (!Array.isArray(value) || value.length !== WORKSPACE_GATEWAY_PUSH_PHASE_IDS.length)
    return false;
  let active = false;
  let pending = false;
  return value.every((phase, index) => {
    if (
      !isExactRecord(phase, ["id", "status"]) ||
      phase.id !== WORKSPACE_GATEWAY_PUSH_PHASE_IDS[index] ||
      !["pending", "running", "succeeded", "skipped", "failed"].includes(phase.status as string)
    ) {
      return false;
    }
    if (phase.status === "pending") {
      pending = true;
      return true;
    }
    if (phase.status === "running" || phase.status === "failed") {
      if (active || pending) return false;
      active = true;
      return true;
    }
    return !active && !pending;
  });
}

function isPushInteraction(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isWorkspaceGatewayInteractionId(value.id) ||
    !isIsoTime(value.expiresAt)
  ) {
    return false;
  }
  if (value.kind === "external-authorization") {
    if (
      !isExactRecord(value, ["expiresAt", "id", "kind", "provider", "url"]) ||
      value.provider !== "cloudflare" ||
      typeof value.url !== "string"
    ) {
      return false;
    }
    try {
      assertWorkspaceGatewayAuthorizationUrl(value.url);
      return true;
    } catch {
      return false;
    }
  }
  if (
    value.kind !== "account-selection" ||
    !isExactRecord(value, ["choices", "expiresAt", "id", "kind", "provider"]) ||
    value.provider !== "cloudflare" ||
    !Array.isArray(value.choices) ||
    value.choices.length === 0 ||
    value.choices.length > 100 ||
    !value.choices.every(isWorkspaceGatewayAccountChoice)
  ) {
    return false;
  }
  return new Set(value.choices.map((choice) => choice.id)).size === value.choices.length;
}

function isWorkspaceGatewayTargetAlias(value: unknown): value is string {
  return typeof value === "string" && value.length <= 128 && targetAliasPattern.test(value);
}

function isTerminalPush(push: WorkspaceGatewayPush): boolean {
  return push.lifecycle === "succeeded" || push.lifecycle === "failed";
}

function isIsoTime(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function trimApiBasePath(apiBasePath: string): string {
  return apiBasePath.replace(/\/$/, "");
}

function invalidParse<T>(): WorkspaceGatewayParseResult<T> {
  return { code: "invalid-request", ok: false };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExactRecord(
  value: unknown,
  allowedKeys: readonly string[],
): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).every((key) => allowedKeys.includes(key));
}
