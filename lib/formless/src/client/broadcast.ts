import {
  programStorageIdentityForClientTarget,
  type ProgramClientTarget,
} from "./program-target.ts";

export type BroadcastEventType =
  | "records-updated"
  | "cursor-updated"
  | "schema-updated"
  | "sync-requested";

export type BroadcastEvent = {
  type: BroadcastEventType;
};

export function publishClientEvent(target: ProgramClientTarget, type: BroadcastEventType) {
  const channel = createChannel(target);

  if (!channel) {
    return;
  }

  channel.postMessage({ type } satisfies BroadcastEvent);
  channel.close();
}

export function listenForClientEvents(
  target: ProgramClientTarget,
  listener: (event: BroadcastEvent) => void,
) {
  const channel = createChannel(target);

  if (!channel) {
    return () => {};
  }

  channel.onmessage = (message) => {
    const event = message.data as unknown;

    if (isBroadcastEvent(event)) {
      listener(event);
    }
  };

  return () => channel.close();
}

function createChannel(target: ProgramClientTarget) {
  if (typeof BroadcastChannel === "undefined") {
    return undefined;
  }

  return new BroadcastChannel(channelName(target));
}

export function channelName(target: ProgramClientTarget) {
  return programStorageIdentityForClientTarget(target).broadcastChannelName;
}

function isBroadcastEvent(value: unknown): value is BroadcastEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "type" in value &&
    (value.type === "records-updated" ||
      value.type === "cursor-updated" ||
      value.type === "schema-updated" ||
      value.type === "sync-requested")
  );
}
