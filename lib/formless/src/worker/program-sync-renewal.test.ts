import { describe, expect, it } from "vite-plus/test";

import {
  enforceProgramSyncSocketRenewal,
  PROGRAM_SYNC_SOCKET_RENEWAL_CLOSE_CODE,
  PROGRAM_SYNC_SOCKET_RENEWAL_MAX_DELAY_MS,
  randomizedProgramSyncSocketExpiry,
} from "./program-sync-renewal.ts";

describe("Program sync socket renewal", () => {
  it("restores expiry-only hibernation state and schedules the earliest future expiry", () => {
    const expired = renewalSocket({ expiresAt: 999 });
    const later = renewalSocket({ expiresAt: 1_200 });
    const earlier = renewalSocket({ expiresAt: 1_100 });
    const malformed = renewalSocket({ expiresAt: 1_300, cursor: 1 });

    expect(enforceProgramSyncSocketRenewal([expired, later, earlier, malformed], 1_000)).toBe(
      1_100,
    );
    expect(expired.closes).toEqual([
      {
        code: PROGRAM_SYNC_SOCKET_RENEWAL_CLOSE_CODE,
        reason: "Program invalidation renewal required.",
      },
    ]);
    expect(later.closes).toEqual([]);
    expect(earlier.closes).toEqual([]);
    expect(malformed.closes).toEqual([
      {
        code: 1008,
        reason: "Program invalidation socket renewal state is invalid.",
      },
    ]);
  });

  it("randomizes renewal without exceeding five minutes after admission", () => {
    const admittedAt = 1_777_777_777_777;

    expect(randomizedProgramSyncSocketExpiry(admittedAt, () => 0)).toBe(
      admittedAt + PROGRAM_SYNC_SOCKET_RENEWAL_MAX_DELAY_MS * 0.8,
    );
    expect(randomizedProgramSyncSocketExpiry(admittedAt, () => 1)).toBe(
      admittedAt + PROGRAM_SYNC_SOCKET_RENEWAL_MAX_DELAY_MS,
    );
    expect(randomizedProgramSyncSocketExpiry(admittedAt, () => Number.NaN)).toBe(
      admittedAt + PROGRAM_SYNC_SOCKET_RENEWAL_MAX_DELAY_MS * 0.8,
    );
  });
});

function renewalSocket(attachment: unknown) {
  const closes: Array<{ code: number; reason: string }> = [];

  return {
    closes,
    close(code: number, reason: string) {
      closes.push({ code, reason });
    },
    deserializeAttachment() {
      return attachment;
    },
  };
}
