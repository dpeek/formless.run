import { isSyncSocketAttachment } from "../shared/protocol.ts";

export const PROGRAM_SYNC_SOCKET_RENEWAL_CLOSE_CODE = 4001;
export const PROGRAM_SYNC_SOCKET_RENEWAL_MAX_DELAY_MS = 5 * 60 * 1000;

const PROGRAM_SYNC_SOCKET_RENEWAL_MIN_DELAY_RATIO = 0.8;

type ProgramSyncRenewalSocket = Pick<WebSocket, "close" | "deserializeAttachment">;

export function enforceProgramSyncSocketRenewal(
  sockets: ProgramSyncRenewalSocket[],
  now = Date.now(),
): number | undefined {
  let nextExpiry: number | undefined;

  for (const socket of sockets) {
    const attachment = syncSocketAttachment(socket);

    if (!attachment) {
      closeSyncSocket(socket, 1008, "Program invalidation socket renewal state is invalid.");
      continue;
    }

    if (attachment.expiresAt <= now) {
      closeSyncSocket(
        socket,
        PROGRAM_SYNC_SOCKET_RENEWAL_CLOSE_CODE,
        "Program invalidation renewal required.",
      );
      continue;
    }

    nextExpiry = Math.min(nextExpiry ?? attachment.expiresAt, attachment.expiresAt);
  }

  return nextExpiry;
}

export function randomizedProgramSyncSocketExpiry(now = Date.now(), random = Math.random): number {
  const minimumDelay = Math.floor(
    PROGRAM_SYNC_SOCKET_RENEWAL_MAX_DELAY_MS * PROGRAM_SYNC_SOCKET_RENEWAL_MIN_DELAY_RATIO,
  );
  const randomizedDelay =
    minimumDelay +
    Math.floor(
      boundedRandomSample(random()) * (PROGRAM_SYNC_SOCKET_RENEWAL_MAX_DELAY_MS - minimumDelay + 1),
    );

  return now + randomizedDelay;
}

function syncSocketAttachment(socket: ProgramSyncRenewalSocket) {
  try {
    const attachment: unknown = socket.deserializeAttachment();

    return isSyncSocketAttachment(attachment) ? attachment : undefined;
  } catch {
    return undefined;
  }
}

function closeSyncSocket(socket: ProgramSyncRenewalSocket, code: number, reason: string) {
  try {
    socket.close(code, reason);
  } catch {
    // The socket is already closing or closed.
  }
}

function boundedRandomSample(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(value, 0), 1 - Number.EPSILON);
}
