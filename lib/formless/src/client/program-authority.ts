import { channelName } from "./broadcast.ts";

export type ProgramAuthorityInvalidationReason =
  | "cross-tab"
  | "focus-recovery"
  | "logout"
  | "protected-rejection"
  | "push-policy-violation"
  | "replica-authority-change"
  | "session-expiry";

type ProgramAuthorityInvalidationListener = (reason: ProgramAuthorityInvalidationReason) => void;

const listeners = new Set<ProgramAuthorityInvalidationListener>();
let invalidationChannel: BroadcastChannel | undefined;

export function invalidateProgramAuthority(reason: ProgramAuthorityInvalidationReason): void {
  notifyListeners(reason);

  const channel = invalidationChannel ?? createInvalidationChannel();

  if (!channel) {
    return;
  }

  channel.postMessage({ type: "program-authority-invalidated" });

  if (channel !== invalidationChannel) {
    channel.close();
  }
}

export function invalidateProgramAuthorityForProtectedResponse(response: Response): void {
  if (response.status === 401 || response.status === 403) {
    invalidateProgramAuthority("protected-rejection");
  }
}

export function listenForProgramAuthorityInvalidation(
  listener: ProgramAuthorityInvalidationListener,
): () => void {
  listeners.add(listener);
  ensureInvalidationChannel();

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0) {
      invalidationChannel?.close();
      invalidationChannel = undefined;
    }
  };
}

function ensureInvalidationChannel(): void {
  if (invalidationChannel || typeof BroadcastChannel === "undefined") {
    return;
  }

  invalidationChannel = createInvalidationChannel();
  if (invalidationChannel) {
    invalidationChannel.onmessage = (message) => {
      if (isProgramAuthorityInvalidationMessage(message.data)) {
        notifyListeners("cross-tab");
      }
    };
  }
}

function createInvalidationChannel(): BroadcastChannel | undefined {
  return typeof BroadcastChannel === "undefined"
    ? undefined
    : new BroadcastChannel(`${channelName()}:authority`);
}

function notifyListeners(reason: ProgramAuthorityInvalidationReason): void {
  for (const listener of listeners) {
    listener(reason);
  }
}

function isProgramAuthorityInvalidationMessage(
  value: unknown,
): value is { type: "program-authority-invalidated" } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "type" in value &&
    value.type === "program-authority-invalidated"
  );
}
