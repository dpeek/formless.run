import {
  WORKSPACE_AUTO_SAVE_WRITE_SOURCES,
  WORKSPACE_OPERATION_DEFINITIONS,
  WORKSPACE_OPERATION_EXECUTION_REQUIREMENTS,
  WORKSPACE_OPERATION_KINDS,
} from "./types.ts";
import type {
  WorkspaceAutoSaveWriteSource,
  WorkspaceOperationActor,
  WorkspaceOperationActorPolicy,
  WorkspaceOperationDefinition,
  WorkspaceOperationExecutionDecision,
  WorkspaceOperationExecutionRequirement,
  WorkspaceOperationKind,
  WorkspaceOperationMode,
  WorkspaceOperationRequiredCapability,
} from "./types.ts";

type WorkspaceOperationExecutionInput = {
  dryRun?: boolean;
  includeDeploymentStatus?: boolean;
  kind: WorkspaceOperationKind;
  targetAlias?: string | null;
};

const workspaceOperationKindSet = new Set<string>(WORKSPACE_OPERATION_KINDS);
const workspaceOperationExecutionRequirementSet = new Set<string>(
  WORKSPACE_OPERATION_EXECUTION_REQUIREMENTS,
);
const workspaceAutoSaveWriteSourceSet = new Set<string>(WORKSPACE_AUTO_SAVE_WRITE_SOURCES);
const workspaceOperationDefinitionsByKind = new Map<
  WorkspaceOperationKind,
  WorkspaceOperationDefinition
>(WORKSPACE_OPERATION_DEFINITIONS.map((definition) => [definition.kind, definition]));

export function isWorkspaceOperationKind(value: unknown): value is WorkspaceOperationKind {
  return typeof value === "string" && workspaceOperationKindSet.has(value);
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

export function workspaceOperationDefinitionForKind<TKind extends WorkspaceOperationKind>(
  kind: TKind,
): Extract<WorkspaceOperationDefinition, { readonly kind: TKind }> {
  const definition = workspaceOperationDefinitionsByKind.get(kind);

  if (!definition) {
    throw new Error(`Workspace operation "${kind}" is not defined.`);
  }

  return definition as Extract<WorkspaceOperationDefinition, { readonly kind: TKind }>;
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
  input: WorkspaceOperationExecutionInput,
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
    case "push":
      return input.dryRun === true
        ? baseRequirements
        : workspaceOperationExecutionRequirementsWith(baseRequirements, [
            "admin-token",
            "provider-credentials",
            "workspace-source-write",
          ]);
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

export function assertWorkspaceOperationExecutionRequirements(
  input: WorkspaceOperationExecutionInput,
  executionRequirements = workspaceOperationEffectiveExecutionRequirements(input),
): void {
  if (
    !sameWorkspaceOperationExecutionRequirements(
      workspaceOperationEffectiveExecutionRequirements(input),
      executionRequirements,
    )
  ) {
    throw new Error(`Workspace operation "${input.kind}" execution requirements are invalid.`);
  }
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

function workspaceOperationInputHasTargetAlias(input: WorkspaceOperationExecutionInput): boolean {
  return typeof input.targetAlias === "string" && input.targetAlias.trim() !== "";
}

function sameWorkspaceOperationExecutionRequirements(
  left: readonly WorkspaceOperationExecutionRequirement[],
  right: readonly WorkspaceOperationExecutionRequirement[],
): boolean {
  return (
    left.length === right.length && left.every((requirement, index) => right[index] === requirement)
  );
}
