import { FORMLESS_PROGRAM_BROWSER_STORAGE_NAME } from "../program/target.ts";

export type BroadcastEventType =
  | "records-updated"
  | "cursor-updated"
  | "schema-updated"
  | "sync-requested";

export type BroadcastEvent = {
  type: BroadcastEventType;
};

export function publishClientEvent(type: BroadcastEventType) {
  const channel = createChannel();

  if (!channel) {
    return;
  }

  channel.postMessage({ type } satisfies BroadcastEvent);
  channel.close();
}

export function listenForClientEvents(listener: (event: BroadcastEvent) => void) {
  const channel = createChannel();

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

function createChannel() {
  if (typeof BroadcastChannel === "undefined") {
    return undefined;
  }

  return new BroadcastChannel(channelName());
}

export function channelName() {
  return FORMLESS_PROGRAM_BROWSER_STORAGE_NAME;
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
