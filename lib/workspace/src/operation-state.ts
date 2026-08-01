import {
  WORKSPACE_BROWSER_OPERATION_DEFINITIONS,
  WORKSPACE_OPERATION_EXECUTION_REQUIREMENTS,
  WORKSPACE_GATEWAY_OPERATION_DEFINITIONS,
  WORKSPACE_GATEWAY_OPERATION_KINDS,
  WORKSPACE_OPERATION_DEFINITIONS,
  WORKSPACE_OPERATION_KINDS,
  WORKSPACE_OPERATION_STATE_FILE_KIND,
  WORKSPACE_OPERATION_STATE_FILE_VERSION,
  WORKSPACE_AUTO_SAVE_STATE_FILE_KIND,
  WORKSPACE_AUTO_SAVE_STATE_FILE_VERSION,
  WORKSPACE_AUTO_SAVE_SUPPRESSION_REASONS,
  WORKSPACE_AUTO_SAVE_WRITE_SOURCES,
} from "./types.ts";
import type {
  WorkspaceAutoSaveEnqueueInput,
  WorkspaceAutoSaveState,
  WorkspaceAutoSaveSuppressionReason,
  WorkspaceAutoSaveWriteSource,
  InitialWorkspaceOperationStateInput,
  UpdateWorkspaceOperationStateInput,
  WorkspaceBrowserOperationControlMetadata,
  WorkspaceBrowserOperationDefinition,
  WorkspaceBrowserOperationKind,
  WorkspaceGatewayOperationDefinition,
  WorkspaceGatewayOperationKind,
  WorkspaceOperationActorPolicy,
  WorkspaceOperationDefinition,
  WorkspaceOperationDefinitionKey,
  WorkspaceOperationDisplayObject,
  WorkspaceOperationDisplayValue,
  WorkspaceOperationEvent,
  WorkspaceOperationExecutionDecision,
  WorkspaceOperationExecutionRequirement,
  WorkspaceOperationIdParseResult,
  WorkspaceOperationInputFieldDefinition,
  WorkspaceOperationInput,
  WorkspaceOperationKind,
  WorkspaceOperationMode,
  WorkspaceOperationActor,
  WorkspaceOperationRequiredCapability,
  WorkspaceOperationResult,
  WorkspaceOperationStartInput,
  WorkspaceOperationState,
  WorkspaceOperationStatus,
  WorkspaceOperationStep,
  WorkspaceOperationSummary,
} from "./types.ts";

const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;
const workspaceOperationKindSet = new Set<string>(WORKSPACE_OPERATION_KINDS);
const workspaceGatewayOperationKindSet = new Set<string>(WORKSPACE_GATEWAY_OPERATION_KINDS);
const workspaceOperationExecutionRequirementSet = new Set<string>(
  WORKSPACE_OPERATION_EXECUTION_REQUIREMENTS,
);
const workspaceAutoSaveWriteSourceSet = new Set<string>(WORKSPACE_AUTO_SAVE_WRITE_SOURCES);
const workspaceAutoSaveSuppressionReasonSet = new Set<string>(
  WORKSPACE_AUTO_SAVE_SUPPRESSION_REASONS,
);
const workspaceOperationDefinitionsByKind = new Map<
  WorkspaceOperationKind,
  WorkspaceOperationDefinition
>(WORKSPACE_OPERATION_DEFINITIONS.map((definition) => [definition.kind, definition]));
const workspaceOperationDefinitionsByKey = new Map<
  WorkspaceOperationDefinitionKey,
  WorkspaceOperationDefinition
>(WORKSPACE_OPERATION_DEFINITIONS.map((definition) => [definition.key, definition]));
const workspaceGatewayOperationDefinitionsByKind = new Map<
  WorkspaceGatewayOperationKind,
  WorkspaceGatewayOperationDefinition
>(WORKSPACE_GATEWAY_OPERATION_DEFINITIONS.map((definition) => [definition.kind, definition]));
const workspaceGatewayOperationDefinitionsByRequestKind = new Map<
  string,
  WorkspaceGatewayOperationDefinition
>(
  WORKSPACE_GATEWAY_OPERATION_DEFINITIONS.map((definition) => [
    definition.bindings.gateway.requestKind,
    definition,
  ]),
);

export function isWorkspaceOperationKind(value: unknown): value is WorkspaceOperationKind {
  return typeof value === "string" && workspaceOperationKindSet.has(value);
}

export function isWorkspaceBrowserOperationKind(
  value: unknown,
): value is WorkspaceBrowserOperationKind {
  return isWorkspaceGatewayOperationKind(value);
}

export function isWorkspaceGatewayOperationKind(
  value: unknown,
): value is WorkspaceGatewayOperationKind {
  return typeof value === "string" && workspaceGatewayOperationKindSet.has(value);
}

export function isWorkspaceOperationExecutionRequirement(
  value: unknown,
): value is WorkspaceOperationExecutionRequirement {
  return typeof value === "string" && workspaceOperationExecutionRequirementSet.has(value);
}

export function isWorkspaceAutoSaveWriteSource(
  value: unknown,
): value is WorkspaceAutoSaveWriteSource {
  return typeof value === "string" && workspaceAutoSaveWriteSourceSet.has(value);
}

export function isWorkspaceAutoSaveSuppressionReason(
  value: unknown,
): value is WorkspaceAutoSaveSuppressionReason {
  return typeof value === "string" && workspaceAutoSaveSuppressionReasonSet.has(value);
}

export function workspaceOperationDefinitionForKind<TKind extends WorkspaceOperationKind>(
  kind: TKind,
): Extract<WorkspaceOperationDefinition, { readonly kind: TKind }> {
  const definition = workspaceOperationDefinitionsByKind.get(kind);

  if (!definition) {
    throw new Error(`Workspace operation "${kind}" is not defined.`);
  }

  return definition as Extract<WorkspaceOperationDefinition, { readonly kind: TKind }>;
}

export function workspaceOperationDefinitionForKey<TKey extends WorkspaceOperationDefinitionKey>(
  key: TKey,
): Extract<WorkspaceOperationDefinition, { readonly key: TKey }> {
  const definition = workspaceOperationDefinitionsByKey.get(key);

  if (!definition) {
    throw new Error(`Workspace operation "${key}" is not defined.`);
  }

  return definition as Extract<WorkspaceOperationDefinition, { readonly key: TKey }>;
}

export function workspaceGatewayOperationDefinitions(): readonly WorkspaceGatewayOperationDefinition[] {
  return WORKSPACE_GATEWAY_OPERATION_DEFINITIONS;
}

export function workspaceBrowserOperationDefinitions(): readonly WorkspaceBrowserOperationDefinition[] {
  return WORKSPACE_BROWSER_OPERATION_DEFINITIONS;
}

export function workspaceBrowserOperationControlMetadata(): readonly WorkspaceBrowserOperationControlMetadata[] {
  return WORKSPACE_BROWSER_OPERATION_DEFINITIONS.map(
    workspaceBrowserOperationControlMetadataFromDefinition,
  );
}

export function workspaceGatewayOperationDefinitionForKind<
  TKind extends WorkspaceGatewayOperationKind,
>(kind: TKind): Extract<WorkspaceGatewayOperationDefinition, { readonly kind: TKind }> {
  const definition = workspaceGatewayOperationDefinitionsByKind.get(kind);

  if (!definition) {
    throw new Error(`Workspace operation "${kind}" is not bound to a gateway request.`);
  }

  return definition as Extract<WorkspaceGatewayOperationDefinition, { readonly kind: TKind }>;
}

export function workspaceOperationDefinitionForGatewayRequestKind(
  requestKind: string,
): WorkspaceGatewayOperationDefinition {
  const definition = workspaceGatewayOperationDefinitionsByRequestKind.get(requestKind);

  if (!definition) {
    throw new Error(
      `Workspace gateway request "${requestKind}" is not bound to an operation definition.`,
    );
  }

  return definition;
}

export function workspaceOperationInputFieldDefinition(
  kind: WorkspaceOperationKind,
  fieldKey: string,
): WorkspaceOperationInputFieldDefinition {
  const field = workspaceOperationDefinitionForKind(kind).input.fields.find(
    (candidate) => candidate.key === fieldKey,
  );

  if (!field) {
    throw new Error(`Workspace operation "${kind}" does not define input field "${fieldKey}".`);
  }

  return field;
}

export function workspaceOperationLabel(kind: WorkspaceOperationKind): string {
  return workspaceOperationDefinitionForKind(kind).label;
}

export function workspaceOperationInputFieldDefaultValue(
  kind: WorkspaceOperationKind,
  fieldKey: string,
): boolean | null | string | undefined {
  const field = workspaceOperationInputFieldDefinition(kind, fieldKey);

  return "defaultValue" in field ? field.defaultValue : undefined;
}

export function workspaceOperationInputDefaults(
  kind: WorkspaceOperationKind,
): Record<string, boolean | null | string> {
  return Object.fromEntries(
    workspaceOperationDefinitionForKind(kind).input.fields.flatMap((field) =>
      "defaultValue" in field ? [[field.key, field.defaultValue]] : [],
    ),
  );
}

export function workspaceOperationGatewayRequestKind(kind: WorkspaceGatewayOperationKind): string {
  return workspaceGatewayOperationDefinitionForKind(kind).bindings.gateway.requestKind;
}

export function workspaceOperationGatewayInputFields(
  kind: WorkspaceGatewayOperationKind,
): readonly string[] {
  return workspaceGatewayOperationDefinitionForKind(kind).bindings.gateway.inputFields;
}

export function workspaceOperationGatewayAllowedRequestFields(
  kind: WorkspaceGatewayOperationKind,
): readonly string[] {
  return ["kind", "operation", ...workspaceOperationGatewayInputFields(kind)];
}

export function workspaceOperationMode(kind: WorkspaceOperationKind): WorkspaceOperationMode {
  return workspaceOperationDefinitionForKind(kind).mode;
}

export function workspaceOperationActorPolicy(
  kind: WorkspaceOperationKind,
): WorkspaceOperationActorPolicy {
  return workspaceOperationDefinitionForKind(kind).actorPolicy;
}

export function workspaceOperationRequiredCapability(
  kind: WorkspaceOperationKind,
): WorkspaceOperationRequiredCapability {
  return workspaceOperationDefinitionForKind(kind).requiredCapability;
}

export function workspaceOperationBaseExecutionRequirements(
  kind: WorkspaceOperationKind,
): readonly WorkspaceOperationExecutionRequirement[] {
  return workspaceOperationDefinitionForKind(kind).executionRequirements;
}

export function workspaceOperationEffectiveExecutionRequirements(
  input: WorkspaceOperationInput | WorkspaceOperationStartInput,
): readonly WorkspaceOperationExecutionRequirement[] {
  const baseRequirements = workspaceOperationBaseExecutionRequirements(input.kind);

  switch (input.kind) {
    case "check":
      return workspaceOperationInputHasTargetAlias(input)
        ? workspaceOperationExecutionRequirementsWith(baseRequirements, [
            "remote-target",
            "admin-token",
          ])
        : baseRequirements;
    case "push": {
      const dryRun = input.dryRun ?? workspaceOperationInputFieldDefaultValue("push", "dryRun");

      return dryRun === true
        ? baseRequirements
        : workspaceOperationExecutionRequirementsWith(baseRequirements, [
            "admin-token",
            "provider-credentials",
            "workspace-source-write",
          ]);
    }
    case "status":
      return input.includeDeploymentStatus === true || workspaceOperationInputHasTargetAlias(input)
        ? workspaceOperationExecutionRequirementsWith(baseRequirements, [
            "remote-target",
            "admin-token",
          ])
        : baseRequirements;
    default:
      return baseRequirements;
  }
}

export function workspaceOperationExecutionRequirementsMatch(
  input: WorkspaceOperationInput | WorkspaceOperationStartInput,
  executionRequirements: readonly WorkspaceOperationExecutionRequirement[],
): boolean {
  return sameWorkspaceOperationExecutionRequirements(
    workspaceOperationEffectiveExecutionRequirements(input),
    executionRequirements,
  );
}

export function assertWorkspaceOperationExecutionRequirements(
  input: WorkspaceOperationInput | WorkspaceOperationStartInput,
  executionRequirements = workspaceOperationEffectiveExecutionRequirements(input),
): void {
  if (!workspaceOperationExecutionRequirementsMatch(input, executionRequirements)) {
    throw new Error(`Workspace operation "${input.kind}" execution requirements are invalid.`);
  }
}

function workspaceBrowserOperationControlMetadataFromDefinition(
  definition: WorkspaceBrowserOperationDefinition,
): WorkspaceBrowserOperationControlMetadata {
  return {
    bootstrapAllowed: definition.bindings.gateway.bootstrap,
    executionRequirements: definition.executionRequirements,
    inputFields: definition.bindings.gateway.inputFields,
    kind: definition.kind,
    label: definition.label,
    mode: definition.mode,
    requiredCapability: definition.requiredCapability,
  };
}

export function workspaceOperationActorAllowed(
  kind: WorkspaceOperationKind,
  actor: WorkspaceOperationActor,
): boolean {
  return workspaceOperationDefinitionForKind(kind).actorPolicy.allowedActors.includes(actor);
}

export function workspaceOperationCapabilityAllowed(
  kind: WorkspaceOperationKind,
  capabilities: readonly WorkspaceOperationRequiredCapability[],
): boolean {
  return capabilities.includes(workspaceOperationRequiredCapability(kind));
}

export function workspaceOperationExecutionDecision(input: {
  actor: WorkspaceOperationActor;
  capabilities: readonly WorkspaceOperationRequiredCapability[];
  kind: WorkspaceOperationKind;
}): WorkspaceOperationExecutionDecision {
  const definition = workspaceOperationDefinitionForKind(input.kind);

  if (!definition.actorPolicy.allowedActors.includes(input.actor)) {
    return {
      error: `Workspace operation "${input.kind}" is not allowed for actor "${input.actor}".`,
      ok: false,
    };
  }

  if (!input.capabilities.includes(definition.requiredCapability)) {
    return {
      error: `Workspace operation "${input.kind}" requires execution capability "${definition.requiredCapability}".`,
      ok: false,
      requiredCapability: definition.requiredCapability,
    };
  }

  return { ok: true };
}

export function assertWorkspaceOperationExecutionAllowed(input: {
  actor: WorkspaceOperationActor;
  capabilities: readonly WorkspaceOperationRequiredCapability[];
  kind: WorkspaceOperationKind;
}): void {
  const decision = workspaceOperationExecutionDecision(input);

  if (!decision.ok) {
    throw new Error(decision.error);
  }
}

export function workspaceOperationBootstrapAllowed(kind: WorkspaceOperationKind): boolean {
  const definition = workspaceOperationDefinitionForKind(kind);

  return "gateway" in definition.bindings && definition.bindings.gateway.bootstrap;
}

function workspaceOperationExecutionRequirementsWith(
  baseRequirements: readonly WorkspaceOperationExecutionRequirement[],
  additionalRequirements: readonly WorkspaceOperationExecutionRequirement[],
): readonly WorkspaceOperationExecutionRequirement[] {
  const seen = new Set<WorkspaceOperationExecutionRequirement>();

  return [...baseRequirements, ...additionalRequirements].filter((requirement) => {
    if (seen.has(requirement)) {
      return false;
    }

    seen.add(requirement);
    return true;
  });
}

function workspaceOperationInputHasTargetAlias(
  input: WorkspaceOperationInput | WorkspaceOperationStartInput,
): boolean {
  const targetAlias = (input as { targetAlias?: string | null }).targetAlias;

  return typeof targetAlias === "string" && targetAlias.trim() !== "";
}

function sameWorkspaceOperationExecutionRequirements(
  left: readonly WorkspaceOperationExecutionRequirement[],
  right: readonly WorkspaceOperationExecutionRequirement[],
): boolean {
  return (
    left.length === right.length && left.every((requirement, index) => right[index] === requirement)
  );
}

export function isWorkspaceOperationStatus(value: unknown): value is WorkspaceOperationStatus {
  return value === "failed" || value === "queued" || value === "running" || value === "succeeded";
}

export function parseWorkspaceOperationId(value: unknown): WorkspaceOperationIdParseResult {
  if (typeof value !== "string" || !operationIdPattern.test(value)) {
    return { error: "Workspace operation id is invalid.", ok: false };
  }

  return { ok: true, operationId: value };
}

export function workspaceOperationStateFileName(operationId: string): string {
  const parsed = parseWorkspaceOperationId(operationId);

  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  return parsed.operationId;
}

export function initialWorkspaceOperationState(
  input: InitialWorkspaceOperationStateInput,
): WorkspaceOperationState {
  const id = workspaceOperationStateFileName(input.id);
  const now = input.now();

  return {
    actor: input.actor ?? "system",
    createdAt: now,
    errors: [],
    events: [],
    id,
    input: redactWorkspaceOperationDisplayObject(input.input, input.workspaceRoot),
    kind: WORKSPACE_OPERATION_STATE_FILE_KIND,
    logs: [],
    operation: input.operation,
    status: "queued",
    summary: {
      fields: {},
      title: "Operation queued",
    },
    updatedAt: now,
    version: WORKSPACE_OPERATION_STATE_FILE_VERSION,
    workspace: {
      label: input.workspaceLabel,
    },
  };
}

export function nextWorkspaceOperationState(
  current: WorkspaceOperationState,
  input: UpdateWorkspaceOperationStateInput,
): WorkspaceOperationState {
  const timestamp = input.logs?.at(-1)?.at ?? current.updatedAt;
  const status = input.status ?? current.status;
  const completedAt =
    status === "failed" || status === "succeeded" ? timestamp : current.completedAt;
  const nextSteps = input.steps ?? input.result?.steps;

  return {
    ...current,
    ...(completedAt === undefined ? {} : { completedAt }),
    errors: [
      ...current.errors,
      ...(input.errors ?? []).map((error) => ({
        at: timestamp,
        message: redactWorkspaceOperationDisplayText(error.message, input.workspaceRoot),
      })),
    ],
    events: [
      ...(current.events ?? []),
      ...(input.events ?? []).map((event, index) =>
        redactWorkspaceOperationEvent(event, input.workspaceRoot, {
          id: `${current.id}-event-${(current.events ?? []).length + index + 1}`,
        }),
      ),
    ],
    logs: [
      ...current.logs,
      ...(input.logs ?? []).map((log, index) => ({
        at: redactWorkspaceOperationDisplayText(log.at, input.workspaceRoot),
        id: `${current.id}-log-${current.logs.length + index + 1}`,
        level: log.level,
        message: redactWorkspaceOperationDisplayText(log.message, input.workspaceRoot),
      })),
    ],
    ...(input.result === undefined
      ? {}
      : { result: redactWorkspaceOperationResult(input.result, input.workspaceRoot) }),
    startedAt:
      status === "running" && current.startedAt === undefined ? timestamp : current.startedAt,
    status,
    ...(nextSteps === undefined
      ? {}
      : { steps: redactWorkspaceOperationSteps(nextSteps, input.workspaceRoot) }),
    summary:
      input.summary === undefined
        ? current.summary
        : redactWorkspaceOperationSummary(input.summary, input.workspaceRoot),
    updatedAt: timestamp,
  };
}

export function workspaceOperationInputDisplay(
  input: WorkspaceOperationInput | WorkspaceOperationStartInput,
): WorkspaceOperationDisplayObject {
  const definition = workspaceOperationDefinitionForKind(input.kind);
  const inputRecord = input as Record<string, WorkspaceOperationDisplayValue | undefined>;

  return Object.fromEntries(
    definition.input.fields.flatMap((field) => {
      if (field.display === "never") {
        return [];
      }

      const defaultValue = "defaultValue" in field ? field.defaultValue : undefined;
      const value = inputRecord[field.key] ?? defaultValue;

      if (value === undefined || value === null) {
        return [];
      }

      return [[field.key, value]];
    }),
  ) as WorkspaceOperationDisplayObject;
}

export function parseWorkspaceOperationStateJson(contents: string): WorkspaceOperationState {
  return parseWorkspaceOperationState(JSON.parse(contents) as unknown);
}

export function parseWorkspaceOperationState(value: unknown): WorkspaceOperationState {
  if (!isRecord(value)) {
    throw new Error("Workspace operation state file is invalid.");
  }

  if (
    value.kind !== WORKSPACE_OPERATION_STATE_FILE_KIND ||
    value.version !== WORKSPACE_OPERATION_STATE_FILE_VERSION ||
    typeof value.id !== "string" ||
    !isWorkspaceOperationKind(value.operation) ||
    !isWorkspaceOperationStatus(value.status)
  ) {
    throw new Error("Workspace operation state file is invalid.");
  }

  return value as WorkspaceOperationState;
}

export function formatWorkspaceOperationState(state: WorkspaceOperationState): string {
  return `${JSON.stringify(parseWorkspaceOperationState(state), null, 2)}\n`;
}

export function initialWorkspaceAutoSaveState(input: {
  now: () => string;
}): WorkspaceAutoSaveState {
  const now = input.now();

  return {
    dirtyGeneration: 0,
    displayState: "clean",
    kind: WORKSPACE_AUTO_SAVE_STATE_FILE_KIND,
    retryCount: 0,
    savedGeneration: 0,
    updatedAt: now,
    version: WORKSPACE_AUTO_SAVE_STATE_FILE_VERSION,
    writeSources: [],
  };
}

export function nextWorkspaceAutoSaveEnqueuedState(
  current: WorkspaceAutoSaveState,
  input: WorkspaceAutoSaveEnqueueInput & { now: () => string },
): WorkspaceAutoSaveState {
  if (!isWorkspaceAutoSaveWriteSource(input.source)) {
    throw new Error("Workspace auto-save write source is invalid.");
  }

  const now = input.now();
  const next: WorkspaceAutoSaveState = {
    ...current,
    dirtyGeneration: current.dirtyGeneration + 1,
    displayState: current.inFlightGeneration === undefined ? "queued" : "saving",
    lastEnqueueAt: now,
    retryCount: current.displayState === "failed" ? 0 : current.retryCount,
    updatedAt: now,
    writeSources: sortedUnique([...current.writeSources, input.source]),
  };

  delete next.error;
  return next;
}

export function nextWorkspaceAutoSaveSavingState(
  current: WorkspaceAutoSaveState,
  input: { now: () => string },
): WorkspaceAutoSaveState {
  const now = input.now();
  const next: WorkspaceAutoSaveState = {
    ...current,
    displayState: "saving",
    inFlightGeneration: current.dirtyGeneration,
    lastAttemptAt: now,
    updatedAt: now,
  };

  delete next.error;
  return next;
}

export function nextWorkspaceAutoSaveSavedState(
  current: WorkspaceAutoSaveState,
  input: { now: () => string },
): WorkspaceAutoSaveState {
  const now = input.now();
  const persistedGeneration = current.inFlightGeneration ?? current.dirtyGeneration;
  const hasNewerDirtyGeneration = current.dirtyGeneration > persistedGeneration;
  const next: WorkspaceAutoSaveState = {
    ...current,
    displayState: hasNewerDirtyGeneration ? "queued" : "saved",
    dirtyGeneration: current.dirtyGeneration,
    lastSavedAt: now,
    retryCount: hasNewerDirtyGeneration ? current.retryCount : 0,
    savedGeneration: Math.max(current.savedGeneration, persistedGeneration),
    updatedAt: now,
    writeSources: hasNewerDirtyGeneration ? current.writeSources : [],
  };

  delete next.error;
  delete next.inFlightGeneration;
  return next;
}

export function nextWorkspaceAutoSaveFailedState(
  current: WorkspaceAutoSaveState,
  input: { error: unknown; now: () => string; workspaceRoot: string },
): WorkspaceAutoSaveState {
  const now = input.now();
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  const next: WorkspaceAutoSaveState = {
    ...current,
    displayState: "failed",
    error: {
      at: now,
      message: redactWorkspaceOperationDisplayText(message, input.workspaceRoot),
    },
    retryCount: current.retryCount + 1,
    updatedAt: now,
  };

  delete next.inFlightGeneration;
  return next;
}

export function nextWorkspaceAutoSaveSuppressedState(
  current: WorkspaceAutoSaveState,
  input: { now: () => string; reason: WorkspaceAutoSaveSuppressionReason },
): WorkspaceAutoSaveState {
  if (!isWorkspaceAutoSaveSuppressionReason(input.reason)) {
    throw new Error("Workspace auto-save suppression reason is invalid.");
  }

  const now = input.now();

  return {
    ...current,
    suppressed: {
      at: now,
      reason: input.reason,
    },
    updatedAt: now,
  };
}

export function parseWorkspaceAutoSaveStateJson(contents: string): WorkspaceAutoSaveState {
  return parseWorkspaceAutoSaveState(JSON.parse(contents) as unknown);
}

export function parseWorkspaceAutoSaveState(value: unknown): WorkspaceAutoSaveState {
  if (!isRecord(value)) {
    throw new Error("Workspace auto-save state file is invalid.");
  }

  if (
    value.kind !== WORKSPACE_AUTO_SAVE_STATE_FILE_KIND ||
    value.version !== WORKSPACE_AUTO_SAVE_STATE_FILE_VERSION ||
    !isWorkspaceAutoSaveDisplayState(value.displayState) ||
    !isNonNegativeInteger(value.dirtyGeneration) ||
    !isNonNegativeInteger(value.savedGeneration) ||
    !isNonNegativeInteger(value.retryCount) ||
    typeof value.updatedAt !== "string" ||
    !Array.isArray(value.writeSources) ||
    !value.writeSources.every(isWorkspaceAutoSaveWriteSource)
  ) {
    throw new Error("Workspace auto-save state file is invalid.");
  }

  if ("inFlightGeneration" in value && !isNonNegativeInteger(value.inFlightGeneration)) {
    throw new Error("Workspace auto-save state file is invalid.");
  }

  if (
    "error" in value &&
    (!isRecord(value.error) ||
      typeof value.error.at !== "string" ||
      typeof value.error.message !== "string")
  ) {
    throw new Error("Workspace auto-save state file is invalid.");
  }

  if (
    "suppressed" in value &&
    (!isRecord(value.suppressed) ||
      typeof value.suppressed.at !== "string" ||
      !isWorkspaceAutoSaveSuppressionReason(value.suppressed.reason))
  ) {
    throw new Error("Workspace auto-save state file is invalid.");
  }

  return value as WorkspaceAutoSaveState;
}

export function formatWorkspaceAutoSaveState(state: WorkspaceAutoSaveState): string {
  return `${JSON.stringify(parseWorkspaceAutoSaveState(state), null, 2)}\n`;
}

export function redactWorkspaceOperationResult(
  result: WorkspaceOperationResult,
  workspaceRoot: string,
): WorkspaceOperationResult {
  return {
    ...(result.deployment === undefined
      ? {}
      : { deployment: redactWorkspaceOperationDisplayObject(result.deployment, workspaceRoot) }),
    ...(result.details === undefined
      ? {}
      : { details: redactWorkspaceOperationDisplayObject(result.details, workspaceRoot) }),
    ...(result.steps === undefined
      ? {}
      : { steps: redactWorkspaceOperationSteps(result.steps, workspaceRoot) }),
    summary: redactWorkspaceOperationSummary(result.summary, workspaceRoot),
  };
}

export function redactWorkspaceOperationSummary(
  summary: WorkspaceOperationSummary,
  workspaceRoot: string,
): WorkspaceOperationSummary {
  return {
    fields: redactWorkspaceOperationDisplayObject(summary.fields, workspaceRoot, {
      allowOwnerSetupUrl: true,
    }),
    title: redactWorkspaceOperationDisplayText(summary.title, workspaceRoot),
  };
}

export function redactWorkspaceOperationSteps(
  steps: readonly WorkspaceOperationStep[],
  workspaceRoot: string,
): WorkspaceOperationStep[] {
  return steps.map((step) => ({
    ...(step.detail === undefined
      ? {}
      : { detail: redactWorkspaceOperationDisplayText(step.detail, workspaceRoot) }),
    ...(step.error === undefined
      ? {}
      : { error: redactWorkspaceOperationDisplayText(step.error, workspaceRoot) }),
    ...(step.fields === undefined
      ? {}
      : { fields: redactWorkspaceOperationDisplayObject(step.fields, workspaceRoot) }),
    id: redactWorkspaceOperationDisplayText(step.id, workspaceRoot),
    label: redactWorkspaceOperationDisplayText(step.label, workspaceRoot),
    status: step.status,
  }));
}

export function redactWorkspaceOperationEvent(
  event: Omit<WorkspaceOperationEvent, "id">,
  workspaceRoot: string,
  options: { id: string },
): WorkspaceOperationEvent {
  switch (event.type) {
    case "externalAuthorizationUrl":
      return {
        at: redactWorkspaceOperationDisplayText(event.at, workspaceRoot),
        id: options.id,
        profileLabel: redactWorkspaceOperationDisplayText(event.profileLabel, workspaceRoot),
        provider: event.provider,
        status: "waiting",
        type: "externalAuthorizationUrl",
        url: allowlistedWorkspaceOperationAuthorizationUrl(event.url, event.provider),
      };
  }
}

export function redactWorkspaceOperationDisplayObject(
  value: WorkspaceOperationDisplayObject,
  workspaceRoot: string,
  options: WorkspaceOperationRedactionOptions = {},
): WorkspaceOperationDisplayObject {
  return redactWorkspaceOperationDisplayValue(
    value,
    workspaceRoot,
    options,
  ) as WorkspaceOperationDisplayObject;
}

export function redactWorkspaceOperationDisplayValue(
  value: WorkspaceOperationDisplayValue,
  workspaceRoot: string,
  options: WorkspaceOperationRedactionOptions = {},
  key?: string,
): WorkspaceOperationDisplayValue {
  if (typeof value === "string") {
    if (key && options.allowOwnerSetupUrl && isAllowlistedOwnerSetupUrlDisplayValue(key, value)) {
      return value;
    }

    return redactWorkspaceOperationDisplayText(value, workspaceRoot);
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactWorkspaceOperationDisplayValue(item, workspaceRoot, options));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      isForbiddenDisplayKey(key)
        ? "[redacted]"
        : redactWorkspaceOperationDisplayValue(child, workspaceRoot, options, key),
    ]),
  ) as WorkspaceOperationDisplayObject;
}

type WorkspaceOperationRedactionOptions = {
  allowOwnerSetupUrl?: boolean;
};

export function redactWorkspaceOperationDisplayText(value: string, workspaceRoot: string): string {
  return value
    .replaceAll(workspaceRoot, "<workspace>")
    .replace(
      /([A-Z0-9_]*(?:TOKEN|PASSWORD|SECRET|API_KEY|APIKEY)[A-Z0-9_]*=)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1[redacted]",
    )
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]")
    .replace(/lease:[A-Za-z0-9._:-]+/gi, "[redacted]")
    .replace(/CF_API_TOKEN[_A-Za-z0-9-]*/g, "[redacted]")
    .replace(/(^|[\s(])\/(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+/g, "$1<path>");
}

export function allowlistedWorkspaceOperationAuthorizationUrl(
  url: string,
  provider: "alchemy" | "cloudflare",
): string {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Workspace operation authorization URL is invalid.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Workspace operation authorization URL must use HTTPS.");
  }

  for (const key of parsed.searchParams.keys()) {
    const normalized = key.toLowerCase().replaceAll(/[-_]/g, "");

    if (
      normalized.includes("token") ||
      normalized.includes("secret") ||
      normalized.includes("password") ||
      normalized.includes("apikey")
    ) {
      throw new Error("Workspace operation authorization URL includes secret-looking parameters.");
    }
  }

  const hostname = parsed.hostname.toLowerCase();
  const authorizationPath = /(?:authorize|authorization|oauth|login)/i.test(parsed.pathname);

  if (provider === "cloudflare") {
    if (hostname === "dash.cloudflare.com" && authorizationPath) {
      return parsed.toString();
    }
  } else if (
    (hostname === "alchemy.com" ||
      hostname.endsWith(".alchemy.com") ||
      hostname === "alchemy.run" ||
      hostname.endsWith(".alchemy.run")) &&
    authorizationPath
  ) {
    return parsed.toString();
  }

  throw new Error("Workspace operation authorization URL is not allowlisted.");
}

function isForbiddenDisplayKey(key: string): boolean {
  const normalized = key.toLowerCase().replaceAll(/[-_]/g, "");

  if (normalized === "credentialref") {
    return false;
  }

  return (
    normalized === "secret" ||
    normalized === "secrets" ||
    normalized.endsWith("token") ||
    normalized.endsWith("password") ||
    normalized.includes("apikey") ||
    normalized.includes("credential") ||
    normalized === "leasetoken" ||
    normalized.includes("providerstate") ||
    normalized.startsWith("raw")
  );
}

function isAllowlistedOwnerSetupUrlDisplayValue(key: string, value: string): boolean {
  const normalizedKey = key.toLowerCase().replaceAll(/[-_]/g, "");

  if (normalizedKey !== "ownersetupurl") {
    return false;
  }

  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.pathname !== "/setup" ||
    !parsed.hostname.toLowerCase().endsWith(".workers.dev")
  ) {
    return false;
  }

  const keys = [...parsed.searchParams.keys()];

  return keys.length === 1 && keys[0] === "token" && Boolean(parsed.searchParams.get("token"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isWorkspaceAutoSaveDisplayState(value: unknown): boolean {
  return (
    value === "clean" ||
    value === "dirty" ||
    value === "failed" ||
    value === "queued" ||
    value === "saved" ||
    value === "saving"
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
