import type {
  ApplicationSystemStateActionContract,
  ApplicationSystemStateActionPurpose,
  ApplicationSystemStateContract,
  ApplicationSystemStateIntent,
  ApplicationSystemStateKind,
  CompactStatusIntent,
} from "@dpeek/formless-presentation/contract";

export type ApplicationSystemStateProjectionInput = {
  accessibilityLabel?: string;
  actions?: readonly {
    accessibilityLabel?: string;
    id: string;
    label: string;
    prominence?: "primary" | "quiet" | "secondary";
    purpose: ApplicationSystemStateActionPurpose;
  }[];
  facts?: readonly { id: string; label: string; value: string }[];
  feedback?: {
    detail?: string;
    id: string;
    intent: CompactStatusIntent;
    title: string;
  };
  heading: string;
  id: string;
  message: string;
  state: ApplicationSystemStateKind;
};

export type ResolvedApplicationSystemStateIntent =
  | { action: ApplicationSystemStateActionContract; kind: "action" }
  | { kind: "ignored" };

export function projectApplicationSystemState(
  input: ApplicationSystemStateProjectionInput,
): ApplicationSystemStateContract {
  return {
    accessibilityLabel: input.accessibilityLabel ?? input.heading,
    actions: (input.actions ?? []).map((action) => applicationSystemStateAction(input.id, action)),
    facts: (input.facts ?? []).map((fact) => ({
      id: fact.id,
      kind: "applicationSystemStateFact" as const,
      label: fact.label,
      value: fact.value,
    })),
    ...(input.feedback
      ? {
          feedback: {
            ...(input.feedback.detail === undefined ? {} : { detail: input.feedback.detail }),
            id: input.feedback.id,
            intent: input.feedback.intent,
            kind: "applicationSystemStateFeedback" as const,
            title: input.feedback.title,
          },
        }
      : {}),
    heading: input.heading,
    id: input.id,
    kind: "applicationSystemState",
    message: input.message,
    state: input.state,
  };
}

export function resolveApplicationSystemStateIntent(
  snapshot: ApplicationSystemStateContract,
  intent: ApplicationSystemStateIntent,
): ResolvedApplicationSystemStateIntent {
  if (intent.stateId !== snapshot.id) {
    return { kind: "ignored" };
  }

  const action = snapshot.actions.find(
    (candidate) =>
      candidate.id === intent.actionId &&
      candidate.control.id === intent.controlId &&
      candidate.intent.stateId === intent.stateId &&
      candidate.intent.actionId === intent.actionId &&
      candidate.intent.controlId === intent.controlId,
  );

  return action && !action.control.disabled && !action.control.pending
    ? { action, kind: "action" }
    : { kind: "ignored" };
}

function applicationSystemStateAction(
  stateId: string,
  input: NonNullable<ApplicationSystemStateProjectionInput["actions"]>[number],
): ApplicationSystemStateActionContract {
  const controlId = `control:${input.id}`;

  return {
    control: {
      accessibilityLabel: input.accessibilityLabel ?? input.label,
      content: { kind: "label", label: input.label },
      density: "default",
      id: controlId,
      kind: "button",
      prominence: input.prominence ?? "primary",
      type: "button",
    },
    id: input.id,
    intent: {
      actionId: input.id,
      controlId,
      stateId,
      type: "applicationSystemStateAction",
    },
    kind: "applicationSystemStateAction",
    purpose: input.purpose,
  };
}
