import {
  WORKSPACE_GATEWAY_PUSH_PHASE_IDS,
  assertWorkspaceGatewayAuthorizationUrl,
  isWorkspaceGatewayAccountChoice,
  type WorkspaceGatewayAccountChoice,
  type WorkspaceGatewayActorFacts,
  type WorkspaceGatewayErrorCode,
  type WorkspaceGatewayPush,
  type WorkspaceGatewayPushExecutionResult,
  type WorkspaceGatewayPushFailureCode,
  type WorkspaceGatewayPushHandler,
  type WorkspaceGatewayPushPhase,
  type WorkspaceGatewayPushPhaseId,
  type WorkspaceGatewayPushPhaseObserver,
  type WorkspaceGatewayPushPhaseStatus,
  type WorkspaceGatewayPushStartInput,
} from "./index.ts";

const INTERACTION_TTL_MS = 5 * 60 * 1000;

export class WorkspaceGatewayRegistryError extends Error {
  readonly code: WorkspaceGatewayErrorCode;

  constructor(code: WorkspaceGatewayErrorCode) {
    super(code);
    this.name = "WorkspaceGatewayRegistryError";
    this.code = code;
  }
}

export class WorkspaceGatewayPushExecutionError extends Error {
  readonly code: WorkspaceGatewayPushFailureCode;
  readonly phase: WorkspaceGatewayPushPhaseId;

  constructor(
    code: WorkspaceGatewayPushFailureCode,
    phase: WorkspaceGatewayPushPhaseId,
    options: ErrorOptions = {},
  ) {
    super(code, options);
    this.name = "WorkspaceGatewayPushExecutionError";
    this.code = code;
    this.phase = phase;
  }
}

export type WorkspaceGatewayPushRegistry = {
  current(): WorkspaceGatewayPush | null;
  latest(): WorkspaceGatewayPush | null;
  read(pushId: string): WorkspaceGatewayPush | undefined;
  start(input: {
    authorization: WorkspaceGatewayActorFacts;
    push: WorkspaceGatewayPushStartInput;
    workspaceRoot: string;
  }): WorkspaceGatewayPush;
  submitAccountSelection(input: {
    accountId: string;
    interactionId: string;
    pushId: string;
  }): WorkspaceGatewayPush;
};

export type WorkspaceGatewayPushRegistryDependencies = {
  createInteractionId?: () => string;
  createPushId?: () => string;
  executePush: WorkspaceGatewayPushHandler;
  now?: () => string;
  queue?: (callback: () => void) => void;
  schedule?: (callback: () => void, milliseconds: number) => { cancel(): void };
};

type PendingInteraction = {
  cancelExpiry: () => void;
  id: string;
  reject?: (error: WorkspaceGatewayRegistryError) => void;
  resolve?: (accountId: string) => void;
};

export function createWorkspaceGatewayPushRegistry(
  dependencies: WorkspaceGatewayPushRegistryDependencies,
): WorkspaceGatewayPushRegistry {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const createPushId = dependencies.createPushId ?? (() => `push_${randomId()}`);
  const createInteractionId =
    dependencies.createInteractionId ?? (() => `interaction_${randomId()}`);
  const queue = dependencies.queue ?? queueMicrotask;
  const schedule = dependencies.schedule ?? defaultSchedule;
  let current: WorkspaceGatewayPush | null = null;
  let latest: WorkspaceGatewayPush | null = null;
  let pendingInteraction: PendingInteraction | undefined;

  return { current: () => current, latest: () => latest, read, start, submitAccountSelection };

  function read(pushId: string): WorkspaceGatewayPush | undefined {
    if (current?.id === pushId) return current;
    if (latest?.id === pushId) return latest;
    return undefined;
  }

  function start(input: {
    authorization: WorkspaceGatewayActorFacts;
    push: WorkspaceGatewayPushStartInput;
    workspaceRoot: string;
  }): WorkspaceGatewayPush {
    if (current !== null) throw new WorkspaceGatewayRegistryError("push-active");
    const timestamp = now();
    const push: WorkspaceGatewayPush = {
      createdAt: timestamp,
      id: createPushId(),
      lifecycle: "queued",
      mode: input.push.mode,
      phases: WORKSPACE_GATEWAY_PUSH_PHASE_IDS.map((id) => ({ id, status: "pending" })),
      ...(input.push.targetAlias === undefined ? {} : { targetAlias: input.push.targetAlias }),
      updatedAt: timestamp,
    };
    current = push;
    queue(() => void execute(input, push.id));
    return push;
  }

  async function execute(
    input: {
      authorization: WorkspaceGatewayActorFacts;
      push: WorkspaceGatewayPushStartInput;
      workspaceRoot: string;
    },
    pushId: string,
  ): Promise<void> {
    if (current?.id !== pushId) return;
    current = { ...current, lifecycle: "running", updatedAt: now() };
    const observer = createObserver(pushId);

    try {
      const result = await dependencies.executePush({
        authorization: input.authorization,
        observer,
        push: input.push,
        workspaceRoot: input.workspaceRoot,
      });
      if (current?.id !== pushId) return;
      assertPushCanSucceed(current, result);
      finish({ ...current, lifecycle: "succeeded", outcome: result.outcome, updatedAt: now() });
    } catch (error) {
      if (current?.id !== pushId) return;
      const failure =
        error instanceof WorkspaceGatewayPushExecutionError
          ? error
          : new WorkspaceGatewayPushExecutionError("internal-failure", activeOrNextPhase(current), {
              cause: error,
            });
      failCurrent(failure.phase, failure.code);
    }
  }

  function submitAccountSelection(input: {
    accountId: string;
    interactionId: string;
    pushId: string;
  }): WorkspaceGatewayPush {
    if (current?.id !== input.pushId) {
      if (
        latest?.id === input.pushId &&
        latest.lifecycle === "failed" &&
        latest.failureCode === "interaction-expired"
      ) {
        throw new WorkspaceGatewayRegistryError("interaction-expired");
      }
      throw new WorkspaceGatewayRegistryError("push-not-found");
    }
    const interaction =
      current.lifecycle === "waiting-for-interaction" ? current.interaction : undefined;
    if (!interaction || interaction.id !== input.interactionId) {
      throw new WorkspaceGatewayRegistryError("interaction-not-found");
    }
    if (Date.parse(interaction.expiresAt) <= Date.parse(now())) {
      expireInteraction(input.pushId, input.interactionId);
      throw new WorkspaceGatewayRegistryError("interaction-expired");
    }
    if (
      interaction.kind !== "account-selection" ||
      !interaction.choices.some((choice) => choice.id === input.accountId)
    ) {
      throw new WorkspaceGatewayRegistryError("interaction-invalid");
    }
    const continuation = pendingInteraction;
    if (!continuation || continuation.id !== interaction.id || !continuation.resolve) {
      throw new WorkspaceGatewayRegistryError("interaction-not-found");
    }
    continuation.cancelExpiry();
    pendingInteraction = undefined;
    current = withoutInteraction(current, now());
    continuation.resolve(input.accountId);
    return current;
  }

  function createObserver(pushId: string): WorkspaceGatewayPushPhaseObserver {
    return {
      fail(phase, code): never {
        throw new WorkspaceGatewayPushExecutionError(code, phase);
      },
      requestAccountSelection(choices) {
        const boundedChoices = validateAccountChoices(choices);
        return new Promise<string>((resolve, reject) => {
          const interactionId = createInteractionId();
          setInteraction(pushId, {
            choices: boundedChoices,
            expiresAt: expiresAt(now()),
            id: interactionId,
            kind: "account-selection",
            provider: "cloudflare",
          });
          const timer = schedule(
            () => expireInteraction(pushId, interactionId),
            INTERACTION_TTL_MS,
          );
          pendingInteraction = {
            cancelExpiry: () => timer.cancel(),
            id: interactionId,
            reject,
            resolve,
          };
        });
      },
      setExternalAuthorization(url) {
        assertWorkspaceGatewayAuthorizationUrl(url);
        const interactionId = createInteractionId();
        setInteraction(pushId, {
          expiresAt: expiresAt(now()),
          id: interactionId,
          kind: "external-authorization",
          provider: "cloudflare",
          url,
        });
        const timer = schedule(() => expireInteraction(pushId, interactionId), INTERACTION_TTL_MS);
        pendingInteraction = { cancelExpiry: () => timer.cancel(), id: interactionId };
        return interactionId;
      },
      skip: (phase) => updatePhase(pushId, phase, "skipped"),
      start: (phase) => updatePhase(pushId, phase, "running"),
      succeed: (phase) => updatePhase(pushId, phase, "succeeded"),
    };
  }

  function updatePhase(
    pushId: string,
    phaseId: WorkspaceGatewayPushPhaseId,
    status: Exclude<WorkspaceGatewayPushPhaseStatus, "failed" | "pending">,
  ): void {
    const push = requireCurrent(pushId);
    const index = WORKSPACE_GATEWAY_PUSH_PHASE_IDS.indexOf(phaseId);
    const phase = push.phases[index];
    if (!phase) throw new WorkspaceGatewayPushExecutionError("internal-failure", phaseId);
    const priorComplete = push.phases
      .slice(0, index)
      .every((candidate) => candidate.status === "succeeded" || candidate.status === "skipped");
    const valid =
      status === "running"
        ? phase.status === "pending" &&
          priorComplete &&
          !push.phases.some((p) => p.status === "running")
        : status === "skipped"
          ? phase.status === "pending" && priorComplete
          : phase.status === "running";
    if (!valid) throw new WorkspaceGatewayPushExecutionError("internal-failure", phaseId);
    resumeFromInteraction();
    const phases = push.phases.map((candidate) =>
      candidate.id === phaseId ? { id: candidate.id, status } : candidate,
    ) as readonly WorkspaceGatewayPushPhase[];
    current = {
      ...withoutInteraction(requireCurrent(pushId), now()),
      lifecycle: "running",
      phases,
      updatedAt: now(),
    };
  }

  function setInteraction(
    pushId: string,
    interaction: Extract<
      WorkspaceGatewayPush,
      { lifecycle: "waiting-for-interaction" }
    >["interaction"],
  ): void {
    const push = requireCurrent(pushId);
    if (
      pendingInteraction !== undefined ||
      !push.phases.some((phase) => phase.status === "running")
    ) {
      throw new WorkspaceGatewayPushExecutionError("internal-failure", activeOrNextPhase(push));
    }
    current = { ...push, interaction, lifecycle: "waiting-for-interaction", updatedAt: now() };
  }

  function resumeFromInteraction(): void {
    if (!pendingInteraction) return;
    pendingInteraction.cancelExpiry();
    pendingInteraction = undefined;
  }

  function expireInteraction(pushId: string, interactionId: string): void {
    if (
      current?.id !== pushId ||
      current.lifecycle !== "waiting-for-interaction" ||
      current.interaction.id !== interactionId
    ) {
      return;
    }
    const phase = activeOrNextPhase(current);
    const failureCode =
      current.interaction.kind === "external-authorization"
        ? "authorization-expired"
        : "interaction-expired";
    const continuation = pendingInteraction;
    pendingInteraction = undefined;
    continuation?.cancelExpiry();
    continuation?.reject?.(new WorkspaceGatewayRegistryError("interaction-expired"));
    failCurrent(phase, failureCode);
  }

  function failCurrent(
    phaseId: WorkspaceGatewayPushPhaseId,
    failureCode: WorkspaceGatewayPushFailureCode,
  ): void {
    if (!current) return;
    const phases = current.phases.map((phase) =>
      phase.id === phaseId ? { id: phase.id, status: "failed" as const } : phase,
    );
    finish({
      ...withoutInteraction(current, now()),
      failedPhase: phaseId,
      failureCode,
      lifecycle: "failed",
      phases,
      updatedAt: now(),
    });
  }

  function finish(push: WorkspaceGatewayPush): void {
    pendingInteraction?.cancelExpiry();
    pendingInteraction = undefined;
    latest = push;
    current = null;
  }

  function requireCurrent(pushId: string): WorkspaceGatewayPush {
    if (current?.id !== pushId) {
      throw new WorkspaceGatewayPushExecutionError("internal-failure", "credentials");
    }
    return current;
  }
}

function assertPushCanSucceed(
  push: WorkspaceGatewayPush,
  result: WorkspaceGatewayPushExecutionResult,
): void {
  if (
    push.lifecycle === "waiting-for-interaction" ||
    !push.phases.every((phase) => phase.status === "succeeded" || phase.status === "skipped") ||
    (result.outcome === "planned" && push.mode !== "dry-run") ||
    (result.outcome === "applied" && push.mode !== "apply")
  ) {
    throw new WorkspaceGatewayPushExecutionError("internal-failure", activeOrNextPhase(push));
  }
}

function validateAccountChoices(
  choices: readonly WorkspaceGatewayAccountChoice[],
): readonly WorkspaceGatewayAccountChoice[] {
  if (
    choices.length === 0 ||
    choices.length > 100 ||
    !choices.every(isWorkspaceGatewayAccountChoice) ||
    new Set(choices.map((choice) => choice.id)).size !== choices.length
  ) {
    throw new WorkspaceGatewayPushExecutionError("account-discovery-failed", "account-selection");
  }
  return choices.map((choice) => ({ ...choice }));
}

function activeOrNextPhase(push: WorkspaceGatewayPush): WorkspaceGatewayPushPhaseId {
  return (
    push.phases.find((phase) => phase.status === "running") ??
    push.phases.find((phase) => phase.status === "pending") ??
    push.phases.at(-1)!
  ).id;
}

function withoutInteraction(push: WorkspaceGatewayPush, updatedAt: string): WorkspaceGatewayPush {
  const { interaction: _interaction, ...rest } = push as WorkspaceGatewayPush & {
    interaction?: unknown;
  };
  return { ...rest, lifecycle: "running", updatedAt } as WorkspaceGatewayPush;
}

function expiresAt(now: string): string {
  return new Date(Date.parse(now) + INTERACTION_TTL_MS).toISOString();
}

function randomId(): string {
  return globalThis.crypto.randomUUID().replaceAll("-", "_");
}

function defaultSchedule(callback: () => void, milliseconds: number): { cancel(): void } {
  const timer = setTimeout(callback, milliseconds);
  timer.unref?.();
  return { cancel: () => clearTimeout(timer) };
}
